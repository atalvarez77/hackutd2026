"""
Nora's conversation, decided entirely by Nemotron.

The frontend is only the phone (or chat box): it sends what the caller said or pressed, and
gets back what Nora says plus the actions to carry out. Nothing about what Nora says, or the
order the call goes in, is written anywhere else. There are no canned replies: if Nemotron
isn't configured or doesn't answer, `NoraUnavailable` is raised and the API reports it.

Reuses the NVIDIA client and model fallback list from nemotron_service.py.
"""

import json
import re
from typing import Any, Dict, List, Optional

from nemotron_service import FALLBACK_MODELS, client
import os


class NoraUnavailable(Exception):
    """Nemotron isn't configured, or no model returned a usable reply."""


def nemotron_configured() -> bool:
    return bool(os.getenv("NVIDIA_API_KEY"))


# Actions Nemotron may take. The orchestrator validates and carries them out.
ACTION_SPEC = """Available actions (include only the ones that apply to THIS turn, in order):
- {"type": "open_claim", "loss_type": str, "damage_description": str, "estimated_payout": number, "hazard": str, "risk_score": 0-100}
    Start a claim when the caller reports damage. Only once per call.
- {"type": "update_risk", "risk_score": 0-100, "hazard": str, "reason": str}
    Re-rank how urgently this household needs help (also when they are safe: low score, hazard "None").
- {"type": "confirm_details", "fields": [one or more of "type","when","where","quote","safe","shut","heat","notify"]}
    Mark claim details the caller has just confirmed: type = what happened, when = when it started,
    where = where in the home, quote = their description, safe = everyone is safe, shut = water/gas/power shut off
    or not needed, heat = home is warm/cool enough to stay, notify = they agreed you notify their emergency contact.
- {"type": "notify_emergency_contact"}  Text their emergency contact (only if they agreed or it's urgent).
- {"type": "text_caller", "text": str}   Send the caller a text (steps, numbers). Same language as the call.
- {"type": "submit_claim"}  Submit the open claim. ONLY after the caller clearly agreed to submit it.
- {"type": "transfer_to_agent", "reason": str}  Connect them to a State Farm person.
- {"type": "set_language", "language": "en" | "es"}  The caller wants to switch language.
- {"type": "end_call"}  The conversation is finished and you've said goodbye."""

RULES = """You are Nora, State Farm's AI assistant, on a {channel} with a policyholder during a disaster or
emergency. Don't assume the disaster type; go by the alert and what they tell you. You decide what to say
and what to do next, based only on what the caller says.

How to behave:
- Speak {language}. 1-3 short, warm, plain sentences per turn. One question at a time. No emoji, no markdown.
- Make sure they're safe first if anything sounds dangerous; give practical safety steps for their situation.
- If something is damaged, start a claim and fill it in by confirming details with them, using what State Farm
  already has (their address, policy) so they don't have to fill in forms.
- Talk about coverage only with the policy facts given; never say a claim IS covered, say it "looks covered"
  and that the adjuster makes the final call.
- Ask for their OK before submitting a claim or texting their emergency contact.
- They can talk to a person any time; if they ask, transfer them.
- When you submit a claim, refer to the claim number as {{CLAIM_NUMBER}}; the system fills it in.
- Don't invent facts that aren't in the profile.

Return ONLY a JSON object, nothing else:
{{"reply": str, "actions": [ ... ], "suggested_replies": [2-3 short things the caller might plausibly say next, in {language}]}}

{actions}"""


def _state_text(session: Dict[str, Any]) -> str:
    claim = session.get("claim")
    lines = [f"Policyholder profile: {json.dumps(session.get('profile') or {}, ensure_ascii=False)}"]
    if claim:
        lines.append(
            f"Open claim: {claim['loss_type']} (${claim['estimated_payout']:,.0f}); confirmed so far: "
            f"{', '.join(sorted(session['confirmed'])) or 'nothing'}; "
            f"{'SUBMITTED as ' + session['claim_number'] if session.get('claim_number') else 'not submitted yet'}."
        )
    else:
        lines.append("No claim open yet.")
    if session.get("transferred"):
        lines.append("A transfer to a person has been requested.")
    return "\n".join(lines)


def _parse(raw: str) -> Dict[str, Any]:
    clean = re.sub(r"<think>[\s\S]*?</think>", "", raw or "")
    clean = re.sub(r"```(?:json)?", "", clean).replace("```", "").strip()
    match = re.search(r"\{[\s\S]*\}", clean)
    if not match:
        raise ValueError("no JSON object in reply")
    data = json.loads(match.group(0))
    if not isinstance(data, dict) or not str(data.get("reply", "")).strip():
        raise ValueError("JSON has no reply")
    return data


async def next_turn(session: Dict[str, Any], caller_input: str) -> Dict[str, Any]:
    """
    caller_input is what the caller said, or a bracketed system event such as
    "[The call just connected. Open the call.]" or "[The caller pressed 1 on the keypad.]".
    Returns {"reply": str, "actions": list, "suggested_replies": list}.
    """
    if not nemotron_configured():
        raise NoraUnavailable("NVIDIA_API_KEY is not set")

    lang = "Spanish" if session.get("lang") == "es" else "English"
    system = RULES.format(channel="phone call" if session.get("channel") == "call" else "text chat", language=lang, actions=ACTION_SPEC)
    messages: List[Dict[str, str]] = [
        {"role": "system", "content": system},
        {"role": "system", "content": _state_text(session)},
        *session["history"],
        {"role": "user", "content": caller_input},
    ]

    last_error: Optional[Exception] = None
    for model in [m for m in FALLBACK_MODELS if m]:
        try:
            completion = await client.chat.completions.create(model=model, messages=messages, temperature=0.3, max_tokens=900)
            data = _parse(completion.choices[0].message.content or "")
            actions = [a for a in (data.get("actions") or []) if isinstance(a, dict) and a.get("type")]
            suggestions = [str(s) for s in (data.get("suggested_replies") or []) if str(s).strip()][:3]
            return {"reply": str(data["reply"]).strip(), "actions": actions, "suggested_replies": suggestions}
        except Exception as e:  # try the next model
            last_error = e
            print(f"[Nora] {model} failed: {e}")
    raise NoraUnavailable(f"no model produced a reply ({last_error})")
