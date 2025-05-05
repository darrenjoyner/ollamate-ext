// src/modelManager.ts
import * as vscode from "vscode";
import { EventEmitter } from "events";

/**
 * Manages model state (selected, available) using globalState
 * and notifies listeners of changes.
 * @export
 * @class ModelHandler
 * @extends {EventEmitter}
 */
export class ModelHandler extends EventEmitter {
	constructor(private readonly context: vscode.ExtensionContext) {
		super();
	}

	get selectedModelName(): string | undefined {
		const model = this.context.globalState.get<string>("selectedModel");
		return model === "No Model" || !model ? undefined : model;
	}

	set selectedModelName(model: string | undefined) {
		const oldModel = this.selectedModelName;
		const modelToStore = model ?? "No Model";

		this.context.globalState.update("selectedModel", modelToStore).then(() => {
			if (oldModel !== model) {
				console.log(
					`Model selection changed: ${oldModel ?? "None"} -> ${model ?? "None"}`
				);
				this.emit("modelChanged", model);
			}
		});
	}

	get availableModels(): string[] {
		return this.context.globalState.get<string[]>("availableModels", []);
	}

	set availableModels(models: string[]) {
		const oldModelsJson = JSON.stringify(this.availableModels);

		const uniqueModels = [...new Set(models)]
			.filter((m) => m && m.trim() !== "")
			.sort((a, b) => a.localeCompare(b));
		const newModelsJson = JSON.stringify(uniqueModels);

		if (oldModelsJson !== newModelsJson) {
			console.log("Available models list changed.");
			this.context.globalState
				.update("availableModels", uniqueModels)
				.then(() => {
					const currentSelection = this.selectedModelName;

					if (currentSelection && !uniqueModels.includes(currentSelection)) {
						console.log(
							`Selected model "${currentSelection}" is no longer available after list update. Clearing selection.`
						);

						this.selectedModelName = undefined;
					}

					this.emit("listChanged", uniqueModels);
				});
		}
	}
}

// --- Model Management Functions ---

/**
 * Checks initial model state on activation.
 * @export
 * @param {vscode.ExtensionContext} context
 * @param {ModelHandler} handler
 */
export async function initializeModels(
	context: vscode.ExtensionContext,
	handler: ModelHandler
) {
	const available = handler.availableModels;
	const selected = handler.selectedModelName;

	console.log(
		`Initializing models. Available: ${available.length}, Selected: ${
			selected ?? "None"
		}`
	);

	if (available.length === 0) {
		console.log(
			"No available models found in global state during initialization."
		);
		// Optional: Prompt to import if desired
		// const addDefaults = await vscode.window.showInformationMessage(...)
		// if (addDefaults === "Yes") { await importOllamaModels(context, handler); }
	} else if (selected && !available.includes(selected)) {
		console.warn(
			`Selected model "${selected}" no longer exists in available list. Clearing selection.`
		);
		handler.selectedModelName = undefined;
	}
}

/**
 * Adds a model name manually via input box.
 * @export
 * @param {vscode.ExtensionContext} context
 * @param {ModelHandler} handler
 * @return {*}  {Promise<void>}
 */
export async function addModelManually(
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
				return `Model "${trimmedValue}" already exists.`;
			}
			return null;
		},
		ignoreFocusOut: true,
	});

	if (modelName && modelName.trim().length > 0) {
		const trimmedModelName = modelName.trim();

		handler.availableModels = [...handler.availableModels, trimmedModelName];
		vscode.window.showInformationMessage(
			`Model "${trimmedModelName}" added to list.`
		);
	} else {
		vscode.window.showInformationMessage("Model addition cancelled.");
	}
}

/**
 * Deletes a model from the list via quick pick.
 * @export
 * @param {vscode.ExtensionContext} context
 * @param {ModelHandler} handler
 * @return {*}  {Promise<void>}
 */
export async function deleteModel(
	context: vscode.ExtensionContext,
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
		ignoreFocusOut: true,
	});

	if (modelToDelete) {
		handler.availableModels = models.filter((model) => model !== modelToDelete);
		vscode.window.showInformationMessage(
			`Model "${modelToDelete}" removed from the list.`
		);
	} else {
		vscode.window.showInformationMessage("Model deletion cancelled.");
	}
}

/**
 * Fetches model list from Ollama API using default URL and configured timeout.
 * @export
 * @return {*}  {Promise<string[]>}
 */
