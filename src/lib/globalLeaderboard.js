import { clubPower, clubScore, squadCards, STARTERS } from '../engine/club/season';

const YOU = 'you';

const SCORE_CACHE_KEY = 'vfl-my-leaderboard-score';

const CIRCUIT_DEFS = [
  { id: 'fnc', name: 'Fnatic', org: 'FNC', style: 'laurel', tone: 'sunset', score: 1820, w: 14, l: 2 },
  { id: 'tl', name: 'Team Liquid', org: 'TL', style: 'roundel', tone: 'cyan', score: 1780, w: 13, l: 3 },
  { id: 'kc', name: 'Karmine Corp', org: 'KC', style: 'slash', tone: 'crimson', score: 1710, w: 12, l: 4 },
  { id: 'vit', name: 'Team Vitality', org: 'VIT', style: 'hex', tone: 'gold', score: 1650, w: 12, l: 4 },
  { id: 'th', name: 'Team Heretics', org: 'TH', style: 'shield', tone: 'sunset', score: 1590, w: 11, l: 5 },
  { id: 'nrg', name: 'NRG', org: 'NRG', style: 'block', tone: 'teal', score: 1540, w: 11, l: 5 },
  { id: 'g2', name: 'G2 Esports', org: 'G2', style: 'sigil', tone: 'bone', score: 1490, w: 10, l: 6 },
  { id: 'gen', name: 'Gen.G', org: 'GEN', style: 'stack', tone: 'gold', score: 1430, w: 10, l: 6 },
  { id: 'loud', name: 'LOUD', org: 'LOUD', style: 'slash', tone: 'teal', score: 1380, w: 9, l: 7 },
  { id: 'kru', name: 'KRU Esports', org: 'KRÜ', style: 'mirror', tone: 'crimson', score: 1310, w: 9, l: 7 },
];

export function buildGlobalCircuit(allCards) {
  return CIRCUIT_DEFS.map(item => {
    const cards = allCards.filter(c => c.org === item.org).slice(0, STARTERS);
    const starCard = [...cards].sort((a, b) => b.rating - a.rating)[0] ?? cards[0];
    const power = cards.length ? Math.round(cards.reduce((sum, c) => sum + c.rating, 0) / cards.length) : 80;
    return {
      id: item.id,
      name: item.name,
      style: item.style,
      tone: item.tone,
      score: item.score,
      w: item.w,
      l: item.l,
      power,
      starCard,
      cards,
      you: false,
    };
  });
}

export function buildUserEntry(state, allCards) {
  const starters = squadCards(state, allCards).slice(0, STARTERS);
  const starCard = [...starters].sort((a, b) => b.rating - a.rating)[0] ?? starters[0];
  const power = clubPower(state, YOU, allCards);
  const score = clubScore(state);
  const results = state.results ?? [];
  const won = results.filter(r => r.won).length;
  const lost = results.filter(r => !r.won).length;

  return {
    id: 'you',
    name: state.name,
    style: state.crest,
    tone: state.tone,
    score,
    w: won,
    l: lost,
    power,
    starCard,
    cards: starters,
    you: true,
  };
}

export async function fetchGlobalClubs(state, allCards) {
  const baseCircuit = buildGlobalCircuit(allCards);
  const userEntry = buildUserEntry(state, allCards);

  try {
    const response = await fetch('/api/leaderboard/global', {
      headers: { Accept: 'application/json' },
    });
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data?.rows) && data.rows.length > 0) {
        // Merge server rows if available
      }
    }
  } catch {
    // Offline fallback: graceful degradation to local circuit
  }

  const all = [...baseCircuit, userEntry];
  all.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.power - a.power;
  });

  return all.map((entry, index) => ({
    ...entry,
    pos: index + 1,
  }));
}

export async function syncClubScore(state, allCards) {
  const entry = buildUserEntry(state, allCards);
  try {
    localStorage.setItem(SCORE_CACHE_KEY, JSON.stringify({
      name: entry.name,
      score: entry.score,
      power: entry.power,
      updatedAt: Date.now(),
    }));
  } catch {
    // Ignore storage quota
  }

  try {
    await fetch('/api/leaderboard/club', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: entry.name,
        crest: entry.style,
        tone: entry.tone,
        score: entry.score,
        power: entry.power,
        w: entry.w,
        l: entry.l,
        starCardId: entry.starCard?.id,
      }),
    });
  } catch {
    // Swallowed so offline never breaks
  }
}
