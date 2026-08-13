// EMBERKIN — which of the suite's checks can actually fail?
//
//   node tools/emberkin/tautology.mjs            # the whole set
//   node tools/emberkin/tautology.mjs --plant    # prove the sweep bites first
//
// Five passes running produced a check that no break could make fail: an
// `ok(at < arr.length)` after a findIndex (177), a count whose two sides were
// the same constant (178), a sweep that reported clean because it had crashed
// (179), and scene errors that read as findings (180, 181). Reading the suite
// does not find these — the 177 one sat under a comment claiming it proved
// something. Only mutation does: break the SUBJECT and see whether the check
// notices.
//
// This asserts nothing. It runs the render suite against a set of mutants and
// prints, per section, how many of that section's checks ever died. A section
// whose subject is mutated and whose checks all survive is where a sentence is
// hiding. It is NOT a claim that a never-killed check is worthless — this set
// is small and targeted, so most checks are simply out of its reach, and the
// report says which sections were aimed at.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GAME = join(REPO, 'emberkin', 'index.html');
const SUITE = join(REPO, 'tests', 'emberkin_render.test.mjs');
const TMP = process.env.EK_TMP || '/tmp/emberkin_mutants';
mkdirSync(TMP, { recursive: true });
const SRC = readFileSync(GAME, 'utf8');

