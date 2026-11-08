'use client';

import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { DbConnection } from '@/module_bindings';
import type { ActiveCall, Claim, Customer, Policy, TriageQueue } from '@/module_bindings/types';

/**
 * Data model
 * ----------
 * SpacetimeDB is the source of truth for customers, policies, triage, calls and claims. Rows are
 * mirrored live from the tables and merged over the mock profiles. Only rows tied to a customer's
 * *open* call count, so a finished call (end_call) never leaks into the next one.
 *
 * Chat turns go to the FastAPI orchestrator (backend/main.py), which runs Nemotron and writes the
 * transcript, triage ticket and claim itself. If it isn't running we fall back to the Next.js
 * Nemotron route, then to an offline reply.
 *
 * Things the database doesn't model (transfer requests, agent takeover, claim confirmations, the
 * running tool list, language, events in the transcript) live in a small UI layer that is saved to
 * localStorage and shared between tabs with BroadcastChannel, so the portal and the agent console
 * stay in step. Spoken lines are written to the database in the same "Customer:/AI:/Agent:" format
 * the orchestrator uses.
 */

const DB_URI = process.env.NEXT_PUBLIC_SPACETIME_URI || 'wss://maincloud.spacetimedb.com';
const DB_NAME = process.env.NEXT_PUBLIC_SPACETIME_DB || 'c20029daa0df66e41fc3af91cac6f9bbd41ec925bd4dc1e4f6e1ce4d89592aa2';
const DB_ENABLED = process.env.NEXT_PUBLIC_SPACETIME !== 'off';
const ORCHESTRATOR = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:8000';

const KEY = 'hn_ui_v1';
const CHANNEL = 'hn_demo';

const CLAIM_RANK: Record<ClaimFlow['status'], number> = { none: 0, draft: 1, submitted: 2, approved: 3 };
const REQ_RANK = { waiting: 0, accepted: 1, closed: 2 } as const;

/** 'cust-3' ⇄ 3 (the Rust seed's customer ids). */
const dbIdOf = (custId: string) => BigInt(custId.replace(/^cust-/, '') || '0');
const tierOf = (score: number): UrgencyLevel => (score >= 80 ? 'High' : score >= 40 ? 'Medium' : 'Low');
const newCallId = () => BigInt(Date.now() % 1_000_000_000);

export type DbStatus = 'connecting' | 'connected' | 'error' | 'off';

/* ------------------------------------------------------------------ */
/* UI layer (not in the database)                                      */
/* ------------------------------------------------------------------ */

interface UiState {
  activeCustomerId: string;
  /** Claims as the UI knows them (seeded drafts, confirmations). Database claims merge over these. */
  claims: Record<string, ClaimFlow>;
  contactRequests: ContactRequest[];
  agentTakeover: Record<string, boolean>;
  /** Local transcript lines (incl. events, handoff and claim cards). Database lines merge in. */
  transcripts: Record<string, Line[]>;
  toolRuns: Record<string, ToolCall[]>;
  priorityOverride: Record<string, UrgencyLevel | null>;
  callStatus: Record<string, CallStatus>;
  /** Local edits to a profile (language, check-in status, risk bump from a reported hazard). */
  patches: Record<string, Partial<CustomerProfile>>;
  reqSeq: number;
  /** Bumped by Reset so other tabs drop their old state instead of merging it back in. */
  epoch: number;
  /** Last-write time per slot (e.g. "cs:cust-1"), so tabs can merge instead of overwriting. */
  stamps: Record<string, number>;
}

/** What components see: database rows merged over the mock profiles, plus the UI layer. */
export interface AppState extends Omit<UiState, 'patches'> {
  customers: CustomerProfile[];
}

/** English translations for the seeded Spanish chat (shown under Spanish lines in the agent console). */
const SEED_TR: Record<string, string> = {
  'cust-1:msg-1': 'Hi, Doña Sofía! State Farm check-in for the 14°F freeze. How are the pipes?',
  'cust-1:msg-2': 'Hi. It’s very cold. I opened the tap and almost no water comes out. There’s banging under the sink.',
  'cust-1:msg-3': 'Risk alert: possible freezing. Leave the faucet dripping and open the cabinets. I’ve prepared a preventive claim.',
};

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);

