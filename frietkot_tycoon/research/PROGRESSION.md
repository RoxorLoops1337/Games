# Frietkot Tycoon — Expansion & Progression Design

> The grand arc: one frietkot in a sleepy Flemish town in 1994, all the way to
> golden-mayo-slinging fry embassies serving tentacled aliens across the galaxy.
> This doc defines the expansion ladder, the idle core, prestige, time model,
> currencies, the alien endgame, and pacing. It ends with an implementable tier
> table under **Game design hooks**.

---

## 0. Design pillars

1. **One thing scaled absurdly.** The whole game is "sell frietjes." Everything —
   districts, planets, aliens — is that same verb at a bigger number. This is the
   AdVenture Capitalist trick: a tiny, legible core loop wrapped in ever-grander
   window dressing (AdVenture Capitalist ships you from Earth to the Moon to Mars
   with the *same* buy-manager-upgrade loop the whole way). We steal the structure,
   swap the theme to Belgian fries.
2. **Belgian specificity is the flavor.** Real towns, BEF→EUR, *stoemp* and
   *stoofvlees*, the sacred double-fry, mayonnaise nationalism, *frituur* culture,
   Manneken-Pis merch. The comedy comes from treating fries with total reverence
   while the scale goes cosmic.
3. **Legible verticality.** At every tier the player should understand "I am now
   bigger, here is the new rule I have to respect." Pizza Tycoon's contribution to
   our DNA is the *management* texture — recipes you compose ingredient-by-
   ingredient, a city map of competing locations, reputation that matters — layered
   on top of the idle spine.
4. **Idle-first, tap-optional.** Passive income is the heartbeat; active play
   (recipe tuning, event choices, prestige timing) is the skill expression.

---

## 1. The Expansion Ladder

Twelve tiers, grouped into four **Acts**. Each tier defines: **Unlock**, **What
changes** (customers / currency / ingredients / rules), and **Dwell time** (how long
a normally-engaged idle player lingers before the next tier is the obvious buy).

Dwell times assume a session-y idle player (a few check-ins per day). They compress
hard for whales/active players and stretch for pure-idle players — that's fine, the
prestige layer re-paces everyone (see §3).

### ACT I — "De Frituur" (Local Belgium)

**Tier 1 — The Frietkot (single stall).** *Rikkewiet aan de Leie*, a fictional
small Flemish town, autumn 1994.
- **Unlock:** New game.
- **Changes:** One fry stall. One fryer, one sauce (mayonnaise, obviously), one meat
  snack (*frikandel*). Customers are locals: workers on lunch break, kids after
  school. Currency **BEF**. Core loop taught here: buy potatoes → fry → sell → buy a
  second fryer.
- **Dwell:** ~30–45 min. This is the tutorial tier; it should feel *cozy and small*.

**Tier 2 — The District (*de wijk*).** You now own the corner; expand down the street.
- **Unlock:** Buy out the second fryer + first *frituuruitbater* manager (first taste
  of automation, see §2).
- **Changes:** 3–5 stalls in one neighborhood. Menu widens: *bicky burger*,
  *cervela*, *stoofvlees* (beef stew) as a premium sauce-meat. Introduce
  **reputation** (per-district) and **rush hours** (Friday-night footballmatch spike).
  Competing local *frituur* appears — first soft rivalry.
- **Dwell:** ~1–2 hours.

**Tier 3 — The City.** Absorb the whole town, then it's a proper city (map view like
Pizza Tycoon's city grid).
- **Unlock:** Reputation ≥ threshold + buy the *stadsvergunning* (city permit).
- **Changes:** A **map** of 8–12 locations with rent/footfall tradeoffs (student
  quarter = volume, market square = margin). New ingredient axis: **potato variety**
  (Bintje vs. cheap import) affecting quality. First **historical event** lands:
  *the 1998 dioxin crisis / mad-cov food-safety scare* as a downturn event you manage.
- **Dwell:** ~3–5 hours. First real "management" tier.

### ACT II — "Nationaal & Internationaal" (Belgium → Europe)

