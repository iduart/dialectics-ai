"use client";

import { useEffect, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { DebateConfig } from "@/types";

export interface Message {
  id: string;
  message: string;
  username: string;
  timestamp: string;
  socketId: string;
  isAIModerator?: boolean;
  reason?: string;
  promptName?: string;
}

export interface RoomInfo {
  participants: Array<{ socketId: string; username: string }>;
  currentTurn?: number;
  currentSpeaker?: string;
  conversationStarted?: boolean;
}

export const useSocket = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    console.log("🔄 Creating new socket connection...");
    const newSocket = io(
      process.env.NODE_ENV === "production"
        ? window.location.origin
        : "http://localhost:3000",
      {
        transports: ["polling", "websocket"],
        upgrade: true,
        rememberUpgrade: true,
      }
    );
    console.log("🆕 Socket created:", newSocket.id);

    newSocket.on("connect", () => {
      console.log("✅ Connected to server:", {
        socketId: newSocket.id,
        timestamp: new Date().toISOString(),
        transport: newSocket.io.engine.transport.name,
      });
      setConnected(true);
      // Force a re-render to update socket ID
      setSocket(newSocket);
    });

    newSocket.on("disconnect", (reason) => {
      console.log("❌ Disconnected from server:", {
        reason: reason,
        socketId: newSocket.id,
        timestamp: new Date().toISOString(),
      });
      setConnected(false);
    });

    newSocket.on("connect_error", (error) => {
      console.error("🚨 Connection error:", {
        error: error.message,
        socketId: newSocket.id,
        timestamp: new Date().toISOString(),
      });
      setConnected(false);
    });

    setSocket(newSocket);

    return () => {
      console.log("🧹 Cleaning up socket:", newSocket.id);
      newSocket.close();
    };
  }, []);

  const joinRoom = useCallback(
    (roomId: string, username: string, debateConfig?: DebateConfig | null) => {
      if (socket) {
        socket.emit("join-room", { roomId, username, debateConfig });
      }
    },
    [socket]
  );

  const sendMessage = useCallback(
    (roomId: string, message: string, username: string) => {
      console.log("🟡 Emitting send-message:", {
        roomId,
        message,
        username,
        socketId: socket?.id,
      });
      if (socket) {
        socket.emit("send-message", { roomId, message, username });
        console.log("📤 send-message event sent");
      } else {
        console.log("🔴 No socket available");
      }
    },
    [socket]
  );

  const queryAI = useCallback(
    (query: string, username: string, roomId: string) => {
      console.log("🤖 Querying AI:", {
        query,
        username,
        roomId,
        socketId: socket?.id,
        socketConnected: socket?.connected,
      });
      if (socket) {
        console.log("📤 Emitting query-ai event with data:", {
          query,
          username,
          roomId,
        });
        socket.emit("query-ai", { query, username, roomId });
        console.log("✅ query-ai event sent successfully");
      } else {
        console.log("🔴 No socket available for AI query");
      }
    },
    [socket]
  );

  const submitMocion = useCallback(
    (
      roomId: string,
      username: string,
      moderatorMessage: string,
      mocionMessage: string
    ) => {
      console.log("📝 Submitting mocion:", {
        roomId,
        username,
        moderatorMessage,
        mocionMessage,
        socketId: socket?.id,
        socketConnected: socket?.connected,
      });
      if (socket) {
        console.log("📤 Emitting submit-mocion event with data:", {
          roomId,
          username,
          moderatorMessage,
          mocionMessage,
        });
        socket.emit("submit-mocion", {
          roomId,
          username,
          moderatorMessage,
          mocionMessage,
        });
        console.log("✅ submit-mocion event sent successfully");
      } else {
        console.log("🔴 No socket available for mocion submission");
      }
    },
    [socket]
  );

  const startConversation = useCallback(
    (roomId: string, username: string) => {
      console.log("🚀 Starting conversation:", {
        roomId,
        username,
        socketId: socket?.id,
        socketConnected: socket?.connected,
      });
      if (socket) {
        console.log("📤 Emitting start-conversation event with data:", {
          roomId,
          username,
        });
        socket.emit("start-conversation", { roomId, username });
        console.log("✅ start-conversation event sent successfully");
      } else {
        console.log("🔴 No socket available for starting conversation");
      }
    },
    [socket]
  );

  const onReceiveMessage = useCallback(
    (callback: (message: Message) => void) => {
      if (socket) {
        socket.on("receive-message", callback);
        return () => socket.off("receive-message", callback);
      }
      return () => {};
    },
    [socket]
  );

  const onUserJoined = useCallback(
    (callback: (socketId: string) => void) => {
      if (socket) {
        socket.on("user-joined", callback);
        return () => socket.off("user-joined", callback);
      }
      return () => {};
    },
    [socket]
  );

  const onMessageHistory = useCallback(
    (callback: (messages: Message[]) => void) => {
      if (socket) {
        socket.on("message-history", callback);
        return () => socket.off("message-history", callback);
      }
      return () => {};
    },
    [socket]
  );

  const onRoomUpdated = useCallback(
    (callback: (roomInfo: RoomInfo) => void) => {
      if (socket) {
        socket.on("room-updated", callback);
        return () => socket.off("room-updated", callback);
      }
      return () => {};
    },
    [socket]
  );

  const onUsernameTaken = useCallback(
    (callback: (data: { message: string }) => void) => {
      if (socket) {
        socket.on("username-taken", callback);
        return () => socket.off("username-taken", callback);
      }
      return () => {};
    },
    [socket]
  );

  const onUserLeft = useCallback(
    (callback: (data: { username: string }) => void) => {
      if (socket) {
        socket.on("user-left", callback);
        return () => socket.off("user-left", callback);
      }
      return () => {};
    },
    [socket]
  );

  const onRoomConfig = useCallback(
    (
      callback: (config: {
        description: string;
        toleranceLevel: string;
        duration: string;
      }) => void
    ) => {
      if (socket) {
        socket.on("room-config", callback);
        return () => socket.off("room-config", callback);
      }
      return () => {};
    },
    [socket]
  );

  const onWaitingForCreator = useCallback(
    (callback: (data: { message: string }) => void) => {
      if (socket) {
        socket.on("waiting-for-creator", callback);
        return () => socket.off("waiting-for-creator", callback);
      }
      return () => {};
    },
    [socket]
  );

  const onAIQueryResponse = useCallback(
    (callback: (response: Message) => void) => {
      if (socket) {
        socket.on("ai-query-response", callback);
        return () => socket.off("ai-query-response", callback);
      }
      return () => {};
    },
    [socket]
  );

  const onTurnTimeUpdate = useCallback(
    (callback: (data: { timeLeft: number; roomId: string }) => void) => {
      if (socket) {
        socket.on("turn-time-update", callback);
        return () => socket.off("turn-time-update", callback);
      }
      return () => {};
    },
    [socket]
  );

  const onMessageError = useCallback(
    (callback: (data: { message: string }) => void) => {
      if (socket) {
        socket.on("message-error", callback);
        return () => socket.off("message-error", callback);
      }
      return () => {};
    },
    [socket]
  );

  return {
    socket,
    connected,
    joinRoom,
    sendMessage,
    queryAI,
    submitMocion,
    startConversation,
    onReceiveMessage,
    onUserJoined,
    onMessageHistory,
    onRoomUpdated,
    onUsernameTaken,
    onUserLeft,
    onRoomConfig,
    onWaitingForCreator,
    onAIQueryResponse,
    onTurnTimeUpdate,
    onMessageError,
  };
};
