"use client";

import { useState, useEffect, useRef } from "react";
import { useSocket, Message as MessageType, RoomInfo } from "@/hooks/useSocket";
import Message from "./Message";
import { DebateConfig } from "@/types";

interface ChatProps {
  roomId: string;
  username: string;
  debateConfig: DebateConfig | null;
  initialArgument?: string;
}

export default function Chat({
  roomId,
  username,
  debateConfig: initialDebateConfig,
  initialArgument,
}: ChatProps) {
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [socketId, setSocketId] = useState<string>("");
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [debateCountdownNow, setDebateCountdownNow] = useState(() =>
    Date.now()
  );
  const [showExtendModal, setShowExtendModal] = useState(false);
  const extendModalShownForEndRef = useRef<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [debateConfig, setDebateConfig] = useState<DebateConfig | null>(
    initialDebateConfig
  );
  const [showMocionModal, setShowMocionModal] = useState(false);
  const [selectedMocionMessage, setSelectedMocionMessage] =
    useState<MessageType | null>(null);
  const [mocionText, setMocionText] = useState("");
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Debate total duration: remaining seconds (Infinity = sin límite)
  const debateRemainingSeconds =
    roomInfo?.debateEndTime == null
      ? Infinity
      : Math.max(
          0,
          Math.floor((roomInfo.debateEndTime - debateCountdownNow) / 1000)
        );
  const isDebateEnded =
    roomInfo?.debateEndTime != null && debateRemainingSeconds <= 0;

  // Sync countdown when debate end time is set, then tick every second
  useEffect(() => {
    if (roomInfo?.debateEndTime == null) return;
    setDebateCountdownNow(Date.now());
    const id = setInterval(() => setDebateCountdownNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [roomInfo?.debateEndTime]);

  // Show extend modal when 5 min left (once per debate end)
  useEffect(() => {
    if (
      roomInfo?.debateEndTime != null &&
      debateRemainingSeconds > 0 &&
      debateRemainingSeconds <= 300
    ) {
      if (extendModalShownForEndRef.current !== roomInfo.debateEndTime) {
        extendModalShownForEndRef.current = roomInfo.debateEndTime;
        setShowExtendModal(true);
      }
    }
  }, [roomInfo?.debateEndTime, debateRemainingSeconds]);

  const {
    socket,
    connected,
    joinRoom,
    sendMessage,
    submitMocion,
    startConversation,
    extendDebate,
    onReceiveMessage,
    onUserJoined,
    onMessageHistory,
    onRoomUpdated,
    onUsernameTaken,
    onUserLeft,
    onRoomConfig,
    onWaitingForCreator,
    onTurnTimeUpdate,
    onMessageError,
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
          console.log("🆔 Socket ID now available1:", socket.id);
          setSocketId(socket.id);
        } else {
          setTimeout(checkId, 100);
        }
      };
      checkId();
    } else {
      console.log("🔴 No socket availabless");
      setSocketId("");
    }
  }, [socket, socketId]);

  useEffect(() => {
    if (socket && roomId && username) {
      console.log("🚪 Joining room:", {
        roomId,
        username,
        socketId: socket.id,
      });
      // Join room when we have socket, roomId, and username
      // Only join once, don't rejoin when debateConfig changes
      joinRoom(roomId, username, debateConfig, initialArgument);
    }
  }, [socket, roomId, username, joinRoom, debateConfig, initialArgument]);

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
      // Timer will be updated by turn-time-update events from server
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

    const unsubscribeTurnTimeUpdate = onTurnTimeUpdate(
      (data: { timeLeft: number; roomId: string }) => {
        if (data.roomId === roomId) {
          setTimeLeft(data.timeLeft);
        }
      }
    );

    const unsubscribeMessageError = onMessageError(
      (data: { message: string }) => {
        setErrorMessage(data.message);
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
      unsubscribeTurnTimeUpdate();
      unsubscribeMessageError();
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
    onTurnTimeUpdate,
    onMessageError,
    socketId,
    roomId,
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
      currentSpeaker: roomInfo?.currentSpeaker,
      isMyTurn: roomInfo?.currentSpeaker === username,
    });

    // Check if it's the user's turn
    if (
      roomInfo?.conversationStarted &&
      roomInfo?.currentSpeaker !== username
    ) {
      setErrorMessage(
        `No es tu turno. Es el turno de ${roomInfo.currentSpeaker}.`
      );
      return;
    }

    if (
      newMessage.trim() &&
      connected &&
      !isDebateEnded &&
      roomInfo?.conversationStarted
    ) {
      sendMessage(roomId, newMessage.trim(), username);
      setNewMessage("");
      setErrorMessage(""); // Clear any previous error messages
    }
  };

  // Check if it's the current user's turn
  const isMyTurn =
    roomInfo?.conversationStarted && roomInfo?.currentSpeaker === username;

  const handleMocionClick = (message: MessageType) => {
    setSelectedMocionMessage(message);
    setShowMocionModal(true);
    setMocionText("");
  };

  const handleMocionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mocionText.trim() && selectedMocionMessage && submitMocion) {
      console.log("📝 Submitting mocion:", {
        moderatorMessage: selectedMocionMessage.message,
        mocionText: mocionText.trim(),
        username,
        roomId,
      });
      submitMocion(
        roomId,
        username,
        selectedMocionMessage.message,
        mocionText.trim()
      );
      setShowMocionModal(false);
      setMocionText("");
      setSelectedMocionMessage(null);
    }
  };

  const handleStartConversation = () => {
    if (startConversation && connected) {
      console.log("🚀 Starting conversation:", { roomId, username });
      startConversation(roomId, username);
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

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-slate-900">
      {/* Main Chat Area */}
      <div className="flex flex-col w-full">
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
                {roomInfo?.conversationStarted && (
                  <>
                    <span className="text-xs text-gray-500 dark:text-slate-500">
                      •
                    </span>
                    <span className="text-xs text-gray-600 dark:text-slate-400">
                      Debate:{" "}
                      {roomInfo.debateEndTime == null ? (
                        "Sin límite"
                      ) : isDebateEnded ? (
                        <span className="text-red-600 dark:text-red-400">
                          Finalizado
                        </span>
                      ) : (
                        <span className="font-mono">
                          {Math.floor(debateRemainingSeconds / 60)}:
                          {String(debateRemainingSeconds % 60).padStart(2, "0")}
                        </span>
                      )}
                    </span>
                  </>
                )}
                {roomInfo?.currentSpeaker && (
                  <>
                    <span className="text-xs text-gray-500 dark:text-slate-500">
                      •
                    </span>
                    <div className="flex items-center">
                      <span className="text-xs text-gray-600 dark:text-slate-400">
                        Turno: <strong>{roomInfo.currentSpeaker}</strong>
                      </span>
                      {timeLeft !== null && (
                        <span
                          className={`ml-2 text-xs font-mono font-semibold ${
                            timeLeft <= 10
                              ? "text-red-600 dark:text-red-400"
                              : timeLeft <= 20
                              ? "text-orange-600 dark:text-orange-400"
                              : "text-green-600 dark:text-green-400"
                          }`}
                        >
                          {timeLeft}s
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {/* Profile Section */}
              <div className="flex items-center space-x-2 px-3 py-1.5 bg-gray-100 dark:bg-slate-700 rounded-lg">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                  {username.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-slate-200">
                  {username}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600 dark:text-slate-400">
                  {connectionStatus}
                </span>
                <div className="w-3 h-3 rounded-full bg-gray-300 dark:bg-slate-600"></div>
              </div>
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
          ) : !roomInfo?.conversationStarted ? (
            <div className="text-center text-gray-500 dark:text-slate-400 mt-8">
              <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-blue-500 dark:text-blue-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <p className="text-lg font-medium">Ready to start?</p>
              <p className="text-sm mt-1 mb-4">
                {roomInfo && roomInfo.participants.length > 0
                  ? `Waiting for ${roomInfo.participants.length} participant${
                      roomInfo.participants.length !== 1 ? "s" : ""
                    } to join...`
                  : "Waiting for participants..."}
              </p>
              <button
                onClick={handleStartConversation}
                disabled={
                  !connected || !roomInfo || roomInfo.participants.length === 0
                }
                className="bg-green-500 hover:bg-green-600 disabled:bg-gray-300 dark:disabled:bg-slate-600 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:cursor-not-allowed shadow-sm"
              >
                🚀 Start Conversation
              </button>
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
                  <Message
                    key={message.id}
                    message={message}
                    isOwn={isOwn}
                    onMocionClick={handleMocionClick}
                  />
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
                !roomInfo?.conversationStarted
                  ? "Wait for conversation to start..."
                  : !isMyTurn
                  ? `No es tu turno. Es el turno de ${roomInfo?.currentSpeaker}.`
                  : isDebateEnded
                  ? "Debate finalizado"
                  : "Type your message..."
              }
              className="flex-1 border border-gray-300 dark:border-slate-600 rounded-lg px-4 py-2 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 placeholder-gray-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-colors"
              disabled={
                !connected ||
                isDebateEnded ||
                !roomInfo?.conversationStarted ||
                !isMyTurn
              }
            />
            <button
              type="submit"
              disabled={
                !connected ||
                !newMessage.trim() ||
                isDebateEnded ||
                !roomInfo?.conversationStarted ||
                !isMyTurn
              }
              className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white px-6 py-2 rounded-lg font-medium transition-colors"
              title={
                !isMyTurn && roomInfo?.conversationStarted
                  ? `No es tu turno. Es el turno de ${roomInfo.currentSpeaker}.`
                  : undefined
              }
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
      </div>

      {/* Extend debate modal (5 min before end) */}
      {showExtendModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-slate-100 mb-2">
              ¿Extender el debate?
            </h2>
            <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
              Quedan menos de 5 minutos. ¿Deseas añadir más tiempo?
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  extendDebate(roomId, 6);
                  setShowExtendModal(false);
                }}
                className="w-full px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
              >
                + 6 minutos
              </button>
              <button
                type="button"
                onClick={() => {
                  extendDebate(roomId, 15);
                  setShowExtendModal(false);
                }}
                className="w-full px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
              >
                + 15 minutos
              </button>
              <button
                type="button"
                onClick={() => {
                  extendDebate(roomId, 30);
                  setShowExtendModal(false);
                }}
                className="w-full px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
              >
                + 30 minutos
              </button>
              <button
                type="button"
                onClick={() => {
                  extendDebate(roomId, 45);
                  setShowExtendModal(false);
                }}
                className="w-full px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
              >
                + 45 minutos
              </button>
              <button
                type="button"
                onClick={() => {
                  extendDebate(roomId, 0);
                  setShowExtendModal(false);
                }}
                className="w-full px-4 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors"
              >
                Sin límite
              </button>
              <button
                type="button"
                onClick={() => setShowExtendModal(false)}
                className="w-full px-4 py-3 bg-gray-200 dark:bg-slate-600 text-gray-800 dark:text-slate-200 rounded-lg hover:bg-gray-300 dark:hover:bg-slate-500 transition-colors"
              >
                No extender
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mocion Modal */}
      {showMocionModal && selectedMocionMessage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-6 w-full max-w-2xl mx-4">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-slate-100 mb-4">
              Moción
            </h2>
            <p className="text-sm text-gray-700 dark:text-slate-300 mb-4">
              Participante <strong>{username}</strong> está solicitando una
              moción al siguiente mensaje del moderador:
            </p>
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4 mb-4">
              <p className="text-sm text-amber-900 dark:text-amber-100">
                {selectedMocionMessage.message}
              </p>
            </div>
            <form onSubmit={handleMocionSubmit}>
              <textarea
                value={mocionText}
                onChange={(e) => setMocionText(e.target.value)}
                placeholder="Escribe tu aclaración aquí..."
                rows={6}
                className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-4 py-3 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 placeholder-gray-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-colors resize-y text-sm mb-4"
              />
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowMocionModal(false);
                    setMocionText("");
                    setSelectedMocionMessage(null);
                  }}
                  className="px-4 py-2 bg-gray-200 dark:bg-slate-600 text-gray-800 dark:text-slate-200 rounded-lg hover:bg-gray-300 dark:hover:bg-slate-500 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!mocionText.trim()}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 dark:disabled:bg-slate-600 text-white rounded-lg font-medium transition-colors disabled:cursor-not-allowed"
                >
                  Enviar moción
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
