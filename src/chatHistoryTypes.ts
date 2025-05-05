// src/chatHistoryTypes.ts
export interface ChatMessage {
	role: "user" | "assistant" | "system";
	content: string;
}

export interface ChatSession {
	id: string;
	name: string;
	timestamp: number;
	modelUsed: string;
	messages: ChatMessage[];
}
