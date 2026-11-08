'use client';

import Link from 'next/link';
import { useStore } from '@/context/StateFarmContext';
import { NoraChat } from '@/components/portal/NoraChat';
import { WelfareCall } from '@/components/portal/WelfareCall';
import { TalkToPerson } from '@/components/portal/TalkToPerson';
import { first, money, TIER_LIGHT } from '@/lib/hn';

export default function PortalPage() {
  const { activeCustomer: c, claims } = useStore();
  const es = c.language === 'es';
  const T = (en: string, sp: string) => (es ? sp : en);
  const claim = claims[c.id];
  const hasDraft = !!claim && claim.status !== 'none';
  const stage = !hasDraft ? 0 : claim.status === 'approved' ? 4 : claim.status === 'submitted' ? 2 : 1;
  const stages = es ? ['Borrador', 'Revisión', 'Aprobado', 'Enviado'] : ['Drafted', 'Agent review', 'Approved', 'Crew sent'];

  return (
    <>
      <section className="bg-petal">
        <div className="max-w-[1280px] mx-auto px-[clamp(16px,3vw,40px)] py-9 flex flex-wrap items-end justify-between gap-5">
          <div className="flex flex-col gap-2.5">
            <div className="hn-label text-sm text-sf-red">{T('My portal', 'Mi portal')}</div>
            <h1 className="m-0 font-display font-black leading-none text-[clamp(40px,4.6vw,64px)]">
              {T('Hi', 'Hola')}, {first(c.name)}.
            </h1>
            <div className="text-[17px] text-grey">
              {c.policy.type} · <span className="font-mono">{c.policy.policyNumber}</span> · {c.city} {c.state}
            </div>
          </div>
          <div className="flex gap-3 flex-wrap">
            <div className="px-[18px] py-3.5 rounded-2xl bg-white flex flex-col gap-0.5 min-w-[150px]">
              <span className="hn-label text-[10px] text-grey">{T('Storm risk', 'Riesgo')}</span>
              <span className="font-mono font-bold text-[30px]" style={{ color: TIER_LIGHT[c.urgency] }}>
                {c.riskScore}
              </span>
            </div>
            <div className="px-[18px] py-3.5 rounded-2xl bg-white flex flex-col gap-0.5 min-w-[180px] max-w-[300px]">
              <span className="hn-label text-[10px] text-grey">{T('Detected hazard', 'Peligro detectado')}</span>
              <span className="font-bold text-lg leading-snug">{c.detectedHazard}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-[1280px] w-full mx-auto px-[clamp(16px,3vw,40px)] pt-9 pb-16 grid gap-7 items-start grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))]">
        {/* On phones the call comes first: it's the fastest way to get everything done. */}
        <div className="order-2 lg:order-1">
          <NoraChat />
        </div>

        <div className="order-1 lg:order-2 flex flex-col gap-7">
          <WelfareCall key={c.id} />
          <TalkToPerson />

          <section id="claims" className="rounded-3xl border-2 border-charcoal p-6 flex flex-col gap-4 scroll-mt-[110px]">
            <div className="flex items-baseline gap-2.5">
              <span className="font-display font-black text-[28px]">{T('Claims', 'Reclamos')}</span>
              <span className="flex-1" />
              <span className="hn-label text-[13px] text-lavender">
                {claim?.status === 'approved' ? T('Approved', 'Aprobado') : claim?.status === 'submitted' ? T('Submitted', 'Enviado') : hasDraft ? T('Draft', 'Borrador') : ''}
              </span>
            </div>
            {hasDraft ? (
              <div className="flex flex-col gap-3.5 p-[18px] rounded-2xl bg-petal-25">
                <div className="flex justify-between gap-3 flex-wrap">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-bold text-lg">{claim.type}</span>
                    <span className="font-mono text-sm text-grey">
                      {claim.id}
                      {claim.number ? ' → ' + claim.number : ''}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-2xl">{money(claim.amount)}</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {stages.map((label, i) => (
                    <div key={label} className="flex flex-col gap-1.5">
                      <span className="h-1.5 rounded-md" style={{ background: i < stage ? '#ED1D24' : '#EFD9CE' }} />
                      <span className="font-bold text-[12px]" style={{ color: i < stage ? '#1A1A1A' : '#474954' }}>
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-[15px] text-grey leading-relaxed">
                {T('No open claims. If Nora finds damage on a call or in chat, she’ll start one with you.', 'No hay reclamos abiertos. Si Nora encuentra daños, iniciará uno con usted.')}
              </div>
            )}
            <Link href="/customer/claim" className="flex items-center justify-center h-[52px] rounded-full bg-charcoal text-white no-underline font-extrabold text-base hover:bg-sf-red">
              {!hasDraft
                ? T('File a claim →', 'Iniciar un reclamo →')
                : claim.status === 'draft'
                  ? T('Continue my claim →', 'Continuar mi reclamo →')
                  : T('View claim progress →', 'Ver el progreso →')}
            </Link>
            {c.claimsHistory.map((pc) => (
              <div key={pc.id} className="flex gap-3 text-[15px] pt-3 border-t border-charcoal/12">
                <span className="font-mono text-grey">{pc.date.slice(0, 4)}</span>
                <span className="flex-1">{pc.type}</span>
                <span className="font-mono">{money(pc.amount)}</span>
              </div>
            ))}
          </section>

          <section id="contacts" className="rounded-3xl border-2 border-charcoal p-6 flex flex-col gap-3 scroll-mt-[110px]">
            <span className="font-display font-black text-[28px]">{T('Emergency contacts', 'Contactos de emergencia')}</span>
            <div className="flex items-center gap-3 py-3 border-t border-charcoal/12">
              <span className="w-10 h-10 rounded-full bg-petal flex items-center justify-center font-display font-black text-[15px]">{c.emergencyContact.name[0]}</span>
              <div className="flex-1 flex flex-col">
                <span className="font-bold text-base">{c.emergencyContact.name}</span>
                <span className="text-sm text-grey">
                  {c.emergencyContact.relationship} · <span className="font-mono">{c.emergencyContact.phone}</span>
                </span>
              </div>
              <button className="h-[38px] px-3.5 rounded-full border-2 border-charcoal/20 bg-white font-bold text-[13px] cursor-pointer">{T('Edit', 'Editar')}</button>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
