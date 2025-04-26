// src/extension.ts
import * as vscode from 'vscode';
import * as dotenv from 'dotenv';
import ollama from 'ollama';
import { getAppViewContent } from "./views/appView";
import {
    ModelHandler,
    initializeModels,
    addModelManually,    // Assuming these are standalone exported functions
    deleteModel,         // Assuming these are standalone exported functions
    importOllamaModels, // Assuming these are standalone exported functions
    promptForModelSelection // Assuming this is a standalone exported function
} from "./modelManager";
import { ModelManagerViewProvider } from "./providers/modelManagerViewProvider";
import { ChatHistoryProvider, ChatHistoryItem } from './providers/chatHistoryProvider'; // Import ChatHistoryItem
import { ChatMessage } from './chatHistoryTypes'; // Keep ChatMessage for currentChatMessages
import {
    // Use functions from chatHistoryManager
    addOrUpdateChatSession,
    deleteChatSession,
    getChatSessionById,
    generateSummary,
    getChatHistory // Needed for delete prompt fallback
} from './chatHistoryManager';

dotenv.config();

let chatPanel: vscode.WebviewPanel | undefined;
let currentChatMessages: ChatMessage[] = [];
let currentChatId: string | null = null;
let currentModelUsedInSession: string | null = null; // Track model used when session started/loaded

/**
 * Helper function to send messages to the chat panel
 * @param {*} message
 */
function sendChatPanelMessage(message: any) {
    if (chatPanel) {
        chatPanel.webview.postMessage(message).then(
            (success) => {
                if (!success) { console.warn("Posting message may have failed for chat panel."); }
            },
            (error) => { console.error("Error posting message to chat panel:", error); }
        );
    }
}

/**
 * Helper to Save Current Session
 * Encapsulates the saving logic to be called from multiple places
 * @param {vscode.ExtensionContext} context
 * @param {ChatHistoryProvider} historyProvider
 * @return {*}  {Promise<boolean>}
 */
async function saveCurrentSession(context: vscode.ExtensionContext, historyProvider: ChatHistoryProvider): Promise<boolean> {
    if (currentChatMessages.length > 0 && currentChatId) {
        console.log(`Saving chat session ${currentChatId}. Model: ${currentModelUsedInSession ?? 'Unknown'}`);
        const summary = generateSummary(currentChatMessages);
        await addOrUpdateChatSession(context, {
            id: currentChatId,
            name: summary,
            timestamp: parseInt(currentChatId, 10),
            modelUsed: currentModelUsedInSession ?? "Unknown",
            messages: [...currentChatMessages]
        });
        historyProvider.refresh();
        return true;
    }
    console.log("Skipping save: No active session or no messages.");
    return false;
}

/**
 * Helper to Start a New Sessio
 * Encapsulates resetting state for a new chat
 * @param {(string | null)} selectedModel
 */
function startNewSession(selectedModel: string | null) {
    console.log(`Starting new session state. Initial model: ${selectedModel ?? 'None'}`);
    currentChatId = Date.now().toString();
    currentChatMessages = [];
    currentModelUsedInSession = selectedModel; // Capture model for the new session
}

/**
 * Activate Function
 * @export
 * @param {vscode.ExtensionContext} context
 */
