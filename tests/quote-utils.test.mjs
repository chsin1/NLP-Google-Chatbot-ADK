import test from "node:test";
import assert from "node:assert/strict";
import { buildQuotePreview } from "../shared/quote-utils.mjs";

const offerSet = [
  {
    id: "internet-001",
    category: "home internet",
    name: "Fibe Gigabit 1.5",
    description: "Up to 1.5 Gbps download and up to 940 Mbps upload.",
    monthlyPrice: 110,
    devicePrice: null,
    installationFee: 25
  },
  {
    id: "internet-002",
    category: "home internet",
    name: "Fibe 500",
    description: "Balanced download and upload for hybrid work.",
    monthlyPrice: 90,
    devicePrice: null,
    installationFee: 25
  },
  {
    id: "internet-003",
    category: "home internet",
    name: "Fibe 150",
    description: "Budget friendly internet with dependable performance.",
    monthlyPrice: 75,
    devicePrice: null,
    installationFee: 25
  },
  {
    id: "mob-001",
    category: "mobility",
    name: "iPhone 16 + 5G Essential 100",
    description: "Bell-style mobility plan with financing.",
    monthlyPrice: 89,
    devicePrice: 899
  }
];

test("buildQuotePreview returns deterministic ranking for same input", () => {
  const input = {
    serviceType: "home internet",
    preferences: { budget: 80, speed: 20, deviceCost: 10 },
    offers: offerSet,
    maxResults: 3
  };
  const first = buildQuotePreview(input);
  const second = buildQuotePreview(input);
  assert.deepEqual(first, second);
});

test("buildQuotePreview filters by service and caps results", () => {
  const result = buildQuotePreview({
    serviceType: "home internet",
    preferences: { budget: 50, speed: 50, deviceCost: 20 },
    offers: offerSet,
    maxResults: 2
  });
  assert.equal(result.quotes.length, 2);
  assert.ok(result.quotes.every((quote) => quote.category === "home internet"));
});

test("budget-heavy preferences prioritize lower monthly plan", () => {
  const result = buildQuotePreview({
    serviceType: "internet",
    preferences: { budget: 100, speed: 0, deviceCost: 0 },
    offers: offerSet,
    maxResults: 3
  });
  assert.equal(result.quotes[0].offerId, "internet-003");
});

test("speed-heavy preferences prioritize top-speed plan", () => {
  const result = buildQuotePreview({
    serviceType: "internet",
    preferences: { budget: 0, speed: 100, deviceCost: 0 },
    offers: offerSet,
    maxResults: 3
  });
  assert.equal(result.quotes[0].offerId, "internet-001");
});
