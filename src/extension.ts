import { getAppViewContent } from './appView';
import { getManagerViewContent } from './managerView';
import { ModelHandler, promptForModelSelection } from './modelManager';
import * as dotenv from 'dotenv';
import * as vscode from 'vscode';
import ollama from 'ollama';

dotenv.config();

let modelMenu: vscode.WebviewPanel | undefined; // Declare globally
let panel: vscode.WebviewPanel | undefined; // Ensure this is at the top

// Function to handle Model Menu messages
async function handleModelMenuMessage(message: any, context: vscode.ExtensionContext, handler: ModelHandler) {
    if (message.command === 'load' && modelMenu) {  
        const llm = await promptForModelSelection(modelMenu);
        if (llm) {
            handler.selectedModelName = llm;
            context.workspaceState.update('selectedModel', llm);
            modelMenu.webview.postMessage({ command: 'updateModel', model: llm });

            if (panel) {
                panel.webview.postMessage({ command: 'updateModel', model: llm });
            } else {
                console.warn("⚠️ Chat panel is not open, model change won't be visible immediately.");
            }

            console.log("✅ Model updated:", llm);
        }
    } else if (message.command === 'save') {
        console.log("🚀 ~ Save Command Triggered");
    } else if (message.command === 'delete') {
        console.log("🚀 ~ Delete Command Triggered");
    }
}

// Function to open the Model Manager Panel
function openModelManagerPanel(context: vscode.ExtensionContext, handler: ModelHandler) {
    if (!modelMenu) {
        modelMenu = vscode.window.createWebviewPanel(
            'modelMenu',
            'Model Manager',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        modelMenu.onDidDispose(() => {
            modelMenu = undefined;
        });

        modelMenu.webview.onDidReceiveMessage((message) => handleModelMenuMessage(message, context, handler));
    }

    modelMenu.webview.html = getManagerViewContent();
}

export function activate(context: vscode.ExtensionContext) {
    const handler = new ModelHandler();

    const disposable = vscode.commands.registerCommand('yester-ext.start', async () => {
        panel = vscode.window.createWebviewPanel(
            'yester',
            'LLM Chat',
            vscode.ViewColumn.Beside,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        // Set the WebView content first
        panel.webview.html = getAppViewContent();

        // Ensure the WebView is fully loaded before sending updates
        setTimeout(async () => {
            const llm = await promptForModelSelection(panel);
            if (llm) {
                handler.selectedModelName = llm;
                context.workspaceState.update('selectedModel', llm);
                panel?.webview.postMessage({ command: 'updateModel', model: llm });
            }
        }, 300); // Small delay to ensure WebView is ready

        panel.webview.onDidReceiveMessage(async (message: any) => {
            if (message.command === 'chat') {
                const userPrompt = message.text;
                try {
                    const streamResponse = await ollama.chat({
                        model: handler.selectedModelName,
                        messages: [{ role: 'user', content: userPrompt }],
                        stream: true
                    });

                    for await (const part of streamResponse) {
                        panel?.webview.postMessage({
                            command: 'chatResponse',
                            text: part.message.content
                        });
                    }
                } catch (error) {
                    console.error('Error in chat:', error);
                    panel?.webview.postMessage({
                        command: 'chatResponse',
                        text: 'An error occurred while processing your request.'
                    });
                }
            } else if (message.command === 'manager') {
                openModelManagerPanel(context, handler);
            }
        });

        // Send initial ready message
        panel.webview.postMessage({ command: 'chatResponse', text: 'Webview is ready to chat!' });
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}