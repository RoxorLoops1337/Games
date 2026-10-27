# HOW TO PLAY
*Hold the house. Keep the light. Knock things off shelves.*

Open `index.html` in any modern browser, no install, no network. Phones work in portrait. Your progress saves by itself.

**The idea.** Mice, dogs and household horrors come in through the house at night. Your cats stand in the way. The Sunbeam in the Attic is your Warmth: if it goes cold, the night is lost. Survive nine nights and the Sunbeam holds.

**One round, start to finish**
1. You draw cards and get Zoomies (3 a turn). Cards cost Zoomies. Unspent ones evaporate, so spend them.
2. Play cats onto a floor (Attic, Parlor or Cellar). A cat in the way is a wall: pests have to get past it.
3. Play spells and toys to hurt pests, protect cats or set something up.
4. Press End Turn. Your cats strike first, front to back, floor by floor. Then the pests act, and the little icons above them told you exactly what they will do.
5. Cats that run out of health spend a Life and come back via your discard pile. When the last Life goes, the card is gone for the run. Health refills after every fight. Lives do not.

**Between fights.** Pick a card reward, spend Fish at Gerald's bazaar, scratch a card sharper at a Post, nap at a Nook, open a cardboard box, or trust an Event. The map shows what is ahead, so choose a route you can afford.

**Naps and the Witching Hour.** A cat can Nap instead of attacking (not on the turn it arrives), which sets up Rested and Stretch. Every third round is a Witching Hour: more Zoomies and cards, every awake cat Zooms for a free hit, and then everyone who Zoomed is Frazzled next round.

**Keys**
- 1 to 9 pick a card, arrows pick a target, Enter or Space confirms
- E ends the turn (Space does too when no card is picked)
- N naps the focused cat, A uses the first available ability, K opens Keep mode
- D and X open the draw and discard piles, L the battle log
- Esc cancels, then opens the pause menu, ? shows this list in game
- Off the battlefield, D opens your deck and M the map
- On a phone: tap a card, tap a target, long press for the details. Left-handed layout is in Settings.

**Clan hints (loops to look for)**
- *Alley Tabbies* hit first and pay in Lives. Stack Claws, chain Pounces, spend a Life on purpose to get Cornered (+2 Attack at your last Life).
- *Hearthpaws* do nothing on purpose and get paid for it. Fluff and Purr keep everyone alive, Rested stacks up, and Stretch turns patience into damage. Long fights favour you.
- *Moonwhiskers* treat dying as income. Bank Lives, mark prey, and let the Witching Hour pay you twice.
- *Mischief* is chaos with a plan: Knock things off shelves, hide in boxes, tangle Yarn, and let Crash and Hairballs do the damage you did not quite aim.

Stuck? Settings has a replay for each tutorial lesson, and the Elder Cat will pretend she was not waiting.

---

# SUNBEAM SIEGE: where we are
Open index.html in a browser (or serve the folder). Read design/RULES.md and design/API.md first.
Tests: node tests/*.js (run-tests, run-layer-tests, boss-test, pest-test, encounter-test, cards-*-test, neutral-relics-test, champions-upgrades-test, coverage).
New engine ops go in src/engine/ops-*.js (auto-loaded). Browser scripts: demo/playthrough.js, demo/battle-edge.js (serve with python3 -m http.server 8123).
Status: complete and playable, title to victory. Balance tuned with a bot (field about 33 percent at Rank 0, tests/balance-sim.js). Ideas for next: human playtest feedback, listen-check of audio, more tuning from real play.
