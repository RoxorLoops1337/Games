// Pass 2 — ground-truth ambient occlusion.
//
// Not the hemisphere-sampling SSAO everyone writes first. That method asks
// "how many of N random points around me are behind something?", which is a
// Monte-Carlo estimate of the wrong integral: it ignores the cosine term, so a
// grazing occluder counts as much as one directly overhead, and it needs a lot
// of samples before the noise stops looking like dirt. GTAO instead sweeps a
// slice of the hemisphere, finds the *horizon angle* on each side, and
// evaluates the cosine-weighted visibility arc analytically. Two slices of GTAO
// beat sixteen hemisphere samples, and what noise remains is structured, which
// is what makes it removable.
//
// Everything runs at half resolution. AO is a low-frequency signal — a
// full-resolution occlusion buffer is four times the cost for detail the
// denoise immediately throws away.

import * as THREE from 'three';
import { makeRT, fsMaterial, drawTo, GLSL_DEPTH, GLSL_NORMAL, GLSL_NOISE } from './common.js';

const AO_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
${GLSL_DEPTH}
${GLSL_NORMAL}
${GLSL_NOISE}
uniform vec2 uTexel;        // 1 / full-resolution size
uniform vec2 uRadiusScale;  // world metres -> uv, before the 1/z divide
uniform float uRadius;
uniform float uIntensity;
uniform float uFrame;

#define PI 3.14159265
#define HALF_PI 1.57079633

void main(){
  float d = rawDepth( vUv );
  // Sky. Occluding nothing, and reconstructing a position from a depth of 1.0
  // gives an enormous z that would make the radius collapse to a single texel.
  if ( d >= 0.9999 ){ gl_FragColor = vec4( 1.0, 1.0, 0.0, 1.0 ); return; }

  vec3 P = viewPos( vUv, d );
  vec3 N = normalFromDepth( vUv, P, uTexel );
  vec3 V = normalize( -P );

  // Screen-space extent of the world-space radius at this depth, clamped so a
  // surface right against the lens does not turn into a full-screen gather.
  vec2 radiusUV = uRadius * uRadiusScale / max( -P.z, 0.05 );
  radiusUV = min( radiusUV, vec2( 0.10 ) );
  if ( max( radiusUV.x, radiusUV.y ) < uTexel.x ) { gl_FragColor = vec4( 1.0, linearDepth( d ) / uNearFar.y, 0.0, 1.0 ); return; }

  float noise = ign( gl_FragCoord.xy + uFrame * 5.588238 );
  float stepNoise = fract( noise * 3.7 + uFrame * 0.6180339 );

  float visibility = 0.0;

  for ( int s = 0; s < SLICES; s++ ){
    float phi = ( float( s ) + noise ) * PI / float( SLICES );
    vec2 omega = vec2( cos( phi ), sin( phi ) );

    // The slice plane contains V and the slice direction; T is the in-plane
    // axis perpendicular to V, so horizon angles come out signed for free.
    vec3 sliceN = cross( vec3( omega, 0.0 ), V );
    float sl = length( sliceN );
    if ( sl < 1e-5 ) sliceN = vec3( 0.0, 0.0, 1.0 ); else sliceN /= sl;
    vec3 T = cross( sliceN, V );

    vec3 projN = N - sliceN * dot( N, sliceN );
    float projLen = length( projN );
    if ( projLen < 1e-4 ) continue;
    vec3 pn = projN / projLen;
    float n = atan( dot( pn, T ), dot( pn, V ) );

    float cosH1 = -1.0, cosH2 = -1.0;

    for ( int t = 0; t < STEPS; t++ ){
      // Quadratic step spacing. Contact occlusion — the darkening in the last
      // few centimetres of a corner — is the part the eye actually reads, so
      // the taps bunch up near the centre.
      float f = ( float( t ) + stepNoise ) / float( STEPS );
      f = f * f;
      vec2 off = omega * f * radiusUV;

      vec2 uv1 = vUv - off;
      vec2 uv2 = vUv + off;

      vec3 S1 = viewPos( uv1, rawDepth( uv1 ) );
      vec3 S2 = viewPos( uv2, rawDepth( uv2 ) );

      vec3 D1 = S1 - P; float l1 = length( D1 );
      vec3 D2 = S2 - P; float l2 = length( D2 );

      // Distance attenuation, not a hard cut: an abrupt radius boundary shows
      // up as a ring of AO around every object.
      float w1 = clamp( ( uRadius - l1 ) / max( uRadius * 0.5, 1e-4 ), 0.0, 1.0 );
      float w2 = clamp( ( uRadius - l2 ) / max( uRadius * 0.5, 1e-4 ), 0.0, 1.0 );

      float c1 = l1 > 1e-5 ? dot( D1 / l1, V ) : -1.0;
      float c2 = l2 > 1e-5 ? dot( D2 / l2, V ) : -1.0;

      cosH1 = max( cosH1, mix( -1.0, c1, w1 ) );
      cosH2 = max( cosH2, mix( -1.0, c2, w2 ) );
    }

    // Fold the horizons into the hemisphere around the normal, then integrate
    // the cosine-weighted arc between them in closed form.
    float h1 = n + max( -acos( clamp( cosH1, -1.0, 1.0 ) ) - n, -HALF_PI );
    float h2 = n + min(  acos( clamp( cosH2, -1.0, 1.0 ) ) - n,  HALF_PI );

    float arc = 0.25 * ( -cos( 2.0 * h1 - n ) + cos( n ) + 2.0 * h1 * sin( n ) )
              + 0.25 * ( -cos( 2.0 * h2 - n ) + cos( n ) + 2.0 * h2 * sin( n ) );

    visibility += projLen * arc;
  }

  float ao = clamp( visibility / float( SLICES ), 0.0, 1.0 );
  ao = pow( ao, uIntensity );

  // Green carries linear depth so the denoise can be bilateral without a second
  // texture fetch per tap.
  gl_FragColor = vec4( ao, linearDepth( d ) / uNearFar.y, 0.0, 1.0 );
}
`;

// Poisson-disc bilateral, one pass. A separable Gaussian is cheaper but its
// cross shape smears GTAO's slice noise into visible streaks; a rotated disc
// turns the same budget into isotropic blur that the temporal filter finishes off.
const DENOISE_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
${GLSL_NOISE}
uniform sampler2D tAO;
uniform vec2 uTexel;
uniform float uFrame;

const vec2 POISSON[ 8 ] = vec2[ 8 ](
  vec2(  0.9245,  0.0000 ), vec2(  0.4046,  0.7509 ),
  vec2( -0.3120,  0.8256 ), vec2( -0.8801,  0.2740 ),
  vec2( -0.6817, -0.5464 ), vec2(  0.0492, -0.9188 ),
  vec2(  0.6606, -0.5178 ), vec2(  0.2000,  0.2500 )
);

void main(){
  vec4 c = texture2D( tAO, vUv );
  float centerDepth = c.g;
  float sum = c.r, wsum = 1.0;

  float a = ign( gl_FragCoord.xy + uFrame * 3.1 ) * 6.2831853;
  float ca = cos( a ), sa = sin( a );
  mat2 rot = mat2( ca, -sa, sa, ca );

  for ( int i = 0; i < 8; i++ ){
    vec2 o = rot * POISSON[ i ] * uTexel * 3.0;
    vec4 s = texture2D( tAO, vUv + o );
    // Reject across depth discontinuities, or the blur drags foreground
    // occlusion out over the background and every object grows a dark halo.
    float w = exp( -abs( s.g - centerDepth ) * 220.0 );
    sum += s.r * w; wsum += w;
  }
  gl_FragColor = vec4( sum / wsum, centerDepth, 0.0, 1.0 );
}
`;

