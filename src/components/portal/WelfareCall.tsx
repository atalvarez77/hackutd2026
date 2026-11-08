'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/context/StateFarmContext';
import { NoraWave } from '@/components/ui/NoraWave';
import { coverageVerdict, first, HAZARD_RE, isWaterHazard, money, NO_RE, OK_RE, PERSON_RE, YES_RE } from '@/lib/hn';
import type { CustomerProfile } from '@/types/statefarm';

/**
 * The welfare call is the main path: from "hello" to a submitted claim (or a transfer to a
 * person) without leaving the call. Every line is written to the shared transcript, so the
 * agent console sees it live, and every confirmation is written to the claim, so the claim
 * page shows it as already done.
 */

type Stage = 'greet' | 'details' | 'fix' | 'safety' | 'photos' | 'coverage' | 'submitted' | 'closing' | 'transfer';

const ON_CALL = 'Confirmed on call';

const HAZARD_REPLY: Record<string, [string, string]> = {
  'cust-1': ['The pipe under my sink is frozen', 'La tubería bajo el fregadero está congelada'],
  'cust-2': ['Water is backing up into my basement', 'Está entrando agua al sótano'],
  'cust-3': ['A big branch is leaning on my roof', 'Una rama grande está sobre mi techo'],
  'cust-4': ['The hail knocked some shingles off', 'El granizo tumbó unas tejas'],
  'cust-5': ['My pipes froze', 'Se congelaron mis tuberías'],
  'cust-6': ['My AC broke and it’s 94 inside', 'Se descompuso el aire y hace mucho calor'],
};

type Pair = { en: string; es: string };

