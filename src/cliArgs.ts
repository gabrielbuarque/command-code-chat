export interface BuildCliArgsInput {
  prompt: string;
  mode: "plan" | "standard" | "auto-accept";
  maxTurns: number;
  model?: string;
  ideSetup?: boolean;
  trustProject: boolean;
  skipOnboarding: boolean;
}

export function buildCliArgs(input: BuildCliArgsInput): string[] {
  const args: string[] = [
    "--print", input.prompt,
    "--permission-mode", input.mode,
    "--max-turns", String(Math.max(1, input.maxTurns)),
  ];

  if (input.skipOnboarding) args.push("--skip-onboarding");
  if (input.model && input.model.trim().length > 0) args.push("--model", input.model.trim());
  if (input.ideSetup) args.push("--ide-setup");
  if (input.trustProject) args.push("--trust");

  // In non-interactive print mode, auto-accept still stays read-only unless --yolo is enabled.
  if (input.mode === "auto-accept") args.push("--yolo");

  return args;
}