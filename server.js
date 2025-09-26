import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import { aiModerator } from "./src/lib/aiModerator.js";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = process.env.PORT || 3000;

// In-memory message storage
const messageStore = new Map();

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handler(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: {
      origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
      methods: ["GET", "POST"],
      credentials: true,
    },
    allowEIO3: true,
  });

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Join a room
    socket.on("join-room", (roomId) => {
      socket.join(roomId);
      console.log(`User ${socket.id} joined room ${roomId}`);

      // Send message history to the newly joined user
      if (messageStore.has(roomId)) {
        const messages = messageStore.get(roomId);
        socket.emit("message-history", messages);
      }

      socket.to(roomId).emit("user-joined", socket.id);
    });

    // Send message to room
    socket.on("send-message", async (data) => {
      const messageData = {
        id: Date.now().toString(),
        message: data.message,
        username: data.username,
        timestamp: new Date().toISOString(),
        socketId: socket.id,
        isAIModerator: false,
      };

      // Store message
      if (!messageStore.has(data.roomId)) {
        messageStore.set(data.roomId, []);
      }
      const messages = messageStore.get(data.roomId);
      messages.push(messageData);

      // Keep only last 100 messages per room
      if (messages.length > 100) {
        messages.splice(0, messages.length - 100);
      }
      messageStore.set(data.roomId, messages);

      // Broadcast original message to room
      io.to(data.roomId).emit("receive-message", messageData);

      // AI Moderation
      try {
        const moderationResult = await aiModerator.analyzeMessage(data.message, data.username);
        
        if (moderationResult.shouldRespond && moderationResult.response) {
          // Create AI moderator message
          const aiMessage = {
            id: `ai-${Date.now()}`,
            message: moderationResult.response,
            username: "AI Moderator",
            timestamp: new Date().toISOString(),
            socketId: "ai-moderator",
            isAIModerator: true,
            reason: moderationResult.reason,
          };

          // Store AI message
          messages.push(aiMessage);
          messageStore.set(data.roomId, messages);

          // Broadcast AI message to room
          io.to(data.roomId).emit("receive-message", aiMessage);
          
          console.log(`AI Moderator responded to message from ${data.username}: ${moderationResult.reason}`);
        }
      } catch (error) {
        console.error("AI Moderation failed:", error);
        // Continue normally if AI moderation fails
      }
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});
