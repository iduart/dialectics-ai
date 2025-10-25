import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import OpenAI from "openai";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = process.env.PORT || 3000;

// In-memory message storage
const messageStore = new Map();

// Room management for 2-person debates
const roomParticipants = new Map(); // roomId -> { participants: [] }
const roomConfigs = new Map(); // roomId -> { description, toleranceLevel, duration }

// Initialize OpenAI client (primary AI)
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null;

// AI Service - Simplified for debate moderation
class AIService {
  constructor() {
    this.openai = openai;
  }

  // Check if AI service is available
  isAvailable() {
    return this.openai !== null;
  }

  // AI call method for moderation
  async callAI(systemPrompt, userPrompt) {
    if (!this.isAvailable()) {
      throw new Error("OpenAI API not available");
    }

    const completion = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    return completion.choices[0]?.message?.content;
  }

  // AI Moderation for debate system
  async moderateMessage(
    message,
    username,
    conversationHistory = [],
    debateConfig = null
  ) {
    // Use custom system prompt if provided, otherwise use default
    const systemPrompt = debateConfig && debateConfig.customSystemPrompt;
    console.log("🤖 System prompt:", systemPrompt);

    // Build conversation context
    let conversationContext = "";
    if (conversationHistory.length > 0) {
      conversationContext = `\n\nRecent conversation context:\n${conversationHistory
        .slice(-10) // Last 10 messages for context
        .map((msg) => `${msg.username}: ${msg.message}`)
        .join("\n")}\n`;
    }

    const userPrompt = `Debes analizar el siguiente mensaje según las reglas y comportamiento definidos a continuación.

REGLAS Y COMPORTAMIENTO:
${systemPrompt || "No hay reglas personalizadas definidas"}

MENSAJE A ANALIZAR:
Usuario: "${username}"
Mensaje: "${message}"${conversationContext}

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

    let response;
    try {
      response = await this.callAI(systemPrompt, userPrompt);
      console.log("🤖 Raw AI response:", response);

      if (!response || response.trim() === "") {
        console.log("⚠️ Empty AI response received");
        return { shouldRespond: false };
      }

      // Clean response - remove markdown code blocks if present
      let cleanResponse = response.trim();
      if (cleanResponse.startsWith("```json")) {
        cleanResponse = cleanResponse
          .replace(/^```json\s*/, "")
          .replace(/\s*```$/, "");
      } else if (cleanResponse.startsWith("```")) {
        cleanResponse = cleanResponse
          .replace(/^```\s*/, "")
          .replace(/\s*```$/, "");
      }

      const parsed = JSON.parse(cleanResponse);
      return {
        shouldRespond: parsed.shouldRespond || false,
        response: parsed.response,
        reason: parsed.reason,
      };
    } catch (error) {
      console.error("AI Moderation error:", error);
      console.error("Failed to parse response:", response);
      return { shouldRespond: false };
    }
  }
}

// Initialize AI Service
const aiService = new AIService();

// Turn timer management functions (will be defined inside app.prepare() where io is available)

