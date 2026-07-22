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
- [x] **[big] Room events / NPCs**: six strangers as room dwellers with a generic
      choice-modal — Gambler (gold/key stakes), Cursed Fountain, Suspicious Chest
      (mimic!), Lost Adventurer (escort pays a relic / rob), Coin-Eating Slime,
      Shrine of Trades (blood↔gold); walking away keeps them waiting (session 17)
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
- [x] **Coin mastery**: 500 lifetime fires of a kind → MASTERED ★, its effect +1
      forever (gold dmg, silver block, green pois, red heal, blue dmg, lucky dmg) —
      ledger in the codex, noted in the inventory coin rows (session 18)
- [x] **More pets**: Watch Owl (sees through BLACKOUT), Tortoise (20 HP wall, +2
      block/round), Fire Beetle (scorches whatever strikes it) — in shops/chests via
      the item pipeline (session 18)
- [x] **Economy sink**: the WISHING WELL — a seventh hallway stranger; toll is
      15 + 5×floor gold for a rolled boon (heal / keys / relic / nothing, wells do
      that), plus a free wish that rarely listens (session 18)

## Tier 4 — feel, sound & accessibility

- [x] **Sound pass v2**: boss-hit thud, elite-kill brass, vault-open chime run,
      golden-key dings, UI tick on every styled button, wheel ratchet per
      segment (session 19)
- [x] **Music**: matchbox WebAudio sequencer — three moods (dungeon hums, battle
      drives, boss stomps with hats), auto-switching on screen/boss state, own
      MUSIC volume notches, mute-aware, all persisted (session 20)
- [x] **Haptics**: navigator.vibrate on the claw CHOMP, heavy blows taken, boss/elite
      kills, jackpot, vault-open — behind a settings toggle (session 19)
- [x] **Colorblind support**: COLORBLIND MARKS toggle — every pile coin wears its
      kind symbol on a high-contrast dark badge (faces/symbols already differed;
      this removes color as the only cue) (session 21)
- [x] **Reduced motion**: prefers-reduced-motion auto-calms shake + particles on
      fresh profiles; explicit settings choices always win (session 21)
