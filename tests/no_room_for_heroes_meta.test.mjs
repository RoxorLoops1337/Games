// Battle report attribution + Ascension (NG+) mechanics.
//
//   node tests/no_room_for_heroes_meta.test.mjs   (or: npm run test:boss)
import { loadGame, harness } from './no_room_for_heroes_lib.mjs';

const A = loadGame(`freshGame,chooseBoss,battleReportHTML,difficulty,dealToHero,buildHeroFromSpec,
  trueVictory,saveRunes,loadRunes,awardRunes,
  dailyKey,prevDayKey,dailyMod,dailyClaim,dailyClaimedKey,streakBump,streakCount,streakMul,
  dailyMenuLine,gotoMenu,shareText,shareRun,DAILY_MODS,DAILY_RUNE_BONUS,PLAY_URL,
  get RUNES(){return RUNES;},get _roomDmgCtx(){return _roomDmgCtx;},set _roomDmgCtx(v){_roomDmgCtx=v;},
  get overlay(){return overlay;},
  get G(){return G;},set G(v){G=v;}`);
const t = harness('report/ascension');

A.G = A.freshGame('campaign'); A.chooseBoss('dragon');

// empty report on a fresh run
t.ok(A.battleReportHTML() === '', 'no report before any damage');

// room-context damage lands on the room; context-free damage lands on the boss bucket
const room = { type:'goblin', lvl:2, kills:3 };
A.G.rooms[0] = room;
const hero = { state:'walking', hp:500, maxHp:500, armor:0, x:100, y:330, traits:[], dodge:0 };
A._roomDmgCtx = room; A.dealToHero(hero, 50, 'HIT', 'full', 'phys', true); A._roomDmgCtx = null;
t.ok((room.dmg||0) > 0, 'room-context damage attributed to the room');
const abil0 = A.G.stats.abilDmg||0;
A.dealToHero(hero, 30, 'SMITE', 'full', 'phys', true);
t.ok((A.G.stats.abilDmg||0) > abil0, 'context-free damage attributed to boss bucket');
const html = A.battleReportHTML();
t.ok(html.includes('Goblin Den') && html.includes('Battle report'), 'report lists the room');

// reaction damage is credited too (it bypasses dealToHero via reactHit) — an
// IGNITE fired inside a room context must land on the room + the hero telemetry
const oiled = { state:'walking', hp:5000, maxHp:5000, armor:0, x:100, y:330, traits:[], dodge:0, oil:10 };
const fireRoom = { type:'flame', lvl:1, kills:0 };
A._roomDmgCtx = fireRoom; A.dealToHero(oiled, 40, 'HIT', 'full', 'fire', true); A._roomDmgCtx = null;
t.ok((fireRoom.dmg||0) > 40, `the IGNITE burst is credited to the firing room (${fireRoom.dmg} > the 40 base hit)`);
t.ok((oiled.dmgTaken||0) === (fireRoom.dmg||0), 'hero telemetry matches the room credit exactly');

// ascension: difficulty scales +18% per crown, campaign only
A.G.levelIdx = 19;                       // some mid-campaign level
A.RUNES.asc = 0; const d0 = A.difficulty();
A.RUNES.asc = 2; const d2 = A.difficulty();
t.ok(Math.abs(d2/d0 - 1.36) < 1e-9, 'asc 2 → ×1.36 campaign difficulty');
A.G.mode = 'endless'; A.G.survived = 0;
const e2 = A.difficulty(); A.RUNES.asc = 0; const e0 = A.difficulty();
t.ok(Math.abs(e2 - e0) < 1e-9, 'ascension does NOT touch endless difficulty');

// ascension persists through the rune save
A.RUNES.asc = 3; A.RUNES.best = 123; A.saveRunes(); A.loadRunes();
t.ok(A.RUNES.asc === 3 && A.RUNES.best === 123, 'asc + endless best survive save/load');

// trueVictory grants a crown (capped at 9)
A.G = A.freshGame('campaign'); A.chooseBoss('dragon'); A.G.mode='campaign';
A.RUNES.asc = 3;
A.trueVictory();
t.ok(A.RUNES.asc === 4, 'trueVictory raises ascension');
t.ok(A.G.phase === 'win', 'victory phase reached');

// 👑 the King finale-raider is built far stronger than a same-power warrior
A.G = A.freshGame('campaign'); A.chooseBoss('dragon');
const baseSpec = { cls:'warrior', power:50, traits:[], debuff:{atkMul:1, burn:0, robbed:false} };
const plain = A.buildHeroFromSpec(baseSpec);
const king  = A.buildHeroFromSpec({ ...baseSpec, king:true, name:'The High King' });
t.ok(king.king, 'the King is flagged');
t.ok(king.maxHp > plain.maxHp * 9, `the King is far tankier (${king.maxHp} vs ${plain.maxHp})`);
t.ok(king.atk > plain.atk * 1.5, `the King hits much harder (${king.atk} vs ${plain.atk})`);
t.ok(king.armor >= plain.armor + 13, 'the King wears heavy armor (+13)');

