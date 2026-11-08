"""
State Farm disaster triage orchestrator.

FastAPI owns Nora's conversation: every caller turn (phone or chat), keypad press and call event
comes here, Nemotron (conversation.py) decides what Nora says and does, and this service carries
out those actions and writes them to SpacetimeDB. The frontend only plays the reply and shows the
results. It's also the gateway for the agent console's writes (step in, approve, hang up).

Run from this folder:  python -m uvicorn main:app --reload --port 8000
Needs NVIDIA_API_KEY (in backend/.env) for Nora to talk; without it /api/health reports
"nemotron": false and conversation endpoints answer 503 instead of making anything up.
"""

import asyncio
import os
import random
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

load_dotenv()

from conversation import NoraUnavailable, nemotron_configured, next_turn  # noqa: E402

app = FastAPI(title="State Farm Disaster Triage Orchestrator")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=False, allow_methods=["*"], allow_headers=["*"])

SPACETIMEDB_HOST = os.getenv("SPACETIMEDB_URI", "https://maincloud.spacetimedb.com")
DB_IDENTITY = os.getenv("SPACETIMEDB_DB", "c20029daa0df66e41fc3af91cac6f9bbd41ec925bd4dc1e4f6e1ce4d89592aa2")
DETAIL_FIELDS = {"type", "when", "where", "quote", "safe", "shut", "heat", "notify"}


# ---------------------------------------------------------------------------
# SpacetimeDB helpers
# ---------------------------------------------------------------------------

async def execute_sql(client: httpx.AsyncClient, query: str) -> List[List[Any]]:
    """Read query via the HTTP SQL endpoint (returns one result object per statement)."""
    try:
        resp = await client.post(
            f"{SPACETIMEDB_HOST}/v1/database/{DB_IDENTITY}/sql", content=query, headers={"Content-Type": "text/plain"}, timeout=3.0
        )
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list):
                data = data[0] if data else {}
            return data.get("rows", [])
    except Exception as e:
        print(f"[SQL] {e}")
    return []


async def send_reducer(client: httpx.AsyncClient, name: str, args: list) -> bool:
    try:
        resp = await client.post(f"{SPACETIMEDB_HOST}/v1/database/{DB_IDENTITY}/call/{name}", json=args, timeout=5.0)
        if resp.status_code != 200:
            print(f"[SpacetimeDB] {name} ({resp.status_code}): {resp.text}")
        return resp.status_code == 200
    except Exception as e:
        print(f"[SpacetimeDB] {name}: {e}")
        return False


async def resolve_ids(client: httpx.AsyncClient, customer_id: int, call_id: Optional[int]) -> Tuple[int, int, int, int]:
    """(call_id, ticket_id, claim_id, policy_id) for the customer's current call."""
    if not call_id:
        rows = await execute_sql(
            client, f"SELECT id FROM active_calls WHERE customer_id = {customer_id} AND status != 'completed' ORDER BY id DESC LIMIT 1"
        )
        call_id = rows[0][0] if rows else int(time.time() * 1000) % 1_000_000_000
    rows = await execute_sql(client, f"SELECT ticket_id FROM triage_queue WHERE call_id = {call_id} ORDER BY ticket_id DESC LIMIT 1")
    ticket_id = rows[0][0] if rows else call_id
    rows = await execute_sql(client, f"SELECT id FROM claims WHERE call_id = {call_id} ORDER BY id DESC LIMIT 1")
    claim_id = rows[0][0] if rows else call_id
    rows = await execute_sql(client, f"SELECT policy_id FROM policies WHERE customer_id = {customer_id} ORDER BY policy_id LIMIT 1")
    policy_id = rows[0][0] if rows else customer_id
    return call_id, ticket_id, claim_id, policy_id


# ---------------------------------------------------------------------------
# Call sessions (conversation memory), keyed by call id
# ---------------------------------------------------------------------------

SESSIONS: Dict[int, Dict[str, Any]] = {}


