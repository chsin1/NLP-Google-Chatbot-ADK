import { geocodeAddressWithGooglePlaces, searchGooglePlacesNearby } from "./google-places-provider.mjs";
import { searchOverpassNearby } from "./overpass-provider.mjs";

function toFiniteCoordinate(value, { min = -180, max = 180 } = {}) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num < min || num > max) return null;
  return num;
}

function normalizeRadiusMeters(value = 8000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 8000;
  const bounded = Math.max(0, Math.min(50000, parsed));
  if (bounded === 0) {
    return 100;
  }
  return Math.max(100, Math.round(bounded));
}

function toDistanceKm(fromLat, fromLng, toLat, toLng) {
  if (![fromLat, fromLng, toLat, toLng].every((value) => typeof value === "number" && Number.isFinite(value))) {
    return null;
  }
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthKm = 6371;
  const dLat = toRadians(toLat - fromLat);
  const dLng = toRadians(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(dLng / 2) ** 2;
  const distance = 2 * earthKm * Math.asin(Math.sqrt(a));
  return Number.isFinite(distance) ? Number(distance.toFixed(1)) : null;
}

function attachDistanceAndSort(rows = [], { lat, lng } = {}) {
  return [...rows]
    .map((row) => ({
      ...row,
      distanceKm: toDistanceKm(lat, lng, toFiniteCoordinate(row?.lat), toFiniteCoordinate(row?.lng))
    }))
    .sort((left, right) => {
      if (left.distanceKm == null && right.distanceKm == null) return 0;
      if (left.distanceKm == null) return 1;
      if (right.distanceKm == null) return -1;
      return left.distanceKm - right.distanceKm;
    });
}

export async function findNearbyLocations({
  lat = null,
  lng = null,
  address = "",
  radiusMeters = 8000,
  type = "store",
  googleApiKey = "",
  fetchImpl = globalThis.fetch,
  log = async () => {}
} = {}) {
  let centerLat = toFiniteCoordinate(lat, { min: -90, max: 90 });
  let centerLng = toFiniteCoordinate(lng, { min: -180, max: 180 });
  let centerAddress = null;
  let centerSource = "coordinates";
  const normalizedRadius = normalizeRadiusMeters(radiusMeters);

  if ((centerLat == null || centerLng == null) && String(address || "").trim()) {
    const geocoded = await geocodeAddressWithGooglePlaces({
      address,
      apiKey: googleApiKey,
      fetchImpl,
      log
    });
    if (geocoded) {
      centerLat = geocoded.lat;
      centerLng = geocoded.lng;
      centerAddress = geocoded.address;
      centerSource = geocoded.source || "address_lookup";
    }
  }

  if (centerLat == null || centerLng == null) {
    return {
      results: [],
      source: "none",
      reason: String(address || "").trim() ? "address_not_found" : "missing_center",
      center: null,
      radiusMeters: normalizedRadius
    };
  }

  const googleResults = await searchGooglePlacesNearby({
    lat: centerLat,
    lng: centerLng,
    radiusMeters: normalizedRadius,
    type,
    apiKey: googleApiKey,
    fetchImpl,
    log
  });
  if (googleResults.length > 0) {
    return {
      results: attachDistanceAndSort(googleResults, { lat: centerLat, lng: centerLng }),
      source: "google_places",
      center: {
        lat: centerLat,
        lng: centerLng,
        address: centerAddress,
        source: centerSource
      },
      radiusMeters: normalizedRadius
    };
  }

  const overpassResults = await searchOverpassNearby({
    lat: centerLat,
    lng: centerLng,
    radiusMeters: normalizedRadius,
    fetchImpl,
    log
  });
  if (overpassResults.length > 0) {
    return {
      results: attachDistanceAndSort(overpassResults, { lat: centerLat, lng: centerLng }),
      source: "overpass_fallback",
      center: {
        lat: centerLat,
        lng: centerLng,
        address: centerAddress,
        source: centerSource
      },
      radiusMeters: normalizedRadius
    };
  }

  return {
    results: [],
    source: "none",
    center: {
      lat: centerLat,
      lng: centerLng,
      address: centerAddress,
      source: centerSource
    },
    radiusMeters: normalizedRadius
  };
}
