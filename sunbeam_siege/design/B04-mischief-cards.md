# B04: Mischief card set (42 cards)

File: src/data/cards-mischief.js (SB.data.cardsMischief). 20 Cat units, 14 spells, 8 toys. 18 common, 16 uncommon, 8 rare. No champions, no basics (a Mischief basic unit is owed by the starter-deck agent; Shelf Gremlin or Skein Gremlin are the obvious templates).

## Intent
Chaos with a plan. Every card does a small silly thing alone and a large silly thing in company. Five sub-themes: Knock and Shatter, Boxes and Hidden, Yarn, Nip (Surge and Crash), Hairballs. Crash is treated as a resource: Colossus, Crash Test Tom and Soft Landing all want it to happen.

## The 4 best loops
1. Shelf Cascade (Knock): Just a Nudge or Shelf Gremlin Knocks a pest. Tall Shelf puts a Wobbly Vase in hand (once per turn). Table Surfer draws a card (once per turn). Play the Vase, a cat knocks it off, 3 Shatter and Knock 1 on the pest below. Gravity Tabby punishes every landing for +3 Shatter and grows. Domino Shelf or Furniture Mover starts a floor-wide chain. Grip rule (once per pest per round) and once-per-turn clauses cap it.
2. Box Hotel (Boxes): Cardboard Annex puts a free Box on each empty floor every turn. Too Small For This (+3 Power in a Box, bounces after attacking) re-sits each turn for 1 Zoomies. Peekaboo Kitten draws 2 from a Box. Pop-Up Pounce leaves its Box when it attacks, or when the Box is flattened, for 8 to the front pest. Annex takes one of the 2 room slots on its floor, so that floor holds one Box only. Laundry Basket and Tape Square cover Large cats.
3. Hairball Engine: Fur Factory makes a Hairball every turn and pings 1 Shatter per Hairball in hand at end of turn. Cough It Up adds 2, Coughing Persian adds 1. Gag Reflex deals 2 Shatter per Hairball created. Hairball Appreciator grows with the hand. Spit Take cashes in up to 6 Hairballs for 3 each. Hand cap of 6 Hairballs is the ceiling, and the Hairballs themselves are junk if you stall.
4. Yarn Chain: Loose Thread, Skein Gremlin and Yarn Basket keep Yarn on the board. Sock Thief and Spool Hoarder pay out on Yarn. Cat's Cradle makes the next spells cheaper and draws. Unravel hits one pest for all Yarn on the board, then Yarn 1 on every pest, which refills the pile. Yarn Basket also tags Knocked pests, so it plugs into loop 1 (A04 combo 3, Yarn Bowling).

Honorable mention, the Surge combo: Nip Planter, Buzzed Burmese, Sprig Courier, A Sniff and Fresh Sprig fill the meter, The Whole Jar forces Surge (+2 Zoomies now and next turn, cap 10). Wired Siamese gets Frenzy on Surge. Crash then forces Naps: Comedown Colossus gets Rested 3 on top of the free 1 for the full +12 Stretch (Rested max 4), Crash Test Tom gets 6 Fluff, Soft Landing draws 2 on the Crash turn. Detox Tea is the escape hatch.

## Unresolved
- Too Small For This leaves its floor empty of blockers after it bounces. Intentional risk, but watch the Hidden and leak interaction on playtest.
- Tip the Glass total (2 per floor + 3 on landing floor) is generous if the floor is packed. Candidate to drop to 2.
- Unravel scales with Yarn on board (max 4 per pest, bosses half). Check against 8+ pest floors.
- Fur Factory depends on onTurnEnd resolving before the hand is discarded.
- Rarity pool: only 3 rares are engines for loop 1 and 2 respectively, so rare pity matters for these loops.

## NEEDS (engine, full detail in the file header)
- Triggers: onKnock (with once per turn), onKnockLand, onKnockedOff, onUnbox, onHairballCreated, onSurgeStart, onCrashStart.
- Effects: surge, endCrash, unbox, bounce. Params: box kind and sit, exhaustCard card filter and mode all, reduceCost filter targetsYarned, floorOf chosenEnemy.
- Targets: frontEnemyBelow.
- Counters: hairballsInHand, yarnOnBoard, yarnOnTarget. Checks: surging, crashing, targetHasStatus:<id>.
- Keyword fragile (toy). Aura entries with an "if" list.
- Statuses used: yarn, frenzy, rested, hairball (all from A04).
