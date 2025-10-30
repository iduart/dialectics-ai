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
    console.log("🔧 AIService.callAI called with:", {
      systemPromptLength: systemPrompt?.length || 0,
      userPromptLength: userPrompt?.length || 0,
      systemPromptPreview: systemPrompt?.substring(0, 100) + "...",
      userPromptPreview: userPrompt?.substring(0, 100) + "...",
    });

    if (!this.isAvailable()) {
      console.log("❌ AIService: OpenAI API not available");
      throw new Error("OpenAI API not available");
    }

    console.log("🔧 AIService: About to call OpenAI API...");
    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 500,
      });

      console.log("🔧 AIService: OpenAI API call completed");
      console.log("🔧 AIService: Response received:", {
        choicesLength: completion.choices?.length || 0,
        firstChoiceContent:
          completion.choices?.[0]?.message?.content?.substring(0, 100) + "...",
      });

      const result = completion.choices[0]?.message?.content;
      console.log(
        "🔧 AIService: Returning result:",
        result?.substring(0, 100) + "..."
      );
      return result;
    } catch (error) {
      console.error("🔧 AIService: OpenAI API error:", error);
      throw error;
    }
  }

  // AI Moderation with custom prompt
  async moderateMessageWithPrompt(
    message,
    username,
    conversationHistory = [],
    customPrompt
  ) {
    console.log("🤖 Using custom prompt:", customPrompt);

    // Build conversation context
    let conversationContext = "";
    if (conversationHistory.length > 0) {
      conversationContext = `\n\nRecent conversation context:\n${conversationHistory
        .slice(-10) // Last 10 messages for context
        .map((msg) => `${msg.username}: ${msg.message}`)
        .join("\n")}\n`;
    }

    const userPrompt = `${username}: ${message}${conversationContext}`;

    let response;
    try {
      response = await this.callAI(customPrompt || "", userPrompt);
      console.log(
        "🤖 Raw AI response for custom prompt (free-form)1:",
        response
      );

      if (!response || response.trim() === "") {
        console.log("⚠️ Empty AI response received for custom prompt");
        return { shouldRespond: false };
      }

      return {
        shouldRespond: true,
        response: response.trim(),
      };
    } catch (error) {
      console.error("AI Moderation error for custom prompt:", error);
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
    return { shouldRespond: false, results: [] };
  }

  try {
    console.log("🤖 AI analyzing message with multiple prompts...");

    // Get conversation history for context
    const conversationHistory = messageStore.get(roomId) || [];

    // Get debate config for context
    const debateConfig = roomConfigs.get(roomId);

    // If no custom prompts, no analysis needed
    if (!debateConfig?.prompts || debateConfig.prompts.length === 0) {
      console.log(`✅ No prompts configured, skipping AI analysis`);
      return { shouldRespond: false, results: [] };
    }

    // Analyze with multiple prompts
    const results = [];
    for (let i = 0; i < debateConfig.prompts.length; i++) {
      const prompt = debateConfig.prompts[i];
      console.log(`🤖 Analyzing with prompt ${i + 1}:`, prompt);

      const result = await aiService.moderateMessageWithPrompt(
        message,
        username,
        conversationHistory,
        prompt
      );

      results.push({
        promptIndex: i,
        prompt: prompt,
        ...result,
      });
    }

    // Determine if we should respond based on any of the prompts
    const shouldRespond = results.some((result) => result.shouldRespond);

    console.log(`✅ AI analysis complete (${results.length} prompts)`);
    return { shouldRespond, results };
  } catch (error) {
    console.error("AI Moderation error:", error);
    return { shouldRespond: false, results: [] };
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

        if (
          aiResult.shouldRespond &&
          aiResult.results &&
          aiResult.results.length > 0
        ) {
          // Send responses for each prompt that should respond
          for (const result of aiResult.results) {
            if (result.shouldRespond && result.response) {
              const aiMessage = {
                id: `ai-${Date.now()}-${result.promptIndex}`,
                message: `[Prompt ${result.promptIndex + 1}] ${
                  result.response
                }`,
                username: "Moderador",
                timestamp: new Date().toISOString(),
                socketId: "ai-moderator",
                isAIModerator: true,
                reason: result.reason,
                promptIndex: result.promptIndex,
              };

              // Store AI message
              messages.push(aiMessage);
              messageStore.set(data.roomId, messages);

              // Broadcast AI message to room
              io.to(data.roomId).emit("receive-message", aiMessage);
              console.log(
                `🤖 AI intervention sent for prompt ${result.promptIndex + 1}:`,
                result.response
              );

              // Send reasoning to side chat for all participants
              const reasoningMessage = {
                id: `ai-reasoning-${Date.now()}-${result.promptIndex}`,
                message: `AI Intervention Reasoning (Prompt ${
                  result.promptIndex + 1
                }): ${result.reason || "No specific reason provided"}`,
                username: "AI Assistant",
                timestamp: new Date().toISOString(),
                socketId: "ai-assistant",
                isAIModerator: true,
              };

              io.to(data.roomId).emit("ai-query-response", reasoningMessage);
            }
          }
        }
      }
    });

    // Handle AI queries
    socket.on("query-ai", async (data) => {
      console.log("\n=== AI QUERY RECEIVED ===");
      console.log("🤖 AI Query:", {
        query: data.query,
        username: data.username,
        roomId: data.roomId,
        socketId: socket.id,
        timestamp: new Date().toISOString(),
      });

      // Check if AI service is available
      if (!aiService.isAvailable()) {
        console.log("❌ AI Service not available - no OpenAI API key");
        socket.emit("ai-query-response", {
          id: `ai-query-error-${Date.now()}`,
          message:
            "El servicio de IA no está disponible. Por favor, verifica que la clave API de OpenAI esté configurada.",
          username: "AI Assistant",
          timestamp: new Date().toISOString(),
          socketId: "ai-assistant",
          isAIModerator: true,
        });
        return;
      }

      try {
        // Get conversation history for context
        const conversationHistory = messageStore.get(data.roomId) || [];
        const debateConfig = roomConfigs.get(data.roomId);

        console.log("🔍 AI Query Context:", {
          roomId: data.roomId,
          conversationHistoryLength: conversationHistory.length,
          debateConfigExists: !!debateConfig,
          promptsCount: debateConfig?.prompts?.length || 0,
        });

        // Build a user prompt with recent conversation history as context
        const historySnippet = (conversationHistory || [])
          .slice(-10)
          .map((msg) => `${msg.username}: ${msg.message}`)
          .join("\n");

        const userPrompt = `Contexto reciente de la conversación (últimos 10 mensajes):\n${historySnippet}\n\nPregunta del usuario: ${data.query}`;

        console.log(
          "🤖 Calling AI service with user prompt (with history):",
          userPrompt.substring(0, 200) + "..."
        );
        console.log(
          "📞 About to call aiService.callAI() with empty system prompt..."
        );

        const aiResponse = await aiService.callAI("", userPrompt);

        console.log("📞 aiService.callAI() completed");
        console.log("🤖 AI Response received:", {
          responseLength: aiResponse?.length || 0,
          responsePreview: aiResponse?.substring(0, 100) + "...",
          fullResponse: aiResponse,
        });

        // Send AI response back to the user
        console.log("📝 Creating response message...");
        const responseMessage = {
          id: `ai-query-${Date.now()}`,
          message:
            aiResponse ||
            "Lo siento, no pude procesar tu pregunta en este momento. Por favor, inténtalo de nuevo.",
          username: "AI Assistant",
          timestamp: new Date().toISOString(),
          socketId: "ai-assistant",
          isAIModerator: true,
        };

        console.log("📝 Response message created:", {
          id: responseMessage.id,
          messageLength: responseMessage.message.length,
          messagePreview: responseMessage.message.substring(0, 100) + "...",
          username: responseMessage.username,
          socketId: responseMessage.socketId,
          isAIModerator: responseMessage.isAIModerator,
        });

        console.log("📤 About to emit ai-query-response to socket:", socket.id);
        socket.emit("ai-query-response", responseMessage);
        console.log("📤 ai-query-response event emitted successfully");
        console.log(
          "✅ AI Query response sent:",
          aiResponse?.substring(0, 100) + "..."
        );
        console.log("=== END AI QUERY ===\n");
      } catch (error) {
        console.error("❌ AI Query error:", error);
        console.error("❌ Error details:", {
          message: error.message,
          stack: error.stack,
          name: error.name,
        });

        const errorMessage = {
          id: `ai-query-error-${Date.now()}`,
          message:
            "Lo siento, encontré un error al procesar tu pregunta. Por favor, inténtalo de nuevo.",
          username: "AI Assistant",
          timestamp: new Date().toISOString(),
          socketId: "ai-assistant",
          isAIModerator: true,
        };

        console.log("📝 Error message created:", errorMessage);
        console.log("📤 About to emit error response to socket:", socket.id);
        socket.emit("ai-query-response", errorMessage);
        console.log("📤 Error response emitted successfully");
        console.log("=== END AI QUERY (ERROR) ===\n");
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
