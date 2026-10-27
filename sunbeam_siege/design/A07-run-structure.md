# A07: Run Structure (clans to credits)

Owner: A07 Run Structure Designer. Scope: everything between "Start Run" and the summary screen. Card, enemy, relic, event and champion contents belong to other agents; this file defines slots, counts, weights and flow. All numbers live in one `RUN_CONFIG` object (section 15) so balance passes never touch logic.

Vocabulary: **Night** = one of the 9 anchor fights. **Prowl** = ordinary Battle node. **Warmth** = Sunbeam health. **Fish** = gold. **Zoomies** = energy (not touched here). **Collar Charm** = permanent card enhancer (clan reward). **Clowder** = the player's deck and roster.

## 1. Run at a glance

| Item | Value |
|---|---|
| Acts | 3 (Houses), 8 map rows each, 24 map choices per run |
| Nights | 9 (3 per act): Night 1 = Act 1 row 3, Night 2 = row 6, Night 3 = Act 1 boss, and so on |
| Decisions | 25: 1 loadout + 24 map choices (plus smaller sub-decisions in nodes) |
| Fights per run | about 15.5 (6 Prowl, 5 Night, 1.5 Elite, 3 Boss) |
| Target length | 45 minutes median, band 38 to 55. First-time players about 1.4x |
| Start Warmth | 50 max, full. Grows to 60 max by Act 3 |
| Start Fish | 60 |
| Win | Beat the Night 9 boss. Lose: Warmth reaches 0 (after the one-time Last Life, section 9) |

## 2. Run start (RUN_SETUP screen, 5 steps)

1. **Mischief Rank** (difficulty 0 to 10, only ranks unlocked by wins). Default is the highest unlocked. Shows a modifier list (section 12).
2. **Main Clan**: grid of unlocked clans. Preview: clan keyword, 3 sample cards, heirloom relic. Main clan supplies the champion, most starter cards and 60% of draft weight.
3. **Side Clan**: any unlocked clan except the main. Supplies 2 starter cards and 25% of draft weight. Its Collar Charms and shop cards appear. Its champions do not.
4. **Champion**: choose 1 of the main clan's unlocked champions (3 per clan, 1 unlocked at start, rest by meta). Preview shows the 3 upgrade tiers' paths (names only until reached).
5. **Cradle Gift** (skipped at Mischief 8+): choose 1 of 3 random from the pool below.
Then a confirm screen with seed (editable text, 8 chars, shown for sharing) and "Go to the Cellar Door".

### Cradle Gift pool (pick 3 shown, take 1)
| Id | Text |
|---|---|
| plump_wallet | +60 Fish. "Found behind the radiator. Do not ask." |
| hearthrug | +8 max Warmth, heal 8. "Thick pile. Thicker cat." |
| fresh_claws | Upgrade one starter card of your choice. |
| lucky_bell | Gain a random Common relic. |
| spare_life | Champion gets +1 Lives pip permanently (see Nine Lives twist, if locked). If the twist is rejected, becomes +1 hand size on Night 1 only. |
| cat_tax | Remove 2 starter cards, gain 25 Fish per card removed. "A leaner clowder is a meaner clowder." |

### Starter deck (12 cards, plus the Champion as card 13)
Champion is shown on the loadout and is guaranteed in the opening hand of every fight (draws first, does not count against hand size). Slots are filled by clan docs; names in brackets are placeholders owned by card agents.

| Slot | Count | Source | Notes |
|---|---|---|---|
| Basic Unit A | 3 | Main clan | Cost 1, plain body, tags the clan keyword |
| Basic Spell A | 2 | Main clan | Cost 1, simple damage or buff |
| Keyword Primer | 1 | Main clan | Cost 1, teaches the clan mechanic, cannot be removed at Mischief 0 shop for first 2 acts (tutorial guard, removed at Mischief 3+) |
| Side Unit | 1 | Side clan | Cost 1 |
| Side Spell | 1 | Side clan | Cost 1 |
| [Knock It Off] | 1 | Neutral | Push an enemy down 1 floor, cost 1 |
| [Cardboard Box] | 1 | Neutral | Treat: floor Box, cost 1 |
| [Tuna Break] | 1 | Neutral | Draw 2, cost 1 |
| [Sunbeam Spot] | 1 | Neutral | Heal Warmth 1, gain 1 Zoomies next turn, cost 0, Exhaust |

