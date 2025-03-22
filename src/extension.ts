import { getAppViewContent } from "./appView";
import {
  ModelHandler,
  initializeModels,
  promptForModelSelection,
  openModelManagerPanel,
} from "./modelManager";
import * as dotenv from "dotenv";
import * as vscode from "vscode";
import ollama from "ollama";

dotenv.config();

let panel: vscode.WebviewPanel | undefined;

export async function activate(context: vscode.ExtensionContext) {
  await initializeModels(context);
  const handler = new ModelHandler(context);

  const disposable = vscode.commands.registerCommand(
    "yester-ext.start",
    async () => {
      panel = vscode.window.createWebviewPanel(
        "yester",
        "LLM Chat",
        vscode.ViewColumn.Beside,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      panel.onDidDispose(() => (panel = undefined));
      panel.webview.html = getAppViewContent();

      const selectedModel = await promptForModelSelection(context, panel);

      if (selectedModel) {
        handler.selectedModelName = selectedModel;
      } else {
        // Send message to panel informing the user to enter a model
        panel.webview.postMessage({
          command: "chatResponse",
          text: "Enter a model. ",
        });
        // Optionally, set a default value
        handler.selectedModelName = "No Model";
      }
      panel.webview.onDidReceiveMessage(async (message) => {
        if (message.command === "chat" && panel) {
          try {
            const modelName = handler.selectedModelName ?? "No Model";
            for await (const part of await ollama.chat({
              model: modelName,
              messages: [{ role: "user", content: message.text }],
              stream: true,
            })) {
              panel.webview.postMessage({
                command: "chatResponse",
                text: part.message.content,
              });
            }
          } catch (error) {
            console.error("Chat error:", error);

            const errorMessage =
              error && typeof error === "object" && "message" in error
                ? (error as { message: string }).message
                : "An unknown error occurred.";

            if (selectedModel === undefined) {
              panel.webview.postMessage({
                command: "chatResponse",
                text: "No model selected.",
              });
            } else {
              panel.webview.postMessage({
                command: "chatResponse",
                text: errorMessage,
              });
            }
          }
        } else if (message.command === "manager") {
          openModelManagerPanel(context, handler, panel);
        }
      });
      if (selectedModel !== undefined) {
        panel.webview.postMessage({
          command: "chatResponse",
          text: "Model is ready to chat!",
        });
      }
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
