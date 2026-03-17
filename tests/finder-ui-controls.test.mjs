import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ROOT = "/Users/alexkatzighera/Documents/NLP Google Chatbot";

test("finder panel includes Bell search controls and 0-50km radius slider", async () => {
  const indexCode = await readFile(`${ROOT}/index.html`, "utf8");
  assert.match(indexCode, /id="finder-mode-address"/);
  assert.match(indexCode, /id="finder-mode-current"/);
  assert.match(indexCode, /id="finder-radius-range"/);
  assert.match(indexCode, /min="0"/);
  assert.match(indexCode, /max="50"/);
  assert.match(indexCode, /id="finder-refresh-btn"/);
});

test("finder client logic supports entered-address and current-location modes", async () => {
  const appCode = await readFile(`${ROOT}/app.js`, "utf8");
  assert.match(appCode, /function clampFinderRadiusKm/);
  assert.match(appCode, /function syncFinderControls/);
  assert.match(appCode, /function loadNearbyBellStores/);
  assert.match(appCode, /params\.set\("address", uiState\.serviceAddress\)/);
  assert.match(appCode, /params\.set\("lat", String\(lat\)\)/);
  assert.match(appCode, /params\.set\("lng", String\(lng\)\)/);
  assert.match(appCode, /radius: String\(clampFinderRadiusKm\(uiState\.radiusKm\) \* 1000\)/);
});