function initialUi(): UiState {
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
    activeCustomerId: initialCustomers[0].id,
    claims,
    contactRequests: [],
    agentTakeover: {},
    transcripts,
    toolRuns: {},
    priorityOverride: {},
    callStatus: { 'cust-1': 'ringing', 'cust-6': 'ai', 'cust-2': 'ai' },
    patches: {},
    reqSeq: 0,
    epoch: 0,
    stamps: {},
  };
}

/** Fill fields added after a snapshot was saved, so nothing reads undefined. */
const withDefaults = (s: UiState): UiState => ({ ...initialUi(), ...s, patches: s.patches ?? {}, stamps: s.stamps ?? {}, epoch: s.epoch ?? 0 });

/**
 * Tabs broadcast whole snapshots. Taking the newest wholesale loses writes when two tabs act at
 * once, so merge: transcripts and requests are unioned, claims never move backwards, and keyed
 * slots keep whichever side wrote last.
 */
function mergeUi(local: UiState, remote: UiState): UiState {
  if ((remote.epoch || 0) !== (local.epoch || 0)) return (remote.epoch || 0) > (local.epoch || 0) ? remote : local;
  const ls = local.stamps || {};
  const rs = remote.stamps || {};
  const newer = (k: string) => (rs[k] || 0) >= (ls[k] || 0);
  const pick = <T,>(k: string, l: T, r: T) => (newer(k) ? r : l);

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

  const ids = new Set([...Object.keys(local.callStatus), ...Object.keys(remote.callStatus), ...initialCustomers.map((c) => c.id)]);
  const callStatus = { ...local.callStatus };
  const priorityOverride = { ...local.priorityOverride };
  const toolRuns = { ...local.toolRuns };
  const patches = { ...local.patches };
  for (const id of ids) {
    callStatus[id] = pick('cs:' + id, local.callStatus[id], remote.callStatus[id]);
    priorityOverride[id] = pick('po:' + id, local.priorityOverride[id], remote.priorityOverride[id]);
    toolRuns[id] = pick('to:' + id, local.toolRuns[id], remote.toolRuns[id]);
    patches[id] = pick('cu:' + id, local.patches[id], remote.patches[id]);
  }
  const stamps = { ...ls };
  for (const [k, v] of Object.entries(rs)) stamps[k] = Math.max(v, stamps[k] || 0);

  return {
    ...remote,
    activeCustomerId: pick('active', local.activeCustomerId, remote.activeCustomerId),
    claims,
    contactRequests: [...reqs.values()],
    agentTakeover: { ...local.agentTakeover, ...remote.agentTakeover },
    transcripts,
    toolRuns,
    priorityOverride,
    callStatus,
    patches,
    reqSeq: Math.max(local.reqSeq, remote.reqSeq),
    stamps,
  };
}

/** Mark slots as written now. */
const touch = (s: UiState, ...keys: string[]): UiState => {
  const t = Date.now();
  const stamps = { ...(s.stamps || {}) };
  keys.forEach((k) => (stamps[k] = t));
  return { ...s, stamps };
};

/** Module claim row → UI status (SUBMITTED means the agent approved it). */
const claimStatusOf = (row: Claim): ClaimFlow['status'] => (row.status === 'SUBMITTED' ? 'approved' : row.customerApproved ? 'submitted' : 'draft');

/** "AI: hello\nCustomer: hi" → lines. */
function parseTranscript(call: ActiveCall): Line[] {
  return call.liveTranscript
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((raw, i) => {
      const kind: Line['kind'] = /^AI:/i.test(raw) ? 'ai' : /^Agent:/i.test(raw) ? 'agent' : 'cust';
      return { id: `db-${call.id}-${i}`, kind, text: raw.replace(/^(AI|Customer|Agent):\s*/i, ''), time: '', channel: 'call' };
    });
}

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

export interface ToolStep {
  name: string;
  output: string;
  effect?: () => void;
}

