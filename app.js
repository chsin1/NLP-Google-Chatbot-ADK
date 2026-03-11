const mockUsers = [
  {
    id: "u1001",
    name: "Alex Carter",
    locale: "en-CA",
    authenticated: false,
    age: 34,
    accountType: "Primary",
    creditScore: 742,
    existingPaymentToken: "tok_saved_u1001"
  },
  {
    id: "u1002",
    name: "Maya Singh",
    locale: "en-CA",
    authenticated: false,
    age: 21,
    accountType: "Secondary",
    creditScore: 608,
    existingPaymentToken: null
  },
  {
    id: "u1003",
    name: "Daniel Roy",
    locale: "fr-CA",
    authenticated: false,
    age: 17,
    accountType: "Primary",
    creditScore: 690,
    existingPaymentToken: null
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

const chatLauncher = document.getElementById("chat-launcher");
const chatWidget = document.getElementById("chat-widget");
const closeChat = document.getElementById("close-chat");
const openChatHeader = document.getElementById("open-chat-header");
const openChatOffers = document.getElementById("open-chat-offers");
const autoLoginBtn = document.getElementById("auto-login-btn");
const manualLoginBtn = document.getElementById("manual-login-btn");

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

const userSelect = document.getElementById("mock-user-select");
const sessionStatus = document.getElementById("session-status");

const carousel = document.getElementById("carousel");
const basketList = document.getElementById("basket-list");
const basketTotal = document.getElementById("basket-total");
const validateBtn = document.getElementById("validate-btn");

const tokenizeBtn = document.getElementById("tokenize-btn");
const placeOrderBtn = document.getElementById("place-order-btn");
const checkoutStatus = document.getElementById("checkout-status");
const orderSummary = document.getElementById("order-summary");

const state = {
  phase: "idle",
  chatStarted: false,
  chatEnded: false,
  muted: false,
  currentUser: null,
  customerType: null,
  areaCode: null,
  pendingLoginMethod: null,
  intent: null,
  basket: [],
  validationApproved: false,
  paymentToken: null,
  order: null
};

function currency(amount) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(amount);
}

function postMessage(role, text, { force = false } = {}) {
  if (role === "bot" && state.muted && !force) {
    return;
  }
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.textContent = text;
  chatWindow.appendChild(el);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function setStatus() {
  if (!state.currentUser || !state.currentUser.authenticated) {
    sessionStatus.textContent = "Session: not authenticated";
    return;
  }
  sessionStatus.textContent =
    `Session: authenticated as ${state.currentUser.name} (${state.currentUser.id})` +
    (state.areaCode ? ` | area code ${state.areaCode}` : "");
}

function clearQuickActions() {
  quickActions.innerHTML = "";
}

function showChoiceButtons(labels, onPick) {
  clearQuickActions();
  labels.forEach((label) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.addEventListener("click", () => onPick(label));
    quickActions.appendChild(btn);
  });
}

function hideAvailabilityCard() {
  availabilityCard.classList.add("hidden");
}

function showAvailabilityCard() {
  availabilityCard.classList.remove("hidden");
}

function showAreaCodeInput() {
  clearQuickActions();
  const wrap = document.createElement("div");
  wrap.className = "quick-input";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Enter 3-digit area code (e.g., 416)";
  input.maxLength = 3;

  const submit = document.createElement("button");
  submit.type = "button";
  submit.textContent = "Confirm";

  const submitAreaCode = () => {
    const value = input.value.trim();
    if (!/^\d{3}$/.test(value)) {
      postMessage("bot", "Please enter a valid 3-digit area code.");
      return;
    }

    state.areaCode = value;
    postMessage("user", value);
    postMessage("bot", `Thanks. Checking offers for area code ${value}.`);
    state.phase = "availability";
    showAvailabilityCard();
    clearQuickActions();
  };

  submit.addEventListener("click", submitAreaCode);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitAreaCode();
    }
  });

  wrap.appendChild(input);
  wrap.appendChild(submit);
  quickActions.appendChild(wrap);
  input.focus();
}

function resetCheckoutFlow() {
  state.validationApproved = false;
  state.paymentToken = null;
  state.order = null;
  tokenizeBtn.disabled = true;
  placeOrderBtn.disabled = true;
  checkoutStatus.textContent = "Status: waiting for eligibility approval.";
  orderSummary.textContent = "No order created yet.";
}

