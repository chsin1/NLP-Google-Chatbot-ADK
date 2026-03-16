import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ROOT = "/Users/alexkatzighera/Documents/NLP Google Chatbot";

test("server includes ChatGPT endpoints and guardrails", async () => {
  const serverCode = await readFile(`${ROOT}/server.mjs`, "utf8");
  assert.match(serverCode, /\/api\/chat-assist/);
  assert.match(serverCode, /\/api\/llm-health/);
  assert.match(serverCode, /exact pricing/);
  assert.match(serverCode, /payment execution/);
  assert.match(serverCode, /OPENAI_API_KEY/);
});

test("env example includes required LLM configuration keys", async () => {
  const envExample = await readFile(`${ROOT}/.env.example`, "utf8");
  assert.match(envExample, /^OPENAI_API_KEY=/m);
  assert.match(envExample, /^OPENAI_MODEL=/m);
  assert.match(envExample, /^LLM_ENABLED=/m);
  assert.match(envExample, /^ADDRESS_PROVIDER=/m);
  assert.match(envExample, /^GOOGLE_PLACES_API_KEY=/m);
  assert.match(envExample, /^LLM_USAGE_LOG_PATH=/m);
});

test("gitignore excludes local secrets and LLM usage logs", async () => {
  const gitignore = await readFile(`${ROOT}/.gitignore`, "utf8");
  assert.match(gitignore, /^\.env\.local$/m);
  assert.match(gitignore, /^\.env\.\*\.local$/m);
  assert.match(gitignore, /^logs\/llm-usage\.log$/m);
  assert.match(gitignore, /^logs\/llm-usage-\*\.log$/m);
});
