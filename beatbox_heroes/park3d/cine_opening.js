// THE OPENING (owner CINE): the short film that replaces the six painted intro plates in 3D (r3/cine.js E.scenes3d.intro). 4 reels, about 110 s, skippable.
// It keeps the facts of the 2D intro (screens.js INTRO): Tuesday 5:12 pm, fired, a box, a plant and $40, the walk home in the rain, the one skill, Foxy, rent $60 every Sunday,
// busk in the park, the first bad beats at night, the jam in the park, the plan: busk, open mics, battles, the Beatbox Heroes World Cup.
// Shot sizes are widths at the subject (cine.js `w`): the cast is 1.72 m tall with a 0.9 m head, so ECU 0.7, CU 1.15, MCU 1.6, FS 2.4, WS 5. Portrait first: depth and height, not width.
// Interiors: short lenses (fov 44 to 52) keep the camera inside the walls; the flat's south and east walls are cut low for the dollhouse view, so wide shots come from there.
const shot = (o) => Object.assign({ do: 'shot' }, o);
const say = (who, text, o) => Object.assign({ do: 'say', who, text }, o);
const narr = (text, o) => Object.assign({ do: 'say', who: null, text }, o);
const wait = (s, o) => Object.assign({ do: 'wait', s }, o);
const cue = (k, o) => Object.assign({ do: k }, o);
export const BOSS = { name: 'Boss', body: 'boy', skin: '#e8c4a0', hair: { style: 'sidepart', color: '#6b6b80' }, eyes: { style: 'sleepy', color: '#4a4a5a' }, brows: 'thick', glasses: { id: 'round', color: '#17141f' }, top: { id: 'tux', color: '#3a3f55', color2: '#e9e3f2' }, bottom: { id: 'slacks', color: '#2a2d3d' }, shoes: { id: 'loafers', color: '#17141f' }, hat: { id: 'none' } };
const FOXY_SIT = { seat: 0.46, bpm: 84, amp: 0.55, slump: 1.1, armBack: true };

// ---- I. 17:12. The office. A long symmetrical push in. A man seen only from above his shoulder. A tube dies. The walk to the green EXIT, seen from the door.
const office = () => ({ id: 'opening.office', events: [
  cue('light', { time: 'dusk', instant: true }), cue('music', { id: null, fade: 0.8 }),
  cue('place', { who: 'hero', at: [0, -1.7], face: 0 }), cue('clip', { who: 'hero', clip: 'sit', opts: { seat: 0.5, slump: 1.15 } }), cue('mood', { who: 'hero', mood: 'neutral' }),
  cue('spawn', { id: 'boss', look: BOSS, at: [1.3, -0.25], face: -138, clip: 'idle' }), cue('prop', { who: 'boss', kind: 'clipboard' }),
  shot({ pos: [0, 1.8, 7.2], look: [0, 1.2, -1.8], fov: 30, to: { pos: [0, 1.5, 5.0], look: [0, 1.15, -1.8] }, dur: 8, ease: 'soft' }),
  cue('stamp', { text: 'TUE 17:12|REC' }), cue('sfx', { name: 'hum', o: { n: 8 } }),
  wait(2.4), cue('look', { who: 'hero', at: 'boss:head' }), wait(0.8), cue('flicker', { ms: 700 }), wait(1.0),
  // from above the boss's shoulder: the crown of his head at the bottom of the frame, the hero small in his chair
  shot({ pos: [2.1, 2.35, 0.62], look: 'hero:head', fov: 32, to: { pos: [1.95, 2.3, 0.45] }, dur: 3.5 }),
  say('boss', 'You are fired.', { name: 'BOSS', dur: 2.4 }),
  // the line lands. Nothing moves. Close on the hero
  shot({ on: 'hero', yaw: 4, w: 1.25, h: 1.25, lookH: 1.22, fov: 26, to: { w: 1.05 }, dur: 5, hand: 0.004 }),
  cue('walk', { who: 'boss', to: [[2.4, 1.2], [-4.5, 2.2]], speed: 1.2 }), cue('look', { who: 'boss', at: null }), cue('sfx', { name: 'step', o: { pitch: 0.6 } }),
  wait(0.7), cue('look', { who: 'hero', at: null }), cue('mood', { who: 'hero', mood: 'sad' }), wait(1.0),
  narr('Tuesday, 5:12 pm. You work in an office. Today your boss says it like a weather report.'),
  cue('flicker', { ms: 500 }),
  // he stands. From above: small, alone at the desk. He takes the box, and the plant
  shot({ on: 'hero', yaw: 25, w: 2.4, h: 2.7, lookH: 0.95, fov: 40, to: { w: 2.0 }, dur: 5 }),
  cue('despawn', { id: 'boss' }), cue('clip', { who: 'hero', clip: 'idle' }), cue('place', { who: 'hero', at: [-0.05, -1.55], face: 0 }),
  wait(0.5), cue('prop', { who: 'hero', kind: 'box', plant: true }), cue('sfx', { name: 'swoosh', o: { pitch: 0.6 } }),
  narr('You leave with a box, a plant and $40.'),
  // the exit: from the door end of the aisle, looking back down it, the lens follows him. He walks towards us between the empty desks, then turns off to the door
  // (the aisle runs between the two rows of pods at z 0.4, so nothing stands between him and the lens)
  shot({ pos: [6.6, 1.95, -0.55], look: 'hero:head', fov: 30, cut: 'xfade', ms: 700 }),
  cue('walk', { who: 'hero', to: [[-1.25, -1.6], [-1.25, 0.4], [4.4, 0.42], [5.9, 1.6]], speed: 1.15, prop: 'box' }),
  wait(7.4), cue('sfx', { name: 'door', o: { pitch: 0.8 } }),
] });

