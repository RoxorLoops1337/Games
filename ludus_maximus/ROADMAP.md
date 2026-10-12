# Ludus Maximus roadmap (work down the list; tick items when merged)

Rules: small PRs, `npm run test:ludus` + `node build.js` + a headless-Chromium look before each merge (user asked: only test THIS game). Never add counter mechanics (user dislikes them). Stay 2D. No em dashes in text.

- [x] 1. Balance pass: style winrates within ~42-58% (sim matrix), pace fights 15-25s
- [x] 2. 3v3 readability: formations, smaller sprites for teams, compact ultimate bar
- [x] 3. Fight intro splash (VS cards) + victory/defeat poses and animations
- [x] 4. Sound: per-ultimate sfx, crowd ambience, level-up jingle
- [x] 5. Forge: Evolve items (rarity up, keeps affixes, adds one)
- [x] 6. Level-up celebration + roster "ready to level" polish
- [x] 7. Browser-verify: tournament + augment stacking, Pit run, second-ultimate pick, ascension, ghosts
- [x] 8. Fight replay / highlight (slow-mo of the killing blow)
- [x] 9. Factions (Senate / Merchants / Plebs) rewarding mercy, showboat, upsets
- [x] 10. Spy activity (reveal a future event's fog), daily Pit seed with best-floor score
- [x] 11. Rivals that train week by week (intel goes stale)
- [x] 12. Tutorial coach marks for first week and first fight

## Round 3 shipped
- [x] Crowd's Favor: comeback button when the crowd backs you (you pick the moment)
- [x] Festival weeks (Mars, Saturnalia, Harvest, Imperial Visit, Bacchus), shown in Arena week tabs
- [x] Arena hazards in league 1+ (telegraphed fire jets; fighters dodge or get knocked up)
- [x] Fighter barks (speech bubbles on ultimates and crits)

## Next ideas
- [x] 13. Achievements / trophy shelf in the ludus (visible trophies on the map)
- [x] 14. Pit mutators (daily modifier: low gravity, glass cannons, double augments)
- [x] 15. Training minigame (tap timing) for a bonus on the weekly stat gain
- [x] 16. VIP guests that visit the ludus with a request (choice + reward)
- [x] 17. Weather in the arena (rain slows, heat drains) shown in the fight art
- [ ] 18. Photo mode / share card for a champion
- [ ] 19. Cloud save via the existing functions/api (careful: KV rules in CLAUDE.md)
- [ ] 20. Fighter portraits on the roster with mood faces and idle animations

## Round 4 shipped
- [x] 24 trophies on a shelf (Ludus + More), one-time rewards, popups
- [x] Pit mutators (weekly + daily), both sides get the twist
- [x] Arena weather (rain, dust, heat, night) with canvas visuals and stat effects
- [x] VIP guest events: sponsor deal, priest blessing, champion masterclass, defector
- [x] Training drill minigame (tap timing, up to +40% weekly stat gain)
- [x] Balance re-check: styles within about 42-57%

## Next ideas
- [x] 21. Fighter relationships (rivalries and friendships inside the ludus, events)
- [x] 22. Tournament bracket tree view
- [x] 23. Walking characters and ambient life on the ludus map
- [x] 24. Themed arenas per league (sunlit Pit, marble Colosseum, golden Imperial)
- [x] 25. Accessibility: volume slider, reduced motion toggle, colorblind-safe icons
- [x] 26. Performance pass for low-end phones (particle caps, DOM count)

## Round 5 shipped
- [x] Relationships: rivalries build between same-style fighters; at 45 the Rivalry Bout event (friendly arena duel, partner up, or ignore). Profile shows bonds and rivalries.
- [x] Tournament bracket tree in the prep screen
- [x] Themed arenas per league (dirt Pit, banner Provincial, arched Colosseum, gold Imperial)
- [x] Ambient map life (pacing fighters, kitchen steam, forge sparks)
- [x] Accessibility: volume steps, reduced motion, large text
- [x] Performance: particle and float caps, lower canvas resolution

## Next ideas
- [x] 27. Duo Ultimates: bonded pairs (bond 60+) unlock a combined ultimate in team fights
- [x] 28. Season finale spectacle (12-week championship with a cinematic intro and trophy ceremony)
- [x] 29. Fighter backstories and personal quests (one short goal per fighter that unlocks a unique trait)
- [x] 30. Crowd reactions in the stands (waves, fireworks on big kills)
- [x] 31. Horde Trial (one fighter vs escalating packs, weekly, best wave saved)
- [x] 32. Balance re-check and difficulty slider (Relaxed / Standard / Brutal)

## Round 6 shipped
Duo ultimates (pincer, wall, storm), season recap with confetti, fighter backstories with titles, crowd wave and fireworks, Horde Trial, difficulty setting (Relaxed / Standard / Brutal). Fixed a duoPair index bug found by the new tests.

## Next ideas
- [x] 33. Stable rivalries across seasons with a rival-of-the-year award
- [x] 34. Sponsor contracts with weekly goals and bonus purses
- [x] 35. Gladiator retirement ceremony and hall of fame wall
- [x] 36. Arena crowd chants synced to hype

## Round 7 shipped
Rival of the Year award in the season recap, sponsor pledges (win 3 fights for a bonus), retirement pension and ceremony stamp in the Hall of Legends, crowd chants on roars.

## Next ideas
- [x] 37. Weekly town crier headlines about your fighters
- [x] 38. Fighter nicknames earned from deeds
- [x] 39. Training montage animation after the weekly plan
- [x] 40. Rival ludus owners with a recurring storyline

## Round 8 shipped
Town Crier headlines in the week summary, nicknames earned from deeds, a bobbing training montage, and a recurring rival ludus owner who taunts you and can be humbled.

## Next ideas
- [x] 41. Rival owner sends a champion to a special duel
- [x] 42. Nickname perks (small passive per deed)
- [x] 43. Forum board showing past crier headlines
- [x] 44. Seasonal arena decorations

## Round 9 shipped
Champion duel against the rival owner's best fighter, small stat perks for deed nicknames, a Forum log of past headlines, and seasonal arena decorations (blossoms, sun glow, leaves, snow).

## Next ideas
- [x] 45. Gladiator injuries with a recovery minigame at the infirmary
- [x] 46. Weekly bounty board with named targets
- [x] 47. Crowd favorite meter per fighter that affects purses
- [ ] 48. Replay the last fight from the results screen

## Round 10 shipped
Infirmary treatments (poultice or physician), per-fighter crowd favorite that lifts purses up to 20%, and a weekly Bounty board duel against a named outlaw. Replay (48) is deferred.

## Next ideas
- [ ] 48. Replay the last fight from the results screen
- [x] 49. Fighter mood events (a bad night, a good omen)
- [ ] 50. Buildable gym equipment with visible upgrades on the map
- [x] 51. Weekly special market with rare gear

## Round 11 shipped
Weekly special market item (rare gear at a premium), random mood events (good omens, bad nights), a fight log in the Forum (lite replay), and a Fan fave badge. Full replay (48) and gym equipment on the map (50) are deferred.

## Next ideas
- [ ] 52. Deterministic fight seeds so a real replay is possible
- [x] 53. Visible gym equipment upgrades on the ludus map
- [x] 54. Fighter portraits with mood faces

## Round 12 shipped
Building upgrades now show on the map (flag, torch, weights, gold star as levels rise) and roster portraits show happy or sad faces from morale. A true replay (52) needs fixed-step fights with recorded taps and is still open.

## Next ideas
- [ ] 55. Record ultimate taps and use a fixed step so fights can be replayed
- [x] 56. Ludus map weather and night lighting
- [x] 57. Fighter retirement ceremony animation
- [x] 58. Achievements screen polish with rewards

## Round 13 shipped
Ludus map weather and night tint (rain streaks, heat haze, dust, night), animated retirement ceremony with confetti and a rising portrait, trophy confetti and a Grand Collector bonus for earning every trophy. Replay (55) still needs fixed-step fights with recorded taps.

## Next ideas
- [x] 59. Weekly planner presets ("Boot camp", "Rest week")
- [x] 60. Fighter family trees and apprentices
- [ ] 61. Sound: crowd ambience that follows hype
- [x] 62. Rival ludus raids on your market

## Round 14 shipped
Planner presets (Boot camp, Rest week, Odd jobs, Sparring), legend apprenticeships for new recruits, and rival owner raids that can snatch the market's special item. Crowd ambience (61) and replay (55) still open.

## Next ideas
- [ ] 63. Crowd ambience that follows hype (needs audio work)
- [x] 64. Season-long ladder with weekly rewards
- [x] 65. Fighter personality traits that react to events
- [x] 66. Share card for a champion (screenshot export)

## Round 15 shipped
Season ladder (win milestones pay once per season), trait-flavored mood events (Showman, Hothead, Lucky, Cool Head and more), and a downloadable Share card poster for any fighter. Crowd audio (63) and replay (55) still open. Also restored round 14 helpers after a bad edit (caught by tests before merge).

## Next ideas
- [x] 67. Tournament brackets with sponsor banners
- [x] 68. Fighter rivalries show up in the Forum
- [ ] 69. Training dummy minigame upgrades
- [x] 70. Season trophy cabinet with a yearly award

## Round 16 shipped
Sponsor banners under tournament brackets, rivalry events logged in the Forum, and a Season awards list (wins, MVP, rivals of the year). Training dummy upgrades (69), crowd audio (63) and replay (55) still open.

## Next ideas
- [ ] 71. Training dummy upgrades for the drill minigame
- [ ] 72. Per-style signature entrance animations
- [x] 73. Gladiator diary lines on the profile
- [x] 74. Seasonal events with unique reward items

## Round 17 shipped
Gladiator diary on the profile (fights, level ups, nicknames, quests) and a named Season prize item at every season rollover. Dummy upgrades (71), entrance animations (72), crowd audio (63) and replay (55) still open.

## Next ideas
- [ ] 75. Per-style entrance animations in the fight intro
- [ ] 76. Diary export as part of the Share card
- [x] 77. Season prize choice (pick one of three)
- [ ] 78. Arena crowd reacts to nicknames

## Round 18 shipped
Season prize is now a choice of one of three named items in a celebratory dialog.

## Next ideas
- [x] 79. Diary lines in the Share card
- [x] 80. Fighter nickname banners in the fight intro
- [x] 81. Armory sorting and filters by affix
- [x] 82. Tutorial hints for new systems (ladder, presets, bounty)

## Round 19 shipped
Diary lines on the Share card, nickname or title under each fighter in the fight intro, armory sort (rarity, slot, power), and updated tutorial tips that mention the newer systems.

## Next ideas
- [x] 83. Armory filter by affix
- [ ] 84. Fight intro entrance animations per style (careful with sprite transforms)
- [ ] 85. Weekly quests board mixing bounty and ladder goals
- [x] 86. Cloud save export reminder

## Round 20 shipped
Armory affix filter, and a backup reminder in the week summary when your save code is more than 12 weeks old.

## Next ideas
- [x] 87. Weekly quests board (85 carried over)
- [ ] 88. Entrance animations per style (84 carried over)
- [ ] 89. Fight replay and crowd audio (55, 63 carried over)
- [x] 90. Balance pass across all styles after the new systems

## Round 21 shipped
Weekly goals board (win 2 fights, claim the bounty, face the horde; each pays gold at week end). Balance matrix re-checked at levels 8 and 15: every style averages 46 to 53%, no changes needed.

## Next ideas
- [ ] 91. Entrance animations per style (84, 88)
- [ ] 92. Fight replay and crowd audio (55, 63)
- [x] 93. Training dummy upgrades (71)
- [x] 94. Goal streak bonus for finishing all three goals several weeks in a row

## Round 22 shipped
Palaestra level now slows the training drill marker and adds a small bonus (training dummy upgrades), and a goal streak pays extra when you finish all three weekly goals in consecutive weeks.

## Next ideas
- [ ] 95. Entrance animations per style (91)
- [ ] 96. Fight replay and crowd audio (92)
- [x] 97. Streak shown on the Weekly goals card
- [x] 98. A second drill type (reaction test) for Sparring Ring level 3

## Round 23 shipped
Reflex drill (wait for green, tap fast) on even weeks once the Sparring Ring is level 3, and the weekly goals card now shows your streak.

## Next ideas
- [ ] 99. Entrance animations per style (95)
- [ ] 100. Fight replay and crowd audio (96)
- [x] 101. Reflex drill high score per fighter
- [x] 102. Third drill: combo memory

## Round 24 shipped
Reflex drill verified in headless Chromium (it works), reflex best time stored per fighter, and a combo memory drill (watch three arrows, repeat them) every third week at Sparring Ring level 5. Also verified in the browser.

## Next ideas
- [x] 103. Entrance animations per style (99)
- [ ] 104. Fight replay and crowd audio (100)
- [x] 105. Drill leaderboard across your fighters
- [x] 106. Rival owner taunts shown in the fight intro

## Round 25 shipped
Per-style entrance animations on the VS splash (stomp, spin, leap, slide, skew), the rival owner's taunt in the fight intro, and a Drill board listing best reflex times. Entrance and taunt checked in headless Chromium.

## Next ideas
- [ ] 107. Fight replay and crowd audio (55, 63, 104)
- [x] 108. Rival owner champion taunts per style
- [ ] 109. More drill types for other buildings
- [x] 110. Second balance pass on items and runes

## Round 26 shipped
Keystone balance pass. Mirror fights of all six keystones (thraex, murmillo, retiarius at levels 8 and 15, 120 fights per cell) found Grasp at 71% and Phase Rush and First Strike at 30 to 33%. Grasp now hits for 2% every 5s (heal 1.5%), First Strike opens with +120% and gives +5% damage, Phase Rush gives +40% attack speed every 4s. All keystones now sit between 42 and 59%. Champion duel now shows a per-style taunt.

## Next ideas
- [ ] 111. Fight replay and crowd audio (55, 63)
- [x] 112. Minor rune balance pass
- [ ] 113. More drill types for other buildings (109)
- [x] 114. Augment balance pass

## Round 27 shipped
Minor rune and augment balance pass. Minor runes (vs no minor, 150 fights per cell) all land at 49 to 57%, so no change. Augments (vs no augment, 100 fights each): silver now averages 60%, gold 63%, prismatic 79% (was 62, 62, 87). Nerfed Bull's Heart, Regeneration, Juggernaut, Firebrand, Berserker, Ascension, Invincible, Titanic Hunger, Storm Lord, Urf and Phoenix (revive now 25% HP, also for the Phoenix Feather relic). Buffed Glass Cannon and Phantom Dance.

## Next ideas
- [ ] 115. Fight replay and crowd audio (55, 63)
- [x] 116. Item affix balance pass
- [ ] 117. Relic balance pass
- [ ] 118. More drill types for other buildings (109)

## Round 28 shipped
Item affix balance pass with big samples (2000 fights per affix, a plain item vs the same item with the affix at value 2). Troll's Regeneration (was 74 to 91%) and Sunfire (was 89%) are nerfed, with descriptions corrected to the real numbers. Prismatic augments tightened: Phoenix revive now 20% HP and 0.6s of invulnerability, Titanic Hunger heals 8%, Storm Lord thunder 2, Ascension 12/12/7. Prismatic now averages about 76% (was 79 to 87), gold 63, silver 59. Note: small samples (100 fights) swing by 10 points; use 1000 or more per cell.

## Next ideas
- [ ] 119. Fight replay and crowd audio (55, 63)
- [x] 120. Relic balance pass (117)
- [ ] 121. More drill types for other buildings (109, 118)
- [x] 122. Thorns and Thunder affix tuning (both about 65 to 68%)

## Round 29 shipped
Relic balance pass (2000 fights each vs no relic): Phoenix Feather was 80% (revive scaled by value, now 10% HP, 70%), Heart of the Titan 70% (HP 12 to 8%, 64%), Crown of Thorns and the Thorned affix reflect 5% per level (65%), Stormcaller thunder 30% per level (63%), Sunfire burn 5% per level. Relics now average 59%, item affixes 48 to 68%, augments 59 / 63 / 76% by tier. Rule of thumb from the data: a 10% damage edge already wins about 65% of fights, so "balanced" perks should land around 55 to 65%.

## Next ideas
- [x] 123. Fight replay and crowd audio (55, 63)
- [ ] 124. Style-specific augment/affix recommendations in the UI
- [ ] 125. More drill types for other buildings (109)
- [ ] 126. Sunfire and Troll's still lead affixes at 67 to 68%

## Round 30 shipped
Crowd audio that follows hype was already in (U.crowd and U.crowdLevel), so item 63 is done. New: a Fight stats card (damage dealt, damage taken, crits, with bars) on the results screen and on the bounty and champion duel results. This is the lite replacement for a full replay. Verified in headless Chromium through a bounty fight.

## Next ideas
- [ ] 127. Real replay (fixed-step fights with recorded ultimate taps)
- [x] 128. Fight stats history per fighter (lifetime damage, crits)
- [ ] 129. Augment hints per style (124)
- [ ] 130. More drill types for other buildings (109)

## Round 31 shipped
First-time-player pass in a fresh phone-sized browser: the start screen no longer says "Counter-pick" (the retrain text neither), the How to play sheet no longer lets the close button overlap its first lines, and every sheet title keeps clear of the close button. New: Career stats on the fighter profile (fights logged, damage dealt and taken, crits, best fight), recorded from every fight stats screen.

## Next ideas
- [ ] 131. Real replay (127)
- [ ] 132. Augment hints per style (129)
- [ ] 133. More drill types for other buildings (130)
- [x] 134. Continue the first-time pass: week 1 flow, first fight, first tournament

## Round 32 shipped
First-week pass at 390x800, 360x640 and 1280x800: fresh start, how to play, home, fighters, arena, Next Week training and summary, Sponsors and More. No horizontal scroll, no overlaps. Fixed the one real issue: the "Pick an activity per fighter" hint on the Fighters tab was dark gray on dark brown and nearly unreadable.

## Next ideas
- [x] 135. First fight and first tournament pass (week 2 to 4) at phone size
- [ ] 136. Real replay (131)
- [ ] 137. Augment hints per style (132)
- [ ] 138. More drill types for other buildings (133)

## Round 33 shipped
First fight pass at 390x800 (fresh start, week 2, enter a duel, pick a fighter, Next Week training, prep screen, augment pick, fight, skip, results). The flow reads well. One real issue fixed: the Arena tab had grown so much that the actual duels sat below the Pit, Weekly goals, Season ladder, Rival and Horde cards. The match list now comes first (with an empty-state note when nothing is announced) and those cards follow it.

## Next ideas
- [x] 139. First tournament and first recruit/market pass at phone size
- [ ] 140. Real replay (136)
- [ ] 141. Augment hints per style (137)
- [ ] 142. More drill types for other buildings (138)

## Round 34 shipped
Recruit modal, Market, item purchase and Forge checked at 390x800: all clean. One real bug fixed: the first-time tip banner from the Ludus tab (build and synergy advice) stayed on screen after switching to another tab, so the Armory showed building advice. Switching tabs, by tap or by the 1 to 5 keys, now clears the old tip and shows the new tab's tip.

## Next ideas
- [ ] 143. Level-up pick and first tournament pass at phone size
- [ ] 144. Real replay (140)
- [ ] 145. Augment hints per style (141)
- [ ] 146. More drill types for other buildings (142)
