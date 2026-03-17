# Bell NLP Chatbot - Final Report v2
Business-facing proof of concept report with technical appendix

Prepared for: Bell telecommunications stakeholders  
Prepared on: March 17, 2026  
Evidence window used in this report: March 11, 2026 to March 16, 2026

## Executive Summary
Bell is a large telecommunications company with complex product bundles, strict checkout requirements, and high customer expectations for fast support. The business problem is straightforward: digital sales journeys still lose customers when discovery, qualification, checkout, and follow-up are fragmented across tools or delayed by manual handoffs. Bell needs a full end-to-end chatbot that can guide a customer from first message to confirmed order while keeping business-critical decisions deterministic.

This proof of concept demonstrates that approach. The Bell NLP chatbot combines a deterministic flow engine with optional LLM assistance. In one guided flow, a customer can select service type, compare offers, complete onboarding or authentication, finish payment and shipping, confirm the order, select an installation slot, and export transcript artifacts for handoff.

Key observed results in the current codebase and logs:
- Automated quality gate: `126/126` tests passing (`node --test tests/*.mjs`, March 17, 2026).
- Operational conversion in window: `27` successful orders out of `28` attempts (`96.43%` attempt-to-success).
- End-to-end sample success: one observed session moved from chat open to order success in `65.206` seconds, then booking selection by `71.951` seconds.
- LLM assist cost remained low in this window: `/api/chat-assist` total estimated cost `CAD 0.017758` across `395` calls (`CAD 0.000045` average per call).
- Nearby Bell store discovery now supports entered-address-first lookup plus current-location fallback with configurable radius (`0-50 km`).

The approach appears viable beyond POC if Bell funds three gaps: production systems integration (CRM/OMS/billing), production-grade data governance/approvals, and stricter KPI instrumentation discipline.

## 1. Problem Context and Why It Matters
### 1.1 Business problem
Telecom sales journeys are high-friction when users must navigate eligibility, product fit, payment, and fulfillment steps without guided continuity. Drop-off at late checkout stages is expensive because customer intent is high but trust is fragile.

### 1.2 Why this matters for Bell
Bell operates at enterprise scale with multiple service lines. A chatbot that only handles Q&A is insufficient. Bell needs a full E2E assistant that can:
- Keep critical business truth deterministic.
- Preserve conversion momentum through checkout.
- Provide operational telemetry that sales and operations teams can act on.

## 2. What the POC Does End-to-End
The current POC supports the following end-to-end path in one chat session:
1. Start conversation with AI disclosure.
2. Capture customer status and service intent.
3. Run service clarification and quote comparison.
4. Onboard new users or authenticate existing users.
5. Validate payment path and shipping details.
6. Create order confirmation and render receipt.
7. Offer installation slot selection and reminder options.
8. Export transcript and handoff artifacts.
9. Find nearby Bell stores from entered address or current location with radius control.

This flow is implemented across:
- Front-end orchestrator: `app.js`
- Server endpoints and guardrails: `server.mjs`
- Deterministic shared logic: `shared/*.mjs`
- Test coverage: `tests/*.test.mjs`

## 3. Operating Context for Non-Technical Readers
### 3.1 Who uses it
- Primary users: prospective and existing Bell customers in self-serve digital sales journeys.
- Secondary users: sales operations and product teams reviewing KPI/SLA outputs and transcript exports.

### 3.2 Where it fits in the day
- Customers use it during purchase intent moments (plan comparison, checkout, and order finalization).
- Operations teams use it as a monitoring surface for conversion quality and bottlenecks.

### 3.3 Inputs and outputs
Input:
- Free-text customer messages, structured quick actions, and flow selections.

Output:
- Deterministic next-step guidance, ranked quote recommendations, checkout progression, order confirmation, booking slots, transcript export payloads, and metrics.

### 3.4 Intentional scope exclusions to keep POC tight
From repository limitations and architecture boundaries:
- No live CRM/OMS/billing integration.
- No persistent production database.
- Product catalog, inventory, eligibility, and payment are mocked.
- Google address provider requires separate API setup.

