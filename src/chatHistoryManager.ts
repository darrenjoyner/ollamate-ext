// src/chatHistoryManager.ts
import * as vscode from 'vscode';
import { ChatSession, ChatMessage } from './chatHistoryTypes';

const HISTORY_KEY = 'ollamateChatHistory_v1'; // Use versioned key

export function getChatHistory(context: vscode.ExtensionContext): ChatSession[] {
    const history = context.globalState.get<ChatSession[]>(HISTORY_KEY, []);
    // Sort the retrieved array
    return history.sort((a, b) => b.timestamp - a.timestamp);
    // Or even safer to ensure no mutation:
    // const sortedHistory = [...history].sort((a, b) => b.timestamp - a.timestamp);
    // return sortedHistory;
}

// Save the entire history (consider limiting size)
async function saveChatHistory(context: vscode.ExtensionContext, history: ChatSession[]): Promise<void> {
    const MAX_HISTORY = 50; // Example limit
 
    // 1. Create a copy and sort it in a separate step
    const sortedHistory = [...history].sort((a, b) => b.timestamp - a.timestamp);
 
    // 2. Slice the sorted copy
    const limitedHistory = sortedHistory.slice(0, MAX_HISTORY);
 
    // 3. Update global state with the limited, sorted history
    await context.globalState.update(HISTORY_KEY, limitedHistory);
    console.log(`Chat history saved/updated. Count: ${limitedHistory.length}`);
 }

// Add or Update a session (replaces simple 'add')
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

// Delete a session
export async function deleteChatSession(context: vscode.ExtensionContext, sessionId: string): Promise<void> {
    let history = getChatHistory(context);
    const initialLength = history.length;
    history = history.filter(session => session.id !== sessionId);
    if (history.length < initialLength) {
        await saveChatHistory(context, history);
        console.log(`Deleted chat session: ${sessionId}`);
    }
}

// Get a specific session
export function getChatSessionById(context: vscode.ExtensionContext, sessionId: string): ChatSession | undefined {
    const history = getChatHistory(context);
    return history.find(session => session.id === sessionId);
}

// Helper to generate summary (simple version)
export function generateSummary(messages: ChatMessage[]): string {
    const firstUserMessage = messages.find(m => m.role === 'user');
    if (firstUserMessage?.content) {
        const words = firstUserMessage.content.split(/\s+/);
        const snippet = words.slice(0, 7).join(' ');
        return words.length > 7 ? `${snippet}...` : snippet;
    }
    return "Chat Session"; // Fallback
} 