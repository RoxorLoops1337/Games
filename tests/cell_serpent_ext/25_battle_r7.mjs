// Battle tab round 7: the ready-gigs chip on the Daily Quests strip and the gigs badge read claimable gigs, not only claimed ones.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const retain = readFileSync(join(root, 'retain_ui.js'), 'utf8'), main = readFileSync(join(root, 'main.js'), 'utf8'), html = readFileSync(join(root, 'index.html'), 'utf8');
assert.ok(/readyGigs/.test(retain) && /qGig/.test(retain), 'the quests strip shows a ready-gigs chip');
assert.ok(/rdy \+ ' READY'/.test(main), 'the gigs badge shows the ready count');
assert.ok(/pvKey === sel && t - pvLast/.test(main), 'a stage change repaints the preview at once');
assert.ok(/go-hit/.test(main) && /@keyframes gohit/.test(html), 'START has a press flash');
assert.ok(!/—/.test(retain + main), 'no em dash');
