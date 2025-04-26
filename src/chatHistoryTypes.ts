// src/chatHistoryTypes.ts
export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface ChatSession {
    id: string; // Unique ID (e.g., timestamp string)
    name: string; // Summary name generated
    timestamp: number; // Unix timestamp for sorting
    modelUsed: string; // Model used for this session
    messages: ChatMessage[];
}