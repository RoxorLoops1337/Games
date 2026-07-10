# Wildwalk — Dev Log & Roadmap

An autonomous "studio" of agents improves Wildwalk one cycle at a time. Each cycle:
plan → build → test → ship. This file is the studio's memory: read it to see what's
done, then take the next unchecked item. Keep every change self-contained (one file,
`wildwalk/index.html`), keep `node tests/wildwalk.test.mjs` green, never break saves.

## Guardrails (every cycle)
- Only touch `wildwalk/index.html` (+ this log, + tests). No external assets — canvas only.
- Keep the `localStorage` key `wildwalk_save_v1` and its shape backward-compatible.
- `npm run check` must be green before every push.
- Prefer additive, focused changes (~one feature or one visual system per cycle).

## Shipped
- **c0** Base game: walk → auto-battle → catch/kill/release, crossroads (shop/rest/elite/
  story/gamble/shrine/nest), 18 species, types, evolution, souls/honor/gold, pokédex save.
- **c0** Full-party swap picker on catch; in-battle potions; campfire box-swap.
- **c0** Durable headless test suite `tests/wildwalk.test.mjs` wired into `npm run check`.

## Roadmap (next up — take the top unchecked item each cycle)
1. [x] Graphics & battle-juice overhaul — DONE c1.
2. [x] Combat abilities per type — DONE c2.
3. [x] Mid-battle switch — DONE c3.
4. [x] Pokédex screen — DONE c4.
5. [x] Biomes — DONE c5.
6. [x] Boss encounters — DONE c6.
7. [x] Relics / run modifiers — DONE c7.
8. [x] Held trinkets — DONE c8.
9. [x] Between-run meta-progression — DONE c9.
10. [x] Sound & music — DONE c10.
11. [x] Achievements + milestone perks — DONE c11.
12. [x] Starter select — DONE c12.
13. [x] Weather / day–night — DONE c13.
14. [x] Shop restock + reroll — DONE c14.
15. [x] Distance leaderboard (LOCAL best-runs) — DONE c15.
16. [x] More species + 2nd-tier evolutions — DONE c16.
17. [x] Daily-seed challenge run — DONE c17.
18. [x] Prestige / ascension — DONE c18.
19. [x] Guided tutorial / first-run onboarding — DONE c19.
20. [ ] More biomes + biome-specific boss variety.
21. [ ] Animated multi-frame sprites / richer idle+attack animation.
22. [ ] Endless post-game scaling mode.
23. [ ] Status-effect visual polish (clearer burn/stun/shield readouts).
24. [ ] Online Cloudflare KV leaderboard (functions/api/, deferred from #15).

## Cycle history
(newest first — appended each cycle)
- **c19 — Guided tutorial / first-run onboarding** (studio: designer, ux-designer, lead, engineer, QA).
  A first-run coach-mark overlay. One additive Dex.data flag tutorialDone:false; TUT_STEPS = 4 ordered
  tips keyed to the first entry of each core state (walk, battle, choice, crossroads). tutStep() (called
  each frame before draw) raises G.tutActive for the first unseen step matching G.state while
  !tutorialDone; drawTut() renders a translucent top-center card (title + wrapped body + 'Tap to continue')
  that never covers the action buttons. onClick's FIRST line dismisses any active tip and swallows the
  click (coach-mark gating — you tap once to dismiss, again to act), so it can't accidentally fire CATCH.
  Completing all 4 in a run (or a title-screen 'Skip Tutorial' button) sets tutorialDone+saves; once done
  it never shows again. G.tutSeen/tutActive reset every run. ZERO combat/spawn/reward/balance code touched.
  +7 deterministic tests (incl. input-gating drives a real canvas click and asserts the catch did NOT fire);
  test harness boot() baseline set to tutorialDone:true so combat suites aren't intercepted. 145/145, 0 flakes.
  All 8 save-shape arrays updated. Back-compat: old saves default tutorialDone=false and get the onboarding.
- **c18 — Prestige / ascension** (studio: designer, ux-designer, lead, engineer, QA). An opt-in
  difficulty ladder for bonus essence. Dex.data.ascension {max,sel} added additively (max unlocked,
  sel chosen 0..max, cap 8). Each level A stacks: wild & boss HP ×(1+0.12A), ATK ×(1+0.10A), −1
  starting potion per 2 levels — payoff essence ×(1+0.25A). newGame latches G.asc=sel; startDaily
  forces G.asc=0 (daily is always base difficulty). gameOver awards the scaled essence and, for
  non-daily runs, unlocks the next level when you clear tier ≥4 at your current top ascension. A
  stepper on the Sanctuary header (◀ ASCENSION sel/max ▶ + a live modifier hint) sets the level
  beside the essence pill without touching the upgrades grid; the title's BEGIN button sub reflects
  the active level + essence bonus. Multipliers guard G.asc undefined via (G.asc||0). +8 deterministic
  tests (mul helpers, spawnBoss hp/atk scale, potion latch, unlock gate incl. tier/daily/cap negatives,
  daily-forces-0, stepper clamp, old-save default). 138/138, 0 flakes. All save-shape arrays updated.
- **c17 — Daily-seed challenge run** (studio: designer, ux-designer, lead, engineer, QA + orchestrator fix).
  A deterministic daily mode: a 📅 DAILY CHALLENGE button on the title reseeds the existing LCG from
  today's UTC date so every player worldwide gets the identical run that day. dayInt() → YYYYMMDD
  (human-readable, shown as '#20260710'), dailySeedFor() avalanche-hashes it into the 32-bit seed.
  startDaily() reseeds → picks a deterministic starter from a FIXED pool (DAILY_POOL = COMMONS, ignores
  the menagerie upgrade so the seed can't desync cross-player) → newGame(key) → startWalk (skips starter
  select). gameOver records the day's best (dist+tier) into Dex.data.daily {day,dist,tier}, added
  additively with new-day reset in Dex.recordDaily; the DAILY button's sub-line shows the seed + today's
  best ('· best 342m' / '· unplayed'). Title reworked to two side-by-side big buttons; bottom row intact.
  QA caught the engineer using starterPool() (menagerie-dependent) instead of DAILY_POOL — orchestrator
  fixed it and added a menagerie cross-player-determinism regression test. +8 tests, 130/130, 0 flakes.
  Back-compat: Dex.data.daily defaults on old saves via Object.assign; all 7 save-shape arrays updated.
- **c16 — More species + 2nd-tier evolutions** (studio: designer, ux-designer, lead, engineer, QA).
  Grew the roster from 18 → 24 species: +2 rares (craghorn Rock·spiky·horn, gloomoth Shadow·winged·ghost)
  and +4 legendaries (terralith Rock, tsunareth Water, sylvarch Grass, fulgorax Volt) so every type now
  has a legendary. Completed two dead-end evolution lines: boulderk→craghorn and nightwyrm→gloomoth.
  Added a new `horn` branch to drawFeature (procedural sprite). Retuned the Pokédex card grid to 4 rows
  (pokedexCardRect → {x:22+c*155, y:112+r*114, w:140, h:104}) to fit the larger roster with per-rarity
  progress chips. RARES/LEGENDS pick pools extended. +4 tests (new species keys present; evo lines resolve;
  horn feat renders without error; 24-species dex progress). 122/122, 0 flakes. Back-compat: species are
  data-only additions, no save-shape change.
- **c15 — Local best-runs leaderboard** (studio: designer, ux-designer, lead, engineer, QA).
  Persists Dex.data.runsLog (added additively, back-compat default []): at game over Dex.recordRun
  pushes the run {dist,tier,fights,dex}, coerces NaN→0, sorts by dist desc, caps to 10, saves.
  A RECORDS screen (new G.state) from title + game-over ('r'/Esc) shows the ranked table with
  🥇🥈🥉 medals, a gold #1 highlight and a green "◀ THIS RUN" highlight on the just-finished row,
  plus an empty state. Completed the original 15-item roadmap; appended #16–24 for the studio to
  continue. +5 tests (old-save loads runsLog=[]; sort+cap-at-10; NaN coercion + rank handle;
  gameOver records + sets lastRunRec; screen open/back from title+gameover, empty+populated draw).
  Updated all 7 save-shape arrays to include 'runsLog'. 118/118, 0 flakes.
- **c14 — Shop restock + reroll** (studio: designer, ux-designer, lead, engineer, QA). The
  Merchant now rolls a randomized 4-slot stock (genShopStock) from a weighted pool biased by
  G.tier — deeper tiers surface more eggs/trinkets, fewer ball upgrades; revive only appears
  with a fainted ally, ball only while ballTier<3. Duplicates allowed. Per-slot affordability
  greys unaffordable cards; buying marks a slot SOLD. A 🔄 Reroll button costs escalating gold
  (5 + 3·rerolls), guarded as a hard no-op when broke. buy() refactored to a single SHOP_CATALOG
  price source + boolean return; buyStock maps a slot to the existing effect. Transient
  (G.shopStock/shopRerolls; no save change). +5 tests (valid stock+tier gating; reroll deducts+
  escalates+refreshes; reroll blocked when broke=same-ref no-op; buy applies effect+marks sold+
  no-op on sold/broke; save shape unchanged) — invariant-based, not RNG-exact. 113/113, 0 flakes.
- **c13 — Weather / day–night** (studio: systems + art designers, lead, engineer, QA). 5
  transient weather kinds (Clear/Rain/Sunshine/Night/Fog), set per encounter from a PURE integer
  hash of biome+fights (does NOT consume rnd(), fully reproducible/testable, biome-biased via
  BIOME_WEATHER). Small balanced combat/catch mods folded into strike/bossHeavyStrike/catchChance
  via weatherDmgMul/weatherCritMul/weatherCatchBonus: Rain Water×1.2/Fire×0.85 +2% catch;
  Sunshine Fire×1.2/Water×0.9; Night Shadow×1.2 +6% catch; Fog crit×0.55 +3% catch; envelope
  dmg[0.85,1.2] so every hit still ≥1 HP and fights always resolve. Canvas overlays (rain
  streaks, sun god-rays, night tint+stars, fog haze — fixed budgets, no G.parts) + a weather
  chip. Transient (no save change). +5 tests (documented mods; resolve under every weather;
  transience/purity; draw-never-throws incl. bogus weather). 108/108, 0 flakes.
- **c12 — Starter select** (studio: designer, ux-designer, lead, engineer, QA). BEGIN THE WALK
  (and game-over WALK AGAIN) now open a CHOOSE YOUR STARTER screen instead of a random pick:
  a card grid of the unlocked pool (sprite + name + type + HP/ATK/SPD), a 'SURPRISE ME' random
  button, and BACK. Honors the c9 'menagerie' meta-upgrade (starterPool() = COMMONS, or
  COMMONS+UNCOMMONS when owned). newGame(chosenKey) validates the key against the pool and falls
  back to random (a locked uncommon can't be forced in). No save change (starter is per-run).
  +5 tests (newGame(key) + bad-key fallback; pool honors menagerie both ways; pick enters walk
  with the chosen species; Back returns to title; fights resolve via the picker). 103/103, 0 flakes.
- **c11 — Achievements + milestone perks** (studio: meta + ux designers, lead, engineer, QA).
  14 persistent achievements (First Friend, Full Spectrum, Rare Find, Legend Keeper, Boss
  Slayer, Titan Bane ×10, Trailblazer t5, Voidwalker t10, Merciful ×25, Reaper ×25, Full House,
  Master Collector, Hoarder 500✦, Marathoner 1000m) — each a one-time essence reward with an
  unlock toast (sfx+burst). Award-once via a Dex.data.ach ledger; cumulative counters
  (killed/released/bossKills/bestTier/fullPartyWin/wildCatch) persisted in Dex.data
  (back-compat). checkAch() hooked at catch/kill/release/boss/tier/gameOver. Achievements
  screen (2×7 grid, locked/unlocked, X/Y) from title + game-over ('a'/Esc). +9 tests incl.
  old-save-loads, award-once (repeat-call + reload), counters persist, save superset.
  Orchestrator fix: 'First Friend' now requires a genuine wild catch (new wildCatch counter)
  instead of nCaught>=2 which the auto-caught starter tripped (+regression test). 98/98, 0 flakes.
- **c10 — Sound & music** (studio: sound-designer, ux-designer, lead, engineer, QA). A pure
  Web Audio (oscillator) layer — NO asset files. Chiptune music with walk/battle/boss mood
  variants via a 25ms look-ahead scheduler (mood follows G.state/boss), + SFX for hit, crit,
  catch, catch-fail, level-up, evolve, boss-appear, potion, select, defeat. Autoplay-safe:
  the AudioContext is created/resumed only on the first pointer/key gesture. A persistent
  🔊/🔇 mute toggle (title + HUD, 'm' key) stored in Dex.data.muted (back-compat default false).
  The whole layer is a guarded no-op when AudioContext is absent (headless tests) — voice cap
  16, nodes disconnect on end. +4 tests (no-throw sans AudioContext; muted defaults + old-save
  load; toggle flips+persists; mute intercept on game-over doesn't start a run). 88/88 green,
  0 flakes; verified in real Chromium with no JS errors.
  NOTE (audio-cycle recipe for future sound work): guard every audio call behind a lazy
  null-returning audioCtx(); never create ctx at load; back-compat the mute pref in Dex.data.
- **c9 — Between-run meta-progression ("The Sanctuary")** (studio: meta + ux designers, lead,
  engineer, QA). First PERSISTENT save extension — done back-compatibly: Dex.data gains
  essence:0 + upgrades:{} (Dex.load Object.assigns over defaults, so old {seen,caught,best,runs}
  saves load fine). Essence is earned each run at game over (dist/15 + souls/12 + new-best
  bonus) and banked. A Sanctuary screen (from title + game-over, Back/Esc) spends it on 6 tiered
  permanent upgrades — Fat Purse (+start gold), Herbalist (+start potion), Keeper's Hand (+base
  catch), Fine Spheres (+start ball tier), Soul Reserve (+start souls), Menagerie (uncommon
  starters) — which feed newGame()/catchChance. Party stays 4 (slot upgrade cut as risky).
  +6 tests incl. old-save-loads, essence-persists, buy-changes-newGame, overspend/max-tier
  guards, superset-save-shape. 84/84 green, 0 flakes. NOTE: WHOLE-SAVE format changed shape
  (superset) — this is the first cycle to add persistent fields; all future save edits must stay
  back-compatible the same way.
- **c8 — Held trinkets** (studio: systems + ux designers, lead, engineer, QA). One equippable
  item slot per monster (m.trinket) + a transient inventory (G.trinkets). 10 trinkets, each
  holder-only: Crit Fang (+12% crit), Type Gem (+20% dmg), Lifesteal Amulet (heal 15%), Swift
  Feather (+15% spd), Guard Stone (−15% dmg taken), Revive Berry (auto-revive once at 50% then
  consumed), Focus Band (stun ×0.4), Vigor Charm (+20% maxhp, survives level-ups), Ember Brand
  (+1.5s burn), Lucky Coin (+30% kill gold). Equip/unequip at the campfire via a modal overlay
  (conserves ids, no dup/loss); held icon badge on team cards; bought as a Trinket Bag (35g) or
  found in a story. Save-safe (all transient). +20 tests. Orchestrator caught & fixed 2 bugs the
  agents missed: equipping no longer revives a fainted holder (+regression test), and the
  inventory icons/names now render (opaque hitbox was hiding them). 78/78 green, 0 flakes.
- **c7 — Relics / run modifiers** (studio: systems + ux designers, lead, engineer, QA).
  12 roguelike boons (Keeper's Charm +catch%, Lucky Clover +rare-catch, Bloodstone lifesteal,
  Ember Heart +burn, Warlord's Banner +crit%, Executioner's Edge ×2.2 crits, Thornmail reflect,
  Verdant Idol fight-start heal, Merchant's Coin +30% gold [stackable], Phoenix Feather +boss
  potion, Pilgrim's Token +honor, Swiftpaw ×0.6 switch cd). Offered as a 3-card CLAIM A RELIC
  pick after every boss win + a new 'Relic Cache' crossroads option; no duplicate offers;
  owned relics shown as a HUD icon strip (×N for stacks). Each hooks a real system
  (catchChance/strike/finishSpawn/endFight/doRelease/switchCdMax). Transient G.relics
  (save-safe). +18 tests (each hook asserted; save shape unchanged; all-relics battle resolves).
  57/57 green, 0 flakes/10 runs. Engineer respected the no-git guardrail.
- **c6 — Boss encounters** (studio: combat-designer, ux-designer, lead, engineer, QA; shipped
  in #837). Every 6th fight (end of a biome) spawns a scaled legendary/rare BOSS with a
  segmented phased HP bar ("PHASE n/max", 2 phases, 3 at tier≥6), an intro banner (name +
  title), and TELEGRAPHED heavy attacks: a ~1s wind-up ring + "⚠ HEAVY ATTACK ⚠" + a reticle on
  the target, so you can switch a tank in or pop a potion. Heavy hit hard-capped at 60% of the
  target's maxhp (never one-shots, only hits the active mon). Phase breaks enrage + heal-block.
  Anti-softlock: player DPS is never gated, and an execute valve (heals off + 8%/s after 45s)
  forces every boss fight to end — proven by worst-case self-healer mirror tests. Rewards: 3×
  souls/honor, +40 gold, 2.2× XP, full team heal + potion + small permanent atk buff, and a
  90%-floored rare catch. Save-safe (one transient G.bossWin latch). +8 tests. 39/39 green.
  NOTE: the build agent self-merged this PR; future cycles restrict agents from git/PR ops.
- **c5 — Biomes** (studio: art-director, systems-designer, lead, engineer, QA). 6 canvas
  biomes that advance with depth (Verdant Meadow → Deepwood → Sunlit Shore → Hollow Caverns
  → Ashfall Ridge → The Deep Void), each a full palette + signature prop (forest canopy, shore
  waves, cave stalactites, volcano embers, void starfield) with a crossfade + "Now entering"
  label. Each biome soft-biases spawn types (pickBiased, +2.5 weight, never empties the pool;
  rarity/tier pools untouched). biomeForTier is pure/deterministic. Save-safe (transient
  G.biome*). +4 tests. ALSO hardened two pre-existing flaky tests (stun test forced a
  non-dodging wild; full-party swap now driven via acquire() instead of RNG catch) — suite is
  now deterministically green (31/31, 0 fails over 25+25 runs).
- **c4 — Pokédex collection screen** (studio: designer, ux-designer, lead, engineer, QA).
  A 6-col grid of all 18 species opened from title + game-over (button or 'd' key), with a
  Back button. Caught = full sprite + name/type/rarity with a rarity-colored glow; seen = dark
  silhouette + '???' + type; locked = '?'. Header shows Caught/Seen totals + per-rarity chips.
  Tap a caught/seen card for a detail overlay (HP/ATK/SPD bars, evolution, word-wrapped flavor;
  spoiler-safe for seen-only). Added a flavor line per species. Read-only over Dex.data
  (save-safe). +5 tests. 26/26 green.
- **c3 — Mid-battle party switch** (studio: systems + ux designers, lead, engineer, QA).
  Tap a living reserve card (or keys 1-4) during battle to send it in for type counter-play.
  Anti-abuse: 5s switch cooldown (radial ring + seconds on locked cards) AND incoming mon
  enters with a 0.6s entry cd; the wild's pending attack is NOT reset, so you can't swap to
  dodge a hit. Reserve cards pulse in their type color with a ↔ glyph when ready. Auto-switch
  on faint stays cooldown-free (anti-softlock). +8 tests. 21/21 green.
- **c2 — Per-type combat abilities + status UI** (studio: systems-designer, ux-designer,
  lead, engineer, QA). Fire burn DoT (stacks≤3, ≤6%/s, 3s), Water instant lifesteal (20%),
  Grass over-time leech (25%), Volt shock-stun (18%, 0.6s, 2.5s immunity — no lock), Rock
  guard (−15%, floored at 1 dmg), Shadow full-dodge (15%). Transient `status` bag on mon
  instances (save-safe, reset each fight in finishSpawn); statusTick DoT/regen/timers;
  stun gate in updateBattle. Status pips under HP bars + proc glows + DODGE/STUN/heal pops.
  +5 tests incl. a 4000-tick softlock guard (heal & guard mirrors both resolve). 13/13 green.
- **c1 — Graphics & battle-juice overhaul** (studio: art-director, feel-designer, lead,
  engineer, QA). Radial-lit sprite gradients + rim light + squash/stretch & windup/lunge/
  hurt motion; directional hit sparks (160-cap), crit rings, catch/level-up bursts;
  animated HP-bar ghost-drain + ratio colors; glowing moon halo, horizon haze, parallax
  motes/embers, vignette; two-chip type-advantage readout; bevelled/glowing panels &
  buttons; level-up flash on team cards. +199/-40, canvas-only, no logic/save changes.
  8/8 tests green.
