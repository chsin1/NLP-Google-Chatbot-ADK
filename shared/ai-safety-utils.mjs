export const PROMPT_VERSION = "2026-03-17.1";
export const SAFETY_POLICY_VERSION = "2026-03-17.1";

export const SAFETY_POLICY_CATEGORIES = [
  "prompt_injection",
  "data_exfiltration",
  "violence_weapons",
  "sexual_explicit",
  "human_abuse_harassment",
  "substance_abuse",
  "trolling_off_topic",
  "malicious_off_topic"
];

const LEET_MAP = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  "$": "s"
};

const INPUT_PATTERNS = [
  {
    category: "prompt_injection",
    action: "block_with_safe_reply",
    regex: /(ignore\s+(all\s+)?(previous|prior)\s+instructions|jailbreak|developer\s*mode|system\s+prompt|reveal\s+hidden\s+instructions|override\s+policy|prompt\s*hack|bypass\s+guardrails?|dan\s+mode)/i
  },
  {
    category: "data_exfiltration",
    action: "block_with_safe_reply",
    regex: /(dump\s+(database|db)|exfiltrat|steal\s+data|show\s+api\s+key|credentials?|token\s+list|password\s+list|secret\s+key|private\s+key|leak\s+data)/i
  },
  {
    category: "violence_weapons",
    action: "block_with_safe_reply",
    regex: /(build\s+a\s+bomb|make\s+explosive|weapon\s+plans?|shoot\s+someone|stab\s+someone|kill\s+people|assassinat|terror\s+attack)/i
  },
  {
    category: "sexual_explicit",
    action: "block_with_safe_reply",
    regex: /(explicit\s+sex|porn|sexual\s+content|nude\s+photos?|xxx|fetish|erotic)/i
  },
  {
    category: "human_abuse_harassment",
    action: "allow_with_warning",
    regex: /(idiot|stupid|hate\s+you|kill\s+yourself|dumb\s+bot|go\s+die|moron|loser|harass)/i
  },
  {
    category: "substance_abuse",
    action: "allow_with_warning",
    regex: /(how\s+to\s+buy\s+drugs|cook\s+meth|illegal\s+drugs?|opioid\s+abuse|overdose\s+tips)/i
  },
  {
    category: "trolling_off_topic",
    action: "allow_with_warning",
    regex: /(say\s+something\s+random|just\s+joking\s+spam|waste\s+time|nonsense\s+loop|troll\s+mode)/i
  },
  {
    category: "malicious_off_topic",
    action: "block_with_safe_reply",
    regex: /(build\s+(malware|ransomware)|sql\s+injection|xss\s+payload|exploit\s+code|weapon\s+build|ddos|botnet|credential\s+stuffing)/i
  }
];

const OUTPUT_BLOCK_PATTERNS = [
  /(credit\s+(approved|declined))/i,
  /(inventory\s+(count|is)|in\s+stock|out\s+of\s+stock)/i,
  /(promo\s+eligib(le|ility))/i,
  /(payment\s+(executed|processed|charged))/i,
  /(order\s+(confirmed|finalized))/i,
  /(billing\s+balance)/i
];

export function normalizeSafetyText(text = "") {
  const raw = String(text || "").toLowerCase();
  return raw
    .split("")
    .map((ch) => LEET_MAP[ch] || ch)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

export function screenInputSafety(text = "") {
  const normalized = normalizeSafetyText(text);
  for (const rule of INPUT_PATTERNS) {
    if (rule.regex.test(normalized)) {
      return {
        action: rule.action,
        policyCategory: rule.category,
        safetyAction: rule.action.includes("block") ? "block" : "warn",
        reason: `Matched ${rule.category}`,
        normalizedText: normalized
      };
    }
  }

  return {
    action: "allow",
    policyCategory: null,
    safetyAction: "allow",
    reason: null,
    normalizedText: normalized
  };
}

function deterministicEnvelopeHas(text = "", deterministicData = {}) {
  const envelope = JSON.stringify(deterministicData || {}).toLowerCase();
  const numbers = String(text || "").match(/\$\s?\d+[\d,.]*/g) || [];
  if (!numbers.length) return true;
  return numbers.every((token) => envelope.includes(token.toLowerCase().replace(/\s+/g, "")) || envelope.includes(token.toLowerCase()));
}

export function screenOutputSafety(text = "", deterministicData = {}) {
  const value = String(text || "").trim();
  for (const pattern of OUTPUT_BLOCK_PATTERNS) {
    if (pattern.test(value)) {
      return {
        action: "block_with_safe_reply",
        policyCategory: "unauthorized_authoritative_claim",
        safetyAction: "block",
        reason: "Output included restricted authoritative claim"
      };
    }
  }

  if (!deterministicEnvelopeHas(value, deterministicData)) {
    return {
      action: "allow_with_warning",
      policyCategory: "deterministic_envelope_mismatch",
      safetyAction: "warn",
      reason: "Output contains values not found in deterministic envelope"
    };
  }

  return {
    action: "allow",
    policyCategory: null,
    safetyAction: "allow",
    reason: null
  };
}

export function getSafetyFallbackReply(category = null) {
  if (category === "prompt_injection" || category === "data_exfiltration") {
    return "I can’t help with that request. I can continue with product guidance, checkout, or account-safe support steps.";
  }
  if (category === "violence_weapons" || category === "sexual_explicit" || category === "malicious_off_topic") {
    return "I can’t assist with that request. I can continue with telecom product selection, booking, and account-safe support.";
  }
  if (category === "human_abuse_harassment" || category === "substance_abuse" || category === "trolling_off_topic") {
    return "I’m here to help. If you share your goal, I’ll continue with the next best step.";
  }
  return "I can continue with safe account and sales support. Tell me what you want to do next.";
}