### Starting relic
The main clan's **Clan Heirloom** (one fixed relic per clan, Starter rarity, never appears elsewhere). Champions carry no relic. Relics slot into a shelf of unlimited length shown as a scrolling strip.

## 3. The three Houses (acts)

The combat floors stay Cellar, Parlor, Attic in every fight (brief skeleton). The act names below are the **setting and enemy pool** only, shown as backdrops behind the floors and on the map.

| | Act 1: The Cellar and Garden | Act 2: The Parlor | Act 3: The Attic and Roof |
|---|---|---|---|
| Nights | 1, 2, 3 | 4, 5, 6 | 7, 8, 9 |
| Mood | Damp, small, pests. Teach the loop | Domestic menace. Appliances and sprays | Dusty, high, strange. Weather and the uncatchable |
| Enemy families | Mice, rats, slugs, garden dog, crow, hose | Vacuum, duster, spray bottle, cucumber, big dog, mop | Vet carrier, red laser dot, thunderstorm, fireworks, bath, alarm clock |
| Map skin | Wine racks, flowerpots, cobwebs | Wallpaper, rugs, lamp glow | Beams, trunks, rooftop tiles, moon |
| Music | Slow pizzicato | Brushed jazz shuffle | Wind, music box, tension |
| Boss pool (1 of 2, revealed at act start) | The Rat King (swarm, summons) / Garden Hose, Serpent of the Lawn (long line, pushes cats) | The Vacuum Mk IX (sucks hand, eats units) / The Spray Bottle Duelist (debuff spam) | The Vet Carrier (traps a cat each turn) / The Red Dot (cannot be targeted normally, teleports) |
| Final boss tag | | | Night 9 boss also has "Dawn" phase: at 25% HP, 6:00 AM alarm, enemies get +1 move each turn |
| Boss flavor | "It has been a long night. The rat has been wearing a crown." | "Warranty void if licked." | "You cannot catch it. You will try anyway." |

Boss pool is chosen from the run's map RNG at map generation, so a player can plan a deck for it. The boss icon on the map shows its portrait.

## 4. Map structure

Vertical climbing map (start at bottom, boss at top, matching the house). 5 columns by 8 rows. Phone portrait: whole act fits on one scroll screen at 56px nodes, 44px minimum tap target. You may only move along drawn edges to a node in the next row.

| Row | Name on map | Content |
|---|---|---|
| 1 | Evening | Always Prowl (Battle). Act 1 row 1 is a "soft" Prowl, see 10 |
| 2 | Evening | Free row |
| 3 | **Night A** (1, 4, 7) | Always Night Battle. Every node in the row |
| 4 | Small hours | Free row |
| 5 | Small hours | Free row, contains the guaranteed Treasure |
| 6 | **Night B** (2, 5, 8) | Each node Battle (Night) 65%, Elite 35%. Reward is the Champion upgrade (section 8) |
| 7 | Before dawn | Pre-boss rest row: Nap Nook, Scratching Post, or Shop |
| 8 | **Night C** (3, 6, 9) | Boss. Single node, centre column |

Node counts: row 1 has 3 to 4 nodes, rows 2 to 6 have 3 to 5, row 7 has 2 to 4, boss 1. About 27 nodes per act, 3 to 4 per row. Player passes through 8 of them.

Fights on a path: min 4 (rows 1, 3, 6, 8), expected 5.4, max 7. No path can contain more than 2 consecutive non-fight nodes.

### Node types
| Type | Icon (code drawn) | Does |
|---|---|---|
| Battle (Prowl) | crossed claws | 3 wave fight |
| Night Battle | moon | 4 wave fight with a Night Omen (section 10) |
| Elite | crowned paw | 4 wave fight with an Elite enemy, guaranteed relic |
| Shop | raccoon in coat | Gerald's Back Alley Bazaar |
| Event | scroll | Choice event from the act pool |
| Scratching Post | post | Upgrade 1 card |
| Nap Nook | cushion | Rest, heal or perks |
| Treasure | cardboard box | Open it for a relic, or sit in it |
| Mystery | "?" | Resolves on arrival (section 7) |
| Boss | big skull-less cat silhouette | The act boss |

