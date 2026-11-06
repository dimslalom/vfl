import es from '../i18n/es.js';
import pt from '../i18n/pt.js';

// English source strings are the keys, so a missing translation falls back to
// readable English and test/i18n.test.js can prove none is missing. Nothing
// here touches React or the DOM directly; the Worker imports it through the
// engine's news module and only ever sees the default language.
export const LANGS = [
  { key: 'en', label: 'EN', name: 'English', html: 'en' },
  { key: 'pt', label: 'PT', name: 'Português (Brasil)', html: 'pt-BR' },
  { key: 'es', label: 'ES', name: 'Español', html: 'es' },
];

const STORAGE_KEY = 'vfl-lang';
const DICTIONARIES = { es, pt };
const listeners = new Set();

/**
 * The language to start in: the player's own choice if they made one, else the
 * first shipped language the browser asks for ("pt-BR" opens in pt), else English.
 */
export function pickLang(stored, preferred = []) {
  if (LANGS.some(lang => lang.key === stored)) return stored;
  for (const tag of preferred) {
    const base = String(tag).toLowerCase().split('-')[0];
    if (LANGS.some(lang => lang.key === base)) return base;
  }
  return 'en';
}

function readLang() {
  // Only a browser page asks the browser; Node and the Worker stay in English.
  const nav = typeof document !== 'undefined' ? globalThis.navigator : null;
  const preferred = nav?.languages?.length ? nav.languages : [nav?.language].filter(Boolean);
  try {
    return pickLang(globalThis.localStorage?.getItem(STORAGE_KEY), preferred);
  } catch {
    return pickLang(null, preferred);
  }
}

let current = readLang();
if (typeof document !== 'undefined') {
  document.documentElement.lang = LANGS.find(lang => lang.key === current).html;
}

export function getLang() {
  return current;
}

export function setLang(key) {
  if (!LANGS.some(lang => lang.key === key) || key === current) return;
  current = key;
  try { globalThis.localStorage?.setItem(STORAGE_KEY, key); } catch { /* private window */ }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = LANGS.find(lang => lang.key === key).html;
  }
  listeners.forEach(listener => listener());
}

export function subscribeLang(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function dictionary(key) {
  return DICTIONARIES[key] ?? null;
}

export function t(source, vars) {
  const text = DICTIONARIES[current]?.[source] ?? source;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? vars[name] : match));
}
