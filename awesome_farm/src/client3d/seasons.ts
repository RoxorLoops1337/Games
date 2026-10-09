// The four seasons in 3D (the 2D view tints the world and lets things drift through the air; here the ground and the plants
// themselves change): spring freshens the greens and dots the tree crowns with blossom, summer is the models as made, autumn turns
// the leaves orange, red and gold and the grass to straw, winter greys the greens and lays snow on everything that faces the sky.
//
// It is a small shader patch on the island's ground and on the nodes' materials (trees, bushes, rocks...), driven by four shared
// season weights that glide when a new season begins, so nothing is rebuilt. Greens are found by colour (vertex colours are the
// models' paint), which is why buildings, crops and monsters are never touched: only `ground()` and `dress()` opt in.
// Plus the things in the air: falling leaves, petals and snow (heavy snow when it "rains" in winter), as the 2D NightLayer has them.

import { Color, DoubleSide, DynamicDrawUsage, InstancedMesh, type Material, Matrix4, type Mesh, MeshBasicMaterial, type Object3D, PlaneGeometry, Quaternion, type Scene, Vector3, Vector4 } from 'three';
import { SEASON_ORDER, type SeasonId } from '../shared/season';

/** Shared by every patched material: the season weights (spring, summer, autumn, winter) and the camera's up in view space. */
export const seasonU = { uSeason: { value: new Vector4(0, 1, 0, 0) } };

const GLSL_COMMON = /* glsl */`
uniform vec4 uSeason;
varying vec3 vSeasonObj;
varying float vSeasonSeed;
float seasonHash (vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
`;

/** The vertex side: the model-space position (for a per-face pattern that does not swim when a tree sways) and a seed per object. */
const VERT = /* glsl */`
#include <begin_vertex>
vSeasonObj = position;
vSeasonSeed = fract(sin(dot(modelMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
`;

/**
 * The fragment side, after the normal is known and before the lights read the colour. `FOLIAGE` is the plants (blossom, fiery
 * crowns, snow caps), without it the ground (straw grass, a snow blanket with tufts showing through).
 */
const FRAG = /* glsl */`
{
    vec3 c = diffuseColor.rgb;
    float green = smoothstep(0.06, 0.18, c.g - max(c.r, c.b)) * smoothstep(1.5, 2.4, c.g / (c.b + 0.02));
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    vec3 up = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
    float facing = dot(normal, up);
    float face = seasonHash(floor(vSeasonObj * 5.0) + vSeasonSeed * 7.0);
    vec3 col = c;
#ifdef FOLIAGE
    // spring: fresher, brighter green, and blossom on the faces of a crown that look up
    vec3 spring = mix(c, c * vec3(1.15, 1.18, 0.9) + vec3(0.02, 0.03, 0.0), green);
    float bloom = green * step(face, 0.2) * smoothstep(0.1, 0.5, facing) * step(0.3, vSeasonSeed);
    spring = mix(spring, mix(vec3(0.93, 0.36, 0.56), vec3(0.98, 0.86, 0.9), step(0.1, face)), bloom);
    // autumn: each tree its own blend of orange, red and gold, a little different on every face
    float t = fract(vSeasonSeed * 3.1 + face * 0.35);
    vec3 fall = t < 0.45 ? mix(vec3(0.85, 0.24, 0.03), vec3(0.95, 0.5, 0.06), t / 0.45) : mix(vec3(0.95, 0.5, 0.06), vec3(0.62, 0.08, 0.05), (t - 0.45) / 0.55);
    fall = mix(fall, vec3(0.9, 0.62, 0.1), step(0.82, face));
    vec3 autumn = mix(c, fall * clamp(lum * 2.4, 0.45, 1.25), green);
    // winter: dark, cold greens, and snow on whatever faces the sky
    vec3 cold = mix(c, vec3(lum) * vec3(0.55, 0.75, 0.72) + vec3(0.0, 0.03, 0.03), green * 0.8);
    float snow = smoothstep(0.38, 0.72, facing) * (0.75 + 0.25 * face);
    vec3 winter = mix(cold, vec3(0.8, 0.9, 1.0), snow);
#else
    vec2 gq = vSeasonObj.xz * 2.0;
    float cell = seasonHash(vec3(floor(gq), 3.0 + step(1.0, fract(gq.x) + fract(gq.y))));
    vec3 spring = mix(c, c * vec3(1.06, 1.1, 0.92), green);
    vec3 autumn = mix(c, mix(c, vec3(0.62, 0.52, 0.16) * clamp(lum * 1.9, 0.6, 1.2), 0.62 + 0.14 * cell), green);
    float patchy = step(0.07, cell);
    vec3 winter = mix(c, mix(vec3(lum) * vec3(0.6, 0.8, 0.74), vec3(0.8, 0.9, 1.0) - face * 0.03, patchy), green);
#endif
    col = c * uSeason.y + spring * uSeason.x + autumn * uSeason.z + winter * uSeason.w;
    diffuseColor.rgb = col;
}
#include <emissivemap_fragment>
`;

function patch (m: Material, foliage: boolean) {
    m.onBeforeCompile = (sh) => {
        sh.uniforms.uSeason = seasonU.uSeason;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${GLSL_COMMON}`).replace('#include <begin_vertex>', VERT);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${GLSL_COMMON}`).replace('#include <emissivemap_fragment>', (foliage ? '#define FOLIAGE\n' : '') + FRAG);
    };
    m.customProgramCacheKey = () => (foliage ? 'season-foliage' : 'season-ground');
}

/** Make the island's ground material follow the seasons (it is shared by every chunk, so once is enough). */
export function seasonGround (m: Material) {
    if (m.userData.season) return;
    m.userData.season = true;
    patch(m, false);
}

