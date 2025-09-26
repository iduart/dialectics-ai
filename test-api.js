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
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: "Say hello",
        },
      ],
      max_tokens: 10,
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
