export function getRetryOutcome(currentRetries = 0, maxRetries = 3) {
  const nextRetries = Number(currentRetries || 0) + 1;
  return {
    nextRetries,
    escalate: nextRetries >= maxRetries
  };
}

export function resolveRouteFromStep(step = "", activeTask = "") {
  const s = String(step || "").toUpperCase();
  const t = String(activeTask || "").toLowerCase();
  if (s.includes("SUPPORT") || s.includes("HARDWARE") || t.includes("support") || t.includes("troubleshoot")) return "support";
  if (s.includes("CORPORATE") || t.includes("corporate")) return "corporate";
  if (s.includes("WARM_AGENT") || s.includes("AGENT_") || t.includes("agent")) return "agent";
  return "sales";
}

function esc(text = "") {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function fmtMoney(value = 0, currency = "CAD") {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function normalizeLegacyPayload(payload = {}) {
  if (payload.order || payload.customer || payload.addresses || payload.payment || payload.lineItems || payload.charges) {
    return payload;
  }

  return {
    brand: {
      companyName: "Bell Canada",
      channel: "Corporate Assisted Digital Checkout"
    },
    order: {
      orderId: payload.orderId || "N/A",
      confirmationCode: payload.confirmationCode || "N/A",
      createdAt: payload.createdAt || new Date().toISOString(),
      currency: "CAD",
      status: "Confirmed"
    },
    customer: {
      clientType: payload.clientType || "personal",
      displayName: payload.displayName || "Valued Customer",
      contactPhone: payload.contactPhone || "not provided",
      contactEmail: payload.contactEmail || "not provided",
      accountStatus: payload.accountStatus || "Account on file"
    },
    addresses: {
      billingAddress: payload.billingAddress || payload.shippingAddress || "Not provided",
      shippingAddress: payload.shippingAddress || "Not provided",
      serviceAddress: payload.serviceAddress || payload.shippingAddress || "Not provided"
    },
    payment: {
      methodLabel: payload.paymentMethod || "Payment card",
      maskedAccount: payload.maskedAccount || "N/A",
      verificationStatus: payload.verificationStatus || "Verified",
      chargeToday: Number(payload.chargeToday || 0)
    },
    lineItems: (payload.items || []).map((item) => ({
      name: item.name,
      category: item.category || "service",
      deviceModel: item.deviceModel || "-",
      monthlyPrice: Number(item.monthlyPrice || 0),
      oneTimePrice: Number(item.oneTimePrice || 0),
      quantity: Number(item.quantity || 1)
    })),
    recurring: {
      serviceMonthly: Number(payload.serviceMonthly || 0),
      financingMonthly: Number(payload.financing?.monthlyPayment || 0),
      combinedMonthly: Number(payload.combinedMonthly || 0)
    },
    financing: payload.financing
      ? {
          amountFinanced: Number(payload.financing.amount || 0),
          upfrontPayment: Number(payload.financing.upfrontPayment || 0),
          termMonths: payload.financing.termMonths || null,
          monthlyPayment: Number(payload.financing.monthlyPayment || 0),
          decisionId: payload.financing.decisionId || "N/A"
        }
      : null,
    charges: {
      installationFees: Number(payload.installationFees || 0),
      oneTimeSubtotal: Number(payload.chargeToday || 0),
      monthlySubtotal: Number(payload.serviceMonthly || 0),
      estimatedTaxToday: 0,
      estimatedTaxMonthly: 0,
      todayTotal: Number(payload.chargeToday || 0),
      monthlyTotal: Number(payload.combinedMonthly || 0)
    },
    promotions: payload.promotions || [],
    disclaimer: "Mock confirmation for prototype use."
  };
}

export function buildReceiptHtml(payload = {}) {
  const normalized = normalizeLegacyPayload(payload);
  const {
    brand = {},
    order = {},
    customer = {},
    addresses = {},
    payment = {},
    lineItems = [],
    recurring = {},
    financing = null,
    promotions = [],
    charges = {},
    disclaimer = "Mock confirmation for prototype use."
  } = normalized;

  const currency = order.currency || "CAD";

  const itemRows = lineItems
    .map(
      (item) =>
        `<tr>
          <td>${esc(item.name)}</td>
          <td>${esc(item.category || "-")}</td>
          <td>${esc(item.deviceModel || "-")}</td>
          <td>${esc(item.quantity || 1)}</td>
          <td>${fmtMoney(item.oneTimePrice || 0, currency)}</td>
          <td>${fmtMoney(item.monthlyPrice || 0, currency)}</td>
        </tr>`
    )
    .join("");

  const financingBlock = financing
    ? `<div class="section">
        <h3>Bell Smart Financing</h3>
        <p><strong>Amount financed:</strong> ${fmtMoney(financing.amountFinanced || financing.amount || 0, currency)}</p>
        <p><strong>Upfront payment:</strong> ${fmtMoney(financing.upfrontPayment || 0, currency)}</p>
        <p><strong>Term:</strong> ${esc(financing.termMonths)} months</p>
        <p><strong>Monthly financing payment:</strong> ${fmtMoney(financing.monthlyPayment || 0, currency)}</p>
        <p>Decision reference: ${esc(financing.decisionId || "N/A")}</p>
      </div>`
    : "";

  const promotionsBlock = promotions.length
    ? `<div class="section">
        <h3>Promotions Applied</h3>
        ${promotions
          .map((promo) => `<p><strong>${esc(promo.title || "Promotion")}:</strong> ${esc(promo.description || "Offer applied.")}</p>`)
          .join("")}
      </div>`
    : "";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Bell Corporate Order Confirmation</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #1f2f46; background: #fff; }
    .head { background: #00549a; color: #fff; padding: 16px 18px; border-radius: 10px; }
    .head .sub { font-size: 12px; opacity: 0.95; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border-bottom: 1px solid #dce3ee; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f4f8ff; }
    .section { margin-top: 16px; padding: 12px; border: 1px solid #dce3ee; border-radius: 8px; }
    .section h3 { margin: 0 0 8px 0; }
    .totals-row strong { color: #003a70; }
    .actions { margin-top: 20px; display: flex; gap: 8px; }
    button { border: 1px solid #00549a; color: #00549a; background: #fff; padding: 8px 12px; border-radius: 8px; cursor: pointer; }
    .small { font-size: 12px; color: #5b6575; margin-top: 12px; }
    .grid { display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .grid > div { background: #fbfdff; border: 1px solid #e4ebf5; border-radius: 8px; padding: 10px; }
  </style>
</head>
<body>
  <div class="head">
    <h2>Bell Corporate Order Confirmation</h2>
    <div class="sub">${esc(brand.companyName || "Bell Canada")} | ${esc(brand.channel || "Corporate Assisted Digital Checkout")} | Generated ${esc(order.createdAt || new Date().toISOString())}</div>
  </div>
  <div class="section">
    <h3>Order Overview</h3>
    <p><strong>Order ID:</strong> ${esc(order.orderId || "N/A")}</p>
    <p><strong>Confirmation Code:</strong> ${esc(order.confirmationCode || "N/A")}</p>
    <p><strong>Status:</strong> ${esc(order.status || "Confirmed")}</p>
    <p><strong>Date:</strong> ${esc(order.createdAt || new Date().toISOString())}</p>
    <p><strong>Currency:</strong> ${esc(currency)}</p>
  </div>
  <div class="section">
    <h3>Customer & Account</h3>
    <p><strong>Client Type:</strong> ${esc(customer.clientType || "personal")}</p>
    <p><strong>Name:</strong> ${esc(customer.displayName || "Valued Customer")}</p>
    <p><strong>Phone:</strong> ${esc(customer.contactPhone || "not provided")}</p>
    <p><strong>Email:</strong> ${esc(customer.contactEmail || "not provided")}</p>
    <p><strong>Account Status:</strong> ${esc(customer.accountStatus || "Account on file")}</p>
  </div>
  <div class="section">
    <h3>Addresses</h3>
    <div class="grid">
      <div><strong>Billing Address</strong><br/>${esc(addresses.billingAddress || "Not provided")}</div>
      <div><strong>Shipping Address</strong><br/>${esc(addresses.shippingAddress || "Not provided")}</div>
      <div><strong>Service Address</strong><br/>${esc(addresses.serviceAddress || "Not provided")}</div>
    </div>
  </div>
  <div class="section">
    <h3>Product Confirmation</h3>
    <table>
      <thead><tr><th>Product</th><th>Category</th><th>Device</th><th>Qty</th><th>One-time</th><th>Monthly</th></tr></thead>
      <tbody>${itemRows || "<tr><td colspan='6'>No items</td></tr>"}</tbody>
    </table>
  </div>
  <div class="section">
    <h3>Payment Confirmation</h3>
    <p><strong>Method:</strong> ${esc(payment.methodLabel || "Payment card")}</p>
    <p><strong>Account/Card:</strong> ${esc(payment.maskedAccount || "N/A")}</p>
    <p><strong>Verification:</strong> ${esc(payment.verificationStatus || "Verified")}</p>
    <p><strong>Total Due Today:</strong> ${fmtMoney(payment.chargeToday || 0, currency)}</p>
  </div>
  ${promotionsBlock}
  ${financingBlock}
  <div class="section">
    <h3>Charges Summary</h3>
    <p><strong>One-time subtotal:</strong> ${fmtMoney(charges.oneTimeSubtotal || 0, currency)}</p>
    <p><strong>Installation fees:</strong> ${fmtMoney(charges.installationFees || 0, currency)}</p>
    <p><strong>Estimated tax today (placeholder):</strong> ${fmtMoney(charges.estimatedTaxToday || 0, currency)}</p>
    <p class="totals-row"><strong>Total Due Today:</strong> ${fmtMoney(charges.todayTotal || payment.chargeToday || 0, currency)}</p>
    <hr/>
    <p><strong>Monthly service subtotal:</strong> ${fmtMoney(charges.monthlySubtotal || recurring.serviceMonthly || 0, currency)}</p>
    <p><strong>Monthly financing:</strong> ${fmtMoney(recurring.financingMonthly || 0, currency)}</p>
    <p><strong>Estimated tax monthly (placeholder):</strong> ${fmtMoney(charges.estimatedTaxMonthly || 0, currency)}</p>
    <p class="totals-row"><strong>Monthly Total Going Forward:</strong> ${fmtMoney(charges.monthlyTotal || recurring.combinedMonthly || 0, currency)}</p>
  </div>
  <div class="actions">
    <button onclick="window.print()">Print receipt</button>
    <button onclick="window.close()">Close</button>
  </div>
  <div class="small">${esc(disclaimer)}</div>
</body>
</html>`;
}

function summarizeBasket(basket = []) {
  if (!Array.isArray(basket) || basket.length === 0) return "No items in basket";
  return basket
    .slice(0, 6)
    .map((item) => `${item.name || "Offer"} (${fmtMoney(item.monthlyPrice || 0)}/month)`)
    .join("; ");
}

export function buildHandoffSummary({
  sessionId = null,
  messages = [],
  context = {},
  currentStep = ""
} = {}) {
  const route = resolveRouteFromStep(currentStep || context?.flowStep || "", context?.activeTask || "");
  const authState = context?.authUser
    ? "authenticated_existing"
    : context?.customerType === "new" && context?.newOnboarding?.fullName
      ? "new_profile_created"
      : context?.customerType === "new"
        ? "new_unverified"
        : "unknown";
  const blockers = [];
  if (!context?.serviceAddress && route === "sales") blockers.push("missing_service_address");
  if (!Array.isArray(context?.basket) || context.basket.length === 0) blockers.push("empty_basket");
  if (!context?.payment?.verified && currentStep && String(currentStep).includes("PAYMENT")) blockers.push("payment_unverified");
  if (!context?.shipping?.address && currentStep && String(currentStep).includes("SHIPPING")) blockers.push("shipping_missing");

  const summaryJson = {
    sessionId: sessionId || context?.sessionId || null,
    route,
    currentStep: currentStep || context?.flowStep || null,
    authState,
    customerType: context?.customerType || null,
    intent: context?.intent || context?.selectedService || null,
    basketSummary: summarizeBasket(context?.basket || []),
    blockers,
    recommendedNextAction: blockers.length ? "resolve_blockers" : "continue_current_step",
    messageCount: Array.isArray(messages) ? messages.length : 0
  };

  const summaryText =
    `Route ${summaryJson.route}. ` +
    `Current step ${summaryJson.currentStep || "unknown"}. ` +
    `Auth state ${summaryJson.authState}. ` +
    `${blockers.length ? `Blockers: ${blockers.join(", ")}.` : "No blockers detected."} ` +
    `Basket: ${summaryJson.basketSummary}.`;

  return {
    summaryText,
    summaryJson
  };
}

export function buildTranscriptHtml({
  sessionId = null,
  context = {},
  messages = [],
  summary = null
} = {}) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const handoff = summary?.summaryJson || buildHandoffSummary({ sessionId, messages: safeMessages, context }).summaryJson;
  const rows = safeMessages
    .map((message) => {
      const role = message.role === "user" ? "Customer" : "Belinda";
      const ts = message.ts ? new Date(message.ts).toLocaleString("en-CA") : "";
      return `<tr><td>${esc(role)}</td><td>${esc(ts)}</td><td>${esc(message.text || "")}</td></tr>`;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Bell Transcript Export</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #1f2f46; background: #fff; }
    .head { background: #00549a; color: #fff; padding: 16px 18px; border-radius: 10px; }
    .sub { font-size: 12px; opacity: 0.95; margin-top: 4px; }
    .section { margin-top: 16px; padding: 12px; border: 1px solid #dce3ee; border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border-bottom: 1px solid #dce3ee; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f4f8ff; }
    .actions { margin-top: 16px; display: flex; gap: 8px; }
    button { border: 1px solid #00549a; color: #00549a; background: #fff; padding: 8px 12px; border-radius: 8px; cursor: pointer; }
  </style>
</head>
<body>
  <div class="head">
    <h2>Bell Corporate Conversation Transcript</h2>
    <div class="sub">Session ${esc(sessionId || context?.sessionId || "unknown")} | Generated ${esc(new Date().toISOString())}</div>
  </div>
  <div class="section">
    <h3>Handoff Summary</h3>
    <p><strong>Route:</strong> ${esc(handoff.route || "sales")}</p>
    <p><strong>Current Step:</strong> ${esc(handoff.currentStep || "unknown")}</p>
    <p><strong>Customer Type:</strong> ${esc(handoff.customerType || "unknown")}</p>
    <p><strong>Intent:</strong> ${esc(handoff.intent || "unknown")}</p>
    <p><strong>Blockers:</strong> ${esc((handoff.blockers || []).join(", ") || "none")}</p>
    <p><strong>Recommended Next Action:</strong> ${esc(handoff.recommendedNextAction || "continue_current_step")}</p>
  </div>
  <div class="section">
    <h3>Transcript</h3>
    <table>
      <thead><tr><th>Role</th><th>Timestamp</th><th>Message</th></tr></thead>
      <tbody>${rows || "<tr><td colspan='3'>No transcript messages captured.</td></tr>"}</tbody>
    </table>
  </div>
  <div class="actions">
    <button onclick="window.print()">Print / Save as PDF</button>
    <button onclick="window.close()">Close</button>
  </div>
</body>
</html>`;
}
