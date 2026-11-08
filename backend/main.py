import os
import time
import asyncio
from typing import Optional, Tuple, List, Dict, Any
import httpx
from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

# Load the team's Nemotron module if present; otherwise use a keyword stub with the same output shape.
# The frontend checks `ai_source` in each /api/chat response: with "nemotron" Nora speaks the reply,
# with "stub" she keeps her scripted lines and only uses the triage/claim data.
import re

AI_SOURCE = "nemotron"
try:
    from nemotron_service import process_disaster_turn
except ImportError:
    AI_SOURCE = "stub"

    _NO_HARM = re.compile(
        r"\b(no|without|zero)\s+(damage|problems?|issues?)\b|nothing('?s| is)?\s+(wrong|damaged|broken)|\ball good\b"
        r"|sin (daños?|problemas?)|no hay (daños?|problemas?)|todo bien",
        re.I,
    )
    _OK = re.compile(r"\b(okay|ok|fine|good|safe|bien|estoy bien)\b", re.I)
    _CONSENT = re.compile(r"\b(yes|yeah|yep|sure|please|submit|file it|approve|s[ií]|claro|env[ií]e|adelante)\b", re.I)
    # (pattern, detected_hazard, category, claim hazard_type, est_payout, priority) — any disaster type, EN/ES.
    _KINDS = [
        (r"freez|froze|frozen|pipe|helad|congel|tuber", "Freezing Pipes Hazard", "Freeze / Water", "Water damage: frozen pipe", 3500.0, 90),
        (r"fire|smoke|burn|fuego|humo|quem", "Fire or smoke damage", "Fire", "Fire / smoke damage", 8000.0, 97),
        (r"flood|water|leak|backup|basement|inund|agua|gotera|s[oó]tano", "Water or flood damage", "Flood & Property Hazard", "Water damage", 4500.0, 92),
        (r"tree|branch|[aá]rbol|rama", "Fallen tree or branch", "Structural", "Fallen tree damage", 4000.0, 85),
        (r"roof|hail|wind|shingle|techo|granizo|viento|tejas", "Roof or wind damage", "Roof / Wind", "Roof / wind damage", 3800.0, 70),
        (r"power|outage|apag|sin luz", "Power outage", "Utilities", "Power outage / spoilage", 800.0, 75),
        (r"heat|\bhot\b|\bac\b|a/c|calor|aire acondicionado", "Extreme heat · cooling failure", "Heat", "Equipment breakdown", 1200.0, 88),
        (r"damage|broke|crack|collaps|daño|dañad|roto|rota", "Reported property damage", "Property damage", "Property damage", 2500.0, 75),
    ]

    async def process_disaster_turn(customer_id: int, user_transcript: str, stage: Optional[str] = None) -> dict:
        text = user_transcript or ""
        harmless = bool(_NO_HARM.search(text))
        kind = None if harmless else next((k for k in _KINDS if re.search(k[0], text, re.I)), None)
        out: Dict[str, Any] = {
            "voice_reply": (
                "I understand your emergency. I am logging your details, updating dispatch, and preparing your claim right now."
                if kind else "Thanks for letting me know. I've noted that."
            ),
            # Consent only counts when Nora has just asked to submit (or the caller isn't in a scripted flow).
            "consent": bool(_CONSENT.search(text)) and stage in (None, "coverage"),
        }
        if kind:
            _, hazard, category, hazard_type, payout, priority = kind
            out.update(
                priority_score=priority,
                category=category,
                summary_reason=f"Reported by policyholder: {text[:120]}",
                detected_hazard=hazard,
                claim={
                    "description": f"Reported by policyholder: {text[:200]}",
                    "hazard_type": hazard_type,
                    "est_payout": payout,
                    "customer_approved": False,
                },
            )
        elif stage in (None, "greet") and (harmless or _OK.search(text)):
            # "I'm okay" on the first turn: a low-priority check-in, no claim.
            out.update(priority_score=20, category="Check-in", summary_reason="Policyholder reports they are safe", detected_hazard="None")
        return out


