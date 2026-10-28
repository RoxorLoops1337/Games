// Stacking Cats: RELICS. Run-wide rules that reward a way of building: a kind of cat, a place in the tower, the start of a wave.
import assert from 'node:assert/strict';
import {
  newGame, addCat, calcMods, cfx, explainMods, startWave, step, DT, hurtEnemy, makeEnemy, killEnemy, hurtCat, finishWave, aliveCats, swapCats,
  rollEvent, chooseEvent, takeRelic, rollRelicChoices, relicWho, catMaxHp, FX_KEYS,
} from '../stacking_cats/sim.js';
import { COIN, EVENTS } from '../stacking_cats/cats.js';
import { RELICS, SHADY_RELICS, ALL_RELICS, RELIC_BY_ID, RELIC_THEMES, THEME_TAG, relicLines, EARLY_BIRD, FIRST_KILL, DEAL_CATCH, NEST_RELIC_EVERY } from '../stacking_cats/relics.js';
import { hasIcon } from '../stacking_cats/art_icons.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const ALL = ['tabby', 'ember', 'sparky', 'buckshot', 'mochi', 'yuki', 'merlin', 'gizmo', 'sprout', 'shadow'];
const game = (cats, relics = [], seed = 7) => {
  const g = newGame({ seed, unlocked: ALL });
  for (const id of cats) addCat(g, id);
  for (const r of relics) g.relics.push(r);
  g.mods = calcMods(g);
  return g;
};
const fx = (g, i) => cfx(calcMods(g), g.cats[i]);

t('relic data: unique ids, drawn icons, one clear job each, valid effect keys, and numbers that match the text', () => {
  assert.ok(RELICS.length >= 24, 'a good set of relics: ' + RELICS.length);
  const ids = new Set();
  for (const r of ALL_RELICS) {
    assert.ok(!ids.has(r.id), 'duplicate ' + r.id); ids.add(r.id);
    assert.ok(r.name && r.icon && hasIcon(r.icon), r.id + ' has a name and a drawn icon');
    assert.ok(RELIC_THEMES[r.theme], r.id + ' theme');
    const kinds = ['tagFx', 'posFx', 'allFx', 'team', 'scale', 'variety', 'matching', 'rule'].filter((k) => r[k] != null);
    assert.equal(kinds.length, 1, `${r.id} does one thing: ${kinds}`);
    for (const f of [r.tagFx && r.tagFx.fx, r.posFx && r.posFx.fx, r.allFx]) if (f) for (const k of Object.keys(f)) assert.ok(FX_KEYS.includes(k), `${r.id}: unknown effect ${k}`);
    if (r.team) assert.ok(r.cost && Object.keys(r.cost).length, r.id + ' a Shady relic has a price');
  }
  // every percentage in a description comes from the relic's own numbers (or the rule constants)
  const vals = (r) => {
    const v = new Set();
    const add = (o) => { for (const k in o) v.add(Math.round(o[k] * 100)); };
    for (const f of [r.tagFx && r.tagFx.fx, r.posFx && r.posFx.fx, r.allFx, r.team, r.rule]) if (f) add(f);
    if (r.variety) v.add(Math.round(r.variety * 100)); if (r.matching) v.add(Math.round(r.matching * 100)); if (r.scale) v.add(Math.round(r.scale.per * 100));
    if (r.rule && r.rule.early) { v.add(Math.round(EARLY_BIRD.haste * 100)); }
    if (r.rule && r.rule.firstKill) v.add(Math.round(FIRST_KILL.heal * 100));
    return v;
  };
  const CONSTANT = {};
  for (const r of RELICS) for (const m of (r.desc || '').matchAll(/(\d+)%/g)) assert.ok(vals(r).has(+m[1]) || (CONSTANT[r.id] || []).includes(+m[1]), `${r.id}: "${r.desc}" says ${m[1]}% but the data does not`);
  assert.ok(/3 times/.test(RELIC_BY_ID.bell.desc) && RELIC_BY_ID.bell.rule.firstHit === 2, 'the bell text says 3 times, the rule adds 2 on top of the normal hit');
  assert.ok(/4 times the coins/.test(RELIC_BY_ID.cookie.desc) && FIRST_KILL.coins === 4);
  assert.ok(/10 seconds/.test(RELIC_BY_ID.bird.desc) && EARLY_BIRD.t === 10);
});

