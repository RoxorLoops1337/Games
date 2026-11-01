# B21 Audio: SB.audio API
File: src/audio.js (classic script, Web Audio only, no assets). Load before UI scripts.
Test: `node tests/audio-test.js` (strict mock AudioContext, all sounds and scenes).

## Setup
- `SB.audio.init({seed})` once at boot. Loads saved settings (localStorage key `sb.audio.v1`, try/catch).
  Installs capture listeners for pointerdown, keydown, touchstart, click that lazily create and resume the AudioContext. Pauses on tab hide.
- Before the first gesture play() is a silent no-op, and music(scene) is remembered and starts at unlock.
- `SB.audio.unlock()` can be called from any click handler.

## Sfx
- `play(name, {vol, pitch, delay})` returns a handle with `stop(fadeSecs)`. Only `purr` is a real loop (stop it yourself, or pass `dur` seconds).
- Names: card_draw card_play cat_deploy meow (random) meow_1..meow_6 (or `{variant:0..5}`) purr hiss pounce_hit claw_scratch heavy_hit shatter knock_off box_flap yarn_tangle nap_zzz wake_stretch life_spent life_gained zoomies_surge crash_down witching_gong pest_squeak dog_bark vacuum_whirr spray_hiss relic_gain shop_coin upgrade_scratch victory_fanfare defeat_sting ui_click ui_hover.
- Aliases: click, hover, gong, coin, bark, squeak, win, lose. Unknown names return a no-op handle, never throw.
- `has(name)`, `names()` for debug menus. Hover, click, draw, squeak and scratch are throttled (30 to 50 ms).
- Big sounds (fanfare, sting, gong, heavy_hit, shatter) duck the music automatically.
- Pitch tip: pass `pitch` 0.8 to 1.3 per cat or pest type for variety.

## Music
- `music(scene)`: title, map, battle, witching, boss, shop, victory, defeat. Aliases: witching_hour, elite (battle), event (map), menu, rest, win, lose. `music('off')` fades out. Same scene twice is a no-op. Crossfades in about 0.6 s.
- `setIntensity(0..1)` smooths over bars. Battle: more percussion, bass drive, plucks, dissonance, tempo up to +18 percent. Witching: more bells and heartbeat. Boss is always driving.
- `setWarmth(cur, max)` is sugar for `setIntensity(1 - cur/max)`. Call it after every Warmth change.
- Suggested flow: round N start `music('battle')`, announced Witching round `music('witching')`, then back to `music('battle')`.
- Variation is seeded per scene and bar (`init({seed})` or `setSeed(n)`), so a run sounds the same on replay.

## Mix and settings
- `duck(amount=0.4, holdSecs=0.5, releaseSecs=0.6)` dips music only (dialogs, big reveals).
- `setVolume('master'|'music'|'sfx', 0..1)`, `setMuted(kind, bool)`, `toggleMute(kind='master')` returns new state, `isMuted(kind)`, `getSettings()`. All persist.
- `stopMusic()`, `stopAll()` (loops), `currentScene()`.

## Notes
- All audio calls are wrapped so a failure can never break the game. Without Web Audio everything is a silent no-op.
- Open items for UI agents: a settings panel with three sliders and three mute toggles. Mobile Safari needs the first tap, which init() already covers.
