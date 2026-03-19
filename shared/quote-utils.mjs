function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeWeights(preferences = {}) {
  const budget = clamp(asNumber(preferences.budget, 50), 0, 100);
  const speed = clamp(asNumber(preferences.speed, 50), 0, 100);
  const deviceCost = clamp(asNumber(preferences.deviceCost, 50), 0, 100);
  const total = budget + speed + deviceCost;
  if (total <= 0) {
    return {
      budget: 0.4,
      speed: 0.4,
      deviceCost: 0.2
    };
  }
  return {
    budget: budget / total,
    speed: speed / total,
    deviceCost: deviceCost / total
  };
}

function speedSignal(offer = {}) {
  const text = `${offer.name || ""} ${offer.description || ""}`.toLowerCase();
  const gigabitMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:g|gbps|gigabit)/i);
  if (gigabitMatch) {
    return asNumber(gigabitMatch[1], 1) * 1000;
  }
  const mbpsMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:mbps|mb\/s|fibe\s*\d+)/i);
  if (mbpsMatch) {
    return asNumber(mbpsMatch[1], 0);
  }
  const plainTier = text.match(/\b(75|100|150|300|500|940|1000|1500)\b/);
  if (plainTier) return asNumber(plainTier[1], 0);
  return 250;
}

function minMaxNormalize(value, min, max, { invert = false } = {}) {
  if (max === min) return 1;
  const ratio = (value - min) / (max - min);
  const normalized = invert ? 1 - ratio : ratio;
  return clamp(normalized, 0, 1);
}

function resolveReasons(offer, scores = {}, weights = {}) {
  const weightedSignals = [
    {
      key: "budget",
      weighted: scores.monthly * weights.budget,
      reason:
        "Lower monthly price aligns with your budget preference."
    },
    {
      key: "speed",
      weighted: scores.speed * weights.speed,
      reason:
        "Speed profile aligns with your performance target."
    },
    {
      key: "deviceCost",
      weighted: scores.device * weights.deviceCost,
      reason:
        "Upfront/device cost profile aligns with your cost preference."
    }
  ]
    .sort((a, b) => b.weighted - a.weighted)
    .slice(0, 2)
    .map((item) => item.reason);

  const install = asNumber(offer.installationFee, 0);
  if (install > 0) {
    weightedSignals.push(`Estimated installation fee: CAD ${install.toFixed(2)}.`);
  }
  return weightedSignals.slice(0, 3);
}

function normalizeServiceType(serviceType = "") {
  const value = String(serviceType || "").toLowerCase().trim();
  if (value === "internet") return "home internet";
  if (value === "home internet") return "home internet";
  if (value === "mobility") return "mobility";
  if (value === "landline" || value === "home phone") return "landline";
  return "home internet";
}

export function buildQuotePreview({
  serviceType = "home internet",
  preferences = {},
  offers = [],
  maxResults = 3
} = {}) {
  const normalizedService = normalizeServiceType(serviceType);
  const candidates = (Array.isArray(offers) ? offers : [])
    .filter((offer) => String(offer.category || "").toLowerCase() === normalizedService)
    .map((offer) => ({
      id: offer.id,
      name: offer.name || "Unnamed offer",
      category: normalizedService,
      monthlyPrice: asNumber(offer.monthlyPrice, 0),
      devicePrice: offer.devicePrice == null ? 0 : asNumber(offer.devicePrice, 0),
      contractMonths: asNumber(offer.contractMonths, 24),
      installationFee: asNumber(offer.installationFee, 0),
      description: offer.description || ""
    }));

  if (!candidates.length) {
    return {
      serviceType: normalizedService,
      preferences: normalizeWeights(preferences),
      quotes: [],
      explanation: "No quote candidates are available for the selected service."
    };
  }

  const weights = normalizeWeights(preferences);
  const monthlyValues = candidates.map((offer) => offer.monthlyPrice);
  const speedValues = candidates.map((offer) => speedSignal(offer));
  const deviceValues = candidates.map((offer) => offer.devicePrice);
  const monthlyMin = Math.min(...monthlyValues);
  const monthlyMax = Math.max(...monthlyValues);
  const speedMin = Math.min(...speedValues);
  const speedMax = Math.max(...speedValues);
  const deviceMin = Math.min(...deviceValues);
  const deviceMax = Math.max(...deviceValues);

  const ranked = candidates
    .map((offer) => {
      const monthlyScore = minMaxNormalize(offer.monthlyPrice, monthlyMin, monthlyMax, { invert: true });
      const speedScore = minMaxNormalize(speedSignal(offer), speedMin, speedMax);
      const deviceScore = minMaxNormalize(offer.devicePrice, deviceMin, deviceMax, { invert: true });
      const totalScore = Number(
        (
          monthlyScore * weights.budget +
          speedScore * weights.speed +
          deviceScore * weights.deviceCost
        ).toFixed(4)
      );
      return {
        offerId: offer.id,
        name: offer.name,
        category: offer.category,
        monthlyPrice: offer.monthlyPrice,
        devicePrice: offer.devicePrice,
        contractMonths: offer.contractMonths,
        installationFee: offer.installationFee,
        score: totalScore,
        reasons: resolveReasons(offer, { monthly: monthlyScore, speed: speedScore, device: deviceScore }, weights)
      };
    })
    .sort((a, b) => b.score - a.score || a.monthlyPrice - b.monthlyPrice)
    .slice(0, clamp(asNumber(maxResults, 3), 1, 5))
    .map((quote, idx) => ({
      ...quote,
      rank: idx + 1
    }));

  return {
    serviceType: normalizedService,
    preferences: weights,
    quotes: ranked,
    explanation:
      "Quotes are ranked deterministically from your budget, speed, and device-cost preferences."
  };
}
