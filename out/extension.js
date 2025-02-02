"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const dotenv = require("dotenv");
const vscode = require("vscode");
const ollama_1 = require("ollama");
dotenv.config();
// Define available models for selection
const availableModels = [
    { name: 'deepseek-r1:14b' },
    { name: 'deepseek-r1:32b' },
    { name: 'deepseek-r1:70b' },
    // Add more models as needed
];
function activate(context) {
    const disposable = vscode.commands.registerCommand('yester-ext.start', async () => {
        // Prompt user to select a model
        const selectedModelName = await promptForModelSelection();
        if (!selectedModelName) {
            return;
        } // Handle cancellation
        // Store the selected model in the extension context
        context.workspaceState.update('selectedModel', selectedModelName);
        const panel = vscode.window.createWebviewPanel('yester', 'LLM Chat', vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
        });
        panel.webview.html = getWebviewContent();
        // Listen for messages from the webview (user input)
        panel.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'chat') {
                const userPrompt = message.text;
                try {
                    // Call ollama.chat directly for local model
                    const streamResponse = await ollama_1.default.chat({
                        model: selectedModelName,
                        messages: [{ role: 'user', content: userPrompt }],
                        stream: true
                    });
                    // Send the response parts to the webview
                    for await (const part of streamResponse) {
                        panel.webview.postMessage({
                            command: 'chatResponse',
                            text: part.message.content
                        });
                    }
                }
                catch (error) {
                    console.error('Error in chat:', error);
                    panel.webview.postMessage({
                        command: 'chatResponse',
                        text: 'An error occurred while processing your request.'
                    });
                }
            }
        });
        // Initially inform the webview it's ready to chat
        panel.webview.postMessage({ command: 'chatResponse', text: 'Webview is ready to chat!' });
    });
    context.subscriptions.push(disposable);
}
async function promptForModelSelection() {
    const options = availableModels.map(model => ({
        label: model.name,
    }));
    const result = await vscode.window.showQuickPick(options, {
        canPickMany: false,
        title: 'Select a model'
    });
    return result?.label;
}
function getWebviewContent() {
    return /*html*/ `
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
function deactivate() {}
//# sourceMappingURL=extension.js.map