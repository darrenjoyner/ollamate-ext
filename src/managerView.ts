export function getManagerViewContent(): string {
  return /*html*/ `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Model Manager</title>
          <style>
              body {
                  font-family: var(--vscode-font-family, sans-serif);
                  font-size: var(--vscode-font-size);
                  color: var(--vscode-editor-foreground);
                  background-color: var(--vscode-sideBar-background, var(--vscode-editor-background));
                  margin: 0;
                  padding: 1rem;
                  display: flex;
                  flex-direction: column;
                  align-items: stretch;
              }
              h2 {
                  text-align: center;
                  margin-top: 0;
                  margin-bottom: 1rem;
                  color: var(--vscode-sideBar-foreground);
              }
              .current-model {
                   text-align: center;
                   margin-bottom: 1.5rem;
                   font-size: 0.9em;
                   color: var(--vscode-descriptionForeground);
              }
               #currentModelName {
                   font-weight: bold;
                   color: var(--vscode-list-highlightForeground);
               }
              .button-group {
                  display: flex;
                  flex-direction: column;
                  gap: 0.75rem;
              }
              button {
                  padding: 0.6em 1em;
                  border: 1px solid var(--vscode-button-border, transparent);
                  background-color: var(--vscode-button-background);
                  color: var(--vscode-button-foreground);
                  cursor: pointer;
                  text-align: center;
                  width: 100%;
                  box-sizing: border-box;
              }
              button:hover {
                  background-color: var(--vscode-button-hoverBackground);
              }
               button#deleteBtn {
                  background-color: var(--vscode-errorForeground);
                  color: var(--vscode-button-foreground);
                  opacity: 0.8;
               }
               button#deleteBtn:hover {
                   opacity: 1;
                   background-color: var(--vscode-errorForeground);
               }
              /* Could add a list of available models here later */
              /*.model-list {
                  margin-top: 1.5rem;
                  border-top: 1px solid var(--vscode-sideBar-border);
                  padding-top: 1rem;
              } */
          </style>
      </head>
      <body>
          <h2>Model Manager</h2>
  
          <div class="current-model">
              Current Model: <span id="currentModelName">Loading...</span>
          </div>
  
          <div class="button-group">
              <button id="loadBtn" title="Select a model from the list to use for chat">Select / Load / List Model</button>
              <button id="addBtn" title="Manually add a model name to the list">Add Model Manually</button>
              <button id="importBtn" title="Import models found in your Ollama installation">Import from Ollama</button>
              <button id="deleteBtn" title="Remove a model from the list">Delete Model from List</button>
          </div>
  
          <!-- Placeholder for listing available models -->
          <!-- <div class="model-list">
              <h3>Available Models</h3>
              <ul id="availableModelsList"></ul>
          </div> -->
  
          <script>
              const vscode = acquireVsCodeApi();
              const currentModelSpan = document.getElementById('currentModelName');
              // const availableModelsUl = document.getElementById('availableModelsList');
  
              function sendMessage(command) {
                  vscode.postMessage({ command });
              }
  
              document.getElementById('loadBtn').addEventListener('click', () => sendMessage('load'));
              document.getElementById('addBtn').addEventListener('click', () => sendMessage('add'));
              document.getElementById('importBtn').addEventListener('click', () => sendMessage('import'));
              document.getElementById('deleteBtn').addEventListener('click', () => sendMessage('delete'));
  
              window.addEventListener('message', event => {
                  const message = event.data;
                   console.log("ManagerView received message:", message.command);
                  if (message.command === 'updateModel') {
                      currentModelSpan.textContent = message.model || 'None';
  
                      // Optionally update a displayed list of available models
                      /*
                      if (message.availableModels && availableModelsUl) {
                          availableModelsUl.innerHTML = ''; // Clear list
                          message.availableModels.forEach(model => {
                              const li = document.createElement('li');
                              li.textContent = model;
                              if (model === message.model) {
                                  li.style.fontWeight = 'bold';
                              }
                              availableModelsUl.appendChild(li);
                          });
                      }
                      */
                  }
              });
  
              sendMessage('getModel');
          </script>
      </body>
      </html>`;
}
