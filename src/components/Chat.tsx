"use client";

import { useState, useEffect, useRef } from "react";
import { useSocket, Message as MessageType, RoomInfo } from "@/hooks/useSocket";
import Message from "./Message";

interface DebateConfig {
  description: string;
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
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [turnTimeLeft, setTurnTimeLeft] = useState<number>(60);
  const [isDebateEnded, setIsDebateEnded] = useState(false);
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [debateConfig, setDebateConfig] = useState<DebateConfig | null>(
    initialDebateConfig
  );
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
    onRoomFull,
    onUsernameTaken,
    onNotYourTurn,
    onUserLeft,
    onRoomConfig,
    startDebate,
    onDebateStarted,
    onDebateNotStarted,
    onStartDebateFailed,
    onWaitingForCreator,
    onTurnTimeUpdate,
  } = useSocket();

  useEffect(() => {
    if (socket) {
      setSocketId(socket.id || "");
    }
  }, [socket]);

  // Initialize timer when debate starts
  useEffect(() => {
    if (!debateConfig || !roomInfo?.debateStarted) return;

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
  }, [debateConfig, roomInfo?.debateStarted]);

  useEffect(() => {
    if (socket && roomId && !roomInfo) {
      // Only join once when we have socket and roomId but no room info yet
      joinRoom(roomId, username, debateConfig);
    }
  }, [socket, roomId, username, joinRoom, roomInfo]);

  useEffect(() => {
    const unsubscribeReceive = onReceiveMessage((message: MessageType) => {
      setMessages((prev) => [...prev, message]);
    });

    const unsubscribeJoin = onUserJoined((socketId: string) => {
      console.log(`User with socket ${socketId} joined the room`);
    });

    const unsubscribeHistory = onMessageHistory((history: MessageType[]) => {
      setMessages(history);
    });

    const unsubscribeRoomUpdated = onRoomUpdated((roomInfo: RoomInfo) => {
      setRoomInfo(roomInfo);
      // Reset turn timer when room updates (new turn)
      if (roomInfo.debateStarted) {
        setTurnTimeLeft(60);
      }
    });

    const unsubscribeRoomFull = onRoomFull((data: { message: string }) => {
      setErrorMessage(data.message);
    });

    const unsubscribeUsernameTaken = onUsernameTaken(
      (data: { message: string }) => {
        setErrorMessage(data.message);
      }
    );

    const unsubscribeNotYourTurn = onNotYourTurn(
      (data: { message: string; currentSpeaker: string }) => {
        setErrorMessage(data.message);
      }
    );

    const unsubscribeUserLeft = onUserLeft((data: { username: string }) => {
      console.log(`User ${data.username} left the room`);
    });

    const unsubscribeRoomConfig = onRoomConfig((config: DebateConfig) => {
      setDebateConfig(config);
    });

    const unsubscribeDebateStarted = onDebateStarted((roomInfo: RoomInfo) => {
      setRoomInfo(roomInfo);
    });

    const unsubscribeDebateNotStarted = onDebateNotStarted(
      (data: { message: string }) => {
        setErrorMessage(data.message);
      }
    );

    const unsubscribeStartDebateFailed = onStartDebateFailed(
      (data: { message: string }) => {
        setErrorMessage(data.message);
      }
    );

    const unsubscribeWaitingForCreator = onWaitingForCreator(
      (data: { message: string }) => {
        console.log("Waiting for creator:", data.message);
      }
    );

    const unsubscribeTurnTimeUpdate = onTurnTimeUpdate(
      (data: { timeLeft: number; roomId: string }) => {
        console.log("⏰ Received turn time update:", data);
        if (data.roomId === roomId) {
          setTurnTimeLeft(data.timeLeft);
          console.log("⏰ Updated turn time to:", data.timeLeft);
        }
      }
    );

    return () => {
      unsubscribeReceive();
      unsubscribeJoin();
      unsubscribeHistory();
      unsubscribeRoomUpdated();
      unsubscribeRoomFull();
      unsubscribeUsernameTaken();
      unsubscribeNotYourTurn();
      unsubscribeUserLeft();
      unsubscribeRoomConfig();
      unsubscribeDebateStarted();
      unsubscribeDebateNotStarted();
      unsubscribeStartDebateFailed();
      unsubscribeWaitingForCreator();
      unsubscribeTurnTimeUpdate();
    };
  }, [
    onReceiveMessage,
    onUserJoined,
    onMessageHistory,
    onRoomUpdated,
    onRoomFull,
    onUsernameTaken,
    onNotYourTurn,
    onUserLeft,
    onRoomConfig,
    onDebateStarted,
    onDebateNotStarted,
    onStartDebateFailed,
    onWaitingForCreator,
    onTurnTimeUpdate,
  ]);

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
      setErrorMessage(""); // Clear any previous error messages
    }
  };

  const handleStartDebate = () => {
    startDebate(roomId, username);
    setErrorMessage(""); // Clear any previous error messages
  };

  // Check if it's the current user's turn
  const isMyTurn = roomInfo && roomInfo.currentSpeaker === username;

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

            {/* Prominent Turn Indicator */}
            {roomInfo && roomInfo.participants.length === 2 && (
              <div
                className={`mt-4 p-4 rounded-lg border-2 ${
                  roomInfo.debateStarted
                    ? isMyTurn
                      ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-600"
                      : "bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-600"
                    : "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-600"
                }`}
              >
                {!roomInfo.debateStarted ? (
                  <div className="text-center">
                    <div className="flex items-center justify-center mb-2">
                      <div className="w-4 h-4 bg-blue-500 rounded-full mr-2 animate-pulse"></div>
                      <span className="text-lg font-semibold text-blue-700 dark:text-blue-300">
                        Ready to Start Debate
                      </span>
                    </div>
                    <p className="text-sm text-blue-600 dark:text-blue-400 mb-3">
                      Both participants are in the room. Click to start the
                      debate!
                    </p>
                    <button
                      onClick={handleStartDebate}
                      className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                    >
                      Start Debate
                    </button>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="flex items-center justify-center mb-2">
                      <div
                        className={`w-4 h-4 rounded-full mr-2 ${
                          isMyTurn
                            ? "bg-green-500 animate-pulse"
                            : "bg-orange-500"
                        }`}
                      ></div>
                      <span
                        className={`text-lg font-bold ${
                          isMyTurn
                            ? "text-green-700 dark:text-green-300"
                            : "text-orange-700 dark:text-orange-300"
                        }`}
                      >
                        {isMyTurn
                          ? "🎯 YOUR TURN"
                          : `👤 ${roomInfo.currentSpeaker}'s Turn`}
                      </span>
                    </div>
                    {/* Turn Timer */}
                    <div className="mb-2">
                      <div
                        className={`text-2xl font-mono font-bold ${
                          isMyTurn
                            ? turnTimeLeft <= 10
                              ? "text-red-600 dark:text-red-400"
                              : "text-green-600 dark:text-green-400"
                            : "text-gray-500 dark:text-gray-400"
                        }`}
                      >
                        {turnTimeLeft}s
                      </div>
                      <div
                        className={`text-xs ${
                          isMyTurn
                            ? "text-green-600 dark:text-green-400"
                            : "text-gray-500 dark:text-gray-400"
                        }`}
                      >
                        Time remaining
                      </div>
                    </div>

                    <p
                      className={`text-sm ${
                        isMyTurn
                          ? "text-green-600 dark:text-green-400"
                          : "text-orange-600 dark:text-orange-400"
                      }`}
                    >
                      {isMyTurn
                        ? "You can now send your message"
                        : `Waiting for ${roomInfo.currentSpeaker} to respond...`}
                    </p>
                  </div>
                )}
              </div>
            )}
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
              isDebateEnded
                ? "Debate has ended"
                : !roomInfo?.debateStarted
                ? "Debate hasn't started yet"
                : !isMyTurn && roomInfo?.participants.length === 2
                ? `Wait for ${roomInfo.currentSpeaker}'s turn...`
                : "Type your message..."
            }
            className="flex-1 border border-gray-300 dark:border-slate-600 rounded-lg px-4 py-2 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 placeholder-gray-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-colors"
            disabled={
              !connected ||
              isDebateEnded ||
              !roomInfo?.debateStarted ||
              (!isMyTurn && roomInfo?.participants.length === 2)
            }
          />
          <button
            type="submit"
            disabled={
              !connected ||
              !newMessage.trim() ||
              isDebateEnded ||
              !roomInfo?.debateStarted ||
              (!isMyTurn && roomInfo?.participants.length === 2)
            }
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
        {roomInfo && roomInfo.participants.length === 1 && (
          <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-2">
            Waiting for second participant to join the debate...
          </p>
        )}
      </div>
    </div>
  );
}
