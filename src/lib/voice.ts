/**
 * Picks browser TTS voices by name. Nora gets a female voice, Jordan (the human agent) a male one.
 * Names cover Windows (Edge "Online (Natural)" voices first, they sound best), macOS/iOS and Chrome.
 */
const FEMALE: Record<'en' | 'es', RegExp[]> = {
  en: [/Aria.*Natural/i, /Jenny.*Natural/i, /Ava.*Natural/i, /Emma.*Natural/i, /Michelle/i, /Samantha/i, /Google US English/i, /Zira/i, /Karen/i, /Moira/i, /female/i],
  es: [/Dalia.*Natural/i, /Elvira.*Natural/i, /Paloma.*Natural/i, /Paulina/i, /Monica|Mónica/i, /Google español de Estados Unidos/i, /Sabina/i, /Helena/i, /Laura/i, /female/i],
};
const MALE: Record<'en' | 'es', RegExp[]> = {
  en: [/Guy.*Natural/i, /Andrew.*Natural/i, /Christopher.*Natural/i, /Davis/i, /Daniel/i, /Alex\b/i, /David/i, /Mark/i, /male/i],
  es: [/Jorge.*Natural/i, /Alvaro.*Natural/i, /Jorge/i, /Juan/i, /Diego/i, /Raul/i, /Pablo/i, /male/i],
};

export type Speaker = 'nora' | 'agent';

export function pickVoice(lang: 'en' | 'es', who: Speaker): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const all = speechSynthesis.getVoices();
  const tag = lang === 'es' ? /^es/i : /^en/i;
  const pool = all.filter((v) => tag.test(v.lang));
  for (const re of (who === 'nora' ? FEMALE : MALE)[lang]) {
    const v = pool.find((x) => re.test(x.name) && !(who === 'nora' && /\bmale\b/i.test(x.name)));
    if (v) return v;
  }
  return pool[0] || null;
}

/** Voices load asynchronously in Chrome; call once early so the first line uses the right voice. */
export function warmVoices() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  speechSynthesis.getVoices();
  speechSynthesis.addEventListener?.('voiceschanged', () => speechSynthesis.getVoices(), { once: true });
}
