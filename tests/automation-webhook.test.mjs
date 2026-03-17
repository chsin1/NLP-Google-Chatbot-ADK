import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  isIntakeComplete,
  buildPostIntakePayload,
  sendPostIntakeWebhook
} from "../shared/automation-utils.mjs";

const ROOT = "/Users/alexkatzighera/Documents/NLP Google Chatbot";

test("isIntakeComplete requires intent/service plus clarification", () => {
  const incomplete = isIntakeComplete({
    intent: "mobility",
    salesProfile: { byodChoice: "byod" }
  });
  const complete = isIntakeComplete({
    intent: "mobility",
    salesProfile: { byodChoice: "byod", callingPlan: "Canada + US" }
  });
  assert.equal(incomplete, false);
  assert.equal(complete, true);
});

test("buildPostIntakePayload returns expected shape", () => {
  const payload = buildPostIntakePayload({
    sessionId: "sess_1",
    currentStep: "SERVICE_CLARIFICATION",
    context: {
      intent: "home internet",
      selectedService: "internet",
      salesProfile: { speedPriority: "Fastest speed" }
    },
    transcript: [{ role: "user", text: "Need internet", ts: "2026-03-17T10:00:00.000Z" }]
  });
  assert.equal(payload.sessionId, "sess_1");
  assert.equal(payload.intakeComplete, true);
  assert.equal(payload.recentTranscript.length, 1);
});

test("sendPostIntakeWebhook returns no-op when URL missing", async () => {
  const result = await sendPostIntakeWebhook({ x: 1 }, "");
  assert.deepEqual(result, {
    ok: true,
    fired: false,
    reason: "not_configured"
  });
});

test("sendPostIntakeWebhook reports success and failure", async () => {
  const okFetch = async () => ({ ok: true, status: 200 });
  const badFetch = async () => ({ ok: false, status: 502 });
  const success = await sendPostIntakeWebhook({ x: 1 }, "https://example.test/hook", { fetchImpl: okFetch });
  const failure = await sendPostIntakeWebhook({ x: 1 }, "https://example.test/hook", { fetchImpl: badFetch });
  assert.equal(success.ok, true);
  assert.equal(success.fired, true);
  assert.equal(failure.ok, false);
  assert.equal(failure.fired, true);
  assert.match(String(failure.error), /webhook_http_502/);
});

test("server exposes post-intake automation endpoint", async () => {
  const serverCode = await readFile(`${ROOT}/server.mjs`, "utf8");
  assert.match(serverCode, /\/api\/automations\/post-intake/);
  assert.match(serverCode, /N8N_WEBHOOK_URL/);
});
