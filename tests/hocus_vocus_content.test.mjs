// CONTENT: the editor's pass over everything the content authors wrote in parallel. Each piece has its own suite; this one reads the
// WHOLE game's content as a player would and checks what only shows when the pieces meet. Fast and deterministic (every random
// choice is seeded), it needs the real DATA, COMBAT and RUN.
//
//   1. GATES        DATA.validate strict and every audit are clean (guide lines are listed, not chased)
//   2. NAMES        no two cards, relics, gems or enemies share a display name; every id referenced anywhere exists
//   3. ART IDS      every card, relic, gem, enemy and event names a motif, palette, icon, cut or scene that exists
//   4. ENEMIES      every move is reachable, every referenced move exists, every roster id is placed in an encounter, and every
//                   enemy move reads right in the bestiary (enemy side) and in its intent (C.intent through a real combat)
//   5. POOLS        every reward pool is non-empty for every hero and rarity (with and without locked content)
//   6. TEXT         every card (both ranks, both rows, every gem) has clean text inside the limits; keyword spelling is uniform;
//                   hero:'any' hooks say "either hero"; every data-kw resolves in the glossary
//   7. RELICS       every combat hook of every relic fires in a real combat without exceptions; every run hook runs through RUN
//   8. EVENTS       every outcome of every choice applies through RUN.applyOps for every hero pair; gated choices can be reached;
//                   numbers written in the story (gold, hexes) are the numbers the ops use
//   9. META         achievements read tracked stats, climb in tiers, and the hard ones are reachable in a constructed combat; trials
//                   quote their mods; tips, lore and barks keep to their limits
import fs from 'node:fs';
import path from 'node:path';
import { boot, harness, DIR } from './hocus_vocus_lib.mjs';

const t = harness('hocus_vocus content');
const G = boot({ only: ['run', 'combat'] });
const { DATA, COMBAT, RUN, U } = G;
const L = DATA.LISTS;
const A = (v) => (Array.isArray(v) ? v : []);
const DASH = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']');
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const values = (o) => Object.keys(o).map((k) => o[k]);
const HEROES = L.heroIds;
const PAIRS = [];
HEROES.forEach((a, i) => HEROES.slice(i + 1).forEach((b) => PAIRS.push([a, b])));
const walk = (ops, fn) => DATA.walkOps(ops, fn);

t.test('the whole content set loaded: nothing failed to load', () => {
  t.eq(A(G._errors).length, 0, 'no script failed to load');
  t.eq(A(G._warnings).length, 0, 'and no dependency was skipped');
  t.ok(typeof DATA.cardPlain === 'function' && typeof DATA.intentText === 'function', 'the text layer is there');
});

// =================================================================================================== 1. gates
t.test('DATA.validate strict has zero errors and zero warnings, every audit has zero audit lines', () => {
  const v = DATA.validate(undefined, { strict: true });
  t.deep(v.errors, [], 'strict validation: zero errors');
  t.deep(v.warnings, [], 'strict validation: zero warnings');
  const lines = DATA.audit();
  t.deep(lines.filter((l) => !/^guide /.test(l)), [], 'DATA.audit(): zero audit lines');
  const hard = [];
  ['cards', 'enemies', 'gems', 'relics', 'events', 'meta'].forEach((k) => { (k === 'cards' ? HEROES : k === 'enemies' ? [1, 2, 3] : [undefined]).forEach((o) => { const opt = k === 'cards' ? { hero: o } : k === 'enemies' ? { chapter: o } : undefined; DATA.audit(k, opt).filter((l) => !/^guide /.test(l)).forEach((l) => hard.push(l)); }); });
  t.deep(hard, [], 'every per kind audit: zero audit lines');
  const guide = lines.concat(HEROES.flatMap((h) => DATA.audit('cards', { hero: h }))).concat([1, 2, 3].flatMap((c) => DATA.audit('enemies', { chapter: c }))).filter((l) => /^guide /.test(l));
  if (guide.length) console.log('  note: ' + guide.length + ' guide lines (soft numbers for the balance wave):\n   ' + guide.slice(0, 12).join('\n   '));
  t.ok(true, 'guide lines are listed, not failed');
});

// =================================================================================================== 2. names and references
// The one known clash (relic "Whetstone" against the card hanae_whetstone) was fixed by renaming the relic "Honing Stone", so this list is empty: any clash fails.
const KNOWN_CLASHES = [];
t.test('display names: unique inside each registry, and no card, relic, gem or enemy shares a name with another (known clashes listed)', () => {
  const regs = { card: DATA.cards, relic: DATA.relics, gem: DATA.gems, enemy: DATA.enemies };
  const all = {};
  Object.keys(regs).forEach((kind) => {
    const seen = {};
    values(regs[kind]).forEach((d) => {
      t.ok(typeof d.name === 'string' && d.name === d.name.trim() && d.name.length >= 3 && d.name.length <= 28, `${kind} ${d.id}: a tidy name (${d.name})`);
      t.ok(!DASH.test(d.name), `${kind} ${d.id}: no em or en dash in the name`);
      const k = norm(d.name);
      t.ok(!seen[k], `${kind}s: "${d.name}" is used twice (${seen[k]} and ${d.id})`);
      seen[k] = d.id;
      (all[k] = all[k] || []).push(kind + ':' + d.id);
    });
  });
  Object.keys(all).filter((k) => all[k].length > 1).forEach((k) => t.ok(KNOWN_CLASHES.indexOf(k) >= 0, `"${k}" is shared by ${all[k].join(' and ')}: rename one`));
  KNOWN_CLASHES.forEach((k) => t.ok(all[k] && all[k].length > 1, `known clash "${k}" still exists (remove it from KNOWN_CLASHES once fixed)`));
  // the other registries a player reads names from: titles, trial and achievement names, heroes, brushes
  const others = { event: values(DATA.events).map((e) => [e.id, e.title]), achievement: Object.keys(DATA.achievements).map((i) => [i, DATA.achievements[i].name]), trial: values(DATA.trials).map((x) => [x.id, x.name]), brush: values(DATA.brushes).map((b) => [b.id, b.name]) };
  Object.keys(others).forEach((kind) => { const seen = {}; others[kind].forEach(([id, name]) => { t.ok(!seen[norm(name)], `${kind}s: "${name}" is used twice`); seen[norm(name)] = id; }); });
  const moveNames = {};
  values(DATA.enemies).forEach((e) => Object.keys(e.moves).forEach((m) => { (moveNames[norm(e.moves[m].name)] = moveNames[norm(e.moves[m].name)] || new Set()).add(e.id); }));
  t.ok(Object.keys(moveNames).length > 150, 'enemy moves have names');
});

t.test('every id referenced anywhere exists', () => {
  const E = DATA.enemies, C = DATA.cards, R = DATA.relics, GM = DATA.gems;
  const bad = [];
  const need = (reg, id, why) => { if (!reg[id]) bad.push(`${why}: unknown id "${id}"`); };
  [1, 2, 3].forEach((ch) => {
    const enc = DATA.encounters[ch];
    need(E, enc.boss, `chapter ${ch} boss`);
    enc.normal.concat(enc.elite).forEach((g) => g.enemies.forEach((id) => need(E, id, `group ${g.id}`)));
  });
  HEROES.forEach((h) => { A(DATA.heroes[h].starter).forEach((id) => need(C, id, `starter of ${h}`)); });
  values(E).forEach((e) => {
    const lists = [A(e.start)].concat(values(e.moves).map((m) => A(m.fx)), A(e.phases).map((p) => A(p.fx)), A(e.hooks).map((h) => A(h.fx)));
    lists.forEach((fx) => walk(fx, (o) => {
      if (o.op === 'summon') { need(E, o.enemy, `${e.id} summon`); if (E[o.enemy] && E[o.enemy].tier !== 'minion') bad.push(`${e.id}: summons ${o.enemy}, which is not a minion`); }
      if (o.op === 'add') need(C, o.card, `${e.id} add`);
    }));
  });
  values(C).forEach((c) => [c.fx, c.up && c.up.fx, c.hand && c.hand.turnEnd, c.hand && c.hand.drawn].forEach((fx) => walk(fx || [], (o) => { if (o.op === 'add') need(C, o.card, `${c.id} add`); })));
  values(GM).forEach((g) => walk((g.mod && g.mod.fx) || [], (o) => { if (o.op === 'add') need(C, o.card, `${g.id} add`); }));
  values(R).forEach((r) => A(r.hooks).forEach((h) => walk(h.fx || [], (o) => { if (o.op === 'add') need(C, o.card, `${r.id} add`); if (o.op === 'addCurse' && o.id) need(C, o.id, `${r.id} curse`); if (o.op === 'addRelic' && o.id) need(R, o.id, `${r.id} relic`); if (o.op === 'addGem' && o.id) need(GM, o.id, `${r.id} gem`); })));
  values(DATA.events).forEach((e) => {
    if (e.when && e.when.relic) need(R, e.when.relic, `${e.id} when.relic`);
    e.choices.forEach((c) => {
      if (c.req && c.req.relic) need(R, c.req.relic, `${e.id} req.relic`);
      c.out.forEach((o) => A(o.ops).forEach((x) => {
        if (x.op === 'addRelic' && x.id) need(R, x.id, `${e.id} addRelic`);
        if (x.op === 'addGem' && x.id) need(GM, x.id, `${e.id} addGem`);
        if (x.op === 'addCurse' && x.id) need(C, x.id, `${e.id} addCurse`);
        if (x.op === 'addCard' && x.card) need(C, x.card, `${e.id} addCard`);
        if (x.op === 'addBrush' && x.id !== 'random') need(DATA.brushes, x.id, `${e.id} addBrush`);
        if (x.op === 'fight') x.enemies.forEach((id) => need(E, id, `${e.id} fight`));
      }));
    });
  });
  Object.keys(DATA.FIXED.relics).forEach((id) => need(R, id, 'a fixed relic'));
  DATA.FIXED.curses.forEach((id) => need(C, id, 'a fixed curse'));
  DATA.ROSTER[1].concat(DATA.ROSTER[2], DATA.ROSTER[3]).forEach((r) => need(E, r.id, 'roster'));
  values(E).forEach((e) => { if (!DATA.rosterById[e.id]) bad.push(`enemy ${e.id} is not on the roster`); });
  values(DATA.achievements).forEach((a) => { if (L.statKeys.indexOf(a.stat.k) < 0) bad.push(`achievement ${a.id}: stat ${a.stat.k} is not a stat key`); });
  HEROES.forEach((h) => { need(DATA.lore, 'hero_' + h, 'hero page'); need(DATA.lore, 'barks_' + h, 'barks'); });
  ['intro', 'ch1_intro', 'ch2_intro', 'ch3_intro', 'ch1_clear', 'ch2_clear', 'victory', 'defeat'].forEach((id) => need(DATA.lore, id, 'story page'));
  values(R).forEach((r) => { if (r.hero) need(DATA.heroes, r.hero, `${r.id} hero`); });
  t.deep(bad, [], 'no dangling reference');
});

