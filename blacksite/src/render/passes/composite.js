// Pass 6 — the uber pass: everything that happens to a finished HDR frame on
// its way to the display, in one shader.
//
// It is one shader on purpose. Exposure, tonemap, grade, grain, aberration,
// vignette and distortion are all per-pixel point operations on the same texel;
// splitting them into six passes would mean six full-resolution reads and five
// full-resolution writes of the same data for arithmetic that costs less than
// one of those reads. One dependent fetch, all the maths, done.
//
// The tonemap is AgX rather than the `(x*(2.51x+0.03))/(x*(2.43x+0.59)+0.14)`
// curve that gets called "ACES" everywhere. That approximation was fitted to the
// ACES RRT's *luminance* response and applied per channel, which means the
// moment one channel clips the hue swings — bright warm lights go orange then
// yellow then white, and saturated colour crushes toward the primaries. AgX
// instead rotates into a compressed working space first, so channels approach
// white together and hue survives all the way into the highlight. On a scene lit
// by a low amber sun, which is this whole game, that difference is the picture.
//
// The grade underneath it is a three-way push: shadows toward teal, highlights
// toward amber. It is the oldest trick in colour grading because it is what
// separates a subject from its environment without touching the subject —
// complementary tints on either end of the luminance range read as depth.

import * as THREE from 'three';
import { fsMaterial, drawTo, GLSL_NOISE } from './common.js';

const FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
${GLSL_NOISE}
uniform sampler2D tColor;
uniform sampler2D tBloom;
uniform vec2 uResolution;
uniform float uExposure;
uniform float uBloom;
uniform float uTime;
uniform float uGrain;
uniform float uChromatic;
uniform float uVignette;
uniform float uDistortion;
uniform float uSaturation;
uniform float uSharpen;
uniform float uSharpenWide;
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;

const vec3 LUMA = vec3( 0.2126, 0.7152, 0.0722 );

const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
  vec3( 0.6274, 0.0691, 0.0164 ),
  vec3( 0.3293, 0.9195, 0.0880 ),
  vec3( 0.0433, 0.0113, 0.8956 ) );
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
  vec3(  1.6605, -0.1246, -0.0182 ),
  vec3( -0.5876,  1.1329, -0.1006 ),
  vec3( -0.0728, -0.0083,  1.1187 ) );

// The sigmoid AgX applies in log space. Sixth order because the curve has to be
// monotonic across sixteen and a half stops without a visible inflection.
vec3 agxContrast( vec3 x ){
  vec3 x2 = x * x;
  vec3 x4 = x2 * x2;
  return + 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4
         - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}

// Applied inside AgX space, between the sigmoid and the outset. A slope/power/
// saturation trim here behaves like a print stock; the same trim applied after
// the outset would fight the hue-preserving rotation the outset just performed.
vec3 agxLook( vec3 c ){
  float luma = dot( c, LUMA );
  vec3 slope = vec3( 1.0, 0.985, 0.945 );
  vec3 power = vec3( 1.08, 1.06, 1.04 );
  c = pow( max( c * slope, vec3( 0.0 ) ), power );
  return luma + 1.10 * ( c - luma );
}

vec3 agx( vec3 color ){
  const mat3 inset = mat3(
    vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
    vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
    vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 ) );
  const mat3 outset = mat3(
    vec3(  1.1271005818144368, -0.1413297634984383, -0.14132976349843826 ),
    vec3( -0.11060664309660323, 1.157823702216272,  -0.11060664309660294 ),
    vec3( -0.016493938717834573, -0.016493938717834257, 1.2519364065950405 ) );
  const float minEv = -12.47393;
  const float maxEv = 4.026069;

  color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
  color = inset * color;
  color = max( color, 1e-10 );
  color = ( log2( color ) - minEv ) / ( maxEv - minEv );
  color = clamp( color, 0.0, 1.0 );
  color = agxContrast( color );
  color = agxLook( color );
  color = outset * color;
  color = pow( max( color, vec3( 0.0 ) ), vec3( 2.2 ) );
  color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
  return clamp( color, 0.0, 1.0 );
}

