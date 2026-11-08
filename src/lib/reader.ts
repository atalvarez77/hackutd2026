'use client';

import { useSyncExternalStore } from 'react';
import type { Language } from '@/types/statefarm';

/**
 * Reader settings on the policyholder side: larger text, high contrast and easier words.
 * Saved per browser and shared by every component (and every tab) through one store.
 */
export interface ReaderPrefs {
  large: boolean;
  contrast: boolean;
  /** "Easier words": explain insurance terms, and ask Nora to use simple language. */
  simple: boolean;
}

const KEY = 'hn_reader';
const EVT = 'hn-reader';
const DEFAULTS: ReaderPrefs = { large: false, contrast: false, simple: false };

let cachedRaw: string | null = null;
let cached: ReaderPrefs = DEFAULTS;

export function readPrefs(): ReaderPrefs {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    cached = { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    cached = DEFAULTS;
  }
  return cached;
}

export function writePrefs(patch: Partial<ReaderPrefs>) {
  const next = { ...readPrefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  applyPrefs(next);
  window.dispatchEvent(new Event(EVT));
}

/** Page-level classes the CSS uses (larger text, high contrast). */
export function applyPrefs(p: ReaderPrefs) {
  const el = document.documentElement;
  el.classList.toggle('hn-large', p.large);
  el.classList.toggle('hn-contrast', p.contrast);
  el.classList.toggle('hn-simple', p.simple);
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => e.key === KEY && cb();
  window.addEventListener(EVT, cb);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener('storage', onStorage);
  };
}

export function useReaderPrefs(): ReaderPrefs {
  return useSyncExternalStore(subscribe, readPrefs, () => DEFAULTS);
}

/** Insurance words with a plain explanation, shown when "Easier words" is on. */
const PLAIN: Record<string, { en: [string, string]; es: [string, string] }> = {
  deductible: { en: ['Deductible', 'the part you pay first'], es: ['Deducible', 'la parte que usted paga primero'] },
  adjuster: { en: ['Adjuster', 'the State Farm person who checks the damage'], es: ['Ajustador', 'la persona de State Farm que revisa los daños'] },
  dwelling: { en: ['Dwelling coverage', 'what we pay to fix your home'], es: ['Cobertura de vivienda', 'lo que pagamos para reparar su casa'] },
  policy: { en: ['Policy', 'your insurance plan'], es: ['Póliza', 'su plan de seguro'] },
};

/** "Deductible" → "Deductible (the part you pay first)" when simple is on. */
export function plain(term: keyof typeof PLAIN, lang: Language, simple: boolean): string {
  const [word, meaning] = PLAIN[term][lang === 'es' ? 'es' : 'en'];
  return simple ? `${word} (${meaning})` : word;
}