// ---- II. The walk home. Rain. Away from us down Neon Row, a tracking profile, the lamp. Then silence, and the first sound. The city answers.
const LAMP = [-6.7, 2.0];
const street = () => ({ id: 'opening.street', events: [
  cue('light', { time: 'night', weather: 'rain', instant: true }), cue('sfx', { name: 'rain', o: { n: 30 } }),
  cue('place', { who: 'hero', at: [10, 1.2], face: -90 }), cue('prop', { who: 'hero', kind: 'box', plant: true }), cue('mood', { who: 'hero', mood: 'sad' }),
  cue('walk', { who: 'hero', to: [[2, 1.7], LAMP], speed: 1.25, prop: 'box', face: 0 }),
  shot({ pos: [16, 7.2, 4.2], look: [0, 0.6, 1.2], fov: 38, to: { pos: [13.5, 3.0, 3.0], look: [1, 1.0, 1.4] }, dur: 7, ease: 'io' }),
  cue('stamp', { text: 'TUE 18:03|REC' }), wait(1.4),
  narr('You walk home in the rain.'),
  // (a fixed 3.2 m off his shoulder, in the near lane over the roofs of the parked cars: the far pavement is never between him and the lens)
  shot({ on: 'hero', yaw: 6, rel: false, dist: 3.2, h: 1.55, lookH: 1.0, fov: 44, hand: 0.008, cut: 'xfade', ms: 800 }),
  wait(3.0), cue('sfx', { name: 'thunder' }), cue('flash', { color: '#cfd8ff', ms: 500 }), wait(1.4),
  // under the lamp: low wide angle, the cone of light and the rain in it
  shot({ on: 'hero', yaw: 22, rel: false, w: 2.6, h: 0.4, lookH: 1.7, fov: 46, to: { yaw: 14, w: 2.3 }, dur: 6, cut: 'xfade', ms: 600 }),
  cue('cone', { id: 'lamp', at: [-8, 4.7, 3.5], to: [LAMP[0], 0, LAMP[1]], color: '#ffd9a0', r: 1.5, v: 1, ms: 1200 }),
  wait(2.0), cue('prop', { who: 'hero', drop: true, then: 'idle' }), cue('sfx', { name: 'step', o: { pitch: 0.7 } }), wait(0.6),
  cue('face', { who: 'hero', to: 0, ms: 700 }),
  narr('You have one special skill.'),
  // silence. Extreme close up. The first sound
  shot({ on: 'hero', yaw: 0, w: 0.8, h: 1.16, lookH: 1.14, fov: 26, to: { w: 0.66 }, dur: 5, hand: 0.003 }), cue('vignette', { v: 1, ms: 1200 }),
  wait(1.7), cue('mood', { who: 'hero', mood: 'neutral' }), wait(0.5),
  cue('clip', { who: 'hero', clip: 'beatbox', opts: { external: true, bpm: 88, amp: 0.9 } }),
  cue('drum', { id: 'B', who: 'hero', rings: 2, color: '#ff3ea5' }), cue('word', { text: 'B', at: [0.5, 0.3], size: 9, color: '#ffd35c', ms: 1300 }),
  wait(1.4),
  // the city answers: wide from across the road, every neon breathes with him
  shot({ pos: [-3.2, 0.9, 10.5], look: [-6.6, 2.6, 1.6], fov: 46, to: { pos: [-3.9, 1.0, 8.8] }, dur: 6 }), cue('vignette', { v: 0.45 }),
  cue('drum', { id: 'B', who: 'hero', rings: 1 }), wait(0.7), cue('drum', { id: 't', who: 'hero', rings: 1, color: '#2ee6ff' }), wait(0.7), cue('drum', { id: 'K', who: 'hero', rings: 1, color: '#ffd35c' }),
  wait(0.9),
  narr('You are a beatboxer. You make drum sounds with your mouth.', { dur: 3.6, wait: false }),
  shot({ on: 'hero', yaw: -65, w: 1.7, h: 1.1, lookH: 1.15, fov: 32, to: { yaw: 65, w: 1.45 }, dur: 7.6, ease: 'linear', cut: 'whip' }),
  cue('beat', { who: 'hero', pattern: 'B . t . K . t . B B t . K . t .', bpm: 96, words: true, rings: true, wait: true }),
  cue('mood', { who: 'hero', mood: 'happy' }),
  cue('beat', { who: 'hero', pattern: 'B t t B K . t t B . B t K t Pf .', bpm: 96, words: true, rings: true, wait: true }),
  // crane up and away: a small figure in a cone of light, rings going out over the wet street
  shot({ on: 'hero', yaw: 10, rel: false, w: 2.8, h: 1.6, lookH: 1.1, fov: 38, to: { w: 6.5, h: 8.5, lookH: 0.4 }, dur: 6, ease: 'io' }),
  cue('beat', { who: 'hero', pattern: 'B . t . K . t . B . t . K . Pf .', bpm: 96, rings: true }),
  narr('And for one minute, the street is yours.'),
  cue('vignette', { v: 0 }), cue('cone', { id: 'lamp', v: 0, ms: 900 }),
] });