// Each mutation is a real behaviour change, aimed at a section of the suite.
// `aims` names the sections it should be able to reach; a mutation that kills
// nothing at all is reported too, because that means the mutation missed.
const MUTANTS = [
  { name: 'motes: the fade removed', aims: ['no speck of air is ever born visible'],
    find: '    a: fade * breath,', to: '    a: breath,' },
  { name: 'motes: one shared clock', aims: ['no speck of air is ever born visible'],
    find: '  const life = 6 + fx * 5;', to: '  const life = 8;' },
  { name: 'motes: the draw threshold ignored', aims: ['no speck of air is ever born visible'],
    find: '    if (m.a < 1 / 255) continue;', to: '    if (false) continue;' },
  { name: 'arena: the ground haze deleted', aims: ['the element reaches the ground, not just the sky', 'the light is under the kin, not over them'],
    find: '  g.fillRect(0, hz.y, VIEW_W, hz.h); g.restore();', to: '  g.restore();' },
  { name: 'arena: haze weaker than nothing', aims: ['the element reaches the ground, not just the sky', 'PLANTED'],
    find: 'const SKY_WASH = .16, GROUND_HAZE = .12;', to: 'const SKY_WASH = .16, GROUND_HAZE = 0;' },
  { name: 'arena: the haze band stops short', aims: ['the element reaches the ground, not just the sky'],
    find: '  y: HORIZON + 6, h: VIEW_H - HORIZON - 6,', to: '  y: HORIZON + 6, h: 40,' },
  { name: 'chest: the replaced card unnamed', aims: ['a pull that costs you a card says which card'],
    find: "const swapNote = (c) => (c && c.replaced ? `replaced ${c.replaced}` : '');",
    to: "const swapNote = (c) => '';" },
  { name: 'chest: a full deck grows instead of swapping', aims: ['a pull that costs you a card says which card'],
    find: '  G.deck = G.deck.filter((u) => u !== worst.u);\n  G.deck.push(c.u);', to: '  G.deck.push(c.u);' },
  { name: 'menus: no way back at all', aims: ['back out of a menu row goes back to the menu', 'back out of a battle menu row goes back to the battle menu', 'and the pause menu still goes back the same way'],
    find: '  G.screen = { kind, i, sel: null, opt, prev: from, prevRow: fromRow, prevMenu: fromMenu };',
    to: '  G.screen = { kind, i, sel: null, opt, prev: from, prevRow: fromRow, prevMenu: null };' },
  { name: 'menus: the row forgotten', aims: ['back out of a menu row goes back to the menu', 'back out of a battle menu row goes back to the battle menu'],
    find: 'prevRow: fromRow, prevMenu: fromMenu };', to: 'prevRow: 0, prevMenu: fromMenu };' },
  { name: 'menus: the battle actions never come back', aims: ['back out of a battle menu row goes back to the battle menu'],
    find: "    if (s.prevMenu === 'battlemenu') openBattleActions(s.prevRow || 0);\n", to: '' },
  { name: 'menus: the pause menu never comes back', aims: ['back out of a menu row goes back to the menu', 'and the pause menu still goes back the same way'],
    find: "  if (s.prevMenu === 'mainmenu' && G.map) { openMainMenu({ i: s.prevRow || 0, quiet: true }); return; }\n", to: '' },
  { name: 'menus: the battle rows discard provenance again', aims: ['back out of a battle menu row goes back to the battle menu'],
    find: "    { label: 'Kin', fn: () => openScreen('party') },", to: "    { label: 'Kin', fn: () => { closeMenu(); openScreen('party'); } }," },
  { name: 'opening: no fade', aims: ['the game opens the way it changes any other scene'],
    find: 'const OPEN_FADE = .45;', to: 'const OPEN_FADE = 0;' },
  { name: 'covers: the screen is never covered', aims: ['a beat is not shown while the screen is covered'],
    find: 'const screenCovered = () => (G.fade > 0) || !!G.warp || G.wipe > 0;',
    to: 'const screenCovered = () => false;' },
  { name: 'ambush: the recoil never moves you', aims: ['being called out happens to you as well as to them'],
    find: 'const BUMP_T = .18;', to: 'const BUMP_T = 0;' },
  { name: 'exit: no cover handing the map back', aims: ['a fight hands the map back the way everything else does'],
    find: 'const BATTLE_OUT = .22;', to: 'const BATTLE_OUT = 0;' },
  { name: 'exit: the evolution keeps its hard cut', aims: ['a fight hands the map back the way everything else does'],
    find: '    if (nxt) runEvolution(nxt);\n    else backToWorld();', to: '    if (nxt) runEvolution(nxt);\n    else saveGame();' },
  { name: 'sound: the flourish borrows the level cue', aims: ['two different beats do not make the same sound'],
    find: "    battleBar(false);\n  }\n  playCue('win');", to: "    battleBar(false);\n  }\n  playCue('level');" },
  // A partial edit here is not a duplicate at all — the first version of this
  // mutant changed one of the three notes and killed nothing, which the sweep
  // correctly reported as a mutation that missed rather than as a sentence.
  { name: 'sound: win defined as a copy of level', aims: ['two different beats do not make the same sound'],
    find: "    blip(note(19), .14, 'triangle', .055);\n    blip(note(12), .26, 'triangle', .06, t + .1);\n    blip(note(0), .34, 'sine', .05, t + .1);",
    to: "    [0, 4, 7, 12].forEach((s2, i) => blip(note(12 + s2), .16, 'square', .05, t + i * .07));" },
  { name: 'said: the level names nothing', aims: ['a beat that changes your numbers says which ones'],
    find: "    const d = (after[k] || 0) - (before[k] || 0);\n    if (d) parts.push", to: "    const d = 0;\n    if (d) parts.push" },
  { name: 'said: zeroes named too', aims: ['a beat that changes your numbers says which ones'],
    find: "    if (d) parts.push(`${d > 0 ? '+' : ''}${d} ${label}`);", to: "    parts.push(`${d > 0 ? '+' : ''}${d} ${label}`);" },
  { name: 'skip: the evolution cannot be pressed past', aims: ['the longest beat in the game can be pressed past'],
    find: "  if (bi > 0 && a.i < bi && (justPressed('a') || justPressed('b'))) {", to: '  if (false) {' },
  { name: 'skip: the flourish stops answering', aims: ['every beat that can be pressed past still can'],
    find: "  if (f.t < FLOURISH_T && !justPressed('a') && !justPressed('b')) return true;", to: '  if (f.t < FLOURISH_T) return true;' },
  // ---- pass 188: aimed at the OLDEST sections, none of which had ever had a
  // mutant pointed at them. 75 of ~88 sections were unswept, and a 0 from this
  // tool only started meaning something once 187 made source checks visible.
  { name: 'wide: two maps lit the same way', aims: ['every map is lit as its own place'],
    find: "  lab:         { tint: [150, 190, 255], grade: .20, vig: .56, motes: 12,  mc: [190, 220, 255], drift: [2, -5] },",
    to:   "  lab:         { tint: [255, 208, 140], grade: .17, vig: .46, motes: 16, mc: [255, 226, 170], drift: [-4, -7] }," },
  { name: 'wide: a place loses its weather', aims: ['weather belongs to the place'],
    find: "  route_one: 'motes',", to: '' },
  { name: 'wide: a theme loses its lead', aims: ['every theme is shaped like something musicTick can play'],
    find: '  route: {                        // Route One: open, bright, walking pace',
    to:   '  route: { lead: [], bpm: 116, order: [0], bass: [0] }, routeOld: {' },
  { name: 'wide: the hand is a row, not a fan', aims: ['the hand is a fan, not a row'],
    find: 'function fanStyle(i, n, selected) {', to: 'function fanStyle(i, n, selected) { return \'\';' },
  { name: 'wide: a card face says nothing', aims: ['a card face carries everything you need to read it'],
    find: 'function cardHTML(c, opt = {}) {', to: 'function cardHTML(c, opt = {}) { if (c) return \'<div></div>\';' },
  { name: 'wide: a count never pluralises', aims: ['a count and its noun agree'],
    find: 'const countOf = (n, one, many) => `${n} ${n === 1 ? one : (many || one + \'s\')}`;',
    to:   'const countOf = (n, one, many) => `${n} ${one}`;' },
  { name: 'wide: the stats block goes blank', aims: ['the box shows what the kin under the cursor can do'],
    find: 'function statBlock(m) {\n  if (!m) return \'\';', to: 'function statBlock(m) {\n  return \'\';' },
  // Aimed at `shelve`, which is what that section actually tests. The first
  // version broke `screenList` — a different function the section never calls —
  // and reported 0 killed, which reads exactly like a section that cannot fail.
  { name: 'wide: the bag stops being shelved', aims: ['the screens have a shape'],
    find: 'function shelve(', to: 'function shelve(keys) { return [[\'All\', keys]]; }\nfunction shelveOld(' },

  { name: 'phone: the list never follows the cursor', aims: ['the list follows the cursor'],
    find: '  if (sel.top - pad < box.scrollTop) return Math.max(0, sel.top - pad);', to: '  return box.scrollTop;' },
  { name: 'phone: the list shifts under an in-view selection', aims: ['the list follows the cursor'],
    find: '  if (sel.top - pad < box.scrollTop) return Math.max(0, sel.top - pad);\n  const bottom', to: '  return Math.max(0, sel.top - pad);\n  const bottom' },

  { name: 'grid: counts the document, not the cursor row', aims: ['the cursor moves by the grid it is in'],
    find: "  const scope = cur && cur.parentElement && cur.parentElement.querySelector(SEL)\n    ? cur.parentElement : els.screen;",
    to: '  const scope = els.screen;' },
  { name: 'grid: colsFrom counts every cell', aims: ['the cursor moves by the grid it is in'],
    find: '  for (const t of tops) { if (t !== top) break; n++; }', to: '  for (const t of tops) { void t; n++; }' },

  { name: 'settle: the hand forgets the damper', aims: ['the card in your hand does not promise what the swing will not pay'],
    find: '    return eff === 0 ? 0 : Math.max(1, Math.floor((dmg + bonus.flat) * bonus.mul * mineSwingMul(b)));\n  };\n  return { lo: swing(.85), hi: swing(1), hits: bonus.hits };',
    to: '    return eff === 0 ? 0 : Math.max(1, Math.floor((dmg + bonus.flat) * bonus.mul));\n  };\n  return { lo: swing(.85), hi: swing(1), hits: bonus.hits };' },
  { name: 'settle: the damper applies to every swing', aims: ['the card in your hand does not promise what the swing will not pay'],
    find: 'const mineSwingMul = (b) => (b && b.settling ? SETTLE_MUL : 1);',
    to: 'const mineSwingMul = () => SETTLE_MUL;' },

  { name: 'shelf: a full shelf of refusals says nothing', aims: ['a shelf where nothing can be taken says so'],
    find: "  if (!list.every((k) => rowDead(kind, k, inFight))) return '';",
    to: "  if (list.length) return '';" },
  { name: 'shelf: the shop stops reading its own prices', aims: ['a shelf where nothing can be taken says so'],
    find: "  if (kind === 'shop') return G.money < it.cost;",
    to: "  if (kind === 'shop') return false;" },

  { name: 'cost: the switch price stops scaling', aims: ['the screen that takes something says what it costs'],
    find: '  edge: b && b.foe ? Math.round(SWITCH_PUNISH * planScale(b.foe.lvl)) : 0,',
    to: '  edge: b && b.foe ? SWITCH_PUNISH : 0,' },
  { name: 'cost: the party screen never names the price', aims: ['the screen that takes something says what it costs'],
    find: '    } else if (G.battle && B() && B().foe && B().foe.hp > 0 && !B().over) {',
    to: '    } else if (false) {' },

  { name: 'fold: scrollFor forgets the cover above it', aims: ['the question stays on a screen that will not close'],
    find: '  if (sel.top - pad < box.scrollTop) return Math.max(0, sel.top - pad);',
    to: '  if (sel.top < box.scrollTop) return Math.max(0, sel.top);' },
  { name: 'fold: the pinned question comes unpinned', aims: ['the question stays on a screen that will not close'],
    find: '  #screen .shead{ position:sticky; top:-12px;',
    to: '  #screen .shead{ position:static; top:-12px;' },

  { name: 'edge: the scroll mark goes black on near-black again', aims: ['a screen that scrolls says so, visibly'],
    find: '      linear-gradient(0deg, rgba(74,53,96,.9), rgba(74,53,96,0)) bottom / 100% 22px scroll no-repeat,',
    to: '      linear-gradient(0deg, rgba(0,0,0,.6), rgba(0,0,0,0)) bottom / 100% 22px scroll no-repeat,' },
  { name: 'edge: the cover no longer hides its mark', aims: ['a screen that scrolls says so, visibly'],
    find: '      linear-gradient(0deg,#0d0913 42%, #0d091300) bottom / 100% 26px local no-repeat,',
    to: '      linear-gradient(0deg,#0d0913 42%, #0d091300) bottom / 100% 12px local no-repeat,' },

  { name: 'chip: the matchup labels repaint the chips again', aims: ['a type chip is legible on its own colour'],
    find: '  .pickcard .matchup span:not(.tp){ color:var(--dim);',
    to: '  .pickcard .matchup span{ color:var(--dim);' },
  { name: 'chip: the chip ink stops being dark', aims: ['a type chip is legible on its own colour'],
    find: 'border-radius:3px; color:#120d18; font-weight:700; }',
    to: 'border-radius:3px; color:#6b6270; font-weight:700; }' },

  { name: 'type: the mark exact-matches a double again', aims: ['every multiplier the game can produce has a word for it'],
    find: "    : e > 1 ? { tag: 'STRONG', cls: 'eff-good' }",
    to: "    : e === 2 ? { tag: 'STRONG', cls: 'eff-good' }" },
  { name: 'type: the mark exact-matches a single resist again', aims: ['every multiplier the game can produce has a word for it'],
    find: "      : e < 1 ? { tag: 'RESISTED', cls: 'eff-bad' }",
    to: "      : e === 0.5 ? { tag: 'RESISTED', cls: 'eff-bad' }" },
  // …and one aimed at `effect` itself, because without it the 64-pair
  // enumeration above is unproven: the section reported 2 of 103 killed, and
  // the 64 were simply out of reach of every mutant in the set.
  { name: 'type: effect stops multiplying across the second type', aims: ['every multiplier the game can produce has a word for it'],
    find: '  defTypes.reduce((m, t) => m * ((CHART[moveType] || {})[t] ?? 1), 1);',
    to: '  ((CHART[moveType] || {})[defTypes[0]] ?? 1);' },

  { name: 'move: the card stops saying whether it lands', aims: ['a move card says whether it lands'],
    find: '  if (m.acc > 0 && m.acc < 100) bits.push(`${m.acc}% to land`);',
    to: '  if (m.acc > 0 && m.acc < 60) bits.push(`${m.acc}% to land`);' },
  { name: 'move: nothing can miss any more', aims: ['a move card says whether it lands'],
    find: "  if (m.acc && rnd(100) >= m.acc) { snap(log, `${who}'s attack missed!`, 'miss', atkSide); return; }",
    to: "  if (false) { snap(log, `${who}'s attack missed!`, 'miss', atkSide); return; }" },

  { name: 'bag: a fight stops dimming anything again', aims: ['a bag row in a fight refuses before you press it'],
    find: '  if (inFight) return !battleItemUse(k, null).ok;',
    to: '  if (inFight) return false;' },
  { name: 'bag: an orb is offered against a trainer', aims: ['a bag row in a fight refuses before you press it'],
    find: "    return b && b.wild ? { ok: true, why: '' }",
    to: "    return true ? { ok: true, why: '' }" },
  { name: 'bag: the shelf note speaks the footpath mid-fight', aims: ['a bag row in a fight refuses before you press it'],
    find: '  const why = (k) => (inFight ? battleItemUse(k, null) : fieldItemUse(k)).why;',
    to: '  const why = (k) => fieldItemUse(k).why;' },

  { name: 'status: the card promises what the foe cannot take', aims: ['a card does not promise a status the thing in front of you cannot take'],
    find: '    bits.push(safe ? `it shrugs off ${fx.st[0]}` : `may ${fx.st[0]}`);',
    to: '    bits.push(`may ${fx.st[0]}`);' },
  { name: 'status: the resolver stops honouring the immunity', aims: ['a card does not promise a status the thing in front of you cannot take'],
    find: "    if (!defender.status && chance(p) && !defender.types.includes(IMMUNE_TO[st] || '')) {",
    to: '    if (!defender.status && chance(p)) {' },
  { name: 'status: the burn tick halves', aims: ['a card does not promise a status the thing in front of you cannot take'],
    find: '      const d = Math.max(1, Math.floor(mon.max / 16));',
    to: '      const d = Math.max(1, Math.floor(mon.max / 32));' },

  { name: 'deck: the card goes back to promising a wasted rider', aims: ['a deck card does not promise a status the foe shrugs off'],
    find: '    ? `${said} It shrugs that off.` : said;',
    to: '    ? said : said;' },
  { name: 'deck: the card stops substituting its value', aims: ['a deck card does not promise a status the foe shrugs off'],
    // Re-anchored: pass 207 made this line live, so the old anchor went stale.
    // The mutation is the same one — the card stops putting its value in.
    find: "  let said = c.txt.replace('{v}', cardValue(inst) + combo);",
    to: '  let said = c.txt;' },

  { name: 'trainer: the winners go silent again', aims: ['a trainer who beats you gets to say so'],
    find: '    const beat = b.npc && b.npc.trainer.win ? b.npc.trainer.win : [];',
    to: '    const beat = [];' },
  { name: 'trainer: the line is spoken by nobody', aims: ['a trainer who beats you gets to say so'],
    find: "    say(beat.length ? b.npc.name : '',",
    to: "    say(''," },

  { name: 'world: Crown Hollow goes mute again', aims: ['every place names itself, and every sign can be read from the ground'],
    find: "    signs: { '10,10': 'CROWN HOLLOW. Down: Emberwood. The shrine is at the top. Whatever sits on it was here first.' },",
    to: '    signs: {},' },
  { name: 'world: a sign is read off the tile you stand on', aims: ['every place names itself, and every sign can be read from the ground'],
    find: "  const sign = (G.map.signs || {})[tx + ',' + ty];",
    to: "  const sign = (G.map.signs || {})[p.x + ',' + p.y];" },
  { name: 'world: the board stops being a board', aims: ['every place names itself, and every sign can be read from the ground'],
    find: "      '##......==S.......##',",
    to: "      '##......==........##'," },

  { name: 'save: the deck repair goes away again', aims: ['a save never loads into a game you could not have been playing'],
    find: '  for (let i = 0; G.deck.length < DECK_MIN; i++) grantCard(STARTER_DECK[i % STARTER_DECK.length]);',
    to: '' },
  { name: 'save: the repair throws away what survived', aims: ['a save never loads into a game you could not have been playing'],
    find: '  for (const c of G.cards) { if (G.deck.length >= DECK_MIN) break; if (!G.deck.includes(c.u)) G.deck.push(c.u); }',
    to: '  G.deck = [];' },
  { name: 'save: a nickname stops being written', aims: ['a save never loads into a game you could not have been playing'],
    find: "nm: m.nick || ''",
    to: "nm: ''" },
  { name: 'save: money forgets its default', aims: ['a save never loads into a game you could not have been playing'],
    find: 'G.money = blob.money ?? 500;',
    to: 'G.money = blob.money;' },

  { name: 'dex: the habitat line stops after its first sentence', aims: ['the dex says every way there is to get a kin, not the first one'],
    find: "  if (where.length) said.push('Found in ' + where.join(' · ') + '.');",
    to: "  if (where.length) return 'Found in ' + where.join(' · ') + '.';" },
  { name: 'dex: the starters stop being told they are starters', aims: ['the dex says every way there is to get a kin, not the first one'],
    find: "  if (STARTERS.includes(id)) said.push('One of the three Elder Rowan hands out.');",
    to: '' },
  { name: 'dex: a kin keeps the first four moves it ever learns', aims: ['the dex says every way there is to get a kin, not the first one'],
    find: '  return uniq.slice(-4).map((m) => ({ id: m, pp: MOVES[m].pp, max: MOVES[m].pp }));',
    to: '  return uniq.slice(0, 4).map((m) => ({ id: m, pp: MOVES[m].pp, max: MOVES[m].pp }));' },
  { name: 'dex: a built kin reads the wrong base stat', aims: ['the dex says every way there is to get a kin, not the first one'],
    find: '    atk: statAt(sp.base[1], lvl), def: statAt(sp.base[2], lvl), spd: statAt(sp.base[3], lvl),',
    to: '    atk: statAt(sp.base[2], lvl), def: statAt(sp.base[2], lvl), spd: statAt(sp.base[3], lvl),' },

  { name: 'shop: Bell hand-copies the salve again', aims: ['every price the game speaks is read off the table it is a price in'],
    find: '          const floor = Object.keys(ITEMS).reduce((a, b) => (ITEMS[b].cost < ITEMS[a].cost ? b : a));',
    to: "          const floor = 'salve';" },
  { name: 'shop: Bell calls the dearest thing her floor', aims: ['every price the game speaks is read off the table it is a price in'],
    find: '(a, b) => (ITEMS[b].cost < ITEMS[a].cost ? b : a)',
    to: '(a, b) => (ITEMS[b].cost > ITEMS[a].cost ? b : a)' },
  { name: 'shop: a row dies one shard early', aims: ['every price the game speaks is read off the table it is a price in'],
    find: "  if (kind === 'shop') return G.money < it.cost;",
    to: "  if (kind === 'shop') return G.money <= it.cost;" },
  { name: 'shop: Vane hand-copies his floor too', aims: ['every price the game speaks is read off the table it is a price in'],
    find: '          const floor = Math.min(...CHEST_IDS.map((k) => CHESTS[k].cost));',
    to: '          const floor = 60;' },

  { name: 'card: the value stops being live again', aims: ['the number on a card is the number playing it hands over'],
    find: '  const combo = c.combo && bat && (bat.playedTurn || 0) > 0 ? c.combo : 0;',
    to: '  const combo = 0;' },
  { name: 'card: the cost stops being live', aims: ['the number on a card is the number playing it hands over'],
    find: '  const chain = def.chain && b ? def.chain * (b.playedTurn || 0) : 0;',
    to: '  const chain = 0;' },
  { name: 'card: a field and its sentence drift apart', aims: ['the number on a card is the number playing it hands over'],
    find: "vt: 'shield', fx: { thorns: 4 },",
    to: "vt: 'shield', fx: { thorns: 6 }," },
  { name: 'card: the combo clause is matched by hand', aims: ['the number on a card is the number playing it hands over'],
    find: "  if (combo) said = said.replace(`Combo +${combo}.`, 'It follows through.');",
    to: "  if (combo) said = said.replace('Combo +10.', 'It follows through.');" },

  { name: 'log: the heal line claims a heal again', aims: ['the log says what happened, and only when it happened'],
    find: "    snap(log, b.mine.hp > was ? `${dispName(b.mine)} recovers.` : `${dispName(b.mine)} is already whole.`, 'heal', 'mine');",
    to: "    snap(log, `${dispName(b.mine)} recovers.`, 'heal', 'mine');" },
  { name: 'log: the shield line says the leftover, not the absorbed', aims: ['the log says what happened, and only when it happened'],
    find: "    if (absorbed > 0) snap(log, `Shield absorbs ${absorbed}.`, 'block', 'mine');",
    to: "    if (absorbed > 0) snap(log, `Shield absorbs ${dmg}.`, 'block', 'mine');" },
  { name: 'log: a buff line says the delta, not the total', aims: ['the log says what happened, and only when it happened'],
    find: "  if (amt('atk')) { b.mods.atk += amt('atk'); snap(log, `Every attack now hits for +${b.mods.atk}.`, 'buff', 'mine'); }",
    to: "  if (amt('atk')) { b.mods.atk += amt('atk'); snap(log, `Every attack now hits for +${amt('atk')}.`, 'buff', 'mine'); }" },
  // Aimed at the LIVE thorns site. The other copy sits behind `PLAN_CHIP > 0`
  // with PLAN_CHIP = 0 — statically unreachable, a guarded pass-35 experiment —
  // so a mutant there kills nothing because it cannot run, not because the
  // check is a sentence. Checked by hand before choosing this one.
  { name: 'twice: the faint stops guarding itself', aims: ['a faint resolves once, whoever notices it'],
    find: '  if (b.over || b.foe.hp > 0) return;\n',
    to: '' },
  // A mutant that makes resolveFoeDown return unconditionally was tried and
  // removed: it breaks every battle, so the suite CRASHES and its kills are not
  // evidence — and it would add a permanent known crash to the detector's
  // report, which is the one signal that has to stay clean. The two below fail
  // cleanly and say the same thing.
  { name: 'twice: only the final faint is guarded', aims: ['a faint resolves once, whoever notices it'],
    find: '  if (b.over || b.foe.hp > 0) return;\n  snap(log, `${b.wild',
    to: '  if (b.over) return;\n  snap(log, `${b.wild' },
  // NOT aimed here: removing afterFoe's own `!b.over` now kills nothing,
  // because the function guards itself — the caller's guard has become
  // redundant, which is the point. Removing BOTH still fails 3 checks, so the
  // rule is held; it is just no longer held there. A mutant that cannot change
  // behaviour is not evidence about a check, so it is left out rather than
  // reported as a zero.

  { name: 'early: the missing-card guard goes away again', aims: ['a path that bails out leaves nothing behind it'],
    find: 'const cardDef = (id) => CARDS[id] || CARD_GONE;',
    to: 'const cardDef = (id) => CARDS[id];' },
  { name: 'early: every card reads as the stand-in', aims: ['a path that bails out leaves nothing behind it'],
    find: 'const cardDef = (id) => CARDS[id] || CARD_GONE;\n',
    to: 'const cardDef = (id) => CARD_GONE;\n' },
  { name: 'early: the refused swing keeps the card it took', aims: ['a path that bails out leaves nothing behind it'],
    find: '    if (b.swungTurn) { b.hand.splice(i, 0, card); b.energy += cost; snap(log,',
    to: '    if (b.swungTurn) { b.energy += cost; snap(log,' },
  { name: 'early: the refused swing keeps the energy it charged', aims: ['a path that bails out leaves nothing behind it'],
    find: '    if (b.swungTurn) { b.hand.splice(i, 0, card); b.energy += cost; snap(log, `${dispName(b.mine)}',
    to: '    if (b.swungTurn) { b.hand.splice(i, 0, card); snap(log, `${dispName(b.mine)}' },

  { name: 'rule: the path heals a kin that is out cold again', aims: ['the fight and the path answer the same question the same way'],
    find: "  const target = G.party.find((m) => (it.kind === 'revive' ? m.hp <= 0 : m.hp > 0 && m.hp < m.max)) || G.party[0];",
    to: "  const target = G.party.find((m) => (it.kind === 'revive' ? m.hp <= 0 : m.hp < m.max)) || G.party[0];" },
  { name: 'rule: the path stops asking whether you own it', aims: ['the fight and the path answer the same question the same way'],
    find: "  if (!(G.bag[id] > 0)) return { ok: false, why: 'You have none of those.', target: null };",
    to: '  if (false) return { ok: false, why: \'You have none of those.\', target: null };' },
  { name: 'rule: the refusal stops naming the reviver off the table', aims: ['the fight and the path answer the same question the same way'],
    find: "      const rev = Object.keys(ITEMS).find((k) => ITEMS[k].kind === 'revive');",
    to: '      const rev = null;' },
  { name: 'rule: a whole party can still be salved', aims: ['the fight and the path answer the same question the same way'],
    find: "    if (target.hp >= target.max) return { ok: false, why: 'Nobody needs that.', target: null };",
    to: "    if (false) return { ok: false, why: 'Nobody needs that.', target: null };" },

  // Anchored on doAction's preceding line: endTurn and doAction now have
  // IDENTICAL tails, which is the whole point of the pass, so the tail alone
  // matches twice.
  { name: 'turn: doAction throws the whole hand away again', aims: ['a retained card stays whichever way the turn ended'],
    find: "this will hurt.`, 'buff', 'foe');\n  }\n\n  dropHand(log);",
    to: "this will hurt.`, 'buff', 'foe');\n  }\n\n  b.disc.push(...b.hand);\n  b.hand = [];" },
  { name: 'turn: every card is treated as retained', aims: ['a retained card stays whichever way the turn ended'],
    find: "  const kept = b.hand.filter((c) => c.src !== 'kin' && CARDS[c.id] && CARDS[c.id].retain);",
    to: "  const kept = b.hand.filter((c) => c.src !== 'kin');" },
  { name: 'turn: the shield stops being for one round', aims: ['a retained card stays whichever way the turn ended'],
    find: '  b.shield = 0;                                   // shield is for one round only',
    to: '  // shield is for one round only' },
  { name: 'turn: swungTurn never resets', aims: ['a retained card stays whichever way the turn ended'],
    find: '  b.swungTurn = 0;                                // one attack a turn, no more',
    to: '  // one attack a turn, no more' },

  { name: 'switch: the called-back foe leaves its telegraph behind', aims: ['when the foe on the field changes, the telegraph changes with it'],
    find: '  // still said 36 while the player decided whether to block.\n  readIntent();\n}',
    to: '}' },
  { name: 'switch: the departing foe keeps its sharpen and its aim', aims: ['when the foe on the field changes, the telegraph changes with it'],
    find: '  b.foeShield = 0; b.foeEdge = 0; b.foePierce = 0; b.cornered = 0; b.chipping = 0;',
    to: '  b.foeShield = 0; b.cornered = 0; b.chipping = 0;' },
  { name: 'switch: your mods survive the switch', aims: ['when the foe on the field changes, the telegraph changes with it'],
    find: '  b.mods = freshMods();\n  b.maxAdd = 0;',
    to: '  b.mods.edge = 0;\n  b.maxAdd = 0;' },
  { name: 'switch: the max-HP bill is never paid', aims: ['when the foe on the field changes, the telegraph changes with it'],
    find: '    mon.max = Math.max(1, mon.max - add);',
    to: '    mon.max = Math.max(1, mon.max);' },
  { name: 'switch: the old kin keeps its cards in the draw pile', aims: ['when the foe on the field changes, the telegraph changes with it'],
    find: '  b.draw = strip(b.draw); b.hand = strip(b.hand); b.disc = strip(b.disc);',
    to: '  b.hand = strip(b.hand); b.disc = strip(b.disc);' },

  { name: 'chip: the bank a pierce ignores is counted again', aims: ['the chip promises the hit that is actually coming'],
    find: '  const bank = b.foePierce ? 0 : (b.shield || 0);',
    to: '  const bank = (b.shield || 0);' },
  { name: 'chip: the bank stops counting at all', aims: ['the chip promises the hit that is actually coming'],
    find: '  const bank = b.foePierce ? 0 : (b.shield || 0);\n  const cut =',
    to: '  const bank = 0;\n  const cut =' },
  { name: 'chip: the alarm reads the bottom of the range', aims: ['the chip promises the hit that is actually coming'],
    find: '  return through.hi >= b.mine.hp;',
    to: '  return through.lo >= b.mine.hp;' },
  { name: 'chip: the aim beat announces a pierce it never sets', aims: ['the chip promises the hit that is actually coming'],
    find: "    if (p.pierce) { b.foePierce = 1; snap(log, `${dispName(b.foe)} ${p.line(n)}`, 'buff', 'foe'); }",
    to: "    if (p.pierce) { snap(log, `${dispName(b.foe)} ${p.line(n)}`, 'buff', 'foe'); }" },

  { name: 'log: thorns bite harder than they say', aims: ['the log says what happened, and only when it happened'],
    find: '  if (b.mods.thorns && b.mine.hp < hpBefore && b.foe.hp > 0) {\n    b.foe.hp = clamp(b.foe.hp - b.mods.thorns, 0, b.foe.max);',
    to: '  if (b.mods.thorns && b.mine.hp < hpBefore && b.foe.hp > 0) {\n    b.foe.hp = clamp(b.foe.hp - b.mods.thorns * 2, 0, b.foe.max);' },

  // A mutant only a SOURCE check can see, and one the game does not feel: the
  // stub DOM never looks up #pad, so nothing driven changes. It exists because
  // the suite used to read the game TWICE — loadGame honoured EK_GAME and the
  // source nets read a hardcoded path — so all 135 source checks were invisible
  // to every mutant, and a whole section came back 0 killed while the same
  // mutation by hand plainly killed a check in it. If this one stops biting,
  // the two reads have drifted apart again.
  { name: 'PLANTED SOURCE: the markup only a source net can see', aims: [], sourceOnly: true,
    find: 'id="pad"', to: 'id="padXX"' },
  // A mutant that is MEANT to bring the suite down, so the crash detector has a
  // live case. Without it that detector is unexercised — and it is the one that
  // found pass 182's fault, where 90 unrun checks read back as 90 survivors.
  { name: 'PLANTED CRASH: the arena throws', aims: [], crashes: true,
    find: 'function drawArena(g, tint, b) {',
    to: 'function drawArena(g, tint, b) { throw new Error("planted crash");' },
];

