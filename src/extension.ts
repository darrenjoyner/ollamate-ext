// src/extension.ts
import * as vscode from 'vscode';
import * as dotenv from 'dotenv';
import ollama from 'ollama'; // Needed for chat API calls
// import { TextEncoder } from 'util'; // Not needed without manual file saving

// --- View Content ---
import { getAppViewContent } from "./views/appView";

// --- Model Management ---
import {
    ModelHandler,
    initializeModels,
    addModelManually,    // Assuming these are standalone exported functions
    deleteModel,         // Assuming these are standalone exported functions
    importOllamaModels, // Assuming these are standalone exported functions
    promptForModelSelection // Assuming this is a standalone exported function
} from "./modelManager";

// --- Providers ---
import { ModelManagerViewProvider } from "./providers/modelManagerViewProvider";
import { ChatHistoryProvider, ChatHistoryItem } from './providers/chatHistoryProvider'; // Import ChatHistoryItem

// --- History Management ---
import { ChatMessage } from './chatHistoryTypes'; // Keep ChatMessage for currentChatMessages
import {
    // Use functions from chatHistoryManager
    addOrUpdateChatSession,
    deleteChatSession,
    getChatSessionById,
    generateSummary,
    getChatHistory // Needed for delete prompt fallback
} from './chatHistoryManager';

// --- End Imports ---

dotenv.config();

// --- Global Variables ---
let chatPanel: vscode.WebviewPanel | undefined;
let currentChatMessages: ChatMessage[] = [];
let currentChatId: string | null = null;
let currentModelUsedInSession: string | null = null; // Track model used when session started/loaded

// --- Helper function to send messages to the chat panel ---
function sendChatPanelMessage(message: any) {
    if (chatPanel) {
        chatPanel.webview.postMessage(message).then(
            (success) => {
                if (!success) { console.warn("Posting message may have failed for chat panel."); }
            },
            (error) => { console.error("Error posting message to chat panel:", error); }
        );
    } else {
        // console.log("Chat panel not available to send message."); // Can be noisy
    }
}

