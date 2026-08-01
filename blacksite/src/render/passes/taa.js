// Pass 7 — temporal anti-aliasing.
//
// The projection matrix is nudged by a fraction of a pixel each frame along a
// Halton sequence, so eight consecutive frames sample eight different points
// inside every pixel. Averaging them is a proper box filter over the pixel
// footprint — supersampling paid for over time instead of over area. It is the
// only AA in this price range that also stabilises specular shimmer and the
// dither patterns the AO and volumetrics leave behind, which is why the whole
// chain is built around having it.
//
// Everything hard about TAA is the history. Three defences, in order:
//
//   1. Reprojection uses the *unjittered* view-projection pair, and the depth
//      used to unproject is dilated to the closest fragment in a 3×3 — a
//      silhouette pixel otherwise reprojects using the background behind it and
//      drags a comet tail off every edge.
//   2. Variance clipping. The history is clipped to an axis-aligned box built
//      from the mean and standard deviation of the 3×3 neighbourhood in YCoCg.
//      A min/max box is the textbook version and it is too loose — it keeps
//      stale colour alive at any pixel whose neighbourhood happens to contain a
//      similar value. Two standard deviations is tight enough to kill ghosting
//      and loose enough not to reject valid history every frame.
//   3. Tone-weighted blending. Averaging raw HDR lets one bright frame dominate
//      eight dark ones and the result flickers; weighting each by 1/(1+luma)
//      averages in a perceptual space and then undoes the weight.
//
// The viewmodel is excluded from reprojection rather than from the filter: it
// is static in view space, so its correct velocity is zero, and giving it zero
// lets it antialias like everything else instead of ghosting.

import * as THREE from 'three';
import { makeRT, fsMaterial, drawTo, GLSL_DEPTH } from './common.js';

const FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
${GLSL_DEPTH}
uniform sampler2D tCurrent;
uniform sampler2D tHistory;
uniform sampler2D tMask;
uniform mat4 uInvViewProj;
uniform mat4 uPrevViewProj;
uniform vec2 uTexel;
uniform vec2 uResolution;
uniform float uFeedback;
uniform float uValid;

vec3 rgb2ycocg( vec3 c ){
  return vec3( 0.25 * c.r + 0.5 * c.g + 0.25 * c.b,
               0.5 * c.r - 0.5 * c.b,
              -0.25 * c.r + 0.5 * c.g - 0.25 * c.b );
}
vec3 ycocg2rgb( vec3 c ){
  return vec3( c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z );
}

// Five bilinear fetches approximating a Catmull-Rom kernel. Plain bilinear
// resampling of the history loses a little sharpness every frame, and since the
// history feeds back into itself that loss compounds into permanent softness.
vec4 historySample( vec2 uv ){
  vec2 pos = uv * uResolution;
  vec2 tc1 = floor( pos - 0.5 ) + 0.5;
  vec2 f = pos - tc1;
  vec2 w0 = f * ( -0.5 + f * ( 1.0 - 0.5 * f ) );
  vec2 w1 = 1.0 + f * f * ( -2.5 + 1.5 * f );
  vec2 w2 = f * ( 0.5 + f * ( 2.0 - 1.5 * f ) );
  vec2 w3 = f * f * ( -0.5 + 0.5 * f );
  vec2 w12 = w1 + w2;
  vec2 o12 = w2 / w12;
  vec2 p0 = ( tc1 - 1.0 ) / uResolution;
  vec2 p3 = ( tc1 + 2.0 ) / uResolution;
  vec2 p12 = ( tc1 + o12 ) / uResolution;

  vec4 r = vec4( 0.0 );
  float wsum = 0.0;
  float w;
  w = w12.x * w0.y;  r += texture2D( tHistory, vec2( p12.x, p0.y ) ) * w;  wsum += w;
  w = w0.x * w12.y;  r += texture2D( tHistory, vec2( p0.x, p12.y ) ) * w;  wsum += w;
  w = w12.x * w12.y; r += texture2D( tHistory, vec2( p12.x, p12.y ) ) * w; wsum += w;
  w = w3.x * w12.y;  r += texture2D( tHistory, vec2( p3.x, p12.y ) ) * w;  wsum += w;
  w = w12.x * w3.y;  r += texture2D( tHistory, vec2( p12.x, p3.y ) ) * w;  wsum += w;
  return max( r / wsum, vec4( 0.0 ) );
}

vec2 reproject( vec2 uv, float d ){
  vec4 clip = vec4( uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0 );
  vec4 wp = uInvViewProj * clip;
  wp /= wp.w;
  vec4 pc = uPrevViewProj * wp;
  return ( pc.xy / pc.w ) * 0.5 + 0.5;
}

