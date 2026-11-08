# HeyNeighbor · We knock first.

**Nora is State Farm's AI assistant for disasters and emergencies.** When an alert hits an area, she phones the policyholders most at risk first. On that one call she checks that they're safe, starts the claim, confirms the details out loud, and submits it with their OK. They don't need an app, a login or a form, and they can reach a person at any time.

Built at HackUTD 2026 for the State Farm track.

---

## What it does

**For the policyholder (portal at `/customer`)**
- **A normal phone call.** The screen looks like an iPhone call, with branded caller ID showing "Verified caller" and why State Farm is calling. The caller just talks, in English or Spanish.
- **Nora decides everything live** from what the caller says: what to ask next, whether to open a claim, which details are confirmed, when to text them, when to submit, when to hand off. Nothing is pre-scripted.
- **Phone keypad:** 1 for a person, 2 to repeat, 3 to switch between Spanish and English.
- **Family can join:** "add call" brings the emergency contact onto the call.
- **Texts and Messages:** Nora's texts arrive as iPhone notifications and stay in a Messages screen.
- **Live claim tracker:** the claim fills in as details are confirmed. When an agent approves it, the timeline moves to *Approved → Help is on the way* immediately, and a status text arrives.
- **Accessibility:** live captions, Larger text, High contrast, and **Easier words**, which explains insurance terms and asks Nora to use simple language.

**For the agent (console at `/agent`)**
- **Priority queue** ranked by urgency and risk, plus a **map** of policyholders with clickable pins.
- **Needs approval** lane: claims waiting for a person, with Review and Approve.
- **Live transcript** of every call, and **Nora's actions** as she takes them.
- **Step in** at any time: Nora goes quiet, and the agent gets a handoff summary.
- **Edit claim** to correct Nora's claim type, estimate or description before approving.
- **Shows which details are unconfirmed,** so the agent sees exactly where Nora isn't sure.
- **Keyboard shortcuts** (`?` lists them): J/K to move, S to step in, A to approve, D for details, M/Q for map/queue.
- **Optional Live Nora feed popup** (see `NEXT_PUBLIC_LIVE_FEED` below).

---

## How it works

```
Emergency alert ──▶ Risk ranking ──▶ Nora calls the most at-risk first
                                          │
                                Caller talks (EN/ES, any phone)
                                          │
                 FastAPI orchestrator ──▶ Nemotron decides what Nora says & does
                        │                  (open claim, confirm details, text,
                        │                   transfer, submit, end call)
                        ▼
                  SpacetimeDB  ◀──── live sync ────▶  Agent console
              (call, triage, claim)                 (queue, Needs approval)
                        │                                  │
                        ▼                                  ▼
          Portal timeline + texts  ◀── approve ── Agent reviews / edits / approves
```

- **Next.js frontend** (`src/`): the phone, portal and agent console. It sends what the caller says or presses to FastAPI, plays back Nora's reply and shows her actions. It doesn't decide where the conversation goes.
- **FastAPI orchestrator** (`backend/`): owns each call. It keeps the conversation history, asks Nemotron for the next reply and actions, validates and carries those out, and writes everything to SpacetimeDB. It's also the gateway for the agent's writes (step in, approve, edit, hang up).
- **NVIDIA Nemotron** (via NVIDIA NIM): sees the whole call, the caller's profile and the claim's state, and returns Nora's reply, her actions and suggested caller replies.
- **SpacetimeDB** (`statefarm-backend/spacetimedb/`): the source of truth for customers, policies, calls, the triage queue and claims, synced live to every open screen.

**No canned answers.** If Nemotron isn't configured or doesn't respond, Nora says she's unavailable instead of making something up.

---

## Running it locally

You need **Node 20+** and **Python 3.9+**. Use two terminals.

### 1. Backend (FastAPI)

