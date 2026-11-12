// Richard AI Studio production API
// Node.js 18+, Express, and PostgreSQL. API keys stay on the server.
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.STUDIO_MODEL || "claude-sonnet-5-5";
const SESSION_SECRET = process.env.SESSION_SECRET || (process.env.NODE_ENV === "production" ? "" : "local-only-change-me");
const DATABASE_URL = process.env.DATABASE_URL;
const MAX_PROMPT_CHARS = 8000;
const MAX_PROJECT_TEXT_CHARS = 100000;
const PUBLIC_DIR = path.join(__dirname, "public");
const SCHEMA_PATH = path.join(__dirname, "db", "schema.sql");

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required. Configure PostgreSQL and set DATABASE_URL.");
  process.exit(1);
}
if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  console.error("Set SESSION_SECRET to a random value of at least 32 characters.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.PG_POOL_SIZE || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

const app = express();
app.disable("x-powered-by");
// Render and similar hosts terminate TLS at their proxy.
if (process.env.TRUST_PROXY === "true") app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "20kb" }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Try again later." }
});
const generationLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests. Wait a minute and try again." }
});

function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

function issueToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, SESSION_SECRET, { expiresIn: "24h", issuer: "richard-ai-studio" });
}

async function requireAuth(req, res, next) {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return sendError(res, 401, "Please log in to continue.");
  try {
    const payload = jwt.verify(token, SESSION_SECRET, { issuer: "richard-ai-studio" });
    const result = await pool.query("SELECT id, name, email FROM users WHERE id = $1", [payload.sub]);
    if (!result.rowCount) return sendError(res, 401, "Session is no longer valid. Please log in again.");
    req.user = result.rows[0];
    return next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return sendError(res, 401, "Session expired. Please log in again.");
    }
    return next(error);
  }
}

function validEmail(value) {
  return typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

app.get("/health", async (_req, res, next) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, model: MODEL, database: "connected" });
  } catch (error) {
    next(error);
  }
});

app.post("/api/register", authLimiter, async (req, res, next) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (!name || name.length > 100 || !validEmail(email) || password.length < 10 || password.length > 200) {
      return sendError(res, 400, "Enter your name, a valid email, and a password of at least 10 characters.");
    }

    const id = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      "INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, name, email",
      [id, name, email, passwordHash]
    );
    const user = result.rows[0];
    return res.status(201).json({ token: issueToken(user), user });
  } catch (error) {
    if (error.code === "23505") return sendError(res, 409, "An account with that email already exists.");
    return next(error);
  }
});

app.post("/api/login", authLimiter, async (req, res, next) => {
  try {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (!validEmail(email) || !password || password.length > 200) {
      return sendError(res, 401, "Invalid email or password.");
    }

    const result = await pool.query("SELECT id, name, email, password_hash FROM users WHERE email = $1", [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return sendError(res, 401, "Invalid email or password.");
    }
    const safeUser = { id: user.id, name: user.name, email: user.email };
    return res.json({ token: issueToken(safeUser), user: safeUser });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/session", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get("/api/projects", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT id, title, text, type, created_at AS date FROM projects WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100",
      [req.user.id]
    );
    res.json({ projects: result.rows });
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects", requireAuth, async (req, res, next) => {
  try {
    const title = typeof req.body.title === "string" ? req.body.title.trim() : "Untitled project";
    const text = typeof req.body.text === "string" ? req.body.text : "";
    const type = typeof req.body.type === "string" ? req.body.type : "resource";
    if (!title || title.length > 240 || !text || text.length > MAX_PROJECT_TEXT_CHARS || type.length > 60) {
      return sendError(res, 400, "Project title or content is invalid or too large.");
    }

    const result = await pool.query(
      "INSERT INTO projects (id, user_id, title, text, type) VALUES ($1, $2, $3, $4, $5) RETURNING id, title, text, type, created_at AS date",
      [crypto.randomUUID(), req.user.id, title, text, type]
    );
    return res.status(201).json({ project: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/projects/:id", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query("DELETE FROM projects WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    if (!result.rowCount) return sendError(res, 404, "Project not found.");
    return res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/generate", requireAuth, generationLimiter, async (req, res, next) => {
  if (!API_KEY) return sendError(res, 503, "AI generation is not configured on the server.");
  const prompt = typeof req.body.prompt === "string" ? req.body.prompt.trim() : "";
  if (!prompt) return sendError(res, 400, "Prompt is required.");
  if (prompt.length > MAX_PROMPT_CHARS) return sendError(res, 400, "Prompt is too long.");

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        system: "You are an expert curriculum designer and teacher trainer. Write accurate, age-appropriate, syllabus-aligned educational content. Use clear headings. Do not invent curriculum codes or exam facts you are unsure of; say so instead.",
        messages: [{ role: "user", content: prompt }]
      }),
      signal: AbortSignal.timeout(90000)
    });

    if (!response.ok) {
      console.error("Anthropic API returned", response.status);
      return sendError(res, 502, "AI generation failed. Please try again.");
    }
    const data = await response.json();
    const text = (data.content || []).filter(block => block.type === "text").map(block => block.text).join("\n");
    if (!text) return sendError(res, 502, "The AI service returned no content.");
    return res.json({ text });
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") return sendError(res, 504, "AI generation timed out. Please try again.");
    return next(error);
  }
});

app.use(express.static(PUBLIC_DIR, { extensions: ["html"], index: "index.html", maxAge: process.env.NODE_ENV === "production" ? "1h" : 0 }));

app.use((error, _req, res, _next) => {
  if (res.headersSent) return;
  if (error.type === "entity.too.large") return sendError(res, 413, "Request body is too large.");
  if (error instanceof SyntaxError && "body" in error) return sendError(res, 400, "Invalid JSON.");
  console.error(error);
  return sendError(res, 500, "An unexpected server error occurred.");
});

async function start() {
  const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
  await pool.query(schema);
  app.listen(PORT, () => console.log(`Richard AI Studio API listening on port ${PORT}`));
}

start().catch(error => {
  console.error("Failed to start app:", error);
  process.exit(1);
});

async function shutdown() {
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
