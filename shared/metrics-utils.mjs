function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pct(numerator, denominator) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function safeJsonParse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function dayKey(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "unknown";
  return d.toISOString().slice(0, 10);
}

function withinWindow(entryTs, window) {
  const t = new Date(entryTs).getTime();
  if (Number.isNaN(t)) return false;
  if (window.startMs != null && t < window.startMs) return false;
  if (window.endMs != null && t > window.endMs) return false;
  return true;
}

export function parseJsonLines(raw = "") {
  return String(raw || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(safeJsonParse)
    .filter(Boolean);
}

export function resolveWindow({ days = 30, since = null, until = null } = {}) {
  const now = Date.now();
  const startMs = since ? new Date(since).getTime() : now - toNumber(days, 30) * 24 * 60 * 60 * 1000;
  const endMs = until ? new Date(until).getTime() : now;
  return {
    days: toNumber(days, 30),
    startMs: Number.isNaN(startMs) ? now - 30 * 24 * 60 * 60 * 1000 : startMs,
    endMs: Number.isNaN(endMs) ? now : endMs
  };
}

export function buildMetrics(entries = [], errorEntries = [], qaEntries = [], opts = {}) {
  const window = resolveWindow(opts);
  const inScope = entries.filter((e) => withinWindow(e.ts, window));
  const errorsInScope = errorEntries.filter((e) => withinWindow(e.ts, window));
  const qaInScope = qaEntries.filter((e) => withinWindow(e.ts, window));

  const sessions = new Set();
  const authSessions = new Set();
  const orderSessions = new Set();
  const startedPaths = new Set();
  const completedPaths = new Set();
  const failedPaths = new Set();
  const daily = new Map();
  const errorsByEvent = new Map();
  const routeStats = new Map();

  let authSuccess = 0;
  let authFailure = 0;
  let orderSuccess = 0;
  let orderAttempt = 0;
  let orderBlocked = 0;
  let clarifyRetries = 0;
  let warmAgentRouted = 0;
  let loopDetected = 0;
  let financingSelected = 0;
  let financingApproved = 0;
  let financingDeclined = 0;
  let paymentConfirmed = 0;
  let cvvValidated = 0;
  let shippingLookupRequested = 0;
  let shippingLookupSelected = 0;
  let shippingManualEntered = 0;
  let pathStartedCount = 0;
  let pathCompletedCount = 0;
  let pathFailedCount = 0;

  const getDaily = (ts) => {
    const key = dayKey(ts);
    if (!daily.has(key)) {
      daily.set(key, {
        date: key,
        sessions: new Set(),
        authSuccess: 0,
        orderSuccess: 0,
        warmAgentRouted: 0,
        loopDetected: 0
      });
    }
    return daily.get(key);
  };

  for (const entry of inScope) {
    const event = entry.event || "";
    const details = entry.details || {};
    const sessionId = details.sessionId || null;
    const route = details.route || "unknown";

    if (!routeStats.has(route)) {
      routeStats.set(route, {
        route,
        pathStarted: 0,
        pathCompleted: 0,
        pathFailed: 0,
        orderSuccess: 0,
        warmAgentRouted: 0
      });
    }
    const routeBucket = routeStats.get(route);

    if (sessionId) {
      sessions.add(sessionId);
      getDaily(entry.ts).sessions.add(sessionId);
    }

    switch (event) {
      case "auth_success":
        authSuccess += 1;
        if (sessionId) authSessions.add(sessionId);
        getDaily(entry.ts).authSuccess += 1;
        break;
      case "auth_failure":
        authFailure += 1;
        break;
      case "order_submission_attempt":
        orderAttempt += 1;
        break;
      case "order_submission_success":
        orderSuccess += 1;
        routeBucket.orderSuccess += 1;
        if (sessionId) orderSessions.add(sessionId);
        getDaily(entry.ts).orderSuccess += 1;
        break;
      case "order_submission_blocked":
        orderBlocked += 1;
        break;
      case "clarify_retry_incremented":
        clarifyRetries += 1;
        break;
      case "warm_agent_routed":
        warmAgentRouted += 1;
        routeBucket.warmAgentRouted += 1;
        getDaily(entry.ts).warmAgentRouted += 1;
        break;
      case "flow_loop_detected":
        loopDetected += 1;
        getDaily(entry.ts).loopDetected += 1;
        break;
      case "financing_selected":
        financingSelected += 1;
        break;
      case "financing_approved":
        financingApproved += 1;
        break;
      case "financing_declined":
        financingDeclined += 1;
        break;
      case "payment_confirmed":
        paymentConfirmed += 1;
        break;
      case "cvv_validated":
        cvvValidated += 1;
        break;
      case "shipping_lookup_requested":
        shippingLookupRequested += 1;
        break;
      case "shipping_lookup_selected":
        shippingLookupSelected += 1;
        break;
      case "shipping_manual_entered":
        shippingManualEntered += 1;
        break;
      case "path_started":
        pathStartedCount += 1;
        routeBucket.pathStarted += 1;
        if (sessionId && details.route) startedPaths.add(`${sessionId}:${details.route}`);
        break;
      case "path_completed":
        pathCompletedCount += 1;
        routeBucket.pathCompleted += 1;
        if (sessionId && details.route) completedPaths.add(`${sessionId}:${details.route}`);
        break;
      case "path_failed":
        pathFailedCount += 1;
        routeBucket.pathFailed += 1;
        if (sessionId && details.route) failedPaths.add(`${sessionId}:${details.route}`);
        break;
      default:
        break;
    }
  }

  for (const entry of errorsInScope) {
    const event = entry.event || "unknown_error";
    errorsByEvent.set(event, (errorsByEvent.get(event) || 0) + 1);
  }

  const sessionsCount = sessions.size;
  const conversionRate = pct(orderSessions.size, sessionsCount);
  const authRate = pct(authSessions.size, sessionsCount);
  const orderAttemptToSuccessRate = pct(orderSuccess, orderAttempt);
  const financingApprovalRate = pct(financingApproved, financingSelected);
  const pathCompletionRate = pct(pathCompletedCount, pathStartedCount);
  const escalationRate = pct(warmAgentRouted, sessionsCount);
  const loopRate = pct(loopDetected, sessionsCount);

  return {
    generatedAt: new Date().toISOString(),
    window: {
      days: window.days,
      since: new Date(window.startMs).toISOString(),
      until: new Date(window.endMs).toISOString()
    },
    kpis: {
      sessions: sessionsCount,
      authSuccessCount: authSuccess,
      authFailureCount: authFailure,
      authRatePercent: authRate,
      orderAttemptCount: orderAttempt,
      orderSuccessCount: orderSuccess,
      orderBlockedCount: orderBlocked,
      conversionRatePercent: conversionRate,
      orderAttemptToSuccessRatePercent: orderAttemptToSuccessRate,
      clarifyRetriesCount: clarifyRetries,
      warmAgentRoutedCount: warmAgentRouted,
      escalationRatePercent: escalationRate,
      loopDetectedCount: loopDetected,
      loopRatePercent: loopRate,
      financingSelectedCount: financingSelected,
      financingApprovedCount: financingApproved,
      financingDeclinedCount: financingDeclined,
      financingApprovalRatePercent: financingApprovalRate,
      paymentConfirmedCount: paymentConfirmed,
      cvvValidatedCount: cvvValidated,
      shippingLookupRequestedCount: shippingLookupRequested,
      shippingLookupSelectedCount: shippingLookupSelected,
      shippingManualEnteredCount: shippingManualEntered,
      pathStartedCount,
      pathCompletedCount,
      pathFailedCount,
      pathCompletionRatePercent: pathCompletionRate
    },
    routeBreakdown: Array.from(routeStats.values()).sort((a, b) => a.route.localeCompare(b.route)),
    dailySeries: Array.from(daily.values())
      .map((d) => ({
        date: d.date,
        sessions: d.sessions.size,
        authSuccess: d.authSuccess,
        orderSuccess: d.orderSuccess,
        warmAgentRouted: d.warmAgentRouted,
        loopDetected: d.loopDetected
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    errors: {
      total: errorsInScope.length,
      byEvent: Array.from(errorsByEvent.entries())
        .map(([event, count]) => ({ event, count }))
        .sort((a, b) => b.count - a.count)
    },
    qaSignals: {
      entries: qaInScope.length
    },
    pathSets: {
      startedUnique: startedPaths.size,
      completedUnique: completedPaths.size,
      failedUnique: failedPaths.size
    }
  };
}
