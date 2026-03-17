const CANADIAN_AREA_CODES = new Set([
  "204", "226", "236", "249", "250", "263", "289", "306", "343", "354",
  "365", "367", "368", "382", "403", "416", "418", "431", "437", "438",
  "450", "468", "474", "506", "514", "519", "548", "579", "581", "584",
  "587", "604", "613", "639", "647", "672", "683", "705", "709", "742",
  "753", "778", "780", "782", "807", "819", "825", "867", "873", "879",
  "902", "905", "942", "986"
]);

export function normalizeCanadianPhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  if (digits.length === 10) return digits;
  return "";
}

export function isValidCanadianAreaCode(areaCode) {
  const normalized = String(areaCode || "").trim();
  return /^\d{3}$/.test(normalized) && CANADIAN_AREA_CODES.has(normalized);
}

export function isValidCanadianPhone(raw) {
  const normalized = normalizeCanadianPhone(raw);
  if (!normalized) return false;
  return isValidCanadianAreaCode(normalized.slice(0, 3));
}

export function isValidEmail(raw) {
  const value = String(raw || "").trim();
  if (!value) return false;
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/i.test(value);
}

export function isValidCanadianPostalCode(raw) {
  const value = String(raw || "").trim().toUpperCase();
  return /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d$/.test(value);
}

