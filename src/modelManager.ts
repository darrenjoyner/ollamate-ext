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

async function addModel(context: vscode.ExtensionContext) {
  const handler = new ModelHandler(context);

  const modelObj: { model?: string; useSelectedModel?: string } = {};

  const model = await vscode.window.showInputBox({
    prompt: "Enter model name",
    placeHolder: "Model 123",
  });

  if (!model) {
    vscode.window.showErrorMessage("No model entered!");
  } else {
    modelObj.model = model;

    const useSelectedModel = await vscode.window.showQuickPick(["Yes", "No"], {
      placeHolder: "Use entered model?",
    });
    modelObj.useSelectedModel = useSelectedModel;

    handler.availableModels = [...handler.availableModels, model];
    console.log("✅ Model added:", handler.selectedModelName);
  }

  return modelObj;
}

async function deleteModel(
  context: vscode.ExtensionContext,
  handler: ModelHandler
): Promise<string> {
  const previousModel = handler.selectedModelName ?? "";

  const selectedModel = await promptForModelSelection(context);

  if (!selectedModel || handler.availableModels.length === 0) {
    vscode.window.showWarningMessage("No model selected for deletion.");
    return previousModel;
  }

  if (!handler.availableModels.includes(selectedModel)) {
    vscode.window.showWarningMessage(`Model "${selectedModel}" not found.`);
    return previousModel;
  }

  // Remove from availableModels
  handler.availableModels = handler.availableModels.filter(
    (model) => model !== selectedModel
  );
  vscode.window.showInformationMessage(`Model "${selectedModel}" deleted.`);

  if (previousModel === selectedModel) {
    handler.selectedModelName = "";
    return "";
  }

  return previousModel;
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
    handler.selectedModelName = selectedModel ?? "No Model";

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

  if (message.command === "add") {
    const addedModel = await addModel(context);

    if (addedModel.useSelectedModel === "Yes") {
      handler.selectedModelName = addedModel.model ?? "No Model";
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

  if (message.command === "delete") {
    const deletedModel = await deleteModel(context, handler);

    if (deletedModel === ""){
      modelMenu?.webview.postMessage({
        command: "updateModel",
        model: deletedModel,
      });
      panel?.webview.postMessage({
        command: "updateModel",
        model: deletedModel,
      });
    }
  }

  if (message.command === "import") {
    try {
      let updateModels: string[] = [];
  
      const models = await listOllamaModels();
      
      for (const model of models) {
        // Only add if the model is not already in the list
        if (!handler.availableModels.includes(model)) {
          updateModels.push(model);
        }
      }
  
      if (updateModels.length > 0) {
        vscode.window.showInformationMessage(`${updateModels.length} model${updateModels.length === 1 ? "" : "s"} found.`);

        const addOneOrAll = await vscode.window.showQuickPick(["Select", "All"], {
          placeHolder: "Add select models or all models",
        });
  
        if (addOneOrAll === "Select") {
          const result = await vscode.window.showQuickPick(updateModels, {
            canPickMany: true,
            title: "Select a models",
          });
  
          if (result && result.length > 0) {
            handler.availableModels.push(...result); // Push the selected model (string)
            vscode.window.showInformationMessage(`Models imported: ${result.join(", ")}`);

          }
        } else if (addOneOrAll === "All") {
          handler.availableModels.push(...updateModels);
          vscode.window.showInformationMessage(`${updateModels.length} model${updateModels.length === 1 ? "" : "s"} imported.`);
        } else {
          vscode.window.showInformationMessage("No models imported");
        }
      } else {
        vscode.window.showInformationMessage("No models found");
      }
    } catch (error) {
      console.error("Error fetching models:", error);
    }
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
      handler.availableModels = await listOllamaModels();
      vscode.window.showInformationMessage("Default models added.");
    }
  }
}

async function listOllamaModels(): Promise<string[]> {
  try {
      const response = await fetch('http://localhost:11434/api/tags');
      if (!response.ok) {
          throw new Error(`Failed to fetch models: ${response.statusText}`);
      }
      const data = await response.json();
      return data.models.map((model: { name: string }) => model.name);
  } catch (error) {
      console.error("Error fetching models:", error);
      return []; // Return an empty array instead of throwing
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
