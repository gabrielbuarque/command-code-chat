import stripAnsi from "strip-ansi";

export function isIdeSetupInterstitial(output: string): boolean {
  const lower = stripAnsi(output).toLowerCase();
  return lower.includes("ide extension installed")
    || lower.includes("ide extension up to date")
    || lower.includes("re-run /ide")
    || lower.includes("run /ide from inside the ide")
    || lower.includes("reload visual studio code");
}