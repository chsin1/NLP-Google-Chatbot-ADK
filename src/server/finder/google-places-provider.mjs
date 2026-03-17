function toDirectionsUrl(lat, lng) {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`;
}

function clampRadiusMeters(radiusMeters = 8000) {
  const parsed = Number(radiusMeters);
  if (!Number.isFinite(parsed)) return 8000;
  const bounded = Math.max(0, Math.min(50000, parsed));
  if (bounded === 0) {
    return 100;
  }
  return Math.max(100, Math.round(bounded));
}

function scoreBellMatch(item = {}) {
  const name = String(item?.name || "").toLowerCase();
  const address = String(item?.vicinity || item?.formatted_address || "").toLowerCase();
  const types = Array.isArray(item?.types) ? item.types.map((value) => String(value || "").toLowerCase()) : [];

  let score = 0;
  if (name.includes("bell")) score += 20;
  if (/\bbell (store|mobility|mts|aliant)\b/.test(name)) score += 12;
  if (address.includes("bell")) score += 6;
  if (types.includes("electronics_store")) score += 2;
  if (types.includes("store")) score += 1;
  return score;
}

function rankBellStoreResults(results = []) {
  return [...results]
    .map((item, index) => ({ item, index, score: scoreBellMatch(item) }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.index - right.index;
    })
    .map((entry) => entry.item);
}

export async function geocodeAddressWithGooglePlaces({
  address = "",
  apiKey = "",
  fetchImpl = globalThis.fetch,
  log = async () => {}
} = {}) {
  const trimmedAddress = String(address || "").trim();
  if (!trimmedAddress || !apiKey || typeof fetchImpl !== "function") return null;

  const params = new URLSearchParams({
    input: trimmedAddress,
    inputtype: "textquery",
    fields: "place_id,name,formatted_address,geometry",
    region: "ca",
    key: apiKey
  });

  try {
    const response = await fetchImpl(
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?${params.toString()}`
    );
    if (!response.ok) {
      await log({
        level: "error",
        event: "finder_google_geocode_http_error",
        details: { status: response.status }
      });
      return null;
    }
    const payload = await response.json();
    const status = String(payload?.status || "");
    if (!["OK", "ZERO_RESULTS"].includes(status)) {
      await log({
        level: "error",
        event: "finder_google_geocode_api_error",
        details: { status }
      });
      return null;
    }
    const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
    const top = candidates[0];
    const lat = Number(top?.geometry?.location?.lat);
    const lng = Number(top?.geometry?.location?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      id: top?.place_id || null,
      name: top?.name || null,
      address: top?.formatted_address || trimmedAddress,
      lat,
      lng,
      source: "google_findplace"
    };
  } catch (error) {
    await log({
      level: "error",
      event: "finder_google_geocode_exception",
      details: { message: String(error?.message || "finder_google_geocode_failed") }
    });
    return null;
  }
}

export async function searchGooglePlacesNearby({
  lat = null,
  lng = null,
  radiusMeters = 8000,
  type = "store",
  apiKey = "",
  fetchImpl = globalThis.fetch,
  log = async () => {}
} = {}) {
  if (!apiKey || typeof fetchImpl !== "function") return [];
  if (typeof lat !== "number" || typeof lng !== "number") return [];

  const keyword = ["store", "bell_store", "bell"].includes(String(type || "").toLowerCase())
    ? "Bell store"
    : String(type || "Bell store");
  const params = new URLSearchParams({
    location: `${lat},${lng}`,
    radius: String(clampRadiusMeters(radiusMeters)),
    keyword,
    key: apiKey
  });

  try {
    const response = await fetchImpl(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`
    );
    if (!response.ok) {
      await log({
        level: "error",
        event: "finder_google_http_error",
        details: { status: response.status }
      });
      return [];
    }
    const payload = await response.json();
    const status = String(payload?.status || "");
    if (!["OK", "ZERO_RESULTS"].includes(status)) {
      await log({
        level: "error",
        event: "finder_google_api_error",
        details: { status }
      });
      return [];
    }
    const ranked = rankBellStoreResults(Array.isArray(payload?.results) ? payload.results : []);
    return ranked.slice(0, 12).map((item, idx) => {
      const pointLat = Number(item?.geometry?.location?.lat);
      const pointLng = Number(item?.geometry?.location?.lng);
      return {
        id: item.place_id || `google_${idx}`,
        name: item.name || "Store",
        address: item.vicinity || item.formatted_address || "",
        phone: item.formatted_phone_number || null,
        website: item.website || null,
        directionsUrl: toDirectionsUrl(pointLat, pointLng),
        lat: Number.isFinite(pointLat) ? pointLat : null,
        lng: Number.isFinite(pointLng) ? pointLng : null
      };
    });
  } catch (error) {
    await log({
      level: "error",
      event: "finder_google_exception",
      details: { message: String(error?.message || "finder_google_failed") }
    });
    return [];
  }
}
