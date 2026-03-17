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
import { redactSensitiveObject, redactSensitiveText, hasRawSensitivePaymentData } from "./shared/privacy-utils.mjs";
import { buildPostIntakePayload, sendPostIntakeWebhook } from "./shared/automation-utils.mjs";
import { routeAgentTask } from "./shared/agent-router-utils.mjs";
import { startTrace, buildTraceEvent, finishTrace } from "./shared/trace-utils.mjs";
import { findNearbyLocations } from "./src/server/finder/finder-service.mjs";
import {
  PROMPT_VERSION,
  SAFETY_POLICY_VERSION,
  getSafetyFallbackReply,
  screenInputSafety,
  screenOutputSafety
} from "./shared/ai-safety-utils.mjs";

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
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "";
const FINDER_DEFAULT_RADIUS_METERS = Number(process.env.FINDER_DEFAULT_RADIUS_METERS || 8000);
const SSE_ASSIST_ENABLED = String(process.env.SSE_ASSIST_ENABLED || "true").toLowerCase() !== "false";
const TRACE_FORWARDING_ENABLED = String(process.env.LANGSMITH_TRACING_ENABLED || "false").toLowerCase() === "true";
const TRACE_FORWARDING_ENDPOINT = process.env.LANGSMITH_ENDPOINT || "";
const TRACE_FORWARDING_API_KEY = process.env.LANGSMITH_API_KEY || "";
const COMPLIANCE_STRICT_REDACTION = true;

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
    promptVersion: PROMPT_VERSION,
    safetyPolicyVersion: SAFETY_POLICY_VERSION,
    ...redactSensitiveObject(payload, { strict: COMPLIANCE_STRICT_REDACTION })
  });
  await appendFile(LOG_FILES.llmUsage, `${line}\n`, "utf8");
}

function sanitizePayload(payload = {}) {
  return redactSensitiveObject(payload, { strict: COMPLIANCE_STRICT_REDACTION });
}

function sanitizeMessages(messages = []) {
  if (!Array.isArray(messages)) return [];
  return messages.map((message) => ({
    role: message?.role === "user" ? "user" : "bot",
    text: redactSensitiveText(String(message?.text || ""), { strict: COMPLIANCE_STRICT_REDACTION }),
    ts: message?.ts || new Date().toISOString()
  }));
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
  const safetyInput = screenInputSafety(message);
  if (safetyInput.safetyAction === "block") {
    const fallback = classifyIntentFallbackDetailed(message);
    await writeLog("error", {
      event: "safety_input_blocked",
      details: {
        endpoint: "/api/intent",
        policyCategory: safetyInput.policyCategory,
        promptVersion: PROMPT_VERSION,
        safetyPolicyVersion: SAFETY_POLICY_VERSION
      }
    });
    return {
      intent: fallback.intent,
      confidence: fallback.confidence,
      entities: extractIntentEntities(message),
      mode: "safety_block",
      fallbackUsed: true,
      policyCategory: safetyInput.policyCategory,
      safetyAction: "block"
    };
  }

  const entities = extractIntentEntities(message);
  if (!process.env.OPENAI_API_KEY || !LLM_ENABLED) {
    const fallback = classifyIntentFallbackDetailed(message);
    return {
      intent: fallback.intent,
      confidence: fallback.confidence,
      entities,
      mode: "template_fallback",
      fallbackUsed: true,
      policyCategory: safetyInput.policyCategory,
      safetyAction: safetyInput.safetyAction === "warn" ? "warn" : "allow"
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
        fallbackUsed: true,
        policyCategory: safetyInput.policyCategory,
        safetyAction: safetyInput.safetyAction === "warn" ? "warn" : "allow"
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
        fallbackUsed: false,
        policyCategory: safetyInput.policyCategory,
        safetyAction: safetyInput.safetyAction === "warn" ? "warn" : "allow"
      };
    }

    const fallback = classifyIntentFallbackDetailed(output || message);
    return {
      intent: fallback.intent,
      confidence: fallback.confidence,
      entities,
      mode: "llm_parse_fallback",
      fallbackUsed: true,
      policyCategory: safetyInput.policyCategory,
      safetyAction: safetyInput.safetyAction === "warn" ? "warn" : "allow"
    };
  } catch {
    const fallback = classifyIntentFallbackDetailed(message);
    return {
      intent: fallback.intent,
      confidence: fallback.confidence,
      entities,
      mode: "llm_exception_fallback",
      fallbackUsed: true,
      policyCategory: safetyInput.policyCategory,
      safetyAction: safetyInput.safetyAction === "warn" ? "warn" : "allow"
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
  const safePayload = sanitizePayload(payload);
  const payloadWithVersions = {
    ...safePayload,
    promptVersion: PROMPT_VERSION,
    safetyPolicyVersion: SAFETY_POLICY_VERSION
  };
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level: logLevel,
    ...payloadWithVersions
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

async function forwardTraceEvent(traceEvent = {}) {
  if (!TRACE_FORWARDING_ENABLED || !TRACE_FORWARDING_ENDPOINT) return;
  try {
    await fetch(TRACE_FORWARDING_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(TRACE_FORWARDING_API_KEY ? { Authorization: `Bearer ${TRACE_FORWARDING_API_KEY}` } : {})
      },
      body: JSON.stringify(traceEvent)
    });
  } catch {
    // Trace forwarding is best-effort only.
  }
}

