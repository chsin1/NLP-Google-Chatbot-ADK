import test from "node:test";
import assert from "node:assert/strict";
import { buildReceiptHtml, getRetryOutcome, resolveRouteFromStep } from "../shared/conversation-utils.mjs";

test("getRetryOutcome escalates at exactly retry 3", () => {
  assert.deepEqual(getRetryOutcome(0, 3), { nextRetries: 1, escalate: false });
  assert.deepEqual(getRetryOutcome(1, 3), { nextRetries: 2, escalate: false });
  assert.deepEqual(getRetryOutcome(2, 3), { nextRetries: 3, escalate: true });
});

test("resolveRouteFromStep maps support/corporate/agent and default sales", () => {
  assert.equal(resolveRouteFromStep("SUPPORT_DISCOVERY", ""), "support");
  assert.equal(resolveRouteFromStep("CORPORATE_DISCOVERY", ""), "corporate");
  assert.equal(resolveRouteFromStep("WARM_AGENT_ROUTING", ""), "agent");
  assert.equal(resolveRouteFromStep("OFFER_BROWSE", ""), "sales");
});

test("buildReceiptHtml includes required sections", () => {
  const html = buildReceiptHtml({
    orderId: "ORD-1",
    confirmationCode: "CNF-1",
    clientType: "personal",
    items: [{ name: "iPhone Plan", deviceModel: "iPhone 16", monthlyPrice: 75 }],
    serviceMonthly: 75,
    financing: { amount: 899, termMonths: 24, monthlyPayment: 37.46, decisionId: "FIN-123" },
    combinedMonthly: 112.46,
    chargeToday: 225,
    installationFees: 25,
    shippingAddress: "100 Test Ave, Toronto, ON"
  });
  assert.match(html, /Bell Canada - Mock Order Receipt/);
  assert.match(html, /Order ID:/);
  assert.match(html, /Bell Smart Financing/);
  assert.match(html, /Combined Monthly Due:/);
  assert.match(html, /Charge Today:/);
  assert.match(html, /Installation Fees:/);
  assert.match(html, /Mock confirmation for prototype use/);
});
