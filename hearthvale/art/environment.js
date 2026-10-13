// Hearthvale ENVIRONMENT kit: trees, rocks, clay, stump, the four valley fields, the notice board, the plaza, village plots,
// the floating island with its sea, and scatter helpers. All procedural, no image files.
//
// RESEARCH NOTES (10 bullets: what I learned, and how each one is used below)
//  1. Stylized tree packs build canopies from a few fat overlapping solid blobs, not alpha cards: cards cost heavy overdraw on
//     mobile and a flat card has no rounded light profile (ArtStation "Trees and Canopies"). -> every canopy is 3 to 8 lumpy blobs.
//  2. The same packs use a vertex-colour gradient channel as a wind mask. -> uv.x of every baked vertex is a sway weight (0 trunk,
//     rising toward the leaf tips) and one shared shader displaces it; no game code needed (it self-ticks via onBeforeRender).
//  3. Soft "balloon" shading comes from normals, not from geometry: radial normals tilted toward +Y make a low-poly blob read as a
//     lit, fluffy leaf mass. -> `lump()` writes its own normals (radial blended 25% up); rocks keep flat facet normals instead.
//  4. Painterly colour is a 3-stop vertex ramp (cool dark underside -> true colour -> warm light top) plus a tiny per-face value
//     jitter, which is also the cheapest "baked AO". -> `tone()` + `facet` + a world-height AO falloff near the ground.
//  5. Floating-island kits use a wide flat grass top, a thin dark topsoil lip, then layered strata bands of earth and stone that
//     taper inward below (two materials: grass top / rock). -> islandModel: noisy outline, 6 hard-edged strata rings, boulders.
//  6. Stylized water = shallow-to-deep colour bands from distance-to-shore, a bright shoreline glow and noise-driven foam at the
//     bank. Real depth-buffer shaders are overkill here. -> vertex bands that follow the island outline + a scrolling sine foam.
//  7. Cozy rocks: chunky low subdivision, flat shaded, mossy on up-facing normals, with a few pale crystal bipyramids as accents.
//  8. Grass is clumps of a few spiky prongs (3-sided open cones, 3 tris each) instanced by the hundred; flowers come in patches of
//     5 to 7 heads, never single dots.
//  9. Soft contact shadows: a 3-ring disc with per-vertex ALPHA (centre 30%, rim 0%) fakes AO for ~30 tris and never z-fights.
// 10. Cozy diorama readability: warm light / cool shadow hue shift, calm big shapes, and detail clusters at entrances (gates, path
//     starts, wells) with the owner colour used as a trim accent, not a flood fill.
//
// ROUND 3 ("Happy Light" richer ground, a sense of place, a living horizon):
//  11. The ground is painted in the fragment shader instead of with geometry: one shared envMat reads a per-vertex flag (aG: 1 plot lawn, 2 world ground, 3 field mottle),
//      a tileable 128px detail noise (grass tones, grain, blade streaks) and a 1024px world mask (R dirt, G cobble, B wet bank, A petal litter). Paths, banks, wildflower
//      drifts, clover mats, petals, grass blade strokes, the cobble pattern and the plot checker therefore cost no triangles. setGroundQuality() / the game's tier lowers it.
//  12. One layout (layout(): gates, ring road, field stubs, ponds, brooks, keep-clear circles) feeds the mask, the furniture and the scatter, so nothing disagrees.
//  13. heightAt is dead flat (0) inside the village ring (plots, plaza, fields, roads); rolling hills, dips and a few set-piece hills live in the four outer lobes and the rim.
//  14. Horizon: ten tiny islets, a lighthouse, a windmill (its sails turn by themselves), a rope bridge between two sea stacks, a sandbar, buoys and `sail` boats that drift.
//      Anything that must move without game code uses selfMotion(): the world matrix is rewritten in onBeforeRender.
//  15. Trees: vertex mottle and leaf cards on the canopy, bark bands, root flares, a few autumn crowns (treeModel season, instance tint in the forest).
//
// Notes for integrators:
//  - Every builder returns a THREE.Group with origin on the ground. Geometry is baked once per key and SHARED between calls
//    (do not dispose it). Everything static is already one mesh per material (what mergeStatic would give).
//  - All matte props share ONE material (`envMat`) with a built-in wind shader; sway needs no per-frame code.
//  - Lanterns use the exported `lanternMat`: drive its emissiveIntensity at night (or copy the buildings.js one into it).
import * as THREE from 'three';
import { slotOrigin as simSlot } from '../shared/sim.js';
import { rng as krng, roundedBoxGeo } from './artkit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { P } from './palette.js';

// ------------------------------------------------------------------ small math
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const hash = (x, y = 0) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const vn = (x, y) => { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); return lerp(lerp(hash(ix, iy), hash(ix + 1, iy), u), lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), u), v); };
const fbm = (x, y) => vn(x, y) * 0.6 + vn(x * 2.1 + 5, y * 2.1 + 3) * 0.28 + vn(x * 4.3 + 9, y * 4.3 + 1) * 0.12;
const _colC = new Map();
/** parsed colours are cached and SHARED: never mutate the result (clone first) */
const col = (c) => { if (c && c.isColor) return c; let k = _colC.get(c); if (!k) { k = new THREE.Color(c); _colC.set(c, k); } return k; };
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ colour ramp (cool dark -> base -> warm light)
const _dk = new THREE.Color(), _t = new THREE.Color();
const MOT_L = new THREE.Color('#e2ff86'), LIGHT = new THREE.Color('#f6ffc0'), COOL = [0.8, 0.88, 1.0];   // HAPPY LIGHT: shadows are only a gentle lavender-teal, tops are minty butter
function tone(base, t, grad, out) {
  out.copy(base); if (grad <= 0) return out;
  if (t < 0.5) { const k = (0.5 - t) * 2 * grad; out.r *= 1 - (1 - COOL[0]) * k; out.g *= 1 - (1 - COOL[1]) * k; out.b *= 1 - (1 - COOL[2]) * k; }
  else { const k = (t - 0.5) * 2 * grad; out.lerp(LIGHT, 0.3 * k); out.multiplyScalar(1 + 0.06 * k); }
  return out;
}

// ------------------------------------------------------------------ materials
const WIND = { value: 0 };
let _tw = -1e9, _gqLock = false;
/** ground detail level 0 (flat tones and paths), 1 (+ grain and mottle) or 2 (+ flowers, clover, petals, blades), or 'auto' (default: follows the game's quality tier by itself) */
export function setGroundQuality(q) { if (q === 'auto') { _gqLock = false; _tw = -1e9; } else { GU.uGq.value = q; _gqLock = true; } }
const windTick = () => { const now = performance.now(); WIND.value = now * 0.001; if (!_gqLock && now - _tw > 1000) { _tw = now; try { const c = typeof document !== 'undefined' && document.querySelector('canvas[data-tier]'); if (c) GU.uGq.value = { low: 0, medium: 1, high: 2 }[c.dataset.tier] ?? 2; } catch { /* no DOM */ } } };
const glv = (hex) => { const c = new THREE.Color(hex); return `vec3( ${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)} )`; };
/** periodic (tileable) value noise: u,v in 0..1 repeat every px,py lattice cells */
function pvn(u, v, px, py, seed) {
  const x = u * px, y = v * py, ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const h = (a, b) => { let n = Math.imul((((a % px) + px) % px) + 1, 374761393) ^ Math.imul((((b % py) + py) % py) + 1, 668265263) ^ Math.imul(seed + 1, 1274126177); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  return lerp(lerp(h(ix, iy), h(ix + 1, iy), sx), lerp(h(ix, iy + 1), h(ix + 1, iy + 1), sx), sy);
}
/** 128 x 128 tileable detail noise: R/G macro fields, B fine grain, A vertical blade streaks. Uint8 data, no DOM needed. */
function makeDetail() {
  const N = 128, d = new Uint8Array(N * N * 4), st = (v) => clamp((v - 0.5) * 2.1 + 0.5);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const u = i / N, v = j / N, k = (j * N + i) * 4;
    d[k] = 255 * st(pvn(u, v, 4, 4, 1) * 0.55 + pvn(u, v, 8, 8, 2) * 0.3 + pvn(u, v, 16, 16, 3) * 0.15);
    d[k + 1] = 255 * st(pvn(u, v, 5, 5, 4) * 0.55 + pvn(u, v, 10, 10, 5) * 0.3 + pvn(u, v, 20, 20, 6) * 0.15);
    d[k + 2] = 255 * st(pvn(u, v, 12, 12, 7) * 0.5 + pvn(u, v, 24, 24, 8) * 0.3 + pvn(u, v, 48, 48, 9) * 0.2);
    d[k + 3] = 255 * st(pvn(u, v, 48, 6, 10) * 0.6 + pvn(u, v, 96, 12, 11) * 0.4);
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true; return t;
}
const GU = { uGq: { value: 2 }, uDet: { value: makeDetail() }, uMask: { value: (() => { const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat); t.needsUpdate = true; return t; })() } };
const GROUND_FRAG = `
if ( vGk > 0.5 && uGq > -0.5 ) {
  bool world = vGk > 1.5 && vGk < 2.5; vec2 q = world ? vWP.xz : vLP; float dcam = length( vWP - cameraPosition );
  float fd = 1.0 - smoothstep( 40.0, 105.0, dcam );
  vec4 t1 = vec4( 0.5 ); vec4 t2 = vec4( 0.5 ); vec4 t3 = vec4( 0.5 );
  if ( uGq > 0.5 ) { t2 = texture2D( uDet, q * 0.173 + vec2( 0.31, 0.77 ) ); t3 = texture2D( uDet, q * 0.043 + vec2( 0.63, 0.12 ) ); if ( uGq > 1.5 ) t1 = texture2D( uDet, q * 0.71 ); }
  vec3 c = diffuseColor.rgb;
  if ( uGq > 0.5 ) {
    if ( world ) { c = mix( c, ${glv('#d4f56e')}, 0.5 * smoothstep( 0.4, 0.85, t3.r ) ); c = mix( c, ${glv('#3fc982')}, 0.3 * smoothstep( 0.5, 0.05, t3.g ) ); c = mix( c, ${glv('#6fe3a2')}, 0.3 * smoothstep( 0.45, 0.95, t2.g ) * smoothstep( 0.6, 0.3, t3.r ) ); }
    c *= 0.92 + 0.16 * t2.b; c *= 0.95 + 0.1 * t1.b;
    c = mix( c, c * 1.16 + vec3( 0.012, 0.03, 0.0 ), 0.7 * fd * smoothstep( 0.64, 0.95, t1.a ) ); c *= 1.0 - 0.09 * fd * smoothstep( 0.34, 0.04, t1.a );
  }
  float fd2 = 1.0 - smoothstep( 22.0, 62.0, dcam );
  if ( fd2 > 0.01 && uGq > 1.5 ) { vec2 tc = q / 0.3; vec2 ti = floor( tc ); vec2 tf = fract( tc ) - 0.5; vec2 off = ( vec2( hv_h( ti + 3.0 ), hv_h( ti + 8.0 ) ) - 0.5 ) * 0.3; float on = step( hv_h( ti + 12.0 ), 0.62 ); if ( on > 0.5 ) { float tu = hv_tuft( tf - off ) * fd2, ts = world ? 0.6 : 0.95; float sh = hv_tuft( tf - off - vec2( 0.035, 0.03 ) ) * fd2 * ( 1.0 - tu ); c = mix( c, c * vec3( 0.8, 0.92, 0.78 ), sh * ts * 0.5 ); c = mix( c, c * vec3( 1.16, 1.24, 0.9 ) + vec3( 0.015, 0.04, 0.0 ), tu * ts ); } }
  if ( world ) {
    vec4 mk = texture2D( uMask, ( vWP.xz + 80.0 ) / 160.0 ); float nz = ( t1.r - 0.5 ) * 0.34 + ( t2.g - 0.5 ) * 0.3;
    float dirt = smoothstep( 0.45, 0.55, mk.r + nz ), cob = smoothstep( 0.48, 0.56, mk.g + nz * 0.5 ), wet = smoothstep( 0.12, 0.62, mk.b + nz * 0.5 ), pet = mk.a;
    if ( wet > 0.001 ) c = mix( c, c * ${glv('#c9b48a')} * 1.35, wet * 0.55 );
    c *= 1.0 - 0.07 * pet;
    float clear = max( dirt, cob );
    if ( clear < 0.98 && fd > 0.01 && uGq > 1.5 ) {
      // wildflower drifts: cell dots whose colour follows a slow swath field
      float dens = smoothstep( 0.5, 0.74, t3.g + ( t2.b - 0.5 ) * 0.25 ) * 0.92;
      if ( dens > 0.02 ) { vec2 fc = q / 0.36; vec2 fi = floor( fc ); vec2 ff = fract( fc ) - 0.5; vec2 off = ( vec2( hv_h( fi ), hv_h( fi + 17.3 ) ) - 0.5 ) * 0.5; float rr = length( ff - off ); float on = step( hv_h( fi + 4.1 ), dens );
        float band = floor( t3.r * 4.99 ); vec3 fcol = band < 0.5 ? ${glv('#ff9ec4')} : band < 1.5 ? ${glv('#ffffff')} : band < 2.5 ? ${glv('#ffe066')} : band < 3.5 ? ${glv('#c3b0ff')} : ${glv('#ffab8a')};
        float pe = smoothstep( 0.19, 0.12, rr ) * on * fd * ( 1.0 - clear ) * ( 1.0 - wet ); c = mix( c, fcol, pe ); c = mix( c, ${glv('#ffd23a')}, smoothstep( 0.065, 0.03, rr ) * on * fd * ( 1.0 - clear ) ); }
      // clover patches: lighter three-dot leaves on a darker mat
      if ( t2.g > 0.64 ) { float cl = smoothstep( 0.64, 0.86, t2.g ) * ( 1.0 - clear ); vec2 cc = q / 0.21; vec2 ci = floor( cc ); vec2 cf = fract( cc ) - 0.5; float ch = hv_h( ci + 9.0 );
        c = mix( c, c * vec3( 0.86, 0.98, 0.84 ), cl * 0.5 ); c = mix( c, ${glv('#a6f37a')}, cl * fd * step( ch, 0.5 ) * smoothstep( 0.16, 0.08, length( cf ) ) * 0.8 ); }
      // fallen petals under the blossom trees
      if ( pet > 0.02 ) { vec2 pc = q / 0.2; vec2 pi = floor( pc ); vec2 pf = fract( pc ) - 0.5; float ph = hv_h( pi + 33.0 ); c = mix( c, ph < 0.5 ? ${glv('#ffc2d9')} : ${glv('#fff0f6')}, step( ph * 1.9, pet ) * smoothstep( 0.2, 0.09, length( pf ) ) * fd * ( 1.0 - clear ) ); }
    }
    // worn dirt
    if ( dirt > 0.002 ) { vec3 dc = mix( ${glv('#eccf98')}, ${glv('#dcb77c')}, smoothstep( 0.3, 0.7, t2.r ) ); dc *= 0.95 + 0.1 * t1.b; dc = mix( dc, dc * 0.8, smoothstep( 0.8, 0.5, mk.r + nz ) * 0.55 );
      if ( fd > 0.01 && uGq > 1.5 ) { vec2 pc2 = q / 0.17; vec2 pi2 = floor( pc2 ); float h2 = hv_h( pi2 + 71.0 ); dc = mix( dc, ${glv('#fff3d6')}, step( 0.92, h2 ) * smoothstep( 0.17, 0.08, length( fract( pc2 ) - 0.5 ) ) * fd ); }
      c = mix( c, dc, dirt ); }
    // cobbles: offset rows, a grout line and a lit top edge per stone
    if ( cob > 0.002 ) { if ( uGq > 0.5 ) { vec2 cp = q * 2.6; float row = floor( cp.y ); cp.x += row * 0.5 + hv_h( vec2( row, 3.0 ) ) * 0.3; vec2 cf = fract( cp ); vec2 id = vec2( floor( cp.x ), row );
      float hh = hv_h( id ); vec3 sc = hh < 0.3 ? ${glv('#fbe7b4')} : hh < 0.6 ? ${glv('#f3d9a0')} : hh < 0.85 ? ${glv('#fff3d4')} : ${glv('#f6dcd2')};
      float ex = min( min( cf.x, 1.0 - cf.x ) * 1.15, min( cf.y, 1.0 - cf.y ) ); float stone = smoothstep( 0.04, 0.17, ex ); sc *= 0.9 + 0.1 * stone + 0.06 * hh; sc = mix( ${glv('#cdb27a')}, sc, mix( 1.0, stone, fd ) );
      c = mix( c, sc, cob ); } else c = mix( c, ${glv('#f6dfa8')}, cob ); }
  } else if ( vGk < 1.5 ) {   // plot lawn: subtle checker, soft seams, darker toward the curb, a few daisy freckles
    vec2 tp = vLP + 8.0; vec2 ti = floor( tp ); float chk = mod( ti.x + ti.y, 2.0 ); c *= mix( 0.935, 1.045, chk ); vec2 tf = fract( tp ); float seam = min( min( tf.x, 1.0 - tf.x ), min( tf.y, 1.0 - tf.y ) ); c *= 0.965 + 0.035 * smoothstep( 0.0, 0.07, seam );
    float ed = 8.0 - max( abs( vLP.x ), abs( vLP.y ) ); c *= 0.9 + 0.1 * smoothstep( 0.0, 1.8, ed ); c = mix( c, ${glv('#c8f58a')}, 0.5 * smoothstep( 0.55, 0.9, t3.r ) * smoothstep( 0.2, 1.0, ed ) ); c = mix( c, c * vec3( 0.86, 0.97, 0.84 ), 0.5 * smoothstep( 0.5, 0.1, t3.g ) );
    if ( fd > 0.01 && uGq > 1.5 ) { vec2 fc = vLP / 0.45; vec2 fi = floor( fc ); vec2 ff = fract( fc ) - 0.5; vec2 off = ( vec2( hv_h( fi + 3.0 ), hv_h( fi + 8.0 ) ) - 0.5 ) * 0.4; float on = step( hv_h( fi + 5.5 ), 0.08 + 0.14 * smoothstep( 0.55, 0.85, t3.g ) );
      c = mix( c, hv_h( fi ) < 0.5 ? ${glv('#ffffff')} : ${glv('#ffe9a0')}, on * fd * smoothstep( 0.1, 0.06, length( ff - off ) ) ); }
  }
  diffuseColor.rgb = c;
}`;
function windify(m, ground = false) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWindT = WIND;
    if (ground) { sh.uniforms.uDet = GU.uDet; sh.uniforms.uMask = GU.uMask; sh.uniforms.uGq = GU.uGq; }
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWindT;' + (ground ? ' attribute float aG; varying float vGk; varying vec3 vWP; varying vec2 vLP;' : '')).replace('#include <begin_vertex>',
      `vec3 transformed = vec3( position );
       float wW = uv.x; if ( wW < 0.0 ) { wW = -wW; transformed.z += ( sin( uWindT * 5.0 + position.x * 5.5 + uv.y ) * 0.11 + sin( uWindT * 8.0 + position.x * 9.0 ) * 0.03 ) * wW; transformed.y += sin( uWindT * 5.0 + position.x * 5.5 + uv.y + 1.2 ) * 0.02 * wW; } else if ( wW > 0.0 ) { float ph = uv.y;
         transformed.x += ( sin( uWindT * 1.7 + ph + position.x * 0.5 + position.z * 0.35 ) + 0.35 * sin( uWindT * 3.3 + ph * 2.0 ) ) * 0.05 * wW;
         transformed.z += cos( uWindT * 1.45 + ph * 1.3 + position.z * 0.45 ) * 0.032 * wW; }` + (ground ? `
       vGk = aG; vLP = position.xz; vec4 hvW = vec4( transformed, 1.0 );
       vWP = ( modelMatrix * hvW ).xyz;` : ''));
    if (ground) sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uGq; uniform sampler2D uDet; uniform sampler2D uMask; varying float vGk; varying vec3 vWP; varying vec2 vLP; float hv_h( vec2 p ) { vec3 q = fract( vec3( p.xyx ) * 0.1031 ); q += dot( q, q.yzx + 33.33 ); return fract( ( q.x + q.y ) * q.z ); }\nfloat hv_tuft( vec2 p ) { float cov = 0.0; for ( int i = 0; i < 3; i++ ) { float fi = float( i ) - 1.0; float h = 0.34 + 0.1 * ( 1.0 - abs( fi ) ); float y = ( p.y + 0.3 ) / h; float w = 0.075 * ( 1.0 - y ) + 0.01; cov = max( cov, step( 0.0, y ) * step( y, 1.0 ) * smoothstep( w, w * 0.4, abs( p.x - fi * 0.13 - fi * y * 0.06 ) ) ); } return cov; }').replace('#include <color_fragment>', '#include <color_fragment>\n' + GROUND_FRAG);
  };
  if (ground) m.defaultAttributeValues = { aG: [0] };
  m.customProgramCacheKey = () => (ground ? 'hv-ground' : 'hv-wind3');
  return m;
}
export const envMat = windify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 }));
/** the same matte look plus the painted ground (island top, plot lawns, field floors): only meshes that carry the aG attribute use it */
const groundMat = windify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 }), true);
const glossMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.05 });
const waterMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.9 });
// ponds, brooks, basins: drifting sun sparkles and slow lighter swells in world space (no textures)
waterMat.onBeforeCompile = (sh) => {
  sh.uniforms.uWindT = WIND; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWt;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWt = ( modelMatrix * vec4( position, 1.0 ) ).xz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vWt; uniform float uWindT;').replace('#include <color_fragment>', `#include <color_fragment>
  float wa = sin( vWt.x * 2.3 + uWindT * 1.3 + sin( vWt.y * 1.7 ) * 1.8 ) * sin( vWt.y * 2.1 - uWindT * 1.1 + sin( vWt.x * 1.3 ) * 1.6 ); diffuseColor.rgb += vec3( 0.5, 0.62, 0.58 ) * smoothstep( 0.8, 1.0, wa ) * 0.6;
  diffuseColor.rgb += vec3( 0.05, 0.08, 0.07 ) * smoothstep( 0.2, 0.9, sin( vWt.x * 0.7 - uWindT * 0.5 ) * sin( vWt.y * 0.8 + uWindT * 0.4 ) );`);
};
waterMat.customProgramCacheKey = () => 'hv-water';
export const lanternMat = new THREE.MeshStandardMaterial({ color: '#ffe08a', emissive: '#ffb830', emissiveIntensity: 0.5, roughness: 0.6 });
const shadowMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
const MATS = { matte: envMat, gloss: glossMat, water: waterMat, lantern: lanternMat, shadow: shadowMat };

/** blend a non-indexed geometry's flat normals toward position-averaged smooth normals (k = 0 flat .. 1 smooth) */
function softenNormals(g, k) {
  const p = g.attributes.position, n = g.attributes.normal, acc = new Map(), key = (i) => `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
  for (let i = 0; i < p.count; i++) { const kk = key(i); let a = acc.get(kk); if (!a) { a = [0, 0, 0]; acc.set(kk, a); } a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i); }
  for (let i = 0; i < p.count; i++) { const a = acc.get(key(i)), l = Math.hypot(a[0], a[1], a[2]) || 1, x = n.getX(i) * (1 - k) + a[0] / l * k, y = n.getY(i) * (1 - k) + a[1] / l * k, z = n.getZ(i) * (1 - k) + a[2] / l * k, m = Math.hypot(x, y, z) || 1; n.setXYZ(i, x / m, y / m, z / m); }
}
// ------------------------------------------------------------------ unit geometry (cached). All have position, normal; y0/y1 in userData
const GC = new Map();
const gc = (k, f) => { let g = GC.get(k); if (!g) { g = f(); g.computeBoundingBox(); g.userData.y0 = g.boundingBox.min.y; g.userData.y1 = g.boundingBox.max.y; GC.set(k, g); } return g; };
const G = {
  /** fluffy blob: displaced icosphere with radial normals tilted up (soft balloon light). detail 0/1/2 = 20/80/180 tris */
  lump: (detail = 1, seed = 1, jit = 0.1, up = 0.25) => gc(`lump${detail},${seed},${jit},${up}`, () => {
    const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, n = g.attributes.normal, s = seed * 1.7 + 0.3;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), f = 1 + jit * (Math.sin(x * 3.1 + s) * Math.sin(y * 2.7 + s * 1.3) + 0.7 * Math.sin(z * 3.7 + s * 0.7 + x * 1.3)) / 1.7;
      p.setXYZ(i, x * f, y * f, z * f); const l = Math.hypot(x, y + up, z); n.setXYZ(i, x / l, (y + up) / l, z / l);
    }
    return g;
  }),
  /** faceted rock: flat normals, flattened base. detail 0/1 = 20/80 tris */
  rock: (detail = 1, seed = 1, jit = 0.2) => gc(`rock${detail},${seed},${jit}`, () => {
    const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, s = seed * 2.3 + 1;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), f = 1 + jit * (Math.sin(x * 5.3 + s) * Math.cos(y * 4.1 + s * 1.7) + 0.8 * Math.sin(z * 4.7 + s + y * 2) ) / 1.8;
      p.setXYZ(i, x * f, Math.max(y * f, -0.55), z * f);
    }
    g.computeVertexNormals(); softenNormals(g, 0.62); return g;   // pebble-round: mostly smooth, a hint of facet
  }),
  /** a sail: flat triangle, apex up, both faces lit by their own normals, base width 1, height 1 */
  sail: () => gc('sail', () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.1, 1, 0, -0.5, 0, 0, -0.1, 1, 0, 0.5, 0, 0], 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0.2, 1, 0, 0.2, 1, 0, 0.2, 1, 0, 0.2, -1, 0, 0.2, -1, 0, 0.2, -1], 3)); return g; }),
  /** a leaf card: flat diamond facing +z (2 tris), 1 tall */
  leaf: () => gc('leaf', () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, -0.5, 0, 0.32, 0, 0, 0, 0.5, 0, 0, -0.5, 0, 0, 0.5, 0, -0.32, 0, 0], 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0.35, 1, 0, 0.35, 1, 0, 0.35, 1, 0, 0.35, 1, 0, 0.35, 1, 0, 0.35, 1], 3)); return g; }),
  /** flat bunting flag / petal triangle, both faces, pointing down (-y), width 1, height 1, in the XY plane */
  flag: () => gc('flag', () => { const g = new THREE.BufferGeometry(), a = [-0.5, 0, 0], b = [0.5, 0, 0], c = [0, -1, 0], pos = [...a, ...c, ...b, ...a, ...b, ...c], nor = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]; g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return g; }),
  /** open or closed tapered cylinder, base radius 1, height 1, bottom at y=0; r = top/bottom ratio */
  cyl: (ratio = 1, seg = 8, open = false) => gc(`cyl${ratio},${seg},${open}`, () => { const g = new THREE.CylinderGeometry(ratio, 1, 1, seg, 1, open); g.translate(0, 0.5, 0); return g; }),
  /** rounded box base at y=0 (centre in x/z) */
  box: () => gc('box', () => { const g = roundedBoxGeo(1, 1, 1, 0.14, 1).clone(); g.translate(0, 0.5, 0); return g; }),
  rbox: (w, h, d) => gc(`rbox${w.toFixed(3)},${h.toFixed(3)},${d.toFixed(3)}`, () => { const g = roundedBoxGeo(w, h, d, Math.min(0.07, Math.min(w, h, d) * 0.3), 1).clone(); g.translate(0, h / 2, 0); return g; }),
  plain: () => gc('plain', () => { const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); return g; }),
  octa: () => gc('octa', () => { const g = new THREE.OctahedronGeometry(1, 0); g.computeVertexNormals(); return g; }),
  /** flat disc facing up, unit radius */
  disc: (seg = 14) => gc(`disc${seg}`, () => { const g = new THREE.CircleGeometry(1, seg); g.rotateX(-Math.PI / 2); return g; }),
  lathe: (profile, seg = 14) => gc(`lathe${JSON.stringify(profile)},${seg}`, () => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg)),
  /** log end / stump top with growth rings, facing up, unit radius, own colours */
  rings: () => gc('rings', () => polarGeo([{ r: 0, y: 0, c: () => '#e8a868' }, { r: 0.28, y: 0, c: () => '#e8a868' }, { r: 0.36, y: 0, c: () => '#fde0b0' }, { r: 0.62, y: 0, c: () => '#f8d49c' }, { r: 0.7, y: 0, c: () => '#e2a868' }, { r: 0.9, y: 0, c: () => '#f2c488' }, { r: 1, y: 0, c: () => '#d9a06a' }], 12)),
};

