// CINE REELS (owner CINE): the films of Beatbox Heroes, written for the engine in cine.js. This module is the lazy cutscene chunk (entry.js loadCine), so it re-exports the engine.
//   FILMS[id](ctx) -> { reels: [{ world?, args?, card?, cardMs?, reel: { id, events, cast, end, keep }, setup?(world), blendOut? }], letterbox?, wide?, dipIn?, holdSync? }
//   ctx = { look, name, lines (the Core story lines of the beat), ch (the save), Core, reduce, q, morning (the morning effect), place }
//   A reel with .world loads that world under the dip (the film's chapter card covers the build); a reel without one plays in the world that is up (story beats in their place).
// The opening lives in cine_opening.js. Story beats (core.js STORY): firstJam, sightJam, sightBusk, meet, pigpen, famous (park), firstWin, firstLoss, firstShowcase, champion (bar),
// morning1, collapse (flat). The lines come from core.js (ctx.lines), so 2D (a dialog) and 3D (the film) say the same words; the staging adapts to how many lines there are.
// Adding a film: FILMS.myId = (ctx) => ({ reels: [{ reel: { id: 'myId', events: [...] } }] }), and list the id in r3/cine.js STORY_FILMS when a core.js story beat should trigger it.
export { createCine, createScreen, EASE, COLORS, lineDur } from './cine.js';
import { opening } from './cine_opening.js';

// ------------------------------------------------------------------ helpers (dense reels read like a shooting script)
const shot = (o) => Object.assign({ do: 'shot' }, o);
const narr = (text, o) => Object.assign({ do: 'say', who: null, text }, o);
const wait = (s, o) => Object.assign({ do: 'wait', s }, o);
const cue = (k, o) => Object.assign({ do: k }, o);
// a core.js story line as a say cue (who null = narration), extra options merged in
const line = (L, i, o) => (L && L[i] ? Object.assign({ do: 'say', who: L[i].who || null, text: L[i].text, mood: L[i].mood }, o) : null);
const lines = (L, from, to) => (L || []).slice(from, to).map((l) => ({ do: 'say', who: l.who || null, text: l.text, mood: l.mood }));
const FAMOUS = { name: '???', body: 'neutral', skin: '#8f5632', hair: { style: 'crop', color: '#1a1420' }, eyes: { style: 'sharp', color: '#1c1620' }, glasses: { id: 'shades', color: '#17141f' }, top: { id: 'hoodiebig', color: '#17141f', color2: '#ffd23f' }, bottom: { id: 'techpants', color: '#17141f' }, shoes: { id: 'hightops', color: '#ffd23f' }, hat: { id: 'beanie', color: '#ffd23f' }, acc: { neck: { id: 'chain', color: '#d4a017' } } };
const FRIEND_A = { name: 'Crew', body: 'boy', skin: '#d9a46e', hair: { style: 'fadewave', color: '#1a1420' }, top: { id: 'bomber', color: '#2a9d8f', color2: '#17141f' }, bottom: { id: 'cargo', color: '#34303f' }, shoes: { id: 'retro', color: '#f7f2e8' }, hat: { id: 'fitted', color: '#17141f' } };
const FRIEND_B = { name: 'Crew', body: 'girl', skin: '#f2c4ae', hair: { style: 'bun', color: '#7b3a22' }, top: { id: 'tracktop', color: '#7b4fe0', color2: '#f7f2e8' }, bottom: { id: 'joggers', color: '#17141f' }, shoes: { id: 'sneakers', color: '#f7f2e8' }, hat: { id: 'none' } };

