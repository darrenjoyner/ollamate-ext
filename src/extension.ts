// src/extension.ts
import * as vscode from "vscode";
import * as dotenv from "dotenv";
import ollama from "ollama"; // Use default import

// --- View Content ---
import { getAppViewContent } from "./views/appView";

// --- Model Management ---
import {
	ModelHandler,
	initializeModels,
	addModelManually,
	deleteModel,
	importOllamaModels,
	promptForModelSelection,
} from "./modelManager";

// --- Providers ---
import { ModelManagerViewProvider } from "./providers/modelManagerViewProvider";
import {
	ChatHistoryProvider,
	ChatHistoryItem,
} from "./providers/chatHistoryProvider";

// --- History Management ---
import { ChatMessage } from "./chatHistoryTypes";
import {
	addOrUpdateChatSession,
	deleteChatSession,
	getChatSessionById,
	generateSummary,
	getChatHistory,
} from "./chatHistoryManager";

// --- End Imports ---

dotenv.config();

// --- Global Variables ---
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
				if (!success) {
					console.warn("Posting message may have failed for chat panel.");
				}
			},
			(error) => {
				console.error("Error posting message to chat panel:", error);
			}
		);
	}
}

/**
 * Helper to Save Current Session
 * @param {vscode.ExtensionContext} context
 * @param {ChatHistoryProvider} historyProvider
 * @return {*}  {Promise<boolean>}
 */
async function saveCurrentSession(
	context: vscode.ExtensionContext,
	historyProvider: ChatHistoryProvider
): Promise<boolean> {
	if (currentChatMessages.length > 0 && currentChatId) {
		console.log(
			`Saving chat session ${currentChatId}. Model: ${
				currentModelUsedInSession ?? "Unknown"
			}`
		);
		const summary = generateSummary(currentChatMessages);
		await addOrUpdateChatSession(context, {
			id: currentChatId,
			name: summary,
			timestamp: parseInt(currentChatId, 10),
			modelUsed: currentModelUsedInSession ?? "Unknown",
			messages: [...currentChatMessages],
		});
		historyProvider.refresh();
		return true;
	}
	console.log("Skipping save: No active session or no messages.");
	return false;
}

/**
 * Helper to Start a New Session
 * @param {(string | null)} selectedModel
 */
function startNewSession(selectedModel: string | null) {
	console.log(
		`Starting new session state. Initial model: ${selectedModel ?? "None"}`
	);
	currentChatId = Date.now().toString();
	currentChatMessages = [];
	currentModelUsedInSession = selectedModel;
}

/**
 * Activate Function
 * @export
 * @param {vscode.ExtensionContext} context
 */
