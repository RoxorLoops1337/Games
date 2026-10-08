# Beatbox Heroes: story plan (ported from Beatbox Story)

Owner feedback: "I couldn't find the jam in the park yet. BeeAmGee should not be in the park from the start, he should be noticing you after a while. Take the storylines from Beatbox Story."

Source: `beatbox_story/beatbox-story.jsx` (ParkScreen `activities.jam`, the open mic finish, `finishBattle`, `FOXY_TIPS`, `MINGLE_PIGPEN`, `MINGLE_CRYSTIX`, `BJARNE_LINES`, `FLASHBACKS`, the onboarding checklist, the festival arc).

## 1. The Beatbox Story storyline (what it does)

| Beat | Trigger in Beatbox Story | What happens | Flag |
|---|---|---|---|
| Foxy points to the jam | no jam yet (Foxy tip pool) and the `try_jam` hint (day >= 2, cash >= 5) | "i heard there's jams in the park. that's where the beatboxers go right?" | none |
| The JAM (park cypher) | park activity, daytime only (before 18:00), any day | 5 blocks: +1 random stat (mus / tec / ori), 1 to 3 fans, 8 xp, mood up. Counts `jamCount`, daily / weekly challenges, achievements (First Steps, Cypher Regular, Fedora at 10 jams) | `firstJam`, `jamCount` |
| First jam | the first finished jam | "You stand in the circle. Strangers, all of them. None of them care where you slept last night. Maybe this is what you needed." | `firstJam` |
| Pig Pen challenges you | a jam with 3+ jams (or Showmanship 8+) | "yo. you. new face. you sound like you been practicing in a closet. saturday. bar. you and me." | `pigPenChallenged` |
| BeeAmGee sighting | a jam after your first battle win | "Someone's standing at the back of the cypher. Gray beard. Leather jacket. Doesn't perform. He nods once when you finish your round. Then he's gone." | `bjarneCypherSighting` |
| BeeAmGee introduces himself | the next open mic after the sighting | "saw you in the cypher last week. you've got something. raw. unfinished. but something. name's BeeAmGee. been at this thirty years. come find me when you're ready. studio. fifty bucks." | `bjarneIntroduced` |
| Studio coaching | after the introduction, $50, 3 day cooldown | +1 stat of your choice, one backstory line per session (the '92 battle, the daughter, "find someone to come home to") | `bjarneSessions` |
| Famous beatboxer visit | a jam with 5+ jams and 30+ followers | "The circle goes quiet mid-round. Someone you know from the videos just stepped into the cypher..." | `fatboxgVisit` |
| Pig Pen at the bar | mingle encounters by state: challenged, lost to him, beat him once | "saturday's getting close", "i told you. you're not ready", "rematch. this saturday" | `pigPenBattled`, `pigPenWins` |
| Penny reveal | the 2nd win against Pig Pen | "y'know my mum used to call me Penny... call me Penny too if you want. just... not in front of the others." | `pennyReveal` |
| Crystix | bar mingle after 2+ battle wins | the online friend from the forum, in person | `crystixMet` |
| Rohzel's Friday offer | 30 followers and 5 open mics | Friday showcase slots | `rohzelFridayOffer` |
| Flashbacks at bedtime | first jam and day 5; rent late or day 12; 100 followers; first showcase or day 20 | childhood mirror, the parents' voicemail, the old YouTube comment, the bus home | `flashbacksSeen` |
| Festival BBBWC2027 | 3 opponents beaten, 5 shows, all stats 8+, day 25 | invite, 14 day prep, pick a path, the final | `festivalInviteSent`, `festivalWon` |

## 2. How Heroes modelled it before this change

- `core.js`: `NPCS.beeamgee` (mentor), `COACH_LINES` (the `BJARNE_LINES`, already ported), the `coach` action ($50, 3 day cooldown), `metNpc` (lip roll unlocks on meeting him), no jam, no story flags.
- `places.js`: the park first-visit dialog WAS BeeAmGee introducing himself; `npcs()` drew him on the bench unconditionally; the bench sheet always had PRIVATE COACHING, TALK, FREE LESSON.
- `park3d/world_park.js`: `npcSpecs: ['beeamgee']` always. `r3/spotmap.js`: park spots busk, bench, run, flyers, gate.
- `game.js` `G.goal`: busk, sleep, open mic, train, 50 fans and 5 open mics, the ladder, the World Cup. Nothing about the jam.

## 3. The mapping (implemented)

### The JAM
- **Data** (`core.js`): `JAM` = from day 2, 12:00 to 18:00 every day, 60 min, 10 energy; `jamOn(ch)`; `JAM_WHEN` text. Saves count `n.jams` (new field, default 0) and `flags.jamDay`.
- **Activity**: `perform` with `kind: 'jam'` runs the existing rhythm mini game (2D rhythm scene, 3D `r3/scenes_rhythm.js` busk venue). `reward('jam')`: fans and xp, no cash (Beatbox Story: no cash for jams), mood up, plus a random skill up (mus / tech / ori, +0.5 to +1.2 by accuracy, Beatbox Story's "+1 random stat"). `jamWatch` (JUST LISTEN, 30 min, no mini game): mood and a little Originality. AGAIN on the result card is refused once the jam is over (`activity.js`).
- **Discoverable**: the `Next:` goal says "join the JAM in the PARK. The cypher meets every afternoon, 12:00 to 18:00" from day 2 until the first jam (only while it can still happen today); the day 2 morning card has Foxy mention it; every other Foxy tip is a Beatbox Story jam line (`storyTip`); a toast "The JAM has started in the PARK!" when the clock crosses 12:00 (`spend`); the hood map pin says JAM ON NOW (2D) and the park door and map pin wear a `!` badge (3D, `spotmap.gates`); the travel card says THE JAM IS ON NOW.
- **2D park**: a `jam` hotspot in the grass below the bench, only while the jam is on (`places.js parkScene`), five of the day's regulars beatboxing and dancing in a half circle (`cypher()`), a THE JAM sign over it. Sheet THE JAM: JOIN THE CYPHER / JUST LISTEN; outside the hours it says when the jam meets.
- **3D park**: `world_park.js` adds a `jam` spot (new glyph in `spots.js`) on the plaza in front of the graffiti wall (5.5, -20), an instanced crowd ring open towards the camera (`char_crowd.js createCrowd`, 10 or 16 spectators, one draw call) and two named regulars (Mira beatboxing, Luca cheering, `createNPC`). Built from `args.jam`; `terrain.story.setJam(on)` shows and hides it live (the anchor goes away, the spot hides, its light pillar collapses). `r3/scenes_world.js` passes the args and flips it in `sync()` when the clock crosses 12:00 or 18:00. `spotmap.js`: `jam: 'act'` -> `ACTIONS.park.jam`, goal beacon on the jam spot.

### BeeAmGee notices you
- **Not there at the start**: new saves have `flags.story = 1` and no `bmgMet`. `bmgHere(ch)` decides; 2D `npcs()`, the bench sheet rows (coaching, talk, free lesson) and 3D `npcSpecs` all follow it. Without him the bench sheet is rest / run / flyers and the 3D bench prompt reads REST.
- **The sighting** (`storyAfter`, adapted from `bjarneCypherSighting`): at the 2nd jam, or at a jam after a battle win (the Beatbox Story trigger), or after 4 busks from day 3 (he watches you busk). Narration: "Someone is standing at the back of the cypher. Grey beard. Denim jacket. Gold glasses. He does not perform. He nods once when you finish your round. Then he is gone." Stores `flags.bmgSighted` (day) and `flags.bmgVia`.
- **The meeting** (adapted from `bjarneIntroduced`, moved from the open mic to his bench as the owner asked): from the next day (`bmgDue`) he sits on his bench, the `Next:` goal says "someone was watching you. Go back to the PARK and look at the bench", and the first park visit opens with "Saw you in the cypher the other day. You have got something. Raw. Unfinished. But something. Name is BeeAmGee. Been at this thirty years. This bench is my office. Sit with me any day for a free lesson..." (`story` action `bmgMeet`: `flags.bmgMet`, `seen.beeamgee`, so the lip roll unlocks and its card opens after the dialog). From then on he is on his bench every visit.
- **Old saves**: `migrate` gives saves without `flags.story` `bmgMet` when they had already met him the old way (`visited_park` was his introduction, a lesson, coaching, a tip, `seen.beeamgee`), so he stays. Saves that never went to the park meet him the story way.

### Other small beats ported
- First jam narration (`firstJam`), Pig Pen crashing the cypher at the 3rd jam (`pigpenJam`, his lines adapted to the Heroes ladder: "Saturday nights at the bar. Climb the ladder. I will be waiting at the top."), the famous beatboxer at 5 jams and 30 fans (`famousJam`), Foxy's jam arc tips (no jam yet, still going, the loud guy). One beat per finished set.
- Plumbing: a `story` effect `{ id, lines }` queues in `G.storyQ` and plays as one dialog when the place scene is up (after the result card), merged with the first-visit lines (`places.js firstVisit`, inherited by the 3D sibling). The intro card no longer promises BeeAmGee in the park; it says Foxy heard about the jam.

## 4. Next steps (not ported yet)

1. **Penny reveal**: after the 2nd win against Pig Pen (`beat.pigpen` plus a win counter), the "my mum used to call me Penny" scene at the bar. Heroes already has Penny as the World Cup final boss, so this needs a decision: Pig Pen's real name, or keep Penny separate.
2. **Pig Pen bar encounters** by state (challenged, lost to him, beat him once): a mingle variant for Pig Pen at the bar (`MINGLE_PIGPEN`), needs him as a bar regular in 2D and 3D.
3. **Crystix**: the forum friend at the bar after 2 battle wins; needs a look in `NPCS` and a mingle hook; unlocks a duet option later.
4. **Rohzel's Friday offer** as a dialog when you reach 50 fans and 5 open mics (Heroes already gates the showcase on that; only the scene is missing).
5. **Flashbacks** on the morning card (`FLASHBACKS`: childhood, parent voicemail, the YouTube comment, the bus home), one per trigger, `flags.flashbacks`.
6. **Jam achievements and gear**: First Steps (first jam), Cypher Regular (10 jams), the Fedora at 10 jams, daily / weekly challenge "do 3 jams".
7. **Studio coaching in the Sound Lab** (Beatbox Story has it in the studio): Heroes keeps it on the bench; a second entry in the lab could come later.
8. **Festival arc** (BBBWC2027 invite, 14 day prep, pick a path): Heroes has the World Cup at the bar; the invite and prep weeks could wrap it.
9. A jam crowd in the 3D rhythm venue (the set itself still plays on the busk stage) and a cypher turn order with real rival rounds (the battle machinery could run "trade rounds" against the regulars).