**Tier 4 — Belgian Cities.** Antwerp, Ghent, Brussels, Charleroi, Liège.
- **Unlock:** Own N cities' worth of reputation + capital.
- **Changes:** **Regional taste profiles** — Flanders loves *mayo/stoofvlees*,
  Wallonia leans *sauce andalouse/mitraillette*, Brussels is cosmopolitan (everything,
  pricier). Language flavor text (NL/FR) as a gag. **The euro changeover (2002)**
  fires here: currency migrates BEF→EUR mid-tier (see §5) — a genuine, once-per-game
  shock event.
- **Dwell:** ~6–10 hours.

**Tier 5 — Neighboring Countries.** Netherlands, France, Germany, Luxembourg.
- **Unlock:** National market saturation + an export license.
- **Changes:** Each country is a **sub-currency + taste war**:
  - 🇳🇱 Netherlands: *patatje oorlog*, frietsaus (their "mayo" is sweeter — Belgians
    are offended), high volume.
  - 🇫🇷 France: they call them *frites* and claim they invented them (a running
    diplomatic incident); premium, snobbish, demands *pommes pont-neuf* cut.
  - 🇩🇪 Germany: *pommes rot-weiß* (ketchup+mayo), *currywurst* crossover meat.
  - 🇱🇺 Luxembourg: tiny market, absurd margins (tax haven joke).
  - New rule: **cross-border logistics** — potatoes/oil have shipping cost & spoilage.
- **Dwell:** ~10–15 hours. This is where the first prestige (§3) becomes attractive.

### ACT III — "De Wereld" (Global)

**Tier 6 — Continents.** Rest of Europe → Americas → Asia → Africa → Oceania.
- **Unlock:** First prestige completed (franchise-out) OR huge capital gate.
- **Changes:** Continents unlock as **income multiplier zones** with a signature
  localization each (US = "freedom fries" / cheese-curd poutine crossover in Canada;
  Japan = ultra-precise *kobe-gravy* premium; India = masala-spiced, vegetarian-meat
  demand). Currency abstracts to a soft global unit (see §5). New rule: **franchise
  vs. owned** — you decide per-region whether to run it (higher income, needs
  managers) or license it (passive % cut, hands-off).
- **Dwell:** ~15–25 hours (multi-prestige territory).

**Tier 7 — Global Frituur Empire.** You are the McDonald's of frietjes.
- **Unlock:** All continents seeded.
- **Changes:** Meta-mechanics: **R&D tech tree** (auto-fryers, potato genetics,
  vacuum logistics), **brand HQ**, **sponsorships**, "Frietje of the Year" awards.
  Historical beats: 2008 crash (a downturn event), a food-influencer/social-media era
  boom (2010s virality mechanic). Prestige loop matures.
- **Dwell:** ~20–40 hours across multiple prestiges. This is the "late Earth" plateau.

### ACT IV — "De Ruimtefrituur" (Space → Aliens)

**Tier 8 — Orbit & The Moon.** The *Frietkot Ruimtestation* and Lunar Base *Frituur Luna*.
- **Unlock:** A **second prestige type** — "Golden Mayo" (space prestige, see §3) —
  plus a tech gate (build the *Aardappel-lift* space elevator).
- **Changes:** New physics-flavored rules: **low-gravity frying** (oil behaves
  weird — a fun minigame/modifier), **vacuum-sealed frietjes** for shelf life,
  customers are astronauts & space tourists (rich, few, huge margins). Currency
  becomes **Krebbels ₭** (sci-fi credits). Earth currencies convert into ₭ at
  prestige. This is the tonal pivot: still fries, now among the stars.
- **Dwell:** ~10–20 hours.

**Tier 9 — Mars & The Colonies.** Terraformed potato farms, red-dust Bintjes.
- **Unlock:** Krebbels threshold + "Martian Agriculture" tech.
- **Changes:** You now grow your own supply chain (Martian potato domes) — vertical
  integration mechanic. Colonist customers want *comfort food from Earth* (nostalgia
  premium). New ingredient: **regolith-salt**, **hydroponic frites**. First
  *non-human* customer cameo (a curious scout alien) foreshadows Act endgame.
- **Dwell:** ~15–25 hours.

