const PROMPT_LIBRARY = {
  HELPDESK_ENTRY: {
    consultative:
      "Welcome to Bell. I’m Belinda, your virtual sales assistant. What would you like to shop for today: mobility, internet, landline, or a bundle?",
    default:
      "Welcome to Bell. I’m Belinda. What service are you shopping for today?"
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

