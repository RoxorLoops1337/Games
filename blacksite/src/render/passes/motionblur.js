// Pass 5 — per-object motion blur reconstructed from depth.
//
// There is no velocity buffer to read, so velocity is recovered the cheap way:
// unproject the pixel with this frame's inverse view-projection, reproject it
// with last frame's, and the difference is where that point was on screen. That
// gives correct camera motion for every static surface — which, in a shooter, is
// the motion the player actually feels, because the camera is what moves.
//
// Blurring straight along the per-pixel velocity is the naive version and it
// fails at silhouettes: a fast-moving object should smear *over* the background
// behind it, but the background's own velocity is zero, so nothing there knows
// to gather from the object. The tile-max / neighbour-max structure fixes that.
// Screen space is reduced to 16×16 tiles holding the largest velocity in each,
// then each tile takes the largest velocity of its 3×3 neighbours, so a pixel
// standing still next to something fast still knows to search along that fast
// direction. The per-sample weights (McGuire's cone and cylinder terms) then
// decide which of those samples may legitimately reach it.
//
// The magnitude is clamped hard. Unclamped, a flick of the mouse produces a
// velocity of most of the screen width and the frame turns to soup — the single
// most common reason players turn motion blur off.

import * as THREE from 'three';
import { makeRT, fsMaterial, drawTo, GLSL_DEPTH, GLSL_NOISE } from './common.js';

const TILE = 16;

const VELOCITY_GLSL = /* glsl */`
uniform mat4 uInvViewProj;
uniform mat4 uPrevViewProj;
uniform float uScale;

vec2 velocityAt( vec2 uv, float d ){
  vec4 clip = vec4( uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0 );
  vec4 wp = uInvViewProj * clip;
  wp /= wp.w;
  vec4 pc = uPrevViewProj * wp;
  vec2 prevUv = ( pc.xy / pc.w ) * 0.5 + 0.5;
  return ( uv - prevUv ) * uScale;
}
`;

// Reduce by 4 twice rather than by 16 once: 16 taps a pass instead of 256, for
// the same exact tile maximum.
const TILE_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
${GLSL_DEPTH}
${VELOCITY_GLSL}
uniform sampler2D tPrevTile;
uniform vec2 uTexel;
uniform float uMaxLen;

void main(){
  vec2 best = vec2( 0.0 );
  float bestLen = 0.0;
  for ( int y = 0; y < 4; y++ ){
    for ( int x = 0; x < 4; x++ ){
      vec2 uv = vUv + ( vec2( float( x ), float( y ) ) - 1.5 ) * uTexel;
      #ifdef FROM_DEPTH
        vec2 v = velocityAt( uv, rawDepth( uv ) );
      #else
        vec2 v = texture2D( tPrevTile, uv ).xy;
      #endif
      float l = length( v );
      if ( l > bestLen ){ bestLen = l; best = v; }
    }
  }
  if ( bestLen > uMaxLen ) best *= uMaxLen / bestLen;
  gl_FragColor = vec4( best, 0.0, 1.0 );
}
`;

const NEIGHBOUR_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tTile;
uniform vec2 uTexel;

void main(){
  vec2 best = vec2( 0.0 );
  float bestLen = 0.0;
  for ( int y = -1; y <= 1; y++ ){
    for ( int x = -1; x <= 1; x++ ){
      vec2 v = texture2D( tTile, vUv + vec2( float( x ), float( y ) ) * uTexel ).xy;
      float l = length( v );
      if ( l > bestLen ){ bestLen = l; best = v; }
    }
  }
  gl_FragColor = vec4( best, 0.0, 1.0 );
}
`;

const BLUR_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
${GLSL_DEPTH}
${GLSL_NOISE}
${VELOCITY_GLSL}
uniform sampler2D tColor;
uniform sampler2D tNeighbour;
uniform sampler2D tMask;
uniform vec2 uResolution;
uniform float uFrame;

#define SAMPLES 12

