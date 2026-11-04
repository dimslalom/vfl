import test from 'node:test';
import assert from 'node:assert/strict';
import { LOGO_STYLES, cleanName, defaultLogoStyle, emblemFor, initialsOf, logoOptions, logoSvg } from '../src/engine/club/logo.js';

test('initials come from word starts, or the opening letters of a single word', () => {
  assert.equal(initialsOf('Night Wolves'), 'NW');
  assert.equal(initialsOf('Team Liquid Academy'), 'TLA');
  assert.equal(initialsOf('Nova'), 'NOV');
  assert.equal(initialsOf('Vortex'), 'VO');
  assert.equal(initialsOf('Gauntlet'), 'GA');
  assert.equal(initialsOf('   '), 'C');
});

test('there are ten styles and each draws something for any name', () => {
  assert.equal(LOGO_STYLES.length, 10);
  for (const name of ['Night Wolves', 'X', '100 Thieves', 'ÄÖ ñ', '<script>', '']) {
    const options = logoOptions(name);
    assert.equal(options.length, 10);
    assert.equal(new Set(options.map(option => option.svg)).size, 10, `${name} gives ten different marks`);
    for (const option of options) assert.match(option.svg, /^<svg [^>]*viewBox="0 0 100 100"/);
  }
});

test('a logo is deterministic and follows the name', () => {
  assert.equal(logoSvg('Night Wolves', 'shield'), logoSvg('Night Wolves', 'shield'));
  assert.notEqual(logoSvg('Night Wolves', 'shield'), logoSvg('Iron Gauntlet', 'shield'));
  assert.equal(defaultLogoStyle('Night Wolves'), defaultLogoStyle('night  wolves'));
});

test('markup only ever carries cleaned letters, so a name cannot inject anything', () => {
  assert.equal(cleanName('<img src=x onerror=1> Club'), 'IMG SRC X ONERROR 1 CLUB');
  for (const option of logoOptions('"><script>alert(1)</script>')) {
    assert.ok(!/<script|onerror|javascript:/i.test(option.svg));
  }
});

test('a word in the name picks the emblem', () => {
  assert.equal(emblemFor('Night Wolves'), 'fang');
  assert.equal(emblemFor('Royal Phoenix'), 'flame');
  assert.equal(emblemFor('Thunder Five'), 'bolt');
  assert.ok(emblemFor('Zeta Division'));
});
