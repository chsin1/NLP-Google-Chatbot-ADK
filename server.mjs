import { createServer } from "node:http";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyIntentFallbackDetailed, extractIntentEntities } from "./shared/flow-utils.mjs";
import { buildMetrics, parseJsonLines } from "./shared/metrics-utils.mjs";
import { buildQuotePreview } from "./shared/quote-utils.mjs";
import { buildHandoffSummary, buildTranscriptHtml } from "./shared/conversation-utils.mjs";
import { resolveAddressSuggestions } from "./shared/address-lookup-utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env.local");
  if (!existsSync(envPath)) return;
  try {
    const raw = readFileSync(envPath, "utf8");
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .forEach((line) => {
        const idx = line.indexOf("=");
        if (idx <= 0) return;
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
        if (!process.env[key]) {
          process.env[key] = value;
        }
      });
  } catch {
    // Local env loading must never stop startup.
  }
}

loadLocalEnv();

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const LOG_DIR = path.join(__dirname, "logs");
const LOG_FILES = {
  info: path.join(LOG_DIR, "app-events.log"),
  error: path.join(LOG_DIR, "app-errors.log"),
  qa: path.join(LOG_DIR, "qa-checklist.log"),
  llmUsage: path.resolve(__dirname, process.env.LLM_USAGE_LOG_PATH || "./logs/llm-usage.log")
};

const staticTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

const LLM_ENABLED = String(process.env.LLM_ENABLED || "true").toLowerCase() !== "false";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const ADDRESS_PROVIDER = (process.env.ADDRESS_PROVIDER || "mock").toLowerCase();
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";

const LLM_COST_PER_1K = {
  "gpt-4.1-mini": { input: 0.0004, output: 0.0016 }
};

const llmHealth = {
  configured: Boolean(process.env.OPENAI_API_KEY) && LLM_ENABLED,
  connected: false,
  model: OPENAI_MODEL,
  lastCheckedAt: null,
  lastError: null
};

function getFallbackAssistText(task = "", payload = {}) {
  const userMessage = String(payload.userMessage || "").trim();
  switch (task) {
    case "discovery_prompt":
      return "I can help you compare internet, mobility, and landline options. What is your top priority right now?";
    case "summary":
      return `Summary: ${userMessage || "Customer reviewed offers and asked to continue."}`;
    case "explain_recommendation":
      return "Based on your stated preference, this recommendation balances value and performance while matching your selected service.";
    case "translate":
      return userMessage || "I can continue in English or French.";
    case "handoff_summary":
      return `Handoff summary: customer needs support with ${payload.step || "current step"} and asked for clarification.`;
    case "intent_entities":
      return "I understood your request. I can now map it to the next step.";
    default:
      return userMessage || "I can help with that. Tell me what matters most and I will guide you step by step.";
  }
}

function estimateCostCad(model, usage = {}) {
  const pricing = LLM_COST_PER_1K[model];
  if (!pricing) return 0;
  const inputTokens = Number(usage.inputTokens || 0);
  const outputTokens = Number(usage.outputTokens || 0);
  const inputCost = (inputTokens / 1000) * pricing.input;
  const outputCost = (outputTokens / 1000) * pricing.output;
  return Number((inputCost + outputCost).toFixed(6));
}

async function writeLlmUsage(payload = {}) {
  await mkdir(path.dirname(LOG_FILES.llmUsage), { recursive: true });
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    ...payload
  });
  await appendFile(LOG_FILES.llmUsage, `${line}\n`, "utf8");
}

function buildAssistSystemPrompt(task = "") {
  const base =
    "You are Belinda, a telecom sales assistant. Be concise, helpful, converstaional and professional. Suggest next steps in for clients when they are blocked " +
    "You may improve phrasing, clarify intent, summarize, and explain recommendations. " +
    "Do not invent or override authoritative business data.";
  const guardrails =
    "Never provide authoritative values for exact pricing, promo eligibility, credit decisions, contract terms, inventory counts, billing balances, order confirmation, or payment execution. " +
    "Only rephrase deterministic values supplied in input.";
  if (task === "intent_entities") {
    return `${base} ${guardrails} Return strict JSON with keys: text, intent, entities, confidence, language.`;
  }
  return `${base} ${guardrails}`;
}

