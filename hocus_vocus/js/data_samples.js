// Hocus Vocus: data_samples.js: the owners' optional recordings (HV_ART_AUDIO 11.1). Empty means every sound is synthesised, and then
// no file is ever requested. Fill it with the real beatbox and vocal recordings of RoxorLoops and Jasmin; the how-to is hocus_vocus/audio/README.md.
//
// One IIFE that registers DATA.SAMPLES (no top-level names), a frozen manifest read by js/audio.js. It is validated in AUDIO's init and never in
// DATA.audit: a bad entry is reported once with a console warning and skipped, never thrown, so a typo here can only leave a sound synthesised.
//   Entry     a file name without extension ('kick_soft' means audio/kick_soft.m4a, then .ogg, then .mp3), a list of names (they play in turn,
//             round robin), or {files: [names], vol (0 to 2, default 1), midi (the note a sung syllable was recorded at), var (cents of random
//             pitch per play, default 0), start, end (seconds, to trim)}. A name is lowercase letters, digits, _ and -, never a path or a URL.
//   sfx       keys are DATA.LISTS.sfx ids, or id.heroId for a per-hero variant (the variants exist for card_play_attack, card_play_skill,
//             card_play_power, swap, hero_down and hero_revive; hero ids hanae kuro suzu raiga).
//   spells    keys are DATA.brushes ids (stroke wave fan splash halo blot): plays on the first cell instead of the synthesised gesture.
//   syllables keys are the vox syllables (boots cats ts pf k bwaa ab ra ca tada hey boom) and vowels (oo ah mm), re-pitched by up to 7 semitones.
//   stingers  keys are victory, defeat, boss_intro and phase_change: played over the music, which ducks under them.
(() => {
  'use strict';

  DATA.SAMPLES = Object.freeze({
    version: 1,
    base: 'audio/',                 // relative to hocus_vocus/index.html; never a URL
    formats: ['m4a', 'ogg', 'mp3'], // the loader picks the first one this browser can decode, and tries the next on failure
    preload: 'idle',                // 'idle': load in the background just after the first tap; 'lazy': load on first use
    maxSeconds: 120,                // decoded audio budget for all files together
    gain: 1,                        // one trim for every sample
    sfx: {
      // 'hit_light': 'kick_soft',                                                // a file name without extension: audio/kick_soft.m4a
      // 'card_play_attack.kuro': { files: ['bk_1', 'bk_2', 'bk_3'], vol: 0.9 },  // round robin, a per-hero variant
    },
    spells: {},                     // DATA.brushes ids: plays on the first cell instead of the synthesised gesture
    syllables: {},                  // vox syllables: boots cats ts pf k bwaa ab ra ca tada hey boom, vowels oo ah mm
    stingers: {},                   // victory, defeat, boss_intro, phase_change: played over the music, which ducks under them
  });
})();
