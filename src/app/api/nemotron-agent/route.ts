import { NextResponse } from 'next/server';
import { FREEZE_RE, hazardFor, reportsHazard } from '@/lib/hn';
import type { CustomerProfile } from '@/types/statefarm';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { customerId, message, language, customerProfile } = body;
    const apiKey = process.env.NVIDIA_API_KEY;

    if (!apiKey) {
      // Intelligent fallback if API key is not active
      return NextResponse.json({
        success: true,
        riskScore: 88,
        urgency: 'High',
        detectedHazard: message.length > 5 ? message : 'Active Weather Hazard Reported',
        explainability: {
          bulletPoints: [
            `Policyholder reported: "${message}" during active ${customerProfile?.weatherAlert?.title || 'Weather Advisory'}.`,
            'Dynamic assessment by NVIDIA Nemotron flagged high vulnerability and immediate property risk.',
          ],
          recommendedActions: [
            'Dispatch emergency preferred contractor within 2 hours.',
            'Notify emergency contact immediately.',
          ],
        },
        claimDraft: {
          hazardType: 'Catastrophe Mitigation Emergency',
          estimatedLoss: 3200,
          description: `Extracted from live chat: "${message}"`,
        },
        reply: language === 'es'
          ? '⚠️ State Farm AI: He registrado su reporte. Nemotron ha actualizado su nivel de riesgo y preparado un reclamo automático para su agente.'
          : '⚠️ State Farm AI: I have logged your report. Nemotron has assessed your live risk score and prepared an automated claim draft for agent triage.',
      });
    }

    // Call NVIDIA NIM OpenAI-compatible endpoint with structured JSON prompt instruction
    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
        messages: [
          {
            role: 'system',
            content: `You are State Farm Good Neighbor Catastrophe Triage AI. Analyze the policyholder's message and current weather alert. 
Return ONLY a valid JSON object with this exact structure:
{
  "riskScore": number (0 to 100),
  "urgency": "High" | "Medium" | "Low",
  "detectedHazard": "string describing hazard",
  "explainabilityBulletPoints": ["bullet 1", "bullet 2"],
  "recommendedActions": ["action 1", "action 2"],
  "claimHazardType": "string",
  "estimatedLoss": number,
  "reply": "Conversational empathetic response to the policyholder in their preferred language (${language})"
}`,
          },
          {
            role: 'user',
            content: `Policyholder: ${customerProfile?.name}, Age: ${customerProfile?.age}, Weather Alert: ${customerProfile?.weatherAlert?.title} - ${customerProfile?.weatherAlert?.description}. Message: "${message}"`,
          },
        ],
        temperature: 0.3,
        max_tokens: 800,
      }),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Try parsing JSON from Nemotron output
    let parsedAI;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedAI = JSON.parse(jsonMatch[0]);
      }
/**
 * POST { customerId, message, lang, customer } → { reply, toolCalls: [{ name, args, output }] }
 *
 * With NVIDIA_API_KEY set, this calls Nemotron through NVIDIA NIM (OpenAI-compatible) with
 * three tools. Without a key, or if the call fails, it falls back to a keyword simulation so
 * the demo always works.
 */

const NIM_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MODEL = process.env.NEMOTRON_MODEL || 'nvidia/llama-3.3-nemotron-super-49b-v1';

