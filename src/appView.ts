export function getAppViewContent(): string {
  // Consider using nonce for CSP: https://code.visualstudio.com/api/extension-guides/webview#security
  // const nonce = getNonce(); // Implement getNonce function if needed
  return /*html*/ `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <!-- Add CSP meta tag -->
          <meta http-equiv="Content-Security-Policy" content="default-src 'none';
            style-src 'unsafe-inline' ${
              /* Add vscode-resource: if loading stylesheets */ ""
            };
            img-src data: https: ${
              /* Add vscode-resource: if loading images */ ""
            };
            script-src 'unsafe-inline';
        ">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>LLM Chat</title>
          <style>
              body {
                  font-family: var(--vscode-font-family, sans-serif);
                  font-size: var(--vscode-font-size);
                  color: var(--vscode-editor-foreground);
                  background-color: var(--vscode-editor-background);
                  margin: 0;
                  padding: 0;
                  display: flex;
                  flex-direction: column;
                  height: 100vh;
              }
              .header {
                  padding: 0.5rem 1rem;
                  border-bottom: 1px solid var(--vscode-editorWidget-border, #444);
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  flex-wrap: wrap;
              }
              .header h2 {
                  margin: 0;
                  font-size: 1.1em;
                  white-space: nowrap;
              }
              .header #modelName {
                  font-weight: normal;
                  font-size: 0.9em;
                  color: var(--vscode-descriptionForeground);
                  margin-left: 0.5em;
              }
               .header .buttons {
                  display: flex;
              }
              button {
                  padding: 0.4em 0.8em;
                  border: 1px solid var(--vscode-button-border, transparent);
                  background-color: var(--vscode-button-background);
                  color: var(--vscode-button-foreground);
                  cursor: pointer;
                  margin-left: 0.5em;
              }
              button:hover {
                  background-color: var(--vscode-button-hoverBackground);
              }
              #chat-container {
                  flex-grow: 1;
                  overflow-y: auto;
                  padding: 1rem;
              }
              #response {
                  white-space: pre-wrap;
                  word-wrap: break-word;
                  font-family: var(--vscode-editor-font-family, monospace);
                  font-size: var(--vscode-editor-font-size);
              }
              .prompt-area {
                  padding: 0.5rem 1rem;
                  border-top: 1px solid var(--vscode-editorWidget-border, #444);
                  display: flex;
                  align-items: flex-start;
              }
              #prompt {
                  flex-grow: 1;
                  /* Use VS Code textarea styles */
                  font-family: var(--vscode-font-family, sans-serif);
                  font-size: var(--vscode-font-size);
                  padding: 0.5em;
                  border: 1px solid var(--vscode-input-border, #ccc);
                  background-color: var(--vscode-input-background);
                  color: var(--vscode-input-foreground);
                  resize: none;
                  margin-right: 0.5em;
                  min-height: 40px;
                  max-height: 150px;
                  overflow-y: auto;
                  box-sizing: border-box;
              }
               #prompt:focus {
                   outline: 1px solid var(--vscode-focusBorder);
                   border-color: var(--vscode-focusBorder);
               }
              /* Style for prompt text display */
               #response > strong {
                   color: var(--vscode-editorInfo-foreground);
               }
          </style>
      </head>
      <body>
          <div class="header">
               <h2>LLM Chat <span id="modelName">(No Model Selected)</span></h2>
              <div class="buttons">
                  <button id="managerBtn" title="Open Model Manager">Manage Models</button>
              </div>
          </div>
  
          <div id="chat-container">
              <div id="response"></div>
          </div>
  
          <div class="prompt-area">
              <textarea id="prompt" rows="2" placeholder="Enter your prompt here... (Shift+Enter for newline)"></textarea>
              <button id="askBtn">Send</button>
          </div>
  
          <script>
              const vscode = acquireVsCodeApi();
              const responseDiv = document.getElementById('response');
              const promptInput = document.getElementById('prompt');
              const modelNameSpan = document.getElementById('modelName');
              const askBtn = document.getElementById('askBtn');
  
              function sendMessage(command, data = {}) {
                  vscode.postMessage({ command, ...data });
              }
  
              function appendToResponse(text, isPrompt = false) {
                  // Sanitize text slightly before adding (more robust sanitization needed for complex HTML)
                  const textNode = document.createTextNode(text);
                  if (isPrompt) {
                      const strong = document.createElement('strong');
                      strong.appendChild(textNode);
                      responseDiv.appendChild(strong);
                  } else {
                      responseDiv.appendChild(textNode);
                  }

                  responseDiv.scrollTop = responseDiv.scrollHeight;
              }
  
  
              askBtn.addEventListener('click', () => {
                  const text = promptInput.value.trim();
                  if (text) {
                      // Append user prompt visually
                      appendToResponse("\\n> " + text + "\\n\\n", true); // Mark as prompt
                      sendMessage('chat', { text });
                      promptInput.value = ''; // Clear input after sending
                      promptInput.style.height = 'auto'; // Reset height
                      promptInput.style.height = promptInput.scrollHeight + 'px'; // Adjust height
                      askBtn.disabled = true; // Disable button while waiting
                      askBtn.textContent = 'Waiting...';
                  }
              });
  
               // Auto-resize textarea
              promptInput.addEventListener('input', () => {
                  promptInput.style.height = 'auto'; // Reset height
                  promptInput.style.height = promptInput.scrollHeight + 'px';
              });
  
               // Handle Shift+Enter for newline, Enter to send
              promptInput.addEventListener('keydown', (event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      askBtn.click();
                  }

                  if (event.key === 'Escape') {
                    sendMessage('close');
                  }
              });
  
              document.getElementById('managerBtn').addEventListener('click', () => {
                  sendMessage('manager');
              });
  
              window.addEventListener('message', event => {
                  const message = event.data;
                  console.log("ChatView received message:", message.command);
                  switch (message.command) {
                      case 'chatResponse':
                           askBtn.disabled = false;
                           askBtn.textContent = 'Send';
                          if (message.clear) {
                              responseDiv.innerHTML = '';
                          }
                          if (message.text) {
                               appendToResponse(message.text);
                           }
                          break;
                      case 'updateModel':
                          modelNameSpan.textContent = \`(\${message.model || 'No Model Selected'})\`;
                          // If no model, maybe disable input?
                          const hasModel = message.model && message.model !== 'No Model Selected';
                          promptInput.disabled = !hasModel;
                          promptInput.placeholder = hasModel ? 'Enter your prompt here... (Shift+Enter for newline)' : 'Select a model via the Manager to chat';
                          // Don't disable send button, let error handling manage it
                          // askBtn.disabled = !hasModel;
                          break;
                  }
              });
  
               // Request the current model when the view loads/reloads
              sendMessage('getModel');
  
          </script>
      </body>
      </html>`;
}
