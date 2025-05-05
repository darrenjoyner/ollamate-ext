// src/providers/chatHistoryProvider.ts
import * as vscode from "vscode";
import { getChatHistory } from "../chatHistoryManager";

type ChatHistoryTreeDataType = ChatHistoryItem | undefined | null | void;

/**
 * Provide chat history
 * @export
 * @class ChatHistoryProvider
 * @implements {vscode.TreeDataProvider<ChatHistoryItem>}
 */
export class ChatHistoryProvider
  implements vscode.TreeDataProvider<ChatHistoryItem>
{
  private readonly _onDidChangeTreeData: vscode.EventEmitter<ChatHistoryTreeDataType> =
    new vscode.EventEmitter<ChatHistoryTreeDataType>();
  readonly onDidChangeTreeData: vscode.Event<ChatHistoryTreeDataType> =
    this._onDidChangeTreeData.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ChatHistoryItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ChatHistoryItem): Thenable<ChatHistoryItem[]> {
    if (element) {
      return Promise.resolve([]);
    } else {
      const history = getChatHistory(this.context);
      const historyItems = history.map((session) => {
        const date = new Date(session.timestamp);
        const dateString = date.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
        return new ChatHistoryItem(
          session.name || "Untitled Chat",
          session.id,
          `${dateString} - Model: ${session.modelUsed}`,
          session.modelUsed,
          vscode.TreeItemCollapsibleState.None
        );
      });
      return Promise.resolve(historyItems);
    }
  }
}

/**
 * Label chat logs
 * @export
 * @class ChatHistoryItem
 * @extends {vscode.TreeItem}
 */
export class ChatHistoryItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly sessionId: string,
    public readonly tooltip: string,
    public readonly description: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.id = sessionId;
    this.iconPath = new vscode.ThemeIcon("comment-discussion");
    this.command = {
      command: "ollamate.history.loadChat",
      title: "Load Chat",
      arguments: [this.sessionId],
    };
  }

  contextValue = "chatHistoryItem";
}
