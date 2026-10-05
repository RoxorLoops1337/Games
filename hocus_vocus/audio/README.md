# Hocus Vocus audio: dropping in your own recordings

For RoxorLoops and Jasmin. The game makes every sound itself (a synthesised band of beatbox hits, sung vowels and sound effects), so it plays
fine with this folder empty. This is where your real beatbox and vocal recordings go when you want them to replace the synthesised ones.
You can swap in one sound at a time: anything you have not recorded, or anything that fails to load, simply stays synthesised.

Until you list something, `js/data_samples.js` holds empty tables and the game requests no file at all. Once you do list files, the
repository check (`npm run check`) stays green as long as every entry is well formed (see step 4).

## The five steps

1. Record each sound dry (no reverb: the game adds its own hall), trim the silence at the very start, and export it as `.m4a` (plays on
   every phone, so the safest choice) or `.ogg`, with the peak at -1 dBFS. Mono is fine unless the stereo matters.
2. Put the files in this folder, `hocus_vocus/audio/`.
3. List them in `hocus_vocus/js/data_samples.js`, for example `sfx: { hit_light: 'my_kick' }`. A list of names plays them in turn:
   `sfx: { hit_light: ['kick_1', 'kick_2', 'kick_3'] }`.
4. Run `npm run check`. It accepts a manifest with entries and judges the manifest itself: the shape, the key of every entry (a real
   sound id, Spell, syllable or stinger) and every file name (lowercase letters, digits, `_`, `-`, no extension). A typo turns it red
   with the entry named. It does not look for the files, so a missing file stays green: run `node tools/hocus_vocus/mix.mjs --samples`
   (see "Volume") to have missing files reported. Then open the game through a local server (see "Trying it" below) and play. Anything
   missing or broken stays synthesised, so you cannot break the game with a wrong name; the browser console says what it skipped.
5. Commit and push as usual. The build copies this whole folder to the site (`dist/hocus_vocus/audio/`).

## File rules

| Rule | Why |
|---|---|
| Folder: `hocus_vocus/audio/` | The manifest's `base` is `audio/`, relative to `hocus_vocus/index.html`. It is never a URL. |
| Names use lowercase letters, digits, `_` and `-` only, for example `kick_soft` | Anything else (a dot, a slash, a space, a capital) is rejected, so a name can never point outside this folder. |
| In the manifest, write the name without the extension: `'kick_soft'` | The game adds `.m4a`, then `.ogg`, then `.mp3` and uses the first one the browser can play. |
| Supply the same sound as `.m4a` and `.ogg` if you can | Then every browser has one it can decode. One format is enough for a phone. |
| Give a replacement a new name: `kick_soft_v2` | Files are cached hard (`force-cache`), so an old name may keep serving the old recording. |
| Keep each file short: a hit under a second, a stinger a few seconds | The decoded budget is 120 seconds for all files together (`maxSeconds`). Past it the remaining keys stay synthesised and the console says so once. |

To convert a WAV export, for example with ffmpeg:

    ffmpeg -i kick_soft.wav -ac 1 -c:a aac -b:a 128k kick_soft.m4a
    ffmpeg -i kick_soft.wav -ac 1 -c:a libvorbis -q:a 4 kick_soft.ogg

## The manifest, `js/data_samples.js`

```js
DATA.SAMPLES = Object.freeze({
  version: 1,
  base: 'audio/',                 // never a URL
  formats: ['m4a', 'ogg', 'mp3'], // tried in this order
  preload: 'idle',                // 'idle': load in the background just after the first tap; 'lazy': load on first use
  maxSeconds: 120,                // decoded audio budget for all files together
  gain: 1,                        // one trim for every sample
  sfx: {
    hit_light: 'kick_soft',
    'card_play_attack.kuro': { files: ['bk_1', 'bk_2', 'bk_3'], vol: 0.9 },
  },
  spells: { wave: 'vocal_run' },
  syllables: { boots: { files: ['boots'], midi: 50 } },
  stingers: { victory: 'victory_cheer' },
});
```

An entry is one of:

