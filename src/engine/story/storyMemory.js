import { grantPacks, withNews } from '../club/economy.js';
import {
  STARTERS, STAT_CAP, clubById, clubCard, nextMatch, squadCards, standings, trialists, windowOffers, xpPerPoint,
} from '../club/season.js';
import { bankTapes } from '../club/tapes.js';
import { t } from '../../lib/i18n.js';

export const STORY_VERSION = 1;

export function initStoryState(picks = []) {
  return {
    v: STORY_VERSION,
    act: 1,
    era: 'origin',
    trust: 60,
    pressure: 20,
    originalSquad: [...picks],
    exPlayers: [],
    rivalries: {},
    hallOfFame: [],
    seen: [],
    completedPacks: [],
    activePack: null,
    pendingScene: null,
    chronicle: null,
    chronicles: [],
    banter: null,
  };
}

export function isStoryClub(state) {
  return Boolean(state?.story);
}

export function storyActLabel(state) {
  if (!state?.story) return '';
  const { act, era } = state.story;
  if (era === 'dynasty') return t('Dynasty era');
  if (era === 'rebuild') return t('Rebuild era');
  if (era === 'nemesis') return t('Nemesis era');
  if (era === 'redemption') return t('Redemption era');
  if (act === 3) return t('Act III');
  if (act === 2) return t('Act II');
  return t('Act I');
}

/** Casts narrative roles dynamically from the current roster and league table. */
export function castSquadRoles(state, cards) {
  const squad = squadCards(state, cards);
  const starters = squad.slice(0, STARTERS);
  const bench = squad.slice(STARTERS);
  const byRatingDesc = [...starters].sort((a, b) => b.rating - a.rating);
  const byRatingAsc = [...starters].sort((a, b) => a.rating - b.rating);
  const igl = starters[0] ?? squad[0];
  const talisman = byRatingDesc[0] ?? igl;
  const rookie = byRatingAsc[0] ?? igl;
  const veteran = byRatingDesc.find(card => state.contracts[card.id] === 1) ?? byRatingDesc[1] ?? talisman;
  const benched = [...bench].sort((a, b) => (state.dev?.[b.id]?.idle ?? 0) - (state.dev?.[a.id]?.idle ?? 0) || b.rating - a.rating)[0] ?? null;

  const match = nextMatch(state);
  const nextRival = match ? clubById(state, match.id) : null;
  const lastRival = state.last?.opponent ? clubById(state, state.last.opponent) : null;
  const tableRivals = state.table ? standings(state, cards).filter(row => !row.you) : [];
  const topRivalRow = tableRivals[0];
  const topRival = (topRivalRow && clubById(state, topRivalRow.id)) ?? nextRival ?? state.clubs?.[0] ?? null;

  const exPlayers = state.story?.exPlayers ?? [];
  const nextNemesis = nextRival ? exPlayers.find(ex => ex.orgId === nextRival.id) : null;
  const lastNemesis = lastRival ? exPlayers.find(ex => ex.orgId === lastRival.id) : null;
  const anyLeagueNemesis = exPlayers.find(ex => state.clubs?.some(club => club.id === ex.orgId)) ?? exPlayers[0] ?? null;
  const nemesis = nextNemesis ?? lastNemesis ?? anyLeagueNemesis;

  const expiring = starters.find(card => state.contracts?.[card.id] === 1) ?? null;
  const suitorRow = tableRivals[0];
  const suitor = (suitorRow && clubById(state, suitorRow.id)) ?? topRival;

  return {
    squad,
    starters,
    bench,
    igl,
    talisman,
    rookie,
    veteran,
    benched,
    nextRival,
    lastRival,
    topRival,
    nemesis,
    nextNemesis,
    lastNemesis,
    expiring,
    suitor,
  };
}

function addCardXp(state, cardId, amount, cards) {
  if (!amount || !state.squad.includes(cardId)) return state;
  const raw = cards.find(item => item.id === cardId);
  if (!raw) return state;
  const currentCard = clubCard(state, raw);
  const targetXp = xpPerPoint(currentCard.rating);
  const total = (state.xp?.[cardId] ?? 0) + amount;
  const points = Math.floor(total / targetXp);
  const xp = { ...state.xp, [cardId]: total % targetXp };
  const devEntry = state.dev?.[cardId] ?? {};
  const dev = points ? { ...state.dev, [cardId]: { ...devEntry, d: (devEntry.d ?? 0) + points } } : state.dev;
  return { ...state, xp, dev };
}