t('a kind of cat: Lightning Rod and Thunder Drum help Lightning cats only; Ember Heart helps Fire cats only', () => {
  const g = game(['tabby', 'sparky', 'ember', 'yuki'], ['rod', 'thunder', 'heart']);
  const f = (id) => fx(g, g.cats.findIndex((c) => c.id === id));
  assert.equal(f('sparky').extra, 1); assert.equal(f('yuki').extra, 1); assert.equal(f('tabby').extra, 0); assert.equal(f('ember').extra, 0);
  assert.ok(f('sparky').haste >= 0.25 && f('sparky').stun >= 0.25 && f('tabby').stun === 0);
  assert.ok(f('ember').dmg >= 0.15 && f('sparky').dmg < 0.15 && f('tabby').dmg < 0.15);
});

t('the place in the tower: the bottom, top and middle cats get their own bonuses, and it moves when the tower is rearranged or a cat falls', () => {
  const g = game(['mochi', 'tabby', 'sparky', 'ember'], ['bulwark', 'peak', 'medal']);   // bottom to top
  const id = (i) => g.cats[i].id, dr = (i) => fx(g, i).dr, dmg = (i) => fx(g, i).dmg;
  assert.ok(dr(0) >= 0.25 && dr(1) < 0.25 && dr(3) < 0.25, 'only the bottom cat');
  assert.ok(dmg(3) - dmg(0) >= 0.25, 'the top cat deals more');
  assert.ok(dmg(1) >= 0.3 && dmg(2) >= 0.3 && fx(g, 1).haste >= 0.15 && fx(g, 3).haste < 0.15, 'the middle cats');
  swapCats(g, g.cats[0].uid, g.cats[3].uid);   // ember to the bottom, mochi to the top
  assert.equal(id(0), 'ember'); assert.ok(dr(0) >= 0.25 && dr(3) < 0.25 && dmg(3) - dmg(0) >= 0.25, 'the bonus follows the position');
  g.cats[0].ko = true;   // the bottom cat falls: the next cat up is now the one that gets bitten
  assert.ok(dr(1) >= 0.25 && dr(2) < 0.25, 'the new bottom cat gets the bulwark');
  const solo = game(['tabby'], ['bulwark', 'peak']);
  assert.ok(fx(solo, 0).dr >= 0.25 && fx(solo, 0).dmg >= 0.3, 'a single cat is both the bottom and the top');
});

t('bottom relics change how the bottom cat takes bites: Bulwark Banner, Anchor Stone, Thorn Mail', () => {
  const g = game(['mochi', 'tabby'], []), h = game(['mochi', 'tabby'], ['bulwark', 'anchor', 'thorn']);
  assert.ok(catMaxHp(h, h.cats[0]) > catMaxHp(g, g.cats[0]) * 1.35 && catMaxHp(h, h.cats[1]) === catMaxHp(g, g.cats[1]));
  const bite = (x) => { const c = x.cats[0], before = c.hp; hurtCat(x, c, 100); return before - c.hp; };
  assert.ok(bite(h) < bite(g) * 0.8, 'the banner softens the bite');
  assert.equal(fx(h, 0).thorns, 0.8); assert.equal(fx(h, 1).thorns, 0);
});

t('Shield Oath, Kindling and Last Stand Flag reach every cat', () => {
  const g = game(['tabby', 'sparky', 'ember'], ['oath', 'kindle', 'flag']);
  for (let i = 0; i < 3; i++) { const f = fx(g, i); assert.ok(f.shield === 0.1 && f.burn === 1 && f.berserk === 0.5, 'cat ' + i); }
  startWave(g);
  for (const c of g.cats) assert.ok(Math.abs(c.shd - catMaxHp(g, c) * 0.1) < 1, 'a shield of 10% at the start of the wave');
  const e = makeEnemy(g, 'mouse', 1, { x: 400 }); e.hp = e.maxHp = 1e6; g.enemies.push(e); g.curCat = g.cats[0];
  hurtEnemy(g, e, 10, {}); g.curCat = null;
  assert.ok(e.burn, 'a hit sets the mouse on fire');
});

