# Feature Expansion Backlog (Sales Chatbot)

This backlog operationalizes the README expansion plan into implementation-ready workstreams.

## 1) Guided Quote Builder

### Objective
Help users converge on the right plan faster with preference-based quote generation.

### Scope
- Build-my-plan flow with priorities: budget, speed, device preference.
- Side-by-side comparison for top 2-3 plans.
- Save and resume quote in session context.

### Acceptance Criteria
- Same inputs produce deterministic ranked output.
- User can compare at least two plans in one view.
- Saved quote restores within same session after refresh.

### Proposed API
- `POST /api/quote-preview`

---

## 2) Offer Explainability Layer

### Objective
Increase trust and conversion by explaining why a recommendation was made.

### Scope
- Structured "why recommended" block per offer.
- Diff view when user changes preferences.
- Deterministic explanation fields only.

### Acceptance Criteria
- Every recommended offer has an explainability payload.
- Explanation updates after preference changes.
- No LLM-only facts appear without deterministic backing.

---

## 3) Cross-Sell Optimizer

### Objective
Maximize attach rate while preventing repetitive prompts.

### Scope
- Context-aware next-best service prompt.
- Bundle savings preview prior to payment.
- Respect "decline add-on" to avoid repeat nagging.

### Acceptance Criteria
- After first product, only remaining categories are suggested.
- Bundle discount shown before payment when eligible.
- Declined add-on is not repeatedly prompted in same session.

---

## 4) Checkout Confidence Features

### Objective
Reduce payment/address drop-off in late funnel.

### Scope
- Payment error recovery with specific instructions.
- Address confidence signal (suggested vs manual).
- Mock inventory hold timer for device checkout.

### Acceptance Criteria
- Failed payment attempts present deterministic recovery path.
- Address confidence is visible in review/checkout.
- Inventory hold expiration is handled gracefully.

---

## 5) Post-Purchase Experience

### Objective
Keep users engaged after checkout and reduce support calls.

### Scope
- Order status timeline (mock states).
- Receipt download + structured order summary export.
- Reorder/modify grace window (30 minutes mock).

### Acceptance Criteria
- Order status endpoint returns valid state transitions.
- Receipt and structured summary are both accessible.
- Grace-window behavior is enforced deterministically.

### Proposed API
- `GET /api/order-status?orderId=...`

---

## 6) Sales Ops + CRM Readiness

### Objective
Improve handoff quality and campaign attribution.

### Scope
- Lead scoring from behavioral events.
- Agent handoff summary packet.
- UTM/source attribution in KPI rollups.

### Acceptance Criteria
- Session has score and route reason before handoff.
- Handoff packet includes intent, auth, basket, blockers.
- Attribution appears in metrics segment breakdown.

### Proposed API
- `POST /api/handoff-summary`

---

## 7) Trust, Risk, and Compliance

### Objective
Protect PII and improve operational auditability.

### Scope
- PII redaction on log ingestion and export.
- Consent/disclosure audit events.
- Admin audit feed for auth failures and blocked loops.

### Acceptance Criteria
- PII patterns are masked before persistence/export.
- Consent + disclosure events are queryable by session.
- Audit feed includes severity and timestamps.

### Proposed API
- `POST /api/pii-redact-check`

---

## 8) Evaluation and Guardrails

### Objective
Make quality measurable and release-safe.

### Scope
- Conversation quality rubric scoring.
- Regression tests for loops and fallback behavior.
- Monthly benchmark report generation from KPI module.

### Acceptance Criteria
- Eval report includes completion, fallback, loop, reroute rates.
- Regression suite runs in CI with blocking gate criteria.
- Monthly benchmark comparison is reproducible.

### Proposed API
- `GET /api/evals?window=30d`

---

## Prioritization Recommendation

1. Guided Quote Builder
2. Offer Explainability Layer
3. Cross-Sell Optimizer
4. Checkout Confidence Features
5. Sales Ops + CRM Readiness
6. Trust, Risk, and Compliance
7. Post-Purchase Experience
8. Evaluation and Guardrails

This order prioritizes conversion impact first, then operational quality and governance hardening.
