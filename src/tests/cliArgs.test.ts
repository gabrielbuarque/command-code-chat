import test from "node:test";
import assert from "node:assert/strict";
import { buildCliArgs } from "../cliArgs";

test("buildCliArgs adiciona --yolo no modo auto-accept", () => {
  const args = buildCliArgs({
    prompt: "crie um arquivo",
    mode: "auto-accept",
    maxTurns: 3,
    model: "kimi-k2.5",
    ideSetup: false,
    trustProject: false,
    skipOnboarding: true,
  });

  assert.deepEqual(args, [
    "--print", "crie um arquivo",
    "--permission-mode", "auto-accept",
    "--max-turns", "3",
    "--skip-onboarding",
    "--model", "kimi-k2.5",
    "--yolo",
  ]);
});

test("buildCliArgs não adiciona --yolo fora do modo auto-accept", () => {
  const args = buildCliArgs({
    prompt: "explique o projeto",
    mode: "standard",
    maxTurns: 2,
    model: "kimi-k2.5",
    ideSetup: false,
    trustProject: true,
    skipOnboarding: true,
  });

  assert.equal(args.includes("--yolo"), false);
  assert.equal(args.includes("--trust"), true);
});