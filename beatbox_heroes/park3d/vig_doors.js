// VIGNETTES: DOORS (owner VIG park crew). VIGNETTES.md 2.13 for every world that has a door spot: p1.door.out (leaving a place) and p1.door.in.<place> (a travel lands).
// The park stages its own gate (vig_park.js); every other world gets these generic doors unless its own vig_<world>.js defines the id (r3/vig.js fills only the gaps, the
// world module always wins). Doors are the most frequent scene in the game: FULL 1.2 s, SHORT 0.5 s, and like the intros they never play as MICRO (a repeat goes straight through).
// The door is the world's 'door' (or 'gate') spot; the inside of the room is the side of the start anchor. One beat per place on the way in:
//   home   the keys drop in the bowl by the door (rim click); Foxy, if she is home, says "hey" without looking up
//   shop   the door bell, two notes; the clerk says hi from behind a rail
//   studio the heavy padded door: one soft thud, then nothing (a deliberate quiet)
//   bar    the bass of the room hits on the downbeat as the door opens; Rohzel lifts his chin
import { shot, clip, place, face, look, sfx, drum, word, say, stamp, call } from './vignette_kit.js';

const H = 'hero', D2R = Math.PI / 180;
const at = (t, e) => Object.assign({}, e, { t });
const doorSpot = (ctx) => { const b = ctx.world && ctx.world.spots && ctx.world.spots.byId; return (b && (b.door || b.gate)) || null; };
const startOf = (ctx) => { const s = ctx.A && ctx.A.start; if (s) return s; const p = ctx.world && ctx.world.player; return p ? { x: p.object.position.x, z: p.object.position.z, rot: p.object.rotation.y } : { x: 0, z: 0, rot: 0 }; };
// the unit vector from the room (start anchor) to the door, and the door point
function axis(ctx) {
  const d = doorSpot(ctx), s = startOf(ctx); if (!d) return null;
  let nx = d.x - s.x, nz = d.z - s.z; const l = Math.hypot(nx, nz); if (l < 0.3) { nx = Math.sin(s.rot || 0); nz = Math.cos(s.rot || 0); } else { nx /= l; nz /= l; }
  return { x: d.x, z: d.z, nx, nz, deg: Math.atan2(nx, nz) / D2R };
}
const hY = (ctx) => { const p = ctx.world && ctx.world.player; return p ? p.object.position.y : 0; };
const clock = (ctx) => { const m = ((((ctx.ch ? ctx.ch.minutes : 0) + 360) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const npcOn = (ctx, id) => { const n = (ctx.world.npcs || []).find((x) => x && x.id === id); return !!(n && n.object.visible); };

// OUT: the hero walks into the door ring, the outside light spills in, cut (the world switch follows)
export function DOOR_OUT(ctx) {
  const f = ctx.form, ax = axis(ctx), y = hY(ctx), ev = [];
  if (f === 'micro' || !ax) { ev.push(at(0, clip(H, 'walk', { speed: 1 })), at(0.3, sfx('door', { pitch: 1.1 })), at(0.45, ctx.PAY), at(0.6, { do: 'pulse', v: 0 })); return { events: ev, letterbox: false, hide: false }; }
  const p0 = [ax.x - ax.nx * 0.9, ax.z - ax.nz * 0.9], p1 = [ax.x + ax.nx * 0.15, ax.z + ax.nz * 0.15], night = ctx.night > 0.6, T = f === 'short' ? 0.55 : 1.2;
  ev.push(at(0, place(H, p0, ax.deg, { y })), at(0, { do: 'walk', who: H, to: [p1], speed: 1.4 }));
  // behind the shoulder, the door ahead; the light of the outside comes in as the door opens
  ev.push(at(0, shot({ pos: [ax.x - ax.nx * 4.0 + ax.nz * 1.1, y + 2.0, ax.z - ax.nz * 4.0 - ax.nx * 1.1], look: [ax.x, y + 1.0, ax.z], fov: 50, to: { pos: [ax.x - ax.nx * 3.6 + ax.nz * 1.0, y + 1.95, ax.z - ax.nz * 3.6 - ax.nx * 1.0] }, dur: T })));
  ev.push(at(0.2, sfx('door', { pitch: 1 })), at(0.25, { do: 'cone', id: 'door', at: [ax.x + ax.nx * 0.6, y + 2.6, ax.z + ax.nz * 0.6], to: 'hero', color: night ? '#ffc27a' : '#fff1c9', r: 0.75, v: 0.7, ms: 200 }));
  if (f !== 'short') ev.push(at(0.6, look(H, 'cam')), at(0.85, look(H, null)));
  ev.push(at(T - 0.2, ctx.PAY), at(T - 0.15, { do: 'flash', color: night ? '#ffd9a0' : '#fff6e8', ms: 220 }), at(T, { do: 'pulse', v: 0 }));
  return { events: ev.sort((a, b) => a.t - b.t) };
}
// IN: the reverse, from inside: the door opens towards the lens, the hero steps in onto the start mark, one beat for the place
export function doorIn(ctx, placeId) {
  const f = ctx.form, ax = axis(ctx), s = startOf(ctx), y = hY(ctx), ev = [];
  if (f === 'micro' || !ax) { ev.push(at(0, sfx('door', { pitch: 1.2 })), at(0.1, stamp(clock(ctx) + '|+10 MIN', 600)), at(0.4, ctx.PAY), at(0.7, { do: 'pulse', v: 0 })); return { events: ev, letterbox: false, hide: false }; }
  const T = f === 'short' ? 0.6 : 1.3, mark = [s.x, s.z], from = [ax.x - ax.nx * 0.2, ax.z - ax.nz * 0.2], d = Math.hypot(mark[0] - from[0], mark[1] - from[1]);
  const start = d > 2.2 ? [mark[0] + ax.nx * 2.0, mark[1] + ax.nz * 2.0] : from;
  ev.push(at(0, place(H, start, ax.deg + 180, { y })), at(0, { do: 'walk', who: H, to: [mark], speed: 1.6, face: (s.rot || 0) / D2R, then: 'idle' }));
  ev.push(at(0, shot({ pos: [mark[0] - ax.nx * 2.6 - ax.nz * 1.7, y + 1.85, mark[1] - ax.nz * 2.6 + ax.nx * 1.7], look: [(start[0] + mark[0]) / 2, y + 0.95, (start[1] + mark[1]) / 2], fov: 50, to: { pos: [mark[0] - ax.nx * 2.8 - ax.nz * 1.8, y + 1.82, mark[1] - ax.nz * 2.8 + ax.nx * 1.8] }, dur: T })));
  ev.push(at(0, sfx('door', { pitch: 0.9 })), at(0.05, stamp(clock(ctx) + '|+10 MIN', 900)));
  if (f !== 'short') {
    if (placeId === 'home') { ev.push(at(0.55, clip(H, 'v_reach', { to: [0.32, 0.95, 0.25], hold: 0.1 })), at(0.75, drum('t', { vel: 0.6 })), at(0.75, sfx('click', { pitch: 1.8 })), at(0.75, word('clink', [0.62, 0.55], { size: 2.8, color: '#ffd35c', ms: 500 }))); if (ctx.foxy) ev.push(at(0.9, say('foxy', 'hey', { dur: 0.9 }))); }
    else if (placeId === 'shop') { ev.push(at(0.1, call(() => { ctx.note(88, 0.25, { timbre: 'keys', vel: 0.3 }); setTimeout(() => ctx.note(84, 0.35, { timbre: 'keys', vel: 0.3 }), 160); }))); if (npcOn(ctx, 'clerk')) ev.push(at(0.7, word('hi', 'clerk:head', { size: 3, color: '#2ec4b6', ms: 600 }))); }
    else if (placeId === 'studio') ev.push(at(0.25, drum('K', { vel: 0.5 })), at(0.3, word('thud', [0.5, 0.4], { size: 2.6, color: '#c9c3dd', ms: 500 })));
    else if (placeId === 'bar') { ev.push(at(0.25, drum('B', { vel: 1 })), at(0.25, { do: 'pulse', v: 1 }), at(0.25, { do: 'shake', amp: 0.015, dur: 0.25 })); if (npcOn(ctx, 'rohzel')) ev.push(at(0.5, look('rohzel', 'hero:head')), at(0.6, face('rohzel', H, 400))); }
  }
  ev.push(at(T - 0.2, stamp('')), at(T - 0.2, ctx.PAY), at(T, { do: 'pulse', v: 0 }));
  return { events: ev.sort((a, b) => a.t - b.t) };
}
export const VIGNETTES = {
  'p1.door.out': DOOR_OUT,
  'p1.door.in.home': (c) => doorIn(c, 'home'), 'p1.door.in.shop': (c) => doorIn(c, 'shop'), 'p1.door.in.studio': (c) => doorIn(c, 'studio'), 'p1.door.in.bar': (c) => doorIn(c, 'bar'),
};
export const WORLD = 'doors';
