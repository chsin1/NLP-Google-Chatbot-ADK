import { rankAddressSuggestions } from "./flow-utils.mjs";

export const TORONTO_BIAS_CENTER = {
  lat: 43.6532,
  lng: -79.3832
};

export const TORONTO_BIAS_RADIUS_METERS = 50_000;

const MIN_LOOKUP_QUERY_LENGTH = 3;
const TORONTO_TEXT_RE = /\btoronto\b/i;
const ONTARIO_CODE_RE = /\bON\b/i;
const CANADIAN_POSTAL_RE = /\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d\b/i;

function normalizeAddressToken(value = "") {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizePostalCode(raw = "") {
  const compact = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (compact.length !== 6) return "";
  return `${compact.slice(0, 3)} ${compact.slice(3)}`;
}

function normalizeSuggestionLabel(suggestion = {}) {
  return [suggestion.line1, suggestion.city, suggestion.province, suggestion.postalCode]
    .filter(Boolean)
    .join(", ");
}

function extractProvince(parts = []) {
  for (const value of parts) {
    const match = String(value || "").match(/\b([A-Z]{2})\b/);
    if (match) return match[1];
  }
  return "";
}

function extractPostalCode(text = "") {
  const match = String(text || "").match(CANADIAN_POSTAL_RE);
  return match ? normalizePostalCode(match[0]) : "";
}

function isTorontoSuggestion(suggestion = {}, prediction = {}) {
  const description = String(prediction.description || "");
  const secondary = String(prediction.structured_formatting?.secondary_text || "");
  return (
    TORONTO_TEXT_RE.test(suggestion.city || "") ||
    TORONTO_TEXT_RE.test(description) ||
    TORONTO_TEXT_RE.test(secondary)
  );
}

function isOntarioSuggestion(suggestion = {}, prediction = {}) {
  const description = String(prediction.description || "");
  return ONTARIO_CODE_RE.test(suggestion.province || "") || ONTARIO_CODE_RE.test(description);
}

function scoreSuggestion(suggestion = {}, prediction = {}, query = "") {
  let score = 0;
  const normalizedQuery = normalizeAddressToken(query);
  const normalizedLabel = normalizeAddressToken(normalizeSuggestionLabel(suggestion));
  const normalizedLine1 = normalizeAddressToken(suggestion.line1 || "");
  const predictionTypes = Array.isArray(prediction.types) ? prediction.types : [];

  if (isTorontoSuggestion(suggestion, prediction)) score += 100;
  if (isOntarioSuggestion(suggestion, prediction)) score += 20;

  if (normalizedQuery) {
    if (normalizedLine1.startsWith(normalizedQuery)) score += 12;
    else if (normalizedLabel.includes(normalizedQuery)) score += 6;
  }

  if (predictionTypes.some((type) => ["street_address", "premise", "subpremise", "route"].includes(type))) {
    score += 4;
  }

  return score;
}

export function buildGoogleAutocompleteParams({ query = "", apiKey = "" } = {}) {
  const input = String(query || "").trim();
  if (input.length < MIN_LOOKUP_QUERY_LENGTH || !apiKey) return null;
  return new URLSearchParams({
    input,
    key: apiKey,
    components: "country:ca",
    types: "address",
    location: `${TORONTO_BIAS_CENTER.lat},${TORONTO_BIAS_CENTER.lng}`,
    radius: String(TORONTO_BIAS_RADIUS_METERS)
  });
}

export function composeAddressLookupQuery(query = "", postalCodeHint = "") {
  const base = String(query || "").trim();
  const hintCompact = String(postalCodeHint || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!base) return "";
  if (hintCompact.length !== 6) return base;
  const hintFormatted = `${hintCompact.slice(0, 3)} ${hintCompact.slice(3)}`;
  const normalizedBase = normalizeAddressToken(base);
  const normalizedHintCompact = normalizeAddressToken(hintCompact);
  const normalizedHintFormatted = normalizeAddressToken(hintFormatted);
  if (normalizedBase.includes(normalizedHintCompact) || normalizedBase.includes(normalizedHintFormatted)) {
    return base;
  }
  return `${base} ${hintFormatted}`.trim();
}

export function mapGooglePredictionToSuggestion(prediction = {}) {
  const description = String(prediction.description || "").trim();
  const formatting = prediction.structured_formatting || {};
  const rawTerms = Array.isArray(prediction.terms) ? prediction.terms.map((term) => String(term?.value || "").trim()) : [];
  const terms = rawTerms.filter(Boolean);
  const descriptionParts = description.split(",").map((part) => part.trim()).filter(Boolean);
  const secondaryParts = String(formatting.secondary_text || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const line1 = String(formatting.main_text || terms[0] || descriptionParts[0] || "Address suggestion").trim();
  const city = String(secondaryParts[0] || descriptionParts[1] || "").trim();
  const province = extractProvince([secondaryParts[1], descriptionParts[2], ...terms]);
  const postalCode = extractPostalCode(description);

  return {
    id: prediction.place_id || description || `${line1}|${city}|${province}`,
    line1,
    city,
    province,
    postalCode,
    areaCode: null
  };
}

export function rankTorontoBiasedSuggestions(predictions = [], query = "") {
  if (!Array.isArray(predictions) || predictions.length === 0) return [];
  return predictions
    .map((prediction, index) => {
      const suggestion = mapGooglePredictionToSuggestion(prediction);
      return {
        suggestion,
        index,
        score: scoreSuggestion(suggestion, prediction, query)
      };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 5)
    .map((entry) => entry.suggestion);
}

export async function lookupGoogleSuggestions({
  query = "",
  apiKey = "",
  fetchImpl = globalThis.fetch,
  log = async () => {}
} = {}) {
  const input = String(query || "").trim();
  if (!apiKey) {
    await log({
      level: "info",
      event: "address_lookup_google_missing_key",
      details: { queryLength: input.length }
    });
    return [];
  }
  if (input.length < MIN_LOOKUP_QUERY_LENGTH) return [];
  if (typeof fetchImpl !== "function") {
    await log({
      level: "error",
      event: "address_lookup_google_fetch_unavailable",
      details: {}
    });
    return [];
  }

  try {
    const params = buildGoogleAutocompleteParams({ query: input, apiKey });
    if (!params) return [];
    const response = await fetchImpl(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`);
    if (!response.ok) {
      await log({
        level: "error",
        event: "address_lookup_google_http_error",
        details: { status: response.status }
      });
      return [];
    }

    const payload = await response.json();
    const status = String(payload?.status || "");
    if (status && status !== "OK" && status !== "ZERO_RESULTS") {
      await log({
        level: "error",
        event: "address_lookup_google_api_error",
        details: { status }
      });
      return [];
    }

    const predictions = Array.isArray(payload?.predictions) ? payload.predictions : [];
    if (status === "ZERO_RESULTS") return [];
    return rankTorontoBiasedSuggestions(predictions, input);
  } catch (error) {
    await log({
      level: "error",
      event: "address_lookup_google_exception",
      details: { message: String(error?.message || "lookup_failed") }
    });
    return [];
  }
}

export async function resolveAddressSuggestions({
  query = "",
  areaCode = "",
  postalCodeHint = "",
  provider = "mock",
  apiKey = "",
  fetchImpl = globalThis.fetch,
  log = async () => {}
} = {}) {
  const normalizedProvider = String(provider || "mock").toLowerCase();
  if (normalizedProvider === "mock") {
    return rankAddressSuggestions(query, areaCode);
  }
  if (normalizedProvider !== "google" && normalizedProvider !== "hybrid") {
    await log({
      level: "info",
      event: "address_lookup_provider_unknown",
      details: { provider: normalizedProvider }
    });
    return rankAddressSuggestions(query, areaCode);
  }

  const effectiveQuery = composeAddressLookupQuery(query, postalCodeHint);
  const googleSuggestions = await lookupGoogleSuggestions({
    query: effectiveQuery,
    apiKey,
    fetchImpl,
    log
  });
  if (googleSuggestions.length === 0) {
    await log({
      level: "info",
      event: "address_lookup_google_empty",
      details: {
        provider: normalizedProvider,
        queryLength: String(effectiveQuery || "").trim().length
      }
    });
  }
  // In google/hybrid mode we intentionally do not fallback to mock suggestions.
  return googleSuggestions;
}
