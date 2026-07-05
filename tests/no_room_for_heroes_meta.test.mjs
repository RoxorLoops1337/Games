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

/* ═══════════ 💾 MID-RUN SAVE & RESUME + 🧬 ENDLESS MUTATIONS (Batch F) ═══════════ */
const S = loadGame(`freshGame,chooseBoss,saveRun,loadRunSave,clearRunSave,resumeRun,runKey,runResumeLine,
  gotoMenu,gotoBuild,makeRoom,makeUnit,bossDies,closeDungeon,lbAutoSubmit,buildHeroFromSpec,
  gotoMutChoice,pickMut,afterReward,pickMandate,ENDLESS_MUTS,MUT_SCORE_STEP,hasMut,slotCap,ROOMS,RELICS,
  get overlay(){return overlay;},get G(){return G;},set G(v){G=v;}`);

// capture network posts (board submit); everything else resolves ok
let sentBody = null;
global.fetch = (url, opts) => { if (opts && opts.body) { try { sentBody = JSON.parse(opts.body); } catch (_) {} }
  return Promise.resolve({ ok: true, json: async () => ({}) }); };

// ── round trip: build a lived-in mid-run G, save, wipe, resume ──────────────
S.G = S.freshGame('campaign'); S.chooseBoss('dragon');
const relicId = Object.keys(S.RELICS)[0];
S.G.levelIdx = 22; S.G.totalSlain = 87; S.G.gold = 444; S.G.dread = 33; S.G.bounty = 2; S.G.guildLvl = 2;
const sRoom = S.makeRoom('spike', 1);
sRoom.units.push(S.makeUnit('flame', 3));
const ogre = S.makeUnit('ogre', 2); ogre.gear = [{ k: 'blade', t: 'rare', v: 0 }]; sRoom.units.push(ogre);
sRoom.kills = 7; sRoom.cap = 3; sRoom._preview = { junk: true };   // transient — must never serialize
S.G.rooms = [sRoom, null]; S.G.slots = 2;
S.G.hand = [{ type: 'tesla', lvl: 1 }];
S.G.chest = [{ k: 'aegis', t: 'epic', v: 1 }];
S.G.relics = [relicId]; S.G.mandates = ['goldVeins'];
S.G.muts = ['vigor']; S.G.scoreMul = 1.3; S.G.slotBonus = 1;
S.G.boss.maxHp = 400; S.G.boss.hp = 250; S.G.boss.mana = 42; S.G.boss.potions = 2;
S.saveRun();
const raw = global.localStorage.getItem(S.runKey());
t.ok(!!raw, 'saveRun writes bm_run_<slot>');
t.ok(raw.indexOf('_preview') === -1 && raw.indexOf('"def"') === -1, 'transient _fields and room.def never serialize');
S.G = S.freshGame('campaign');                     // wipe the live run
S.resumeRun();
t.ok(S.G.phase === 'build', 'resume lands back in the build phase');
t.ok(S.G.mode === 'campaign' && S.G.levelIdx === 22 && S.G.gold === 444 && S.G.dread === 33, 'level/gold/dread survive');
const rr = S.G.rooms[0];
t.ok(rr && rr.type === 'spike' && rr.kills === 7 && rr.cap === 3, 'room + veteran kills + slot cap survive');
t.ok(rr && rr.def === S.ROOMS.spike, 'room.def is re-linked to the live ROOMS table');
t.ok(rr && rr.units.length === 3 && rr.units[2].gear[0].k === 'blade', 'stacked units + equipped gear survive');
t.ok(S.G.rooms[1] === null && S.G.slots === 2, 'empty slots survive');
t.ok(S.G.hand.length === 1 && S.G.hand[0].type === 'tesla', 'hand survives');
t.ok(S.G.chest.length === 1 && S.G.chest[0].t === 'epic', 'war chest survives');
t.ok(S.G.relics.length === 1 && S.G.relics[0] === relicId && S.G.mandates[0] === 'goldVeins', 'relics + mandates survive');
t.ok(S.G.boss.hp === 250 && S.G.boss.maxHp === 400 && S.G.boss.mana === 42 && S.G.boss.potions === 2,
  'boss mutable numbers survive (relic boons stay baked in)');
t.ok(S.G.muts[0] === 'vigor' && S.G.scoreMul === 1.3 && S.G.slotBonus === 1, 'mutations + score multiplier + growth beats survive');
// the profile menu offers the resume (the gotoBuild autosave re-wrote the key)
S.gotoMenu();
const menuHtml = S.overlay.innerHTML || '';
t.ok(menuHtml.includes('resumeRun()') && menuHtml.includes('Level 23'), 'the menu offers ▶ Resume with the level');
t.ok(menuHtml.includes('discardRunSave()'), '…with a 🗑 discard next to it');