### Free-row weights (rows 2, 4, 5; eligibility notes below)
| Type | Act 1 | Act 2 | Act 3 |
|---|---|---|---|
| Battle | 38 | 34 | 30 |
| Mystery | 20 | 20 | 20 |
| Event | 14 | 14 | 14 |
| Shop | 8 | 8 | 8 |
| Scratching Post | 8 | 8 | 8 |
| Nap Nook | 6 | 8 | 10 |
| Elite | 6 | 8 | 10 |
| Treasure | 0 | 0 | 0 (placed by guarantee only) |

Eligibility: Elite only in rows 4 and 5 (never in Act 1 row 4). Shop, Post, Nook never in row 1. Row 2: Battle, Mystery, Event, Shop only. Row 5 cannot hold a Shop (the pre-boss row is the shop spot).

Row 7 composition: at least one Nap Nook and one Scratching Post; remaining nodes 50% Shop, 25% Nook, 25% Post.

### Placement rules (checked by `validate`)
1. Elite, Shop, Nook, Post, Event cannot appear on two nodes joined by an edge.
2. Two nodes sharing a parent must differ in type when possible (try 10 rerolls, then accept).
3. Guarantees per act: at least 2 Elites in rows 4 and 5 (Act 1: 1), at least 1 Shop in rows 2 to 5 or row 7, exactly 1 Treasure in row 5 (replaces a Battle or Mystery), at least 1 Scratching Post in rows 2 to 5, every row 5 node has at least one child in row 6 that is a Battle (so no forced Elite).
4. Row 6 has at least one Battle and at least one Elite (swap if not).
5. Max fights on any path 7, min 4.

## 5. Map generation pseudocode

Classic script, seeded, deterministic. `rngFor(runSeed, stream, idx)` returns a mulberry32 stream so map, loot, shop, event, battle each have independent RNG (choices never alter later rolls; reload cannot reroll rewards).

```js
const ROWS = 8, COLS = 5, PATHS = 4, BOSS_ROW = 7, BOSS_COL = 2;

function generateAct(runSeed, act, cfg) {
  const rng = rngFor(runSeed, 'map', act);
  for (let attempt = 0; attempt < 60; attempt++) {
    const g = buildGraph(rng);
    assignTypes(g, rng, act, cfg);
    if (validate(g, cfg)) { g.boss = pickBoss(rng, act); return g; }
  }
  return templateAct(act);              // hand-authored safe fallback
}

function buildGraph(rng) {
  const g = { nodes: [], edges: [] };   // edges: {r, c, nc} from (r,c) to (r+1,nc)
  for (let r = 0; r < ROWS; r++) g.nodes.push(new Array(COLS).fill(null));
  // at least 3 distinct start columns among 4 paths
  let starts;
  do { starts = []; for (let i = 0; i < PATHS; i++) starts.push(rng.int(0, COLS - 1)); }
  while (new Set(starts).size < 3);
  for (const s of starts) {
    let c = s;
    touch(g, 0, c);
    for (let r = 0; r < BOSS_ROW - 1; r++) {          // rows 0..5 step up to row 6
      const opts = [c - 1, c, c + 1].filter(x => x >= 0 && x < COLS && !crosses(g, r, c, x));
      const nc = opts.length ? weighted(rng, opts, x => x === c ? 4 : 3) : c;
      addEdge(g, r, c, nc); touch(g, r + 1, nc); c = nc;
    }
  }
  // extra branches: a node with one child gets a second child 30% of the time
  for (const n of allNodes(g, 0, BOSS_ROW - 2)) {
    if (childCount(g, n) === 1 && rng.chance(0.30)) {
      const opts = [n.c - 1, n.c + 1].filter(x => x >= 0 && x < COLS && !crosses(g, n.r, n.c, x) && !hasEdge(g, n.r, n.c, x));
      if (opts.length) { const nc = rng.pick(opts); addEdge(g, n.r, n.c, nc); touch(g, n.r + 1, nc); }
    }
  }
  // pre-boss row must hold at least 2 nodes, else widen
  ensureMinNodes(g, BOSS_ROW - 1, 2, rng);
  touch(g, BOSS_ROW, BOSS_COL);
  for (const n of rowNodes(g, BOSS_ROW - 1)) addEdge(g, BOSS_ROW - 1, n.c, BOSS_COL);
  return g;
}

// an edge going right-down crosses an edge going left-down from the neighbour
function crosses(g, r, c, nc) {
  if (nc > c) return hasEdge(g, r, c + 1, c);
  if (nc < c) return hasEdge(g, r, c - 1, c);
  return false;
}

function assignTypes(g, rng, act, cfg) {
  const W = cfg.freeRowWeights[act];
  for (const n of allNodes(g)) {
    if (n.r === 0) n.type = 'battle';
    else if (n.r === 2) n.type = 'night';
    else if (n.r === 5) n.type = rng.chance(0.35) ? 'elite' : 'night';
    else if (n.r === 7) n.type = 'boss';
    else if (n.r === 6) n.type = null;               // filled by row-7 rule below
  }
  assignPreBossRow(g, rng);                          // row index 6
  for (const r of [1, 3, 4])                         // free rows
    for (const n of rowNodes(g, r)) {
      for (let t = 0; t < 10; t++) {
        n.type = weighted(rng, eligible(n, act), k => W[k]);
        if (legalVsNeighbours(g, n)) break;          // rules 1 and 2
      }
    }
  applyGuarantees(g, rng, act);                      // rules 3 and 4
  labelNights(g, act);                               // n.nightNo on rows 2, 5, 7
}

function assignPreBossRow(g, rng) {
  const ns = rowNodes(g, 6);
  const pool = ['nook', 'post'];
  shuffle(rng, ns);
  ns[0].type = 'nook'; ns[1].type = 'post';
  for (const n of ns.slice(2)) n.type = rng.chance(0.5) ? 'shop' : rng.pick(pool);
}

function validate(g, cfg) {
  const [minF, maxF] = fightRange(g);                // DP over edges counting battle/night/elite/boss
  if (minF < 4 || maxF > 7) return false;
  if (maxConsecutiveNonFights(g) > 2) return false;
  if (!hasAllGuarantees(g)) return false;
  for (const n of rowNodes(g, 4))                    // no forced elite in row 6 (index 5)
    if (!children(g, n).some(ch => ch.type === 'night')) return false;
  return true;
}
```

