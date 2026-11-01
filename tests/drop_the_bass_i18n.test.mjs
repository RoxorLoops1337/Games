// Drop the Bass i18n: the t/tn API and language state, the extraction tool (on a fixture), the translation files, stroke font coverage.
// DTB_I18N_STRICT=1 also demands that every js/lang/<code>.js exists with every key of en.js, and that en.js is current.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), DIR = path.join(ROOT, 'drop_the_bass'), JS = path.join(DIR, 'js');
const STRICT = process.env.DTB_I18N_STRICT === '1';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const EM = '\u2014';

const I = await import('../drop_the_bass/js/i18n.js');
const T = await import('../tools/dtb_i18n.mjs');
const K = await import('../drop_the_bass/js/doodle_kit.js');

// ------------------------------------------------------------------------------------------------ API
{
  ok(I.LANGS.map((l) => l.code).join() === 'en,da,nl,de', 'four languages');
  ok(I.LANGS.map((l) => l.name).join() === 'English,Dansk,Nederlands,Deutsch', 'native names');
  eq(I.getLang(), 'en'); eq(I.getLangPref(), 'auto');
  eq(I.t('x.a', 'Hello'), 'Hello', 'english default');
  eq(I.t('x.b', 'Wave {n} of {total}', { n: 3, total: 20 }), 'Wave 3 of 20', 'interpolation');
  eq(I.t('x.c', 'Hi {who}', {}), 'Hi {who}', 'unknown placeholder stays');
  eq(I.t('x.d', 'Hi {who}'), 'Hi {who}', 'no vars');
  eq(I.tn('x.e', 1, '{n} turret', '{n} turrets'), '1 turret'); eq(I.tn('x.e', 0, '{n} turret', '{n} turrets'), '0 turrets'); eq(I.tn('x.e', 5, '{n} turret', '{n} turrets'), '5 turrets');
  eq(I.tn('x.f', 2, '{n} of {m}', '{n} of {m} total', { m: 9 }), '2 of 9 total', 'plural with extra vars');
  I.registerDict('da', { 'test.hello': 'Hej', 'test.turrets': '{n} taarn|{n} taarne', 'test.hi': 'Hej {name}' });
  I.registerDict('nl', { 'test.hello': 'Hallo' });
  I.registerData('de', { 'DATA.x.name': 'Name' });
  eq(I.getData('de')['DATA.x.name'], 'Name', 'data dictionary');
  const seen = []; const off = I.onLang((c) => seen.push(c));
  I.setLang('da'); await I.langReady();
  eq(I.getLang(), 'da'); eq(seen, ['da'], 'listener notified once after load');
  eq(I.t('test.hello', 'Hello'), 'Hej'); eq(I.t('test.missing', 'Fallback'), 'Fallback', 'missing key falls back to English');
  eq(I.t('test.hi', 'Hi {name}', { name: 'Jas' }), 'Hej Jas');
  eq(I.tn('test.turrets', 1, '{n} turret', '{n} turrets'), '1 taarn'); eq(I.tn('test.turrets', 3, '{n} turret', '{n} turrets'), '3 taarne');
  eq(I.tn('test.nope', 3, '{n} turret', '{n} turrets'), '3 turrets', 'plural fallback');
  I.setLang('da'); eq(seen.length, 1, 'same language does not notify');
  I.setLang('xx'); eq(I.getLang(), 'en', 'unknown code becomes English'); eq(seen.length, 2);
  eq(I.t('test.hello', 'Hello'), 'Hello', 'english ignores dictionaries');
  off(); I.setLang('nl'); await I.langReady(); eq(seen.length, 2, 'unsubscribed');
  eq(I.t('test.hello', 'Hello'), 'Hallo');
  I.setLang('en');
  // detectLang
  eq(I.detectLang('da-DK'), 'da'); eq(I.detectLang('nl_BE'), 'nl'); eq(I.detectLang('DE'), 'de'); eq(I.detectLang('fr-FR'), 'en'); eq(I.detectLang(''), 'en'); eq(I.detectLang(undefined), 'en');
  eq(I.detectLang('nb-NO'), 'da', 'Norwegian reads Danish'); eq(I.detectLang(['fr', 'de-AT', 'en']), 'de', 'first supported language in the list'); eq(I.detectLang(['fr', 'ja']), 'en');
  eq(I.resolveLang('auto', 'nl-NL'), 'nl'); eq(I.resolveLang('de', 'nl-NL'), 'de');
  // init, preference, storage key, document.lang
  const mem = () => { const o = {}; return { getItem: (k) => (k in o ? o[k] : null), setItem: (k, v) => { o[k] = String(v); }, removeItem: (k) => { delete o[k]; }, o }; };
  globalThis.document = { documentElement: { lang: 'en' } };
  eq(I.LANG_KEY, 'drop_the_bass_lang');
  let st = mem();
  eq(await I.initLang({ profile: 'auto', storage: st, nav: 'da-DK' }), 'da', 'auto follows the browser'); eq(I.getLangPref(), 'auto'); eq(document.documentElement.lang, 'da'); ok(!('drop_the_bass_lang' in st.o), 'auto stores nothing');
  st = mem(); st.setItem('drop_the_bass_lang', 'nl');
  eq(await I.initLang({ profile: 'auto', storage: st }), 'nl', 'device choice before the profile'); eq(I.getLangPref(), 'nl');
  eq(await I.initLang({ profile: 'de', storage: st }), 'de', 'profile choice wins'); eq(st.o.drop_the_bass_lang, 'de', 'key follows the profile');
  eq(await I.initLang({ profile: 'junk', storage: mem(), nav: 'xx' }), 'en', 'junk pref is auto, unknown browser is English');
  st = mem();
  eq(await I.setLangPref('nl', { storage: st }), 'nl'); eq(st.o.drop_the_bass_lang, 'nl'); eq(document.documentElement.lang, 'nl');
  await I.setLangPref('auto', { storage: st }); ok(!('drop_the_bass_lang' in st.o), 'auto removes the key'); eq(I.getLangPref(), 'auto');
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
  eq(await I.initLang({ profile: 'da', storage: broken }), 'da', 'storage that throws is tolerated');
  await I.initLang({ profile: 'en', storage: mem() }); I.setLang('en'); delete globalThis.document;
  // meta default
  const M = await import('../drop_the_bass/js/meta.js');
  const prof = M.newProfile(1000); eq(prof.settings.lang, 'auto', 'settings.lang default');
  prof.settings.lang = 'zz'; M.repairProfile(prof, 1000); eq(prof.settings.lang, 'auto', 'repair resets junk');
  prof.settings.lang = 'nl'; M.repairProfile(prof, 1000); eq(prof.settings.lang, 'nl', 'repair keeps a valid choice');
}

