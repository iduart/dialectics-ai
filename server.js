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

// User violation tracking for AI context
const userViolations = new Map(); // roomId -> { username: violationCount }

// Room management for 2-person debates
const roomParticipants = new Map(); // roomId -> { participants: [], currentTurn: 0, debateStarted: false }
const roomConfigs = new Map(); // roomId -> { description, toleranceLevel, duration }
const turnTimers = new Map(); // roomId -> { timer: Timeout, timeLeft: number }

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
      model: "gpt-4o-mini",
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
    userViolationCount = 0,
    debateConfig = null
  ) {
    // Build debate context
    let debateContext = "";
    if (debateConfig && debateConfig.description) {
      debateContext = `\n\n🎯 CONTEXTO DEL DEBATE:\nTema: ${debateConfig.description}\nNivel de tolerancia: ${debateConfig.toleranceLevel}\nDuración: ${debateConfig.duration} minutos\n`;
      console.log("🎯 Using debate context:", debateConfig.description);
    } else {
      console.log("⚠️ No debate context available");
    }

    const systemPrompt = `Quiero simular un debate.
Tú eres un moderador IA. ${debateContext}

Reglas del moderador

Solo intervienes en estos casos:

Malas palabras o groserías → 1 punto negativo.

Desvío del tema → 1 punto negativo.

Información no veraz → 1 punto negativo.

Siempre indica el tipo de punto negativo de forma clara:

🚨 Insultos: "Llamado de atención: lenguaje inapropiado. Mantengamos el respeto. -1 punto"

⚠️ Desvío del tema: "Desvío detectado: recuerda que el tema es [tema central]. -1 punto"

❌ Información no veraz: "Punto negativo: la afirmación no es correcta porque [explicación breve]. -1 punto"

Si ninguna regla aplica, no generes ningún texto. Mantente completamente en silencio.

Niveles de tolerancia a insultos

Nivel 1 (tranquilo): se penalizan adjetivos fuertes y comentarios despectivos.

Nivel 2 (intermedio): se permiten adjetivos críticos y frases fuertes, pero no ofensivas directas a la persona.

Nivel 3 (intenso): se aceptan expresiones más duras y despectivas hacia ideas o posturas, nunca insultos directos a la persona ni groserías.

Si los participantes eligen niveles diferentes, se aplicará el menor de los números dichos.

Turnos

Después de cualquier intervención válida del moderador (punto negativo o moción), indica quién continúa:

Si la intervención fue sobre PERSONA 1 → "Continúa PERSONA 2"

Si la intervención fue sobre PERSONA 2 → "Continúa PERSONA 1"

MOCIÓN (solo aplica para información no veraz)

Cuando un punto negativo sea asignado por información no veraz, el participante puede escribir "MOCIÓN".

Al recibir "MOCIÓN":

Si el punto negativo fue por insultos o desvío → "No aplica moción en este caso. Continúa el debate."

Si el punto negativo fue por información no veraz → "Has solicitado una MOCIÓN. Validaré tu aclaración en el siguiente mensaje."

Evalúa la aclaración:

MOCIÓN válida:
"Se retira el punto negativo tras la aclaración. Sin embargo, se aclara que la afirmación inicial no es correcta: [explicación breve y tajante]. La palabra pasa al otro participante."

MOCIÓN no válida:
"La moción no corrige el error. Se mantiene el punto negativo y se suma uno adicional. ¿Deseas volver a aclarar la moción? (Advertencia: puedes perder más puntos)."

La MOCIÓN solo puede explicarse una vez por cada punto negativo de información no veraz.

Conteo de puntos y determinación del ganador

Cada vez que asignas un punto negativo, registra quién lo recibió y por qué (tipo de punto negativo).

Cada vez que ocurre una moción, ajusta los puntos según la decisión.

Al final del debate, cuando los participantes escriban "ULTIMA INTERVENCION", haz un resumen final:

Indica los puntos negativos totales por participante, especificando los motivos.

Declara el ganador (menos puntos negativos) o empate si son iguales.

Desarrollo del debate

El debate se desarrolla únicamente con las intervenciones de PERSONA 1 y PERSONA 2.

El moderador solo actúa en los casos indicados y sigue las reglas de moción.

Si no hay acción que tomar, no generes ningún mensaje.`;

    // Build conversation context
    let conversationContext = "";
    if (conversationHistory.length > 0) {
      conversationContext = `\n\nRecent conversation context:\n${conversationHistory
        .slice(-10) // Last 10 messages for context
        .map((msg) => `${msg.username}: ${msg.message}`)
        .join("\n")}\n`;
    }

    // Build user context
    let userContext = "";
    if (userViolationCount > 0) {
      userContext = `\n\nUser Context: ${username} has ${userViolationCount} previous violation(s) in this room.`;
    }

    const userPrompt = `Analiza este mensaje de "${username}": "${message}"${conversationContext}${userContext}

Responde con JSON en este formato exacto:
{
  "shouldRespond": true/false,
  "response": "tu mensaje de moderación si shouldRespond es true",
  "reason": "breve razón de la decisión"
}

Solo responde si el mensaje viola claramente las reglas del debate (insultos, desvío del tema, información no veraz, MOCIÓN, o ULTIMA INTERVENCION). Si no hay violación, shouldRespond debe ser false.`;

    try {
      const response = await this.callAI(systemPrompt, userPrompt);
      const parsed = JSON.parse(response);
      return {
        shouldRespond: parsed.shouldRespond || false,
        response: parsed.response,
        reason: parsed.reason,
      };
    } catch (error) {
      console.error("AI Moderation error:", error);
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

    // Get user violation count for this room
    const roomViolations = userViolations.get(roomId) || {};
    const userViolationCount = roomViolations[username] || 0;

    // Get debate config for context
    const debateConfig = roomConfigs.get(roomId);

    const result = await aiService.moderateMessage(
      message,
      username,
      conversationHistory,
      userViolationCount,
      debateConfig
    );

    // If AI responded, increment violation count
    if (result.shouldRespond) {
      roomViolations[username] = (roomViolations[username] || 0) + 1;
      userViolations.set(roomId, roomViolations);
      console.log(
        `📊 User ${username} violation count: ${roomViolations[username]}`
      );
    }

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

  // Turn timer management functions (defined here where io is available)
  function startTurnTimer(roomId) {
    console.log(`⏰ Starting turn timer for room ${roomId}`);

    // Clear existing timer if any
    clearTurnTimer(roomId);

    // Start new timer (60 seconds)
    const timer = setTimeout(() => {
      console.log(`⏰ Turn timer expired for room ${roomId}`);
      switchToNextTurn(roomId);
    }, 60000); // 1 minute = 60,000ms

    // Start countdown updates every second
    const countdownInterval = setInterval(() => {
      const timerInfo = turnTimers.get(roomId);
      if (timerInfo) {
        timerInfo.timeLeft--;

        // Emit countdown update to room
        io.to(roomId).emit("turn-time-update", {
          timeLeft: timerInfo.timeLeft,
          roomId: roomId,
        });

        console.log(
          `⏰ Room ${roomId} turn time remaining: ${timerInfo.timeLeft}s`
        );

        if (timerInfo.timeLeft <= 0) {
          clearInterval(countdownInterval);
        }
      } else {
        clearInterval(countdownInterval);
      }
    }, 1000);

    // Store timer info (including the countdown interval)
    turnTimers.set(roomId, {
      timer: timer,
      countdownInterval: countdownInterval,
      timeLeft: 60,
      startTime: Date.now(),
    });
  }

  function clearTurnTimer(roomId) {
    const timerInfo = turnTimers.get(roomId);
    if (timerInfo) {
      clearTimeout(timerInfo.timer);
      if (timerInfo.countdownInterval) {
        clearInterval(timerInfo.countdownInterval);
      }
      turnTimers.delete(roomId);
      console.log(`⏰ Cleared turn timer for room ${roomId}`);
    }
  }

  function switchToNextTurn(roomId) {
    console.log(`🔄 Switching to next turn in room ${roomId}`);

    const roomData = roomParticipants.get(roomId);
    if (!roomData || !roomData.debateStarted) {
      console.log(
        `⚠️ Cannot switch turn - room ${roomId} not found or debate not started`
      );
      return;
    }

    // Switch to next participant
    roomData.currentTurn =
      (roomData.currentTurn + 1) % roomData.participants.length;
    roomData.currentSpeaker =
      roomData.participants[roomData.currentTurn].username;

    console.log(
      `🔄 Turn switched to: ${roomData.currentSpeaker} in room ${roomId}`
    );

    // Emit turn update to room
    io.to(roomId).emit("room-updated", {
      participants: roomData.participants,
      currentTurn: roomData.currentTurn,
      currentSpeaker: roomData.currentSpeaker,
      debateStarted: roomData.debateStarted,
    });

    // Start timer for new turn
    startTurnTimer(roomId);

    // Emit turn timeout message
    io.to(roomId).emit("message", {
      id: Date.now(),
      username: "Moderador",
      content: `⏰ Tiempo agotado. Continúa ${roomData.currentSpeaker}`,
      timestamp: new Date().toISOString(),
      isOwn: false,
    });
  }

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

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
        currentTurn: 0,
        debateStarted: false,
      };

      console.log("Current room data:", JSON.stringify(roomData, null, 2));
      console.log("Total rooms in memory:", roomParticipants.size);
      console.log("All room IDs:", Array.from(roomParticipants.keys()));
      console.log(
        "All room configs:",
        JSON.stringify(Object.fromEntries(roomConfigs), null, 2)
      );

      // Check if room is full (2 participants max)
      if (roomData.participants.length >= 2) {
        console.log("Room is full, rejecting join");
        socket.emit("room-full", {
          message: "Room is full. Only 2 participants allowed.",
        });
        return;
      }

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
      console.log(`User ${username} (${socket.id}) joined room ${roomId}`);
      console.log("Updated room data:", JSON.stringify(roomData, null, 2));
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
        currentTurn: roomData.currentTurn,
        currentSpeaker:
          roomData.participants[roomData.currentTurn]?.username || null,
        debateStarted: roomData.debateStarted,
      };

      console.log(
        "Sending room info to all participants:",
        JSON.stringify(roomInfo, null, 2)
      );

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

      io.to(roomId).emit("room-updated", roomInfo);
      socket
        .to(roomId)
        .emit("user-joined", { socketId: socket.id, username: username });

      console.log("=== END JOIN ROOM EVENT ===\n");
    });

    // Send message to room
    socket.on("send-message", async (data) => {
      const roomData = roomParticipants.get(data.roomId);

      // Check if debate has started and if it's the user's turn
      if (roomData && roomData.participants.length === 2) {
        if (!roomData.debateStarted) {
          socket.emit("debate-not-started", {
            message: "The debate hasn't started yet.",
          });
          return;
        }

        const currentSpeaker = roomData.participants[roomData.currentTurn];
        if (currentSpeaker.socketId !== socket.id) {
          socket.emit("not-your-turn", {
            message: "It's not your turn to speak.",
            currentSpeaker: currentSpeaker.username,
          });
          return;
        }
      }

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

      // Switch turns (only if there are 2 participants and debate has started)
      if (
        roomData &&
        roomData.participants.length === 2 &&
        roomData.debateStarted
      ) {
        // Clear current turn timer
        clearTurnTimer(data.roomId);

        // Switch to next participant
        roomData.currentTurn = (roomData.currentTurn + 1) % 2;
        roomData.currentSpeaker =
          roomData.participants[roomData.currentTurn].username;
        roomParticipants.set(data.roomId, roomData);

        // Start timer for new turn
        startTurnTimer(data.roomId);

        // Notify all participants about turn change
        const roomInfo = {
          participants: roomData.participants,
          currentTurn: roomData.currentTurn,
          currentSpeaker: roomData.currentSpeaker,
          debateStarted: roomData.debateStarted,
        };
        io.to(data.roomId).emit("room-updated", roomInfo);
      }

      // Broadcast original message to room
      io.to(data.roomId).emit("receive-message", messageData);

      // AI Moderation
      try {
        const moderationResult = await analyzeMessage(
          data.message,
          data.username,
          data.roomId
        );

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

          console.log(
            `AI Moderator responded to message from ${data.username}: ${moderationResult.reason}`
          );
        }
      } catch (error) {
        console.error("AI Moderation failed:", error);
        // Continue normally if AI moderation fails
      }
    });

    // Start debate
    socket.on("start-debate", (data) => {
      console.log("\n=== START DEBATE EVENT ===");
      console.log("Room ID:", data.roomId);
      console.log("Username:", data.username);

      const roomData = roomParticipants.get(data.roomId);
      console.log("Room data:", JSON.stringify(roomData, null, 2));
      console.log(
        "All rooms:",
        JSON.stringify(Object.fromEntries(roomParticipants), null, 2)
      );

      // Only allow starting if there are exactly 2 participants and debate hasn't started
      if (
        roomData &&
        roomData.participants.length === 2 &&
        !roomData.debateStarted
      ) {
        console.log("Starting debate - conditions met");
        roomData.debateStarted = true;
        roomData.currentTurn = 0; // Start with first participant
        roomData.currentSpeaker =
          roomData.participants[roomData.currentTurn].username;
        roomParticipants.set(data.roomId, roomData);

        // Start turn timer for first participant
        startTurnTimer(data.roomId);

        // Notify all participants that debate has started
        const roomInfo = {
          participants: roomData.participants,
          currentTurn: roomData.currentTurn,
          currentSpeaker: roomData.currentSpeaker,
          debateStarted: roomData.debateStarted,
        };

        console.log(
          "Sending debate started event with room info:",
          JSON.stringify(roomInfo, null, 2)
        );
        io.to(data.roomId).emit("debate-started", roomInfo);
        io.to(data.roomId).emit("room-updated", roomInfo);

        console.log(
          `Debate started in room ${data.roomId} by ${data.username}`
        );
        console.log("=== END START DEBATE EVENT ===\n");
      } else {
        console.log("Cannot start debate - conditions not met");
        console.log("Room exists:", !!roomData);
        console.log("Participants count:", roomData?.participants?.length || 0);
        console.log("Debate started:", roomData?.debateStarted);
        socket.emit("start-debate-failed", {
          message:
            "Cannot start debate. Need exactly 2 participants and debate must not have started yet.",
        });
      }
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      console.log("\n=== DISCONNECT EVENT ===");
      console.log("User disconnected:", socket.id);
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

          // Adjust turn if needed
          if (roomData.currentTurn >= roomData.participants.length) {
            roomData.currentTurn = 0;
          }

          roomParticipants.set(roomId, roomData);

          // Notify remaining participants
          if (roomData.participants.length > 0) {
            console.log(
              `Room ${roomId} still has ${roomData.participants.length} participants`
            );
            const roomInfo = {
              participants: roomData.participants,
              currentTurn: roomData.currentTurn,
              currentSpeaker:
                roomData.participants[roomData.currentTurn]?.username || null,
              debateStarted: roomData.debateStarted,
            };
            io.to(roomId).emit("room-updated", roomInfo);
            io.to(roomId).emit("user-left", { username: participant.username });
          } else {
            console.log(`Room ${roomId} is now empty, cleaning up`);
            // Clean up empty room
            roomParticipants.delete(roomId);
            roomConfigs.delete(roomId);
            clearTurnTimer(roomId);
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