// A run that ENDED is not a run that crashed.
//
// The first version called any short run a crash, and a mutant that merely made
// a section assert fewer times — because the section reads a list out of the
// game's own output — was reported as taking checks off the board. A crash is
// the suite not reaching its own summary line; that is what to look for.
const ENDED = /emberkin_render: (\d+ checks passed|\d+ FAILED)/;
const run = (path) => {
  try {
    const out = execFileSync('node', [SUITE], {
      env: { ...process.env, EK_GAME: path, EK_TRACE: '1' },
      encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'],
    });
    return out;
  } catch (e) {
    // A failing suite exits 1 — that is the normal case for a mutant.
    return (e.stdout || '') + (e.stderr || '');
  }
};
const parse = (out) => {
  const rows = [];
  for (const line of out.split('\n')) {
    if (!line.startsWith('@CHECK\t')) continue;
    const [, i, verdict, sec, ...rest] = line.split('\t');
    rows.push({ i: +i, ok: verdict === 'pass', sec, label: rest.join('\t') });
  }
  return rows;
};

const base = parse(run(GAME));
// An aim that names no section judges the wrong one, silently. The first run of
// this sweep aimed at 'the opening' and matched a section from an older pass,
// then reported 0/15 for a section the mutation never touched — while the real
// failures sat in 'the game opens the way it changes any other scene'. So aims
// are checked against the section names the suite actually printed, and an aim
// that matches nothing stops the sweep instead of quietly mis-scoring it.