t('the first of the wave: Opening Bell hits once for 3 times, and starts over every wave', () => {
  const g = game(['tabby'], ['bell']);
  startWave(g);
  const e = makeEnemy(g, 'mouse', 1, { x: 400 }); e.hp = e.maxHp = 1e9; e.armor = 0; g.enemies.push(e); g.curCat = g.cats[0];
  const a = hurtEnemy(g, e, 10, {}), b = hurtEnemy(g, e, 10, {});
  assert.ok(Math.abs(a / b - 3) < 1e-9, `first ${a} then ${b}`);
  assert.equal(hurtEnemy(g, e, 10, { tick: true }), b, 'ticks never use up the bell');
  g.curCat = null; g.enemies = []; g.state = 'fight'; finishWave(g); startWave(g);
  const e2 = makeEnemy(g, 'mouse', 1, { x: 400 }); e2.hp = e2.maxHp = 1e9; e2.armor = 0; g.enemies.push(e2); g.curCat = g.cats[0];
  assert.ok(Math.abs(hurtEnemy(g, e2, 10, {}) / b - 3) < 1e-9, 'the next wave has a new first hit');
});

t('the first of the wave: First Treat pays 4 times the coins and heals once; Fresh Claws crits each cat once; Early Bird fades after 10 seconds', () => {
  const g = game(['tabby', 'ember'], ['cookie']);
  startWave(g);
  g.cats[0].hp = catMaxHp(g, g.cats[0]) * 0.5;
  const e = makeEnemy(g, 'mouse', 1, { x: 400 }), f = makeEnemy(g, 'mouse', 1, { x: 420 }); g.enemies.push(e, f);
  const c0 = g.run.coins; g.curCat = g.cats[0]; killEnemy(g, e, true); const one = g.run.coins - c0; const c1 = g.run.coins; killEnemy(g, f, true); const two = g.run.coins - c1; g.curCat = null;
  assert.ok(one > two * 3.5 && one < two * 4.5, `4x coins for the first, then normal (${one} vs ${two})`);
  assert.ok(g.cats[0].hp > catMaxHp(g, g.cats[0]) * 0.5 + 1, 'the team is healed a little');
  const h = game(['tabby'], ['claws']); startWave(h);
  assert.ok(h.cats[0].fresh === true, 'a fresh cat at the start of the wave');
  h.enemies.push(makeEnemy(h, 'mouse', 1, { x: 260 })); h.state = 'fight'; h.queue = []; h.spawnLeft = 0;
  let firstCrit = null, seen = 0;
  for (let i = 0; i < 90 && seen < 2; i++) { step(h, DT); for (const ev of h.ev) if (ev.k === 'dmg' && !ev.dot) { seen++; if (firstCrit === null) firstCrit = !!ev.crit; } h.ev.length = 0; }
  assert.equal(firstCrit, true, 'the first attack of the wave is a critical hit');
  const b = game(['tabby'], ['bird']); startWave(b);
  assert.ok(calcMods(b).haste - calcMods(game(['tabby'])).haste >= EARLY_BIRD.haste - 1e-9, 'fast at the start');
  b.waveT = EARLY_BIRD.t + 0.1;
  assert.ok(Math.abs(calcMods(b).haste - calcMods(game(['tabby'])).haste) < 1e-9, 'normal after 10 seconds');
});