Notes for coders: node ids are `"a{act}r{row}c{col}"`. Elite and Night nodes on the map show the Omen/elite portrait only after the player has visited a node in the previous row (reduces overwhelm, keeps surprise). Map is generated for the whole act at act start and stored in the save. Second and third act maps are generated at act start from `rngFor(seed,'map',act)`, never pre-rolled, so loading at an act boundary is deterministic.

## 6. Node resolution flow (state machine)

States: `TITLE, RUN_SETUP, ACT_INTRO, MAP, BATTLE, REWARDS, SHOP, EVENT, POST, NOOK, TREASURE, BOSS_REWARDS, ACT_END, RUN_END, SUMMARY`.

```
TITLE -> RUN_SETUP -> ACT_INTRO(1) -> MAP
MAP -(choose node)-> [BATTLE|SHOP|EVENT|POST|NOOK|TREASURE|MYSTERY->resolve]
BATTLE -win-> REWARDS -> MAP         BATTLE -lose-> RUN_END
BOSS battle -win-> BOSS_REWARDS -> ACT_END -> ACT_INTRO(n+1)   (act 3: -> RUN_END victory)
RUN_END -> SUMMARY -> TITLE
```
Autosave on entering MAP, on entering any node, and at the start of each player turn in battle. Reward lists are rolled on node entry and stored, so quitting during rewards returns the identical offer.

## 7. Mystery nodes

Resolve on arrival with a short "paw print" reveal animation. Weights (before modifiers):

| Result | Act 1 | Act 2 | Act 3 |
|---|---|---|---|
| Event | 40 | 38 | 36 |
| Battle (Prowl) | 36 | 30 | 28 |
| Treasure | 8 | 8 | 8 |
| Shop (only if no Shop in last 2 nodes on path) | 8 | 8 | 8 |
| Nap Nook | 8 | 8 | 8 |
| Elite (only Act 2+, only if player Warmth above 50%) | 0 | 8 | 12 |

Modifier: each time a Mystery resolves to Battle, battle weight -12 (min 12) for the rest of the run; each time it does not, +6 (max 50). Mystery Battles give normal Prowl rewards plus +10 Fish ("Surprise tax"). Mystery Elite gives normal Elite rewards.

## 8. Rewards

### Reward screen layout
Stack of cards: Fish (auto), Card Draft, then (when applicable) Relic, Clan Reward, Champion Upgrade. Each row must be claimed or skipped; "Proceed" appears after the draft is resolved.

