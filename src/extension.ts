import { getAppViewContent } from './appView';
import { getManagerViewContent } from './managerView';
import { 
    ModelHandler, 
    handleModelMenuMessage, 
    initializeModels, 
    promptForModelSelection 
} from './modelManager';
import * as dotenv from 'dotenv';
import * as vscode from 'vscode';
import ollama from 'ollama';

dotenv.config();

let modelMenu: vscode.WebviewPanel | undefined;
let panel: vscode.WebviewPanel | undefined;

function openModelManagerPanel(context: vscode.ExtensionContext, handler: ModelHandler) {
    if (!modelMenu) {
        modelMenu = vscode.window.createWebviewPanel('modelMenu', 'Model Manager', vscode.ViewColumn.Beside, { enableScripts: true });
        modelMenu.onDidDispose(() => (modelMenu = undefined));
        modelMenu.webview.onDidReceiveMessage(
            (msg) => handleModelMenuMessage(msg, context, handler, modelMenu, panel)
        );        
        modelMenu.webview.html = getManagerViewContent();
    } else {
        modelMenu.reveal();
    }
}

export async function activate(context: vscode.ExtensionContext) {
    await initializeModels(context);
    const handler = new ModelHandler(context);

    const disposable = vscode.commands.registerCommand('yester-ext.start', async () => {
        panel = vscode.window.createWebviewPanel('yester', 'LLM Chat', vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
        panel.onDidDispose(() => (panel = undefined));
        panel.webview.html = getAppViewContent();

        handler.selectedModelName = (await promptForModelSelection(context, panel)) ?? 'default-model';

        panel.webview.onDidReceiveMessage(async message => {
            if (message.command === 'chat' && panel) {
                try {
                    const modelName = handler.selectedModelName ?? 'default-model';
                    for await (const part of await ollama.chat({
                        model: modelName,
                        messages: [{ role: 'user', content: message.text }],
                        stream: true
                    })) {
                        panel.webview.postMessage({ command: 'chatResponse', text: part.message.content });
                    }
                } catch (error) {
                    console.error('Chat error:', error);
                    panel.webview.postMessage({ command: 'chatResponse', text: 'Error processing your request.' });
                }
            } else if (message.command === 'manager') {
                openModelManagerPanel(context, handler);
            }
        });

        panel.webview.postMessage({ command: 'chatResponse', text: 'Webview is ready to chat!' });
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}