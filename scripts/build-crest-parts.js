// Builds the crest parts library in public/crest-parts from a checkout of
// github.com/game-icons/icons (CC BY 3.0). Run once after cloning, e.g.
//   git clone --depth 1 https://github.com/game-icons/icons.git /tmp/game-icons
//   node scripts/build-crest-parts.js /tmp/game-icons
// Writes one path file per icon (black backing square removed, one path per
// line), index.json (id, author, English tags) and lexicon.json (words in many
// languages to icons, from scripts/crest-concepts.js plus the icon names).
// badges and various-artists (no named author to credit) are left out.
// The checkout is read as data: only path strings that pass a strict charset
// check are copied.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { CONCEPTS } from './crest-concepts.js';
import { foldText } from '../src/engine/club/crestKit.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'crest-parts');
const source = process.argv[2];
if (!source) {
  console.error('usage: node scripts/build-crest-parts.js <game-icons checkout>');
  process.exit(1);
}

const BACKING = 'M0 0h512v512H0z';
const SAFE_PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]+$/;
// Tags too vague to pick a crest from on their own.
const VAGUE = new Set('alt the of and a an in on with to head face emblem symbol icon small big large double single two three four front back side left right top bottom up down open closed full empty half round square simple heavy light thin flat broken plain'.split(' '));
const FAVOURED = ['lorc', 'delapouite'];
const CAPITALS = { andymeneely: 'Andy Meneely', sbed: 'sbed', delapouite: 'Delapouite', 'caro-asercion': 'Caro Asercion', darkzaitzev: 'DarkZaitzev', generalace135: 'GeneralAce135', 'heavenly-dog': 'HeavenlyDog', spencerdub: 'SpencerDub', priorblue: 'PriorBlue', 'lucasms': 'Lucas' };
const authorName = dir => CAPITALS[dir] ?? dir.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join(' ');

// ── read icons ──────────────────────────────────────────────────────────────

const icons = [];
let skipped = 0;
for (const author of readdirSync(source).sort()) {
  const dir = join(source, author);
  if (author.startsWith('.') || author === 'badges' || author === 'various-artists' || !statSync(dir).isDirectory()) continue;
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.svg')) continue;
    const svg = readFileSync(join(dir, file), 'utf8');
    if (/<(?!\/?(svg|path)\b)[a-z]/i.test(svg) || /transform=/.test(svg)) { skipped++; continue; }
    const paths = [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map(match => match[1]).filter(d => d !== BACKING);
    if (!paths.length || !paths.every(d => SAFE_PATH.test(d))) { skipped++; continue; }
    const name = file.slice(0, -4);
    icons.push({ id: `${author}/${name}`, author, name, paths, tags: name.split('-').filter(tag => !/^\d+$/.test(tag)) });
  }
}

rmSync(OUT, { recursive: true, force: true });
let pathBytes = 0;
for (const icon of icons) {
  const file = join(OUT, 'icons', `${icon.id}.txt`);
  mkdirSync(dirname(file), { recursive: true });
  const text = icon.paths.join('\n');
  pathBytes += Buffer.byteLength(text);
  writeFileSync(file, text);
}

// ── lexicon ─────────────────────────────────────────────────────────────────

const byId = new Map(icons.map(icon => [icon.id, icon]));
const ids = [];
const indexOf = new Map();
const ref = id => {
  if (!indexOf.has(id)) { indexOf.set(id, ids.length); ids.push(id); }
  return indexOf.get(id);
};

const concepts = {};
const words = {};
const near = [];
const fallback = [];
for (const [key, [role, wanted, list, withKey]] of Object.entries(CONCEPTS)) {
  const present = wanted.filter(id => byId.has(id));
  for (const id of wanted) if (!byId.has(id)) console.warn(`concept ${key}: no icon ${id}`);
  if (!present.length) { console.warn(`concept ${key}: dropped, no icons`); continue; }
  concepts[key] = { role, icons: present.map(ref), ...(withKey ? { with: withKey } : {}) };
  if (role === 'subject') fallback.push(ref(present[0]));
  for (const word of list.split(/\s+/).filter(Boolean).map(foldText)) {
    if (Object.hasOwn(words, word)) continue;
    words[word] = key;
    if ([...word].length >= 4 && /^[\p{Script=Latin}\p{Script=Cyrillic}]+$/u.test(word)) near.push(word);
  }
}

// English tags from icon names, for words no concept claims.
const tagged = new Map();
for (const icon of icons) {
  for (const tag of new Set(icon.tags.map(foldText))) {
    if (tag.length < 3 || VAGUE.has(tag) || Object.hasOwn(words, tag)) continue;
    if (!tagged.has(tag)) tagged.set(tag, []);
    tagged.get(tag).push(icon);
  }
}
const rank = (tag, icon) => (icon.name === tag ? 0 : icon.tags[0] === tag ? 1 : icon.tags.at(-1) === tag ? 2 : 3) * 10
  + (FAVOURED.includes(icon.author) ? 0 : 1) + icon.name.length / 100;
for (const [tag, list] of [...tagged].sort(([a], [b]) => a.localeCompare(b))) {
  const ranked = list.sort((a, b) => rank(tag, a) - rank(tag, b));
  // A tag shared by dozens of icons ("ring", "shield") only keeps the icons it names first.
  const kept = list.length > 40 ? ranked.filter(icon => rank(tag, icon) < 20) : ranked;
  if (kept.length) words[tag] = kept.slice(0, 6).map(icon => ref(icon.id));
}

const lexicon = { v: 1, ids, concepts, words, near, fallback };
const index = {
  source: 'https://game-icons.net',
  license: 'CC BY 3.0',
  authors: Object.fromEntries([...new Set(icons.map(icon => icon.author))].map(dir => [dir, authorName(dir)])),
  icons: icons.map(icon => [icon.id, icon.tags.join(' ')]),
};
const lexiconText = JSON.stringify(lexicon);
const indexText = JSON.stringify(index);
writeFileSync(join(OUT, 'lexicon.json'), lexiconText);
writeFileSync(join(OUT, 'index.json'), indexText);

// ── report ──────────────────────────────────────────────────────────────────

const legal = readFileSync(join(ROOT, 'src', 'pages', 'Legal.jsx'), 'utf8');
const uncredited = Object.values(index.authors).filter(name => !legal.includes(name));
if (uncredited.length) console.warn(`Legal page does not credit: ${uncredited.join(', ')}`);

const kb = bytes => `${(bytes / 1024).toFixed(1)} KB`;
const sizeOf = text => `${kb(Buffer.byteLength(text))} (${kb(gzipSync(text).length)} gzip)`;
console.log(`${icons.length} icons written, ${skipped} skipped, ${kb(pathBytes)} of path data, ${kb(pathBytes / icons.length)} each on average`);
console.log(`lexicon.json ${sizeOf(lexiconText)}: ${Object.keys(words).length} words, ${Object.keys(concepts).length} concepts, ${ids.length} icons referenced`);
console.log(`index.json ${sizeOf(indexText)}`);