export function createAOPass(renderer, opts = {}) {
  let raw = null, blurred = null;
  let w = 1, h = 1;
  let slices = 3, steps = 4;

  const aoMat = fsMaterial(AO_FRAG, {
    tDepth: { value: null },
    uInvProj: { value: new THREE.Matrix4() },
    uNearFar: { value: new THREE.Vector2(0.06, 900) },
    uTexel: { value: new THREE.Vector2() },
    uRadiusScale: { value: new THREE.Vector2() },
    uRadius: { value: opts.radius || 0.85 },
    uIntensity: { value: opts.intensity || 1.35 },
    uFrame: { value: 0 },
  }, { SLICES: slices, STEPS: steps });

  const denoiseMat = fsMaterial(DENOISE_FRAG, {
    tAO: { value: null },
    uTexel: { value: new THREE.Vector2() },
    uFrame: { value: 0 },
  });

  function alloc(nw, nh) {
    free();
    w = Math.max(1, nw >> 1); h = Math.max(1, nh >> 1);
    raw = makeRT(w, h, { name: 'ao.raw' });
    blurred = makeRT(w, h, { name: 'ao.blur' });
    aoMat.uniforms.uTexel.value.set(1 / Math.max(1, nw), 1 / Math.max(1, nh));
    denoiseMat.uniforms.uTexel.value.set(1 / w, 1 / h);
  }

  function free() {
    if (raw) raw.dispose();
    if (blurred) blurred.dispose();
    raw = blurred = null;
  }

  const api = {
    enabled: true,
    get texture() { return blurred ? blurred.texture : null; },

    // `ao` in the tier table is a total tap budget; spend it on slices first
    // because slice count is what removes banding, then on march length.
    setSamples(n) {
      if (n <= 0) { api.enabled = false; return; }
      api.enabled = true;
      slices = n <= 6 ? 2 : n <= 10 ? 3 : 4;
      steps = n <= 6 ? 3 : n <= 10 ? 4 : 6;
      aoMat.defines.SLICES = slices;
      aoMat.defines.STEPS = steps;
      aoMat.needsUpdate = true;
    },

    resize(nw, nh) { alloc(nw, nh); },

    render(depthTexture, camera, frame) {
      const u = aoMat.uniforms;
      u.tDepth.value = depthTexture;
      u.uInvProj.value.copy(camera.projectionMatrix).invert();
      u.uNearFar.value.set(camera.near, camera.far);
      // projection[0][0] and [1][1] map view-space metres at unit depth onto
      // NDC; halve them to land in uv.
      u.uRadiusScale.value.set(camera.projectionMatrix.elements[0] * 0.5,
        camera.projectionMatrix.elements[5] * 0.5);
      u.uFrame.value = frame % 64;

      drawTo(renderer, raw, aoMat);

      denoiseMat.uniforms.tAO.value = raw.texture;
      denoiseMat.uniforms.uFrame.value = frame % 64;
      drawTo(renderer, blurred, denoiseMat);
    },

    dispose() { free(); aoMat.dispose(); denoiseMat.dispose(); },
  };

  alloc(2, 2);
  return api;
}