// --- Activate Function ---
export async function activate(context: vscode.ExtensionContext) {
    console.log('Ollamate extension activating...');

    // --- Initialize Core Components ---
    const handler = new ModelHandler(context); // Model state manager
    await initializeModels(context, handler); // Check initial models

    const modelManagerProvider = new ModelManagerViewProvider(context.extensionUri, handler);
    const chatHistoryProvider = new ChatHistoryProvider(context);

    // --- Register Providers ---
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

    // --- ModelHandler Event Listeners ---
    handler.on('modelChanged', (newModelName: string | undefined) => {
        console.log(`Event: Model changed to ${newModelName}`);
        sendChatPanelMessage({ command: 'updateModel', model: newModelName });
    });
    handler.on('listChanged', () => { // No direct action needed here, providers handle own updates
        console.log('Event: Model list changed');
    });

    // --- Register Commands ---

    // Model Manager Commands
    context.subscriptions.push(vscode.commands.registerCommand('modelManager.load', async () => {
        const selected = await promptForModelSelection(context, handler, 'Select Model to Use');
        if (selected) { handler.selectedModelName = selected; }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('modelManager.add', async () => {
        await addModelManually(context, handler);
        modelManagerProvider.updateView(); // Refresh manager view list
    }));
    context.subscriptions.push(vscode.commands.registerCommand('modelManager.import', async () => {
        await importOllamaModels(context, handler);
        modelManagerProvider.updateView(); // Refresh manager view list
    }));
    context.subscriptions.push(vscode.commands.registerCommand('modelManager.delete', async () => {
        await deleteModel(context, handler);
        modelManagerProvider.updateView(); // Refresh manager view list
    }));
    context.subscriptions.push(vscode.commands.registerCommand('modelManager.getModel', () => {
        modelManagerProvider.updateView(); // Push update to manager view
    }));

    // Chat History Commands
    context.subscriptions.push(vscode.commands.registerCommand('ollamate.history.refresh', () => {
        chatHistoryProvider.refresh();
        vscode.window.showInformationMessage("Chat history refreshed."); // Optional feedback
    }));

    context.subscriptions.push(vscode.commands.registerCommand('ollamate.history.deleteChat', async (historyItemOrId: ChatHistoryItem | string | undefined) => {
        let sessionIdToDelete: string | undefined = typeof historyItemOrId === 'string' ? historyItemOrId : historyItemOrId?.sessionId;
        let sessionLabel = (historyItemOrId as ChatHistoryItem)?.label || 'selected chat'; // Get label if possible

        // If called from palette without selection, prompt user
        if (!sessionIdToDelete) {
            const history = getChatHistory(context);
            if (history.length === 0) { /* ... show message ... */ return; }
            const items = history.map(s => ({ label: s.name, description: s.modelUsed, id: s.id }));
            const picked = await vscode.window.showQuickPick(items, { title: "Select Chat to Delete" });
            if (!picked) {return;} // User cancelled
            sessionIdToDelete = picked.id;
            sessionLabel = picked.label; // Use picked label
        }

        // Confirmation
        const confirmation = await vscode.window.showWarningMessage(
            `Delete chat session "${sessionLabel}"? This cannot be undone.`,
            { modal: true }, 'Delete'
        );

        if (confirmation === 'Delete') {
            await deleteChatSession(context, sessionIdToDelete);
            chatHistoryProvider.refresh();
            // vscode.window.showInformationMessage("Chat session deleted."); // Optional feedback
            // Clear panel if the deleted chat was the current one
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
        if (!session) { /* ... show error ... */ return; }

        // Save *previous* session if it exists and is different
        if (currentChatId && currentChatId !== sessionId && currentChatMessages.length > 0) {
            console.log(`Saving previous chat ${currentChatId} before loading ${sessionId}`);
            const summary = generateSummary(currentChatMessages); // Use helper
            await addOrUpdateChatSession(context, {
                id: currentChatId, name: summary, timestamp: parseInt(currentChatId, 10),
                modelUsed: currentModelUsedInSession ?? "Unknown", messages: [...currentChatMessages]
            });
            chatHistoryProvider.refresh(); // Refresh after saving previous
        }

        // Ensure chat panel is open (creates/reveals, does NOT save current session again)
        if (!chatPanel) {
            await vscode.commands.executeCommand('ollamate-ext.start', { skipSave: true }); // Pass flag to skip save in start
        }
         if (!chatPanel) { /* handle error */ return; }


        // Update state to loaded session
        console.log(`Loading chat session: ${sessionId}`);
        currentChatId = session.id;
        currentChatMessages = [...session.messages];
        currentModelUsedInSession = session.modelUsed;

        // Send data to webview
        sendChatPanelMessage({
            command: 'loadChat',
            messages: session.messages,
            modelUsedDisplay: session.modelUsed, // Pass historical model for display potentially
            currentModel: handler.selectedModelName // Pass currently selected model
        });
        chatPanel.reveal(vscode.ViewColumn.Beside);
    }));


    // Start Chat / Create Panel Command
    const disposableStart = vscode.commands.registerCommand(
        "ollamate-ext.start",
        async (options?: { skipSave?: boolean }) => { // Accept options object
            console.log("Command: ollamate-ext.start triggered.");

            // Save previous session *unless* skipSave is true (e.g., called from loadChat)
            // or if panel already exists
            if (!options?.skipSave && !chatPanel && currentChatId && currentChatMessages.length > 0) {
                console.log(`Saving previous chat session ${currentChatId} before starting new one.`);
                const summary = generateSummary(currentChatMessages);
                await addOrUpdateChatSession(context, {
                    id: currentChatId, name: summary, timestamp: parseInt(currentChatId, 10),
                    modelUsed: currentModelUsedInSession ?? "Unknown", messages: [...currentChatMessages]
                });
                chatHistoryProvider.refresh();
                 // Reset state before creating new panel only if not skipping save
                 currentChatId = null;
                 currentChatMessages = [];
                 currentModelUsedInSession = null;
            }

            // If panel exists, reveal
            if (chatPanel) {
                console.log("Chat panel exists. Revealing.");
                chatPanel.reveal(vscode.ViewColumn.Beside);
                sendChatPanelMessage({ command: 'updateModel', model: handler.selectedModelName });
                return;
            }

            // --- Create NEW Panel and Session ---
            console.log("Creating new chat panel and session.");
            // Reset state IF NOT loading (loading sets state *after* panel creation)
            if (!options?.skipSave) { // Only reset if starting truly fresh
                currentChatId = Date.now().toString();
                currentChatMessages = [];
                currentModelUsedInSession = handler.selectedModelName ?? null; // Capture current model
            } else {
                 console.log("Skipping state reset for new panel (likely loading chat).");
                 // State should have been set by loadChat before calling start with skipSave
            }


            chatPanel = vscode.window.createWebviewPanel(
                "ollamateChat", // Internal ID
                "Ollamate Chat", // Title
                vscode.ViewColumn.Beside, // Show beside
                { // Webview options
                    enableScripts: true,
                    retainContextWhenHidden: true, // Keep state when hidden
                    localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')] // Allow loading from media
                }
            );

            chatPanel.onDidDispose(async () => {
                console.log("Chat panel disposed.");
                 // Save the session that was just closed
                 if (currentChatMessages.length > 0 && currentChatId) {
                     console.log(`Saving chat session ${currentChatId} on dispose.`);
                     const summary = generateSummary(currentChatMessages);
                     await addOrUpdateChatSession(context, {
                         id: currentChatId, name: summary, timestamp: parseInt(currentChatId, 10),
                         modelUsed: currentModelUsedInSession ?? "Unknown", messages: [...currentChatMessages]
                     });
                     chatHistoryProvider.refresh();
                 }
                 // Clear global state associated with the closed panel
                 currentChatId = null;
                 currentChatMessages = [];
                 currentModelUsedInSession = null;
                 chatPanel = undefined; // Clear the panel reference
            }, null, context.subscriptions);

            // Set initial HTML
            chatPanel.webview.html = getAppViewContent(chatPanel.webview, context.extensionUri);

            // --- Handle messages FROM CHAT webview ---
            chatPanel.webview.onDidReceiveMessage(
                async (message) => {
                    switch (message.command) {
                        case "chat": {
                            const userText = message.text;
                            const currentModel = handler.selectedModelName; // Model for this interaction
                            if (!currentModel) { sendChatPanelMessage({ command: "chatResponse", text: "\nError: No model selected." }); return; }
                            if (!userText) { sendChatPanelMessage({ command: "chatResponse", text: "\nError: Empty prompt." }); return; }
                            if (!currentChatId) { console.error("Error: No active chat ID."); return; }

                            // If this is the first message in a *new* session, set the session model
                            if (currentChatMessages.length === 0) {
                                currentModelUsedInSession = currentModel;
                                console.log(`Set model for new session ${currentChatId} to ${currentModel}`);
                            }

                            // Store User Message
                            currentChatMessages.push({ role: 'user', content: userText });

                            try {
                                sendChatPanelMessage({ command: "setThinking", thinking: true });

                                // Send context (ensure it doesn't exceed model limits - advanced)
                                // For now, send all messages from the current session
                                const messagesToSend = currentChatMessages.map(m => ({ role: m.role, content: m.content }));

                                const stream = await ollama.chat({ model: currentModel, messages: messagesToSend, stream: true });

                                let fullResponse = "";
                                for await (const part of stream) {
                                    if (!chatPanel) {break;} // Stop if panel closed
                                    const chunk = part.message.content;
                                    fullResponse += chunk;
                                    // Send chunks for streaming display
                                    sendChatPanelMessage({ command: "chatResponse", text: chunk });
                                }

                                // Store full Assistant Message once stream is done
                                if (fullResponse && chatPanel) {
                                    currentChatMessages.push({ role: 'assistant', content: fullResponse });
                                    // Add final newline in webview after response is fully appended
                                    sendChatPanelMessage({ command: "chatResponse", text: "\n" });
                                }

                            } catch (error: any) {
                                console.error("Ollama chat error:", error);
                                const errorMsg = `\nError: ${error.message ?? "Unknown Ollama communication error."}`;
                                sendChatPanelMessage({ command: "chatResponse", text: errorMsg });
                                // Also store error in history? Maybe not.
                            } finally {
                                if (chatPanel) {sendChatPanelMessage({ command: "setThinking", thinking: false });}
                            }
                            break;
                        } // End case "chat"

                        case "getModel": {
                            sendChatPanelMessage({ command: 'updateModel', model: handler.selectedModelName });
                            break;
                        }
                        case "log": {
                            console.log("Chat Webview log:", message.data);
                            break;
                        }
                        case 'clearDisplayRequest': { // Renamed for clarity
                            console.log("Webview requested display clear (likely during load).");
                            break;
                        }
                        default:
                            console.warn("Received unknown command from chat webview:", message.command);
                    } // End switch
                } // End message handler
            ); // End onDidReceiveMessage

             // Send initial model state AFTER setting HTML and message handler
             sendChatPanelMessage({ command: 'updateModel', model: handler.selectedModelName });

        } // End start command handler
    ); // End registerCommand

    context.subscriptions.push(disposableStart);
    console.log('Ollamate extension fully activated.');

} // End activate

// --- Deactivate Function ---
export function deactivate() {
    console.log('Ollamate extension deactivating.');
    // Panel disposal handles saving the last session via its onDidDispose listener
    // No need to explicitly save here unless the panel might still be open
    // if (chatPanel) { chatPanel.dispose(); } // Let VS Code handle this
}