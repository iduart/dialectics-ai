import OpenAI from "openai";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ModerationResult {
  shouldRespond: boolean;
  response?: string;
  reason?: string;
}

export interface MessageAnalysis {
  isOffensive: boolean;
  severity: "low" | "medium" | "high";
  categories: string[];
  confidence: number;
}

export class AIModerator {
  private systemPrompt: string;

  constructor(customPrompt?: string) {
    this.systemPrompt =
      customPrompt ||
      `You are an AI moderator for a chat application. Your role is to:

1. Analyze incoming messages for offensive, abusive, inappropriate, or harmful content
2. Only respond if you detect content that violates community guidelines
3. When you respond, be helpful, educational, and constructive
4. Focus on promoting a positive, respectful chat environment
5. ALWAYS respond in the same language as the user's message

Guidelines for moderation:
- Detect: Profanity, harassment, hate speech, threats, spam, personal attacks
- Respond with: Brief, respectful warnings or educational messages
- Tone: Professional but friendly, not preachy
- Length: Keep responses concise (1-2 sentences max)
- Language: Always respond in the same language as the user's message

Examples of when to respond (in various languages):
- English: "Hey everyone, let's keep our chat respectful and constructive! 😊"
- Spanish: "¡Hola a todos, mantengamos nuestro chat respetuoso y constructivo! 😊"
- Portuguese: "Olá pessoal, vamos manter nosso chat respeitoso e construtivo! 😊"
- French: "Salut tout le monde, gardons notre chat respectueux et constructif ! 😊"

Only respond if the message clearly violates guidelines. Do not respond to normal, respectful conversation.`;
  }

  async analyzeMessage(
    message: string,
    username: string
  ): Promise<ModerationResult> {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini", // Using the more cost-effective model
        messages: [
          {
            role: "system",
            content: this.systemPrompt,
          },
          {
            role: "user",
            content: `Analyze this message from user "${username}": "${message}"\n\nRespond with JSON in this exact format:
{
  "shouldRespond": true/false,
  "response": "your moderation message if shouldRespond is true (respond in the same language as the user's message)",
  "reason": "brief reason for the decision"
}

Only respond if the message clearly violates guidelines. Be very conservative - only flag obvious violations.`,
          },
        ],
        temperature: 0.3,
        max_tokens: 200,
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        return { shouldRespond: false };
      }

      try {
        const parsed = JSON.parse(response);
        return {
          shouldRespond: parsed.shouldRespond || false,
          response: parsed.response,
          reason: parsed.reason,
        };
      } catch (parseError) {
        console.error("Error parsing AI response:", parseError);
        return { shouldRespond: false };
      }
    } catch (error) {
      console.error("AI Moderation error:", error);
      return { shouldRespond: false };
    }
  }

  updatePrompt(newPrompt: string) {
    this.systemPrompt = newPrompt;
  }

  getPrompt(): string {
    return this.systemPrompt;
  }
}

// Create a singleton instance
export const aiModerator = new AIModerator();
