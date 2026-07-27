// Pass 4 — bloom, the physically-motivated kind.
//
// Two decisions carry the whole effect.
//
// The threshold is soft. A hard `if brightness > 1.0` cutoff means a specular
// highlight sitting at 0.99 contributes nothing and the same highlight at 1.01
// contributes fully — so as the camera moves a millimetre, every wet or metal
// surface pops in and out. The quadratic knee ramps contribution in over a
// window around the threshold, which is the only reason bloom on a moving
// camera stays still.
//
// The blur is a progressive mip pyramid — downsample with a 13-tap filter,
// then walk back up adding a 9-tap tent at each level — rather than a
// fixed-radius Gaussian. This is the Call of Duty / HDRP construction, and what
// it buys is a falloff with no cutoff: a wide, scale-free halo whose radius does
// not change with resolution, from six texture reads per pixel per level instead
// of the dozens a Gaussian of the same width would need.
//
// The first downsample uses a Karis luminance-weighted average. One very bright
// pixel — a muzzle flash subpixel, a sun glint — would otherwise survive the
// whole pyramid and flicker as a firefly at every level.

import * as THREE from 'three';
import { makeRT, fsMaterial, drawTo } from './common.js';

const PREFILTER_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
uniform float uClamp;

float karis( vec3 c ){ return 1.0 / ( 1.0 + max( c.r, max( c.g, c.b ) ) ); }

void main(){
  vec3 a = texture2D( tSrc, vUv + uTexel * vec2( -1.0, -1.0 ) ).rgb;
  vec3 b = texture2D( tSrc, vUv + uTexel * vec2(  1.0, -1.0 ) ).rgb;
  vec3 c = texture2D( tSrc, vUv + uTexel * vec2( -1.0,  1.0 ) ).rgb;
  vec3 d = texture2D( tSrc, vUv + uTexel * vec2(  1.0,  1.0 ) ).rgb;
  float wa = karis( a ), wb = karis( b ), wc = karis( c ), wd = karis( d );
  vec3 col = ( a * wa + b * wb + c * wc + d * wd ) / max( wa + wb + wc + wd, 1e-4 );

  col = max( col, vec3( 0.0 ) );
  float br = max( col.r, max( col.g, col.b ) );
  float soft = br - uThreshold + uKnee;
  soft = clamp( soft, 0.0, 2.0 * uKnee );
  soft = soft * soft / ( 4.0 * uKnee + 1e-4 );
  float contrib = max( soft, br - uThreshold ) / max( br, 1e-4 );

  gl_FragColor = vec4( min( col * contrib, vec3( uClamp ) ), 1.0 );
}
`;

const DOWN_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uTexel;

void main(){
  vec2 t = uTexel;
  vec3 a = texture2D( tSrc, vUv + t * vec2( -2.0,  2.0 ) ).rgb;
  vec3 b = texture2D( tSrc, vUv + t * vec2(  0.0,  2.0 ) ).rgb;
  vec3 c = texture2D( tSrc, vUv + t * vec2(  2.0,  2.0 ) ).rgb;
  vec3 d = texture2D( tSrc, vUv + t * vec2( -2.0,  0.0 ) ).rgb;
  vec3 e = texture2D( tSrc, vUv ).rgb;
  vec3 f = texture2D( tSrc, vUv + t * vec2(  2.0,  0.0 ) ).rgb;
  vec3 g = texture2D( tSrc, vUv + t * vec2( -2.0, -2.0 ) ).rgb;
  vec3 h = texture2D( tSrc, vUv + t * vec2(  0.0, -2.0 ) ).rgb;
  vec3 i = texture2D( tSrc, vUv + t * vec2(  2.0, -2.0 ) ).rgb;
  vec3 j = texture2D( tSrc, vUv + t * vec2( -1.0,  1.0 ) ).rgb;
  vec3 k = texture2D( tSrc, vUv + t * vec2(  1.0,  1.0 ) ).rgb;
  vec3 l = texture2D( tSrc, vUv + t * vec2( -1.0, -1.0 ) ).rgb;
  vec3 m = texture2D( tSrc, vUv + t * vec2(  1.0, -1.0 ) ).rgb;

  vec3 col = e * 0.125;
  col += ( a + c + g + i ) * 0.03125;
  col += ( b + d + f + h ) * 0.0625;
  col += ( j + k + l + m ) * 0.125;
  gl_FragColor = vec4( col, 1.0 );
}
`;

const UP_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uScatter;