## 4. Evidence Ledger (Source-of-Truth Claims)
| Claim | Status | Evidence |
|---|---|---|
| All automated tests are passing | Proven | `node --test tests/*.mjs` on March 17, 2026: `126` pass, `0` fail |
| LLM guardrails prohibit authoritative pricing/payment truth from model | Proven | `server.mjs` guardrail prompt and deterministic boundaries |
| POC achieved strong order completion on attempted checkouts | Observed | Metrics window Mar 11-16, 2026: `28` attempts, `27` successes (`96.43%`) |
| Quote builder had a runtime regression (`preferenceTotal`) on Mar 16, 2026 | Observed | `app-errors.log`: `38` matching errors across `12` sessions |
| Production privacy approval posture is incomplete | Planned | Repo limitations and roadmap notes (PII governance and integration gaps) |
| Production deployment needs real systems integration | Planned | Known limitations in README and planned interfaces |

Status definitions:
- Proven: directly enforced by current code or tests.
- Observed: seen in logs/telemetry within the evidence window.
- Planned: explicitly identified in backlog/limitations, not yet production-ready.

## 5. Key Build Judgments and Design Trade-offs
### 5.1 Freshness
Judgment:
- Keep business-critical values deterministic and local to the flow engine instead of asking the model to invent operational truth.

How implemented:
- Deterministic quote ranking endpoint (`/api/quote-preview`) and flow contracts in front-end state machine.
- LLM used for assistive tasks, not authoritative decisioning.

Trade-off:
- Higher reliability for known logic, but freshness of catalog/inventory is limited by mock data and static inputs until live integration is complete.

Implication:
- Good for controlled POC behavior; not enough for production without real-time catalog and eligibility services.

### 5.2 Latency and cost
Judgment:
- Use LLM selectively and keep fallback paths deterministic.

How implemented:
- `LLM_ENABLED` toggle, endpoint-level fallback mode, and health checks.
- Deterministic flow progression can continue even when LLM is unavailable.

Observed evidence (Mar 11-16, 2026):
- `/api/chat-assist`: `395` calls, `33,586` tokens, `CAD 0.017758` estimated total.
- Average `/api/chat-assist` cost per call: `CAD 0.000045`.

Trade-off:
- Very low assist cost, but user experience quality can degrade during fallback periods.

### 5.3 Privacy and approvals
Judgment:
- Minimize sensitive exposure at POC stage while preserving operational observability.

How implemented:
- AI disclosure message shown at start.
- Email masking utility and secure reference generation for auth metadata.
- File-based logging for reproducible QA and telemetry.

Trade-off:
- POC observability is strong, but production privacy controls are not yet complete.

Implication:
- Formal privacy/legal/security approvals are still required before enterprise rollout.

## 6. How Success Was Measured
### 6.1 Our measurement frame
We measured success as reliable completion of E2E digital sales journeys under deterministic control, not just conversational quality.

### 6.2 What we compared against
Baseline in this report is internal, based on repository and telemetry states:
- Stable target state: passing test suite plus successful end-to-end session outcomes.
- Comparison state: observed regression period on March 16, 2026 where quote-builder runtime errors disrupted flows.

### 6.3 What changed
- Regression episode: `preferenceTotal is not defined` generated front-end errors and unhandled rejections.
- Current state: tests include quote-builder regression checks and full suite passes (`126/126`).
- Operationally, successful order and booking sessions are observed after the failure window.

## 7. One Clear Success and One Honest Failure
### 7.1 Clear success
Case:
- Session `sess_1773679617490_w3jtpj` on March 16, 2026.

Observed timeline:
- Chat opened at `2026-03-16T16:46:59.256Z`.
- Order success at `2026-03-16T16:48:04.462Z` (`65.206` seconds elapsed).
- Booking slot selected at `2026-03-16T16:48:11.207Z` (`71.951` seconds elapsed).

Why it matters:
- Demonstrates true E2E completion: discovery -> checkout -> order -> booking in one contiguous flow.

### 7.2 Honest failure
Case:
- Quote-builder runtime error episode on March 16, 2026.

Observed impact:
- `38` error events referencing `preferenceTotal is not defined` across `12` sessions.
- Event mix: `21` unhandled rejections and `17` front-end errors.

Learning:
- UI-level state assumptions can break mission-critical flow continuity if not protected by regression tests.

Action already visible in codebase:
- Quote-builder total handling is now explicitly guarded in `app.js`.
- Test coverage includes quote-builder allocation and normalization regression checks.

