// Club logos built from a name. No uploads: every mark is drawn from the
// club's initials with a small angular alphabet, then dressed in one of ten
// styles read off how real orgs build theirs (cut monograms, mirrored
// ligatures, shields, roundels, negative-space blocks, keyword emblems).
// Pure and deterministic: the same name and style always give the same SVG.

// Strokes on a 4 x 6 grid. Square caps and mitred joins keep it sharp.
const GLYPHS = {
  A: [[[0, 6], [2, 0], [4, 6]], [[0.9, 4], [3.1, 4]]],
  B: [[[0, 6], [0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]], [[3, 3], [4, 4], [4, 5], [3, 6], [0, 6]]],
  C: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5]]],
  D: [[[0, 0], [0, 6], [2.5, 6], [4, 4.5], [4, 1.5], [2.5, 0], [0, 0]]],
  E: [[[4, 0], [0, 0], [0, 6], [4, 6]], [[0, 3], [3, 3]]],
  F: [[[4, 0], [0, 0], [0, 6]], [[0, 3], [3, 3]]],
  G: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 3], [2, 3]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [[[2, 0], [2, 6]]],
  J: [[[4, 0], [4, 5], [3, 6], [1, 6], [0, 5]]],
  K: [[[0, 0], [0, 6]], [[4, 0], [0, 3.6]], [[1.3, 2.7], [4, 6]]],
  L: [[[0, 0], [0, 6], [4, 6]]],
  M: [[[0, 6], [0, 0], [2, 3.6], [4, 0], [4, 6]]],
  N: [[[0, 6], [0, 0], [4, 6], [4, 0]]],
  O: [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]]],
  P: [[[0, 6], [0, 0], [3, 0], [4, 1], [4, 2.5], [3, 3.5], [0, 3.5]]],
  Q: [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]], [[2.6, 4], [4, 6.4]]],
  R: [[[0, 6], [0, 0], [3, 0], [4, 1], [4, 2.5], [3, 3.5], [0, 3.5]], [[2, 3.5], [4, 6]]],
  S: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 2.2], [1, 3], [3, 3], [4, 3.8], [4, 5], [3, 6], [1, 6], [0, 5]]],
  T: [[[0, 0], [4, 0]], [[2, 0], [2, 6]]],
  U: [[[0, 0], [0, 5], [1, 6], [3, 6], [4, 5], [4, 0]]],
  V: [[[0, 0], [2, 6], [4, 0]]],
  W: [[[0, 0], [1, 6], [2, 2.6], [3, 6], [4, 0]]],
  X: [[[0, 0], [4, 6]], [[4, 0], [0, 6]]],
  Y: [[[0, 0], [2, 3]], [[4, 0], [2, 3], [2, 6]]],
  Z: [[[0, 0], [4, 0], [0, 6], [4, 6]]],
  0: [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]]],
  1: [[[0.6, 1.4], [2, 0], [2, 6]]],
  2: [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2.2], [0, 6], [4, 6]]],
  3: [[[0, 0], [4, 0], [2, 2.8], [3, 2.8], [4, 3.8], [4, 5], [3, 6], [0, 6]]],
  4: [[[3, 6], [3, 0], [0, 4], [4, 4]]],
  5: [[[4, 0], [0, 0], [0, 2.8], [3, 2.6], [4, 3.6], [4, 5], [3, 6], [0, 6]]],
  6: [[[4, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 3.8], [3, 3], [0, 3]]],
  7: [[[0, 0], [4, 0], [1.6, 6]]],
  8: [[[1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [1, 3], [0, 2], [0, 1], [1, 0]], [[1, 3], [0, 4], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3]]],
  9: [[[0, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0], [0, 1], [0, 2.2], [1, 3], [4, 3]]],
};

const NARROW = { I: 0, 1: 0 };

