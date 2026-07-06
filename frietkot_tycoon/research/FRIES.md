# Belgian Fries (Frieten / Frites) — The Research Bible

> Research dossier for **Frietkot Tycoon**. Everything here is about the *fries themselves* — the
> potato, the cut, the double fry, the fat, the texture, the portions, the paper cone, and how a
> Belgian connoisseur decides whether your frietkot is worth queuing for. The last section
> ("Game design hooks") turns all of it into tunable stats, meters and upgrades.

Belgian fries are not "French fries with an attitude." They are a distinct craft product with a
UNESCO-recognised culture behind them: in 2017 the *frietkot* (fry shack) tradition was inscribed as
Belgian **intangible cultural heritage**, and Belgium has petitioned for wider UNESCO recognition of
the fries themselves. There are roughly **5,000 frietkots / frituren** across a country of ~11.5
million people — the highest fry-shop density on Earth. ([From Place to Place](https://fromplacetoplace.travel/belgium/antwerp/belgian-fries/), [FoodBeast](https://www.foodbeast.com/news/belgian-fries-unesco/))

Vocabulary note used throughout this doc:
- **frieten** (Flemish/Dutch) = **frites** (French) = the fries.
- **frietkot / frituur** (NL) = **friterie / baraque à frites** (FR) = the fry shop.
- **frietkotcultuur** = the whole social ritual of eating them.

---

## 1. The Potato — it starts and ends here

### 1.1 Bintje above all

The traditional, near-sacred variety for Belgian fries is **Bintje**. Most Belgian friteries use it
almost exclusively, and European chefs treat it as the default authentic choice. Bintje is a
Dutch-bred variety (1904, by Kornelis Lieuwes de Vries, named after a pupil, "Bintje" Jansma) but it
became *the* Belgian frying potato.

Why Bintje wins:

- **High starch, ~20–22% starch content.** During frying the starch granules gelatinise and expand,
  forming a rigid golden crust on the outside while the interior turns fluffy like a baked potato.
- **Low(er) moisture / water content** than typical British or waxy potatoes. Less internal water =
  less steam during frying = crisper crust and less sogginess. Waxy, watery potatoes steam
  themselves limp.
- **Starch absorbs less oil** than sugars/other compounds, so a high-starch fry tastes *lighter and
  cleaner*, not greasy.
- **Golden colour and neutral, potato-forward flavour.**

([GUSTO webzine](https://gustowebzine.com/belgian-fries-best-potato-varieties/), [TheFlexKitchen](https://theflexkitchen.com/what-kind-of-potatoes-for-belgian-fries/), [Michel Dumas](https://www.micheldumas.com/en/authentic-belgian-fries-frites-recipe/))

### 1.2 Starch is a spectrum — mealy vs waxy

Potatoes sit on a scale from **waxy** (low starch, high moisture, holds shape — good for salads, bad
for fries) to **mealy/floury** (high starch, low moisture, fluffs up — ideal for fries). Bintje is at
the floury end. Other acceptable frying varieties named in the literature: **Agria, Fontane,
Challenger, Markies, Russet/Idaho** (US analogue). But the "real thing" is Bintje.

**Game-relevant takeaway:** potato quality is a *tier*, not a binary. A cheap waxy sack makes soggy,
oily fries no matter how good your fryer is; premium Bintje raises the ceiling on everything.

### 1.3 Why fresh-cut matters

Authentic frites are **hand-cut (or fresh machine-cut) from whole raw potatoes on the day**, not
frozen pre-cut sticks:

- Fresh-cut potatoes still hold their natural starch/sugar balance. Sitting cut and exposed lets
  surface starch oxidise and sugars concentrate — which browns too fast and darkens the fry.
- Pros **rinse the cut sticks in cold water** to wash off surface starch, then **dry them
  thoroughly** — wet fries spit in the oil and steam instead of crisping.
- Frozen/industrial fries are par-fried and coated; convenient and consistent, but a purist frietkot
  advertises **"verse frieten" / "vers gesneden"** (fresh-cut) as a quality badge. The most
  traditional shops advertise **"Vlaamse friet"** (Flemish fries) and serve from a *puntzak*.

([Belgian Smaak](https://www.belgiansmaak.com/french-fries-or-belgian-fries/), [The Square Gent](https://thesquare.gent/leisure/food-drink/belgian-fries-ghent-frituur/))

### 1.4 The cut

- Classic Belgian batons are **thick and slightly uneven: ~10–13 mm square** (roughly 1 cm — much
  chunkier than a McDonald's shoestring). Some sources cite ~10 mm as the sweet spot.
- The thickness is deliberate: a fat baton gives the **crisp-outside / soft-fluffy-inside** contrast
  that is the entire point. Thin fries are all crust and go limp fast; too thick and the inside is
  raw/steamy.
- Slight irregularity (hand-cut character) is a *feature*, signalling fresh-cut and giving varied
  crunch.

([Belgian Smaak](https://www.belgiansmaak.com/french-fries-or-belgian-fries/), [Taste Cooking](https://tastecooking.com/belgium-fries-never-wimpy-sorry-america/))

### 1.5 Seasonality

- **Bintje is a maincrop potato**, harvested late summer into autumn (roughly Sept–Oct in Belgium),
  then **stored** through winter and spring.
- **New-season potatoes** (freshly harvested) have higher moisture and lower dry-matter — they can
  fry softer/soggier and need adjustment.
- **Long-stored / cold-stored potatoes** convert some starch to sugar ("cold sweetening"), browning
  faster and darker and raising **acrylamide** (see §3.3). Good frietkots temper stored potatoes
  (warm them up before frying) and adjust temperature/time by season.
- **Design note:** seasonality is a natural difficulty/price lever — a "potato price & quality"
  curve over the in-game year (cheap+great in autumn, dearer+trickier in late spring).

---

## 2. The Double Fry — blancheren + afbakken

The single technique that separates a Belgian frite from a limp diner fry. Fries are cooked **twice,
in two separate baths at two temperatures**, with a **rest in between**.

### 2.1 First fry — *blancheren* (blanch / pre-fry)

- Temperature: **~130–160 °C** (commonly cited **~150–160 °C / 300–320 °F**; some cite as low as
  130–140 °C).
- Time: **~5–8 minutes**.
- Goal: **cook the interior through without browning.** The fries come out **pale, soft, floppy,
  fully cooked inside** — like a boiled/baked potato in stick form. No colour yet.

### 2.2 The rest (the secret step)

- Fries are lifted out and **left to cool and dry for ≥ 30 minutes** (can be hours; pros often
  blanch big batches in advance during the morning prep).
- Cooling lets **moisture migrate out and the surface dry**, which is what makes the second fry
  crackly. Skipping the rest = soft, greasy fries.
- Practically, this is why a frietkot can serve fast at lunch rush: everything is **pre-blanched**,
  and only the quick second fry happens to order.

### 2.3 Second fry — *afbakken* (finish / crisp)

- Temperature: **~175–190 °C** (commonly **175–180 °C / 350–355 °F**).
- Time: **~2–4 minutes**, to order, right before serving.
- Goal: **flash the exterior into a deep-golden, glassy, crunchy crust** while the inside stays
  soft. Fries go from pale to golden-brown.

### 2.4 Why twice works

Two-stage cooking **decouples "cook the inside" from "brown the outside."** A single fry can't do
both: hot enough to crisp the crust burns it before the middle cooks; cool enough to cook the middle
leaves a pale, oil-logged, soggy fry. The rest-and-dry between baths is what gives that durable crust
that **stays crisp for several minutes** in the cone.

([eathealthy365](https://eathealthy365.com/the-definitive-guide-to-authentic-belgian-homemade-fries/), [Michel Dumas](https://www.micheldumas.com/en/authentic-belgian-fries-frites-recipe/), [Taste Cooking](https://tastecooking.com/recipes/belgian-fries-home/), [Spice/Alibaba](https://spice.alibaba.com/spice-basics/belgian-potato-fries--authentic-double-fry-method-explained))

> **Game hook seed:** the double fry is the perfect early-game **upgrade**. Base shop = single fry
> (mediocre, fast). Buy the "double-fry / pre-blanch station" upgrade → higher quality ceiling, but
> now you must manage a blanch buffer (prep vs rush).

---

## 3. The Frying Fat — the great cultural war

This is the most *characterful*, most argued-about variable in the whole craft. It is also where
your "don't refresh the oil" shady mechanic lives.

### 3.1 Beef tallow — ossewit / blanc de bœuf / rundsvet

Traditionally, Belgian fries are fried in **100% beef fat**. Names you'll see:

- **ossewit** (NL, "ox white") / **rundsvet** or **rundvet** (NL, "beef fat")
- **blanc de bœuf** (FR, "beef white") — the classic branded block product
- historically some shops used **paardenvet / horse fat** too

Why tallow is prized:

- **Flavour.** It gives an unmistakable **rich, savoury, beefy/meaty aroma and taste** that vegetable
  oil simply cannot replicate. Purists insist a "real" frite *must* be fried in beef fat.
- **High smoke point (~250–255 °C / ~490 °F)** — very stable at frying temps, ideal for the
  hot second fry and the repeated cycles of a busy shop.
- **Crust quality** — saturated animal fat sets firmer at the surface, contributing to that crackly
  shell and a fuller mouthfeel.

([Aveno](https://www.aveno.be/2019/11/how-to-make-real-belgian-fries.html), [Michel Dumas](https://www.micheldumas.com/en/authentic-belgian-fries-frites-recipe/), [Daily Meal](https://www.thedailymeal.com/eat/one-thing-you-probably-never-knew-about-authentic-belgian-fries/))

### 3.2 Vegetable oil — the modern compromise

Reality today: **most frietkots have moved partly or fully to vegetable oil**, or a **blend of oil +
beef fat**, for cost, shelf life, dietary/allergen reasons (vegetarian/halal/kosher demand), and
smell. Typical choices: **high-oleic sunflower, peanut/groundnut, palm-based frying fats.**

Trade-offs:
- **Pros:** cheaper, longer-lasting, no beef-fat smell, suits vegetarian/halal customers, lower
  saturated fat.
- **Cons:** you **lose the signature beefy flavour.** Connoisseurs notice immediately. A shop
  advertising **"gebakken in ossewit / 100% rundsvet"** is flagging premium authenticity.

So the fat choice is a genuine **quality-vs-cost-vs-market-reach** dilemma — perfect tycoon tension.

### 3.3 Oil degradation, old oil, acrylamide & dark fries (the shady mechanic)

Frying fat is not immortal. Every batch of fries drags out moisture and drops in crumbs, and heat
plus oxygen plus water steadily wreck the fat.

**What happens as fat ages (oxidation, hydrolysis, polymerisation):**
- Colour **darkens** (fresh gold → amber → brown → murky).
- It gets **viscous/foamy**, smokes at lower temperature (smoke point drops), and smells rancid/acrid.
- Free fatty acids and **polar compounds** build up — the standard industrial "is this oil dead"
  metric is **Total Polar Materials (TPM); many EU jurisdictions treat ~24–25% TPM as the legal
  discard threshold.** Frietkots use handheld oil-tester probes for exactly this.
- Food fried in spent fat comes out **greasy, dark, off-flavoured** ("old-oil taste") and absorbs
  more fat.

**Health angle (why "never change the oil" is genuinely shady, not just gross):**
- **Acrylamide** — a **probable human carcinogen (IARC Group 2A)** — forms via the **Maillard
  reaction** from the potato's **asparagine + reducing sugars** at high heat. It is strongly tied to
  **browning: the darker the fry, the more acrylamide.** Overcooked, too-hot, or sugary
  (cold-stored) potatoes → dark fries → high acrylamide. The EU sets **benchmark levels** and
  requires operators to mitigate (the "**go for gold, not brown**" rule).
- Degraded oil also carries **oxidation products / aldehydes / polymers** linked to inflammation and
  metabolic harm; repeatedly overheated fat is worse.
- Nuance worth knowing: research is **mixed on whether *old oil itself* raises acrylamide** in the
  fries — some studies find continuous oil use does *not* directly increase acrylamide. The bigger
  acrylamide drivers are **temperature and browning/frying time and potato sugar**. But old oil
  absolutely degrades **taste, greasiness, smoke, and general oxidation-product load** — and pushing
  temperature/time to force colour out of tired oil is exactly what darkens fries.

**Bottom line for the game:** running oil too long is *cheaper* (skip the cost of new fat) but
produces **darker, greasier, worse-tasting, higher-acrylamide fries** and a **rancid smell** — which
tanks reputation and is exactly the kind of thing a **health inspector (AFSCA / FAVV)** writes you
up for. Belgium's food-safety agency (**AFSCA/FAVV**) runs HACCP-based hygiene inspections and
publishes a public **"Smiley" food-hygiene rating** — great flavour for an inspection mechanic.

([Springer review on acrylamide in fries](https://link.springer.com/article/10.1186/s43014-023-00212-6), [PMC: chemical changes in deep-fat frying](https://pmc.ncbi.nlm.nih.gov/articles/PMC12516161/), [PubMed: continuous oil use & acrylamide](https://pubmed.ncbi.nlm.nih.gov/25953074/), [AFSCA/FAVV hygiene rating](https://fhr.favv-afsca.be/en))

### 3.4 When should oil be refreshed?

There's no single legal "every N days," but practical + regulatory signals a shop watches:
- **TPM > ~24–25%** → discard (probe test).
- **Dark colour, persistent foam, low/early smoke, off/rancid smell** → discard.
- **Routine practice:** daily filtering to remove crumbs (crumbs burn, blacken oil, add bitterness),
  top-up with fresh fat, and full change on a schedule that depends on volume — a busy frietkot might
  fully change fat every few days to ~weekly; a slow one less often, but old-but-low-volume oil still
  oxidises.
- Good hygiene = **filter often, change on condition, keep the fat as light-gold as practical.**

---

## 4. Texture — the *krokant ↔ slap* spectrum

Belgian fry texture runs along one dominant axis, and Belgians genuinely disagree about the ideal
point:

- **krokant** (NL) / **croustillant** (FR) = **crispy / crunchy.**
- **slap** (NL) / **mou / mollet** (FR) = **soft / floppy / limp.**

Reality: the beloved frite is a **contrast** — **crispy shell, soft fluffy interior.** But the
*degree* of exterior crispness is a matter of taste and region/person:

- Some diners love a **deeply krokant, dark-gold, crackly** fry.
- Others prefer a **softer, paler, more "potato-y"** fry — a thick fry with a thinner crust and a big
  pillowy inside. In much of Belgium a slightly softer, fluffier fry (not a shatteringly hard crisp)
  is actually the traditional norm, especially with the chunky 1 cm cut.
- Freshly served fries begin **losing crispness within minutes** — so a fry that's krokant at the
  counter is pleasantly softening by the time you've walked to the bench. That decay is part of the
  eating experience.

Factors that push texture toward krokant vs slap:
- **Higher/longer second fry, drier surface, more rest between fries, higher-starch/lower-moisture
  potato, fresh light oil** → crispier.
- **Lower/shorter second fry, wet or waxy potato, skipping the rest, overcrowding the basket (drops
  oil temp), tired oil, thick cut, serving late / steaming in a closed box** → softer/slap.

([Michel Dumas](https://www.micheldumas.com/en/authentic-belgian-fries-frites-recipe/), [VisitFlanders](https://www.visitflanders.com/en/discover-flanders/culinary-treats-and-belgian-beer/fries), [500 Hidden Secrets](https://www.the500hiddensecrets.com/belgium/belgium-foodies/eat/belgian-fries))

### 4.1 A usable texture scale (0–100 crispness stat)

| Value | Label (NL) | Description | Who loves it |
|------:|------------|-------------|--------------|
| 0–15 | **kletsnat / slap** | limp, greasy, oil-logged, pale, bends flat | almost nobody (defect) |
| 16–35 | **zacht** | soft, tender, thin crust, very fluffy inside | soft-fry fans, kids |
| 36–60 | **klassiek** | balanced: light golden crust + fluffy centre — the broad Belgian ideal | the majority |
| 61–80 | **krokant** | pronounced crunchy gold shell, soft centre | crisp-lovers, Flanders artisan crowd |
| 81–95 | **extra krokant** | dark-gold, glassy, very crunchy | crunch purists |
| 96–100 | **verbrand/te bruin** | over-browned, hard, bitter, high-acrylamide (defect) | nobody (defect) |

The scale is **double-ended**: both extremes are defects, and different customer archetypes have
different *preferred bands*. That makes texture a **matching mini-game**, not a "bigger is better"
slider.

---

## 5. Portions, Packaging & Vocabulary

### 5.1 Sizes (the SKU ladder)

There is **no legally fixed weight** for these; each shop sets its own. Typical ladder:

- **mini / minifrietje** — smaller than a small; kids / side.
- **klein / kleintje** (small) — regarded as a *proper full portion for one person*.
- **medium** — the common default.
- **groot / grote** (large) — big appetite or sharing.
- **super / XL** — some shops' top single size.
- **familiezak / familiepak / familiepakken** (family bag) — a big shared bag for a household.
- **mega / monster / XXL cones** — a modern gimmick: an enormous cone marketed as a *single* serving
  (challenge food / social-media bait).

Ordering shorthand: **"een grote met"** = "a large *with*" — i.e. a large fries **with mayonnaise**
(the "met" implies mayo, the default sauce, without having to say it). **"een klein zonder"** = a
small without sauce.

([The Square Gent](https://thesquare.gent/leisure/food-drink/belgian-fries-ghent-frituur/), [Shutterbug in Belgium](https://shutterbuginbelgium.wordpress.com/2025/05/06/belgian-frites-from-a-belgian-frituur-its-like-a-fish-chip-shop-sort-of/))

### 5.2 Packaging: the cone vs the tray

- **puntzak** (NL) / **cornet** or **horen** (FR "cone") — the **pointed paper cone**, the iconic,
  most *traditional* vessel. Roadside/Flemish-style shops serving in a puntzak often advertise
  **"Vlaamse friet."**
- **schaaltje / bakje** (NL) — a **cardboard or plastic tray/box**, usually **wrapped in a paper
  sheet**, common at sit-down-ish frituren. Holds more, easier to add sauce, easier to eat with a
  fork.
- Bigger portions and family bags come in **larger boxes/bags**.
- **Little plastic (or wooden) fork** — the **frietvorkje / plastic vork / fourchette** — comes
  stuck in the top. Iconic. Eating with fingers is also fine, standing at the counter.

### 5.3 Sauce & serving traditions

- **Mayonnaise is the default and the king.** Belgian *frietmayonaise* is richer/thicker (often
  higher egg, sometimes a touch of vinegar/mustard) than a light dressing. "Met" (with) = with mayo.
- **On top vs on the side:** classic frietkot style is a **big dollop squirted right on top** of the
  fries in the cone/box (sometimes a scoop deep in the middle too). Some prefer it in a **separate
  little tub on the side (apart)** for dipping and to keep fries crisp. Both are normal; "op de
  frieten" vs "apart."
- **Huge sauce range** beyond mayo: **andalouse, samurai, joppiesaus, tartaar, curry ketchup,
  cocktail, pickles/piccalilly, béarnaise, ketchup, and stoofvleessaus** (beef-stew gravy). Some are
  strongly regional (see §6).
- **Salt** is applied **immediately after the second fry, while piping hot**, tossed for even
  coverage — a quality signal when done well, a defect when the fry is under- or over-salted or
  salted cold.
- **The ritual:** buy at the hatch, get your cone, **eat standing up outside** at a little shelf or
  leaning on a wall/car, fork in hand, often late at night or after football — a communal,
  democratic, all-classes-mix social moment. This *frietkotcultuur* is the UNESCO-recognised part.

([The Square Gent](https://thesquare.gent/leisure/food-drink/belgian-fries-ghent-frituur/), [Brussels Times](https://www.brusselstimes.com/384182/a-saucy-mystery-how-do-belgians-like-their-fries), [From Place to Place](https://fromplacetoplace.travel/belgium/antwerp/belgian-fries/))

---

## 6. Regional Differences — Flanders / Wallonia / Brussels

The fry itself is national, but the **fat, sauces, sides and vocabulary** shift by region.

- **Flanders (Dutch-speaking, north):** "frieten," "frietkot/frituur," puntzak + "Vlaamse friet"
  branding, strong artisanal-mayonnaise culture, pride in fresh-cut and (where kept) beef fat.
  **Carbonnade / stoofvlees** (beer beef stew) as a topping is far more common here (~27% order it,
  vs ~4% in Wallonia). Snacks alongside: frikandel, bicky burger, boulet, kroket.
- **Wallonia (French-speaking, south):** "frites," "friterie" or "baraque à frites," heartier
  garnishes, **andalouse sauce is beloved here (~37%)**, local beer worked into sauces. The
  **fricadelle/mitraillette** (baguette stuffed with fries + meat + sauce) is a Walloon/Brussels
  street staple.
- **Brussels (bilingual, multicultural):** melting pot — everything from traditional **stoofvlees**
  to fusion toppings; famous stand-alone institutions (e.g. Maison Antoine). Both languages on the
  menu; broad sauce range.

Regional flavour is mostly a **cosmetic/menu layer** for the game (naming, sauce mix, side snacks,
décor), but the **beef-fat-vs-oil** and **fresh-cut** authenticity signals read strongest in
Flemish "Vlaamse friet" branding.

([Brussels Times](https://www.brusselstimes.com/384182/a-saucy-mystery-how-do-belgians-like-their-fries), [VisitFlanders](https://www.visitflanders.com/en/discover-flanders/culinary-treats-and-belgian-beer/fries), [Expatica](https://www.expatica.com/be/lifestyle/food-drink/belgian-fries-101986/))

---

## 7. Quality Signals a Connoisseur Judges

How a Belgian decides your frietkot is *goed*:

1. **Colour** — even **golden / deep-gold**, not pale-anemic (undercooked) and not brown/burnt
   (over-fried, old oil, high acrylamide). "Go for gold."
2. **Crispness & the crunch** — an audible, crackly shell that gives way to a soft interior; not
   limp, not oil-slick, not rock-hard.
3. **Interior** — **fluffy, dry, steamy-soft** inside; not gluey, raw, or hollow.
4. **Grease** — should taste **clean and light**, not heavy/oily. Oil-logged = wrong fat temp,
   crowded basket, or spent oil.
5. **Freshness of the fry** — visibly **fried to order** (second fry just now); fries dumped from a
   holding bin and gone soft are an instant tell.
6. **Freshness/quality of the fat** — **light-coloured, non-smoking, clean-smelling** oil; a rancid
   old-oil smell or dark greasy fries = fail. Beef-fat aroma is a *plus* to purists.
7. **Salt** — evenly seasoned, applied hot; not under-salted, not a salt-bomb.
8. **Cut & potato** — chunky ~1 cm, slightly irregular = hand/fresh-cut Bintje; uniform thin
   machine-frozen sticks = lower authenticity.
9. **Portion honesty & the ritual** — generous cone, fork in, mayo done right, the whole
   frietkot vibe.

([From Place to Place](https://fromplacetoplace.travel/belgium/antwerp/belgian-fries/), [500 Hidden Secrets](https://www.the500hiddensecrets.com/belgium/belgium-foodies/eat/belgian-fries), [Michel Dumas](https://www.micheldumas.com/en/authentic-belgian-fries-frites-recipe/))

---

## 8. Quick reference — the numbers

| Thing | Value |
|---|---|
| Signature potato | **Bintje** (high starch ~20–22%, low moisture) |
| Cut size | **~10–13 mm** square batons, slightly uneven |
| First fry (blancheren) | **~150–160 °C**, ~5–8 min, no colour |
| Rest between fries | **≥ 30 min**, cool & dry |
| Second fry (afbakken) | **~175–185 °C**, ~2–4 min, deep gold, to order |
| Traditional fat | **beef tallow** — ossewit / blanc de bœuf / rundsvet (smoke pt ~250 °C) |
| Modern fat | vegetable oil or oil + beef-fat blend |
| Oil "dead" threshold | **~24–25% TPM** (probe), or dark/foamy/smoky/rancid |
| Acrylamide driver | **browning** (too hot / too long / sugary cold-stored spuds) — "go for gold" |
| Portions | mini · klein · medium · groot · super/XL · familiezak · mega/XXL |
| Vessels | **puntzak/cornet** (cone) · **schaaltje/bakje** (tray) + plastic fork |
| Default sauce | **mayonnaise** ("met" = with) |
| Frietkots in Belgium | **~5,000** · UNESCO-heritage *frietkotcultuur* (2017) |

---

## Game design hooks

Concrete, tunable mechanics translating the research into **Frietkot Tycoon** systems. Numbers are
suggested starting dials, not gospel — balance them in play.

### H1. Potato-quality tier (supply)
- **`potatoTier`** enum: `waxy_cheap` → `standard` → `bintje` → `bintje_premium_freshcut`.
- Effects: raises the **max achievable `crispness`/`fluffiness`**, lowers oil absorption (→ less
  "greasy" penalty), and sets **base cost per kg**. Cheap waxy potatoes hard-cap quality no matter
  how good the fryer.
- **Seasonality curve** over the in-game year: autumn = Bintje cheap & great; late spring =
  pricier, higher-moisture (soggier) and higher-sugar (browns/acrylamide faster). A yearly
  `potatoSeasonMod` (−cost/+quality in autumn, inverse in spring) that nudges buying strategy.
- **Fresh-cut vs frozen**: `freshCut` bool. Fresh-cut = higher quality + "Vlaamse friet"
  authenticity badge, but adds **prep labour/time** (must cut & soak & dry). Frozen = faster, cheaper
  labour, quality penalty and no authenticity badge.

### H2. Double-fry upgrade + blanch buffer
- Early shop = **single fry** (fast, quality-capped ~"klassiek" at best, decays fast).
- Buy **"Double-fry / pre-blanch station"** upgrade → unlocks the real quality ceiling.
- Introduces a **blanch buffer** resource: pre-blanched fries prepared during downtime; second fry is
  quick and to-order. **Rush management**: if the buffer runs dry at lunch/night rush, you either
  serve slow (queue anger) or skip the blanch (quality hit). Dials: `blanchTime`, `bufferCapacity`,
  `secondFryTime`.
- Optional **"rest timer"** realism: fries blanched-then-immediately-finished (no rest) get a
  crispness penalty.

### H3. Fry-texture control (the matching mini-game)
- **`crispness` 0–100 stat** per batch, from the §4.1 scale (double-ended: both 0 and 100 are
  defects).
- Player levers that move it: **second-fry temperature & time**, **basket load** (overcrowd = temp
  crash = soggier), **oil freshness**, **potato tier**, **fresh vs frozen**.
- **Customer archetypes have a preferred band** (e.g. *Kids/soft-fans* like 20–40; *Classic Belgian*
  40–60; *Crisp purist* 65–85). Score each sale by **distance from that customer's preferred band** →
  tip/reputation. Turns "make fries" into an active targeting task, not a max-out slider.
- **Serving delay** decays crispness in real time (fries soften in the cone) → pressure to serve
  fresh; a closed **schaaltje** steams them softer than an open **puntzak** (tiny packaging tradeoff).

### H4. Oil-freshness meter (0–100) — the shady mechanic
- **`oilFreshness` 0–100** (100 = fresh light-gold, 0 = black rancid). Also track **`oilColor`** for
  visuals.
- **Decays with use**: each batch fried subtracts; overheating and unfiltered crumbs accelerate
  decay. **Daily filtering** slows decay; **top-up** partially restores; **full change** = 100 but
  costs money for new fat.
- Effects as it drops:
  - **Taste/quality** falls (greasy, off-flavour) → lower ratings/tips.
  - **Crispness ceiling** drops and fries **darken** (visual browning) → drifts toward the
    over-browned defect + higher **acrylamide flag**.
  - Below thresholds, **smoke/foam events** and a **"rancid smell"** debuff that repels customers.
- **The shady choice:** *don't refresh the oil* → save the fat cost now, but accumulate
  **health/quality debt**. Ties directly into H5.
- Dials: `oilDecayPerBatch`, `filterEfficiency`, `topUpAmount`, `changeCost`,
  thresholds at e.g. 60 (taste dip), 35 (dark fries/acrylamide), 20 (smoke/smell), ~0 (TPM "illegal").

### H5. Health inspector (AFSCA / FAVV) + Smiley rating
- Random/periodic **inspections**. Inspector checks **oilFreshness (TPM analogue)**, fry colour
  (acrylamide/"go for gold" rule), and general hygiene.
- Outcomes: pass → **public "Smiley" hygiene rating** (reputation buff, more customers) / warning →
  fine → **temporary shutdown** for repeat old-oil / burnt-fry violations.
- Makes the "never change the oil" shortcut a **risk/reward gamble**: cheaper per-day, but rising
  probability of a costly write-up and reputation crash. Dial: `inspectionChance`,
  `oilFailThreshold` (~TPM 24–25 analogue), `acrylamideFailColor`.

### H6. Frying fat as a strategic choice
- **`fryFat`** enum: `veg_oil` · `oil_beef_blend` · `beef_tallow`.
  - `beef_tallow`: **+flavour/authenticity**, higher smoke point (more forgiving hot fry), **higher
    cost**, and **excludes vegetarian/halal customers** (lost demand segment) + a beef-fat "smell"
    ambiance flag.
  - `veg_oil`: cheaper, longer-lasting, **serves everyone**, but **−authenticity flavour** (purists
    dock you).
  - `oil_beef_blend`: middle ground.
- Interacts with H4 (tallow is more stable → decays slightly slower) and with market segments
  (unlock veg option to capture vegetarian/halal/kosher demand). A clean **cost vs flavour vs
  market-reach** triangle.

### H7. Size SKUs (price & cost ladder)
- SKUs: **mini, klein, medium, groot, super/XL, familiezak, mega/XXL** with rising `portionGrams`,
  `cost`, `price`, and `margin`.
- **`familiezak`** = group/household sale (bigger ticket, feeds multiple sat-count). **`mega/XXL`** =
  novelty item: low margin but **hype/social-media buzz** generator (reputation/marketing hook, e.g.
  a "monster cone challenge").
- Upsell mechanic: **"grote met?"** — nudging customers up a size and adding sauce raises ticket.

### H8. Sauce & serving layer (cosmetic + upsell)
- **Mayo default ("met")**, plus a **sauce menu** (andalouse, samurai, curry ketchup, stoofvleessaus,
  joppie, tartaar…) as **cheap high-margin add-ons** and **regional flavour** (Flanders vs Wallonia
  vs Brussels menus, §6).
- **On-top vs apart** as a tiny preference toggle (apart keeps fries crisp longer → interacts with
  crispness decay).
- **Vessel choice** (puntzak vs schaaltje) as authenticity/décor cosmetic; snack sides (frikandel,
  bicky, mitraillette, kroket) as menu expansions.

### H9. Authenticity / reputation score (meta)
- Composite **`authenticity`** from: Bintje + fresh-cut + double-fry + beef fat + puntzak +
  proper mayo + eaten-fresh. High authenticity = "Vlaamse friet" prestige, tourist/purist demand,
  press/awards. Lets the player choose a **lane**: cheap high-volume veg-oil frozen shop vs
  slow-food artisan frietkot — both viable, different customer bases.

---

*Compiled from web research, July 2026. Key sources cited inline. Cross-check specific temperatures/
percentages against a couple of pro frituur references before hard-coding balance, since exact
figures vary by source and by shop.*
