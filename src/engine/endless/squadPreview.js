import { ROSTER_SIZE, teamPower } from '../../../shared/src/engine/perfectRun.js';
import {
  SOFT_WEIGHT, effectiveRoster, softResidual,
} from '../../../shared/src/engine/endless/career.js';
import { bondChemistry } from './bonds.js';

// The one path from a dock order to team power. PerfectRun renders through it
// and every preview does too, so a preview cannot disagree with the result.
export function squadPower({ picks, dev = {}, bonds = {}, endless = true }) {
  const starters = picks.slice(0, ROSTER_SIZE);
  if (starters.length < ROSTER_SIZE) return null;
  const squad = endless ? effectiveRoster(starters, dev) : starters;
  const opts = endless
    ? { extra: bondChemistry(bonds, squad), soft: softResidual(squad) * SOFT_WEIGHT }
    : {};
  return teamPower(squad, starters[0].id, opts);
}

/**
 * What one roster change does, applied the way the game applies it: a named
 * `outId` is replaced in place, `incoming` alone takes the next open slot, and
 * `outId` alone removes the card and closes the gap. `incomingDev` carries a
 * prospect's reset career, which only lands if they are actually signed.
 */
export function applySquadChange(picks, { incoming = null, outId = null }) {
  if (outId == null) return incoming ? [...picks, incoming] : picks;
  if (!incoming) return picks.filter(card => card.id !== outId);
  return picks.map(card => (card.id === outId ? incoming : card));
}

export function previewSquadChange({ picks, dev = {}, bonds = {}, endless = true }, change) {
  const before = squadPower({ picks, dev, bonds, endless });
  const nextPicks = applySquadChange(picks, change);
  const nextDev = change.incoming && change.incomingDev
    ? { ...dev, [change.incoming.id]: change.incomingDev }
    : dev;
  const after = squadPower({ picks: nextPicks, dev: nextDev, bonds, endless });
  return {
    before,
    after,
    power: before && after ? after.power - before.power : null,
    chem: before && after ? after.chem - before.chem : null,
    // True when the five who actually play are untouched: a bench signing.
    benchOnly: Boolean(before && after)
      && nextPicks.slice(0, ROSTER_SIZE).every((card, index) => card.id === picks[index]?.id),
  };
}