export async function activate(context: vscode.ExtensionContext) {
    console.log('Ollamate extension activating...');

    const handler = new ModelHandler(context);
    await initializeModels(context, handler);

    const modelManagerProvider = new ModelManagerViewProvider(context.extensionUri, handler);

    const chatHistoryProvider = new ChatHistoryProvider(context);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            ModelManagerViewProvider.viewType,
            modelManagerProvider,
            { webviewOptions: { retainContextWhenHidden: true } } // Keep manager state
        )
    );
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('chatHistoryView', chatHistoryProvider)
    );
    console.log("Webview and TreeView providers registered.");

    handler.on('modelChanged', async (newModelName: string | undefined) => {
        const newModel = newModelName ?? null;
        console.log(`Event: Model changed to ${newModel ?? 'None'}`);

        if (chatPanel && currentChatId && newModel !== currentModelUsedInSession) {
            console.log(`Model changed while chat panel active (Session: ${currentChatId}, Old Model: ${currentModelUsedInSession}, New Model: ${newModel}). Saving session and starting new one.`);

            await saveCurrentSession(context, chatHistoryProvider);

            startNewSession(newModel);

            sendChatPanelMessage({ command: 'clearDisplay' }); // Clear the old chat visually
            sendChatPanelMessage({ command: 'updateModel', model: newModel }); // Update to new model
        } else if (chatPanel) {
            console.log("Model changed event: Only updating webview display.");
            sendChatPanelMessage({ command: 'updateModel', model: newModel });
        } else {
            console.log("Model changed event: Chat panel not open, no action needed.");
        }
    });

    handler.on('listChanged', () => {
        console.log('Event: Model list changed');
    });

    context.subscriptions.push(vscode.commands.registerCommand('modelManager.load', async () => {
        const selected = await promptForModelSelection(context, handler, 'Select Model to Use');
        if (selected) { handler.selectedModelName = selected; }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('modelManager.add', async () => {
        await addModelManually(context, handler);
        modelManagerProvider.updateView();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('modelManager.import', async () => {
        await importOllamaModels(context, handler);
        modelManagerProvider.updateView();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('modelManager.delete', async () => {
        await deleteModel(context, handler);
        modelManagerProvider.updateView();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('modelManager.getModel', () => {
        modelManagerProvider.updateView();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('ollamate.history.refresh', () => {
        chatHistoryProvider.refresh();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('ollamate.history.deleteChat', async (historyItemOrId: ChatHistoryItem | string | undefined) => {
        let sessionIdToDelete: string | undefined = typeof historyItemOrId === 'string' ? historyItemOrId : historyItemOrId?.sessionId;
        let sessionLabel = (historyItemOrId as ChatHistoryItem)?.label || 'selected chat';

        if (!sessionIdToDelete) {
            const history = getChatHistory(context);
            if (history.length === 0) { vscode.window.showInformationMessage("No chat history to delete."); return; }
            const items = history.map(s => ({ label: s.name, description: s.modelUsed, id: s.id }));
            const picked = await vscode.window.showQuickPick(items, { title: "Select Chat to Delete" });
            if (!picked) {return;}
            sessionIdToDelete = picked.id;
            sessionLabel = picked.label;
        }

        const confirmation = await vscode.window.showWarningMessage(
            `Delete chat session "${sessionLabel}"? This cannot be undone.`,
            { modal: true }, 'Delete'
        );

        if (confirmation === 'Delete') {
            await deleteChatSession(context, sessionIdToDelete);
            chatHistoryProvider.refresh();

            if (currentChatId === sessionIdToDelete) {
                currentChatId = null;
                currentChatMessages = [];
                currentModelUsedInSession = null;
                if (chatPanel) {
                    sendChatPanelMessage({ command: 'clearDisplay' });
                    sendChatPanelMessage({ command: 'updateModel', model: handler.selectedModelName });
                }
            }
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('ollamate.history.loadChat', async (sessionId: string) => {
        if (!sessionId) { return; }
        const session = getChatSessionById(context, sessionId);
        if (!session) { vscode.window.showErrorMessage(`Chat session ${sessionId} not found.`); chatHistoryProvider.refresh(); return; }

        if (currentChatId && currentChatId !== sessionId) {
            await saveCurrentSession(context, chatHistoryProvider);
        }

        if (!chatPanel) {
            await vscode.commands.executeCommand('ollamate-ext.start', { skipSave: true, initialModel: session.modelUsed });
        }
        if (!chatPanel) { vscode.window.showErrorMessage("Failed to create or find chat panel."); return; }

        console.log(`Loading chat session: ${sessionId}, Model Used: ${session.modelUsed}`);
        currentChatId = session.id;
        currentChatMessages = [...session.messages];
        currentModelUsedInSession = session.modelUsed;

        sendChatPanelMessage({
            command: 'loadChat',
            messages: session.messages,
            currentModel: handler.selectedModelName
        });
        chatPanel.reveal(vscode.ViewColumn.Beside);
    }));

    const disposableStart = vscode.commands.registerCommand(
        "ollamate-ext.start",
        async (options?: { skipSave?: boolean, initialModel?: string | null }) => {
            console.log(`Command: ollamate-ext.start triggered. Options: ${JSON.stringify(options)}`);

            if (!options?.skipSave && !chatPanel && currentChatId && currentChatMessages.length > 0) {
                await saveCurrentSession(context, chatHistoryProvider);
                currentChatId = null;
                currentChatMessages = [];
                currentModelUsedInSession = null;
            }

            if (chatPanel) {
                console.log("Chat panel exists. Revealing.");
                chatPanel.reveal(vscode.ViewColumn.Beside);
                sendChatPanelMessage({ command: 'updateModel', model: handler.selectedModelName });
                return;
            }

            console.log("Creating new chat panel and session.");

            let modelForNewSession: string | null;
             if (options?.skipSave && options?.initialModel !== undefined) {
                 modelForNewSession = options.initialModel;
                 console.log(`Using initial model from loadChat options: ${modelForNewSession}`);
             } else {
                 modelForNewSession = handler.selectedModelName ?? null;
                 if (!modelForNewSession && handler.availableModels.length > 0) {
                     modelForNewSession = handler.availableModels[0];
                     console.log(`Auto-selecting first available model: ${modelForNewSession}`);
                 } else {
                      console.log(`Using currently selected model: ${modelForNewSession}`);
                 }
             }
            startNewSession(modelForNewSession ?? null);

            chatPanel = vscode.window.createWebviewPanel(
                "ollamateChat",
                "Ollamate Chat",
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
                }
            );

            chatPanel.onDidDispose(async () => {
                console.log("Chat panel disposed.");

                await saveCurrentSession(context, chatHistoryProvider);

                currentChatId = null;
                currentChatMessages = [];
                currentModelUsedInSession = null;
                chatPanel = undefined;
            }, null, context.subscriptions);

            chatPanel.webview.html = getAppViewContent(chatPanel.webview, context.extensionUri);

            chatPanel.webview.onDidReceiveMessage(
                async (message) => {
                    switch (message.command) {
                        case "chat": {
                            const userText = message.text;
                            const currentModelSelected = handler.selectedModelName;
                            if (!currentModelSelected) { /*...*/ return; }
                            if (!userText) { /*...*/ return; }
                            if (!currentChatId) { /*...*/ return; }

                            const modelToUse = currentModelUsedInSession ?? currentModelSelected;

                            if (currentChatMessages.length === 0 && modelToUse) {
                                currentModelUsedInSession = modelToUse;
                                console.log(`Set model for new session ${currentChatId} to ${currentModelUsedInSession}`);
                            }

                            if (!modelToUse) { /* Handle error: no model determined */ return; }

                            currentChatMessages.push({ role: 'user', content: userText });

                            try {
                                sendChatPanelMessage({ command: "setThinking", thinking: true });
                                const messagesToSend = currentChatMessages.map(m => ({ role: m.role, content: m.content }));
                                console.log(`Sending chat to Ollama. Model: ${modelToUse}, History Length: ${messagesToSend.length}`);

                                const stream = await ollama.chat({ model: modelToUse, messages: messagesToSend, stream: true });
                                let fullResponse = "";
                                for await (const part of stream) {
                                    if (!chatPanel) {break;}
                                    const chunk = part.message.content;
                                    fullResponse += chunk;
                                    sendChatPanelMessage({ command: "chatResponse", text: chunk });
                                }

                                if (fullResponse && chatPanel) {
                                    currentChatMessages.push({ role: 'assistant', content: fullResponse });
                                    sendChatPanelMessage({ command: "chatResponse", text: "\n" });
                                }
                            } catch (error: any) {
                                console.error("Ollama chat error:", error);
                                const errorMsg = `\nError: ${error.message ?? "Unknown Ollama communication error."}`;
                                sendChatPanelMessage({ command: "chatResponse", text: errorMsg });
                            } finally {
                                if (chatPanel) { sendChatPanelMessage({ command: "setThinking", thinking: false }); }
                            }
                            break;
                        }

                        case "getModel": {
                            console.log("[Extension] Received 'getModel'. Sending:", handler.selectedModelName);
                            sendChatPanelMessage({ command: 'updateModel', model: handler.selectedModelName });
                            break;
                        }
                        case "log": {
                            console.log("Chat Webview log:", message.data);
                            break;
                        }
                        case 'clearDisplayRequest': {
                            console.log("Webview confirmed display cleared (likely during load).");
                            break;
                        }
                        default:
                            console.warn("Received unknown command from chat webview:", message.command);
                    }
                }
            );

            console.log("Sending initial model state to new webview:", handler.selectedModelName);

            setTimeout(() => {
                 sendChatPanelMessage({ command: 'updateModel', model: handler.selectedModelName });
            }, 100);


        }
    );

    context.subscriptions.push(disposableStart);
    console.log('Ollamate extension fully activated.');

}

/**
 * Deactivate Function
 * @export
 */
export function deactivate() {
    console.log('Ollamate extension deactivating.');
}