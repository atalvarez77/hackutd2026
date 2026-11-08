'use client';

import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import type { DbStatus } from '@/lib/spacetime';

export type AgentView = 'queue' | 'map' | 'drafts';

export function AgentNav({
  view,
  onView,
  draftCount,
  catOn,
  onCat,
  demoOn,
  onDemo,
  onHelp,
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
  catOn: boolean;
  onCat: () => void;
  demoOn: boolean;
  onDemo: () => void;
  onHelp: () => void;
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
          <span className="text-[13px] text-mist">Agent console</span>
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
                <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-white/[.12] text-ink font-mono font-bold text-[12px] flex items-center justify-center">{draftCount}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="flex-1" />
        <button onClick={onHelp} title="Keyboard shortcuts (?)" className="h-[38px] w-[38px] rounded-[9px] border border-white/[.14] bg-transparent text-mist text-sm cursor-pointer">
          ?
        </button>
        <button onClick={onDemo} className="h-[38px] px-3.5 rounded-[9px] border border-white/[.14] bg-transparent text-white text-sm cursor-pointer whitespace-nowrap">
          {demoOn ? 'Stop demo' : 'Run demo'}
        </button>
        <button
          onClick={onCat}
          className="h-[38px] px-3.5 rounded-[9px] font-semibold text-sm cursor-pointer whitespace-nowrap border"
          style={catOn ? { background: 'transparent', borderColor: 'rgba(255,107,115,.5)', color: '#FF6B73' } : { background: '#ED1D24', borderColor: '#ED1D24', color: '#fff' }}
        >
          {catOn ? 'End catastrophe mode' : 'Activate catastrophe mode'}
        </button>
        <span
          className="flex items-center gap-2 text-[13px] whitespace-nowrap"
          style={{ color: '#B9A6C9' }}
          title={dbStatus === 'live' ? 'Live on SpacetimeDB maincloud' : 'SpacetimeDB unreachable · syncing across local tabs only'}
        >
          <span data-sync={lastSync} className="w-2 h-2 rounded-full inline-block" style={{ background: dbStatus === 'live' ? '#8FC3DD' : '#6E6878' }} />
          {dbStatus === 'live' ? 'Synced · SpacetimeDB' : dbStatus === 'connecting' ? 'Connecting…' : 'Synced · this browser'}
        </span>
        <label className="flex items-center gap-2 whitespace-nowrap">
          <span className="text-[13px] text-mist">Portal user</span>
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
        <span title="Jordan Mills · CAT Response" className="w-[38px] h-[38px] rounded-full bg-panel-2 border border-white/[.14] text-white flex items-center justify-center font-display font-black text-[15px] flex-none">
          JM
        </span>
      </div>
    </header>
  );
}
