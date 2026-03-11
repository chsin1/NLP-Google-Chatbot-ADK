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
  chatStarted: false,
  muted: false,
  currentUser: null,
  customerType: null,
  areaCode: null,
  newCustomerLead: null,
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
  if (role === "bot" && state.muted && !force) return;
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
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => onPick(label));
    quickActions.appendChild(button);
  });
}

function showInputPrompt({ placeholder, buttonLabel, initialValue = "", onSubmit }) {
  clearQuickActions();
  const wrap = document.createElement("div");
  wrap.className = "quick-input";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = placeholder;
  input.value = initialValue;

  const submit = document.createElement("button");
  submit.type = "button";
  submit.textContent = buttonLabel;

  const handleSubmit = () => {
    onSubmit(input.value.trim());
  };

  submit.addEventListener("click", handleSubmit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSubmit();
    }
  });

  wrap.appendChild(input);
  wrap.appendChild(submit);
  quickActions.appendChild(wrap);
  input.focus();
}

function showAreaCodeInput(onSuccess) {
  showInputPrompt({
    placeholder: "Enter 3-digit area code to unlock offers",
    buttonLabel: "Unlock",
    onSubmit: (value) => {
      if (!/^\d{3}$/.test(value)) {
        postMessage("bot", "Please enter a valid 3-digit area code.");
        return;
      }
      state.areaCode = value;
      postMessage("user", value);
      postMessage("bot", `Area code ${value} accepted. Offers unlocked.`);
      showAvailabilityCard();
      clearQuickActions();
      if (onSuccess) onSuccess();
    }
  });
}

function hideAvailabilityCard() {
  availabilityCard.classList.add("hidden");
}

function showAvailabilityCard() {
  availabilityCard.classList.remove("hidden");
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
    if (!normalized || normalized === "bundle") return true;
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
  if (state.basket.length === 0) resetCheckoutFlow();
}

