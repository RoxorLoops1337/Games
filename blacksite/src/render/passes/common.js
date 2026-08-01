// Shared plumbing for the post chain: render-target allocation that survives a
// missing float extension, a fullscreen-quad helper, and the GLSL every pass
// needs to turn a hardware depth buffer back into geometry.
//
// The GLSL lives here as string chunks rather than being copy-pasted into six
// shaders because depth reconstruction is the one piece the whole chain has to
// agree on to the last bit. If AO and motion blur disagree about where a pixel
// is in view space by even a fraction of a metre, AO haloes and motion blur
// bleeds across silhouettes, and both look like a different bug than they are.

import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// ── target allocation ────────────────────────────────────────────────────────

// Half float is the whole point of an HDR chain, but it is an extension, and a
// machine without it must still get a picture. Every allocation here walks down
// a ladder and reports what it actually got, so the passes can switch off the
// parts that stop being meaningful in 8 bits.
export function bestHDRType(renderer) {
  const gl = renderer.getContext();
  if (renderer.capabilities.isWebGL2 && gl.getExtension('EXT_color_buffer_float')) return THREE.HalfFloatType;
  if (gl.getExtension('EXT_color_buffer_half_float')) return THREE.HalfFloatType;
  return THREE.UnsignedByteType;
}

export function makeRT(w, h, opts = {}) {
  const rt = new THREE.WebGLRenderTarget(Math.max(1, w | 0), Math.max(1, h | 0), {
    type: opts.type || THREE.UnsignedByteType,
    format: opts.format || THREE.RGBAFormat,
    minFilter: opts.filter || THREE.LinearFilter,
    magFilter: opts.filter || THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: !!opts.depth,
    stencilBuffer: false,
    generateMipmaps: false,
    // Intermediate buffers are working data, not pictures. Tagging them as
    // sRGB would make Three insert an encode on write and a decode on read,
    // which is a slow no-op at best and a double-encode at worst.
    colorSpace: THREE.NoColorSpace,
  });
  rt.texture.name = opts.name || 'rt';
  return rt;
}

// A depth texture the post chain can sample. WebGL2 gives us a real 24-bit
// depth attachment; if the driver refuses one we return null and the caller
// drops every pass that needs geometry, rather than sampling garbage.
export function makeDepthTexture(renderer, w, h) {
  if (!renderer.capabilities.isWebGL2) return null;
  try {
    const d = new THREE.DepthTexture(Math.max(1, w | 0), Math.max(1, h | 0));
    d.type = THREE.UnsignedIntType;
    d.format = THREE.DepthFormat;
    d.minFilter = THREE.NearestFilter;
    d.magFilter = THREE.NearestFilter;
    d.generateMipmaps = false;
    return d;
  } catch { return null; }
}

// ── fullscreen quad ──────────────────────────────────────────────────────────

const VERT = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }
`;

export function fsMaterial(fragment, uniforms, defines) {
  return new THREE.ShaderMaterial({
    uniforms: uniforms || {},
    defines: defines || {},
    vertexShader: VERT,
    fragmentShader: fragment,
    depthTest: false,
    depthWrite: false,
    // Post passes always overwrite; leaving blending on costs a read-modify-write
    // per pixel for a result that is discarded.
    blending: THREE.NoBlending,
  });
}

// One quad instance for the whole chain — the geometry is shared inside the
// addon anyway, and swapping `.material` is free.
let _quad = null;
export function quad() {
  if (!_quad) _quad = new FullScreenQuad(null);
  return _quad;
}

// Draw `material` into `target` (null = the canvas). Clearing is explicit
// because several passes deliberately draw on top of what is already there.
export function drawTo(renderer, target, material, clear = true) {
  const q = quad();
  q.material = material;
  renderer.setRenderTarget(target);
  if (clear) renderer.clear(true, false, false);
  q.render(renderer);
}

// ── GLSL chunks ──────────────────────────────────────────────────────────────

// Depth → view space. `uInvProj` is the *unjittered* inverse projection: TAA
// shifts the projection by up to half a pixel each frame, and reconstructing
// position with the jittered matrix would make every world-space computation
// wobble in sympathy with the jitter pattern.
export const GLSL_DEPTH = /* glsl */`
uniform sampler2D tDepth;
uniform mat4 uInvProj;
uniform vec2 uNearFar;

float rawDepth( vec2 uv ){ return texture2D( tDepth, uv ).x; }

// Positive distance along the view axis. Used for bilateral weights, where a
// linear metric behaves and raw depth does not.
float linearDepth( float d ){
  float z = d * 2.0 - 1.0;
  return ( 2.0 * uNearFar.x * uNearFar.y ) /
         ( uNearFar.y + uNearFar.x - z * ( uNearFar.y - uNearFar.x ) );
}

