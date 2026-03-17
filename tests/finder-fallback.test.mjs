import test from "node:test";
import assert from "node:assert/strict";
import { findNearbyLocations } from "../src/server/finder/finder-service.mjs";

test("finder returns google source when google provider has results", async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes("nearbysearch")) {
      return {
        ok: true,
        async json() {
          return {
            status: "OK",
            results: [
              {
                place_id: "p1",
                name: "Bell Store A",
                vicinity: "100 King St W",
                geometry: { location: { lat: 43.65, lng: -79.38 } }
              }
            ]
          };
        }
      };
    }
    throw new Error("unexpected_url");
  };

  const result = await findNearbyLocations({
    lat: 43.65,
    lng: -79.38,
    googleApiKey: "demo",
    fetchImpl
  });
  assert.equal(result.source, "google_places");
  assert.equal(result.results.length, 1);
});

test("finder falls back to overpass when google has no results", async () => {
  const fetchImpl = async (url, options = {}) => {
    if (String(url).includes("nearbysearch")) {
      return {
        ok: true,
        async json() {
          return { status: "ZERO_RESULTS", results: [] };
        }
      };
    }
    if (String(url).includes("overpass-api.de")) {
      assert.equal(String(options.method || "GET").toUpperCase(), "POST");
      return {
        ok: true,
        async json() {
          return {
            elements: [
              {
                type: "node",
                id: 1001,
                lat: 43.66,
                lon: -79.4,
                tags: {
                  name: "Bell Partner",
                  phone: "+1 416-555-1111",
                  website: "https://example.com"
                }
              }
            ]
          };
        }
      };
    }
    throw new Error("unexpected_url");
  };

  const result = await findNearbyLocations({
    lat: 43.65,
    lng: -79.38,
    googleApiKey: "demo",
    fetchImpl
  });
  assert.equal(result.source, "overpass_fallback");
  assert.equal(result.results.length, 1);
});

test("finder returns none when both providers fail", async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes("nearbysearch")) {
      return {
        ok: false,
        status: 500,
        async json() {
          return {};
        }
      };
    }
    if (String(url).includes("overpass-api.de")) {
      return {
        ok: false,
        status: 503,
        async json() {
          return {};
        }
      };
    }
    throw new Error("unexpected_url");
  };
  const result = await findNearbyLocations({
    lat: 43.65,
    lng: -79.38,
    googleApiKey: "demo",
    fetchImpl
  });
  assert.equal(result.source, "none");
  assert.equal(result.results.length, 0);
});
