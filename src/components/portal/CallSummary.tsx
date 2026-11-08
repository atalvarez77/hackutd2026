'use client';

import Link from 'next/link';
import { useStore } from '@/context/StateFarmContext';
import { claimFields } from '@/lib/claim';
import { money } from '@/lib/hn';
import { makeT, tx } from '@/lib/i18n';

/**
 * Right-hand side of the portal: everything Nora does on the call shows up here as it
 * happens, so the policyholder (or a family member watching) can see the claim fill itself in.
 */
export function CallSummary() {
  const { activeCustomer: c, claims } = useStore();
  const lang = c.language;
  const T = makeT(lang);
  const claim = claims[c.id];
  const has = !!claim && claim.status !== 'none';
  const fields = has ? claimFields(c, claim, lang).flat() : [];
  const confirmed = fields.filter((f) => claim?.confirmed[f.key]).length;
  const stage = !has ? 0 : claim.status === 'approved' ? 4 : claim.status === 'submitted' ? 2 : 1;
  const stages = [T('Drafted', 'Borrador'), T('Agent review', 'Revisión'), T('Approved', 'Aprobado'), T('Crew sent', 'Equipo enviado')];
  const statusLabel = !has ? '' : claim.status === 'approved' ? T('Approved', 'Aprobado') : claim.status === 'submitted' ? T('Submitted', 'Enviado') : T('In progress', 'En curso');

  return (
    <section id="claims" className="rounded-3xl border-2 border-charcoal p-6 flex flex-col gap-5 scroll-mt-[110px]">
      <div className="flex items-baseline gap-2.5">
        <span className="font-display font-black text-[28px] leading-none">{T('Your claim', 'Su reclamo')}</span>
        <span className="flex-1" />
        {statusLabel && <span className="hn-label text-[12px] text-lavender">{statusLabel}</span>}
      </div>

      {!has ? (
        <div className="flex flex-col gap-4">
          <p className="m-0 text-[16px] text-grey leading-relaxed">
            {T(
              'Nothing to file right now. If you tell Nora something is damaged, she starts the claim and fills it in here while you talk. No forms.',
              'No hay nada que reportar por ahora. Si le dice a Nora que algo está dañado, ella inicia el reclamo y lo llena aquí mientras hablan. Sin formularios.',
            )}
          </p>
          <ol className="m-0 p-0 list-none flex flex-col gap-2.5">
            {[
              T('She asks what happened and confirms the details', 'Le pregunta qué pasó y confirma los datos'),
              T('She checks that everyone is safe and texts your emergency contact', 'Confirma que todos estén bien y avisa a su contacto'),
              T('She reads your policy and tells you what looks covered', 'Lee su póliza y le dice qué parece cubierto'),
              T('She submits it on the call and texts you the claim number', 'Lo envía en la llamada y le manda el número por mensaje'),
            ].map((s, i) => (
              <li key={i} className="flex gap-3 items-start text-[15px]">
                <span className="w-6 h-6 rounded-full bg-petal flex-none flex items-center justify-center font-mono font-bold text-[12px]">{i + 1}</span>
                <span className="leading-snug">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <>
          <div className="flex justify-between gap-3 flex-wrap p-4 rounded-2xl bg-petal-25">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="font-bold text-lg leading-snug">{tx(claim.type, lang)}</span>
              <span className="font-mono text-sm text-grey">{claim.number || claim.id}</span>
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

          <div className="flex flex-col">
            <div className="flex items-baseline justify-between pb-2">
              <span className="hn-label text-[11px] text-grey">{T('Confirmed with Nora', 'Confirmado con Nora')}</span>
              <span className="font-mono text-[12px] text-grey">
                {confirmed}/{fields.length}
              </span>
            </div>
            {fields.map((f) => {
              const ok = !!claim.confirmed[f.key];
              return (
                <div key={f.key} className="grid grid-cols-[24px_minmax(0,1fr)] gap-3 py-2.5 border-t border-charcoal/10" style={{ opacity: ok ? 1 : 0.55 }}>
                  <span
                    className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                    style={{ background: ok ? '#286784' : 'transparent', border: ok ? 'none' : '2px solid #C7BFCC' }}
                  >
                    {ok ? '✓' : ''}
                  </span>
                  <span className="flex flex-col min-w-0">
                    <span className="text-[12px] text-grey">{f.label}</span>
                    <span className="font-semibold text-[15px] leading-snug">{f.key === 'type' ? tx(f.value, lang) : f.value}</span>
                  </span>
                </div>
              );
            })}
          </div>

          <Link href="/customer/claim" className="self-start font-bold text-[15px] text-charcoal underline underline-offset-4 decoration-sf-red">
            {T('Review or edit on the web →', 'Revisar o editar en la web →')}
          </Link>
        </>
      )}

      {c.claimsHistory.length > 0 && (
        <div className="flex flex-col pt-1">
          <span className="hn-label text-[11px] text-grey pb-1.5">{T('Past claims', 'Reclamos anteriores')}</span>
          {c.claimsHistory.map((pc) => (
            <div key={pc.id} className="flex gap-3 text-[15px] py-2 border-t border-charcoal/10">
              <span className="font-mono text-grey">{pc.date.slice(0, 4)}</span>
              <span className="flex-1">{tx(pc.type, lang)}</span>
              <span className="font-mono">{money(pc.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
