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
  assert.deepEqual(LEGACY_FLOW_STEPS, ["AREA_CODE_ENTRY", "AVAILABILITY_SELECTION", "CLIENT_TYPE_SELECTION", "DEVICE_OS_SELECTION"]);
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
  assert.equal(canProceed("CONSENT_PROFILE", ctx), true);
  assert.equal(canProceed("CONSENT_PAYMENT", ctx), true);
  assert.equal(canProceed("CONSENT_EXPORT", ctx), true);
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
  assert.equal(canProceed("CHECKOUT_INTENT_PROMPT", ctx), true);
  assert.equal(canProceed("PAYMENT_CARD_NUMBER", ctx), true);
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

test("quote builder enforces 100-point allocation in UI", () => {
  const appCode = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  assert.match(appCode, /Total: \$\{preferenceTotal\}\/100/);
  assert.match(appCode, /normalizeQuotePreferences\(\{[\s\S]*\}, key\)/);
});

test("language switch updates translatable bot and selected user messages", () => {
  const appCode = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  assert.match(appCode, /chatWindow\.querySelectorAll\("\.msg\[data-source-text\]"\)/);
  assert.match(appCode, /state\.activeQuickActionLabels = new Set\(labels\)/);
});

test("internet priority quote trigger uses canonical normalized input", () => {
  const appCode = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  assert.match(appCode, /INTERNET_PRIORITY_CAPTURE[\s\S]*\/\(quote\|build my plan\|compare\)\/i\.test\(canonicalInput\)/);
  assert.match(appCode, /INTERNET_PRIORITY_CAPTURE[\s\S]*resolveInternetPreference\(canonicalInput\)/);
});

test("quote builder is invokable globally and from inline offer flow", () => {
  const appCode = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  assert.match(appCode, /build my plan\|generate quote\|quote\|compare/);
  assert.match(appCode, /labels\.push\("Build my plan"\)/);
  assert.match(appCode, /generateQuotePreview\(\{ announce: true, showSelectionButtons: true \}\)/);
  assert.match(appCode, /quoteToggleBtn/);
  assert.match(appCode, /quote_builder_toggle_clicked/);
});

// --- Bug-fix regression tests ---

test("canProceed internet steps accept authUser.prefilledAddress when serviceAddress is absent", () => {
  // Simulates an existing customer who has only prefilledAddress on their profile.
  // canProceed must allow progress for INTERNET_AVAILABILITY_RESULT,
  // INTERNET_PRIORITY_CAPTURE, and INTERNET_PLAN_PITCH via the resolveAddress
  // fallback chain — the bug was that only context.serviceAddress was checked.
  const ctx = {
    customerType: "existing",
    intent: "home internet",
    authUser: { id: "u999", prefilledAddress: "55 Profile Blvd, Montreal, QC" },
    internetPreference: "speed",
    serviceAddress: undefined,
    serviceAddressValidated: false
  };

  // Steps that rely on resolveAddress (not just serviceAddress directly)
  assert.equal(canProceed("INTERNET_AVAILABILITY_RESULT", ctx), true,
    "INTERNET_AVAILABILITY_RESULT must pass when address is in authUser.prefilledAddress");
  assert.equal(canProceed("INTERNET_PRIORITY_CAPTURE", ctx), true,
    "INTERNET_PRIORITY_CAPTURE must pass when address is in authUser.prefilledAddress");
  assert.equal(canProceed("INTERNET_PLAN_PITCH", ctx), true,
    "INTERNET_PLAN_PITCH must pass when address is in authUser.prefilledAddress and internetPreference is set");

  // Must still fail when internetPreference is absent
  const ctxNoPreference = { ...ctx, internetPreference: null };
  assert.equal(canProceed("INTERNET_PLAN_PITCH", ctxNoPreference), false,
    "INTERNET_PLAN_PITCH must fail when internetPreference is null even with a valid address");

  // Must still fail when no address is available at all
  const ctxNoAddress = { ...ctx, authUser: { id: "u999", prefilledAddress: null } };
  assert.equal(canProceed("INTERNET_AVAILABILITY_RESULT", ctxNoAddress), false,
    "INTERNET_AVAILABILITY_RESULT must fail when no address is available in any fallback slot");
  assert.equal(canProceed("INTERNET_PRIORITY_CAPTURE", ctxNoAddress), false,
    "INTERNET_PRIORITY_CAPTURE must fail when no address is available in any fallback slot");
});

