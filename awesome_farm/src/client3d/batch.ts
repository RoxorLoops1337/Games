// Instancing for the entity layer: a big farm is hundreds of the same few models (beds and their crops, fences, belts, paths,
// trees, rocks), and each one used to cost a draw call in the picture and another in the sun's shadow. Every frame, `Batcher.run`
// walks what is visible, groups the meshes that share a baked geometry and a material (models/kit.ts `bake` caches both, so every
// wheat row, fence piece or pine is the same pair), and draws each group as ONE InstancedMesh with the members' world matrices.
//
// The models stay exactly as they are (their own animation hooks still move them, picking still reads their boxes): a batched mesh
// only leaves the cameras' layer for the frame, so neither the picture nor the shadow pass draws it twice. Anything that does not
// fit the pattern (a one-off geometry, see-through or fading materials, a custom render order) is drawn the ordinary way.
import { type BufferGeometry, DynamicDrawUsage, Frustum, Group, InstancedMesh, type Material, Matrix4, type Mesh, Object3D, type OrthographicCamera, Sphere } from 'three';

/** Layer masks: what the cameras draw (layer 0), and where a batched mesh waits while its group draws it. */
const SHOW = 1, HIDE = 1 << 30;
/** A group needs this many members in view to be instanced (one alone is just as cheap drawn the ordinary way). */
const MIN = 2;
/** Frames an empty group is kept before its instanced mesh is freed (entities come and go; the common ones come back soon). */
const IDLE = 600;

interface Bucket {
    geo: BufferGeometry;
    mat: Material;
    flags: number;
    items: Mesh[];
    inst: InstancedMesh | null;
    cap: number;
    idle: number;
}

export interface BatchStats { groups: number; instanced: number; plain: number; culled: number }

export class Batcher {
    /** The instanced meshes (add this to the scene, outside the root being batched). */
    readonly group = new Group();
    readonly stats: BatchStats = { groups: 0, instanced: 0, plain: 0, culled: 0 };
    private readonly buckets = new Map<BufferGeometry, Map<Material, Bucket[]>>();
    private readonly all: Bucket[] = [];
    private readonly touched: Bucket[] = [];
    private readonly frustum = new Frustum();
    private readonly proj = new Matrix4();
    private readonly sphere = new Sphere();
    /** Off: every mesh is drawn the ordinary way (for comparing, and a way out if a driver misbehaves). */
    enabled = true;

    constructor () {
        this.group.name = 'batches';
    }

    /**
     * Group what is visible under `root` for this frame. `cam` is the camera the picture uses; members are kept when they are
     * within `margin` tiles of its view (so shadows cast from just off screen still fall into it). World matrices must be current.
     */
    run (root: Object3D, cam: OrthographicCamera, margin: number) {
        const st = this.stats;
        st.groups = st.instanced = st.plain = st.culled = 0;
        if (!this.enabled) {
            root.traverse((o) => { if ((o as Mesh).isMesh) o.layers.mask = SHOW; });
            for (const b of this.all) if (b.inst) b.inst.visible = false;
            return;
        }
        // the camera's box, grown by the margin
        const zx = (cam.right - cam.left) / cam.zoom, zy = (cam.top - cam.bottom) / cam.zoom;
        const sx = (zx + margin * 2) / Math.max(1e-6, zx), sy = (zy + margin * 2) / Math.max(1e-6, zy);
        this.proj.copy(cam.projectionMatrix);
        const e = this.proj.elements;
        e[0] /= sx; e[12] /= sx; e[5] /= sy; e[13] /= sy;
        this.proj.multiply(cam.matrixWorldInverse);
        this.frustum.setFromProjectionMatrix(this.proj);
        const touched = this.touched;
        touched.length = 0;
        root.traverseVisible((o) => {
            const m = o as Mesh;
            if (!m.isMesh) return;
            if (!batchable(m)) { m.layers.mask = SHOW; st.plain++; return; }
            const g = m.geometry;
            if (!g.boundingSphere) g.computeBoundingSphere();
            this.sphere.copy(g.boundingSphere!).applyMatrix4(m.matrixWorld);
            if (!this.frustum.intersectsSphere(this.sphere)) { m.layers.mask = SHOW; st.culled++; return; }      // (three culls it itself)
            const b = this.bucket(g, m.material as Material, (m.castShadow ? 1 : 0) | (m.receiveShadow ? 2 : 0));
            if (!b.items.length) touched.push(b);
            b.items.push(m);
        });
        for (const b of touched) {
            const n = b.items.length;
            if (n < MIN) {
                for (const m of b.items) m.layers.mask = SHOW;
                st.plain += n;
                b.items.length = 0;
                continue;
            }
            const inst = this.ensure(b, n);
            const arr = inst.instanceMatrix.array as Float32Array;
            for (let i = 0; i < n; i++) {
                const m = b.items[i];
                m.matrixWorld.toArray(arr, i * 16);
                m.layers.mask = HIDE;
            }
            inst.count = n;
            inst.visible = true;
            inst.instanceMatrix.clearUpdateRanges();
            inst.instanceMatrix.addUpdateRange(0, n * 16);
            inst.instanceMatrix.needsUpdate = true;
            b.idle = 0;
            b.items.length = 0;
            st.groups++;
            st.instanced += n;
        }
        // groups with nobody in view this frame: hide them, and free the ones idle for a while
        for (let i = this.all.length - 1; i >= 0; i--) {
            const b = this.all[i];
            if (b.idle === 0) { b.idle = 1; continue; }        // (drawn this frame; counts from the next)
            if (b.inst) b.inst.visible = false;
            if (++b.idle > IDLE) this.drop(i);
        }
    }