// Colourways, the second axis. The ground is always dark and the two inks always
// light, so every style reads on every colourway and on the dark page.
export const LOGO_TONES = [
  { id: 'valor', label: 'Valor', ground: '#161b29', main: '#ff4655', second: '#ece8e1' },
  { id: 'cyan', label: 'Cyan', ground: '#0d0f17', main: '#00d2ff', second: '#ece8e1' },
  { id: 'gold', label: 'Gold', ground: '#161b29', main: '#d8b34c', second: '#ece8e1' },
  { id: 'teal', label: 'Teal', ground: '#0d0f17', main: '#00c8a0', second: '#ece8e1' },
  { id: 'violet', label: 'Violet', ground: '#1e2435', main: '#b48cff', second: '#ece8e1' },
  { id: 'bone', label: 'Bone', ground: '#161b29', main: '#ece8e1', second: '#ff4655' },
  { id: 'sunset', label: 'Sunset', ground: '#0d0f17', main: '#ff4655', second: '#d8b34c' },
  { id: 'frost', label: 'Frost', ground: '#1e2435', main: '#00d2ff', second: '#ff4655' },
];

// Words in a name that point at a picture, the way Cloud9 is a cloud and
// Heretics a hooded figure. Anything unmatched falls back to a hashed pick.
const KEYWORDS = [
  [/(wolf|wolves|hound|dog|fang|pack)/, 'fang'],
  [/(dragon|drake|wyrm|serpent|snake|viper|cobra)/, 'wing'],
  [/(storm|thunder|bolt|lightning|spark|volt|shock|electric|flash)/, 'bolt'],
  [/(fire|flame|blaze|burn|inferno|ember|phoenix|sun|solar)/, 'flame'],
  [/(king|queen|crown|royal|noble|empire|imperial|lord|legend)/, 'crown'],
  [/(blade|sword|steel|iron|dagger|knife|edge|slash|spear|arrow)/, 'blade'],
  [/(star|nova|galaxy|cosmic|comet|moon|night|astro)/, 'star'],
  [/(eye|vision|sight|watch|scout|hawk|eagle|falcon|raven|owl)/, 'eye'],
  [/(skull|death|ghost|shadow|reaper|phantom|dark|void|grim)/, 'skull'],
  [/(wave|ocean|sea|tide|water|ice|frost|storm|cloud|sky)/, 'wave'],
  [/(mountain|peak|summit|apex|alpha|top|rise|ascend)/, 'peak'],
  [/(bull|ram|horn|beast|titan|giant|rhino|buffalo)/, 'horns'],
];

// Emblems on a 0 to 24 grid, closed polygons plus an optional second shape.
const EMBLEMS = {
  fang: ['M3 4 L12 20 L21 4 L16 4 L12 12 L8 4 Z'],
  wing: ['M2 18 L9 4 L10 12 L14 3 L14 12 L19 6 L22 18 L12 15 Z'],
  bolt: ['M14 1 L4 14 L11 14 L9 23 L20 9 L13 9 Z'],
  flame: ['M12 1 L18 10 L20 16 L17 22 L7 22 L4 16 L7 10 L9 13 Z'],
  crown: ['M2 18 L4 6 L9 12 L12 4 L15 12 L20 6 L22 18 Z'],
  blade: ['M12 1 L16 17 L12 23 L8 17 Z', 'M5 16 L19 16 L19 18 L5 18 Z'],
  star: ['M12 1 L15 9 L23 12 L15 15 L12 23 L9 15 L1 12 L9 9 Z'],
  eye: ['M1 12 L12 4 L23 12 L12 20 Z', 'M12 8 L16 12 L12 16 L8 12 Z'],
  skull: ['M12 2 L20 6 L20 14 L16 16 L16 21 L8 21 L8 16 L4 14 L4 6 Z'],
  wave: ['M1 14 L6 6 L11 14 L16 6 L23 14 L23 20 L1 20 Z'],
  peak: ['M1 21 L9 6 L13 13 L16 9 L23 21 Z'],
  horns: ['M2 3 L8 9 L16 9 L22 3 L21 13 L15 19 L12 22 L9 19 L3 13 Z'],
  prism: ['M12 1 L22 12 L12 23 L2 12 Z'],
  chevrons: ['M2 4 L12 12 L22 4 L22 9 L12 17 L2 9 Z', 'M2 14 L12 22 L22 14 L22 19 L12 27 L2 19 Z'],
  arrow: ['M12 1 L22 13 L15 13 L15 23 L9 23 L9 13 L2 13 Z'],
  hexcore: ['M12 1 L21 6 L21 18 L12 23 L3 18 L3 6 Z'],
};
const FALLBACK = ['prism', 'arrow', 'hexcore', 'chevrons', 'star', 'peak'];