// ------------------------------------------------------------------------------------------------ extraction tool on a fixture
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dtbi18n-'));
{
  const r = T.extract(`
    import { t, tn } from './i18n.js';
    // t('comment.key', 'in a comment')
    /* t('block.key', 'in a block comment') */
    const a = t('hub.play', 'Play');
    const b = t("hub.quote", "It's \\"quoted\\" and 'single'");
    const c = t('hub.tpl', \`Template {n}\`, { n: 1 });
    const d = tn('hub.cats', n + 1, '{n} cat', '{n} cats');
    const e = t('hub.multi',
      'Line one ' +
      'and two',
      { x: 1 },
    );
    const s = "a string with t('fake.key', 'inside') in it";
    const re = /['"]t\\('re.key'/g; const half = 6 / 2; const q = half / 3;
    obj.t('obj.key', 'method call');
    function t(k, en) { return en; }
    const f = t('hub.esc', 'back\\\\slash \\u00e4 \\x41\\n');
    const g = t(keyVar, 'dyn key'); const h = t('hub.dyn', 'a ' + x); const i2 = t(\`hub.tplx_\${x}\`, 'y');
    const j = tn('hub.nested', fn(a, b), 'one {n}', 'many {n}', { z: [1, 2] });
  `, 'fx.js');
  eq(r.entries.map((e) => e.key + '=' + e.en), ['hub.play=Play', 'hub.quote=It\'s "quoted" and \'single\'', 'hub.tpl=Template {n}', 'hub.cats={n} cat|{n} cats', 'hub.multi=Line one and two', 'hub.esc=back\\slash ä A\n', 'hub.nested=one {n}|many {n}'], 'extracted entries');
  eq(r.entries.find((e) => e.key === 'hub.cats').kind, 'tn');
  eq(r.dynamic.length, 3, 'dynamic calls listed: ' + JSON.stringify(r.dynamic.map((d) => d.why)));
  eq(T.placeholders('a {n} b {x} {n}'), ['n', 'x']); eq(T.barCount('a|b'), 1);
  ok(T.KEY_RE.test('hub.play') && T.KEY_RE.test('run.tip.lane_2') && !T.KEY_RE.test('Hub.Play') && !T.KEY_RE.test('play') && !T.KEY_RE.test('hub..x') && !T.KEY_RE.test('hub.pl-ay'), 'key rule');

  // a fixture project: scan + problems
  const fx = path.join(tmp, 'game'); fs.mkdirSync(path.join(fx, 'js', 'lang'), { recursive: true });
  fs.writeFileSync(path.join(fx, 'js', 'a.js'), `t('menu.start', 'Start the game'); t('menu.start', 'Start the game'); t('menu.dup', 'One'); t('Bad Key', 'x'); t('menu.dash', 'A ${EM} B');
    tn('menu.items', n, '{n} item', '{n} items'); tn('menu.badpl', n, '{n} a {who}', '{n} b'); t('menu.name', 'Hi {name}, {n} left');`);
  fs.writeFileSync(path.join(fx, 'js', 'b.js'), `t('menu.dup', 'Two'); t('menu.tail', 'A long English sentence here');`);
  fs.writeFileSync(path.join(fx, 'js', 'i18n.js'), `t('skip.me', 'i18n files are skipped');`);
  fs.writeFileSync(path.join(fx, 'js', 'lang', 'zz.js'), `t('skip.lang', 'lang folder is skipped');`);
  const s = T.scan(path.join(fx, 'js'));
  const errs = s.problems.filter((p) => p.level === 'error').map((p) => p.msg);
  ok(errs.some((m) => /malformed key "Bad Key"/.test(m)), 'malformed key reported');
  ok(errs.some((m) => /em dash in "menu.dash"/.test(m)), 'em dash reported');
  ok(errs.some((m) => /duplicate key "menu.dup"/.test(m)), 'conflicting duplicate reported');
  ok(!errs.some((m) => /menu.start/.test(m)), 'identical duplicate is fine');
  ok(errs.some((m) => /placeholder mismatch.*menu.badpl/.test(m)), 'plural placeholder mismatch');
  ok(!('skip.me' in s.en) && !('skip.lang' in s.en), 'i18n files and lang folder skipped');
  ok(Object.keys(s.en).join() === Object.keys(s.en).slice().sort().join(), 'keys sorted');
  const run = (...a) => spawnSync(process.execPath, [path.join(ROOT, 'tools', 'dtb_i18n.mjs'), '--root', fx, '--quiet', ...a], { encoding: 'utf8' });
  ok(run().status === 1, 'extract exits 1 on errors');
  // clean up the fixture problems, then generate, stub, check
  fs.writeFileSync(path.join(fx, 'js', 'a.js'), `t('menu.start', 'Start the game'); tn('menu.items', n, '{n} item', '{n} items'); t('menu.name', 'Hi {name}, {n} left'); t('menu.tail', 'A long English sentence here');`);
  fs.unlinkSync(path.join(fx, 'js', 'b.js'));
  eq(run().status, 0, 'clean fixture extracts');
  const en = await T.loadDict(path.join(fx, 'js', 'lang', 'en.js'));
  eq(en, { 'menu.items': '{n} item|{n} items', 'menu.name': 'Hi {name}, {n} left', 'menu.start': 'Start the game', 'menu.tail': 'A long English sentence here' }, 'en.js content');
  ok(run('--check').status === 1, 'check fails when the translations are missing');
  eq(run('--stub').status, 0);
  for (const c of ['da', 'nl', 'de']) eq(await T.loadDict(path.join(fx, 'js', 'lang', c + '.js')), en, c + ' stubbed with English');
  ok(run('--check').status === 0, 'stubbed fixture passes the check');
  ok(run('--check', '--strict').status === 1, 'strict fails on untranslated English');
  fs.writeFileSync(path.join(fx, 'js', 'lang', 'da.js'), `export default { 'menu.items': '{n} ting|{n} ting', 'menu.name': 'Hej {name}, {n} tilbage', 'menu.start': 'Start spillet', 'menu.tail': 'En lang dansk saetning her', 'menu.old': 'x' };\n`);
  ok(run('--check').status === 0, 'translated da passes (extra key is only a warning)');
  fs.writeFileSync(path.join(fx, 'js', 'nl.js'), 'x'); // wrong place, ignored
  let c = T.checkDict(en, s.kinds, { 'menu.items': '{n} ting', 'menu.name': 'Hej {nam}', 'menu.start': `Start ${EM} nu` }, 'da');
  eq([c.missing, c.errors.length], [['menu.tail'], 3], 'checkDict: missing, plural bars, placeholders, em dash');
  eq(T.checkDict(en, s.kinds, en, 'nl').same.sort(), ['menu.items', 'menu.name', 'menu.start', 'menu.tail'].filter((k) => en[k].length > 12).sort(), 'untranslated detection: identical English longer than 12 characters');
  ok(T.dictSource({ 'a.b': "it's\nnew \\  " }).includes("'it\\'s\\nnew \\\\ \\u2028'"), 'dictSource escapes');
}