async def run_turn(customer_id: int, text: str, stage: Optional[str]) -> dict:
    if AI_SOURCE == "stub":
        return await process_disaster_turn(customer_id, text, stage)  # type: ignore[call-arg]
    return await process_disaster_turn(customer_id, text)


app = FastAPI(title="State Farm Disaster Triage Orchestrator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SPACETIMEDB_HOST = os.getenv("SPACETIMEDB_URI", "https://maincloud.spacetimedb.com")
DB_IDENTITY = os.getenv("SPACETIMEDB_DB", "c20029daa0df66e41fc3af91cac6f9bbd41ec925bd4dc1e4f6e1ce4d89592aa2")

# Python 3.9 Compatible Model
class ChatRequest(BaseModel):
    customer_id: int
    user_transcript: str
    call_id: Optional[int] = None
    ticket_id: Optional[int] = None
    claim_id: Optional[int] = None
    # Which step of Nora's scripted call this turn answers (greet, details, safety, coverage...).
    stage: Optional[str] = None
    # True when the frontend speaks its own scripted line; then the stub reply isn't written to the transcript.
    scripted: bool = False


# ---------------------------------------------------------------------------
# SpacetimeDB SQL & Reducer Helpers
# ---------------------------------------------------------------------------

async def execute_sql(client: httpx.AsyncClient, query: str) -> List[List[Any]]:
    """Queries SpacetimeDB via the plain text HTTP SQL endpoint."""
    url = f"{SPACETIMEDB_HOST}/v1/database/{DB_IDENTITY}/sql"
    try:
        resp = await client.post(
            url,
            content=query,
            headers={"Content-Type": "text/plain"},
            timeout=3.0
        )
        if resp.status_code == 200:
            return resp.json().get("rows", [])
    except Exception as e:
        print(f"[SQL Query Error] {e}")
    return []


async def send_reducer(client: httpx.AsyncClient, reducer_name: str, args: list) -> bool:
    """Invokes a published SpacetimeDB reducer via HTTP POST."""
    url = f"{SPACETIMEDB_HOST}/v1/database/{DB_IDENTITY}/call/{reducer_name}"
    try:
        resp = await client.post(url, json=args, timeout=5.0)
        if resp.status_code != 200:
            print(f"[SpacetimeDB Error] {reducer_name} ({resp.status_code}): {resp.text}")
            return False
        return True
    except Exception as e:
        print(f"[SpacetimeDB Exception] {reducer_name}: {e}")
        return False


# ---------------------------------------------------------------------------
# Session & Entity Resolution (Python 3.9 Compatible Typing)
# ---------------------------------------------------------------------------

async def resolve_session_context(
    client: httpx.AsyncClient,
    customer_id: int,
    req_call_id: Optional[int],
    req_ticket_id: Optional[int],
    req_claim_id: Optional[int],
) -> Tuple[int, int, int, int]:
    """
    Ensures call_id, ticket_id, claim_id, and policy_id have real, distinct identities.
    Looks up existing active records for this customer, or assigns a unique ID.
    """
    # 1. Resolve call_id
    call_id = req_call_id
    if not call_id:
        rows = await execute_sql(
            client,
            f"SELECT id FROM active_calls WHERE customer_id = {customer_id} AND status != 'completed' ORDER BY id DESC LIMIT 1"
        )
        call_id = rows[0][0] if rows else int(time.time() * 1000) % 1_000_000_000

    # 2. Resolve ticket_id
    ticket_id = req_ticket_id
    if not ticket_id:
        rows = await execute_sql(
            client,
            f"SELECT ticket_id FROM triage_queue WHERE call_id = {call_id} ORDER BY ticket_id DESC LIMIT 1"
        )
        ticket_id = rows[0][0] if rows else call_id

    # 3. Resolve customer's active policy_id
    policy_rows = await execute_sql(
        client,
        f"SELECT policy_id FROM policies WHERE customer_id = {customer_id} LIMIT 1"
    )
    policy_id = policy_rows[0][0] if policy_rows else customer_id

    # 4. Resolve claim_id
    claim_id = req_claim_id
    if not claim_id:
        claim_rows = await execute_sql(
            client,
            f"SELECT id FROM claims WHERE customer_id = {customer_id} AND call_id = {call_id} ORDER BY id DESC LIMIT 1"
        )
        claim_id = claim_rows[0][0] if claim_rows else call_id

    return call_id, ticket_id, claim_id, policy_id


# ---------------------------------------------------------------------------
# Background Reducer Dispatcher
# ---------------------------------------------------------------------------

async def sync_all_reducers(
    call_id: int,
    ticket_id: int,
    claim_id: int,
    policy_id: int,
    customer_id: int,
    user_transcript: str,
    voice_reply: Optional[str],
    ai_data: dict,
):
    """Writes one turn: transcript always; triage and claim only when the turn produced them."""
    chunk = f"Customer: {user_transcript}" + (f"\nAI: {voice_reply}" if voice_reply else "")
    async with httpx.AsyncClient() as client:
        # Transcript first so the call row exists before triage/claim reference it.
        await send_reducer(client, "update_call_transcript", [call_id, customer_id, chunk])
        jobs = []
        if ai_data.get("priority_score") is not None:
            jobs.append(send_reducer(client, "update_triage_score", [
                ticket_id,
                customer_id,
                call_id,
                int(ai_data["priority_score"]),
                str(ai_data.get("category", "General Assistance")),
                str(ai_data.get("summary_reason", "Call in progress")),
                str(ai_data.get("detected_hazard", "Unknown")),
            ]))
        claim = ai_data.get("claim")
        if claim:
            jobs.append(send_reducer(client, "create_or_update_claim", [
                claim_id,
                customer_id,
                policy_id,
                call_id,
                str(claim.get("description", "")),
                str(claim.get("hazard_type", "Property damage")),
                float(claim.get("est_payout", 3500.0)),
                bool(claim.get("customer_approved", False)),
            ]))
        if jobs:
            await asyncio.gather(*jobs)


# ---------------------------------------------------------------------------
# Main Chat Endpoint
# ---------------------------------------------------------------------------

@app.post("/api/chat")
async def chat_turn(req: ChatRequest, background_tasks: BackgroundTasks):
    print(f"\n[Incoming Turn] Customer ID: {req.customer_id} | Stage: {req.stage} | Message: '{req.user_transcript}'")

    async with httpx.AsyncClient() as client:
        call_id, ticket_id, claim_id, policy_id = await resolve_session_context(
            client, req.customer_id, req.call_id, req.ticket_id, req.claim_id
        )

    ai_data = await run_turn(req.customer_id, req.user_transcript, req.stage)
    voice_reply = ai_data.get("voice_reply", "I have logged your update.")
    # A scripted frontend speaks (and logs) its own line; don't put the stub's reply in the transcript.
    logged_reply = None if (req.scripted and AI_SOURCE == "stub") else voice_reply

    background_tasks.add_task(
        sync_all_reducers, call_id, ticket_id, claim_id, policy_id, req.customer_id, req.user_transcript, logged_reply, ai_data
    )

    claim = ai_data.get("claim")
    return {
        "reply": voice_reply,
        "bot_reply": voice_reply,
        "ai_source": AI_SOURCE,
        "reply_logged": logged_reply is not None,
        "call_id": call_id,
        "ticket_id": ticket_id,
        "claim_id": claim_id,
        "priority_score": ai_data.get("priority_score"),
        "category": ai_data.get("category"),
        "summary_reason": ai_data.get("summary_reason"),
        "detected_hazard": ai_data.get("detected_hazard"),
        "claim": claim,
        "consent": bool(ai_data.get("consent", (claim or {}).get("customer_approved", False))),
        "customer_approved": bool((claim or {}).get("customer_approved", False)),
    }


# ---------------------------------------------------------------------------
# Gateway endpoints: every other database write from the frontend goes through here
# ---------------------------------------------------------------------------

class CallRef(BaseModel):
    customer_id: int
    call_id: Optional[int] = None


class TranscriptRequest(CallRef):
    speaker: str  # "Customer" | "AI" | "Agent"
    text: str


class ClaimRequest(CallRef):
    claim_id: Optional[int] = None
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
    claim_id: Optional[int] = None
    claim_number: str
    # Fields to (re)write first with customer_approved=True, since agent_approve_claim requires it.
    description: Optional[str] = None
    hazard_type: Optional[str] = None
    est_payout: Optional[float] = None


async def _session(client: httpx.AsyncClient, ref: CallRef, claim_id: Optional[int] = None) -> Tuple[int, int, int, int]:
    return await resolve_session_context(client, ref.customer_id, ref.call_id, None, claim_id)


@app.post("/api/transcript")
async def transcript_line(req: TranscriptRequest):
    """Appends one spoken line (Nora's scripted line, the agent, or a caller line outside a chat turn)."""
    speaker = req.speaker if req.speaker in ("Customer", "AI", "Agent") else "AI"
    async with httpx.AsyncClient() as client:
        call_id, *_ = await _session(client, req)
        ok = await send_reducer(client, "update_call_transcript", [call_id, req.customer_id, f"{speaker}: {req.text}"])
    return {"ok": ok, "call_id": call_id}


@app.post("/api/call/join")
async def call_join(req: CallRef):
    """Agent steps in: mutes the AI on the call and marks the triage ticket AGENT_CONNECTED."""
    async with httpx.AsyncClient() as client:
        call_id, *_ = await _session(client, req)
        ok = await send_reducer(client, "join_call_by_agent", [call_id])
    return {"ok": ok, "call_id": call_id}


@app.post("/api/call/end")
async def call_end(req: CallRef):
    """Hang up: completes the call session and resolves its triage ticket."""
    async with httpx.AsyncClient() as client:
        call_id, *_ = await _session(client, req)
        ok = await send_reducer(client, "end_call", [call_id])
    return {"ok": ok, "call_id": call_id}


@app.post("/api/claim")
async def claim_upsert(req: ClaimRequest):
    """Creates/updates the claim for the current call (customer_approved=True is verbal consent)."""
    async with httpx.AsyncClient() as client:
        call_id, _ticket, claim_id, policy_id = await _session(client, req, req.claim_id)
        ok = await send_reducer(client, "create_or_update_claim", [
            claim_id, req.customer_id, policy_id, call_id, req.description, req.hazard_type, float(req.est_payout), bool(req.customer_approved)
        ])
    return {"ok": ok, "call_id": call_id, "claim_id": claim_id}


@app.post("/api/triage")
async def triage_upsert(req: TriageRequest):
    """Updates the triage ticket for the current call (used when the frontend opens a claim itself)."""
    async with httpx.AsyncClient() as client:
        call_id, ticket_id, *_ = await _session(client, req)
        ok = await send_reducer(client, "update_triage_score", [
            ticket_id, req.customer_id, call_id, max(0, min(100, int(req.priority_score))), req.category, req.summary_reason, req.detected_hazard
        ])
    return {"ok": ok, "call_id": call_id, "ticket_id": ticket_id}


@app.post("/api/claim/approve")
async def claim_approve(req: ApproveRequest):
    """Agent approval. Makes sure consent is recorded, then submits the claim with its number."""
    async with httpx.AsyncClient() as client:
        call_id, _ticket, claim_id, policy_id = await _session(client, req, req.claim_id)
        if req.description is not None and req.hazard_type is not None and req.est_payout is not None:
            await send_reducer(client, "create_or_update_claim", [
                claim_id, req.customer_id, policy_id, call_id, req.description, req.hazard_type, float(req.est_payout), True
            ])
        ok = await send_reducer(client, "agent_approve_claim", [claim_id, req.claim_number])
    return {"ok": ok, "call_id": call_id, "claim_id": claim_id}


@app.get("/api/health")
async def health():
    return {"ok": True, "ai_source": AI_SOURCE}
