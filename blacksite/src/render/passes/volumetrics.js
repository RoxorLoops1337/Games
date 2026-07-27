// Pass 3 — volumetric light shafts.
//
// At a low dusk sun this is the single loudest "expensive engine" cue there is,
// because it is the one effect that makes the *air* visible: shadows stop being
// a property of surfaces and start being a property of the space between them.
//
// The ray marches from the eye toward each pixel's surface, asking the sun's
// shadow map at every step whether that point in mid-air can see the sun, and
// integrating in-scattering where it can. Three things keep it from looking
// cheap:
//
//   - The start offset is dithered per pixel with interleaved gradient noise.
//     A fixed step start produces concentric bands you cannot unsee; dithering
//     converts that banding into high-frequency noise, which the blur and the
//     temporal filter then remove for free.
//   - A Henyey-Greenstein phase function, so scattering is strongly forward.
//     Isotropic scattering gives a uniform milky haze; the forward lobe is what
//     makes a shaft bloom when you look toward the sun and vanish when you
//     look away.
//   - Height falloff, because dust and smoke settle. Without it the shafts have
//     the same intensity at roof height as at ankle height and read as fog
//     rather than as light.
//
// If the sun has no shadow map — a driver that refused one, or shadows off at
// tier 0 — the pass swaps to a screen-space radial gather instead of switching
// itself off, so a low tier still gets the silhouette-and-rays read.

import * as THREE from 'three';
import { makeRT, fsMaterial, drawTo, GLSL_DEPTH, GLSL_NOISE, GLSL_SHADOW } from './common.js';

const MARCH_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
${GLSL_DEPTH}
${GLSL_NOISE}
${GLSL_SHADOW}
uniform mat4 uInvView;
uniform vec3 uCamPos;
uniform vec3 uSunDir;      // world space, pointing toward the sun
uniform vec3 uSunColor;
uniform float uDensity;
uniform float uMaxDist;
uniform float uAnisotropy;
uniform float uHeightFalloff;
uniform float uFrame;

#define PI 3.14159265

float henyeyGreenstein( float c, float g ){
  float g2 = g * g;
  float denom = 1.0 + g2 - 2.0 * g * c;
  return ( 1.0 - g2 ) / ( 4.0 * PI * max( pow( denom, 1.5 ), 1e-4 ) );
}

void main(){
  float d = rawDepth( vUv );
  vec3 P = viewPos( vUv, d );
  float surfaceDist = length( P );
  // Sky pixels have no surface to stop at, so the ray runs to the fog horizon.
  float far = d >= 0.9999 ? uMaxDist : min( surfaceDist, uMaxDist );

  vec3 rd = normalize( ( uInvView * vec4( P, 0.0 ) ).xyz );

  float stepLen = far / float( STEPS );
  float jitter = ign( gl_FragCoord.xy + uFrame * 7.919 );

  float acc = 0.0;
  for ( int i = 0; i < STEPS; i++ ){
    float t = ( float( i ) + jitter ) * stepLen;
    vec3 wp = uCamPos + rd * t;
    float vis = sunVisibility( wp );
    float height = exp( -max( wp.y, 0.0 ) * uHeightFalloff );
    acc += vis * height;
  }
  acc *= stepLen;

  float phase = henyeyGreenstein( dot( rd, uSunDir ), uAnisotropy );
  vec3 col = uSunColor * uDensity * phase * acc;

  // Alpha carries linear depth for the bilateral blur that follows.
  gl_FragColor = vec4( max( col, vec3( 0.0 ) ), linearDepth( d ) / uNearFar.y );
}
`;

// Fallback: a screen-space radial gather from the sun's projected position.
// No shadow map involved, so it only knows about occluders the camera can see —
// but toward a low sun that is most of them, and it is far better than nothing.
const RADIAL_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
${GLSL_DEPTH}
${GLSL_NOISE}
uniform vec2 uSunUV;
uniform vec3 uSunColor;
uniform float uDensity;
uniform float uOnScreen;
uniform float uFrame;

void main(){
  vec2 delta = ( uSunUV - vUv ) / float( STEPS );
  float jitter = ign( gl_FragCoord.xy + uFrame * 7.919 );
  vec2 uv = vUv + delta * jitter;
  float acc = 0.0, decay = 1.0;
  for ( int i = 0; i < STEPS; i++ ){
    uv += delta;
    // Only sky contributes; anything with geometry in front of it is an occluder.
    acc += step( 0.9999, rawDepth( clamp( uv, vec2( 0.0 ), vec2( 1.0 ) ) ) ) * decay;
    decay *= 0.96;
  }
  acc /= float( STEPS );
  float radial = 1.0 - clamp( length( uSunUV - vUv ) * 0.9, 0.0, 1.0 );
  vec3 col = uSunColor * uDensity * acc * radial * radial * uOnScreen;
  gl_FragColor = vec4( col, linearDepth( rawDepth( vUv ) ) / uNearFar.y );
}
`;

