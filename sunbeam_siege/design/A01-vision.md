# A01 VISION: Creative Director

## 1. Title

**Final title: SUNBEAM SIEGE**
Subtitle used on the title screen: *Nine Lives to Hold the House*

Why: it says the genre (siege, lane defense) and the fantasy (the Sunbeam) in two words, it is easy to type into a search bar, and it has no trademark neighbors that we know of. "Nine Lives" stays as the signature mechanic and the run structure, not the name, because a hundred games already own that phrase.

Alternates:
1. **Clowder Keep** (best if we want a heavier fantasy feel)
2. **The Long Nap War** (best for a dry, comic store page)
3. **Nine Nights on the Cushion** (best if we want the run structure in the title)

Working folder name stays `nine-lives`. In code, the global namespace is `SB`.

## 2. Tagline and elevator pitch

**Tagline:** *Hold the house. Keep the light. Knock things off shelves.*

Short tagline for the title screen footer: *Some cats nap. Some cats defend.*

**Elevator pitch (60 words):**
Sunbeam Siege is a deck-building roguelike about a clowder of cats holding a three-floor house against nine nights of mice, dogs and household horrors. You draft cats, naps, boxes and bad ideas, stack them into a ridiculous engine, and spend your cats' nine lives like currency. Every run ends with you saying "wait, that actually works."

## 3. The five pillars, sharpened

Each pillar gets a test: a question the team asks of every card, relic, enemy and screen.

1. **One more night.**
   Test: "Does this card, relic or event create a decision that could grow into a loop?" Every run must offer at least 3 pieces that combine, visibly, by act 2. A run with no found loop is a design failure, so the reward draft must bias toward synergy: after the first two picks, at least 1 of 3 offered cards must share a keyword or tag with something already in the deck. The fastest run is about 25 minutes, the first loop should click by Night 3, and the "oh no, this is broken" feeling should arrive by Night 6.

2. **Cats, wholeheartedly.**
   Test: "Name the cat behavior." If a mechanic cannot be described as something a real cat does, it is cut or renamed. Allowed behaviors: nap, knock off, box, knead, purr, hairball, pounce, hunt, zoomies, yarn, ignore you, stare at nothing. Not allowed: generic fantasy verbs. A cat does not "cast Fireball". A cat coughs up a hairball and it is somehow worse.

3. **Stacking everywhere.**
   Test: "What grows, and how does the player see it grow?" Two layers must exist on every card family: in-fight stacks (Purr, Rested, Tangle, Hairball counts) and run-long stacks (card upgrades, champion branches, Lives, relic counters). If it does not grow, it is a filler card and must be cheap or have a tag that makes it fuel.

4. **Readable at a glance.**
   Test: "Can a tired person on a phone in portrait mode tell what will happen next?" Three floors, three lanes, one number per enemy for damage, one icon for intent. No tooltip needed for the basics. Keyword names are one word. No card text longer than 3 lines at 14px. Any effect that needs more than that gets a keyword, and the keyword gets a long-press tooltip.

5. **Charming and a bit dry.**
   Test: "Would a deadpan butler say this?" Jokes come from understatement, never from exclamation marks. Flavor is one line. UI text is plain and slightly put-upon. No em dashes anywhere in the game, in the docs, or in the code comments.

## 4. The "found a loop" fantasy

The game is sold on the moment a player realizes their deck has become a machine. Below are six target loops. Card names are placeholders for other agents to use or improve, but the mechanics are the intended shape. Loops must be assemblable from 3 to 5 pieces within a normal run, and none may be a guaranteed infinite win. They must break fights, not the game, and every one needs a natural counter in the enemy roster.

### Loop 1: The Eternal Nap (Hearthpaws, with a Moonwhiskers side)
Play **Sleepy Calico** (0 cost, gains Rested each turn it does not attack) and **Warm Lap**, which converts every point of Rested on a floor into Purr. Add the relic **Hot Water Bottle**, which makes Purr heal the Sunbeam when it exceeds 10 on any floor. The Attic never attacks, it just sleeps, and the Sunbeam heals 4 a turn while the Cellar holds with a wall of Rested Tabbies. The punchline is that the best defender is the one that does nothing, and the player has to deliberately refuse to play their attack cards.