function renderCarousel(category) {
  const normalized = (category || "").toLowerCase();
  const filtered = offers.filter((offer) => {
    if (!normalized || normalized === "bundle") {
      return true;
    }
    return offer.category === normalized;
  });

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
    addBtn.addEventListener("click", () => addToBasket(offer.id));
    card.appendChild(addBtn);
    carousel.appendChild(card);
  });
}

function addToBasket(offerId) {
  const offer = offers.find((x) => x.id === offerId);
  if (!offer) return;
  state.basket.push(offer);
  resetCheckoutFlow();
  renderBasket();
  postMessage("bot", `Added ${offer.name} to your basket.`);
}

function renderBasket() {
  basketList.innerHTML = "";
  state.basket.forEach((item, idx) => {
    const li = document.createElement("li");
    li.className = "basket-item";
    li.innerHTML = `<span>${idx + 1}. ${item.name}</span><span>${currency(item.monthlyPrice)}</span>`;
    basketList.appendChild(li);
  });

  const total = state.basket.reduce((sum, item) => sum + item.monthlyPrice, 0);
  basketTotal.textContent = `Total: ${currency(total)}/month`;
  validateBtn.disabled = state.basket.length === 0 || !state.currentUser?.authenticated;
  if (state.basket.length === 0) {
    resetCheckoutFlow();
  }
}

function generateToken(userId) {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `tok_${userId}_${suffix}`;
}

function generateOrderId() {
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 12);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ORD-${timestamp}-${suffix}`;
}

async function detectIntentWithLLM(message) {
  try {
    const response = await fetch("/api/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });
    if (!response.ok) {
      throw new Error("intent API error");
    }
    const payload = await response.json();
    return payload.intent;
  } catch {
    const text = message.toLowerCase();
    if (text.includes("internet") || text.includes("fibe") || text.includes("home")) return "home internet";
    if (text.includes("landline") || text.includes("home phone") || text.includes("phone line")) return "landline";
    if (text.includes("bundle")) return "bundle";
    if (text.includes("agent") || text.includes("human")) return "human_handoff";
    return "mobility";
  }
}

function runEligibility() {
  const user = state.currentUser;
  if (!user) {
    postMessage("bot", "Please authenticate first.");
    return;
  }

  const failures = [];
  for (const item of state.basket) {
    if (user.creditScore < item.minCreditScore) failures.push(`${item.name}: requires credit score ${item.minCreditScore}+`);
    if (user.age < item.minAge) failures.push(`${item.name}: customer must be at least ${item.minAge}`);
    if (item.requiresPrimaryHolder && user.accountType !== "Primary") failures.push(`${item.name}: primary account holder required`);
  }

  if (failures.length > 0) {
    state.validationApproved = false;
    state.paymentToken = null;
    tokenizeBtn.disabled = true;
    placeOrderBtn.disabled = true;
    checkoutStatus.textContent = "Status: eligibility failed. Update basket or hand off.";
    postMessage(
      "bot",
      `Validation result: I found eligibility constraints. ${failures.join("; ")}. I can suggest alternatives or hand off to a human agent.`
    );
    return;
  }

  state.validationApproved = true;
  tokenizeBtn.disabled = false;
  placeOrderBtn.disabled = true;
  checkoutStatus.textContent = "Status: eligible. Tokenization required before order placement.";
  orderSummary.textContent = `Eligible basket with ${state.basket.length} item(s). Ready for tokenization.`;
  postMessage(
    "bot",
    "Validation result: approved. Basket is eligible based on mock age/account/credit checks. Click Tokenize Payment, then Place Order & Confirm."
  );
}

function tokenizeCheckout() {
  if (!state.currentUser?.authenticated) {
    postMessage("bot", "Please authenticate first.");
    return;
  }
  if (!state.validationApproved) {
    postMessage("bot", "Please run eligibility checks before tokenization.");
    return;
  }

  if (state.currentUser.existingPaymentToken) {
    state.paymentToken = state.currentUser.existingPaymentToken;
    checkoutStatus.textContent = "Status: reused existing tokenized payment method.";
    postMessage("bot", `Tokenization complete using saved token (${state.paymentToken}).`);
  } else {
    state.paymentToken = generateToken(state.currentUser.id);
    checkoutStatus.textContent = "Status: new payment token generated.";
    postMessage("bot", `Tokenization complete. Generated token (${state.paymentToken}).`);
  }

  orderSummary.textContent = `Payment token ready. Basket total ${basketTotal.textContent.replace("Total: ", "")}.`;
  placeOrderBtn.disabled = false;
}

function placeOrderAndConfirm() {
  if (!state.currentUser?.authenticated) {
    postMessage("bot", "Please authenticate first.");
    return;
  }
  if (!state.validationApproved || !state.paymentToken) {
    postMessage("bot", "Please complete eligibility and tokenization before placing the order.");
    return;
  }
  if (state.basket.length === 0) {
    postMessage("bot", "Basket is empty.");
    return;
  }

  const total = state.basket.reduce((sum, item) => sum + item.monthlyPrice, 0);
  const orderId = generateOrderId();
  const confirmationCode = `CNF-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  state.order = { orderId, confirmationCode, total };

  state.basket = [];
  state.validationApproved = false;
  state.paymentToken = null;
  renderBasket();
  tokenizeBtn.disabled = true;
  placeOrderBtn.disabled = true;
  checkoutStatus.textContent = "Status: order captured and confirmed.";
  orderSummary.textContent =
    `Order ${orderId} confirmed (${confirmationCode}). Monthly total ${currency(total)}. ` +
    "Tokenization and order capture completed.";
  postMessage(
    "bot",
    `Order confirmed. Order ID ${orderId}, confirmation ${confirmationCode}. I have captured this order in session memory and can provide next-step fulfillment details.`
  );
}

