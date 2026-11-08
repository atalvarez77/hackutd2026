'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/context/StateFarmContext';
import { NORA_PHONE, coverageVerdict, first, FREEZE_RE, hazardFor, isWaterHazard, reportsHazard, money, NO_RE, OK_RE, PERSON_RE, YES_RE } from '@/lib/hn';
import type { CustomerProfile, Language } from '@/types/statefarm';
import { tx } from '@/lib/i18n';
import { pickVoice, warmVoices, type Speaker } from '@/lib/voice';

/**
 * The welfare call is the policyholder's whole experience: a normal cell-phone call. It goes
 * from "hello" to a submitted claim (or a transfer to a person) without leaving the call.
 * Left: a stock iPhone call screen (keypad works: 1 = person, 2 = repeat, 3 = Spanish/English).
 * Right: the live transcript, plus demo controls standing in for the caller's voice.
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
  const freeze = FREEZE_RE.test(hazard + ' ' + claimType);
  const water = isWaterHazard(hazard + ' ' + claimType);
  const spokenEn = freeze ? 'a frozen pipe' : hazard.toLowerCase();
  const spokenEs = freeze ? 'una tubería congelada' : tx(hazard, 'es').toLowerCase();
  const addr = `${c.address}, ${c.city}`;
  const contact = `${c.emergencyContact.name}`;
  const ded = money(c.policy.deductible);
  const { covered } = coverageVerdict(c, hazard + ' ' + claimType);
  return {
    greet: {
      en: `Hi ${f}, this is Nora, State Farm’s AI assistant, calling about the ${c.weatherAlert.title.toLowerCase()} in ${c.city}. How are you and the house holding up? To reach a person at any time, press 1. To hear something again, press 2. Para español, oprima 3.`,
      es: `Hola ${f}, le habla Nora, la asistente de IA de State Farm, por la alerta activa en ${c.city}. ¿Cómo están usted y su casa? Para hablar con una persona, oprima 1. Para repetir, oprima 2. For English, press 3.`,
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
      en: 'Good, I’ve noted that everyone is safe. Photos help but aren’t required. You can add them later, or the adjuster will take them at the inspection.',
      es: 'Bien, anoté que todos están a salvo. Las fotos ayudan pero no son obligatorias. Puede subirlas después, o el ajustador las tomará en la inspección.',
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
      en: `Done. Your claim number is ${num}. An adjuster will be assigned within 24 hours, and you’ll get a text at each step. Is there anything else?`,
      es: `Listo. Su número de reclamo es ${num}. Le asignarán un ajustador en 24 horas y recibirá un mensaje en cada paso. ¿Algo más?`,
    }),
    draftSaved: {
      en: 'Okay, I saved it as a draft. You can submit it any time. Anything else?',
      es: 'Está bien, lo guardé como borrador. Puede enviarlo cuando quiera. ¿Algo más?',
    },
    ok: freeze
      ? {
          en: 'I’m glad you’re safe. Tonight, let your faucets drip and open the cabinets under your sinks. I’ll check in again at 8 AM. Is there anything else?',
          es: 'Qué bueno que está bien. Esta noche deje gotear las llaves y abra los gabinetes del fregadero. Le llamo otra vez a las 8 AM. ¿Algo más?',
        }
      : {
          en: 'I’m glad you’re safe. If anything changes, call this number back any time and press 1 for a person. I’ll check in again at 8 AM. Is there anything else?',
          es: 'Qué bueno que está bien. Si algo cambia, llame a este número cuando quiera y oprima 1 para hablar con una persona. Le llamo otra vez a las 8 AM. ¿Algo más?',
        },
    transfer: {
      en: 'Of course. I’m connecting you to Jordan, a State Farm agent. They already have everything we talked about, so you won’t have to repeat yourself. Please stay on the line.',
      es: 'Claro. Le comunico con Jordan, un agente de State Farm. Ya tiene todo lo que hablamos, así que no tendrá que repetir nada. Por favor no cuelgue.',
    },
    switched: {
      en: 'Sure, let’s continue in English.',
      es: 'Claro, seguimos en español.',
    },
    bye: {
      en: 'Thanks for talking with me. Stay safe, and I’ll check in again at 8 AM. Goodbye.',
      es: 'Gracias por hablar conmigo. Cuídese y le llamo otra vez a las 8 AM. Hasta luego.',
    },
  };
}

const CHIPS: Record<Stage, (c: CustomerProfile) => Pair[]> = {
  greet: (c) => [
    { en: HAZARD_REPLY[c.id]?.[0] ?? 'Something’s wrong at the house', es: HAZARD_REPLY[c.id]?.[1] ?? 'Hay un problema en la casa' },
    { en: 'I’m okay', es: 'Estoy bien' },
  ],
  details: () => [{ en: 'Yes, that’s right', es: 'Sí, es correcto' }, { en: 'No, something’s different', es: 'No, algo es diferente' }],
  fix: () => [{ en: 'It started around 3 AM', es: 'Empezó como a las 3 AM' }, { en: 'It’s in the bathroom, not the kitchen', es: 'Es en el baño, no en la cocina' }],
  safety: () => [{ en: 'Everyone’s safe', es: 'Todos estamos bien' }, { en: 'I need help shutting it off', es: 'Necesito ayuda para cerrarla' }],
  photos: () => [{ en: 'Skip photos for now', es: 'Sin fotos por ahora' }, { en: 'I’ll add them later', es: 'Las subo después' }],
  coverage: () => [{ en: 'Yes, submit it', es: 'Sí, envíelo' }, { en: 'Not yet', es: 'Todavía no' }],
  submitted: () => [{ en: 'That’s all, thanks', es: 'Es todo, gracias' }],
  closing: () => [{ en: 'That’s all, thanks', es: 'Es todo, gracias' }],
  transfer: () => [{ en: 'Okay, I’ll wait', es: 'Está bien, espero' }, { en: 'Thank you', es: 'Gracias' }],
};

// Minimal typing for the Web Speech API (not in lib.dom for all TS versions).
type Recognition = { lang: string; interimResults: boolean; start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

/* ---------- Keypad tones (real DTMF pairs) ---------- */
const DTMF: Record<string, [number, number]> = {
  '1': [697, 1209], '2': [697, 1336], '3': [697, 1477], '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
  '7': [852, 1209], '8': [852, 1336], '9': [852, 1477], '*': [941, 1209], '0': [941, 1336], '#': [941, 1477],
};
let audio: AudioContext | null = null;
/** Wall-clock read for event handlers (kept outside the component body). */
const clockNow = () => Date.now();
function tone(k: string) {
  try {
    audio ||= new AudioContext();
    const g = audio.createGain();
    g.gain.value = 0.06;
    g.connect(audio.destination);
    for (const f of DTMF[k] || []) {
      const o = audio.createOscillator();
      o.frequency.value = f;
      o.connect(g);
      o.start();
      o.stop(audio.currentTime + 0.16);
    }
  } catch {}
}