    private bucket (geo: BufferGeometry, mat: Material, flags: number): Bucket {
        let byMat = this.buckets.get(geo);
        if (!byMat) { byMat = new Map(); this.buckets.set(geo, byMat); }
        let list = byMat.get(mat);
        if (!list) { list = []; byMat.set(mat, list); }
        let b = list[flags];
        if (!b) {
            b = { geo, mat, flags, items: [], inst: null, cap: 0, idle: 2 };
            list[flags] = b;
            this.all.push(b);
        }
        return b;
    }

    /** The bucket's instanced mesh, with room for n (grown in powers of two). */
    private ensure (b: Bucket, n: number): InstancedMesh {
        if (b.inst && b.cap >= n) return b.inst;
        if (b.inst) { this.group.remove(b.inst); b.inst.dispose(); }
        let cap = 8;
        while (cap < n) cap *= 2;
        const inst = new InstancedMesh(b.geo, b.mat, cap);
        inst.instanceMatrix.setUsage(DynamicDrawUsage);
        inst.frustumCulled = false;             // (its members were culled one by one above)
        inst.castShadow = (b.flags & 1) !== 0;
        inst.receiveShadow = (b.flags & 2) !== 0;
        inst.matrixAutoUpdate = false;
        inst.matrixWorldAutoUpdate = false;
        this.group.add(inst);
        b.inst = inst;
        b.cap = cap;
        return inst;
    }

    private drop (i: number) {
        const b = this.all[i];
        if (b.inst) { this.group.remove(b.inst); b.inst.dispose(); }
        const byMat = this.buckets.get(b.geo);
        const list = byMat?.get(b.mat);
        if (list) {
            delete list[b.flags];
            if (!list.some(Boolean)) byMat!.delete(b.mat);
            if (byMat!.size === 0) this.buckets.delete(b.geo);
        }
        this.all.splice(i, 1);
    }

    /** How many instanced meshes are kept (drawn or idle). */
    get size () { return this.all.length; }

    /** Free every instanced mesh (the shared geometries and materials stay: they belong to the model caches). */
    dispose () {
        for (let i = this.all.length - 1; i >= 0; i--) this.drop(i);
    }
}

const noHook = Object3D.prototype.onBeforeRender;

/** Can this mesh be drawn as one of many: a cached (baked) geometry, one opaque material, the ordinary render order, no hooks. */
function batchable (m: Mesh) {
    const mat = m.material;
    if (Array.isArray(mat) || mat.transparent || !mat.visible) return false;
    const im = m as Mesh & { isInstancedMesh?: boolean; isSkinnedMesh?: boolean };
    if (im.isInstancedMesh || im.isSkinnedMesh || m.morphTargetInfluences) return false;
    return m.geometry.userData.shared === true && m.renderOrder === 0 && m.onBeforeRender === noHook && !m.geometry.groups.length;
}
