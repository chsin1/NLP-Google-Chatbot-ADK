# Bell NLP Chatbot - Executive Demo Script v2
Prepared for Bell stakeholders  
Date: March 17, 2026  
Target duration: 12-15 minutes

## 1. Objective and Framing (1 minute)
Opening line:
"Today we are demonstrating Bell's end-to-end NLP chatbot proof of concept. The focus is not only conversation quality, but complete journey execution: discovery, checkout, order confirmation, and post-order booking."

Business framing:
- Bell needs an E2E digital sales assistant that reduces drop-off and keeps business-critical decisions deterministic.
- This POC combines deterministic flow control with optional LLM-assisted language support.

## 2. Demo Setup Checklist (1 minute)
- Open the app in browser.
- Ensure server is running (`node server.mjs`).
- Confirm metrics endpoint is reachable (`/api/metrics`).
- Keep terminal open for test and telemetry references.

Presenter note:
"If LLM connectivity is unavailable, the system should still proceed using template fallback paths."

## 3. Product Walkthrough - What the User Experiences (2 minutes)
Show and explain:
1. Greeting and AI disclosure.
2. Customer status selection (new vs existing).
3. Service selection and clarification.
4. Guided quote comparison.
5. Onboarding/authentication branch.
6. Payment and shipping progression.
7. Order confirmation and receipt output.
8. Booking slot selection and post-order options.

Talk track:
"The key design choice is deterministic control over the critical path, while AI improves fluency and intent handling."

## 4. Live E2E Success Path (4 minutes)
Scenario to run:
- New customer internet purchase from start to confirmed order.

What to highlight during run:
- Flow progresses without dead ends.
- Quote builder displays ranked options.
- Checkout remains structured and validated.
- Order confirmation and booking slot selection complete in-session.

Evidence anchor to cite:
- Observed session `sess_1773679617490_w3jtpj` completed order in 65.206 seconds and booking selection in 71.951 seconds on March 16, 2026.

## 5. Quality and Reliability Evidence (2 minutes)
State clearly:
- Automated suite status: 76/76 passing (`node --test tests/*.test.mjs`).
- Operational window (Mar 11-16, 2026): 28 order attempts, 27 successful.
- Attempt-to-success rate: 96.43%.

Suggested line:
"This gives us confidence that the prototype behaves consistently under expected path conditions."

## 6. Honest Failure and Learning (2 minutes)
Failure story:
- March 16, 2026 runtime issue: `preferenceTotal is not defined`.
- 38 related error events across 12 sessions.

What was learned:
- UI state assumptions can break conversion-critical flow.
- Regression tests must explicitly cover quote-builder rendering and normalization behavior.

Current status:
- Regression checks are now present in test suite.
- Full automated suite currently passes.

## 7. Risk and Production Readiness Discussion (2 minutes)
Key risks:
- Integration gap (CRM/OMS/billing still mocked).
- Privacy and governance maturity for production scale.
- KPI governance needed for executive decisioning.

Current mitigations:
- Deterministic boundaries for business-critical truth.
- LLM fallback mode and health visibility.
- Structured event logging and SLA/KPI instrumentation.

## 8. Close and Ask (1 minute)
Closing line:
"The POC is viable as a foundation. The next step is controlled productionization: system integrations, governance hardening, and pilot rollout with Bell business users."

Decision ask:
- Approve phase-2 scope for integration and compliance workstream.

## 9. Backup Appendix for Presenter
### A. Quick command references
```bash
node --test tests/*.test.mjs
curl \"http://127.0.0.1:3000/api/metrics?days=30\"
node server.mjs
```

### B. Screens to keep ready
- Landing + KPI dashboard
- Service selection and quote builder
- Checkout and order confirmation
- Booking calendar selection
- Terminal test summary (76/76)

### C. Q&A prompts
- "What fails safely if the model is offline?"
- "Which decisions are deterministic vs AI-assisted?"
- "What is required before production rollout?"