| Source | Fish (A1 / A2 / A3) | Card draft | Relic | Other |
|---|---|---|---|---|
| Prowl | 12 / 16 / 20 (±2) | 1 of 3 | none | none |
| Night A (rows 3) | 20 / 26 / 32 | 1 of 3, Night odds | none | Clan Reward: Collar Charm, 1 of 2 |
| Night B (row 6, Battle variant) | 20 / 26 / 32 | 1 of 3, Night odds | none | **Champion Upgrade** tier I / II / III, pick 1 of 3 paths |
| Elite | 30 / 38 / 46 | 1 of 3, Elite odds | 1 guaranteed (Elite odds) | Elite on row 6 also grants the Champion Upgrade |
| Boss | 70 / 90 / (final, bonus score) | Big draft: 1 of 3, at least 1 Rare | Boss Relic: 1 of 3 | Clan Reward: Collar Charm, 1 of 3. Heal 40% max Warmth. +5 max Warmth (Acts 1 and 2 only) |
| Treasure | none | none | 1 (see 9) | none |
| Clean Night bonus | +8 Fish, heal 3 | applies to any fight that cost 0 Warmth | | |
| Dawn Rest | heal 4 | After Night A fights only (rows 3), Mischief 9+ removes | | |

Champion Upgrade tiers land on Night 2, Night 5, Night 8 (the first big night of each act), so the champion is fully built before each boss. Each tier offers 3 upgrade paths drawn by the champion doc. A champion that skipped the middle Night B by path: row 6 is mandatory in every path, so tiers are always reachable.

### Card draft rules
- Offer 3 cards, no duplicates within an offer, no card the deck already holds at its cap (Rare 3, others 5, Champion-linked cards 2).
- Slot source weights per card: Main clan 60, Side clan 25, Neutral 15. Slot 1 is guaranteed to be Main clan at least 60% of drafts.
- Rarity odds (Common / Uncommon / Rare):

| Source | Act 1 | Act 2 | Act 3 |
|---|---|---|---|
| Prowl | 62 / 33 / 5 | 55 / 37 / 8 | 48 / 40 / 12 |
| Night | 50 / 38 / 12 | 44 / 42 / 14 | 38 / 44 / 18 |
| Elite | 40 / 42 / 18 | 34 / 44 / 22 | 28 / 46 / 26 |
| Boss | 0 / 40 / 60 with at least 1 Rare enforced | same | same |

- Rare pity: each draft that offers no Rare adds +2% to the Rare chance of the next draft (cap +20%), resets when a Rare is offered.
- Actions: Pick (adds to discard at next fight start), **Skip** (+6 Fish, label "Not now, I am napping"), **Reroll** only via relics.
- The first Prowl of the run offers only Common and Uncommon from the main clan (no dead picks while learning).

### Relic rules
- Rarity: Common 55, Uncommon 33, Rare 12 for Elite and Treasure (Act 3: 45 / 38 / 17). Boss relics are their own pool of 3 offered, stronger, some with a downside, never offered twice.
- Clan relics (tagged to a clan) have weight x2 if the clan is main or side, x0 if not in the run.
- No duplicates in one run. Shop relics use the same pool minus Boss and Starter.
- Unlimited relics, no cap.

### Collar Charms (clan reward)
Permanent card enhancers, applied by dragging onto a card in the deck viewer. 1 charm per card (second replaces first on confirm). The clan reward offers charms from main clan pool (2 of 3 slots) or side clan pool (1 of 3), pick 1 of 2 after Night A, 1 of 3 after bosses. Charm contents belong to the card agents; target count 24 (8 per clan trio x neutral).

## 9. Treasure, Nook, Post, Shop, Event

### Treasure: the Cardboard Box
"If it fits, I sits." Choose one: **Open it**: gain 1 relic (Act 1 Common 70 / Uncommon 30; Act 2 Common 45 / Uncommon 40 / Rare 15; Act 3 Common 30 / Uncommon 45 / Rare 25). **Sit in it**: heal 20% max Warmth and gain 15 Fish ("The box is warm. The relic can wait."). The box is a Treasure only; the sit option is not available to relics that auto-open boxes.

