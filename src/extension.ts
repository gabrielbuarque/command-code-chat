import * as vscode from "vscode";
import * as crypto from "node:crypto";
import * as path from "node:path";
import * as fs from "node:fs";
import type { ChatMessage, ContextChip, ModelOption, QueueItem } from "./types";
import { nextId } from "./types";
import { StateManager } from "./state";
import { CliRunner, buildAuthErrorMessage, getActiveFileInfo, getWorkspaceRoot } from "./cliRunner";
import { isIdeSetupInterstitial } from "./ideSetup";
import { buildPrompt, readFolderTree } from "./promptBuilder";
import { runWrapperDiagnostics } from "./diagnostics";
import { bodyHtml, webviewScript } from "./webview/html";
import { styles as buildWebviewStyles } from "./webview/styles";

const AVAILABLE_MODELS: ModelOption[] = [
  { id: "kimi-k2.5", label: "Kimi K2.5", description: "multimodal frontend coding" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", description: "fast everyday tasks" },
  { id: "gpt-5.4", label: "GPT-5.4", description: "frontier general work" },
  { id: "gpt-5.3-codex", label: "GPT-5.3 Codex", description: "coding-focused" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", description: "speed + intelligence" },
  { id: "claude-opus-4-7", label: "Claude Opus 4.7", description: "most capable" },
  { id: "moonshotai/Kimi-K2.6", label: "Kimi K2.6", description: "long-horizon coding" },
  { id: "zai-org/GLM-5.1", label: "GLM-5.1", description: "autonomous coding agent" },
  { id: "Qwen/Qwen3.7-Max", label: "Qwen 3.7 Max", description: "long-horizon agent execution" },
];

class CommandCodeChatProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "commandCodeChat.chatView";
  private readonly _ctx: vscode.ExtensionContext;
  private readonly _state: StateManager;
  private readonly _runner = new CliRunner();
  private _view?: vscode.WebviewView;
  private readonly _diagnosticChannel = vscode.window.createOutputChannel("Command Code Chat Diagnostics", { log: true });
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

    webviewView.webview.onDidReceiveMessage(m => this._handleMessage(m));

    const nonce = crypto.randomBytes(32).toString("base64");
    const csp = `default-src 'none'; style-src ${webviewView.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webviewView.webview.cspSource} https:; font-src ${webviewView.webview.cspSource};`;
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Command Code Chat</title><style>${buildWebviewStyles()}</style></head><body>${bodyHtml()}<script nonce="${nonce}">${webviewScript()}</script></body></html>`;
    webviewView.webview.html = html;
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

  private _postDiagnostic(text: string): void {
    this._diagnosticChannel.appendLine(text);
  }

  private _getConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration("commandCodeChat");
  }

  /** Resolve CLI executable path, falling back to NVM directories when not in PATH */
  private _resolveCliPath(cmd: string): string {
    if (path.isAbsolute(cmd)) return cmd;
    // Check NVM directories — VS Code may not have NVM in its PATH
    const nvmDir = process.env.NVM_DIR || path.join(process.env.HOME || "", ".nvm");
    const versionsDir = path.join(nvmDir, "versions", "node");
    if (fs.existsSync(versionsDir)) {
      try {
        const versions = fs.readdirSync(versionsDir).sort().reverse();
        for (const ver of versions) {
          const candidate = path.join(versionsDir, ver, "bin", cmd);
          if (fs.existsSync(candidate)) return candidate;
        }
      } catch { /* ignore */ }
    }
    return cmd;
  }

  private async _updateConfigValue<T>(key: string, value: T): Promise<void> {
    await this._getConfig().update(key, value, vscode.ConfigurationTarget.Workspace);
  }

  private _getSelectedModel(): string {
    return this._getConfig().get<string>("model", AVAILABLE_MODELS[0].id);
  }

  private _getQueueLimit(): number {
    return Math.max(1, this._getConfig().get("maxQueueLength", 20));
  }

  private _getFallbackModel(currentModel: string): string {
    if (currentModel.includes("gpt-5.4-mini")) return "kimi-k2.5";
    return "gpt-5.4-mini";
  }

  private _shouldRetryOnServerError(stderr: string): boolean {
    const lower = stderr.toLowerCase();
    return lower.includes("internal server error") || lower.includes("server error") || lower.includes("502") || lower.includes("503") || lower.includes("504");
  }

  private _buildTurnErrorMessage(code: number | null, stderr: string, model?: string): string {
    const authMessage = buildAuthErrorMessage(stderr, code);
    if (authMessage) return authMessage;

    const lower = stderr.toLowerCase();
    if (lower.includes("internal server error") || lower.includes("server error")) {
      const currentModel = model && model.trim().length > 0 ? model.trim() : "kimi-k2.5";
      const alternateModel = currentModel.includes("gpt-5.4-mini") ? "kimi-k2.5" : "gpt-5.4-mini";
      return "Command Code returned an internal server error. Try changing `commandCodeChat.model` from `" + currentModel + "` to `" + alternateModel + "`.";
    }

    if (code === null) {
      return "Command Code stopped unexpectedly.";
    }

    return "Command Code exited with code " + code + ".";
  }

  private _sendInitState(): void {
    this._view?.webview.postMessage({
      type: "initState",
      mode: this._selectedMode,
      model: this._getSelectedModel(),
      models: AVAILABLE_MODELS,
      queue: this._queue,
      chips: this._chips,
      root: getWorkspaceRoot() ?? null,
      messages: this._chatHistory,
    });
  }

  /* ── Message handler ── */

  private _handleMessage(message: Record<string, unknown>): void {
    const type = message.type as string;
    this._log("recv", type);

    switch (type) {
      case "ready":
        this._sendInitState();
        break;
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
      case "setModel":
        this._setModel(message.model as string);
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

  private _run(text: string, mode: "plan" | "standard" | "auto-accept", modelOverride?: string): void {
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
    const selectedModel = modelOverride && modelOverride.trim().length > 0 ? modelOverride.trim() : this._getSelectedModel();
    const fileInfo = getActiveFileInfo();
    const prompt = buildPrompt(
      text, mode, selectedModel, getWorkspaceRoot(), this._chips, this._chatHistory, config,
      fileInfo?.path, fileInfo?.selection,
    );

    if (config.get("clearContextAfterSend", false)) {
      this._chips = [];
      this._saveAll();
      this._postChips();
    }

    const cmdPath = this._resolveCliPath(config.get("commandPath", "command-code"));
    this._log("spawn", cmdPath, "--print", "<prompt " + prompt.length + " chars>", "--permission-mode", mode, "--model", selectedModel);

    this._runner.run({
      commandPath: cmdPath,
      model: selectedModel,
      ideSetup: false,
      prompt,
      mode,
      maxTurns: config.get("maxTurns", 10),
      trustProject: config.get("trustProject", false),
      skipOnboarding: config.get("skipOnboarding", true),
      idleTimeoutMs: config.get("idleTimeoutMs", 300000),
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
      onComplete: (code, stdout, stderr) => {
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
        if (isIdeSetupInterstitial(stdout + "\n" + stderr)) {
          this._view?.webview.postMessage({
            type: "turnComplete",
            turnId,
            exitCode: code,
            status: "failed",
            error: "O CLI entrou no fluxo de configuração do IDE em vez de responder. O chat agora ignora `--ide-setup`; recarregue a janela da extensão e tente novamente.",
          });
          this._drainQueue();
          return;
        }
        const status = code === 0 ? "completed" : "failed";
        const errorMessage = code === 0 ? undefined : this._buildTurnErrorMessage(code, stderr, selectedModel);
        this._view?.webview.postMessage({
          type: "turnComplete",
          turnId,
          exitCode: code,
          status,
          error: errorMessage,
        });
        if (code !== 0 && config.get("autoRetryOnServerError", true) && this._shouldRetryOnServerError(stderr)) {
          const fallbackModel = this._getFallbackModel(selectedModel);
          if (fallbackModel !== selectedModel) {
            this._postSystemMsg("Server error on " + selectedModel + ". Retrying with " + fallbackModel + ".");
            this._run(text, mode, fallbackModel);
          }
        }
        this._drainQueue();
      },
      onError: (err: NodeJS.ErrnoException) => {
        this._wasKilled = true;
        this._log("error", err.code, err.message);
        let errorMsg: string;
        if (err.code === "ENOENT") {
          errorMsg = "CLI não encontrado. Verifique `commandCodeChat.commandPath` ou execute: npm i -g command-code";
          this._view?.webview.postMessage({ type: "cliMissing" });
        } else if (err.code === "ETIMEDOUT") {
          errorMsg = "command-code atingiu timeout. Aumente `commandCodeChat.idleTimeoutMs`.";
          this._view?.webview.postMessage({ type: "responseError", error: errorMsg });
        } else if (err.code === "EACCES") {
          errorMsg = "Permissão negada: CLI não executável.";
          this._view?.webview.postMessage({ type: "responseError", error: errorMsg });
        } else {
          errorMsg = "Falha: " + (err.message || "Erro desconhecido");
          this._view?.webview.postMessage({ type: "responseError", error: errorMsg });
        }
        this._view?.webview.postMessage({
          type: "turnComplete",
          turnId,
          exitCode: null,
          status: "failed",
          error: errorMsg,
        });
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
    const limit = this._getQueueLimit();
    if (this._queue.length > limit) {
      this._queue = this._queue.slice(-limit);
      this._postSystemMsg("Queue trimmed to the last " + limit + " items.");
    }
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

  private _setModel(model: string): void {
    const trimmed = model.trim();
    if (!trimmed) {
      this._postSystemMsg("Model name cannot be empty.");
      return;
    }
    void this._updateConfigValue("model", trimmed);
    this._view?.webview.postMessage({ type: "initModel", model: trimmed });
    this._postSystemMsg("Model: " + trimmed);
  }

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
      case "help": this._postSystemMsg("/help /new /clear /stop /queue /mode /model /status /retry /diagnose /context /clear-context /file /folder /selection /open-settings"); break;
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
      case "model":
        if (args) this._setModel(args);
        else this._postSystemMsg("Usage: /model <name>");
        break;
      case "status":
        this._postSystemMsg("mode: " + this._selectedMode + "\nmodel: " + this._getSelectedModel() + "\nqueue: " + this._queue.length + "\nchips: " + this._chips.length + "\nrunner: " + (this._runner.isRunning ? "running" : "idle"));
        break;
      case "diagnose":
        void this.runDiagnostics();
        break;
      case "retry": {
        const userMsgs = this._chatHistory.filter(m => m.role === "user");
        const last = userMsgs[userMsgs.length - 1];
        if (!last) { this._postSystemMsg("No previous message to retry."); break; }
        this._run(last.content, this._selectedMode);
        break;
      }
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
      const files = uris
        .map(u => { const rel = path.relative(root, u.fsPath); return rel.startsWith("..") ? u.fsPath : rel; })
        .sort((a, b) => {
          const aMatch = query ? a.toLowerCase().includes(query.toLowerCase()) : false;
          const bMatch = query ? b.toLowerCase().includes(query.toLowerCase()) : false;
          if (aMatch !== bMatch) return aMatch ? -1 : 1;
          return a.localeCompare(b);
        });
      this._view?.webview.postMessage({
        type: "fileList",
        files,
      });
    });
  }

  async runDiagnostics(): Promise<void> {
    const config = this._getConfig();
    const report = await runWrapperDiagnostics({
      userText: "diagnose wrapper",
      mode: this._selectedMode,
      selectedModel: this._getSelectedModel(),
      workspaceRoot: getWorkspaceRoot(),
      chips: this._chips,
      chatHistory: this._chatHistory,
      config: {
        includeOpenFile: config.get("includeOpenFile", true),
        includeSelection: config.get("includeSelection", true),
        historyTurns: config.get("historyTurns", 8),
        maxContextFileKb: config.get("maxContextFileKb", 120),
      },
      activeFilePath: getActiveFileInfo()?.path,
      activeSelection: getActiveFileInfo()?.selection,
      gitInfo: undefined,
      fs: {
        existsSync: fs.existsSync,
        statSync: fs.statSync,
        readFileSync: fs.readFileSync as unknown as (path: string, encoding: "utf-8") => string,
        readFolderTree,
      },
      cliStatus: async () => {
        const status = await new Promise<{ ok: boolean; details: string }>(resolve => {
          const spawn = require("cross-spawn") as typeof import("cross-spawn");
          const proc = spawn(config.get("commandPath", "command-code"), ["status"], { cwd: getWorkspaceRoot() ?? process.cwd(), env: process.env });
          let output = "";
          proc.stdout?.on("data", (data: Buffer) => { output += data.toString(); });
          proc.stderr?.on("data", (data: Buffer) => { output += data.toString(); });
          proc.on("close", (code: number | null) => resolve({ ok: code === 0, details: output || (code === 0 ? "status ok" : "status failed") }));
          proc.on("error", (error: Error) => resolve({ ok: false, details: error.message }));
        });
        return status;
      },
    });

    const summary = report.ok ? "Diagnostics passed" : "Diagnostics found issues";
    this._postDiagnostic(summary + " @ " + new Date(report.timestamp).toISOString());
    for (const check of report.checks) {
      this._postDiagnostic((check.ok ? "✓" : "✗") + " " + check.label + (check.details ? " — " + check.details : ""));
    }
    this._postSystemMsg(summary);
    vscode.window.showInformationMessage(summary);
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
    ["runDiagnostics", () => provider.runDiagnostics()],
    ["openSettings", () => vscode.commands.executeCommand("workbench.action.openSettings", "commandCodeChat")],
  ];

  for (const [cmd, fn] of commands) {
    context.subscriptions.push(vscode.commands.registerCommand("commandCodeChat." + cmd, fn));
  }
}

export function deactivate(): void {}
