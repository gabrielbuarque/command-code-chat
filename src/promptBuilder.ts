import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ChatMessage, ContextChip } from "./types";

function escXmlAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

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
  workspaceRoot: string | undefined,
  chips: ContextChip[],
  chatHistory: ChatMessage[],
  config: vscode.WorkspaceConfiguration,
  activeFilePath?: string,
  activeSelection?: string,
): string {
  const parts: string[] = [];

  parts.push("You are Command Code running inside a VS Code chat wrapper. Answer concisely.");

  if (workspaceRoot) parts.push("Workspace root: " + workspaceRoot);
  parts.push("Permission mode: " + mode);

  if (activeFilePath && config.get("includeOpenFile", true)) {
    parts.push("Active file: " + activeFilePath);
    if (activeSelection && config.get("includeSelection", true)) {
      parts.push("Selected code:\n```\n" + activeSelection + "\n```");
    }
  }

  for (const chip of chips) {
    switch (chip.type) {
      case "file":
      case "current-file":
      case "folder": {
        const fp = chip.fsPath || chip.detail;
        if (fp && fs.existsSync(fp)) {
          const stat = fs.statSync(fp);
          const maxKb = config.get("maxContextFileKb", 120);
          if (stat.isFile()) {
            if (stat.size > maxKb * 1024) {
              parts.push('<context_file path="' + escXmlAttr(chip.detail) + '" warning="too large (' + Math.round(stat.size / 1024) + ' KB)"/>');
            } else {
              const content = chip.data ?? fs.readFileSync(fp, "utf-8");
              parts.push('<context_file path="' + escXmlAttr(chip.detail || chip.fsPath || chip.label) + '">\n' + content + "\n</context_file>");
            }
          } else if (stat.isDirectory()) {
            const tree = chip.data ?? readFolderTree(fp, 2);
            parts.push('<context_folder path="' + escXmlAttr(chip.detail) + '">\n' + tree + "\n</context_folder>");
          }
        } else if (chip.type === "folder" && chip.data) {
          parts.push('<context_folder path="' + escXmlAttr(chip.detail) + '">\n' + chip.data + "\n</context_folder>");
        }
        break;
      }
      case "selection":
        parts.push('<context_selection source="' + escXmlAttr(chip.detail || "active editor") + '">\n' + (chip.data || "") + "\n</context_selection>");
        break;
      case "diagnostics":
        parts.push("<context_diagnostics>\n" + chip.detail + "\n</context_diagnostics>");
        break;
      case "git":
        parts.push("<context_git>\n" + chip.detail + "\n</context_git>");
        break;
      case "workspace":
        parts.push("Context: " + chip.label + " - " + chip.detail);
        break;
    }
  }

  const gitInfo = getGitInfo();
  if (gitInfo && !chips.some(c => c.type === "git")) {
    parts.push("<context_git>\n" + gitInfo + "\n</context_git>");
  }

  const historyTurns = config.get("historyTurns", 8);
  const recent = chatHistory.slice(-historyTurns);
  if (recent.length > 0) {
    parts.push("Recent chat history:");
    for (const m of recent) {
      parts.push((m.role === "user" ? "User" : "Assistant") + ": " + m.content);
    }
  }

  parts.push("User request: " + userText);
  return parts.join("\n\n");
}
