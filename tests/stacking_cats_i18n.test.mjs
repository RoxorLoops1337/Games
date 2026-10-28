// Stacking Cats: languages. The dictionary lookup (numbers, wildcards, sentences), Auto following the browser, and the Danish dictionary's rules.
import assert from 'node:assert/strict';
import { resolveLang, compile, useDict, tr, getLang } from '../stacking_cats/i18n.js';

let passed = 0;
const t = (name, fn) => { try { fn(); passed++; console.log('ok ' + name); } catch (e) { console.error('FAIL ' + name); throw e; } };

t('Auto follows the browser: Danish if any browser language is Danish, otherwise English; a chosen language always wins', () => {
  assert.equal(resolveLang('auto', ['da-DK', 'en']), 'da');
  assert.equal(resolveLang('auto', ['en-US', 'da']), 'en');
  assert.equal(resolveLang('auto', ['fr', 'de']), 'en');
  assert.equal(resolveLang('auto', []), 'en');
  assert.equal(resolveLang('en', ['da']), 'en');
  assert.equal(resolveLang('da', ['en']), 'da');
});

t('lookup: exact text, numbers, wildcards (matched text is translated too), sentences, spaces around the text', () => {
  useDict('da', {
    'Play': 'Spil', 'Wave #': 'Bolge {1}', 'Best on {}: #': 'Bedst paa {1}: {2}', 'Lucky Shell': 'Heldig Musling',
    'You win.': 'Du vinder.', 'Try again!': 'Proev igen!', 'Mice bite #% harder': 'Mus bider {1}% haardere',
    'The shrine gives {}': 'Helligdommen giver {1}',
  });
  assert.equal(getLang(), 'da');
  assert.equal(tr('Play'), 'Spil');
  assert.equal(tr('  Play '), '  Spil ');
  assert.equal(tr('Wave 12'), 'Bolge 12');
  assert.equal(tr('Best on Mochi: 21'), 'Bedst paa Mochi: 21');
  assert.equal(tr('The shrine gives Lucky Shell'), 'Helligdommen giver Heldig Musling', 'a name inside a wildcard is translated by its own entry');
  assert.equal(tr('You win. Try again!'), 'Du vinder. Proev igen!', 'a text is tried sentence by sentence');
  assert.equal(tr('Mice bite 8% harder'), 'Mus bider 8% haardere');
  assert.equal(tr('Something new'), 'Something new', 'an unknown text stays English');
  assert.equal(tr(''), '');
  useDict('en', {});
  assert.equal(tr('Play'), 'Play', 'English never changes anything');
});

t('patterns: the most specific one wins and a number pattern is tried before a wildcard', () => {
  const { wl } = compile({ '{}': 'any', 'Wave #': 'w', 'Wave # of #': 'w2', 'Wave {} is here': 'x' });
  assert.ok(wl.findIndex((p) => p.v === 'w') < wl.findIndex((p) => p.v === 'any'));
  assert.ok(wl.findIndex((p) => p.v === 'w2') < wl.findIndex((p) => p.v === 'w'));
});

// ---- the Danish dictionary
const { default: DA } = await import('../stacking_cats/lang/da.js');
t('Danish dictionary: no dashes used as punctuation, valid {n} references, keys are real text', () => {
  const keys = Object.keys(DA);
  assert.ok(keys.length >= 0);
  for (const k of keys) {
    const v = DA[k];
    assert.equal(typeof v, 'string', 'value of ' + k);
    assert.ok(k.trim().length > 0, 'empty key');
    assert.ok(!/[—–]/.test(v), 'no em or en dash: ' + v);
    const caps = (k.match(/\{\}|#/g) || []).length;
    for (const m of v.matchAll(/\{(\d+)\}/g)) assert.ok(+m[1] >= 1 && +m[1] <= caps, `"${k}" -> "${v}": {${m[1]}} has no match in the key`);
    if (k.includes('{}') || k.includes('#')) assert.doesNotThrow(() => compile({ [k]: v }), k);
  }
});
console.log(`${passed} i18n tests passed`);