function lines(c: CustomerProfile, hazard: string, claimType: string) {
  const f = first(c.name);
  const freeze = /freez|frozen|congel/i.test(hazard + claimType);
  const water = isWaterHazard(hazard + ' ' + claimType);
  const spokenEn = freeze ? 'a frozen pipe' : hazard.toLowerCase();
  const spokenEs = freeze ? 'una tubería congelada' : hazard.toLowerCase();
  const addr = `${c.address}, ${c.city}`;
  const contact = `${c.emergencyContact.name}`;
  const ded = money(c.policy.deductible);
  const { covered } = coverageVerdict(c, hazard + ' ' + claimType);
  return {
    greet: {
      en: `Hi ${f}, this is Nora, State Farm’s AI assistant. There’s a ${c.weatherAlert.title.toLowerCase()} in ${c.city} tonight. How are you and the house holding up? You can ask for a person anytime.`,
      es: `Hola ${f}, le habla Nora, la asistente de IA de State Farm. Hay una alerta del clima en ${c.city} esta noche. ¿Cómo están usted y su casa? Puede pedir hablar con una persona cuando quiera.`,
    },
    details: {
      en: `I’m sorry, that sounds like ${spokenEn}. I’ve started a claim for you using what State Farm already has, so there are no forms. Let me check a few details. It started around 6 this morning at ${addr}. Is that right?`,
      es: `Lo siento, parece ${spokenEs}. Ya inicié un reclamo con la información que State Farm ya tiene, así que no hay formularios. Déjeme confirmar unos datos. Empezó como a las 6 de la mañana en ${addr}. ¿Es correcto?`,
    },
    fix: {
      en: 'No problem. Tell me what’s different and I’ll note it for your adjuster.',
      es: 'No hay problema. Dígame qué es diferente y lo anoto para su ajustador.',
    },
    safety: {
      en: `Thank you, that’s confirmed. Is everyone safe? ${water ? 'If you can, turn off the water at the main shutoff. It’s usually in the garage or near the street.' : 'Please stay away from the damaged area.'} I’m also texting ${contact} so they know what’s happening.`,
      es: `Gracias, quedó confirmado. ¿Todos están bien? ${water ? 'Si puede, cierre la llave principal del agua. Suele estar en el garaje o cerca de la calle.' : 'Por favor manténgase lejos del área dañada.'} También le estoy mandando un mensaje a ${contact} para que sepa lo que pasa.`,
    },
    shutHelp: {
      en: 'Here’s how: find the round valve where the water line comes into the house and turn it clockwise until it stops. I’ll text you the steps too. ',
      es: 'Así se hace: busque la válvula redonda donde entra el agua a la casa y gírela a la derecha hasta que se detenga. También le mando los pasos por mensaje. ',
    },
    photos: {
      en: 'Good, I’ve noted that everyone is safe. Photos help but aren’t required. You can add them in your portal later, or the adjuster will take them at the inspection.',
      es: 'Bien, anoté que todos están a salvo. Las fotos ayudan pero no son obligatorias. Puede subirlas después en su portal, o el ajustador las tomará en la inspección.',
    },
    coverage: covered
      ? {
          en: `I checked your ${c.policy.type} policy. This looks covered, and your deductible is ${ded}. I don’t make the final call; your adjuster confirms it. Would you like me to submit the claim now?`,
          es: `Revisé su póliza ${c.policy.type}. Esto parece estar cubierto y su deducible es de ${ded}. Yo no tomo la decisión final; su ajustador la confirma. ¿Quiere que envíe el reclamo ahora?`,
        }
      : {
          en: `I checked your ${c.policy.type} policy. This may not be covered because there’s no water backup endorsement, but an agent will review it with you. Would you like me to submit it now so they can take a look?`,
          es: `Revisé su póliza ${c.policy.type}. Puede que no esté cubierto porque no tiene endoso de respaldo de agua, pero un agente lo revisará con usted. ¿Quiere que lo envíe para que lo revisen?`,
        },
    submitted: (num: string) => ({
      en: `Done. Your claim number is ${num}. An adjuster will be assigned within 24 hours, and you’ll get a text at each step. Is there anything else, or would you like to talk to a person?`,
      es: `Listo. Su número de reclamo es ${num}. Le asignarán un ajustador en 24 horas y recibirá un mensaje en cada paso. ¿Algo más, o quiere hablar con una persona?`,
    }),
    draftSaved: {
      en: 'Okay, I saved it as a draft. You can submit it from your portal anytime. Anything else?',
      es: 'Está bien, lo guardé como borrador. Puede enviarlo desde su portal cuando quiera. ¿Algo más?',
    },
    ok: {
      en: 'I’m glad you’re safe. Tonight, let your faucets drip and open the cabinets under your sinks. I’ll check in again at 8 AM. Is there anything else?',
      es: 'Qué bueno que está bien. Esta noche deje gotear las llaves y abra los gabinetes del fregadero. Le llamo otra vez a las 8 AM. ¿Algo más?',
    },
    transfer: {
      en: 'Of course. I’m connecting you to Jordan, a State Farm agent. They already have everything we talked about, so you won’t have to repeat yourself. Please stay on the line.',
      es: 'Claro. Le comunico con Jordan, un agente de State Farm. Ya tiene todo lo que hablamos, así que no tendrá que repetir nada. Por favor no cuelgue.',
    },
    bye: {
      en: 'Thanks for talking with me. Stay warm, and I’ll check in again at 8 AM. Goodbye.',
      es: 'Gracias por hablar conmigo. Cuídese del frío y le llamo otra vez a las 8 AM. Hasta luego.',
    },
  };
}

