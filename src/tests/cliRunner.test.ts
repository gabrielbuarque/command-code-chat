import test from "node:test";
import assert from "node:assert/strict";
import { isIdeSetupInterstitial } from "../ideSetup";

test("isIdeSetupInterstitial detecta o aviso de setup do IDE", () => {
  const output = [
    "INFO IDE extension up to date in Visual Studio Code",
    "INFO Select code in your IDE and it's automatically included in your prompt: no copy-paste needed.",
    "RUN Run /ide from inside the IDE's terminal to verify the connection",
  ].join("\n");

  assert.equal(isIdeSetupInterstitial(output), true);
});

test("isIdeSetupInterstitial não confunde resposta normal", () => {
  assert.equal(isIdeSetupInterstitial("Olá! Como posso ajudar?"), false);
});