'use client';

import { Component, useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { CallStatus, CustomerProfile, Line, ToolCall } from '@/types/statefarm';

/**
 * Live Nora feed: a dialog showing one policyholder's call with Nora as it happens.
 * Read-only: it only displays what it's given. The one action ("Take over call") calls the
 * console's existing step-in handler passed in by the page. Behind NEXT_PUBLIC_LIVE_FEED=true.
 */

export const LIVE_FEED_ENABLED = process.env.NEXT_PUBLIC_LIVE_FEED === 'true';

type FeedItem = { id: string; who: 'nora' | 'caller' | 'you' | 'sys'; text: string; tr?: string; t: string };

const ACTION_LABEL: Record<string, string> = {
  open_claim: 'Opened a claim',
  update_risk: 'Updated risk',
  confirm_details: 'Confirmed details',
  notify_emergency_contact: 'Texted emergency contact',
  text_caller: 'Texted the caller',
  submit_claim: 'Submitted the claim',
  transfer_to_agent: 'Asked for a person',
  set_language: 'Switched language',
  end_call: 'Ended the call',
};

/** Transcript lines → feed items. Anything unexpected is skipped rather than thrown on. */
function toItems(lines: unknown): FeedItem[] {
  if (!Array.isArray(lines)) return [];
  const out: FeedItem[] = [];
  for (const l of lines as Partial<Line>[]) {
    if (!l || typeof l.text !== 'string' || typeof l.id !== 'string') continue;
    if (l.channel === 'chat') continue; // calls only
    const who = l.kind === 'ai' ? 'nora' : l.kind === 'cust' ? 'caller' : l.kind === 'agent' ? 'you' : l.kind === 'event' ? 'sys' : null;
    if (!who || !l.text.trim()) continue;
    out.push({ id: l.id, who, text: l.text, tr: typeof l.tr === 'string' ? l.tr : undefined, t: typeof l.time === 'string' ? l.time : '' });
  }
  return out;
}

function toActions(runs: unknown): { key: string; text: string; detail: string }[] {
  if (!Array.isArray(runs)) return [];
  return (runs as Partial<ToolCall>[])
    .filter((r) => r && typeof r.name === 'string')
    .map((r, i) => ({ key: `${i}-${r.name}`, text: ACTION_LABEL[r.name as string] || String(r.name).replace(/_/g, ' '), detail: typeof r.output === 'string' ? r.output : '' }));
}

const initialsOf = (name: string) =>
  name
    .split(/[\s&]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

interface Props {
  open: boolean;
  onClose: () => void;
  customer: CustomerProfile | undefined;
  lines: Line[] | undefined;
  toolRuns: ToolCall[] | undefined;
  callStatus: CallStatus | undefined;
  takeover: boolean;
  /** The console's existing step-in; omitted → no take-over button. */
  onTakeOver?: () => void;
}

function Feed({ open, onClose, customer, lines, toolRuns, callStatus, takeover, onTakeOver }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<Element | null>(null);

  const items = useMemo(() => toItems(lines), [lines]);
  const actions = useMemo(() => toActions(toolRuns), [toolRuns]);
  const live = callStatus === 'ai' || callStatus === 'agent';

  // Focus: remember the opener, move focus in, trap Tab, Esc closes, restore focus on close.
  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement;
    const el = dialogRef.current;
    el?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      // While open, keys belong to the dialog: the console's shortcuts (S, A, J/K...) don't fire behind it.
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !el) return;
      const f = Array.from(el.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'));
      if (!f.length) return;
      const firstEl = f[0];
      const lastEl = f[f.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      (openerRef.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  // Auto-scroll to the newest line.
  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [open, items.length]);

  if (!open) return null;
  const name = customer?.name || 'Policyholder';
  const status = takeover && live ? 'you' : live ? 'live' : 'last';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: 'rgba(10,11,14,.6)' }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Live Nora feed for ${name}`}
        className="flex flex-col overflow-hidden text-white"
        style={{ width: 'min(980px, calc(100vw - 24px))', height: 'min(760px, calc(100vh - 24px))', borderRadius: 24, background: '#1A1D23', border: '1px solid rgba(255,255,255,.18)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-5 border-b border-white/[.12]">
          <span className="w-[52px] h-[52px] rounded-full flex items-center justify-center font-bold text-[18px] flex-none" style={{ background: '#2C313A' }} aria-hidden>
            {initialsOf(name)}
          </span>
          <div className="flex-1 min-w-0 flex flex-col">
            <span className="text-[24px] font-bold leading-tight truncate">{name}</span>
            {customer && (
              <span className="text-[17px] truncate" style={{ color: '#E4E7EC' }}>
                {customer.phone} · {customer.language === 'es' ? 'Spanish' : 'English'} · {customer.detectedHazard && customer.detectedHazard !== 'None' ? customer.detectedHazard : 'No hazard reported'}
              </span>
            )}
          </div>
          <span
            className="flex items-center gap-2 px-3 h-9 rounded-full text-[15px] font-semibold whitespace-nowrap"
            style={status === 'live' ? { background: 'rgba(127,179,213,.18)', color: '#9CC7E3' } : { background: '#2C313A', color: '#E4E7EC' }}
          >
            {status === 'live' && <span className="w-2 h-2 rounded-full motion-safe:animate-pulse" style={{ background: '#9CC7E3' }} aria-hidden />}
            {status === 'live' ? 'Live with Nora' : status === 'you' ? 'You’re on the call' : 'Last call'}
          </span>
          <button
            data-autofocus
            onClick={onClose}
            aria-label="Close live Nora feed"
            className="w-11 h-11 rounded-full flex items-center justify-center text-[22px] cursor-pointer border border-white/[.18] bg-transparent text-white focus-visible:outline-2 focus-visible:outline-[#9CC7E3]"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 flex flex-wrap overflow-y-auto">
          <div ref={scrollRef} className="min-h-0 overflow-y-auto px-6 py-5 flex flex-col gap-4" style={{ flex: '999 1 420px', maxHeight: '100%' }} aria-live="polite">
            {items.length === 0 ? (
              <p className="m-auto text-[19px]" style={{ color: '#E4E7EC' }}>
                No call yet
              </p>
            ) : (
              items.map((it) =>
                it.who === 'sys' ? (
                  <p key={it.id} className="m-0 text-[15px] text-center" style={{ color: '#B8BEC9' }}>
                    {it.text}
                    {it.t ? ` · ${it.t}` : ''}
                  </p>
                ) : (
                  <div key={it.id} className={`flex flex-col gap-1 ${it.who === 'caller' ? 'items-end' : 'items-start'}`}>
                    <span className="text-[15px] whitespace-nowrap" style={{ color: '#E4E7EC' }}>
                      {it.who === 'nora' ? 'Nora (AI)' : it.who === 'you' ? 'You' : name.split(/[\s&]/)[0]}
                      {it.t ? ` · ${it.t}` : ''}
                    </span>
                    <div
                      className="text-[19px] leading-[1.5]"
                      style={{ maxWidth: '86%', borderRadius: 18, padding: '12px 18px', background: it.who === 'caller' ? '#22262E' : '#2C313A' }}
                    >
                      {it.text}
                      {it.tr && (
                        <span className="block mt-1 text-[16px] italic" style={{ color: '#C9CED6' }}>
                          {it.tr}
                        </span>
                      )}
                    </div>
                  </div>
                ),
              )
            )}
            {live && !takeover && items.length > 0 && (
              <div className="self-start flex gap-1.5 px-[18px] py-3 rounded-[18px]" style={{ background: '#2C313A' }} aria-label="Nora is on the line">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="w-2 h-2 rounded-full motion-safe:animate-bounce" style={{ background: '#C9CED6', animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            )}
          </div>

          <aside className="min-h-0 overflow-y-auto px-5 py-5 flex flex-col gap-3 border-l border-white/[.12]" style={{ flex: '1 1 280px', background: '#121418' }}>
            <h2 className="m-0 text-[17px] font-semibold" style={{ color: '#E4E7EC' }}>
              Nora’s actions · {actions.length} so far
            </h2>
            {actions.length === 0 && (
              <p className="m-0 text-[15px]" style={{ color: '#B8BEC9' }}>
                No actions yet.
              </p>
            )}
            {actions.map((a, i) => {
              const newest = live && i === actions.length - 1;
              return (
                <div key={a.key} className="flex items-start gap-3">
                  <span
                    className="w-6 h-6 rounded-full flex-none flex items-center justify-center text-[13px] font-bold mt-0.5"
                    style={{ background: newest ? '#9CC7E3' : '#F2C14E', color: '#121418' }}
                    aria-hidden
                  >
                    ✓
                  </span>
                  <span className="flex-1 min-w-0 flex flex-col">
                    <span className="text-[17px] font-semibold">{a.text}</span>
                    {a.detail && (
                      <span className="text-[14px] break-words" style={{ color: '#C9CED6' }}>
                        {a.detail}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </aside>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-t border-white/[.12]">
          {onTakeOver && live && (
            <button
              onClick={onTakeOver}
              disabled={takeover}
              className="h-11 px-5 rounded-xl font-semibold text-[16px] cursor-pointer disabled:cursor-default border-0"
              style={takeover ? { background: '#2C313A', color: '#E4E7EC' } : { background: '#E5534B', color: '#14161A' }}
            >
              {takeover ? 'You’re on the call' : 'Take over call'}
            </button>
          )}
          <button onClick={onClose} className="h-11 px-5 rounded-xl font-semibold text-[16px] cursor-pointer bg-transparent text-white border border-white/[.3]">
            Minimize
          </button>
          <span className="text-[15px] flex-1 min-w-[220px]" style={{ color: '#C9CED6' }}>
            Nora hands over with the full transcript. The caller won’t repeat anything.
          </span>
        </div>
      </div>
    </div>
  );
}

/** A crash in the feed only removes the feed. */
class FeedBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn('[LiveNoraFeed] hidden after an error', err);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function LiveNoraFeed(props: Props) {
  if (!LIVE_FEED_ENABLED) return null;
  return (
    <FeedBoundary>
      <Feed {...props} />
    </FeedBoundary>
  );
}
