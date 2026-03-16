import {
  calculateFinancingBreakdown,
  calculateInstallationFees,
  calculateCombinedMonthly,
  calculateFinancingMonthly,
  canAccessOfferBrowse,
  getBundleDiscountRate,
  deriveAreaCodeFromProfile,
  formatPhone,
  isValidAddress,
  isValidCanadianAreaCode,
  isValidCanadianPhone,
  isValidCanadianPostalCode,
  isValidEmail,
  normalizeCanadianPhone,
  parseCombinedOnboardingInput,
  detectCardBrand,
  normalizeCardDigits,
  isValidCardNumber16,
  getFinancingAmount,
  getFinancingEligibleItems,
  getEligibilityProfile,
  getExpectedLast4,
  inferAuthContact,
  maskEmail,
  runMockFinancingApproval
} from "./shared/client-utils.mjs";
import { buildReceiptHtml, getRetryOutcome, resolveRouteFromStep } from "./shared/conversation-utils.mjs";
import {
  LEGACY_FLOW_STEPS,
  PATH_STATUS,
  canProceed as canProceedStep,
  nextLoopGuard,
  parseSalesIntentDeterministic,
  stableContextHash
} from "./shared/workflow-utils.mjs";
import { composePrompt } from "./shared/conversation-style-utils.mjs";

const FLOW_STEPS = {
  INIT_CONNECTING: "INIT_CONNECTING",
  GREETING_CONVERSATIONAL: "GREETING_CONVERSATIONAL",
  CUSTOMER_STATUS_SELECTION: "CUSTOMER_STATUS_SELECTION",
  SERVICE_SELECTION: "SERVICE_SELECTION",
  INTERNET_ADDRESS_REQUEST: "INTERNET_ADDRESS_REQUEST",
  INTERNET_ADDRESS_VALIDATE: "INTERNET_ADDRESS_VALIDATE",
  INTERNET_AVAILABILITY_RESULT: "INTERNET_AVAILABILITY_RESULT",
  INTERNET_PRIORITY_CAPTURE: "INTERNET_PRIORITY_CAPTURE",
  INTERNET_PLAN_PITCH: "INTERNET_PLAN_PITCH",
  PLAN_CONFIRMATION: "PLAN_CONFIRMATION",
  NEW_ONBOARD_COMBINED_CAPTURE: "NEW_ONBOARD_COMBINED_CAPTURE",
  NEW_ACCOUNT_CREATED_CONFIRM: "NEW_ACCOUNT_CREATED_CONFIRM",
  CHECKOUT_INTENT_PROMPT: "CHECKOUT_INTENT_PROMPT",
  PAYMENT_CARD_ENTRY: "PAYMENT_CARD_ENTRY",
  PAYMENT_CARD_NUMBER: "PAYMENT_CARD_NUMBER",
  PAYMENT_CARD_CVC: "PAYMENT_CARD_CVC",
  PAYMENT_CARD_POSTAL: "PAYMENT_CARD_POSTAL",
  PAYMENT_CARD_CONFIRM: "PAYMENT_CARD_CONFIRM",
  EXISTING_AUTH_ENTRY: "EXISTING_AUTH_ENTRY",
  EXISTING_AUTH_VALIDATE: "EXISTING_AUTH_VALIDATE",
  EXISTING_AUTH_FAILURE_HARD_STOP: "EXISTING_AUTH_FAILURE_HARD_STOP",
  EXISTING_AREA_CODE_CHECK: "EXISTING_AREA_CODE_CHECK",
  NEW_AREA_CODE_ENTRY: "NEW_AREA_CODE_ENTRY",
  EXISTING_AUTH_MODE: "EXISTING_AUTH_MODE",
  EXISTING_AUTH_IDENTIFIER: "EXISTING_AUTH_IDENTIFIER",
  NEW_ONBOARD_NAME: "NEW_ONBOARD_NAME",
  NEW_ONBOARD_EMAIL: "NEW_ONBOARD_EMAIL",
  NEW_ONBOARD_PHONE: "NEW_ONBOARD_PHONE",
  NEW_ONBOARD_ADDRESS: "NEW_ONBOARD_ADDRESS",
  HELPDESK_ENTRY: "HELPDESK_ENTRY",
  SERVICE_CLARIFICATION: "SERVICE_CLARIFICATION",
  CORPORATE_DISCOVERY: "CORPORATE_DISCOVERY",
  SUPPORT_DISCOVERY: "SUPPORT_DISCOVERY",
  HARDWARE_TROUBLESHOOT: "HARDWARE_TROUBLESHOOT",
  DEVICE_OS_SELECTION: "DEVICE_OS_SELECTION",
  WARM_AGENT_ROUTING: "WARM_AGENT_ROUTING",
  AGENT_ASSIST_CLARIFY: "AGENT_ASSIST_CLARIFY",
  AUXILIARY_ASSIST: "AUXILIARY_ASSIST",
  POST_AGENT_RATING: "POST_AGENT_RATING",
  POST_AGENT_FEEDBACK: "POST_AGENT_FEEDBACK",
  POST_CHAT_RATING: "POST_CHAT_RATING",
  POST_CHAT_FEEDBACK: "POST_CHAT_FEEDBACK",
  INTENT_DISCOVERY: "INTENT_DISCOVERY",
  OFFER_BROWSE: "OFFER_BROWSE",
  BASKET_REVIEW: "BASKET_REVIEW",
  VALIDATION_ADDRESS_CAPTURE: "VALIDATION_ADDRESS_CAPTURE",
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

const STEP_CONTRACT = {
  [FLOW_STEPS.GREETING_CONVERSATIONAL]: {
    validInputs: ["conversation start"],
    requiredContext: [],
    allowedNext: [FLOW_STEPS.CUSTOMER_STATUS_SELECTION],
    fallbackTarget: FLOW_STEPS.GREETING_CONVERSATIONAL
  },
  [FLOW_STEPS.CUSTOMER_STATUS_SELECTION]: {
    validInputs: ["new client", "existing client"],
    requiredContext: [],
    allowedNext: [FLOW_STEPS.SERVICE_SELECTION, FLOW_STEPS.EXISTING_AUTH_ENTRY],
    fallbackTarget: FLOW_STEPS.CUSTOMER_STATUS_SELECTION
  },
  [FLOW_STEPS.SERVICE_SELECTION]: {
    validInputs: ["internet", "mobility", "landline"],
    requiredContext: ["customerType"],
    allowedNext: [FLOW_STEPS.INTERNET_ADDRESS_REQUEST, FLOW_STEPS.INTENT_DISCOVERY],
    fallbackTarget: FLOW_STEPS.SERVICE_SELECTION
  },
  [FLOW_STEPS.EXISTING_AUTH_ENTRY]: {
    validInputs: ["name/email/phone"],
    requiredContext: ["customerType"],
    allowedNext: [FLOW_STEPS.EXISTING_AUTH_VALIDATE, FLOW_STEPS.EXISTING_AUTH_FAILURE_HARD_STOP, FLOW_STEPS.INTERNET_ADDRESS_REQUEST],
    fallbackTarget: FLOW_STEPS.EXISTING_AUTH_ENTRY
  },
  [FLOW_STEPS.INTERNET_ADDRESS_REQUEST]: {
    validInputs: ["address"],
    requiredContext: ["selectedService"],
    allowedNext: [FLOW_STEPS.INTERNET_ADDRESS_VALIDATE],
    fallbackTarget: FLOW_STEPS.INTERNET_ADDRESS_REQUEST
  },
  [FLOW_STEPS.INTERNET_ADDRESS_VALIDATE]: {
    validInputs: ["confirm address"],
    requiredContext: ["serviceAddress"],
    allowedNext: [FLOW_STEPS.INTERNET_AVAILABILITY_RESULT],
    fallbackTarget: FLOW_STEPS.INTERNET_ADDRESS_VALIDATE
  },
  [FLOW_STEPS.INTERNET_AVAILABILITY_RESULT]: {
    validInputs: ["continue"],
    requiredContext: ["serviceAddress"],
    allowedNext: [FLOW_STEPS.INTERNET_PRIORITY_CAPTURE],
    fallbackTarget: FLOW_STEPS.INTERNET_AVAILABILITY_RESULT
  },
  [FLOW_STEPS.INTERNET_PRIORITY_CAPTURE]: {
    validInputs: ["speed", "value", "performance"],
    requiredContext: ["serviceAddress"],
    allowedNext: [FLOW_STEPS.INTERNET_PLAN_PITCH],
    fallbackTarget: FLOW_STEPS.INTERNET_PRIORITY_CAPTURE
  },
  [FLOW_STEPS.INTERNET_PLAN_PITCH]: {
    validInputs: ["select plan"],
    requiredContext: ["internetPreference"],
    allowedNext: [FLOW_STEPS.PLAN_CONFIRMATION],
    fallbackTarget: FLOW_STEPS.INTERNET_PLAN_PITCH
  },
  [FLOW_STEPS.PLAN_CONFIRMATION]: {
    validInputs: ["confirm plan", "change plan"],
    requiredContext: ["selectedPlanId"],
    allowedNext: [FLOW_STEPS.NEW_ONBOARD_COMBINED_CAPTURE, FLOW_STEPS.CHECKOUT_INTENT_PROMPT, FLOW_STEPS.INTERNET_PLAN_PITCH],
    fallbackTarget: FLOW_STEPS.PLAN_CONFIRMATION
  },
  [FLOW_STEPS.NEW_ONBOARD_COMBINED_CAPTURE]: {
    validInputs: ["full name, email, phone"],
    requiredContext: ["selectedPlanId"],
    allowedNext: [FLOW_STEPS.NEW_ACCOUNT_CREATED_CONFIRM],
    fallbackTarget: FLOW_STEPS.NEW_ONBOARD_COMBINED_CAPTURE
  },
  [FLOW_STEPS.NEW_ACCOUNT_CREATED_CONFIRM]: {
    validInputs: ["continue"],
    requiredContext: ["newOnboarding"],
    allowedNext: [FLOW_STEPS.CHECKOUT_INTENT_PROMPT],
    fallbackTarget: FLOW_STEPS.NEW_ACCOUNT_CREATED_CONFIRM
  },
  [FLOW_STEPS.CHECKOUT_INTENT_PROMPT]: {
    validInputs: ["checkout", "add mobility", "add landline", "not now"],
    requiredContext: ["selectedPlanId"],
    allowedNext: [FLOW_STEPS.PAYMENT_CARD_NUMBER, FLOW_STEPS.PAYMENT_CARD_ENTRY, FLOW_STEPS.OFFER_BROWSE, FLOW_STEPS.ORDER_CONFIRMED],
    fallbackTarget: FLOW_STEPS.CHECKOUT_INTENT_PROMPT
  },
  [FLOW_STEPS.PAYMENT_CARD_ENTRY]: {
    validInputs: ["card details"],
    requiredContext: ["selectedPlanId"],
    allowedNext: [FLOW_STEPS.PAYMENT_CARD_NUMBER, FLOW_STEPS.SHIPPING_SELECTION],
    fallbackTarget: FLOW_STEPS.PAYMENT_CARD_ENTRY
  },
  [FLOW_STEPS.PAYMENT_CARD_NUMBER]: {
    validInputs: ["card number"],
    requiredContext: ["selectedPlanId"],
    allowedNext: [FLOW_STEPS.PAYMENT_CARD_CVC],
    fallbackTarget: FLOW_STEPS.PAYMENT_CARD_NUMBER
  },
  [FLOW_STEPS.PAYMENT_CARD_CVC]: {
    validInputs: ["card cvc"],
    requiredContext: ["selectedPlanId"],
    allowedNext: [FLOW_STEPS.PAYMENT_CARD_POSTAL],
    fallbackTarget: FLOW_STEPS.PAYMENT_CARD_CVC
  },
  [FLOW_STEPS.PAYMENT_CARD_POSTAL]: {
    validInputs: ["postal code"],
    requiredContext: ["selectedPlanId"],
    allowedNext: [FLOW_STEPS.PAYMENT_CARD_CONFIRM],
    fallbackTarget: FLOW_STEPS.PAYMENT_CARD_POSTAL
  },
  [FLOW_STEPS.PAYMENT_CARD_CONFIRM]: {
    validInputs: ["confirm payment", "start over"],
    requiredContext: ["selectedPlanId"],
    allowedNext: [FLOW_STEPS.SHIPPING_SELECTION],
    fallbackTarget: FLOW_STEPS.PAYMENT_CARD_CONFIRM
  },
  [FLOW_STEPS.EXISTING_AUTH_FAILURE_HARD_STOP]: {
    validInputs: ["retry", "end chat"],
    requiredContext: [],
    allowedNext: [FLOW_STEPS.EXISTING_AUTH_ENTRY, FLOW_STEPS.ORDER_CONFIRMED],
    fallbackTarget: FLOW_STEPS.EXISTING_AUTH_FAILURE_HARD_STOP
  },
  [FLOW_STEPS.HELPDESK_ENTRY]: {
    validInputs: ["mobility", "internet", "landline", "bundle"],
    requiredContext: [],
    allowedNext: [FLOW_STEPS.INTENT_DISCOVERY],
    fallbackTarget: FLOW_STEPS.HELPDESK_ENTRY
  },
  [FLOW_STEPS.INTENT_DISCOVERY]: {
    validInputs: ["mobility", "home internet", "landline", "bundle"],
    requiredContext: [],
    allowedNext: [FLOW_STEPS.SERVICE_CLARIFICATION],
    fallbackTarget: FLOW_STEPS.INTENT_DISCOVERY
  },
  [FLOW_STEPS.SERVICE_CLARIFICATION]: {
    validInputs: ["service clarifier"],
    requiredContext: ["intent"],
    allowedNext: [FLOW_STEPS.NEW_ONBOARD_NAME, FLOW_STEPS.OFFER_BROWSE],
    fallbackTarget: FLOW_STEPS.SERVICE_CLARIFICATION
  },
  [FLOW_STEPS.EXISTING_AREA_CODE_CHECK]: {
    validInputs: ["3-digit area code"],
    requiredContext: ["customerType"],
    allowedNext: [FLOW_STEPS.EXISTING_AUTH_MODE],
    fallbackTarget: FLOW_STEPS.CUSTOMER_STATUS_SELECTION
  },
  [FLOW_STEPS.NEW_ONBOARD_NAME]: {
    validInputs: ["full name"],
    requiredContext: [],
    allowedNext: [FLOW_STEPS.NEW_ONBOARD_EMAIL],
    fallbackTarget: FLOW_STEPS.NEW_ONBOARD_NAME
  },
  [FLOW_STEPS.NEW_ONBOARD_EMAIL]: {
    validInputs: ["email"],
    requiredContext: [],
    allowedNext: [FLOW_STEPS.NEW_ONBOARD_PHONE],
    fallbackTarget: FLOW_STEPS.NEW_ONBOARD_EMAIL
  },
  [FLOW_STEPS.NEW_ONBOARD_PHONE]: {
    validInputs: ["phone number"],
    requiredContext: [],
    allowedNext: [FLOW_STEPS.NEW_ONBOARD_ADDRESS],
    fallbackTarget: FLOW_STEPS.NEW_ONBOARD_PHONE
  },
  [FLOW_STEPS.NEW_ONBOARD_ADDRESS]: {
    validInputs: ["address"],
    requiredContext: [],
    allowedNext: [FLOW_STEPS.NEW_AREA_CODE_ENTRY],
    fallbackTarget: FLOW_STEPS.NEW_ONBOARD_ADDRESS
  },
  [FLOW_STEPS.NEW_AREA_CODE_ENTRY]: {
    validInputs: ["3-digit area code"],
    requiredContext: ["customerType"],
    allowedNext: [FLOW_STEPS.OFFER_BROWSE, FLOW_STEPS.INTENT_DISCOVERY],
    fallbackTarget: FLOW_STEPS.NEW_AREA_CODE_ENTRY
  },
  [FLOW_STEPS.EXISTING_AUTH_MODE]: {
    validInputs: ["continue automatically", "authenticate with phone/email"],
    requiredContext: ["customerType", "areaCode"],
    allowedNext: [FLOW_STEPS.EXISTING_AUTH_IDENTIFIER, FLOW_STEPS.INTENT_DISCOVERY, FLOW_STEPS.SUPPORT_DISCOVERY, FLOW_STEPS.HARDWARE_TROUBLESHOOT, FLOW_STEPS.CORPORATE_DISCOVERY],
    fallbackTarget: FLOW_STEPS.EXISTING_AUTH_MODE
  },
  [FLOW_STEPS.VALIDATION_ADDRESS_CAPTURE]: {
    validInputs: ["service address"],
    requiredContext: ["basket"],
    allowedNext: [FLOW_STEPS.ELIGIBILITY_CHECK],
    fallbackTarget: FLOW_STEPS.VALIDATION_ADDRESS_CAPTURE
  }
};

const CATEGORY_PAGES = ["mobility", "home internet", "landline"];
const CATEGORY_LABELS = {
  mobility: "mobility",
  "home internet": "internet",
  landline: "landline"
};
const CATEGORY_CHOICE_LABELS = {
  mobility: "Add mobility offers",
  "home internet": "Add internet offers",
  landline: "Add landline offers"
};
const LANGUAGE_LABELS = {
  en: "English",
  fr: "Français",
  es: "Español",
  zh: "中文"
};
const SUPPORTED_LANGUAGE_CODES = new Set(Object.keys(LANGUAGE_LABELS));
const STATIC_UI_TRANSLATIONS = {
  fr: {
    "New client": "Nouveau client",
    "Existing client": "Client existant",
    Internet: "Internet",
    Mobility: "Mobilité",
    Landline: "Ligne fixe",
    Bundle: "Forfait groupé",
    Speed: "Vitesse",
    Value: "Valeur",
    Performance: "Performance",
    "Build my plan": "Créer mon offre",
    "Confirm plan": "Confirmer le forfait",
    "Change plan": "Changer le forfait",
    "Checkout now": "Passer au paiement",
    "Add mobility offers": "Ajouter des offres mobilité",
    "Add landline offers": "Ajouter des offres ligne fixe",
    "No thanks": "Non merci",
    "Confirm payment": "Confirmer le paiement",
    "Start over": "Recommencer",
    "That is all, continue": "C'est tout, continuer",
    "Retry authentication": "Réessayer l'authentification",
    "End chat": "Terminer le chat"
  },
  es: {
    "New client": "Cliente nuevo",
    "Existing client": "Cliente existente",
    Internet: "Internet",
    Mobility: "Móvil",
    Landline: "Teléfono fijo",
    Bundle: "Paquete",
    Speed: "Velocidad",
    Value: "Valor",
    Performance: "Rendimiento",
    "Build my plan": "Crear mi plan",
    "Confirm plan": "Confirmar plan",
    "Change plan": "Cambiar plan",
    "Checkout now": "Ir al pago",
    "Add mobility offers": "Agregar ofertas móviles",
    "Add landline offers": "Agregar ofertas de línea fija",
    "No thanks": "No gracias",
    "Confirm payment": "Confirmar pago",
    "Start over": "Comenzar de nuevo",
    "That is all, continue": "Eso es todo, continuar",
    "Retry authentication": "Reintentar autenticación",
    "End chat": "Finalizar chat"
  },
  zh: {
    "New client": "新客户",
    "Existing client": "现有客户",
    Internet: "互联网",
    Mobility: "移动服务",
    Landline: "固定电话",
    Bundle: "套餐",
    Speed: "速度",
    Value: "性价比",
    Performance: "性能",
    "Build my plan": "创建我的方案",
    "Confirm plan": "确认方案",
    "Change plan": "更改方案",
    "Checkout now": "立即结账",
    "Add mobility offers": "添加移动服务优惠",
    "Add landline offers": "添加固话优惠",
    "No thanks": "不需要",
    "Confirm payment": "确认付款",
    "Start over": "重新开始",
    "That is all, continue": "就这些，继续",
    "Retry authentication": "重试认证",
    "End chat": "结束聊天"
  }
};
const translatedTextCache = new Map();

const mockUsers = [
  {
    id: "u1001",
    name: "Robert",
    email: "robert@test.gmail.com",
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
    name: "George",
    email: "geroge@test.gmail.com",
    emailAliases: ["george@test.gmail.com"],
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
    name: "Samantha",
    email: "samantha@test.gmail.com",
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
    name: "iPhone 16 + 5G Essential 100",
    description: "Bell-style mobility plan with Canada-wide calling and iPhone financing.",
    monthlyPrice: 89,
    osType: "ios",
    deviceModel: "iPhone 16",
    offerType: "device",
    byodEligible: false,
    financingEligible: true,
    devicePrice: 899,
    inventoryCount: 4,
    inStock: true,
    alternativeOfferIds: ["mob-002", "mob-003"],
    minCreditScore: 620,
    minAge: 18,
    requiresPrimaryHolder: false
  },
  {
    id: "mob-002",
    category: "mobility",
    name: "Samsung Galaxy S25 + Ultimate 175",
    description: "High-data Bell-style plan with Canada + US calling.",
    monthlyPrice: 99,
    osType: "android",
    deviceModel: "Galaxy S25",
    offerType: "device",
    byodEligible: false,
    financingEligible: true,
    devicePrice: 1499,
    inventoryCount: 0,
    inStock: false,
    alternativeOfferIds: ["mob-001", "mob-003"],
    minCreditScore: 700,
    minAge: 18,
    requiresPrimaryHolder: true
  },
  {
    id: "mob-003",
    category: "mobility",
    name: "Google Pixel 10 + Premium 200",
    description: "Large-data mobility package with international calling add-on option.",
    monthlyPrice: 109,
    osType: "android",
    deviceModel: "Pixel 10",
    offerType: "device",
    byodEligible: false,
    financingEligible: true,
    devicePrice: 1199,
    inventoryCount: 6,
    inStock: true,
    alternativeOfferIds: ["mob-001", "mob-002"],
    minCreditScore: 600,
    minAge: 18,
    requiresPrimaryHolder: false
  },
  {
    id: "mob-004",
    category: "mobility",
    name: "Bring Your Own Phone 60",
    description: "Bring your own device with Canada-wide calling and 60 GB data.",
    monthlyPrice: 65,
    osType: "other",
    deviceModel: "BYOD",
    offerType: "byod",
    byodEligible: true,
    financingEligible: false,
    devicePrice: null,
    inventoryCount: 999,
    inStock: true,
    alternativeOfferIds: [],
    minCreditScore: 540,
    minAge: 18,
    requiresPrimaryHolder: false
  },
  {
    id: "mob-005",
    category: "mobility",
    name: "Bring Your Own Phone 100",
    description: "BYOD plan with 100 GB and Canada + US calling.",
    monthlyPrice: 78,
    osType: "other",
    deviceModel: "BYOD",
    offerType: "byod",
    byodEligible: true,
    financingEligible: false,
    devicePrice: null,
    inventoryCount: 999,
    inStock: true,
    alternativeOfferIds: [],
    minCreditScore: 560,
    minAge: 18,
    requiresPrimaryHolder: false
  },
  {
    id: "mob-006",
    category: "mobility",
    name: "Bring Your Own Phone 150",
    description: "BYOD premium plan with international calling support.",
    monthlyPrice: 92,
    osType: "other",
    deviceModel: "BYOD",
    offerType: "byod",
    byodEligible: true,
    financingEligible: false,
    devicePrice: null,
    inventoryCount: 999,
    inStock: true,
    alternativeOfferIds: [],
    minCreditScore: 580,
    minAge: 18,
    requiresPrimaryHolder: false
  },
  {
    id: "internet-001",
    category: "home internet",
    name: "Fibe Gigabit 1.5",
    description: "Up to 1.5 Gbps download and up to 940 Mbps upload for high-demand homes.",
    monthlyPrice: 110,
    financingEligible: false,
    devicePrice: null,
    minCreditScore: 600,
    minAge: 18,
    requiresPrimaryHolder: false
  },
  {
    id: "internet-002",
    category: "home internet",
    name: "Fibe 500",
    description: "Balanced download/upload performance for streaming and hybrid work.",
    monthlyPrice: 90,
    financingEligible: false,
    devicePrice: null,
    minCreditScore: 560,
    minAge: 18,
    requiresPrimaryHolder: false
  },
  {
    id: "internet-003",
    category: "home internet",
    name: "Fibe 150",
    description: "Cost-conscious internet plan with strong everyday performance.",
    monthlyPrice: 75,
    financingEligible: false,
    devicePrice: null,
    minCreditScore: 540,
    minAge: 18,
    requiresPrimaryHolder: false
  },
  {
    id: "landline-001",
    category: "landline",
    name: "Home Phone Basic",
    description: "Core local and Canada-wide calling with voicemail.",
    monthlyPrice: 38,
    lineSupport: ["new_line", "keep_existing"],
    callingProfile: "local",
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
    description: "Includes international minutes with call display and voicemail.",
    monthlyPrice: 52,
    lineSupport: ["new_line", "keep_existing"],
    callingProfile: "international",
    financingEligible: false,
    devicePrice: null,
    minCreditScore: 560,
    minAge: 18,
    requiresPrimaryHolder: true
  },
  {
    id: "landline-003",
    category: "landline",
    name: "Home Phone Premium",
    description: "Enhanced calling features and expanded long-distance package.",
    monthlyPrice: 59,
    lineSupport: ["new_line"],
    callingProfile: "both",
    financingEligible: false,
    devicePrice: null,
    minCreditScore: 560,
    minAge: 18,
    requiresPrimaryHolder: false
  }
];

const promotions = [
  {
    id: "promo-new-customer",
    title: "New Customer Discount",
    description: "Welcome savings for new Bell customers on monthly services.",
    applicableCategories: ["mobility", "home internet", "landline"],
    eligibility: { customerType: "new" },
    benefitType: "percent",
    benefitValue: 0.12,
    priority: 90,
    stackable: false
  },
  {
    id: "promo-spring",
    title: "Spring Savings",
    description: "Seasonal spring offer for qualifying services.",
    applicableCategories: ["mobility", "home internet", "landline"],
    eligibility: { season: "spring" },
    benefitType: "fixed_credit",
    benefitValue: 15,
    priority: 60,
    stackable: false
  },
  {
    id: "promo-returning",
    title: "Returning Client Recognition",
    description: "I see you're a returning client. Here's a loyalty offer.",
    applicableCategories: ["mobility", "home internet", "landline"],
    eligibility: { customerType: "existing", returningClient: true },
    benefitType: "percent",
    benefitValue: 0.08,
    priority: 80,
    stackable: false
  },
  {
    id: "promo-mobility-launch",
    title: "Mobility Device Launch Credit",
    description: "Device launch bonus credit on eligible mobility plans.",
    applicableCategories: ["mobility"],
    eligibility: {},
    benefitType: "fixed_credit",
    benefitValue: 20,
    priority: 70,
    stackable: false
  },
  {
    id: "promo-internet-speed",
    title: "Internet Speed Upgrade Bonus",
    description: "Extra speed bonus for top-tier internet plan selection.",
    applicableCategories: ["home internet"],
    eligibility: {},
    benefitType: "feature_bonus",
    benefitValue: 1,
    priority: 50,
    stackable: false
  }
];

const phonePrefixToUser = {
  "416": "u1001",
  "647": "u1002",
  "986": "u1003"
};
const existingNameToUser = {
  robert: "u1001",
  george: "u1002",
  geroge: "u1002",
  samantha: "u1003"
};

function validateOfferCoverage() {
  const coverage = CATEGORY_PAGES.map((category) => ({
    category,
    count: offers.filter((offer) => offer.category === category).length
  }));
  const missing = coverage.filter((item) => item.count < 3);
  if (missing.length > 0) {
    logClient("error", "offer_coverage_gap", { missing, coverage });
  } else {
    logClient("info", "offer_coverage_validated", { coverage });
  }
}

const chatLauncher = document.getElementById("chat-launcher");
const chatWidget = document.getElementById("chat-widget");
const closeChat = document.getElementById("close-chat");
const llmStatusChip = document.getElementById("llm-status");
const llmStatusText = document.getElementById("llm-status-text");
const languageSwitcher = document.getElementById("language-switcher");
const languageInputs = Array.from(document.querySelectorAll("input[name='chat-language']"));
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
const panelOffers = document.getElementById("panel-offers");
const panelBasket = document.getElementById("panel-basket");
const panelCheckout = document.getElementById("panel-checkout");
const panelQuote = document.getElementById("panel-quote");
const quoteBuilderContent = document.getElementById("quote-builder-content");
const chatBody = document.querySelector(".chat-body");

const basketList = document.getElementById("basket-list");
const basketTotal = document.getElementById("basket-total");
const validateBtn = document.getElementById("validate-btn");

const tokenizeBtn = document.getElementById("tokenize-btn");
const placeOrderBtn = document.getElementById("place-order-btn");
const checkoutStatus = document.getElementById("checkout-status");
const orderSummary = document.getElementById("order-summary");
const sessionStatus = document.getElementById("session-status");
const refreshMetricsBtn = document.getElementById("refresh-metrics-btn");
const metricsGrid = document.getElementById("metrics-grid");
const metricsMonthlyTable = document.querySelector("#metrics-monthly-table tbody");
const metricsSessionsTable = document.querySelector("#metrics-sessions-table tbody");
const metricsRouteTable = document.querySelector("#metrics-route-table tbody");
const metricsSlaSummary = document.getElementById("sla-summary");
const metricsSlaBreachTable = document.querySelector("#sla-breach-table tbody");
const metricsRouteFilter = document.getElementById("metrics-route-filter");
const journeyProgress = document.getElementById("journey-progress");

const state = {
  chatStarted: false,
  muted: false,
  flowStep: FLOW_STEPS.INIT_CONNECTING,
  historyStack: [],
  offerPageIndex: 0,
  timers: [],
  addressTypeaheadTimer: null,
  metricsRefreshTimer: null,
  metricsRouteFilter: "all",
  pendingAuthMode: null,
  context: {
    sessionId: null,
    areaCode: null,
    areaCodeSource: null,
    areaCodeRequiredForTask: false,
    customerStatusAsked: false,
    selectedEntryIntent: null,
    uiLanguage: "en",
    loopGuard: {
      lastStep: null,
      lastContextHash: null,
      sameStepCount: 0
    },
    pathMeta: {
      currentJourney: null,
      journeyStartedAt: null,
      journeyStatus: PATH_STATUS.IDLE
    },
    sla: {
      chatOpenedAt: null,
      firstReplyAt: null,
      intentLockedAt: null,
      offerPresentedAt: null,
      checkoutStartedAt: null,
      orderConfirmedAt: null,
      breachFlags: {
        firstReply: false,
        intentLock: false,
        offerTime: false,
        checkoutTime: false
      }
    },
    customerType: null,
    clientType: null,
    authUser: null,
    intent: null,
    selectedService: null,
    internetPreference: null,
    selectedPlanId: null,
    onboardingCombinedRaw: null,
    existingAuthAttempt: {
      name: null,
      email: null,
      phone: null,
      status: null
    },
    cardEntry: {
      brand: null,
      maskedLast4: null,
      cvcValidated: false,
      postalValidated: false,
      tokenized: false
    },
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
    serviceAddress: null,
    serviceAddressValidated: false,
    addressAuth: {
      pendingInput: null,
      suggestions: [],
      awaitingConfirmation: false
    },
    llmStatus: {
      configured: false,
      connected: false,
      model: null,
      lastCheckedAt: null
    },
    paymentDraft: {
      brand: null,
      last4: null,
      cardSegments: ["", "", "", ""],
      cardValidated: false,
      cvc: null,
      cvcValidated: false,
      postal: null,
      postalValidated: false
    },
    quoteBuilder: {
      preferences: {
        budget: 55,
        speed: 65,
        deviceCost: 35
      },
      lastPreview: [],
      lastPreviewAt: null,
      savedAt: null
    },
    newOnboarding: {
      fullName: null,
      email: null,
      phone: null,
      address: null,
      leadId: null
    },
    salesProfile: {
      serviceType: null,
      speedPriority: null,
      byodChoice: null,
      phonePreference: null,
      linePreference: null,
      callingPlan: null,
      bundleSize: null,
      stage: null,
      awaitingOfferContinuation: false,
      lastSelectedCategory: null,
      crossSellOptions: []
    },
    sessionFlags: {
      orderCompleted: false,
      aiDisclosureShown: false
    },
    discountNotice: {
      lastTierAnnounced: 0
    },
    promoState: {
      candidates: [],
      appliedPromo: null,
      lastAnnouncementKey: null
    },
    addressCaptureRetries: 0,
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

const conversationStyle = {
  [FLOW_STEPS.HELPDESK_ENTRY]: "consultative",
  [FLOW_STEPS.CUSTOMER_STATUS_SELECTION]: "consultative",
  [FLOW_STEPS.EXISTING_AUTH_MODE]: "consultative",
  [FLOW_STEPS.NEW_ONBOARD_NAME]: "consultative",
  [FLOW_STEPS.INTENT_DISCOVERY]: "consultative",
  [FLOW_STEPS.SERVICE_CLARIFICATION]: "consultative",
  [FLOW_STEPS.OFFER_BROWSE]: "consultative",
  [FLOW_STEPS.PAYMENT_METHOD]: "consultative",
  UNCLEAR_INPUT: "consultative"
};

const SLA_TARGETS = {
  firstReplySeconds: 20,
  intentLockSeconds: 90,
  offerPresentationSeconds: 180,
  checkoutCompletionMinutes: 10,
  minOrderSuccessRatePercent: 75,
  maxClarifyRetries: 2
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

const KPI_SNAPSHOT_STORE_KEY = "bell_sales_kpi_snapshots_v1";
const KPI_SESSIONS_STORE_KEY = "bell_sales_kpi_sessions_v1";
const QUOTE_BUILDER_STORE_KEY = "bell_quote_builder_v1";
const DEFAULT_BUSINESS_KPIS = [
  { key: "mean_time_to_completion", label: "Mean Time To Completion (min)", value: 12.4 },
  { key: "customer_acquisition_value", label: "Customer Acquisition Value (CAD)", value: 145 },
  { key: "lead_response_time", label: "Lead Response Time (sec)", value: 18.7 },
  { key: "activity_volume", label: "Activity Volume", value: 210 },
  { key: "reply_rate", label: "Response/Reply Rate (%)", value: 78.5 },
  { key: "interaction_volume", label: "Interaction Volume", value: 265 },
  { key: "qualified_conversion_rate", label: "Qualified Conversion Rate (%)", value: 62.3 },
  { key: "customer_lifetime_value", label: "Customer Lifetime Value (CAD)", value: 980 },
  { key: "monthly_recurring_revenue", label: "Monthly Recurring Revenue (CAD)", value: 420 },
  { key: "pipeline_value", label: "Pipeline Value (CAD)", value: 760 }
];

function formatKpiValue(label, value) {
  const amount = Number(value || 0);
  if (label.includes("(CAD)")) return currency(amount);
  if (label.includes("(%)")) return `${amount.toFixed(2)}%`;
  if (label.includes("(min)")) return `${amount.toFixed(2)} min`;
  if (label.includes("(sec)")) return `${amount.toFixed(2)} sec`;
  return new Intl.NumberFormat("en-CA").format(amount);
}

function readStore(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed || fallback;
  } catch {
    return fallback;
  }
}

function writeStore(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // local storage failures should never block chat flow
  }
}

function mergeMonthlySnapshots(existing = [], incoming = []) {
  const map = new Map();
  existing.forEach((row) => {
    map.set(row.month, row);
  });
  incoming.forEach((row) => {
    map.set(row.month, row);
  });
  return Array.from(map.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12);
}

function mergeSessionInteractions(existing = [], incoming = []) {
  const map = new Map();
  existing.forEach((row) => {
    map.set(row.sessionId, row);
  });
  incoming.forEach((row) => {
    const prev = map.get(row.sessionId);
    if (!prev || new Date(row.lastEventTs || 0).getTime() >= new Date(prev.lastEventTs || 0).getTime()) {
      map.set(row.sessionId, row);
    }
  });
  return Array.from(map.values())
    .sort((a, b) => new Date(b.lastEventTs || 0).getTime() - new Date(a.lastEventTs || 0).getTime())
    .slice(0, 30);
}

function getDefaultMonthlySnapshots() {
  const baseMonth = new Date();
  const rows = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(baseMonth.getUTCFullYear(), baseMonth.getUTCMonth() - i, 1));
    const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    rows.push({
      month,
      mrrCad: 420 + (5 - i) * 18,
      pipelineValueCad: 760 + (5 - i) * 26,
      conversions: 100 + (5 - i) * 4,
      meanTimeToCompletionMinutes: Number((12.6 - (5 - i) * 0.2).toFixed(2))
    });
  }
  return rows;
}

