# Bell Canada Sales Assistant — AI Agent POC

**MMAI 891 | Academic Proof of Concept | March 2026**

A conversational AI sales agent for Bell Canada built on Google ADK (Agent Development Kit) and powered by Gemini 2.5 Pro. The agent autonomously guides new and existing customers through plan discovery, personalized recommendations, lead capture, and human handoff — without hardcoded scripts or decision trees.

---

## Executive Snapshot

| Area | Current State |
|---|---|
| Agent type | Google ADK LlmAgent — autonomous tool use + multi-turn reasoning |
| Model | Gemini 2.5 Pro (`gemini-2.5-pro`) |
| Tools | GoogleSearchTool + UrlContextTool + check_eligibility + create_lead + escalate_to_human |
| Frontend | Bell-branded chat UI (Node.js + vanilla JS) |
| Bridge | FastAPI Python server (`agent_api.py`) |
| Session memory | ADK InMemorySessionService |
| Test pass rate | 8/10 (80%) across 10 documented scenarios |
| Baseline | `NLP-Google-Chatbot_v0` — deterministic FSM chatbot |

---

## Why This Is an AI Agent — Not a Chatbot

| Capability | Baseline FSM (v0) | ADK Agent (current) |
|---|---|---|
| Intent routing | Keyword matching + fixed buttons | LLM multi-turn reasoning |
| Plan recommendations | Fixed menu regardless of context | Personalized based on household, budget, usage |
| Tool use | Hardcoded imperative function calls | Autonomous — model decides when and which tool to call |
| Grounding | Static hardcoded data | Live bell.ca URLs fetched in real time |
| Escalation | Fixed FSM step | Model judgment — context and scope dependent |
| Multi-turn memory | State machine — loses context across branches | ADK session service — carries context forward |
| Multilingual | Required translation API + hardcoded label translations | Native — Gemini detects and responds in customer's language |
| Lead capture | None | create_lead called autonomously on confirmation — BELL-XXXXXXXX reference |
| Escalation handoff | None | escalate_to_human called with ticket ESC-XXXXX and conversation summary |

---

## Architecture

```
Browser Chat UI (index.html + app.js)
        ↓  unique session ID generated per session
Node.js Server (server.mjs)
  ├── ai-safety-utils.mjs     ← input/output safety screening (active)
  ├── privacy-utils.mjs       ← PII + payment data redaction (active)
  ├── trace-utils.mjs         ← trace ID per request (active)
  └── /api/chat-assist        ← ADK bridge entry point
        ↓
FastAPI Bridge (agent_api.py :8000)
  ├── ADK Runner
  ├── InMemorySessionService
  └── logs/adk-conversations.log  ← conversation logging
        ↓
Google ADK Root Agent
  ├── model: gemini-2.5-pro
  ├── sub-agents: google_search_agent + url_context_agent
  └── tools: check_eligibility + create_lead + escalate_to_human
        ↓
Gemini 2.5 Pro API (generativelanguage.googleapis.com)
```

**Key design decision:** A single guard `if (state.adkGreeted) return` in `transitionTo()` bypasses the entire FSM once the ADK agent has greeted the user. The safety layer, logging, and 126 unit tests are preserved. All conversation routing is handed to the ADK agent.

**FSM modules actively used:** `ai-safety-utils.mjs`, `privacy-utils.mjs`, `trace-utils.mjs`

**FSM modules superseded by ADK:** `agent-router-utils.mjs`, `flow-utils.mjs`, `quote-utils.mjs`, `conversation-utils.mjs`, `workflow-utils.mjs`, `client-utils.mjs`

---

## Project Structure

