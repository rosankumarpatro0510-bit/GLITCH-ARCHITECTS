const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
const { GoogleGenAI } = require("@google/genai");

// Load .env from Backend directory or parent directory
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config({ path: path.join(__dirname, "..", ".env") });
}

const app = express();

app.use(cors());
app.use(express.json());

// Serve static frontend files from the parent directory
const staticDir = path.join(__dirname, "..");
app.use(express.static(staticDir));

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("⚠️ WARNING: GEMINI_API_KEY is not defined in .env!");
} else {
  console.log("✓ GEMINI_API_KEY loaded (length: " + apiKey.length + ")");
}

const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// Resilient Gemini generator with fallback models
async function generateGeminiContent(prompt) {
  if (!ai) throw new Error("GEMINI_API_KEY is not configured on the server");

  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const response = await ai.models.generateContent({
    model,
    contents: prompt
  });
  if (!response.text) throw new Error("Gemini returned an empty response");
  return { text: response.text, model };
}

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "online",
    hasApiKey: !!apiKey,
    model: process.env.GEMINI_MODEL || "gemini-3.6-flash"
  });
});

// Explain Risk endpoint
app.post("/api/explain-risk", async (req, res) => {
  try {
    const { hazard, score, indicators, location } = req.body;

    const prompt = `
You are an expert meteorological and emergency weather risk explanation assistant.

Location: ${location || "Current assessment point"}
Hazard: ${hazard || "Severe Weather"}
Risk Score: ${score || 0}/100

Atmospheric indicators:
${JSON.stringify(indicators || {}, null, 2)}

Provide a concise, professional explanation for incident responders and the public:
1. Executive Risk Summary: Why does this hazard have this specific risk level (${score}/100)?
2. Primary Drivers: Which atmospheric indicators (e.g. CAPE, moisture/IWV, wind shear, cloud top temperature) are the most critical factors?
3. Recommended Immediate Precautions: 3 actionable safety recommendations.

Keep it clear, authoritative, and strictly avoid making up unobserved measurements.
`;

    const result = await generateGeminiContent(prompt);

    res.json({
      success: true,
      explanation: result.text,
      model: result.model
    });
  } catch (error) {
    console.error("Gemini explain error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Gemini API request failed"
    });
  }
});

// Chat Assistant endpoint
app.post("/api/chat", async (req, res) => {
  try {
    const { query, context, lang } = req.body;
    if (!query) {
      return res.status(400).json({ success: false, error: "Query is required" });
    }

    const prompt = `
You are the AI Meteorological Assistant for the Glitch Architecture severe weather nowcasting console.
Language preference: ${lang || "English"}

Current Situation Context:
${JSON.stringify(context || {}, null, 2)}

User Question:
"${query}"

Instructions:
- Provide an accurate, helpful, and concise response.
- Answer in the preferred language if feasible (or English if not).
- If relevant, refer to the local atmospheric conditions from context.
- For emergency or imminent life-threat scenarios, mention emergency helpline 112 / NDMA 1078.
`;

    const result = await generateGeminiContent(prompt);

    res.json({
      success: true,
      answer: result.text,
      model: result.model
    });
  } catch (error) {
    console.error("Gemini chat error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Gemini API request failed"
    });
  }
});

const PORT = process.env.PORT || 5000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Glitch Architecture Server & Gemini AI Backend`);
    console.log(`📡 URL: http://localhost:${PORT}`);
    console.log(`🌐 Application Console: http://localhost:${PORT}/app.html`);
    console.log(`📄 Landing Page: http://localhost:${PORT}/index.html`);
    console.log(`🤖 Gemini Model: ${process.env.GEMINI_MODEL || "gemini-3.6-flash"}`);
    console.log(`======================================================\n`);
  });
}

module.exports = app;