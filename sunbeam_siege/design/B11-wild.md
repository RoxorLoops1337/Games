# B11 Wild and Night Enemies

File: src/data/enemies-wild.js, SB.data.enemiesWild, 16 regular pests, ids prefixed pest_.
HP is base; engine applies hpScale 1 + 0.05 per night. Threat is the A07 budget cost (Prowl A1 budget 12).

## Roster
| id | Act | Size | HP | Hook |
|---|---|---|---|---|
| crow | 1-2 | S | 5 | Climber flier, Murder: +1 per other crow |
| magpie | 1-2 | S | 6 | Pilfer steals 4 Fluff from front cat, wears it |
| raccoon | 1-3 | M | 11 | Rummage exiles top draw card, returns on death |
| fox | 2-3 | M | 9 | Sneaky; Snap 7 when a cat is at 3 HP or less |
| owl | 2-3 | M | 9 | Climber, Nocturnal, Costly, silent first intent |
| snake | 1-2 | M | 8 | Slippery, Coil then Bite + Dizzy 2 |
| flea | 1-3 | S | 3 | Parasite, 1 dmg ignoring Fluff, in packs |
| tick | 2-3 | S | 6 | Parasite, swells 1/2/3, Scratch costs 2 Zoomies |
| spider | 2-3 | M | 7 | Climber, Spin Web = Frazzled on strongest cat |
| hornet | 1-3 | S | 4 | Climber, pairs, 2x3 random stings, Alarm |
| goose | 1-2 | M | 12 | Heavy, Honk = Scared + grows |
| swan | 2-3 | L | 22 | Heavy, 4 Fluff, Wing Buffet hits the whole floor |
| hedgehog | 1-3 | M | 10 | Heavy, Bristle 2, Curl Up anchors it |
| tomcat | 2-3 | M | 12 | Costly, mirrors strongest cat's Attack and spec +1 |
| possum | 2-3 | M | 10 | Nocturnal, plays dead once, Eerie Grin |
| ghost mouse | 1-3 | S | 3 | Night Visitor, Sneaky Climber, Spectral |

## Rules coverage
- Fliers that ignore the hold rule: crow, magpie, owl, hornet, plus spider, flea, tick, ghost mouse. All carry Climber, so they attack then climb each round (A02 phase 6).
- Parasites (flea, tick): leave the floor list, latch on a cat, tick in Pest Attacks. Counter by tapping the host and paying Zoomies (1 flea, 2 tick), Cleanse, or Purr aura 10 (fleas). They count as alive for the win check, so they cannot be ignored. A host that loses a life frees the parasite (flea hops on, tick returns to the Cellar back).
- Night Visitors (nightVisitor true): owl, spider, possum, ghost mouse. Nocturnal tag gives +2 Attack in a Witching Hour round. Ghost mouse is cheap (threat 1) so a 25 percent wave can be a pair or trio.
- Costly (cat killed loses 2 lives): owl and tomcat only.
- Rival that mirrors: tomcat copies Attack and floors/pick of the strongest cat on its floor, plus 1. It punishes a lone big hitter and rewards spreading power or using Knock/Yarn on it.

## Standout combos
- Hornet pair plus Murder crows: kill one hornet and the other speeds up. Use Sweep to kill both in one damage step.
- Magpie plus Fluff decks: it eats a Hearth wall; Bristle cats punish the Jab but not the Pilfer.
- Raccoon Rummage hits the draw pile, so killing it before it acts again gets your best card back at once.
- Hedgehog is a Knock sink (Heavy + Curl Anchored): use Shatter or Hairball, not melee, or accept Bristle damage.
- Possum plus Nap/Cuddle Pile: its Scared removes Purr and blocks attacks, strong vs support clans.
- Ghost Mice ignore half your normal damage, so Zoom (Witching Hour) and Hiss/Shatter are the natural answers.

## Unresolved (for the engine and encounter agents)
1. NEEDS list at the top of the data file: attach, snatch, steal action kinds; mirror dmg; spectral, playDead, silentWings, curl, murder, alarm passives; catHpAtMost and witchingHour conditions; frazzled applied outside Witching Hour.
2. Spectral needs a clear tooltip so players do not think their damage is broken. Suggest a ghost-tint and "Half damage (not Witching Hour)".
3. Parasite win-check softlock is avoided by the Scratch action; confirm UI can show a paw icon on the host to tap.
4. Tick prefers the strongest cat (hardest hitter taxed). Confirm this reads as fair, or switch to weakest.
5. Playtest Fox Snap (7) against 3 HP cats in Act 2; it may be too lethal without a Hidden or Box answer.
6. Habitat is a hint only (owl and spider prefer the Attic, which stretches the Hold rule's value in Act 3).
