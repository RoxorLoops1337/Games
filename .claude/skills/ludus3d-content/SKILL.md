---
name: ludus3d-content
description: Ludus Maximus 3D only. Content and depth systems added on top of the ported sim: the fallen (mortality, Hardcore permadeath, memorial wall, grief, heirs), rival ludi with personalities, the season calendar, barracks (mentors, feasts), the World screen, and the 2D versus 3D depth audit. Sim API in core/ext.js, UI in js/screens/world.js, flow wiring, tests and pitfalls.
---

# Ludus3D content: the fallen, rival ludi, calendar, barracks

Files: `core/ext.js` (pure sim, loaded after `core/sim.js` in index.html, hooked by one line in `LM.weekFinish`: `if (LM.extWeek) LM.extWeek(S, rep)`), `js/screens/world.js` (screen id `world`, tabs calendar / rivals / barracks / memorial, opened with `ctx.open('world', {tab})`), `js/flow.js` (`mortalCheck`, `fallenFlow`, `heirOffer`), `js/screens/modes.js` (risk modes), `js/ceremonies.js` (`eulogy` kind `fallen`). Tests: rounds 40 to 42 in `tests/ludus_maximus_3d.test.mjs` (the test requires ext.js after sim.js) and block 10 at the end of `tests/ludus_maximus_3d_structure.test.mjs`. The 2D game in `ludus_maximus/` is untouched and has none of this. No em dashes, no new localStorage keys (all state lives on the save object S, key `ludus_maximus_3d_v1`).

## Philosophy
No counter mechanics. Nothing here punishes a fighting style. Risk is explicit (a "Death risk N%" pill before you commit), buildings soften it (Infirmary -10% per level, Shrine -8% per level, laurel Luck perk), and every loss has a payoff (fame, an heir, a memorial). Hardcore is opt-in.

## 1. The fallen
- `LM.mortality(S, g, {kind, depth, boss})` is the chance (0..0.6) that a fighter who LOST dies. Base per kind: pit .07 (+.035 per floor beyond 1), horde .06 (+.025 per wave), champ .08, bounty .10, event .04 (events are 0 unless `S.opts.hardcore`). Boss +.08. Hardcore x1.35. Lucky trait x.75. Level 1 and 2 fighters on pit floors 1 and 2 are spared outside Hardcore. `LM.deathRoll` rolls with the sim RNG and returns `{dies, chance}`.
- `LM.fall(S, g, {kind, depth, by})` does everything: memorial entry in `S.fallen` (cap 60), gear back to the armory (via `LM.release`, which also withdraws entries), mentor pairs ended, grief (`mo -= 6 + bond*0.2`, `g.grief` 3 weeks for bond >= 50, 1 for >= 25; the weekly hook costs 3 morale per grief week), the closest friend (bond >= 30) inherits `+ceil(lvl/4)` of the fallen's best stat and a `vow`, fame `8 + 2*lvl + wins/2`, `S.heirPending` for level 3+. Returns `{entry, grief[], inherited, heir, fame}`.
- Heirs: `LM.takeHeir(S)` adds a free level `floor(lvl/3)` pupil of the same style with 3 talent pips in the fallen's best stat and the title "Heir of X" (needs barracks room, else 'Barracks full'); `LM.monument(S)` gives `15 + 4*lvl` fame instead. Legacy: `LM.legacyFame(S)` = min(10, 2 per fallen of level 5+, +1 per level 10+) fame each week, reported in the week summary. The memorial survives `LM.ascend`.
- UI: modes.js rolls after a Pit or Horde defeat (the fighter is removed BEFORE the report so no xp or injury is applied), `flow.mortalCheck(ctx, gl, res, {kind})` does it for champion duels, bounties and, in `runEvent` / `runTourney`, ordinary events (zero risk unless Hardcore; only fighters whose unit went `down`). `fallenFlow` shows the eulogy ceremony (light text: the scrim is dark) then `heirOffer`. More > Settings > Play has "Hardcore (permadeath)" (default off). Arena cards show a death-risk pill in the fighter picker for Pit, Horde, champion and bounty.
- Pitfall: results/report code reads `ctx.gOf(id)` for every fighter; never delete a fighter before `results()` has run. The fall happens after the report dialog.

