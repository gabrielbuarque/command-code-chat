import * as vscode from "vscode";
import spawn from "cross-spawn";
import stripAnsi from "strip-ansi";
import type { ChildProcess } from "node:child_process";
import type { ActivityEvent } from "./types";
import { parseChunk } from "./commandCodeOutputParser";
import { buildCliArgs } from "./cliArgs";

export interface CliRunOptions {
  commandPath: string;
  model?: string;
  ideSetup?: boolean;
  prompt: string;
  mode: "plan" | "standard" | "auto-accept";
  maxTurns: number;
  trustProject: boolean;
  skipOnboarding: boolean;
  idleTimeoutMs?: number;
  cwd: string;
  onRawChunk: (text: string, isStderr: boolean) => void;
  onParsedEvents: (events: ActivityEvent[]) => void;
  onComplete: (code: number | null, stdout: string, stderr: string) => void;
  onError: (err: NodeJS.ErrnoException) => void;
}

export class CliRunner {
  private _process: ChildProcess | null = null;

  get isRunning(): boolean {
    return this._process !== null;
  }

  kill(): void {
    if (this._process) {
      this._process.kill();
      this._process = null;
    }
  }

  run(opts: CliRunOptions): void {
    const args = buildCliArgs({
      prompt: opts.prompt,
      mode: opts.mode,
      maxTurns: opts.maxTurns,
      model: opts.model,
      ideSetup: opts.ideSetup,
      trustProject: opts.trustProject,
      skipOnboarding: opts.skipOnboarding,
    });

    this.kill();

    try {
      const proc = this._process = spawn(opts.commandPath, args, {
        cwd: opts.cwd,
        env: process.env,
      });

      if (!proc.stdout || !proc.stderr) {
        opts.onError(new Error("Failed to spawn Command Code process.") as NodeJS.ErrnoException);
        return;
      }

      let stdoutBuf = "";
      let stderrBuf = "";
      let stdoutAll = "";
      let stderrAll = "";
      let finished = false;
      let idleTimer: NodeJS.Timeout | undefined;

      const clearIdleTimer = (): void => {
        if (idleTimer) {
          clearTimeout(idleTimer);
          idleTimer = undefined;
        }
      };

      const markActivity = (): void => {
        clearIdleTimer();
        if (!opts.idleTimeoutMs || opts.idleTimeoutMs <= 0) return;
        idleTimer = setTimeout(() => {
          if (finished) return;
          finished = true;
          const timeoutError = new Error("Command Code timed out waiting for output.") as NodeJS.ErrnoException;
          timeoutError.code = "ETIMEDOUT";
          timeoutError.syscall = "command-code";
          proc.kill();
          opts.onError(timeoutError);
          if (this._process === proc) this._process = null;
        }, opts.idleTimeoutMs);
      };

      markActivity();

      proc.stdout.on("data", (data: Buffer) => {
        if (finished) return;
        const raw = data.toString();
        const text = stripAnsi(raw);
        stdoutAll += text;
        stdoutBuf += text;
        markActivity();
        opts.onRawChunk(text, false);

        if (stdoutBuf.includes("\n") || stdoutBuf.length > 80) {
          const events = parseChunk(stdoutBuf);
          stdoutBuf = "";
          if (events.length > 0) opts.onParsedEvents(events);
        }
      });

      proc.stderr.on("data", (data: Buffer) => {
        if (finished) return;
        const raw = data.toString();
        const text = stripAnsi(raw);
        stderrBuf += text;
        stderrAll += text;
        markActivity();
        opts.onRawChunk(text, true);

        if (stderrBuf.includes("\n") || stderrBuf.length > 80) {
          const events = parseChunk(stderrBuf);
          stderrBuf = "";
          if (events.length > 0) opts.onParsedEvents(events);
        }
      });

      proc.on("error", (err: NodeJS.ErrnoException) => {
        if (finished) return;
        finished = true;
        clearIdleTimer();
        if (stdoutBuf) { const evs = parseChunk(stdoutBuf); if (evs.length) opts.onParsedEvents(evs); }
        if (stderrBuf) { const evs = parseChunk(stderrBuf); if (evs.length) opts.onParsedEvents(evs); }
        opts.onError(err);
        if (this._process === proc) this._process = null;
      });

      proc.on("close", (code: number | null) => {
        if (finished) return;
        finished = true;
        clearIdleTimer();
        if (stdoutBuf) { const evs = parseChunk(stdoutBuf); if (evs.length) opts.onParsedEvents(evs); }
        if (stderrBuf) { const evs = parseChunk(stderrBuf); if (evs.length) opts.onParsedEvents(evs); }
        if (this._process === proc) this._process = null;
        opts.onComplete(code, stdoutAll, stderrAll);
      });
    } catch (err: unknown) {
      if (typeof err === "object" && err && "code" in err) {
        const maybeCode = (err as { code?: unknown }).code;
        if (maybeCode === "ETIMEDOUT") {
          opts.onError(err as NodeJS.ErrnoException);
          return;
        }
      }
      const e = err instanceof Error ? err : new Error("Unknown error running Command Code");
      opts.onError(e as NodeJS.ErrnoException);
    }
  }
}

export function buildAuthErrorMessage(stderr: string, exitCode: number | null): string | undefined {
  const lower = stderr.toLowerCase();
  if (lower.includes("not authenticated") || lower.includes("not logged in")) {
    return "Command Code is not authenticated. Run 'command-code login' in your terminal.";
  }
  if (lower.includes("invalid api key") || lower.includes("authentication failed")) {
    return "Command Code authentication failed. Check with 'command-code status'.";
  }
  if (lower.includes("usage limit") || lower.includes("rate limit")) {
    return "Command Code usage limit reached. Check with 'command-code usage'.";
  }
  if (exitCode === 8) {
    return "Command Code hit max turn limit. Try a more specific prompt or increase maxTurns.";
  }
  return undefined;
}

export function getActiveFileInfo(): { path: string; selection: string } | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return undefined;
  const filePath = editor.document.uri.fsPath;
  let selection = "";
  if (!editor.selection.isEmpty) selection = editor.document.getText(editor.selection);
  return { path: filePath, selection };
}

export function getWorkspaceRoot(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    if (folder) return folder.uri.fsPath;
  }
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) return folders[0].uri.fsPath;
  return undefined;
}
