import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ROOT = "/Users/alexkatzighera/Documents/NLP Google Chatbot";

test("app centralizes full-address typeahead step eligibility", async () => {
  const appCode = await readFile(`${ROOT}/app.js`, "utf8");
  assert.match(appCode, /const ADDRESS_TYPEAHEAD_STEPS = new Set\(\[/);
  assert.match(appCode, /FLOW_STEPS\.INTERNET_ADDRESS_REQUEST/);
  assert.match(appCode, /FLOW_STEPS\.NEW_ONBOARD_ADDRESS/);
  assert.match(appCode, /FLOW_STEPS\.VALIDATION_ADDRESS_CAPTURE/);
  assert.match(appCode, /FLOW_STEPS\.SHIPPING_MANUAL_ENTRY/);
  assert.match(appCode, /function isAddressTypeaheadStep\(step = state\.flowStep\)/);
});

test("app tracks selected suggestion metadata and derives source tags", async () => {
  const appCode = await readFile(`${ROOT}/app.js`, "utf8");
  assert.match(appCode, /addressTypeaheadSelection/);
  assert.match(appCode, /function markAddressTypeaheadSelection/);
  assert.match(appCode, /function inferAddressEntrySource/);
  assert.match(appCode, /source: matchedSuggestion \? "typeahead_suggestion" : "manual"/);
});

test("address capture handlers include source-aware analytics logging", async () => {
  const appCode = await readFile(`${ROOT}/app.js`, "utf8");
  assert.match(appCode, /"onboarding_address_captured"/);
  assert.match(appCode, /"service_address_captured"/);
  assert.match(appCode, /"shipping_manual_entered", \{\s*address: trimmed,\s*source: shippingEntryMeta\.source,/);
});
