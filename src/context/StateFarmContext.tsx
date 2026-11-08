'use client';

import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { initialCustomers } from '@/data/mockCustomers';
import type {
  CallStatus,
  ClaimFlow,
  ContactRequest,
  CustomerProfile,
  Language,
  Line,
  RequestChannel,
  ToolCall,
  UrgencyLevel,
} from '@/types/statefarm';
import { first, FREEZE_RE, hazardFor, nowTime, reportsHazard } from '@/lib/hn';
import { claimStatusFromDb, connectSpacetime, custIdOf, tierFromScore, type DbStatus, type SpacetimeBridge } from '@/lib/spacetime';

const CLAIM_RANK: Record<ClaimFlow['status'], number> = { none: 0, draft: 1, submitted: 2, approved: 3 };

const KEY = 'sf_v11';
const CHANNEL = 'hn_demo';

export interface AppState {
  customers: CustomerProfile[];
  activeCustomerId: string;
  claims: Record<string, ClaimFlow>;
  contactRequests: ContactRequest[];
  agentTakeover: Record<string, boolean>;
  transcripts: Record<string, Line[]>;
  toolRuns: Record<string, ToolCall[]>;
  priorityOverride: Record<string, UrgencyLevel | null>;
  callStatus: Record<string, CallStatus>;
  reqSeq: number;
  /** Catastrophe mode: declared by an agent, Nora dials everyone in the zone. */
  /** Bumped by Reset so other tabs drop their old state instead of merging it back in. */
  epoch: number;
  /** Last-write time per slot (e.g. "cs:cust-1"), so tabs can merge instead of overwriting. */
  stamps: Record<string, number>;
}

const REQ_RANK = { waiting: 0, accepted: 1, closed: 2 } as const;

/**
 * Tabs broadcast whole snapshots. Taking the newest snapshot wholesale loses writes when two
 * tabs act at once (the agent tab's background calls vs. the portal's live call), so merge:
 * transcripts and requests are unioned, claims never move backwards, and keyed slots keep
 * whichever side wrote last.
 */
function mergeState(local: AppState, remote: AppState): AppState {
  if ((remote.epoch || 0) !== (local.epoch || 0)) return (remote.epoch || 0) > (local.epoch || 0) ? remote : local;
  const ls = local.stamps || {};
  const rs = remote.stamps || {};
  const newer = (k: string) => (rs[k] || 0) >= (ls[k] || 0);
  const ids = remote.customers.map((c) => c.id);

  const transcripts: Record<string, Line[]> = { ...local.transcripts, ...remote.transcripts };
  for (const id of Object.keys(transcripts)) {
    const r = remote.transcripts[id] || [];
    const seen = new Set(r.map((l) => l.id));
    transcripts[id] = [...r, ...(local.transcripts[id] || []).filter((l) => !seen.has(l.id))];
  }

  const reqs = new Map<string, ContactRequest>();
  for (const q of [...local.contactRequests, ...remote.contactRequests]) {
    const prev = reqs.get(q.id);
    if (!prev || REQ_RANK[q.status] >= REQ_RANK[prev.status]) reqs.set(q.id, q);
  }

  const claims: Record<string, ClaimFlow> = { ...local.claims };
  for (const [id, rc] of Object.entries(remote.claims)) {
    const lc = local.claims[id];
    if (!lc) claims[id] = rc;
    else {
      const top = CLAIM_RANK[rc.status] >= CLAIM_RANK[lc.status] ? rc : lc;
      claims[id] = { ...top, number: top.number || rc.number || lc.number, confirmed: { ...lc.confirmed, ...rc.confirmed } };
    }
  }

  const pick = <T,>(k: string, l: T, r: T) => (newer(k) ? r : l);
  const callStatus = { ...local.callStatus };
  const priorityOverride = { ...local.priorityOverride };
  const toolRuns = { ...local.toolRuns };
  for (const id of ids) {
    callStatus[id] = pick('cs:' + id, local.callStatus[id], remote.callStatus[id]);
    priorityOverride[id] = pick('po:' + id, local.priorityOverride[id], remote.priorityOverride[id]);
    toolRuns[id] = pick('to:' + id, local.toolRuns[id], remote.toolRuns[id]);
  }
  const customers = remote.customers.map((rc) => {
    const lc = local.customers.find((c) => c.id === rc.id);
    return lc && !newer('cu:' + rc.id) ? lc : rc;
  });
  const stamps = { ...ls };
  for (const [k, v] of Object.entries(rs)) stamps[k] = Math.max(v, stamps[k] || 0);

  return {
    ...remote,
    customers,
    activeCustomerId: pick('active', local.activeCustomerId, remote.activeCustomerId),
    claims,
    contactRequests: [...reqs.values()],
    agentTakeover: { ...local.agentTakeover, ...remote.agentTakeover },
    transcripts,
    toolRuns,
    priorityOverride,
    callStatus,
    reqSeq: Math.max(local.reqSeq, remote.reqSeq),
    stamps,
  };
}

