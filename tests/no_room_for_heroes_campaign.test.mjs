// Campaign wave caching: a wave is rolled exactly once per level, and an
// emptied queue (e.g. every hero corrupted into a minion) must NOT re-roll a
// fresh wave. Regression guard for the prepCampaignWave re-roll bug.
//
//   node tests/no_room_for_heroes_campaign.test.mjs   (or: npm run test:boss)
import { loadGame, harness } from './no_room_for_heroes_lib.mjs';

const A = loadGame(`freshGame,chooseBoss,prepCampaignWave,campLevel,BOSSES,
  campaignAdvance,skipDraft,SKIP_DRAFT_GOLD,startCampaign,gotoBossSelect,tutDoneSet,edictsIrrelevant,
  entityAt,stagedHeroX,afterReward,pickRelic,spawnGroup,faceTheKing,champSpec,
  WAVE_ARCHETYPES,WAVE_ARCH_MIN_LVL,get bannerMsg(){return bannerMsg;},
  get overlay(){return overlay;},get RUNES(){return RUNES;},set RUNES(v){RUNES=v;},
  get G(){return G;},set G(v){G=v;}`);
const t = harness('campaign waves');

A.G = A.freshGame('campaign');
A.chooseBoss(Object.keys(A.BOSSES)[0]);

// first call rolls the level's wave and tags it with the current level
A.prepCampaignWave();
const first = A.G.queue.length;
t.ok(first >= 1, `level 1 rolls a non-empty wave (${first})`);
t.ok(A.G.waveLevel === A.campLevel(), 'wave tagged with current campaign level');

// rolling again on the same level is a no-op (preview == actual spawn)
A.prepCampaignWave();
t.ok(A.G.queue.length === first, 'same-level re-call does not re-roll');

// corruption empties the wave for this level — it must STAY empty, not re-roll
A.G.queue.length = 0;
A.prepCampaignWave();
t.ok(A.G.queue.length === 0, 'emptied (corrupted) wave stays empty — no phantom re-roll');

// advancing the level forces a fresh roll
A.G.levelIdx = (A.G.levelIdx || 0) + 1;
A.prepCampaignWave();
t.ok(A.G.queue.length >= 1 && A.G.waveLevel === A.campLevel(), 'next level rolls a fresh wave');

// --- wave-before-draft: campaignAdvance pre-rolls the NEXT wave, so the Spoils
// --- screen can preview it ("Incoming next:") and the pick is a counter-pick ---
A.G = A.freshGame('campaign');
A.chooseBoss(Object.keys(A.BOSSES)[0]);
A.G.phase = 'run';
A.campaignAdvance();
t.ok(A.G.phase === 'reward', 'campaignAdvance lands on the draft');
t.ok(A.G.queue.length >= 1 && A.G.waveLevel === A.campLevel(), 'the NEXT wave is already rolled at draft time (tagged with the new level)');
const spoils = A.overlay.innerHTML || '';
t.ok(spoils.includes('Incoming next:'), 'the Spoils screen shows the incoming-wave strip');
t.ok((spoils.match(/⚔ \d+ dmg \/|❤️ \d+ · 🗡️ \d+|🔯 \+\d+%|💰 sells/g) || []).length >= 3,
  'every draft choice carries a compact stat line');
const rolled = A.G.queue;
A.prepCampaignWave();
t.ok(A.G.queue === rolled && A.G.queue.length === rolled.length, 'later prep calls are no-ops — preview stays == spawn');

// --- skip-draft pays scrap gold (labelled on the button) ---
t.ok(spoils.includes(`Skip draft (+${A.SKIP_DRAFT_GOLD}g)`), 'the skip button advertises its gold');
const gold0 = A.G.gold;
A.skipDraft();
t.ok(A.G.gold === gold0 + A.SKIP_DRAFT_GOLD, `skipping the draft pays +${A.SKIP_DRAFT_GOLD}g`);
t.ok(A.G.phase === 'build', 'skip still advances to the build phase');

