// Crests assembled from parts drawn offline. The parts are game-icons.net icons
// (CC BY 3.0) shipped as one path file each under public/crest-parts, plus a
// lexicon that maps words in many languages to them. Built by
// scripts/build-crest-parts.js. The phone never draws: `pickCrest` turns a name
// into a recipe, and `assembleCrest` turns a recipe and the fetched paths into
// SVG. Both are pure; the same name always gives the same default crest.

import { hashTag } from './season.js';
import { LOGO_TONES } from './logo.js';

const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;
const ARABIC = /^\p{Script=Arabic}/u;
const STOP = new Set('the of and a an in on with de la el los las del da do das dos di le les du des der die und y e et team club fc esports gaming gg academy'.split(' '));

/** Lower case, accents and diacritics folded (kana voicing kept), so any script compares by letters. */
export function foldText(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, mark => (mark === '゙' || mark === '゚' ? mark : ''))
    .normalize('NFC')
    .toLowerCase()
    .replace(/ـ/g, '');
}

/** Words of a folded name, split on anything that is not a letter or digit. */
export function wordsOf(text) {
  return foldText(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** Forms a word might be filed under: itself, then common plural and article strippings. */
export function stemsOf(word) {
  const forms = [word];
  if (ARABIC.test(word)) {
    for (const prefix of ['وال', 'بال', 'فال', 'كال', 'لل', 'ال', 'و']) {
      if (word.startsWith(prefix) && word.length - prefix.length >= 2) forms.push(word.slice(prefix.length));
    }
    return forms;
  }
  const swaps = [['ies', 'y'], ['ves', 'f'], ['ves', 'fe'], ['es', ''], ['s', ''], ['en', ''], ['ler', ''], ['lar', ''], ['и', ''], ['ы', '']];
  for (const [end, put] of swaps) {
    if (word.length > end.length + 2 && word.endsWith(end)) forms.push(word.slice(0, -end.length) + put);
  }
  return forms;
}

function grams(word) {
  const letters = [...`^${word}$`];
  const out = new Set();
  for (const size of [2, 3]) for (let i = 0; i + size <= letters.length; i++) out.add(letters.slice(i, i + size).join(''));
  return out;
}

function similarity(a, b) {
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared++;
  return (2 * shared) / (a.size + b.size);
}

const NEAR_THRESHOLD = 0.6;
const nearCache = new WeakMap();

function nearest(word, lexicon) {
  let table = nearCache.get(lexicon);
  if (!table) {
    table = lexicon.near.map(entry => [entry, grams(entry)]);
    nearCache.set(lexicon, table);
  }
  const mine = grams(word);
  let best = null;
  let bestScore = NEAR_THRESHOLD;
  const lead = [...word][0];
  for (const [entry, theirs] of table) {
    // Invented names keep their opening sound: Drakonis reads as drakon, not as a rhyme.
    if ([...entry][0] !== lead) continue;
    const score = similarity(mine, theirs);
    if (score > bestScore) { best = entry; bestScore = score; }
  }
  return best;
}

const longestCache = new WeakMap();

function longestUnspaced(lexicon) {
  if (!longestCache.has(lexicon)) {
    const sizes = Object.keys(lexicon.words).filter(key => UNSPACED.test(key)).map(key => [...key].length);
    longestCache.set(lexicon, Math.max(1, ...sizes));
  }
  return longestCache.get(lexicon);
}

function lookup(lexicon, key) {
  return Object.hasOwn(lexicon.words, key) ? lexicon.words[key] : undefined;
}

/** Two known words run together, like thunderwolves. */
function splitCompound(word, lexicon) {
  const chars = [...word];
  for (let cut = chars.length - 3; cut >= 3; cut--) {
    const head = chars.slice(0, cut).join('');
    const tail = stemsOf(chars.slice(cut).join('')).find(form => lookup(lexicon, form) !== undefined);
    if (tail !== undefined && lookup(lexicon, head) !== undefined) return [head, tail];
  }
  return null;
}

/** Words of the name that point at parts, in name order, with how each was found. */
export function matchWords(name, lexicon) {
  const hits = [];
  const longest = longestUnspaced(lexicon);
  for (const word of wordsOf(name)) {
    if (STOP.has(word)) continue;
    if (UNSPACED.test(word)) {
      const chars = [...word];
      for (let at = 0; at < chars.length;) {
        let found = 0;
        for (let size = Math.min(longest, chars.length - at); size > 0 && !found; size--) {
          const piece = chars.slice(at, at + size).join('');
          const entry = lookup(lexicon, piece);
          if (entry !== undefined) { hits.push({ word: piece, entry, how: 'exact' }); found = size; }
        }
        at += found || 1;
      }
      continue;
    }
    const forms = stemsOf(word);
    const form = forms.find(candidate => lookup(lexicon, candidate) !== undefined);
    if (form !== undefined) {
      hits.push({ word, entry: lookup(lexicon, form), how: form === word ? 'exact' : 'stem' });
      continue;
    }
    const split = splitCompound(word, lexicon);
    if (split) {
      for (const part of split) hits.push({ word: part, entry: lookup(lexicon, part), how: 'compound' });
      continue;
    }
    if ([...word].length >= 5 && !/^\p{N}+$/u.test(word)) {
      const near = nearest(word, lexicon);
      if (near) hits.push({ word, entry: lookup(lexicon, near), how: 'near', via: near });
    }
  }
  return hits;
}

const graphemes = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

function firstLetter(word) {
  const bare = ARABIC.test(word) && word.startsWith('ال') && word.length > 3 ? word.slice(2) : word;
  return graphemes ? graphemes.segment(bare)[Symbol.iterator]().next().value.segment : [...bare][0];
}

/** Up to two first letters, one per word, upper-cased where the script has case. */
export function monogramOf(name) {
  const words = (String(name ?? '').normalize('NFC').match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*/gu) ?? [])
    .filter(word => !STOP.has(word.toLowerCase()));
  if (!words.length) return '';
  if (words.length === 1) {
    const letters = graphemes ? [...graphemes.segment(words[0])].map(part => part.segment) : [...words[0]];
    return letters.slice(0, UNSPACED.test(words[0]) ? 1 : 2).join('').toUpperCase();
  }
  return words.slice(0, 2).map(firstLetter).join('').toUpperCase();
}

// Shapes a name can land on by itself, then every shape a player can choose.
export const CREST_SHELLS = ['shield', 'hex', 'notch', 'pennant', 'octagon', 'circle', 'square', 'diamond'];
export const CREST_SHAPES = [...CREST_SHELLS, 'none'];

/**
 * Name in, recipe out: `{ marks, shell, frame, tone, style, seed, monogram, hits }`.
 * `reroll` walks through alternatives; 0 is the name's own crest. `style`,
 * `shape` and `frame` ('filled' or 'outline') are the player's choices; left
 * out, the style is esports, the shape comes from the name and it is filled.
 */
export function pickCrest(name, lexicon, { reroll = 0, tone, style, shape, frame } = {}) {
  const roll = Math.max(0, Math.floor(Number(reroll) || 0));
  const seed = hashTag(wordsOf(name).join(' '));
  const ids = lexicon.ids;
  const parts = [];
  for (const hit of matchWords(name, lexicon)) {
    const concept = typeof hit.entry === 'string' ? lexicon.concepts[hit.entry] : null;
    const key = concept ? hit.entry : `tag:${hit.word}`;
    if (parts.some(part => part.key === key)) continue;
    parts.push({ key, role: concept?.role ?? 'subject', icons: (concept?.icons ?? hit.entry).map(index => ids[index]), with: concept?.with, hit });
  }

  let primary = parts.find(part => part.role === 'subject') ?? parts[0];
  let secondary = primary && (parts.find(part => part !== primary && part.role === 'modifier') ?? parts.find(part => part !== primary));
  if (primary && !secondary && primary.with && lexicon.concepts[primary.with]) {
    secondary = { key: primary.with, icons: lexicon.concepts[primary.with].icons.map(index => ids[index]), hit: { word: primary.hit.word, how: 'implied' } };
  }
  const hits = [];
  if (!primary) {
    const pool = lexicon.fallback.map(index => ids[index]);
    primary = { icons: [pool[(hashTag(seed, 'mark') + roll) % pool.length]], hit: { word: wordsOf(name)[0] ?? '', how: 'hash' } };
  }
  const first = primary.icons.length;
  const marks = [primary.icons[roll % first]];
  hits.push({ ...primary.hit, icon: marks[0] });
  if (secondary) {
    marks.push(secondary.icons[Math.floor(roll / first) % secondary.icons.length]);
    hits.push({ ...secondary.hit, icon: marks[1] });
  }
  const toneIndex = Number.isInteger(tone) && LOGO_TONES[tone] ? tone : (seed >>> 5) % LOGO_TONES.length;
  return {
    marks,
    shell: CREST_SHAPES.includes(shape) ? shape : CREST_SHELLS[(seed + roll) % CREST_SHELLS.length],
    frame: frame === 'outline' ? 'outline' : 'filled',
    tone: toneIndex,
    style: CREST_STYLES.includes(style) ? style : 'esports',
    seed,
    monogram: marks.length < 2 ? monogramOf(name) : '',
    hits,
  };
}

// ── assembly ────────────────────────────────────────────────────────────────

// Shells on the icons' own 512 grid. `box` is where the lead mark sits.
const SHELLS = {
  shield: { d: 'M256 20L476 70V270L256 492L36 270V70Z', box: [104, 92, 304, 304] },
  hex: { d: 'M256 18L462 137V375L256 494L50 375V137Z', box: [112, 112, 288, 288] },
  notch: { d: 'M24 24H404L488 108V488H108L24 404Z', box: [100, 100, 312, 312] },
  pennant: { d: 'M40 32H472V336L256 484L40 336Z', box: [104, 64, 304, 304] },
  octagon: { d: 'M156 26H356L486 156V356L356 486H156L26 356V156Z', box: [100, 100, 312, 312] },
  circle: { d: 'M256 24A232 232 0 1 1 256 488A232 232 0 1 1 256 24Z', box: [110, 110, 292, 292] },
  square: { d: 'M30 30H482V482H30Z', box: [100, 100, 312, 312] },
  diamond: { d: 'M256 10L502 256L256 502L10 256Z', box: [128, 128, 256, 256] },
  none: { d: null, box: [48, 40, 416, 416] },
};

const SAFE_PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]+$/;
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeXml = text => String(text).replace(/[&<>"']/g, char => ESCAPES[char]);
const r = n => Math.round(n * 100) / 100;

function mix(a, b, amount) {
  const channels = hex => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16));
  const [x, y] = [channels(a), channels(b)];
  return `#${x.map((value, i) => Math.round(value + (y[i] - value) * amount).toString(16).padStart(2, '0')).join('')}`;
}

