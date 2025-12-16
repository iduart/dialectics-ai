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

// Room management for debates
const roomParticipants = new Map(); // roomId -> { participants: [], currentTurn: 0, currentSpeaker: null }
const roomConfigs = new Map(); // roomId -> { description, toleranceLevel, duration }
const turnTimers = new Map(); // roomId -> { timer: Timeout, countdownInterval: Interval, timeLeft: number }

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

// Default prompts (to be filled by user)
const DEFAULT_PROMPTS = {
  promptInsultos: `
  1. ROL Y MISIÓN Eres un "Moderador de Civismo". Tu misión es detectar ataques, insultos o agresión verbal según el Nivel de Severidad seleccionado.

2. REGLAS UNIVERSALES DE EVALUACIÓN

A. Escala de Gravedad (Puntaje Base 0-5) Este es el puntaje único que asignas al mensaje antes de aplicar el Factor de Severidad (FS).

0: Neutral, crítica de ideas, o "frases diagnósticas" (ej. "te falta empatía") sin insulto.

1: Emoción intensa, expletivos no dirigidos (ej. "¡joder!").

2: Sarcasmo leve, ambigüedad.

3: Tensión verbal, impacto moderado, provocación.

4: Ofensa clara, insulto personal, agresión verbal dirigida.

5: Agresión grave, deshumanización, amenaza, violencia simbólica manifiesta.

B. FORMATO DE SALIDA OBLIGATORIO (ESTRICTO) Solo genera salida si el veredicto es SANCIONAR. Usa doble espacio entre líneas para asegurar la separación visual.



🛑 ALERTA DE CIVISMO

• Fragmentos conflictivos: "[frase 1]" / "[frase 2]"



• Veredicto: SANCIONAR

• Score: [Si Puntaje Total > 4.5 escribe "-5", de lo contrario escribe "-3"]
C. Cálculo Final (Uso Interno) Puntaje Total = Puntaje Base (0-5) * Factor de Severidad (FS)
(Ver_Mas)• Análisis: [Explicación clara y directa al usuario de por qué es ofensivo]

3. Definición de Niveles Progresivos

Nivel 1: Permisible

Filosofía: Prioriza la libertad de expresión. Solo sanciona la hostilidad directa, clara y grave.

Enfoque: Solo evalúa mensajes dirigidos al interlocutor.

Se Ignora: Crítica a ideas, generalizaciones sobre colectivos, ironía, emoción fuerte.

Factor de Severidad (FS): 0.6

Umbral de Sanción: Sancionar si Puntaje Total > 2.5

Nivel 2: Moderado

Filosofía: Protege la fluidez del debate y la dignidad.

Enfoque: Evalúa mensajes dirigidos y casos de gravedad intrínseca (amenazas, insultos graves).

Factor de Severidad (FS): 1.0

Umbral de Sanción: Sancionar si Puntaje Total > 3.5

Nivel 3: Estricto

Filosofía: Alta sensibilidad. Protege la dignidad y previene activamente la hostilidad.

Enfoque: Evalúa todos los mensajes dirigidos y cualquier caso de gravedad intrínseca.

Factor de Severidad (FS): 1.3

Umbral de Sanción: Sancionar si Puntaje Total > 3.5
  `, // Default prompt for insults detection
  promptFactCheck: `
  **1. ROL Y MISIÓN**
Eres un "Fact-Checker" técnico. Tu única misión es determinar si el mensaje contiene desinformación objetiva y verificable.

  * Evalúas: Hechos, datos, cifras, atribuciones.
  * Ignoras: Opiniones, juicios morales, valores, creencias personales e interpretaciones.

**2. PROCESO DE EVALUACIÓN (Validación Interna Secuencial)**
**DEBES** seguir este protocolo estricto antes de emitir un veredicto:

1.  **Identificar:** ¿El mensaje contiene una afirmación factual que pueda ser verificada? Si no hay hechos, tu trabajo termina (Veredicto: No).
2.  **Verificar:** Si hay un hecho, **DEBES USAR LA HERRAMIENTA 'Google Search'**.
3.  **Validar URL:** Revisa los resultados. Debes seleccionar un enlace **funcional y fiable**. Si la búsqueda no arroja un enlace claro y accesible, NO PUEDES SANCIONAR.
4.  **Doble Chequeo:** Confirma que el contenido de ese enlace realmente refuta la afirmación del usuario. Garantiza que el '[Enlace URL]' y el 'Análisis' son mutuamente coherentes. **Prohibido inventar URLs.**

**3. CRITERIOS DE SANCIÓN (Qué buscar)**

  * **Dato Verificable Falso:** La afirmación contradice directamente la evidencia objetiva.
  * **Manipulación de Cifras:** Datos inventados, alterados o sacados de contexto.
  * **Generalización Engañosa:** Usar absolutos sin base factual ("Todos los X son Y").
  * **Atribución Errónea:** Adjudicar falsamente dichos o hechos.

**4. FORMATO DE SALIDA OBLIGATORIO (ESTRICTO)**
Usa doble espacio entre líneas para asegurar la separación visual.

**Si el mensaje NO contiene información no veraz:**


✅ FACT-CHECKER

• Veredicto: INFORMACIÓN VÁLIDA

• Score: 0


**Si el mensaje SÍ contiene información no veraz (tras validar URL):**

(Ver_Mas)• Análisis: [Breve explicación de por qué es correcto, opinión o no verificable]

⚠️ ALERTA DE VERACIDAD

• Fragmento: "[Frase exacta que contiene el dato falso]"


• Veredicto: INFORMACIÓN FALSA

• Score: -2


• Fuente: https://positiveengineering.com/es/las-pruebas-de-verificacion-en-seguridad-funcional/

(Ver_Mas)• Análisis: [Explicación de la falsedad basada en evidencia]
  `, // Default prompt for fact checking
  promptDesvioTema: `
  **1. ROL Y MISIÓN**
Eres un "Moderador de Coherencia" técnico. Tu misión no es solo detectar si el mensaje se desvía del tema central, sino también entender y seguir el "hilo" lógico de la conversación.

**2. VARIABLE REQUERIDA**
[TEMATICA CENTRAL]: EL ABORTO DE MANERA GENERAL

**3. REGLAS DE EVALUACIÓN (Lógica interna)**

**A. NO SE CONSIDERA DESVÍO (Veredicto: No):**

1.  **Interacciones Sociales:** Saludos ("Hola"), despedidas, cortesías ("Gracias").
2.  **Meta-conversación:** Comentarios sobre el debate ("Ese es un buen punto", "¿Puedes repetir?").
3.  **Argumento Central:** El mensaje trata directamente sobre la [TEMATICA CENTRAL].
4.  **Analogias y comparaciones:** El mensaje hace comparaciones o analogías razonables dentro de la logica de la [TEMATICA CENTRAL].
      * Ejemplo: Si el tema central es “El aborto de manera general”, se debe permitir comparaciones con otros casos, así sean llevados al extremo, pero que se refieran a la temática central, de modo que quieran llegar a un punto, haciendo una analogía.
5.  **Sub-temas Lógicos (El Hilo):** El mensaje introduce o discute un sub-tema que es una implicación directa o un pilar argumental del tema central.
      * Ejemplo: Si el Tema Central es "El Aborto", los sub-temas lógicos válidos incluyen: religión, filosofía de la vida, ética, derechos legales, salud pública, economía personal, **motivaciones personales (sin importar su calidad, lógica o aparente trivialidad)**, etc.

**B. SÍ SE CONSIDERA DESVÍO (Veredicto: Sí):**

  * **Desconexión Total:** El mensaje no tiene relación lógica NI con la [TEMATICA CENTRAL] NI con el argumento del turno inmediatamente anterior.
      * Ejemplo: Si están debatiendo "El Aborto" y un participante dice: "¿Vieron el partido de fútbol de anoche?". Eso es un desvío claro.

**6. Moción:** Cuando el participante diga moción, se debe entender que esta activando con esa palabra clave a otro Moderador, por lo tanto no debes tomarlo como un desvio de tema, por lo tanto tu veredicto en este caso que se presente esta palabra, será NO.

**4. FORMATO DE SALIDA OBLIGATORIO (ESTRICTO)**
Usa doble espacio entre líneas para asegurar la separación visual.

**Si el mensaje NO se desvía:**


✅ COHERENCIA

• Veredicto: MANTIENE EL TEMA

• Score: 0

(Ver_Mas)• Análisis: [Motivo breve: 'Se mantiene en el tema' / 'Sigue el hilo lógico del sub-tema (ej. filosofía)' / 'Es una interacción social'.]

**Si el mensaje SÍ se desvía:**


⚠️ ALERTA DE DESVÍO


• Veredicto: DESVÍO DE TEMA

• Score: -2

(Ver_Mas)• Análisis: El mensaje introduce un tema argumental nuevo ([Describir brevemente el nuevo tema]) que rompe la coherencia con el tema principal y el turno anterior.
  `, // Default prompt for topic deviation detection
};

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

    // Define prompts with their names and use custom or default values
    const prompts = [
      {
        name: "Insultos",
        value:
          debateConfig?.promptInsultos || DEFAULT_PROMPTS.promptInsultos || "",
      },
      {
        name: "Fact Check",
        value:
          debateConfig?.promptFactCheck ||
          DEFAULT_PROMPTS.promptFactCheck ||
          "",
      },
      {
        name: "Desvío de Tema",
        value:
          debateConfig?.promptDesvioTema ||
          DEFAULT_PROMPTS.promptDesvioTema ||
          "",
      },
    ].filter((p) => p.value.trim() !== ""); // Only include non-empty prompts

    // If no prompts available (all empty), no analysis needed
    if (prompts.length === 0) {
      console.log(`✅ No prompts configured, skipping AI analysis`);
      return { shouldRespond: false, results: [] };
    }

    // Analyze with multiple prompts
    const results = [];
    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];
      console.log(`🤖 Analyzing with prompt "${prompt.name}":`, prompt.value);

      const result = await aiService.moderateMessageWithPrompt(
        message,
        username,
        conversationHistory,
        prompt.value
      );

      results.push({
        promptIndex: i,
        promptName: prompt.name,
        prompt: prompt.value,
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

  // Turn timer management functions
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
    if (
      !roomData ||
      !roomData.participants ||
      roomData.participants.length === 0
    ) {
      console.log(
        `⚠️ Cannot switch turn - room ${roomId} not found or no participants`
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
      conversationStarted: roomData.conversationStarted,
    });

    // Start timer for new turn
    startTurnTimer(roomId);

    // Emit turn timeout message
    const timeoutMessage = {
      id: `timeout-${Date.now()}`,
      message: `⏰ Tiempo agotado. Continúa ${roomData.currentSpeaker}`,
      username: "Moderador",
      timestamp: new Date().toISOString(),
      socketId: "ai-moderator",
      isAIModerator: true,
    };

    // Store timeout message
    const messages = messageStore.get(roomId) || [];
    messages.push(timeoutMessage);
    messageStore.set(roomId, messages);

    io.to(roomId).emit("receive-message", timeoutMessage);
  }

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
        currentTurn: 0,
        currentSpeaker: null,
        conversationStarted: false,
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
        currentTurn: roomData.currentTurn,
        currentSpeaker: roomData.currentSpeaker,
        conversationStarted: roomData.conversationStarted || false,
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

      // Validate that conversation has started
      if (!roomData || !roomData.conversationStarted) {
        console.log("❌ Conversation not started yet, rejecting message");
        socket.emit("message-error", {
          message:
            "La conversación aún no ha comenzado. Espera a que alguien inicie la conversación.",
        });
        return;
      }

      // Validate that it's the sender's turn
      if (roomData.currentSpeaker !== data.username) {
        console.log(
          `❌ Not sender's turn. Current speaker: ${roomData.currentSpeaker}, Sender: ${data.username}`
        );
        socket.emit("message-error", {
          message: `No es tu turno. Es el turno de ${roomData.currentSpeaker}.`,
        });
        return;
      }

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
              const promptName =
                result.promptName || `Prompt ${result.promptIndex + 1}`;
              const aiMessage = {
                id: `ai-${Date.now()}-${result.promptIndex}`,
                message: `[${promptName}] ${result.response}`,
                username: "Moderador",
                timestamp: new Date().toISOString(),
                socketId: "ai-moderator",
                isAIModerator: true,
                reason: result.reason,
                promptIndex: result.promptIndex,
                promptName: promptName,
              };

              // Store AI message
              messages.push(aiMessage);
              messageStore.set(data.roomId, messages);

              // Broadcast AI message to room
              io.to(data.roomId).emit("receive-message", aiMessage);
              console.log(
                `🤖 AI intervention sent for prompt "${promptName}":`,
                result.response
              );

              // Send reasoning to side chat for all participants
              const reasoningMessage = {
                id: `ai-reasoning-${Date.now()}-${result.promptIndex}`,
                message: `AI Intervention Reasoning (${promptName}): ${
                  result.reason || "No specific reason provided"
                }`,
                username: "AI Assistant",
                timestamp: new Date().toISOString(),
                socketId: "ai-assistant",
                isAIModerator: true,
              };

              io.to(data.roomId).emit("ai-query-response", reasoningMessage);
            }
          }
        }

        // Handle turn switching and timer management (only if conversation has started)
        if (
          roomData &&
          roomData.participants &&
          roomData.participants.length > 0 &&
          roomData.conversationStarted
        ) {
          // Clear current turn timer
          clearTurnTimer(data.roomId);

          // Switch to next participant
          roomData.currentTurn =
            (roomData.currentTurn + 1) % roomData.participants.length;
          roomData.currentSpeaker =
            roomData.participants[roomData.currentTurn].username;
          roomParticipants.set(data.roomId, roomData);

          console.log(
            `🔄 Turn switched to: ${roomData.currentSpeaker} in room ${data.roomId}`
          );

          // Start timer for new turn
          startTurnTimer(data.roomId);

          // Emit turn update to room
          io.to(data.roomId).emit("room-updated", {
            participants: roomData.participants,
            currentTurn: roomData.currentTurn,
            currentSpeaker: roomData.currentSpeaker,
            conversationStarted: roomData.conversationStarted,
          });
        }
      }
    });

    // Handle start conversation
    socket.on("start-conversation", (data) => {
      console.log("\n=== START CONVERSATION EVENT ===");
      console.log("🚀 Start conversation:", {
        roomId: data.roomId,
        username: data.username,
        socketId: socket.id,
        timestamp: new Date().toISOString(),
      });

      const roomData = roomParticipants.get(data.roomId);
      if (!roomData) {
        console.log("❌ Room not found:", data.roomId);
        socket.emit("conversation-start-error", {
          message: "Room not found.",
        });
        return;
      }

      if (roomData.conversationStarted) {
        console.log("⚠️ Conversation already started for room:", data.roomId);
        socket.emit("conversation-start-error", {
          message: "Conversation has already started.",
        });
        return;
      }

      if (!roomData.participants || roomData.participants.length === 0) {
        console.log("❌ No participants in room:", data.roomId);
        socket.emit("conversation-start-error", {
          message: "No participants in room.",
        });
        return;
      }

      // Start the conversation
      roomData.conversationStarted = true;
      roomData.currentTurn = 0;
      roomData.currentSpeaker = roomData.participants[0].username;
      roomParticipants.set(data.roomId, roomData);

      console.log(
        `✅ Conversation started - first speaker: ${roomData.currentSpeaker}`
      );

      // Start timer for first participant
      startTurnTimer(data.roomId);

      // Emit room update to all participants
      const roomInfo = {
        participants: roomData.participants,
        currentTurn: roomData.currentTurn,
        currentSpeaker: roomData.currentSpeaker,
        conversationStarted: roomData.conversationStarted,
      };

      io.to(data.roomId).emit("room-updated", roomInfo);
      console.log("📢 Room updated - conversation started");
      console.log("=== END START CONVERSATION EVENT ===\n");
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
          promptsCount: [
            debateConfig?.promptInsultos || DEFAULT_PROMPTS.promptInsultos,
            debateConfig?.promptFactCheck || DEFAULT_PROMPTS.promptFactCheck,
            debateConfig?.promptDesvioTema || DEFAULT_PROMPTS.promptDesvioTema,
          ].filter((p) => p && p.trim() !== "").length,
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

    // Handle mocion submission
    socket.on("submit-mocion", async (data) => {
      console.log("\n=== MOCION SUBMISSION RECEIVED ===");
      console.log("📝 Mocion:", {
        roomId: data.roomId,
        username: data.username,
        moderatorMessage: data.moderatorMessage,
        mocionMessage: data.mocionMessage,
        socketId: socket.id,
        timestamp: new Date().toISOString(),
      });

      try {
        const roomData = roomParticipants.get(data.roomId);
        if (!roomData) {
          console.log("❌ Room not found:", data.roomId);
          return;
        }

        // Get room config for mocion prompt
        const debateConfig = roomConfigs.get(data.roomId);
        if (!debateConfig || !debateConfig.mocionPrompt) {
          console.log("❌ No mocion prompt configured for room:", data.roomId);
          return;
        }

        // Get message store for the room
        const messages = messageStore.get(data.roomId) || [];

        // Post the mocion message to the chat
        const mocionUserMessage = {
          id: `mocion-${Date.now()}`,
          message: `[Moción] ${data.mocionMessage}`,
          username: data.username,
          timestamp: new Date().toISOString(),
          socketId: socket.id,
        };

        messages.push(mocionUserMessage);
        messageStore.set(data.roomId, messages);

        // Broadcast mocion message to room
        console.log("📡 Broadcasting mocion message to room:", {
          roomId: data.roomId,
          messageId: mocionUserMessage.id,
        });
        io.to(data.roomId).emit("receive-message", mocionUserMessage);
        console.log("✅ Mocion message broadcasted successfully");

        // Check if AI service is available
        if (!aiService.isAvailable()) {
          console.log("❌ AI Service not available - no OpenAI API key");
          return;
        }

        // Build the prompt according to the specified structure
        const mocionPrompt = `AI moderator message: ${data.moderatorMessage}

participant name: ${data.username}

mocion message: ${data.mocionMessage}

${debateConfig.mocionPrompt}`;

        console.log("🤖 Calling AI service with mocion prompt:", {
          promptLength: mocionPrompt.length,
          promptPreview: mocionPrompt.substring(0, 200) + "...",
        });

        const aiResponse = await aiService.callAI("", mocionPrompt);

        console.log("🤖 AI Response for mocion:", {
          responseLength: aiResponse?.length || 0,
          responsePreview: aiResponse?.substring(0, 100) + "...",
        });

        // Post AI response to the chat
        const aiMocionMessage = {
          id: `mocion-ai-${Date.now()}`,
          message: aiResponse || "No se pudo procesar la moción.",
          username: "Moderador",
          timestamp: new Date().toISOString(),
          socketId: "ai-moderator",
          isAIModerator: true,
        };

        messages.push(aiMocionMessage);
        messageStore.set(data.roomId, messages);

        // Broadcast AI response to room
        console.log("📡 Broadcasting AI mocion response to room:", {
          roomId: data.roomId,
          messageId: aiMocionMessage.id,
        });
        io.to(data.roomId).emit("receive-message", aiMocionMessage);
        console.log("✅ AI mocion response broadcasted successfully");
        console.log("=== END MOCION SUBMISSION ===\n");
      } catch (error) {
        console.error("❌ Mocion submission error:", error);
        console.error("❌ Error details:", {
          message: error.message,
          stack: error.stack,
          name: error.name,
        });
        console.log("=== END MOCION SUBMISSION (ERROR) ===\n");
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
