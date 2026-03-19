function hasSalesClarification(context = {}) {
  const intent = String(context.intent || "");
  const sales = context.salesProfile || {};
  if (intent === "home internet") return Boolean(sales.speedPriority || context.internetPreference);
  if (intent === "mobility") {
    if (!sales.byodChoice || !sales.callingPlan) return false;
    if (sales.byodChoice === "byod") return true;
    return Boolean(sales.phonePreference);
  }
  if (intent === "bundle") return Boolean(sales.bundleSize);
  if (intent === "landline") {
    if (!sales.linePreference || !sales.callingPlan) return false;
    if (sales.linePreference === "keep_existing") return Boolean(sales.portingDate);
    return true;
  }
  return false;
}

export function isIntakeComplete(context = {}) {
  const intent = String(context.intent || "").trim();
  const selectedService = String(context.selectedService || "").trim();
  if (!intent && !selectedService) return false;
  return hasSalesClarification(context);
}

function summarizeContext(context = {}) {
  return {
    customerType: context.customerType || null,
    intent: context.intent || null,
    selectedService: context.selectedService || null,
    activeTask: context.activeTask || null,
    flowStep: context.flowStep || null,
    internetPreference: context.internetPreference || null,
    salesProfile: {
      serviceType: context.salesProfile?.serviceType || null,
      speedPriority: context.salesProfile?.speedPriority || null,
      byodChoice: context.salesProfile?.byodChoice || null,
      phonePreference: context.salesProfile?.phonePreference || null,
      linePreference: context.salesProfile?.linePreference || null,
      callingPlan: context.salesProfile?.callingPlan || null,
      bundleSize: context.salesProfile?.bundleSize || null,
      portingDate: context.salesProfile?.portingDate || null
    },
    basketCount: Array.isArray(context.basket) ? context.basket.length : 0
  };
}

export function buildPostIntakePayload({
  sessionId = null,
  context = {},
  currentStep = "",
  transcript = []
} = {}) {
  return {
    event: "post_intake_ready",
    sessionId: sessionId || context.sessionId || null,
    emittedAt: new Date().toISOString(),
    currentStep: currentStep || context.flowStep || null,
    intakeComplete: isIntakeComplete(context),
    summary: summarizeContext(context),
    recentTranscript: Array.isArray(transcript)
      ? transcript.slice(-8).map((item) => ({
          role: item?.role === "user" ? "user" : "bot",
          text: String(item?.text || ""),
          ts: item?.ts || null
        }))
      : []
  };
}

export async function sendPostIntakeWebhook(
  payload = {},
  url = "",
  { fetchImpl = globalThis.fetch, timeoutMs = 5000 } = {}
) {
  const endpoint = String(url || "").trim();
  if (!endpoint) {
    return {
      ok: true,
      fired: false,
      reason: "not_configured"
    };
  }
  if (typeof fetchImpl !== "function") {
    return {
      ok: false,
      fired: true,
      error: "fetch_unavailable"
    };
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => {
        try {
          controller.abort();
        } catch {
          // ignore
        }
      }, Math.max(1, Number(timeoutMs || 5000)))
    : null;

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller?.signal
    });
    if (!response.ok) {
      return {
        ok: false,
        fired: true,
        error: `webhook_http_${response.status}`
      };
    }
    return {
      ok: true,
      fired: true
    };
  } catch (error) {
    return {
      ok: false,
      fired: true,
      error: String(error?.message || "webhook_failed")
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
