'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet';
import type { CustomerProfile, UrgencyLevel } from '@/types/statefarm';
import { COORDS } from '@/lib/hn';

const C: Record<UrgencyLevel, string> = { High: '#FF3B47', Medium: '#9A93A3', Low: '#4E5A66' };
const N = 2412;

/** Deterministic fake policyholder locations across DFW. */
function generatePoints() {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: N }, () => {
    const lat = 32.62 + rnd() * 0.5;
    const lng = -97.42 + rnd() * 0.98;
    const r = rnd();
    return { lat, lng, t: (r < 0.07 ? 'High' : r < 0.3 ? 'Medium' : 'Low') as UrgencyLevel };
  });
}

/** Scale map: 2,412 policyholders streamed in ~120 per frame, plus named pins for the demo customers. */
export default function TriageMap({
  customers,
  tierOf,
  onSelect,
}: {
  customers: CustomerProfile[];
  tierOf: (c: CustomerProfile) => UrgencyLevel;
  onSelect: (id: string) => void;
}) {
  const pts = useMemo(() => generatePoints(), []);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let raf = 0;
    const step = () => {
      setShown((s) => {
        const n = Math.min(N, s + 120);
        if (n < N) raf = requestAnimationFrame(step);
        return n;
      });
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const hi = pts.slice(0, shown).filter((p) => p.t === 'High').length;

  return (
    <div className="hn-map relative flex-1 min-h-0">
      <MapContainer center={[32.85, -96.95]} zoom={10} zoomControl={false} preferCanvas className="absolute inset-0 h-full w-full">
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={18} attribution="© OpenStreetMap contributors" />
        {pts.slice(0, shown).map((p, i) => (
          <CircleMarker key={i} center={[p.lat, p.lng]} radius={p.t === 'High' ? 3.4 : 2.2} pathOptions={{ stroke: false, fillColor: C[p.t], fillOpacity: p.t === 'High' ? 0.95 : 0.55 }} />
        ))}
        {customers.map((c) => (
          <CircleMarker
            key={c.id}
            center={COORDS[c.id] ?? [32.8, -96.8]}
            radius={9}
            pathOptions={{ color: '#fff', weight: 2, fillColor: C[tierOf(c)], fillOpacity: 1 }}
            eventHandlers={{ click: () => onSelect(c.id) }}
          >
            <Tooltip permanent direction="right" offset={[10, 0]} className="hn-pin-label">
              {c.name}
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
      <div className="absolute z-[500] left-4 top-4 flex gap-2.5 pointer-events-none">
        {[
          { h: '0x96c · dallas county', n: shown.toLocaleString(), l: 'POLICYHOLDERS TRIAGED', c: '#fff' },
          { h: '0x0a1 · nora', n: String(hi), l: 'HIGH URGENCY', c: '#FF3B47' },
        ].map((k) => (
          <div key={k.l} className="bg-panel/90 border border-white/10 rounded-[14px] px-4 py-3 text-white flex flex-col gap-0.5">
            <span className="font-mono text-[11px] text-mist">{k.h}</span>
            <span className="font-display font-black text-[34px] leading-none" style={{ color: k.c }}>
              {k.n}
            </span>
            <span className="hn-label text-[11px] text-mist">{k.l}</span>
          </div>
        ))}
      </div>
      <div className="absolute z-[500] right-4 top-4 flex gap-3 font-bold text-[12px] text-white bg-panel/90 border border-white/10 rounded-xl px-3.5 py-2.5">
        {(['High', 'Medium', 'Low'] as const).map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <i className="inline-block w-[9px] h-[9px] rounded-full" style={{ background: C[t] }} />
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
