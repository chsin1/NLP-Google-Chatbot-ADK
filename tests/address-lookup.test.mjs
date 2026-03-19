import test from "node:test";
import assert from "node:assert/strict";
import {
  TORONTO_BIAS_CENTER,
  TORONTO_BIAS_RADIUS_METERS,
  buildGoogleAutocompleteParams,
  composeAddressLookupQuery,
  rankTorontoBiasedSuggestions,
  resolveAddressSuggestions
} from "../shared/address-lookup-utils.mjs";

test("buildGoogleAutocompleteParams includes country and Toronto geo bias", () => {
  const params = buildGoogleAutocompleteParams({
    query: "16 yonge",
    apiKey: "demo_key"
  });
  assert.ok(params);
  assert.equal(params.get("components"), "country:ca");
  assert.equal(params.get("types"), "address");
  assert.equal(params.get("location"), `${TORONTO_BIAS_CENTER.lat},${TORONTO_BIAS_CENTER.lng}`);
  assert.equal(params.get("radius"), String(TORONTO_BIAS_RADIUS_METERS));
});

test("rankTorontoBiasedSuggestions ranks Toronto entries before non-Toronto", () => {
  const suggestions = rankTorontoBiasedSuggestions(
    [
      {
        description: "123 Wellington St W, Ottawa, ON, Canada",
        place_id: "ottawa_1",
        structured_formatting: {
          main_text: "123 Wellington St W",
          secondary_text: "Ottawa, ON, Canada"
        },
        types: ["street_address"]
      },
      {
        description: "16 Yonge Street, Toronto, ON, Canada",
        place_id: "toronto_1",
        structured_formatting: {
          main_text: "16 Yonge Street",
          secondary_text: "Toronto, ON, Canada"
        },
        types: ["street_address"]
      }
    ],
    "16 yonge"
  );
  assert.equal(suggestions.length, 2);
  assert.equal(suggestions[0].id, "toronto_1");
  assert.equal(suggestions[0].city, "Toronto");
});

test("composeAddressLookupQuery appends postal hint once when missing", () => {
  const composed = composeAddressLookupQuery("16 Yonge Street, Toronto, ON", "M5V2T6");
  assert.equal(composed, "16 Yonge Street, Toronto, ON M5V 2T6");
  const alreadyPresent = composeAddressLookupQuery("16 Yonge Street, Toronto, ON M5V 2T6", "M5V2T6");
  assert.equal(alreadyPresent, "16 Yonge Street, Toronto, ON M5V 2T6");
});

test("resolveAddressSuggestions in google/hybrid mode returns empty when Google has no results", async () => {
  const fetchImpl = async () => ({
    ok: true,
    async json() {
      return { status: "ZERO_RESULTS", predictions: [] };
    }
  });
  const google = await resolveAddressSuggestions({
    provider: "google",
    query: "front",
    areaCode: "416",
    apiKey: "demo_key",
    fetchImpl
  });
  const hybrid = await resolveAddressSuggestions({
    provider: "hybrid",
    query: "front",
    areaCode: "416",
    apiKey: "demo_key",
    fetchImpl
  });
  assert.deepEqual(google, []);
  assert.deepEqual(hybrid, []);
});

test("resolveAddressSuggestions in mock mode preserves deterministic fallback", async () => {
  const suggestions = await resolveAddressSuggestions({
    provider: "mock",
    query: "front",
    areaCode: "416",
    apiKey: ""
  });
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].line1, "45 Front St W");
});
