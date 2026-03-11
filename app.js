const mockUsers = [
  {
    id: "u1001",
    name: "Alex Carter",
    locale: "en-CA",
    consentGiven: false,
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
    consentGiven: false,
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
    consentGiven: false,
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

const chatWindow = document.getElementById("chat-window");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const sessionStatus = document.getElementById("session-status");
const userSelect = document.getElementById("mock-user-select");
const authBtn = document.getElementById("auth-btn");
const carousel = document.getElementById("carousel");
const basketList = document.getElementById("basket-list");
const basketTotal = document.getElementById("basket-total");
const validateBtn = document.getElementById("validate-btn");
const tokenizeBtn = document.getElementById("tokenize-btn");
const placeOrderBtn = document.getElementById("place-order-btn");
const checkoutStatus = document.getElementById("checkout-status");
const orderSummary = document.getElementById("order-summary");

const state = {
  phase: "consent",
  currentUser: null,
  intent: null,
  basket: [],
  validationApproved: false,
  paymentToken: null,
  order: null
};

function currency(amount) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(amount);
}

function postMessage(role, text) {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.textContent = text;
  chatWindow.appendChild(el);
  chatWindow.scrollTop = chatWindow.scrollHeight;
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

function resetCheckoutFlow() {
  state.validationApproved = false;
  state.paymentToken = null;
  state.order = null;
  tokenizeBtn.disabled = true;
  placeOrderBtn.disabled = true;
  checkoutStatus.textContent = "Status: waiting for eligibility approval.";
  orderSummary.textContent = "No order created yet.";
}

function setStatus() {
  if (!state.currentUser || !state.currentUser.authenticated) {
    sessionStatus.textContent = "Session: not authenticated";
    return;
  }
  sessionStatus.textContent = `Session: authenticated as ${state.currentUser.name} (${state.currentUser.id})`;
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
  if (!offer) {
    return;
  }
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

async function detectIntentWithLLM(message) {
  try {
    const response = await fetch("/api/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });
    if (!response.ok) {
      throw new Error(`intent API failed (${response.status})`);
    }
    const payload = await response.json();
    return payload.intent;
  } catch {
    const text = message.toLowerCase();
    if (text.includes("internet") || text.includes("fibe") || text.includes("home")) {
      return "home internet";
    }
    if (text.includes("landline") || text.includes("phone line") || text.includes("home phone")) {
      return "landline";
    }
    if (text.includes("bundle")) {
      return "bundle";
    }
    if (text.includes("agent") || text.includes("human")) {
      return "human_handoff";
    }
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
    if (user.creditScore < item.minCreditScore) {
      failures.push(`${item.name}: requires credit score ${item.minCreditScore}+`);
    }
    if (user.age < item.minAge) {
      failures.push(`${item.name}: customer must be at least ${item.minAge}`);
    }
    if (item.requiresPrimaryHolder && user.accountType !== "Primary") {
      failures.push(`${item.name}: primary account holder required`);
    }
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
    "Validation result: approved. Basket is eligible based on mock age/account/credit checks. Please click Tokenize Payment, then Place Order & Confirm."
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
  state.order = {
    orderId,
    confirmationCode,
    total
  };

  state.basket = [];
  state.validationApproved = false;
  state.paymentToken = null;
  renderBasket();
  tokenizeBtn.disabled = true;
  placeOrderBtn.disabled = true;
  checkoutStatus.textContent = "Status: order captured and confirmed.";
  orderSummary.textContent =
    `Order ${orderId} confirmed (${confirmationCode}). ` +
    `Monthly total ${currency(total)}. Tokenization and order capture completed.`;
  postMessage(
    "bot",
    `Order confirmed. Order ID ${orderId}, confirmation ${confirmationCode}. I have captured this order in session memory and can now provide next-step fulfillment details.`
  );
}

function handleConsent(message) {
  const text = message.toLowerCase();
  if (text.includes("yes") || text.includes("consent") || text.includes("agree")) {
    state.phase = "auth";
    userSelect.disabled = false;
    authBtn.disabled = false;
    postMessage(
      "bot",
      "Thank you. Consent recorded. Please select a mock account on the right and press Authenticate to continue."
    );
    return;
  }

  if (text.includes("no") || text.includes("decline")) {
    postMessage(
      "bot",
      "Understood. I am ending this interaction now and logging a consent decline event."
    );
    chatInput.disabled = true;
    return;
  }

  postMessage("bot", "Please reply with Yes or No so I can capture your consent clearly.");
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message) {
    return;
  }

  postMessage("user", message);
  chatInput.value = "";

  if (state.phase === "consent") {
    handleConsent(message);
    return;
  }

  if (!state.currentUser?.authenticated) {
    postMessage("bot", "Please authenticate first using the panel on the right.");
    return;
  }

  const intent = await detectIntentWithLLM(message);
  state.intent = intent;

  if (intent === "human_handoff") {
    postMessage("bot", "I can hand this over to a human specialist now. Would you like me to transfer the chat?");
    return;
  }

  renderCarousel(intent);
  postMessage(
    "bot",
    `I detected intent: ${intent}. Here are matching Bell-style offers in the carousel. You can add any combination to your basket.`
  );
});

authBtn.addEventListener("click", () => {
  const selected = mockUsers.find((u) => u.id === userSelect.value);
  if (!selected) {
    return;
  }
  selected.authenticated = true;
  state.currentUser = selected;
  state.phase = "qualified";
  setStatus();
  postMessage(
    "bot",
    `Authentication successful for ${selected.name}. What do you want today: mobility, home internet, landline, or a bundle?`
  );
});

validateBtn.addEventListener("click", runEligibility);
tokenizeBtn.addEventListener("click", tokenizeCheckout);
placeOrderBtn.addEventListener("click", placeOrderAndConfirm);

function boot() {
  initAuthUsers();
  renderCarousel();
  resetCheckoutFlow();
  renderBasket();
  setStatus();
  postMessage(
    "bot",
    "Hello, I am Bell's virtual sales assistant (non-human). Before we continue, do you consent to this chat and to basic session logging?"
  );
}

boot();