function getDefaultSessionInteractions() {
  return [
    {
      sessionId: "sess_mock_001",
      route: "sales",
      interactions: 16,
      lastEventTs: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      status: "Converted"
    },
    {
      sessionId: "sess_mock_002",
      route: "sales",
      interactions: 11,
      lastEventTs: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
      status: "In Progress"
    }
  ];
}

function persistDashboardSnapshots(metrics = {}) {
  const existingMonthly = readStore(KPI_SNAPSHOT_STORE_KEY, []);
  const existingSessions = readStore(KPI_SESSIONS_STORE_KEY, []);
  const mergedMonthly = mergeMonthlySnapshots(existingMonthly, metrics.monthlySnapshots || []);
  const mergedSessions = mergeSessionInteractions(existingSessions, metrics.sessionInteractions || []);
  writeStore(KPI_SNAPSHOT_STORE_KEY, mergedMonthly);
  writeStore(KPI_SESSIONS_STORE_KEY, mergedSessions);
}

function renderMetricsCards(kpis = []) {
  if (!metricsGrid) return;
  metricsGrid.innerHTML = "";
  kpis.forEach((kpi) => {
    const card = document.createElement("article");
    card.className = "metric-card";
    const label = document.createElement("p");
    label.className = "metric-label";
    label.textContent = kpi.label;
    const value = document.createElement("div");
    value.className = "metric-value";
    value.textContent = formatKpiValue(kpi.label, kpi.value);
    card.appendChild(label);
    card.appendChild(value);
    metricsGrid.appendChild(card);
  });
}

function renderMonthlySnapshotTable(rows = []) {
  if (!metricsMonthlyTable) return;
  metricsMonthlyTable.innerHTML = "";
  rows.slice(-6).reverse().forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.month}</td>
      <td>${currency(Number(row.mrrCad || 0))}</td>
      <td>${currency(Number(row.pipelineValueCad || 0))}</td>
      <td>${new Intl.NumberFormat("en-CA").format(Number(row.conversions || 0))}</td>
      <td>${Number(row.meanTimeToCompletionMinutes || 0).toFixed(2)} min</td>
    `;
    metricsMonthlyTable.appendChild(tr);
  });
}

function renderSessionInteractionsTable(rows = []) {
  if (!metricsSessionsTable) return;
  const filter = state.metricsRouteFilter || "all";
  const filteredRows = filter === "all" ? rows : rows.filter((row) => String(row.route || "").includes(filter));
  metricsSessionsTable.innerHTML = "";
  filteredRows.slice(0, 12).forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.sessionId}</td>
      <td>${row.route || "sales"}</td>
      <td>${new Intl.NumberFormat("en-CA").format(Number(row.interactions || 0))}</td>
      <td>${row.lastEventTs ? new Date(row.lastEventTs).toLocaleString() : "n/a"}</td>
      <td>${row.status || "In Progress"}</td>
    `;
    metricsSessionsTable.appendChild(tr);
  });
}

function renderRouteBreakdownTable(rows = []) {
  if (!metricsRouteTable) return;
  const filter = state.metricsRouteFilter || "all";
  metricsRouteTable.innerHTML = "";
  rows
    .filter((row) => row.route !== "unknown")
    .filter((row) => filter === "all" || String(row.route || "").includes(filter))
    .forEach((row) => {
      const conversion = row.pathStarted ? ((row.orderSuccess / row.pathStarted) * 100).toFixed(1) : "0.0";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.route}</td>
        <td>${row.pathStarted || 0}</td>
        <td>${row.orderSuccess || 0}</td>
        <td>${conversion}%</td>
      `;
      metricsRouteTable.appendChild(tr);
    });
}

function renderSlaSummary(sla = {}) {
  if (!metricsSlaSummary) return;
  const score = Number(sla.overallHealthScore || 100).toFixed(1);
  const breaches = Number(sla.breachCount || 0);
  const statusClass = breaches > 0 ? "sla-badge breach" : "sla-badge pass";
  metricsSlaSummary.innerHTML = `
    <div class="sla-card">
      <p>SLA Health Score</p>
      <strong>${score}%</strong>
    </div>
    <div class="sla-card">
      <p>Active Breaches</p>
      <strong>${breaches}</strong>
    </div>
    <div class="${statusClass}">
      ${breaches > 0 ? "Action Required" : "On Target"}
    </div>
  `;
}

function renderSlaBreachSeries(rows = []) {
  if (!metricsSlaBreachTable) return;
  metricsSlaBreachTable.innerHTML = "";
  const series = rows.length
    ? rows
    : getDefaultMonthlySnapshots().map((row) => ({ month: row.month, breaches: 0 }));
  series.slice(-6).reverse().forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.month}</td>
      <td>${row.breaches}</td>
    `;
    metricsSlaBreachTable.appendChild(tr);
  });
}

function stepToJourneyStage(step) {
  if (
    [
      FLOW_STEPS.GREETING_CONVERSATIONAL,
      FLOW_STEPS.SERVICE_SELECTION,
      FLOW_STEPS.EXISTING_AUTH_ENTRY,
      FLOW_STEPS.EXISTING_AUTH_VALIDATE,
      FLOW_STEPS.EXISTING_AUTH_FAILURE_HARD_STOP,
      FLOW_STEPS.INTERNET_ADDRESS_REQUEST,
      FLOW_STEPS.INTERNET_ADDRESS_VALIDATE,
      FLOW_STEPS.INTERNET_AVAILABILITY_RESULT,
      FLOW_STEPS.INTERNET_PRIORITY_CAPTURE,
      FLOW_STEPS.NEW_ONBOARD_COMBINED_CAPTURE,
      FLOW_STEPS.NEW_ACCOUNT_CREATED_CONFIRM,
      FLOW_STEPS.HELPDESK_ENTRY,
      FLOW_STEPS.CUSTOMER_STATUS_SELECTION,
      FLOW_STEPS.EXISTING_AREA_CODE_CHECK,
      FLOW_STEPS.EXISTING_AUTH_MODE,
      FLOW_STEPS.EXISTING_AUTH_IDENTIFIER,
      FLOW_STEPS.NEW_ONBOARD_NAME,
      FLOW_STEPS.NEW_ONBOARD_EMAIL,
      FLOW_STEPS.NEW_ONBOARD_PHONE,
      FLOW_STEPS.NEW_ONBOARD_ADDRESS,
      FLOW_STEPS.NEW_AREA_CODE_ENTRY,
      FLOW_STEPS.INTENT_DISCOVERY,
      FLOW_STEPS.SERVICE_CLARIFICATION
    ].includes(step)
  ) return 0;
  if ([FLOW_STEPS.OFFER_BROWSE, FLOW_STEPS.INTERNET_PLAN_PITCH, FLOW_STEPS.PLAN_CONFIRMATION].includes(step)) return 1;
  if ([FLOW_STEPS.BASKET_REVIEW, FLOW_STEPS.CHECKOUT_INTENT_PROMPT, FLOW_STEPS.VALIDATION_ADDRESS_CAPTURE, FLOW_STEPS.ELIGIBILITY_CHECK].includes(step)) return 2;
  if (
    [
      FLOW_STEPS.PAYMENT_CARD_ENTRY,
      FLOW_STEPS.PAYMENT_CARD_NUMBER,
      FLOW_STEPS.PAYMENT_CARD_CVC,
      FLOW_STEPS.PAYMENT_CARD_POSTAL,
      FLOW_STEPS.PAYMENT_CARD_CONFIRM,
      FLOW_STEPS.PAYMENT_METHOD,
      FLOW_STEPS.PAYMENT_CONFIRM_LAST4,
      FLOW_STEPS.PAYMENT_CVV,
      FLOW_STEPS.PAYMENT_FINANCING_TERM,
      FLOW_STEPS.PAYMENT_FINANCING_UPFRONT,
      FLOW_STEPS.PAYMENT_FINANCING_APPROVAL,
      FLOW_STEPS.PAYMENT_FINANCING_CONFIRM
    ].includes(step)
  ) return 3;
  if (
    [FLOW_STEPS.SHIPPING_SELECTION, FLOW_STEPS.SHIPPING_MANUAL_ENTRY, FLOW_STEPS.SHIPPING_LOOKUP].includes(step)
  ) return 4;
  if ([FLOW_STEPS.ORDER_REVIEW, FLOW_STEPS.ORDER_CONFIRMED, FLOW_STEPS.POST_CHAT_RATING, FLOW_STEPS.POST_CHAT_FEEDBACK, FLOW_STEPS.AUXILIARY_ASSIST].includes(step)) return 5;
  return -1;
}

function updateJourneyProgress(step) {
  if (!journeyProgress) return;
  const labels = ["Discovery", "Offers", "Basket", "Payment", "Shipping", "Confirm"];
  const active = stepToJourneyStage(step);
  journeyProgress.innerHTML = labels
    .map((label, idx) => {
      const cls = idx === active ? "journey-chip active" : idx < active ? "journey-chip done" : "journey-chip";
      return `<span class="${cls}">${label}</span>`;
    })
    .join("");
}

function renderMetricsDashboard(metrics = {}, { fromCache = false } = {}) {
  const kpiList = metrics.businessKpis?.length ? metrics.businessKpis : DEFAULT_BUSINESS_KPIS;
  const llmUsage = metrics.llmUsage || null;
  const mergedKpis = llmUsage
    ? [
        ...kpiList,
        { key: "llm_total_calls", label: "LLM Calls", value: llmUsage.totalCalls || 0 },
        { key: "llm_avg_tokens_session", label: "Avg Tokens / Session", value: llmUsage.avgTokensPerSession || 0 },
        { key: "llm_fallback_rate", label: "LLM Fallback Rate (%)", value: llmUsage.fallbackRatePercent || 0 }
      ]
    : kpiList;
  const monthlyRows = (metrics.monthlySnapshots && metrics.monthlySnapshots.length)
    ? metrics.monthlySnapshots
    : readStore(KPI_SNAPSHOT_STORE_KEY, []).length
      ? readStore(KPI_SNAPSHOT_STORE_KEY, [])
      : getDefaultMonthlySnapshots();
  const sessionRows = (metrics.sessionInteractions && metrics.sessionInteractions.length)
    ? metrics.sessionInteractions
    : readStore(KPI_SESSIONS_STORE_KEY, []).length
      ? readStore(KPI_SESSIONS_STORE_KEY, [])
      : getDefaultSessionInteractions();
  const routeRows = metrics.routeBreakdown || [];
  const sla = metrics.sla || { overallHealthScore: 100, breachCount: 0, monthlyBreachSeries: [] };
  renderMetricsCards(mergedKpis);
  renderMonthlySnapshotTable(monthlyRows);
  renderSessionInteractionsTable(sessionRows);
  renderRouteBreakdownTable(routeRows);
  renderSlaSummary(sla);
  renderSlaBreachSeries(sla.monthlyBreachSeries || []);
  if (refreshMetricsBtn) {
    refreshMetricsBtn.textContent = fromCache ? "Showing Cached KPI Data" : "Refresh KPI Data";
  }
}

async function refreshMetricsDashboard({ silent = false } = {}) {
  try {
    if (refreshMetricsBtn) {
      refreshMetricsBtn.disabled = true;
      refreshMetricsBtn.textContent = "Refreshing...";
    }
    const response = await fetch("/api/metrics?days=30");
    if (!response.ok) throw new Error("metrics unavailable");
    const metrics = await response.json();
    persistDashboardSnapshots(metrics);
    renderMetricsDashboard(metrics, { fromCache: false });
  } catch {
    renderMetricsDashboard({}, { fromCache: true });
    if (!silent) {
      postMessage("bot", "I could not refresh KPI analytics right now. Showing the latest cached values.");
    }
  } finally {
    if (refreshMetricsBtn) {
      refreshMetricsBtn.disabled = false;
      if (refreshMetricsBtn.textContent !== "Showing Cached KPI Data") {
        refreshMetricsBtn.textContent = "Refresh KPI Data";
      }
    }
  }
}

function queueMetricsDashboardRefresh(delayMs = 1200) {
  if (state.metricsRefreshTimer) {
    clearTimeout(state.metricsRefreshTimer);
  }
  state.metricsRefreshTimer = setTimeout(() => {
    state.metricsRefreshTimer = null;
    refreshMetricsDashboard({ silent: true });
  }, delayMs);
}

function updateLlmStatusUi(status = {}) {
  if (!llmStatusChip || !llmStatusText) return;
  llmStatusChip.classList.remove("llm-online", "llm-degraded", "llm-offline");
  const configured = Boolean(status.configured);
  const connected = Boolean(status.connected);
  if (connected) {
    llmStatusChip.classList.add("llm-online");
    llmStatusText.textContent = `ChatGPT: Connected${status.model ? ` (${status.model})` : ""}`;
    return;
  }
  if (configured) {
    llmStatusChip.classList.add("llm-degraded");
    llmStatusText.textContent = "ChatGPT: Degraded";
    return;
  }
  llmStatusChip.classList.add("llm-offline");
  llmStatusText.textContent = "ChatGPT: Not configured";
}

async function refreshLlmStatus({ silent = true } = {}) {
  try {
    const response = await fetch("/api/llm-health");
    if (!response.ok) throw new Error("health unavailable");
    const payload = await response.json();
    applyContextPatch({
      llmStatus: {
        configured: Boolean(payload.configured),
        connected: Boolean(payload.connected),
        model: payload.model || null,
        lastCheckedAt: payload.lastCheckedAt || null
      }
    });
    updateLlmStatusUi(payload);
  } catch (error) {
    applyContextPatch({
      llmStatus: {
        configured: false,
        connected: false,
        model: null,
        lastCheckedAt: new Date().toISOString()
      }
    });
    updateLlmStatusUi({ configured: false, connected: false, model: null });
    if (!silent) {
      postMessage("bot", "ChatGPT connection check is unavailable right now. Continuing with deterministic responses.");
    }
  }
}

async function requestChatAssist(task, payload = {}, { fallbackText = "", minLength = 8 } = {}) {
  try {
    const response = await fetch("/api/chat-assist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task,
        sessionId: state.context.sessionId,
        step: state.flowStep,
        context: {
          sessionId: state.context.sessionId,
          customerType: state.context.customerType,
          intent: state.context.intent,
          selectedService: state.context.selectedService
        },
        ...payload
      })
    });
    if (!response.ok) throw new Error("assist unavailable");
    const data = await response.json();
    if (data?.mode === "llm") {
      applyContextPatch({ llmStatus: { configured: true, connected: true, model: state.context.llmStatus.model || "gpt-4.1-mini" } });
      updateLlmStatusUi({ ...state.context.llmStatus, configured: true, connected: true, model: state.context.llmStatus.model || "gpt-4.1-mini" });
    }
    const text = String(data?.text || "").trim();
    if (text.length >= minLength) return text;
    return fallbackText;
  } catch {
    return fallbackText;
  }
}

function getQuoteDefaultsFromPreference(preference = "") {
  const pref = String(preference || "").toLowerCase();
  if (pref.includes("speed")) {
    return { budget: 35, speed: 90, deviceCost: 25 };
  }
  if (pref.includes("performance") || pref.includes("upload")) {
    return { budget: 45, speed: 80, deviceCost: 30 };
  }
  return { budget: 85, speed: 40, deviceCost: 35 };
}

function normalizeQuotePreferences(preferences = {}) {
  return {
    budget: Math.max(0, Math.min(100, Number(preferences.budget ?? 55))),
    speed: Math.max(0, Math.min(100, Number(preferences.speed ?? 65))),
    deviceCost: Math.max(0, Math.min(100, Number(preferences.deviceCost ?? 35)))
  };
}

function getOfferInstallationFee(category = "") {
  if (category === "home internet") return 25;
  if (category === "landline") return 50;
  return 0;
}

function getQuoteCandidatesForService(serviceType = "home internet") {
  const normalized = String(serviceType || "").toLowerCase();
  return offers
    .filter((offer) => String(offer.category || "").toLowerCase() === normalized)
    .map((offer) => ({
      id: offer.id,
      category: offer.category,
      name: offer.name,
      description: offer.description,
      monthlyPrice: Number(offer.monthlyPrice || 0),
      devicePrice: offer.devicePrice == null ? null : Number(offer.devicePrice || 0),
      contractMonths: 24,
      installationFee: getOfferInstallationFee(offer.category)
    }));
}

async function requestQuotePreview(preferences = {}, serviceType = "home internet", maxResults = 3) {
  const response = await fetch("/api/quote-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      serviceType,
      preferences: normalizeQuotePreferences(preferences),
      maxResults,
      offers: getQuoteCandidatesForService(serviceType)
    })
  });
  if (!response.ok) {
    throw new Error("quote preview failed");
  }
  return response.json();
}

function saveQuoteBuilderSnapshot() {
  const payload = {
    ts: new Date().toISOString(),
    serviceType: state.context.selectedService || "internet",
    preference: state.context.internetPreference || null,
    preferences: normalizeQuotePreferences(state.context.quoteBuilder?.preferences || {}),
    lastPreview: state.context.quoteBuilder?.lastPreview || []
  };
  writeStore(QUOTE_BUILDER_STORE_KEY, payload);
  applyContextPatch({ quoteBuilder: { savedAt: payload.ts } });
  postMessage("bot", "Quote saved. You can resume this quote later in the same browser.");
  logClient("info", "quote_builder_saved", { quotes: payload.lastPreview.length, serviceType: payload.serviceType });
}

function loadQuoteBuilderSnapshot() {
  const stored = readStore(QUOTE_BUILDER_STORE_KEY, null);
  if (!stored || !stored.preferences) return null;
  const normalized = normalizeQuotePreferences(stored.preferences);
  applyContextPatch({
    quoteBuilder: {
      preferences: normalized,
      lastPreview: Array.isArray(stored.lastPreview) ? stored.lastPreview : [],
      lastPreviewAt: stored.ts || null,
      savedAt: stored.ts || null
    }
  });
  return stored;
}

