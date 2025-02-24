export function getManagerViewContent(): string {
  return /*html*/ `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <style>
            body { 
                font-family: sans-serif; 
                margin: 1rem; 
                display: flex; 
                flex-direction: column; 
                align-items: center; 
                text-align: center;
            }
            h2 {
                margin-bottom: 1rem;
            }
            button {
                margin: 0.5rem;
            }
        </style>
    </head>
    <body>
        <h2>Menu</h2>
        <button id="loadBtn">Load</button>
        <button id="addBtn">Add </button>
        <button id="deleteBtn">Delete</button>
    
        <script>
            const vscode = acquireVsCodeApi();
    
            document.getElementById('loadBtn').addEventListener('click', () => {
                vscode.postMessage({ command: 'load' });
            });
    
            document.getElementById('addBtn').addEventListener('click', () => {
                vscode.postMessage({ command: 'add' });
            });
    
            document.getElementById('deleteBtn').addEventListener('click', () => {
                vscode.postMessage({ command: 'delete' });
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
