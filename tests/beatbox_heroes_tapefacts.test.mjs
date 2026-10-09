// Beatbox Heroes: the VHS history tape data (tape_facts.js) and its save field (core.js flags.tapeNext). Node only.
//   every fact: an era, a year label, a sort year, <= 140 chars, a source credit and a URL; ids unique; the tapes cover every fact once, 4 to 6 facts each, chronological on screen;
//   tape 1 carries the 2005 world final (Joel Turner vs RoxorLoops); no em dash in the tape files; core: tapeNext defaults to 0 (new and old saves), WATCH advances it, rewards unchanged.
import fs from 'node:fs';
import path from 'node:path';
import { ok, eq, near, done, load, ROOT } from './beatbox_heroes_lib.mjs';
const BBH = load('pix', 'catalog', 'core', 'tape_facts');
const { Core, TAPE_FACTS: TF } = BBH;

/* ---- the facts */
ok(TF.FACTS.length >= 40, '40+ facts (' + TF.FACTS.length + ')');
const ids = new Set();
for (const f of TF.FACTS) {
  ok(!ids.has(f.id), 'unique id ' + f.id); ids.add(f.id);
  ok(!!TF.ERAS[f.era], f.id + ': known era ' + f.era);
  ok(typeof f.year === 'string' && f.year.trim().length > 0 && f.year.length <= 13, f.id + ': year label "' + f.year + '"');
  ok(typeof f.y === 'number' && f.y > 1000 && f.y < 2100, f.id + ': numeric sort year');
  ok(typeof f.text === 'string' && f.text.length >= 40 && f.text.length <= TF.MAX_LEN && TF.MAX_LEN <= 140, f.id + ': text 40..140 chars (' + (f.text || '').length + ')');
  ok(typeof f.src === 'string' && f.src.length >= 4 && f.src.length <= 60, f.id + ': source credit');
  ok(/^https:\/\/[\w.-]+\.\w+\//.test(f.url || ''), f.id + ': source URL');
  ok(!/[\u2014\u2013]/.test(f.text + f.src + f.year), f.id + ': no em or en dash');
}
for (let i = 1; i < TF.FACTS.length; i++) ok(TF.FACTS[i].y >= TF.FACTS[i - 1].y, 'facts are chronological: ' + TF.FACTS[i].id);
const eras = new Set(TF.FACTS.map((f) => f.era)); ok(['roots', 'oldschool', 'newschool', 'battle', 'loop', 'roxor'].every((e) => eras.has(e)), 'roots, old school, new school, battle, loop and RoxorLoops eras all have facts');
ok(TF.FACTS.filter((f) => f.era === 'roxor').length >= 4, 'RoxorLoops has his own facts');
const fin = TF.FACTS.find((f) => f.id === 'final2005'); ok(!!fin && /RoxorLoops/.test(fin.text) && /Joel Turner/.test(fin.text) && /Turner took the crown/.test(fin.text), 'the 2005 final: RoxorLoops vs Joel Turner, Turner won');

/* ---- the tapes */
const seen = new Map(); TF.TAPES.forEach((t, k) => t.forEach((i) => seen.set(i, (seen.get(i) || 0) + 1)));
ok(seen.size === TF.FACTS.length && [...seen.values()].every((n) => n === 1), 'the tapes show every fact exactly once per cycle');
ok(TF.TAPES.every((t) => t.length >= 4 && t.length <= 6), '4 to 6 facts per tape (' + TF.TAPES.map((t) => t.length).join(',') + ')');
ok(TF.TAPES.every((t) => t.every((x, j) => !j || TF.FACTS[x].y >= TF.FACTS[t[j - 1]].y)), 'each tape runs chronologically');
ok(TF.pick(0).some((f) => f.id === 'final2005'), 'the first tape shows the 2005 world final');
eq(TF.pick(TF.count()).map((f) => f.id), TF.pick(0).map((f) => f.id), 'the tapes cycle after the last one');
ok(TF.pick(1).map((f) => f.id).join() !== TF.pick(0).map((f) => f.id).join(), 'the next tape shows different facts');

/* ---- no em dash in any tape file */
for (const f of ['tape_facts.js', 'tape.js', 'park3d/tape.js']) ok(!/\u2014/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')), f + ': no em dash');

/* ---- the save field and the core rewards */
const ch = Core.newChar(BBH.CATALOG.DEFAULT_LOOK); eq(ch.flags.tapeNext, 0, 'a new save starts at tape 0');
const old = JSON.parse(JSON.stringify(ch)); delete old.flags.tapeNext; eq(Core.migrate(old).flags.tapeNext, 0, 'an old save without the field gets tapeNext 0');
const keep = JSON.parse(JSON.stringify(ch)); keep.flags.tapeNext = 7; eq(Core.migrate(keep).flags.tapeNext, 7, 'a saved tape pointer survives loading');
ch.day = 3; ch.minutes = 6 * 60; ch.mood = 50; ch.energy = 80;
const r = Core.apply(ch, { t: 'tape' }, () => 0.5), c = r.char;
eq(c.flags.tapeNext, 1, 'watching advances the tape pointer'); eq(c.flags.tapeDay, 3, 'tapeDay is today');
eq(c.mood, 58, 'mood +8 (unchanged reward)'); near(c.stats.ori - ch.stats.ori, 0.35, 1e-9, 'Originality +0.35 (unchanged reward)'); eq(c.minutes - ch.minutes, 60, '60 minutes pass');
ok(r.fx.some((f) => f.t === 'toast' && /old battle tape/.test(f.text)), 'the same reward toast');
const r2 = Core.apply(c, { t: 'tape' }, () => 0.5); eq(r2.char.flags.tapeNext, 1, 'a second tape the same day does not advance the pointer'); eq(r2.char.mood, c.mood, 'and gives nothing');
ok(r2.fx.some((f) => f.t === 'toast' && /already watched/.test(f.text)), 'it says you already watched one');
done();