const CHIPS: Record<Stage, (c: CustomerProfile) => Pair[]> = {
  greet: (c) => [
    { en: HAZARD_REPLY[c.id]?.[0] ?? 'Something’s wrong at the house', es: HAZARD_REPLY[c.id]?.[1] ?? 'Hay un problema en la casa' },
    { en: 'I’m okay', es: 'Estoy bien' },
    { en: 'I need a person', es: 'Necesito una persona' },
  ],
  details: () => [{ en: 'Yes, that’s right', es: 'Sí, es correcto' }, { en: 'No, something’s different', es: 'No, algo es diferente' }, { en: 'I need a person', es: 'Necesito una persona' }],
  fix: () => [{ en: 'It started around 3 AM', es: 'Empezó como a las 3 AM' }, { en: 'It’s in the bathroom, not the kitchen', es: 'Es en el baño, no en la cocina' }],
  safety: () => [{ en: 'Everyone’s safe', es: 'Todos estamos bien' }, { en: 'I need help shutting it off', es: 'Necesito ayuda para cerrarla' }, { en: 'I need a person', es: 'Necesito una persona' }],
  photos: () => [{ en: 'Skip photos for now', es: 'Sin fotos por ahora' }, { en: 'I’ll add them later', es: 'Las subo después' }],
  coverage: () => [{ en: 'Yes, submit it', es: 'Sí, envíelo' }, { en: 'Not yet', es: 'Todavía no' }, { en: 'I need a person', es: 'Necesito una persona' }],
  submitted: () => [{ en: 'That’s all, thanks', es: 'Es todo, gracias' }, { en: 'I’d like to talk to a person', es: 'Quiero hablar con una persona' }],
  closing: () => [{ en: 'That’s all, thanks', es: 'Es todo, gracias' }, { en: 'I’d like to talk to a person', es: 'Quiero hablar con una persona' }],
  transfer: () => [{ en: 'Okay, I’ll wait', es: 'Está bien, espero' }, { en: 'Thank you', es: 'Gracias' }],
};