### Nap Nook (pick 1)
| Option | Effect |
|---|---|
| Curl Up | Heal 30% max Warmth (15 at 50) |
| Knead | +3 max Warmth, heal 8. "Kneading the cushion. A job well done." |
| Groom | Remove 1 card from the deck, no heal |
Mischief 6 changes Curl Up to 20%.

### Scratching Post
Choose any 1 upgradeable card in the deck, preview before and after, confirm. Cards upgrade once (+). Champion cannot be upgraded here (only via Night B tiers). If the deck has no upgradeable cards, option greyed and the node becomes a Nook-lite (heal 10%).

### Shop: Gerald's Back Alley Bazaar
Gerald is a raccoon in a trench coat who insists he is a tall cat. He has his own flavor lines per act and reacts to gold.
| Stock | Count | Notes |
|---|---|---|
| Cards | 5 | 3 main clan, 1 side clan, 1 neutral. One is on Sale (-50%) |
| Relics | 2 | One Common or Uncommon, one Uncommon or Rare. One gets a 20% discount at 30% chance |
| Collar Charm | 1 | Sold from either clan pool |
| Service: Shoo (remove a card) | 1 | 50 Fish first use, +25 each later |
| Service: Warm Milk | 1 | Heal 10 Warmth for 40 Fish, once per shop |
| Service: Reroll cards | 1 | 20 Fish, +10 each use per shop |

Base prices (±10% random each): Common card 45, Uncommon 75, Rare 140, Common relic 110, Uncommon relic 160, Rare relic 230, Collar Charm 90. Mischief 7 adds +15%. Pre-boss Shops stock one extra Rare. Gerald also buys: sell a card (not Champion) for 15 Fish (Common) or 25 (other). Dry line on selling: "I will take that off your paws."

### Event
Pool is per act. Rules: each event id once per run; weights Boon 30, Gamble 25, Trade 20, Story 15, Fight 10; at most one Fight event per act; any option that costs Warmth is clamped so Warmth cannot fall below 1 (events never kill); options gated by Fish, clan or champion appear greyed with the requirement. Every event shows a short one line title and 2 to 4 options.

## 10. Combat structure used by the run

| Type | Waves | Target turns | Threat Budget (A1 / A2 / A3) | Night HP scale |
|---|---|---|---|---|
| Prowl | 3 | 4 to 5 | 12 / 20 / 30 | 1.00 up to 1.40 |
| Night | 4 | 6 | 20 / 32 / 46 | |
| Elite | 4 + elite unit | 6 | 28 / 42 / 60 | |
| Boss | 5 + phases | 8 | 45 / 70 / 100 | |

Enemy HP scale per night number n (1 to 9): `hpScale = 1 + 0.05 * (n - 1)`, applied on top of each enemy's base. Enemy agents assign Threat cost per enemy; the encounter builder fills each wave to budget share (wave shares 30/40/30 for 3 waves). Rule: Act 1 row 1 Prowl uses budget 8 and only the three weakest families ("soft open"). No encounter id repeats within an act. Night Battles each pick one **Night Omen** (visible on the node tooltip after the previous row):

| Omen | Effect |
|---|---|
| Full Moon | Cats gain +1 Zoomies on the first turn; enemies +10% HP |
| Thunder | Every 3rd turn a random enemy skips its move |
| Cold Floor | Cellar units start at -1 attack; Attic units +1 |
| Quiet House | No Zoomies Turn this fight (if the twist exists); enemies +1 wave count |
| Draft Under the Door | One random floor is drawn each turn; units on it take 2 |
| Hunter's Moon | Elites and Bosses only; extra elite escort |

## 11. Warmth carry and healing

- Warmth carries unchanged between fights. Max Warmth: 50 at start, +5 after Act 1 and 2 bosses, plus relic and Nook perks.
- In battle heals (Purr, Sunbeam Spot) cannot exceed max. Whatever is left at victory carries.
- **Heal budget** (sources outside relics/events): Nook 30% (15), Dawn Rest 4 per Night A fight, Clean Night 3 per perfect fight, boss victory 40% max, Warm Milk 10 per shop, Box sit 20%, Treasure excluded.
- **Target Warmth at boss start**: Act 1 about 62% max, Act 2 55%, Act 3 50% for a median player. Target damage per act (unhealed): 28, 38, 48. Tune `burnScale` in config.
- **Last Life**: once per run, when Warmth would reach 0, set Warmth to 12, remove all enemies from the top floor, show a gold "Sunbeam flickers" animation, and consume the Last Life (shown as a small pip beside Warmth). Disabled at Mischief 10. Flavor: "A cat has nine lives. The Sunbeam gets one spare."
- **Fish spoilage ("The Fridge Rule")**: at the start of Act 2 and Act 3, Fish above 120 lose 15% of the excess (rounded up). Message: "The fish in your pocket have made themselves known. Gerald's cousin collects {n} Fish for dignity." This stops hoarding and pushes shopping.