// ---- III. Home. Foxy, the rent, the idea. A night of practice in sharp cuts. The bed. A heartbeat.
// HERO_AT: clear of the floor lamp (-2.3, -2.55) and the beanbag (-1.55, -1.85)
const HERO_AT = [-1.0, -3.0], PRACTICE = [0.6, 1.0];
const flat = () => ({ id: 'opening.flat', cast: { foxy: { rest: { clip: 'sit', opts: FOXY_SIT } } }, events: [
  cue('light', { time: 'night', instant: true }),
  cue('place', { who: 'hero', at: [3.4, 2.7], face: -120 }), cue('prop', { who: 'hero', kind: 'box', plant: true }), cue('mood', { who: 'hero', mood: 'neutral' }),
  shot({ pos: [7.9, 7.6, 9.6], look: [0.2, 0.4, -0.6], fov: 34, to: { pos: [7.0, 6.6, 8.4], look: [-1.0, 0.6, -1.2] }, dur: 7 }),
  cue('stamp', { text: 'TUE 18:40|REC' }), cue('sfx', { name: 'door' }),
  cue('walk', { who: 'hero', to: [[0.6, 0.6], [-0.9, -2.2], HERO_AT], speed: 1.35, prop: 'box', face: 'foxy', wait: true }),
  cue('prop', { who: 'hero', drop: true }), cue('sfx', { name: 'step', o: { pitch: 0.8 } }),
  cue('look', { who: 'foxy', at: 'hero:head' }), cue('look', { who: 'hero', at: 'foxy:head' }),
  shot({ on: ['hero', 'foxy'], yaw: 90, rel: false, w: 2.9, h: 1.55, lookH: 0.95, fov: 46 }),
  say('foxy', 'You are home early. Why is there a plant in a box?', { clip: 'sit', opts: Object.assign({ talk: true }, FOXY_SIT) }),
  shot({ on: 'hero', yaw: 45, w: 1.25, h: 1.2, lookH: 1.2, fov: 48 }), cue('mood', { who: 'hero', mood: 'sad' }),
  say('hero', 'They fired me. I have forty dollars.'),
  shot({ on: 'foxy', yaw: -35, w: 1.2, h: 1.1, lookH: 1.0, fov: 48 }), cue('mood', { who: 'foxy', mood: 'sad' }),
  say('foxy', 'Rent is sixty. Every Sunday. You know that, right?'),
  cue('mood', { who: 'foxy', mood: 'happy' }),
  say('foxy', 'OK. Idea. Go busk in the park. Play beats for the people walking by. Tips pay rent, and every listener can become a fan.'),
  shot({ pos: [1.6, 5.0, 3.0], look: [-2.6, 0.7, -2.1], fov: 44, to: { pos: [1.2, 4.6, 2.4] }, dur: 7 }), cue('mood', { who: 'hero', mood: 'neutral' }),
  say('foxy', 'And I heard there is a jam in the park every afternoon. A circle of beatboxers, trading rounds.'),
  shot({ on: 'hero', yaw: 45, w: 1.05, h: 1.22, lookH: 1.22, fov: 46 }), cue('mood', { who: 'hero', mood: 'happy' }),
  say('foxy', 'Maybe somebody there will notice you.', { dur: 2.6 }),
  // the night: sharp cuts on the beat, the clock jumps
  cue('look', { who: 'hero', at: null }), cue('look', { who: 'foxy', at: null }), cue('clip', { who: 'foxy', clip: 'sit', opts: FOXY_SIT }),
  cue('place', { who: 'hero', at: PRACTICE, face: 0 }), cue('light', { time: 1, instant: true }), cue('mood', { who: 'hero', mood: 'neutral' }),
  shot({ on: 'hero', yaw: 25, w: 1.6, h: 1.4, lookH: 1.12, fov: 40, cut: 'dip', ms: 600, color: '#07040e' }),
  wait(0.35), cue('stamp', { text: 'TUE 23:14|REC' }),
  cue('beat', { who: 'hero', pattern: 'B . . t K . . . B t . . . K', bpm: 82 }),
  narr('That night you practise your first beats. They are bad.', { dur: 3.2 }),
  shot({ on: 'hero', yaw: -40, w: 1.0, h: 1.1, lookH: 1.18, fov: 40 }), cue('stamp', { text: 'WED 00:47|REC' }),
  cue('beat', { who: 'hero', pattern: 'B . t . K . t . B . t . K . t .', bpm: 90, rings: true, wait: true }),
  shot({ on: 'hero', yaw: 150, w: 2.2, h: 2.2, lookH: 1.0, fov: 44 }), cue('stamp', { text: 'WED 01:58|REC' }),
  cue('beat', { who: 'hero', pattern: 'B t t B K t t t B t B t K t Pf t', bpm: 100, rings: true, words: true }),
  narr('But the better your timing, the more money and fans you earn.', { dur: 3.4 }),
  // he sits on the bed. The light goes. A heartbeat
  cue('place', { who: 'hero', at: [-5.85, 3.1], face: 90 }), cue('clip', { who: 'hero', clip: 'sit', opts: { seat: 0.5, drowsy: 1, slump: 1.2 } }),
  shot({ on: 'hero', yaw: 10, w: 1.9, h: 1.0, lookH: 0.95, fov: 42, to: { w: 1.4 }, dur: 5, cut: 'dip', ms: 700, color: '#07040e' }),
  cue('stamp', { text: '' }), wait(1.1), cue('sfx', { name: 'heart' }), cue('vignette', { v: 1, ms: 1500 }), wait(0.9), cue('sfx', { name: 'heart' }), cue('blur', { px: 3, ms: 1400 }),
  wait(1.1), cue('dip', { v: 1, ms: 700, color: '#fff6e8' }), wait(0.75),
] });