vec3 grade( vec3 c ){
  float l = dot( c, LUMA );
  float ws = 1.0 - smoothstep( 0.0, 0.42, l );
  float wh = smoothstep( 0.30, 0.96, l );
  c *= mix( vec3( 1.0 ), uShadowTint, ws );
  c *= mix( vec3( 1.0 ), uHighlightTint, wh );
  return mix( vec3( dot( c, LUMA ) ), c, uSaturation );
}

vec3 lin2srgb( vec3 c ){
  c = clamp( c, vec3( 0.0 ), vec3( 1.0 ) );
  return mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( vec3( 0.0031308 ), c ) );
}

// A reversible squash into 0..1, so the sharpener below can assume a display
// range while still operating on HDR data. Sharpening after the tonemap would
// mean tonemapping five taps instead of one.
vec3 tmap( vec3 c ){ return c / ( 1.0 + max( c.r, max( c.g, c.b ) ) ); }
vec3 untmap( vec3 c ){ return c / max( 1.0 - max( c.r, max( c.g, c.b ) ), 1e-4 ); }

// AMD's RCAS, returned as a delta so the aberrated colour can keep its own
// lateral offsets.
//
// A temporal resolve is a weighted average over a jittered history, which makes
// it a low-pass filter by construction — TAA always costs high-frequency detail,
// and the fix is to put it back rather than to weaken the accumulation, since
// weakening it just brings the shimmer back. An unsharp mask would do it by
// adding a scaled high-pass, but that overshoots and rings on any edge already
// at full contrast — here that is the sky/silo line. RCAS instead solves, per
// channel, for the largest sharpening lobe that still leaves the result inside
// the 3×3 cross's own min/max. Detail returns; a halo is arithmetically
// impossible. Folded into this shader because the composite already reads this
// texel and a separate pass would cost a full-resolution round trip.
vec3 sharpenDelta( vec2 uv, vec2 texel, float amount ){
  vec3 e = tmap( texture2D( tColor, uv ).rgb );
  vec3 b = tmap( texture2D( tColor, uv + vec2( 0.0, -texel.y ) ).rgb );
  vec3 d = tmap( texture2D( tColor, uv + vec2( -texel.x, 0.0 ) ).rgb );
  vec3 f = tmap( texture2D( tColor, uv + vec2(  texel.x, 0.0 ) ).rgb );
  vec3 h = tmap( texture2D( tColor, uv + vec2( 0.0,  texel.y ) ).rgb );

  vec3 mn4 = min( min( b, d ), min( f, h ) );
  vec3 mx4 = max( max( b, d ), max( f, h ) );

  vec3 hitMin = min( mn4, e ) / max( 4.0 * mx4, 1e-4 );
  vec3 hitMax = ( vec3( 1.0 ) - max( mx4, e ) ) / min( 4.0 * mn4 - 4.0, -1e-4 );
  vec3 lobeRGB = max( -hitMin, hitMax );
  // The least-negative channel lobe wins: taking the strongest would let one
  // channel sharpen harder than the others and shift the hue of the edge.
  float lobe = max( -0.1875, min( 0.0, max( lobeRGB.r, max( lobeRGB.g, lobeRGB.b ) ) ) ) * amount;

  vec3 sharp = ( e + lobe * ( b + d + f + h ) ) / ( 1.0 + 4.0 * lobe );
  return untmap( sharp ) - untmap( e );
}

