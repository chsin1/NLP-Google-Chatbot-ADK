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

test("buildReceiptHtml includes full corporate receipt sections", () => {
  const html = buildReceiptHtml({
    brand: {
      companyName: "Bell Canada",
      channel: "Corporate Assisted Digital Checkout"
    },
    order: {
      orderId: "ORD-1",
      confirmationCode: "CNF-1",
      createdAt: "2026-03-11T10:00:00.000Z",
      currency: "CAD",
      status: "Confirmed"
    },
    customer: {
      clientType: "personal",
      displayName: "Alex Carter",
      contactPhone: "(416)-551-1192",
      contactEmail: "alex.test@gmail.com",
      accountStatus: "Account on file"
    },
    addresses: {
      billingAddress: "100 Billing Ave, Toronto, ON",
      shippingAddress: "100 Shipping Ave, Toronto, ON",
      serviceAddress: "100 Service Ave, Toronto, ON"
    },
    payment: {
      methodLabel: "Visa",
      maskedAccount: "**** 2781",
      verificationStatus: "Verified",
      chargeToday: 225
    },
    lineItems: [{ name: "iPhone Plan", category: "mobility", deviceModel: "iPhone 16", quantity: 1, oneTimePrice: 0, monthlyPrice: 75 }],
    recurring: {
      serviceMonthly: 75,
      financingMonthly: 37.46,
      combinedMonthly: 112.46
    },
    charges: {
      installationFees: 25,
      oneTimeSubtotal: 225,
      monthlySubtotal: 75,
      estimatedTaxToday: 0,
      estimatedTaxMonthly: 0,
      todayTotal: 225,
      monthlyTotal: 112.46
    },
    promotions: [{ title: "Spring Savings", description: "Seasonal spring offer for qualifying services." }],
    financing: { amountFinanced: 899, upfrontPayment: 100, termMonths: 24, monthlyPayment: 37.46, decisionId: "FIN-123" },
    disclaimer: "Mock confirmation for prototype use."
  });
  assert.match(html, /Bell Corporate Order Confirmation/);
  assert.match(html, /Corporate Assisted Digital Checkout/);
  assert.match(html, /Order ID:/);
  assert.match(html, /Status:/);
  assert.match(html, /Customer & Account/);
  assert.match(html, /Billing Address/);
  assert.match(html, /Shipping Address/);
  assert.match(html, /Service Address/);
  assert.match(html, /Payment Confirmation/);
  assert.match(html, /\*\*\*\* 2781/);
  assert.match(html, /Promotions Applied/);
  assert.match(html, /Spring Savings/);
  assert.match(html, /Bell Smart Financing/);
  assert.match(html, /Total Due Today:/);
  assert.match(html, /Monthly Total Going Forward:/);
  assert.match(html, /Estimated tax today \(placeholder\)/);
  assert.match(html, /Mock confirmation for prototype use/);
});

test("buildReceiptHtml omits financing block when financing is null", () => {
  const html = buildReceiptHtml({
    orderId: "ORD-2",
    confirmationCode: "CNF-2",
    clientType: "corporate",
    items: [{ name: "Fibe 1.5 Gigabit", category: "home internet", monthlyPrice: 95 }],
    serviceMonthly: 95,
    combinedMonthly: 95,
    chargeToday: 25,
    installationFees: 25,
    shippingAddress: "200 Queen St, Toronto, ON",
    financing: null
  });
  assert.doesNotMatch(html, /Bell Smart Financing/);
  assert.match(html, /Bell Corporate Order Confirmation/);
  assert.match(html, /Total Due Today:/);
});
