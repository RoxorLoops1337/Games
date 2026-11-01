# B08 Rodents and Garden Critters

File: `src/data/enemies-rodents.js` (`SB.data.enemiesRodents`, 18 regular pests, ids `pest_*`). Acts 1 to 2, a few Act 2 only. Rules per RULES.md: pest Room Small 1, Medium 2, Large 3 (floor capacity 5); Fluff persists; Yarn, Dizzy, Knock per A04/A05.

## Intent
Each pest asks a different question of the player. Nobody is a pure stat check. The cheap bodies (mouse, goon, thimble) make waves readable, the mid pests (vole, hamster, Don) force a priority target, and the Large pieces (tank, brute) set the pace of a fight.

## Roles table

| Id | Name | Act | Room | HP/Fluff | Threat | Pattern (exact) | Role and answer |
|---|---|---|---|---|---|---|---|
| pest_field_mouse | Field Mouse | 1-2 | 1 | 4/0 | 1 | cycle: Nibble 2 | Filler. Cheap bodies for sweeps and Pile practice |
| pest_pantry_mouse | Pantry Mouse | 1-2 | 1 | 5/0 | 2 | Scurry 1, then Snatch (steals 8 Fish, hits 1), then Bolt (flees with Fish) | Thief. Kill within 2 rounds to get Fish back (+3). Light |
| pest_alley_rat | Alley Rat | 1-2 | 1 | 7/0 | 2 | cycle: Bite 3, Gnaw 4; +1 Attack per other Rat on floor (cap +3) | Pack bonus. Punishes Knock stacking, wants AoE |
| pest_thimble_mouse | Thimble Mouse | 1-2 | 1 | 3/4 | 2 | Poke 2, Poke 2, Re-thimble (+2 Fluff, max 6) | Armor swarm. Shatter, Pierce and multi-hit beat it; one big hit wastes overkill |
| pest_garden_squirrel | Garden Squirrel | 1-2 | 1 | 6/0 | 3 | Scratch 3, Acorn Lob 2 (back cat, ranged), Scratch 3 | Climber. Back-line pressure, ignores Hold |
| pest_stripe_chipmunk | Stripe Chipmunk | 1-2 | 1 | 4/0 | 2 | Dart 2 each round, Climber + Sneaky | Racer. Pings the Sunbeam from the Attic past cats. Drops 3 Fish. Light |
| pest_alarm_vole | Alarm Vole | 1-2 | 2 | 10/0 | 3 | If a napping cat is on floor: Rude Chomp 4 on it; else Nibble 2 | Punishes Nap. Boxed or Hidden nappers are safe |
| pest_midnight_hamster | Midnight Hamster | 1-2 | 2 | 12/0 | 4 | Wheel Spin (+2 Rage, max 6), Slap 3 x3 | Snowballer. Nocturnal (+2 at Witching Hour). Purr 10 aura, Yarn and fast kills answer it |
| pest_gerbil_don | Gerbil Don | 1-2 | 2 | 11/0 | 4 | Whistle (summon 2 Goons, cap 4), Slap 2, Slap 2 | Summoner. Death Dazes the gang |
| pest_gerbil_goon | Gerbil Goon | 1-2 | 1 | 3/0 | 1 | Shank 2; +1 Attack per other Gerbil (cap +2) | Gang body. Light |
| pest_toy_tank_mouse | Tank Commander Mouse | 1-2 | 3 | 26/6 | 7 | Rev Engine (+4 Fluff, max 14), Foam Dart 5 (weakest, ranged) x2, Tread Over 8 | Siege piece. Heavy, ignores Knock. Pilot Field Mouse leaps out on death |
| pest_brute_rat | Basement Brute | 1-2 | 3 | 22/0 | 6 | Gnaw 5, Gnaw 5, Thump 9; Rat pack bonus (cap +2) | Wall. Heavy. Death gives other Rats Rage 1 |
| pest_tunnel_vole | Tunnel Vole | 1-2 | 1 | 6/0 | 3 | Nibble 2, Nibble 2, Tunnel (up 1 floor, ignores Hold) | Non-Climber that bypasses Hold. Slippery (double Shatter) |
| pest_nightcap_mouse | Nightcap Mouse | 1-2 | 1 | 5/0 | 3 | If a napper is on floor: Whisper (strip its Rested, gain Rage per stack); else Nibble 2 | Soft Nap punisher (no damage, no Rude Awakening). Nocturnal, Light |
| pest_flying_squirrel | Glider Squirrel | 2 | 1 | 7/0 | 4 | Swoop 3 (reach) x2; Climber + Glider (2 floors per advance) | Fast climber. Keep the Attic held |
| pest_pack_rat | Pack Rat | 2 | 2 | 13/0 | 4 | If a Room item is on floor: Raid (destroy it, +5 Fluff, max 10); else Bite 4 | Box and Toy wrecker. Rat pack bonus |
| pest_hamster_ball | Hamster in a Ball | 1-2 | 2 | 10/0 | 3 | Roll Over (1 to all cats, shove front cat to back), Bonk 3, Roll Over | Pile breaker. Slippery |
| pest_piper_rat | Piper Rat | 1-2 | 1 | 6/0 | 3 | Pipe (other pests on floor +1 Rage, max 3), Pipe, Squeak 1 | Support. Kill first; death strips the Rage it granted |

HP values are base; the engine applies A07 `hpScale`.

## Coverage of requested answers
- Fast climbers: Garden Squirrel, Stripe Chipmunk, Glider Squirrel, plus the Tunnel Vole's Hold bypass.
- Armor swarms: Thimble Mouse (and the Tank).
- Summoners: Gerbil Don (Goons), Tank pilot.
- Fish thief: Pantry Mouse. Chipmunk gives Fish back, so greed is two-sided.
- Punish sleeping cats: Alarm Vole (damage wake), Nightcap Mouse (strips Rested), Midnight Hamster and Nightcap Mouse are Nocturnal for Witching Hour.
- Anti-Box: Pack Rat. Anti-Pile: Hamster in a Ball. Anti-Knock: Alley Rat stacking, Heavy Tank and Brute, Slippery vole/hamster ball.

## Suggested Act 1 encounters (threat in brackets)
- Soft open [8]: Field Mouse x3, Alley Rat, Thimble Mouse.
- Prowl [12]: Alley Rat x2, Pantry Mouse, Garden Squirrel.
- Night [20]: Gerbil Don, Goon x2, Alarm Vole, Tunnel Vole, Piper Rat.
- Elite [28]: Tank Commander Mouse plus Thimble Mouse x3, Chipmunk x2.

## Unresolved
1. Several new engine hooks are listed under NEEDS in the data file header: stealFish, flee, destroyRoom, shoveCat, tunnel, the `napping` pick and `Glider`.
2. Costly is unused here. It is reserved for elites and bosses (A05 2.2). A Costly Act 2 Pack Rat elite variant is possible.
3. `flee` counts as removal for the win check but pays no reward; confirm with the combat agent.
4. Pantry Mouse steal of 8 Fish is about 70 percent of a Prowl reward; tune if it feels cruel.
