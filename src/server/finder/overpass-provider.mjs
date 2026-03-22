function toDirectionsUrl(lat, lng) {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return `https://www.openstreetmap.org/directions?to=${encodeURIComponent(`${lat},${lng}`)}`;
}

function buildOverpassQuery(lat, lng, radiusMeters = 8000) {
  const radius = Math.max(1000, Math.min(50000, Number(radiusMeters || 8000)));
  return `
[out:json][timeout:15];
(
  node(around:${radius},${lat},${lng})["shop"="mobile_phone"]["name"~"bell",i];
  way(around:${radius},${lat},${lng})["shop"="mobile_phone"]["name"~"bell",i];
  relation(around:${radius},${lat},${lng})["shop"="mobile_phone"]["name"~"bell",i];
);
out center 20;
`;
}

function mapElementToResult(element = {}, idx = 0) {
  const tags = element.tags || {};
  const lat =
    typeof element.lat === "number"
      ? element.lat
      : typeof element.center?.lat === "number"
        ? element.center.lat
        : null;
  const lng =
    typeof element.lon === "number"
      ? element.lon
      : typeof element.center?.lon === "number"
        ? element.center.lon
        : null;
  const address = [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"], tags["addr:postcode"]]
    .filter(Boolean)
    .join(" ");

  return {
    id: `osm_${element.type || "node"}_${element.id || idx}`,
    name: tags.name || "Store",
    address,
    phone: tags.phone || null,
    website: tags.website || null,
    directionsUrl: toDirectionsUrl(lat, lng),
    lat,
    lng
  };
}

export async function searchOverpassNearby({
  lat = null,
  lng = null,
  radiusMeters = 8000,
  fetchImpl = globalThis.fetch,
  log = async () => {}
} = {}) {
  if (typeof fetchImpl !== "function") return [];
  if (typeof lat !== "number" || typeof lng !== "number") return [];

  try {
    const response = await fetchImpl("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
      },
      body: new URLSearchParams({
        data: buildOverpassQuery(lat, lng, radiusMeters)
      }).toString()
    });
    if (!response.ok) {
      await log({
        level: "error",
        event: "finder_overpass_http_error",
        details: { status: response.status }
      });
      return [];
    }
    const payload = await response.json();
    const elements = Array.isArray(payload?.elements) ? payload.elements : [];
    return elements.slice(0, 12).map((element, idx) => mapElementToResult(element, idx));
  } catch (error) {
    await log({
      level: "error",
      event: "finder_overpass_exception",
      details: { message: String(error?.message || "finder_overpass_failed") }
    });
    return [];
  }
}