## 12. Difficulty scaling (Mischief Rank)

Rank cumulative: every rank also includes all lower ranks.
| Rank | Effect |
|---|---|
| 1 | Prowl Fish rewards -10% |
| 2 | +1 enemy in wave 1 of Prowls |
| 3 | Elites gain 1 extra affix; Keyword Primer can be removed freely (tutorial guard off) |
| 4 | Max Warmth 45 |
| 5 | Bosses gain a second Phase move |
| 6 | Curl Up heals 20% |
| 7 | Shop prices +15% |
| 8 | No Cradle Gift |
| 9 | Dawn Rest removed |
| 10 | No Last Life; all Night omens apply double |

Act scaling at a glance: threat budget up about x1.65 then x1.5 per act (table 10), enemy families change, bosses gain a phase per act, shops get a rare slot, and Elite weights rise 6 to 10. Night hp scale is smooth +5% per Night so no act spike feels like a wall.

## 13. Pacing budget (target 45 min median)

Assumes average player turn 15 seconds including animation, "Fast" toggle saves about 20%.
| Segment | Count | Min each | Total |
|---|---|---|---|
| Setup, act intros, loading | 1 | 2.5 | 2.5 |
| Prowl fights | 6 | 1.3 | 7.8 |
| Night fights | 5 | 2.0 | 10.0 |
| Elite fights | 1.5 | 2.6 | 3.9 |
| Boss fights | 3 | 3.2 | 9.6 |
| Reward screens (draft, charm, champion) | 15.5 | 0.33 | 5.1 |
| Non-fight nodes (Shops 1.2, others 0.5) | 8.5 | 0.6 | 5.1 |
| Summary | 1 | 1.0 | 1.0 |
| **Total** | | | **45.0** |

Rules to keep it there: max 20 seconds of enemy turn animation per turn at default speed, a battle auto-ends 3 turns after the last wave is cleared, skip buttons everywhere (rewards, event text), "Tap to skip" on cinematics. The 25 decisions (1 loadout, 24 map picks) average 1.8 minutes of play each.

## 14. Run end and summary

**Victory** (Night 9 boss falls): 6 second Dawn cutscene (skippable): sun rises on the cushion, cats curl up, the red dot goes out. Title card "The Sunbeam Holds". Unlocks processed, then summary.
**Defeat** (Warmth 0 and no Last Life): the sunbeam shrinks to a dot and winks out. Title card "The Cushion Is Cold". Shows what hit last.
**Retire**: pause menu option. Counts as a defeat with the cause "Went for a nap".
**Endless Nights** (Night 10+): not in v1, see open questions.

### RUN_SUMMARY screen
Two column layout (stacked on phone), 3 tabs on phone: Story, Deck, Stats.

| Block | Contents |
|---|---|
| Header | Victory or Defeat title, flavor line from pool, Mischief Rank, seed, clock time, Nights survived (X / 9) |
| Killed by | Enemy name, floor, turn, plus portrait. Victory shows "Defeated: {final boss}" |
| Champion strip | Champion portrait, 3 chosen upgrade paths, lives spent, MVP damage |
| Clowder (deck) | Full card list grouped by clan with counts, upgrade marks, charm icons. Tap a card to inspect |
| Relics | All relics in pickup order |
| Route recap | The map path taken with node icons per act, fish earned and spent along it |
| Stats | Battles won, elites beaten, Warmth lost and healed, Fish earned and spent, cards played, damage dealt, enemies Shooed, longest turn (cards in one turn), biggest single hit, highest stack reached (status name and value), lives spent, hairballs coughed, naps taken, time per act |
| Highlight reel | 3 auto written lines picked from stats, e.g. "You played 17 cards in one turn. Your paws filed a complaint." and "Biggest stack: Purr x41." |
| Rewards | Whisker XP earned (formula), clan levels, unlocks (new clan, champion, relic, card), next Mischief Rank unlocked |
| Buttons | Run Again (same loadout), New Run, Copy Summary (text with emoji), Deck Export, Main Menu |

