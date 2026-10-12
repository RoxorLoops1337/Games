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
- [ ] 21. Fighter relationships (rivalries and friendships inside the ludus, events)
- [ ] 22. Tournament bracket tree view
- [ ] 23. Walking characters and ambient life on the ludus map
- [ ] 24. Themed arenas per league (sunlit Pit, marble Colosseum, golden Imperial)
- [ ] 25. Accessibility: volume slider, reduced motion toggle, colorblind-safe icons
- [ ] 26. Performance pass for low-end phones (particle caps, DOM count)
