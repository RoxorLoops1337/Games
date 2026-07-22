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

- [x] **Trophies for the new age**: ten trophies (30 total) — TWICE AROUND (NG+
      clear), TAILORED, HOUSE STYLE, SET IN STONE, SKY VAULT, CLEAN BOOKS,
      B-SIDE COLLECTOR, COUNTING HOUSE, SHUTTERBUG, TWEETALIG — profile watches
      in achPoll + event hooks in winBattle/postScore/cloudBackup/photo; the
      trophy hall now pages (session 36)
- [x] **The aim ghost**: pulsing dashed landing ring + falling chevron on the
      platform, sized to a real coin at that depth; hidden for the claw and the
      poltergeist (session 37)
- [x] **Act 4 balance sweep**: analytic threat probe over the REAL scaling code
      (floors 13-21 + NG+ + bosses) now lives in the suite with rails. It caught
      three real faults: the mint hand-off SOFTENED (×0.88 → statlines +10% hp,
      +1 atk → ×1.11 sting), floor 21 dipped (beyond-term 0.7 → 0.9), and NG+
      floor 1 ran ×1.58 hot (new PRESTIGE KIT: +3 gold coins, +1 potion,
      +20 gold). The Auditor measured ×1.95 over the Pit Boss — kept (session 38)
- [x] **Seed sharing**: every run carries a base36 seed; floor layouts re-seed
      from (seed, floor) so shared seeds walk identical dungeons whatever the
      battles burned; 🌱 chip by the difficulty row plants one via the name pad,
      the report card prints it (session 39)
- [x] **Share-a-run card** [big]: 📤 on the fallen-run screen builds a framed
      trophy card @2x (hero sprite in their worn skin, REACHED FLOOR huge,
      stat rows, coin mound, the seed as a challenge, the play link) — preview
      overlay with SAVE PNG (toBlob download) or the native share sheet where
      navigator.canShare allows files (session 41)
- [x] **Mint strangers**: THE ASSAYER (appraise the collection: +3 gold/relic
      for a 10-gold fee, or sell him a random relic for 60) and THE DEBT
      COLLECTOR (settle 30 gold for a key receipt, or dispute: 50/50 damages
      +25 gold vs a −5 maxHP lien) — both gated to act-4 halls via the event
      pool filter (session 40)
- [x] **B-side second winds**: below half HP, once, banner-telegraphed — the
      Wyrm coils tighter (squeeze every 2nd round), the Banshee shrieks
      (+2 atk, wail every 2nd round), the Aurifex re-gilds (+12 HP, three
      slugs a minting) (session 42)
- [x] **Five mint relics** (open shelf): Slug Smelter (slugs pay 1 gold),
      Coin Press (every 25 fired mints +5), Meter Spring (jackpot wakes at 5),
      Auditor's Stamp (bosses drop +1 key), Brass Heart (the battle's first
      blow fully absorbed) — all wired to real hooks (session 42)
- [x] **Daily → board handshake**: a finished daily offers itself to the board
      via the confirm sheet (name pad first if unnamed), the post carries
      daily:1, entries store d:1 and board rows wear 📅 (session 43)
- [x] **First-battle coach**: three sequential pointers (choose a coin / tap to
      drop / END TURN fires), each killed forever by the deed it teaches at the
      sim hooks; persisted, and veterans who predate it are grandfathered
      (session 43)
- [x] **Coin outlier pass**: LUCKY 3→4 dmg (the rarest coin now out-hits
      relic-stacked gold); FROST pierces block (dmgFoe pierce now skips the
      soak too, so dead-eye luckies thread it as advertised) — both railed
      in the suite (session 44)
- [x] **Relic outlier pass**: five weakest commons got honest second clauses —
      Piggy Bank +2/act, Horseshoe tilts the lucky roll ×1.25, Blessing leaves
      a 1 HP mend behind the bite, Dead Eye hits +1, Scavenger shakes a key
      out of every bag — each measured (session 44)
- [x] **NG+ ledger on the report card**: ♟ NG+ on the hero row of the card and
      on the run-history rows; over/hist carry ng + seed (session 39)
