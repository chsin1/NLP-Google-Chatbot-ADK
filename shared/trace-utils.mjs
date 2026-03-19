import { randomUUID } from "node:crypto";

function generateId(prefix = "tr") {
  try {
    return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  } catch {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function startTrace({
  endpoint = "",
  sessionId = null,
  task = null,
  step = null,
  parentTraceId = null,
  tags = {}
} = {}) {
  const startedAt = Date.now();
  return {
    traceId: parentTraceId || generateId("trace"),
    spanId: generateId("span"),
    endpoint: String(endpoint || ""),
    sessionId: sessionId || null,
    task: task || null,
    step: step || null,
    tags: { ...tags },
    startedAt
  };
}

export function buildTraceEvent(trace = {}, stage = "info", details = {}) {
  return {
    traceId: trace.traceId || null,
    spanId: trace.spanId || null,
    endpoint: trace.endpoint || null,
    sessionId: trace.sessionId || null,
    task: trace.task || null,
    step: trace.step || null,
    stage,
    ts: new Date().toISOString(),
    details: details || {}
  };
}

export function finishTrace(trace = {}, { status = "ok", error = null, details = {} } = {}) {
  const endedAt = Date.now();
  const durationMs = Math.max(0, endedAt - Number(trace.startedAt || endedAt));
  return {
    ...trace,
    endedAt,
    durationMs,
    status,
    error: error ? String(error) : null,
    details: details || {}
  };
}
