import type { SourceKind } from '@/lib/claim';
import { tx } from '@/lib/i18n';

const DOT: Record<SourceKind, string> = { call: '#E61A21', policy: '#286784', transcript: '#7D6F86' };

export function PrefilledField({
  label,
  value,
  src,
  kind,
  confirmedBy,
  onToggle,
  lang,
}: {
  label: string;
  value: string;
  src: string;
  kind: SourceKind;
  confirmedBy?: string;
  onToggle: () => void;
  lang: 'en' | 'es';
}) {
  const ok = !!confirmedBy;
  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_auto] gap-3.5 items-center px-[18px] py-4 rounded-2xl border border-charcoal/10"
      style={{ background: ok ? '#FBF6F3' : '#fff' }}
    >
      <div className="flex flex-col gap-1 min-w-0">
        <span className="hn-label text-[11px] text-grey">{label}</span>
        <span className="font-bold text-[19px] leading-snug">{value}</span>
        <span className="flex items-center gap-1.5 font-mono text-[12px] text-lavender">
          <span className="w-[7px] h-[7px] rounded-sm" style={{ background: DOT[kind] }} />
          {(lang === 'es' ? 'De ' : 'From ') + src}
          {confirmedBy && confirmedBy !== 'portal' && <span className="text-blue">· {tx(confirmedBy, lang)}</span>}
        </span>
      </div>
      <button
        onClick={onToggle}
        className="h-10 px-3.5 rounded-full font-bold text-[13px] cursor-pointer whitespace-nowrap"
        style={{ border: `2px solid ${ok ? '#286784' : '#1A1A1A'}`, background: ok ? '#286784' : '#fff', color: ok ? '#fff' : '#1A1A1A' }}
      >
        {ok ? (lang === 'es' ? 'Confirmado ✓' : 'Confirmed ✓') : lang === 'es' ? 'Confirmar' : 'Confirm'}
      </button>
    </div>
  );
}