void main(){
  vec2 centred = vUv - 0.5;
  float r2 = dot( centred, centred );

  // A whisper of barrel distortion. Real glass has some; a perfectly rectilinear
  // frame is one of the quiet tells that an image was rendered rather than shot.
  vec2 base = clamp( vUv + centred * r2 * uDistortion, vec2( 0.0 ), vec2( 1.0 ) );

  // Aberration offsets along the radius and scales with r², so it is exactly
  // zero at the optical centre — where the crosshair is, and where a constant
  // offset would look like a rendering bug rather than like a lens.
  vec2 ca = centred * r2 * uChromatic;
  vec3 col;
  col.r = texture2D( tColor, clamp( base + ca, vec2( 0.0 ), vec2( 1.0 ) ) ).r;
  col.g = texture2D( tColor, base ).g;
  col.b = texture2D( tColor, clamp( base - ca, vec2( 0.0 ), vec2( 1.0 ) ) ).b;

  // Sharpen before the bloom is added: bloom is a deliberately soft signal and
  // running a detail filter over it only amplifies its own sampling structure.
  // Two scales. The temporal resolve does not only soften single-texel detail:
  // the Catmull-Rom history resample and the repeated blend eat two-texel
  // features as well, and a one-texel kernel cannot reach them. The wider lobe
  // runs the same overshoot-free limiter at radius two.
  if ( uSharpen > 0.0 ) {
    vec2 texel = 1.0 / uResolution;
    col += sharpenDelta( base, texel, uSharpen );
    if ( uSharpenWide > 0.0 ) col += sharpenDelta( base, texel * 2.0, uSharpen * uSharpenWide );
  }

  col += texture2D( tBloom, base ).rgb * uBloom;
  col *= uExposure;

  col = agx( col );
  col = grade( col );

  float v = smoothstep( 1.05, 0.28, length( centred ) * 1.42 );
  col *= mix( 1.0, v, uVignette );

  col = lin2srgb( col );

  // Grain rises as the image darkens: that is how film behaves, and it is also
  // where an 8-bit frame needs the dither most. Even with grain switched off a
  // sub-LSB dither stays, or the dusk sky gradient bands.
  float n = hash13( vec3( gl_FragCoord.xy, floor( uTime * 24.0 ) ) ) - 0.5;
  float dark = 1.0 - smoothstep( 0.0, 0.65, dot( col, LUMA ) );
  col += n * ( uGrain * ( 0.25 + 0.75 * dark ) + 1.0 / 255.0 );

  gl_FragColor = vec4( col, 1.0 );
}
`;

export function createCompositePass(renderer, opts = {}) {
  const mat = fsMaterial(FRAG, {
    tColor: { value: null },
    tBloom: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uExposure: { value: opts.exposure != null ? opts.exposure : 1.3 },
    uBloom: { value: opts.bloom != null ? opts.bloom : 0.06 },
    uTime: { value: 0 },
    uGrain: { value: 0.030 },
    uChromatic: { value: 0.008 },
    uVignette: { value: 0.46 },
    uDistortion: { value: 0.018 },
    uSaturation: { value: 1.06 },
    // Driven by the chain: full strength when the temporal filter is running,
    // zero when it is not, because sharpening an un-antialiased frame just
    // makes the aliasing crisper.
    uSharpen: { value: 0.0 },
    uSharpenWide: { value: 0.55 },
    uShadowTint: { value: new THREE.Vector3(0.90, 1.005, 1.10) },
    uHighlightTint: { value: new THREE.Vector3(1.055, 1.0, 0.90) },
  });

  // A black bloom texture stands in when the bloom pass is unavailable, so the
  // shader never needs a variant for it.
  const blackData = new Uint8Array([0, 0, 0, 255]);
  const black = new THREE.DataTexture(blackData, 1, 1);
  black.needsUpdate = true;

  return {
    uniforms: mat.uniforms,
    resize(w, h) { mat.uniforms.uResolution.value.set(w, h); },
    render(target, src, bloomTexture, time) {
      mat.uniforms.tColor.value = src;
      mat.uniforms.tBloom.value = bloomTexture || black;
      mat.uniforms.uTime.value = time;
      drawTo(renderer, target, mat);
    },
    dispose() { mat.dispose(); black.dispose(); },
  };
}