// ------------------------------------------------------------------ the Builder: collects parts into one coloured geometry per material
const _m = new THREE.Matrix4(), _n3 = new THREE.Matrix3(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _c = new THREE.Color(), _bc = new THREE.Color(), _mc = new THREE.Color();
class Builder {
  constructor(floor = 0) { this.floor = floor; this.T = new THREE.Matrix4(); this.sets = {}; for (const k of ['matte', 'gloss', 'water', 'lantern', 'shadow']) this.sets[k] = { pos: [], nor: [], col: [], uv: [], g: [] }; this.tris = 0; }
  /** run fn with an extra placement transform (x,y,z, uniform scale, yaw) */
  xf(x, y, z, sc, yaw, fn) { const old = this.T; this.T = new THREE.Matrix4().multiplyMatrices(old, new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(0, yaw, 0)), new THREE.Vector3(sc, sc, sc))); fn(this); this.T = old; return this; }
  /**
   * add a cached/unit geometry. o: p [x,y,z], s number|[x,y,z], r [rx,ry,rz] (order YXZ), c colour, grad (tone strength, default .6), m set name,
   * ao (ground darkening 0..1, default .3), aoH (height of the falloff), facet (per-face value jitter), seed, moss {c, amt}, sw (wind weight 0..1)
   */
  add(g, o = {}) {
    const set = this.sets[o.m || 'matte'], px = o.p || [0, 0, 0], sc = o.s == null ? 1 : o.s, s = typeof sc === 'number' ? [sc, sc, sc] : sc, r = o.r || [0, 0, 0];
    _m.compose(_v.set(px[0], px[1], px[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2], 'YXZ')), new THREE.Vector3(s[0], s[1], s[2])); _m.premultiply(this.T); _n3.getNormalMatrix(_m);
    const p = g.attributes.position, n = g.attributes.normal, gcol = g.attributes.color, idx = g.index, cnt = idx ? idx.count : p.count;
    const y0 = g.userData.y0 ?? 0, y1 = g.userData.y1 ?? 1, ih = 1 / Math.max(1e-6, y1 - y0), grad = o.grad ?? 0.6, ao = Math.min(0.18, o.ao ?? 0.16), aoH = o.aoH ?? 0.45, facet = o.facet || 0, seed = o.seed || 0;
    if (!gcol) _bc.copy(col(o.c ?? '#ffffff'));
    if (o.swx && !g.boundingBox) g.computeBoundingBox(); const bbx0 = g.boundingBox ? g.boundingBox.min.x : 0, bbw = g.boundingBox ? Math.max(1e-6, g.boundingBox.max.x - g.boundingBox.min.x) : 1;
    const shadow = o.m === 'shadow'; let phase = 0;
    const cx = _m.elements[12], cz = _m.elements[14]; phase = (hash(cx * 0.37, cz * 0.53) * TAU);
    let fj = 1;
    for (let k = 0; k < cnt; k++) {
      const i = idx ? idx.getX(k) : k;
      if (facet && k % 3 === 0) fj = 1 + (hash(k * 0.173 + seed, seed * 3.1 + (k % 7)) - 0.5) * 2 * facet;
      _v.fromBufferAttribute(p, i); const t = (_v.y - y0) * ih, lx = (_v.x - bbx0) / bbw, lx0 = _v.x, ly0 = _v.y, lz0 = _v.z; _v.applyMatrix4(_m);
      set.pos.push(_v.x, _v.y, _v.z); set.g.push(o.ground || 0);
      let nx = 0, ny = 1, nz = 0; if (n) { _v.fromBufferAttribute(n, i).applyMatrix3(_n3).normalize(); nx = _v.x; ny = _v.y; nz = _v.z; }
      set.nor.push(nx, ny, nz);
      if (shadow) { set.col.push(gcol.getX(i), gcol.getY(i), gcol.getZ(i), gcol.getW(i)); set.uv.push(0, 0); continue; }
      if (gcol) _c.setRGB(gcol.getX(i), gcol.getY(i), gcol.getZ(i)); else tone(_bc, t, grad, _c);
      if (o.mot) { const mm = vn(lx0 * 2.7 + 11 + seed * 3.7, ly0 * 2.3 + lz0 * 2.5 + 5 + seed), k = o.mot; if (mm > 0.56) _c.lerp(o.motC ? _mc.set(o.motC) : MOT_L, clamp((mm - 0.56) * 3.4 * k)); else if (mm < 0.4) _c.multiplyScalar(1 - (0.4 - mm) * 1.5 * k); }
      if (o.bark) { const an = Math.atan2(lx0, lz0) * 3.5 + ly0 * 1.2, st = hash(Math.floor(an) * 1.7, seed + 2.2); _c.multiplyScalar(1 - o.bark * 0.2 * (0.4 + st)); }
      if (o.moss) { const mk = sstep(0.3, 0.65, ny) * (o.moss.amt ?? 1); if (mk > 0) { tone(_mc.set(o.moss.c), clamp(t * 0.6 + 0.4), 0.5, _t); _c.lerp(_t, mk); } }
      if (fj !== 1) _c.multiplyScalar(fj);
      if (ao > 0) { const yy = _v.y - this.floor; _c.multiplyScalar(1 - ao * Math.pow(1 - sstep(0, aoH, yy), 1.5)); }
      set.col.push(_c.r, _c.g, _c.b);
      set.uv.push(o.swx ? -o.swx * clamp(lx) : o.swc != null ? o.swc : o.sw ? o.sw * (0.25 + 0.75 * t) : 0, o.ph != null ? o.ph : phase);
    }
    this.tris += cnt / 3; return this;
  }
  // ---- shorthands
  box(w, h, d, x, y, z, c, o = {}) {
    if (Math.min(w, h, d) < 0.09 || w * h * d < 0.03) return this.add(G.plain(), { p: [x, y, z], s: [w, h, d], c, ...o });
    return this.add(G.rbox(w, h, d), { p: [x, y, z], c, ...o });   // real-size bevel (no anisotropic stretching)
  }
  plain(w, h, d, x, y, z, c, o = {}) { return this.add(G.plain(), { p: [x, y, z], s: [w, h, d], c, ...o }); }
  cyl(rt, rb, h, x, y, z, c, o = {}) { return this.add(G.cyl(rb > 0 ? rt / rb : 0, o.seg || 8, o.open), { p: [x, y, z], s: [rb, h, rb], c, ...o }); }
  lump(r, x, y, z, c, o = {}) { const s = o.s || [1, 1, 1]; const ss = typeof s === 'number' ? [s, s, s] : s; return this.add(G.lump(o.d ?? 1, o.seed || 1, o.jit ?? 0.1, o.up ?? 0.25), { p: [x, y, z], c, ...o, s: [r * ss[0], r * ss[1], r * ss[2]] }); }
  rock(r, x, y, z, c, o = {}) { const s = o.s || [1, 1, 1]; const ss = typeof s === 'number' ? [s, s, s] : s; return this.add(G.rock(o.d ?? 1, o.seed || 1, o.jit ?? 0.2), { p: [x, y, z], c, grad: 0.7, facet: 0.07, seed: o.seed || 1, ...o, s: [r * ss[0], r * ss[1], r * ss[2]] }); }
  /** soft contact shadow */
  shadow(x, z, r, op = 0.3, sx = 1, sz = 1, y = 0.03) {
    const set = this.sets.shadow, seg = 10, dark = [0.3, 0.38, 0.5]; y += this.floor;
    const ring = (rad, a, i) => [x + Math.cos(i / seg * TAU) * rad * sx, y, z + Math.sin(i / seg * TAU) * rad * sz, a];
    const push = (q) => { set.pos.push(q[0], q[1], q[2]); set.nor.push(0, 1, 0); set.col.push(dark[0], dark[1], dark[2], q[3]); set.uv.push(0, 0); };
    for (let i = 0; i < seg; i++) {
      const c0 = [x, y, z, op], a0 = ring(r * 0.5, op * 0.7, i), a1 = ring(r * 0.5, op * 0.7, i + 1), b0 = ring(r, 0, i), b1 = ring(r, 0, i + 1);
      for (const q of [c0, a1, a0, a0, a1, b0, a1, b1, b0]) push(q);
    }
    this.tris += seg * 3; return this;
  }
  /** add a raw coloured BufferGeometry (own colours/normals), transformed by the current xf */
  geo(g, set = 'matte', o = {}) { return this.add(g, { m: set, ao: 0, ...o }); }
  bake() {
    const out = { tris: this.tris };
    for (const [k, s] of Object.entries(this.sets)) {
      if (!s.pos.length) continue; const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(s.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(s.nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(s.col, k === 'shadow' ? 4 : 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(s.uv, 2));
      if (k === 'matte' && s.g.some((q) => q)) g.setAttribute('aG', new THREE.Float32BufferAttribute(s.g, 1));
      g.computeBoundingSphere(); out[k] = g;
    }
    return out;
  }
}
const BAKED = new Map();
/** bake (once) and cache by key. build(b) fills a Builder. */
function baked(key, build, floor = 0) { let e = BAKED.get(key); if (!e) { const b = new Builder(floor); build(b); e = b.bake(); BAKED.set(key, e); } return e; }
function instantiate(e, { shadows = true } = {}) {
  const g = new THREE.Group();
  for (const k of ['matte', 'gloss', 'water', 'lantern', 'shadow']) {
    if (!e[k]) continue; if (k === 'shadow' && !shadows) continue;
    const m = new THREE.Mesh(e[k], k === 'matte' && e[k].attributes.aG ? groundMat : MATS[k]); if (k === 'shadow') { m.renderOrder = 1; } else { m.castShadow = k !== 'water' && k !== 'lantern'; m.receiveShadow = true; }
    if (k === 'matte') m.onBeforeRender = windTick; m.name = ''; g.add(m);
  }
  return g;
}
const make = (key, build, floor = 0, opt) => instantiate(baked(key, build, floor), opt);

// ------------------------------------------------------------------ generic geometry makers
/** polar grid: rows = [{ r, y, c(x,z,theta,row) -> colour, wob? }], first row r=0 is the centre. Smooth normals. */
function polarGeo(rows, segs = 32, o = {}) {
  const pos = [], colr = [], idx = [], wob = o.wob || ((th) => 1);
  for (let i = 0; i < rows.length; i++) {
    const R = rows[i];
    for (let j = 0; j <= segs; j++) {
      const th = (j % segs) / segs * TAU, rr = R.r * (R.r > 0 ? wob(th, i) : 1), x = Math.cos(th) * rr, z = Math.sin(th) * rr, y = typeof R.y === 'function' ? R.y(x, z, th) : R.y;
      pos.push(x, y, z); const c = col(R.c(x, z, th, i)); colr.push(c.r, c.g, c.b);
    }
  }
  const W = segs + 1;
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < segs; j++) {
    const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
    if (o.flip) { idx.push(a, c, b, b, c, d); } else { idx.push(a, b, c, b, d, c); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); g.setIndex(idx); g.computeVertexNormals();
  if (o.nUp) { const n = g.attributes.normal; for (let i = 0; i < n.count; i++) { n.setXYZ(i, n.getX(i) * (1 - o.nUp), lerp(n.getY(i), 1, o.nUp), n.getZ(i) * (1 - o.nUp)); } }
  g.computeBoundingBox(); g.userData.y0 = g.boundingBox.min.y; g.userData.y1 = g.boundingBox.max.y; return g;
}
/**
 * Sweep a profile along a path. rings = array of arrays of {x,y,z,c}. cut = Set of ring indices after which no strip is made.
 * flip reverses the winding. Smooth normals (duplicate a ring to get a hard edge).
 */
function sweepGeo(rings, { cut, flip, orient } = {}) {
  const pos = [], colr = [], K = rings[0].length;
  for (const ring of rings) for (const q of ring) { pos.push(q.x, q.y, q.z); const c = col(q.c); colr.push(c.r, c.g, c.b); }
  const build = (fl) => {
    const idx = []; for (let i = 0; i < rings.length - 1; i++) { if (cut && cut.has(i)) continue; for (let k = 0; k < K - 1; k++) { const a = i * K + k, b = a + 1, c = a + K, d = c + 1; if (fl) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  };
  let g = build(!!flip);
  if (orient) { // 'up': the highest vertices must face up; 'out': normals must face away from the Y axis
    const p = g.attributes.position, n = g.attributes.normal; let maxY = -1e9, s = 0; for (let i = 0; i < p.count; i++) maxY = Math.max(maxY, p.getY(i));
    for (let i = 0; i < p.count; i++) { if (orient === 'up') { if (p.getY(i) > maxY - 0.004) s += n.getY(i); } else s += n.getX(i) * p.getX(i) + n.getZ(i) * p.getZ(i); }
    if (s < 0) g = build(!flip);
  }
  g.computeBoundingBox(); g.userData.y0 = g.boundingBox.min.y; g.userData.y1 = g.boundingBox.max.y; return g;
}
/** flat triangles list [[x,y,z,colour]*3...] -> geometry (up-facing if wound CCW seen from above) */
function triGeo(tris, up = true) {
  const pos = [], colr = []; for (let t of tris) { if (up) { const ux = t[1][0] - t[0][0], uz = t[1][2] - t[0][2], vx = t[2][0] - t[0][0], vz = t[2][2] - t[0][2]; if (uz * vx - ux * vz < 0) t = [t[0], t[2], t[1]]; } for (const v of t) { pos.push(v[0], v[1], v[2]); const c = col(v[3]); colr.push(c.r, c.g, c.b); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); g.computeVertexNormals();
  g.computeBoundingBox(); g.userData.y0 = g.boundingBox.min.y; g.userData.y1 = g.boundingBox.max.y; return g;
}
const paint = (x, z, a, b, sc = 0.5, lo = 0.35, hi = 0.65) => col(a).clone().lerp(col(b), sstep(lo, hi, fbm(x * sc + 11, z * sc + 7)));

// ------------------------------------------------------------------ small prop parts (write into a Builder)
const WOOD = '#dba468', WOOD_D = '#b87d50', TRUNK = '#bf8a5c', TRUNK_D = '#a5714a';
// happy-light pastel kit shared by every module below
const STONES = [['#ffefc2', '#fff8dc', '#f5e3b0'], ['#b4d8fa', '#d4e8fd', '#9cc4f0'], ['#ffd9a0', '#ffe8bf', '#f5c98a'], ['#fff2a8', '#fffacc', '#f5e48a']];   // cream, soft blue-grey, warm sand, rose
const MUSH = ['#ff8fa8', '#ffb066', '#c9a8ff', '#ff7f7f'], MOSS = '#7ee060';
function mushroomInto(b, x, z, s = 1, y = 0, cap = '#ff8fa8', dots = true) {
  b.cyl(0.042 * s, 0.058 * s, 0.11 * s, x, y, z, '#fff3dc', { seg: 5, ao: 0.05 });
  b.lump(0.14 * s, x, y + 0.115 * s, z, cap, { d: 0, s: [1, 0.72, 1], jit: 0.04, grad: 0.6, ao: 0 });
  if (dots) for (const [dx, dz, rr] of [[0.05, 0.05, 0.03], [-0.06, 0.02, 0.025], [0.0, -0.07, 0.027]]) b.add(G.octa(), { p: [x + dx * s, y + 0.2 * s, z + dz * s], s: rr * s, c: '#fffdf6', grad: 0, ao: 0 });
}
/** a clump of 3 to 4 toadstools of different sizes and pastel caps */
function mushroomClump(b, v, dots = true) { const c = MUSH[v % 4], c2 = MUSH[(v + 1) % 4]; mushroomInto(b, 0, 0, 1, 0, c, dots); mushroomInto(b, 0.17, 0.09, 0.62, 0, c, dots); mushroomInto(b, -0.12, 0.13, 0.5, 0, c2, dots); if (v % 2) mushroomInto(b, 0.05, -0.17, 0.4, 0, '#fff3dc', false); }
function tuftInto(b, x, y, z, s = 1, c = P.grassDeep, n = 5, sw = 1) {
  const r = krng(Math.floor(x * 97 + z * 57 + 3));
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, lean = 0.12 + r() * 0.35, h = (0.2 + r() * 0.2) * s, rad = 0.034 * s;
    b.add(G.cyl(0, 3, true), { p: [x + Math.cos(a) * 0.04 * s, y, z + Math.sin(a) * 0.04 * s], s: [rad, h, rad], r: [lean, a, 0], c, grad: 0.9, ao: 0, sw });
  }
}
// pastel flowers: pink, white, butter, lilac, peach, sky
const FLOWERS = ['#ff9ec4', '#ffffff', '#ffe066', '#c3b0ff', '#ffab8a', '#8fd0ff'];
/** one flower. kind 0 daisy, 1 tulip, 2 cosmos, 3 bell (default: varied by position) */
function flowerInto(b, x, y, z, color, s = 1, h = 0.18, dot = false, kind) {
  s *= 1.7; const k = kind ?? Math.floor(hash(x * 7.3 + 1, z * 5.1) * 4), hy = y + h * s;
  b.add(G.cyl(0, 3, true), { p: [x, y, z], s: [0.014 * s, h * s, 0.014 * s], c: '#5fd04e', grad: 0.3, ao: 0, sw: 0.9 });
  if (k === 0) { b.lump(0.08 * s, x, hy, z, color, { d: 0, s: [1, 0.32, 1], grad: 0.3, ao: 0, sw: 0.9 }); b.add(G.octa(), { p: [x, hy + 0.016 * s, z], s: 0.036 * s, c: color === '#ffe066' ? '#ffffff' : '#ffd23a', grad: 0, ao: 0, sw: 0.9 }); }
  else if (k === 1) { b.lump(0.062 * s, x, hy + 0.02 * s, z, color, { d: 0, s: [0.85, 1.15, 0.85], grad: 0.5, ao: 0, sw: 0.9 }); b.add(G.cyl(0, 3, true), { p: [x + 0.03 * s, y, z], s: [0.03 * s, h * 0.55 * s, 0.012 * s], r: [0, 0, -0.5], c: '#58c85a', grad: 0.3, ao: 0, sw: 0.7 }); }
  else if (k === 2) { b.add(G.octa(), { p: [x, hy, z], s: [0.07 * s, 0.05 * s, 0.07 * s], c: color, grad: 0.4, ao: 0, sw: 0.9 }); if (dot) b.lump(0.024 * s, x, hy + 0.03 * s, z, '#ffd23a', { d: 0, grad: 0, ao: 0, sw: 0.9 }); }
  else { b.add(G.octa(), { p: [x, hy - 0.01 * s, z], s: [0.04 * s, 0.065 * s, 0.04 * s], c: color, grad: 0.4, ao: 0, sw: 0.9 }); b.add(G.octa(), { p: [x + 0.045 * s, hy - 0.05 * s, z + 0.01 * s], s: [0.03 * s, 0.05 * s, 0.03 * s], c: color, grad: 0.4, ao: 0, sw: 0.9 }); }
}
/** clover leaves (flat three-leaf discs) with the odd pale pink head */
function cloverInto(b, x, y, z, s = 1) {
  const r = krng(Math.floor(x * 53 + z * 91 + 5));
  for (let i = 0; i < 4; i++) { const cx = x + (r() - 0.5) * 0.3 * s, cz = z + (r() - 0.5) * 0.3 * s; for (let k = 0; k < 3; k++) { const a = k * 2.09 + r(); b.add(G.disc(6), { p: [cx + Math.cos(a) * 0.04 * s, y + 0.02 + k * 0.004, cz + Math.sin(a) * 0.04 * s], s: [0.052 * s, 1, 0.052 * s], c: k % 2 ? '#8fe06a' : '#a8ec78', grad: 0, ao: 0, sw: 0.25 }); }
    if (i % 2 === 0) { b.add(G.cyl(0, 3, true), { p: [cx, y, cz], s: [0.01 * s, 0.12 * s, 0.01 * s], c: '#8fe06a', grad: 0, ao: 0, sw: 0.5 }); b.add(G.octa(), { p: [cx, y + 0.13 * s, cz], s: 0.04 * s, c: i ? '#ffd6e6' : '#ffffff', grad: 0, ao: 0, sw: 0.5 }); } }
}
/** a flat flower carpet: a soft green patch freckled with flat pastel blooms (cheap, reads from far away) */
function carpetInto(b, v, nb = 10) {
  const r = krng(v * 29 + 3), pal = [['#ffb7d0', '#ffffff', '#ff9ec4'], ['#fff2a0', '#ffffff', '#ffd23a'], ['#d4c4ff', '#ffffff', '#b8a4ff'], ['#ffc8a8', '#fff2a0', '#ffffff']][v % 4];
  for (let i = 0; i < nb; i++) { const a = r() * TAU, rr = Math.sqrt(r()) * 0.46, x = Math.cos(a) * rr, z = Math.sin(a) * rr * 0.9; b.add(G.disc(6), { p: [x, 0.03 + i * 0.002, z], s: [0.13, 1, 0.13], c: pal[i % 3], grad: 0, ao: 0, sw: 0.1 }); b.add(G.disc(4), { p: [x, 0.04 + i * 0.002, z], s: [0.05, 1, 0.05], c: '#ffd23a', grad: 0, ao: 0, sw: 0.1 }); }
}
/** three little pastel pebbles */
function pebblesInto(b, x, y, z, s = 1, v = 0) {
  const pal = STONES[v % 4]; for (let i = 0; i < 3; i++) { const a = i * 2.2 + v; b.rock(0.06 * s * (1 - i * 0.18), x + Math.cos(a) * 0.1 * s, y + 0.03 * s, z + Math.sin(a) * 0.1 * s, pal[i % 3], { d: 0, seed: v + i, s: [1.2, 0.8, 1], ao: 0 }); }
}
/**
 * bunting: a sagging string with pastel pennants. pos(t) -> [x,y,z] (t 0..1), n flags. Static geometry (no wind weight needed, a hint of sway only).
 */
const BUNT = ['#ff9ec4', '#ffe066', '#8fd0ff', '#b8f0d0', '#c3b0ff', '#ffab8a'];
function buntingInto(b, pos, n, size = 0.22, sag = 0.3, pal = BUNT, segs = 14) {
  const at = (t) => { const p = pos(t); return [p[0], p[1] - sag * 4 * t * (1 - t), p[2]]; };
  let prev = at(0);
  for (let i = 1; i <= segs; i++) { const q = at(i / segs); const dx = q[0] - prev[0], dy = q[1] - prev[1], dz = q[2] - prev[2], l = Math.hypot(dx, dy, dz); b.add(G.cyl(1, 3, true), { p: prev, s: [0.022, l, 0.022], r: [Math.acos(dy / (l || 1)), Math.atan2(dx, dz), 0], c: '#fff7e8', grad: 0, ao: 0, swc: 0 }); prev = q; }
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, p = at(t), q = at(Math.min(1, t + 0.02)), yaw = Math.atan2(-(q[2] - p[2]), q[0] - p[0]); b.add(G.flag(), { p: [p[0], p[1], p[2]], s: [size, size * 1.25, size], r: [0, yaw, 0], c: pal[i % pal.length], grad: 0.2, ao: 0, sw: 0.35 }); }
}
function logInto(b, x, y, z, len, rad, yaw, c = '#d29a62') {
  // horizontal log centred at (x,y,z) on the ground, axis direction d = (-cos yaw, 0, sin yaw)
  const dx = -Math.cos(yaw), dz = Math.sin(yaw), cy = y + rad;
  b.add(G.cyl(1, 8), { p: [x - dx * len / 2, cy, z - dz * len / 2], s: [rad, len, rad], r: [0, yaw, Math.PI / 2], c, grad: 0.6, ao: 0.15 });
  b.add(G.rings(), { p: [x + dx * (len / 2 + 0.004), cy, z + dz * (len / 2 + 0.004)], s: rad * 0.98, r: [0, yaw, Math.PI / 2], ao: 0 });
  b.add(G.rings(), { p: [x - dx * (len / 2 + 0.004), cy, z - dz * (len / 2 + 0.004)], s: rad * 0.98, r: [0, yaw, -Math.PI / 2], ao: 0 });
}

// =================================================================== 1. RESOURCE NODES
export const TREE_SPECIES = ['oak', 'pine', 'birch', 'apple', 'blossom', 'orange', 'peach'];
const SPECIES_BY_SEED = ['oak', 'blossom', 'birch', 'apple', 'oak', 'orange', 'pine', 'peach', 'blossom', 'oak'];
const LEAF = {
  oak: ['#62d44e', '#6edc50', '#58cc52'], pine: ['#3cc47a', '#44cc84', '#32b87a'], birch: ['#aeea4c', '#bcf058', '#9fe25c'], apple: ['#6cdb4e', '#78e252', '#60d256'],
  blossom: ['#ffbdd6', '#ffaecb', '#ffc9de'], orange: ['#58d24c', '#64da54', '#4eca54'], peach: ['#84e87c', '#92ef80', '#78e084'],
};
const SHADE = { oak: '#3cc678', pine: '#2fb58c', birch: '#4cc880', apple: '#3cc678', blossom: '#ff8fbd', orange: '#34c376', peach: '#5cd48e' }, TOPC = { blossom: '#ffe8f2', peach: '#d8ffd0' };
const FRUIT = { apple: ['#ff4f45', '#ffb3a8'], orange: ['#ffa21f', '#ffe0a0'], peach: ['#ff9f86', '#ffe4d6'] };
/** write one tree of the given species into builder b (origin at trunk base, ~1 unit footprint). lod 0 = hero (about 700 tris), 1 = forest (about 250) */
function treeInto(b, sp, v, lod, season) {
  const aut = season === 'autumn' && LEAF_A[sp], r = krng(v * 977 + sp.length * 131 + 7), j = (a) => (r() - 0.5) * 2 * a, hi = lod === 0, lc = (aut ? LEAF_A[sp] : LEAF[sp])[v % 3], sw = 0.5, canopy = [];
  const L = (x, y, z, rad, c, o = {}) => { const ss = o.s == null ? [1, 1, 1] : typeof o.s === 'number' ? [o.s, o.s, o.s] : o.s, xx = x + j(0.035), yy = y + j(0.03), zz = z + j(0.035); canopy.push([xx, yy, zz, rad * ss[0], rad * ss[1], rad * ss[2]]); return b.lump(rad, xx, yy, zz, c, { d: 1, seed: v + 2, jit: 0.07, up: 0.38, grad: 0.95, ao: 0, sw, mot: hi ? 0.95 : 0.6, motC: aut ? '#ffe27a' : sp === 'blossom' ? '#fff0f6' : undefined, ...o }); };
  const dark = col(lc).clone().lerp(col(aut ? SHADE_A[sp] : SHADE[sp]), 0.5), light = col(aut ? '#fff0a0' : TOPC[sp] || '#dcff8a').lerp(col(lc), 0.25);
  const trunk = (rb, rt, h, c, seg = 7, lean = 0) => { b.add(G.lathe([[rb * 1.5, 0], [rb * 1.12, 0.1 * h], [rt * 1.05, 0.5 * h], [rt, h]], seg), { p: [0, 0, 0], s: 1, c, grad: 0.4, ao: 0.16, aoH: 0.3, r: [0, 0, lean], bark: 0.9, seed: v }); if (hi && rb > 0.09) for (let i = 0; i < 4; i++) { const a = i * 1.57 + r() * 0.6; b.add(G.cyl(0.3, 4, true), { p: [0, 0.05, 0], s: [rb * 0.85, rb * 2.5, rb * 0.85], r: [1.32, a, 0], c, grad: 0.3, ao: 0.1, bark: 0.6, seed: v + i }); } };
  const dots = (cs, n, c, rr = 0.032) => { for (let i = 0; i < n; i++) { const q = cs[i % cs.length], a = i * 2.4 + 0.5, e = -0.1 + r() * 0.9, ce = Math.cos(e), R = q[3] * 1.0; b.add(G.octa(), { p: [q[0] + Math.cos(a) * ce * R, q[1] + Math.sin(e) * R * 0.9, q[2] + Math.sin(a) * ce * R], s: rr, c: Array.isArray(c) ? c[i % c.length] : c, grad: 0, ao: 0, sw }); } };
  if (sp === 'oak') {
    trunk(0.14, 0.09, 0.95, TRUNK, hi ? 7 : 5);
    if (hi) { b.cyl(0.03, 0.045, 0.34, 0.03, 0.62, 0, TRUNK, { seg: 5, r: [0, 0, -0.75], ao: 0 }); b.cyl(0.03, 0.045, 0.3, -0.02, 0.7, 0, TRUNK, { seg: 5, r: [0, 0, 0.7], ao: 0 }); }
    if (hi) {
      const cs = [[-0.36, 1.12, 0.08, 0.4], [0.35, 1.18, -0.06, 0.38], [0.02, 1.18, 0.36, 0.36], [-0.06, 1.26, -0.34, 0.35]];
      L(0, 1.42, 0, 0.56, lc, { d: 2 }); L(cs[0][0], cs[0][1], cs[0][2], cs[0][3], dark); L(cs[1][0], cs[1][1], cs[1][2], cs[1][3], dark); L(cs[2][0], cs[2][1], cs[2][2], cs[2][3], dark); L(cs[3][0], cs[3][1], cs[3][2], cs[3][3], lc);
      L(0.04, 1.9, 0.0, 0.36, lc, { s: [1, 0.92, 1] }); L(0.24, 2.02, 0.12, 0.2, light, { d: 0 }); L(-0.26, 1.64, 0.32, 0.17, light, { d: 0 }); L(0.3, 1.62, -0.22, 0.15, light, { d: 0 });
      dots([[0, 1.42, 0, 0.56], ...cs], 6, ['#fff6a8', '#ffffff'], 0.03);
    } else { L(0, 1.34, 0, 0.54, lc, {}); L(-0.3, 1.1, 0.1, 0.34, dark, { d: 0 }); L(0.3, 1.14, -0.06, 0.34, dark, { d: 0 }); L(0.04, 1.8, 0, 0.34, lc, { d: 1 }); L(0.2, 1.92, 0.1, 0.17, light, { d: 0 }); }
  } else if (sp === 'pine') {
    trunk(0.1, 0.07, 0.8, TRUNK_D, hi ? 7 : 5);
    const tiers = hi ? [[0.62, 0.72, 0.64], [0.52, 1.12, 0.62], [0.42, 1.5, 0.6], [0.3, 1.86, 0.62]] : [[0.62, 0.78, 0.64], [0.48, 1.25, 0.62], [0.32, 1.72, 0.62]];
    tiers.forEach(([rad, y, sy], i) => { L(j(0.09), y, j(0.09), rad, i % 2 ? dark : lc, { s: [1, sy, 1], jit: 0.14, up: 0.55, seed: v + i }); });
    if (hi) { L(0.36, 0.7, 0.14, 0.2, dark, { d: 0, s: [1, 0.6, 1] }); L(-0.34, 0.74, -0.18, 0.2, dark, { d: 0, s: [1, 0.6, 1] }); L(0.0, 1.12, -0.38, 0.17, lc, { d: 0, s: [1, 0.6, 1] }); }
    L(0.0, tiers[tiers.length - 1][1] + 0.3, 0, 0.14, light, { d: 0, s: [1, 1.5, 1], up: 0.1 });
    if (hi) dots(tiers.map(([rad, y]) => [0, y, 0, rad]), 5, ['#ffe066', '#ff9ec4', '#ffffff'], 0.035);
  } else if (sp === 'birch') {
    b.add(G.lathe([[0.1, 0], [0.075, 0.2], [0.06, 0.9], [0.05, 1.5]], hi ? 7 : 5), { c: '#fff8ea', grad: 0.3, ao: 0.16, aoH: 0.3, r: [0, 0, 0.05] });
    if (hi) for (const [y, a] of [[0.25, 0.4], [0.5, 2.6], [0.78, 1.2], [1.05, 4.1], [1.3, 0.2]]) b.add(G.lump(0, 1, 0.1, 0), { p: [Math.sin(a) * 0.07 * (1 - y * 0.2) + 0.03 * y, y, Math.cos(a) * 0.07 * (1 - y * 0.2)], s: [0.045, 0.025, 0.03], r: [0, a, 0], c: '#b09a86', grad: 0, ao: 0 });
    if (hi) { const cs = [[-0.26, 1.45, 0.1, 0.27], [0.27, 1.52, -0.05, 0.26], [0.0, 1.42, 0.28, 0.23]]; L(0.0, 1.7, 0, 0.36, lc, { s: [1, 1.25, 1] }); L(-0.26, 1.45, 0.1, 0.27, dark, { s: [1, 1.1, 1] }); L(0.27, 1.52, -0.05, 0.26, dark, { s: [1, 1.1, 1] }); L(0.06, 2.1, 0.04, 0.27, lc, { s: [1, 1.2, 1] }); L(0.0, 1.42, 0.28, 0.23, dark, { d: 0 }); L(0.16, 2.0, 0.16, 0.16, light, { d: 0 }); L(-0.18, 1.78, 0.2, 0.14, light, { d: 0 }); dots(cs, 4, '#ffffff', 0.03); }
    else { L(0.0, 1.7, 0, 0.38, lc, { s: [1, 1.25, 1] }); L(-0.25, 1.45, 0.1, 0.26, dark, { d: 0, s: [1, 1.1, 1] }); L(0.26, 1.5, -0.05, 0.25, dark, { d: 0, s: [1, 1.1, 1] }); L(0.06, 2.1, 0.04, 0.27, light, { d: 0, s: [1, 1.2, 1] }); }
  } else if (sp === 'blossom') { // sakura-like: a leaning trunk and a wide, puffy pink cloud
    trunk(0.13, 0.08, 0.8, '#a9755a', hi ? 7 : 5, 0.07);
    if (hi) { b.cyl(0.03, 0.05, 0.42, 0.06, 0.62, 0, '#a9755a', { seg: 5, r: [0, 0, -0.85], ao: 0 }); b.cyl(0.03, 0.045, 0.36, -0.05, 0.66, 0.02, '#a9755a', { seg: 5, r: [0, 0, 0.8], ao: 0 }); }
    const cs = [[0, 1.26, 0, 0.6], [-0.46, 1.02, 0.06, 0.4], [0.46, 1.06, -0.06, 0.4], [0.0, 1.0, 0.44, 0.38], [-0.08, 1.04, -0.44, 0.36], [0.04, 1.66, 0.02, 0.38]];
    if (hi) { cs.forEach(([x, y, z, rad], i) => L(x, y, z, rad, i % 3 === 1 ? dark : lc, { s: [1, 0.84, 1] })); L(0.2, 1.84, 0.1, 0.2, light, { d: 0 }); L(-0.3, 1.5, 0.3, 0.17, light, { d: 0 }); L(0.3, 1.5, -0.24, 0.17, light, { d: 0 }); dots(cs, 16, ['#ffffff', '#ff8fbd', '#fff0f6'], 0.034); for (let i = 0; i < 3; i++) b.add(G.flag(), { p: [Math.cos(i * 2.2 + 1) * 0.5, 0.04, Math.sin(i * 2.2 + 1) * 0.5], s: 0.11, r: [-Math.PI / 2, i, 0], c: '#ffb7d0', grad: 0, ao: 0 }); }
    else { L(0, 1.26, 0, 0.6, lc, { s: [1, 0.84, 1] }); L(-0.44, 1.02, 0.06, 0.38, dark, { d: 0 }); L(0.44, 1.06, -0.06, 0.38, dark, { d: 0 }); L(0.04, 1.66, 0.02, 0.36, lc, { d: 0 }); L(0.2, 1.84, 0.1, 0.18, light, { d: 0 }); }
  } else { // apple, orange, peach: round fruit trees with clearly visible fruit
    const T = { apple: { h: 0.78, w: 0.55, y: 1.2, k: 1 }, orange: { h: 0.9, w: 0.5, y: 1.3, k: 1.1 }, peach: { h: 0.74, w: 0.58, y: 1.14, k: 0.95 } }[sp], Y = T.y, W = T.w;
    trunk(0.15, 0.1, T.h, TRUNK, hi ? 7 : 5);
    const cs = [[0, Y, 0, W, lc], [-0.4, Y - 0.2, 0.1, 0.38, dark], [0.4, Y - 0.15, -0.05, 0.38, dark], [0.0, Y - 0.15, 0.4, 0.36, dark], [-0.05, Y - 0.12, -0.4, 0.34, lc], [0.04, Y + 0.42, 0, 0.36, lc]];
    if (hi) { for (const [x, y, z, rad, c] of cs) L(x, y, z, rad, c, { s: [1, 0.86 * T.k, 1] }); L(0.2, Y + 0.6, 0.1, 0.2, light, { d: 0 }); }
    else { L(0, Y, 0, W, lc, { s: [1, 0.86 * T.k, 1] }); L(-0.38, Y - 0.2, 0.1, 0.36, dark, { d: 0 }); L(0.4, Y - 0.15, -0.05, 0.36, dark, { d: 0 }); L(0.04, Y + 0.42, 0, 0.34, lc, { d: 0 }); }
    const act = hi ? cs : [cs[0], cs[1], cs[2], cs[5]], na = hi ? 10 : 6, [fc, fh] = FRUIT[sp];
    for (let i = 0; i < na; i++) {
      const k = i % act.length, c = act[k], a = i * 2.4 + 0.5, side = Math.abs(c[0]) + Math.abs(c[2]) > 0.2, e = side ? -0.2 + r() * 0.5 : 0.15 + r() * 0.5; let dx = Math.cos(a), dz = Math.sin(a);
      if (side) { const l = Math.hypot(c[0], c[2]) || 1; dx = c[0] / l + dx * 0.4; dz = c[2] / l + dz * 0.4; const m = Math.hypot(dx, dz); dx /= m; dz /= m; }
      const rr = c[3] * 1.04, ce = Math.cos(e), ap = [c[0] + dx * ce * rr, c[1] + Math.sin(e) * rr * 0.86, c[2] + dz * ce * rr];
      b.lump(sp === 'orange' ? 0.115 : 0.105, ap[0], ap[1], ap[2], fc, { d: 0, grad: 0.35, ao: 0, jit: 0.03 }); if (hi && i % 2 === 0) b.add(G.octa(), { p: [ap[0] - 0.035, ap[1] + 0.05, ap[2] + 0.05], s: 0.03, c: fh, grad: 0, ao: 0 });
    }
  }
  if (hi) {   // leaf cards: small flat leaves fringing the canopy silhouette catch the light like painted leaf clusters
    const lcard = aut ? ['#ffd04a', '#ffb347', '#ffe27a'] : sp === 'blossom' ? ['#ffd0e2', '#ffb7d0', '#fff0f6'] : sp === 'pine' ? ['#6edca0', '#8fe8b0'] : ['#b8f56a', '#a0ec5a', '#d4ff8a'], tot = canopy.reduce((a, q) => a + q[3], 0);
    for (let i = 0; i < 22; i++) { let u = r() * tot, q = canopy[0]; for (const c of canopy) { u -= c[3]; if (u <= 0) { q = c; break; } } const a = r() * TAU, e = -0.15 + r() * 1.0, ce = Math.cos(e), d = [Math.cos(a) * ce, Math.sin(e), Math.sin(a) * ce], sz = 0.2 + r() * 0.12;
      b.add(G.leaf(), { p: [q[0] + d[0] * q[3] * 1.0, q[1] + d[1] * q[4] * 1.0, q[2] + d[2] * q[5] * 1.0], s: sz, r: [-Math.asin(d[1]), Math.atan2(d[0], d[2]), r() * 1.2 - 0.6], c: lcard[i % lcard.length], grad: 0.2, ao: 0, sw }); }
  }
}
const LEAF_A = { oak: ['#ffa640', '#ff9533', '#ffb74d'], birch: ['#ffd652', '#ffc83e', '#ffe272'], apple: ['#ff9a3c', '#ffae4a', '#ff8a30'] }, SHADE_A = { oak: '#e2662a', birch: '#f0a028', apple: '#e8702c' };
const AUTUMN_SP = ['oak', 'birch', 'apple'];
const SHADOW_R = { oak: 0.78, pine: 0.66, birch: 0.62, apple: 0.82, blossom: 0.9, orange: 0.78, peach: 0.84 };
/** baked tree entry (geometry shared; used by scatter instancing) */
export function bakedTree(sp, v = 0, lod = 0, season = '') { return baked(`tree:${sp}:${v}:${lod}:${season}`, (b) => { treeInto(b, sp, v, lod, season); b.shadow(0, 0, SHADOW_R[sp], 0.26, 1, 1, 0.03); }); }
/** Tree resource node. Species chosen by seed (oak 30%, blossom 20%, birch/apple/orange/pine/peach 10% each). ~1 unit footprint, 1.8 to 2.6 tall. opts: { species, lod } */
export function treeModel(seed = 0, opts = {}) {
  const s = Math.abs(Math.floor(seed)), sp = opts.species || SPECIES_BY_SEED[s % 10], v = Math.floor(s / 10) % 3;
  const season = opts.season ?? (AUTUMN_SP.includes(sp) && hash(s * 2.9, 6.3) < 0.2 ? 'autumn' : ''), g = instantiate(bakedTree(sp, v, opts.lod || 0, season)); const h = hash(s * 1.3, 4.1);
  g.rotation.y = h * TAU; g.scale.setScalar(0.94 + 0.14 * hash(s, 9.7)); g.userData = { species: sp, season: season || 'summer', topY: { pine: 2.5, birch: 2.4, oak: 2.3, apple: 2.0, blossom: 2.2, orange: 2.1, peach: 1.9 }[sp] };
  return g;
}

function stumpInto(b, big = false) {
  const s = big ? 1.25 : 1;
  b.add(G.lathe([[0.3 * s, 0], [0.255 * s, 0.1 * s], [0.225 * s, 0.3 * s], [0.215 * s, 0.34 * s]], 10), { c: TRUNK, grad: 0.6, ao: 0.16, aoH: 0.25 });
  b.add(G.rings(), { p: [0, 0.34 * s + 0.004, 0], s: 0.215 * s, ao: 0 });
  for (const [a, rr] of [[0.6, 0.27], [2.7, 0.26], [4.5, 0.25]]) b.lump(0.09 * s, Math.cos(a) * rr * s, 0.04, Math.sin(a) * rr * s, TRUNK_D, { d: 0, s: [1.4, 0.55, 0.8], grad: 0.5, ao: 0.1, jit: 0.05 });
  b.lump(0.07 * s, 0.1 * s, 0.38 * s, -0.12 * s, '#a8f070', { d: 0, s: [1.3, 0.7, 1], grad: 0.6, ao: 0 }); b.lump(0.055 * s, 0.17 * s, 0.4 * s, -0.08 * s, '#c8ff8a', { d: 0, s: [1.3, 0.7, 1], grad: 0.6, ao: 0 });
  mushroomInto(b, 0.27 * s, 0.07 * s, 0.7 * s, 0, '#ff8fa8', true);
}
/** The cut tree: a chunky stump with growth rings, a green sprout and a pink toadstool. ~0.7 wide. */
export function stumpModel() { return make('stump', (b) => { stumpInto(b); b.shadow(0, 0, 0.55, 0.24); }); }

function boulderCluster(b, seed, big = 1) {
  const r = krng(seed * 31 + 5), base = STONES[Math.floor(r() * 4) % 4];
  const part = (rad, x, z, sx, sy, sz, i, dd = 1) => {
    const y = rad * sy * 0.55 * 0.9; b.rock(rad, x, y, z, base[i % 3], { s: [sx, sy, sz], d: dd, seed: seed + i, r: [0, r() * TAU, 0], jit: 0.12, moss: { c: MOSS, amt: 1 }, ao: 0.14, aoH: 0.35 });
    return [x, y, z, rad * sx, rad * sy, rad * sz];
  };
  const m = part(0.46 * big, 0, 0, 1.15, 0.95, 1.0, 0, 2), s1 = part(0.31 * big, 0.5 * big, 0.2 * big, 1, 0.85, 1, 1), s2 = part(0.25 * big, -0.4 * big, 0.28 * big, 1.1, 0.8, 1, 2), s3 = part(0.15 * big, -0.1 * big, -0.5 * big, 1, 0.8, 1, 1, 0);
  // pastel crystals (pink, lilac, ice) from the main boulder and one smaller
  const cr = (cx, cy, cz, h, tx, tz, c) => b.add(G.octa(), { m: 'gloss', p: [cx, cy, cz], s: [h * 0.3, h, h * 0.3], r: [tx, 0, tz], c, grad: 0.4, ao: 0 });
  cr(m[0] + 0.12 * big, m[1] + m[4] * 0.85, m[2] - 0.08 * big, 0.22 * big, 0.2, -0.25, '#ffc4e0'); cr(m[0] - 0.08 * big, m[1] + m[4] * 0.95, m[2] + 0.1 * big, 0.15 * big, -0.3, 0.2, '#d9ccff'); cr(s1[0], s1[1] + s1[4] * 0.8, s1[2], 0.13 * big, 0.2, 0.25, '#c8f2ff');
  // a fan of crystals growing from the foot of the little boulder, mossy cushions and a fern
  { const cc = ['#ffc4e0', '#d9ccff', '#c8f2ff', '#c8ffe0', '#ffe3a8', '#ffb7d0']; for (let i = 0; i < 6; i++) { const a = 0.4 + i * 0.52, hh = (0.13 + (i % 3) * 0.06 + (i === 2 ? 0.1 : 0)) * big; cr(s2[0] + Math.cos(a) * 0.17 * big + 0.12 * big, 0.05 * big + hh * 0.7, s2[2] + Math.sin(a) * 0.17 * big - 0.28 * big, hh, Math.sin(a) * 0.45, -Math.cos(a) * 0.45, cc[i]); }
    b.lump(0.16 * big, m[0] - 0.2 * big, m[1] + m[4] * 0.78, m[2] - 0.12 * big, '#8aea6a', { d: 0, s: [1.3, 0.55, 1], grad: 0.7, ao: 0, mot: 0.8 }); b.lump(0.11 * big, s1[0] + 0.06 * big, s1[1] + s1[4] * 0.8, s1[2] + 0.1 * big, '#a4f27a', { d: 0, s: [1.3, 0.55, 1], grad: 0.7, ao: 0 });
    for (let i = 0; i < 3; i++) { const a = i * 2.2 + 1; b.add(G.octa(), { p: [m[0] + Math.cos(a) * m[3] * 0.9, 0.12 * big, m[2] + Math.sin(a) * m[5] * 0.9], s: [0.04 * big, 0.12 * big, 0.2 * big], r: [-0.6, -a + Math.PI / 2, 0], c: '#58cf62', grad: 0.8, ao: 0, sw: 0.7 }); } }
  // chips pressed into the faces
  for (let i = 0; i < 4; i++) { const t = [m, s1, s2][i % 3], a = r() * TAU, e = 0.1 + r() * 0.5; const x = t[0] + Math.cos(a) * Math.cos(e) * t[3] * 0.93, y = t[1] + Math.sin(e) * t[4] * 0.9, z = t[2] + Math.sin(a) * Math.cos(e) * t[5] * 0.93; b.add(G.rock(0, 3 + i, 0.15), { p: [x, y, z], s: 0.04 * big, c: i % 2 ? '#fff4c8' : '#ffd0e4', grad: 0.2, ao: 0 }); }
  // sparkles: tiny glints on the tops
  for (let i = 0; i < 3; i++) { const t = [m, s1, s2][i], a = r() * TAU; b.add(G.octa(), { m: 'gloss', p: [t[0] + Math.cos(a) * t[3] * 0.4, t[1] + t[4] * 0.98, t[2] + Math.sin(a) * t[5] * 0.4], s: [0.02 * big, 0.05 * big, 0.02 * big], c: '#ffffff', grad: 0, ao: 0 }); }
  tuftInto(b, m[0] + 0.02, m[1] + m[4] * 0.88, m[2], 0.8 * big, '#7ad85a', 4, 0.7); flowerInto(b, m[0] - 0.12 * big, m[1] + m[4] * 0.8, m[2] + 0.1 * big, '#ff9ec4', 0.9, 0.12, false, 0); flowerInto(b, s1[0], s1[1] + s1[4] * 0.78, s1[2] - 0.05, '#ffffff', 0.8, 0.1, false, 0);
}
/** Stone resource node: round pastel boulder cluster (cream, blue-grey, sand or rose), moss caps, crystals, sparkles. 1x1 footprint, ~0.8 tall. */
export function rockModel(seed = 0) { const s = Math.abs(Math.floor(seed)) % 6; const g = instantiate(baked(`rock:${s}`, (b) => { boulderCluster(b, s); b.shadow(0.05, 0.05, 0.78, 0.26); })); g.rotation.y = hash(seed, 2.2) * TAU; return g; }

function clayInto(b, seed) {
  const r = krng(seed * 13 + 3);
  // earthen bowl: raised rim, wet glossy terracotta inside
  b.add(G.lathe([[0.7, 0], [0.64, 0.06], [0.56, 0.17], [0.46, 0.18], [0.38, 0.1], [0.3, 0.07], [0.0, 0.07]], 11), { c: '#f4a46c', grad: 0.6, ao: 0.16, aoH: 0.2, facet: 0.03, seed });
  b.lump(0.4, 0, 0.075, 0, '#ff9a5e', { m: 'gloss', d: 1, s: [1, 0.12, 1], jit: 0.06, grad: 0.5, ao: 0 });
  for (const [x, z, rad] of [[0.52, -0.3, 0.17], [-0.5, -0.32, 0.14], [0.2, 0.58, 0.15]]) b.lump(rad, x, rad * 0.55 + 0.03, z, '#f27f4e', { m: 'gloss', d: 0, s: [1.1, 0.7, 1], jit: 0.12, grad: 0.6, ao: 0.05, seed: r() * 9 });
  for (let i = 0; i < 2; i++) { const a = r() * TAU; b.rock(0.05, Math.cos(a) * 0.62, 0.03, Math.sin(a) * 0.62, '#f6ecd4', { d: 0, seed: i }); }
  b.lump(0.035, 0.1, 0.1, -0.05, '#ffe0c0', { m: 'gloss', d: 0, ao: 0, grad: 0 });
  // shovel stuck in the clay
  b.cyl(0.018, 0.02, 0.62, -0.12, 0.1, 0.1, WOOD, { seg: 5, r: [0.1, 0, 0.32], ao: 0 }); b.box(0.12, 0.04, 0.05, -0.31, 0.7, 0.17, WOOD_D, { r: [0.1, 0, 0.32], ao: 0 });
  b.box(0.12, 0.17, 0.025, -0.1, 0.05, 0.1, '#cfe0ee', { r: [0.1, 0, 0.32], ao: 0, grad: 0.4 });
}
/** Clay pit node: round earthen bowl, shiny wet terracotta, a shovel and mounds. 1x1 footprint, ~0.3 tall (shovel 0.75). */
export function clayModel(seed = 0) { const s = Math.abs(Math.floor(seed)) % 3; const g = instantiate(baked(`clay:${s}`, (b) => { clayInto(b, s); b.shadow(0, 0, 0.9, 0.24); })); g.rotation.y = hash(seed, 6.1) * TAU; return g; }

/** triangle count of an object tree (InstancedMesh counts every instance) */
export function countTris(o) {
  let n = 0; o.traverse((m) => { if (!m.isMesh) return; const g = m.geometry, t = g.index ? g.index.count / 3 : g.attributes.position.count / 3; n += t * (m.isInstancedMesh ? m.count : 1); }); return Math.round(n);
}

// =================================================================== SMALL SCATTER PIECES
const smallModel = (key, build, shadow) => { const g = instantiate(baked(key, (b) => { build(b); if (shadow) b.shadow(0, 0, shadow, 0.16); })); return g; };
function tuftClump(b, v) { const c = ['#56c84a', '#66d456', '#78dc5a', '#8ae862'][v % 4]; tuftInto(b, 0, 0, 0, 1.15, c, 4, 1); tuftInto(b, 0.05, 0, 0.03, 0.8, '#b4f27a', 2, 1); }
/** a clump of spiky grass blades (about 20 tris), sways in the wind shader. */
export function tuftModel(seed = 0) { return smallModel(`tuft:${Math.abs(seed | 0) % 4}`, (b) => tuftClump(b, Math.abs(seed | 0))); }
/** v0 pink-blossom shrub, v1 daisy shrub, v2 berry shrub. */
function bushInto(b, v, lod = 0) {
  const r = krng(v * 41 + 9), c = ['#62d652', '#6edc58', '#58cf5a'][v % 3], dark = col(c).clone().lerp(col('#38c29a'), 0.45), light = '#b4f27a', d = lod ? 0 : 1;
  b.lump(0.36, 0, 0.27, 0, c, { d: 1, seed: v, grad: 0.95, ao: 0.1, aoH: 0.3, s: [1.1, 0.85, 1], sw: 0.3, up: 0.4 });
  b.lump(0.27, -0.3, 0.2, 0.12, dark, { d, seed: v + 1, grad: 0.95, ao: 0.1, aoH: 0.3, sw: 0.3, up: 0.4 }); b.lump(0.26, 0.28, 0.2, -0.1, dark, { d, seed: v + 2, grad: 0.95, ao: 0.1, aoH: 0.3, sw: 0.3, up: 0.4 });
  b.lump(0.2, 0.0, 0.5, 0.0, light, { d: 0, grad: 0.8, ao: 0, sw: 0.3 });
  const pal = [['#ffb7d0', '#ff8fb5', '#ffffff'], ['#ffffff', '#ffe066', '#ffffff'], ['#8fb4ff', '#ff6f7f', '#ffd0e0']][v % 3];
  for (let i = 0; i < (lod ? 4 : 9); i++) { const a = i * 1.9 + r(), e = 0.1 + r() * 0.9; b.add(G.octa(), { p: [Math.cos(a) * 0.37 * Math.cos(e) * 1.1, 0.27 + Math.sin(e) * 0.31, Math.sin(a) * 0.37 * Math.cos(e)], s: v === 2 ? 0.05 : 0.055, c: pal[i % 3], grad: 0.2, ao: 0 }); }
}
/** a round shrub with pastel blossoms or berries. lod 1 is the cheap instanced version. */
export function bushModel(seed = 0, opts = {}) { const v = Math.abs(seed | 0) % 3, lod = opts.lod || 0; const g = smallModel(`bush:${v}:${lod}`, (b) => bushInto(b, v, lod), 0.6); g.rotation.y = hash(seed, 3) * TAU; return g; }
function flowerPatchInto(b, v, n = 6) {
  const r = krng(v * 17 + 4), pal = [[0, 1], [2, 5], [3, 0], [4, 2], [5, 1], [0, 3]][v % 6];
  b.lump(0.2, 0, 0.035, 0, '#70dc5a', { d: 0, s: [1.5, 0.35, 1.5], grad: 0.8, ao: 0.05, sw: 0.4 });
  for (let i = 0; i < n; i++) { const a = i * 1.26 + r() * 0.5, rr = 0.05 + r() * 0.2; flowerInto(b, Math.cos(a) * rr, 0.03, Math.sin(a) * rr, FLOWERS[pal[i % 2]], 1.1 + r() * 0.5, 0.15 + r() * 0.1, i % 3 === 0, (i + v) % 4); }
}
/** a patch of 6 pastel flowers (daisies, tulips, cosmos, bells) on a leaf mound */
export function flowerPatch(seed = 0) { return smallModel(`flowers:${Math.abs(seed | 0) % 6}`, (b) => flowerPatchInto(b, Math.abs(seed | 0))); }
/** a clump of three or four toadstools in pastel caps */
export function mushroomModel(seed = 0) { const v = Math.abs(seed | 0) % 4; return smallModel(`mush:${v}`, (b) => mushroomClump(b, v, true), 0.3); }
function stoneInto(b, v, lean) { const pal = STONES[v % 4]; b.rock(0.2, 0, 0.1, 0, pal[0], { d: lean ? 0 : 1, seed: v, s: [1.2, 0.8, 1], moss: { c: MOSS, amt: lean ? 0.55 : 0.85 }, ao: 0.12 }); if (!lean) { b.rock(0.11, 0.24, 0.05, 0.1, pal[1], { d: 0, seed: v + 3, s: [1, 0.8, 1] }); b.add(G.octa(), { m: 'gloss', p: [-0.05, 0.28, 0.02], s: [0.018, 0.045, 0.018], c: '#ffffff', grad: 0, ao: 0 }); flowerInto(b, 0.06, 0.2, -0.04, FLOWERS[v % 6], 0.8, 0.08, false, 0); } }
/** a round pastel stone (cream, blue-grey, sand or rose) with a moss cap, sparkle and a tiny flower */
export function stoneModel(seed = 0) { const v = Math.abs(seed | 0) % 4; return smallModel(`stone:${v}`, (b) => stoneInto(b, v, false), 0.4); }
/** a white picket fence segment of length len along X (centred), ~0.65 tall: round-tipped pickets, painted posts with candy caps, pastel rails */
export function fenceModel(len = 2, opts = {}) {
  const n = Math.max(1, Math.round(len / 1.0)), step = len / n, c = opts.color || '#fffaf0', cap = opts.cap || '#ff9ec4', np = Math.round(len * 2.6);
  return smallModel(`fence:${len.toFixed(2)}:${c}:${cap}`, (b) => {
    for (let i = 0; i < np; i++) { const x = -len / 2 + (i + 0.5) * len / np, h = 0.5 + 0.03 * Math.sin(i * 2.1); b.plain(0.1, h, 0.04, x, 0, 0.0, c, { grad: 0.4, ao: 0.1 }); b.add(G.octa(), { p: [x, h + 0.02, 0], s: [0.055, 0.07, 0.03], c, grad: 0.2, ao: 0 }); }
    for (const y of [0.14, 0.33]) b.box(len, 0.07, 0.05, 0, y, 0.04, '#ffe9c6', { grad: 0.4, ao: 0.1 });
    for (let i = 0; i <= n; i++) { const x = -len / 2 + i * step; b.box(0.12, 0.6, 0.12, x, 0, 0, '#fff4e0', { grad: 0.5, ao: 0.12 }); b.lump(0.085, x, 0.65, 0, cap, { d: 0, grad: 0.4, ao: 0 }); }
  });
}
/** a path ribbon through points ([x,z] | {x,z} | Vector3). opts: width (0.9), color, stepping (true = round cream stepping stones in the grass). Lies on y=0 (raised 0.02 to 0.05). */
export function pathModel(points, opts = {}) {
  const w = opts.width || 0.9, pts = points.map((p) => (Array.isArray(p) ? new THREE.Vector3(p[0], 0, p[1]) : new THREE.Vector3(p.x, 0, p.z)));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), len = curve.getLength();
  if (opts.stepping) {   // stepping stones: staggered round pastel stones with a clover between
    const b = new Builder(0), N = Math.max(2, Math.round(len / 0.78)), pal = ['#fff3d2', '#e8f2fb', '#ffe6c2', '#ffe3ea'];
    for (let i = 0; i < N; i++) { const t = (i + 0.5) / N, p = curve.getPointAt(t), d = curve.getTangentAt(t), off = (i % 2 ? 1 : -1) * 0.09 * w, rad = 0.27 * w * (0.9 + 0.2 * hash(i, 3)); b.lump(rad, p.x - d.z * off, 0.045, p.z + d.x * off, pal[i % 4], { d: 1, s: [1.1, 0.24, 1], jit: 0.06, grad: 0.5, ao: 0.1, seed: i, r: [0, hash(i, 5) * 6, 0] });
      if (i % 3 === 1) cloverInto(b, p.x + d.z * 0.5 * w, 0, p.z - d.x * 0.5 * w, 0.9); }
    const out = instantiate(b.bake(), {}); out.children.forEach((m) => { m.castShadow = false; }); return out;
  }
  const N = Math.max(4, Math.ceil(len / 0.5));
  const mid = col(opts.color || '#fbe9b4'), edge = col(opts.edge || '#f0d792'), rim = col('#a6e66c'), rings = [], prof = [[-1, 0, rim], [-0.82, 0.03, edge], [-0.45, 0.05, mid], [0, 0.055, mid], [0.45, 0.05, mid], [0.82, 0.03, edge], [1, 0, rim]];
  for (let i = 0; i <= N; i++) {
    const t = i / N, p = curve.getPointAt(t), d = curve.getTangentAt(t), nx = -d.z, nz = d.x, ww = w * 0.5 * (1 + 0.14 * Math.sin(i * 1.3) + 0.08 * Math.sin(i * 2.9 + 1)) * (t < 0.04 || t > 0.96 ? 0.75 : 1), v = 0.97 + 0.04 * hash(i, 1);
    rings.push(prof.map(([u, y, c]) => ({ x: p.x + nx * u * ww * (u === 1 || u === -1 ? 1.15 : 1), y, z: p.z + nz * u * ww * (u === 1 || u === -1 ? 1.15 : 1), c: c.clone().multiplyScalar(v) })));
  }
  const g = sweepGeo(rings, { orient: 'up' });
  const b = new Builder(0); b.geo(g, 'matte', { ao: 0 }); const out = instantiate(b.bake(), {}); out.children.forEach((m) => { m.castShadow = false; }); return out;
}

// =================================================================== INSTANCING HELPERS
/** InstancedMesh from a baked entry (geometry shared) and items [{x,y,z,s,yaw}] */
function instancedFrom(e, items, { cast = true, tint = 0.07, seed = 1 } = {}) {
  if (!items.length || !e.matte) return null;
  const im = new THREE.InstancedMesh(e.matte, envMat, items.length), m = new THREE.Matrix4(), c = new THREE.Color(), r = krng(seed * 7 + items.length);
  items.forEach((it, i) => { m.compose(new THREE.Vector3(it.x, it.y || 0, it.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, it.yaw || 0, 0)), new THREE.Vector3().setScalar(it.s || 1)); im.setMatrixAt(i, m); const j = 1 + (r() - 0.5) * 2 * tint, t = it.tint || [1, 1, 1]; c.setRGB(t[0] * j, t[1] * (1 + (r() - 0.5) * 2 * tint * 0.7), t[2] * (1 + (r() - 0.5) * 2 * tint)); im.setColorAt(i, c); });
  im.instanceMatrix.needsUpdate = true; im.castShadow = cast; im.receiveShadow = true; im.onBeforeRender = windTick; im.frustumCulled = false; return im;
}
const slotOrigin = (i) => { const o = simSlot(i); return [o.ox, o.oz]; };
const FIELD_ANG = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
/** default no-go zones for decoration: plaza, the four valley fields, the 16 village plots */
export function isFree(x, z, pad = 0) {
  const r = Math.hypot(x, z); if (r < 10.8 + pad) return false;
  for (const a of FIELD_ANG) if (Math.hypot(x - Math.cos(a) * 13, z - Math.sin(a) * 13) < 4.7 + pad) return false;
  for (let i = 0; i < 16; i++) { const [ox, oz] = slotOrigin(i); if (Math.abs(x - ox) < 9.2 + pad && Math.abs(z - oz) < 9.2 + pad) return false; }
  for (const [kx, kz, kr] of KEEP) if (Math.hypot(x - kx, z - kz) < kr + pad) return false;
  if (pathCover(x, z) > 0.12) return false;
  return true;
}

