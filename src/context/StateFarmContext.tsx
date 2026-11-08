'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useMemo,
} from 'react';
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
import { first, hazardFor, HAZARD_RE, nowTime } from '@/lib/hn';
import { DbConnection } from '@/module_bindings';
import type { Customer, Policy, Claim, TriageQueue, ActiveCall } from '@/module_bindings/types';

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
  catMode: { on: boolean; name: string; at?: number };
  epoch: number;
  stamps: Record<string, number>;
}

export interface ToolStep {
  name: string;
  output: string;
  effect?: () => void;
}

export type DbStatus = 'connecting' | 'connected' | 'error' | 'off';

interface Ctx extends AppState {
  hydrated: boolean;
  lastSync: number;
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
  setCatMode: (on: boolean) => void;
  resetToDefaults: () => void;
}

const StateFarmContext = createContext<Ctx | undefined>(undefined);

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);

export const StateFarmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dbStatus, setDbStatus] = useState<DbStatus>('connecting');
  const [conn, setConn] = useState<DbConnection | null>(null);

  // Live database rows mirrored directly from SpacetimeDB
  const [dbCustomers, setDbCustomers] = useState<Customer[]>([]);
  const [dbPolicies, setDbPolicies] = useState<Policy[]>([]);
  const [dbClaims, setDbClaims] = useState<Claim[]>([]);
  const [dbTriage, setDbTriage] = useState<TriageQueue[]>([]);
  const [dbActiveCalls, setDbActiveCalls] = useState<ActiveCall[]>([]);

  // UI State
  const [activeCustomerId, setActiveCustomerId] = useState<string>('cust-1');
  const [contactRequests, setContactRequests] = useState<ContactRequest[]>([]);
  const [agentTakeover, setAgentTakeover] = useState<Record<string, boolean>>({});
  const [priorityOverride, setPriorityOverrideState] = useState<Record<string, UrgencyLevel | null>>({});
  const [callStatus, setCallStatusState] = useState<Record<string, CallStatus>>({
    'cust-1': 'ai',
    'cust-2': 'ai',
    'cust-6': 'ai',
  });
  const [toolRuns, setToolRuns] = useState<Record<string, ToolCall[]>>({});
  const [catMode, setCatModeState] = useState<{ on: boolean; name: string; at?: number }>({
    on: false,
    name: 'Winter Storm Heather',
  });
  const [reqSeq, setReqSeq] = useState(0);
  const [lastSync, setLastSync] = useState(0);
  const catTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // ---------------------------------------------------------------------------
  // 1. SpacetimeDB Live WebSocket Connection
  // ---------------------------------------------------------------------------
  useEffect(() => {
    setLastSync(Date.now());
    let active = true;

    try {
      const builder: any = DbConnection.builder().withUri('wss://maincloud.spacetimedb.com');
      const dbName = 'c20029daa0df66e41fc3af91cac6f9bbd41ec925bd4dc1e4f6e1ce4d89592aa2';

      if (typeof builder.withDatabaseNameOrAddress === 'function') builder.withDatabaseNameOrAddress(dbName);
      else if (typeof builder.withDatabaseName === 'function') builder.withDatabaseName(dbName);
      else if (typeof builder.withDatabase === 'function') builder.withDatabase(dbName);
      else if (typeof builder.withModuleName === 'function') builder.withModuleName(dbName);

      const connection = builder
        .onConnect((_conn: any, _identity: any, _token: any) => {
          if (!active) return;
          setDbStatus('connected');
          connection.subscriptionBuilder().subscribe([
            'SELECT * FROM customers',
            'SELECT * FROM policies',
            'SELECT * FROM active_calls',
            'SELECT * FROM triage_queue',
            'SELECT * FROM claims',
          ]);
        })
        .onDisconnect(() => {
          if (active) setDbStatus('off');
        })
        .build();

      // Table reactive listeners
      connection.db.customers.onInsert((_ctx: any, row: Customer) => {
        setDbCustomers((prev) => [...prev.filter((c) => c.id !== row.id), row]);
      });
      connection.db.customers.onUpdate((_ctx: any, _oldRow: Customer, newRow: Customer) => {
        setDbCustomers((prev) => prev.map((c) => (c.id === newRow.id ? newRow : c)));
      });

      connection.db.policies.onInsert((_ctx: any, row: Policy) => {
        setDbPolicies((prev) => [...prev.filter((p) => p.policyId !== row.policyId), row]);
      });
      connection.db.policies.onUpdate((_ctx: any, _oldRow: Policy, newRow: Policy) => {
        setDbPolicies((prev) => prev.map((p) => (p.policyId === newRow.policyId ? newRow : p)));
      });

      connection.db.claims.onInsert((_ctx: any, row: Claim) => {
        setDbClaims((prev) => [...prev.filter((c) => c.id !== row.id), row]);
        setLastSync(Date.now());
      });
      connection.db.claims.onUpdate((_ctx: any, _oldRow: Claim, newRow: Claim) => {
        setDbClaims((prev) => prev.map((c) => (c.id === newRow.id ? newRow : c)));
        setLastSync(Date.now());
      });

      connection.db.triageQueue.onInsert((_ctx: any, row: TriageQueue) => {
        setDbTriage((prev) => [...prev.filter((t) => t.ticketId !== row.ticketId), row]);
        setLastSync(Date.now());
      });
      connection.db.triageQueue.onUpdate((_ctx: any, _oldRow: TriageQueue, newRow: TriageQueue) => {
        setDbTriage((prev) => prev.map((t) => (t.ticketId === newRow.ticketId ? newRow : t)));
        setLastSync(Date.now());
      });

      connection.db.activeCalls.onInsert((_ctx: any, row: ActiveCall) => {
        setDbActiveCalls((prev) => [...prev.filter((a) => a.id !== row.id), row]);
        setLastSync(Date.now());
      });
      connection.db.activeCalls.onUpdate((_ctx: any, _oldRow: ActiveCall, newRow: ActiveCall) => {
        setDbActiveCalls((prev) => prev.map((a) => (a.id === newRow.id ? newRow : a)));
        setLastSync(Date.now());
      });

      setConn(connection);
    } catch (err) {
      console.error('[SpacetimeDB Connection Failed]', err);
      setDbStatus('error');
    }

    return () => {
      active = false;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // 2. Data Merging: Pure Database Sync with Local Fallbacks
  // ---------------------------------------------------------------------------
  const { customers, claims, transcripts } = useMemo(() => {
    const claimsRecord: Record<string, ClaimFlow> = {};
    const transcriptsRecord: Record<string, Line[]> = {};

    const mergedCustomers = initialCustomers.map((base, idx) => {
      const custDbId = idx + 1; // 1 -> Sofia, 2 -> Liam, etc.
      const custIdStr = base.id; // "cust-1"

      // Match triage ticket by customerId (bigint/number match)
      const triage = dbTriage
        .filter((t) => Number(t.customerId) === custDbId)
        .sort((a, b) => Number(b.ticketId - a.ticketId))[0];

      // Match claim by customerId
      const claim = dbClaims
        .filter((cl) => Number(cl.customerId) === custDbId)
        .sort((a, b) => Number(b.id - a.id))[0];

      // Match active call by customerId
      const activeCall = dbActiveCalls
        .filter((a) => Number(a.customerId) === custDbId)
        .sort((a, b) => Number(b.id - a.id))[0];

      // Match policy
      const policy = dbPolicies.find((p) => Number(p.customerId) === custDbId);

      // Build ClaimFlow
      if (claim) {
        claimsRecord[custIdStr] = {
          id: `CLM-${claim.id}`,
          status:
            claim.status === 'SUBMITTED'
              ? 'approved'
              : claim.customerApproved
              ? 'submitted'
              : 'draft',
          number: claim.claimNumber || (claim.customerApproved ? `SF-CLM-${claim.id}` : undefined),
          type: claim.hazardType || 'Disaster Damage',
          amount: claim.estPayout || 5000,
          description: claim.description || '',
          confirmed: {},
        };
      } else {
        claimsRecord[custIdStr] = {
          id: 'DRF-NONE',
          status: 'none',
          type: 'None',
          amount: 0,
          description: '',
          confirmed: {},
        };
      }

      // Build Transcripts
      if (activeCall && activeCall.liveTranscript) {
        transcriptsRecord[custIdStr] = activeCall.liveTranscript
          .split('\n')
          .filter(Boolean)
          .map((line, i) => {
            const isAI = line.startsWith('AI:');
            const isAgent = line.startsWith('Agent:');
            return {
              id: `line-${activeCall.id}-${i}`,
              kind: isAI ? 'ai' : isAgent ? 'agent' : 'cust',
              text: line.replace(/^(AI|Customer|Agent):\s*/, ''),
              time: nowTime(),
              channel: 'call',
            };
          });
      } else {
        transcriptsRecord[custIdStr] = [];
      }

      // Compute final urgency & score
      const finalScore = triage ? triage.priorityScore : base.riskScore;
      const finalUrgency: UrgencyLevel =
        finalScore >= 80 ? 'High' : finalScore >= 40 ? 'Medium' : 'Low';

      return {
        ...base,
        riskScore: finalScore,
        urgency: priorityOverride[custIdStr] || finalUrgency,
        detectedHazard: triage?.detectedHazard || base.detectedHazard,
        checkInStatus:
          claim?.status === 'SUBMITTED'
            ? 'completed'
            : finalScore >= 70
            ? 'urgent_attention'
            : base.checkInStatus,
        policy: policy
          ? {
              ...base.policy,
              policyNumber: policy.policyNumber,
              type: policy.policyType,
              coverageLimit: policy.coverageLimit,
              deductible: policy.deductible,
            }
          : base.policy,
      };
    });

    return { customers: mergedCustomers, claims: claimsRecord, transcripts: transcriptsRecord };
  }, [dbCustomers, dbPolicies, dbClaims, dbTriage, dbActiveCalls, priorityOverride]);

  const activeCustomer =
    customers.find((c) => c.id === activeCustomerId) || customers[0] || initialCustomers[0];

  // ---------------------------------------------------------------------------
  // 3. User Actions & FastAPI Bridge
  // ---------------------------------------------------------------------------
  const sendChatMessage: Ctx['sendChatMessage'] = async (text) => {
    const custIndex = initialCustomers.findIndex((c) => c.id === activeCustomerId);
    const dbCustomerId = custIndex >= 0 ? custIndex + 1 : 1;

    try {
      // Direct call to your FastAPI Orchestrator (port 8000)
      const res = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: dbCustomerId,
          user_transcript: text,
        }),
      });

      if (!res.ok) throw new Error(`FastAPI responded with status: ${res.status}`);
      const data = await res.json();

      // Read reply aloud if speech synthesis is present
      if (typeof window !== 'undefined' && 'speechSynthesis' in window && data.reply) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(data.reply);
        window.speechSynthesis.speak(utterance);
      }

      return 'ok';
    } catch (err) {
      console.warn('[FastAPI Offline/Fallback]', err);
      return 'ok';
    }
  };

  const approveClaimDraft: Ctx['approveClaimDraft'] = (custId) => {
    const cl = claims[custId];
    const custIndex = initialCustomers.findIndex((c) => c.id === custId);
    const dbCustomerId = custIndex >= 0 ? custIndex + 1 : 1;
    const num = `SF-CLM-${Date.now().toString().slice(-6)}`;

    // Call agent_approve_claim directly over WebSocket
    if (conn) {
      try {
        const claimRow = dbClaims.find((c) => Number(c.customerId) === dbCustomerId);
        const claimIdToApprove = claimRow ? claimRow.id : BigInt(dbCustomerId);

        (conn.reducers as any).agentApproveClaim({
          claimId: claimIdToApprove,
          claimNumber: num,
        });
      } catch (err) {
        console.error('[approveClaimDraft failed]', err);
      }
    }
    return num;
  };

  const stepIn: Ctx['stepIn'] = (custId) => {
    setAgentTakeover((prev) => ({ ...prev, [custId]: true }));
    setCallStatusState((prev) => ({ ...prev, [custId]: 'agent' }));

    const custIndex = initialCustomers.findIndex((c) => c.id === custId);
    const dbCustomerId = custIndex >= 0 ? custIndex + 1 : 1;

    if (conn) {
      const activeCall = dbActiveCalls.find((a) => Number(a.customerId) === dbCustomerId);
      if (activeCall) {
        try {
          (conn.reducers as any).joinCallByAgent({ callId: activeCall.id });
        } catch {}
      }
    }
  };

  const setCatMode: Ctx['setCatMode'] = (on) => {
    catTimers.current.forEach(clearTimeout);
    catTimers.current = [];
    setCatModeState((prev) => ({ ...prev, on, at: on ? Date.now() : undefined }));
  };

  const value: Ctx = {
    customers,
    activeCustomerId,
    claims,
    contactRequests,
    agentTakeover,
    transcripts,
    toolRuns,
    priorityOverride,
    callStatus,
    reqSeq,
    catMode,
    epoch: 0,
    stamps: {},
    hydrated: true,
    lastSync,
    dbStatus,
    activeCustomer,
    setActiveCustomerId,
    updateCustomerLanguage: () => {},
    appendLine: () => {},
    applyHazard: (custId) => claims[custId] || { id: 'none', status: 'none', type: '', amount: 0, description: '', confirmed: {} },
    runTools: () => {},
    runHazardPlan: () => {},
    sendChatMessage,
    confirmClaimField: () => {},
    submitClaim: () => '',
    approveClaimDraft,
    createContactRequest: () => '',
    acceptContactRequest: () => {},
    cancelContactRequest: () => {},
    stepIn,
    sendAgentMessage: () => {},
    setPriorityOverride: (id, tier) => setPriorityOverrideState((prev) => ({ ...prev, [id]: tier })),
    setCallStatus: (id, s) => setCallStatusState((prev) => ({ ...prev, [id]: s })),
    patchCustomer: () => {},
    setCatMode,
    resetToDefaults: () => {},
  };

  return <StateFarmContext.Provider value={value}>{children}</StateFarmContext.Provider>;
};

export const useStore = () => {
  const context = useContext(StateFarmContext);
  if (!context) throw new Error('useStore must be used within StateFarmProvider');
  return context;
};