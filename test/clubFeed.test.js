import test from 'node:test';
import assert from 'node:assert/strict';
import { attention } from '../src/engine/club/attention.js';
import { withSignings } from '../src/engine/club/economy.js';

const base = () => ({ phase: 'league', tier: 0, titles: 0, history: [], squad: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], contracts: { a: 3, b: 3, c: 3, d: 3, e: 3, f: 3, g: 3 }, trainSlot: 0, packs: 0, opening: null, chipOffer: null });

test('a quiet club has nothing flagged', () => {
  assert.deepEqual(attention({ ...base(), squad: ['a', 'b', 'c', 'd', 'e'], contracts: { a: 3, b: 3, c: 3, d: 3, e: 3 }, tier: 0 }).filter(item => item.key !== 'places'), []);
});

test('pending picks come first, then contracts, training and spare places', () => {
  const state = { ...base(), opening: { ids: [] }, contracts: { ...base().contracts, a: 1, b: 1 }, trainSlot: 1, squad: ['a', 'b', 'c', 'd', 'e'] };
  const keys = attention(state, 10).map(item => item.key);
  assert.deepEqual(keys.slice(0, 3), ['open-pack', 'contracts', 'training']);
  assert.equal(attention(state, 10).find(item => item.key === 'contracts').n, 2);
  assert.equal(attention(state, 2).length, 2);
});

test('contracts and training are only flagged while the season is live', () => {
  const state = { ...base(), phase: 'review', contracts: { ...base().contracts, a: 1 }, trainSlot: 1 };
  assert.equal(attention(state, 10).some(item => item.key === 'contracts' || item.key === 'training'), false);
});

test('the signing log is newest first and keeps the last eight', () => {
  let state = { year: 2, signings: [] };
  for (let i = 0; i < 10; i++) state = { ...state, signings: withSignings(state, [`p${i}`], 'pack') };
  assert.equal(state.signings.length, 8);
  assert.equal(state.signings[0].id, 'p9');
  assert.deepEqual(withSignings({ year: 3 }, ['x'], 'window'), [{ id: 'x', year: 3, via: 'window' }]);
});

test('picking a player from an opened pack lands in the signing log', async () => {
  const { choosePick } = await import('../src/engine/club/rewards.js');
  const state = { ...base(), year: 3, squad: ['a', 'b', 'c', 'd', 'e'], moved: {}, opening: { ids: ['z'], kind: 'silver' }, signings: [] };
  const next = choosePick(state, 'z');
  assert.deepEqual(next.signings, [{ id: 'z', year: 3, via: 'pack' }]);
  assert.equal(next.squad.at(-1), 'z');
  assert.deepEqual(choosePick({ ...state, squad: [...state.squad, 'f', 'g'] }, 'z').signings, []);
});
