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

export function getExpectedLast4(method, user) {
  if (method === "visa") return "2781";
  if (method === "mastercard") return "7891";
  if (method === "amex") return "6531";
  if (method === "existing") return user?.savedCardLast4 || "2781";
  return "0000";
}

export function canAccessOfferBrowse(context = {}) {
  if (context.authUser) return true;
  return context.customerType === "new" && Boolean(context.newOnboarding?.leadId);
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
