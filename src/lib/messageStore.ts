import { Message } from "@/hooks/useSocket";

// In-memory storage for messages (in production, use a database)
const messageStore = new Map<string, Message[]>();

export const addMessage = (roomId: string, message: Message) => {
  if (!messageStore.has(roomId)) {
    messageStore.set(roomId, []);
  }
  const messages = messageStore.get(roomId)!;
  messages.push(message);
  // Keep only last 100 messages per room to prevent memory issues
  if (messages.length > 100) {
    messages.splice(0, messages.length - 100);
  }
  messageStore.set(roomId, messages);
};

export const getMessages = (roomId: string): Message[] => {
  return messageStore.get(roomId) || [];
};

export const clearMessages = (roomId: string) => {
  messageStore.delete(roomId);
};

export const getAllRooms = (): string[] => {
  return Array.from(messageStore.keys());
};
