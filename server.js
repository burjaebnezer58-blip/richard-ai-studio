// Richard AI - Educational Content Studio server
// Node.js 18+. Secure backend with local auth and persistent projects.
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.STUDIO_MODEL || "claude-sonnet-5-5";
const SESSION_SECRET = process.env.SESSION_SECRET || "richard-ai-dev-secret";
const MAX_PROMPT_CHARS = 8000;
const MAX_TOKENS = 4000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const USERS_PATH = path.join(DATA_DIR, "users.json");
const PROJECTS_PATH = path.join(DATA_DIR, "projects.json");

const SYSTEM = "You are an expert curriculum designer and teacher trainer. Write accurate, age-appropriate, syllabus-aligned educational content that teachers can use directly. Use clear headings and numbered sections. Do not invent curriculum codes or exam facts you are unsure of; say so instead.";

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function saveJson(file, data) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const hits = new Map();
function rateOk(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < 60000);
  if (list.length >= 20) {
    hits.set(ip, list);
    return false;
  }
  list.push(now);
  hits.set(ip, list);
  return true;
}

function sendJson(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 20000) {
        req.destroy();
        reject(new Error("Body too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
}

function createUserRecord(name, email, password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return {
    id: crypto.randomUUID(),
    name: name || email.split("@")[0],
    email: email.toLowerCase(),
    salt,
    passwordHash: hashPassword(password, salt)
  };
}

function getUsers() {
  return loadJson(USERS_PATH, []);
}

function saveUsers(users) {
  saveJson(USERS_PATH, users);
}

function getProjects() {
  return loadJson(PROJECTS_PATH, []);
}

function saveProjects(projects) {
  saveJson(PROJECTS_PATH, projects);
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("hex");
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token) return null;
  try {
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;
    const expected = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("hex");
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function getUserFromRequest(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const payload = verifyToken(token);
  if (!payload) return null;
  const users = getUsers();
  return users.find(user => user.id === payload.sub) || null;
}

async function generate(prompt) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    throw new Error(`AI service error ${r.status}${errText ? ": " + errText.slice(0, 200) : ""}`);
  }

  const data = await r.json();
  return (data.content || []).filter(item => item.type === "text").map(item => item.text).join("\n");
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];

  if (req.method === "GET" && url === "/health") {
    return sendJson(res, 200, { ok: true, model: MODEL });
  }

  if (req.method === "POST" && url === "/api/register") {
    try {
      const body = JSON.parse(await readBody(req));
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");

      if (!name || !email || !password || password.length < 6) {
        return sendJson(res, 400, { error: "Name, valid email, and password (6+ chars) are required." });
      }

      const users = getUsers();
      if (users.some(user => user.email === email)) {
        return sendJson(res, 409, { error: "An account with that email already exists." });
      }

      const newUser = createUserRecord(name, email, password);
      users.push(newUser);
      saveUsers(users);

      const token = signToken({ sub: newUser.id, email: newUser.email, exp: Date.now() + 86400000 });
      return sendJson(res, 201, { token, user: { id: newUser.id, name: newUser.name, email: newUser.email } });
    } catch (e) {
      console.error(e);
      return sendJson(res, 400, { error: "Invalid request" });
    }
  }

  if (req.method === "POST" && url === "/api/login") {
    try {
      const body = JSON.parse(await readBody(req));
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");

      const users = getUsers();
      const user = users.find(u => u.email === email);
      if (!user || hashPassword(password, user.salt) !== user.passwordHash) {
        return sendJson(res, 401, { error: "Invalid email or password." });
      }

      const token = signToken({ sub: user.id, email: user.email, exp: Date.now() + 86400000 });
      return sendJson(res, 200, { token, user: { id: user.id, name: user.name, email: user.email } });
    } catch (e) {
      console.error(e);
      return sendJson(res, 400, { error: "Invalid request" });
    }
  }

  if (req.method === "GET" && url === "/api/session") {
    const user = getUserFromRequest(req);
    if (!user) return sendJson(res, 401, { error: "Unauthorized" });
    return sendJson(res, 200, { user: { id: user.id, name: user.name, email: user.email } });
  }

  if (req.method === "GET" && url === "/api/projects") {
    const user = getUserFromRequest(req);
    if (!user) return sendJson(res, 401, { error: "Unauthorized" });
    const projects = getProjects().filter(project => project.userId === user.id);
    return sendJson(res, 200, { projects });
  }

  if (req.method === "POST" && url === "/api/projects") {
    const user = getUserFromRequest(req);
    if (!user) return sendJson(res, 401, { error: "Unauthorized" });

    try {
      const body = JSON.parse(await readBody(req));
      const title = String(body.title || "Untitled project").trim();
      const text = String(body.text || "");
      const type = String(body.type || "resource");

      const projects = getProjects();
      const record = {
        id: crypto.randomUUID(),
        userId: user.id,
        title,
        text,
        type,
        date: new Date().toISOString()
      };

      projects.unshift(record);
      saveProjects(projects);
      return sendJson(res, 201, { project: record });
    } catch (e) {
      console.error(e);
      return sendJson(res, 400, { error: "Invalid project payload" });
    }
  }

  if (req.method === "POST" && url === "/api/generate") {
    const user = getUserFromRequest(req);
    if (!user) return sendJson(res, 401, { error: "Unauthorized" });
    if (!API_KEY) return sendJson(res, 500, { error: "Server is missing ANTHROPIC_API_KEY." });
    if (!rateOk(req.socket.remoteAddress)) return sendJson(res, 429, { error: "Too many requests. Wait a minute and try again." });

    try {
      const body = JSON.parse(await readBody(req));
      const prompt = String(body.prompt || "").trim();
      if (!prompt) return sendJson(res, 400, { error: "Prompt is required." });
      if (prompt.length > MAX_PROMPT_CHARS) return sendJson(res, 400, { error: "Prompt is too long." });
      const text = await generate(prompt);
      return sendJson(res, 200, { text });
    } catch (e) {
      console.error(e);
      return sendJson(res, 502, { error: "Generation failed. Please try again." });
    }
  }

  if (req.method !== "GET") {
    res.writeHead(405);
    return res.end();
  }

  let rel = decodeURIComponent(url);
  if (rel === "/") rel = "/index.html";

  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== PUBLIC_DIR) {
    res.writeHead(403);
    return res.end();
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
});

if (!API_KEY) console.warn("Warning: ANTHROPIC_API_KEY is not set. Generation will fail until it is.");
ensureDataDir();
server.listen(PORT, () => console.log(`Richard AI Studio running on port ${PORT}`));
