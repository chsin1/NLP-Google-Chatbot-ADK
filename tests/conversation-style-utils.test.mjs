import test from "node:test";
import assert from "node:assert/strict";
import { composePrompt, hasPrompt } from "../shared/conversation-style-utils.mjs";

test("composePrompt returns consultative step prompt with token interpolation", () => {
  const text = composePrompt(
    "OFFER_BROWSE",
    { authUser: { name: "Alex Carter" } },
    "consultative"
  );
  assert.match(text, /Alex Carter/);
  assert.match(text, /matched offers/i);
});

test("composePrompt falls back to default template", () => {
  const text = composePrompt("HELPDESK_ENTRY", {}, "unknown");
  assert.match(text, /Welcome to Bell/i);
});

test("hasPrompt flags known and unknown steps", () => {
  assert.equal(hasPrompt("HELPDESK_ENTRY"), true);
  assert.equal(hasPrompt("NON_EXISTENT_STEP"), false);
});

