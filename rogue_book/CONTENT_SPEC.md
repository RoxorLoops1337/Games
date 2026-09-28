# INKWOVEN -- content specification

Targets, guardrails and voice for every content file. Schemas and the closed vocabularies are in
`DESIGN.md` and `js/data.js` (`DATA.LISTS`). This file says how much, how strong, and how it should feel.
Content is data only: no functions, no `Math.random`, no em or en dashes. Register with `DATA.add(kind, defs)`.

## 1. Voice

Storybook narration, warm and a little wry. Short sentences. Names are Japanese-flavoured English
("Petal Slash", "Moon Veil", "Ink Well"), 1 to 3 words. Flavour lines and lore read like a fairy tale told
by someone who loves the characters. Bestiary lore is 1 to 2 sentences. Never crude, never mean.
Player-facing numbers come from the ops, never typed into text by hand (card text is generated).

## 2. Fixed ids other modules depend on

- Starter cards: `hanae_slash hanae_parry hanae_petal_step`, `kuro_ink_bolt kuro_ink_ward kuro_first_stroke`,
  `suzu_ofuda suzu_barrier suzu_moon_prayer`, `raiga_jab raiga_brace raiga_static_fist` (5-card starters are
  defined in `DATA.heroes`: two copies of the strike, two of the defence, one signature).
- Boss ids: `boss_kuzunoha` (ch1), `boss_jorogumo` (ch2), `boss_editor` (ch3).
- Achievements: `ch1_clear`, `ch2_clear` (unlock Suzu and Raiga), plus `ch3_clear` (the first win).
- Curse cards (`hero:'curse'`, defined in `data_cards_shared.js`): `curse_regret` (unplayable; in hand at end of turn: hurt 2 to the front hero),
  `curse_smudge` (unplayable, pure clutter), `curse_doubt` (unplayable; when drawn: weak 1 on the front hero), `curse_burden` (unplayable, innate),
  `curse_hex` (unplayable; in hand at end of turn: vulnerable 1 on both heroes), `curse_decay` (unplayable; in hand at end of turn: hurt 1 to both).
- Status cards enemies add to your piles (`hero:'status'`, same file): `status_blot` (unplayable, ethereal), `status_tangle` (cost 1, exhaust: remove Bind),
  `status_scorch` (unplayable, ethereal; in hand at end of turn: hurt 2 to the front hero), `status_redacted` (unplayable), `status_static` (cost 0, exhaust: hurt 2 self, draw 1),
  `status_wilt` (unplayable; when drawn: lose 1 Energy via `energy` n -1).
- Curses and status cards use `rarity:'token'`, `type:'curse'` or `'status'`, need no `up`, and still need `art` (`void`, `web`, `skull`, `sigil`, `ink_splash`, `fire` fit).

## 3. Cards (per hero: `data_cards_<hero>.js`)

Per hero, exactly the starters above plus: **14 commons, 12 uncommons, 8 rares** (all non-token, all with `up`), plus tokens only if your cards `add` them.
Mix: at least 30% attacks and 30% skills; at least 4 powers (uncommon and rare); at least one `X` cost card; at least 3 cards using `cond` on `row`;
at least 4 cards that touch the ally hero (`tgt:'ally'` / `'both'`, or `per` with `who:'ally'`); at least 2 `pick` cards; at least 5 cards with keywords.
Three archetypes per hero, each with at least 4 cards that clearly push it, and some that bridge two:

| hero | archetypes | resource | best row |
|---|---|---|---|
| Hanae | **Bloom burst** (stack Bloom, spend with `consume:'bloom'`), **Flurry** (multi-hit plus Might), **Riposte** (Block into damage, Dodge) | `bloom` | front |
| Kuro | **Blight** (Poison and Burn engines), **Sumi spells** (spend `sumi`, AoE), **Scribe** (draw, retain, energy, pick, exhaust tricks) | `sumi` | back |
| Suzu | **Sanctuary** (Block, heal, `ward` spending), **Thorns and Taunt** (retaliation), **Talismans** (Weak, Vulnerable, Stun control) | `ward` | back (front for thorns) |
| Raiga | **Storm** (multi-hit and AoE lightning from `charge`), **Retaliation** (Thorns, damage when hit), **Brawler** (Stun, Burn, big single hits) | `charge` | front |

