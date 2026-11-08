'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useStore } from '@/context/StateFarmContext';
import { AgentNav, type AgentView } from '@/components/ui/AgentNav';
import { ToolTrace } from '@/components/ui/ToolTrace';
import { RiskFactor } from '@/components/ui/RiskFactor';
import { StreamText } from '@/components/ui/StreamText';
import { ClaimChip } from '@/components/ui/Chips';
import { LIVE_FEED_ENABLED, LiveNoraFeed } from '@/components/agent/LiveNoraFeed';
import { ClaimEditor } from '@/components/agent/ClaimEditor';
import type { Line } from '@/types/statefarm';
import { first, initials, money, TIER_DARK, TIER_RANK, WATER_BACKUP } from '@/lib/hn';
import { claimFields } from '@/lib/claim';
import type { CustomerProfile, UrgencyLevel } from '@/types/statefarm';

const TriageMap = dynamic(() => import('@/components/agent/TriageMap'), { ssr: false });


const ROW_H = 72;
const GRID = 'minmax(0,1.1fr) 96px minmax(0,1.1fr) 150px minmax(0,1.5fr)';
// Events in the transcript: one accent for things that need attention, neutral otherwise.
const DOT = { red: '#EF8E87', lavender: '#A7ABB3', blue: '#A8C4D6' } as const;

function Dot({ color }: { color: string }) {
  return <span className="inline-block w-2 h-2 rounded-full flex-none" style={{ background: color }} />;
}

