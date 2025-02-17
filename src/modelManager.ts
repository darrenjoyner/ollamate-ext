import { getManagerViewContent } from "./managerView";
import * as vscode from "vscode";

export class ModelHandler {
  modelMenu?: vscode.WebviewPanel;

  constructor(private readonly context: vscode.ExtensionContext) {}

  get selectedModelName(): string | undefined {
    return this.context.globalState.get("selectedModel");
  }

  set selectedModelName(model: string) {
    this.context.globalState.update("selectedModel", model);
  }

  get availableModels(): string[] {
    return this.context.globalState.get("availableModels", []);
  }

  set availableModels(models: string[]) {
    this.context.globalState.update("availableModels", models);
  }
}

export async function handleModelMenuMessage(
  message: any,
  context: vscode.ExtensionContext,
  handler: ModelHandler,
  modelMenu?: vscode.WebviewPanel,
  panel?: vscode.WebviewPanel
) {
  if (message.command === "load") {
    const selectedModel = await promptForModelSelection(context);
    handler.selectedModelName = selectedModel ?? "default-model";

    // Update both panels
    modelMenu?.webview.postMessage({
      command: "updateModel",
      model: handler.selectedModelName,
    });
    panel?.webview.postMessage({
      command: "updateModel",
      model: handler.selectedModelName,
    });

    console.log("✅ Model updated:", handler.selectedModelName);
  }
}

// Function to initialize models in globalState
export async function initializeModels(context: vscode.ExtensionContext) {
  const handler = new ModelHandler(context);
  if (handler.availableModels.length === 0) {
    const addDefaults = await vscode.window.showQuickPick(["Yes", "No"], {
      placeHolder: "Add a default model to your manager?",
    });
    if (addDefaults === "Yes") {
      handler.availableModels = [
        "deepseek-r1:14b",
        "deepseek-r1:32b",
        "deepseek-r1:70b",
      ];
      vscode.window.showInformationMessage("Default models added.");
    }
  }
}

export function openModelManagerPanel(
  context: vscode.ExtensionContext,
  handler: ModelHandler,
  panel?: vscode.WebviewPanel
) {
  if (!handler.modelMenu) {
    handler.modelMenu = vscode.window.createWebviewPanel(
      "modelMenu",
      "Model Manager",
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );

    handler.modelMenu.onDidDispose(() => (handler.modelMenu = undefined));

    handler.modelMenu.webview.onDidReceiveMessage((msg) =>
      handleModelMenuMessage(msg, context, handler, handler.modelMenu, panel)
    );

    handler.modelMenu.webview.html = getManagerViewContent();
  } else {
    handler.modelMenu.reveal();
  }
}

// Function to prompt user for model selection
export async function promptForModelSelection(
  context: vscode.ExtensionContext,
  panel?: vscode.WebviewPanel
): Promise<string | undefined> {
  const handler = new ModelHandler(context);
  const models = handler.availableModels;

  const options = models.map((name) => ({ label: name }));

  const result = await vscode.window.showQuickPick(options, {
    canPickMany: false,
    title: "Select a model",
  });

  if (result?.label) {
    handler.selectedModelName = result.label;
    if (panel) {
      panel.webview.postMessage({
        command: "updateModel",
        model: result.label,
      });
    }
  }

  return result?.label;
}
