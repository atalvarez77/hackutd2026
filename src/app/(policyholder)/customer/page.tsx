'use client';

import { useStore } from '@/context/StateFarmContext';
import { NoraChat } from '@/components/portal/NoraChat';
import { WelfareCall } from '@/components/portal/WelfareCall';
import { CallSummary } from '@/components/portal/CallSummary';
import { first, TIER_LIGHT } from '@/lib/hn';
import { makeT, tx } from '@/lib/i18n';

/**
 * The portal mirrors a phone call. Left: the call itself (on a real phone, that's all the
 * policyholder needs). Right: what Nora has done on the call, filling in live.
 */
export default function PortalPage() {
  const { activeCustomer: c } = useStore();
  const lang = c.language;
  const T = makeT(lang);

  return (
    <>
      <section className="bg-petal">
        <div className="max-w-[1280px] mx-auto px-[clamp(16px,3vw,40px)] py-8 flex flex-wrap items-end justify-between gap-5">
          <div className="flex flex-col gap-2">
            <div className="hn-label text-sm text-sf-red">{T('My portal', 'Mi portal')}</div>
            <h1 className="m-0 font-display font-black leading-none text-[clamp(40px,4.6vw,60px)]">
              {T('Hi', 'Hola')}, {first(c.name)}.
            </h1>
            <div className="text-[17px] text-grey">
              {tx(c.policy.type, lang)} · <span className="font-mono">{c.policy.policyNumber}</span> · {c.city} {c.state}
            </div>
          </div>
          <div className="flex gap-3 flex-wrap">
            <div className="px-[18px] py-3.5 rounded-2xl bg-white flex flex-col gap-0.5 min-w-[150px]">
              <span className="hn-label text-[10px] text-grey">{T('Risk', 'Riesgo')}</span>
              <span className="font-mono font-bold text-[30px]" style={{ color: TIER_LIGHT[c.urgency] }}>
                {c.riskScore}
              </span>
            </div>
            <div className="px-[18px] py-3.5 rounded-2xl bg-white flex flex-col gap-0.5 min-w-[180px] max-w-[300px]">
              <span className="hn-label text-[10px] text-grey">{T('Detected hazard', 'Peligro detectado')}</span>
              <span className="font-bold text-lg leading-snug">{tx(c.detectedHazard, lang)}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-[1280px] w-full mx-auto px-[clamp(16px,3vw,40px)] pt-9 pb-16 flex flex-col gap-8">
        {/* The call: phone on the left, live transcript on the right. */}
        <WelfareCall key={c.id} />

        <div className="grid gap-8 items-start grid-cols-1 lg:grid-cols-2">
          <CallSummary />

          <div className="flex flex-col gap-6">

          <section id="contacts" className="rounded-2xl border border-line p-6 flex flex-col gap-3 scroll-mt-[110px]">
            <h2 className="m-0 font-display font-black text-[24px] leading-none">{T('Emergency contact', 'Contacto de emergencia')}</h2>
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-petal flex items-center justify-center font-display font-black text-[15px]">{c.emergencyContact.name[0]}</span>
              <div className="flex-1 flex flex-col">
                <span className="font-bold text-base">{c.emergencyContact.name}</span>
                <span className="text-sm text-grey">
                  {tx(c.emergencyContact.relationship, lang)} · <span className="font-mono">{c.emergencyContact.phone}</span>
                </span>
              </div>
              <button className="h-[38px] px-3.5 rounded-full border border-line bg-white font-bold text-[13px] cursor-pointer">{T('Edit', 'Editar')}</button>
            </div>
            <span className="text-[13px] text-grey">
              {T('Nora texts them if she finds a problem or can’t reach you.', 'Nora le avisa por mensaje si encuentra un problema o no logra comunicarse con usted.')}
            </span>
          </section>

          <details className="group rounded-2xl border border-line ">
            <summary className="list-none cursor-pointer px-6 py-5 flex items-center gap-3">
              <span className="flex-1 flex flex-col">
                <span className="font-bold text-[17px]">{T('Can’t talk right now?', '¿No puede hablar ahora?')}</span>
                <span className="text-sm text-grey">{T('Text Nora instead. Same help, same claim.', 'Escríbale a Nora. La misma ayuda, el mismo reclamo.')}</span>
              </span>
              <span className="font-mono text-grey group-open:rotate-90 transition-transform">▸</span>
            </summary>
            <div className="px-3 pb-3">
              <NoraChat />
            </div>
          </details>
          </div>
        </div>
      </div>
    </>
  );
}
