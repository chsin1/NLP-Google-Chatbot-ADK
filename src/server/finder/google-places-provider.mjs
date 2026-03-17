function toDirectionsUrl(lat, lng) {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`;
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

  const keyword = type === "store" ? "Bell store" : String(type || "store");
  const params = new URLSearchParams({
    location: `${lat},${lng}`,
    radius: String(Math.max(1000, Math.min(50000, Number(radiusMeters || 8000)))),
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
    const results = Array.isArray(payload?.results) ? payload.results : [];
    return results.slice(0, 12).map((item, idx) => {
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