- [x] **Dungeon footsteps & door creaks**: soft noise footfalls pace the crawl
      (0.26s stride, behind SFX volume); the door thunk already lived on the
      hinge — verified and pinned (session 37)
- [x] **Mint floor quest**: COLLECT 3 COUNTERFEIT SLUGS — only posted in the
      mint, counted as slugs clatter into the tray, always pays a GOLDEN key
      (session 40)
- [x] **Localization: settings + overlays complete in NL**: second sweep — the
      board, cloud, theme rack, credits, trophy hall, name pads, share card
      button, and the death knell all wrapped in TR(); NL table at 60+ strings
      (session 45)

## Tier 8 — come back tomorrow, bring a friend (authored session 46)

The game is deep and polished; this tier is about the PULL — reasons to open
it every day, and moments worth showing someone. Ordered by impact ÷ effort.

- [x] **Daily streaks**: streakTouch stamps every finished run's day; one missed
      day forgiven, two kills the flame; 🔥N beside the DAILY chip; +10% cogs
      per day beyond the first (cap +50%) so old cog math holds day one
      (session 46)
- [x] **Seed of the day**: 🌱 TODAY'S MAZE chip plants dailySeed(today) as a
      free practice run — no attempt burned, no twists, same corridors for
      everyone (session 46)
- [x] **Jackpot spectacle**: golden radial flood (lighter composite, 1.5s),
      four confetti fountains over the pusher + one at the tray, shake 8→12
      (session 47)
- [x] **Kill feel**: 90ms hitstop (140ms for bosses) bending frame time ×0.12,
      a shatter ring + burst at the foe panel, golden for bosses; reduced-motion
      players skip the freeze (session 47)
- [x] **Floor transition**: the descent opens from black over ~1s with the
      FLOOR N nameplate, plus the act name on act boundaries (session 47)
- [x] **Endless milestones**: floors 22/25/28… (off-beat between decree floors)
      pay a MILESTONE CHEST — cogs (15+floor) / golden key / rare-relic pick;
      S.life.chests ledger; DEEP POCKETS + floor-25/30 trophies (33 on the
      wall) (session 48)
- [x] **Endless-only decrees**: GILDED AGE (elite odds 0.24→0.6, floor 36),
      THIN VEINS (shop mult ×1.25, floor 39), THE LONG DARK (darkFloor always,
      floor 42) — the stack runs 8 deep, all measured (session 48)
