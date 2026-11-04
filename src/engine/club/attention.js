// What the hub should flag: things the club could act on this week, each with
// the screen that deals with it. Pure and read-only, so the hub can't disagree
// with the engine about what is worth a look.

import { TRAIN_SLOTS_MAX, packValue, squadMax } from './economy.js';

/** Up to `limit` items, most pressing first: { key, n, go }. `key` names the line, `n` fills it. */
export function attention(state, limit = 4) {
  const items = [];
  const live = state.phase === 'league' || state.phase === 'playoffs';
  if (state.opening) items.push({ key: 'open-pack', n: 1, go: 'vault' });
  if (state.chipOffer) items.push({ key: 'chip-offer', n: 1, go: 'chips' });
  const ending = state.squad.filter(id => state.contracts[id] === 1).length;
  if (ending > 0 && live) items.push({ key: 'contracts', n: ending, go: 'squad' });
  if (live && state.trainSlot > 0 && state.trainSlot <= TRAIN_SLOTS_MAX) items.push({ key: 'training', n: state.trainSlot, go: 'train' });
  const value = packValue(state);
  if (value > 0 && !state.opening) items.push({ key: 'packs', n: value, go: 'vault' });
  const room = squadMax(state) - state.squad.length;
  if (room > 0) items.push({ key: 'places', n: room, go: 'vault' });
  return items.slice(0, limit);
}
