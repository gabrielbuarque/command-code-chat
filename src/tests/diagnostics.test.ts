import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import { runWrapperDiagnostics } from "../diagnostics";

test("runWrapperDiagnostics reporta checks saudáveis com mock de CLI", async () => {
  const report = await runWrapperDiagnostics({
    userText: "diagnose",
    mode: "plan",
    selectedModel: "kimi-k2.5",
    workspaceRoot: "/repo",
    chips: [{ id: "c1", type: "workspace", label: "Workspace", detail: "/repo" }],
    chatHistory: [],
    config: { includeOpenFile: true, includeSelection: true, historyTurns: 8, maxContextFileKb: 120 },
    activeFilePath: "/repo/src/index.ts",
    activeSelection: "const x = 1;",
    gitInfo: "branch: main",
    fs: {
      existsSync: fs.existsSync,
      statSync: fs.statSync,
      readFileSync: fs.readFileSync as unknown as (path: string, encoding: "utf-8") => string,
      readFolderTree: () => "src",
    },
    cliStatus: async () => ({ ok: true, details: "status ok" }),
  });

  assert.equal(report.ok, true);
  assert.ok(report.checks.some(check => check.id === "parser" && check.ok));
  assert.ok(report.checks.some(check => check.id === "cli-status" && check.ok));
});