// Minimal typing for the Web Speech API (not in lib.dom for all TS versions).
type Recognition = { lang: string; interimResults: boolean; start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

export function WelfareCall() {
  const store = useStore();
  const { activeCustomer: c, callStatus, transcripts, claims, contactRequests, agentTakeover } = store;
  const es = c.language === 'es';
  const status = callStatus[c.id] || 'idle';
  const [stage, setStage] = useState<Stage>('greet');
  const [speaking, setSpeaking] = useState(false);
  const [voice, setVoice] = useState(true);
  const [listening, setListening] = useState(false);
  const [typed, setTyped] = useState('');
  const recRef = useRef<Recognition | null>(null);
  const endAfterSpeak = useRef(false);
  const spokenAgent = useRef<Set<string>>(new Set());

  const claim = claims[c.id];
  const req = contactRequests.find((r) => r.custId === c.id && r.status !== 'closed');
  const takeover = !!agentTakeover[c.id];
  const live = status === 'ai' || status === 'agent';
  const callLines = (transcripts[c.id] || []).filter((l) => l.channel === 'call' && (l.kind === 'ai' || l.kind === 'cust' || l.kind === 'agent'));

  // The portal keys this component by customer id, so switching policyholder resets it.
  // Stop speaking and listening when the call card unmounts.
  useEffect(
    () => () => {
      try {
        speechSynthesis.cancel();
      } catch {}
      recRef.current?.stop();
    },
    [],
  );

  const speak = (text: string, lang: 'en' | 'es', after?: () => void) => {
    setSpeaking(true);
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      setSpeaking(false);
      after?.();
    };
    if (voice && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang === 'es' ? 'es-MX' : 'en-US';
        u.rate = 0.95;
        u.onend = () => setTimeout(done, 600);
        u.onerror = () => done();
        speechSynthesis.speak(u);
        // Safety net: some browsers never fire onend.
        setTimeout(done, 2000 + text.length * 90);
        return;
      } catch {}
    }
    setTimeout(done, Math.min(6000, 900 + text.length * 35));
  };

  /** Nora says a line: transcript (with English translation for Spanish lines) + voice. */
  const say = (p: Pair, after?: () => void) => {
    const lang = c.language;
    store.appendLine(c.id, { kind: 'ai', channel: 'call', text: lang === 'es' ? p.es : p.en, tr: lang === 'es' ? p.en : undefined });
    speak(lang === 'es' ? p.es : p.en, lang, after);
  };

  // Speak the agent's lines out loud once they've taken over the call.
  useEffect(() => {
    if (!live) return;
    const latest = callLines.filter((l) => l.kind === 'agent' && !spokenAgent.current.has(l.id));
    latest.forEach((l) => {
      spokenAgent.current.add(l.id);
      speak(l.text, c.language);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callLines.length, live]);

  const accept = () => {
    try {
      speechSynthesis.cancel();
    } catch {}
    callLines.forEach((l) => l.kind === 'agent' && spokenAgent.current.add(l.id));
    store.setCallStatus(c.id, 'ai');
    store.appendLine(c.id, { kind: 'event', text: 'Welfare call connected · Nora on the line', dot: 'red' });
    setStage('greet');
    const L = lines(c, c.detectedHazard, claim?.type || '');
    say(L.greet);
  };

  const end = (note = 'Call ended by policyholder') => {
    try {
      speechSynthesis.cancel();
    } catch {}
    recRef.current?.stop();
    setSpeaking(false);
    store.setCallStatus(c.id, 'ended');
    store.appendLine(c.id, { kind: 'event', text: note, dot: 'lavender' });
  };

  const confirm = (keys: string[], source = ON_CALL) => keys.forEach((k) => store.confirmClaimField(c.id, k, source));

  /** One customer reply, from voice, a chip or typing. */
  const reply = (text: string) => {
    if (!text.trim() || !live) return;
    store.appendLine(c.id, { kind: 'cust', channel: 'call', text });
    if (takeover) return; // Jordan is handling the call now; Nora stays quiet.

    const hazardNow = HAZARD_RE.test(text) ? 'Freezing Pipes Hazard' : c.detectedHazard;
    const L = lines(c, hazardNow, claim?.type || '');

    if (PERSON_RE.test(text) && stage !== 'transfer') {
      say(L.transfer);
      store.createContactRequest(c.id, 'call', c.detectedHazard === 'None' ? 'General question' : c.detectedHazard, true);
      setStage('transfer');
      return;
    }

    switch (stage) {
      case 'greet':
        if (OK_RE.test(text) && !HAZARD_RE.test(text)) {
          store.patchCustomer(c.id, { checkInStatus: 'completed' });
          say(L.ok);
          setStage('closing');
        } else {
          store.runHazardPlan(c.id, text, 'call');
          say(L.details);
          setStage('details');
        }
        break;
      case 'details':
        if (NO_RE.test(text) && !YES_RE.test(text)) {
          say(L.fix);
          setStage('fix');
        } else {
          confirm(['type', 'when', 'where', 'quote']);
          say(L.safety);
          setStage('safety');
        }
        break;
      case 'fix':
        store.appendLine(c.id, { kind: 'event', text: `Correction noted for adjuster: “${text}”`, dot: 'lavender' });
        confirm(['type', 'when', 'where', 'quote'], 'Corrected on call');
        say(L.safety);
        setStage('safety');
        break;
      case 'safety':
        confirm(['safe', 'shut', 'heat', 'notify']);
        say(/help|ayuda|can.?t|no puedo/i.test(text) ? { en: L.shutHelp.en + L.photos.en, es: L.shutHelp.es + L.photos.es } : L.photos);
        setStage('photos');
        break;
      case 'photos':
        say(L.coverage);
        setStage('coverage');
        break;
      case 'coverage':
        if (NO_RE.test(text) && !YES_RE.test(text)) {
          say(L.draftSaved);
          setStage('closing');
        } else {
          const num = store.submitClaim(c.id);
          say(L.submitted(num));
          setStage('submitted');
        }
        break;
      case 'submitted':
      case 'closing':
        endAfterSpeak.current = true;
        say(L.bye, () => {
          if (endAfterSpeak.current) {
            endAfterSpeak.current = false;
            end('Call completed · Nora said goodbye');
          }
        });
        break;
      case 'transfer':
        break;
    }
  };

  const toggleMic = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const W = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const SR = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!SR) {
      alert(es ? 'Su navegador no admite voz. Use los botones o escriba.' : 'Voice input isn’t supported in this browser. Use the reply buttons or type.');
      return;
    }
    try {
      speechSynthesis.cancel();
    } catch {}
    const rec = new SR();
    rec.lang = es ? 'es-MX' : 'en-US';
    rec.interimResults = false;
    rec.onresult = (e) => reply(e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  const T = (en: string, sp: string) => (es ? sp : en);
  const steps = [
    { label: T('Damage reported', 'Daño reportado'), done: !!claim && claim.status !== 'none' },
    { label: T('Details confirmed', 'Datos confirmados'), done: !!claim?.confirmed?.where },
    { label: T('Safety check', 'Seguridad'), done: !!claim?.confirmed?.safe },
    { label: T('Submitted', 'Enviado'), done: claim?.status === 'submitted' || claim?.status === 'approved', value: claim?.number },
  ];

  return (
    <section id="call" className="rounded-3xl bg-charcoal text-white p-6 flex flex-col gap-4 scroll-mt-[110px]">
      <div className="flex items-center gap-2.5">
        <span className="hn-label text-[13px] text-petal">{T('Welfare call', 'Llamada de bienestar')}</span>
        <span className="flex-1" />
        <button
          onClick={() => {
            if (voice) speechSynthesis.cancel();
            setVoice(!voice);
          }}
          className="h-8 px-3 rounded-full border border-grey bg-transparent text-white font-bold text-[12px] cursor-pointer"
        >
          {voice ? T('Voice on', 'Voz activada') : T('Voice off', 'Voz apagada')}
        </button>
        <span className="font-mono font-bold text-sm text-[#B4A9BC]">{live ? '● LIVE' : status === 'ended' ? 'ENDED' : '4:18 PM'}</span>
      </div>

      {(status === 'ringing' || status === 'idle') && (
        <>
          <div className="flex items-center gap-[18px] flex-wrap">
            <span className="w-16 h-16 rounded-full bg-sf-red flex items-center justify-center" style={{ animation: 'hnRing 1.6s ease-out infinite' }}>
              <NoraWave speaking color="#fff" size={28} />
            </span>
            <div className="flex-1 min-w-[180px] flex flex-col gap-1">
              <span className="font-display font-black text-[26px]">{T('Nora is calling', 'Nora le está llamando')}</span>
              <span className="text-[15px] text-[#B4A9BC] leading-snug">
                {T(
                  'A quick check-in during the storm. If anything’s damaged, you can file the whole claim on this call. Nora is an AI assistant, and you can ask for a person anytime.',
                  'Una llamada rápida durante la tormenta. Si hay daños, puede hacer todo el reclamo en esta llamada. Nora es una asistente de IA y puede pedir una persona cuando quiera.',
                )}
              </span>
            </div>
          </div>
          <div className="flex gap-2.5">
            <button onClick={accept} className="flex-1 h-[52px] rounded-full bg-sf-red text-white font-bold text-base cursor-pointer">
              {T('Accept call', 'Contestar')}
            </button>
            <button onClick={() => end('Policyholder declined the call')} className="flex-1 h-[52px] rounded-full border-2 border-grey bg-transparent text-white font-bold text-base cursor-pointer">
              {T('Not now', 'Ahora no')}
            </button>
          </div>
        </>
      )}

      {live && (
        <>
          <div className="flex items-center gap-3">
            <NoraWave speaking={speaking} size={30} bars={9} color={speaking ? '#ED1D24' : '#474954'} />
            <span className="font-bold text-sm text-petal">
              {takeover
                ? T('You’re talking with Jordan from State Farm', 'Está hablando con Jordan de State Farm')
                : listening
                  ? T('Listening…', 'Escuchando…')
                  : speaking
                    ? T('Nora is speaking…', 'Nora está hablando…')
                    : T('Your turn: talk, tap or type', 'Su turno: hable, toque o escriba')}
            </span>
          </div>

          {req && (
            <div className="rounded-xl bg-sf-red/15 border border-sf-red/40 px-3.5 py-2.5 text-sm hn-in">
              <span className="font-mono text-[12px] text-[#FF6B73]">{req.id} · </span>
              {takeover || req.status === 'accepted'
                ? T('Jordan accepted. Connecting you now.', 'Jordan aceptó. Le estamos comunicando.')
                : T('Transferring you to a person. You’re next in line.', 'Le estamos transfiriendo con una persona. Usted sigue.')}
            </div>
          )}

          <div className="flex flex-col gap-3 max-h-[260px] overflow-y-auto" aria-live="polite">
            {callLines.slice(-5).map((l) => (
              <div key={l.id} className="flex flex-col gap-0.5 hn-in">
                <span className="hn-label text-[11px] tracking-[.1em]" style={{ color: l.kind === 'cust' ? '#B4A9BC' : '#ED1D24' }}>
                  {l.kind === 'ai' ? 'NORA · AI' : l.kind === 'agent' ? 'JORDAN · STATE FARM' : first(c.name).toUpperCase()}
                </span>
                <span className="text-[17px] leading-snug">{l.text}</span>
              </div>
            ))}
          </div>

          {/* Claim progress, built live during the call */}
          {claim && claim.status !== 'none' && (
            <div className="grid grid-cols-4 gap-1.5 hn-in">
              {steps.map((s) => (
                <div key={s.label} className="flex flex-col gap-1.5">
                  <span className="h-1.5 rounded-md" style={{ background: s.done ? '#ED1D24' : '#474954' }} />
                  <span className="font-bold text-[11px]" style={{ color: s.done ? '#fff' : '#B4A9BC' }}>
                    {s.done ? '✓ ' : ''}
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {CHIPS[stage](c).map((p) => (
              <button
                key={p.en}
                onClick={() => reply(es ? p.es : p.en)}
                disabled={speaking && !takeover}
                className="h-10 px-3.5 rounded-full border-2 border-white/30 bg-transparent text-white font-bold text-sm cursor-pointer hover:bg-white hover:text-charcoal disabled:opacity-40"
              >
                {es ? p.es : p.en}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              reply(typed);
              setTyped('');
            }}
            className="flex gap-2"
          >
            <button
              type="button"
              onClick={toggleMic}
              aria-label={T('Talk', 'Hablar')}
              className="h-12 px-4 rounded-full font-bold text-sm cursor-pointer flex-none"
              style={{ background: listening ? '#ED1D24' : '#fff', color: listening ? '#fff' : '#1A1A1A' }}
            >
              {listening ? T('● Listening', '● Escuchando') : T('Tap to talk', 'Toque para hablar')}
            </button>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={T('Or type your answer…', 'O escriba su respuesta…')}
              className="flex-1 min-w-0 h-12 px-4 rounded-full bg-[#2A2A30] border border-white/10 text-white text-[15px] outline-none"
            />
          </form>

          <div className="flex gap-2.5">
            <button onClick={() => end()} className="flex-1 h-[52px] rounded-full bg-sf-red text-white font-bold text-base cursor-pointer">
              {T('End call', 'Colgar')}
            </button>
          </div>
        </>
      )}

      {status === 'ended' && (
        <>
          <div className="font-display font-black text-2xl leading-tight">
            {claim?.number
              ? T(`Thanks for talking with us. Your claim ${claim.number} is in. We’ll check in again at 8 AM.`, `Gracias por hablar con nosotros. Su reclamo ${claim.number} está enviado. Le llamamos a las 8 AM.`)
              : T('Thanks for talking with us. We’ll check in again at 8 AM.', 'Gracias por hablar con nosotros. Le llamamos de nuevo a las 8 AM.')}
          </div>
          <button onClick={() => store.setCallStatus(c.id, 'ringing')} className="h-12 rounded-full border-2 border-grey bg-transparent text-white font-bold text-[15px] cursor-pointer">
            {T('Call Nora again', 'Llamar a Nora otra vez')}
          </button>
        </>
      )}
    </section>
  );
}
