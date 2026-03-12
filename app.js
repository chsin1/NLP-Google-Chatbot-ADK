import {
  calculateFinancingBreakdown,
  calculateInstallationFees,
  calculateCombinedMonthly,
  calculateFinancingMonthly,
  canAccessOfferBrowse,
  formatPhone,
  getFinancingAmount,
  getFinancingEligibleItems,
  getEligibilityProfile,
  getExpectedLast4,
  inferAuthContact,
  maskEmail,
  runMockFinancingApproval
} from "./shared/client-utils.mjs";
import { buildReceiptHtml, getRetryOutcome, resolveRouteFromStep } from "./shared/conversation-utils.mjs";

const FLOW_STEPS = {
  INIT_CONNECTING: "INIT_CONNECTING",
  AREA_CODE_ENTRY: "AREA_CODE_ENTRY",
  AVAILABILITY_SELECTION: "AVAILABILITY_SELECTION",
  EXISTING_AUTH_MODE: "EXISTING_AUTH_MODE",
  EXISTING_AUTH_IDENTIFIER: "EXISTING_AUTH_IDENTIFIER",
  NEW_ONBOARD_NAME: "NEW_ONBOARD_NAME",
  NEW_ONBOARD_EMAIL: "NEW_ONBOARD_EMAIL",
  NEW_ONBOARD_PHONE: "NEW_ONBOARD_PHONE",
  HELPDESK_ENTRY: "HELPDESK_ENTRY",
  CLIENT_TYPE_SELECTION: "CLIENT_TYPE_SELECTION",
  CORPORATE_DISCOVERY: "CORPORATE_DISCOVERY",
  SUPPORT_DISCOVERY: "SUPPORT_DISCOVERY",
  HARDWARE_TROUBLESHOOT: "HARDWARE_TROUBLESHOOT",
  DEVICE_OS_SELECTION: "DEVICE_OS_SELECTION",
  WARM_AGENT_ROUTING: "WARM_AGENT_ROUTING",
  AGENT_ASSIST_CLARIFY: "AGENT_ASSIST_CLARIFY",
  AUXILIARY_ASSIST: "AUXILIARY_ASSIST",
  POST_AGENT_RATING: "POST_AGENT_RATING",
  POST_AGENT_FEEDBACK: "POST_AGENT_FEEDBACK",
  INTENT_DISCOVERY: "INTENT_DISCOVERY",
  OFFER_BROWSE: "OFFER_BROWSE",
  BASKET_REVIEW: "BASKET_REVIEW",
  ELIGIBILITY_CHECK: "ELIGIBILITY_CHECK",
  PAYMENT_METHOD: "PAYMENT_METHOD",
  PAYMENT_FINANCING_TERM: "PAYMENT_FINANCING_TERM",
  PAYMENT_FINANCING_UPFRONT: "PAYMENT_FINANCING_UPFRONT",
  PAYMENT_FINANCING_APPROVAL: "PAYMENT_FINANCING_APPROVAL",
  PAYMENT_FINANCING_CONFIRM: "PAYMENT_FINANCING_CONFIRM",
  PAYMENT_CONFIRM_LAST4: "PAYMENT_CONFIRM_LAST4",
  PAYMENT_CVV: "PAYMENT_CVV",
  SHIPPING_SELECTION: "SHIPPING_SELECTION",
  SHIPPING_MANUAL_ENTRY: "SHIPPING_MANUAL_ENTRY",
  SHIPPING_LOOKUP: "SHIPPING_LOOKUP",
  ORDER_REVIEW: "ORDER_REVIEW",
  ORDER_CONFIRMED: "ORDER_CONFIRMED"
};

const CATEGORY_PAGES = ["mobility", "home internet", "landline"];

const mockUsers = [
  {
    id: "u1001",
    name: "Alex Carter",
    email: "alex.test@gmail.com",
    phone: "4165511192",
    locale: "en-CA",
    authenticated: false,
    age: 34,
    accountType: "Primary",
    creditScore: 742,
    existingPaymentToken: "tok_saved_u1001",
    savedCardType: "visa",
    savedCardLast4: "2781",
    prefilledAddress: "210 - 100 Galt Ave, Toronto, ON M4M 2Z1"
  },
  {
    id: "u1002",
    name: "Maya Singh",
    email: "maya.singh@gmail.com",
    phone: "6474432288",
    locale: "en-CA",
    authenticated: false,
    age: 21,
    accountType: "Secondary",
    creditScore: 608,
    existingPaymentToken: null,
    savedCardType: null,
    savedCardLast4: null,
    prefilledAddress: "88 Queen St E, Toronto, ON M5C 1S1"
  },
  {
    id: "u1003",
    name: "Daniel Roy",
    email: "daniel.roy@gmail.com",
    phone: "9867783321",
    locale: "fr-CA",
    authenticated: false,
    age: 24,
    accountType: "Primary",
    creditScore: 690,
    existingPaymentToken: null,
    savedCardType: null,
    savedCardLast4: null,
    prefilledAddress: "320 Lakeshore Blvd, Toronto, ON M5V 1A1"
  }
];

const offers = [
  {
    id: "mob-001",
    category: "mobility",
    name: "iPhone 16 + Bell 5G+ Essential 100",
    description: "100 GB high-speed data with iPhone financing option.",
    monthlyPrice: 75,
    osType: "ios",
    deviceModel: "iPhone 16",
    financingEligible: true,
    devicePrice: 899,
    minCreditScore: 620,
    minAge: 18,
    requiresPrimaryHolder: false
  },
  {
    id: "mob-002",
    category: "mobility",
    name: "Samsung Galaxy S25 + Bell Ultimate 175",
    description: "Premium data with flagship Android financing option.",
    monthlyPrice: 110,
    osType: "android",
    deviceModel: "Galaxy S25",
    financingEligible: true,
    devicePrice: 1499,
    minCreditScore: 700,
    minAge: 18,
    requiresPrimaryHolder: true
  },
  {
    id: "mob-003",
    category: "mobility",
    name: "BYOD / Other Device Flex Plan",
    description: "Bring your own or other device and stay connected.",
    monthlyPrice: 65,
    osType: "other",
    deviceModel: "Other device",
    financingEligible: true,
    devicePrice: 499,
    minCreditScore: 560,
    minAge: 18,
    requiresPrimaryHolder: false
  },
  {
    id: "internet-001",
    category: "home internet",
    name: "Fibe 1.5 Gigabit",
    description: "Up to 1.5 Gbps speeds for heavy home usage.",
    monthlyPrice: 95,
    financingEligible: false,
    devicePrice: null,
    minCreditScore: 600,
    minAge: 18,
    requiresPrimaryHolder: false
  },
  {
    id: "internet-002",
    category: "home internet",
    name: "Fibe 500 Starter",
    description: "Balanced speed and value for streaming homes.",
    monthlyPrice: 70,
    financingEligible: false,
    devicePrice: null,
    minCreditScore: 560,
    minAge: 18,
    requiresPrimaryHolder: false
  },
  {
    id: "landline-001",
    category: "landline",
    name: "Home Phone Lite",
    description: "Canada-wide calls with voicemail included.",
    monthlyPrice: 38,
    financingEligible: false,
    devicePrice: null,
    minCreditScore: 500,
    minAge: 18,
    requiresPrimaryHolder: false
  },
  {
    id: "landline-002",
    category: "landline",
    name: "Home Phone Plus International",
    description: "International call minutes and call display.",
    monthlyPrice: 52,
    financingEligible: false,
    devicePrice: null,
    minCreditScore: 560,
    minAge: 18,
    requiresPrimaryHolder: true
  }
];

const phonePrefixToUser = {
  "416": "u1001",
  "647": "u1002",
  "986": "u1003"
};
const alexEmail = "alex.test@gmail.com";

const chatLauncher = document.getElementById("chat-launcher");
const chatWidget = document.getElementById("chat-widget");
const closeChat = document.getElementById("close-chat");
const openChatHeader = document.getElementById("open-chat-header");
const openChatOffers = document.getElementById("open-chat-offers");
const autoLoginBtn = document.getElementById("auto-login-btn");
const manualLoginBtn = document.getElementById("manual-login-btn");
const authIdentifierInput = document.getElementById("auth-identifier-input");
const loginSections = document.getElementById("login-sections");

const chatMenuBtn = document.getElementById("chat-menu-btn");
const chatMenu = document.getElementById("chat-menu");
const muteChatBtn = document.getElementById("mute-chat-btn");
const refreshChatBtn = document.getElementById("refresh-chat-btn");
const endChatBtn = document.getElementById("end-chat-btn");

const chatWindow = document.getElementById("chat-window");
const quickActions = document.getElementById("quick-actions");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const addressTypeahead = document.getElementById("address-typeahead");
const availabilityCard = document.getElementById("availability-card");
const newCustomerBtn = document.getElementById("new-customer-btn");
const existingCustomerBtn = document.getElementById("existing-customer-btn");

const carousel = document.getElementById("carousel");
const carouselPrevBtn = document.getElementById("carousel-prev-btn");
const carouselNextBtn = document.getElementById("carousel-next-btn");
const carouselPageLabel = document.getElementById("carousel-page-label");

const basketList = document.getElementById("basket-list");
const basketTotal = document.getElementById("basket-total");
const validateBtn = document.getElementById("validate-btn");

const tokenizeBtn = document.getElementById("tokenize-btn");
const placeOrderBtn = document.getElementById("place-order-btn");
const checkoutStatus = document.getElementById("checkout-status");
const orderSummary = document.getElementById("order-summary");
const sessionStatus = document.getElementById("session-status");

const state = {
  chatStarted: false,
  muted: false,
  flowStep: FLOW_STEPS.INIT_CONNECTING,
  historyStack: [],
  offerPageIndex: 0,
  timers: [],
  addressTypeaheadTimer: null,
  pendingAuthMode: null,
  context: {
    sessionId: null,
    areaCode: null,
    customerType: null,
    clientType: null,
    authUser: null,
    intent: null,
    clarifyRetries: 0,
    activeTask: null,
    escalatedToAgent: false,
    agentRating: null,
    agentFeedback: null,
    basket: [],
    payment: {
      method: null,
      expectedLast4: null,
      last4Confirmed: false,
      cvvValidated: false,
      verified: false,
      token: null
    },
    financing: {
      selected: false,
      planType: null,
      termMonths: null,
      deferredRatio: 0,
      upfrontPayment: 0,
      approvalStatus: null,
      approvedAmount: 0,
      financedBase: 0,
      deferredAmount: 0,
      monthlyPayment: 0,
      decisionId: null,
      eligibleDeviceItems: []
    },
    shipping: {
      mode: null,
      address: null,
      lookupQuery: null,
      suggestions: []
    },
    newOnboarding: {
      fullName: null,
      email: null,
      phone: null,
      leadId: null
    },
    supportCase: {
      category: null,
      resolved: false
    },
    corporateProfile: {
      captured: false,
      notes: null
    },
    deviceSelection: {
      osType: null,
      model: null
    },
    authMeta: {
      mode: null,
      phone: null,
      email: null,
      secureRef: null
    }
  }
};

function currency(amount) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(amount);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function generateSessionId() {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateSecureRef() {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 20);
}

async function createIdentityHash(value) {
  try {
    if (!window.crypto?.subtle) return "nohash";
    const encoded = new TextEncoder().encode(value);
    const digest = await window.crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
  } catch {
    return "nohash";
  }
}

function clearAddressTypeahead() {
  if (!addressTypeahead) return;
  addressTypeahead.innerHTML = "";
  addressTypeahead.classList.add("hidden");
}

function resetAddressTypeaheadTimer() {
  if (state.addressTypeaheadTimer) {
    clearTimeout(state.addressTypeaheadTimer);
    state.addressTypeaheadTimer = null;
  }
}

function clearTimers() {
  state.timers.forEach((timerId) => clearTimeout(timerId));
  state.timers = [];
  resetAddressTypeaheadTimer();
}