/**
 * Fill fields added after a snapshot was saved (or sent by a tab still running older code),
 * so new features never read undefined.
 */
function withDefaults(s: AppState): AppState {
  const d = initialState();
  return { ...d, ...s, stamps: s.stamps ?? {}, epoch: s.epoch ?? 0 };
}

/** Mark slots as written now. */
const touch = (s: AppState, ...keys: string[]): AppState => {
  const t = Date.now();
  const stamps = { ...(s.stamps || {}) };
  keys.forEach((k) => (stamps[k] = t));
  return { ...s, stamps };
};

/** English translations for the seeded Spanish chat (shown under Spanish lines in the agent console). */
const SEED_TR: Record<string, string> = {
  'cust-1:msg-1': 'Hi, Doña Sofía! State Farm check-in for the 14°F freeze. How are the pipes?',
  'cust-1:msg-2': 'Hi. It’s very cold. I opened the tap and almost no water comes out. There’s banging under the sink.',
  'cust-1:msg-3': 'Risk alert: possible freezing. Leave the faucet dripping and open the cabinets. I’ve prepared a preventive claim.',
};

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);

function initialState(): AppState {
  const claims: Record<string, ClaimFlow> = {};
  const transcripts: Record<string, Line[]> = {};
  for (const c of initialCustomers) {
    const d = c.claimDraft;
    claims[c.id] = {
      id: d.id,
      status: d.status === 'drafted' ? 'draft' : d.status === 'approved' ? 'approved' : 'none',
      number: d.claimNumber ?? (d.status === 'approved' ? 'SF-CLM-2026-3' + c.id.slice(-1) + '18' : undefined),
      type: d.hazardType,
      amount: d.estimatedLoss,
      description: d.description,
      confirmed: {},
    };
    transcripts[c.id] = c.chatTranscript.map((m) => ({
      id: m.id,
      kind: m.sender === 'bot' ? 'ai' : m.sender === 'agent' ? 'agent' : 'cust',
      text: m.text.replace(/^⚠️\s*/, ''),
      tr: SEED_TR[`${c.id}:${m.id}`],
      time: m.timestamp,
      channel: 'chat',
    }));
  }
  return {
    customers: initialCustomers.map((c) => ({ ...c })),
    activeCustomerId: initialCustomers[0].id,
    claims,
    contactRequests: [],
    agentTakeover: {},
    transcripts,
    toolRuns: {},
    priorityOverride: {},
    callStatus: { 'cust-1': 'ringing', 'cust-6': 'ai', 'cust-2': 'ai' },
    reqSeq: 0,
    epoch: 0,
    stamps: {},
  };
}

export interface ToolStep {
  name: string;
  output: string;
  effect?: () => void;
}

