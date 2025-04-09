import * as vscode from "vscode";
import { getManagerViewContent } from "./views/managerView";

export class ModelHandler {
  modelMenu?: vscode.WebviewPanel;
  private managerPanelDisposeListener: vscode.Disposable | undefined;
  private chatPanelDisposeListener: vscode.Disposable | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  get selectedModelName(): string | undefined {
    const model = this.context.globalState.get<string>("selectedModel");
    return model === "No Model" ? undefined : model;
  }

  set selectedModelName(model: string | undefined) {
    this.context.globalState.update("selectedModel", model);
    this.updateWebviews(model);
  }

  get availableModels(): string[] {
    return this.context.globalState.get<string[]>("availableModels", []);
  }

  set availableModels(models: string[]) {
    const uniqueModels = [...new Set(models)].filter(
      (m) => m && m.trim() !== ""
    );
    this.context.globalState.update("availableModels", uniqueModels);
    const currentSelection = this.selectedModelName;
    if (currentSelection && !uniqueModels.includes(currentSelection)) {
      console.log(
        `Selected model "${currentSelection}" is no longer available. Clearing selection.`
      );
      this.selectedModelName = undefined;
    }
    else {
      this.updateWebviews(this.selectedModelName);
    }
  }

  /**
   * Helper to send update messages safely
   * @param {interface} panel 
   * @param {string} message 
   */
  private postMessageToWebview(
    panel: vscode.WebviewPanel | undefined,
    message: any
  ) {
    panel?.webview?.postMessage(message)?.then(
      (success) => {
        // Optional: Log success or handle specific success scenarios if needed
        // if (!success) { console.warn(`Posting message may have failed for panel: ${panel?.title}`); }
      },
      (error) =>
        console.error(
          `Error posting message to ${panel?.title ?? "unknown panel"}:`,
          error
        )
    );
  }

  /**
   * Centralized function to update relevant webviews
   * @param {string} selectedModel
   */
  public updateWebviews(selectedModel: string | undefined) {
    const modelDisplay = selectedModel ?? "No Model Selected";

    this.postMessageToWebview(this.modelMenu, {
      command: "updateModel",
      model: modelDisplay,
      availableModels: this.availableModels,
    });
  }

  /**
   * Method to clear listener references
   */
  public clearListeners() {
    this.managerPanelDisposeListener?.dispose();
    this.managerPanelDisposeListener = undefined;
    this.chatPanelDisposeListener?.dispose();
    this.chatPanelDisposeListener = undefined;
  }

  /**
   * Method to set up disposal logic for the manager panel
   * @param {interface} chatPanel 
   * @returns 
   */
  public setupManagerPanelDisposal(chatPanel: vscode.WebviewPanel | undefined) {
    if (!this.modelMenu) {
      return;
    }

    this.clearListeners();

    this.managerPanelDisposeListener = this.modelMenu.onDidDispose(() => {
      console.log("Model Manager panel disposed.");
      this.modelMenu = undefined;
      this.clearListeners();
    });
    this.context.subscriptions.push(this.managerPanelDisposeListener);

    if (chatPanel) {
      this.chatPanelDisposeListener = chatPanel.onDidDispose(() => {
        console.log("Chat panel disposed, disposing manager panel as well.");
        this.modelMenu?.dispose();
      });
    }
  }
}

// --- Model Management Functions ---

/**
 * Initialize Models if there are not any
 * @param {interface} context 
 */
export async function initializeModels(context: vscode.ExtensionContext) {
  const handler = new ModelHandler(context);
  if (handler.availableModels.length === 0) {
    console.log("No available models found in global state.");

    const addDefaults = await vscode.window.showInformationMessage(
        "No models configured. Would you like to try importing models from Ollama?",
        "Yes", "No"
    );
    if (addDefaults === "Yes") {
        await importOllamaModels(context, handler);
    }
  } else {
    console.log(
      `Found ${handler.availableModels.length} models in global state.`
    );
  }

  const selected = handler.selectedModelName;
  if (selected && !handler.availableModels.includes(selected)) {
    console.warn(
      `Selected model "${selected}" no longer exists in available list. Clearing selection.`
    );
    handler.selectedModelName = undefined;
  }
}

/**
 * Add model to the list
 * @param {interface} context 
 * @param {object} handler 
 * @returns {string}
 */
