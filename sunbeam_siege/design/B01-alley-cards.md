# B01: Alley Tabbies card set

File: `src/data/cards-alley.js` -> `SB.data.cardsAlley`. 42 cards: 20 Cats, 14 spells, 8 toys/rooms.
Rarity: 18 common, 16 uncommon, 8 rare. All ids `alley_*`, unique, loads clean in a vm sandbox.
Champions are not in this file.

## Intent
Hit first, hit often, pay for it in Lives. Four levers: Claws (flat damage that grows), Pounce
(deploy attack), Frenzy (more hits per Cat, each hit carries Claws), and Spend a Life (voluntary
cost that powers Cornered, +2 Attack at 1 life). Rage-bait is the tank-with-teeth piece: a Cat
that pests must hit, and which turns each hit into Claws. Alley has almost no healing or Fluff on
purpose; its answer to damage is to make the damage someone else's problem sooner.

## The 4 best loops
1. **Claws Snowball (slow, scales hardest).** Whetstone Whiskers / Back Door Bandit (kill = Claws),
   Sharpening Sally (attack = Claws), Grindstone (room: each Cat's first attack each turn = Claws),
   Shredded Armchair, Sharpen, then **Old Scratch** doubles Claws on every attack. Finishers:
   Dirty Fighting (damage = 3 + top Claws) and Last Gasp Gus (death blast = Claws).
   Gus is Reborn, so his death blast repeats while Claws halve on each return.
2. **Pounce Chain (burst, refunds Zoomies).** Cheap Pounce Cats into kills. **Queen of the Zoomies**
   makes any Pounce kill refund 1 Zoomies and draw 1 (once per turn). Feeders: Gutter Kitten
   (0 cost, Pounce 2), Ambush Artie (every other Cat you deploy gains Pounce 1), Dented Bin Lid and
   Springy Sofa (rooms that grant Pounce), Smash and Grab Gladys (kill = draw), Pounce Again (re-fire
   a Cat's Pounce), and **Domino Hit** (kill = 2 Zoomies and another Domino Hit). Turns of 8 plays
   for 3 Zoomies are the target feeling.
3. **Cornered Cannon (risky, spends Lives).** Scrap Heap Sal and Spite Spurt buy Claws with Lives,
   Cornered Connie scales per missing Life, **Barnaby the Bad Idea** burns a Life every turn for
   +3 Claws until 1 life, **Collective Bad Idea** does it to the whole board, and
   **Void the Warranty** cashes out all but one Life for 4 damage and 1 Claws each. The Gutter Throne
   is the rare room that makes this an engine (+2 Attack, one Life per turn, Claws to all).
   Counterplay is built in: Lives refill only at Act starts, Nap Nooks, and Tuna.
4. **Bait and Frenzy (board-wide, medium).** Rage-bait Cats (Tin Can Tom, Ragebait Ronnie) soak
   hits and convert them to Claws. Frenzy (Fence Walker, Frenzy Fred, Hurricane Hank, Back Alley
   Ring, Midnight Sprint, Bin Night Riot) multiplies every Claws point by hit count. Alley Brawl
   hurts your own floor on purpose so Rage-bait triggers and everyone leaves with Claws.

Honorable mention, loop 5 (Zoomies cycling): Cheap Shot, Bin Raid, Gutter Kitten, Domino Hit chain
free plays and draws into loop 2.

## Synergy table (card -> partners in this set)
- Old Scratch: Sharpen, Sally, Grindstone, Gus, Dirty Fighting, Gym, Armchair
- Queen of the Zoomies: Gutter Kitten, Gladys, Ambush Artie, Bin Lid, Springy Sofa, Pounce Again, Domino Hit
- Barnaby: Spite Spurt, Void the Warranty, Cornered Connie, Gutter Throne, Collective Bad Idea
- Ragebait Ronnie: Alley Brawl, Tin Can Tom, Hurricane Hank, Midnight Sprint, Old Scratch
- Bin Night Riot: Frenzy cats plus Claws cats, 3 cost, draws 2 to restart

## Tuning notes
- Stat budget is A03 points (Power x2 + Health vs 5+4C), with a slight discount to Alley Health.
- Commons give early value (Pounce, small Claws). The engine pieces are Uncommon so a run finds a
  loop by Night 3. Rares are payoffs or force multipliers, never the only way to enable a loop.
- Lives follow RULES.md: kitten 2, standard 3, Large 4. Large cats: Old Scratch, Barnaby (cost 3, size 2).
- Cheap draw/refund (Cheap Shot, Gutter Kitten, Domino Hit) is capped by Zoomies hard cap 10 and
  `oncePerTurn` flags. Watch Queen + Domino Hit in playtests.

## NEEDS list (also in the file header, for the engine agent)
1. Keyword `ragebait: N` (pests on this floor must target this Cat; each hit taken gives N Claws).
   RULES.md names it but no doc defines it, so please confirm the wording.
2. Triggers `onPounceKill` (also valid inside `passive`) and `onCatAttack` (toy trigger).
3. AmountExpr counters `selfClaws`, `maxClaws`, `livesMissing`, `lastSpent`.
4. Effect `pounce` (a Cat attacks now at front pest for Attack + N; counts as Pounce for onPounceKill).
5. `lives` effect with `spend:true` / `spend:"allButOne"`, never taking the last life.
6. Check `targetDied`; target `randomCatOnFloor`; effect flag `oncePerTurn`.
7. Stats key is `power` (A03 schema) while card text says Attack (RULES.md). Pick one in the UI.

## Unresolved
- Does Reborn keep Claws? A04 says halved on return. Gus and Old Scratch assume yes, halved.
- Alley Brawl deals 2 to every Cat on a floor: confirm it can kill a Cat and cost a Life.
- Frenzy extra-hit self damage vs Claws: confirm Fluff absorbs it as A04 combo 9 assumes.
- No Alley champion cards here; Marmalade in A03 is only an example.
