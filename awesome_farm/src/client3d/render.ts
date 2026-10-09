// What both 3D pages share: the renderer settings, the post chain (bloom, the colour grade, output) and the hour of the sky.
import { ACESFilmicToneMapping, Color, HalfFloatType, type OrthographicCamera, PCFSoftShadowMap, type Scene, SRGBColorSpace, Vector2, WebGLRenderer, WebGLRenderTarget } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { TUNING } from '../shared/config';

/** The camera's elevation (62 degrees: a gentle top-down that still shows the fronts of things) and how many tiles tall the view is at zoom 1 (the 2D view's classic distance). */
export const EL = 62 * Math.PI / 180;
export const BASE_VIEW = 11.25;

/** The pixel ratio cap: phones (coarse pointers) render at most 1.5x, computers 2x. */
export const dprCap = () => (matchMedia('(pointer:coarse)').matches ? 1.5 : 2);

/** A renderer with the look's settings: soft shadows, filmic tone mapping, sRGB out. */
export function makeRenderer (alpha = false) {
    const renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance', alpha });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap()));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.outputColorSpace = SRGBColorSpace;
    return renderer;
}

/** The post chain: the scene, a soft bloom, the grade (tint, saturation, exposure, a vignette), then output. */
export function makePost (renderer: WebGLRenderer, scene: Scene, cam: OrthographicCamera) {
    const rt = new WebGLRenderTarget(4, 4, { type: HalfFloatType, samples: 4 });
    const composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, cam));
    const bloom = new UnrealBloomPass(new Vector2(512, 512), 0.28, 0.6, 1.35);
    composer.addPass(bloom);
    const grade = new ShaderPass({
        uniforms: { tDiffuse: { value: null }, uTint: { value: new Color(1, 1, 1) }, uSat: { value: 1.15 }, uExp: { value: 1 }, uVig: { value: 0.32 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse; uniform vec3 uTint; uniform float uSat, uExp, uVig;
          void main(){ vec4 c = texture2D(tDiffuse, vUv); vec3 col = c.rgb * uTint * uExp; float l = dot(col, vec3(.299,.587,.114)); col = mix(vec3(l), col, uSat);
          float v = smoothstep(.95, .28, length((vUv - .5) * vec2(1.25, 1.0))); col *= mix(1.0 - uVig, 1.0, v); gl_FragColor = vec4(col, c.a); }`
    });
    composer.addPass(grade);
    composer.addPass(new OutputPass());
    /** Size the chain to the canvas (CSS pixels) at a pixel ratio. */
    const resize = (w: number, h: number, dpr: number) => {
        renderer.setPixelRatio(dpr);
        renderer.setSize(w, h, false);
        composer.setPixelRatio(dpr);
        composer.setSize(w, h);
        bloom.resolution.set(w / 2, h / 2);
    };
    return { composer, bloom, grade, rt, resize };
}

/** The hour of the sky (0..24) for the world clock: the day runs 6:00 to 20:00, the night 20:00 to 6:00. */
export function hourOf (clock: number, nightLen: number) {
    const dayLen = TUNING.dayLength;
    return clock >= dayLen ? (20 + (clock - dayLen) / Math.max(1, nightLen) * 10) % 24 : 6 + clock / dayLen * 14;
}