async function generateQuotePreview({ announce = true } = {}) {
  const serviceType = state.context.intent || "home internet";
  const preferences = normalizeQuotePreferences(state.context.quoteBuilder?.preferences || {});
  try {
    const payload = await requestQuotePreview(preferences, serviceType, 3);
    const quotes = Array.isArray(payload.quotes) ? payload.quotes : [];
    const finalQuotes =
      quotes.length > 0
        ? quotes
        : getInternetOffersByPreference(state.context.internetPreference || "value").slice(0, 3).map((offer, idx) => ({
            offerId: offer.id,
            name: offer.name,
            category: offer.category,
            monthlyPrice: Number(offer.monthlyPrice || 0),
            devicePrice: offer.devicePrice == null ? 0 : Number(offer.devicePrice || 0),
            installationFee: getOfferInstallationFee(offer.category),
            rank: idx + 1,
            reasons: ["Deterministic fallback recommendation based on your preference."]
          }));
    applyContextPatch({
      quoteBuilder: {
        preferences,
        lastPreview: finalQuotes,
        lastPreviewAt: new Date().toISOString()
      }
    });
    if (announce) {
      postMessage("bot", `I prepared ${finalQuotes.length} quote option(s). You can apply one directly from the quote panel.`);
      if (finalQuotes[0]) {
        postMessage(
          "bot",
          `Top recommendation: ${finalQuotes[0].name} at ${currency(Number(finalQuotes[0].monthlyPrice || 0))}/month.`
        );
      }
    }
    logClient("info", "quote_preview_generated", {
      serviceType,
      quoteCount: finalQuotes.length,
      fallbackUsed: quotes.length === 0,
      preferences
    });
    renderQuoteBuilderPanel();
    return finalQuotes;
  } catch {
    const fallbackQuotes = getInternetOffersByPreference(state.context.internetPreference || "value").slice(0, 3).map((offer, idx) => ({
      offerId: offer.id,
      name: offer.name,
      category: offer.category,
      monthlyPrice: Number(offer.monthlyPrice || 0),
      devicePrice: offer.devicePrice == null ? 0 : Number(offer.devicePrice || 0),
      installationFee: getOfferInstallationFee(offer.category),
      rank: idx + 1,
      reasons: ["Deterministic fallback recommendation based on your preference."]
    }));
    applyContextPatch({
      quoteBuilder: {
        preferences,
        lastPreview: fallbackQuotes,
        lastPreviewAt: new Date().toISOString()
      }
    });
    if (announce) {
      postMessage("bot", "I couldn't build quotes right now, so I’m showing deterministic recommended plans.");
      if (fallbackQuotes[0]) {
        postMessage(
          "bot",
          `Top recommendation: ${fallbackQuotes[0].name} at ${currency(Number(fallbackQuotes[0].monthlyPrice || 0))}/month.`
        );
      }
    }
    logClient("error", "quote_preview_failed", {
      serviceType,
      preferences,
      fallbackCount: fallbackQuotes.length
    });
    renderQuoteBuilderPanel();
    return fallbackQuotes;
  }
}

function getInternetPlanOptions() {
  const quoted = state.context.quoteBuilder?.lastPreview || [];
  if (quoted.length > 0) {
    const mapped = quoted
      .map((quote) => {
        const offer = getOfferByIdSafe(quote.offerId);
        if (!offer) return null;
        return { ...offer, quoteRank: quote.rank, quoteReasons: quote.reasons || [] };
      })
      .filter(Boolean);
    if (mapped.length > 0) return mapped;
  }
  return getInternetOffersByPreference(state.context.internetPreference || "value");
}

function applyQuotedPlan(offerId) {
  const selectedPlan = getOfferByIdSafe(offerId);
  if (!selectedPlan) {
    postMessage("bot", "I couldn't match that quote to a plan. Please generate the quote again.");
    return;
  }
  applyContextPatch({ selectedPlanId: selectedPlan.id });
  postMessage("user", `Apply quote for ${selectedPlan.name}`);
  postMessage("bot", `Perfect. I selected ${selectedPlan.name} at ${currency(selectedPlan.monthlyPrice)}/month.`);
  logClient("info", "quote_plan_applied", { offerId: selectedPlan.id });
  transitionTo(FLOW_STEPS.PLAN_CONFIRMATION, {}, { pushHistory: true, enforceContract: false });
}

function renderQuoteBuilderPanel() {
  if (!panelQuote || !quoteBuilderContent) return;
  const shouldShow =
    state.context.intent === "home internet" &&
    [FLOW_STEPS.INTERNET_PRIORITY_CAPTURE, FLOW_STEPS.INTERNET_PLAN_PITCH].includes(state.flowStep);
  panelQuote.classList.toggle("hidden", !shouldShow);
  if (!shouldShow) return;

  const preferences = normalizeQuotePreferences(state.context.quoteBuilder?.preferences || {});
  const quotes = state.context.quoteBuilder?.lastPreview || [];
  const savedAt = state.context.quoteBuilder?.savedAt || null;
  const quoteCards = quotes.length
    ? quotes
        .map(
          (quote) => `
          <article class="quote-card">
            <div class="quote-rank">Quote ${quote.rank}</div>
            <div class="quote-name">${quote.name}</div>
            <div class="quote-price">${currency(Number(quote.monthlyPrice || 0))}/month</div>
            <div class="quote-meta">Install: ${currency(Number(quote.installationFee || 0))}</div>
            <div class="quote-reasons">${(quote.reasons || []).slice(0, 2).join(" ")}</div>
            <button type="button" class="quote-apply-btn" data-offer-id="${quote.offerId}">Apply Quote ${quote.rank}</button>
          </article>`
        )
        .join("")
    : `<div class="quote-empty">No quote generated yet. Set preferences and click "Generate quote".</div>`;

  quoteBuilderContent.innerHTML = `
    <div class="quote-builder-grid">
      <label>Budget focus <span>${Math.round(preferences.budget)}</span>
        <input type="range" min="0" max="100" value="${preferences.budget}" data-quote-slider="budget" />
      </label>
      <label>Speed focus <span>${Math.round(preferences.speed)}</span>
        <input type="range" min="0" max="100" value="${preferences.speed}" data-quote-slider="speed" />
      </label>
      <label>Device cost focus <span>${Math.round(preferences.deviceCost)}</span>
        <input type="range" min="0" max="100" value="${preferences.deviceCost}" data-quote-slider="deviceCost" />
      </label>
    </div>
    <div class="quote-builder-actions">
      <button type="button" id="quote-generate-btn">Generate quote</button>
      <button type="button" id="quote-save-btn" class="secondary">Save quote</button>
      <button type="button" id="quote-resume-btn" class="secondary">Resume quote</button>
    </div>
    <div class="quote-save-note">${savedAt ? `Last saved: ${new Date(savedAt).toLocaleString()}` : "No saved quote in this browser yet."}</div>
    <div class="quote-cards">${quoteCards}</div>
  `;

  quoteBuilderContent.querySelectorAll("[data-quote-slider]").forEach((slider) => {
    slider.addEventListener("input", (event) => {
      const target = event.currentTarget;
      const key = target.dataset.quoteSlider;
      const value = Number(target.value || 0);
      const nextPreferences = normalizeQuotePreferences({
        ...(state.context.quoteBuilder?.preferences || {}),
        [key]: value
      });
      applyContextPatch({ quoteBuilder: { preferences: nextPreferences } });
      const label = target.closest("label");
      const valueEl = label ? label.querySelector("span") : null;
      if (valueEl) valueEl.textContent = `${Math.round(value)}`;
    });
  });

  const generateBtn = quoteBuilderContent.querySelector("#quote-generate-btn");
  if (generateBtn) {
    generateBtn.addEventListener("click", () => {
      void generateQuotePreview({ announce: true });
    });
  }
  const saveBtn = quoteBuilderContent.querySelector("#quote-save-btn");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => saveQuoteBuilderSnapshot());
  }
  const resumeBtn = quoteBuilderContent.querySelector("#quote-resume-btn");
  if (resumeBtn) {
    resumeBtn.addEventListener("click", () => {
      const stored = loadQuoteBuilderSnapshot();
      if (!stored) {
        postMessage("bot", "No saved quote found yet in this browser.");
        return;
      }
      postMessage("bot", "Saved quote loaded. You can regenerate or apply one of the saved options.");
      renderQuoteBuilderPanel();
    });
  }
  quoteBuilderContent.querySelectorAll(".quote-apply-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      const offerId = event.currentTarget.getAttribute("data-offer-id");
      if (!offerId) return;
      applyQuotedPlan(offerId);
    });
  });
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
  if (state.metricsRefreshTimer) {
    clearTimeout(state.metricsRefreshTimer);
    state.metricsRefreshTimer = null;
  }
}

function postMessage(role, text, { force = false } = {}) {
  if (role === "bot" && state.muted && !force) return;
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  const sourceText = String(text || "");
  el.textContent = sourceText;
  chatWindow.appendChild(el);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  if (role === "bot") {
    const uiLanguage = getCurrentUiLanguage();
    if (uiLanguage !== "en") {
      el.setAttribute("data-source-text", sourceText);
      const activeLanguage = uiLanguage;
      void translateForUi(sourceText, activeLanguage).then((translated) => {
        if (!el.isConnected) return;
        if (getCurrentUiLanguage() !== activeLanguage) return;
        el.textContent = translated || sourceText;
      });
    }
    trackSlaFirstReply();
  }
}

function stepPrompt(step, fallbackPrompt, tokens = {}) {
  const variant = conversationStyle[step] || "default";
  const text = composePrompt(step, state.context, variant, {
    fallbackPrompt,
    ...tokens
  });
  postMessage("bot", text || fallbackPrompt);
}

function logSlaBreachOnce(key, eventName, details = {}) {
  const flags = state.context.sla?.breachFlags || {};
  if (flags[key]) return;
  applyContextPatch({
    sla: {
      breachFlags: {
        ...flags,
        [key]: true
      }
    }
  });
  logClient("error", eventName, details);
}

function trackSlaFirstReply() {
  const sla = state.context.sla || {};
  if (!sla.chatOpenedAt || sla.firstReplyAt) return;
  const firstReplyAt = Date.now();
  applyContextPatch({ sla: { firstReplyAt } });
  const elapsedSec = (firstReplyAt - sla.chatOpenedAt) / 1000;
  if (elapsedSec > SLA_TARGETS.firstReplySeconds) {
    logSlaBreachOnce("firstReply", "sla_first_reply_breach", {
      actualSeconds: Number(elapsedSec.toFixed(2)),
      targetSeconds: SLA_TARGETS.firstReplySeconds
    });
  }
}

function trackSlaTransition(nextStep) {
  const now = Date.now();
  const sla = state.context.sla || {};
  const chatOpenedAt = sla.chatOpenedAt;
  if (!chatOpenedAt) return;

  if (nextStep === FLOW_STEPS.SERVICE_CLARIFICATION && !sla.intentLockedAt) {
    const actualSec = (now - chatOpenedAt) / 1000;
    applyContextPatch({ sla: { intentLockedAt: now } });
    if (actualSec > SLA_TARGETS.intentLockSeconds) {
      logSlaBreachOnce("intentLock", "sla_intent_lock_breach", {
        actualSeconds: Number(actualSec.toFixed(2)),
        targetSeconds: SLA_TARGETS.intentLockSeconds
      });
    }
  }

  if (nextStep === FLOW_STEPS.OFFER_BROWSE && !sla.offerPresentedAt) {
    const actualSec = (now - chatOpenedAt) / 1000;
    applyContextPatch({ sla: { offerPresentedAt: now } });
    if (actualSec > SLA_TARGETS.offerPresentationSeconds) {
      logSlaBreachOnce("offerTime", "sla_offer_time_breach", {
        actualSeconds: Number(actualSec.toFixed(2)),
        targetSeconds: SLA_TARGETS.offerPresentationSeconds
      });
    }
  }

  if (nextStep === FLOW_STEPS.PAYMENT_METHOD && !sla.checkoutStartedAt) {
    applyContextPatch({ sla: { checkoutStartedAt: now } });
  }
}

function trackSlaCheckoutCompletion() {
  const sla = state.context.sla || {};
  if (!sla.checkoutStartedAt) return;
  const now = Date.now();
  applyContextPatch({ sla: { orderConfirmedAt: now } });
  const actualMin = (now - sla.checkoutStartedAt) / 60000;
  if (actualMin > SLA_TARGETS.checkoutCompletionMinutes) {
    logSlaBreachOnce("checkoutTime", "sla_checkout_time_breach", {
      actualMinutes: Number(actualMin.toFixed(2)),
      targetMinutes: SLA_TARGETS.checkoutCompletionMinutes
    });
  }
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
    queueMetricsDashboardRefresh();
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

function normalizeLanguageCode(code = "en") {
  const normalized = String(code || "en").toLowerCase();
  return SUPPORTED_LANGUAGE_CODES.has(normalized) ? normalized : "en";
}

function getCurrentUiLanguage() {
  return normalizeLanguageCode(state.context.uiLanguage || "en");
}

function getStaticTranslation(text = "", languageCode = "en") {
  const normalizedLanguage = normalizeLanguageCode(languageCode);
  if (normalizedLanguage === "en") return String(text || "");
  const map = STATIC_UI_TRANSLATIONS[normalizedLanguage] || {};
  return map[String(text || "")] || "";
}

async function translateForUi(text = "", languageCode = "en") {
  const normalizedLanguage = normalizeLanguageCode(languageCode);
  const sourceText = String(text || "");
  if (!sourceText || normalizedLanguage === "en") return sourceText;
  const staticTranslation = getStaticTranslation(sourceText, normalizedLanguage);
  if (staticTranslation) return staticTranslation;
  const cacheKey = `${normalizedLanguage}::${sourceText}`;
  if (translatedTextCache.has(cacheKey)) return translatedTextCache.get(cacheKey);

  const translated = await requestChatAssist(
    "translate",
    {
      userMessage: sourceText,
      deterministicData: {
        sourceLanguage: "English",
        targetLanguage: LANGUAGE_LABELS[normalizedLanguage] || normalizedLanguage,
        preserveNumbers: true,
        preserveCurrency: true
      }
    },
    {
      fallbackText: sourceText,
      minLength: 2
    }
  );
  const finalized = String(translated || sourceText).trim() || sourceText;
  translatedTextCache.set(cacheKey, finalized);
  return finalized;
}

function localizeQuickActionButton(button, baseLabel, languageCode) {
  const normalizedLanguage = normalizeLanguageCode(languageCode);
  if (!button) return;
  if (normalizedLanguage === "en") {
    button.textContent = baseLabel;
    return;
  }

  const staticTranslation = getStaticTranslation(baseLabel, normalizedLanguage);
  if (staticTranslation) {
    button.textContent = staticTranslation;
    return;
  }

  button.textContent = baseLabel;
  const activeLanguage = normalizedLanguage;
  void translateForUi(baseLabel, activeLanguage).then((translated) => {
    if (!button.isConnected) return;
    if (getCurrentUiLanguage() !== activeLanguage) return;
    button.textContent = translated || baseLabel;
  });
}

function refreshQuickActionsLanguage() {
  const language = getCurrentUiLanguage();
  quickActions.querySelectorAll("button[data-base-label]").forEach((button) => {
    const baseLabel = button.getAttribute("data-base-label") || button.textContent || "";
    localizeQuickActionButton(button, baseLabel, language);
  });
}

function getLanguageStatusPrompt(step) {
  switch (step) {
    case FLOW_STEPS.CUSTOMER_STATUS_SELECTION:
      return "Are you a new client or an existing Bell client?";
    case FLOW_STEPS.SERVICE_SELECTION:
      return "What service are you looking for today?";
    case FLOW_STEPS.INTERNET_ADDRESS_REQUEST:
      return "Please share your service address so I can confirm availability.";
    case FLOW_STEPS.INTERNET_PRIORITY_CAPTURE:
      return "What is your internet priority: speed, value, or performance?";
    case FLOW_STEPS.INTERNET_PLAN_PITCH:
      return "I will continue with your plan recommendations in this language.";
    case FLOW_STEPS.OFFER_BROWSE:
      return "I will continue with your offer selection in this language.";
    case FLOW_STEPS.PAYMENT_CARD_NUMBER:
      return "I will continue with payment details in this language.";
    default:
      return "Language updated. I will continue in your selected language.";
  }
}

function syncLanguageSwitcherUi(languageCode = "en") {
  const normalizedLanguage = normalizeLanguageCode(languageCode);
  languageInputs.forEach((input) => {
    input.checked = input.value === normalizedLanguage;
  });
  if (languageSwitcher) {
    languageSwitcher.setAttribute("data-language", normalizedLanguage);
  }
}

function setConversationLanguage(languageCode = "en", { announce = true } = {}) {
  const normalizedLanguage = normalizeLanguageCode(languageCode);
  const previousLanguage = getCurrentUiLanguage();
  if (previousLanguage === normalizedLanguage) {
    syncLanguageSwitcherUi(normalizedLanguage);
    return;
  }
  applyContextPatch({ uiLanguage: normalizedLanguage });
  syncLanguageSwitcherUi(normalizedLanguage);
  refreshQuickActionsLanguage();
  logClient("info", "language_changed", { from: previousLanguage, to: normalizedLanguage });

  if (announce) {
    const languageLabel = LANGUAGE_LABELS[normalizedLanguage] || normalizedLanguage;
    postMessage("bot", `Language switched to ${languageLabel}.`);
    postMessage("bot", getLanguageStatusPrompt(state.flowStep));
  }
}

function showChoiceButtons(labels, onPick) {
  clearQuickActions();
  const languageCode = getCurrentUiLanguage();
  labels.forEach((label) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("data-base-label", label);
    localizeQuickActionButton(button, label, languageCode);
    button.addEventListener("click", () => onPick(label));
    quickActions.appendChild(button);
  });
}

function resolveCardBrandForDigits(rawDigits = "") {
  const digits = normalizeCardDigits(rawDigits);
  const detected = detectCardBrand(digits);
  if (detected) return detected;
  if (/^4/.test(digits)) return "visa";
  if (/^(5[1-5]|2[2-7])/.test(digits)) return "mastercard";
  if (/^3[47]/.test(digits)) return "amex";
  return "card";
}

function formatCardBrandLabel(brand = "") {
  const normalized = String(brand || "").toLowerCase();
  if (normalized === "visa") return "Visa";
  if (normalized === "mastercard") return "MasterCard";
  if (normalized === "amex") return "Amex";
  return "card";
}

function isValidPaymentCvc(cvc = "", brand = "") {
  const normalized = String(brand || "").toLowerCase();
  const digits = normalizeCardDigits(cvc);
  if (normalized === "amex") return /^\d{4}$/.test(digits);
  return /^\d{3}$/.test(digits);
}

function submitCardNumberDigits(rawDigits = "", { echo = false } = {}) {
  const digits = normalizeCardDigits(rawDigits);
  if (!isValidCardNumber16(digits)) {
    postMessage("bot", "Please enter a valid 16-digit card number using the four boxes.");
    return false;
  }
  const brand = resolveCardBrandForDigits(digits);
  applyContextPatch({
    paymentDraft: {
      brand,
      last4: digits.slice(-4),
      cardSegments: [
        digits.slice(0, 4),
        digits.slice(4, 8),
        digits.slice(8, 12),
        digits.slice(12, 16)
      ],
      cardValidated: true,
      cvc: null,
      cvcValidated: false,
      postal: null,
      postalValidated: false
    }
  });
  if (echo) {
    postMessage("user", `**** **** **** ${digits.slice(-4)}`);
  }
  transitionTo(FLOW_STEPS.PAYMENT_CARD_CVC, {}, { pushHistory: true, enforceContract: false });
  return true;
}

function renderPaymentCardSegmentInput() {
  clearQuickActions();
  const wrapper = document.createElement("div");
  wrapper.className = "card-segment-entry";

  const row = document.createElement("div");
  row.className = "card-segment-row";
  wrapper.appendChild(row);

  const seed = Array.isArray(state.context.paymentDraft?.cardSegments)
    ? [...state.context.paymentDraft.cardSegments]
    : ["", "", "", ""];
  const segments = [...seed, "", "", ""].slice(0, 4).map((segment) => normalizeCardDigits(segment).slice(0, 4));

  const continueBtn = document.createElement("button");
  continueBtn.type = "button";
  continueBtn.className = "card-segment-continue";
  continueBtn.textContent = "Continue";

  const hint = document.createElement("div");
  hint.className = "card-segment-help";
  hint.textContent = "Enter 16 digits. Example: 4111 1111 1111 1111";

  const inputs = [];
  const syncState = () => {
    applyContextPatch({
      paymentDraft: {
        cardSegments: [...segments]
      }
    });
    continueBtn.disabled = segments.join("").length !== 16;
  };

  const distributeDigits = (digits = "") => {
    const sanitized = normalizeCardDigits(digits).slice(0, 16);
    for (let i = 0; i < 4; i += 1) {
      segments[i] = sanitized.slice(i * 4, i * 4 + 4);
      if (inputs[i]) inputs[i].value = segments[i];
    }
    syncState();
  };

  for (let i = 0; i < 4; i += 1) {
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "numeric";
    input.autocomplete = "cc-number";
    input.maxLength = 4;
    input.placeholder = "0000";
    input.value = segments[i];
    input.setAttribute("aria-label", `Card digits ${i + 1}`);

    input.addEventListener("input", (event) => {
      const value = normalizeCardDigits(event.currentTarget.value).slice(0, 4);
      segments[i] = value;
      input.value = value;
      if (value.length === 4 && i < 3) {
        inputs[i + 1]?.focus();
        inputs[i + 1]?.select();
      }
      syncState();
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" && !input.value && i > 0) {
        inputs[i - 1]?.focus();
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const accepted = submitCardNumberDigits(segments.join(""), { echo: true });
        if (accepted) clearQuickActions();
      }
    });

    input.addEventListener("paste", (event) => {
      const pasted = event.clipboardData?.getData("text") || "";
      const digits = normalizeCardDigits(pasted);
      if (!digits) return;
      event.preventDefault();
      distributeDigits(digits);
      const firstIncomplete = segments.findIndex((segment) => segment.length < 4);
      const focusIdx = firstIncomplete === -1 ? 3 : firstIncomplete;
      inputs[focusIdx]?.focus();
    });

    inputs.push(input);
    row.appendChild(input);
  }

  continueBtn.addEventListener("click", () => {
    const accepted = submitCardNumberDigits(segments.join(""), { echo: true });
    if (accepted) clearQuickActions();
  });

  wrapper.appendChild(continueBtn);
  wrapper.appendChild(hint);
  quickActions.appendChild(wrapper);
  syncState();
  inputs[0]?.focus();
}

function ensureAiDisclosure() {
  if (state.context.sessionFlags?.aiDisclosureShown) return;
  postMessage(
    "bot",
    "Hi, I’m Belinda, Bell’s automated AI agent. I’m not a human representative, and I can guide you through plans, offers, and checkout."
  );
  applyContextPatch({
    sessionFlags: {
      aiDisclosureShown: true
    }
  });
}

