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
- [ ] 37. Weekly town crier headlines about your fighters
- [ ] 38. Fighter nicknames earned from deeds
- [ ] 39. Training montage animation after the weekly plan
- [ ] 40. Rival ludus owners with a recurring storyline
