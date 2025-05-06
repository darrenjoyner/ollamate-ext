// src/views/managerView.ts
import * as vscode from "vscode";

function getNonce() {
	let text = "";
	const possible =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

export function getManagerViewContent(
	webview: vscode.Webview,
	extensionUri: vscode.Uri
): string {
	const nonce = getNonce();

	// --- Generate URIs for external files ---
	const styleUri = webview.asWebviewUri(
		vscode.Uri.joinPath(extensionUri, "media", "managerStyles.css")
	);
	const scriptUri = webview.asWebviewUri(
		vscode.Uri.joinPath(extensionUri, "media", "managerScript.js")
	);

	console.log("Manager Style URI:", styleUri.toString());
	console.log("Manager Script URI:", scriptUri.toString());

	return /*html*/ `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">

            <!-- Updated Content Security Policy - removed 'unsafe-inline' for styles -->
            <meta http-equiv="Content-Security-Policy" content="
                default-src 'none';
                style-src ${webview.cspSource}; 
                script-src 'nonce-${nonce}';
                img-src ${webview.cspSource} https: data:;
                font-src ${webview.cspSource};
            ">

            <meta name="viewport" content="width=device-width, initial-scale=1.0">

            <!-- Link external CSS -->
            <link href="${styleUri}" rel="stylesheet">

            <title>Ollamate Manager</title>
        </head>
        <body class="model-manager-view">
            <h2>Ollamate</h2>

            <div class="current-model">
                Current Model: <span id="currentModelName">Loading...</span>
            </div>

            <div class="button-group">
                <button id="openChatBtn" title="Open the chat panel">Open Chat</button>
                <button id="loadBtn" title="Select a model from the list to use for chat">Select Model</button>
                <button id="addBtn" title="Manually add a model name to the list">Add Model Manually</button>
                <button id="importBtn" title="Import models found in your Ollama installation">Import from Ollama</button>
                <button id="deleteBtn" title="Remove a model from the list">Delete Model from List</button>
            </div>

            <div class="model-list">
                <h3>Available Models</h3>
                <ul id="availableModelsList">
                   <li>(Loading models...)</li>
                </ul>
            </div>

            <!-- Link external JS -->
            <script nonce="${nonce}" src="${scriptUri}"></script>
        </body>
        </html>`;
}
