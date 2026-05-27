import type { ChatMessage, ContextChip } from "./types";

export interface PromptConfigLike {
  includeOpenFile: boolean;
  includeSelection: boolean;
  historyTurns: number;
  maxContextFileKb: number;
}

export interface PromptFsLike {
  existsSync: (path: string) => boolean;
  statSync: (path: string) => { isFile(): boolean; isDirectory(): boolean; size: number };
  readFileSync: (path: string, encoding: "utf-8") => string;
  readFolderTree: (dir: string, maxDepth: number) => string;
}

export interface PromptCoreInput {
  userText: string;
  mode: string;
  selectedModel?: string;
  workspaceRoot?: string;
  chips: ContextChip[];
  chatHistory: ChatMessage[];
  config: PromptConfigLike;
  activeFilePath?: string;
  activeSelection?: string;
  gitInfo?: string;
  fs: PromptFsLike;
}

export function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildPromptCore(input: PromptCoreInput): string {
  const parts: string[] = [];

  parts.push("You are Command Code running inside a VS Code chat wrapper. Answer concisely.");

  if (input.workspaceRoot) parts.push("Workspace root: " + input.workspaceRoot);
  parts.push("Permission mode: " + input.mode);
  if (input.selectedModel) parts.push("Selected model: " + input.selectedModel);

  if (input.activeFilePath && input.config.includeOpenFile) {
    parts.push("Active file: " + input.activeFilePath);
    if (input.activeSelection && input.config.includeSelection) {
      parts.push("Selected code:\n```\n" + input.activeSelection + "\n```");
    }
  }

  for (const chip of input.chips) {
    switch (chip.type) {
      case "file":
      case "current-file":
      case "folder": {
        const fp = chip.fsPath || chip.detail;
        if (fp && input.fs.existsSync(fp)) {
          const stat = input.fs.statSync(fp);
          if (stat.isFile()) {
            if (stat.size > input.config.maxContextFileKb * 1024) {
              parts.push('<context_file path="' + escapeXmlAttr(chip.detail) + '" warning="too large (' + Math.round(stat.size / 1024) + ' KB)"/>');
            } else {
              const content = chip.data ?? input.fs.readFileSync(fp, "utf-8");
              parts.push('<context_file path="' + escapeXmlAttr(chip.detail || chip.fsPath || chip.label) + '\">\n' + content + "\n</context_file>");
            }
          } else if (stat.isDirectory()) {
            const tree = chip.data ?? input.fs.readFolderTree(fp, 2);
            parts.push('<context_folder path="' + escapeXmlAttr(chip.detail) + '\">\n' + tree + "\n</context_folder>");
          }
        } else if (chip.type === "folder" && chip.data) {
          parts.push('<context_folder path="' + escapeXmlAttr(chip.detail) + '\">\n' + chip.data + "\n</context_folder>");
        }
        break;
      }
      case "selection":
        parts.push('<context_selection source="' + escapeXmlAttr(chip.detail || "active editor") + '\">\n' + (chip.data || "") + "\n</context_selection>");
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

  if (input.gitInfo && !input.chips.some(c => c.type === "git")) {
    parts.push("<context_git>\n" + input.gitInfo + "\n</context_git>");
  }

  const recent = input.chatHistory.slice(-input.config.historyTurns);
  if (recent.length > 0) {
    parts.push("Recent chat history:");
    for (const message of recent) {
      parts.push((message.role === "user" ? "User" : "Assistant") + ": " + message.content);
    }
  }

  parts.push("User request: " + input.userText);
  return parts.join("\n\n");
}