import Link from 'next/link';

/** Mandatory 34px bar telling judges which side of the product they're looking at. */
export function ModeBar({ mode }: { mode: 'policyholder' | 'agent' }) {
  const agent = mode === 'agent';
  return (
    <div
      className="hn-label flex-none h-[34px] flex items-center gap-2.5 px-[clamp(16px,3vw,40px)] tracking-[.14em]"
      style={{ background: agent ? '#ED1D24' : '#EFD9CE', color: agent ? '#fff' : '#1A1A1A' }}
    >
      <span className="w-2 h-2 rounded-full" style={{ background: agent ? '#fff' : '#ED1D24' }} />
      <span className="whitespace-nowrap">{agent ? 'Agent view · State Farm internal' : 'Policyholder view'}</span>
      <span className="flex-1" />
      <Link href={agent ? '/' : '/agent'} className="font-sans font-bold text-[13px] normal-case tracking-normal no-underline whitespace-nowrap">
        {agent ? '← Back to policyholder site' : 'Switch to agent view →'}
      </Link>
    </div>
  );
}
