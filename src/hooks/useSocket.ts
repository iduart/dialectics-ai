"use client";

import { useEffect, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

export interface Message {
  id: string;
  message: string;
  username: string;
  timestamp: string;
  socketId: string;
  isAIModerator?: boolean;
  reason?: string;
}

export interface RoomInfo {
  participants: Array<{ socketId: string; username: string }>;
  currentTurn: number;
  currentSpeaker: string | null;
  debateStarted: boolean;
}

export const useSocket = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
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

    newSocket.on("connect", () => {
      console.log("✅ Connected to server", newSocket.id);
      setConnected(true);
    });

    newSocket.on("disconnect", (reason) => {
      console.log("❌ Disconnected from server", reason);
      setConnected(false);
    });

    newSocket.on("connect_error", (error) => {
      console.error("🚨 Connection error:", error);
      setConnected(false);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  const joinRoom = useCallback(
    (
      roomId: string,
      username: string,
      debateConfig?: {
        description: string;
        toleranceLevel: string;
        duration: string;
      } | null
    ) => {
      if (socket) {
        socket.emit("join-room", { roomId, username, debateConfig });
      }
    },
    [socket]
  );

  const sendMessage = useCallback(
    (roomId: string, message: string, username: string) => {
      if (socket) {
        socket.emit("send-message", { roomId, message, username });
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

  const onRoomFull = useCallback(
    (callback: (data: { message: string }) => void) => {
      if (socket) {
        socket.on("room-full", callback);
        return () => socket.off("room-full", callback);
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

  const onNotYourTurn = useCallback(
    (callback: (data: { message: string; currentSpeaker: string }) => void) => {
      if (socket) {
        socket.on("not-your-turn", callback);
        return () => socket.off("not-your-turn", callback);
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

  const startDebate = useCallback(
    (roomId: string, username: string) => {
      if (socket) {
        socket.emit("start-debate", { roomId, username });
      }
    },
    [socket]
  );

  const requestMotion = useCallback(
    (data: { roomId: string; username: string }) => {
      if (socket) {
        socket.emit("request-motion", data);
      }
    },
    [socket]
  );

  const onDebateStarted = useCallback(
    (callback: (roomInfo: RoomInfo) => void) => {
      if (socket) {
        socket.on("debate-started", callback);
        return () => socket.off("debate-started", callback);
      }
      return () => {};
    },
    [socket]
  );

  const onDebateNotStarted = useCallback(
    (callback: (data: { message: string }) => void) => {
      if (socket) {
        socket.on("debate-not-started", callback);
        return () => socket.off("debate-not-started", callback);
      }
      return () => {};
    },
    [socket]
  );

  const onStartDebateFailed = useCallback(
    (callback: (data: { message: string }) => void) => {
      if (socket) {
        socket.on("start-debate-failed", callback);
        return () => socket.off("start-debate-failed", callback);
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

  const onMotionTimeUpdate = useCallback(
    (callback: (data: { timeLeft: number; roomId: string }) => void) => {
      if (socket) {
        socket.on("motion-time-update", callback);
        return () => socket.off("motion-time-update", callback);
      }
      return () => {};
    },
    [socket]
  );

  const onMotionStateUpdate = useCallback(
    (
      callback: (data: { waitingForMotion: boolean; roomId: string }) => void
    ) => {
      if (socket) {
        socket.on("motion-state-update", callback);
        return () => socket.off("motion-state-update", callback);
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
    onMotionTimeUpdate,
    onMotionStateUpdate,
    requestMotion,
  };
};
