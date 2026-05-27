export type RunStatus = "queued" | "running" | "completed" | "failed" | "stopped";

export type ActivityEventType =
  | "thinking" | "todo" | "read" | "write" | "edit"
  | "run" | "stdout" | "stderr" | "error" | "info" | "done";

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  message: string;
  detail?: string;
  timestamp: number;
  collapsed?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
  status?: RunStatus;
  activities?: ActivityEvent[];
  rawTranscript?: string;
  exitCode?: number | null;
  startedAt?: number;
  endedAt?: number;
}

export interface ContextChip {
  id: string;
  type: "file" | "folder" | "selection" | "current-file" | "workspace" | "diagnostics" | "git";
  label: string;
  detail: string;
  fsPath?: string;
  data?: string;
}

export interface QueueItem {
  id: string;
  text: string;
  mode: "plan" | "standard" | "auto-accept";
}

export interface PersistedState {
  messages: ChatMessage[];
  chips: ContextChip[];
  queue: QueueItem[];
  mode: string;
}

export interface TurnStatePayload {
  turnId: string;
  status: RunStatus;
  startedAt: number;
  activities: ActivityEvent[];
  rawTranscript: string;
  exitCode?: number | null;
  endedAt?: number;
}

let seq = 0;
export function nextId(prefix: string): string {
  return prefix + "-" + Date.now().toString(36) + "-" + (seq++);
}