## 8. Risks and Mitigation Strategy
| Risk | Business impact | Current mitigation | Remaining gap |
|---|---|---|---|
| Runtime regressions in conversion path | Checkout drop-off and trust loss | Expanded flow and quote-builder test coverage | Need CI quality gates tied to release |
| Over-reliance on mock business data | Misleading performance expectations | Deterministic boundaries documented | Must integrate live catalog/eligibility systems |
| Privacy/compliance immaturity | Approval delays and legal risk | AI disclosure, masking utilities, scoped POC logs | Requires formal PII governance and retention controls |
| LLM availability variability | Inconsistent conversational quality | Fallback behavior and health endpoint | Need SLOs and production alerting |
| KPI interpretation drift | Incorrect product decisions | Rich telemetry and SLA calculations | Some KPI formulas are synthetic and require governance for executive reporting |

## 9. Viability Beyond POC and Required Next Steps
### 9.1 Viability judgment
This approach is viable beyond POC because the core E2E behavior is real, test-backed, and operationally observable. The main blockers are integration and governance, not feasibility of the interaction model.

### 9.2 Next steps (decision-oriented)
1. Integrate live product, inventory, eligibility, and order systems (CRM/OMS/billing).
2. Implement production data governance: redaction, retention, access controls, and formal approval workflow.
3. Harden telemetry model for executive use by separating synthetic KPI estimates from audited business KPIs.
4. Add release gates that fail deployment on conversion-path regression tests.
5. Run structured pilot with Bell business users and operations teams, then calibrate SLA targets.

## 10. Conclusion
The Bell NLP chatbot POC shows that a deterministic-first, LLM-assisted design can deliver a full E2E telecom journey in one flow while keeping costs low and testability high. The product direction is credible. Moving to production now depends on integration discipline, governance maturity, and metric rigor.

---

## Appendix A - System Architecture and Flow
### A.1 Architecture summary
- Client orchestration and deterministic FSM: `app.js`
- Server APIs, LLM integration, and logging: `server.mjs`
- Shared deterministic logic: `shared/client-utils.mjs`, `shared/workflow-utils.mjs`, `shared/quote-utils.mjs`, `shared/metrics-utils.mjs`, `shared/conversation-utils.mjs`
- Test harness: `tests/*.test.mjs`

### A.2 High-level flow
1. Greeting and disclosure.
2. Customer status and service selection.
3. Service-specific clarification.
4. Quote generation and plan selection.
5. Authentication/onboarding.
6. Payment and shipping.
7. Order confirmation and receipt.
8. Booking and optional reminder.
9. Post-order rating and follow-up assist.

## Appendix B - Environment and Key Settings
From `.env.example`:
- `OPENAI_API_KEY=`
- `OPENAI_MODEL=gpt-4.1-mini`
- `LLM_ENABLED=true`
- `ADDRESS_PROVIDER=mock`
- `GOOGLE_PLACES_API_KEY=`
- `LLM_USAGE_LOG_PATH=./logs/llm-usage.log`

Operational meaning:
- LLM assist is configurable and can be disabled.
- Address provider can run mock, google, or hybrid modes.
- LLM usage is logged for cost and fallback reporting.

## Appendix C - API Inventory and Behavior
Implemented endpoints (from server implementation):
- `POST /api/log` - structured telemetry logging.
- `POST /api/intent` - intent classification (LLM + deterministic fallback).
- `POST /api/chat-assist` - assistive language tasks.
- `GET /api/llm-health` - LLM connectivity and model status.
- `POST /api/address-lookup` - address suggestions.
- `GET /api/finder/nearby` - nearby Bell stores using either `lat/lng` or `address` and optional radius.
- `POST /api/quote-preview` - deterministic quote ranking.
- `POST /api/handoff-summary` - structured handoff summary generation.
- `POST /api/transcript-export` - exportable transcript payload.
- `GET /api/install-slots` - mock install booking availability.
- `GET /api/metrics` - KPI/SLA/session analytics.

## Appendix D - Test Artifacts and Detailed Results
### D.1 Command executed
```bash
node --test tests/*.mjs
```

### D.2 Result summary (March 17, 2026)
- Tests run: `126`
- Passed: `126`
- Failed: `0`

### D.3 Notable regression coverage areas
- Quote-builder allocation and normalization checks.
- Flow gating and invalid-transition protection.
- LLM integration guardrail presence checks.
- Metrics aggregation correctness.
- Export and booking behavior.

