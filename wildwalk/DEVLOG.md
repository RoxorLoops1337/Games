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
2. [ ] Combat abilities per type (Fire burn, Water heal-on-hit, Volt stun, Rock guard,
       Grass lifesteal, Shadow dodge) with status icons on HP bars.
3. [ ] Mid-battle switch — tap a party member to send it in (short cooldown) for counter-play.
4. [ ] Pokédex screen (gallery of seen/caught with stats/flavor) from title + game-over.
5. [ ] Biomes (forest/cave/volcano/shore) that reskin the walk and bias spawn types.
6. [ ] Boss encounters every few tiers — phased health bar, big rewards, guaranteed rare.
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
- **c1 — Graphics & battle-juice overhaul** (studio: art-director, feel-designer, lead,
  engineer, QA). Radial-lit sprite gradients + rim light + squash/stretch & windup/lunge/
  hurt motion; directional hit sparks (160-cap), crit rings, catch/level-up bursts;
  animated HP-bar ghost-drain + ratio colors; glowing moon halo, horizon haze, parallax
  motes/embers, vignette; two-chip type-advantage readout; bevelled/glowing panels &
  buttons; level-up flash on team cards. +199/-40, canvas-only, no logic/save changes.
  8/8 tests green.
