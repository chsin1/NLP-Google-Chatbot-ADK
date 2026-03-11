import { createServer } from "node:http";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const LOG_DIR = path.join(__dirname, "logs");
const LOG_FILES = {
  info: path.join(LOG_DIR, "app-events.log"),
  error: path.join(LOG_DIR, "app-errors.log"),
  qa: path.join(LOG_DIR, "qa-checklist.log")
};

const staticTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const mockAddresses = [
  { id: "a1", line1: "210 - 100 Galt Ave", city: "Toronto", province: "ON", postalCode: "M4M 2Z1", areaCode: "416" },
  { id: "a2", line1: "45 Front St W", city: "Toronto", province: "ON", postalCode: "M5J 1E6", areaCode: "416" },
  { id: "a3", line1: "88 Queen St E", city: "Toronto", province: "ON", postalCode: "M5C 1S1", areaCode: "647" },
  { id: "a4", line1: "12 Granville St", city: "Toronto", province: "ON", postalCode: "M5B 1J1", areaCode: "647" },
  { id: "a5", line1: "320 Lakeshore Blvd", city: "Toronto", province: "ON", postalCode: "M5V 1A1", areaCode: "986" },
  { id: "a6", line1: "5 Yonge St", city: "Toronto", province: "ON", postalCode: "M5E 1W7", areaCode: "986" }
];

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

async function writeLog(level, payload = {}) {
  const logLevel = level === "error" ? "error" : level === "qa" ? "qa" : "info";
  await mkdir(LOG_DIR, { recursive: true });
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level: logLevel,
    ...payload
  });
  await appendFile(LOG_FILES[logLevel], `${line}\n`, "utf8");
}

function rankAddressSuggestions(query = "", areaCode = "") {
  const normQuery = query.trim().toLowerCase();
  const filteredByArea = areaCode ? mockAddresses.filter((item) => item.areaCode === areaCode) : mockAddresses;

  if (!normQuery) {
    return filteredByArea.slice(0, 5);
  }

  const score = (item) => {
    const haystack = `${item.line1} ${item.city} ${item.province} ${item.postalCode}`.toLowerCase();
    if (haystack.startsWith(normQuery)) return 3;
    if (haystack.includes(normQuery)) return 2;
    return 0;
  };

  return filteredByArea
    .map((item) => ({ item, rank: score(item) }))
    .filter((x) => x.rank > 0)
    .sort((a, b) => b.rank - a.rank)
    .map((x) => x.item)
    .slice(0, 5);
}

function collectRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST" && url.pathname === "/api/log") {
    try {
      const parsed = await collectRequestBody(req);
      await writeLog(parsed.level, {
        event: parsed.event || "unknown_event",
        details: parsed.details || {}
      });
      json(res, 200, { ok: true });
    } catch {
      json(res, 400, { error: "Invalid log payload" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/intent") {
    try {
      const parsed = await collectRequestBody(req);
      const intent = await classifyIntentLLM(parsed.message || "");
      json(res, 200, { intent });
    } catch {
      json(res, 400, { error: "Invalid JSON body" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/address-lookup") {
    try {
      const parsed = await collectRequestBody(req);
      const suggestions = rankAddressSuggestions(parsed.query || "", parsed.areaCode || "");
      json(res, 200, { suggestions });
    } catch {
      json(res, 400, { error: "Invalid JSON body" });
    }
    return;
  }

  if (req.method !== "GET") {
    json(res, 405, { error: "Method Not Allowed" });
    return;
  }

  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
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