def session_for(call_id: int, customer_id: int, lang: str, channel: str, profile: Optional[dict]) -> Dict[str, Any]:
    s = SESSIONS.get(call_id)
    if s is None:
        s = SESSIONS[call_id] = {
            "customer_id": customer_id,
            "lang": lang or "en",
            "channel": channel,
            "profile": profile or {},
            "history": [],
            "claim": None,
            "confirmed": set(),
            "claim_number": None,
            "transferred": False,
            "agent_joined": False,
            "last_reply": "",
        }
    if profile:
        s["profile"] = profile
    return s


class TurnRequest(BaseModel):
    customer_id: int
    call_id: Optional[int] = None
    user_transcript: Optional[str] = None  # what the caller said
    dtmf: Optional[str] = None  # keypad digit
    event: Optional[str] = None  # "contact_added"
    language: Optional[str] = "en"
    channel: str = "call"  # "call" | "chat"
    profile: Optional[Dict[str, Any]] = None


def unavailable(reason: str) -> JSONResponse:
    return JSONResponse(status_code=503, content={"error": "nora_unavailable", "detail": reason})


async def run_turn(req: TurnRequest, caller_input: str, history_text: Optional[str], force: List[dict]) -> dict:
    """One Nemotron turn: decide, carry out actions, write to the database, return what the phone needs."""
    async with httpx.AsyncClient() as client:
        call_id, ticket_id, claim_id, policy_id = await resolve_ids(client, req.customer_id, req.call_id)
    s = session_for(call_id, req.customer_id, req.language or "en", req.channel, req.profile)

    decided = await next_turn(s, caller_input)  # raises NoraUnavailable
    reply, actions = decided["reply"], decided["actions"] + force

    writes = []  # (reducer, args)
    out_actions: List[dict] = []
    for a in actions:
        kind = a.get("type")
        if kind == "open_claim" and not s["claim"]:
            s["claim"] = {
                "loss_type": str(a.get("loss_type") or "Property damage"),
                "description": str(a.get("damage_description") or (history_text or "")),
                "estimated_payout": float(a.get("estimated_payout") or 0),
            }
            score = int(a.get("risk_score") or 80)
            writes.append(("update_triage_score", [ticket_id, req.customer_id, call_id, score, s["claim"]["loss_type"], s["claim"]["description"][:200], str(a.get("hazard") or s["claim"]["loss_type"])]))
            writes.append(("create_or_update_claim", [claim_id, req.customer_id, policy_id, call_id, s["claim"]["description"], s["claim"]["loss_type"], s["claim"]["estimated_payout"], False]))
            out_actions.append({**a, "risk_score": score})
        elif kind == "update_risk":
            score = max(0, min(100, int(a.get("risk_score") or 0)))
            writes.append(("update_triage_score", [ticket_id, req.customer_id, call_id, score, str(a.get("hazard") or "Check-in"), str(a.get("reason") or "")[:200], str(a.get("hazard") or "None")]))
            out_actions.append({**a, "risk_score": score})
        elif kind == "confirm_details" and s["claim"]:
            fields = [f for f in (a.get("fields") or []) if f in DETAIL_FIELDS]
            s["confirmed"].update(fields)
            if fields:
                out_actions.append({"type": "confirm_details", "fields": fields})
        elif kind == "submit_claim" and s["claim"] and not s["claim_number"]:
            s["claim_number"] = f"SF-CLM-2026-{random.randint(4000, 9999)}"
            c = s["claim"]
            writes.append(("create_or_update_claim", [claim_id, req.customer_id, policy_id, call_id, c["description"], c["loss_type"], c["estimated_payout"], True]))
            out_actions.append({"type": "submit_claim", "claim_number": s["claim_number"]})
        elif kind == "transfer_to_agent" and not s["transferred"]:
            s["transferred"] = True
            out_actions.append(a)
        elif kind == "set_language" and a.get("language") in ("en", "es"):
            s["lang"] = a["language"]
            out_actions.append(a)
        elif kind in ("notify_emergency_contact", "text_caller", "end_call"):
            out_actions.append(a)

    # The claim number exists only once submitted; Nemotron refers to it as {CLAIM_NUMBER}.
    number = s["claim_number"] or ""
    reply = reply.replace("{CLAIM_NUMBER}", number)
    for a in out_actions:
        if a.get("type") == "text_caller":
            a["text"] = str(a.get("text") or "").replace("{CLAIM_NUMBER}", number)

    # Memory + transcript.
    s["history"].append({"role": "user", "content": caller_input})
    s["history"].append({"role": "assistant", "content": reply})
    s["last_reply"] = reply
    chunk = (f"Customer: {history_text}\n" if history_text else "") + f"AI: {reply}"
    async with httpx.AsyncClient() as client:
        await send_reducer(client, "update_call_transcript", [call_id, req.customer_id, chunk])
        if writes:
            await asyncio.gather(*[send_reducer(client, n, args) for n, args in writes])

    return {
        "reply": reply,
        "actions": out_actions,
        "suggested_replies": decided["suggested_replies"],
        "language": s["lang"],
        "call_id": call_id,
        "ticket_id": ticket_id,
        "claim_id": claim_id,
        "claim_number": s["claim_number"],
    }


