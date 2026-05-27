import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { runWrapperDiagnostics } from "../out/diagnostics.js";

function readFolderTree(dir, maxDepth, depth = 0) {
  if (depth > maxDepth) return "";
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return "(permission denied)";
  }
  const lines = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      lines.push("  ".repeat(depth) + entry.name + "/");
      lines.push(readFolderTree(full, maxDepth, depth + 1));
    } else {
      lines.push("  ".repeat(depth) + entry.name);
    }
    if (lines.length > 100) break;
  }
  return lines.join("\n");
}

const commandPath = process.env.COMMAND_CODE_PATH || "command-code";
const model = process.env.COMMAND_CODE_MODEL || "kimi-k2.5";
const status = spawnSync(commandPath, ["status"], { encoding: "utf8", env: process.env });

const report = await runWrapperDiagnostics({
  userText: "diagnose wrapper",
  mode: "plan",
  selectedModel: model,
  workspaceRoot: process.cwd(),
  chips: [],
  chatHistory: [],
  config: { includeOpenFile: true, includeSelection: true, historyTurns: 8, maxContextFileKb: 120 },
  fs: {
    existsSync: fs.existsSync,
    statSync: fs.statSync,
    readFileSync: fs.readFileSync,
    readFolderTree,
  },
  cliStatus: async () => ({
    ok: status.status === 0,
    details: (status.stdout || status.stderr || `exit ${status.status ?? "null"}`).trim(),
  }),
});

console.log(JSON.stringify(report, null, 2));
process.exitCode = report.ok ? 0 : 1;