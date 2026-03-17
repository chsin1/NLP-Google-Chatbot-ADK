import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  redactPaymentText,
  redactSensitiveObject,
  redactSensitiveText,
  hasRawSensitivePaymentData
} from "../shared/privacy-utils.mjs";

const ROOT = "/Users/alexkatzighera/Documents/NLP Google Chatbot";

test("redactPaymentText masks PAN and CVC patterns", () => {
  const input = "card 4111 1111 1111 1111 cvc 123";
  const redacted = redactPaymentText(input);
  assert.match(redacted, /\*\*\*\* \*\*\*\* \*\*\*\* 1111/);
  assert.doesNotMatch(redacted, /cvc\s*123/i);
});

test("redactSensitiveText masks phone, email, postal, and address-like tokens", () => {
  const input = "Jane Doe 16 Yonge Street Toronto ON M6A3E2 jane@test.com 416-555-1234";
  const redacted = redactSensitiveText(input, { strict: true });
  assert.doesNotMatch(redacted, /jane@test\.com/i);
  assert.doesNotMatch(redacted, /416-555-1234/);
  assert.doesNotMatch(redacted, /M6A3E2/i);
});

test("redactSensitiveObject recursively masks sensitive fields", () => {
  const payload = {
    email: "jane@test.com",
    phone: "4165551234",
    paymentDraft: {
      cardNumber: "4111111111111111",
      cvc: "123"
    },
    nested: {
      address: "16 Yonge Street, Toronto, ON"
    }
  };
  const redacted = redactSensitiveObject(payload, { strict: true });
  assert.notEqual(redacted.email, payload.email);
  assert.notEqual(redacted.phone, payload.phone);
  assert.match(redacted.paymentDraft.cardNumber, /\*\*\*\*/);
  assert.equal(redacted.paymentDraft.cvc, "***");
});

test("hasRawSensitivePaymentData detects unmasked payment fields", () => {
  assert.equal(hasRawSensitivePaymentData("4111 1111 1111 1111"), true);
  assert.equal(hasRawSensitivePaymentData("cvc 123"), true);
  assert.equal(hasRawSensitivePaymentData("**** **** **** 1111"), false);
});

test("app and server include strict compliance hooks", () => {
  const appCode = fs.readFileSync(`${ROOT}/app.js`, "utf8");
  const serverCode = fs.readFileSync(`${ROOT}/server.mjs`, "utf8");
  assert.match(appCode, /CONSENT_PROFILE/);
  assert.match(appCode, /CONSENT_PAYMENT/);
  assert.match(appCode, /CONSENT_EXPORT/);
  assert.match(appCode, /payment_sensitive_field_suppressed/);
  assert.doesNotMatch(appCode, /paymentDraft:[\s\S]{0,140}cvc:/);
  assert.match(serverCode, /\/api\/compliance-status/);
  assert.match(serverCode, /\/api\/consent-record/);
  assert.match(serverCode, /compliance_blocked_payload/);
});
