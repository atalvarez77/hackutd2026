export function RiskFactor({ label, why, value, max = 40 }: { label: string; why: string; value: number; max?: number }) {
  const c = value >= 30 ? '#EF8E87' : '#B3B7BF';
  return (
    <div className="grid grid-cols-[minmax(0,1.3fr)_90px_30px] gap-2.5 items-center">
      <span className="flex flex-col gap-0.5">
        <span className="font-bold text-ink">{label}</span>
        <span className="text-[13px] text-mist leading-snug">{why}</span>
      </span>
      <div className="h-1.5 rounded-md bg-white/[.08]">
        <div className="h-full rounded-md" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: c }} />
      </div>
      <span className="font-mono font-bold text-right">{value}</span>
    </div>
  );
}
