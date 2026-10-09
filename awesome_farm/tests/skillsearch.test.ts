// The skill tree's search: a name, a stat line, or anything a skill unlocks finds it; an empty search finds everything.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SKILL_LIST } from '../src/shared/data/skills';
import { searchSkills, skillMatches } from '../src/shared/data/skillsearch';

test('an empty search matches every skill, a nonsense one none', () => {
    assert.equal(searchSkills('').length, SKILL_LIST.length);
    assert.equal(searchSkills('   ').length, SKILL_LIST.length);
    assert.equal(searchSkills('zzzqqq').length, 0);
});

test('a skill is found by its name, case does not matter, every word must be there', () => {
    const n = SKILL_LIST[0];
    assert.ok(skillMatches(n, n.name.toUpperCase()));
    assert.ok(searchSkills(n.name.split(' ')[0]).some((m) => m.id === n.id));
    assert.ok(!skillMatches(n, `${n.name} zzzqqq`));
});

test('what a skill unlocks finds it: the Ballista leads to Siegeworks, the Archer Tower to Watchtowers', () => {
    const ballista = searchSkills('ballista').map((n) => n.id);
    assert.ok(ballista.includes('c_siege'), `Siegeworks unlocks the Ballista (${ballista.join(', ')})`);
    assert.ok(searchSkills('archer tower').map((n) => n.id).includes('c_towers'));
    assert.ok(searchSkills('tesla').map((n) => n.id).includes('c_siege'));
});