// ---- IV. The dream. The world stage in slow motion, the plan, the title landing on his drums.
const dream = (q) => ({ id: 'opening.dream', events: [
  // on a phone held upright the 12 m LED wall is wider than any frame, so it stacks the words (WORLD / CUP / name) in the middle where the lens can read them
  cue('call', { fn: (api) => { const w = api.world, ar = w.arena, nm = api.names.hero || '', port = api.camera && api.camera.aspect > 0 && api.camera.aspect < 0.9; if (ar && ar.opponent) ar.opponent.object.visible = false;
    if (ar && ar.splash) ar.splash(port ? [{ t: 'WORLD', c: '#ffd23f', k: 0.78 }, { t: 'CUP', c: '#ffd23f', k: 0.78 }, { t: nm, c: '#7af0ff', k: 0.5 }] : 'WORLD CUP', nm); if (w.lighting && w.lighting.setStageTheme) w.lighting.setStageTheme('gold', true); } }),
  cue('place', { who: 'hero', at: [0, 3.0], face: 0, y: 0.4 }), cue('clip', { who: 'hero', clip: 'idle' }), cue('mood', { who: 'hero', mood: 'neutral' }),
  cue('blur', { px: 0, ms: 1600 }), cue('vignette', { v: 0.55, ms: 1500 }), cue('speed', { v: 0.35, ms: 10 }),
  shot({ pos: [-0.4, 1.55, 10.5], look: [0, 2.7, 1.0], fov: 40, to: { pos: [-0.2, 1.8, 8.4], look: [0, 2.6, 1.0] }, dur: 8, ease: 'soft',
    port: { pos: [-0.3, 1.5, 13.0], look: [0, 3.3, 1.0], fov: 50, to: { pos: [-0.15, 1.7, 11.6], look: [0, 3.2, 1.0] } } }),
  cue('sfx', { name: 'crowd_cheer', o: { pitch: 0.5 } }), wait(0.8), cue('sfx', { name: 'heart' }),
  narr('Your plan: busk in the park, play open mics at the bar, win beatbox battles.', { dur: 3.8 }),
  // the world stage from the rig: a small figure on the big VS deck, the crowd all around
  shot({ pos: [0.6, 11.5, 9.5], look: [0, 0.4, 2.2], fov: 46, to: { pos: [0.3, 9.0, 7.6] }, dur: 6, cut: 'xfade', ms: 900, port: { pos: [0.6, 9.5, 15.5], look: [0, 2.6, 1.0], fov: 50, to: { pos: [0.3, 8.0, 13.8] } } }),
  cue('speed', { v: 1, ms: 1600 }), cue('call', { fn: (api) => { const ar = api.world.arena; if (ar && ar.cheer) ar.cheer(4); } }), cue('sfx', { name: 'crowd_cheer' }),
  narr('And one day, the Beatbox Heroes World Cup.', { dur: 3.2 }),
  shot({ on: 'hero', yaw: -15, w: 1.9, h: 0.9, lookH: 1.35, fov: 34 }), cue('clip', { who: 'hero', clip: 'finisher', opts: { bpm: 110 } }), cue('mood', { who: 'hero', mood: 'happy' }),
  cue('fx', { kind: 'confetti', at: 'hero:top', n: 110 }), wait(1.6),
  shot({ pos: [0, 4.2, 14.5], look: [0, 3.4, -1], fov: 44, to: { pos: [0, 3.8, 12.8] }, dur: 6 }), cue('vignette', { v: 0.9, ms: 600 }), cue('dip', { v: 0.72, ms: 700, color: '#120d1f' }), wait(0.5),
  cue('logo', { text: 'BEATBOX HEROES', sub: 'BUSK. BATTLE. BECOME CHAMPION.', step: q === 'low' ? 0.12 : 0.13, wait: true }),
  wait(2.4), cue('dip', { v: 1, ms: 900, color: '#120d1f' }), wait(1.0),
] });

export function opening(ctx) {
  const name = String(ctx.name || 'YOU').toUpperCase(), q = ctx.q, card = (text, sub) => ({ style: 'chapter', text, sub });
  return { holdSync: true, dipIn: true, letterbox: 'scope', reels: [
    { world: 'cine', args: { set: 'office', time: 'dusk' }, card: card('ROXORLOOPS & JASMIN', 'present'), cardMs: 2600, reel: office() },
    { world: 'street', args: { time: 'night', from: 'bar', foxy: false }, card: card('THE WALK HOME'), cardMs: 1500, reel: street() },
    { world: 'flat', args: { time: 'night' }, card: card('HOME', 'Rent is due on Sunday.'), cardMs: 1600, reel: flat() },
    { world: 'arena', args: { time: 'night', camera: null, you: name, crowd: q === 'low' ? 18 : 40 }, dipColor: '#fff6e8', dipMs: 1, dipOutMs: 1400, reel: dream(q) },
  ] };
}