// --- staged-hero hit-test shares the draw formula (tap what you see) ---
const nStaged = Math.min(A.G.queue.length, 9);
const hit = A.entityAt(A.stagedHeroX(0, nStaged));
t.ok(hit && hit.kind === 'queuehero' && hit.spec === A.G.queue[0], 'tapping a drawn staged hero returns its spec');

// --- edicts skip: a fresh profile (no points/ranks/ascension) goes straight to boss select ---
A.tutDoneSet();   // don't let the 0-kill profile get hijacked into the tutorial
A.RUNES = { points:0, ranks:{}, kills:0, bossXp:{}, best:0, asc:0, stats:{}, unlocked:{}, gf:1 };
A.startCampaign();
t.ok(A.G.phase === 'bossSelect', 'fresh profile: startCampaign skips the edicts screen');
const bs = A.overlay.innerHTML || '';
t.ok(bs.includes('Choose your Boss'), 'boss select rendered');
t.ok(bs.includes('gotoMenu()') && !bs.includes('gotoEdicts()'), 'its Back button returns to the menu, not the skipped screen');
// …but any rune progress (or a sworn edict) brings the screen back
A.RUNES.points = 5;
A.startCampaign();
t.ok(A.G.phase === 'edicts', 'with rune points, the edicts screen fronts the run again');
A.gotoBossSelect();
t.ok((A.overlay.innerHTML || '').includes('gotoEdicts()'), 'and boss select Backs to edicts as before');

// --- 🏺 relicDue is a COUNTER: champion + milestone relics queue up, not collapse ---
A.G = A.freshGame('campaign'); A.chooseBoss(Object.keys(A.BOSSES)[0]);
A.G.relicDue = 2; A.G.relics = [];
A.afterReward();
t.ok(A.G.phase === 'relic', 'first queued relic screen opens');
A.pickRelic(0);
t.ok(A.G.phase === 'relic', 'a SECOND relic screen follows immediately (counter, not boolean)');
A.pickRelic(0);
t.ok(A.G.phase === 'build', 'the drained counter falls through to build');
t.ok(A.G.relics.length === 2, 'both queued relics were claimed');
// boolean-truthiness compat: an old `true` flag still yields exactly one screen
A.G.relicDue = true;
A.afterReward();
t.ok(A.G.phase === 'relic' && A.G.relicDue === 0, 'a legacy boolean flag yields exactly one screen');
A.pickRelic(0);
t.ok(A.G.phase === 'build', '…and drains clean');

// --- 👑 endless: a champion NEVER spawns inside a group wave (queue look-ahead) ---
A.G = A.freshGame('endless'); A.chooseBoss(Object.keys(A.BOSSES)[0]);
const mook = () => ({cls:'warrior', power:2, traits:[], name:'Mook', rivalGen:0, debuff:{atkMul:1, burn:0, robbed:false}});
A.G.queue = [mook(), A.champSpec(), mook()];
A.spawnGroup(3);
t.ok(A.G.heroes.length === 1 && !A.G.heroes[0].champion, 'the wave stops BEFORE the mid-queue champion (no escorts)');
t.ok(A.G.queue[0] && A.G.queue[0].champion, 'the champion stays queued to lead the next wave');
A.spawnGroup(3);
t.ok(A.G.heroes.length === 1 && !!A.G.heroes[0].champion, 'the champion then raids ALONE');

