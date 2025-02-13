import * as vscode from 'vscode';

export class ModelHandler {
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
    { name: 'deepseek-r1:14b' },
    { name: 'deepseek-r1:32b' },
    { name: 'deepseek-r1:70b' },
    // Add more models as needed
];
export async function promptForModelSelection(panel?: vscode.WebviewPanel): Promise<string | undefined> {
    const options = availableModels.map(model => ({
        label: model.name,
    }));

    const result = await vscode.window.showQuickPick(options, {
        canPickMany: false,
        title: 'Select a model'
    });

    if (result?.label && panel) {
        panel.webview.postMessage({ command: 'updateModel', model: result.label });
    }

    return result?.label;
}


