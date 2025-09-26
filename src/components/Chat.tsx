"use client";

import { useState, useEffect, useRef } from "react";
import { useSocket, Message as MessageType } from "@/hooks/useSocket";
import Message from "./Message";
import { v4 as uuidv4 } from "uuid";

interface ChatProps {
  roomId: string;
  username: string;
}

export default function Chat({ roomId, username }: ChatProps) {
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [socketId, setSocketId] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    socket,
    connected,
    joinRoom,
    sendMessage,
    onReceiveMessage,
    onUserJoined,
    onMessageHistory,
  } = useSocket();

  useEffect(() => {
    if (socket) {
      setSocketId(socket.id || "");
    }
  }, [socket]);

  useEffect(() => {
    if (socket && roomId) {
      joinRoom(roomId);
    }
  }, [socket, roomId, joinRoom]);

  useEffect(() => {
    const unsubscribeReceive = onReceiveMessage((message: MessageType) => {
      setMessages((prev) => [...prev, message]);
    });

    const unsubscribeJoin = onUserJoined((id: string) => {
      console.log(`User ${id} joined the room`);
    });

    const unsubscribeHistory = onMessageHistory((history: MessageType[]) => {
      setMessages(history);
    });

    return () => {
      unsubscribeReceive();
      unsubscribeJoin();
      unsubscribeHistory();
    };
  }, [onReceiveMessage, onUserJoined, onMessageHistory]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() && connected) {
      sendMessage(roomId, newMessage.trim(), username);
      setNewMessage("");
    }
  };

  const connectionStatus = connected ? "🟢 Connected" : "🔴 Disconnected";

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b px-6 py-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-semibold text-gray-800">Team Chat</h1>
            <p className="text-sm text-gray-600">Room: {roomId}</p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">{connectionStatus}</span>
            <div className="w-3 h-3 rounded-full bg-gray-300"></div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((message) => (
            <Message
              key={message.id}
              message={message}
              isOwn={message.socketId === socketId}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="bg-white border-t px-6 py-4">
        <form onSubmit={handleSendMessage} className="flex space-x-4">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={!connected}
          />
          <button
            type="submit"
            disabled={!connected || !newMessage.trim()}
            className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            Send
          </button>
        </form>
        {!connected && (
          <p className="text-sm text-red-500 mt-2">
            Disconnected. Trying to reconnect...
          </p>
        )}
      </div>
    </div>
  );
}
