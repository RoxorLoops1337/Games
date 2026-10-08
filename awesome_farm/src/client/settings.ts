// Player settings (persisted per browser). Read anywhere; toggle from Title/Pause.

import type { KeyboardSetting } from './input/layout';

const KEY = 'awesome_farm_settings_v1';

export const settings = { sound: true, shake: true, volume: 0.8, music: 0.5, fps: false, keyboard: 'auto' as KeyboardSetting, fullscreen: true, zoom: 3 };

try {
    Object.assign(settings, JSON.parse(localStorage.getItem(KEY) ?? '{}'));
} catch { /* private mode / bad JSON → defaults */ }

export function saveSettings () {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}