export async function listOllamaModels(): Promise<string[]> {
	const config = vscode.workspace.getConfiguration("ollamate");
	const defaultTimeout = 15000;
	const requestTimeout = config.get<number>("requestTimeout", defaultTimeout);

	const effectiveTimeout = Math.max(
		5000,
		Math.min(requestTimeout, defaultTimeout)
	);
	const ollamaUrl = "http://localhost:11434";

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

	try {
		console.log(
			`Listing models from ${ollamaUrl} with timeout ${effectiveTimeout}ms`
		);
		const response = await fetch(`${ollamaUrl}/api/tags`, {
			signal: controller.signal,
		});
		clearTimeout(timeoutId);

		if (!response.ok) {
			if (response.status === 404) {
				throw new Error(
					`Ollama API endpoint not found at ${ollamaUrl}. Is Ollama running locally on port 11434?`
				);
			} else if (response.status >= 500) {
				throw new Error(
					`Ollama server error (${response.status}). Check Ollama server logs.`
				);
			} else {
				throw new Error(
					`Failed to fetch models from Ollama: ${response.status} ${response.statusText}`
				);
			}
		}
		const data = await response.json();
		if (!data || !Array.isArray(data.models)) {
			throw new Error("Invalid response format received from Ollama /api/tags");
		}

		const sortedModels = data.models
			.map((model: { name: string }) => model.name)
			.sort((a: string, b: string) => a.localeCompare(b));

		return sortedModels;
	} catch (error: any) {
		clearTimeout(timeoutId);
		if (error.name === "AbortError") {
			console.error(
				`Error listing Ollama models: Request timed out after ${effectiveTimeout}ms`
			);
			vscode.window.showErrorMessage(
				`Ollama list models request timed out. Check connection or increase timeout setting.`
			);
		} else {
			console.error("Error listing Ollama models:", error);
			if (error instanceof Error) {
				vscode.window.showErrorMessage(
					`Could not list models from Ollama: ${error.message}`
				);
			} else {
				vscode.window.showErrorMessage(
					`An unknown error occurred while contacting Ollama.`
				);
			}
		}
		return [];
	}
}

/**
 * Imports models found in Ollama installation into the available list.
 * @export
 * @param {vscode.ExtensionContext} context
 * @param {ModelHandler} handler
 * @return {*}  {Promise<void>}
 */
export async function importOllamaModels(
	context: vscode.ExtensionContext,
	handler: ModelHandler
): Promise<void> {
	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: "Importing Ollama Models",
			cancellable: false,
		},
		async (progress) => {
			progress.report({ message: "Fetching models from Ollama..." });
			const ollamaModels = await listOllamaModels();

			if (ollamaModels.length === 0) {
				// Message handled by listOllamaModels on error, or show info if list is truly empty
				// vscode.window.showInformationMessage("No models currently installed in Ollama.");
				return;
			}

			const currentAvailable = handler.availableModels;
			const newModels = ollamaModels.filter(
				(m) => !currentAvailable.includes(m)
			);

			if (newModels.length === 0) {
				vscode.window.showInformationMessage(
					"All installed Ollama models are already in your list."
				);
				return;
			}

			progress.report({ message: `Found ${newModels.length} new models...` });

			const choice = await vscode.window.showQuickPick(
				[
					{
						label: "$(add) Import All",
						description: `Add all ${newModels.length} new models`,
					},
					{
						label: "$(list-selection) Select Models...",
						description: "Choose which new models to add",
					},
					{
						label: "$(close) Cancel",
						description: "Do not import any models now",
					},
				],
				{
					title: `${newModels.length} new model(s) found in Ollama`,
					ignoreFocusOut: true,
				}
			);

			if (!choice || choice.label.includes("Cancel")) {
				vscode.window.showInformationMessage("Model import cancelled.");
				return;
			}

			let importedCount = 0;
			if (choice.label.includes("Import All")) {
				handler.availableModels = [...currentAvailable, ...newModels];
				importedCount = newModels.length;
			} else if (choice.label.includes("Select Models")) {
				const modelsToImport = await vscode.window.showQuickPick(
					newModels.map((m) => ({ label: m })),
					{
						canPickMany: true,
						title: "Select New Ollama Models to Import",
						placeHolder: "Choose models to add",
						ignoreFocusOut: true,
					}
				);

				if (modelsToImport && modelsToImport.length > 0) {
					const labelsToImport = modelsToImport.map((item) => item.label);
					handler.availableModels = [...currentAvailable, ...labelsToImport];
					importedCount = modelsToImport.length;
				} else {
					vscode.window.showInformationMessage(
						"No models selected for import."
					);
				}
			}

			if (importedCount > 0) {
				vscode.window.showInformationMessage(
					`Imported ${importedCount} model(s) from Ollama.`
				);
			}
		}
	);
}

/**
 * Prompts user to select a model from the available list.
 * Returns the selected model name or undefined if cancelled.
 * @export
 * @param {vscode.ExtensionContext} context
 * @param {ModelHandler} handler
 * @param {string} [promptTitle="Select a Model"]
 * @return {*}  {(Promise<string | undefined>)}
 */
export async function promptForModelSelection(
	context: vscode.ExtensionContext,
	handler: ModelHandler,
	promptTitle: string = "Select a Model"
): Promise<string | undefined> {
	const models = handler.availableModels;
	const currentSelection = handler.selectedModelName;

	if (models.length === 0) {
		vscode.window.showWarningMessage(
			"No models available. Use the Manager to add or import models."
		);
		return undefined;
	}

	const options: vscode.QuickPickItem[] = models.map((name) => ({
		label: name,
		description: name === currentSelection ? "$(check) current" : undefined,
	}));

	const result = await vscode.window.showQuickPick(options, {
		title: promptTitle,
		placeHolder: "Choose a model",
		ignoreFocusOut: true,
		matchOnDescription: true,
	});

	return result?.label;
}
