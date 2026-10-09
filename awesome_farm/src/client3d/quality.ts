// The 3D view's quality levels (the "3D quality" setting): what each level spends on shadows, glow, sharpness and night lights, and
// which level "Auto" picks for a device. Pure (no three.js, no DOM), so tests run it headless; render.ts and view3d.ts apply it.
import type { Quality3D } from '../client/settings';

export type QualityLevel = 'low' | 'medium' | 'high';

/** What one level spends. */
export interface QualitySpec {
    level: QualityLevel;
    /** The most device pixels per CSS pixel (computers; phones get `dprPhone`). */
    dpr: number;
    dprPhone: number;
    /** The sun's shadow map size in texels (0: no shadows). */
    shadow: number;
    /** Soft (PCF soft) or plain (PCF) shadow edges. */
    softShadow: boolean;
    /** The glow (bloom) round lamps, fires and gems. */
    bloom: boolean;
    /** Multisampled edges on the scene's render target (0: none). */
    msaa: number;
    /** How many lamps and fires light the night at once. */
    lamps: number;
    /** Cloud shadows by day and fireflies at night. */
    ambient: boolean;
}

export const QUALITY: Record<QualityLevel, QualitySpec> = {
    low: { level: 'low', dpr: 1, dprPhone: 1, shadow: 0, softShadow: false, bloom: false, msaa: 0, lamps: 2, ambient: false },
    medium: { level: 'medium', dpr: 1.5, dprPhone: 1.25, shadow: 1024, softShadow: false, bloom: true, msaa: 2, lamps: 4, ambient: true },
    high: { level: 'high', dpr: 2, dprPhone: 1.5, shadow: 2048, softShadow: true, bloom: true, msaa: 4, lamps: 8, ambient: true },
};

export const LEVELS: readonly QualityLevel[] = ['low', 'medium', 'high'];

/** What "Auto" looks at. */
export interface DeviceInfo {
    /** A touch screen as the main pointer (a phone or tablet). */
    phone: boolean;
    /** navigator.hardwareConcurrency (0 when unknown). */
    cores: number;
    /** navigator.deviceMemory in GB (0 when unknown; only Chromium reports it). */
    memory: number;
}

/** The level a setting means on a device: "Auto" is High on a computer, Medium on a phone, and Low on a small phone. */
export function resolveQuality (q: Quality3D | undefined, d: DeviceInfo): QualityLevel {
    if (q === 'low' || q === 'medium' || q === 'high') return q;
    if (!d.phone) return 'high';
    const small = (d.cores > 0 && d.cores <= 4) || (d.memory > 0 && d.memory <= 3);
    return small ? 'low' : 'medium';
}

/** This browser's device facts (safe outside a browser: a computer with unknown cores). */
export function deviceInfo (): DeviceInfo {
    const nav = typeof navigator === 'undefined' ? null : navigator as Navigator & { deviceMemory?: number };
    const phone = typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches;
    return { phone, cores: nav?.hardwareConcurrency ?? 0, memory: nav?.deviceMemory ?? 0 };
}

/** The pixel ratio for a level on this screen. */
export function pixelRatio (spec: QualitySpec, devicePixelRatio: number, phone: boolean) {
    return Math.max(0.5, Math.min(devicePixelRatio || 1, phone ? spec.dprPhone : spec.dpr));
}

/**
 * "Auto" also watches the frame rate: when frames stay slow (under ~24 per second for 4 seconds of play) it steps down one level, and
 * never back up within a session. Long gaps (a hidden tab, a hitch, a debugger, frames stepped by hand) are not counted.
 */
export class AutoStep {
    private slow = 0;
    private seen = 0;

    /** Feed one frame's real duration (ms); true when it is time to step down. */
    frame (ms: number): boolean {
        if (!(ms > 0) || ms > 250) return false;
        this.seen += ms;
        if (ms > 42) this.slow += ms;
        if (this.seen < 4000) return false;
        const step = this.slow > this.seen * 0.6;
        this.seen = 0;
        this.slow = 0;
        return step;
    }
}

/** One level down (Low stays Low). */
export const stepDown = (l: QualityLevel): QualityLevel => (l === 'high' ? 'medium' : 'low');
