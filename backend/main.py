import os
import asyncio
import httpx
from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Import Nemotron service function
# (e.g. from nemotron_service import process_disaster_turn)
try:
    from nemotron_service import process_disaster_turn
except ImportError:
    # Safe stub fallback
    async def process_disaster_turn(customer_id: int, user_transcript: str) -> dict:
        return {
            "voice_reply": "I understand and am logging your situation for immediate review.",
            "priority_score": 92,
            "category": "Flood Hazard",
            "summary_reason": "Water intrusion reported during check-in",
            "detected_hazard": "Flash Flood",
            "claim": {
                "description": "Ground floor water damage reported during call",
                "hazard_type": "Flash Flood Intrusion",
                "est_payout": 5000.0,
                "customer_approved": False,
            },
        }

load_dotenv()

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

class ChatRequest(BaseModel):
    customer_id: int
    user_transcript: str

# ---------------------------------------------------------------------------
# Asynchronous SpacetimeDB Reducer Calls (Concurrent & Non-Blocking)
# ---------------------------------------------------------------------------
async def send_reducer(client: httpx.AsyncClient, reducer_name: str, args: list) -> bool:
    """Posts directly to SpacetimeDB's HTTP reducer endpoint."""
    url = f"{SPACETIMEDB_HOST}/v1/database/{DB_IDENTITY}/call/{reducer_name}"
    try:
        resp = await client.post(url, json=args, timeout=5.0)
        return resp.status_code == 200
    except Exception as e:
        print(f"[SpacetimeDB Exception] {reducer_name}: {e}")
        return False

async def sync_to_spacetimedb(customer_id: int, user_text: str, voice_reply: str, ai_data: dict):
    """
    Fires all reducers in parallel over an async HTTP connection.
    Runs inside BackgroundTasks so the caller hears speech without waiting for DB writes.
    """
    claim = ai_data.get("claim", {})
    
    async with httpx.AsyncClient() as client:
        await asyncio.gather(
            # 1. Append customer and bot lines to the active call transcript
            send_reducer(client, "update_call_transcript", [
                customer_id,
                customer_id,
                f"Customer: {user_text}\nAI: {voice_reply}"
            ]),

            # 2. Update triage score, category, and explainability summary
            send_reducer(client, "update_triage_score", [
                customer_id,
                customer_id,
                int(ai_data.get("priority_score", 50)),
                str(ai_data.get("category", "General")),
                str(ai_data.get("summary_reason", "Call in progress")),
                str(ai_data.get("detected_hazard", "Storm Alert"))
            ]),

            # 3. Create or update the draft claim
            send_reducer(client, "create_or_update_claim", [
                customer_id,
                customer_id,
                customer_id,
                str(claim.get("description", "Disaster damage reported")),
                str(claim.get("hazard_type", ai_data.get("detected_hazard", "Emergency"))),
                float(claim.get("est_payout", 3500.0)),
                bool(claim.get("customer_approved", False))
            ]),
        )

# ---------------------------------------------------------------------------
# API Route
# ---------------------------------------------------------------------------
@app.post("/api/chat")
async def chat_turn(req: ChatRequest, background_tasks: BackgroundTasks):
    print(f"\n[Incoming Turn] Customer ID: {req.customer_id} | Transcript: '{req.user_transcript}'")

    # 1. Delegate thinking & prompt engineering directly to Nemotron logic
    ai_data = await process_disaster_turn(req.customer_id, req.user_transcript)
    voice_reply = ai_data.get("voice_reply", "I have logged your update.")

    # 2. Schedule SpacetimeDB updates to fire in background
    background_tasks.add_task(
        sync_to_spacetimedb,
        req.customer_id,
        req.user_transcript,
        voice_reply,
        ai_data
    )

    # 3. Return immediately to the frontend so speech synthesis starts with zero DB latency
    return {
        "reply": voice_reply,
        "bot_reply": voice_reply,
        "priority_score": ai_data.get("priority_score", 50),
        "customer_approved": ai_data.get("claim", {}).get("customer_approved", False)
    }