if (!base.length) { console.error('the baseline produced no checks — the sweep is not running'); process.exit(1); }
const baseFails = base.filter((r) => !r.ok);
if (baseFails.length) { console.error(`the baseline is not green (${baseFails.length} failing) — nothing measured`); process.exit(1); }
console.log(`baseline: ${base.length} checks, all passing\n`);
{
  const names = new Set(base.map((r) => r.sec));
  const bad = [];
  for (const m of MUTANTS) for (const a of m.aims) {
    const hits = [...names].filter((n) => n.includes(a));
    if (!hits.length) bad.push(`${m.name}: aim ${JSON.stringify(a)} names no section`);
    else if (hits.length > 1) bad.push(`${m.name}: aim ${JSON.stringify(a)} names ${hits.length} sections — ${hits.join(' | ')}`);
  }
  if (bad.length) { console.error('the aims do not line up with the suite:\n  ' + bad.join('\n  ')); process.exit(1); }
}

// key by (section, ordinal in section) so a label whose text is interpolated
// still lines up when a mutant changes the value inside it.
const keyOf = (rows) => {
  const seen = new Map(), keys = [];
  for (const r of rows) {
    const n = (seen.get(r.sec) || 0);
    seen.set(r.sec, n + 1);
    keys.push(`${r.sec}#${n}`);
  }
  return keys;
};
const baseKeys = keyOf(base);
const killed = new Set();
const ran = new Set();      // keys seen in at least one mutant run
const crashed = new Set();
const killedBy = new Map();   // mutant name -> how many checks it killed
const missed = [];