- [x] **Three new daily twists**: GLASS CANNON (double damage both ways),
      COIN DROUGHT (hand -2, kills pay double gold), PACIFIST FLOORS (every
      3rd floor's monsters are optional but pay nothing) (session 49)
- [x] **Board rows tell more**: diff dot + ♟ NG+ pawn on THE DEEP BOARD rows;
      below-50 players see "the board's floor to beat is N" (session 49)
- [x] **Yesterday's deepest**: a light one-shot board fetch stamps the title
      with "yesterday's deepest: FLOOR N by NAME" (cached, silent offline;
      `?board=yesterday` whitelisted server-side) (session 50)
- [x] **Trophies for the pull**: KINDLED (streak 3), WEEK OF FIRE (streak 7),
      GREEN THUMB (seed-of-the-day grown) — 36 on the wall; floor-25 +
      milestone-chest trophies already existed (s48); the weekly-decree
      trophy ships WITH the Weekly decree item (session 50)
- [x] **[big] THE ALCHEMIST — an eighth hero**: no potions — she BREWS: every
      12 coins collected distills one random draught (blast/freeze/mend/gild,
      via scoreCoin → brewDraught); gems are reagents (+2 draught power each,
      spent on the next brew); granted flasks feed the still 3 brew apiece
      (gainPotions); unseals at 5 total deep clears (deep15 keys); still
      gauge replaces the DRINK button; v1.4.0 in the changelog (session 53)
- [x] **Weekly decree**: five week-seeded laws (GOLD FEVER / IRON WEEK /
      IRONHIDE PARADE / BRITTLE BLADES / MARKET WEEK), ⚖️ opt-in door on the
      title, expires Sunday (weekOf → Monday key), clear floor 15 under it →
      S.life.weeklies + records line + ABOVE THE LAW trophy (37 on the wall);
      also fixed load() dropping S.life.chests (session 51)
- [x] **Descend sting + jackpot fanfare v2**: SND.descend — two falling notes
      rooted deeper per act, fired in nextFloor; jackpot run-up now lands on a
      held C-major resolve over a low root (session 51)
- [x] **Wheel near-miss wobble**: fully eased, the wheel coasts most of a
      tooth past the prize and rocks back (damped sin·exp), ratchet clicking
      tooth-by-tooth on the way; reduced-motion skips it (session 52)
- [x] **Records: the endless page**: RECORDS grew tabs — THE BOOK + 🌌 THE
      ENDLESS: deepest descent, lifetime decree stack (S.life.mutMax),
      milestone chests, weeklies, floors past the ledger, and a DECREE WALL
      that unveils each law only once endured (session 52)

## Tier 9 — rivals & the second month (authored session 54)

Tier 8 built the daily pull. This tier is about PEOPLE — a name to chase,
a link to send, a reason the game still surprises in week five. Everything
stays in the one-file architecture; server touches are marked. Ordered by
impact ÷ effort.

- [x] **Mark your rival**: tap any DEEP BOARD row → ⚔ MARK RIVAL. The title
      then carries "rival: NAME — floor N (you: M)" and the run-over report
      card scores every run against them (gap / matched / RIVAL TOPPLED);
      S.rival persisted, refreshed from the all-time board on open; topple
      pays the RIVAL TOPPLED trophy (38 on the wall) (session 54)
- [x] **Percentile on the carve**: boardPct(top, floor, kills) → postScore
      toasts "deeper than N% of the board" (≥50) or "the board's midpoint
      is floor N — climb" (below); pure client math (session 54)
- [x] **Duel links**: ⚔️ DUEL button on the run-over screen shares/copies
      ?duel=<seed36>.<floor>.<name>; boot parses it (scrubbed name, clamped
      floor, URL cleaned via replaceState), plants the seed, and the report
      card declares OUTDUG / tied / holds-at-floor; duel state rides the run
      save (session 55)
- [x] **Welcome-back crate**: away 7+ days (streak.last) → a once-per-visit
      confirm on the title: cogs = 8×days (cap 120) + a RARE relic pick armed
      for the next run's door (outranks the Heirloom); claiming touches the
      streak so it can't be farmed (session 55)
- [x] **Title marquee**: marqueeLine(date) — a priority-ordered reason engine
      on the title: streak at stake (incl. the grace-day plea) → standing
      rival → unspent daily → thinnest codex shelf → yesterday's crown →
      evergreen seed line (session 56)
- [x] **Ghost pace**: every door stamps S.run.pace[floor] (cumulative run
      seconds); a new best descent copies its splits to S.best.pace; the
      descent curtain whispers "👻 Ns ahead/behind your best", silent past
      the ghost's grave; both paces ride the save (session 57)
- [x] **Codex completion meters**: codexTabStat/codexFull — finished shelves
      wear a gold ✦ tab, the header shows the whole ledger's N/M, 100% of
      everything hangs THE FULL LEDGER (39 on the wall) and turns the title's
      codex button gold (session 56)
- [x] **Hero mastery stars**: deep15 counts clears now (old flag saves read
      as 1; one ink per run via S.run.deepInked); masteryStars → ★/★★/★★★
      at 1/3/5 on the hero card, mastery toasts at 3 and 5, and a ★ MASTER'S
      MARK on your own board rows once any hero hits three stars (session 57)
- [x] **The innkeeper's tales**: 64 act-aware lines (24 evergreen + 10/act),
      ~1 in 3 descents via rollTale() (unheard-first, rolled before genFloor
      so seeds stay reproducible), quoted on the curtain with the innkeeper's
      credit; heard tales collect in a CODEX: TALES tab (8th, display-only —
      never gates THE FULL LEDGER) (session 59)
- [x] **Ledger of habits**: RECORDS grew a third 🎲 HABITS tab — favorite
      coin (codex fire counts), most-slain foe (boss lookup incl. B-sides),
      favorite draught (new S.life.draughts tally), deadliest floor (new
      S.life.deaths stamped every endRun) + WHERE THE RUNS END death bars
      (session 59)
- [x] **Trophy-wall share card**: buildTrophyCard — the full 40-tile wall,
      earned tiles lit gold, "N / 40" banner + owner's name; 📤 CARD on the
      TROPHIES sheet; shareSave learned per-card filenames/text (session 60)
- [x] **Named champions**: GRUK THE UNPAID / VELVETFANG / OLD NINECOINS /
      THE LEDGER LORD — one per act (endless keeps the Lord), hiding in the
      elite pool from floor 4 (1-in-4 of elites), each with an extra trick,
      double bounty + a guaranteed key; codex act tabs count them (FULL
      LEDGER now includes them); 4 inked → CHAMPION SLAYER (40 on the wall)
      (session 60)
- [ ] **[server] Monthly board + the champion's plaque**: dungeon_board.js
      adds 'dp:month:<YYYY-MM>' (one POST feeds all boards, 60-day TTL);
      BOARD gains a THIS MONTH tab; on month-end the previous winner is
      fetched once (?board=lastmonth) and the title wears "JULY'S DEEPEST:
      NAME, floor N" for the whole next month
- [ ] **[big] THE LEGEND DOOR (NG++)**: an NG+ deep clear unseals a second
      prestige: actIdx +2, both prestige kits, decrees start at floor 11,
      LEGEND ♛ on board rows (ng:2 in the post), one legend-only relic; the
      balance probe MUST measure the floor-1 wall before shipping
- [ ] **[big] THE GAUNTLET**: a seeded 5-floor sprint (weekOf seed, all
      decrees on from floor 1, no shops) raced against the CLOCK; best time
      in records + a GAUNTLET line on the share card; the door only opens
      Fri-Sun to make it an event
- [ ] **Anniversary gift**: the profile's first-run date (stamp it now for
      everyone) pays a yearly birthday crate + a candle on the title that
      day — the longest-loop hook in the game
