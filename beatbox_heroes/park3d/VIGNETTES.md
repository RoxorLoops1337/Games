# Beatbox Heroes: VIGNETTES (production script)

"Every action has a little scene." This is the screenplay and storyboard for every player action in the game, written against
the generic cutscene API of `park3d/cine.js` (not merged yet). It is a design document: nothing here changes a rule in
`core.js`. A vignette is presentation of what `Core.apply` already decided.

Sources read for the inventory: `core.js` (every `Core.apply` case, FOODS, JOBS, MINGLE, MORNING_EVENTS, SOUNDS, ACHIEVEMENTS,
STORY, COACH_LINES, OPPONENTS, FINALS, CREW, the bar programme), `places.js` (every `S.row` in every place, the shop, the hood map),
`r3/spotmap.js` (3D spot ids to actions), `activity.js` (the return ticket), `minigames.js` (run, tuner, beat maker, sound recorder,
stream, coaching, crew, songs), `r3/scenes_train.js` (IDLE / PLAY training), `game.js` (fx playback, morning card, goals),
`screens.js` (the intro plates), and the 3D world modules for real anchor names and furniture.

Contents

0. Ground rules (lengths, repeats, skip, sync with Core, handback, notation)
1. Action inventory (every action, where it comes from, which vignette plays)
2. P1: everyday actions (seen constantly)
3. P2: milestones (seen once or a few times)
4. P3: delights (ambient, rare, optional)
5. Missing moments (scenes with no trigger today, with proposed triggers)
6. Props to build (procedural, low poly)
7. Shared clip list (new character animations)
8. Trigger table (fx and actions to vignette ids)
9. Counts and the top 10

---

## 0. Ground rules

### 0.1 What a vignette is

A short, staged, skippable scene that plays when the player does something. It replaces "toast appears over a frozen hero"
with "the hero does the thing, and something small and human happens". Most are 1 to 4 seconds. They are never the place
where a rule lives, and they never ask the player for input (the mini games already do that).

Design pillars (read these before writing a new one):

- **Rhythm first.** Every vignette is cut to a pulse (default 100 bpm, 0.6 s per beat; use the place's music bpm when
  one is playing). Sound effects land on beats. The best gags are ordinary sounds that turn into beatbox sounds: the blender, the
  kettle, the stomach growl, the phone buzz, the zipper, the dishwasher. This is the game's signature: the world is a drum kit.
- **One beat per scene.** One small human moment, then out. If a vignette has two jokes, cut one and save it for a variant.
- **The payoff is the number.** The toast ("Hunger +30") and the HUD bar change fire on the PAY cue inside the vignette, so
  the scene and the reward are one moment, not two.
- **Never slower than the menu.** A routine vignette must not make an action feel slower than it does today. If a player
  spams an action, the vignette shrinks (MICRO form), it never queues.