for (const m of MUTANTS) {
  if (!SRC.includes(m.find)) { missed.push(`${m.name} — its anchor is not in the file`); continue; }
  const path = join(TMP, m.name.replace(/[^a-z0-9]+/gi, '_') + '.html');
  writeFileSync(path, SRC.replace(m.find, m.to));
  const out = run(path);
  const rows = parse(out);
  const keys = keyOf(rows);
  let n = 0;
  rows.forEach((r, idx) => { if (!r.ok) { n++; if (!m.crashes) killed.add(keys[idx]); } });
  // A check that never RAN is not a check that survived.
  //
  // A mutant that makes the suite throw takes every check after the throw off
  // the board, and the first version of this sweep counted all of them as
  // survivors — so the loudest thing it can say, "not one of these died", was
  // exactly what a crash looked like. It reported a section of mine as a
  // sentence on that basis. Deleting the pause menu's return threw at
  // `g.G.menu.i` and cost 90 checks.
  killedBy.set(m.name, n);
  const short = base.length - rows.length;
  const ended = ENDED.test(out);
  if (!m.crashes && ended) rows.forEach((r, idx) => ran.add(keys[idx]));
  if (!ended) crashed.add(m.name);
  console.log(`  ${n === 0 && !short ? '!!' : '  '} ${String(n).padStart(4)} killed   ${m.name}` +
    (!ended ? `   <- CRASHED: ${short} checks never ran and are not evidence` : '') +
    (ended && short > 0 ? `   (${short} fewer checks ran — a section that reads its own list)` : '') +
    (n === 0 && ended ? '   <- KILLED NOTHING: the mutation missed, or the section is a sentence' : ''));
}

