import type { Language } from '@/types/statefarm';
import { CLAIM_STEPS } from '@/lib/claim';

/** Sticky vertical list of the 8 claim steps. `current` is 0-based; steps < current are done. */
export function ClaimStepper({
  current,
  maxReachable,
  lang,
  onSelect,
}: {
  current: number;
  maxReachable: number;
  lang: Language;
  onSelect?: (i: number) => void;
}) {
  return (
    <ol className="list-none m-0 p-0 flex flex-col gap-1 lg:sticky lg:top-[120px]">
      {CLAIM_STEPS.map((s, i) => {
        const past = i < current;
        const cur = i === current;
        const reach = i <= maxReachable;
        return (
          <li key={i}>
            <button
              onClick={() => reach && onSelect?.(i)}
              disabled={!reach || !onSelect}
              className="w-full grid grid-cols-[38px_1fr] gap-3 items-center px-3 py-2.5 rounded-[14px] border-0 text-left"
              style={{ background: cur ? '#F6E9E2' : 'transparent', cursor: reach && onSelect ? 'pointer' : 'default' }}
            >
              <span
                className="w-[34px] h-[34px] rounded-full flex items-center justify-center font-mono font-bold text-[13px]"
                style={{
                  background: past ? '#E61A21' : '#fff',
                  color: past ? '#fff' : cur ? '#E61A21' : '#7D6F86',
                  border: `2px solid ${past || cur ? '#E61A21' : 'rgba(26,26,26,.15)'}`,
                }}
              >
                {past ? '✓' : i + 1}
              </span>
              <span className="flex flex-col">
                <span className="font-bold text-[15px]" style={{ color: reach ? '#1A1A1A' : '#7D6F86' }}>
                  {lang === 'es' ? s.es : s.en}
                </span>
                <span className="text-[12px] text-grey">{lang === 'es' ? s.whoEs : s.whoEn}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