t('fire and lightning rules: burning mice take more and explode, stunned mice take more', () => {
  const g = game(['ember'], ['scorch', 'cloak']);
  const e = makeEnemy(g, 'mouse', 1, { x: 400 }); e.hp = e.maxHp = 1e9; e.armor = 0; g.enemies.push(e); g.curCat = g.cats[0];
  const base = hurtEnemy(g, e, 10, { tick: true });
  e.burn = { dps: 1, t: 2, owner: 0 }; const burning = hurtEnemy(g, e, 10, { tick: true });
  assert.ok(Math.abs(burning / base - 1.15) < 1e-9, 'burning: +15%');
  e.burn = null; e.stun = 1; assert.ok(Math.abs(hurtEnemy(g, e, 10, { tick: true }) / base - 1.35) < 1e-9, 'stunned: +35%');
  const b = game(['ember'], ['cinder']); b.curCat = b.cats[0];
  const dead = makeEnemy(b, 'mouse', 1, { x: 400 }), near = makeEnemy(b, 'mouse', 1, { x: 430 }); near.hp = near.maxHp = 1e9; dead.hp = dead.maxHp = 100;
  b.enemies.push(dead, near); dead.burn = { dps: 1, t: 2, owner: 0 }; const hp0 = near.hp;
  killEnemy(b, dead, true);
  assert.ok(near.hp < hp0 - 5, 'the burning mouse blew up the one next to it: ' + (hp0 - near.hp));
  const calm = makeEnemy(b, 'mouse', 1, { x: 400 }); calm.hp = calm.maxHp = 100; b.enemies.push(calm); const hp1 = near.hp;
  killEnemy(b, calm, true); assert.equal(near.hp, hp1, 'a mouse that is not burning does not explode');
});

t('scaling relics: Spare Parts per Tech cat, Cheer Pennant per Cheer cat, Collector\'s Badge per kind, Matching Scarves for pairs', () => {
  const dmg0 = (cats, rel) => calcMods(game(cats, rel)).dmg - calcMods(game(cats, [])).dmg;
  assert.ok(Math.abs(dmg0(['gizmo', 'tabby'], ['parts']) - 0.08) < 1e-9, 'one Tech cat');
  assert.ok(dmg0(['tabby', 'ember'], ['parts']) === 0, 'no Tech cat, no bonus');
  const heal = (cats) => calcMods(game(cats, ['pennant'])).regenTeam - calcMods(game(cats, [])).regenTeam;
  assert.ok(Math.abs(heal(['sprout']) - 0.01) < 1e-9 && heal(['tabby']) === 0);
  assert.ok(Math.abs(dmg0(['tabby', 'ember', 'sparky', 'mochi'], ['badge']) - 0.12) < 1e-9, 'four different kinds');
  assert.ok(dmg0(['tabby', 'tabby'], ['badge']) <= 0.03 + 1e-9, 'the same kind twice is one kind');
  const g = game(['tabby', 'shadow', 'ember'], ['scarf']);   // tabby and shadow are both Blade
  assert.ok(fx(g, 0).dmg >= 0.15 && fx(g, 1).dmg >= 0.15 && fx(g, 2).dmg < 0.15, 'only the cats that have a partner');
});

t('after a nest you pick one of three relics: different, not owned, one that fits your cats and one about the tower', () => {
  for (let seed = 1; seed < 60; seed++) {
    const g = game(['sparky', 'ember', 'mochi'], seed % 3 ? ['rod'] : [], seed);
    const ids = rollRelicChoices(g);
    assert.equal(ids.length, 3); assert.equal(new Set(ids).size, 3);
    for (const id of ids) { assert.ok(RELICS.some((r) => r.id === id), id + ' is a normal relic'); assert.ok(!g.relics.includes(id), 'not one you own'); }
    const about = (id) => { const r = RELIC_BY_ID[id]; return (r.tagFx && r.tagFx.tag) || (r.scale && r.scale.tag) || THEME_TAG[r.theme] || null; };
    assert.ok(ids.some((id) => ['storm', 'fire', 'guardian'].includes(about(id))), 'one for a kind of cat in the tower: ' + ids);
    assert.ok(ids.some((id) => !about(id)), 'one about the tower or the start of a wave');
  }
  const a = rollRelicChoices(game(['sparky', 'ember'], [], 5)), b = rollRelicChoices(game(['sparky', 'ember'], [], 5));
  assert.deepEqual(a, b, 'the same seed offers the same relics');
  const all = game(['tabby'], RELICS.map((r) => r.id).slice(0, RELICS.length - 1)); assert.equal(rollRelicChoices(all).length, 1, 'when few are left it offers what is left');
});

