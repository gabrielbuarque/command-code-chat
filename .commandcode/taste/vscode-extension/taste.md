# vscode-extension
- Refactor monolithic extension.ts into separate modules: types.ts, state.ts, cliRunner.ts, promptBuilder.ts, and webview/ subdirectory for HTML/styles/script. Confidence: 0.80
- For webview chat UIs, use plain HTML/CSS/JS with no frontend frameworks (no React, Vue, etc.). Inline all styles and scripts in the template string. Confidence: 0.75
- Use `crypto.randomBytes(32).toString("base64")` for CSP nonce generation instead of Math.random(). Confidence: 0.75
- Implement strict Content Security Policy with nonce: `default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'`. Confidence: 0.75
- Never expose Node APIs to webview; use postMessage exclusively for extension-webview communication. Confidence: 0.80
- Use `retainContextWhenHidden: true` in WebviewViewProvider options to preserve webview state when switching tabs. Confidence: 0.70
