import { NextResponse } from 'next/server';

/**
 * POST { customerId, message, lang, customer } → { reply, toolCalls: [{ name, args, output }] }
 *
 * With NVIDIA_API_KEY set, this calls Nemotron through NVIDIA NIM (OpenAI-compatible) with
 * three tools. Without a key, or if the call fails, it falls back to a keyword simulation so
 * the demo always works.
 */

const NIM_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MODEL = process.env.NEMOTRON_MODEL || 'nvidia/llama-3.3-nemotron-super-49b-v1';
const HAZARD_RE = /freez|froze|pipe|cold|agua|helad|congel|tuber|flood|leak|roof|branch|tree|heat|ac\b|power|luz/i;

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
  const hazard = HAZARD_RE.test(b.message);
  if (!hazard) {
    return {
      reply: es
        ? 'Qué bueno. Deje gotear las llaves esta noche y abra los gabinetes del fregadero. Le escribo de nuevo en la mañana.'
        : 'Glad to hear it. Let faucets drip tonight and open the cabinets under your sinks. I’ll check in again in the morning.',
      toolCalls: [] as ToolCallOut[],
    };
  }
  const freeze = /freez|froze|pipe|cold|agua|helad|congel|tuber/i.test(b.message);
  const risk = Math.min(98, (b.customer?.risk ?? 85) + 10);
  const calls: ToolCallOut[] = [
    { name: 'assess_risk_and_update_score', args: { detectedHazard: freeze ? 'Freezing Pipes Hazard' : b.customer?.hazard, newRisk: risk } },
    { name: 'auto_file_claim', args: { claimType: freeze ? 'Water damage: frozen pipe' : 'Storm damage', estimatedLoss: 3500 } },
    { name: 'trigger_emergency_contact', args: { contactName: b.customer?.contact } },
  ].map((c) => ({ ...c, output: outputFor(c.name, c.args, b) }));
  return {
    reply: es
      ? 'Parece una tubería congelada. No la descongele con fuego. Ya inicié un reclamo por daño de agua, así que no tiene que llenar formularios. Un agente lo está revisando.'
      : 'That sounds like a frozen pipe. Please don’t thaw it with an open flame. I’ve started a water-damage claim for you, so you won’t need to fill in any forms. An agent is reviewing it now.',
    toolCalls: calls,
  };
}

async function nemotron(b: Body, key: string) {
  const c = b.customer;
  const system = [
    'You are Nora, State Farm’s AI welfare-check assistant during a winter storm.',
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
      console.warn('[nemotron-agent] falling back to simulation:', e);
    }
  }
  return NextResponse.json({ ...simulate(body), model: MODEL, source: 'simulated' });
}