async function addModel(
  context: vscode.ExtensionContext,
  handler: ModelHandler
): Promise<void> {
  const modelName = await vscode.window.showInputBox({
    prompt: "Enter the exact name of the model to add (e.g., llama3:latest)",
    placeHolder: "model:tag",
    validateInput: (value) => {
      if (!value || value.trim().length === 0) {
        return "Model name cannot be empty.";
      }
      const trimmedValue = value.trim();
      if (handler.availableModels.includes(trimmedValue)) {
        return `Model "${trimmedValue}" already exists in the list.`;
      }
      // Optional: Add more validation if needed
      // if (!value.includes(':') && value !== 'default') {
      //     return "Model name should ideally include a tag (e.g., model:tag)";
      // }
      return null;
    },
    ignoreFocusOut: true,
  });

  if (!modelName || modelName.trim().length === 0) {
    vscode.window.showInformationMessage("Model addition cancelled.");
    return;
  }

  const trimmedModelName = modelName.trim();

  handler.availableModels = [...handler.availableModels, trimmedModelName];

  vscode.window.showInformationMessage(
    `Model "${trimmedModelName}" added to available list. Use 'Select/Load Model' to use it.`
  );
}

/**
 * Delete model
 * @param {object} _context 
 * @param {object} handler 
 * @returns {string}
 */
async function deleteModel(
  _context: vscode.ExtensionContext,
  handler: ModelHandler
): Promise<void> {
  const models = handler.availableModels;
  if (models.length === 0) {
    vscode.window.showWarningMessage("No models available to delete.");
    return;
  }

  const modelToDelete = await vscode.window.showQuickPick(models, {
    placeHolder: "Select a model to delete from the list",
    title: "Delete Model",
  });

  if (!modelToDelete) {
    vscode.window.showInformationMessage("Model deletion cancelled.");
    return;
  }

  handler.availableModels = models.filter((model) => model !== modelToDelete);

  vscode.window.showInformationMessage(
    `Model "${modelToDelete}" removed from the list.`
  );
}

/**
 * Function to fetch models from Ollama (using fetch API)
 * @returns 
 */
export async function listOllamaModels(): Promise<string[]> {
  try {
    // Consider making the URL configurable via settings
    const response = await fetch("http://localhost:11434/api/tags");
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(
          `Ollama API endpoint not found at ${response.url}. Is Ollama running and accessible?`
        );
      }
      throw new Error(
        `Failed to fetch models from Ollama: ${response.status} ${response.statusText}`
      );
    }
    const data = await response.json();
    if (!data || !Array.isArray(data.models)) {
      throw new Error("Invalid response format received from Ollama /api/tags");
    }

    return data.models.map((model: { name: string }) => model.name);
  } catch (error: any) {
    console.error("Error listing Ollama models:", error);

    vscode.window.showErrorMessage(
      `Could not list models from Ollama: ${error.message}`
    );
    return [];
  }
}

/**
 * Refined: Import models from Ollama
 * @param {interface} _context 
 * @param {object} handler 
 * @returns 
 */
async function importOllamaModels(
  _context: vscode.ExtensionContext,
  handler: ModelHandler
): Promise<void> {
  vscode.window.showInformationMessage(
    "Checking Ollama for installed models..."
  );
  const ollamaModels = await listOllamaModels();

  if (ollamaModels.length === 0) {
    if (!vscode.window.state.focused) {
      vscode.window.showInformationMessage(
        "No models found installed in Ollama."
      );
    }
    return;
  }

  const currentAvailable = handler.availableModels;
  const newModels = ollamaModels.filter((m) => !currentAvailable.includes(m));

  if (newModels.length === 0) {
    vscode.window.showInformationMessage(
      "All installed Ollama models are already in your available list."
    );
    return;
  }

  const choice = await vscode.window.showQuickPick(
    [
      {
        label: "Import All",
        description: `Add all ${newModels.length} new models`,
      },
      {
        label: "Select Models...",
        description: "Choose which new models to add",
      },
      { label: "Cancel", description: "Do not import any models now" },
    ],
    {
      title: `${newModels.length} new model(s) found in Ollama`,
      ignoreFocusOut: true,
    }
  );

  if (!choice || choice.label === "Cancel") {
    vscode.window.showInformationMessage("Model import cancelled.");
    return;
  }

  if (choice.label === "Import All") {
    handler.availableModels = [...currentAvailable, ...newModels];
    vscode.window.showInformationMessage(
      `Imported ${newModels.length} model(s) from Ollama.`
    );
  } else if (choice.label === "Select Models...") {
    const modelsToImport = await vscode.window.showQuickPick(newModels, {
      canPickMany: true,
      title: "Select New Ollama Models to Import",
      placeHolder: "Choose models to add to your list",
      ignoreFocusOut: true,
    });

    if (modelsToImport && modelsToImport.length > 0) {
      handler.availableModels = [...currentAvailable, ...modelsToImport];
      vscode.window.showInformationMessage(
        `Imported ${modelsToImport.length} selected model(s).`
      );
    } else {
      vscode.window.showInformationMessage("No models selected for import.");
    }
  }
}