```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

Create `backend/.env` (it's gitignored) with your NVIDIA key:

```
NVIDIA_API_KEY=nvapi-...
```

Check http://localhost:8000/api/health. It should return `"nemotron": true`.

### 2. Frontend (Next.js)

```bash
npm install
npm run dev
```

Then open:
- http://localhost:3000: home
- http://localhost:3000/customer: the policyholder portal and phone
- http://localhost:3000/agent: the agent console

The agent console header shows whether FastAPI and Nemotron are reachable.

**Tip for demos:** open the portal and the agent console side by side. Click **Reset** in the console before each run.

---

## Configuration

| Variable | Where | Default | What it does |
|---|---|---|---|
| `NVIDIA_API_KEY` | `backend/.env` | (none) | **Required for Nora to talk.** Your NVIDIA NIM API key. |
| `NVIDIA_MODEL` | `backend/.env` | (fallback list) | Preferred model; falls back through several Nemotron and Llama models. |
| `NVIDIA_BASE_URL` | `backend/.env` | `https://integrate.api.nvidia.com/v1` | NIM endpoint. |
| `SPACETIMEDB_URI` | `backend/.env` | `https://maincloud.spacetimedb.com` | SpacetimeDB host the orchestrator writes to. |
| `SPACETIMEDB_DB` | `backend/.env` | team database id | SpacetimeDB database. |
| `NEXT_PUBLIC_ORCHESTRATOR_URL` | `.env.local` | `http://localhost:8000` | Where the frontend finds FastAPI. |
| `NEXT_PUBLIC_SPACETIME_URI` | `.env.local` | `wss://maincloud.spacetimedb.com` | SpacetimeDB host the frontend subscribes to. |
| `NEXT_PUBLIC_SPACETIME_DB` | `.env.local` | team database id | SpacetimeDB database. |
| `NEXT_PUBLIC_SPACETIME` | `.env.local` | on | Set to `off` to run without SpacetimeDB. Tabs then sync only within one browser. |
| `NEXT_PUBLIC_LIVE_FEED` | `.env.local` | off | Set to `true` to show the **Live Nora feed** popup in the agent console. |

---

## Project layout

```
backend/                     FastAPI orchestrator
  main.py                    call sessions, Nora turns, actions, SpacetimeDB writes, agent gateway
  conversation.py            the Nemotron conversation (prompt, actions, JSON handling)
  nemotron_service.py        NVIDIA client + model fallback list
statefarm-backend/spacetimedb/
  src/lib.rs                 tables (customers, policies, active_calls, triage_queue, claims) + reducers
src/
  app/(policyholder)/        home, portal (/customer), web claim form (/customer/claim)
  app/(agent)/agent/         agent console
  components/portal/         phone (WelfareCall), claim summary + timeline, text chat
  components/agent/          map, claim editor, Live Nora feed
  context/StateFarmContext   app state: SpacetimeDB rows + UI state shared across tabs
  lib/backend.ts             FastAPI client
  lib/reader.ts              Larger text / High contrast / Easier words
  module_bindings/           generated SpacetimeDB TypeScript bindings
```

### FastAPI endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Up? Is Nemotron configured? |
| `POST /api/call/start` | Nora opens a call or chat |
| `POST /api/chat` | One caller turn: words, a keypad digit, or an event |
| `POST /api/transcript` | Log a line said outside a Nora turn (e.g. the agent) |
| `POST /api/call/join` · `/api/call/end` | Agent steps in · hang up |
| `POST /api/triage` · `/api/claim` · `/api/claim/approve` | Triage update · claim create/edit/consent · agent approval |

---

## Accessibility

- Voice-first with live captions on the phone screen.
- English and Spanish, switchable during a call.
- Larger text, High contrast and Easier words. These settings are remembered.
- Colour contrast checked against WCAG AA (4.5:1 or better).
- Visible keyboard focus, a skip link, real headings and labelled fields.
- Status changes are announced to screen readers.
- Touch targets of 44px or more, and no animation when reduced motion is on.

---

## Notes

- All policyholder data is mock data for the demo.
- Nora prepares claims, but a State Farm agent approves every one. She never says a claim *is* covered.
- Built with Next.js, React, Tailwind CSS, FastAPI, NVIDIA Nemotron (NIM) and SpacetimeDB.
