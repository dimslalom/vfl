import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CREST_SHAPES, CREST_STYLES, assembleCrest, decodeCrest, encodeCrest, foldText, pickCrest, savedRecipe, upgradeCrest } from '../src/engine/club/crestKit.js';
import { setClubCrest } from '../src/engine/club/rewards.js';

const parts = new URL('../public/crest-parts/', import.meta.url);
const lexicon = JSON.parse(readFileSync(new URL('lexicon.json', parts), 'utf8'));
const pathsFor = recipe => Object.fromEntries(recipe.marks.map(id => [id, readFileSync(new URL(`icons/${id}.txt`, parts), 'utf8')]));

test('the same name always gives the same crest, and rerolls give others', () => {
  assert.deepEqual(pickCrest('Serigala Malam', lexicon), pickCrest('Serigala Malam', lexicon));
  assert.deepEqual(pickCrest('Night Wolves', lexicon), pickCrest('night   WOLVES', lexicon));
  const rolls = new Set([0, 1, 2, 3, 4].map(reroll => JSON.stringify(pickCrest('Serigala Malam', lexicon, { reroll }))));
  assert.ok(rolls.size >= 4);
});

test('names in other languages find their motifs', () => {
  const marks = name => pickCrest(name, lexicon).marks;
  for (const name of ['Serigala Malam', '夜狼', 'Night Wolves']) {
    const [lead, back] = marks(name);
    assert.match(lead, /wolf/, name);
    assert.match(back, /night|moon/, name);
  }
  for (const name of ['Sayap Es', 'Asas de Gelo', 'Alas Heladas']) {
    const [lead, back] = marks(name);
    assert.match(lead, /wing/, name);
    assert.match(back, /snow|frozen|ice/, name);
  }
  const [falcon, night] = marks('صقور الليل');
  assert.match(falcon, /hawk|falcon|eagle/);
  assert.match(night, /night|moon/);
  assert.equal(foldText('Águila'), 'aguila');
});

test('an invented name still gets a full recipe from the curated list', () => {
  for (const name of ['Vyrn Qel', 'QNTM 07', '', '!!!']) {
    const recipe = pickCrest(name, lexicon);
    assert.equal(recipe.marks.length, 1, name);
    assert.ok(lexicon.fallback.map(index => lexicon.ids[index]).includes(recipe.marks[0]), name);
    assert.ok(recipe.shell && Number.isInteger(recipe.tone) && Number.isInteger(recipe.seed));
  }
  assert.equal(pickCrest('Vyrn Qel', lexicon).monogram, 'VQ');
});

test('assembled crests are well-formed SVG with escaped letters only', () => {
  assert.equal(CREST_STYLES.length, 6);
  for (const name of ['Serigala Malam', 'Vyrn Qel', '<b>&"\' x', '夜狼']) {
    for (const [style, small] of CREST_STYLES.flatMap(style => [[style, false], [style, true]])) {
      for (const [shape, frame] of [[undefined, 'filled'], ['none', 'filled'], ['circle', 'outline']]) {
        const recipe = pickCrest(name, lexicon, { style, shape, frame });
        assert.equal(recipe.style, style);
        const svg = assembleCrest(recipe, pathsFor(recipe), { small });
        assert.match(svg, /^<svg [^>]*viewBox="0 0 512 512"[^>]*>.*<\/svg>$/s);
        assert.ok(svg.includes('<path d="M'));
        const tags = [...svg.matchAll(/<(\/?)([a-zA-Z]+)[^>]*?(\/?)>/g)];
        const stack = [];
        for (const [, closing, tag, selfClosing] of tags) {
          if (selfClosing) continue;
          if (closing) assert.equal(stack.pop(), tag);
          else stack.push(tag);
        }
        assert.deepEqual(stack, []);
      }
    }
  }
  for (const style of [...CREST_STYLES, 'nope']) {
    const hostile = { marks: ['x', 'y'], shell: 'shield', tone: 0, style, monogram: '<&"' };
    const svg = assembleCrest(hostile, { x: 'M0 0"/><script>alert(1)</script>', y: 'M0 0h9v9z' });
    assert.ok(!svg.includes('<script'), style);
    assert.ok(svg.includes('&lt;&amp;&quot;'), style);
  }
  assert.equal(pickCrest('Vyrn Qel', lexicon, { style: 'nope' }).style, 'esports');
});