/** One seasonal copy per material the nodes use (they share theirs, so the copies are shared too). */
const copies = new Map<Material, Material>();
function copyOf (m: Material) {
    let c = copies.get(m);
    if (!c) {
        c = m.clone();
        patch(c, true);
        copies.set(m, c);
    }
    return c;
}

/** Dress a node's model (a tree, a bush, a rock...) in the seasons: its meshes take the seasonal copies of their materials. */
export function dressForSeasons (obj: Object3D) {
    obj.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        const mat = mesh.material;
        if (Array.isArray(mat)) mesh.material = mat.map((x) => (x.transparent ? x : copyOf(x)));
        else if (!mat.transparent && !(mat as MeshBasicMaterial).isMeshBasicMaterial) mesh.material = copyOf(mat);
    });
}

/** The season weights glide to the season of `day` (a new season fades in over a few seconds instead of popping). */
export function stepSeason (season: SeasonId, dt: number, snap = false) {
    const v = seasonU.uSeason.value, k = snap ? 1 : Math.min(1, dt * 0.6);
    const i = SEASON_ORDER.indexOf(season);
    const want = [0, 0, 0, 0];
    want[i] = 1;
    v.x += (want[0] - v.x) * k; v.y += (want[1] - v.y) * k; v.z += (want[2] - v.z) * k; v.w += (want[3] - v.w) * k;
    const sum = v.x + v.y + v.z + v.w;
    v.multiplyScalar(1 / Math.max(0.0001, sum));
}

// ── things drifting through the air ────────────────────────────────────────

const LEAF = [0xe85d62, 0xf8a24a, 0xffd966, 0xa8703f], PETAL = [0xf79fc6, 0xfff6e0, 0xf79fc6, 0xffd966], SNOW = [0xffffff, 0xf3f8ff, 0xcdf4ee, 0xffffff];
interface Speck { x: number; y: number; z: number; v: number; ph: number; k: number; spin: number }

/**
 * Falling leaves (autumn), petals (spring) and snow (winter, heavy while it would rain) round the camera: one instanced mesh of
 * little cards, tumbling as they fall. The counts follow the 2D layer's (30 leaves, 26 petals, 56 flakes on a screen), scaled up
 * for the bigger box of air a 3D view looks through.
 */
export class SeasonSpecks {
    private readonly n = 220;
    private readonly mesh: InstancedMesh;
    private readonly specks: Speck[] = [];
    private readonly m = new Matrix4();
    private readonly q = new Quaternion();
    private readonly p = new Vector3();
    private readonly s = new Vector3();
    private readonly c = new Color();
    private readonly ax = new Vector3();
    private season: SeasonId | '' = '';
    private t = 0;

    constructor (scene: Scene) {
        const mat = new MeshBasicMaterial({ side: DoubleSide, transparent: true, opacity: 0.92, depthWrite: false, fog: false });
        this.mesh = new InstancedMesh(new PlaneGeometry(0.15, 0.095), mat, this.n);
        this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = 26;
        this.mesh.count = 0;
        for (let i = 0; i < this.n; i++) {
            this.specks.push({ x: Math.random() * 44, y: Math.random() * 9, z: Math.random() * 34, v: 0.6 + Math.random() * 0.8, ph: Math.random() * 6.28, k: Math.floor(Math.random() * 4), spin: 1 + Math.random() * 3 });
            this.mesh.setColorAt(i, this.c.set(0xffffff));
        }
        scene.add(this.mesh);
    }

    /** `amount` 0..1 (0 underground), `snowfall` 0..1: the winter's "rain", which makes the snow heavy. */
    update (dt: number, cx: number, cz: number, season: SeasonId, amount: number, snowfall: number) {
        this.t += dt;
        let n = 0;
        if (season === 'autumn') n = 70;
        else if (season === 'spring') n = 60;
        else if (season === 'winter') n = Math.round(110 + snowfall * 110);
        n = Math.round(n * amount);
        this.mesh.count = n;
        this.mesh.visible = n > 0;
        if (!n) return;
        if (season !== this.season) {
            this.season = season;
            const pal = season === 'autumn' ? LEAF : season === 'spring' ? PETAL : SNOW;
            for (let i = 0; i < this.n; i++) this.mesh.setColorAt(i, this.c.set(pal[this.specks[i].k]));
            if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
        }
        const winter = season === 'winter', fall = winter ? 1.1 + snowfall * 1.2 : season === 'autumn' ? 1.3 : 0.8;
        const drift = winter ? 0.25 + snowfall * 0.6 : 0.7;
        for (let i = 0; i < n; i++) {
            const s = this.specks[i];
            s.y -= fall * s.v * dt;
            s.x += (Math.sin(this.t * (winter ? 1.1 : 1.8) + s.ph) * 0.8 + drift) * dt;
            s.z += Math.cos(this.t * 0.9 + s.ph * 2) * 0.3 * dt;
            if (s.y < 0) { s.y += 9; s.x = Math.random() * 44; s.z = Math.random() * 34; }
            const x = cx - 22 + ((s.x % 44) + 44) % 44, z = cz - 20 + ((s.z % 34) + 34) % 34;
            this.p.set(x, s.y, z);
            const size = winter ? 1 + s.k * 0.15 : 1.25 + (s.k & 1) * 0.35;
            this.s.set(size, winter ? size * 1.6 : size, size);
            this.ax.set(Math.sin(s.ph), 1, Math.cos(s.ph)).normalize();
            this.q.setFromAxisAngle(this.ax, this.t * s.spin + s.ph);
            this.m.compose(this.p, this.q, this.s);
            this.mesh.setMatrixAt(i, this.m);
        }
        this.mesh.instanceMatrix.needsUpdate = true;
    }
}