interface Ctx extends AppState {
  hydrated: boolean;
  lastSync: number;
  /** SpacetimeDB connection state ('off'/'error' → local-only sync). */
  dbStatus: DbStatus;
  activeCustomer: CustomerProfile;
  setActiveCustomerId: (id: string) => void;
  updateCustomerLanguage: (id: string, lang: Language) => void;
  appendLine: (custId: string, line: Omit<Line, 'id' | 'time'> & { time?: string }) => void;
  applyHazard: (custId: string, reported?: string) => ClaimFlow;
  runTools: (custId: string, steps: ToolStep[]) => void;
  runHazardPlan: (custId: string, reported: string, channel: 'chat' | 'call') => void;
  sendChatMessage: (text: string) => Promise<'person' | 'hazard' | 'ok'>;
  confirmClaimField: (custId: string, key: string, source: string | null) => void;
  submitClaim: (custId: string) => string;
  approveClaimDraft: (custId: string) => string | null;
  createContactRequest: (custId: string, channel: RequestChannel, topic: string, fromCall?: boolean) => string;
  acceptContactRequest: (id: string) => void;
  cancelContactRequest: (custId: string) => void;
  stepIn: (custId: string) => void;
  sendAgentMessage: (custId: string, text: string) => void;
  setPriorityOverride: (custId: string, tier: UrgencyLevel | null) => void;
  setCallStatus: (custId: string, s: CallStatus) => void;
  patchCustomer: (custId: string, p: Partial<CustomerProfile>) => void;
  resetToDefaults: () => void;
}

const StateFarmContext = createContext<Ctx | undefined>(undefined);