vec3 viewPos( vec2 uv, float d ){
  vec4 c = vec4( uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0 );
  vec4 v = uInvProj * c;
  return v.xyz / v.w;
}
`;

// Normals from depth, four taps rather than two. The cheap version takes the
// forward difference in x and y, which puts a one-pixel band of wrong normals
// along every silhouette — and AO turns wrong normals into a bright halo. This
// picks whichever neighbour is on the same surface as the centre.
export const GLSL_NORMAL = /* glsl */`
vec3 normalFromDepth( vec2 uv, vec3 P, vec2 texel ){
  vec2 ex = vec2( texel.x, 0.0 ), ey = vec2( 0.0, texel.y );
  vec3 l = viewPos( uv - ex, rawDepth( uv - ex ) );
  vec3 r = viewPos( uv + ex, rawDepth( uv + ex ) );
  vec3 d = viewPos( uv - ey, rawDepth( uv - ey ) );
  vec3 u = viewPos( uv + ey, rawDepth( uv + ey ) );
  vec3 dx = abs( l.z - P.z ) < abs( r.z - P.z ) ? ( P - l ) : ( r - P );
  vec3 dy = abs( d.z - P.z ) < abs( u.z - P.z ) ? ( P - d ) : ( u - P );
  vec3 n = cross( dx, dy );
  float len = length( n );
  return len > 1e-8 ? n / len : vec3( 0.0, 0.0, 1.0 );
}
`;

// Interleaved gradient noise. Cheaper than a blue-noise texture and, unlike a
// white-noise hash, its error is spread across a 3×3 neighbourhood — which is
// exactly the neighbourhood the denoise and the temporal filter average over,
// so the dither disappears instead of becoming visible grain.
export const GLSL_NOISE = /* glsl */`
float ign( vec2 p ){
  return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) );
}
float hash13( vec3 p ){
  p = fract( p * 0.1031 );
  p += dot( p, p.yzx + 33.33 );
  return fract( ( p.x + p.y ) * p.z );
}
`;

// Sun shadow lookup, shared by the AO composite (which needs to know where the
// direct light lands) and the volumetrics (which marches through it). Three
// stores directional shadow depth RGBA-packed, so unpack unless we detect a
// real depth attachment.
export const GLSL_SHADOW = /* glsl */`
uniform sampler2D tShadow;
uniform mat4 uShadowMat;
uniform vec2 uShadowTexel;
uniform float uShadowBias;

float shadowDepth( vec2 uv ){
  #ifdef SHADOW_DEPTH_TEXTURE
    return texture2D( tShadow, uv ).x;
  #else
    const vec4 UNPACK = vec4( 1.0 / ( 256.0 * 256.0 * 256.0 ), 1.0 / ( 256.0 * 256.0 ), 1.0 / 256.0, 1.0 );
    return dot( texture2D( tShadow, uv ), UNPACK );
  #endif
}

// 1.0 = lit. Anything outside the shadow cascade counts as lit: the map only
// covers ~40 m around the player and clamping to "shadowed" instead would paint
// a hard black ring at the cascade edge.
float sunVisibility( vec3 worldPos ){
  vec4 sc = uShadowMat * vec4( worldPos, 1.0 );
  sc.xyz /= sc.w;
  if ( sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0 ) return 1.0;
  return step( sc.z - uShadowBias, shadowDepth( sc.xy ) );
}

float sunVisibilityPCF( vec3 worldPos ){
  vec4 sc = uShadowMat * vec4( worldPos, 1.0 );
  sc.xyz /= sc.w;
  if ( sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0 ) return 1.0;
  float c = sc.z - uShadowBias;
  float s = 0.0;
  s += step( c, shadowDepth( sc.xy + uShadowTexel * vec2( -1.0, -1.0 ) ) );
  s += step( c, shadowDepth( sc.xy + uShadowTexel * vec2(  1.0, -1.0 ) ) );
  s += step( c, shadowDepth( sc.xy + uShadowTexel * vec2( -1.0,  1.0 ) ) );
  s += step( c, shadowDepth( sc.xy + uShadowTexel * vec2(  1.0,  1.0 ) ) );
  return s * 0.25;
}
`;

// ── misc ─────────────────────────────────────────────────────────────────────

export function disposeAll(list) {
  for (const t of list) { if (t && t.dispose) { try { t.dispose(); } catch { /* already gone */ } } }
}

// Halton, for the TAA jitter sequence. A low-discrepancy sequence covers the
// pixel evenly in any prefix of its length, so the image is already converged
// after three or four frames instead of only at the end of the cycle.
export function halton(index, base) {
  let f = 1, r = 0, i = index;
  while (i > 0) { f /= base; r += f * (i % base); i = Math.floor(i / base); }
  return r;
}
