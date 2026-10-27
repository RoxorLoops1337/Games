# B09: Dogs and Canines

File: `src/data/enemies-dogs.js`, `SB.data.enemiesDogs`, 16 regular pests, all ids `pest_`. Loads clean, ids unique, flavor under 90 chars.

## Intent
Dogs are the loud family. Mice swarm, rats armor up, dogs bully. Four verbs make them feel different:
1. **Yowl**: one bark that reaches every floor (`floors:'each'`). Husky, Great Dane, Pack Alpha. Costs cats a Cat Attacks phase via Scared 2.
2. **Pack Rage**: Pup, Beagle, Guard Dog, Walker and Alpha feed Rage to each other. Dog deaths feed it too (Pup, Beagle, Alpha).
3. **Fetch**: Retriever, Walker, Corgi, Great Dane drag or shove cats, breaking Piles and opening floors.
4. **Heavy tanks**: Bulldog, Great Dane, Alpha resist Knock; Knock decks must use Shatter, Yarn or Hiss instead.

## Roster (HP at hpScale 1.0, size, threat)
| Act | Pest | Sz | HP | Thr | Hook |
|---|---|---|---|---|---|
| 1-2 | Yappy Pup | 1 | 5 | 2 | Yap gives other dogs Rage; death gives Rage |
| 1-3 | Scrappy Terrier | 1 | 7 | 3 | Climber, ignores Scared, bites back cat |
| 1-2 | Drooling Pug | 1 | 9 | 3 | Wet on hit, leaves a Puddle on death |
| 1-3 | Corgi, Herding | 1 | 9 | 3 | Shoves hit cat to back of floor |
| 1-3 | Dachshund Express | 2 | 12 | 4 | Hits own floor and the one above |
| 1-3 | Retriever | 2 | 15 | 5 | Fetch: weakest cat dragged down a floor, Wet |
| 2-3 | Baying Beagle | 1 | 10 | 4 | Bay: Rage to every dog on the board |
| 2-3 | Husky, Operatic | 2 | 18 | 7 | Yowl: random cat on each floor, Scared 2 |
| 2-3 | Bulldog | 2 | 24 | 7 | Heavy, Hide 8, headbutt dents Boxes |
| 2-3 | Poodle with Attitude | 2 | 16 | 5 | Hide 10, hits best cat, strips Fluff, Wet ruins it |
| 2-3 | Guard Dog | 2 | 20 | 6 | Hide and Rage to dogs on its floor |
| 2-3 | Dog Walker | 2 | 20 | 12 | Spawns Pup, Terrier, Corgi on a leash (fills floor to 5) |
| 2-3 | Bloodhound | 2 | 16 | 5 | Tracker: ignores Hidden, flattens Box |
| 3 | Great Dane | 3 | 44 | 11 | Heavy, shove, sits on Boxes, Boom yowl |
| 3 | Wolf at the Cat Flap | 2 | 22 | 9 | Climber, Sneaky, Nocturnal: hits Sunbeam |
| 3 | Pack Alpha, Barkley | 3 | 38 | 12 | Rally Howl, Rage floor 1, grows on dog deaths |

Elite candidates (tagged `elite-candidate`): Dog Walker, Great Dane, Pack Alpha. A07 wants 4 elites per act across all families; dogs offer one per act from Act 2.

## Standout combos and counters
- **Hiss and Run** (A04 combo 6): Hiss 3 blocks Rage gain and Hiss 2 Scares a dog. Best counter to the Beagle and Guard Dog engine.
- **Purr Fortress**: Purr aura 10 on a floor removes 1 Rage per Dusk, and aura 40 makes cats immune to Scared. Hearthpaws walk through Yowl.
- **Poodle plus Spray**: Wet removes all Hide. Mischief and any Wet card cracks the Poodle open.
- **Walker first**: leashed dogs cannot be Knocked, and killing the Walker gives them Rage 3 plus Climber. Kill it late if you can hold the floor, early if you cannot.
- **Box decks**: Bulldog, Bloodhound, Great Dane all hurt Boxes. That is deliberate (A01: dogs break boxes). A deck with two Boxes still wants a plan.
- **Knock decks**: Pup, Corgi, Pug and Terrier are Small, so Light is not needed; they fall normally. Heavy dogs shrug it off. Pug Puddles help Knock (Slippery pests).

## Tuning notes
- Scared ticks at Dusk, after the pest phase. So Scared 2 costs exactly one attack phase, Scared 1 only strips Purr. All Yowls use 2 on purpose.
- Worst case Yowl: Alpha Rally Howl scares the front cat on all three floors. It is telegraphed and appears one in three actions, Alpha has 38 HP. Test this one first.
- Walker floor budget is exactly 5: Walker 2 plus three Small dogs. If the floor already has pests, the dogs spill to the Garden queue (A02 s8) and arrive later; the Leashed status applies when each arrives.
- Wolf is the nastiest Act 3 regular: Climber plus Sneaky reaches the Sunbeam while cats block. Its HP is lowish on purpose.
- Threat costs sum for a typical Act 1 Prowl (budget 12): Pup 2 + Terrier 3 + Corgi 3 + Pug 3 = 11.

## Unresolved
- 13 NEEDS items are listed in the file header (ownAndUp floors, shove, boxDamage, Tracker, immune, leashed, pest triggers, Fluff strip, rageFloor). Engine agent should confirm names.
- Scared semantics: A04 says "usually 1". If the engine ticks new durations only from the next round, change my 2s to 1.
- Rage cap in A04 is 20 with no decay, so a dog left alone for long gets scary. Impatience (+1 from round 16) stacks on top. Fine for a 6 round fight, watch long stalls.
- Dog Walker is a human. Kept in the dog family (tag `human`). Art agent: keep him comic.
- Act 3 dogs reuse Act 1 and 2 regulars at hpScale. No Act 3 regular is Small; Act 3 encounters may want Yappy Pup swarms at Light Rage as filler.
