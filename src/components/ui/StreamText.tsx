'use client';

import { useEffect, useState } from 'react';

/**
 * Reveals text ~3 chars every 70ms with a ▍ cursor. Catches up correctly when the
 * tab was in the background by measuring elapsed time instead of counting ticks.
 * Whether to animate is decided once, on mount, so a line that started typing keeps typing.
 */
export function StreamText({ text, animate }: { text: string; animate: boolean }) {
  const [anim] = useState(animate);
  const [n, setN] = useState(anim ? 0 : Infinity);

  useEffect(() => {
    if (!anim) return;
    const start = Date.now();
    const iv = setInterval(() => {
      const chars = Math.floor(((Date.now() - start) / 70) * 3);
      setN(chars);
      if (chars >= text.length) clearInterval(iv);
    }, 70);
    return () => clearInterval(iv);
  }, [anim, text]);

  return (
    <>
      {text.slice(0, n)}
      {n < text.length && <span className="opacity-70"> ▍</span>}
    </>
  );
}
