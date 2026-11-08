import type { ClaimFlow, UrgencyLevel } from '@/types/statefarm';
import { TIER_DARK, TIER_LIGHT } from '@/lib/hn';

export function UrgencyChip({ tier, dark = false }: { tier: UrgencyLevel; dark?: boolean }) {
  const s = dark ? TIER_DARK[tier] : { fg: '#fff', bg: TIER_LIGHT[tier] };
  return (
    <span className="inline-block rounded-md px-2.5 py-[3px] font-bold text-[13px] whitespace-nowrap" style={{ background: s.bg, color: s.fg }}>
      {tier}
    </span>
  );
}

export function claimChipFor(c?: ClaimFlow) {
  if (!c || c.status === 'none') return { label: 'None', key: 'none' as const };
  if (c.status === 'approved') return { label: 'Approved', key: 'approved' as const };
  if (c.status === 'submitted') return { label: 'Submitted', key: 'draft' as const };
  return { label: 'Draft', key: 'draft' as const };
}

export function ClaimChip({ claim, dark = false }: { claim?: ClaimFlow; dark?: boolean }) {
  const { label, key } = claimChipFor(claim);
  const colors = dark
    ? { none: ['transparent', '#B9A6C9'], draft: ['rgba(185,166,201,.18)', '#C9B6DA'], approved: ['rgba(79,163,207,.18)', '#6FB6DC'] }
    : { none: ['transparent', '#474954'], draft: ['#7D6F86', '#fff'], approved: ['#286784', '#fff'] };
  const [bg, fg] = colors[key];
  return (
    <span className="inline-block rounded-md px-2.5 py-[3px] font-bold text-[13px] whitespace-nowrap" style={{ background: bg, color: fg }}>
      {label}
    </span>
  );
}