async function callOpenAIResponses({
  task = "fluency",
  sessionId = null,
  step = null,
  userMessage = "",
  context = {},
  deterministicData = {},
  endpoint = "/api/chat-assist"
} = {}) {
  const hasKey = Boolean(process.env.OPENAI_API_KEY) && LLM_ENABLED;
  if (!hasKey) {
    llmHealth.configured = false;
    llmHealth.connected = false;
    llmHealth.lastCheckedAt = new Date().toISOString();
    llmHealth.lastError = "OPENAI_API_KEY missing or LLM disabled";
    await writeLlmUsage({
      sessionId,
      endpoint,
      model: OPENAI_MODEL,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostCad: 0,
      mode: "fallback"
    });
    return {
      ok: false,
      mode: "template_fallback",
      data: null,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
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
        model: OPENAI_MODEL,
        input: [
          {
            role: "system",
            content: buildAssistSystemPrompt(task)
          },
          {
            role: "user",
            content: JSON.stringify({
              task,
              step,
              userMessage,
              context,
              deterministicData
            })
          }
        ]
      })
    });

    if (!response.ok) {
      llmHealth.configured = true;
      llmHealth.connected = false;
      llmHealth.lastCheckedAt = new Date().toISOString();
      llmHealth.lastError = `LLM HTTP ${response.status}`;
      await writeLlmUsage({
        sessionId,
        endpoint,
        model: OPENAI_MODEL,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostCad: 0,
        mode: "fallback"
      });
      return {
        ok: false,
        mode: "template_fallback",
        data: null,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
      };
    }

    const data = await response.json();
    const usage = {
      inputTokens: Number(data.usage?.input_tokens || 0),
      outputTokens: Number(data.usage?.output_tokens || 0),
      totalTokens: Number(data.usage?.total_tokens || 0)
    };
    await writeLlmUsage({
      sessionId,
      endpoint,
      model: OPENAI_MODEL,
      ...usage,
      estimatedCostCad: estimateCostCad(OPENAI_MODEL, usage),
      mode: "llm"
    });
    llmHealth.configured = true;
    llmHealth.connected = true;
    llmHealth.lastCheckedAt = new Date().toISOString();
    llmHealth.lastError = null;

    return {
      ok: true,
      mode: "llm",
      data,
      usage
    };
  } catch (error) {
    llmHealth.configured = true;
    llmHealth.connected = false;
    llmHealth.lastCheckedAt = new Date().toISOString();
    llmHealth.lastError = String(error?.message || "LLM call failed");
    await writeLlmUsage({
      sessionId,
      endpoint,
      model: OPENAI_MODEL,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostCad: 0,
      mode: "fallback"
    });
    return {
      ok: false,
      mode: "template_fallback",
      data: null,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    };
  }
}

