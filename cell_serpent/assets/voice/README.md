# Voice clips

Cell Serpent has five voice stings, all SYNTHESIZED in code (`../../voice_b16g.js`). No recordings are
committed. The ids are: `kick`, `hat`, `snare`, `uh`, `yeah`.

To use real recordings (for example RoxorLoops beatboxing and Jasmin singing), drop files here named
`<id>.mp3` (short, 0.2 to 1.5 seconds, mono, normalised): `kick.mp3`, `hat.mp3`, `snare.mp3`, `uh.mp3`, `yeah.mp3`.
A recording replaces the synth for that id; a missing id keeps the synth.

Files are only fetched when switched on, so a normal session never makes a request that fails:

- open the game with `?voicefiles=1`, or
- set `localStorage.cs_voice_files = '1'`, or
- set `window.CS_VOICE_FILES = 1` before the game starts.

The clips unlock by milestones (see `STINGS` in `voice_b16g.js`) and are played in the Stats tab (Voice Clips card)
and at key moments: stage clear, boss entrance, new best time, perfect clear, rare card, unlock.