function getEmptyPaymentDraft() {
  return {
    brand: null,
    last4: null,
    cardSegments: ["", "", "", ""],
    cardValidated: false,
    cvc: null,
    cvcValidated: false,
    postal: null,
    postalValidated: false
  };
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

function setPanelFocus(mode = "conversation") {
  const showOffers = mode === "offers" || mode === "offers_basket";
  const showBasket = mode === "basket" || mode === "offers_basket";
  const showCheckout = mode === "checkout";
  const showQuote = mode === "quote";
  const splitView = showOffers || showBasket || showCheckout || showQuote;
  panelOffers.classList.toggle("hidden", !showOffers);
  panelBasket.classList.toggle("hidden", !showBasket);
  panelCheckout.classList.toggle("hidden", !showCheckout);
  if (panelQuote) panelQuote.classList.toggle("hidden", !showQuote);
  chatWidget.classList.toggle("expanded", splitView);
  if (chatBody) {
    chatBody.classList.toggle("split-view", splitView);
    chatBody.classList.toggle("conversation-only", !splitView);
  }
}

function setStatus() {
  if (!state.context.authUser && state.context.customerType !== "new") {
    sessionStatus.textContent = "Session: not authenticated";
    showLoginSections();
    return;
  }
  if (state.context.authUser) {
    const phone = formatPhone(state.context.authMeta.phone || state.context.authUser.phone);
    sessionStatus.textContent =
      `Session: Authenticated as ${state.context.authUser.name} - Phone: ${phone}` +
      (state.context.areaCode ? ` | Area Code: ${state.context.areaCode}` : "");
    hideLoginSections();
    return;
  }

  const onboarding = state.context.newOnboarding;
  if (onboarding.fullName || onboarding.email || onboarding.phone) {
    sessionStatus.textContent =
      `Session: New Client - Name: ${onboarding.fullName || "pending"} | Email: ${onboarding.email || "pending"} | Phone: ${formatPhone(onboarding.phone)}` +
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
  const selectedLanguageInput = languageInputs.find((input) => input.checked);
  const selectedLanguage = normalizeLanguageCode(selectedLanguageInput?.value || state.context.uiLanguage || "en");
  state.flowStep = FLOW_STEPS.INIT_CONNECTING;
  state.historyStack = [];
  state.offerPageIndex = 0;
  state.pendingAuthMode = null;
  state.context = {
    sessionId: generateSessionId(),
    areaCode: null,
    areaCodeSource: null,
    areaCodeRequiredForTask: false,
    customerStatusAsked: false,
    selectedEntryIntent: null,
    uiLanguage: selectedLanguage,
    uiLanguage: "en",
    loopGuard: {
      lastStep: null,
      lastContextHash: null,
      sameStepCount: 0
    },
    pathMeta: {
      currentJourney: null,
      journeyStartedAt: null,
      journeyStatus: PATH_STATUS.IDLE
    },
    sla: {
      chatOpenedAt: null,
      firstReplyAt: null,
      intentLockedAt: null,
      offerPresentedAt: null,
      checkoutStartedAt: null,
      orderConfirmedAt: null,
      breachFlags: {
        firstReply: false,
        intentLock: false,
        offerTime: false,
        checkoutTime: false
      }
    },
    customerType: null,
    clientType: null,
    authUser: null,
    intent: null,
    selectedService: null,
    internetPreference: null,
    selectedPlanId: null,
    onboardingCombinedRaw: null,
    existingAuthAttempt: {
      name: null,
      email: null,
      phone: null,
      status: null
    },
    cardEntry: {
      brand: null,
      maskedLast4: null,
      cvcValidated: false,
      postalValidated: false,
      tokenized: false
    },
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
    serviceAddress: null,
    serviceAddressValidated: false,
    addressAuth: {
      pendingInput: null,
      suggestions: [],
      awaitingConfirmation: false
    },
    llmStatus: {
      configured: false,
      connected: false,
      model: null,
      lastCheckedAt: null
    },
    paymentDraft: {
      brand: null,
      last4: null,
      cardSegments: ["", "", "", ""],
      cardValidated: false,
      cvc: null,
      cvcValidated: false,
      postal: null,
      postalValidated: false
    },
    quoteBuilder: {
      preferences: {
        budget: 55,
        speed: 65,
        deviceCost: 35
      },
      lastPreview: [],
      lastPreviewAt: null,
      savedAt: null
    },
    newOnboarding: {
      fullName: null,
      email: null,
      phone: null,
      address: null,
      leadId: null
    },
    salesProfile: {
      serviceType: null,
      speedPriority: null,
      byodChoice: null,
      phonePreference: null,
      linePreference: null,
      callingPlan: null,
      bundleSize: null,
      stage: null,
      awaitingOfferContinuation: false,
      lastSelectedCategory: null,
      crossSellOptions: []
    },
    sessionFlags: {
      orderCompleted: false,
      aiDisclosureShown: false
    },
    discountNotice: {
      lastTierAnnounced: 0
    },
    promoState: {
      candidates: [],
      appliedPromo: null,
      lastAnnouncementKey: null
    },
    addressCaptureRetries: 0,
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
  setPanelFocus("conversation");
  syncLanguageSwitcherUi(selectedLanguage);
  refreshQuickActionsLanguage();
  setStatus();
}

function isStepValid(nextStep, ctx) {
  if (LEGACY_FLOW_STEPS.includes(nextStep)) {
    return false;
  }
  return canProceedStep(nextStep, ctx);
}

function getPatchedContext(patch = {}) {
  const next = deepClone(state.context);

  if (patch.areaCode !== undefined) next.areaCode = patch.areaCode;
  if (patch.areaCodeSource !== undefined) next.areaCodeSource = patch.areaCodeSource;
  if (patch.areaCodeRequiredForTask !== undefined) next.areaCodeRequiredForTask = patch.areaCodeRequiredForTask;
  if (patch.customerStatusAsked !== undefined) next.customerStatusAsked = patch.customerStatusAsked;
  if (patch.selectedEntryIntent !== undefined) next.selectedEntryIntent = patch.selectedEntryIntent;
  if (patch.uiLanguage !== undefined) next.uiLanguage = normalizeLanguageCode(patch.uiLanguage);
  if (patch.loopGuard) next.loopGuard = { ...next.loopGuard, ...patch.loopGuard };
  if (patch.pathMeta) next.pathMeta = { ...next.pathMeta, ...patch.pathMeta };
  if (patch.sla) next.sla = { ...next.sla, ...patch.sla };
  if (patch.sessionFlags) next.sessionFlags = { ...next.sessionFlags, ...patch.sessionFlags };
  if (patch.discountNotice) next.discountNotice = { ...next.discountNotice, ...patch.discountNotice };
  if (patch.promoState) next.promoState = { ...next.promoState, ...patch.promoState };
  if (patch.customerType !== undefined) next.customerType = patch.customerType;
  if (patch.clientType !== undefined) next.clientType = patch.clientType;
  if (patch.authUser !== undefined) next.authUser = patch.authUser;
  if (patch.intent !== undefined) next.intent = patch.intent;
  if (patch.selectedService !== undefined) next.selectedService = patch.selectedService;
  if (patch.internetPreference !== undefined) next.internetPreference = patch.internetPreference;
  if (patch.selectedPlanId !== undefined) next.selectedPlanId = patch.selectedPlanId;
  if (patch.onboardingCombinedRaw !== undefined) next.onboardingCombinedRaw = patch.onboardingCombinedRaw;
  if (patch.existingAuthAttempt) next.existingAuthAttempt = { ...next.existingAuthAttempt, ...patch.existingAuthAttempt };
  if (patch.cardEntry) next.cardEntry = { ...next.cardEntry, ...patch.cardEntry };
  if (patch.activeTask !== undefined) next.activeTask = patch.activeTask;
  if (patch.clarifyRetries !== undefined) next.clarifyRetries = patch.clarifyRetries;
  if (patch.escalatedToAgent !== undefined) next.escalatedToAgent = patch.escalatedToAgent;
  if (patch.agentRating !== undefined) next.agentRating = patch.agentRating;
  if (patch.agentFeedback !== undefined) next.agentFeedback = patch.agentFeedback;
  if (patch.addressCaptureRetries !== undefined) next.addressCaptureRetries = patch.addressCaptureRetries;
  if (patch.basket !== undefined) next.basket = patch.basket;
  if (patch.serviceAddress !== undefined) next.serviceAddress = patch.serviceAddress;
  if (patch.serviceAddressValidated !== undefined) next.serviceAddressValidated = patch.serviceAddressValidated;
  if (patch.addressAuth) next.addressAuth = { ...next.addressAuth, ...patch.addressAuth };
  if (patch.llmStatus) next.llmStatus = { ...next.llmStatus, ...patch.llmStatus };
  if (patch.paymentDraft) next.paymentDraft = { ...next.paymentDraft, ...patch.paymentDraft };
  if (patch.quoteBuilder) next.quoteBuilder = { ...next.quoteBuilder, ...patch.quoteBuilder };
  if (patch.payment) next.payment = { ...next.payment, ...patch.payment };
  if (patch.financing) next.financing = { ...next.financing, ...patch.financing };
  if (patch.shipping) next.shipping = { ...next.shipping, ...patch.shipping };
  if (patch.newOnboarding) next.newOnboarding = { ...next.newOnboarding, ...patch.newOnboarding };
  if (patch.salesProfile) next.salesProfile = { ...next.salesProfile, ...patch.salesProfile };
  if (patch.supportCase) next.supportCase = { ...next.supportCase, ...patch.supportCase };
  if (patch.corporateProfile) next.corporateProfile = { ...next.corporateProfile, ...patch.corporateProfile };
  if (patch.deviceSelection) next.deviceSelection = { ...next.deviceSelection, ...patch.deviceSelection };
  if (patch.authMeta) next.authMeta = { ...next.authMeta, ...patch.authMeta };

  if (patch.customerType === "new") {
    next.authUser = null;
    next.existingAuthAttempt = {
      name: null,
      email: null,
      phone: null,
      status: null
    };
    next.authMeta = {
      mode: next.authMeta?.mode === "new-client" ? "new-client" : null,
      phone: next.newOnboarding?.phone || null,
      email: next.newOnboarding?.email || null,
      secureRef: next.authMeta?.mode === "new-client" ? next.authMeta?.secureRef || null : null
    };
    next.payment = {
      method: null,
      expectedLast4: null,
      last4Confirmed: false,
      cvvValidated: false,
      verified: false,
      token: null
    };
    next.cardEntry = {
      brand: null,
      maskedLast4: null,
      cvcValidated: false,
      postalValidated: false,
      tokenized: false
    };
  }

  if (patch.customerType === "existing") {
    next.clientType = next.clientType || "personal";
  }

  return next;
}

function applyContextPatch(patch = {}) {
  state.context = getPatchedContext(patch);
}

function transitionTo(nextStep, patchContext = {}, { pushHistory = true, enforceContract = true } = {}) {
  if (LEGACY_FLOW_STEPS.includes(nextStep)) {
    logClient("error", "invalid_flow_transition", { from: state.flowStep, to: nextStep, reason: "legacy_step_deprecated" });
    postMessage("bot", "That step is no longer available. I will keep you in the current flow.");
    return;
  }

  const contract = STEP_CONTRACT[state.flowStep];
  if (
    enforceContract &&
    contract?.allowedNext?.length &&
    nextStep !== state.flowStep &&
    nextStep !== contract.fallbackTarget &&
    !contract.allowedNext.includes(nextStep)
  ) {
    logClient("error", "invalid_flow_transition", {
      from: state.flowStep,
      to: nextStep,
      reason: "step_contract_violation",
      fallbackTarget: contract.fallbackTarget
    });
    const fallback = contract.fallbackTarget || state.flowStep;
    if (fallback !== state.flowStep) {
      transitionTo(fallback, {}, { pushHistory: false });
      return;
    }
    postMessage("bot", "I need one clarification before moving to the next step.");
    renderStep(state.flowStep);
    return;
  }

  const nextContext = getPatchedContext(patchContext);
  if (!isStepValid(nextStep, nextContext)) {
    logClient("error", "invalid_flow_transition", {
      from: state.flowStep,
      to: nextStep,
      context: { areaCode: state.context.areaCode, customerType: state.context.customerType }
    });
    finishPath(PATH_STATUS.FAILED, { reason: "invalid_transition", to: nextStep });
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
  const guard = nextLoopGuard(
    state.context.loopGuard,
    nextStep,
    stableContextHash(state.context),
    3
  );
  state.context.loopGuard = {
    lastStep: guard.lastStep,
    lastContextHash: guard.lastContextHash,
    sameStepCount: guard.sameStepCount
  };
  if (guard.stuck) {
    logClient("info", "flow_loop_detected", {
      step: nextStep,
      sameStepCount: guard.sameStepCount
    });
  }
  const prev = state.flowStep;
  state.flowStep = nextStep;
  trackSlaTransition(nextStep);
  logClient("info", "flow_transition", { from: prev, to: nextStep, patchContext });
  renderStep(nextStep);
}

function goBack() {
  if (state.historyStack.length === 0) {
    postMessage("bot", "No previous step is available. Do you want to login, restart, or continue current step?");
    logClient("info", "flow_clarify_prompt", { reason: "back_no_history", current: state.flowStep });
    showChoiceButtons(["Login", "Restart", "Continue"], (choice) => {
      if (choice === "Login") {
        transitionTo(
          FLOW_STEPS.EXISTING_AUTH_ENTRY,
          { customerType: "existing", selectedService: "internet", intent: "home internet" },
          { pushHistory: false, enforceContract: false }
        );
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

function getFilteredOffersForCategory(category, { maxResults = 3 } = {}) {
  const categoryOffers = offers.filter((offer) => offer.category === category);
  let filtered = [...categoryOffers];
  if (state.context.intent && state.context.intent !== "bundle" && state.context.salesProfile.stage !== "cross_sell") {
    filtered = filtered.filter((offer) => offer.category === state.context.intent);
  }
  if (category === "mobility" && state.context.deviceSelection.osType) {
    filtered = filtered.filter((offer) => offer.osType === state.context.deviceSelection.osType);
  }
  if (category === "mobility" && state.context.salesProfile.phonePreference) {
    const pref = state.context.salesProfile.phonePreference.toLowerCase();
    filtered = filtered.filter((offer) => {
      if (pref.includes("iphone")) return offer.osType === "ios";
      if (pref.includes("samsung") || pref.includes("android")) return offer.osType === "android";
      if (pref.includes("pixel")) return (offer.deviceModel || "").toLowerCase().includes("pixel");
      return true;
    });
  }
  if (category === "home internet" && state.context.salesProfile.speedPriority) {
    const pref = state.context.salesProfile.speedPriority.toLowerCase();
    filtered = filtered.filter((offer) => {
      if (pref.includes("fast")) return offer.monthlyPrice >= 95;
      if (pref.includes("upload")) return offer.description.toLowerCase().includes("upload");
      return true;
    });
  }
  if (category === "mobility" && state.context.salesProfile.byodChoice) {
    const isByod = state.context.salesProfile.byodChoice === "byod";
    filtered = filtered.filter((offer) => Boolean(offer.byodEligible) === isByod);
  }
  if (category === "landline" && state.context.salesProfile.linePreference) {
    filtered = filtered.filter((offer) => {
      const lineSupport = Array.isArray(offer.lineSupport) ? offer.lineSupport : ["new_line"];
      return lineSupport.includes(state.context.salesProfile.linePreference);
    });
  }
  if (category === "landline" && state.context.salesProfile.callingPlan) {
    const wantsInternational = /international/i.test(state.context.salesProfile.callingPlan);
    filtered = filtered.filter((offer) => {
      if (!offer.callingProfile) return true;
      if (wantsInternational) return offer.callingProfile === "international" || offer.callingProfile === "both";
      return offer.callingProfile === "local" || offer.callingProfile === "both";
    });
  }

  if (filtered.length < 3) {
    const seen = new Set(filtered.map((offer) => offer.id));
    const topUp = categoryOffers.filter((offer) => !seen.has(offer.id));
    filtered = [...filtered, ...topUp];
  }
  return filtered.slice(0, maxResults);
}

function shouldInlineOfferCategory(category = "") {
  return category === "mobility" || category === "landline";
}

function getActiveOfferCategory() {
  state.offerPageIndex = Math.max(0, Math.min(state.offerPageIndex, CATEGORY_PAGES.length - 1));
  return CATEGORY_PAGES[state.offerPageIndex];
}

function shouldRenderInlineOfferFlow() {
  const category = getActiveOfferCategory();
  return shouldInlineOfferCategory(category);
}

function presentInlineOfferChoices(category = getActiveOfferCategory()) {
  const filtered = getFilteredOffersForCategory(category, { maxResults: 3 });
  if (filtered.length === 0) {
    postMessage("bot", "I couldn’t find offers for this category right now. Please try another service.");
    return;
  }
  const categoryLabel = CATEGORY_LABELS[category] || category;
  postMessage("bot", `Here are ${categoryLabel} offers I can add for you now:`);
  filtered.forEach((offer, index) => {
    const stockNotice =
      offer.category === "mobility" && offer.offerType === "device"
        ? getOfferStockState(offer)
          ? " (In stock)"
          : " (Out of stock, alternatives available)"
        : "";
    postMessage(
      "bot",
      `${index + 1}. ${offer.name} - ${currency(offer.monthlyPrice)}/month${stockNotice}. ${offer.description}`
    );
  });
  const labels = filtered.map((offer) => `Add ${offer.name}`);
  if (state.context.basket.length > 0) {
    labels.push("That is all, continue");
  }
  showChoiceButtons(labels, (choice) => {
    postMessage("user", choice);
    if (choice === "That is all, continue") {
      handleOfferContinuationChoice(choice);
      return;
    }
    const selected = filtered.find((offer) => choice === `Add ${offer.name}`);
    if (!selected) return;
    addOfferToBasket(selected);
  });
}

function renderCarouselPage() {
  state.offerPageIndex = Math.max(0, Math.min(state.offerPageIndex, CATEGORY_PAGES.length - 1));
  const category = CATEGORY_PAGES[state.offerPageIndex];
  const filtered = getFilteredOffersForCategory(category, { maxResults: 3 });

  carousel.innerHTML = "";
  filtered.forEach((offer) => {
    const card = document.createElement("article");
    card.className = "product-card";
    const deviceStockState =
      offer.category === "mobility" && offer.offerType === "device"
        ? (getOfferStockState(offer) ? "In stock" : "Out of stock - alternatives available")
        : "";
    const deviceStockClass =
      offer.category === "mobility" && offer.offerType === "device" && !getOfferStockState(offer)
        ? " out"
        : "";
    card.innerHTML = `
      <div class="product-category">${offer.category}</div>
      <div class="product-name">${offer.name}</div>
      <div class="product-meta">${offer.description}</div>
      ${deviceStockState ? `<div class="product-stock${deviceStockClass}">${deviceStockState}</div>` : ""}
      <div class="product-price">${currency(offer.monthlyPrice)}/month</div>
    `;

    const addBtn = document.createElement("button");
    addBtn.textContent =
      offer.category === "mobility" && offer.offerType === "device" && !getOfferStockState(offer)
        ? "See alternatives"
        : "Add to basket";
    addBtn.addEventListener("click", () => {
      addOfferToBasket(offer);
    });

    card.appendChild(addBtn);
    carousel.appendChild(card);
  });

  carouselPageLabel.textContent = `Page ${state.offerPageIndex + 1} of ${CATEGORY_PAGES.length}`;
  carouselPrevBtn.disabled = state.offerPageIndex === 0;
  carouselNextBtn.disabled = state.offerPageIndex === CATEGORY_PAGES.length - 1;
}

function getOfferById(id) {
  return offers.find((offer) => offer.id === id) || null;
}

function getOfferStockState(offer) {
  if (!offer) return false;
  if (typeof offer.inStock === "boolean") return offer.inStock;
  if (typeof offer.inventoryCount === "number") return offer.inventoryCount > 0;
  return true;
}

function getInStockAlternatives(offer, limit = 3) {
  const alternatives = [];
  const seen = new Set();
  (offer.alternativeOfferIds || []).forEach((id) => {
    const alt = getOfferById(id);
    if (!alt || seen.has(alt.id)) return;
    if (alt.category !== offer.category) return;
    if (!getOfferStockState(alt)) return;
    alternatives.push(alt);
    seen.add(alt.id);
  });

  if (alternatives.length < limit) {
    offers
      .filter((item) => item.category === offer.category && item.id !== offer.id && !seen.has(item.id))
      .filter((item) => getOfferStockState(item))
      .forEach((item) => {
        if (alternatives.length >= limit) return;
        alternatives.push(item);
        seen.add(item.id);
      });
  }

  return alternatives.slice(0, limit);
}

function presentStockAlternatives(offer) {
  const alternatives = getInStockAlternatives(offer, 3);
  if (alternatives.length === 0) {
    postMessage("bot", `${offer.name} is currently out of stock. Please choose another mobility offer.`);
    showChoiceButtons(["Show mobility offers"], (choice) => {
      postMessage("user", choice);
      routeToCrossSellCategory("mobility");
    });
    return;
  }

  postMessage("bot", `${offer.name} is currently out of stock. Here are similar in-stock options:`);
  const labels = alternatives.map((alt) => `Switch to ${alt.name}`).concat(["Show mobility offers"]);
  showChoiceButtons(labels, (choice) => {
    postMessage("user", choice);
    if (choice === "Show mobility offers") {
      routeToCrossSellCategory("mobility");
      return;
    }
    const selected = alternatives.find((alt) => choice === `Switch to ${alt.name}`);
    if (!selected) return;
    logClient("info", "stock_alternative_selected", { fromOfferId: offer.id, toOfferId: selected.id });
    addOfferToBasket(selected, { fromAlternative: true });
  });
}

function addOfferToBasket(offer, { fromAlternative = false } = {}) {
  if (offer.category === "mobility" && offer.financingEligible) {
    const inStock = getOfferStockState(offer);
    if (!inStock) {
      logClient("info", "stock_check_failed", {
        offerId: offer.id,
        inventoryCount: offer.inventoryCount ?? null
      });
      presentStockAlternatives(offer);
      return;
    }
    logClient("info", "stock_check_passed", {
      offerId: offer.id,
      inventoryCount: offer.inventoryCount ?? null
    });
  }

  const previousCount = state.context.basket.length;
  const basket = [...state.context.basket, offer];
  applyContextPatch({ basket });
  renderBasket();
  if (state.flowStep === FLOW_STEPS.OFFER_BROWSE && shouldRenderInlineOfferFlow()) {
    setPanelFocus("conversation");
  } else {
    setPanelFocus("offers_basket");
  }
  postMessage("bot", `Added ${offer.name} to your basket.`);
  logClient("info", "basket_item_added", { offerId: offer.id, basketSize: basket.length, fromAlternative });
  announceDiscountQualification(previousCount, basket.length);
  refreshPromoState({ announce: true, basketOrIntent: basket });
  if (offer.category === "mobility") {
    logClient("info", "device_offer_selected", { offerId: offer.id, osType: offer.osType, deviceModel: offer.deviceModel });
  }
  promptOfferContinuation(offer);
}

function getRemainingCrossSellCategories(selectedCategory = null) {
  const selected = new Set((state.context.basket || []).map((item) => item.category));
  if (selectedCategory) selected.add(selectedCategory);
  const remaining = CATEGORY_PAGES.filter((category) => !selected.has(category));
  if (remaining.length > 0) return remaining;
  return CATEGORY_PAGES.filter((category) => category !== selectedCategory);
}

function presentCrossSellChoices() {
  const options =
    state.context.salesProfile.crossSellOptions?.length > 0
      ? state.context.salesProfile.crossSellOptions
      : getRemainingCrossSellCategories(state.context.salesProfile.lastSelectedCategory);
  if (!options.length) {
    postMessage("bot", "You already have all major service categories in your basket. Continue when you are ready.");
    showChoiceButtons(["That is all, continue"], (choice) => {
      postMessage("user", choice);
      handleOfferContinuationChoice(choice);
    });
    return;
  }
  const optionText = options.map((category) => CATEGORY_LABELS[category]).join(" or ");
  const labels = ["That is all, continue", ...options.map((category) => CATEGORY_CHOICE_LABELS[category])];
  postMessage("bot", `Sure, I can add more. Do you want ${optionText} offers next?`);
  showChoiceButtons(labels, (choice) => {
    postMessage("user", choice);
    handleOfferContinuationChoice(choice);
  });
}

function routeToCrossSellCategory(category) {
  const remainingOptions = getRemainingCrossSellCategories(category);
  if (category === "mobility" && !state.context.salesProfile.byodChoice) {
    postMessage("bot", "Before I show mobility offers, are you bringing your own phone?");
    showChoiceButtons(["Yes, bring my own phone", "No, I need a new phone"], (choice) => {
      postMessage("user", choice);
      const byodChoice = choice.startsWith("Yes") ? "byod" : "new_device";
      const phonePreference = byodChoice === "byod" ? "BYOD" : null;
      applyContextPatch({ salesProfile: { byodChoice, phonePreference } });
      routeToCrossSellCategory("mobility");
    });
    return true;
  }
  if (category === "landline" && !state.context.salesProfile.linePreference) {
    postMessage("bot", "Before I show landline offers, do you need a new line or do you want to keep your existing number?");
    showChoiceButtons(["New line", "Keep existing number"], (choice) => {
      postMessage("user", choice);
      const linePreference = choice.startsWith("Keep") ? "keep_existing" : "new_line";
      applyContextPatch({ salesProfile: { linePreference } });
      routeToCrossSellCategory("landline");
    });
    return true;
  }
  if (category === "landline" && !state.context.salesProfile.callingPlan) {
    postMessage("bot", "For landline, do you prefer local calling or international minutes?");
    showChoiceButtons(["Local calling", "International minutes"], (choice) => {
      postMessage("user", choice);
      applyContextPatch({ salesProfile: { callingPlan: choice } });
      routeToCrossSellCategory("landline");
    });
    return true;
  }
  applyContextPatch({
    salesProfile: {
      stage: "cross_sell",
      awaitingOfferContinuation: false,
      lastSelectedCategory: category,
      crossSellOptions: remainingOptions
    }
  });
  if (category === "home internet") {
    state.offerPageIndex = 1;
    renderCarouselPage();
    postMessage("bot", "Showing internet offers. Add any option you want.");
    if (state.flowStep === FLOW_STEPS.OFFER_BROWSE && shouldRenderInlineOfferFlow()) {
      presentInlineOfferChoices("home internet");
    }
    return true;
  }
  if (category === "landline") {
    state.offerPageIndex = 2;
    renderCarouselPage();
    postMessage("bot", "Showing landline offers in chat. Add any option you want.");
    if (state.flowStep === FLOW_STEPS.OFFER_BROWSE) {
      presentInlineOfferChoices("landline");
    }
    return true;
  }
  if (category === "mobility") {
    state.offerPageIndex = 0;
    renderCarouselPage();
    postMessage("bot", "Showing mobility offers in chat. Add any option you want.");
    if (state.flowStep === FLOW_STEPS.OFFER_BROWSE) {
      presentInlineOfferChoices("mobility");
    }
    return true;
  }
  return false;
}

function handleOfferContinuationChoice(choice) {
  const normalized = String(choice || "").trim().toLowerCase();
  if (
    normalized === "yes" ||
    normalized.includes("that is all") ||
    normalized.includes("that's all") ||
    normalized.includes("continue") ||
    normalized.includes("checkout") ||
    normalized.includes("proceed")
  ) {
    applyContextPatch({
      salesProfile: {
        awaitingOfferContinuation: false,
        lastSelectedCategory: null,
        crossSellOptions: []
      }
    });
    transitionTo(FLOW_STEPS.BASKET_REVIEW, {}, { pushHistory: true });
    return true;
  }
  if (normalized.includes("add mobility") || normalized.includes("mobility")) {
    return routeToCrossSellCategory("mobility");
  }
  if (normalized.includes("add internet") || normalized.includes("home internet") || normalized.includes("internet")) {
    return routeToCrossSellCategory("home internet");
  }
  if (normalized.includes("add landline") || normalized.includes("landline") || normalized.includes("home phone")) {
    return routeToCrossSellCategory("landline");
  }
  return false;
}

function promptOfferContinuation(selectedOffer) {
  const selectedCategory = selectedOffer?.category || "";
  const remainingOptions = getRemainingCrossSellCategories(selectedCategory);
  const prompt =
    remainingOptions.length > 0
      ? `Great choice. Is that everything for now, or would you like to add ${remainingOptions
          .map((category) => CATEGORY_LABELS[category])
          .join(" or ")} as well?`
      : "Great choice. Is that everything for now?";
  const choices = ["That is all, continue", ...remainingOptions.map((category) => CATEGORY_CHOICE_LABELS[category])];

  applyContextPatch({
    salesProfile: {
      awaitingOfferContinuation: true,
      lastSelectedCategory: selectedCategory,
      crossSellOptions: remainingOptions
    }
  });
  postMessage("bot", prompt);
  showChoiceButtons(choices, (choice) => {
    postMessage("user", choice);
    if (!handleOfferContinuationChoice(choice)) {
      presentCrossSellChoices();
    }
  });
}

function renderBasket() {
  basketList.innerHTML = "";
  state.context.basket.forEach((item, idx) => {
    const li = document.createElement("li");
    li.className = "basket-item";
    li.innerHTML = `<span>${idx + 1}. ${item.name}</span><span>${currency(item.monthlyPrice)}</span>`;
    basketList.appendChild(li);
  });

  const { serviceMonthlyBase, bundleDiscount, serviceMonthly, discountRate } = getCheckoutTotals();
  if (bundleDiscount > 0) {
    basketTotal.textContent = `Subtotal: ${currency(serviceMonthlyBase)}/month | Discount: ${currency(bundleDiscount)} (${Math.round(discountRate * 100)}%) | Total: ${currency(serviceMonthly)}/month`;
  } else {
    basketTotal.textContent = `Total: ${currency(serviceMonthlyBase)}/month`;
  }
  validateBtn.disabled = !canAccessOfferBrowse(state.context) || state.context.basket.length === 0;
}

function detectIntentFallback(text = "") {
  return parseSalesIntentDeterministic(text);
}

async function detectIntent(message) {
  try {
    const response = await fetch("/api/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        sessionId: state.context.sessionId,
        step: state.flowStep
      })
    });
    if (!response.ok) throw new Error("intent endpoint failed");
    const payload = await response.json();
    if (payload.mode) {
      logClient("info", "llm_mode", {
        mode: payload.mode,
        confidence: Number(payload.confidence || 0),
        intent: payload.intent || null
      });
    }
    if (payload.mode === "llm") {
      applyContextPatch({ llmStatus: { configured: true, connected: true, model: state.context.llmStatus.model || "gpt-4.1-mini" } });
      updateLlmStatusUi({ ...state.context.llmStatus, configured: true, connected: true, model: state.context.llmStatus.model || "gpt-4.1-mini" });
    } else if (String(payload.mode || "").includes("fallback")) {
      applyContextPatch({ llmStatus: { configured: true, connected: false } });
      updateLlmStatusUi({ ...state.context.llmStatus, configured: true, connected: false });
    }
    if (payload.fallbackUsed) {
      logClient("info", "llm_fallback_used", {
        mode: payload.mode,
        confidence: Number(payload.confidence || 0)
      });
    }
    return {
      intent: payload.intent || detectIntentFallback(message),
      confidence: Number(payload.confidence || 0),
      entities: payload.entities || {},
      mode: payload.mode || "unknown",
      fallbackUsed: Boolean(payload.fallbackUsed)
    };
  } catch {
    logClient("info", "llm_fallback_used", { mode: "network_error" });
    return {
      intent: detectIntentFallback(message),
      confidence: 0.55,
      entities: {},
      mode: "network_error",
      fallbackUsed: true
    };
  }
}

function resolveUserFromIdentifier(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return null;

  if (value.includes("@")) {
    return (
      mockUsers.find(
        (user) =>
          user.email.toLowerCase() === value ||
          (Array.isArray(user.emailAliases) && user.emailAliases.some((alias) => alias.toLowerCase() === value))
      ) || null
    );
  }

  const nameId = existingNameToUser[value];
  if (nameId) return mockUsers.find((u) => u.id === nameId) || null;

  const digits = normalizeCanadianPhone(value);
  if (!digits) return null;
  const userId = phonePrefixToUser[digits.slice(0, 3)];
  if (!userId) return null;
  return mockUsers.find((u) => u.id === userId) || null;
}

function normalizeEntryIntent(value = "") {
  const lower = String(value || "").toLowerCase();
  if (
    lower.includes("product") ||
    lower.includes("upgrade") ||
    lower.includes("sales") ||
    lower.includes("mobility") ||
    lower.includes("internet") ||
    lower.includes("landline") ||
    lower.includes("bundle")
  ) return "sales";
  return "sales";
}

function routeHelpdeskSelection(choice, { pushHistory = true } = {}) {
  const serviceIntent = parseSalesIntentDeterministic(choice);
  if (!serviceIntent) return false;
  const pageMap = { mobility: 0, "home internet": 1, landline: 2, bundle: 0 };
  state.offerPageIndex = pageMap[serviceIntent] ?? 0;
  const selectedEntryIntent =
    serviceIntent === "home internet"
      ? "Internet"
      : serviceIntent === "landline"
        ? "Landline"
        : serviceIntent === "bundle"
          ? "Bundle"
          : "Mobility";
  transitionTo(
    FLOW_STEPS.INTENT_DISCOVERY,
    {
      selectedEntryIntent,
      intent: serviceIntent,
      activeTask: "sales",
      sessionFlags: {
        orderCompleted: false
      },
      salesProfile: {
        serviceType: serviceIntent,
        speedPriority: null,
        byodChoice: null,
        phonePreference: null,
        linePreference: null,
        callingPlan: null,
        bundleSize: null,
        stage: null,
        awaitingOfferContinuation: false,
        lastSelectedCategory: null,
        crossSellOptions: []
      },
      promoState: {
        candidates: [],
        appliedPromo: null,
        lastAnnouncementKey: null
      }
    },
    { pushHistory }
  );
  return true;
}

function startPath(route) {
  const current = state.context.pathMeta.currentJourney;
  if (current === route && state.context.pathMeta.journeyStatus === PATH_STATUS.IN_PROGRESS) return;
  applyContextPatch({
    pathMeta: {
      currentJourney: route,
      journeyStartedAt: new Date().toISOString(),
      journeyStatus: PATH_STATUS.IN_PROGRESS
    }
  });
  logClient("info", "path_started", { route });
}

function finishPath(status, details = {}) {
  if (!state.context.pathMeta.currentJourney) return;
  const route = state.context.pathMeta.currentJourney;
  applyContextPatch({
    pathMeta: {
      ...state.context.pathMeta,
      journeyStatus: status
    }
  });
  const event = status === PATH_STATUS.COMPLETED ? "path_completed" : "path_failed";
  logClient(status === PATH_STATUS.COMPLETED ? "info" : "error", event, { route, ...details });
}

function continueFromSelectedIntent({ pushHistory = true } = {}) {
  const intent = normalizeEntryIntent(state.context.selectedEntryIntent || state.context.activeTask || "");
  startPath(intent);
  if (intent === "sales") {
    if (state.context.selectedService === "internet" || state.context.intent === "home internet") {
      if (!state.context.serviceAddress || !state.context.serviceAddressValidated) {
        transitionTo(FLOW_STEPS.INTERNET_ADDRESS_REQUEST, { activeTask: "sales" }, { pushHistory, enforceContract: false });
        return;
      }
      if (!state.context.internetPreference) {
        transitionTo(FLOW_STEPS.INTERNET_PRIORITY_CAPTURE, { activeTask: "sales" }, { pushHistory, enforceContract: false });
        return;
      }
      if (!state.context.selectedPlanId) {
        transitionTo(FLOW_STEPS.INTERNET_PLAN_PITCH, { activeTask: "sales" }, { pushHistory, enforceContract: false });
        return;
      }
      transitionTo(FLOW_STEPS.PLAN_CONFIRMATION, { activeTask: "sales" }, { pushHistory, enforceContract: false });
      return;
    }
    if (state.context.intent && canAccessOfferBrowse(state.context)) {
      transitionTo(FLOW_STEPS.OFFER_BROWSE, { activeTask: "sales" }, { pushHistory });
      return;
    }
    if (state.context.intent) {
      transitionTo(FLOW_STEPS.SERVICE_CLARIFICATION, { activeTask: "sales" }, { pushHistory, enforceContract: false });
      return;
    }
    transitionTo(FLOW_STEPS.INTENT_DISCOVERY, { activeTask: "sales" }, { pushHistory });
    return;
  }
  if (intent === "hardware") {
    transitionTo(FLOW_STEPS.HARDWARE_TROUBLESHOOT, { activeTask: "hardware" }, { pushHistory });
    return;
  }
  if (intent === "corporate_support") {
    applyContextPatch({ clientType: "corporate" });
    transitionTo(FLOW_STEPS.CORPORATE_DISCOVERY, { activeTask: "corporate_support" }, { pushHistory });
    return;
  }
  transitionTo(FLOW_STEPS.SUPPORT_DISCOVERY, { activeTask: "support" }, { pushHistory });
}

function routeAfterSalesClarification({ pushHistory = true } = {}) {
  if (state.context.intent === "home internet") {
    if (!state.context.serviceAddress || !state.context.serviceAddressValidated) {
      transitionTo(FLOW_STEPS.INTERNET_ADDRESS_REQUEST, { activeTask: "sales" }, { pushHistory, enforceContract: false });
      return;
    }
    if (!state.context.internetPreference) {
      transitionTo(FLOW_STEPS.INTERNET_PRIORITY_CAPTURE, { activeTask: "sales" }, { pushHistory, enforceContract: false });
      return;
    }
    transitionTo(FLOW_STEPS.INTERNET_PLAN_PITCH, { activeTask: "sales" }, { pushHistory, enforceContract: false });
    return;
  }
  if (canAccessOfferBrowse(state.context)) {
    transitionTo(
      FLOW_STEPS.OFFER_BROWSE,
      {
        activeTask: "sales",
        sessionFlags: { orderCompleted: false }
      },
      { pushHistory, enforceContract: false }
    );
    return;
  }
  transitionTo(
    FLOW_STEPS.NEW_ONBOARD_NAME,
    {
      customerType: "new",
      sessionFlags: { orderCompleted: false }
    },
    { pushHistory }
  );
}

async function finalizeExistingAuthentication(user, mode, rawIdentifier = "", { routeAfterAuth = true } = {}) {
  const contact = inferAuthContact(user, rawIdentifier);
  user.authenticated = true;
  const derivedAreaCode = deriveAreaCodeFromProfile(user, contact.phone);

  const hash = await createIdentityHash(`${user.id}|${contact.phone || ""}|${contact.email || ""}|${Date.now()}`);
  const secureRef = `${generateSecureRef()}-${hash}`;
  applyContextPatch({
    customerType: "existing",
    clientType: state.context.clientType || "personal",
    authUser: user,
    areaCode: state.context.areaCode || derivedAreaCode,
    areaCodeSource: state.context.areaCode ? state.context.areaCodeSource || "user_input" : (derivedAreaCode ? "profile" : null),
    serviceAddress: state.context.serviceAddress || user.prefilledAddress || null,
    serviceAddressValidated: Boolean(state.context.serviceAddressValidated && state.context.serviceAddress),
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
    `Authentication successful. ${user.name} verified. ${contactLabel}.`
  );
  if (routeAfterAuth) {
    continueFromSelectedIntent({ pushHistory: true });
  }
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

  if (state.context.customerType === "existing" && user?.savedCardLast4) {
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

  if (method === "existing" && state.context.customerType !== "existing") {
    postMessage("bot", "Saved payment is available only for existing authenticated clients.");
    logClient("error", "payment_existing_blocked_new_customer", { customerType: state.context.customerType || "unknown" });
    transitionTo(FLOW_STEPS.PAYMENT_METHOD, {}, { pushHistory: false });
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

function mapPaymentMethodLabel(method, user) {
  if (method === "smart_financing") return "Bell Smart Financing";
  if (method === "device_upfront") return "Device paid upfront";
  if (method === "existing") {
    const type = user?.savedCardType ? user.savedCardType.toUpperCase() : "Saved card";
    return `Saved ${type}`;
  }
  if (method === "mastercard") return "MasterCard";
  if (method === "amex") return "Amex";
  if (method === "visa") return "Visa";
  return "Payment card";
}

function getMaskedPaymentAccount(method, expectedLast4, user, financingDecisionId) {
  if (method === "smart_financing") {
    return financingDecisionId ? `Decision ${financingDecisionId}` : "Financing account";
  }
  if (method === "device_upfront") return expectedLast4 ? `Card ending ${expectedLast4}` : "Paid upfront";
  const fallbackLast4 = user?.savedCardLast4 || expectedLast4;
  if (!fallbackLast4) return "Not provided";
  return `**** ${fallbackLast4}`;
}

function generateFinancingDecisionId() {
  return `FIN-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function getCheckoutTotals() {
  const serviceMonthlyBase = state.context.basket.reduce((sum, item) => sum + item.monthlyPrice, 0);
  const itemCount = state.context.basket.length;
  const discountRate = getBundleDiscountRate(itemCount);
  const bundleDiscount = Number((serviceMonthlyBase * discountRate).toFixed(2));
  const serviceMonthly = Number((serviceMonthlyBase - bundleDiscount).toFixed(2));
  const financingMonthly = state.context.financing.selected ? state.context.financing.monthlyPayment : 0;
  const combinedMonthly = calculateCombinedMonthly(serviceMonthly, financingMonthly);
  const installationFees = calculateInstallationFees(state.context.basket);
  const deviceDueToday =
    state.context.payment.method === "device_upfront"
      ? getFinancingAmount(state.context.basket)
      : state.context.financing.upfrontPayment || 0;
  const chargeToday = Number((installationFees + deviceDueToday).toFixed(2));
  return { serviceMonthlyBase, bundleDiscount, discountRate, serviceMonthly, financingMonthly, combinedMonthly, installationFees, chargeToday };
}

function getCurrentSeason(now = new Date()) {
  const month = now.getMonth() + 1;
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "fall";
  return "winter";
}

function toDiscountTierPercent(itemCount) {
  const rate = getBundleDiscountRate(itemCount);
  return Math.round(rate * 100);
}

function formatPromotionBenefit(promo) {
  if (!promo) return "";
  if (promo.benefitType === "percent") return `${Math.round(Number(promo.benefitValue || 0) * 100)}% off`;
  if (promo.benefitType === "fixed_credit") return `${currency(Number(promo.benefitValue || 0))} credit`;
  return "bonus feature";
}

function getPromoTargetCategories(context = state.context, basketOrIntent = null) {
  if (Array.isArray(basketOrIntent)) {
    const fromBasket = [...new Set(basketOrIntent.map((item) => item.category).filter(Boolean))];
    if (fromBasket.length > 0) return fromBasket;
  }
  if (typeof basketOrIntent === "string" && basketOrIntent) return [basketOrIntent];
  const fromContextBasket = [...new Set((context.basket || []).map((item) => item.category).filter(Boolean))];
  if (fromContextBasket.length > 0) return fromContextBasket;
  if (context.intent) return [context.intent];
  return [];
}

function getEligiblePromos(context = state.context, basketOrIntent = null) {
  const targetCategories = getPromoTargetCategories(context, basketOrIntent);
  const season = getCurrentSeason();
  const returningClient = Boolean(context.authUser || context.customerType === "existing");
  const customerType = context.customerType || (context.authUser ? "existing" : null);
  const eligible = promotions
    .filter((promo) => {
      if (!promo.applicableCategories?.some((category) => targetCategories.includes(category))) return false;
      if (promo.eligibility?.customerType && promo.eligibility.customerType !== customerType) return false;
      if (promo.eligibility?.returningClient && !returningClient) return false;
      if (promo.eligibility?.season && promo.eligibility.season !== season) return false;
      return true;
    })
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))
    .slice(0, 5);
  return eligible;
}

function selectBestPromo(candidates = []) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  return candidates[0];
}

function renderPromoMessage(candidates = [], appliedPromo = null) {
  if (!candidates.length) return;
  const candidateLine = candidates
    .map((promo) => `${promo.title} (${formatPromotionBenefit(promo)})`)
    .join(" | ");
  postMessage("bot", `Here are your matched exclusive offers: ${candidateLine}.`);
  if (appliedPromo) {
    postMessage(
      "bot",
      `Applied best offer: ${appliedPromo.title} (${formatPromotionBenefit(appliedPromo)}).`
    );
  }
}

function refreshPromoState({ announce = false, basketOrIntent = null, force = false } = {}) {
  const candidates = getEligiblePromos(state.context, basketOrIntent);
  const appliedPromo = selectBestPromo(candidates);
  const basketSignature = (state.context.basket || []).map((item) => item.id).sort().join(",");
  const announcementKey = `${state.context.intent || "none"}|${basketSignature}|${appliedPromo?.id || "none"}`;
  applyContextPatch({
    promoState: {
      candidates,
      appliedPromo
    }
  });
  logClient("info", "promo_candidates_presented", {
    count: candidates.length,
    candidateIds: candidates.map((promo) => promo.id),
    appliedPromoId: appliedPromo?.id || null
  });
  if (appliedPromo) {
    logClient("info", "promo_applied", {
      promoId: appliedPromo.id,
      benefitType: appliedPromo.benefitType,
      benefitValue: appliedPromo.benefitValue
    });
  }
  if (announce && (force || state.context.promoState.lastAnnouncementKey !== announcementKey)) {
    renderPromoMessage(candidates, appliedPromo);
    applyContextPatch({ promoState: { lastAnnouncementKey: announcementKey } });
  }
}

function announceDiscountQualification(previousCount, currentCount) {
  const previousTier = toDiscountTierPercent(previousCount);
  const currentTier = toDiscountTierPercent(currentCount);
  if (currentTier <= previousTier || currentTier === 0) return;

  const { bundleDiscount } = getCheckoutTotals();
  const wasTier = Number(state.context.discountNotice?.lastTierAnnounced || 0);
  if (currentTier <= wasTier) return;
  postMessage(
    "bot",
    `Great news. You now qualify for ${currentTier}% off monthly services. Estimated savings: ${currency(bundleDiscount)}/month.`
  );
  logClient("info", currentTier >= 20 ? "bundle_discount_upgraded" : "bundle_discount_qualified", {
    previousTier,
    currentTier,
    savingsMonthly: bundleDiscount
  });
  applyContextPatch({ discountNotice: { lastTierAnnounced: currentTier } });
}

function getInternetOffersByPreference(preference = "value") {
  const internetOffers = offers.filter((offer) => offer.category === "home internet");
  const pref = String(preference || "").toLowerCase();
  if (pref.includes("speed")) {
    return [...internetOffers].sort((a, b) => b.monthlyPrice - a.monthlyPrice).slice(0, 3);
  }
  if (pref.includes("performance") || pref.includes("upload")) {
    return [
      ...internetOffers.filter((offer) => /upload|balanced|hybrid/i.test(offer.description || "")),
      ...internetOffers
    ]
      .filter((offer, idx, arr) => arr.findIndex((candidate) => candidate.id === offer.id) === idx)
      .slice(0, 3);
  }
  return [...internetOffers].sort((a, b) => a.monthlyPrice - b.monthlyPrice).slice(0, 3);
}

function resolveInternetPreference(raw = "") {
  const value = String(raw || "").toLowerCase();
  if (/(speed|fast|fastest)/i.test(value)) return "speed";
  if (/(value|budget|cheap|afford)/i.test(value)) return "value";
  if (/(performance|upload|balanced|work)/i.test(value)) return "performance";
  return null;
}

function getOfferByIdSafe(offerId) {
  return offers.find((offer) => offer.id === offerId) || null;
}

function parseExistingAuthInput(raw = "") {
  const text = String(raw || "").trim();
  if (!text) return null;
  const combined = parseCombinedOnboardingInput(text);
  if (combined) {
    return {
      name: combined.fullName || null,
      email: combined.email || null,
      phone: combined.phone || null
    };
  }
  if (text.includes("@")) return { name: null, email: text.toLowerCase(), phone: null };
  const phone = normalizeCanadianPhone(text);
  if (phone) return { name: null, email: null, phone };
  return { name: text, email: null, phone: null };
}

async function processExistingAuthAttempt() {
  const attempt = state.context.existingAuthAttempt || {};
  let authUser = null;

  if (attempt.email) {
    if (!isValidEmail(attempt.email)) {
      logClient("error", "validation_email_failed", { value: attempt.email, step: FLOW_STEPS.EXISTING_AUTH_VALIDATE });
    } else {
      authUser = resolveUserFromIdentifier(attempt.email);
    }
  } else if (attempt.phone) {
    if (!isValidCanadianPhone(attempt.phone)) {
      logClient("error", "validation_phone_failed", { value: attempt.phone, step: FLOW_STEPS.EXISTING_AUTH_VALIDATE });
    } else {
      authUser = resolveUserFromIdentifier(attempt.phone);
    }
  } else if (attempt.name) {
    authUser = resolveUserFromIdentifier(attempt.name);
  }

  if (!authUser) {
    applyContextPatch({ existingAuthAttempt: { status: "failed" } });
    transitionTo(FLOW_STEPS.EXISTING_AUTH_FAILURE_HARD_STOP, {}, { pushHistory: true, enforceContract: false });
    return;
  }

  applyContextPatch({
    existingAuthAttempt: { status: "ok" },
    selectedService: "internet",
    intent: "home internet",
    customerType: "existing"
  });

  await finalizeExistingAuthentication(
    authUser,
    "existing-whitelist",
    attempt.email || attempt.phone || attempt.name || "",
    { routeAfterAuth: false }
  );
  transitionTo(FLOW_STEPS.INTERNET_ADDRESS_REQUEST, {}, { pushHistory: true, enforceContract: false });
}

function normalizeAddressSuggestionLabel(item = {}) {
  return [item.line1, item.city, item.province, item.postalCode].filter(Boolean).join(", ").trim();
}

function finalizeServiceAddress(address, source = "manual") {
  applyContextPatch({
    serviceAddress: address,
    serviceAddressValidated: true,
    addressAuth: {
      pendingInput: null,
      suggestions: [],
      awaitingConfirmation: false
    }
  });
  logClient("info", "address_authenticated", { source, address });
}

function presentAddressConfirmation(addressInput, suggestions = []) {
  const topSuggestions = (suggestions || []).slice(0, 3);
  const labels = topSuggestions.map((suggestion) => `Use ${normalizeAddressSuggestionLabel(suggestion)}`);
  applyContextPatch({
    addressAuth: {
      pendingInput: addressInput,
      suggestions: topSuggestions,
      awaitingConfirmation: true
    }
  });
  postMessage("bot", "I found these address matches. Select one, or use the address you entered.");
  showChoiceButtons([...labels, "Use my entered address"], (choice) => {
    postMessage("user", choice);
    if (choice === "Use my entered address") {
      finalizeServiceAddress(addressInput, "manual_confirmed");
      transitionTo(FLOW_STEPS.INTERNET_ADDRESS_VALIDATE, {}, { pushHistory: true, enforceContract: false });
      return;
    }
    const matched = topSuggestions.find((suggestion) => choice === `Use ${normalizeAddressSuggestionLabel(suggestion)}`);
    if (!matched) {
      handleUnclearInput(choice, "Please choose one of the suggested addresses or use your entered address.");
      return;
    }
    finalizeServiceAddress(normalizeAddressSuggestionLabel(matched), "typeahead_suggestion");
    transitionTo(FLOW_STEPS.INTERNET_ADDRESS_VALIDATE, {}, { pushHistory: true, enforceContract: false });
  });
}

function resolveServiceAddress(context = state.context) {
  return (
    context.serviceAddress ||
    context.newOnboarding?.address ||
    context.authUser?.prefilledAddress ||
    context.shipping?.address ||
    null
  );
}

function runEligibilityCheck() {
  const user = getEligibilityProfile(state.context);
  if (!user) {
    postMessage("bot", "Please complete authentication or onboarding first.");
    logClient("error", "eligibility_without_auth");
    return;
  }

  const resolvedServiceAddress = resolveServiceAddress(state.context);
  if (!resolvedServiceAddress) {
    logClient("info", "validation_address_requested", { reason: "missing_service_address" });
    logClient("info", "address_capture_prompted", { source: "eligibility_check" });
    transitionTo(FLOW_STEPS.VALIDATION_ADDRESS_CAPTURE, { addressCaptureRetries: 0 }, { pushHistory: true });
    return;
  }
  if ((state.context.selectedService === "internet" || state.context.intent === "home internet") && !state.context.serviceAddressValidated) {
    postMessage("bot", "I still need to validate your service address before checkout.");
    transitionTo(FLOW_STEPS.INTERNET_ADDRESS_REQUEST, {}, { pushHistory: true, enforceContract: false });
    return;
  }
  if (!state.context.serviceAddress) {
    applyContextPatch({ serviceAddress: resolvedServiceAddress });
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
  const { bundleDiscount, discountRate } = getCheckoutTotals();
  const discountTier = toDiscountTierPercent(state.context.basket.length);
  const lastTierAnnounced = Number(state.context.discountNotice?.lastTierAnnounced || 0);
  if (bundleDiscount > 0) {
    if (lastTierAnnounced < discountTier) {
      postMessage(
        "bot",
        `You qualify for ${Math.round(discountRate * 100)}% off monthly services. Estimated savings: ${currency(bundleDiscount)}/month.`
      );
      logClient("info", "bundle_discount_presented", { discountRate, savingsMonthly: bundleDiscount });
      applyContextPatch({ discountNotice: { lastTierAnnounced: discountTier } });
    }
  } else {
    if (lastTierAnnounced === 0) {
      postMessage(
        "bot",
        "You currently have no bundle discount. Add one more service for 10% off monthly services."
      );
    }
  }
  logClient("info", "eligibility_approved", { basketItems: state.context.basket.length });
  if (state.context.customerType === "new" && !state.context.authUser) {
    transitionTo(
      FLOW_STEPS.PAYMENT_CARD_NUMBER,
      {
        paymentDraft: getEmptyPaymentDraft()
      },
      { pushHistory: true, enforceContract: false }
    );
    return;
  }
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
  if (![FLOW_STEPS.SHIPPING_MANUAL_ENTRY, FLOW_STEPS.VALIDATION_ADDRESS_CAPTURE, FLOW_STEPS.INTERNET_ADDRESS_REQUEST].includes(state.flowStep)) {
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
  trackSlaCheckoutCompletion();
  const { serviceMonthlyBase, bundleDiscount, serviceMonthly, financingMonthly, combinedMonthly, installationFees, chargeToday } = getCheckoutTotals();
  const estimatedTaxToday = 0;
  const estimatedTaxMonthly = 0;
  const oneTimeSubtotal = chargeToday;
  const monthlySubtotal = serviceMonthlyBase;
  const todayTotal = Number((oneTimeSubtotal + estimatedTaxToday).toFixed(2));
  const monthlyTotal = Number((combinedMonthly + estimatedTaxMonthly).toFixed(2));
  const orderId = `ORD-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 12)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const confirmationCode = `CNF-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const clientType = state.context.clientType || state.context.customerType || "personal";
  const profile = getEligibilityProfile(state.context) || {};
  const displayName = state.context.authUser?.name || state.context.newOnboarding.fullName || "Valued Customer";
  const contactPhone = formatPhone(state.context.authMeta.phone || state.context.newOnboarding.phone || profile.phone || "not provided");
  const contactEmail = state.context.authMeta.email || state.context.newOnboarding.email || profile.email || "not provided";
  const accountStatus = "Account on file";
  const shippingAddress = state.context.shipping.address || profile.prefilledAddress || "Not provided";
  const serviceAddress = state.context.serviceAddress || shippingAddress || profile.prefilledAddress || "Not provided";
  const billingAddress = serviceAddress || shippingAddress || profile.prefilledAddress || "Not provided";
  const paymentMethodLabel = mapPaymentMethodLabel(state.context.payment.method, state.context.authUser);
  const appliedPromo = state.context.promoState?.appliedPromo || null;
  const maskedPaymentAccount = getMaskedPaymentAccount(
    state.context.payment.method,
    state.context.payment.expectedLast4,
    state.context.authUser,
    state.context.financing.decisionId
  );
  const financingSummary = state.context.financing.selected
    ? ` Financing: ${currency(state.context.financing.financedBase)} over ${state.context.financing.termMonths} months (${currency(financingMonthly)}/month), upfront ${currency(state.context.financing.upfrontPayment)}, reference ${state.context.financing.decisionId}.`
    : "";
  const discountSummary = bundleDiscount > 0 ? ` Bundle discount applied: ${currency(bundleDiscount)}/month.` : "";
  const promoSummary = appliedPromo ? ` Promotion applied: ${appliedPromo.title} (${formatPromotionBenefit(appliedPromo)}).` : "";
  orderSummary.textContent =
    `Corporate receipt ready. Order ${orderId} confirmed (${confirmationCode}). Service ${currency(serviceMonthly)}/month.${discountSummary}${promoSummary}${financingSummary} Installation fees ${currency(installationFees)}. Total due today ${currency(todayTotal)}. Monthly total going forward ${currency(monthlyTotal)}. Shipping to ${shippingAddress}.`;
  checkoutStatus.textContent = "Status: order captured and confirmed.";
  postMessage(
    "bot",
    `Order confirmed. Order ID ${orderId}, confirmation ${confirmationCode}. Client type ${clientType}. Total due today ${currency(todayTotal)}. Monthly total going forward ${currency(monthlyTotal)}.`
  );

  const receiptPayload = {
    brand: {
      companyName: "Bell Canada",
      channel: "Corporate Assisted Digital Checkout"
    },
    order: {
      orderId,
      confirmationCode,
      createdAt: new Date().toISOString(),
      currency: "CAD",
      status: "Confirmed"
    },
    customer: {
      clientType,
      displayName,
      contactPhone,
      contactEmail,
      accountStatus
    },
    addresses: {
      billingAddress,
      shippingAddress,
      serviceAddress
    },
    payment: {
      methodLabel: paymentMethodLabel,
      maskedAccount: maskedPaymentAccount,
      verificationStatus: "Verified",
      chargeToday: todayTotal
    },
    lineItems: state.context.basket.map((item) => ({
      name: item.name,
      category: item.category || "service",
      monthlyPrice: item.monthlyPrice,
      oneTimePrice: 0,
      quantity: 1,
      deviceModel: item.deviceModel || null
    })),
    recurring: {
      serviceMonthly,
      financingMonthly,
      combinedMonthly
    },
    financing: state.context.financing.selected
      ? {
          amountFinanced: state.context.financing.financedBase,
          upfrontPayment: state.context.financing.upfrontPayment || 0,
          termMonths: state.context.financing.termMonths,
          monthlyPayment: state.context.financing.monthlyPayment,
          decisionId: state.context.financing.decisionId
        }
      : null,
    charges: {
      installationFees,
      bundleDiscount,
      oneTimeSubtotal,
      monthlySubtotal,
      estimatedTaxToday,
      estimatedTaxMonthly,
      todayTotal,
      monthlyTotal
    },
    promotions: appliedPromo
      ? [
          {
            title: appliedPromo.title,
            description: `${appliedPromo.description} (${formatPromotionBenefit(appliedPromo)})`
          }
        ]
      : [],
    disclaimer:
      "Mock confirmation for prototype use. Taxes are placeholders and final billed amounts may vary."
  };
  const receiptWindow = window.open("about:blank", "_blank", "width=980,height=820");
  if (receiptWindow) {
    logClient("info", "receipt_window_opened", { orderId });
    receiptWindow.document.write(buildReceiptHtml(receiptPayload));
    receiptWindow.document.close();
    logClient("info", "receipt_rendered", { orderId });
  } else {
    postMessage("bot", "Receipt window was blocked by your browser. Please allow pop-ups and place the order again to open it.");
    logClient("error", "receipt_window_blocked", { orderId });
  }

  logClient("info", "order_submission_success", {
    orderId,
    confirmationCode,
    serviceMonthly,
    serviceMonthlyBase,
    bundleDiscount,
    financingMonthly,
    combinedMonthly,
    installationFees,
    chargeToday,
    shippingMode: state.context.shipping.mode
  });
  finishPath(PATH_STATUS.COMPLETED, { outcome: "order_confirmed", orderId });

  applyContextPatch({
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
    salesProfile: {
      byodChoice: null,
      linePreference: null,
      awaitingOfferContinuation: false,
      lastSelectedCategory: null,
      crossSellOptions: []
    },
    sessionFlags: {
      orderCompleted: true
    },
    discountNotice: {
      lastTierAnnounced: 0
    },
    promoState: {
      candidates: [],
      appliedPromo: null,
      lastAnnouncementKey: null
    },
    addressCaptureRetries: 0
  });
  renderBasket();
  resetCheckoutPanel();
  transitionTo(FLOW_STEPS.POST_CHAT_RATING, { activeTask: "post_order_rating" }, { pushHistory: true, enforceContract: false });
}

function renderStep(step) {
  clearQuickActions();
  renderBasket();
  renderCarouselPage();
  updateJourneyProgress(step);
  setStatus();
  resetChatInputHint();
  if (![FLOW_STEPS.SHIPPING_MANUAL_ENTRY, FLOW_STEPS.VALIDATION_ADDRESS_CAPTURE].includes(step)) clearAddressTypeahead();
  if ([FLOW_STEPS.INTERNET_PRIORITY_CAPTURE, FLOW_STEPS.INTERNET_PLAN_PITCH].includes(step)) {
    setPanelFocus("quote");
  } else if ([FLOW_STEPS.INTENT_DISCOVERY, FLOW_STEPS.SERVICE_CLARIFICATION, FLOW_STEPS.OFFER_BROWSE, FLOW_STEPS.DEVICE_OS_SELECTION].includes(step)) {
    if (step === FLOW_STEPS.OFFER_BROWSE && shouldRenderInlineOfferFlow()) {
      setPanelFocus("conversation");
    } else if (step === FLOW_STEPS.OFFER_BROWSE && state.context.basket.length > 0) {
      setPanelFocus("offers_basket");
    } else if (step === FLOW_STEPS.OFFER_BROWSE) {
      setPanelFocus("offers");
    } else {
      setPanelFocus("conversation");
    }
  } else if ([FLOW_STEPS.BASKET_REVIEW, FLOW_STEPS.VALIDATION_ADDRESS_CAPTURE, FLOW_STEPS.ELIGIBILITY_CHECK].includes(step)) {
    setPanelFocus("basket");
  } else if (
    [
      FLOW_STEPS.PAYMENT_METHOD,
      FLOW_STEPS.PAYMENT_CONFIRM_LAST4,
      FLOW_STEPS.PAYMENT_CVV,
      FLOW_STEPS.PAYMENT_FINANCING_TERM,
      FLOW_STEPS.PAYMENT_FINANCING_UPFRONT,
      FLOW_STEPS.PAYMENT_FINANCING_APPROVAL,
      FLOW_STEPS.PAYMENT_FINANCING_CONFIRM,
      FLOW_STEPS.PAYMENT_CARD_ENTRY,
      FLOW_STEPS.PAYMENT_CARD_NUMBER,
      FLOW_STEPS.PAYMENT_CARD_CVC,
      FLOW_STEPS.PAYMENT_CARD_POSTAL,
      FLOW_STEPS.PAYMENT_CARD_CONFIRM,
      FLOW_STEPS.SHIPPING_SELECTION,
      FLOW_STEPS.SHIPPING_LOOKUP,
      FLOW_STEPS.SHIPPING_MANUAL_ENTRY,
      FLOW_STEPS.ORDER_REVIEW
    ].includes(step)
  ) {
    setPanelFocus("checkout");
  } else {
    setPanelFocus("conversation");
  }
  renderQuoteBuilderPanel();

  switch (step) {
    case FLOW_STEPS.INIT_CONNECTING: {
      hideAvailabilityCard();
      const t1 = setTimeout(() => {
        postMessage("bot", "We are connecting you, please hold.");
        const t2 = setTimeout(() => {
          transitionTo(FLOW_STEPS.GREETING_CONVERSATIONAL, {}, { pushHistory: false });
        }, 700);
        state.timers.push(t2);
      }, 400);
      state.timers.push(t1);
      break;
    }

    case FLOW_STEPS.GREETING_CONVERSATIONAL:
      hideAvailabilityCard();
      ensureAiDisclosure();
      postMessage("bot", "How are you today, and how can I help?");
      transitionTo(FLOW_STEPS.CUSTOMER_STATUS_SELECTION, {}, { pushHistory: false });
      break;

    case FLOW_STEPS.CUSTOMER_STATUS_SELECTION:
      hideAvailabilityCard();
      postMessage("bot", "Are you a new client or an existing Bell client?");
      showChoiceButtons(["New client", "Existing client"], (choice) => {
        postMessage("user", choice);
        if (choice === "Existing client") {
          transitionTo(
            FLOW_STEPS.EXISTING_AUTH_ENTRY,
            {
              customerType: "existing",
              selectedService: "internet",
              selectedEntryIntent: "Internet",
              intent: "home internet",
              activeTask: "sales",
              customerStatusAsked: true
            },
            { pushHistory: true }
          );
          return;
        }
        transitionTo(
          FLOW_STEPS.SERVICE_SELECTION,
          {
            customerType: "new",
            customerStatusAsked: true
          },
          { pushHistory: true }
        );
      });
      break;

    case FLOW_STEPS.SERVICE_SELECTION:
      postMessage("bot", "What service are you looking for today?");
      showChoiceButtons(["Internet", "Mobility", "Landline"], (choice) => {
        postMessage("user", choice);
        if (choice === "Internet") {
          applyContextPatch({
            selectedService: "internet",
            intent: "home internet",
            selectedEntryIntent: "Internet",
            activeTask: "sales",
            selectedPlanId: null,
            internetPreference: null,
            quoteBuilder: {
              preferences: getQuoteDefaultsFromPreference("value"),
              lastPreview: [],
              lastPreviewAt: null
            }
          });
          transitionTo(FLOW_STEPS.INTERNET_ADDRESS_REQUEST, {}, { pushHistory: true });
          return;
        }
        const mappedIntent = choice === "Mobility" ? "mobility" : "landline";
        applyContextPatch({
          selectedService: mappedIntent === "mobility" ? "mobility" : "landline",
          intent: mappedIntent,
          selectedEntryIntent: mappedIntent === "mobility" ? "Mobility" : "Landline",
          activeTask: "sales"
        });
        transitionTo(FLOW_STEPS.INTENT_DISCOVERY, {}, { pushHistory: true, enforceContract: false });
      });
      break;

    case FLOW_STEPS.EXISTING_AUTH_ENTRY:
      postMessage("bot", "Please authenticate with your name, email, or 10-digit Canadian phone number.");
      setChatInputHint("Example: Robert, robert@test.gmail.com, or 4165511192");
      break;

    case FLOW_STEPS.EXISTING_AUTH_VALIDATE:
      postMessage("bot", "Thanks, validating your existing account now.");
      void processExistingAuthAttempt();
      break;

    case FLOW_STEPS.EXISTING_AUTH_FAILURE_HARD_STOP:
      postMessage("bot", "I’m unable to proceed with this user account.");
      showChoiceButtons(["Retry authentication", "End chat"], (choice) => {
        postMessage("user", choice);
        if (choice === "Retry authentication") {
          transitionTo(FLOW_STEPS.EXISTING_AUTH_ENTRY, {}, { pushHistory: true });
          return;
        }
        endChat();
      });
      break;

    case FLOW_STEPS.INTERNET_ADDRESS_REQUEST:
      if (state.context.addressAuth.awaitingConfirmation) {
        postMessage("bot", "Please confirm one of the suggested addresses, or choose to use your entered address.");
        break;
      }
      postMessage("bot", "To confirm internet availability in your area, what service address should I use? I will suggest matches as you type.");
      setChatInputHint("Example: 210 - 100 Galt Ave, Toronto, ON");
      break;

    case FLOW_STEPS.INTERNET_ADDRESS_VALIDATE:
      if (!state.context.serviceAddress || !state.context.serviceAddressValidated) {
        transitionTo(FLOW_STEPS.INTERNET_ADDRESS_REQUEST, {}, { pushHistory: false, enforceContract: false });
        break;
      }
      postMessage("bot", `Thanks. I validated this service address: ${state.context.serviceAddress}.`);
      transitionTo(FLOW_STEPS.INTERNET_AVAILABILITY_RESULT, {}, { pushHistory: false });
      break;

    case FLOW_STEPS.INTERNET_AVAILABILITY_RESULT:
      postMessage("bot", "Great news. Internet offers are available at your address.");
      transitionTo(FLOW_STEPS.INTERNET_PRIORITY_CAPTURE, {}, { pushHistory: false });
      break;

    case FLOW_STEPS.INTERNET_PRIORITY_CAPTURE:
      postMessage("bot", "What is your top priority for internet: speed, value, or performance?");
      postMessage("bot", "You can also use the Guided Quote Builder on the right to compare plans before selecting.");
      showChoiceButtons(["Speed", "Value", "Performance", "Build my plan"], (choice) => {
        postMessage("user", choice);
        if (choice === "Build my plan") {
          const defaultPrefs = getQuoteDefaultsFromPreference(state.context.internetPreference || "value");
          applyContextPatch({ quoteBuilder: { preferences: defaultPrefs } });
          void generateQuotePreview({ announce: true }).then(() => {
            transitionTo(FLOW_STEPS.INTERNET_PLAN_PITCH, {}, { pushHistory: true });
          });
          return;
        }
        const normalizedPreference = choice.toLowerCase();
        const defaultPrefs = getQuoteDefaultsFromPreference(normalizedPreference);
        applyContextPatch({ internetPreference: choice.toLowerCase() });
        applyContextPatch({ quoteBuilder: { preferences: defaultPrefs } });
        transitionTo(FLOW_STEPS.INTERNET_PLAN_PITCH, {}, { pushHistory: true });
      });
      break;

    case FLOW_STEPS.INTERNET_PLAN_PITCH: {
      if (!(state.context.quoteBuilder?.lastPreview || []).length) {
        postMessage("bot", "Generating your quote recommendations now.");
        void generateQuotePreview({ announce: true });
      }
      const plans = getInternetPlanOptions();
      if (!plans.length) {
        postMessage("bot", "I’m still preparing your internet recommendations. Please choose Generate fresh quote.");
        showChoiceButtons(["Generate fresh quote"], (choice) => {
          postMessage("user", choice);
          void generateQuotePreview({ announce: true });
        });
        break;
      }
      if (state.context.quoteBuilder?.lastPreview?.length) {
        postMessage("bot", "Here are your quote-ranked internet options:");
      } else {
        postMessage("bot", "Based on your preference, here are recommended internet plans:");
      }
      postMessage("bot", `Top recommendation: ${plans[0].name} at ${currency(plans[0].monthlyPrice)}/month.`);
      void requestChatAssist(
        "explain_recommendation",
        {
          userMessage: state.context.internetPreference || "value",
          deterministicData: {
            preference: state.context.internetPreference || "value",
            plans: plans.map((plan) => ({ name: plan.name, monthlyPrice: plan.monthlyPrice, quoteRank: plan.quoteRank || null }))
          }
        },
        {
          fallbackText: "I prioritized these plans based on your stated preference, while keeping available service tiers aligned to your needs.",
          minLength: 20
        }
      ).then((assistText) => {
        if (assistText) postMessage("bot", assistText);
      });
      const labels = plans.map((plan) => `Select ${plan.name} - ${currency(plan.monthlyPrice)}/month`);
      labels.push("Generate fresh quote");
      showChoiceButtons(labels, (choice) => {
        postMessage("user", choice);
        if (choice === "Generate fresh quote") {
          void generateQuotePreview({ announce: true });
          return;
        }
        const selected = plans.find((plan) => choice.includes(plan.name));
        if (!selected) return;
        applyContextPatch({ selectedPlanId: selected.id });
        transitionTo(FLOW_STEPS.PLAN_CONFIRMATION, {}, { pushHistory: true });
      });
      break;
    }

    case FLOW_STEPS.PLAN_CONFIRMATION: {
      const selectedPlan = getOfferByIdSafe(state.context.selectedPlanId);
      if (!selectedPlan) {
        transitionTo(FLOW_STEPS.INTERNET_PLAN_PITCH, {}, { pushHistory: false });
        break;
      }
      postMessage("bot", `Please confirm: ${selectedPlan.name} at ${currency(selectedPlan.monthlyPrice)}/month.`);
      showChoiceButtons(["Confirm plan", "Change plan"], (choice) => {
        postMessage("user", choice);
        if (choice === "Change plan") {
          transitionTo(FLOW_STEPS.INTERNET_PLAN_PITCH, {}, { pushHistory: true });
          return;
        }
        if (!(state.context.basket || []).some((item) => item.id === selectedPlan.id)) {
          const basket = [...(state.context.basket || []), selectedPlan];
          applyContextPatch({ basket });
          renderBasket();
        }
        if (state.context.customerType === "new") {
          transitionTo(FLOW_STEPS.NEW_ONBOARD_COMBINED_CAPTURE, {}, { pushHistory: true });
          return;
        }
        transitionTo(FLOW_STEPS.CHECKOUT_INTENT_PROMPT, {}, { pushHistory: true });
      });
      break;
    }

    case FLOW_STEPS.NEW_ONBOARD_COMBINED_CAPTURE:
      postMessage("bot", "Please provide your full name, email, and phone number in one message.");
      setChatInputHint("Example: Jane Doe, jane@test.com, 4165551234");
      break;

    case FLOW_STEPS.NEW_ACCOUNT_CREATED_CONFIRM:
      postMessage("bot", "Great, your new account has been created.");
      transitionTo(FLOW_STEPS.CHECKOUT_INTENT_PROMPT, {}, { pushHistory: false });
      break;

    case FLOW_STEPS.CHECKOUT_INTENT_PROMPT:
      postMessage("bot", "Would you like to checkout now? You can also add mobility or landline offers.");
      showChoiceButtons(["Checkout now", "Add mobility offers", "Add landline offers", "No thanks"], (choice) => {
        postMessage("user", choice);
        if (choice === "Checkout now") {
          transitionTo(
            FLOW_STEPS.PAYMENT_CARD_NUMBER,
            {
              paymentDraft: getEmptyPaymentDraft()
            },
            { pushHistory: true, enforceContract: false }
          );
          return;
        }
        if (choice === "Add mobility offers") {
          routeToCrossSellCategory("mobility");
          transitionTo(FLOW_STEPS.OFFER_BROWSE, {}, { pushHistory: true, enforceContract: false });
          return;
        }
        if (choice === "Add landline offers") {
          routeToCrossSellCategory("landline");
          transitionTo(FLOW_STEPS.OFFER_BROWSE, {}, { pushHistory: true, enforceContract: false });
          return;
        }
        transitionTo(FLOW_STEPS.ORDER_CONFIRMED, {}, { pushHistory: true, enforceContract: false });
      });
      break;

    case FLOW_STEPS.PAYMENT_CARD_ENTRY:
      transitionTo(
        FLOW_STEPS.PAYMENT_CARD_NUMBER,
        {
          paymentDraft: getEmptyPaymentDraft()
        },
        { pushHistory: false, enforceContract: false }
      );
      break;

    case FLOW_STEPS.PAYMENT_CARD_NUMBER:
      postMessage("bot", "Enter your card number using the 4 boxes below (16 digits total).");
      postMessage("bot", "Accepted brands: Visa, MasterCard, and Amex.");
      setChatInputHint("16-digit card number (or use 4 boxes)");
      renderPaymentCardSegmentInput();
      break;

    case FLOW_STEPS.PAYMENT_CARD_CVC:
      postMessage("bot", state.context.paymentDraft.brand === "amex" ? "Enter your 4-digit Amex CVC." : "Enter your 3-digit card CVC.");
      setChatInputHint(state.context.paymentDraft.brand === "amex" ? "4-digit CVC" : "3-digit CVC");
      break;

    case FLOW_STEPS.PAYMENT_CARD_POSTAL:
      postMessage("bot", "Enter your Canadian billing postal code (example: M5V 2T6).");
      setChatInputHint("Canadian postal code");
      break;

    case FLOW_STEPS.PAYMENT_CARD_CONFIRM:
      postMessage(
        "bot",
        `Please confirm payment with ${formatCardBrandLabel(state.context.paymentDraft.brand)} ending in ${state.context.paymentDraft.last4}.`
      );
      showChoiceButtons(["Confirm payment", "Start over"], (choice) => {
        postMessage("user", choice);
        if (choice === "Start over") {
          transitionTo(
            FLOW_STEPS.PAYMENT_CARD_NUMBER,
            {
              paymentDraft: getEmptyPaymentDraft()
            },
            { pushHistory: true, enforceContract: false }
          );
          return;
        }
        const token = `tok_${Date.now()}`;
        applyContextPatch({
          cardEntry: {
            brand: state.context.paymentDraft.brand,
            maskedLast4: `**** **** **** ${state.context.paymentDraft.last4}`,
            cvcValidated: true,
            postalValidated: true,
            tokenized: true
          },
          payment: {
            method: state.context.paymentDraft.brand,
            expectedLast4: state.context.paymentDraft.last4,
            last4Confirmed: true,
            cvvValidated: true,
            verified: true,
            token
          }
        });
        postMessage("bot", "Payment details confirmed and tokenized. Proceeding to shipping.");
        transitionTo(FLOW_STEPS.SHIPPING_SELECTION, {}, { pushHistory: true, enforceContract: false });
      });
      break;

    case FLOW_STEPS.EXISTING_AREA_CODE_CHECK: {
      hideAvailabilityCard();
      if (state.pendingAuthMode === "auto") {
        const autoUser = mockUsers.find((u) => u.id === "u1001");
        const autoAreaCode = deriveAreaCodeFromProfile(autoUser, autoUser?.phone);
        if (autoAreaCode) {
          postMessage("bot", "As an existing Bell client, you may have special offers based on your area code.");
          postMessage("bot", `I found your area code on file (${autoAreaCode}). I will use it to personalize your offers.`);
          transitionTo(
            FLOW_STEPS.EXISTING_AUTH_MODE,
            {
              areaCode: autoAreaCode,
              areaCodeSource: "profile"
            },
            { pushHistory: false }
          );
          break;
        }
      }
      const derived = deriveAreaCodeFromProfile(state.context.authUser, state.context.authMeta.phone);
      if (state.context.areaCode) {
        postMessage("bot", `As an existing Bell client, you may have special offers based on your area code. I will use ${state.context.areaCode} to personalize your offers.`);
        transitionTo(FLOW_STEPS.EXISTING_AUTH_MODE, {}, { pushHistory: false });
        break;
      }
      if (derived) {
        postMessage("bot", "As an existing Bell client, you may have special offers based on your area code.");
        postMessage("bot", `I found your area code on file (${derived}). I will use it to personalize your offers.`);
        transitionTo(
          FLOW_STEPS.EXISTING_AUTH_MODE,
          {
            areaCode: derived,
            areaCodeSource: "profile"
          },
          { pushHistory: false }
        );
        break;
      }
      postMessage("bot", "As an existing Bell client, you may have special offers based on your area code.");
      postMessage("bot", "Please enter your 3-digit area code.");
      setChatInputHint("Area code (e.g., 416)");
      break;
    }

    case FLOW_STEPS.NEW_AREA_CODE_ENTRY:
      hideAvailabilityCard();
      postMessage("bot", "Thanks. Enter your 3-digit area code so I can unlock local offers.");
      setChatInputHint("Area code (e.g., 416)");
      break;

    case FLOW_STEPS.EXISTING_AUTH_MODE:
      hideAvailabilityCard();
      stepPrompt(FLOW_STEPS.EXISTING_AUTH_MODE, "Great, let’s quickly verify your account so I can show the right offers.");
      if (state.pendingAuthMode === "auto") {
        const user = mockUsers.find((u) => u.id === "u1001");
        state.pendingAuthMode = null;
        if (user) {
          finalizeExistingAuthentication(user, "auto", user.phone);
          break;
        }
      }
      if (state.pendingAuthMode === "manual") {
        state.pendingAuthMode = null;
        transitionTo(FLOW_STEPS.EXISTING_AUTH_IDENTIFIER, {}, { pushHistory: true });
        break;
      }
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
      setChatInputHint("416-555-1111 or robert@test.gmail.com");
      break;

    case FLOW_STEPS.NEW_ONBOARD_NAME:
      hideAvailabilityCard();
      stepPrompt(FLOW_STEPS.NEW_ONBOARD_NAME, "Perfect, I can set up your profile in under a minute. What is your full name?");
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

    case FLOW_STEPS.NEW_ONBOARD_ADDRESS:
      postMessage("bot", "Enter your address (including apartment/unit if applicable).");
      setChatInputHint("Address");
      break;

    case FLOW_STEPS.HELPDESK_ENTRY:
      hideAvailabilityCard();
      ensureAiDisclosure();
      stepPrompt(
        FLOW_STEPS.HELPDESK_ENTRY,
        "Welcome to Bell. I’m Belinda, your automated AI assistant. What service are you shopping for today?"
      );
      showChoiceButtons(
        [
          "Mobility",
          "Internet",
          "Landline",
          "Bundle"
        ],
        (choice) => {
          postMessage("user", choice);
          routeHelpdeskSelection(choice, { pushHistory: true });
        }
      );
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
          finishPath(PATH_STATUS.COMPLETED, { outcome: "support_resolved" });
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
          finishPath(PATH_STATUS.COMPLETED, { outcome: "hardware_resolved" });
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
      void requestChatAssist(
        "handoff_summary",
        {
          userMessage: "Agent handoff requested",
          deterministicData: {
            flowStep: state.flowStep,
            activeTask: state.context.activeTask,
            intent: state.context.intent
          }
        },
        {
          fallbackText: "",
          minLength: 24
        }
      ).then((assistSummary) => {
        if (assistSummary) {
          postMessage("bot", assistSummary);
        }
      });
      showChoiceButtons(["Product selection", "Offer assistance", "Troubleshooting", "Login guidance"], (choice) => {
        postMessage("user", choice);
        transitionTo(FLOW_STEPS.AGENT_ASSIST_CLARIFY, { activeTask: choice.toLowerCase(), escalatedToAgent: true }, { pushHistory: true });
      });
      break;

    case FLOW_STEPS.AGENT_ASSIST_CLARIFY: {
      const nextStep = routeFromAgentAssist(state.context.activeTask);
      postMessage("bot", "Thanks for clarifying. I’ll route you to the right step now.");
      logClient("info", "warm_agent_re_routed_step", { activeTask: state.context.activeTask, nextStep });
      transitionTo(nextStep, getRoutePatchForStep(nextStep), { pushHistory: false, enforceContract: false });
      break;
    }

    case FLOW_STEPS.INTENT_DISCOVERY:
      hideAvailabilityCard();
      stepPrompt(FLOW_STEPS.INTENT_DISCOVERY, "Great choice. I’ll ask one or two quick questions so I can match the best plan for you.");
      transitionTo(FLOW_STEPS.SERVICE_CLARIFICATION, {}, { pushHistory: false });
      break;

    case FLOW_STEPS.SERVICE_CLARIFICATION: {
      const intent = state.context.intent;
      if (intent === "home internet") {
        if (state.context.salesProfile.speedPriority) {
          routeAfterSalesClarification({ pushHistory: true });
          break;
        }
        postMessage("bot", "For internet, what matters most to you right now: top speed, balanced value, or strong upload performance?");
        showChoiceButtons(["Fastest speed", "Balanced value", "Upload-intensive"], (choice) => {
          postMessage("user", choice);
          applyContextPatch({ salesProfile: { speedPriority: choice } });
          routeAfterSalesClarification({ pushHistory: true });
        });
        break;
      }

      if (intent === "mobility") {
        if (!state.context.salesProfile.byodChoice) {
          postMessage("bot", "Are you bringing your own phone to Bell?");
          showChoiceButtons(["Yes, bring my own phone", "No, I need a new phone"], (choice) => {
            postMessage("user", choice);
            const byodChoice = choice.startsWith("Yes") ? "byod" : "new_device";
            const phonePreference = byodChoice === "byod" ? "BYOD" : null;
            applyContextPatch({ salesProfile: { byodChoice, phonePreference } });
            renderStep(FLOW_STEPS.SERVICE_CLARIFICATION);
          });
          break;
        }
        if (state.context.salesProfile.byodChoice === "new_device" && !state.context.salesProfile.phonePreference) {
          postMessage("bot", "Nice, let’s pick your phone first. Which device family do you prefer?");
          showChoiceButtons(["iPhone", "Samsung Galaxy", "Google Pixel", "Other device"], (choice) => {
            postMessage("user", choice);
            applyContextPatch({ salesProfile: { phonePreference: choice } });
            renderStep(FLOW_STEPS.SERVICE_CLARIFICATION);
          });
          break;
        }
        if (state.context.salesProfile.callingPlan) {
          routeAfterSalesClarification({ pushHistory: true });
          break;
        }
        postMessage("bot", "And for calling, which coverage fits you best?");
        showChoiceButtons(["Canada", "Canada + US", "International"], (choice) => {
          postMessage("user", choice);
          applyContextPatch({ salesProfile: { callingPlan: choice } });
          routeAfterSalesClarification({ pushHistory: true });
        });
        break;
      }

      if (intent === "bundle") {
        if (state.context.salesProfile.bundleSize) {
          routeAfterSalesClarification({ pushHistory: true });
          break;
        }
        postMessage("bot", "Would you like a 2-service bundle or a 3-service bundle?");
        showChoiceButtons(["2 services", "3 services"], (choice) => {
          postMessage("user", choice);
          applyContextPatch({ salesProfile: { bundleSize: choice.startsWith("3") ? 3 : 2 } });
          routeAfterSalesClarification({ pushHistory: true });
        });
        break;
      }

      if (!state.context.salesProfile.linePreference) {
        postMessage("bot", "For landline setup, do you need a new line or do you want to keep your existing number?");
        showChoiceButtons(["New line", "Keep existing number"], (choice) => {
          postMessage("user", choice);
          applyContextPatch({
            salesProfile: { linePreference: choice.startsWith("Keep") ? "keep_existing" : "new_line" }
          });
          renderStep(FLOW_STEPS.SERVICE_CLARIFICATION);
        });
        break;
      }
      if (state.context.salesProfile.callingPlan) {
        routeAfterSalesClarification({ pushHistory: true });
        break;
      }
      postMessage("bot", "For home phone, do you need local calling or international minutes?");
      showChoiceButtons(["Local calling", "International minutes"], (choice) => {
        postMessage("user", choice);
        applyContextPatch({ salesProfile: { callingPlan: choice } });
        routeAfterSalesClarification({ pushHistory: true });
      });
      break;
    }

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
      refreshPromoState({ announce: true });
      if (shouldRenderInlineOfferFlow()) {
        stepPrompt(
          FLOW_STEPS.OFFER_BROWSE,
          "I found your top matched offers. I’ll present them directly here in chat so you can add them instantly."
        );
        presentInlineOfferChoices();
      } else {
        stepPrompt(
          FLOW_STEPS.OFFER_BROWSE,
          "I found your top 3 matched offers. Take a look and I’ll help you build the best bundle."
        );
      }
      break;

    case FLOW_STEPS.BASKET_REVIEW:
      if (!resolveServiceAddress(state.context)) {
        postMessage("bot", "Before I run validation, I need your service address.");
        logClient("info", "address_capture_prompted", { source: "basket_review" });
        transitionTo(FLOW_STEPS.VALIDATION_ADDRESS_CAPTURE, { addressCaptureRetries: 0 }, { pushHistory: false });
        break;
      }
      postMessage("bot", "Great, reviewing your basket now and running eligibility checks.");
      transitionTo(FLOW_STEPS.ELIGIBILITY_CHECK, {}, { pushHistory: false });
      break;

    case FLOW_STEPS.VALIDATION_ADDRESS_CAPTURE: {
      const profileAddress = state.context.authUser?.prefilledAddress || null;
      const onboardingAddress = state.context.newOnboarding?.address || null;
      logClient("info", "address_capture_prompted", { source: "validation_step" });
      postMessage("bot", "Before I run validation, what service address should I use?");
      setChatInputHint("Service address");
      const options = [];
      if (profileAddress) options.push("Use profile address");
      if (onboardingAddress) options.push("Use onboarding address");
      options.push("Enter a new address");
      showChoiceButtons(options, (choice) => {
        postMessage("user", choice);
        if (choice === "Use profile address" && profileAddress) {
          applyContextPatch({ serviceAddress: profileAddress, serviceAddressValidated: true, addressCaptureRetries: 0 });
          postMessage("bot", `Using profile service address: ${profileAddress}.`);
          transitionTo(FLOW_STEPS.ELIGIBILITY_CHECK, {}, { pushHistory: true });
          return;
        }
        if (choice === "Use onboarding address" && onboardingAddress) {
          applyContextPatch({ serviceAddress: onboardingAddress, serviceAddressValidated: true, addressCaptureRetries: 0 });
          postMessage("bot", `Using onboarding service address: ${onboardingAddress}.`);
          transitionTo(FLOW_STEPS.ELIGIBILITY_CHECK, {}, { pushHistory: true });
          return;
        }
        postMessage("bot", "Please enter your full service address.");
        setChatInputHint("Service address");
      });
      break;
    }

    case FLOW_STEPS.ELIGIBILITY_CHECK:
      runEligibilityCheck();
      break;

    case FLOW_STEPS.PAYMENT_METHOD:
      tokenizeBtn.disabled = false;
      const paymentProfile = getEligibilityProfile(state.context);
      const supportsExisting = state.context.customerType === "existing" && Boolean(paymentProfile?.savedCardLast4);
      stepPrompt(
        FLOW_STEPS.PAYMENT_METHOD,
        supportsExisting
          ? "How would you like to pay today: Visa, MasterCard, Amex, your existing saved card, or Bell Smart Financing?"
          : "How would you like to pay today: Visa, MasterCard, Amex, or Bell Smart Financing?"
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
      const { serviceMonthly, financingMonthly, combinedMonthly, installationFees, chargeToday, bundleDiscount } = getCheckoutTotals();
      const clientType = state.context.clientType || state.context.customerType || "personal";
      const appliedPromo = state.context.promoState?.appliedPromo || null;
      const financingDetail = state.context.financing.selected
        ? ` Financing ${currency(state.context.financing.financedBase)} over ${state.context.financing.termMonths} months (${currency(financingMonthly)}/month), upfront ${currency(state.context.financing.upfrontPayment)}, ref ${state.context.financing.decisionId}.`
        : "";
      const bundleDetail = bundleDiscount > 0 ? ` Bundle discount ${currency(bundleDiscount)}/month applied.` : "";
      const promoDetail = appliedPromo
        ? ` Promo applied: ${appliedPromo.title} (${formatPromotionBenefit(appliedPromo)}).`
        : "";
      postMessage(
        "bot",
        `Corporate order review for ${clientType} client: ${state.context.basket.length} item(s), service ${currency(serviceMonthly)}/month.${bundleDetail}${promoDetail}${financingDetail} Installation fees ${currency(installationFees)}. Total due today ${currency(chargeToday)}. Monthly total going forward ${currency(combinedMonthly)}. Shipping to ${state.context.shipping.address}.`
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
      const promoLine = appliedPromo
        ? ` Promotion: ${appliedPromo.title} (${formatPromotionBenefit(appliedPromo)}).`
        : "";
      orderSummary.textContent = `${paymentLine}${promoLine}${financingLine} Service monthly: ${currency(serviceMonthly)}. Installation fees: ${currency(installationFees)}. Total due today: ${currency(chargeToday)}. Monthly total going forward: ${currency(combinedMonthly)}. Shipping: ${state.context.shipping.address}.`;
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
        ["Add another service", "View offers", "No, that is all"],
        (choice) => {
          postMessage("user", choice);
          if (choice === "Add another service" || choice === "View offers") {
            transitionTo(FLOW_STEPS.HELPDESK_ENTRY, { activeTask: "sales" }, { pushHistory: true, enforceContract: false });
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

    case FLOW_STEPS.POST_CHAT_RATING:
      postMessage("bot", "Before you go, please rate your checkout experience from 1 to 5 stars.");
      showChoiceButtons(["1 star", "2 stars", "3 stars", "4 stars", "5 stars"], (choice) => {
        postMessage("user", choice);
        const rating = Number(choice[0]);
        applyContextPatch({ agentRating: rating });
        logClient("info", "agent_rating_submitted", { rating, scope: "post_checkout" });
        if (rating < 3) {
          transitionTo(FLOW_STEPS.POST_CHAT_FEEDBACK, {}, { pushHistory: true, enforceContract: false });
          return;
        }
        postMessage("bot", "Thank you for your rating.");
        transitionTo(FLOW_STEPS.ORDER_CONFIRMED, {}, { pushHistory: true, enforceContract: false });
      });
      break;

    case FLOW_STEPS.POST_CHAT_FEEDBACK:
      postMessage("bot", "Thanks for the rating. What could we improve?");
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

  if (cmd.includes("language")) {
    if (cmd.includes("english")) {
      setConversationLanguage("en");
      return true;
    }
    if (cmd.includes("french") || cmd.includes("francais") || cmd.includes("français")) {
      setConversationLanguage("fr");
      return true;
    }
    if (cmd.includes("spanish") || cmd.includes("español") || cmd.includes("espanol")) {
      setConversationLanguage("es");
      return true;
    }
    if (cmd.includes("chinese") || cmd.includes("mandarin") || cmd.includes("中文")) {
      setConversationLanguage("zh");
      return true;
    }
  }

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
    transitionTo(
      FLOW_STEPS.EXISTING_AUTH_ENTRY,
      { customerType: "existing", selectedService: "internet", intent: "home internet" },
      { pushHistory: true, enforceContract: false }
    );
    return true;
  }

  if (cmd.includes("next page") && state.flowStep === FLOW_STEPS.OFFER_BROWSE) {
    if (state.offerPageIndex < CATEGORY_PAGES.length - 1) {
      state.offerPageIndex += 1;
      renderCarouselPage();
      if (shouldRenderInlineOfferFlow()) {
        presentInlineOfferChoices();
      } else {
        postMessage("bot", `Moved to ${carouselPageLabel.textContent}.`);
      }
    }
    return true;
  }

  if ((cmd.includes("previous page") || cmd.includes("prev page")) && state.flowStep === FLOW_STEPS.OFFER_BROWSE) {
    if (state.offerPageIndex > 0) {
      state.offerPageIndex -= 1;
      renderCarouselPage();
      if (shouldRenderInlineOfferFlow()) {
        presentInlineOfferChoices();
      } else {
        postMessage("bot", `Moved to ${carouselPageLabel.textContent}.`);
      }
    }
    return true;
  }

  return false;
}

function routeFromAgentAssist(task = "") {
  const t = String(task || "").toLowerCase();
  if (t.includes("product")) return FLOW_STEPS.INTENT_DISCOVERY;
  if (t.includes("offer")) return FLOW_STEPS.INTENT_DISCOVERY;
  if (t.includes("troubleshoot")) return FLOW_STEPS.SUPPORT_DISCOVERY;
  if (t.includes("login") || t.includes("auth")) return FLOW_STEPS.EXISTING_AUTH_ENTRY;
  return FLOW_STEPS.HELPDESK_ENTRY;
}

function getRoutePatchForStep(nextStep) {
  if (nextStep === FLOW_STEPS.EXISTING_AUTH_ENTRY) {
    return { customerType: "existing", selectedService: "internet", intent: "home internet" };
  }
  return {};
}

function handleUnclearInput(message, fallbackPrompt) {
  const loopState = nextLoopGuard(
    state.context.loopGuard,
    state.flowStep,
    stableContextHash(state.context),
    3
  );
  applyContextPatch({
    loopGuard: {
      lastStep: loopState.lastStep,
      lastContextHash: loopState.lastContextHash,
      sameStepCount: loopState.sameStepCount
    }
  });
  if (loopState.stuck) {
    postMessage("bot", "Thanks for your patience. Let me reset this smoothly with one of these options.");
    showChoiceButtons(["Continue", "Go back", "Restart", "Agent assist"], (choice) => {
      postMessage("user", choice);
      if (choice === "Continue") {
        renderStep(state.flowStep);
        return;
      }
      if (choice === "Go back") {
        goBack();
        return;
      }
      if (choice === "Restart") {
        refreshChat();
        return;
      }
      applyContextPatch({ escalatedToAgent: true });
      transitionTo(FLOW_STEPS.WARM_AGENT_ROUTING, { activeTask: "clarification_support" }, { pushHistory: true });
    });
    logClient("info", "flow_loop_detected", { step: state.flowStep, sameStepCount: loopState.sameStepCount, source: "unclear_input" });
    return;
  }

  const outcome = getRetryOutcome(state.context.clarifyRetries, 3);
  applyContextPatch({ clarifyRetries: outcome.nextRetries });
  logClient("info", "clarify_retry_incremented", { retries: outcome.nextRetries, message });
  if (outcome.nextRetries > SLA_TARGETS.maxClarifyRetries) {
    logClient("error", "sla_clarification_retry_breach", {
      retries: outcome.nextRetries,
      targetRetries: SLA_TARGETS.maxClarifyRetries
    });
  }
  if (outcome.escalate) {
    applyContextPatch({ escalatedToAgent: true });
    logClient("info", "warm_agent_routed", { reason: "unclear_retries", retries: outcome.nextRetries });
    transitionTo(FLOW_STEPS.WARM_AGENT_ROUTING, { activeTask: "clarification_support" }, { pushHistory: true });
    return;
  }
  stepPrompt("UNCLEAR_INPUT", `${fallbackPrompt} If helpful, I can guide this step for you.`, {
    fallbackPrompt: `${fallbackPrompt} If helpful, I can guide this step for you.`
  });
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

    case FLOW_STEPS.GREETING_CONVERSATIONAL:
      transitionTo(FLOW_STEPS.CUSTOMER_STATUS_SELECTION, {}, { pushHistory: true, enforceContract: false });
      return;

    case FLOW_STEPS.CUSTOMER_STATUS_SELECTION:
      if (lower.includes("existing")) {
        transitionTo(
          FLOW_STEPS.EXISTING_AUTH_ENTRY,
          {
            customerType: "existing",
            selectedService: "internet",
            selectedEntryIntent: "Internet",
            intent: "home internet",
            activeTask: "sales",
            customerStatusAsked: true
          },
          { pushHistory: true }
        );
        return;
      }
      if (lower.includes("new")) {
        transitionTo(
          FLOW_STEPS.SERVICE_SELECTION,
          {
            customerType: "new",
            customerStatusAsked: true
          },
          { pushHistory: true }
        );
        return;
      }
      handleUnclearInput(message, "Please choose new client or existing client.");
      return;

    case FLOW_STEPS.SERVICE_SELECTION:
      if (lower.includes("internet")) {
        applyContextPatch({
          selectedService: "internet",
          intent: "home internet",
          selectedEntryIntent: "Internet",
          activeTask: "sales",
          selectedPlanId: null,
          internetPreference: null,
          quoteBuilder: {
            preferences: getQuoteDefaultsFromPreference("value"),
            lastPreview: [],
            lastPreviewAt: null
          }
        });
        transitionTo(FLOW_STEPS.INTERNET_ADDRESS_REQUEST, {}, { pushHistory: true });
        return;
      }
      if (lower.includes("mobility")) {
        applyContextPatch({
          selectedService: "mobility",
          intent: "mobility",
          selectedEntryIntent: "Mobility",
          activeTask: "sales"
        });
        transitionTo(FLOW_STEPS.INTENT_DISCOVERY, {}, { pushHistory: true, enforceContract: false });
        return;
      }
      if (lower.includes("landline") || lower.includes("home phone")) {
        applyContextPatch({
          selectedService: "landline",
          intent: "landline",
          selectedEntryIntent: "Landline",
          activeTask: "sales"
        });
        transitionTo(FLOW_STEPS.INTENT_DISCOVERY, {}, { pushHistory: true, enforceContract: false });
        return;
      }
      handleUnclearInput(message, "Please choose Internet, Mobility, or Landline.");
      return;

    case FLOW_STEPS.EXISTING_AUTH_ENTRY: {
      const parsed = parseExistingAuthInput(trimmed);
      if (!parsed) {
        transitionTo(FLOW_STEPS.EXISTING_AUTH_FAILURE_HARD_STOP, { existingAuthAttempt: { status: "failed" } }, { pushHistory: true });
        return;
      }
      applyContextPatch({ existingAuthAttempt: { ...parsed, status: "pending" } });
      transitionTo(FLOW_STEPS.EXISTING_AUTH_VALIDATE, {}, { pushHistory: true });
      return;
    }

    case FLOW_STEPS.EXISTING_AUTH_VALIDATE: {
      await processExistingAuthAttempt();
      return;
    }

    case FLOW_STEPS.EXISTING_AUTH_FAILURE_HARD_STOP:
      postMessage("bot", "I’m unable to proceed with this user account.");
      if (lower.includes("retry")) {
        transitionTo(FLOW_STEPS.EXISTING_AUTH_ENTRY, {}, { pushHistory: true });
        return;
      }
      if (lower.includes("end") || lower.includes("close") || lower.includes("stop")) {
        endChat();
        return;
      }
      handleUnclearInput(message, "Reply with 'retry' or 'end chat'.");
      return;

    case FLOW_STEPS.INTERNET_ADDRESS_REQUEST:
      if (state.context.addressAuth.awaitingConfirmation) {
        const pending = state.context.addressAuth.pendingInput || "";
        const suggestions = state.context.addressAuth.suggestions || [];
        const normalized = lower.trim();
        if (normalized.includes("use my entered") || normalized.includes("manual")) {
          finalizeServiceAddress(pending, "manual_confirmed");
          transitionTo(FLOW_STEPS.INTERNET_ADDRESS_VALIDATE, {}, { pushHistory: true, enforceContract: false });
          return;
        }
        const indexedChoice = Number(normalized);
        if (!Number.isNaN(indexedChoice) && indexedChoice >= 1 && indexedChoice <= suggestions.length) {
          const pick = suggestions[indexedChoice - 1];
          finalizeServiceAddress(normalizeAddressSuggestionLabel(pick), "typeahead_suggestion");
          transitionTo(FLOW_STEPS.INTERNET_ADDRESS_VALIDATE, {}, { pushHistory: true, enforceContract: false });
          return;
        }
        const matched = suggestions.find((item) => normalizeAddressSuggestionLabel(item).toLowerCase() === normalized);
        if (matched) {
          finalizeServiceAddress(normalizeAddressSuggestionLabel(matched), "typeahead_suggestion");
          transitionTo(FLOW_STEPS.INTERNET_ADDRESS_VALIDATE, {}, { pushHistory: true, enforceContract: false });
          return;
        }
        handleUnclearInput(message, "Please select a suggested address or reply 'use my entered address'.");
        return;
      }
      if (!isValidAddress(trimmed)) {
        logClient("error", "validation_address_failed", { value: trimmed, step: FLOW_STEPS.INTERNET_ADDRESS_REQUEST });
        handleUnclearInput(message, "Please provide a valid service address (example: 210 - 100 Galt Ave, Toronto, ON).");
        return;
      }
      try {
        const payload = await lookupAddresses(trimmed);
        const suggestions = payload?.suggestions || [];
        if (suggestions.length > 0) {
          presentAddressConfirmation(trimmed, suggestions);
          return;
        }
        finalizeServiceAddress(trimmed, "manual_confirmed_no_suggestions");
      } catch {
        finalizeServiceAddress(trimmed, "manual_confirmed_lookup_error");
      }
      transitionTo(FLOW_STEPS.INTERNET_ADDRESS_VALIDATE, {}, { pushHistory: true });
      return;

    case FLOW_STEPS.INTERNET_ADDRESS_VALIDATE:
      if (!state.context.serviceAddress || !state.context.serviceAddressValidated) {
        transitionTo(FLOW_STEPS.INTERNET_ADDRESS_REQUEST, {}, { pushHistory: true, enforceContract: false });
        return;
      }
      transitionTo(FLOW_STEPS.INTERNET_AVAILABILITY_RESULT, {}, { pushHistory: true, enforceContract: false });
      return;

    case FLOW_STEPS.INTERNET_AVAILABILITY_RESULT:
      transitionTo(FLOW_STEPS.INTERNET_PRIORITY_CAPTURE, {}, { pushHistory: true, enforceContract: false });
      return;

    case FLOW_STEPS.INTERNET_PRIORITY_CAPTURE: {
      if (/(quote|build my plan|compare)/i.test(trimmed)) {
        const defaults = getQuoteDefaultsFromPreference(state.context.internetPreference || "value");
        applyContextPatch({ quoteBuilder: { preferences: defaults } });
        await generateQuotePreview({ announce: true });
        transitionTo(FLOW_STEPS.INTERNET_PLAN_PITCH, {}, { pushHistory: true });
        return;
      }
      const preference = resolveInternetPreference(trimmed);
      if (!preference) {
        handleUnclearInput(message, "Please tell me your internet priority: speed, value, or performance.");
        return;
      }
      applyContextPatch({ internetPreference: preference });
      applyContextPatch({ quoteBuilder: { preferences: getQuoteDefaultsFromPreference(preference) } });
      transitionTo(FLOW_STEPS.INTERNET_PLAN_PITCH, {}, { pushHistory: true });
      return;
    }

    case FLOW_STEPS.INTERNET_PLAN_PITCH: {
      if (/(generate|refresh).*(quote)/i.test(lower) || /(quote).*(generate|refresh)/i.test(lower)) {
        await generateQuotePreview({ announce: true });
        return;
      }
      let plans = getInternetPlanOptions();
      if (!plans.length) {
        await generateQuotePreview({ announce: true });
        plans = getInternetPlanOptions();
      }
      if (!plans.length) {
        postMessage("bot", "I still couldn't generate plans. Please try Generate fresh quote once more.");
        return;
      }
      const selected = plans.find(
        (plan) => lower.includes(plan.name.toLowerCase()) || lower.includes(plan.id.toLowerCase()) || lower.includes(String(plan.monthlyPrice))
      );
      if (!selected) {
        handleUnclearInput(message, "Please select one of the internet plans shown, or say 'generate fresh quote'.");
        return;
      }
      applyContextPatch({ selectedPlanId: selected.id });
      transitionTo(FLOW_STEPS.PLAN_CONFIRMATION, {}, { pushHistory: true });
      return;
    }

    case FLOW_STEPS.PLAN_CONFIRMATION: {
      if (lower.includes("change")) {
        transitionTo(FLOW_STEPS.INTERNET_PLAN_PITCH, {}, { pushHistory: true });
        return;
      }
      if (!/(confirm|yes|ok|proceed)/i.test(lower)) {
        handleUnclearInput(message, "Please confirm the plan or say 'change plan'.");
        return;
      }
      const selectedPlan = getOfferByIdSafe(state.context.selectedPlanId);
      if (!selectedPlan) {
        transitionTo(FLOW_STEPS.INTERNET_PLAN_PITCH, {}, { pushHistory: true, enforceContract: false });
        return;
      }
      if (!(state.context.basket || []).some((item) => item.id === selectedPlan.id)) {
        const basket = [...(state.context.basket || []), selectedPlan];
        const previousCount = state.context.basket.length;
        applyContextPatch({ basket });
        renderBasket();
        announceDiscountQualification(previousCount, basket.length);
      }
      if (state.context.customerType === "new") {
        transitionTo(FLOW_STEPS.NEW_ONBOARD_COMBINED_CAPTURE, {}, { pushHistory: true });
        return;
      }
      transitionTo(FLOW_STEPS.CHECKOUT_INTENT_PROMPT, {}, { pushHistory: true });
      return;
    }

    case FLOW_STEPS.NEW_ONBOARD_COMBINED_CAPTURE: {
      const parsed = parseCombinedOnboardingInput(trimmed);
      if (!parsed || !isValidEmail(parsed.email) || !isValidCanadianPhone(parsed.phone) || !parsed.fullName) {
        postMessage("bot", "Please provide full name, valid email, and 10-digit Canadian phone in one message.");
        return;
      }
      const normalizedPhone = normalizeCanadianPhone(parsed.phone);
      const hash = await createIdentityHash(`${parsed.fullName}|${parsed.email}|${normalizedPhone}|${Date.now()}`);
      const secureRef = `${generateSecureRef()}-${hash}`;
      applyContextPatch({
        onboardingCombinedRaw: trimmed,
        newOnboarding: {
          fullName: parsed.fullName,
          email: parsed.email.toLowerCase(),
          phone: normalizedPhone,
          leadId: `lead_${Date.now()}`
        },
        authMeta: {
          mode: "new-client",
          phone: normalizedPhone,
          email: parsed.email.toLowerCase(),
          secureRef
        }
      });
      transitionTo(FLOW_STEPS.NEW_ACCOUNT_CREATED_CONFIRM, {}, { pushHistory: true });
      return;
    }

    case FLOW_STEPS.NEW_ACCOUNT_CREATED_CONFIRM:
      transitionTo(FLOW_STEPS.CHECKOUT_INTENT_PROMPT, {}, { pushHistory: true, enforceContract: false });
      return;

    case FLOW_STEPS.CHECKOUT_INTENT_PROMPT:
      if (lower.includes("checkout") || lower.includes("yes") || lower.includes("continue")) {
        transitionTo(
          FLOW_STEPS.PAYMENT_CARD_NUMBER,
          {
            paymentDraft: getEmptyPaymentDraft()
          },
          { pushHistory: true, enforceContract: false }
        );
        return;
      }
      if (lower.includes("mobility")) {
        routeToCrossSellCategory("mobility");
        transitionTo(FLOW_STEPS.OFFER_BROWSE, {}, { pushHistory: true, enforceContract: false });
        return;
      }
      if (lower.includes("landline") || lower.includes("home phone")) {
        routeToCrossSellCategory("landline");
        transitionTo(FLOW_STEPS.OFFER_BROWSE, {}, { pushHistory: true, enforceContract: false });
        return;
      }
      if (lower.includes("no") || lower.includes("not now")) {
        transitionTo(FLOW_STEPS.ORDER_CONFIRMED, {}, { pushHistory: true, enforceContract: false });
        return;
      }
      handleUnclearInput(message, "Reply with checkout, add mobility, add landline, or no thanks.");
      return;

    case FLOW_STEPS.PAYMENT_CARD_ENTRY:
      transitionTo(
        FLOW_STEPS.PAYMENT_CARD_NUMBER,
        {
          paymentDraft: getEmptyPaymentDraft()
        },
        { pushHistory: false, enforceContract: false }
      );
      return;

    case FLOW_STEPS.PAYMENT_CARD_NUMBER: {
      const digitsOnly = normalizeCardDigits(trimmed);
      if (!isValidCardNumber16(digitsOnly)) {
        postMessage("bot", "Please enter exactly 16 digits for your card number.");
        return;
      }
      submitCardNumberDigits(digitsOnly);
      return;
    }

    case FLOW_STEPS.PAYMENT_CARD_CVC: {
      const brand = state.context.paymentDraft.brand;
      const cvcDigits = trimmed.replace(/\D/g, "");
      if (!isValidPaymentCvc(cvcDigits, brand)) {
        postMessage("bot", brand === "amex" ? "Please enter a valid 4-digit Amex CVC." : "Please enter a valid 3-digit card CVC.");
        return;
      }
      applyContextPatch({
        paymentDraft: {
          cvc: cvcDigits,
          cvcValidated: true
        }
      });
      transitionTo(FLOW_STEPS.PAYMENT_CARD_POSTAL, {}, { pushHistory: true, enforceContract: false });
      return;
    }

    case FLOW_STEPS.PAYMENT_CARD_POSTAL: {
      const normalizedPostal = trimmed.toUpperCase().replace(/\s+/g, "");
      if (!isValidCanadianPostalCode(normalizedPostal)) {
        postMessage("bot", "Please enter a valid Canadian postal code (example: M5V 2T6).");
        return;
      }
      applyContextPatch({
        paymentDraft: {
          postal: normalizedPostal,
          postalValidated: true
        }
      });
      transitionTo(FLOW_STEPS.PAYMENT_CARD_CONFIRM, {}, { pushHistory: true, enforceContract: false });
      return;
    }

    case FLOW_STEPS.PAYMENT_CARD_CONFIRM:
      if (lower.includes("start over") || lower.includes("restart")) {
        transitionTo(
          FLOW_STEPS.PAYMENT_CARD_NUMBER,
          {
            paymentDraft: getEmptyPaymentDraft()
          },
          { pushHistory: true, enforceContract: false }
        );
        return;
      }
      if (!(lower.includes("confirm") || lower.includes("yes"))) {
        handleUnclearInput(message, "Please confirm payment or say start over.");
        return;
      }
      if (!state.context.paymentDraft.cardValidated || !state.context.paymentDraft.cvcValidated || !state.context.paymentDraft.postalValidated) {
        transitionTo(
          FLOW_STEPS.PAYMENT_CARD_NUMBER,
          {
            paymentDraft: getEmptyPaymentDraft()
          },
          { pushHistory: true, enforceContract: false }
        );
        return;
      }
      applyContextPatch({
        cardEntry: {
          brand: state.context.paymentDraft.brand,
          maskedLast4: `**** **** **** ${state.context.paymentDraft.last4}`,
          cvcValidated: true,
          postalValidated: true,
          tokenized: true
        },
        payment: {
          method: state.context.paymentDraft.brand,
          expectedLast4: state.context.paymentDraft.last4,
          last4Confirmed: true,
          cvvValidated: true,
          verified: true,
          token: `tok_${Date.now()}`
        }
      });
      postMessage("bot", `${formatCardBrandLabel(state.context.paymentDraft.brand)} card validated and tokenized. Proceeding to shipping.`);
      transitionTo(FLOW_STEPS.SHIPPING_SELECTION, {}, { pushHistory: true, enforceContract: false });
      return;
    

    case FLOW_STEPS.EXISTING_AREA_CODE_CHECK:
      if (!/^\d{3}$/.test(trimmed) || !isValidCanadianAreaCode(trimmed)) {
        logClient("error", "validation_area_code_failed", { value: trimmed, step: FLOW_STEPS.EXISTING_AREA_CODE_CHECK });
        handleUnclearInput(message, "Please enter a valid 3-digit Canadian area code (for example: 416, 647, or 986).");
        return;
      }
      transitionTo(
        FLOW_STEPS.EXISTING_AUTH_MODE,
        {
          areaCode: trimmed,
          areaCodeSource: "user_input"
        },
        { pushHistory: true }
      );
      return;

    case FLOW_STEPS.NEW_AREA_CODE_ENTRY:
      if (!/^\d{3}$/.test(trimmed) || !isValidCanadianAreaCode(trimmed)) {
        handleUnclearInput(message, "Please enter a valid 3-digit Canadian area code (for example: 416, 647, or 986).");
        logClient("error", "validation_area_code_failed", { value: trimmed, viaChatInput: true, step: FLOW_STEPS.NEW_AREA_CODE_ENTRY });
        return;
      }
      if (state.context.customerType === "new") {
        applyContextPatch({
          areaCode: trimmed,
          areaCodeSource: "user_input"
        });
        continueFromSelectedIntent({ pushHistory: true });
        return;
      }
      transitionTo(
        FLOW_STEPS.EXISTING_AUTH_MODE,
        {
          areaCode: trimmed,
          areaCodeSource: "user_input"
        },
        { pushHistory: true }
      );
      return;

    case FLOW_STEPS.EXISTING_AUTH_IDENTIFIER: {
      const looksLikeEmail = trimmed.includes("@");
      const normalizedIdentifier = looksLikeEmail ? trimmed.toLowerCase() : normalizeCanadianPhone(trimmed);
      if (looksLikeEmail && !isValidEmail(normalizedIdentifier)) {
        logClient("error", "validation_email_failed", { value: trimmed, step: FLOW_STEPS.EXISTING_AUTH_IDENTIFIER });
        postMessage("bot", "Please enter a valid email format (example: name@example.com).");
        return;
      }
      if (!looksLikeEmail && !isValidCanadianPhone(trimmed)) {
        logClient("error", "validation_phone_failed", { value: trimmed, step: FLOW_STEPS.EXISTING_AUTH_IDENTIFIER });
        postMessage("bot", "Please enter a valid 10-digit Canadian phone number.");
        return;
      }
      authIdentifierInput.value = normalizedIdentifier;
      logClient("info", "auth_attempt", { identifier: normalizedIdentifier, viaChatInput: true });
      const user = resolveUserFromIdentifier(normalizedIdentifier);
      if (!user) {
        postMessage("bot", "Authentication failed. Please use a whitelisted profile: Robert, George, or Samantha.");
        logClient("error", "auth_failure", { identifier: trimmed, viaChatInput: true });
        return;
      }
      finalizeExistingAuthentication(user, "manual", normalizedIdentifier);
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
      if (routeHelpdeskSelection(trimmed, { pushHistory: true })) {
        return;
      }
      handleUnclearInput(message, "Please choose one service: Mobility, Internet, Landline, or Bundle.");
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
        finishPath(PATH_STATUS.COMPLETED, { outcome: "support_resolved", viaChatInput: true });
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
        finishPath(PATH_STATUS.COMPLETED, { outcome: "hardware_resolved", viaChatInput: true });
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
      if (lower.includes("service") || lower.includes("offer") || lower.includes("product") || lower.includes("sales")) {
        transitionTo(FLOW_STEPS.HELPDESK_ENTRY, { activeTask: "sales" }, { pushHistory: true, enforceContract: false });
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
      handleUnclearInput(message, "Please tell me if you want another service offer or no further help.");
      return;

    case FLOW_STEPS.WARM_AGENT_ROUTING:
      applyContextPatch({ activeTask: trimmed || "clarification_support", escalatedToAgent: true });
      logClient("info", "warm_agent_resolved", { chosenTask: trimmed || "clarification_support", viaChatInput: true });
      transitionTo(FLOW_STEPS.AGENT_ASSIST_CLARIFY, {}, { pushHistory: true });
      return;

    case FLOW_STEPS.AGENT_ASSIST_CLARIFY: {
      const nextStep = routeFromAgentAssist(state.context.activeTask || trimmed);
      logClient("info", "warm_agent_re_routed_step", { activeTask: state.context.activeTask || trimmed, nextStep, viaChatInput: true });
      transitionTo(nextStep, getRoutePatchForStep(nextStep), { pushHistory: true, enforceContract: false });
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
      if (!isValidEmail(trimmed)) {
        logClient("error", "validation_email_failed", { value: trimmed, step: FLOW_STEPS.NEW_ONBOARD_EMAIL });
        postMessage("bot", "Please enter a valid email address (example: name@example.com).");
        return;
      }
      transitionTo(FLOW_STEPS.NEW_ONBOARD_PHONE, { newOnboarding: { email: trimmed.toLowerCase() } }, { pushHistory: true });
      return;

    case FLOW_STEPS.NEW_ONBOARD_PHONE:
      if (!isValidCanadianPhone(trimmed)) {
        logClient("error", "validation_phone_failed", { value: trimmed, step: FLOW_STEPS.NEW_ONBOARD_PHONE });
        postMessage("bot", "Please enter a valid 10-digit Canadian phone number (example: 4165511192).");
        return;
      }
      const normalizedPhone = normalizeCanadianPhone(trimmed);
      transitionTo(
        FLOW_STEPS.NEW_ONBOARD_ADDRESS,
        {
          newOnboarding: { phone: normalizedPhone, leadId: `lead_${Date.now()}` },
          customerType: "new"
        },
        { pushHistory: true }
      );
      const hash = await createIdentityHash(
        `${state.context.newOnboarding.fullName || ""}|${state.context.newOnboarding.email || ""}|${normalizedPhone}|${Date.now()}`
      );
      const secureRef = `${generateSecureRef()}-${hash}`;
      applyContextPatch({
        authMeta: {
          mode: "new-client",
          phone: normalizedPhone,
          email: state.context.newOnboarding.email,
          secureRef
        }
      });
      setStatus();
      postMessage(
        "bot",
        `Profile captured. Name: ${state.context.newOnboarding.fullName}, Email: ${state.context.newOnboarding.email}, Phone: ${formatPhone(normalizedPhone)}.`
      );
      logClient("info", "new_customer_created", { fullName: state.context.newOnboarding.fullName, email: state.context.newOnboarding.email, phone: normalizedPhone });
      return;

    case FLOW_STEPS.NEW_ONBOARD_ADDRESS:
      if (!isValidAddress(trimmed)) {
        logClient("error", "validation_address_failed", { value: trimmed, step: FLOW_STEPS.NEW_ONBOARD_ADDRESS });
        postMessage("bot", "Please enter a full address (example: 210 - 100 Galt Ave, Toronto, ON).");
        return;
      }
      applyContextPatch({ newOnboarding: { address: trimmed }, serviceAddress: trimmed, serviceAddressValidated: false });
      transitionTo(FLOW_STEPS.NEW_AREA_CODE_ENTRY, {}, { pushHistory: true });
      return;

    case FLOW_STEPS.VALIDATION_ADDRESS_CAPTURE: {
      const profileAddress = state.context.authUser?.prefilledAddress || null;
      const onboardingAddress = state.context.newOnboarding?.address || null;
      if (lower.includes("profile") && profileAddress) {
        applyContextPatch({ serviceAddress: profileAddress, serviceAddressValidated: true, addressCaptureRetries: 0 });
        postMessage("bot", `Using profile service address: ${profileAddress}.`);
        transitionTo(FLOW_STEPS.ELIGIBILITY_CHECK, {}, { pushHistory: true });
        return;
      }
      if ((lower.includes("onboarding") || lower.includes("signup")) && onboardingAddress) {
        applyContextPatch({ serviceAddress: onboardingAddress, serviceAddressValidated: true, addressCaptureRetries: 0 });
        postMessage("bot", `Using onboarding service address: ${onboardingAddress}.`);
        transitionTo(FLOW_STEPS.ELIGIBILITY_CHECK, {}, { pushHistory: true });
        return;
      }
      if (!isValidAddress(trimmed)) {
        const retries = Number(state.context.addressCaptureRetries || 0) + 1;
        applyContextPatch({ addressCaptureRetries: retries });
        logClient("error", "validation_address_failed", { value: trimmed, retries, step: FLOW_STEPS.VALIDATION_ADDRESS_CAPTURE });
        if (retries >= 3) {
          postMessage("bot", "I still need a valid service address. You can select an address on file or enter one manually (example: 210 - 100 Galt Ave, Toronto, ON).");
          const options = [];
          if (profileAddress) options.push("Use profile address");
          if (onboardingAddress) options.push("Use onboarding address");
          options.push("Enter a new address");
          showChoiceButtons(options, (choice) => {
            postMessage("user", choice);
            if (choice === "Use profile address" && profileAddress) {
              applyContextPatch({ serviceAddress: profileAddress, serviceAddressValidated: true, addressCaptureRetries: 0 });
              transitionTo(FLOW_STEPS.ELIGIBILITY_CHECK, {}, { pushHistory: true });
              return;
            }
            if (choice === "Use onboarding address" && onboardingAddress) {
              applyContextPatch({ serviceAddress: onboardingAddress, serviceAddressValidated: true, addressCaptureRetries: 0 });
              transitionTo(FLOW_STEPS.ELIGIBILITY_CHECK, {}, { pushHistory: true });
              return;
            }
            postMessage("bot", "Please type your full service address.");
            setChatInputHint("Service address");
          });
          return;
        }
        postMessage("bot", "Please enter a full service address (street, city, province).");
        return;
      }
      applyContextPatch({ serviceAddress: trimmed, serviceAddressValidated: true, addressCaptureRetries: 0 });
      postMessage("bot", `Thanks. I will validate service at: ${trimmed}.`);
      transitionTo(FLOW_STEPS.ELIGIBILITY_CHECK, {}, { pushHistory: true });
      return;
    }

    case FLOW_STEPS.INTENT_DISCOVERY: {
      const deterministicIntent = parseSalesIntentDeterministic(trimmed);
      const detected = deterministicIntent
        ? { intent: deterministicIntent, confidence: 1, entities: {}, mode: "deterministic", fallbackUsed: false }
        : await detectIntent(trimmed);
      if (deterministicIntent) {
        logClient("info", "llm_mode", {
          mode: "deterministic",
          confidence: 1,
          intent: deterministicIntent
        });
      }
      const intent = detected?.intent;
      if (!intent) {
        handleUnclearInput(message, "Please tell me if you want mobility, home internet, landline, or bundle.");
        return;
      }
      if (intent === "human_handoff") {
        applyContextPatch({ escalatedToAgent: true });
        logClient("info", "warm_agent_routed", { reason: "human_handoff_intent" });
        transitionTo(FLOW_STEPS.WARM_AGENT_ROUTING, { activeTask: "sales_guidance" }, { pushHistory: true });
        return;
      }

      const entities = detected?.entities || {};
      transitionTo(
        FLOW_STEPS.SERVICE_CLARIFICATION,
        {
          intent,
          activeTask: "sales",
          sessionFlags: {
            orderCompleted: false
          },
          salesProfile: {
            serviceType: intent,
            speedPriority: entities.speedPriority || null,
            byodChoice: null,
            phonePreference: entities.devicePreference || null,
            linePreference: null,
            callingPlan: entities.callingRegion || null,
            bundleSize: null,
            stage: null,
            awaitingOfferContinuation: false,
            lastSelectedCategory: null,
            crossSellOptions: []
          },
          promoState: {
            candidates: [],
            appliedPromo: null,
            lastAnnouncementKey: null
          }
        },
        { pushHistory: true }
      );
      return;
    }

    case FLOW_STEPS.SERVICE_CLARIFICATION:
      if (state.context.intent === "home internet") {
        if (!/(fast|balanc|upload)/i.test(trimmed)) {
          handleUnclearInput(message, "For internet, tell me if your priority is fastest speed, balanced value, or upload-heavy performance.");
          return;
        }
        applyContextPatch({ salesProfile: { speedPriority: trimmed } });
        routeAfterSalesClarification({ pushHistory: true });
        return;
      }
      if (state.context.intent === "mobility") {
        if (!state.context.salesProfile.byodChoice) {
          if (/(yes|bring|own|byod)/i.test(trimmed)) {
            applyContextPatch({ salesProfile: { byodChoice: "byod", phonePreference: "BYOD" } });
            postMessage("bot", "Great. Do you need a Canada-only, Canada + US, or International calling plan?");
            return;
          }
          if (/(no|new phone|need phone|device)/i.test(trimmed)) {
            applyContextPatch({ salesProfile: { byodChoice: "new_device" } });
            postMessage("bot", "Perfect. Which device family do you prefer: iPhone, Samsung Galaxy, Google Pixel, or other?");
            return;
          }
          handleUnclearInput(message, "Please tell me if you are bringing your own phone (yes) or need a new phone (no).");
          return;
        }
        if (state.context.salesProfile.byodChoice === "new_device" && !state.context.salesProfile.phonePreference) {
          if (!/(iphone|samsung|pixel|other|android|ios)/i.test(trimmed)) {
            handleUnclearInput(message, "Please tell me your phone preference: iPhone, Samsung, Google Pixel, or other.");
            return;
          }
          applyContextPatch({ salesProfile: { phonePreference: trimmed } });
          postMessage("bot", "Great. Do you need a Canada-only, Canada + US, or International calling plan?");
          return;
        }
        if (!/(canada|us|international)/i.test(trimmed)) {
          handleUnclearInput(message, "Please specify calling plan: Canada, Canada + US, or International.");
          return;
        }
        applyContextPatch({ salesProfile: { callingPlan: trimmed } });
        routeAfterSalesClarification({ pushHistory: true });
        return;
      }
      if (state.context.intent === "bundle") {
        if (!/(2|3)/.test(trimmed)) {
          handleUnclearInput(message, "Please choose a 2-service or 3-service bundle.");
          return;
        }
        applyContextPatch({ salesProfile: { bundleSize: trimmed.includes("3") ? 3 : 2 } });
        routeAfterSalesClarification({ pushHistory: true });
        return;
      }
      if (!state.context.salesProfile.linePreference) {
        if (/(new|new line)/i.test(trimmed)) {
          applyContextPatch({ salesProfile: { linePreference: "new_line" } });
          postMessage("bot", "Thanks. For landline calling, do you need local calling or international minutes?");
          return;
        }
        if (/(keep|existing|port)/i.test(trimmed)) {
          applyContextPatch({ salesProfile: { linePreference: "keep_existing" } });
          postMessage("bot", "Thanks. For landline calling, do you need local calling or international minutes?");
          return;
        }
        handleUnclearInput(message, "For landline, please choose new line or keep existing number.");
        return;
      }
      if (!/(local|international)/i.test(trimmed)) {
        handleUnclearInput(message, "For landline, please specify local calling or international minutes.");
        return;
      }
      applyContextPatch({ salesProfile: { callingPlan: trimmed } });
      routeAfterSalesClarification({ pushHistory: true });
      return;
    

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
      if (state.context.salesProfile.awaitingOfferContinuation) {
        if (handleOfferContinuationChoice(trimmed)) {
          return;
        }
        if (lower === "no" || lower.includes("more") || lower.includes("another")) {
          presentCrossSellChoices();
          return;
        }
        const optionText = (state.context.salesProfile.crossSellOptions || [])
          .map((category) => CATEGORY_LABELS[category])
          .join(", ");
        postMessage(
          "bot",
          optionText
            ? `You can say 'that is all' to continue, or ask for ${optionText} offers.`
            : "You can say 'that is all' to continue, or ask to see other offers."
        );
        return;
      }
      {
        const activeCategory = getActiveOfferCategory();
        const inlineFlow = shouldInlineOfferCategory(activeCategory);
        const inlineOffers = getFilteredOffersForCategory(activeCategory, { maxResults: 3 });
        if (inlineFlow) {
          const typedOffer = inlineOffers.find((offer) => {
            const normalizedName = String(offer.name || "").toLowerCase();
            return lower.includes(normalizedName) || lower.includes(String(offer.id || "").toLowerCase());
          });
          if (typedOffer && (lower.includes("add") || lower.includes("select") || lower.includes("choose"))) {
            addOfferToBasket(typedOffer);
            return;
          }
          if (lower.includes("show") || lower.includes("list") || lower.includes("offers")) {
            presentInlineOfferChoices(activeCategory);
            return;
          }
        }
      }
      if ((lower.includes("that is all") || lower.includes("that is it") || lower.includes("continue")) && state.context.basket.length > 0) {
        transitionTo(FLOW_STEPS.BASKET_REVIEW, {}, { pushHistory: true });
        return;
      }
      if (lower.includes("add mobility")) {
        routeToCrossSellCategory("mobility");
        return;
      }
      if (lower.includes("add internet") || lower.includes("home internet")) {
        routeToCrossSellCategory("home internet");
        return;
      }
      if (lower.includes("add landline") || lower.includes("add home phone")) {
        routeToCrossSellCategory("landline");
        return;
      }
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
        if (shouldRenderInlineOfferFlow()) {
          presentInlineOfferChoices("mobility");
        } else {
          postMessage("bot", `Moved to ${carouselPageLabel.textContent}.`);
        }
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
        if (shouldRenderInlineOfferFlow()) {
          presentInlineOfferChoices("landline");
        } else {
          postMessage("bot", `Moved to ${carouselPageLabel.textContent}.`);
        }
        return;
      }
      if (shouldRenderInlineOfferFlow()) {
        postMessage(
          "bot",
          "You can say 'add' with an offer name, ask to see offers again, continue, or choose another category."
        );
      } else {
        postMessage(
          "bot",
          "I can help with this step. You can say 'next page', 'previous page', 'checkout', 'go back', or ask for clarification."
        );
      }
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

    case FLOW_STEPS.POST_CHAT_RATING: {
      const rating = Number((trimmed.match(/[1-5]/) || [])[0]);
      if (!rating) {
        handleUnclearInput(message, "Please provide a rating from 1 to 5 stars.");
        return;
      }
      applyContextPatch({ agentRating: rating });
      logClient("info", "agent_rating_submitted", { rating, scope: "post_checkout", viaChatInput: true });
      if (rating < 3) {
        transitionTo(FLOW_STEPS.POST_CHAT_FEEDBACK, {}, { pushHistory: true, enforceContract: false });
        return;
      }
      postMessage("bot", "Thank you for your rating.");
      transitionTo(FLOW_STEPS.ORDER_CONFIRMED, {}, { pushHistory: true, enforceContract: false });
      return;
    }

    case FLOW_STEPS.POST_CHAT_FEEDBACK:
      if (!trimmed) {
        handleUnclearInput(message, "Please share what we could improve.");
        return;
      }
      applyContextPatch({ agentFeedback: trimmed });
      logClient("info", "agent_feedback_submitted", { feedback: trimmed, rating: state.context.agentRating, scope: "post_checkout" });
      postMessage("bot", "Thanks for the feedback. We appreciate it.");
      transitionTo(FLOW_STEPS.ORDER_CONFIRMED, {}, { pushHistory: true, enforceContract: false });
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
      if ((lower.includes("existing") || lower.includes("saved")) && state.context.customerType !== "existing") {
        postMessage("bot", "Saved payment can only be used by existing authenticated clients. Please choose Visa, MasterCard, Amex, or financing.");
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
  applyContextPatch({
    sla: {
      chatOpenedAt: Date.now(),
      firstReplyAt: null,
      intentLockedAt: null,
      offerPresentedAt: null,
      checkoutStartedAt: null,
      orderConfirmedAt: null,
      breachFlags: {
        firstReply: false,
        intentLock: false,
        offerTime: false,
        checkoutTime: false
      }
    }
  });
  if (skipConnecting) {
    transitionTo(FLOW_STEPS.GREETING_CONVERSATIONAL, {}, { pushHistory: false, enforceContract: false });
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
    state.chatStarted = true;
    applyContextPatch({
      sla: {
        chatOpenedAt: Date.now(),
        firstReplyAt: null,
        intentLockedAt: null,
        offerPresentedAt: null,
        checkoutStartedAt: null,
        orderConfirmedAt: null,
        breachFlags: {
          firstReply: false,
          intentLock: false,
          offerTime: false,
          checkoutTime: false
        }
      }
    });
  } else {
    transitionTo(FLOW_STEPS.GREETING_CONVERSATIONAL, {}, { pushHistory: true, enforceContract: false });
  }
  state.pendingAuthMode = null;
  if (mode === "auto") {
    const user = mockUsers.find((candidate) => candidate.id === "u1001");
    if (user) {
      applyContextPatch({
        customerType: "existing",
        selectedService: "internet",
        selectedEntryIntent: "Internet",
        intent: "home internet",
        activeTask: "sales",
        customerStatusAsked: true
      });
      void finalizeExistingAuthentication(user, "auto", user.phone, { routeAfterAuth: false });
      transitionTo(FLOW_STEPS.INTERNET_ADDRESS_REQUEST, {}, { pushHistory: true, enforceContract: false });
      return;
    }
  }
  transitionTo(
    FLOW_STEPS.EXISTING_AUTH_ENTRY,
    {
      customerType: "existing",
      selectedService: "internet",
      selectedEntryIntent: "Internet",
      intent: "home internet",
      activeTask: "sales",
      customerStatusAsked: true
    },
    { pushHistory: true, enforceContract: false }
  );
  postMessage("bot", "Login selected. I’ll verify your existing account so we can continue with internet offers.");
}

chatLauncher.addEventListener("click", () => {
  const opening = chatWidget.classList.contains("hidden");
  toggleChatWidget();
  logClient("info", opening ? "chat_widget_opened" : "chat_widget_minimized");
});
openChatHeader.addEventListener("click", () => runTopLoginFlow("auto"));
openChatOffers.addEventListener("click", () => {
  openChatWidget();
  startConversation();
  logClient("info", "chat_offer_cta_clicked");
});
closeChat.addEventListener("click", () => {
  closeChatWidget();
  logClient("info", "chat_widget_minimized");
});

autoLoginBtn.addEventListener("click", () => runTopLoginFlow("auto"));
manualLoginBtn.addEventListener("click", () => runTopLoginFlow("manual"));

newCustomerBtn.addEventListener("click", () => {
  openChatWidget();
  if (!state.chatStarted) {
    state.chatStarted = true;
    applyContextPatch({
      sla: {
        chatOpenedAt: Date.now(),
        firstReplyAt: null,
        intentLockedAt: null,
        offerPresentedAt: null,
        checkoutStartedAt: null,
        orderConfirmedAt: null,
        breachFlags: {
          firstReply: false,
          intentLock: false,
          offerTime: false,
          checkoutTime: false
        }
      }
    });
  }
  postMessage("user", "New client");
  transitionTo(
    FLOW_STEPS.SERVICE_SELECTION,
    {
      customerType: "new",
      selectedEntryIntent: "Internet",
      activeTask: "sales",
      customerStatusAsked: true
    },
    { pushHistory: true, enforceContract: false }
  );
});

existingCustomerBtn.addEventListener("click", () => {
  openChatWidget();
  if (!state.chatStarted) {
    state.chatStarted = true;
    applyContextPatch({
      sla: {
        chatOpenedAt: Date.now(),
        firstReplyAt: null,
        intentLockedAt: null,
        offerPresentedAt: null,
        checkoutStartedAt: null,
        orderConfirmedAt: null,
        breachFlags: {
          firstReply: false,
          intentLock: false,
          offerTime: false,
          checkoutTime: false
        }
      }
    });
  }
  postMessage("user", "Existing Bell client");
  transitionTo(
    FLOW_STEPS.EXISTING_AUTH_ENTRY,
    {
      customerType: "existing",
      selectedService: "internet",
      selectedEntryIntent: "Internet",
      intent: "home internet",
      activeTask: "sales",
      customerStatusAsked: true
    },
    { pushHistory: true, enforceContract: false }
  );
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
  logClient("error", "sla_order_success_breach", {
    reason: "order_blocked_before_confirmation",
    targetRatePercent: SLA_TARGETS.minOrderSuccessRatePercent
  });
});

carouselPrevBtn.addEventListener("click", () => {
  if (state.offerPageIndex === 0) return;
  state.offerPageIndex -= 1;
  renderCarouselPage();
  logClient("info", "carousel_page_changed", { direction: "prev", pageIndex: state.offerPageIndex });
  if (state.flowStep === FLOW_STEPS.OFFER_BROWSE) {
    if (shouldRenderInlineOfferFlow()) {
      presentInlineOfferChoices();
    } else {
      postMessage("bot", `Moved to ${carouselPageLabel.textContent}.`);
    }
  }
});

carouselNextBtn.addEventListener("click", () => {
  if (state.offerPageIndex >= CATEGORY_PAGES.length - 1) return;
  state.offerPageIndex += 1;
  renderCarouselPage();
  logClient("info", "carousel_page_changed", { direction: "next", pageIndex: state.offerPageIndex });
  if (state.flowStep === FLOW_STEPS.OFFER_BROWSE) {
    if (shouldRenderInlineOfferFlow()) {
      presentInlineOfferChoices();
    } else {
      postMessage("bot", `Moved to ${carouselPageLabel.textContent}.`);
    }
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

if (refreshMetricsBtn) {
  refreshMetricsBtn.addEventListener("click", () => {
    logClient("info", "metrics_refresh_clicked");
    refreshMetricsDashboard({ silent: true });
  });
}

if (metricsRouteFilter) {
  metricsRouteFilter.addEventListener("change", () => {
    state.metricsRouteFilter = metricsRouteFilter.value || "all";
    refreshMetricsDashboard({ silent: true });
  });
}

if (languageInputs.length > 0) {
  languageInputs.forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      setConversationLanguage(input.value);
    });
  });
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;
  chatInput.value = "";
  let userMessage = message;
  if (state.flowStep === FLOW_STEPS.PAYMENT_CVV || state.flowStep === FLOW_STEPS.PAYMENT_CARD_CVC) {
    userMessage = "***";
  } else if (state.flowStep === FLOW_STEPS.PAYMENT_CARD_NUMBER) {
    const digits = normalizeCardDigits(message);
    userMessage = digits.length >= 4 ? `**** **** **** ${digits.slice(-4)}` : "**** **** **** ****";
  }
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
  validateOfferCoverage();
  updateJourneyProgress(FLOW_STEPS.INIT_CONNECTING);
  updateLlmStatusUi({ configured: false, connected: false, model: null });
  refreshLlmStatus({ silent: true });
  setInterval(() => refreshLlmStatus({ silent: true }), 30000);
  refreshMetricsDashboard({ silent: true });
  setInterval(() => refreshMetricsDashboard({ silent: true }), 60000);
}

boot();