t('the reward after the first, fourth and seventh nest includes a relic in place of the snack, the others do not', () => {
  assert.equal(NEST_RELIC_EVERY, 3);
  for (const [kills, want] of [[1, true], [2, false], [3, false], [4, true], [5, false], [7, true]]) {
    const g = game(['tabby']); g.bossWave = true; g.wave = 5 * kills; g.run.bossKills = kills; g.state = 'fight'; g.enemies = []; g.queue = [];
    finishWave(g);
    assert.equal(g.reward.includes('relic'), want, `after nest ${kills}: ${g.reward}`);
    assert.equal(g.reward.includes('snack'), !want, 'a relic takes the snack\'s place');
    if (want) assert.ok(g.reward.indexOf('relic') === g.reward.indexOf('cat') + 1, 'the relic comes right after the freed cat');
  }
  const g = game(['tabby']); g.bossWave = false; g.run.bossKills = 1; g.state = 'fight'; g.enemies = []; g.queue = []; finishWave(g);
  assert.ok(!g.reward.includes('relic'), 'a normal wave never offers one');
});

t('relicWho names the cats a relic is helping, or says what is missing', () => {
  const g = game(['mochi', 'sparky', 'ember']);
  assert.match(relicWho(g, RELIC_BY_ID.rod), /Sparky/);
  assert.match(relicWho(g, RELIC_BY_ID.quiver), /No Guns cats|No Guns cat|Free one/);
  assert.match(relicWho(g, RELIC_BY_ID.bulwark), /Mochi/);
  assert.match(relicWho(g, RELIC_BY_ID.peak), /Ember/);
  assert.match(relicWho(g, RELIC_BY_ID.medal), /Sparky/);
  assert.match(relicWho(game(['tabby', 'ember']), RELIC_BY_ID.medal), /3 cats/);
  assert.match(relicWho(g, RELIC_BY_ID.bell), /whole team/);
});

t('the Shady Deal sells relics: one that fits your cats with a catch, and two Shady relics with a price; Leave is always there', () => {
  assert.ok(EVENTS.find((e) => e.id === 'deal').desc.includes('relics'));
  let seen = 0;
  for (let seed = 1; seed < 400 && seen < 5; seed++) {
    const g = game(['sparky', 'ember', 'mochi'], [], seed);
    for (let w = 3; w < 60; w += 3) {
      g.event = null; g.wave = w; g.bossWave = false;
      const ev = rollEvent(g);
      if (ev && ev.id === 'deal') {
        seen++;
        const rel = ev.options.filter((o) => o.k === 'relic');
        assert.equal(rel.length, 3); assert.equal(new Set(rel.map((o) => o.id)).size, 3);
        assert.ok(rel[0].catch === DEAL_CATCH && !SHADY_RELICS.some((r) => r.id === rel[0].id), 'the first is a normal relic with a catch');
        assert.ok(rel.slice(1).every((o) => SHADY_RELICS.some((r) => r.id === o.id) && !o.catch), 'the other two are Shady relics');
        assert.equal(ev.options.at(-1).k, 'leave');
        const hurt = g.hurtMul, r0 = RELIC_BY_ID[rel[0].id];
        assert.ok(chooseEvent(g, 0).ok && g.relics.includes(r0.id) && Math.abs(g.hurtMul - hurt * (1 + DEAL_CATCH)) < 1e-9, 'the catch is paid');
        break;
      }
    }
  }
  assert.ok(seen >= 3, 'deals came up in the test seeds');
});

