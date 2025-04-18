import * as vscode from "vscode";
import * as dotenv from "dotenv";
import ollama from "ollama";

import { getAppViewContent } from "./views/appView";
import {
    ModelHandler,
    initializeModels,
    addModelManually,
    deleteModel,
    importOllamaModels,
    promptForModelSelection
} from "./modelManager";
import { ModelManagerViewProvider } from "./providers/modelManagerViewProvider";

dotenv.config();

// --- Global Variables ---

let chatPanel: vscode.WebviewPanel | undefined;

/**
 * Helper function to safely send messages to the chat panel webview.
 * Defined outside the command scope to be accessible by event listeners.
 * @param message The message object to send.
 */
function sendChatPanelMessage(message: any) {
    if (chatPanel) {
        chatPanel.webview.postMessage(message).then(
            (success) => {
                if (!success) {
                    console.warn("Posting message may have failed for chat panel.");
                }
            },
            (error) => {
                console.error("Error posting message to chat panel webview:", error);
            }
        );
    } else {
        // This is expected if the panel is closed when an event fires
        // console.log("Chat panel not available to send message.");
    }
}


/**
 * Activates the VS Code extension.
 * Sets up the ModelHandler, registers the Activity Bar view provider,
 * registers commands, and sets up event listeners.
 * @param context The extension context provided by VS Code.
 */
