# Bell Canada Telco Sales Agent — AI Agent POC

**MMAI 891 | Academic Proof of Concept | March 2026**

A conversational AI sales agent for Bell Canada built on Google ADK (Agent Development Kit) and Gemini 2.0 Flash, integrated into a Bell-branded chat UI. The agent autonomously guides new and existing customers through plan discovery, personalized recommendations, and human handoff — without hardcoded scripts or decision trees.

---

## Executive Snapshot

| Area | Current State |
|---|---|
| Agent type | Google ADK LlmAgent — autonomous tool use + multi-turn reasoning |
| Model | Gemini 2.0 Flash (gemini-2.0-flash-001) |
| Tools | GoogleSearchTool + UrlContextTool (live bell.ca grounding) |
| Frontend | Bell-branded chat UI (Node.js + vanilla JS) |
| Bridge | FastAPI Python server (agent_api.py) |
| Session memory | ADK InMemorySessionService |
| Test pass rate | 4/5 (80%) across 5 documented scenarios |
| Baseline | NLP-Google-Chatbot_v0 — deterministic FSM chatbot |

---

## Why This Is an AI Agent (Not a Chatbot)

| Capability | Baseline FSM (v0) | ADK Agent (current) |
|---|---|---|
| Intent routing | Keyword matching | LLM reasoning across turns |
| Plan recommendations | Fixed menu buttons | Personalized based on stated context |
| Tool use | Hardcoded function calls | Autonomous — model decides when to call |
| Grounding | Static hardcoded data | Live bell.ca URLs fetched in real time |
| Escalation | Fixed FSM step | Model judgment — context-dependent |
| Multi-turn memory | State machine | ADK session service |
| Language | English only | Handles multilingual input |

---

## Architecture

```
Browser Chat UI (index.html + app.js)
        ↓
Node.js Server (server.mjs)
  - Safety screening (ai-safety-utils.mjs)
  - Logging + trace IDs
  - /api/chat-assist endpoint
        ↓
FastAPI Bridge (agent_api.py :8000)
  - ADK Runner
  - InMemorySessionService
  - Conversation logging → logs/adk-conversations.log
        ↓
Google ADK Root Agent
  - model: gemini-2.0-flash-001
  - tools: GoogleSearchTool + UrlContextTool
  - sub-agents: google_search_agent + url_context_agent
        ↓
Gemini 2.0 Flash API (generativelanguage.googleapis.com)
```

**Color key:**
- Node.js layer — deterministic safety + routing (unchanged from v0)
- FastAPI bridge — new file, connects Node to ADK
- ADK agent — autonomous reasoning + tool use
- Gemini — LLM backbone

---

## Project Structure

```
NLP-Google-Chatbot/
├── agent.py                          ← ADK agent definition (NEW)
├── agent_api.py                      ← FastAPI bridge server (NEW)
├── app.js                            ← Chat UI logic (modified — FSM bypassed)
├── index.html                        ← Bell chat UI
├── server.mjs                        ← Node API server (modified — ADK bridge added)
├── styles.css                        ← UI styles
├── .env.local                        ← Local env vars (gitignored)
├── .env.example                      ← Env template
├── venv/                             ← Python virtual environment (gitignored)
├── shared/
│   ├── agent-router-utils.mjs        ← Tool routing constants
│   ├── ai-safety-utils.mjs           ← Input/output safety screening
│   ├── automation-utils.mjs
│   ├── client-utils.mjs
│   ├── conversation-utils.mjs
│   ├── flow-utils.mjs
│   ├── metrics-utils.mjs
│   ├── privacy-utils.mjs
│   ├── quote-utils.mjs
│   └── trace-utils.mjs
├── src/
│   └── server/finder/                ← Bell store finder (Google Places)
├── logs/
│   ├── adk-conversations.log         ← ADK agent conversation log (NEW)
│   ├── app-events.log
│   └── app-errors.log
├── tests/                            ← 126 passing unit tests
└── docs/                             ← Report and demo script
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.10+
- Google Cloud account with Vertex AI enabled
- Gemini API key from [aistudio.google.com](https://aistudio.google.com)
- gcloud CLI authenticated

### 1 — Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/NLP-Google-Chatbot.git
cd NLP-Google-Chatbot
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
pip install fastapi uvicorn httpx google-adk google-generativeai python-dotenv
```

### 2 — Configure environment