export async function activate(context: vscode.ExtensionContext) {
	console.log("Ollamate extension activating...");

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration("ollamate.maxHistory")) {
				console.log("Max history configuration changed.");
			}
			if (
				e.affectsConfiguration("ollamate.defaultModel") ||
				e.affectsConfiguration("ollamate.defaultSystemPrompt") ||
				e.affectsConfiguration("ollamate.chatTemperature")
			) {
				console.log("Other Ollamate settings changed.");
			}
		})
	);

	const handler = new ModelHandler(context);
	await initializeModels(context, handler);

	const modelManagerProvider = new ModelManagerViewProvider(
		context.extensionUri,
		handler
	);
	const chatHistoryProvider = new ChatHistoryProvider(context);

	// --- Register Providers ---
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			ModelManagerViewProvider.viewType,
			modelManagerProvider,
			{ webviewOptions: { retainContextWhenHidden: true } }
		)
	);
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider(
			"chatHistoryView",
			chatHistoryProvider
		)
	);
	console.log("Webview and TreeView providers registered.");

	// --- ModelHandler Event Listeners ---
	handler.on("modelChanged", async (newModelName: string | undefined) => {
		const newModel = newModelName ?? null;
		console.log(`Event: Model changed to ${newModel ?? "None"}`);

		if (chatPanel && currentChatId && newModel !== currentModelUsedInSession) {
			console.log(
				`Model changed while chat panel active (Session: ${currentChatId}, Old Model: ${currentModelUsedInSession}, New Model: ${newModel}). Saving session and starting new one.`
			);
			await saveCurrentSession(context, chatHistoryProvider);
			startNewSession(newModel);
			sendChatPanelMessage({ command: "clearDisplay" });
			sendChatPanelMessage({ command: "updateModel", model: newModel });
		} else if (chatPanel) {
			sendChatPanelMessage({ command: "updateModel", model: newModel });
		}
	});

	handler.on("listChanged", () => {
		console.log("Event: Model list changed");
	});

	// --- Register Commands ---

	// Model Manager Commands
	context.subscriptions.push(
		vscode.commands.registerCommand("modelManager.load", async () => {
			const selected = await promptForModelSelection(
				context,
				handler,
				"Select Model to Use"
			);
			if (selected) {
				handler.selectedModelName = selected;
			}
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand("modelManager.add", async () => {
			await addModelManually(context, handler);
			modelManagerProvider.updateView();
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand("modelManager.import", async () => {
			await importOllamaModels(context, handler);
			modelManagerProvider.updateView();
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand("modelManager.delete", async () => {
			await deleteModel(context, handler);
			modelManagerProvider.updateView();
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand("modelManager.getModel", () => {
			modelManagerProvider.updateView();
		})
	);

	// Chat History Commands
	context.subscriptions.push(
		vscode.commands.registerCommand("ollamate.history.refresh", () => {
			chatHistoryProvider.refresh();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"ollamate.history.deleteChat",
			async (historyItemOrId: ChatHistoryItem | string | undefined) => {
				let sessionIdToDelete: string | undefined =
					typeof historyItemOrId === "string"
						? historyItemOrId
						: historyItemOrId?.sessionId;
				let sessionLabel =
					(historyItemOrId as ChatHistoryItem)?.label || "selected chat";

				if (!sessionIdToDelete) {
					// Prompt if called from palette
					const history = getChatHistory(context);
					if (history.length === 0) {
						vscode.window.showInformationMessage("No chat history to delete.");
						return;
					}
					const items = history.map((s) => ({
						label: s.name,
						description: s.modelUsed,
						id: s.id,
					}));
					const picked = await vscode.window.showQuickPick(items, {
						title: "Select Chat to Delete",
					});
					if (!picked) {
						return;
					}
					sessionIdToDelete = picked.id;
					sessionLabel = picked.label;
				}

				const confirmation = await vscode.window.showWarningMessage(
					`Delete chat session "${sessionLabel}"? This cannot be undone.`,
					{ modal: true },
					"Delete"
				);
				if (confirmation === "Delete") {
					await deleteChatSession(context, sessionIdToDelete);
					chatHistoryProvider.refresh();
					if (currentChatId === sessionIdToDelete) {
						currentChatId = null;
						currentChatMessages = [];
						currentModelUsedInSession = null;
						if (chatPanel) {
							sendChatPanelMessage({ command: "clearDisplay" });
							sendChatPanelMessage({
								command: "updateModel",
								model: handler.selectedModelName,
							});
						}
					}
				}
			}
		)
	);

	// Inside activate function
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"ollamate.history.loadChat",
			async (arg: ChatHistoryItem | string | undefined) => {
				let sessionIdToLoad: string | undefined;
				let sessionLabel = "selected chat";

				// Determine the actual session ID based on the argument type
				if (typeof arg === "string") {
					sessionIdToLoad = arg;
					console.log(
						`Load chat command triggered with string ID: ${sessionIdToLoad}`
					);
				} else if (arg?.sessionId) {
					sessionIdToLoad = arg.sessionId;
					sessionLabel = arg.label || sessionLabel;
					console.log(
						`Load chat command triggered with TreeItem object. ID: ${sessionIdToLoad}, Label: ${sessionLabel}`
					);
				} else {
					console.error(
						"Load chat command called with invalid or missing argument:",
						arg
					);

					const history = getChatHistory(context);
					if (history.length === 0) {
						vscode.window.showInformationMessage("No chat history to load.");
						return;
					}
					const items = history.map((s) => ({
						label: s.name,
						description: s.modelUsed,
						id: s.id,
					}));
					const picked = await vscode.window.showQuickPick(items, {
						title: "Select Chat to Load",
					});
					if (!picked) {
						return;
					}
					sessionIdToLoad = picked.id;
					sessionLabel = picked.label;
					console.log(`User picked session to load: ${sessionIdToLoad}`);
				}

				if (!sessionIdToLoad || typeof sessionIdToLoad !== "string") {
					vscode.window.showErrorMessage(
						"Failed to determine which chat session to load."
					);
					return;
				}

				const session = getChatSessionById(context, sessionIdToLoad);
				if (!session) {
					vscode.window.showErrorMessage(
						`Chat session "${sessionLabel}" (ID: ${sessionIdToLoad}) not found.`
					);
					chatHistoryProvider.refresh();
					return;
				}

				// --- Save previous session if needed ---
				if (currentChatId && currentChatId !== sessionIdToLoad) {
					await saveCurrentSession(context, chatHistoryProvider);
				}

				// --- Ensure chat panel is open ---
				if (!chatPanel) {
					await vscode.commands.executeCommand("ollamate-ext.start", {
						skipSave: true,
						initialModel: session.modelUsed,
					});
				}
				if (!chatPanel) {
					/* handle error */ return;
				}

				// --- Update state to loaded session ---
				console.log(
					`Loading chat session: ${sessionIdToLoad}, Model Used: ${session.modelUsed}`
				);
				currentChatId = session.id;
				currentChatMessages = [...session.messages];
				currentModelUsedInSession = session.modelUsed;

				// --- Send data to webview ---
				sendChatPanelMessage({
					command: "loadChat",
					messages: session.messages,
					currentModel: handler.selectedModelName,
				});
				chatPanel.reveal(vscode.ViewColumn.Beside);
			}
		)
	);

	/** 
   * Start Chat / Create Panel Command
   * @type {*} 
   */
  const disposableStart = vscode.commands.registerCommand(
		"ollamate-ext.start",
		async (options?: { skipSave?: boolean; initialModel?: string | null }) => {
			console.log(
				`Command: ollamate-ext.start triggered. Options: ${JSON.stringify(
					options
				)}`
			);
			const currentConfig = vscode.workspace.getConfiguration("ollamate");

			if (
				!options?.skipSave &&
				!chatPanel &&
				currentChatId &&
				currentChatMessages.length > 0
			) {
				await saveCurrentSession(context, chatHistoryProvider);
				currentChatId = null;
				currentChatMessages = [];
				currentModelUsedInSession = null;
			}

			if (chatPanel) {
				console.log("Chat panel exists. Revealing.");
				chatPanel.reveal(vscode.ViewColumn.Beside);
				sendChatPanelMessage({
					command: "updateModel",
					model: handler.selectedModelName,
				});
				return;
			}

			console.log("Creating new chat panel and session.");
			let modelForNewSession: string | null;
			if (options?.skipSave && options?.initialModel !== undefined) {
				modelForNewSession = options.initialModel;
			} else {
				const defaultModel = currentConfig.get<string>("defaultModel", "");
				modelForNewSession =
					handler.selectedModelName ?? (defaultModel || null);
				if (!modelForNewSession && handler.availableModels.length > 0) {
					modelForNewSession = handler.availableModels[0];
				}
				console.log(
					`Determined model for new session: ${modelForNewSession ?? "None"}`
				);
			}
			startNewSession(modelForNewSession ?? null);

			chatPanel = vscode.window.createWebviewPanel(
				"ollamateChat",
				"Ollamate Chat",
				vscode.ViewColumn.Beside,
				{
					enableScripts: true,
					retainContextWhenHidden: true,
					localResourceRoots: [
						vscode.Uri.joinPath(context.extensionUri, "media"),
					],
				}
			);

			chatPanel.onDidDispose(
				async () => {
					console.log("Chat panel disposed.");
					await saveCurrentSession(context, chatHistoryProvider);
					currentChatId = null;
					currentChatMessages = [];
					currentModelUsedInSession = null;
					chatPanel = undefined;
				},
				null,
				context.subscriptions
			);

			chatPanel.webview.html = getAppViewContent(
				chatPanel.webview,
				context.extensionUri
			);

			chatPanel.webview.onDidReceiveMessage(
				async (message) => {
					const messageConfig = vscode.workspace.getConfiguration("ollamate");

					switch (message.command) {
						case "chat": {
							const userText = message.text;
							const currentModelSelected = handler.selectedModelName;
							if (!currentModelSelected) {
								/* Send error */ return;
							}
							if (!userText) {
								/* Send error */ return;
							}
							if (!currentChatId) {
								/* Error */ return;
							}

							const modelToUse =
								currentModelUsedInSession ?? currentModelSelected;
							if (!modelToUse) {
								/* Send error */ return;
							}

							if (currentChatMessages.length === 0) {
								currentModelUsedInSession = modelToUse;
								console.log(
									`Set model for session ${currentChatId} to ${currentModelUsedInSession}`
								);
							}

							const systemPrompt = messageConfig.get<string>(
								"defaultSystemPrompt",
								""
							);
							let messagesToSend: ChatMessage[] = [];
							if (currentChatMessages.length === 0 && systemPrompt) {
								messagesToSend.push({ role: "system", content: systemPrompt });
							}
							messagesToSend = messagesToSend.concat(
								currentChatMessages.map((m) => ({
									role: m.role,
									content: m.content,
								}))
							);
							messagesToSend.push({ role: "user", content: userText });

							currentChatMessages.push({ role: "user", content: userText });

							try {
								sendChatPanelMessage({
									command: "setThinking",
									thinking: true,
								});
								const timeoutSetting = messageConfig.get<number>(
									"requestTimeout",
									120000
								);
								const ollamaOptions: any = {};

								console.log(
									`Sending chat to Ollama. Model: ${modelToUse}, Timeout: ${timeoutSetting}ms`
								);
								const stream = await ollama.chat({
									model: modelToUse,
									messages: messagesToSend,
									stream: true,
									options: ollamaOptions,
								});

								let fullResponse = "";
								for await (const part of stream) {
									if (!chatPanel) {
										break;
									}
									const chunk = part.message.content;
									fullResponse += chunk;
									sendChatPanelMessage({
										command: "chatResponse",
										text: chunk,
									});
								}

								// Store full assistant response
								if (fullResponse && chatPanel) {
									currentChatMessages.push({
										role: "assistant",
										content: fullResponse,
									});
									sendChatPanelMessage({ command: "chatResponse", text: "\n" }); // Add final newline
								}
							} catch (error: any) {
								console.error("Ollama chat error:", error);
								const errorMsg = `\nError: ${
									error.message ?? "Unknown Ollama communication error."
								}`;
								sendChatPanelMessage({
									command: "chatResponse",
									text: errorMsg,
								});
							} finally {
								if (chatPanel) {
									sendChatPanelMessage({
										command: "setThinking",
										thinking: false,
									});
								}
							}
							break;
						} // End case "chat"

						case "getModel": {
							console.log(
								"[Extension] Received 'getModel'. Sending:",
								handler.selectedModelName
							);
							sendChatPanelMessage({
								command: "updateModel",
								model: handler.selectedModelName,
							});
							break;
						}
						case "log": {
							console.log("Chat Webview log:", message.data);
							break;
						}
						case "clearDisplayRequest": {
							console.log(
								"Webview confirmed display cleared (likely during load)."
							);
							break;
						}
						default:
							console.warn(
								"Received unknown command from chat webview:",
								message.command
							);
					} // End switch
				} // End message handler
			); // End onDidReceiveMessage

			// Send initial model state *after* HTML and handlers are set
			console.log(
				"Sending initial model state to new webview:",
				handler.selectedModelName
			);
			sendChatPanelMessage({
				command: "updateModel",
				model: handler.selectedModelName,
			});
		} // End start command handler
	); // End registerCommand

	context.subscriptions.push(disposableStart);
	console.log("Ollamate extension fully activated.");
} // End activate

// --- Deactivate Function ---
export function deactivate() {
	console.log("Ollamate extension deactivating.");
	// Panel disposal listener handles saving the last session.
}
