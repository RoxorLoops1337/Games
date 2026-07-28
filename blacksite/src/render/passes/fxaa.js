// Pass 7, fallback — FXAA.
//
// The chain prefers TAA. This exists for the two cases where TAA cannot run:
// no depth texture to reproject with, or no float target to accumulate in.
// Under those conditions the honest choice is a single-frame edge filter rather
// than a temporal one, because a temporal filter without reprojection is not
// anti-aliasing, it is smearing — and shipping smear is worse than shipping
// aliasing.
//
// This is the luma-edge form of FXAA 3.11: detect a local contrast edge, work
// out whether it runs horizontally or vertically, and take one blended tap
// across it, weighted by how much sub-pixel detail is present. It runs on the
// tonemapped image, which is where FXAA belongs — its contrast thresholds are
// calibrated for perceptual, not linear, values.

import { fsMaterial, drawTo } from './common.js';
import * as THREE from 'three';

const FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor;
uniform vec2 uTexel;

#define EDGE_MIN 0.0312
#define EDGE_MAX 0.125
#define SUBPIX   0.75

float luma( vec3 c ){ return dot( c, vec3( 0.299, 0.587, 0.114 ) ); }

void main(){
  vec3 mCol = texture2D( tColor, vUv ).rgb;
  float lM = luma( mCol );
  float lN = luma( texture2D( tColor, vUv + vec2( 0.0, -uTexel.y ) ).rgb );
  float lS = luma( texture2D( tColor, vUv + vec2( 0.0,  uTexel.y ) ).rgb );
  float lW = luma( texture2D( tColor, vUv + vec2( -uTexel.x, 0.0 ) ).rgb );
  float lE = luma( texture2D( tColor, vUv + vec2(  uTexel.x, 0.0 ) ).rgb );

  float lMin = min( lM, min( min( lN, lS ), min( lW, lE ) ) );
  float lMax = max( lM, max( max( lN, lS ), max( lW, lE ) ) );
  float range = lMax - lMin;

  // Flat area, or so dark that any edge here is below the noise floor.
  if ( range < max( EDGE_MIN, lMax * EDGE_MAX ) ){ gl_FragColor = vec4( mCol, 1.0 ); return; }

  float lNW = luma( texture2D( tColor, vUv + vec2( -uTexel.x, -uTexel.y ) ).rgb );
  float lNE = luma( texture2D( tColor, vUv + vec2(  uTexel.x, -uTexel.y ) ).rgb );
  float lSW = luma( texture2D( tColor, vUv + vec2( -uTexel.x,  uTexel.y ) ).rgb );
  float lSE = luma( texture2D( tColor, vUv + vec2(  uTexel.x,  uTexel.y ) ).rgb );

  float edgeH = abs( lNW + lNE - 2.0 * lN ) * 2.0 + abs( lW + lE - 2.0 * lM ) * 4.0
              + abs( lSW + lSE - 2.0 * lS ) * 2.0;
  float edgeV = abs( lNW + lSW - 2.0 * lW ) * 2.0 + abs( lN + lS - 2.0 * lM ) * 4.0
              + abs( lNE + lSE - 2.0 * lE ) * 2.0;
  bool horizontal = edgeH >= edgeV;

  float l1 = horizontal ? lN : lW;
  float l2 = horizontal ? lS : lE;
  float g1 = abs( l1 - lM ), g2 = abs( l2 - lM );
  float stepLen = horizontal ? uTexel.y : uTexel.x;
  if ( g1 < g2 ) stepLen = -stepLen;

  // Sub-pixel amount: how far the centre sits from the local average tells us
  // how much of the pixel the edge actually covers.
  float avg = ( 2.0 * ( lN + lS + lW + lE ) + lNW + lNE + lSW + lSE ) / 12.0;
  float subpix = clamp( abs( avg - lM ) / max( range, 1e-5 ), 0.0, 1.0 );
  subpix = smoothstep( 0.0, 1.0, subpix );
  subpix = subpix * subpix * SUBPIX;

  vec2 off = horizontal ? vec2( 0.0, stepLen * 0.5 ) : vec2( stepLen * 0.5, 0.0 );
  vec3 blended = texture2D( tColor, vUv + off ).rgb;
  gl_FragColor = vec4( mix( mCol, blended, 0.5 + 0.5 * subpix ), 1.0 );
}
`;

export function createFXAAPass(renderer) {
  const mat = fsMaterial(FRAG, {
    tColor: { value: null },
    uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
  });
  return {
    resize(w, h) { mat.uniforms.uTexel.value.set(1 / Math.max(1, w), 1 / Math.max(1, h)); },
    render(target, src) { mat.uniforms.tColor.value = src; drawTo(renderer, target, mat); },
    dispose() { mat.dispose(); },
  };
}
