# CLAWSPIRE

**A claw machine roguelike.** Your deck is a bin of physical objects. Every
fight is a handful of claw drops: steer, let go, and whatever the prongs
carry to the chute gets played. What slips out lands back in the pile.

Play: https://games-71g.pages.dev/clawspire/

Portrait, built for a phone in one hand, works on desktop with arrows + space.
No assets: the art is canvas code, the audio is WebAudio synthesis, the
physics is a small rigid body engine written for the claw.

## The loop

1. **Map (Roguebook):** a hex map hidden under ink. Spend ink to reveal a hex
   next to the lit area, or use a brush to reveal a shape. Walk to a lit hex
   to enter it: fights, elites, treasure, gems, ink, brushes, events, shops,
   rests, forges. The boss waits at the far edge. Reveal more for more loot,
   or rush.
2. **Fight (Slay the Spire, but the deck is a claw machine):** enemies show
   intents. Each turn you get grabs (three to start). A grab is a claw drop:
   what reaches the chute is played in order (swords hit, shields block,
   potions heal, bombs burn, shards chill). Two or more items in one grab is
   a jackpot. Enemies fight back with status effects and by messing with the
   bin: shaking it, greasing it, dumping rocks in it, stealing from it,
   freezing items in ice, fogging the glass, tilting it.
3. **Grow:** reward items drop into the bin, relics bend the rules, forges
   upgrade items (Monster Train style plus versions), rests and shops upgrade
   the claw itself: an extra grab, a wider claw, a stronger grip, a third
   prong, rubber tips, a magnet.

Three characters (knight, alchemist, rogue), three acts, a final boss, meta
unlocks and a collection.

## Files

- `index.html` markup + CSS + boot
- `js/util.js` rng and helpers
- `js/art.js` optional PNG overrides from `art/` (see `ART_PROMPTS.md`)
- `js/physics.js` rigid bodies, joints, the cabinet and the claw rig
- `js/data.js` items, enemies, statuses, relics, events, characters, upgrades
- `js/combat.js` the turn engine (pure state + events)
- `js/map.js` the hex map
- `js/audio.js` sfx + generative chiptune
- `js/render.js` all art and particle fx
- `js/game.js` screens, run state, saves, the glue
- `DESIGN.md` the design bible and module contracts
- `gallery.html` every piece of art on one page
- `ART_PROMPTS.md` the image generator prompt book, `art/` where the PNGs go

Tests: `npm run test:clawspire` (eight headless suites in `tests/clawspire_*`).
