// src/providers/chatHistoryProvider.ts
import * as vscode from 'vscode';
import { getChatHistory } from '../chatHistoryManager';

type ChatHistoryTreeDataType = ChatHistoryItem | undefined | null | void;

export class ChatHistoryProvider implements vscode.TreeDataProvider<ChatHistoryItem> {

    private readonly _onDidChangeTreeData: vscode.EventEmitter<ChatHistoryTreeDataType> = new vscode.EventEmitter<ChatHistoryTreeDataType>();
    readonly onDidChangeTreeData: vscode.Event<ChatHistoryTreeDataType> = this._onDidChangeTreeData.event;

    constructor(private readonly context: vscode.ExtensionContext) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ChatHistoryItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ChatHistoryItem): Thenable<ChatHistoryItem[]> {
        if (element) {
            return Promise.resolve([]); // No nested children
        } else {
            const history = getChatHistory(this.context);
            const historyItems = history.map(session => {
                const date = new Date(session.timestamp);
                // Simple relative date or locale string
                const dateString = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
                return new ChatHistoryItem(
                    session.name || "Untitled Chat", // Summary
                    session.id,
                    `${dateString} - Model: ${session.modelUsed}`, // Tooltip
                    session.modelUsed, // Description (just the model)
                    vscode.TreeItemCollapsibleState.None
                );
            });
            return Promise.resolve(historyItems);
        }
    }
}

export class ChatHistoryItem extends vscode.TreeItem {
    constructor(
        public readonly label: string, // Summary
        public readonly sessionId: string,
        public readonly tooltip: string, // Formatted date and model
        public readonly description: string, // Model used
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.id = sessionId;
        // Use built-in icons
        this.iconPath = new vscode.ThemeIcon('comment-discussion');
        // Command executed on click
        this.command = {
            command: 'ollamate.history.loadChat',
            title: 'Load Chat',
            arguments: [this.sessionId] // Pass ID to command
        };
    }
    // Used for the 'when' clause in package.json menu contribution
    contextValue = 'chatHistoryItem';
}