export const StateFarmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Server and first client render use the same mock data; localStorage is read after mount.
  const [state, setState] = useState<AppState>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const [lastSync, setLastSync] = useState(0);
  const stateRef = useRef(state);
  // Actions read the latest committed state from this ref (timeouts, async fetches).
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);
  const remote = useRef(false);
  const bc = useRef<BroadcastChannel | null>(null);
  const [dbStatus, setDbStatus] = useState<DbStatus>('connecting');
  const stdb = useRef<SpacetimeBridge | null>(null);

  // SpacetimeDB: rows from the module are merged into AppState; writes go through reducers below.
  useEffect(() => {
    let alive = true;
    const merge = (fn: (s: AppState) => AppState) => {
      if (!alive) return;
      setState(fn);
      setLastSync(Date.now());
    };
    connectSpacetime({
      onStatus: (s) => alive && setDbStatus(s),
      onClaim: (row) =>
        merge((s) => {
          const custId = custIdOf(row.customerId);
          const local = s.claims[custId];
          const dbStatus = claimStatusFromDb(row.status);
          // Never step backwards: local optimistic writes may be ahead of the server echo.
          const status = local && CLAIM_RANK[local.status] > CLAIM_RANK[dbStatus] ? local.status : dbStatus;
          return {
            ...s,
            claims: {
              ...s.claims,
              [custId]: {
                ...local,
                id: local?.id || 'DRF-' + row.id.toString().padStart(2, '0'),
                confirmed: local?.confirmed || {},
                status,
                type: row.hazardType || local?.type || '',
                amount: row.estPayout || local?.amount || 0,
                description: row.description || local?.description || '',
                number: row.claimNumber || local?.number,
              },
            },
          };
        }),
      onTriage: (row) =>
        merge((s) => {
          const custId = custIdOf(row.customerId);
          return {
            ...s,
            customers: s.customers.map((c) =>
              c.id === custId
                ? { ...c, riskScore: row.priorityScore, urgency: tierFromScore(row.priorityScore), detectedHazard: row.detectedHazard || c.detectedHazard }
                : c,
            ),
          };
        }),
      onPolicy: (row) =>
        merge((s) => {
          const custId = custIdOf(row.customerId);
          return {
            ...s,
            customers: s.customers.map((c) =>
              c.id === custId
                ? { ...c, policy: { ...c.policy, policyNumber: row.policyNumber, type: row.policyType, coverageLimit: row.coverageLimit, deductible: row.deductible } }
                : c,
            ),
          };
        }),
    }).then((b) => {
      if (alive) stdb.current = b;
      else b.disconnect();
    });
    return () => {
      alive = false;
      stdb.current?.disconnect();
      stdb.current = null;
    };
  }, []);

  useEffect(() => {
    // Hydration-safe load: server and first client render use mock data, then we read
    // localStorage here after mount. This setState is intentional.
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as AppState;
        if (parsed?.customers?.length && parsed.claims && parsed.stamps) {
          remote.current = true;
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setState(withDefaults(parsed));
        }
      }
    } catch {}
    setHydrated(true);

    const apply = (incoming: AppState) => {
      if (!incoming?.customers?.length) return;
      remote.current = true;
      setState((s) => {
        const merged = mergeState(s, withDefaults(incoming));
        try {
          localStorage.setItem(KEY, JSON.stringify(merged));
        } catch {}
        return merged;
      });
      setLastSync(Date.now());
    };
    try {
      bc.current = new BroadcastChannel(CHANNEL);
      bc.current.onmessage = (e) => e.data?.type === 'state' && apply(e.data.state);
    } catch {}
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY && e.newValue) {
        try {
          apply(JSON.parse(e.newValue));
        } catch {}
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      bc.current?.close();
    };
  }, []);

  // Persist + broadcast every local write (stand-in for SpacetimeDB reducers).
  useEffect(() => {
    if (!hydrated) return;
    if (remote.current) {
      remote.current = false;
      return;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      bc.current?.postMessage({ type: 'state', state });
    } catch {}
  }, [state, hydrated]);

  const update = (fn: (s: AppState) => AppState) => setState((s) => fn(s));
  const cust = (id: string) => stateRef.current.customers.find((c) => c.id === id)!;

  const patchCustomer: Ctx['patchCustomer'] = (custId, p) =>
    update((s) => touch({ ...s, customers: s.customers.map((c) => (c.id === custId ? { ...c, ...p } : c)) }, 'cu:' + custId));

  const appendLine: Ctx['appendLine'] = (custId, line) => {
    // Spoken/typed lines go to the module's live transcript (Nemotron/backends read it there).
    if ((line.kind === 'cust' || line.kind === 'ai' || line.kind === 'agent') && line.text) {
      const who = line.kind === 'cust' ? 'customer' : line.kind === 'ai' ? 'nora' : 'agent';
      stdb.current?.pushTranscript(custId, `[${who}] ${line.text}`);
    }
    update((s) => ({
      ...s,
      transcripts: {
        ...s.transcripts,
        [custId]: [...(s.transcripts[custId] || []), { ...line, id: uid(), time: line.time || nowTime() } as Line],
      },
    }));
  };

  const applyHazard: Ctx['applyHazard'] = (custId, reported) => {
    const c = cust(custId);
    const h = hazardFor(c, reported);
    const existing = stateRef.current.claims[custId];
    const claim: ClaimFlow =
      existing && existing.status !== 'none'
        ? existing
        : { id: 'DRF-99', status: 'draft', type: h.type, amount: h.amount, description: `Reported by policyholder: ${reported || h.hazard}`, confirmed: {} };
    update((s) =>
      touch(
        {
          ...s,
          claims: { ...s.claims, [custId]: claim },
          customers: s.customers.map((x) =>
            x.id === custId
              ? { ...x, riskScore: Math.min(98, x.riskScore + 10), urgency: 'High', detectedHazard: h.hazard, checkInStatus: 'urgent_attention' }
              : x,
          ),
        },
        'cu:' + custId,
      ),
    );
    const score = Math.min(98, c.riskScore + 10);
    stdb.current?.pushTriage(custId, score, h.type, `Reported by policyholder: ${reported || h.hazard}`, h.hazard);
    if (claim !== existing) stdb.current?.pushClaim(custId, claim, false);
    return claim;
  };

  const runTools: Ctx['runTools'] = (custId, steps) => {
    update((s) => touch({ ...s, toolRuns: { ...s.toolRuns, [custId]: steps.map((t) => ({ name: t.name, output: t.output, status: 'queued' })) } }, 'to:' + custId));
    const setStatus = (i: number, status: ToolCall['status']) =>
      update((s) =>
        touch({ ...s, toolRuns: { ...s.toolRuns, [custId]: (s.toolRuns[custId] || []).map((t, j) => (j === i ? { ...t, status } : t)) } }, 'to:' + custId),
      );
    steps.forEach((t, i) => {
      setTimeout(() => {
        if (stateRef.current.agentTakeover[custId]) return;
        setStatus(i, 'running');
      }, 600 * i + 50);
      setTimeout(() => {
        if (stateRef.current.agentTakeover[custId]) return setStatus(i, 'paused');
        setStatus(i, 'done');
        t.effect?.();
      }, 600 * i + 550);
    });
  };

  /** Default Nemotron plan for a hazard: risk → claim → emergency contact. */
  const hazardPlan = (custId: string, reported: string, channel: 'chat' | 'call'): ToolStep[] => {
    const c = cust(custId);
    const h = hazardFor(c, reported);
    return [
      { name: 'assess_risk_and_update_score', output: `risk ${c.riskScore} → ${Math.min(98, c.riskScore + 10)} · ${h.hazard}`, effect: () => applyHazard(custId, reported) },
      { name: 'auto_file_claim', output: `DRF-99 · ${h.type} · $${h.amount.toLocaleString()}`, effect: () => appendLine(custId, { kind: 'claim', text: '', channel }) },
      {
        name: 'trigger_emergency_contact',
        output: `SMS → ${c.emergencyContact.name} (${c.emergencyContact.relationship})`,
        effect: () => appendLine(custId, { kind: 'event', text: `trigger_emergency_contact → SMS sent to ${c.emergencyContact.name}`, dot: 'blue' }),
      },
    ];
  };

  const sendChatMessage: Ctx['sendChatMessage'] = async (text) => {
    const custId = stateRef.current.activeCustomerId;
    const c = cust(custId);
    appendLine(custId, { kind: 'cust', text, channel: 'chat' });
    if (/person|persona/i.test(text)) return 'person';
    try {
      const res = await fetch('/api/nemotron-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: custId,
          message: text,
          lang: c.language,
          customer: { name: c.name, age: c.age, livesAlone: c.livesAlone, hazard: c.detectedHazard, risk: c.riskScore, contact: c.emergencyContact.name },
        }),
      });
      if (!res.ok) throw new Error('bad response');
      const data: { reply: string; toolCalls: { name: string; output: string }[] } = await res.json();
      appendLine(custId, { kind: 'ai', text: data.reply, channel: 'chat' });
      if (data.toolCalls?.length) {
        const plan = hazardPlan(custId, text, 'chat');
        runTools(
          custId,
          data.toolCalls.map((tc) => ({ name: tc.name, output: tc.output, effect: plan.find((p) => p.name === tc.name)?.effect })),
        );
        return 'hazard';
      }
      return 'ok';
    } catch {
      // Offline fallback: keyword detection.
      const hz = reportsHazard(text);
      const frz = FREEZE_RE.test(text);
      const es = c.language === 'es';
      appendLine(custId, {
        kind: 'ai',
        channel: 'chat',
        text: hz
          ? frz
            ? es
              ? 'Parece una tubería congelada. No la descongele con fuego. Ya inicié un reclamo por daño de agua; no tiene que llenar formularios.'
              : 'That sounds like a frozen pipe. Please don’t thaw it with an open flame. I’ve started a water-damage claim for you, so you won’t need to fill in any forms.'
            : es
              ? 'Siento mucho lo que pasó. Por favor manténgase lejos de cualquier peligro. Ya inicié un reclamo; no tiene que llenar formularios.'
              : 'I’m sorry that happened. Please stay away from anything unsafe. I’ve started a claim for you, so you won’t need to fill in any forms.'
          : es
            ? 'Qué bueno. Si algo cambia, escríbame aquí o llámenos cuando quiera. Le escribo de nuevo en la mañana.'
            : 'Glad to hear it. If anything changes, message me here or call us any time. I’ll check in again in the morning.',
      });
      if (hz) runTools(custId, hazardPlan(custId, text, 'chat'));
      return hz ? 'hazard' : 'ok';
    }
  };

  const confirmClaimField: Ctx['confirmClaimField'] = (custId, key, source) =>
    update((s) => {
      const cl = s.claims[custId];
      if (!cl) return s;
      const confirmed = { ...cl.confirmed };
      if (source) confirmed[key] = source;
      else delete confirmed[key];
      return { ...s, claims: { ...s.claims, [custId]: { ...cl, confirmed } } };
    });

  const submitClaim: Ctx['submitClaim'] = (custId) => {
    const cl = stateRef.current.claims[custId];
    const num = cl?.number || 'SF-CLM-2026-' + String(4000 + Math.floor(Math.random() * 999));
    update((s) => ({
      ...s,
      claims: { ...s.claims, [custId]: { ...s.claims[custId], status: s.claims[custId].status === 'approved' ? 'approved' : 'submitted', number: num, submittedAt: nowTime() } },
    }));
    // Customer consent → module status PENDING_AGENT_SUBMIT.
    if (cl) stdb.current?.pushClaim(custId, cl, true);
    appendLine(custId, { kind: 'event', text: `Policyholder submitted ${cl?.id} → ${num}`, dot: 'lavender' });
    return num;
  };

  const approveClaimDraft: Ctx['approveClaimDraft'] = (custId) => {
    const cl = stateRef.current.claims[custId];
    if (!cl || cl.status === 'none' || cl.status === 'approved') return null;
    const num = cl.number || 'SF-CLM-2026-' + String(4000 + Math.floor(Math.random() * 999));
    update((s) => ({
      ...s,
      claims: { ...s.claims, [custId]: { ...s.claims[custId], status: 'approved', number: num, approvedAt: nowTime() } },
      customers: s.customers.map((x) => (x.id === custId ? { ...x, checkInStatus: 'completed' } : x)),
    }));
    update((s) => touch(s, 'cu:' + custId));
    // agent_approve_claim only fires when customer_approved is set, so make sure it is first
    // (the agent can approve a draft the policyholder confirmed verbally on the call).
    stdb.current?.pushClaim(custId, cl, true);
    stdb.current?.pushApprove(custId, num);
    appendLine(custId, { kind: 'event', text: `${cl.id} approved → ${num} · crew dispatched`, dot: 'blue' });
    return num;
  };

  const createContactRequest: Ctx['createContactRequest'] = (custId, channel, topic, fromCall) => {
    const s0 = stateRef.current;
    const id = 'HN-REQ-' + (1041 + s0.reqSeq);
    const req: ContactRequest = {
      id,
      custId,
      channel,
      topic,
      lang: cust(custId).language,
      status: 'waiting',
      createdAt: Date.now(),
      position: s0.contactRequests.filter((r) => r.status === 'waiting').length + 1,
      fromCall,
    };
    update((s) => ({ ...s, reqSeq: s.reqSeq + 1, contactRequests: [...s.contactRequests.filter((r) => !(r.custId === custId && r.status !== 'closed')), req] }));
    appendLine(custId, { kind: 'event', text: `${id} · wants a person · ${channel}${fromCall ? ' (transfer from Nora call)' : ''}`, dot: 'red' });
    return id;
  };

  const stepIn: Ctx['stepIn'] = (custId) => {
    const s0 = stateRef.current;
    if (s0.agentTakeover[custId]) return;
    const c = cust(custId);
    const cl = s0.claims[custId];
    const items = [
      `${first(c.name)}, ${c.age}, ${c.livesAlone ? 'lives alone' : 'not alone'}, prefers ${c.language === 'es' ? 'Spanish' : 'English'}.`,
      `Hazard: ${c.detectedHazard}. Risk ${c.riskScore}.`,
      (s0.toolRuns[custId] || []).length ? `Nora ran ${(s0.toolRuns[custId] || []).filter((t) => t.status === 'done').map((t) => t.name).join(', ') || 'no tools yet'}.` : 'No Nora tool run yet.',
      cl && cl.status !== 'none' ? `Claim ${cl.number || cl.id} (${cl.status}) · $${cl.amount.toLocaleString()} · ${cl.type}.` : 'No claim drafted.',
      `Next: confirm safety, then ${cl?.status === 'draft' || cl?.status === 'submitted' ? 'approve the claim and dispatch' : 'decide whether to open a claim'}.`,
    ];
    update((s) =>
      touch(
        {
          ...s,
          agentTakeover: { ...s.agentTakeover, [custId]: true },
          callStatus: { ...s.callStatus, [custId]: 'agent' },
          toolRuns: { ...s.toolRuns, [custId]: (s.toolRuns[custId] || []).map((t) => (t.status === 'done' ? t : { ...t, status: 'paused' })) },
        },
        'cs:' + custId,
        'to:' + custId,
      ),
    );
    appendLine(custId, { kind: 'handoff', text: '', items });
    appendLine(custId, { kind: 'event', text: 'Jordan M. joined · Nora paused', dot: 'blue' });
  };

  const acceptContactRequest: Ctx['acceptContactRequest'] = (id) => {
    const r = stateRef.current.contactRequests.find((x) => x.id === id);
    if (!r) return;
    update((s) => ({ ...s, contactRequests: s.contactRequests.map((x) => (x.id === id ? { ...x, status: 'accepted' } : x)) }));
    stepIn(r.custId);
    appendLine(r.custId, { kind: 'event', text: `Accepted ${r.id} · ${r.channel} · ${r.topic}`, dot: 'red' });
  };

  const cancelContactRequest: Ctx['cancelContactRequest'] = (custId) =>
    update((s) => ({ ...s, contactRequests: s.contactRequests.filter((r) => !(r.custId === custId && r.status !== 'closed')) }));

  const sendAgentMessage: Ctx['sendAgentMessage'] = (custId, text) => {
    appendLine(custId, { kind: 'agent', text, channel: 'call' });
    // Background demo customers answer on their own; the active policyholder answers from the portal.
    if (custId !== stateRef.current.activeCustomerId) {
      const es = cust(custId).language === 'es';
      setTimeout(
        () => appendLine(custId, { kind: 'cust', channel: 'call', text: es ? 'Gracias, mijo. Muy amable.' : 'Oh, thank you. It’s nice to hear a real person.', tr: es ? 'Thank you, dear. Very kind.' : undefined }),
        1600,
      );
    }
  };

  const setPriorityOverride: Ctx['setPriorityOverride'] = (custId, tier) => {
    update((s) => touch({ ...s, priorityOverride: { ...s.priorityOverride, [custId]: tier } }, 'po:' + custId));
    appendLine(custId, { kind: 'event', text: tier ? `Priority set to ${tier} by Jordan M.` : 'Priority returned to AI ranking', dot: 'lavender' });
  };

  const setCallStatus: Ctx['setCallStatus'] = (custId, cs) => update((s) => touch({ ...s, callStatus: { ...s.callStatus, [custId]: cs } }, 'cs:' + custId));

  const resetToDefaults = () => {
    try {
      localStorage.removeItem(KEY);
    } catch {}
    const fresh = { ...initialState(), epoch: Date.now() };
    stateRef.current = fresh;
    setState(fresh);
  };

  const value: Ctx = {
    ...state,
    hydrated,
    lastSync,
    dbStatus,
    activeCustomer: state.customers.find((c) => c.id === state.activeCustomerId) || state.customers[0],
    setActiveCustomerId: (id) => update((s) => touch({ ...s, activeCustomerId: id }, 'active')),
    updateCustomerLanguage: (id, lang) => patchCustomer(id, { language: lang }),
    appendLine,
    applyHazard,
    runTools,
    runHazardPlan: (custId, reported, channel) => runTools(custId, hazardPlan(custId, reported, channel)),
    sendChatMessage,
    confirmClaimField,
    submitClaim,
    approveClaimDraft,
    createContactRequest,
    acceptContactRequest,
    cancelContactRequest,
    stepIn,
    sendAgentMessage,
    setPriorityOverride,
    setCallStatus,
    patchCustomer,
    resetToDefaults,
  };

  return <StateFarmContext.Provider value={value}>{children}</StateFarmContext.Provider>;
};

export const useStore = () => {
  const context = useContext(StateFarmContext);
  if (!context) throw new Error('useStore must be used within StateFarmProvider');
  return context;
};
