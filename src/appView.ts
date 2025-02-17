export function getAppViewContent(): string {
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
        <h2 id="title">yester <span id="modelName">(Model)</span></h2>
        <textarea id="prompt" rows="3" placeholder="Ask something..."></textarea><br>
        <button id="askBtn">Ask</button>
        <button id="managerBtn">LLM Manager</button>
        <div id="response"></div>

        <script>
            const vscode = acquireVsCodeApi();

            document.getElementById('askBtn').addEventListener('click', () => {
                const text = document.getElementById('prompt').value;
                if (text.trim() === '') return; // Prevent empty requests
                document.getElementById('response').textContent = "Generating response...";
                vscode.postMessage({ command: 'chat', text });
            });

            document.getElementById('managerBtn').addEventListener('click', () => {
                vscode.postMessage({ command: 'manager'});
            });

            window.addEventListener('message', function(event) {
                const message = event.data;
                if (message.command === 'chatResponse') {
                    document.getElementById('response').textContent += message.text;
                } else if (message.command === 'updateModel') {
                    document.getElementById('modelName').textContent = "(" + message.model + ")";
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
