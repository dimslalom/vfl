import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUserEntry, getClientId, fetchGlobalClubs } from '../src/lib/globalLeaderboard.js';
import cards from '../shared/src/data/cards.json' with { type: 'json' };
import { newClub, draftPack, STARTERS } from '../src/engine/club/season.js';

function createTestClub(name = 'Test Club') {
  const picks = [];
  for (let index = 0; index < STARTERS; index += 1) {
    picks.push(draftPack(7, index, picks, cards)[0].id);
  }
  return newClub({ seed: 7, name, picks, cards });
}

test('getClientId returns a consistent UUID', () => {
  const id1 = getClientId();
  const id2 = getClientId();
  assert.equal(id1, id2);
  assert.match(id1, /^[0-9a-f-]{36}$/i);
});

test('buildUserEntry builds correct stats for club', () => {
  const sampleState = createTestClub('Test Club');
  sampleState.crest = 'shield';
  sampleState.tone = 'gold';
  sampleState.results = [{ won: true }, { won: false }];

  const entry = buildUserEntry(sampleState, cards);
  assert.equal(entry.name, 'Test Club');
  assert.equal(entry.style, 'shield');
  assert.equal(entry.tone, 'gold');
  assert.equal(entry.w, 1);
  assert.equal(entry.l, 1);
  assert.equal(entry.you, true);
  assert.equal(entry.cards.length, 5);
});

test('fetchGlobalClubs uses server rows without fake seeded circuits', async () => {
  const sampleState = createTestClub('My Club');
  sampleState.crest = 'laurel';
  sampleState.tone = 'sunset';
  sampleState.results = [{ won: true }];

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/leaderboard/global')) {
        return {
          ok: true,
          json: async () => ({
            rows: [
              {
                id: 'player-1',
                name: 'Alpha Club',
                style: 'hex',
                tone: 'crimson',
                score: 3000,
                power: 84,
                w: 10,
                l: 1,
                starCardId: cards[0].id,
                cardIds: cards.slice(0, 5).map(c => c.id),
                isYou: false,
              },
            ],
            userRow: null,
          }),
        };
      }
      return { ok: true, json: async () => ({ ok: true }) };
    };

    const clubs = await fetchGlobalClubs(sampleState, cards);
    assert.equal(clubs.length, 2);
    assert.equal(clubs[0].name, 'Alpha Club');
    assert.equal(clubs[0].pos, 1);
    assert.equal(clubs[1].name, 'My Club');
    assert.equal(clubs[1].pos, 2);
    assert.equal(clubs[1].you, true);
    assert.equal(clubs.some(c => c.name === 'Fnatic'), false, 'no fake seeded clubs');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
