# No Room For Heroes — Studio Review Roadmap

*Produced by a six-role review (Game Director, Balance, UX, QA, Art/Audio, Product) that read the
actual code. Every item cites the mechanism it critiques; effort is S/M/L. QA criticals from this
review were fixed immediately (see "Patch 0"). Line numbers drift — grep the named functions.*

## Patch 0 — shipped with this review
- **Crash:** hero shopping in a room the King/champion just smashed dereferenced `null.stock` and
  killed the frame loop (game froze, run lost). Guarded in `doShopping`.
- **Exploit:** boss-select ⇄ loadout "Back" loop re-granted Relic Shrine relics forever
  (`G.relics` never reset in `chooseBoss`). Reset added.
- **Tutorial soft-locks (2):** scrapping the scripted card / equipping a sword during the merge
  beat stranded skip-less steps. Both actions now `tutNudge()` during the tutorial.
- **Endless:** a champion's guaranteed relic was clobbered by the every-10-kills recompute in
  `afterWave` (now OR-ed in, all three flags).
- **Leaderboard:** endless auto-submit sent the *all-time* PB, so daily/weekly boards were clones
  of all-time. Now submits this run's kills only.
- **Cosmetic:** escaped gold thief drew as a corpse at the throne; stale "🗡️ DISARMED" blinked
  over the build screen after a rogue wave.