| Form | Meaning |
|---|---|
| `'kick_soft'` | One file. |
| `['kick_1', 'kick_2']` | A list: the files play in turn (round robin), so a repeated sound does not sound machine-gunned. |
| `{ files: [...], vol, midi, var, start, end }` | The long form, every field optional except `files`. |

The long form's fields:

| Field | Meaning |
|---|---|
| `files` | The file names, as above. |
| `vol` | A volume trim from 0 to 2 (default 1). See "Volume". |
| `midi` | For a sung syllable: the MIDI note it was recorded at (60 is middle C). |
| `var` | Cents of random pitch change per play, 0 to 1200 (default 0: recordings are not detuned). |
| `start`, `end` | Seconds to trim at either end of the file (for a recording you cannot re-export). |

`preload: 'idle'` loads every listed file about 1.5 seconds after the first tap, interface sounds first. `'lazy'` loads a file the first
time its sound is asked for (that first play uses the synthesised sound). Nothing is fetched before the first tap or key press, and a
page opened straight from disk (`file://`) cannot fetch anything, so it stays fully synthesised.

## Every key you can list

**`sfx`: the 73 sound ids** (internal names, never renamed; they are in `DATA.LISTS.sfx` in `js/data.js`). Write one as the key.

| Group | Ids |
|---|---|
| Interface | `ui_click` `ui_hover` `ui_back` `ui_error` `ui_open` `ui_close` `ui_toggle` |
| Cards | `card_draw` `card_hover` `card_pick` `card_play_attack` `card_play_skill` `card_play_power` `card_discard` `card_exhaust` |
| Turns | `shuffle` `swap` `energy_gain` `turn_start` `turn_end` `enemy_turn` |
| Hits | `hit_light` `hit_heavy` `hit_crit` `hit_multi` `slash` `thud` `zap` `flame` `ice` `poison_tick` `thorn` `dodge` |
| Block | `block_gain` `block_hit` `block_break` |
| Statuses | `heal` `buff` `debuff` `stun` |
| Fights and bosses | `enemy_die` `hero_down` `hero_revive` `boss_die` `boss_intro` `phase_change` |
| Map and Spells | `paint` `ink_splash` `brush_pick` `brush_use` `step` `reveal_landmark` `ink_gain` |
| Everything else | `well` `gold` `buy` `chest_open` `relic_get` `gem_socket` `gem_get` `forge_hit` `upgrade` `camp_fire` `rest` `event_open` `choice` `page_turn` `level_up` `victory` `defeat` `achievement` `unlock` `save` |

**Per-hero variants: `id.hero`.** Six sounds can have one recording per hero, which wins over the plain id for that hero only (the other
heroes fall back to the plain id, or to the synthesised sound):
`card_play_attack`, `card_play_skill`, `card_play_power`, `swap`, `hero_down` and `hero_revive`, each with
`.hanae` (Jasmin), `.kuro` (RoxorLoops), `.suzu` (RawClaw) or `.raiga` (Andy). For example `'card_play_attack.kuro'`. That is 24 variant keys.

**`spells`: the six Spells, by their internal ids.** A recording plays on the first cell of the Spell instead of the synthesised gesture
(the per-cell melody notes still play, so the map keeps singing). Not on Quality Low: see "Quality Low" below.

| Key | Spell |
|---|---|
| `stroke` | Boots and Cats |
| `wave` | Vocal Run |
| `fan` | Air Horn |
| `splash` | Abracadabass |
| `halo` | Surround Sound |
| `blot` | Hocus Focus |

**`syllables`: the sung and beatboxed syllables of the vocal voice.** Keys: `boots` `cats` `ts` `pf` `k` `bwaa` `ab` `ra` `ca` `tada` `hey`
`boom`, and the vowels `oo` `ah` `mm`. The game re-pitches a recording to the note it needs, but only within 7 semitones of the note it
was recorded at, so give the long form with `midi` (`{ files: ['oo_c4'], midi: 60 }`). Outside that range, or without `midi`, the
synthesised syllable plays instead.

