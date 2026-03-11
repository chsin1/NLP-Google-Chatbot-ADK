export function formatPhone(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 10);
  if (digits.length !== 10) return value || "not provided";
  return `(${digits.slice(0, 3)})-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function maskEmail(email) {
  if (!email || !email.includes("@")) return "not provided";
  const [local, domain] = email.split("@");
  const maskedLocal = local.length <= 2 ? `${local[0] || "*"}*` : `${local.slice(0, 2)}***`;
  return `${maskedLocal}@${domain}`;
}

export function inferAuthContact(user, rawIdentifier = "") {
  const raw = String(rawIdentifier || "").trim();
  const looksLikeEmail = raw.includes("@");
  if (looksLikeEmail) {
    return {
      phone: user.phone,
      email: raw.toLowerCase()
    };
  }

  const digits = raw.replace(/\D/g, "");
  return {
    phone: digits.length >= 10 ? digits.slice(0, 10) : user.phone,
    email: user.email
  };
}

export function getExpectedLast4(method, user) {
  if (method === "visa") return "2781";
  if (method === "mastercard") return "7891";
  if (method === "amex") return "6531";
  if (method === "existing") return user?.savedCardLast4 || "2781";
  return "0000";
}
