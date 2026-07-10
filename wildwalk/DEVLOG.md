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
7. [ ] Relics / run modifiers picked at milestones (roguelike boons).
8. [ ] Held trinkets (one item slot per monster) from shops/stories.
9. [ ] Between-run meta-progression (bank souls/honor for permanent unlocks).
10. [ ] Sound & music (chiptune battle loop + SFX for hit/catch/level-up).
11. [ ] Achievements + milestone perks.
12. [ ] Starter select at run start.
13. [ ] Weather / day–night affecting damage + catch.
14. [ ] Shop restock + reroll; deeper tiers show rarer wares.
15. [ ] Distance leaderboard (reuse the repo's Cloudflare KV board pattern).

## Cycle history
(newest first — appended each cycle)
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