export function WelfareCall() {
  const store = useStore();
  const { activeCustomer: c, callStatus, transcripts, claims, contactRequests, agentTakeover } = store;
  const es = c.language === 'es';
  const status = callStatus[c.id] || 'idle';
  const [stage, setStage] = useState<Stage>('greet');
  const [speaking, setSpeaking] = useState(false);
  /** Waiting on the FastAPI orchestrator for this turn. */
  const [thinking, setThinking] = useState(false);
  const busy = useRef(false);
  const [voice, setVoice] = useState(true);
  const [muted, setMuted] = useState(false);
  const [listening, setListening] = useState(false);
  const [typed, setTyped] = useState('');
  const [keypad, setKeypad] = useState(false);
  const [digits, setDigits] = useState('');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const recRef = useRef<Recognition | null>(null);
  const endAfterSpeak = useRef(false);
  const spokenAgent = useRef<Set<string>>(new Set());
  const lastSaid = useRef<Pair | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [conf, setConf] = useState(false);
  const [texts, setTexts] = useState<{ id: number; text: string }[]>([]);
  const [banner, setBanner] = useState<number | null>(null);
  const [msgOpen, setMsgOpen] = useState(false);

  const claim = claims[c.id];
  const req = contactRequests.find((r) => r.custId === c.id && r.status !== 'closed');
  const takeover = !!agentTakeover[c.id];
  const live = status === 'ai' || status === 'agent';
  const callLines = (transcripts[c.id] || []).filter((l) => l.channel === 'call' && (l.kind === 'ai' || l.kind === 'cust' || l.kind === 'agent'));

  useEffect(() => {
    warmVoices();
    return () => {
      try {
        speechSynthesis.cancel();
      } catch {}
      recRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [callLines.length]);

  const speak = (text: string, lang: Language, after?: () => void, who: Speaker = 'nora') => {
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
        const v = pickVoice(lang, who);
        if (v) u.voice = v;
        u.rate = who === 'nora' ? 1 : 0.97;
        u.pitch = who === 'nora' ? 1.08 : 0.9;
        u.onend = () => setTimeout(done, 500);
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
  const say = (p: Pair, after?: () => void, lang: Language = c.language, synced = false) => {
    lastSaid.current = p;
    store.appendLine(c.id, { kind: 'ai', channel: 'call', text: lang === 'es' ? p.es : p.en, tr: lang === 'es' && p.en !== p.es ? p.en : undefined }, { synced });
    speak(lang === 'es' ? p.es : p.en, lang, after);
  };

  // Call timer (ticks only while connected).
  useEffect(() => {
    if (!live) return;
    const iv = setInterval(() => setNow(clockNow()), 1000);
    return () => clearInterval(iv);
  }, [live]);

  // Speak the agent's lines out loud (male voice) once they've taken over the call.
  useEffect(() => {
    if (!live) return;
    const latest = callLines.filter((l) => l.kind === 'agent' && !spokenAgent.current.has(l.id));
    latest.forEach((l) => {
      spokenAgent.current.add(l.id);
      speak(l.text, c.language, undefined, 'agent');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callLines.length, live]);

  const accept = () => {
    try {
      speechSynthesis.cancel();
    } catch {}
    callLines.forEach((l) => l.kind === 'agent' && spokenAgent.current.add(l.id));
    const t = clockNow();
    setStartedAt(t);
    setNow(t);
    setDigits('');
    setKeypad(false);
    setConf(false);
    store.setCallStatus(c.id, 'ai');
    store.appendLine(c.id, { kind: 'event', text: 'Welfare call connected · Nora on the line', dot: 'red' });
    setStage('greet');
    say(lines(c, c.detectedHazard, claim?.type || '').greet);
  };

  const end = (note = 'Call ended by policyholder') => {
    try {
      speechSynthesis.cancel();
    } catch {}
    recRef.current?.stop();
    setSpeaking(false);
    setKeypad(false);
    store.setCallStatus(c.id, 'ended');
    store.appendLine(c.id, { kind: 'event', text: note, dot: 'lavender' });
  };

  const confirm = (keys: string[], source = ON_CALL) => keys.forEach((k) => store.confirmClaimField(c.id, k, source));

  /** Nora texts the policyholder (shows as an iPhone notification, kept in Messages). */
  const sms = (p: Pair, lang: Language = c.language) => {
    const body = lang === 'es' ? p.es : p.en;
    const id = clockNow();
    setTexts((t) => [...t, { id, text: body }]);
    setBanner(id);
    setTimeout(() => setBanner((b) => (b === id ? null : b)), 7000);
    store.appendLine(c.id, { kind: 'event', text: `SMS to policyholder: “${p.en}”`, dot: 'blue' });
  };

  /** "add call": conference in the emergency contact so they hear it too. */
  const addCall = () => {
    if (!live || conf) return;
    const ec = c.emergencyContact;
    setConf(true);
    store.appendLine(c.id, { kind: 'event', text: `${ec.name} (${ec.relationship}) added to the call`, dot: 'blue' });
    if (!takeover)
      say({
        en: `I’ve added ${first(ec.name)} to the call so they can hear this too. Hi ${first(ec.name)}, this is Nora from State Farm.`,
        es: `Agregué a ${first(ec.name)} a la llamada para que también escuche. Hola ${first(ec.name)}, le habla Nora de State Farm.`,
      });
  };

  const transfer = (via: string) => {
    if (stage === 'transfer' || takeover) return;
    const L = lines(c, c.detectedHazard, claim?.type || '');
    say(L.transfer);
    sms({ en: 'State Farm: Connecting you to Jordan, a State Farm agent. Stay on the line.', es: 'State Farm: Le comunicamos con Jordan, agente de State Farm. No cuelgue.' });
    store.createContactRequest(c.id, 'call', (c.detectedHazard === 'None' ? 'General question' : c.detectedHazard) + via, true);
    setStage('transfer');
  };

  const textSafety = () =>
    sms(
      isWaterHazard(c.detectedHazard + ' ' + (claim?.type || ''))
        ? {
            en: 'State Farm: To shut off your water, find the round main valve where the line enters the house (garage or near the street) and turn it clockwise until it stops.',
            es: 'State Farm: Para cerrar el agua, busque la válvula principal redonda donde entra la línea a la casa (garaje o cerca de la calle) y gírela a la derecha hasta que se detenga.',
          }
        : { en: 'State Farm: Stay away from the damaged area. If you smell gas or see sparks, leave and call 911.', es: 'State Farm: Manténgase lejos del área dañada. Si huele a gas o ve chispas, salga y llame al 911.' },
    );

  /**
   * One customer reply, from voice, a chip or typing. It goes through the FastAPI orchestrator
   * first (triage, claim, transcript in SpacetimeDB); the call then moves to its next step.
   */
  const reply = async (text: string) => {
    if (!text.trim() || !live || busy.current) return;
    busy.current = true;
    setThinking(true);
    const atStage = stage;
    const turn = await store.customerTurn(c.id, text, { channel: 'call', stage: atStage });
    busy.current = false;
    setThinking(false);
    if (takeover) return; // Jordan is handling the call now; Nora stays quiet.

    // The orchestrator decides whether this reports damage; the keyword check is the offline fallback.
    const hazard = turn ? !!turn.claim : reportsHazard(text);
    const hazardNow = turn?.claim ? turn.detected_hazard || c.detectedHazard : hazard ? hazardFor(c, text).hazard : c.detectedHazard;
    const L = lines(c, hazardNow, turn?.claim?.hazard_type || claim?.type || '');
    // With real Nemotron behind the orchestrator Nora speaks its reply; with its stub, her script.
    // The submit step keeps the scripted line because it carries the real claim number.
    const ai = turn?.ai_source === 'nemotron' && turn.reply && atStage !== 'coverage' ? turn : null;
    const respond = (p: Pair, after?: () => void) => (ai ? say({ en: ai.reply, es: ai.reply }, after, c.language, ai.reply_logged) : say(p, after));

    if (PERSON_RE.test(text) && atStage !== 'transfer') return transfer('');

    switch (atStage) {
      case 'greet':
        // Reassurance ("I'm okay", "no damage") closes the check-in; any report of damage starts a claim.
        if (!hazard && (OK_RE.test(text) || /\b(no|nada|nothing)\b/i.test(text))) {
          store.patchCustomer(c.id, { checkInStatus: 'completed' });
          respond(L.ok);
          setStage('closing');
        } else {
          store.runHazardPlan(c.id, text, 'call', turn?.claim ? turn : null);
          respond(L.details);
          setStage('details');
        }
        break;
      case 'details':
        if (NO_RE.test(text) && !YES_RE.test(text)) {
          respond(L.fix);
          setStage('fix');
        } else {
          confirm(['type', 'when', 'where', 'quote']);
          respond(L.safety);
          setStage('safety');
          textSafety();
        }
        break;
      case 'fix':
        store.appendLine(c.id, { kind: 'event', text: `Correction noted for adjuster: “${text}”`, dot: 'lavender' });
        confirm(['type', 'when', 'where', 'quote'], 'Corrected on call');
        respond(L.safety);
        setStage('safety');
        textSafety();
        break;
      case 'safety':
        confirm(['safe', 'shut', 'heat', 'notify']);
        respond(/help|ayuda|can.?t|no puedo/i.test(text) ? { en: L.shutHelp.en + L.photos.en, es: L.shutHelp.es + L.photos.es } : L.photos);
        setStage('photos');
        break;
      case 'photos':
        respond(L.coverage);
        setStage('coverage');
        break;
      case 'coverage':
        if (NO_RE.test(text) && !YES_RE.test(text)) {
          respond(L.draftSaved);
          setStage('closing');
        } else {
          const num = store.submitClaim(c.id);
          respond(L.submitted(num));
          setStage('submitted');
          sms({
            en: `State Farm: Claim ${num} received. An adjuster will contact you within 24 hours. Reply HELP for a person.`,
            es: `State Farm: Recibimos su reclamo ${num}. Un ajustador le contactará en 24 horas. Responda AYUDA para hablar con una persona.`,
          });
        }
        break;
      case 'submitted':
      case 'closing':
        endAfterSpeak.current = true;
        respond(L.bye, () => {
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

  /** Keypad: 1 or 0 = a person, 2 = repeat, 3 = switch language. */
  const press = (k: string) => {
    tone(k);
    setDigits((d) => (d + k).slice(-14));
    if (!live) return;
    if (k === '1' || k === '0') {
      store.appendLine(c.id, { kind: 'event', text: `Policyholder pressed ${k} · asked for a person`, dot: 'red' });
      transfer(' · pressed ' + k);
    } else if (k === '2' && lastSaid.current && !takeover) {
      try {
        speechSynthesis.cancel();
      } catch {}
      store.appendLine(c.id, { kind: 'event', text: 'Policyholder pressed 2 · Nora repeated', dot: 'lavender' });
      speak(es ? lastSaid.current.es : lastSaid.current.en, c.language);
    } else if (k === '3') {
      const next: Language = es ? 'en' : 'es';
      try {
        speechSynthesis.cancel();
      } catch {}
      store.updateCustomerLanguage(c.id, next);
      store.appendLine(c.id, { kind: 'event', text: `Policyholder pressed 3 · language → ${next === 'es' ? 'Spanish' : 'English'}`, dot: 'lavender' });
      if (!takeover) {
        const L = lines(c, c.detectedHazard, claim?.type || '');
        const again = lastSaid.current;
        const p = again ? { en: L.switched.en + ' ' + again.en, es: L.switched.es + ' ' + again.es } : L.switched;
        say(p, undefined, next);
        if (again) lastSaid.current = again;
      }
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
  const secs = startedAt && now ? Math.max(0, Math.floor((now - startedAt) / 1000)) : null;
  const clock = secs === null ? '0:00' : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  const ringing = status === 'ringing' || status === 'idle';
  const callerName = (takeover ? 'Jordan · State Farm' : 'State Farm') + (conf ? ` & ${first(c.emergencyContact.name)}` : '');

  return (
    <div id="call" className="grid gap-6 items-stretch grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] scroll-mt-[110px]">
      {/* ---------- iPhone call screen ---------- */}
      <div className="ios relative w-full max-w-[400px] mx-auto lg:w-[360px] h-[720px] rounded-[48px] lg:border-[10px] lg:border-[#111] lg:shadow-[0_24px_48px_rgba(0,0,0,.18)] overflow-hidden text-white bg-[radial-gradient(120%_80%_at_50%_0%,#6B6B72_0%,#3A3A3F_45%,#1C1C1E_100%)]">
        <div className="flex items-center justify-between px-7 pt-3 text-[15px] font-semibold">
          <span>4:18</span>
          <span className="w-[96px] h-[28px] rounded-full bg-black" />
          <span className="flex items-end gap-[2px]" aria-hidden>
            {[4, 6, 8, 10].map((h) => (
              <i key={h} className="w-[3px] rounded-sm bg-white" style={{ height: h }} />
            ))}
            <i className="ml-1.5 w-[24px] h-[12px] rounded-[4px] border border-white/60 p-[1.5px]">
              <i className="block h-full w-3/4 rounded-[2px] bg-white" />
            </i>
          </span>
        </div>

        {banner !== null && !msgOpen && texts.some((m) => m.id === banner) && (
          <button
            onClick={() => {
              setMsgOpen(true);
              setBanner(null);
            }}
            className="absolute left-2.5 right-2.5 top-12 z-20 rounded-[22px] bg-[#F2F2F7]/95 text-black text-left px-3.5 py-3 flex gap-3 items-start shadow-lg border-0 cursor-pointer hn-in"
          >
            <MsgIcon />
            <span className="flex-1 min-w-0 flex flex-col">
              <span className="flex justify-between text-[14px]">
                <span className="font-semibold">State Farm</span>
                <span className="text-black/45">{T('now', 'ahora')}</span>
              </span>
              <span className="text-[14px] leading-snug line-clamp-3">{texts.find((m) => m.id === banner)?.text}</span>
            </span>
          </button>
        )}

        {msgOpen && (
          <div className="absolute inset-0 top-11 z-30 bg-white text-black flex flex-col">
            <div className="px-3 py-2 border-b border-black/10 grid grid-cols-[80px_1fr_80px] items-center">
              <button onClick={() => setMsgOpen(false)} className="justify-self-start bg-transparent border-0 text-[#007AFF] text-[17px] cursor-pointer">
                ‹ {live ? T('Call', 'Llamada') : T('Back', 'Atrás')}
              </button>
              <span className="flex flex-col items-center">
                <span className="w-10 h-10 rounded-full bg-[#ED1D24] text-white flex items-center justify-center font-semibold">SF</span>
                <span className="text-[12px]">State Farm</span>
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-2">
              <span className="self-center text-[12px] text-black/45">{T('Text Message · Today', 'Mensaje de texto · Hoy')}</span>
              {texts.map((m) => (
                <span key={m.id} className="self-start max-w-[80%] px-3.5 py-2 rounded-[18px] bg-[#E9E9EB] text-[16px] leading-snug">
                  {m.text}
                </span>
              ))}
            </div>
          </div>
        )}

        {ringing && (
          <div className="absolute inset-0 top-12 flex flex-col items-center px-6 pb-14">
            <span className="mt-16 text-[17px] text-white/70">{T('mobile', 'celular')}</span>
            <span className="mt-1 text-[38px] font-normal leading-tight text-center">State Farm</span>
            <span className="text-[17px] text-white/70">{NORA_PHONE}</span>
            <div className="mt-auto w-full flex justify-between px-6 text-[13px] text-white/90">
              <span className="flex flex-col items-center gap-1.5">
                <Glyph d="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" />
                {T('Remind Me', 'Recordar')}
              </span>
              <span className="flex flex-col items-center gap-1.5">
                <Glyph d="M4 5h16v11H8l-4 4z" />
                {T('Message', 'Mensaje')}
              </span>
            </div>
            <div className="mt-8 w-full flex justify-between px-4">
              <CallButton color="#FF3B30" label={T('Decline', 'Rechazar')} onClick={() => end('Policyholder declined the call')} hangup />
              <CallButton color="#34C759" label={T('Accept', 'Aceptar')} onClick={accept} pulse />
            </div>
          </div>
        )}

        {live && (
          <div className="absolute inset-0 top-12 flex flex-col items-center px-7 pb-12">
            <span className="mt-10 text-[34px] font-normal leading-tight text-center">{keypad && digits ? digits : callerName}</span>
            <span className="text-[17px] text-white/70">{keypad && digits ? callerName : clock}</span>

            <div className="mt-auto w-full">
              {keypad ? (
                <div className="grid grid-cols-3 gap-x-6 gap-y-3.5 justify-items-center">
                  {[
                    ['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
                    ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'], ['*', ''], ['0', '+'], ['#', ''],
                  ].map(([d, sub]) => (
                    <button
                      key={d}
                      onClick={() => press(d)}
                      className="w-[74px] h-[74px] rounded-full bg-white/20 active:bg-white/50 border-0 text-white cursor-pointer flex flex-col items-center justify-center leading-none"
                    >
                      <span className="text-[34px] font-light">{d}</span>
                      {sub && <span className="text-[10px] font-semibold tracking-[.14em] mt-0.5">{sub}</span>}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-x-6 gap-y-6 justify-items-center">
                  <Control label={T('mute', 'silencio')} on={muted} onClick={() => setMuted(!muted)} d="M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.7M19 11a7 7 0 0 1-1.1 3.8M5 11a7 7 0 0 0 11.6 5.3M12 18v3M4 4l16 16" />
                  <Control label={T('keypad', 'teclado')} onClick={() => setKeypad(true)} dots />
                  <Control
                    label="audio"
                    on={voice}
                    onClick={() => {
                      if (voice) speechSynthesis.cancel();
                      setVoice(!voice);
                    }}
                    d="M4 10v4h4l5 4V6L8 10zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"
                  />
                  <Control label={conf ? T('in call', 'en llamada') : T('add call', 'agregar')} on={conf} onClick={addCall} d="M12 5v14M5 12h14" />
                  <Control label="FaceTime" d="M3 7h12v10H3zM15 10l6-3v10l-6-3" dim />
                  <Control label={T('messages', 'mensajes')} onClick={() => setMsgOpen(true)} d="M4 5h16v11H8l-4 4z" />
                </div>
              )}
            </div>

            <div className="mt-8 w-full grid grid-cols-3 items-center">
              <span />
              <span className="justify-self-center">
                <CallButton color="#FF3B30" onClick={() => end()} hangup />
              </span>
              {keypad && (
                <button onClick={() => setKeypad(false)} className="justify-self-center bg-transparent border-0 text-white text-[17px] cursor-pointer">
                  {T('Hide', 'Ocultar')}
                </button>
              )}
            </div>
          </div>
        )}

        {status === 'ended' && (
          <div className="absolute inset-0 top-12 flex flex-col items-center px-6 pb-14">
            <span className="mt-16 text-[17px] text-white/70">
              {T('Call ended', 'Llamada finalizada')} · {clock}
            </span>
            <span className="mt-1 text-[38px] font-normal leading-tight">State Farm</span>
            <span className="text-[17px] text-white/70">{NORA_PHONE}</span>
            {texts.length > 0 && (
              <button onClick={() => setMsgOpen(true)} className="mt-8 h-11 px-5 rounded-full bg-white/20 border-0 text-white text-[16px] cursor-pointer">
                {T(`Messages (${texts.length})`, `Mensajes (${texts.length})`)}
              </button>
            )}
            <div className="mt-auto">
              <CallButton color="#34C759" label={T('Call back', 'Volver a llamar')} onClick={() => store.setCallStatus(c.id, 'ringing')} />
            </div>
          </div>
        )}
      </div>

      {/* ---------- Live transcript ---------- */}
      <section className="lg:h-[720px] min-h-[420px] rounded-2xl border border-line bg-white flex flex-col overflow-hidden">
        <header className="px-5 py-4 border-b border-line flex items-center gap-3 flex-wrap">
          <span className="font-semibold text-[20px]">{T('Call transcript', 'Transcripción de la llamada')}</span>
          {conf && <span className="text-[14px] text-grey">{T(`${c.emergencyContact.name} is on the call`, `${c.emergencyContact.name} está en la llamada`)}</span>}
          <span className="flex items-center gap-2 text-[15px] text-grey">
            {live && <span className="w-2 h-2 rounded-full bg-sf-red" />}
            {!live
              ? ringing
                ? T('Incoming call. Accept it on the phone.', 'Llamada entrante. Acéptela en el teléfono.')
                : T('Not on a call', 'Sin llamada')
              : takeover
                ? T('With Jordan, a State Farm agent', 'Con Jordan, agente de State Farm')
                : listening
                  ? T('Listening…', 'Escuchando…')
                  : speaking
                    ? T('Nora is speaking', 'Nora está hablando')
                    : thinking
                      ? T('Nora is checking…', 'Nora está revisando…')
                    : T('Your turn to talk', 'Su turno')}
          </span>
        </header>

        {req && live && (
          <div className="px-5 py-2.5 bg-petal-50 border-b border-line text-[15px]">
            {takeover || req.status === 'accepted'
              ? T('Jordan has joined the call.', 'Jordan se unió a la llamada.')
              : T('Connecting you to a person. You’re next in line.', 'Le estamos comunicando con una persona. Usted sigue.')}
          </div>
        )}

        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4" aria-live="polite">
          {callLines.length === 0 && (
            <p className="m-auto max-w-[360px] text-center text-[16px] text-grey leading-relaxed">
              {T(
                'Everything said on the call appears here, so a family member can follow along or you can read back what Nora said.',
                'Todo lo que se dice en la llamada aparece aquí, para que un familiar pueda seguirla o usted pueda releer lo que dijo Nora.',
              )}
            </p>
          )}
          {callLines.map((l) => {
            const me = l.kind === 'cust';
            return (
              <div key={l.id} className={`flex flex-col gap-1 max-w-[88%] hn-in ${me ? 'self-end items-end' : 'self-start'}`}>
                <span className="text-[13px] text-grey">
                  {l.kind === 'ai' ? T('Nora (AI assistant)', 'Nora (asistente de IA)') : l.kind === 'agent' ? T('Jordan, State Farm agent', 'Jordan, agente de State Farm') : T('You', 'Usted')} · {l.time}
                </span>
                <span className={`px-3.5 py-2.5 rounded-2xl text-[16px] leading-snug ${me ? 'bg-charcoal text-white' : 'bg-petal-50'}`}>{l.text}</span>
              </div>
            );
          })}
        </div>

        <footer className="border-t border-line px-5 py-4 flex flex-col gap-3 bg-petal-25">
          {live ? (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[14px] text-grey mr-1">{T(`Demo · answer as ${first(c.name)}:`, `Demo · responda como ${first(c.name)}:`)}</span>
                {CHIPS[stage](c).map((p) => (
                  <button
                    key={p.en}
                    onClick={() => reply(es ? p.es : p.en)}
                    disabled={(speaking && !takeover) || thinking}
                    className="h-9 px-3.5 rounded-full border border-charcoal/30 bg-white text-[15px] cursor-pointer hover:border-charcoal disabled:opacity-40"
                  >
                    {es ? p.es : p.en}
                  </button>
                ))}
              </div>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  reply(typed);
                  setTyped('');
                }}
              >
                <button
                  type="button"
                  onClick={toggleMic}
                  className="h-11 px-4 rounded-full border-0 text-[15px] font-semibold cursor-pointer whitespace-nowrap"
                  style={{ background: listening ? '#ED1D24' : '#1A1A1A', color: '#fff' }}
                >
                  {listening ? T('Listening…', 'Escuchando…') : T('Speak', 'Hablar')}
                </button>
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={T('Or type what you’d say', 'O escriba lo que diría')}
                  className="flex-1 min-w-0 h-11 px-4 rounded-full border border-line bg-white text-[15px] outline-none focus:border-charcoal/50"
                />
              </form>
              <span className="text-[13px] text-grey">
                {T('On the phone keypad: 1 for a person · 2 to repeat · 3 para español', 'En el teclado: 1 para una persona · 2 para repetir · 3 for English')}
              </span>
            </>
          ) : (
            <span className="text-[15px] text-grey">
              {ringing
                ? T('Tap Accept on the phone to answer. In real life this is just your phone ringing.', 'Toque Aceptar en el teléfono. En la vida real, es solo su teléfono sonando.')
                : T('Tap Call back on the phone to start again.', 'Toque Volver a llamar para empezar de nuevo.')}
            </span>
          )}
        </footer>
      </section>
    </div>
  );
}

function MsgIcon() {
  return (
    <span className="w-9 h-9 rounded-[9px] bg-[#34C759] flex items-center justify-center flex-none">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff" aria-hidden>
        <path d="M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.6 3.4 6.1L4.5 21l4.2-2.3c1 .3 2.1.4 3.3.4 5.5 0 10-3.6 10-8S17.5 3 12 3z" />
      </svg>
    </span>
  );
}

function Glyph({ d }: { d: string }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function CallButton({ color, label, onClick, hangup = false, pulse = false }: { color: string; label?: string; onClick: () => void; hangup?: boolean; pulse?: boolean }) {
  return (
    <button onClick={onClick} aria-label={label || 'End call'} className="flex flex-col items-center gap-2 bg-transparent border-0 text-white cursor-pointer">
      <span className="w-[74px] h-[74px] rounded-full flex items-center justify-center" style={{ background: color, animation: pulse ? 'hnRing 1.8s ease-out infinite' : undefined }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="#fff" aria-hidden style={{ transform: hangup ? 'rotate(135deg)' : undefined }}>
          <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.6a1 1 0 0 1-.25 1z" />
        </svg>
      </span>
      {label && <span className="text-[14px]">{label}</span>}
    </button>
  );
}

function Control({ label, d, on = false, dim = false, dots = false, onClick }: { label: string; d?: string; on?: boolean; dim?: boolean; dots?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={dim}
      className="flex flex-col items-center gap-1.5 bg-transparent border-0 text-white cursor-pointer disabled:cursor-default"
      style={{ opacity: dim ? 0.45 : 1 }}
    >
      <span className="w-[74px] h-[74px] rounded-full flex items-center justify-center" style={{ background: on ? '#fff' : 'rgba(255,255,255,.2)' }}>
        {dots ? (
          <span className="grid grid-cols-3 gap-[5px]">
            {Array.from({ length: 9 }).map((_, i) => (
              <i key={i} className="w-[6px] h-[6px] rounded-full" style={{ background: on ? '#000' : '#fff' }} />
            ))}
          </span>
        ) : (
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={on ? '#000' : '#fff'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={d} />
          </svg>
        )}
      </span>
      <span className="text-[13px]">{label}</span>
    </button>
  );
}
