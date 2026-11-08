'use client';

/**
 * Client for the FastAPI orchestrator (backend/main.py). It owns Nora's conversation: the
 * frontend sends what the caller said or pressed and plays back whatever comes back.
 * Health is checked on load and re-checked every 15s while it's down, so calls never wait on
 * timeouts against a server that isn't running.
 */

const BASE = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:8000';
const RECHECK_MS = 15_000;

export type ApiStatus = 'checking' | 'up' | 'down';

/** Something Nora decided to do this turn (chosen by Nemotron, carried out by FastAPI). */
export type NoraAction =
  | { type: 'open_claim'; loss_type: string; damage_description: string; estimated_payout: number; hazard?: string; risk_score: number }
  | { type: 'update_risk'; risk_score: number; hazard?: string; reason?: string }
  | { type: 'confirm_details'; fields: string[] }
  | { type: 'notify_emergency_contact' }
  | { type: 'text_caller'; text: string }
  | { type: 'submit_claim'; claim_number: string }
  | { type: 'transfer_to_agent'; reason?: string }
  | { type: 'set_language'; language: 'en' | 'es' }
  | { type: 'end_call' };

/** One Nora turn, as returned by /api/call/start and /api/chat. */
export interface TurnResult {
  reply: string;
  actions: NoraAction[];
  suggested_replies: string[];
  language?: 'en' | 'es';
  call_id?: number;
  claim_number?: string | null;
  /** Keypad 2: a replay of the previous line, not a new turn. */
  repeat?: boolean;
}

/** Why a turn produced nothing: FastAPI unreachable, or reachable but Nemotron unavailable. */
export type TurnFailure = { error: 'offline' | 'nora_unavailable'; detail?: string };

let status: ApiStatus = 'checking';
let nemotron: boolean | null = null;
let recheck: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const apiState = () => ({ status, nemotron });
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
    const data: { nemotron?: boolean } = await res.json();
    status = 'up';
    nemotron = !!data.nemotron;
    emit();
  } catch {
    markDown();
  }
}

/** POST to the orchestrator. Returns null on failure (immediately while it's known to be down). */
export async function post<T>(path: string, body: unknown, timeoutMs = 6000): Promise<T | null> {
  const r = await postRaw<T>(path, body, timeoutMs);
  return 'error' in (r as object) ? null : (r as T);
}

/** Like post, but tells "server down" apart from "Nora unavailable" (503 from the orchestrator). */
export async function postRaw<T>(path: string, body: unknown, timeoutMs = 6000): Promise<T | TurnFailure> {
  if (status === 'down') return { error: 'offline' };
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (status !== 'up') {
      status = 'up';
      emit();
    }
    if (res.status === 503) {
      const d: { detail?: string } = await res.json().catch(() => ({}));
      if (nemotron !== false) {
        nemotron = false;
        emit();
      }
      return { error: 'nora_unavailable', detail: d.detail };
    }
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    console.warn('[FastAPI orchestrator]', err);
    markDown();
    return { error: 'offline' };
  }
}