void main(){
  vec2 t = uTexel;
  vec3 col = texture2D( tSrc, vUv ).rgb * 4.0;
  col += texture2D( tSrc, vUv + t * vec2( -1.0,  0.0 ) ).rgb * 2.0;
  col += texture2D( tSrc, vUv + t * vec2(  1.0,  0.0 ) ).rgb * 2.0;
  col += texture2D( tSrc, vUv + t * vec2(  0.0, -1.0 ) ).rgb * 2.0;
  col += texture2D( tSrc, vUv + t * vec2(  0.0,  1.0 ) ).rgb * 2.0;
  col += texture2D( tSrc, vUv + t * vec2( -1.0, -1.0 ) ).rgb;
  col += texture2D( tSrc, vUv + t * vec2(  1.0, -1.0 ) ).rgb;
  col += texture2D( tSrc, vUv + t * vec2( -1.0,  1.0 ) ).rgb;
  col += texture2D( tSrc, vUv + t * vec2(  1.0,  1.0 ) ).rgb;
  gl_FragColor = vec4( col * ( 1.0 / 16.0 ) * uScatter, 1.0 );
}
`;

export function createBloomPass(renderer, opts = {}) {
  let mips = [];
  let mipCount = 5;
  let baseW = 1, baseH = 1;
  const hdrType = opts.hdrType || THREE.UnsignedByteType;

  const preMat = fsMaterial(PREFILTER_FRAG, {
    tSrc: { value: null },
    uTexel: { value: new THREE.Vector2() },
    uThreshold: { value: opts.threshold != null ? opts.threshold : 0.9 },
    uKnee: { value: opts.knee != null ? opts.knee : 0.55 },
    // Even with the Karis average, an unbounded HDR value can survive; the
    // clamp is a last line of defence against a single sample setting the
    // whole pyramid alight.
    uClamp: { value: opts.clamp != null ? opts.clamp : 24 },
  });

  const downMat = fsMaterial(DOWN_FRAG, {
    tSrc: { value: null }, uTexel: { value: new THREE.Vector2() },
  });

  const upMat = fsMaterial(UP_FRAG, {
    tSrc: { value: null }, uTexel: { value: new THREE.Vector2() },
    uScatter: { value: 1.0 },
  });
  // Three only programs a blend equation for materials flagged transparent —
  // without both lines the upsample silently overwrites each level instead of
  // accumulating into it, and the pyramid collapses to its smallest mip.
  upMat.blending = THREE.AdditiveBlending;
  upMat.transparent = true;

  function free() { for (const m of mips) m.dispose(); mips = []; }

  function alloc(w, h) {
    free();
    baseW = Math.max(1, w | 0); baseH = Math.max(1, h | 0);
    let mw = Math.max(1, baseW >> 1), mh = Math.max(1, baseH >> 1);
    for (let i = 0; i < mipCount; i++) {
      mips.push(makeRT(mw, mh, { type: hdrType, name: 'bloom.' + i }));
      // Stop halving when a level would be a couple of texels across — a 1×1
      // mip is a fullscreen flat wash, not bloom.
      if (mw <= 4 || mh <= 4) break;
      mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1);
    }
  }

  const api = {
    enabled: true,
    get texture() { return mips.length ? mips[0].texture : null; },
    get levels() { return mips.length; },

    setMips(n) { mipCount = Math.max(2, Math.min(7, n | 0)); alloc(baseW, baseH); },
    resize(w, h) { alloc(w, h); },

    render(src) {
      if (!mips.length) return;
      preMat.uniforms.tSrc.value = src;
      preMat.uniforms.uTexel.value.set(1 / baseW, 1 / baseH);
      drawTo(renderer, mips[0], preMat);

      for (let i = 1; i < mips.length; i++) {
        const s = mips[i - 1];
        downMat.uniforms.tSrc.value = s.texture;
        downMat.uniforms.uTexel.value.set(1 / s.width, 1 / s.height);
        drawTo(renderer, mips[i], downMat);
      }

      // Walk back down the pyramid, adding each blurred level into the one
      // below it. By the time this reaches mip 0 it holds the sum of every
      // radius, which is what gives bloom its long tail.
      for (let i = mips.length - 1; i > 0; i--) {
        const s = mips[i];
        upMat.uniforms.tSrc.value = s.texture;
        upMat.uniforms.uTexel.value.set(1 / s.width, 1 / s.height);
        drawTo(renderer, mips[i - 1], upMat, false);
      }
    },

    dispose() { free(); preMat.dispose(); downMat.dispose(); upMat.dispose(); },
  };

  alloc(2, 2);
  return api;
}
