import os
import time
import asyncio
from typing import Optional, List, Dict, Any
import httpx
from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from nemotron_service import process_disaster_turn

load_dotenv()

app = FastAPI(title="State Farm Disaster Triage Orchestrator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SPACETIMEDB_HOST = os.getenv("SPACETIMEDB_URI", "https://maincloud.spacetimedb.com")
DB_IDENTITY = os.getenv("SPACETIMEDB_DB", "c20029daa0df66e41fc3af91cac6f9bbd41ec925bd4dc1e4f6e1ce4d89592aa2")

class ChatRequest(BaseModel):
    customer_id: int
    user_transcript: str
    call_id: Optional[int] = None
    ticket_id: Optional[int] = None
    claim_id: Optional[int] = None
    language: Optional[str] = "en"
    transcript_history: Optional[List[Dict[str, Any]]] = None

async def send_reducer(client: httpx.AsyncClient, reducer_name: str, args: list) -> bool:
    url = f"{SPACETIMEDB_HOST}/v1/database/{DB_IDENTITY}/call/{reducer_name}"
    try:
        resp = await client.post(url, json=args, timeout=5.0)
        return resp.status_code == 200
    except Exception as e:
        print(f"[SpacetimeDB Error] {reducer_name}: {e}")
        return False

async def sync_reducers_to_spacetimedb(
    call_id: int,
    ticket_id: int,
    claim_id: int,
    customer_id: int,
    user_transcript: str,
    clean_voice_reply: str,
    ai_data: dict,
    customer_approved: bool
):
    triage = ai_data.get("triage", {})
    claim = triage.get("claim_summary") or {}
    file_claim = triage.get("file_claim", False)
    reasons = triage.get("top_reasons", [])
    summary_reason = "; ".join(reasons) if reasons else "Active check-in"
    category = claim.get("loss_type", "Emergency Weather Damage")

    async with httpx.AsyncClient() as client:
        await asyncio.gather(
            # Append only clean text to live_transcript (no JSON artifacts)
            send_reducer(client, "update_call_transcript", [
                call_id,
                customer_id,
                f"Customer: {user_transcript}\nNora (AI): {clean_voice_reply}"
            ]),
            send_reducer(client, "update_triage_score", [
                ticket_id,
                customer_id,
                call_id,
                int(triage.get("risk_score", 85)),
                str(category),
                str(summary_reason),
                str(triage.get("agent_action", "Dispatch emergency restoration team"))
            ]),
            send_reducer(client, "create_or_update_claim", [
                claim_id,
                customer_id,
                customer_id, # policy_id
                call_id,
                str(claim.get("damage_description", user_transcript)),
                str(claim.get("loss_type", "Emergency Weather Damage")),
                float(claim.get("estimated_initial_payout", 3000.0) if file_claim else 0.0),
                customer_approved
            ]),
        )

@app.post("/api/chat")
async def chat_turn(req: ChatRequest, background_tasks: BackgroundTasks):
    call_id = req.call_id or int(time.time() * 1000) % 1_000_000_000
    ticket_id = req.ticket_id or call_id
    claim_id = req.claim_id or call_id

    # 1. Run Nemotron inference with regex-resilient extraction
    ai_data = await process_disaster_turn(
        customer_id=req.customer_id,
        message=req.user_transcript,
        transcript=req.transcript_history,
        lang=req.language or "en"
    )

    clean_voice_reply = ai_data.get("reply", "I am logging your report right now.")

    # 2. Verbal Consent Check (must verbally agree to submit)
    consent_words = ["yes", "yeah", "si", "sí", "please", "file", "approve", "go ahead", "confirmo"]
    verbal_consent = any(w in req.user_transcript.lower() for w in consent_words)
    file_claim = ai_data.get("triage", {}).get("file_claim", False)
    customer_approved = bool(file_claim and verbal_consent)

    # 3. Fire SpacetimeDB cloud mutations concurrently
    background_tasks.add_task(
        sync_reducers_to_spacetimedb,
        call_id,
        ticket_id,
        claim_id,
        req.customer_id,
        req.user_transcript,
        clean_voice_reply,
        ai_data,
        customer_approved
    )

    # 4. Return clean strings to frontend
    return {
        "reply": clean_voice_reply,
        "bot_reply": clean_voice_reply,
        "call_id": call_id,
        "ticket_id": ticket_id,
        "claim_id": claim_id,
        "priority_score": ai_data.get("triage", {}).get("risk_score", 85),
        "customer_approved": customer_approved,
        "triage": ai_data.get("triage"),
    }