**Tier 10 — The Solar System / Other Planets.** Europa ice-fry stands, Titan
methane-fryers (a running "please don't light it" gag), asteroid-belt food trucks.
- **Unlock:** Own Mars + interplanetary shipping tech.
- **Changes:** Each world is an **environment modifier** (temperature, gravity,
  atmosphere) that reshapes frying rules and demands exotic equipment. Currency stays
  ₭ but **planetary tariffs** add a logistics layer. Mixed human-colonist + early
  alien clientele.
- **Dwell:** ~20–30 hours.

**Tier 11 — Alien Civilizations.** First contact via fries. The galaxy discovers
the double-fry.
- **Unlock:** Third prestige — **"First Fry Contact"** — establish a Frietkot Embassy.
- **Changes:** Full alien customer economy (see §6): weird demands, exotic ingredients,
  new **Galactic currency** (see §5), diplomacy-flavored reputation ("Fry Accords").
  Multiple species, each a mini-market with bizarre rules.
- **Dwell:** ~30–50+ hours (deep endgame, prestige-driven).

**Tier 12 — The Galactic Frituur Federation (endgame / ascension).**
- **Unlock:** Serve N species + max galactic reputation.
- **Changes:** You become the **culinary standard of the galaxy**. Endless-scaling
  tier: a final prestige ("Ascend to Fry-God / the *Grote Frietzak in de Hemel*")
  that resets *everything* for a permanent galaxy-wide multiplier and cosmetic
  "New Game+ with aliens from turn one" bragging rights. Soft-infinite; leaderboards
  live here.
- **Dwell:** Indefinite (the retention engine).

---

## 2. Idle / Incremental Core

### 2.1 The frietjes-per-second (FPS) analog
The master rate is **Frietjes / second (FPS)** — bags of fries sold per second,
auto-converted to cash at the current sell price. Everything the player builds feeds
one number: **income/sec = Σ(location output × quality mult × reputation mult ×
region mult × prestige mult)**.

- **Active tap:** early game, tapping the fryer produces a batch instantly (the
  "click" of Cookie Clicker). Deliberately weak after Tier 2 so idle dominates.
- **Passive base:** each stall auto-produces at its FPS once staffed.

### 2.2 Producers (the "buildings")
Illustrative, AdVenture-Capitalist-style cost curve **cost(n) = base × 1.07ⁿ** with
each producer far pricier and far more productive than the last:

| Producer | Base cost | Base output | Flavor |
|---|---|---|---|
| Hand fryer | 4 BEF | 0.1 FPS | you, sweating |
| Twin fryer | 60 BEF | 1 FPS | second basket |
| Frietkot stall | 720 BEF | 8 FPS | a whole stall |
| Neighborhood frituur | 8.6k BEF | 47 FPS | a real shop |
| City chain node | 100k BEF | 260 FPS | franchise seed |
| National depot | 1.2M BEF | 1.4k FPS | logistics hub |
| …scales per tier… | ×~12 each | ×~5.5 each | up to alien fry-arrays |

The **×output / ×cost ratio (~5.5 / 12)** is what forces steady reinvestment and
makes prestige mathematically necessary to break plateaus.

### 2.3 Managers / automation — the *frituuruitbater*
Automation is themed as **hiring people to run your shops so you don't tap**:
- **Frituuruitbater (shop manager):** buy one per producer type → that producer
  auto-runs forever (removes the tap). This is AdVenture Capitalist's "manager" beat,
  reskinned. First one at Tier 2 is a huge dopamine unlock.
- **Auto-fryer (tech):** R&D upgrade that boosts a producer's cycle speed.
- **Regional director:** meta-manager that applies a % boost to *all* shops in a
  region and handles events while you're offline.
- **AI Fry-Core (space tiers):** automates entire planets; needed because you can't
  micromanage 40 worlds.

### 2.4 Upgrades (multiplicative curve)
Three upgrade families, each an *escalating multiplier*, not a flat add:
- **Efficiency** (×2, ×3, ×5… output per producer) — the workhorse.
- **Speed** (faster fry cycle / offline cap).
- **Quality** (better potatoes/oil/sauce → higher sell price *and* reputation).
Milestone upgrades ("own 25 stalls → all stalls ×2") echo Cookie Clicker's
achievement-linked boosts and keep buying *more* producers meaningful.