function postMessage(role, text, { force = false } = {}) {
  if (role === "bot" && state.muted && !force) return;
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.textContent = text;
  chatWindow.appendChild(el);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

async function logClient(level, event, details = {}) {
  try {
    const enrichedDetails = {
      sessionId: state.context.sessionId,
      flowStep: state.flowStep,
      clientType: state.context.clientType,
      route: resolveRouteFromStep(state.flowStep, state.context.activeTask),
      ...details
    };
    await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level, event, details: enrichedDetails })
    });
  } catch {
    // never block UX for logging failures
  }
}

function clearQuickActions() {
  quickActions.innerHTML = "";
}

function resetChatInputHint() {
  chatInput.placeholder = "Type your message here...";
}

function setChatInputHint(placeholder) {
  chatInput.placeholder = placeholder || "Type your message here...";
}

function showChoiceButtons(labels, onPick) {
  clearQuickActions();
  labels.forEach((label) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => onPick(label));
    quickActions.appendChild(button);
  });
}

function showAvailabilityCard() {
  availabilityCard.classList.remove("hidden");
}

function hideAvailabilityCard() {
  availabilityCard.classList.add("hidden");
}

function hideLoginSections() {
  loginSections.classList.add("hidden");
}

function showLoginSections() {
  loginSections.classList.remove("hidden");
}

function setStatus() {
  if (!state.context.authUser && state.context.customerType !== "new") {
    sessionStatus.textContent = "Session: not authenticated";
    showLoginSections();
    return;
  }
  if (state.context.authUser) {
    const phone = formatPhone(state.context.authMeta.phone || state.context.authUser.phone);
    const ref = state.context.authMeta.secureRef || "pending";
    sessionStatus.textContent =
      `Session: Authenticated as ${state.context.authUser.name} - Phone: ${phone} | Secure Ref: ${ref}` +
      (state.context.areaCode ? ` | Area Code: ${state.context.areaCode}` : "");
    hideLoginSections();
    return;
  }

  const onboarding = state.context.newOnboarding;
  if (onboarding.fullName || onboarding.email || onboarding.phone) {
    const ref = state.context.authMeta.secureRef || "pending";
    sessionStatus.textContent =
      `Session: New Client - Name: ${onboarding.fullName || "pending"} | Email: ${onboarding.email || "pending"} | Phone: ${formatPhone(onboarding.phone)} | Secure Ref: ${ref}` +
      (state.context.areaCode ? ` | Area Code: ${state.context.areaCode}` : "");
    hideLoginSections();
    return;
  }

  sessionStatus.textContent = "Session: not authenticated";
  showLoginSections();
}

function resetCheckoutPanel() {
  checkoutStatus.textContent = "Status: waiting for eligibility approval.";
  orderSummary.textContent = "No order created yet.";
  tokenizeBtn.disabled = true;
  placeOrderBtn.disabled = true;
}

function resetSessionState() {
  clearTimers();
  state.flowStep = FLOW_STEPS.INIT_CONNECTING;
  state.historyStack = [];
  state.offerPageIndex = 0;
  state.pendingAuthMode = null;
  state.context = {
    sessionId: generateSessionId(),
    areaCode: null,
    customerType: null,
    clientType: null,
    authUser: null,
    intent: null,
    clarifyRetries: 0,
    activeTask: null,
    escalatedToAgent: false,
    agentRating: null,
    agentFeedback: null,
    basket: [],
    payment: {
      method: null,
      expectedLast4: null,
      last4Confirmed: false,
      cvvValidated: false,
      verified: false,
      token: null
    },
    financing: {
      selected: false,
      planType: null,
      termMonths: null,
      deferredRatio: 0,
      upfrontPayment: 0,
      approvalStatus: null,
      approvedAmount: 0,
      financedBase: 0,
      deferredAmount: 0,
      monthlyPayment: 0,
      decisionId: null,
      eligibleDeviceItems: []
    },
    shipping: {
      mode: null,
      address: null,
      lookupQuery: null,
      suggestions: []
    },
    newOnboarding: {
      fullName: null,
      email: null,
      phone: null,
      leadId: null
    },
    supportCase: {
      category: null,
      resolved: false
    },
    corporateProfile: {
      captured: false,
      notes: null
    },
    deviceSelection: {
      osType: null,
      model: null
    },
    authMeta: {
      mode: null,
      phone: null,
      email: null,
      secureRef: null
    }
  };
  mockUsers.forEach((u) => {
    u.authenticated = false;
  });
  authIdentifierInput.value = "";
  chatWindow.innerHTML = "";
  clearQuickActions();
  clearAddressTypeahead();
  resetChatInputHint();
  hideAvailabilityCard();
  renderBasket();
  renderCarouselPage();
  resetCheckoutPanel();
  setStatus();
}

function isStepValid(nextStep, ctx) {
  switch (nextStep) {
    case FLOW_STEPS.AVAILABILITY_SELECTION:
      return Boolean(ctx.areaCode);
    case FLOW_STEPS.EXISTING_AUTH_MODE:
      return ctx.customerType === "existing";
    case FLOW_STEPS.DEVICE_OS_SELECTION:
      return ctx.intent === "mobility";
    case FLOW_STEPS.PAYMENT_FINANCING_TERM:
      return getFinancingAmount(ctx.basket) > 0;
    case FLOW_STEPS.PAYMENT_FINANCING_UPFRONT:
      return getFinancingAmount(ctx.basket) > 0 && Boolean(ctx.financing.planType);
    case FLOW_STEPS.PAYMENT_FINANCING_APPROVAL:
      return getFinancingAmount(ctx.basket) > 0 && Boolean(ctx.financing.planType) && (ctx.financing.termMonths === 24 || ctx.financing.termMonths === 36);
    case FLOW_STEPS.PAYMENT_FINANCING_CONFIRM:
      return ctx.financing.approvalStatus === "approved";
    case FLOW_STEPS.OFFER_BROWSE:
      return canAccessOfferBrowse(ctx);
    case FLOW_STEPS.PAYMENT_METHOD:
      return ctx.basket.length > 0;
    case FLOW_STEPS.PAYMENT_CONFIRM_LAST4:
      return Boolean(ctx.payment.method);
    case FLOW_STEPS.PAYMENT_CVV:
      return ctx.payment.last4Confirmed;
    case FLOW_STEPS.SHIPPING_SELECTION:
      return ctx.payment.verified;
    case FLOW_STEPS.SHIPPING_LOOKUP:
      return ctx.payment.verified;
    case FLOW_STEPS.SHIPPING_MANUAL_ENTRY:
      return ctx.payment.verified;
    case FLOW_STEPS.ORDER_REVIEW:
      return Boolean(ctx.shipping.address);
    case FLOW_STEPS.ORDER_CONFIRMED:
      return true;
    default:
      return true;
  }
}

function getPatchedContext(patch = {}) {
  const next = deepClone(state.context);

  if (patch.areaCode !== undefined) next.areaCode = patch.areaCode;
  if (patch.customerType !== undefined) next.customerType = patch.customerType;
  if (patch.clientType !== undefined) next.clientType = patch.clientType;
  if (patch.authUser !== undefined) next.authUser = patch.authUser;
  if (patch.intent !== undefined) next.intent = patch.intent;
  if (patch.activeTask !== undefined) next.activeTask = patch.activeTask;
  if (patch.clarifyRetries !== undefined) next.clarifyRetries = patch.clarifyRetries;
  if (patch.escalatedToAgent !== undefined) next.escalatedToAgent = patch.escalatedToAgent;
  if (patch.agentRating !== undefined) next.agentRating = patch.agentRating;
  if (patch.agentFeedback !== undefined) next.agentFeedback = patch.agentFeedback;
  if (patch.basket !== undefined) next.basket = patch.basket;
  if (patch.payment) next.payment = { ...next.payment, ...patch.payment };
  if (patch.financing) next.financing = { ...next.financing, ...patch.financing };
  if (patch.shipping) next.shipping = { ...next.shipping, ...patch.shipping };
  if (patch.newOnboarding) next.newOnboarding = { ...next.newOnboarding, ...patch.newOnboarding };
  if (patch.supportCase) next.supportCase = { ...next.supportCase, ...patch.supportCase };
  if (patch.corporateProfile) next.corporateProfile = { ...next.corporateProfile, ...patch.corporateProfile };
  if (patch.deviceSelection) next.deviceSelection = { ...next.deviceSelection, ...patch.deviceSelection };
  if (patch.authMeta) next.authMeta = { ...next.authMeta, ...patch.authMeta };

  return next;
}

function applyContextPatch(patch = {}) {
  state.context = getPatchedContext(patch);
}

function transitionTo(nextStep, patchContext = {}, { pushHistory = true } = {}) {
  const nextContext = getPatchedContext(patchContext);
  if (!isStepValid(nextStep, nextContext)) {
    logClient("error", "invalid_flow_transition", {
      from: state.flowStep,
      to: nextStep,
      context: { areaCode: state.context.areaCode, customerType: state.context.customerType }
    });
    postMessage("bot", "Cannot continue yet. Please complete the current step first.");
    renderStep(state.flowStep);
    return;
  }

  if (pushHistory && state.flowStep) {
    state.historyStack.push({
      step: state.flowStep,
      contextSnapshot: deepClone(state.context),
      offerPageIndex: state.offerPageIndex,
      pendingAuthMode: state.pendingAuthMode
    });
  }

  state.context = nextContext;
  state.context.clarifyRetries = 0;
  const prev = state.flowStep;
  state.flowStep = nextStep;
  logClient("info", "flow_transition", { from: prev, to: nextStep, patchContext });
  renderStep(nextStep);
}

function goBack() {
  if (state.historyStack.length === 0) {
    postMessage("bot", "No previous step is available. Do you want to login, restart, or continue current step?");
    logClient("info", "flow_clarify_prompt", { reason: "back_no_history", current: state.flowStep });
    showChoiceButtons(["Login", "Restart", "Continue"], (choice) => {
      if (choice === "Login") {
        transitionTo(FLOW_STEPS.EXISTING_AUTH_MODE, { customerType: "existing" }, { pushHistory: false });
        return;
      }
      if (choice === "Restart") {
        refreshChat();
        return;
      }
      renderStep(state.flowStep);
    });
    return;
  }

  const previous = state.historyStack.pop();
  state.context = previous.contextSnapshot;
  state.flowStep = previous.step;
  state.offerPageIndex = previous.offerPageIndex;
  state.pendingAuthMode = previous.pendingAuthMode || null;
  logClient("info", "flow_back", { to: previous.step });
  renderStep(previous.step);
}

function renderCarouselPage() {
  const category = CATEGORY_PAGES[state.offerPageIndex];
  let filtered = offers.filter((offer) => offer.category === category);
  if (category === "mobility" && state.context.deviceSelection.osType) {
    filtered = filtered.filter((offer) => offer.osType === state.context.deviceSelection.osType);
  }

  carousel.innerHTML = "";
  filtered.forEach((offer) => {
    const card = document.createElement("article");
    card.className = "product-card";
    card.innerHTML = `
      <div class="product-category">${offer.category}</div>
      <div class="product-name">${offer.name}</div>
      <div class="product-meta">${offer.description}</div>
      <div class="product-price">${currency(offer.monthlyPrice)}/month</div>
    `;

    const addBtn = document.createElement("button");
    addBtn.textContent = "Add to basket";
    addBtn.addEventListener("click", () => {
      const basket = [...state.context.basket, offer];
      applyContextPatch({ basket });
      renderBasket();
      postMessage("bot", `Added ${offer.name} to your basket.`);
      logClient("info", "basket_item_added", { offerId: offer.id, basketSize: basket.length });
      if (offer.category === "mobility") {
        logClient("info", "device_offer_selected", { offerId: offer.id, osType: offer.osType, deviceModel: offer.deviceModel });
      }
    });

    card.appendChild(addBtn);
    carousel.appendChild(card);
  });

  carouselPageLabel.textContent = `Page ${state.offerPageIndex + 1} of ${CATEGORY_PAGES.length}`;
  carouselPrevBtn.disabled = state.offerPageIndex === 0;
  carouselNextBtn.disabled = state.offerPageIndex === CATEGORY_PAGES.length - 1;
}

