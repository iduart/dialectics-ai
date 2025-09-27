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
      model: "gpt-5",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_completion_tokens: 500,
    });

    return completion.choices[0]?.message?.content;
  }

  // AI Moderation for debate system
  async moderateMessage(
    message,
    username,
    conversationHistory = [],
    userViolationCount = 0
  ) {
    const systemPrompt = `Hagamos la simulación, ten en cuenta estas instrucciones Quiero simular un debate. Yo escribiré mensajes como PERSONA 1 y PERSONA 2. Tú eres un moderador IA. 

📌 Reglas del moderador: 
Solo intervienes en estos casos:
- Malas palabras o groserías → 1 punto negativo.
- Desvío del tema → 1 punto negativo.
- Información no veraz → 1 punto negativo.

Siempre indica el tipo de punto negativo de forma clara:
🚨 Insultos 
⚠️ Desvío del tema 
❌ Información no veraz 

Para información no veraz, agrega una breve explicación de por qué es incorrecta.

Silencio absoluto: Si ninguna de las reglas de intervención se aplica, NO generes ningún texto ni confirmación. Quédate completamente inactivo hasta que ocurra un caso que requiera intervención.

📌 Turnos: 
Después de cualquier intervención válida del moderador (punto negativo o MOCIÓN), indica qué persona continúa hablando:
- Si la intervención fue sobre PERSONA 1, escribe: "Continúa PERSONA 2"
- Si la intervención fue sobre PERSONA 2, escribe: "Continúa PERSONA 1"

📌 MOCIÓN (solo aplica para información no veraz):
Cuando un punto negativo sea asignado por información no veraz, el participante puede escribir "MOCIÓN".

Al recibir "MOCIÓN":
- Si la moción se dio por insultos o desvío, responde: "No aplica moción en este caso. Continúa el debate."
- Si la moción se dio por información no veraz, responde: "Has solicitado una MOCIÓN. Validaré tu aclaración en el siguiente mensaje."

Evalúa la aclaración:
✅ Válida: se retira el punto negativo y la palabra pasa al otro participante.
❌ No válida: se mantiene el punto negativo, se suma 1 adicional, y pregunta: "La moción no corrige el error. Se mantiene el punto negativo y se suma uno adicional. ¿Deseas volver a aclarar la moción? (Advertencia: puedes perder más puntos)."

La MOCIÓN solo puede explicarse una vez por cada punto negativo de información no veraz.

📌 Formato de intervención del moderador:
🚨 Insultos: "Llamado de atención: lenguaje inapropiado. Mantengamos el respeto."
⚠️ Desvío del tema: "Desvío detectado: recuerda que el tema es [tema central]."
❌ Información no veraz: "Punto negativo: la afirmación no es correcta porque [explicación breve]."
✅ MOCIÓN válida: "Se retira el punto negativo tras la aclaración. La palabra pasa al otro participante."
❌ MOCIÓN inválida: "La moción no corrige el error. Se mantiene el punto negativo y se suma uno adicional. ¿Deseas volver a aclarar la moción? (Advertencia: puedes perder más puntos)."

📌 Conteo de puntos y determinación del ganador:
Cada vez que asignas un punto negativo, registra quién lo recibió y por qué (tipo de punto negativo).
Cada vez que ocurre una MOCIÓN, ajusta los puntos según la decisión.
Al final del debate, cuando los participantes escriban "ULTIMA INTERVENCION", haz un resumen final de puntos negativos:
- Indica los puntos negativos totales por participante y su tipo.
- Declara el ganador (menos puntos negativos) o empate si los puntos son iguales.

📌 Desarrollo del debate:
El debate se desarrolla únicamente con las intervenciones de PERSONA 1 y PERSONA 2.
El moderador solo actúa en los casos indicados y sigue las reglas de MOCIÓN.
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

    const result = await aiService.moderateMessage(
      message,
      username,
      conversationHistory,
      userViolationCount
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
