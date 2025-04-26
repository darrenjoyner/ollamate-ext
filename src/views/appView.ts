// src/views/appView.ts
import * as vscode from 'vscode';


/**
 *
 *
 * @return {*} 
 */
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}


/**
 *
 *
 * @export
 * @param {vscode.Webview} webview
 * @param {vscode.Uri} extensionUri
 * @return {*}  {string}
 */
export function getAppViewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const nonce = getNonce();


    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'chatViewStyles.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'chatViewScript.js'));

    console.log("Style URI:", styleUri.toString());
    console.log("Script URI:", scriptUri.toString());

    return /*html*/ `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            
            <!-- Strict Content-Security-Policy -->
            <meta http-equiv="Content-Security-Policy" content="
                default-src 'none';
                style-src ${webview.cspSource} 'unsafe-inline';
                style-src-elem ${webview.cspSource};
                script-src 'nonce-${nonce}';
                img-src ${webview.cspSource} https: data:;
                font-src ${webview.cspSource};
                connect-src ${webview.cspSource};
            ">

            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            
            <!-- Link external stylesheet -->
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${styleUri}" rel="stylesheet"> 
            
            <title>Ollamate Chat</title> 
        </head>
        <body>
            <!-- Header -->
            <div class="header">
                <h2>Chat <span id="modelName">(Loading...)</span></h2>
            </div>
    
            <!-- Chat container -->
            <div id="chat-container" role="log" aria-live="polite">
                <div id="response"></div>
            </div>
    
            <!-- Prompt input area -->
            <div class="prompt-area">
                <textarea id="prompt" rows="1" 
                          placeholder="Select a model via the Manager to chat" 
                          aria-label="Chat prompt input" disabled></textarea>
                <button id="send-button" title="Send message (Enter)" aria-label="Send message" disabled>Send</button> 
            </div>

            <!-- Link external script -->
            <script nonce="${nonce}" src="${scriptUri}"></script> 
        </body>
        </html>
    `;
}