import { clubPower, clubScore, squadCards, STARTERS } from '../engine/club/season.js';

const YOU = 'you';
const SCORE_CACHE_KEY = 'vfl-my-leaderboard-score';
const CLIENT_ID_KEY = 'vfl-client-id';
let fallbackClientId;

export function getClientId() {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    fallbackClientId ??= crypto.randomUUID();
    return fallbackClientId;
  }
}

export function buildUserEntry(state, allCards) {
  if (!state) return null;
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
  if (!state) return [];
  const userEntry = buildUserEntry(state, allCards);
  const clientId = getClientId();
  const cardById = new Map((allCards ?? []).map(c => [c.id, c]));

  syncClubScore(state, allCards);

  let serverRows = null;
  let serverUserRow = null;

  try {
    const response = await fetch(`/api/leaderboard/global?clientId=${encodeURIComponent(clientId)}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data?.rows)) {
        serverRows = data.rows;
        serverUserRow = data.userRow ?? null;
      }
    }
  } catch {
    // Offline fallback
  }

  if (serverRows !== null && serverRows.length > 0) {
    const list = serverRows.map(row => {
      const isYou = Boolean(row.isYou || row.id === clientId || row.name === state.name);
      if (isYou) return userEntry;
      const cards = (row.cardIds ?? []).map(id => cardById.get(id)).filter(Boolean);
      const starCard = (row.starCardId ? cardById.get(row.starCardId) : null) ?? cards[0] ?? (allCards ? allCards[0] : null);
      return {
        id: row.id,
        name: row.name,
        style: row.style,
        tone: row.tone,
        score: row.score,
        w: row.w,
        l: row.l,
        power: row.power,
        starCard,
        cards: cards.length > 0 ? cards : squadCards(state, allCards).slice(0, STARTERS),
        you: false,
      };
    });

    const hasYou = list.some(item => item.you);
    if (!hasYou) {
      if (serverUserRow) {
        userEntry.pos = serverUserRow.pos;
      }
      list.push(userEntry);
      list.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.power - a.power;
      });
    }

    return list.map((entry, index) => ({
      ...entry,
      pos: entry.pos ?? (index + 1),
    }));
  }

  return [{ ...userEntry, pos: 1 }];
}

export async function syncClubScore(state, allCards) {
  if (!state) return;
  const entry = buildUserEntry(state, allCards);
  if (!entry) return;
  const clientId = getClientId();

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
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId,
        name: entry.name,
        crest: entry.style,
        tone: entry.tone,
        score: entry.score,
        power: entry.power,
        w: entry.w,
        l: entry.l,
        starCardId: entry.starCard?.id ?? null,
        cardIds: (entry.cards ?? []).map(c => c.id),
      }),
    });
  } catch {
    // Swallowed so offline never breaks
  }
}
