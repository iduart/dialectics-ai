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

// Initialize OpenAI client (primary AI)
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null;

// AI Service Configuration
const AI_CONFIG = {
  model: "gpt-4o-mini", // Cost-effective model for most tasks
  temperature: 0.3,
  max_tokens: 500,
};

// AI Service - Comprehensive system for multiple features
class AIService {
  constructor() {
    this.openai = openai;
  }

  // Check if AI service is available
  isAvailable() {
    return this.openai !== null;
  }

  // Generic AI call method
  async callAI(systemPrompt, userPrompt, options = {}) {
    if (!this.isAvailable()) {
      throw new Error("OpenAI API not available");
    }

    const config = {
      model: options.model || AI_CONFIG.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: options.temperature || AI_CONFIG.temperature,
      max_tokens: options.max_tokens || AI_CONFIG.max_tokens,
    };

    const completion = await this.openai.chat.completions.create(config);
    return completion.choices[0]?.message?.content;
  }

  // AI Moderation
  async moderateMessage(message, username) {
    const systemPrompt = `You are an AI moderator for a chat application. Your role is to:

1. Analyze incoming messages for offensive, abusive, inappropriate, or harmful content
2. Only respond if you detect content that violates community guidelines
3. When you respond, be helpful, educational, and constructive
4. Focus on promoting a positive, respectful chat environment

Guidelines for moderation:
- Detect: Profanity, harassment, hate speech, threats, spam, personal attacks
- Respond with: Brief, respectful warnings or educational messages
- Tone: Professional but friendly, not preachy
- Length: Keep responses concise (1-2 sentences max)

Examples of when to respond:
- "Hey everyone, let's keep our chat respectful and constructive! 😊"
- "Please remember to be kind to each other in our chat."
- "Let's focus on positive discussion and avoid personal attacks."

Only respond if the message clearly violates guidelines. Do not respond to normal, respectful conversation.`;

    const userPrompt = `Analyze this message from user "${username}": "${message}"\n\nRespond with JSON in this exact format:
{
  "shouldRespond": true/false,
  "response": "your moderation message if shouldRespond is true",
  "reason": "brief reason for the decision"
}

Only respond if the message clearly violates guidelines. Be very conservative - only flag obvious violations.`;

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

  // AI Chat Enhancement (for future features)
  async enhanceMessage(message, context = {}) {
    const systemPrompt = `You are an AI assistant that helps enhance chat conversations. You can:
- Provide helpful information
- Suggest conversation topics
- Answer questions
- Offer constructive feedback

Be helpful, friendly, and concise.`;

    const userPrompt = `Enhance this message: "${message}"\n\nContext: ${JSON.stringify(
      context
    )}\n\nProvide a helpful response or enhancement.`;

    try {
      return await this.callAI(systemPrompt, userPrompt);
    } catch (error) {
      console.error("AI Enhancement error:", error);
      return null;
    }
  }

  // AI Content Analysis (for future features)
  async analyzeContent(message, analysisType = "general") {
    const systemPrompt = `You are an AI content analyzer. Analyze the given message and provide insights based on the analysis type.`;

    const userPrompt = `Analyze this message: "${message}"\n\nAnalysis type: ${analysisType}\n\nProvide detailed analysis and insights.`;

    try {
      return await this.callAI(systemPrompt, userPrompt);
    } catch (error) {
      console.error("AI Analysis error:", error);
      return null;
    }
  }

  // AI Translation (for future features)
  async translateMessage(message, targetLanguage = "spanish") {
    const systemPrompt = `You are a professional translator. Translate the given message to the target language accurately and naturally.`;

    const userPrompt = `Translate this message to ${targetLanguage}: "${message}"`;

    try {
      return await this.callAI(systemPrompt, userPrompt);
    } catch (error) {
      console.error("AI Translation error:", error);
      return null;
    }
  }

  // AI Summarization (for future features)
  async summarizeConversation(messages) {
    const systemPrompt = `You are an AI assistant that summarizes conversations. Create a concise summary of the key points and topics discussed.`;

    const userPrompt = `Summarize this conversation:\n\n${messages
      .map((m) => `${m.username}: ${m.message}`)
      .join("\n")}`;

    try {
      return await this.callAI(systemPrompt, userPrompt);
    } catch (error) {
      console.error("AI Summarization error:", error);
      return null;
    }
  }
}

// Initialize AI Service
const aiService = new AIService();

// Simple moderation function using the AI service
async function analyzeMessage(message, username) {
  if (!aiService.isAvailable()) {
    console.log("AI Moderation disabled: No OpenAI API key provided");
    return { shouldRespond: false };
  }

  try {
    console.log("🤖 AI analyzing message...");
    const result = await aiService.moderateMessage(message, username);
    console.log(`✅ AI analysis complete`);
    return result;
  } catch (error) {
    console.error("AI Moderation error:", error);
    return { shouldRespond: false };
  }
}

// Legacy function (kept for compatibility)
async function analyzeWithOpenAI(message, username) {
  if (!openai) {
    throw new Error("OpenAI not available");
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: `Analyze this message from user "${username}": "${message}"\n\nRespond with JSON in this exact format:
{
  "shouldRespond": true/false,
  "response": "your moderation message if shouldRespond is true",
  "reason": "brief reason for the decision"
}

Only respond if the message clearly violates guidelines. Be very conservative - only flag obvious violations.`,
      },
    ],
    temperature: 0.3,
    max_tokens: 200,
  });

  return completion.choices[0]?.message?.content;
}

