// Applies the two world-space effects — occlusion and in-scattering — back onto
// the HDR frame, before the viewmodel is drawn.
//
// The interesting part is *how* the AO is applied. Ambient occlusion answers
// "how much of the surrounding hemisphere can this point see?", and the honest
// answer only bears on light arriving from that hemisphere: sky light and
// bounce. Direct sunlight arrives from one direction and is already occluded,
// correctly and with a hard edge, by the shadow map. Multiplying AO over the
// whole shaded result darkens the sunlit side of everything, which is precisely
// how AO ends up making a scene look muddy and grey instead of contact-shaded.
//
// So the AO term is faded out wherever direct sun actually lands, using the
// same shadow map the volumetrics march through: full occlusion in shadow,
// none in the sun, a soft ramp at the terminator. Without a shadow map the
// suppression is skipped and AO applies flat, which is the muddy version — but
// that only happens at tier 0, where there is no sun shadow to be muddy about.

import * as THREE from 'three';
import { fsMaterial, drawTo, GLSL_DEPTH, GLSL_NORMAL, GLSL_SHADOW } from './common.js';

const FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
${GLSL_DEPTH}
${GLSL_NORMAL}
${GLSL_SHADOW}
uniform sampler2D tColor;
uniform sampler2D tAO;
uniform sampler2D tVol;
uniform mat4 uInvView;
uniform vec3 uSunDirView;
uniform float uAOStrength;
uniform float uVolStrength;
uniform vec2 uTexel;

void main(){
  vec4 c = texture2D( tColor, vUv );

  #ifdef USE_AO
    float d = rawDepth( vUv );
    if ( d < 0.9999 ){
      float ao = texture2D( tAO, vUv ).r;
      float direct = 0.0;
      #ifdef USE_SHADOW
        vec3 P = viewPos( vUv, d );
        vec3 N = normalFromDepth( vUv, P, uTexel );
        float ndl = max( 0.0, dot( N, uSunDirView ) );
        vec3 wp = ( uInvView * vec4( P, 1.0 ) ).xyz;
        direct = ndl * sunVisibilityPCF( wp );
      #endif
      float k = mix( ao, 1.0, smoothstep( 0.02, 0.45, direct ) );
      c.rgb *= mix( 1.0, k, uAOStrength );
    }
  #endif

  #ifdef USE_VOL
    c.rgb += texture2D( tVol, vUv ).rgb * uVolStrength;
  #endif

  gl_FragColor = c;
}
`;

export function createResolvePass(renderer) {
  const mat = fsMaterial(FRAG, {
    tColor: { value: null },
    tAO: { value: null },
    tVol: { value: null },
    tDepth: { value: null },
    tShadow: { value: null },
    uInvProj: { value: new THREE.Matrix4() },
    uInvView: { value: new THREE.Matrix4() },
    uNearFar: { value: new THREE.Vector2(0.06, 900) },
    uShadowMat: { value: new THREE.Matrix4() },
    uShadowTexel: { value: new THREE.Vector2(1 / 2048, 1 / 2048) },
    uShadowBias: { value: 0.0006 },
    uSunDirView: { value: new THREE.Vector3(0, 1, 0) },
    uAOStrength: { value: 1.0 },
    uVolStrength: { value: 1.0 },
    uTexel: { value: new THREE.Vector2() },
  });

  let flags = '';
  const _sunView = new THREE.Vector3();
  let shadowIsDepthTex = null;

  return {
    material: mat,
    resize(w, h) { mat.uniforms.uTexel.value.set(1 / Math.max(1, w), 1 / Math.max(1, h)); },

    render(target, src, ao, vol, depthTexture, camera, sun, sunDirWorld) {
      const u = mat.uniforms;
      u.tColor.value = src;
      u.tDepth.value = depthTexture;
      u.tAO.value = ao;
      u.tVol.value = vol;

      const shadowMap = sun && sun.shadow && sun.shadow.map ? sun.shadow.map.texture : null;
      const useAO = !!(ao && depthTexture);
      const useShadow = !!(shadowMap && depthTexture);
      const useVol = !!vol;

      // Recompiling a shader is expensive, so only touch `defines` when the
      // available inputs actually change — which is at boot and on a quality
      // switch, not per frame.
      const want = (useAO ? 'a' : '') + (useShadow ? 's' : '') + (useVol ? 'v' : '');
      if (want !== flags) {
        flags = want;
        if (useAO) mat.defines.USE_AO = 1; else delete mat.defines.USE_AO;
        if (useShadow) mat.defines.USE_SHADOW = 1; else delete mat.defines.USE_SHADOW;
        if (useVol) mat.defines.USE_VOL = 1; else delete mat.defines.USE_VOL;
        mat.needsUpdate = true;
      }

      if (useAO) {
        u.uInvProj.value.copy(camera.projectionMatrix).invert();
        u.uNearFar.value.set(camera.near, camera.far);
      }
      if (useShadow) {
        const isDepthTex = !!(shadowMap.isDepthTexture || shadowMap.format === THREE.DepthFormat);
        if (shadowIsDepthTex !== isDepthTex) {
          shadowIsDepthTex = isDepthTex;
          if (isDepthTex) mat.defines.SHADOW_DEPTH_TEXTURE = 1; else delete mat.defines.SHADOW_DEPTH_TEXTURE;
          mat.needsUpdate = true;
        }
        u.tShadow.value = shadowMap;
        u.uShadowMat.value.copy(sun.shadow.matrix);
        const ms = sun.shadow.mapSize;
        u.uShadowTexel.value.set(1 / Math.max(1, ms.x), 1 / Math.max(1, ms.y));
        u.uInvView.value.copy(camera.matrixWorld);
        _sunView.copy(sunDirWorld).transformDirection(camera.matrixWorldInverse);
        u.uSunDirView.value.copy(_sunView);
      }

      drawTo(renderer, target, mat);
    },

    dispose() { mat.dispose(); },
  };
}