// =================================================================== 2. VALLEY FIELDS
const FY = 0.1;   // top of every field/plaza base
/** round dressed ground disc: top at FY, soft lip, dark earth skirt. colorFn(x,z) -> colour */
function fieldBase(b, R, colorFn, { rows = 9, segs = 56, carve } = {}) {
  const rr = []; for (let i = 0; i < rows; i++) rr.push(R * (i / (rows - 1)) * (i === rows - 1 ? 0.95 : 1));
  const skirt = col('#e0b684'), R0 = rows - 1;
  const mk = (r, y, c) => ({ r, y, c });
  const R_ = [];
  for (let i = 0; i < rows; i++) { const r = R * Math.min(1, (i / (rows - 1)) * 1.0) * 0.95; R_.push({ r, y: (x, z) => FY + (carve ? carve(x, z) : 0), c: colorFn }); }
  R_.push({ r: R * 1.0, y: FY - 0.005, c: (x, z) => colorFn(x, z).clone().multiplyScalar(0.97) });
  R_.push({ r: R * 1.04, y: FY - 0.045, c: () => skirt.clone().lerp(col('#f6d7a2'), 0.5) });
  R_.push({ r: R * 1.04, y: 0, c: () => skirt });
  const wob = (th, i) => 1 + (0.035 * Math.sin(th * 3 + 1) + 0.02 * Math.sin(th * 7 + 2)) * Math.min(1, i / (rows - 1));
  b.geo(polarGeo(R_, segs, { wob, nUp: 0.15 }), 'matte', { ao: 0, ground: 3 });
}
const dirtPath = (x, z, t = 1) => { const px = 0.22 * Math.sin(z * 1.1); const d = Math.abs(x - px); return z > 0.4 ? t * (1 - sstep(0.42, 0.7, d + (fbm(x * 3, z * 3) - 0.5) * 0.25)) : 0; };

/** flower meadow: n patches of flowers (3 stems) and clover on the ring rmin..rmax, skipping the path (skip(x,z) true = leave empty). Lives in the wind-driven group. */
function meadow(b, seed, n, rmin, rmax, skip, y = FY) {
  const r = krng(seed); let made = 0, g = 0;
  while (made < n && g++ < n * 12) { const a = r() * TAU, rr = rmin + r() * (rmax - rmin), x = Math.cos(a) * rr, z = Math.sin(a) * rr; if (skip && skip(x, z)) continue; made++;
    const pal = [[0, 1], [2, 5], [3, 0], [4, 2], [1, 5]][made % 5]; for (let k = 0; k < 3; k++) flowerInto(b, x + (r() - 0.5) * 0.3, y, z + (r() - 0.5) * 0.3, FLOWERS[pal[k % 2]], 1.1 + r() * 0.3, 0.16 + r() * 0.08, k === 0, (made + k) % 4);
    if (made % 3 === 0) cloverInto(b, x + 0.2, y, z + 0.1, 1); }
}
const offPath = (x, z) => Math.abs(x - 0.22 * Math.sin(z * 1.1)) < 0.85 && z > 0.2;
function treeFieldStatic(b) {
  const A = col('#b2ee76'), B = col('#92dd5e'), litter = col('#f4d88e'), dirt = col('#f8e3b0');
  fieldBase(b, 3.6, (x, z) => {
    let c = paint(x, z, A, B, 0.6); const dd = Math.hypot(x, z - 0.45), cl = sstep(1.5, 1.0, dd + (fbm(x * 2, z * 2) - 0.5) * 0.6);
    c = c.lerp(litter, sstep(0.62, 0.8, fbm(x * 1.4 + 3, z * 1.4)) * 0.45); c.lerp(dirt, cl * 0.95); c.lerp(dirt, dirtPath(x, z) * 0.95); return c;
  });
  b.shadow(0, 0, 4.1, 0.18, 1, 1, 0.0);
  // logging area in the clearing
  b.xf(-0.55, FY, 0.2, 1, 0.4, () => stumpInto(b, true)); b.shadow(-0.55, 0.2, 0.55, 0.28, 1, 1, 0.01);
  b.xf(0.55, FY, 0.75, 1, 1.2, () => stumpInto(b, false));
  // axe stuck in the big stump
  b.cyl(0.022, 0.026, 0.55, -0.55, FY + 0.34 * 1.25, 0.2, WOOD, { seg: 5, r: [0.2, 0.5, 0.35], ao: 0 }); b.box(0.2, 0.11, 0.03, -0.66, FY + 0.34 * 1.25 + 0.38, 0.2, '#d6e4f0', { r: [0.2, 0.5, 0.35], ao: 0, grad: 0.6 });
  // log pile + a fallen log
  logInto(b, -1.45, FY, 1.6, 1.0, 0.15, 0.2, '#e8a870'); logInto(b, -1.4, FY, 1.9, 1.0, 0.15, 0.1, '#f0b07a'); logInto(b, -1.43, FY + 0.22, 1.75, 1.0, 0.14, 0.15, '#dc9a64');
  logInto(b, 1.4, FY, -0.2, 1.3, 0.16, 2.1, '#d9a068'); b.shadow(-1.4, 1.75, 0.8, 0.25, 1.2, 0.8, 0.01);
  // signpost at the path start
  b.cyl(0.04, 0.05, 0.85, 0.9, FY, 2.95, WOOD_D, { seg: 6 }); b.box(0.5, 0.17, 0.05, 0.9, FY + 0.5, 2.97, P.woodLight, { r: [0, -0.2, 0.03], grad: 0.5, ao: 0 }); b.box(0.3, 0.13, 0.05, 0.88, FY + 0.7, 2.93, P.woodLight, { r: [0, 0.3, -0.04], grad: 0.5, ao: 0 });
  [[-1.9, 0.6, 1.1], [2.4, 1.2, 0.9], [1.1, -1.9, 1.2]].forEach(([x, z, s], i) => b.xf(x, FY, z, s, i, () => mushroomClump(b, i, true)));
  [[-2.7, 1.5, 1, 0], [-0.4, -2.9, 1.2, 1], [2.6, -1.6, 1, 2]].forEach(([x, z, s, v]) => b.xf(x, FY, z, s, x, () => bushInto(b, v, 1)));
}
function treeFieldSway(b) { const r = krng(5); for (let i = 0; i < 18; i++) { const a = r() * TAU, rr = 0.8 + r() * 2.7; const x = Math.cos(a) * rr, z = Math.sin(a) * rr; if (Math.abs(x) < 0.7 && z > 0.4) continue; tuftInto(b, x, FY, z, 1.1 + r() * 0.5, r() < 0.5 ? '#5fcf4e' : '#74d95a', 5, 1); }
  meadow(b, 55, 9, 1.6, 3.3, (x, z) => offPath(x, z) || Math.hypot(x, z - 0.45) < 1.3); }
function treeFieldStuff(b) {
  const r = krng(11), placed = [], SP = ['oak', 'blossom', 'apple', 'orange', 'oak', 'peach', 'birch', 'blossom', 'pine', 'apple', 'oak'];
  let guard = 0; while (placed.length < 11 && guard++ < 400) {
    const a = r() * TAU, rr = 1.6 + r() * 1.75, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (Math.hypot(x, z - 0.45) < 1.35 || Math.hypot(x + 1.43, z - 1.75) < 1.35 || Math.hypot(x - 1.4, z + 0.2) < 1.15 || Math.hypot(x - 0.9, z - 2.95) < 0.8) continue; if (Math.abs(x - 0.22 * Math.sin(z * 1.1)) < 0.85 && z > 0.2) continue; if (placed.some((p) => Math.hypot(p[0] - x, p[1] - z) < 0.98)) continue;
    placed.push([x, z]);
  }
  placed.forEach(([x, z], i) => { const sp = SP[i % SP.length], v = i % 3, s = 0.82 + 0.28 * r(); b.xf(x, FY, z, s, r() * TAU, () => { treeInto(b, sp, v, i % 6 === 0 ? 0 : 1); }); b.shadow(x, z, SHADOW_R[sp] * s, 0.22, 1, 1, 0.01); });
}

// ---- Riverbank Clay
const RIVER = new THREE.CatmullRomCurve3([[-3.6, 0, -0.9], [-2.7, 0, -2.0], [-1.3, 0, -2.75], [0.3, 0, -2.9], [1.9, 0, -2.45], [3.0, 0, -1.6], [3.6, 0, -0.55]].map((p) => new THREE.Vector3(...p)));
const RIVER_PTS = RIVER.getSpacedPoints(40);
const riverW = (t) => 0.1 + 0.5 * Math.sin(Math.PI * t) ** 0.7;
function riverDist(x, z) { let best = 9, bt = 0; for (let i = 0; i < RIVER_PTS.length; i++) { const d = Math.hypot(RIVER_PTS[i].x - x, RIVER_PTS[i].z - z); if (d < best) { best = d; bt = i / (RIVER_PTS.length - 1); } } return best - riverW(bt); }
function clayFieldStatic(b) {
  const sand = col('#f8e6b4'), mud = col('#e2b27c'), wet = col('#d29c64'), tan = col('#f0cb92'), path = col('#fcefc4');
  fieldBase(b, 3.6, (x, z) => {
    const rd = riverDist(x, z); let c = paint(x, z, tan, '#e8b67e', 0.7); c.lerp(sand, sstep(0.9, 0.35, rd) * 0.8); c.lerp(wet, sstep(0.3, 0.0, rd)); c.lerp(path, dirtPath(x, z) * 0.7);
    const pd = Math.hypot(x - 0.05, z - 0.3); c.lerp(wet, sstep(1.9, 1.5, pd) * 0.5); return c;
  }, { rows: 10, segs: 56, carve: (x, z) => -0.07 * (1 - sstep(-0.1, 0.5, riverDist(x, z))) });
  // river water
  const rings = []; const N = 24;
  for (let i = 0; i <= N; i++) { const t = i / N, p = RIVER.getPointAt(t), d = RIVER.getTangentAt(t), w = riverW(t) * 1.02; const nx = -d.z, nz = d.x, y = FY - 0.045; rings.push([[-1, '#b4f6ee'], [-0.5, '#86e6ee'], [0, '#5fd4ee'], [0.5, '#86e6ee'], [1, '#b4f6ee']].map(([u, c]) => ({ x: p.x + nx * u * w, y: y + (u === 0 ? 0 : 0.004), z: p.z + nz * u * w, c }))); }
  b.geo(sweepGeo(rings, { orient: 'up' }), 'water', { ao: 0 });
  // plank bridge across the river
  { const t = 0.5, p = RIVER.getPointAt(t), d = RIVER.getTangentAt(t), yaw = Math.atan2(-d.z, d.x); b.xf(p.x, FY - 0.05, p.z, 1, yaw, () => { for (let i = 0; i < 6; i++) b.box(0.26, 0.05, 1.5, -0.65 + i * 0.26, 0.0, 0, i % 2 ? '#f0bf86' : '#f8d29c', { r: [0, hash(i, 2) * 0.06 - 0.03, 0], grad: 0.5, ao: 0.1 }); for (const z of [-0.74, 0.74]) { b.box(1.7, 0.05, 0.06, 0, 0.1, z, WOOD_D, { ao: 0 }); } }); }
  // the pit: raised earthen rim + wet clay inside + a puddle
  b.xf(0.1, FY, 0.3, 1, 0, () => {
    b.add(G.lathe([[1.62, -0.02], [1.5, 0.08], [1.32, 0.2], [1.14, 0.2], [0.98, 0.1], [0.9, 0.04], [0.0, 0.04]], 20), { c: '#f0b685', grad: 0.8, ao: 0.16, aoH: 0.25, facet: 0.03, seed: 3 });
    b.lump(0.96, 0, 0.05, 0, '#f58a56', { m: 'gloss', d: 2, s: [1, 0.05, 1], jit: 0.03, grad: 0.9, ao: 0 }); b.lump(0.5, 0.25, 0.085, -0.1, '#6fe0f0', { m: 'water', d: 1, s: [1.1, 0.03, 0.9], jit: 0.08, grad: 0.5, ao: 0 });
    b.shadow(0, 0, 1.9, 0.2, 1, 1, 0.0);
  });
  // shovels in the rim, a bucket, a wheelbarrow of clay
  for (const [x, z, a] of [[-0.9, 1.3, 0.3], [1.5, 0.9, -0.5]]) { b.cyl(0.02, 0.025, 0.85, x, FY + 0.1, z, WOOD, { seg: 5, r: [0.15, a, 0.3], ao: 0 }); b.box(0.15, 0.2, 0.03, x + 0.03, FY + 0.08, z - 0.02, '#d6e4f0', { r: [0.15, a, 0.3], ao: 0, grad: 0.6 }); }
  b.xf(1.5, FY, 2.0, 1, 0.5, () => { b.cyl(0.17, 0.13, 0.26, 0, 0, 0, '#e8a870', { seg: 8 }); b.cyl(0.14, 0.14, 0.02, 0, 0.255, 0, '#b8814f', { seg: 8, ao: 0 }); });
  b.xf(-1.9, FY, 1.55, 1, 0.9, () => {
    b.box(0.9, 0.2, 0.55, 0, 0.3, 0, '#b98a52', { r: [0, 0, 0.05], grad: 0.6 }); b.lump(0.3, 0, 0.47, 0, '#f58e5a', { m: 'gloss', d: 1, s: [1.4, 0.6, 1.0], jit: 0.1, ao: 0 });
    b.add(G.cyl(1, 12), { p: [0.52, 0.2, -0.13], s: [0.2, 0.06, 0.2], r: [0, 0, Math.PI / 2], c: '#c08a5a', grad: 0.4 }); b.add(G.cyl(1, 12), { p: [0.52, 0.2, 0.13], s: [0.2, 0.06, 0.2], r: [0, 0, Math.PI / 2], c: '#c08a5a', grad: 0.4 });
    for (const z of [-0.2, 0.2]) b.cyl(0.02, 0.025, 0.9, -0.3, 0.3, z, WOOD, { seg: 5, r: [0, 0, 1.2], ao: 0 });
    b.shadow(0, 0, 0.7, 0.25, 1.1, 0.7, 0.01);
  });
  for (const [x, z] of [[-2.3, 0.3], [2.4, 0.7], [-0.6, 2.7], [2.1, 2.3], [-1.6, -1.2]]) { b.rock(0.12 + hash(x, z) * 0.08, x, FY + 0.05, z, '#f2e8d2', { d: 0, seed: x * 3, s: [1.2, 0.8, 1] }); }
  for (const [x, z, v] of [[-1.6, 2.6, 0], [1.0, -1.3, 1]]) b.xf(x, FY, z, 1, x, () => bushInto(b, v, 1));
}
function claySway(b) {
  const r = krng(17);
  for (let k = 0; k < 7; k++) { const t = 0.12 + 0.76 * (k / 6) + (r() - 0.5) * 0.04, p = RIVER.getPointAt(t), d = RIVER.getTangentAt(t), side = k % 2 ? 1 : -1, w = riverW(t); const cx = p.x + -d.z * (w + 0.18) * side * -1, cz = p.z + d.x * (w + 0.18) * side * -1; if (Math.hypot(cx, cz) > 3.3) continue;
    for (let i = 0; i < 7; i++) { const x = cx + (r() - 0.5) * 0.35, z = cz + (r() - 0.5) * 0.35, h = 0.55 + r() * 0.45, lean = (r() - 0.5) * 0.35; b.add(G.cyl(0, 3, true), { p: [x, FY, z], s: [0.028, h, 0.028], r: [lean, r() * TAU, 0], c: '#8fe05a', grad: 0.9, ao: 0, sw: 1.1 }); if (i % 3 === 0) b.lump(0.035, x + lean * h * 0.9, FY + h * 0.95, z, '#e0a468', { d: 0, s: [1, 2.6, 1], grad: 0.4, ao: 0, sw: 1.1 }); } }
  for (let i = 0; i < 10; i++) { const a = r() * TAU, rr = 1.9 + r() * 1.4, x = Math.cos(a) * rr, z = Math.sin(a) * rr; if (riverDist(x, z) < 0.4 || Math.hypot(x - 0.1, z - 0.3) < 1.7 || (Math.abs(x) < 0.7 && z > 0.4)) continue; tuftInto(b, x, FY, z, 0.9, '#7fdc5a', 5, 1); }
  meadow(b, 61, 7, 1.9, 3.3, (x, z) => riverDist(x, z) < 0.5 || Math.hypot(x - 0.1, z - 0.3) < 1.7 || offPath(x, z)); }
