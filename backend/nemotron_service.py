import os
import re
import json
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()

client = AsyncOpenAI(
    base_url=os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1"),
    # Placeholder when unset so importing this module never crashes the server; calls are
    # skipped without a real key (conversation.nemotron_configured()).
    api_key=os.getenv("NVIDIA_API_KEY") or "not-set",
)

FALLBACK_MODELS = [
    os.getenv("NVIDIA_MODEL"),
    "nvidia/llama-3.3-nemotron-super-49b-v1",
    "nvidia/llama-3.1-nemotron-70b-instruct",
    "meta/llama-3.3-70b-instruct",
    "nvidia/nemotron-3.5-super-vl-120b-a12b",
]

def extract_nemotron_fields(raw_text: str, default_message: str, lang: str = "en") -> dict:
    """
    Intelligently extracts speech and triage fields from Nemotron,
    even if markdown fences exist or the JSON was truncated mid-generation.
    """
    # 1. Strip <think> tags and markdown backticks
    clean = re.sub(r"<think>[\s\S]*?<\/think>", "", raw_text)
    clean = re.sub(r"```(?:json)?", "", clean).replace("```", "").strip()

    # 2. Try standard JSON parse if complete
    try:
        match = re.search(r"\{[\s\S]*\}", clean)
        if match:
            parsed = json.loads(match.group(0))
            if parsed.get("reply"):
                return parsed
    except Exception:
        pass

    # 3. Resilient Regex Extraction (rescues truncated or unclosed JSON)
    extracted_reply = None
    reply_match = re.search(r'"reply"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)', clean)
    if reply_match:
        extracted_reply = reply_match.group(1).encode('utf-8').decode('unicode_escape', 'ignore')

    # Extract risk score (e.g., 90)
    extracted_score = None
    score_match = re.search(r'"risk_score"\s*:\s*(\d+)', clean)
    if score_match:
        extracted_score = int(score_match.group(1))

    # Extract agent action
    extracted_action = None
    action_match = re.search(r'"agent_action"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)', clean)
    if action_match:
        extracted_action = action_match.group(1).encode('utf-8').decode('unicode_escape', 'ignore')

    # Extract reasons
    extracted_reasons = []
    reasons_match = re.search(r'"top_reasons"\s*:\s*\[(.*?)\]', clean, re.DOTALL)
    if reasons_match:
        extracted_reasons = [
            r.strip().strip('"\'') 
            for r in reasons_match.group(1).split(',') 
            if r.strip().strip('"\'')
        ]

    # Check damage keywords
    is_damage = bool(re.search(r"freeze|burst|flood|pipe|leak|danger|cold|water|roof|caved", default_message, re.I))

    # If regex rescued the spoken reply, build the structured dictionary
    if extracted_reply:
        return {
            "reply": extracted_reply,
            "triage": {
                "risk_score": extracted_score or (90 if is_damage else 30),
                "top_reasons": extracted_reasons or [default_message],
                "agent_action": extracted_action or "Dispatch emergency restoration team and verify safety.",
                "file_claim": is_damage,
                "claim_summary": {
                    "loss_type": "Emergency Weather Damage",
                    "damage_description": default_message,
                    "estimated_initial_payout": 3000.0,
                } if is_damage else None
            }
        }

    # Safe fallback if completely unparseable
    return {
        "reply": (
            "Lamento mucho lo que está sucediendo. Manténgase a salvo lejos del agua. He notificado a su agente."
            if lang == "es" else
            "I'm so sorry this is happening. Please prioritize your safety and avoid electrical hazards. I have alerted our team."
        ),
        "triage": {
            "risk_score": 85 if is_damage else 25,
            "top_reasons": [default_message],
            "agent_action": "Dispatch emergency response team.",
            "file_claim": is_damage,
            "claim_summary": {
                "loss_type": "Emergency Weather Damage",
                "damage_description": default_message,
                "estimated_initial_payout": 3000.0,
            } if is_damage else None
        }
    }

async def process_disaster_turn(customer_id: int, message: str, transcript: list = None, lang: str = "en") -> dict:
    api_key = os.getenv("NVIDIA_API_KEY")
    if not api_key:
        return extract_nemotron_fields("", message, lang)

    system_prompt = (
        "You are the Dual-Phase Agentic State Farm Emergency Response Orchestrator powered by NVIDIA Nemotron.\n"
        "You must return STRICTLY a valid JSON object matching this schema:\n"
        "{\n"
        f'  "reply": "Empathetic conversational response in {lang}. Max 2-3 sentences. Never include raw JSON or score tags here.",\n'
        '  "triage": {\n'
        '    "risk_score": number (0 to 100),\n'
        '    "top_reasons": ["reason 1", "reason 2"],\n'
        '    "agent_action": "Action for human agent",\n'
        '    "file_claim": boolean,\n'
        '    "claim_summary": {\n'
        '      "loss_type": "Emergency Weather Damage",\n'
        '      "damage_description": "summary",\n'
        '      "estimated_initial_payout": 3000.0\n'
        '    }\n'
        '  }\n'
        '}'
    )

    messages = [{"role": "system", "content": system_prompt}]

    if transcript and isinstance(transcript, list):
        for t in transcript:
            sender = t.get("sender")
            text = t.get("text", "")
            if sender in ["customer", "user"]:
                messages.append({"role": "user", "content": text})
            elif sender in ["bot", "agent", "assistant"]:
                messages.append({"role": "assistant", "content": text})

    messages.append({"role": "user", "content": message})

    active_models = [m for m in FALLBACK_MODELS if m]
    content = ""

    for model_name in active_models:
        try:
            completion = await client.chat.completions.create(
                model=model_name,
                messages=messages,
                temperature=0.2,
                max_tokens=1200,  # Increased from 800 to prevent truncated output
            )
            if completion:
                content = completion.choices[0].message.content or ""
                break
        except Exception as e:
            print(f"[Nemotron Model Fallback] {model_name} failed: {e}")

    return extract_nemotron_fields(content, message, lang)