interface Body {
  customerId: string;
  message: string;
  lang: 'en' | 'es';
  customer?: { name: string; age: number; livesAlone: boolean; hazard: string; risk: number; contact: string };
}
interface ToolCallOut {
  name: string;
  args: Record<string, unknown>;
  output: string;
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'assess_risk_and_update_score',
      description: 'Re-score the policyholder’s risk (0-100) when they report a hazard.',
      parameters: { type: 'object', properties: { detectedHazard: { type: 'string' }, newRisk: { type: 'number' } }, required: ['detectedHazard', 'newRisk'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'auto_file_claim',
      description: 'Draft a claim from information State Farm already has. Never promise coverage.',
      parameters: { type: 'object', properties: { claimType: { type: 'string' }, estimatedLoss: { type: 'number' } }, required: ['claimType', 'estimatedLoss'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'trigger_emergency_contact',
      description: 'Text the policyholder’s emergency contact.',
      parameters: { type: 'object', properties: { contactName: { type: 'string' } }, required: ['contactName'] },
    },
  },
];

function outputFor(name: string, args: Record<string, unknown>, b: Body): string {
  if (name === 'assess_risk_and_update_score') return `risk ${b.customer?.risk ?? '?'} → ${args.newRisk ?? '?'} · ${args.detectedHazard ?? 'hazard'}`;
  if (name === 'auto_file_claim') return `DRF-99 · ${args.claimType ?? 'claim'} · $${Number(args.estimatedLoss ?? 3500).toLocaleString()}`;
  return `SMS → ${args.contactName ?? b.customer?.contact ?? 'emergency contact'}`;
}

function simulate(b: Body) {
  const es = b.lang === 'es';
  const hazard = reportsHazard(b.message);
  if (!hazard) {
    return {
      reply: es
        ? 'Qué bueno. Si algo cambia, escríbame aquí o llámenos cuando quiera. Le escribo de nuevo en la mañana.'
        : 'Glad to hear it. If anything changes, message me here or call us any time. I’ll check in again in the morning.',
      toolCalls: [] as ToolCallOut[],
    };
  }
  const freeze = FREEZE_RE.test(b.message);
  // Classify the report (fire, flood, tree, roof/wind, outage, heat, freeze) from what was said.
  const kind = hazardFor({ detectedHazard: b.customer?.hazard || 'None', claimDraft: { hazardType: 'None', estimatedLoss: 2500 } } as unknown as CustomerProfile, b.message);
  const risk = Math.min(98, (b.customer?.risk ?? 85) + 10);
  const calls: ToolCallOut[] = [
    { name: 'assess_risk_and_update_score', args: { detectedHazard: kind.hazard, newRisk: risk } },
    { name: 'auto_file_claim', args: { claimType: kind.type, estimatedLoss: kind.amount } },
    { name: 'trigger_emergency_contact', args: { contactName: b.customer?.contact } },
  ].map((c) => ({ ...c, output: outputFor(c.name, c.args, b) }));
  return {
    reply: freeze
      ? es
        ? 'Parece una tubería congelada. No la descongele con fuego. Ya inicié un reclamo por daño de agua, así que no tiene que llenar formularios. Un agente lo está revisando.'
        : 'That sounds like a frozen pipe. Please don’t thaw it with an open flame. I’ve started a water-damage claim for you, so you won’t need to fill in any forms. An agent is reviewing it now.'
      : es
        ? 'Siento mucho lo que pasó. Por favor manténgase lejos de cualquier peligro. Ya inicié un reclamo, así que no tiene que llenar formularios. Un agente lo está revisando.'
        : 'I’m sorry that happened. Please stay away from anything unsafe. I’ve started a claim for you, so you won’t need to fill in any forms. An agent is reviewing it now.',
    toolCalls: calls,
  };
}

async function nemotron(b: Body, key: string) {
  const c = b.customer;
  const system = [
    'You are Nora, State Farm’s AI welfare-check assistant during a disaster or emergency (storm, flood, wildfire, freeze, extreme heat, power outage, or similar). Do not assume which kind; go by the alert and what the policyholder says.',
    `Reply in ${b.lang === 'es' ? 'natural Spanish' : 'English'} in 1–3 short, warm, practical sentences. No emoji.`,
    'Never say a claim IS covered; say it "looks covered" and the adjuster confirms.',
    'If the policyholder reports damage or a hazard, call assess_risk_and_update_score, then auto_file_claim, then trigger_emergency_contact.',
    c ? `Policyholder: ${c.name}, ${c.age}, ${c.livesAlone ? 'lives alone' : 'not alone'}, current risk ${c.risk}, known hazard "${c.hazard}", emergency contact ${c.contact}.` : '',
  ].join(' ');

  const res = await fetch(NIM_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      max_tokens: 400,
      tools: TOOLS,
      tool_choice: 'auto',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: b.message },
      ],
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`NIM ${res.status}`);
  const data = await res.json();
  const m = data.choices?.[0]?.message ?? {};
  const toolCalls: ToolCallOut[] = (m.tool_calls ?? []).map((tc: { function: { name: string; arguments: string } }) => {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.function.arguments || '{}');
    } catch {}
    return { name: tc.function.name, args, output: outputFor(tc.function.name, args, b) };
  });
  // Some models return only tool calls on the first turn; use the simulated wording then.
  const reply = (m.content as string | undefined)?.replace(/<think>[\s\S]*?<\/think>/g, '').trim() || simulate(b).reply;
  return { reply, toolCalls };
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const key = process.env.NVIDIA_API_KEY;
  if (key) {
    try {
      return NextResponse.json({ ...(await nemotron(body, key)), model: MODEL, source: 'nim' });
    } catch (e) {
      console.error('Failed to parse JSON from Nemotron:', content);
    }

    if (!parsedAI) {
      parsedAI = {
        riskScore: 85,
        urgency: 'High',
        detectedHazard: message,
        explainabilityBulletPoints: [
          `Live report received: "${message}"`,
          `Weather alert context: ${customerProfile?.weatherAlert?.title}`,
        ],
        recommendedActions: ['Dispatch emergency response team.', 'Notify emergency contact.'],
        claimHazardType: 'Emergency Weather Mitigation',
        estimatedLoss: 3000,
        reply: content || 'State Farm AI has analyzed your report and notified your agent.',
      };
    }

    return NextResponse.json({
      success: true,
      ...parsedAI,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to communicate with NVIDIA NIM API' }, { status: 500 });
  }
}



