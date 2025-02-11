import { getAppViewContent } from './appView';
import * as dotenv from 'dotenv';
import * as vscode from 'vscode';
import ollama from 'ollama';

dotenv.config();

class ModelHandler {
    private _selectedModelName: string = '';

    get selectedModelName(): string {
        return this._selectedModelName;
    }

    set selectedModelName(model: string) {
        this._selectedModelName = model;
        console.log(`Model set to: ${model}`);
    }
}

// Define available models for selection
const availableModels = [
    { name: 'deepseek-r1:14b'},
    { name: 'deepseek-r1:32b'},
    { name: 'deepseek-r1:70b'},
    // Add more models as needed
];

export function activate(context: vscode.ExtensionContext) {
    const handler = new ModelHandler();
    const disposable = vscode.commands.registerCommand('yester-ext.start', async () => {
        // Prompt user to select a model
        const llm = await promptForModelSelection(); // Await the async call
        if (llm) {
            handler.selectedModelName = llm; // Safe assignment
        } else {
            console.warn('No model selected.');
        }

        // Store the selected model in the extension context
        context.workspaceState.update('selectedModel', handler.selectedModelName);

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
            switch(message.command) { 
                case 'chat': { 
                    const userPrompt = message.text;
                    try {
                        // Call ollama.chat directly for local model
                        const streamResponse = await ollama.chat({
                            model: handler.selectedModelName,
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
                   break; 
                } 
                case 'manager': {
                    const llm = await promptForModelSelection(); // Prompt the user for model selection
                    if (llm) {
                        handler.selectedModelName = llm; // Safe assignment
                        console.log(`Model selected: ${llm}`);
                        await context.workspaceState.update('selectedModel', handler.selectedModelName);
                    } else {
                        console.warn('No model selected.');
                    }
                    break; // Ensure proper case termination
                }
                
                default: {
                    break;
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


