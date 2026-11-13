import { hashTag } from './season.js';

const WORDS = {
  wolf: 'wolf wolves wolfpack serigala lobo lobos loba alcateia',
  moon: 'moon moons moonlight lunar luna lua luar bulan rembulan',
  ice: 'ice icy frost frozen snow glacier hielo helado helada nieve gelo gelado neve geleira es salju beku',
  wing: 'wing wings winged feather alas ala pluma asa asas pena sayap bulu',
  flame: 'fire flame flames phoenix ember fuego llama fénix fogo chama brasa api bara',
  storm: 'storm thunder lightning tempest tormenta trueno rayo tempestade trovão raio badai petir guntur',
  wave: 'wave waves tide ocean sea ola olas océano mar onda ondas oceano ombak gelombang laut samudra',
  orbit: 'orbit orbital quantum quasar cosmic órbita cuántico quântico cósmico kuantum kosmik',
};

// These aliases can be embedded in an unspaced club name.
const CJK = {
  wolf: /狼|オオカミ/u,
  moon: /月/u,
  ice: /冰|氷|霜/u,
  wing: /翼|羽/u,
  flame: /炎|焰|火/u,
  storm: /雷|嵐/u,
  wave: /波|海/u,
  orbit: /量子|軌道|轨道/u,
};

function fold(text) {
  return text.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '');
}

function grams(word) {
  const letters = [...`^${word}$`];
  const result = new Set();
  for (const size of [2, 3, 4]) {
    for (let start = 0; start <= letters.length - size; start++) {
      result.add(letters.slice(start, start + size).join(''));
    }
  }
  return result;
}

const profiles = Object.entries(WORDS).map(([motif, examples]) => {
  const words = new Set(examples.split(' ').map(fold));
  const weights = new Map();
  for (const word of words) {
    for (const gram of grams(word)) weights.set(gram, (weights.get(gram) ?? 0) + 1);
  }
  const norm = Math.hypot(...weights.values());
  return { motif, words, weights, norm };
});

export function suggestMotifs(name) {
  const text = fold(name);
  const words = (text.match(/[\p{L}]+/gu) ?? []).map(word => ({ word, grams: grams(word) }));
  return profiles.map(({ motif, words: knownWords, weights, norm }) => {
    let score = Number(CJK[motif].test(text));
    for (const { word, grams: features } of words) {
      if (knownWords.has(word)) {
        score = 1;
        break;
      }
      if (word.length < 5) continue;
      const sum = [...features].reduce((total, gram) => total + (weights.get(gram) ?? 0), 0);
      score = Math.max(score, sum / (norm * Math.sqrt(features.size)));
    }
    return { motif, score };
  }).filter(({ score }) => score >= 0.24)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(({ motif }) => motif);
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function initials(name) {
  const words = name.match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
  if (!words.length) return '';
  const letters = word => [...graphemes.segment(word)].map(({ segment }) => segment);
  return words.length > 1
    ? words.slice(0, 2).map(word => letters(word)[0]).join('')
    : letters(words[0]).slice(0, 2).join('');
}

export function crestConcepts(name, batch = 0, motif = 'auto') {
  const normalized = name.normalize('NFC').trim().replace(/\s+/gu, ' ');
  const suggestions = motif === 'auto' ? suggestMotifs(normalized) : Object.hasOwn(WORDS, motif) ? [motif] : [];
  const [primary = null, secondary = null] = suggestions;
  const monogram = initials(normalized);
  const nameKey = Array.from(normalized, char => char.codePointAt(0)).join(',');
  const layouts = ['emblem', 'shield', monogram ? 'monogram' : 'orbit', 'abstract'];
  return layouts.map(layout => ({
    version: 2,
    seed: hashTag(nameKey, batch, layout),
    layout,
    motif: layout === 'abstract' ? null : layout === 'shield' ? secondary ?? primary : primary,
    monogram,
  }));
}
