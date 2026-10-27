# B03: Moonwhiskers card set (src/data/cards-moon.js)

42 non-champion cards, ids `moon_*`: 20 Cat units, 14 spells, 8 rooms (type `toy`, tagged `room`). 18 common, 16 uncommon, 8 rare. Champions are another agent's job.

Intent: Moonwhiskers win by treating death as income. Three resources feed each other: Lives (spend, lose, gain), Banked Lives (a battle-only chip, new), and Marked prey. Witching Hour cards turn the 3-round clock into a payoff. Every loop is 3 to 5 pieces and is capped by the generic rules (hard cap 9 lives, last life still deletes a cat, Frazzled after every Witching Hour, Grip on Knock is irrelevant here).

## The 4 best loops

1. Lives Banking (the heist). Stray Medium, Pennies from Heaven, Sock Shrine, Ninth Sibling feed the Bank. Seance Saucer spends 2 Bank to pull a dead cat back with an extra Life. Mr. Tuppence (Undertaker) spends 2 Bank to refund a lost Life, so with Bank he never really dies. Probate Persian converts leftover Bank into permanent Lives at battle end, which is the run-long payoff. Moon Pool turns a full Bank (5) into 10 damage plus Marks each Witching Hour without spending it. Counter: low-HP bosses that burst a floor in one hit, and Costly pests.
2. Dying Is Good (Cornered army). Borrowed Paws, Lamplit Gambler, Cornering Rite and Borrowed Time spend Lives on purpose and draw, so a 3-life cat sits at Cornered (+2 Attack) on turn 1. Vigil Keeper gives them Fluff and Hidden, Ouija Rug and Fishbowl Oracle pay cards and Zoomies for being Cornered, Graveyard Loafer turtles at 1 life, The Pallid Empress grows +1 Attack for every Life anyone spends, and Everything Must Go cashes the whole board in for damage. Risk is the intended one: every cat is one hit from deletion.
3. Witching Double Turn. Wind the Clock pulls the next Witching Hour forward, Thirteenth Chime (once per battle) makes the next round one too, and Mrs. Midnight makes each Witching Hour pay twice (+4 Zoomies, +2 draw, two free Zooms). Stopped Grandfather Clock, Sleepwalker and Lantern Tom cancel or ignore Frazzled, Haunted Mirror marks every Zoom target, Wick Witch Marks everything. Setup turn: Chime on round 3 gives rounds 3 and 4 as Witching Hours. Counter: Night Visitors spawn after each Witching Hour, so a chained double also brings two waves.
4. The Marked Hunt. Candle Kitten, Candle Stub, Siamese Seer, Mark for Dusk and Candlelit Hiss spread Marked (+50 percent damage, and per A04 a Marked kill returns 1 Zoomies once per round and +1 Claws). Chill in the Hall and Haunted Mirror Zooms punish it. Hollow Tabby marks two pests when it loses a Life, so dying is also setup. Fast, ugly, Zoomies-positive.

Honorable mention: Revolving Door. Pennyfeather, Boomerang Bernard, Land on Feet and Cat Flap to the Beyond all return a dead cat to hand, then Pallbearer Tom and Haunting Rights use the discard pile as a weapon.

## NEEDS (engine agent, details in the top comment of cards-moon.js)
- `lives` effect params `voluntary` (Spend a Life, stays on board, cannot take last life) and `upTo`; counter `livesSpent`.
- Banked Lives: battle counter 0 to 9, effect `bank`, effect `bankConvert`, check/counter `bank`, UI chip.
- Triggers: `onLifeLost`, `onLifeSpent`, `onCornered`, `onWitchingHour`, `onBattleEnd`, and `onAnyLifeLost`, `onAnyLifeSpent`, `onAnyCornered`, `onAnyZoom` (floor scoped on toys).
- AmountExpr `max`, effect `limit` per turn, check `targetMarked` and `triggerOnThisFloor`, counters `catsInDiscard`, `corneredOnFloor`.
- Effects `returnFromDiscard`, `witching` (`next`, `chain`). Keywords `witchingEcho`, `unfrazzled`.

## Unresolved
- Thirteenth Chime breaks the "never twice in a row" rule on purpose; rules lead should confirm. It is rare, exhaust, once per battle.
- Seance Saucer and Undertaker rely on array order (gated payoff before the Bank spend). Convention is documented in the file.
- Marked-kill Zoomies and Claws come from A04, not from these cards. If that rule changes, the Marked Hunt loses its engine.
- Mrs. Midnight echo does not stack with itself; confirm. The 3-round clock plus Bank means Moon Pool is strongest on rounds 3, 6, 9, and weak in the opening fights; playtest.
- Probate Persian and Pallid Empress are the likeliest balance outliers. Cards are untuned past a stat-budget pass.
