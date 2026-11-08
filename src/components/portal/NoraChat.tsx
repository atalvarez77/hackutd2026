'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/context/StateFarmContext';
import { NoraWave } from '@/components/ui/NoraWave';
import { money } from '@/lib/hn';
import { tx } from '@/lib/i18n';

export function NoraChat() {
  const { activeCustomer: c, transcripts, claims, sendChatMessage, createContactRequest, appendLine } = useStore();
  const es = c.language === 'es';
  const T = (en: string, sp: string) => (es ? sp : en);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lines = (transcripts[c.id] || []).filter((l) => l.channel === 'chat' && (l.kind === 'ai' || l.kind === 'cust' || l.kind === 'agent' || l.kind === 'claim'));
  const claim = claims[c.id];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines.length, pending]);

  const send = async (text: string) => {
    if (!text.trim() || pending) return;
    setInput('');
    setPending(true);
    const r = await sendChatMessage(text);
    setPending(false);
    if (r === 'person') {
      // No separate "talk to a person" screen: a person simply calls them back.
      createContactRequest(c.id, 'call', 'Callback requested from chat');
      appendLine(c.id, {
        kind: 'ai',
        channel: 'chat',
        text: es
          ? `Claro. Un agente de State Farm le llamará al ${c.phone} en unos minutos. Ya sabe lo que hemos hablado.`
          : `Of course. A State Farm agent will call you at ${c.phone} in a few minutes. They’ll already know what we talked about.`,
        tr: es ? `Of course. A State Farm agent will call you at ${c.phone} in a few minutes.` : undefined,
      });
    }
  };

  const quick = es ? ['Se congeló la tubería', 'Estoy bien', 'Necesito una persona'] : ['My pipes froze', 'I’m okay', 'I need a person'];

  return (
    <section className="border border-line rounded-2xl overflow-hidden flex flex-col min-h-[440px]">
      <div className="px-[22px] py-[18px] border-b border-line flex items-center gap-3">
        <span className="w-[52px] h-[52px] rounded-[14px] bg-charcoal flex items-center justify-center flex-none">
          <NoraWave speaking={pending} />
        </span>
        <div className="flex-1 flex flex-col">
          <span className="font-bold text-[19px]">Nora</span>
          <span className="text-sm text-grey">{T('Your State Farm neighbor · AI · English', 'Su vecina de State Farm · IA · Español')}</span>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 max-h-[360px] overflow-y-auto px-[22px] py-5 flex flex-col gap-3 bg-petal-25">
        {lines.map((l) =>
          l.kind === 'claim' ? (
            claim && claim.status !== 'none' ? (
              <Link key={l.id} href="/customer/claim" className="self-start w-[min(100%,360px)] rounded-2xl border border-line bg-white no-underline overflow-hidden hn-in">
                <div className="px-3.5 py-2.5 bg-sf-red text-white hn-label text-[13px]">{T('Claim pre-filed for you', 'Reclamo pre-llenado para usted')}</div>
                <div className="p-3.5 flex flex-col gap-1.5">
                  <span className="font-display font-black text-xl">{tx(claim.type, c.language)}</span>
                  <span className="flex justify-between text-sm text-grey">
                    <span className="font-mono">{claim.number || claim.id}</span>
                    <span className="font-mono font-bold text-[15px] text-charcoal">{money(claim.amount)}</span>
                  </span>
                </div>
              </Link>
            ) : null
          ) : (
            <div key={l.id} className="flex hn-in" style={{ justifyContent: l.kind === 'cust' ? 'flex-end' : 'flex-start' }}>
              <div
                className="max-w-[78%] px-[15px] py-3 rounded-[18px] text-base leading-relaxed"
                style={
                  l.kind === 'cust'
                    ? { background: '#1A1A1A', color: '#fff' }
                    : { background: '#fff', color: '#1A1A1A', border: '1px solid rgba(26,26,26,.12)' }
                }
              >
                {l.kind === 'agent' && <span className="block hn-label text-[10px] text-sf-red mb-1">Jordan · State Farm</span>}
                {l.text}
              </div>
            </div>
          ),
        )}
        {pending && <div className="self-start text-sm text-grey italic">{T('Nora is typing…', 'Nora está escribiendo…')}</div>}
      </div>

      <div className="px-[22px] pt-3 flex gap-2 flex-wrap">
        {quick.map((q) => (
          <button key={q} onClick={() => send(q)} className="h-10 px-3.5 rounded-full border border-line bg-white font-bold text-sm cursor-pointer hover:bg-charcoal hover:text-white">
            {q}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="px-[22px] pt-3 pb-5 flex gap-2.5"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={T('Tell us how you’re doing…', 'Cuéntenos cómo está…')}
          className="flex-1 min-w-0 h-[52px] px-[18px] rounded-full border border-line text-base outline-none"
        />
        <button type="submit" className="h-[52px] px-[22px] rounded-full bg-sf-red text-white font-bold text-base cursor-pointer">
          {T('Send', 'Enviar')}
        </button>
      </form>
    </section>
  );
}
