"""
Nora's conversation, decided entirely by Nemotron.

The frontend is only the phone (or chat box): it sends what the caller said or pressed, and
gets back what Nora says plus the actions to carry out. Nothing about what Nora says, or the
order the call goes in, is written anywhere else. There are no canned replies: if Nemotron
isn't configured or doesn't answer, `NoraUnavailable` is raised and the API reports it.

Reuses the NVIDIA client and model fallback list from nemotron_service.py.
"""

import json
import os
import re
from typing import Any, Dict, List, Optional

from nemotron_service import FALLBACK_MODELS, client


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

Every answer you give, on every turn, is ONLY this JSON object and nothing else:
{{"reply": str, "actions": [ ... ], "suggested_replies": [2-3 short things the caller might plausibly say next, in {language}]}}

{actions}"""

JSON_REMINDER = "(Answer with only the JSON object: reply, actions, suggested_replies.)"


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


THINK_BLOCK = re.compile(r"<think>[\s\S]*?</think>")
LEADING_THINK = re.compile(r"^[\s\S]*?</think>")
FENCE = re.compile(r"```(?:json)?")
JSON_OBJECT = re.compile(r"\{[\s\S]*\}")
REPLY_FIELD = re.compile(r'"reply"\s*:\s*"((?:[^"\\]|\\.)*)"')


def _strip(raw: str) -> str:
    clean = THINK_BLOCK.sub("", raw or "")
    clean = LEADING_THINK.sub("", clean)  # reasoning block without its opening tag
    return FENCE.sub("", clean).replace("```", "").strip()


def _parse(raw: str) -> Dict[str, Any]:
    """The JSON object Nemotron returned. If it answered in plain sentences instead, those are
    still its own words: use them as the reply, with no actions."""
    clean = _strip(raw)
    match = JSON_OBJECT.search(clean)
    if match:
        try:
            data = json.loads(match.group(0))
            if isinstance(data, dict) and str(data.get("reply", "")).strip():
                return data
        except json.JSONDecodeError:
            pass
    # Truncated or invalid JSON: rescue the "reply" string if it's there.
    m = REPLY_FIELD.search(clean)
    if m:
        return {"reply": json.loads(f'"{m.group(1)}"'), "actions": [], "suggested_replies": []}
    text = clean.strip().strip('"').strip()
    if text and not text.startswith("{") and len(text) < 800:
        return {"reply": text, "actions": [], "suggested_replies": []}
    raise ValueError("no usable reply")


async def _complete(model: str, messages: List[Dict[str, str]]) -> str:
    """Ask for JSON output; if the model/endpoint rejects response_format, ask again without it."""
    try:
        completion = await client.chat.completions.create(
            model=model, messages=messages, temperature=0.3, max_tokens=900, response_format={"type": "json_object"}
        )
    except Exception as e:
        if "response_format" not in str(e) and "json" not in str(e).lower():
            raise
        completion = await client.chat.completions.create(model=model, messages=messages, temperature=0.3, max_tokens=900)
    return completion.choices[0].message.content or ""


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
        # Nemotron reasoning models: answer directly instead of emitting a long thinking block.
        {"role": "system", "content": "detailed thinking off"},
        {"role": "system", "content": system},
        {"role": "system", "content": _state_text(session)},
        # Past turns. Nora's are stored as the JSON she returned, so the model keeps that format.
        *session["history"],
        {"role": "user", "content": f"{caller_input}\n\n{JSON_REMINDER}"},
    ]

    last_error: Optional[Exception] = None
    for model in [m for m in FALLBACK_MODELS if m]:
        raw = ""
        try:
            raw = await _complete(model, messages)
            data = _parse(raw)
            actions = [a for a in (data.get("actions") or []) if isinstance(a, dict) and a.get("type")]
            suggestions = [str(x) for x in (data.get("suggested_replies") or []) if str(x).strip()][:3]
            return {"reply": str(data["reply"]).strip(), "actions": actions, "suggested_replies": suggestions}
        except Exception as e:  # try the next model
            last_error = e
            print(f"[Nora] {model} failed: {e}" + (f" | raw output: {raw[:300]!r}" if raw else ""))
    raise NoraUnavailable(f"no model produced a reply ({last_error})")
