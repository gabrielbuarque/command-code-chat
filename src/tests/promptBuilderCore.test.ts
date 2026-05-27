import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import { buildPromptCore, escapeXmlAttr } from "../promptBuilderCore";
import type { ChatMessage, ContextChip } from "../types";

test("escapeXmlAttr escapa aspas simples", () => {
  assert.equal(escapeXmlAttr(`a'b"<&>`), "a&#39;b&quot;&lt;&amp;&gt;");
});

test("buildPromptCore inclui modelo, histórico e chips", () => {
  const chips: ContextChip[] = [
    { id: "1", type: "selection", label: "Selection", detail: "editor.ts", data: "const x = 1;" },
    { id: "2", type: "workspace", label: "Workspace", detail: "/repo" },
  ];
  const history: ChatMessage[] = [
    { id: "u1", role: "user", content: "hello", createdAt: 1 },
    { id: "a1", role: "assistant", content: "hi", createdAt: 2 },
  ];
  const prompt = buildPromptCore({
    userText: "do work",
    mode: "plan",
    selectedModel: "kimi-k2.5",
    workspaceRoot: "/repo",
    chips,
    chatHistory: history,
    config: { includeOpenFile: true, includeSelection: true, historyTurns: 8, maxContextFileKb: 120 },
    activeFilePath: "/repo/src/index.ts",
    activeSelection: "const y = 2;",
    gitInfo: "branch: main",
    fs: {
      existsSync: fs.existsSync,
      statSync: fs.statSync,
      readFileSync: fs.readFileSync as unknown as (path: string, encoding: "utf-8") => string,
      readFolderTree: () => "src/\n  index.ts",
    },
  });

  assert.match(prompt, /Selected model: kimi-k2.5/);
  assert.match(prompt, /Workspace root: \/repo/);
  assert.match(prompt, /Recent chat history:/);
  assert.match(prompt, /User: hello/);
  assert.match(prompt, /Assistant: hi/);
  assert.match(prompt, /<context_selection source="editor.ts">/);
});
