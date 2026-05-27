export function styles(): string {
  return `*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
body{display:flex;flex-direction:column;height:100vh;font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);color:var(--vscode-foreground);background:var(--vscode-sideBar-background);user-select:none}

/* ── Header ── */
.header{display:flex;align-items:center;gap:6px;padding:3px 6px;border-bottom:1px solid var(--vscode-sideBar-border,var(--vscode-panel-border));flex-shrink:0;min-height:30px}
.brand{font-size:10.5px;font-weight:600;color:var(--vscode-descriptionForeground);letter-spacing:.3px;flex-shrink:0}
.mode-seg{display:flex;gap:0;border-radius:3px;overflow:hidden;border:1px solid var(--vscode-panel-border);flex-shrink:0}
.mode-seg button{font-size:9px;font-family:var(--vscode-font-family);padding:2px 7px;border:none;background:var(--vscode-badge-background,transparent);color:var(--vscode-badge-foreground,var(--vscode-descriptionForeground));cursor:pointer;border-right:1px solid var(--vscode-panel-border);transition:background 100ms}
.mode-seg button:last-child{border-right:none}
.mode-seg button.active{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
.mode-seg button:disabled{opacity:.35;cursor:not-allowed}
.mode-seg button.danger.active{background:var(--vscode-inputValidation-warningBackground);color:var(--vscode-inputValidation-warningForeground)}
.workspace-tag{font-size:9px;color:var(--vscode-descriptionForeground);opacity:.45;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;text-align:right}
.header-acts{display:flex;gap:0;flex-shrink:0}
.ctrl-btn{display:flex;align-items:center;justify-content:center;width:22px;height:22px;border:none;background:transparent;color:var(--vscode-foreground);cursor:pointer;border-radius:3px;font-size:11px;opacity:.5}
.ctrl-btn:hover{opacity:1;background:var(--vscode-toolbar-hoverBackground)}
.ctrl-btn:disabled{opacity:.15;cursor:not-allowed}
.ctrl-btn.danger{color:var(--vscode-inputValidation-errorForeground);opacity:1}
.status-pill{font-size:8.5px;padding:1px 5px;border-radius:8px;font-weight:500;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);opacity:.5;margin-right:2px;flex-shrink:0}
.status-pill.running{background:var(--vscode-inputValidation-warningBackground);color:var(--vscode-inputValidation-warningForeground);opacity:.9}
.status-pill.queued{opacity:.7}
.status-pill.error{background:var(--vscode-inputValidation-errorBackground);color:var(--vscode-inputValidation-errorForeground);opacity:.9}

/* ── Warnings & errors ── */
.warning-bar{font-size:9.5px;line-height:1.35;color:var(--vscode-inputValidation-warningForeground);background:var(--vscode-inputValidation-warningBackground);padding:3px 6px;flex-shrink:0;display:none}
.warning-bar.show{display:block}
.error-card{margin:4px 6px;padding:7px 9px;border-radius:3px;font-size:10.5px;line-height:1.4;color:var(--vscode-inputValidation-errorForeground);background:var(--vscode-inputValidation-errorBackground);border:1px solid var(--vscode-inputValidation-errorBorder);flex-shrink:0;display:none}
.error-card.show{display:block}
.error-card code{background:rgba(0,0,0,.15);padding:0 3px;border-radius:2px;font-family:var(--vscode-editor-font-family,monospace);font-size:10px}

/* ── Context chips ── */
.chip-dock{padding:3px 6px;flex-shrink:0;min-height:24px;display:flex;align-items:center;gap:3px;flex-wrap:wrap}
.chip-hint{font-size:9px;color:var(--vscode-descriptionForeground);opacity:.3}
.chip{display:inline-flex;align-items:center;gap:2px;padding:1px 5px;border-radius:3px;font-size:9px;line-height:1.5;border:1px solid var(--vscode-panel-border);background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);max-width:150px;white-space:nowrap;overflow:hidden}
.chip-label{overflow:hidden;text-overflow:ellipsis}
.chip-remove{display:flex;align-items:center;justify-content:center;width:10px;height:10px;border:none;background:none;color:inherit;cursor:pointer;font-size:10px;opacity:.45;flex-shrink:0}
.chip-remove:hover{opacity:1}
.chip.file{border-color:var(--vscode-charts-blue);color:var(--vscode-charts-blue)}
.chip.selection{border-color:var(--vscode-charts-green);color:var(--vscode-charts-green)}
.chip.diagnostics{border-color:var(--vscode-charts-orange);color:var(--vscode-charts-orange)}
.chip.git{border-color:var(--vscode-charts-purple);color:var(--vscode-charts-purple)}
.chip-clear{font-size:9px;border:none;background:none;color:var(--vscode-descriptionForeground);cursor:pointer;opacity:.35;margin-left:7px;flex-shrink:0}
.chip-clear:hover{opacity:.7}

/* ── Queue dock ── */
.queue-dock{padding:0 6px 4px;flex-shrink:0;display:none}
.queue-dock.show{display:block}
.queue-top{display:flex;align-items:center;justify-content:space-between;font-size:9px;color:var(--vscode-descriptionForeground);opacity:.55;padding:2px 0}
.queue-item{display:flex;align-items:center;justify-content:space-between;font-size:9.5px;color:var(--vscode-descriptionForeground);padding:1px 0}
.queue-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;opacity:.7}
.queue-rm{border:none;background:none;color:var(--vscode-descriptionForeground);cursor:pointer;font-size:10px;opacity:.35}
.queue-rm:hover{opacity:.8}

/* ── Feed ── */
.feed{flex:1;overflow-y:auto;padding:0;scroll-behavior:smooth}
.msg{padding:5px 6px;animation:fadein .15s}
@keyframes fadein{from{opacity:.3;transform:translateY(2px)}to{opacity:1;transform:translateY(0)}}
.msg-row{display:flex;align-items:flex-start;gap:5px}
.msg-gutter{flex-shrink:0;width:2px;border-radius:1px;margin-top:3px;background:transparent;align-self:stretch}
.msg.asst .msg-gutter{background:var(--vscode-textLink-foreground,#8B5CF6);opacity:.4}
.msg.sys .msg-gutter{background:var(--vscode-descriptionForeground);opacity:.18}
.msg-body{flex:1;min-width:0}
.msg-meta{display:flex;align-items:center;justify-content:space-between;margin-bottom:1px}
.msg-who{font-size:8.5px;font-weight:600;text-transform:uppercase;letter-spacing:.35px;color:var(--vscode-descriptionForeground);opacity:.45}
.msg-acts{display:flex;gap:0}
.msg-act{display:none;border:none;background:none;color:var(--vscode-descriptionForeground);cursor:pointer;font-size:9px;padding:0 3px;border-radius:2px;opacity:.45}
.msg:hover .msg-act{display:inline}
.msg-act:hover{opacity:1;background:var(--vscode-toolbar-hoverBackground)}
.msg-act.done{color:var(--vscode-charts-green);opacity:1}
.msg-content{font-size:11.5px;line-height:1.52;white-space:pre-wrap;word-break:break-word;user-select:text;color:var(--vscode-foreground)}
.msg-content.collapsed{max-height:180px;overflow:hidden;position:relative}
.msg-content.collapsed::after{content:'';position:absolute;bottom:0;left:0;right:0;height:32px;background:linear-gradient(transparent,var(--vscode-sideBar-background))}
.show-more{font-size:9.5px;border:none;background:none;color:var(--vscode-textLink-foreground,#8B5CF6);cursor:pointer;padding:1px 0}
.msg-content pre{background:var(--vscode-textCodeBlock-background);border-left:2px solid var(--vscode-textLink-foreground,#8B5CF6);border-radius:0 3px 3px 0;padding:6px 8px;margin:4px 0;overflow-x:auto;font-family:var(--vscode-editor-font-family,monospace);font-size:10.5px;line-height:1.55}
.code-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:3px}
.code-lang{font-size:9px;color:var(--vscode-descriptionForeground);opacity:.55;font-family:var(--vscode-editor-font-family,monospace)}
.code-copy{font-size:9px;border:none;background:none;color:var(--vscode-descriptionForeground);cursor:pointer;opacity:.45;padding:0 4px}
.code-copy:hover{opacity:1}
.msg-content code{background:var(--vscode-textCodeBlock-background);border-radius:2px;padding:1px 3px;font-family:var(--vscode-editor-font-family,monospace);font-size:10.5px}
.msg-content pre code{background:none;padding:0;font-size:inherit}
.msg.user .msg-content{color:var(--vscode-descriptionForeground)}
.msg.sys .msg-content{color:var(--vscode-descriptionForeground);font-style:italic}

/* ── Activity stream ── */
.ac-timeline{font-family:var(--vscode-editor-font-family,monospace);font-size:10.5px;line-height:1.6;padding:2px 0}
.ac-ev{display:flex;align-items:baseline;gap:6px;padding:1px 0}
.ac-ev-type{flex-shrink:0;min-width:40px;font-size:8.5px;font-weight:600;opacity:.6;letter-spacing:.3px;text-align:right}
.ac-ev-msg{flex:1;min-width:0}
.ac-ev-thinking .ac-ev-type{color:var(--vscode-descriptionForeground)}
.ac-ev-todo .ac-ev-type{color:var(--vscode-charts-orange)}
.ac-ev-read .ac-ev-type{color:var(--vscode-charts-blue)}
.ac-ev-write .ac-ev-type{color:var(--vscode-charts-green)}
.ac-ev-edit .ac-ev-type{color:var(--vscode-charts-green)}
.ac-ev-run .ac-ev-type{color:var(--vscode-charts-purple)}
.ac-ev-error .ac-ev-type{color:var(--vscode-inputValidation-errorForeground)}
.ac-ev-error .ac-ev-msg{color:var(--vscode-inputValidation-errorForeground)}
.ac-ev-stdout .ac-ev-type,.ac-ev-stderr .ac-ev-type{opacity:.35}
.ac-empty{font-size:10px;color:var(--vscode-descriptionForeground);opacity:.4;font-style:italic}

/* ── Raw transcript ── */
.raw-transcript{font-family:var(--vscode-editor-font-family,monospace);font-size:10px;line-height:1.5;white-space:pre-wrap;word-break:break-word;padding:4px 0;color:var(--vscode-descriptionForeground)}
.raw-details{font-size:10px;margin-top:6px;color:var(--vscode-descriptionForeground)}
.raw-details summary{cursor:pointer;opacity:.55;margin-bottom:2px}
.raw-details summary:hover{opacity:.8}
.raw-details pre{background:var(--vscode-textCodeBlock-background);border-radius:3px;padding:6px 8px;margin:2px 0;overflow-x:auto;font-family:var(--vscode-editor-font-family,monospace);font-size:10px;line-height:1.5;max-height:200px;overflow-y:auto}

/* ── Empty state ── */
.empty-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;padding:20px;color:var(--vscode-descriptionForeground)}
.empty-title{font-size:11.5px;font-weight:500;margin-bottom:3px;opacity:.6}
.empty-sub{font-size:10px;opacity:.35;margin-bottom:14px;line-height:1.45;max-width:230px}
.empty-suggestions{display:flex;flex-direction:column;gap:5px;width:100%;max-width:250px}
.empty-sugg{font-size:10px;padding:6px 9px;border-radius:3px;border:1px solid var(--vscode-panel-border);background:transparent;color:var(--vscode-descriptionForeground);cursor:pointer;text-align:left;transition:border-color 120ms,color 120ms}
.empty-sugg:hover{border-color:var(--vscode-focusBorder);color:var(--vscode-foreground)}

/* ── Autocomplete ── */
.autocomplete{display:none;border:1px solid var(--vscode-editorWidget-border,var(--vscode-panel-border));border-bottom:none;background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));max-height:170px;overflow-y:auto;font-size:10.5px;flex-shrink:0}
.autocomplete.show{display:block;border-bottom:1px solid var(--vscode-editorWidget-border,var(--vscode-panel-border))}
.ac-item{display:flex;align-items:baseline;gap:6px;padding:3px 6px;cursor:pointer}
.ac-item:hover{background:var(--vscode-list-hoverBackground)}
.ac-item.sel{background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground)}
.ac-prefix{font-size:9px;color:var(--vscode-descriptionForeground);opacity:.5;flex-shrink:0;width:12px}
.ac-name{font-weight:500;white-space:nowrap;flex-shrink:0;font-family:var(--vscode-editor-font-family,monospace);color:var(--vscode-foreground)}
.ac-desc{font-size:9.5px;color:var(--vscode-descriptionForeground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}

/* ── Composer ── */
.composer{border-top:1px solid var(--vscode-sideBar-border,var(--vscode-panel-border));flex-shrink:0}
.composer-row{display:flex;align-items:flex-end;gap:0}
.composer-row textarea{flex:1;resize:none;padding:7px 7px 5px 8px;border:none;background:transparent;color:var(--vscode-input-foreground);font-family:var(--vscode-editor-font-family,monospace);font-size:11px;border-radius:0;min-height:32px;max-height:120px;outline:none;line-height:1.5}
.composer-row textarea::placeholder{color:var(--vscode-input-placeholderForeground);opacity:.35}
.composer-btns{display:flex;flex-direction:column;padding:3px 2px 3px 0;gap:0}
.send-btn{display:flex;align-items:center;justify-content:center;width:26px;height:26px;border:none;background:var(--vscode-button-background);color:var(--vscode-button-foreground);cursor:pointer;border-radius:3px;font-size:13px}
.send-btn:hover{background:var(--vscode-button-hoverBackground)}
.send-btn:disabled{opacity:.18;cursor:not-allowed}
.queue-btn{display:flex;align-items:center;justify-content:center;width:26px;height:20px;border:none;background:transparent;color:var(--vscode-descriptionForeground);cursor:pointer;border-radius:2px;font-size:10px;opacity:.4}
.queue-btn:hover{opacity:1;background:var(--vscode-toolbar-hoverBackground)}
.think-bar{display:flex;align-items:center;gap:5px;font-size:9.5px;color:var(--vscode-descriptionForeground);padding:1px 8px 3px;display:none;opacity:.6}
.think-bar.show{display:flex}
.think-dot{width:4px;height:4px;border-radius:50%;background:var(--vscode-charts-yellow);animation:think-breathe 1.4s ease-in-out infinite}
@keyframes think-breathe{0%,100%{opacity:.25;transform:scale(.8)}50%{opacity:1;transform:scale(1.25)}}`;
}
