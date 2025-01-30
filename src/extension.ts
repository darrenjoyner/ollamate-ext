import * as vscode from 'vscode';
import ollama from 'ollama';
;

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('yester-ext.start', () => {
        const panel = vscode.window.createWebviewPanel(
            'deepChat',
            'Deep Seek Chat',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        panel.webview.html = getWebviewContent();

        panel.webview.onDidReceiveMessage(async (message: any) => {
            if (message.command === 'chat') {
                const userPrompt = message.text;
                try {
                    const streamResponse = await ollama.chat({
                        model: 'deepseek-r1:14b',
                        messages: [{ role: 'user', content: userPrompt }],
                        stream: true
                    });

                    for await (const part of streamResponse) {
                        panel.webview.postMessage({ command: 'chatResponse', text: part.message.content });
                    }
                } catch (error) {
                    panel.webview.postMessage({ command: 'chatResponse', text: `Error: ${String(error)}` });
                    console.error('Chat error:', error);
                }
            } else if (message.command === 'close') {
                panel.dispose();
            }
        });
    });

    context.subscriptions.push(disposable);
}

function getWebviewContent(): string {
    return /*html*/`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: sans-serif; margin: 1rem; }
            #prompt { width: 100%; box-sizing: border-box; }
            #response { border: 1px solid #ccc; margin-top: 1rem; padding: 0.5rem; min-height: 100px; white-space: pre-wrap; }
        </style>
    </head>
    <body>
        <h2>Deep VS Code</h2>
        <textarea id="prompt" rows="3" placeholder="Ask something..."></textarea><br>
        <button id="askBtn">Ask</button>
        <div id="response"></div>

        <script>
            const vscode = acquireVsCodeApi();

            document.getElementById('askBtn').addEventListener('click', () => {
                const text = document.getElementById('prompt').value;
                if (text.trim() === '') return; // Prevent empty requests
                document.getElementById('response').textContent = "Generating response...";
                vscode.postMessage({ command: 'chat', text });
            });

            window.addEventListener('message', function(event) {
                const message = event.data;
                if (message.command === 'chatResponse') {
                    document.getElementById('response').textContent += message.text;
                }
            });

            document.addEventListener('keydown', function(event) {
                if (event.key === 'Escape') {
                    vscode.postMessage({ command: 'close' });
                }
            });
        </script>
    </body>
    </html>`;
}

export function deactivate() {}