// Simple moderation function using the AI service
async function analyzeMessage(message, username, roomId) {
  if (!aiService.isAvailable()) {
    console.log("AI Moderation disabled: No OpenAI API key provided");
    return { shouldRespond: false };
  }

  try {
    console.log("🤖 AI analyzing message with context...");

    // Get conversation history for context
    const conversationHistory = messageStore.get(roomId) || [];

    // Get debate config for context
    const debateConfig = roomConfigs.get(roomId);

    const result = await aiService.moderateMessage(
      message,
      username,
      conversationHistory,
      debateConfig
    );

    console.log(`✅ AI analysis complete`);
    return result;
  } catch (error) {
    console.error("AI Moderation error:", error);
    return { shouldRespond: false };
  }
}

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
    console.log("\n=== NEW SOCKET CONNECTION ===");
    console.log("🔌 New user connected:", {
      socketId: socket.id,
      timestamp: new Date().toISOString(),
    });

    // Join a room
    socket.on("join-room", (data) => {
      const { roomId, username, debateConfig } = data;

      console.log("\n=== JOIN ROOM EVENT ===");
      console.log("Room ID:", roomId);
      console.log("Username:", username);
      console.log("Debate Config:", JSON.stringify(debateConfig, null, 2));
      console.log("Socket ID:", socket.id);

      // Check if room exists and has participants
      let roomData = roomParticipants.get(roomId) || {
        participants: [],
      };

      console.log("Current room data:", JSON.stringify(roomData, null, 2));
      console.log("Total rooms in memory:", roomParticipants.size);
      console.log("All room IDs:", Array.from(roomParticipants.keys()));
      console.log(
        "All room configs:",
        JSON.stringify(Object.fromEntries(roomConfigs), null, 2)
      );

      // Check if this socket is already in the room
      if (roomData.participants.some((p) => p.socketId === socket.id)) {
        console.log("Socket already in room, ignoring duplicate join");
        return;
      }

      // Check if username already exists in room
      if (roomData.participants.some((p) => p.username === username)) {
        console.log("Username already taken, rejecting join");
        socket.emit("username-taken", {
          message: "Username already taken in this room.",
        });
        return;
      }

      // Add participant to room
      const participant = { socketId: socket.id, username: username };
      roomData.participants.push(participant);
      roomParticipants.set(roomId, roomData);

      // Store room config if this is the first participant
      if (roomData.participants.length === 1 && debateConfig) {
        console.log(
          "Storing room config for new room:",
          JSON.stringify(debateConfig, null, 2)
        );
        roomConfigs.set(roomId, debateConfig);
      }

      socket.join(roomId);
      console.log(`✅ User ${username} (${socket.id}) joined room ${roomId}`);
      console.log("🏠 Updated room data:", JSON.stringify(roomData, null, 2));
      console.log("🔌 Socket joined room:", {
        socketId: socket.id,
        roomId: roomId,
        username: username,
      });

      // Verify socket is actually in the room
      io.in(roomId)
        .fetchSockets()
        .then((roomSockets) => {
          console.log("🔍 Verification - Sockets in room after join:", {
            roomId: roomId,
            socketCount: roomSockets.length,
            socketIds: roomSockets.map((s) => s.id),
            newSocketInRoom: roomSockets.some((s) => s.id === socket.id),
          });
        });
      console.log(
        "Updated room configs:",
        JSON.stringify(Object.fromEntries(roomConfigs), null, 2)
      );

      // Send message history to the newly joined user
      if (messageStore.has(roomId)) {
        const messages = messageStore.get(roomId);
        console.log("Sending message history:", messages.length, "messages");
        socket.emit("message-history", messages);
      } else {
        console.log("No message history for room");
      }

      // Send room info to all participants
      const roomInfo = {
        participants: roomData.participants,
      };

      console.log("📤 Sending room info to all participants:", {
        roomId: roomId,
        participants: roomData.participants,
        participantCount: roomData.participants.length,
      });

      // Log which sockets are in this room
      io.in(roomId)
        .fetchSockets()
        .then((roomSockets) => {
          console.log("🔌 Sockets currently in room:", {
            roomId: roomId,
            socketCount: roomSockets.length,
            socketIds: roomSockets.map((s) => s.id),
          });
        });

      // Send debate config to the newly joined user if room already has config
      const existingConfig = roomConfigs.get(roomId);
      console.log(
        `Room ${roomId} existing config:`,
        JSON.stringify(existingConfig, null, 2)
      );
      if (existingConfig) {
        console.log(`Sending config to user ${username} (${socket.id})`);
        socket.emit("room-config", existingConfig);
      } else {
        console.log(
          `No config found for room ${roomId}, waiting for creator...`
        );
        // Send a signal that we're waiting for the room creator
        socket.emit("waiting-for-creator", {
          message: "Waiting for room creator to join...",
        });
      }

      console.log(
        "📢 Broadcasting room-updated to all participants in room:",
        roomId
      );
      io.to(roomId).emit("room-updated", roomInfo);

      console.log("👋 Notifying other participants about new user:", {
        newUser: username,
        socketId: socket.id,
        roomId: roomId,
      });
      socket
        .to(roomId)
        .emit("user-joined", { socketId: socket.id, username: username });

      console.log("=== END JOIN ROOM EVENT ===\n");
    });

    // Send message to room
    socket.on("send-message", async (data) => {
      console.log("\n=== MESSAGE RECEIVED ===");
      console.log("🔵 Server received send-message event:", {
        roomId: data.roomId,
        message: data.message,
        username: data.username,
        socketId: socket.id,
        timestamp: new Date().toISOString(),
      });

      const roomData = roomParticipants.get(data.roomId);
      console.log("🏠 Room data for message processing:", {
        roomExists: !!roomData,
        participants: roomData?.participants?.length || 0,
        participantUsernames:
          roomData?.participants?.map((p) => p.username) || [],
        allParticipants: roomData?.participants || [],
      });

      const messageData = {
        id: Date.now().toString(),
        message: data.message,
        username: data.username,
        timestamp: new Date().toISOString(),
        socketId: socket.id,
        isAIModerator: false,
      };

      console.log("📝 Created message data:", {
        id: messageData.id,
        message: messageData.message,
        username: messageData.username,
        socketId: messageData.socketId,
        timestamp: messageData.timestamp,
      });

      // Store message
      if (!messageStore.has(data.roomId)) {
        messageStore.set(data.roomId, []);
        console.log("🆕 Created new message store for room:", data.roomId);
      }
      const messages = messageStore.get(data.roomId);
      messages.push(messageData);

      // Keep only last 100 messages per room
      if (messages.length > 100) {
        messages.splice(0, messages.length - 100);
      }
      messageStore.set(data.roomId, messages);

      console.log(
        "💾 Stored message. Total messages in room:",
        messages.length
      );

      // Check which sockets will receive this message BEFORE broadcasting
      console.log("🔍 Checking which sockets will receive this message...");
      io.in(data.roomId)
        .fetchSockets()
        .then((roomSockets) => {
          console.log("🎯 Sockets that will receive this message:", {
            roomId: data.roomId,
            socketCount: roomSockets.length,
            socketIds: roomSockets.map((s) => s.id),
            senderSocketId: socket.id,
            socketDetails: roomSockets.map((s) => ({
              id: s.id,
              connected: s.connected,
              rooms: Array.from(s.rooms),
            })),
          });
        });

      // Broadcast original message to room
      console.log("📡 Broadcasting message to room:", {
        roomId: data.roomId,
        messageId: messageData.id,
        message: messageData.message,
        username: messageData.username,
        senderSocketId: socket.id,
      });

      io.to(data.roomId).emit("receive-message", messageData);
      console.log("✅ Message broadcasted successfully to room:", data.roomId);
      console.log("=== END MESSAGE BROADCAST ===\n");

      // Check for AI intervention
      if (roomData) {
        // Analyze message with AI
        const aiResult = await analyzeMessage(
          data.message,
          data.username,
          data.roomId
        );

        if (aiResult.shouldRespond && aiResult.response) {
          // Send AI intervention message
          const aiMessage = {
            id: `ai-${Date.now()}`,
            message: aiResult.response,
            username: "Moderador",
            timestamp: new Date().toISOString(),
            socketId: "ai-moderator",
            isAIModerator: true,
            reason: aiResult.reason,
          };

          // Store AI message
          messages.push(aiMessage);
          messageStore.set(data.roomId, messages);

          // Broadcast AI message to room
          io.to(data.roomId).emit("receive-message", aiMessage);

          console.log(
            `AI Moderator responded to message from ${data.username}: ${aiResult.reason}`
          );
        }
      }
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      console.log("\n=== DISCONNECT EVENT ===");
      console.log("🔌 User disconnected:", {
        socketId: socket.id,
        timestamp: new Date().toISOString(),
      });

      // Check which rooms this socket was in
      const socketRooms = Array.from(socket.rooms);
      console.log("🏠 Socket was in rooms:", socketRooms);

      console.log(
        "Current rooms before disconnect:",
        JSON.stringify(Object.fromEntries(roomParticipants), null, 2)
      );
      console.log(
        "Current configs before disconnect:",
        JSON.stringify(Object.fromEntries(roomConfigs), null, 2)
      );

      // Remove participant from all rooms
      for (const [roomId, roomData] of roomParticipants.entries()) {
        const participantIndex = roomData.participants.findIndex(
          (p) => p.socketId === socket.id
        );
        if (participantIndex !== -1) {
          const participant = roomData.participants[participantIndex];
          console.log(
            `Removing participant ${participant.username} from room ${roomId}`
          );

          roomData.participants.splice(participantIndex, 1);

          roomParticipants.set(roomId, roomData);

          // Notify remaining participants
          if (roomData.participants.length > 0) {
            console.log(
              `Room ${roomId} still has ${roomData.participants.length} participants`
            );
            const roomInfo = {
              participants: roomData.participants,
            };
            io.to(roomId).emit("room-updated", roomInfo);
            io.to(roomId).emit("user-left", { username: participant.username });
          } else {
            console.log(`Room ${roomId} is now empty, cleaning up`);
            // Clean up empty room
            roomParticipants.delete(roomId);
            roomConfigs.delete(roomId);
          }

          console.log(
            "Updated rooms after disconnect:",
            JSON.stringify(Object.fromEntries(roomParticipants), null, 2)
          );
          console.log(
            "Updated configs after disconnect:",
            JSON.stringify(Object.fromEntries(roomConfigs), null, 2)
          );
          break;
        }
      }
      console.log("=== END DISCONNECT EVENT ===\n");
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