function renderBasket() {
  basketList.innerHTML = "";
  state.context.basket.forEach((item, idx) => {
    const li = document.createElement("li");
    li.className = "basket-item";
    li.innerHTML = `<span>${idx + 1}. ${item.name}</span><span>${currency(item.monthlyPrice)}</span>`;
    basketList.appendChild(li);
  });

  const total = state.context.basket.reduce((sum, item) => sum + item.monthlyPrice, 0);
  basketTotal.textContent = `Total: ${currency(total)}/month`;
  validateBtn.disabled = !canAccessOfferBrowse(state.context) || state.context.basket.length === 0;
}

function detectIntentFallback(text = "") {
  const lower = text.toLowerCase();
  if (lower.includes("internet") || lower.includes("fibe") || lower.includes("wifi")) return "home internet";
  if (lower.includes("landline") || lower.includes("home phone")) return "landline";
  if (lower.includes("bundle")) return "bundle";
  if (lower.includes("human") || lower.includes("agent")) return "human_handoff";
  return "mobility";
}

async function detectIntent(message) {
  try {
    const response = await fetch("/api/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });
    if (!response.ok) throw new Error("intent endpoint failed");
    const payload = await response.json();
    return payload.intent || detectIntentFallback(message);
  } catch {
    return detectIntentFallback(message);
  }
}

function resolveUserFromIdentifier(raw) {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (value === alexEmail) return mockUsers.find((u) => u.id === "u1001") || null;

  const digits = value.replace(/\D/g, "");
  const prefix = digits.slice(0, 3);
  const userId = phonePrefixToUser[prefix];
  if (!userId) return null;
  return mockUsers.find((u) => u.id === userId) || null;
}

async function finalizeExistingAuthentication(user, mode, rawIdentifier = "") {
  const contact = inferAuthContact(user, rawIdentifier);
  user.authenticated = true;

  const hash = await createIdentityHash(`${user.id}|${contact.phone || ""}|${contact.email || ""}|${Date.now()}`);
  const secureRef = `${generateSecureRef()}-${hash}`;
  applyContextPatch({
    authUser: user,
    authMeta: {
      mode,
      phone: contact.phone,
      email: contact.email,
      secureRef
    }
  });

  const contactLabel = contact.phone ? `Phone: ${formatPhone(contact.phone)}` : `Email: ${maskEmail(contact.email)}`;
  postMessage(
    "bot",
    `Authentication successful. ${user.name} verified. ${contactLabel}. Secure session reference ${secureRef}.`
  );
  transitionTo(FLOW_STEPS.CLIENT_TYPE_SELECTION, {}, { pushHistory: true });
  logClient("info", "auth_success", { mode, userId: user.id, secureRef });
}

function renderPaymentChoices(user, onPick) {
  clearQuickActions();
  const choices = [
    { label: "Visa", value: "visa", logoClass: "visa", logoText: "Visa" },
    { label: "MasterCard", value: "mastercard", logoClass: "mastercard", logoText: "MC" },
    { label: "Amex", value: "amex", logoClass: "amex", logoText: "Amex" },
    { label: "Bell Smart Financing", value: "smart_financing", logoClass: "existing", logoText: "Bell" }
  ];

  if (user?.savedCardLast4) {
    choices.push({
      label: `Use Existing Payment (•••• ${user.savedCardLast4})`,
      value: "existing",
      logoClass: "existing",
      logoText: "Saved"
    });
  }

  choices.forEach((choice) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "payment-choice";
    button.innerHTML = `<span class="card-logo ${choice.logoClass}">${choice.logoText}</span><span>${choice.label}</span>`;
    button.addEventListener("click", () => onPick(choice.value, choice.label));
    quickActions.appendChild(button);
  });
}

function choosePaymentMethod(method) {
  const user = getEligibilityProfile(state.context);
  if (!user) {
    postMessage("bot", "Please complete authentication or onboarding first.");
    return;
  }

  if (method === "smart_financing") {
    const eligibleItems = getFinancingEligibleItems(state.context.basket);
    const approvedAmount = getFinancingAmount(state.context.basket);
    if (approvedAmount <= 0) {
      postMessage("bot", "Smart Financing is available for eligible mobility devices only.");
      logClient("info", "financing_fallback_to_card", { reason: "no_eligible_devices" });
      return;
    }

    applyContextPatch({
      payment: {
        method: null,
        expectedLast4: null,
        last4Confirmed: false,
        cvvValidated: false,
        verified: false,
        token: null
      },
      financing: {
        selected: true,
        planType: null,
        termMonths: null,
        deferredRatio: 0,
        upfrontPayment: 0,
        approvalStatus: null,
        approvedAmount,
        financedBase: 0,
        deferredAmount: 0,
        monthlyPayment: 0,
        decisionId: null,
        eligibleDeviceItems: eligibleItems.map((item) => item.id)
      }
    });
    logClient("info", "financing_selected", { approvedAmount, itemCount: eligibleItems.length });
    transitionTo(FLOW_STEPS.PAYMENT_FINANCING_TERM, {}, { pushHistory: true });
    return;
  }

  if (method === "existing" && !user.existingPaymentToken) {
    postMessage("bot", "No saved payment option found. Please choose Visa or MasterCard.");
    logClient("error", "payment_existing_not_available", { userId: user.id });
    transitionTo(FLOW_STEPS.PAYMENT_METHOD, {}, { pushHistory: false });
    return;
  }

  const expectedLast4 = getExpectedLast4(method, user);
  applyContextPatch({
    payment: {
      method,
      expectedLast4,
      last4Confirmed: false,
      cvvValidated: false,
      verified: false,
      token: null
    },
    financing: {
      selected: false,
      planType: null,
      termMonths: null,
      deferredRatio: 0,
      upfrontPayment: 0,
      approvalStatus: null,
      approvedAmount: 0,
      financedBase: 0,
      deferredAmount: 0,
      monthlyPayment: 0,
      decisionId: null,
      eligibleDeviceItems: []
    }
  });

  logClient("info", "payment_method_selected", { method, expectedLast4 });
  transitionTo(FLOW_STEPS.PAYMENT_CONFIRM_LAST4, {}, { pushHistory: true });
}

function describePaymentMethod(method, user) {
  if (method === "existing") {
    const savedType = (user?.savedCardType || "card").toUpperCase();
    return `saved ${savedType}`;
  }
  return method.toUpperCase();
}

