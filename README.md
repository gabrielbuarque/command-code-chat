# Command Code Chat — VS Code Extension

Chat sidebar for [Command Code](https://commandcode.ai) — the coding agent that learns your taste.

## Prerequisites

- **Node.js 18+** and **npm**
- **VS Code 1.85+**
- **[Command Code CLI](https://commandcode.ai)** installed and authenticated:
  ```bash
  npm i -g command-code
  command-code login
  ```

## Install & Run

```bash
npm install
code .
# Press F5 → Extension Development Host opens
# Click the Command Code icon in the Activity Bar
```

## UI and Workflow

### Layout

The sidebar has five zones:

1. **Header** — brand label, status pill (Idle / Running / Queued / Error), workspace folder name, Stop/New/Settings buttons.
2. **Mode bar** — Plan, Standard, or Auto-Accept selector. Auto-Accept shows a yellow warning strip.
3. **Context chips** — below the mode bar. Shows active `#` file, `@` context references. Click × to remove, "Clear" to remove all.
4. **Message feed** — scrollable conversation. Assistant messages have a blue gutter line. Code blocks have syntax labels and copy buttons. Long messages collapse with "Show more".
5. **Composer** — the input area with keyboard shortcuts bar. Send button (↑) and Queue button (↩).

### Keyboard Shortcuts

| Key | Action |
|---|---|
| `Enter` | Send now if idle; queue if running |
| `Alt+Enter` | Queue |
| `Shift+Enter` | Newline |
| `Ctrl+Enter` / `Cmd+Enter` | Queue |
| `Esc` | Blur input |
| `Ctrl+Shift+Backspace` | Stop generation |
| `Ctrl+N` / `Cmd+N` | New chat |

### Slash Commands

Type `/` to see autocomplete with descriptions.

| Command | Description |
|---|---|
| `/help` | Show commands |
| `/new` | New chat |
| `/clear` | Clear messages |
| `/stop` | Stop generation |
| `/queue <msg>` | Queue message |
| `/mode plan/standard/auto` | Set mode |
| `/context` | List chips |
| `/clear-context` | Remove all chips |
| `/file <path>` | Add file |
| `/folder <path>` | Add folder |
| `/selection` | Add selection |
| `/open-settings` | Open settings |

### # File References

Type `#` for workspace file autocomplete. Files are added as context chips. Contents included in prompt. Files > `maxContextFileKb` (default 120 KB) show path + warning.

### @ Context References

Type `@` for context autocomplete.

| Reference | Result |
|---|---|
| `@workspace` | Workspace root path |
| `@current-file` | Active file path + content |
| `@selection` | Selected text |
| `@open-tabs` | Open tab list |
| `@problems` | VS Code diagnostics |
| `@git` | Branch + changed files |
| `@folder:<path>` | Folder tree |

### Queue

When the agent is running and you press Enter, the message is queued. Alt+Enter always queues. Queue panel appears above the feed. Remove individual items or clear the queue. When the run finishes, the next queued message runs automatically.

### Modes

- **Plan** — Analyzes and creates a plan. No file edits or shell commands. Default and safest.
- **Standard** — Step by step, asks for permission.
- **Auto-Accept** — Runs without asking. Yellow warning shown. Use on trusted tasks only.

## Settings

| Setting | Default | Description |
|---|---|---|
| `commandCodeChat.commandPath` | `command-code` | CLI path |
| `commandCodeChat.defaultMode` | `plan` | Default mode |
| `commandCodeChat.maxTurns` | `10` | Max turns |
| `commandCodeChat.trustProject` | `false` | Auto-trust |
| `commandCodeChat.skipOnboarding` | `true` | Skip onboarding |
| `commandCodeChat.includeOpenFile` | `true` | Include file path |
| `commandCodeChat.includeSelection` | `true` | Include selection |
| `commandCodeChat.historyTurns` | `8` | History turns |
| `commandCodeChat.maxContextFileKb` | `120` | Max file size |
| `commandCodeChat.clearContextAfterSend` | `false` | Clear chips after send |
| `commandCodeChat.enableQueue` | `true` | Enable queue |
| `commandCodeChat.enableSlashCommands` | `true` | Enable slash |
| `commandCodeChat.enableHashFileReferences` | `true` | Enable # |
| `commandCodeChat.enableAtReferences` | `true` | Enable @ |
| `commandCodeChat.compactMode` | `false` | Compact spacing |
| `commandCodeChat.debug` | `false` | Debug logging to output channel |

## Commands

- `Command Code Chat: New Chat`
- `Command Code Chat: Stop Current Run`
- `Command Code Chat: Clear Queue`
- `Command Code Chat: Clear Context`
- `Command Code Chat: Add Current File to Context`
- `Command Code Chat: Add Selection to Context`
- `Command Code Chat: Open Settings`

## Security and Permission Modes

The extension never calls any remote API. All communication uses the local `command-code` CLI.

| Mode | File writes | Shell commands | Behavior |
|---|---|---|---|
| **Plan** | Blocked | Blocked | Read-only, creates a plan |
| **Standard** | Asks first | Asks first | Prompt for confirmation |
| **Auto-Accept** | Allowed | Allowed | No prompts; warning shown |

## Troubleshooting

**CLI not found:** `npm i -g command-code`

**Not authenticated:** `command-code login`

**Permission denied (Linux/macOS):** `chmod +x $(which command-code)`

## Known Limitations

- `@terminal` is not supported
- `#` autocomplete uses `vscode.workspace.findFiles` (workspace-only)
- Git context requires built-in Git extension active

## License

MIT
