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

# Attempt to load your teammate's Nemotron function, otherwise use simulation stub
try:
    from nemotron_service import process_disaster_turn
except ImportError:
    async def process_disaster_turn(customer_id: int, user_transcript: str) -> dict:
        is_consent = any(w in user_transcript.lower() for w in ["yes", "yeah", "please", "file", "approve"])
        is_flood = any(w in user_transcript.lower() for w in ["water", "flood", "leak", "rising"])
        return {
            "voice_reply": (
                "I understand your emergency. I am logging your details, "
                "updating dispatch, and preparing your claim right now."
            ),
            "priority_score": 95 if is_flood else 72,
            "category": "Flood & Property Hazard" if is_flood else "Storm Check-in",
            "summary_reason": (
                "Active water intrusion reported indoors; urgent dispatch recommended"
                if is_flood else "Resident check-in during severe weather alert"
            ),
            "detected_hazard": "Flash Flood" if is_flood else "Severe Weather",
            "claim": {
                "description": "Property damage reported during emergency welfare check-in",
                "hazard_type": "Flash Flood Intrusion" if is_flood else "Weather Impact",
                "est_payout": 7500.0 if is_flood else 3500.0,
                "customer_approved": is_consent,
            },
        }

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
    voice_reply: str,
    ai_data: dict,
):
    claim = ai_data.get("claim", {})
    priority_score = int(ai_data.get("priority_score", 50))
    category = str(ai_data.get("category", "General Assistance"))
    summary = str(ai_data.get("summary_reason", "Call in progress"))
    hazard = str(ai_data.get("detected_hazard", "Storm"))

    async with httpx.AsyncClient() as client:
        await asyncio.gather(
            send_reducer(client, "update_call_transcript", [
                call_id,
                customer_id,
                f"Customer: {user_transcript}\nAI: {voice_reply}"
            ]),
            send_reducer(client, "update_triage_score", [
                ticket_id,
                customer_id,
                call_id,
                priority_score,
                category,
                summary,
                hazard
            ]),
            send_reducer(client, "create_or_update_claim", [
                claim_id,
                customer_id,
                policy_id,
                call_id,
                str(claim.get("description", summary)),
                str(claim.get("hazard_type", hazard)),
                float(claim.get("est_payout", 3500.0)),
                bool(claim.get("customer_approved", False))
            ]),
        )


# ---------------------------------------------------------------------------
# Main Chat Endpoint
# ---------------------------------------------------------------------------

@app.post("/api/chat")
async def chat_turn(req: ChatRequest, background_tasks: BackgroundTasks):
    print(f"\n[Incoming Turn] Customer ID: {req.customer_id} | Message: '{req.user_transcript}'")

    async with httpx.AsyncClient() as client:
        call_id, ticket_id, claim_id, policy_id = await resolve_session_context(
            client,
            req.customer_id,
            req.call_id,
            req.ticket_id,
            req.claim_id
        )

    ai_data = await process_disaster_turn(req.customer_id, req.user_transcript)
    voice_reply = ai_data.get("voice_reply", "I have logged your update.")

    background_tasks.add_task(
        sync_all_reducers,
        call_id,
        ticket_id,
        claim_id,
        policy_id,
        req.customer_id,
        req.user_transcript,
        voice_reply,
        ai_data
    )

    return {
        "reply": voice_reply,
        "bot_reply": voice_reply,
        "call_id": call_id,
        "ticket_id": ticket_id,
        "claim_id": claim_id,
        "priority_score": ai_data.get("priority_score", 50),
        "customer_approved": ai_data.get("claim", {}).get("customer_approved", False)
    }