function clayFieldStuff(b) {
  const r = krng(23), mounds = [[0.1, 0.3, 1.3, 0.0, 0.34], [0.1, 0.3, 1.2, 1.1, 0.3], [0.1, 0.3, 1.35, 2.3, 0.3], [0.1, 0.3, 1.25, 3.4, 0.26], [0.1, 0.3, 1.4, 4.4, 0.32], [0.1, 0.3, 1.3, 5.4, 0.28]];
  for (const [cx, cz, rr, a, s] of mounds) { const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr; if (Math.abs(x) < 0.6 && z > 1.5) continue; b.lump(s, x, FY + s * 0.4, z, '#f58a56', { m: 'gloss', d: 1, s: [1.2, 0.72, 1.05], jit: 0.12, seed: a * 3, grad: 0.7, ao: 0.08 }); b.lump(s * 0.45, x - 0.05, FY + s * 0.78, z - 0.04, '#ffb184', { m: 'gloss', d: 0, s: [1.2, 0.7, 1], ao: 0 }); b.shadow(x, z, s * 1.5, 0.18, 1, 1, 0.01); }
  // stack of fired clay bricks beside the pit
  b.xf(-1.9, FY, -0.4, 1, 0.3, () => { for (let i = 0; i < 6; i++) b.box(0.4, 0.14, 0.2, ((i % 3) - 1) * 0.43, Math.floor(i / 3) * 0.14, 0, i % 2 ? '#ff9a66' : '#f58a56', { m: 'gloss', grad: 0.5 }); b.shadow(0, 0, 0.9, 0.22, 1.2, 0.6, 0.01); });
  b.xf(1.7, FY, -0.9, 1, -0.4, () => { for (let i = 0; i < 3; i++) b.box(0.36, 0.13, 0.18, (i - 1) * 0.4, 0, 0, '#f58a56', { m: 'gloss', grad: 0.5 }); b.box(0.36, 0.13, 0.18, 0, 0.13, 0, '#ff9a66', { m: 'gloss', grad: 0.5 }); });
}

// ---- Granite Quarry
function quarryColor(x, z) {
  let c = paint(x, z, '#f8dfa8', '#f0d194', 0.9); c.lerp(col('#ffd7a8'), sstep(0.6, 0.75, fbm(x * 1.2 + 4, z * 1.2)) * 0.5); c.lerp(col('#b8ec86'), sstep(0.45, 0.8, fbm(x * 0.8 + 9, z * 0.8 + 2)) * 0.5); c.lerp(col('#fff0c4'), dirtPath(x, z) * 0.85); return c;
}
function ledgeInto(b, rIn, rOut, h, a0, a1, seed) {
  const r = krng(seed), step = 0.24, n = Math.max(2, Math.round((a1 - a0) / step)), rings = [], cut = new Set(); const stone = ['#ffe2b0', '#ffd6a0', '#fff0cc', '#f6d0c8'];
  for (let j = 0; j < n; j++) {
    const aa = a0 + (a1 - a0) * j / n, bb = a0 + (a1 - a0) * (j + 1) / n, jr = (r() - 0.5) * 0.12, jh = (r() - 0.5) * 0.07, c0 = col(stone[Math.floor(r() * 4)]);
    for (const [a, k] of [[aa + 0.006, 0.84], [(aa + bb) / 2, 1], [bb - 0.006, 0.84]]) {
      const ri = rIn + jr, ro = rOut, hh = h + jh, cc = (m) => c0.clone().multiplyScalar(m * k);
      const pr = [[ri, 0, cc(0.8)], [ri, hh - 0.07, cc(0.95)], [ri + 0.06, hh, cc(1.12)], [ro, hh + 0.01, cc(1.14)], [ro, 0, cc(0.8)]];
      rings.push(pr.map(([rad, y, c]) => ({ x: Math.cos(a) * rad, y: FY + y, z: Math.sin(a) * rad, c })));
    }
  }
  const g = sweepGeo(rings, { orient: 'up' });
  b.geo(g, 'matte', { ao: 0.3, aoH: 0.3 });
}
function rockFieldStatic(b) {
  fieldBase(b, 3.6, quarryColor, { rows: 9 });
  const D = Math.PI / 180;
  ledgeInto(b, 2.0, 2.65, 0.4, 205 * D, 335 * D, 1); ledgeInto(b, 2.65, 3.2, 0.78, 195 * D, 345 * D, 2); ledgeInto(b, 3.2, 3.56, 1.16, 185 * D, 355 * D, 3);
  for (const [a, rr, h, s] of [[205, 2.35, 0.4, 0.38], [335, 2.35, 0.4, 0.38], [195, 2.95, 0.78, 0.42], [345, 2.95, 0.78, 0.42], [185, 3.38, 1.16, 0.32], [355, 3.38, 1.16, 0.32]]) b.rock(s, Math.cos(a * D) * rr, FY + s * 0.4, Math.sin(a * D) * rr, ['#fff0cc', '#d8e8f8', '#ffdcb0'][a % 3], { d: 1, seed: a, s: [1.1, 0.9, 1.1], ao: 0.1, moss: { c: MOSS, amt: 0.8 } });
  b.shadow(0, -2.4, 2.2, 0.16, 1.5, 0.7, 0.0);
  // moss and grass on the top ledge
  for (let i = 0; i < 7; i++) { const a = (192 + 156 * hash(i, 1)) * D; tuftInto(b, Math.cos(a) * 3.38, FY + 1.17, Math.sin(a) * 3.38, 1.1, '#7fd45a', 5, 0.8); flowerInto(b, Math.cos(a) * 3.38 + 0.12, FY + 1.17, Math.sin(a) * 3.38, FLOWERS[i % 6], 1.1, 0.16); }
  // cut stone blocks stacked near the path, a barrel, a pickaxe in a block
  b.xf(1.5, FY, 1.2, 1, 0.5, () => { b.box(0.7, 0.32, 0.45, 0, 0, 0, '#f6ecd6', { grad: 0.8, facet: 0.03 }); b.box(0.7, 0.32, 0.45, 0.02, 0.32, 0, '#ece2cc', { r: [0, 0.1, 0], grad: 0.8 }); b.box(0.5, 0.28, 0.4, 0.8, 0, 0.1, '#f2e8d2', { r: [0, -0.2, 0], grad: 0.8 }); b.shadow(0.3, 0, 0.9, 0.25, 1.2, 0.7, 0.01);
    b.cyl(0.02, 0.025, 0.55, 0.0, 0.62, 0.0, WOOD, { seg: 5, r: [0, 0, 0.9], ao: 0 }); b.box(0.36, 0.05, 0.05, -0.2, 0.9, 0, '#a9b8c9', { r: [0, 0, 0.9], ao: 0, grad: 0.5 }); });
  b.xf(-1.4, FY, 1.4, 1, 0, () => { b.add(G.lathe([[0.2, 0], [0.24, 0.12], [0.25, 0.27], [0.24, 0.42], [0.2, 0.46]], 10), { c: '#e8a870', grad: 0.6 }); b.add(G.lathe([[0.2, 0.46], [0.22, 0.2]], 10), { c: '#e8a870' }); for (const y of [0.1, 0.36]) b.cyl(0.255, 0.255, 0.035, 0, y, 0, '#7fd0c4', { seg: 10, ao: 0 }); b.shadow(0, 0, 0.4, 0.25); });
  // crane mast + boom (static part)
  b.xf(CRANE[0], FY, CRANE[1], 1, CRANE_YAW, () => craneStatic(b));
  // lantern post at the path start
  b.cyl(0.04, 0.05, 1.0, -0.95, FY, 3.0, '#b08860', { seg: 6 }); b.box(0.2, 0.22, 0.2, -0.95, FY + 1.0, 3.0, '#ffe08a', { m: 'lantern', ao: 0 }); b.cyl(0.0, 0.17, 0.12, -0.95, FY + 1.22, 3.0, '#b08860', { seg: 6, ao: 0 });
  for (const [x, z] of [[-2.2, 0.0], [2.5, 0.3], [-0.2, 1.9], [0.3, -1.2], [2.2, -0.6], [-1.0, -1.7]]) b.rock(0.08 + hash(x, z) * 0.07, x, FY + 0.04, z, '#f2e8d2', { d: 0, seed: x * 3, s: [1.2, 0.8, 1] });
}
const CRANE = [1.3, -1.0], CRANE_YAW = Math.atan2(-1.5, -1.3);
function craneStatic(b) {
  const wd = '#e8a870';
  b.cyl(0.1, 0.13, 2.5, 0, 0, 0, wd, { seg: 7, grad: 0.7 }); b.lump(0.15, 0, 2.55, 0, '#b8814f', { d: 0, s: [1, 0.7, 1], ao: 0 });
  for (const z of [-0.5, 0.5]) b.cyl(0.055, 0.07, 2.2, 0, 0, z, wd, { seg: 6, r: [z > 0 ? -0.2 : 0.2, 0, 0], ao: 0.3 });
  b.cyl(0.07, 0.085, 2.2, -0.04, 2.3, 0, wd, { seg: 6, r: [0, 0, -1.43], grad: 0.7, ao: 0 });   // boom pointing +x, slightly raised
  b.cyl(0.04, 0.05, 1.5, 0.0, 1.6, 0, wd, { seg: 5, r: [0, 0, -0.78], ao: 0 });       // brace
  b.box(1.0, 0.05, 1.0, 0, 0, 0, '#f0e6d0', { ao: 0 });
}
function craneHoist(b) {
  b.cyl(0.012, 0.012, 1.2, 0, -1.2, 0, '#d8c8a0', { seg: 4, ao: 0, grad: 0.2 }); b.box(0.34, 0.3, 0.34, 0, -1.5, 0, '#f6ecd6', { grad: 0.8, ao: 0, facet: 0.04 });
  b.cyl(0.02, 0.02, 0.1, 0, -0.1, 0, '#a9b8c9', { seg: 5, ao: 0 });
}
function rockFieldStuff(b) {
  const spots = [[1.35, 0.7, 0.8], [-1.2, -0.1, 0.95], [-0.4, -1.2, 0.8], [0.4, 1.3, 0.6]];
  spots.forEach(([x, z, s], i) => { b.xf(x, FY, z, s * 1.15, i * 1.9, () => boulderCluster(b, i + 1, 1)); b.shadow(x, z, s * 1.2, 0.3, 1.1, 1, 0.01); });
}
function rockFieldSway(b) { const r = krng(3); for (let i = 0; i < 12; i++) { const a = r() * TAU, rr = 0.5 + r() * 2.9, x = Math.cos(a) * rr, z = Math.sin(a) * rr; if (Math.abs(x) < 0.6 && z > 0.4) continue; if (z < -1.6 && Math.abs(x) < 2.6) continue; tuftInto(b, x, FY, z, 0.9, '#8fe064', 4, 1); }
  meadow(b, 71, 8, 0.8, 3.4, (x, z) => (z < -1.4 && Math.abs(x) < 2.8) || offPath(x, z) || Math.hypot(x - 1.5, z - 1.2) < 1.0 || Math.hypot(x + 1.4, z - 1.4) < 0.7); }

// ---- Golden Meadow
const COLS_X = [-2.6, -2.1, -1.6, -1.1, -0.7, 0.7, 1.1, 1.6, 2.1, 2.6];
function wheatFieldStatic(b) {
  const soil = col('#ffd86a'), furrow = col('#f4bf58'), straw = col('#fff2b4'), edge = col('#b6ec68');
  fieldBase(b, 3.6, (x, z) => {
    const r = Math.hypot(x, z); let c = paint(x, z, '#ffe27a', '#fbd566', 0.8); const stripe = 0.5 + 0.5 * Math.cos(x * TAU / 0.45); c.lerp(furrow, stripe * 0.4 * (1 - sstep(2.8, 3.3, r)));
    c.lerp(straw, (1 - sstep(0.4, 0.75, Math.abs(x))) * 0.9 * sstep(-1.7, -0.5, z) + 0); c.lerp(edge, sstep(2.95, 3.35, r + (fbm(x * 2, z * 2) - 0.5) * 0.4)); c.lerp(col('#f8cb68'), sstep(1.0, 0.7, Math.hypot(x, z + 1.45)) * 0.8); return c;
  });
  // scarecrow in the middle-back
  b.xf(0, FY, -1.45, 1, 0.2, () => {
    b.cyl(0.04, 0.055, 1.55, 0, 0, 0, WOOD_D, { seg: 6 }); b.cyl(0.03, 0.03, 1.2, -0.6, 1.0, 0, WOOD, { seg: 5, r: [0, 0, Math.PI / 2], ao: 0 });
    b.lump(0.3, 0, 0.92, 0, '#e8564a', { d: 1, s: [1, 1.15, 0.8], jit: 0.04, grad: 0.7, ao: 0 }); b.box(0.2, 0.2, 0.012, 0.06, 0.82, 0.215, '#4a90e0', { ao: 0, grad: 0 }); b.box(0.16, 0.16, 0.012, -0.1, 1.0, 0.2, '#f2d36b', { ao: 0, grad: 0 });
    for (const sx of [-1, 1]) { b.lump(0.14, sx * 0.62, 1.0, 0, '#e8564a', { d: 0, s: [1.2, 0.8, 0.8], ao: 0 }); for (let i = 0; i < 4; i++) b.add(G.cyl(0, 3, true), { p: [sx * 0.68, 1.0, (i - 1.5) * 0.04], s: [0.012, 0.18, 0.012], r: [0, 0, -sx * (1.0 + i * 0.12)], c: '#e8c34a', grad: 0.5, ao: 0 }); }
    b.lump(0.2, 0, 1.52, 0, '#e8d5a8', { d: 1, jit: 0.04, grad: 0.7, ao: 0 }); b.lump(0.03, -0.07, 1.55, 0.18, '#3a2a20', { d: 0, grad: 0, ao: 0 }); b.lump(0.03, 0.07, 1.55, 0.18, '#3a2a20', { d: 0, grad: 0, ao: 0 }); b.cyl(0.0, 0.2, 0.01, 0, 1.43, 0.2, '#3a2a20', { seg: 3, ao: 0 });
    b.cyl(0.4, 0.4, 0.04, 0, 1.64, 0, '#d9a84a', { seg: 12, ao: 0, grad: 0.5 }); b.cyl(0.14, 0.22, 0.22, 0, 1.66, 0, '#d9a84a', { seg: 10, ao: 0, grad: 0.7 }); b.cyl(0.222, 0.222, 0.05, 0, 1.68, 0, '#c04a3a', { seg: 10, ao: 0 });
    // a crow on the shoulder
    b.lump(0.07, 0.62, 1.12, 0, '#8fb4ff', { d: 0, s: [1, 0.8, 1.4], grad: 0.5, ao: 0 }); b.lump(0.045, 0.62, 1.2, 0.07, '#8fb4ff', { d: 0, grad: 0.3, ao: 0 }); b.cyl(0.0, 0.015, 0.05, 0.62, 1.2, 0.12, '#f2b632', { seg: 3, r: [Math.PI / 2, 0, 0], ao: 0 });
    b.shadow(0, 0, 0.7, 0.28, 1, 1, 0.01);
  });
  // hay bales and a pitchfork
  for (const [x, z, y, yaw] of [[2.55, 1.35, 0, 0.5], [2.1, 1.85, 0, 0.9], [2.4, 1.55, 0.62, 0.65]]) logInto(b, x, FY + y, z, 0.62, 0.34, yaw, '#ffd966');
  b.shadow(2.35, 1.6, 1.2, 0.25, 1.2, 1, 0.01);
  b.cyl(0.015, 0.02, 0.95, -2.5, FY, 1.6, WOOD, { seg: 5, r: [0.2, 0, 0.1], ao: 0 }); b.box(0.2, 0.03, 0.03, -2.54, FY + 0.93, 1.5, '#a9b8c9', { r: [0.2, 0, 0.1], ao: 0 });
  for (const [x, z] of [[-2.9, -1.0], [-2.6, 2.0], [2.9, -1.1], [0.0, 3.0], [-1.0, 3.0]]) { for (let k = 0; k < 4; k++) flowerInto(b, x + (k - 1.5) * 0.12, FY, z + hash(k, x) * 0.2, FLOWERS[k % 2 ? 0 : 5], 1.1, 0.2); } meadowW(b);
  for (const [x, z, v] of [[-2.5, 2.1, 0], [2.7, -0.4, 1]]) b.xf(x, FY, z, 0.8, x, () => bushInto(b, v, 1));
}
/** flower margin around the wheat (static; the wheat itself sways) */
function meadowW(b) { const r = krng(81); for (let i = 0; i < 16; i++) { const a = i / 16 * TAU + r() * 0.3, rr = 3.15 + r() * 0.3, x = Math.cos(a) * rr, z = Math.sin(a) * rr; if (Math.abs(x) < 0.9 && z > 0.4) continue; for (let k = 0; k < 2; k++) flowerInto(b, x + (r() - 0.5) * 0.25, FY, z + (r() - 0.5) * 0.25, FLOWERS[(i + k * 2) % 6], 1.1, 0.18, k === 0, (i + k) % 4); if (i % 3 === 0) mushroomInto(b, x * 0.97, z * 0.97, 0.9, FY, MUSH[i % 4], true); } }
function wheatTuft(b, x, z, v, ripe) {
  const r = krng(Math.floor(x * 100 + z * 37) + v), n = 4, c0 = ripe ? '#ffd24a' : '#8fdc50', c1 = ripe ? '#ffe680' : '#b4ec60', ph = hash(x * 0.7, z * 0.9) * TAU;
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, lean = 0.06 + r() * 0.24, h = 0.6 + r() * 0.25, bx = x + Math.cos(a) * 0.08, bz = z + Math.sin(a) * 0.08, dx = Math.sin(lean) * Math.sin(a), dy = Math.cos(lean), dz = Math.sin(lean) * Math.cos(a);
    b.add(G.cyl(0.3, 3, true), { p: [bx, FY, bz], s: [0.04, h, 0.04], r: [lean, a, 0], c: c0, grad: 0.3, ao: 0.1, aoH: 0.3, sw: 1.2, ph });
    b.add(G.octa(), { p: [bx + dx * h, FY + dy * h - 0.02, bz + dz * h], s: [0.05, 0.14, 0.05], r: [lean, a, 0], c: c1, grad: 0.5, ao: 0, swc: 1.15, ph });
  }
}
function wheatFieldStuff(b) {   // lives inside the sway group
  const r = krng(31); let k = 0;
  for (const x0 of COLS_X) for (let z0 = -2.9; z0 <= 3.0; z0 += 0.46) {
    const x = x0 + (r() - 0.5) * 0.12, z = z0 + (r() - 0.5) * 0.12, rr = Math.hypot(x, z); if (rr > 3.05) continue; if (Math.hypot(x, z + 1.45) < 1.05) continue;
    wheatTuft(b, x, z, k++, r() > 0.08);
  }
}

const FIELD_PARTS = {
  tree: [treeFieldStatic, treeFieldStuff, treeFieldSway], clay: [clayFieldStatic, clayFieldStuff, claySway], rock: [rockFieldStatic, rockFieldStuff, rockFieldSway], wheat: [wheatFieldStatic, null, null],
};
/**
 * A round dressed valley field, radius ~3.6, centred at the origin, ground top at y = 0.10.
 * type 'tree' | 'clay' | 'rock' | 'wheat'. ang (optional, radians, the field's angle around the plaza) turns the model so its dirt path points to the plaza.
 * Children: `stuff` (the gatherable things: trees / clay mounds / boulders / wheat: scale it with the stock), `sway` (wind-driven grass,
 * reeds and wheat: rotate it a hair; for wheat it lives inside `stuff`), `hoist` (quarry crane block, swing it). userData.stuff is `stuff`.
 */
export function fieldModel(type, ang) {
  const [st, su, sw] = FIELD_PARTS[type] || FIELD_PARTS.tree, g = new THREE.Group(); g.name = `field_${type}`;
  const base = instantiate(baked(`field:${type}:base`, (b) => st(b), FY)); base.name = 'base'; g.add(base);
  const stuff = new THREE.Group(); stuff.name = 'stuff'; g.add(stuff); g.userData.stuff = stuff; g.userData.type = type;
  if (type === 'wheat') { const s = instantiate(baked('field:wheat:sway', (b) => wheatFieldStuff(b), FY)); s.name = 'sway'; stuff.add(s); }
  else {
    const e = instantiate(baked(`field:${type}:stuff`, (b) => su(b), FY)); e.children.slice().forEach((m) => stuff.add(m));
    const s = instantiate(baked(`field:${type}:sway`, (b) => sw(b), FY), { shadows: false }); s.name = 'sway'; g.add(s);
  }
  if (type === 'rock') { const h = instantiate(baked('field:rock:hoist', (b) => craneHoist(b))); h.name = 'hoist'; h.position.set(CRANE[0] + 2.1 * Math.cos(CRANE_YAW), FY + 2.55, CRANE[1] - 2.1 * Math.sin(CRANE_YAW)); h.rotation.y = CRANE_YAW; g.add(h); }
  if (typeof ang === 'number') g.rotation.y = Math.atan2(-Math.cos(ang), -Math.sin(ang));
  g.userData.radius = 3.6; return g;
}

// =================================================================== flags, lanterns (named animated parts)
const CLOTH = new Map();
function clothGeo(hex, trim = '#fff2cf', w = 0.85, h = 0.52) {
  const k = `${hex}:${trim}:${w}:${h}`; let g = CLOTH.get(k); if (g) return g;
  // swallowtail pennant as a 6x3 grid, both faces (single-sided material), column 0 is the pole sleeve in the trim colour
  const NX = 5, main = col(hex), tr = col(trim), V = [], tmp = new THREE.Color();
  for (let j = 0; j < 3; j++) for (let i = 0; i <= NX; i++) {
    const x = (i === NX && j === 1 ? 0.76 : i / NX) * w, y = (1 - j) * h / 2; tone(main, 0.5 + (1 - j) * 0.12, 0.5, tmp); if (i === 0) tmp.copy(tr); else if (i === 1) tmp.lerp(tr, 0.35);
    V.push([x, y, 0, tmp.r, tmp.g, tmp.b]);
  }
  const pos = [], nor = [], colr = [], at = (j, i) => V[j * (NX + 1) + i];
  const tri = (a, b, c, nz) => { for (const q of nz > 0 ? [a, b, c] : [a, c, b]) { pos.push(q[0], q[1], nz * 0.012); nor.push(0, 0.45, nz * 0.9); colr.push(q[3], q[4], q[5]); } };
  for (let j = 0; j < 2; j++) for (let i = 0; i < NX; i++) { const a = at(j, i), b = at(j, i + 1), c = at(j + 1, i), d = at(j + 1, i + 1); for (const nz of [1, -1]) { tri(a, c, b, nz); tri(b, c, d, nz); } }
  g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.computeBoundingBox(); CLOTH.set(k, g); return g;
}
const flagCloth = (hex, trim, w, h) => baked(`cloth:${hex}:${trim}:${w}:${h}`, (b) => b.geo(clothGeo(hex, trim, w, h), 'matte', { ao: 0 }));
/** a pennant group pivoting at its pole edge, cloth extends along +X. */
function flagGroup(name, hex, trim, w, h) { const g = instantiate(flagCloth(hex, trim, w, h)); g.name = name; g.children.forEach((m) => { m.onBeforeRender = windTick; }); return g; }
function lanternGroup(name, scale = 1) {
  const g = instantiate(baked(`lantern:${scale}`, (b) => {
    b.cyl(0.012, 0.012, 0.22, 0, -0.22, 0, '#7fd0c4', { seg: 4, ao: 0, grad: 0 }); b.cyl(0.0, 0.14, 0.1, 0, -0.32, 0, '#7fd0c4', { seg: 6, ao: 0, grad: 0.5 });
    b.box(0.2, 0.3, 0.2, 0, -0.62, 0, '#ffe08a', { m: 'lantern', ao: 0 }); b.box(0.24, 0.04, 0.24, 0, -0.64, 0, '#7fd0c4', { ao: 0, grad: 0 }); b.box(0.24, 0.04, 0.24, 0, -0.34, 0, '#7fd0c4', { ao: 0, grad: 0 });
    for (const [x, z] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]]) b.box(0.025, 0.3, 0.025, x, -0.64, z, '#7fd0c4', { ao: 0, grad: 0 });
  })); g.name = name; g.scale.setScalar(scale); return g;
}

// =================================================================== 3. NOTICE BOARD
function boardStatic(b) {
  const stone = '#f8eedb', wood = '#f2b574', woodD = '#d98f58', cork = '#fff6d8';
  b.box(3.5, 0.15, 1.25, 0, 0, 0, stone, { grad: 0.7, ao: 0.4 }); b.box(3.1, 0.14, 0.95, 0, 0.15, 0, '#fff6e4', { grad: 0.6, ao: 0.1 });
  const top = 0.29;
  for (const x of [-1.1, 1.1]) { b.box(0.34, 2.1, 0.34, x, top, 0, wood, { grad: 0.8, ao: 0.4, aoH: 0.5 }); b.box(0.42, 0.18, 0.42, x, top, 0, woodD, { grad: 0.5, ao: 0.1 }); b.box(0.42, 0.1, 0.42, x, top + 1.9, 0, woodD, { ao: 0 }); }
  // framed cork board
  b.box(2.2, 1.34, 0.14, 0, 0.95, -0.02, woodD, { grad: 0.2, ao: 0, r: 0 }); b.box(1.96, 1.1, 0.08, 0, 1.07, 0.08, cork, { grad: 0.12, ao: 0, facet: 0.02 });
  for (let i = -2; i <= 2; i++) b.plain(0.012, 1.06, 0.012, i * 0.38, 1.09, 0.125, '#e0a868', { ao: 0, grad: 0 });
  b.box(2.4, 0.09, 0.4, 0, 0.82, 0.14, woodD, { ao: 0, grad: 0.4 });
  const notes = [[-0.72, 1.72, 0.3, 0.36, 0.08, '#fffbe8'], [-0.3, 1.8, 0.26, 0.3, -0.06, '#fff39a'], [0.14, 1.74, 0.3, 0.38, 0.05, '#d4ecff'], [0.58, 1.8, 0.28, 0.32, -0.1, '#ffd2e0'], [-0.62, 1.3, 0.28, 0.3, -0.05, '#fff39a'], [-0.18, 1.3, 0.34, 0.36, 0.07, '#ffffff'], [0.3, 1.32, 0.26, 0.3, -0.07, '#ffe6b0'], [0.7, 1.3, 0.3, 0.3, 0.06, '#d2f6e0']];
  notes.forEach(([x, y, w, h, rot, c], i) => {
    b.plain(w, h, 0.012, x, y - h / 2, 0.135, c, { r: [0, 0, rot], grad: 0.2, ao: 0 });
    for (let k = 0; k < 3; k++) b.plain(w * (0.7 - k * 0.12), 0.018, 0.006, x + Math.sin(rot) * 0.0, y - h * (0.38 + k * 0.17), 0.145, '#b49a86', { r: [0, 0, rot], grad: 0, ao: 0 });
    b.lump(0.026, x - rot * 0.1, y - 0.03, 0.15, ['#ff7f9f', '#6fb4f0', '#ffd24a'][i % 3], { d: 0, grad: 0.4, ao: 0 });
  });
  b.lump(0.07, 0.6, 1.18, 0.15, '#ffd24a', { d: 1, s: [1, 1, 0.25], grad: 0.5, ao: 0 });   // a coin note
  // roof: two shingled slabs, ridge, scalloped front eave
  const roof = '#ff8272', th = 0.66, cs = Math.cos(th), sn = Math.sin(th), slabP = (sgn, t, u) => [0, 2.52 + t * cs - u * sn * 1, sgn * 0.36 + (t * sn * 1 + u * cs) * sgn * 1];
  for (const sgn of [-1, 1]) {
    b.box(3.4, 0.14, 0.98, 0, 2.52, sgn * 0.36, roof, { r: [sgn * th, 0, 0], grad: 0.95, ao: 0 });
    for (const u of [-0.3, 0.02, 0.34]) { const q = [0, 2.52 + 0.145 * cs - u * sn, sgn * (0.36 + 0.145 * sn + u * cs)]; b.plain(3.3, 0.03, 0.045, q[0], q[1], q[2], '#ffb4a4', { r: [sgn * th, 0, 0], ao: 0, grad: 0 }); }
  }
  for (let k = 0; k < 11; k++) { const q = [-1.5 + k * 0.3, 2.52 - 0.49 * sn + 0.02, 0.36 + 0.49 * cs + 0.0]; b.lump(0.11, q[0], q[1], q[2], k % 2 ? '#ffa090' : '#ff8272', { d: 0, s: [1.15, 0.6, 0.9], grad: 0.7, ao: 0 }); }
  b.add(G.cyl(1, 8), { p: [1.72, 2.96, 0], s: [0.1, 3.44, 0.1], r: [0, 0, Math.PI / 2], c: '#ff9a8a', grad: 0.6, ao: 0 });
  // arms for the bell and the lantern, hanging crate and sack, flower pot
  for (const x of [-1.1, 1.1]) b.box(0.08, 0.08, 0.7, x, 2.18, 0.45, woodD, { ao: 0, grad: 0.4 });
  b.lump(0.24, 1.5, 0.44, 0.2, '#fff0c4', { d: 1, s: [1, 1.1, 1], grad: 0.6, ao: 0.14 }); b.lump(0.07, 1.5, 0.7, 0.2, '#f0dca0', { d: 0, ao: 0 }); b.shadow(1.5, 0.2, 0.55, 0.3, 1, 1, 0.15);
  b.box(0.42, 0.34, 0.4, -1.45, 0.29, 0.25, '#ffc88a', { grad: 0.6, ao: 0.14 }); b.box(0.44, 0.04, 0.42, -1.45, 0.62, 0.25, '#e8a870', { ao: 0 });
  b.add(G.lathe([[0.1, 0], [0.15, 0.1], [0.17, 0.2]], 8), { p: [-1.45, 0.66, 0.25], c: '#ff9a68', grad: 0.5 }); for (let i = 0; i < 6; i++) flowerInto(b, -1.45 + (i - 2.5) * 0.05, 0.84, 0.25 + (i % 2) * 0.05, FLOWERS[i], 0.8, 0.12);
  b.lump(0.12, -1.45, 0.85, 0.25, '#58b04a', { d: 0, s: [1.2, 0.6, 1], ao: 0 });
  // bunting across the front under the roof, between the pole posts, and a flower garden at the feet
  buntingInto(b, (t) => [-1.55 + t * 3.1, 2.25, 0.62], 11, 0.26, 0.28);
  for (const sx of [-1, 1]) for (let i = 0; i < 7; i++) { const a = i * 0.9 + (sx > 0 ? 1 : 0), rr = 0.22 + (i % 3) * 0.1; flowerInto(b, sx * (1.15 + Math.cos(a) * rr * 1.4), 0.0, 0.8 + Math.sin(a) * rr * 0.6, FLOWERS[(i + (sx > 0 ? 3 : 0)) % 6], 0.9, 0.2 + (i % 3) * 0.05, i % 2 === 0); }
  for (const sx of [-1, 1]) b.lump(0.3, sx * 1.65, 0.1, 0.62, '#78dc5a', { d: 1, s: [1.4, 0.7, 1], grad: 0.8, ao: 0.05, sw: 0.3 });
  b.shadow(0, 0.1, 2.3, 0.2, 1.1, 0.55, 0.0);
}
const BELL_PROFILE = [[0.02, 0], [0.18, 0.02], [0.15, 0.1], [0.1, 0.2], [0.07, 0.25], [0.03, 0.27]];
/**
 * The Valley notice board (about 3.4 wide, 3.4 tall with banners). Origin on the ground, front faces +Z.
 * Named children: `flag` and `flag2` (pennants, pivot at their pole: rotate.y to wave), `lantern` (rotate.z to sway; uses the exported lanternMat),
 * `bell` (rotate.z to ring).
 */