/**
 * Handle messages from the Manager webview
 * @param {string} message 
 * @param {interface} context 
 * @param {object} handler 
 * @param {interface} chatPanel 
 */
export async function handleModelMenuMessage(
  message: any,
  context: vscode.ExtensionContext,
  handler: ModelHandler,
  chatPanel: vscode.WebviewPanel | undefined
) {
  console.log("Received message from manager webview:", message.command);
  switch (message.command) {
    case "load": {
      // <--- Add opening brace
      const selected = await promptForModelSelection(context, chatPanel);
      if (selected) {
        handler.selectedModelName = selected;
        vscode.window.showInformationMessage(`Model "${selected}" selected.`);
      } else {
        vscode.window.showInformationMessage("Model selection cancelled.");
      }
      break;
    }

    case "add": {
      await addModel(context, handler);
      break;
    }

    case "delete": {
      await deleteModel(context, handler);
      break;
    }

    case "import": {
      await importOllamaModels(context, handler);
      break;
    }

    case "getModel": {
      handler.updateWebviews(handler.selectedModelName);
      break;
    }

    default:
      console.warn(
        "Received unknown command from manager webview:",
        message.command
      );
  }
}

/**
 * Open the manager panel
 * @param {interface} context 
 * @param {object} handler 
 * @param {interface} chatPanel 
 * @returns 
 */
export function openModelManagerPanel(
  context: vscode.ExtensionContext,
  handler: ModelHandler,
  chatPanel: vscode.WebviewPanel | undefined
): void {
  if (handler.modelMenu) {
    handler.modelMenu.reveal(vscode.ViewColumn.Beside);
    handler.setupManagerPanelDisposal(chatPanel);
    handler.updateWebviews(handler.selectedModelName);
    return;
  }

  handler.modelMenu = vscode.window.createWebviewPanel(
    "yesterModelManager",
    "Model Manager",
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      // Keep context when hidden? Maybe not necessary for manager.
      // retainContextWhenHidden: true,
      // Add local resource roots if loading local CSS/JS
      // localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
    }
  );

  handler.setupManagerPanelDisposal(chatPanel);

  handler.modelMenu.webview.html = getManagerViewContent(); // Assuming this exists

  handler.modelMenu.webview.onDidReceiveMessage(
    (msg) => handleModelMenuMessage(msg, context, handler, chatPanel),
    undefined,
    context.subscriptions
  );

  handler.updateWebviews(handler.selectedModelName);
}

/**
 * Function to prompt user for model selection
 * @param {interface} context 
 * @param {interface} panelToUpdate 
 * @returns 
 */
export async function promptForModelSelection(
  context: vscode.ExtensionContext,
  panelToUpdate?: vscode.WebviewPanel
): Promise<string | undefined> {
  const handler = new ModelHandler(context);
  const models = handler.availableModels;
  const currentSelection = handler.selectedModelName;

  if (models.length === 0) {
    vscode.window.showWarningMessage(
      "No models available. Please add or import models using the Manager."
    );
    return undefined;
  }

  const options = models.map((name) => ({
    label: name,
    description: name === currentSelection ? "(current)" : undefined,
  }));

  const result = await vscode.window.showQuickPick(options, {
    title: "Select a Model",
    placeHolder: "Choose a model to use for chat",
  });

  if (result?.label && panelToUpdate) {
    panelToUpdate.webview.postMessage({
      command: "updateModel",
      model: result.label,
    });
  } else if (!result && panelToUpdate) {
    panelToUpdate.webview.postMessage({
      command: "updateModel",
      model: currentSelection ?? "No Model Selected",
    });
  }

  return result?.label;
}