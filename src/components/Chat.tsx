"use client";

import { useState, useEffect, useRef } from "react";
import { useSocket, Message as MessageType } from "@/hooks/useSocket";
import Message from "./Message";

interface DebateConfig {
  description: string;
  toleranceLevel: string;
  duration: string;
}

interface ChatProps {
  roomId: string;
  username: string;
  debateConfig: DebateConfig;
}

export default function Chat({ roomId, username, debateConfig }: ChatProps) {
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [socketId, setSocketId] = useState<string>("");
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isDebateEnded, setIsDebateEnded] = useState(false);
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

  // Initialize timer when component mounts
  useEffect(() => {
    const durationMinutes = parseInt(debateConfig.duration);
    const durationMs = durationMinutes * 60 * 1000;
    setTimeLeft(durationMs);

    const timer = setInterval(() => {
      setTimeLeft((prevTime) => {
        if (prevTime <= 1000) {
          setIsDebateEnded(true);
          return 0;
        }
        return prevTime - 1000;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [debateConfig.duration]);

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
    if (newMessage.trim() && connected && !isDebateEnded) {
      sendMessage(roomId, newMessage.trim(), username);
      setNewMessage("");
    }
  };

  const connectionStatus = connected ? "🟢 Connected" : "🔴 Disconnected";

  // Format time left
  const formatTime = (milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const getToleranceLevelText = (level: string) => {
    switch (level) {
      case "1":
        return "Tranquilo";
      case "2":
        return "Intermedio";
      case "3":
        return "Intenso";
      default:
        return "Tranquilo";
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-slate-900">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 shadow-sm border-b border-gray-200 dark:border-slate-700 px-6 py-4">
        <div className="flex justify-between items-center">
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-gray-800 dark:text-slate-100">
              Debate Room
            </h1>
            <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-slate-400">
              <span>Room: {roomId}</span>
              <span>•</span>
              <span>
                Nivel: {getToleranceLevelText(debateConfig.toleranceLevel)}
              </span>
              <span>•</span>
              <span
                className={`font-mono ${
                  timeLeft < 60000 ? "text-red-500 font-bold" : ""
                }`}
              >
                {formatTime(timeLeft)}
              </span>
            </div>
            <div className="mt-2">
              <p className="text-sm text-gray-700 dark:text-slate-300">
                <strong>Tema:</strong> {debateConfig.description}
              </p>
            </div>
            <div className="flex items-center mt-1">
              <div className="w-2 h-2 bg-amber-400 rounded-full mr-2"></div>
              <span className="text-xs text-amber-600 dark:text-amber-400">
                AI Moderator Active
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600 dark:text-slate-400">
              {connectionStatus}
            </span>
            <div className="w-3 h-3 rounded-full bg-gray-300 dark:bg-slate-600"></div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50/50 dark:bg-slate-900/50">
        {isDebateEnded ? (
          <div className="text-center text-gray-500 dark:text-slate-400 mt-8">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <p className="text-lg font-medium text-red-600 dark:text-red-400">
              Debate Ended
            </p>
            <p className="text-sm mt-1">
              Time's up! The discussion has concluded.
            </p>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-slate-400 mt-8">
            <div className="w-16 h-16 bg-gray-200 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-gray-400 dark:text-slate-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
            <p className="text-lg font-medium">No messages yet</p>
            <p className="text-sm mt-1">Start the debate!</p>
          </div>
        ) : (
          <div className="space-y-1">
            {messages.map((message) => {
              const isOwn = message.socketId === socketId;
              console.log(
                `Chat: Message from ${message.username}, message.socketId: "${message.socketId}", current socketId: "${socketId}", isOwn: ${isOwn}`
              );
              return (
                <Message key={message.id} message={message} isOwn={isOwn} />
              );
            })}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 px-6 py-4">
        <form onSubmit={handleSendMessage} className="flex space-x-4">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={
              isDebateEnded ? "Debate has ended" : "Type your message..."
            }
            className="flex-1 border border-gray-300 dark:border-slate-600 rounded-lg px-4 py-2 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 placeholder-gray-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-colors"
            disabled={!connected || isDebateEnded}
          />
          <button
            type="submit"
            disabled={!connected || !newMessage.trim() || isDebateEnded}
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
