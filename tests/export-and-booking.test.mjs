import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildHandoffSummary, buildTranscriptHtml } from "../shared/conversation-utils.mjs";

const ROOT = "/Users/alexkatzighera/Documents/NLP Google Chatbot";

test("buildHandoffSummary returns structured keys", () => {
  const payload = buildHandoffSummary({
    sessionId: "sess_demo_1",
    currentStep: "PAYMENT_CARD_NUMBER",
    context: {
      customerType: "new",
      intent: "home internet",
      basket: [{ name: "Internet 500", monthlyPrice: 75 }],
      payment: { verified: false }
    },
    messages: [{ role: "user", text: "I need internet", ts: "2026-03-15T10:00:00.000Z" }]
  });

  assert.ok(payload.summaryText.length > 10);
  assert.equal(payload.summaryJson.sessionId, "sess_demo_1");
  assert.equal(payload.summaryJson.route, "sales");
  assert.ok(Array.isArray(payload.summaryJson.blockers));
});

test("buildTranscriptHtml includes transcript and handoff sections", () => {
  const html = buildTranscriptHtml({
    sessionId: "sess_demo_2",
    context: {
      customerType: "existing",
      intent: "mobility"
    },
    messages: [
      { role: "bot", text: "Hello from Belinda", ts: "2026-03-15T10:00:00.000Z" },
      { role: "user", text: "I want a new phone", ts: "2026-03-15T10:00:05.000Z" }
    ]
  });

  assert.match(html, /Bell Corporate Conversation Transcript/);
  assert.match(html, /Handoff Summary/);
  assert.match(html, /I want a new phone/);
});

test("app wiring includes booking, reminder, theme, and transcript export hooks", async () => {
  const appCode = await readFile(`${ROOT}/app.js`, "utf8");
  assert.match(appCode, /BOOKING_SLOT_SELECTION/);
  assert.match(appCode, /REMINDER_OPT_IN/);
  assert.match(appCode, /exportTranscript/);
  assert.match(appCode, /beforeinstallprompt/);
  assert.match(appCode, /applyTheme/);
  assert.match(appCode, /Friday install slots are closed/);
  assert.match(appCode, /booking_meeting_requested/);
  assert.match(appCode, /booking-calendar-content/);
});

test("checkout payment routing helper is used to prevent invalid eligibility transitions", async () => {
  const appCode = await readFile(`${ROOT}/app.js`, "utf8");
  assert.match(appCode, /function routeToCheckoutPaymentEntry/);
  assert.match(appCode, /routeToCheckoutPaymentEntry\(\{ pushHistory: true \}\);/);
});
