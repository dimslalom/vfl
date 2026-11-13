import test from 'node:test';
import assert from 'node:assert/strict';
import { crestGeometry } from '../src/engine/club/crestGeometry.js';
import { crestConcepts, suggestMotifs } from '../src/engine/club/crestLab.js';

test('local suggestions detect motifs across languages and in unspaced names', () => {
  assert.deepEqual(suggestMotifs('Serigala Malam'), ['wolf']);
  for (const name of ['Sayap Es', 'Asas de Gelo', 'Alas Heladas', '冰翼']) {
    assert.deepEqual(new Set(suggestMotifs(name)), new Set(['ice', 'wing']));
  }
  assert.deepEqual(suggestMotifs('QNTM 07'), []);
});

test('Unicode names get reproducible, distinct batches and preserve graphemes', () => {
  const crests = crestConcepts('किरीट');
  assert.equal(crests[2].monogram, 'किरी');
  assert.equal(new Set(crests.map(crest => crest.seed)).size, 4);
  assert.deepEqual(crestConcepts('  Águia   Real  '), crestConcepts('Águia Real'));
  assert.notEqual(crestConcepts('𠀀')[0].seed, crestConcepts('𠀁')[0].seed);
  assert.notEqual(crestConcepts('North Wolves')[0].seed, crestConcepts('Night Wolves')[0].seed);
  assert.notEqual(crestConcepts('夜狼', 1)[0].seed, crestConcepts('夜狼')[0].seed);
});

test('manual motifs work for unfamiliar names and marks are offered even without letters', () => {
  const crests = crestConcepts('صقور الليل', 0, 'wing');
  assert.equal(crests[0].motif, 'wing');
  assert.equal(crests[2].monogram, 'صا');
  const symbols = crestConcepts('🧊');
  assert.equal(symbols.length, 4);
  assert.equal(symbols[2].layout, 'orbit');
});

test('unfamiliar names and rerolls change the rendered paths even with identical initials', () => {
  const designs = (name, batch = 0) => crestConcepts(name, batch).map(crestGeometry);
  const original = designs('Vyrn Qel');
  assert.deepEqual(original, designs('Vyrn Qel'));
  assert.equal(new Set(original.map(({ outline }) => outline)).size, 4);
  for (const variant of [designs('Vex Quoll'), designs('Vyrn Qel', 1)]) {
    original.forEach(({ outline }, index) => assert.notEqual(outline, variant[index].outline));
  }
});

test('shared motif names generate different silhouettes', () => {
  for (const motif of ['wolf', 'moon', 'ice', 'wing', 'flame', 'storm', 'wave', 'orbit']) {
    const first = crestGeometry(crestConcepts('Axton League', 0, motif)[0]);
    const second = crestGeometry(crestConcepts('Astrix Labs', 0, motif)[0]);
    assert.notEqual(first.outline, second.outline, motif);
  }
});