### D.4 Test evidence references
- `tests/workflow-paths.test.mjs`
- `tests/llm-integration.test.mjs`
- `tests/metrics-utils.test.mjs`
- `tests/export-and-booking.test.mjs`
- `tests/client-utils.test.mjs`

## Appendix E - Telemetry Artifacts (Mar 11-16, 2026)
### E.1 KPI snapshot (selected)
| Metric | Observed value |
|---|---|
| Sessions | 96 |
| Order attempts | 28 |
| Order success | 27 |
| Attempt-to-success rate | 96.43% |
| Quote comparison viewed | 25 |
| Booking slot selected | 5 |
| Warm-agent routed | 3 |
| Mean time to completion | 2.36 min |
| SLA overall health score | 95 |

### E.2 SLA target snapshot
| SLA target | Actual | Status |
|---|---|---|
| First reply <= 20 sec | 5.4 sec | pass |
| Intent lock <= 90 sec | 81.93 sec | pass |
| Offer presentation <= 180 sec | 113.85 sec | pass |
| Checkout completion <= 10 min | 0.12 min | pass |
| Order success >= 75% | 96.43% | pass |
| Clarify retries <= 2 | 3 | warn |

### E.3 LLM usage and cost snapshot
| Measure | Value |
|---|---|
| Total LLM log calls | 1,790 |
| Total tokens | 201,827 |
| Total estimated cost | CAD 0.124406 |
| `/api/llm-health` calls | 1,395 |
| `/api/chat-assist` calls | 395 |
| `/api/chat-assist` cost | CAD 0.017758 |
| Average `/api/chat-assist` cost/call | CAD 0.000045 |
| Fallback calls | 603 (33.69%) |

### E.4 Error distribution snapshot
| Error event | Count |
|---|---|
| `invalid_flow_transition` | 2,249 |
| `path_failed` | 2,228 |
| `quote_preview_failed` | 25 |
| `frontend_error` | 23 |
| `frontend_unhandled_rejection` | 21 |

### E.5 Success and failure anchor records
- Success session: `sess_1773679617490_w3jtpj` (order + booking complete).
- Failure episode: `preferenceTotal is not defined` errors from `2026-03-16T11:31:54.846Z` to `2026-03-16T13:57:17.451Z`.

## Appendix F - Prompt and Guardrail Artifacts
### F.1 Guardrail intent
Server-side assist prompt explicitly prevents model authority over:
- exact pricing,
- promo eligibility,
- credit decisions,
- contract terms,
- inventory counts,
- billing balances,
- order confirmation,
- payment execution.

### F.2 Fallback design
When API key is missing, disabled, or model calls fail:
- system logs fallback mode,
- sets degraded LLM health status,
- returns deterministic/template response so flow can continue.

### F.3 Why this matters
This keeps LLM contribution assistive while preserving deterministic control over high-risk business steps.

## Appendix G - Known Limitations and Production Gaps
Directly aligned with current repo limitations:
- Product catalog, inventory, eligibility, and payment are mocked.
- No real CRM, OMS, or billing integration.
- No persistent production database.
- Google address provider setup is optional and external.
- LLM output quality varies with configuration and prompt tuning.

Production-readiness implications:
- Integrations and governance are mandatory for live deployment.
- Telemetry definitions must be hardened for executive reporting accuracy.

## Appendix H - Screenshot Placeholders and Capture Checklist
### H.1 Placeholder list
- H1: Landing page + KPI dashboard overview.
- H2: AI disclosure greeting and service selection.
- H3: Quote-builder sliders and ranked quote cards.
- H4: Payment and shipping progression.
- H5: Order confirmation and receipt state.
- H6: Installation slot selection panel.
- H7: `/api/metrics` response snippet in terminal.
- H8: Test run output (`126/126`) in terminal.

### H.2 Capture checklist
1. Use consistent browser zoom and desktop width.
2. Mask personal identifiers before capture.
3. Include timestamp in caption for telemetry screenshots.
4. Save under: `docs/screenshots/` with stable names.
5. Re-capture any screenshot if UI labels or metrics change.

## Appendix I - Primary Evidence Sources
- `app.js`
- `server.mjs`
- `shared/metrics-utils.mjs`
- `shared/quote-utils.mjs`
- `shared/workflow-utils.mjs`
- `tests/*.test.mjs`
- `logs/app-events.log`
- `logs/app-errors.log`
- `logs/llm-usage.log`
- `logs/qa-checklist.log`
- `README.md`
