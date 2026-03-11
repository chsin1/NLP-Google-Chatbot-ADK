import test from "node:test";
import assert from "node:assert/strict";
import { formatPhone, getExpectedLast4, inferAuthContact, maskEmail } from "../shared/client-utils.mjs";

const sampleUser = {
  email: "alex.test@gmail.com",
  phone: "4165511192",
  savedCardLast4: "2781"
};

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

test("getExpectedLast4 supports card variants", () => {
  assert.equal(getExpectedLast4("visa", sampleUser), "2781");
  assert.equal(getExpectedLast4("mastercard", sampleUser), "7891");
  assert.equal(getExpectedLast4("amex", sampleUser), "6531");
  assert.equal(getExpectedLast4("existing", sampleUser), "2781");
});
