// Cinematic story-intro suite. The intro is pure DOM/overlay UI, so the logic
// suites never touch it — this drives the beat-by-beat state machine headlessly
// (the harness stubs the DOM) and checks the skip / once-only behaviour plus that
// every scene image actually ships on disk.
//
//   node tests/no_room_for_heroes_intro.test.mjs
import { loadGame, harness } from './no_room_for_heroes_lib.mjs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));

const A = loadGame(`playIntro,introNext,skipIntro,endIntro,replayIntro,introSeen,titleScreen,
  loadAudioPref,leaveTitle,INTRO_SCENES,INTRO_FINAL,
  get introIdx(){return introIdx;},
  get uiScreen(){return uiScreen;},
  get audioOn(){return audioOn;},
  get audioMutedPref(){return audioMutedPref;},
  setAudioPref(v){ try{ localStorage.setItem('bm_audio', v); }catch(_){ } },
  resetIntroSeen(){ try{ localStorage.removeItem('bm_intro_seen'); }catch(_){ } }`);
const t = harness('intro (story)');

// --- content: 7 narrated scenes (scene 8 is the title hand-off) ---
t.ok(A.INTRO_SCENES.length === 7, 'seven narrated intro scenes (8th beat is the title)');
t.ok(A.INTRO_SCENES.every(s => s.img && s.text), 'every scene has an image + narration line');
const missing = A.INTRO_SCENES.filter(s => !existsSync(join(here, '..', 'no_room_for_heroes', s.img)));
t.ok(missing.length === 0, 'all intro scene images ship on disk' + (missing.length ? ` (missing: ${missing.map(s => s.img).join(', ')})` : ''));
t.ok(typeof A.INTRO_FINAL === 'string' && A.INTRO_FINAL.length > 0, 'the title lead-in line is defined');

// --- a fresh profile boots straight into the intro on the first scene ---
t.ok(A.uiScreen === 'intro', 'a fresh profile auto-plays the intro on first load');
t.ok(A.introIdx === 0, 'intro opens on the first scene');
t.ok(A.introSeen() === false, 'first load: intro not yet marked seen');

// --- tapping walks through all seven scenes, then the title hand-off beat ---
A.introNext();
t.ok(A.introIdx === 1, 'tap advances to the next scene');
for (let i = 0; i < 5; i++) A.introNext();          // → idx 6 (last image scene)
t.ok(A.introIdx === 6, 'reaches the seventh / final image scene');
A.introNext();                                       // → final lead-in beat
t.ok(A.introIdx === 7, 'after the last scene comes the title hand-off beat');
t.ok(A.introSeen() === false, 'still not marked seen until the intro actually ends');

// --- ending hands off to the title screen (scene 8: logo flies in) + seen flag ---
A.endIntro();
t.ok(A.introSeen() === true, 'finishing the intro marks it seen (no auto-replay next time)');
t.ok(A.uiScreen === 'title', 'the intro hands off to the title screen');

// --- Skip ends it immediately from any point ---
A.resetIntroSeen();
A.replayIntro();
t.ok(A.introSeen() === false && A.uiScreen === 'intro' && A.introIdx === 0, 'the ↻ Story button replays from scene 1');
A.skipIntro();
t.ok(A.introSeen() === true && A.uiScreen === 'title', 'Skip ends the intro and lands on the title screen');

// --- music is forced ON for the intro + title even if the player muted before ---
A.setAudioPref('off');           // a previously-saved mute
A.loadAudioPref();
t.ok(A.audioOn === true, 'a saved mute does NOT silence the intro/title — music is forced on');
t.ok(A.audioMutedPref === true, 'the saved mute is remembered as the standing preference');
A.leaveTitle();
t.ok(A.audioOn === false, 'entering the game restores the saved mute');

t.done();