# ---------------------------------------------------------------------------
# Conversation endpoints
# ---------------------------------------------------------------------------

@app.get("/api/health")
async def health():
    return {"ok": True, "nemotron": nemotron_configured()}


@app.post("/api/call/start")
async def call_start(req: TurnRequest):
    """Nora opens the conversation (she places the call). Starts a fresh session."""
    if req.call_id:
        SESSIONS.pop(req.call_id, None)
    opener = (
        "[The policyholder just answered your outbound welfare call. Open the call: introduce yourself and why you're calling.]"
        if req.channel == "call"
        else "[The policyholder opened a text chat with you. Greet them.]"
    )
    try:
        return await run_turn(req, opener, None, [])
    except NoraUnavailable as e:
        return unavailable(str(e))


@app.post("/api/chat")
async def chat_turn(req: TurnRequest):
    """One thing the caller said, a keypad press, or a call event."""
    async with httpx.AsyncClient() as client:
        call_id, *_ = await resolve_ids(client, req.customer_id, req.call_id)
    req.call_id = call_id
    s = session_for(call_id, req.customer_id, req.language or "en", req.channel, req.profile)
    said = (req.user_transcript or "").strip()

    # A person has taken over: log the caller, Nora stays quiet.
    if s["agent_joined"]:
        if said:
            s["history"].append({"role": "user", "content": said})
            async with httpx.AsyncClient() as client:
                await send_reducer(client, "update_call_transcript", [call_id, req.customer_id, f"Customer: {said}"])
        return {"reply": "", "actions": [], "suggested_replies": [], "language": s["lang"], "call_id": call_id}

    force: List[dict] = []
    if req.dtmf:
        if req.dtmf == "2" and s["last_reply"]:
            # Replay, not a new answer.
            return {"reply": s["last_reply"], "actions": [], "suggested_replies": [], "language": s["lang"], "call_id": call_id, "repeat": True}
        if req.dtmf in ("1", "0"):
            caller_input = f"[The caller pressed {req.dtmf} on the keypad to reach a person.]"
            force.append({"type": "transfer_to_agent", "reason": f"pressed {req.dtmf}"})
        elif req.dtmf == "3":
            new_lang = "es" if s["lang"] == "en" else "en"
            s["lang"] = new_lang
            caller_input = f"[The caller pressed 3 to continue in {'Spanish' if new_lang == 'es' else 'English'}. Continue the call in that language.]"
            force.append({"type": "set_language", "language": new_lang})
        else:
            caller_input = f"[The caller pressed {req.dtmf} on the keypad.]"
    elif req.event == "contact_added":
        ec = (s["profile"] or {}).get("emergency_contact", "their emergency contact")
        caller_input = f"[{ec} was just added to the call by the policyholder.]"
    elif said:
        caller_input = said
    else:
        return JSONResponse(status_code=400, content={"error": "empty turn"})

    try:
        return await run_turn(req, caller_input, said or None, force)
    except NoraUnavailable as e:
        return unavailable(str(e))