test("offer browse allows guest browsing when profile consent is declined", () => {
  const ctx = {
    customerType: "guest",
    areaCode: null,
    serviceAddress: "16 Yonge Street, Toronto, ON",
    serviceAddressValidated: true,
    intent: "home internet",
    internetPreference: "value",
    salesProfile: { speedPriority: "Balanced value" },
    consent: {
      profile: { status: "declined" }
    }
  };
  assert.equal(canProceed("OFFER_BROWSE", ctx), true);
});

test("canProceed falls back to newOnboarding.address and shipping.address when serviceAddress absent", () => {
  const base = {
    customerType: "new",
    intent: "home internet",
    internetPreference: "value",
    serviceAddress: undefined,
    serviceAddressValidated: false
  };

  const ctxOnboarding = { ...base, newOnboarding: { address: "200 Onboard Ln, Calgary, AB" } };
  assert.equal(canProceed("INTERNET_AVAILABILITY_RESULT", ctxOnboarding), true,
    "resolveAddress should fall back to newOnboarding.address");

  const ctxShipping = { ...base, shipping: { address: "300 Ship St, Vancouver, BC" } };
  assert.equal(canProceed("INTERNET_AVAILABILITY_RESULT", ctxShipping), true,
    "resolveAddress should fall back to shipping.address as last resort");
});

test("normalizeQuotePreferences redistribution fix is present in app.js", () => {
  // The original bug: when budget+speed already exceeded 100, truncating each
  // key individually left the total > 100.  The fix uses proportional scaling
  // (divides each key by the real total) so the sum is always exactly 100.
  const appCode = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  // Confirm the proportional-scaling pattern is present (key / total * 100)
  assert.match(appCode, /Number\(next\[key\] \|\| 0\) \/ total\) \* 100/,
    "normalizeQuotePreferences must use proportional scaling to fix overflow");
  // Confirm the zero-total safety guard is present
  assert.match(appCode, /if \(total <= 0\)/,
    "normalizeQuotePreferences must guard against a zero-sum total");
});

test("service toggle resets service-specific context fields and preserves basket", () => {
  // Both renderStep and handleChatInput SERVICE_SELECTION handlers must reset
  // serviceAddress, serviceAddressValidated, addressCaptureRetries,
  // internetPreference, selectedPlanId, checkout, and quoteBuilder on switch.
  // Basket must NOT be reset (bundling feature).
  const appCode = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

  // Service-address reset must appear in both handlers
  const addressResetCount = (appCode.match(/serviceAddress: null/g) || []).length;
  assert.ok(addressResetCount >= 2,
    "serviceAddress: null reset must appear in both renderStep and handleChatInput SERVICE_SELECTION");

  const validatedResetCount = (appCode.match(/serviceAddressValidated: false/g) || []).length;
  assert.ok(validatedResetCount >= 2,
    "serviceAddressValidated: false reset must appear in both SERVICE_SELECTION handlers");

  // Basket must never be explicitly nulled inside a SERVICE_SELECTION handler.
  // We verify by checking the source does NOT pair basket:null with selectedService patches.
  assert.doesNotMatch(appCode, /selectedService: "internet"[\s\S]{0,300}basket: null/,
    "basket must not be cleared when switching to internet service");
  assert.doesNotMatch(appCode, /selectedService: "mobility"[\s\S]{0,300}basket: null/,
    "basket must not be cleared when switching to mobility service");
});

test("mid-flow service switch guard intercepts new-service keywords mid-journey", () => {
  const appCode = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  assert.match(appCode, /MID_FLOW_SWITCH_STEPS/,
    "mid-flow switch Set must be defined in handleChatInput");
  assert.match(appCode, /mid_flow_service_switch_prompt/,
    "mid-flow switch must emit a log event for observability");
  assert.match(appCode, /Yes, switch[\s\S]{0,200}No, stay here/,
    "mid-flow switch prompt must offer Yes/No confirmation buttons");
});