function generateFinancingDecisionId() {
  return `FIN-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function getCheckoutTotals() {
  const serviceMonthly = state.context.basket.reduce((sum, item) => sum + item.monthlyPrice, 0);
  const financingMonthly = state.context.financing.selected ? state.context.financing.monthlyPayment : 0;
  const combinedMonthly = calculateCombinedMonthly(serviceMonthly, financingMonthly);
  const installationFees = calculateInstallationFees(state.context.basket);
  const deviceDueToday =
    state.context.payment.method === "device_upfront"
      ? getFinancingAmount(state.context.basket)
      : state.context.financing.upfrontPayment || 0;
  const chargeToday = Number((installationFees + deviceDueToday).toFixed(2));
  return { serviceMonthly, financingMonthly, combinedMonthly, installationFees, chargeToday };
}

function runEligibilityCheck() {
  const user = getEligibilityProfile(state.context);
  if (!user) {
    postMessage("bot", "Please complete authentication or onboarding first.");
    logClient("error", "eligibility_without_auth");
    return;
  }

  const failures = [];
  for (const item of state.context.basket) {
    if (user.creditScore < item.minCreditScore) failures.push(`${item.name}: requires credit score ${item.minCreditScore}+`);
    if (user.age < item.minAge) failures.push(`${item.name}: customer must be at least ${item.minAge}`);
    if (item.requiresPrimaryHolder && user.accountType !== "Primary") failures.push(`${item.name}: primary account holder required`);
  }

  if (failures.length > 0) {
    checkoutStatus.textContent = "Status: eligibility failed. Update basket or choose different offers.";
    postMessage("bot", `Eligibility failed: ${failures.join("; ")}.`);
    logClient("info", "eligibility_failed", { failures });
    transitionTo(FLOW_STEPS.BASKET_REVIEW, {}, { pushHistory: false });
    return;
  }

  checkoutStatus.textContent = "Status: eligible. Payment selection required before order placement.";
  orderSummary.textContent = `Eligible basket with ${state.context.basket.length} item(s). Ready for payment selection.`;
  logClient("info", "eligibility_approved", { basketItems: state.context.basket.length });
  transitionTo(FLOW_STEPS.PAYMENT_METHOD, {}, { pushHistory: true });
}

async function lookupAddresses(query) {
  const response = await fetch("/api/address-lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, areaCode: state.context.areaCode })
  });
  if (!response.ok) throw new Error("address lookup failed");
  return response.json();
}

function renderAddressTypeaheadSuggestions(suggestions = []) {
  if (!addressTypeahead) return;
  addressTypeahead.innerHTML = "";
  if (suggestions.length === 0) {
    addressTypeahead.classList.add("hidden");
    return;
  }

  suggestions.slice(0, 5).forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    const label = `${item.line1}, ${item.city}, ${item.province} ${item.postalCode}`;
    button.textContent = label;
    button.addEventListener("click", () => {
      chatInput.value = label;
      clearAddressTypeahead();
      chatInput.focus();
    });
    addressTypeahead.appendChild(button);
  });
  addressTypeahead.classList.remove("hidden");
}

function queueAddressTypeahead(query) {
  if (state.flowStep !== FLOW_STEPS.SHIPPING_MANUAL_ENTRY) {
    clearAddressTypeahead();
    return;
  }

  resetAddressTypeaheadTimer();
  if (!query || query.length < 3) {
    clearAddressTypeahead();
    return;
  }

  state.addressTypeaheadTimer = setTimeout(async () => {
    try {
      const payload = await lookupAddresses(query);
      renderAddressTypeaheadSuggestions(payload.suggestions || []);
    } catch {
      clearAddressTypeahead();
    }
  }, 220);
}

function confirmOrder() {
  const { serviceMonthly, financingMonthly, combinedMonthly, installationFees, chargeToday } = getCheckoutTotals();
  const orderId = `ORD-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 12)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const confirmationCode = `CNF-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const financingSummary = state.context.financing.selected
    ? ` Financing: ${currency(state.context.financing.financedBase)} over ${state.context.financing.termMonths} months (${currency(financingMonthly)}/month), upfront ${currency(state.context.financing.upfrontPayment)}, reference ${state.context.financing.decisionId}.`
    : "";
  orderSummary.textContent =
    `Order ${orderId} confirmed (${confirmationCode}). Service ${currency(serviceMonthly)}/month.${financingSummary} Installation fees ${currency(installationFees)}. Charge today ${currency(chargeToday)}. Combined monthly due ${currency(combinedMonthly)}. Shipping to ${state.context.shipping.address}.`;
  checkoutStatus.textContent = "Status: order captured and confirmed.";
  postMessage("bot", `Order confirmed. Order ID ${orderId}, confirmation ${confirmationCode}.`);

  const receiptPayload = {
    orderId,
    confirmationCode,
    createdAt: new Date().toISOString(),
    clientType: state.context.clientType || state.context.customerType || "personal",
    items: state.context.basket.map((item) => ({
      name: item.name,
      monthlyPrice: item.monthlyPrice,
      deviceModel: item.deviceModel || null
    })),
    serviceMonthly,
    financing: state.context.financing.selected
      ? {
          amount: state.context.financing.financedBase,
          termMonths: state.context.financing.termMonths,
          monthlyPayment: state.context.financing.monthlyPayment,
          decisionId: state.context.financing.decisionId
        }
      : null,
    combinedMonthly,
    chargeToday,
    installationFees,
    shippingAddress: state.context.shipping.address
  };
  const receiptWindow = window.open("", "_blank", "noopener,noreferrer,width=980,height=820");
  if (receiptWindow) {
    logClient("info", "receipt_window_opened", { orderId });
    receiptWindow.document.write(buildReceiptHtml(receiptPayload));
    receiptWindow.document.close();
    logClient("info", "receipt_rendered", { orderId });
  }

  logClient("info", "order_submission_success", {
    orderId,
    confirmationCode,
    serviceMonthly,
    financingMonthly,
    combinedMonthly,
    installationFees,
    chargeToday,
    shippingMode: state.context.shipping.mode
  });

  applyContextPatch({ basket: [] });
  renderBasket();
  transitionTo(FLOW_STEPS.AUXILIARY_ASSIST, { activeTask: "order_complete" }, { pushHistory: true });
}

function renderStep(step) {
  clearQuickActions();
  renderBasket();
  renderCarouselPage();
  setStatus();
  resetChatInputHint();
  if (step !== FLOW_STEPS.SHIPPING_MANUAL_ENTRY) clearAddressTypeahead();

  switch (step) {
    case FLOW_STEPS.INIT_CONNECTING: {
      hideAvailabilityCard();
      const t1 = setTimeout(() => {
        postMessage("bot", "We are connecting you, please hold.");
        const t2 = setTimeout(() => {
          transitionTo(FLOW_STEPS.AREA_CODE_ENTRY, {}, { pushHistory: false });
        }, 700);
        state.timers.push(t2);
      }, 400);
      state.timers.push(t1);
      break;
    }

    case FLOW_STEPS.AREA_CODE_ENTRY:
      hideAvailabilityCard();
      postMessage("bot", "Enter your 3-digit area code to unlock offers.");
      setChatInputHint("Area code (e.g., 416)");
      break;

    case FLOW_STEPS.AVAILABILITY_SELECTION:
      showAvailabilityCard();
      postMessage("bot", "Great news. Bell offers are available in your area. Select one option below to continue.");
      break;

    case FLOW_STEPS.EXISTING_AUTH_MODE:
      hideAvailabilityCard();
      postMessage("bot", "Please authenticate as an existing customer.");
      showChoiceButtons(["Continue automatically", "Authenticate with phone/email"], (choice) => {
        postMessage("user", choice);
        if (choice === "Continue automatically") {
          const user = mockUsers.find((u) => u.id === "u1001");
          if (!user) return;
          finalizeExistingAuthentication(user, "auto", user.phone);
          return;
        }
        transitionTo(FLOW_STEPS.EXISTING_AUTH_IDENTIFIER, {}, { pushHistory: true });
      });
      break;

    case FLOW_STEPS.EXISTING_AUTH_IDENTIFIER:
      postMessage("bot", "Enter your phone or email to authenticate.");
      setChatInputHint("416-555-1111 or alex.test@gmail.com");
      break;

    case FLOW_STEPS.NEW_ONBOARD_NAME:
      hideAvailabilityCard();
      postMessage("bot", "Welcome. Let us create your new client profile. Enter your full name.");
      setChatInputHint("Full name");
      break;

    case FLOW_STEPS.NEW_ONBOARD_EMAIL:
      postMessage("bot", "Enter your email address.");
      setChatInputHint("Email");
      break;

    case FLOW_STEPS.NEW_ONBOARD_PHONE:
      postMessage("bot", "Enter your phone number.");
      setChatInputHint("Phone number");
      break;

    case FLOW_STEPS.HELPDESK_ENTRY:
      hideAvailabilityCard();
      postMessage(
        "bot",
        "Welcome to Bell support. How can I help you today?"
      );
      showChoiceButtons(
        [
          "Help Desk",
          "New Products / Upgrades",
          "Troubleshoot Existing Services",
          "Hardware Support"
        ],
        (choice) => {
          postMessage("user", choice);
          if (choice === "New Products / Upgrades") {
            transitionTo(FLOW_STEPS.INTENT_DISCOVERY, { activeTask: "sales" }, { pushHistory: true });
            return;
          }
          if (choice === "Troubleshoot Existing Services" || choice === "Help Desk") {
            transitionTo(FLOW_STEPS.SUPPORT_DISCOVERY, { activeTask: "support" }, { pushHistory: true });
            return;
          }
          transitionTo(FLOW_STEPS.HARDWARE_TROUBLESHOOT, { activeTask: "hardware" }, { pushHistory: true });
        }
      );
      break;

    case FLOW_STEPS.CLIENT_TYPE_SELECTION:
      postMessage("bot", "Before we continue, please confirm: are you a personal or corporate client?");
      showChoiceButtons(["Personal Client", "Corporate Client"], (choice) => {
        postMessage("user", choice);
        if (choice === "Corporate Client") {
          applyContextPatch({ clientType: "corporate" });
          logClient("info", "client_type_selected", { clientType: "corporate" });
          transitionTo(FLOW_STEPS.HELPDESK_ENTRY, { activeTask: "corporate_entry" }, { pushHistory: true });
          return;
        }
        applyContextPatch({ clientType: "personal" });
        logClient("info", "client_type_selected", { clientType: "personal" });
        transitionTo(FLOW_STEPS.HELPDESK_ENTRY, { activeTask: "personal_entry" }, { pushHistory: true });
      });
      break;

    case FLOW_STEPS.CORPORATE_DISCOVERY:
      postMessage(
        "bot",
        "For corporate support, please share team size and business contact email. I can then route offers or connect a corporate specialist."
      );
      setChatInputHint("Example: Team of 45, it-admin@company.com");
      break;

    case FLOW_STEPS.SUPPORT_DISCOVERY:
      postMessage("bot", "I can help with service support. Please choose your issue category.");
      showChoiceButtons(["Internet issue", "Billing issue", "Service outage", "Resolved", "Need specialist"], (choice) => {
        postMessage("user", choice);
        if (choice === "Resolved") {
          applyContextPatch({ supportCase: { resolved: true } });
          logClient("info", "troubleshooting_resolved", { category: state.context.supportCase.category });
          transitionTo(FLOW_STEPS.AUXILIARY_ASSIST, { activeTask: "support_complete" }, { pushHistory: true });
          return;
        }
        if (choice === "Need specialist") {
          applyContextPatch({ escalatedToAgent: true });
          transitionTo(FLOW_STEPS.WARM_AGENT_ROUTING, { activeTask: "troubleshooting" }, { pushHistory: true });
          return;
        }
        applyContextPatch({ supportCase: { category: choice } });
        logClient("info", "support_issue_category_selected", { category: choice });
        postMessage("bot", "I recommend restarting your equipment, checking service status, and confirming account settings. Did that resolve the issue?");
        logClient("info", "troubleshooting_step_presented", { category: choice });
      });
      break;

    case FLOW_STEPS.HARDWARE_TROUBLESHOOT:
      postMessage("bot", "Let’s troubleshoot your hardware. Which device are you calling about?");
      showChoiceButtons(["Modem/Router", "Phone device", "TV receiver", "Resolved", "Issue unresolved"], (choice) => {
        postMessage("user", choice);
        if (choice === "Resolved") {
          logClient("info", "troubleshooting_resolved", { category: "hardware_resolved" });
          transitionTo(FLOW_STEPS.AUXILIARY_ASSIST, { activeTask: "hardware_complete" }, { pushHistory: true });
          return;
        }
        if (choice === "Issue unresolved") {
          applyContextPatch({ escalatedToAgent: true });
          logClient("info", "troubleshooting_unresolved", { channel: "hardware" });
          transitionTo(FLOW_STEPS.WARM_AGENT_ROUTING, { activeTask: "hardware_troubleshooting" }, { pushHistory: true });
          return;
        }
        postMessage("bot", "Please reboot the device, verify cabling/power, and run the self-check from your account. Tell me if this fixes it.");
        logClient("info", "troubleshooting_step_presented", { category: `hardware_${choice}` });
      });
      break;

    case FLOW_STEPS.WARM_AGENT_ROUTING:
      postMessage("bot", "I’m stepping in to help directly. Let’s sort this out together. What do you need right now?");
      showChoiceButtons(["Product selection", "Offer assistance", "Troubleshooting", "Login guidance"], (choice) => {
        postMessage("user", choice);
        transitionTo(FLOW_STEPS.AGENT_ASSIST_CLARIFY, { activeTask: choice.toLowerCase(), escalatedToAgent: true }, { pushHistory: true });
      });
      break;

    case FLOW_STEPS.AGENT_ASSIST_CLARIFY: {
      const nextStep = routeFromAgentAssist(state.context.activeTask);
      postMessage("bot", "Thanks for clarifying. I’ll route you to the right step now.");
      logClient("info", "warm_agent_re_routed_step", { activeTask: state.context.activeTask, nextStep });
      transitionTo(nextStep, {}, { pushHistory: false });
      break;
    }

    case FLOW_STEPS.INTENT_DISCOVERY:
      hideAvailabilityCard();
      postMessage("bot", "What do you need today: mobility, home internet, landline, or bundle?");
      showChoiceButtons(["Mobility", "Home internet", "Landline", "Bundle"], async (choice) => {
        postMessage("user", choice);
        const intent = await detectIntent(choice);
        const pageMap = {
          mobility: 0,
          "home internet": 1,
          landline: 2,
          bundle: 0
        };
        state.offerPageIndex = pageMap[intent] ?? 0;
        if (intent === "mobility") {
          transitionTo(FLOW_STEPS.DEVICE_OS_SELECTION, { intent, activeTask: "sales_mobility" }, { pushHistory: true });
          return;
        }
        transitionTo(FLOW_STEPS.OFFER_BROWSE, { intent, deviceSelection: { osType: null, model: null } }, { pushHistory: true });
      });
      break;

    case FLOW_STEPS.DEVICE_OS_SELECTION:
      postMessage("bot", "For mobility phones, do you want iOS, Android, or other devices?");
      showChoiceButtons(["iOS", "Android", "Other devices"], (choice) => {
        postMessage("user", choice);
        const osType = choice === "iOS" ? "ios" : choice === "Android" ? "android" : "other";
        applyContextPatch({ deviceSelection: { osType, model: null } });
        logClient("info", "device_os_selected", { osType });
        transitionTo(FLOW_STEPS.OFFER_BROWSE, {}, { pushHistory: true });
      });
      break;

    case FLOW_STEPS.OFFER_BROWSE:
      hideAvailabilityCard();
      postMessage("bot", `Browsing offers. ${carouselPageLabel.textContent}. Use Prev/Next or add items to basket.`);
      break;

    case FLOW_STEPS.BASKET_REVIEW:
      postMessage("bot", "Reviewing basket and running eligibility checks.");
      transitionTo(FLOW_STEPS.ELIGIBILITY_CHECK, {}, { pushHistory: false });
      break;

    case FLOW_STEPS.ELIGIBILITY_CHECK:
      runEligibilityCheck();
      break;

    case FLOW_STEPS.PAYMENT_METHOD:
      tokenizeBtn.disabled = false;
      const paymentProfile = getEligibilityProfile(state.context);
      const supportsExisting = Boolean(paymentProfile?.savedCardLast4);
      postMessage(
        "bot",
        supportsExisting
          ? "Select payment method: Visa, MasterCard, Amex, Existing Payment, or Bell Smart Financing."
          : "Select payment method: Visa, MasterCard, Amex, or Bell Smart Financing."
      );
      renderPaymentChoices(paymentProfile, (method, label) => {
        postMessage("user", label);
        choosePaymentMethod(method);
      });
      break;

    case FLOW_STEPS.PAYMENT_FINANCING_TERM:
      postMessage(
        "bot",
        `Bell Smart Financing options are available. Eligible device total: ${currency(state.context.financing.approvedAmount)}. Choose how you want to proceed.`
      );
      showChoiceButtons(["SmartPay 24 months", "SmartPay 36 months", "SmartPay with deferred balance", "Pay full device upfront"], (choice) => {
        postMessage("user", choice);
        if (choice === "Pay full device upfront") {
          applyContextPatch({
            payment: {
              method: "device_upfront",
              expectedLast4: null,
              last4Confirmed: true,
              cvvValidated: true,
              verified: true,
              token: `upfront_${Date.now()}`
            },
            financing: {
              selected: false,
              planType: "full_upfront",
              termMonths: null,
              deferredRatio: 0,
              upfrontPayment: state.context.financing.approvedAmount,
              approvalStatus: "approved",
              financedBase: 0,
              deferredAmount: 0,
              monthlyPayment: 0,
              decisionId: `FIN-UPFRONT-${Date.now()}`
            }
          });
          logClient("info", "financing_selected", { planType: "full_upfront", approvedAmount: state.context.financing.approvedAmount });
          transitionTo(FLOW_STEPS.SHIPPING_SELECTION, {}, { pushHistory: true });
          return;
        }

        const termMonths = choice.includes("36") ? 36 : 24;
        const deferredRatio = choice.includes("deferred") ? 0.35 : 0;
        const planType = choice.includes("deferred") ? "smartpay_deferred" : "smartpay_standard";
        applyContextPatch({ financing: { planType, termMonths, deferredRatio, approvalStatus: "pending" } });
        logClient("info", "financing_term_selected", { termMonths, planType, deferredRatio });
        transitionTo(FLOW_STEPS.PAYMENT_FINANCING_UPFRONT, {}, { pushHistory: true });
      });
      break;

    case FLOW_STEPS.PAYMENT_FINANCING_UPFRONT:
      postMessage(
        "bot",
        `How much do you want to pay upfront today for the device? Eligible amount is ${currency(state.context.financing.approvedAmount)}.`
      );
      setChatInputHint("Enter upfront amount, e.g. 200");
      break;

    case FLOW_STEPS.PAYMENT_FINANCING_APPROVAL: {
      const termMonths = state.context.financing.termMonths;
      const approvedAmount = state.context.financing.approvedAmount || getFinancingAmount(state.context.basket);
      const decisionId = generateFinancingDecisionId();
      logClient("info", "financing_approval_requested", { termMonths, approvedAmount, decisionId });
      const approved = runMockFinancingApproval();
      if (!approved) {
        applyContextPatch({
          financing: {
            approvalStatus: "declined",
            decisionId
          }
        });
        postMessage("bot", "Bell Smart Financing was not approved this time. Please choose Visa, MasterCard, Amex, or existing payment.");
        logClient("info", "financing_declined", { decisionId, termMonths, approvedAmount });
        logClient("info", "financing_fallback_to_card", { reason: "declined", decisionId });
        transitionTo(FLOW_STEPS.PAYMENT_METHOD, {}, { pushHistory: true });
        return;
      }

      const financingBreakdown = calculateFinancingBreakdown(
        approvedAmount,
        state.context.financing.upfrontPayment,
        termMonths,
        state.context.financing.deferredRatio
      );
      applyContextPatch({
        financing: {
          approvalStatus: "approved",
          decisionId,
          financedBase: financingBreakdown.financedBase,
          deferredAmount: financingBreakdown.deferredAmount,
          monthlyPayment: financingBreakdown.monthlyPayment
        }
      });
      logClient("info", "financing_approved", {
        decisionId,
        termMonths,
        approvedAmount,
        upfrontPayment: state.context.financing.upfrontPayment,
        monthlyPayment: financingBreakdown.monthlyPayment,
        deferredAmount: financingBreakdown.deferredAmount
      });
      transitionTo(FLOW_STEPS.PAYMENT_FINANCING_CONFIRM, {}, { pushHistory: false });
      break;
    }

    case FLOW_STEPS.PAYMENT_FINANCING_CONFIRM:
      const { chargeToday, combinedMonthly } = getCheckoutTotals();
      postMessage(
        "bot",
        `Financing approved. Device total ${currency(state.context.financing.approvedAmount)}. Upfront ${currency(state.context.financing.upfrontPayment)}. Financed ${currency(state.context.financing.financedBase)} over ${state.context.financing.termMonths} months at ${currency(state.context.financing.monthlyPayment)}/month. ${
          state.context.financing.deferredAmount > 0 ? `Deferred balance ${currency(state.context.financing.deferredAmount)} applies at term end. ` : ""
        }Charge today is ${currency(chargeToday)} and monthly going forward is ${currency(combinedMonthly)}. Decision reference ${state.context.financing.decisionId}.`
      );
      showChoiceButtons(["Confirm financing", "Choose another payment method"], (choice) => {
        postMessage("user", choice);
        if (choice === "Confirm financing") {
          applyContextPatch({
            payment: {
              method: "smart_financing",
              expectedLast4: null,
              last4Confirmed: true,
              cvvValidated: true,
              verified: true,
              token: `fin_${Date.now()}`
            },
            financing: {
              selected: true
            }
          });
          logClient("info", "financing_confirmed", {
            decisionId: state.context.financing.decisionId,
            termMonths: state.context.financing.termMonths,
            approvedAmount: state.context.financing.approvedAmount,
            monthlyPayment: state.context.financing.monthlyPayment
          });
          transitionTo(FLOW_STEPS.SHIPPING_SELECTION, {}, { pushHistory: true });
          return;
        }
        logClient("info", "financing_fallback_to_card", { reason: "user_changed_method" });
        transitionTo(FLOW_STEPS.PAYMENT_METHOD, {}, { pushHistory: true });
      });
      break;

    case FLOW_STEPS.PAYMENT_CONFIRM_LAST4:
      if (state.context.payment.method === "existing") {
        const savedType = describePaymentMethod("existing", getEligibilityProfile(state.context));
        postMessage("bot", `Do you want to use your ${savedType} ending in ${state.context.payment.expectedLast4}?`);
      } else {
        postMessage(
          "bot",
          `Please confirm you are using your ${describePaymentMethod(state.context.payment.method, getEligibilityProfile(state.context))} ending in ${state.context.payment.expectedLast4}.`
        );
      }
      showChoiceButtons(["Yes, confirm", "No, choose another method"], (choice) => {
        postMessage("user", choice);
        if (choice === "Yes, confirm") {
          applyContextPatch({ payment: { last4Confirmed: true } });
          logClient("info", "payment_confirmed", { method: state.context.payment.method });
          transitionTo(FLOW_STEPS.PAYMENT_CVV, {}, { pushHistory: true });
          return;
        }
        transitionTo(FLOW_STEPS.PAYMENT_METHOD, {}, { pushHistory: true });
      });
      break;

    case FLOW_STEPS.PAYMENT_CVV:
      postMessage("bot", "Enter your 3-digit CVC to finalize payment authorization.");
      setChatInputHint("3-digit CVC");
      break;

    case FLOW_STEPS.SHIPPING_SELECTION:
      postMessage("bot", "Select shipping option: prefilled address, new address, or lookup address.");
      showChoiceButtons(["Use prefilled address", "Enter new address", "Lookup address"], (choice) => {
        postMessage("user", choice);
        if (choice === "Use prefilled address") {
          const address = getEligibilityProfile(state.context)?.prefilledAddress || "100 Default St, Toronto, ON";
          applyContextPatch({ shipping: { mode: "prefilled", address } });
          logClient("info", "shipping_prefilled_selected", { address });
          transitionTo(FLOW_STEPS.ORDER_REVIEW, {}, { pushHistory: true });
          return;
        }

        if (choice === "Enter new address") {
          transitionTo(FLOW_STEPS.SHIPPING_MANUAL_ENTRY, {}, { pushHistory: true });
          return;
        }

        transitionTo(FLOW_STEPS.SHIPPING_LOOKUP, {}, { pushHistory: true });
      });
      break;

    case FLOW_STEPS.SHIPPING_LOOKUP:
      postMessage("bot", "Enter an address keyword to lookup shipping addresses.");
      setChatInputHint("e.g., Front St");
      break;

    case FLOW_STEPS.SHIPPING_MANUAL_ENTRY:
      postMessage("bot", "Enter the full shipping address.");
      setChatInputHint("Full shipping address");
      clearAddressTypeahead();
      break;

    case FLOW_STEPS.ORDER_REVIEW: {
      const { serviceMonthly, financingMonthly, combinedMonthly, installationFees, chargeToday } = getCheckoutTotals();
      const financingDetail = state.context.financing.selected
        ? ` Financing ${currency(state.context.financing.financedBase)} over ${state.context.financing.termMonths} months (${currency(financingMonthly)}/month), upfront ${currency(state.context.financing.upfrontPayment)}, ref ${state.context.financing.decisionId}.`
        : "";
      postMessage(
        "bot",
        `Order review: ${state.context.basket.length} item(s), service ${currency(serviceMonthly)}/month.${financingDetail} Installation fees ${currency(installationFees)}. Charge today ${currency(chargeToday)}. Combined monthly due ${currency(combinedMonthly)}. Shipping to ${state.context.shipping.address}.`
      );
      checkoutStatus.textContent = "Status: ready to place order.";
      const paymentLine =
        state.context.payment.method === "smart_financing"
          ? `Payment: Bell Smart Financing approved (${state.context.financing.termMonths} months).`
          : state.context.payment.method === "device_upfront"
            ? "Payment: Full device amount paid upfront today."
            : `Payment ${state.context.payment.method} ending ${state.context.payment.expectedLast4}.`;
      const financingLine = state.context.financing.selected
        ? ` Device amount financed: ${currency(state.context.financing.financedBase)}. Term: ${state.context.financing.termMonths}. Financing monthly: ${currency(financingMonthly)}. Upfront: ${currency(state.context.financing.upfrontPayment)}. Decision reference: ${state.context.financing.decisionId}.`
        : "";
      orderSummary.textContent = `${paymentLine}${financingLine} Service monthly: ${currency(serviceMonthly)}. Installation fees: ${currency(installationFees)}. Charge today: ${currency(chargeToday)}. Combined monthly due: ${currency(combinedMonthly)}. Shipping: ${state.context.shipping.address}.`;
      placeOrderBtn.disabled = false;
      logClient("info", "order_submission_attempt", { basketItems: state.context.basket.length, serviceMonthly, financingMonthly, combinedMonthly, installationFees, chargeToday });
      break;
    }

    case FLOW_STEPS.ORDER_CONFIRMED:
      postMessage("bot", "Thank you for contacting Bell. Your request is complete. You can continue shopping or start a fresh session.");
      break;

    case FLOW_STEPS.AUXILIARY_ASSIST:
      postMessage("bot", "Is there anything else I can help you with today?");
      showChoiceButtons(
        ["New Products / Upgrades", "Help Desk / Troubleshooting", "Hardware Support", "No, that is all"],
        (choice) => {
          postMessage("user", choice);
          if (choice === "New Products / Upgrades") {
            transitionTo(FLOW_STEPS.INTENT_DISCOVERY, { activeTask: "sales" }, { pushHistory: true });
            return;
          }
          if (choice === "Help Desk / Troubleshooting") {
            transitionTo(FLOW_STEPS.SUPPORT_DISCOVERY, { activeTask: "support" }, { pushHistory: true });
            return;
          }
          if (choice === "Hardware Support") {
            transitionTo(FLOW_STEPS.HARDWARE_TROUBLESHOOT, { activeTask: "hardware" }, { pushHistory: true });
            return;
          }
          if (state.context.escalatedToAgent && state.context.agentRating == null) {
            transitionTo(FLOW_STEPS.POST_AGENT_RATING, {}, { pushHistory: true });
            return;
          }
          transitionTo(FLOW_STEPS.ORDER_CONFIRMED, {}, { pushHistory: true });
        }
      );
      break;

    case FLOW_STEPS.POST_AGENT_RATING:
      postMessage("bot", "Before you go, please rate your support experience with our agent assistant.");
      showChoiceButtons(["1 star", "2 stars", "3 stars", "4 stars", "5 stars"], (choice) => {
        postMessage("user", choice);
        const rating = Number(choice[0]);
        applyContextPatch({ agentRating: rating });
        logClient("info", "agent_rating_submitted", { rating });
        if (rating < 3) {
          transitionTo(FLOW_STEPS.POST_AGENT_FEEDBACK, {}, { pushHistory: true });
          return;
        }
        postMessage("bot", "Thank you for rating your interaction.");
        transitionTo(FLOW_STEPS.ORDER_CONFIRMED, {}, { pushHistory: true });
      });
      break;

    case FLOW_STEPS.POST_AGENT_FEEDBACK:
      postMessage("bot", "Thank you for the rating. What could the agent have done differently?");
      setChatInputHint("Share your feedback");
      break;

    default:
      break;
  }
}

function normalizeCommand(text = "") {
  return text.trim().toLowerCase();
}

function handleGlobalCommands(message) {
  const cmd = normalizeCommand(message);

  if (cmd.includes("go back") || cmd === "back" || cmd.includes("previous step")) {
    if (state.flowStep === FLOW_STEPS.PAYMENT_FINANCING_CONFIRM) {
      transitionTo(FLOW_STEPS.PAYMENT_FINANCING_TERM, {}, { pushHistory: false });
      return true;
    }
    goBack();
    return true;
  }

  if (cmd.includes("start fresh") || cmd.includes("restart") || cmd.includes("reset")) {
    refreshChat();
    return true;
  }

  if (cmd.includes("re-login") || cmd.includes("login again")) {
    transitionTo(FLOW_STEPS.EXISTING_AUTH_MODE, { customerType: "existing" }, { pushHistory: true });
    return true;
  }

  if (cmd.includes("next page") && state.flowStep === FLOW_STEPS.OFFER_BROWSE) {
    if (state.offerPageIndex < CATEGORY_PAGES.length - 1) {
      state.offerPageIndex += 1;
      renderCarouselPage();
      postMessage("bot", `Moved to ${carouselPageLabel.textContent}.`);
    }
    return true;
  }

  if ((cmd.includes("previous page") || cmd.includes("prev page")) && state.flowStep === FLOW_STEPS.OFFER_BROWSE) {
    if (state.offerPageIndex > 0) {
      state.offerPageIndex -= 1;
      renderCarouselPage();
      postMessage("bot", `Moved to ${carouselPageLabel.textContent}.`);
    }
    return true;
  }

  return false;
}

function routeFromAgentAssist(task = "") {
  const t = String(task || "").toLowerCase();
  if (t.includes("product")) return FLOW_STEPS.INTENT_DISCOVERY;
  if (t.includes("offer")) return FLOW_STEPS.OFFER_BROWSE;
  if (t.includes("troubleshoot")) return FLOW_STEPS.SUPPORT_DISCOVERY;
  if (t.includes("login") || t.includes("auth")) return FLOW_STEPS.EXISTING_AUTH_IDENTIFIER;
  return FLOW_STEPS.HELPDESK_ENTRY;
}

function handleUnclearInput(message, fallbackPrompt) {
  const outcome = getRetryOutcome(state.context.clarifyRetries, 3);
  applyContextPatch({ clarifyRetries: outcome.nextRetries });
  logClient("info", "clarify_retry_incremented", { retries: outcome.nextRetries, message });
  if (outcome.escalate) {
    applyContextPatch({ escalatedToAgent: true });
    logClient("info", "warm_agent_routed", { reason: "unclear_retries", retries: outcome.nextRetries });
    transitionTo(FLOW_STEPS.WARM_AGENT_ROUTING, { activeTask: "clarification_support" }, { pushHistory: true });
    return;
  }
  postMessage("bot", `${fallbackPrompt} I can clarify this for you.`);
}

async function handleChatInput(message) {
  if (handleGlobalCommands(message)) {
    return;
  }
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  switch (state.flowStep) {
    case FLOW_STEPS.INIT_CONNECTING:
      postMessage("bot", "We are still connecting you. Please hold for a moment.");
      return;

    case FLOW_STEPS.AVAILABILITY_SELECTION:
      if (lower.includes("existing")) {
        hideAvailabilityCard();
        transitionTo(
          FLOW_STEPS.EXISTING_AUTH_MODE,
          {
            customerType: "existing"
          },
          { pushHistory: true }
        );
        return;
      }
      if (lower.includes("new")) {
        hideAvailabilityCard();
        transitionTo(
          FLOW_STEPS.NEW_ONBOARD_NAME,
          {
            customerType: "new"
          },
          { pushHistory: true }
        );
        return;
      }
      postMessage("bot", "Please choose 'I'm new to Bell' or 'I'm an existing Bell customer'.");
      return;

    case FLOW_STEPS.AREA_CODE_ENTRY:
      if (!/^\d{3}$/.test(trimmed)) {
        postMessage("bot", "Please enter a valid 3-digit area code.");
        logClient("error", "invalid_area_code", { value: trimmed, viaChatInput: true });
        return;
      }
      transitionTo(FLOW_STEPS.AVAILABILITY_SELECTION, { areaCode: trimmed }, { pushHistory: true });
      return;

    case FLOW_STEPS.EXISTING_AUTH_IDENTIFIER: {
      authIdentifierInput.value = trimmed;
      logClient("info", "auth_attempt", { identifier: trimmed, viaChatInput: true });
      const user = resolveUserFromIdentifier(trimmed);
      if (!user) {
        postMessage("bot", "Authentication failed. Use phone starting 416/647/986 or alex.test@gmail.com.");
        logClient("error", "auth_failure", { identifier: trimmed, viaChatInput: true });
        return;
      }
      finalizeExistingAuthentication(user, "manual", trimmed);
      return;
    }

    case FLOW_STEPS.EXISTING_AUTH_MODE:
      if (lower.includes("continue automatically") || lower === "auto" || lower === "yes") {
        const user = mockUsers.find((u) => u.id === "u1001");
        if (!user) return;
        finalizeExistingAuthentication(user, "auto", user.phone);
        return;
      }
      if (lower.includes("phone") || lower.includes("email") || lower.includes("authenticate")) {
        transitionTo(FLOW_STEPS.EXISTING_AUTH_IDENTIFIER, {}, { pushHistory: true });
        return;
      }
      postMessage("bot", "Choose 'Continue automatically' or 'Authenticate with phone/email'.");
      return;

    case FLOW_STEPS.HELPDESK_ENTRY:
      if (lower.includes("upgrade") || lower.includes("product") || lower.includes("sales")) {
        transitionTo(FLOW_STEPS.INTENT_DISCOVERY, { activeTask: "sales" }, { pushHistory: true });
        return;
      }
      if (lower.includes("troubleshoot") || lower.includes("help desk") || lower.includes("support")) {
        transitionTo(FLOW_STEPS.SUPPORT_DISCOVERY, { activeTask: "support" }, { pushHistory: true });
        return;
      }
      if (lower.includes("hardware")) {
        transitionTo(FLOW_STEPS.HARDWARE_TROUBLESHOOT, { activeTask: "hardware" }, { pushHistory: true });
        return;
      }
      handleUnclearInput(message, "Please choose: Help Desk, New Products/Upgrades, Troubleshooting, or Hardware.");
      return;

    case FLOW_STEPS.CLIENT_TYPE_SELECTION:
      if (lower.includes("corporate")) {
        applyContextPatch({ clientType: "corporate" });
        logClient("info", "client_type_selected", { clientType: "corporate", viaChatInput: true });
        transitionTo(FLOW_STEPS.HELPDESK_ENTRY, { activeTask: "corporate_entry" }, { pushHistory: true });
        return;
      }
      if (lower.includes("personal")) {
        applyContextPatch({ clientType: "personal" });
        logClient("info", "client_type_selected", { clientType: "personal", viaChatInput: true });
        transitionTo(FLOW_STEPS.HELPDESK_ENTRY, { activeTask: "personal_entry" }, { pushHistory: true });
        return;
      }
      handleUnclearInput(message, "Please indicate personal client or corporate client.");
      return;

    case FLOW_STEPS.CORPORATE_DISCOVERY:
      if (!trimmed) {
        handleUnclearInput(message, "Please share team size and a business contact email.");
        return;
      }
      applyContextPatch({ corporateProfile: { captured: true, notes: trimmed } });
      logClient("info", "corporate_profile_captured", { notes: trimmed });
      postMessage("bot", "Thank you. I can now guide business offers or connect you to a corporate specialist.");
      showChoiceButtons(["View business offers", "Talk to corporate specialist"], (choice) => {
        postMessage("user", choice);
        if (choice === "View business offers") {
          transitionTo(FLOW_STEPS.INTENT_DISCOVERY, { activeTask: "corporate_sales" }, { pushHistory: true });
          return;
        }
        applyContextPatch({ escalatedToAgent: true });
        logClient("info", "corporate_specialist_routed", { via: "corporate_discovery" });
        transitionTo(FLOW_STEPS.WARM_AGENT_ROUTING, { activeTask: "corporate_specialist" }, { pushHistory: true });
      });
      return;

    case FLOW_STEPS.SUPPORT_DISCOVERY:
      if (lower.includes("resolved") || lower.includes("fixed")) {
        applyContextPatch({ supportCase: { resolved: true } });
        logClient("info", "troubleshooting_resolved", { viaChatInput: true });
        transitionTo(FLOW_STEPS.AUXILIARY_ASSIST, { activeTask: "support_complete" }, { pushHistory: true });
        return;
      }
      if (lower.includes("specialist") || lower.includes("agent")) {
        applyContextPatch({ escalatedToAgent: true });
        transitionTo(FLOW_STEPS.WARM_AGENT_ROUTING, { activeTask: "troubleshooting" }, { pushHistory: true });
        return;
      }
      if (lower.includes("internet") || lower.includes("billing") || lower.includes("outage")) {
        const category = lower.includes("billing") ? "Billing issue" : lower.includes("outage") ? "Service outage" : "Internet issue";
        applyContextPatch({ supportCase: { category } });
        logClient("info", "support_issue_category_selected", { category, viaChatInput: true });
        postMessage("bot", "I recommend restarting your equipment, checking outages, and confirming account status. Reply 'resolved' when fixed.");
        logClient("info", "troubleshooting_step_presented", { category, viaChatInput: true });
        return;
      }
      handleUnclearInput(message, "Please choose internet issue, billing issue, service outage, resolved, or specialist.");
      return;

    case FLOW_STEPS.HARDWARE_TROUBLESHOOT:
      if (lower.includes("resolved") || lower.includes("fixed")) {
        logClient("info", "troubleshooting_resolved", { category: "hardware_resolved", viaChatInput: true });
        transitionTo(FLOW_STEPS.AUXILIARY_ASSIST, { activeTask: "hardware_complete" }, { pushHistory: true });
        return;
      }
      if (lower.includes("unresolved") || lower.includes("not working")) {
        applyContextPatch({ escalatedToAgent: true });
        logClient("info", "troubleshooting_unresolved", { channel: "hardware", viaChatInput: true });
        transitionTo(FLOW_STEPS.WARM_AGENT_ROUTING, { activeTask: "hardware_troubleshooting" }, { pushHistory: true });
        return;
      }
      if (lower.includes("modem") || lower.includes("router") || lower.includes("phone") || lower.includes("tv")) {
        logClient("info", "troubleshooting_step_presented", { category: "hardware", viaChatInput: true });
        postMessage("bot", "Please power-cycle the hardware, confirm cables, and re-run diagnostics from your account. Reply 'unresolved' if still an issue.");
        return;
      }
      handleUnclearInput(message, "Please specify modem/router, phone device, TV receiver, or unresolved.");
      return;

    case FLOW_STEPS.AUXILIARY_ASSIST:
      if (lower.includes("product") || lower.includes("upgrade") || lower.includes("sales")) {
        transitionTo(FLOW_STEPS.INTENT_DISCOVERY, { activeTask: "sales" }, { pushHistory: true });
        return;
      }
      if (lower.includes("help") || lower.includes("troubleshoot") || lower.includes("support")) {
        transitionTo(FLOW_STEPS.SUPPORT_DISCOVERY, { activeTask: "support" }, { pushHistory: true });
        return;
      }
      if (lower.includes("hardware")) {
        transitionTo(FLOW_STEPS.HARDWARE_TROUBLESHOOT, { activeTask: "hardware" }, { pushHistory: true });
        return;
      }
      if (lower.includes("no") || lower.includes("that's all") || lower.includes("that is all") || lower.includes("done")) {
        if (state.context.escalatedToAgent && state.context.agentRating == null) {
          transitionTo(FLOW_STEPS.POST_AGENT_RATING, {}, { pushHistory: true });
          return;
        }
        transitionTo(FLOW_STEPS.ORDER_CONFIRMED, {}, { pushHistory: true });
        return;
      }
      handleUnclearInput(message, "Please tell me if you want products/upgrades, helpdesk support, hardware support, or no further help.");
      return;

    case FLOW_STEPS.WARM_AGENT_ROUTING:
      applyContextPatch({ activeTask: trimmed || "clarification_support", escalatedToAgent: true });
      logClient("info", "warm_agent_resolved", { chosenTask: trimmed || "clarification_support", viaChatInput: true });
      transitionTo(FLOW_STEPS.AGENT_ASSIST_CLARIFY, {}, { pushHistory: true });
      return;

    case FLOW_STEPS.AGENT_ASSIST_CLARIFY: {
      const nextStep = routeFromAgentAssist(state.context.activeTask || trimmed);
      logClient("info", "warm_agent_re_routed_step", { activeTask: state.context.activeTask || trimmed, nextStep, viaChatInput: true });
      transitionTo(nextStep, {}, { pushHistory: true });
      return;
    }

    case FLOW_STEPS.NEW_ONBOARD_NAME:
      if (!trimmed) {
        postMessage("bot", "Full name is required.");
        return;
      }
      transitionTo(FLOW_STEPS.NEW_ONBOARD_EMAIL, { newOnboarding: { fullName: trimmed } }, { pushHistory: true });
      return;

    case FLOW_STEPS.NEW_ONBOARD_EMAIL:
      if (!trimmed.includes("@")) {
        postMessage("bot", "Please enter a valid email address.");
        return;
      }
      transitionTo(FLOW_STEPS.NEW_ONBOARD_PHONE, { newOnboarding: { email: trimmed } }, { pushHistory: true });
      return;

    case FLOW_STEPS.NEW_ONBOARD_PHONE:
      if (trimmed.replace(/\D/g, "").length < 10) {
        postMessage("bot", "Please enter a valid phone number.");
        return;
      }
      const leadId = `lead_${Date.now()}`;
      transitionTo(
        FLOW_STEPS.CLIENT_TYPE_SELECTION,
        {
          newOnboarding: { phone: trimmed, leadId },
          customerType: "new"
        },
        { pushHistory: true }
      );
      postMessage("bot", `New client profile created (ID: ${leadId}). Continuing to plan discovery.`);
      const hash = await createIdentityHash(
        `${state.context.newOnboarding.fullName || ""}|${state.context.newOnboarding.email || ""}|${trimmed}|${Date.now()}`
      );
      const secureRef = `${generateSecureRef()}-${hash}`;
      applyContextPatch({
        authMeta: {
          mode: "new-client",
          phone: trimmed,
          email: state.context.newOnboarding.email,
          secureRef
        }
      });
      setStatus();
      postMessage(
        "bot",
        `Profile captured. Name: ${state.context.newOnboarding.fullName}, Email: ${state.context.newOnboarding.email}, Phone: ${formatPhone(trimmed)}. Secure reference ${secureRef}.`
      );
      logClient("info", "new_customer_created", {
        leadId,
        fullName: state.context.newOnboarding.fullName,
        email: state.context.newOnboarding.email,
        phone: trimmed
      });
      return;

    case FLOW_STEPS.INTENT_DISCOVERY: {
      const intent = await detectIntent(trimmed);
      const pageMap = { mobility: 0, "home internet": 1, landline: 2, bundle: 0 };
      state.offerPageIndex = pageMap[intent] ?? 0;
      if (intent === "mobility") {
        transitionTo(FLOW_STEPS.DEVICE_OS_SELECTION, { intent, activeTask: "sales_mobility" }, { pushHistory: true });
        return;
      }
      transitionTo(FLOW_STEPS.OFFER_BROWSE, { intent, deviceSelection: { osType: null, model: null } }, { pushHistory: true });
      return;
    }

    case FLOW_STEPS.DEVICE_OS_SELECTION:
      if (lower.includes("ios")) {
        applyContextPatch({ deviceSelection: { osType: "ios", model: "iPhone" } });
        logClient("info", "device_os_selected", { osType: "ios", viaChatInput: true });
        transitionTo(FLOW_STEPS.OFFER_BROWSE, {}, { pushHistory: true });
        return;
      }
      if (lower.includes("android")) {
        applyContextPatch({ deviceSelection: { osType: "android", model: "Android" } });
        logClient("info", "device_os_selected", { osType: "android", viaChatInput: true });
        transitionTo(FLOW_STEPS.OFFER_BROWSE, {}, { pushHistory: true });
        return;
      }
      if (lower.includes("other")) {
        applyContextPatch({ deviceSelection: { osType: "other", model: "Other" } });
        logClient("info", "device_os_selected", { osType: "other", viaChatInput: true });
        transitionTo(FLOW_STEPS.OFFER_BROWSE, {}, { pushHistory: true });
        return;
      }
      handleUnclearInput(message, "Please choose iOS, Android, or Other devices.");
      return;

    case FLOW_STEPS.OFFER_BROWSE:
      if (lower.includes("checkout")) {
        if (state.context.basket.length === 0) {
          postMessage("bot", "Please add at least one item to your basket first.");
          return;
        }
        transitionTo(FLOW_STEPS.BASKET_REVIEW, {}, { pushHistory: true });
        return;
      }
      if (lower.includes("mobility")) {
        state.offerPageIndex = 0;
        renderCarouselPage();
        postMessage("bot", `Moved to ${carouselPageLabel.textContent}.`);
        return;
      }
      if (lower.includes("internet")) {
        state.offerPageIndex = 1;
        renderCarouselPage();
        postMessage("bot", `Moved to ${carouselPageLabel.textContent}.`);
        return;
      }
      if (lower.includes("landline") || lower.includes("home phone")) {
        state.offerPageIndex = 2;
        renderCarouselPage();
        postMessage("bot", `Moved to ${carouselPageLabel.textContent}.`);
        return;
      }
      postMessage(
        "bot",
        "I can help with this step. You can say 'next page', 'previous page', 'checkout', 'go back', or ask for clarification."
      );
      handleUnclearInput(message, "I can help with this step.");
      return;

    case FLOW_STEPS.ORDER_REVIEW:
      if (lower.includes("place order") || lower.includes("confirm")) {
        confirmOrder();
        return;
      }
      postMessage("bot", "Please say 'place order' to complete, or 'go back' to revise payment/shipping.");
      return;

    case FLOW_STEPS.POST_AGENT_RATING: {
      const rating = Number((trimmed.match(/[1-5]/) || [])[0]);
      if (!rating) {
        handleUnclearInput(message, "Please provide a rating between 1 and 5 stars.");
        return;
      }
      applyContextPatch({ agentRating: rating });
      logClient("info", "agent_rating_submitted", { rating, viaChatInput: true });
      if (rating < 3) {
        transitionTo(FLOW_STEPS.POST_AGENT_FEEDBACK, {}, { pushHistory: true });
        return;
      }
      postMessage("bot", "Thank you for rating your interaction.");
      transitionTo(FLOW_STEPS.ORDER_CONFIRMED, {}, { pushHistory: true });
      return;
    }

    case FLOW_STEPS.POST_AGENT_FEEDBACK:
      if (!trimmed) {
        handleUnclearInput(message, "Please share what the agent could have done differently.");
        return;
      }
      applyContextPatch({ agentFeedback: trimmed });
      logClient("info", "agent_feedback_submitted", { feedback: trimmed, rating: state.context.agentRating });
      postMessage("bot", "Thank you for the feedback. We appreciate your time.");
      transitionTo(FLOW_STEPS.ORDER_CONFIRMED, {}, { pushHistory: true });
      return;

    case FLOW_STEPS.PAYMENT_CVV:
      if (!/^\d{3}$/.test(trimmed)) {
        postMessage("bot", "Invalid CVC. Please provide exactly 3 digits.");
        logClient("error", "cvv_invalid", { cvvLength: trimmed.length, viaChatInput: true });
        return;
      }
      applyContextPatch({
        payment: {
          cvvValidated: true,
          verified: true,
          token: state.context.authUser?.existingPaymentToken || `tok_${Date.now()}`
        }
      });
      logClient("info", "cvv_validated", { method: state.context.payment.method, viaChatInput: true });
      postMessage("bot", `CVC validated for card ending in ${state.context.payment.expectedLast4}.`);
      transitionTo(FLOW_STEPS.SHIPPING_SELECTION, {}, { pushHistory: true });
      return;

    case FLOW_STEPS.PAYMENT_METHOD:
      if (lower.includes("smart financing") || lower.includes("bell smart financing") || lower.includes("financing")) {
        choosePaymentMethod("smart_financing");
        return;
      }
      if ((lower.includes("existing") || lower.includes("saved")) && !getEligibilityProfile(state.context)?.savedCardLast4) {
        postMessage("bot", "No saved payment method is available for this profile. Please choose Visa, MasterCard, or Amex.");
        return;
      }
      if (lower.includes("visa")) {
        choosePaymentMethod("visa");
        return;
      }
      if (lower.includes("master")) {
        choosePaymentMethod("mastercard");
        return;
      }
      if (lower.includes("amex") || lower.includes("american express")) {
        choosePaymentMethod("amex");
        return;
      }
      if (lower.includes("existing") || lower.includes("saved")) {
        choosePaymentMethod("existing");
        return;
      }
      postMessage("bot", "Please select Visa, MasterCard, Amex, Existing Payment, or Bell Smart Financing.");
      return;

    case FLOW_STEPS.PAYMENT_FINANCING_TERM:
      if (lower.includes("full") || lower.includes("upfront")) {
        applyContextPatch({
          payment: {
            method: "device_upfront",
            expectedLast4: null,
            last4Confirmed: true,
            cvvValidated: true,
            verified: true,
            token: `upfront_${Date.now()}`
          },
          financing: {
            selected: false,
            planType: "full_upfront",
            termMonths: null,
            deferredRatio: 0,
            upfrontPayment: state.context.financing.approvedAmount,
            approvalStatus: "approved",
            financedBase: 0,
            deferredAmount: 0,
            monthlyPayment: 0,
            decisionId: `FIN-UPFRONT-${Date.now()}`
          }
        });
        logClient("info", "financing_selected", { planType: "full_upfront", viaChatInput: true });
        transitionTo(FLOW_STEPS.SHIPPING_SELECTION, {}, { pushHistory: true });
        return;
      }
      if (lower.includes("24") || lower.includes("smartpay")) {
        applyContextPatch({
          financing: {
            termMonths: 24,
            planType: lower.includes("deferred") ? "smartpay_deferred" : "smartpay_standard",
            deferredRatio: lower.includes("deferred") ? 0.35 : 0,
            approvalStatus: "pending"
          }
        });
        logClient("info", "financing_term_selected", { termMonths: 24, viaChatInput: true });
        transitionTo(FLOW_STEPS.PAYMENT_FINANCING_UPFRONT, {}, { pushHistory: true });
        return;
      }
      if (lower.includes("36")) {
        applyContextPatch({
          financing: {
            termMonths: 36,
            planType: lower.includes("deferred") ? "smartpay_deferred" : "smartpay_standard",
            deferredRatio: lower.includes("deferred") ? 0.35 : 0,
            approvalStatus: "pending"
          }
        });
        logClient("info", "financing_term_selected", { termMonths: 36, viaChatInput: true });
        transitionTo(FLOW_STEPS.PAYMENT_FINANCING_UPFRONT, {}, { pushHistory: true });
        return;
      }
      postMessage("bot", "Please choose SmartPay 24 months, SmartPay 36 months, SmartPay with deferred balance, or pay full device upfront.");
      return;

    case FLOW_STEPS.PAYMENT_FINANCING_UPFRONT: {
      const upfront = Number(trimmed.replace(/[^0-9.]/g, ""));
      if (Number.isNaN(upfront)) {
        postMessage("bot", "Please enter a valid upfront amount.");
        return;
      }
      if (upfront < 0 || upfront > state.context.financing.approvedAmount) {
        postMessage("bot", `Upfront amount must be between ${currency(0)} and ${currency(state.context.financing.approvedAmount)}.`);
        return;
      }
      applyContextPatch({ financing: { upfrontPayment: Number(upfront.toFixed(2)) } });
      transitionTo(FLOW_STEPS.PAYMENT_FINANCING_APPROVAL, {}, { pushHistory: true });
      return;
    }

    case FLOW_STEPS.PAYMENT_FINANCING_CONFIRM:
      if (lower.includes("confirm")) {
        applyContextPatch({
          payment: {
            method: "smart_financing",
            expectedLast4: null,
            last4Confirmed: true,
            cvvValidated: true,
            verified: true,
            token: `fin_${Date.now()}`
          },
          financing: {
            selected: true
          }
        });
        logClient("info", "financing_confirmed", {
          decisionId: state.context.financing.decisionId,
          viaChatInput: true
        });
        transitionTo(FLOW_STEPS.SHIPPING_SELECTION, {}, { pushHistory: true });
        return;
      }
      if (lower.includes("another") || lower.includes("card") || lower.includes("payment")) {
        logClient("info", "financing_fallback_to_card", { reason: "user_changed_method", viaChatInput: true });
        transitionTo(FLOW_STEPS.PAYMENT_METHOD, {}, { pushHistory: true });
        return;
      }
      postMessage("bot", "Please reply with 'confirm financing' or 'choose another payment method'.");
      return;

    case FLOW_STEPS.PAYMENT_CONFIRM_LAST4:
      if (lower.includes("yes") || lower.includes("confirm")) {
        applyContextPatch({ payment: { last4Confirmed: true } });
        logClient("info", "payment_confirmed", { method: state.context.payment.method, viaChatInput: true });
        transitionTo(FLOW_STEPS.PAYMENT_CVV, {}, { pushHistory: true });
        return;
      }
      if (lower.includes("no") || lower.includes("another")) {
        transitionTo(FLOW_STEPS.PAYMENT_METHOD, {}, { pushHistory: true });
        return;
      }
      postMessage("bot", "Please reply 'Yes, confirm' or 'No, choose another method'.");
      return;

    case FLOW_STEPS.SHIPPING_SELECTION:
      if (lower.includes("prefilled")) {
        const address = getEligibilityProfile(state.context)?.prefilledAddress || "100 Default St, Toronto, ON";
        applyContextPatch({ shipping: { mode: "prefilled", address } });
        logClient("info", "shipping_prefilled_selected", { address, viaChatInput: true });
        transitionTo(FLOW_STEPS.ORDER_REVIEW, {}, { pushHistory: true });
        return;
      }
      if (lower.includes("new")) {
        transitionTo(FLOW_STEPS.SHIPPING_MANUAL_ENTRY, {}, { pushHistory: true });
        return;
      }
      if (lower.includes("lookup")) {
        transitionTo(FLOW_STEPS.SHIPPING_LOOKUP, {}, { pushHistory: true });
        return;
      }
      postMessage("bot", "Please choose prefilled address, enter new address, or lookup address.");
      return;

    case FLOW_STEPS.SHIPPING_MANUAL_ENTRY:
      if (trimmed.length < 10) {
        postMessage("bot", "Please provide a complete address.");
        return;
      }
      applyContextPatch({ shipping: { mode: "manual", address: trimmed } });
      logClient("info", "shipping_manual_entered", { address: trimmed });
      transitionTo(FLOW_STEPS.ORDER_REVIEW, {}, { pushHistory: true });
      return;

    case FLOW_STEPS.SHIPPING_LOOKUP:
      if (lower === "enter address manually" || lower === "manual") {
        transitionTo(FLOW_STEPS.SHIPPING_MANUAL_ENTRY, {}, { pushHistory: true });
        return;
      }
      try {
        logClient("info", "shipping_lookup_requested", { query: trimmed, areaCode: state.context.areaCode });
        const payload = await lookupAddresses(trimmed);
        const suggestions = payload.suggestions || [];
        applyContextPatch({ shipping: { lookupQuery: trimmed, suggestions } });
        if (suggestions.length === 0) {
          postMessage("bot", "No suggestions found. Type your full address now.");
          transitionTo(FLOW_STEPS.SHIPPING_MANUAL_ENTRY, {}, { pushHistory: true });
          return;
        }
        postMessage("bot", "Select one suggested address or choose manual entry.");
        const suggestionLabels = suggestions.map((s) => `${s.line1}, ${s.city}`);
        showChoiceButtons([...suggestionLabels, "Enter address manually"], (choice) => {
          postMessage("user", choice);
          if (choice === "Enter address manually") {
            transitionTo(FLOW_STEPS.SHIPPING_MANUAL_ENTRY, {}, { pushHistory: true });
            return;
          }

          const selected = suggestions.find((s) => `${s.line1}, ${s.city}` === choice);
          if (!selected) {
            postMessage("bot", "Please select a valid address suggestion.");
            return;
          }

          const address = `${selected.line1}, ${selected.city}, ${selected.province} ${selected.postalCode}`;
          applyContextPatch({ shipping: { mode: "lookup", address } });
          logClient("info", "shipping_lookup_selected", { address, id: selected.id });
          transitionTo(FLOW_STEPS.ORDER_REVIEW, {}, { pushHistory: true });
        });
      } catch {
        postMessage("bot", "Lookup unavailable. Enter full shipping address manually.");
        transitionTo(FLOW_STEPS.SHIPPING_MANUAL_ENTRY, {}, { pushHistory: true });
      }
      return;

    default:
      logClient("info", "flow_clarify_prompt", { step: state.flowStep, message });
      handleUnclearInput(message, "I need a quick clarification before I proceed.");
      return;
  }
}

function openChatWidget() {
  chatWidget.classList.remove("hidden");
}

function closeChatWidget() {
  chatWidget.classList.add("hidden");
  chatMenu.classList.add("hidden");
}

function startConversation({ skipConnecting = false } = {}) {
  if (state.chatStarted) return;
  state.chatStarted = true;
  if (skipConnecting) {
    transitionTo(FLOW_STEPS.AREA_CODE_ENTRY, {}, { pushHistory: false });
    return;
  }
  transitionTo(FLOW_STEPS.INIT_CONNECTING, {}, { pushHistory: false });
}

function toggleChatWidget() {
  if (chatWidget.classList.contains("hidden")) {
    openChatWidget();
    startConversation();
    return;
  }
  closeChatWidget();
}

function refreshChat() {
  resetSessionState();
  openChatWidget();
  state.chatStarted = false;
  startConversation();
  logClient("info", "session_wiped", { restart: true });
}

function endChat() {
  resetSessionState();
  closeChatWidget();
  state.chatStarted = false;
  logClient("info", "session_wiped", { closeWidget: true, restart: false });
}

function runTopLoginFlow(mode) {
  clearTimers();
  openChatWidget();
  if (!state.chatStarted) {
    startConversation({ skipConnecting: true });
  } else {
    transitionTo(FLOW_STEPS.AREA_CODE_ENTRY, {}, { pushHistory: true });
  }
  state.pendingAuthMode = mode;
  postMessage("bot", "Login selected. Enter area code to unlock offers.");
}

chatLauncher.addEventListener("click", toggleChatWidget);
openChatHeader.addEventListener("click", () => runTopLoginFlow("auto"));
openChatOffers.addEventListener("click", () => {
  openChatWidget();
  startConversation();
});
closeChat.addEventListener("click", closeChatWidget);

autoLoginBtn.addEventListener("click", () => runTopLoginFlow("auto"));
manualLoginBtn.addEventListener("click", () => runTopLoginFlow("manual"));

newCustomerBtn.addEventListener("click", () => {
  if (state.flowStep !== FLOW_STEPS.AVAILABILITY_SELECTION) {
    postMessage("bot", "Please unlock offers first with area code.");
    return;
  }
  postMessage("user", "I'm new to Bell");
  hideAvailabilityCard();
  transitionTo(
    FLOW_STEPS.NEW_ONBOARD_NAME,
    {
      customerType: "new"
    },
    { pushHistory: true }
  );
});

existingCustomerBtn.addEventListener("click", () => {
  if (state.flowStep !== FLOW_STEPS.AVAILABILITY_SELECTION) {
    postMessage("bot", "Please unlock offers first with area code.");
    return;
  }
  postMessage("user", "I'm an existing Bell customer");
  hideAvailabilityCard();
  transitionTo(
    FLOW_STEPS.EXISTING_AUTH_MODE,
    {
      customerType: "existing"
    },
    { pushHistory: true }
  );

  if (state.pendingAuthMode === "auto") {
    const user = mockUsers.find((u) => u.id === "u1001");
    if (user) {
      finalizeExistingAuthentication(user, "auto", user.phone);
    }
  }

  if (state.pendingAuthMode === "manual" && authIdentifierInput.value.trim()) {
    const user = resolveUserFromIdentifier(authIdentifierInput.value.trim());
    if (user) {
      finalizeExistingAuthentication(user, "manual", authIdentifierInput.value.trim());
    }
  }
});

validateBtn.addEventListener("click", () => {
  if (state.context.basket.length === 0) {
    postMessage("bot", "Basket is empty. Add items before checkout.");
    return;
  }
  transitionTo(FLOW_STEPS.BASKET_REVIEW, {}, { pushHistory: true });
});

tokenizeBtn.addEventListener("click", () => {
  transitionTo(FLOW_STEPS.PAYMENT_METHOD, {}, { pushHistory: true });
});

placeOrderBtn.addEventListener("click", () => {
  if (state.flowStep === FLOW_STEPS.ORDER_REVIEW) {
    confirmOrder();
    return;
  }
  postMessage("bot", "Complete shipping selection first before placing order.");
  logClient("error", "order_submission_blocked", {
    step: state.flowStep,
    hasShipping: Boolean(state.context.shipping.address),
    basketItems: state.context.basket.length
  });
});

carouselPrevBtn.addEventListener("click", () => {
  if (state.offerPageIndex === 0) return;
  state.offerPageIndex -= 1;
  renderCarouselPage();
  if (state.flowStep === FLOW_STEPS.OFFER_BROWSE) {
    postMessage("bot", `Moved to ${carouselPageLabel.textContent}.`);
  }
});

carouselNextBtn.addEventListener("click", () => {
  if (state.offerPageIndex >= CATEGORY_PAGES.length - 1) return;
  state.offerPageIndex += 1;
  renderCarouselPage();
  if (state.flowStep === FLOW_STEPS.OFFER_BROWSE) {
    postMessage("bot", `Moved to ${carouselPageLabel.textContent}.`);
  }
});

chatMenuBtn.addEventListener("click", () => {
  chatMenu.classList.toggle("hidden");
});

muteChatBtn.addEventListener("click", () => {
  chatMenu.classList.add("hidden");
  state.muted = !state.muted;
  muteChatBtn.textContent = state.muted ? "Unmute Chat" : "Mute Chat";
  postMessage("bot", state.muted ? "Chat muted." : "Chat unmuted.", { force: true });
});

refreshChatBtn.addEventListener("click", () => {
  chatMenu.classList.add("hidden");
  refreshChat();
});

endChatBtn.addEventListener("click", () => {
  chatMenu.classList.add("hidden");
  endChat();
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;
  chatInput.value = "";
  const userMessage = state.flowStep === FLOW_STEPS.PAYMENT_CVV ? "***" : message;
  postMessage("user", userMessage);
  clearAddressTypeahead();
  await handleChatInput(message);
});

chatInput.addEventListener("input", () => {
  queueAddressTypeahead(chatInput.value.trim());
});

chatInput.addEventListener("blur", () => {
  const t = setTimeout(() => clearAddressTypeahead(), 150);
  state.timers.push(t);
});

window.addEventListener("error", (event) => {
  logClient("error", "frontend_error", {
    message: event.message,
    source: event.filename,
    line: event.lineno,
    col: event.colno
  });
});

window.addEventListener("unhandledrejection", (event) => {
  logClient("error", "frontend_unhandled_rejection", {
    reason: String(event.reason || "unknown")
  });
});

function boot() {
  resetSessionState();
  closeChatWidget();
}

boot();