function pathsOf(text) {
  return String(text ?? '').split('\n').map(line => line.trim()).filter(line => line && SAFE_PATH.test(line));
}

function placed(d, [x, y, w, h], attrs) {
  const scale = Math.min(w, h) / 512;
  const left = x + (w - 512 * scale) / 2;
  const top = y + (h - 512 * scale) / 2;
  return `<g transform="translate(${r(left)} ${r(top)}) scale(${r(scale * 1000) / 1000})" ${attrs}>${d.map(line => `<path d="${line}"/>`).join('')}</g>`;
}

const FONT = 'Familjen Grotesk, system-ui, sans-serif';
const PAPER = '#ece8e1';

function letters(text, x, y, size, attrs) {
  return `<text x="${x}" y="${r(y)}" dominant-baseline="central" font-size="${size}" ${attrs}>${escapeXml(text)}</text>`;
}

// The lead mark's box, shrunk and lifted when letters sit under it.
function leadBox({ shell, monogram }, grow = 0) {
  const [x, y, w, h] = shell.box;
  return monogram ? [x + 30 - grow, y - 6 - grow, w - 60 + grow * 2, h - 60 + grow * 2] : [x - grow, y - grow, w + grow * 2, h + grow * 2];
}

const strokeIn = (box, width) => width / (Math.min(box[2], box[3]) / 512);
const shifted = ([x, y, w, h], dx, dy) => [x + dx, y + dy, w, h];