**Quality Low (Settings, Quality).** On Low the map answers each unmuted hex with the plain pluck instead of the sung and spoken layers,
so Spell recordings and sung syllable recordings do not play on the map there (the plain pluck does). Sound effects, stingers and the
syllables sung inside the boss scores are not affected. Auto switches to Low by itself only when the game is running slowly.

**`stingers`: `victory` `defeat` `boss_intro` `phase_change`.** A recording plays together with the matching sound, over the music, and the
music ducks under it for its length.

## Volume

Every sample plays through the same Effects bus as the synthesised sounds, so the player's Effects slider governs all of them. The engine
plays each file at the measured level of the sound it replaces (so it sits where the synthesised one sat), multiplied by the entry's `vol`
and the manifest's `gain`. If you export every file with its peak at -1 dBFS and trimmed tight, the defaults are close already.

To get a suggested `vol` for each entry, run this from the repository root (it renders offline in a headless Chromium, so no sound card is
needed; run `npm install` once first, and set `CHROMIUM_PATH` to a Chromium binary if it cannot find one):

    node tools/hocus_vocus/mix.mjs --samples

It decodes each file you listed, plays it next to the synthesised version of the same key, and prints the loudness of both, the `vol` that
matches them by loudness and by peak, and the suggested one. Put that number in the entry, for example
`hit_light: { files: ['kick_soft'], vol: 0.9 }`. It also lists problems: a file it cannot find, a name that breaks the rules, files of one
entry whose loudness differs by more than 3 dB.

Useful options: `--manifest some.json` to measure a manifest other than the shipped one, `--audio-dir some_folder` to read the files from
elsewhere, and `--json` for a machine-readable table. Some Chromium builds cannot decode `.m4a`; the tool says so, and you can measure an
`.ogg` or `.wav` copy of the same file instead (point `--audio-dir` at a folder of copies and give `--manifest` a manifest whose `formats`
lists `'wav'` or `'ogg'`).

## Trying it

Serve the game over HTTP (opening the file from disk cannot load samples). From the repository root:

    cd hocus_vocus
    python3 -m http.server 8000

then open `http://localhost:8000/`, tap once (the sound only starts after a tap or a key press) and play. Press F12 and use the console:

| Console | Does |
|---|---|
| `AUDIO.samples()` | Lists every key you listed with its state (`idle`, `loading`, `ready`, `failed`, `over`) and the seconds decoded. `idle` means listed but not requested yet: in the first 1.5 seconds after the first tap, while it waits its turn (two files load at a time), or, with `preload: 'lazy'`, until the sound is first used. |
| `AUDIO.preview('hit_light')` | Plays that sound: your recording when it is ready. |
| `AUDIO.preview('hit_light', { synth: true })` | Plays the synthesised version, for an A/B against your recording. |

A line starting `AUDIO samples:` in the console is a skipped entry (an unknown key, a bad name, a missing file, a file the browser could not
decode) and says which one. A key that failed is not tried again until the page is reloaded.

## If a recording does not play

| Symptom | Likely cause |
|---|---|
| Nothing loads at all | The page was opened from disk (`file://`); use a local server. Or the manifest has no entries. Or you have not tapped yet (nothing loads before the first tap or key press). |
| A Spell or syllable recording never plays on the map | Quality is set to Low: the map uses the plain pluck there (see "Quality Low"). |
| `AUDIO samples: bad file name` | The name has an extension, a capital, a space or a dot. Write `'kick_soft'`, not `'kick_soft.m4a'`. |
| `AUDIO samples: unknown key` | The key is not in the lists above (check the spelling, and that a variant ends in `.hanae`, `.kuro`, `.suzu` or `.raiga`). |
| State `failed` | The file is not in this folder, has another extension than `m4a`, `ogg` or `mp3`, or the browser could not decode it. |
| An old recording still plays | The browser cached it: save the new one under a new name and change the manifest. |
| A sound is too loud or too quiet | Adjust its `vol`, or run `node tools/hocus_vocus/mix.mjs --samples` for a suggestion. |
| State `over` | The files together are longer than `maxSeconds`; trim them, or raise `maxSeconds` a little. |
