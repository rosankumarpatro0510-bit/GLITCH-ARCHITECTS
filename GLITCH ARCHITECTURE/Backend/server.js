const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
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

const dataDir = path.join(__dirname, "data");
const usersFile = path.join(dataDir, "users.json");
const reportsFile = path.join(dataDir, "reports.json");

function readUsers() {
  try { return JSON.parse(fs.readFileSync(usersFile, "utf8")); } catch (error) { return []; }
}

function writeUsers(users) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

function readReports() {
  try { return JSON.parse(fs.readFileSync(reportsFile, "utf8")); } catch (error) { return []; }
}

function writeReports(reports) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(reportsFile, JSON.stringify(reports, null, 2));
}

function normalizeContact(value) { return String(value || "").trim().toLowerCase(); }

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString("hex") };
}

function verifyPassword(password, user) {
  const candidate = crypto.scryptSync(password, user.passwordSalt, 64);
  const stored = Buffer.from(user.passwordHash, "hex");
  return stored.length === candidate.length && crypto.timingSafeEqual(stored, candidate);
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role,
    neighborhood: user.neighborhood, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt || null };
}

function adminAuthorized(req) {
  return Boolean(process.env.ADMIN_TOKEN && req.get("x-admin-token") === process.env.ADMIN_TOKEN);
}

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

// Account registration and login. Passwords are hashed and never returned.
app.post("/api/auth/register", (req, res) => {
  const { name, contact, neighborhood, role, password } = req.body || {};
  const email = normalizeContact(contact);
  if (!name || !email || !password || password.length < 8) {
    return res.status(400).json({ success: false, error: "Name, contact, and a password of at least 8 characters are required" });
  }
  const users = readUsers();
  if (users.some(user => user.email === email)) {
    return res.status(409).json({ success: false, error: "An account with that contact already exists" });
  }
  const credentials = hashPassword(password);
  const user = {
    id: `user_${crypto.randomUUID()}`, name: String(name).trim(), email,
    role: role || "Community Member", neighborhood: neighborhood || "Local Resident",
    passwordSalt: credentials.salt, passwordHash: credentials.hash,
    createdAt: new Date().toISOString()
  };
  users.push(user);
  writeUsers(users);
  res.status(201).json({ success: true, user: publicUser(user) });
});

app.post("/api/auth/login", (req, res) => {
  const email = normalizeContact(req.body && req.body.contact);
  const password = String((req.body && req.body.password) || "");
  const users = readUsers();
  const user = users.find(item => item.email === email);
  if (!user || !verifyPassword(password, user)) {
    return res.status(401).json({ success: false, error: "Invalid contact or password" });
  }
  user.lastLoginAt = new Date().toISOString();
  writeUsers(users);
  res.json({ success: true, user: publicUser(user) });
});

// Admin recovery interface. It exposes metadata only, never passwords.
app.get("/api/admin/users", (req, res) => {
  if (!adminAuthorized(req)) return res.status(401).json({ success: false, error: "Admin authorization required" });
  res.json({ success: true, users: readUsers().map(publicUser) });
});

app.post("/api/admin/users/:id/reset-password", (req, res) => {
  if (!adminAuthorized(req)) return res.status(401).json({ success: false, error: "Admin authorization required" });
  const password = String((req.body && req.body.password) || "");
  if (password.length < 8) return res.status(400).json({ success: false, error: "Password must be at least 8 characters" });
  const users = readUsers();
  const user = users.find(item => item.id === req.params.id);
  if (!user) return res.status(404).json({ success: false, error: "User not found" });
  const credentials = hashPassword(password);
  user.passwordSalt = credentials.salt;
  user.passwordHash = credentials.hash;
  writeUsers(users);
  res.json({ success: true, user: publicUser(user) });
});

app.post("/api/reports", (req, res) => {
  const { type, description, lat, lon, placeName, photo, reporter } = req.body || {};
  if (!type || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) {
    return res.status(400).json({ success: false, error: "Report type and valid coordinates are required" });
  }
  const report = {
    id: `report_${crypto.randomUUID()}`, type: String(type),
    description: String(description || "").slice(0, 2000),
    lat: Number(lat), lon: Number(lon), placeName: String(placeName || ""),
    photo: typeof photo === "string" && photo.length < 5_000_000 ? photo : null,
    reporter: reporter ? { id: reporter.id, name: reporter.name, email: reporter.email } : null,
    status: "unverified", createdAt: new Date().toISOString()
  };
  const reports = readReports();
  reports.unshift(report);
  writeReports(reports.slice(0, 1000));
  res.status(201).json({ success: true, report });
});

app.get("/api/admin/reports", (req, res) => {
  if (!adminAuthorized(req)) return res.status(401).json({ success: false, error: "Admin authorization required" });
  res.json({ success: true, reports: readReports() });
});

app.patch("/api/admin/reports/:id", (req, res) => {
  if (!adminAuthorized(req)) return res.status(401).json({ success: false, error: "Admin authorization required" });
  const allowed = ["unverified", "review", "verified", "resolved"];
  if (!allowed.includes(req.body && req.body.status)) return res.status(400).json({ success: false, error: "Invalid report status" });
  const reports = readReports();
  const report = reports.find(item => item.id === req.params.id);
  if (!report) return res.status(404).json({ success: false, error: "Report not found" });
  report.status = req.body.status;
  report.updatedAt = new Date().toISOString();
  writeReports(reports);
  res.json({ success: true, report });
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