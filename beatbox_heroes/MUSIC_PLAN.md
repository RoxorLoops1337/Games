# Beatbox Heroes: genre music with your own sounds in it

Goal: the game's songs are hip hop, trip hop, drum and bass and techno, and the sounds the player recorded in the Sound Lab (kick, hat, snare, clap, throat bass, hum, lip roll) are played inside them.

## Songs

| id | genre | bpm | key points |
|---|---|---|---|
| title | techno | 126 | four on the floor, offbeat open hats, rolling bass, acid arp, lip roll stabs |
| studio | minimal techno | 122 | clean clap, glass pads, throat bass stabs |
| street | boom bap hip hop | 90 | 808 sub bass, ghost snares, lip roll stabs |
| park | hip hop | 96 | bouncy kick, 808 bass, hum stabs |
| shop | jazz hop | 100 | walking upright bass under a boom bap kit |
| home | trip hop | 76 | half-time snare, vinyl crackle, hum |
| bar | trip hop | 90 | funk bass, throat bass stabs |
| creator | lo-fi hop | 84 | unchanged feel |
| battle | drum and bass | 172 | two-step, reese bass, lip roll stabs |
| intro, victory, defeat | unchanged | | |

The rhythm game's backing groove already had boom bap, house, trap and two-step; it is unchanged.

## Recordings in songs (`audio.js`, "recorded sounds inside the songs")

- Drum hits of a song: k to B, h and o to t, s to K, c to Pf, tom to B pitched. A kick keeps a quiet synth sub under the recording.
- Bass notes: a recorded throat bass (else hum) pitched to the note (folded into one octave so the timbre stays natural), a sine sub underneath.
- `vox` events (recipe field `vox: { w, lo, hi, d }`, pattern `voxes`, section field `vox`): pitched LR, HUM or TB on the chord tones, the synth voice of that sound when nothing is recorded.
- Pitch of a sample: `Mic.yin` over three windows (median), else the synth voice's pitch (TB 55 Hz, HUM 146.83, LR 88).
- Songs only (`T.kind === 'music'`). The backing groove never uses recordings.

## Checks without ears

`tests/beatbox_heroes_music.test.mjs`: tempo band per genre, four on the floor for techno, snare backbeat for hip hop and drum and bass, kick placement for drum and bass, loop lengths, vox sounds and note ranges, recordings used for kicks, hats and snares, bass pitched to every note, backing groove untouched.
Offline renders (`tools/beatbox_heroes/audio_render.mjs`) were compared to the old tracks: loudness within about 2 dB, no clipping, and the rendered low end has the intended pulse (techno strongest on every beat).
