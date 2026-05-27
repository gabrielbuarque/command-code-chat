import { parseChunk } from "./commandCodeOutputParser";
import { buildPromptCore, type PromptCoreInput } from "./promptBuilderCore";

export interface DiagnosticCheck {
  id: string;
  label: string;
  ok: boolean;
  details?: string;
}

export interface DiagnosticReport {
  timestamp: number;
  ok: boolean;
  checks: DiagnosticCheck[];
}

export interface WrapperDiagnosticsInput extends PromptCoreInput {
  cliStatus: () => Promise<{ ok: boolean; details: string }>;
}

export async function runWrapperDiagnostics(input: WrapperDiagnosticsInput): Promise<DiagnosticReport> {
  const checks: DiagnosticCheck[] = [];

  const parserEvents = parseChunk("thinking about it\nDONE\n");
  checks.push({
    id: "parser",
    label: "Parser classifica eventos básicos",
    ok: parserEvents.some(event => event.type === "thinking") && parserEvents.some(event => event.type === "done"),
    details: parserEvents.map(event => event.type).join(", "),
  });

  const prompt = buildPromptCore(input);
  checks.push({
    id: "prompt-model",
    label: "Prompt inclui modelo selecionado",
    ok: !input.selectedModel || prompt.includes("Selected model: " + input.selectedModel),
    details: input.selectedModel,
  });

  checks.push({
    id: "prompt-escape",
    label: "Prompt escapa atributos XML",
    ok: prompt.includes("&#39;") || !input.chips.some(chip => chip.detail.includes("'")),
    details: prompt,
  });

  const cli = await input.cliStatus();
  checks.push({
    id: "cli-status",
    label: "Command Code responde ao status",
    ok: cli.ok,
    details: cli.details,
  });

  return {
    timestamp: Date.now(),
    ok: checks.every(check => check.ok),
    checks,
  };
}