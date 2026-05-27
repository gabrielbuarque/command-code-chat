# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# cli
- Use `command-code` as the executable name, never `cmd` (conflicts with Windows shell). Confidence: 0.85
- Use `cross-spawn` for cross-platform child process spawning instead of Node's native `child_process`. Confidence: 0.80

# vscode-extension
See [vscode-extension/taste.md](vscode-extension/taste.md)
# prompt-engineering
- Build prompts for CLI agents using XML-style context tags: `<context_file>`, `<context_selection>`, `<context_diagnostics>`, `<context_git>`, `<context_folder>`. Confidence: 0.70

# process-management
- Use a `_wasKilled` boolean flag to prevent double `postMessage` races when the user clicks Stop — the `close` event handler checks the flag before posting `responseComplete`. Confidence: 0.75
- Set `_wasKilled = true` in three places: user clicks Stop, `newChat()`, and the process `error` event handler. Confidence: 0.70

# ui-design
- For VS Code extension chat panels, prefer a terminal-grade developer aesthetic: monospace input, blue gutter lines on assistant messages (not floating bubbles), compact spacing, no emoji empty states, no rounded pill buttons. Confidence: 0.70
- Use VS Code CSS variables exclusively for theming: `--vscode-sideBar-background`, `--vscode-editor-background`, `--vscode-input-background`, `--vscode-focusBorder`, `--vscode-descriptionForeground`, `--vscode-textLink-foreground`, `--vscode-textCodeBlock-background`. Confidence: 0.75
- Code blocks in chat messages: blue left-border accent, monospace font, language label header, per-block copy button. Single backticks render inline code. Confidence: 0.65
- Collapse long assistant messages (>1500 chars) and show "Show more" button to expand. Confidence: 0.60

# error-handling
- Build multi-layered CLI error detection: ENOENT → install message, EACCES → permissions message, stderr auth patterns → login message, exit code 8 → max-turn-limit message. Confidence: 0.70

# state-persistence
- Use `vscode.ExtensionContext.workspaceState` for persisting chat history, context chips, message queue, and selected mode. Cap persisted messages at 100. Confidence: 0.70

# debugging
- Implement debug logging behind a VS Code setting toggle (`commandCodeChat.debug`, default false). Log webview send events, extension received events, CLI command path/args (no full prompt content), process start, stdout/stderr chunks, and close code. Confidence: 0.70

# activity-stream
- Parse streaming CLI output into structured activity events (thinking, todo, read, write, edit, run, stdout, stderr, error, info, done). Provide a "Pretty" (parsed timeline) and "Raw" (terminal transcript) toggle. If parsing is uncertain, fall back to raw streaming text. Confidence: 0.70

# cli-internals
- Strip ANSI escape codes from CLI output before parsing using a minimal utility like `strip-ansi`. Preserve readable formatting but remove control sequences. Confidence: 0.65
- Run `command-code` in interactive/TUI mode (spawned as a terminal wrapper) rather than `--print` headless mode, to capture the full activity stream (THINKING, READ, WRITE, TODOS, RUN). `--print` only outputs the final answer, losing intermediate tool-use events. Confidence: 0.65

# webview-performance
- Throttle webview postMessage updates during streaming to at most every 100ms. Buffer small chunks rather than sending on every character. Confidence: 0.65
