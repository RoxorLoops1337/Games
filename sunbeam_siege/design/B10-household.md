# B10 Household Horrors (18 regular pests)

File: src/data/enemies-household.js, SB.data.enemiesHousehold. Loads clean, 18 unique pest_ ids, no dashes. Act pools: Act 1 has 5, Act 2 has 13, Act 3 has 16.

## Intent
Things cats hate, each with one clear verb the player can read from the token. HP and Hide are base values before the A07 per-night scale. Threat: 3 to 9.

## Families
- Wet applicators: Mop (Slop, splash), Spray Bottle (Spritz hits front cat of every floor), Bath Tub Tide (Water counter, Overflow Puddles two floors), Thunderstorm (Drizzle). Wet halves Claws and Purr and blocks Fluff (A04).
- Splash: Mop and Bath Tide hit the whole Cuddle Pile of the target (A05 note). Vet Scale punishes crowds with damage per cat on the floor.
- Scare-all: Cucumber (own floor, ambush), Balloon (every floor, or gentle if Knocked), Thunderstorm (every floor, Piles of 3 are immune), Fireworks (every floor plus Sunbeam).
- Cleaners: Robot Vacuum (wipes Purr, flattens a Box, clears Hairballs and Tape), Mop (half Purr, Hairballs), Lint Roller (all Fluff, converts it to its own Hide).
- Tick-downs: Nail Clippers (strips all Claws), Balloon, Fireworks (Wet stops the fuse), Thunderstorm, Alarm Clock (Ring wakes Nappers; hits snooze it), Bath Tide (Water rises), Spray Bottle (3 shots then pump).
- Solve-not-hit: The Red Dot cannot be damaged. It drains by Stamina 8 from chasing cats, or loses 4 when a Hidden cat attacks on its floor. It has an 8 round bored-timeout so nothing soft locks. Closed Door is a wall that pays out Zoomies and a draw when opened.
- Hostage: Carrier Crate traps the weakest non-Large cat; killing it frees the cat. Large cats are safe.

## Standout counterplay and combos
- Knock It Off: deflates a Balloon for free, clears Tinfoil (Slippery), unplugs the Hair Dryer for extra Dazed. Vacuum and Scale are Heavy.
- Mischief Boxes counter the Cucumber and the Dot, lose to Vacuum, Hair Dryer and Lint Roller type pests. Hearth Piles beat the Storm and Cucumber, lose to Mop, Tide and Scale. Alarm Clock punishes Nap decks; Rested players time Naps after a ring.
- Fireworks killed on a crowded floor bombs the other pests. Yarn pauses all countdowns (Dazed and Yarn skip the action).
- Wet cat plus Fireworks: Wet fuse stop only works on the pest, so cat water cards help.

## NEEDS for the engine (also listed in file header)
Statuses shamed, frazzled, dull, spooked, dazed as self buff; effect types wipe, shove, trapCat, releaseCat, gainCounter, setCounter, killSelf, chase, floorStatus puddle/foil; attack flag splash; floors "sunbeam"; pattern type countdown; Untargetable and Cleaner traits; hiddenIntent flag; hooks onHit, onKnocked.

## Unresolved
- Rested players may find Alarm Clock too hard when Napping is the whole deck; tune the 3 damage and reset.
- Laser Dot threat (7) is a guess; it costs tempo, not Warmth. Playtest.
- Door pattern could use Fish reward instead of Zoomies+draw if Fridge Rule needs it.
- Mop and Vacuum both wipe Hairballs from PEST status (mess cleaned), not the hand curse cards. Confirm wording with the Hairball agent.