### 2.5 Offline earnings
Idle games live or die on the return-visit reward.
- **Offline accrual:** shops keep earning while closed, at a **capped rate**
  (start 50% of online FPS) for a **capped duration** (start 4h).
- **Both caps are upgradable** (Quality/tech tree, and prestige perks) — "night-shift
  fryer," "24h automat," eventually "always-on space station."
- **Welcome-back popup:** "While you were away, Belgium ate 4.2M frietjes — here's
  €X." Optional *watch-an-ad / spend-premium to double* hook if monetized.
- Offline is intentionally *worse* than active so the game rewards check-ins without
  punishing absence — the standard idle contract.

---

## 3. Prestige / Meta Layer

A themed **soft-reset** the player triggers voluntarily to earn a permanent
multiplier currency, à la Cookie Clicker's Heavenly Chips / prestige. Frietkot
Tycoon uses a **three-stage prestige ladder** so the mechanic re-skins as the scale
grows — each stage is unlocked by an Act boundary and resets *less* the higher you go.

### Stage 1 — "Franchise Out" (Earth prestige) 🍟
- **Hook:** You sell your whole operation to investors and franchise the brand.
- **Reset:** All cash, producers, and locations wipe.
- **Persists:** **Recipes** you've perfected, **base reputation**, unlocked tiers up
  to your peak, and the earned prestige currency.
- **Currency earned: Golden Frietzakjes (golden fry-bags) 🟡.** Amount ≈ f(lifetime
  earnings), e.g. **`bags = floor( (lifetime_BEF / 1e12) ^ 0.5 )`** — a square-root
  curve so each prestige needs meaningfully more than the last.
- **Effect:** each bag gives **+1–2% global FPS**, permanent, stacking. First
  franchise-out is offered around Tier 5; it makes the Act I–II replay *fast*.

### Stage 2 — "Golden Mayo" (Space prestige) 🥚✨
- **Unlock:** Reaching Orbit (Tier 8).
- **Hook:** Distill your empire's essence into a jar of legendary **Golden Mayo**,
  the sacred sauce that opens the stars.
- **Reset:** Wipes Earth-scale progress but **keeps all Golden Frietzakjes** — Stage 1
  currency becomes a *feeder* into Stage 2. Golden Mayo multiplies your Frietzakjes'
  effect.
- **Persists:** Tech tree nodes, recipes, space-tier unlocks.

### Stage 3 — "First Fry Contact / Ascension" (Galactic prestige) 🌌
- **Unlock:** Alien tiers (11–12).
- **Hook:** Ascend to become a galactic culinary legend; reset the *galaxy* for a
  permanent civilization-wide multiplier.
- **Persists:** Cosmetic legacy, leaderboard rank, a "start with aliens" NG+ boon.

**Why staged:** it keeps the *same* satisfying "reset for power" dopamine relevant
across a 100+ hour arc without a single currency's numbers going meaningless, and it
lets each Act have its own prestige identity. What **always** persists across every
prestige: **recipes, reputation floor, tier unlocks, cosmetics** — so a reset never
feels like true loss, only acceleration.

---

## 4. Time & Era Model

**Recommendation: Real-time idle heartbeat + a compressed "era clock."**

Three candidate models were considered:
- **Pure real-time idle** (Cookie Clicker): great for the incremental heartbeat, bad
  for landing 1990s→future *history*.
- **Day-turns / management sim** (Pizza Tycoon): great texture, too fiddly for idle
  pacing and offline play.
- **Year-jumps** (civ-style): lands history cleanly but breaks the moment-to-moment
  idle loop.

**Chosen hybrid:**
1. **Idle heartbeat is real-time.** FPS ticks in real seconds; offline earnings work
   as in §2.5. This is what makes it an idle game.
2. **The era clock advances by *progress*, not by wall-clock.** Reaching key
   milestones (tiers, prestiges, capital thresholds) advances an **in-world year**
   from **1994 forward**. So the *player's expansion* is what pulls history along —
   which guarantees historical events land at the thematically correct tier, not at
   some arbitrary real date.
3. **Era = a soft modifier layer.** Each era sets background music, UI skin, ambient
   prices, and which **event deck** is active.

