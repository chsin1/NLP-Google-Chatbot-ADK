import test from "node:test";
import assert from "node:assert/strict";
import { buildMetrics, parseJsonLines, resolveWindow } from "../shared/metrics-utils.mjs";

test("parseJsonLines parses newline-delimited JSON safely", () => {
  const lines = `{"ts":"2026-03-12T00:00:00.000Z","event":"flow_transition","details":{}}\ninvalid\n{"ts":"2026-03-12T00:00:01.000Z","event":"auth_success","details":{"sessionId":"s1"}}`;
  const parsed = parseJsonLines(lines);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[1].event, "auth_success");
});

test("resolveWindow defaults to a valid range", () => {
  const window = resolveWindow({});
  assert.ok(window.startMs < window.endMs);
  assert.equal(window.days, 30);
});

test("buildMetrics aggregates KPI values and route breakdown", () => {
  const entries = [
    { ts: "2026-03-12T00:00:00.000Z", event: "path_started", details: { sessionId: "s1", route: "sales" } },
    { ts: "2026-03-12T00:00:00.500Z", event: "flow_transition", details: { sessionId: "s1", route: "sales", from: "INIT_CONNECTING", to: "HELPDESK_ENTRY" } },
    { ts: "2026-03-12T00:00:00.900Z", event: "flow_transition", details: { sessionId: "s1", route: "sales", from: "INTENT_DISCOVERY", to: "SERVICE_CLARIFICATION" } },
    { ts: "2026-03-12T00:00:01.300Z", event: "flow_transition", details: { sessionId: "s1", route: "sales", from: "SERVICE_CLARIFICATION", to: "OFFER_BROWSE" } },
    { ts: "2026-03-12T00:00:01.000Z", event: "auth_success", details: { sessionId: "s1", route: "sales" } },
    { ts: "2026-03-12T00:00:02.000Z", event: "financing_selected", details: { sessionId: "s1", route: "sales" } },
    { ts: "2026-03-12T00:00:03.000Z", event: "financing_approved", details: { sessionId: "s1", route: "sales" } },
    { ts: "2026-03-12T00:00:04.000Z", event: "order_submission_attempt", details: { sessionId: "s1", route: "sales" } },
    { ts: "2026-03-12T00:00:05.000Z", event: "order_submission_success", details: { sessionId: "s1", route: "sales" } },
    { ts: "2026-03-12T00:00:06.000Z", event: "path_completed", details: { sessionId: "s1", route: "sales" } },
    { ts: "2026-03-12T00:00:07.000Z", event: "warm_agent_routed", details: { sessionId: "s2", route: "support" } },
    { ts: "2026-03-12T00:00:08.000Z", event: "flow_loop_detected", details: { sessionId: "s2", route: "support" } },
    { ts: "2026-03-12T00:00:09.000Z", event: "sla_offer_time_breach", details: { sessionId: "s2", route: "sales" } }
  ];
  const errors = [
    { ts: "2026-03-12T00:00:10.000Z", event: "invalid_flow_transition", details: { sessionId: "s2" } }
  ];
  const qa = [{ ts: "2026-03-12T00:00:11.000Z", event: "qa_probe", details: {} }];

  const metrics = buildMetrics(entries, errors, qa, {
    since: "2026-03-11T00:00:00.000Z",
    until: "2026-03-13T00:00:00.000Z"
  });

  assert.equal(metrics.kpis.sessions, 2);
  assert.equal(metrics.kpis.authSuccessCount, 1);
  assert.equal(metrics.kpis.orderSuccessCount, 1);
  assert.equal(metrics.kpis.conversionRatePercent, 50);
  assert.equal(metrics.kpis.financingApprovalRatePercent, 100);
  assert.equal(metrics.kpis.warmAgentRoutedCount, 1);
  assert.equal(metrics.kpis.loopDetectedCount, 1);
  assert.equal(metrics.errors.total, 1);
  assert.equal(metrics.qaSignals.entries, 1);
  assert.equal(metrics.routeBreakdown.find((r) => r.route === "sales").orderSuccess, 1);
  assert.equal(metrics.pathSets.completedUnique, 1);
  assert.ok(metrics.businessKpis.length >= 10);
  assert.ok(metrics.businessKpis.some((kpi) => kpi.key === "quote_to_checkout_rate"));
  assert.ok(metrics.businessKpis.some((kpi) => kpi.key === "booking_completion_rate"));
  assert.ok(metrics.businessKpis.some((kpi) => kpi.key === "reminder_opt_in_rate"));
  assert.ok(metrics.kpis.monthlyRecurringRevenueCad >= 100);
  assert.ok(metrics.kpis.pipelineValueCad >= 100);
  assert.ok(metrics.monthlySnapshots.length >= 6);
  assert.ok(metrics.sessionInteractions.length >= 2);
  assert.equal(metrics.sessionInteractions[0].sessionId, "s2");
  assert.ok(metrics.sla.overallHealthScore > 0);
  assert.ok(metrics.sla.targets.length >= 6);
  assert.ok(metrics.sla.monthlyBreachSeries.length >= 1);
});
