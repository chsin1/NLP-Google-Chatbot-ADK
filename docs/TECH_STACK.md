# Bell NLP Chatbot -- Technology Stack

**Project:** Bell-Style Agentic Sales Chatbot  
**Prepared for:** Bell stakeholders  
**Date:** March 17, 2026

---

## What This Is Built On

This solution is a **single-repo JavaScript web application** that combines:
- a browser-based chat client (`index.html`, `styles.css`, `app.js`), and
- a lightweight Node server (`server.mjs`) for APIs, logging, and static hosting.

The architecture uses a **Hybrid FSM + LLM model**:
- **Deterministic FSM** handles conversion-critical business logic.
- **LLM assist** improves language fluency, intent/entity support, and summaries.

There is **no database and no build pipeline** in the current POC. The app runs directly with `node server.mjs`.

---

## Runtime Topology

```text
┌───────────────────────────────────────────────────────────┐
│ Browser Client                                            │
│ (index.html + app.js + styles.css + sw.js)               │
│                                                           │
│ - Chat UX + guided sales flow                             │
│ - Deterministic state machine and step contracts          │
│ - Quote builder, checkout, booking, transcript controls   │
└───────────────────────┬───────────────────────────────────┘
                        │ HTTP (same origin)
                        ▼
┌───────────────────────────────────────────────────────────┐
│ Node API Server (server.mjs)                             │
│ Port: 3000 (default)                                     │
│                                                           │
│ - Static file serving                                    │
│ - /api/intent, /api/agent-router                         │
│ - /api/chat-assist, /api/chat-assist-stream, /api/llm-health │
│ - /api/address-lookup, /api/finder/nearby, /api/quote-preview │
│ - /api/automations/post-intake                           │
│ - /api/handoff-summary, /api/transcript-export          │
│ - /api/install-slots, /api/metrics, /api/log, /api/consent-record │
│ - Writes logs to /logs/*.log                            │
└───────────────────────┬───────────────────────────────────┘
                        │ HTTPS
                        ▼
┌───────────────────────────────────────────────────────────┐
│ External Services                                         │
│ - OpenAI Responses API (assist + intent)                 │
│ - Optional Google Places API (address + nearby finder)   │
│ - OpenStreetMap Overpass API (finder fallback)           │
│ - Optional webhook target (post-intake automation)       │
│ - Optional trace sink (LangSmith-compatible endpoint)    │
└───────────────────────────────────────────────────────────┘
```

---

## Deployment Model

Current mode is **local/prototype deployment**:
- Start with `node server.mjs`.
- Static assets and APIs are hosted by the same Node process.
- Logs are file-based under `logs/`.
- Runtime configuration comes from `.env.local` (or shell env vars).

No container manifests are committed in this repo at present.  
Production guidance in `README.md` recommends adding:
- process manager (PM2/systemd),
- TLS termination,
- secret management,
- log shipping and retention policy.

---

## Core Stack

| Layer | Technology | Purpose |
|---|---|---|
| Language | JavaScript (Node + Browser) | End-to-end implementation |
| Frontend | Vanilla HTML/CSS/JS | Chat UI, flow orchestration, checkout UX |
| Backend | Node HTTP server (`node:http`) | API endpoints + static hosting |
| LLM Integration | OpenAI Responses API | Assistive language + intent extraction |
| Address + Finder | `mock` / `google` / `hybrid` + Overpass fallback | Typeahead and nearby store discovery |
| Automation | Webhook integration (`N8N_WEBHOOK_URL`) | Post-intake trigger handoff |
| Streaming | Server-Sent Events (SSE) | Incremental assist response delivery |
| Agentic Routing | Deterministic tool router (`shared/agent-router-utils.mjs`) | Tool hints for intent/assist/finder/webhook |
| State Management | In-memory context in browser session | Flow progression and checkout context |
| Persistence | JSON line logs (`logs/*.log`) | Event, error, QA, and LLM usage tracking |
| Observability | Trace utility + optional endpoint forwarding | Correlate request lifecycle by trace ID |
| Analytics | `shared/metrics-utils.mjs` + `/api/metrics` | KPI/SLA/session rollups |
| Testing | Node test runner (`node --test`) | 120-test regression and utility coverage |

---

## Frontend Architecture

### Main responsibilities (`app.js`)
- Deterministic flow-step routing and transition control.
- New vs existing customer branching.
- Quote builder preference normalization and deterministic quote application.
- Payment validation flow (card, CVC, postal).
- Shipping selection and order review path.
- Booking and reminder post-order flow.
- LLM status handling and fallback behavior in UI.
- Assist streaming consumption and automatic non-stream fallback.
- First-run onboarding walkthrough with replay and dismissal persistence.
- Nearby store finder panel with call/directions/website deep links.
- KPI dashboard rendering from `/api/metrics`.

### UI assets
- `index.html`: site shell, chat widget, dashboards, panels.
- `styles.css`: design system, responsive layout, dark mode styling.
- `sw.js` + `manifest.webmanifest`: PWA support foundations.

---

## Backend Architecture

### Server responsibilities (`server.mjs`)
- Serves static web app files.
- Loads local env config (`.env.local`) safely.
- Exposes sales-assistant API endpoints.
- Calls OpenAI only for assistive tasks.
- Enforces fallback mode when LLM unavailable.
- Emits SSE token events for assist-only streaming.
- Executes deterministic tool routing for agentic metadata.
- Triggers optional post-intake webhook automation.
- Resolves nearby finder results with provider fallback.
- Writes event/error/QA/LLM usage logs.
- Emits trace IDs and optional trace forwarding payloads.
- Aggregates operational metrics and SLA snapshots.

