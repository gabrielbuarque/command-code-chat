import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ChatMessage, ContextChip } from "./types";
import { buildPromptCore } from "./promptBuilderCore";

export function readFolderTree(dir: string, maxDepth: number, depth = 0): string {
  if (depth > maxDepth) return "";
  const lines: string[] = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return "(permission denied)";
  }
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      lines.push("  ".repeat(depth) + e.name + "/");
      lines.push(readFolderTree(full, maxDepth, depth + 1));
    } else {
      lines.push("  ".repeat(depth) + e.name);
    }
    if (lines.length > 100) break;
  }
  return lines.join("\n");
}

export function getGitInfo(): string {
  try {
    const gitExt = vscode.extensions.getExtension("vscode.git");
    if (!gitExt || !gitExt.isActive) return "";
    const api = gitExt.exports.getAPI(1);
    const repo = api.repositories?.[0];
    if (!repo) return "";
    const branch = repo.state.HEAD?.name || "(detached)";
    const changes = repo.state.workingTreeChanges || [];
    const staged = repo.state.indexChanges || [];
    const lines = ["branch: " + branch];
    if (staged.length > 0) lines.push("staged: " + staged.map((c: any) => path.basename(c.uri.fsPath)).join(", "));
    if (changes.length > 0) lines.push("changed: " + changes.map((c: any) => path.basename(c.uri.fsPath)).join(", "));
    return lines.join("\n");
  } catch {
    return "";
  }
}

export function buildPrompt(
  userText: string,
  mode: string,
  selectedModel: string | undefined,
  workspaceRoot: string | undefined,
  chips: ContextChip[],
  chatHistory: ChatMessage[],
  config: vscode.WorkspaceConfiguration,
  activeFilePath?: string,
  activeSelection?: string,
): string {
  return buildPromptCore({
    userText,
    mode,
    selectedModel,
    workspaceRoot,
    chips,
    chatHistory,
    config: {
      includeOpenFile: config.get("includeOpenFile", true),
      includeSelection: config.get("includeSelection", true),
      historyTurns: config.get("historyTurns", 8),
      maxContextFileKb: config.get("maxContextFileKb", 120),
    },
    activeFilePath,
    activeSelection,
    gitInfo: getGitInfo(),
    fs: {
      existsSync: fs.existsSync,
      statSync: fs.statSync,
      readFileSync: fs.readFileSync as unknown as (path: string, encoding: "utf-8") => string,
      readFolderTree,
    },
  });
}
