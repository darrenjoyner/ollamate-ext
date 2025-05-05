// src/providers/modelManagerViewProvider.ts

import * as vscode from "vscode";
import { ModelHandler } from "../modelManager";
import { getManagerViewContent } from "../views/managerView";

/**
 * Provide model manager view
 * @export
 * @class ModelManagerViewProvider
 * @implements {vscode.WebviewViewProvider}
 */
export class ModelManagerViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = "modelManagerView";

	private _view?: vscode.WebviewView;
	private readonly _handler: ModelHandler;
	private readonly _extensionUri: vscode.Uri;

	constructor(extensionUri: vscode.Uri, handler: ModelHandler) {
		this._extensionUri = extensionUri;
		this._handler = handler;

		this._handler.on("modelChanged", () => {
			this.updateView();
		});
		this._handler.on("listChanged", () => {
			this.updateView();
		});
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	) {
		console.log("Resolving Model Manager webview view");
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(this._extensionUri, "media"),
				this._extensionUri,
			],
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		webviewView.webview.onDidReceiveMessage((message) => {
			// Message handling remains the same...
			console.log("Manager View Provider received message:", message.command);
			switch (message.command) {
				case "load":
					vscode.commands.executeCommand("modelManager.load");
					return;
				case "add":
					vscode.commands.executeCommand("modelManager.add");
					return;
				case "import":
					vscode.commands.executeCommand("modelManager.import");
					return;
				case "delete":
					vscode.commands.executeCommand("modelManager.delete");
					return;
				case "getModel":
					this.updateView();
					return;
				case "log":
					console.log("Manager Webview Log:", message.data);
					return;
				case "openChat":
					vscode.commands.executeCommand("ollamate-ext.start");
					return;
				default:
					console.warn(
						"Received unknown command from manager webview:",
						message.command
					);
			}
		});

		webviewView.onDidChangeVisibility(() => {
			if (webviewView.visible) {
				console.log("Manager view became visible, updating content.");
				this.updateView();
			}
		});

		console.log("Manager view resolved, performing initial update.");
		this.updateView();
	}

	public updateView() {
		if (this._view) {
			const selectedModel = this._handler.selectedModelName;
			const availableModels = this._handler.availableModels;
			console.log(
				`Updating manager view. Selected: ${selectedModel}, Available: ${availableModels.length}`
			);
			this._view.webview.postMessage({
				command: "updateModel",
				model: selectedModel ?? "No Model Selected",
				availableModels: availableModels,
			});
		} else {
			console.log("Manager view not available, cannot update.");
		}
	}

	private _getHtmlForWebview(webview: vscode.Webview): string {
		console.log("Getting HTML for manager webview");
		return getManagerViewContent(webview, this._extensionUri);
	}
}