// ================================================================== STORY BEATS (park)
// the cypher in front of the graffiti wall (world_park.js JAM_AT); the ring of spectators opens towards +z (the camera side)
const JAM = { x: 5.5, z: -20 };
const jamStage = (face) => [cue('place', { who: 'hero', at: [JAM.x, JAM.z + 0.2], face: face === undefined ? 0 : face }), cue('look', { who: 'hero', at: null })];
const CREW = { mira: { rest: { clip: 'beatbox', opts: { bpm: 96 } } }, luca: { rest: { clip: 'cheer', opts: { bpm: 96 } } } };
function firstJam(ctx) {
  const L = ctx.lines || [];
  return { reels: [{ reel: { id: 'firstJam', cast: CREW, events: [
    ...jamStage(), cue('clip', { who: 'hero', clip: 'beatbox', opts: { bpm: 96, amp: 0.8 } }), cue('mood', { who: 'hero', mood: 'neutral' }),
    // through the gap in the ring, low, pushing in
    shot({ pos: [JAM.x - 0.6, 0.5, JAM.z + 8.5], look: [JAM.x, 1.25, JAM.z], fov: 34, to: { pos: [JAM.x - 0.3, 0.9, JAM.z + 5.2] }, dur: 7, ease: 'soft' }),
    cue('sfx', { name: 'applause' }), wait(0.8),
    line(L, 0),
    // a slow circle around the hero, the crowd sliding past in front of the lens
    // (high enough to look over the heads of the ring: the spectators are 1.7 m tall)
    shot({ on: 'hero', yaw: -150, rel: false, w: 2.4, h: 2.9, lookH: 1.1, fov: 40, to: { yaw: 150, w: 2.1 }, dur: 9, ease: 'linear', cut: 'xfade', ms: 600 }),
    cue('clip', { who: 'mira', clip: 'cheer' }), cue('clip', { who: 'luca', clip: 'dance', opts: { bpm: 96 } }),
    line(L, 1),
    shot({ on: 'hero', yaw: 0, w: 1.15, h: 1.2, lookH: 1.2, fov: 30, to: { w: 1.0 }, dur: 5 }), cue('mood', { who: 'hero', mood: 'happy' }),
    ...lines(L, 2),
    cue('sfx', { name: 'crowd_cheer' }), cue('fx', { kind: 'sparks', at: 'hero:top', n: 40 }), wait(0.8),
  ].filter(Boolean) } }] };
}
// BeeAmGee watching from the back (beyond the open side of the ring, so the lens inside the ring sees him over nobody's head). Over the hero's shoulder, out of focus;
// a rack focus; a nod; back to the hero; back again: nobody there.
function sighting(ctx, busk) {
  const L = ctx.lines || [], at = busk ? [3.0, -4.6] : [JAM.x + 0.9, JAM.z + 6.4], hero = busk ? [8, -7.4] : [JAM.x, JAM.z + 0.2], n = L.length;
  const mid = lines(L, 1, Math.max(1, n - 1));
  // the long lens on BeeAmGee: off to the side of the hero, above the heads of the ring, so nobody stands between
  const dx = at[0] - hero[0], dz = at[1] - hero[1], dl = Math.hypot(dx, dz), lens = [hero[0] - dz / dl * 1.1 - dx / dl * 0.5, 1.7, hero[1] + dx / dl * 1.1 - dz / dl * 0.5];
  return { reels: [{ reel: { id: busk ? 'sightBusk' : 'sightJam', cast: busk ? {} : CREW, events: [
    cue('spawn', { id: 'bmg', look: 'beeamgee', at, clip: 'idle' }), cue('place', { who: 'hero', at: hero, face: 'bmg' }), cue('face', { who: 'bmg', to: 'hero', ms: 0 }),
    cue('clip', { who: 'hero', clip: 'beatbox', opts: { bpm: 96, amp: 0.6 } }),
    shot({ on: 'hero', yaw: 180, w: 1.3, h: 1.5, lookH: 1.3, shift: -0.45, fov: 52 }), cue('blur', { px: 2.2, ms: 10 }),
    line(L, 0, { dur: 3.4 }),
    // rack focus: the shape at the back sharpens
    shot({ pos: lens, look: 'bmg:head', fov: 20, to: { pos: [lens[0] + dx / dl * 0.5, lens[1], lens[2] + dz / dl * 0.5] }, dur: 6 }), cue('blur', { px: 0, ms: 1100 }), cue('look', { who: 'bmg', at: 'hero:head' }),
    mid[0] || wait(1.2),
    cue('clip', { who: 'hero', clip: 'idle' }), cue('look', { who: 'bmg', at: [hero[0], 0.5, hero[1]] }), wait(0.45), cue('look', { who: 'bmg', at: 'hero:head' }),
    ...mid.slice(1),
    shot({ on: 'hero', yaw: 0, w: 1.1, h: 1.25, lookH: 1.2, fov: 30 }), cue('look', { who: 'hero', at: 'bmg:head' }), wait(1.1),
    cue('despawn', { id: 'bmg' }),
    shot({ pos: [lens[0] + dx / dl * 0.5, lens[1], lens[2] + dz / dl * 0.5], look: [at[0], 1.3, at[1]], fov: 20 }), cue('sfx', { name: 'swoosh', o: { pitch: 0.5 } }), wait(1.3),
    n > 1 ? line(L, n - 1) : null,
  ].filter(Boolean) } }] };
}
// the bench meeting: BeeAmGee sits on his bench (the world NPC, always seated). The hero walks up; shot, reverse shot, the two of them.
function meet(ctx) {
  const L = ctx.lines || [], spot = [-7.75, -3.35], talk = { clip: 'talk' };
  const ev = [
    cue('place', { who: 'hero', at: [-4.2, -1.0], face: -110 }),
    shot({ pos: [-2.6, 1.7, 2.8], look: [-8.4, 1.0, -3.6], fov: 38, to: { pos: [-3.8, 1.5, 1.4] }, dur: 5 }),
    cue('walk', { who: 'hero', to: spot, speed: 1.15, face: 'beeamgee', wait: true }),
    cue('look', { who: 'hero', at: 'beeamgee:head' }), cue('look', { who: 'beeamgee', at: 'hero:head' }),
    shot({ on: 'beeamgee', yaw: 45, w: 1.25, h: 1.1, lookH: 0.95, fov: 32 }),
    line(L, 0, talk),
    shot({ on: 'hero', yaw: -12, w: 1.15, h: 1.2, lookH: 1.2, fov: 32 }), cue('mood', { who: 'hero', mood: 'happy' }), wait(0.9),
    shot({ on: 'beeamgee', yaw: 30, w: 1.05, h: 1.0, lookH: 0.95, fov: 30, to: { w: 0.9 }, dur: 5 }),
    line(L, 1, talk),
    shot({ on: ['hero', 'beeamgee'], yaw: 150, rel: false, w: 3.4, h: 1.5, lookH: 0.95, fov: 38 }),
    line(L, 2, talk),
    shot({ on: 'beeamgee', yaw: 60, w: 1.2, h: 1.05, lookH: 0.95, fov: 32 }),
    ...lines(L, 3).map((e) => (e.who === 'beeamgee' ? Object.assign(e, talk) : e)),
    cue('clip', { who: 'beeamgee', clip: 'sit' }),
  ].filter(Boolean);
  return { reels: [{ reel: { id: 'meet', cast: { beeamgee: { rest: { clip: 'sit' } } }, events: ev } }] };
}
// Pig Pen crashes the cypher: in through the gap of the ring (the south side), face to face with the hero. Cameras stay in the gap or above the heads
function pigpen(ctx) {
  const L = ctx.lines || [], pp = [JAM.x + 0.5, JAM.z + 1.6];
  return { reels: [{ reel: { id: 'pigpen', cast: CREW, events: [
    ...jamStage(), cue('clip', { who: 'hero', clip: 'beatbox', opts: { bpm: 96, amp: 0.7 } }),
    cue('spawn', { id: 'pigpen', look: 'pigpen', at: [JAM.x + 2.6, JAM.z + 6.5], face: -160, clip: 'idle' }),
    shot({ on: 'hero', yaw: 0, w: 2.0, h: 1.4, lookH: 1.15, fov: 36 }),
    line(L, 0, { dur: 3.2, wait: false }), cue('sfx', { name: 'crowd_boo' }),
    cue('walk', { who: 'pigpen', to: [[JAM.x + 1.2, JAM.z + 3.6], pp], speed: 1.6, face: 'hero', then: 'battle' }), cue('mood', { who: 'pigpen', mood: 'angry' }),
    shot({ on: 'pigpen', yaw: 20, w: 1.8, h: 0.6, lookH: 1.3, fov: 38, cut: 'whip', to: { yaw: 5, w: 1.5 }, dur: 3 }),
    cue('clip', { who: 'hero', clip: 'idle' }), cue('face', { who: 'hero', to: 'pigpen', ms: 500 }), wait(2.4),
    cue('look', { who: 'pigpen', at: 'hero:head' }), cue('look', { who: 'hero', at: 'pigpen:head' }),
    shot({ on: 'pigpen', yaw: 35, w: 1.1, h: 1.6, lookH: 1.25, fov: 44, hand: 0.006 }), cue('clip', { who: 'pigpen', clip: 'point' }),
    line(L, 1), line(L, 2),
    shot({ on: 'hero', yaw: -30, w: 1.1, h: 1.35, lookH: 1.2, fov: 44 }), cue('mood', { who: 'hero', mood: 'angry' }), wait(1.0),
    shot({ on: ['hero', 'pigpen'], yaw: 32, rel: false, w: 3.0, h: 2.8, lookH: 1.0, fov: 40 }), cue('clip', { who: 'pigpen', clip: 'talk' }),
    ...lines(L, 3),
    cue('walk', { who: 'pigpen', to: [[JAM.x + 1.2, JAM.z + 4.2], [JAM.x + 5, JAM.z + 9]], speed: 1.5 }), cue('look', { who: 'pigpen', at: null }),
    shot({ on: 'hero', yaw: 0, w: 2.2, h: 1.5, lookH: 1.1, fov: 38 }), wait(2.2),
  ].filter(Boolean) } }] };
}
// a famous beatboxer drops in: the circle goes quiet, slow motion, a flurry nobody can answer. Everyone faces the gap of the ring (south), so the lens stays there
function famous(ctx) {
  const L = ctx.lines || [], c = [JAM.x + 0.3, JAM.z - 0.3];
  return { reels: [{ reel: { id: 'famous', cast: CREW, events: [
    cue('place', { who: 'hero', at: [JAM.x - 1.2, JAM.z + 0.6], face: 0 }), cue('clip', { who: 'hero', clip: 'beatbox', opts: { bpm: 96, amp: 0.7 } }),
    cue('spawn', { id: 'famous', look: FAMOUS, at: [JAM.x + 0.8, JAM.z + 5.0], face: 180, clip: 'idle' }),
    cue('spawn', { id: 'crewA', look: FRIEND_A, at: [JAM.x + 2.6, JAM.z + 3.9], face: -150, clip: 'idle' }), cue('spawn', { id: 'crewB', look: FRIEND_B, at: [JAM.x + 3.3, JAM.z + 3.2], face: -140, clip: 'idle' }),
    shot({ on: 'hero', yaw: 0, w: 1.6, h: 1.3, lookH: 1.15, fov: 34 }),
    line(L, 0, { dur: 2.6 }), cue('clip', { who: 'hero', clip: 'idle' }), cue('music', { id: null, fade: 0.6 }),
    // he walks in, slowed down, seen from the ground over the hero's shoulder
    shot({ pos: [JAM.x - 0.3, 0.55, JAM.z - 1.4], look: 'famous:head', fov: 38 }), cue('speed', { v: 0.4, ms: 300 }), cue('look', { who: 'hero', at: 'famous:head' }),
    cue('walk', { who: 'famous', to: c, speed: 1.2, face: 0, then: 'idle' }),
    line(L, 1),
    cue('speed', { v: 1, ms: 300 }),
    shot({ on: 'famous', yaw: -35, w: 1.5, h: 1.0, lookH: 1.2, fov: 34, to: { yaw: 15, w: 1.3 }, dur: 6, cut: 'whip' }),
    cue('beat', { who: 'famous', pattern: 'B t K t B B K t Pf t K t B K Pf K B t t K t B Pf K B B K t Pf K K Pf', bpm: 112, step: 0.25, words: true, rings: true, wait: true }),
    cue('beat', { who: 'famous', pattern: 'B t K t B t Pf t B B K t Pf K B .', bpm: 120, step: 0.25, words: true, rings: true }), cue('shake', { amp: 0.04, dur: 1.2 }),
    line(L, 2),
    cue('clip', { who: 'famous', clip: 'idle' }), cue('sfx', { name: 'crowd_cheer' }),
    cue('walk', { who: 'famous', to: [[JAM.x + 1.2, JAM.z + 4.5], [JAM.x + 4, JAM.z + 10]], speed: 1.3 }), cue('walk', { who: 'crewA', to: [JAM.x + 5, JAM.z + 10], speed: 1.3 }), cue('walk', { who: 'crewB', to: [JAM.x + 5.8, JAM.z + 9.4], speed: 1.3 }),
    shot({ on: 'hero', yaw: -20, w: 1.1, h: 1.2, lookH: 1.2, fov: 32 }),
    line(L, 3), cue('look', { who: 'hero', at: null }), cue('mood', { who: 'hero', mood: 'neutral' }),
    shot({ pos: [JAM.x - 1, 6, JAM.z + 9], look: [JAM.x, 0.8, JAM.z], fov: 40, to: { pos: [JAM.x - 1, 8, JAM.z + 12] }, dur: 5 }),
    ...lines(L, 4), cue('music', { id: 'park', fade: 1.2 }),
  ].filter(Boolean) } }] };
}

