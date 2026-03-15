export const LEGACY_FLOW_STEPS = ["AREA_CODE_ENTRY", "AVAILABILITY_SELECTION", "CLIENT_TYPE_SELECTION"];

export const PATH_STATUS = {
  IDLE: "idle",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  FAILED: "failed"
};

export function canProceed(step = "", context = {}) {
  switch (step) {
    case "CUSTOMER_STATUS_SELECTION":
      return Boolean(context.selectedEntryIntent);
    case "EXISTING_AREA_CODE_CHECK":
      return context.customerType === "existing";
    case "EXISTING_AUTH_MODE":
      return context.customerType === "existing" && Boolean(context.areaCode);
    case "DEVICE_OS_SELECTION":
      return context.intent === "mobility";
    case "PAYMENT_FINANCING_TERM":
      return getFinancingAmount(context.basket) > 0;
    case "PAYMENT_FINANCING_UPFRONT":
      return getFinancingAmount(context.basket) > 0 && Boolean(context.financing?.planType);
    case "PAYMENT_FINANCING_APPROVAL":
      return getFinancingAmount(context.basket) > 0 && Boolean(context.financing?.planType) && [24, 36].includes(context.financing?.termMonths);
    case "PAYMENT_FINANCING_CONFIRM":
      return context.financing?.approvalStatus === "approved";
    case "VALIDATION_ADDRESS_CAPTURE":
      return Array.isArray(context.basket) && context.basket.length > 0;
    case "OFFER_BROWSE":
      return canAccessOfferBrowse(context) && Boolean(context.areaCode);
    case "PAYMENT_METHOD":
      return Array.isArray(context.basket) && context.basket.length > 0;
    case "PAYMENT_CONFIRM_LAST4":
      return Boolean(context.payment?.method);
    case "PAYMENT_CVV":
      return Boolean(context.payment?.last4Confirmed);
    case "SHIPPING_SELECTION":
    case "SHIPPING_LOOKUP":
    case "SHIPPING_MANUAL_ENTRY":
      return Boolean(context.payment?.verified);
    case "ORDER_REVIEW":
      return Boolean(context.shipping?.address);
    case "ORDER_CONFIRMED":
      return true;
    default:
      return true;
  }
}

export function parseHelpdeskIntent(text = "") {
  const lower = String(text || "").toLowerCase();
  if (lower.includes("upgrade") || lower.includes("product") || lower.includes("sales")) return "sales";
  if (lower.includes("corporate")) return "corporate_support";
  if (lower.includes("hardware")) return "hardware";
  if (lower.includes("troubleshoot") || lower.includes("help desk") || lower.includes("support")) return "support";
  return null;
}

export function parseSalesIntentDeterministic(text = "") {
  const lower = String(text || "").toLowerCase();
  if (lower.includes("internet") || lower.includes("fibe") || lower.includes("wifi")) return "home internet";
  if (lower.includes("landline") || lower.includes("home phone")) return "landline";
  if (lower.includes("bundle")) return "bundle";
  if (lower.includes("mobility") || lower.includes("phone") || lower.includes("cell")) return "mobility";
  return null;
}

export function stableContextHash(context = {}) {
  const clone = JSON.parse(JSON.stringify(context));
  delete clone.loopGuard;
  return JSON.stringify(clone);
}

export function nextLoopGuard(loopGuard = {}, step = "", contextHash = "", threshold = 3) {
  const sameStep = loopGuard.lastStep === step;
  const sameHash = loopGuard.lastContextHash === contextHash;
  const sameStepCount = sameStep && sameHash ? Number(loopGuard.sameStepCount || 0) + 1 : 1;
  return {
    lastStep: step,
    lastContextHash: contextHash,
    sameStepCount,
    stuck: sameStepCount >= threshold
  };
}

function getFinancingAmount(basket = []) {
  return (basket || [])
    .filter((item) => item.financingEligible && typeof item.devicePrice === "number" && item.devicePrice > 0)
    .reduce((sum, item) => sum + item.devicePrice, 0);
}

function canAccessOfferBrowse(context = {}) {
  const hasAreaCode = Boolean(context.areaCode);
  const hasIntent = Boolean(context.intent);
  const hasClarification = hasSalesClarification(context);
  if (!hasAreaCode || !hasIntent || !hasClarification) return false;

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

function hasSalesClarification(context = {}) {
  const intent = String(context.intent || "");
  const sales = context.salesProfile || {};
  if (intent === "home internet") return Boolean(sales.speedPriority);
  if (intent === "mobility") {
    if (!sales.byodChoice || !sales.callingPlan) return false;
    if (sales.byodChoice === "byod") return true;
    return Boolean(sales.phonePreference);
  }
  if (intent === "bundle") return Boolean(sales.bundleSize);
  if (intent === "landline") return Boolean(sales.linePreference) && Boolean(sales.callingPlan);
  return false;
}
