"use client";

import { useState, useEffect, useRef } from "react";
import { useSocket, Message as MessageType, RoomInfo } from "@/hooks/useSocket";
import Message from "./Message";

interface DebateConfig {
  description: string;
  customSystemPrompt?: string;
  toleranceLevel: string;
  duration: string;
}

interface ChatProps {
  roomId: string;
  username: string;
  debateConfig: DebateConfig | null;
}

export default function Chat({
  roomId,
  username,
  debateConfig: initialDebateConfig,
}: ChatProps) {
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [socketId, setSocketId] = useState<string>("");
  const [isDebateEnded, setIsDebateEnded] = useState(false);
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [debateConfig, setDebateConfig] = useState<DebateConfig | null>(
    initialDebateConfig
  );
  const [showPromptModal, setShowPromptModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    socket,
    connected,
    joinRoom,
    sendMessage,
    onReceiveMessage,
    onUserJoined,
    onMessageHistory,
    onRoomUpdated,
    onUsernameTaken,
    onUserLeft,
    onRoomConfig,
    onWaitingForCreator,
  } = useSocket();

  useEffect(() => {
    console.log("🔌 Socket effect triggered:", {
      socket: !!socket,
      socketId: socket?.id,
      currentSocketId: socketId,
    });
    if (socket && socket.id) {
      console.log("🆔 Setting socket ID:", socket.id);
      setSocketId(socket.id);
    } else if (socket && !socket.id) {
      console.log("⚠️ Socket exists but no ID yet, waiting...");
      // Wait for socket to get an ID
      const checkId = () => {
        if (socket.id) {
          console.log("🆔 Socket ID now available:", socket.id);
          setSocketId(socket.id);
        } else {
          setTimeout(checkId, 100);
        }
      };
      checkId();
    } else {
      console.log("🔴 No socket available");
      setSocketId("");
    }
  }, [socket]);

  useEffect(() => {
    if (socket && roomId && username) {
      console.log("🚪 Joining room:", {
        roomId,
        username,
        socketId: socket.id,
      });
      // Join room when we have socket, roomId, and username
      // Only join once, don't rejoin when debateConfig changes
      joinRoom(roomId, username, debateConfig);
    }
  }, [socket, roomId, username, joinRoom]);

  useEffect(() => {
    const unsubscribeReceive = onReceiveMessage((message: MessageType) => {
      console.log("🟣 Received message:", {
        message: message.message,
        username: message.username,
        socketId: message.socketId,
        currentSocketId: socketId,
        isOwn: message.socketId === socketId,
      });
      setMessages((prev) => [...prev, message]);
    });

    const unsubscribeJoin = onUserJoined((socketId: string) => {
      console.log("👥 User joined:", {
        joinedSocketId: socketId,
        currentSocketId: socketId,
        isOwnJoin: socketId === socketId,
      });
    });

    const unsubscribeHistory = onMessageHistory((history: MessageType[]) => {
      console.log("📚 Message history received:", {
        historyLength: history.length,
        messages: history.map((m) => ({
          id: m.id,
          username: m.username,
          message: m.message,
        })),
      });
      setMessages(history);
    });

    const unsubscribeRoomUpdated = onRoomUpdated((roomInfo: RoomInfo) => {
      console.log("🏠 Room updated:", JSON.stringify(roomInfo, null, 2));
      setRoomInfo(roomInfo);
    });

    const unsubscribeUsernameTaken = onUsernameTaken(
      (data: { message: string }) => {
        setErrorMessage(data.message);
      }
    );

    const unsubscribeUserLeft = onUserLeft((data: { username: string }) => {
      console.log(`User ${data.username} left the room`);
    });

    const unsubscribeRoomConfig = onRoomConfig((config: DebateConfig) => {
      setDebateConfig(config);
    });

    const unsubscribeWaitingForCreator = onWaitingForCreator(
      (data: { message: string }) => {
        console.log("Waiting for creator:", data.message);
      }
    );

    return () => {
      unsubscribeReceive();
      unsubscribeJoin();
      unsubscribeHistory();
      unsubscribeRoomUpdated();
      unsubscribeUsernameTaken();
      unsubscribeUserLeft();
      unsubscribeRoomConfig();
      unsubscribeWaitingForCreator();
    };
  }, [
    onReceiveMessage,
    onUserJoined,
    onMessageHistory,
    onRoomUpdated,
    onUsernameTaken,
    onUserLeft,
    onRoomConfig,
    onWaitingForCreator,
  ]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("🔵 Sending message:", {
      message: newMessage.trim(),
      connected,
      socketId,
      roomId,
      username,
    });
    if (newMessage.trim() && connected && !isDebateEnded) {
      sendMessage(roomId, newMessage.trim(), username);
      setNewMessage("");
      setErrorMessage(""); // Clear any previous error messages
    }
  };

  const connectionStatus = connected ? "🟢 Connected" : "🔴 Disconnected";

  // Show loading if debate config is not available yet
  if (!debateConfig) {
    return (
      <div className="flex flex-col h-screen bg-gray-50 dark:bg-slate-900">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-slate-400 mb-4">
              Loading room configuration...
            </p>
            <p className="text-sm text-gray-500 dark:text-slate-500">
              Waiting for room creator to join...
            </p>
          </div>
        </div>
      </div>
    );
  }

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

  // Generate the full prompt that AI is using (matching server-side logic)
  const getFullAIPrompt = () => {
    const systemPrompt =
      debateConfig?.customSystemPrompt ||
      "No hay reglas personalizadas definidas";

    // Get last 10 messages for context
    const conversationHistory = messages.slice(-10);
    let conversationContext = "";
    if (conversationHistory.length > 0) {
      conversationContext = `\n\nRecent conversation context:\n${conversationHistory
        .map((msg) => `${msg.username}: ${msg.message}`)
        .join("\n")}\n`;
    }

    const exampleMessage = "[El mensaje del usuario se analizará aquí]";
    const exampleUsername = "[username]";

    return `Debes analizar el siguiente mensaje según las reglas y comportamiento definidos a continuación.

REGLAS Y COMPORTAMIENTO:
${systemPrompt}

MENSAJE A ANALIZAR:
Usuario: "${exampleUsername}"
Mensaje: "${exampleMessage}"${conversationContext}

INSTRUCCIONES DE RESPUESTA:
1. Evalúa si debes intervenir según las reglas establecidas arriba
2. Si las reglas indican que debes responder/intervenir/saludar/actuar de alguna manera, establece shouldRespond: true
3. Si no hay necesidad de intervención según las reglas, establece shouldRespond: false

CRÍTICO: Responde ÚNICAMENTE con JSON válido. NO uses markdown, NO incluyas texto adicional, NO uses \`\`\`json\`\`\`. Solo el JSON puro.

Formato JSON requerido:
{
  "shouldRespond": true/false,
  "response": "tu mensaje/respuesta/saludo/intervención si shouldRespond es true, vacío si es false",
  "reason": "breve razón de tu decisión"
}`;
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
              {roomInfo && (
                <>
                  <span>•</span>
                  <span>
                    {roomInfo.participants.length} participant
                    {roomInfo.participants.length !== 1 ? "s" : ""}
                  </span>
                </>
              )}
            </div>
            <div className="mt-2">
              <p className="text-sm text-gray-700 dark:text-slate-300">
                <strong>Tema:</strong> {debateConfig.description}
              </p>
              {roomInfo && roomInfo.participants.length > 0 && (
                <div className="mt-1">
                  <p className="text-xs text-gray-600 dark:text-slate-400">
                    <strong>Participants:</strong>{" "}
                    {roomInfo.participants.map((p) => p.username).join(", ")}
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center mt-1 space-x-4">
              <div className="flex items-center">
                <div className="w-2 h-2 bg-amber-400 rounded-full mr-2"></div>
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  AI Moderator Active
                </span>
              </div>
              <button
                onClick={() => setShowPromptModal(true)}
                className="text-xs px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-md hover:bg-purple-200 dark:hover:bg-purple-800/50 transition-colors border border-purple-300 dark:border-purple-700"
              >
                📝 View AI Prompt
              </button>
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
              Time&apos;s up! The discussion has concluded.
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
        {errorMessage && (
          <p className="text-sm text-red-500 mt-2">{errorMessage}</p>
        )}
      </div>

      {/* AI Prompt Modal */}
      {showPromptModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-slate-700">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-slate-100">
                🤖 AI Prompt Being Used
              </h2>
              <button
                onClick={() => setShowPromptModal(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="bg-gray-50 dark:bg-slate-900 rounded-lg p-4 border border-gray-200 dark:border-slate-700">
                <pre className="text-xs text-gray-800 dark:text-slate-200 whitespace-pre-wrap font-mono">
                  {getFullAIPrompt()}
                </pre>
              </div>

              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">
                  ℹ️ About This Prompt
                </h3>
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  This is the exact prompt that the AI uses to analyze each
                  message in the debate. It includes your custom system prompt,
                  the conversation context (last 10 messages), and instructions
                  for how the AI should respond.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-gray-200 dark:border-slate-700 flex justify-end space-x-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(getFullAIPrompt());
                  alert("Prompt copied to clipboard!");
                }}
                className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                📋 Copy to Clipboard
              </button>
              <button
                onClick={() => setShowPromptModal(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 text-gray-800 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
