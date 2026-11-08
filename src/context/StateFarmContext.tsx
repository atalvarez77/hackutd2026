'use client';

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { DbConnection } from '@/module_bindings';
import type { Customer, Policy, Claim, TriageQueue, ActiveCall } from '@/module_bindings/types';

interface ChatMessage {
  id: string;
  sender: 'customer' | 'bot' | 'agent';
  text: string;
  timestamp: string;
}

interface StateFarmContextType {
  connected: boolean;
  customers: Customer[];
  policies: Policy[];
  claims: Claim[];
  triageTickets: TriageQueue[];
  activeCalls: ActiveCall[];
  conn: DbConnection | null;
}

const StateFarmContext = createContext<StateFarmContextType>({
  connected: false,
  customers: [],
  policies: [],
  claims: [],
  triageTickets: [],
  activeCalls: [],
  conn: null,
});

export const StateFarmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [conn, setConn] = useState<DbConnection | null>(null);
  const [connected, setConnected] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [triageTickets, setTriageTickets] = useState<TriageQueue[]>([]);
  const [activeCalls, setActiveCalls] = useState<ActiveCall[]>([]);

  useEffect(() => {
    const dbName = 'statefarm-backend';
    const builder: any = DbConnection.builder().withUri('wss://maincloud.spacetimedb.com');

    if (typeof builder.withDatabaseNameOrAddress === 'function') {
      builder.withDatabaseNameOrAddress(dbName);
    } else if (typeof builder.withDatabaseName === 'function') {
      builder.withDatabaseName(dbName);
    } else if (typeof builder.withNameOrAddress === 'function') {
      builder.withNameOrAddress(dbName);
    } else if (typeof builder.withDatabase === 'function') {
      builder.withDatabase(dbName);
    } else if (typeof builder.withAddress === 'function') {
      builder.withAddress(dbName);
    } else if (typeof builder.withModuleName === 'function') {
      builder.withModuleName(dbName);
    }

    const connection = builder
      .onConnect((_conn: any, _identity: any, _token: any) => {
        setConnected(true);
        connection.subscriptionBuilder().subscribe([
          'SELECT * FROM customers',
          'SELECT * FROM policies',
          'SELECT * FROM active_calls',
          'SELECT * FROM triage_queue',
          'SELECT * FROM claims',
        ]);
      })
      .onDisconnect(() => {
        setConnected(false);
      })
      .build();

    connection.db.customers.onInsert((_ctx: any, row: Customer) => {
      setCustomers((prev) => [...prev.filter((c) => c.id !== row.id), row]);
    });
    connection.db.customers.onUpdate((_ctx: any, _oldRow: Customer, newRow: Customer) => {
      setCustomers((prev) => prev.map((c) => (c.id === newRow.id ? newRow : c)));
    });

    connection.db.policies.onInsert((_ctx: any, row: Policy) => {
      setPolicies((prev) => [...prev.filter((p) => p.policyId !== row.policyId), row]);
    });
    connection.db.policies.onUpdate((_ctx: any, _oldRow: Policy, newRow: Policy) => {
      setPolicies((prev) => prev.map((p) => (p.policyId === newRow.policyId ? newRow : p)));
    });

    connection.db.triageQueue.onInsert((_ctx: any, row: TriageQueue) => {
      setTriageTickets((prev) =>
        [...prev.filter((t) => t.ticketId !== row.ticketId), row].sort(
          (a, b) => b.priorityScore - a.priorityScore
        )
      );
    });
    connection.db.triageQueue.onUpdate((_ctx: any, _oldRow: TriageQueue, newRow: TriageQueue) => {
      setTriageTickets((prev) =>
        prev
          .map((t) => (t.ticketId === newRow.ticketId ? newRow : t))
          .sort((a, b) => b.priorityScore - a.priorityScore)
      );
    });

    connection.db.claims.onInsert((_ctx: any, row: Claim) => {
      setClaims((prev) => [...prev.filter((c) => c.id !== row.id), row]);
    });
    connection.db.claims.onUpdate((_ctx: any, _oldRow: Claim, newRow: Claim) => {
      setClaims((prev) => prev.map((c) => (c.id === newRow.id ? newRow : c)));
    });

    connection.db.activeCalls.onInsert((_ctx: any, row: ActiveCall) => {
      setActiveCalls((prev) => [...prev.filter((a) => a.id !== row.id), row]);
    });
    connection.db.activeCalls.onUpdate((_ctx: any, _oldRow: ActiveCall, newRow: ActiveCall) => {
      setActiveCalls((prev) => prev.map((a) => (a.id === newRow.id ? newRow : a)));
    });

    setConn(connection);

    return () => {
      connection.disconnect();
    };
  }, []);

  return (
    <StateFarmContext.Provider
      value={{
        connected,
        customers,
        policies,
        claims,
        triageTickets,
        activeCalls,
        conn,
      }}
    >
      {children}
    </StateFarmContext.Provider>
  );
};

export const useStateFarm = () => useContext(StateFarmContext);

