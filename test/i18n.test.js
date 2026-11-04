import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { LANGS, dictionary, getLang, t } from '../src/lib/i18n.js';
import { specialtyTexts } from './helpers/i18nExtras.js';

function sources(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'i18n' ? [] : sources(path);
    return /\.jsx?$/.test(name) ? [path] : [];
  });
}

function literal(text) {
  return text.replace(/\\(['"`\\])/g, '$1');
}

// Strings passed straight to t(), plus the dynamic ones: engine labels, table
// keys and server messages that reach t() through a variable.
function keys() {
  const found = new Set(specialtyTexts());
  for (const path of [...sources('src'), 'test/helpers/i18nExtras.js']) {
    const code = readFileSync(path, 'utf8');
    for (const match of code.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) found.add(literal(match[1]));
    for (const match of code.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) found.add(literal(match[1]));
    for (const match of code.matchAll(/new GameError\('[^']+', '((?:[^'\\]|\\.)*)'\)/g)) found.add(literal(match[1]));
  }
  return [...found];
}

test('every player-facing string has a translation in each shipped language', () => {
  const all = keys();
  assert.ok(all.length > 300, `only found ${all.length} strings`);
  for (const { key } of LANGS.filter(lang => lang.key !== 'en')) {
    const missing = all.filter(source => !dictionary(key)[source]);
    assert.deepEqual(missing, [], `${key} is missing ${missing.length} strings`);
  }
});

test('translations keep every placeholder of their source string', () => {
  const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const { key } of LANGS.filter(lang => lang.key !== 'en')) {
    for (const [source, target] of Object.entries(dictionary(key))) {
      assert.deepEqual(placeholders(target), placeholders(source), `${key}: ${source}`);
    }
  }
});

test('no translation is left over from a string that no longer exists', () => {
  const all = new Set(keys());
  for (const { key } of LANGS.filter(lang => lang.key !== 'en')) {
    const stale = Object.keys(dictionary(key)).filter(source => !all.has(source));
    assert.deepEqual(stale, [], `${key} has stale strings`);
  }
});

test('English is the fallback and placeholders fill in', () => {
  assert.equal(getLang(), 'en');
  assert.equal(t('Year {n}', { n: 3 }), 'Year 3');
  assert.equal(t('A string nobody translated'), 'A string nobody translated');
});