# ---------------------------------------------------------------------------
# Gateway endpoints for the agent console and the web claim form
# ---------------------------------------------------------------------------

class CallRef(BaseModel):
    customer_id: int
    call_id: Optional[int] = None


class TranscriptRequest(CallRef):
    speaker: str  # "Customer" | "AI" | "Agent"
    text: str


class ClaimRequest(CallRef):
    description: str
    hazard_type: str
    est_payout: float
    customer_approved: bool = False


class TriageRequest(CallRef):
    priority_score: int
    category: str
    summary_reason: str
    detected_hazard: str


class ApproveRequest(CallRef):
    claim_number: str
    description: Optional[str] = None
    hazard_type: Optional[str] = None
    est_payout: Optional[float] = None


@app.post("/api/transcript")
async def transcript_line(req: TranscriptRequest):
    """A line said outside a Nora turn (e.g. the agent after stepping in)."""
    speaker = req.speaker if req.speaker in ("Customer", "AI", "Agent") else "Agent"
    async with httpx.AsyncClient() as client:
        call_id, *_ = await resolve_ids(client, req.customer_id, req.call_id)
        ok = await send_reducer(client, "update_call_transcript", [call_id, req.customer_id, f"{speaker}: {req.text}"])
    s = SESSIONS.get(call_id)
    if s is not None:
        s["history"].append({"role": "user" if speaker == "Customer" else "assistant", "content": f"[{speaker}] {req.text}"})
    return {"ok": ok, "call_id": call_id}


@app.post("/api/call/join")
async def call_join(req: CallRef):
    """Agent steps in: Nora goes quiet and the triage ticket shows AGENT_CONNECTED."""
    async with httpx.AsyncClient() as client:
        call_id, *_ = await resolve_ids(client, req.customer_id, req.call_id)
        ok = await send_reducer(client, "join_call_by_agent", [call_id])
    if call_id in SESSIONS:
        SESSIONS[call_id]["agent_joined"] = True
    return {"ok": ok, "call_id": call_id}


@app.post("/api/call/end")
async def call_end(req: CallRef):
    async with httpx.AsyncClient() as client:
        call_id, *_ = await resolve_ids(client, req.customer_id, req.call_id)
        ok = await send_reducer(client, "end_call", [call_id])
    SESSIONS.pop(call_id, None)
    return {"ok": ok, "call_id": call_id}


@app.post("/api/triage")
async def triage_upsert(req: TriageRequest):
    async with httpx.AsyncClient() as client:
        call_id, ticket_id, *_ = await resolve_ids(client, req.customer_id, req.call_id)
        ok = await send_reducer(client, "update_triage_score", [
            ticket_id, req.customer_id, call_id, max(0, min(100, int(req.priority_score))), req.category, req.summary_reason, req.detected_hazard
        ])
    return {"ok": ok, "call_id": call_id}


@app.post("/api/claim")
async def claim_upsert(req: ClaimRequest):
    async with httpx.AsyncClient() as client:
        call_id, _t, claim_id, policy_id = await resolve_ids(client, req.customer_id, req.call_id)
        ok = await send_reducer(client, "create_or_update_claim", [
            claim_id, req.customer_id, policy_id, call_id, req.description, req.hazard_type, float(req.est_payout), bool(req.customer_approved)
        ])
    return {"ok": ok, "call_id": call_id, "claim_id": claim_id}


@app.post("/api/claim/approve")
async def claim_approve(req: ApproveRequest):
    """Agent approval: records consent first (agent_approve_claim requires it), then submits."""
    async with httpx.AsyncClient() as client:
        call_id, _t, claim_id, policy_id = await resolve_ids(client, req.customer_id, req.call_id)
        if req.description is not None and req.hazard_type is not None and req.est_payout is not None:
            await send_reducer(client, "create_or_update_claim", [
                claim_id, req.customer_id, policy_id, call_id, req.description, req.hazard_type, float(req.est_payout), True
            ])
        ok = await send_reducer(client, "agent_approve_claim", [claim_id, req.claim_number])
    return {"ok": ok, "call_id": call_id, "claim_id": claim_id}