function authenticateUser(user) {
  user.authenticated = true;
  state.currentUser = user;
  state.phase = "qualified";
  setStatus();
  postMessage(
    "bot",
    `Authentication successful for ${user.name}. What do you want today: mobility, home internet, landline, or a bundle?`
  );
}

function ensureAreaCodeBeforeAuth(method) {
  if (!state.areaCode) {
    state.pendingLoginMethod = method;
    postMessage("bot", "Before login, please enter your area code.");
    showAreaCodeInput();
    return false;
  }
  return true;
}

function autoLogin() {
  openChatWidget();
  if (!state.chatStarted) {
    startConversation();
  }
  if (!ensureAreaCodeBeforeAuth("auto")) {
    return;
  }
  const selected = mockUsers.find((u) => u.id === "u1001");
  authenticateUser(selected);
}

function manualLogin() {
  openChatWidget();
  if (!state.chatStarted) {
    startConversation();
  }
  if (!ensureAreaCodeBeforeAuth("manual")) {
    return;
  }
  const selected = mockUsers.find((u) => u.id === userSelect.value);
  if (!selected) {
    postMessage("bot", "Please select a valid profile in Manual sign-in.");
    return;
  }
  authenticateUser(selected);
}

function startConversation() {
  if (state.chatStarted) return;
  state.chatStarted = true;
  state.chatEnded = false;
  hideAvailabilityCard();
  clearQuickActions();
  chatInput.disabled = false;

  window.setTimeout(() => {
    postMessage("bot", "We are connecting you, please hold.");
    window.setTimeout(() => {
      postMessage("bot", "Welcome. I'm Bell's virtual assistant. I use AI to offer you assistance, quickly.");
      postMessage("bot", "Are you a current Bell customer?");
      showChoiceButtons(["Yes", "No"], (answer) => {
        postMessage("user", answer);
        if (answer === "Yes") {
          state.customerType = "existing";
          postMessage("bot", "Great. Please enter your area code, then continue to authentication.");
          showAreaCodeInput();
          return;
        }
        state.customerType = "new";
        postMessage("bot", "No problem. Please enter your area code and I will guide you through new sign-up.");
        showAreaCodeInput();
      });
    }, 800);
  }, 500);
}

function openChatWidget() {
  chatWidget.classList.remove("hidden");
}

function closeChatWidget() {
  chatWidget.classList.add("hidden");
  chatMenu.classList.add("hidden");
}

function toggleChatWidget() {
  if (chatWidget.classList.contains("hidden")) {
    openChatWidget();
    if (!state.chatStarted || state.chatEnded) {
      startConversation();
    }
    return;
  }
  closeChatWidget();
}

