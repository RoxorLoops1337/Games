# THE THREAD: new core combat rule (council memo, game designer; picked by the lead)

Pitch: your hand is a suture line. Chain cards that overlap in school, then CUT the line at the right moment to cash it in. Grafts already carry schools, so every graft on a card becomes a bridge between schools; deck composition and play order both matter.

## Rules (combat state `c.seam = { set, counts, len, cuts, tied }`)
- SCHOOL SET of a card = base `school` + every live AND fused graft school. Junk and bare neutral cards have an empty set.
- EXTEND: a card whose set shares a school with the previous card's set joins the Line: `len` +1 and each of its schools gets +1 count. Bridge cards (two or more schools) can pivot the Line.
- SLACK: a card with an empty set changes nothing.
- CUT: a card with a set but NO overlap cashes the current Line, then starts a new one with len 1. Tempered cards (any fused graft) are TIED: they act as Slack instead of cutting.
- PAYOUT: S = min(len, 5) - 1 stitches, paid in the top-count school. If a second school has count >= 2 it also pays floor(S/2). Per stitch:
  Ember 3 Burn to all enemies | Echo 1 Echo per 2 stitches rounded up | Hoard draw 1 per 2 stitches (max 3 per turn) and retain 1 card | Blood heal 2 | Rust Block 3 plus 2 pierce damage per junk in hand to a random enemy | Static 1 Charge (max 6 per turn) plus 2 pierce damage to a random enemy | Gilded 2 gold (max 20 per combat) plus 2 Block. Charge itself now adds 1 to every hit you deal per 2 stored (max +3).
- Overload cards count as 2 knots. Replays and Echo count once. A JAMMED card is Frayed and acts as Slack.
- Turn end: an unfinished Line cashes at S-1. Turn start resets the Line unless it is Tied.
- Strain: Tithed cards are bare so use base school only and make good Slack filler.
- HARD CAPS: len 5; 3 cuts per turn (later cuts pay nothing); no energy payouts; existing caps on draw, plays and statuses.
- Resonance tie-in: tier 3 of a school gives +1 stitch for that school's payout, tier 6 makes its cuts pay twice (use the existing `T(c, school)` tier lookup).

## UI
A THREAD RAIL above the hand shows school glyphs as knots with a needle at the end and a payout preview floating beside it. Each hand card gets a small badge: needle = "extends", scissors = "cuts". Tooltip: "Share a school with the last card to tie a knot. Break the line to cash it in." Shape glyphs keep it readable for colourblind players.

## Content
CARDS: Cross-Stitch (1, attack): 6 damage +2 per knot. Snip (0, attack): 4 damage then cut the Line. Tie Off (1, skill): 5 block, the Line is Tied and carries over at full value. Basting (0, skill, exhaust): draw 1, counts as the Line's school once per turn. Unpick (1, skill): remove the last knot and draw 1. Tapestry (2, rare power): the first cut each turn pays twice.
GRAFTS: Barbed Knot (blood w1): extending adds 1 Bleed per knot; price lose 1 HP. Slip Knot (static w1): never cuts, goes Slack; price 15% jam. Pilot Knot (hoard w1): +2 numbers per knot; price -25% numbers when it opens a Line. Clove Hitch (rust w2): counts as 2 knots; price adds a Clot to the discard. Scissor Loop (ember w2): when it cuts, 3 damage per knot to all; price exhaust. Reef Knot (echo w2): its payout repeats once at half; price cost +1. Surgeon's Knot (gilded w2): cuts also pay 3 gold per stitch; price costs 3 gold to play. Granny Knot (weird, rust w1): counts as every school but adds no count; price -25% numbers.
RELICS: Spool: len cap 6. Locking Forceps: first Line each combat is Tied. Bobbin: first cut each turn draws 1.
HERO PASSIVES: Marrow: Blood cuts heal an extra 1 per stitch. Wick: each extend lights 1 Burn on a random enemy. Odile: once per turn she may declare a card Gilded.

## Enemies (hooks `on.seamExtend`, `on.seamCut`, `on.seamPay`)
Knitter: heals 3 per extend and takes +50% from cuts. Scissor Nurse: +2 block per cut, and a Line of 4+ is snipped to 0 with no payout. Ferric Warden: shows an Allergy glyph each turn; cards of that school go Slack. Locksmith: seals your biggest school (first card of it each turn is Frayed). Surge Tick: takes 2 x len from Static extends, no other defence. Tax Collector: steals 5 gold when a Gilded cut pays. Grafter (boss): mirrors your last payout school on itself.

## Engine sketch
cards.js: add `schoolsOf(spec)`. combat.js: `newCombat` init `c.seam`; `playCard` calls `seamStep(c, card, spec)` after the energy spend and BEFORE runFx so a card's own effects can read `knots`; `readSrc` adds `knots`; `endTurn` calls `seamEnd` before `fire('turnEnd')`; `startPlayerTurn` calls `seamTurnStart`. Payouts live in engine/seam.js. Events for the UI: seamExtend, seamCut, seamSlack, seamFray, seamPay.
Open decision (made by lead): Tied/Tempered cards as the reliable bridge is a real reward for Temper; keep it, balance later.