### Loop 2: The Shelf Cascade (Mischief with Alley Tabbies)
Play **Paw on the Vase** (push an enemy down a floor, Shatter 4 on landing). Pair it with **Gravity Enthusiast**, a cat that gets +1 Shatter each time any enemy lands on a lower floor this turn, and the spell **Domino Shelf**, which pushes every enemy on a floor down one floor. Enemies already on the Cellar get pushed off the bottom and take double Shatter. A packed Parlor becomes a waterfall of damage, and the enemy wave spends the whole night climbing the same stairs. The joke is that the player has made the house physically unwinnable for the dogs.

### Loop 3: The Box Hotel (Mischief with Hearthpaws)
Play **Cardboard Annex**, a room that places a free Box on each floor at the start of the turn. Units in a Box are hidden for one turn and gain +2 Purr. Add **Too Small For This**, a cat that triples its attack while in a Box and returns to hand at end of turn (a cat who fits in a box that does not fit it). Add the relic **Amazon Prime**, which makes Boxes persist. Each turn the player bounces cats into boxes, hits for tripled damage from hiding, and ends with an invulnerable board. The fantasy is the Box as a tactical pocket dimension.

### Loop 4: Lives Banking (Moonwhiskers)
Play **Ninth Sibling**, which turns any life spent on a cat into 3 Spirit (a spendable token), and **Séance Saucer**, which spends 2 Spirit to return a dead cat to hand with one more life than it had. Add **Graveyard Shift**, a relic that gives 1 Zoomies whenever a cat spends its last life. The player begins deliberately sacrificing cats one by one, pumping a Spirit economy, and drawing a 12-card hand of cats that were technically dead. The run is a heist against the game's own death rules, and it ends with a champion at 9 lives, all of them used.

### Loop 5: The Hairball Engine (Alley Tabbies with Mischief)
Play **Cough It Up** (create a Hairball in hand, costs 0), **Hairball Appreciator** (gain 1 Rage per Hairball in hand or discard), and **Spit Take**, which throws every Hairball in hand for 3 damage each to a random enemy and exhausts them. A deck of 8 Hairball makers becomes a Gatling gun with a stomach problem. The relic **Fur Collar** doubles Hairball damage after the 3rd one thrown in a turn. This loop wins fast and ugly, and it is the one the player screenshots.

### Loop 6: Yarn Chain (Mischief with Moonwhiskers)
Play **Loose Thread** (Tangle an enemy, 1 energy), **Cat's Cradle** (every card played that turn that targets a Tangled enemy costs 1 less, minimum 0), and **Unravel**, which deals damage equal to the total Tangle on the whole board and then spreads it. A single enemy with 6 Tangle becomes a hub, the player plays six 0-cost cards in a row, and the Tangle count climbs after every one. At the end the entire floor is bound in one grey knot and exploded with a single spell. The joke is that no cat in this deck has ever actually been seen to knit.

## 5. Tone guide

**Voice:** a dry, slightly put-upon house butler narrating a very small war. Warm underneath. Never mean to the cats, never mean to the player. The enemies are allowed to be pompous.

**Rules of tone:**
- Understatement beats exclamation. One exclamation mark per screen, maximum, and only on a victory.
- No em dashes. Use commas, periods or colons. Hyphens inside compound words are fine.
- Puns allowed when they are earned and short. "Purrfect" is banned. "Claw-some" is banned. "Fur real" is banned. If a pun is on a mug in a gift shop, we do not use it.
- Name things plainly first, funny second. A mechanic name must be understandable before it is clever.
- Cats are never "cute" in the text. They are competent, and the cuteness comes from the art.
- The sunbeam is treated with religious seriousness.

