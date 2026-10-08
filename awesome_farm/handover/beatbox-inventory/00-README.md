# Beatbox Story — feature inventories (parity checklist for the Phaser rebuild)

Source of truth for the *old* game: `C:\Users\danhi\Games-awesome-farm\beatbox_story\beatbox-story.jsx` (18,800 lines, React).
These twelve files were produced by reading that file section by section. They describe **what the code does** (not what its
comments claim), with exact numbers, state fields, text and drawing details, and flag bugs/oddities.

Start with `../HANDOVER_2_BEATBOX_STORY_REBUILD.md` (the plan), then use these as you rebuild each area.

| File | Old-file lines | Area |
|---|---|---|
| `01-data-and-systems.md` | 1–1260 | data tables, `initialChar` (the save), time, rent, events, challenges, achievements, outfits, flashbacks, gating |
| `02-mingle-gear-activity-engine.md` | 1253–2260 | bar mingle + romance, gear catalog, the `useActivity` tick engine |
| `03-activity-minigames-pitch.md` | 2260–4025 | busk, RhythmTap, RunTracker, pitch detection, PitchTuner |
| `04-beatbox-hero-mic-sequencer-studio.md` | 4020–5785 | Beatbox Hero, mic detector, Sequencer, Sound Studio |
| `05-ui-components-cutscene-panels.md` | 5780–7440 | Cutscene engine, icons, Messages, Foxy modal, DevPanel, Settings, Achievements |
| `06-scenes-characters-title-a.md` | 7432–9130 | Mingle modal, rent scenes, Foxy/Pig Pen/BeeAmGee, flashbacks, title, dream, apartments |
| `07-scenes-tour-training-intro-b.md` | 9124–10880 | tour, date, open mic, sleep, training scenes, intro story, tutorials, Slots screen |
| `08-main-app-hood-crew-songs.md` | 10877–12680 | **main app architecture**, Create, Hood map, Crew, Songs, Livestream, coaching |
| `09-house-and-shop.md` | 12624–14695 | House (training, kitchen, couch, morning transition, wardrobe, studio), Shop |
| `10-park-bar-showcase.md` | 14690–16445 | Park, Rohzel, showcase, open mic, nap/sleep, Bar |
| `11-battle-stage-audio-music.md` | 16420–17875 | battle stage + HUD, every synth sound recipe, samples, music |
| `12-battle-screen.md` | 17865–18800 | battles, crews, festival resolution, worked test vectors |

Conventions in the files: `(NNNN)` or `L####` = a line in the old `.jsx`; `[ext L…]` = a helper defined outside the section;
"Rebuild notes" = what to lift into a framework-free TypeScript module vs what needs a Phaser equivalent.

Suggested first step: a 10-line script that turns every `##` heading in these files into a checkbox line in `PARITY.md`.
