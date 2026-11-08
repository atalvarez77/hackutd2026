'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useStore } from '@/context/StateFarmContext';
import { LogoMark } from '@/components/brand/Logo';
import { first, initials, NORA_PHONE, TIER_RANK } from '@/lib/hn';
import { makeT, tx } from '@/lib/i18n';
import type { UrgencyLevel } from '@/types/statefarm';

export default function HomePage() {
  const router = useRouter();
  const { customers, activeCustomer, setActiveCustomerId, priorityOverride, callStatus, claims } = useStore();
  const lang = activeCustomer.language;
  const T = makeT(lang);

  const TASKS = [
    { title: T('Have Nora call me', 'Que Nora me llame'), body: T('Report damage and finish the claim on one phone call.', 'Reporte daños y termine el reclamo en una sola llamada.'), href: '/customer#call' },
    { title: T('Check my claim', 'Ver mi reclamo'), body: T('Status, who’s been sent and what happens next.', 'Estado, a quién enviamos y qué sigue.'), href: '/customer#claims' },
    { title: T('Review a claim online', 'Revisar un reclamo en línea'), body: T('Prefer a screen? Everything Nora filled in is here.', '¿Prefiere la pantalla? Todo lo que Nora llenó está aquí.'), href: '/customer/claim' },
    { title: T('Emergency contact', 'Contacto de emergencia'), body: T('Who we text if we can’t reach you.', 'A quién avisamos si no le localizamos.'), href: '/customer#contacts' },
  ];
  const STEPS = [
    { title: T('We call you', 'Le llamamos'), body: T('When a storm alert hits your area, Nora calls the people most at risk first, in English or Spanish.', 'Cuando hay una alerta en su zona, Nora llama primero a quienes corren más riesgo, en inglés o español.') },
    { title: T('Tell us what happened', 'Cuéntenos qué pasó'), body: T('Just talk. Nora already has your policy and address, so there’s nothing to look up.', 'Solo hable. Nora ya tiene su póliza y dirección, así que no hay nada que buscar.') },
    { title: T('Confirm, don’t fill in', 'Confirme, no llene'), body: T('She reads the details back. You say yes or correct them.', 'Ella le lee los datos. Usted dice que sí o los corrige.') },
    { title: T('Get your claim number', 'Reciba su número de reclamo'), body: T('Submitted before you hang up, and texted to you.', 'Enviado antes de colgar, y se lo mandamos por mensaje.') },
  ];

  const eff = (id: string, u: UrgencyLevel) => priorityOverride[id] || u;
  const tierLabel = (t: UrgencyLevel) => (lang === 'es' ? { High: 'Alta', Medium: 'Media', Low: 'Baja' }[t] : t);
  const high = customers.filter((c) => eff(c.id, c.urgency) === 'High').length;
  const live = Object.values(callStatus).filter((s) => s === 'ai' || s === 'agent').length;
  const drafted = Object.values(claims).filter((c) => c.status === 'draft' || c.status === 'submitted').length;
  const sorted = [...customers].sort((a, b) => TIER_RANK[eff(a.id, a.urgency)] - TIER_RANK[eff(b.id, b.urgency)] || b.riskScore - a.riskScore);

  return (
    <>
      <section className="bg-petal">
        <div className="max-w-[1180px] mx-auto px-[clamp(16px,3vw,40px)] py-[clamp(40px,6vw,80px)] grid gap-12 items-center grid-cols-1 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
            <span className="text-[16px] font-semibold text-sf-red">{T('Meet Nora · storm check-in calls', 'Conozca a Nora · llamadas por tormenta')}</span>
            <h1 className="m-0 font-bold leading-[0.98] text-[clamp(52px,6.4vw,88px)] tracking-[-0.03em]">
              {T('We knock', 'Tocamos')} <span className="text-sf-red">{T('first.', 'primero.')}</span>
            </h1>
            <div className="font-semibold leading-snug text-[clamp(22px,2.2vw,28px)] max-w-[540px]">
              {T('Storm coming? We’ll call you before you have to call us.', '¿Viene una tormenta? Le llamamos antes de que usted tenga que llamarnos.')}
            </div>
            <p className="m-0 max-w-[520px] text-[20px] leading-relaxed text-grey">
              {T(
                'Nora is State Farm’s AI assistant for severe weather. She checks that you’re safe and, if something’s damaged, files the claim with you on the same call.',
                'Nora es la asistente de IA de State Farm para el mal tiempo. Confirma que usted esté bien y, si algo se dañó, hace el reclamo con usted en la misma llamada.',
              )}
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Link href="/customer#call" className="h-[52px] px-7 rounded-full bg-sf-red text-white no-underline font-semibold text-[18px] flex items-center hover:bg-[#C8161C]">
                {T('Have Nora call me', 'Que Nora me llame')}
              </Link>
              <Link href="/customer#claims" className="h-[52px] px-7 rounded-full border border-charcoal/40 text-charcoal no-underline font-semibold text-[18px] flex items-center hover:border-charcoal">
                {T('Check a claim', 'Ver un reclamo')}
              </Link>
            </div>
            <div className="text-[16px] text-grey">
              {T('Or call', 'O llame al')} <span className="font-semibold text-charcoal">{NORA_PHONE}</span> {T('any time, day or night.', 'a cualquier hora.')}
            </div>
          </div>

          <div className="rounded-2xl bg-white shadow-[0_10px_30px_rgba(26,26,26,.08)] p-[clamp(20px,3vw,32px)] flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <LogoMark size={36} />
              <div className="flex flex-col">
                <span className="font-semibold text-[18px]">{T(`Hi ${first(activeCustomer.name)}`, `Hola ${first(activeCustomer.name)}`)}</span>
                <span className="text-[15px] text-grey">
                  {tx(activeCustomer.policy.type, lang)} · {activeCustomer.city}, {activeCustomer.state}
                </span>
              </div>
            </div>
            <div className="rounded-xl bg-petal-25 border border-line p-4 flex flex-col gap-1">
              <span className="text-[14px] text-grey">{T('Weather alert', 'Alerta del clima')}</span>
              <span className="font-semibold text-[18px]">{tx(activeCustomer.weatherAlert.title, lang)}</span>
              <span className="text-[15px] text-grey leading-snug">{tx(activeCustomer.weatherAlert.description, lang)}</span>
            </div>
            <div className="rounded-xl bg-petal-25 border border-line p-4 flex items-center gap-3">
              <span className="flex-1 flex flex-col">
                <span className="font-semibold text-[17px]">{T('Your check-in call', 'Su llamada de bienestar')}</span>
                <span className="text-[15px] text-grey">
                  {T('Today, 4:18 PM', 'Hoy, 4:18 PM')} · {lang === 'es' ? 'Español' : 'English'}
                </span>
              </span>
              <Link href="/customer#call" className="text-[16px] font-semibold text-sf-red no-underline">
                {T('Open', 'Abrir')}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-charcoal text-white">
        <div className="max-w-[1180px] mx-auto grid grid-cols-2 lg:grid-cols-4">
          {[
            { n: '2,412', label: T('policyholders Nora checked tonight', 'asegurados que Nora revisó esta noche') },
            { n: '9 sec', label: T('to rank everyone by risk', 'para ordenar a todos por riesgo') },
            { n: 'EN / ES', label: T('on every call', 'en cada llamada') },
            { n: '0', label: T('forms to fill in', 'formularios que llenar') },
          ].map((k, i) => (
            <div key={k.label} className={`px-[clamp(16px,2.4vw,32px)] py-7 flex flex-col gap-1 ${i ? 'border-l border-white/10' : ''}`}>
              <span className="font-bold text-[clamp(30px,3.4vw,42px)] leading-none">{k.n}</span>
              <span className="text-[16px] text-white/70">{k.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-[1180px] w-full mx-auto px-[clamp(16px,3vw,40px)] py-14 flex flex-col gap-6">
        <h2 className="m-0 font-bold text-[30px]">{T('What do you need?', '¿Qué necesita?')}</h2>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {TASKS.map((t) => (
            <Link key={t.title} href={t.href} className="flex flex-col gap-2 p-5 rounded-xl border border-line bg-white no-underline hover:border-charcoal/50">
              <span className="font-semibold text-[19px]">{t.title}</span>
              <span className="text-[16px] leading-snug text-grey">{t.body}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-petal-50">
        <div className="max-w-[1180px] mx-auto px-[clamp(16px,3vw,40px)] py-14 grid gap-10 items-stretch grid-cols-1 lg:grid-cols-2">
          <div className="rounded-2xl bg-charcoal text-white p-8 flex flex-col justify-between gap-8 min-h-[360px]">
            <span className="text-[16px] font-semibold text-white/70">{T('Live tonight', 'En vivo esta noche')}</span>
            <div className="flex flex-col gap-2">
              <span className="font-bold text-[clamp(56px,6vw,84px)] leading-none">{customers.length}</span>
              <span className="font-semibold text-[22px] leading-snug max-w-[340px]">{T('neighbors Nora is watching in Dallas County right now', 'vecinos que Nora está atendiendo en el condado de Dallas')}</span>
            </div>
            <div className="flex gap-2 flex-wrap text-[15px]">
              <span className="px-3 py-1.5 rounded-full bg-sf-red font-semibold">
                {high} {T('high urgency', 'urgencia alta')}
              </span>
              <span className="px-3 py-1.5 rounded-full bg-white/12">
                {live} {T('calls live', 'llamadas activas')}
              </span>
              <span className="px-3 py-1.5 rounded-full bg-white/12">
                {drafted} {T('claims started', 'reclamos iniciados')}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <h2 className="m-0 font-bold text-[34px] leading-tight">{T('A claim in four steps. Zero forms.', 'Un reclamo en cuatro pasos. Cero formularios.')}</h2>
          <ol className="m-0 p-0 list-none flex flex-col">
            {STEPS.map((s, i) => (
              <li key={i} className="grid grid-cols-[40px_1fr] gap-3 py-4 border-t border-line first:border-t-0 first:pt-0">
                <span className="w-8 h-8 rounded-full border border-charcoal/30 flex items-center justify-center font-semibold text-[16px]">{i + 1}</span>
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold text-[19px]">{s.title}</span>
                  <span className="text-[16px] leading-relaxed text-grey">{s.body}</span>
                </span>
              </li>
            ))}
          </ol>
            <p className="m-0 text-[16px] text-grey leading-relaxed">
              {T(
                'Say “agent” or press 1 at any point and a State Farm person joins the same call, already caught up.',
                'Diga “agente” u oprima 1 en cualquier momento y una persona de State Farm se une a la misma llamada, ya enterada.',
              )}
            </p>
          </div>
        </div>
      </section>

      <section className="max-w-[1180px] w-full mx-auto px-[clamp(16px,3vw,40px)] pt-14 pb-16 flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="m-0 font-bold text-[26px]">{T('Demo: open the portal as…', 'Demo: abrir el portal como…')}</h2>
          <span className="text-[15px] text-grey">{T('Mock policyholders for HackUTD judges.', 'Asegurados de prueba para el jurado de HackUTD.')}</span>
        </div>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((c) => {
            const tier = eff(c.id, c.urgency);
            const on = c.id === activeCustomer.id;
            return (
              <button
                key={c.id}
                onClick={() => {
                  setActiveCustomerId(c.id);
                  router.push('/customer');
                }}
                className="flex gap-3 items-center p-4 rounded-xl bg-white text-left cursor-pointer border"
                style={{ borderColor: on ? '#1A1A1A' : '#DEDBD6' }}
              >
                <span className="w-11 h-11 rounded-full bg-petal flex items-center justify-center font-semibold text-[16px] flex-none">{initials(c.name)}</span>
                <span className="flex-1 min-w-0 flex flex-col">
                  <span className="font-semibold text-[17px]">{c.name}</span>
                  <span className="text-[14px] text-grey truncate">
                    {c.age} · {c.livesAlone ? T('Lives alone', 'Vive solo') : T('With family', 'Con familia')} · {tx(c.detectedHazard, lang)}
                  </span>
                </span>
                <span className="text-[14px] font-semibold" style={{ color: tier === 'High' ? '#C8161C' : '#474954' }}>
                  {tierLabel(tier)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <footer className="border-t border-line bg-petal-25">
        <div className="max-w-[1180px] mx-auto px-[clamp(16px,3vw,40px)] py-10 grid gap-7 grid-cols-2 md:grid-cols-4 text-[15px]">
          <div className="flex flex-col gap-2 col-span-2 md:col-span-1">
            <span className="flex items-center gap-2 font-semibold text-[18px]">
              <LogoMark size={26} /> HeyNeighbor
            </span>
            <span className="text-grey leading-relaxed">{T('A HackUTD 2026 prototype for State Farm. All data is mock data.', 'Un prototipo de HackUTD 2026 para State Farm. Todos los datos son de prueba.')}</span>
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-semibold">{T('Policyholders', 'Asegurados')}</span>
            <Link href="/customer" className="text-grey no-underline hover:text-charcoal">{T('My portal', 'Mi portal')}</Link>
            <Link href="/customer/claim" className="text-grey no-underline hover:text-charcoal">{T('Review a claim', 'Revisar un reclamo')}</Link>
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-semibold">{T('Agents', 'Agentes')}</span>
            <Link href="/agent" className="text-grey no-underline hover:text-charcoal">{T('Agent console', 'Consola de agentes')}</Link>
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-semibold">{T('Built with', 'Hecho con')}</span>
            <span className="text-grey">NVIDIA Nemotron · SpacetimeDB · Next.js</span>
          </div>
        </div>
      </footer>
    </>
  );
}
