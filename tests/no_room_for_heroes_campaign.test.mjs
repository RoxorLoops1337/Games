// Campaign wave caching: a wave is rolled exactly once per level, and an
// emptied queue (e.g. every hero corrupted into a minion) must NOT re-roll a
// fresh wave. Regression guard for the prepCampaignWave re-roll bug.
//
//   node tests/no_room_for_heroes_campaign.test.mjs   (or: npm run test:boss)
import { loadGame, harness } from './no_room_for_heroes_lib.mjs';

const A = loadGame(`freshGame,chooseBoss,prepCampaignWave,campLevel,BOSSES,
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
