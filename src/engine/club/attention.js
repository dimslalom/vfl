// What the hub should flag: things the club could act on this week, each with
// the screen that deals with it. Pure and read-only, so the hub can't disagree
// with the engine about what is worth a look.

import { packValue, squadMax } from './economy.js';
import { tapeCount } from './tapes.js';

/** Up to `limit` items, most pressing first: { key, n, go }. `key` names the line, `n` fills it. */
export function attention(state, limit = 4) {
  const items = [];
  const live = state.phase === 'league' || state.phase === 'playoffs';
  if (state.opening) items.push({ key: 'open-pack', n: 1, go: 'vault' });
  if (state.chipOffer) items.push({ key: 'chip-offer', n: 1, go: 'chips' });
  const ending = state.squad.filter(id => state.contracts[id] === 1).length;
  if (ending > 0 && live) items.push({ key: 'contracts', n: ending, go: 'squad' });
  const tapes = tapeCount(state);
  if (live && tapes > 0) items.push({ key: 'training', n: tapes, go: 'train' });
  const value = packValue(state);
  if (value > 0 && !state.opening) items.push({ key: 'packs', n: value, go: 'vault' });
  const room = squadMax(state) - state.squad.length;
  if (room > 0) items.push({ key: 'places', n: room, go: 'vault' });
  return items.slice(0, limit);
}

// A pick that is open right now: a pack mid-pick or a chip offer. Packs, tapes and
// places can wait, and a last contract year can't be acted on until the window.
const PRESSING = new Set(['open-pack', 'chip-offer']);

/** The attention items that should be seen before the next match. */
export function pressing(state) {
  return attention(state, 99).filter(item => PRESSING.has(item.key));
}