async function logTrace(level = "info", traceEvent = {}) {
  await writeLog(level, {
    event: "trace_event",
    details: traceEvent
  });
  await forwardTraceEvent(traceEvent);
}

function toNumber(value, fallback = null) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function sseWrite(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload || {})}\n\n`);
}

function buildAssistInputEnvelope({ task = "", step = "", userMessage = "", context = {}, deterministicData = {} } = {}) {
  return JSON.stringify({
    task,
    step,
    userMessage,
    context,
    deterministicData
  });
}

function extractOpenAIStreamToken(payload = {}) {
  if (typeof payload?.delta === "string") return payload.delta;
  if (typeof payload?.text_delta === "string") return payload.text_delta;
  if (payload?.type === "response.output_text.delta" && typeof payload?.delta === "string") return payload.delta;
  if (Array.isArray(payload?.delta)) {
    return payload.delta
      .map((item) => (typeof item === "string" ? item : item?.text || ""))
      .join("");
  }
  return "";
}

async function streamOpenAiAssist({
  res,
  task = "",
  step = "",
  userMessage = "",
  context = {},
  deterministicData = {},
  trace = null
} = {}) {
  if (!process.env.OPENAI_API_KEY || !LLM_ENABLED) {
    return { ok: false, mode: "template_fallback", text: "" };
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let idleTimer = null;
  const resetIdleTimer = () => {
    if (!controller) return;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      try {
        controller.abort();
      } catch {
        // ignore
      }
    }, 12000);
  };
  resetIdleTimer();
  let fullText = "";

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        stream: true,
        input: [
          {
            role: "system",
            content: buildAssistSystemPrompt(task)
          },
          {
            role: "user",
            content: buildAssistInputEnvelope({ task, step, userMessage, context, deterministicData })
          }
        ]
      }),
      signal: controller?.signal
    });
    if (!response.ok || !response.body || typeof response.body.getReader !== "function") {
      return { ok: false, mode: "template_fallback", text: "" };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      resetIdleTimer();
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith("data:")) {
          newline = buffer.indexOf("\n");
          continue;
        }
        const raw = line.slice(5).trim();
        if (!raw || raw === "[DONE]") {
          newline = buffer.indexOf("\n");
          continue;
        }
        let payload = null;
        try {
          payload = JSON.parse(raw);
        } catch {
          payload = null;
        }
        if (!payload) {
          newline = buffer.indexOf("\n");
          continue;
        }
        const token = extractOpenAIStreamToken(payload);
        if (token) {
          fullText += token;
          sseWrite(res, "token", {
            token,
            mode: "llm_stream",
            traceId: trace?.traceId || null
          });
        }
        newline = buffer.indexOf("\n");
      }
    }
    return {
      ok: fullText.trim().length > 0,
      mode: "llm_stream",
      text: fullText.trim()
    };
  } catch {
    return { ok: false, mode: "template_fallback", text: "" };
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
  }
}

async function streamTextFallback(res, text = "", { mode = "template_fallback", traceId = null } = {}) {
  const words = String(text || "")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "";
  let assembled = "";
  for (const word of words) {
    const token = `${word} `;
    assembled += token;
    sseWrite(res, "token", { token, mode, traceId });
    await new Promise((resolve) => setTimeout(resolve, 18));
  }
  return assembled.trim();
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
      text: redactSensitiveText(String(message?.text || "").trim(), { strict: COMPLIANCE_STRICT_REDACTION }),
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
      if (hasRawSensitivePaymentData(parsed?.details || {})) {
        await writeLog("error", {
          event: "compliance_blocked_payload",
          details: {
            endpoint: "/api/log",
            reason: "raw_payment_data_detected"
          }
        });
        json(res, 422, { error: "Payload blocked by compliance policy" });
        return;
      }
      await writeLog(parsed.level, {
        event: parsed.event || "unknown_event",
        details: sanitizePayload(parsed.details || {})
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
      const trace = startTrace({
        endpoint: "/api/intent",
        sessionId: parsed.sessionId || parsed.context?.sessionId || null,
        task: "intent_entities",
        step: parsed.step || null
      });
      await logTrace("info", buildTraceEvent(trace, "start", { model: OPENAI_MODEL }));
      const toolDecision = routeAgentTask({
        task: "intent_entities",
        step: parsed.step || "",
        userMessage: parsed.message || "",
        context: parsed.context || {}
      });
      const result = await classifyIntentLLM(parsed.message || "");
      const completed = finishTrace(trace, {
        status: "ok",
        details: {
          tool: toolDecision.tool,
          fallbackUsed: Boolean(result?.fallbackUsed)
        }
      });
      await logTrace("info", buildTraceEvent(completed, "end", completed.details));
      json(res, 200, {
        ...result,
        traceId: trace.traceId,
        agentTool: toolDecision.tool
      });
    } catch {
      json(res, 400, { error: "Invalid JSON body" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/agent-router") {
    try {
      const parsed = await collectRequestBody(req);
      const trace = startTrace({
        endpoint: "/api/agent-router",
        sessionId: parsed.sessionId || parsed.context?.sessionId || null,
        task: parsed.task || null,
        step: parsed.step || null
      });
      const decision = routeAgentTask({
        task: parsed.task || "",
        step: parsed.step || "",
        userMessage: parsed.userMessage || "",
        context: parsed.context || {}
      });
      await logTrace("info", buildTraceEvent(trace, "decision", {
        tool: decision.tool,
        reason: decision.reason,
        confidence: decision.confidence
      }));
      const done = finishTrace(trace, { status: "ok" });
      await logTrace("info", buildTraceEvent(done, "end", { durationMs: done.durationMs }));
      json(res, 200, {
        ...decision,
        traceId: trace.traceId
      });
    } catch {
      json(res, 400, { error: "Invalid agent router payload" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/chat-assist") {
    try {
      const parsed = await collectRequestBody(req);
      const task = String(parsed.task || "fluency");
      const step = String(parsed.step || "");
      const userMessage = String(parsed.userMessage || "");
      const context = sanitizePayload(parsed.context || {});
      const deterministicData = sanitizePayload(parsed.deterministicData || {});
      const trace = startTrace({
        endpoint: "/api/chat-assist",
        sessionId: parsed.sessionId || context.sessionId || null,
        task,
        step
      });
      const toolDecision = routeAgentTask({
        task,
        step,
        userMessage,
        context
      });
      await logTrace("info", buildTraceEvent(trace, "start", {
        tool: toolDecision.tool,
        model: OPENAI_MODEL
      }));
      const safetyInput = screenInputSafety(userMessage);

      if (safetyInput.safetyAction === "block") {
        await writeLog("error", {
          event: "safety_input_blocked",
          details: {
            endpoint: "/api/chat-assist",
            policyCategory: safetyInput.policyCategory
          }
        });
        json(res, 200, {
          text: getSafetyFallbackReply(safetyInput.policyCategory),
          intent: null,
          entities: {},
          language: null,
          confidence: 0.4,
          mode: "safety_block",
          fallbackUsed: true,
          policyCategory: safetyInput.policyCategory,
          safetyAction: "block",
          traceId: trace.traceId,
          agentTool: toolDecision.tool
        });
        const done = finishTrace(trace, {
          status: "blocked",
          details: { policyCategory: safetyInput.policyCategory, tool: toolDecision.tool }
        });
        await logTrace("info", buildTraceEvent(done, "end", done.details));
        return;
      }

      if (safetyInput.safetyAction === "warn") {
        await writeLog("info", {
          event: "safety_policy_violation_detected",
          details: {
            endpoint: "/api/chat-assist",
            policyCategory: safetyInput.policyCategory
          }
        });
      }

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
        await writeLog("info", {
          event: "safety_fallback_triggered",
          details: {
            endpoint: "/api/chat-assist",
            reason: "llm_unavailable"
          }
        });
        json(res, 200, {
          text: getFallbackAssistText(task, { userMessage, step, context, deterministicData }),
          intent: null,
          entities: {},
          language: null,
          confidence: 0.55,
          mode: "template_fallback",
          fallbackUsed: true,
          policyCategory: safetyInput.policyCategory,
          safetyAction: safetyInput.safetyAction === "warn" ? "warn" : "allow",
          traceId: trace.traceId,
          agentTool: toolDecision.tool
        });
        const done = finishTrace(trace, {
          status: "fallback",
          details: { reason: "llm_unavailable", tool: toolDecision.tool }
        });
        await logTrace("info", buildTraceEvent(done, "end", done.details));
        return;
      }

      const llmText = String(result.data.output_text || "").trim() || getFallbackAssistText(task, { userMessage, step });
      const outputSafety = screenOutputSafety(llmText, deterministicData);
      if (outputSafety.safetyAction === "block") {
        await writeLog("error", {
          event: "safety_output_blocked",
          details: {
            endpoint: "/api/chat-assist",
            policyCategory: outputSafety.policyCategory
          }
        });
        await writeLog("info", {
          event: "safety_fallback_triggered",
          details: {
            endpoint: "/api/chat-assist",
            reason: "output_blocked"
          }
        });
        json(res, 200, {
          text: getFallbackAssistText(task, { userMessage, step, context, deterministicData }),
          intent: null,
          entities: {},
          language: null,
          confidence: 0.6,
          mode: "template_fallback",
          fallbackUsed: true,
          policyCategory: outputSafety.policyCategory,
          safetyAction: "block",
          traceId: trace.traceId,
          agentTool: toolDecision.tool
        });
        const done = finishTrace(trace, {
          status: "fallback",
          details: { reason: "output_blocked", policyCategory: outputSafety.policyCategory, tool: toolDecision.tool }
        });
        await logTrace("info", buildTraceEvent(done, "end", done.details));
        return;
      }

      if (outputSafety.safetyAction === "warn") {
        await writeLog("info", {
          event: "safety_policy_violation_detected",
          details: {
            endpoint: "/api/chat-assist",
            policyCategory: outputSafety.policyCategory
          }
        });
      }

      json(res, 200, {
        text: llmText,
        intent: null,
        entities: {},
        language: null,
        confidence: 0.85,
        mode: "llm",
        fallbackUsed: false,
        policyCategory: outputSafety.policyCategory || safetyInput.policyCategory,
        safetyAction: outputSafety.safetyAction === "warn" || safetyInput.safetyAction === "warn" ? "warn" : "allow",
        traceId: trace.traceId,
        agentTool: toolDecision.tool
      });
      const done = finishTrace(trace, {
        status: "ok",
        details: { mode: "llm", tool: toolDecision.tool }
      });
      await logTrace("info", buildTraceEvent(done, "end", done.details));
    } catch {
      json(res, 400, { error: "Invalid chat assist payload" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/chat-assist-stream") {
    try {
      const parsed = await collectRequestBody(req);
      const task = String(parsed.task || "fluency");
      const step = String(parsed.step || "");
      const userMessage = String(parsed.userMessage || "");
      const context = sanitizePayload(parsed.context || {});
      const deterministicData = sanitizePayload(parsed.deterministicData || {});
      const trace = startTrace({
        endpoint: "/api/chat-assist-stream",
        sessionId: parsed.sessionId || context.sessionId || null,
        task,
        step
      });
      const toolDecision = routeAgentTask({
        task,
        step,
        userMessage,
        context
      });

      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      });
      if (typeof res.flushHeaders === "function") res.flushHeaders();

      sseWrite(res, "start", {
        traceId: trace.traceId,
        agentTool: toolDecision.tool,
        mode: SSE_ASSIST_ENABLED ? "stream_enabled" : "stream_disabled"
      });
      await logTrace("info", buildTraceEvent(trace, "start", {
        tool: toolDecision.tool,
        model: OPENAI_MODEL,
        sseEnabled: SSE_ASSIST_ENABLED
      }));

      const safetyInput = screenInputSafety(userMessage);
      if (safetyInput.safetyAction === "block") {
        const fallback = getSafetyFallbackReply(safetyInput.policyCategory);
        await streamTextFallback(res, fallback, {
          mode: "safety_block",
          traceId: trace.traceId
        });
        sseWrite(res, "end", {
          text: fallback,
          mode: "safety_block",
          policyCategory: safetyInput.policyCategory,
          traceId: trace.traceId,
          agentTool: toolDecision.tool
        });
        const done = finishTrace(trace, {
          status: "blocked",
          details: { policyCategory: safetyInput.policyCategory, tool: toolDecision.tool }
        });
        await logTrace("info", buildTraceEvent(done, "end", done.details));
        res.end();
        return;
      }

      let mode = "template_fallback";
      let finalText = "";
      if (SSE_ASSIST_ENABLED) {
        const streamResult = await streamOpenAiAssist({
          res,
          task,
          step,
          userMessage,
          context,
          deterministicData,
          trace
        });
        if (streamResult.ok && streamResult.text) {
          mode = streamResult.mode || "llm_stream";
          finalText = streamResult.text;
        }
      }

      if (!finalText) {
        const fallbackText = getFallbackAssistText(task, { userMessage, step, context, deterministicData });
        finalText = await streamTextFallback(res, fallbackText, {
          mode: "template_fallback",
          traceId: trace.traceId
        });
        mode = "template_fallback";
      }

      const outputSafety = screenOutputSafety(finalText, deterministicData);
      if (outputSafety.safetyAction === "block") {
        sseWrite(res, "error", {
          error: "output_blocked",
          policyCategory: outputSafety.policyCategory,
          traceId: trace.traceId
        });
        const done = finishTrace(trace, {
          status: "error",
          error: "output_blocked",
          details: { policyCategory: outputSafety.policyCategory, tool: toolDecision.tool }
        });
        await logTrace("error", buildTraceEvent(done, "end", done.details));
        res.end();
        return;
      }

      const done = finishTrace(trace, {
        status: "ok",
        details: { mode, tool: toolDecision.tool }
      });
      await logTrace("info", buildTraceEvent(done, "end", done.details));
      sseWrite(res, "end", {
        text: finalText,
        mode,
        traceId: trace.traceId,
        agentTool: toolDecision.tool,
        durationMs: done.durationMs
      });
      res.end();
    } catch (error) {
      if (!res.headersSent) {
        json(res, 400, { error: "Invalid chat assist stream payload" });
      } else {
        sseWrite(res, "error", { error: String(error?.message || "stream_failed") });
        res.end();
      }
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/llm-health") {
    const status = await checkLlmHealth();
    json(res, 200, status);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/compliance-status") {
    json(res, 200, {
      strictRedactionEnabled: COMPLIANCE_STRICT_REDACTION,
      cvcStorageDisabled: true,
      panMaskingEnabled: true,
      promptVersion: PROMPT_VERSION,
      safetyPolicyVersion: SAFETY_POLICY_VERSION
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/consent-record") {
    try {
      const parsed = await collectRequestBody(req);
      await writeLog("info", {
        event: "consent_recorded",
        details: sanitizePayload({
          sessionId: parsed.sessionId || null,
          scope: parsed.scope || "unknown",
          status: parsed.status || "unknown",
          version: parsed.version || "v1",
          locale: parsed.locale || "en",
          source: parsed.source || "chat_input"
        })
      });
      json(res, 200, { ok: true });
    } catch {
      json(res, 400, { error: "Invalid consent payload" });
    }
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
        postalCodeHint: parsed.postalCodeHint || "",
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

  if (req.method === "GET" && url.pathname === "/api/finder/nearby") {
    try {
      const trace = startTrace({
        endpoint: "/api/finder/nearby",
        sessionId: url.searchParams.get("sessionId") || null,
        task: "finder_nearby",
        step: null
      });
      const lat = toNumber(url.searchParams.get("lat"), null);
      const lng = toNumber(url.searchParams.get("lng"), null);
      const address = String(url.searchParams.get("address") || "").trim();
      const radius = toNumber(url.searchParams.get("radius"), FINDER_DEFAULT_RADIUS_METERS);
      const type = String(url.searchParams.get("type") || "store");
      if ((lat == null || lng == null) && !address) {
        json(res, 400, { error: "lat/lng or address is required" });
        return;
      }
      const payload = await findNearbyLocations({
        lat,
        lng,
        address,
        radiusMeters: radius,
        type,
        googleApiKey: GOOGLE_PLACES_API_KEY,
        log: async ({ level = "info", event = "finder_lookup", details = {} } = {}) => {
          await writeLog(level, {
            event,
            details
          });
        }
      });
      const done = finishTrace(trace, {
        status: "ok",
        details: {
          resultCount: payload.results.length,
          source: payload.source,
          reason: payload.reason || null,
          lookupMode: address ? "address" : "coordinates"
        }
      });
      await logTrace("info", buildTraceEvent(done, "end", done.details));
      json(res, 200, {
        ...payload,
        traceId: trace.traceId
      });
    } catch {
      json(res, 500, { error: "finder_unavailable" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/automations/post-intake") {
    try {
      const parsed = await collectRequestBody(req);
      const sessionId = parsed.sessionId || parsed.context?.sessionId || null;
      const context = sanitizePayload(parsed.context || {});
      const messages = sanitizeMessages(normalizeTranscriptMessages(parsed.messages || []));
      const currentStep = String(parsed.currentStep || "");
      const trace = startTrace({
        endpoint: "/api/automations/post-intake",
        sessionId,
        task: "post_intake",
        step: currentStep
      });
      const toolDecision = routeAgentTask({
        task: "post_intake",
        step: currentStep,
        userMessage: messages[messages.length - 1]?.text || "",
        context
      });
      const payload = buildPostIntakePayload({
        sessionId,
        context,
        currentStep,
        transcript: messages
      });
      if (!payload.intakeComplete) {
        const done = finishTrace(trace, {
          status: "skipped",
          details: { reason: "intake_incomplete", tool: toolDecision.tool }
        });
        await logTrace("info", buildTraceEvent(done, "end", done.details));
        json(res, 200, {
          ok: true,
          fired: false,
          reason: "intake_incomplete",
          traceId: trace.traceId,
          agentTool: toolDecision.tool
        });
        return;
      }

      const webhookResult = await sendPostIntakeWebhook(payload, N8N_WEBHOOK_URL);
      if (!webhookResult.ok) {
        await writeLog("error", {
          event: "post_intake_webhook_failed",
          details: {
            sessionId,
            error: webhookResult.error || "unknown"
          }
        });
      } else if (webhookResult.fired) {
        await writeLog("info", {
          event: "post_intake_webhook_fired",
          details: {
            sessionId
          }
        });
      }
      const done = finishTrace(trace, {
        status: webhookResult.ok ? "ok" : "error",
        error: webhookResult.ok ? null : webhookResult.error,
        details: { fired: webhookResult.fired, tool: toolDecision.tool }
      });
      await logTrace(webhookResult.ok ? "info" : "error", buildTraceEvent(done, "end", done.details));
      json(res, 200, {
        ...webhookResult,
        traceId: trace.traceId,
        agentTool: toolDecision.tool
      });
    } catch {
      json(res, 400, { error: "Invalid post-intake automation payload" });
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
      const messages = sanitizeMessages(normalizeTranscriptMessages(parsed.messages || []));
      const context = sanitizePayload(parsed.context || {});
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
      if (hasRawSensitivePaymentData({ summaryText, summaryJson: deterministicSummary.summaryJson })) {
        await writeLog("error", {
          event: "compliance_blocked_payload",
          details: {
            endpoint: "/api/handoff-summary",
            reason: "raw_payment_data_detected"
          }
        });
        json(res, 422, { error: "Handoff payload blocked by compliance policy" });
        return;
      }
      await writeLog("info", {
        event: "handoff_summary_generated",
        details: {
          sessionId,
          currentStep,
          route: deterministicSummary.summaryJson?.route || "sales"
        }
      });
      await writeLog("info", {
        event: "compliance_passed_export",
        details: {
          endpoint: "/api/handoff-summary",
          sessionId
        }
      });
      json(res, 200, {
        summaryText: redactSensitiveText(summaryText, { strict: COMPLIANCE_STRICT_REDACTION }),
        summaryJson: sanitizePayload(deterministicSummary.summaryJson),
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
      const context = sanitizePayload(parsed.context || {});
      const normalizedMessages = normalizeTranscriptMessages(parsed.messages || []);
      const messages =
        normalizedMessages.length > 0
          ? sanitizeMessages(normalizedMessages)
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
      if (hasRawSensitivePaymentData({ messages, summary })) {
        await writeLog("error", {
          event: "compliance_blocked_payload",
          details: {
            endpoint: "/api/transcript-export",
            reason: "raw_payment_data_detected"
          }
        });
        json(res, 422, { error: "Transcript blocked by compliance policy" });
        return;
      }
      const htmlPrintable = buildTranscriptHtml({
        sessionId,
        context,
        messages,
        summary
      });
      const jsonPayload = {
        sessionId,
        exportedAt: new Date().toISOString(),
        context: sanitizePayload(context),
        summary: sanitizePayload(summary.summaryJson),
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
      await writeLog("info", {
        event: "compliance_passed_export",
        details: {
          endpoint: "/api/transcript-export",
          sessionId
        }
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
