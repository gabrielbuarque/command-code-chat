import test from "node:test";
import assert from "node:assert/strict";
import { bodyHtml, webviewScript } from "../webview/html";

test("bodyHtml inclui seletor de modelo e barra de modo", () => {
  const html = bodyHtml();
  assert.match(html, /id="model-select"/);
  assert.match(html, /id="mode-seg"/);
  assert.match(html, /id="queue-btn"/);
});

test("webviewScript expõe comandos novos da interface", () => {
  const script = webviewScript();
  assert.match(script, /diagnose/);
  assert.match(script, /setModel/);
  assert.match(script, /initModel/);
});

test("webviewScript gera JavaScript válido", () => {
  const script = webviewScript();
  assert.doesNotThrow(() => new Function(script));
});