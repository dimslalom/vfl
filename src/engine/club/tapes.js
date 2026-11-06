import { STAT_KEYS } from '../../../shared/src/data/statFields.js';

export const TRAINING_SKILLS = ['flex', 'flick', 'one_trick', 'mastermind', 'aura'];

export function tapeCount(state) {
  return (state.tapes ?? 0) + Object.values(state.trainingTapes ?? {}).reduce((sum, count) => sum + count, 0);
}

export function rollTapes(rng, won) {
  const roll = rng();
  const count = won ? (roll < 0.2 ? 1 : roll < 0.8 ? 2 : 3) : (roll < 0.8 ? 1 : 2);
  return Array.from({ length: count }, () => {
    const pool = rng() < 0.8 ? STAT_KEYS : TRAINING_SKILLS;
    return pool[Math.floor(rng() * pool.length)];
  });
}

export function rollFlawlessTape(rng) {
  const pool = rng() < 0.6 ? TRAINING_SKILLS : STAT_KEYS;
  return pool[Math.floor(rng() * pool.length)];
}

export function bankTapes(inventory, keys) {
  const next = { ...inventory };
  for (const key of keys) next[key] = (next[key] ?? 0) + 1;
  return next;
}
