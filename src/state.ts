import * as vscode from "vscode";
import type { ChatMessage, ContextChip, QueueItem, PersistedState } from "./types";

const STATE_KEY = "commandCodeChat.state";
const MAX_MESSAGES = 100;

export class StateManager {
  constructor(private readonly _ctx: vscode.ExtensionContext) {}

  load(): {
    messages: ChatMessage[];
    chips: ContextChip[];
    queue: QueueItem[];
    mode: string;
  } {
    const raw = this._ctx.workspaceState.get<PersistedState>(STATE_KEY);
    if (!raw) {
      return { messages: [], chips: [], queue: [], mode: "plan" };
    }
    return {
      messages: raw.messages?.slice(-MAX_MESSAGES) ?? [],
      chips: raw.chips ?? [],
      queue: raw.queue ?? [],
      mode: raw.mode || "plan",
    };
  }

  save(
    messages: ChatMessage[],
    chips: ContextChip[],
    queue: QueueItem[],
    mode: string,
  ): void {
    const state: PersistedState = { messages, chips, queue, mode };
    this._ctx.workspaceState.update(STATE_KEY, state);
  }
}
