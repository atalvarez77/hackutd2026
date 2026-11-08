import os
import requests
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="State Farm Disaster Triage Orchestrator")

# Allow Next.js frontend to communicate with FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SPACETIMEDB_HOST = os.getenv("SPACETIMEDB_URI", "https://maincloud.spacetimedb.com")
DB_IDENTITY = os.getenv("SPACETIMEDB_DB", "c20029daa0df66e41fc3af91cac6f9bbd41ec925bd4dc1e4f6e1ce4d89592aa2")

class ChatRequest(BaseModel):
    customer_id: int
    user_transcript: str

def call_spacetimedb_reducer(reducer_name: str, args: list) -> bool:
    """Invokes a published SpacetimeDB reducer via the HTTP API"""
    url = f"{SPACETIMEDB_HOST}/v1/database/{DB_IDENTITY}/call/{reducer_name}"
    try:
        resp = requests.post(url, json=args, timeout=5)
        if resp.status_code != 200:
            print(f"[SpacetimeDB Error] {reducer_name} failed ({resp.status_code}): {resp.text}")
            return False
        return True
    except Exception as e:
        print(f"[SpacetimeDB Exception] {reducer_name}: {e}")
        return False

@app.post("/api/chat")
async def chat_turn(req: ChatRequest):
    print(f"\n[Incoming Turn] Customer ID: {req.customer_id} | Transcript: '{req.user_transcript}'")

    # 1. Append caller chunk to live transcript
    call_spacetimedb_reducer("update_call_transcript", [
        req.customer_id,
        req.customer_id,
        f"\nCustomer: {req.user_transcript}"
    ])

    # 2. STUBBED NEMOTRON RESPONSE (Teammate replaces this block with NVIDIA NIM call)
    ai_spoken_reply = (
        "Mrs. Martinez, I understand water is rising inside your living room. "
        "I am alerting priority dispatch and drafting your flood claim right now."
    )
    triage_score = 95
    triage_category = "Flood & Vulnerable Resident"
    triage_summary = "Water rising indoors; resident lives alone with mobility challenges"
    detected_hazard = "Flash Flood"
    estimated_payout = 7500.0
    customer_verbal_consent = True

    # 3. Update Triage Score in SpacetimeDB (re-sorts agent dashboard)
    call_spacetimedb_reducer("update_triage_score", [
        req.customer_id,   # ticket_id
        req.customer_id,   # customer_id
        triage_score,      # priority_score (0-100)
        triage_category,
        triage_summary,
        detected_hazard
    ])

    # 4. Generate/Update Draft Claim in SpacetimeDB
    call_spacetimedb_reducer("create_or_update_claim", [
        req.customer_id,          # claim_id
        req.customer_id,          # customer_id
        req.customer_id,          # policy_id
        triage_summary,           # description
        detected_hazard,          # hazard_type
        estimated_payout,         # est_payout
        customer_verbal_consent   # customer_approved
    ])

    # 5. Append AI reply to live transcript in SpacetimeDB
    call_spacetimedb_reducer("update_call_transcript", [
        req.customer_id,
        req.customer_id,
        f"\nAI Agent: {ai_spoken_reply}"
    ])

    return {
        "bot_reply": ai_spoken_reply,
        "triage_score": triage_score
    }