function clearSessionAuth() {
  mockUsers.forEach((u) => {
    u.authenticated = false;
  });
}

function resetConversationState() {
  state.phase = "idle";
  state.chatStarted = false;
  state.chatEnded = false;
  state.currentUser = null;
  state.customerType = null;
  state.areaCode = null;
  state.pendingLoginMethod = null;
  state.intent = null;
  clearSessionAuth();
  setStatus();
}

function refreshChat() {
  chatWindow.innerHTML = "";
  clearQuickActions();
  hideAvailabilityCard();
  resetConversationState();
  state.basket = [];
  renderBasket();
  resetCheckoutFlow();
  renderCarousel();
  startConversation();
}

function endChat() {
  state.chatEnded = true;
  state.chatStarted = false;
  chatInput.disabled = true;
  clearQuickActions();
  hideAvailabilityCard();
  postMessage("bot", "Chat ended. Click the chat button to start again.", { force: true });
  window.setTimeout(() => {
    closeChatWidget();
  }, 500);
}

function toggleMute() {
  state.muted = !state.muted;
  muteChatBtn.textContent = state.muted ? "Unmute Chat" : "Mute Chat";
  postMessage("bot", state.muted ? "Chat muted." : "Chat unmuted.", { force: true });
}

function initAuthUsers() {
  userSelect.innerHTML = "";
  mockUsers.forEach((u) => {
    const option = document.createElement("option");
    option.value = u.id;
    option.textContent = `${u.name} (${u.id}) - credit ${u.creditScore}`;
    userSelect.appendChild(option);
  });
}

chatLauncher.addEventListener("click", toggleChatWidget);
openChatHeader.addEventListener("click", () => {
  openChatWidget();
  if (!state.chatStarted || state.chatEnded) {
    startConversation();
  }
});
openChatOffers.addEventListener("click", () => {
  openChatWidget();
  if (!state.chatStarted || state.chatEnded) {
    startConversation();
  }
});
closeChat.addEventListener("click", closeChatWidget);
autoLoginBtn.addEventListener("click", autoLogin);
manualLoginBtn.addEventListener("click", manualLogin);

chatMenuBtn.addEventListener("click", () => {
  chatMenu.classList.toggle("hidden");
});
muteChatBtn.addEventListener("click", () => {
  chatMenu.classList.add("hidden");
  toggleMute();
});
refreshChatBtn.addEventListener("click", () => {
  chatMenu.classList.add("hidden");
  refreshChat();
});
endChatBtn.addEventListener("click", () => {
  chatMenu.classList.add("hidden");
  endChat();
});

newCustomerBtn.addEventListener("click", () => {
  state.customerType = "new";
  postMessage("user", "I'm new to Bell");
  postMessage("bot", "Great, let's sign you up as a new customer. I can now show starter plans or transfer you to the signup flow.");
});

existingCustomerBtn.addEventListener("click", () => {
  state.customerType = "existing";
  postMessage("user", "I'm an existing Bell customer");
  postMessage("bot", "Perfect. Please authenticate now using Automatic sign-in or Manual sign-in.");

  if (state.pendingLoginMethod === "auto") {
    state.pendingLoginMethod = null;
    autoLogin();
    return;
  }
  if (state.pendingLoginMethod === "manual") {
    state.pendingLoginMethod = null;
    manualLogin();
  }
});

validateBtn.addEventListener("click", runEligibility);
tokenizeBtn.addEventListener("click", tokenizeCheckout);
placeOrderBtn.addEventListener("click", placeOrderAndConfirm);

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;

  postMessage("user", message);
  chatInput.value = "";

  if (!state.currentUser?.authenticated) {
    postMessage("bot", "Please complete area code and authentication first.");
    return;
  }

  const intent = await detectIntentWithLLM(message);
  state.intent = intent;

  if (intent === "human_handoff") {
    postMessage("bot", "I can transfer this to a human specialist now.");
    return;
  }

  renderCarousel(intent);
  postMessage(
    "bot",
    `I detected intent: ${intent}. Here are matching Bell-style offers for area code ${state.areaCode}. Add any combination to your basket.`
  );
});

function boot() {
  initAuthUsers();
  setStatus();
  resetCheckoutFlow();
  renderCarousel();
  renderBasket();
  hideAvailabilityCard();
}

boot();
