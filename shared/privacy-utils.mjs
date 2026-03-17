const EMAIL_REGEX = /\b([A-Za-z0-9._%+-]{1,64})@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;
const PHONE_REGEX = /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g;
const POSTAL_REGEX = /\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d\b/gi;
const ADDRESS_REGEX = /\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,6}\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Terrace|Trail|Crescent|Cres)\b[^\n]*/gi;

function digitsOnly(value = "") {
  return String(value || "").replace(/\D/g, "");
}

function maskPanLike(text = "") {
  return String(text || "").replace(/(?:\d[ -]*?){13,19}/g, (candidate) => {
    const digits = digitsOnly(candidate);
    if (digits.length < 13 || digits.length > 19) return candidate;
    const last4 = digits.slice(-4);
    return `**** **** **** ${last4}`;
  });
}

function maskCvcLike(text = "") {
  return String(text || "")
    .replace(/\b(cvc|cvv|security\s*code|card\s*code)\b\s*[:#-]?\s*\d{3,4}/gi, (match) =>
      match.replace(/\d{3,4}/g, "***")
    )
    .replace(/\b\d{3}\b(?=\s*(?:cvc|cvv|security\s*code|card\s*code))/gi, "***");
}

function maskEmail(value = "") {
  return String(value || "").replace(EMAIL_REGEX, (_match, local, domain) => {
    const left = local.length <= 2 ? `${local[0] || "*"}*` : `${local.slice(0, 2)}***`;
    return `${left}@${domain}`;
  });
}

function maskPhone(value = "") {
  return String(value || "").replace(PHONE_REGEX, (match) => {
    const digits = digitsOnly(match);
    if (digits.length < 10) return match;
    const normalized = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits.slice(-10);
    return `(***)-***-${normalized.slice(-4)}`;
  });
}

function maskPostal(value = "") {
  return String(value || "").replace(POSTAL_REGEX, "*** ***");
}

function maskAddress(value = "") {
  return String(value || "").replace(ADDRESS_REGEX, "[address redacted]");
}

export function redactPaymentText(text = "") {
  let output = String(text || "");
  output = maskPanLike(output);
  output = maskCvcLike(output);
  return output;
}

export function redactSensitiveText(text = "", { strict = true } = {}) {
  let output = redactPaymentText(String(text || ""));
  output = maskEmail(output);
  output = maskPhone(output);
  output = maskPostal(output);
  if (strict) {
    output = maskAddress(output);
  }
  return output;
}

export function hasRawSensitivePaymentData(value = "") {
  const text = typeof value === "string" ? value : JSON.stringify(value || {});
  const panCandidate = String(text || "").match(/(?:\d[ -]*?){13,19}/g) || [];
  const hasRawPan = panCandidate.some((candidate) => {
    const digits = digitsOnly(candidate);
    if (digits.length < 13 || digits.length > 19) return false;
    return !candidate.includes("*");
  });
  const hasRawCvc = /\b(cvc|cvv|security\s*code|card\s*code)\b\s*[:#-]?\s*\d{3,4}/i.test(String(text || ""));
  return hasRawPan || hasRawCvc;
}

export function redactSensitiveObject(value, opts = {}) {
  if (value == null) return value;

  if (typeof value === "string") {
    return redactSensitiveText(value, opts);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitiveObject(entry, opts));
  }

  if (typeof value === "object") {
    const output = {};
    for (const [key, raw] of Object.entries(value)) {
      const lowerKey = String(key || "").toLowerCase();
      if (raw == null) {
        output[key] = raw;
        continue;
      }

      if (typeof raw === "string") {
        if (/(^|_)(cvc|cvv)(_|$)/.test(lowerKey)) {
          output[key] = "***";
          continue;
        }
        if (/(^|_)(card|pan|cardnumber|card_number)(_|$)/.test(lowerKey)) {
          output[key] = redactPaymentText(raw);
          continue;
        }
        if (/(^|_)(email)(_|$)/.test(lowerKey)) {
          output[key] = maskEmail(raw);
          continue;
        }
        if (/(^|_)(phone|mobile)(_|$)/.test(lowerKey)) {
          output[key] = maskPhone(raw);
          continue;
        }
        if (/(^|_)(postal|zipcode|zip)(_|$)/.test(lowerKey)) {
          output[key] = maskPostal(raw);
          continue;
        }
        if (/(^|_)(address|line1|line2|street)(_|$)/.test(lowerKey)) {
          output[key] = opts.strict === false ? redactPaymentText(raw) : maskAddress(redactSensitiveText(raw, opts));
          continue;
        }
      }

      output[key] = redactSensitiveObject(raw, opts);
    }
    return output;
  }

  return value;
}
