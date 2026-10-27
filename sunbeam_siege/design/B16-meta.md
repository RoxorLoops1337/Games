# B16: Meta Progression

File: `src/data/meta.js` (`SB.data.meta`). Self-checked with a stub window: 40 achievements, 30 coats, 20 collars, 10 omens, 12 dailies, 11 ranks, 30 levels, all ids unique, every level has an unlock, save/load/export round trip passes.

## Intent
Every run pays something. A first-time loser at Night 4 earns about 50 XP and sees a new collar within two runs. A win at Rank 0 earns about 210 XP. Level 30 costs 11,890 XP total (n to n+1 costs 60 + 25*(n-1)), so about 55 to 80 runs. Levels 1 to 10 take about 8 to 10 runs, fast enough to keep the first week lively.

## Single source of truth
Each unlockable (clan, champion, gated relic, Cradle Gift, coat, collar) carries its own `unlock` rule: `start`, `level`, `achievement`, or `rankWin`. `levels[]` is generated from them. Change a level number in one place and the tree follows.

## Unlock pacing
- Start: Alley and Hearth, one champion each, 2 Cradle Gifts, 5 coats, 2 collars.
- Level 3 Mischief, level 7 Moonwhiskers (each arrives with its first champion). Second champions at 5, 9, 12, 15.
- 12 gated relics (Tuna Tin at 3 up to Cardboard Crown at 30). Spare Whisker (the Last Life) is level 28 and leaves the pool at Rank 10. Any relic not listed is available from run one, so the relic agent can rename freely.
- Cradle Gifts: 10 total. Four are new: Gerald's Coupon, Stray Kitten, Old Brass Bell, Sunbeam Sliver.
- 25 coats and collars come from levels, 5 coats and 3 collars from achievements or Rank wins.

## Rulings that differ from A07 (RULES.md wins)
- Rank 4 is now start Warmth 35 (was 45 of 50). Boss bonuses stay +5, +5.
- Rank 10 no longer removes "Last Life" (it is not default). It removes the relic Spare Whisker and doubles every Omen.
- Gift `spare_life` is "+1 Life on every non-Champion starter cat" (champions already have 9).
- Quiet House now cancels the Witching Hour instead of a "Zoomies Turn".

## Night Omens (10)
A07's six plus Waxed Floors (Knock +1 floor), Midnight Snack (pests +1 Attack, kills drop Fish), Rowdy Hour (Night Visitors 50 percent, Zooms full damage), Cold Snap (Purr decays 2, Rested cap 3). Rowdy and Snap start in Act 2. Each effect stores `value` and `doubled`. Thunder is offset to rounds 2, 5, 8 so it never lands on a Witching Hour.

## Loops
A loop turn: 15 or more cards in a turn, 2 or more draw pile reshuffles, or one card played 5 or more times. The engine increments `loopTurns` (and `bossLoopTurns`). Six achievements are loop-themed plus six named loops from A01 (Eternal Nap, Shelf Cascade, Box Hotel, Lives Banking, Hairball Engine, Cat's Cradle).

## Seeds
8 char Crockford base32, streams per category, typed input forgiving (O to 0, I and L to 1, U to V). Typed or replayed seeds pay 50 percent XP once and 25 percent after that, so seed farming is pointless. Daily uses the UTC date, a 12-day shuffled modifier cycle, a weekday rank (Mon 2, Sat 6), and never unlocks ranks.

## Save
`sb_profile_v1` with `v`, `xp`, `level`, `unlocked`, `equipped`, `mischief`, `achievements`, `stats` (life sums, bests, per clan, champion, rank, omen), `daily`, `seedLog`, `recentRuns`, `tutorial`, `settings`. `load()` returns `{profile, status}` with status `new|ok|corrupt|unavailable|newer`; `save()` keeps a `_bak` copy. Corrupt: show "The cat knocked this one off the shelf" and offer the backup. Export/import is a `SB1:` base64 string.

## Engine hooks
1. At run end call `SB.data.meta.recordRun(profile, summary, Date.now())`; it returns xp, levels, new achievements, new unlocks, rank unlocked. Then `save(profile)`. Summary shape is in `runSummaryFields`.
2. Optional mid-run: `checkAchievements(profile, runSoFar)` after each battle.
3. Run setup reads `ranks`, `cumulativeMods(rank)`, `isRelicAvailable`, and `profile.unlocked.*`.
4. Pawprint applies `coat.genome` and `collar.genome` patches over the genome. Champions layer their crown over the collar.

## Unresolved
- Champion ids are placeholders (`champion_<clan>_<1|2>`). Reconcile or fill `championIdMap`.
- Relic ids are proposals; need `neutral_stray_kitten` card.
- Clan titles/levels from the A07 summary screen are not built (only per-clan XP is stored).
- Cosmetics are per Champion and a default; no per-card cosmetics.
