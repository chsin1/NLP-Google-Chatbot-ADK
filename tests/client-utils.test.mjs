import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateFinancingBreakdown,
  calculateCombinedMonthly,
  calculateFinancingMonthly,
  calculateInstallationFees,
  canAccessOfferBrowse,
  deriveAreaCodeFromProfile,
  formatPhone,
  getFinancingAmount,
  getFinancingEligibleItems,
  getEligibilityProfile,
  getExpectedLast4,
  inferAuthContact,
  maskEmail,
  runMockFinancingApproval
} from "../shared/client-utils.mjs";

const sampleUser = {
  email: "alex.test@gmail.com",
  phone: "4165511192",
  savedCardLast4: "2781"
};

const sampleBasket = [
  { id: "mob-001", category: "mobility", financingEligible: true, devicePrice: 899, monthlyPrice: 75 },
  { id: "internet-001", category: "home internet", financingEligible: false, devicePrice: null, monthlyPrice: 95 },
  { id: "mob-002", category: "mobility", financingEligible: true, devicePrice: 1499, monthlyPrice: 110 }
];

test("formatPhone formats 10-digit numbers", () => {
  assert.equal(formatPhone("4165511192"), "(416)-551-1192");
});

test("maskEmail obscures local-part", () => {
  assert.equal(maskEmail("alex.test@gmail.com"), "al***@gmail.com");
});

test("inferAuthContact uses provided email when identifier is email", () => {
  const contact = inferAuthContact(sampleUser, "ALEX.TEST@GMAIL.COM");
  assert.equal(contact.email, "alex.test@gmail.com");
  assert.equal(contact.phone, "4165511192");
});

test("inferAuthContact uses entered phone digits when identifier is phone", () => {
  const contact = inferAuthContact(sampleUser, "(647) 111-2222");
  assert.equal(contact.phone, "6471112222");
  assert.equal(contact.email, "alex.test@gmail.com");
});

test("deriveAreaCodeFromProfile uses explicit phone when provided", () => {
  assert.equal(deriveAreaCodeFromProfile(sampleUser, "(647) 111-2222"), "647");
});

test("deriveAreaCodeFromProfile falls back to profile phone", () => {
  assert.equal(deriveAreaCodeFromProfile(sampleUser, ""), "416");
  assert.equal(deriveAreaCodeFromProfile(null, ""), null);
});

test("getExpectedLast4 supports card variants", () => {
  assert.equal(getExpectedLast4("visa", sampleUser), "2781");
  assert.equal(getExpectedLast4("mastercard", sampleUser), "7891");
  assert.equal(getExpectedLast4("amex", sampleUser), "6531");
  assert.equal(getExpectedLast4("existing", sampleUser), "2781");
});

test("canAccessOfferBrowse allows onboarded new customer", () => {
  const context = {
    authUser: null,
    customerType: "new",
    newOnboarding: { leadId: "lead_123" }
  };
  assert.equal(canAccessOfferBrowse(context), true);
});

test("getEligibilityProfile returns synthetic profile for new customer lead", () => {
  const context = {
    authUser: null,
    customerType: "new",
    newOnboarding: { leadId: "lead_123", fullName: "Jamie Doe" }
  };
  const profile = getEligibilityProfile(context);
  assert.equal(profile.id, "lead_123");
  assert.equal(profile.name, "Jamie Doe");
  assert.equal(profile.creditScore, 680);
});

test("getFinancingEligibleItems returns mobility device items only", () => {
  const items = getFinancingEligibleItems(sampleBasket);
  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((item) => item.id),
    ["mob-001", "mob-002"]
  );
});

test("getFinancingAmount sums financed device msrp only", () => {
  assert.equal(getFinancingAmount(sampleBasket), 2398);
  assert.equal(getFinancingAmount([{ financingEligible: false, devicePrice: null }]), 0);
});

test("calculateFinancingMonthly supports 24/36 month terms", () => {
  assert.equal(calculateFinancingMonthly(2398, 24), 99.92);
  assert.equal(calculateFinancingMonthly(2398, 36), 66.61);
});

test("calculateCombinedMonthly returns service + financing total", () => {
  assert.equal(calculateCombinedMonthly(180, 66.61), 246.61);
});

test("runMockFinancingApproval respects threshold with deterministic function", () => {
  assert.equal(runMockFinancingApproval(() => 0.2), true);
  assert.equal(runMockFinancingApproval(() => 0.9), false);
});

test("calculateInstallationFees applies internet and landline setup costs once each", () => {
  assert.equal(calculateInstallationFees(sampleBasket), 25);
  assert.equal(
    calculateInstallationFees([
      { category: "landline" },
      { category: "home internet" },
      { category: "landline" }
    ]),
    75
  );
});

test("calculateFinancingBreakdown handles upfront and deferred ratio", () => {
  const breakdown = calculateFinancingBreakdown(1000, 200, 24, 0.35);
  assert.equal(breakdown.financedBase, 800);
  assert.equal(breakdown.deferredAmount, 280);
  assert.equal(breakdown.amortizedAmount, 520);
  assert.equal(breakdown.monthlyPayment, 21.67);
});
