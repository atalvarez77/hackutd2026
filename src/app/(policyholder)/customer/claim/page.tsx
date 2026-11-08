'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/context/StateFarmContext';
import { plain, useReaderPrefs } from '@/lib/reader';
import { ClaimStepper } from '@/components/ui/ClaimStepper';
import { PrefilledField } from '@/components/ui/PrefilledField';
import { NoraWave } from '@/components/ui/NoraWave';
import { CLAIM_STEPS, claimFields, coverageCards, STEP_KEYS, verdictCopy } from '@/lib/claim';
import { first, money } from '@/lib/hn';
import { lossDate, tx } from '@/lib/i18n';

export default function ClaimPage() {
  const { activeCustomer, hydrated, claims } = useStore();
  // Re-mount per policyholder (and once saved state loads) so the starting step is recomputed.
  const hasClaim = !!claims[activeCustomer.id] && claims[activeCustomer.id].status !== 'none';
  return <ClaimFlowView key={`${activeCustomer.id}-${hydrated}-${hasClaim}`} />;
}

function ClaimFlowView() {
  const store = useStore();
  const { activeCustomer: c, claims } = store;
  const prefs = useReaderPrefs();
  const es = c.language === 'es';
  const T = (en: string, sp: string) => (es ? sp : en);
  const claim = claims[c.id];
  const hasClaim = !!claim && claim.status !== 'none';
  const done = claim?.status === 'submitted' || claim?.status === 'approved';
  // Start at the first step that still needs attention (e.g. after a welfare call).
  const [step, setStep] = useState(() => {
    if (!claim) return 0;
    const firstOpen = STEP_KEYS.findIndex((keys) => !keys.every((k) => claim.confirmed[k]));
    return firstOpen === -1 ? 2 : firstOpen;
  });
  const [agree, setAgree] = useState(true);
  const [photos, setPhotos] = useState<(string | null)[]>([null, null, null]);

  if (!hasClaim) {
    return (
      <section className="max-w-[760px] mx-auto px-[clamp(16px,3vw,40px)] py-16 flex flex-col gap-5">
        <span className="hn-label text-sf-red">{T('File a claim', 'Iniciar un reclamo')}</span>
        <h1 className="m-0 font-display font-black text-[clamp(40px,5vw,64px)] leading-none">{T(`${first(c.name)}, the fastest way is a call.`, `${first(c.name)}, lo más rápido es una llamada.`)}</h1>
        <p className="m-0 text-lg text-grey leading-relaxed">
          {T(
            'Tell Nora what happened on a welfare call and she’ll fill in and submit the claim with you before you hang up. Or start it here and confirm each step yourself.',
            'Cuéntele a Nora lo que pasó en una llamada y ella llenará y enviará el reclamo con usted antes de colgar. O empiece aquí y confirme cada paso.',
          )}
        </p>
        <div className="flex gap-3 flex-wrap">
          <Link href="/customer#call" onClick={() => store.setCallStatus(c.id, 'ringing')} className="h-[52px] px-6 rounded-full bg-sf-red text-white no-underline font-bold flex items-center">
            {T('Call Nora', 'Llamar a Nora')}
          </Link>
          <button onClick={() => store.applyHazard(c.id)} className="h-[52px] px-6 rounded-full border border-line bg-white font-bold cursor-pointer">
            {T('Start it here', 'Empezar aquí')}
          </button>
        </div>
      </section>
    );
  }

  const fields = claimFields(c, claim, c.language);
  const n = done ? 5 : step;
  const allOk = n < 2 ? STEP_KEYS[n].every((k) => claim.confirmed[k]) : true;
  const fromCall = Object.values(claim.confirmed).some((s) => /call/i.test(s));
  const verdict = verdictCopy(c, claim, c.language);
  const pct = done ? 100 : Math.round(((n + 1) / 5) * 85);
  const canNext = allOk && (n !== 4 || agree);

  const next = () => {
    if (!canNext) return;
    if (n < 4) setStep(n + 1);
    else store.submitClaim(c.id);
  };

  const noraNote = done
    ? T('Nora is watching your claim', 'Nora sigue su reclamo')
    : n === 2
      ? T('Nora can’t do this part', 'Nora no puede hacer esta parte')
      : n === 3
        ? T('Nora read your policy', 'Nora leyó su póliza')
        : n === 4
          ? T('Nora checked everything', 'Nora revisó todo')
          : T('Pre-filled by Nora', 'Pre-llenado por Nora');

  return (
    <>
      <section className="bg-petal">
        <div className="max-w-[1280px] mx-auto px-[clamp(16px,3vw,40px)] pt-9 pb-10 flex flex-wrap items-end justify-between gap-5">
          <div className="flex flex-col gap-2.5">
            <span className="hn-label text-[13px] tracking-[.14em] text-sf-red">
              {T('File a claim', 'Reclamo')} · {done ? claim.number : T('Draft ', 'Borrador ') + claim.id}
            </span>
            <h1 className="m-0 font-display font-black leading-none text-[clamp(40px,5vw,72px)] text-balance">
              {T(`${first(c.name)}, Nora already started this for you.`, `${first(c.name)}, Nora ya lo empezó por usted.`)}
            </h1>
            <p className="m-0 max-w-[640px] text-lg leading-relaxed text-grey">
              {fromCall
                ? T('You confirmed most of this on your call with Nora. Anything marked “Confirmed on call” is done. Check the rest and change anything that’s wrong.', 'Usted confirmó casi todo en su llamada con Nora. Lo marcado “Confirmado en la llamada” ya está listo. Revise lo demás.')
                : T('She only filled in what State Farm already has: your policy, your address, the active alerts for your area, and what you told her. Check each step and change anything that’s wrong.', 'Solo usó lo que State Farm ya tiene: su póliza, su dirección, las alertas de su zona y lo que usted le dijo. Revise cada paso.')}
            </p>
          </div>
          <div className="px-5 py-4 rounded-[18px] bg-charcoal text-white flex flex-col gap-1 min-w-[220px]">
            <span className="font-mono text-[12px] text-mist">{c.policy.policyNumber}</span>
            <span className="font-display font-black text-5xl leading-none text-neon-red">{pct}%</span>
            <span className="hn-label text-[11px] text-mist">{T('Claim progress', 'Progreso')}</span>
          </div>
        </div>
      </section>

      <div className="max-w-[1280px] w-full mx-auto px-[clamp(16px,3vw,40px)] pt-9 pb-20 grid gap-9 items-start grid-cols-1 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
        <ClaimStepper current={n} maxReachable={done ? 5 : Math.max(step, n)} lang={c.language} onSelect={done ? undefined : (i) => i <= 4 && setStep(i)} />

        <section className="border border-line rounded-2xl overflow-hidden hn-in" key={n}>
          <div className="px-[26px] py-[22px] border-b border-line flex items-center gap-3.5 flex-wrap">
            <span className="font-mono text-[13px] text-sf-red">{T('STEP', 'PASO')} {n + 1} / 8</span>
            <span className="font-display font-black text-[32px] leading-none">{es ? CLAIM_STEPS[n].es : CLAIM_STEPS[n].en}</span>
            <span className="flex-1" />
            <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-charcoal text-white font-bold text-[13px]">
              <NoraWave size={14} width={3} color="#FF3B47" />
              {noraNote}
            </span>
          </div>

          <div className="p-[26px] flex flex-col gap-4">
            {!done && n < 2 &&
              fields[n].map((f) => (
                <PrefilledField
                  key={f.key}
                  label={f.label}
                  value={f.value}
                  src={f.src}
                  kind={f.kind}
                  lang={c.language}
                  confirmedBy={claim.confirmed[f.key]}
                  onToggle={() => store.confirmClaimField(c.id, f.key, claim.confirmed[f.key] ? null : 'portal')}
                />
              ))}

            {!done && n === 2 && (
              <>
                <div className="text-base leading-relaxed text-grey">
                  {T('State Farm doesn’t have these yet. Add what you can safely take. If you can’t, the adjuster will take photos at the inspection.', 'State Farm todavía no las tiene. Agregue las que pueda tomar con seguridad. Si no puede, el ajustador las tomará.')}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  {[T('Where the damage is', 'Dónde está el daño'), T('Close-up of the damage', 'De cerca'), T('Wide shot of the room', 'Toda la habitación')].map((label, i) => (
                    <label
                      key={i}
                      className="h-[180px] rounded-2xl border-2 border-dashed border-charcoal/25 bg-petal-25 flex items-center justify-center text-center p-3 cursor-pointer bg-cover bg-center text-sm text-grey"
                      style={photos[i] ? { backgroundImage: `url(${photos[i]})`, borderStyle: 'solid' } : undefined}
                    >
                      {!photos[i] && label}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setPhotos((p) => p.map((x, j) => (j === i ? URL.createObjectURL(file) : x)));
                        }}
                      />
                    </label>
                  ))}
                </div>
              </>
            )}

            {!done && n === 3 && (
              <>
                <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
                  {coverageCards(c, c.language, prefs.simple).map((cv) => (
                    <div key={cv.k} className="p-4 rounded-2xl bg-petal-50 flex flex-col gap-1">
                      <span className="hn-label text-[11px] text-grey">{cv.k}</span>
                      <span className="font-mono font-bold text-xl">{cv.v}</span>
                      <span className="font-mono text-[12px] text-lavender">{cv.src}</span>
                    </div>
                  ))}
                </div>
                <div className="px-5 py-[18px] rounded-2xl text-white flex flex-col gap-1.5" style={{ background: verdict.covered ? '#286784' : '#7D6F86' }}>
                  <span className="font-display font-black text-[26px]">{verdict.title}</span>
                  <span className="text-[15px] leading-relaxed opacity-90">{verdict.body}</span>
                </div>
              </>
            )}

            {!done && n === 4 && (
              <>
                <div className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2.5 text-base">
                  {[
                    [T('Policyholder', 'Asegurado'), c.name],
                    [T('Policy', 'Póliza'), c.policy.policyNumber],
                    [T('Loss', 'Daño'), tx(claim.type, c.language)],
                    [T('Date', 'Fecha'), lossDate(c.language)],
                    [T('Location', 'Lugar'), `${c.address}, ${c.city} ${c.state}`],
                    [T('Estimate', 'Estimado'), money(claim.amount)],
                    [plain('deductible', c.language, prefs.simple), money(c.policy.deductible)],
                    [T('Photos', 'Fotos'), photos.filter(Boolean).length ? T(`${photos.filter(Boolean).length} added`, `${photos.filter(Boolean).length} agregadas`) : T('Skipped (adjuster will take them)', 'Omitidas (el ajustador las tomará)')],
                    [T('Contact notified', 'Contacto avisado'), `${c.emergencyContact.name} · ${c.emergencyContact.phone}`],
                  ].map(([k, v]) => (
                    <div key={k} className="contents">
                      <span className="text-grey">{k}</span>
                      <span className="font-bold">{v}</span>
                    </div>
                  ))}
                </div>
                <label className="flex gap-3 items-start text-[15px] leading-relaxed text-grey px-4 py-3.5 rounded-[14px] bg-petal-50">
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="w-5 h-5 mt-0.5 accent-sf-red" />
                  {T('I confirm these details are correct to the best of my knowledge.', 'Confirmo que estos datos son correctos según mi conocimiento.')}
                </label>
              </>
            )}

            {done && (
              <>
                <div className="p-[22px] rounded-[18px] bg-charcoal text-white flex flex-col gap-1.5">
                  <span className="font-mono text-[12px] text-mist">
                    {T('SUBMITTED', 'ENVIADO')} · {claim.submittedAt || claim.approvedAt}
                  </span>
                  <span className="font-mono font-bold text-[32px]">{claim.number}</span>
                  <span className="text-[15px] text-petal">{T('What happens next, and roughly when:', 'Lo que sigue y cuándo:')}</span>
                </div>
                {[
                  [prefs.simple ? plain('adjuster', c.language, true) : T('Adjuster assigned', 'Ajustador asignado'), T('Jordan Mills, CAT team · Dallas', 'Jordan Mills, equipo de catástrofes · Dallas'), T('Within 24h', 'En 24h')],
                  [T('Estimate', 'Estimado'), T('An inspection to price the repair', 'Una inspección para calcular la reparación'), T('1–3 days', '1–3 días')],
                  [T('Payment', 'Pago'), T(`Repair cost minus your ${money(c.policy.deductible)} deductible`, `Costo menos su deducible de ${money(c.policy.deductible)}`), T('After estimate', 'Tras el estimado')],
                ].map(([label, body, st], i) => {
                  const on = i === 0 && claim.status === 'approved';
                  return (
                    <div
                      key={label}
                      className="grid grid-cols-[44px_1fr_auto] gap-3.5 items-center px-[18px] py-4 rounded-2xl"
                      style={{ border: `2px solid ${on ? '#286784' : 'rgba(26,26,26,.12)'}`, background: on ? 'rgba(40,103,132,.06)' : '#fff' }}
                    >
                      <span className="w-[38px] h-[38px] rounded-full text-white flex items-center justify-center font-mono font-bold text-sm" style={{ background: on ? '#286784' : i === 0 ? '#E61A21' : '#C7BFCC' }}>
                        {i + 6}
                      </span>
                      <span className="flex flex-col gap-0.5">
                        <span className="font-bold text-lg">{label}</span>
                        <span className="text-sm text-grey">{body}</span>
                      </span>
                      <span className="font-mono font-bold text-[13px]" style={{ color: on ? '#286784' : '#7D6F86' }}>
                        {on ? T('DONE', 'LISTO') : st}
                      </span>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          <div className="px-[26px] py-[18px] border-t border-line flex gap-3 items-center bg-petal-25 flex-wrap">
            <button
              onClick={() => !done && n > 0 && setStep(n - 1)}
              className="h-[52px] px-5 rounded-full border border-line bg-white font-bold text-[15px] cursor-pointer"
              style={{ opacity: !done && n > 0 ? 1 : 0.4 }}
            >
              {T('Back', 'Atrás')}
            </button>
            <span className="flex-1 italic font-medium text-sm text-grey">
              {!done && n < 2 && !allOk ? T('Confirm each item to continue.', 'Confirme cada dato para continuar.') : done ? T('You’ll get a text at each step.', 'Recibirá un mensaje en cada paso.') : n === 3 ? T('Coverage is from your policy on file.', 'La cobertura viene de su póliza.') : ''}
            </span>
            {!done ? (
              <button onClick={next} className="h-[52px] px-[26px] rounded-full text-white font-extrabold text-base cursor-pointer" style={{ background: canNext ? '#E61A21' : '#C7BFCC' }}>
                {n === 4 ? T('Submit claim', 'Enviar reclamo') : n === 2 ? T('Continue (photos optional)', 'Continuar (fotos opcionales)') : T('Confirm & continue', 'Confirmar y seguir')}
              </button>
            ) : (
              <Link href="/customer#claims" className="h-[52px] px-[26px] rounded-full bg-charcoal text-white flex items-center no-underline font-extrabold text-base">
                {T('Back to my portal', 'Volver a mi portal')}
              </Link>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