// ── corrupt / legacy data is silently discarded, never fatal ────────────────
global.localStorage.setItem(S.runKey(), '{corrupt!!!');
t.ok(S.loadRunSave() === null && S.runResumeLine() === '', 'corrupt JSON → no offer, no throw');
let resumeThrew = ''; try { S.resumeRun(); } catch (e) { resumeThrew = e.message || 'threw'; }
t.ok(resumeThrew === '', 'resumeRun on corrupt data is a safe no-op');
global.localStorage.setItem(S.runKey(), JSON.stringify({ v: 99, mode: 'campaign' }));
t.ok(S.loadRunSave() === null, 'a future save version is ignored');
global.localStorage.setItem(S.runKey(), JSON.stringify({ v: 1, mode: 'campaign', boss: { key: 'nosuchboss', maxHp: 100 }, rooms: [], hand: [] }));
t.ok(S.loadRunSave() === null, 'an unknown boss key fails the shape check');

// ── run-over paths clear the key; a new run clears it; the tutorial never touches it ──
S.G = S.freshGame('endless'); S.chooseBoss('dragon'); S.G.totalSlain = 30; S.saveRun();
t.ok(!!global.localStorage.getItem(S.runKey()), '(seed) endless run saved');
S.G.phase = 'run'; S.bossDies();
t.ok(global.localStorage.getItem(S.runKey()) === null, 'bossDies clears the mid-run save');
S.G = S.freshGame('endless'); S.chooseBoss('dragon'); S.saveRun();
S.closeDungeon();
t.ok(global.localStorage.getItem(S.runKey()) === null, 'closeDungeon clears the mid-run save');
S.G = S.freshGame('campaign'); S.chooseBoss('dragon'); S.G.levelIdx = 9; S.saveRun();
S.G = S.freshGame('campaign'); S.chooseBoss('dragon');
t.ok(global.localStorage.getItem(S.runKey()) === null, 'starting a NEW run clears the stale save');
S.G = S.freshGame('campaign'); S.chooseBoss('dragon'); S.G.levelIdx = 9; S.saveRun();
S.G = S.freshGame('campaign'); S.G.tutorial = true; S.chooseBoss('dragon');
t.ok(!!global.localStorage.getItem(S.runKey()), 'a tutorial chooseBoss does NOT clear a real saved run');
S.gotoBuild(false);
t.ok(JSON.parse(global.localStorage.getItem(S.runKey())).levelIdx === 9, 'a tutorial gotoBuild never overwrites the real save');
S.clearRunSave();

// ── 🧬 mutation ladder: pick raises scoreMul + the hook bites ────────────────
S.G = S.freshGame('endless'); S.chooseBoss('dragon');
const mookSpec = { cls: 'warrior', power: 5, traits: [], debuff: { atkMul: 1, burn: 0, robbed: false } };
const hp0 = S.buildHeroFromSpec(mookSpec).maxHp;
S.gotoMutChoice(null);
t.ok(S.G.phase === 'mutate' && (S.overlay.innerHTML || '').includes('Realm Mutates'), 'the mutation draft opens');
S.G._mutChoices = ['vigor', 'haste', 'choir'];     // pin the choice
S.pickMut(0);
t.ok(S.G.muts.includes('vigor') && S.G.scoreMul === 1 + S.MUT_SCORE_STEP, 'a pick logs the mutation and raises the multiplier');
t.ok(S.G.phase === 'build', 'the draft falls through to build');
const hp1 = S.buildHeroFromSpec(mookSpec).maxHp;
t.ok(Math.abs(hp1 / hp0 - 1.08) < 0.02, `Thick Blood: heroes spawn with +8% HP (${hp0} → ${hp1})`);
// the 25-kill milestone chains mandate → mutation → build
S.G.mandateDue = true; S.G.mutDue = true; S.G.relicDue = 0; S.G.townDue = false;
S.afterReward();
t.ok(S.G.phase === 'mandate', 'the milestone fronts the mandate…');
S.pickMandate(0);
t.ok(S.G.phase === 'mutate', '…then chains into the mutation draft');
S.G._mutChoices = ['haste']; S.pickMut(0);
t.ok(S.G.phase === 'build' && Math.abs(S.G.scoreMul - (1 + 2 * S.MUT_SCORE_STEP)) < 1e-9, 'both picks land; the multiplier stacks');
// the board submit applies the multiplier: round(kills × scoreMul)
sentBody = null; S.G.totalSlain = 100; S.G.scoreMul = 1.45;
S.lbAutoSubmit();
t.ok(sentBody && sentBody.score === 145, 'endless board submit = round(kills × scoreMul)');

t.done();
