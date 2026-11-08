'use client';

import type { ClaimFlow, Language } from '@/types/statefarm';
import { makeT } from '@/lib/i18n';

/**
 * Where the claim is, as a vertical timeline. It follows the shared claim state, so the moment an
 * agent approves in the console this flips to "Approved" and "Help is on the way" without a reload.
 * The current step says what happens next; changes are announced to screen readers.
 */
export function ClaimTimeline({ claim, lang, agentName = 'Jordan' }: { claim: ClaimFlow; lang: Language; agentName?: string }) {
  const T = makeT(lang);
  const done = { draft: 1, submitted: 2, approved: 4, none: 0 }[claim.status];

  const steps = [
    {
      title: T('Claim started with Nora', 'Reclamo iniciado con Nora'),
      doneText: T('Filled in from what State Farm already has.', 'Llenado con lo que State Farm ya tiene.'),
      nextText: T('Nora is confirming the details with you.', 'Nora está confirmando los datos con usted.'),
      time: '',
    },
    {
      title: T('You submitted it', 'Usted lo envió'),
      doneText: claim.number ? T(`Claim number ${claim.number}`, `Número de reclamo ${claim.number}`) : T('Sent for review.', 'Enviado a revisión.'),
      nextText: T('Say “yes, submit it” when you’re ready, or submit it on the web.', 'Diga “sí, envíelo” cuando esté listo, o envíelo en la web.'),
      time: claim.submittedAt || '',
    },
    {
      title: T('Approved by a State Farm agent', 'Aprobado por un agente de State Farm'),
      doneText: T(`${agentName} reviewed and approved it.`, `${agentName} lo revisó y aprobó.`),
      nextText: T('A State Farm agent is reviewing it now.', 'Un agente de State Farm lo está revisando.'),
      time: claim.approvedAt || '',
    },
    {
      title: T('Help is on the way', 'La ayuda va en camino'),
      doneText: T('A crew is being scheduled. We’ll text you when it’s set.', 'Estamos programando un equipo. Le avisaremos por mensaje.'),
      nextText: T('Once approved, we schedule a crew and text you.', 'Una vez aprobado, programamos un equipo y le avisamos.'),
      time: claim.approvedAt || '',
    },
  ];
  const current = Math.min(done, steps.length - 1);
  const announce =
    claim.status === 'approved'
      ? T('Your claim was approved. Help is on the way.', 'Su reclamo fue aprobado. La ayuda va en camino.')
      : claim.status === 'submitted'
        ? T('Your claim was submitted and is waiting for an agent.', 'Su reclamo fue enviado y espera a un agente.')
        : T('Your claim is being filled in.', 'Su reclamo se está llenando.');

  return (
    <div className="flex flex-col gap-1">
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      {/* Re-keyed on status so the update highlight plays once each time the claim moves. */}
      <ol key={claim.status} className="m-0 p-0 list-none flex flex-col">
        {steps.map((s, i) => {
          const isDone = i < done;
          const isCurrent = !isDone && i === current;
          return (
            <li key={i} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3" aria-current={isCurrent ? 'step' : undefined}>
              <span className="flex flex-col items-center">
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[14px] font-bold flex-none ${isCurrent ? 'motion-safe:animate-[hnStepIn_.5s_ease-out]' : ''}`}
                  style={
                    isDone
                      ? { background: '#1F7A4D', color: '#fff' }
                      : isCurrent
                        ? { background: '#fff', color: '#1A1A1A', border: '2px solid #E61A21' }
                        : { background: '#fff', color: '#6B6E78', border: '2px solid #C9C4BE' }
                  }
                  aria-hidden
                >
                  {isDone ? '✓' : i + 1}
                </span>
                {i < steps.length - 1 && <span className="w-[2px] flex-1 min-h-[18px]" style={{ background: isDone ? '#1F7A4D' : '#DEDBD6' }} aria-hidden />}
              </span>
              <span className="flex flex-col pb-4 min-w-0">
                <span className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-semibold text-[16px]" style={{ color: isDone || isCurrent ? '#1A1A1A' : '#5A5D66' }}>
                    {s.title}
                  </span>
                  {isDone && s.time && <span className="text-[13px] text-grey">{s.time}</span>}
                  <span className="sr-only">{isDone ? T('(done)', '(listo)') : isCurrent ? T('(current step)', '(paso actual)') : T('(upcoming)', '(pendiente)')}</span>
                </span>
                {(isDone || isCurrent) && (
                  <span className="text-[14px] leading-snug" style={{ color: '#474954' }}>
                    {isDone ? s.doneText : s.nextText}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
