/** Nora's avatar is a waveform. Bars animate only while she speaks. */
export function NoraWave({
  speaking = false,
  size = 26,
  bars = 5,
  width = 4,
  color = '#E61A21',
}: {
  speaking?: boolean;
  size?: number;
  bars?: number;
  width?: number;
  color?: string;
}) {
  return (
    <span className="inline-flex items-center flex-none" style={{ gap: Math.max(2, width - 1), height: size }} aria-label={speaking ? 'Nora is speaking' : 'Nora'}>
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          style={{
            width,
            height: '100%',
            borderRadius: width,
            background: color,
            transformOrigin: 'center',
            transform: speaking ? undefined : `scaleY(${0.3 + ((i * 37) % 5) / 8})`,
            animation: speaking ? `hnWave ${0.8 + ((i * 37) % 5) / 10}s ease-in-out ${(i * 0.1).toFixed(2)}s infinite` : 'none',
          }}
        />
      ))}
    </span>
  );
}