export async function activate(context: vscode.ExtensionContext) {
    console.log('Extension "ollamate-ext" activating...');

    // --- Initialization ---

    const handler = new ModelHandler(context);

    await initializeModels(context, handler);

    // --- Register Activity Bar View Provider ---
    const modelManagerProvider = new ModelManagerViewProvider(context.extensionUri, handler);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            ModelManagerViewProvider.viewType,
            modelManagerProvider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );
    console.log("Model Manager View Provider registered.");

    handler.on('modelChanged', (newModelName: string | undefined) => {
        console.log(`Handler emitted modelChanged event: ${newModelName ?? 'None'}`);
        sendChatPanelMessage({
            command: 'updateModel',
            model: newModelName ?? "No Model Selected"
        });

        sendChatPanelMessage({ command: 'chatResponse', text: `Model changed to: ${newModelName ?? 'None'}`, clear: false });
    });

    handler.on('listChanged', (models: string[]) => {
        console.log(`Handler emitted listChanged event. New list size: ${models.length}`);
    });


    // --- Register Commands ---

    // Commands triggered by the Model Manager Activity Bar View
    context.subscriptions.push(
        vscode.commands.registerCommand('modelManager.load', async () => {
            console.log("Command: modelManager.load");
            // Use the refactored promptForModelSelection
            const selected = await promptForModelSelection(context, handler, 'Select Model to Load');
            if (selected) {
                handler.selectedModelName = selected;
                vscode.window.showInformationMessage(`Model "${selected}" selected.`);
            } else {
                 vscode.window.showInformationMessage("Model selection cancelled.");
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('modelManager.add', async () => {
            console.log("Command: modelManager.add");
            await addModelManually(context, handler);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('modelManager.import', async () => {
            console.log("Command: modelManager.import");
            await importOllamaModels(context, handler);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('modelManager.delete', async () => {
            console.log("Command: modelManager.delete");
            await deleteModel(context, handler);
        })
    );

    // Command for the manager view's JS to request initial/current state
    context.subscriptions.push(
        vscode.commands.registerCommand('modelManager.getModel', () => {
            console.log("Command: modelManager.getModel");
            modelManagerProvider.updateView();
        })
    );

    // Command to start/show the Chat Webview Panel
    const disposableStart = vscode.commands.registerCommand(
        "ollamate-ext.start",
        async () => {
            console.log("Command: ollamate-ext.start");
            if (chatPanel) {
                console.log("Chat panel exists. Revealing.");
                chatPanel.reveal(vscode.ViewColumn.Beside);
                 sendChatPanelMessage({ command: 'updateModel', model: handler.selectedModelName ?? "No Model Selected" });
                return;
            }

            console.log("Creating new chat panel.");
            chatPanel = vscode.window.createWebviewPanel(
                "ollamateChat",
                "Ollamate Chat",
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                }
            );

            // Handle panel disposal
            chatPanel.onDidDispose(
                () => {
                    console.log("Chat panel disposed.");
                    chatPanel = undefined;
                },
                null,
                context.subscriptions
            );

            // Set initial HTML content
            chatPanel.webview.html = getAppViewContent(chatPanel.webview, context.extensionUri);
            
            /**
             * Function to update the chat panel's title area (via message)
             * Defined locally as it primarily uses sendChatPanelMessage
             * @param {(string | undefined)} modelName
             */
            function updateChatPanelTitle(modelName: string | undefined) {
                sendChatPanelMessage({
                    command: "updateModel",
                    model: modelName ?? "No Model Selected",
                });
            }

            // --- Initialize model state FOR the chat panel ---
            let selectedModel = handler.selectedModelName;
            if (!selectedModel && handler.availableModels.length > 0) {
                console.log("No model selected, but models available. Auto-selecting first.");
                selectedModel = handler.availableModels[0];
                handler.selectedModelName = selectedModel;
                sendChatPanelMessage({ command: 'chatResponse', text: `Using model: ${selectedModel}`, clear: true });
            } else if (!selectedModel) {
                 console.log("No model selected and none available.");
                 sendChatPanelMessage({ command: 'chatResponse', text: `No models available. Use the Manager (Activity Bar icon) to add/import.`, clear: true });
            }
            updateChatPanelTitle(handler.selectedModelName);


            // --- Handle messages FROM the CHAT webview ---
            chatPanel.webview.onDidReceiveMessage(
                async (message) => {
                    console.log("Received message from chat webview:", message.command);
                    switch (message.command) {
                        case "chat": {
                            const currentModel = handler.selectedModelName;
                            if (!currentModel) {
                                sendChatPanelMessage({ command: "chatResponse", text: "Error: No model selected. Use the Manager.", clear: true });
                                return;
                            }
                            if (!message.text || message.text.trim() === "") {
                                sendChatPanelMessage({ command: "chatResponse", text: "Error: Cannot send empty prompt.", clear: true });
                                return;
                            }

                            try {
                                console.log("Sending 'setThinking: true' to chat webview");
                                sendChatPanelMessage({ command: "setThinking", thinking: true });
                                sendChatPanelMessage({ command: "chatResponse", text: `\n> ${message.text}\n\n`, clear: false });
                                sendChatPanelMessage({ command: "setThinking", thinking: true });

                                const stream = await ollama.chat({
                                    model: currentModel,
                                    messages: [{ role: "user", content: message.text }],
                                    stream: true,
                                });

                                // Stream response chunks
                                for await (const part of stream) {
                                  if (!chatPanel) {
                                      break;
                                  }
                                  sendChatPanelMessage({
                                      command: "chatResponse",
                                      text: part.message.content,
                                      clear: false,
                                  });
                              }
                                if (chatPanel) {
                                    sendChatPanelMessage({ command: "chatResponse", text: "\n", clear: false });
                                }

                            } catch (error: any) {
                                console.error("Ollama chat error:", error);
                                const errorMessage = `Error: ${error.message || "Unknown error contacting Ollama."}`;
                                sendChatPanelMessage({ command: "chatResponse", text: errorMessage, clear: false });
                            } finally {
                                sendChatPanelMessage({ command: "setThinking", thinking: false });
                            }
                            break;
                        }

                        case "getModel": {
                            updateChatPanelTitle(handler.selectedModelName);
                            break;
                        }
                        case "log": {
                            console.log("Chat Webview log:", message.data);
                            break;
                        }
                        default:
                            console.warn("Received unknown command from chat webview:", message.command);
                    }
                },
                undefined,
                context.subscriptions
            );
        }
    );

    context.subscriptions.push(disposableStart);

    console.log('Extension "ollamate-ext" fully activated.');
}


/**
 * Deactivates the extension.
 * VS Code handles disposing disposables added to context.subscriptions.
 */
export function deactivate() {
    console.log('Extension "ollamate-ext" deactivated.');
    if (chatPanel) {
        chatPanel.dispose();
    }
    chatPanel = undefined;
}