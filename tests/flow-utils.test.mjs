import test from "node:test";
import assert from "node:assert/strict";
import { classifyIntentFallback, rankAddressSuggestions } from "../shared/flow-utils.mjs";

test("classifyIntentFallback maps representative keywords", () => {
  assert.equal(classifyIntentFallback("I need internet for my condo"), "home internet");
  assert.equal(classifyIntentFallback("Need a home phone line"), "landline");
  assert.equal(classifyIntentFallback("Can I talk to a human agent?"), "human_handoff");
  assert.equal(classifyIntentFallback("Looking for a bundle deal"), "bundle");
});

test("classifyIntentFallback defaults to mobility", () => {
  assert.equal(classifyIntentFallback("Need a new phone plan"), "mobility");
});

test("rankAddressSuggestions filters by area code and ranking", () => {
  const results = rankAddressSuggestions("front", "416");
  assert.equal(results.length, 1);
  assert.equal(results[0].line1, "45 Front St W");
  assert.equal(results[0].areaCode, "416");
});

test("rankAddressSuggestions returns fallback top records for empty query", () => {
  const results = rankAddressSuggestions("", "647");
  assert.equal(results.length, 2);
  assert.ok(results.every((item) => item.areaCode === "647"));
});
