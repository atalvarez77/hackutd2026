'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/context/StateFarmContext';
import { NoraWave } from '@/components/ui/NoraWave';
import { LogoMark } from '@/components/brand/Logo';
import { NORA_PHONE, coverageVerdict, first, HAZARD_RE, isWaterHazard, money, NO_RE, OK_RE, PERSON_RE, YES_RE } from '@/lib/hn';
import type { CustomerProfile } from '@/types/statefarm';
import { tx } from '@/lib/i18n';

/**
 * The welfare call is the policyholder's whole experience: a normal cell-phone call. It goes
 * from "hello" to a submitted claim (or a transfer to a person) without leaving the call.
 * On desktop it's drawn inside a phone frame; on a real phone the frame drops away. Every line is written to the shared transcript, so the
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
  const spokenEs = freeze ? 'una tubería congelada' : tx(hazard, 'es').toLowerCase();
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
          es: `Revisé su póliza (${tx(c.policy.type, 'es')}). Esto parece estar cubierto y su deducible es de ${ded}. Yo no tomo la decisión final; su ajustador la confirma. ¿Quiere que envíe el reclamo ahora?`,
        }
      : {
          en: `I checked your ${c.policy.type} policy. This may not be covered because there’s no water backup endorsement, but an agent will review it with you. Would you like me to submit it now so they can take a look?`,
          es: `Revisé su póliza (${tx(c.policy.type, 'es')}). Puede que no esté cubierto porque no tiene endoso de respaldo de agua, pero un agente lo revisará con usted. ¿Quiere que lo envíe para que lo revisen?`,
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
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
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

  // Call timer (ticks only while connected).
  useEffect(() => {
    if (!live) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [live]);

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
    setStartedAt(Date.now());
    setNow(Date.now());
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
    { label: T('Damage', 'Daño'), done: !!claim && claim.status !== 'none' },
    { label: T('Details', 'Datos'), done: !!claim?.confirmed?.where },
    { label: T('Safety', 'Seguridad'), done: !!claim?.confirmed?.safe },
    { label: T('Submitted', 'Enviado'), done: claim?.status === 'submitted' || claim?.status === 'approved' },
  ];
  const secs = startedAt && now ? Math.max(0, Math.floor((now - startedAt) / 1000)) : null;
  const clock = secs === null ? null : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  const ringing = status === 'ringing' || status === 'idle';
  const claimNo = claim && (claim.status === 'submitted' || claim.status === 'approved') ? claim.number : undefined;

  return (
    <div id="call" className="w-full flex flex-col items-center gap-5 scroll-mt-[110px]">
      {/* The phone. On desktop it gets a device frame; on a real phone the screen fills the card. */}
      <div className="w-full lg:w-[360px] lg:h-[720px] min-h-[560px] rounded-3xl lg:rounded-[52px] lg:border-[10px] lg:border-[#0B0B0D] lg:shadow-[0_30px_60px_rgba(26,26,26,.22)] bg-[linear-gradient(180deg,#2A2A31_0%,#121214_100%)] text-white overflow-hidden flex flex-col">
        <div className="hidden lg:flex items-center justify-between px-7 pt-3 text-[13px] font-semibold">
          <span>4:18</span>
          <span className="w-[86px] h-[24px] rounded-full bg-black" />
          <span className="flex items-end gap-[2px]" aria-hidden>
            {[5, 7, 9, 11].map((h) => (
              <i key={h} className="w-[3px] rounded-sm bg-white" style={{ height: h }} />
            ))}
            <i className="ml-1.5 w-[22px] h-[11px] rounded-[3px] border border-white/80 p-[1px]">
              <i className="block h-full w-3/4 rounded-[1px] bg-white" />
            </i>
          </span>
        </div>

        {claimNo && (
          <div className="mx-3 mt-3 rounded-2xl bg-white/95 text-charcoal px-3.5 py-2.5 flex gap-2.5 items-start hn-in">
            <LogoMark size={28} />
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] font-bold text-grey">{T('MESSAGES · NOW', 'MENSAJES · AHORA')}</span>
              <span className="text-[13px] leading-snug">
                {T(`State Farm: Claim ${claimNo} received. An adjuster will contact you within 24h.`, `State Farm: Recibimos su reclamo ${claimNo}. Un ajustador le contactará en 24h.`)}
              </span>
            </div>
          </div>
        )}

        {ringing && (
          <div className="flex-1 flex flex-col items-center text-center px-6 pt-10 pb-10">
            <span className="text-[15px] text-[#B4A9BC]">{T('Incoming call · mobile', 'Llamada entrante · celular')}</span>
            <span className="mt-7 w-24 h-24 rounded-full bg-sf-red flex items-center justify-center" style={{ animation: 'hnRing 1.6s ease-out infinite' }}>
              <NoraWave speaking color="#fff" size={34} />
            </span>
            <span className="mt-5 font-display font-black text-[30px] leading-tight">State Farm · Nora</span>
            <span className="font-mono text-[15px] text-[#B4A9BC]">{NORA_PHONE}</span>
            <p className="mt-5 mb-8 text-[15px] leading-snug text-[#D9D2DE] max-w-[290px]">
              {T(
                'A quick storm check-in. If anything’s damaged, you can file the whole claim on this call. Nora is an AI assistant; ask for a person anytime.',
                'Una llamada rápida por la tormenta. Si hay daños, puede hacer todo el reclamo en esta llamada. Nora es una asistente de IA; puede pedir una persona cuando quiera.',
              )}
            </p>
            <div className="mt-auto w-full flex justify-around">
              <RoundButton color="#ED1D24" label={T('Decline', 'Rechazar')} onClick={() => end('Policyholder declined the call')} hangup />
              <RoundButton color="#1F9D63" label={T('Accept', 'Contestar')} onClick={accept} />
            </div>
          </div>
        )}

        {live && (
          <div className="flex-1 min-h-0 flex flex-col px-6 pt-6 pb-7">
            <div className="flex flex-col items-center text-center gap-1">
              <span className="font-display font-black text-[26px] leading-tight">{takeover ? 'Jordan · State Farm' : 'State Farm · Nora'}</span>
              <span className="font-mono text-[15px] text-[#B4A9BC]">{clock ?? T('Connected', 'Conectado')}</span>
              <span className="h-7 flex items-center gap-2">
                <NoraWave speaking={speaking} size={18} bars={7} width={3} color={speaking ? '#ED1D24' : '#6A6A74'} />
                <span className="text-[13px] text-[#D9D2DE]">
                  {takeover
                    ? T('You’re talking with a person', 'Está hablando con una persona')
                    : listening
                      ? T('Listening…', 'Escuchando…')
                      : speaking
                        ? T('Nora is speaking', 'Nora está hablando')
                        : T('Your turn', 'Su turno')}
                </span>
              </span>
            </div>

            {req && (
              <div className="mt-3 rounded-xl bg-white/10 px-3.5 py-2.5 text-[13px] text-center hn-in">
                {takeover || req.status === 'accepted'
                  ? T('Jordan accepted. Connecting you now.', 'Jordan aceptó. Le estamos comunicando.')
                  : T('Transferring you to a person. You’re next in line.', 'Le estamos transfiriendo con una persona. Usted sigue.')}
              </div>
            )}

            {/* Live captions */}
            <div className="flex-1 min-h-0 mt-4 overflow-y-auto flex flex-col justify-end gap-3" aria-live="polite">
              {callLines.slice(-4).map((l) => (
                <div key={l.id} className="flex flex-col gap-0.5 hn-in">
                  <span className="text-[11px] font-bold tracking-[.08em] uppercase" style={{ color: l.kind === 'cust' ? '#8E8798' : '#FF6B73' }}>
                    {l.kind === 'ai' ? 'Nora' : l.kind === 'agent' ? 'Jordan' : T('You', 'Usted')}
                  </span>
                  <span className="text-[15px] leading-snug" style={{ color: l.kind === 'cust' ? '#B4A9BC' : '#fff' }}>
                    {l.text}
                  </span>
                </div>
              ))}
            </div>

            {claim && claim.status !== 'none' && (
              <div className="mt-4 grid grid-cols-4 gap-1.5 hn-in">
                {steps.map((s) => (
                  <div key={s.label} className="flex flex-col gap-1">
                    <span className="h-1 rounded" style={{ background: s.done ? '#ED1D24' : '#3A3A42' }} />
                    <span className="text-[10px] font-bold" style={{ color: s.done ? '#fff' : '#8E8798' }}>
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 justify-items-center">
              <ControlButton on={listening} onClick={toggleMic} label={listening ? T('Listening', 'Escuchando') : T('Talk', 'Hablar')} icon="mic" />
              <ControlButton
                on={voice}
                onClick={() => {
                  if (voice) speechSynthesis.cancel();
                  setVoice(!voice);
                }}
                label={T('Speaker', 'Altavoz')}
                icon="speaker"
              />
            </div>
            <div className="mt-5 flex justify-center">
              <RoundButton color="#ED1D24" label={T('End', 'Colgar')} onClick={() => end()} hangup />
            </div>
          </div>
        )}

        {status === 'ended' && (
          <div className="flex-1 flex flex-col items-center text-center px-6 pt-12 pb-10 gap-3">
            <span className="text-[15px] text-[#B4A9BC]">
              {T('Call ended', 'Llamada terminada')}
              {clock ? ` · ${clock}` : ''}
            </span>
            <span className="font-display font-black text-[28px]">State Farm · Nora</span>
            <p className="m-0 text-[17px] leading-snug text-[#D9D2DE] max-w-[290px]">
              {claim?.number
                ? T(`Your claim ${claim.number} is in. We’ll check in again at 8 AM.`, `Su reclamo ${claim.number} está enviado. Le llamamos a las 8 AM.`)
                : T('Thanks for talking with us. We’ll check in again at 8 AM.', 'Gracias por hablar con nosotros. Le llamamos de nuevo a las 8 AM.')}
            </p>
            <div className="mt-auto">
              <RoundButton color="#1F9D63" label={T('Call back', 'Devolver llamada')} onClick={() => store.setCallStatus(c.id, 'ringing')} />
            </div>
          </div>
        )}
      </div>

      {/* Demo stand-in for the policyholder's voice. On a real call they just talk. */}
      {live && (
        <div className="w-full lg:w-[360px] flex flex-col gap-2.5">
          <span className="hn-label text-[11px] text-grey">
            {T(`Demo · speak, or tap what ${first(c.name)} says`, `Demo · hable o toque lo que dice ${first(c.name)}`)}
          </span>
          <div className="flex flex-wrap gap-2">
            {CHIPS[stage](c).map((p) => (
              <button
                key={p.en}
                onClick={() => reply(es ? p.es : p.en)}
                disabled={speaking && !takeover}
                className="h-10 px-3.5 rounded-full border-2 border-charcoal bg-white font-bold text-sm cursor-pointer hover:bg-charcoal hover:text-white disabled:opacity-40"
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
          >
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={T('Or type what you’d say…', 'O escriba lo que diría…')}
              className="w-full h-12 px-4 rounded-full border-2 border-charcoal/20 text-[15px] outline-none"
            />
          </form>
        </div>
      )}
    </div>
  );
}

function PhoneIcon({ hangup = false }: { hangup?: boolean }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff" aria-hidden style={{ transform: hangup ? 'rotate(135deg)' : undefined }}>
      <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.6a1 1 0 0 1-.25 1z" />
    </svg>
  );
}

function RoundButton({ color, label, onClick, hangup = false }: { color: string; label: string; onClick: () => void; hangup?: boolean }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-2 bg-transparent border-0 text-white cursor-pointer">
      <span className="w-[68px] h-[68px] rounded-full flex items-center justify-center" style={{ background: color }}>
        <PhoneIcon hangup={hangup} />
      </span>
      <span className="text-[13px] font-semibold">{label}</span>
    </button>
  );
}

function ControlButton({ on, onClick, label, icon }: { on: boolean; onClick: () => void; label: string; icon: 'mic' | 'speaker' }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 bg-transparent border-0 text-white cursor-pointer">
      <span className="w-[60px] h-[60px] rounded-full flex items-center justify-center" style={{ background: on ? '#fff' : 'rgba(255,255,255,.14)' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={on ? '#1A1A1A' : '#fff'} strokeWidth="2" strokeLinecap="round" aria-hidden>
          {icon === 'mic' ? (
            <>
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </>
          ) : (
            <>
              <path d="M4 10v4h4l5 4V6L8 10z" />
              <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
            </>
          )}
        </svg>
      </span>
      <span className="text-[12px] font-semibold">{label}</span>
    </button>
  );
}