// McGuire's reconstruction weights. cone() lets a sample reach a pixel only if
// its own motion is long enough to cover the gap; cylinder() handles the case
// where both are moving together. softDepth() decides which of the two is in
// front, so a blurred foreground can spill onto the background but not the
// other way round.
//
// (No backticks anywhere in this shader: the whole string is a JS template
// literal, so a backtick closes it early. The browser rejects the result and
// node --check does not, which makes it a runtime-only failure.)
float softDepth( float za, float zb ){ return clamp( 1.0 - ( za - zb ) / 0.35, 0.0, 1.0 ); }
float cone( float dist, float vlen ){ return clamp( 1.0 - dist / max( vlen, 1e-5 ), 0.0, 1.0 ); }
float cylinder( float dist, float vlen ){ return 1.0 - smoothstep( 0.95 * vlen, 1.05 * vlen, dist ); }

void main(){
  vec4 centre = texture2D( tColor, vUv );

  // The viewmodel has no world velocity worth speaking of; smearing it is the
  // artefact people mean when they say motion blur looks like vaseline.
  if ( texture2D( tMask, vUv ).r > 0.5 ){ gl_FragColor = centre; return; }

  vec2 vN = texture2D( tNeighbour, vUv ).xy;
  float vNpx = length( vN * uResolution );
  if ( vNpx < 1.0 ){ gl_FragColor = centre; return; }

  float dC = rawDepth( vUv );
  float zC = linearDepth( dC );
  vec2 vC = velocityAt( vUv, dC );
  float vCpx = max( length( vC * uResolution ), 0.5 );

  float jitter = ign( gl_FragCoord.xy + uFrame * 11.71 ) - 0.5;

  vec3 sum = centre.rgb;
  float wsum = 1.0;

  for ( int i = 0; i < SAMPLES; i++ ){
    float t = ( ( float( i ) + 0.5 ) / float( SAMPLES ) - 0.5 ) * 2.0;
    t += jitter * ( 2.0 / float( SAMPLES ) );
    vec2 suv = vUv + vN * t * 0.5;
    suv = clamp( suv, vec2( 0.0 ), vec2( 1.0 ) );

    float dS = rawDepth( suv );
    float zS = linearDepth( dS );
    vec2 vS = velocityAt( suv, dS );
    float vSpx = max( length( vS * uResolution ), 0.5 );

    float dist = abs( t ) * 0.5 * vNpx;

    float fg = softDepth( zC, zS );   // sample is in front of us
    float bg = softDepth( zS, zC );   // we are in front of the sample
    float w = fg * cone( dist, vSpx )
            + bg * cone( dist, vCpx )
            + cylinder( dist, vSpx ) * cylinder( dist, vCpx ) * 2.0;

    // Never pull the weapon into the world's blur.
    w *= 1.0 - step( 0.5, texture2D( tMask, suv ).r );

    sum += texture2D( tColor, suv ).rgb * w;
    wsum += w;
  }

  gl_FragColor = vec4( sum / max( wsum, 1e-4 ), centre.a );
}
`;

export function createMotionBlurPass(renderer, opts = {}) {
  const hdrType = opts.hdrType || THREE.UnsignedByteType;
  const vecType = hdrType === THREE.HalfFloatType ? THREE.HalfFloatType : THREE.UnsignedByteType;

  let tileA = null, tileB = null, neighbour = null;
  let w = 1, h = 1;

  const tileMat = fsMaterial(TILE_FRAG, {
    tDepth: { value: null }, tPrevTile: { value: null },
    uInvProj: { value: new THREE.Matrix4() },
    uNearFar: { value: new THREE.Vector2(0.06, 900) },
    uInvViewProj: { value: new THREE.Matrix4() },
    uPrevViewProj: { value: new THREE.Matrix4() },
    uScale: { value: 0.5 },
    uTexel: { value: new THREE.Vector2() },
    uMaxLen: { value: 0.04 },
  }, { FROM_DEPTH: 1 });

  const tileMat2 = fsMaterial(TILE_FRAG, {
    tDepth: { value: null }, tPrevTile: { value: null },
    uInvProj: { value: new THREE.Matrix4() },
    uNearFar: { value: new THREE.Vector2(0.06, 900) },
    uInvViewProj: { value: new THREE.Matrix4() },
    uPrevViewProj: { value: new THREE.Matrix4() },
    uScale: { value: 0.5 },
    uTexel: { value: new THREE.Vector2() },
    uMaxLen: { value: 0.04 },
  });

  const neighbourMat = fsMaterial(NEIGHBOUR_FRAG, {
    tTile: { value: null }, uTexel: { value: new THREE.Vector2() },
  });

  const blurMat = fsMaterial(BLUR_FRAG, {
    tColor: { value: null }, tDepth: { value: null },
    tNeighbour: { value: null }, tMask: { value: null },
    uInvProj: { value: new THREE.Matrix4() },
    uNearFar: { value: new THREE.Vector2(0.06, 900) },
    uInvViewProj: { value: new THREE.Matrix4() },
    uPrevViewProj: { value: new THREE.Matrix4() },
    uScale: { value: 0.5 },
    uResolution: { value: new THREE.Vector2() },
    uFrame: { value: 0 },
  });

  function free() {
    if (tileA) tileA.dispose(); if (tileB) tileB.dispose(); if (neighbour) neighbour.dispose();
    tileA = tileB = neighbour = null;
  }

  function alloc(nw, nh) {
    free();
    w = Math.max(1, nw | 0); h = Math.max(1, nh | 0);
    const aw = Math.max(1, Math.ceil(w / 4)), ah = Math.max(1, Math.ceil(h / 4));
    const bw = Math.max(1, Math.ceil(w / TILE)), bh = Math.max(1, Math.ceil(h / TILE));
    tileA = makeRT(aw, ah, { type: vecType, format: THREE.RGBAFormat, filter: THREE.NearestFilter, name: 'mb.tileA' });
    tileB = makeRT(bw, bh, { type: vecType, format: THREE.RGBAFormat, filter: THREE.NearestFilter, name: 'mb.tileB' });
    neighbour = makeRT(bw, bh, { type: vecType, format: THREE.RGBAFormat, filter: THREE.NearestFilter, name: 'mb.neigh' });
    blurMat.uniforms.uResolution.value.set(w, h);
  }

  function copyCommon(u, camera, invViewProj, prevViewProj, scale) {
    u.uInvProj.value.copy(camera.projectionMatrix).invert();
    u.uNearFar.value.set(camera.near, camera.far);
    u.uInvViewProj.value.copy(invViewProj);
    u.uPrevViewProj.value.copy(prevViewProj);
    u.uScale.value = scale;
  }

  const api = {
    enabled: true,
    // A 180° shutter blurs over half a frame's worth of motion, and the
    // reprojection already measures exactly one frame — so the shutter is a
    // plain 0.5, not a magic number to be tuned per frame rate.
    intensity: opts.intensity != null ? opts.intensity : 0.5,
    maxBlur: opts.maxBlur != null ? opts.maxBlur : 0.045,

    resize(nw, nh) { alloc(nw, nh); },

    // `target` and `src` must be different textures.
    render(target, src, depthTexture, maskTexture, camera, invViewProj, prevViewProj, frame) {
      const s = api.intensity;
      copyCommon(tileMat.uniforms, camera, invViewProj, prevViewProj, s);
      tileMat.uniforms.tDepth.value = depthTexture;
      tileMat.uniforms.uTexel.value.set(1 / w, 1 / h);
      tileMat.uniforms.uMaxLen.value = api.maxBlur;
      drawTo(renderer, tileA, tileMat);

      tileMat2.uniforms.tPrevTile.value = tileA.texture;
      tileMat2.uniforms.uTexel.value.set(1 / tileA.width, 1 / tileA.height);
      tileMat2.uniforms.uMaxLen.value = api.maxBlur;
      drawTo(renderer, tileB, tileMat2);

      neighbourMat.uniforms.tTile.value = tileB.texture;
      neighbourMat.uniforms.uTexel.value.set(1 / tileB.width, 1 / tileB.height);
      drawTo(renderer, neighbour, neighbourMat);

      copyCommon(blurMat.uniforms, camera, invViewProj, prevViewProj, s);
      blurMat.uniforms.tColor.value = src;
      blurMat.uniforms.tDepth.value = depthTexture;
      blurMat.uniforms.tNeighbour.value = neighbour.texture;
      blurMat.uniforms.tMask.value = maskTexture;
      blurMat.uniforms.uFrame.value = frame % 64;
      drawTo(renderer, target, blurMat);
    },

    dispose() { free(); tileMat.dispose(); tileMat2.dispose(); neighbourMat.dispose(); blurMat.dispose(); },
  };

  alloc(2, 2);
  return api;
}
