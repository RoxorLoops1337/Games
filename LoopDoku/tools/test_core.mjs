// Logic tests for the engine, the level packs and the meta layer (no browser). Usage: node tools/test_core.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const store = {};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
globalThis.location = { pathname: '/neon.html', href: '', hash: '', replace() {} };
for (const f of ['loopdoku-core.js', 'loopdoku-levels.js', 'loopdoku-meta.js']) (0, eval)(fs.readFileSync(path.join(root, f), 'utf8'));
const LD = window.LD;
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };

// every level: unique solution and valid regions
function count(p) {
  const n = p.n, reg = p.region; let c = 0; const colU = [], regU = [], s = [];
  (function go(r) { if (c > 1) return; if (r === n) { c++; return; } for (let x = 0; x < n; x++) { const k = reg[r * n + x]; if (colU[x] || regU[k] || (r && Math.abs(x - s[r - 1]) < 2)) continue; colU[x] = regU[k] = 1; s[r] = x; go(r + 1); colU[x] = regU[k] = 0; } })(0);
  return c;
}
const packs = LD.meta.packs();
ok(packs.map((p) => p.id).join().startsWith('easy,normal,chill,hard,expert,terror,extreme'), 'packs in order');
let total = 0;
for (const p of packs) for (const L of p.levels) {
  total++;
  const q = LD.meta.level(L.id);
  ok(q.region.length === q.n * q.n && new Set(q.region).size === q.n, L.id + ' regions');
  ok(count(q) === 1, L.id + ' unique solution');
}
ok(total >= 100, 'at least 100 levels, got ' + total);
ok(packs.find((p) => p.id === 'extreme').levels.every((L) => L.n >= 9), 'extreme boards are 9x9 or larger');
const nm = packs.find((p) => p.id === 'nightmare'); ok(!nm || nm.levels.every((L) => L.n === 10), 'nightmare boards are 10x10');

// no auto-cross by default, arrows cross a line and toggle
const g = LD.meta.newGame('hard-1');
ok(g.opts.autoCross === false, 'auto-cross is off by default');
const s0 = g.p.sol[0];
ok(g.place(s0) === true, 'place correct');
ok(g.cells.filter((v) => v === 1 || v === 2).length === 0, 'placing crosses nothing');
const marks = [];
g.on('mark', (e) => marks.push(e));
ok(g.crossLine('row', 0) === g.n - 1 && marks.every((e) => e.source === 'line'), 'row arrow crosses the other squares');
ok(g.crossLine('row', 0) === g.n - 1 && g.rowCells(0).every((i) => g.cells[i] === 0 || g.cells[i] === 3), 'second tap wipes the row');
g.crossLine('col', 2); ok(g.colCells(2).every((i) => g.cells[i] !== 0), 'column arrow');
g.undo(); ok(g.colCells(2).some((i) => g.cells[i] === 0), 'undo reverts an arrow');

// assist setting turns auto-cross back on
LD.meta.set('assist', true);
ok(LD.meta.newGame('easy-1').opts.autoCross === true, 'assist turns auto-cross on');
LD.meta.set('assist', false);

// points, unlocks, support
const win = (id) => { const gm = LD.meta.newGame(id); let r; gm.on('win', (e) => { r = LD.meta.recordWin(id, e); }); for (let x = 0; x < gm.n; x++) gm.place(x * gm.n + gm.p.sol[x]); return r; };
const r1 = win('easy-1');
ok(r1 && r1.points === 15 + 8 + 10 && r1.firstClear && r1.dayBonus === 10, 'easy first clear, 3 stars and the day bonus pay 33, got ' + (r1 && r1.points));
ok(typeof r1.cheer === 'string' && r1.nextLook && r1.nextLook.id === 'comic', 'cheer and next look');
const r2 = win('easy-1');
ok(r2.points < r1.points && !r2.firstClear, 'replay pays less');
ok(LD.meta.packs()[1].unlocked === false, 'normal locked at first');
win('easy-2'); const r3 = win('easy-3');
ok(r3.streak === 4 && r3.streakBonus > 0, 'win streak bonus');
ok(r3.goal.count === 3 && r2.goal.count === 2, 'daily set counts');
const rl = LD.meta.recordLoss(); ok(rl.streakLost === 4 && LD.meta.state.streak === 0, 'a loss ends the streak');
ok(LD.meta.packs()[1].unlocked === true, 'normal opens after 3 easy');
ok(LD.meta.state.wins === 4 && LD.meta.supportDue() === true, 'support due after the 3rd win');
LD.meta.markSupportShown();
ok(LD.meta.supportDue() === false, 'support not due right after showing');
ok(LD.meta.skin() === 'neon' && LD.meta.skins().filter((k) => k.unlocked).map((k) => k.id).join() === 'neon,idol', 'neon opens, idol free, the rest locked');
ok(LD.meta.buySkin('sticker').ok === false, 'cannot buy without points');
LD.meta.state.points = 5000;
ok(LD.meta.buySkin('sticker').ok === true && LD.meta.skins().find((k) => k.id === 'sticker').unlocked, 'buy a skin');
ok(LD.meta.state.points === 4550, 'skin cost taken');
const d = LD.meta.daily();
ok(d.id.startsWith('daily-') && d.puzzle.region.length === d.puzzle.n ** 2, 'daily jam puzzle');
const rd = win(d.id);
ok(rd.daily && rd.points >= 2 * 60, 'daily pays double');
ok(JSON.parse(store.loopdoku_save_v1).unlocked.includes('sticker'), 'progress saved');
// a locked look opened without .html (Cloudflare Pages serves /LoopDoku/comic) sends the player back to their own look
{
  let sent = null;
  const store2 = { loopdoku_save_v1: JSON.stringify({ unlocked: ['neon', 'idol'], skin: 'neon' }) };
  const ctx = { window: {}, localStorage: { getItem: (k) => store2[k] || null, setItem: (k, v) => { store2[k] = v; } }, location: { pathname: '/LoopDoku/comic', hash: '', href: '', replace: (u) => { sent = u; } } };
  const src = ['loopdoku-core.js', 'loopdoku-levels.js', 'loopdoku-meta.js'].map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join(String.fromCharCode(10));
  new Function('window', 'localStorage', 'location', 'performance', src)(ctx.window, ctx.localStorage, ctx.location, performance);
  ok(sent === 'neon.html#title', 'locked look without .html redirects to the current look, got ' + sent);
}
console.log(fails ? fails + ' failures' : `all tests pass (${total} levels)`);
process.exit(fails ? 1 : 0);
