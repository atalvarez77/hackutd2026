"""
Nemotron triage for one caller turn, via NVIDIA NIM (OpenAI-compatible chat completions).

Ported from the `nemotron` branch's Next.js route (same model and JSON-only prompt), reshaped
to what the orchestrator (main.py) writes to SpacetimeDB.

    process_disaster_turn(customer_id, user_transcript, stage=None, lang="en", profile=None) -> dict
        voice_reply      what Nora says (1-2 sentences, caller's language)
        priority_score   0-100, or None when this turn doesn't change triage
        category, summary_reason, detected_hazard
        claim            {description, hazard_type, est_payout, customer_approved} or None
        consent          caller agreed to submit the claim

Needs NVIDIA_API_KEY (backend/.env or the environment). Without it, ENABLED is False and the
orchestrator uses its keyword stub. Any request/parse failure raises, and the orchestrator falls
back to the stub for that turn.
"""

import json
import os
import re
from typing import Any, Dict, Optional

import httpx
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("NVIDIA_API_KEY", "").strip()
MODEL = os.getenv("NEMOTRON_MODEL", "nvidia/nemotron-3.5-super-vl-120b-a12b")
NIM_URL = os.getenv("NIM_URL", "https://integrate.api.nvidia.com/v1/chat/completions")
ENABLED = bool(API_KEY)

# What Nora must accomplish at each step of the frontend's scripted welfare call, so Nemotron's
# words keep the call moving in the same order.
STEP_GOALS = {
    "greet": (
        "This is the caller's first answer. If they report any damage or danger, be empathetic, say you've already "
        "started a claim using what State Farm has on file (no forms), and ask them to confirm it started this morning "
        "at their home address. If they're safe, reassure them and give one short safety tip for the alert."
    ),
    "details": "Thank them for confirming. Ask whether everyone is safe, and say you're texting their emergency contact.",
    "fix": "Say you've noted the correction for the adjuster, then ask whether everyone is safe.",
    "safety": "Acknowledge their safety answer. Say photos help but are optional; they can add them later or the adjuster takes them.",
    "photos": (
        "Say you checked their policy: the damage looks covered and their deductible applies, but the adjuster makes the "
        "final call. Ask if they'd like you to submit the claim now."
    ),
    "submitted": "Thank them and say goodbye; you'll check in again at 8 AM.",
    "closing": "Thank them and say goodbye; you'll check in again at 8 AM.",
    "transfer": "Reassure them a State Farm agent is joining the call and already has everything.",
}

SYSTEM = """You are Nora, State Farm's AI welfare-check assistant during a disaster or emergency (storm, flood,
wildfire, freeze, extreme heat, power outage or similar). Don't assume which kind; go by the alert and what the
caller says. Never say a claim IS covered; say it "looks covered" and the adjuster confirms.
Return ONLY a JSON object, no prose, with exactly these keys:
{
  "hazard_reported": boolean,   // the caller reported damage or danger in THIS message
  "caller_is_safe": boolean,    // the caller said they are okay / no damage
  "consent_to_submit": boolean, // the caller agreed to submit the claim
  "risk_score": number,         // 0-100 urgency for this household
  "category": string,           // short triage category, e.g. "Flood", "Fire", "Freeze / Water", "Check-in"
  "detected_hazard": string,    // short hazard label, or "None"
  "summary_reason": string,     // one line for the agent queue
  "claim_hazard_type": string,  // claim type if hazard_reported, else ""
  "estimated_loss": number,     // USD estimate if hazard_reported, else 0
  "reply": string               // what Nora says next: 1-2 short, warm sentences, plain text, no emoji
}"""


def _profile_text(profile: Optional[Dict[str, Any]]) -> str:
    if not profile:
        return "No profile available."
    keys = ["name", "age", "lives_alone", "city", "address", "alert", "policy_type", "deductible", "emergency_contact"]
    return "; ".join(f"{k}: {profile[k]}" for k in keys if profile.get(k) not in (None, ""))


async def process_disaster_turn(
    customer_id: int,
    user_transcript: str,
    stage: Optional[str] = None,
    lang: str = "en",
    profile: Optional[Dict[str, Any]] = None,
) -> dict:
    if not ENABLED:
        raise RuntimeError("NVIDIA_API_KEY is not set")

    goal = STEP_GOALS.get(stage or "", "Answer helpfully and briefly.")
    user = (
        f"Caller profile: {_profile_text(profile)}\n"
        f"Reply language: {'Spanish' if lang == 'es' else 'English'}\n"
        f"Call step: {stage or 'chat'}. Nora's goal for this reply: {goal}\n"
        f'Caller just said: "{user_transcript}"'
    )

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            NIM_URL,
            headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
            json={
                "model": MODEL,
                "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}],
                "temperature": 0.3,
                "max_tokens": 600,
            },
            timeout=20.0,
        )
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"] or ""
    match = re.search(r"\{[\s\S]*\}", content)
    if not match:
        raise ValueError(f"Nemotron returned no JSON: {content[:200]}")
    ai = json.loads(match.group(0))

    hazard = bool(ai.get("hazard_reported")) and not bool(ai.get("caller_is_safe"))
    out: Dict[str, Any] = {
        "voice_reply": str(ai.get("reply") or "").strip() or "I've noted that.",
        "consent": bool(ai.get("consent_to_submit")),
    }
    if hazard:
        out.update(
            priority_score=max(0, min(100, int(ai.get("risk_score", 80)))),
            category=str(ai.get("category") or "Property damage"),
            summary_reason=str(ai.get("summary_reason") or f"Reported: {user_transcript[:120]}"),
            detected_hazard=str(ai.get("detected_hazard") or "Reported damage"),
            claim={
                "description": f"Reported by policyholder: {user_transcript[:200]}",
                "hazard_type": str(ai.get("claim_hazard_type") or ai.get("category") or "Property damage"),
                "est_payout": float(ai.get("estimated_loss") or 3500),
                "customer_approved": False,
            },
        )
    elif stage in (None, "greet") and ai.get("caller_is_safe"):
        out.update(
            priority_score=max(0, min(100, int(ai.get("risk_score", 20)))),
            category=str(ai.get("category") or "Check-in"),
            summary_reason=str(ai.get("summary_reason") or "Policyholder reports they are safe"),
            detected_hazard="None",
        )
    return out
