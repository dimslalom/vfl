import test from 'node:test';
import assert from 'node:assert/strict';
import { attention } from '../src/engine/club/attention.js';
import { withNews } from '../src/engine/club/economy.js';

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

test('the news log is newest first, stamped with the year, and keeps the last eight', () => {
  let state = { year: 2, news: [] };
  for (let i = 0; i < 10; i++) state = { ...state, news: withNews(state, [{ id: `p${i}`, club: 'c', kind: 'in' }]) };
  assert.equal(state.news.length, 8);
  assert.equal(state.news[0].id, 'p9');
  assert.deepEqual(withNews({ year: 3 }, [{ id: 'x', club: 'c', kind: 'out' }]), [{ id: 'x', club: 'c', kind: 'out', year: 3 }]);
});
