# No Room For Heroes — Studio Review Roadmap

*Produced by a six-role review (Game Director, Balance, UX, QA, Art/Audio, Product) that read the
actual code. Every item cites the mechanism it critiques; effort is S/M/L. QA criticals from this
review were fixed immediately (see "Patch 0"). Line numbers drift — grep the named functions.*

*Status: the review has been worked off in six batches (A–F, PRs #677–#682 + Batch F). Everything
below is marked ✅ shipped or listed under **Remaining**.*

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

## Shipped — Batch A (#677, UX/design quick wins)
- ✅ Tutorial skip wired ("Skip tutorial ✕" from beat 5, `tutSkip`). (UX#1)
- ✅ Draft cards show real stats + status tags (`draftStats`). (UX#2)
- ✅ Next wave rolled BEFORE the draft + "Incoming next" strip → counter-picks. (Design#2)
- ✅ Synergy badges on draft/hand cards (`synergyHint`). (Design#9)
- ✅ Staged-hero hit-test shares the draw formula (`stagedHeroX`) + wave summary. (UX#6)
- ✅ Edicts screen skipped while irrelevant. (UX#9)
- ✅ Skip-draft pays +15g (`SKIP_DRAFT_GOLD`). (Design#10)

## Shipped — Batch B (#678, balance package + economy + QA backlog)
- ✅ Armor floor in `heroDmg` (mitigation caps 65%); vet bite prorated by trap rate;
  Devour gated off champions/King. (Balance#1/#3/#4)
- ✅ Runestone refuses stacking (was a no-op `lvl++`). (Balance#2)
- ✅ Ogre 92/26, drakeling burn 2, den cap 12; same-type monster stacking trains guard level.
  (Balance#6/#7)
- ✅ Black-market prices scale with difficulty; rune multipliers apply to drops only.
  (Balance#8/#9)
- ✅ Burn cap scales with siege depth (`burnCap()`). (Balance#10)
- ✅ QA backlog: relicDue counter, endless champions arrive alone, King-smashed dens keep
  survivors, `faceTheKing` routes through `gotoBuild`, reaction damage credited (`reactHit`),
  stale comment fixed.

## Shipped — Batch C (#679, audio/visual juice)
- ✅ Wave-clear stinger; synergy-formed fanfare + banner; distinct merge/champion-slain/unlock
  SFX (the lone 'relic' jingle retired from ~12 events). (Art#1/#2/#6)
- ✅ Damage floaters coalesce per hero; kill payouts merge — the King's finale is readable.
  (UX#8 + Art#5)
- ✅ Relic icon remap (rBanner→banner, eHorn→horn). (Art#3, code half)
- ✅ Music moods crossfade (150ms bus ramp; sequencer untouched). (Art note)

## Shipped — Batch D (#680, retention & product)
- ✅ Auto cloud backup after `awardRunes` (60s throttle). (Product#3)
- ✅ Next-goal teaser with progress bar on death/close screens. (Product#5)
- ✅ 📅 Daily Bounty: date-keyed modifier + first-run-of-day rune bonus (`bm_daily_<slot>`).
  (Product#2)
- ✅ 📋 Shareable death card (`shareRun`, navigator.share/clipboard). (Product#4)
- ✅ Streak bonus (`bm_streak_<slot>`), leaderboard on the main menu, support-link scaffold
  (`SUPPORT_URL`, renders when non-empty), post-tutorial fast path. (Product#6/7/8/9)

## Shipped — Batch E (#682, gameplay depth)
- ✅ Smart ability targeting (Devour→lowest HP%, Curse→hardest hitter, …) + tap-aim priming.
  (Design#1)
- ✅ Wave archetypes: 5 named compositions from L8, ~35% of regular waves, preview==spawn.
  (Design#3)
- ✅ Behavioral elite traits: Trap-sense, Phalanx, Martyr. (Design#7 — Relic-bearer skipped,
  see Remaining)
- ✅ Gear tap-equip + hints (drag still works). (UX#5)
- ✅ Town Forge: duplicate a hand card for gold, 1/visit (`forgeUsed`). (Design#8)
- ✅ Touch targets via `pointer:coarse` tier + scrap arm-then-confirm. (UX#3)

## Shipped — Batch F (this batch: retention capstone + endgame shape)
- ✅ **Mid-run save & resume** (Product#1): snapshot at every build-phase boundary
  (`saveRun` in `gotoBuild`) to the NEW key `bm_run_<slot>` ({v:1,…}); "▶ Resume siege —
  Level N (Boss)" + 🗑 discard on the profile menu (`runResumeLine`/`resumeRun`); cleared on
  bossDies/closeDungeon/trueVictory and when a fresh run starts; tutorial never saves;
  corrupt/old data silently discarded (shape checks, try/catch everywhere).
- ✅ **Structural growth beats** (Design#6a): clearing L20/L40 grants +1 room-slot cap
  (`G.slotBonus` in `slotCap`), bannered "THE MOUNTAIN YIELDS ANOTHER HALL".
- ✅ **Set-piece milestones** (Design#10b): L20 "⚔️ THE IRON COMPANY" (champion + 4 armored
  honor guards), L35 "🐏 THE BATTERING RAM" (champion, +50% HP, demolishes the first room he
  enters — `spec.ram` consumed in `onEnterCell`). Titles banner at spawn.
- ✅ **Endless mutation ladder** (Design#5, compact): every 25 kills, pick 1 of 3 hero-side
  mutators (`ENDLESS_MUTS`: Thick Blood, Forced March, Iron Ward, Fervent Choir, Veteran
  Levies, Hexproof Banners); each pick +0.15 on a visible score multiplier (`G.scoreMul`,
  shown in the endless topbar + death screen); `lbAutoSubmit` submits
  `round(totalSlain × scoreMul)`.

## Remaining
**Owner-blocked art (needs the local ComfyUI pipeline on the owner's machine):**
- Corrupted (minion) sprite + orc attack anim + 2 card icons. (Art#4)
- 10 of 34 relics (3 legendaries + the mythic) still render as emoji — generate relic PNGs.
  (Art#3, art half)
- Champion looks: per-type sprite variants / tint / aura (all champions share one body).
  (Art#7)

**Not implemented (code):**
- Champion roster gimmicks (Design#4): dungeon-aware champion behaviors — Sapper (smashes a
  chosen room type), Warlock (anti-reaction ward), Beastmaster (brings a pet wave). The L35
  Battering Ram is the first of this species; the other three still need designing.
- Relic-bearer elite trait (Design#7, 1 of 4): a regular elite that drops a bonus relic —
  needs a relic-drop hook on non-champion kills.
- Veteran/fed room visual escalation (Design#6b): banners/tint/size as rooms rack up kills —
  the dungeon's growth is mechanical but not yet visible on the rooms themselves.
- Endless slot-cap ladder (Design#5, second half): endless is currently uncapped (`slotCap`
  returns 99); the review suggested restoring a cap that grows +1 per 25 kills so width is
  earned there too. Decide whether the uncapped sandbox is the better game before building it.