interface Ctx extends AppState {
  hydrated: boolean;
  lastSync: number;
  dbStatus: DbStatus;
  activeCustomer: CustomerProfile;
  setActiveCustomerId: (id: string) => void;
  updateCustomerLanguage: (id: string, lang: Language) => void;
  /** `synced`: the line is already in the database (e.g. written by the orchestrator). */
  appendLine: (custId: string, line: Omit<Line, 'id' | 'time'> & { time?: string }, opts?: { synced?: boolean }) => void;
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
  /* ---------------- SpacetimeDB rows ---------------- */
  const [dbStatus, setDbStatus] = useState<DbStatus>(DB_ENABLED ? 'connecting' : 'off');
  const [conn, setConn] = useState<DbConnection | null>(null);
  const [dbCustomers, setDbCustomers] = useState<Customer[]>([]);
  const [dbPolicies, setDbPolicies] = useState<Policy[]>([]);
  const [dbClaims, setDbClaims] = useState<Claim[]>([]);
  const [dbTriage, setDbTriage] = useState<TriageQueue[]>([]);
  const [dbActiveCalls, setDbActiveCalls] = useState<ActiveCall[]>([]);
  const [lastSync, setLastSync] = useState(0);

  /* ---------------- UI layer ---------------- */
  const [ui, setUi] = useState<UiState>(initialUi);
  const [hydrated, setHydrated] = useState(false);
  const remote = useRef(false);
  const bc = useRef<BroadcastChannel | null>(null);
  /** Call id this tab started for a customer before the database echoed it back. */
  const pendingCall = useRef<Record<string, bigint>>({});

  // 1. SpacetimeDB live connection (one per tab).
  useEffect(() => {
    if (!DB_ENABLED) return;
    let active = true;
    let connection: DbConnection | null = null;
    const upsert = <T,>(set: React.Dispatch<React.SetStateAction<T[]>>, same: (a: T, b: T) => boolean) => (row: T) => {
      if (!active) return;
      set((prev) => [...prev.filter((x) => !same(x, row)), row]);
      setLastSync(Date.now());
    };
    try {
      connection = DbConnection.builder()
        .withUri(DB_URI)
        .withDatabaseName(DB_NAME)
        .onConnect((c) => {
          if (!active) return;
          setDbStatus('connected');
          c.subscriptionBuilder()
            .onError(() => active && setDbStatus('error'))
            .subscribe(['SELECT * FROM customers', 'SELECT * FROM policies', 'SELECT * FROM active_calls', 'SELECT * FROM triage_queue', 'SELECT * FROM claims']);
        })
        .onConnectError(() => active && setDbStatus('error'))
        .onDisconnect(() => active && setDbStatus('off'))
        .build();

      const cust = upsert(setDbCustomers, (a, b) => a.id === b.id);
      const pol = upsert(setDbPolicies, (a, b) => a.policyId === b.policyId);
      const clm = upsert(setDbClaims, (a, b) => a.id === b.id);
      const tri = upsert(setDbTriage, (a, b) => a.ticketId === b.ticketId);
      const cal = upsert(setDbActiveCalls, (a, b) => a.id === b.id);
      connection.db.customers.onInsert((_c, r) => cust(r));
      connection.db.customers.onUpdate((_c, _o, r) => cust(r));
      connection.db.policies.onInsert((_c, r) => pol(r));
      connection.db.policies.onUpdate((_c, _o, r) => pol(r));
      connection.db.claims.onInsert((_c, r) => clm(r));
      connection.db.claims.onUpdate((_c, _o, r) => clm(r));
      connection.db.triageQueue.onInsert((_c, r) => tri(r));
      connection.db.triageQueue.onUpdate((_c, _o, r) => tri(r));
      connection.db.activeCalls.onInsert((_c, r) => cal(r));
      connection.db.activeCalls.onUpdate((_c, _o, r) => cal(r));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConn(connection);
    } catch (err) {
      console.error('[SpacetimeDB connection failed]', err);
      setDbStatus('error');
    }
    return () => {
      active = false;
      connection?.disconnect();
    };
  }, []);

