import stripAnsi from "strip-ansi";
import type { ActivityEvent } from "./types";

let eventSeq = 0;

export function parseChunk(text: string): ActivityEvent[] {
  const clean = stripAnsi(text);
  const events: ActivityEvent[] = [];
  const lines = clean.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const ev = classifyLine(trimmed);
    events.push(ev);
  }

  return events;
}

function makeId(): string {
  return "ev-" + (eventSeq++);
}

function classifyLine(line: string): ActivityEvent {
  const lower = line.toLowerCase();

  // Thought/Thinking patterns
  if (
    lower.startsWith("thought for") ||
    lower.startsWith("thinking") ||
    lower.match(/^thought\b/)
  ) {
    return {
      id: makeId(),
      type: "thinking",
      message: line,
      timestamp: Date.now(),
    };
  }

  // TODO patterns
  if (
    lower.includes("todo") ||
    (line.match(/^\d+\. /) && !line.includes("=") && !line.includes("http"))
  ) {
    return {
      id: makeId(),
      type: "todo",
      message: line,
      timestamp: Date.now(),
    };
  }

  // READ patterns
  if (
    lower.startsWith("read ") ||
    lower.match(/^read\s+\S+\s+\d+ lines?/) ||
    lower.match(/^reading\s/)
  ) {
    return {
      id: makeId(),
      type: "read",
      message: line,
      timestamp: Date.now(),
    };
  }

  // WRITE patterns
  if (
    lower.startsWith("write ") ||
    lower.startsWith("wrote ") ||
    lower.startsWith("writing ") ||
    lower.startsWith("creating ") ||
    lower.startsWith("created ") ||
    lower.startsWith("saving ") ||
    lower.startsWith("saved ")
  ) {
    return {
      id: makeId(),
      type: "write",
      message: line,
      timestamp: Date.now(),
    };
  }

  // EDIT patterns
  if (
    lower.startsWith("edit ") ||
    lower.startsWith("editing ") ||
    lower.startsWith("edited ") ||
    lower.startsWith("modifying ") ||
    lower.startsWith("modified ") ||
    lower.startsWith("patching ") ||
    lower.startsWith("patched ")
  ) {
    return {
      id: makeId(),
      type: "edit",
      message: line,
      timestamp: Date.now(),
    };
  }

  // RUN / command patterns
  if (
    lower.startsWith("run ") ||
    lower.startsWith("running ") ||
    lower.startsWith("exec ") ||
    lower.startsWith("executing ") ||
    (lower.startsWith("$ ") || lower.startsWith("> ")) ||
    lower.match(/^(npm|node|python|git|ls|cd|mkdir|rm|cp|mv|cat|echo|grep|find|chmod|curl|wget|docker|kubectl)\b/)
  ) {
    return {
      id: makeId(),
      type: "run",
      message: line,
      timestamp: Date.now(),
    };
  }

  // Error patterns
  if (
    lower.startsWith("error") ||
    lower.startsWith("❌") ||
    lower.includes("error:") ||
    lower.includes("failed") ||
    lower.includes("exception")
  ) {
    return {
      id: makeId(),
      type: "error",
      message: line,
      timestamp: Date.now(),
    };
  }

  // Info / misc
  return {
    id: makeId(),
    type: "info",
    message: line,
    timestamp: Date.now(),
  };
}

export function stripEscapes(text: string): string {
  return stripAnsi(text);
}