test('shape and fill are the player\'s choice, and the name picks a shape otherwise', () => {
  assert.ok(CREST_SHAPES.includes('none') && CREST_SHAPES.includes('circle') && CREST_SHAPES.includes('square'));
  const own = pickCrest('Serigala Malam', lexicon);
  assert.equal(own.frame, 'filled');
  assert.ok(CREST_SHAPES.includes(own.shell) && own.shell !== 'none');
  for (const shape of CREST_SHAPES) assert.equal(pickCrest('Serigala Malam', lexicon, { shape }).shell, shape);
  assert.equal(pickCrest('Serigala Malam', lexicon, { shape: 'blob', frame: 'dots' }).shell, own.shell);
  assert.equal(pickCrest('Serigala Malam', lexicon, { frame: 'outline' }).frame, 'outline');
  const recipe = pickCrest('Serigala Malam', lexicon, { shape: 'none' });
  const svg = assembleCrest(recipe, pathsFor(recipe));
  assert.ok(!svg.includes('clipPath'), 'no shape means nothing to clip to');
});

test('a crest saves as one short code and draws the same from it', () => {
  const recipe = pickCrest('Serigala Malam', lexicon, { style: 'riso', shape: 'circle', frame: 'outline' });
  const code = encodeCrest(recipe);
  assert.ok(code.length <= 160);
  assert.deepEqual(decodeCrest(code), { style: 'riso', shell: 'circle', frame: 'outline', marks: recipe.marks });
  const saved = savedRecipe(code, 'SERIGALA MALAM', recipe.tone);
  assert.equal(assembleCrest(saved, pathsFor(saved)), assembleCrest({ ...recipe, monogram: '' }, pathsFor(recipe)));
  assert.equal(savedRecipe(encodeCrest(pickCrest('Vyrn Qel', lexicon)), 'VYRN QEL', 2).monogram, 'VQ');
  assert.equal(savedRecipe(code, 'X', '3').tone, 3);
  assert.equal(savedRecipe(code, 'X', 'gold').tone, 2);
  for (const bad of ['shield', null, 42, 'k1~esports~hex~f', 'k1~esports~hex~f~../../etc/passwd', 'k1~esports~hex~f~lorc/wolf-head"><script>',
    'k1~nope~hex~f~lorc/wolf-head', 'k1~esports~blob~f~lorc/wolf-head', 'k1~esports~hex~f~a/b~c/d~e/f', `k1~esports~hex~f~lorc/${'a'.repeat(200)}`]) {
    assert.equal(decodeCrest(bad), null, String(bad));
  }
});

test('clubs on an old letter crest move to the new system and keep their colour', () => {
  const old = { name: 'NIGHT WOLVES', crest: 'shield', tone: 5, phase: 'league' };
  const moved = upgradeCrest(old, lexicon);
  assert.notEqual(moved, old);
  assert.equal(moved.tone, 5);
  assert.match(decodeCrest(moved.crest).marks[0], /wolf/);
  assert.equal(upgradeCrest(moved, lexicon), moved, 'a club already moved is left alone');
  const noTone = upgradeCrest({ name: 'VYRN QEL', crest: undefined }, lexicon);
  assert.ok(decodeCrest(noTone.crest) && Number.isInteger(noTone.tone));
  assert.equal(upgradeCrest(null, lexicon), null);
  assert.equal(setClubCrest({ phase: 'league', crest: 'shield', tone: 0 }, moved.crest, 3).crest, moved.crest);
  assert.equal(setClubCrest({ phase: 'league', crest: 'shield', tone: 0 }, 'k1~esports~hex~f~../x', 3).crest, 'shield');
});