## 2. Rival ludi (`S.ludi`, created lazily and deterministically from `S.seed` by `LM.ludiInit`)
Four schools, one of each personality (`LM.PERS`): brutal (gifts barely move him, sparring in his yard does; hostile ones ambush a fighter), cunning (flattery works, rumors get traced; hostile ones steal gold), honorable (joint training best; never raids; remembers insults), greedy (gifts work wonders; spurned ones poach your best recruit). Regard `rel` is -100..100 and drifts to 0. Actions: `LM.ludiAct(S, id, 'gift' | 'spar' | 'rumor' | 'ally' | 'break', g)` returns `{msg, rel}` or an error string; `LM.ludiWhy(S, id, kind, g)` explains why not ('' means allowed). One action per kind per ludus per week. Alliance needs regard 60 and gold, one at a time, pays a weekly gift (brutal fame, cunning scouting +1, honorable morale and energy, greedy gold) and ends below regard 40. Standings: `LM.ludiTable(S)` (rivals gain points weekly, you score 3 per win and 6 per title); at season end the champion is recorded in `S.ludi.hist` (+fame if you win) and scores reset.

## 3. Calendar
`LM.calendar(S)` is pure and cheap (no opponent generation): 12 weeks of the current season with festival, big event (`tourney` every 4th week, `grand` every 12th), team clash (week % 4 == 2), your entries (from `S.entries` keys) and a weather forecast. The World screen tile grid opens a detail card and the Arena at the right week offset (`ctx.open('arena', {tab:'sched', wk})`).

## 4. Barracks
Mentors: `LM.mentorStart(S, mentorId, pupilId)` needs the mentor 3 levels above; slots `1 + Sparring Ring + Barracks level 3`; weekly `8 + mentor level` XP to the pupil, bond +5, both +2 morale; graduates when the pupil reaches mentor level - 1 (+10 fame). Feasts: `LM.feast(S, 'simple' | 'banquet')` once a week (+6 / +12 morale, banquet +8 energy, bonds, eases grief).

## Depth audit: 2D versus 3D (what was missing)
The 3D sim is a copy of the 2D sim, so every system exists; the gaps were presentation and loops. Implemented: the fallen with Hardcore (neither game could kill), rival ludi (the 2D game only had one rival owner), season calendar, mentors and feasts. Still weak or missing: a bestiary or beast-hunt arena mode (needs non-human rigs), injuries are a single counter (no scars or permanent effects), sponsor contracts are fill-in-the-blank (no negotiation), the rival owner champion is a one-off, no in-fight camera for kill replays beyond the director cue, weekly events are text-only (no art).

## Verify
- `node tests/ludus_maximus_3d.test.mjs` (rounds 40 to 42) and `node tests/ludus_maximus_3d_structure.test.mjs` (block 10).
- World screen screenshots: `node tools/ludus3d_shot.mjs "http://localhost:8211/ludus_maximus_3d/index.html?new=1&rich=1&empty=1&tier=low&manual=1&notut=1" /tmp/x --w 900 --h 1000 --at 1 --eval "(async()=>{const g=__LM3D.game; await g.open('world',{tab:'rivals'}); await new Promise(r=>setTimeout(r,900))})()"`. Use `empty=1` or the first-fighter recruit sheet opens over your screen.
- Fall flow: in an eval, `const m = await import('/ludus_maximus_3d/js/flow.js'); const rep = LM.fall(S, glad, {kind:'pit', depth:6}); m.fallenFlow(g.ctx, rep)`.
- Bot: `node tools/ludus3d_bot.mjs "<url>?new=1&rich=1&tier=low&manual=1&notut=1" --weeks 4` (the bot clicks the FIRST action of every dialog; keep the first action of any new dialog harmless, e.g. 'Rest in peace', 'Welcome the heir').
