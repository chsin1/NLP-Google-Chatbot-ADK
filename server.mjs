import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "127.0.0.1";

const staticTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function classifyIntentFallback(message = "") {
  const text = message.toLowerCase();
  if (/(human|agent|representative|person)/.test(text)) return "human_handoff";
  if (/(bundle|pack)/.test(text)) return "bundle";
  if (/(internet|fibe|wifi|home net)/.test(text)) return "home internet";
  if (/(landline|home phone|phone line)/.test(text)) return "landline";
  return "mobility";
}

async function classifyIntentLLM(message = "") {
  if (!process.env.OPENAI_API_KEY) {
    return classifyIntentFallback(message);
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content:
              "Classify telecom shopping intent. Return one label only: mobility, home internet, landline, bundle, human_handoff."
          },
          { role: "user", content: message }
        ]
      })
    });

    if (!response.ok) {
      return classifyIntentFallback(message);
    }

    const data = await response.json();
    const output = (data.output_text || "").trim().toLowerCase();
    if (["mobility", "home internet", "landline", "bundle", "human_handoff"].includes(output)) {
      return output;
    }

    return classifyIntentFallback(output || message);
  } catch {
    return classifyIntentFallback(message);
  }
}

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST" && url.pathname === "/api/intent") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", async () => {
      try {
        const parsed = JSON.parse(body || "{}");
        const intent = await classifyIntentLLM(parsed.message || "");
        json(res, 200, { intent });
      } catch {
        json(res, 400, { error: "Invalid JSON body" });
      }
    });
    return;
  }

  if (req.method !== "GET") {
    json(res, 405, { error: "Method Not Allowed" });
    return;
  }

  let pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const fullPath = path.join(__dirname, pathname);

  try {
    const file = await readFile(fullPath);
    const ext = path.extname(fullPath);
    res.writeHead(200, {
      "Content-Type": staticTypes[ext] || "application/octet-stream"
    });
    res.end(file);
  } catch {
    json(res, 404, { error: "Not Found" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});