export function boardModel() {
  const g = instantiate(baked('board', (b) => boardStatic(b))); g.name = 'board';
  for (const [sx, name, hex, trim] of [[-1, 'flag', '#4fd8cc', '#fff2cf'], [1, 'flag2', '#ff8fb5', '#fff3b8']]) {
    const pole = instantiate(baked('boardpole', (b) => { b.cyl(0.04, 0.055, 3.55, 0, 0, 0, '#c58c5c', { seg: 6, grad: 0.6, ao: 0.3 }); b.lump(0.1, 0, 3.6, 0, '#ffd24a', { d: 1, grad: 0.7, ao: 0 }); b.cyl(0.1, 0.12, 0.12, 0, 0, 0, '#f2e8d2', { seg: 8, ao: 0.2 }); }));
    pole.position.set(sx * 1.72, 0.1, 0.0); g.add(pole);
    const f = flagGroup(name, hex, trim, 0.95, 0.6); f.position.set(sx * 1.72, 3.2, 0.0); if (sx < 0) f.scale.x = -1; g.add(f);
  }
  const lan = lanternGroup('lantern', 1.1); lan.position.set(-1.1, 2.2, 0.72); g.add(lan);
  const bell = instantiate(baked('bell', (b) => { b.add(G.lathe(BELL_PROFILE, 10), { m: 'gloss', c: '#ffd24a', grad: 0.8, ao: 0, p: [0, -0.3, 0] }); b.lump(0.045, 0, -0.32, 0, '#c58c5c', { m: 'gloss', d: 0, ao: 0 }); b.cyl(0.01, 0.01, 0.05, 0, -0.05, 0, '#7fd0c4', { seg: 4, ao: 0 }); })); bell.name = 'bell'; bell.position.set(1.1, 2.17, 0.72); g.add(bell);
  g.userData.topY = 3.7; return g;
}

// =================================================================== 4. PLAZA
function plazaInto(b, R) {
  const k = R / 9, FYP = 0.1; b.floor = FYP;
  const mortar = col('#e8c88a');
  b.geo(polarGeo([{ r: 0, y: FYP - 0.012, c: () => mortar }, { r: R, y: FYP - 0.012, c: () => mortar }, { r: R + 0.12, y: 0, c: () => '#e8cf9c' }], 48), 'matte', { ao: 0 });
  // cobbles: brick-pattern polar cells in 3 sand tones, paler lanes along the four axes where the paths come in
  const tones = ['#fae0a0', '#f6d896', '#f1cf8a', '#fde9b8'], accent = ['#ffd2dc', '#cdf1d4', '#cde4fa'], lane = col('#fffaea'), tris = [];
  const r0 = 2.75 * k, r1 = R - 0.4 * k, rowW = 0.8 * k; const rowsN = Math.max(3, Math.round((r1 - r0) / rowW)), rw = (r1 - r0) / rowsN;
  for (let i = 0; i < rowsN; i++) {
    const ra = r0 + i * rw, rb = ra + rw, rm = (ra + rb) / 2, n = Math.max(6, Math.round(TAU * rm / (0.95 * k))), off = (i % 2) * 0.5, g = 0.05 * k;
    for (let j = 0; j < n; j++) {
      const t0 = (j + off) / n * TAU, t1 = (j + 1 + off) / n * TAU, tm = (t0 + t1) / 2, dt = g / rm, h = hash(i * 13.1, j * 7.7);
      let base = col(hash(i * 3.7, j * 2.9) > 0.9 ? accent[(i + j) % 3] : tones[Math.floor(hash(i + 3.3, j * 1.7) * 3)]).clone();
      const axD = Math.abs(Math.sin(tm * 2)) * rm * 0.5; /* distance-ish to the nearest axis */ const toAxis = Math.min(...[0, 1, 2, 3].map((q) => Math.abs(Math.sin(tm - q * Math.PI / 2)) * rm));
      if (toAxis < 1.05 * k) base = col('#fff1c8').clone().multiplyScalar(0.97 + h * 0.05); else base.multiplyScalar(0.97 + h * 0.06);
      if (i === rowsN - 1) base.lerp(col('#c9b27c'), 0.35);
      const P_ = (r, t, y, m) => [Math.cos(t) * r, y, Math.sin(t) * r, base.clone().multiplyScalar(m)];
      const A = P_(ra + g, t0 + dt, FYP + 0.004, 0.94), B = P_(ra + g, t1 - dt, FYP + 0.004, 0.94), C = P_(rb - g, t1 - dt, FYP + 0.004, 0.94), D = P_(rb - g, t0 + dt, FYP + 0.004, 0.94), Cc = P_(rm, tm, FYP + 0.026 + h * 0.008, 1.05);
      tris.push([A, B, Cc], [B, C, Cc], [C, D, Cc], [D, A, Cc]);
    }
  }
  b.geo(triGeo(tris), 'matte', { ao: 0 });
  // compass inlay under the board
  { const t = [], R1 = 2.6 * k, y = FYP + 0.012; const pt = (r, a, yy, c) => [Math.cos(a) * r, yy, Math.sin(a) * r, c];
    for (let i = 0; i < 40; i++) { const a0 = i / 40 * TAU, a1 = (i + 1) / 40 * TAU; t.push([pt(0, 0, y, '#fff4d0'), pt(R1, a0, y, '#fff4d0'), pt(R1, a1, y, '#fff4d0')]);
      t.push([pt(R1 * 0.86, a0, y + 0.004, '#86e8dc'), pt(R1, a0, y + 0.004, '#5fd0d0'), pt(R1, a1, y + 0.004, '#5fd0d0')], [pt(R1 * 0.86, a0, y + 0.004, '#86e8dc'), pt(R1, a1, y + 0.004, '#5fd0d0'), pt(R1 * 0.86, a1, y + 0.004, '#86e8dc')]); }
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, al = a - 0.2, ar = a + 0.2, rr = i % 2 ? R1 * 0.55 : R1 * 0.8; t.push([pt(0, 0, y + 0.008, '#ffd24a'), pt(rr, a, y + 0.008, '#ffd24a'), pt(R1 * 0.2, al, y + 0.008, '#ffab5a')], [pt(0, 0, y + 0.008, '#ffd24a'), pt(R1 * 0.2, ar, y + 0.008, '#ffab5a'), pt(rr, a, y + 0.008, '#ffd24a')]); }
    const g = triGeo(t);
    b.geo(g, 'matte', { ao: 0 }); }
  // stone ring (curb): blocks with slits, two stone tones, a few mossy tops
  { const nB = Math.round(TAU * R / 1.3), rings = [], cut = new Set(); const sc = ['#f6ecd6', '#ece2cc', '#f0e6d0', '#e6dcc4'];
    for (let j = 0; j < nB; j++) { const a0 = j / nB * TAU + 0.004, a1 = (j + 1) / nB * TAU - 0.004, c0 = col(sc[j % 4]).clone().multiplyScalar(0.96 + hash(j, 4) * 0.08), mossy = hash(j, 9) > 0.8;
      for (const a of [a0, (a0 + a1) / 2, a1]) { const pr = [[R + 0.26 * k, 0.0, c0.clone().multiplyScalar(0.88)], [R + 0.26 * k, 0.2, c0.clone().multiplyScalar(0.92)], [R + 0.17 * k, 0.29, mossy ? col('#8fe06a') : c0.clone().multiplyScalar(1.05)], [R - 0.14 * k, 0.29, mossy ? col('#a4ee7c') : c0.clone().multiplyScalar(1.05)], [R - 0.22 * k, 0.2, c0.clone().multiplyScalar(1.0)], [R - 0.22 * k, FYP, c0.clone().multiplyScalar(0.9)]];
        rings.push(pr.map(([rad, y, c]) => ({ x: Math.cos(a) * rad, y, z: Math.sin(a) * rad, c }))); }
      if (j < nB - 1) cut.add(rings.length - 1); }
    b.geo(sweepGeo(rings, { cut, orient: 'out' }), 'matte', { ao: 0.2, aoH: 0.3 }); }
  b.shadow(0, 0, R + 1.6, 0.0, 1, 1, 0.0);
  const place = (ang, rad, yawF, fn, mul = 1) => { const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad, yaw = yawF === 'in' ? Math.atan2(-Math.cos(ang), -Math.sin(ang)) : yawF || 0; b.xf(x, FYP, z, k * mul, yaw, () => fn(x, z)); };
  const D45 = Math.PI / 4;
  // fountain at 135 deg (the 45 deg wedge stays open for the travelling merchant, the north for the monument)
  place(D45 * 3, 5.4 * k, 0, () => {
    b.add(G.lathe([[1.15, 0], [1.2, 0.14], [1.17, 0.46], [1.05, 0.5], [1.0, 0.4], [0.0, 0.38]], 20), { c: '#f6ecd6', grad: 0.8, ao: 0.3, aoH: 0.25, facet: 0.03 }); b.lump(0.98, 0, 0.36, 0, '#7fe6f2', { m: 'water', d: 2, s: [1, 0.04, 1], jit: 0.0, grad: 0.4, ao: 0 });
    b.cyl(0.13, 0.19, 0.62, 0, 0.3, 0, '#f6ecd6', { seg: 8, grad: 0.7 }); b.add(G.lathe([[0.55, 0.9], [0.58, 1.0], [0.5, 1.06], [0.35, 0.98], [0.0, 0.95]], 14), { c: '#faf2e0', grad: 0.8, ao: 0 }); b.lump(0.42, 0, 0.97, 0, '#7fe6f2', { m: 'water', d: 1, s: [1, 0.05, 1], jit: 0, ao: 0 });
    b.cyl(0.07, 0.1, 0.4, 0, 0.95, 0, '#f6ecd6', { seg: 8, ao: 0 }); b.lump(0.14, 0, 1.43, 0, '#c8f8ff', { m: 'water', d: 1, grad: 0.5, ao: 0 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; b.lump(0.045, Math.cos(a) * 0.62, 0.72, Math.sin(a) * 0.62, '#d8fbff', { m: 'water', d: 0, s: [1, 1.6, 1], ao: 0 }); b.lump(0.04, Math.cos(a) * 0.3, 1.25, Math.sin(a) * 0.3, '#d8fbff', { m: 'water', d: 0, s: [1, 1.5, 1], ao: 0 }); }
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.3; for (let q = 0; q < 5; q++) { const t = q / 4, rr = 0.1 + t * 0.62, y = 1.45 - 1.05 * t * t * 1.0 + 0.5 * t * (1 - t); b.add(G.octa(), { m: 'water', p: [Math.cos(a) * rr, y, Math.sin(a) * rr], s: [0.05 - t * 0.012, 0.06, 0.05 - t * 0.012], c: '#e4fcff', grad: 0.5, ao: 0 }); } }
    for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.8; b.lump(0.2, Math.cos(a) * 0.78, 0.5, Math.sin(a) * 0.78, '#fff8dc', { d: 0, s: [1.2, 0.7, 1], ao: 0.1 }); b.add(G.octa(), { p: [Math.cos(a) * 0.82, 0.68, Math.sin(a) * 0.82], s: 0.05, c: i % 2 ? '#ffb7d0' : '#fff2a0', ao: 0, grad: 0 }); }
    b.shadow(0, 0, 1.9, 0.28, 1, 1, 0.0);
  });
  // well at 225 deg
  place(Math.PI + D45, 5.6 * k, 0, () => {
    b.add(G.lathe([[0.78, 0], [0.8, 0.12], [0.78, 0.55], [0.66, 0.62], [0.52, 0.6], [0.5, 0.4]], 12), { c: '#f6ecd6', grad: 0.8, ao: 0.3, aoH: 0.25, facet: 0.05 }); b.lump(0.5, 0, 0.36, 0, '#66d2f0', { m: 'water', d: 1, s: [1, 0.04, 1], ao: 0, jit: 0 });
    for (const x of [-0.68, 0.68]) b.box(0.13, 1.5, 0.13, x, 0.5, 0, '#e8a96a', { grad: 0.8, ao: 0.3 });
    b.add(G.cyl(1, 8), { p: [0.78, 1.55, 0], s: [0.07, 1.56, 0.07], r: [0, 0, Math.PI / 2], c: '#c58c5c', grad: 0.6, ao: 0 }); b.box(0.04, 0.04, 0.3, 0.52, 1.5, 0.0, '#c58c5c', { ao: 0 }); b.box(0.04, 0.04, 0.3, -0.52, 1.5, 0.0, '#c58c5c', { ao: 0 });
    for (const sgn of [-1, 1]) { b.box(1.8, 0.1, 0.62, 0, 1.78, sgn * 0.22, '#7fc4f6', { r: [sgn * 0.62, 0, 0], grad: 0.9, ao: 0 }); b.plain(1.7, 0.03, 0.04, 0, 1.98, sgn * 0.3, '#5aa6ea', { r: [sgn * 0.62, 0, 0], ao: 0, grad: 0 }); }
    b.add(G.cyl(1, 8), { p: [0.92, 2.04, 0], s: [0.06, 1.84, 0.06], r: [0, 0, Math.PI / 2], c: '#5aa6ea', grad: 0.5, ao: 0 });
    b.cyl(0.012, 0.012, 0.5, 0, 0.95, 0, '#d8c8a0', { seg: 4, ao: 0 }); b.cyl(0.13, 0.1, 0.18, 0, 0.78, 0, '#e8a870', { seg: 8, ao: 0 });
    b.shadow(0, 0, 1.4, 0.3, 1, 1, 0.0);
  });
  // flower beds at 225 and 315 (a small tree, and a big bloom mound)
  const bed = (ang, tree) => place(ang, 5.6 * k, 0, () => {
    b.add(G.lathe([[1.0, 0], [1.05, 0.1], [1.02, 0.28], [0.92, 0.3], [0.88, 0.18], [0.0, 0.2]], 18), { c: '#f6ecd6', grad: 0.8, ao: 0.3, aoH: 0.25, facet: 0.03 }); b.lump(0.9, 0, 0.19, 0, '#c08a5a', { d: 1, s: [1, 0.12, 1], jit: 0, ao: 0 });
    const r = krng(ang * 100 | 0); for (let i = 0; i < 30; i++) { const a = r() * TAU, rr = (tree ? 0.38 : 0.1) + r() * 0.6; flowerInto(b, Math.cos(a) * rr, 0.2, Math.sin(a) * rr, FLOWERS[(i + (tree ? 0 : 2)) % 6], 1.0, 0.13 + r() * 0.1, i % 4 === 0); }
    for (let i = 0; i < 6; i++) { const a = i * 1.05, rr = 0.55 + r() * 0.2; b.lump(0.2, Math.cos(a) * rr, 0.26, Math.sin(a) * rr, '#58b04a', { d: 0, s: [1.2, 0.6, 1.2], ao: 0, grad: 0.7, sw: 0.4 }); }
    if (tree) b.xf(0, 0.2, 0, 0.62, 1, () => treeInto(b, 'blossom', 1, 0)); else for (let i = 0; i < 8; i++) { const a = i * 0.8; b.lump(0.2, Math.cos(a) * 0.3, 0.36 + (i % 2) * 0.1, Math.sin(a) * 0.3, FLOWERS[(i * 2) % 6], { d: 1, grad: 0.7, ao: 0, s: [1, 0.8, 1] }); }
    b.shadow(0, 0, 1.6, 0.25, 1, 1, 0.0);
  });
  bed(Math.PI * 1.75, true);
  // benches facing the middle at 22.5 + 90m
  [108, 162, 198, 342].forEach((deg, m) => place(deg * Math.PI / 180, 6.6 * k, 'in', () => { const pc = ['#a8ecd2', '#ffc2d6', '#fff0a0', '#cfc4ff'][m];
    b.box(1.35, 0.1, 0.44, 0, 0.34, 0, pc, { grad: 0.6, ao: 0.14 }); b.box(1.35, 0.3, 0.07, 0, 0.44, -0.2, pc, { grad: 0.6, ao: 0, r: [-0.12, 0, 0] });
    for (const x of [-0.52, 0.52]) { b.box(0.12, 0.34, 0.4, x, 0, 0, '#f0e6d0', { grad: 0.8, ao: 0.4 }); b.box(0.09, 0.5, 0.09, x, 0.34, -0.2, '#c58c5c', { ao: 0, grad: 0.4 }); }
    b.box(0.34, 0.06, 0.32, 0.38, 0.34, 0.06, '#ff8fa8', { ao: 0, r: [0, 0.2, 0] }); b.add(G.lathe([[0.1, 0], [0.15, 0.1], [0.16, 0.2]], 5), { p: [-0.78, 0, -0.1], c: '#ffb066', grad: 0.5 }); flowerInto(b, -0.78, 0.2, -0.1, FLOWERS[m % 6], 1.1, 0.12, false, 2);
    b.shadow(0, -0.05, 1.0, 0.3, 1.2, 0.6, 0.0);
  }));
  // planters near the curb
  [122, 150, 238, 302].forEach((deg, m) => place(deg * Math.PI / 180, 8.0 * k, 0, () => {
    b.add(G.lathe([[0.42, 0], [0.5, 0.12], [0.52, 0.34], [0.46, 0.42], [0.4, 0.38]], 12), { c: '#ff9a68', grad: 0.6, ao: 0.14, aoH: 0.2 }); b.lump(0.4, 0, 0.38, 0, '#c08a5a', { d: 0, s: [1, 0.2, 1], ao: 0, jit: 0 });
    for (let i = 0; i < 3; i++) b.lump(0.2, Math.cos(i * 2.1) * 0.17, 0.5, Math.sin(i * 2.1) * 0.17, '#58b04a', { d: 1, s: [1, 0.85, 1], ao: 0, grad: 0.9, sw: 0.3 });
    for (let i = 0; i < 8; i++) { const a = i * 0.85 + m, rr = 0.1 + (i % 3) * 0.1; flowerInto(b, Math.cos(a) * rr, 0.62, Math.sin(a) * rr, FLOWERS[(i + m) % 6], 0.9, 0.1 + (i % 2) * 0.05, false, (i + m) % 4); }
    b.shadow(0, 0, 0.8, 0.28, 1, 1, 0.0);
  }, 1.2));
  // lamp posts flanking each path entrance
  for (let q = 0; q < 4; q++) for (const s of [-1, 1]) { const a = q * Math.PI / 2 + s * 0.14; place(a, R - 0.95 * k, 0, () => {
    b.add(G.lathe([[0.17, 0], [0.12, 0.12], [0.07, 0.3], [0.06, 1.8]], 8), { c: '#7fd0c4', grad: 0.6, ao: 0.2 }); b.lump(0.09, 0, 1.85, 0, '#7fd0c4', { d: 0, ao: 0 });
    b.box(0.26, 0.34, 0.26, 0, 1.78, 0, '#ffe08a', { m: 'lantern', ao: 0 }); b.cyl(0.0, 0.26, 0.2, 0, 2.1, 0, '#7fd0c4', { seg: 6, ao: 0, grad: 0.5 }); b.lump(0.05, 0, 2.33, 0, '#ffd24a', { d: 0, ao: 0 });
    b.cyl(0.14, 0.14, 0.04, 0, 1.74, 0, '#7fd0c4', { seg: 6, ao: 0 }); b.shadow(0, 0, 0.5, 0.18, 1, 1, 0.0);
    { const ox = Math.cos(a) * 0.3, oz = Math.sin(a) * 0.3; b.plain(0.3, 0.03, 0.03, ox / 2, 1.5, oz / 2, '#7fd0c4', { ao: 0, grad: 0, r: [0, -a, 0] }); b.cyl(0.008, 0.008, 0.16, ox, 1.36, oz, '#7fd0c4', { seg: 3, open: true, ao: 0 }); b.add(G.lathe([[0.04, 0], [0.09, 0.07], [0.11, 0.12]], 5), { p: [ox, 1.26, oz], c: '#ffb066', grad: 0.5 }); for (let i = 0; i < 3; i++) flowerInto(b, ox + Math.cos(i * 2.1) * 0.05, 1.36, oz + Math.sin(i * 2.1) * 0.05, FLOWERS[(i + q * 2 + (s > 0 ? 3 : 0)) % 6], 0.8, 0.07, false, (i + 1) % 4); }
    for (let i = 0; i < 5; i++) { const a2 = i * 1.3 + q; flowerInto(b, Math.cos(a2) * 0.32, 0, Math.sin(a2) * 0.32, FLOWERS[(i + q + (s > 0 ? 3 : 0)) % 6], 0.9, 0.14 + (i % 2) * 0.05, i % 2 === 0, (i + q) % 4); }
  }); }
  // bunting scallops hang between the lamp posts of neighbouring entrances (an arc just inside the lamps)
  for (let q = 0; q < 4; q++) { const a0 = q * Math.PI / 2 + 0.14, a1 = (q + 1) * Math.PI / 2 - 0.14, rr = (R - 0.95 * k) * 1.0; b.xf(0, FYP, 0, 1, 0, () => { const P_ = (t) => { const a = a0 + (a1 - a0) * t; return [Math.cos(a) * rr, 2.05, Math.sin(a) * rr]; }; buntingInto(b, P_, Math.round(14 * k), 0.34, 0.45); const nl = Math.round(15 * k); for (let i = 1; i < nl; i++) { const t = i / nl, p_ = P_(t); b.add(G.octa(), { m: 'lantern', p: [p_[0], p_[1] - 0.45 * 4 * t * (1 - t) - 0.04, p_[2]], s: 0.055, c: '#fff0b0', ao: 0, grad: 0 }); } }); }
  // a few tufts and flowers in the cracks of the ring
  const r = krng(7); for (let i = 0; i < 22; i++) { const a = r() * TAU; const rr = R + (r() < 0.5 ? 0.45 : -0.0) * k; if (rr < R + 0.3) continue; tuftInto(b, Math.cos(a) * (R + 0.35 * k), 0.0, Math.sin(a) * (R + 0.35 * k), 0.8, '#62d452', 3, 0.8); if (i % 2 === 0) flowerInto(b, Math.cos(a) * (R + 0.45 * k), 0.0, Math.sin(a) * (R + 0.45 * k), FLOWERS[i % 6], 0.9, 0.16); }
}
/**
 * The central valley square. Round, top at y = 0.10 (island top at 0). The middle 3 units hold the board (a compass inlay shows around it).
 * Cobbles, stone ring, fountain (45deg), well (135deg), two flower beds, 4 benches, 4 planters, 8 lamp posts at the 4 path entrances.
 * Lamp lanterns use the exported lanternMat.
 */
export function plazaModel(radius = 9) { const g = instantiate(baked(`plaza:${radius}`, (b) => plazaInto(b, radius)), { shadows: false }); g.name = 'plaza'; g.userData.radius = radius; return g; }

// =================================================================== 5. VILLAGE PLOT
const PLOT_N = 16, PH = 8.25;   // tiles per side; centre line of the border
const gz0 = PH + 0.02;
function plotInto(b, hex) {
  const own = col(hex), ownL = own.clone().lerp(col('#ffffff'), 0.16), ownD = own.clone().lerp(col('#ffffff'), 0.05).multiplyScalar(0.88), TOP = 0.14; b.floor = TOP;
  // the lawn: one 4 x 4 grid of big quads (32 tris); the shader draws the 16 x 16 checker, seams, edge shading, grass mottling and daisy freckles (aG = 1)
  { const tris = [], gA = col('#a6ea66'), gD = col('#88d84f'), gL = col('#c0f684'), N4 = 4, st = 16 / N4;
    const at = (x, z) => gA.clone().lerp(gD, sstep(0.45, 0.8, fbm(x * 0.2 + 3, z * 0.2 + 8)) * 0.55).lerp(gL, sstep(0.55, 0.8, fbm(x * 0.3 + 40, z * 0.3 + 11)) * 0.6);
    for (let i = 0; i < N4; i++) for (let j = 0; j < N4; j++) { const x0 = i * st - 8, z0 = j * st - 8, A = [x0, TOP, z0, at(x0, z0)], B = [x0 + st, TOP, z0, at(x0 + st, z0)], C = [x0 + st, TOP, z0 + st, at(x0 + st, z0 + st)], D = [x0, TOP, z0 + st, at(x0, z0 + st)]; tris.push([A, D, C], [A, C, B]); }
    b.geo(triGeo(tris), 'matte', { ao: 0, ground: 1 }); }
  // border curb: stone blocks with slits; owner colour on top and outer lip, soil below
  { const rings = [], cut = new Set(), rad = 0.9, S = PH, seg = 5;
    // blocks (each a list of points) walk the rounded square; the gate on +Z, |x| < 1.3, is left open
    const side = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 1.45)); const out = []; for (let i = 0; i < n; i++) out.push([[x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n], [x0 + (x1 - x0) * (i + 1) / n, z0 + (z1 - z0) * (i + 1) / n]]); return out; };
    const R2 = S - rad, order = [];
    order.push(...side(1.3, S, R2, S), arcDec(R2, R2, Math.PI / 2, 0, rad, seg), ...side(S, R2, S, -R2), arcDec(R2, -R2, 0, -Math.PI / 2, rad, seg), ...side(R2, -S, -R2, -S), arcDec(-R2, -R2, -Math.PI / 2, -Math.PI, rad, seg), ...side(-S, -R2, -S, R2), arcDec(-R2, R2, Math.PI, Math.PI / 2, rad, seg), ...side(-R2, S, -1.3, S));
    const stones = ['#fff6e2', '#f6ecd6', '#fbf2dc'];
    order.forEach((blk, bi) => {
      const sc = col(stones[bi % 3]).clone().multiplyScalar(0.96 + hash(bi, 2) * 0.08);
      const pts2 = blk;
      pts2.forEach((p, pi) => {
        const nx0 = p[0], nz0 = p[1]; // outward normal = direction from the nearest point of the inner rounded square
        const cx = clamp(nx0, -R2, R2), cz = clamp(nz0, -R2, R2); let ux = nx0 - cx, uz = nz0 - cz; const ul = Math.hypot(ux, uz) || 1; if (ul < 1e-6) { ux = 0; uz = 1; } else { ux /= ul; uz /= ul; }
        const pr = [[0.25, -0.15, '#d6a878'], [0.25, 0.07, '#d6a878'], [0.25, 0.1, ownD], [0.25, 0.22, own], [0.17, 0.31, own], [-0.14, 0.31, own], [-0.25, 0.17, sc]];
        const edgeK = pi === 0 || pi === pts2.length - 1 ? 0.86 : 1;
        rings.push(pr.map(([u, y, c]) => { const cc = col(c).clone().multiplyScalar(edgeK); return { x: nx0 + ux * u, y, z: nz0 + uz * u, c: cc }; }));
      });
      cut.add(rings.length - 1);
    });
    b.geo(sweepGeo(rings, { cut, orient: 'out' }), 'matte', { ao: 0.0 });
  }
  // flower-covered hedges outside the border: puffy bushes sprinkled with pastel blossoms and the owner colour; none at the gate
  { const r = krng(hex.length * 7 + (own.getHex() % 997)); let n = 0; const pal = ['#ffb7d0', '#ffffff', '#fff2a0', '#d4c4ff', '#ffc8a8'];
    for (let s_ = 0; s_ < 4; s_++) for (let i = 0; i < 6; i++) { const t = -6.9 + i * 2.78 + (r() - 0.5) * 0.4, off = PH + 0.52 + (r() - 0.5) * 0.12; let x, z; if (s_ === 0) { x = t; z = off; if (Math.abs(x) < 2.2) continue; } else if (s_ === 1) { x = off; z = t; } else if (s_ === 2) { x = t; z = -off; } else { x = -off; z = t; }
      const sc = 0.95 + r() * 0.5, hy0 = 0.14 + 0.2 * sc, sh = (s_ * 5 + i) % 5, along = s_ % 2 ? Math.PI / 2 : 0, gc = ['#62d652', '#70dc5a', '#58cf5a'][n++ % 3];
      if (sh === 2) { b.cyl(0.035, 0.05, 0.42, x, 0.1, z, '#b8814f', { seg: 5, open: true, ao: 0.1 }); b.lump(0.3 * sc, x, 0.62, z, gc, { d: 0, jit: 0.1, seed: n, grad: 0.95, ao: 0.05, aoH: 0.3, up: 0.4 }); }
      else b.lump(0.36 * sc, x, hy0, z, gc, { d: 0, s: sh === 1 ? [2.0, 0.78, 0.8] : sh === 4 ? [0.8, 1.45, 0.8] : [1.3, 0.9, 1.0], jit: 0.16, seed: n, grad: 0.95, ao: 0.1, aoH: 0.3, r: [0, sh === 1 ? along : r() * 3, 0], up: 0.4 });
      const hh = sh === 4 ? 0.34 : 0.0;
      for (let k = 0; k < 2; k++) { const a = r() * TAU, e = 0.2 + r() * 0.8, ce = Math.cos(e); b.add(G.octa(), { p: [x + Math.cos(a) * 0.4 * sc * ce, hy0 + hh + Math.sin(e) * 0.32 * sc, z + Math.sin(a) * 0.36 * sc * ce], s: 0.14, c: k === 0 ? own : pal[(n + k) % 5], grad: 0.2, ao: 0 }); } } }
  // little flower pots standing on the curb
  { const pc = ['#ff9a68', '#9ad6f0', '#ffd24a', '#f2a6c4'], pp = [[-5, -1], [5, -1], [-6.4, 0.3], [0.5, 1], [3.4, 1], [-3.4, 1], [6.4, 0.3], [0.5, -1]];
    pp.forEach(([t, sd], i) => { const side = i < 2 ? 0 : i < 4 ? 3 : i < 6 ? 2 : 1; let x, z; if (i === 0 || i === 1) { x = t; z = -PH; } else if (i === 2) { x = -PH; z = 3.5; } else if (i === 3) { x = PH; z = -3.5; } else if (i === 4) { x = PH; z = 4.5; } else if (i === 5) { x = -PH; z = -4.2; } else if (i === 6) { x = 3.4; z = PH; } else { x = -3.4; z = PH; }
      b.add(G.lathe([[0.11, 0], [0.17, 0.14], [0.19, 0.25], [0.15, 0.27]], 5), { p: [x, 0.31, z], c: pc[i % 4], grad: 0.5, ao: 0.1 }); b.lump(0.15, x, 0.6, z, '#62d652', { d: 0, s: [1.1, 0.7, 1.1], ao: 0, grad: 0.8, sw: 0.4 }); flowerInto(b, x + 0.06, 0.55, z, FLOWERS[(i * 2) % 6], 1.2, 0.1, false, 2); flowerInto(b, x - 0.07, 0.55, z + 0.04, FLOWERS[(i * 2 + 1) % 6], 1.1, 0.12, false, 3); }); }
  // gate arch on the +Z side, owner colour
  { const gx = 1.45, gz = PH + 0.02;
    for (const sx of [-1, 1]) { b.box(0.56, 0.55, 0.56, sx * gx, 0.0, gz, '#f6ecd6', { grad: 0.8, ao: 0.3, aoH: 0.3 }); b.box(0.34, 1.5, 0.34, sx * gx, 0.5, gz, own, { grad: 0.8, ao: 0.2 }); b.lump(0.2, sx * gx, 2.02, gz, ownL, { d: 0, grad: 0.7, ao: 0, s: [1, 0.9, 1] }); }
    const rings = []; for (let i = 0; i <= 10; i++) { const t = Math.PI - i / 10 * Math.PI, x = Math.cos(t) * gx, y = 1.78 + Math.sin(t) * 0.7, nl = Math.hypot(Math.cos(t) / gx, Math.sin(t) / 0.7), nx = Math.cos(t) / gx / nl, ny = Math.sin(t) / 0.7 / nl; rings.push([[-0.11, -0.11], [0.11, -0.11], [0.11, 0.11], [-0.11, 0.11], [-0.11, -0.11]].map(([a, zo]) => ({ x: x + nx * a, y: y + ny * a, z: gz + zo, c: a > 0 ? ownL : own }))); }
    b.geo(sweepGeo(rings, { orient: 'out' }), 'matte', { ao: 0 });
    b.lump(0.13, 0, 2.72, gz, '#ffd24a', { d: 0, grad: 0.7, ao: 0 });
    for (let i = 0; i < 7; i++) { b.lump(0.2, (i % 2) * 0.16 - 0.08, 0.15, 6.9 - i * 0.85, ['#fff3d2', '#e4f0fb', '#ffe6c2', '#ffe3ea'][i % 4], { d: 0, s: [1.15, 0.3, 1], jit: 0.05, grad: 0.4, ao: 0.1, seed: i }); if (i === 3) cloverInto(b, 0.5, 0.14, 6.7 - i * 0.85, 0.9); }
    for (let i = 0; i < 9; i++) { const t = Math.PI - i / 8 * Math.PI, c2 = ['#ffb7d0', '#ffffff', '#fff2a0', '#d4c4ff'][i % 4]; b.add(G.octa(), { p: [Math.cos(t) * gx, 1.78 + Math.sin(t) * 0.7 + 0.14, gz + (i % 2 ? 0.1 : -0.1)], s: 0.11, c: c2, grad: 0.2, ao: 0 }); }
    for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) b.add(G.octa(), { p: [sx * gx + Math.cos(i * 1.3) * 0.2, 0.7 + i * 0.33, gz + Math.sin(i * 1.3) * 0.2], s: 0.09, c: ['#ffb7d0', '#fff2a0', '#ffffff'][i % 3], grad: 0.2, ao: 0 }); }
  // gate lantern and the three static (wind-fluttering) pennants
  { b.cyl(0.012, 0.012, 0.2, 0, 2.18, gz0, '#7fd0c4', { seg: 4, ao: 0, grad: 0 }); b.box(0.18, 0.26, 0.18, 0, 1.9, gz0, '#ffe08a', { m: 'lantern', ao: 0 }); b.cyl(0.0, 0.13, 0.08, 0, 2.16, gz0, '#7fd0c4', { seg: 6, ao: 0 });
    for (const [sx, sz] of [[1, -1], [1, 1], [-1, 1]]) b.add(clothGeo(own.getStyle ? '#' + own.getHexString() : hex, '#fff2cf', 1.15, 0.66), { p: [sx * (PH + 0.12) + 0.04, 2.45, sz * (PH + 0.12)], swx: 1, ao: 0 }); }
  // bunting between the corner posts on the four sides
  for (let sd = 0; sd < 4; sd++) { const A = [[-1, 1], [1, 1], [1, -1], [-1, -1]][sd], B2 = [[1, 1], [1, -1], [-1, -1], [-1, 1]][sd], q = PH + 0.12; buntingInto(b, (t) => [lerp(A[0], B2[0], t) * q, 2.2, lerp(A[1], B2[1], t) * q], 8, 0.5, 0.55, BUNT, 6); }
  // flower carpets just inside the curb: flat, pastel and never under the buildings
  { const r = krng(97), q = PH - 0.9; for (let sd = 0; sd < 4; sd++) for (let i = 0; i < 1; i++) { const t = -4.4 + i * 7.6 + 3.2 + r() * 0.8, x = sd % 2 ? (sd === 1 ? q : -q) : t, z = sd % 2 ? t : (sd === 0 ? q : -q); if (sd === 0 && Math.abs(x) < 2.6) continue; b.xf(x, TOP, z, 1.7, r() * 6, () => carpetInto(b, sd + i, 6)); } }
  // corner posts: stone foot, wooden pole, gold cap
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const x = sx * (PH + 0.12), z = sz * (PH + 0.12); b.cyl(0.26, 0.32, 0.45, x, 0, z, '#f6ecd6', { seg: 8, grad: 0.8, ao: 0.3, aoH: 0.3 }); b.cyl(0.06, 0.09, 2.1, x, 0.4, z, '#ffd9a0', { seg: 6, grad: 0.5, ao: 0 }); b.lump(0.1, x, 2.5, z, '#ffd24a', { d: 0, grad: 0.7, ao: 0 }); }
}
function arcDec(cx, cz, a0, a1, rad, seg) { const o = []; for (let i = 0; i <= seg; i++) { const a = a0 + (a1 - a0) * i / seg; o.push([cx + Math.cos(a) * rad, cz + Math.sin(a) * rad]); } return o; }
/**
 * A village's plot base, replacing the plain slab. Footprint exactly 16 x 16 tiles (tile (0,0) at -8,-8), top at y = 0.14, border out to +-8.33.
 * colorHex = owner colour (number or '#rrggbb'). toCentre (optional) = direction from the village toward the valley centre as {x,z} or an angle
 * (atan2(dz,dx)); the gate arch turns to the nearest quarter turn to face it (default +Z).
 * Children: `flag` (+ `flag2`, `flag3`, `flag4`): the pennants on the four corner posts, pivot at the pole, rotate.y to wave.
 */