Power guidance at 3 Energy and starter-deck quality (numbers are base, upgraded is roughly +30 to 40%, or adds value such as a keyword or a cheaper cost):
1-cost attack 6 to 9 damage; 2-cost attack 11 to 16 (or 7 to all); 3-cost attack 20 to 28 (or 12 to all); 0-cost attack 3 to 5; 1-cost skill 5 to 8 Block;
2-cost 10 to 15 Block; draw 1 is worth about a 0-cost card; +1 Energy costs a real drawback or a stiff cost; Poison 3 to 5 for 1 Energy, Weak/Vulnerable 1 to 2 for 0 to 1 Energy.
Rares should change how you play, not just hit harder. Uncommons carry the archetype pieces. Commons are solid, readable building blocks.

Slots: starters and commons have 1 slot (attacks `red`, skills `blue`, some `green`), uncommons 1 to 2, rares 2 (one may be `any`).
`locked:true` on at most 4 uncommons and 4 rares per hero, never on starters or commons. Every card has `art` (`m` from `LISTS.motifs`, `c` from `LISTS.palettes`,
`hero:true` if the hero's pose belongs in the illustration; use it on about half of the attacks). No two cards of a hero share the same `art.m` plus `art.c` pair.
Ids are `<hero>_<snake_name>`, tokens `<hero>_tok_<name>`. Add one-line `flavor` to every rare and to a third of the others.

## 4. Enemies (`data_enemies_<chapter>.js`)

Per chapter: **9 to 10 normals, 3 elites, 3 minions** (summoned or paired, `tier:'minion'`, cheap), and the boss for its chapter (`boss_*` ids fixed; ch3's `boss_editor` has 3 phases,
the others 2). Each chapter defines encounter pools with `DATA.addEncounters(ch, {normal, elite, boss})`: at least 12 normal groups (1 to 3 enemies in ch1, up to 4 in ch2 and ch3),
`min` values spread from 0 to 0.8 so early tiles get easy groups, and 3 elite groups.

HP and damage at Trial 0 (per hit, before Might and Vulnerable):

| chapter | normal HP | normal hit | heavy hit | elite HP | elite hit | boss HP |
|---|---|---|---|---|---|---|
| 1 | 16 to 38 | 4 to 9 | 12 to 14 | 55 to 85 | 8 to 14 | 170 to 200 |
| 2 | 28 to 58 | 7 to 14 | 16 to 20 | 85 to 125 | 12 to 18 | 240 to 280 |
| 3 | 42 to 80 | 10 to 18 | 22 to 26 | 120 to 165 | 15 to 22 | 420 to 480 (across 3 phases) |

Mechanic coverage per chapter: at least 2 enemies that strike the back row or all heroes, at least 2 that debuff (Weak, Vulnerable, Frail, Poison, Bind, Stun on heroes), at least 1 summoner,
at least 1 with Thorns or Plating, at least 2 multi-hitters, at least 1 that adds junk cards (`add` of the status cards in section 2), and elites each with one signature mechanic
and at least one `rules` entry or phase. Ch1 teaches the basics with readable telegraphed patterns. Ch2 adds Bind, Stun, summons and back-row pressure. Ch3 stacks mechanics and uses the status cards heavily.
Bosses use `open`, `rules`, and `phases` (with `say` lines and stat swings), summon minions, and have a memorable signature move. Every enemy has `lore` and `tags`
(from: `spirit beast folk undead construct insect avian aquatic void`). `art.id` equals the enemy id (ART draws by id). Sizes: normals `s`/`m`/`l`, elites `l`, bosses `xl`.
Suggested rosters (ids are yours, keep them snake_case; keep it fresh and memorable):
ch1 kappa, tanuki bandits, kodama, karakasa, hitodama wisps, oni cub, crow tengu, bamboo sprites, mushroom folk; elites: oni brute, tengu duelist, mossy stone guardian.
ch2 chochin lanterns, karakuri puppets, nopperabo, drowned samurai, spiderlings, koi spirit, tsukumogami; elites: drowned general, puppet master, umibozu.
ch3 storm drones, komainu guardians, redaction knights, void scribes, blank soldiers, sky serpents, eraser wraith; elites: censor golem, storm dragon whelp, black-bar inquisitor.

## 5. Relics and gems

**Relics** (`data_relics.js`): at least **64**: common 22, uncommon 22, rare 12, boss 6, shop 4 (hero-specific relics count within these: 3 per hero, using `hero`).
Cover: static `mods` (energy, hand size, Ink, gold, prices, healing, rare boost, reward choices, free swaps), combat hooks (turn start and end, on play with a `filter`, on damaged, on kill, on swap, on hero down, on shuffle, on exhaust),
run hooks (`onPickup`, `onChapterStart`, `onRest`, `onPaint`, `onFightWon`, `onShopEnter`), row and swap synergies, Ink and Brush relics (they matter on the map), and gem relics (gem-slot interactions using hooks and `gold`/`ink`/`draw`).
Boss relics may give `energy +1` or `hand +1` with a real drawback (a curse in the deck via `onPickup addCurse`, a smaller `inkMax` as a negative mod, `healMul` below 1).
Text is one sentence, at most 90 characters, plain. `locked:true` on at most 30%. `art.m` from `LISTS.relicIcons`, spread widely.

**Gems** (`data_gems.js`): **24**, six per colour with tiers 1, 1, 2, 2, 3, 3. Red (offence): damage, extra hits, lifesteal-like effects via `fx`, conditional front-row power. Blue (defence): Block, Thorns, healing, Dodge.
Green (utility): draw, cost reduction (`cost` -1 only at tier 3), `retain`, Energy, `pick` free effects via `fx`. Gold (wild): status seeds, gold and Ink on play, back-row or front-row conditionals, resource gain (`bloom sumi ward charge`).
Names are jewel names with character ("Ember Ruby", "Tidewatch Sapphire", "Quickthought Emerald", "Sunwake Topaz"). `locked:true` on some tier 2 and 3.

## 6. Events, meta content, tips, lore

**Events** (`data_events.js`): at least **30**: 8 per chapter (`chapters:[n]`) plus 6 for any chapter. 2 to 4 choices each, at least one safe choice, a gamble, and often a cost.
Mix in: fights (`fight` op), curses (`addCurse` with the fixed curse ids), gem, brush and Ink gifts, card transformation and removal, max HP trades, a few that need a relic (`req.relic`) or a flag set by an earlier event,
a merchant with a strange deal, a hero moment (ask the heroes, flavoured differently by who is in the party is optional). Each event has `id`, `title`, `text` (60 to 220 chars), `art:{scene}` (a `LISTS.scenes` id),
`once:true`, and `choices:[{label, req?, cost? (display string), out:[{w, text, ops}]}]`. Outcome `text` is required and fun.

**Achievements** (`data_meta.js`, `DATA.add('achievements', ...)`): **32**, each `{id, name, text, stat:{k, gte}, reward?:{inkstones:n}}`, `k` from `DATA.LISTS.statKeys`.
Include the fixed ids in section 2, hero mastery (`winsHanae` ...), milestone runs, painting (`hexesPainted`), collecting (`relicsFound`), flawless bosses, small deck wins, trial clears (`trialBest`), and a few silly ones.
**Trials** (`DATA.add('trials', ...)`): levels 1 to 10 (level 0 is implicit), `{id:'trial_1', level, name, text, mods}` from `LISTS.trialMods`, escalating: enemy HP and damage, fewer Ink, thinner gold, weaker healing, fewer revives, curses in the starting deck, dearer shops, and a last trial that is punishing but fair.
**Tips** (`DATA.add('tips', [strings])`): 30 short loading and hint lines. **Lore** (`DATA.add('lore', ...)`): `{id, title, text}` for `intro`, `ch1_intro`, `ch2_intro`, `ch3_intro`, `ch1_clear`, `ch2_clear`, `victory`, `defeat`, `hero_<id>` x4, and
`barks_<id>` x4 as `{id, lines:{start:[..], hurt:[..], kill:[..], down:[..], win:[..], swap:[..]}}` (5 lines per key, in each hero's voice: Hanae dry and proud, Kuro bookish and teasing, Suzu soft and steady, Raiga booming and kind).

## 7. Balance targets (the Wave 3 bot measures these)

An automated greedy player (plays affordable cards by a fixed value heuristic, keeps the front hero healthy, drafts by archetype) at Trial 0:
chapter 1 cleared in 85 to 97% of runs, chapter 2 in 60 to 80%, the full game in 15 to 35%. Each Trial level lowers the full-clear rate by about 3 points. No hero pair below 8% or above 45% full clears.
Median run length 45 to 90 minutes of human play (about 24 to 30 fights across 3 chapters). No card, relic or gem shows up in more than 2.5x the average pick-win share.