// ------------------------------------------------------------------------------------------------ translation files
{
  const enFile = path.join(JS, 'lang', 'en.js');
  const en = await T.loadDict(enFile);
  ok(!STRICT || en, 'js/lang/en.js exists (run node tools/dtb_i18n.mjs)');
  if (en) {
    const s = T.scan(JS);
    const bad = s.problems.filter((p) => p.level === 'error').map((p) => p.msg);
    eq(bad, [], 'no malformed keys, em dashes, conflicts or placeholder mismatches in the source t() calls');
    for (const [k, v] of Object.entries(en)) { ok(!String(v).includes(EM), 'em dash in English ' + k); ok(T.KEY_RE.test(k), 'key ' + k); }
    if (STRICT) eq(en, s.en, 'js/lang/en.js is current: run node tools/dtb_i18n.mjs');
    for (const code of T.OTHER_LANGS) {
      const dict = await T.loadDict(path.join(JS, 'lang', code + '.js'));
      if (!dict) { ok(!STRICT, code + '.js is missing: run node tools/dtb_i18n.mjs --stub'); continue; }
      const r = T.checkDict(en, s.kinds, dict, code);
      eq(r.errors, [], code + ': placeholders, plural bars, em dashes, value types');
      if (STRICT) { eq(r.missing, [], code + ': missing keys'); eq(r.extra, [], code + ': extra keys'); }
      for (const [k, v] of Object.entries(dict)) ok(typeof v === 'string' && !v.includes(EM), code + ' ' + k);
    }
    // optional data overlays (names and descriptions of data tables)
    for (const code of ['en', ...T.OTHER_LANGS]) {
      const f = path.join(JS, 'lang', code + '_data.js');
      if (!fs.existsSync(f)) continue;
      const d = await T.loadDict(f); ok(d && typeof d === 'object', code + '_data.js default export');
      for (const [k, v] of Object.entries(d)) ok(!String(v).includes(EM), code + '_data ' + k + ' has an em dash');
    }
  }
  // no source string passed to t() contains an em dash, including the dynamic-looking ones (scan raw literals)
  for (const f of T.listSources(JS)) {
    const r = T.extract(fs.readFileSync(path.join(JS, f), 'utf8'), f);
    for (const e of r.entries) ok(!e.en.includes(EM) && !e.key.includes(EM), 'em dash in t() source ' + f + ':' + e.line + ' ' + e.key);
  }
  // the service worker precache walks js/lang
  const { compute } = await import('../tools/dtb_make_manifest.mjs');
  const files = compute().files;
  for (const f of fs.readdirSync(path.join(JS, 'lang')).filter((x) => x.endsWith('.js'))) ok(files.includes('js/lang/' + f), 'precache lists js/lang/' + f);
  ok(files.includes('js/i18n.js'), 'precache lists i18n.js');
}