/** Applies mechanical consequences of a story dialogue choice to the club state. */
export function applyStoryEffects(state, effects = {}, cards = []) {
  if (!state?.story || !effects) return state;
  let next = { ...state };
  let story = { ...next.story };

  if (typeof effects.trust === 'number') {
    story.trust = Math.max(0, Math.min(100, story.trust + effects.trust));
  }
  if (typeof effects.pressure === 'number') {
    story.pressure = Math.max(0, Math.min(100, story.pressure + effects.pressure));
  }
  if (typeof effects.reputation === 'number') {
    next.reputation = Math.max(0, (next.reputation ?? 0) + effects.reputation);
  }
  if (typeof effects.packs === 'number' && effects.packs > 0) {
    next = grantPacks(next, { silver: effects.packs });
  }
  if (typeof effects.gold === 'number' && effects.gold > 0) {
    next = grantPacks(next, { gold: effects.gold });
  }
  if (effects.tape) {
    next.trainingTapes = bankTapes(next.trainingTapes, [effects.tape]);
  }
  if (typeof effects.tapesCount === 'number' && effects.tapesCount > 0) {
    next.trainingTapes = bankTapes(next.trainingTapes, Array.from({ length: effects.tapesCount }, () => null));
  }
  if (effects.cardXp) {
    for (const [id, amount] of Object.entries(effects.cardXp)) {
      next = addCardXp(next, id, amount, cards);
    }
  }
  if (typeof effects.allXp === 'number' && effects.allXp > 0) {
    for (const id of next.squad.slice(0, STARTERS)) {
      next = addCardXp(next, id, effects.allXp, cards);
    }
  }
  if (typeof effects.fatigueDelta === 'number') {
    const dev = { ...next.dev };
    for (const id of next.squad.slice(0, STARTERS)) {
      const entry = dev[id] ?? {};
      dev[id] = { ...entry, f: Math.max(0, Math.min(100, (entry.f ?? 0) + effects.fatigueDelta)) };
    }
    next.dev = dev;
  }
  if (effects.statBoost) {
    const { id, stat, amount = 1 } = effects.statBoost;
    if (next.squad.includes(id)) {
      const current = next.training?.[id] ?? { stats: {}, skills: [] };
      const stats = { ...current.stats };
      stats[stat] = Math.min(STAT_CAP, (stats[stat] ?? 0) + amount);
      next.training = { ...next.training, [id]: { ...current, stats } };
    }
  }
  if (effects.promoteCardId && next.squad.includes(effects.promoteCardId)) {
    const idx = next.squad.indexOf(effects.promoteCardId);
    if (idx >= STARTERS) {
      const squad = [...next.squad];
      [squad[STARTERS - 1], squad[idx]] = [squad[idx], squad[STARTERS - 1]];
      next.squad = squad;
    }
  }
  if (effects.transferOut) {
    const { cardId, rivalId, packsGained = 3 } = effects.transferOut;
    const rival = clubById(next, rivalId) ?? next.clubs?.[0];
    const raw = cards.find(c => c.id === cardId);
    if (raw && rival && next.squad.includes(cardId)) {
      const remaining = next.squad.filter(id => id !== cardId);
      const contracts = { ...next.contracts };
      delete contracts[cardId];
      const moved = { ...next.moved, [cardId]: { org: rival.id, name: rival.name, logo: rival.logo } };
      const clubs = next.clubs.map(c => (c.id === rival.id && !c.roster.includes(cardId)
        ? { ...c, roster: [cardId, ...c.roster.slice(0, STARTERS - 1)] }
        : c));
      const fillNeeded = Math.max(0, STARTERS - remaining.length);
      const filling = trialists({ ...next, clubs, moved }, cards, remaining).slice(0, fillNeeded).map(c => c.id);
      for (const id of filling) contracts[id] = 1;
      const squad = [...remaining, ...filling];
      next = {
        ...grantPacks(next, { silver: packsGained }),
        squad,
        contracts,
        moved,
        clubs,
        news: withNews(next, [{ id: cardId, club: rival.id, kind: 'in' }]),
      };
      story.exPlayers = [
        ...story.exPlayers.filter(ex => ex.id !== cardId),
        {
          id: cardId,
          player: raw.player,
          rating: raw.rating,
          seasons: next.year,
          reason: 'poached',
          orgId: rival.id,
          orgName: rival.name,
          yearLeft: next.year,
        },
      ];
    }
  }

  return { ...next, story };
}

/** Updates rivalry win/loss memory after a series. */
export function recordRivalryMatch(story, opponentId, opponentName, won) {
  if (!story || !opponentId) return story;
  const prev = story.rivalries?.[opponentId] ?? { w: 0, l: 0, streak: 0, name: opponentName };
  const streak = won ? (prev.streak > 0 ? prev.streak + 1 : 1) : (prev.streak < 0 ? prev.streak - 1 : -1);
  return {
    ...story,
    rivalries: {
      ...story.rivalries,
      [opponentId]: {
        ...prev,
        name: opponentName ?? prev.name,
        w: prev.w + (won ? 1 : 0),
        l: prev.l + (won ? 0 : 1),
        streak,
      },
    },
  };
}