void main(){
  vec3 cur = texture2D( tCurrent, vUv ).rgb;

  // First frame after a resize or a quality switch: nothing to blend with.
  if ( uValid < 0.5 ){ gl_FragColor = vec4( cur, 1.0 ); return; }

  // Depth dilation — take the nearest of a 3×3 so silhouettes reproject with
  // the foreground's motion, not the background's.
  float dC = rawDepth( vUv );
  vec2 dilated = vUv;
  float best = dC;
  #define DILATE( ox, oy ) { \
    vec2 o = vUv + vec2( ox, oy ) * uTexel; \
    float dd = rawDepth( o ); \
    if ( dd < best ){ best = dd; dilated = o; } }
  DILATE( -1.0, -1.0 ) DILATE( 1.0, -1.0 ) DILATE( -1.0, 1.0 ) DILATE( 1.0, 1.0 )

  // Dilation gives us a *motion vector*, borrowed from the nearest neighbour —
  // not a position. Sampling history at the neighbour's reprojected position
  // instead shifts every edge pixel by up to a texel every frame, and since the
  // history feeds back into itself that walk compounds into a permanent smear.
  vec2 motionVec = reproject( dilated, best ) - dilated;
  float weapon = step( 0.5, texture2D( tMask, vUv ).r );
  vec2 prevUv = vUv + motionVec * ( 1.0 - weapon );

  if ( prevUv.x < 0.0 || prevUv.x > 1.0 || prevUv.y < 0.0 || prevUv.y > 1.0 ){
    gl_FragColor = vec4( cur, 1.0 ); return;
  }

  // Neighbourhood statistics in YCoCg — chroma and luma get their own bounds,
  // which is what stops a coloured edge from being clipped to grey.
  vec3 m1 = vec3( 0.0 ), m2 = vec3( 0.0 );
  #define GATHER( ox, oy ) { \
    vec3 s = rgb2ycocg( texture2D( tCurrent, vUv + vec2( ox, oy ) * uTexel ).rgb ); \
    m1 += s; m2 += s * s; }
  GATHER( -1.0, -1.0 ) GATHER( 0.0, -1.0 ) GATHER( 1.0, -1.0 )
  GATHER( -1.0,  0.0 ) GATHER( 0.0,  0.0 ) GATHER( 1.0,  0.0 )
  GATHER( -1.0,  1.0 ) GATHER( 0.0,  1.0 ) GATHER( 1.0,  1.0 )

  vec3 mu = m1 / 9.0;
  vec3 sigma = sqrt( max( m2 / 9.0 - mu * mu, vec3( 0.0 ) ) );
  vec3 lo = mu - 2.0 * sigma;
  vec3 hi = mu + 2.0 * sigma;

  vec3 hist = historySample( prevUv ).rgb;
  vec3 histY = clamp( rgb2ycocg( hist ), lo, hi );
  hist = max( ycocg2rgb( histY ), vec3( 0.0 ) );

  // Motion reduces confidence in the history: a fast pan disoccludes new
  // geometry every frame, and holding onto eight frames of it is a smear.
  float motion = length( ( prevUv - vUv ) * uResolution );
  float feedback = mix( uFeedback, 0.72, clamp( motion / 24.0, 0.0, 1.0 ) );

  float wc = 1.0 / ( 1.0 + max( cur.r, max( cur.g, cur.b ) ) );
  float wh = 1.0 / ( 1.0 + max( hist.r, max( hist.g, hist.b ) ) );
  vec3 outC = ( cur * wc * ( 1.0 - feedback ) + hist * wh * feedback )
            / max( wc * ( 1.0 - feedback ) + wh * feedback, 1e-5 );

  gl_FragColor = vec4( outC, 1.0 );
}
`;

export function createTAAPass(renderer, opts = {}) {
  const hdrType = opts.hdrType || THREE.UnsignedByteType;
  let history = null, out = null;
  let w = 1, h = 1;
  let valid = false;

  const mat = fsMaterial(FRAG, {
    tCurrent: { value: null },
    tHistory: { value: null },
    tDepth: { value: null },
    tMask: { value: null },
    uInvProj: { value: new THREE.Matrix4() },
    uNearFar: { value: new THREE.Vector2(0.06, 900) },
    uInvViewProj: { value: new THREE.Matrix4() },
    uPrevViewProj: { value: new THREE.Matrix4() },
    uTexel: { value: new THREE.Vector2() },
    uResolution: { value: new THREE.Vector2() },
    uFeedback: { value: opts.feedback != null ? opts.feedback : 0.91 },
    uValid: { value: 0 },
  });

  function free() { if (history) history.dispose(); if (out) out.dispose(); history = out = null; }

  function alloc(nw, nh) {
    free();
    w = Math.max(1, nw | 0); h = Math.max(1, nh | 0);
    history = makeRT(w, h, { type: hdrType, name: 'taa.hist' });
    out = makeRT(w, h, { type: hdrType, name: 'taa.out' });
    mat.uniforms.uTexel.value.set(1 / w, 1 / h);
    mat.uniforms.uResolution.value.set(w, h);
    valid = false;
  }

  const api = {
    enabled: true,
    get texture() { return out ? out.texture : null; },
    get feedback() { return mat.uniforms.uFeedback.value; },
    set feedback(v) { mat.uniforms.uFeedback.value = v; },

    resize(nw, nh) { alloc(nw, nh); },
    invalidate() { valid = false; },

    render(src, depthTexture, maskTexture, camera, invViewProj, prevViewProj) {
      const u = mat.uniforms;
      u.tCurrent.value = src;
      u.tHistory.value = history.texture;
      u.tDepth.value = depthTexture;
      u.tMask.value = maskTexture;
      u.uInvProj.value.copy(camera.projectionMatrix).invert();
      u.uNearFar.value.set(camera.near, camera.far);
      u.uInvViewProj.value.copy(invViewProj);
      u.uPrevViewProj.value.copy(prevViewProj);
      u.uValid.value = valid ? 1 : 0;

      drawTo(renderer, out, mat);

      // Ping-pong: this frame's resolve becomes next frame's history. Swapping
      // references beats copying a full-resolution float buffer.
      const t = history; history = out; out = t;
      valid = true;
      return history.texture;
    },

    // After a swap the resolved frame lives in `history`; that is what the rest
    // of the chain must read.
    get resolved() { return history ? history.texture : null; },

    dispose() { free(); mat.dispose(); },
  };

  alloc(2, 2);
  return api;
}