```
NLP-Google-Chatbot/
├── agent.py                          ← ADK agent definition (NEW)
├── agent_api.py                      ← FastAPI bridge server (NEW)
├── app.js                            ← Chat UI logic (modified — FSM bypassed)
├── index.html                        ← Bell chat UI
├── server.mjs                        ← Node API server (modified — ADK bridge added)
├── styles.css                        ← UI styles (modified — journey progress hidden)
├── .env.local                        ← Local env vars (gitignored — create manually)
├── .env.example                      ← Env template (safe to commit)
├── requirements.txt                  ← Python dependencies
├── venv/                             ← Python virtual environment (gitignored)
├── shared/
│   ├── ai-safety-utils.mjs           ← ACTIVE — input/output safety screening
│   ├── privacy-utils.mjs             ← ACTIVE — PII redaction
│   ├── trace-utils.mjs               ← ACTIVE — request tracing
│   ├── agent-router-utils.mjs        ← Superseded by ADK agent reasoning
│   ├── flow-utils.mjs                ← Superseded by ADK agent reasoning
│   ├── quote-utils.mjs               ← Superseded by ADK url_context tool
│   └── ...                           ← Other shared modules (preserved, not active)
├── src/
│   └── server/finder/                ← Bell store finder (Google Places)
├── logs/
│   ├── adk-conversations.log         ← ADK agent conversation log (NEW)
│   ├── app-events.log
│   └── app-errors.log
├── tests/                            ← 126 passing unit tests (deterministic logic)
└── docs/                             ← Report and demo script
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.10+ (3.9 works with minor limitations — MCP tools unavailable)
- Google Cloud account with Vertex AI enabled
- Gemini API key from [aistudio.google.com](https://aistudio.google.com)
- gcloud CLI authenticated

### 1 — Clone and install

```bash
git clone https://github.com/chsin1/NLP-Google-Chatbot-ADK.git
cd NLP-Google-Chatbot-ADK
```

Install Node dependencies:
```bash
npm install
```

Set up Python virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate        # Mac/Linux
# venv\Scripts\activate         # Windows
pip install -r requirements.txt
```

### 2 — Configure environment

Create `.env.local` in the repo root (never commit this file):

```env
ADK_BRIDGE_ENABLED=true
ADK_BRIDGE_URL=http://127.0.0.1:8000/chat
GOOGLE_API_KEY=your_gemini_api_key_here
OPENAI_API_KEY=disabled
LLM_ENABLED=false
ADDRESS_PROVIDER=mock
LLM_USAGE_LOG_PATH=./logs/llm-usage.log
SSE_ASSIST_ENABLED=true
```

Get your Gemini API key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey) — create it under the same GCP project.

### 3 — Authenticate gcloud

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

### 4 — Start both servers

**Terminal 1 — Python ADK bridge:**
```bash
source venv/bin/activate
uvicorn agent_api:app --port 8000 --reload
```

**Terminal 2 — Node server:**
```bash
node server.mjs
```

### 5 — Open the chat

```
http://127.0.0.1:3000
```

The chat opens with the ADK agent greeting. No FSM prompts appear.

---

## Agent Capabilities — Test Results Summary

| TC | Scenario | Tools Called | Result | Turns |
|---|---|---|---|---|
| TC-01 | New customer — monthly phone plan | url_context, create_lead | ✅ Pass | 6 |
| TC-02 | Ambiguous multi-intent | None | ❌ Fail — re-asked qualification | 3 |
| TC-03 | Out of scope — bill dispute | escalate_to_human | ✅ Pass | 1 |
| TC-04 | Home internet — personalized household | url_context, check_eligibility, create_lead, escalate_to_human | ✅ Pass | 3 |
| TC-05 | Existing customer — plan upgrade | None | ✅ Pass | 3 |
| TC-06 | Full tool chain — Fibe 500 Markham | check_eligibility, url_context, create_lead, escalate_to_human | ✅ Pass | 4 |
| TC-07 | Churn — considering Rogers | None | ⚠️ Partial | 4 |
| TC-08 | Budget constrained — $45 max | url_context, create_lead | ✅ Pass | 4 |
| TC-09 | French language | url_context | ✅ Pass | 3 |
| TC-10 | Bundle — phone + internet, new to Toronto | url_context, check_eligibility | ✅ Pass | 6 |

**Pass rate: 8/10 (80%) | Average turns to recommendation: 3.7**

---

## Agent Design (agent.py)

Three agent components:

**Root agent** — `Sales_Agent_for_Bell_Canada_Telco`
- Model: `gemini-2.5-pro`
- Tools: all five tools listed below
- Instruction: full Bell sales flow — qualification, mobile plans, internet availability, lead capture, escalation rules