export default function AgentConsolePage() {
  const store = useStore();
  const { customers, claims, transcripts, toolRuns, contactRequests, agentTakeover, priorityOverride, callStatus, activeCustomerId, hydrated } = store;
  const [sel, setSel] = useState(activeCustomerId);
  const [view, setView] = useState<AgentView>('queue');
  const [filter, setFilter] = useState<'All' | 'High' | 'Drafts'>('All');
  const [panelOpen, setPanelOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  /** Which policyholder's claim is open in the editor (null = none). */
  const [editingFor, setEditingFor] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  // Once saved state loads, start on whoever the portal is showing.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (hydrated) setSel(activeCustomerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // A customer belongs in the live queue only if they have an active call,
  // an active triage risk score (> 0), or incoming transcript lines
  const tier = (c: CustomerProfile): UrgencyLevel => priorityOverride[c.id] || c.urgency;
  const activeQueueCustomers = useMemo(() => {
    return customers.filter((x) => {
      const hasActiveCall = callStatus[x.id] === 'ai' || callStatus[x.id] === 'agent';
      const hasScore = (x.riskScore || 0) > 0;
      const hasTranscript = (transcripts[x.id] || []).length > 0;
      const hasContactReq = contactRequests.some((r) => r.custId === x.id && r.status !== 'closed');
      return hasActiveCall || hasScore || hasTranscript || hasContactReq;
    });
  }, [customers, callStatus, transcripts, contactRequests]);

  const sorted = useMemo(
    () => [...activeQueueCustomers].sort((a, b) => TIER_RANK[tier(a)] - TIER_RANK[tier(b)] || b.riskScore - a.riskScore),
    [activeQueueCustomers, priorityOverride],
  );
  const isDraft = (id: string) => claims[id]?.status === 'draft' || claims[id]?.status === 'submitted';
  const vis = sorted.filter((c) => (filter === 'All' ? true : filter === 'High' ? tier(c) === 'High' : isDraft(c.id)));

  /* ---- Selected policyholder ---- */
  const c = customers.find((x) => x.id === sel) || customers[0];  
  const claim = claims[c.id];
  const takeover = !!agentTakeover[c.id];
  const cs = callStatus[c.id] || 'idle';
  const live = cs === 'ai' || cs === 'agent';
  const lines = transcripts[c.id] || [];
  // What Nora actually did on this call (actions chosen by Nemotron via FastAPI).
  const runs = toolRuns[c.id] || [];

  // Only lines that arrive after a policyholder is opened get the typing animation.
  const [seen, setSeen] = useState<{ id: string; ids: Set<string> }>(() => ({ id: c.id, ids: new Set(lines.map((l) => l.id)) }));
  if (seen.id !== c.id) setSeen({ id: c.id, ids: new Set(lines.map((l) => l.id)) });
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines.length, c.id]);

  const showToast = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2200);
  };

  const approveFor = (id: string) => {
    const num = store.approveClaimDraft(id);
    if (!num) return;
    showToast(`${num} approved and dispatched`);
  };
  const approve = () => approveFor(c.id);

  // Claims Nora drafted (or the policyholder submitted) that still need a person to approve them.
  const needsApproval = sorted
    .filter((x) => {
      const cl = claims[x.id];
      if (!cl) return false;
      return cl.status === 'submitted' || (cl.status === 'draft' && (transcripts[x.id] || []).some((l) => l.kind === 'claim'));
    })
    .sort((a, b) => Number(claims[b.id].status === 'submitted') - Number(claims[a.id].status === 'submitted'));
  /** Claim details the policyholder has / hasn't confirmed (for the agent: where Nora isn't sure yet). */
  const detailsOf = (x: CustomerProfile) => {
    const cl = claims[x.id];
    const all = cl ? claimFields(x, cl, 'en').flat() : [];
    return { all, unconfirmed: all.filter((f) => !cl?.confirmed[f.key]) };
  };

  /** Latest thing that happened for this person, for the queue row. */
  const lastChange = (id: string) => {
    const ls = transcripts[id] || [];
    for (let i = ls.length - 1; i >= 0; i--) {
      const l = ls[i];
      if (l.kind === 'handoff' || l.kind === 'claim') continue;
      const who = l.kind === 'ai' ? 'Nora: ' : l.kind === 'agent' ? 'You: ' : l.kind === 'cust' ? first(customers.find((x) => x.id === id)?.name || '') + ': ' : '';
      return `${l.time} · ${who}${l.tr || l.text}`;
    }
    return '';
  };

  /* ---- Keyboard: J/K move, S step in, A approve, M map, Q queue, ? help ---- */
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  const onKey = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const i = vis.findIndex((x) => x.id === sel);
    if (k === 'j' || k === 'arrowdown') {
      const n = vis[Math.min(vis.length - 1, i + 1)];
      if (n) setSel(n.id);
    } else if (k === 'k' || k === 'arrowup') {
      const n = vis[Math.max(0, i - 1)];
      if (n) setSel(n.id);
    } else if (k === 's') {
      if (!agentTakeover[sel]) {
        if (!(callStatus[sel] === 'ai' || callStatus[sel] === 'agent')) store.setCallStatus(sel, 'agent');
        store.stepIn(sel);
      }
    } else if (k === 'a') {
      const num = store.approveClaimDraft(sel);
      if (num) showToast(`${num} approved and dispatched`);
    } else if (k === 'm') setView('map');
    else if (k === 'q') setView('queue');
    else if (k === 'd') setPanelOpen((o) => !o);
    else if (k === '?') setHelp((h) => !h);
    else if (k === 'escape') {
      setHelp(false);
      setPanelOpen(false);
    } else return;
    e.preventDefault();
  };
  // Keep the listener's handler current without re-subscribing.
  useLayoutEffect(() => {
    keyRef.current = onKey;
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const callText = (x: CustomerProfile): [string, string, boolean] => {
    const rq = contactRequests.find((r) => r.custId === x.id && r.status === 'waiting');
    if (rq) return ['Wants a person', '#EF8E87', true];
    const s = callStatus[x.id];
    if (agentTakeover[x.id] && s !== 'ended') return ['You’re on the call', '#F3F4F6', true];
    if (claims[x.id]?.status === 'approved') return ['Crew dispatched', '#B3B7BF', false];
    if (s === 'ai') return ['Nora on call', '#F3F4F6', true];
    if (s === 'ringing') return ['Dialing…', '#B3B7BF', false];
    if (s === 'ended') return ['Call ended', '#A7ABB3', false];
    if (x.checkInStatus === 'completed') return ['Checked in · OK', '#B3B7BF', false];
    if (x.checkInStatus === 'urgent_attention') return ['Needs follow-up', '#F3F4F6', false];
    if (x.checkInStatus === 'in_progress') return ['SMS check-in', '#B3B7BF', false];
    return ['Not reached', '#A7ABB3', false];
  };

  const claimText = (id: string) => {
    const cl = claims[id];
    if (!cl || cl.status === 'none') return null;
    if (cl.status === 'approved') return 'Claim approved';
    if (cl.status === 'submitted') return 'Claim submitted · needs your approval';
    return 'Claim draft';
  };

  const waitingReqs = contactRequests.filter((r) => r.status !== 'closed');
  const counts = {
    All: activeQueueCustomers.length,
    High: activeQueueCustomers.filter((x) => tier(x) === 'High').length,
    Drafts: activeQueueCustomers.filter((x) => isDraft(x.id)).length,
  };

  const factorWhy = [
    `${c.detectedHazard} · ${c.weatherAlert.description}`,
    `${c.age} yrs · ${c.livesAlone ? 'lives alone' : 'not alone'}${c.language === 'es' ? ' · Spanish-preferred' : ''}`,
    `${c.policy.type} · ${money(c.policy.coverageLimit)} dwelling · water backup ${WATER_BACKUP[c.id]?.toLowerCase()}`,
    c.claimsHistory.length ? `${c.claimsHistory.length} prior claim · ${c.claimsHistory[0].type}` : 'No prior claims',
  ];
  const ex = c.explainability;

  return (
    <>
      <AgentNav
        view={view}
        onView={(v) => {
          setView(v);
          setFilter(v === 'drafts' ? 'Drafts' : 'All');
        }}
        draftCount={counts.Drafts}
        onHelp={() => setHelp(true)}
        lastSync={store.lastSync}
        dbStatus={store.dbStatus}
        apiStatus={store.apiStatus}
        nemotron={store.nemotron}
        customers={customers}
        actingAs={activeCustomerId}
        onActingAs={(id) => {
          store.setActiveCustomerId(id);
          setSel(id);
        }}
        onReset={() => {
          store.resetToDefaults();
          showToast('Demo data restored');
        }}
      />

      {/* Request strip */}
      {waitingReqs.length > 0 && (
        <div className="flex-none flex gap-3 items-center px-6 py-2.5 bg-panel border-b border-white/[.14] overflow-x-auto">
          <span className="flex items-center gap-2 text-[14px] font-semibold whitespace-nowrap">
            <Dot color="#EF8E87" />
            Asked for a person
          </span>
          {waitingReqs.map((r) => {
            const rc = customers.find((x) => x.id === r.custId);
            const acc = r.status === 'accepted';
            return (
              <div key={r.id} className="flex-none flex items-center gap-3 pl-3.5 pr-2 py-1.5 rounded-xl bg-panel-2 border border-white/[.14] hn-in">
                <div className="flex flex-col leading-tight whitespace-nowrap">
                  <span className="font-bold text-[15px]">
                    {rc?.name} · {r.fromCall ? 'transfer from Nora' : 'callback'}
                  </span>
                  <span className="text-[13px] text-mist">
                    {r.topic} · {r.lang.toUpperCase()} · <span className="font-mono">{r.id}</span>
                  </span>
                </div>
                <button
                  onClick={() => {
                    setSel(r.custId);
                    setView('queue');
                    if (!acc) store.acceptContactRequest(r.id);
                  }}
                  className="h-[38px] px-3.5 rounded-full text-white font-bold text-sm cursor-pointer whitespace-nowrap"
                  style={acc ? { background: '#2A2D33', color: '#F3F4F6' } : { background: '#F3F4F6', color: '#0E0E10' }}
                >
                  {acc ? 'Open' : 'Accept'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex-1 min-h-0 flex relative">
        {/* Queue / map */}
        <section className="flex-1 min-w-0 flex flex-col">
          {view === 'map' ? (
            <TriageMap
              customers={customers}
              tierOf={tier}
              selectedId={c.id}
              callLabel={(x) => callText(x)[0]}
              onSelect={(id) => {
                setSel(id);
                // Picking someone on the map also switches the portal to them (same as "Portal user").
                store.setActiveCustomerId(id);
              }}
              onOpen={(id) => {
                setSel(id);
                setView('queue');
              }}
            />
          ) : (
            <>
              {needsApproval.length > 0 && (
                <section aria-labelledby="needs-approval" className="px-5 pt-4">
                  <div className="flex items-baseline gap-2 pb-2">
                    <h2 id="needs-approval" className="m-0 text-[17px] font-semibold">
                      Needs approval
                    </h2>
                    <span className="text-[14px] text-mist">
                      {needsApproval.length} claim{needsApproval.length === 1 ? '' : 's'} waiting for a person
                    </span>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {needsApproval.map((x) => {
                      const cl = claims[x.id];
                      const d = detailsOf(x);
                      return (
                        <div key={x.id} className="flex-none w-[300px] rounded-xl bg-panel-2 border border-white/[.14] p-3.5 flex flex-col gap-1.5">
                          <div className="flex items-baseline gap-2">
                            <span className="flex-1 min-w-0 font-semibold text-[16px] truncate">{x.name}</span>
                            <span className="font-mono text-[15px]">{money(cl.amount)}</span>
                          </div>
                          <div className="text-[14px] text-mist truncate">
                            {cl.type} · {cl.status === 'submitted' ? 'policyholder agreed' : 'not submitted yet'}
                          </div>
                          <div className="text-[13px]" style={{ color: d.unconfirmed.length ? '#DDBB72' : '#A8C4D6' }}>
                            {d.all.length - d.unconfirmed.length} of {d.all.length} details confirmed
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => {
                                setSel(x.id);
                                setPanelOpen(true);
                              }}
                              className="flex-1 h-10 rounded-lg border border-white/[.14] bg-transparent text-ink text-[14px] font-semibold cursor-pointer"
                            >
                              Review
                            </button>
                            <button onClick={() => approveFor(x.id)} className="flex-1 h-10 rounded-lg bg-ink text-void hover:bg-white text-[14px] font-semibold cursor-pointer">
                              Approve
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
              <div className="flex items-center gap-3 px-5 pt-[18px] pb-3.5">
                <div className="font-semibold text-[22px] leading-none">Priority queue</div>
                <div className="text-mist text-[15px] whitespace-nowrap">
                  {counts.High} high · {Object.values(callStatus).filter((v) => v === 'ai').length} on calls with Nora · sorted by urgency, then risk
                </div>
                <div className="flex-1" />
                <div className="flex gap-0.5 p-[3px] rounded-[9px] bg-panel-2 border border-white/[.14]">
                  {(['All', 'High', 'Drafts'] as const).map((k) => (
                    <button
                      key={k}
                      onClick={() => setFilter(k)}
                      className="h-[32px] px-2.5 rounded-md text-[15px] cursor-pointer flex items-center gap-1.5"
                      style={{ background: filter === k ? '#2A2D33' : 'transparent', color: filter === k ? '#F3F4F6' : '#C5C9D0' }}
                    >
                      {k}
                      <span className="font-mono text-sm opacity-60">{counts[k]}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 pl-[23px] pr-5 pb-2 text-[13px] text-[#A7ABB3] border-b border-white/[.14]" style={{ gridTemplateColumns: GRID }}>
                <div>Policyholder</div>
                <div>Priority</div>
                <div>Situation</div>
                <div>Call</div>
                <div>Latest</div>
              </div>
              <div className="flex-1 overflow-auto">
                {vis.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-mist text-[15px]">
                    <div className="w-12 h-12 rounded-full bg-panel-2 border border-white/[.14] flex items-center justify-center mb-3 text-lg">
                      🎧
                    </div>
                    <span>No active calls in triage queue</span>
                    <span className="text-xs text-[#A7ABB3] mt-1">Calls will automatically appear here in real time when initiated.</span>
                  </div>
                ) : (
                  <div className="relative" style={{ height: vis.length * ROW_H }}>
                    {customers.map((x) => {
                      const r = vis.indexOf(x);
                      if (r < 0) return null; // Don't render invisible rows
                      const isSel = x.id === sel;
                      const t = tier(x);
                      const [st, stc, pulse] = callText(x);
                      return (
                        <div
                          key={x.id}
                          onClick={() => setSel(x.id)}
                          className="absolute left-0 right-0 grid gap-4 items-center pl-5 pr-5 cursor-pointer border-b border-white/[.06] hover:bg-white/[.03]"
                          style={{
                            top: r * ROW_H,
                            height: ROW_H,
                            gridTemplateColumns: GRID,
                            background: isSel ? 'rgba(255,255,255,.05)' : 'transparent',
                            borderLeft: `3px solid ${isSel ? '#F3F4F6' : 'transparent'}`,
                            transition: 'top .6s ease',
                          }}
                        >
                          <div className="min-w-0 flex flex-col gap-0.5">
                            <div className="font-semibold text-[16px] truncate">{x.name}</div>
                            <div className="text-[13px] text-[#A7ABB3] truncate">
                              {x.age} · {x.livesAlone ? 'lives alone' : 'with family'}
                              {x.language === 'es' ? ' · Spanish' : ''}
                            </div>
                          </div>
                          <div className="flex items-baseline gap-2">
                            <span className="font-semibold text-[15px]" style={{ color: TIER_DARK[t].fg }}>
                              {t}
                            </span>
                            <span className="font-mono text-[14px] text-[#A7ABB3]">{x.riskScore}</span>
                            {priorityOverride[x.id] && <span title="Set manually" className="text-[11px] text-[#A7ABB3]">· set</span>}
                          </div>
                          <div className="min-w-0 flex flex-col gap-0.5">
                            <div className="text-[15px] text-[#E4E6EA] truncate">{x.detectedHazard}</div>
                            {claimText(x.id) && (
                              <div className="text-[13px] truncate" style={{ color: claims[x.id]?.status === 'submitted' ? '#F3F4F6' : '#A7ABB3' }}>
                                {claimText(x.id)}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[14px] whitespace-nowrap overflow-hidden" style={{ color: stc }}>
                            {pulse && <Dot color={stc === '#EF8E87' ? stc : '#A8C4D6'} />}
                            {st}
                          </div>
                          <div className="min-w-0 text-[13px] text-[#A7ABB3] truncate" title={lastChange(x.id)}>
                            {lastChange(x.id)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {/* Transcript panel */}
        <section className="w-[440px] flex-none flex flex-col border-l border-white/[.14] bg-panel">
          <div className="px-[18px] pt-4 pb-3.5 flex items-center gap-3 border-b border-white/[.14]">
            <div className="w-12 h-12 rounded-full bg-panel-2 border border-white/[.14] flex items-center justify-center font-semibold">{initials(c.name)}</div>
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <div className="text-xl font-semibold truncate">{c.name}</div>
              <div className="text-[15px] text-mist truncate">
                {c.phone} · {c.language === 'es' ? 'Español' : 'English'} · Risk {c.riskScore}
              </div>
            </div>
            <button onClick={() => setPanelOpen(true)} className="h-[42px] px-3 rounded-lg border border-white/[.14] bg-transparent text-ink text-[15px] cursor-pointer whitespace-nowrap">
              Details
            </button>
            {!takeover && (
              <button
                onClick={() => {
                  if (!live) store.setCallStatus(c.id, 'agent');
                  store.stepIn(c.id);
                }}
                className="h-[42px] px-3.5 rounded-lg bg-ink text-void hover:bg-white font-semibold text-[15px] cursor-pointer whitespace-nowrap"
              >
                {live ? 'Step in' : 'Call now'}
              </button>
            )}
          </div>
          <div
            className="px-[18px] py-2.5 flex items-center gap-2 text-[15px] border-b border-white/[.14]"
            style={{ background: '#202228', color: live || takeover ? '#F3F4F6' : '#B3B7BF' }}
          >
            {(live || takeover) && <Dot color="#A8C4D6" />}
            <span className="font-semibold">{takeover ? 'You took over from Nora.' : live ? 'Nora is on the call.' : 'No live call.'}</span>
            <span className="text-mist">{takeover ? 'AI is paused and watching.' : live ? 'You can step in at any time.' : cs === 'ended' ? 'Call ended.' : ''}</span>
            {LIVE_FEED_ENABLED && (
              <button
                onClick={() => setFeedOpen(true)}
                className="ml-auto min-h-[44px] px-3 rounded-lg border border-white/[.14] bg-transparent text-ink text-[14px] cursor-pointer whitespace-nowrap"
              >
                {live ? '● Open live Nora feed' : 'View last call with Nora'}
              </button>
            )}
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden px-[18px] py-4 flex flex-col gap-3">
            {lines.map((l, i) => {
              const animate = seen.id === c.id && !seen.ids.has(l.id);
              const speech = (x: Line) => x.kind === 'ai' || x.kind === 'cust' || x.kind === 'agent';
              const prevSpeech = speech(l) ? lines.slice(0, i).reverse().find(speech) : undefined;
              const divider =
                speech(l) && (!prevSpeech || (prevSpeech.channel || 'chat') !== (l.channel || 'chat')) ? (
                  <div key={l.id + '-d'} className="flex items-center gap-2 pt-1 text-[12px] text-[#A7ABB3]">
                    <span>{(l.channel || 'chat') === 'call' ? 'Phone call' : 'Text messages'}</span>
                    <span className="flex-1 h-px bg-white/[.08]" />
                  </div>
                ) : null;
              if (l.kind === 'event')
                return (
                  <div key={l.id} className="flex items-center gap-2 font-mono text-[13px] text-mist hn-in">
                    <span className="w-1.5 h-1.5 rounded-sm flex-none" style={{ background: DOT[l.dot || 'lavender'] }} />
                    <span className="text-ink">{l.text}</span>
                    <span className="flex-1 h-px bg-white/[.08]" />
                    <span>{l.time}</span>
                  </div>
                );
              if (l.kind === 'claim') {
                if (!claim || claim.status === 'none') return null;
                const appr = claim.status === 'approved';
                return (
                  <div key={l.id} className="border border-white/[.14] rounded-xl px-3.5 py-3 flex items-center gap-3 bg-panel-2 hn-in">
                    <div className="flex-1 flex flex-col gap-0.5">
                      <div className="text-[12px] font-semibold uppercase tracking-[.06em]" style={{ color: appr ? '#A8C4D6' : '#B3B7BF' }}>
                        {appr ? 'Approved' : claim.status === 'submitted' ? 'Submitted by policyholder · needs approval' : 'Draft · needs approval'}
                      </div>
                      <div className="font-semibold text-[17px]">
                        {claim.id} · {claim.type}
                      </div>
                      <div className="text-[15px] text-mist">{appr ? `${claim.number} · ${money(claim.amount)} · crew dispatched` : `${money(claim.amount)} · drafted by Nora`}</div>
                    </div>
                    {!appr && (
                      <div className="flex flex-col gap-1.5">
                        <button onClick={approve} className="h-[42px] px-3.5 rounded-lg bg-ink text-void hover:bg-white font-bold text-[15px] cursor-pointer whitespace-nowrap">
                          Approve &amp; Dispatch
                        </button>
                        <button
                          onClick={() => {
                            setPanelOpen(true);
                            setEditingFor(c.id);
                          }}
                          className="h-[36px] px-3.5 rounded-lg border border-white/[.14] bg-transparent text-ink text-[14px] cursor-pointer whitespace-nowrap"
                        >
                          Edit claim
                        </button>
                      </div>
                    )}
                  </div>
                );
              }
              if (l.kind === 'handoff')
                return (
                  <div key={l.id} className="rounded-xl p-3.5 bg-panel-2 border border-white/[.14] flex flex-col gap-2 hn-in">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold">Nora&apos;s handoff summary</span>
                      <span className="flex-1" />
                      <span className="font-mono text-[13px] text-mist">{l.time}</span>
                    </div>
                    {l.items?.map((it, i) => (
                      <div key={i} className="flex gap-2 text-[15px] leading-snug">
                        <span className="text-mist">•</span>
                        <span>{it}</span>
                      </div>
                    ))}
                  </div>
                );
              const right = l.kind !== 'cust';
              return [
                divider,
                <div key={l.id} className="flex flex-col gap-1 hn-in" style={{ alignItems: right ? 'flex-end' : 'flex-start' }}>
                  <div className="text-[12px] text-mist">
                    {l.kind === 'ai' ? 'Nora (AI)' : l.kind === 'agent' ? 'You' : first(c.name)} · {l.time}
                  </div>
                  <div
                    className="max-w-[86%] px-3 py-2.5 rounded-xl text-[16px] leading-snug"
                    style={{ background: l.kind === 'cust' ? '#202228' : l.kind === 'agent' ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.05)' }}
                  >
                    <StreamText text={l.text} animate={animate} />
                  </div>
                  {l.tr && <div className="max-w-[86%] text-[14px] italic text-mist leading-snug" style={{ textAlign: right ? 'right' : 'left' }}>{l.tr}</div>}
                </div>,
              ];
            })}
          </div>

          <ToolTrace runs={runs} paused={takeover} />

          <div className="px-[18px] pt-3 pb-4 border-t border-white/[.14]">
            {takeover ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!msg.trim()) return;
                  store.sendAgentMessage(c.id, msg.trim());
                  setMsg('');
                }}
                className="flex gap-2"
              >
                <input
                  value={msg}
                  onChange={(e) => setMsg(e.target.value)}
                  placeholder={`Speak to ${first(c.name)}…`}
                  aria-label={`Message to ${c.name}`}
                  className="flex-1 h-12 px-3 rounded-[9px] border border-white/[.14] bg-void text-ink text-base outline-none"
                />
                <button type="submit" className="h-12 px-3.5 rounded-[9px] bg-ink text-panel font-semibold cursor-pointer">
                  Send
                </button>
              </form>
            ) : (
              <div className="h-12 flex items-center justify-center rounded-[9px] border border-dashed border-white/[.14] text-mist text-[15px]">
                {live ? `Nora is talking with ${first(c.name)}. Step in to take over.` : `Not on a call with ${first(c.name)}.`}
              </div>
            )}
          </div>
        </section>

        {/* Explainability drawer */}
        {panelOpen && (
          <aside className="absolute right-0 top-0 bottom-0 w-[460px] z-10 overflow-y-auto bg-panel border-l border-white/[.14] shadow-[-18px_0_40px_rgba(0,0,0,.12)] flex flex-col hn-in">
            <div className="px-[18px] py-4 flex items-start gap-2.5 border-b border-white/[.14]">
              <div className="flex-1 flex flex-col gap-1">
                <div className="hn-label text-[13px] text-mist">Policyholder</div>
                <div className="text-[21px] font-semibold">{c.name}</div>
                <div className="text-[15px] text-mist">
                  {c.address}, {c.city} {c.state} {c.zip}
                </div>
              </div>
              <button onClick={() => setPanelOpen(false)} aria-label="Close" className="w-9 h-11 rounded-md border border-white/[.14] bg-transparent text-ink text-xl cursor-pointer">
                ×
              </button>
            </div>

            <div className="px-[18px] py-3.5 flex flex-col gap-2 border-b border-white/[.14]">
              <div className="hn-label text-[13px] text-mist">Priority</div>
              <div className="grid grid-cols-4 gap-0.5 p-[3px] rounded-[9px] bg-panel-2 border border-white/[.14]">
                {(['Auto', 'High', 'Medium', 'Low'] as const).map((k) => {
                  const on = k === 'Auto' ? !priorityOverride[c.id] : priorityOverride[c.id] === k;
                  const col = k === 'Auto' ? { bg: '#2A2D33', fg: '#F3F4F6' } : TIER_DARK[k];
                  return (
                    <button
                      key={k}
                      onClick={() => store.setPriorityOverride(c.id, k === 'Auto' ? null : k)}
                      className="h-9 rounded-md font-semibold text-[15px] cursor-pointer"
                      style={{ background: on ? col.bg : 'transparent', color: on ? col.fg : '#C5C9D0' }}
                    >
                      {k}
                    </button>
                  );
                })}
              </div>
              <div className="text-sm text-mist">{priorityOverride[c.id] ? `You set this manually. AI ranking would put it at ${c.urgency}.` : `Set by AI ranking: ${c.urgency}.`}</div>
            </div>

            <div className="px-[18px] py-3.5 flex flex-col gap-2.5 border-b border-white/[.14]">
              <div className="flex items-baseline">
                <span className="hn-label text-[13px] text-mist">Risk breakdown</span>
                <span className="flex-1" />
                <span className="font-mono font-semibold text-[23px]">{c.riskScore}</span>
              </div>
              <RiskFactor label="Environment" why={factorWhy[0]} value={ex.environmentalFactorScore} />
              <RiskFactor label="Vulnerability" why={factorWhy[1]} value={ex.vulnerabilityFactorScore} />
              <RiskFactor label="Property" why={factorWhy[2]} value={ex.propertyFactorScore} />
              <RiskFactor label="History" why={factorWhy[3]} value={ex.historyFactorScore} />
            </div>

            <div className="px-[18px] py-3.5 flex flex-col gap-2 border-b border-white/[.14]">
              <div className="hn-label text-[13px] text-mist">Recommended actions</div>
              {ex.recommendedActions.map((a, i) => (
                <div key={i} className="flex gap-2.5 text-[15px] leading-snug">
                  <span className="font-mono text-[13px] text-mist">{i + 1}.</span>
                  <span>{a}</span>
                </div>
              ))}
            </div>

            <div className="px-[18px] py-3.5 flex flex-col gap-2 border-b border-white/[.14]">
              <div className="hn-label text-[13px] text-mist">Policy</div>
              <div className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5 text-[15px]">
                {[
                  ['Number', c.policy.policyNumber, true],
                  ['Type', c.policy.type, false],
                  ['Dwelling', money(c.policy.coverageLimit), true],
                  ['Deductible', money(c.policy.deductible), true],
                  ['Water backup', WATER_BACKUP[c.id], false],
                ].map(([k, v, mono]) => (
                  <div key={k as string} className="contents">
                    <span className="text-mist">{k}</span>
                    <span className={`text-right ${mono ? 'font-mono' : ''}`}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-[18px] py-3.5 flex flex-col gap-2 border-b border-white/[.14]">
              <div className="hn-label text-[13px] text-mist">Claims</div>
              {claim && claim.status !== 'none' && editingFor === c.id && claim.status !== 'approved' && (
                <ClaimEditor
                  key={c.id}
                  claim={claim}
                  onCancel={() => setEditingFor(null)}
                  onSave={(e) => {
                    store.editClaim(c.id, e);
                    setEditingFor(null);
                    showToast('Claim updated');
                  }}
                />
              )}
              {claim && claim.status !== 'none' && !(editingFor === c.id && claim.status !== 'approved') && (
                <div className="flex flex-col gap-2.5 p-3.5 rounded-[10px] bg-panel-2 border border-white/[.14]">
                  <div className="flex items-baseline gap-2">
                    <ClaimChip dark claim={claim} />
                    <span className="flex-1" />
                    <span className="font-mono font-bold text-lg">{money(claim.amount)}</span>
                  </div>
                  <div className="font-semibold">
                    {claim.id} · {claim.type}
                  </div>
                  <div className="text-sm text-mist leading-relaxed">{claim.description}</div>
                  {(() => {
                    const d = detailsOf(c);
                    return (
                      <div className="flex flex-col gap-1.5">
                        <div className="text-[13px] text-mist">
                          Confirmed by the policyholder: {d.all.length - d.unconfirmed.length} of {d.all.length}
                        </div>
                        <ul className="m-0 p-0 list-none grid grid-cols-2 gap-x-3 gap-y-1">
                          {d.all.map((f) => {
                            const ok = !!claim.confirmed[f.key];
                            return (
                              <li key={f.key} className="flex items-center gap-1.5 text-[13px]" style={{ color: ok ? '#F3F4F6' : '#DDBB72' }}>
                                <span aria-hidden>{ok ? '✓' : '?'}</span>
                                <span>{f.label}</span>
                                <span className="sr-only">{ok ? '(confirmed)' : '(not confirmed)'}</span>
                              </li>
                            );
                          })}
                        </ul>
                        {d.unconfirmed.length > 0 && claim.status !== 'approved' && (
                          <div role="note" className="text-[13px] leading-snug px-2.5 py-2 rounded-md" style={{ background: 'rgba(242,193,78,.12)', color: '#DDBB72' }}>
                            Not confirmed with the policyholder yet: {d.unconfirmed.map((f) => f.label.toLowerCase()).join(', ')}. You can still approve.
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {claim.status !== 'approved' ? (
                    <div className="flex flex-col gap-2">
                      <button onClick={approve} className="h-12 rounded-[10px] bg-ink text-void hover:bg-white font-semibold text-base cursor-pointer">
                        Approve claim &amp; dispatch
                      </button>
                      <button onClick={() => setEditingFor(c.id)} className="h-11 rounded-[10px] border border-white/[.14] bg-transparent text-ink font-semibold text-[15px] cursor-pointer">
                        Edit claim
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-white/[.05] text-[#A8C4D6] font-semibold">
                      <span className="font-mono">✓</span>
                      {claim.number} · crew dispatched
                    </div>
                  )}
                </div>
              )}
              {c.claimsHistory.map((h) => (
                <div key={h.id} className="grid grid-cols-[52px_1fr_auto] gap-2.5 text-[15px] items-baseline">
                  <span className="font-mono text-mist">{h.date.slice(0, 4)}</span>
                  <span>{h.type}</span>
                  <span className="font-mono text-mist">{money(h.amount)}</span>
                </div>
              ))}
              {!c.claimsHistory.length && <div className="text-[15px] text-mist">No prior claims</div>}
            </div>

            <div className="px-[18px] pt-3.5 pb-5 flex flex-col gap-2">
              <div className="hn-label text-[13px] text-mist">Emergency contacts</div>
              <div className="flex items-center gap-2.5 text-[15px]">
                <div className="flex-1 flex flex-col">
                  <span className="font-medium">{c.emergencyContact.name}</span>
                  <span className="text-sm text-mist">{c.emergencyContact.relationship}</span>
                </div>
                <span className="font-mono text-mist">{c.emergencyContact.phone}</span>
              </div>
            </div>
          </aside>
        )}
      </div>

      {help && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4" onClick={() => setHelp(false)}>
          <div className="w-full max-w-[380px] rounded-xl bg-panel border border-white/[.1] p-6 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <div className="text-[18px] font-semibold">Keyboard shortcuts</div>
            {[
              ['J / K', 'Next / previous policyholder'],
              ['S', 'Step in on the call'],
              ['A', 'Approve claim & dispatch'],
              ['D', 'Details panel'],
              ['M / Q', 'Map / queue'],
              ['?', 'This list'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center gap-3 text-[15px]">
                <span className="min-w-[56px] text-center px-2 py-0.5 rounded-md bg-panel-2 border border-white/[.1] font-mono text-[13px]">{k}</span>
                <span className="text-mist">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <LiveNoraFeed
        open={feedOpen}
        onClose={() => setFeedOpen(false)}
        customer={c}
        lines={lines}
        toolRuns={toolRuns[c.id]}
        callStatus={cs}
        takeover={takeover}
        onTakeOver={() => store.stepIn(c.id)}
      />

      {toast && (
        <div className="fixed left-1/2 bottom-6 -translate-x-1/2 z-30 px-4 py-2.5 rounded-[10px] bg-ink text-panel font-medium shadow-[0_10px_30px_rgba(0,0,0,.2)] hn-in">{toast}</div>
      )}
    </>
  );
}