// The shape, filled unless the crest is drawn as an outline. Nothing without a shape.
function plate(c, fill, attrs = '') {
  return c.shell.d ? `<path d="${c.shell.d}" fill="${c.outline ? 'none' : fill}" ${attrs}/>` : '';
}

function ring(c, attrs) {
  return c.shell.d ? `<path d="${c.shell.d}" fill="none" ${attrs}/>` : '';
}

function clipped(c, key, inner) {
  return c.shell.d ? `<defs><clipPath id="${c.uid}${key}"><path d="${c.shell.d}"/></clipPath></defs><g clip-path="url(#${c.uid}${key})">${inner}</g>` : '';
}

const INSET = 'transform="translate(30.72 30.72) scale(.88)"';

// Each style draws a full crest and a 22 px one from the same parts. `c.bare`
// means the page shows through (outline or no shape), so marks go light.
const STYLES = {
  // Sticker mark with a double outline, the second motif washed into the field.
  esports: {
    full(c) {
      const { tone, lead, back, monogram, shell } = c;
      const out = [plate(c, tone.ground)];
      // The washed motif needs the filled field under it.
      if (back && !c.outline) out.push(clipped(c, 'b', placed(back, [-40, -40, 592, 592], `fill="${mix(tone.ground, tone.main, 0.32)}"`)));
      // An outline crest swaps the heavy rim for a thin double line.
      if (c.outline && shell.d) out.push(ring(c, `stroke="${tone.main}" stroke-width="10" stroke-linejoin="miter"`), `<path d="${shell.d}" ${INSET} fill="none" stroke="${tone.second}" stroke-width="4"/>`);
      else out.push(ring(c, `stroke="${tone.main}" stroke-width="22" stroke-linejoin="miter"`));
      const box = leadBox(c);
      if (lead) {
        const outline = (width, colour) => placed(lead, box, `fill="${colour}" stroke="${colour}" stroke-width="${r(strokeIn(box, width))}" stroke-linejoin="miter" stroke-miterlimit="2"`);
        out.push(outline(30, tone.main), outline(14, tone.ground), placed(lead, box, `fill="${tone.second}"`));
      }
      if (monogram) {
        const cy = shell.box[1] + shell.box[3] - 30;
        out.push(`<path d="M156 ${cy - 34}H356L380 ${cy}L356 ${cy + 34}H156L132 ${cy}Z" fill="${tone.main}" stroke="${tone.ground}" stroke-width="10"/>`);
        out.push(letters(monogram, 256, cy, 50, `text-anchor="middle" font-family="${FONT}" font-weight="800" letter-spacing="2" fill="${tone.ground}"`));
      }
      return out.join('');
    },
    small({ tone, shell, lead }) {
      return `<path d="${shell.d}" fill="${tone.main}"/>${lead ? placed(lead, leadBox({ shell }, 24), `fill="${tone.ground}"`) : ''}`;
    },
  },
  // One mark, one colour, a hairline edge and air.
  minimal: {
    full(c) {
      const { tone, shell, lead, monogram } = c;
      const [x, y, w, h] = shell.box;
      const box = monogram ? [x + w * 0.2, y + h * 0.04, w * 0.6, h * 0.6] : [x + w * 0.13, y + h * 0.13, w * 0.74, h * 0.74];
      const out = [plate(c, tone.ground, `stroke="${mix(tone.ground, tone.second, c.outline ? 0.6 : 0.35)}" stroke-width="4"`)];
      if (lead) out.push(placed(lead, box, `fill="${tone.main}"`));
      if (monogram) out.push(letters(monogram, 256 + 6, y + h - 22, 32, `text-anchor="middle" font-family="${FONT}" font-weight="500" letter-spacing="12" fill="${tone.second}"`));
      return out.join('');
    },
    small({ tone, lead }) {
      return lead ? placed(lead, [8, 8, 496, 496], `fill="${tone.main}"`) : '';
    },
  },
  // Slab colour, a hard offset block, heavy type on a full-width bar.
  brutalist: {
    full(c) {
      const { tone, shell, lead, back, monogram, bare } = c;
      const out = ['<g transform="translate(6 6) scale(.9)">'];
      if (shell.d) {
        out.push(c.outline
          ? `<path d="${shell.d}" transform="translate(44 44)" fill="none" stroke="${tone.second}" stroke-width="18"/>`
          : `<path d="${shell.d}" transform="translate(44 44)" fill="${tone.second}"/>`);
        out.push(plate(c, tone.main, `stroke="${c.outline ? tone.main : tone.ground}" stroke-width="18" stroke-linejoin="miter"`));
      }
      const [x, y, w, h] = shell.box;
      const box = monogram ? [x - 10, y - 30, w + 20, h - 30] : [x - 26, y - 26, w + 52, h + 52];
      if (lead) {
        if (bare) out.push(placed(lead, shifted(box, 26, 26), `fill="${tone.second}"`));
        out.push(placed(lead, box, `fill="${bare ? tone.main : tone.ground}"`));
      }
      if (back) out.push(`<rect x="18" y="18" width="140" height="140" fill="${bare ? tone.main : tone.ground}"/>`, placed(back, [36, 36, 104, 104], `fill="${bare ? tone.ground : tone.main}"`));
      if (monogram) {
        out.push(`<rect x="-20" y="${y + h - 64}" width="552" height="104" fill="${bare ? tone.main : tone.ground}"/>`);
        out.push(letters(monogram, 24, y + h - 12, 88, `font-family="${FONT}" font-weight="900" fill="${bare ? tone.ground : tone.main}"`));
      }
      out.push('</g>');
      return out.join('');
    },
    small({ tone, shell, lead }) {
      return `<g transform="translate(6 6) scale(.9)"><path d="${shell.d}" transform="translate(44 44)" fill="${tone.second}"/><path d="${shell.d}" fill="${tone.main}"/>${lead ? placed(lead, leadBox({ shell }, 26), `fill="${tone.ground}"`) : ''}</g>`;
    },
  },
  // Field parted down the middle, a chief carrying the second charge, a scroll.
  heraldic: {
    full(c) {
      const { tone, shell, lead, back, monogram, bare } = c;
      const [x, y, w, h] = shell.box;
      const chief = y + 46;
      const out = [];
      if (!bare) {
        const field = [`<rect width="256" height="512" fill="${tone.main}"/><rect x="256" width="256" height="512" fill="${tone.second}"/>`];
        if (back) field.push(`<rect width="512" height="${chief}" fill="${tone.ground}"/>`, `<rect y="${chief - 8}" width="512" height="8" fill="${tone.second}"/>`);
        out.push(clipped(c, 'f', field.join('')));
        // A light line inside a dark rim, so the outline holds on a dark page.
        out.push(ring(c, `stroke="${tone.ground}" stroke-width="34" stroke-linejoin="miter"`));
        out.push(ring(c, `stroke="${tone.second}" stroke-width="7" stroke-linejoin="miter"`));
      } else {
        out.push(ring(c, `stroke="${tone.main}" stroke-width="14" stroke-linejoin="miter"`));
        if (back && shell.d) out.push(`<path d="M${x - 20} ${chief}H${x + w + 20}" stroke="${tone.main}" stroke-width="6"/>`);
      }
      if (shell.d) out.push(`<path d="${shell.d}" ${INSET} fill="none" stroke="${bare ? tone.second : tone.ground}" stroke-width="5"/>`);
      if (back) out.push(clipped(c, 'c', placed(back, [196, chief - 108, 120, 92], `fill="${tone.second}"`)));
      const box = back && shell.d ? [x + 30, chief + 8, w - 60, y + h - chief - (monogram ? 60 : 8)] : leadBox(c);
      const ink = bare ? tone.main : tone.ground;
      if (lead) out.push(placed(lead, box, `fill="${ink}" stroke="${ink}" stroke-width="${r(strokeIn(box, 4))}"`));
      if (monogram) {
        const cy = y + h - 24;
        out.push(`<path d="M112 ${cy - 30}H400L378 ${cy}L400 ${cy + 30}H112L134 ${cy}Z" fill="${tone.second}" stroke="${tone.ground}" stroke-width="8"/>`);
        out.push(letters(monogram, 256, cy, 44, `text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" letter-spacing="6" fill="${tone.ground}"`));
      }
      return out.join('');
    },
    small(c) {
      const { tone, shell, lead } = c;
      return `${clipped(c, 's', `<rect width="256" height="512" fill="${tone.main}"/><rect x="256" width="256" height="512" fill="${tone.second}"/>`)}<path d="${shell.d}" fill="none" stroke="${tone.ground}" stroke-width="34"/><path d="${shell.d}" fill="none" stroke="${tone.second}" stroke-width="10"/>${lead ? placed(lead, leadBox({ shell }, 14), `fill="${tone.ground}"`) : ''}`;
    },
  },
  // Everything drawn as a single weight of line, no fills.
  line: {
    full(c) {
      const { tone, shell, lead, back, monogram } = c;
      const out = [plate(c, tone.ground, `stroke="${tone.main}" stroke-width="10"`)];
      if (shell.d) out.push(`<path d="${shell.d}" ${INSET} fill="none" stroke="${tone.second}" stroke-width="3"/>`);
      if (back) out.push(clipped(c, 'b', placed(back, [-40, -40, 592, 592], `fill="none" stroke="${mix(tone.ground, tone.main, 0.5)}" stroke-width="2.6"`)));
      const box = leadBox(c);
      if (lead) out.push(placed(lead, box, `fill="${tone.ground}" stroke="${tone.second}" stroke-width="${r(strokeIn(box, 7))}" stroke-linejoin="round"`));
      if (monogram) out.push(letters(monogram, 256 + 4, shell.box[1] + shell.box[3] - 22, 42, `text-anchor="middle" font-family="${FONT}" font-weight="700" letter-spacing="8" fill="none" stroke="${tone.second}" stroke-width="3.5"`));
      return out.join('');
    },
    small({ tone, shell, lead }) {
      return `<path d="${shell.d}" fill="${tone.ground}" stroke="${tone.main}" stroke-width="40"/>${lead ? placed(lead, leadBox({ shell }, 10), `fill="${tone.main}"`) : ''}`;
    },
  },
  // Two inks printed slightly out of register on paper, the second motif in halftone.
  riso: {
    full(c) {
      const { tone, shell, lead, back, monogram, uid, bare } = c;
      const ink = tone.main === PAPER ? tone.second : tone.main;
      // Multiply only works on paper; over the page the top ink is paper-light instead.
      const top = bare ? PAPER : tone.ground;
      const blend = bare ? '' : 'style="mix-blend-mode:multiply"';
      const out = [`<defs><pattern id="${uid}h" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(28)"><circle cx="10" cy="10" r="5.5" fill="${ink}"/></pattern></defs>`,
        plate(c, PAPER)];
      if (back) out.push(clipped(c, 'b', placed(back, [-40, -40, 592, 592], `fill="url(#${uid}h)"`)));
      if (shell.d) {
        out.push(`<path d="${shell.d}" transform="translate(9 7)" fill="none" stroke="${ink}" stroke-width="14" ${blend}/>`);
        out.push(ring(c, `stroke="${top}" stroke-width="6"`));
      }
      const box = leadBox(c);
      if (lead) out.push(placed(lead, shifted(box, 14, 10), `fill="${ink}" ${blend}`), placed(lead, shifted(box, -4, -3), `fill="${top}" ${blend}`));
      if (monogram) {
        const cy = shell.box[1] + shell.box[3] - 24;
        out.push(letters(monogram, 262, cy + 5, 60, `text-anchor="middle" font-family="${FONT}" font-weight="900" fill="${ink}" ${blend}`));
        out.push(letters(monogram, 256, cy, 60, `text-anchor="middle" font-family="${FONT}" font-weight="900" fill="${top}" ${blend}`));
      }
      return out.join('');
    },
    small({ tone, shell, lead }) {
      const ink = tone.main === PAPER ? tone.second : tone.main;
      const box = leadBox({ shell }, 24);
      return `<path d="${shell.d}" fill="${PAPER}"/>${lead ? placed(lead, [box[0] + 22, box[1] + 18, box[2], box[3]], `fill="${ink}"`) + placed(lead, box, `fill="${tone.ground}" style="mix-blend-mode:multiply"`) : ''}`;
    },
  },
};

