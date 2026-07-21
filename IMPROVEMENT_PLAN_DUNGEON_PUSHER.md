# Dungeon Pusher — Master Improvement Plan

The standing loop: each session picks the next unchecked chunk (1–3 related
items), implements it fully (`npm run check` green, screenshots when visual),
ships it via the usual PR flow, ticks it off here in the same PR, and re-arms
the next session. Ordered by impact ÷ effort inside each tier. Items marked
`[big]` deserve a whole session alone.

## Tier 1 — first impressions & core polish

- [x] **Title screen glow-up**: animated coin-rain backdrop, logo bob + shine sweep,
      floor-best + total-runs strip, VERSION stamp in a corner (session 2)
- [x] **Intro vignette**: five lore lines fade in before the first run, skippable,
      replayable from the 📜 title button (session 3)
- [ ] **Pause/settings menu**: gear button → volume sliders (music/SFX separate),
      screen-shake toggle, particle-density toggle, reset-tutorial, credits link
- [ ] **Run-end report card**: on death/victory — floors, kills, coins fired, damage
      dealt/taken, relics collected, gold earned, best single hit, run time
- [x] **Confirm dialogs**: generic confirm sheet; wired to abandoning a run and
      spending the last key (mid-battle exit has no UI path to guard) (session 3)
- [ ] **Toast/float polish pass**: cap simultaneous floats, merge duplicates ("+1 ● ×6"),
      ease-out motion so late-battle spam stays readable
- [ ] **Number formatting**: 1.2k / 3.4M everywhere gold and scores print
- [ ] **HP bar juice**: chip-damage ghost trail, heal green pulse, low-HP heartbeat
      vignette at ≤25%
- [ ] **Victory screen upgrade**: loot cascade animation into the sheet, relic pick
      cards flip in, boss victory gets its own fanfare sting

## Tier 2 — retention & meta-progression

- [ ] **Achievements (v1: 20)**: stored in `bm_` profile; toast on unlock; gallery
      screen behind a 🏆 button (first boss, floor 10/20, 6 heroes tried, vault
      opened, 100 coins one round, pacifist floor, etc.)
- [ ] **[big] Meta-progression: the WORKSHOP** — permanent account-level upgrades
      bought with a new meta-currency (cogs?) earned per run: +start key, +start
      purse coin, +1 starting relic choice, cheaper shops, pet capacity
- [ ] **Unlockable heroes ladder**: gate remaining heroes behind milestones (Crane
      Keeper floor 10, others per achievement) with sealed-card teasers like the ghost
- [ ] **Daily run**: seeded from the date, fixed hero + modifier, one attempt, its own
      leaderboard entry kind
- [ ] **Stats screen (lifetime)**: totals across runs — coins fired, bosses slain,
      favorite hero, best floor per hero
- [ ] **Bestiary/codex**: tap-a-foe card grows into a collection book — kill counts,
      lore line per enemy, silhouette until first met
- [ ] **Relic codex**: all 137 relics browsable, owned/seen/undiscovered states
- [ ] **Run history**: last 10 runs, one line each (hero, floor, cause of death)

## Tier 3 — gameplay depth

- [ ] **Boss mechanics v2**: each boss gets one signature ARENA twist (Dragon: gold
      coins ignite randomly; Lich: raises a slain foe at half HP; Pit Boss: tray tax
      every 3rd round)
- [ ] **[big] Room events / NPCs**: 6 hallway encounters between rooms — gambler
      (double-or-nothing a relic), cursed fountain, mimic chest, lost adventurer
      (escort = reward), coin-eating slime, shrine of trades (HP↔gold)
