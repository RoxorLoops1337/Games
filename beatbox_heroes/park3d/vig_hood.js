// VIGNETTES: THE HOOD MAP (world 'hood', owner VIG park crew). VIGNETTES.md 2.13 p1.travel.map: GO THERE on the tabletop diorama. A tiny hero token hops from YOU ARE HERE
// to the target pin in three hops, one per beat, the long lens of the table's tilt-shift following it; the pin pops. Then the travel runs and the place's door plays SHORT (r3/vig.js).
// The hood camera keeps its own near plane (a fifth of its table distance, about 12 m), so every shot here stays 15 m back on a long lens: that is the miniature look anyway.
import { THREE } from './kit.js';
import { shot, sfx, drum, word, call, ref, spawn, anim } from './vignette_kit.js';
import { mat } from './vignette_props.js';

const PINS = { park: -4.64, home: -2.4, shop: 0, studio: 2.08, bar: 4.32 }, PZ = 1.55;
// the token: a little pawn in the hero's colours (base, body in the top colour, head in the skin tone, a cap in the hat colour)
function token(look) {
  const g = new THREE.Group(); g.name = 'vig_token'; look = look || {};
  const top = (look.top && look.top.color) || '#ffd23f', skin = look.skin || '#c68b5e', hat = look.hat && look.hat.id && look.hat.id !== 'none' ? look.hat.color || '#17141f' : null;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.08, 12), mat('#17141f')); base.position.y = 0.04; g.add(base);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.17, 0.32, 10), mat(top)); body.position.y = 0.24; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), mat(skin)); head.position.y = 0.5; g.add(head);
  if (hat) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.135, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(hat)); c.position.y = 0.52; g.add(c); }
  const mic = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), mat('#c9ced9')); mic.position.set(-0.14, 0.42, 0.06); g.add(mic);
  g.scale.setScalar(1.6); return g;
}
function travelMap(ctx) {
  const f = ctx.form, tk = ref(), to = (ctx.extra && ctx.extra.to) || (ctx.action && ctx.action.to) || 'park', here = (ctx.world.terrain && ctx.world.terrain.here) || { x: 0.96 };
  const x0 = here.x === undefined ? 0.96 : here.x, x1 = PINS[to] === undefined ? 0 : PINS[to], ev = [], at = (t, e) => ev.push(Object.assign({}, e, { t }));
  const hops = f === 'micro' ? 1 : 3, hop = f === 'micro' ? 0.45 : 0.3, T0 = f === 'micro' ? 0 : 0.25, z = PZ + 0.55;
  at(0, spawn(ctx, tk, () => token(ctx.look), [x0, 0, z]));
  // the hops: a pure function of time (the shot tool and seek see the same frame)
  at(0, anim(ctx, (T) => {
    const o = tk.obj; if (!o) return; const u = Math.max(0, Math.min(hops, (T - T0) / hop)), k = Math.floor(Math.min(u, hops - 1e-6)), p = u - k, xa = x0 + (x1 - x0) * k / hops, xb = x0 + (x1 - x0) * (k + 1) / hops;
    o.position.set(xa + (xb - xa) * p, Math.sin(p * Math.PI) * 0.8 * (u >= hops ? 0 : 1), z); const sq = u < hops ? 1 + 0.18 * Math.sin(p * Math.PI) : 1; o.scale.set(1.6 / Math.sqrt(sq), 1.6 * sq, 1.6 / Math.sqrt(sq)); o.rotation.y = x1 < x0 ? -Math.PI / 2 : Math.PI / 2;
  }));
  if (f !== 'micro') {
    // the long lens on the table edge, following the token across the street
    at(0, shot({ pos: [x0 + 2.2, 11.5, z + 11.5], look: [x0, 0.5, z], fov: 15, to: { pos: [x1 + 2.0, 11.2, z + 11.2], look: [x1, 0.6, z - 0.1] }, dur: T0 + hops * hop + 0.35, ease: 'soft' }));
  }
  for (let i = 0; i < hops; i++) at(T0 + (i + 1) * hop, drum(i === hops - 1 ? 'K' : 'B', { vel: 0.6 }));
  const land = T0 + hops * hop;
  at(land, call(() => ctx.sfx('confirm', { pitch: 1.3 })));
  at(land, { do: 'fx', kind: 'sparks', at: [x1, 1.3, PZ], color: '#ffd35c', n: 26 });
  at(land, { do: 'fx', kind: 'ripple', at: [x1, 0.05, PZ], color: '#ffe14d', n: 1 });
  if (f === 'first') at(land, word(to.toUpperCase(), [0.5, 0.3], { size: 4, color: '#ffe14d', ms: 700 }));
  at(land + 0.05, ctx.PAY); at(land + (f === 'micro' ? 0.2 : 0.4), { do: 'pulse', v: 0 });
  return { events: ev.sort((a, b) => a.t - b.t), letterbox: f === 'first' || f === 'full' };
}
export const VIGNETTES = { 'p1.travel.map': travelMap };
export const WORLD = 'hood';
void sfx;
