"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSocket, Message as MessageType, RoomInfo } from "@/hooks/useSocket";
import { useVoiceCall } from "@/hooks/useVoiceCall";
import { useSpeechToMessage } from "@/hooks/useSpeechToMessage";
import Message from "./Message";
import VoiceLevelIndicator from "./VoiceLevelIndicator";
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
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [pointsOverlay, setPointsOverlay] = useState<number | null>(null);
  const [pointsOverlayPhase, setPointsOverlayPhase] = useState<
    "enter" | "exit"
  >("enter");
  const [negativePointsOverlay, setNegativePointsOverlay] = useState<
    number | null
  >(null);
  const [negativePointsOverlayPhase, setNegativePointsOverlayPhase] = useState<
    "enter" | "exit"
  >("enter");
  const prevScoreRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sidePanelEndRef = useRef<HTMLDivElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

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
    joinVoice,
    leaveVoice,
    sendVoiceOffer,
    sendVoiceAnswer,
    sendVoiceIceCandidate,
    onVoiceParticipantJoined,
    onVoiceParticipantLeft,
    onVoiceParticipants,
    onVoiceOffer,
    onVoiceAnswer,
    onVoiceIce,
  } = useSocket();

  const voiceCall = useVoiceCall({
    roomId,
    socketId: socketId || null,
    joinVoice,
    leaveVoice,
    sendVoiceOffer,
    sendVoiceAnswer,
    sendVoiceIceCandidate,
    onVoiceParticipantJoined,
    onVoiceParticipantLeft,
    onVoiceParticipants,
    onVoiceOffer,
    onVoiceAnswer,
    onVoiceIce,
  });

  const isInVoiceCall =
    voiceCall.state === "connected" ||
    voiceCall.state === "waiting" ||
    voiceCall.state === "joining";
  const isMyTurn =
    !!roomInfo?.conversationStarted && roomInfo?.currentSpeaker === username;
  const isMyTurnRef = useRef(isMyTurn);
  isMyTurnRef.current = isMyTurn;

  const handleFinalTranscript = useCallback(
    (text: string) => {
      if (isMyTurnRef.current && text.trim()) {
        sendMessage(roomId, text.trim(), username);
      }
    },
    [roomId, username, sendMessage]
  );

  const {
    isSupported: isSpeechSupported,
    isListening,
    interimTranscript,
  } = useSpeechToMessage({
    // Only run recognition when it's our turn - avoids conflicts when 2 tabs share same mic on same PC
    enabled: isInVoiceCall && !!roomInfo?.conversationStarted && isMyTurn,
    roomId,
    username,
    onFinalTranscript: handleFinalTranscript,
  });

  // Auto-mute when it's not my turn; unmute when it's my turn (so other participant only hears me when I'm speaking)
  const setVoiceMuted = voiceCall.setMuted;
  useEffect(() => {
    if (!isInVoiceCall) return;
    setVoiceMuted(!isMyTurn);
  }, [isInVoiceCall, isMyTurn, setVoiceMuted]);

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
      const newScore =
        roomInfo.participantScores != null && username
          ? roomInfo.participantScores[username] ?? null
          : null;
      const prevScore = prevScoreRef.current;
      if (
        newScore != null &&
        prevScore != null &&
        typeof newScore === "number" &&
        typeof prevScore === "number"
      ) {
        const delta = newScore - prevScore;
        if (delta > 0) {
          setPointsOverlay(delta);
          setPointsOverlayPhase("enter");
        } else if (delta < 0) {
          setNegativePointsOverlay(Math.abs(delta));
          setNegativePointsOverlayPhase("enter");
        }
      }
      prevScoreRef.current = newScore ?? prevScore;
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
    username,
  ]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Reproduce el audio remoto (voz de la otra persona) en tiempo real como en una llamada
  useEffect(() => {
    const el = remoteAudioRef.current;
    if (!el) return;
    if (voiceCall.remoteStream) {
      el.srcObject = voiceCall.remoteStream;
      el.play().catch(() => {});
    } else {
      el.srcObject = null;
    }
  }, [voiceCall.remoteStream]);

  useEffect(() => {
    if (sidePanelOpen) {
      sidePanelEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [sidePanelOpen, messages]);

  // Points overlay: duración del fade controlada por POINTS_OVERLAY_DURATION_MS (debe ser >= duración de la animación en globals.css)
  const POINTS_OVERLAY_DURATION_MS = 2000;
  useEffect(() => {
    if (pointsOverlay == null) return;
    const t1 = setTimeout(() => setPointsOverlayPhase("exit"), 1500);
    const t2 = setTimeout(() => {
      setPointsOverlay(null);
      setPointsOverlayPhase("enter");
    }, POINTS_OVERLAY_DURATION_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [pointsOverlay]);

  useEffect(() => {
    if (negativePointsOverlay == null) return;
    const t1 = setTimeout(() => setNegativePointsOverlayPhase("exit"), 1500);
    const t2 = setTimeout(() => {
      setNegativePointsOverlay(null);
      setNegativePointsOverlayPhase("enter");
    }, POINTS_OVERLAY_DURATION_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [negativePointsOverlay]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Main chat: participants + only the one moderator message marked showInMainChat (first sanction per turn).
  // Treat as participant any message where isAIModerator is not explicitly true (so history after refresh works).
  const mainChatMessages = messages.filter((m) => {
    const isModerator = m.isAIModerator === true;
    if (!isModerator) return true;
    return (
      m.showInMainChat === true ||
      (m.showInMainChat === undefined && m.isSanction !== false)
    );
  });

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
      {/* Points overlay: full-screen animation when positive points are awarded */}
      {pointsOverlay != null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
          aria-hidden
        >
          <div
            className="font-black text-[min(20rem,30vw)] text-transparent bg-clip-text bg-gradient-to-b from-emerald-400 to-green-600 dark:from-emerald-300 dark:to-green-500 drop-shadow-[0_0_40px_rgba(52,211,153,0.5)] dark:drop-shadow-[0_0_60px_rgba(52,211,153,0.6)]"
            style={
              pointsOverlayPhase === "enter"
                ? { animation: "points-pop-in 1.8s ease-out forwards" }
                : { opacity: 0, transition: "opacity 0.2s ease-out" }
            }
          >
            +{pointsOverlay.toFixed(1)}
          </div>
        </div>
      )}

      {/* Negative points overlay: full-screen when sanction points are applied (red) */}
      {negativePointsOverlay != null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
          aria-hidden
        >
          <div
            className="font-black text-[min(20rem,30vw)] text-transparent bg-clip-text bg-gradient-to-b from-red-400 to-red-700 dark:from-red-400 dark:to-red-800 drop-shadow-[0_0_40px_rgba(248,113,113,0.5)] dark:drop-shadow-[0_0_60px_rgba(248,113,113,0.6)]"
            style={
              negativePointsOverlayPhase === "enter"
                ? { animation: "points-pop-in 1.8s ease-out forwards" }
                : { opacity: 0, transition: "opacity 0.2s ease-out" }
            }
          >
            -
            {negativePointsOverlay.toFixed(
              negativePointsOverlay % 1 === 0 ? 0 : 1
            )}
          </div>
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex flex-col flex-1 min-w-0">
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
              {/* Toggle side panel (full log) */}
              <button
                type="button"
                onClick={() => setSidePanelOpen((o) => !o)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                  sidePanelOpen
                    ? "bg-amber-100 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200"
                    : "bg-gray-100 dark:bg-slate-700 border-gray-200 dark:border-slate-600 text-gray-700 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-slate-600"
                }`}
                title={
                  sidePanelOpen
                    ? "Cerrar log completo"
                    : "Abrir log completo (todos los mensajes)"
                }
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span className="text-sm font-medium hidden sm:inline">
                  {sidePanelOpen ? "Cerrar log" : "Log completo"}
                </span>
              </button>
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

        {/* Scoreboard - always visible when we have participants */}
        {roomInfo && roomInfo.participants.length > 0 && (
          <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-6 py-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 mb-2">
              Tablero de puntos
            </p>
            <div className="flex flex-wrap gap-4">
              {roomInfo.participants.map((p) => (
                <div
                  key={p.socketId}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 dark:bg-slate-700 border border-gray-200 dark:border-slate-600"
                >
                  <span className="text-sm font-medium text-gray-800 dark:text-slate-200">
                    {p.username}
                  </span>
                  <span className="text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                    {(roomInfo.participantScores?.[p.username] ?? 0).toFixed(1)}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-slate-400">
                    pts
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

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
          ) : !roomInfo?.conversationStarted && messages.length === 0 ? (
            /* Show "Ready to start?" only when no messages; after refresh, message-history may arrive before room-updated, so having messages means show main chat. */
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
          ) : mainChatMessages.length === 0 ? (
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
              {mainChatMessages.map((message) => {
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

        {/* Audio remoto: voz de la otra persona en tiempo real (oculto, solo reproducción) */}
        <audio
          ref={remoteAudioRef}
          autoPlay
          playsInline
          className="hidden"
          aria-label="Remote participant voice"
        />

        {/* Voice call bar: alternative to text (phone-call style) */}
        <div className="bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 px-6 py-3">
          <div className="flex flex-wrap items-center gap-3">
            {voiceCall.state === "idle" || voiceCall.state === "error" ? (
              <button
                type="button"
                onClick={voiceCall.joinVoiceCall}
                disabled={!connected}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 dark:disabled:bg-slate-600 text-white text-sm font-medium transition-colors disabled:cursor-not-allowed"
                title="Join voice call (like a phone call). Your speech will be sent as text when you stop talking and moderated by the AI."
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.83V20c0 .55.45 1 1 1s1-.45 1-1v-2.18c3-.48 5.42-2.83 5.91-5.82.09-.6-.39-1.14-1-1.14z" />
                </svg>
                Join voice
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={voiceCall.leaveVoiceCall}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
                  title="Leave voice call"
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.79-.18.16-.43.25-.7.25-.5 0-.9-.4-.9-.9V8.05c0-.5.4-.9.9-.9.2 0 .39.06.55.2.79.66 1.67 1.29 2.65 1.78.34.17.57.52.57.91v3.1C8.85 9.25 10.4 9 12 9zm0-6c-1.66 0-3 1.34-3 3v4.27c0 .5.4.9.9.9s.9-.4.9-.9V6c0-.83.67-1.5 1.5-1.5S15 5.17 15 6v4.27c0 .5.4.9.9.9s.9-.4.9-.9V6c0-1.66-1.34-3-3-3z" />
                  </svg>
                  Leave voice
                </button>
                <VoiceLevelIndicator
                  stream={voiceCall.localStream}
                  muted={voiceCall.isMuted}
                  className="shrink-0"
                />
                <button
                  type="button"
                  onClick={() => voiceCall.setMuted(!voiceCall.isMuted)}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    voiceCall.isMuted
                      ? "bg-amber-600 hover:bg-amber-700 text-white"
                      : "bg-gray-200 dark:bg-slate-600 hover:bg-gray-300 dark:hover:bg-slate-500 text-gray-800 dark:text-slate-200"
                  }`}
                  title={voiceCall.isMuted ? "Unmute" : "Mute"}
                >
                  {voiceCall.isMuted ? (
                    <>
                      <svg
                        className="w-5 h-5"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                      </svg>
                      Unmute
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-5 h-5"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.83V20c0 .55.45 1 1 1s1-.45 1-1v-2.18c3-.48 5.42-2.83 5.91-5.82.09-.6-.39-1.14-1-1.14z" />
                      </svg>
                      Mute
                    </>
                  )}
                </button>
                <span className="text-sm text-gray-600 dark:text-slate-400">
                  {voiceCall.state === "joining" && "Connecting…"}
                  {voiceCall.state === "waiting" &&
                    "Waiting for other participant…"}
                  {voiceCall.state === "connected" && (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      Voice connected
                    </span>
                  )}
                </span>
                {isSpeechSupported && roomInfo?.conversationStarted && (
                  <span className="text-xs text-gray-500 dark:text-slate-500">
                    Pause to send (when it’s your turn). Sent as text, moderated
                    by AI.
                  </span>
                )}
                {isListening && (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    Listening…
                  </span>
                )}
                {interimTranscript.trim() && (
                  <span
                    className="text-sm text-gray-600 dark:text-slate-400 italic max-w-[200px] truncate"
                    title={interimTranscript}
                  >
                    “…{interimTranscript}”
                  </span>
                )}
              </>
            )}
          </div>
          {voiceCall.error && (
            <p className="text-sm text-red-500 mt-2">{voiceCall.error}</p>
          )}
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

      {/* Right side panel: full log (all messages including moderator) */}
      {sidePanelOpen && (
        <div className="flex flex-col w-full max-w-md min-w-[320px] border-l border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-slate-100">
              Log completo
            </h2>
            <button
              type="button"
              onClick={() => setSidePanelOpen(false)}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              title="Cerrar panel"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
            {messages.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-slate-400 py-4 text-center">
                Sin mensajes aún
              </p>
            ) : (
              messages.map((message) => {
                const isOwn = message.socketId === socketId;
                return (
                  <Message
                    key={message.id}
                    message={message}
                    isOwn={isOwn}
                    onMocionClick={handleMocionClick}
                  />
                );
              })
            )}
            <div ref={sidePanelEndRef} />
          </div>
        </div>
      )}

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
