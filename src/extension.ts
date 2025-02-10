import { getAppViewContent } from './appView';
import * as dotenv from 'dotenv';
import * as vscode from 'vscode';
import ollama from 'ollama';

dotenv.config();

// Define available models for selection
const availableModels = [
    { name: 'deepseek-r1:14b'},
    { name: 'deepseek-r1:32b'},
    { name: 'deepseek-r1:70b'},
    // Add more models as needed
];

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('yester-ext.start', async () => {
        // Prompt user to select a model
        const selectedModelName = await promptForModelSelection();
        if (!selectedModelName) { return; } // Handle cancellation

        // Store the selected model in the extension context
        context.workspaceState.update('selectedModel', selectedModelName);

        const panel = vscode.window.createWebviewPanel(
            'yester',
            'LLM Chat',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );
        
        panel.webview.html = getAppViewContent();

        // Listen for messages from the webview (user input)
        panel.webview.onDidReceiveMessage(async (message: any) => {
            if (message.command === 'chat') {
                const userPrompt = message.text;
                try {
                    // Call ollama.chat directly for local model
                    const streamResponse = await ollama.chat({
                        model: selectedModelName,
                        messages: [{ role: 'user', content: userPrompt }],
                        stream: true
                    });

                    // Send the response parts to the webview
                    for await (const part of streamResponse) {
                        panel.webview.postMessage({
                            command: 'chatResponse',
                            text: part.message.content
                        });
                    }
                } catch (error) {
                    console.error('Error in chat:', error);
                    panel.webview.postMessage({
                        command: 'chatResponse',
                        text: 'An error occurred while processing your request.'
                    });
                }
            }
        });

        // Initially inform the webview it's ready to chat
        panel.webview.postMessage({ command: 'chatResponse', text: 'Webview is ready to chat!' });
    });

    context.subscriptions.push(disposable);
}

//TODO: work in models.ts
async function promptForModelSelection(): Promise<string | undefined> {
    const options = availableModels.map(model => ({
        label: model.name,
    }));

    const result = await vscode.window.showQuickPick(options, {
        canPickMany: false,
        title: 'Select a model'
    });

    return result?.label;
}

export function deactivate() {}


