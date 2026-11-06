# B12 Elites and Bosses: what each one demands

Data: src/data/enemies-bosses.js. HP is base, A07 hpScale (+5% per Night) applies on top. Bosses are Heavy or Anchored, take half Yarn, ignore Scared. Every boss has 3 stages (base plus 2 phases), a telegraphed intent, a floor hazard, adds, and a different dramatic rule. Phases trigger once at an HP threshold, stagger the boss for a beat, and never trigger twice in one hit.

## Elites (4 per act, each asks one question)
| Elite | Question | Answer |
|---|---|---|
| Duchess of Drains (A1) | Court cuts her damage 20% per courtier (max 60%) | AoE, or Knock her away from her court |
| Lawn Gnome Sergeant (A1) | No hit does over 5 | Multi-hit, Claws, Dizzy, Hairball, Shatter |
| Magpie the Fence (A1) | Steals Room items, pecks the Sunbeam from the Attic | Attic reach, Shade, kill for the items and 20 Fish |
| Duke, a Good Boy (A1) | Rage grows every round, Hide at Rage 5 | Burst early, Hiss, Yarn |
| Count Cucumber (A2) | Scares your strongest cat, gains Hide per Scared cat | Cleanse, Purr 40, cheap bodies |
| Mop and Bucket (A2) | Floods floors, Wet 2 on three cats | Heat Lamp, Cleanse, non-Claws builds. It slips in its own Puddle, so Knock it |
| Static Duster (A2) | Strips Fluff from three cats and wears it | Do not live on Fluff, Pierce, kill fast |
| Wheelie Bin Warden (A2) | Heavy, flattens Boxes, ignores Hidden, double vs Hidden | Do not rely on Boxes, Pierce, Attic burst |
| Snooze Alarm (A3) | Rings every 2nd round, wakes Nappers | Time the Stretch on odd rounds, burst before round 6 |
| Thunderhead (A3) | Bolt hits the highest Attack cat, ignores Fluff, Hidden, Decoy | Spread power, bait with a cheap strong cat, Lives |
| Grand Finale Crate (A3) | 3 round fuse, 14 to every cat, 10 to Sunbeam | Burst it, stockpile Fluff, Wet adds a round |
| Cone of Shame Warden (A3) | Cones the most-Lives cat (cannot attack, Nap or Pile) | Cleanse, Spend a Life, kill priority |

## Bosses
**Rat King (A1, 96).** Tribute: each pest death heals him 5, max 10 a round. Rats arrive on the Parlor and Attic, not his floor, so cats there are the real test. P2 Pied Panic adds Rat Tide (1 damage per rat to cats on the floor). P3 Abdication: he leaves the throne, loses Anchored, climbs, and tosses the crown at the Sunbeam for 10. Plan: cap how many rats you kill per round, burst him during the window after Decrees, keep Attic cats to meet the rush. Yarn on rats is excellent (they do not die, he does not heal).

**Garden Hose (A1, 100).** Pressure 0 to 4. At 4 it Blasts: every cat shoved to the back, Wet 2, Boxes washed away. Each Coil you kill takes 2 Pressure and 6 HP off the head. Plan: Piles and Boxes are the victim, so keep a plan B. Kill the nearest Coil before Pressure 3. Cleanse or Heat Lamp clears the Wet. P3 Burst Pipe makes Pressure climb twice as fast.

**Vacuum Mk IX (A2, 150).** Inhale sucks the top 2 to 3 cards of your draw pile into the Dustbag (the next hand), Swallow eats the front cat (lives untouched). Bag fills to 10: Jam. It is Dazed and Spooked (x1.5) for two rounds and spits everything back. Plan: play around the Inhale shown on the intent, favor Keep and cheap cards, then spend your burst on Jam turns. Swallowing your own champion into the bag is a cost, not a loss. P3 Overheat burns it for 4 a round, so surviving is a plan too.

**Spray Bottle Duelist (A2, 135).** Alternates Mist and Parry on the intent. Parry turns the first hit back as Wet 2 on you with no damage, so lead with a cheap 1 damage poke, then unload. Mist is the damage turn. Wet 3 becomes Scared, so Cleanse or Heat Lamp matters. P2 brings Cucumber Seconds, P3 Single Stream targets your strongest cat with Wet 3.

**Vet Carrier (A3, 190).** Traps a cat per turn into a Latch (HP 12, Hide 4) with a 3 round Appointment. If the timer ends the cat spends a life. It gets +2 Attack per passenger. Hidden cats cannot be traded, so Boxes are an answer here. Plan: break Latches with multi-hit, keep fodder cats as the bait. P2 Sterile Lights stops Rested and Hidden gains, P3 traps two cats per turn.

**Red Dot (A3, 150).** Untargetable by attacks and spells. Reached by: AoE and floor effects, Zoom hits (the deliberate exception to A05), Dizzy, Hairball and Yarn Pin. Each teleport adds Heat. At 4 it Overheats for a round, takes +50% and can be hit directly. P2 Which One Is Real splits it into three dots (intent hidden) and P3 forces Witching Hour every round for 3 rounds (Zoom heaven). It burns the Sunbeam for 4 to 7 a round, so Shade matters.

**The Great Bath (final, Night 9, 240).** Water rises 1 a round from the Attic down (Puddle on each floor), Overflow at 4 hits everyone for 6 and washes Boxes away. The Plug is a pest: kill it to drop water by 3 and take 12 off the Bath (it respawns in 3 rounds). P2 Bubble Bath summons Reruns, miniature echoes of every boss you beat this run (fallback Rubber Ducks), and Suds scramble cat order. P3 Dawn (25% HP): the 6 AM alarm, every pest gets a free repeat of its intent, but the Sunbeam heals 2 and gains 3 Shade a round, cats gain +1 Claws and Rested, and the Bath dries 4% of max HP a round. The Final Flush hits on Dawn round 3 (8 cats, 15 Sunbeam) and is cancelled by Dazed. Win by killing it or surviving 5 Dawn rounds (winIf any). Payoff: the last drain gurgles, sunlight reaches the cushion, a towel warm from the dryer drops into the Sunbeam. Nobody planned it. Title card: The Sunbeam Holds.

## Standout combos
- Moon: Spend a Life frees a Cone, a trapped cat returning keeps the lives, Nine Lives soaks the Thunderhead bolt.
- Mischief: Knock the Mop into its own Puddle (2 floors), Yarn Pins the Dot, Zoom burst on Red Dot.
- Hearth: Purr 40 stops Count Cucumber cold, Pile breaks against Hose and Draft, so use Heaps only on Cellar and Attic.
- Alley: Claws plus multi-hit for the Gnome, burst before Duke's Hide.

## Unresolved (needs lead)
1. A07 gives Act 3 two bosses and the Night 9 boss is the Act 3 boss. I added the Great Bath as a third pick (selection field: replaces the pick if Mischief Rank 5 or more, otherwise 1 in 3). Carrier and Dot append the generic Dawn template at Night 9. Lead may prefer to make the Great Bath always the Night 9 fight.
2. A05 says Zoom cannot target bosses. Red Dot is the one exception.
3. The 11 NEEDS in the data file header (new ops, Coned status, winIf types, meters).
4. Balance is a first pass: boss HP 96 to 240 against target 8 rounds at the budgets in A07.