**Era → tier mapping (so history lands right):**

| In-world era | Aligns with tiers | Signature event(s) |
|---|---|---|
| 1994–1999 (late 90s) | 1–3 | 1998 dioxin/food-safety scare (downturn) |
| 2000–2002 (euro run-up) | 3–4 | **BEF→EUR changeover (2002)** currency migration |
| 2002–2009 | 4–5 | eastward EU expansion (cheap-potato boom); 2008 crash |
| 2010–2019 | 6–7 | social-media virality boom; "artisan frites" trend |
| 2020–2029 | 7 | supply-shock / delivery-app era |
| 2030s–2050s | 8–9 | space race, first Moon/Mars bases |
| 2060s+ | 10–12 | interplanetary, first alien contact |

This model gives us the best of both: a living idle economy *and* a scripted comedic
history that always fires at the right power level.

---

## 5. Currencies

The currency arc mirrors the expansion ladder and interacts with prestige.

| Phase | Currency | Where | Notes |
|---|---|---|---|
| Local–National | **BEF (Belgische frank)** | Tiers 1–4 (pre-2002) | The nostalgic starting money. ~40 BEF ≈ €1. |
| The changeover | **BEF → EUR** | mid-Tier 4 (2002 event) | One-time conversion at **40.3399 BEF = €1** (the real fixed rate). Played as a *shock event*: prices "look" smaller, a tutorial explains the switch, a nostalgic "goodbye franc" beat. |
| National–European | **EUR** | Tiers 4–5 | Main Earth currency post-2002. |
| Foreign markets | **Local currencies** (guilder-gag/€, £-ish, etc.) | Tier 5 | Each foreign country trades in a **soft sub-currency** with a fluctuating **exchange rate** → a light forex/logistics minigame (buy oil cheap abroad, sell fries dear). |
| Global | **€ as universal ledger** | Tiers 6–7 | Foreign currencies abstract into EUR-equivalent to avoid spreadsheet hell; the exchange flavor stays as regional multipliers. |
| Space | **Krebbels ₭** (sci-fi credits) | Tiers 8–10 | Earned fresh; Earth money converts to ₭ **only at the Golden-Mayo prestige** (a one-way "cash out Earth to fund the stars" gate). |
| Galactic | **Universal Fry-Standard / "the Frite" (Ƒ)** | Tiers 11–12 | The galaxy adopts *your* fries as a currency backing — a joke where frietjes literally become money. Aliens pay in exotic barter that converts to Ƒ. |

**How conversions interact with prestige:**
- Within an Act, currencies are 1:1-ish or via exchange rate (spendable now).
- **Across Acts, prestige is the only bridge** — you don't "wire" BEF to Mars; you
  *prestige*, and your lifetime earnings become the new currency's seed. This keeps
  each economy self-contained and prevents early-tier hoarding from trivializing late
  tiers. Golden Frietzakjes / Golden Mayo / the Frite are the true *cross-Act* stores
  of value.

---

## 6. The Alien Endgame

The gag that keeps it coherent: **aliens don't want *your* fries — they want fries
that satisfy alien biology, and figuring that out is the endgame's puzzle.** You're
still frying potatoes; the constraints just get gloriously weird.

### 6.1 What fries/sauces/meats mean to aliens
- **Fries as a universal gesture.** The lore: crispy-outside/fluffy-inside is a
  mathematically optimal texture that *most* carbon-based life finds pleasurable —
  hence "First Fry Contact." You are humanity's ambassador *because* of the double-fry.
- **Sauce = the real content.** For aliens, the *sauce* carries species-specific
  nutrients/signals. Mayonnaise is the "hello." Your prestige recipe book becomes a
  diplomatic toolkit.
- **Meat snacks = luxury/ritual.** Frikandel and stoofvlees become ceremonial gifts;
  some species find *stoofvlees* religiously significant (running gag: an alien
  monastery built around beef stew).

### 6.2 Alien species as mini-markets (each = weird demand + rule)
Illustrative roster — each is a sub-economy with one signature twist:
- **The Zog (methane-breathers):** want fries fried in liquid methane at −160°C;
  "crispy" means *frozen shatter-crisp*. Sauce: liquid-nitrogen mayo. Rule: your
  fryers must be *cold* fryers (inverted mechanic).
