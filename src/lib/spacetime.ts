'use client';

/**
 * SpacetimeDB bridge. The UI keeps its own AppState (transcripts, requests, tool runs, the
 * claim walkthrough) because the module only models customers / policies / triage / calls /
 * claims. This file:
 *   - opens one connection and subscribes to every table,
 *   - hands rows back as plain callbacks so the context can merge them into AppState,
 *   - exposes typed writers that call the module's reducers (fire-and-forget).
 * If the connection fails or NEXT_PUBLIC_SPACETIME=off, every writer is a no-op and the
 * app falls back to localStorage + BroadcastChannel sync.
 */

import type { DbConnection } from '@/module_bindings';
import type { Claim, Policy, TriageQueue } from '@/module_bindings/types';
import type { ClaimFlow, UrgencyLevel } from '@/types/statefarm';

export type DbStatus = 'off' | 'connecting' | 'live' | 'error';

const URI = process.env.NEXT_PUBLIC_SPACETIME_URI || 'wss://maincloud.spacetimedb.com';
const DB = process.env.NEXT_PUBLIC_SPACETIME_DB || 'statefarm-backend';
const ENABLED = process.env.NEXT_PUBLIC_SPACETIME !== 'off';

/** 'cust-3' ⇄ 3n. The Rust seed uses numeric ids 1..6 with string_id "cust-N". */
export const dbIdOf = (custId: string) => BigInt(custId.replace(/^cust-/, '') || '0');
export const custIdOf = (id: bigint) => `cust-${id.toString()}`;

/** Module claim status → UI claim status. */
export function claimStatusFromDb(s: string): ClaimFlow['status'] {
  switch (s.toUpperCase()) {
    case 'SUBMITTED':
      return 'approved';
    case 'PENDING_AGENT_SUBMIT':
      return 'submitted';
    case 'DRAFT':
    case 'DRAFTED':
      return 'draft';
    default:
      return 'none';
  }
}

export const tierFromScore = (score: number): UrgencyLevel => (score >= 75 ? 'High' : score >= 45 ? 'Medium' : 'Low');

export interface SpacetimeHandlers {
  onStatus: (s: DbStatus) => void;
  onClaim: (row: Claim) => void;
  onTriage: (row: TriageQueue) => void;
  onPolicy: (row: Policy) => void;
}

export interface SpacetimeBridge {
  disconnect: () => void;
  pushTranscript: (custId: string, chunk: string) => void;
  pushTriage: (custId: string, score: number, category: string, reason: string, hazard: string) => void;
  pushClaim: (custId: string, claim: Pick<ClaimFlow, 'description' | 'type' | 'amount'>, customerApproved: boolean) => void;
  pushApprove: (custId: string, claimNumber: string) => void;
}

const noop: SpacetimeBridge = {
  disconnect: () => {},
  pushTranscript: () => {},
  pushTriage: () => {},
  pushClaim: () => {},
  pushApprove: () => {},
};

/** Opens the connection lazily (keeps the SDK out of SSR). Resolves to no-op writers on failure. */
export async function connectSpacetime(h: SpacetimeHandlers): Promise<SpacetimeBridge> {
  if (!ENABLED || typeof window === 'undefined') {
    h.onStatus('off');
    return noop;
  }
  h.onStatus('connecting');

  let conn: DbConnection;
  try {
    const { DbConnection } = await import('@/module_bindings');
    conn = DbConnection.builder()
      .withUri(URI)
      .withDatabaseName(DB)
      .onConnect((c) => {
        h.onStatus('live');
        c.subscriptionBuilder()
          .onError(() => h.onStatus('error'))
          .subscribe([
            'SELECT * FROM customers',
            'SELECT * FROM policies',
            'SELECT * FROM active_calls',
            'SELECT * FROM triage_queue',
            'SELECT * FROM claims',
          ]);
      })
      .onConnectError(() => h.onStatus('error'))
      .onDisconnect(() => h.onStatus('error'))
      .build();
  } catch {
    h.onStatus('error');
    return noop;
  }

  conn.db.claims.onInsert((_ctx, row) => h.onClaim(row));
  conn.db.claims.onUpdate((_ctx, _old, row) => h.onClaim(row));
  conn.db.triageQueue.onInsert((_ctx, row) => h.onTriage(row));
  conn.db.triageQueue.onUpdate((_ctx, _old, row) => h.onTriage(row));
  conn.db.policies.onInsert((_ctx, row) => h.onPolicy(row));
  conn.db.policies.onUpdate((_ctx, _old, row) => h.onPolicy(row));

  const call = (p: Promise<void> | undefined) => void p?.catch(() => {});

  return {
    disconnect: () => conn.disconnect(),
    pushTranscript: (custId, chunk) => {
      const id = dbIdOf(custId);
      // One active call per customer: call id == customer id.
      call(conn.reducers.updateCallTranscript({ callId: id, customerId: id, transcriptChunk: chunk }));
    },
    pushTriage: (custId, score, category, reason, hazard) => {
      const id = dbIdOf(custId);
      call(
        conn.reducers.updateTriageScore({
          ticketId: id,
          customerId: id,
          priorityScore: Math.max(0, Math.min(100, Math.round(score))),
          category,
          summaryReason: reason,
          detectedHazard: hazard,
        }),
      );
    },
    pushClaim: (custId, claim, customerApproved) => {
      const id = dbIdOf(custId);
      // One claim per customer, policy id == customer id (matches the Rust seed).
      call(
        conn.reducers.createOrUpdateClaim({
          claimId: id,
          customerId: id,
          policyId: id,
          description: claim.description,
          hazardType: claim.type,
          estPayout: claim.amount,
          customerApproved,
        }),
      );
    },
    pushApprove: (custId, claimNumber) => call(conn.reducers.agentApproveClaim({ claimId: dbIdOf(custId), claimNumber })),
  };
}
