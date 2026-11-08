'use client';

/**
 * Client for the FastAPI orchestrator (backend/main.py). It is the foundation: every caller turn
 * goes through /api/chat (Nemotron triage + claim + SpacetimeDB writes), and every other database
 * write goes through its gateway endpoints. While it's unreachable, callers get `null` right away
 * (no waiting on timeouts) and the app writes to SpacetimeDB directly instead; it re-checks every 15s.
 */

const BASE = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:8000';
const RECHECK_MS = 15_000;

export type ApiStatus = 'checking' | 'up' | 'down';
export type AiSource = 'nemotron' | 'stub';

/** One caller turn, as returned by POST /api/chat. */
export interface TurnResult {
  reply: string;
  ai_source: AiSource;
  /** True when the orchestrator already wrote Nora's reply into the call transcript. */
  reply_logged: boolean;
  call_id?: number;
  ticket_id?: number;
  claim_id?: number;
  priority_score?: number | null;
  category?: string | null;
  summary_reason?: string | null;
  detected_hazard?: string | null;
  claim?: { description: string; hazard_type: string; est_payout: number; customer_approved: boolean } | null;
  consent: boolean;
}

let status: ApiStatus = 'checking';
let source: AiSource | null = null;
let recheck: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const apiState = () => ({ status, source });
export function onApiChange(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

function markDown() {
  if (status !== 'down') {
    status = 'down';
    emit();
  }
  if (!recheck) recheck = setTimeout(() => ((recheck = null), void checkHealth()), RECHECK_MS);
}

export async function checkHealth() {
  try {
    const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) throw new Error(String(res.status));
    const data: { ai_source?: AiSource } = await res.json();
    status = 'up';
    source = data.ai_source === 'nemotron' ? 'nemotron' : 'stub';
    emit();
  } catch {
    markDown();
  }
}

/** POST to the orchestrator. Returns null (immediately while it's known to be down) on failure. */
export async function post<T>(path: string, body: unknown, timeoutMs = 6000): Promise<T | null> {
  if (status === 'down') return null;
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    const data = (await res.json()) as T;
    if (status !== 'up') {
      status = 'up';
      emit();
    }
    return data;
  } catch (err) {
    console.warn('[FastAPI orchestrator]', err);
    markDown();
    return null;
  }
}