- **Silence is allowed.** The emotional beats (Foxy covering rent, BeeAmGee's daughter, a lost battle) use a held shot with no
  music for 0.6 to 1.2 s. Kojima rule: the pause after the line is the line.

### 0.2 Length forms and the repeat counter

Every vignette id has up to four forms. The player sees them in this order:

| Form | When | Target length | What it keeps |
|---|---|---|---|
| FIRST | the first time this id plays on this save | 4 to 10 s | everything, plus a one-line caption or name card if useful |
| FULL | plays 2 to 5 | 2.5 to 6 s (routine: 2.5 to 4 s) | the full beat; rotate between the listed variants, never the same one twice in a row |
| SHORT | play 6 and later | 1.2 to 2.5 s | the action and the PAY cue, no setup shot |
| MICRO | the same id fired less than 20 real seconds ago, or the player has Scenes set to Short | 0.5 to 1.0 s | one clip in the gameplay camera, the sfx, the PAY cue. No cut, no letterbox |

Storage: a per-slot counter object, `vig[id] = { n, last }`. Put it under a NEW key (proposal: `bbh:vig<slot>` in localStorage,
or `ch.flags.vig` if it should travel with cloud saves). Never rename existing keys (CLAUDE.md rule 3). Losing it is harmless:
the player just sees FIRST forms again.

Random variants use a seeded pick: `BBH.rng(day * 131 + n)` so a replayed day looks the same in tests.

### 0.3 Skip and settings

- **Tap once**: jump to the PAY cue (the reward still lands, 300 ms), then hand back.
- **Tap twice or hold 0.4 s**: hand back at once (PAY fires instantly).
- **Settings > Scenes: Full / Short / Off.** Short forces SHORT or MICRO for everything except P2 milestones (which play SHORT).
  Off plays MICRO for P1 (a single clip, no camera change) and a 1.5 s title card for P2. Default: Full.
- A vignette can never be the reason the player cannot act: input unlocks 200 ms before the last frame, and a tap buffered in
  those 200 ms is delivered to gameplay.
- Tests and `?fast=1`: all vignettes play MICRO with ramp x8, so suites do not slow down.

### 0.4 Sync with Core

`Core.apply` stays instant and pure. The flow for every action:

1. The handler calls `G.doHold(action)` (it already exists: the fx are held, not played).
2. The vignette director picks a vignette id from the action and the held fx (section 8) and plays it.
3. At the cue `PAY` the director calls `held.play()` (toasts, sfx, HUD bar tweens). Big fx that have their own scene
   (`levelup`, `achievement`, `unlock`, `soundUnlocked`, `story`, `morning`) are not toasted: they are queued as P2 vignettes
   that play after the current one, in this order: story, soundUnlocked, levelup, achievement, unlock. At most two P2
   vignettes chain; the rest collapse into one combined card ("LEVEL 6 + NEW SOUND + 2 UNLOCKS").
4. Failure (Core refused: toast with kind 'warn', no state change) plays a REFUSAL micro scene instead (section 2.15).

### 0.5 Handback contract

Every vignette ends in the gameplay state the existing code expects (`activity.js` return ticket rules):

- The hero stands at the spot that launched the action, facing it (`R3Spots.land`), at the controls camera pose for that
  place. The last shot of every vignette is a 300 ms ease from the vignette camera into that exact pose ("land shot"), so the
  cut back to gameplay is invisible. Letterbox bars retract over the same 300 ms.
- If the action reopens a menu (eating keeps the kitchen menu open, mingle reopens the regular's sheet, the shop panel stays),
  the menu slides out of view when the vignette starts and slides back on the land shot. It is never destroyed and rebuilt.
- If the action moves time across a boundary (the jam starts, a place closes, 20:00 bedtime, 02:00 collapse), the boundary
  vignette (P2 or P3) plays after the land shot, never inside the routine one.
- If the action leads into a mini game scene (`E.go('rhythm' | 'run' | 'tuner' | 'seq' | 'ear' | 'pose' | 'studio')`), the
  vignette is an INTRO that ends on the mini game's first frame (crossfade 250 ms), and an OUTRO plays on return before the result
  card. The result card buttons (AGAIN / BACK / CONTINUE) are unchanged. AGAIN skips both INTRO and OUTRO (MICRO only).

### 0.6 Notation

Each scene is written as:

```
id            the vignette id (lowercase, dotted), stable: tests and the counter use it
Trigger       the Core action / fx and the UI entry point
Where         world + anchor (real anchor names from the park3d modules)
Length        FIRST / FULL / SHORT in seconds (MICRO is always the single key clip, 0.5 to 1.0 s)
Shots         numbered; [start s] SIZE + angle, lens, move. Blocking. Clip. Props. Light. Sfx. Text.
Beat          the one human moment
Vars          variations (time of day, mood, energy, success / failure, repeats)
Hand          what the last frame is, which menu returns
```

Shot sizes: WS wide, MS medium, MCU medium close, CU close, ECU extreme close, INS insert (an object), OTS over the shoulder,
TOP overhead, LOW low angle, POV. Lens: fov in degrees (gameplay interiors use 34; 24 to 28 is "long lens, intimate", 45 to 55 is
"wide, comic"). Moves: push, pull, pan, tilt, orbit, crane, handheld (small noise), whip (fast pan used as a cut), hold.

cine.js verbs used (generic API, as briefed): `shot{pos,target,fov,move}`, `cut`, `xfade(ms)`, `letterbox(on, ms)`,
`place(actor, anchor)`, `walkTo`, `face`, `play(clip, opts)`, `mood`, `lookAt`, `hold(prop)`, `prop.spawn / attach / drop`,
`light(cue)`, `fx(particles)`, `sfx`, `music(duck | sting | stop | resume)`, `sub(text)`, `card(title, sub)`, `ramp(timeScale)`,
`skipTo(cue)`, cues `PAY` and `LAND`.

### 0.7 Shared staging kit (reused by many scenes)

- **Time ramp montage (TRM)**: for actions that spend 60 to 240 game minutes (jobs, idle training, tape, date). Three to four
  1 s micro shots joined by whip pans, the HUD clock digits flip on each cut (sfx: mechanical clock flip on the beat), the window
  light / sky moves with `lighting` time of day. A small "+30 MIN" chip rides the clock. The last shot is always the hero, a bit
  more tired or a bit happier than the first.
- **Clock flip**: HUD clock rolls its digits instead of jumping (any action that costs time). Costs nothing, do it everywhere.
- **Mood colour**: mood < 30 grades the vignette 10% cooler and drops the music a third; mood > 80 adds a warm bloom lift.
- **Low energy overlay**: energy < 22: hero clips play at 0.85 speed, a slump layer (shoulders down, head tilt), one yawn
  inserted at the first natural pause. Hunger < 22: one stomach growl per scene (it is a kick drum, see `p3.growl`).
- **Night variants**: after 20:00 interiors use the lamp light cue; outdoors use street lamps and the neon reflections from
  `fx_weather` if it rains. Lines in captions switch to lowercase after 00:00 (the game already does this for tired NPC lines).
- **Name card**: Kojima style freeze frame, 1.2 s: the frame desaturates except the character, a hand written name and role
  slides in ("ROHZEL / runs the bar / has seen everything twice"). Used once per character (`p2.meet.*`).
- **Beat-quantised coins**: any cash gain shows coins that land on the next beats, one clink per beat, pitched up a semitone
  each. Cash loss: a single soft "pff" (the Pf snare) as the notes fold away.

---

## 1. Action inventory

Every player action in the game today, where it is triggered (2D hotspot key, 3D spot id from `r3/spotmap.js`), what it costs in
game time, and the vignette that covers it. Dev actions (`Core.dev`) and pure bookkeeping (`flag`, `seqsave`, `rename`, `at`)
get no scene.

### 1.1 Home (world `flat`)

| Action (Core) | Entry (2D hot / 3D spot) | Game time, cost | Vignette |
|---|---|---|---|
| `eat` home, 6 foods | kitchen / kitchen | 15 min, $1 to $6 | `p1.eat.<food>` |
| `nap` | bed / bed > NAP | 90 min, +22 energy | `p1.nap` |
| `sleep` (after 20:00) | bed / bed > SLEEP | ends the day | `p1.sleep` then `p1.wake` |
| refused sleep before 20:00 | bed | none | `p1.refuse.sleep` |
| couch REST (`wait` 30 + mood) | couch / couch | 30 min | `p1.couch.rest` |
| `tape` (VHS, once a day) | couch / couch | 60 min | `p1.tape` |
| TALK TO FOXY (tip) | couch, or tap Foxy / npc foxy | none | `p1.talk.foxy` |
| SKILLS panel | desk / desk | none | `p3.desk.stats` (tiny) |
| `stream` GO LIVE | desk / desk | 60 min, once a day | `p1.stream` |
| MY SONGS panel | desk, booth, mixer | none | `p3.songs.wall` |
| HOW TO PLAY | desk | none | none |
| QUICK PRACTICE (`train` q 0.4) | desk, booth | 60 min | `p1.train.quick` |
| training menu: `trainIdle` x4 stats | booth / booth | 15 to 240 min | `p1.train.idle.<stat>` (bookends) |
| training menu: `trainGame` ear, tune, beat, make, pose | booth / booth | 20 to 25 min | `p1.train.play.<game>` (intro/outro) |
| PITCH TUNER (`tune`) | booth lab rows | 60 min | `p1.train.play.tune` |
| BEAT MAKER (`seqtrain`, `seqsave`) | booth lab rows | 60 min | `p1.beatmaker` |
| `release` a song | beat maker | none | `p2.release` (first) / `p1.release` |
| SOUND RECORDER (`recorded`) | booth lab rows | none | `p1.record` |
| WARDROBE (`equip`) | wardrobe / wardrobe | none | `p1.wardrobe` |
| leave the flat | door / door | none | `p1.door.out` |

### 1.2 Park (world `park`)

| Action | Entry | Game time, cost | Vignette |
|---|---|---|---|
| BUSK (`perform` busk, endless) | spot / busk | 15+ min | `p1.busk.in` / `p1.busk.out` |
| BUSK HARD | spot / busk | 15+ min | same, variant HARD |
| AUTO BUSK | spot / busk | 15+ min, smaller pay | same, variant AUTO |
| JOIN THE CYPHER (`perform` jam) | jam / jam (12:00 to 18:00) | 60 min | `p1.jam.in` / `p1.jam.out` |
| JUST LISTEN (`jamWatch`) | jam / jam | 30 min | `p1.jam.listen` |
| jam not on | jam | none | `p1.refuse.nojam` |
| bench REST (`wait` 30 + mood) | bench / bench | 30 min | `p1.bench.rest` |
| GO FOR A RUN (`run`) | bench, run / run | 60 min | `p1.run.in` / `p1.run.out` |
| ODD JOB flyers (`job` flyers) | bench, flyers / flyers | 90 min, +$14 | `p1.job.flyers` |
| PRIVATE COACHING (`coach`) | bench (BeeAmGee) | 90 min, $50 | `p1.coach.pro` + `p2.coach.line.<n>` |
| FREE LESSON (`train` where coach) | bench (BeeAmGee) | 60 min, once a day | `p1.coach.free.<stat>` |
| TALK TO BEEAMGEE (tip) | bench / npc beeamgee | none | `p1.talk.bmg` |
| empty bench (before meeting) | bench | none | `p3.bench.graffiti` |
| `story` bmgMeet | arriving in the park | none | `p2.story.meet` |
| leave | gate / gate | none | `p1.door.out` (park gate variant) |

### 1.3 Thrift shop (world `shop`)

| Action | Entry | Cost | Vignette |
|---|---|---|---|
| browse HATS / TOPS / SHADES tabs (try on, no Core) | hats, racks, mirror / same | none | `p1.shop.tryon` |
| `buy` | shop panel BUY | $20 to $140 | `p1.shop.buy` |
| `equip` (WEAR IT) | shop panel | none | `p1.shop.wear` (mirror check) |
| ODD JOB shelves (`job` shelves) | counter / counter, npc clerk | 120 min, +$20 | `p1.job.shelves` |
| CHAT with the clerk | counter | none | `p1.talk.clerk` |
| leave | door | none | `p1.door.out` |

### 1.4 Sound Lab (world `lab`)

| Action | Entry | Cost | Vignette |
|---|---|---|---|
| training menu at the mic (studio, $15) | mic / mic | 15 to 240 min | `p1.train.*` studio variants |
| mixer: PITCH TUNER, BEAT MAKER, SOUND RECORDER, MY SONGS | mixer / mixer | as home | `p1.train.play.tune`, `p1.beatmaker`, `p1.record` (studio variants) |
| JUKEBOX (pick a track) | mixer | none | `p3.jukebox.lab` |
| leave | door | none | `p1.door.out` |

### 1.5 The Bar (world `bar`; performances use rhythm venues `bar`, `showcase`, `arena`)

| Action | Entry | Game time, cost | Vignette |
|---|---|---|---|
| PLAY OPEN MIC (Tue to Thu) | stage / stage | 90 min | `p1.stage.in.openmic` / `p1.stage.out` |
| PLAY THE SHOWCASE (Fri) | stage | 120 min | `p1.stage.in.showcase` / `p1.stage.out` |
| KARAOKE (Sun) | stage | 75 min | `p1.stage.in.karaoke` / `p1.stage.out` |
| battle vs 7 opponents (Sat) | stage > opponent > taunt dialog | 75 min | `p1.battle.walkout`, `p1.battle.verdict` |
| THE WORLD CUP (3 finals) | stage | 45 min each | `p2.worldcup.*` |
| bar closed (Monday) | street door | none | `p1.refuse.closed` (bar variant) |
| JUICE BAR food (`eat`, not home) | counter / counter, npc rohzel | 15 min | `p1.eat.<food>` bar variant |
| YOUR CREW (`recruit`) | counter | $80 to $1500 | `p2.crew.<id>` |
| ODD JOB dishes (`job` dishes) | counter | 120 min, +$24 | `p1.job.dishes` |
| CHAT WITH ROHZEL | counter / npc rohzel | none | `p1.talk.rohzel` |
| mingle CHAT (`mingle`, 5 outcomes) | tap a regular / npc regular0..2 | 45 min | `p1.mingle.<outcome>` |
| ASK OUT (`date`, $25) | regular's sheet | 120 min | `p2.date.first`, `p1.date` |
| leave | door | none | `p1.door.out` |

### 1.6 Street, hood map, travel

| Action | Entry | Cost | Vignette |
|---|---|---|---|
| `travel` into a place | street door / street spots park..bar | 10 min | `p1.door.in.<place>` |
| `travel` refused (closed, not yet open) | door | none | `p1.refuse.closed` |
| hood map: GO THERE | map spot / hood pins | 10 min | `p1.travel.map` |
| walking the street | street | none | ambient: `p3.street.*` |

### 1.7 Fx that deserve their own scene (not actions, but consequences)

| Fx | Source | Vignette |
|---|---|---|
| `morning` (cause sleep / collapse, lines) | endDay | `p1.wake` + `p2.morning.<event>` + `p2.rent.*` |
| `levelup` | gainXp | `p2.levelup` |
| `achievement` (26) | afterChange | `p2.ach` (+ specific ones) |
| `unlock` (cosmetic) | sweepUnlocks | `p2.unlock.cosmetic` |
| `soundUnlocked` (9 unlockable sounds) | sweepSounds | `p2.sound.<id>` |
| `story` (firstJam, sightJam, sightBusk, meet, pigpen, famous) | storyAfter / bmgMeet | `p2.story.<id>` |
| `jamStart` | spend crossing 12:00 | `p2.jam.start` |
| `levelUp` (training game level) | trainGame | `p2.train.levelup` |
| `coachLine` (10 lines) | coach | `p2.coach.line.<n>` |
| `battleResult` | battle | `p1.battle.verdict` |
| `result` (perform) | perform | `p1.*.out` |
| collapse at 02:00 | spend | `p2.collapse` |

---

## 2. P1: everyday actions

The scenes the player sees every in-game day. Budget: FULL 2.5 to 4 s, SHORT under 2 s. Build these first.

### 2.1 Eating

Shared skeleton `p1.eat` (all six foods share shots 1 and 4; shot 2 and 3 are per food):

```
id        p1.eat.<food>   (banana, oats, dates, bowl, smoothie, tea)
Trigger   Core 'eat' with a.home (kitchen menu) or without (bar JUICE BAR). Menu: foodRows, it reopens after each meal.
Where     flat / kitchenSpot (counter run, hob, sink, blender, fridge with the rent notice, table + stools)
          bar / counterSpot (Rohzel behind the counter at anchor rohzel)
Length    FIRST 5.0 | FULL 3.0 | SHORT 1.6
Shots
 1 [0.0] MS 3/4 from the table side, fov 34 (gameplay framing, no cut on SHORT). Hero turns to the counter. Food prop appears
         in hand from the counter (or Rohzel slides it along the bar in the bar variant). sfx per food (below).
 2 [0.6] per food: the prep beat.
 3 [1.4] per food: the bite beat. PAY on the bite (hunger bar fills, toast "Berry Oats: hunger +30").
 4 [2.4] LAND: hero puts the dish down (the dish stays on the counter as a dirty-dish prop until the next sleep; up to 3 pile up).
Hand      kitchen menu slides back in. Hero at kitchenSpot facing the counter.
```

Per food (shots 2 and 3, props, the beat):

- **Banana** ($1). Prop: banana with a 3 strip peel (peel strips are 3 bones on a prop rig, or 3 swap meshes). Shot 2: CU,
  the hero peels in three quick pulls, each pull a hi-hat "t" on the beat. Shot 3: one big bite, chew clip. Beat: the hero tosses
  the peel at the compost bin without looking. FULL variants: (a) it goes in, a tiny fist pump; (b) it misses, hero stares at it,
  picks it up, puts it in by hand; (c, after 10 bananas) it goes in behind the back, hero blows on the finger like a gun.
- **Berry Oats** ($3). Prop: bowl, spoon, a few berry spheres. Shot 2: hero stirs (stir clip), steam wisps. Shot 3: blows on the
  spoon, eats, eyes close for one beat (the "warm" face). Morning variant (before 10:00): Foxy's bowl from the morning event is
  the same bowl. Low mood variant: eats standing, staring out of the window, the spoon taps the bowl on the 2 and 4.
- **Date Balls** ($2). Prop: small tub, 3 brown spheres. Shot 2: hero flicks one up (toss clip). Shot 3: catches it in the
  mouth. Kick drum on the catch. 1 in 4: it bounces off the nose, hero catches it with the other hand, eats it anyway, looks
  at camera. After 5 plays: the hero throws two and catches both, a beatbox "B B" double kick.
- **Burrito Bowl** ($6, the big one). Prop: deep bowl with layered colours (rice, beans, greens, salsa). Shot 2: hero carries it to
  the table, sits on a stool (sit clip). Shot 3: TOP shot, three fast fork bites in eighths, then a slow lean back. Beat: "food
  coma": the hero's eyes half close, one slow blink, hand on belly. Energy is only +4, so the joke is honest: full, not energised.
  SHORT skips the sit: eats leaning on the counter.
- **Green Smoothie** ($4). The signature eating gag. Prop: blender (already in `flat_kitchen`, needs a lid and a spinning blade
  part), glass. Shot 2: CU on the blender button; hero presses it; the blender whirs in a groove. The hero cannot help it: beatboxes
  over the blender (beatbox clip, 2 bars, "B t K t" with the whir as the bass). Shot 3: pours, drinks in one long gulp (drink
  clip), shudders at the green taste, then nods. Foxy variant (Foxy at home, hour < 11 or > 17): Foxy leans in from the couch and
  adds a hand clap on the snare. Bar variant: Rohzel's juice machine glugs instead; Rohzel taps the counter on the 2 and 4.
- **Ginger Tea** ($2). Prop: kettle (new), mug with a tag. Shot 2: kettle whistles and rises in pitch. The hero hums to match the
  pitch (hum clip), and lands it exactly when the whistle peaks: a small musical sting. If Musicality < 10 the hero is a little
  flat, winces. Shot 3: both hands around the mug, a sip, shoulders drop (relax). Night variant: after 21:00, lamp light only,
  steam lit from behind, the mug is held a beat longer. This is the "cosy" shot of the game.

Vars (all foods)
- First meal of the day before 09:00: window light cue "morning sun", birds.
- Hunger < 22: shot 1 inserts the growl (see `p3.growl`), the hero eats faster (clip speed 1.3).
- Same food 3 times in a row: the hero looks at the food, then at the camera, then eats it anyway.
- Not enough cash: `p1.refuse.cash` (the hero opens the fridge, a single lemon, closes it).
- Bar variant: Rohzel serves, a coaster slides in first, the food slides into frame and stops exactly at the hero's hand.
  Rohzel's line on a win night (green juice): no charge, a wink (only after a battle win today).
- MICRO (eating again within 20 s): one bite clip in the gameplay camera, chew sfx, PAY. No prep.

### 2.2 Bed: nap, sleep, wake

```
id        p1.nap
Trigger   Core 'nap' (bed > NAP, 90 min, +22 energy). Refused after 00:30 (too late): p1.refuse.nap
Where     flat / bedSpot (bed with patchwork blanket, nightstand lamp, laundry pile)
Length    FIRST 4.5 | FULL 3.0 | SHORT 1.6
Shots
 1 [0.0] MS side of the bed, fov 32. Hero sits on the bed (sit, exact), kicks off shoes (two thuds, kick drum x2).
 2 [0.8] Hero falls backwards onto the bed (fall_back clip), blanket puffs (dust motes fx). Lights: none change.
 3 [1.2] TOP, slow push down. TRM inside one shot: ramp x12 for 1 s, the window light slides across the floor, the clock flips +90.
         Little "z" particles rise, but they are drawn as beatbox letters: B, t, K (the latest unlocked sound joins the set).
 4 [2.2] Hero sits up (wake_sit clip), stretch. PAY (+22 energy).
Beat      the sleep letters: the hero beatboxes in their sleep. After Throat bass is unlocked, the snore is a throat bass.
Vars      Foxy home: on wake, Foxy walks past the bedroom gap, double takes at the hero. Energy was < 10: the hero needs two tries
          to sit up. Dusk nap: the window goes from day to orange during the ramp.
Hand      hero standing at bedSpot. Bed menu does not reopen (today it closes).
```

```
id        p1.sleep
Trigger   Core 'sleep' after 20:00 (bed > SLEEP). Today: fade to black, then the morning card.
Where     flat / bedSpot, then the window
Length    FIRST 7.0 | FULL 4.0 | SHORT 2.0   (the wake scene follows; together they replace the fade)
Shots
 1 [0.0] MS, hero sits on the bed, looks at the phone (phone prop, screen glow on the face). Phone shows the day's numbers:
         "+12 FANS  +$31" (sum of today's history). FIRST only: a sub "Day 1. Still here."
 2 [1.2] INS phone: the screen goes dark. Hero places it on the nightstand. sfx: soft tap (rim click).
 3 [1.8] CU nightstand lamp. Hand reaches in, clicks it off on the beat. Light cue: lamp off, room to moonlight.
 4 [2.4] WS from the doorway, hero shape under the blanket, the city skyline through the window (flat_outside windows go off
         one by one, 4 beats). Music fades to a single held pad.
 5 [3.4] Black. Hold 0.6 s. The morning sequence starts (p1.wake).
Vars      Slept after midnight ("You slept late"): skip shot 1, hero falls into bed fully dressed, shoes on, face down.
          Mood > 80: the hero smiles at the ceiling in shot 4. Mood < 30: hero lies on the side, facing the wall, eyes open for a
          beat before the lamp. Rent due tomorrow (Saturday night) and cash < rent: shot 1 phone shows the rent notice photo.
          A date today: phone buzzes once in shot 2 (a heart), the hero smiles and keeps the phone a beat longer.
Hand      none (day rollover). G.pendingMorning is shown by p1.wake.
```

```
id        p1.wake
Trigger   fx 'morning' (cause sleep). Replaces the DAY N card (the card text becomes the vignette's captions).
Where     flat / bedSpot, kitchen if a morning event needs it
Length    FIRST 6.0 | FULL 3.5 | SHORT 2.0 (+ the morning event scene, if any, + rent scene on Sundays)
Shots
 1 [0.0] Black. A title card fades up in the middle of the frame, hand stamped: "TUESDAY / DAY 2". Beat: kick on "DAY".
 2 [0.8] WS bedroom, dawn light cue (07:00), birds. The hero is a lump. Alarm on the phone: the alarm tone is a hi-hat pattern.
 3 [1.4] CU hero's face, eyes open (blink channel), one yawn (yawn clip).
 4 [2.0] MS hero sits up and stretches (stretch clip). Captions from the morning lines appear lower third, one per beat:
         "You slept well." "Streams paid $2." "Your crew brought in $18 and 3 fans." Each money line gets beat coins.
 5 [3.0] LAND: hero stands at bedSpot. PAY (all the morning numbers at once, HUD bars tween).
Beat      the office plant (see props, `office_plant`): on the windowsill, it gets a new leaf every third day. In shot 2 the sun hits
          it first. It is the box-and-plant from the intro. Players will notice it grow. Nobody mentions it until the World Cup.
Vars      Slept late: shot 3 the hero squints at the phone, groans, pulls the blanket over the head for one beat first.
          Hunger < 15 when sleeping (82% energy): stomach growl wakes the hero instead of the alarm.
          Sunday: rent scene `p2.rent.paid` or `p2.rent.short` plays after shot 4.
          A morning event (30%): `p2.morning.<event>` replaces shot 4's captions with its own scene.
          Foxy's line on day 2 to first jam ("There is a jam in the park this afternoon"): Foxy calls it from the kitchen,
          off screen, the hero shouts back "ok" (talk clip, no subtitle needed beyond Foxy's).
          Rain day (day % 5 === 0): rain on the window, the light cue is grey, the alarm is snoozed once (+0 game time, just gag).
Hand      hero standing at bedSpot in gameplay camera; the goal beacon then points where G.goal says.
```

### 2.3 Couch: rest, tape, Foxy

```
id        p1.couch.rest
Trigger   couch > REST (wait 30, mood +8)
Where     flat / couchSpot (couch, TV unit, coffee table, beanbag, string lights). Foxy sits at anchor foxy when home.
Length    FIRST 3.5 | FULL 2.5 | SHORT 1.4
Shots
 1 [0.0] MS front of the couch, fov 34. Hero drops onto the couch (sit, exact), feet up on the coffee table.
 2 [0.8] CU hero, eyes closed, head back. Ramp x6 for 0.8 s, string lights twinkle on the beat. Clock +30.
 3 [1.8] PAY (mood +8). Hero opens one eye, gets up.
Beat      feet up: the coffee table has a stack of tapes; the heel knocks one off on the downbeat. FULL variant: the hero catches it
          with the foot. Foxy home: Foxy silently puts a cushion behind the hero's head, goes back to the phone.
Vars      night: TV glow only. Mood < 30: hero hugs a cushion.
Hand      hero at couchSpot, couch sheet closed.
```

```
id        p1.tape
Trigger   Core 'tape' (couch > WATCH A BEATBOX TAPE, 60 min, once a day, Originality +0.35, mood +8)
Where     flat / couchSpot facing the TV unit and the record shelf (tapes and records already in flat_living)
Length    FIRST 7.0 | FULL 4.0 | SHORT 2.0
Shots
 1 [0.0] INS record shelf: the hero's finger runs along the VHS spines (tick tick tick, hi-hats), stops on one. Tape label is
         one of 7 battle tapes (see props `vhs_tape`), titled after real eras without real names: "LDN 99 FINAL", "TOKYO SHOWCASE
         02", "THE GARAGE TAPES", "WORLD CUP 05 SEMIS", "SOLO ROUND ONLY", "LOOP STATION NIGHT", "MUM'S BIRTHDAY (DO NOT TAPE OVER)".
 2 [0.9] CU VCR slot: the tape goes in with a satisfying clunk (kick). VHS tracking lines on the TV (reuse E.vhs look).
 3 [1.5] OTS from behind the couch: the hero on the couch, the TV shows a tiny looping low poly battle (two chibis, crowd
         ring, reuse the arena venue at 1/10 scale as a render-to-texture or just a pre-made 2 frame emissive card).
 4 [2.3] CU hero's face lit by the TV: the hero's mouth moves silently, copying the beat. A small "ORI" glyph flickers in the
         TV glow. TRM: clock +60 over the shot.
 5 [3.3] PAY. The hero rewinds (rewind sfx: a reversed snare). Stands up.
Beat      "MUM'S BIRTHDAY (DO NOT TAPE OVER)" can be picked (1 in 7): it is a home video; a kid on a sofa beatboxes badly at a
          birthday cake. The hero watches, smiles, does not rewind. (The kid is the hero. Never confirmed.)
Vars      Foxy home: Foxy watches too, sitting at anchor foxy, and does the crowd "ooooh" when the TV crowd does.
          Already watched today: refusal `p1.refuse.tape`: the hero reaches for the shelf, stops, "tomorrow" (sub).
Hand      hero at couchSpot.
```

```
id        p1.talk.foxy
Trigger   TALK TO FOXY (couch), or tap Foxy (npc foxy, street and home). Opens E.dialog with a tip.
Where     flat, wherever Foxy is (couch seat, or standing at anchor foxy)
Length    0.8 lead-in, then the dialog, then 0.6 out
Shots
 1 Two shot, 30 degree OTS on the hero, Foxy faces the hero (face), Foxy looks up from the phone (phone prop lowers).
 2 During dialog: alternate singles on each line (cut on line change), Foxy plays talk with mood from the line (happy default).
 3 Out: Foxy goes back to the phone. The hero does a small nod.
Beat      Foxy never fully puts the phone down, except for the story tips (jam nudges, Pig Pen worry): then Foxy puts the phone
          face down on the table first. That gesture is the tell that the line matters.
Vars      night (hour > 21): Foxy is sitting, wrapped in the big hoodie, lines lowercase. After a lost battle today: Foxy offers
          a fist bump without a word before the tip.
Hand      dialog closes, hero where they stood.
```

### 2.4 Desk: stream, quick practice

```
id        p1.stream
Trigger   Core 'stream' (desk > GO LIVE, 60 min, once a day, needs 20 fans). fx toast "Stream done: N viewers, $T tips, +F fans".
Where     flat / deskSpot (PC, monitor, ring light, mic arm, pad controller, gaming chair)
Length    FIRST 7.0 | FULL 4.0 | SHORT 2.0
Shots
 1 [0.0] MS from behind the monitor (the monitor edge in frame), hero sits in the gaming chair (sit), chair spins a quarter on the
         landing. Ring light cue: ON (white key light on the face, a catchlight ring in the eyes).
 2 [0.6] INS monitor: a fake stream UI, "LIVE" pill, viewer counter rolling from 0. Chat bubbles float up (3 to 6 short lines
         from a pool: "first", "B t K t!!", "do the lip roll", "is that a plant", "hi from the bus").
 3 [1.4] CU hero to the mic arm: beatbox clip 2 bars. The viewer counter climbs on each kick.
 4 [2.4] INS monitor: tips pop as coins (beat coins), hearts.
 5 [3.2] MS hero waves at the camera (wave), clicks END. Ring light OFF. PAY.
Beat      "is that a plant" appears in chat on day 1 of streaming, and the plant line comes back when the plant gets bigger.
          The hero turns to look at the plant, turns back, shrugs.
Vars      viewers < 15: chat is two lines, one is a bot ("hot singles in your area"), hero still waves. Viewers > 100: the counter
          overflows its box, the hero leans back in the chair. Low energy: the hero yawns live, chat spams "sleepy". After a
          battle win today: chat says the opponent's name.
          Refusals: under 20 fans `p1.refuse.stream` (hero sits, the counter shows 0, a cricket chirps, hero closes it);
          streamed today: the hero pats the monitor, "tomorrow".
Hand      hero standing at deskSpot.
```

```
id        p1.train.quick
Trigger   QUICK PRACTICE (desk or booth or training menu): Core 'train' q 0.4, 60 min, random stat
Where     flat / deskSpot or boothSpot, lab / micSpot (studio variant)
Length    FULL 2.5 | SHORT 1.2
Shots     one MS, hero runs the clip for the random stat (the CLIPS table in scenes_train.js: mus talk/beatbox, tech beatbox/battle,
          ori point/beatbox, show dance/wave/cheer), ramp x10 for 1 s, clock +60. PAY on the downbeat after the ramp.
Beat      the hero checks a stopwatch on the phone at the end and nods, as if 60 minutes is a lot. It is.
Hand      at the spot.
```

### 2.5 Training (booth at home, mic in the Sound Lab)

The training menu (`r3/scenes_train.js`) already plays an in-room IDLE playback with tick pops, a progress ring and STOP. Vignettes
only BOOKEND it: an entry beat before the first tick and a summary beat after the last. Never interrupt the ticks.

```
id        p1.train.idle.<stat>   (mus, tech, ori, show)
Trigger   Core 'trainIdle' (15 to 240 min). Entry plays when IDLE TRAINING starts; exit when the session ends or STOP.
Where     flat / boothSpot (padded booth, foam, mic, OCCUPIED sign), lab / micSpot (glass booth, REC lamp, ON AIR sign)
Length    entry FIRST 3.0 | FULL 1.5 | SHORT 0.8 ; exit FULL 1.5 | SHORT 0.8
Entry shots (per stat)
  mus   Hero puts on headphones (headphones_on clip, prop `headphones`), closes eyes, hums a scale. OCCUPIED sign light cue ON.
  tech  Hero cracks the knuckles, then the jaw (two rim clicks), squares up to the mic (battle stance).
  ori   Hero opens a notebook (prop `notebook`, pencil), writes "B t ? K" with a question mark, taps the pencil on the lip.
  show  Hero checks the reflection in the booth glass (or the home mirror strip), finger guns, then is embarrassed.
Exit shots
  1 MS the hero stops, pants (hands_on_knees if energy < 30), or a satisfied nod. Sign light OFF. PAY is already done by the ticks:
    the exit shows only the summary chip "+2.4 MUSICALITY (2 h)".
Studio variant: the REC lamp and ON AIR sign switch with `setRec` (lab_booth already has it). Entry adds the hero paying the $15
  into a tip box on the mixer (one coin, a "pff").
Vars      stopped early by "You ran out of energy": the hero slides down the booth wall to sit. "It is late. You stop for the night":
          the hero looks at the clock, puts the headphones around the neck. "is closing" (studio): the lab lights dim twice
          (light cue blink), the hero grabs the notebook and leaves the booth.
Hand      the training summary card (unchanged), hero at the booth.
```

```
id        p1.train.play.<game>   (ear, tune, beat, make, pose)
Trigger   PLAY in the training menu: E.go('ear' | 'tuner' | 'rhythm' mode train | 'seq' | 'pose'); result -> Core 'trainGame'
Where     booth / mic, then the mini game world (mg_ear, mg_tuner, mg_rhythm train, beat maker, mg_pose)
Length    INTRO FIRST 3.0 | FULL 1.2 | SHORT 0.6 ; OUTRO FULL 1.5 | SHORT 0.6 ; AGAIN skips both
INTRO     ear   CU hero cups an ear toward the booth monitor, two notes play (the lesson's first example).
          tune  hero taps the mic twice ("check, check" as two kicks), pitch needle on the booth screen wakes.
          beat  hero counts in with fingers "1, 2, 3, 4" on the bpm of the level; crossfade on 4.
          make  hero pulls the pad controller in (desk at home, MPC table in the lab), presses one pad: it lights.
          pose  hero cracks the neck, spotlight cue (a hard key light), the pose stage builds around the hero.
OUTRO     q >= 0.7: cheer (or a small fist pump in SHORT). q < 0.3: hero shrugs, "again" in the hero's own voice bubble, no text.
          Otherwise: nod. If the level unlocked, `p2.train.levelup` follows.
Hand      the existing result card.
```

### 2.6 Beat maker, release, sound recorder

```
id        p1.beatmaker
Trigger   BEAT MAKER (E.go('seq')) and its result (Core 'seqtrain'); seqsave is silent
Where     flat / deskSpot (home), lab / mixerSpot (MPC pad table, x1.3)
Length    INTRO FULL 1.2 | SHORT 0.6 ; OUTRO FULL 1.5
INTRO     MS hero sits at the pads, drums 4 fingers on the table edge (finger drum = the four lanes).
OUTRO     the hero plays the saved pattern back with the head nodding; if the pattern has 16+ hits the hero leans back, impressed
          with themselves; if fewer than 4 hits (cannot release) the hero stares at an almost empty grid, adds one hit, removes it.
Hand      seq result.
```

```
id        p1.release   (FIRST release is p2.release)
Trigger   Core 'release' (Beat Maker > RELEASE, needs 4+ hits, max 3 active songs)
Where     the current room (desk or mixer)
Length    FULL 2.5 | SHORT 1.2
Shots     INS phone or monitor: an upload bar fills on 4 beats, the song name typed in, "RELEASED". MS hero hits enter like a
          pianist ending a concerto. PAY (mood +6, xp). Toast "Fans start tomorrow" becomes a sub on the phone.
Vars      3 songs already earning: refusal `p1.refuse.release` (upload bar fills to 99% and stops, "Wait for one to fade").
Hand      beat maker panel.
```

```
id        p1.record
Trigger   SOUND RECORDER (E.go('studio')), each successful REC (Core 'recorded')
Where     booth or lab mic; the recorder UI is a DOM scene, so the vignette is a 3D inset behind it or a 0.8 s cut before the UI
Length    FIRST 3.0 (the first take ever) | FULL 0.8 per take
Shots     CU hero leans into the pop filter (prop `pop_filter` exists in lab_booth), REC lamp ON, makes the sound (the beatbox clip
          with a mouth shape per sound id: B lips pressed, t tongue, K open, Pf puff cheeks, LR lips flutter, TB jaw down).
          Playback: the hero hears their own sound back through headphones and does a tiny double take (it sounds like them).
Beat      FIRST: the hero records the kick, hears it back and laughs, records it again, more serious.
Hand      recorder UI.
```

### 2.7 Wardrobe and the mirror

```
id        p1.wardrobe
Trigger   WARDROBE (E.go('creator', mode wardrobe)), then Core 'equip' on save
Where     flat / wardrobeSpot (wardrobe with an open door and a full-length mirror)
Length    entry FULL 1.2 ; exit FIRST 4.0 | FULL 2.5 | SHORT 1.0
Entry     hero opens the wardrobe door (door_open clip), a sock falls out, the hero kicks it back in.
Exit      (only if the look changed) 1 MS mirror two shot: the hero and the reflection. 2 the hero turns left, right (mirror_check clip),
          adjusts the collar or hat (whatever slot changed: hat touch, glasses push, jacket tug, shoe heel lift). 3 one pose from the
          pose game moves (point, freeze, or the finger guns). PAY (mood, the wardrobe counter).
Beat      the reflection is a beat late on the final pose (just 80 ms), the hero notices, squints, does it again: in sync.
          (Cheap: the mirror copy shares the skeleton, the delay is a pose buffer read; shop_mirror already has a mirrored copy.)
Vars      nothing changed: no exit scene. Hat removed: hero ruffles hair. Gold item worn (earned): a sparkle on the item.
Hand      flat, hero at wardrobeSpot.
```

### 2.8 Park: busk, jam, bench, run, flyers

```
id        p1.busk.in / p1.busk.out
Trigger   BUSK, BUSK HARD, AUTO BUSK (E.go('rhythm', mode perform, kind busk, endless)); result -> Core 'perform' busk
Where     park / buskSpot (crate stage), passers-by (passersby.js) on the paths
Length    in FIRST see p2.first.busk | FULL 2.0 | SHORT 0.8 ; out FULL 3.0 | SHORT 1.2
IN
 1 [0.0] MS hero steps onto the crate, takes the cap off and drops it upside down in front (prop: the hero's hat if worn, else
         `tip_tin`). sfx: tin rattle.
 2 [0.8] LOW from the tin, the hero above, sky behind. Hero taps the mic (or the fist, no mic) twice, looks left and right.
 3 [1.4] crossfade into the rhythm scene on the downbeat.
OUT (from the result)
 1 [0.0] MS hero finishes, small bow. Rank picks the beat:
         S/A: passers-by stop, 2 to 4 clap (clap clip on crowd), coins rain into the tin on the beat, a kid copies a kick.
         B/C: one person claps, one coin, hero nods thanks anyway.
         D: the tin holds a single bottle cap. A pigeon looks into it. The hero looks at the pigeon.
 2 [1.6] INS tin: coins count up (beat coins). PAY.
 3 [2.4] LAND: hero steps off the crate, picks up the tin.
Vars      HARD: the hero rolls the sleeves first. AUTO: the hero sits on the crate and plays the Beat Maker pattern through a phone speaker
          (phone prop, small speaker), legs swinging, "AUTO" is visible as laziness: the hero eats a banana during it (if any banana
          eaten today; free gag). Dusk: lamps on, longer shadows. Night (after 20:00 the park is closed, so dusk is the last).
          Rain: the tin fills with water too; the hero tips it out and the coins stay (rain day only).
          First 4 busks from day 3 may trigger the BeeAmGee sighting: `p2.story.sightBusk` plays after OUT.
Hand      result card, hero at buskSpot.
```

```
id        p1.jam.in / p1.jam.out
Trigger   JOIN THE CYPHER (perform jam, 60 min, 12:00 to 18:00). Story beats after: firstJam, sightJam, pigpen, famous.
Where     park / jam (plaza by the graffiti wall, char_crowd ring, two named beatboxers)
Length    in FULL 2.0 | SHORT 0.8 ; out FULL 2.5 | SHORT 1.0
IN        MS the ring parts for the hero (two crowd members step back). The current beatboxer finishes and points at the hero (point
          clip), the hero steps in. Crowd "oh" on the step.
OUT       the hero points at the next in the ring (passing the round). Rank S/A: the ring jumps (cheer on crowd), someone daps the hero
          (fist_bump). D: polite silence, then one person shouts "again!" and the ring laughs, warm not mean. PAY includes the
          "cypher taught you" stat line as a sub ("The cypher taught you something: Technicality +0.9").
Hand      result card, hero inside the ring at the jam spot.
```

```
id        p1.jam.listen
Trigger   Core 'jamWatch' (30 min, mood +5, Originality +0.25)
Where     park / jam edge
Length    FULL 2.5 | SHORT 1.2
Shots     MS from inside the ring looking out: the hero at the edge, head nodding, arms folded. Ramp x6, clock +30. Beat: the hero's
          foot starts tapping, then the lips move, then the hero catches themselves and stops. PAY.
Hand      at the jam spot.
```

```
id        p1.bench.rest
Trigger   bench > REST (wait 30, mood +8)
Where     park / bench (the middle bench, anchors.benches[1])
Length    FULL 3.0 | SHORT 1.4
Shots     1 WS, hero sits (sit exact), arms on the backrest. 2 POV up: clouds (flora_sky), one cloud shaped like a microphone
          (a 2 percent chance, it is a sky decal). 3 ramp x6, clock +30. PAY.
Beat      a pigeon lands on the bench next to the hero. FULL variant: the hero offers a crumb, the pigeon bobs its head on the beat.
          After 10 rests: the same pigeon (a ring on its leg, prop detail) comes every time. Name card in P3 (`p3.pigeon`).
Vars      BeeAmGee there: the rest is shared; he does not talk, just nods, both look at the clouds.
Hand      hero at bench.
```

```
id        p1.run.in / p1.run.out
Trigger   GO FOR A RUN (E.go('run')), result -> Core 'run' (stamina up when goodBars >= 3)
Where     park / runStart, then mg_run_world
Length    in FULL 1.5 | SHORT 0.6 ; out FULL 2.5 | SHORT 1.0
IN        hero stretches the calf on the bench (stretch clip, leg variant), puts in one earbud, starts jogging; crossfade.
OUT       hero arrives back at runStart, hands on knees (hands_on_knees), breath puffs (cold air fx before 09:00 or rain). PAY.
          Stamina up: the hero straightens, checks the phone, "+2 MAX ENERGY" as a fitness ring closing on the phone screen.
Vars      morning (before 10:00): runners pass the hero, one nods. Low q: the hero sits on the grass instead.
Hand      result, hero at runStart.
```

```
id        p1.job.flyers
Trigger   Core 'job' flyers (bench > ODD JOB or the flyers spot, 90 min, +$14, +2 fans)
Where     park / flyers (gate corner), passers-by
Length    FIRST 6.0 | FULL 4.0 | SHORT 2.0   (TRM, 90 min)
Shots
 1 [0.0] MS hero picks up a stack of flyers (prop `flyer_stack`), squares it on the knee.
 2 [0.8] TRM shot A: hero offers a flyer (hand_out clip), a passer-by walks past without looking. Clock +30.
 3 [1.6] TRM shot B: a passer-by takes one, reads it, walks into a lamp post (or nearly; just a stumble). Clock +30.
 4 [2.4] TRM shot C: the hero folds a flyer into a paper plane, throws it on the beat; it lands in someone's hand. Clock +30.
 5 [3.2] INS the stack is gone. A cash envelope (prop `envelope`). PAY (+$14 beat coins, "A few people ask who you are" as sub).
Beat      the flyer advertises "OPEN MIC TUESDAY AT THE BAR". After the hero's first open mic, the flyer shows a tiny photo of the hero
          (a portrait texture from char_portrait.js), and a passer-by points from the flyer to the hero.
Vars      rain: the flyers are in a plastic sleeve, the hero holds one over the head as an umbrella. Low energy: shot C is replaced by the
          hero sitting on the curb handing them up.
Hand      hero at flyers spot.
```

### 2.9 BeeAmGee's bench

```
id        p1.coach.free.<stat>
Trigger   FREE LESSON (Core 'train' where coach q 0.9, once a day) then the one-line dialog ("again. good. ...")
Where     park / bench, BeeAmGee seated (npcSpecs)
Length    FULL 3.5 | SHORT 1.6
Shots
 1 Two shot, side on, both on the bench. BeeAmGee demonstrates one sound per stat, the hero copies.
   mus: he hums a note, holds a finger up until the hero matches. tech: he taps a strict pulse on the bench slat with his ring, the
   hero locks to it. ori: he plays a pattern, then deliberately breaks it, raises an eyebrow. show: he stands up for once and points
   at the back of the park, "play to the back row".
 2 ramp x8, clock +60, the sun moves. PAY. Then his dialog line (existing).
Beat      he never claps. He nods once. The nod is the reward, and after a perfect training day the nod is longer by half a beat.
Hand      bench sheet closed, hero standing at bench.
```

```
id        p1.coach.pro
Trigger   Core 'coach' (PRIVATE COACHING, $50, 90 min, +1 stat, 3 day cooldown), followed by fx coachLine (p2.coach.line.<n>)
Where     park / bench, then a walk to the fountain (terrain_fountain)
Length    FULL 5.0 | SHORT 2.5 (the coach line scene follows, it is P2 and has its own length)
Shots
 1 MS the hero holds out the $50 (prop: folded notes). BeeAmGee does not take it, points at the tip tin of the busk spot. The hero
   puts it in the tin. (He gives it to the busk spot: it is how he pays the kids back. Never explained.)
 2 WS they walk to the fountain. TRM: three shots of a real lesson (posture: he adjusts the hero's shoulders; breath: he holds a hand
   in front of the hero's mouth to feel the air; the sound: the stat's sound, hero copies).
 3 PAY (+1 stat, levelup sfx). Then p2.coach.line.<n>.
Vars      refused (cooldown): `p1.refuse.coach`: he shows three fingers, then two, then folds the hand.
Hand      after the line, hero at the bench.
```

```
id        p1.talk.bmg
Trigger   TALK TO BEEAMGEE (tip) or tap him
Where     park / bench
Length    0.8 in, dialog, 0.6 out
Shots     he does not look at the hero for the first line; he looks at the park. On the last line he looks at the hero.
Hand      dialog.
```

### 2.10 Thrift shop

```
id        p1.shop.tryon
Trigger   tapping an item tile in the shop panel (tryOn, no Core). Today: E.burst sparkle over the preview.
Where     shop / the spot that opened the tab (hatsSpot, racksSpot, mirrorSpot)
Length    MICRO only (0.6): the try-on happens many times a minute
Shots     gameplay camera with the shop focus preset (world.focus), the hero does a 0.6 s swap clip: a quick spin (top), a hat pop
          (hat lifts and drops on, kick sfx), glasses slide down the nose and up (shades). The swap happens at the middle of the spin.
Beat      every 8th try-on: the clerk glances over the counter with a raised brow (npc clerk look-at), then back to the till.
Hand      the panel never closes.
```

```
id        p1.shop.buy
Trigger   Core 'buy' (BUY $price)
Where     shop / counterSpot, clerk behind the counter
Length    FIRST 4.0 | FULL 2.5 | SHORT 1.2
Shots     1 MS over the counter, the clerk scans the tag with a hand scanner (prop, a beep that is a hi-hat). 2 the clerk folds the item into
          a paper bag (prop `shop_bag`), or for a hat, puts it straight on the hero's head. 3 cash on the counter (a "pff"). PAY.
Beat      the clerk's comment card: a sticky note slapped onto the bag with a doodle (a crown for expensive items, a cat for Cat
          Ears, a cowboy hat with a question mark for the Cowboy Hat). Pure texture swap.
Vars      not enough cash: `p1.refuse.cash` (the hero pats all pockets, pulls one inside out, a moth flies out).
          "Not in stock for you yet": the clerk taps the level on a tiny chalkboard.
Hand      shop panel, item selected, WEAR IT button ready.
```

```
id        p1.shop.wear
Trigger   Core 'equip' from WEAR IT in the shop
Where     shop / mirrorSpot (hollywood bulbs, the round try-on platform, ring light on a tripod, REAL reflection)
Length    FIRST 5.0 | FULL 2.5 | SHORT 1.0
Shots     1 the hero steps onto the platform, it rotates slowly (platform turntable on the beat, 45 degrees a beat). 2 MCU through the mirror:
          the reflection; the hollywood bulbs pop on one by one (4 beats). 3 the hero does the first move of the pose game set: freeze
          pose. PAY ("Equipped Fedora").
Beat      FIRST time only: the hero practises a "fan greeting" in the mirror (a wave, then a cooler wave, then a nod), turns and sees the
          clerk watching. Both pretend nothing happened. Clerk resumes folding.
Hand      shop panel.
```

```
id        p1.job.shelves
Trigger   Core 'job' shelves (counter > ODD JOB, 120 min, +$20)
Where     shop / the racks and the hat wall
Length    FIRST 6.0 | FULL 4.0 | SHORT 2.0 (TRM, 120 min)
Shots     TRM A: hero carries a donation box (prop `box`, hold clip carry variant), sets it down, a dust puff. B: hangers on the rail, click
          click click (hi-hats in 16ths, the fastest the hero ever is). C: the hero holds up a terrible jumper, looks at the clerk, the
          clerk shakes the head, the jumper goes into the "no" pile. D: the clerk hands over $20 in an envelope. PAY.
Beat      one item in the box is the hero's old office lanyard (intro reference). The hero holds it for a beat, then puts it in the "no" pile.
          Plays only once (`p3.lanyard`), the rest of the time D is a cat-ears headband worn by the clerk for no reason.
Hand      counter, hero at counterSpot.
```

```
id        p1.talk.clerk
Trigger   counter > CHAT
Shots     the clerk keeps folding during the line; on "you are not ready" (the cape line) the clerk looks at a curtain in the back,
          the curtain moves a little by itself.
```

### 2.11 Sound Lab extras

```
id        p3.jukebox.lab   (listed here because it is a frequent tap)
Trigger   mixer > JUKEBOX > a track (E.music(id))
Length    MICRO 0.8
Shots     the hero nods to the new track for one bar. Track 'Pigeon Pluck' (park): the hero does a pigeon head bob. 'Thrift Jazz': a
          finger snap on 2 and 4.
```

### 2.12 The Bar: stage, battles, counter, mingle

```
id        p1.stage.in.<programme>   (openmic, showcase, karaoke)
Trigger   PLAY OPEN MIC / PLAY THE SHOWCASE / KARAOKE (E.go('rhythm', mode perform)), result -> Core 'perform'
Where     bar / stageSpot (5 x 2.5 m stage, curtains, LED screen with the programme, mic stand, LIVE sign), then the rhythm venue
Length    in FIRST see p2.first.openmic | FULL 2.5 | SHORT 1.0 ; out FULL 3.0 | SHORT 1.2
IN openmic   Rohzel reads the sign-up clipboard (prop `clipboard`), says the hero's name into the house mic ("next up..."), the hero
             walks up the steps, adjusts the mic stand height (it is always too low), crowd murmur. Crossfade to venue bar.
IN showcase  the LED screen shows the hero's name in gold; backstage two shot with Rohzel, she hands the hero a water bottle
             (prop `water_bottle`), the curtain opens (curtain clip on the stage mesh). Venue showcase, pyro on the downbeat.
IN karaoke   the LED screen shows lyrics (bar.setLyrics), the hero picks the mic up and taps it, a regular whoops from a table.
OUT          S/A: a crowd wave, the hero bows (bow clip), lanyard / tips (beat coins). D: one slow clap from the back; it is Rohzel;
             it is supportive. PAY. Showcase OUT adds the cash envelope handed over by Rohzel with two hands (respect).
Hand         result card, hero at the stage spot.
```

```
id        p1.battle.walkout
Trigger   battle opponent row > taunt dialog > startBattle. The taunt dialog already exists: stage it.
Where     bar / stageSpot, then venue arena
Length    FIRST per opponent see p2.opp.<id> | FULL 3.0 | SHORT 1.2
Shots
 1 MS the opponent steps into the light (the opponent's look; mood angry), says the taunt (existing line, subtitle).
 2 CU the hero does not answer. A single breath (inhale sfx). The hero puts the mic up (hold mic).
 3 whip to the arena venue: VS card on the LED wall with both names (the arena api), judges sit.
Vars      rematch (already beaten): the opponent's taunt is replaced by a nod of respect and a fist bump, and shot 2 is a smile.
          Low energy (< 30): the hero's hand shakes slightly on the mic in shot 2 (a 2 Hz tremor layer).
Hand      the arena battle (mg_rhythm_battle).
```

```
id        p1.battle.verdict
Trigger   fx 'battleResult' (out.votes, 5 judges, 3+ = win)
Where     venue arena (judge tier with five desks and glowing score displays)
Length    FIRST win see p2.first.battlewin | FULL 5.0 | SHORT 2.0
Shots
 1 [0.0] WS, both on their podiums, lights down to the judge tier. Drum roll (a throat bass rumble if the hero has TB).
 2 [0.8] Each judge raises a scorecard (prop `scorecard`, exists) one per beat, left to right: Tek, Mel, Origi, Showtime,
         Wildcard. The card points at the side that won that judge (an arrow on the card). Each card is a sfx: kick for the hero,
         snare for the opponent.
 3 [3.4] Result: WIN: MCU the hero, cheer, the opponent's `defeat` line (subtitle). LOSE: MCU the hero, sad clip for 1 beat,
         then the hero offers a hand to the opponent; the opponent takes it (or not: Pig Pen does not, the first time).
 4 [4.4] PAY (cash, fans, xp, mood). Arena crowd confetti on a win.
Beat      Wildcard's card is always last and sometimes upside down. Wildcard turns it the right way round, looks at it, shrugs.
Vars      3-2 split: the camera holds an extra beat before Wildcard. 5-0 sweep: all five cards rise at once on one hit.
          World Cup finals: see p2.worldcup.
Hand      the battle result screen, then back to the bar at the stage spot.
```

```
id        p1.mingle.<outcome>   (juice, napkin, liproll, tradebars, awkward)
Trigger   Core 'mingle' (tap a regular > CHAT, 45 min). The MINGLE entry decides the outcome. The sheet reopens.
Where     bar / the regular's table (table0 etc., regulars from bar.regularOf) or the banquette
Length    FIRST per regular 3.5 (with p2.meet name card) | FULL 2.5 | SHORT 1.2
Shots     the hero sits with the regular (sit at a stool), then the outcome beat:
  juice      "loves your last set and buys you a green juice": the regular raises a hand, Rohzel slides a green juice down the
             counter, it stops exactly at the hero. The hero drinks. PAY (mood, hunger).
  napkin     "shares a beat idea on a napkin": INS a napkin with a hand drawn grid (B t K t with arrows). The hero turns it
             sideways, it makes more sense. PAY (Originality).
  liproll    "teaches you a lip-roll trick": the regular does a lip roll, the hero tries, spits a little, they both laugh. PAY (Tech).
  tradebars  "trade bars until the bar closes its tab": both beatbox across the table, the next table turns around. PAY (fans).
  awkward    "not in the mood. Awkward silence.": two shot, both look at their drinks. A long silence of 2 beats, the jukebox changes
             track. The hero gets up. PAY (mood -4). No music for the silence.
Vars      affinity 8+: the regular saves the hero a seat (a jacket on the stool) before the hero arrives.
Hand      the regular's sheet reopens (CHAT / ASK OUT).
```

```
id        p1.date
Trigger   Core 'date' (ASK OUT $25, affinity 4+, 120 min). FIRST is p2.date.first.
Where     the date location is picked by the regular (deterministic per who): park fountain at dusk (Luca, Roo), the bar jukebox
          (Mira, Pascal), the thrift shop mirror after closing (Sky), the Sound Lab booth (Jin, plays the hero a song)
Length    FULL 5.0 | SHORT 2.5 (TRM, 120 min)
Shots     TRM of three moments: the walk there side by side (both walk, a small gap between them that closes by shot 3), the shared
          thing (the place's beat), a laugh. PAY (mood +18).
Beat      shot 3 always ends with the two of them beatboxing the same pattern without having agreed on it.
Hand      bar, hero at the regular's table (the core action does not move the place).
```

```
id        p1.talk.rohzel
Trigger   counter > CHAT WITH ROHZEL, or tap her (npc rohzel)
Shots     she is always polishing a glass. On the Pig Pen line ("Do not engage. Beat him on stage instead.") she puts the glass down hard.
```

```
id        p1.job.dishes
Trigger   Core 'job' dishes (counter > ODD JOB, 120 min, +$24, "You hum beats the whole time")
Where     bar / behind the counter (a sink behind the back bar; new small prop set: sink, rack, glasses)
Length    FIRST 6.0 | FULL 4.0 | SHORT 2.0 (TRM)
Shots     TRM A: hero ties an apron (prop `apron`), sleeves up. B: glasses squeak clean on the beat (squeak = a hi-hat with pitch),
          the hero hums. C: a stack of glasses wobbles, the hero freezes, it settles. Rohzel does not look up. D: Rohzel counts $24 into
          the hero's hand, note by note, one per beat. PAY.
Beat      the dish rack clicks, the tap drips on the off-beat, the glasses ring: by shot B the sink is a drum kit and the hero is playing
          it. On a karaoke Sunday the regulars sing along to it.
Hand      counter, hero at counterSpot.
```

### 2.13 Doors and travel

```
id        p1.door.out / p1.door.in.<place>
Trigger   leaving a place (door / gate spot, LEAVE button: G.leavePlace) and Core 'travel' into a place (10 min)
Where     the door anchors (flat doorSpot, shop door, lab door, bar door kind 'door', park gate); street door spots
Length    FULL 1.2 | SHORT 0.5 (doors are the most frequent scene in the game: keep them short)
OUT       hero walks into the door ring, door opens (door_open), outside light spills in (light cue per time), cut.
IN        the reverse from the inside: the door opens toward the camera, the hero enters, the place's ambience swells (music crossfade).
          Clock flip +10 on the street side.
Per place IN detail (FULL only, one beat each):
  home    hero drops the keys in a bowl by the door (rim click). Foxy home: Foxy says "hey" without looking up.
  park    the gate creaks in a two-note pattern; pigeons lift off the path.
  shop    the door bell (two notes), the clerk says "hi" from behind a rail.
  studio  the hero pushes a heavy padded door, all outside sound cuts to silence at once (a deliberate audio cut).
  bar     the bass of the room hits on the downbeat as the door opens. Rohzel lifts a chin.
Vars      night: the hero zips up the jacket on OUT (a zipper sfx; after Zipper is unlocked it is the beatbox zipper).
          Rain: the hero shakes off the rain on IN (a shake clip, a spray fx).
          FIRST time IN each place is P2 `p2.first.<place>`.
Hand      gameplay at the place's start anchor (or the street door).
```

```
id        p1.travel.map
Trigger   hood map GO THERE (G.enterPlace from the map card)
Where     hood world (tabletop diorama)
Length    FULL 1.5 | SHORT 0.6
Shots     the tilt-shift camera follows a tiny hero token hopping from YOU ARE HERE to the target pin in three hops, one per beat; the
          pin pops. Cut to `p1.door.in.<place>` (SHORT form).
Hand      the place.
```

### 2.14 Generic: wait

```
id        p1.wait   (Core 'wait', used by couch and bench rest, and any future "pass time")
Shots     MICRO: hero idles with a small fidget, clock flip, a ramp of 0.6 s. Couch and bench have their own scenes above.
```

### 2.15 Refusals (Core said no)

Refusals are the most important P1 scenes for feel: today a refused action is a red toast and an error buzz. Every refusal is a
MICRO (0.6 to 1.0 s) in the gameplay camera, then the toast. Never a cut, never a letterbox.

| id | Core reason | The hero does |
|---|---|---|
| `p1.refuse.cash` | "Not enough cash", "The studio costs $15", "A date costs $25", coach fee, recruit cost | pats pockets, pulls one inside out; a moth flies out (once per day, else just the pocket) |
| `p1.refuse.tired` | "Too tired to train / run / sing / chat / stream / for a shift", energy < 14 at busk | yawns so wide the jaw clicks (a rim click), sways |
| `p1.refuse.sleep` | "Too early to sleep" | lies down, stares at the ceiling with eyes wide open, sits back up |
| `p1.refuse.nap` | "Too late for a nap. Go to bed." | points at the clock, then at the bed |
| `p1.refuse.closed` | place closed / not yet open / bar closed Monday | rattles the door handle twice (two snares); Monday bar: a handwritten sign "Rohzel's day off. Go outside." |
| `p1.refuse.nojam` | "Nobody here right now" | looks at the empty plaza; a single leaf blows past |
| `p1.refuse.tape` | "Already watched a tape today" | reaches for the shelf, stops, taps the tape twice, leaves it |
| `p1.refuse.stream` | under 20 fans / already streamed | the viewer counter says 0; a cricket chirps; hero closes the laptop |
| `p1.refuse.release` | too sparse / 3 songs earning | the upload bar sticks at 99 percent |
| `p1.refuse.coach` | cooldown | BeeAmGee holds up the days left on his fingers |
| `p1.refuse.battle` | cooldown / not unlocked / level | Rohzel holds up a hand: "rest up" (existing toast text) |
| `p1.refuse.date` | affinity < 4 | the regular smiles and looks at the phone; the hero sits back |
| `p1.refuse.late` | "Too late to train. Go to bed." | the hero looks at the clock, then mimes sleep with two hands under the cheek |

---

## 3. P2: milestones

Seen once or a few times per save. They can be longer (6 to 12 s for FIRST), still skippable, and they chain behind P1 scenes (see 0.4).

### 3.1 First times (one per save)

```
id        p2.intro.3d   (the new game intro, today 7 VHS plates in screens.js)
Trigger   new game (E.go('intro', next 'new'))
Length    35 to 45 s total, 7 shots, one per plate, every shot skippable to the next, SKIP ALL button
Shots     1 office at 17:12, the boss's line in a subtitle, the hero holds a cardboard box with a plant and a stapler (props box,
            office_plant). The boss is never shown above the neck.
          2 the walk home in the rain (street world, rain on high), the box gets wet, the bottom sags, the hero carries it from below.
            The hero does a tiny beatbox under the breath to the rain hitting the box (the rain is a hi-hat).
          3 the flat, Foxy on the couch; the box goes on the floor by the door (it stays there for the rest of the game, see props).
          4 Foxy's idea: Foxy points out of the window toward the park.
          5 that night, the booth: the hero practises; it is bad (the beatbox clip out of sync on purpose, 2 bars).
          6 Foxy shows the hero a phone video: the jam circle.
          7 the hero puts the plant on the windowsill and the stapler in the bin. Title card: BUSK. BATTLE. BECOME CHAMPION.
Hand      street with the Foxy tutorial dialog (unchanged).
```

```
id        p2.first.<place>   (home, park, shop, studio, bar) replaces the first-visit dialog staging
Trigger   flags.visited_<place> not set (places.js firstVisit)
Length    6 to 9 s, then the existing first lines play as dialog
home      a slow tour push from the door: kitchen, couch, booth with the OCCUPIED sign, Foxy waving from the couch. Foxy's line.
park      a crane up over the gate: the fountain, the busk crate, the bench, the graffiti wall with "beeamgee was here". A dog chases a
          pigeon through frame. Caption "THE PARK" in big type, then the existing line.
shop      the bell, then a whip pan across the hat wall (20 pegs), the mannequin's head turns (it does not: it is the clerk behind it).
studio    door cut to silence (see p1.door.in.studio), the hero's footsteps on the carpet, the REC lamp blinks once by itself.
bar       the bass hits, the disco ball turns, Rohzel's name card (p2.meet.rohzel), then her programme line.
```

```
id        p2.first.busk   (the first busk ever, achievement Street Debut)
Trigger   first p1.busk.in (n.busks === 0)
Length    IN 7 s, OUT 6 s
IN        the hero arrives at the crate carrying the office box from the intro (prop `box` with the office label). Looks at the crate,
          looks at the box. Puts the box upside down in front as the tip box. Steps onto the crate. Long breath. Nobody is looking.
          A kid on a scooter stops. That is the audience.
OUT       the kid drops a coin into the office box, scoots away. Then more coins come (beat coins, S/A) or just the kid's coin (D).
          Achievement card "STREET DEBUT" stamped over the box. The office box stays at the busk spot from now on as the tip box.
```

```
id        p2.first.openmic   (Open Mic Virgin)
IN        backstage: the hero's knee bounces (a fast hi-hat). Rohzel puts a hand on the knee, it stops. She hands over a lanyard
          (the Lanyard Pass unlock). Walk on.
OUT       the applause; the hero forgets to leave the stage; Rohzel waves them off with the clipboard.
```

```
id        p2.first.battlewin   (Battle Scarred; also first loss p2.first.battleloss)
WIN       the verdict, then the hero looks at their hands. Then the crowd. The flame hair unlock (Flame Hair is the reward) is shown
          as a quick flash of the hero's hair catching fire in the reflection of the LED wall, then normal.
LOSS      the hero walks off; the bar outside; rain if any; Foxy is waiting on the street with two green juices. No words.
          Trigger: first battle lost. 8 s. This is a key emotional scene.
```

```
id        p2.first.showcase   (Friday Headliner, Stage Suit / Golden Mic / Top Hat unlocks)
          the LED triptych spells the hero's name letter by letter on the beat; pyro on the last letter. Rohzel's two hand envelope.
```

```
id        p2.first.stream   (Going Live)  the first stream: the hero rehearses "hi everyone" three times before pressing LIVE.
                                         The viewer counter starts at 1; it is Foxy, in the next room, chat "hi it's foxy".
id        p2.first.song     see p2.release
id        p2.first.date     see p2.date.first
id        p2.first.coach    the first paid lesson plays p1.coach.pro FULL plus his line 1.
id        p2.first.recruit  see p2.crew.<id>
id        p2.first.run      after the 5th run (Morning Runner): the pigeon from the bench runs alongside for the last 2 s.
```

### 3.2 The story arc (core.js STORY, fx 'story')

Today these play as dialog lines. Stage each one; the lines stay word for word as subtitles.

```
id        p2.story.firstJam
Trigger   first finished jam (n.jams === 1)
Shots     ring POV, faces of strangers, all nodding; slow push on the hero; 3 lines as subtitles, no music on the last line
          ("Maybe this is what you needed.") Hold 1 s.
```

```
id        p2.story.sightJam / p2.story.sightBusk
Trigger   storyAfter sets bmgSighted (2nd jam or a battle win and a jam; or 4 busks from day 3)
Shots     the round ends; a focus pull (depth trick: everything near is a bit soft) to the back of the cypher / across the path: a grey
          beard, denim jacket, gold glasses. He does not move. He nods once, exactly on the downbeat. A passer-by crosses frame; when
          they have passed he is gone (swap under the occlusion). Last line "...who was that?" in the hero's thought bubble.
Beat      the nod on the downbeat: the music's kick lands with his chin.
```

```
id        p2.story.meet   (bmgMeet: arriving in the park the day after the sighting)
Trigger   storyArrive 'bmgMeet'
Length    12 s, his four lines
Shots     1 WS the bench from far away, the hero's walk is slower as they approach (walk speed 0.7). 2 he does not look up. "Saw you in the
          cypher the other day." 3 he pats the bench. The hero sits. 4 name card: "BEEAMGEE / thirty years / this bench is his office".
          5 the last line (free lesson, $50 coaching), he finally looks at the hero.
Hand      the bench with BeeAmGee, Lip roll unlock follows (p2.sound.LR: he teaches it right here).
```

```
id        p2.story.pigpen   (Pig Pen crashes the cypher at the 3rd jam)
Shots     the circle goes loud: a red bomber pushes through the ring (the ring members are shoved aside: a hit clip on two crowd members),
          name card "PIG PEN / rival / gold grill". He stares the hero down, nose to nose. Each of his 4 lines lands on a snare. On "Do not
          bring a friend" he flicks the hero's hat off (if the hero wears one) and walks off. The hero picks it up.
Beat      after he leaves, a ring member mutters something; nobody hears it; the ring laughs; the tension breaks.
```

```
id        p2.story.famous   (a famous beatboxer drops in: 5 jams and 30 fans)
Shots     mid round, the circle goes quiet; a figure in a hood (never the face, never a name: the game does not use real people) throws a
          30 second flurry at 2x ramp, in silhouette against the sun. Two friends; they walk off. The hero tries to copy the last bar and
          fails. "There is a long way to go." Hold.
```

```
id        p2.coach.line.<1..10>   (fx coachLine after each paid lesson, the ten COACH_LINES in order)
Trigger   Core 'coach' (n.coaches 1..10, the 10th repeats)
Where     park / the fountain after the lesson, both sitting on its rim
Length    6 to 10 s each, the line as subtitle; every line has its own small staging:
  1 "First time I battled was '92..."      he laughs at himself, a short one.
  2 "Every kid who comes through here..."  he does a bad bass kick on purpose, then a perfect one.
  3 "I made it to the world finals once... Never won."   he holds up three fingers without looking.
  4 "Your tongue knows more than your brain." he taps his temple, then his mouth.
  5 "It is not the win..."                  he looks at the arena posters on the park fence (a poster decal).
  6 "I had a daughter. She would be your age now."   no music. He looks at the water. 1.2 s hold. He does not continue.
  7 "She did not beatbox. She liked the violin."     he hums four notes of a violin line, slightly out of tune. Smiles.
  8 "You can hear when somebody is afraid of the mic..." he puts his hand flat over the hero's heart for one beat.
  9 "There is no secret. There are just hours..." the camera pulls back: he and the hero, small, the park big. Ramp of the sun.
 10 "Do not end up like me, kid. Find someone to come home to." he stands up and leaves first. The hero takes out the phone.
     If the hero has dated anyone, the phone shows their name; the hero sends a single heart. If not, the hero looks at the phone, puts it away.
Beat      line 6 then 7: the pause between them is three days (cooldown). Players will remember.
```

### 3.3 Battles, ladder, World Cup

```
id        p2.opp.<id>   (tick, moe, kat, doc, hexx, pigpen, vox: FIRST walkout per opponent)
Trigger   first battle against that opponent
Length    7 s each, then the normal battle
Staging   the opponent's entrance and name card, built from their look and taunt:
  tick    Lil Tick: hops on stage, does a hi-hat solo before being asked, cat noises in the crowd. Card "LIL TICK / tier 1 / all tss".
  moe     Mouthpiece Moe: talks the whole walk (talk clip, mouth never stops), the subtitles overlap each other.
  kat     Kat Cadence: a cat ear flick on each beat of the intro; walks the stage edge like a cat on a fence.
  doc     Dr. Bassline: puts on gloves (snap, snap = two snares), checks the hero's pulse with two fingers, writes on a clipboard.
  hexx    Hexx: the lights go green, a ship's bell (one hit), she walks in with a slow sway, eyepatch flip.
  pigpen  Pig Pen: he does not walk on: he is already on stage when the lights come up, sitting on the edge, eating a snack. Gold grill glint.
  vox     Vox Prime: total silence, he walks on with his mouth closed, the crowd shushes itself. The only sound is his steps.
DEFEAT    each opponent's `defeat` line gets one gesture: Tick tips an invisible hat; Moe opens his mouth and nothing comes out;
          Kat holds up eight fingers; Doc signs the clipboard and hands it over; Hexx bows like a pirate; Pig Pen (see below); Vox
          "Impossible. Do it again." and actually starts beatboxing again until security (Rohzel) taps his shoulder.
```

```
id        p2.pigpen.beaten   (beat Pig Pen, tier 6)
Shots     his line "Fine. You are real. Do not tell anyone I said that." whispered close; he takes the hero's hand in the handshake he refused
          after the first loss (callback to p1.battle.verdict); then he walks off and, at the door, does the "do not tell anyone" finger to the lips
          to the whole bar. The bar laughs.
```

```
id        p2.worldcup.<1..3>, p2.worldcup.win
Trigger   THE WORLD CUP (three finals, chained startBattle, no cooldown)
Between finals: Rohzel's water. Her existing line: "i will pour you a water between them". Stage it: 3 s, backstage, she pours, the hero
          drinks, she takes the empty glass back, says nothing. After final 2 she pours two glasses and drinks one herself.
Penny (wc3) entrance: no music, a single pink spotlight, Penny already holding the gold mic, the line "Welcome to the top. It is lonely and very
          loud." The crowd starts on the word "loud".
WIN       12 to 20 s, the only long scene in the game: confetti, crown and robe unlock, the medal. Then a cut to the flat, the next morning
          (not a real day roll, presentation only): Foxy has put the trophy on the windowsill next to the office plant. The plant has a
          flower. First and only time the plant is mentioned: Foxy, "it flowered. took its time." Then the normal p1.wake.
LOSS      Penny offers the gold mic for one beat, takes it back. "Come back next year." (new line, optional) The run is over (Core: one run).
```

### 3.4 Progress beats (fx)

```
id        p2.levelup
Trigger   fx 'levelup' (any action that gives xp)
Where     wherever the hero is (after the P1 scene's LAND)
Length    FULL 2.5 | SHORT 1.2 | milestone levels (5, 10, 15, 20, 30) 4.0
Shots     1 ramp 0.2 (near freeze) on the hero's last pose, the frame desaturates except the hero. 2 a ring of four stat colours
          (COL in scenes_train.js) draws around the feet on 4 beats. 3 card "LEVEL 6" in the middle, "Max energy up" below. The hero does
          a cheer. Energy +10 and mood +6 PAY.
Milestones 5: the hero's eyepatch unlock note, a little pirate "arr". 10: the Hero Cape unlock: a wind gust lifts the cape for the first time
          even indoors (Foxy, if present, looks for the open window). 15: the World Cup row appears in the bar (sub only). 20: the hero's
          hair turns a little grey in the reflection, for one beat (Veteran), then normal. 30: max level, BeeAmGee (if met) is seen in the
          background of the next scene nodding.
```

```
id        p2.ach   (generic achievement, 26 of them)
Trigger   fx 'achievement'
Length    FULL 2.0 | SHORT 1.0
Shots     a trophy stamp slams on the corner of the frame on the downbeat (stamp sfx = the snare), name and desc as a tag. The hero glances
          at it as if they can see the HUD (a 4th wall look, only for achievements).
Specific  firstbusk: see p2.first.busk. cooked (Home Cooking, 15 meals): Foxy puts a chef hat on the hero's head (the unlock), takes a
          photo. rich (Tip Jar Full, $500): the hero lies on a pile of coins in a fantasy cut for 1 s, then the real shot (sitting on the
          bed counting notes). rent4 (Responsible Adult): Foxy shakes the hero's hand formally, then they both laugh. stylist (Fashion
          Victim, 15 cosmetics): the wardrobe door cannot close. allsounds (Four Voices): a halo appears, the hero looks up at it.
          streak10 (Never Drop, 60 combo): the hero's shades slide down by themselves (Chrome Shield). runner: see p2.first.run.
          tuned (Pitch Perfect): the kettle whistles in tune for the hero. worldcup: see p2.worldcup.win.
```

```
id        p2.unlock.cosmetic
Trigger   fx 'unlock' (today a banner "Wear it from the wardrobe at home")
Length    FULL 1.5 | SHORT 0.8
Shots     the item appears floating at the hero's shoulder as a little glowing low poly copy (the item mesh from char_gear / char_wear at
          0.5 scale), spins once, flies off toward home (screen left if home is left on the street). Sub "In your wardrobe: Fedora".
Vars      worn earned items in the shop are gold: when an unlock is gold, a short chime and the item leaves a gold streak.
```

```
id        p2.sound.<id>   (the 9 unlockable sounds; the first four are known)
Trigger   fx 'soundUnlocked' (sweepSounds). Each sound has an author and a moment. Length FIRST 5 to 8 s (only ever FIRST).
  RIM     Rimshot, level 3: next morning at the bathroom sink (or kitchen sink: the flat has no bathroom), the hero brushes the teeth
          (toothbrush prop), the brush clicks on a tooth: a rimshot. The hero stops, does it with the tongue. Card "NEW SOUND: RIMSHOT".
  LR      Lip roll, meet BeeAmGee (or level 4): he does a motorboat lip roll at the hero, the hero tries and spits; second try works.
  TB      Throat bass, beat Lil Tick: Tick, grudgingly, after the defeat, growls a throat bass at the hero ("that's the only one I'll show you").
  CR      Click roll, day 4 in the Sound Lab: the hero, bored, rattles the tongue while waiting for the REC lamp; the lab's needle meters
          jump. The hero does it again on purpose.
  IK      Inward K, level 6: after a long busk the hero runs out of air, gasps in, and the gasp is a snare. Wide eyes.
  WB      Water drop, meet Miro (crew): Miro pops her cheek, a "bloop"; she does it into a glass of water for the visual.
  ZP      Zipper, win 3 battles: the hero zips up the jacket after the third win; the zip is too musical; the hero zips it down and up twice.
  HUM     Hum bass, Pitch Perfect: the kettle (p1.eat.tea): the hero hums with the kettle and keeps the drum going over the hum.
  SI      Siren, level 10: on the street, an ambulance passes (a new street vehicle, or just a siren sound and light sweep); the hero
          imitates it, a passer-by turns to look for the ambulance.
Hand      the sound card text "Record it in the Sound Recorder" as a sub; the place.
```

```
id        p2.train.levelup
Trigger   fx 'levelUp' (a training game level unlocked, q >= 0.7 at the top level)
Shots     the training game's own stage lights pulse once, "LEVEL 3 UNLOCKED" in the game's colour, the hero bumps fists with themselves in
          the booth glass reflection. 1.5 s.
```

```
id        p2.jam.start
Trigger   fx 'jamStart' (spend crosses 12:00 from day 2), today a toast
Where     wherever the hero is: a cut-away, not the hero
Length    2.5 s, once a day max; FULL only the first 3 times, then a MICRO (a distant beat on the soundtrack and the park badge)
Shots     CUTAWAY to the park plaza: the first two beatboxers arrive, one puts down a speaker, the other starts a beat; a third jogs in.
          Sub "THE JAM HAS STARTED". Cut back.
```

### 3.5 Money, rent, mornings

```
id        p2.rent.paid
Trigger   morning on Sunday (dow 6), cash >= rent + debt; lines "Rent paid: $60."
Where     flat / the fridge with the rent notice (flat_kitchen)
Length    FULL 3.0 | SHORT 1.2
Shots     the hero pins $60 under a fridge magnet (one note per beat, beat coins reversed: the coins leave). Foxy walks past and takes it
          with a two finger salute. 4th time: Responsible Adult achievement (p2.ach rent4).
```

```
id        p2.rent.short
Trigger   Sunday morning, cash < rent: "You could not cover rent. Foxy covers it, with a look."
Length    5 s, not skippable for the first 1.5 s (the look is the point)
Shots     1 the hero at the fridge, the rent notice, the wallet: not enough (pocket inside out). 2 Foxy behind the hero, puts $60 under the
          magnet. 3 CU Foxy's face: "the look". No line, no music, 1.5 s hold. Foxy's look is not angry: tired. 4 Foxy leaves. The hero looks
          at the notice. Sub "You owe $75 (late fee included)." mood -10 PAY.
Beat      on the next good day (the hero earns $75+ in one action), a P3 callback: the hero slides an envelope under Foxy's door (`p3.payback`).
```

```
id        p2.morning.<event>   (the 8 MORNING_EVENTS, 30 percent of mornings; replace their text line with a scene, keep the text as sub)
oats      Foxy left oats, "No note. Just oats." The hero looks under the bowl for a note. Under the spoon. Nothing. Eats. 3 s.
five      "$5 in last night's jacket": hall tree, the hero puts the jacket on, a crumpled $5 in the pocket, holds it up to the window light
          like a winning ticket. 2.5 s.
drums     "The neighbour practised drums at 6 am": the wall thumps a groove; the hero, half asleep, beatboxes back at the wall; the
          drumming stops; silence; one single knock on the wall. The hero knocks back twice. 4 s.
rain      "Rain on the window. Cosy.": the hero pulls the blanket up to the eyes, rain on the window, a 10 minute ramp. 3 s.
streamed  "A stranger streamed your busk. +6 fans": phone buzzes on the nightstand, the hero squints at a video thumbnail of themselves
          from a weird angle. 3 s.
mum       "A mum-shaped text. Eat something green!": INS phone, the text; the hero makes a green smoothie and sends a selfie with it,
          thumbs up. 3.5 s (shares the blender gag in SHORT form).
dream     "Bad dream: you forgot every sound": the hero sits up with a gasp; tries a silent "B" (nothing), a "t" (nothing), panic, then the
          kick comes out loud. Relief. Foxy, through the wall: "it's 7am". 4 s.
pipes     "The pipes burst a little. Foxy mops. You help.": two mops, Foxy and the hero mopping in rhythm, the bucket is the snare. 4 s.
```

```
id        p2.collapse
Trigger   spend crossing 02:00 (endDay cause 'collapse'; morning lines "You collapsed at 2 am on the floor. Foxy dragged you to bed.")
Where     wherever the hero was: home (couch or floor), bar (after closing), street. Then the flat bed.
Length    FULL 6.0 | SHORT 3.0 (it happens rarely and should sting)
Shots     1 [0.0] ramp 0.5: the hero's clip slows mid action, the screen vignettes, the sound drops to a heartbeat (a soft kick, slower
          each beat, 90, 70, 50 bpm). 2 [1.5] the hero sits down where they are, then tips sideways (collapse clip). 3 [2.5] black, the heartbeat.
          4 [3.5] morning: the hero face down on the bed diagonally, shoes on, still holding whatever prop they had (the mic, a fork, the
          phone). A sticky note on the forehead: "you are heavy. -F". 5 PAY (energy 60 percent, mood -12) as the hero peels the note off.
Vars      at the bar: Rohzel's apron is over the hero like a blanket in shot 4 (she helped Foxy). Third collapse ever: the note says "again?".
```

```
id        p2.broke   (new: running out of money)
Trigger   cash reaches 0 after any spend, once per week; or cash < 10 on a Saturday evening with rent due tomorrow
Shots     the hero empties the wallet onto the bed: one button, a bus ticket, a guitar pick (they do not play guitar). Lies back. Foxy's
          silhouette in the door: "busk. the park pays." 4 s. Hand: the goal beacon points at the park.
```

### 3.6 People

```
id        p2.meet.<who>   (name cards; Core 'meet' a.who or first conversation)
Trigger   first time the hero talks to or sees each character: foxy (tutorial), rohzel (bar first), clerk (shop first), beeamgee (meet),
          pigpen (story), penny (worldcup), each regular (first mingle), each crew member (recruit), each opponent (p2.opp)
Length    1.2 s freeze inside the scene it belongs to (the 0.7 Name card)
Cards     FOXY / roommate / always on the phone, always listening
          ROHZEL / runs the bar / has seen everything twice
          CLERK / thrift shop / has opinions about your shoes
          BEEAMGEE / thirty years / this bench is his office
          PIG PEN / rival / gold grill, red bomber
          PENNY / champion / it is lonely at the top
          LUCA / regular / quiff maintenance takes 40 minutes
          MIRA / regular / laughs first, beatboxes second
          SKY / regular / cyan hair, trucker cap, no plans
          PASCAL / regular / it is always summer in that shirt
          JIN / regular / owns one turtleneck, in five copies
          ROO / regular / two pigtails, three opinions
```

```
id        p2.crew.<id>   (jaxx, noor, duot, glaze, miro: Core 'recruit')
Length    5 s each
jaxx      Jaxx stomps four on the floor while signing (the blurb: loves a four on the floor).
noor      Noor pushes her glasses up and corrects a beat on the hero's notebook before shaking hands.
duot      Duo-T: two brothers, one mic; they both lean in to say "hi" and bonk heads.
glaze     Glaze does a radio voice: "you're listening to..." and lets the hero finish the sentence.
miro      Miro sings a perfect note; every glass in the bar rings with it; Rohzel steadies a shelf. (Water drop unlock follows.)
Crew daily income in the morning (endDay lines): in p1.wake, a crew group chat on the phone: one message per member per morning.
```

```
id        p2.date.first   (Heart Eyes, Heart Shades unlock)
          the date scene (p1.date) FULL plus a last shot: walking home alone afterwards, the hero does a little skip on the off-beat.
          Back at the flat, Foxy looks up from the phone, reads the face, says nothing, smiles at the phone.
```

```
id        p2.release   (first song, Record Deal)
          the first release is a ritual: the hero stands at the desk, presses upload, cannot watch; walks to the window and back; the bar
          is full; RELEASED. Foxy (if home) plays it from the phone in the kitchen, loud. 6 s.
          Next morning's p1.wake: "Your songs earned N new fans overnight" is shown as a tiny streaming graph on the phone.
```

```
id        p2.fans.<n>   (fan milestones 25, 100, 500, 2000: the first two match achievements Hundred Hearts etc.)
25        on the street, a passer-by slows down, looks twice, keeps walking. (Nothing else. The hero turns to watch.)
100       a teenager asks for a selfie on the street; the hero does not know how to pose; the teen poses for both.
500       a kid in the park beatboxes the hero's busk groove at them, badly, perfectly.
2000      a mural of the hero appears on the graffiti wall in the park (a wall decal with the portrait texture). The hero stands in front
          of it in the same pose. Local Legend.
```

---

## 4. P3: delights

Small, optional, cheap, mostly ambient. Each is 0.6 to 3 s and has a probability or a counter so it stays rare.

| id | Trigger | Where | The moment |
|---|---|---|---|
| `p3.growl` | hunger < 22, once per 30 game minutes | anywhere | the stomach growls; it is a kick drum; the hero answers it with a snare, it becomes a 1 bar beat |
| `p3.yawn` | energy < 22, idle 4 s | anywhere | a yawn that turns into an inward K halfway (after IK unlock) |
| `p3.idle.flat` | idle 6 s at home | flat | by time: morning, the hero waters the office plant; afternoon, flips a record; evening, dances alone to the string lights; after 23:00, looks out of the window at the skyline windows going out |
| `p3.foxy.routine` | Foxy home (hour < 11 or > 17) | flat | Foxy's own life: 07:00 coffee at the counter, 18:00 phone on the couch, 21:00 sitting in the hoodie, 23:00 brushing teeth with the toothbrush (shares the prop) |
| `p3.window.rain` | rain day, idle at the window | flat | finger on the glass following one drop |
| `p3.shower` | first action after waking, 1 in 3 mornings | flat (offscreen) | no bathroom in the flat: the camera holds on the hall, steam drifts out of a door gap, the hero beatboxes in the shower, Foxy bangs on the door twice (the snare) |
| `p3.office.box` | idle near the flat door | flat | the office box from the intro by the door: the hero kicks it gently; after the first busk it is at the busk spot instead (the slot is empty: a clean square in the dust) |
| `p3.pigeon` | 10th bench rest | park | name card: "PIGEON / regular / ring on left leg". It shows up at busks and rests afterwards |
| `p3.bench.graffiti` | bench before BeeAmGee is met | park | the hero reads "beeamgee was here" on the wall, traces it with a finger |
| `p3.fountain.coin` | 1 in 10 park entries with cash > 20 | park | the hero flips a coin into the fountain on the beat; it costs nothing in Core (presentation only, the coin is imaginary) |
| `p3.dog` | random in park | park | a dog sits in front of the busk crate and howls along to the hi-hats |
| `p3.street.recognised` | fans >= 50, 1 in 4 street walks | street | a passer-by double takes and whispers to a friend; at 300+ fans a phone camera flash |
| `p3.street.busker` | random, evening | street | another busker (a crowd look) with a guitar outside the shop; the hero drops nothing, nods; after 10 days they nod back |
| `p3.street.neon` | night | street | the bar's neon sign buzzes on the off-beat; the hero, walking past, matches it with a hiss |
| `p3.desk.stats` | desk > SKILLS | flat | the hero pins a sticky note with the stat numbers onto the monitor bezel, next to old ones |
| `p3.songs.wall` | MY SONGS with 1+ song | flat / lab | a cover art card for each song is pinned on the wall above the desk (procedural cover: pattern grid as art) |
| `p3.lanyard` | first shelves job | shop | the office lanyard in the donation box (see p1.job.shelves) |
| `p3.payback` | after p2.rent.short, the first action that earns >= the debt | flat | the hero slides an envelope under Foxy's door. Next morning: the envelope is back, with a note: "keep it. -F". (Core debt is still paid normally at rent; this is presentation) |
| `p3.closing.bar` | in the bar at 01:45 | bar | Rohzel flicks the lights twice; the regulars groan; a chair goes up on a table |
| `p3.closing.park` | in the park at 19:45 | park | the lamp posts click on one by one in a 4 beat pattern; a groundskeeper whistles |
| `p3.late.warning` | 01:30 anywhere | anywhere | the hero's eyelids droop once; the HUD clock pulses red; the camera sways a little (a warning before p2.collapse) |
| `p3.weekend` | Saturday morning | flat | Foxy in sunglasses on the couch, "battle night", points at the hero with two fingers |
| `p3.monday` | Monday (bar closed) | street | the bar door sign "Rohzel's day off. Go outside."; through the window Rohzel herself is inside, alone, singing karaoke to the empty bar; she sees the hero and pulls the blind |
| `p3.mirror.shop` | idle at the shop mirror | shop | the hero leans in and checks the teeth; the clerk coughs |
| `p3.jukebox.bar` | tap the bar jukebox anchor (new spot, presentation only) | bar | the jukebox changes track when thumped on the beat, like the fonz |
| `p3.week.one` | day 8 morning | flat | Foxy hands the hero a cupcake with one candle: "one week. you did not quit." |
| `p3.champion.epilogue` | after the World Cup, first idle at home | flat | the hero on the couch with the trophy, watching their own World Cup on VHS (the tape shelf has a new spine: "WORLD CUP: ME") |
| `p3.plant` | every third day, the wake scene | flat | the office plant grows a leaf (state: leaves = floor(day / 3), capped; flower after the World Cup) |

---

## 5. Missing moments (no trigger today)

These are scenes for which the game has no event, no fx or not even a toast. Proposed triggers are presentation only (no Core rule
change); where a flag is needed it is a NEW key in the vignette counter store, never a renamed save field.

| Moment | Tier | Proposed trigger | Scene |
|---|---|---|---|
| First time entering each place (staged, not just a dialog) | P2 | `flags.visited_<place>` unset | `p2.first.<place>` |
| Morning wake up (today a text card) | P1 | fx 'morning' | `p1.wake` |
| Collapse at 02:00 (today one line on the card) | P2 | endDay cause 'collapse' | `p2.collapse` |
| The 01:30 warning before a collapse | P3 | hourOf(minutes) crosses 01:30 | `p3.late.warning` |
| Level up (today a banner) | P2 | fx 'levelup' | `p2.levelup` |
| New sound unlocked, with who taught it | P2 | fx 'soundUnlocked' | `p2.sound.<id>` |
| Buying clothes and checking yourself in the mirror | P1 | Core 'buy' then 'equip' | `p1.shop.buy`, `p1.shop.wear` |
| Changing clothes at home | P1 | 'equip' from the wardrobe | `p1.wardrobe` |
| Rain days (2D street only today: day % 5) | P3 | the same rule in 3D (fx_weather), plus the morning rain event | `p1.wake` rain var, `p3.window.rain`, door shake |
| Running out of money | P2 | cash hits 0, or Saturday evening cash < rent | `p2.broke` |
| Rent day (today one line) | P2 | Sunday morning | `p2.rent.paid`, `p2.rent.short` |
| Fans recognising you on the street | P2/P3 | fan thresholds, street walk chance | `p2.fans.<n>`, `p3.street.recognised` |
| Releasing a track (today a toast) | P2 | first 'release' | `p2.release` |
| Songs earning overnight | P1 | morning line "Your songs earned" | phone graph in `p1.wake` |
| Streaming milestones | P2 | n.streams 1 / 10; flags.lastViewers 50 / 100 / 250 | `p2.first.stream`; 100 viewers: the hero's phone overheats (steam fx, comic), 250: Foxy watches from the kitchen on her own phone |
| Crew income every morning | P1 | morning line "Your crew brought in" | crew group chat in `p1.wake` |
| Meeting each character (name cards) | P2 | first dialog / 'meet' / first mingle / recruit | `p2.meet.<who>` |
| The jam starting while you are elsewhere | P2 | fx 'jamStart' | `p2.jam.start` |
| First battle loss (today just a result) | P2 | first battleResult with win false | `p2.first.battleloss` |
| Each opponent's first entrance | P2 | first battle vs each OPPONENTS id | `p2.opp.<id>` |
| Rohzel's water between World Cup rounds (only a line today) | P2 | chained finals | `p2.worldcup.*` |
| The champion ending | P2 | flags.worldcup set | `p2.worldcup.win`, `p3.champion.epilogue` |
| BeeAmGee's ten lines as a story (today ten dialogs) | P2 | fx coachLine | `p2.coach.line.<n>` |
| Training level unlocked | P2 | fx 'levelUp' | `p2.train.levelup` |
| Stamina up after a run | P1 | Core 'run' gain > 0 | `p1.run.out` fitness ring |
| First week survived | P3 | day 8 | `p3.week.one` |
| Closing time (park 20:00, studio 24:00, bar 02:00) | P3 | the clock crosses close minus 15 while inside | `p3.closing.*` (studio: the REC lamp blinks twice) |
| Monday, bar closed | P3 | travel refused at the bar on Monday | `p1.refuse.closed` bar var, `p3.monday` |
| Hunger and exhaustion as body language | P3 | hunger < 22, energy < 22 | `p3.growl`, `p3.yawn`, low energy overlay |
| The office plant and the office box (intro objects that persist) | P3 | day count, first busk | `p3.plant`, `p3.office.box`, `p2.first.busk` |
| Foxy covering rent, then being paid back | P3 | after p2.rent.short | `p3.payback` |
| The 8 morning events (today text lines) | P2 | morning event pick | `p2.morning.<event>` |
| Getting a shower / brushing teeth (daily hygiene, used for the Rimshot unlock) | P3 | first action after wake | `p3.shower`, `p2.sound.RIM` |

---

## 6. Props to build (procedural, low poly)

Same conventions as `char_props.js`: a plain group in character object space (or world space for set props), vertex colours,
shared lit / glow materials, <= 120 tris for hand props, <= 400 for set props. "Exists" means a mesh is already in a park3d module
and only needs a part split out (a door, a lid) or a hook.

### 6.1 Food and drink (one per FOODS entry, plus serving ware)

| Prop | Tris | Parts / notes | Used by |
|---|---|---|---|
| `banana` | 60 | body + 3 peel strips as separate pieces (or 3 bend states) | p1.eat.banana, AUTO busk gag |
| `bowl_oats` | 80 | bowl, oat surface disc, 5 berry spheres (8 tris each), spoon | p1.eat.oats, p2.morning.oats |
| `date_tub` + `date_ball` | 40 + 12 | tub with lid, ball sphere x3 (instanced) | p1.eat.dates |
| `burrito_bowl` | 110 | deep bowl, 4 coloured layer wedges (rice, beans, greens, salsa), fork | p1.eat.bowl |
| `blender` (exists in flat_kitchen) | split | lid and blade as separate nodes so the blade spins and the lid lifts | p1.eat.smoothie, p2.morning.mum |
| `glass_green` | 30 | tall glass, green fill (fill height uniform or 3 states), straw | smoothie, bar juice, p1.mingle.juice |
| `kettle` | 90 | body, spout, handle, lid; steam emitter point at the spout | p1.eat.tea, p2.sound.HUM |
| `mug_tea` | 40 | mug, tea disc, tag on a string | p1.eat.tea |
| `plate_dirty` | 20 | plate with a smear decal; stacks up to 3 on the counter | p1.eat LAND |
| `coaster` | 4 | | bar food variant |
| `water_bottle` | 30 | | showcase IN, World Cup |
| `cupcake` | 50 | with one candle and a flame point | p3.week.one |

### 6.2 Home

| Prop | Tris | Notes | Used by |
|---|---|---|---|
| `phone` | 24 | slab + emissive screen quad (canvas texture for UI: stream, rent photo, texts, fitness ring, upload bar) | sleep, wake, stream, morning events, release, date, coach line 10 |
| `office_plant` | 120 + leaves | pothos in a desk pot, leaves added by state (up to 12), one flower | intro, p1.wake, p3.plant, World Cup win |
| `office_box` | (exists: `box`) | add the office label decal and a sagging wet variant | intro, p2.first.busk (becomes the tip box), p3.office.box |
| `stapler` | 20 | | intro |
| `vhs_tape` | 16 | spine label canvas (7 titles + "WORLD CUP: ME") | p1.tape |
| `vcr_slot` | (exists in TV unit) | needs a slot quad for the tape to go in | p1.tape |
| `tv_screen_card` | 2 | emissive card with 2 frame battle loop or render target | p1.tape |
| `headphones` | 80 | band + 2 cups; can sit on the neck (hpneck exists as gear: reuse its geometry as a prop) | idle training mus, recorder playback |
| `notebook` + `pencil` | 30 + 10 | open notebook with a grid doodle canvas | idle training ori, mingle napkin |
| `toothbrush` | 12 | | p2.sound.RIM, Foxy routine |
| `mop` + `bucket` | 40 + 40 | x2 mops | p2.morning.pipes |
| `sticky_note` | 2 | canvas text ("you are heavy. -F", "again?", "keep it. -F") | collapse, payback |
| `fridge_magnet` + `cash_notes` | 8 + 8 | note stack (1 to 3 notes) | p2.rent.*, coach fee |
| `wallet` | 24 | with an opening flap; contents: button, bus ticket, guitar pick | p2.broke, refuse.cash |
| `pocket_lining` | 8 | cloth quad that pops out of the hip, plus `moth` (4 tris, flaps) | p1.refuse.cash |
| `pillow` | 30 | (the bed has one: split it so it can be hugged and thrown) | nap, couch rest cushion |
| `keys` + `key_bowl` | 10 + 20 | | p1.door.in.home |
| `envelope` | 6 | | jobs pay, showcase, payback |
| `trophy` | 120 | World Cup trophy, gold | p2.worldcup.win, epilogue |
| `song_cover` | 2 | canvas texture from the pattern grid | p3.songs.wall |

### 6.3 Park and street

| Prop | Tris | Notes | Used by |
|---|---|---|---|
| `tip_tin` | 30 | fallback when the hero has no hat and before the office box | p1.busk |
| `coin` | 6 | instanced, beat-quantised drops | every cash gain |
| `bottle_cap` | 6 | | busk D rank |
| `flyer_stack` + `flyer` | 12 + 2 | flyer canvas: "OPEN MIC TUESDAY", later with the hero's portrait | p1.job.flyers |
| `paper_plane` | 6 | | p1.job.flyers C |
| `pigeon` | 60 | head bob bone; a leg ring for the named one | bench, busk, p3.pigeon |
| `dog` | 120 | sit and howl pose | p3.dog |
| `scooter_kid` | (crowd look) + scooter 30 | | p2.first.busk |
| `speaker_small` | 30 | the jam's portable speaker | p2.jam.start, AUTO busk (phone variant) |
| `mural_decal` | 2 | portrait texture on the graffiti wall | p2.fans.2000 |
| `poster_decal` | 2 | arena poster on the park fence | coach line 5 |
| `umbrella_flyer` | (flyer) | | rain variant |

### 6.4 Shop, lab, bar

| Prop | Tris | Notes | Used by |
|---|---|---|---|
| `price_scanner` | 30 | with a red emissive beam quad | p1.shop.buy |
| `shop_bag` | 30 | paper bag, folded top, sticky note doodle canvas | p1.shop.buy |
| `hanger` | 8 | instanced on the rails | p1.job.shelves |
| `ugly_jumper` | (top mesh) | a garish colour set on an existing top | p1.job.shelves |
| `donation_box` | (exists: `box`) | | p1.job.shelves |
| `office_lanyard` | 10 | | p3.lanyard |
| `platform_turntable` | (exists in shop_mirror) | split the platform so it can rotate | p1.shop.wear |
| `pop_filter` | (exists in lab_booth) | hook only | p1.record |
| `clipboard` | (exists) | sign-up sheet canvas with names | open mic IN, Dr. Bassline |
| `scorecard` | (exists) | add the arrow (which side won) | p1.battle.verdict |
| `apron` | 30 | cloth quad tied at the waist | p1.job.dishes, collapse bar variant |
| `sink_rack` + `glass` | 80 + 10 | sink behind the back bar, glass instanced (12) | p1.job.dishes |
| `chalkboard_small` | 4 | level sign in the shop / bar sign on Monday | refusals |
| `door_sign_monday` | 4 | "Rohzel's day off. Go outside." | p1.refuse.closed, p3.monday |
| `gold_mic` (exists as gear) | | Penny's | World Cup |
| `confetti` | fx | instanced quads | wins, level up |

---

## 7. Shared clip list (new character animations)

Existing clips: idle, walk, run, beatbox, dance, sit, wave, cheer, talk, point, battle, sad, finisher, hit, hold (+ walkside). New clips
the vignettes need, in build order (the first block covers all of P1). Same conventions as `char_anim.js` / `char_clips.js` (IK
targets in object space, face channels brow / browTilt / mouthOpen / smile / frown). Two face channels are new: `eyesClosed` (0..1,
for blink, sleep, the "warm" face) and `cheekPuff` (0..1, for Pf, water drop, chewing).

### 7.1 P1 block (everyday)

| Clip | Description | Props | Used by |
|---|---|---|---|
| `eat_bite` | hand to mouth, bite, small head pull back, chew (mouthOpen + cheekPuff loop) | any hand food | all eating |
| `eat_spoon` | bowl in the left hand (hold), spoon in the right, scoop + mouth; `opts.blow` adds a blow before | bowl, spoon | oats, burrito bowl (fork) |
| `toss_catch` | flick an object up, head tilts back, catch in the mouth | date ball | dates |
| `drink` | glass or mug to mouth, tilt by `opts.gulp` (sip 0.3, gulp 1.0), shudder variant | glass, mug | smoothie, tea, juice, water |
| `stir` | small circular wrist | spoon | oats, tea |
| `reach` | reach forward / up to a target point (fridge, shelf, button); `opts.to` | none | fridge, blender button, shelf, lamp |
| `hum` | idle sway, mouth closed, chest rise on the beat, eyes half closed | none | tea, training mus, sleep hum |
| `fall_back` | from sit, fall backwards onto a bed / couch | none | nap, couch |
| `lie` | lying pose in bed (side / back / face down variants), breathing, eyesClosed 1 | blanket | nap, sleep, collapse aftermath |
| `wake_sit` | from lie to sitting up | none | nap, wake |
| `stretch` | arms up and back, a leg variant (calf stretch on a bench) | none | wake, run IN |
| `yawn` | big jaw open, head back, one arm stretch | none | wake, low energy, refuse.tired |
| `phone_look` | phone in the right hand at chest height, head down, thumb taps | phone | sleep, wake, stream, release, morning events |
| `phone_type` | two thumbs typing | phone | release name, texts, coach line 10 |
| `phone_selfie` | arm out, head tilt, smile | phone | mum event, fans 100 |
| `headphones_on` | both hands to the ears, adjust | headphones | training, recorder |
| `write` | pen on a notebook held in the left hand | notebook, pencil, clipboard | training ori, Rohzel's sign-up, Doc |
| `hand_out` | offer arm forward at chest height, small step toward a target, return; for flyers | flyer | flyers job |
| `carry` | a walk layer with both hands under a box (hold box + gait) | box | shelves job, intro |
| `hang` | lift a hanger to a rail above head height | hanger | shelves job |
| `scrub` | two handed scrub in a sink, glasses squeak | glass | dishes job |
| `pocket_search` | pat hips, chest, back, pull one pocket out | pocket_lining | refuse.cash, broke, $5 jacket |
| `mirror_check` | turn left, right, adjust the slot that changed (`opts.slot`: hat, glasses, collar, shoe) | none | wardrobe, shop wear |
| `swap` | a 0.6 s spin with the look swap at the midpoint | none | shop try on |
| `door_open` | hand to handle, push or pull (`opts.push`), step through | none | doors, wardrobe |
| `knock` | two knocks (snare + snare) | none | morning drums, refuse.closed |
| `rattle` | rattle a locked handle | none | refuse.closed |
| `nod` | single deep nod (BeeAmGee), quick nods (agreeing) by `opts.n` | none | everywhere |
| `shrug` | | none | outros, refusals |
| `fist_bump` | two actor: approach hands meet at a contact point (`opts.target` actor) | none | jam, Foxy, rematches |
| `handshake` | two actor | none | battle verdict, crew |
| `bow` | stage bow, depth by `opts.deep` | none | busk, stage OUT |
| `clap` | in place clap on the beat (crowd too, cheap) | none | busk crowd, jam |
| `hands_on_knees` | bent over panting | none | run OUT, long training |
| `count_in` | fingers 1, 2, 3, 4 on the bpm | none | training rhythm intro |
| `mic_adjust` | lower / raise a mic stand | mic stand | open mic IN |
| `sit_counter` | perch on a stool, elbows on the counter | none | bar food, mingle |

### 7.2 P2 / P3 block

| Clip | Description | Used by |
|---|---|---|
| `collapse` | slow knees, sit, tip sideways (ramp friendly) | p2.collapse |
| `brush_teeth` | toothbrush loop, the Rimshot discovery freeze | p2.sound.RIM, Foxy |
| `mop` | two handed mop sweep on the beat | p2.morning.pipes |
| `hug` | two actor, short | dates, World Cup |
| `walk_together` | two actor side by side, the gap closes by `opts.closeness` | p1.date |
| `lip_roll` | lips flutter channel + head shake | p2.sound.LR, mingle liproll |
| `spit` | a failed lip roll, little head jerk | p2.sound.LR |
| `growl` | jaw down, chest vibrate (throat bass) | p2.sound.TB, snore |
| `zip_up` | zip a jacket from waist to chin | doors at night, p2.sound.ZP |
| `cheek_pop` | cheekPuff release (water drop) | p2.sound.WB |
| `selfie_pose` | the teen poses for two | p2.fans.100 |
| `cat_walk` | Kat's walk | p2.opp.kat |
| `ear_flick` | (hat bone wiggle, cat ears) | p2.opp.kat |
| `pirate_bow` | | p2.opp.hexx |
| `glove_snap` | | p2.opp.doc |
| `hat_flick` | Pig Pen flicks the hero's hat off; the hero's `hat_pickup` | p2.story.pigpen |
| `finger_lips` | "do not tell anyone" | p2.pigpen.beaten |
| `pour` | pour from a bottle into a glass | Rohzel's water |
| `polish_glass` | Rohzel's idle | bar ambient, talk.rohzel |
| `snack` | Pig Pen eating on the stage edge | p2.opp.pigpen |
| `howl` (dog), `bob` (pigeon) | animal loops | p3.dog, p3.pigeon |

---

## 8. Trigger table

How the director picks a vignette. Evaluate top to bottom; the first match wins for the main scene; P2 fx queue behind it (0.4).

| Signal | Condition | Vignette |
|---|---|---|
| any Core action | refused (warn toast, no change) | `p1.refuse.<reason>` by toast text |
| `eat` | a.home | `p1.eat.<a.food>` (home) |
| `eat` | not a.home | `p1.eat.<a.food>` (bar variant) |
| `nap` | | `p1.nap` |
| `sleep` | | `p1.sleep`, then on fx morning `p1.wake` |
| fx `morning` | cause collapse | `p2.collapse` (replaces p1.wake) |
| fx `morning` | lines include a MORNING_EVENTS text | `p2.morning.<event>` inside p1.wake |
| fx `morning` | dow Sunday | `p2.rent.paid` or `p2.rent.short` |
| `wait` | from couch REST | `p1.couch.rest` |
| `wait` | from bench REST | `p1.bench.rest` |
| `wait` | other | `p1.wait` (MICRO) |
| `tape` | | `p1.tape` |
| `stream` | first ever | `p2.first.stream` else `p1.stream` |
| `train` | where coach | `p1.coach.free.<a.stat>` |
| `train` | q 0.4 (QUICK) | `p1.train.quick` |
| `train` | from the rhythm drill | `p1.train.play.beat` OUTRO |
| `trainIdle` | | `p1.train.idle.<a.stat>` entry/exit |
| `trainGame` | | `p1.train.play.<a.game>` OUTRO; fx levelUp -> `p2.train.levelup` |
| `tune` / `seqtrain` | | `p1.train.play.tune` / `p1.beatmaker` OUTRO |
| `release` | first | `p2.release` else `p1.release` |
| `recorded` | first | `p1.record` FIRST |
| `equip` | from wardrobe | `p1.wardrobe` exit |
| `equip` | from shop | `p1.shop.wear` |
| `buy` | | `p1.shop.buy` |
| `perform` | kind busk / jam / openmic / showcase / karaoke | `p1.<kind>.out` (+ `p2.first.<kind>` when counter was 0) |
| fx `story` | id | `p2.story.<id>` |
| `jamWatch` | | `p1.jam.listen` |
| `run` | | `p1.run.out` |
| `job` | a.job | `p1.job.<a.job>` |
| `coach` | | `p1.coach.pro`, fx coachLine -> `p2.coach.line.<n.coaches>` |
| `mingle` | the MINGLE entry picked (match the toast text) | `p1.mingle.<outcome>` |
| `date` | first | `p2.date.first` else `p1.date` |
| `recruit` | | `p2.crew.<a.id>` |
| `battle` | | `p1.battle.verdict` (+ `p2.first.battlewin` / `battleloss`, `p2.pigpen.beaten`, `p2.worldcup.*`) |
| `travel` | first visit | `p2.first.<a.to>` else `p1.door.in.<a.to>` |
| `story` bmgMeet | | `p2.story.meet` |
| `meet` | | `p2.meet.<a.who>` |
| fx `levelup` | | `p2.levelup` |
| fx `achievement` | specific id listed in 3.4 | that scene, else `p2.ach` |
| fx `unlock` | | `p2.unlock.cosmetic` |
| fx `soundUnlocked` | | `p2.sound.<id>` |
| fx `jamStart` | | `p2.jam.start` |
| E.go into a mini game | from a place | the INTRO of that action |

Implementation note for the mingle outcome: `Core.apply` does not return which MINGLE entry was picked. Match on the toast text (stable
strings) or, better, add a non-breaking fx `{ t: 'mingle', i }` in a later Core change (additive, the UI ignores unknown fx). Same for the
morning event: the director matches the line text against `MORNING_EVENTS[i].text`.

---

## 9. Counts and the top 10

### 9.1 Counts per tier

Counting each scene id (per-food, per-stat, per-game, per-outcome, per-event and per-character variants count separately, because
each needs its own shot work):

- **P1 everyday: 79 scenes.** Eat x6, nap, sleep, wake, couch rest, tape, talk Foxy, stream, quick practice, idle training x4,
  play training x5, beat maker, release, record, wardrobe, busk in/out (BUSK / HARD / AUTO as variants), jam in/out, jam listen,
  bench rest, run in/out, flyers, free lesson x4, pro coaching, talk BeeAmGee, shop try on, buy, wear, shelves, talk clerk, stage in x3,
  stage out, battle walkout, battle verdict, mingle x5, date, talk Rohzel, dishes, door out, door in x5, map travel, wait, refusals x13.
- **P2 milestones: 86 scenes.** Intro, first visit x5, first busk / open mic / battle win / battle loss / showcase / stream / run (7),
  story x6 (firstJam, sightJam, sightBusk, meet, pigpen, famous), coach lines x10, opponents x7, Pig Pen beaten, World Cup x4 (the
  water between finals, Penny's entrance, win, loss), level up, achievements x8 (generic plus 7 specific), cosmetic unlock, sounds x9,
  training level up, jam start, rent paid, rent short, morning events x8, collapse, broke, name cards (12 cards, one system), crew x5,
  first date, first release, fan milestones x4.
- **P3 delights: 29 scenes** (the 28 in section 4 plus the Sound Lab jukebox in 2.11).
- Total: **194 scene ids**. About 45 share a skeleton with another (eat, doors, refusals, name cards, morning events), so the unique
  staging work is closer to 140.
- Props: **60** rows in section 6 (about 11 exist and need a split or a hook). New clips: **37** in the P1 block, **21** rows in the
  P2/P3 block, plus 2 new face channels (`eyesClosed`, `cheekPuff`).

### 9.2 Top 10 most impactful scenes (build these first)

Ranked by (how often the player sees it) x (how much it changes how the game feels):

1. **`p1.wake` (with the morning events and rent)**: every in-game day starts here. Turns the DAY N text card into the heartbeat of
   the game: the alarm hi-hat, the stretch, the office plant growing, the numbers on the phone.
2. **`p1.eat.*` (the blender beatbox and the kettle hum above all)**: the most repeated action; the place where "the world is a drum
   kit" is taught to the player without a word.
3. **`p1.busk.in` / `p1.busk.out`**: the core money loop; the rank-driven crowd reaction (from the pigeon looking into an empty tin to
   coins landing on the beat) makes every set feel judged by people, not a number.
4. **`p1.refuse.*`**: tiny, cheap, constant. Replacing red error toasts with a pocket pulled inside out or a rattled door handle is
   the single biggest feel upgrade per hour of work.
5. **`p1.sleep`**: the end of every day: the phone with the day's numbers, the lamp click on the beat, the skyline windows going out.
   It gives every day an ending.
6. **`p1.battle.verdict`**: five scorecards on five beats (kick for you, snare for them) and Wildcard's upside down card. The climax of
   the week, every Saturday.
7. **`p1.door.in.<place>` / `p1.door.out`**: the most frequent transition in the game. Kept to 0.5 to 1.2 s, with one beat per place
   (the studio's sudden silence, the bar's bass hit on the downbeat), they make the city feel continuous.
8. **`p2.coach.line.<n>`**: BeeAmGee's ten lines (the daughter, the violin, "find someone to come home to") are the emotional spine of
   the story; staged with silence and a fountain they become the scenes players talk about.
9. **`p1.job.*` (flyers, shelves, dishes)**: the time ramp montage turns 90 to 120 dead minutes into a 4 s story with a gag (the paper
   plane, the terrible jumper, the sink that becomes a drum kit).
10. **`p2.collapse`**: rare but unforgettable: the heartbeat slowing in bpm, the sticky note "you are heavy. -F". It teaches the 02:00
    rule better than any toast and makes Foxy a person.

Build order suggestion: the shared kit first (PAY / LAND cues, the counter store, MICRO forms, clock flip, beat coins, refusals), then
the top 10 in that order, then the rest of P1, then P2 by how early the player meets them (first visits, first busk, the story arc),
then P3 as polish.