- **The Chlorovites (photosynthetic):** don't eat — they *bask*. They want fries that
  **glow** (bioluminescent potato genetics). You sell *light*, not calories.
- **The Hive-of-Nnn (collective mind):** one order feeds a billion; enormous volume,
  demands *perfect uniformity* (quality-variance penalty, huge if you nail it).
- **The Molluscoids (acid physiology):** sauce must be pH-matched; wrong sauce =
  reputation disaster (a "don't poison the ambassador" tension beat).
- **The Chronovores (experience time backwards):** want fries served *stale-first,
  hot-last*; you literally cook in reverse (a fun inversion minigame).
- **The Gourmand Emperor (endgame patron):** a Jabba-esque connoisseur who has tasted
  every food in the galaxy and is *bored* — satisfying him with the humble Belgian
  frietje is the emotional climax.

### 6.3 Exotic ingredients (extend the Earth ingredient axes)
- **Regolith-salt, neutronium-crisp coating, dark-matter mayo (weighs infinite,
  spreads forever), quantum-Bintjes (superposition potatoes — both fried and raw
  until observed), singularity oil (deep-fries at absolute efficiency).**
- Each slots into the *same* recipe/quality system from Earth — you're still choosing
  potato + oil + sauce + meat, just with cosmic variants. **Coherence guarantee:** no
  new UI verb in the alien tier; only new *values* in existing systems.

### 6.4 Keeping it funny but coherent
- Every absurd alien demand maps to an existing mechanic (temperature = your fryer
  setting, glow = quality/genetics, volume = producers, pH = sauce recipe). The
  comedy is *dressing*, the systems are *continuous* from Tier 1. A player who
  mastered "Wallonia likes andalouse" is using the same muscle to satisfy "the Zog
  like it at −160°C."
- The tone stays *deadpan-Belgian*: everyone treats galactic diplomacy with the same
  unbothered seriousness a real *frituuruitbater* treats the correct fry temperature.

---

## 7. Recommended Progression Pacing

**EARLY GAME (Tiers 1–3, ~first 4–6h): "learn the fryer."**
- Teach the loop: tap → buy fryer → hire first *frituuruitbater* (automation reveal)
  → open second stall → discover reputation. Small, cozy, Belgian, BEF. One downturn
  event (dioxin scare) teaches "events happen." Goal: player feels ownership of a
  *real little frituur* before any grandeur.

**MID GAME (Tiers 4–7, ~6–40h): "management widens, first prestiges."**
- The euro changeover as a memorable one-time shock. Regional taste wars introduce
  *choice* (which market, which recipe). **First Franchise-Out prestige** here is the
  pacing reset — the game teaches "reset to go faster." R&D tech tree and franchise-
  vs-owned decisions give strategic depth. Multiple prestige cycles compress Acts I–II.
  Historical events (2008 crash, social-media boom) add texture.

**LATE GAME (Tiers 8–10, ~40–90h): "to the stars."**
- Tonal pivot to space. Golden-Mayo prestige stage introduced. New physics-modifier
  rules (gravity, vacuum, cold-frying) refresh a loop that's ~50h old. Vertical
  integration (grow your own Martian potatoes) adds a supply-chain layer. Krebbels
  currency. Aliens start cameoing.

**END GAME (Tiers 11–12, ~90h+ / infinite): "galactic frituur."**
- Full alien economy: species puzzles, galactic currency, First-Fry-Contact prestige.
  The Gourmand Emperor as a narrative climax. Tier 12 is the endless ascension engine
  with leaderboards — the retention layer where dedicated players live indefinitely.
- **Emotional throughline:** the humble Belgian frietje conquers the galaxy *without
  ever stopping being a humble Belgian frietje.* Final beat: you can always still
  visit Rikkewiet aan de Leie and run the original stall by hand.

**Pacing guardrails:**
- Each tier should present its "new rule" within ~10 min of unlock, then reward
  mastery for its dwell window.
- Prestige should always feel *offered, not forced* — the curve makes it obviously
  attractive ~70% into an Act, never mandatory.
