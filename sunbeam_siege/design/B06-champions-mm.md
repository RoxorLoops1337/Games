# B06: Moon and Mischief Champions

Data: `src/data/champions-mm.js` (`SB.data.championsMM`, 4 champions, 36 tier options). Slots unlock at Nights 2, 5, 8. Each slot offers a, b, c. The letter is the path, so slot 1 fixes it (A06 rule). Patches are additive (see NEEDS block at the top of the file for the new triggers, effects and statuses the engine must add).

## Moonwhiskers

### Oswin Ledgerpaw, Auditor of the Ninth Hour (lives engine)
"Let us go over the books." A pawn shop bookkeeper fired for honesty about exchange rates. Base: Overdraft, free once per turn, a cat spends a Life for Fluff 3 and 1 Zoomies.
- **A The Liquidator** (spender, the run-ender): every Life spent deals 3, then Going Out of Business doubles Overdraft, then **The Final Tally**: Cash Out once per fight, every cat spends all Lives but 1, 5 damage to every pest per Life. A 9-life Oswin plus four 3-life cats is 17 Lives, so 85 to everything, plus 51 from Liquidation Sale triggers. It ends a boss fight and drains the run. Fantasy: a man closing a business with a flamethrower.
- **B The Broker** (recycler): dying cats return to hand cheaper, then draw and Zoomies, then **Ledger of Returns**: first death each turn is free, returning cats cost 0 and gain +1 Power forever. Fantasy: a revolving door of the same four cats getting stronger every time they die.
- **C The Brinkman** (cornered lord): cats at 1 Life hit harder and gain Fluff, then Frenzy and cards, then **Bargain at the Brink**: Oswin pays a Life so a cat survives its last one, once per cat per fight. Fantasy: everyone lives on the edge and the accountant signs for it.

### Lord Tuppence Mistfur, Resident Ghost (ghostly tank)
"I am dead, not unavailable." Died in 1887, never left. Base: Ethereal 1 per turn (next hit deals 0), 16 Health.
- **A The Cold Spot**: Hiss, then Yarn and Marked on the front pest, then **Dead Calm**: pests on his floor lose Attack every turn and are Banished at 0. Fantasy: a floor where nothing is allowed to happen.
- **B The Poltergeist**: prevented hits cost the attacker Shatter, then Marked, then **The House Remembers**: Ethereal 2 per turn, and every prevented hit is thrown back at every pest for that much. Bosses hit hardest, so they pay most. Fantasy: take the big hit, return it to the whole house.
- **C The Haunted House**: Ethereal shared on his floor, then +4 Health and Fluff, then **Open House**: all cats get Ethereal, and Tuppence spends the Life when another cat would. Fantasy: the whole team under one roof, rent paid in his lives.

## Mischief

### Professor Tumble Ledgeworth, Doctor of Gravity (Knock It Off)
"It was already falling." 40,213 trials, a sample size of one cat. Base: attacks Knock 1, grows when pests land.
- **A The Avalanche**: bigger pile-ups, then chain Knocks, then **The Great Shelf Sweep**: a free Knock of a whole floor each turn plus 4 extra pile-up Shatter. Fantasy: a waterfall of furniture with a clipboard.
- **B The Landlord**: cat flap exits cost Shatter and return Yarned, then give Zoomies, cards and Warmth, then **Eviction Notice**: exiled pests are removed for good, with Fish. Fantasy: the pest queue shrinking while the coffers grow. Bosses exempt.
- **C The Anvil**: +Power from landings, Claws from landings, then **Mass Times Acceleration**: every landing takes Shatter equal to his Power, Knock grows at 6 and 12 Power. Fantasy: one very round cat, dropped from a great height.

### Parcel Pennywhistle, Out for Delivery (Boxes, Yarn, Nip)
"It is a box if I am in it." One box ordered in 2021, a subscription nobody remembers. Base: sits in her own Box, attacks give Nip and Yarn.
- **A The Box Hotel**: free Boxes, Box flatten explosions that rebuild the Box, then **Fulfilment Centre**: 3 Boxes per floor, boxed cats get +3 and strike again at end of turn while Hidden. Fantasy: a warehouse of cats mailing themselves at the enemy.
- **B The Yarn Spinner**: Yarn ticks as damage, Yarned pests take +3 and spread Yarn on death, then **The Whole Sweater**: Yarn on every floor every turn, burst equal to the floor's total Yarn. Fantasy: the whole room knitted into one big violent knot.
- **C The Nip Dealer**: 2 free Nip a turn, Crash defanged, then **Wired for Sound**: Surge at 7, 3 Zoomies, Nip keeps filling, 1 turn Crash. Fantasy: the party never stops, and nobody asks who turned off the lights.

## Unresolved
- Cash Out (Oswin 3A) and The House Remembers (Tuppence 3B) need damage caps; suggested 150 and 40 per hit.
- Fulfilment Centre second strike could be too strong with Hidden spam; consider mult 0.5.
- Tuppence 3A Banish skips bosses, which is intended.
- Slot 2 and 3 options assume the slot 1 letter. Wanderlust Collar mixing is safe because patches are additive, but a few options (Parcel 2A on a non-Box path) would be weak.
