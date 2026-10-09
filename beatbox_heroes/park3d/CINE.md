# CINE: the cutscene engine of Beatbox Heroes 3D

Owner: CINE. Files:

| file | what |
|---|---|
| `park3d/cine.js` | the engine: timeline, camera rig, actors, fx, sound and beat cues (API at the top of the file) |
| `park3d/cine_screen.js` | the 2D layer over the canvas: letterbox, subtitles, stamps, cards, the kinetic logo, words, dips, crossfade, blur, skip controls |
| `park3d/cine_reels.js` | the films (`FILMS`), the lazy chunk entry (`entry.js loadCine()` imports it; it re-exports the engine) |
| `park3d/cine_opening.js` | the opening film (4 reels: office, street, flat, dream) |
| `park3d/w_cine.js` | world `cine`: the dedicated cutscene stage (the office of the opening) |
| `r3/cine.js` | the game glue: `BBH.R3Cine.film(id, ctx)`, the 3D intro scene, story beats, mornings, fallbacks |
| `tools/beatbox_heroes/cine_shot.mjs` | frame grabber: plays a film in the real game and saves PNGs at chosen moments |
| `tests/beatbox_heroes_r3cine.test.mjs` | the gate (engine, opening, every story film, skip, return, black frames) |

The engine needs one thing from the host: `world.onFrame(fn, 'pre' | 'post')` (host.js). The pre hook runs after every
module update and before the render, so the cine camera and the actors it drives always win over the controls. The post
hook runs right after the render (the crossfade snapshots the canvas there). `host.timeScale` gives slow motion.

## Playing a film from game code

```js
BBH.R3Cine.film('firstJam', { lines }).then((info) => { /* info.ok, info.skipped, info.t, info.errors */ });
```

* Never rejects. When 3D is off, a film is already running, the chunk cannot load or a reel throws, `info.ok` is false
  and the caller does its 2D thing (the story glue then plays the same lines as a dialog).
* While a film plays: `body.cine-on` hides the HUD and the DOM UI, the controls are disabled, the save's time and
  weather keep reaching the world unless the film sets `holdSync: true`, the world's neon pulses with the film's hits
  (`R3.setBeatSource`), and on a landscape window the 3D box goes wide (`R3.setWide`). Everything is restored at the end.
* Skipping: tap = finish the line being typed or go to the next one, hold anywhere for 0.75 s = skip, the SKIP button,
  Escape. A skipped film restores exactly like a finished one.
* Reduce motion (Settings or the OS): no shake, no handheld, no blur, no flicker, no speed ramps, whips become cuts,
  the logo letters appear without flying in. `?cine=0` or `E.settings.cine === false` turns films off entirely.

## Writing a film (recipe for action vignettes)

A film is a function in `cine_reels.js` (or its own module imported there) that returns reels:

```js
FILMS.cookEgg = (ctx) => ({
  reels: [{ reel: { id: 'cookEgg', cast: { foxy: { rest: { clip: 'idle' } } }, events: [
    { do: 'place', who: 'hero', at: [3.2, -3.4], face: 180 },
    { do: 'shot', on: 'hero', yaw: 30, w: 1.6, h: 1.3, lookH: 1.15, fov: 32, to: { yaw: 10, w: 1.3 }, dur: 4 },
    { do: 'clip', who: 'hero', clip: 'hold', opts: { prop: 'box' } },
    { do: 'sfx', name: 'eat' },
    { do: 'say', who: 'foxy', text: 'Smells like rent money.' },
    { do: 'fx', kind: 'sparks', at: 'hero:top' },
  ] } }],
});
```

