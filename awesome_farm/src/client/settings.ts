// Player settings (persisted per browser). Read anywhere; toggle from Title/Pause.

import type { KeyboardSetting } from './input/layout';

export const SETTINGS_KEY = 'awesome_farm_settings_v1';

/** How the world is drawn: the classic 2D view (the default) or the low-poly 3D view (beta, src/client3d, loaded only when chosen). */
export type ViewMode = '2d' | '3d';

/** How much the 3D view spends on shadows, glow, sharpness and night lights (src/client3d/quality.ts). Auto picks by device. */
export type Quality3D = 'auto' | 'low' | 'medium' | 'high';
export const QUALITY_CHOICES: readonly Quality3D[] = ['auto', 'low', 'medium', 'high'];

const DEFAULTS = { sound: true, shake: true, volume: 0.8, music: 0.5, fps: false, keyboard: 'auto' as KeyboardSetting, fullscreen: true, zoom: 3, view: '2d' as ViewMode, quality3d: 'auto' as Quality3D };

/** The settings as stored (a JSON string, or nothing yet) over the defaults; a view that is not '3d' is the classic one, an unknown 3D quality is Auto. */
export function parseSettings (raw: string | null) {
    const s = { ...DEFAULTS };
    try { Object.assign(s, JSON.parse(raw ?? '{}')); } catch { /* bad JSON → defaults */ }
    if (s.view !== '3d') s.view = '2d';
    if (!QUALITY_CHOICES.includes(s.quality3d)) s.quality3d = 'auto';
    return s;
}

let stored: string | null = null;
try { stored = localStorage.getItem(SETTINGS_KEY); } catch { /* private mode → defaults */ }

export const settings = parseSettings(stored);

export function saveSettings () {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}
