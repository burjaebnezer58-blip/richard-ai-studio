// Richard AI - Educational Content Studio server
// Node.js 18+. No npm packages required.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.STUDIO_MODEL || "claude-sonnet-5-5";
const MAX_PROMPT_CHARS = 8000;
const MAX_TOKENS = 4000;
const PUBLIC_DIR = path.join(__dirname, "public");

const SYSTEM = "You are an expert curriculum designer, teacher trainer, and educational content strategist. Write accurate, age-appropriate, syllabus-aligned instructional materials that teachers can use directly. Use clear headings, numbered sections, and professional formatting. Do not invent curriculum codes or assessment facts you are unsure of; say so instead.";

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
  return (data.content || [])
    .filter(item => item.type === "text")
    .map(item => item.text)
    .join("\n");
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

const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];

  if (req.method === "GET" && url === "/health") {
    return sendJson(res, 200, { ok: true, model: MODEL });
  }

  if (req.method === "POST" && url === "/api/generate") {
    if (!API_KEY) {
      return sendJson(res, 500, { error: "Server is missing ANTHROPIC_API_KEY." });
    }

    if (!rateOk(req.socket.remoteAddress)) {
      return sendJson(res, 429, { error: "Too many requests. Wait a minute and try again." });
    }

    let body = "";
    req.on("data", c => {
      body += c;
      if (body.length > 20000) req.destroy();
    });

    req.on("end", async () => {
      let prompt;
      try {
        prompt = JSON.parse(body).prompt;
      } catch {
        return sendJson(res, 400, { error: "Invalid JSON." });
      }

      if (typeof prompt !== "string" || !prompt.trim()) {
        return sendJson(res, 400, { error: "Prompt is required." });
      }

      if (prompt.length > MAX_PROMPT_CHARS) {
        return sendJson(res, 400, { error: "Prompt is too long." });
      }

      try {
        const text = await generate(prompt);
        return sendJson(res, 200, { text });
      } catch (e) {
        console.error(e);
        return sendJson(res, 502, { error: "Generation failed. Please try again." });
      }
    });
    return;
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

if (!API_KEY) {
  console.warn("Warning: ANTHROPIC_API_KEY is not set. Generation will fail until it is.");
}

server.listen(PORT, () => console.log(`Richard AI Studio running on port ${PORT}`));
