// 39_j: local-only play stats (playstats_b16j.js): counters, sanitising, panel HTML, no network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(path.join(ROOT, 'sim.js'));
const P = await import(path.join(ROOT, 'playstats_b16j.js'));
const U = await import(path.join(ROOT, 'unlock_b12p.js'));
const ok = (c, m) => assert.ok(c, m);

// fresh and hostile saves
ok(sim.sanitizeSave(null).pstats === undefined || sim.sanitizeSave(null).pstats.runs === 0, 'a null save is safe');
ok(sim.sanitizeSave({}).pstats.runs === 0, 'sanitised save always has pstats');
const bad = sim.sanitizeSave({ pstats: { runs: -4, wins: 'x', st: { 0: [1], 51: [1, 1, 1, 1], 7: [3, 1, 2, 'q'], abc: [1] }, cards: { '<b>': 4, power: 9, long: 'zz' }, picks: 1e30 } });
ok(bad.pstats.runs === 0 && bad.pstats.wins === 0, 'bad numbers become 0');
ok(Object.keys(bad.pstats.st).join() === '7' && bad.pstats.st[7].join() === '3,1,2,0', 'only valid stages survive');
ok(Object.keys(bad.pstats.cards).join() === 'power', 'only clean card ids survive');
ok(bad.pstats.picks <= 1e9, 'huge counters are capped');

// recording
P.resetSession();
const s = sim.sanitizeSave({});
P.recordRun(s, { stage: 3, won: false, time: 41 });
P.noteQuit(); P.recordRun(s, { stage: 3, won: false, time: 10 });
P.recordRun(s, { stage: 3, won: true, time: 80 });
P.recordRun(s, { stage: 9, won: false, time: 5, mode: 'pig' });
ok(s.pstats.runs === 4 && s.pstats.wins === 1 && s.pstats.losses === 2 && s.pstats.quits === 1, 'run counters');
ok(s.pstats.st[3].join() === '3,1,1,1', 'per-stage runs, wins, losses, quits');
ok(!s.pstats.st[9], 'special modes are not stage stats');
ok(s.pstats.sessions === 1 && s.pstats.maxSess === 4, 'one session, 4 runs');
P.noteQuit(); P.recordRun(s, { stage: 4, won: true, time: 1 }); ok(s.pstats.quits === 1, 'a win is never a quit');
P.resetSession(); P.recordRun(s, { stage: 4, won: false, time: 1 }); ok(s.pstats.sessions === 2 && s.pstats.maxSess === 5, 'second session');
P.recordPick(s, { id: 'aspd' }); P.recordPick(s, { id: 'aspd' }); P.recordPick(s, { id: 'power' }); P.recordPick(s, { id: '<x>' }); P.recordSkip(s);
ok(s.pstats.picks === 3 && s.pstats.cards.aspd === 2 && s.pstats.skips === 1, 'card picks and skips');
const m = P.summarize(s.pstats);
ok(m.tough === 3 && m.top[0][0] === 'aspd', 'summary: ' + JSON.stringify(m));

// survives the save round trip
const back = sim.sanitizeSave(JSON.parse(JSON.stringify(s)));
ok(JSON.stringify(back.pstats) === JSON.stringify(s.pstats), 'stats round trip');
ok(sim.importSave(sim.exportSave(s)).pstats.runs === s.pstats.runs, 'stats ride the backup code');

// panel
const html = P.playStatsHTML(s, id => id === 'aspd' ? 'Faster Tempo' : id);
ok(/Faster Tempo/.test(html) && /Stage 3/.test(html) && /pschart/.test(html) && /Clear/.test(html), 'panel content');
ok((html.match(/<i /g) || []).length === 50, '50 bars');
ok(/Play a gig/.test(P.playStatsHTML(sim.sanitizeSave({}), x => x)), 'empty state');
ok(!html.includes(String.fromCharCode(8212)), 'no em dash');
P.resetPstats(s); ok(s.pstats.runs === 0, 'reset');

// unlock + wiring + privacy
ok(U.isUnlocked('playstats', { cleared: 12 }) && !U.isUnlocked('playstats', { cleared: 3 }), 'unlocks at stage 12');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const src = rd('playstats_b16j.js');
ok(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|navigator\.|^import\s/m.test(src.replace(/^\/\/.*$/gm, '')), 'the stats module has no network code and no imports');
const main = rd('main.js');
ok(/psRun\(save, r\)/.test(main) && /psPick\(save, g\.choices\[i\]\)/.test(main) && /psQuit\(\)/.test(main) && /psSkip\(save\)/.test(main), 'main.js records runs, picks, skips and quits');
ok(/playStatsHTML\(s, psName\)/.test(rd('hub2.js')), 'hub2 shows the panel');
