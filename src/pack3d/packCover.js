// Picks a pack's cover art from a seed, the way a trading card pack shows a star.
// The same seed always gives the same cover, so a pack keeps its look when it
// reappears, and two packs side by side almost never match.
//
// A cover is a squad of five, matching the five cards inside, kept small so the
// photos stay crisp. It only features players the pack can hold: gold packs show
// gold players, icon packs show icons. It is decoration, not a promise of what is inside.

export const COVER_SIZE = 5;
const RESERVES = 3;
const MAPS = ['abyss', 'ascent', 'bind', 'breeze', 'corrode', 'fracture', 'haven', 'icebox', 'lotus', 'pearl', 'split', 'sunset'];

function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hasPhoto = card => card.photo && !card.photo.includes('placeholder');

const POOLS = {
  any: card => hasPhoto(card) && card.league !== 'icon' && card.palette !== 'icon',
  gold: card => hasPhoto(card) && card.palette === 'gold',
  icon: card => hasPhoto(card) && (card.league === 'icon' || card.palette === 'icon'),
};

const pools = new WeakMap();
function pool(contains, cards) {
  if (!pools.has(cards)) pools.set(cards, new Map());
  const byRule = pools.get(cards);
  if (!byRule.has(contains)) byRule.set(contains, cards.filter(POOLS[contains] ?? POOLS.any));
  return byRule.get(contains);
}

/** The cover for one pack: who is on it, over which map, in which layout. */
export function pickCover(type, seed, cards) {
  const next = random(seed);
  const players = pool(type.contains, cards);
  // Five for the cover plus three reserves, used only if a photo will not load.
  const picked = [];
  while (picked.length < Math.min(COVER_SIZE + RESERVES, players.length)) {
    const card = players[Math.floor(next() * players.length)];
    if (!picked.some(member => member.id === card.id)) picked.push({ id: card.id, photo: card.photo });
  }
  return { seed, map: MAPS[Math.floor(next() * MAPS.length)], squad: picked.slice(0, COVER_SIZE), reserves: picked.slice(COVER_SIZE) };
}