Whisker XP formula: `Nights survived * 10 + elites * 5 + bosses * 20 + (victory ? 50 : 0) + mischiefRank * 10`. Unlock thresholds belong to the meta agent.
Share text example: `Nine Lives | Victory | Rank 4 | Tabby clan + Shadow | 43:12 | Night 9/9 | seed K4Q7ZX2A`.

## 15. RUN_CONFIG (single source of truth)

```js
const RUN_CONFIG = {
  rows: 8, cols: 5, paths: 4,
  startWarmth: 50, startFish: 60, bossWarmthBonus: [5, 5, 0], hpScalePerNight: 0.05,
  fridge: { threshold: 120, rate: 0.15, acts: [2, 3] },
  nook: { curlUp: 0.30, knead: { max: 3, heal: 8 } },
  dawnRest: 4, cleanNight: { fish: 8, heal: 3 }, bossHealPct: 0.40,
  fish: { prowl: [12,16,20], night: [20,26,32], elite: [30,38,46], boss: [70,90,0], skip: 6 },
  freeRowWeights: [
    { battle:38, mystery:20, event:14, shop:8, post:8, nook:6,  elite:6 },
    { battle:34, mystery:20, event:14, shop:8, post:8, nook:8,  elite:8 },
    { battle:30, mystery:20, event:14, shop:8, post:8, nook:10, elite:10 }
  ],
  rowSixEliteChance: 0.35,
  draftSize: 3, rarePityStep: 0.02, rarePityCap: 0.20,
  cardWeights: { main: 60, side: 25, neutral: 15 },
  prices: { common: 45, uncommon: 75, rare: 140, relicC: 110, relicU: 160, relicR: 230, charm: 90,
            shoo: [50, 25], milk: 40, reroll: [20, 10], sell: [15, 25] },
  threat: { prowl: [12,20,30], night: [20,32,46], elite: [28,42,60], boss: [45,70,100] },
  lastLife: true
};
```

## 16. Save schema (localStorage key `nl_run_v1`, try/catch on every access)

```js
{ v: 1, seed: "K4Q7ZX2A", mischief: 4, main: "tabby", side: "shadow", champion: "...", tier: [..],
  warmth: 41, maxWarmth: 55, fish: 132, lastLife: true, act: 2, night: 5, nodeId: "a2r3c2",
  maps: [ ... ], visited: [ ... ], deck: [ {id, up:true, charm:"..."} ], relics: [ids],
  rewardsPending: { ... }, stats: { ... }, rngCursor: { loot: 41, shop: 6, event: 3, battle: 88 },
  battle: null | { turnStartState } }
```
Mid-battle save is a turn start snapshot only. Corrupt save: show "The cat knocked this one off the shelf" and offer to delete.

## 17. Hooks other agents must honor
- Cards agents: clan starter slots (section 2), Collar Charm counts, rarity counts (aim 30% Common, 45% Uncommon, 25% Rare overall).
- Enemy agents: Threat cost per enemy, families per act, bosses (2 per act, 6 total), at least 4 Elite units per act.
- Relic agents: Starter (1 per clan), Common/Uncommon/Rare, Boss pool (18+), Shop-only (8+).
- Event agent: act pools of 14+ events each.
- UI agents: map node sizes (56px, 44px tap), summary screen blocks, reward stack.
- Meta agent: Whisker XP, Mischief unlocks, which clans/champions start unlocked.

## Open questions for the lead
1. Should the Nine Lives twist be locked? Cradle Gift "spare_life" and the summary's "lives spent" stat assume yes; both have fallbacks if rejected.
2. Do we add Endless Nights after Night 9 (Night 10+ with steeper scaling), or keep a clean 9 night run for v1?
3. Is the Last Life (one free Sunbeam save per run) too forgiving at Mischief 0 to 9, or should it be a relic reward instead?
4. Champion upgrade timing (tiers at Nights 2, 5, 8 on the row 6 fight): confirm with the champion agent that 3 tiers of pick-1-of-3 is the intended "3 ways" meaning.
5. Do combat floors rename per act (Garden, Parlor, Roof backdrops), or stay Cellar, Parlor, Attic everywhere as written?
