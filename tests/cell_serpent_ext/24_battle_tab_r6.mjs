// Batch 6 battle tab: claimed gig rows say DONE only, the Rewards filter has a Hard-only mode, gig claims hold the pill until the flyers land.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { goalRowHTML } from '../../cell_serpent/battle_ui.js';
const claimed = goalRowHTML('Pop', 3, 3, 'REWARDX', 'claimed');
assert.ok(claimed.includes('DONE') && !claimed.includes('REWARDX'), 'claimed row hides the reward');
assert.ok(goalRowHTML('Pop', 1, 3, 'REWARDX', 'wait').includes('REWARDX'), 'waiting row shows the reward');
const html = fs.readFileSync(new URL('../../cell_serpent/index.html', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../../cell_serpent/main.js', import.meta.url), 'utf8');
assert.ok(html.includes('#stChips.rwhard') && html.includes('#claimGigs.rdy') && html.includes('@keyframes chpop'), 'css');
assert.ok(main.includes('rwMode === 2') && main.includes("classList.add('hasH')"), 'hard-only filter mode');
assert.ok(main.includes('const curHold') && main.includes('function gigFlies'), 'pill hold until landing');
assert.ok(!/—/.test(main + html), 'no em dash');
