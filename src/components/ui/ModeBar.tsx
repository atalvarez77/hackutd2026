'use client';

import Link from 'next/link';
import { useStore } from '@/context/StateFarmContext';

/** Thin bar telling judges which side of the product they're looking at. */
export function ModeBar({ mode }: { mode: 'policyholder' | 'agent' }) {
  const { activeCustomer } = useStore();
  const agent = mode === 'agent';
  const es = !agent && activeCustomer.language === 'es';
  return (
    <div
      className="hn-label flex-none h-[34px] flex items-center gap-2.5 px-[clamp(16px,3vw,40px)] tracking-[.14em]"
      style={{ background: agent ? '#141417' : '#EFD9CE', color: agent ? '#B9A6C9' : '#1A1A1A', borderBottom: agent ? '1px solid rgba(255,255,255,.08)' : undefined }}
    >
      <span className="w-2 h-2 rounded-full" style={{ background: '#E61A21' }} />
      <span className="whitespace-nowrap">{agent ? 'Agent view · State Farm internal' : es ? 'Vista del asegurado' : 'Policyholder view'}</span>
      <span className="flex-1" />
      <Link href={agent ? '/' : '/agent'} className="font-sans font-bold text-[13px] normal-case tracking-normal no-underline whitespace-nowrap" style={{ color: agent ? '#F4F1F6' : undefined }}>
        {agent ? '← Back to policyholder site' : es ? 'Ver como agente →' : 'Switch to agent view →'}
      </Link>
    </div>
  );
}