export function plotModel(colorHex = '#e8564a', toCentre) {
  const hex = col(colorHex).getHexString(), g = instantiate(baked(`plot:${hex}`, (b) => plotInto(b, '#' + hex)), { shadows: false }); g.name = 'plot';
  const own = '#' + hex;
  const f = flagGroup('flag', own, '#fff2cf', 1.15, 0.66); f.position.set(-(PH + 0.12), 2.45, -(PH + 0.12)); g.add(f);   // the other three pennants flutter in the wind shader
  if (toCentre != null) { const d = typeof toCentre === 'number' ? { x: Math.cos(toCentre), z: Math.sin(toCentre) } : toCentre; g.rotation.y = Math.round(Math.atan2(d.x, d.z) / (Math.PI / 2)) * (Math.PI / 2); }
  g.userData.top = TOP_Y; return g;
}
const TOP_Y = 0.14;

// =================================================================== 6. SCATTER (instanced) + ISLAND
/** a fern: seven arching leaf blades (about 56 tris) */
function fernInto(b, v) {
  const r = krng(v * 7 + 2), c = ['#4fc95e', '#62d86a', '#46c27a'][v % 3];
  for (let i = 0; i < 7; i++) {
    const yaw = i / 7 * TAU + r() * 0.5, len = 0.3 + r() * 0.16, pit = 0.55 + r() * 0.25, d = [Math.sin(yaw) * Math.cos(pit), Math.sin(pit), Math.cos(yaw) * Math.cos(pit)];
    b.add(G.octa(), { p: [d[0] * len * 0.8, 0.06 + d[1] * len * 0.8, d[2] * len * 0.8], s: [0.055, 0.014, len], r: [-pit, yaw, 0], c: i % 2 ? c : '#8fe874', grad: 0.9, ao: 0, sw: 0.8 });
  }
}
/** a ring of small toadstools around an empty middle (a fairy ring) */
function mushRingInto(b, v) { const r = krng(v + 91); for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + r() * 0.2, rr = 0.62 + r() * 0.1; mushroomInto(b, Math.cos(a) * rr, Math.sin(a) * rr, 0.75 + r() * 0.5, 0, MUSH[(i + v) % 4], false); } for (let i = 0; i < 4; i++) { const a = i * 1.6 + 0.4; tuftInto(b, Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35, 0.6, '#84e060', 3, 0.8); } }
const lean1 = (b, v) => { tuftInto(b, 0, 0, 0, 0.95 + v * 0.15, v ? '#74d95e' : '#8fe468', 4, 1); tuftInto(b, 0.06, 0, 0.04, 0.65, v ? '#a8f080' : '#c0f68a', 1, 1); };
/**
 * Decorate a group with instanced life: forest rim of mixed trees (a few in autumn colours), bushes, ferns, flower patches, fairy rings, grass tufts, beach grass, stones.
 * rng = () => [0,1) (use rng(seed) from artkit). opts: R, shore(theta) outline radius, heightAt(x,z), isFree(x,z,pad), counts {trees,bushes,tufts,flowers,mushrooms,rings,stones,ferns,...}.
 * USES InstancedMesh: one per species/variant (about 40 draw calls). Returns { name: triangles }. Blossom trees also drop pink petals into the ground mask.
 */
export function scatter(group, rng, o = {}) {
  const R = o.R || 66, shore = o.shore || (() => R), hy = o.heightAt || (() => 0), free = o.isFree || isFree, n = { trees: 36, shade: 10, bushes: 30, tufts: 480, flowers: 28, carpets: 14, mushrooms: 10, rings: 7, stones: 32, clover: 10, pebbles: 22, ferns: 34, beach: 64, logs: 7, ...(o.counts || {}) };
  const stats = {}, add = (name, entries) => { let t = 0; for (const [e, items, opt] of entries) { const im = instancedFrom(e, items, opt); if (!im) continue; im.name = name; group.add(im); t += (e.tris || 0) * items.length; } stats[name] = Math.round(t); };
  const grid = new Map(), taken = (x, z, rr) => { const cx = Math.floor(x / rr), cz = Math.floor(z / rr); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = grid.get((cx + i) + ',' + (cz + j)); if (l) for (const p of l) if (Math.hypot(p[0] - x, p[1] - z) < rr) return true; } const k = cx + ',' + cz; (grid.get(k) || grid.set(k, []).get(k)).push([x, z]); return false; };
  const L = layout(), AUT = [4.0, 0.3, 0.22], AUT2 = [3.2, 0.62, 0.25];
  // forest rim and the hills (instanced low-poly trees: oak, blossom, pine, birch, apple, orange, peach; 2 variants each; one in six oaks, birches and apples turns autumn orange)
  { const buckets = {}; let made = 0, guard = 0;
    while (made < n.trees && guard++ < 9000) { const th = rng() * TAU, s = shore(th), d = 1.8 + 12.5 * Math.pow(rng(), 1.5), r = s - d, x = Math.cos(th) * r, z = Math.sin(th) * r;
      if (!free(x, z, 1.0) || vn(th * 5.3 + 2, d * 0.13) < 0.3 || taken(x, z, 1.9)) continue; const q = rng(), sp = q < 0.24 ? 'oak' : q < 0.4 ? 'blossom' : q < 0.5 ? 'pine' : q < 0.6 ? 'birch' : q < 0.72 ? 'apple' : q < 0.83 ? 'orange' : q < 0.92 ? 'peach' : 'oak', v = rng() < 0.5 ? 0 : 1;
      const aut = (sp === 'oak' || sp === 'birch' || sp === 'apple') && rng() < 0.2, sc = 1.15 + rng() * 0.7;
      (buckets[sp + v] ||= { sp, v, aut, items: [] }).items.push({ x, y: hy(x, z) - 0.05, z, s: sc, yaw: rng() * TAU, tint: aut ? (rng() < 0.5 ? AUT : AUT2) : null }); made++;
      if (sp === 'blossom' || sp === 'peach') L.stamp(x, z, 1.1 * sc, 1.5, 3, 255); }
    // groves on the hills of the outer lobes (the first four hills keep a clearing for their set piece)
    HILLS.forEach(([cx, cz, rad], hi) => { const mix = [['pine', 'oak', 'birch'], ['blossom', 'peach', 'oak'], ['apple', 'orange', 'oak'], ['oak', 'birch', 'pine'], ['pine', 'birch', 'oak'], ['apple', 'blossom', 'peach']][hi]; let gm = 0, gg = 0;
      while (gm < 5 && gg++ < 200) { const a = rng() * TAU, rr = (hi < 4 ? 4.6 : 2.5) + rng() * rad * 0.8, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr; if (!free(x, z, 1.0) || taken(x, z, 2.2)) continue;
        const sp = mix[Math.floor(rng() * 3)], v = rng() < 0.5 ? 0 : 1, sc = 1.15 + rng() * 0.6, aut = (sp === 'oak' || sp === 'birch' || sp === 'apple') && rng() < 0.3; (buckets[sp + v] ||= { sp, v, aut, items: [] }).items.push({ x, y: hy(x, z) - 0.05, z, s: sc, yaw: rng() * TAU, tint: aut ? (rng() < 0.5 ? AUT : AUT2) : null }); gm++; } });
    // shade trees in clumps round the ponds and picnic spots of the valley meadow
    made = 0; guard = 0; while (made < n.shade && guard++ < 6000) { const th = rng() * TAU, r = 15.0 + rng() * 7.0, x = Math.cos(th) * r, z = Math.sin(th) * r;
      if (!free(x, z, 1.6) || vn(x * 0.09 + 4, z * 0.09 + 9) < 0.56 || taken(x, z, 3.2)) continue; const q = rng(), sp = q < 0.3 ? 'blossom' : q < 0.55 ? 'apple' : q < 0.75 ? 'oak' : q < 0.9 ? 'peach' : 'birch', v = rng() < 0.5 ? 0 : 1, sc = 1.0 + rng() * 0.45;
      (buckets[sp + v] ||= { sp, v, aut: false, items: [] }).items.push({ x, y: 0, z, s: sc, yaw: rng() * TAU }); made++; if (sp === 'blossom' || sp === 'peach') L.stamp(x, z, 1.1 * sc, 1.5, 3, 255); }
    add('forest', Object.values(buckets).map((bk) => [bakedTree(bk.sp, bk.v, 1), bk.items, { seed: bk.v + 3, tint: 0.07 }])); }
  // free spots: from the rim inward, in the valley annulus (by area), or anywhere in the outer lobes
  const spots = (count, minD, dMax, pad = 0.6, nz = 0.38) => { const out = []; let g = 0; while (out.length < count && g++ < count * 60) { const th = rng() * TAU, s = shore(th), d = minD + rng() * dMax, r = s - d, x = Math.cos(th) * r, z = Math.sin(th) * r; if (!free(x, z, pad) || vn(x * 0.11 + 7, z * 0.11) < nz) continue; out.push({ x, y: hy(x, z), z, yaw: rng() * TAU, s: 0.8 + rng() * 0.5 }); } return out; };
  const annulus = (count, r0, r1, pad = 0.4, nz = 0.0) => { const out = []; let g = 0; while (out.length < count && g++ < count * 60) { const th = rng() * TAU, r = Math.sqrt(lerp(r0 * r0, r1 * r1, rng())), x = Math.cos(th) * r, z = Math.sin(th) * r; if (!free(x, z, pad) || vn(x * 0.11 + 7, z * 0.11) < nz) continue; out.push({ x, y: 0, z, yaw: rng() * TAU, s: 0.8 + rng() * 0.5 }); } return out; };
  const FA = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
  const meadowSpots = (count) => { const out = []; let g = 0; while (out.length < count && g++ < count * 400) { const th = rng() * TAU, r = (4 + rng() * 52), x = Math.cos(th) * r, z = Math.sin(th) * r; if (r > shore(th) - 2.5) continue; let ok = false;
      for (const a of FA) { const d = Math.hypot(x - Math.cos(a) * 13, z - Math.sin(a) * 13); if (d > 4.9 && d < 8.2) ok = true; }
      if (!ok) for (let i = 0; i < 16 && !ok; i++) { const [ox, oz] = slotOrigin(i), dx = Math.abs(x - ox) - 8.4, dz = Math.abs(z - oz) - 8.4, d = Math.max(dx, dz); if (d > 0.9 && d < 3.6) ok = true; }
      if (ok && free(x, z, -0.2)) out.push({ x, y: hy(x, z), z, yaw: rng() * TAU, s: 0.85 + rng() * 0.5 }); } return out; };
  const split = (arr, k) => Array.from({ length: k }, (_, i) => arr.filter((_, j) => j % k === i));
  { const sp = [...annulus(Math.round(n.bushes * 0.35), 11, 27, 0.9), ...spots(Math.round(n.bushes * 0.65), 2, 48, 0.8)], by = split(sp, 3); add('bushes', by.map((it, v) => [baked(`bush:${v}:1`, (b) => bushInto(b, v, 1)), it, { seed: v }])); }
  { const sp = [...annulus(Math.round(n.ferns * 0.3), 11, 27, 0.5), ...spots(Math.round(n.ferns * 0.7), 1, 40, 0.6)].map((q) => ({ ...q, s: 0.9 + rng() * 0.7 })), by = split(sp, 2); add('ferns', by.map((it, v) => [baked(`fern:${v}`, (b) => fernInto(b, v)), it, { cast: false, seed: v, tint: 0.08 }])); }
  { const sp = [...annulus(Math.round(n.tufts * 0.55), 11, 27, 0.2), ...meadowSpots(Math.round(n.tufts * 0.15)), ...spots(Math.round(n.tufts * 0.3), 0.5, 60, 0.3, 0)].map((p) => ({ ...p, s: 0.7 + rng() * 0.8 })), by = split(sp, 2); add('tufts', by.map((it, v) => [baked(`tuftL:${v}`, (b) => lean1(b, v)), it, { cast: false, seed: v, tint: 0.12 }])); }
  { const sp = [...meadowSpots(Math.round(n.flowers * 0.6)), ...annulus(Math.round(n.flowers * 0.2), 11, 27, 0.8), ...spots(Math.round(n.flowers * 0.2), 2, 56, 0.9)], by = split(sp.map((q) => ({ ...q, s: q.s * 1.5 })), 3); add('flowers', by.map((it, v) => [baked(`flowers:${v}`, (b) => flowerPatchInto(b, v)), it, { cast: false, seed: v, tint: 0.03 }])); }
  { const sp = [...meadowSpots(Math.round(n.mushrooms * 0.4)), ...spots(Math.round(n.mushrooms * 0.6), 2, 15, 0.8)], by = split(sp.map((q) => ({ ...q, s: q.s * 1.4 })), 1); add('mushrooms', by.map((it, v) => [baked(`mushL:${v}`, (b) => mushroomClump(b, v, false)), it, { seed: v, tint: 0.03 }])); }
  { const sp = [...annulus(Math.round(n.rings * 0.45), 12, 26, 1.0), ...spots(Math.round(n.rings * 0.55), 3, 40, 1.0)].map((q) => ({ ...q, s: 1.0 + rng() * 0.5 })), by = split(sp, 1); add('rings', by.map((it, v) => [baked(`mring:${v}`, (b) => mushRingInto(b, v)), it, { seed: v, tint: 0.03 }])); }
  { const sp = [...meadowSpots(Math.round(n.carpets * 0.6)), ...spots(Math.round(n.carpets * 0.4), 1.5, 56, 0.9)].map((q) => ({ ...q, s: 1.7 + rng() * 1.0 })); add('carpets', [[baked('carpet:0', (b) => carpetInto(b, 0)), sp, { cast: false, seed: 1, tint: 0.04 }]]); }
  { const sp = [...annulus(Math.round(n.stones * 0.4), 11, 27, 0.8), ...spots(Math.round(n.stones * 0.6), 1, 56, 0.8)], by = split(sp, 2); add('stones', by.map((it, v) => [baked(`stoneL:${v}`, (b) => stoneInto(b, v, true)), it, { seed: v }])); }
  { const sp = spots(n.clover, 1, 56, 0.6).map((q) => ({ ...q, s: q.s * 1.4 })); add('clover', [[baked('clover:0', (b) => { cloverInto(b, 0, 0, 0, 1.4); tuftInto(b, 0.1, 0, 0.1, 0.5, '#8fe864', 2, 0.6); }), sp, { cast: false, seed: 1, tint: 0.05 }]]); }
  { const sp = [...annulus(Math.round(n.pebbles * 0.4), 11, 27, 0.6), ...spots(Math.round(n.pebbles * 0.6), 1, 56, 0.6)], by = split(sp, 2); add('pebbles', by.map((it, v) => [baked(`pebbles:${v}`, (b) => pebblesInto(b, 0, 0, 0, 1.3, v)), it, { cast: false, seed: v }])); }
  // shore: pale beach grass on the grass lip and a few bleached logs
  { const sp = []; let g = 0; while (sp.length < n.beach && g++ < 2000) { const th = rng() * TAU, d = 0.5 + rng() * 2.2, r = shore(th) - d, x = Math.cos(th) * r, z = Math.sin(th) * r; if (pathCover(x, z) > 0.1) continue; sp.push({ x, y: hy(x, z), z, yaw: rng() * TAU, s: 1.1 + rng() * 0.8 }); }
    add('beachgrass', [[baked('beachgrass', (b) => { tuftInto(b, 0, 0, 0, 1.5, '#cdeb7e', 4, 1.2); tuftInto(b, 0.05, 0, 0.03, 1.0, '#e6f59a', 2, 1.2); }), sp, { cast: false, seed: 5, tint: 0.1 }]]); }
  { const sp = []; let g = 0; while (sp.length < n.logs && g++ < 400) { const th = rng() * TAU, d = 0.7 + rng() * 1.6, r = shore(th) - d, x = Math.cos(th) * r, z = Math.sin(th) * r; sp.push({ x, y: hy(x, z), z, yaw: rng() * TAU, s: 0.8 + rng() * 0.5 }); }
    add('driftwood', [[baked('driftwood', (b) => { b.add(G.cyl(0.8, 6), { p: [0, 0.07, 0], s: [0.07, 0.9, 0.07], r: [0, 0.3, Math.PI / 2], c: '#f0d9b4', grad: 0.5, ao: 0.1 }); b.add(G.cyl(0.8, 6), { p: [0.15, 0.05, 0.18], s: [0.05, 0.5, 0.05], r: [0, 1.4, Math.PI / 2], c: '#e8cfa8', grad: 0.5, ao: 0.1 }); }), sp, { cast: false, seed: 6, tint: 0.05 }]]); }
  maskTex().needsUpdate = true;
  stats.total = Object.values(stats).reduce((a, b) => a + b, 0); return stats;
}

// =================================================================== WORLD LAYOUT: paths, ponds, brooks, keep-clear spots
// One shared description of the valley floor. The ground shader paints paths and banks from a 1024 x 1024 mask (R dirt, G cobble, B wet bank,
// A petal litter); the furniture (bridges, lanterns, signposts, stepping stones) and the scatter read the same numbers so nothing disagrees.
const MASK_N = 1024, MASK_EXT = 80, FLAT_HALF = 43.9, RR = 23.6;
const ringPt = (a, k = 1) => { const r = RR * k * (1 + 0.022 * Math.sin(2 * a + 0.5) + 0.014 * Math.sin(5 * a + 1.3) + 0.008 * Math.sin(9 * a + 0.2)); return [Math.cos(a) * r, Math.sin(a) * r]; };
/** world position and heading of a village's gate (the plot arch turns to the nearest quarter turn toward the centre, exactly like plotModel) */
function gateOf(i) {
  const [ox, oz] = slotOrigin(i), a = Math.atan2(-oz, -ox), dx = Math.cos(a), dz = Math.sin(a), rot = Math.round(Math.atan2(dx, dz) / (Math.PI / 2)) * (Math.PI / 2); let fx = Math.sin(rot), fz = Math.cos(rot), x = ox + fx * 8.62, z = oz + fz * 8.62, corner = false;
  for (let k = 0; k < 16; k++) { if (k === i) continue; const [px, pz] = slotOrigin(k); if (Math.abs(x - px) < 8.9 && Math.abs(z - pz) < 8.9) corner = true; }   // a corner village's gate can face its neighbour: the road then leaves from the inner corner
  if (corner) { fx = -Math.sign(ox) * Math.SQRT1_2; fz = -Math.sign(oz) * Math.SQRT1_2; x = ox - Math.sign(ox) * 9.1; z = oz - Math.sign(oz) * 9.1; }
  return { i, ox, oz, rot, fx, fz, x, z, corner };
}
// spots the game itself fills (props, merchant, monument): decoration keeps out of these circles [x, z, radius]
const KEEP = [[12.0, 12.0, 3.0], [10.0, 16.8, 2.0], [-11.7, 11.7, 2.6], [-9.2, 17.7, 2.6], [-12.4, -12.4, 3.0], [-6.8, -12.8, 1.8], [12.4, -12.4, 3.0], [4.6, 5.6, 4.2], [0, -5.4, 3.6]];
const PONDS = [{ x: -16.0, z: 7.6, rx: 3.1, rz: 2.4, rot: 0.5, ducks: true }, { x: -18.0, z: -8.0, rx: 2.2, rz: 1.8, rot: -0.3 }, { x: 18.6, z: -5.6, rx: 2.5, rz: 2.0, rot: 0.2 }, { x: 56, z: 22, rx: 5.4, rz: 3.7, rot: 0.35, big: true }];
const FALL_TH = [1.05, 3.0, 4.75];
/** a brook from a spring just outside the village ring down to the rim, where it becomes a waterfall; [x, z] points, upstream first */
function streamPts(th, R = 72) {
  const s = shoreOf(R, th), cth = Math.cos(th), sth = Math.sin(th), tx = -sth, tz = cth, out = []; let d0 = 30;
  for (let d = 30; d > 0; d -= 0.25) { const rr = s - d; if (Math.max(Math.abs(cth * rr), Math.abs(sth * rr)) >= 49) { d0 = d; break; } }
  for (let d = d0; d > -0.01; d -= 1.1) { const rr = s - Math.max(d, 0), off = 0.9 * Math.sin(Math.max(d, 0) * 0.45 + th * 3); out.push([cth * rr + tx * off, sth * rr + tz * off]); }
  return out;
}
let _LAY;
function layout() {
  if (_LAY) return _LAY;
  const L = _LAY = { gates: [], paths: [], ring: [], stubs: [], streams: [], springs: [], mask: new Uint8Array(MASK_N * MASK_N * 4), keep: KEEP, ponds: PONDS, brooks: [] };
  const M = L.mask, S = MASK_N / (2 * MASK_EXT);
  const stamp = (x, z, r, fe, ch, amt = 255) => {
    const px = (x + MASK_EXT) * S, pz = (z + MASK_EXT) * S, R = (r + fe) * S, x0 = Math.max(0, Math.floor(px - R)), x1 = Math.min(MASK_N - 1, Math.ceil(px + R)), z0 = Math.max(0, Math.floor(pz - R)), z1 = Math.min(MASK_N - 1, Math.ceil(pz + R));
    for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) { const d = Math.hypot(i + 0.5 - px, j + 0.5 - pz) / S, v = amt * clamp((r + fe - d) / fe); const k = (j * MASK_N + i) * 4 + ch; if (v > M[k]) M[k] = v; }
  };
  L.stamp = stamp;
  const lineStamp = (pts, hw, fe, ch, amt) => { for (const q of pts) stamp(q.x, q.z, hw, fe, ch, amt); };
  const curveOf = (arr, closed = false) => new THREE.CatmullRomCurve3(arr.map(([x, z]) => new THREE.Vector3(x, 0, z)), closed, 'centripetal');
  // one dirt path from every village gate to the ring road (computed first: the ring cobbles its crossings)
  const juncA = []; for (let k = 0; k < 4; k++) juncA.push(k * Math.PI / 2);
  for (let i = 0; i < 16; i++) {
    const g = gateOf(i); L.gates.push(g); const A = [g.x + g.fx * 6, g.z + g.fz * 6], phi = Math.atan2(A[1], A[0]), T = ringPt(phi, 0.99), G0 = [g.x + g.fx * 0.5, g.z + g.fz * 0.5], G1 = [g.x + g.fx * 2.6, g.z + g.fz * 2.6]; juncA.push(phi);
    const mid = [(G1[0] + T[0]) / 2 + g.fz * 1.1 * (i % 2 ? 1 : -1), (G1[1] + T[1]) / 2 - g.fx * 1.1 * (i % 2 ? 1 : -1)], cur = curveOf([G0, G1, mid, T]), sp = cur.getSpacedPoints(Math.max(12, Math.round(cur.getLength() / 0.35)));
    L.paths.push({ gate: g, curve: cur, pts: sp, len: cur.getLength(), end: T });
    sp.forEach((q, qi) => stamp(q.x, q.z, 0.4 + 0.12 * Math.sin(qi * 0.5 + i), 0.55, 0, 255));
    stamp(g.x + g.fx * 0.9, g.z + g.fz * 0.9, 0.55, 0.35, 1, 255);
  }
  // ring road: a dirt road of wandering width, paved with cobbles where the paths and the field stubs cross it
  { const pts = []; for (let k = 0; k < 40; k++) pts.push(ringPt(k / 40 * TAU)); const c = curveOf(pts, true); L.ringCurve = c; const sp = c.getSpacedPoints(480); L.ring = sp;
    sp.forEach((q, qi) => { const a = Math.atan2(q.z, q.x); let near = 9; for (const ja of juncA) { let d = Math.abs(a - ja) % TAU; if (d > Math.PI) d = TAU - d; near = Math.min(near, d); }
      stamp(q.x, q.z, 0.78 + 0.18 * Math.sin(qi * 0.07) + 0.12 * Math.sin(qi * 0.23 + 2), 0.65, 0, 255); const cb = clamp(1 - near / 0.3); if (cb > 0.1) stamp(q.x, q.z, 0.62 * cb, 0.28, 1, 255); }); }
  // four axis stubs from the ring to the field paths (cobbled)
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2, c = Math.cos(a), s = Math.sin(a), pts = [[c * 23.2, s * 23.2], [c * 20.5, s * 20.5], [c * 18.5, s * 18.5], [c * 16.6, s * 16.6]], cur = curveOf(pts), sp = cur.getSpacedPoints(40); L.stubs.push({ a, curve: cur, pts: sp }); lineStamp(sp, 0.9, 0.65, 0, 255); lineStamp(sp, 0.62, 0.28, 1, 255); }
  // footpaths from the plaza to the picnic spots on the diagonals (the merchant keeps the south-east one)
  for (const [kx, kz] of [[-11.7, 11.7], [-12.4, -12.4], [12.4, -12.4]]) { const a = Math.atan2(kz, kx), q0 = [Math.cos(a) * 9.9, Math.sin(a) * 9.9], l = Math.hypot(kx, kz), q2 = [kx * (1 - 2.4 / l), kz * (1 - 2.4 / l)], mid = [(q0[0] + q2[0]) / 2 - Math.sin(a) * 0.7, (q0[1] + q2[1]) / 2 + Math.cos(a) * 0.7], cur = curveOf([q0, mid, q2]), sp = cur.getSpacedPoints(Math.round(cur.getLength() / 0.3)); L.walks = L.walks || []; L.walks.push({ pts: sp }); lineStamp(sp, 0.38, 0.55, 0, 255); }
  // brooks from the springs to the rim
  for (const th of FALL_TH) { const pts = streamPts(th), cur = curveOf(pts), sp = cur.getSpacedPoints(Math.round(cur.getLength() / 0.3)); L.streams.push({ th, pts, curve: cur, bb: [Math.min(...pts.map((q) => q[0])), Math.min(...pts.map((q) => q[1])), Math.max(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[1]))] }); lineStamp(sp, 1.0, 0.8, 2, 255);
    const q = pts[0], q1 = pts[1]; L.springs.push({ x: q[0], z: q[1], rx: 1.7, rz: 1.3, rot: Math.atan2(q1[1] - q[1], q1[0] - q[0]) }); stamp(q[0], q[1], 2.2, 1.4, 2, 255); }
  // wet banks around the ponds
  for (const pd of PONDS) { stamp(pd.x, pd.z, Math.max(pd.rx, pd.rz) + 0.5, 1.4, 2, 255); }
  for (const br of BROOKS) { const cur = curveOf(br.pts), sp = cur.getSpacedPoints(Math.round(cur.getLength() / 0.25)); L.brooks.push(cur); lineStamp(sp, br.w + 0.45, 0.8, 2, 255); }
  return L;
}
const maskTex = () => { const L = layout(); if (!L.tex) { const t = new THREE.DataTexture(L.mask, MASK_N, MASK_N, THREE.RGBAFormat); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true; L.tex = t; GU.uMask.value = t; } return L.tex; };
/** 0..1 how much of the ground at (x,z) is path (dirt or cobble) or wet bank: used to keep scatter off the roads and the water */
function pathCover(x, z) {
  const L = layout(), i = Math.floor((x + MASK_EXT) * MASK_N / (2 * MASK_EXT)), j = Math.floor((z + MASK_EXT) * MASK_N / (2 * MASK_EXT)); if (i < 0 || j < 0 || i >= MASK_N || j >= MASK_N) return 0;
  const k = (j * MASK_N + i) * 4; return Math.max(L.mask[k], L.mask[k + 1], L.mask[k + 2]) / 255;
}

