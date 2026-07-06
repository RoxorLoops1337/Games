# Frietkot Tycoon — Competitors & Shady Business Design Doc

> **Tone note (read first):** This is a *satirical, cartoonish* tycoon game in the lineage of **Pizza Tycoon (1994)**, Pizza Connection, and the comedy-crime business layers of GTA-style games. Every "shady" mechanic below is a **fictional risk/reward game system with in-game consequences** — fines, raids, reputation loss, jail-time-flavored downtime. Nothing here is instructional. The rat-meat gag is a *gag*; the tax-evasion mechanic is a *dice roll against an auditor NPC*. Think Looney-Tunes-with-a-fryer, not a manual.
>
> Design lineage: Pizza Tycoon let you "call upon local mafia to sabotage competitor restaurants," bribe officials, and buy "joke articles" to sabotage rivals ([Wikipedia](https://en.wikipedia.org/wiki/Pizza_Tycoon), [TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/PizzaTycoon)). We keep the spirit, drop the guns, and lean into Belgian frietkot culture: Bintje potatoes, beef-tallow ("ossewit") frying, andalouse/samurai/pickles sauces, and the very real bureaucratic dread of the **FAVV/AFSCA** food-safety inspector.

---

## 0. The three-axis tension (the whole game in one sentence)

Everything the player does moves three meters that fight each other:

- **REPUTATION** (`Rep`, 0–100) — taste, cleanliness, brand love. Drives foot traffic & price tolerance.
- **PROFIT** (`€`, unbounded) — the score you actually spend on expansion (city → country → continent → planet).
- **HEAT** (`Heat`, 0–100) — accumulated suspicion across FAVV, the tax office, and police.

The core loop: **you can always buy short-term Profit by spending Reputation or by raising Heat — but both bills come due.** A clean shop grows slowly and safely. A shady empire grows fast and can *implode* in a single inspection. Competitors exist to punish whichever axis you neglect (a low-Rep shop gets out-competed; a high-Heat shop is easy to tip off to the inspector).

```
        REPUTATION
           /\
          /  \        "Clean but broke"  ← too far up-left
         /    \
        /      \
   PROFIT ------ HEAT
   "Rich but      "Rich but
    hated"          about to be raided"
```

The balance target: a skilled player rides the *edges* — spiking Heat right before a big cash goal, then "cooling off" (see §4.6) before the inspector rolls.

---

## 1. COMPETITORS

### 1.1 What a competitor *is* (data model)

Each rival is an NPC chain occupying slots in the city's **districts**. A competitor has:

```
Competitor {
  id, name, archetype,
  quality:      0..100   // their taste score (their "Rep")
  price:        cheap|mid|premium
  aggression:   0..100   // how often they run dirty tricks on you
  cash:         €        // fuels their expansion & sabotage
  heat:         0..100   // yes, THEY have heat too — you can raise it
  districts:    { districtId: share }   // market share they hold
  vibe:         personality string (for barks/newspaper flavor)
  scoutLevel:   0..3      // how much intel YOU have on them
}
```

### 1.2 The roster

| # | Name | Archetype | Personality | Strengths | Dirty tricks they run on YOU |
|---|------|-----------|-------------|-----------|------------------------------|
| 1 | **Frituur De Gouden Frite** | The Old Rival (family frietkot) | Grumpy nonna-with-a-fryer; "we were frying before you were born" | Deep local loyalty (+Rep floor in home district), immune to rumor attacks | Undercuts your price, spreads rumors that *your* Bintjes are "Aardappelen uit een zak" (bagged/frozen) |
| 2 | **Pizza Tycoon™ (Don Calzone)** | The Pizza Rival (homage) | Slick 90s mobster-lite; sunglasses indoors; "capisce?" | Deep pockets, uses *joke-article* sabotage like the 1994 game, cross-sells into your districts fast | Hires the mafia-flavored "Cousins" to loosen your fryer bolts & block supply ([Pizza Tycoon](https://en.wikipedia.org/wiki/Pizza_Tycoon)) |
| 3 | **McFreedom's** | American Fast-Food Giant | Aggressively cheerful, focus-grouped, "Now with McFrietjes®!" | Infinite marketing budget (city-wide ad blitzes drop everyone's share but theirs), drive-thru convenience, franchise speed | Buys exclusive supplier contracts to starve you of Bintjes; PR firm plants "artisanal frietkots are unhygienic" op-eds |
| 4 | **Kebab Palace 24/7** | The Night Rival (kebab shop) | Chill, nocturnal, plays loud music; "habibi, come, is fresh" | Owns the 22:00–04:00 drunk-crowd window (steals your late share), cheap, high volume | Sound-system nuisance lowers your dine-in Rep; occasionally poaches your late-shift staff with cash tips |
| 5 | **Fritz & Foraged** | Hipster Artisanal Startup | Beard, tote bag, "we hand-cut heirloom fingerlings in small batches" | Premium price with premium Rep; wins the food-blogger/instagram meta; Gen-Z magnet | Runs viral "exposés" (real or fake) about competitors; poaches your best fry-cook with equity + oat-milk perks |
| 6 | **Frietbot 9000** *(late game)* | The Automated Chain | Robotic voice, no soul, "PROCESSING YOUR FRIET, HUMAN" | Zero labor cost → can price at a loss forever; appears once you hit the "planets" tier | Price-dumps entire districts to €0 margin to bankrupt you; hard to sabotage (no staff to poach, no rats care about robots) |

**Rubber-banding:** each rival's `aggression` scales with *your* market lead. Dominate a district and rivals pool cash to run coordinated dirty tricks (a "they've noticed you" beat). Fall behind and they get complacent (aggression decays), giving you a comeback window.

### 1.3 Scouting (how you get intel)

You never see a rival's full stats until you scout them. Three methods, escalating cost/fidelity:

| Method | Cost | Time | What it reveals | Risk |
|--------|------|------|-----------------|------|
| **Read the local paper** | €5 / day (subscription) | passive | Public: rival names, ad campaigns, scandals, ingredient price trends, "who's opening where." Nod to Pizza Tycoon's daily-newspaper tips. | none |
| **Buy a portion & taste-test** | price of one portion (~€3) | instant | Their **quality** score ±10, current sauce/portion tricks (you can literally detect watered-down andalouse). Sets `scoutLevel` ≥1. | tiny: if you over-order you tip them off (+1 their aggression) |
| **Send a spy** ("stagiair undercover") | €250–€2,000 by tier | 1–3 days | Full stats: exact quality, cash, supplier, **their Heat**, and their *planned* next dirty trick (lets you pre-counter). Sets `scoutLevel` = 3. | **blowback:** on failure (see §2 formula) the spy is caught → −Rep hit ("Frietkot caught spying!" headline) and the target's aggression spikes |

`scoutLevel` decays over time (intel goes stale) so scouting is a recurring spend, not one-and-done.

### 1.4 Market-share model (per district)

Each **district** is a market with a fixed daily demand `D`. Every shop (you + rivals) competes for share via an **attractiveness score**:

```
attractiveness(shop, district) =
      w_taste   * quality
    + w_price   * priceValue        // lower price → higher value
    + w_conv    * convenience       // proximity, drive-thru, hours
    + w_brand   * marketingBuzz     // ads, viral moments, novelty
    + w_local   * localLoyalty      // home-district bonus, longevity
    - penalties                     // active scandals, health-rating stars, queue length

share(shop) = attractiveness(shop) / Σ attractiveness(all shops in district)
dailyCustomers(shop) = share(shop) * D * districtFootTraffic
```

- District **archetypes** re-weight the `w_*` coefficients: *Student Quarter* weights price & hours; *Tourist Center* weights brand & novelty; *Posh Suburb* weights taste & cleanliness; *Nightlife Strip* weights hours (Kebab Palace's home turf).
- **Health rating stars** (from FAVV, §4) multiply your attractiveness: 5★ = ×1.15, 1★ = ×0.6, closed = ×0. This is the mechanical hook that makes shady food-safety choices bite.
- **Active scandal** = temporary `-penalty` that decays over `scandalDays`. Sabotage and shady-op blowback both inject scandals.

Winning a district isn't binary — you fight over *share percentages*, and rivals push back every time you cross ~40% share.

---

## 2. SABOTAGE — dirty tricks YOU run on rivals

All sabotage resolves with the same shape: **pick target → pay Cost → roll `success` → apply Effect or Blowback → start Cooldown.** Success improves with intel (`scoutLevel`) and a hired **"fixer"** stat; blowback is a *separate* roll that raises YOUR Heat and can start a scandal on you.

```
successChance = base + 0.08*scoutLevel + fixerSkill - targetDefense
blowbackChance = blowbackBase + targetHeatAwareness - fixerDiscretion
// on caught-blowback: +Heat, self-scandal, target aggression +, possible police interest
```

| Action | Cost | Base success | Cooldown | Effect on rival | Blowback if caught |
|--------|------|--------------|----------|-----------------|--------------------|
| **Spread a bad rumor** ("their oil is from 2003") | €150 | 70% | 3 days | −quality perception 8–15 for `scandalDays`; drops their share | −Rep 5, "smear campaign" scandal on you; De Gouden Frite is immune |
| **Tip off the health inspector** (anonymous) | €0 (a phone call) | scales with *their* real Heat | 5 days | If their hygiene is genuinely bad → FAVV visit → star loss / temp closure. If they're clean → nothing (wasted call, small Heat to you) | If traced → +Heat 15, police note "malicious reporting," −Rep 8 |
| **Poach their star fry-cook** | signing bonus €500–€3,000 | bidding war vs their `cash` | 7 days | −quality 10 to them, +quality to you; removes their veteran bonus | They counter-poach; wage inflation across the district |
| **"Accidentally" block their Bintje supply** | €800 (grease the wholesaler) | 55% | 6 days | Rival forced onto frozen/bagged potatoes → −quality 20 for `supplyDays`; can't run promos | Wholesaler talks → +Heat 12; if you share a supplier, YOUR supply hiccups too (30%) |
| **Loosen a bolt on their fryer** (Cousins job) | €600 | 60% | 8 days | Fryer down 1–3 days (lost sales for them) + small "accident" scandal | **High blowback:** +Heat 20, potential police/insurance-fraud flag, −Rep 10. Escalates the rivalry (their aggression +15) |
| **Unleash the rats near their shop** | €300 (a bag of "friends") | 65% | 6 days | Rat-sighting scandal → −quality perception 15, likely FAVV visit for them | **Rats don't read maps:** 25% they migrate to YOUR nearest shop next week → self health-risk event |

**Design intent:** cheap/no-cost sabotage (rumor, tip-off) is low-blowback and encourages *plausible* play; the physical/mafia stuff (bolt, rats, supply-block) is high-reward but pumps *your own* Heat and can literally backfire onto your shops. Sabotage is how you compete when you're behind on Rep — but leaning on it makes you the inspector's favorite person.

**Rival retaliation:** rivals run the *same* menu back at you, gated by their `aggression`. Getting caught sabotaging paints a target on you: expect a rat in your own storeroom within the week.

---

## 3. SHADY OPERATIONS at your own shops (risk/reward toggles)

These are **per-shop toggles or sliders** you flip for immediate margin at the cost of Rep and/or Heat. Each contributes to that shop's **Heat generation rate** and, when the dice turn, triggers §4's authorities. All are comedic and clearly fictional.

| Toggle | Margin effect | Rep effect | Heat/day | The catch (consequence) |
|--------|---------------|-----------|----------|-------------------------|
| **Skip refreshing the fryer oil** ("oil is a state of mind") | +€ per portion (no oil cost) | Taste −, hygiene ★ − each week skipped | +3 to `favvHeat` | Rancid-oil taste tanks Rep fast; FAVV inspection near-auto-fails; possible "customer illness" event |
| **Cheap / "mystery" meat sourcing** (the rat/horse-meat gag) | Frikandel margin +40% | latent (nobody knows… yet) | +4 to `favvHeat` | **Scandal jackpot:** if it ever leaks (leak chance rises with Heat & rival spying) → city-wide −Rep 30, boycott, tabloid field day ("Paardenfrikandel-gate"). Nods to Belgium's real 1999 **dioxin crisis** as timeline flavor |
| **Cook the books / cash-in-hand** | Reported profit ↓ → **tax paid ↓**, kept profit ↑ | none (invisible) | +5 to `taxHeat` | Tax auditor NPC; audit chance ∝ `taxHeat` & how far reported margin deviates from district norm. Caught → back-taxes ×2 + fine. Tie to timeline: pre-2002 **cash francs** = easy; **euro (2002)** digitizes trails; modern **FAVV/registered-cash-register ("witte kassa")** era makes this much riskier |
| **Underpay / overwork staff, hire off-the-books** | Labor cost −30–60% | Rep − (bad service, surly staff), morale − | +3 to `laborHeat` | Staff quit / strike / *sabotage you* / whistle-blow to inspectors; social-inspection raid; a poached-then-angry cook is a walking exposé |
| **Watered-down sauces** | Sauce cost −50% | Taste −, review risk | +1 | Regulars notice ("this andalouse is just mayo and sadness"), Rep bleed; artisanal rivals weaponize it in exposés |
| **Reused / topped-up oil beyond limit** | +margin | hygiene ★ − | +2 to `favvHeat` | FAVV tests oil polar-compound %; over limit = instant star loss + fine |
| **Short portions** ("the 90% frietzak") | +margin per bag | Rep − (word spreads), "small portion" reputation tag | +1 | Consumer-protection complaint chance; review bombs; loyalty decay |

**Heat is compartmentalized** into three sub-pools that feed the three authorities: `favvHeat` (food safety), `taxHeat` (money), `laborHeat` (staff/police). This lets the player be "clean on food, dirty on taxes" and face only the auditor — a fun, legible risk profile. Total `Heat = f(favvHeat, taxHeat, laborHeat)` for the global meter.

---

## 4. THE LAW

Three authority tracks, each triggered by its Heat sub-pool.

### 4.1 FAVV / AFSCA — the health inspector (the star of the show)
- **Trigger:** `favvHeat` crossing thresholds, a tip-off (yours or a rival's, §2), a customer-illness event, or a routine roll (small baseline chance, higher for shops that have never been inspected).
- **Stakes:** the **health-rating stars** (§1.4) that directly multiply market share, plus fines and (worst case) **temporary or permanent shop closure**.

### 4.2 Tax auditor
- **Trigger:** `taxHeat`, plus a "your reported margin is statistically weird" flag (reporting far below district norm invites an audit). Timeline-gated difficulty (§3 franc→euro→witte-kassa).
- **Stakes:** back-taxes (×1.5–×3), fines, and a lingering "flagged filer" status that raises future audit odds.

### 4.3 Police / social inspection
- **Trigger:** `laborHeat`, off-the-books hiring, high-blowback sabotage (fryer bolt, rats), or getting caught spying.
- **Stakes:** fines, forced legal hiring, and — if you've been running the mafia-flavored sabotage — an **organized-crime "Cousins" storyline** that can escalate into a shakedown of *your* shops.

### 4.4 Inspection minigame idea ("The Walkthrough")
When an inspector arrives you get a short **real-time hide/prep phase**, then a **turn-based checklist**:
1. **Prep phase (10–20s, if you had warning from the paper/spy):** drag staff to scrub stations, swap the mystery-meat crate into the back, top up oil, unhide the second (unregistered) cash register. Each action costs money and one "action point."
2. **Checklist phase:** inspector rolls through categories — *Oil quality, Cold chain, Cleanliness, Vermin, Traceability/labels, (auditor variant: books; social variant: contracts).* Each category compares your true hidden state vs. what you prepped. Pass/partial/fail per line.
3. **Result:** total score → star rating change, fine size, or closure. A perfect clean shop breezes it (the minigame is trivial and fast → the game *rewards* legit play with less friction, not more).

The minigame's job: make being shady *tense and skill-based* (can you prep in time?) while making being clean *boring on purpose*.

### 4.5 Bribery
- Offer the inspector an **"envelope"** (Pizza-Tycoon-style bribe-the-official mechanic, [TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/PizzaTycoon)).
- Resolves as a roll vs. the inspector's **integrity** stat (varies per inspector; some are on the take, some are crusaders, telegraphed by the newspaper).
- **Accepted:** inspection passes this time, but bribe amount + acceptance adds to a hidden **corruption dossier**.
- **Refused:** *big* Heat spike, +police interest, "attempted bribery" scandal — worse than just failing the inspection. High risk, situational.
- Late-game: a fully corrupt city network lets you pay a monthly "protection" retainer for inspection immunity — until an anti-corruption sweep event nukes the whole network (a scripted "the party's over" beat).

### 4.6 Getting caught — outcomes ladder & cooling off
Escalating consequences so a first offense stings but a pattern is fatal:

1. **Warning** — free pass, `Heat` noted, "flagged" status.
2. **Fine** — scaled to offense × repeat-offender multiplier.
3. **Star loss / forced fixes** — share drops until you pay to remediate.
4. **Temporary closure** (days) — zero revenue, ongoing rent, Rep hit.
5. **Scandal + boycott** — city-wide Rep crater (the mystery-meat jackpot).
6. **Permanent shutdown / asset seizure** of that location; organized-crime storylines can add a "you owe the Cousins" debt.

**Cooling off (the pressure valve):** Heat **decays slowly on its own** and faster if you actively spend on legitimacy — PR campaigns, a real accountant, a hygiene consultant, staff raises. This is the strategic rhythm: **spike Heat for a cash sprint, then buy it back down before the dice catch you.**

---

## 5. Risk/Reward summary table

| System | Upfront cost | Reward | Rep | Heat pool | Backfire |
|--------|-------------|--------|-----|-----------|----------|
| Scout: paper | €5/day | intel (public) | — | — | none |
| Scout: taste-test | ~€3 | intel (quality) | — | — | tiny tip-off |
| Scout: spy | €250–2,000 | full intel + enemy plan | — | — | caught → −Rep, enemy aggro |
| Sabotage: rumor | €150 | rival −share | — | — | −Rep, self-scandal |
| Sabotage: tip-off | €0 | rival inspected | — | small if traced | +Heat, −Rep |
| Sabotage: poach cook | €500–3,000 | rival −qual, you +qual | — | — | wage war, counter-poach |
| Sabotage: block Bintjes | €800 | rival −qual | — | +12 | supply blowback on you |
| Sabotage: fryer bolt | €600 | rival downtime | — | +20 | police/insurance flag |
| Sabotage: rats | €300 | rival scandal+inspection | — | — | 25% rats come to you |
| Shady: skip oil | €0 (saves) | +margin | −− | favv +3/day | auto-fail inspection |
| Shady: mystery meat | €0 (saves) | +40% margin | latent | favv +4/day | scandal jackpot −Rep 30 |
| Shady: cook books | €0 | −tax | — | tax +5/day | audit, back-tax ×2 |
| Shady: underpay/off-book | €0 (saves) | −labor cost | − | labor +3/day | strike, whistleblow, raid |
| Shady: watered sauce | €0 (saves) | +margin | − | favv +1/day | review bleed |
| Shady: short portions | €0 (saves) | +margin | − | +1 | complaints, loyalty decay |
| Law: bribe | envelope € | skip one inspection | — | hidden dossier | refusal = big Heat+police |
| Law: cool off (PR/accountant) | €€ | −Heat | +Rep | −Heat | none (this is the "good" spend) |

---

## Game design hooks

Concrete constants & toggles, ready to wire. All values are first-pass; tune later.

### Meters
```js
const REP_MAX = 100, HEAT_MAX = 100;
const HEAT_SUBPOOLS = ['favvHeat', 'taxHeat', 'laborHeat'];   // each 0..100
const HEAT_GLOBAL = (f,t,l) => Math.min(100, 0.45*f + 0.35*t + 0.30*l);  // weighted, can exceed input caps → clamp
const HEAT_DECAY_PER_DAY = 1.5;                 // passive cool-off
const HEAT_DECAY_LEGIT   = { pr: 6, accountant: 5/*taxHeat only*/, hygieneConsultant: 6/*favvHeat only*/, staffRaise: 4/*laborHeat only*/ };
```

### Shady toggles (per shop) — margin, rep/day, heat/day
```js
const SHADY = {
  skipOil:       { margin:+0.18, repPerDay:-1.5, favv:+3, oilStarDropPerWeek:1 },
  mysteryMeat:   { margin:+0.40, repPerDay: 0.0, favv:+4, leakBase:0.02 /*+0.001*Heat*/, scandalRep:-30 },
  cookBooks:     { taxMult:0.55, tax:+5, auditFlagIfMarginBelowNormBy:0.15 },
  underpayStaff: { laborMult:0.55, repPerDay:-0.8, labor:+3, quitChancePerDay:0.03, whistleChance:0.01 },
  waterSauce:    { margin:+0.10, repPerDay:-0.6, favv:+1 },
  shortPortion:  { margin:+0.12, repPerDay:-0.7, misc:+1, complaintChance:0.02 },
  reuseOil:      { margin:+0.09, favv:+2, polarLimit:0.24 },
};
```

### Sabotage table
```js
const SABOTAGE = {
  rumor:      { cost:150, base:0.70, cd:3, effect:{rivalQualPerc:-12, scandalDays:5}, blow:{rep:-5} },
  tipOff:     { cost:0,   base:'rivalHeat', cd:5, effect:'favvVisitOnRival',        blow:{heat:+15, rep:-8, traceChance:0.25} },
  poachCook:  { cost:[500,3000], base:'bidVsCash', cd:7, effect:{rivalQual:-10, youQual:+8} },
  blockBintje:{ cost:800, base:0.55, cd:6, effect:{rivalQual:-20, supplyDays:4},    blow:{heat:+12, selfSupplyHit:0.30} },
  fryerBolt:  { cost:600, base:0.60, cd:8, effect:{rivalDownDays:[1,3]},            blow:{heat:+20, rep:-10, rivalAggro:+15} },
  rats:       { cost:300, base:0.65, cd:6, effect:{rivalQualPerc:-15, favvVisit:true}, blow:{migrateToYou:0.25} },
};
const SUCCESS = (s,scout,fixer,def) => s.base + 0.08*scout + fixer - def;
```

### Competitors
```js
const RIVALS = [
  { id:'goudenfrite', name:'Frituur De Gouden Frite', quality:72, price:'mid',     aggr:35, rumorImmune:true,  home:'oldTown' },
  { id:'pizzatycoon', name:'Pizza Tycoon (Don Calzone)', quality:65, price:'mid',  aggr:60, mafia:true },
  { id:'mcfreedoms',  name:"McFreedom's",            quality:45, price:'cheap',    aggr:70, adBudget:9999, franchiseFast:true },
  { id:'kebab247',    name:'Kebab Palace 24/7',      quality:58, price:'cheap',    aggr:40, ownsHours:[22,4] },
  { id:'fritzforaged',name:'Fritz & Foraged',        quality:88, price:'premium',  aggr:55, viral:true, poachy:true },
  { id:'frietbot',    name:'Frietbot 9000',          quality:70, price:'dump',     aggr:80, unlockTier:'planets', laborCost:0 },
];
const AGGRO = (r, yourLeadShare) => clamp(r.aggr + 40*Math.max(0, yourLeadShare-0.40), 0, 100);
```

### Market share (per district)
```js
const DISTRICT_WEIGHTS = {
  studentQuarter:{ taste:0.20, price:0.35, conv:0.20, brand:0.15, local:0.10 },
  touristCenter: { taste:0.20, price:0.10, conv:0.25, brand:0.35, local:0.10 },
  poshSuburb:    { taste:0.45, price:0.10, conv:0.10, brand:0.15, local:0.20 },
  nightlifeStrip:{ taste:0.15, price:0.25, conv:0.35, brand:0.15, local:0.10 },
};
const STAR_MULT = { 5:1.15, 4:1.05, 3:1.0, 2:0.8, 1:0.6, 0:0.0 };
function share(shop, all, w){ const a=attract(shop,w); return a/all.reduce((s,x)=>s+attract(x,w),0); }
```

### Scouting
```js
const SCOUT = {
  paper:{ cost:5, per:'day', reveals:'public',  scoutLevel:0 },
  taste:{ cost:3, reveals:'quality',            scoutLevel:1, tipOffChance:0.10 },
  spy:  { cost:[250,2000], days:[1,3], reveals:'full+plan', scoutLevel:3, caughtRep:-8 },
};
const SCOUT_DECAY_PER_DAY = 0.05; // intel goes stale
```

### The Law
```js
const FAVV = { baseInspectChance:0.02, heatMult:0.010, tipOffMult:0.5, prepSeconds:[10,20] };
const TAX  = { baseAuditChance:0.01, heatMult:0.008, marginDeviationMult:0.5,
               eraRisk:{ francs:0.6, euro:1.0, witteKassa:1.6 } };  // timeline gate
const POLICE = { laborRaidChance:0.01, heatMult:0.009, sabotageCaughtBonus:0.15 };
const BRIBE = { integrityRange:[0,100], acceptIfEnvelopeOverIntegrity:true,
                refusedHeat:+25, refusedPolice:true, dossierGrows:true };
const CAUGHT_LADDER = ['warning','fine','starLoss','tempClose','scandalBoycott','permShutdown'];
const REPEAT_MULT = n => 1 + 0.75*n; // fines scale with priors
```

### Timeline flavor gates (1990s → planets)
```js
const ERAS = [
  { from:1995, tag:'francs',     note:'cash-in-hand easy; dioxin-crisis(1999) event raises FAVV scrutiny' },
  { from:2002, tag:'euro',       note:'currency switch digitizes some money trails' },
  { from:2016, tag:'witteKassa', note:'registered cash register — tax evasion much riskier' },
  { from:2040, tag:'planets',    note:'Frietbot 9000 unlocks; interplanetary FAVV = "Cosmic Food Authority"' },
];
```

---

*All mechanics fictional & satirical. The rats are cartoon rats. The frikandel is, legally, "meat."*

### Sources
- [Pizza Tycoon — Wikipedia](https://en.wikipedia.org/wiki/Pizza_Tycoon) (mafia sabotage, bribing officials, ingredient popularity, daily newspaper)
- [Pizza Tycoon — TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/PizzaTycoon) ("joke articles"/sabotage items, bribe-the-official)
- [Best Tycoon Games 2026 — Capitalism Lab](https://www.capitalismlab.com/tycoon-games/) (rival sabotage units, security/legal counters; Empire of Sin coexist/cooperate/destroy rivals; Hollywood Animal reputation-vs-corruption framing)
- [What does sabotage do? — Game Dev Tycoon forum](https://forum.greenheartgames.com/t/what-exactly-does-sabotage-do/3494) (sabotage-as-mechanic reference)
