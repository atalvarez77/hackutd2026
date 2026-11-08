'use client';

import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import type { DbStatus } from '@/lib/spacetime';

export type AgentView = 'queue' | 'map' | 'drafts';

export function AgentNav({
  view,
  onView,
  draftCount,
  lastSync,
  dbStatus,
  customers,
  actingAs,
  onActingAs,
  onReset,
}: {
  view: AgentView;
  onView: (v: AgentView) => void;
  draftCount: number;
  lastSync: number;
  dbStatus: DbStatus;
  customers: { id: string; name: string }[];
  actingAs: string;
  onActingAs: (id: string) => void;
  onReset: () => void;
}) {
  const tabs: [AgentView, string][] = [
    ['queue', 'Priority queue'],
    ['map', 'Map'],
    ['drafts', 'Drafts'],
  ];

  return (
    <header className="flex-none bg-void border-b border-white/[.08] text-white">
      <div className="px-6 h-16 flex items-center gap-5">
        <Link href="/agent" className="flex items-center gap-2 no-underline flex-none">
          <Logo mode="agent" size={30} textSize={24} />
          <span className="font-mono text-[12px] text-mist px-1.5 py-0.5 border border-white/[.14] rounded-[5px]">CONSOLE</span>
        </Link>
        <nav className="flex gap-1">
          {tabs.map(([k, label]) => (
            <button
              key={k}
              onClick={() => onView(k)}
              className="h-[38px] px-3.5 rounded-lg font-bold text-[15px] cursor-pointer flex items-center gap-2 whitespace-nowrap"
              style={{ background: view === k ? '#1C1C21' : 'transparent', color: view === k ? '#fff' : '#B9A6C9' }}
            >
              {label}
              {k === 'drafts' && draftCount > 0 && (
                <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-neon-lavender text-void font-mono font-bold text-[12px] flex items-center justify-center">{draftCount}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="flex-1" />
        <span
          className="flex items-center gap-2 font-mono text-[12px] whitespace-nowrap"
          style={{ color: dbStatus === 'live' ? '#6FB6DC' : '#B9A6C9' }}
          title={dbStatus === 'live' ? 'Live on SpacetimeDB maincloud' : 'SpacetimeDB unreachable · syncing across local tabs only'}
        >
          {/* Re-keyed on every sync so the 1.5s red flash animation restarts. */}
          <span key={lastSync} className="w-2 h-2 rounded-full inline-block bg-neon-blue" style={{ animation: lastSync ? 'hnSync 1.5s ease-out' : undefined, boxShadow: '0 0 8px #6FB6DC' }} />
          {dbStatus === 'live' ? 'SYNC · SpacetimeDB' : dbStatus === 'connecting' ? 'SYNC · connecting…' : 'SYNC · local tabs'}
        </span>
        <label className="flex items-center gap-2 whitespace-nowrap">
          <span className="hn-label text-[11px] text-mist">Acting as</span>
          <select value={actingAs} onChange={(e) => onActingAs(e.target.value)} className="h-[38px] px-2.5 rounded-[9px] border border-white/[.14] bg-[#18181B] text-white font-semibold text-sm">
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button onClick={onReset} className="h-[38px] px-3.5 rounded-[9px] border border-white/[.14] bg-transparent text-white font-bold text-sm cursor-pointer whitespace-nowrap">
          Reset
        </button>
        <span title="Jordan Mills · CAT Response" className="w-[38px] h-[38px] rounded-full bg-neon-red text-white flex items-center justify-center font-display font-black text-[15px] flex-none">
          JM
        </span>
      </div>
    </header>
  );
}
