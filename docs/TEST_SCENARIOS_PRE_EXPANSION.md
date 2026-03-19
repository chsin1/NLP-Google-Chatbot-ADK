# Pre-Expansion Test Scenarios

These scenarios should pass before expanding into new feature modules.

## A) Quote Builder Determinism

1. Submit identical preference payload twice.
2. Verify ranked plans and explanation ordering are identical.
3. Verify any non-deterministic tie-breakers are resolved consistently.

Expected:
- Same input -> same output across calls in same app version.

---

## B) Cross-Sell Prompt Frequency

1. Add first product (for example, mobility).
2. Decline suggested add-on once.
3. Continue to basket and checkout.

Expected:
- Remaining categories are offered once.
- Declined add-on is not repeatedly shown in same session stage.

---

## C) Handoff Summary Completeness

1. Trigger handoff route from ambiguous or unresolved flow.
2. Capture generated summary object.

Expected required keys:
- `sessionId`
- `route`
- `flowStep`
- `intent`
- `authStatus`
- `basketSummary`
- `recentBlockers`
- `recommendedNextAction`

---

## D) PII Redaction Safety

1. Submit sample lines containing:
   - Email
   - Phone
   - Card-like patterns
2. Run redaction utility/check endpoint.

Expected:
- Sensitive fields are masked.
- Structured redaction metadata indicates entities found and transformed.
- Raw sensitive values are absent from stored output.

---

## E) Order Status Timeline Integrity

1. Query mocked order status endpoint with valid `orderId`.
2. Verify timeline sequence and current state.

Expected:
- Valid states only (for example: `received`, `validated`, `shipped`, `activated`).
- No backward transitions.
- Timestamps monotonic increasing.

---

## F) README Command Verification

1. Execute all documented startup commands.
2. Execute test command.
3. Run sample API curl commands.

Expected:
- Commands run without undocumented prerequisites.
- Endpoint examples return valid JSON responses.

---

## G) Core Flow Regression (Existing Coverage Check)

1. Run:
   - `node --test tests/*.test.mjs`
2. Verify no failures in:
   - routing tests
   - client utility tests
   - metrics tests
   - LLM integration tests

Expected:
- Full suite passes before any expansion branch is merged.

---

## H) Acceptance Gate for Expansion

All sections A-G pass with no blocking issues before implementing:

1. quote preview endpoint,
2. handoff summary endpoint,
3. order status endpoint,
4. eval API,
5. redaction API.