// At 22 px an outline or shapeless crest is its lead mark in the main colour,
// inside a heavy ring when it has a shape.
function smallBare(c) {
  const { tone, shell, lead } = c;
  const box = shell.d ? leadBox({ shell }, 20) : [8, 8, 496, 496];
  return `${ring(c, `stroke="${tone.main}" stroke-width="40"`)}${lead ? placed(lead, box, `fill="${tone.main}"`) : ''}`;
}

export const CREST_STYLES = Object.keys(STYLES);

/**
 * Recipe plus fetched path text (id -> text, one path per line) in, SVG out.
 * `small` draws the 22 px scoreboard version of the recipe's style.
 * Only numbers, vetted path data and escaped letters reach the markup.
 */
export function assembleCrest(recipe, paths, { small = false } = {}) {
  const style = STYLES[recipe.style] ?? STYLES.esports;
  const [lead, back] = (recipe.marks ?? []).map(id => pathsOf(paths?.[id])).map(d => (d.length ? d : null));
  const shell = SHELLS[recipe.shell] ?? SHELLS.shield;
  const outline = recipe.frame === 'outline' && Boolean(shell.d);
  const context = {
    tone: LOGO_TONES[recipe.tone] ?? LOGO_TONES[0],
    shell,
    outline,
    bare: outline || !shell.d,
    lead,
    back,
    monogram: String(recipe.monogram ?? '').slice(0, 4),
    uid: `cs${hashTag(JSON.stringify([recipe.marks, recipe.shell, recipe.frame, recipe.tone, recipe.style, small]))}`,
  };
  const body = !small ? style.full(context) : context.bare ? smallBare(context) : style.small(context);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true">${body}</svg>`;
}

