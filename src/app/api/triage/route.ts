import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
});

export async function POST(request: Request) {
  let lang = 'en';
  try {
    const body = await request.json();
    const { customerProfile, message, transcript } = body;
    const apiKey = process.env.NVIDIA_API_KEY;
    lang = customerProfile?.language || 'en';

    const systemPrompt = `You are the Dual-Phase Agentic State Farm Emergency Response Orchestrator powered by NVIDIA Nemotron.
You must return STRICTLY a valid JSON object matching this exact schema:
{
  "reply": "Natural conversational response to the user. Answer their questions, provide safety advice, or show empathy in their language (${lang}). NEVER show raw JSON or debug scores here.",
  "triage": {
    "risk_score": number, // Calculated 0-100 based strictly on cumulative conversation history and risk rubric
    "top_reasons": ["List of short reasons extracted only from user words"],
    "agent_action": "Actionable next step for human agent",
    "file_claim": boolean, // true ONLY if customer describes actual property damage or covered loss
    "claim_summary": {
      "loss_type": string,
      "damage_description": string,
      "estimated_initial_payout": number
    } // or null if file_claim is false
  }
}`;

    if (!apiKey) {
      const lower = message.toLowerCase();
      const isUrgent = lower.match(/oxygen|freeze|burst|flood|roof|medical|hospital|danger|cold|water|pipe|caved|deep|gushing/i);
      const isChat = lower.match(/wyd|hello|hi|hey|what's up/i) && !isUrgent;
      const score = isChat ? 15 : isUrgent ? 88 : 45;

      return NextResponse.json({
        reply: isChat
          ? (lang === 'es'
              ? "¡Hola! Soy su asistente de State Farm Good Neighbor, aquí para ayudarle con cualquier emergencia durante la tormenta. ¿Cómo se encuentra y cómo está su hogar?"
              : "Hello! I'm your State Farm Good Neighbor assistant, here to support you through the ongoing winter storm emergency. Are you and your home safe right now?")
          : (lang === 'es'
              ? "Lamento mucho que esté pasando por esto. Primero, manténgase a salvo lejos de cualquier peligro. Ya hemos priorizado su caso y estamos coordinando asistencia inmediata."
              : "I am so sorry you're dealing with that. First, please stay safe away from any hazards. We are prioritizing your case right now and are coordinating immediate assistance."),
        triage: {
          risk_score: score,
          top_reasons: [
            `Policyholder statement: "${message}"`,
            isUrgent ? 'Active property damage or safety hazard identified.' : 'General inquiry or routine check-in.',
          ],
          agent_action: isUrgent ? 'Dispatch emergency restoration team and verify policyholder safety.' : 'No immediate intervention required.',
          file_claim: !!isUrgent,
          claim_summary: isUrgent ? {
            loss_type: 'Catastrophe Emergency Repair',
            damage_description: message,
            estimated_initial_payout: 3200,
          } : null,
        },
      });
    }

    // Build messages ensuring we NEVER start with an assistant message
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt }
    ];

    const mappedHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    if (Array.isArray(transcript)) {
      for (const t of transcript) {
        if (t.sender === 'customer' || t.sender === 'user') {
          mappedHistory.push({ role: 'user', content: t.text });
        } else if (t.sender === 'bot' || t.sender === 'agent' || t.sender === 'assistant') {
          mappedHistory.push({ role: 'assistant', content: JSON.stringify({ reply: t.text }) });
        }
      }
    }

    // Ensure first message after system is never assistant
    if (mappedHistory.length > 0 && mappedHistory[0].role === 'assistant') {
      mappedHistory.unshift({ role: 'user', content: 'Start check-in' });
    }

    // Ensure the current user message is appended if not already the last message
    if (mappedHistory.length === 0 || mappedHistory[mappedHistory.length - 1].content !== message) {
      mappedHistory.push({ role: 'user', content: message });
    }

    messages.push(...mappedHistory);

    const models = [
      process.env.NVIDIA_MODEL,
      'nvidia/llama-3.3-nemotron-super-49b-v1',
      'nvidia/llama-3.1-nemotron-70b-instruct',
      'meta/llama-3.3-70b-instruct',
      'nvidia/nemotron-3.5-super-vl-120b-a12b',
    ].filter(Boolean) as string[];

    let completion: any = null;
    let lastError: any = null;

    for (const modelName of models) {
      try {
        completion = await client.chat.completions.create({
          model: modelName,
          messages,
          temperature: 0.3,
          max_tokens: 1000,
        });
        if (completion) break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!completion) {
      throw lastError || new Error('All NVIDIA NIM models failed to complete.');
    }

    let content = completion.choices?.[0]?.message?.content || '';
    if (!content && (completion.choices?.[0]?.message as any)?.reasoning_content) {
      content = (completion.choices?.[0]?.message as any).reasoning_content;
    }

    let parsed;
    try {
      const cleanContent = content.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```json/g, '').replace(/```/g, '').trim();
      const match = cleanContent.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        parsed = JSON.parse(cleanContent);
      }
    } catch (e) {
      const rawReply = content.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```json/g, '').replace(/```/g, '').trim() || (lang === 'es'
        ? 'Estoy con usted en esto. Cuénteme más sobre su situación para ayudarle a estar seguro.'
        : 'I am right here with you. Please tell me more about how you and your home are holding up.');
      
      const isUrgent = /freeze|burst|flood|pipe|leak|danger|cold|water|roof|oxygen|medical|hospital/i.test(message + ' ' + rawReply);
      parsed = {
        reply: rawReply,
        triage: {
          risk_score: isUrgent ? 80 : 25,
          top_reasons: [message],
          agent_action: isUrgent ? 'Dispatch emergency restoration team and verify safety.' : 'Review policyholder message and coordinate support.',
          file_claim: isUrgent,
          claim_summary: isUrgent ? {
            loss_type: 'Emergency Weather Damage',
            damage_description: message,
            estimated_initial_payout: 3000,
          } : null,
        },
      };
    }

    if (!parsed || !parsed.reply) {
      const rawReply = content.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```json/g, '').replace(/```/g, '').trim() || (lang === 'es'
        ? 'Le escucho atentamente. ¿Cómo podemos ayudarle hoy con su hogar?'
        : 'I am listening closely. How can we best support you and your home right now?');

      parsed = {
        reply: rawReply,
        triage: {
          risk_score: 30,
          top_reasons: [message],
          agent_action: 'Review message.',
          file_claim: false,
          claim_summary: null,
        },
      };
    }

    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error('🚨 [DEVELOPER ERROR - NVIDIA NIM INFERENCE FAILED]', err?.message || err);
    return NextResponse.json(
      { error: 'NVIDIA NIM inference failed', details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
