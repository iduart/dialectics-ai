import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function testAPI() {
  try {
    console.log("Testing OpenAI API...");
    console.log(
      "API Key (first 10 chars):",
      process.env.OPENAI_API_KEY?.substring(0, 10) + "..."
    );

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are a debate moderator. IMPORTANTE: Siempre responde ÚNICAMENTE con JSON válido. No incluyas texto adicional, explicaciones, ni markdown code blocks. Solo el JSON puro.",
        },
        {
          role: "user",
          content: `Analiza este mensaje de "testuser": "hello"

CRÍTICO: Responde ÚNICAMENTE con JSON válido. NO uses markdown, NO incluyas texto adicional, NO uses \`\`\`json\`\`\`. Solo el JSON puro.

Responde con JSON en este formato exacto:
{
  "shouldRespond": true/false,
  "response": "tu mensaje de moderación si shouldRespond es true",
  "reason": "breve razón de la decisión"
}

Solo responde si el mensaje viola claramente las reglas del debate (insultos, desvío del tema, información no veraz, MOCIÓN, o ULTIMA INTERVENCION). Si no hay violación, shouldRespond debe ser false.`,
        },
      ],
      temperature: 0.3,
      max_tokens: 200,
    });

    console.log("✅ API Test Successful!");
    console.log("Response:", completion.choices[0].message.content);
  } catch (error) {
    console.error("❌ API Test Failed:");
    console.error("Error:", error.message);
    console.error("Status:", error.status);
    console.error("Type:", error.type);
  }
}

testAPI();
