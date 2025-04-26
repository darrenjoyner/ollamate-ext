// src/chatHistoryManager.ts
import * as vscode from 'vscode';
import { ChatSession, ChatMessage } from './chatHistoryTypes';

//TODO: Add this to ENV
const HISTORY_KEY = 'ollamateChatHistory_v1'; // Use versioned key

/**
 *
 *
 * @export
 * @param {vscode.ExtensionContext} context
 * @return {*}  {ChatSession[]}
 */
export function getChatHistory(context: vscode.ExtensionContext): ChatSession[] {
    const history = context.globalState.get<ChatSession[]>(HISTORY_KEY, []);
    return history.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Save the entire history
 * @param {vscode.ExtensionContext} context
 * @param {ChatSession[]} history
 * @return {*}  {Promise<void>}
 */
async function saveChatHistory(context: vscode.ExtensionContext, history: ChatSession[]): Promise<void> {
    //TODO: Add this to settings
    const MAX_HISTORY = 50; // Example limit

    const sortedHistory = [...history].sort((a, b) => b.timestamp - a.timestamp);
 
    const limitedHistory = sortedHistory.slice(0, MAX_HISTORY);
 
    await context.globalState.update(HISTORY_KEY, limitedHistory);
    console.log(`Chat history saved/updated. Count: ${limitedHistory.length}`);
 }

/**
 * Add or Update a session
 * @export
 * @param {vscode.ExtensionContext} context
 * @param {ChatSession} session
 * @return {*}  {Promise<void>}
 */
export async function addOrUpdateChatSession(context: vscode.ExtensionContext, session: ChatSession): Promise<void> {
    if (!session || !session.id || !session.messages || session.messages.length === 0) {
        console.warn("Attempted to save an empty or invalid chat session.");
        return;
    }
    let history = getChatHistory(context);
    const index = history.findIndex(s => s.id === session.id);
    if (index !== -1) {
        history[index] = session; // Update existing
    } else {
        history.push(session); // Add new
    }
    await saveChatHistory(context, history);
}

/**
 * Delete a session
 * @export
 * @param {vscode.ExtensionContext} context
 * @param {string} sessionId
 * @return {*}  {Promise<void>}
 */
export async function deleteChatSession(context: vscode.ExtensionContext, sessionId: string): Promise<void> {
    let history = getChatHistory(context);
    const initialLength = history.length;
    history = history.filter(session => session.id !== sessionId);
    if (history.length < initialLength) {
        await saveChatHistory(context, history);
        console.log(`Deleted chat session: ${sessionId}`);
    }
}

/**
 *
 * Get a specific session
 * @export
 * @param {vscode.ExtensionContext} context
 * @param {string} sessionId
 * @return {*}  {(ChatSession | undefined)}
 */
export function getChatSessionById(context: vscode.ExtensionContext, sessionId: string): ChatSession | undefined {
    const history = getChatHistory(context);
    return history.find(session => session.id === sessionId);
}

/**
 * Helper to generate summary
 * @export
 * @param {ChatMessage[]} messages
 * @return {*}  {string}
 */
export function generateSummary(messages: ChatMessage[]): string {
    const firstUserMessage = messages.find(m => m.role === 'user');
    if (firstUserMessage?.content) {
        const words = firstUserMessage.content.split(/\s+/);
        const snippet = words.slice(0, 7).join(' ');
        return words.length > 7 ? `${snippet}...` : snippet;
    }
    return "Chat Session";
} 