**Example UI text:**
- Start run button: `Begin the Night`
- End turn button: `End Turn` (second line, small: `Cats will do what they like.`)
- Draw pile label: `Pile of Intentions`
- Discard label: `Things Already Done`
- Exhaust label: `Forgotten Entirely`
- Energy label: `Zoomies`
- Health label: `Sunbeam Warmth`
- Victory banner: `The Sunbeam holds. Everyone has opinions about it.`
- Defeat banner: `The Sunbeam has gone out. Somewhere, a cushion is cold.`
- Rest nook: `Curl up. Heal 30% of Warmth. Or knead something and upgrade a card.`
- Shop greeting: `A raccoon has set up a stall. He insists this is legal.`
- Empty hand: `Nothing in hand. Very restful.`
- Not enough energy toast: `Too tired to try that.`
- Confirm card removal: `Remove this card? It will be missed, mostly by itself.`
- Mischief Rank header: `How Much Trouble Do You Want?`
- Settings, sound mute: `Hush`
- Loading line: `Finding the warm spot...`

**Example flavor text (cards):**
- Alley Tabby, *Back Fence Brawler*: "He has never won a fight. He has never lost one on purpose."
- Hearthpaw, *Sleepy Calico*: "Contributes by existing, loudly, in the best chair."
- Moonwhisker, *Ninth Sibling*: "Eight brothers and sisters are very proud of her."
- Mischief, *Paw on the Vase*: "Eye contact was maintained throughout."
- Mischief, *Cardboard Annex*: "It was a perfectly good living room before the delivery."
- Hairball, *Cough It Up*: "It is not an accident. It is a statement."
- Spell, *Slow Blink*: "Trust, delivered at one frame per second."

**Example enemy flavor:**
- Mouse, *Pantry Raider*: "Is mostly here for the cheese. Has been told this is not a cheese house."
- Dog, *Retriever, Enthusiastic*: "Fetching things is a personality. Returning them is not."
- Horror, *The Vacuum*: "It does not hate you. It does not know you exist. That is worse."
- Horror, *Vet Carrier*: "The door is open. This is how it begins."
- Horror, *Spray Bottle*: "One squirt and a lifetime of grudges."
- Horror, *Cucumber*: "It was just there. Behind you. Quietly."
- Boss, *The Laser Dot*: "Cannot be caught. Has never been caught. The mice have started a pool."

**Example event text:**
- *The Closed Door*: "A door has been closed between you and the kitchen. You were not consulted. Meow at it (lose 5 Warmth, gain a relic), or wait (heal 8)."
- *Mysterious Parcel*: "A box arrived. It is, objectively, too small. You are going in anyway."

## 6. What we deliberately do NOT do

1. **No fantasy-RPG skin on cats.** No wizards, no swords, no mana, no dragons. A cat has claws and a bad attitude. That is the loadout.
2. **No gore and no cruelty.** Cats never die onscreen in a way that is sad. They "go for a lie down" and may return. Enemies "flee", "get distracted" or "fall off". Pests are comic, not grotesque.
3. **No em dashes, no corporate cheer.** No "Awesome!" popups, no "Congrats, champ!" copy.
4. **No pay-to-anything.** No ads, no currency tied to money, no timers that gate play. Single player, offline, free.
5. **No RNG that deletes a run without warning.** Telegraphed enemy intents always. Random effects are visible on the card as random. The Witching Hour is announced a turn early.
6. **No unreadable stat soup.** No card has more than 2 keywords plus one conditional. If a design needs a third keyword, split the card.
7. **No mandatory tutorial wall.** The first fight teaches by doing: three cards, one enemy, one floor. Advanced rules unlock through play, with a skippable Cat Handbook.
8. **No dead turns.** A turn with nothing to do is an Empty Hand, and it still gives something (Nap, see below). Boredom is the enemy.
9. **No pure damage races.** Every elite and boss must punish one-note decks (a shield, a heal, a mid-fight rule change) so a loop must adapt, not just scale.
10. **No more than 6 core keywords to learn in act 1.** Everything else appears later and is explained in place.
11. **No Creative Europe or other funding references** in any in-game credits or meta text. (Project constraint, not a design choice.)
12. **No cheap nostalgia pastiche.** We borrow principles from lane-defense deckbuilders. We do not borrow their names, art or exact keywords.

