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
        url: newSocket.io.uri,
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

  return {
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
  };
};
