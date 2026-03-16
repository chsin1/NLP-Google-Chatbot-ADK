const PROMPT_LIBRARY = {
  GREETING_CONVERSATIONAL: {
    consultative:
      "Hi, I’m Belinda, Bell’s automated AI agent. I’m not a human representative, and I can help you compare plans quickly.",
    default: "Hi, I’m Belinda, your automated Bell assistant."
  },
  HELPDESK_ENTRY: {
    consultative:
      "Welcome to Bell. I’m Belinda, your virtual sales assistant. What would you like to shop for today: mobility, internet, landline, or a bundle?",
    default:
      "Welcome to Bell. I’m Belinda. What service are you shopping for today?"
  },
  SERVICE_SELECTION: {
    consultative:
      "Great, let’s start with the service you need most right now: internet, mobility, or landline.",
    default: "What service are you looking for?"
  },
  CUSTOMER_STATUS_SELECTION: {
    consultative:
      "Before I personalize your options, are you a new Bell client or an existing Bell client?",
    default: "Are you a new or existing Bell client?"
  },
  EXISTING_AUTH_MODE: {
    consultative:
      "Perfect. Let’s verify your account quickly so I can tailor your offers.",
    default: "Please authenticate as an existing customer."
  },
  NEW_ONBOARD_NAME: {
    consultative:
      "Great, I can set this up quickly. What is your full name?",
    default: "Please enter your full name."
  },
  INTENT_DISCOVERY: {
    consultative:
      "Great choice. I’ll ask one or two quick questions so I can match the best offer for you.",
    default: "I’ll ask a few quick questions to match your offer."
  },
  INTERNET_ADDRESS_REQUEST: {
    consultative:
      "Please share your service address and I’ll confirm availability in your area.",
    default: "Please provide your service address."
  },
  INTERNET_PRIORITY_CAPTURE: {
    consultative:
      "What matters most to you for internet right now: speed, value, or balanced performance?",
    default: "Choose your internet priority: speed, value, or performance."
  },
  INTERNET_PLAN_PITCH: {
    consultative:
      "I’ve prepared plan options based on your preference. I’ll highlight the top match and why it fits.",
    default: "Here are your recommended plans."
  },
  PLAN_CONFIRMATION: {
    consultative:
      "If this plan looks right, confirm and I’ll move you straight to account setup or checkout.",
    default: "Please confirm your selected plan."
  },
  NEW_ONBOARD_COMBINED_CAPTURE: {
    consultative:
      "To create your profile, share full name, email, and phone in one message.",
    default: "Please provide full name, email, and phone."
  },
  CHECKOUT_INTENT_PROMPT: {
    consultative:
      "You can checkout now, or add another service first to improve your bundle savings.",
    default: "Checkout now or add another service."
  },
  PAYMENT_CARD_NUMBER: {
    consultative:
      "Enter your card number in the 4 secure boxes and I’ll validate it instantly.",
    default: "Enter your card number."
  },
  PAYMENT_CARD_CVC: {
    consultative:
      "Great, now share your CVC so I can complete payment validation.",
    default: "Enter your card CVC."
  },
  PAYMENT_CARD_POSTAL: {
    consultative:
      "Please enter your Canadian billing postal code to finish card checks.",
    default: "Enter billing postal code."
  },
  SHIPPING_SELECTION: {
    consultative:
      "Choose where you want your order shipped: prefilled address, lookup, or manual entry.",
    default: "Select your shipping option."
  },
  ORDER_REVIEW: {
    consultative:
      "I’ve prepared your final order review with today’s charges and monthly total going forward.",
    default: "Review your order before placing it."
  },
  BOOKING_SLOT_SELECTION: {
    consultative:
      "Would you like to reserve an installation window now? I can offer the next available slots.",
    default: "Choose an install slot or skip booking."
  },
  REMINDER_OPT_IN: {
    consultative:
      "Would you like a browser reminder before your install window?",
    default: "Would you like a reminder?"
  },
  OFFER_BROWSE: {
    consultative:
      "Thanks {customerName}. I found your top matched offers. Pick any option and I’ll help you build the right package.",
    default:
      "Here are your matched offers. Add items to your basket."
  },
  PAYMENT_METHOD: {
    consultative:
      "You’re all set to checkout. How would you like to pay today?",
    default:
      "Select your payment method."
  },
  UNCLEAR_INPUT: {
    consultative:
      "I can help with that. {fallbackPrompt}",
    default:
      "{fallbackPrompt}"
  }
};

function interpolate(template, tokens = {}) {
  return String(template || "").replace(/\{(\w+)\}/g, (_, key) => {
    const value = tokens[key];
    return value == null || value === "" ? "" : String(value);
  });
}

export function composePrompt(flowStep, context = {}, variant = "default", tokens = {}) {
  const templates = PROMPT_LIBRARY[flowStep] || {};
  const template = templates[variant] || templates.default || tokens.fallbackPrompt || "";
  const defaultTokens = {
    customerName:
      context?.authUser?.name ||
      context?.newOnboarding?.fullName ||
      "there",
    areaCode: context?.areaCode || "your area",
    fallbackPrompt: tokens.fallbackPrompt || ""
  };
  return interpolate(template, { ...defaultTokens, ...tokens }).replace(/\s+/g, " ").trim();
}

export function hasPrompt(flowStep) {
  return Boolean(PROMPT_LIBRARY[flowStep]);
}
