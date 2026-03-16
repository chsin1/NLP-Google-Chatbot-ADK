import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  LEGACY_FLOW_STEPS,
  PATH_STATUS,
  canProceed,
  nextLoopGuard,
  parseHelpdeskIntent,
  parseSalesIntentDeterministic,
  stableContextHash
} from "../shared/workflow-utils.mjs";

function baseContext() {
  return {
    selectedEntryIntent: "New Products / Upgrades",
    customerType: "existing",
    areaCode: "416",
    authUser: { id: "u1001", prefilledAddress: "100 Profile Ave, Toronto, ON" },
    intent: "mobility",
    salesProfile: { byodChoice: "new_device", phonePreference: "iPhone", callingPlan: "Canada + US" },
    basket: [{ financingEligible: true, devicePrice: 899 }],
    payment: { method: "visa", last4Confirmed: true, verified: true },
    financing: { planType: "smartpay", termMonths: 24, approvalStatus: "approved" },
    newOnboarding: {
      leadId: "lead_123",
      fullName: "Jamie Doe",
      email: "jamie@example.com",
      phone: "4165551000",
      address: "123 Main St, Toronto, ON"
    },
    shipping: { address: "100 Test Ave" }
  };
}

test("legacy state list explicitly tracks deprecated steps", () => {
  assert.deepEqual(LEGACY_FLOW_STEPS, ["AREA_CODE_ENTRY", "AVAILABILITY_SELECTION", "CLIENT_TYPE_SELECTION"]);
  assert.equal(PATH_STATUS.IN_PROGRESS, "in_progress");
});

test("forward path canProceed coverage for existing + checkout", () => {
  const ctx = baseContext();
  ctx.selectedService = "internet";
  ctx.intent = "home internet";
  ctx.internetPreference = "value";
  ctx.selectedPlanId = "internet-003";
  ctx.serviceAddress = "100 Main St, Toronto, ON";
  ctx.serviceAddressValidated = true;
  ctx.paymentDraft = {
    brand: "visa",
    cardValidated: true,
    cvcValidated: true,
    postalValidated: true
  };
  assert.equal(canProceed("CUSTOMER_STATUS_SELECTION", ctx), true);
  assert.equal(canProceed("GREETING_CONVERSATIONAL", ctx), true);
  assert.equal(canProceed("SERVICE_SELECTION", { ...ctx, customerType: "new" }), true);
  assert.equal(canProceed("EXISTING_AUTH_ENTRY", { ...ctx, customerType: "existing" }), true);
  assert.equal(canProceed("INTERNET_ADDRESS_REQUEST", ctx), true);
  assert.equal(canProceed("INTERNET_ADDRESS_VALIDATE", { ...ctx, serviceAddress: "100 Main St, Toronto, ON" }), true);
  assert.equal(canProceed("INTERNET_AVAILABILITY_RESULT", { ...ctx, serviceAddress: "100 Main St, Toronto, ON" }), true);
  assert.equal(canProceed("INTERNET_PRIORITY_CAPTURE", { ...ctx, serviceAddress: "100 Main St, Toronto, ON" }), true);
  assert.equal(canProceed("INTERNET_PLAN_PITCH", { ...ctx, serviceAddress: "100 Main St, Toronto, ON" }), true);
  assert.equal(canProceed("PLAN_CONFIRMATION", ctx), true);
  assert.equal(canProceed("EXISTING_AREA_CODE_CHECK", ctx), true);
  assert.equal(canProceed("EXISTING_AUTH_MODE", ctx), true);
  assert.equal(canProceed("OFFER_BROWSE", ctx), true);
  assert.equal(canProceed("VALIDATION_ADDRESS_CAPTURE", ctx), true);
  assert.equal(canProceed("PAYMENT_METHOD", ctx), true);
  assert.equal(canProceed("PAYMENT_CONFIRM_LAST4", ctx), true);
  assert.equal(canProceed("PAYMENT_CVV", ctx), true);
  assert.equal(canProceed("PAYMENT_CARD_ENTRY", ctx), true);
  assert.equal(canProceed("PAYMENT_CARD_NUMBER", ctx), true);
  assert.equal(canProceed("PAYMENT_CARD_CVC", ctx), true);
  assert.equal(canProceed("PAYMENT_CARD_POSTAL", ctx), true);
  assert.equal(canProceed("PAYMENT_CARD_CONFIRM", ctx), true);
  assert.equal(canProceed("SHIPPING_SELECTION", ctx), true);
  assert.equal(canProceed("ORDER_REVIEW", ctx), true);
  assert.equal(canProceed("BOOKING_SLOT_SELECTION", ctx), true);
  assert.equal(canProceed("BOOKING_SLOT_CONFIRM", ctx), true);
  assert.equal(canProceed("REMINDER_OPT_IN", ctx), true);
  assert.equal(canProceed("REMINDER_SCHEDULED", ctx), true);
  assert.equal(canProceed("POST_CHAT_RATING", ctx), true);
  assert.equal(canProceed("ORDER_CONFIRMED", ctx), true);
});

