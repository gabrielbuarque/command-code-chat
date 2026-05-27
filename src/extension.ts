import * as vscode from "vscode";
import * as crypto from "node:crypto";
import * as path from "node:path";
import * as fs from "node:fs";
import type { ChatMessage, ContextChip, QueueItem } from "./types";
import { nextId } from "./types";
import { StateManager } from "./state";
import { CliRunner, getActiveFileInfo, getWorkspaceRoot } from "./cliRunner";
import { buildPrompt, readFolderTree } from "./promptBuilder";
import { bodyHtml, webviewScript } from "./webview/html";
import { styles as buildWebviewStyles } from "./webview/styles";

class CommandCodeChatProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "commandCodeChat.chatView";
  private readonly _ctx: vscode.ExtensionContext;
  private readonly _state: StateManager;
  private readonly _runner = new CliRunner();
  private _view?: vscode.WebviewView;
  private _chatHistory: ChatMessage[] = [];
  private _chips: ContextChip[] = [];
  private _queue: QueueItem[] = [];
  private _selectedMode: "plan" | "standard" | "auto-accept" = "plan";
  private _wasKilled = false;
  private _debug: boolean;

  constructor(context: vscode.ExtensionContext) {
    this._ctx = context;
    this._state = new StateManager(context);
    const loaded = this._state.load();
    this._chatHistory = loaded.messages;
    this._chips = loaded.chips;
    this._queue = loaded.queue;
    this._selectedMode = (loaded.mode as "plan" | "standard" | "auto-accept") || "plan";
    this._debug = vscode.workspace.getConfiguration("commandCodeChat").get("debug", false);
  }

  private _log(...args: unknown[]): void {
    if (this._debug) console.log("[CommandCodeChat]", ...args);
  }

  /* ── Public API ── */

  newChat(): void {
    this._wasKilled = true;
    this._runner.kill();
    this._chatHistory = [];
    this._queue = [];
    this._saveAll();
    this._view?.webview.postMessage({ type: "clearChat" });
    this._postChips();
  }

  stopRun(): void {
    this._wasKilled = true;
    this._runner.kill();
    this._view?.webview.postMessage({ type: "responseComplete" });
  }

  clearQueue(): void {
    this._queue = [];
    this._saveAll();
    this._postQueue();
  }

  clearContext(): void {
    this._chips = [];
    this._saveAll();
    this._postChips();
  }

  addCurrentFile(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const fp = editor.document.uri.fsPath;
    const root = getWorkspaceRoot();
    const label = path.basename(fp);
    const rel = root ? path.relative(root, fp) : fp;
    if (this._chips.some(c => c.fsPath === fp)) return;
    this._chips.push({ id: nextId("file"), type: "file", label, detail: rel, fsPath: fp });
    this._saveAll();
    this._postChips();
  }

  addSelection(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) return;
    const text = editor.document.getText(editor.selection);
    const label = "Selection";
    const detail = path.basename(editor.document.uri.fsPath);
    this._chips.push({ id: nextId("sel"), type: "selection", label, detail, data: text });
    this._saveAll();
    this._postChips();
  }

  updateWorkspaceInfo(): void {
    const root = getWorkspaceRoot();
    this._view?.webview.postMessage({ type: "workspaceInfo", root: root ?? null });
  }

  /* ── WebviewViewProvider ── */

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _ctx: vscode.WebviewViewResolveContext,
    _t: vscode.CancellationToken
  ): void {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._ctx.extensionUri],
    };

    const nonce = crypto.randomBytes(32).toString("base64");
    const csp = `default-src 'none'; style-src ${webviewView.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webviewView.webview.cspSource} https:; font-src ${webviewView.webview.cspSource};`;
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Command Code Chat</title><style>${buildWebviewStyles()}</style></head><body>${bodyHtml()}<script nonce="${nonce}">${webviewScript()}</script></body></html>`;
    webviewView.webview.html = html;

    webviewView.webview.postMessage({
      type: "initState",
      mode: this._selectedMode,
      queue: this._queue,
      chips: this._chips,
      root: getWorkspaceRoot() ?? null,
      messages: this._chatHistory,
    });

    webviewView.webview.onDidReceiveMessage(m => this._handleMessage(m));
    webviewView.onDidDispose(() => {
      this._wasKilled = true;
      this._runner.kill();
    });
  }

  /* ── Internal ── */

  private _saveAll(): void {
    this._state.save(this._chatHistory, this._chips, this._queue, this._selectedMode);
  }

  private _postChips(): void {
    this._view?.webview.postMessage({ type: "chipsUpdate", chips: this._chips });
  }

  private _postQueue(): void {
    this._view?.webview.postMessage({ type: "queueUpdate", queue: this._queue });
  }

  private _postSystemMsg(text: string): void {
    this._view?.webview.postMessage({ type: "systemMessage", text });
  }

  private _getConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration("commandCodeChat");
  }

  /* ── Message handler ── */

  private _handleMessage(message: Record<string, unknown>): void {
    const type = message.type as string;
    this._log("recv", type);

    switch (type) {
      case "sendMessage":
        this._run(message.text as string, message.mode as "plan" | "standard" | "auto-accept");
        break;
      case "queueMessage":
        this._queueMessage(message.text as string, message.mode as "plan" | "standard" | "auto-accept");
        break;
      case "removeQueueItem":
        this._queue = this._queue.filter(q => q.id !== (message.id as string));
        this._saveAll();
        this._postQueue();
        break;
      case "removeChip":
        this._chips = this._chips.filter(c => c.id !== (message.id as string));
        this._saveAll();
        this._postChips();
        break;
      case "setMode":
        this._selectedMode = message.mode as "plan" | "standard" | "auto-accept";
        this._saveAll();
        break;
      case "stop":
        this.stopRun();
        break;
      case "newChat":
        this.newChat();
        break;
      case "clearChat":
        this._chatHistory = [];
        this._saveAll();
        break;
      case "clearQueue":
        this.clearQueue();
        break;
      case "clearContext":
        this.clearContext();
        break;
      case "openSettings":
        vscode.commands.executeCommand("workbench.action.openSettings", "commandCodeChat");
        break;
      case "addFileChip":
        this._addFileChip(message.fsPath as string, message.label as string);
        break;
      case "addAtContext":
        this._handleAtContext(message.key as string);
        break;
      case "executeSlash":
        this._handleSlash(message.cmd as string, message.args as string | undefined);
        break;
      case "rerunMessage":
        this._handleRerun(message.index as number);
        break;
      case "requestFileList":
        this._handleFileList(message.query as string);
        break;
      case "saveDraft":
        this._saveAll();
        break;
    }
  }

  /* ── CLI execution ── */

  private _run(text: string, mode: "plan" | "standard" | "auto-accept"): void {
    const userMsgId = nextId("msg");
    const turnId = nextId("turn");
    const now = Date.now();

    const userMsg: ChatMessage = {
      id: userMsgId, role: "user", content: text, createdAt: now,
    };
    const asstMsg: ChatMessage = {
      id: turnId, role: "assistant", content: "", createdAt: now,
      status: "running", startedAt: now, activities: [], rawTranscript: "",
    };

    this._chatHistory.push(userMsg, asstMsg);
    if (this._chatHistory.length > 200) this._chatHistory = this._chatHistory.slice(-200);
    this._saveAll();

    this._view?.webview.postMessage({ type: "turnStart", turnId, userMsgId });

    this._wasKilled = false;

    const config = this._getConfig();
    const fileInfo = getActiveFileInfo();
    const prompt = buildPrompt(
      text, mode, getWorkspaceRoot(), this._chips, this._chatHistory, config,
      fileInfo?.path, fileInfo?.selection,
    );

    if (config.get("clearContextAfterSend", false)) {
      this._chips = [];
      this._saveAll();
      this._postChips();
    }

    const cmdPath = config.get("commandPath", "command-code");
    this._log("spawn", cmdPath, "--print", "<prompt " + prompt.length + " chars>", "--permission-mode", mode);

    this._runner.run({
      commandPath: cmdPath,
      prompt,
      mode,
      maxTurns: config.get("maxTurns", 10),
      trustProject: config.get("trustProject", false),
      skipOnboarding: config.get("skipOnboarding", true),
      cwd: getWorkspaceRoot() ?? process.cwd(),
      onRawChunk: (text, isStderr) => {
        this._log("chunk", isStderr ? "stderr" : "stdout", text.length, "chars");
        this._view?.webview.postMessage({
          type: "rawChunk",
          turnId,
          text,
          isStderr,
        });
      },
      onParsedEvents: (events) => {
        this._view?.webview.postMessage({
          type: "activityEvents",
          turnId,
          events,
        });
      },
      onComplete: (code) => {
        this._log("close", code);
        if (this._wasKilled) {
          this._view?.webview.postMessage({
            type: "turnComplete",
            turnId,
            exitCode: code,
            status: "stopped",
          });
          this._drainQueue();
          return;
        }
        if (code !== 0) {
          this._view?.webview.postMessage({
            type: "turnComplete",
            turnId,
            exitCode: code,
            status: "failed",
            error: "Command Code exited with code " + code + ".",
          });
        } else {
          this._view?.webview.postMessage({
            type: "turnComplete",
            turnId,
            exitCode: code,
            status: "completed",
          });
        }
        this._drainQueue();
      },
      onError: (err: NodeJS.ErrnoException) => {
        this._wasKilled = true;
        this._log("error", err.code, err.message);
        if (err.code === "ENOENT") {
          this._view?.webview.postMessage({ type: "cliMissing" });
        } else if (err.code === "EACCES") {
          this._view?.webview.postMessage({ type: "responseError", error: "Permission denied: not executable." });
        } else {
          this._view?.webview.postMessage({ type: "responseError", error: "Failed: " + (err.message || "Unknown error") });
        }
        this._drainQueue();
      },
    });
  }

  private _drainQueue(): void {
    if (this._queue.length > 0 && !this._runner.isRunning) {
      this._popQueue();
    }
  }

  private _queueMessage(text: string, mode: "plan" | "standard" | "auto-accept"): void {
    if (!this._getConfig().get("enableQueue", true)) {
      this._run(text, mode);
      return;
    }
    this._queue.push({ id: nextId("q"), text, mode });
    this._saveAll();
    this._postQueue();
    if (!this._runner.isRunning) this._popQueue();
  }

  private _popQueue(): void {
    if (this._queue.length === 0 || this._runner.isRunning) return;
    const item = this._queue.shift()!;
    this._saveAll();
    this._postQueue();
    this._view?.webview.postMessage({ type: "queuePopped", id: item.id, text: item.text, mode: item.mode });
  }

  /* ── Context / Slash ── */

  private _addFileChip(fsPath: string, label?: string): void {
    const basename = label || path.basename(fsPath);
    const root = getWorkspaceRoot();
    const rel = root ? path.relative(root, fsPath) : fsPath;
    if (this._chips.some(c => c.fsPath === fsPath)) return;
    this._chips.push({ id: nextId("file"), type: "file", label: basename, detail: rel, fsPath });
    this._saveAll();
    this._postChips();
  }

  private _handleAtContext(key: string): void {
    const editor = vscode.window.activeTextEditor;
    const root = getWorkspaceRoot();
    switch (key) {
      case "workspace":
        if (!root) { this._postSystemMsg("No workspace folder open."); return; }
        this._chips.push({ id: nextId("ws"), type: "workspace", label: "Workspace", detail: root });
        break;
      case "current-file":
        if (!editor) { this._postSystemMsg("No active editor."); return; }
        {
          const fp = editor.document.uri.fsPath;
          if (this._chips.some(c => c.fsPath === fp)) return;
          this._chips.push({ id: nextId("cf"), type: "current-file", label: path.basename(fp), detail: root ? path.relative(root, fp) : fp, fsPath: fp });
        }
        break;
      case "selection":
        if (!editor || editor.selection.isEmpty) { this._postSystemMsg("No text selected."); return; }
        {
          const text = editor.document.getText(editor.selection);
          this._chips.push({ id: nextId("sel"), type: "selection", label: "Selection", detail: path.basename(editor.document.uri.fsPath), data: text });
        }
        break;
      case "open-tabs": {
        const tabs = vscode.window.tabGroups.all.flatMap(g => g.tabs).filter(t => t.input && (t.input as any).uri);
        if (tabs.length === 0) { this._postSystemMsg("No open tabs."); return; }
        this._chips.push({ id: nextId("tabs"), type: "workspace", label: "Open Tabs (" + tabs.length + ")", detail: tabs.map(t => (t.input as any).uri.fsPath).join("\n") });
        break;
      }
      case "problems": {
        const diags = vscode.languages.getDiagnostics();
        const lines: string[] = [];
        for (const [uri, ds] of diags) {
          for (const d of ds) {
            const sev = d.severity === vscode.DiagnosticSeverity.Error ? "ERROR" : d.severity === vscode.DiagnosticSeverity.Warning ? "WARN" : "INFO";
            lines.push(sev + " " + uri.fsPath + ":" + (d.range.start.line + 1) + " " + d.message);
          }
        }
        if (lines.length === 0) { this._postSystemMsg("No problems found."); return; }
        this._chips.push({ id: nextId("diag"), type: "diagnostics", label: "Diagnostics (" + lines.length + ")", detail: lines.join("\n") });
        break;
      }
      case "git": {
        const gitExt = vscode.extensions.getExtension("vscode.git");
        if (!gitExt || !gitExt.isActive) { this._postSystemMsg("Git extension not active."); return; }
        try {
          const api = gitExt.exports.getAPI(1);
          const repo = api.repositories?.[0];
          if (!repo) { this._postSystemMsg("No git repository found."); return; }
          const branch = repo.state.HEAD?.name || "(detached)";
          const changes = repo.state.workingTreeChanges || [];
          const staged = repo.state.indexChanges || [];
          const lines = ["branch: " + branch];
          if (staged.length > 0) lines.push("staged: " + staged.map((c: any) => path.basename(c.uri.fsPath)).join(", "));
          if (changes.length > 0) lines.push("changed: " + changes.map((c: any) => path.basename(c.uri.fsPath)).join(", "));
          this._chips.push({ id: nextId("git"), type: "git", label: "Git", detail: lines.join("\n") });
        } catch { this._postSystemMsg("Could not read git state."); }
        break;
      }
      case "terminal": this._postSystemMsg("@terminal is not available."); break;
      default:
        if (key.startsWith("folder:")) {
          const fp = root ? path.resolve(root, key.slice("folder:".length)) : path.resolve(key.slice("folder:".length));
          if (!fs.existsSync(fp) || !fs.statSync(fp).isDirectory()) { this._postSystemMsg("Folder not found."); return; }
          this._chips.push({ id: nextId("dir"), type: "folder", label: path.basename(fp), detail: fp, data: readFolderTree(fp, 2) });
        }
        break;
    }
    this._saveAll();
    this._postChips();
  }

  private _handleSlash(cmd: string, args?: string): void {
    const root = getWorkspaceRoot();
    switch (cmd) {
      case "help": this._postSystemMsg("/help /new /clear /stop /queue /mode /context /clear-context /file /folder /selection /open-settings"); break;
      case "new": case "new-chat": this.newChat(); break;
      case "clear": this._chatHistory = []; this._saveAll(); this._view?.webview.postMessage({ type: "clearChat" }); break;
      case "stop": this.stopRun(); break;
      case "queue": args ? this._queueMessage(args, this._selectedMode) : this._postSystemMsg("Usage: /queue <message>"); break;
      case "mode":
        if (args === "plan" || args === "standard" || args === "auto") {
          this._selectedMode = (args === "auto" ? "auto-accept" : args) as "plan" | "standard" | "auto-accept";
          this._saveAll(); this._view?.webview.postMessage({ type: "initMode", mode: this._selectedMode });
          this._postSystemMsg("Mode: " + this._selectedMode);
        } else { this._postSystemMsg("Usage: /mode plan|standard|auto"); }
        break;
      case "context": this._chips.length === 0 ? this._postSystemMsg("No context chips.") : this._postSystemMsg(this._chips.map(c => c.type + ": " + c.label).join("\n")); break;
      case "clear-context": this.clearContext(); this._postSystemMsg("Context cleared."); break;
      case "file":
        if (args) { const p = root ? path.resolve(root, args) : path.resolve(args); if (!fs.existsSync(p)) { this._postSystemMsg("File not found."); return; } this._addFileChip(p, path.basename(p)); this._postSystemMsg("Added: " + path.basename(p)); }
        else this._postSystemMsg("Usage: /file <path>"); break;
      case "folder":
        if (args) { const p = root ? path.resolve(root, args) : path.resolve(args); if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) { this._postSystemMsg("Folder not found."); return; } this._chips.push({ id: nextId("dir"), type: "folder", label: path.basename(p), detail: p, data: readFolderTree(p, 2) }); this._saveAll(); this._postChips(); this._postSystemMsg("Added: " + path.basename(p)); }
        else this._postSystemMsg("Usage: /folder <path>"); break;
      case "selection": this.addSelection(); break;
      case "open-settings": vscode.commands.executeCommand("workbench.action.openSettings", "commandCodeChat"); break;
      default: this._postSystemMsg("Unknown: /" + cmd + ". Type /help."); break;
    }
  }

  private _handleRerun(index: number): void {
    const userMsgs = this._chatHistory.filter(m => m.role === "user");
    if (index >= 0 && index < userMsgs.length) {
      this._run(userMsgs[index].content, this._selectedMode);
    }
  }

  private _handleFileList(query: string): void {
    const root = getWorkspaceRoot();
    if (!root) { this._view?.webview.postMessage({ type: "fileList", files: [] }); return; }
    const pattern = query ? "**/" + query + "*" : "**/*";
    vscode.workspace.findFiles(pattern, "**/node_modules/**", 20).then(uris => {
      this._view?.webview.postMessage({
        type: "fileList",
        files: uris.map(u => { const rel = path.relative(root, u.fsPath); return rel.startsWith("..") ? u.fsPath : rel; }),
      });
    });
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new CommandCodeChatProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(CommandCodeChatProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => provider.updateWorkspaceInfo()),
  );

  const commands: [string, () => void | Promise<void>][] = [
    ["newChat", () => { vscode.commands.executeCommand("workbench.view.extension.commandCodeChat-sidebar"); provider.newChat(); }],
    ["stopRun", () => { provider.stopRun(); vscode.window.showInformationMessage("Command Code run stopped."); }],
    ["clearQueue", () => provider.clearQueue()],
    ["clearContext", () => provider.clearContext()],
    ["addCurrentFile", () => provider.addCurrentFile()],
    ["addSelection", () => provider.addSelection()],
    ["openSettings", () => vscode.commands.executeCommand("workbench.action.openSettings", "commandCodeChat")],
  ];

  for (const [cmd, fn] of commands) {
    context.subscriptions.push(vscode.commands.registerCommand("commandCodeChat." + cmd, fn));
  }
}

export function deactivate(): void {}