t('every Shady relic has a boon worth more than its price, text built from the numbers, and shows in the Team stats rows that add up', () => {
  const good = { dmg: 1, haste: 1, hp: 1, crit: 1, critMul: 0.5, dr: 1.5, curse: 1, waveHeal: 1, snackMul: 0.6, coin: 1, range: 0.7 };
  for (const r of SHADY_RELICS) {
    const boon = Object.entries(r.team).reduce((a, [k, v]) => a + v * good[k], 0);
    const price = Object.entries(r.cost).reduce((a, [k, v]) => a + (k === 'hurt' ? v * 1.3 : -v * good[k]), 0);
    assert.ok(boon > price * 1.05, `${r.id}: boon ${boon.toFixed(3)} should beat price ${price.toFixed(3)}`);
    const ln = relicLines(r);
    for (const l of ln.boon.concat(ln.cost)) assert.ok(/\d+%/.test(l), l);
    for (const [k, v] of Object.entries(r.team)) assert.ok(ln.boon.some((l) => l.includes(`${Math.round(v * 100)}%`)), `${r.id} boon text for ${k}`);
    const g = game(['tabby', 'ember'], []), before = calcMods(g), hurt0 = g.hurtMul;
    assert.ok(takeRelic(g, r.id)); assert.ok(!takeRelic(g, r.id), 'only once');
    const after = calcMods(g), rows = explainMods(g);
    for (const [k, v] of Object.entries(r.team)) assert.ok(Math.abs(after[k] - before[k] - v) < 1e-9, `${r.id}: boon ${k}`);
    for (const [k, v] of Object.entries(r.cost)) { if (k === 'hurt') assert.ok(Math.abs(g.hurtMul - hurt0 * (1 + v)) < 1e-9); else assert.ok(Math.abs(after[k] - before[k] - v) < 1e-9, `${r.id}: price ${k}`); }
    for (const k of ['dmg', 'haste', 'hp', 'curse', 'dr']) assert.ok(Math.abs((rows[k] || []).reduce((a, x) => a + x.v, 0) - after[k]) < 1e-9, `${r.id}: ${k} rows add up`);
    for (const k of [...Object.keys(r.team), ...Object.keys(r.cost)].filter((k) => k !== 'hurt')) assert.ok(rows[k] && rows[k].some((x) => x.label === r.name), `${r.id} row ${k}`);
  }
});

t('team relics add to the Team stats rows too, so the breakdown still adds up', () => {
  const g = game(['gizmo', 'tabby', 'sprout', 'ember'], ['parts', 'badge', 'pennant', 'bird']);
  const m = calcMods(g), rows = explainMods(g), sum = (k) => (rows[k] || []).reduce((a, r) => a + r.v, 0);
  for (const k of ['dmg', 'haste', 'hp', 'curse', 'dr']) assert.ok(Math.abs(sum(k) - m[k]) < 1e-9, `${k}: rows ${sum(k)} vs ${m[k]}`);
  assert.ok(rows.dmg.some((r) => r.label === 'Spare Parts') && rows.dmg.some((r) => r.label === "Collector's Badge") && rows.haste.some((r) => /Early Bird/.test(r.label)));
});

t('a relic that costs health never kills a cat, and taking a relic keeps health in step', () => {
  const g = game(['tabby'], []);
  const mx0 = catMaxHp(g, g.cats[0]); g.cats[0].hp = mx0;
  takeRelic(g, 'fang');
  assert.ok(catMaxHp(g, g.cats[0]) < mx0 && g.cats[0].hp <= catMaxHp(g, g.cats[0]) && g.cats[0].hp > 0);
  assert.equal(g.run.relics, 1);
});

t('whole runs with relics never produce NaN or throw (a seeded fuzz over every relic)', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const g = game(['tabby', 'sparky', 'ember', 'mochi', 'gizmo'], ALL_RELICS.map((r) => r.id).filter((_, i) => (i + seed) % 3 === 0), seed);
    for (let w = 1; w <= 3; w++) {
      startWave(g);
      for (let i = 0; i < 30 * 40 && g.state !== 'clear' && g.state !== 'over'; i++) { step(g, DT); g.ev.length = 0; if (g.t > 1e6) break; }
      if (g.state === 'over') break;
      if (g.state === 'clear') finishWave(g);
    }
    for (const c of g.cats) assert.ok(Number.isFinite(c.hp), `hp ${c.hp}`);
    const m = calcMods(g); for (const k of ['dmg', 'haste', 'hp', 'crit', 'dr', 'range', 'coin']) assert.ok(Number.isFinite(m[k]), k);
  }
});

console.log(n + ' tests passed');