// DeepSeek moderation function
async function analyzeWithDeepSeek(message, username) {
  if (!DEEPSEEK_API_KEY) {
    throw new Error("DeepSeek API key not available");
  }

  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: `Analyze this message from user "${username}": "${message}"\n\nRespond with JSON in this exact format:
{
  "shouldRespond": true/false,
  "response": "your moderation message if shouldRespond is true",
  "reason": "brief reason for the decision"
}

Only respond if the message clearly violates guidelines. Be very conservative - only flag obvious violations.`,
        },
      ],
      temperature: 0.3,
      max_tokens: 200,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `DeepSeek API error: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  return data.choices[0]?.message?.content;
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
          data.username
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

    // AI-powered features
    socket.on("ai-enhance-message", async (data) => {
      if (!aiService.isAvailable()) {
        socket.emit("ai-response", { error: "AI service not available" });
        return;
      }

      try {
        const enhancement = await aiService.enhanceMessage(
          data.message,
          data.context
        );
        socket.emit("ai-response", {
          type: "enhancement",
          message: enhancement,
          originalMessage: data.message,
        });
      } catch (error) {
        console.error("AI Enhancement error:", error);
        socket.emit("ai-response", { error: "Enhancement failed" });
      }
    });

    socket.on("ai-translate-message", async (data) => {
      if (!aiService.isAvailable()) {
        socket.emit("ai-response", { error: "AI service not available" });
        return;
      }

      try {
        const translation = await aiService.translateMessage(
          data.message,
          data.targetLanguage
        );
        socket.emit("ai-response", {
          type: "translation",
          message: translation,
          originalMessage: data.message,
          targetLanguage: data.targetLanguage,
        });
      } catch (error) {
        console.error("AI Translation error:", error);
        socket.emit("ai-response", { error: "Translation failed" });
      }
    });

    socket.on("ai-summarize-conversation", async (data) => {
      if (!aiService.isAvailable()) {
        socket.emit("ai-response", { error: "AI service not available" });
        return;
      }

      try {
        const messages = messageStore.get(data.roomId) || [];
        const summary = await aiService.summarizeConversation(messages);
        socket.emit("ai-response", {
          type: "summary",
          message: summary,
          messageCount: messages.length,
        });
      } catch (error) {
        console.error("AI Summarization error:", error);
        socket.emit("ai-response", { error: "Summarization failed" });
      }
    });

    socket.on("ai-analyze-content", async (data) => {
      if (!aiService.isAvailable()) {
        socket.emit("ai-response", { error: "AI service not available" });
        return;
      }

      try {
        const analysis = await aiService.analyzeContent(
          data.message,
          data.analysisType
        );
        socket.emit("ai-response", {
          type: "analysis",
          message: analysis,
          originalMessage: data.message,
          analysisType: data.analysisType,
        });
      } catch (error) {
        console.error("AI Analysis error:", error);
        socket.emit("ai-response", { error: "Analysis failed" });
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