then `BBH.R3Cine.film('cookEgg')` from the action (for example in the place's ACTIONS handler before `G.do`), or add
the id to `STORY_FILMS` in `r3/cine.js` when a core.js story beat with the same id should trigger it.

Rules of thumb:

* Run in the world that is up (no `world` on the reel) so the return to gameplay is seamless. The engine puts every
  actor it touched back on its mark at the end (or where `reel.end.hero` says), and the camera glides back to the
  controls (`blendOut`, 700 ms by default for the last reel of a film).
* Time is real seconds. `say` and `wait` block the reel clock, so dialog scenes read in order; give a `dt` to an event
  to start it later than the previous one, `t` for an absolute time, `wait: true` on a `walk`, `beat` or `logo` to
  block until it is done.
* Shot sizes are widths at the subject (`w`): the cast is 1.72 m tall with a 0.9 m head. ECU 0.7, CU 1.15, MCU 1.6,
  full shot 2.4, wide 5. The frame is authored for 9:16 portrait: a landscape box keeps the same subject height and
  shows more on the sides. In portrait the frame is narrow, so build depth (foreground, subject, background along the
  lens axis) and height (high and low angles), not width. Two people side by side need `w` about 3.4.
* `yaw` is relative to the actor's facing at the cut (0 = in front of the face, 180 = behind). `rel: false` makes it a
  world angle (0 = camera on the +z side).
* Spawned characters (`spawn`) are disposed at the end. Use `look: 'npcId'` for a Core.NPCS look, a look object for a
  stranger, `npc: 'beeamgee'` for the seated BeeAmGee behaviour. World NPCs and the park jam regulars (mira, luca)
  can be addressed by id directly. BeeAmGee in the world is always seated: his `talk` is a seated talk.
* Fake lights only: `cone` (a volumetric spot with a pool on the floor), `pulse` (neon and stage lights on the beat),
  `flicker`. Adding real three.js lights recompiles every material and hitches the frame.
* Budgets: a spawned character is about 3.5k triangles and 3 draw calls; keep a film within the world's budget
  (`host.stats()`), at most 3 extra characters on top of a busy world.

## Cue reference

See the header of `park3d/cine.js` for the full list with every option: camera (`shot`, `shake`, `blur`, `vignette`,
`speed`), actors (`place`, `walk`, `face`, `clip`, `mood`, `look`, `prop`, `show`, `spawn`, `despawn`), words (`say`,
`title`, `untitle`, `stamp`, `word`, `logo`), sound (`sfx`, `drum`, `beat`, `music`), light (`light`, `pulse`, `cone`,
`flicker`, `fx`), screen (`letterbox`, `dip`, `flash`) and flow (`wait`, `call`, `end`).

Film options: `letterbox` ('scope' default: 2.39:1 on landscape, 10 % bars on portrait), `dipIn` (start covered),
`holdSync` (the film lights its own world), `wide: false` (stay in the 9:16 column on desktop). Reel options: `world`
and `args` (load that world first, under the dip), `card` ({ style: 'chapter', text, sub } shown during the load,
`cardMs` minimum), `dipColor`, `dipMs`, `dipOutMs`, `setup(world)`, `blendOut`.

## Checking a film

```
node tools/beatbox_heroes/cine_shot.mjs /tmp/cine --film opening --at 'office:2,street:10,dream:20' --sizes 390x844,1280x720
node tests/beatbox_heroes_r3cine.test.mjs
```

The shot tool freezes the reel (`cine.pause`) and jumps with `cine.seek(sec)` (simulation only, no rendering), then
lets the real frame render. Look at every frame at both sizes before shipping a film.

## The films

Opening (replaces the six intro plates in 3D; the 2D intro is unchanged), about 110 s:

1. Card: ROXORLOOPS & JASMIN / present (covers the build of the office set).
2. Office, 17:12 (VHS stamp TUE 17:12 REC, the hum of the tubes, no music): symmetrical push in on the hero alone at
   his desk, the window on the dusk city behind him; he looks up; a tube flickers.
3. The boss's view, from above his shoulder, the hero small in the chair: "You are fired." (subtitle, BOSS).
4. Close up, handheld breath, slow push: the boss walks off without a look; the face falls. Narration: Tuesday 5:12 pm.
5. High angle: he stands, takes the box with the plant. "You leave with a box, a plant and $40."
6. Crossfade to the EXIT door looking back: he walks towards the lens through the empty office. The door.
7. Card: THE WALK HOME. Neon Row at night in the rain: crane down behind him, he walks away from us (thunder, flash).
8. Crossfade: tracking profile along the shop windows. Crossfade: low wide angle under the lamp, a cone of light, the
   rain in it; he puts the box down and turns to us. "You have one special skill."
9. Silence. Extreme close up, vignette closes. The first B: sound rings out of his mouth, a huge B in the frame.
10. Cut wide from across the road: B, t, K, each answered by every neon on the street. "You are a beatboxer."
11. Whip into an orbit: two bars of beat, the letters flying off his lips, the rings, the mood turns happy.
12. Crane up and away over the wet street. "And for one minute, the street is yours."
13. Card: HOME / Rent is due on Sunday. Dollhouse wide of the flat, he carries the box in; Foxy on the couch.
14. Two shot, then shot reverse shot (OTS): the plant in the box, "They fired me. I have forty dollars.", rent is
    sixty every Sunday, the idea (busk in the park, tips pay rent, every listener can become a fan), a high wide for the
    jam line, a close up for "Maybe somebody there will notice you."
15. Dip: the night of practice in sharp cuts on the beat, the VHS clock jumping 23:14, 00:47, 01:58, the beats bad
    then better. He sits on the bed. Heartbeat, blur, dip to white.
16. The dream: the World Cup stage in slow motion (0.35), the LED wall reads WORLD CUP and his name. The plan.
17. Crossfade: crane over the VS deck, a small figure on the world stage. Speed back to 1, the crowd roars.
18. Close: the finisher, confetti. Wide, the stage dims: BEATBOX HEROES lands letter by letter on his own drums,
    slam, flash, BUSK. BATTLE. BECOME CHAMPION. Dip. Then the tutorial street (or the save's place), like the 2D intro.

Story beats (core.js STORY, played when the place scene is up after the activity that caused them):

| id | where | trigger |
|---|---|---|
| firstJam | park, the cypher | the first finished jam |
| sightJam | park, the cypher | 2nd jam, or a jam after a battle win: BeeAmGee at the back, rack focus, a nod, gone |
| sightBusk | park, the busk spot | 4 busks from day 3 |
| meet | park, the bench | the first park visit the day after the sighting |
| pigpen | park, the cypher | the 3rd jam: Pig Pen pushes in |
| famous | park, the cypher | 5 jams and 30 fans: slow motion, a flurry nobody can answer |
| firstWin | bar, the stage | the first battle won (core.js storyBattle) |
| firstLoss | bar, the stage | the first battle lost before any win |
| firstShowcase | bar, the stage | the first Friday showcase |
| champion | bar, the stage | the World Cup final won (Penny, Rohzel, the card WORLD CUP CHAMPION) |
| morning1 | flat, the bed | the first morning (day 2), before the morning card |
| collapse | flat | passing out at 02:00, before the morning card |