async function classifyIntentLLM(message = "") {
  const entities = extractIntentEntities(message);
  if (!process.env.OPENAI_API_KEY || !LLM_ENABLED) {
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
    const result = await callOpenAIResponses({
      task: "intent_entities",
      userMessage: message,
      deterministicData: {
        allowedIntents: ["mobility", "home internet", "landline", "bundle", "human_handoff"]
      },
      endpoint: "/api/intent"
    });
    if (!result.ok || !result.data) {
      const fallback = classifyIntentFallbackDetailed(message);
      return {
        intent: fallback.intent,
        confidence: fallback.confidence,
        entities,
        mode: "llm_error_fallback",
        fallbackUsed: true
      };
    }
    const data = result.data;
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

async function checkLlmHealth({ force = false } = {}) {
  const now = Date.now();
  const lastCheckedMs = llmHealth.lastCheckedAt ? new Date(llmHealth.lastCheckedAt).getTime() : 0;
  if (!force && lastCheckedMs && now - lastCheckedMs < 20_000) {
    return llmHealth;
  }
  if (!process.env.OPENAI_API_KEY || !LLM_ENABLED) {
    llmHealth.configured = false;
    llmHealth.connected = false;
    llmHealth.lastCheckedAt = new Date().toISOString();
    llmHealth.lastError = "OPENAI_API_KEY missing or LLM disabled";
    return llmHealth;
  }

  const ping = await callOpenAIResponses({
    task: "summary",
    userMessage: "health check",
    deterministicData: { ping: true },
    endpoint: "/api/llm-health"
  });
  if (ping.ok) {
    llmHealth.configured = true;
    llmHealth.connected = true;
    llmHealth.lastCheckedAt = new Date().toISOString();
    llmHealth.lastError = null;
    return llmHealth;
  }
  llmHealth.configured = true;
  llmHealth.connected = false;
  llmHealth.lastCheckedAt = new Date().toISOString();
  llmHealth.lastError = llmHealth.lastError || "LLM ping failed";
  return llmHealth;
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

function summarizeLlmUsage(records = []) {
  if (!Array.isArray(records) || records.length === 0) {
    return {
      totalCalls: 0,
      avgTokensPerSession: 0,
      fallbackRatePercent: 0
    };
  }
  const bySession = new Map();
  let fallbackCount = 0;
  let totalTokens = 0;
  records.forEach((record) => {
    const sessionId = record.sessionId || "unknown";
    const session = bySession.get(sessionId) || { tokens: 0, calls: 0 };
    session.tokens += Number(record.totalTokens || 0);
    session.calls += 1;
    bySession.set(sessionId, session);
    totalTokens += Number(record.totalTokens || 0);
    if (record.mode === "fallback") fallbackCount += 1;
  });
  const totalCalls = records.length;
  const avgTokensPerSession = bySession.size ? Number((totalTokens / bySession.size).toFixed(2)) : 0;
  const fallbackRatePercent = Number(((fallbackCount / totalCalls) * 100).toFixed(2));
  return {
    totalCalls,
    avgTokensPerSession,
    fallbackRatePercent
  };
}

function toIsoDate(value) {
  try {
    return new Date(value).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function normalizeTranscriptMessages(messages = []) {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((message, idx) => ({
      role: message?.role === "user" ? "user" : "bot",
      text: String(message?.text || "").trim(),
      ts: toIsoDate(message?.ts || Date.now() + idx)
    }))
    .filter((message) => Boolean(message.text));
}

function deriveServiceType(value = "") {
  const lower = String(value || "").toLowerCase();
  if (lower.includes("mob")) return "mobility";
  if (lower.includes("land")) return "landline";
  return "internet";
}

function derivePostalPrefix(postalCode = "") {
  const cleaned = String(postalCode || "").trim().toUpperCase().replace(/\s+/g, "");
  const match = cleaned.match(/^[A-Z]\d[A-Z]/);
  return match ? match[0] : "M5V";
}

function buildInstallSlots({ postalCode = "", serviceType = "internet" } = {}) {
  const normalizedService = deriveServiceType(serviceType);
  const prefix = derivePostalPrefix(postalCode);
  const windows = [
    { id: "am", label: "9:00 AM - 11:00 AM" },
    { id: "mid", label: "12:30 PM - 2:30 PM" },
    { id: "eve", label: "5:30 PM - 7:30 PM" }
  ];
  const slots = [];
  const now = new Date();
  let dayOffset = 1;
  while (slots.length < 8 && dayOffset <= 28) {
    const d = new Date(now);
    d.setDate(now.getDate() + dayOffset);
    const weekday = d.getDay();
    dayOffset += 1;
    if (weekday === 0 || weekday === 5 || weekday === 6) continue;
    const date = d.toISOString().slice(0, 10);
    windows.forEach((window, index) => {
      if (slots.length >= 8) return;
      slots.push({
        slotId: `${normalizedService}-${date}-${window.id}`,
        serviceType: normalizedService,
        date,
        window: window.label,
        technicianRegion: `${prefix}-${(index + 1) * 3}`,
        available: true
      });
    });
  }
  return slots;
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

  if (req.method === "POST" && url.pathname === "/api/chat-assist") {
    try {
      const parsed = await collectRequestBody(req);
      const task = String(parsed.task || "fluency");
      const step = String(parsed.step || "");
      const userMessage = String(parsed.userMessage || "");
      const context = parsed.context || {};
      const deterministicData = parsed.deterministicData || {};

      const result = await callOpenAIResponses({
        task,
        step,
        userMessage,
        context,
        deterministicData,
        sessionId: parsed.sessionId || context.sessionId || null,
        endpoint: "/api/chat-assist"
      });

      if (!result.ok || !result.data) {
        json(res, 200, {
          text: getFallbackAssistText(task, { userMessage, step, context, deterministicData }),
          intent: null,
          entities: {},
          language: null,
          confidence: 0.55,
          mode: "template_fallback",
          fallbackUsed: true
        });
        return;
      }

      json(res, 200, {
        text: String(result.data.output_text || "").trim() || getFallbackAssistText(task, { userMessage, step }),
        intent: null,
        entities: {},
        language: null,
        confidence: 0.85,
        mode: "llm",
        fallbackUsed: false
      });
    } catch {
      json(res, 400, { error: "Invalid chat assist payload" });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/llm-health") {
    const status = await checkLlmHealth();
    json(res, 200, status);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/address-lookup-status") {
    const provider = ADDRESS_PROVIDER;
    json(res, 200, {
      provider,
      googleConfigured: Boolean(GOOGLE_PLACES_API_KEY),
      torontoBiasEnabled: provider === "google" || provider === "hybrid",
      manualFallbackEnabled: true
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/address-lookup") {
    try {
      const parsed = await collectRequestBody(req);
      const suggestions = await resolveAddressSuggestions({
        query: parsed.query || "",
        areaCode: parsed.areaCode || "",
        provider: ADDRESS_PROVIDER,
        apiKey: GOOGLE_PLACES_API_KEY,
        log: async ({ level = "info", event = "address_lookup", details = {} } = {}) => {
          await writeLog(level, {
            event,
            details: {
              provider: ADDRESS_PROVIDER,
              ...details
            }
          });
        }
      });
      json(res, 200, { suggestions });
    } catch {
      json(res, 400, { error: "Invalid JSON body" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/quote-preview") {
    try {
      const parsed = await collectRequestBody(req);
      const payload = buildQuotePreview({
        serviceType: parsed.serviceType || "home internet",
        preferences: parsed.preferences || {},
        offers: parsed.offers || [],
        maxResults: parsed.maxResults || 3
      });
      json(res, 200, payload);
    } catch {
      json(res, 400, { error: "Invalid quote preview payload" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/handoff-summary") {
    try {
      const parsed = await collectRequestBody(req);
      const sessionId = parsed.sessionId || parsed.context?.sessionId || null;
      const messages = normalizeTranscriptMessages(parsed.messages || []);
      const context = parsed.context || {};
      const currentStep = String(parsed.currentStep || "");
      const deterministicSummary = buildHandoffSummary({
        sessionId,
        messages,
        context,
        currentStep
      });
      const assist = await callOpenAIResponses({
        task: "handoff_summary",
        sessionId,
        step: currentStep,
        userMessage: messages[messages.length - 1]?.text || "handoff requested",
        context,
        deterministicData: deterministicSummary,
        endpoint: "/api/handoff-summary"
      });
      const summaryText = assist.ok && assist.data?.output_text
        ? String(assist.data.output_text).trim()
        : deterministicSummary.summaryText;
      await writeLog("info", {
        event: "handoff_summary_generated",
        details: {
          sessionId,
          currentStep,
          route: deterministicSummary.summaryJson?.route || "sales"
        }
      });
      json(res, 200, {
        summaryText,
        summaryJson: deterministicSummary.summaryJson,
        mode: assist.ok ? "llm" : "template_fallback"
      });
    } catch {
      json(res, 400, { error: "Invalid handoff summary payload" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/transcript-export") {
    try {
      const parsed = await collectRequestBody(req);
      const sessionId = parsed.sessionId || parsed.context?.sessionId || "session";
      const context = parsed.context || {};
      const normalizedMessages = normalizeTranscriptMessages(parsed.messages || []);
      const messages =
        normalizedMessages.length > 0
          ? normalizedMessages
          : [
              {
                role: "system",
                text: "Session opened. No chat messages captured yet.",
                ts: new Date().toISOString()
              }
            ];
      const fileNameBase = `bell-chat-${String(sessionId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "session"}`;
      const summary = buildHandoffSummary({
        sessionId,
        messages,
        context,
        currentStep: parsed.currentStep || context.flowStep || ""
      });
      const htmlPrintable = buildTranscriptHtml({
        sessionId,
        context,
        messages,
        summary
      });
      const jsonPayload = {
        sessionId,
        exportedAt: new Date().toISOString(),
        context,
        summary: summary.summaryJson,
        messages
      };
      await writeLog("info", {
        event: "transcript_export_generated",
        details: {
          sessionId,
          messageCount: messages.length
        }
      });
      json(res, 200, {
        htmlPrintable,
        jsonPayload,
        fileNameBase
      });
    } catch {
      json(res, 400, { error: "Invalid transcript export payload" });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/install-slots") {
    const postalCode = url.searchParams.get("postalCode") || "";
    const serviceType = url.searchParams.get("serviceType") || "internet";
    const slots = buildInstallSlots({ postalCode, serviceType });
    json(res, 200, {
      serviceType: deriveServiceType(serviceType),
      postalCode,
      slots
    });
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
      const llmUsage = await readLogLines(LOG_FILES.llmUsage);
      const metrics = buildMetrics(events, errors, qa, { days, since, until });
      metrics.llmUsage = summarizeLlmUsage(llmUsage);
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
