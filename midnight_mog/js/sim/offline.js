// Midnight Mog offline earnings. Wraps the economy's offline model and adds the Nap Dome: its offlineCapHours extend the
// cap (total clamped to 40h) and its offlineEffAdd raise the efficiency (total clamped to 0.8). Pure: the clock is passed in.
//
// Away time = nowMs - profile.lastSeen. A clock that went backwards, or any non finite value, is 0 seconds away and
// lastSeen never moves backwards, so changing the device clock can neither create nor destroy offline income.

import { OFFLINE, offlineCapSeconds, offlineEfficiency, income, money, MAX_CUR } from './economy.js';
import { townStats } from './town.js';

export const OFFLINE_CAP_MAX_HOURS = 40;   // total cap after the Nap Dome (docs/SYSTEMS.md 10.6)
export const OFFLINE_EFF_MAX = 0.8;        // total efficiency after the Nap Dome

/** Seconds the player was away. 0 for a backwards or invalid clock. */
export function awaySeconds(profile, nowMs) {
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) return 0;
  const last = Number.isFinite(profile && profile.lastSeen) ? profile.lastSeen : nowMs;
  return Math.max(0, (nowMs - last) / 1000);
}

/** {capSeconds, efficiency, capHoursAdd, effAdd}: the economy values plus the Nap Dome, with the 40h and 0.8 clamps. */
export function offlineLimits(profile) {
  const st = townStats(profile);
  const capHoursAdd = Math.max(0, st.offlineCapHours || 0);
  const effAdd = Math.max(0, st.offlineEffAdd || 0);
  const capSeconds = Math.min(OFFLINE_CAP_MAX_HOURS * 3600, offlineCapSeconds(profile) + capHoursAdd * 3600);
  const efficiency = Math.min(OFFLINE_EFF_MAX, offlineEfficiency(profile) + effAdd);
  return { capSeconds, efficiency, capHoursAdd, effAdd };
}

/**
 * Offline gain for a return at nowMs: {fish, yarn, capped, seconds, effSeconds, efficiency, capSeconds}.
 * seconds is the credited time, never above the cap. Same model as economy.offlineGainFor (first fullEffHours at full
 * weight, later hours at tailMult, times efficiency, times active income); fish and yarn only, never gems.
 * With no Nap Dome the numbers equal economy.offlineGainFor.
 */
export function offlineGain(profile, nowMs) {
  const away = awaySeconds(profile, nowMs);
  const lim = offlineLimits(profile);
  const secs = Math.min(away, lim.capSeconds);
  const full = OFFLINE.fullEffHours * 3600;
  const weighted = Math.min(secs, full) + Math.max(0, secs - full) * OFFLINE.tailMult;
  const effSeconds = weighted * lim.efficiency;
  const inc = income(profile);
  return {
    fish: money(inc.active.fish * effSeconds),
    yarn: money(inc.active.yarn * effSeconds),
    capped: away > lim.capSeconds,
    seconds: secs,
    effSeconds,
    efficiency: lim.efficiency,
    capSeconds: lim.capSeconds,
  };
}

/**
 * Pay the offline gain and move lastSeen forward (monotonic). Returns {profile, gain}. Call once per launch or resume,
 * before town.collect. A second call at the same time pays nothing because lastSeen has moved.
 */
export function applyOffline(profile, nowMs) {
  const gain = offlineGain(profile, nowMs);
  const cur = { fish: 0, yarn: 0, gems: 0, tokens: 0, ...(profile.cur || {}) };
  cur.fish = Math.min(MAX_CUR, money(cur.fish + gain.fish));
  cur.yarn = Math.min(MAX_CUR, money(cur.yarn + gain.yarn));
  const stats = { ...(profile.stats || {}) };
  if (gain.fish > 0) stats.fishEarned = Math.min(1e18, (Number(stats.fishEarned) || 0) + gain.fish);
  return { profile: { ...profile, cur, stats, lastSeen: seen(profile, nowMs) }, gain };
}

/** lastSeen after a visit at nowMs: never decreases, ignores invalid clocks. */
export function seen(profile, nowMs) {
  const prev = Number.isFinite(profile && profile.lastSeen) ? Math.max(0, profile.lastSeen) : 0;
  return typeof nowMs === 'number' && Number.isFinite(nowMs) ? Math.max(prev, nowMs) : prev;
}

/** Record that the player is here now without paying anything (periodic save while playing). Returns a new profile. */
export function touch(profile, nowMs) { return { ...profile, lastSeen: seen(profile, nowMs) }; }