// ── saved crests ────────────────────────────────────────────────────────────

// A club keeps its crest as one short string in the `crest` field it always had,
// so saves, the leaderboard and online matches carry it unchanged:
//   k1~style~shape~fill~lead[~second]
// The colour stays in `tone`, and letters are read off the club's name.
const CODE_ID = /^[a-z0-9-]{1,40}\/[a-z0-9-]{1,60}$/;
export const CREST_CODE_MAX = 160;

export function encodeCrest(recipe) {
  return ['k1', recipe.style, recipe.shell, recipe.frame === 'outline' ? 'o' : 'f', ...recipe.marks.slice(0, 2)].join('~');
}

/** The drawing part of a saved crest, or null when it is not a valid new-style crest. */
export function decodeCrest(code) {
  if (typeof code !== 'string' || code.length > CREST_CODE_MAX) return null;
  const [version, style, shell, fill, ...marks] = code.split('~');
  if (version !== 'k1' || !CREST_STYLES.includes(style) || !CREST_SHAPES.includes(shell) || !['f', 'o'].includes(fill)) return null;
  if (marks.length < 1 || marks.length > 2 || !marks.every(id => CODE_ID.test(id))) return null;
  return { style, shell, frame: fill === 'o' ? 'outline' : 'filled', marks };
}

