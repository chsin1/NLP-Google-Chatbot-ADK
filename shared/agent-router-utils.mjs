import { isIntakeComplete } from "./automation-utils.mjs";

export const AGENT_TOOLS = Object.freeze({
  CHAT_ASSIST: "chat_assist",
  INTENT_CLASSIFIER: "intent_classifier",
  ADDRESS_LOOKUP: "address_lookup",
  QUOTE_PREVIEW: "quote_preview",
  INSTALL_SLOTS: "install_slots",
  TRANSCRIPT_EXPORT: "transcript_export",
  HANDOFF_SUMMARY: "handoff_summary",
  FINDER_NEARBY: "finder_nearby",
  POST_INTAKE_AUTOMATION: "post_intake_automation"
});

function includesAny(text = "", patterns = []) {
  const value = String(text || "").toLowerCase();
  return patterns.some((pattern) => value.includes(pattern));
}

export function routeAgentTask({
  task = "",
  step = "",
  userMessage = "",
  context = {}
} = {}) {
  const normalizedTask = String(task || "").toLowerCase();
  const normalizedStep = String(step || "").toUpperCase();
  const normalizedMessage = String(userMessage || "").toLowerCase();

  if (normalizedTask === "intent_entities") {
    return {
      tool: AGENT_TOOLS.INTENT_CLASSIFIER,
      reason: "task_intent_entities",
      confidence: 1
    };
  }

  if (
    normalizedStep.includes("ADDRESS") ||
    includesAny(normalizedMessage, ["address", "postal", "postcode", "lookup address"])
  ) {
    return {
      tool: AGENT_TOOLS.ADDRESS_LOOKUP,
      reason: "address_signal_detected",
      confidence: 0.88
    };
  }

  if (
    normalizedStep.includes("BOOKING") ||
    includesAny(normalizedMessage, ["book", "slot", "appointment", "install time"])
  ) {
    return {
      tool: AGENT_TOOLS.INSTALL_SLOTS,
      reason: "booking_signal_detected",
      confidence: 0.87
    };
  }

  if (includesAny(normalizedMessage, ["quote", "build my plan", "compare"])) {
    return {
      tool: AGENT_TOOLS.QUOTE_PREVIEW,
      reason: "quote_signal_detected",
      confidence: 0.86
    };
  }

  if (includesAny(normalizedMessage, ["export", "download transcript", "save transcript"])) {
    return {
      tool: AGENT_TOOLS.TRANSCRIPT_EXPORT,
      reason: "export_signal_detected",
      confidence: 0.9
    };
  }

  if (includesAny(normalizedMessage, ["handoff", "agent summary", "transfer summary"])) {
    return {
      tool: AGENT_TOOLS.HANDOFF_SUMMARY,
      reason: "handoff_signal_detected",
      confidence: 0.9
    };
  }

  if (includesAny(normalizedMessage, ["nearby", "store", "location", "directions"])) {
    return {
      tool: AGENT_TOOLS.FINDER_NEARBY,
      reason: "finder_signal_detected",
      confidence: 0.84
    };
  }

  if (isIntakeComplete(context) && normalizedTask === "post_intake") {
    return {
      tool: AGENT_TOOLS.POST_INTAKE_AUTOMATION,
      reason: "intake_complete_post_intake_task",
      confidence: 1
    };
  }

  return {
    tool: AGENT_TOOLS.CHAT_ASSIST,
    reason: "default_chat_assist",
    confidence: 0.6
  };
}
