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

export function buildReceiptHtml(payload = {}) {
  const {
    orderId = "N/A",
    confirmationCode = "N/A",
    createdAt = new Date().toISOString(),
    clientType = "personal",
    items = [],
    serviceMonthly = 0,
    financing = null,
    combinedMonthly = 0,
    chargeToday = 0,
    installationFees = 0,
    shippingAddress = "N/A"
  } = payload;

  const itemRows = items
    .map(
      (item) =>
        `<tr><td>${esc(item.name)}</td><td>${esc(item.deviceModel || "-")}</td><td>$${Number(item.monthlyPrice || 0).toFixed(
          2
        )}/mo</td></tr>`
    )
    .join("");

  const financingBlock = financing
    ? `<div class="section">
        <h3>Bell Smart Financing</h3>
        <p>Amount financed: $${Number(financing.amount || 0).toFixed(2)}</p>
        <p>Term: ${esc(financing.termMonths)} months</p>
        <p>Monthly payment: $${Number(financing.monthlyPayment || 0).toFixed(2)}</p>
        <p>Decision reference: ${esc(financing.decisionId || "N/A")}</p>
      </div>`
    : "";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Bell Order Receipt</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #1f2f46; }
    .head { background: #00549a; color: #fff; padding: 14px 16px; border-radius: 10px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border-bottom: 1px solid #dce3ee; padding: 8px; text-align: left; }
    .section { margin-top: 16px; padding: 12px; border: 1px solid #dce3ee; border-radius: 8px; }
    .actions { margin-top: 20px; display: flex; gap: 8px; }
    button { border: 1px solid #00549a; color: #00549a; background: #fff; padding: 8px 12px; border-radius: 8px; cursor: pointer; }
    .small { font-size: 12px; color: #5b6575; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="head"><h2>Bell Canada - Mock Order Receipt</h2></div>
  <div class="section">
    <p><strong>Order ID:</strong> ${esc(orderId)}</p>
    <p><strong>Confirmation Code:</strong> ${esc(confirmationCode)}</p>
    <p><strong>Date:</strong> ${esc(createdAt)}</p>
    <p><strong>Client Type:</strong> ${esc(clientType)}</p>
  </div>
  <div class="section">
    <h3>Selected Products</h3>
    <table>
      <thead><tr><th>Product</th><th>Device</th><th>Monthly</th></tr></thead>
      <tbody>${itemRows || "<tr><td colspan='3'>No items</td></tr>"}</tbody>
    </table>
  </div>
  ${financingBlock}
  <div class="section">
    <p><strong>Service Monthly:</strong> $${Number(serviceMonthly || 0).toFixed(2)}</p>
    <p><strong>Installation Fees:</strong> $${Number(installationFees || 0).toFixed(2)}</p>
    <p><strong>Charge Today:</strong> $${Number(chargeToday || 0).toFixed(2)}</p>
    <p><strong>Combined Monthly Due:</strong> $${Number(combinedMonthly || 0).toFixed(2)}</p>
    <p><strong>Shipping Address:</strong> ${esc(shippingAddress)}</p>
  </div>
  <div class="actions">
    <button onclick="window.print()">Print receipt</button>
    <button onclick="window.close()">Close</button>
  </div>
  <div class="small">Mock confirmation for prototype use.</div>
</body>
</html>`;
}