export const useStore = () => {
  const context = useContext(StateFarmContext);

  const [activeId, setActiveId] = useState<string>('cust-1');
  const [localLanguages, setLocalLanguages] = useState<Record<string, string>>({});
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);

  const formattedCustomers = useMemo(() => {
    return context.customers.map((c) => {
      const policy = context.policies.find((p) => p.customerId === c.id);
      const triage = context.triageTickets.find((t) => t.customerId === c.id);
      const activeCall = context.activeCalls.find((a) => a.customerId === c.id);
      const claim = context.claims.find((cl) => cl.customerId === c.id);

      const custId = c.stringId || `cust-${c.id}`;
      const lang = localLanguages[custId] || c.language || 'en';

      const chatTranscript: ChatMessage[] = [
        ...localMessages,
        ...(activeCall?.liveTranscript
          ? [
              {
                id: `call-${activeCall.id}`,
                sender: 'customer' as const,
                text: activeCall.liveTranscript,
                timestamp: new Date().toLocaleTimeString(),
              },
            ]
          : []),
      ];

      // Format claim draft with both estPayout and estimatedLoss for component compatibility
      const isDrafted = claim && (claim.status.toLowerCase() === 'draft' || claim.status.toLowerCase() === 'drafted' || claim.status === 'PENDING_AGENT_SUBMIT');
      const claimDraft = claim
        ? {
            id: claim.id,
            description: claim.description,
            hazardType: claim.hazardType,
            estPayout: claim.estPayout,
            estimatedLoss: claim.estPayout,
            customerApproved: claim.customerApproved,
            agentApproved: claim.agentApproved,
            claimNumber: claim.claimNumber,
            status: isDrafted ? 'drafted' : claim.status.toLowerCase(),
          }
        : {
            id: 0,
            description: '',
            hazardType: '',
            estPayout: 0,
            estimatedLoss: 0,
            customerApproved: false,
            agentApproved: false,
            claimNumber: '',
            status: 'none',
          };

      // Explainability bullet points formatted from SpacetimeDB data
      const bulletPoints = triage?.summaryReason
        ? [triage.summaryReason]
        : [
            c.knownVulnerabilities || 'Active regional alert detected',
            `Policy: ${policy?.policyType || 'Homeowners'} ($${policy?.coverageLimit?.toLocaleString() || '350,000'} limit)`,
          ];

      return {
        id: custId,
        dbId: c.id,
        name: c.name,
        age: c.age,
        livesAlone: c.livesAlone,
        language: lang,
        phone: c.phone,
        email: c.email,
        address: `${c.address}, ${c.city}, ${c.state} ${c.zip}`,
        avatarUrl: c.avatarUrl,
        knownVulnerabilities: c.knownVulnerabilities,
        urgency: c.weatherAlertSeverity || 'Medium',
        weatherAlert: {
          title: c.weatherAlertTitle,
          severity: c.weatherAlertSeverity,
        },
        riskScore: triage ? triage.priorityScore : (c.age > 75 ? 85 : 45),
        detectedHazard: triage?.detectedHazard || c.weatherAlertTitle || 'Winter Freeze Advisory',
        explainability: {
          bulletPoints,
        },
        checkInStatus: c.status || 'pending',
        triageCategory: triage?.category || 'General',
        triageReason: triage?.summaryReason || '',
        chatTranscript,
        policy: {
          policyNumber: policy?.policyNumber || 'SF-89214-HO',
          type: policy?.policyType || 'Homeowners Comprehensive',
          coverageLimit: policy?.coverageLimit || 350000,
          deductible: policy?.deductible || 1000,
        },
        claimDraft,
      };
    });
  }, [context.customers, context.policies, context.triageTickets, context.activeCalls, context.claims, localLanguages, localMessages]);

  const activeCustomer =
    formattedCustomers.find((c) => c.id === activeId) ||
    formattedCustomers[0] || {
      id: 'cust-1',
      name: 'Sofia Martinez',
      age: 82,
      language: 'es',
      avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
      riskScore: 85,
      urgency: 'High',
      detectedHazard: 'Winter Freeze Advisory',
      explainability: { bulletPoints: ['82 years old, lives alone', 'Sub-zero freeze vulnerability'] },
      policy: { policyNumber: 'SF-89214-HO' },
      claimDraft: { status: 'none', estimatedLoss: 0 },
      chatTranscript: [],
    };

  return {
    ...context,
    customers: formattedCustomers,
    activeCustomer,
    selectedCustomer: activeCustomer,
    selectedCustomerId: activeId,
    setSelectedCustomerId: setActiveId,
    setActiveCustomerId: setActiveId,

    resetToDefaults: () => {
      setLocalMessages([]);
      setLocalLanguages({});
      setActiveId('cust-1');
    },

    updateCustomerLanguage: (custId: string, lang: string) => {
      setLocalLanguages((prev) => ({ ...prev, [custId]: lang }));
    },

    sendChatMessage: (text: string, sender: 'customer' | 'bot' = 'customer') => {
      setLocalMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}-${Math.random()}`,
          sender,
          text,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);

      if (context.conn && activeCustomer?.dbId) {
        try {
          (context.conn.reducers as any).updateCallTranscript({
            callId: BigInt(activeCustomer.dbId),
            customerId: BigInt(activeCustomer.dbId),
            transcriptChunk: `${sender}: ${text}`,
          });
        } catch {
          (context.conn.reducers as any).updateCallTranscript(
            BigInt(activeCustomer.dbId),
            BigInt(activeCustomer.dbId),
            `${sender}: ${text}`
          );
        }
      }
    },

    // 1-Click claim approval used by the Agent Dashboard
    approveClaimDraft: (customerIdOrClaimId: string | bigint | number) => {
      if (context.conn) {
        // Find matching claim safely across string, number, and bigint
        const targetIdStr = String(customerIdOrClaimId);
        const matched = formattedCustomers.find(
          (c) => c.id === targetIdStr || String(c.dbId) === targetIdStr
        );
        const claimId = matched?.claimDraft?.id ? BigInt(matched.claimDraft.id) : BigInt(1);
        const officialClaimNumber = `SF-CLM-${Date.now().toString().slice(-6)}`;

        try {
          (context.conn.reducers as any).agentApproveClaim({
            claimId,
            claimNumber: officialClaimNumber,
          });
        } catch {
          (context.conn.reducers as any).agentApproveClaim(claimId, officialClaimNumber);
        }
      }
    },
  };
};

export default useStore;