/** Records poached players and Hall of Fame inductees when the transfer window closes. */
export function recordTransfersInMemory(prevState, nextState, decisions, cards) {
  if (!prevState?.story) return nextState;
  const offers = windowOffers(prevState, cards);
  const { own = {}, drop = [] } = decisions ?? {};
  const story = { ...prevState.story };
  const exPlayers = [...(story.exPlayers ?? [])];
  const hallOfFame = [...(story.hallOfFame ?? [])];

  for (const item of offers.mine) {
    if (own[item.card.id] === 'go') {
      const suitor = item.suitor ?? { id: prevState.clubs?.[0]?.id, name: prevState.clubs?.[0]?.name };
      exPlayers.push({
        id: item.card.id,
        player: item.card.player,
        rating: item.card.rating,
        seasons: prevState.year,
        reason: 'poached',
        orgId: suitor.id,
        orgName: suitor.name,
        yearLeft: prevState.year,
      });
      if (prevState.year >= 3 || prevState.titles > 0) {
        if (!hallOfFame.some(h => h.id === item.card.id)) {
          hallOfFame.push({
            id: item.card.id,
            player: item.card.player,
            rating: item.card.rating,
            seasons: prevState.year,
            titles: prevState.titles,
            yearInducted: prevState.year,
          });
        }
      }
    }
  }

  for (const id of drop) {
    const raw = cards.find(c => c.id === id);
    if (raw && (prevState.year >= 3 || prevState.titles > 0) && !hallOfFame.some(h => h.id === id)) {
      hallOfFame.push({
        id,
        player: raw.player,
        rating: raw.rating,
        seasons: prevState.year,
        titles: prevState.titles,
        yearInducted: prevState.year,
      });
    }
  }

  return {
    ...nextState,
    story: {
      ...story,
      exPlayers,
      hallOfFame,
    },
  };
}

/** Synthesizes the four-axis Era Chronicle at the climax of Act III or a Dynasty Era. */
export function buildEraChronicle(state) {
  const story = state.story ?? initStoryState(state.squad);
  const keptOriginals = (story.originalSquad ?? []).filter(id => state.squad.includes(id)).length;
  const wonChampions = state.titles > 0 && state.tier >= 2;
  const reachedTopFlight = state.tier >= 1 || state.titles > 0;

  const competitiveAxis = wonChampions
    ? t('World champions')
    : reachedTopFlight
      ? t('Ascension contenders')
      : t('Grassroots survivors');

  const identityAxis = keptOriginals >= 3
    ? t('Local heroes')
    : t('Corporate machine');

  const transferAxis = (story.exPlayers?.length ?? 0) === 0
    ? t('Golden generation intact')
    : t('Stars scattered across rivals');

  const cultureAxis = (story.trust ?? 50) >= (story.pressure ?? 50)
    ? t('Player-first haven')
    : t('Cutthroat powerhouse');

  let title;
  let summary;
  if (state.titles > 0 && keptOriginals >= 3) {
    title = t('The Cinderella Dynasty');
    summary = t('You climbed from folding chairs to the trophy with your founding core still standing side by side.');
  } else if (state.titles > 0) {
    title = t('The Mercenary Empire');
    summary = t('You traded sentiment for silverware, reshaping the roster until nobody in the league could stop you.');
  } else if (keptOriginals >= 3) {
    title = t('The Cult Underdog');
    summary = t('Rivals tried to buy your stars, but the founding roster stayed loyal and fought for every inch.');
  } else {
    title = t('The Ironclad Contenders');
    summary = t('Through roster rebuilds and fierce rivalries, your club carved a permanent seat in the circuit.');
  }

  return {
    year: state.year,
    tier: state.tier,
    titles: state.titles,
    title,
    summary,
    axes: [
      { label: t('Competitive result'), value: competitiveAxis, fact: t('{n} titles', { n: state.titles ?? 0 }) },
      { label: t('Club identity'), value: identityAxis, fact: t('Kept {n} of 5 founders', { n: keptOriginals }) },
      { label: t('Transfer legacy'), value: transferAxis, fact: t('{n} players left', { n: story.exPlayers?.length ?? 0 }) },
      { label: t('Locker room'), value: cultureAxis, fact: t('Trust {trust}, pressure {pressure}', { trust: story.trust ?? 50, pressure: story.pressure ?? 50 }) },
    ],
  };
}

/** Picks the next unending Dynasty Era archetype for Year 4 and beyond. */
export function pickNextEra(state) {
  const movement = state.review?.movement;
  const placement = state.review?.placement;
  if (movement === 'relegate' || movement === 'warned') return 'redemption';
  if (placement === 1 || state.titles >= 2) return 'dynasty';
  if (state.story?.exPlayers?.some(ex => state.clubs?.some(club => club.id === ex.orgId))) return 'nemesis';
  const expiringCount = state.squad.filter(id => state.contracts?.[id] === 1).length;
  if (expiringCount >= 2) return 'rebuild';
  return 'dynasty';
}
