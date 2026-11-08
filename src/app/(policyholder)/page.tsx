'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useStore } from '@/context/StateFarmContext';
import { StatCounter } from '@/components/ui/StatCounter';
import { LogoMark } from '@/components/brand/Logo';
import { first, initials, NORA_PHONE, TIER_LIGHT, TIER_RANK } from '@/lib/hn';
import { makeT, tx } from '@/lib/i18n';
import type { UrgencyLevel } from '@/types/statefarm';

export default function HomePage() {
  const router = useRouter();
  const { customers, activeCustomer, setActiveCustomerId, priorityOverride, claims, callStatus } = useStore();
  const lang = activeCustomer.language;
  const T = makeT(lang);
  const [need, setNeed] = useState('damage');
  const [zip, setZip] = useState(activeCustomer.zip);

  const NEEDS = [
    { k: 'damage', label: T('Report damage', 'Reportar daños'), sub: T('Pipes, roof, trees', 'Tuberías, techo, árboles'), href: '/customer#call', go: T('Have Nora call me', 'Que Nora me llame') },
    { k: 'power', label: T('No power or heat', 'Sin luz o calefacción'), sub: T('Medical devices, cold', 'Equipo médico, frío'), href: '/customer#call', go: T('Call me now', 'Llámenme ahora') },
    { k: 'claim', label: T('Check my claim', 'Ver mi reclamo'), sub: T('Status, crew, next steps', 'Estado, equipo, próximos pasos'), href: '/customer#claims', go: T('View my claim', 'Ver mi reclamo') },
    { k: 'ok', label: T('I’m okay', 'Estoy bien'), sub: T('Let us know you’re safe', 'Avísenos que está a salvo'), href: '/customer#call', go: T('Check in', 'Reportarme') },
  ];
  const TILES = [
    { n: '01', title: T('File a claim', 'Iniciar un reclamo'), body: T('Report storm damage. If you talked to Nora on a welfare call, she may have filed it already.', 'Reporte daños por tormenta. Si habló con Nora en una llamada, puede que ya lo haya iniciado.'), cta: T('Start', 'Empezar'), href: '/customer/claim' },
    { n: '02', title: T('Check my claim', 'Ver mi reclamo'), body: T('See where your claim is, who’s been sent and when they’re due.', 'Vea cómo va su reclamo, a quién enviamos y cuándo llegan.'), cta: T('View status', 'Ver estado'), href: '/customer#claims' },
    { n: '03', title: T('Get a check-in call', 'Recibir una llamada'), body: T('Nora calls you now in English or Spanish. Report damage and finish your claim on the call.', 'Nora le llama ahora en inglés o español. Reporte daños y termine su reclamo en la llamada.'), cta: T('Start call', 'Iniciar llamada'), href: '/customer#call' },
    { n: '04', title: T('Emergency contacts', 'Contactos de emergencia'), body: T('Tell us who to notify when we can’t reach you during a storm.', 'Díganos a quién avisar si no podemos comunicarnos con usted.'), cta: T('Update', 'Actualizar'), href: '/customer#contacts' },
  ];
  const STEPS = [
    { title: T('We spot who’s at risk', 'Detectamos quién está en riesgo'), body: T('When a storm alert comes in, we look at age, whether you live alone, your language and your home.', 'Cuando llega una alerta, vemos la edad, si vive solo, su idioma y su casa.') },
    { title: T('Nora calls your phone', 'Nora llama a su teléfono'), body: T('A normal phone call in English or Spanish. She listens for hazards like frozen pipes, power outages or no answer.', 'Una llamada normal en inglés o español. Escucha si hay peligros como tuberías congeladas, apagones o si nadie contesta.') },
    { title: T('You finish the claim on the call', 'Termina el reclamo en la llamada'), body: T('Nora fills it in from what State Farm already has. You confirm by voice, and she submits it before you hang up.', 'Nora lo llena con lo que State Farm ya tiene. Usted confirma de palabra y ella lo envía antes de colgar.') },
    { title: T('A person steps in', 'Una persona le atiende'), body: T('Say “I need a person” any time. An agent joins the same call, already knowing your situation.', 'Diga “necesito una persona” cuando quiera. Un agente se une a la misma llamada y ya conoce su situación.') },
  ];

  const n = NEEDS.find((x) => x.k === need)!;
  const eff = (id: string, u: UrgencyLevel) => priorityOverride[id] || u;
  const tierLabel = (t: UrgencyLevel) => (lang === 'es' ? { High: 'Alta', Medium: 'Media', Low: 'Baja' }[t] : t);
  const sorted = [...customers].sort((a, b) => TIER_RANK[eff(a.id, a.urgency)] - TIER_RANK[eff(b.id, b.urgency)] || b.riskScore - a.riskScore);
  const high = customers.filter((c) => eff(c.id, c.urgency) === 'High').length;
  const live = Object.values(callStatus).filter((s) => s === 'ai' || s === 'agent').length;
  const drafted = Object.values(claims).filter((c) => c.status === 'draft' || c.status === 'submitted').length;

  return (
    <>
      <section className="bg-petal">
        <div className="max-w-[1280px] mx-auto px-[clamp(16px,3vw,40px)] py-[clamp(32px,5vw,64px)] grid gap-10 items-stretch grid-cols-1 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <div className="hn-label text-sm text-sf-red">{T('Meet Nora · AI welfare checks', 'Conozca a Nora · llamadas de bienestar con IA')}</div>
            <h1 className="m-0 font-display italic font-black leading-[0.86] tracking-[-0.01em] text-[clamp(64px,8vw,124px)]">
              {T('We knock', 'Tocamos')} <span className="text-sf-red">{T('first.', 'primero.')}</span>
            </h1>
            <div className="font-display font-black leading-tight text-[clamp(24px,2.4vw,34px)] max-w-[560px]">
              {T('When the storm hits, we call you before you have to call us.', 'Cuando llega la tormenta, le llamamos antes de que usted tenga que llamarnos.')}
            </div>
            <p className="m-0 max-w-[520px] text-[19px] leading-relaxed text-grey">
              {T(
                'Nora is State Farm’s AI neighbor. In extreme weather she calls the people most at risk in English or Spanish, spots hazards like frozen pipes, and files the claim with you right there on the call.',
                'Nora es la vecina con IA de State Farm. En clima extremo llama a las personas en mayor riesgo, en inglés o español, detecta peligros como tuberías congeladas y hace el reclamo con usted en la misma llamada.',
              )}
            </p>
            <div className="bg-white rounded-[20px] p-[22px] flex flex-col gap-4 max-w-[560px] shadow-[0_12px_32px_rgba(26,26,26,.10)]">
              <div className="font-semibold text-[22px]">{T('What do you need right now?', '¿Qué necesita ahora?')}</div>
              <div className="grid grid-cols-2 gap-2.5">
                {NEEDS.map((x) => (
                  <button
                    key={x.k}
                    onClick={() => setNeed(x.k)}
                    className="flex flex-col items-start gap-1 p-3.5 rounded-xl text-left cursor-pointer"
                    style={{ border: `2px solid ${x.k === need ? '#ED1D24' : 'rgba(26,26,26,.12)'}`, background: x.k === need ? 'rgba(237,29,36,.06)' : '#fff' }}
                  >
                    <span className="font-bold text-base">{x.label}</span>
                    <span className="text-[13px] text-grey">{x.sub}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2.5">
                <input
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  placeholder={T('ZIP code', 'Código postal')}
                  aria-label={T('ZIP code', 'Código postal')}
                  className="flex-[1_1_140px] h-[52px] px-4 rounded-full border-2 border-charcoal/20 font-mono font-bold text-[17px] outline-none"
                />
                <Link
                  href={n.href}
                  className="flex-[1_1_180px] flex items-center justify-center h-[52px] rounded-full bg-sf-red text-white no-underline font-bold text-[17px] hover:bg-charcoal"
                >
                  {n.go}
                </Link>
              </div>
              <div className="text-[14px] text-grey">
                {T('Or call Nora any time:', 'O llame a Nora cuando quiera:')} <span className="font-mono font-bold text-charcoal">{NORA_PHONE}</span>
              </div>
            </div>
          </div>

          <div className="relative h-full min-h-[360px]">
            {/* Drop a licensed stock photo at public/hero.jpg (neighbor checking on an older adult in winter). */}
            <div
              className="absolute inset-0 rounded-[28px] bg-cover bg-center"
              style={{ backgroundImage: "url('/hero.jpg'), linear-gradient(160deg,#F6E9E2 0%,#E3C3B2 55%,#7D6F86 100%)" }}
              role="img"
              aria-label={T('A neighbor checking on an older neighbor in the cold', 'Un vecino visitando a una vecina mayor en el frío')}
            />
            <div className="absolute -left-3 bottom-7 bg-white rounded-2xl px-4 py-3.5 shadow-[0_12px_32px_rgba(26,26,26,.16)] flex gap-3 items-center max-w-[300px]">
              <span className="w-3 h-3 rounded-full bg-blue flex-none" />
              <div className="flex flex-col gap-0.5">
                <span className="font-bold text-[15px]">{T(`${first(activeCustomer.name)}, your check-in is set`, `${first(activeCustomer.name)}, su llamada está programada`)}</span>
                <span className="text-[13px] text-grey">
                  {T('Phone call at 4:18 PM', 'Llamada a las 4:18 PM')} · {lang === 'es' ? 'Español' : 'English'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-charcoal text-white">
        <div className="max-w-[1280px] mx-auto grid grid-cols-2 lg:grid-cols-4">
          {[
            { hex: T('dallas county', 'condado de dallas'), n: '2,412', label: T('policyholders Nora checked tonight', 'asegurados que Nora revisó esta noche'), c: '#fff' },
            { hex: T('ranked', 'clasificados'), n: '9s', label: T('to rank everyone by risk', 'para ordenar a todos por riesgo'), c: '#ED1D24' },
            { hex: 'en / es', n: '2', label: T('languages on every call', 'idiomas en cada llamada'), c: '#fff' },
            { hex: T('pre-filed', 'pre-llenado'), n: '0', label: T('forms you have to fill in', 'formularios que tiene que llenar'), c: '#ED1D24' },
          ].map((k) => (
            <div key={k.label} className="px-[clamp(16px,2vw,28px)] py-[30px] border-l border-white/10">
              <StatCounter hex={k.hex} n={k.n} label={k.label} color={k.c} />
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-[1280px] w-full mx-auto px-[clamp(16px,3vw,40px)] pt-14 pb-6">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {TILES.map((t) => (
            <Link
              key={t.n}
              href={t.href}
              className="group flex flex-col gap-2.5 p-[22px] rounded-[18px] border-2 border-charcoal bg-white no-underline transition-colors hover:bg-charcoal hover:text-white"
            >
              <span className="hn-label text-[13px] text-sf-red">{t.n}</span>
              <span className="font-display font-black text-[26px] leading-[1.05]">{t.title}</span>
              <span className="text-[15px] leading-snug opacity-80">{t.body}</span>
              <span className="mt-auto font-bold text-[15px] text-sf-red">{t.cta} →</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="max-w-[1280px] w-full mx-auto px-[clamp(16px,3vw,40px)] py-14">
        <div className="grid gap-10 items-stretch grid-cols-1 lg:grid-cols-2">
          <div className="min-h-[420px] h-full rounded-[28px] bg-charcoal text-white p-8 flex flex-col justify-between">
            <div className="hn-label text-sm text-petal">{T('Live · tonight', 'En vivo · esta noche')}</div>
            <div className="flex flex-col gap-3.5">
              <div className="font-display font-black leading-[0.85] text-[clamp(64px,8vw,112px)]">{customers.length}</div>
              <div className="font-semibold text-2xl leading-tight max-w-[340px]">{T('neighbors are being watched in Dallas County right now', 'vecinos están siendo atendidos en el condado de Dallas ahora mismo')}</div>
            </div>
            <div className="flex gap-2.5 flex-wrap font-bold text-sm">
              <span className="px-3 py-2 rounded-full bg-sf-red">
                {high} {T('high urgency', 'urgencia alta')}
              </span>
              <span className="px-3 py-2 rounded-full bg-blue">
                {live} {T('calls live', 'llamadas activas')}
              </span>
              <span className="px-3 py-2 rounded-full bg-lavender">
                {drafted} {T('claims drafted', 'reclamos iniciados')}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-[18px]">
            <div className="hn-label text-sm text-lavender">{T('How it works', 'Cómo funciona')}</div>
            <h2 className="m-0 font-display font-black leading-none text-[clamp(40px,4.4vw,60px)]">{T('Help that shows up first', 'Ayuda que llega primero')}</h2>
            {STEPS.map((s, i) => (
              <div key={i} className="grid grid-cols-[56px_1fr] gap-4 py-4 border-t border-charcoal/12">
                <span className="font-display font-black text-[34px] leading-none text-sf-red">{i + 1}</span>
                <div className="flex flex-col gap-1">
                  <span className="font-bold text-[19px]">{s.title}</span>
                  <span className="text-base leading-relaxed text-grey">{s.body}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-petal-50 border-t border-charcoal/8">
        <div className="max-w-[1280px] mx-auto px-[clamp(16px,3vw,40px)] pt-14 pb-16 flex flex-col gap-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-2">
              <div className="hn-label text-sm text-lavender">{T('For judges', 'Para el jurado')}</div>
              <h2 className="m-0 font-display font-black text-[40px] leading-none">{T('Demo scenarios', 'Escenarios de demostración')}</h2>
            </div>
            <span className="italic font-medium text-base text-grey">{T('Pick a policyholder to open their portal as them.', 'Elija un asegurado para abrir su portal.')}</span>
          </div>
          <div className="grid gap-3.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((c) => {
              const tier = eff(c.id, c.urgency);
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setActiveCustomerId(c.id);
                    router.push('/customer');
                  }}
                  className="flex gap-3.5 items-center p-4 rounded-2xl bg-white text-left cursor-pointer"
                  style={{ border: `2px solid ${c.id === activeCustomer.id ? '#ED1D24' : 'rgba(26,26,26,.1)'}` }}
                >
                  <span className="w-[52px] h-[52px] rounded-full text-white flex items-center justify-center font-display font-black text-xl flex-none" style={{ background: TIER_LIGHT[tier] }}>
                    {initials(c.name)}
                  </span>
                  <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <span className="font-bold text-[17px]">{c.name}</span>
                    <span className="text-[13px] text-grey">
                      {c.age} · {c.livesAlone ? T('Lives alone', 'Vive solo') : T('With family', 'Con familia')} · {c.language.toUpperCase()}
                    </span>
                    <span className="italic font-medium text-[13px] text-lavender truncate">{tx(c.detectedHazard, lang)}</span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="font-mono font-bold text-[22px]">{c.riskScore}</span>
                    <span className="px-2 py-0.5 rounded-md text-white font-bold text-[11px] uppercase" style={{ background: TIER_LIGHT[tier] }}>
                      {tierLabel(tier)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="bg-charcoal text-petal">
        <div className="max-w-[1280px] mx-auto px-[clamp(16px,3vw,40px)] pt-12 pb-7 grid gap-7 grid-cols-2 md:grid-cols-4">
          <div className="flex flex-col gap-3">
            <span className="flex items-center gap-1.5">
              <LogoMark size={30} bg="#1A1A1A" />
              <span className="font-display italic font-black text-[22px] text-white">
                Hey <span className="text-sf-red">Neighbor</span>
              </span>
            </span>
            <span className="text-sm leading-relaxed text-[#B4A9BC]">{T('A HackUTD 2026 prototype for State Farm. All data is mock data.', 'Un prototipo de HackUTD 2026 para State Farm. Todos los datos son de prueba.')}</span>
          </div>
          <div className="flex flex-col gap-2.5 text-[15px]">
            <span className="hn-label text-[11px] text-[#B4A9BC]">{T('Policyholders', 'Asegurados')}</span>
            <Link href="/customer" className="text-white no-underline">
              {T('My Portal', 'Mi portal')}
            </Link>
            <Link href="/customer/claim" className="text-white no-underline">
              {T('File a claim', 'Iniciar un reclamo')}
            </Link>
          </div>
          <div className="flex flex-col gap-2.5 text-[15px]">
            <span className="hn-label text-[11px] text-[#B4A9BC]">{T('Agents', 'Agentes')}</span>
            <Link href="/agent" className="text-white no-underline">
              {T('Agent console', 'Consola de agentes')}
            </Link>
          </div>
          <div className="flex flex-col gap-2.5 text-[15px]">
            <span className="hn-label text-[11px] text-[#B4A9BC]">{T('Built with', 'Hecho con')}</span>
            <span>NVIDIA Nemotron</span>
            <span>SpacetimeDB</span>
            <span>Next.js 16</span>
          </div>
        </div>
      </footer>
    </>
  );
}
