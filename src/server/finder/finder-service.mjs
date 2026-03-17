import { searchGooglePlacesNearby } from "./google-places-provider.mjs";
import { searchOverpassNearby } from "./overpass-provider.mjs";

export async function findNearbyLocations({
  lat = null,
  lng = null,
  radiusMeters = 8000,
  type = "store",
  googleApiKey = "",
  fetchImpl = globalThis.fetch,
  log = async () => {}
} = {}) {
  const googleResults = await searchGooglePlacesNearby({
    lat,
    lng,
    radiusMeters,
    type,
    apiKey: googleApiKey,
    fetchImpl,
    log
  });
  if (googleResults.length > 0) {
    return {
      results: googleResults,
      source: "google_places"
    };
  }

  const overpassResults = await searchOverpassNearby({
    lat,
    lng,
    radiusMeters,
    fetchImpl,
    log
  });
  if (overpassResults.length > 0) {
    return {
      results: overpassResults,
      source: "overpass_fallback"
    };
  }

  return {
    results: [],
    source: "none"
  };
}
