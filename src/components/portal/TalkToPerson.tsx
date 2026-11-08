'use client';

import { useState } from 'react';
import { useStore } from '@/context/StateFarmContext';
import { RequestTicket } from '@/components/ui/RequestTicket';
import type { RequestChannel } from '@/types/statefarm';

const CHANNELS: { k: RequestChannel; en: string; es: string; wait: string; headEn: string; headEs: string }[] = [
  { k: 'call', en: 'Call me now', es: 'Llámenme ahora', wait: '~4 MIN', headEn: 'Jordan will call you in about 4 minutes.', headEs: 'Jordan le llamará en unos 4 minutos.' },
  { k: 'text', en: 'Text an agent', es: 'Mensaje a un agente', wait: '~2 MIN', headEn: 'Jordan will text you in about 2 minutes.', headEs: 'Jordan le escribirá en unos 2 minutos.' },
  { k: 'video', en: 'Video call', es: 'Videollamada', wait: '~8 MIN', headEn: 'Jordan will start a video call in about 8 minutes.', headEs: 'Jordan iniciará una videollamada en unos 8 minutos.' },
  { k: 'later', en: 'Call me at 8 AM', es: 'Llámenme a las 8 AM', wait: 'SCHEDULED', headEn: 'Jordan will call you at 8:00 AM.', headEs: 'Jordan le llamará a las 8:00 AM.' },
];
const TOPICS = [
  ['Frozen pipes', 'Tubería congelada'],
  ['Power or medical', 'Luz o equipo médico'],
  ['Roof or tree', 'Techo o árbol'],
  ['My claim', 'Mi reclamo'],
];

export function TalkToPerson() {
  const { activeCustomer: c, contactRequests, createContactRequest, cancelContactRequest, agentTakeover } = useStore();
  const es = c.language === 'es';
  const T = (en: string, sp: string) => (es ? sp : en);
  const [ch, setCh] = useState<RequestChannel>('call');
  const [topic, setTopic] = useState(0);
  const req = contactRequests.find((r) => r.custId === c.id && r.status !== 'closed');
  const reqCh = CHANNELS.find((x) => x.k === (req?.channel ?? ch))!;
  const accepted = req?.status === 'accepted' || !!agentTakeover[c.id];

  return (
    <section id="person" className="rounded-3xl border-2 border-charcoal bg-petal-50 p-6 flex flex-col gap-4 scroll-mt-[110px]">
      <div className="flex flex-col gap-1">
        <span className="hn-label text-sf-red tracking-[.14em]">Escalate</span>
        <span className="font-display font-black text-[30px] leading-none">{T('Talk to someone', 'Hablar con alguien')}</span>
        <span className="text-[15px] text-grey leading-snug">
          {T(
            'On the call with Nora? Just say “I need a person” and she’ll transfer you. Or pick how you’d like to talk. Your agent will already know your situation.',
            '¿Está en la llamada con Nora? Solo diga “necesito una persona” y le transfiere. O elija cómo quiere hablar. Su agente ya sabrá su situación.',
          )}
        </span>
      </div>

      {!req ? (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            {CHANNELS.map((x) => {
              const on = x.k === ch;
              return (
                <button
                  key={x.k}
                  onClick={() => setCh(x.k)}
                  className="flex flex-col items-start gap-1 p-3.5 rounded-2xl text-left cursor-pointer"
                  style={{ border: `2px solid ${on ? '#1A1A1A' : 'rgba(26,26,26,.15)'}`, background: on ? '#1A1A1A' : '#fff', color: on ? '#fff' : '#1A1A1A' }}
                >
                  <span className="font-mono font-bold text-[12px]" style={{ color: on ? '#FF6B73' : '#ED1D24' }}>
                    {x.wait}
                  </span>
                  <span className="font-display font-black text-xl">{es ? x.es : x.en}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            {TOPICS.map((tp, i) => (
              <button
                key={tp[0]}
                onClick={() => setTopic(i)}
                className="h-10 px-3.5 rounded-full font-bold text-sm cursor-pointer"
                style={{ border: `2px solid ${i === topic ? '#ED1D24' : 'rgba(26,26,26,.15)'}`, background: i === topic ? '#ED1D24' : '#fff', color: i === topic ? '#fff' : '#1A1A1A' }}
              >
                {es ? tp[1] : tp[0]}
              </button>
            ))}
          </div>
          <button onClick={() => createContactRequest(c.id, ch, TOPICS[topic][0])} className="h-[54px] rounded-full bg-sf-red text-white font-extrabold text-base cursor-pointer">
            {(es ? reqCh.es : reqCh.en) + ' →'}
          </button>
        </>
      ) : (
        <RequestTicket
          id={req.id}
          head={accepted ? T('Jordan accepted. Connecting you now.', 'Jordan aceptó. Le estamos comunicando.') : req.fromCall ? T('Jordan is joining your call with Nora.', 'Jordan se unirá a su llamada con Nora.') : es ? reqCh.headEs : reqCh.headEn}
          sub={`${req.topic} · ${req.lang === 'es' ? 'Español' : 'English'}. ${T('Jordan already has your conversation with Nora, your policy and your risk score.', 'Jordan ya tiene su conversación con Nora, su póliza y su puntaje de riesgo.')}`}
          onCancel={accepted ? undefined : () => cancelContactRequest(c.id)}
        />
      )}
    </section>
  );
}
