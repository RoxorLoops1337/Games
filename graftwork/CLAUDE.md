# GRAFTWORK

"Cut what you love. Stitch what you need." A roguelike deckbuilder where you never add cards: after a fight you pick ONE of your OWN cards and ONE graft to sew onto it. Every graft has a Boon and a Price. Live at `https://games-71g.pages.dev/graftwork/`. Plain ES modules, no build step, no art files (everything drawn on canvas, audio synthesized). **No em dashes in any text, ever.**

## The one rule that makes it a game
- Each graft has a **Weight** (1 to 3). Deck **Budget** is 6 (+ relics, + Forge "Expand", + skipping a graft).
- Total weight over Budget = **Strain**. Each Strain point lands one **Tithe** on a *Bare* card (a card with no grafts, not junk): the cheapest, then oldest. Tithed cards fight at -25% numbers that combat. The deck view and the offer preview show exactly which cards will be tithed BEFORE you commit.
- Strain with no Bare card left to take it is **Backfire**: every 2 overflow, one grafted card in your opening hand each turn is jammed (+1 cost).
- Max 2 grafts per card. The **3rd graft is an Overload**: it weighs +1 extra, the card's damage/block numbers x1.5, and on its first play each combat there is a 25% **Shatter** (the card resolves, then is destroyed for the run).
- Every graft also carries its own local **Price** (cost up, exhaust, self damage, jam chance, junk cards, slower draw, max HP loss). A Boon is never free.
- Offers: 3 cards from your deck (one is always a low-play-count card) x 3 grafts, one of each tier: **safe** (weight 1, small boon, simple price), **greedy** (weight 2 to 3, big boon), **weird** (changes how the card works). Skipping the graft: heal 8, OR +1 Budget permanently, OR +10 gold.

## Layout
```
graftwork/
  index.html  main.js          page + boot (UI owner)
  engine/rng.js cards.js combat.js text.js   PURE rules, no DOM (do not edit without the lead)
  engine/run.js                run state: map, rewards, offers, shop, forge, events, save (run owner)
  data/*.js                    content, one author per file (see below)
  ui/*.js  art/*.js            screens, canvas art, fx, audio
tests/graftwork_*.test.mjs     headless suites; `node tests/graftwork_data.test.mjs` is the content gate
```

## Content files and owners (never edit another owner's file; add new statuses ONLY to your own statuses_<x>.js)
| file | contents |
|---|---|
| cards_marrow.js / cards_wick.js / cards_odile.js | hero cards. ids `m_*` `w_*` `o_*`. The 7 starter cards per hero already exist: keep their ids, you may retune. Need >= 20 NON-starter cards each (common 10, uncommon 7, rare 5+), at least 5 Attack, 5 Skill, 3 Power-type per hero |
| cards_any.js | neutral cards `x_*` any hero can buy (>= 14) |
| cards_junk.js | junk (`j_*`), required ids: j_paperwork j_ringing j_clot j_flake j_static j_ledger. Add more as needed |
| grafts_safe.js / grafts_greedy.js / grafts_weird.js | grafts `g_*`, tier matches file |
| enemies_1/2/3.js | enemies by act, INCLUDING that act's elites and boss (kind: 'elite'/'boss'); bosses.js stays empty |
| relics.js potions.js events.js | relics `r_*`, potions `p_*`, events `e_*` |
| heroes.js schools.js statuses.js | lead only |
| statuses_marrow/wick/odile/gsafe/ggreedy/grafts(=weird)/e1/e2/e3/relics.js | extra statuses for that author |

## Card schema
`{ id, name, hero, type: 'attack'|'skill'|'power'|'junk', cost: 0..3|'X', rarity: 'starter'|'common'|'uncommon'|'rare'|'junk', target: 'enemy'|'all'|'self'|'none', school?, flavor (one dry line, max 60 chars), flags: {exhaust, innate, retain, ethereal, unplayable}, fx: [ops], up: { fx: [ops] (full replacement), cost?, unflags?: [] } }`
Power-type cards are played once and stay out of the deck for the rest of the combat; they usually apply a status to `to:'self'`. Every non-junk card needs `up.fx` and `flavor`.

