import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { PACK_TYPES, PACK_TYPE_LIST } from '../src/pack3d/packTypes.js';
import { pickCover } from '../src/pack3d/packCover.js';
import allCards from '../shared/src/data/cards.json' with { type: 'json' };

const HEX = /^#[0-9a-f]{6}$/i;

test('every pack type has what the art and foil need', () => {
  for (const type of PACK_TYPE_LIST) {
    assert.equal(PACK_TYPES[type.id], type);
    for (const key of ['title', 'subtitle', 'rule', 'code', 'contains']) assert.ok(type[key], `${type.id} needs ${key}`);
    assert.ok(['poster', 'fullbleed'].includes(type.front));
    assert.match(type.code, /^[A-Z]{3}$/);
    for (const key of ['base', 'deep', 'ink', 'accent', 'seal', 'cover']) assert.match(type.palette[key], HEX, `${type.id} palette ${key}`);
    for (const key of ['roughness', 'clearcoat', 'iridescence']) assert.ok(type.foil[key] >= 0 && type.foil[key] <= 1);
    for (const key of ['holo', 'glitter']) assert.ok(type.effects[key] >= 0 && type.effects[key] <= 1);
  }
});

test('the three launch packs exist and only icons get the full effects', () => {
  assert.deepEqual(PACK_TYPE_LIST.map(type => type.id), ['silver', 'gold', 'icons']);
  assert.equal(PACK_TYPES.icons.effects.holo, 1);
  assert.equal(PACK_TYPES.silver.effects.holo, 0);
  assert.equal(new Set(PACK_TYPE_LIST.map(type => type.code)).size, PACK_TYPE_LIST.length);
});

test('the shared model is built and stays small', () => {
  const model = new URL('../public/assets/pack3d/pack.glb', import.meta.url);
  assert.ok(existsSync(model));
  assert.ok(statSync(model).size < 200 * 1024);
});

test('a cover only features players the pack can hold, and a seed always gives the same cover', () => {
  const byId = new Map(allCards.map(card => [card.id, card]));
  for (let seed = 1; seed < 60; seed += 1) {
    const gold = pickCover(PACK_TYPES.gold, seed, allCards);
    assert.equal(gold.squad.length, 5);
    assert.equal(new Set(gold.squad.map(member => member.id)).size, 5);
    assert.ok(gold.squad.every(member => byId.get(member.id).palette === 'gold'));
    const icon = pickCover(PACK_TYPES.icons, seed, allCards);
    assert.ok(icon.squad.every(member => byId.get(member.id).league === 'icon' || byId.get(member.id).palette === 'icon'));
    assert.ok(pickCover(PACK_TYPES.silver, seed, allCards).squad.every(member => !member.photo.includes('placeholder')));
  }
  assert.deepEqual(pickCover(PACK_TYPES.silver, 42, allCards), pickCover(PACK_TYPES.silver, 42, allCards));
});

test('covers vary from pack to pack', () => {
  const covers = Array.from({ length: 30 }, (_, seed) => pickCover(PACK_TYPES.silver, seed + 1, allCards));
  assert.ok(new Set(covers.map(cover => `${cover.squad.map(member => member.id).join()}:${cover.map}`)).size >= 29);
});

test('every cover carries reserves that are not already in the squad', () => {
  for (let seed = 1; seed < 40; seed += 1) {
    const cover = pickCover(PACK_TYPES.silver, seed, allCards);
    assert.equal(cover.reserves.length, 3);
    const ids = [...cover.squad, ...cover.reserves].map(member => member.id);
    assert.equal(new Set(ids).size, ids.length);
  }
});
