import test from "node:test";
import assert from "node:assert/strict";
import { findNearbyLocations } from "../src/server/finder/finder-service.mjs";

test("finder resolves address via Google Places then searches nearby Bell stores", async () => {
  const fetchImpl = async (url) => {
    const rawUrl = String(url);
    if (rawUrl.includes("findplacefromtext")) {
      return {
        ok: true,
        async json() {
          return {
            status: "OK",
            candidates: [
              {
                place_id: "address_1",
                name: "16 Yonge Street",
                formatted_address: "16 Yonge St, Toronto, ON M5E 1R4, Canada",
                geometry: {
                  location: {
                    lat: 43.6426,
                    lng: -79.3818
                  }
                }
              }
            ]
          };
        }
      };
    }
    if (rawUrl.includes("nearbysearch")) {
      const parsed = new URL(rawUrl);
      assert.equal(parsed.searchParams.get("location"), "43.6426,-79.3818");
      assert.equal(parsed.searchParams.get("radius"), "25000");
      return {
        ok: true,
        async json() {
          return {
            status: "OK",
            results: [
              {
                place_id: "bell_1",
                name: "Bell Store Toronto",
                vicinity: "100 King St W, Toronto",
                geometry: {
                  location: {
                    lat: 43.648,
                    lng: -79.382
                  }
                }
              }
            ]
          };
        }
      };
    }
    throw new Error("unexpected_url");
  };

  const payload = await findNearbyLocations({
    address: "16 Yonge Street, Toronto, ON",
    radiusMeters: 25000,
    type: "bell_store",
    googleApiKey: "demo",
    fetchImpl
  });

  assert.equal(payload.source, "google_places");
  assert.equal(payload.reason, undefined);
  assert.equal(payload.center?.source, "google_findplace");
  assert.equal(payload.center?.address, "16 Yonge St, Toronto, ON M5E 1R4, Canada");
  assert.equal(payload.results.length, 1);
  assert.equal(payload.radiusMeters, 25000);
  assert.equal(typeof payload.results[0].distanceKm, "number");
});

test("finder returns address_not_found when address geocoding has no candidates", async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes("findplacefromtext")) {
      return {
        ok: true,
        async json() {
          return {
            status: "ZERO_RESULTS",
            candidates: []
          };
        }
      };
    }
    throw new Error("unexpected_url");
  };

  const payload = await findNearbyLocations({
    address: "Unknown Address",
    googleApiKey: "demo",
    fetchImpl
  });

  assert.equal(payload.source, "none");
  assert.equal(payload.reason, "address_not_found");
  assert.equal(payload.results.length, 0);
  assert.equal(payload.center, null);
});

test("finder normalizes zero radius to smallest valid Google radius", async () => {
  const fetchImpl = async (url) => {
    const rawUrl = String(url);
    if (rawUrl.includes("nearbysearch")) {
      const parsed = new URL(rawUrl);
      assert.equal(parsed.searchParams.get("radius"), "100");
      return {
        ok: true,
        async json() {
          return {
            status: "ZERO_RESULTS",
            results: []
          };
        }
      };
    }
    if (rawUrl.includes("overpass-api.de")) {
      return {
        ok: true,
        async json() {
          return { elements: [] };
        }
      };
    }
    throw new Error("unexpected_url");
  };

  const payload = await findNearbyLocations({
    lat: 43.65,
    lng: -79.38,
    radiusMeters: 0,
    googleApiKey: "demo",
    fetchImpl
  });

  assert.equal(payload.radiusMeters, 100);
});
