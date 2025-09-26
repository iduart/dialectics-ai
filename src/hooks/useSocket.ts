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
    (roomId: string) => {
      if (socket) {
        socket.emit("join-room", roomId);
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

  return {
    socket,
    connected,
    joinRoom,
    sendMessage,
    onReceiveMessage,
    onUserJoined,
    onMessageHistory,
  };
};