### Endpoint inventory
- `POST /api/log`
- `POST /api/intent`
- `POST /api/agent-router`
- `POST /api/chat-assist`
- `POST /api/chat-assist-stream`
- `GET /api/llm-health`
- `POST /api/address-lookup`
- `GET /api/finder/nearby`
- `POST /api/automations/post-intake`
- `POST /api/quote-preview`
- `GET /api/compliance-status`
- `POST /api/consent-record`
- `POST /api/handoff-summary`
- `POST /api/transcript-export`
- `GET /api/install-slots`
- `GET /api/metrics`

---

## Deterministic vs LLM Boundary

### Deterministic (source of truth)
- Flow contracts and transition gating.
- Quote scoring/ranking.
- Payment and shipping validation logic.
- Checkout progression and order-state gating.
- KPI/SLA math and dashboard summaries.

### LLM-assistive (non-authoritative)
- Phrasing/fluency improvements.
- Intent/entity support.
- Recommendation explanations.
- Handoff summary language.

Guardrail policy explicitly blocks model authority over:
- exact pricing,
- promo eligibility,
- credit decisions,
- contract terms,
- inventory counts,
- billing balances,
- order confirmation,
- payment execution.

---

## Configuration and Environment

From `.env.example`:

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
LLM_ENABLED=true
ADDRESS_PROVIDER=mock
GOOGLE_PLACES_API_KEY=
LLM_USAGE_LOG_PATH=./logs/llm-usage.log
N8N_WEBHOOK_URL=
FINDER_DEFAULT_RADIUS_METERS=8000
SSE_ASSIST_ENABLED=true
LANGSMITH_TRACING_ENABLED=false
LANGSMITH_ENDPOINT=
LANGSMITH_API_KEY=
```

Key behaviors:
- If `LLM_ENABLED=false` or key is missing, server uses deterministic/template fallback.
- `ADDRESS_PROVIDER` controls lookup mode: `mock`, `google`, or `hybrid`.
- `SSE_ASSIST_ENABLED` gates assist streaming; client falls back to `/api/chat-assist` on stream failure.
- Finder uses Google Places first when available, then Overpass fallback.
- `N8N_WEBHOOK_URL` enables post-intake automation trigger; missing URL returns safe no-op.
- LLM usage is recorded for cost and fallback-rate monitoring.

---

## Data, Logging, and Observability

### Data model (POC)
- No persistent transactional database.
- Session and flow state live in browser memory/context.
- Operational history is derived from structured JSON logs.

### Log files
- `logs/app-events.log`: lifecycle and funnel events.
- `logs/app-errors.log`: runtime and transition errors.
- `logs/qa-checklist.log`: QA probes/checks.
- `logs/llm-usage.log`: token/cost/fallback telemetry.
- Trace events include per-request `traceId` and optional external forwarding metadata.

### Metrics
`/api/metrics` computes:
- conversion and order outcomes,
- route/session interaction summaries,
- financing and checkout indicators,
- SLA targets and breach counts,
- monthly KPI snapshots.

---

## Security and Reliability Posture (Current)

### Present controls
- Deterministic flow guards for invalid transitions.
- LLM fallback mode for degraded external dependencies.
- Deterministic input/output safety screening with policy categories.
- Payment/PII masking and compliance payload blocking.
- Session identifiers and structured audit-style logging.

### Remaining production gaps
- Formal PII governance and automated redaction policy.
- Enterprise-grade authN/authZ integration.
- Real CRM/OMS/billing coupling.
- Centralized log retention and security monitoring.

---

## Testing and Quality Coverage

Run all tests:

```bash
node --test tests/*.mjs
```

Current result (March 17, 2026):
- **120 tests passing, 0 failing**

Coverage spans:
- workflow gating and route behavior,
- client-side validators/utilities,
- metrics aggregation,
- quote ranking determinism,
- export and booking flow,
- LLM integration guardrail presence checks,
- SSE event protocol and fallback behavior,
- post-intake webhook behavior,
- finder provider fallback behavior,
- onboarding walkthrough wiring,
- agentic routing/safety eval harness.

---

## Why This Stack Was Chosen for the POC

This stack optimizes for:
- fast iteration in a single repo,
- low operational complexity,
- deterministic control over high-risk business logic,
- easy local reproducibility for demos and evaluation.

Trade-offs accepted at POC stage:
- file-based telemetry instead of enterprise observability stack,
- no real backend system integrations,
- no persistent session store,
- limited production hardening.

---

## Productionization Path

Recommended next steps:
1. Integrate authoritative product/catalog/eligibility and order systems.
2. Add production identity, tokenized payment gateway integration, and CRM handoff.
3. Introduce persistent storage for multi-instance reliability.
4. Implement privacy controls: redaction, retention windows, access policies.
5. Add CI/CD quality gates tied to conversion-critical tests and SLA checks.

---

## Reference Files (This Repo)
- `app.js`
- `server.mjs`
- `index.html`
- `styles.css`
- `src/client/features/chat/stream-renderer.mjs`
- `src/client/features/onboarding/walkthrough.mjs`
- `src/server/finder/finder-service.mjs`
- `src/server/finder/google-places-provider.mjs`
- `src/server/finder/overpass-provider.mjs`
- `shared/agent-router-utils.mjs`
- `shared/automation-utils.mjs`
- `shared/trace-utils.mjs`
- `shared/ai-safety-utils.mjs`
- `shared/privacy-utils.mjs`
- `shared/client-utils.mjs`
- `shared/workflow-utils.mjs`
- `shared/quote-utils.mjs`
- `shared/metrics-utils.mjs`
- `tests/*.mjs`
- `README.md`
