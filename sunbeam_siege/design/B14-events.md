# B14 EVENTS: design note

File: src/data/events.js, `SB.data.events`, 48 events. 16 home events per act (`homeAct`), 7 also listed in an adjacent act (`acts` array), so Act 1 has 16 available, Act 2 has 20, Act 3 has 19. Every event has 2 to 4 choices, 2 to 4 setup lines and an `art` hint. Each id once per run, per A07.

## Categories (A07 weights: Boon 30, Gamble 25, Trade 20, Story 15, Fight 10)
- Fight category, one per act: evt_rat_toll (A1), evt_dust_bunnies (A2), evt_chandelier_spiders (A3). Every one has a non-combat way out (pay, sweep, tiptoe).
- Other events can still contain a fight as ONE option (Gerald's cousins, Roomba revenge, pigeon flock). Those are not Fight category, so they do not count toward the one-per-act cap. If the lead wants them to count, tag them accordingly.
- Events never kill: every Warmth cost is small (2 to 8) and the engine clamps to 1.

## Recurring cast
- Gerald (raccoon, trench coat, "a tall cat"): evt_gerald_overstock, evt_gerald_tab, evt_gerald_collector, evt_gerald_curio, evt_gerald_closing.
- Elder Cat (spectacles, polished): evt_elder_lesson, evt_elder_pop_quiz, evt_elder_graduation. Answers A08 open question 5: yes, she appears as an event NPC.
- Suspicious pigeon: evt_pigeon_tip, evt_pigeon_syndicate, evt_pigeon_dice, evt_pigeon_reveal. Flag `pigeon_grudge` set by ignoring or snitching on it; unlocks the Flock fight in Act 3.
- The Neighbor's Roomba: sighting, return, Mk II. Player picks friend (feed it) or foe (knock it down) in Act 1.
- Pip, the kitten who is clearly a goblin: found, grows, finale.

## Multi-part chains (follow ups are `forced:true` with `requires.flag`)
1. Elder Cat, 3 parts. Part 1 sets `elder_student`. Pop quiz can set `elder_scholar` (60 percent, or pay 20 Fish). Graduation gives the Spectacles relic only to scholars, others pick 1 life for all or +3 max Warmth.
2. Roomba, 3 parts. Friend path: bumper relic, then a ride that upgrades a card and heals. Foe path: a prowl fight, then an elite fight with a rare relic. The foe path is higher reward, higher risk.
3. Pip, 3 parts. Kitten card, then evolves into goblin cat, then goblin king (a champion-grade payoff for a basic neutral). The player can lose Pip at stage 2 (50 percent on the "fend for itself" option) or sell the crown in stage 3. Enrolling with the Elder links chains 1 and 3.
4. Gerald's tab, 2 parts. Borrow 60 or 100 Fish in Act 1, repay at 125 percent in Act 2 (or pay a card, or fight cousins). Debt carries even if the player forgot.
Forced events appear on the next Event or Mystery-event in that act. If the player never visits an Event node, nothing happens, which is intentional.

## Six lives gambles (`livesGamble:true`, thematic Nine Lives risk)
1. evt_milk_roulette (A1): drink 1 at 80 percent safe, drink 3 at 51 percent for an uncommon relic, or pay one life for a sure common.
2. evt_bookshelf_leap (A1): 65 percent for 50 Fish and an upgrade, 35 percent lose a life but still keep 20 Fish.
3. evt_seance_saucer (A2): pay 1 life for uncommon, 2 for rare, or a 50/50 loan of +2 or -2 lives.
4. evt_pigeon_dice (A2): bet a life, 50/50 for +2 or -1 (a mildly positive bet by design, the pigeon is generous in math only).
5. evt_last_ledger (A3): auction, 1 life for a rare, 2 lives for a rare plus upgrade, or pay 80 Fish. Always a cat with a life spare.
6. evt_roof_midnight (A3): howl for +2 champion lives (60 percent) or lose one; Moon clan gets a "commune" option.
Gate: options that spend lives require `catLives` of at least 2 (or 3 for a 2 life price), so no event ever deletes a cat. Engine should show "Choose a cat" before resolving and never offer champions at 1 life as the paying cat.

## Standout interactions
- Elder chain plus Pip: the "Enroll with the Elder" option is a free Evolve and a life.
- Roomba friend plus Elder Spectacles: a run that is nearly all information and upgrades.
- Gerald debt as a deliberate Fish loan to buy an early shop engine, with a known interest tax.
- Moon clan: seance, roof and ledger are the places where lives become currency (Graveyard Shift, Ninth Sibling fans).

## Unresolved (engine / content NEEDS also listed at the top of the data file)
- New event-layer ops: evolveCard, payDebt, duplicateCard, cardDraft, chance, setFlag/clearFlag, `req` kinds (fish, clan, flag, catLives, curses).
- New content ids: cards neutral_goblin_kitten/cat/king, curse_wet_sock, relics relic_pigeon_feather, relic_roomba_bumper, relic_elder_spectacles, seven encounter ids enc_evt_*. Flags boss_intel and red_dot_dim need a hook in boss setup.
- Curse count: bath_time, vet_appointment and curse_wet_sock are the only curses used. Remove-curse options (vet postcard) need at least one in deck; gated by `curses:1`.
- Balance guess: Fish rewards 10 to 80, relics from common to rare. Rare relics only via lives or 80+ Fish, never free.