// =================================================================== WORLD DRESSING: lamps, benches, signposts, bridges, ponds, brooks, stepping stones
// Everything below is baked once into a few merged meshes (matte / water / lantern), so a whole village of landmarks costs 3 draw calls.
const WAT = ['#dcfbf6', '#a4ecf0', '#66d8ee', '#4ec6e8'];   // pond rim, shallows, middle, deep
const BROOKS = [{ pts: [[-18.7, 6.0], [-20.5, 3.0], [-20.7, 0.0], [-20.0, -3.4], [-19.2, -6.6]], w: 0.5 }];
function reedInto(b, x, z, s = 1, y = 0, n = 6, sw = 1) {
  const r = krng(Math.floor(x * 31 + z * 17) + 5);
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, lean = (r() - 0.5) * 0.45, h = (0.65 + r() * 0.6) * s, ox = x + Math.cos(a) * 0.14 * s, oz = z + Math.sin(a) * 0.14 * s, dx = Math.sin(lean) * Math.sin(a), dz = Math.sin(lean) * Math.cos(a);
    b.add(G.cyl(0, 3, true), { p: [ox, y, oz], s: [0.032 * s, h, 0.032 * s], r: [lean, a, 0], c: i % 2 ? '#86e05a' : '#5fd163', grad: 0.8, ao: 0, sw });
    if (i % 3 === 0) { b.lump(0.034 * s, ox + dx * h * 0.82, y + Math.cos(lean) * h * 0.82, oz + dz * h * 0.82, '#d9a064', { d: 0, s: [1, 2.6, 1], grad: 0.4, ao: 0, sw: sw * 0.9 }); }
  }
}
function lampInto(b, x, z, s = 1, y = 0, c = '#7fd0c4') {
  b.cyl(0.03 * s, 0.065 * s, 1.5 * s, x, y, z, c, { seg: 5, grad: 0.5, ao: 0.12, open: true }); b.cyl(0.1 * s, 0.1 * s, 0.035 * s, x, y + 1.44 * s, z, c, { seg: 5, ao: 0, grad: 0, open: true });
  b.plain(0.21 * s, 0.3 * s, 0.21 * s, x, y + 1.46 * s, z, '#ffe08a', { m: 'lantern', ao: 0 }); b.cyl(0, 0.19 * s, 0.15 * s, x, y + 1.76 * s, z, c, { seg: 5, ao: 0, grad: 0.4, open: true });
  b.add(G.octa(), { p: [x, y + 1.95 * s, z], s: 0.045 * s, c: '#ffd24a', grad: 0, ao: 0 });
  flowerInto(b, x + 0.14 * s, y, z + 0.06 * s, FLOWERS[(Math.floor(Math.abs(x * 3 + z))) % 6], 0.7, 0.12, false, Math.floor(Math.abs(x)) % 4);
}
function signInto(b, x, z, yaw, boards = 2, y = 0) {
  b.xf(x, y, z, 1, yaw, () => {
    b.cyl(0.04, 0.055, 1.25, 0, 0, 0, WOOD_D, { seg: 5, grad: 0.5, open: true }); b.lump(0.07, 0, 1.28, 0, '#ffd24a', { d: 0, ao: 0 });
    for (let k = 0; k < boards; k++) { const yy = 1.0 - k * 0.27, side = k % 2 ? -1 : 1; b.plain(0.62, 0.17, 0.045, side * 0.29, yy, 0, k % 2 ? '#fff0c8' : '#ffe2b0', { grad: 0.4, ao: 0, r: [0, 0, side * 0.04] }); b.add(G.octa(), { p: [side * 0.64, yy + 0.085, 0], s: [0.1, 0.1, 0.03], c: k % 2 ? '#fff0c8' : '#ffe2b0', grad: 0.3, ao: 0, r: [0, 0, side * 0.8] }); b.plain(0.1, 0.03, 0.05, side * 0.17, yy + 0.08, 0.002, ['#ff9ec4', '#8fd0ff', '#ffd24a'][k % 3], { ao: 0, grad: 0 }); }
    flowerInto(b, 0.16, 0, 0.1, FLOWERS[(boards * 2) % 6], 0.7, 0.12, false, 0); flowerInto(b, -0.14, 0, -0.1, FLOWERS[(boards * 2 + 2) % 6], 0.7, 0.12, false, 1);
  });
}
function benchInto(b, x, z, yaw, c = '#ffc2d6', y = 0) {
  b.xf(x, y, z, 1, yaw, () => { b.plain(1.15, 0.07, 0.4, 0, 0.33, 0, c, { grad: 0.5, ao: 0.1 }); b.plain(1.15, 0.24, 0.05, 0, 0.42, -0.19, c, { r: [-0.12, 0, 0], grad: 0.5, ao: 0 });
    for (const sx of [-0.48, 0.48]) b.plain(0.08, 0.33, 0.36, sx, 0, 0, '#f6ecd6', { grad: 0.6, ao: 0.2 }); b.shadow(0, -0.04, 0.8, 0.22, 1.2, 0.55, 0.0); });
}
function bridgeInto(b, x, z, yaw, len = 2.8, w = 1.5, y = 0) {
  b.xf(x, y, z, 1, yaw, () => {   // spans along X, arched
    const n = 9, step = len / n;
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, h = 0.1 + 0.34 * Math.sin(Math.PI * t) ** 0.8; b.plain(step * 0.92, 0.07, w, -len / 2 + (i + 0.5) * step, h, 0, i % 2 ? '#f6c98c' : '#ffd9a0', { r: [0, 0, Math.cos(Math.PI * t) * -0.34], grad: 0.5, ao: 0.1 }); }
    for (const sz of [-1, 1]) { for (let i = 0; i <= 4; i++) { const t = i / 4, h = 0.18 + 0.34 * Math.sin(Math.PI * t) ** 0.8; b.plain(0.07, 0.38, 0.07, -len / 2 + t * len, h, sz * (w / 2 - 0.02), '#e6b27a', { ao: 0.1, grad: 0.5 }); b.lump(0.05, -len / 2 + t * len, h + 0.4, sz * (w / 2 - 0.02), i % 2 ? '#ff9ec4' : '#fff2a0', { d: 0, ao: 0 }); }
      for (let i = 0; i < 4; i++) { const t0 = i / 4, t1 = (i + 1) / 4, x0 = -len / 2 + t0 * len, x1 = -len / 2 + t1 * len, h0 = 0.54 + 0.34 * Math.sin(Math.PI * t0) ** 0.8, h1 = 0.54 + 0.34 * Math.sin(Math.PI * t1) ** 0.8; b.plain(Math.hypot(x1 - x0, h1 - h0) + 0.04, 0.045, 0.045, (x0 + x1) / 2, (h0 + h1) / 2 - 0.02, sz * (w / 2 - 0.02), '#f0bf86', { r: [0, 0, Math.atan2(h1 - h0, x1 - x0)], ao: 0, grad: 0.3 }); } }
    for (const sx of [-1, 1]) b.rock(0.3, sx * (len / 2 + 0.05), 0.08, 0, '#f6ecd6', { d: 0, s: [1.1, 0.5, w * 0.8], seed: sx + 4, ao: 0.1, moss: { c: MOSS, amt: 0.6 } });
    b.shadow(0, 0, len * 0.5, 0.2, 1, 0.7, 0.0);
  });
}
function stepsInto(b, pts, scale = 1, y = 0) {
  const pal = ['#fff3d2', '#e8f2fb', '#ffe6c2', '#ffe3ea'];
  pts.forEach(([x, z], i) => { b.lump(0.24 * scale * (0.85 + 0.3 * hash(x, z)), x, y + 0.035, z, pal[i % 4], { d: 0, s: [1.15, 0.28, 1], jit: 0.08, grad: 0.5, ao: 0.08, seed: i, r: [0, hash(z, x) * 6, 0] }); });
}
const trailPts = (x0, z0, x1, z1, step = 0.85) => { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.round(L / step)), out = []; for (let i = 0; i <= n; i++) { const t = i / n, w = (i % 2 ? 1 : -1) * 0.12; out.push([lerp(x0, x1, t) - (z1 - z0) / L * w, lerp(z0, z1, t) + (x1 - x0) / L * w]); } return out; };
function firePitInto(b, x, z) {
  b.xf(x, 0, z, 1, 0, () => { for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; b.rock(0.13, Math.cos(a) * 0.62, 0.07, Math.sin(a) * 0.62, i % 2 ? '#f6ecd6' : '#ece2cc', { d: 0, seed: 20 + i % 4, s: [1.1, 0.8, 1], ao: 0.1 }); }
    b.add(G.cyl(1, 6), { p: [0.1, 0.1, 0.1], s: [0.06, 0.6, 0.06], r: [0, 0, 1.3], c: '#c58c5c', grad: 0.4, ao: 0 }); b.add(G.cyl(1, 6), { p: [-0.1, 0.1, 0.0], s: [0.06, 0.6, 0.06], r: [0.4, 0.8, 1.2], c: '#d9a064', grad: 0.4, ao: 0 });
    b.add(G.octa(), { m: 'lantern', p: [0, 0.22, 0], s: [0.13, 0.22, 0.13], c: '#ffb440', grad: 0, ao: 0 });
    for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.5; b.add(G.cyl(1, 8), { p: [Math.cos(a) * 1.35, 0.17, Math.sin(a) * 1.35], s: [0.17, 0.5, 0.17], r: [0, 0, Math.PI / 2], c: '#e8a870', grad: 0.5, ao: 0.1 }); b.add(G.rings(), { p: [Math.cos(a) * 1.35 + Math.sin(a) * 0.255, 0.17, Math.sin(a) * 1.35 - Math.cos(a) * 0.255], s: 0.17, r: [0, a + Math.PI / 2, Math.PI / 2], ao: 0 }); }
    b.shadow(0, 0, 2.0, 0.18, 1, 1, 0.0); });
}
function pondInto(b, pd, seed, lite = false) {
  const r = krng(seed * 13 + 3), rows = [{ r: 0, y: 0.05, c: () => WAT[3] }, { r: 0.4, y: 0.05, c: () => WAT[2] }, { r: 0.78, y: 0.05, c: () => WAT[1] }, { r: 1, y: 0.05, c: () => WAT[0] }];
  const wob = (th) => pd.rx * pd.rz / Math.hypot(pd.rz * Math.cos(th), pd.rx * Math.sin(th)) * (1 + 0.07 * Math.sin(th * 3 + seed) + 0.04 * Math.sin(th * 5 + seed * 2));
  b.xf(pd.x, 0, pd.z, 1, pd.rot, () => {
    b.geo(polarGeo(rows, lite ? 16 : 24, { wob, nUp: 1 }), 'water', { ao: 0 });
    const ell = (a, k) => [Math.cos(a) * wob(a) * k, Math.sin(a) * wob(a) * k];
    for (let i = 0, nr = lite ? 6 : pd.big ? 20 : 11; i < nr; i++) { const a = i / nr * TAU + r() * 0.2; const [x, z] = ell(a, 1.07 + r() * 0.1), sc = 0.1 + r() * 0.13; b.rock(sc, x, sc * 0.35, z, ['#fff0cc', '#f6ecd6', '#d8e8f8'][i % 3], { d: 0, seed: (i + seed) % 5, s: [1.2, 0.75, 1], ao: 0.1, moss: { c: MOSS, amt: 0.7 } }); }
    for (const a of lite ? [1.0, 4.2] : pd.big ? [0.5, 1.9, 2.8, 4.1, 5.2, 5.9] : [0.9, 2.7, 4.1, 5.4]) { const [x, z] = ell(a + r() * 0.2, 1.0); reedInto(b, x, z, 0.9 + r() * 0.4, 0.04, lite ? 4 : 6); }
    for (let k = 0, nl = lite ? 3 : pd.big ? 14 : 8; k < nl; k++) { const a = r() * TAU, [x, z] = ell(a, 0.35 + r() * 0.45), q = 0.2 + r() * 0.15; b.add(G.disc(9), { p: [x, 0.062 + k * 0.002, z], s: [q, 1, q], r: [0, r() * 6, 0], c: k % 2 ? '#6fe27a' : '#8aee84', grad: 0, ao: 0 }); if (k % 3 === 0) { b.lump(0.09, x, 0.1, z, '#ff9ec4', { d: 0, s: [1, 0.7, 1], grad: 0.4, ao: 0 }); b.add(G.octa(), { p: [x, 0.14, z], s: 0.035, c: '#ffe066', grad: 0, ao: 0 }); } }
    b.shadow(0, 0, Math.max(pd.rx, pd.rz) + 0.6, 0.0, 1, 1, 0.0);
    for (let i = 0; i < (lite ? 1 : 3); i++) { const a = r() * TAU, [x, z] = ell(a, 1.25); flowerInto(b, x, 0, z, FLOWERS[(i + seed) % 6], 0.9, 0.16, i === 0, i); }
  });
}
function brookInto(b, br) {
  const cur = new THREE.CatmullRomCurve3(br.pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal'), N = Math.max(6, Math.round(cur.getLength() / 0.6)), rings = [];
  for (let i = 0; i <= N; i++) { const t = i / N, p = cur.getPointAt(t), d = cur.getTangentAt(t), w = br.w * (0.8 + 0.25 * Math.sin(i * 0.9)); rings.push([[-1, WAT[0]], [-0.45, WAT[1]], [0, WAT[2]], [0.45, WAT[1]], [1, WAT[0]]].map(([u, c]) => ({ x: p.x - d.z * u * w, y: 0.05 + (u === 0 ? -0.01 : 0), z: p.z + d.x * u * w, c }))); }
  b.geo(sweepGeo(rings, { orient: 'up' }), 'water', { ao: 0 });
  const r = krng(77); for (let i = 0; i < 12; i++) { const t = (i + r() * 0.8) / 12, p = cur.getPointAt(t), d = cur.getTangentAt(t), side = i % 2 ? 1 : -1, off = br.w * 1.25 * side, sc = 0.07 + r() * 0.09; b.rock(sc, p.x - d.z * off, sc * 0.4, p.z + d.x * off, ['#fff0cc', '#f6ecd6', '#d8e8f8'][i % 3], { d: 0, seed: 40 + i % 4, s: [1.2, 0.7, 1], ao: 0.1, moss: { c: MOSS, amt: 0.6 } }); if (i % 3 === 0) reedInto(b, p.x - d.z * off * 1.3, p.z + d.x * off * 1.3, 0.8, 0.0, 4); }
  return cur;
}
/** the dressing group: merged meshes named dressing_matte / dressing_water / dressing_lantern */
/** set pieces on the hills and the lake of the outer lobes: standing stones, a lone blossom tree, a picnic, a stone arch, a pier */
function lobeFeatures(b, hy) {
  const r = krng(515), stone = ['#f6ecd6', '#ece2cc', '#d8e8f8'];
  { const [cx, cz] = HILLS[0], cy = hy(cx, cz);   // north hill: ring of standing stones round a flat altar
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + 0.2, x = cx + Math.cos(a) * 2.7, z = cz + Math.sin(a) * 2.7, sy = 2.0 + 0.9 * hash(i, 4), gy = hy(x, z); b.rock(0.4, x, gy + 0.4 * sy * 0.5, z, stone[i % 3], { d: 0, seed: i % 6, s: [0.75, sy, 0.75], r: [0, r() * 6, 0], moss: { c: MOSS, amt: 0.8 }, ao: 0.1 }); flowerInto(b, x + 0.3, gy, z, FLOWERS[i % 6], 1.0, 0.14, false, i % 4); tuftInto(b, x - 0.25, gy, z + 0.2, 0.9, '#6edb58', 3, 0.9); }
    b.rock(0.9, cx, cy + 0.2, cz, '#f6ecd6', { d: 1, seed: 3, s: [1.3, 0.35, 1.3], moss: { c: MOSS, amt: 0.7 }, ao: 0.1 }); for (let i = 0; i < 4; i++) flowerInto(b, cx + Math.cos(i * 1.6) * 0.5, cy + 0.2, cz + Math.sin(i * 1.6) * 0.5, FLOWERS[(i + 2) % 6], 1.1, 0.14, i === 0, i); }
  { const [cx, cz] = HILLS[1], cy = hy(cx, cz);   // east hill: a lone blossom tree with a bench and two lamps
    b.xf(cx, cy - 0.05, cz, 1.55, 0.6, () => treeInto(b, 'blossom', 1, 1)); benchInto(b, cx + 2.4, cz - 0.6, -1.9, '#ffc2d6', hy(cx + 2.4, cz - 0.6)); lampInto(b, cx + 3.3, cz + 0.6, 1, hy(cx + 3.3, cz + 0.6), '#ffb4c8'); lampInto(b, cx - 3.0, cz + 1.8, 1, hy(cx - 3.0, cz + 1.8), '#7fd0c4');
    for (let i = 0; i < 5; i++) { const a = i * 1.3 + 0.5, x = cx + Math.cos(a) * 2.0, z = cz + Math.sin(a) * 2.0; flowerInto(b, x, hy(x, z), z, FLOWERS[i % 6], 1.1, 0.15, i % 2 === 0, i % 4); } }
  { const [cx, cz] = HILLS[2], cy = hy(cx, cz);   // south hill: a picnic with a basket and hay bales
    b.xf(cx, cy, cz, 1, 0.5, () => { b.plain(2.2, 0.035, 1.7, 0, 0.0, 0, '#ffd2e0', { ao: 0, grad: 0.2 }); b.plain(1.1, 0.04, 0.85, 0.2, 0.0, 0.1, '#ffffff', { ao: 0, grad: 0.2, r: [0, 0.2, 0] }); b.add(G.lathe([[0.2, 0], [0.26, 0.1], [0.28, 0.24], [0.24, 0.26]], 7), { p: [-0.5, 0.03, -0.2], c: '#e8b07a', grad: 0.6 }); b.lump(0.22, -0.5, 0.3, -0.2, '#fff0cf', { d: 0, s: [1, 0.55, 1], ao: 0, grad: 0.5 });
      for (const [x, z, yw] of [[1.7, -0.8, 0.3], [1.9, 0.3, -0.2]]) { b.add(G.cyl(1, 8), { p: [x, 0.3, z], s: [0.3, 0.55, 0.3], r: [0, yw, Math.PI / 2], c: '#ffd966', grad: 0.5, ao: 0.1 }); }
      for (let i = 0; i < 6; i++) { const a = i * 1.05; flowerInto(b, Math.cos(a) * 1.9 - 0.2, 0, Math.sin(a) * 1.7, FLOWERS[i % 6], 1.1, 0.15, i % 2 === 0, i % 4); } }); }
  { const [cx, cz] = HILLS[3], cy = hy(cx, cz);   // west hill: a stone arch with lanterns
    b.xf(cx, cy, cz, 1, -0.4, () => { for (const sx of [-1, 1]) b.rock(0.55, sx * 1.4, 0.8, 0, '#f6ecd6', { d: 0, seed: sx + 3, s: [0.7, 2.6, 0.7], moss: { c: MOSS, amt: 0.8 }, ao: 0.1 }); b.rock(0.5, 0, 2.25, 0, '#ece2cc', { d: 0, seed: 2, s: [3.2, 0.6, 0.9], moss: { c: MOSS, amt: 0.8 }, ao: 0 });
      buntingInto(b, (t) => [-1.4 + t * 2.8, 2.05, 0.0], 7, 0.22, 0.25); for (const sx of [-1, 1]) { b.plain(0.12, 0.2, 0.12, sx * 0.9, 1.65, 0, '#ffe08a', { m: 'lantern', ao: 0 }); for (let i = 0; i < 3; i++) flowerInto(b, sx * 1.4 + Math.cos(i * 2.1) * 0.5, 0, Math.sin(i * 2.1) * 0.5, FLOWERS[(i + 1 + (sx > 0 ? 2 : 0)) % 6], 1.0, 0.14, false, i); } }); }
  { const lk = PONDS.find((q) => q.big);   // the lake: a wooden pier running out from the shore and a few lily pads
    b.xf(lk.x, 0, lk.z, 1, lk.rot, () => { for (let i = 0; i < 9; i++) b.plain(0.36, 0.05, 1.25, lk.rx * 1.05 - i * 0.44, 0.16, 0, i % 2 ? '#f6c98c' : '#ffd9a0', { ao: 0.1, grad: 0.4 }); for (const sz of [-1, 1]) for (let i = 0; i < 4; i++) b.cyl(0.05, 0.06, 0.5, lk.rx * 1.05 - i * 1.2, 0.0, sz * 0.62, '#c58c5c', { seg: 5, open: true, ao: 0.1 }); b.lump(0.1, lk.rx * 1.05 - 3.8, 0.3, 0.55, '#ff9ec4', { d: 0, ao: 0 }); lampInto(b, lk.rx * 1.05 - 3.8, -0.55, 0.8, 0.16); });
  }
}
function buildDressing(hy) {
  const L = layout(), b = new Builder(0), r = krng(404);
  lobeFeatures(b, hy);
  // lamp posts along the ring road (outer side) and a bench between every few of them
  const NL = 12; for (let k = 0; k < NL; k++) { const a = (k + 0.5) / NL * TAU, [x, z] = ringPt(a, 1.09); lampInto(b, x, z, 1, 0, k % 2 ? '#7fd0c4' : '#ffb4c8'); }
  for (let k = 0; k < 6; k++) { const a = (k + 0.25) / 6 * TAU + 0.12, [x, z] = ringPt(a, 0.915), [cx, cz] = ringPt(a, 1); benchInto(b, x, z, Math.atan2(-(cx - x), -(cz - z)) + Math.PI, ['#a8ecd2', '#ffc2d6', '#fff0a0', '#cfc4ff', '#b4d8fa', '#ffd9a0'][k]); }
  // signposts at the four axis junctions
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2, [x, z] = ringPt(a + 0.07, 1.075); signInto(b, x, z, -a + 0.4, 3); }
  // every village gate: a lot marker and a lantern where the path meets the ring, a few stepping stones leaving the gate
  for (const p of L.paths) { const g = p.gate, nx = -g.fz, nz = g.fx; if (g.i % 2) continue; lampInto(b, g.x + g.fx * 1.6 - nx * 1.5, g.z + g.fz * 1.6 - nz * 1.5, 0.9, 0, '#ffb4c8'); }
  // stepping-stone trails from the ring road to the picnic spots, plus a few along the ponds
  for (const [kx, kz] of [[12.0, 12.0], [-11.7, 11.7], [-12.4, -12.4], [12.4, -12.4], [10.0, 16.8], [-9.2, 17.7]]) { const a = Math.atan2(kz, kx), [sx, sz] = ringPt(a, 0.93), l = Math.hypot(kx - sx, kz - sz), t = 1 - 2.4 / l; stepsInto(b, trailPts(sx, sz, kx + (sx - kx) * (2.2 / l), kz + (sz - kz) * (2.2 / l))); }
  stepsInto(b, trailPts(-19.4, 5.6, -22.5, 9.5)); stepsInto(b, trailPts(-14.7, 3.4, -14.5, -0.5));
  // ponds, brooks, bridge, fire pit
  [...PONDS, ...L.springs].forEach((pd, i) => pondInto(b, pd, i + 1, i >= PONDS.length));
  for (const br of BROOKS) brookInto(b, br);
  bridgeInto(b, -20.55, 0.0, 0, 2.7, 1.4);
  firePitInto(b, 5.5, -18.3);
  for (const [a, rr, c] of [[1.25, 4.1, '#ffd9a0'], [2.65, 4.3, '#ffc2d6']]) benchInto(b, PONDS[0].x + Math.cos(a) * rr, PONDS[0].z + Math.sin(a) * rr, Math.atan2(-Math.cos(a), -Math.sin(a)), c);
  const e = b.bake(); L.dressTris = e.tris; const gr = instantiate(e, { shadows: false }); gr.name = 'dressing'; gr.children.forEach((m, i) => { m.name = 'dressing_' + (m.material === waterMat ? 'water' : m.material === lanternMat ? 'lantern' : 'matte'); if (m.material !== waterMat && m.material !== lanternMat) m.castShadow = false; }); return gr;
}

// =================================================================== HORIZON AND SEA LIFE: distant islets, lighthouse, windmill hill, rope bridge, sandbar, boats, buoys
// All of it sits outside the playable ring (110 to 230 units from the middle) so it never blocks a view; fog tints it pastel. Static parts are two merged meshes,
// the windmill sails turn by themselves, and every boat is a group named `sail` (drifting on its own: the scene may drive it too).
const _am = new THREE.Matrix4(), _ar = new THREE.Matrix4(), _ae = new THREE.Euler();
/** rotate a mesh about its own origin each frame with no game code: the world matrix is recomputed right before it is drawn */
function selfMotion(mesh, fn) { mesh.onBeforeRender = () => { windTick(); mesh.matrixWorld.multiplyMatrices(mesh.parent.matrixWorld, mesh.matrix); fn(_am.identity(), WIND.value); mesh.matrixWorld.multiply(_am); }; return mesh; }
function farTree(b, x, y, z, s, kind) {
  b.cyl(0.07 * s, 0.11 * s, 0.7 * s, x, y, z, TRUNK, { seg: 4, ao: 0, open: true, grad: 0.4 });
  if (kind === 1) { for (let i = 0; i < 3; i++) b.lump((0.5 - i * 0.12) * s, x, y + (0.7 + i * 0.5) * s, z, i % 2 ? '#3cc47a' : '#44cc84', { d: 0, s: [1, 1.2, 1], seed: i, grad: 0.9, ao: 0, jit: 0.1 }); }
  else { const c = kind === 2 ? '#ffbdd6' : kind === 3 ? '#ffa43a' : '#62d44e'; b.lump(0.66 * s, x, y + 1.0 * s, z, c, { d: 0, seed: 3 + kind, grad: 0.9, ao: 0, jit: 0.08, up: 0.4 }); b.lump(0.4 * s, x + 0.34 * s, y + 0.75 * s, z + 0.1 * s, kind === 2 ? '#ff9ec4' : kind === 3 ? '#ff8a2a' : '#4cc860', { d: 0, grad: 0.9, ao: 0, seed: 7 }); }
}
/** a round islet: grass dome, peach and lilac cliff skirt dipping under the sea */
function isletInto(b, x, z, rad, top, seed, seaY, foamList) {
  const wob = (th) => 1 + 0.13 * Math.sin(th * 3 + seed) + 0.07 * Math.sin(th * 5 + seed * 2.1), gr = ['#a4ee6c', '#94e460', '#b4f27a'];
  const rows = [{ r: 0, y: top, c: () => gr[0] }, { r: 0.45, y: top - 0.08, c: (x, z) => col(gr[seed % 3]).clone().lerp(col(gr[(seed + 1) % 3]), hash(x * 0.7, z * 0.7)) }, { r: 0.78, y: top - 0.45, c: () => '#86d95a' }, { r: 0.88, y: top - 0.75, c: () => '#f0b98c' }, { r: 0.94, y: seaY + 1.4, c: () => '#fcdcae' }, { r: 0.97, y: seaY - 0.2, c: () => '#e8d2c4' }, { r: 1.0, y: seaY - 1.5, c: () => '#bcaec8' }];
  b.xf(x, 0, z, 1, 0, () => { b.geo(polarGeo(rows.map((q) => ({ ...q, r: q.r * rad })), 16, { wob, nUp: 0.2 }), 'matte', { ao: 0 }); });
  const ring = []; for (let q = 0; q <= 22; q++) { const a = q / 22 * TAU, w = wob(a) * rad; ring.push([[x + Math.cos(a) * w * 0.9, seaY + 0.05, z + Math.sin(a) * w * 0.9, rgba('#fff', 0.0), 0, a], [x + Math.cos(a) * w * 1.0, seaY + 0.05, z + Math.sin(a) * w * 1.0, rgba('#fff', 0.9), 0.5, a], [x + Math.cos(a) * w * 1.35, seaY + 0.05, z + Math.sin(a) * w * 1.35, rgba('#fff', 0), 1.4, a]]); } foamList.push(stripAlpha(ring));
}
function lighthouseInto(b, x, y, z, s = 1) {
  const cols = ['#fff6e6', '#ff8272', '#fff6e6', '#ff8272'], prof = [[0.9, 0], [0.84, 1.6], [0.76, 3.2], [0.69, 4.8], [0.62, 6.4]];
  b.xf(x, y, z, s, 0, () => { for (let i = 0; i < 4; i++) b.add(G.lathe([prof[i], prof[i + 1]], 8), { c: cols[i], grad: 0.5, ao: 0.1, aoH: 0.8 }); b.cyl(0.9, 0.9, 0.18, 0, 6.4, 0, '#7fd0c4', { seg: 8, ao: 0 }); b.cyl(0.62, 0.62, 0.9, 0, 6.58, 0, '#ffffff', { seg: 8, ao: 0 }); b.plain(0.6, 0.6, 0.6, 0, 6.66, 0, '#ffe08a', { m: 'lantern', ao: 0 }); b.cyl(0, 0.7, 0.55, 0, 7.45, 0, '#ff6f5f', { seg: 8, ao: 0 }); b.add(G.octa(), { p: [0, 8.1, 0], s: 0.12, c: '#ffd24a', ao: 0, grad: 0 }); b.cyl(1.2, 1.4, 0.5, 0, 0, 0, '#f6ecd6', { seg: 8 }); b.plain(0.5, 0.8, 0.12, 0, 0.3, 0.8, '#b08860', { ao: 0 }); });
}
function windmillInto(b, x, y, z, yaw, s = 1) {
  b.xf(x, y, z, s, yaw, () => { b.cyl(0.8, 1.35, 1.2, 0, 0, 0, '#f6ecd6', { seg: 8, ao: 0.1 }); b.cyl(0.55, 0.8, 2.6, 0, 1.2, 0, '#fff8e6', { seg: 8, ao: 0.1 }); b.cyl(0, 0.85, 1.1, 0, 3.8, 0, '#ff8272', { seg: 8, ao: 0 }); b.plain(0.4, 0.55, 0.1, 0, 0.25, 1.28, '#c58c5c', { ao: 0 }); for (const sx of [-1, 1]) b.plain(0.2, 0.3, 0.06, sx * 0.45, 2.4, 0.6, '#8fd0ff', { ao: 0, grad: 0 }); });
}
function sailsGeo() {   // four lattice sails around the hub, in the XY plane
  const b = new Builder(0); for (let k = 0; k < 4; k++) { b.xf(0, 0, 0, 1, 0, () => { const a = k * Math.PI / 2; b.add(G.plain(), { p: [Math.cos(a) * 1.1, Math.sin(a) * 1.1, 0], s: [Math.abs(Math.cos(a)) * 2.1 + 0.07, Math.abs(Math.sin(a)) * 2.1 + 0.07, 0.07], c: '#e0a468', grad: 0, ao: 0 });
    const cx = Math.cos(a), cy = Math.sin(a), px = -cy, py = cx; b.add(G.plain(), { p: [cx * 1.45 + px * 0.28, cy * 1.45 + py * 0.28, 0], s: [Math.abs(cx) * 1.3 + Math.abs(px) * 0.5, Math.abs(cy) * 1.3 + Math.abs(py) * 0.5, 0.03], c: ['#ff8fb5', '#fff3b8', '#8fd0ff', '#b8f0d0'][k], grad: 0, ao: 0 }); }); }
  b.add(G.octa(), { p: [0, 0, 0.05], s: 0.2, c: '#c58c5c', grad: 0, ao: 0 }); return b.bake().matte;
}
function ropeBridgeInto(b, ax, az, bx, bz, ya, yb, seaY) {
  const L = Math.hypot(bx - ax, bz - az), n = 13, yaw = Math.atan2(bz - az, bx - ax);
  b.xf(ax, 0, az, 1, -yaw, () => { for (let i = 0; i <= n; i++) { const t = i / n, x = t * L, y = lerp(ya, yb, t) - 0.9 * 4 * t * (1 - t); b.plain(0.3, 0.05, 0.95, x, y, 0, i % 2 ? '#f6c98c' : '#ffd9a0', { ao: 0.1, grad: 0.4 }); if (i % 3 === 0) for (const sz of [-1, 1]) { b.plain(0.07, 0.9, 0.07, x, y, sz * 0.5, '#e6b27a', { ao: 0, grad: 0.3 }); b.add(G.octa(), { p: [x, y + 0.95, sz * 0.5], s: 0.07, c: i % 2 ? '#ff9ec4' : '#fff2a0', ao: 0, grad: 0 }); } }
    for (const sz of [-1, 1]) for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n, x0 = t0 * L, x1 = t1 * L, y0 = lerp(ya, yb, t0) - 0.9 * 4 * t0 * (1 - t0) + 0.9, y1 = lerp(ya, yb, t1) - 0.9 * 4 * t1 * (1 - t1) + 0.9; b.plain(Math.hypot(x1 - x0, y1 - y0) + 0.02, 0.04, 0.04, (x0 + x1) / 2, (y0 + y1) / 2, sz * 0.5, '#f0bf86', { r: [0, 0, Math.atan2(y1 - y0, x1 - x0)], ao: 0, grad: 0 }); } });
}
function boatBake(key, hull, sail, trim) {
  return baked(`boat:${key}`, (b) => {
    b.lump(0.5, 0, 0.1, 0, hull, { d: 1, s: [1.75, 0.45, 0.7], jit: 0.04, grad: 0.7, ao: 0 }); b.plain(1.3, 0.06, 0.46, 0, 0.3, 0, '#e8b07a', { ao: 0, grad: 0.3 }); b.plain(1.6, 0.06, 0.1, 0, 0.26, 0.31, trim, { ao: 0, grad: 0 }); b.plain(1.6, 0.06, 0.1, 0, 0.26, -0.31, trim, { ao: 0, grad: 0 });
    b.cyl(0.03, 0.04, 1.7, 0.05, 0.3, 0, '#c58c5c', { seg: 5, ao: 0, open: true }); b.add(G.sail(), { p: [0.14, 0.4, 0], s: [1.0, 1.3, 1], c: sail, grad: 0.3, ao: 0, swc: 0.2 }); b.add(G.sail(), { p: [-0.38, 0.38, 0], s: [0.6, 0.95, 1], r: [0, 0, 0.0], c: '#ffffff', grad: 0.3, ao: 0 });
    b.add(G.flag(), { p: [0.05, 2.0, 0], s: [0.24, 0.3, 1], r: [0, 0, 0], c: trim, grad: 0.2, ao: 0, swc: 0.9 });
  });
}
/** distant scenery, built as a handful of separate meshes (lighthouse, windmill, bridge, sandbar, west and east islets) so the ones off screen are culled. */
function buildHorizon(seaY) {
  const g = new THREE.Group(); g.name = 'horizon'; const r = krng(2024), parts = {}, part = (k) => (parts[k] ||= { b: new Builder(0), foam: [] });
  const islets = [[-92, -118, 8, -1.2, 1], [128, -96, 11, 0.9, 2], [-142, 24, 10, -1.4, 3], [152, 42, 8.5, -1.3, 4], [-76, 104, 5, -2.8, 5], [34, 138, 6.5, -2.6, 6], [-165, -80, 6, -2.7, 7], [90, 120, 5, -2.9, 8], [175, -20, 7, -2.4, 9]];
  islets.forEach(([x, z, rad, top, sd], i) => { const P = part(i === 0 ? 'light' : i === 1 ? 'mill' : x < 0 ? 'west' : 'east'), b = P.b; isletInto(b, x, z, rad, top, sd, seaY, P.foam);
    const nt = i === 0 || i === 1 ? 3 : 2 + (i % 3); for (let k = 0; k < nt; k++) { const a = r() * TAU, rr = r() * rad * 0.62; if (i === 0 && rr < 2.2 && Math.abs(a - 1) < 0.9) continue; farTree(b, x + Math.cos(a) * rr, top + 0.1, z + Math.sin(a) * rr, 1.0 + r() * 0.8, [0, 2, 1, 3, 0, 2][(i + k) % 6]); }
    { const a = r() * TAU, rr = rad * 0.55; flowerInto(b, x + Math.cos(a) * rr, top, z + Math.sin(a) * rr, FLOWERS[i % 6], 1.8, 0.18, true, 0); } });
  lighthouseInto(part('light').b, -92 + 2.2, -1.2 + 0.05, -118 - 1.0, 1.25);
  windmillInto(part('mill').b, 128 - 1.5, 0.9, -96 + 1.0, Math.atan2(128 - 1.5, -96 + 1.0) + Math.PI, 1.5);
  // sea stacks with a rope bridge between two of them
  { const P = part('bridge'), b = P.b, A = [38, -126], B = [48, -124]; for (const [q, hh] of [[A, 6.2], [B, 5.4]]) { b.rock(2.4, q[0], seaY + hh * 0.35, q[1], '#f6ead4', { d: 1, seed: 12, s: [1, 1.6, 1], moss: { c: MOSS, amt: 1 }, ao: 0 }); b.rock(1.2, q[0] + 2.0, seaY + 0.7, q[1] + 1.0, '#e6d8c8', { d: 0, seed: 14, ao: 0 }); tuftInto(b, q[0], seaY + hh * 0.35 * 2 + 1.0, q[1], 1.6, '#7fe05c', 5, 0.9); }
    ropeBridgeInto(b, A[0] + 1.6, A[1], B[0] - 1.6, B[1], seaY + 4.8, seaY + 4.3, seaY);
    for (const [x, z, s] of [[A[0] - 3, A[1] + 2, 1], [B[0] + 3, B[1] - 2, 0.8], [43, -118, 0.6]]) b.rock(1.0 * s, x, seaY + 0.5, z, '#f6ead4', { d: 1, seed: 17, s: [1, 1.2, 1], ao: 0 });
    for (const q of [A, B]) { const ring = []; for (let k = 0; k <= 22; k++) { const a = k / 22 * TAU; ring.push([[q[0], seaY + 0.05, q[1], rgba('#fff', 0), 0, a], [q[0] + Math.cos(a) * 2.8, seaY + 0.05, q[1] + Math.sin(a) * 2.8, rgba('#fff', 0.9), 0.5, a], [q[0] + Math.cos(a) * 5, seaY + 0.05, q[1] + Math.sin(a) * 5, rgba('#fff', 0), 1.4, a]]); } P.foam.push(stripAlpha(ring)); } }
  // sandbar with beach grass, a little tree and shells
  { const P = part('sandbar'), b = P.b; for (let k = 0; k < 6; k++) { const x = 96 + k * 3.1 - 8 + r(), z = 62 + Math.sin(k * 0.8) * 1.4; b.lump(2.1 - Math.abs(k - 2.5) * 0.25, x, seaY + 0.02, z, '#fff1c4', { d: 1, s: [1.5, 0.12, 0.8], jit: 0.05, grad: 0.3, ao: 0 }); if (k % 2 === 0) tuftInto(b, x, seaY + 0.1, z, 1.6, '#cdeb7e', 4, 1); }
    farTree(b, 99, seaY + 0.1, 62.5, 0.9, 0); for (let k = 0; k < 4; k++) b.lump(0.08, 94 + k * 2, seaY + 0.14, 62 + (k % 2) * 0.5, ['#ffffff', '#ffd9e6', '#fff0cf', '#e8dcff'][k], { d: 0, s: [1.2, 0.6, 1], ao: 0, grad: 0.3 });
    const ring = []; for (let k = 0; k <= 22; k++) { const a = k / 22 * TAU; ring.push([[96, seaY + 0.05, 62, rgba('#fff', 0), 0, a], [96 + Math.cos(a) * 9, seaY + 0.05, 62 + Math.sin(a) * 3.6, rgba('#fff', 0.5), 0.5, a], [96 + Math.cos(a) * 12, seaY + 0.05, 62 + Math.sin(a) * 5.2, rgba('#fff', 0), 1.4, a]]); } P.foam.push(stripAlpha(ring)); }
  for (const [x, z, n] of [[-120, -62, 3], [112, -36, 3], [20, -150, 4], [-60, 140, 3]]) { const b = part(x < 0 ? 'west' : 'east').b; for (let k = 0; k < n; k++) { const a = k * 2.1 + x, sc = 0.9 + r() * 1.3; b.rock(sc, x + Math.cos(a) * 2.2, seaY + sc * 0.5, z + Math.sin(a) * 2.2, '#f6ead4', { d: 1, seed: 30 + k % 3, s: [1, 1.4, 1], moss: { c: MOSS, amt: 0.7 }, ao: 0 }); } }
  let tris = 0; for (const [k, P] of Object.entries(parts)) { const e = P.b.bake(); tris += e.tris; const hm = instantiate(e, { shadows: false }); hm.name = 'horizon_' + k; hm.children.forEach((m) => { m.castShadow = false; m.receiveShadow = false; }); g.add(hm);
    if (P.foam.length) { const fm = new THREE.Mesh(mergeGeometries(P.foam), foamMat()); fm.renderOrder = 2; fm.onBeforeRender = windTick; g.add(fm); } }
  const sg = sailsGeo(), sails = new THREE.Mesh(sg, envMat); sails.name = 'sails'; const wy = Math.atan2(128 - 1.5, -96 + 1.0) + Math.PI, hx = 128 - 1.5 + Math.sin(wy) * 1.5 * 1.28, hz = -96 + 1.0 + Math.cos(wy) * 1.5 * 1.28; sails.position.set(hx, 0.9 + 1.5 * 2.4, hz); sails.rotation.y = wy; sails.scale.setScalar(1.5); sails.castShadow = false;
  selfMotion(sails, (m, t) => { m.multiply(_ar.makeRotationZ(t * 0.45)); }); g.add(sails);
  g.userData.tris = tris; return g;
}
function buildSeaLife(seaY, contact, SEG) {
  const g = new THREE.Group(); g.name = 'sealife'; const r = krng(3131);
  const defs = [['a', '#ffffff', '#ff8fb5', '#ff6f8f'], ['b', '#ffe08a', '#ffffff', '#4fd8cc'], ['c', '#8fd0ff', '#fff3b8', '#ffab8a'], ['d', '#ffb7d0', '#ffffff', '#6f9ff0']];
  const spots = [[0.35, 20], [1.4, 14], [3.2, 18], [4.0, 34], [5.2, 22], [2.7, 70]];
  spots.forEach(([th, off], i) => { const j = Math.floor(th / TAU * SEG) % SEG, rr = contact[j] + off, d = defs[i % 4], boat = new THREE.Group(); boat.name = 'sail'; const bg = boatBake(d[0], d[1], d[2], d[3]).matte; if (!bg.userData.padded) { bg.computeBoundingSphere(); bg.boundingSphere.radius += 2.6; bg.userData.padded = true; } const m = new THREE.Mesh(bg, envMat); m.castShadow = false; m.receiveShadow = true; boat.add(m);
    boat.position.set(Math.cos(th) * rr, seaY + 0.12, Math.sin(th) * rr); boat.rotation.y = r() * TAU; boat.scale.setScalar(off > 50 ? 1.8 : 1.05); boat.userData = { ph: i * 1.7, home: boat.position.clone() };
    const ph = i * 1.7, sp = 0.18 + (i % 3) * 0.05; selfMotion(m, (a, t) => { a.makeTranslation(Math.sin(t * sp + ph) * 1.4, Math.sin(t * 1.1 + ph) * 0.06, Math.cos(t * sp * 0.8 + ph) * 1.1); a.multiply(_ar.makeRotationFromEuler(_ae.set(Math.sin(t * 0.9 + ph) * 0.04, Math.sin(t * sp + ph) * 0.25, Math.sin(t * 1.3 + ph) * 0.06))); }); g.add(boat); });
  // buoys with a tiny lamp
  const b = new Builder(0); for (let i = 0; i < 12; i++) { const j = Math.floor((i + r() * 0.8) / 12 * SEG) % SEG, th = j / SEG * TAU, rr = contact[j] + 9 + r() * 9, x = Math.cos(th) * rr, z = Math.sin(th) * rr;
    b.lump(0.2, x, seaY + 0.1, z, '#ff6f5f', { d: 0, s: [1, 0.9, 1], grad: 0.6, ao: 0 }); b.lump(0.2, x, seaY + 0.2, z, '#ffffff', { d: 0, s: [1.02, 0.35, 1.02], grad: 0.3, ao: 0 }); b.cyl(0.015, 0.02, 0.3, x, seaY + 0.25, z, '#c58c5c', { seg: 4, ao: 0, open: true }); b.plain(0.07, 0.07, 0.07, x, seaY + 0.55, z, '#ffe08a', { m: 'lantern', ao: 0 }); }
  const bu = instantiate(b.bake(), { shadows: false }); bu.name = 'buoys'; bu.children.forEach((m) => { m.castShadow = false; }); g.add(bu);
  return g;
}