  // 2. UI layer: load once, then share between tabs.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as UiState;
        if (parsed?.claims && parsed.stamps) {
          remote.current = true;
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setUi(withDefaults(parsed));
        }
      }
    } catch {}
    setHydrated(true);

    const apply = (incoming: UiState) => {
      if (!incoming?.claims) return;
      remote.current = true;
      setUi((s) => {
        const merged = mergeUi(s, withDefaults(incoming));
        try {
          localStorage.setItem(KEY, JSON.stringify(merged));
        } catch {}
        return merged;
      });
      setLastSync(Date.now());
    };
    try {
      bc.current = new BroadcastChannel(CHANNEL);
      bc.current.onmessage = (e) => e.data?.type === 'ui' && apply(e.data.state);
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

  // Persist + broadcast every local UI write.
  useEffect(() => {
    if (!hydrated) return;
    if (remote.current) {
      remote.current = false;
      return;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(ui));
      bc.current?.postMessage({ type: 'ui', state: ui });
    } catch {}
  }, [ui, hydrated]);

  /* ---------------- 3. Merge: database over mock profiles, UI layer on top ---------------- */
  const { customers, claims, transcripts, openCall } = useMemo(() => {
    const claimsOut: Record<string, ClaimFlow> = {};
    const linesOut: Record<string, Line[]> = {};
    const openCallOut: Record<string, ActiveCall | undefined> = {};

    const customersOut = initialCustomers.map((base) => {
      const id = base.id;
      const n = dbIdOf(id);
      const p = ui.patches[id] || {};
      // The customer's current call session; rows from finished calls are ignored.
      const call = dbActiveCalls.filter((a) => a.customerId === n && a.status !== 'completed').sort((a, b) => Number(b.id - a.id))[0];
      openCallOut[id] = call;
      const triage = call ? dbTriage.filter((t) => t.callId === call.id).sort((a, b) => Number(b.ticketId - a.ticketId))[0] : undefined;
      const dbClaim = call ? dbClaims.filter((c) => c.callId === call.id).sort((a, b) => Number(b.id - a.id))[0] : undefined;
      // Home policy first (a customer can also hold an auto policy).
      const policy = dbPolicies.filter((x) => x.customerId === n).sort((a, b) => Number(a.policyId - b.policyId))[0];
      const dbCust = dbCustomers.find((x) => x.id === n);

      // Claim: database row (if any) over the UI's claim; status never steps backwards.
      const local = ui.claims[id];
      if (dbClaim) {
        const dbSt = claimStatusOf(dbClaim);
        const status = local && CLAIM_RANK[local.status] > CLAIM_RANK[dbSt] ? local.status : dbSt;
        claimsOut[id] = {
          ...local,
          id: local?.id && local.status !== 'none' ? local.id : `CLM-${dbClaim.id}`,
          status,
          number: dbClaim.claimNumber || local?.number,
          type: dbClaim.hazardType || local?.type || '',
          amount: dbClaim.estPayout || local?.amount || 0,
          description: dbClaim.description || local?.description || '',
          confirmed: local?.confirmed || {},
        };
      } else {
        claimsOut[id] = local || { id: 'DRF-NONE', status: 'none', type: '', amount: 0, description: '', confirmed: {} };
      }

      // Transcript: local lines, plus any spoken lines that only exist in the database
      // (e.g. written by the orchestrator or another device).
      const mine = ui.transcripts[id] || [];
      const unused = new Map<string, number>();
      for (const l of mine) if (l.kind === 'ai' || l.kind === 'cust' || l.kind === 'agent') unused.set(l.kind + l.text, (unused.get(l.kind + l.text) || 0) + 1);
      const extra = (call ? parseTranscript(call) : []).filter((l) => {
        const k = l.kind + l.text;
        const left = unused.get(k) || 0;
        if (left > 0) {
          unused.set(k, left - 1);
          return false;
        }
        return true;
      });
      linesOut[id] = [...mine, ...extra];

      const score = p.riskScore ?? triage?.priorityScore ?? base.riskScore;
      return {
        ...base,
        name: dbCust?.name || base.name,
        ...p,
        riskScore: score,
        urgency: p.urgency ?? (triage ? tierOf(score) : base.urgency),
        detectedHazard: p.detectedHazard ?? (triage?.detectedHazard || base.detectedHazard),
        policy: policy
          ? { ...base.policy, policyNumber: policy.policyNumber, type: policy.policyType, coverageLimit: policy.coverageLimit, deductible: policy.deductible }
          : base.policy,
      } as CustomerProfile;
    });

    return { customers: customersOut, claims: claimsOut, transcripts: linesOut, openCall: openCallOut };
  }, [ui, dbCustomers, dbPolicies, dbClaims, dbTriage, dbActiveCalls]);

  // Latest values for actions that run later (timeouts, async fetches).
  const live = useRef({ ui, customers, claims, openCall, conn, dbClaims, dbTriage, dbPolicies });
  useLayoutEffect(() => {
    live.current = { ui, customers, claims, openCall, conn, dbClaims, dbTriage, dbPolicies };
  });

  const update = (fn: (s: UiState) => UiState) => setUi((s) => fn(s));
  const cust = (id: string) => live.current.customers.find((c) => c.id === id) || initialCustomers.find((c) => c.id === id)!;

  /* ---------------- Database writes (fire-and-forget) ---------------- */
  const dbCall = (p: Promise<void> | undefined) => void p?.catch((e) => console.warn('[SpacetimeDB reducer]', e));
  /** Ids of the customer's current session: open call (or one this tab started), its ticket and claim. */
  const session = (custId: string) => {
    const L = live.current;
    const callId = L.openCall[custId]?.id ?? (pendingCall.current[custId] ||= newCallId());
    const ticketId = L.dbTriage.filter((t) => t.callId === callId).sort((a, b) => Number(b.ticketId - a.ticketId))[0]?.ticketId ?? callId;
    const claimId = L.dbClaims.filter((c) => c.callId === callId).sort((a, b) => Number(b.id - a.id))[0]?.id ?? callId;
    const n = dbIdOf(custId);
    const policyId = L.dbPolicies.filter((x) => x.customerId === n).sort((a, b) => Number(a.policyId - b.policyId))[0]?.policyId ?? n;
    return { callId, ticketId, claimId, policyId, customerId: n };
  };
  const pushClaim = (custId: string, cl: ClaimFlow, customerApproved: boolean) => {
    const c = live.current.conn;
    if (!c) return;
    const s = session(custId);
    dbCall(
      c.reducers.createOrUpdateClaim({
        claimId: s.claimId,
        customerId: s.customerId,
        policyId: s.policyId,
        callId: s.callId,
        description: cl.description,
        hazardType: cl.type,
        estPayout: cl.amount,
        customerApproved,
      }),
    );
  };

  /* ---------------- Actions ---------------- */
  const patchCustomer: Ctx['patchCustomer'] = (custId, p) =>
    update((s) => touch({ ...s, patches: { ...s.patches, [custId]: { ...s.patches[custId], ...p } } }, 'cu:' + custId));

  const appendLine: Ctx['appendLine'] = (custId, line, opts) => {
    const c = live.current.conn;
    if (c && !opts?.synced && (line.kind === 'cust' || line.kind === 'ai' || line.kind === 'agent') && line.text) {
      const who = line.kind === 'cust' ? 'Customer' : line.kind === 'ai' ? 'AI' : 'Agent';
      const s = session(custId);
      dbCall(c.reducers.updateCallTranscript({ callId: s.callId, customerId: s.customerId, transcriptChunk: `${who}: ${line.text}` }));
    }
    update((s) => ({
      ...s,
      transcripts: { ...s.transcripts, [custId]: [...(s.transcripts[custId] || []), { ...line, id: uid(), time: line.time || nowTime() } as Line] },
    }));
  };

  const applyHazard: Ctx['applyHazard'] = (custId, reported) => {
    const c = cust(custId);
    const h = hazardFor(c, reported);
    const existing = live.current.claims[custId];
    const claim: ClaimFlow =
      existing && existing.status !== 'none'
        ? existing
        : { id: 'DRF-99', status: 'draft', type: h.type, amount: h.amount, description: `Reported by policyholder: ${reported || h.hazard}`, confirmed: {} };
    const score = Math.min(98, c.riskScore + 10);
    update((s) =>
      touch(
        {
          ...s,
          claims: { ...s.claims, [custId]: claim },
          patches: { ...s.patches, [custId]: { ...s.patches[custId], riskScore: score, urgency: 'High', detectedHazard: h.hazard, checkInStatus: 'urgent_attention' } },
        },
        'cu:' + custId,
      ),
    );
    const conn0 = live.current.conn;
    if (conn0) {
      const s = session(custId);
      dbCall(
        conn0.reducers.updateTriageScore({
          ticketId: s.ticketId,
          customerId: s.customerId,
          callId: s.callId,
          priorityScore: score,
          category: h.type,
          summaryReason: `Reported by policyholder: ${reported || h.hazard}`,
          detectedHazard: h.hazard,
        }),
      );
      if (claim !== existing) pushClaim(custId, claim, false);
    }
    return claim;
  };

  const runTools: Ctx['runTools'] = (custId, steps) => {
    update((s) => touch({ ...s, toolRuns: { ...s.toolRuns, [custId]: steps.map((t) => ({ name: t.name, output: t.output, status: 'queued' })) } }, 'to:' + custId));
    const setStatus = (i: number, status: ToolCall['status']) =>
      update((s) => touch({ ...s, toolRuns: { ...s.toolRuns, [custId]: (s.toolRuns[custId] || []).map((t, j) => (j === i ? { ...t, status } : t)) } }, 'to:' + custId));
    steps.forEach((t, i) => {
      setTimeout(() => {
        if (live.current.ui.agentTakeover[custId]) return;
        setStatus(i, 'running');
      }, 600 * i + 50);
      setTimeout(() => {
        if (live.current.ui.agentTakeover[custId]) return setStatus(i, 'paused');
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
    const custId = live.current.ui.activeCustomerId;
    const c = cust(custId);
    if (/person|persona/i.test(text)) {
      appendLine(custId, { kind: 'cust', text, channel: 'chat' });
      return 'person';
    }

    // 1) FastAPI orchestrator: runs Nemotron and writes transcript, triage and claim itself.
    try {
      const s = session(custId);
      const res = await fetch(`${ORCHESTRATOR}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: Number(s.customerId), user_transcript: text, call_id: Number(s.callId) }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`orchestrator responded ${res.status}`);
      const data: { reply?: string; bot_reply?: string; call_id?: number } = await res.json();
      const reply = data.reply || data.bot_reply;
      if (!reply) throw new Error('empty reply');
      if (data.call_id) pendingCall.current[custId] = BigInt(data.call_id);
      appendLine(custId, { kind: 'cust', text, channel: 'chat' }, { synced: true });
      appendLine(custId, { kind: 'ai', text: reply, channel: 'chat' }, { synced: true });
      if (reportsHazard(text)) {
        // Same visible steps as the other paths (risk, claim card, emergency contact).
        runTools(custId, hazardPlan(custId, text, 'chat'));
        return 'hazard';
      }
      return 'ok';
    } catch (err) {
      console.warn('[FastAPI orchestrator unavailable, using built-in Nemotron route]', err);
    }

    appendLine(custId, { kind: 'cust', text, channel: 'chat' });
    // 2) Next.js Nemotron route (NVIDIA NIM, or its own simulation without a key).
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
      // 3) Offline reply.
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
      const cl = s.claims[custId] || live.current.claims[custId];
      if (!cl) return s;
      const confirmed = { ...cl.confirmed };
      if (source) confirmed[key] = source;
      else delete confirmed[key];
      return { ...s, claims: { ...s.claims, [custId]: { ...cl, confirmed } } };
    });

  const submitClaim: Ctx['submitClaim'] = (custId) => {
    const cl = live.current.claims[custId];
    const num = cl?.number || 'SF-CLM-2026-' + String(4000 + Math.floor(Math.random() * 999));
    update((s) => {
      const cur = s.claims[custId] || cl;
      return { ...s, claims: { ...s.claims, [custId]: { ...cur, status: cur.status === 'approved' ? 'approved' : 'submitted', number: num, submittedAt: nowTime() } } };
    });
    // Verbal consent on the call → customer_approved (module status PENDING_AGENT_SUBMIT).
    if (cl) pushClaim(custId, cl, true);
    appendLine(custId, { kind: 'event', text: `Policyholder submitted ${cl?.id} → ${num}`, dot: 'lavender' });
    return num;
  };

  const approveClaimDraft: Ctx['approveClaimDraft'] = (custId) => {
    const cl = live.current.claims[custId];
    if (!cl || cl.status === 'none' || cl.status === 'approved') return null;
    const num = cl.number || 'SF-CLM-2026-' + String(4000 + Math.floor(Math.random() * 999));
    update((s) =>
      touch(
        {
          ...s,
          claims: { ...s.claims, [custId]: { ...(s.claims[custId] || cl), status: 'approved', number: num, approvedAt: nowTime() } },
          patches: { ...s.patches, [custId]: { ...s.patches[custId], checkInStatus: 'completed' } },
        },
        'cu:' + custId,
      ),
    );
    // agent_approve_claim needs customer_approved first (the agent can approve what was confirmed by voice).
    const c = live.current.conn;
    if (c) {
      pushClaim(custId, cl, true);
      dbCall(c.reducers.agentApproveClaim({ claimId: session(custId).claimId, claimNumber: num }));
    }
    appendLine(custId, { kind: 'event', text: `${cl.id} approved → ${num} · crew dispatched`, dot: 'blue' });
    return num;
  };

  const createContactRequest: Ctx['createContactRequest'] = (custId, channel, topic, fromCall) => {
    const s0 = live.current.ui;
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
    const L = live.current;
    if (L.ui.agentTakeover[custId]) return;
    const c = cust(custId);
    const cl = L.claims[custId];
    const runs = L.ui.toolRuns[custId] || [];
    const items = [
      `${first(c.name)}, ${c.age}, ${c.livesAlone ? 'lives alone' : 'not alone'}, prefers ${c.language === 'es' ? 'Spanish' : 'English'}.`,
      `Hazard: ${c.detectedHazard}. Risk ${c.riskScore}.`,
      runs.length ? `Nora ran ${runs.filter((t) => t.status === 'done').map((t) => t.name).join(', ') || 'no tools yet'}.` : 'No Nora tool run yet.',
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
    // Mutes the AI on the call and marks the triage ticket AGENT_CONNECTED.
    if (L.conn) dbCall(L.conn.reducers.joinCallByAgent({ callId: session(custId).callId }));
    appendLine(custId, { kind: 'handoff', text: '', items });
    appendLine(custId, { kind: 'event', text: 'Jordan M. joined · Nora paused', dot: 'blue' });
  };

  const acceptContactRequest: Ctx['acceptContactRequest'] = (id) => {
    const r = live.current.ui.contactRequests.find((x) => x.id === id);
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
    if (custId !== live.current.ui.activeCustomerId) {
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

  const setCallStatus: Ctx['setCallStatus'] = (custId, cs) => {
    const L = live.current;
    if (cs === 'ended' && L.ui.callStatus[custId] !== 'ended') {
      // Close the session in the database so the next call starts clean.
      const callId = L.openCall[custId]?.id ?? pendingCall.current[custId];
      if (L.conn && callId !== undefined) dbCall(L.conn.reducers.endCall({ callId }));
      delete pendingCall.current[custId];
    }
    update((s) => touch({ ...s, callStatus: { ...s.callStatus, [custId]: cs } }, 'cs:' + custId));
  };

  const resetToDefaults = () => {
    // End every open call so the database doesn't feed the last run back in.
    const L = live.current;
    if (L.conn) for (const call of Object.values(L.openCall)) if (call) dbCall(L.conn.reducers.endCall({ callId: call.id }));
    pendingCall.current = {};
    try {
      localStorage.removeItem(KEY);
    } catch {}
    setUi({ ...initialUi(), epoch: Date.now() });
  };

  const activeCustomer = customers.find((c) => c.id === ui.activeCustomerId) || customers[0] || initialCustomers[0];
  const { patches: _patches, ...uiRest } = ui;
  void _patches;

  const value: Ctx = {
    ...uiRest,
    customers,
    claims,
    transcripts,
    hydrated,
    lastSync,
    dbStatus,
    activeCustomer,
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
