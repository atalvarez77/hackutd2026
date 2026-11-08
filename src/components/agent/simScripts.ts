import type { Line, ToolCall } from '@/types/statefarm';

/**
 * Background Nora calls for demo customers other than the one being driven from the portal.
 * The agent console streams these into the shared transcript; progress = call lines already
 * written, so a reload or a second tab doesn't replay them.
 */
export interface SimStep {
  kind: 'ai' | 'cust' | 'event' | 'claim';
  text: string;
  dot?: Line['dot'];
  tool?: string;
  risk?: number;
}

export const SIM: Record<string, { steps: SimStep[]; tools: { name: string; output: string }[] }> = {
  'cust-6': {
    steps: [
      { kind: 'ai', text: 'Hi Arthur, this is Nora from State Farm. Your thermostat alert says it’s still 94 degrees inside. How are you feeling?' },
      { kind: 'cust', text: 'Not great. The AC quit last night and I’m feeling a bit dizzy.' },
      { kind: 'event', text: 'assess_risk_and_update_score → 92 · Heat exposure risk', dot: 'red', tool: 'assess_risk_and_update_score', risk: 92 },
      { kind: 'ai', text: 'Please drink some water and sit somewhere cool, like a bathroom with the fan on. I’m sending an HVAC technician and calling your niece Brenda now.' },
      { kind: 'event', text: 'auto_file_claim → HVAC repair · $1,950 drafted', dot: 'lavender', tool: 'auto_file_claim' },
      { kind: 'claim', text: '' },
      { kind: 'cust', text: 'Thank you. Brenda lives ten minutes away.' },
      { kind: 'ai', text: 'Good. If the dizziness gets worse, call 911. I’ll stay on the line until Brenda arrives.' },
      { kind: 'event', text: 'trigger_emergency_contact → Calling Brenda Jenkins', dot: 'blue', tool: 'trigger_emergency_contact' },
    ],
    tools: [
      { name: 'assess_risk_and_update_score', output: 'risk 85 → 92 · heat exposure' },
      { name: 'auto_file_claim', output: 'HVAC repair · $1,950' },
      { name: 'trigger_emergency_contact', output: 'voice → Brenda Jenkins (niece)' },
    ],
  },
  'cust-2': {
    steps: [
      { kind: 'ai', text: 'Hi Liam, Nora from State Farm. The storm drains near you are overflowing. Is any water coming into the basement?' },
      { kind: 'cust', text: 'Yeah, there’s about an inch on the floor and it’s still coming up the drain.' },
      { kind: 'event', text: 'assess_risk_and_update_score → 84 · Basement water backup', dot: 'red', tool: 'assess_risk_and_update_score', risk: 84 },
      { kind: 'ai', text: 'Please unplug anything on the basement floor, and stay off it if outlets are near the water. I’ve drafted a water-backup claim so a mitigation crew can come tonight.' },
      { kind: 'event', text: 'auto_file_claim → Water backup · $2,200 drafted', dot: 'lavender', tool: 'auto_file_claim' },
      { kind: 'claim', text: '' },
      { kind: 'cust', text: 'Okay. My dad usually handles this stuff.' },
      { kind: 'ai', text: 'I’ll text Robert so he knows. Want me to book the crew for tonight?' },
      { kind: 'event', text: 'trigger_emergency_contact → SMS sent to Robert Carter', dot: 'blue', tool: 'trigger_emergency_contact' },
    ],
    tools: [
      { name: 'assess_risk_and_update_score', output: 'risk 78 → 84 · basement backup' },
      { name: 'auto_file_claim', output: 'water backup · $2,200' },
      { name: 'trigger_emergency_contact', output: 'SMS → Robert Carter (father)' },
    ],
  },
};

/** Tool trace derived from how far the simulated call has progressed. */
export function simTrace(custId: string, progress: number, paused: boolean): ToolCall[] {
  const s = SIM[custId];
  if (!s) return [];
  const doneTools = new Set(s.steps.slice(0, progress).filter((x) => x.tool).map((x) => x.tool));
  let runningSet = false;
  return s.tools.map((t) => {
    if (doneTools.has(t.name)) return { ...t, status: 'done' };
    if (paused) return { ...t, status: 'paused' };
    if (!runningSet) {
      runningSet = true;
      return { ...t, status: 'running' };
    }
    return { ...t, status: 'queued' };
  });
}
