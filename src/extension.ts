import { getAppViewContent } from "./views/appView";
import {
  ModelHandler,
  initializeModels,
  promptForModelSelection,
  openModelManagerPanel,
} from "./modelManager";
import * as dotenv from "dotenv";
import * as vscode from "vscode";
import ollama from "ollama";

dotenv.config();

let chatPanel: vscode.WebviewPanel | undefined;
let modelHandlerInstance: ModelHandler | undefined;

/**
 * Activates the extension. Initializes models, registers commands, creates the chat panel.
 * @param {interface} context 
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log('Extension "yester-ext" activating...');

  await initializeModels(context);
  const handler = new ModelHandler(context);

  const disposable = vscode.commands.registerCommand(
    "yester-ext.start",
    async () => {
      if (chatPanel) {
        chatPanel.reveal(vscode.ViewColumn.Beside);
        return;
      }

      chatPanel = vscode.window.createWebviewPanel(
        "yesterChat",
        "LLM Chat",
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        }
      );

      chatPanel.onDidDispose(
        () => {
          console.log("Chat panel disposed");
          chatPanel = undefined;
          handler.modelMenu?.dispose();
        },
        null,
      );

      chatPanel.webview.html = getAppViewContent();

      /**
       * Function to safely send messages to the chat panel webview
       * @param {String} message 
       */
      function sendChatPanelMessage(message: any) {
        if (chatPanel) {
          chatPanel.webview.postMessage(message).then(
            (success) => {
              if (!success) {
                console.warn("Failed to post message to chat panel webview.");
              }
            },
            (error) => {
              console.error(
                "Error posting message to chat panel webview:",
                error
              );
            }
          );
        } else {
          console.warn(
            "Attempted to send message, but chat panel is undefined."
          );
        }
      }

      /**
       * Function to update the model name in the chat panel title area
       * @param {String} modelName 
       */
      function updateChatPanelTitle(modelName: string | undefined) {
        sendChatPanelMessage({
          command: "updateModel",
          model: modelName ?? "No Model Selected",
        });
      }

      let selectedModel = handler.selectedModelName;
      if (
        !selectedModel ||
        selectedModel === "No Model" ||
        !handler.availableModels.includes(selectedModel)
      ) {
        if (handler.availableModels.length > 0) {
          selectedModel = await promptForModelSelection(context, chatPanel);
          if (!selectedModel) {
            sendChatPanelMessage({
              command: "chatResponse",
              text: "No model selected. Please select a model using the Manager.",
              clear: true,
            });
            handler.selectedModelName = undefined;
          } else {
            handler.selectedModelName = selectedModel;
            sendChatPanelMessage({
              command: "chatResponse",
              text: `Model "${selectedModel}" selected. Ready to chat!`,
              clear: true,
            });
          }
        } else {
          sendChatPanelMessage({
            command: "chatResponse",
            text: "No models available. Use the Manager to add or import models.",
            clear: true,
          });
          handler.selectedModelName = undefined;
        }
      }

      updateChatPanelTitle(handler.selectedModelName);

      chatPanel.webview.onDidReceiveMessage(
        async (message) => {
          console.log("Received message from chat webview:", message.command);
          switch (message.command) {
            case "chat": {
              const currentModel = handler.selectedModelName;
              if (!currentModel || currentModel === "No Model") {
                sendChatPanelMessage({
                  command: "chatResponse",
                  text: "Error: No model selected. Use the Manager.",
                  clear: true,
                });
                return;
              }
              if (!message.text || message.text.trim() === "") {
                sendChatPanelMessage({
                  command: "chatResponse",
                  text: "Error: Cannot send empty prompt.",
                  clear: true,
                });
                return;
              }

              try {
                sendChatPanelMessage({
                  command: "chatResponse",
                  text: "",
                  clear: true,
                });
                sendChatPanelMessage({
                  command: "chatResponse",
                  text: `\n> ${message.text}\n\n`,
                  clear: false,
                });

                const stream = await ollama.chat({
                  model: currentModel,
                  messages: [{ role: "user", content: message.text }],
                  stream: true,
                });

                for await (const part of stream) {
                  if (!chatPanel) {
                    console.warn(
                      "Chat panel closed during streaming response."
                    );
                    break;
                  }
                  sendChatPanelMessage({
                    command: "chatResponse",
                    text: part.message.content,
                    clear: false,
                  });
                }
                sendChatPanelMessage({
                  command: "chatResponse",
                  text: "\n",
                  clear: false,
                });
              } catch (error: any) {
                console.error("Ollama chat error:", error);
                const errorMessage = `Error: ${
                  error.message ||
                  "An unknown error occurred contacting Ollama."
                }`;
                sendChatPanelMessage({
                  command: "chatResponse",
                  text: errorMessage,
                  clear: false,
                });
              }
              break;
            }

            case "manager": {
              openModelManagerPanel(context, handler, chatPanel);
              break;
            }

            case "getModel": {
              updateChatPanelTitle(handler.selectedModelName);
              break;
            }

            case "log": {
              console.log("Webview log:", message.data);
              break;
            }

            default:
              console.warn(
                "Received unknown command from chat webview:",
                message.command
              );
          }
        },
        undefined,
        context.subscriptions
      );
    }
  );

  context.subscriptions.push(disposable);
  console.log('Extension "yester-ext" activated.');
}

/**
 * Closes extension
 */
export function deactivate() {
  console.log('Extension "yester-ext" deactivated.');
  if (chatPanel) {
    chatPanel.dispose();
  } else {
    console.log("No active chat panel found during deactivation.");
  }
  if (modelHandlerInstance?.modelMenu && !chatPanel) {
    console.log(
      "Disposing manager panel explicitly during deactivation (chat panel was already closed)."
    );
    modelHandlerInstance.modelMenu?.dispose();
  }

  modelHandlerInstance = undefined;
  chatPanel = undefined;
}
