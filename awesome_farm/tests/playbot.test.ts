// The pacing bot (scripts/playbot.ts) plays through real commands and walks for real. Here it only has to show it still can: the first
// three days of a world, with the first buildings, a market sale and a first skill. (The long runs are `npx tsx scripts/playbot.ts 30 a,b,c`.)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { play } from '../scripts/playbot';

test('the pacing bot gets through its first days: workbench, campfire, market, first levels and skills', () => {
    const r = play(3, 'bot');
    const done = (what: string) => r.firsts.some((f) => f.what === what);
    assert.ok(done('built workbench'), 'a workbench');
    assert.ok(done('built campfire'), 'a campfire');
    assert.ok(done('built market'), 'a market stall');
    assert.ok(r.firsts.some((f) => f.what.startsWith('skill ')), 'a skill learned');
    assert.ok(r.level >= 3, `level ${r.level}`);
    assert.ok(r.firsts.every((f) => Number.isFinite(f.at)));
});
