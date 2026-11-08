'use client';

import { useState } from 'react';
import type { ToolCall } from '@/types/statefarm';

const COLOR: Record<ToolCall['status'], string> = { done: '#6FB6DC', running: '#FF3B47', queued: '#B9A6C9', paused: '#B9A6C9' };

/** Nemotron tool-call visualizer. Open by default. */
export function ToolTrace({ runs, paused }: { runs: ToolCall[]; paused: boolean }) {
  const [open, setOpen] = useState(true);
  const done = runs.filter((r) => r.status === 'done').length;
  const summary = runs.length
    ? `${done}/${runs.length} tools run · ${paused ? 'paused for agent' : done === runs.length ? 'plan complete' : 'executing plan'}`
    : 'Idle';
  return (
    <div className="border-t border-white/[.08]">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-[18px] py-2.5 bg-transparent text-ink text-[15px] text-left cursor-pointer">
        <span className="font-mono font-bold text-[12px] px-1.5 py-0.5 rounded bg-panel-2 text-neon-blue">NORA · NEMOTRON</span>
        <span>{summary}</span>
        <span className="flex-1" />
        <span className="font-mono text-mist">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="px-[18px] pb-2 flex flex-col max-h-[190px] overflow-y-auto">
          {runs.map((r, i) => (
            <div key={i} className="grid grid-cols-[22px_1fr_auto] gap-3 items-start font-mono text-[13px] pb-2.5 hn-in">
              <span
                className="mt-[3px] w-3.5 h-3.5 rounded-full"
                style={{ border: `2px solid ${COLOR[r.status]}`, background: r.status === 'done' ? COLOR.done : 'transparent', boxShadow: `0 0 10px ${COLOR[r.status]}` }}
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