export const isKitCrest = code => decodeCrest(code) !== null;

/** A colourway index from a saved tone: an index, a numeric string or a colourway id. */
export function toneIndexOf(tone, name) {
  const number = typeof tone === 'string' && /^\d+$/.test(tone) ? Number(tone) : tone;
  if (Number.isInteger(number) && LOGO_TONES[number]) return number;
  const byId = LOGO_TONES.findIndex(option => option.id === tone);
  return byId >= 0 ? byId : (hashTag(wordsOf(name).join(' ')) >>> 5) % LOGO_TONES.length;
}

/** Everything assembleCrest needs, from a saved code plus the club's name and tone. */
export function savedRecipe(code, name, tone) {
  const drawn = decodeCrest(code);
  if (!drawn) return null;
  return { ...drawn, tone: toneIndexOf(tone, name), monogram: drawn.marks.length < 2 ? monogramOf(name) : '' };
}

/**
 * A club still on an old letter crest moves to the new system: the crest its
 * name picks, in the colour it already chose. Clubs on a new crest are untouched.
 */
export function upgradeCrest(state, lexicon) {
  if (!state?.name || isKitCrest(state.crest)) return state;
  const tone = Number.isInteger(state.tone) && LOGO_TONES[state.tone] ? state.tone : undefined;
  const recipe = pickCrest(state.name, lexicon, { tone });
  return { ...state, crest: encodeCrest(recipe), tone: recipe.tone };
}