## 7. The four clans (identity, one line each)

| Clan | Identity | Color | Signature keywords | Playstyle in one sentence |
|---|---|---|---|---|
| **Alley Tabbies** | Aggressive scrappers who win by hitting first and hitting often. | Rust orange and soot grey | Rage, Pounce, Scrap | Stack Rage on frontline cats and trade lives for tempo. |
| **Hearthpaws** | Cozy healers and nappers who win by outlasting the night. | Cream and warm amber | Purr, Rested, Cuddle | Do nothing on purpose and be rewarded for it. |
| **Moonwhiskers** | Mystic spirit cats tied to the Nine Lives system, who win by spending death as a resource. | Indigo and pale silver | Spirit, Lives, Haunt | Die deliberately, return stronger, bank the difference. |
| **Mischief** | Chaos agents of knock-offs and boxes, who win by moving things where they should not be. | Hot pink and cardboard brown | Knock, Box, Yarn, Hairball | Rearrange the board until the enemy loses. |

Run structure: one main clan (about 70% of draft offers) and one side clan (about 30%). Neutral cards (house cats of no loyalty) fill the remaining slots and are intentionally weak but flexible.

## 8. Verdict on every candidate twist

Legend: KEEP as designed, CHANGE (keep core, modify), CUT.

| Twist | Verdict | Reason |
|---|---|---|
| **NINE LIVES** | **KEEP, and make it the spine** | It is the title mechanic and the one that justifies the whole game. Lives pips on every cat. Rules locked here: a cat starts with 1 to 3 lives by rarity (common 2, uncommon 2, rare 3, champion 3 and upgradeable to 9). On death it spends 1 life and returns to the discard pile with a permanent in-run modifier chosen by its clan (Tabbies: +1 attack, Hearthpaws: +2 Purr, Moonwhiskers: +1 Spirit gain, Mischief: gains Box affinity). At 0 lives it is gone for the run unless a card revives it. "Weaker instead of stronger" is rejected as a default: loss is the story of the Sunbeam, and the fun is that dying is progress. The trade side: a rest nook can spend a life for a card upgrade. |
| **KNOCK IT OFF** | **KEEP** | The most original verticality idea we have, and it makes the 3-floor structure matter. Locked rule: a Knock pushes an enemy down one floor, and the enemy takes Shatter damage equal to the Knock value. Enemies pushed off the bottom return to the spawn queue next turn, not lost. Bosses resist (Knock only delays them half a floor, shown as a slowed tick). Caps: no more than 3 Knock sources can be on one floor per turn, to prevent infinite stalls. |
| **BOXES** | **CHANGE** | Good fantasy, too much text as written. Simplified: a Box is a tile slot on a floor (max 2 per floor). A cat in a Box is Hidden: cannot be targeted by single-target enemy attacks, ignores Spray Bottle, gains a clan bonus listed on the Box card. Hidden ends after one turn of the cat attacking. We drop the "one turn" timer in favor of "until it attacks," which reads faster and feels more feline. Boxes are a Mischief signature but one neutral Box card exists for everyone. |
| **THE NIGHT CLOCK / 3AM ZOOMIES** | **CHANGE** | Keep the rhythm, remove the randomness that frustrates. Rename the special turn **The Witching Hour** (Zoomies is already the energy name, two meanings would confuse a phone user). It happens on every 3rd turn, announced one turn early with a clock icon. During it: +2 Zoomies, all cats on a floor each gain 1 free action, but the player cannot choose which enemy is hit first (target is Chaotic, a cat picks). Chaos is bounded: the player picks the floor, the cats pick the target. The clock itself is the dramatic beat that bosses are tied to. |
| **NAP** | **KEEP, and promote to a core keyword** | This is the Hearthpaw soul and gives the empty hand a purpose. Rule: a cat that did not act during your turn gains Rested +1 at end of turn. Rested spends on the cat's next action for +2 damage or +2 block per stack, and it decays 1 per turn if not spent after reaching 5 (naps can run out; cats get restless). Any player can Nap a cat with a neutral 0-cost card. Napping is the safety valve for the Empty Hand. |
| **CUDDLE PILE** | **CHANGE** | Adjacent cats on the same floor connect; we simplify to a visible count: **Pile = number of friendly cats on that floor.** Piles of 2, 3 and 4 give Hearthpaws and neutral bonuses (+1 block per cat in pile at 3 or more). Pile does not need adjacency graphs, because the floor holds a maximum of 4 cats and positions are not meaningful on a phone. Pile counts hide in plain sight on the floor header. This makes it a Hearthpaw engine that Alley Tabbies can splash as a defensive floor. |
| **CATNIP SURGE** | **CUT as a separate resource, FOLD into a Mischief status** | A burst-and-crash second resource is another bar on a small screen and competes with Zoomies. We keep the feeling as a status called **Buzzed**: +3 attack, +1 Zoomies on the next turn, then **Crash** (cat acts at -2 attack and cannot be targeted by buffs). It stays on a handful of Mischief cards and one rare relic. It is allowed to be dangerous. The crash gets a cartoonish sound effect. |
| **YARN** | **KEEP** | Easy to read, easy to chain, a perfect "kinda dumb but works" engine. Locked as a stackable enemy debuff called **Tangle**: each stack reduces enemy movement chance and reduces damage by 1. At 5 Tangle the enemy is Bound, skips its next move, and Tangle halves. Yarn cards also have a **Chain** tag: a card played immediately after another Yarn card gets a bonus. Chains are the "loop" part. |
| **HAIRBALLS** | **KEEP** | The funniest mechanic on the list and the most mechanically flexible. Locked: Hairball is a 0-cost Exhaust card created by cats ("coughed up"). It deals 3 damage to a chosen enemy, or can be kept for deck-synergy payoffs. A deck may not create more than 6 Hairballs in hand at once (hand limit still 10). Hairballs are Alley Tabby and Mischief shared, with Moonwhiskers able to turn them into Spirit. |
| **PURR** | **CHANGE** | Keep Purr but make it a floor status instead of a unit stat. **Purr N** on a floor: at start of each turn, every friendly cat on it heals 1 and the floor gains +N/2 block (rounded down); then Purr decays by 1. Purr is generated by Hearthpaws and consumed by their payoff cards. This makes Purr visible in one place (the floor header), makes it stackable and stealable by enemies (the Vacuum eats Purr), and does not duplicate Cuddle Pile. |