// ------------------------------------------------------------------------------------------------ stroke font
{
  const need = {
    da: 'ÆØÅæøå', de: 'ÄÖÜßäöüẞ', nl: 'ÉÈÊËÏÓÚÁÍéèêëïóúáí', punct: '\'"’‘“”„«»€',
  };
  const base = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  // the same rule as strokeOk() in doodle_hud.js and coverable() in doodle_fx.js (both upper-case first)
  const strokeOk = (s) => { for (const ch of s.toUpperCase()) if (ch !== ' ' && !K.GLYPHS[ch]) return false; return true; };
  const coverable = (s) => { for (let i = 0; i < s.length; i++) { const c = s[i]; if (c !== ' ' && !K.GLYPHS[c]) return false; } return true; };
  for (const [lang, chars] of Object.entries(need)) for (const ch of chars) { ok(K.GLYPHS[ch], lang + ': glyph for ' + ch + ' (U+' + ch.codePointAt(0).toString(16) + ')'); ok(strokeOk(ch), 'strokeOk ' + ch); ok(coverable(ch.toUpperCase()), 'coverable ' + ch); }
  ok(strokeOk('Spillet er slut, færdig') && strokeOk('Größte Überraschung, Straße') && strokeOk('Waarschuwing, ëï') && strokeOk('Blåbærgrød €5 "ok" it\'s'), 'sample sentences use the stroke font');
  ok(!strokeOk('Hello @ you') && !strokeOk('日本語') && !strokeOk('50% off'), 'unsupported characters fall back to the hand font');
  ok(K.STROKE_EXTRA.length > 20, 'STROKE_EXTRA exported');
  const finite = (g) => g.every((st) => st.length >= 2 && st.length % 2 === 0 && st.every(Number.isFinite));
  for (const ch of base) ok(K.GLYPHS[ch] && finite(K.GLYPHS[ch]), 'base glyph ' + ch);
  // metrics: the 4 x 6 body of an accented letter is the base letter, marks sit above the cap line (y < 0) or under the baseline, never wider than the body
  const pairs = { 'Ä': 'A', 'Ö': 'O', 'Ü': 'U', 'Å': 'A', 'É': 'E', 'È': 'E', 'Ê': 'E', 'Ë': 'E', 'Ï': 'I', 'Ó': 'O', 'Ú': 'U', 'Á': 'A', 'Í': 'I' };
  for (const [a, b] of Object.entries(pairs)) {
    const g = K.GLYPHS[a], bg = K.GLYPHS[b];
    eq(g.slice(0, bg.length), bg, a + ' keeps the body of ' + b);
    for (const st of g.slice(bg.length)) for (let i = 0; i < st.length; i += 2) { ok(st[i + 1] < 0, a + ' mark above the cap line'); ok(st[i] >= 0 && st[i] <= 4, a + ' mark inside the width'); }
  }
  for (const ch of Object.keys(K.GLYPHS)) { const g = K.GLYPHS[ch]; ok(finite(g), ch + ' finite'); for (const st of g) for (let i = 0; i < st.length; i += 2) { ok(st[i] >= -.6 && st[i] <= 4.6 && st[i + 1] >= -3 && st[i + 1] <= 8, ch + ' inside the box'); } }
  for (const [lo, up] of [['ä', 'Ä'], ['æ', 'Æ'], ['ø', 'Ø'], ['å', 'Å'], ['é', 'É'], ['ß', 'ẞ']]) eq(K.GLYPHS[lo], K.GLYPHS[up], lo + ' aliases ' + up);
  // Pen.txt draws every character (counts strokes on a mock ctx); ß stays one glyph in the advance
  const calls = { n: 0 };
  const ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : (k === 'stroke' ? () => { calls.n++; } : () => {})), set: (o, k, v) => { o[k] = v; return true; } });
  const pen = new K.Pen(ctx, 5, 1);
  for (const s of ['SPILLET ER SLUT, FÆRDIG ØÅ', 'GRÖSSTE ÜBERRASCHUNG, STRAßE', 'WAARSCHUWING, ËÏ ÉÈÊ ÓÚÁÍ', '“Quote” \'it\' "x" €5 «a» „b“']) { calls.n = 0; pen.txt(s, 0, 0, 30, '#fff', { out: '#000' }); ok(calls.n > s.replace(/ /g, '').length, 'txt draws ' + s); }
  eq(pen.textWidth('STRAßE', 30), pen.textWidth('STRASE', 30), 'ß is one glyph wide');
  // every English UI text that is upper-cased for the stroke font only needs covered letters when it is short (informational)
  // letters that Danish, Dutch and German text can contain are all covered: scan the translation files for letters without a glyph
  const lack = new Set();
  for (const code of T.OTHER_LANGS) {
    const dict = await T.loadDict(path.join(JS, 'lang', code + '.js')); if (!dict) continue;
    for (const v of Object.values(dict)) for (const ch of String(v).toUpperCase().replace(/\{\w+\}/g, '')) if (/\p{L}/u.test(ch) && !K.GLYPHS[ch]) lack.add(code + ':' + ch);
  }
  eq([...lack], [], 'every letter used in da, nl, de has a stroke glyph');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('drop_the_bass_i18n: ' + n + ' checks passed' + (STRICT ? ' (strict)' : ''));