// Depth-aware cross blur. The dither leaves noise at the scale of one texel;
// this removes it without letting a shaft leak across the silhouette of the
// object that is casting it.
const BLUR_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tVol;
uniform vec2 uDir;

void main(){
  vec4 c = texture2D( tVol, vUv );
  vec3 sum = c.rgb * 0.324; float wsum = 0.324;
  #define VTAP( k, weight ) { \
    vec4 s = texture2D( tVol, vUv + uDir * float( k ) ); \
    float w = ( weight ) * exp( -abs( s.a - c.a ) * 160.0 ); \
    sum += s.rgb * w; wsum += w; }
  VTAP( -3.2, 0.070 ) VTAP( -2.0, 0.122 ) VTAP( -1.0, 0.181 )
  VTAP(  1.0, 0.181 ) VTAP(  2.0, 0.122 ) VTAP(  3.2, 0.070 )
  gl_FragColor = vec4( sum / wsum, c.a );
}
`;

export function createVolumetricPass(renderer, opts = {}) {
  let a = null, b = null;
  let w = 1, h = 1;
  let steps = 16;
  let hdrType = opts.hdrType || THREE.UnsignedByteType;
  let mode = 'march';   // or 'radial'

  const marchMat = fsMaterial(MARCH_FRAG, {
    tDepth: { value: null },
    uInvProj: { value: new THREE.Matrix4() },
    uNearFar: { value: new THREE.Vector2(0.06, 900) },
    tShadow: { value: null },
    uShadowMat: { value: new THREE.Matrix4() },
    uShadowTexel: { value: new THREE.Vector2(1 / 2048, 1 / 2048) },
    uShadowBias: { value: 0.0009 },
    uInvView: { value: new THREE.Matrix4() },
    uCamPos: { value: new THREE.Vector3() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 0.86, 0.68) },
    uDensity: { value: opts.density != null ? opts.density : 0.10 },
    uMaxDist: { value: opts.maxDist || 70 },
    uAnisotropy: { value: opts.anisotropy != null ? opts.anisotropy : 0.72 },
    uHeightFalloff: { value: opts.heightFalloff != null ? opts.heightFalloff : 0.075 },
    uFrame: { value: 0 },
  }, { STEPS: steps });

  const radialMat = fsMaterial(RADIAL_FRAG, {
    tDepth: { value: null },
    uInvProj: { value: new THREE.Matrix4() },
    uNearFar: { value: new THREE.Vector2(0.06, 900) },
    uSunUV: { value: new THREE.Vector2(0.5, 0.5) },
    uSunColor: { value: new THREE.Color(1, 0.86, 0.68) },
    uDensity: { value: 0.9 },
    uOnScreen: { value: 0 },
    uFrame: { value: 0 },
  }, { STEPS: steps });

  const blurMat = fsMaterial(BLUR_FRAG, {
    tVol: { value: null },
    uDir: { value: new THREE.Vector2() },
  });

  function alloc(nw, nh) {
    free();
    w = Math.max(1, nw >> 1); h = Math.max(1, nh >> 1);
    a = makeRT(w, h, { type: hdrType, name: 'vol.a' });
    b = makeRT(w, h, { type: hdrType, name: 'vol.b' });
  }

  function free() { if (a) a.dispose(); if (b) b.dispose(); a = b = null; }

  const _sunWorld = new THREE.Vector3();
  const _proj = new THREE.Vector3();
  let shadowIsDepthTex = null;

  const api = {
    enabled: true,
    get texture() { return a ? a.texture : null; },
    get mode() { return mode; },

    setSteps(n) {
      if (n <= 0) { api.enabled = false; return; }
      api.enabled = true;
      steps = Math.max(4, Math.min(48, n | 0));
      marchMat.defines.STEPS = steps; marchMat.needsUpdate = true;
      radialMat.defines.STEPS = Math.min(steps, 24); radialMat.needsUpdate = true;
    },

    resize(nw, nh) { alloc(nw, nh); },

    // `sun` may be null, and `sun.shadow.map` does not exist until Three has
    // rendered a shadow at least once — both cases fall through to the radial
    // gather rather than to a black frame.
    render(depthTexture, camera, sun, sunDir, sunColor, frame) {
      const shadowMap = sun && sun.shadow && sun.shadow.map ? sun.shadow.map.texture : null;
      mode = shadowMap ? 'march' : 'radial';

      const mat = mode === 'march' ? marchMat : radialMat;
      const u = mat.uniforms;
      u.tDepth.value = depthTexture;
      u.uInvProj.value.copy(camera.projectionMatrix).invert();
      u.uNearFar.value.set(camera.near, camera.far);
      u.uFrame.value = frame % 64;

      if (mode === 'march') {
        // Three packs directional shadow depth into RGBA on most paths but can
        // hand back a real depth attachment; the unpack has to match or every
        // sample comes back as "in shadow" and the whole world goes dark.
        const isDepthTex = !!(shadowMap.isDepthTexture || shadowMap.format === THREE.DepthFormat);
        if (shadowIsDepthTex !== isDepthTex) {
          shadowIsDepthTex = isDepthTex;
          if (isDepthTex) marchMat.defines.SHADOW_DEPTH_TEXTURE = 1;
          else delete marchMat.defines.SHADOW_DEPTH_TEXTURE;
          marchMat.needsUpdate = true;
        }
        u.tShadow.value = shadowMap;
        u.uShadowMat.value.copy(sun.shadow.matrix);
        const ms = sun.shadow.mapSize;
        u.uShadowTexel.value.set(1 / Math.max(1, ms.x), 1 / Math.max(1, ms.y));
        u.uInvView.value.copy(camera.matrixWorld);
        u.uCamPos.value.copy(camera.position);
        u.uSunDir.value.copy(sunDir);
        u.uSunColor.value.copy(sunColor);
      } else {
        _sunWorld.copy(sunDir).multiplyScalar(400).add(camera.position);
        _proj.copy(_sunWorld).project(camera);
        u.uSunUV.value.set(_proj.x * 0.5 + 0.5, _proj.y * 0.5 + 0.5);
        // Fade out rather than pop when the sun leaves the frame — a radial
        // gather toward an off-screen point streaks toward the wrong edge.
        const off = Math.max(Math.abs(_proj.x), Math.abs(_proj.y));
        u.uOnScreen.value = _proj.z < 1 ? Math.max(0, 1 - Math.max(0, off - 0.8) * 3) : 0;
        u.uSunColor.value.copy(sunColor);
      }

      drawTo(renderer, a, mat);

      blurMat.uniforms.tVol.value = a.texture;
      blurMat.uniforms.uDir.value.set(1 / w, 0);
      drawTo(renderer, b, blurMat);
      blurMat.uniforms.tVol.value = b.texture;
      blurMat.uniforms.uDir.value.set(0, 1 / h);
      drawTo(renderer, a, blurMat);
    },

    dispose() { free(); marchMat.dispose(); radialMat.dispose(); blurMat.dispose(); },
  };

  alloc(2, 2);
  return api;
}