export const LOGO_STYLES = [
  { id: 'cut', label: 'Cut' },
  { id: 'mirror', label: 'Mirror' },
  { id: 'shield', label: 'Shield' },
  { id: 'hex', label: 'Hex' },
  { id: 'block', label: 'Block' },
  { id: 'stack', label: 'Stack' },
  { id: 'roundel', label: 'Roundel' },
  { id: 'sigil', label: 'Sigil' },
  { id: 'slash', label: 'Slash' },
  { id: 'laurel', label: 'Laurel' },
];

/** Letters and digits only, upper case, so nothing odd ever reaches the markup. */
export function cleanName(name) {
  return String(name ?? '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function hashName(name) {
  let h = 2166136261;
  for (const ch of cleanName(name)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Up to three letters: word starts for a long name, the opening letters of a short one. */
export function initialsOf(name) {
  const words = cleanName(name).split(' ').filter(Boolean);
  if (words.length === 0) return 'C';
  if (words.length === 1) return words[0].slice(0, words[0].length > 4 ? 2 : Math.min(3, words[0].length));
  return words.slice(0, 3).map(word => word[0]).join('');
}

export function emblemFor(name) {
  const clean = cleanName(name).toLowerCase();
  for (const [pattern, key] of KEYWORDS) if (pattern.test(clean)) return key;
  return FALLBACK[hashName(name) % FALLBACK.length];
}

/** The colourway a club starts on, read off its name. */
export function defaultLogoTone(name) {
  return (hashName(name) >>> 4) % LOGO_TONES.length;
}

export function toneFor(name, tone) {
  return LOGO_TONES[Number.isInteger(tone) && LOGO_TONES[tone] ? tone : defaultLogoTone(name)];
}

// ── drawing helpers ─────────────────────────────────────────────────────────

const f = n => Math.round(n * 100) / 100;
const path = points => points.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join('');

function strokes(letter) {
  return GLYPHS[letter] ?? GLYPHS[0];
}

function width(letter) {
  return letter in NARROW ? NARROW[letter] : 4;
}

/** A run of letters as one stroked path group, centred on (cx, cy) and fitted to a box. */
function word(letters, { cx, cy, w, h, stroke, color, skew = 0, gap = 1.2, mirrorLast = false }) {
  const chars = [...letters];
  let total = 0;
  const offsets = chars.map(ch => { const at = total; total += width(ch) + gap; return at; });
  total -= gap;
  const scale = Math.min(w / Math.max(total, 1), h / 6);
  const left = cx - (total * scale) / 2;
  const top = cy - (6 * scale) / 2;
  const parts = chars.map((ch, index) => {
    const flip = mirrorLast && index === chars.length - 1;
    const d = strokes(ch).map(line => path(line.map(([x, y]) => {
      const px = flip ? width(ch) - x : x;
      return [left + (offsets[index] + px) * scale + (skew ? (3 - y) * skew * scale : 0), top + y * scale];
    }))).join('');
    return `<path d="${d}"/>`;
  });
  return `<g fill="none" stroke="${color}" stroke-width="${f(stroke * scale * 0.72)}" stroke-linecap="square" stroke-linejoin="miter" stroke-miterlimit="6">${parts.join('')}</g>`;
}

function poly(d, fill, extra = '') {
  return `<path d="${d}" fill="${fill}" ${extra}/>`;
}

function emblem(key, { x, y, size, fill }) {
  const scale = size / 24;
  const shapes = (EMBLEMS[key] ?? EMBLEMS.prism).map(d => `<path d="${d}"/>`).join('');
  return `<g fill="${fill}" transform="translate(${f(x - size / 2)} ${f(y - size / 2)}) scale(${f(scale)})">${shapes}</g>`;
}

const SHIELD = 'M50 4 L90 14 L90 50 Q90 78 50 96 Q10 78 10 50 L10 14 Z';
const HEX = 'M50 4 L90 27 L90 73 L50 96 L10 73 L10 27 Z';

// ── the ten styles ──────────────────────────────────────────────────────────

const DRAW = {
  // Slanted wordmark sliced by one diagonal gap, the NRG and FPX move.
  cut(p, t) {
    const n = p.letters.length;
    return [
      word(p.letters, { cx: 50, cy: 50, w: 88, h: n > 2 ? 40 : 54, stroke: 1.3, color: t.main, skew: 0.28, gap: 1.4 }),
      `<path d="M8 66 L92 40" stroke="${t.ground}" stroke-width="3.4"/>`,
      `<path d="M14 80 L86 80" stroke="${t.second}" stroke-width="2.4"/>`,
    ].join('');
  },
  // First letter and its reflection share a spine: GG, RR.
  mirror(p, t) {
    const lead = [...p.letters].find(ch => !(ch in NARROW)) ?? p.letters[0];
    return [
      `<path d="M50 6 L50 94" stroke="${t.second}" stroke-width="1.6"/>`,
      word(lead + lead, { cx: 50, cy: 50, w: 84, h: 62, stroke: 1.5, color: t.main, gap: 0, mirrorLast: true }),
      p.letters.length > 1 ? `<path d="M26 90 L74 90" stroke="${t.second}" stroke-width="3"/>` : '',
    ].join('');
  },
  // Shield with a chevron band and the initials riding it, the Furia and Liquid frame.
  shield(p, t) {
    return [
      poly(SHIELD, t.ground),
      `<path d="${SHIELD}" fill="none" stroke="${t.main}" stroke-width="3.2" stroke-linejoin="miter"/>`,
      poly('M10 56 L50 74 L90 56 L90 66 L50 84 L10 66 Z', t.main),
      word(p.letters, { cx: 50, cy: 38, w: 50, h: 28, stroke: 1.5, color: t.second, gap: 1.2 }),
    ].join('');
  },
  // Hex plate, inset rule, big letter and one pip per word.
  hex(p, t) {
    const pips = Math.min(p.words, 5);
    const dots = Array.from({ length: pips }, (_, i) => poly(`M${f(50 + (i - (pips - 1) / 2) * 9 - 2.6)} 82 l2.6 -3 l2.6 3 l-2.6 3 Z`, t.main)).join('');
    return [
      poly(HEX, t.ground),
      `<path d="${HEX}" fill="none" stroke="${t.main}" stroke-width="3" stroke-linejoin="miter"/>`,
      `<path d="M50 12 L83 31 L83 69 L50 88 L17 69 L17 31 Z" fill="none" stroke="${t.second}" stroke-width="0.9"/>`,
      word(p.letters.slice(0, 2), { cx: 50, cy: 46, w: 44, h: 32, stroke: 1.6, color: t.second, gap: 1.2 }),
      dots,
    ].join('');
  },
  // Solid block with the letters knocked out, the Sentinels V.
  block(p, t) {
    return [
      poly('M8 8 L80 8 L92 20 L92 92 L20 92 L8 80 Z', t.main),
      word(p.letters.slice(0, 2), { cx: 50, cy: 50, w: 60, h: 52, stroke: 2, color: t.ground, gap: 1.4 }),
      `<path d="M8 80 L20 92 L8 92 Z" fill="${t.ground}"/>`,
    ].join('');
  },
  // The lead letter drawn three times, each offset, like layered chevrons.
  stack(p, t) {
    const lead = p.letters[0];
    const layer = (dx, dy, color, stroke) => word(lead, { cx: 50 + dx, cy: 50 + dy, w: 52, h: 66, stroke, color, gap: 0 });
    return [
      layer(11, 11, t.main, 2.6),
      layer(0, 0, t.ground, 3.3),
      layer(0, 0, t.second, 2.6),
    ].join('');
  },
  // Ring, the name running round it, the initials in the middle.
  roundel(p, t) {
    const id = `ring${p.seed}`;
    const label = (p.name || 'CLUB').slice(0, 22);
    return [
      `<circle cx="50" cy="50" r="46" fill="${t.ground}"/>`,
      `<circle cx="50" cy="50" r="46" fill="none" stroke="${t.main}" stroke-width="3"/>`,
      `<circle cx="50" cy="50" r="32" fill="none" stroke="${t.second}" stroke-width="1"/>`,
      `<defs><path id="${id}" d="M50 50 m-39 0 a39 39 0 1 1 78 0 a39 39 0 1 1 -78 0"/></defs>`,
      `<text font-family="Familjen Grotesk, system-ui, sans-serif" font-size="8.4" font-weight="700" letter-spacing="2.4" fill="${t.main}"><textPath href="#${id}" startOffset="0">${label}</textPath></text>`,
      word(p.letters.slice(0, 2), { cx: 50, cy: 50, w: 36, h: 24, stroke: 1.5, color: t.second, gap: 1.2 }),
    ].join('');
  },
  // A picture pulled from a word in the name, over a plate, initials beneath.
  sigil(p, t) {
    return [
      poly('M50 4 L92 28 L92 72 L50 96 L8 72 L8 28 Z', t.ground),
      `<path d="M50 4 L92 28 L92 72 L50 96 L8 72 L8 28 Z" fill="none" stroke="${t.main}" stroke-width="2.6"/>`,
      emblem(p.emblem, { x: 50, y: 42, size: 40, fill: t.main }),
      word(p.letters.slice(0, 3), { cx: 50, cy: 76, w: 34, h: 12, stroke: 1.8, color: t.second, gap: 1.4 }),
    ].join('');
  },
  // Italic letters on a speed plate with slashes, the T1 and NaVi family.
  slash(p, t) {
    return [
      poly('M16 22 L96 22 L84 78 L4 78 Z', t.main),
      `<path d="M2 86 L74 86 M10 92 L58 92" stroke="${t.second}" stroke-width="2.4"/>`,
      word(p.letters, { cx: 50, cy: 50, w: 66, h: 34, stroke: 1.6, color: t.ground, skew: 0.3, gap: 1.2 }),
    ].join('');
  },
  // Initials inside two angular branches, the M8 wreath.
  laurel(p, t) {
    const branch = side => {
      const sign = side === 'l' ? 1 : -1;
      const base = side === 'l' ? 0 : 100;
      return [0, 1, 2, 3, 4].map(i => {
        const y = 76 - i * 14;
        const x = base + sign * (14 + Math.sin(i * 0.6) * 4);
        return poly(`M${f(x)} ${y} L${f(x + sign * 12)} ${y - 9} L${f(x + sign * 7)} ${y + 3} Z`, t.main);
      }).join('');
    };
    return [
      branch('l'), branch('r'),
      `<path d="M30 90 L50 96 L70 90" fill="none" stroke="${t.second}" stroke-width="2"/>`,
      word(p.letters.slice(0, 3), { cx: 50, cy: 46, w: 42, h: 34, stroke: 1.8, color: t.second, gap: 1.2 }),
      `<path d="M38 70 L62 70" stroke="${t.main}" stroke-width="2.4"/>`,
    ].join('');
  },
};

/** The style a club starts on before it picks one, read off its name. */
export function defaultLogoStyle(name) {
  return LOGO_STYLES[hashName(name) % LOGO_STYLES.length].id;
}

/** Everything a style needs, read off the name. */
export function logoParts(name) {
  const clean = cleanName(name);
  return {
    name: clean,
    letters: initialsOf(clean),
    words: Math.max(1, clean.split(' ').filter(Boolean).length),
    seed: hashName(clean) % 10000,
    emblem: emblemFor(clean),
  };
}

/** The finished SVG markup for one style. Safe to inject: only built from cleaned text and numbers. */
export function logoSvg(name, styleId, tone) {
  const style = DRAW[styleId] ? styleId : LOGO_STYLES[0].id;
  const parts = logoParts(name);
  const body = DRAW[style](parts, toneFor(name, tone));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-hidden="true">${body}</svg>`;
}

/** All ten styles in one colourway, in picker order. */
export function logoOptions(name, tone) {
  return LOGO_STYLES.map(style => ({ ...style, svg: logoSvg(name, style.id, tone) }));
}
