'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useStore } from '@/context/StateFarmContext';
import { AgentNav, type AgentView } from '@/components/ui/AgentNav';
import { ToolTrace } from '@/components/ui/ToolTrace';
import { RiskFactor } from '@/components/ui/RiskFactor';
import { StreamText } from '@/components/ui/StreamText';
import { ClaimChip } from '@/components/ui/Chips';
import { SIM, simTrace } from '@/components/agent/simScripts';
import { first, initials, money, TIER_DARK, TIER_RANK, WATER_BACKUP } from '@/lib/hn';
import type { CustomerProfile, UrgencyLevel } from '@/types/statefarm';

const TriageMap = dynamic(() => import('@/components/agent/TriageMap'), { ssr: false });

const ROW_H = 68;
const GRID = '28px 84px 64px minmax(0,1.6fr) minmax(0,1fr) 160px 96px';
// Events in the transcript: one accent for things that need attention, neutral otherwise.
const DOT = { red: '#FF6B73', lavender: '#6E6878', blue: '#8FC3DD' } as const;

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
  const [msg, setMsg] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const storeRef = useRef(store);
  storeRef.current = store;

  useEffect(() => {
    if (hydrated) setSel(storeRef.current.activeCustomerId);
  }, [hydrated]);

  const tier = (c: CustomerProfile): UrgencyLevel => priorityOverride[c.id] || c.urgency;
  const sorted = useMemo(
    () => [...customers].sort((a, b) => TIER_RANK[tier(a)] - TIER_RANK[tier(b)] || b.riskScore - a.riskScore),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customers, priorityOverride],
  );
  const isDraft = (id: string) => claims[id]?.status === 'draft' || claims[id]?.status === 'submitted';
  const vis = sorted.filter((c) => (filter === 'All' ? true : filter === 'High' ? tier(c) === 'High' : isDraft(c.id)));

  /* ---- Simulated background Nora calls (catch up if the tab was hidden) ---- */
  const simProgress = (id: string) => (transcripts[id] || []).filter((l) => l.channel === 'call').length;
  useEffect(() => {
    if (!hydrated) return;
    let last = Date.now();
    const iv = setInterval(() => {
      const s = storeRef.current;
      const steps = Math.min(3, Math.max(1, Math.floor((Date.now() - last) / 2200)));
      last = Date.now();
      for (const id of Object.keys(SIM)) {
        if (s.callStatus[id] !== 'ai' || s.agentTakeover[id]) continue;
        let p = (s.transcripts[id] || []).filter((l) => l.channel === 'call').length;
        for (let k = 0; k < steps && p < SIM[id].steps.length; k++, p++) {
          const st = SIM[id].steps[p];
          s.appendLine(id, { kind: st.kind, text: st.text, dot: st.dot, channel: 'call' });
          if (st.risk) s.patchCustomer(id, { riskScore: st.risk, urgency: 'High' });
        }
      }
    }, 2200);
    return () => clearInterval(iv);
  }, [hydrated]);

  /* ---- One scripted re-rank so the queue visibly reprioritizes (no constant jitter) ---- */
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      const s = storeRef.current;
      const c3 = s.customers.find((c) => c.id === 'cust-3');
      if (c3 && c3.riskScore < 81) s.patchCustomer('cust-3', { riskScore: 81, urgency: 'High', detectedHazard: 'Branch cracked · over bedroom' });
    }, 9000);
    return () => clearTimeout(t);
  }, [hydrated]);

  /* ---- Selected policyholder ---- */
  const c = customers.find((x) => x.id === sel) || customers[0];
  const claim = claims[c.id];
  const takeover = !!agentTakeover[c.id];
  const cs = callStatus[c.id] || 'idle';
  const live = cs === 'ai' || cs === 'agent';
  const lines = transcripts[c.id] || [];
  const runs = toolRuns[c.id]?.length ? toolRuns[c.id] : simTrace(c.id, simProgress(c.id), takeover);

  // Only lines that arrive after the panel opens get the typing animation.
  const seen = useRef<Record<string, Set<string>>>({});
  if (!seen.current[c.id]) seen.current[c.id] = new Set(lines.map((l) => l.id));
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    lines.forEach((l) => seen.current[c.id].add(l.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines.length, c.id]);

  const showToast = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2200);
  };

  const approve = () => {
    const num = store.approveClaimDraft(c.id);
    if (!num) return;
    showToast(`${num} approved and dispatched`);
  };

  const callText = (x: CustomerProfile): [string, string, boolean] => {
    const rq = contactRequests.find((r) => r.custId === x.id && r.status === 'waiting');
    if (rq) return ['Wants a person', '#FF6B73', true];
    const s = callStatus[x.id];
    if (agentTakeover[x.id] && s !== 'ended') return ['You’re on the call', '#F4F1F6', true];
    if (claims[x.id]?.status === 'approved') return ['Crew dispatched', '#9A93A3', false];
    if (s === 'ai') return ['Nora on call', '#F4F1F6', true];
    if (s === 'ringing') return ['Dialing…', '#9A93A3', false];
    if (s === 'ended') return ['Call ended', '#6E6878', false];
    if (x.checkInStatus === 'completed') return ['Checked in · OK', '#9A93A3', false];
    if (x.checkInStatus === 'urgent_attention') return ['Needs follow-up', '#F4F1F6', false];
    if (x.checkInStatus === 'in_progress') return ['SMS check-in', '#9A93A3', false];
    return ['Not reached', '#6E6878', false];
  };

  const waitingReqs = contactRequests.filter((r) => r.status !== 'closed');
  const counts = {
    All: customers.length,
    High: customers.filter((x) => tier(x) === 'High').length,
    Drafts: customers.filter((x) => isDraft(x.id)).length,
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
        lastSync={store.lastSync}
        dbStatus={store.dbStatus}
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
        <div className="flex-none flex gap-3 items-center px-6 py-2.5 bg-panel border-b border-white/[.08] overflow-x-auto">
          <span className="flex items-center gap-2 text-[14px] font-semibold whitespace-nowrap">
            <Dot color="#FF6B73" />
            Asked for a person
          </span>
          {waitingReqs.map((r) => {
            const rc = customers.find((x) => x.id === r.custId);
            const acc = r.status === 'accepted';
            return (
              <div key={r.id} className="flex-none flex items-center gap-3 pl-3.5 pr-2 py-1.5 rounded-xl bg-panel-2 border border-white/[.08] hn-in">
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
                  style={{ background: acc ? '#2A2A30' : '#ED1D24' }}
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
              onSelect={(id) => {
                setSel(id);
                setView('queue');
              }}
            />
          ) : (
            <>
              <div className="flex items-center gap-3 px-5 pt-[18px] pb-3.5">
                <div className="font-semibold text-[22px] leading-none">Priority queue</div>
                <div className="text-mist text-[15px] whitespace-nowrap">
                  {counts.High} high · {Object.values(callStatus).filter((v) => v === 'ai').length} on calls with Nora · sorted by urgency, then risk
                </div>
                <div className="flex-1" />
                <div className="flex gap-0.5 p-[3px] rounded-[9px] bg-panel-2 border border-white/[.08]">
                  {(['All', 'High', 'Drafts'] as const).map((k) => (
                    <button
                      key={k}
                      onClick={() => setFilter(k)}
                      className="h-[34px] px-2.5 rounded-md font-medium text-base cursor-pointer flex items-center gap-1.5"
                      style={{ background: filter === k ? '#2A2A30' : 'transparent', color: filter === k ? '#F4F1F6' : '#B9A6C9' }}
                    >
                      {k}
                      <span className="font-mono text-sm opacity-60">{counts[k]}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-2.5 pl-[19px] pr-4 pb-2 hn-label text-[13px] text-mist border-b border-white/[.08]" style={{ gridTemplateColumns: GRID }}>
                <div>#</div>
                <div>Urgency</div>
                <div>Risk</div>
                <div>Policyholder</div>
                <div>Hazard</div>
                <div>Call</div>
                <div>Claim</div>
              </div>
              <div className="flex-1 overflow-auto">
                <div className="relative" style={{ height: vis.length * ROW_H }}>
                  {customers.map((x) => {
                    const r = vis.indexOf(x);
                    const isSel = x.id === sel;
                    const t = tier(x);
                    const [st, stc, pulse] = callText(x);
                    return (
                      <div
                        key={x.id}
                        onClick={() => setSel(x.id)}
                        className="absolute left-0 right-0 grid gap-2.5 items-center px-4 cursor-pointer border-b border-white/[.08]"
                        style={{
                          top: Math.max(r, 0) * ROW_H,
                          height: ROW_H,
                          opacity: r < 0 ? 0 : 1,
                          pointerEvents: r < 0 ? 'none' : 'auto',
                          gridTemplateColumns: GRID,
                          background: isSel ? 'rgba(255,255,255,.05)' : 'transparent',
                          borderLeft: `3px solid ${isSel ? '#F4F1F6' : 'transparent'}`,
                          transition: 'top .6s ease, opacity .3s',
                        }}
                      >
                        <div className="font-mono text-sm text-[#6E6878]">{sorted.indexOf(x) + 1}</div>
                        <div className="flex items-center gap-1">
                          <span className="px-2 py-[2px] rounded-md font-semibold text-[13px]" style={{ background: TIER_DARK[t].bg, color: TIER_DARK[t].fg }}>
                            {t}
                          </span>
                          {priorityOverride[x.id] && <span title="Set manually" className="text-[11px] text-mist">manual</span>}
                        </div>
                        <div className="font-mono text-[17px]" style={{ color: t === 'High' ? '#F4F1F6' : '#9A93A3' }}>
                          {x.riskScore}
                        </div>
                        <div className="min-w-0 flex flex-col gap-0.5">
                          <div className="font-semibold text-[16px] truncate">{x.name}</div>
                          <div className="text-[13px] text-mist truncate">
                            {x.age} · {x.livesAlone ? 'Lives alone' : 'With family'} · {x.language === 'es' ? 'Spanish' : 'English'}
                          </div>
                        </div>
                        <div className="min-w-0 text-[14px] text-[#D9D2DE] truncate">{x.detectedHazard}</div>
                        <div className="flex items-center gap-2 text-[14px] whitespace-nowrap overflow-hidden" style={{ color: stc }}>
                          {pulse && <Dot color={stc === '#FF6B73' ? stc : '#8FC3DD'} />}
                          {st}
                        </div>
                        <div>
                          <ClaimChip dark claim={claims[x.id]} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </section>

        {/* Transcript panel */}
        <section className="w-[440px] flex-none flex flex-col border-l border-white/[.08] bg-panel">
          <div className="px-[18px] pt-4 pb-3.5 flex items-center gap-3 border-b border-white/[.08]">
            <div className="w-12 h-12 rounded-full bg-panel-2 border border-white/[.08] flex items-center justify-center font-semibold">{initials(c.name)}</div>
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <div className="text-xl font-semibold truncate">{c.name}</div>
              <div className="text-[15px] text-mist truncate">
                {c.phone} · {c.language === 'es' ? 'Español' : 'English'} · Risk {c.riskScore}
              </div>
            </div>
            <button onClick={() => setPanelOpen(true)} className="h-[42px] px-3 rounded-lg border border-white/[.08] bg-transparent text-ink text-[15px] cursor-pointer whitespace-nowrap">
              Details
            </button>
            {!takeover && (
              <button
                onClick={() => {
                  if (!live) store.setCallStatus(c.id, 'agent');
                  store.stepIn(c.id);
                }}
                className="h-[42px] px-3.5 rounded-lg bg-sf-red text-white font-semibold text-[15px] cursor-pointer whitespace-nowrap"
              >
                {live ? 'Step in' : 'Call now'}
              </button>
            )}
          </div>
          <div
            className="px-[18px] py-2.5 flex items-center gap-2 text-[15px] border-b border-white/[.08]"
            style={{ background: '#1C1C21', color: live || takeover ? '#F4F1F6' : '#9A93A3' }}
          >
            {(live || takeover) && <Dot color="#8FC3DD" />}
            <span className="font-semibold">{takeover ? 'You took over from Nora.' : live ? 'Nora is on the call.' : 'No live call.'}</span>
            <span className="text-mist">{takeover ? 'AI is paused and watching.' : live ? 'You can step in at any time.' : cs === 'ended' ? 'Call ended.' : ''}</span>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden px-[18px] py-4 flex flex-col gap-3">
            {lines.map((l) => {
              const animate = !seen.current[c.id].has(l.id);
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
                  <div key={l.id} className="border border-white/[.08] rounded-xl px-3.5 py-3 flex items-center gap-3 bg-panel-2 hn-in">
                    <div className="flex-1 flex flex-col gap-0.5">
                      <div className="text-[12px] font-semibold uppercase tracking-[.06em]" style={{ color: appr ? '#8FC3DD' : '#9A93A3' }}>
                        {appr ? 'Approved' : claim.status === 'submitted' ? 'Submitted by policyholder · needs approval' : 'Draft · needs approval'}
                      </div>
                      <div className="font-semibold text-[17px]">
                        {claim.id} · {claim.type}
                      </div>
                      <div className="text-[15px] text-mist">{appr ? `${claim.number} · ${money(claim.amount)} · crew dispatched` : `${money(claim.amount)} · drafted by Nora`}</div>
                    </div>
                    {!appr && (
                      <button onClick={approve} className="h-[42px] px-3.5 rounded-lg bg-sf-red text-white font-bold text-[15px] cursor-pointer whitespace-nowrap">
                        Approve &amp; Dispatch
                      </button>
                    )}
                  </div>
                );
              }
              if (l.kind === 'handoff')
                return (
                  <div key={l.id} className="rounded-xl p-3.5 bg-panel-2 border border-white/[.08] flex flex-col gap-2 hn-in">
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
              return (
                <div key={l.id} className="flex flex-col gap-1 hn-in" style={{ alignItems: right ? 'flex-end' : 'flex-start' }}>
                  <div className="text-[12px] text-mist">
                    {l.kind === 'ai' ? 'Nora (AI)' : l.kind === 'agent' ? 'You' : first(c.name)} · {l.time}
                  </div>
                  <div
                    className="max-w-[86%] px-3 py-2.5 rounded-xl text-[16px] leading-snug"
                    style={{ background: l.kind === 'cust' ? '#1C1C21' : l.kind === 'agent' ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.05)' }}
                  >
                    <StreamText text={l.text} animate={animate} />
                  </div>
                  {l.tr && <div className="max-w-[86%] text-[14px] italic text-mist leading-snug" style={{ textAlign: right ? 'right' : 'left' }}>{l.tr}</div>}
                </div>
              );
            })}
          </div>

          <ToolTrace runs={runs} paused={takeover} />

          <div className="px-[18px] pt-3 pb-4 border-t border-white/[.08]">
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
                  className="flex-1 h-12 px-3 rounded-[9px] border border-white/[.08] bg-void text-ink text-base outline-none"
                />
                <button type="submit" className="h-12 px-3.5 rounded-[9px] bg-ink text-panel font-semibold cursor-pointer">
                  Send
                </button>
              </form>
            ) : (
              <div className="h-12 flex items-center justify-center rounded-[9px] border border-dashed border-white/[.08] text-mist text-[15px]">
                {live ? `Nora is talking with ${first(c.name)}. Step in to take over.` : `Not on a call with ${first(c.name)}.`}
              </div>
            )}
          </div>
        </section>

        {/* Explainability drawer */}
        {panelOpen && (
          <aside className="absolute right-0 top-0 bottom-0 w-[460px] z-10 overflow-y-auto bg-panel border-l border-white/[.08] shadow-[-18px_0_40px_rgba(0,0,0,.12)] flex flex-col hn-in">
            <div className="px-[18px] py-4 flex items-start gap-2.5 border-b border-white/[.08]">
              <div className="flex-1 flex flex-col gap-1">
                <div className="hn-label text-[13px] text-mist">Policyholder</div>
                <div className="text-[21px] font-semibold">{c.name}</div>
                <div className="text-[15px] text-mist">
                  {c.address}, {c.city} {c.state} {c.zip}
                </div>
              </div>
              <button onClick={() => setPanelOpen(false)} aria-label="Close" className="w-9 h-11 rounded-md border border-white/[.08] bg-transparent text-ink text-xl cursor-pointer">
                ×
              </button>
            </div>

            <div className="px-[18px] py-3.5 flex flex-col gap-2 border-b border-white/[.08]">
              <div className="hn-label text-[13px] text-mist">Priority</div>
              <div className="grid grid-cols-4 gap-0.5 p-[3px] rounded-[9px] bg-panel-2 border border-white/[.08]">
                {(['Auto', 'High', 'Medium', 'Low'] as const).map((k) => {
                  const on = k === 'Auto' ? !priorityOverride[c.id] : priorityOverride[c.id] === k;
                  const col = k === 'Auto' ? { bg: '#2A2A30', fg: '#F4F1F6' } : TIER_DARK[k];
                  return (
                    <button
                      key={k}
                      onClick={() => store.setPriorityOverride(c.id, k === 'Auto' ? null : k)}
                      className="h-9 rounded-md font-semibold text-[15px] cursor-pointer"
                      style={{ background: on ? col.bg : 'transparent', color: on ? col.fg : '#B9A6C9' }}
                    >
                      {k}
                    </button>
                  );
                })}
              </div>
              <div className="text-sm text-mist">{priorityOverride[c.id] ? `You set this manually. AI ranking would put it at ${c.urgency}.` : `Set by AI ranking: ${c.urgency}.`}</div>
            </div>

            <div className="px-[18px] py-3.5 flex flex-col gap-2.5 border-b border-white/[.08]">
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

            <div className="px-[18px] py-3.5 flex flex-col gap-2 border-b border-white/[.08]">
              <div className="hn-label text-[13px] text-mist">Recommended actions</div>
              {ex.recommendedActions.map((a, i) => (
                <div key={i} className="flex gap-2.5 text-[15px] leading-snug">
                  <span className="font-mono text-[13px] text-mist">{i + 1}.</span>
                  <span>{a}</span>
                </div>
              ))}
            </div>

            <div className="px-[18px] py-3.5 flex flex-col gap-2 border-b border-white/[.08]">
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

            <div className="px-[18px] py-3.5 flex flex-col gap-2 border-b border-white/[.08]">
              <div className="hn-label text-[13px] text-mist">Claims</div>
              {claim && claim.status !== 'none' && (
                <div className="flex flex-col gap-2.5 p-3.5 rounded-[10px] bg-panel-2 border border-white/[.08]">
                  <div className="flex items-baseline gap-2">
                    <ClaimChip dark claim={claim} />
                    <span className="flex-1" />
                    <span className="font-mono font-bold text-lg">{money(claim.amount)}</span>
                  </div>
                  <div className="font-semibold">
                    {claim.id} · {claim.type}
                  </div>
                  <div className="text-sm text-mist leading-relaxed">{claim.description}</div>
                  {Object.keys(claim.confirmed).length > 0 && (
                    <div className="text-[13px] text-mist">{Object.keys(claim.confirmed).length} of 8 details confirmed by the policyholder</div>
                  )}
                  {claim.status !== 'approved' ? (
                    <button onClick={approve} className="h-12 rounded-[10px] bg-sf-red text-white font-semibold text-base cursor-pointer">
                      Approve claim &amp; dispatch
                    </button>
                  ) : (
                    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-white/[.05] text-[#8FC3DD] font-semibold">
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

      {toast && (
        <div className="fixed left-1/2 bottom-6 -translate-x-1/2 z-30 px-4 py-2.5 rounded-[10px] bg-ink text-panel font-medium shadow-[0_10px_30px_rgba(0,0,0,.2)] hn-in">{toast}</div>
      )}
    </>
  );
}
