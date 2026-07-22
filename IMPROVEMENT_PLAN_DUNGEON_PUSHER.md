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
- [x] **Pause/settings menu**: gear on title + dungeon → SFX volume notches,
      screen-shake / particles / sound toggles, replay-the-tale, credits + version
      (music slider arrives with the music item) (session 4)
- [x] **Run-end report card**: hero, floors, kills, gold, coins fired, damage
      dealt/taken, best single hit, relics, run clock — tracked in run.stats,
      saved/loaded, itemized on the death screen (session 5)
- [x] **Confirm dialogs**: generic confirm sheet; wired to abandoning a run and
      spending the last key (mid-battle exit has no UI path to guard) (session 3)
- [x] **Toast/float polish pass**: duplicates merge into ×N counters, stack capped
      at 12 (oldest small float yields), ease-out drift (session 6)
- [x] **Number formatting**: fmt() now goes compact past 10k (12.3k / 3.4M),
      commas below — every gold/score print inherits it (session 6)
- [x] **HP bar juice**: ghost trail already lived; added heal green swell-ring and
      the ≤25% lub-DUB heartbeat vignette (battle + dungeon) (session 7)
- [x] **Victory screen upgrade**: trophy pops, spoils cascade a beat later, relic
      cards flip in staggered, coin spoils bounce in, boss FANFARE sting (session 7)

## Tier 2 — retention & meta-progression

- [x] **Achievements (v1: 20)**: ACH table + achUnlock/achPoll engine (event hooks +
      1s poll), toast cards slide in, 🏆 TROPHY HALL gallery on the title, persisted
      on the profile (session 8)
- [x] **[big] Meta-progression: the WORKSHOP** — COGS drop when a run ends
      (floor + kills/8); eight leveled forever-upgrades: Tough Hide, Fatter Purse,
      Spare Keys, Deep Flask, Haggler, Big Kennel, Heirloom, Iron Wrists;
      workshop door on the title with the balance (session 11)
- [x] **Unlockable heroes ladder**: HERO_LOCKS data-driven — founding four open,
      Crane Keeper seals at floor 10, Poltergeist at 20; casting-ledger
      grandfathering; per-hero seal text on the cards (session 12)
- [x] **Daily run**: 📅 DAILY on the title — date-seeded dungeon, fate-picked hero
      (locked ones guest-star) + one of five twists, ONE attempt/day, result filed
      on the calendar; leaderboard hookup waits for the leaderboard item (session 12)
- [x] **Stats screen (lifetime)**: 📊 RECORDS on the title — runs, kills, bosses,
      coins fired, damage, gold, time in the deep, favorite hero, best descent
      (S.life ledger fed by endRun/winBattle, persisted) (session 9)
- [x] **Bestiary/codex**: 📖 CODEX act tabs — every foe with kill counts and
      trait line, shadows + '???' until first met, boss rows gilded (session 10)
- [x] **Relic codex**: rarity shelves in the CODEX — all 137 painted icons, owned
      shine, undiscovered padlocked, tap-to-read strip (session 10)
- [x] **Run history**: THE LAST RUNS in the records book — ten lines, newest first,
      hero + floor + kills + cause of death (session 9)

## Tier 3 — gameplay depth

- [x] **Boss mechanics v2**: arena twists — Dragon breathes on 2 gold coins each
      round (collect alight = +2 burn), Lich raises a half-HP skeleton every 3rd
      round, Pit Boss taxes the smallest tray piece every 3rd round (belly-refunded)
      (session 13)
- [ ] **[big] Room events / NPCs**: 6 hallway encounters between rooms — gambler
      (double-or-nothing a relic), cursed fountain, mimic chest, lost adventurer
      (escort = reward), coin-eating slime, shrine of trades (HP↔gold)
- [x] **Floor quests**: one optional job per floor (slay N / no-tilt win / bank N),
      posted under the floor title, pays a golden key or a relic (session 14)
- [x] **[big] Rat King hero**: no items — every item source recruits a rat (cap 8,
      full swarm feasts +2 HP); the swarm persists across battles with its scars;
      rats SCURRY laden pile lanes each round (painted dash animation); gems are
      CHEESE (+3 HP swarm, every 3rd grows a 16-HP Dire Rat: 2 dmg + bleed);
      jackpot rains a recruit; unseals at floor 8 (session 15)
- [x] **Skull Gardener enemy**: act II (+ Grave Gardener act III) — SOWS skulls on
      its turn, and every skull left on the field SPROUTS a twin each round
      (crop capped at 6) (session 14)
- [x] **Endless mode proper**: floor 16+ stacks a DECREE every 3 floors (THICK AIR /
      SWIFT DOOM / ARMORED AGE / BONE RAIN / RICH VEINS), announced on descent,
      posted at the gate, cogs pay +20% per decree; leaderboard flag waits for the
      leaderboard item (session 16)
- [x] **Difficulty modes**: MERCIFUL (−20% HP) / NORMAL / NIGHTMARE (+30% HP, elites
      hex 3× as often) — three door chips on the title, stamped on the run and the
      report card (session 16)
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
