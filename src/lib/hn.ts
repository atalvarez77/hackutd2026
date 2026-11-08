import type { CustomerProfile, UrgencyLevel } from '@/types/statefarm';

/** Hazard keywords (EN + ES). Kept as the offline fallback when Nemotron is unavailable. */
/** Frozen-pipe reports specifically (gets freeze-specific advice). */
export const FREEZE_RE = /freez|froze|frozen|pipe|cold|helad|congel|tuber/i;
/** Any reported damage or danger, for every disaster type (EN/ES). */
export const HAZARD_RE =
  /freez|froze|pipe|cold|helad|congel|tuber|damage|broke|flood|water|leak|roof|tree|branch|fire|smoke|burn|hail|wind|shingle|power|outage|\bgas\b|mold|crack|collaps|heat|\bhot\b|\bac\b|a\/c|daño|dañad|inund|agua|gotera|techo|árbol|arbol|rama|fuego|humo|quem|granizo|viento|tejas|apag|sin luz|roto|rota|calor|aire acondicionado/i;
/** "No damage", "nothing's wrong", "todo bien"... so a reassurance isn't filed as a claim. */
const NO_HARM_RE = /\b(no|without|zero)\s+(damage|problems?|issues?)\b|nothing('?s| is)?\s+(wrong|damaged|broken)|\ball good\b|sin (daños?|problemas?)|no hay (daños?|problemas?)|todo bien/i;
/** True when a reply reports damage or danger of any kind. */
export const reportsHazard = (text: string) => HAZARD_RE.test(text) && !NO_HARM_RE.test(text);

/** Rough disaster category for a free-text report. Order matters: most specific first. */
const KINDS: { re: RegExp; hazard: string; type: string; amount: number }[] = [
  { re: FREEZE_RE, hazard: 'Freezing Pipes Hazard', type: 'Water damage: frozen pipe', amount: 3500 },
  { re: /fire|smoke|burn|fuego|humo|quem/i, hazard: 'Fire or smoke damage', type: 'Fire / smoke damage', amount: 8000 },
  { re: /flood|water|leak|backup|basement|inund|agua|gotera|sótano|sotano/i, hazard: 'Water or flood damage', type: 'Water damage', amount: 4500 },
  { re: /tree|branch|árbol|arbol|rama/i, hazard: 'Fallen tree or branch', type: 'Fallen tree damage', amount: 4000 },
  { re: /roof|hail|wind|shingle|techo|granizo|viento|tejas/i, hazard: 'Roof or wind damage', type: 'Roof / wind damage', amount: 3800 },
  { re: /power|outage|no power|apag|sin luz/i, hazard: 'Power outage', type: 'Power outage / spoilage', amount: 800 },
  { re: /heat|\bhot\b|\bac\b|a\/c|calor|aire acondicionado/i, hazard: 'Extreme heat · cooling failure', type: 'Equipment breakdown', amount: 1200 },
];
export const PERSON_RE = /person|persona|human|agent|agente|someone|alguien|transfer/i;
export const OK_RE = /\b(okay|ok|fine|good|safe|bien|todo bien|estoy bien)\b/i;
export const YES_RE = /\b(yes|yeah|yep|correct|right|sure|submit|do it|s[ií]|claro|correcto|env[ií]e|adelante)\b/i;
export const NO_RE = /\b(no|not yet|todav[ií]a no|wait|espere)\b/i;

export const first = (name: string) => name.split(/[ &]/)[0];
export const initials = (name: string) =>
  name
    .split(/[ &]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');

/** Deterministic short hex id from a string, e.g. "a41f 0c9e". */
export function hexId(seed: string, groups = 2) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const out: string[] = [];
  for (let g = 0; g < groups; g++) {
    h = Math.imul(h ^ (h >>> 13), 2246822507);
    out.push(((h >>> 0) & 0xffff).toString(16).padStart(4, '0'));
  }
  return out.join(' ');
}

export const money = (n: number) => '$' + n.toLocaleString('en-US');

export function nowTime() {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export const TIER_RANK: Record<UrgencyLevel, number> = { High: 0, Medium: 1, Low: 2 };

/** Light (policyholder) and dark (agent) colors per tier. */
export const TIER_LIGHT: Record<UrgencyLevel, string> = { High: '#ED1D24', Medium: '#7D6F86', Low: '#286784' };
export const TIER_DARK: Record<UrgencyLevel, { fg: string; bg: string }> = {
  // Calm palette: only High gets color; Medium/Low are neutral.
  High: { fg: '#EF8E87', bg: 'rgba(239,142,135,.14)' },
  Medium: { fg: '#E4E6EA', bg: 'rgba(255,255,255,.07)' },
  Low: { fg: '#B3B7BF', bg: 'transparent' },
};

/** Extra policy facts the designs need that aren't in mockCustomers.ts. */
export const WATER_BACKUP: Record<string, 'Covered' | 'Not covered'> = {
  'cust-1': 'Covered',
  'cust-2': 'Covered',
  'cust-3': 'Covered',
  'cust-4': 'Covered',
  'cust-5': 'Not covered',
  'cust-6': 'Covered',
};

/** Map pin positions for the demo customers (DFW). */
export const COORDS: Record<string, [number, number]> = {
  'cust-1': [32.787, -96.799],
  'cust-2': [32.755, -97.33],
  'cust-3': [32.736, -97.108],
  'cust-4': [33.02, -96.699],
  'cust-5': [32.81, -96.77],
  'cust-6': [32.948, -96.73],
};

export const isWaterHazard = (h: string) => /pipe|water|flood|backup|seep|tuber|agua|leak/i.test(h);

/** Hazard + claim type a customer's call/chat report maps to. */
export function hazardFor(c: CustomerProfile, reported?: string) {
  // What the person actually said wins over what we predicted for them.
  const k = reported && reportsHazard(reported) ? KINDS.find((x) => x.re.test(reported)) : undefined;
  if (k) return { hazard: k.hazard, type: k.type, amount: k.amount };
  const h = c.detectedHazard && c.detectedHazard !== 'None' ? c.detectedHazard : 'Reported property damage';
  return {
    hazard: h,
    type: c.claimDraft.hazardType && c.claimDraft.hazardType !== 'None' ? c.claimDraft.hazardType : 'Property damage',
    amount: c.claimDraft.estimatedLoss || 2500,
  };
}

export function coverageVerdict(c: CustomerProfile, hazard: string) {
  const water = isWaterHazard(hazard);
  const covered = !(water && WATER_BACKUP[c.id] === 'Not covered');
  return { covered, water };
}

/** Quote of what the customer last said (for "In your words"). */
export function lastCustomerQuote(c: CustomerProfile) {
  const m = [...c.chatTranscript].reverse().find((x) => x.sender === 'customer');
  return m ? `“${m.text}”` : '—';
}

/** Demo number for Nora's line (fictional 555 number). */
export const NORA_PHONE = '(800) 555-0142';