// ================================================================== STORY BEATS (bar)
// the stage in the north-east of the bar (bar_stage.js), Rohzel behind her counter on the west side
const STAGE = { x: 3.5, z: -2.4 }, ROH = 'rohzel';
function barReel(id, ctx, mode) {
  const L = ctx.lines || [], win = mode !== 'loss', champ = mode === 'champ';
  const ev = [
    cue('place', { who: 'hero', at: [STAGE.x, STAGE.z], face: 0 }), cue('cone', { id: 'stage', at: [STAGE.x, 4.2, STAGE.z - 0.3], to: 'hero', color: win ? '#fff1c9' : '#9fb4ff', r: 1.1, v: win ? 1 : 0.6, ms: 400 }),
    cue('clip', { who: 'hero', clip: win ? (champ ? 'finisher' : 'cheer') : 'sad', opts: { bpm: 110 } }), cue('mood', { who: 'hero', mood: win ? 'happy' : 'sad' }),
    shot({ on: 'hero', yaw: 0, w: 2.8, h: 0.7, lookH: 1.3, fov: 44, to: { w: 2.2, h: 0.9 }, dur: 6, ease: 'soft' }),
    cue('sfx', { name: win ? 'crowd_cheer' : 'applause' }), win ? cue('fx', { kind: 'confetti', at: 'hero:top', n: champ ? 120 : 70 }) : null,
    champ ? cue('title', { style: 'card', text: 'WORLD CUP CHAMPION', sub: String(ctx.name || '').toUpperCase(), ms: 4200 }) : null,
    line(L, 0, { dur: champ ? 3.2 : 2.8 }),
    shot({ on: ROH, yaw: -40, w: 1.3, h: 1.9, lookH: 1.3, fov: 44 }), cue('look', { who: ROH, at: 'hero:head' }), cue('clip', { who: ROH, clip: 'talk' }),
  ];
  const ls = L.slice(1);
  ls.forEach((l, i) => {
    if (l.who === 'penny') ev.push(cue('spawn', { id: 'penny', look: 'penny', at: [STAGE.x + 1.2, STAGE.z + 0.2], face: -70, clip: 'idle' }), shot({ on: 'penny', yaw: 35, w: 1.3, h: 2.3, lookH: 1.3, fov: 44 }), cue('look', { who: 'penny', at: 'hero:head' }));
    else if (l.who === ROH && i > 0 && ls[i - 1].who !== ROH) ev.push(shot({ on: ROH, yaw: -55, w: 1.5, h: 2.0, lookH: 1.3, fov: 44 }), cue('clip', { who: ROH, clip: 'talk' }));
    else if (!l.who && i > 0) ev.push(shot({ on: 'hero', yaw: -15, w: 1.2, h: 1.2, lookH: 1.2, fov: 40 }));
    ev.push({ do: 'say', who: l.who || null, text: l.text, mood: l.mood });
  });
  ev.push(cue('clip', { who: ROH, clip: 'idle' }), shot({ on: 'hero', yaw: 20, w: 1.8, h: 1.3, lookH: 1.15, fov: 42 }), win ? cue('fx', { kind: 'sparks', at: 'hero:top', n: 30 }) : null, wait(0.9), cue('cone', { id: 'stage', v: 0, ms: 600 }));
  return { reels: [{ reel: { id, events: ev.filter(Boolean), cast: { rohzel: { rest: { clip: 'idle' } } } } }] };
}

