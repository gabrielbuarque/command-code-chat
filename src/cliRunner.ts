import * as vscode from "vscode";
import spawn from "cross-spawn";
import stripAnsi from "strip-ansi";
import type { ChildProcess } from "node:child_process";
import type { ActivityEvent } from "./types";
import { parseChunk } from "./commandCodeOutputParser";

export interface CliRunOptions {
  commandPath: string;
  prompt: string;
  mode: "plan" | "standard" | "auto-accept";
  maxTurns: number;
  trustProject: boolean;
  skipOnboarding: boolean;
  cwd: string;
  onRawChunk: (text: string, isStderr: boolean) => void;
  onParsedEvents: (events: ActivityEvent[]) => void;
  onComplete: (code: number | null) => void;
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
    const args: string[] = [
      "--print", opts.prompt,
      "--permission-mode", opts.mode,
      "--max-turns", String(Math.max(1, opts.maxTurns)),
      "--skip-onboarding",
    ];
    if (opts.trustProject) args.push("--trust");
    if (!opts.skipOnboarding) {
      const idx = args.indexOf("--skip-onboarding");
      if (idx !== -1) args.splice(idx, 1);
    }

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

      proc.stdout.on("data", (data: Buffer) => {
        const raw = data.toString();
        const text = stripAnsi(raw);
        stdoutBuf += text;
        opts.onRawChunk(text, false);

        if (stdoutBuf.includes("\n") || stdoutBuf.length > 80) {
          const events = parseChunk(stdoutBuf);
          stdoutBuf = "";
          if (events.length > 0) opts.onParsedEvents(events);
        }
      });

      proc.stderr.on("data", (data: Buffer) => {
        const raw = data.toString();
        const text = stripAnsi(raw);
        stderrBuf += text;
        opts.onRawChunk(text, true);

        if (stderrBuf.includes("\n") || stderrBuf.length > 80) {
          const events = parseChunk(stderrBuf);
          stderrBuf = "";
          if (events.length > 0) opts.onParsedEvents(events);
        }
      });

      proc.on("error", (err: NodeJS.ErrnoException) => {
        if (stdoutBuf) { const evs = parseChunk(stdoutBuf); if (evs.length) opts.onParsedEvents(evs); }
        if (stderrBuf) { const evs = parseChunk(stderrBuf); if (evs.length) opts.onParsedEvents(evs); }
        opts.onError(err);
        if (this._process === proc) this._process = null;
      });

      proc.on("close", (code: number | null) => {
        if (stdoutBuf) { const evs = parseChunk(stdoutBuf); if (evs.length) opts.onParsedEvents(evs); }
        if (stderrBuf) { const evs = parseChunk(stderrBuf); if (evs.length) opts.onParsedEvents(evs); }
        if (this._process === proc) this._process = null;
        opts.onComplete(code);
      });
    } catch (err: unknown) {
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
