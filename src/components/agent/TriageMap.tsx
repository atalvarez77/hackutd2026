'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet';
import type { CustomerProfile, UrgencyLevel } from '@/types/statefarm';
import { COORDS } from '@/lib/hn';

const C: Record<UrgencyLevel, string> = { High: '#E0605A', Medium: '#B3B7BF', Low: '#4E5A66' };
const N = 2412;

/** Deterministic fake policyholder locations across DFW. */
function generatePoints() {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const hi = 0.07;
  const med = 0.3;
  return Array.from({ length: N }, () => {
    const lat = 32.62 + rnd() * 0.5;
    const lng = -97.42 + rnd() * 0.98;
    const r = rnd();
    return { lat, lng, t: (r < hi ? 'High' : r < med ? 'Medium' : 'Low') as UrgencyLevel };
  });
}

/**
 * Scale map: 2,412 policyholders streamed in, plus named pins for the demo customers.
 * Pins and their name labels are clickable; the selected person gets a card with their status.
 */
export default function TriageMap({
  customers,
  tierOf,
  selectedId,
  callLabel,
  onSelect,
  onOpen,
}: {
  customers: CustomerProfile[];
  tierOf: (c: CustomerProfile) => UrgencyLevel;
  selectedId: string;
  callLabel: (c: CustomerProfile) => string;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const pts = useMemo(() => generatePoints(), []);
  const [shown, setShown] = useState(0);
  const [cardOpen, setCardOpen] = useState(false);

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
  const sel = customers.find((c) => c.id === selectedId);
  const pick = (id: string) => {
    onSelect(id);
    setCardOpen(true);
  };

  return (
    <div className="hn-map relative flex-1 min-h-0">
      <MapContainer center={[32.85, -96.95]} zoom={10} zoomControl={false} preferCanvas className="absolute inset-0 h-full w-full">
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={18} attribution="© OpenStreetMap contributors" />
        {pts.slice(0, shown).map((p, i) => (
          // Not interactive: otherwise these canvas dots (drawn after the pins) swallow pin clicks.
          <CircleMarker
            key={i}
            center={[p.lat, p.lng]}
            radius={p.t === 'High' ? 3.2 : 2.2}
            interactive={false}
            pathOptions={{ stroke: false, fillColor: C[p.t], fillOpacity: p.t === 'High' ? 0.85 : 0.5 }}
          />
        ))}
        {customers.map((c) => {
          const on = c.id === selectedId;
          return (
            <CircleMarker
              // Re-mounted once the dots finish streaming so the pins are drawn on top of them.
              key={c.id + (on ? '-sel' : '') + (shown === N ? '-top' : '')}
              center={COORDS[c.id] ?? [32.8, -96.8]}
              radius={on ? 11 : 9}
              bubblingMouseEvents={false}
              pathOptions={{ color: on ? '#F3F4F6' : '#141417', weight: on ? 3 : 2, fillColor: C[tierOf(c)], fillOpacity: 1 }}
              eventHandlers={{ click: () => pick(c.id) }}
            >
              <Tooltip permanent interactive direction="right" offset={[10, 0]} className={`hn-pin-label${on ? ' is-sel' : ''}`} eventHandlers={{ click: () => pick(c.id) }}>
                {c.name}
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <div className="absolute z-[500] left-4 top-4 flex gap-2.5 pointer-events-none">
        {[
          { n: shown.toLocaleString(), l: 'policyholders in the zone', c: '#F3F4F6' },
          { n: String(hi), l: 'high urgency', c: '#EF8E87' },
        ].map((k) => (
          <div key={k.l} className="bg-panel/90 border border-white/10 rounded-[10px] px-3.5 py-2.5 text-white flex flex-col">
            <span className="font-semibold text-[24px] leading-tight" style={{ color: k.c }}>
              {k.n}
            </span>
            <span className="text-[13px] text-mist">{k.l}</span>
          </div>
        ))}
      </div>
      <div className="absolute z-[500] right-4 top-4 flex gap-3 text-[13px] text-white bg-panel/90 border border-white/10 rounded-[10px] px-3 py-2">
        {(['High', 'Medium', 'Low'] as const).map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <i className="inline-block w-[9px] h-[9px] rounded-full" style={{ background: C[t] }} />
            {t}
          </span>
        ))}
      </div>

      {cardOpen && sel && (
        <div className="absolute z-[500] left-4 bottom-6 w-[320px] bg-panel border border-white/10 rounded-xl p-4 text-ink flex flex-col gap-3 hn-in">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0 flex flex-col">
              <span className="font-semibold text-[18px] truncate">{sel.name}</span>
              <span className="text-[14px] text-mist truncate">
                {sel.address}, {sel.city}
              </span>
            </div>
            <button onClick={() => setCardOpen(false)} aria-label="Close" className="w-8 h-8 rounded-md border border-white/[.1] bg-transparent text-ink cursor-pointer">
              ×
            </button>
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[14px]">
            <span className="text-mist">Priority</span>
            <span>
              {tierOf(sel)} · {sel.riskScore}
            </span>
            <span className="text-mist">Situation</span>
            <span>{sel.detectedHazard}</span>
            <span className="text-mist">Call</span>
            <span>{callLabel(sel)}</span>
            <span className="text-mist">Household</span>
            <span>
              {sel.age} · {sel.livesAlone ? 'lives alone' : 'with family'}
              {sel.language === 'es' ? ' · Spanish' : ''}
            </span>
          </div>
          <button onClick={() => onOpen(sel.id)} className="h-10 rounded-lg bg-ink text-panel font-semibold cursor-pointer">
            Show in queue
          </button>
        </div>
      )}
    </div>
  );
}