test("negative gating checks fail when required context is missing", () => {
  const ctx = baseContext();
  ctx.selectedService = "internet";
  ctx.intent = "home internet";
  ctx.internetPreference = "value";
  ctx.selectedPlanId = "internet-003";
  ctx.serviceAddress = "100 Main St, Toronto, ON";
  ctx.serviceAddressValidated = true;
  ctx.areaCode = null;
  assert.equal(canProceed("EXISTING_AUTH_MODE", ctx), false);
  assert.equal(canProceed("OFFER_BROWSE", ctx), true);
  ctx.serviceAddressValidated = false;
  assert.equal(canProceed("INTERNET_ADDRESS_VALIDATE", ctx), false);
  ctx.serviceAddressValidated = true;
  assert.equal(canProceed("INTERNET_PLAN_PITCH", ctx), true);
  ctx.areaCode = "416";
  assert.equal(canProceed("INTERNET_PLAN_PITCH", ctx), true);
  ctx.internetPreference = null;
  assert.equal(canProceed("OFFER_BROWSE", ctx), false);
  ctx.selectedPlanId = null;
  assert.equal(canProceed("PLAN_CONFIRMATION", ctx), false);
  ctx.internetPreference = "value";
  ctx.selectedPlanId = "internet-003";
  ctx.payment.verified = false;
  assert.equal(canProceed("SHIPPING_SELECTION", ctx), false);
  ctx.shipping.address = "";
  assert.equal(canProceed("ORDER_REVIEW", ctx), false);
});

test("deterministic parser detects helpdesk routes and sales intent", () => {
  assert.equal(parseHelpdeskIntent("I need hardware support"), "hardware");
  assert.equal(parseHelpdeskIntent("Corporate support please"), "corporate_support");
  assert.equal(parseHelpdeskIntent("help desk and troubleshooting"), "support");
  assert.equal(parseSalesIntentDeterministic("Need home internet"), "home internet");
  assert.equal(parseSalesIntentDeterministic("Add internet offers"), "home internet");
  assert.equal(parseSalesIntentDeterministic("show me bundles"), "bundle");
  assert.equal(parseSalesIntentDeterministic("nonsense input"), null);
});

test("loop guard marks stuck after repeated same-step no-context changes", () => {
  const ctx = baseContext();
  const hash = stableContextHash(ctx);
  let guard = nextLoopGuard({}, "HELPDESK_ENTRY", hash, 3);
  assert.equal(guard.stuck, false);
  guard = nextLoopGuard(guard, "HELPDESK_ENTRY", hash, 3);
  assert.equal(guard.stuck, false);
  guard = nextLoopGuard(guard, "HELPDESK_ENTRY", hash, 3);
  assert.equal(guard.stuck, true);
});

test("greeting includes Belinda automated AI disclosure text", () => {
  const appCode = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  assert.match(appCode, /Belinda, Bell’s automated AI agent/i);
  assert.match(appCode, /I’m not a human representative/i);
});

test("cross-sell and inline offers include internet branch", () => {
  const appCode = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  assert.match(appCode, /Add internet offers/);
  assert.match(appCode, /category === "home internet"/);
  assert.match(appCode, /presentInlineOfferChoices\("home internet"\)/);
});