Create `.env.local` in the repo root:

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

Get your Gemini API key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

### 3 — Authenticate gcloud

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
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

---

## Agent Capabilities

The agent handles these scenarios autonomously:

| Scenario | Agent Behaviour |
|---|---|
| New customer — monthly phone plan | Asks intent, fetches live Bell plans, presents options, confirms selection |
| New customer — home internet | Asks address, checks fibre availability, presents plans, escalates for transaction |
| Existing customer — plan upgrade | Acknowledges current plan, asks about pain points, recommends upgrade with reasoning |
| Budget-constrained customer | Filters recommendations to stated budget |
| Churn risk — considering competitor | Acknowledges concern, presents Bell advantages, offers retention specialist |
| Out of scope — bill dispute | Correctly declines, offers human agent transfer |
| Multilingual — French input | Responds in French |

---

## Agent Design (agent.py)

The agent uses three components:

**Root agent** — `Sales_Agent_for_Bell_Canada_Telco`
- Model: `gemini-2.0-flash-001`
- Instruction: full sales flow for new and existing Bell customers
- Tools: GoogleSearchTool sub-agent + UrlContextTool sub-agent

**Google Search sub-agent** — finds current Bell promotions and policy information

**URL Context sub-agent** — fetches live content from:
- `https://www.bell.ca/Mobility/Cell_phone_plans` — mobile plans
- `https://www.bell.ca/Bell_Internet/Internet_access` — internet plans

### Autonomy boundaries

**Agent may:** explain plans, compare options, collect preferences, fetch live plan data, confirm selections, direct to online purchase or MyBell.

**Agent must escalate:** customer requests human, transaction requires payment processing, account access needed, complaint or dispute raised.

---

## Key Design Decisions

### Why Google ADK over OpenAI function calling

The Agent Design Canvas specified Vertex AI and Gemini. ADK provides the same tool use, session memory, and reasoning loop as Vertex AI Agent Engine without requiring a cloud deployment step — keeping iteration fast during POC development. For production, the agent deploys to Vertex AI Agent Engine with no code changes required.

### Why Gemini 2.0 Flash over 2.5 Pro

Flash delivers 1-3 second response times vs 4-8 seconds for Pro. For a sales conversation where latency affects customer experience, Flash is the correct choice. The tradeoff is reasoning depth on highly ambiguous inputs — a known limitation documented in TC-02.

### Why synthetic tools (URL fetching) over real APIs

Per assignment guidelines, synthetic data and URL-based proxies are used instead of Bell's internal plan catalog API, eligibility engine, and CRM. The agentic behaviour — autonomous tool selection, reasoning, escalation — is identical whether the tool calls a URL or an internal API. ADK's tool abstraction means swapping URL context for a real API requires changing only the tool implementation, not the agent logic.

### Why FSM is preserved not deleted

The original deterministic FSM in app.js is bypassed (via `state.adkGreeted` flag in `transitionTo()`) rather than deleted. This preserves the safety layer, logging infrastructure, and 126 passing unit tests while routing all conversation through the ADK agent. The FSM remains available as a fallback if the ADK bridge is disabled.

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

ADK conversation log (requires both servers running):
```bash
cat ./logs/adk-conversations.log
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

---

## Versions

| Folder | Description |
|---|---|
| `NLP-Google-Chatbot/` | Current — ADK agent integrated |
| `NLP-Google-Chatbot_v1_pre_agent/` | Checkpoint before ADK integration (local only) |
| `NLP-Google-Chatbot_v0/` | Original baseline — deterministic FSM only (local only) |

Only `NLP-Google-Chatbot/` is connected to GitHub. The other two are local backups for baseline comparison.

---

## Known Limitations

- Session memory is in-memory only — restarting uvicorn clears all sessions
- Gemini 2.0 Flash can lose context under highly ambiguous multi-part inputs (documented in TC-02)
- URL context tool depends on bell.ca page structure — changes to Bell's website may affect grounding
- No real CRM, eligibility, or payment integration — synthetic proxies only
- Python 3.9 used (3.10+ recommended for full ADK MCP support)

---

## GCP Project

| Resource | Value |
|---|---|
| Project ID | project-270d19bd-b108-479f-957 |
| Region | northamerica-northeast2 (Calgary) |
| Agent Designer | Vertex AI → Agent Builder → Agent Designer |
| Billing | Enabled — GCP trial credits active |

