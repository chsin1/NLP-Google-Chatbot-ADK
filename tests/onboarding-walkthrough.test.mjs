import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ROOT = "/Users/alexkatzighera/Documents/NLP Google Chatbot";

test("walkthrough module includes required persistence keys and controls", async () => {
  const code = await readFile(`${ROOT}/src/client/features/onboarding/walkthrough.mjs`, "utf8");
  assert.match(code, /telecom_walkthrough_seen_v1/);
  assert.match(code, /telecom_walkthrough_dismissed_v1/);
  assert.match(code, /shouldAutoStart/);
  assert.match(code, /replay/);
  assert.match(code, /Skip/);
});

test("app wiring includes walkthrough lifecycle and replay control", async () => {
  const appCode = await readFile(`${ROOT}/app.js`, "utf8");
  assert.match(appCode, /createWalkthroughController/);
  assert.match(appCode, /maybeStartWalkthrough/);
  assert.match(appCode, /replayWalkthrough/);
  assert.match(appCode, /replay-walkthrough-btn/);
});