**Google Search sub-agent** — finds current Bell promotions, policies, and product info via live Google Search

**URL Context sub-agent** — fetches live content from:
- `https://www.bell.ca/Mobility/Cell_phone_plans` — mobile plans
- `https://www.bell.ca/Bell_Internet/Internet_access` — internet plans

**Custom tools:**

| Tool | Function | Output |
|---|---|---|
| `check_eligibility` | Verifies customer eligibility for a service type | Structured eligibility result with available options |
| `create_lead` | Records plan selection on customer confirmation | BELL-XXXXXXXX unique reference number |
| `escalate_to_human` | Hands off to human agent with full context | ESC-XXXXX ticket number + conversation summary |

### Autonomy Boundaries

**Agent may:** explain and compare plans, ask clarifying questions, fetch live Bell data, recommend specific plans with reasoning, create lead records, direct to bell.ca for completion, respond in any language.

**Agent must escalate:** customer requests human, payment or account access needed, complaint or dispute raised, authentication required.

---

## Key Changes from Original Repo

### server.mjs
- Added ADK bridge block at top of `callOpenAIResponses()` — routes to FastAPI when `ADK_BRIDGE_ENABLED=true`
- Falls through to original OpenAI path if ADK bridge fails or is disabled

### app.js
- `openChatWidget()` — sends explicit greeting trigger to ADK agent on first open, returns early before FSM initializes
- `transitionTo()` — guard `if (state.adkGreeted) return` blocks all FSM transitions once agent is active
- `chatForm` submit handler — sends user messages directly to `/api/chat-assist`, displays ADK response
- `state` object — added `adkGreeted: false` flag

### styles.css
- `#journey-progress { display: none !important }` — hides FSM step progress bar

### New files
- `agent.py` — ADK agent definition with all tools and instruction prompt
- `agent_api.py` — FastAPI bridge connecting Node server to ADK runner
- `.env.local` — local environment variables (gitignored, create manually)
- `requirements.txt` — Python dependencies

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `ADK_BRIDGE_ENABLED` | Route chat through ADK agent | `false` |
| `ADK_BRIDGE_URL` | FastAPI bridge URL | `http://127.0.0.1:8000/chat` |
| `GOOGLE_API_KEY` | Gemini API key from AI Studio | required |
| `OPENAI_API_KEY` | Set to `disabled` when using ADK | `disabled` |
| `LLM_ENABLED` | Enable OpenAI fallback | `false` |
| `ADDRESS_PROVIDER` | Address lookup mode | `mock` |

---

## Running Tests

Original 126 unit tests (deterministic logic — no LLM required):
```bash
node --test tests/*.mjs
```

Test the ADK bridge directly:
```bash
curl -X POST http://127.0.0.1:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "I want a new phone plan", "session_id": "test-1"}'
```

Health check:
```bash
curl http://127.0.0.1:8000/health
```

View conversation logs:
```bash
cat ./logs/adk-conversations.log
```

---

## Known Limitations

- Session memory is in-memory only — restarting uvicorn clears all sessions
- Agent can re-ask qualification question under highly ambiguous multi-part input (TC-02) — instruction prompt fix pending
- Churn signal handling suboptimal — re-qualifies before addressing retention concern (TC-07)
- Python 3.9 used — 3.10+ recommended for full ADK MCP tool support
- Conversation history not passed across browser page refreshes

---

## GCP Configuration

| Resource | Value |
|---|---|
| Project ID | project-270d19bd-b108-479f-957 |
| Region | northamerica-northeast2 (Calgary) |
| Model | gemini-2.5-pro via Gemini API |
| Vertex AI Agent Designer | Cloud reference — local agent.py is the active version |
| Billing | Enabled — GCP trial credits active |

---

## Versions

| Folder | Description | GitHub |
|---|---|---|
| `NLP-Google-Chatbot/` (this repo) | Current — ADK agent integrated | ✅ This repo |
| `NLP-Google-Chatbot_v1_pre_agent/` | Checkpoint before ADK integration | Local only |
| `NLP-Google-Chatbot_v0/` | Original baseline — deterministic FSM only | Local only |
