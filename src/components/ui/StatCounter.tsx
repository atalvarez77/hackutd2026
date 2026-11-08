export function StatCounter({
  hex,
  n,
  label,
  color = '#fff',
  glow,
  agent = false,
}: {
  hex: string;
  n: React.ReactNode;
  label: string;
  color?: string;
  glow?: string;
  agent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[12px] text-mist">{hex}</span>
      <span
        className="font-display font-black leading-[0.9]"
        style={{ color, fontSize: agent ? 40 : 'clamp(52px,5vw,76px)', textShadow: glow ? `0 0 18px ${glow}` : undefined }}
      >
        {n}
      </span>
      <span className={agent ? 'hn-label text-[11px] text-mist' : 'font-bold text-base text-petal'}>{label}</span>
    </div>
  );
}
