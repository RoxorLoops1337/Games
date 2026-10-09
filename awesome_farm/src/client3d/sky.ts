// Sky and light through the day: sun, moon, hemisphere and fill light, fog and the grade tint.
import { Color, DirectionalLight, FogExp2, HemisphereLight, Scene, Vector3 } from 'three';

// The night is moonlit slate rather than royal blue (stone and metal read as grey-blue, not painted blue), a little darker, so
// lamps and windows are the warm colour in the dark; the golden hour has a warm sun and lavender shade.
export const KEYS = [
    { h: 0, bg: 0x0d1334, sun: 0, si: 0, hs: 0x485a86, hg: 0x2a2a3e, hi: 0.95, ex: 1.16, tint: 0xe2e8f6, fog: 0x141b42 },
    { h: 4.8, bg: 0x232b66, sun: 0, si: 0, hs: 0x56628e, hg: 0x2c2a40, hi: 0.85, ex: 1.14, tint: 0xe6eaf8, fog: 0x2b3466 },
    { h: 6.2, bg: 0xf0a888, sun: 0xffa05a, si: 1.5, hs: 0xffc9a0, hg: 0x7a6a58, hi: 0.8, ex: 1, tint: 0xfff0e0, fog: 0xf0a888 },
    { h: 8.5, bg: 0x9ad0f0, sun: 0xfff0d6, si: 2.6, hs: 0xcfe6ff, hg: 0x7a6a50, hi: 0.85, ex: 0.95, tint: 0xffffff, fog: 0xd2e8f4 },
    { h: 12.5, bg: 0x8fcdf2, sun: 0xffffff, si: 3, hs: 0xcfe6ff, hg: 0x7a6a50, hi: 0.78, ex: 0.92, tint: 0xffffff, fog: 0xc2e6f4 },
    { h: 16.8, bg: 0xe8cfa6, sun: 0xffdca0, si: 2.8, hs: 0xffeed4, hg: 0x7a6a50, hi: 0.9, ex: 1, tint: 0xfff6ea, fog: 0xf6dcb6 },
    { h: 18.7, bg: 0xe8a98a, sun: 0xffb070, si: 2.2, hs: 0xd4bcd8, hg: 0x5a4a62, hi: 0.9, ex: 1.05, tint: 0xfff0e2, fog: 0xe8a98a },
    { h: 20.2, bg: 0x4a3d72, sun: 0, si: 0, hs: 0x5c5a8e, hg: 0x2a2038, hi: 0.7, ex: 1.1, tint: 0xece4f8, fog: 0x4a3d72 },
    { h: 22.5, bg: 0x0d1334, sun: 0, si: 0, hs: 0x485a86, hg: 0x2a2a3e, hi: 0.95, ex: 1.16, tint: 0xe2e8f6, fog: 0x141b42 },
    { h: 24, bg: 0x0d1334, sun: 0, si: 0, hs: 0x485a86, hg: 0x2a2a3e, hi: 0.95, ex: 1.16, tint: 0xe2e8f6, fog: 0x141b42 }
];
/** The moon's colour (a cool silver; the Blood Moon reddens it in mood.ts). */
export const MOON = 0xa8b6dc;
/** The overcast sky light (rain). */
const OVERCAST = 0xb6c0cc;
export const smooth = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export class Sky {
    scene: Scene;
    sun = new DirectionalLight(0xffffff, 3);
    moon = new DirectionalLight(MOON, 0);
    hemi = new HemisphereLight(0xcfe6ff, 0x7a6a50, 1);
    /** A weak light from the camera's side: the sun is in the north-west, so the faces the camera sees (south) would otherwise get only the sky. */
    fill = new DirectionalLight(0xfff0dc, 0.6);
    /** 0 by day, 1 in the dead of night: lamps, windows and fires read this. */
    night = 0;
    /** The tint the grade pass multiplies the picture by. */
    tint = new Color(1, 1, 1);
    saturation = 1.2;
    exposure = 1;
    a = new Color();
    b = new Color();
    private readonly over = new Color();
    constructor(scene: Scene, shadowSize: number) {
        this.scene = scene;
        const s = this.sun;
        s.castShadow = true;
        s.shadow.mapSize.set(shadowSize, shadowSize);
        Object.assign(s.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 220 });
        s.shadow.bias = -0.0004;
        s.shadow.normalBias = 0.05;
        this.fill.position.set(0.5, 0.45, 1).multiplyScalar(60);
        this.fill.castShadow = false;
        scene.add(s, s.target, this.moon, this.hemi, this.fill);
        scene.background = new Color(0x8fcdf2);
        scene.fog = new FogExp2(0x8fcdf2, 0);
    }
    /** `hour` 0..24, `rain` 0..1, `target` where the light follows (the camera's focus). */
    apply(hour: number, rain: number, target: Vector3) {
        let i = 0;
        while (i < KEYS.length - 2 && hour >= KEYS[i + 1].h) i++;
        const A = KEYS[i], B = KEYS[i + 1], t = smooth(0, 1, (hour - A.h) / (B.h - A.h));
        const col = (k: 'bg' | 'sun' | 'hs' | 'hg' | 'tint' | 'fog') => this.a.set(A[k]).lerp(this.b.set(B[k]), t).clone();
        const grey = new Color(0x8c97a6);
        this.night = 1 - smooth(4.6, 6.8, hour) * (1 - smooth(18.8, 21.2, hour));
        const sun = col('sun'), bg = col('bg').lerp(grey, rain * 0.7);
        (this.scene.background as Color).copy(bg);
        (this.scene.fog as FogExp2).color.copy(col('fog').lerp(grey, rain * 0.8));
        this.sun.color.copy(sun);
        this.sun.intensity = lerp(A.si, B.si, t) * lerp(1, 0.25, rain);
        // rain is an overcast sky: the sun all but goes, the sky light turns a soft even grey and a little stronger (no hard
        // shadows, everything lit from above), the picture cools and loses some colour and brightness
        const over = this.over.setHex(OVERCAST);
        this.hemi.color.copy(col('hs')).lerp(over, rain * 0.55 * (1 - this.night));
        this.hemi.groundColor.copy(col('hg')).lerp(this.a.setHex(0x4a4c58), rain * 0.45 * (1 - this.night));
        this.hemi.intensity = lerp(A.hi, B.hi, t) * (1 + rain * 0.22 * (1 - this.night));
        this.exposure = lerp(A.ex, B.ex, t) * (1 - rain * 0.12);
        this.fill.color.copy(col('tint'));
        this.fill.intensity = 0.55 * (1 - this.night * 0.85) * lerp(1, 0.7, rain);
        this.tint.copy(col('tint')).lerp(this.a.setHex(0xdce4ee), rain * 0.6);
        // night and rain drain colour (the moonlight is not a colour of its own); the day keeps the prototype's lift
        this.saturation = lerp(1.14, 0.84, rain) * lerp(1, 0.9, this.night);
        const ang = (hour - 6) / 12 * Math.PI, high = Math.max(0.2, Math.sin(ang));
        const dir = new Vector3(-0.62 * (0.7 + 0.3 * Math.cos(ang)), high * 1.05, -0.5).normalize();
        this.sun.position.copy(dir).multiplyScalar(110).add(target);
        this.sun.target.position.copy(target);
        this.moon.position.set(0.45, 1, 0.3).multiplyScalar(100).add(target);
        this.moon.target.position.copy(target);
        this.moon.intensity = this.night * 1.7 * (1 - rain * 0.5);
    }
}