export function parseCombinedOnboardingInput(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const emailMatch = raw.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/i);
  const phoneMatch =
    raw.match(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/) || raw.match(/\b\d{10}\b/);

  const email = emailMatch ? emailMatch[0].toLowerCase() : "";
  const phone = phoneMatch ? normalizeCanadianPhone(phoneMatch[0]) : "";

  let nameCandidate = raw;
  if (emailMatch) {
    nameCandidate = nameCandidate.replace(emailMatch[0], " ");
  }
  if (phoneMatch) {
    nameCandidate = nameCandidate.replace(phoneMatch[0], " ");
  }

  nameCandidate = nameCandidate
    .replace(/\b(full\s*name|name|email|e-mail|phone|telephone|tel)\b[:=-]*/gi, " ")
    .replace(/[;,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!nameCandidate) {
    const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length > 0 && !parts[0].includes("@")) {
      nameCandidate = parts[0];
    }
  }

  if (!nameCandidate || !email || !phone) return null;
  if (!/^[A-Za-z][A-Za-z' -]{1,}$/.test(nameCandidate)) return null;
  return {
    fullName: nameCandidate,
    email,
    phone
  };
}

export function detectCardBrand(cardNumber = "") {
  const digits = String(cardNumber || "").replace(/\D/g, "");
  if (!digits) return null;

  if (/^4\d{12}(\d{3}){0,2}$/.test(digits)) return "visa";
  if (/^3[47]\d{13}$/.test(digits)) return "amex";
  if (/^(5[1-5]\d{14}|2(2[2-9]\d{12}|[3-6]\d{13}|7([01]\d{12}|20\d{12})))$/.test(digits)) return "mastercard";
  return null;
}

export function normalizeCardDigits(raw = "") {
  return String(raw || "").replace(/\D/g, "");
}

export function isValidCardNumber16(raw = "") {
  return normalizeCardDigits(raw).length === 16;
}

export function isValidCardNumberLuhn(cardNumber = "") {
  const digits = String(cardNumber || "").replace(/\D/g, "");
  if (!digits) return false;

  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (Number.isNaN(digit)) return false;
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

export function isValidCardLengthByBrand(cardNumber = "", brand = null) {
  const digits = String(cardNumber || "").replace(/\D/g, "");
  if (!digits || !brand) return false;
  if (brand === "visa") return [13, 16, 19].includes(digits.length);
  if (brand === "mastercard") return digits.length === 16;
  if (brand === "amex") return digits.length === 15;
  return false;
}

export function isValidCvcByBrand(cvc = "", brand = null) {
  const digits = String(cvc || "").replace(/\D/g, "");
  if (!brand) return false;
  if (brand === "amex") return /^\d{4}$/.test(digits);
  return /^\d{3}$/.test(digits);
}

export function isValidAddress(raw) {
  const value = String(raw || "").trim();
  if (value.length < 10) return false;
  if (!/\d+/.test(value)) return false;
  // Basic structure check for street + locality tokens.
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length >= 2;
}

export function formatPhone(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 10);
  if (digits.length !== 10) return value || "not provided";
  return `(${digits.slice(0, 3)})-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function maskEmail(email) {
  if (!email || !email.includes("@")) return "not provided";
  const [local, domain] = email.split("@");
  const maskedLocal = local.length <= 2 ? `${local[0] || "*"}*` : `${local.slice(0, 2)}***`;
  return `${maskedLocal}@${domain}`;
}

export function inferAuthContact(user, rawIdentifier = "") {
  const raw = String(rawIdentifier || "").trim();
  const looksLikeEmail = raw.includes("@");
  if (looksLikeEmail) {
    return {
      phone: user.phone,
      email: raw.toLowerCase()
    };
  }

  const digits = raw.replace(/\D/g, "");
  return {
    phone: digits.length >= 10 ? digits.slice(0, 10) : user.phone,
    email: user.email
  };
}

export function deriveAreaCodeFromProfile(authUser = null, rawPhone = "") {
  const preferred = String(rawPhone || "").replace(/\D/g, "");
  const profilePhone = String(authUser?.phone || "").replace(/\D/g, "");
  const source = preferred || profilePhone;
  if (source.length < 3) return null;
  const areaCode = source.slice(0, 3);
  return /^\d{3}$/.test(areaCode) ? areaCode : null;
}

export function getExpectedLast4(method, user) {
  if (method === "visa") return "2781";
  if (method === "mastercard") return "7891";
  if (method === "amex") return "6531";
  if (method === "existing") return user?.savedCardLast4 || "2781";
  return "0000";
}

export function canAccessOfferBrowse(context = {}) {
  const hasAreaCode = Boolean(context.areaCode);
  const hasValidatedAddress = Boolean(context.serviceAddressValidated);
  const hasIntent = Boolean(context.intent);
  const hasClarification = hasSalesClarification(context);
  if ((!hasAreaCode && !hasValidatedAddress) || !hasIntent || !hasClarification) return false;

  if (context?.consent?.profile?.status === "declined") {
    return true;
  }

  // Service address is validated later in checkout eligibility flow.
  if (context.authUser) return true;

  const onboarding = context.newOnboarding || {};
  const hasOnboardingProfile = Boolean(
    onboarding.fullName &&
      onboarding.email &&
      onboarding.phone
  );
  return context.customerType === "new" && hasOnboardingProfile;
}

export function getEligibilityProfile(context = {}) {
  if (context.authUser) return context.authUser;

  if (context.customerType === "new" && context.newOnboarding?.leadId) {
    return {
      id: context.newOnboarding.leadId,
      name: context.newOnboarding.fullName || "New Client",
      age: 25,
      accountType: "Primary",
      creditScore: 680,
      existingPaymentToken: null,
      savedCardLast4: null,
      savedCardType: null,
      prefilledAddress: null
    };
  }

  return null;
}

export function getFinancingEligibleItems(basket = []) {
  return basket.filter((item) => item.financingEligible && typeof item.devicePrice === "number" && item.devicePrice > 0);
}

export function getFinancingAmount(basket = []) {
  return getFinancingEligibleItems(basket).reduce((sum, item) => sum + item.devicePrice, 0);
}

export function calculateFinancingMonthly(amount, termMonths) {
  if (!amount || !termMonths) return 0;
  return Number((amount / termMonths).toFixed(2));
}

export function calculateCombinedMonthly(serviceMonthly, financingMonthly) {
  return Number((Number(serviceMonthly || 0) + Number(financingMonthly || 0)).toFixed(2));
}

export function runMockFinancingApproval(randomFn = Math.random, threshold = 0.75) {
  return randomFn() < threshold;
}

export function calculateInstallationFees(basket = []) {
  const hasLandline = basket.some((item) => item.category === "landline");
  const hasInternet = basket.some((item) => item.category === "home internet");
  return (hasLandline ? 50 : 0) + (hasInternet ? 25 : 0);
}

export function getBundleDiscountRate(itemCount = 0) {
  if (itemCount >= 3) return 0.2;
  if (itemCount >= 2) return 0.1;
  return 0;
}

export function calculateFinancingBreakdown(totalDeviceAmount, upfrontPayment, termMonths, deferredRatio = 0) {
  const total = Number(totalDeviceAmount || 0);
  const upfront = Number(upfrontPayment || 0);
  const financedBase = Math.max(0, Number((total - upfront).toFixed(2)));
  const deferredAmount = Number((financedBase * Math.max(0, deferredRatio)).toFixed(2));
  const amortizedAmount = Number((financedBase - deferredAmount).toFixed(2));
  const monthlyPayment = termMonths ? Number((amortizedAmount / termMonths).toFixed(2)) : 0;
  return {
    financedBase,
    deferredAmount,
    amortizedAmount,
    monthlyPayment
  };
}

function hasSalesClarification(context = {}) {
  const intent = String(context.intent || "");
  const sales = context.salesProfile || {};
  if (intent === "home internet") return Boolean(sales.speedPriority || context.internetPreference);
  if (intent === "mobility") {
    if (!sales.byodChoice || !sales.callingPlan) return false;
    if (sales.byodChoice === "byod") return true;
    return Boolean(sales.phonePreference);
  }
  if (intent === "bundle") return Boolean(sales.bundleSize);
  if (intent === "landline") {
    if (!sales.linePreference || !sales.callingPlan) return false;
    if (sales.linePreference === "keep_existing") return Boolean(sales.portingDate);
    return true;
  }
  return false;
}
