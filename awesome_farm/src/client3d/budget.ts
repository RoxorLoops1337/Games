// What the 3D view spends and gives back: the sun's shadow fitted to what the camera sees, the ground and entity ranges that follow
// the zoom, and a ledger of every geometry and material the renderer drew, so leaving 3D (or the world) frees all of it.
//
// Why the ledger: three.js hangs a `dispose` listener on every geometry, material and texture it uploads, and that listener keeps
// the whole renderer alive. The model library caches its geometries and materials for the session (models/kit.ts), so without
// telling each of them `dispose()` every 3D -> 2D -> 3D switch would leave one more dead renderer behind.
import { type BufferGeometry, type DirectionalLight, type Material, type Mesh, type Object3D, type Texture, Vector3, type WebGLRenderer } from 'three';
import { EL } from './render';

/** How much of the ground the camera sees round its target (tiles): half the width, and half the depth along the ground. */
export interface ViewExtent { halfW: number; halfD: number }

export function viewExtent (cam: { left: number; right: number; top: number; bottom: number; zoom: number }): ViewExtent {
    const halfW = (cam.right - cam.left) / 2 / cam.zoom, halfH = (cam.top - cam.bottom) / 2 / cam.zoom;
    return { halfW, halfD: halfH / Math.sin(EL) };
}

/** How far round the camera's target (tiles) the ground is built and things are animated: what is seen plus a margin. */
export function reach (v: ViewExtent, margin: number) {
    return { rx: v.halfW + margin, rz: v.halfD + margin, r: Math.max(v.halfW, v.halfD) + margin };
}

const _right = new Vector3(), _up = new Vector3(), _fwd = new Vector3(), _off = new Vector3();
const UP = new Vector3(0, 1, 0);

/**
 * Fit the sun's shadow box to what the camera sees (plus room for shadows cast from just outside), in steps so it does not
 * breathe while the zoom glides, and slide it in whole shadow texels so the edges do not shimmer while the camera walks.
 * Call after the sky has placed the sun for this frame. Returns the half size in tiles.
 */
export function fitShadow (sun: DirectionalLight, v: ViewExtent, size: number) {
    const half = Math.ceil((Math.hypot(v.halfW, v.halfD) + 4) / 4) * 4;
    const sc = sun.shadow.camera;
    if (sc.right !== half) {
        sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
        sc.updateProjectionMatrix();
    }
    if (size <= 0) return half;
    const texel = (half * 2) / size;
    _fwd.subVectors(sun.target.position, sun.position).normalize();
    _right.crossVectors(_fwd, UP).normalize();
    _up.crossVectors(_right, _fwd);
    const t = sun.target.position;
    const a = t.dot(_right), b = t.dot(_up);
    _off.copy(_right).multiplyScalar(Math.round(a / texel) * texel - a).addScaledVector(_up, Math.round(b / texel) * texel - b);
    sun.position.add(_off);
    t.add(_off);
    return half;
}

/** Every geometry and material the renderer has drawn (the picture and the shadow pass), so they can all be given back. */
export class Ledger {
    readonly geos = new Set<BufferGeometry>();
    readonly mats = new Set<Material>();

    constructor (renderer: WebGLRenderer) {
        const draw = renderer.renderBufferDirect;
        const geos = this.geos, mats = this.mats;
        renderer.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
            geos.add(geometry);
            mats.add(material);
            draw.call(this, camera, scene, geometry, material, object, group);
        };
    }

    /**
     * A model left the world: free the geometry only it used (a one-off shape; the model caches' geometries stay, they are drawn
     * again soon) and the materials it cloned for itself.
     */
    dropModel (obj: Object3D, ownMats?: readonly Material[]) {
        obj.traverse((o) => {
            const g = (o as Mesh).geometry as BufferGeometry | undefined;
            if (!(o as Mesh).isMesh || !g || g.userData.cached) return;
            g.dispose();
            this.geos.delete(g);
        });
        for (const m of ownMats ?? []) { m.dispose(); this.mats.delete(m); }
    }

    /** Give everything back to the renderer (call before disposing the renderer; the objects themselves stay usable). */
    release () {
        for (const m of this.mats) {
            for (const t of texturesOf(m)) t.dispose();
            m.dispose();
        }
        for (const g of this.geos) g.dispose();
        this.mats.clear();
        this.geos.clear();
    }
}

/** The textures a material holds: its maps, and any texture in its uniforms (shader materials). */
function texturesOf (m: Material): Texture[] {
    const out: Texture[] = [];
    for (const v of Object.values(m)) if ((v as Texture | null)?.isTexture) out.push(v as Texture);
    const u = (m as Material & { uniforms?: Record<string, { value: unknown }> }).uniforms;
    if (u) for (const k in u) { const v = u[k]?.value as Texture | null; if (v?.isTexture) out.push(v); }
    return out;
}
