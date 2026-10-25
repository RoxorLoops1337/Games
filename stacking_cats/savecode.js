// Save backup: turn the save into a text code and back. Used by Settings (copy, download, paste to restore).
import { CAT_BY_ID, STARTERS, BUILDINGS, WONDERS, ACHIEVEMENTS, DIFF_ORDER, LADDER_TIERS, WEEK_RE, masteryLevel, diffAllowed } from './cats.js';
import { cleanWardrobe } from './cosmetics.js';

const PREFIX = 'SC1:';
const bytesToB64 = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export function encodeSave(save) {
  return PREFIX + bytesToB64(new TextEncoder().encode(JSON.stringify(save)));
}

const num = (v, max = 1e9) => (Number.isFinite(+v) ? Math.max(0, Math.min(max, Math.floor(+v))) : 0);

// returns { ok: true, save } with a cleaned copy, or { ok: false, error }
export function decodeSave(text) {
  try {
    const t = String(text || '').trim();
    if (!t.startsWith(PREFIX)) return { ok: false, error: 'This is not a Stacking Cats save code.' };
    const raw = JSON.parse(new TextDecoder().decode(b64ToBytes(t.slice(PREFIX.length))));
    if (!raw || typeof raw !== 'object' || !raw.stats || !Array.isArray(raw.unlocked)) return { ok: false, error: 'The save code is damaged.' };
    const s = {
      v: 1, sound: raw.sound !== false, music: raw.music !== false, meter: raw.meter !== false,
      diff: DIFF_ORDER.includes(raw.diff) ? raw.diff : 'normal',
      name: String(raw.name || '').replace(/[^\w \-.']/g, '').trim().slice(0, 12),
      tips: raw.tips && typeof raw.tips === 'object' ? { ...raw.tips } : {},
      opt: raw.opt && typeof raw.opt === 'object' ? { ...raw.opt } : {},
      unlocked: [...new Set([...STARTERS, ...raw.unlocked.filter((id) => CAT_BY_ID[id])])],
      stats: {}, kingdom: { coins: 0, earned: 0, gems: 0, lv: {}, wonders: {} }, ach: {}, catStats: {}, daily: {},
    };
    for (const k of ['runs', 'kills', 'bossKills', 'recruits', 'merges', 'lvl3', 'snacks', 'temp', 'flawless', 'bestWave']) s.stats[k] = num(raw.stats[k]);
    s.stats.lvl3Of = {};
    for (const id in raw.stats.lvl3Of || {}) if (CAT_BY_ID[id]) s.stats.lvl3Of[id] = true;
    const k = raw.kingdom || {};
    s.kingdom.coins = num(k.coins); s.kingdom.earned = num(k.earned); s.kingdom.gems = num(k.gems, 9999);
    for (const b of BUILDINGS) s.kingdom.lv[b.id] = Math.min(b.max, num(k.lv && k.lv[b.id], 99));
    for (const w of WONDERS) if (k.wonders && k.wonders[w.id]) s.kingdom.wonders[w.id] = true;
    for (const a of ACHIEVEMENTS) if (raw.ach && raw.ach[a.id]) s.ach[a.id] = num(raw.ach[a.id], 4e12) || 1;
    for (const id in raw.catStats || {}) {
      if (!CAT_BY_ID[id]) continue;
      const c = raw.catStats[id] || {};
      s.catStats[id] = { runs: num(c.runs), dmg: num(c.dmg, 1e12), kills: num(c.kills), best: num(c.best, 999) };
      if (c.waves != null) s.catStats[id].waves = num(c.waves, 1e6);   // cat mastery
    }
    for (const day in raw.daily || {}) if (/^\d{4}-\d{2}-\d{2}$/.test(day)) { const d = raw.daily[day] || {}; s.daily[day] = { best: num(d.best, 1e7), wave: num(d.wave, 999) }; }
    // meta 2: weekly scores, challenge ladder, wardrobe
    s.weekly = {};
    for (const wk in raw.weekly || {}) if (WEEK_RE.test(wk)) { const d = raw.weekly[wk] || {}; s.weekly[wk] = { best: num(d.best, 1e7), wave: num(d.wave, 999) }; }
    s.ladder = Math.min(LADDER_TIERS, num(raw.ladder, 99));
    const wd = cleanWardrobe(raw.owned, raw.wardrobe, (id) => masteryLevel(s.catStats[id]));
    s.owned = wd.owned; s.wardrobe = wd.wardrobe;
    if (!diffAllowed(s, s.diff)) s.diff = 'hard';
    return { ok: true, save: s };
  } catch (e) {
    return { ok: false, error: 'The save code could not be read.' };
  }
}