// --- 👑 faceTheKing routes through gotoBuild: no stale siege state into the finale ---
A.G = A.freshGame('campaign'); A.chooseBoss(Object.keys(A.BOSSES)[0]);
A.G.levelIdx = 49; A.G.phase = 'win';
A.G.brokenCells = {2:true}; A.G.cells = [{index:0, _disarmT:3}];
A.G.queue = []; A.G.waveLevel = null;
A.faceTheKing();
t.ok(A.G.phase === 'build' && A.G.kingDue === true, 'faceTheKing lands in a real build phase with the King queued');
t.ok(Object.keys(A.G.brokenCells || {}).length === 0, 'smashed doorways are patched for the finale');
t.ok(A.G.cells[0]._disarmT === 0, 'stale disarm timers are cleared');
t.ok(A.G.queue.length === 0, 'no phantom wave is rolled over the King (prepCampaignWave defers to him)');

// --- 🎭 wave archetypes: named compositions reshape regular waves from L8 ---
// compose() alone: THE HEIST turns the party into fast, frail rogues
{
  const specs = [1,2,3,4].map(() => ({cls:'warrior', power:5, traits:[], debuff:{atkMul:1, burn:0, robbed:false}}));
  A.WAVE_ARCHETYPES.find(a => a.id === 'heist').compose(specs);
  t.ok(specs.every(s => s.cls === 'rogue'), 'THE HEIST composes an all-rogue crew');
  t.ok(specs.every(s => s.hpMul < 1 && s.spdMul > 1), 'heist rogues trade HP for speed (budget-neutral)');
}
// forced roll through prepCampaignWave (Math.random->0 passes the 35% gate and picks idx 0 = heist)
A.G = A.freshGame('campaign'); A.chooseBoss(Object.keys(A.BOSSES)[0]);
const _rand = Math.random;
Math.random = () => 0;
A.G.levelIdx = 8;                                   // L9 — a regular wave inside archetype range
A.G.waveLevel = null; A.G.queue = [];
A.prepCampaignWave();
t.ok(A.G.waveArchetype && A.G.waveArchetype.id === 'heist', 'a forced roll stamps G.waveArchetype');
t.ok(A.G.queue.length > 0 && A.G.queue.every(s => s.cls === 'rogue'), 'the CACHED wave is reshaped (preview == spawn)');
// the banner fires when the wave actually starts, and the party matches
A.G.phase = 'build';
A.spawnGroup(2);
t.ok(A.G.heroes.length > 0 && A.G.heroes.every(h => h.cls === 'rogue'), 'the spawned party matches the archetype');
t.ok(((A.bannerMsg && A.bannerMsg.text) || '').includes('HEIST'), 'the archetype name banners at wave start');
// never on a milestone (champion) wave — even with the roll forced
A.G.levelIdx = 9;                                   // L10 — milestone
A.G.waveLevel = null; A.G.queue = [];
A.prepCampaignWave();
t.ok(!A.G.waveArchetype, 'milestone waves never roll an archetype');
t.ok(A.G.queue.some(s => s.champion), '(sanity) the milestone wave still carries its champion');
// below the level floor: no archetype either
A.G.levelIdx = A.WAVE_ARCH_MIN_LVL - 5;             // well under the floor
A.G.waveLevel = null; A.G.queue = [];
A.prepCampaignWave();
t.ok(!A.G.waveArchetype, 'early levels (< L'+A.WAVE_ARCH_MIN_LVL+') stay archetype-free');
Math.random = _rand;

// --- champion doorway smash: once per cell per wave, patched up in build ---
const B = loadGame(`freshGame,smashDoorway,cellArt,get G(){return G;},set G(v){G=v;}`);
B.G = B.freshGame('campaign');
const cell = { index: 2, x0: 400, kind: 'room' };
B.smashDoorway({ champion: 'paladin' }, cell);
t.ok(B.G.brokenCells && B.G.brokenCells[2] === true, 'champion smash marks the cell broken');
const before = Object.keys(B.G.brokenCells).length;
B.smashDoorway({ champion: 'paladin' }, cell);
t.ok(Object.keys(B.G.brokenCells).length === before, 'second pass through the same doorway is a no-op');
t.ok(typeof B.cellArt === 'function', 'cellArt selector exists (falls back to normal art without _broken.png)');

t.done();
