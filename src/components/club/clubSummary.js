import allCards from '../../../shared/src/data/cards.json';
import { STARTERS, clubById, nextMatch, squadCards, standings } from '../../engine/club/season';
import { TIER_META } from '../../engine/endless/ladder';
import { t } from '../../lib/i18n';

// The few facts the entry screens show about a saved club, read with the same
// engine functions the hub uses so the landing can't disagree with it.
export function clubSummary(state, cards = allCards) {
  if (!state) return null;
  const match = nextMatch(state);
  const rival = match ? clubById(state, match.id) : null;
  const started = state.results.length > 0;
  const pos = started ? standings(state, cards).find(row => row.you).pos : null;
  return {
    name: state.name,
    tier: TIER_META[state.tier].label,
    tierIndex: state.tier,
    year: state.year,
    titles: state.titles,
    pos,
    starters: squadCards(state, cards).slice(0, STARTERS),
    match: match && rival ? { stage: match.stage, bestOf: match.bestOf, rival: rival.name, logo: rival.logo } : null,
    phase: state.phase,
  };
}

// The strongest real VCT cards, for a new player's landing. Real pieces, not art.
export const SHOWCASE = allCards
  .filter(card => card.photo !== '/assets/players/placeholder.png' && card.league === 'vct')
  .sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id))
  .slice(0, 5);

export const DEFAULT_MAP = '/assets/maps/ascent.webp';

export function stageLabel(match) {
  if (!match) return '';
  if (match.stage === 'Final') return t('Final');
  if (match.stage === 'Semifinal') return t('Semifinal');
  return t('Week {n}', { n: match.stage.replace(/\D/g, '') });
}

export function ordinalPos(pos) {
  return t('{pos} of 6', { pos });
}