## NOW — quick wins, highest leverage (all S unless noted)
1. **Unskippable tutorial → wire the skip.** `tutSkip()` exists, nothing calls it; a 0-kill
   profile is hijacked into all ~30 beats from both modes (`forceFirstTutorial`). Add a small
   "Skip ✕" to `tutModalPaint` from beat ~5 on. *Biggest first-session churn risk.* (UX#1)
2. **Draft cards show no numbers.** The draft (`gotoReward`) renders flavor only, and tap =
   irreversible pick — mobile players can never see dmg/rate/HP before committing. Inline the
   `describeCard` stat line + reaction tags on each choice. (UX#2)
3. **Roll the next wave BEFORE the draft.** Call `prepCampaignWave()` at the top of
   `campaignAdvance()` (the `waveLevel` guard makes later calls no-ops) and show an "Incoming:
   ⚔️⚔️✨ · 1 elite" strip on the Spoils screen → 50 blind picks become counter-picks. (Design#2)
4. **Synergy badge on cards.** When a draft/hand card would complete a pair with an existing room,
   say so ("⚡ Forms **Overcharge** with room 3") — one `synergyFromTypes` call. The deepest build
   system is currently archaeology. (Design#9)
5. **Balance one-liner package (take together):** armor floor `max(raw-armor, raw*0.35)` in
   `heroDmg` (flat armor deletes most traps past L25 — lvl5 spike does min-1 chip);
   prorate vet bite by trap rate (fast commons currently invert the rarity ladder);
   gate Devour's execute off champions/King (42 mana currently skips the finale's last ~7k HP).
   (Balance#1/#3/#4)
6. **Runestone stacking is a no-op.** `lvl++` on an amp trap changes nothing — refuse the stack
   like a maxed trap, or scale amp `0.25+0.05/lvl`. (Balance#2)
7. **Relic icon mismap.** `rBanner→'horn'` starves `eHorn` while `icons/relic_banner.png` sits
   unused — 1-line remap. 10 of 34 relics (3 legendaries + the mythic) still render as emoji —
   generate via the ComfyUI pipeline (owner's machine). (Art#3)
8. **Wave-clear stinger + synergy-formed fanfare.** `waveWinBanner` is mute; completing a synergy
   pair is silent. Both have existing hooks (`banner()`, `SFX` recipes — pure `tone()` work).
   Also: one `sfx('relic')` jingle currently scores ~12 different events. (Art#1/#2/#6)
9. **Auto cloud backup.** If a cloud code exists, silently re-POST after every `awardRunes`;
   Safari's 7-day storage eviction otherwise wipes lapsed players' profiles. (Product#3)
10. **Next-goal teaser on death/close screens.** Show the single nearest-to-complete unlock feat
    ("3 more frozen kills unlocks Frost") — pure UI reuse of the Unlocks progress data. (Product#5)
11. **Waiting-hero hit-test mismatch.** `entityAt` uses a different position formula than
    `drawWaitingHeroes` (despite a comment claiming they match) — tapping staged heroes often
    returns nothing. Compute positions once, share. Add a one-line wave summary. (UX#6)
12. **Edicts screen: skip while irrelevant.** It fronts 100% of runs, including the very first
    (before the player knows what runes are). Skip while `RUNES.points===0 && !asc`. (UX#9)
13. **Skip-draft pays scrap gold (~15g)** so a full-hand skip isn't a pure penalty screen. (Design#10)

## NEXT — medium rocks
- **Mid-run save & resume** (Product#1, M, main-session: save-system escalation zone). Serialize at
  the build-phase boundary to `bm_run_<slot>`; "Resume Level 23 siege" on the menu. Converts the
  #1 churn event (iPad tab eviction eating an hour + its runes) into the #1 return hook.
- **Daily Bounty** (Product#2, S/M): date-keyed modifier + first-run-of-day rune bonus, feeding the
  daily board that already exists server-side. The game currently has zero date-based hooks.
- **Ability targeting** (Design#1, S/M, main-session): extend Smite's tap-to-aim to the ability bar
  (or per-ability smart targeting: Devour→lowest HP%, Curse→highest ATK). Casting is the only
  in-wave interaction and it's currently "press whatever's lit."
- **Wave archetypes** (Design#3, M): L25-49 is the same 5-body wave with bigger numbers
  (`levelComp` pins at 5; class mix fixed). ~8 named compositions ("Shield Wall", "The Heist",
  "The Choir") with banner announcements.
- **Behavioral elite traits** (Design#7, M): all 6 traits are stat multipliers; add Trap-sense /
  Phalanx / Relic-bearer / Martyr so elites change *what you do*, not just fight duration.
- **Champion roster + looks** (Design#4 + Art#7, M): 4 champions for ~19 campaign encounters, all
  sharing one sprite body. Add dungeon-aware gimmicks (Sapper, Warlock anti-reactions,
  Beastmaster) + per-type tint/aura.
- **Mobile touch targets** (UX#3, M): panel buttons ≈23px, gear cells ≈21px, scrap ✕ ≈13px physical
  on phones — and scrap has no confirm. `pointer:coarse` size tier + move scrap into the card's
  inspect bubble.
- **Gear equip discoverability** (UX#5, M): drag-only, from a popup that closes mid-drag, never
  taught. Add tap-select→tap-room equip + an Equip button in the gear bubble + one tutorial line.
- **Town Forge** (Design#8, S/M): buy one copy of a card you already own (gold, rarity-priced,
  1/visit) — the only targeted card sink; converts pooled late gold into build agency.
- **Floater coalescing** (UX#8 + Art#5, M): per-hero damage accumulator (~0.4s window), cap
  concurrent floats, reserve big style for named events — the King's 50-knight finale is
  currently unreadable confetti.
- **Economy retunes** (Balance#8/#9, S each): black-market prices scale with difficulty (200g flat
  is trivial by L30); rune income — apply edict/library multipliers to drops only (a multiplied
  win currently pays the entire 242-pt tree in one run vs ~19/loss).
- **Monster tier fixes** (Balance#6/#7, S/M): let same-type monster cards stack `lvl++` (the
  scalers exist but are dead code — guards are always lvl 1); ogre 58/19→92/26; drakeling burn
  3→2; den cap 20→12.
- **Corrupted (minion) sprite + orc attack anim + 2 card icons** (Art#4, M, owner's art pipeline).

## LATER — big rocks
- **Endless as a mutation ladder** (Design#5, M-L): player-picked hero-side mutators every 25
  kills raising a visible score multiplier; restore the slot cap (+1/25 kills). Endless currently
  differs from campaign only in bookkeeping.
- **Structural growth beats** (Design#6): +1 slot-cap milestones at L20/L40; visual escalation for
  veteran/fed rooms (banners, tint, size) — the dungeon stops *visibly* growing mid-run.
- **Set-piece milestones at L20/L35** (Design#10): rehearse the King's drama (named banners,
  unique escorts, one twist each).
- **Shareable death card** (Product#4, S): emoji-grid + play URL via `navigator.share` from the
  postmortem (the copy already exists). Only viral loop available.
- **Burn cap scaling** (Balance#10): `BURN_CAP 22 → 22+floor(level*0.6)` so the mid-game workhorse
  doesn't cliff exactly where the difficulty ramp steepens.
- **Streak bonus, board surfacing, Ko-fi support link, post-tutorial fast path** (Product#6/7/8/9).
- **Music crossfade** (Art note): `mtStart` hard-cuts moods; a ~300ms gain ramp would smooth it.

## QA backlog (real but lower severity)
- Endless: a champion can spawn *inside* a group wave (queue look-ahead only checks index 0) —
  violates "champions arrive alone."
- Champion relic + milestone relic collapse into one screen (`relicDue` is boolean; make it a counter).
- King smashing a den that wave wipes its banked veteran goblins (`endWaveGoblins` null-room skip).
- Reaction damage bypasses `_roomDmgCtx`, so battle reports undercount reaction-heavy rooms.
- `faceTheKing` enters build without `gotoBuild` (stale brokenCells/sel state into the finale).
- Stale comment: `buildCells` still says "synergies removed" above the live synergy wiring.
