type Mode = 'policyholder' | 'agent';

/** Shield with a roofline top, arched doorway and round window. Cut-outs take the surface color. */
export function LogoMark({ mode = 'policyholder', size = 36, bg }: { mode?: Mode; size?: number; bg?: string }) {
  const fill = mode === 'agent' ? '#FF3B47' : '#E61A21';
  const hole = bg ?? (mode === 'agent' ? '#0E0E10' : '#FFFFFF');
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="flex-none">
      <path d="M32 4 L58 21 V33 C58 47.5 47 56 32 60.5 C17 56 6 47.5 6 33 V21 Z" fill={fill} />
      <path d="M25.5 52 V41 a6.5 6.5 0 0 1 13 0 V52 Z" fill={hole} />
      <circle cx="32" cy="24" r="3.2" fill={hole} />
    </svg>
  );
}

export function Logo({ mode = 'policyholder', size = 36, textSize = 28, bg }: { mode?: Mode; size?: number; textSize?: number; bg?: string }) {
  const agent = mode === 'agent';
  return (
    <span className="flex items-center gap-[7px]">
      <LogoMark mode={mode} size={size} bg={bg} />
      <span
        className="font-display italic font-black leading-none whitespace-nowrap"
        style={{ fontSize: textSize, color: agent ? '#fff' : '#1A1A1A' }}
      >
        Hey <span style={{ color: agent ? '#FF3B47' : '#E61A21' }}>Neighbor</span>
      </span>
    </span>
  );
}
