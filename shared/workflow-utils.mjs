export const LEGACY_FLOW_STEPS = ["AREA_CODE_ENTRY", "AVAILABILITY_SELECTION", "CLIENT_TYPE_SELECTION", "DEVICE_OS_SELECTION"];

export const PATH_STATUS = {
  IDLE: "idle",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  FAILED: "failed"
};

export function canProceed(step = "", context = {}) {
  switch (step) {
    case "GREETING_CONVERSATIONAL":
      return true;
    case "CUSTOMER_STATUS_SELECTION":
      return true;
    case "CONSENT_PROFILE":
    case "CONSENT_PAYMENT":
    case "CONSENT_EXPORT":
      return true;
    case "SERVICE_SELECTION":
      return context.customerType === "new" || context.customerType === "guest";
    case "EXISTING_AUTH_ENTRY":
      return context.customerType === "existing";
    case "EXISTING_AUTH_VALIDATE":
      return context.customerType === "existing" && Boolean(context.existingAuthAttempt);
    case "EXISTING_AUTH_FAILURE_HARD_STOP":
      return true;
    case "INTERNET_ADDRESS_REQUEST":
      return context.selectedService === "internet" || context.intent === "home internet";
    case "INTERNET_ADDRESS_VALIDATE":
      return Boolean(context.serviceAddress) && Boolean(context.serviceAddressValidated);
    case "INTERNET_AVAILABILITY_RESULT":
      return Boolean(resolveAddress(context));
    case "INTERNET_PRIORITY_CAPTURE":
      // Allow entry when any resolvable address is present, not just the
      // explicit serviceAddress field (existing customers may have address
      // only in authUser.prefilledAddress at this stage of the flow).
      return Boolean(resolveAddress(context));
    case "INTERNET_PLAN_PITCH":
      // internetPreference may be "custom" when the Guided Quote Builder path
      // is used instead of the speed/value/performance quick-pick buttons.
      return Boolean(resolveAddress(context)) && Boolean(context.internetPreference);
    case "PLAN_CONFIRMATION":
      return Boolean(context.selectedPlanId);
    case "NEW_ONBOARD_COMBINED_CAPTURE":
      return context.customerType === "new" && Boolean(context.selectedPlanId);
    case "NEW_ACCOUNT_CREATED_CONFIRM":
      return Boolean(context.newOnboarding?.fullName) && Boolean(context.newOnboarding?.email) && Boolean(context.newOnboarding?.phone);
    case "CHECKOUT_INTENT_PROMPT":
      return Array.isArray(context.basket) && context.basket.length > 0;
    case "PAYMENT_CARD_ENTRY":
      return Array.isArray(context.basket) && context.basket.length > 0;
    case "PAYMENT_CARD_NUMBER":
      return Array.isArray(context.basket) && context.basket.length > 0;
    case "PAYMENT_CARD_CVC":
      return Boolean(context.paymentDraft?.cardValidated) && Boolean(context.paymentDraft?.brand);
    case "PAYMENT_CARD_POSTAL":
      return Boolean(context.paymentDraft?.cvcValidated) && Boolean(context.paymentDraft?.brand);
    case "PAYMENT_CARD_CONFIRM":
      return Boolean(context.paymentDraft?.cardValidated) && Boolean(context.paymentDraft?.cvcValidated) && Boolean(context.paymentDraft?.postalValidated);
    case "EXISTING_AREA_CODE_CHECK":
      return context.customerType === "existing";
    case "EXISTING_AUTH_MODE":
      return context.customerType === "existing" && Boolean(context.areaCode);
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
      return canAccessOfferBrowse(context);
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
    case "BOOKING_SLOT_SELECTION":
    case "BOOKING_SLOT_CONFIRM":
    case "REMINDER_OPT_IN":
    case "REMINDER_SCHEDULED":
      return true;
    case "ORDER_CONFIRMED":
    case "POST_CHAT_RATING":
    case "POST_CHAT_FEEDBACK":
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

// Mirrors the resolveServiceAddress fallback chain in app.js so canProceed
// does not require the explicit serviceAddress field for auth'd customers
// whose address lives in authUser.prefilledAddress.
function resolveAddress(context = {}) {
  return (
    context.serviceAddress ||
    context.newOnboarding?.address ||
    context.authUser?.prefilledAddress ||
    context.shipping?.address ||
    null
  );
}

function canAccessOfferBrowse(context = {}) {
  const hasAreaCode = Boolean(context.areaCode);
  const hasValidatedAddress = Boolean(context.serviceAddressValidated) || Boolean(resolveAddress(context));
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