- [ ] **Floor quests**: one optional objective per floor ("clear 3 rooms without
      tilting", "bank 15 loot") → bonus golden key or relic
- [ ] **[big] Rat King hero** (design approved in chat): items become rats, rats
      scurry on the pile jostling coins, swarm persists between battles, cheese heals
- [ ] **Skull Gardener enemy** (user: "great"): uncollected skulls on the pile
      duplicate each round it lives
- [ ] **Endless mode proper**: after floor 15 — mutators stack every 3 floors,
      score multiplier, separate leaderboard flag
- [ ] **Difficulty modes**: EASY (−20% enemy HP) / NORMAL / NIGHTMARE (+30%, elites
      always hexed) chosen at run start, stamped on the leaderboard
- [ ] **Coin mastery**: fire 500 of a kind lifetime → its +1 upgraded face (visual +
      tiny stat bump), tracked in the codex
- [ ] **More pets**: owl (reveals intents through blackout), tortoise (taunts, high
      HP), fire beetle (burns attacker) — pet art via item pipeline
- [ ] **Economy sink**: the WELL — throw gold in for a random small blessing, prices
      scale with floor (late-game gold has somewhere to go)

## Tier 4 — feel, sound & accessibility

- [ ] **Sound pass v2**: distinct boss-hit / elite-kill / vault-open / golden-key
      stings; UI tick on button press; wheel ratchet clicks per segment
- [ ] **Music**: 3 loops (dungeon / battle / boss) via a tiny WebAudio sequencer,
      music volume slider, mute persists
- [ ] **Haptics**: navigator.vibrate on chomp, boss hit, jackpot (behind a toggle)
- [ ] **Colorblind support**: palette swap option for coin kinds (shapes/symbols
      already differ — audit contrast), tested against deuteranopia sim
- [ ] **Reduced motion**: honor prefers-reduced-motion — no shake, gentler particles
- [ ] **Font/readability audit**: minimum 10px effective, contrast ≥ 4.5:1 for body text
- [ ] **Touch targets**: everything tappable ≥ 40px; audit coin picker + door hitboxes
- [ ] **Keyboard/gamepad**: full run playable with arrows+space+enter; gamepad API
      mapping for the same
- [ ] **Screen-reader labels**: aria-live region announcing phase changes and results

## Tier 5 — platform & robustness

- [ ] **PWA**: manifest + service worker (offline after first load), install prompt,
      icon set from cover art
- [ ] **Cloud saves**: reuse `functions/api/save.js` pattern (KV `BOARD`) — profile
      sync button in settings, conflict = newest wins with confirm
- [ ] **Leaderboard**: reuse `functions/api/board.js` — daily + all-time best floor,
      name entry (12 chars), top-50 screen
- [ ] **Save migration hardening**: versioned migrations table, corrupt-save quarantine
      (keep bad blob under `bm_backup_*`, start fresh, offer restore)
- [ ] **Error recovery**: window.onerror → toast + auto-save + safe return to title
      instead of a dead canvas
- [ ] **Version/changelog screen**: "what's new" on first launch after a version bump,
      fed from a CHANGELOG list in the file
- [ ] **Performance budget CI**: headless frame-time probe in tests — fail if a
      500-frame battle sim exceeds budget (catches perf regressions at PR time)
- [ ] **Asset preload polish**: loading bar on first boot listing art packs; lazy
      relic art already ships — extend to enemy sheets
- [ ] **Localization hooks**: wrap user-facing strings in `T()` now, ship `en` table;
      NL translation as the proof pass

## Tier 6 — content stretch

- [ ] **Act 4: THE MINT** — 13 new enemies (roster reskins + 3 new traits: magnetic
      armor, coin-clone, jackpot-thief), new floor palette, act boss: THE AUDITOR
- [ ] **More bosses per act**: 2nd boss per act rotates in on even-numbered runs
- [ ] **Hero skins**: 1 alt palette per hero, unlocked by floor-15 clear with that hero
- [ ] **Machine themes**: unlockable cabinet skins (bone, gilded, neon) — pure CSS/draw
      palette swaps
- [ ] **Seasonal seeds**: holiday-window cosmetic sprinkles (pumpkins on the pile in
      late October, snow in December) — clock-based, no assets from network
- [ ] **Prestige: NEW GAME+** — beat floor 15 → NG+ badge, enemies +1 act offset,
      exclusive relic pool (5 NG+-only relics)
- [ ] **Photo mode**: hide HUD button on victory screen for clean screenshots
- [ ] **Credits screen**: art, code, playtesters — reachable from settings

## Done (this loop)

- [x] Plan authored (session 1)
