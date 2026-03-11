# Bell-Style Agentic Sales Assistant (Prototype)

This prototype implements the core chatbot functions captured in your design canvas pages 9-11:

- Consent capture and disclosure (non-human assistant).
- Mocked authentication and session binding.
- Intent detection routed through an LLM hook (`/api/intent`) with fallback classification.
- Offer discovery and presentation in a product carousel.
- Basket creation with multiple products.
- Eligibility and mock credit checks before transaction handoff.

## What is mocked

- Authentication: user selection from mock profiles.
- Identity and customer data store.
- Product catalog and pricing (Bell-style categories: mobility, home internet, landline).
- Eligibility and credit checks.
- Checkout/payment/order APIs (represented as next-step messaging).

## Run locally

```bash
node server.mjs
```

Open:

- <http://localhost:3000>

Run unit tests:

```bash
node --test tests/*.test.mjs
```

## Optional LLM hookup

By default, intent classification uses a local fallback classifier.

To use OpenAI for intent detection:

```bash
export OPENAI_API_KEY="your_key"
export OPENAI_MODEL="gpt-4.1-mini"
node server.mjs
```

The server will call `POST /v1/responses` and map the result to one of:

- `mobility`
- `home internet`
- `landline`
- `bundle`
- `human_handoff`

## Canvas-to-prototype mapping

- Customer engagement initiation -> consent prompt, disclosure, decline handling.
- Identity verification/authentication -> mock auth panel and session status.
- Qualification/intent detection -> conversational input + LLM intent API.
- Offer presentation -> Bell-style product carousel cards.
- Validation through tool calls -> eligibility checks against mock age/account/credit constraints.

## Notes

- This is a high-level simulation and intentionally excludes real SSO, payment, and CRM integrations.
- UI styling is inspired by Bell's blue/cyan visual language but is not an official Bell asset.