## Ops (fx arrays). A value `n` is a number OR `{ base, per: <source>, mul, max, min }` (base + floor(source * mul))
- `{op:'dmg', n, hits?, to?:'enemy'|'all'|'random', pierce?}` (enemies: hits the player). dmg and block scale with graft pct, Overload and Tithe automatically.
- `{op:'block', n, to?}` `{op:'status', s, n, to?:'enemy'|'all'|'random'|'self'|'player'|'allies'}` `{op:'setStatus', s, n}` `{op:'double', s, cap?, to?}` `{op:'detonate', s, mul?}` `{op:'cleanse'}`
- `{op:'draw', n}` (max 4) `{op:'energy', n}` (max 3) `{op:'heal', n}` `{op:'hp', n}` (lose HP; never kills the player) `{op:'maxhp', n}` `{op:'gold', n}`
- `{op:'addCard', card, n, to:'hand'|'draw'|'drawTop'|'discard', up?}` `{op:'summon', id, n?}` (enemies)
- `{op:'discard', n, choose?}` `{op:'exhaustHand', n|'all', choose?, draw?}` `{op:'fetch', n, from:'discard'|'exhaust'}`
- `{op:'if', cond, ifText:'human text of the condition', then:[ops], else?:[ops]}` cond = `{src, lt|lte|gt|gte|eq}` or a function `(c, ctx) => bool`
- `{op:'repeat', n, fx}` `{op:'custom', fn(A, ctx), text:'rules text'}` (escape hatch; ALWAYS give `text`). Any op may carry `t:'override text'`.
- Value sources `per`/`cond.src`: x hand energy block hp hp% missingHp drawPile discard exhaust plays turn deck grafts cardGrafts strain enemies kills dealt gold junk attacksInHand, and `st:<status>@self|target|player`.
- Replays (Plays twice, Echo) repeat damage, block and status but NOT resource ops (draw, energy, gold, addCard, heal). Draw per op max 4, energy max 3.

## Graft schema
`{ id, name, school, weight: 1|2|3, tier, rarity: 'common'|'uncommon'|'rare', boon: 'text', price: 'text', mods: [...], types?: ['attack'..], not?: [graftIds], ok?(spec) }`
`mods` MUST contain at least one boon mod and one price mod. Kinds (engine/cards.js applyMod):
- boon: `{k:'cost', d}` `{k:'flag', f}` `{k:'unflag', f}` `{k:'repeat', n}` `{k:'addFx', fx:[ops], pos?:'start'}` `{k:'pct', pct}` (+/- % to damage and block) `{k:'aoe'}` `{k:'lifesteal', cap?}` `{k:'target', t}` `{k:'type', t}` `{k:'custom', hooks}`
- price: `{k:'selfHurt', n}` `{k:'jam', p}` `{k:'junk', card, n, to?:'draw'|'discard'|'hand', when?:'combatStart'|'onPlay'}` `{k:'selfStatus', s, n}` `{k:'drawdown', n}` `{k:'goldCost', n}` `{k:'maxHp', n}` (negative, applied once when grafted) plus the price-flavoured `cost +1`, `flag exhaust`, `flag ethereal`, `pct -N`.
- `custom` hooks: `{ onPlay(A, ctx), onDraw(A, {card, spec}), onDiscard, onExhaust, onTurnStart }`: weird grafts live here. ctx = `{card, spec, target, mult, x, replay, dealt}`.
- Point values (balance): common graft boon ~ +4 pts, uncommon +6, rare +8; price subtracts. Rough values: plays twice +6 (x0.5 if card has draw/energy), innate +2, retain +2, burn 3 +3, vulnerable 1 +3, +50% numbers +3, aoe +4, cost -1 +4, +1 energy +4, lifesteal +3; price: cost +1 -4, exhaust -3, self damage 3 -1.5, 25% jam -3, two junk -3, max HP -4 is -2. Net per rarity: common 0, uncommon +1, rare +2. Safe = weight 1, greedy = 2 to 3.
- Hard caps already enforced: plays/turn 20, hand 10, status 99, draw per op 4, energy per op 3, lifesteal 6.
- Schools: ember echo hoard blood rust static gilded. Aim each school's grafts to push that school's identity.

