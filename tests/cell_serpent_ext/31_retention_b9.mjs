// Round 9 retention: chest streak, tomorrow's spin peek, quest near miss, stage stickers.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const ch = await import(join(root, 'chase.js'));
const ND = String.fromCharCode(0x2014);

// ---- chest streak
const s = sim.defaultSave(); const d0 = 20100;
const finish = (save, day) => { save.addict.q = { day, p: sim.dailyQuests(day).map(q => q.target), chest: 0 }; return sim.claimQuestChest(save, day); };
assert.equal(ch.questStreak(s, d0).n, 0);
assert.ok(finish(s, d0), 'chest opens');
assert.equal(s.addict.qs.n, 1);
assert.equal(sim.claimQuestChest(s, d0), null, 'no second open the same day');
assert.equal(s.addict.qs.n, 1);
finish(s, d0 + 1); finish(s, d0 + 2);
assert.equal(s.addict.qs.n, 3);
assert.equal(s.addict.qs.b, 1, 'day 3 bonus flagged');
const b4 = s.beats; finish(s, d0 + 3); assert.equal(s.addict.qs.b, 0);
assert.ok(ch.questStreakLine(s, d0 + 3).includes('4 day'));
assert.equal(ch.questStreak(s, d0 + 4).atRisk, true, 'tomorrow the streak is at risk until the chest opens');
assert.equal(ch.questStreak(s, d0 + 5).n, 0, 'a missed day is a fresh start, nothing is taken');
const bb = s.beats; finish(s, d0 + 9); assert.equal(s.addict.qs.n, 1); assert.ok(s.beats >= bb);
const t = sim.defaultSave(); finish(t, d0); finish(t, d0 + 1); const beforeB = t.beats; finish(t, d0 + 2);
assert.ok(t.beats - beforeB >= sim.QS_BONUS[0].reward.beats, 'day 3 grants the bonus');
assert.ok(ch.questStreakLine(t, d0 + 2).startsWith('Chest streak 3!'));

// ---- sanitize keeps / defaults the streak
const r = sim.sanitizeSave(JSON.parse(JSON.stringify(t)));
assert.deepEqual(r.addict.qs, t.addict.qs);
assert.deepEqual(sim.sanitizeSave({}).addict.qs, { last: 0, n: 0, b: 0 });
assert.deepEqual(sim.sanitizeSave({ addict: { qs: { last: -4, n: 'x', b: 1e9 } } }).addict.qs, { last: 0, n: 0, b: 9 });
assert.equal(sim.sanitizeSave({ addict: { claimed: { 'stk:5': 1 } } }).addict.claimed['stk:5'], 1, 'sticker claims survive sanitize');

// ---- tomorrow peek is the real prize of tomorrow
for (const day of [20000, 20001, 20050]) {
  const pk = ch.tomorrowPeek(day), p = sim.SPIN_PRIZES[sim.spinPrize(day + 1)];
  assert.equal(pk.icon, p.icon); assert.ok(pk.line.includes(sim.rewardText(p.reward)));
  assert.ok(!pk.line.includes(ND));
}

// ---- quest near miss
const q = sim.defaultSave(); const qd = 20200, defs = sim.dailyQuests(qd);
q.addict.q = { day: qd, p: [0, 0, 0], chest: 0 };
assert.equal(ch.questNear(q, qd), null, 'nothing near at zero');
q.addict.q.p = [Math.ceil(defs[0].target * 0.8), 0, 0];
const nr = ch.questNear(q, qd);
if (defs[0].target - q.addict.q.p[0] > 0) { assert.ok(nr && nr.left === defs[0].target - q.addict.q.p[0]); assert.ok(nr.text.includes(String(nr.left))); }
q.addict.q.p = defs.map(x => x.target); assert.equal(ch.questNear(q, qd), null, 'done quests are not near misses');

// ---- stage stickers
const k = sim.defaultSave();
let al = ch.stickerAlbum(k);
assert.equal(al.cells.length, sim.MAX_STAGE); assert.equal(al.gold, 0);
assert.equal(al.target.stage, 1, 'a fresh account chases stage 1');
k.cleared = 5; k.stars = { 1: 3, 2: 3, 3: 2, 4: 3, 5: 3 };
al = ch.stickerAlbum(k);
assert.equal(al.gold, 4); assert.equal(al.target.stage, 3, 'a started sticker is the one to shine');
assert.ok(ch.stickerHint(al).includes('1 more star'));
assert.equal(ch.claimSticker(k, 5), false, 'not ready below 5 gold');
k.stars[3] = 3; al = ch.stickerAlbum(k);
assert.equal(al.miles[0].ready, true);
const bs = k.beats; assert.equal(ch.claimSticker(k, 5), true); assert.equal(k.beats, bs + 200);
assert.equal(ch.claimSticker(k, 5), false, 'one claim only');
assert.equal(ch.stickerAlbum(k).miles[0].claimed, true);
const grid = ch.stickerGridHTML(al); assert.equal((grid.match(/class="stk /g) || []).length, sim.MAX_STAGE);
for (const f of ['chase.js']) assert.ok(!readFileSync(join(root, f), 'utf8').includes(ND), 'no em dash');
const html = readFileSync(join(root, 'index.html'), 'utf8');
assert.ok(html.includes('.stkg{') && html.includes('.qfire'));
