import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ROOT = "/Users/alexkatzighera/Documents/NLP Google Chatbot";

test("index includes menu aria controls and live region", () => {
  const html = fs.readFileSync(`${ROOT}/index.html`, "utf8");
  assert.match(html, /id="chat-menu-btn"[\s\S]*aria-controls="chat-menu"/);
  assert.match(html, /id="chat-menu"[\s\S]*role="menu"/);
  assert.match(html, /id="chat-live-region"[\s\S]*aria-live="polite"/);
});

test("index includes privacy and about-ai panels", () => {
  const html = fs.readFileSync(`${ROOT}/index.html`, "utf8");
  assert.match(html, /id="privacy-panel"/);
  assert.match(html, /id="ai-about-panel"/);
  assert.match(html, /id="withdraw-consent-btn"/);
});

test("styles include sr-only, focus-visible, and reduced-motion rules", () => {
  const css = fs.readFileSync(`${ROOT}/styles.css`, "utf8");
  assert.match(css, /\.sr-only/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
});

test("app updates document language and keyboard accessibility handlers", () => {
  const appCode = fs.readFileSync(`${ROOT}/app.js`, "utf8");
  assert.match(appCode, /document\.documentElement\.lang/);
  assert.match(appCode, /a11y_keyboard_nav_used/);
  assert.match(appCode, /a11y_modal_escape/);
  assert.match(appCode, /a11y_focus_recovered/);
});