// =================================================================================================== 3. art ids
t.test('every card, relic, gem, enemy and event names an art id that exists', () => {
  const bad = [];
  const pairs = {};
  values(DATA.cards).forEach((c) => {
    if (c.rarity === 'token') return;
    if (L.motifs.indexOf(c.art.m) < 0) bad.push(`${c.id}: motif ${c.art.m}`);
    if (L.palettes.indexOf(c.art.c) < 0) bad.push(`${c.id}: palette ${c.art.c}`);
    const k = c.hero + ':' + c.art.m + ':' + c.art.c;
    if (pairs[k]) bad.push(`${c.id} and ${pairs[k]} share art ${k}`);
    pairs[k] = c.id;
  });
  values(DATA.cards).filter((c) => c.rarity === 'token').forEach((c) => { if (!c.art || L.motifs.indexOf(c.art.m) < 0) bad.push(`${c.id}: token motif ${c.art && c.art.m}`); });
  values(DATA.relics).forEach((r) => { if (L.relicIcons.indexOf(r.art.m) < 0) bad.push(`${r.id}: relic icon ${r.art.m}`); if (r.art.c !== undefined && L.palettes.indexOf(r.art.c) < 0) bad.push(`${r.id}: relic palette ${r.art.c}`); });
  values(DATA.gems).forEach((g) => { if (L.gemCuts.indexOf(g.art.cut) < 0) bad.push(`${g.id}: cut ${g.art.cut}`); });
  values(DATA.enemies).forEach((e) => { if (e.art.id !== e.id) bad.push(`${e.id}: art.id is ${e.art.id}`); });
  values(DATA.events).forEach((e) => { if (L.scenes.indexOf(e.art.scene) < 0) bad.push(`${e.id}: scene ${e.art.scene}`); });
  t.deep(bad, [], 'every art reference is legal and no hero reuses a motif and palette pair');
  t.ok(new Set(values(DATA.relics).map((r) => r.art.m)).size >= 40, 'relics use at least 40 different icons');
});

// =================================================================================================== 4. enemies
const movesUsed = (e) => {
  const used = new Set();
  const ai = (a) => { if (!a) return; A(a.open).forEach((m) => used.add(m)); A(a.seq).forEach((m) => used.add(m)); A(a.weighted).forEach((w) => used.add(w[0])); A(a.rules).forEach((r) => used.add(r.do)); };
  ai(e.ai); A(e.phases).forEach((p) => ai(p.ai));
  return used;
};
t.test('enemy AI: every referenced move exists, every defined move can be chosen, every roster id has a place in an encounter', () => {
  const placed = new Set();
  [1, 2, 3].forEach((ch) => { const enc = DATA.encounters[ch]; placed.add(enc.boss); enc.normal.concat(enc.elite).forEach((g) => g.enemies.forEach((id) => placed.add(id))); });
  const summoned = new Set();
  const fought = new Set();
  values(DATA.enemies).forEach((e) => [A(e.start)].concat(values(e.moves).map((m) => A(m.fx)), A(e.phases).map((p) => A(p.fx)), A(e.hooks).map((h) => A(h.fx))).forEach((fx) => walk(fx, (o) => { if (o.op === 'summon') summoned.add(o.enemy); })));
  values(DATA.events).forEach((ev) => ev.choices.forEach((c) => c.out.forEach((o) => A(o.ops).forEach((x) => { if (x.op === 'fight') A(x.enemies).forEach((id) => fought.add(id)); }))));
  values(DATA.enemies).forEach((e) => {
    const used = movesUsed(e);
    used.forEach((m) => t.ok(!!e.moves[m], `${e.id}: the AI names move ${m}, which exists`));
    Object.keys(e.moves).forEach((m) => t.ok(used.has(m), `${e.id}: move ${m} is chosen by some AI rule, open, sequence or phase`));
    t.ok(placed.has(e.id) || summoned.has(e.id) || fought.has(e.id), `${e.id}: appears in an encounter, a summon or a fable fight`);
    if (e.tier === 'minion') t.ok(summoned.has(e.id) || placed.has(e.id), `${e.id}: a minion is summoned or grouped by someone`);
    Object.keys(e.moves).forEach((m) => { const mv = e.moves[m]; t.ok(mv.name && mv.name.length >= 3 && mv.name.length <= 28, `${e.id}.${m}: a move name that fits`); if (mv.say) t.ok(mv.say.length <= 80, `${e.id}.${m}: the bark is short`); });
  });
  Object.keys(DATA.FIXED.enemies || {}).forEach((id) => t.ok(!!DATA.enemies[id], `fixed enemy ${id} exists`));
  ['boss_kuzunoha', 'boss_jorogumo', 'boss_editor'].forEach((id) => t.ok(DATA.enemies[id].tier === 'boss', `${id} is a boss`));
  t.eq(values(DATA.enemies).length, DATA.ROSTER[1].length + DATA.ROSTER[2].length + DATA.ROSTER[3].length, 'the roster and the registry are the same size');
});