function generateToken(userId) {
  return `tok_${userId}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateOrderId() {
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 12);
  return `ORD-${timestamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

async function detectIntentWithLLM(message) {
  try {
    const response = await fetch("/api/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });
    if (!response.ok) throw new Error("intent API error");
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
    postMessage("bot", `Validation result: ${failures.join("; ")}.`);
    return;
  }

  state.validationApproved = true;
  tokenizeBtn.disabled = false;
  placeOrderBtn.disabled = true;
  checkoutStatus.textContent = "Status: eligible. Tokenization required before order placement.";
  orderSummary.textContent = `Eligible basket with ${state.basket.length} item(s). Ready for tokenization.`;
  postMessage("bot", "Validation approved. Click Tokenize Payment, then Place Order & Confirm.");
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

  state.paymentToken = state.currentUser.existingPaymentToken || generateToken(state.currentUser.id);
  checkoutStatus.textContent = state.currentUser.existingPaymentToken
    ? "Status: reused existing tokenized payment method."
    : "Status: new payment token generated.";
  postMessage("bot", `Tokenization complete (${state.paymentToken}).`);
  orderSummary.textContent = `Payment token ready. Basket total ${basketTotal.textContent.replace("Total: ", "")}.`;
  placeOrderBtn.disabled = false;
}

function placeOrderAndConfirm() {
  if (!state.currentUser?.authenticated) {
    postMessage("bot", "Please authenticate first.");
    return;
  }
  if (!state.validationApproved || !state.paymentToken || state.basket.length === 0) {
    postMessage("bot", "Complete eligibility + tokenization and ensure basket has items.");
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
  orderSummary.textContent = `Order ${orderId} confirmed (${confirmationCode}). Monthly total ${currency(total)}.`;
  postMessage("bot", `Order confirmed. Order ID ${orderId}, confirmation ${confirmationCode}.`);
}

function authenticateUser(user) {
  user.authenticated = true;
  state.currentUser = user;
  setStatus();

  if (user.name === "Alex Carter") {
    postMessage("bot", "Authentication successful for Alex Carter. Starting workflow now.");
    postMessage("bot", "What do you want today: mobility, home internet, landline, or a bundle?");
    return;
  }

  postMessage(
    "bot",
    `${user.name} authenticated. This demo only auto-starts the full workflow for Alex Carter. I can transfer ${user.name} to guided onboarding.`
  );
}

function resolveUserFromIdentifier(raw) {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (value === alexEmail) return mockUsers.find((u) => u.id === "u1001");

  const digits = value.replace(/\D/g, "");
  const prefix = digits.slice(0, 3);
  const userId = phonePrefixToUser[prefix];
  if (!userId) return null;
  return mockUsers.find((u) => u.id === userId);
}

function requireAreaCodeForNext(nextStep) {
  if (state.areaCode) {
    nextStep();
    return;
  }
  postMessage("bot", "Enter your area code first to unlock offers and continue.");
  showAreaCodeInput(nextStep);
}

function showManualAuthenticationPrompt() {
  postMessage("bot", "Enter your phone or email to authenticate.");
  showInputPrompt({
    placeholder: "416-555-1111 or alex.test@gmail.com",
    buttonLabel: "Authenticate",
    initialValue: authIdentifierInput.value || "",
    onSubmit: (identifier) => {
      authIdentifierInput.value = identifier;
      const user = resolveUserFromIdentifier(identifier);
      if (!user) {
        postMessage(
          "bot",
          "Authentication failed. Use phone starting with 416/647/986 or alex.test@gmail.com for Alex Carter."
        );
        return;
      }
      postMessage("user", identifier);
      authenticateUser(user);
    }
  });
}

function showExistingCustomerLoginOptions() {
  postMessage("bot", "Select login method to continue.");
  showChoiceButtons(["Continue automatically", "Authenticate with phone/email"], (choice) => {
    postMessage("user", choice);
    if (choice === "Continue automatically") {
      authenticateUser(mockUsers.find((u) => u.id === "u1001"));
      return;
    }
    showManualAuthenticationPrompt();
  });
}

function autoLogin() {
  openChatWidget();
  ensureChatInitialized();
  postMessage("bot", "We are connecting you, please hold.");
  postMessage("bot", "Automatic sign-in selected. Confirm your area code to continue.");
  requireAreaCodeForNext(() => {
    authenticateUser(mockUsers.find((u) => u.id === "u1001"));
  });
}

function manualLogin() {
  openChatWidget();
  ensureChatInitialized();
  postMessage("bot", "We are connecting you, please hold.");
  postMessage("bot", "Manual sign-in selected. Confirm your area code, then authenticate.");
  requireAreaCodeForNext(() => {
    showManualAuthenticationPrompt();
  });
}

function routeNewCustomerOnboarding() {
  state.customerType = "new";
  postMessage("bot", "You are being transferred into the new customer onboarding workflow.");
  postMessage("bot", "Please enter your full name to create a new client profile.");
  showInputPrompt({
    placeholder: "Full name",
    buttonLabel: "Next",
    onSubmit: (fullName) => {
      if (!fullName) {
        postMessage("bot", "Full name is required.");
        return;
      }
      postMessage("user", fullName);
      postMessage("bot", "Now enter your email address.");
      showInputPrompt({
        placeholder: "Email address",
        buttonLabel: "Next",
        onSubmit: (email) => {
          if (!email.includes("@")) {
            postMessage("bot", "Please enter a valid email.");
            return;
          }
          postMessage("user", email);
          postMessage("bot", "Finally, enter your phone number.");
          showInputPrompt({
            placeholder: "Phone number",
            buttonLabel: "Create client",
            onSubmit: (phone) => {
              if (phone.replace(/\D/g, "").length < 10) {
                postMessage("bot", "Please enter a valid phone number.");
                return;
              }
              postMessage("user", phone);
              state.newCustomerLead = {
                id: `lead_${Date.now()}`,
                fullName,
                email,
                phone,
                areaCode: state.areaCode
              };
              postMessage(
                "bot",
                `New client created for ${fullName}. Onboarding is started and I can now guide plan selection, account setup, and activation.`
              );
              showChoiceButtons(["Start new-customer plan selection", "Talk to onboarding specialist"], (choice) => {
                postMessage("user", choice);
                if (choice === "Start new-customer plan selection") {
                  renderCarousel("home internet");
                  postMessage("bot", "Here are starter plans you can choose from.");
                  return;
                }
                postMessage("bot", "I will transfer you to an onboarding specialist.");
              });
            }
          });
        }
      });
    }
  });
}

function routeExistingCustomerAuth() {
  state.customerType = "existing";
  postMessage("bot", "Please authenticate now as an existing customer.", { force: true });
  showExistingCustomerLoginOptions();
}

function askCustomerTypeQuestion() {
  postMessage("bot", "Welcome. I'm Bell's virtual assistant. I use AI to offer you assistance, quickly.");
  postMessage("bot", "Are you a current Bell customer?");
  showChoiceButtons(["Yes", "No"], (answer) => {
    postMessage("user", answer);
    if (answer === "Yes") {
      routeExistingCustomerAuth();
      return;
    }
    routeNewCustomerOnboarding();
  });
}

function ensureChatInitialized() {
  if (state.chatStarted) return;
  state.chatStarted = true;
  chatInput.disabled = false;
  hideAvailabilityCard();
  clearQuickActions();
}

function startConversation() {
  if (state.chatStarted) return;
  ensureChatInitialized();

  window.setTimeout(() => {
    postMessage("bot", "We are connecting you, please hold.");
    window.setTimeout(() => {
      postMessage("bot", "Enter your area code to unlock offers.");
      showAreaCodeInput(() => {
        askCustomerTypeQuestion();
      });
    }, 700);
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
    if (!state.chatStarted) startConversation();
    return;
  }
  closeChatWidget();
}

function clearAuthState() {
  mockUsers.forEach((u) => {
    u.authenticated = false;
  });
}

function wipeSession({ closeWidget = false, restart = false } = {}) {
  state.chatStarted = false;
  state.currentUser = null;
  state.customerType = null;
  state.areaCode = null;
  state.newCustomerLead = null;
  state.intent = null;
  state.basket = [];
  state.muted = false;
  state.validationApproved = false;
  state.paymentToken = null;
  state.order = null;

  chatWindow.innerHTML = "";
  clearQuickActions();
  hideAvailabilityCard();
  chatInput.disabled = false;
  chatMenu.classList.add("hidden");
  muteChatBtn.textContent = "Mute Chat";

  clearAuthState();
  authIdentifierInput.value = "";

  renderCarousel();
  renderBasket();
  resetCheckoutFlow();
  setStatus();

  if (closeWidget) {
    closeChatWidget();
  }
  if (restart) {
    openChatWidget();
    startConversation();
  }
}

function refreshChat() {
  wipeSession({ restart: true });
}

function endChat() {
  wipeSession({ closeWidget: true, restart: false });
}

function toggleMute() {
  state.muted = !state.muted;
  muteChatBtn.textContent = state.muted ? "Unmute Chat" : "Mute Chat";
  postMessage("bot", state.muted ? "Chat muted." : "Chat unmuted.", { force: true });
}

chatLauncher.addEventListener("click", toggleChatWidget);
openChatHeader.addEventListener("click", () => {
  openChatWidget();
  if (!state.chatStarted) startConversation();
});
openChatOffers.addEventListener("click", () => {
  openChatWidget();
  if (!state.chatStarted) startConversation();
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
  postMessage("user", "I'm new to Bell");
  routeNewCustomerOnboarding();
});

existingCustomerBtn.addEventListener("click", () => {
  postMessage("user", "I'm an existing Bell customer");
  routeExistingCustomerAuth();
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
    postMessage("bot", "Authenticate first. If you're not a customer, I can continue onboarding.");
    return;
  }

  if (state.currentUser.name !== "Alex Carter") {
    postMessage("bot", "Only Alex Carter proceeds into the full workflow in this demo. I can keep this in onboarding mode.");
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
    `I detected intent: ${intent}. Here are matching offers for area code ${state.areaCode}. Add any combination to your basket.`
  );
});

function boot() {
  setStatus();
  resetCheckoutFlow();
  renderCarousel();
  renderBasket();
  hideAvailabilityCard();
}

boot();