// ── 📅 daily bounty: deterministic date-keyed modifier ──────────────────────
t.ok(/^\d{4}-\d{2}-\d{2}$/.test(A.dailyKey()), 'dailyKey is UTC YYYY-MM-DD');
t.ok(A.prevDayKey('2026-03-01') === '2026-02-28', 'prevDayKey crosses month boundaries');
t.ok(A.dailyMod('2026-01-01').id === 'swift', 'mod selection is stable for a fixed date (2026-01-01 → swift)');
t.ok(A.dailyMod('2026-01-03').id === 'runes' && A.dailyMod('2026-01-05').id === 'horde',
  'different dates hash to different mods deterministically');
t.ok(A.dailyMod('2026-01-01') === A.dailyMod('2026-01-01'), 'same key always returns the same entry');
t.ok(A.DAILY_MODS.length >= 6 && A.DAILY_MODS.every(m => m.id && m.name && m.desc), 'the table has 6+ complete entries');

// first-run-of-day bonus: pays once per day per slot, then never again that day
global.localStorage.removeItem('bm_daily_1');
t.ok(A.dailyClaim('2026-01-01') === A.DAILY_RUNE_BONUS, 'first run of the day pays the flat bonus');
t.ok(A.dailyClaim('2026-01-01') === 0, 'a second run the same day pays nothing');
t.ok(A.dailyClaim('2026-01-02') === A.DAILY_RUNE_BONUS, 'a new day pays again');
t.ok(A.dailyClaimedKey() === '2026-01-02', 'the claimed day is persisted per slot');

// ── 🔥 streak: consecutive days count up, a gap resets ─────────────────────
global.localStorage.removeItem('bm_streak_1');
t.ok(A.streakBump('2026-01-01') === 1, 'first ever run-end starts the streak at 1');
t.ok(A.streakBump('2026-01-02') === 2, 'the next day increments it');
t.ok(A.streakBump('2026-01-02') === 2, 'a second run the same day does not double-count');
t.ok(A.streakBump('2026-01-03') === 3, 'day three → 3');
t.ok(A.streakBump('2026-01-07') === 1, 'a missed day resets the streak to 1');
// multiplier: nothing on day 1, +10%/day from day 2, capped at +50%
const seed = n => global.localStorage.setItem('bm_streak_1', JSON.stringify({day:A.dailyKey(), count:n}));
seed(1); t.ok(A.streakMul() === 1,    'a 1-day streak pays no bonus yet');
seed(2); t.ok(A.streakMul() === 1.2,  '2-day streak → +20% rune drops');
seed(3); t.ok(Math.abs(A.streakMul()-1.3) < 1e-9, '3-day streak → +30%');
seed(9); t.ok(A.streakMul() === 1.5,  'the bonus caps at +50%');
global.localStorage.setItem('bm_streak_1', JSON.stringify({day:'2020-01-01', count:9}));
t.ok(A.streakCount() === 0 && A.streakMul() === 1, 'a stale streak (not fed today/yesterday) shows and pays 0');

// ── menu surfacing: bounty line + Leaderboard button on the profile home ───
seed(3);
A.G = A.freshGame('campaign');
A.gotoMenu();
const menu = A.overlay.innerHTML || '';
t.ok(menu.includes("Today's Bounty"), 'the menu announces today\'s bounty');
t.ok(menu.includes(A.dailyMod().name), 'the announced bounty is today\'s actual mod');
t.ok(menu.includes('openLeaderboard()'), 'the main menu surfaces a Leaderboard button');
t.ok(menu.includes('Streak: <b>3 days</b>'), 'a live 2+ day streak is shown on the menu');

// ── 📋 shareable death card: text summary + play URL ───────────────────────
A.G = A.freshGame('campaign'); A.chooseBoss('dragon');
A.G.levelIdx = 7; A.G.totalSlain = 23;
A.G.rooms[0] = { type:'spike', lvl:2, dmg:340, kills:9 };
A.G.killer = { heroName:'Bob', title:'the Bold', cls:'warrior', traits:[] };
const txt = A.shareText();
t.ok(txt.includes(A.G.boss.name), 'share text names the boss');
t.ok(txt.includes(A.PLAY_URL), 'share text carries the play URL');
t.ok(txt.includes('Level 8/50') && txt.includes('23'), 'share text carries level + kills');
t.ok(txt.includes('Bob the Bold'), 'share text names the killer');
t.ok(txt.includes('Spike Pit') && txt.includes('340'), 'share text credits the top room');
let shareThrew = ''; try { A.shareRun(); } catch (e) { shareThrew = e.message; }
t.ok(shareThrew === '', 'shareRun is harness-safe without navigator.share/clipboard');

t.done();
