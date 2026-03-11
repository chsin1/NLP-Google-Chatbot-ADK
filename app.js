const FLOW_STEPS = {
  INIT_CONNECTING: "INIT_CONNECTING",
  AREA_CODE_ENTRY: "AREA_CODE_ENTRY",
  AVAILABILITY_SELECTION: "AVAILABILITY_SELECTION",
  EXISTING_AUTH_MODE: "EXISTING_AUTH_MODE",
  EXISTING_AUTH_IDENTIFIER: "EXISTING_AUTH_IDENTIFIER",
  NEW_ONBOARD_NAME: "NEW_ONBOARD_NAME",
  NEW_ONBOARD_EMAIL: "NEW_ONBOARD_EMAIL",
  NEW_ONBOARD_PHONE: "NEW_ONBOARD_PHONE",
  INTENT_DISCOVERY: "INTENT_DISCOVERY",
  OFFER_BROWSE: "OFFER_BROWSE",
  BASKET_REVIEW: "BASKET_REVIEW",
  ELIGIBILITY_CHECK: "ELIGIBILITY_CHECK",
  PAYMENT_METHOD: "PAYMENT_METHOD",
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
    name: "Bell 5G+ Essential 100",
    description: "100 GB high-speed data, nationwide 5G+ access.",
    monthlyPrice: 75,
    minCreditScore: 620,
    minAge: 18,
    requiresPrimaryHolder: false
  },
  {
    id: "mob-002",
    category: "mobility",
    name: "Bell Ultimate 175 + Device Financing",
    description: "Premium data + flagship phone financing option.",
    monthlyPrice: 110,
    minCreditScore: 700,
    minAge: 18,
    requiresPrimaryHolder: true
  },
  {
    id: "internet-001",
    category: "home internet",
    name: "Fibe 1.5 Gigabit",
    description: "Up to 1.5 Gbps speeds for heavy home usage.",
    monthlyPrice: 95,
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
  pendingAuthMode: null,
  context: {
    areaCode: null,
    customerType: null,
    authUser: null,
    intent: null,
    basket: [],
    payment: {
      method: null,
      expectedLast4: null,
      last4Confirmed: false,
      cvvValidated: false,
      verified: false,
      token: null
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
    }
  }
};

function currency(amount) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(amount);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clearTimers() {
  state.timers.forEach((timerId) => clearTimeout(timerId));
  state.timers = [];
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
    await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level, event, details })
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
  if (!state.context.authUser) {
    sessionStatus.textContent = "Session: not authenticated";
    showLoginSections();
    return;
  }
  sessionStatus.textContent =
    `Session: authenticated as ${state.context.authUser.name} (${state.context.authUser.id})` +
    (state.context.areaCode ? ` | area code ${state.context.areaCode}` : "");
  hideLoginSections();
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
    areaCode: null,
    customerType: null,
    authUser: null,
    intent: null,
    basket: [],
    payment: {
      method: null,
      expectedLast4: null,
      last4Confirmed: false,
      cvvValidated: false,
      verified: false,
      token: null
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
    }
  };
  mockUsers.forEach((u) => {
    u.authenticated = false;
  });
  authIdentifierInput.value = "";
  chatWindow.innerHTML = "";
  clearQuickActions();
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
    case FLOW_STEPS.OFFER_BROWSE:
      return Boolean(ctx.authUser);
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
  if (patch.authUser !== undefined) next.authUser = patch.authUser;
  if (patch.intent !== undefined) next.intent = patch.intent;
  if (patch.basket !== undefined) next.basket = patch.basket;
  if (patch.payment) next.payment = { ...next.payment, ...patch.payment };
  if (patch.shipping) next.shipping = { ...next.shipping, ...patch.shipping };
  if (patch.newOnboarding) next.newOnboarding = { ...next.newOnboarding, ...patch.newOnboarding };

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
  const filtered = offers.filter((offer) => offer.category === category);

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
  validateBtn.disabled = !state.context.authUser || state.context.basket.length === 0;
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

function getExpectedLast4(method, user) {
  if (method === "visa") return "2781";
  if (method === "mastercard") return "7891";
  if (method === "existing") return user?.savedCardLast4 || "2781";
  return "0000";
}

