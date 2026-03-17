import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ROOT = "/Users/alexkatzighera/Documents/NLP Google Chatbot";

test("existing UX hooks remain wired after agentic additions", async () => {
  const appCode = await readFile(`${ROOT}/app.js`, "utf8");
  assert.match(appCode, /applyTheme\(/);
  assert.match(appCode, /beforeinstallprompt/);
  assert.match(appCode, /exportTranscript/);
  assert.match(appCode, /scheduleBrowserReminder/);
  assert.match(appCode, /requestConsentForExport/);
});

test("index keeps dark mode, chat menu, and transcript export controls", async () => {
  const indexCode = await readFile(`${ROOT}/index.html`, "utf8");
  assert.match(indexCode, /name="site-theme" value="dark"/);
  assert.match(indexCode, /id="chat-menu"/);
  assert.match(indexCode, /id="export-transcript-btn"/);
  assert.match(indexCode, /id="store-finder-btn"/);
});