### Additional vision rulings (not in the brief)

- **The Sunbeam moves.** On Nights 3, 6 and 9 the Sunbeam shifts position on the cushion (cosmetic and a buff: the floor it lands on gains +2 Purr that night). A small poetic beat, trivial to implement, big for mood.
- **The Champion** is always a named character cat with 3 upgrade branches (offense, defense, chaos) and starts with 3 Lives. Champions are the face of the run and of the marketing.
- **Death is not game over per cat.** Lives pips are shown at the card bottom edge as nine tiny paw icons, with the cat's current lives lit.
- **Clan balance target:** each clan must support 3 distinct viable loops, and 2 cross-clan pairings must feel like real discoveries, not obvious ones.
- **The Pests** have four families: Mice (fast, swarm), Rats (armored, tanky), Dogs (loud, hit hard, break boxes), Horrors (rule-breakers, one per boss and elite). Dogs counter Boxes, Horrors counter whatever the player has been relying on.

## 9. Open questions for the lead

1. Should the Witching Hour happen every 3rd turn in every fight, or only in elites and bosses (cleaner for short normal fights)? Recommendation: every 3rd turn, but normal fights rarely run past turn 6.
2. Do we allow Lives to be traded at shops (a "Sell a life" option), or only at rest nooks? Recommendation: both, shop price scales up per life sold.
3. How many hand-drawn named Champions at launch? Recommendation: 2 per clan (8 total), 12 total after meta unlocks.
4. Is Mischief the only clan that can place Boxes, or do we let every clan buy one via a neutral card? Recommendation: neutral Box exists, Mischief gets the payoff.
5. Final title sign-off: Sunbeam Siege versus Clowder Keep. Recommendation: Sunbeam Siege.
