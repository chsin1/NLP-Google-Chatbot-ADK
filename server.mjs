import { createServer } from "node:http";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyIntentFallbackDetailed, extractIntentEntities, rankAddressSuggestions } from "./shared/flow-utils.mjs";
import { buildMetrics, parseJsonLines } from "./shared/metrics-utils.mjs";

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
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

async function classifyIntentLLM(message = "") {
  const entities = extractIntentEntities(message);
  if (!process.env.OPENAI_API_KEY) {
    const fallback = classifyIntentFallbackDetailed(message);
    return {
      intent: fallback.intent,
      confidence: fallback.confidence,
      entities,
      mode: "template_fallback",
      fallbackUsed: true
    };
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
      const fallback = classifyIntentFallbackDetailed(message);
      return {
        intent: fallback.intent,
        confidence: fallback.confidence,
        entities,
        mode: "llm_error_fallback",
        fallbackUsed: true
      };
    }

    const data = await response.json();
    const output = (data.output_text || "").trim().toLowerCase();
    if (["mobility", "home internet", "landline", "bundle", "human_handoff"].includes(output)) {
      return {
        intent: output,
        confidence: 0.9,
        entities,
        mode: "llm",
        fallbackUsed: false
      };
    }

    const fallback = classifyIntentFallbackDetailed(output || message);
    return {
      intent: fallback.intent,
      confidence: fallback.confidence,
      entities,
      mode: "llm_parse_fallback",
      fallbackUsed: true
    };
  } catch {
    const fallback = classifyIntentFallbackDetailed(message);
    return {
      intent: fallback.intent,
      confidence: fallback.confidence,
      entities,
      mode: "llm_exception_fallback",
      fallbackUsed: true
    };
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

async function readLogLines(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    return parseJsonLines(raw);
  } catch {
    return [];
  }
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
      const result = await classifyIntentLLM(parsed.message || "");
      json(res, 200, result);
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

  if (req.method === "GET" && url.pathname === "/api/metrics") {
    try {
      const days = Number(url.searchParams.get("days") || 30);
      const since = url.searchParams.get("since");
      const until = url.searchParams.get("until");
      const events = await readLogLines(LOG_FILES.info);
      const errors = await readLogLines(LOG_FILES.error);
      const qa = await readLogLines(LOG_FILES.qa);
      const metrics = buildMetrics(events, errors, qa, { days, since, until });
      json(res, 200, metrics);
    } catch {
      json(res, 500, { error: "Unable to compute metrics" });
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