// ---- island
const shoreOf = (R, th) => R * (1 + 0.035 * Math.sin(3 * th + 0.7) + 0.025 * Math.sin(5 * th + 2.1) + 0.02 * Math.sin(9 * th + 0.3) + 0.01 * Math.sin(17 * th + 1.3));
const ridgeAmp = (th) => 0.5 * (0.6 + 0.8 * vn(th * 6 + 3, 1.7));
const HILLS = [[-19, -57, 10, 3.6], [57, -13, 9, 3.2], [22, 58, 10, 3.4], [-58, 19, 9, 3.2], [-52, -52, 8, 2.4], [53, 51, 8, 2.6]];
const hillOf = (x, z) => { let h = 1.1 * sstep(0.46, 0.84, vn(x * 0.052 + 31, z * 0.052 + 7)) * (0.65 + 0.7 * vn(x * 0.03 + 11, z * 0.03 + 53)) + 0.4 * (vn(x * 0.11 + 3, z * 0.11 + 19) - 0.5) - 0.4 * sstep(0.62, 0.82, vn(x * 0.085 + 5, z * 0.085 + 41));
  for (const [cx, cz, r, a] of HILLS) { const d = Math.hypot(x - cx, z - cz); if (d < r * 1.7) h += a * sstep(r * 1.7, 0, d) ** 1.4; } return h; };
const streamClear = (x, z) => { let m = 99; for (const st of layout().streams) { const bb = st.bb; if (x < bb[0] - 6 || x > bb[2] + 6 || z < bb[1] - 6 || z > bb[3] + 6) continue; for (const q of st.pts) { const d = Math.hypot(q[0] - x, q[1] - z); if (d < m) m = d; } } for (const pd of PONDS) if (pd.big) m = Math.min(m, Math.hypot(x - pd.x, z - pd.z) - Math.max(pd.rx, pd.rz) - 0.5); return sstep(1.4, 5.5, m); };
/** terrain height: flat inside the village ring (plots, plaza, fields, paths all sit at 0), rolling hills and dips in the outer lobes, a ridge and lip at the rim */
const heightOf = (R) => (x, z) => {
  const r = Math.hypot(x, z), th = Math.atan2(z, x), d = shoreOf(R, th) - r, fl = Math.max(Math.abs(x), Math.abs(z)) - FLAT_HALF; if (fl <= 0) return 0;   // dead flat under every plot, the plaza, the fields and the roads
  let h = d > 12 ? 0 : ridgeAmp(th) * sstep(12, 6, d) - 0.85 * sstep(2.5, 0, d);
  if (d > 3) h += hillOf(x, z) * sstep(0, 9, fl) * sstep(3, 11, d) * streamClear(x, z);
  return h * sstep(0, 5, fl);
};
const STRATA = [ // y, radius factor, colour, noise group (hard colour edges = duplicated rows): grass lip, peach topsoil, then light sandstone layers fading to lilac-grey
  [0.0, 1.0, '#a8ee70', 0], [-0.3, 0.998, '#86d95a', 0], [-0.33, 0.998, '#f0b98c', 1], [-1.1, 0.996, '#f6c79a', 1], [-1.13, 0.996, '#fcdcae', 2], [-2.3, 0.993, '#f8d0a0', 2],
  [-2.33, 0.991, '#ffe8c0', 3], [-3.4, 0.989, '#fbdcb0', 3], [-3.43, 0.987, '#f0dccc', 4], [-4.7, 0.983, '#e8d2c4', 4], [-4.73, 0.98, '#fddab0', 5], [-5.9, 0.972, '#f4cca4', 5],
  [-5.93, 0.96, '#dccbd4', 6], [-7.8, 0.92, '#cdbccf', 6], [-10, 0.78, '#bcaec8', 7],
];
const SEA_ROWS = [[-4, '#b4f8ea'], [0, '#b4f8ea'], [1.6, '#8cf0ee'], [4, '#6ee2f2'], [8, '#58d3f4'], [15, '#48c6f2'], [28, '#40baee'], [50, '#3cb0ea'], [90, '#38a6e4'], [160, '#349ede'], [300, '#339ada'], [420, '#339ada']];
function addFx(m, fragment, extraUniforms) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWindT = WIND; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vF;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvF = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vF; uniform float uWindT;').replace('#include <color_fragment>', '#include <color_fragment>\n' + fragment);
  };
  m.customProgramCacheKey = () => 'hvfx' + fragment.length; return m;
}
let _foamMat, _fallMat, _seaMat, _beachMat;
const beachMat = () => _beachMat ||= new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: true });
const foamMat = () => _foamMat ||= addFx(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide }), 'diffuseColor.a *= 0.72 + 0.28 * sin( vF.x * 5.0 - uWindT * 1.5 + vF.y * 9.0 );');
const fallMat = () => _fallMat ||= addFx(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.88, side: THREE.DoubleSide, fog: true }), 'float sf = sin( vF.x * 38.0 ) * sin( vF.y * 1.7 - uWindT * 4.5 ); diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 1.0 ), 0.4 * smoothstep( 0.15, 1.0, sf ) );');
const seaMaterial = () => _seaMat ||= (() => { const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.1 });
  m.onBeforeCompile = (sh) => { sh.uniforms.uWindT = WIND; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vSea;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSea = (modelMatrix * vec4( position, 1.0 )).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vSea; uniform float uWindT;').replace('#include <color_fragment>', '#include <color_fragment>\nfloat w1 = sin( vSea.x * 0.33 + uWindT * 0.7 ) * sin( vSea.y * 0.29 - uWindT * 0.5 ); float w2 = sin( vSea.x * 0.9 - uWindT * 1.1 + vSea.y * 0.4 ) * sin( vSea.y * 0.8 + uWindT * 0.9 );\ndiffuseColor.rgb += vec3( 0.08, 0.1, 0.08 ) * smoothstep( 0.5, 1.0, w1 ) + vec3( 0.06, 0.07, 0.07 ) * smoothstep( 0.65, 1.0, w2 ); float sp = smoothstep( 0.92, 1.0, sin( vSea.x * 2.3 + sin( vSea.y * 0.83 ) * 2.4 + uWindT * 1.7 ) * sin( vSea.y * 2.1 + sin( vSea.x * 0.71 ) * 2.4 - uWindT * 1.3 ) ) * smoothstep( 0.45, 0.85, sin( vSea.x * 0.31 + vSea.y * 0.43 + uWindT * 0.4 ) * sin( vSea.x * 0.17 - vSea.y * 0.23 ) * 0.5 + 0.5 ); diffuseColor.rgb += vec3( 0.55, 0.6, 0.55 ) * sp;'); };
  m.customProgramCacheKey = () => 'hvsea'; return m; })();
const rgba = (c, a) => { const k = col(c); return [k.r, k.g, k.b, a]; };
/** indexed strip geometry with RGBA vertex colours: rings[j] = [ [x,y,z,[r,g,b,a],u,v], ... ] along j, profile k */
function stripAlpha(rings) {
  const pos = [], colr = [], uv = [], idx = [], K = rings[0].length;
  for (const ring of rings) for (const q of ring) { pos.push(q[0], q[1], q[2]); colr.push(...q[3]); uv.push(q[4] || 0, q[5] || 0); }
  for (let j = 0; j < rings.length - 1; j++) for (let k = 0; k < K - 1; k++) { const a = j * K + k, b = a + 1, c = a + K, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 4)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  const n = new Float32Array(pos.length); for (let i = 1; i < n.length; i += 3) n[i] = 1; g.setAttribute('normal', new THREE.BufferAttribute(n, 3)); return g;
}
/**
 * The floating island (replaces the game's cylinder terrain + sea). Radius R (default 66; the outline wobbles about 6 percent), top surface at y = 0,
 * flat inside (villages, plaza, fields sit on it), a rim ridge and rounded grass lip at the edge, strata cliffs down to the sea at y = seaY.
 * Contains: grass top, cliffs with strata bands and boulders, ocean (`ocean`), animated foam ring + stack foam (`foam`), 3 waterfalls with streams (`falls`),
 * and the scatter (instanced forest rim, bushes, flowers, mushrooms, tufts, stones). Remove the game's own sea / cliff / top / plaza / rim trees.
 * opts: { seaY (-4.2), seed (7), scatter (true), counts }.   userData: heightAt(x,z), shore(theta), seaY, scatter (tri stats).
 */
export function islandModel(R = 66, opts = {}) {
  const seaY = opts.seaY ?? -4.2, g = new THREE.Group(); g.name = 'island'; const SEG = 128, hy = heightOf(R), shore = (th) => shoreOf(R, th), r = krng(opts.seed || 7);
  // ---- grass top: polar grid, fine in the hilly outer band; the shader paints paths, flowers and grass tones on it (aG = 2)
  maskTex();
  const radii = [0, 6, 12, 18, 24, 30, 36, 40, 43.5, 46, 48.5, 51, 53.5, 56, 58, 60, 62, 63.8, 65.4, 66.8, 68, 69, 69.8, 70.6, 71.3, 72].map((q) => q / 72);
  const topColor = (x, z) => { const rr = Math.hypot(x, z), th = Math.atan2(z, x), d = shore(th) - rr, h = hy(x, z), gx = (hy(x + 0.9, z) - hy(x - 0.9, z)) / 1.8, gz = (hy(x, z + 0.9) - hy(x, z - 0.9)) / 1.8, lit = clamp(-(gx * 0.5 + gz * 0.33) * 1.6, -0.35, 0.3); let c = col('#8fe25e').clone(); c.lerp(col('#a6ee68'), sstep(0.45, 0.8, fbm(x * 0.07 + 20, z * 0.07 + 5)) * 0.7);
    c.lerp(col('#c4f784'), sstep(0.3, 1.8, h) * 0.55); c.lerp(col('#55cf80'), sstep(0.0, -0.4, h) * 0.7);   // sunny crests, emerald dips
    c.lerp(col('#78cf4c'), sstep(16, 5, d) * (0.3 + 0.3 * vn(x * 0.35, z * 0.35))); c.lerp(col('#c4f784'), sstep(2.2, 0.2, d) * 0.5); if (d < 0.5) c.lerp(col('#78cf4c'), sstep(0.5, 0, d)); if (lit > 0) c.lerp(col('#e6ff9a'), lit * 1.4); else c.lerp(col('#2fb88a'), -lit * 1.2); return c; };
  const rows = radii.map((f) => ({ r: f * R, y: (x, z) => hy(x, z), c: topColor }));
  const topGeo = polarGeo(rows, 192, { wob: (th, i) => (i === 0 ? 1 : shore(th) / R), nUp: 0.2 }); topGeo.setAttribute('aG', new THREE.Float32BufferAttribute(new Float32Array(topGeo.attributes.position.count).fill(2), 1));
  g.add(Object.assign(new THREE.Mesh(topGeo, groundMat), { receiveShadow: true, name: 'top', renderOrder: 1 }));   // drawn after the other opaque things: the costly ground shader then only runs on pixels nothing hides
  g.add(buildDressing(hy));
  // ---- cliff with strata bands (flat shaded, chunky), boulders, hanging ivy with flowers, grassy ledges
  const ringsR = [], contact = new Float32Array(SEG);
  for (let j = 0; j <= SEG; j++) {
    const th = (j % SEG) / SEG * TAU, s = shore(th), ring = [];
    STRATA.forEach(([y, f, c, grp], k) => { const nz = (vn(th * 7 + grp * 5.3, grp * 1.7) - 0.5) * 2 * (0.5 + grp * 0.22) + (vn(th * 23 + grp, 3.1) - 0.5) * 0.7, rad = s * f + nz * (k === 0 ? 0.2 : 1), yy = k === 0 ? ridgeAmp(th) - 0.85 : y; const cc = col(c).clone().multiplyScalar(0.9 + 0.2 * hash(j, grp)); ring.push({ x: Math.cos(th) * rad, y: yy, z: Math.sin(th) * rad, c: cc, rad }); });
    if (j < SEG) { for (let k = 0; k < ring.length - 1; k++) if (ring[k].y >= seaY && ring[k + 1].y < seaY) { const t = (ring[k].y - seaY) / (ring[k].y - ring[k + 1].y); contact[j] = ring[k].rad + (ring[k + 1].rad - ring[k].rad) * t; } }
    ringsR.push(ring);
  }
  const cliffRad = (j, y) => { const ring = ringsR[((j % SEG) + SEG) % SEG]; for (let k = 0; k < ring.length - 1; k++) if (y <= ring[k].y && y >= ring[k + 1].y) { const t = (ring[k].y - y) / (ring[k].y - ring[k + 1].y || 1); return ring[k].rad + (ring[k + 1].rad - ring[k].rad) * t; } return ring[0].rad; };
  { let cg = sweepGeo(ringsR, { orient: 'out' }).toNonIndexed(); cg.computeVertexNormals(); cg.userData.y0 = -9.5; cg.userData.y1 = 0; const b = new Builder(0); b.geo(cg, 'matte', { ao: 0 });
    // rocks along the lip and boulders at the waterline
    for (let i = 0; i < 30; i++) { const th = r() * TAU, d = r() * 1.6 - 0.2, rr = shore(th) - d, x = Math.cos(th) * rr, z = Math.sin(th) * rr, sc = 0.5 + r() * 1.0; b.rock(sc, x, hy(x, z) + sc * 0.2, z, ['#fff0cc', '#d8e8f8', '#ffdcb0', '#ffd6dc'][i % 4], { d: 1, seed: i % 6, s: [1.2, 0.8, 1], r: [0, r() * 6, 0], moss: { c: MOSS, amt: 1 }, ao: 0 }); }
    for (let i = 0; i < 20; i++) { const j = Math.floor(r() * SEG), th = j / SEG * TAU, rr = contact[j] + 0.4 + r() * 1.3, sc = 0.7 + r() * 1.3, x = Math.cos(th) * rr, z = Math.sin(th) * rr; b.rock(sc, x, seaY + sc * 0.1, z, ['#f0e2cc', '#e4eaf4', '#f6d8c4'][i % 3], { d: 1, seed: 50 + i % 5, s: [1.1, 0.9, 1], r: [0, r() * 6, 0], ao: 0 }); }
    // hanging ivy curtains with blossoms (two stacked pennants each) and little grassy ledges with flowers
    for (let i = 0; i < 26; i++) { const j = Math.floor(r() * SEG), th = j / SEG * TAU, lip = ringsR[j][0].y, len = 1.1 + r() * 2.0, yaw = Math.atan2(-Math.cos(th), -Math.sin(th)), wd = 0.55 + r() * 0.5;
      for (let k = 0; k < 2; k++) { const y0 = lip - 0.02 - k * len * 0.45, rad = cliffRad(j, y0 - len * 0.2) + 0.09; b.add(G.flag(), { p: [Math.cos(th) * rad, y0, Math.sin(th) * rad], s: [wd * (1 - k * 0.3), len * (k ? 0.7 : 0.62), 1], r: [0, yaw, 0], c: k ? '#58c85a' : '#6edc62', grad: 0.5, ao: 0 }); }
      for (let k = 0; k < 2; k++) { const y1 = lip - 0.25 - r() * len * 0.8, rad = cliffRad(j, y1) + 0.12, off = (r() - 0.5) * wd * 0.5; b.add(G.octa(), { p: [Math.cos(th) * rad - Math.sin(th) * off, y1, Math.sin(th) * rad + Math.cos(th) * off], s: 0.07, c: ['#ffb7d0', '#ffffff', '#fff2a0', '#d4c4ff'][(i + k) % 4], grad: 0.2, ao: 0 }); } }
    for (let i = 0; i < 10; i++) { const j = Math.floor(r() * SEG), th = j / SEG * TAU, y = -1.3 - r() * 1.7, rad = cliffRad(j, y) + 0.2; const x = Math.cos(th) * rad, z = Math.sin(th) * rad;
      b.lump(0.42, x, y, z, '#7fe05c', { d: 0, s: [1.5, 0.4, 1.1], r: [0, th, 0], jit: 0.1, grad: 0.8, ao: 0, sw: 0.4 }); tuftInto(b, x + Math.cos(th) * 0.1, y + 0.1, z + Math.sin(th) * 0.1, 0.8, '#6edb58', 3, 0.8); flowerInto(b, x - Math.sin(th) * 0.25, y + 0.1, z + Math.cos(th) * 0.25, FLOWERS[i % 6], 0.8, 0.12, false, i % 4); }
    const cl = instantiate(b.bake(), { shadows: false }); cl.name = 'cliff'; cl.children.forEach((m) => { m.receiveShadow = true; }); g.add(cl); }
  // ---- ocean following the cliff contact
  { const rowsO = []; for (let j = 0; j <= SEG; j++) { const jj = j % SEG, th = jj / SEG * TAU; rowsO.push(SEA_ROWS.map(([d, c]) => { const rad = contact[jj] + d; return { x: Math.cos(th) * rad, y: seaY, z: Math.sin(th) * rad, c }; })); }
    const og = sweepGeo(rowsO, { orient: 'up' }); const mesh = new THREE.Mesh(og, seaMaterial()); mesh.name = 'ocean'; mesh.receiveShadow = true; mesh.onBeforeRender = windTick; g.add(mesh); }
  // ---- sandy beach ring in the shallows (soft butter sand fading into the turquoise), lily pads, and sand coves with shells and driftwood
  { const rowsB = []; const D = [[-0.4, '#fff3c8', 0], [0.2, '#fff0c0', 0.95], [1.4, '#fbe8b0', 0.85], [2.6, '#f6e6b8', 0.5], [4.0, '#f0e8c8', 0]]; for (let j = 0; j <= SEG; j++) { const jj = j % SEG, th = jj / SEG * TAU, wv = 1 + 0.4 * (vn(th * 10 + 4, 2) - 0.5); rowsB.push(D.map(([d, c, a]) => { const rad = contact[jj] + (d > 0 ? d * wv : d); return [Math.cos(th) * rad, seaY + 0.025, Math.sin(th) * rad, rgba(c, a), 0, 0]; })); }
    const bm = new THREE.Mesh(stripAlpha(rowsB), beachMat()); bm.name = 'beach'; bm.renderOrder = 1; g.add(bm);
    const lb = new Builder(0), lr = krng((opts.seed || 7) + 301);
    for (let i = 0; i < 10; i++) { const j = Math.floor(lr() * SEG), th = j / SEG * TAU, rr = contact[j] + 3.2 + lr() * 6, cx = Math.cos(th) * rr, cz = Math.sin(th) * rr;
      for (let k = 0; k < 3; k++) { const a = k * 2.1 + lr(), q = 0.35 + lr() * 0.5; lb.add(G.disc(9), { p: [cx + Math.cos(a) * 0.7, seaY + 0.05 + k * 0.004, cz + Math.sin(a) * 0.7], s: [q, 1, q], r: [0, lr() * 6, 0], c: k % 2 ? '#6fe27a' : '#8aee84', grad: 0, ao: 0 }); }
      if (i % 2 === 0) { lb.lump(0.17, cx, seaY + 0.14, cz, '#ff9ec4', { d: 0, s: [1, 0.7, 1], grad: 0.4, ao: 0 }); lb.add(G.octa(), { p: [cx, seaY + 0.2, cz], s: 0.06, c: '#ffe066', grad: 0, ao: 0 }); lb.lump(0.12, cx + 0.12, seaY + 0.12, cz - 0.08, '#ffd0e4', { d: 0, s: [1, 0.7, 1], grad: 0.3, ao: 0 }); } }
    // sand coves hugging the cliff foot: a soft sand bar, scattered shells, a bleached log, beach grass
    for (let i = 0; i < 5; i++) { const j = Math.floor((i + 0.2 + 0.6 * lr()) / 5 * SEG), th = j / SEG * TAU, rr = contact[j] + 1.6 + lr() * 1.2, cx = Math.cos(th) * rr, cz = Math.sin(th) * rr, yw = Math.PI / 2 - th;
      lb.lump(1.5 + lr() * 0.7, cx, seaY + 0.03, cz, '#fff1c4', { d: 1, s: [1.7, 0.1, 1.0], r: [0, -th + Math.PI / 2, 0], jit: 0.05, grad: 0.3, ao: 0 });
      for (let k = 0; k < 5; k++) { const a = lr() * TAU, q = lr() * 0.9; lb.lump(0.06 + lr() * 0.03, cx + Math.cos(a) * q * 1.3, seaY + 0.1, cz + Math.sin(a) * q * 0.7, ['#ffffff', '#ffd9e6', '#fff0cf', '#e8dcff'][k % 4], { d: 0, s: [1.2, 0.6, 1], grad: 0.3, ao: 0 }); }
      lb.add(G.cyl(0.8, 6), { p: [cx + 0.4, seaY + 0.1, cz - 0.25], s: [0.06, 0.8, 0.06], r: [0, lr() * 3, Math.PI / 2], c: '#f0d9b4', grad: 0.5, ao: 0.1 }); tuftInto(lb, cx - 0.6, seaY + 0.05, cz + 0.2, 1.4, '#cdeb7e', 4, 1); tuftInto(lb, cx - 0.4, seaY + 0.05, cz + 0.35, 1.1, '#e6f59a', 3, 1); }
    const lil = instantiate(lb.bake(), { shadows: false }); lil.name = 'lilies'; lil.children.forEach((m) => { m.castShadow = false; }); g.add(lil); }
  // ---- foam: ring at the waterline + rings around the sea stacks + waterfall splashes, merged into ONE mesh
  const foam = new THREE.Group(); foam.name = 'foam'; const foamGeos = [];
  { const rowsF = []; const D = [[-0.6, 0], [0.0, 0.95], [0.5, 0.7], [1.1, 0.4], [1.8, 0.16], [2.6, 0]]; for (let j = 0; j <= SEG; j++) { const jj = j % SEG, th = jj / SEG * TAU, wv = 1 + 0.55 * (vn(th * 14 + 1, 2) - 0.5) * 2; rowsF.push(D.map(([d, a]) => { const dd = d > 0 ? d * wv : d, rad = contact[jj] + dd; return [Math.cos(th) * rad, seaY + 0.04, Math.sin(th) * rad, rgba('#ffffff', a), dd, th]; })); }
    foamGeos.push(stripAlpha(rowsF)); }
  // sea stacks with their own foam
  { const b = new Builder(0); for (let i = 0; i < 9; i++) { const j = Math.floor((i + r() * 0.8) / 9 * SEG), th = j / SEG * TAU, rr = contact[j % SEG] + 3.5 + r() * 7, x = Math.cos(th) * rr, z = Math.sin(th) * rr, sc = 1.1 + r() * 1.6;
      b.rock(sc, x, seaY + sc * 0.45, z, '#f6ead4', { d: 1, seed: 90 + i % 4, s: [1.1, 1.2, 1], moss: { c: MOSS, amt: 0.8 }, ao: 0 }); b.rock(sc * 0.5, x + sc * 0.8, seaY + sc * 0.15, z + sc * 0.3, '#e6d8c8', { d: 0, seed: 7 + i % 3, ao: 0 });
      if (i % 3 === 0) { tuftInto(b, x, seaY + sc * 1.35, z, 1.2, '#7fe05c', 4, 0.9); flowerInto(b, x + 0.15, seaY + sc * 1.35, z, FLOWERS[i % 6], 1.0, 0.14, false, 0); }
      const ring = []; for (let q = 0; q <= 24; q++) { const a = q / 24 * TAU; ring.push([[x, seaY + 0.05, z, rgba('#fff', 0), 0, a], [x + Math.cos(a) * sc * 1.0, seaY + 0.05, z + Math.sin(a) * sc * 1.0, rgba('#fff', 0.9), 0.5, a], [x + Math.cos(a) * sc * 1.8, seaY + 0.05, z + Math.sin(a) * sc * 1.8, rgba('#fff', 0), 1.4, a]]); } foamGeos.push(stripAlpha(ring)); }
    const sk = instantiate(b.bake(), { shadows: false }); sk.name = 'stacks'; g.add(sk); }
  // ---- brooks to the rim: spring pools, water ribbons with lily pads, reeds, a bridge or stepping stones, and the falling sheet with its splash
  const falls = new THREE.Group(); falls.name = 'falls'; const fb = new Builder(0), sheets = [], fr2 = krng(909);
  layout().streams.forEach((st, si) => {
    const th = st.th, cth = Math.cos(th), sth = Math.sin(th), tx = -sth, tz = cth, cur = st.curve, N = Math.max(8, Math.round(cur.getLength() / 0.55)), rings = [];
    for (let i = 0; i <= N; i++) { const t = i / N, p = cur.getPointAt(t), d = cur.getTangentAt(t), w = 0.78 * (0.7 + 0.3 * Math.min(1, i / 6)) * (i === 0 ? 0.4 : 1) * (0.92 + 0.14 * Math.sin(i * 1.3)), y = hy(p.x, p.z) + 0.06;
      rings.push([[-1, '#b4f6ee'], [-0.5, '#86e6f0'], [0, '#6ee0f4'], [0.5, '#86e6f0'], [1, '#b4f6ee']].map(([u, c]) => ({ x: p.x - d.z * u * w, y: y - (u === 0 ? 0.015 : 0), z: p.z + d.x * u * w, c }))); }
    fb.geo(sweepGeo(rings, { orient: 'up' }), 'water', { ao: 0 });
    for (let i = 0; i < 9; i++) { const t = 0.08 + 0.9 * (i + fr2() * 0.7) / 9, p = cur.getPointAt(t), d = cur.getTangentAt(t), side = i % 2 ? 1 : -1, off = 0.95 * side, sc = 0.07 + fr2() * 0.1, x = p.x - d.z * off, z = p.z + d.x * off;
      fb.rock(sc, x, hy(x, z) + sc * 0.4, z, ['#fff0cc', '#f6ecd6', '#d8e8f8'][i % 3], { d: 0, seed: 60 + i % 4, s: [1.2, 0.7, 1], ao: 0.1, moss: { c: MOSS, amt: 0.6 } }); if (i % 3 === 1) reedInto(fb, p.x - d.z * off * 1.3, p.z + d.x * off * 1.3, 0.85, hy(p.x - d.z * off * 1.3, p.z + d.x * off * 1.3), 4); }
    for (let i = 0; i < 4; i++) { const t = 0.62 + i * 0.09 + fr2() * 0.04, p = cur.getPointAt(t), a = fr2() * TAU, q = 0.2 + fr2() * 0.12, x = p.x + Math.cos(a) * 0.2, z = p.z + Math.sin(a) * 0.2; fb.add(G.disc(9), { p: [x, hy(x, z) + 0.085 + i * 0.002, z], s: [q, 1, q], r: [0, fr2() * 6, 0], c: i % 2 ? '#6fe27a' : '#8aee84', grad: 0, ao: 0 }); if (i % 2 === 0) { fb.lump(0.08, x, hy(x, z) + 0.13, z, '#ff9ec4', { d: 0, s: [1, 0.7, 1], grad: 0.4, ao: 0 }); fb.add(G.octa(), { p: [x, hy(x, z) + 0.17, z], s: 0.03, c: '#ffe066', grad: 0, ao: 0 }); } }
    { const t = 0.42, p = cur.getPointAt(t), d = cur.getTangentAt(t); const yaw = Math.atan2(-d.x, -d.z) + Math.PI / 2;   // the span runs across the stream
      if (si === 1) bridgeInto(fb, p.x, p.z, Math.atan2(d.x, d.z) - Math.PI / 2 + 0, 2.6, 1.3, hy(p.x, p.z));
      else for (let k = -2; k <= 2; k++) { const x = p.x - d.z * k * 0.62, z = p.z + d.x * k * 0.62; stepsInto(fb, [[x, z]], 1.1, hy(x, z) + 0.03); } }
    // the falling sheet and splash
    const j0 = Math.round(th / TAU * SEG) % SEG, lipY = ridgeAmp(th) - 0.85, rows2 = []; const off0 = 0.9 * Math.sin(th * 3);
    for (let i = 0; i <= 9; i++) { const y = lipY + 0.05 + (seaY + 0.1 - lipY) * i / 9, rad = cliffRad(j0, y) + 0.28, w = 1.05 + i * 0.05; rows2.push([-1, -0.5, 0, 0.5, 1].map((u, q) => [cth * rad + tx * (off0 + u * w), y, sth * rad + tz * (off0 + u * w), rgba(q % 2 ? '#ffffff' : '#d4faff', 1), (u + 1) / 2, i * 0.6])); }
    sheets.push(stripAlpha(rows2));
    const sx = cth * (contact[j0] + 0.6) + tx * off0, sz = sth * (contact[j0] + 0.6) + tz * off0, ringS = []; for (let q = 0; q <= 20; q++) { const a = q / 20 * TAU; ringS.push([[sx, seaY + 0.06, sz, rgba('#fff', 0.9), 0.3, a], [sx + Math.cos(a) * 1.8, seaY + 0.06, sz + Math.sin(a) * 1.8, rgba('#fff', 0.5), 1.0, a], [sx + Math.cos(a) * 3.4, seaY + 0.06, sz + Math.sin(a) * 3.4, rgba('#fff', 0), 2.0, a]]); } foamGeos.push(stripAlpha(ringS));
  });
  { const fe = instantiate(fb.bake(), { shadows: false }); fe.children.forEach((m) => { m.castShadow = false; }); falls.add(fe);
    const fm = new THREE.Mesh(mergeGeometries(sheets), fallMat()); fm.onBeforeRender = windTick; falls.add(fm); }
  { const fm = new THREE.Mesh(mergeGeometries(foamGeos), foamMat()); fm.renderOrder = 2; fm.onBeforeRender = windTick; foam.add(fm); }
  g.add(foam); g.add(falls); g.add(buildHorizon(seaY)); g.add(buildSeaLife(seaY, contact, SEG));
  g.userData = { heightAt: hy, shore, seaY, R };
  if (opts.scatter !== false) g.userData.scatter = scatter(g, krng(opts.seed || 7), { R, shore, heightAt: hy, counts: opts.counts, isFree: opts.isFree });
  return g;
}