// Only sections a mutation actually aimed at can be judged; the rest are simply
// out of reach of this set and are listed as such rather than accused.
const aimed = new Set(MUTANTS.flatMap((m) => m.aims));
const bySection = new Map();
base.forEach((r, i) => {
  if (!bySection.has(r.sec)) bySection.set(r.sec, { total: 0, dead: 0, unrun: 0, survivors: [] });
  const e = bySection.get(r.sec);
  e.total++;
  if (killed.has(baseKeys[i])) e.dead++;
  else if (!ran.has(baseKeys[i])) e.unrun++;      // never on the board, never judged
  else e.survivors.push(r.label);
});

// The sweep proves itself before it accuses anything.
//
// The suite carries one section holding a known sentence — an
// `ok(at < arr.length)` after a findIndex, the exact shape 177 shipped — beside
// a real check on the same subject. A working sweep kills the real one and
// leaves the sentence standing. If it cannot still do that, nothing below is
// worth reading, so it says so and stops.
{
  const e = [...bySection.entries()].find(([sec]) => sec.startsWith('PLANTED'));
  if (!e) { console.error('the planted section is gone — this sweep can no longer prove itself'); process.exit(1); }
  const [, p] = e;
  if (p.dead !== 1 || p.survivors.length !== 1 || !/SENTENCE/.test(p.survivors[0])) {
    console.error(`the sweep failed its own plant: ${p.dead} died, survivors ${JSON.stringify(p.survivors)}`);
    process.exit(1);
  }
  console.log('\nthe plant holds: the real check died, the sentence survived.');
  // …and the crash detector, which is the half that found this pass's fault.
  // …and the source-only plant, which proves the suite is reading the same game
  // it is running.
  const plants = MUTANTS.filter((x) => x.sourceOnly);
  if (!plants.length) {
    console.error('there is no source-only plant — this sweep can no longer tell whether the\n' +
      '  suite is reading the same file it runs, which is how 187 found 135 blind checks');
    process.exit(1);
  }
  for (const m of plants) {
    if (!killedBy.get(m.name)) {
      console.error(`the source-only plant killed nothing: ${m.name}\n` +
        '  the suite is reading a different file from the one it runs — every source check is blind');
      process.exit(1);
    }
  }
  console.log(`the source plant holds: a text-only change is seen (${plants.length} of them).`);

  const wantCrash = MUTANTS.filter((m) => m.crashes).map((m) => m.name);
  const missedCrash = wantCrash.filter((n) => !crashed.has(n));
  if (missedCrash.length) {
    console.error(`a mutant that should have brought the suite down did not: ${missedCrash.join(', ')}`);
    process.exit(1);
  }
  const falseCrash = [...crashed].filter((n) => !wantCrash.includes(n));
  console.log(`the crash detector holds: ${wantCrash.length} planted crash caught` +
    (falseCrash.length ? `, and ${falseCrash.length} real one(s): ${falseCrash.join(', ')}` : ', and no mutant crashes the suite by accident.'));
}

console.log('\n=== sections this set aimed at ===');
for (const [sec, e] of bySection) {
  if (![...aimed].some((a) => sec.includes(a))) continue;
  console.log(`\n  ${sec}\n    ${e.dead}/${e.total} checks died under mutation` +
    (e.unrun ? `, ${e.unrun} never ran under any of them` : ''));
  if (e.dead === 0 && e.unrun === e.total) console.log('    (this section was never on the board — every mutant that reached it crashed first)');
  else if (e.dead === 0) console.log('    !! NOT ONE of them died — every check here may be a sentence');
  else if (e.survivors.length) {
    console.log('    survivors (each may be out of reach, or may be unable to fail):');
    for (const s of e.survivors.slice(0, 12)) console.log('      · ' + s);
    if (e.survivors.length > 12) console.log(`      … and ${e.survivors.length - 12} more`);
  }
}
const outOfReach = [...bySection.entries()].filter(([sec]) => ![...aimed].some((a) => sec.includes(a)));
console.log(`\n${killed.size} of ${base.length} checks were killed by at least one of ${MUTANTS.length} mutations.`);
console.log(`${outOfReach.length} sections were not aimed at by this set and are not judged here.`);
for (const m of missed) console.log('  !! ' + m);