- [x] **Font/readability audit**: body text floor raised to 10px, micro-labels to
      9px; too-dim inks (#6a5a68 family) brightened past 4.5:1; hero-card chips
      shrink-to-fit via fitTxt instead of overflowing; regression-guarded by a
      source-scan test (session 24)
- [x] **Touch targets**: every uiBtn hit box grows to ≥38px square (visuals
      unchanged, topmost-wins keeps tight rows precise); doors are walk-through,
      no hitbox needed (session 21)
- [x] **Keyboard/gamepad**: arrows/WASD move & aim, SPACE fires (hold = pour,
      and it walks the crane), TAB/ENTER ring-and-press any button, ESC backs
      out of everything; gamepad polled onto the same paths (stick/dpad move,
      A fires, B backs, bumpers cycle) (session 23)
- [x] **Screen-reader labels**: the TOWN CRIER — a hidden aria-live region relays
      screen changes, every banner/toast, victory spoils, and a low-health
      warning, batched against firehosing; canvas carries a role+label (session 25)

## Tier 5 — platform & robustness

- [x] **PWA**: manifest (standalone, portrait, maskable icons) + service worker —
      shell network-first, everything else cache-first with backfill, offline
      after one visit (Playwright-verified); beforeinstallprompt caught and
      re-offered as a 📲 INSTALL title chip; painted coin icon set (session 26)
- [x] **Cloud saves**: `functions/api/dungeon_save.js` on the SAME DPBOARD binding
      (dpsave: prefix — the board's one dashboard step covers this too) — bearer
      sync codes (XXXX-XXXX, year TTL refreshed on touch), ☁ CLOUD SAVE overlay
      from settings with BACK UP / RESTORE, restore always passes the confirm
      sheet and says which side is newer (save blobs now clock-stamped) (session 28)
- [x] **Leaderboard**: `functions/api/dungeon_board.js` (KV binding **DPBOARD** —
      one dashboard step to go live; 503-graceful until then) — all-time +
      rolling daily boards from ONE post, floor-then-kills ranking, best-per-name,
      cap 50, per-IP throttle; 🏅 THE DEEP BOARD screen with tabs/pager/medals,
      on-canvas name carver (12 chars, physical keys work too), CARVE IT chip on
      the fallen-run screen; sw.js never caches /api/ (session 27)
- [x] **Save migration hardening**: sv-versioned schema + migration ladder;
      corrupt blobs QUARANTINED under `<key>_quarantine` (never destroyed), clean
      start + title notice (session 22)
- [x] **Error recovery**: the CRASH NET — uncaught errors save the run, close every
      overlay, bail battle→dungeon (or title), toast the player; rate-limited
      against crash loops (session 22)
- [x] **Version/changelog screen**: CHANGELOG list feeds the WHAT'S NEW scroll —
      auto-opens once after a version bump (seenVer ledger, persisted), full
      history from settings; VERSION now derives from the top entry (session 23)
- [x] **Performance budget CI**: 500-frame probe through the REAL frame loop on a
      packed floor-15 battle (turbo ×20, pets, wounds, fat relic bag) — fails at
      8ms/frame, ~3× a healthy run's cost (session 24)
- [x] **Asset preload polish**: boot strip on the title names the art pack still
      unpacking (per-pack tally in loadImg) and fades on the ✓; act 2/3 tint
      bakes now happen lazily on first appearance instead of all at boot;
      relic icons stay lazy and off the bar (session 25)
- [x] **Localization hooks**: `TR()` lookup keyed on the English strings themselves
      (named TR — T is the theme handle in draw scopes), en = pure pass-through so
      unwrapped strings stay English; 🌐 language chip in settings, choice
      persisted; NL proof pass covers 35+ high-visibility strings (title, hints,
      the tale, settings, banners, HUD) — grow coverage by wrapping more call
      sites (session 29)

## Tier 6 — content stretch

- [x] **Act 4: THE MINT** — floors 16-20 gilded (one MINT palette for the act,
      fkey re-keyed on theme), 13 new enemies with three mint-exclusive traits
      (magarmor +3 block/turn, coinclone dud slugs, jackthief meter siphon),
      THE AUDITOR seals the act (fines gold + holds the meter for review, 4th
      slot in the A-side rotation), ENDLESS decrees pushed to floor 21,
      codex MINT tab; v1.3.0 (session 35)
- [x] **More bosses per act**: the B-SIDE — Gilded Wyrm (mirror + SQUEEZE hand),
      Grave Banshee (glass cannon + WAIL weakness), The Aurifex (thief/armor +
      mints cursed slugs); even-numbered runs face them (bside on the run,
      persisted), tinted kins of the A-side sheets, both lair-holders in the
      codex (session 34)
- [x] **Hero skins**: DEEP CLEAR ledger (fell the floor-15 boss with a hero) earns
      that hero's alt palette — tint wash on sheeted heroes, aura on emoji ones,
      🎨 toggle on the card, both ledgers persisted; VERSION bumped to 1.2.0 with
      a real WHAT'S NEW entry (session 32)
- [x] **Machine themes**: CLASSIC / BONE (floor 5) / GILDED (floor 10) / NEON
      (floor 15) — cached tint washes over the machine art (no new assets),
      🎰 MACHINE rack on the title once floor 5 falls, pick persisted, all
      three cabinet layer caches re-key on the theme (session 31)
- [x] **Seasonal seeds**: seasonNow(date) windows — pumpkins on the title mound
      late October, snowfall + a snowman in December; clock-based, no network,
      date-injectable for tests (session 32)
- [x] **Prestige: NEW GAME+** — any deep clear hangs a purple NG+ door by the
      difficulty row; armed runs shift actIdx one deeper (roster, boss rotation,
      scale, icons all follow), daily stays plain; five NG+-only relics (Mint
      Vein, Crown Scale, Double Chime, Leaden Idol, Gilded Hourglass) join the
      pools only on prestige runs (session 33)
- [x] **Photo mode**: 📷 chip on the victory panel strips every overlay/HUD layer
      (banner, victory sheet, bag, heartbeat, ach toasts) for a clean pile shot;
      tap/ESC returns, screen changes auto-exit (session 30)
- [x] **Credits screen**: 🎬 from settings — painted art / LPC sprites via
      OpenGameArt (pointer to art/CREDITS.txt) / code & music / playtesting
      (session 30)

## Tier 7 — the second age (authored session 36, after playing the whole board)

The game is feature-complete on paper; this tier is about how it FEELS in the
hand, whether the new systems are TUNED, whether the mint has enough LIFE in
it, and whether a great run can leave the phone. Ordered by impact ÷ effort.

- [ ] **Trophies for the new age**: ~10 achievements covering everything tiers 4-6
      shipped — first NG+ clear, wear a skin, wear a theme, carve the board, a
      cloud backup, survive an AUDIT, fell each B-sider, master the mint's three
      tricks, a photo taken, play in Dutch
- [ ] **The aim ghost**: a faint falling-column marker under the finger while
      aiming (touch and keys) — the single biggest mobile-feel gap
- [ ] **Act 4 balance sweep**: headless win-rate probe with midline builds across
      floors 14-21; tune mint statlines / the Auditor / NG+ floor-1 sting from
      the numbers, not vibes (probe lands in the test suite as a report)
- [ ] **Seed sharing**: every run stamps its seed on the report card; a SEEDED RUN
      door on the title (name-pad entry) reproduces the dungeon — race a friend
- [ ] **Share-a-run card** [big]: victory/death → a rendered trophy-card PNG
      (hero, floor, kills, seed, painted frame) via canvas.toBlob — download +
      navigator.share where it exists
- [ ] **Mint strangers**: two act-4 events — THE ASSAYER (appraise: double one
      relic's effect this floor, or he keeps it a floor) and THE DEBT COLLECTOR
      (pay 30 gold or carry a -5 maxHP lien two floors)
- [ ] **B-side second winds**: each B-sider gets a below-half-HP phase — the Wyrm
      re-mirrors, the Banshee's wail also chills the pusher a step, the Aurifex
      mints two slugs — telegraphed with a banner
- [ ] **Five mint relics** (non-NG+): themed on slugs/audits/meters — e.g. Slug
      Smelter (slugs collected pay 1 gold), Auditor's Stamp (bosses drop +1 key)
- [ ] **Daily → board handshake**: a finished daily auto-offers posting to the
      DAILY board with a 📅 flag on the row
- [ ] **First-battle coach**: three one-time floating pointers (pick a coin, tap
      to drop, END TURN fires) — killed forever once each is done
- [ ] **Coin outlier pass**: blue + lucky are underpicked in victory spoils —
      probe pick rates headless, then buff the losers one notch
- [ ] **Relic outlier pass**: identify the 5 least-impactful relics by
      inspection + probe, give each a small second clause
- [ ] **NG+ ledger on the report card**: NG+ badge + act-shifted floor shown on
      death/victory report and the run history rows
- [ ] **Dungeon footsteps & door creaks**: two tiny SFX on the crawl (move tick,
      door thunk) behind the existing SFX volume
- [ ] **Mint floor quest**: one act-4-only job — BANK N SLUGS (the counterfeits
      become the currency) paying a golden key
- [ ] **Localization: settings + overlays complete in NL**: sweep the remaining
      high-traffic strings (board, cloud, themes, credits) into TR()

## Done (this loop)

- [x] Plan authored (session 1)
- [x] **THE PLAN IS COMPLETE** (session 35): all six tiers shipped across 35
      autonomous sessions — 1411 game tests + 38 API tests green, v1.3.0 live.
      Session 36 drafts Tier 7 (polish, balance, content, virality) and the
      loop rolls on.
