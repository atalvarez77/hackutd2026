'use client';

import { useState } from 'react';
import type { ToolCall } from '@/types/statefarm';

const COLOR: Record<ToolCall['status'], string> = { done: '#8FC3DD', running: '#FF6B73', queued: '#6E6878', paused: '#6E6878' };

/** Nemotron tool-call log. Collapsed by default so the transcript stays the focus. */
export function ToolTrace({ runs, paused }: { runs: ToolCall[]; paused: boolean }) {
  const [open, setOpen] = useState(false);
  const done = runs.filter((r) => r.status === 'done').length;
  const summary = runs.length
    ? `${done} of ${runs.length} done${paused ? ' · paused for you' : ''}`
    : 'None yet';
  return (
    <div className="border-t border-white/[.08]">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-[18px] py-2.5 bg-transparent text-ink text-[15px] text-left cursor-pointer">
        <span className="font-semibold">Nora&apos;s actions</span>
        <span className="text-mist">{summary}</span>
        <span className="flex-1" />
        <span className="font-mono text-mist">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="px-[18px] pb-2 flex flex-col max-h-[190px] overflow-y-auto">
          {runs.map((r, i) => (
            <div key={i} className="grid grid-cols-[22px_1fr_auto] gap-3 items-start font-mono text-[13px] pb-2.5 hn-in">
              <span
                className="mt-[3px] w-3.5 h-3.5 rounded-full"
                style={{ border: `2px solid ${COLOR[r.status]}`, background: r.status === 'done' ? COLOR.done : 'transparent' }}
              />
              <span className="flex flex-col gap-0.5 min-w-0">
                <span className="text-ink font-bold">{r.name}()</span>
                <span className="text-mist">→ {r.output}</span>
              </span>
              <span className="font-bold text-[11px] uppercase" style={{ color: COLOR[r.status] }}>
                {r.status}
              </span>
            </div>
          ))}
          {!runs.length && <div className="font-mono text-[13px] text-mist">No active agent run for this policyholder.</div>}
        </div>
      )}
    </div>
  );
}