// ================================================================== MORNINGS (flat)
const BED = [-5.85, 3.1];
function morning1(ctx) {
  const m = ctx.morning || {}, d = String(m.name || 'Wednesday').slice(0, 3).toUpperCase();
  return { holdSync: true, reels: [{ reel: { id: 'morning1', events: [
    cue('light', { time: 0.15, instant: true }),
    cue('place', { who: 'hero', at: BED, face: 90 }), cue('clip', { who: 'hero', clip: 'sit', opts: { seat: 0.5, drowsy: 1, slump: 1.2 } }), cue('mood', { who: 'hero', mood: 'neutral' }),
    shot({ on: 'hero', yaw: 30, w: 2.2, h: 1.7, lookH: 0.95, fov: 44, to: { yaw: 10, w: 1.7 }, dur: 6, ease: 'soft' }), cue('stamp', { text: d + ' 07:00|REC' }),
    wait(1.6), cue('clip', { who: 'hero', clip: 'cheer' }), cue('mood', { who: 'hero', mood: 'happy' }), cue('sfx', { name: 'confirm', o: { pitch: 0.8 } }),
    narr('Day two. Same flat, same rent. Different you.', { dur: 3.0 }),
    wait(0.3),
  ] } }] };
}
function collapse() {
  return { holdSync: true, reels: [{ reel: { id: 'collapse', events: [
    cue('light', { time: 1, instant: true }), cue('music', { id: null, fade: 0.3 }),
    cue('place', { who: 'hero', at: [4.2, 3.4], face: -140 }), cue('clip', { who: 'hero', clip: 'sit', opts: { seat: 0.05, drowsy: 1, slump: 1.6 } }), cue('mood', { who: 'hero', mood: 'sad' }),
    shot({ on: 'hero', yaw: 20, w: 2.2, h: 2.4, lookH: 0.5, fov: 44, roll: -8, to: { w: 1.8, roll: -12 }, dur: 6 }), cue('stamp', { text: '02:00|REC' }), cue('vignette', { v: 1, ms: 300 }), cue('blur', { px: 2.4, ms: 1500 }),
    cue('sfx', { name: 'heart' }), wait(1.0), cue('sfx', { name: 'heart' }),
    narr('You collapsed at 2 am on the floor. Foxy dragged you to bed.', { dur: 3.6 }),
    cue('dip', { v: 1, ms: 700, color: '#07040e' }), wait(0.8), cue('blur', { px: 0, ms: 10 }), cue('vignette', { v: 0, ms: 10 }), cue('stamp', { text: '' }),
    cue('light', { time: 0.15, instant: true }), cue('place', { who: 'hero', at: BED, face: 90 }), cue('clip', { who: 'hero', clip: 'sit', opts: { seat: 0.5, drowsy: 1, slump: 1.3 } }),
    shot({ on: 'hero', yaw: 25, w: 2.0, h: 1.5, lookH: 0.95, fov: 44 }), cue('dip', { v: 0, ms: 900 }), wait(1.6),
  ] } }] };
}

export const FILMS = {
  opening,
  firstJam, sightJam: (c) => sighting(c, false), sightBusk: (c) => sighting(c, true), meet, pigpen, famous,
  firstWin: (c) => barReel('firstWin', c, 'win'), firstLoss: (c) => barReel('firstLoss', c, 'loss'), firstShowcase: (c) => barReel('firstShowcase', c, 'win'), champion: (c) => barReel('champion', c, 'champ'),
  morning1, collapse,
};
export const FILM_IDS = Object.keys(FILMS);