## Enemy schema (see enemies_1.js). Acts: normal 38-44 HP / 7-9 dmg per turn in Act 1, x1.6 Act 2, x2.4 Act 3; elite x1.8 HP; boss 130 / 220 / 340 HP. Act N has >= 10 normals (kind 'normal'), >= 3 elites, 1 boss (Act 3 also the final boss `the_grafter`, whose deck is read from the run at spawn).
Hooks `on: { combatStart(A,e), turnStart(A,e), damaged(A,e,dmg,{src,hit}), death(A,e), playerCard(A,e,{card,spec,target}), afterMove(A,e,moveId), modDamage(A,e,n,o)->n }`. `pick(A,e)->moveId` or `pattern`/`opening`. `e.data` is free scratch state. Enemy `art: { body: '<silhouette>', color, ...}` is read by art/enemies.js. `A` = combat API: A.dmg(src,tgt,n,o) A.block A.status A.setStatus A.heal A.loseHp A.draw A.energy A.gold A.addCard A.summon A.rng A.player A.alive() A.c (the full combat state).
Enemy moves are declarative `fx` with the same ops (they hit the player by default; `to:'self'|'allies'` for buffs). The intent icon is derived from the fx. `hidden:true` hides it. Statuses are `immune: [ids]` capable.

## Statuses: `{id, name, good, stack:'int'|'dur', canNeg?, mod:{outAdd,outMul,inMul,inCap,blockAdd,blockMul}, hooks:{turnStart,turnEnd,attacked,damaged,cardPlayed,kill}, desc(n)}` hooks receive `(A, owner, n, payload)`.

## Relic schema: `{ id, name, rarity, text, mod?: {energy, hand, budget, shatter, keepBlock}, on?: { combatStart(A,p,run), turnStart, turnEnd, cardPlayed(A,{card,spec,target}), damaged, kill, exhaust, shatter, combatEnd, wouldDie } }`. Run-level effects (gold, shop prices, Forge options) are flagged with `perk: 'name'` and read by engine/run.js (document the perk name in your report).

## Writing rules
Voice: clinical tenderness. Second person, short, dry, medical with a wink. Prices are stated plainly and never softened. No exclamation marks, no em dashes, flavor is one line.

## Verify
`node tests/graftwork_data.test.mjs` must pass before you hand back. `npm run test:graftwork` runs everything.

## Event schema (data/events.js) and the run helper R
`{ id:'e_x', name, act: 0|1|2|3 (0 = any), text (the scene, 2 to 4 short sentences), choices: [{ label, text?: 'what it does, plain', cond?(run) -> bool, pick?: 'card', pickFilter?(inst), apply(run, R, inst?) -> 'result text' }] }` at least 2 choices, one of them always safe (leave). `R` (implemented in engine/run.js): `R.gold(run,n)` `R.heal(run,n)` `R.hurt(run,n)` (never kills) `R.maxHp(run,n)` `R.addCard(run,cardId)` `R.removeCard(run,uid)` `R.upgrade(run,uid)` `R.addRelic(run,idOrNull)` (null = random) `R.addPotion(run,idOrNull)` `R.budget(run,n)` `R.stripGraft(run,uid,gid?)` `R.addGraft(run,uid,gid)` `R.queueGraftPick(run)` (a normal graft reward screen follows) `R.queueFight(run, [enemyIds], {elite?:bool})` `R.rng(run)` (seeded). Events run on `run.flags` for persistent state. Never mutate anything outside these helpers.