- [x] **[owner request] Late-game coin sink + scaling tricks** (session 58):
      floor-18 purses were "ridiculous" — (1) stairToll() now climbs +1 per
      act (2→8 cap); (2) THE TOLLKEEPER'S SKIM: purseCap() = 20+4·act (cap
      44) — every descent confiscates the overflow at 2 gold a coin,
      plainest pockets first, so hands stay tense and bloat converts to
      gold; (3) the mint's tricks sharpen with the acts: magnetic armor
      +3+act, jackpot siphon 3+act, mirror bounce cap 8+2·act, the endless
      counterfeiter runs two presses. If purses still bloat, the next dial
      is making victory coin-offers sometimes UPGRADE a coin instead of
      adding one past act 2

## Done (this loop)

- [x] Plan authored (session 1)
- [x] **TIER 8 IS COMPLETE** (session 53): sixteen items across eight sessions —
      streaks and the seed of the day, jackpot/kill/floor juice, endless
      milestones and dark decrees, three new daily twists, a talkative board,
      yesterday's deepest, pull trophies, the weekly decree, stings and the
      wheel's near miss, the endless records page, and THE ALCHEMIST (v1.4.0,
      eight heroes, 37 trophies, 1701 game tests). Session 54 drafts Tier 9.
- [x] **TIER 7 IS COMPLETE** (session 45): sixteen items across ten sessions —
      trophies, the aim ghost, a measured balance sweep, seed racing, share
      cards, mint strangers and relics, second winds, the coach, the daily
      handshake, outlier tuning, and a bilingual UI. Session 46 drafts Tier 8.
- [x] **THE PLAN IS COMPLETE** (session 35): all six tiers shipped across 35
      autonomous sessions — 1411 game tests + 38 API tests green, v1.3.0 live.
      Session 36 drafts Tier 7 (polish, balance, content, virality) and the
      loop rolls on.