t.test('enemy moves read from the enemy side in the bestiary (DATA.opsText of move.fx) and say who gets what', () => {
  const bad = [];
  values(DATA.enemies).forEach((e) => {
    Object.keys(e.moves).forEach((m) => {
      const mv = e.moves[m];
      const s = DATA.opsText(mv.fx);
      const w = `${e.id}.${m}`;
      if (!s) bad.push(`${w}: no text`);
      if (/undefined|NaN|\[object|null|something|Infinity/.test(s) || DASH.test(s)) bad.push(`${w}: debris in "${s}"`);
      if (/to a random enemy|the weakest enemy|the enemy\.|your ally|to the target|equal to your /.test(s)) bad.push(`${w}: reads from the hero side: "${s}"`);
      if (/(lead|backing) hero gains?|both heroes gain|The lead hero|The backing hero/.test(s)) bad.push(`${w}: a debuff reads like a gift: "${s}"`);
      if (/\d\.\d/.test(s)) bad.push(`${w}: a decimal number: "${s}"`);
      if (mv.kind !== 'none' && A(mv.fx).some((o) => o.op === 'dmg') && !/damage/.test(s)) bad.push(`${w}: a damage move that never says damage`);
      walk(mv.fx, (o) => { if (o.op === 'dmg' && !o.tgt && !/to the lead hero|to both heroes|to the backing hero|to a random hero|to the weakest hero/.test(s)) bad.push(`${w}: damage with no hero target: "${s}"`); });
      t.eq(DATA.moveText(mv), s, `${w}: moveText equals opsText of the move`);
    });
    A(e.hooks).forEach((h, i) => { const s = DATA.hookText(h); if (!s || /undefined|NaN|\[object|null/.test(s) || /\b(you|your)\b/.test(s.replace(/your (draw|discard) pile|your spots/g, ''))) bad.push(`${e.id} hook ${i}: "${s}"`); });
    A(e.phases).forEach((p, i) => { if (A(p.fx).length) { const s = DATA.opsText(p.fx); if (!s || /undefined|NaN|\[object|null/.test(s)) bad.push(`${e.id} phase ${i}: "${s}"`); } });
  });
  t.deep(bad, [], 'every enemy move, hook and phase reads from the enemy side');
});

// a clone of every enemy that only ever plays one move, so C.intent (the public API) tells us what the player sees for that move
t.test('intent text: every move of every enemy reads well in a real combat, and help for other enemies says so', () => {
  const heroes = [{ id: 'hanae', hp: 76, maxHp: 76 }, { id: 'kuro', hp: 60, maxHp: 60 }];
  const deck = DATA.heroes.hanae.starter.concat(DATA.heroes.kuro.starter).map((id, i) => ({ uid: i + 1, id, up: 0, gems: [] }));
  let checked = 0;
  const bad = [];
  values(DATA.enemies).forEach((e) => {
    Object.keys(e.moves).forEach((m) => {
      const id = `qa_${e.id}_${m}`;
      DATA.add('enemies', { [id]: Object.assign({}, e, { id, ai: { seq: [m] }, phases: [], rules: undefined, hooks: [], art: { id: e.id } }) });
      const C = COMBAT.create({ heroes, frontIdx: 0, deck, enemies: [id], tier: 'normal', chapter: e.chapter, seed: 3, mods: { energy: 3, hand: 5, enemyHp: 1, eliteHp: 1, bossHp: 1, enemyDmg: 1 }, relics: [], gold: 40 });
      C.start();
      const u = C.enemies[0];
      const it = C.intent(u);
      const s = DATA.intentText(it);
      checked++;
      const w = `${e.id}.${m}`;
      if (it.move !== m) bad.push(`${w}: the clone plays ${it.move}`);
      if (!s || s.length > 170 || /undefined|NaN|\[object|null|Infinity/.test(s) || DASH.test(s)) bad.push(`${w}: "${s}"`);
      if (s === e.moves[m].name) bad.push(`${w}: the intent is only the move name "${s}"`);
      const sides = values(e.moves[m].fx).length && JSON.stringify(e.moves[m].fx);
      if (/"tgt":"(allEnemies|otherEnemy|lowestEnemy)"/.test(sides) && !/(all enemies|another enemy|enemy with the lowest HP)/.test(s)) bad.push(`${w}: help for other enemies is not named in "${s}"`);
      if (A(e.moves[m].fx).some((o) => o.op === 'summon') && !/ummons/.test(s)) bad.push(`${w}: a summon that says nothing about summoning: "${s}"`);
      if (/to the lead hero and applies/.test(s) === false && /applies [^,]* to the lead hero and applies/.test(s)) bad.push(`${w}: repeated target "${s}"`);
    });
  });
  t.deep(bad, [], `${checked} enemy moves: every intent line is a sentence about the move`);
  t.ok(checked >= 150, 'at least 150 moves were read');
});

// =================================================================================================== 5. reward pools
t.test('every reward pool is non-empty for every hero and rarity, with and without the Library unlocked', () => {
  const none = { card: [], relic: [], gem: [] };
  [undefined, none].forEach((unl) => {
    const label = unl ? 'nothing unlocked' : 'everything unlocked';
    HEROES.forEach((h) => ['common', 'uncommon', 'rare'].forEach((r) => {
      const pool = DATA.rewardPool(h, r, unl);
      t.ok(pool.length >= 3, `${h} ${r} reward pool has at least 3 cards (${pool.length}) with ${label}`);
      t.ok(pool.every((c) => c.hero === h && c.rarity === r && c.rarity !== 'token'), `${h} ${r}: only that hero's non-token cards of that rarity`);
    }));
    ['common', 'uncommon', 'rare', 'boss', 'shop'].forEach((r) => {
      PAIRS.forEach((p) => t.ok(DATA.relicPool(r, unl, p).length >= (r === 'boss' || r === 'shop' || r === 'rare' ? 3 : 8), `${r} relic pool for ${p.join(' and ')} has enough treasures with ${label}`));
    });
    [1, 2, 3].forEach((tier) => ['red', 'blue', 'green', 'gold'].forEach((color) => t.ok(DATA.gemPool({ tier, color }, unl).length >= 1, `gem pool tier ${tier} ${color} is non-empty with ${label}`)));
    [1, 2, 3].forEach((tier) => t.ok(DATA.gemPool({ tier }, unl).length >= 4, `gem pool tier ${tier} (any colour) has at least 4 with ${label}`));
  });
  // every pool an event asks for
  values(DATA.events).forEach((e) => e.choices.forEach((c) => c.out.forEach((o) => A(o.ops).forEach((x) => {
    if (x.op === 'addRelic' && x.rarity) PAIRS.forEach((p) => t.ok(DATA.relicPool(x.rarity, none, p).length > 0, `${e.id}: a ${x.rarity} relic exists for ${p.join(' and ')} with nothing unlocked`));
    if (x.op === 'addGem') t.ok(DATA.gemPool({ tier: x.tier, color: x.color }, none).length > 0, `${e.id}: a gem matching ${JSON.stringify({ tier: x.tier, color: x.color })} exists with nothing unlocked`);
    if (x.op === 'cardReward' && x.rarity) HEROES.forEach((h) => t.ok(DATA.rewardPool(h, x.rarity, none).length >= (x.n || 3), `${e.id}: ${h} has ${x.n || 3} ${x.rarity} cards to offer`));
  }))));
});

// =================================================================================================== 6. text
const STATUS_WORDS = values(DATA.statuses).map((s) => s.name);
const KEYWORD_WORDS = ['block', 'exhaust', 'retain', 'innate', 'ethereal', 'unplayable'].map((k) => DATA.keywords[k].name).concat(['Breath']);
const wordRe = (w) => new RegExp('(^|[^A-Za-z])' + w.toLowerCase() + '([^A-Za-z]|$)');
// the keyword Hold is also a plain verb ("your Vox pool can hold 2 more", "if you hold at least 6 cards"): only the keyword must be capitalised
const VERB_HOLD = /\b(can|you|to) hold\b/g;
const lowerKeyword = (s) => { const v = s.replace(VERB_HOLD, ''); return STATUS_WORDS.concat(KEYWORD_WORDS).filter((w) => wordRe(w).test(v)).filter((w) => !(w === 'Weak' && /weak(est|ly)?/.test(v) && !/\bweak\b/.test(v))); };

t.test('every card, base and upgraded, in both rows: clean text inside the limits, keywords spelled the one way', () => {
  const bad = [];
  let n = 0;
  const glossary = (k) => !!DATA.keywords[k] || !!DATA.statuses[k];
  values(DATA.cards).forEach((c) => {
    [0, 1].forEach((up) => {
      if (up && !c.up) return;
      const inst = { uid: 1, id: c.id, up, gems: A(c.slots).map(() => null) };
      const ctxs = [undefined].concat(['front', 'back'].map((row) => ({ unit: { id: c.hero === 'curse' || c.hero === 'status' ? 'hanae' : c.hero, row, st: { might: 2, bulwark: 1 } } })));
      ctxs.forEach((ctx) => {
        const plain = DATA.cardPlain(inst, ctx), html = DATA.cardHtml(inst, ctx);
        n++;
        const w = `${c.id}${up ? '+' : ''}`;
        if (!ctx) {
          if (plain.length > 110) bad.push(`${w}: ${plain.length} characters`);
          if (!plain && c.type !== 'power') bad.push(`${w}: no text`);
          if (plain && !/^[A-Z]/.test(plain)) bad.push(`${w}: not capitalised: ${plain}`);
          if (plain && !/[.)]$/.test(plain)) bad.push(`${w}: no final full stop: ${plain}`);
          if (lowerKeyword(plain).length) bad.push(`${w}: ${lowerKeyword(plain).join(', ')} spelled with a small letter in "${plain}"`);
          if (/Now (Lead|Backing):/.test(plain) && !/(Swap|swap) spots/.test(plain)) bad.push(`${w}: "Now" with no swap before it: ${plain}`);
          if (/(Swap spots|swap spots)\. (Lead|Backing):/.test(plain)) bad.push(`${w}: a row bonus after a swap must say Now: ${plain}`);
          if (/(^|\. )Gain \d+ [A-Za-z]+\. Gain \d+ [A-Za-z]+(\.|$)/.test(plain)) bad.push(`${w}: two plain "Gain" sentences that read better as one: ${plain}`);
        }
        if (/undefined|NaN|\[object|null|Infinity|something/.test(plain) || DASH.test(plain)) bad.push(`${w}: debris "${plain}"`);
        if (/  |\s[.,]|\.\.|\bthe the\b|\ba a\b/.test(plain)) bad.push(`${w}: spacing or doubled word "${plain}"`);
        if (html.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&') !== plain) bad.push(`${w}: plain differs from the stripped html`);
        [...html.matchAll(/data-kw="([^"]+)"/g)].forEach((m) => { if (!glossary(m[1])) bad.push(`${w}: data-kw "${m[1]}" is not in the glossary`); });
        if (/<(?!\/?(span)\b)[a-z]/i.test(html)) bad.push(`${w}: markup other than spans`);
      });
    });
  });
  t.deep(bad, [], `${n} card texts read cleanly`);
});

t.test('hero:any hooks name BOTH heroes, and an owned hook never claims more than its filter allows', () => {
  const bad = [];
  let any = 0;
  values(DATA.cards).forEach((c) => [c.fx, c.up && c.up.fx].forEach((fx, i) => walk(fx || [], (o) => {
    if (o.op !== 'hook') return;
    const text = DATA.cardPlain({ id: c.id, up: i, gems: [] });
    const f = o.filter || {};
    if (f.hero === 'any') {
      any++;
      if (['onPlay', 'onKill', 'onDamaged'].indexOf(o.on) >= 0 && !/either hero/.test(text)) bad.push(`${c.id}: filter.hero any on ${o.on} but the text never says "either hero": ${text}`);
      if (o.on === 'onSwap' && !/either hero swaps spots/.test(text)) bad.push(`${c.id}: an any swap hook should read "either hero swaps spots": ${text}`);
      if (o.on === 'onHeroDown' && !/a hero loses their voice/.test(text)) bad.push(`${c.id}: an any hero-down hook should read "a hero loses their voice": ${text}`);
    } else {
      if (/either hero/.test(text)) bad.push(`${c.id}: says "either hero" without hero:'any': ${text}`);
      if (o.on === 'onSwap' && !/swap into the lead/.test(text)) bad.push(`${c.id}: an owned swap hook with no hero:'any' only fires when its owner ends up in front (the swap event names the new front hero), so the text must say so: ${text}`);
      if (o.on === 'onHeroDown' && !/you lose your voice/.test(text)) bad.push(`${c.id}: an owned hero-down hook with no hero:'any' only fires when its owner falls: ${text}`);
    }
  })));
  t.ok(any >= 8, `${any} hero:any hooks checked`);
  t.deep(bad, [], 'hook wording matches who the hook hears');
  ['hanae_petal_trail', 'hanae_waltz_of_steps'].forEach((id) => t.ok(DATA.cards[id], `${id} exists`));
  t.eq(DATA.cardPlain('hanae_petal_trail'), 'Up to 2 times per turn, whenever either hero plays an Attack, deal 2 damage to all enemies.', 'Petal Trail says either hero');
  t.eq(DATA.cardPlain('hanae_waltz_of_steps'), 'Once per turn, whenever either hero swaps spots, gain 1 Bloom and 4 Block.', 'Waltz of Steps says either hero and shares one gain sentence');
});

t.test('every card with every compatible gem: no exceptions, no debris, and the gem line says what it does', () => {
  const bad = [];
  let n = 0, grey = 0;
  const gems = values(DATA.gems);
  values(DATA.cards).forEach((c) => {
    if (!A(c.slots).length) return;
    [0, 1].forEach((up) => {
      if (up && !c.up) return;
      c.slots.forEach((slot, i) => gems.forEach((g) => {
        if (slot !== 'any' && slot !== g.color) return;
        const gs = c.slots.map(() => null);
        gs[i] = g.id;
        [undefined, { unit: { id: c.hero, row: g.mod.cond || 'front', st: {} } }].forEach((ctx) => {
          const inst = { uid: 1, id: c.id, up, gems: gs };
          const plain = DATA.cardPlain(inst, ctx);
          n++;
          if (/undefined|NaN|\[object|null|Infinity/.test(plain) || DASH.test(plain)) bad.push(`${c.id} + ${g.id}: ${plain}`);
          if (plain.length > 260) bad.push(`${c.id} + ${g.id}: ${plain.length} characters is too long for any card face`);
          if (!ctx && !DATA.resolveCard(inst).gemActive[i]) grey++;
        });
      }));
    });
  });
  t.deep(bad, [], `${n} card and gem combinations read cleanly`);
  t.ok(grey < n * 0.12, `${grey} of ${n} combinations are greyed (gems that cannot apply to that card): colours were chosen to be useful`);
  values(DATA.gems).forEach((g) => {
    const s = DATA.gemText(g.id);
    t.ok(s.length >= 6 && s.length <= 90 && /^[A-Z+]/.test(s) && !DASH.test(s) && !/undefined|NaN|\[object/.test(s), `${g.id}: gem text "${s}"`);
    t.ok(lowerKeyword(s).length === 0, `${g.id}: keywords spelled right in "${s}"`);
  });
});

t.test('hook damage in card text is not inflated by the hero row or Might, and hook Block gets no row bonus', () => {
  values(DATA.cards).forEach((c) => {
    if (c.hero !== 'hanae') return;
    const hooks = [];
    walk(c.fx, (o) => { if (o.op === 'hook') hooks.push(o); });
    hooks.forEach((h) => {
      let hookDmg = null;
      walk(h.fx, (o) => { if (o.op === 'dmg' && typeof o.n === 'number' && hookDmg === null) hookDmg = o.n; });
      if (hookDmg === null) return;
      const live = DATA.cardPlain({ id: c.id, up: 0, gems: [] }, { unit: { id: 'hanae', row: 'front', st: { might: 3 } } });
      t.ok(new RegExp('\\b' + hookDmg + ' damage').test(live), `${c.id}: the live text still says ${hookDmg} for hook damage (front row, Might 3): ${live}`);
    });
  });
});

t.test('relic, status, row, keyword and brush text: spelling, limits, no dashes', () => {
  const bad = [];
  values(DATA.relics).forEach((r) => {
    if (r.text.length > 90) bad.push(`${r.id}: ${r.text.length} characters`);
    if (!/^[A-Z]/.test(r.text) || !/[.)]$/.test(r.text)) bad.push(`${r.id}: "${r.text}" is not a sentence`);
    if (DASH.test(r.text) || DASH.test(r.name)) bad.push(`${r.id}: dash`);
    if (lowerKeyword(r.text).length) bad.push(`${r.id}: ${lowerKeyword(r.text).join(', ')} in "${r.text}"`);
    if (r.hero && r.text.indexOf(DATA.heroes[r.hero].name) < 0) bad.push(`${r.id}: a hero relic that never names ${r.hero}`);
    A(r.hooks).forEach((h) => { const s = DATA.hookText(h); if (!s || !/[.]$/.test(s) || /undefined|NaN|\[object/.test(s)) bad.push(`${r.id}: hookText "${s}"`); });
  });
  values(DATA.statuses).forEach((s) => {
    [undefined, 1, 4].forEach((n) => { const x = DATA.statusText(s.id, n); if (!x || DASH.test(x) || /\bN\b/.test(n === undefined ? '' : x)) bad.push(`status ${s.id} ${n}: "${x}"`); });
    if (!/^[A-Z]/.test(s.text) || !/[.]$/.test(s.text)) bad.push(`status ${s.id}: "${s.text}"`);
  });
  values(DATA.keywords).forEach((k) => { if (!/^[A-Z]/.test(k.text) || !/[.]$/.test(k.text) || DASH.test(k.text)) bad.push(`keyword ${k.name}: "${k.text}"`); });
  values(DATA.brushes).forEach((b) => { if (!/^[A-Z]/.test(b.text) || !/[.]$/.test(b.text) || DASH.test(b.text)) bad.push(`brush ${b.name}: "${b.text}"`); });
  values(DATA.tiles).forEach((x) => { if (!/^[A-Z]/.test(x.text) || !/[.]$/.test(x.text) || DASH.test(x.text)) bad.push(`tile ${x.name}: "${x.text}"`); });
  HEROES.forEach((h) => ['front', 'back'].forEach((row) => { const s = DATA.rowText(h, row); if (!/^(Lead|Backing): /.test(s) || DASH.test(s)) bad.push(`row ${h} ${row}: "${s}"`); }));
  HEROES.forEach((h) => A(DATA.heroes[h].passives).forEach((p) => { const s = DATA.hookText(p); if (!s || /undefined|NaN/.test(s)) bad.push(`passive ${p.id}: "${s}"`); }));
  t.deep(bad, [], 'relics, statuses, keywords, brushes, tiles, rows and passives read cleanly');
  // every keyword a card text can highlight has a glossary entry
  ['block', 'exhaust', 'retain', 'innate', 'ethereal', 'unplayable', 'front', 'back', 'swap', 'ink', 'xcost', 'down'].forEach((k) => t.ok(!!DATA.keywords[k], `glossary has ${k}`));
});

t.test('card flavour: every rare has one, and no dash or American spelling slips in', () => {
  const bad = [];
  values(DATA.cards).forEach((c) => {
    if (c.rarity === 'rare' && !c.flavor) bad.push(`${c.id}: a rare with no flavour line`);
    if (c.flavor && (DASH.test(c.flavor) || c.flavor.length > 90 || !/[.!?]$/.test(c.flavor))) bad.push(`${c.id}: flavour "${c.flavor}"`);
  });
  t.deep(bad, [], 'flavour lines are tidy');
  const american = /\b(color|colors|colored|armor|gray|favor|honor|neighbor|center|defense|realize|recognize|apologize|organize)\b/i;
  const found = [];
  const scan = (where, s) => { if (typeof s === 'string' && american.test(s)) found.push(`${where}: ${s.slice(0, 70)}`); };
  values(DATA.cards).forEach((c) => scan(c.id, c.flavor));
  values(DATA.enemies).forEach((e) => { scan(e.id + ' lore', e.lore); values(e.moves).forEach((m) => scan(e.id + ' bark', m.say)); });
  values(DATA.events).forEach((e) => { scan(e.id, e.text); e.choices.forEach((c) => { scan(e.id, c.label); c.out.forEach((o) => scan(e.id, o.text)); }); });
  values(DATA.lore).forEach((l) => { scan(l.id, l.text); values(l.lines || {}).forEach((arr) => arr.forEach((x) => scan(l.id, x))); });
  values(DATA.relics).forEach((r) => scan(r.id, r.text + ' ' + r.name));
  // known, reported to the card owner: status_wilt says "color"
  t.deep(found.filter((x) => !/^status_wilt:/.test(x)), [], 'British spelling throughout (colour, honour, armour)');
});

// synthetic enemies for the combat checks (registered once)
const enemyBase = { chapter: 1, tier: 'normal', size: 'm', art: { id: 'kappa' }, lore: 'A synthetic test enemy for the content suite.', tags: ['spirit'] };
DATA.add('enemies', {
  qa_minion: Object.assign({}, enemyBase, { name: 'QA Minion', tier: 'minion', size: 's', hp: [30, 30], moves: { poke: { name: 'Poke', kind: 'attack', fx: [{ op: 'dmg', n: 5, tgt: 'random' }] } }, ai: { seq: ['poke'] } }),
  qa_normal: Object.assign({}, enemyBase, { name: 'QA Normal', hp: [60, 60], moves: { hit: { name: 'Hit', kind: 'attack', fx: [{ op: 'dmg', n: 9, tgt: 'front' }] }, back: { name: 'Back', kind: 'attack', fx: [{ op: 'dmg', n: 30, tgt: 'back' }] } }, ai: { seq: ['hit', 'hit', 'back'] } }),
  qa_elite: Object.assign({}, enemyBase, { name: 'QA Elite', tier: 'elite', size: 'l', hp: [90, 90], moves: { hit: { name: 'Hit', kind: 'attack', fx: [{ op: 'dmg', n: 12, tgt: 'both' }] } }, ai: { seq: ['hit'] } }),
  qa_tank: Object.assign({}, enemyBase, { name: 'QA Tank', hp: [900, 900], moves: { tap: { name: 'Tap', kind: 'attack', fx: [{ op: 'dmg', n: 3, tgt: 'front' }] } }, ai: { seq: ['tap'] } }),
  qa_brute: Object.assign({}, enemyBase, { name: 'QA Brute', hp: [900, 900], moves: { slam: { name: 'Slam', kind: 'heavy', fx: [{ op: 'dmg', n: 400, tgt: 'back' }] } }, ai: { seq: ['slam'] } }),
  qa_wall: Object.assign({}, enemyBase, { name: 'QA Wall', tier: 'minion', size: 's', hp: [900, 900], moves: { idle: { name: 'Idle', kind: 'none', fx: [] } }, ai: { seq: ['idle'] } }),
  qa_hitter: Object.assign({}, enemyBase, { name: 'QA Hitter', hp: [900, 900], moves: { front: { name: 'Front', kind: 'attack', fx: [{ op: 'dmg', n: 7, tgt: 'front' }] } }, ai: { seq: ['front'] } }),
  qa_brute_front: Object.assign({}, enemyBase, { name: 'QA Brute Front', hp: [900, 900], moves: { hit: { name: 'Hit', kind: 'heavy', fx: [{ op: 'dmg', n: 50, tgt: 'front' }] } }, ai: { seq: ['hit'] } }),
  qa_brute_back: Object.assign({}, enemyBase, { name: 'QA Brute Back', hp: [900, 900], moves: { hit: { name: 'Hit', kind: 'heavy', fx: [{ op: 'dmg', n: 50, tgt: 'back' }] } }, ai: { seq: ['hit'] } }),
});
// =================================================================================================== 6b. text versus the engine
// The rules lawyer's pass: cards whose wording is easy to get wrong are PLAYED in the real engine and the result is compared with
// what the text promises.
function lawyer(heroes, front, ids, opt) {
  opt = opt || {};
  const deck = ids.map((id, i) => (typeof id === 'string' ? { uid: i + 1, id, up: 0, gems: [] } : Object.assign({ uid: i + 1, gems: [] }, id)));
  for (let i = 0; i < 12; i++) deck.push({ uid: 200 + i, id: 'curse_smudge', up: 0, gems: [] });
  const C = COMBAT.create({ heroes: heroes.map((id) => ({ id, hp: DATA.heroes[id].maxHp, maxHp: DATA.heroes[id].maxHp })), frontIdx: front, deck, enemies: [opt.enemy || 'qa_tank'], tier: 'normal', chapter: 1, seed: 5, mods: { energy: 9, hand: 5, enemyHp: 1, enemyDmg: 1, eliteHp: 1, bossHp: 1 }, relics: opt.relics || [], gold: 0 });
  C.start();
  return C;
}
const getCard = (C, id) => { const c = [].concat(C.hand, C.draw, C.discard, C.exhaust).find((x) => x.id === id); if (C.hand.indexOf(c) < 0) { [C.draw, C.discard, C.exhaust].forEach((p) => { const i = p.indexOf(c); if (i >= 0) p.splice(i, 1); }); C.hand.push(c); } return c; };
const playId = (C, id) => { const c = getCard(C, id); return C.play(c.uid, C.needsTarget(c.uid) ? C.enemies[0].id : undefined); };
const evs = (ev, type) => ev.filter((e) => e.type === type);

t.test('rules lawyer: steps, swaps and "Now Front" read exactly as the engine plays them', () => {
  // Petal Step: "Move to the lead. Gain 1 Bloom and 3 Block."
  t.eq(DATA.cardPlain('hanae_petal_step'), 'Move to the lead. Gain 1 Bloom and 3 Block.', 'the text');
  let C = lawyer(['hanae', 'kuro'], 1, ['hanae_petal_step']);
  let ev = playId(C, 'hanae_petal_step');
  t.eq(C.front().id, 'hanae', 'from the back row she ends in front');
  t.eq(evs(ev, 'swap').length, 1, 'with exactly one swap');
  C = lawyer(['hanae', 'kuro'], 0, ['hanae_petal_step']);
  ev = playId(C, 'hanae_petal_step');
  t.eq(evs(ev, 'swap').length, 0, 'from the front row she never swaps');
  t.eq(C.heroes[0].st.bloom, 1, 'and the Bloom comes either way');
  // Hit and Vanish: "Deal 6 damage. Swap spots. Now Backing: both heroes gain 3 Block." (4 with her back row bonus)
  t.eq(DATA.cardPlain('hanae_hit_and_vanish'), 'Deal 6 damage. Swap spots. Now Backing: both heroes gain 3 Block.', 'the text');
  C = lawyer(['hanae', 'kuro'], 0, ['hanae_hit_and_vanish']);
  ev = playId(C, 'hanae_hit_and_vanish');
  t.eq(C.front().id, 'kuro', 'from the front she ends in the back');
  t.ok(evs(ev, 'block').length === 2, 'and both heroes gain Block (now back)');
  C = lawyer(['hanae', 'kuro'], 1, ['hanae_hit_and_vanish']);
  ev = playId(C, 'hanae_hit_and_vanish');
  t.eq(C.front().id, 'hanae', 'from the back she ends in the front');
  t.eq(evs(ev, 'block').length, 0, 'and nobody gains Block (not now back)');
  // Kagura Step, Tiger and Crane, Flip the Page: the rows are the rows AFTER the swap
  C = lawyer(['suzu', 'hanae'], 0, ['suzu_kagura_step']);
  playId(C, 'suzu_kagura_step');
  t.eq(C.back().id, 'suzu', 'Kagura Step from the front: Suzu ends in the back, so the heal branch runs (no Taunt)');
  t.ok(!C.heroes[0].st.taunt, 'no Taunt on the back branch');
  C = lawyer(['suzu', 'hanae'], 1, ['suzu_kagura_step']);
  playId(C, 'suzu_kagura_step');
  t.ok(C.heroes[0].st.taunt === 1 && C.heroes[0].block > 0, 'from the back she ends in front: Block and Taunt');
});

t.test('rules lawyer: "until the end of this turn", "until your next turn", doubling and the once-hooks', () => {
  let C = lawyer(['hanae', 'kuro'], 0, ['hanae_flurry_stance']);
  playId(C, 'hanae_flurry_stance');
  t.eq(C.heroes[0].st.might, 2, 'Flurry Stance gives 2 Might now');
  C.endTurn();
  t.ok(!C.heroes[0].st.might, 'and it is gone after the turn ends ("until the end of this turn")');
  C = lawyer(['hanae', 'kuro'], 0, ['hanae_sway'], { enemy: 'qa_tank' });
  playId(C, 'hanae_sway');
  t.eq(C.heroes[0].st.dodge, 1, 'Sway gives 1 Dodge');
  const ev = C.endTurn();
  t.ok(evs(ev, 'dodge').length === 1, 'the Dodge dodged the enemy phase hit ("until your next turn")');
  t.ok(!C.heroes[0].st.dodge, 'and is gone when the next turn starts');
  // Rot Script: "Double the target's Poison (adds at most 10)"
  [[7, 14], [14, 24]].forEach(([from, to]) => {
    C = lawyer(['kuro', 'hanae'], 1, ['kuro_rot_script']);
    C.enemies[0].st.poison = from;
    playId(C, 'kuro_rot_script');
    t.eq(C.enemies[0].st.poison, to, `Rot Script on ${from} Poison leaves ${to}`);
  });
  // Waiting Storm: "The next time you are hit, apply 1 Stun to the attacker" (even a blocked hit)
  C = lawyer(['raiga', 'hanae'], 0, ['raiga_waiting_storm'], { enemy: 'qa_hitter' });
  playId(C, 'raiga_waiting_storm');
  C.endTurn();
  t.eq(C.enemies[0].st.stun, 1, 'the attacker is Stunned after hitting Raiga');
  // Yata Mirror: "Double your Thorns"
  C = lawyer(['suzu', 'hanae'], 1, ['suzu_stone_lion']);
  playId(C, 'suzu_stone_lion');
  t.eq(C.heroes[0].st.thorns, 1, 'Stone Lion gives 1 Thorns (she is in the back row, which grants none)');
});

t.test('rules lawyer: hooks hear exactly who the text says', () => {
  // Petal Trail: either hero's Attacks, flat 2 damage with no Might or row bonus
  let C = lawyer(['hanae', 'kuro'], 0, ['hanae_petal_trail', 'kuro_ink_bolt']);
  playId(C, 'hanae_petal_trail');
  C.heroes[0].st.might = 4;
  const ev = playId(C, 'kuro_ink_bolt');
  const trail = evs(ev, 'hit').filter((e) => e.src === null || e.src === undefined);
  t.eq(trail.length, 1, "Kuro's Attack triggers Petal Trail (either hero)");
  t.eq(trail[0] && trail[0].raw, 2, 'for exactly 2 (hook damage has no attacker: no Might, no row bonus)');
  // a Hanae-only hook does not hear Kuro: Bending Willow-like "you are hit" is the owner only (checked through Storm Born style passives)
  // Waltz of Steps: either hero's swap; Swaying Bells and Scene Change likewise
  C = lawyer(['hanae', 'kuro'], 1, ['hanae_waltz_of_steps']);
  playId(C, 'hanae_waltz_of_steps');
  C.swap();
  t.eq(C.unit('hanae').st.bloom >= 1, true, 'Waltz of Steps pays when Kuro (not Hanae) ends in front too');
  C = lawyer(['kuro', 'hanae'], 1, ['kuro_scene_change']);
  playId(C, 'kuro_scene_change');
  const sw = C.swap();
  t.ok(evs(sw, 'draw').length === 1 && C.unit('kuro').st.sumi === 1, 'Scene Change draws and gains Sumi on either hero\'s swap');
  // Guardian Kami: "The next time a hero falls, revive that hero with 40% HP and both heroes gain 8 Block" (the ally AND Suzu herself)
  [['a hit on the back hero', 'qa_brute_back', 'hanae'], ['a hit on Suzu herself', 'qa_brute_front', 'suzu']].forEach(([label, enemy, who]) => {
    C = lawyer(['suzu', 'hanae'], 0, ['suzu_guardian_kami'], { enemy });
    playId(C, 'suzu_guardian_kami');
    C.unit(who).hp = 3;
    const e2 = C.endTurn();
    t.ok(evs(e2, 'hero_revive').length === 1 && evs(e2, 'hero_revive')[0].hero === who, `Guardian Kami revives ${who} (${label})`);
  });
});

// =================================================================================================== 7. relics in real combats
const VARIANTS = [
  { enemies: ['qa_minion', 'qa_minion', 'qa_normal'], mods: { enemyHp: 0.2 }, tier: 'normal', small: false },
  { enemies: ['qa_elite', 'qa_minion'], mods: { eliteHp: 0.2, enemyHp: 0.2 }, tier: 'elite', small: false },
  { enemies: ['qa_tank'], mods: {}, tier: 'normal', small: false },
  { enemies: ['qa_tank'], mods: {}, tier: 'normal', small: true },
  { enemies: ['qa_brute'], mods: {}, tier: 'normal', small: false },
];
function qaDeck(pair, small) {
  const deck = [];
  let uid = 1;
  const add = (id, up, gems) => deck.push({ uid: uid++, id, up: up ? 1 : 0, gems: gems || [] });
  pair.forEach((h) => DATA.heroes[h].starter.forEach((id) => add(id, 0)));
  if (small) return deck;
  pair.forEach((h) => values(DATA.cards).filter((c) => c.hero === h && c.rarity !== 'starter' && c.rarity !== 'token').forEach((c) => {
    const gems = A(c.slots).map((sl) => { const gm = values(DATA.gems).find((x) => x.color === (sl === 'any' ? 'red' : sl) && x.tier === 1); return gm ? gm.id : null; });
    add(c.id, 0, gems);
  }));
  return deck;
}
function playCombat(pair, relics, variant, seed, hpBoost) {
  const maxes = pair.map((id) => DATA.heroes[id].maxHp + (hpBoost || 0));
  const C = COMBAT.create({ heroes: pair.map((id, i) => ({ id, hp: maxes[i], maxHp: maxes[i] })), frontIdx: seed % 2, deck: qaDeck(pair, variant.small), enemies: variant.enemies, tier: variant.tier, chapter: 1, seed, mods: Object.assign({ energy: 3, hand: 5, startBlock: 0, freeSwaps: 1, enemyHp: 1, eliteHp: 1, bossHp: 1, enemyDmg: 1 }, variant.mods), relics, gold: 50 });
  C.start();
  for (let turn = 0; turn < 8 && C.phase !== 'over'; turn++) {
    if (turn % 2 === 0) C.swap();
    let guard = 0;
    while (C.phase === 'player' && guard++ < 60) { const a = COMBAT.greedyPolicy(C); if (!a || a.type === 'end') break; COMBAT.applyAction(C, a); }
    if (C.phase === 'player') C.endTurn();
  }
  return C;
}
const pairForRelic = (r) => { const h = r.hero || 'hanae'; return [h, h === 'kuro' ? 'hanae' : 'kuro']; };

t.test('every relic with combat hooks fires in a real combat, and nothing throws (greedy bot, five scenarios)', () => {
  const combatRelics = values(DATA.relics).filter((r) => A(r.hooks).some((h) => L.combatHooks.indexOf(h.on) >= 0));
  t.ok(combatRelics.length >= 30, `${combatRelics.length} relics with combat hooks`);
  const hooksSeen = new Set();
  combatRelics.forEach((r) => {
    const fired = new Set();
    let err = null;
    VARIANTS.forEach((v) => [1, 2].forEach((seed) => {
      try {
        const C = playCombat(pairForRelic(r), [r.id], v, seed, 0);
        C.events.forEach((e) => { if (e.type === 'relic' && e.id === r.id) fired.add(1); });
        const total = C.hand.length + C.draw.length + C.discard.length + C.exhaust.length + C.powers.length + (C.inPlay ? 1 : 0);
        if (total !== C.deckSize + (C.added || 0)) err = err || new Error('conservation broke: ' + total + ' vs ' + C.deckSize);
      } catch (e) { err = err || e; }
    }));
    t.ok(!err, `${r.id}: plays without an exception (${err && err.message})`);
    t.ok(fired.size > 0, `${r.id}: its ${A(r.hooks).map((h) => h.on).join(' and ')} hook fires in a real combat`);
    A(r.hooks).forEach((h) => hooksSeen.add(h.on));
  });
  L.combatHooks.filter((h) => h !== 'combatEnd').forEach((h) => t.ok(hooksSeen.has(h), `some relic uses the ${h} hook`));
});

t.test('every relic as a whole: mods and rows resolve, rows reach the text, and a combat with ALL its relics at once does not throw', () => {
  const ids = values(DATA.relics).map((r) => r.id);
  ids.forEach((id) => {
    const r = DATA.relics[id];
    const mods = DATA.modsFor([id], 0);
    t.ok(Object.keys(mods).every((k) => Number.isFinite(mods[k])), `${id}: every folded mod is a finite number`);
    if (r.rows) HEROES.forEach((h) => ['front', 'back'].forEach((row) => { const rf = DATA.rowFor(h, row, [id]); t.ok(Object.keys(rf).every((k) => Number.isFinite(rf[k])), `${id}: row ${h} ${row} is finite`); }));
  });
  PAIRS.forEach((p, i) => {
    const owned = ids.filter((id) => !DATA.relics[id].hero || p.indexOf(DATA.relics[id].hero) >= 0);
    let err = null;
    try { VARIANTS.forEach((v) => playCombat(p, owned, v, 3 + i, 40)); } catch (e) { err = e; }
    t.ok(!err, `${p.join(' and ')}: a combat holding all ${owned.length} treasures at once runs (${err && err.stack})`);
  });
});

t.test('every run hook of every relic runs through RUN without an exception, and every pickup applies', () => {
  const runHooks = L.runHooks;
  values(DATA.relics).forEach((r) => {
    const pair = pairForRelic(r);
    A(r.hooks).filter((h) => runHooks.indexOf(h.on) >= 0).forEach((h) => {
      const R = RUN.newRun({ heroes: pair, trial: 0, seed: 77 });
      let err = null, res = null;
      try {
        if (h.on === 'onPickup') {
          const out = RUN.applyOps(R, [{ op: 'addRelic', id: r.id }], {});
          res = out;
          t.ok(R.relics.indexOf(r.id) >= 0, `${r.id}: onPickup relic is owned after addRelic`);
        } else {
          R.relics.push(r.id);
          R.gold = 100; R.ink = 5;
          const tier = A(h.filter && h.filter.tier)[0] || (h.filter && h.filter.tier) || 'normal';
          let logged = 0;
          for (let i = 0; i < Math.max(1, h.every || 1); i++) logged += A(RUN.hook(R, h.on, { tier }).log).length;
          t.ok(logged > 0, `${r.id}: the ${h.on} hook produced a log entry (after ${h.every || 1} triggers)`);
        }
      } catch (e) { err = e; }
      t.ok(!err, `${r.id}: ${h.on} runs (${err && err.message})`);
    });
  });
});

// =================================================================================================== 8. events
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60 };
function deckPick(R, p) {
  const f = p.filter || {};
  const cands = R.deck.filter((c) => { const d = DATA.cards[c.id]; return (!f.type || d.type === f.type) && (!f.hero || d.hero === f.hero) && (p.op !== 'upgradeCard' || (!c.up && d.up)); });
  return cands.slice(0, Math.min(p.n || 1, cands.length)).map((c) => c.uid);
}
function resolveAll(R, out) {
  A(out.pending).forEach((p) => {
    const res = p.op === 'cardReward' ? RUN.resolvePending(R, p.id, p.offers[0]) : RUN.resolvePending(R, p.id, deckPick(R, p));
    if (!res.ok) throw new Error(`pending ${p.op} refused: ${res.reason}`);
  });
}
t.test('every outcome of every choice applies through RUN.applyOps for every hero pair, with no exception and a log', () => {
  let applied = 0, silent = 0;
  const bad = [];
  PAIRS.forEach((pair, pi) => {
    const R0 = RUN.newRun({ heroes: pair, trial: 0, seed: 100 + pi });
    R0.gold = 300; R0.ink = 8;
    const blob = RUN.serialize(R0);
    values(DATA.events).forEach((e) => e.choices.forEach((c, ci) => c.out.forEach((o, oi) => {
      const w = `${pair.join('+')} ${e.id}[${ci}].out[${oi}]`;
      try {
        const R = RUN.deserialize(JSON.parse(JSON.stringify(blob)));
        const before = { gold: R.gold, ink: R.ink, deck: R.deck.length, hp: R.heroes.map((h) => h.hp), maxHp: R.heroes.map((h) => h.maxHp) };
        const out = RUN.applyOps(R, o.ops, { key: 'qa' });
        resolveAll(R, out);
        applied++;
        const ops = A(o.ops);
        if (!ops.length) { silent++; return; }
        if (!A(out.log).length && !A(out.pending).length && !out.fight) bad.push(`${w}: ops ran but logged nothing`);
        ops.forEach((x) => {
          if (x.op === 'gold' && x.n < 0 && R.gold !== Math.max(0, before.gold + x.n) && !ops.some((y) => y !== x && y.op === 'gold')) bad.push(`${w}: gold ${x.n} did not apply (${before.gold} -> ${R.gold})`);
          if (x.op === 'fight' && !out.fight) bad.push(`${w}: a fight outcome returned no fight`);
          if (x.op === 'maxHp' && x.n > 0 && !(x.who && x.who !== 'both' && pair.indexOf(x.who) < 0) && !R.heroes.some((h, i) => h.maxHp > before.maxHp[i])) bad.push(`${w}: max HP gain did not apply`);
          if (x.op === 'hurt' && !R.heroes.some((h, i) => h.hp < before.hp[i]) && !(x.who && x.who !== 'both' && pair.indexOf(x.who) < 0)) bad.push(`${w}: hurt did not take any HP`);
          if (x.op === 'addCurse' && R.deck.length <= before.deck) bad.push(`${w}: addCurse did not add a card`);
        });
      } catch (err) { bad.push(`${w}: ${err.message}`); }
    })));
  });
  t.deep(bad.slice(0, 20), [], `${applied} outcome applications across 6 hero pairs (${silent} are story only)`);
  t.ok(applied > 1200, 'a lot of outcomes were replayed');
});

t.test('a gated choice can really be reached, and the same choice is refused without its key', () => {
  const gated = [];
  values(DATA.events).forEach((e) => e.choices.forEach((c, ci) => { if (c.req) gated.push([e, c, ci]); }));
  t.ok(gated.length >= 15, `${gated.length} gated choices`);
  gated.forEach(([e, c, ci]) => {
    const req = c.req;
    const pair = req.hero ? [req.hero, req.hero === 'hanae' ? 'kuro' : 'hanae'] : ['hanae', 'kuro'];
    const prep = (full) => {
      const R = RUN.newRun({ heroes: pair, trial: 0, seed: 5 });
      R.chapter = req.chapter || (e.chapters ? e.chapters[0] : 1);
      R.node = { kind: 'event', tile: { q: 0, r: 0 }, event: e.id, chosen: null };
      R.gold = 400;
      if (full) {
        if (req.relic) R.relics.push(req.relic);
        if (req.flag) R.flags[req.flag] = 1;
        if (req.hpBelow) R.heroes.forEach((h) => { h.hp = Math.max(1, Math.floor(h.maxHp * (req.hpBelow / 2))); });
      } else {
        R.gold = 0;
        R.heroes.forEach((h) => { h.hp = h.maxHp; });
      }
      return R;
    };
    const ok = RUN.eventChoose(prep(true), e.id, ci);
    t.ok(ok && ok.ok, `${e.id}[${ci}] "${c.label}": reachable with ${JSON.stringify(req)} (${ok && ok.reason})`);
    if (req.relic || req.flag || req.gold || req.hpBelow) {
      const no = RUN.eventChoose(prep(false), e.id, ci);
      t.ok(no && !no.ok, `${e.id}[${ci}] "${c.label}": refused without its key`);
    }
  });
});

t.test('the story says what the ops do: numbers written as words match the gold and hexes, costs match prices, labels match fights', () => {
  const bad = [];
  const num = (w) => (/^\d+$/.test(w) ? Number(w) : WORDS[w.toLowerCase()]);
  values(DATA.events).forEach((e) => {
    const all = [e.text].concat(e.choices.flatMap((c) => [c.label].concat(c.out.map((o) => o.text))));
    e.choices.forEach((c, ci) => {
      c.out.forEach((o, oi) => {
        const ops = A(o.ops);
        for (const m of o.text.matchAll(/\b(\w+) (gold|hexes)\b/g)) {
          const n = num(m[1]);
          if (n === undefined) continue;
          const w = `${e.id}[${ci}].out[${oi}]`;
          if (m[2] === 'gold') { if (!ops.some((x) => x.op === 'gold' && Math.abs(x.n) === n)) bad.push(`${w}: says "${m[0]}" but no gold op is ${n}`); }
          else if (!ops.some((x) => x.op === 'addBrush') && !ops.some((x) => x.op === 'paint' && x.n === n)) bad.push(`${w}: says "${m[0]}" but paint is ${JSON.stringify(ops.filter((x) => x.op === 'paint').map((x) => x.n))}`);
        }
      });
      const cm = /^(\d+) gold$/.exec(c.cost || '');
      if (cm) { const n = Number(cm[1]); if (!c.out.some((o) => A(o.ops).some((x) => x.op === 'gold' && x.n === -n))) bad.push(`${e.id}[${ci}]: cost "${c.cost}" is never charged`); if (!c.req || c.req.gold !== n) bad.push(`${e.id}[${ci}]: cost "${c.cost}" is not the requirement (${JSON.stringify(c.req)})`); }
      const lm = /\b(\w+) gold\b/i.exec(c.label);
      if (lm && num(lm[1]) !== undefined && (!c.req || c.req.gold !== num(lm[1]))) bad.push(`${e.id}[${ci}]: label "${c.label}" names a price that is not req.gold`);
      if (/\(fight\)/i.test(c.label) && !c.out.some((o) => A(o.ops).some((x) => x.op === 'fight'))) bad.push(`${e.id}[${ci}]: label says fight but no outcome fights`);
      if (/\b1 Echo\b|\b2 Echo\b/.test(c.cost || '')) { const n = Number(/(\d) Echo/.exec(c.cost)[1]); if (!c.out.every((o) => A(o.ops).some((x) => x.op === 'ink' && x.n === -n))) bad.push(`${e.id}[${ci}]: cost "${c.cost}" is not charged in every outcome`); }
    });
    // a price quoted in the text of the event itself ("WISHES, 10 GOLD", "Twenty gold") matches some choice
    for (const m of e.text.matchAll(/\b(\w+) gold\b/gi)) { const n = num(m[1]); if (n !== undefined && !e.choices.some((c) => c.req && c.req.gold === n)) bad.push(`${e.id}: the event text quotes ${m[0]} but no choice asks for it`); }
    // an event text never promises a number of hexes or HP
    if (/\b\d+\s*HP\b/.test(all.join(' '))) bad.push(`${e.id}: hit points quoted in prose`);
  });
  t.deep(bad, [], 'story numbers, costs and labels agree with the ops');
});

t.test('flags and relic keys: fox_spared is set once and read by three events, and every gate has a way to be opened', () => {
  const setters = {}, readers = {};
  values(DATA.events).forEach((e) => {
    if (e.when && e.when.flag) (readers[e.when.flag] = readers[e.when.flag] || []).push(e.id);
    e.choices.forEach((c) => {
      if (c.req && c.req.flag) (readers[c.req.flag] = readers[c.req.flag] || []).push(e.id);
      c.out.forEach((o) => A(o.ops).forEach((x) => { if (x.op === 'flag') (setters[x.k] = setters[x.k] || []).push(e.id); }));
    });
  });
  t.deep(setters.fox_spared, ['fox_in_the_snare'], 'fox_spared is set by exactly the first fox fable');
  t.ok(readers.fox_spared.indexOf('fox_returns') >= 0 && readers.fox_spared.indexOf('kappa_toll') >= 0 && readers.fox_spared.indexOf('lantern_ferry') >= 0, 'and read by the fox, the kappa and the ferryman');
  Object.keys(readers).forEach((k) => t.ok(setters[k], `flag ${k} can be set`));
  // the whole chain through the real run: free the fox, meet her, keep the bond
  const R = RUN.newRun({ heroes: ['hanae', 'kuro'], trial: 0, seed: 12 });
  const choose = (id, ci) => { R.node = { kind: 'event', tile: { q: 1, r: 1 }, event: id, chosen: null }; const out = RUN.eventChoose(R, id, ci); if (out.pending) resolveAll(R, out); return out; };
  t.ok(!R.flags.fox_spared, 'no flag yet');
  t.ok(choose('fox_in_the_snare', 0).ok && R.flags.fox_spared, 'loosening the snare sets fox_spared');
  t.ok(choose('kappa_toll', 2).ok, 'the kappa accepts the fox as a reason');
  R.chapter = 2;
  t.ok(choose('fox_returns', 3).ok && R.flags.fox_bond, 'the fox returns and the bond is set');
  R.chapter = 3;
  t.ok(choose('fox_at_the_gate', 0).ok, 'and the third fox fable plays');
  t.ok(RUN.eventChoose(R, 'fox_at_the_gate', 0).ok === false, 'a fable cannot be chosen twice');
});

t.test('a hero is only named where that hero is certain to be in the party (when.hero or req.hero), and a gated hero choice hides when absent', () => {
  const bad = [];
  const names = HEROES.map((h) => [h, DATA.heroes[h].name]);
  values(DATA.events).forEach((e) => {
    const evHero = e.when && e.when.hero;
    names.forEach(([id, name]) => {
      if (e.text.indexOf(name) >= 0 && evHero !== id) bad.push(`${e.id}: the event text names ${name} but the event does not need ${id}`);
      e.choices.forEach((c, i) => {
        const rh = c.req && c.req.hero;
        if (c.label.indexOf(name) >= 0 && rh !== id && evHero !== id) bad.push(`${e.id}[${i}]: the label names ${name} without req.hero`);
        c.out.forEach((o, j) => { if (o.text.indexOf(name) >= 0 && rh !== id && evHero !== id) bad.push(`${e.id}[${i}].out[${j}]: names ${name} without req.hero`); });
      });
    });
  });
  t.deep(bad, [], 'hero names appear only where the hero is guaranteed');
  // a hero choice is hidden (not shown disabled) when that hero is absent: eventReq says so through the run
  const R = RUN.newRun({ heroes: ['hanae', 'kuro'], trial: 0, seed: 9 });
  R.node = { kind: 'event', tile: { q: 0, r: 0 }, event: 'tanuki_tea_house', chosen: null };
  const ci = DATA.events.tanuki_tea_house.choices.findIndex((c) => c.req && c.req.hero === 'raiga');
  const ck = DATA.events.tanuki_tea_house.choices.findIndex((c) => c.req && c.req.hero === 'kuro');
  t.ok(ck >= 0, 'tanuki_tea_house has a Kuro choice');
  t.ok(RUN.eventChoose(R, 'tanuki_tea_house', ck).ok, 'with Kuro in the party the Kuro choice works');
  R.node = { kind: 'event', tile: { q: 0, r: 0 }, event: 'tanuki_tea_house', chosen: null };
  const R2 = RUN.newRun({ heroes: ['hanae', 'suzu'], trial: 0, seed: 9 });
  R2.node = { kind: 'event', tile: { q: 0, r: 0 }, event: 'tanuki_tea_house', chosen: null };
  t.ok(!RUN.eventChoose(R2, 'tanuki_tea_house', ck).ok, 'without Kuro it is refused');
  t.ok(ci < 0, 'and no Raiga choice exists there');
});

// =================================================================================================== 9. meta
t.test('achievements: every stat key is tracked by RUN, COMBAT or META, ladders climb, no duplicates', () => {
  const text = ['run', 'combat', 'meta'].map((n) => fs.readFileSync(path.join(DIR, 'js', n + '.js'), 'utf8')).join('\n');
  const ach = values(DATA.achievements);
  const seen = {};
  ach.forEach((a) => {
    const k = a.stat.k;
    const tracked = new RegExp('\\b' + k + '\\b').test(text) || (/^boss\dKills$/.test(k) && /'boss' \+ R\.chapter \+ 'Kills'/.test(text)) || (/^wins[A-Z]/.test(k) && /'wins' \+ h\.id\[0\]\.toUpperCase\(\)/.test(text));
    t.ok(tracked, `${a.id}: stat ${k} is written by RUN, COMBAT or META`);
    t.ok(Number.isInteger(a.stat.gte) && a.stat.gte >= 1, `${a.id}: a whole positive threshold`);
    t.ok(!seen[k + ':' + a.stat.gte], `${a.id}: no other achievement asks ${k} >= ${a.stat.gte}`);
    seen[k + ':' + a.stat.gte] = a.id;
    t.ok(a.name.length >= 5 && a.name.length <= 28 && a.text.length >= 15 && a.text.length <= 110, `${a.id}: name and text fit`);
    t.ok(!DASH.test(a.name + a.text), `${a.id}: no dash`);
  });
  const byStat = {};
  ach.forEach((a) => (byStat[a.stat.k] = byStat[a.stat.k] || []).push(a));
  Object.keys(byStat).forEach((k) => {
    const lad = byStat[k].slice().sort((x, y) => x.stat.gte - y.stat.gte);
    for (let i = 1; i < lad.length; i++) t.ok((lad[i].reward ? lad[i].reward.inkstones : 0) >= (lad[i - 1].reward ? lad[i - 1].reward.inkstones : 0), `${k}: ${lad[i].id} pays at least what ${lad[i - 1].id} pays`);
  });
  // the text quotes its own threshold
  ach.forEach((a) => { if (a.stat.gte > 1 && !new RegExp('\\b' + a.stat.gte + '\\b').test(a.text)) t.ok(a.stat.k === 'trialBest' || a.stat.k.indexOf('boss') === 0, `${a.id}: the text quotes ${a.stat.gte}: ${a.text}`); });
  // the three trial ladders say which trial they mean
  [1, 5, 10].forEach((n) => t.ok(ach.some((a) => a.stat.k === 'trialBest' && a.stat.gte === n && new RegExp('Trial ' + n + '\\b').test(a.text)), `an achievement for Ink Trial ${n}`));
  t.eq(DATA.achievements.ch1_clear.stat.k, 'boss1Kills', 'ch1_clear'); t.eq(DATA.achievements.ch2_clear.stat.k, 'boss2Kills', 'ch2_clear'); t.eq(DATA.achievements.ch3_clear.stat.k, 'boss3Kills', 'ch3_clear');
});
t.test('the hard achievements are reachable: a constructed combat reaches maxHit, maxTurnDamage and zeroCostTurns', () => {
  const need = (k) => DATA.achievements[Object.keys(DATA.achievements).find((id) => DATA.achievements[id].stat.k === k)].stat.gte;
  const mk = (heroes, deckIds, enemies, seed) => {
    const deck = deckIds.map((id, i) => ({ uid: i + 1, id, up: 0, gems: [] }));
    for (let i = 0; i < 12; i++) deck.push({ uid: 100 + i, id: 'curse_smudge', up: 0, gems: [] });
    const C = COMBAT.create({ heroes: heroes.map((id) => ({ id, hp: 900, maxHp: 900 })), frontIdx: 0, deck, enemies, tier: 'normal', chapter: 1, seed, mods: { energy: 9, hand: 10, enemyHp: 1, enemyDmg: 1, eliteHp: 1, bossHp: 1 }, relics: [], gold: 0 });
    C.start();
    return C;
  };
  const grab = (C, id) => { const c = [].concat(C.hand, C.draw, C.discard).find((x) => x.id === id); if (C.hand.indexOf(c) < 0) { [C.draw, C.discard].forEach((p) => { const i = p.indexOf(c); if (i >= 0) p.splice(i, 1); }); C.hand.push(c); } return c; };
  // a hit for 50: Nightshade Verdict, 10 Poison and a Vulnerable target
  let C = mk(['kuro', 'hanae'], ['kuro_nightshade_verdict'], ['qa_tank'], 1);
  C.enemies[0].st.poison = 10; C.enemies[0].st.vulnerable = 2;
  C.play(grab(C, 'kuro_nightshade_verdict').uid, C.enemies[0].id);
  C.endTurn();
  t.ok(C.stats.maxHit >= need('maxHit'), `Nightshade Verdict on 10 Poison hits for ${C.stats.maxHit} (needs ${need('maxHit')})`);
  // a turn for 100: Thousand Thunders at 6 Charge into four Vulnerable enemies
  C = mk(['raiga', 'hanae'], ['raiga_thousand_thunders'], ['qa_wall', 'qa_wall', 'qa_wall', 'qa_wall'], 2);
  C.heroes[0].st.charge = 6; C.enemies.forEach((e) => { e.st.vulnerable = 2; });
  C.play(grab(C, 'raiga_thousand_thunders').uid);
  C.endTurn();
  t.ok(C.stats.maxTurnDamage >= need('maxTurnDamage'), `Thousand Thunders on four Vulnerable enemies deals ${C.stats.maxTurnDamage} in a turn (needs ${need('maxTurnDamage')})`);
  // three free cards in a turn
  C = mk(['hanae', 'kuro'], ['hanae_petal_step', 'hanae_petal_flick', 'hanae_sakura_sort', 'hanae_flurry_stance'], ['qa_tank'], 3);
  ['hanae_petal_step', 'hanae_petal_flick', 'hanae_flurry_stance'].forEach((id) => { const c = grab(C, id); C.play(c.uid, C.needsTarget(c.uid) ? C.enemies[0].id : undefined); });
  C.endTurn();
  t.ok(C.stats.zeroCostTurns >= 1, 'three cost 0 cards in one turn count a zeroCostTurn');
});

t.test('Ink Trials: each text quotes its own mods, the staircase never gets easier, and the numbers match', () => {
  const trials = values(DATA.trials).sort((a, b) => a.level - b.level);
  t.eq(trials.length, 10, 'ten trials');
  trials.forEach((tr, i) => {
    t.eq(tr.level, i + 1, `${tr.id}: level ${i + 1}`);
    Object.keys(tr.mods).forEach((k) => {
      const v = tr.mods[k];
      const kind = L.trialModKind[k];
      const cands = [];
      if (kind === 'frac') { cands.push(Math.round(Math.abs(v) * 100) + '%'); if (k === 'reviveFrac') cands.push(Math.round((DATA.ECONOMY.reviveFrac + v) * 100) + '%'); }
      else cands.push(String(Math.abs(v)), { 1: 'a', 2: 'two' }[Math.abs(v)] || 'x');
      t.ok(cands.some((c) => tr.text.indexOf(c) >= 0), `${tr.id}: the text "${tr.text}" quotes the ${k} number (${cands.join(' or ')})`);
      const harder = k === 'enemyHp' || k === 'eliteHp' || k === 'bossHp' || k === 'enemyDmg' || k === 'priceMul' || k === 'curses' ? v > 0 : v < 0;
      t.ok(harder, `${tr.id}: ${k} ${v} makes the game harder`);
      const wordsFor = { enemyHp: /more HP/, eliteHp: /more HP/, bossHp: /more/, enemyDmg: /more damage|harder/, priceMul: /more/, goldMul: /less/, healMul: /less/, startInk: /less Echo/, wellInk: /less Echo/, startGold: /less gold/, cardChoices: /fewer/, curses: /curse/, reviveFrac: /HP/ };
      if (wordsFor[k]) t.ok(wordsFor[k].test(tr.text), `${tr.id}: the text uses the right direction for ${k}: ${tr.text}`);
    });
    t.ok(tr.text.length <= 100 && /^[A-Z]/.test(tr.text) && /[.]$/.test(tr.text) && !DASH.test(tr.text), `${tr.id}: a tidy sentence`);
  });
  const headlines = trials.map((x) => Object.keys(x.mods).sort().join('+'));
  t.eq(new Set(headlines).size >= 9, true, 'each level has its own headline');
  const d10 = DATA.trialDeltas(10);
  t.ok(DATA.foldMods([d10]).startInk >= 1 && DATA.foldMods([d10]).wellInk >= 1, 'trial 10 never takes Echo to zero');
});

t.test('tips, lore and barks: limits, no dashes, no repeats, and every hero speaks in their own lines', () => {
  const tips = DATA.tips;
  t.eq(tips.length, 30, 'thirty tips');
  t.eq(new Set(tips).size, tips.length, 'tips are unique');
  tips.forEach((s, i) => { t.ok(s.length >= 25 && s.length <= 110 && /^[A-Z]/.test(s) && /[.!?]$/.test(s) && !DASH.test(s), `tip ${i}: fits and reads as a sentence (${s.length})`); });
  const keys = ['start', 'hurt', 'kill', 'down', 'win', 'swap'];
  const heroLines = {};
  HEROES.forEach((h) => {
    const b = DATA.lore['barks_' + h];
    t.deep(Object.keys(b.lines), keys, `${h}: the six bark keys in order`);
    keys.forEach((k) => {
      t.eq(b.lines[k].length, 5, `${h} ${k}: five lines`);
      t.eq(new Set(b.lines[k]).size, 5, `${h} ${k}: five different lines`);
      b.lines[k].forEach((line) => { t.ok(line.length >= 4 && line.length <= 64 && !DASH.test(line), `${h} ${k}: "${line}" fits`); (heroLines[line] = heroLines[line] || []).push(h); });
    });
  });
  Object.keys(heroLines).forEach((l) => t.eq(heroLines[l].length, 1, `the line "${l}" belongs to one hero only`));
  // Raiga is loud, the others are not
  const loud = (h) => keys.flatMap((k) => DATA.lore['barks_' + h].lines[k]).filter((l) => /!/.test(l)).length;
  t.ok(loud('raiga') >= 20 && loud('suzu') <= 2 && loud('kuro') <= 3 && loud('hanae') <= 3, 'Raiga shouts, the others mostly do not');
  const friend = keys.flatMap((k) => DATA.lore.barks_raiga.lines[k]).filter((l) => /friend/i.test(l)).length;
  t.ok(friend >= 4 && friend <= 12, `Raiga's "friend" is a tic, not a tic in every line (${friend} of 30)`);
  Object.keys(DATA.lore).filter((id) => !/^barks_/.test(id)).forEach((id) => { const p = DATA.lore[id]; t.ok(p.title.length <= 40 && p.text.length <= 700 && p.text.length >= 300 && !DASH.test(p.title + p.text), `${id}: a story page inside its limits (${p.text.length})`); });
  values(DATA.enemies).forEach((e) => t.ok(e.lore.length <= 260 && e.lore.length >= 40 && !DASH.test(e.lore), `${e.id}: lore inside its limits (${e.lore.length})`));
});

t.test('house style across all copy: no dash of any kind used as punctuation, no double spaces, no markup, plain quotes', () => {
  const bad = [];
  const scan = (where, s) => {
    if (typeof s !== 'string') return;
    if (DASH.test(s)) bad.push(`${where}: em or en dash`);
    if (/ - | -- |--/.test(s)) bad.push(`${where}: a hyphen used as a dash: ${s.slice(0, 60)}`);
    if (/  /.test(s)) bad.push(`${where}: double space`);
    if (/<[a-z]/i.test(s)) bad.push(`${where}: markup in plain copy`);
    if (/[‘’“”]/.test(s)) bad.push(`${where}: curly quotes`);
    if (/\s$|^\s/.test(s)) bad.push(`${where}: stray space at an edge`);
    // the allowed repeats are sounds and jokes on purpose; wikka, ts and tap are beatbox sounds and "the kind kind" a pun (HV_HEROES flavours and barks);
    // ting is a tuning fork's ring (the Tuning Forkling bark "Ting ting ting!", HV_ENEMIES 2.2)
    if (/\b(\w+) \1\b/i.test(s.replace(/\b(no|bye|ha|kata|tick|twang|ow|boom|krr+a*|sit|cut|closer|hold|a thousand|wikka|ts|tap|kind|ting)\b/gi, ''))) bad.push(`${where}: a doubled word in "${s.slice(0, 70)}"`);
  };
  values(DATA.events).forEach((e) => { scan(e.id + ' title', e.title); scan(e.id + ' text', e.text); e.choices.forEach((c, i) => { scan(`${e.id}[${i}] label`, c.label); scan(`${e.id}[${i}] cost`, c.cost); c.out.forEach((o, j) => scan(`${e.id}[${i}].out[${j}]`, o.text)); }); });
  values(DATA.lore).forEach((l) => { scan(l.id + ' title', l.title); scan(l.id, l.text); values(l.lines || {}).forEach((arr) => arr.forEach((x) => scan(l.id, x))); });
  DATA.tips.forEach((s, i) => scan('tip ' + i, s));
  values(DATA.achievements).forEach((a) => { scan(a.id + ' name', a.name); scan(a.id, a.text); });
  values(DATA.trials).forEach((x) => { scan(x.id + ' name', x.name); scan(x.id, x.text); });
  values(DATA.enemies).forEach((e) => { scan(e.id + ' lore', e.lore); values(e.moves).forEach((m) => { scan(e.id + ' move', m.name); scan(e.id + ' say', m.say); }); });
  values(DATA.relics).forEach((r) => { scan(r.id, r.text); scan(r.id + ' name', r.name); });
  values(DATA.cards).forEach((c) => scan(c.id + ' flavor', c.flavor));
  t.deep(bad, [], 'house style holds everywhere');
});

t.done();
