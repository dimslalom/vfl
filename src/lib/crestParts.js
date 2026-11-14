// Loads crest parts from public/crest-parts: the lexicon once, then only the
// path files a crest uses. Results are cached for the session, so a crest drawn
// once draws instantly everywhere after.
import { useEffect, useState } from 'react';

const BASE = `${import.meta.env.BASE_URL}crest-parts/`;
const texts = new Map();
const pending = new Map();
let lexicon = null;

export function loadCrestLexicon() {
  lexicon ??= fetch(`${BASE}lexicon.json`).then(response => {
    if (!response.ok) throw new Error(`lexicon ${response.status}`);
    return response.json();
  }).catch(error => { lexicon = null; throw error; });
  return lexicon;
}

function loadOne(id) {
  if (!pending.has(id)) {
    pending.set(id, fetch(`${BASE}icons/${id}.txt`)
      .then(response => (response.ok ? response.text() : ''))
      .catch(() => '')
      .then(text => { texts.set(id, text); return text; }));
  }
  return pending.get(id);
}

/** Path text for each id, or null until every one has arrived. */
export function cachedCrestPaths(ids) {
  return ids.every(id => texts.has(id)) ? Object.fromEntries(ids.map(id => [id, texts.get(id)])) : null;
}

export function loadCrestPaths(ids) {
  return Promise.all(ids.map(loadOne)).then(() => cachedCrestPaths(ids));
}

/** The lexicon once it has loaded, else null. */
export function useCrestLexicon() {
  const [value, setValue] = useState(null);
  useEffect(() => {
    let live = true;
    loadCrestLexicon().then(result => { if (live) setValue(result); }, () => {});
    return () => { live = false; };
  }, []);
  return value;
}

/** Path text for a crest's marks; null while loading. */
export function useCrestPaths(ids) {
  const key = ids.join('\n');
  const [loaded, setLoaded] = useState(() => ({ key, paths: cachedCrestPaths(ids) }));
  useEffect(() => {
    if (!key) return undefined;
    let live = true;
    loadCrestPaths(key.split('\n')).then(paths => { if (live) setLoaded({ key, paths }); });
    return () => { live = false; };
  }, [key]);
  return loaded.key === key ? loaded.paths : cachedCrestPaths(ids);
}