function choosePaymentMethod(method) {
  const user = state.context.authUser;
  if (!user) {
    postMessage("bot", "Please authenticate first.");
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
    }
  });

  logClient("info", "payment_method_selected", { method, expectedLast4 });
  transitionTo(FLOW_STEPS.PAYMENT_CONFIRM_LAST4, {}, { pushHistory: true });
}

function runEligibilityCheck() {
  const user = state.context.authUser;
  if (!user) {
    postMessage("bot", "Please authenticate first.");
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

function confirmOrder() {
  const total = state.context.basket.reduce((sum, item) => sum + item.monthlyPrice, 0);
  const orderId = `ORD-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 12)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const confirmationCode = `CNF-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  orderSummary.textContent =
    `Order ${orderId} confirmed (${confirmationCode}). Monthly total ${currency(total)}. Shipping to ${state.context.shipping.address}.`;
  checkoutStatus.textContent = "Status: order captured and confirmed.";
  postMessage("bot", `Order confirmed. Order ID ${orderId}, confirmation ${confirmationCode}.`);

  logClient("info", "order_submission_success", {
    orderId,
    confirmationCode,
    total,
    shippingMode: state.context.shipping.mode
  });

  applyContextPatch({ basket: [] });
  renderBasket();
  transitionTo(FLOW_STEPS.ORDER_CONFIRMED, {}, { pushHistory: true });
}

function renderStep(step) {
  clearQuickActions();
  renderBasket();
  renderCarouselPage();
  setStatus();
  resetChatInputHint();

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
          user.authenticated = true;
          transitionTo(FLOW_STEPS.INTENT_DISCOVERY, { authUser: user }, { pushHistory: true });
          logClient("info", "auth_success", { mode: "auto", userId: user.id });
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

    case FLOW_STEPS.INTENT_DISCOVERY:
      hideAvailabilityCard();
      if (state.context.authUser) {
        postMessage("bot", `Authentication successful for ${state.context.authUser.name}.`);
      }
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
        transitionTo(FLOW_STEPS.OFFER_BROWSE, { intent }, { pushHistory: true });
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
      postMessage("bot", "Select payment method: Visa, MasterCard, or Existing Payment.");
      showChoiceButtons(["Visa", "MasterCard", "Use Existing Payment"], (choice) => {
        postMessage("user", choice);
        if (choice === "Visa") {
          choosePaymentMethod("visa");
          return;
        }
        if (choice === "MasterCard") {
          choosePaymentMethod("mastercard");
          return;
        }
        choosePaymentMethod("existing");
      });
      break;

    case FLOW_STEPS.PAYMENT_CONFIRM_LAST4:
      postMessage(
        "bot",
        `Please confirm you are using your ${state.context.payment.method} ending in ${state.context.payment.expectedLast4}.`
      );
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
      postMessage("bot", "Enter your 3-digit CVV to finalize payment authorization.");
      setChatInputHint("3-digit CVV");
      break;

    case FLOW_STEPS.SHIPPING_SELECTION:
      postMessage("bot", "Select shipping option: prefilled address, new address, or lookup address.");
      showChoiceButtons(["Use prefilled address", "Enter new address", "Lookup address"], (choice) => {
        postMessage("user", choice);
        if (choice === "Use prefilled address") {
          const address = state.context.authUser?.prefilledAddress || "100 Default St, Toronto, ON";
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
      break;

    case FLOW_STEPS.ORDER_REVIEW: {
      const total = state.context.basket.reduce((sum, item) => sum + item.monthlyPrice, 0);
      postMessage(
        "bot",
        `Order review: ${state.context.basket.length} item(s), ${currency(total)}/month, shipping to ${state.context.shipping.address}.`
      );
      checkoutStatus.textContent = "Status: ready to place order.";
      orderSummary.textContent =
        `Payment ${state.context.payment.method} ending ${state.context.payment.expectedLast4}. Shipping: ${state.context.shipping.address}.`;
      placeOrderBtn.disabled = false;
      logClient("info", "order_submission_attempt", { basketItems: state.context.basket.length, total });
      break;
    }

    case FLOW_STEPS.ORDER_CONFIRMED:
      postMessage("bot", "Order is complete. You can continue shopping or start a fresh session.");
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
      user.authenticated = true;
      transitionTo(FLOW_STEPS.INTENT_DISCOVERY, { authUser: user }, { pushHistory: true });
      logClient("info", "auth_success", { mode: "manual", userId: user.id, viaChatInput: true });
      return;
    }

    case FLOW_STEPS.EXISTING_AUTH_MODE:
      if (lower.includes("continue automatically") || lower === "auto" || lower === "yes") {
        const user = mockUsers.find((u) => u.id === "u1001");
        if (!user) return;
        user.authenticated = true;
        transitionTo(FLOW_STEPS.INTENT_DISCOVERY, { authUser: user }, { pushHistory: true });
        logClient("info", "auth_success", { mode: "auto", userId: user.id, viaChatInput: true });
        return;
      }
      if (lower.includes("phone") || lower.includes("email") || lower.includes("authenticate")) {
        transitionTo(FLOW_STEPS.EXISTING_AUTH_IDENTIFIER, {}, { pushHistory: true });
        return;
      }
      postMessage("bot", "Choose 'Continue automatically' or 'Authenticate with phone/email'.");
      return;

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
        FLOW_STEPS.INTENT_DISCOVERY,
        {
          newOnboarding: { phone: trimmed, leadId },
          customerType: "new"
        },
        { pushHistory: true }
      );
      postMessage("bot", `New client profile created (ID: ${leadId}). Continuing to plan discovery.`);
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
      transitionTo(FLOW_STEPS.OFFER_BROWSE, { intent }, { pushHistory: true });
      return;
    }

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
      logClient("info", "flow_clarify_prompt", { step: state.flowStep, message });
      return;

    case FLOW_STEPS.ORDER_REVIEW:
      if (lower.includes("place order") || lower.includes("confirm")) {
        confirmOrder();
        return;
      }
      postMessage("bot", "Please say 'place order' to complete, or 'go back' to revise payment/shipping.");
      return;

    case FLOW_STEPS.PAYMENT_CVV:
      if (!/^\d{3}$/.test(trimmed)) {
        postMessage("bot", "Invalid CVV. Please provide exactly 3 digits.");
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
      transitionTo(FLOW_STEPS.SHIPPING_SELECTION, {}, { pushHistory: true });
      return;

    case FLOW_STEPS.PAYMENT_METHOD:
      if (lower.includes("visa")) {
        choosePaymentMethod("visa");
        return;
      }
      if (lower.includes("master")) {
        choosePaymentMethod("mastercard");
        return;
      }
      if (lower.includes("existing") || lower.includes("saved")) {
        choosePaymentMethod("existing");
        return;
      }
      postMessage("bot", "Please select Visa, MasterCard, or Use Existing Payment.");
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
        const address = state.context.authUser?.prefilledAddress || "100 Default St, Toronto, ON";
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
      postMessage(
        "bot",
        "I need a quick clarification. Do you want to continue this step, go back, re-login, or start fresh?"
      );
      logClient("info", "flow_clarify_prompt", { step: state.flowStep, message });
      showChoiceButtons(["Continue", "Go back", "Re-login", "Start fresh"], (choice) => {
        if (choice === "Continue") {
          renderStep(state.flowStep);
          return;
        }
        if (choice === "Go back") {
          goBack();
          return;
        }
        if (choice === "Re-login") {
          transitionTo(FLOW_STEPS.EXISTING_AUTH_MODE, { customerType: "existing" }, { pushHistory: true });
          return;
        }
        refreshChat();
      });
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
      user.authenticated = true;
      transitionTo(FLOW_STEPS.INTENT_DISCOVERY, { authUser: user }, { pushHistory: true });
      logClient("info", "auth_success", { mode: "auto", userId: user.id });
    }
  }

  if (state.pendingAuthMode === "manual" && authIdentifierInput.value.trim()) {
    const user = resolveUserFromIdentifier(authIdentifierInput.value.trim());
    if (user) {
      user.authenticated = true;
      transitionTo(FLOW_STEPS.INTENT_DISCOVERY, { authUser: user }, { pushHistory: true });
      logClient("info", "auth_success", { mode: "manual", userId: user.id, viaLanding: true });
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
  await handleChatInput(message);
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
