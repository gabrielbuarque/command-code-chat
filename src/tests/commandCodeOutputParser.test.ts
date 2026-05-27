import test from "node:test";
import assert from "node:assert/strict";
import { parseChunk, resetEventSequenceForTests } from "../commandCodeOutputParser";

test("parseChunk classifica thinking, done e error", () => {
  resetEventSequenceForTests();
  const events = parseChunk("thinking about it\nDONE\nerror: failed to execute\n");
  assert.equal(events.length, 3);
  assert.equal(events[0].type, "thinking");
  assert.equal(events[1].type, "done");
  assert.equal(events[2].type, "error");
});

test("parseChunk classifica comandos e listas", () => {
  resetEventSequenceForTests();
  const events = parseChunk("npm run compile\n1. plan the work\n- todo: review\n");
  assert.equal(events[0].type, "run");
  assert.equal(events[1].type, "todo");
  assert.equal(events[2].type, "todo");
});