- No dead air: if a tier's dwell exceeds ~2× target with no new toy, inject an event.

---

## Game design hooks

Concrete, implementable tier table. Costs are illustrative first-clear gates in the
tier's native currency (later re-clears are trivial post-prestige). Multipliers assume
the AdVenture-Capitalist-style `cost×1.07ⁿ` producer curve from §2.

| Tier | Name | Unlock cost (first clear) | Key new mechanic | Currency | Era |
|---|---|---|---|---|---|
| 1 | De Frietkot (single stall) | new game | tap-to-fry + buy producers | BEF | 1994 |
| 2 | De Wijk (district) | 10k BEF + 1st *frituuruitbater* | **managers/automation** + reputation | BEF | 1995–96 |
| 3 | De Stad (city) | 500k BEF + city permit | **location map** + potato-quality + events | BEF | 1997–99 |
| 4 | Belgische Steden | 25M BEF | **regional taste profiles** + BEF→EUR event | BEF→**EUR** | 2000–02 |
| 5 | Buurlanden (NL/FR/DE/LU) | €5M + export license | **foreign sub-currencies / forex** + logistics | EUR + locals | 2002–05 |
| 6 | Continenten | 1st **Franchise-Out prestige** | **franchise vs. owned** + continent multipliers | EUR (ledger) | 2006–12 |
| 7 | Wereldrijk (global) | €50B lifetime | **R&D tech tree** + brand HQ + virality | EUR | 2013–35 |
| 8 | Baan & Maan (orbit/Moon) | **Golden-Mayo prestige** + space-elevator tech | **low-grav/vacuum frying** rules | **Krebbels ₭** | 2035–45 |
| 9 | Mars & Koloniën | 10M ₭ + Martian agriculture | **vertical supply chain** (grow potatoes) | ₭ | 2045–55 |
| 10 | Het Zonnestelsel (planets) | 1B ₭ + interplanetary shipping | **environment modifiers** per world + tariffs | ₭ | 2055–65 |
| 11 | Alien Beschavingen | **First-Fry-Contact prestige** | **alien species mini-markets** + diplomacy | **de Frite Ƒ** | 2065+ |
| 12 | Galactische Frituur-Federatie | serve N species + max galactic rep | **endless ascension** + leaderboards | Ƒ | far future |

**Currency-conversion hooks (implementation):**
- `BEF→EUR`: one-time, fixed `40.3399 BEF = 1 EUR`, fired by the 2002 era event.
- Foreign→EUR: per-country `exchangeRate` float, drifts ±, exposed as a light minigame.
- `EUR→₭`, `₭→Ƒ`: **only realized on the corresponding prestige**; seed = `f(lifetime
  earnings in that Act)`, e.g. `newCurrency = floor((lifetime/scale)^0.5)`.

**Prestige-currency hooks:**
- Golden Frietzakjes `bags = floor((lifetime_BEF_equiv / 1e12)^0.5)`, `+1.5% global FPS` each.
- Golden Mayo multiplies Frietzakjes' effect; the Frite multiplies Golden Mayo.

**Producer/upgrade curve hooks:**
- `cost(n) = base × 1.07^n`; per-tier producer `output ×≈5.5`, `cost ×≈12`.
- Milestone upgrades at owned-counts {10,25,50,100,…} → ×2 that producer.
- Offline: cap `duration` (start 4h) and `rate` (start 50%), both upgradable via tech
  and prestige perks.

---

### References / inspiration
- **AdVenture Capitalist** — Earth→Moon→Mars reskin of one buy/manager/upgrade loop;
  source of our producer curve, managers, and "same loop at cosmic scale" structure.
- **Cookie Clicker** — prestige (Heavenly Chips), achievement-linked milestone
  multipliers, offline/idle contract.
- **Pizza Tycoon (1994)** — recipe composition, city-map of competing locations,
  reputation-as-a-stat management texture; also our era anchor.
- **Two Point Hospital / Theme Park chains** — chain-of-locations management feel for
  the mid-game map/franchise tiers.
- Belgian *frituur* culture, the real **40.3399 BEF/EUR** fixed rate, and the 1999
  dioxin crisis provide the historical/comedic grounding.
