import React, { useState, useEffect, useRef } from 'react';
import { Home, Music, Trophy, ShoppingBag, TreePine, Beer, Mic, Zap, Star, Coffee, Dumbbell, ArrowLeft, Heart } from 'lucide-react';

// ============ DATA ============

const SOUND_CATALOG = {
  classic_kick: { name: 'Classic Kick', cat: 'Kicks', tier: 1, stamina: 8, base: 12, stat: 'musicality' },
  hi_hat: { name: 'Basic Hi-Hat', cat: 'Hats', tier: 1, stamina: 4, base: 7, stat: 'technicality' },
  psh_snare: { name: 'PSH Snare', cat: 'Snares', tier: 1, stamina: 6, base: 10, stat: 'musicality' },
  inward_k: { name: 'Inward K Snare', cat: 'Snares', tier: 2, stamina: 9, base: 16, stat: 'technicality' },
  throat_kick: { name: '808 Throat Kick', cat: 'Kicks', tier: 2, stamina: 12, base: 20, stat: 'musicality' },
  fast_hats: { name: 'Fast Hi-Hats (TKs)', cat: 'Hats', tier: 2, stamina: 10, base: 15, stat: 'technicality' },
  lip_roll: { name: 'Lip Roll', cat: 'Liproll', tier: 2, stamina: 11, base: 17, stat: 'originality' },
  inward_bass: { name: 'Inward Bass', cat: 'Bass', tier: 3, stamina: 14, base: 22, stat: 'originality' },
  d_low: { name: 'D-Low Scratch', cat: 'Scratch', tier: 3, stamina: 15, base: 25, stat: 'originality' },
  laser: { name: 'Laser Whistle', cat: 'Whistles', tier: 3, stamina: 13, base: 23, stat: 'originality' },
  click_roll: { name: 'Click Roll', cat: 'Clicks', tier: 3, stamina: 16, base: 26, stat: 'technicality' },
  uvular_roll: { name: 'Uvular Kick Roll', cat: 'Kicks', tier: 4, stamina: 22, base: 38, stat: 'technicality' },
};

const FOOD = {
  banana:      { name: 'Banana',         cost: 4,  energy: 12, hunger: 15,  mood: 1, kind: 'food'  },
  smoothie:    { name: 'Green Smoothie', cost: 9,  energy: 25, hunger: 20,  mood: 3, kind: 'drink' },
  oat_bowl:    { name: 'Oat Bowl',       cost: 7,  energy: 18, hunger: 35,  mood: 2, kind: 'food'  },
  espresso:    { name: 'Espresso',       cost: 5,  energy: 25, hunger: -15, mood: 2, kind: 'drink' },
  buddha_bowl: { name: 'Buddha Bowl',    cost: 14, energy: 22, hunger: 50,  mood: 4, kind: 'food'  },
};

const NPCS = [
  { name: 'Pig Pen',     stats: { mus: 7,  tec: 7,  ori: 5,  sho: 6  }, sounds: ['classic_kick', 'hi_hat', 'psh_snare'],                                          reward: 40,   level: 1 },
  { name: 'Joel Burner', stats: { mus: 8,  tec: 8,  ori: 6,  sho: 7  }, sounds: ['classic_kick', 'hi_hat', 'psh_snare'],                                          reward: 50,   level: 1 },
  { name: 'CeDe',        stats: { mus: 12, tec: 11, ori: 9,  sho: 10 }, sounds: ['classic_kick', 'hi_hat', 'psh_snare', 'lip_roll'],                              reward: 100,  level: 3 },
  { name: 'Sikker',      stats: { mus: 15, tec: 15, ori: 14, sho: 12 }, sounds: ['classic_kick', 'inward_k', 'fast_hats', 'lip_roll'],                            reward: 200,  level: 5 },
  { name: 'Alim',        stats: { mus: 19, tec: 18, ori: 17, sho: 15 }, sounds: ['throat_kick', 'inward_bass', 'fast_hats', 'lip_roll'],                          reward: 350,  level: 7 },
  { name: 'Olexinho',    stats: { mus: 24, tec: 22, ori: 22, sho: 19 }, sounds: ['throat_kick', 'click_roll', 'd_low', 'laser', 'inward_bass'],                   reward: 700,  level: 9 },
  { name: 'FatboxG',     stats: { mus: 30, tec: 32, ori: 28, sho: 28 }, sounds: ['uvular_roll', 'click_roll', 'd_low', 'inward_bass', 'laser', 'throat_kick'],    reward: 1500, level: 12 },
];

const JUDGES = [
  { name: 'Tek', bias: 'technicality', emoji: '⚙️' },
  { name: 'Mel', bias: 'musicality', emoji: '🎵' },
  { name: 'Origi', bias: 'originality', emoji: '✨' },
  { name: 'Showtime', bias: 'showmanship', emoji: '🎭' },
  { name: 'Wildcard', bias: 'random', emoji: '🎲' },
];

// ============ INITIAL STATE ============

const initialChar = () => ({
  name: '',
  color: '#D4A017',
  skin: '#d4a87a',
  hairColor: '#1a1a2e',
  hairStyle: 'short',
  level: 1,
  xp: 0,
  cash: 30,
  followers: 0,
  energy: 100,
  maxEnergy: 100, // can grow via running mini-game (+1 per 5 good bars)
  hunger: 70,
  mood: 70,
  stats: { mus: 5, tec: 5, ori: 5, sho: 5 },
  sounds: ['classic_kick', 'hi_hat', 'psh_snare'],
  equipped: ['classic_kick', 'hi_hat', 'psh_snare'],
  defeated: [],
  day: 1,
  minutes: 0, // minutes since 6 AM. 0=6am, 720=6pm, 1080=midnight, 1200=2am (forced sleep)
  voiceRange: null, // null | 'higher' | 'lower' | 'auto' — set on first tuner use
  voiceRangeMidi: null, // calibrated center note for 'auto' mode
  tecLessonsCompleted: 0, // count of lessons completed (lesson N unlocked = (N-1) <= completed)
  tecCurrentLesson: 0, // currently selected lesson index
  tecBpm: 90, // current BPM for the rhythm game
  oriBpm: 100, // BPM for the originality sequencer
  oriPattern: null, // legacy single-slot pattern — migrated to oriSlots[0]
  oriSlots: null, // array of 4 patterns. null until first save. Default seeded on first use.
  oriSlotIdx: 0, // currently active slot (0..3)
  pendingDebuff: null, // {energy?, mood?, hunger?} applied next time you sleep (from bar items)
  showcaseBooking: null, // { day: number, minute: number } — Rohzel's booked Friday slot
  lastShowcaseDay: null, // day a showcase was performed (cooldown: 7 days)
  lastBattleDay: null, // day a battle happened (cooldown: 7 days)
  openMicCount: 0, // total open mics performed (gates Friday show)
  storyFlags: {}, // narrative beats — see narrative spec; all start undefined/false
  created: false,
});

// ============ STORAGE ============
// Multiple save slots — keys: character:slot1 .. character:slot5, plus active_slot pointer.
// Legacy key 'character:main' is auto-migrated into slot 1 on first load.

const NUM_SLOTS = 5;
const slotKey = (n) => `character:slot${n}`;
const ACTIVE_SLOT_KEY = 'active_slot';
const LEGACY_KEY = 'character:main';

async function getActiveSlot() {
  try {
    const r = await window.storage.get(ACTIVE_SLOT_KEY);
    if (r && r.value) {
      const n = parseInt(r.value, 10);
      if (n >= 1 && n <= NUM_SLOTS) return n;
    }
  } catch {}
  return null;
}

async function setActiveSlot(n) {
  try { await window.storage.set(ACTIVE_SLOT_KEY, String(n)); } catch {}
}

async function loadSlot(n) {
  try {
    const r = await window.storage.get(slotKey(n));
    return r ? JSON.parse(r.value) : null;
  } catch { return null; }
}

async function saveSlot(n, c) {
  try { await window.storage.set(slotKey(n), JSON.stringify(c)); } catch {}
}

async function deleteSlot(n) {
  try { await window.storage.delete(slotKey(n)); } catch {}
}

// One-time migration: if legacy key exists and slot 1 is empty, move it over.
async function migrateLegacy() {
  try {
    const slot1 = await loadSlot(1);
    if (slot1) return; // already migrated or slot 1 in use
    const legacy = await window.storage.get(LEGACY_KEY).catch(() => null);
    if (legacy && legacy.value) {
      const parsed = JSON.parse(legacy.value);
      if (parsed && parsed.created) {
        await saveSlot(1, parsed);
        await setActiveSlot(1);
        // Don't delete legacy yet — leave it as a backup for one session.
      }
    }
  } catch {}
}

// Load all slots' summaries (for the slot picker UI). Returns array of length NUM_SLOTS.
async function loadAllSlots() {
  const out = [];
  for (let i = 1; i <= NUM_SLOTS; i++) {
    out.push(await loadSlot(i));
  }
  return out;
}

// ============ TIME SYSTEM ============
// 1 real sec = 10 in-game minutes. 6 real sec = 1 in-game hour.
// Day starts at 6 AM (minutes=0). Night begins at 18:00 (minutes=720). Forced sleep at 02:00 (minutes=1200).

const TICK_MINUTES = 10; // each progress block = 10 in-game minutes
const TICK_REAL_MS = 500; // 0.5 real seconds per tick
const DAY_END = 1200; // 02:00 = forced sleep

// Convert minutes-since-6am to clock string
function clockString(mins) {
  const total = (mins + 360) % 1440; // 6am offset
  const h = Math.floor(total / 60);
  const m = Math.floor(total % 60);
  const hh = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${hh}:${m.toString().padStart(2, '0')} ${ampm}`;
}

// What part of the day is it? Used for palette + lock checks
function timeOfDay(mins) {
  // mins: 0 = 6am, 720 = 6pm, 1080 = midnight
  if (mins < 60) return 'dawn';      // 6-7am
  if (mins < 720) return 'day';       // 7am-6pm
  if (mins < 780) return 'dusk';      // 6-7pm
  return 'night';                     // 7pm-2am
}

const isDayTime = (mins) => mins < 720;       // before 6pm
const isNightTime = (mins) => mins >= 720;    // 6pm onwards

// Day-of-week starts day 1 = Tuesday (so a brand-new player isn't locked out
// on a Monday). Returns 0=Mon, 1=Tue, ..., 6=Sun.
const DAY_NAMES = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const DAY_NAMES_SHORT = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const dayOfWeek = (day) => ((day || 1)) % 7;

// What's happening at the bar tonight, indexed by day-of-week (0..6).
const BAR_SCHEDULE = [
  { activity: 'closed',   title: 'CLOSED',         tagline: 'Bar is dark — the doors stay shut on Mondays.' },
  { activity: 'openmic',  title: 'OPEN MIC NIGHT', tagline: 'Take the mic. Free slot — build heat + maybe fans.' },
  { activity: 'openmic',  title: 'OPEN MIC NIGHT', tagline: 'Take the mic. Free slot — build heat + maybe fans.' },
  { activity: 'openmic',  title: 'OPEN MIC NIGHT', tagline: 'Take the mic. Free slot — build heat + maybe fans.' },
  { activity: 'showcase', title: 'PAID SHOWCASE',  tagline: 'Headline if you\'re good enough — better pay.' },
  { activity: 'battle',   title: 'BATTLE NIGHT',   tagline: 'The cypher fires up. Pick a challenger.' },
  { activity: 'karaoke',  title: 'KARAOKE NIGHT',  tagline: 'Sing along. Sharpen your musicality.' },
];

// Bar menu: snacks (eaten) and drinks (drank). Each gives an immediate boost
// and a delayed debuff applied the next morning when you sleep.
const BAR_MENU = {
  spicy_wings:  { name: 'Spicy Wings',     kind: 'snack', cost: 8,  immediate: { mood: 12, hunger: 18 },          debuff: { hunger: -10 } },
  energy_drink: { name: 'Energy Drink',    kind: 'drink', cost: 6,  immediate: { energy: 45, mood: 4 },           debuff: { energy: -25 } },
  cocktail:     { name: 'Tropical Cocktail', kind: 'drink', cost: 12, immediate: { mood: 30, energy: 12 },        debuff: { mood: -18, energy: -8 } },
  whiskey:      { name: 'Whiskey Shot',    kind: 'drink', cost: 10, immediate: { mood: 22, energy: 8 },           debuff: { mood: -22 } },
  loaded_fries: { name: 'Loaded Fries',    kind: 'snack', cost: 9,  immediate: { hunger: 28, mood: 6, energy: 6 }, debuff: { hunger: -12 } },
};

// Palette per time of day
const TIME_PALETTES = {
  dawn:  { bg: '#1c1815', accent: '#f59e0b', glow: 'rgba(245,158,11,0.06)' },
  day:   { bg: '#1a1a1f', accent: '#fbbf24', glow: 'rgba(251,191,36,0.04)' },
  dusk:  { bg: '#1c1418', accent: '#f97316', glow: 'rgba(249,115,22,0.06)' },
  night: { bg: '#0c0a18', accent: '#818cf8', glow: 'rgba(129,140,248,0.06)' },
};

// Clock + sun/moon component
const Clock = ({ minutes, day }) => {
  const tod = timeOfDay(minutes);
  const isDay = tod === 'day' || tod === 'dawn';
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs">{isDay ? '☀️' : '🌙'}</span>
      <span className="text-stone-300 font-mono text-xs">{clockString(minutes)}</span>
    </div>
  );
};

// ============ ACTIVITY ENGINE ============
// Hook used by activity screens. Manages a real-time loop that ticks every 2 seconds,
// awards rewards in 5-block sets, and stops when energy is exhausted or night cuts in.

// Global pause flag — set while a cutscene is active so activity ticks
// (time, energy/hunger consumption, reward blocks) don't advance underneath it.
let _gamePaused = false;
const setGamePaused = (v) => { _gamePaused = !!v; };

function useActivity({ char, setChar, checkLevelUp, showToast, config }) {
  // config: {
  //   blocksPerReward: 5,         // how many ticks until reward fires
  //   tickEnergyCost: number,     // energy drained per tick
  //   tickHungerCost: number,     // hunger drained per tick
  //   tickMoodDelta: number,      // mood change per tick (+ or -)
  //   onReward: (setChar) => void // fires when 5 blocks complete
  //   stopWhen: (char) => boolean // optional auto-stop condition (e.g. night falls)
  // }
  const [active, setActive] = useState(false);
  const [block, setBlock] = useState(0); // 0-4, current block within reward cycle
  const [rewardsEarned, setRewardsEarned] = useState(0);
  const intervalRef = useRef(null);
  const blockRef = useRef(0);
  const activeRef = useRef(false);

  // Always use latest config and char inside the interval (avoid stale closures)
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);
  const charRef = useRef(char);
  useEffect(() => { charRef.current = char; }, [char]);

  const stop = (reason) => {
    activeRef.current = false;
    setActive(false);
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (reason) showToast(reason, reason.includes('!') ? 'bad' : 'info');
  };

  // The tick body (defined once, reads everything from refs)
  const tickHandlerRef = useRef(() => {});
  tickHandlerRef.current = () => {
    if (_gamePaused) return; // Pause the activity loop while a cutscene plays
    const cfg = configRef.current;
    const c = charRef.current;

    const newMins = c.minutes + TICK_MINUTES;
    const newEnergy = Math.max(0, c.energy - cfg.tickEnergyCost);
    const newHunger = Math.max(0, c.hunger - cfg.tickHungerCost);
    const newMood = Math.max(0, Math.min(100, c.mood + (cfg.tickMoodDelta || 0)));

    let stopReason = null;
    if (newEnergy < cfg.tickEnergyCost) stopReason = 'You collapsed from exhaustion';
    else if (newHunger <= 0 && cfg.tickHungerCost > 0) stopReason = 'Too hungry to keep going';
    else if (newMins >= DAY_END) stopReason = 'It got too late — heading home';
    else if (cfg.stopWhen) {
      const probe = { ...c, minutes: newMins, energy: newEnergy, hunger: newHunger, mood: newMood };
      if (cfg.stopWhen(probe)) stopReason = cfg.stopReason || 'Activity ended';
    }

    const nextChar = { ...c, minutes: newMins, energy: newEnergy, hunger: newHunger, mood: newMood };
    charRef.current = nextChar;
    setChar(prev => ({ ...prev, minutes: newMins, energy: newEnergy, hunger: newHunger, mood: newMood }));

    blockRef.current = blockRef.current + 1;
    if (blockRef.current >= cfg.blocksPerReward) {
      blockRef.current = 0;
      setBlock(0);
      setRewardsEarned(r => r + 1);
      cfg.onReward();
    } else {
      setBlock(blockRef.current);
    }

    if (stopReason) {
      activeRef.current = false;
      setActive(false);
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      showToast(stopReason, 'bad');
    }
  };

  const start = () => {
    if (active) return;
    if (charRef.current.energy < configRef.current.tickEnergyCost) { showToast('Too tired to start!', 'bad'); return; }
    activeRef.current = true;
    setActive(true);
    setBlock(0);
    blockRef.current = 0;
    setRewardsEarned(0);
    intervalRef.current = setInterval(() => tickHandlerRef.current(), configRef.current.tickRealMs || TICK_REAL_MS);
  };

  // Restart interval when tickRealMs changes (e.g. user toggles playMode mid-activity)
  const tickRealMs = config.tickRealMs;
  useEffect(() => {
    if (!activeRef.current || !intervalRef.current) return;
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => tickHandlerRef.current(), tickRealMs || TICK_REAL_MS);
  }, [tickRealMs]);

  // Cleanup on unmount
  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  return { active, block, rewardsEarned, start, stop };
}

// ============ PIXEL ART ACTIVITIES ============
// Helper for crisp pixel rendering on canvas

const _px = (ctx, x, y, w, h, color) => {
  ctx.fillStyle = color;
  ctx.fillRect(Math.floor(x), Math.floor(y), w, h);
};

// ---------- BUSK ANIMATION ----------
const BuskAnimation = ({ color = '#D4A017', block = 0, rewardKey = 0, active = true }) => {
  const canvasRef = useRef(null);
  const PXSCALE = 4;
  const W = 140, H = 90;
  const coinsRef = useRef([]);
  const lastRewardRef = useRef(0);
  const passerbyRef = useRef({ x: -20, color: '#84cc16', spawned: 0 });
  const propsRef = useRef({ color, block, active });
  useEffect(() => { propsRef.current = { color, block, active }; }, [color, block, active]);

  useEffect(() => {
    if (rewardKey > lastRewardRef.current) {
      lastRewardRef.current = rewardKey;
      for (let i = 0; i < 3; i++) {
        coinsRef.current.push({
          x: 64 + (Math.random() - 0.5) * 6,
          y: 38,
          vx: (Math.random() - 0.5) * 1.2,
          vy: -1.5 - Math.random() * 0.5,
          life: 0,
          ttl: 60,
        });
      }
    }
  }, [rewardKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    let raf, frameCount = 0;

    const draw = () => {
      frameCount++;
      const { color, block, active } = propsRef.current;

      if (canvas.width !== W * PXSCALE || canvas.height !== H * PXSCALE) {
        canvas.width = W * PXSCALE;
        canvas.height = H * PXSCALE;
        ctx.imageSmoothingEnabled = false;
      }
      const px = (x, y, w, h, c) => _px(ctx, x, y, w, h, c);

      ctx.save();
      ctx.scale(PXSCALE, PXSCALE);

      // sky
      px(0, 0, W, 60, '#3a2a3a');
      // distant buildings
      px(0, 30, 30, 30, '#1c1825');
      px(30, 22, 25, 38, '#221c2a');
      px(55, 35, 22, 25, '#1c1825');
      px(77, 28, 30, 32, '#221c2a');
      px(107, 32, 33, 28, '#1c1825');
      // building windows (lit)
      for (let i = 0; i < 6; i++) {
        const wx = 4 + i * 22 + (i % 2) * 5;
        const wy = 38 + (i % 3) * 6;
        if (wx < W - 4) px(wx, wy, 3, 3, '#fbbf24');
      }
      // sidewalk
      px(0, 60, W, 30, '#3a3a3a');
      px(0, 60, W, 1, '#5a5a5a');
      px(20, 65, 1, 4, '#2a2a2a');
      px(45, 70, 1, 3, '#2a2a2a');
      px(95, 67, 1, 4, '#2a2a2a');
      px(120, 72, 1, 3, '#2a2a2a');

      // lamp post
      px(15, 14, 2, 50, '#1c1917');
      px(11, 14, 10, 2, '#1c1917');
      px(8, 16, 4, 5, '#1c1917');
      px(9, 21, 2, 1, '#fef3c7');
      ctx.fillStyle = 'rgba(254,243,199,0.08)';
      ctx.fillRect(0, 60, 30, 30);

      // passerby
      const pb = passerbyRef.current;
      if (pb.x > W + 10) {
        pb.spawned++;
        if (frameCount > pb.spawned * 300) {
          pb.x = -10;
          const colors = ['#84cc16', '#a78bfa', '#fb7185', '#22d3ee', '#f97316'];
          pb.color = colors[Math.floor(Math.random() * colors.length)];
        }
      } else {
        pb.x += 0.4;
      }
      if (pb.x > -10 && pb.x < W + 10) {
        const px_ = Math.floor(pb.x);
        const walkCycle = Math.floor(frameCount / 8) % 2;
        if (walkCycle === 0) {
          px(px_ - 2, 73, 2, 5, '#1a1a2e');
          px(px_ + 1, 74, 2, 4, '#1a1a2e');
        } else {
          px(px_ - 2, 74, 2, 4, '#1a1a2e');
          px(px_ + 1, 73, 2, 5, '#1a1a2e');
        }
        px(px_ - 3, 65, 6, 8, pb.color);
        px(px_ - 2, 60, 4, 5, '#d4a87a');
        px(px_ - 2, 58, 4, 2, '#1a1a2e');
      }

      // tip jar
      const jarX = 88, jarY = 70;
      px(jarX, jarY, 12, 14, '#5a5048');
      px(jarX + 1, jarY + 1, 10, 12, '#a89878');
      px(jarX + 1, jarY + 1, 10, 2, '#7a6a50');
      px(jarX - 1, jarY - 1, 14, 2, '#3a322a');
      const coinPile = Math.min(8, lastRewardRef.current);
      for (let i = 0; i < coinPile; i++) {
        px(jarX + 2 + (i % 4) * 2, jarY + 11 - Math.floor(i / 4) * 2, 1, 1, '#D4A017');
      }
      if (frameCount % 60 < 30) {
        px(jarX - 2, jarY - 6, 16, 4, '#fef3c7');
        px(jarX + 5, jarY - 5, 1, 2, '#1c1917');
      }

      // beatboxer
      const bx = 60, by = 78;
      px(bx - 6, by, 12, 1, 'rgba(0,0,0,0.5)');
      const bob = active ? Math.floor(frameCount / 6) % 2 : 0;
      px(bx - 4, by - 8 - bob, 3, 8, '#1a1a2e');
      px(bx + 1, by - 8 + bob, 3, 8, '#1a1a2e');
      px(bx - 4, by - 1, 3, 1, '#fff');
      px(bx + 1, by - 1, 3, 1, '#fff');
      px(bx - 5, by - 18, 10, 11, color);
      px(bx - 5, by - 18, 10, 1, '#fff');
      px(bx - 5, by - 24, 10, 7, color);
      // arms
      px(bx + 5, by - 17, 2, 3, color);
      px(bx + 6, by - 14, 2, 3, '#d4a87a');
      px(bx + 7, by - 18, 2, 3, '#888');
      px(bx + 6, by - 19, 4, 2, '#aaa');
      px(bx - 7, by - 17, 2, 8, color);
      // head
      px(bx - 4, by - 24, 8, 7, '#d4a87a');
      // eyes
      const eyeBlink = frameCount % 120 < 4 ? 0 : 1;
      if (eyeBlink) {
        px(bx - 3, by - 22, 1, 1, '#1a1a2e');
        px(bx + 1, by - 22, 1, 1, '#1a1a2e');
      } else {
        px(bx - 3, by - 22, 1, 1, '#5a4030');
        px(bx + 1, by - 22, 1, 1, '#5a4030');
      }
      // mouth
      const mouthFrame = active ? Math.floor(frameCount / 4) % 4 : 0;
      if (active) {
        if (mouthFrame === 0) px(bx - 1, by - 19, 3, 1, '#5a2020');
        else if (mouthFrame === 1) px(bx - 1, by - 19, 3, 2, '#3a1010');
        else if (mouthFrame === 2) px(bx, by - 19, 2, 1, '#5a2020');
        else px(bx - 1, by - 19, 3, 2, '#3a1010');
      } else {
        px(bx - 1, by - 19, 3, 1, '#5a2020');
      }

      // soundwaves
      if (active) {
        const wavePhase = frameCount * 0.3;
        for (let i = 0; i < 3; i++) {
          const phase = wavePhase + i * 1.2;
          const distance = (phase % 12);
          const opacity = Math.max(0, 1 - distance / 12);
          const waveX = bx + 14 + distance;
          if (waveX < W) {
            ctx.fillStyle = `rgba(212, 160, 23, ${opacity * 0.8})`;
            ctx.fillRect(Math.floor(waveX), by - 22, 1, 1);
            ctx.fillRect(Math.floor(waveX) + 1, by - 21, 1, 2);
            ctx.fillRect(Math.floor(waveX) + 2, by - 19, 1, 1);
            ctx.fillRect(Math.floor(waveX) + 1, by - 17, 1, 2);
            ctx.fillRect(Math.floor(waveX), by - 15, 1, 1);
          }
        }
        // sound text pops
        if (block > 0) {
          const popKey = Math.floor(frameCount / 25) % 3;
          if ((frameCount % 25) < 10) {
            const popText = ['BOOM', 'TSS', 'KSH'][popKey];
            const popY = 30 + (frameCount % 25) * 0.5;
            ctx.fillStyle = '#D4A017';
            ctx.font = 'bold 7px monospace';
            ctx.fillText(popText, bx + 12, popY);
          }
        }
      }

      // flying coins
      coinsRef.current = coinsRef.current.filter(c => {
        c.life++;
        c.x += c.vx;
        c.vy += 0.08;
        c.y += c.vy;
        px(c.x - 1, c.y - 1, 2, 2, '#D4A017');
        px(c.x, c.y - 1, 1, 1, '#fef3c7');
        return c.y < jarY + 8 && c.life < c.ttl;
      });

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas ref={canvasRef}
      className="w-full block border-2 border-stone-800"
      style={{ imageRendering: 'pixelated', background: '#1c1917', aspectRatio: `${W} / ${H}` }} />
  );
};
// ============ RHYTHM TAP MINI-GAME ============
// Three-lane rhythm game for the Busk activity.
// Notes scroll right→left. When a note hits the target line, tap the matching lane.
// Hit accuracy is reported back to the parent every `evaluateEveryMs` for bonus rewards.

const RhythmTap = ({ onAccuracyUpdate, evaluateEveryMs = 5000, active = true }) => {
  const canvasRef = useRef(null);
  const tapStateRef = useRef({
    notes: [],          // {time: scheduledMs, lane: 0|1|2, hit: bool, judged: bool}
    lastSpawn: 0,
    nextNoteIdx: 0,
    startTime: 0,
    hits: 0,            // hits in current evaluation window
    misses: 0,
    perfects: 0,
    judgments: [],      // [{text: 'PERFECT'|'GOOD'|'MISS', born, lane}]
    combo: 0,
    maxCombo: 0,
  });
  const [feedback, setFeedback] = useState(0); // re-render trigger when judgments change

  // Physical constants
  const TRACK_W = 360;
  const TRACK_H = 120;
  const TARGET_X = 60; // where notes should be tapped
  const NOTE_SPEED = 200; // pixels per second
  const LEAD_TIME_MS = (TRACK_W - TARGET_X) / NOTE_SPEED * 1000; // time for note to travel from spawn to target
  const HIT_PERFECT_MS = 80;
  const HIT_GOOD_MS = 180;

  // Pattern: a 4-beat boom-clap-boom-clap with a hat on every offbeat
  // Lanes: 0 = BOOM (kick), 1 = TSS (hat), 2 = KSH (snare)
  // Each entry is [beatPosition, lane] where beatPosition is in beats (0-indexed within a 4-beat bar)
  const PATTERN = [
    [0, 0],     // beat 1: kick
    [0.5, 1],   // 1.5: hat
    [1, 2],     // beat 2: snare
    [1.5, 1],   // 2.5: hat
    [2, 0],     // beat 3: kick
    [2.5, 1],   // 3.5: hat
    [3, 2],     // beat 4: snare
    [3.5, 1],   // 4.5: hat
  ];
  const BPM = 100;
  const BEAT_MS = 60000 / BPM;
  const BAR_MS = BEAT_MS * 4;

  // Note color per lane. heroKey maps to the 4 Beatbox Hero sounds so taps
  // play the player's recorded studio samples (with synth fallback).
  const LANE_INFO = [
    { label: 'BOOM', color: '#CC2200', heroKey: 'B'  },
    { label: 'TSS',  color: '#22d3ee', heroKey: 'T'  },
    { label: 'KSH',  color: '#D4A017', heroKey: 'Pf' },
  ];

  // Generate notes on a rolling basis
  const ensureNotesAhead = (now) => {
    const state = tapStateRef.current;
    const horizon = now - state.startTime + 4000; // schedule 4s into the future
    while (state.lastSpawn < horizon) {
      const barStart = state.lastSpawn;
      PATTERN.forEach(([beat, lane]) => {
        state.notes.push({
          time: barStart + beat * BEAT_MS,
          lane,
          hit: false,
          judged: false,
          id: Math.random(),
        });
      });
      state.lastSpawn += BAR_MS;
    }
  };

  // Tap a lane
  const tap = (lane) => {
    const state = tapStateRef.current;
    if (!state.startTime) return;
    const now = performance.now();
    const songT = now - state.startTime;

    // Find the closest unhit note in this lane within the good hit window
    let bestIdx = -1;
    let bestDelta = Infinity;
    for (let i = 0; i < state.notes.length; i++) {
      const n = state.notes[i];
      if (n.hit || n.judged) continue;
      if (n.lane !== lane) continue;
      const delta = Math.abs(n.time - songT);
      if (delta < bestDelta && delta < HIT_GOOD_MS) {
        bestDelta = delta;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      const n = state.notes[bestIdx];
      n.hit = true;
      n.judged = true;
      const isPerfect = bestDelta < HIT_PERFECT_MS;
      if (isPerfect) state.perfects++;
      state.hits++;
      state.combo++;
      if (state.combo > state.maxCombo) state.maxCombo = state.combo;
      state.judgments.push({
        text: isPerfect ? 'PERFECT' : 'GOOD',
        born: now,
        lane,
        color: isPerfect ? '#D4A017' : '#22d3ee',
      });
      // Play the recorded studio sample (or synth fallback) on hit
      playHeroSound(LANE_INFO[lane].heroKey);
    } else {
      // Mis-tap
      state.combo = 0;
      state.judgments.push({
        text: 'MISS',
        born: now,
        lane,
        color: '#CC2200',
      });
      state.misses++;
    }
    setFeedback(f => f + 1);
  };

  // Main animation + game loop
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    const state = tapStateRef.current;
    state.startTime = performance.now();
    state.lastSpawn = 0;
    state.notes = [];
    state.hits = 0;
    state.misses = 0;
    state.perfects = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.judgments = [];

    // Schedule periodic accuracy reports
    const evalInterval = setInterval(() => {
      const total = state.hits + state.misses;
      // Count missed-by-passing notes too
      const songT = performance.now() - state.startTime;
      let passedNotes = 0;
      state.notes.forEach(n => {
        if (!n.judged && n.time + HIT_GOOD_MS < songT) {
          n.judged = true;
          state.misses++;
          state.combo = 0;
          passedNotes++;
        }
      });
      const finalTotal = state.hits + state.misses;
      const accuracy = finalTotal > 0 ? state.hits / finalTotal : 0;
      onAccuracyUpdate?.(accuracy, state.hits, finalTotal);
      // Reset window
      state.hits = 0;
      state.misses = 0;
      state.perfects = 0;
      // GC old notes
      state.notes = state.notes.filter(n => n.time + HIT_GOOD_MS > songT);
    }, evaluateEveryMs);

    const draw = () => {
      const now = performance.now();
      const songT = now - state.startTime;
      ensureNotesAhead(now);

      // Auto-mark passed notes as missed (for visualization & combo break)
      state.notes.forEach(n => {
        if (!n.judged && n.time + HIT_GOOD_MS < songT) {
          n.judged = true;
          state.misses++;
          state.combo = 0;
        }
      });

      // Background
      ctx.fillStyle = '#0c0a09';
      ctx.fillRect(0, 0, TRACK_W, TRACK_H);

      // Lane separators + labels
      const laneH = TRACK_H / 3;
      for (let i = 0; i < 3; i++) {
        // Subtle lane background
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)';
        ctx.fillRect(0, i * laneH, TRACK_W, laneH);
        // Lane border
        ctx.fillStyle = '#1c1917';
        ctx.fillRect(0, (i + 1) * laneH - 1, TRACK_W, 1);
      }

      // Target line
      ctx.fillStyle = '#D4A017';
      ctx.fillRect(TARGET_X - 1, 0, 2, TRACK_H);
      ctx.fillStyle = 'rgba(212, 160, 23, 0.2)';
      ctx.fillRect(TARGET_X - 6, 0, 12, TRACK_H);

      // Lane labels at left of target
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'right';
      LANE_INFO.forEach((lane, i) => {
        ctx.fillStyle = lane.color;
        ctx.fillText(lane.label, TARGET_X - 10, i * laneH + laneH / 2 + 4);
      });

      // Draw notes
      state.notes.forEach(n => {
        const dt = n.time - songT;
        const x = TARGET_X + dt / 1000 * NOTE_SPEED;
        if (x < -20 || x > TRACK_W + 20) return;
        const y = n.lane * laneH + laneH / 2;
        if (n.hit) {
          // Show flash
          const age = Math.abs(songT - n.time);
          if (age < 300) {
            ctx.fillStyle = `rgba(212, 160, 23, ${1 - age / 300})`;
            ctx.beginPath();
            ctx.arc(TARGET_X, y, 18 + age / 10, 0, Math.PI * 2);
            ctx.fill();
          }
          return;
        }
        if (n.judged) return; // missed but not drawn

        // Draw note as colored square with glow
        const lane = LANE_INFO[n.lane];
        ctx.shadowColor = lane.color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = lane.color;
        ctx.fillRect(x - 12, y - 12, 24, 24);
        ctx.shadowBlur = 0;
        // Inner highlight
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(x - 10, y - 10, 20, 4);
      });

      // Judgment text feedback
      state.judgments = state.judgments.filter(j => now - j.born < 600);
      state.judgments.forEach(j => {
        const age = (now - j.born) / 600;
        const y = j.lane * laneH + laneH / 2 - 8 - age * 16;
        ctx.fillStyle = j.color;
        ctx.globalAlpha = 1 - age;
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(j.text, TARGET_X + 30, y);
        ctx.globalAlpha = 1;
      });

      // Combo counter
      if (state.combo >= 3) {
        ctx.fillStyle = '#D4A017';
        ctx.font = 'bold 18px "Bebas Neue", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${state.combo}x COMBO`, TRACK_W - 10, 24);
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(evalInterval);
    };
  }, [active, evaluateEveryMs]);

  // Handle keyboard taps too (D, F, J keys for desktop debug)
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'd' || e.key === 'D') tap(0);
      else if (e.key === 'f' || e.key === 'F') tap(1);
      else if (e.key === 'j' || e.key === 'J') tap(2);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="space-y-2">
      <canvas ref={canvasRef}
        width={TRACK_W} height={TRACK_H}
        className="w-full block border-2 border-stone-800"
        style={{ aspectRatio: `${TRACK_W} / ${TRACK_H}`, background: '#0c0a09', imageRendering: 'auto' }} />
      <div className="grid grid-cols-3 gap-1">
        {LANE_INFO.map((lane, i) => (
          <button key={i}
            onPointerDown={(e) => { e.preventDefault(); tap(i); }}
            className="py-3 border-2 active:scale-95 transition-transform select-none touch-none"
            style={{
              borderColor: lane.color,
              background: `${lane.color}22`,
              color: lane.color,
              fontFamily: '"Bebas Neue", "Oswald", sans-serif',
              fontSize: 18,
              letterSpacing: '0.15em',
            }}>
            {lane.label}
          </button>
        ))}
      </div>
    </div>
  );
};

// ============ RUN TRACKER MINI-GAME ============
// Track-and-Field style alternating-tap bar.
// Hit LEFT then RIGHT then LEFT (alternating) — same-finger taps are ignored.
// Each valid tap raises the bar; bar drains continuously.
// Target zone: 60-85% (full reward). Burn zone: 85-100% (same reward, +energy cost).
// Below 60%: "too slow", reduced reward.
// Each "block" (~2.5s) where bar averaged in target/burn = a good bar.
// Every 5 good bars → reports a "max-energy reward" event up to parent.

const RunTracker = ({ onBlockResult, onMaxEnergyTick, active = true, evaluateEveryMs = 2500 }) => {
  const [barLevel, setBarLevel] = useState(0); // 0-100
  const [lastSide, setLastSide] = useState(null); // 'L' | 'R' | null
  const [flashSide, setFlashSide] = useState(null); // brief visual feedback
  const [goodBars, setGoodBars] = useState(0);
  const [maxEnergyGained, setMaxEnergyGained] = useState(0); // session count

  // Refs for the rAF loop (avoid stale closures)
  const barRef = useRef(0);
  const samplesRef = useRef([]); // bar level samples since last block evaluation
  const burnTicksRef = useRef(0); // count of samples in burn zone, since last block
  const lastSampleAtRef = useRef(performance.now());
  const lastBlockAtRef = useRef(performance.now());
  const goodBarsRef = useRef(0);

  // Tunable physics constants
  const TAP_GAIN = 12;       // bar units gained per valid alternating tap
  const DRAIN_PER_SEC = 25;  // bar units drained per second
  const TARGET_LO = 60;
  const TARGET_HI = 85;
  // Burn zone: above TARGET_HI

  // Tap handler — only counts alternating
  const handleTap = (side) => {
    if (!active) return;
    if (side === lastSide) {
      // Same finger as last — ignored, no fill, brief red flash
      setFlashSide({ side, ok: false });
      setTimeout(() => setFlashSide(null), 100);
      return;
    }
    // Valid alternating tap
    setLastSide(side);
    setFlashSide({ side, ok: true });
    setTimeout(() => setFlashSide(null), 80);
    barRef.current = Math.min(100, barRef.current + TAP_GAIN);
    setBarLevel(barRef.current);
  };

  // Drain loop + block evaluation
  useEffect(() => {
    if (!active) return;
    let raf;
    const tick = () => {
      const now = performance.now();
      const dt = (now - lastSampleAtRef.current) / 1000; // seconds
      lastSampleAtRef.current = now;

      // Drain bar
      barRef.current = Math.max(0, barRef.current - DRAIN_PER_SEC * dt);
      setBarLevel(barRef.current);

      // Sample for block evaluation
      samplesRef.current.push(barRef.current);
      if (barRef.current > TARGET_HI) burnTicksRef.current += 1;

      // Block boundary — every evaluateEveryMs
      if (now - lastBlockAtRef.current >= evaluateEveryMs) {
        lastBlockAtRef.current = now;
        const samples = samplesRef.current;
        const avg = samples.reduce((s, x) => s + x, 0) / Math.max(1, samples.length);
        const burnRatio = burnTicksRef.current / Math.max(1, samples.length);

        // A "good bar" = avg was in target zone or above (≥60%)
        const isGood = avg >= TARGET_LO;
        if (isGood) {
          goodBarsRef.current += 1;
          setGoodBars(goodBarsRef.current);
          // Every 3 good bars → +1 max energy
          if (goodBarsRef.current >= 3) {
            goodBarsRef.current = 0;
            setGoodBars(0);
            setMaxEnergyGained(m => m + 1);
            onMaxEnergyTick?.();
          }
        }

        // Tell parent about this block (for cash/stat rewards via standard activity loop,
        // and for energy burn surcharge if we spent time in the burn zone)
        onBlockResult?.({ avg, isGood, burnRatio });

        samplesRef.current = [];
        burnTicksRef.current = 0;
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, evaluateEveryMs]);

  // Determine zone of current bar level for visual styling
  const zone = barLevel >= TARGET_HI + 0.0001 ? 'burn' : barLevel >= TARGET_LO ? 'target' : 'slow';

  return (
    <div className="border-2 border-stone-800 bg-stone-900/50 p-3 space-y-3">
      {/* Header */}
      <div className="text-center">
        <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Sprint pace</div>
        <div className="text-amber-500 text-base tracking-wider mt-1" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
          ALTERNATE LEFT · RIGHT · LEFT · RIGHT
        </div>
      </div>

      {/* The bar */}
      <div className="flex items-stretch gap-3 h-44">
        {/* Bar gauge */}
        <div className="flex-1 relative bg-stone-950 border-2 border-stone-800 overflow-hidden">
          {/* The fill (drawn first so labels and zone overlays sit on top) */}
          <div className="absolute bottom-0 left-0 right-0 transition-all duration-75 z-0"
               style={{
                 height: `${barLevel}%`,
                 background: zone === 'burn'
                   ? 'linear-gradient(to top, #dc2626, #f87171, #fca5a5)'
                   : zone === 'target'
                   ? 'linear-gradient(to top, #D4A017, #fbbf24, #fef3c7)'
                   : 'linear-gradient(to top, #57534e, #a8a29e)',
                 boxShadow: zone === 'target' ? '0 -2px 16px rgba(212, 160, 23, 0.6)' :
                            zone === 'burn' ? '0 -2px 16px rgba(239, 68, 68, 0.6)' : 'none',
                 opacity: 0.95,
               }} />

          {/* Burn zone (top 15%) */}
          <div className="absolute left-0 right-0 top-0 bg-red-900/25 border-b border-red-900/60 z-10" style={{ height: `${100 - TARGET_HI}%` }}>
            <div className="absolute top-1 left-1 right-1 text-center text-[8px] text-red-400 uppercase tracking-widest">🔥 burning out</div>
          </div>
          {/* Target zone (60-85%) */}
          <div className="absolute left-0 right-0 bg-amber-500/10 border-y-2 border-amber-500/60 z-10"
               style={{ top: `${100 - TARGET_HI}%`, height: `${TARGET_HI - TARGET_LO}%` }}>
            <div className="absolute inset-0 flex items-center justify-center text-[10px] text-amber-300 uppercase tracking-widest font-bold" style={{ textShadow: '0 0 4px rgba(0,0,0,0.8)' }}>target</div>
          </div>
          {/* Slow zone label */}
          <div className="absolute left-1 bottom-1 text-[8px] text-stone-500 uppercase tracking-wider z-10" style={{ textShadow: '0 0 4px rgba(0,0,0,0.8)' }}>too slow</div>

          {/* Numeric readout */}
          <div className="absolute top-1 right-1 text-[10px] font-mono z-10"
               style={{ color: zone === 'burn' ? '#fca5a5' : zone === 'target' ? '#fef3c7' : '#a8a29e', textShadow: '0 0 4px rgba(0,0,0,0.8)' }}>
            {Math.round(barLevel)}%
          </div>
        </div>

        {/* Stats sidebar */}
        <div className="w-24 flex flex-col justify-between text-[10px] uppercase tracking-wider text-stone-500">
          <div>
            <div>Good bars</div>
            <div className="text-amber-500 text-2xl font-bold leading-none mt-0.5"
              style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
              {goodBars} <span className="text-stone-600 text-base">/ 3</span>
            </div>
            <div className="text-[9px] text-stone-600 mt-0.5">to next +max⚡</div>
          </div>
          <div>
            <div>Gained</div>
            <div className="text-amber-500 text-2xl font-bold leading-none mt-0.5"
              style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
              +{maxEnergyGained}
            </div>
            <div className="text-[9px] text-stone-600 mt-0.5">max energy</div>
          </div>
        </div>
      </div>

      {/* Tap buttons — big, side-by-side, finger-friendly */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onPointerDown={(e) => { e.preventDefault(); handleTap('L'); }}
          className={`py-6 border-4 transition-all select-none ${
            flashSide?.side === 'L'
              ? (flashSide.ok ? 'border-amber-300 bg-amber-500/40 scale-95' : 'border-red-500 bg-red-900/40')
              : 'border-amber-600 bg-amber-900/20 active:scale-95'
          }`}
          style={{ touchAction: 'manipulation', WebkitUserSelect: 'none', userSelect: 'none' }}>
          <div className="text-3xl">👈</div>
          <div className="text-amber-500 text-base tracking-widest mt-1"
            style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>LEFT</div>
        </button>
        <button
          onPointerDown={(e) => { e.preventDefault(); handleTap('R'); }}
          className={`py-6 border-4 transition-all select-none ${
            flashSide?.side === 'R'
              ? (flashSide.ok ? 'border-amber-300 bg-amber-500/40 scale-95' : 'border-red-500 bg-red-900/40')
              : 'border-amber-600 bg-amber-900/20 active:scale-95'
          }`}
          style={{ touchAction: 'manipulation', WebkitUserSelect: 'none', userSelect: 'none' }}>
          <div className="text-3xl">👉</div>
          <div className="text-amber-500 text-base tracking-widest mt-1"
            style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>RIGHT</div>
        </button>
      </div>

      <div className="text-[9px] text-stone-600 uppercase tracking-wider text-center pt-1 border-t border-stone-800">
        Same finger twice = doesn't count · stay in <span className="text-amber-500">TARGET</span> zone — burning out costs extra ⚡
      </div>
    </div>
  );
};


// Sing chord tones (3-note sequences forming major/minor triads).
// Uses Web Audio + autocorrelation for monophonic pitch detection.
// Reports an accuracy score to parent for bonus rewards.

// Map of note names → MIDI numbers. Spans G3 (55) through G5 (79) — comfortable singing range.
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const midiToFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const midiToName = (midi) => `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
const freqToCents = (freq, targetFreq) => 1200 * Math.log2(freq / targetFreq);

// Autocorrelation pitch detection (ACF/AMDF).
// Operates on a Float32Array buffer of time-domain samples.
// Returns frequency in Hz, or -1 if signal too weak / no clear pitch.
function detectPitch(buffer, sampleRate) {
  const SIZE = buffer.length;
  // RMS gate — if too quiet, no detection
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1; // silence

  // Trim to "voiced" region: find first/last sample crossing threshold
  const threshold = 0.2;
  let r1 = 0, r2 = SIZE - 1;
  for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buffer[i]) < threshold) { r1 = i; break; }
  for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buffer[SIZE - i]) < threshold) { r2 = SIZE - i; break; }
  const trimmed = buffer.slice(r1, r2);
  const T = trimmed.length;

  // Autocorrelate
  const c = new Array(T).fill(0);
  for (let i = 0; i < T; i++) {
    for (let j = 0; j < T - i; j++) {
      c[i] += trimmed[j] * trimmed[j + i];
    }
  }

  // Skip the first peak (it's just the signal correlating with itself at lag 0)
  let d = 0;
  while (d < T - 1 && c[d] > c[d + 1]) d++;

  // Find next peak
  let maxval = -1, maxpos = -1;
  for (let i = d; i < T; i++) {
    if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
  }
  if (maxpos < 1) return -1;

  // Parabolic interpolation for sub-sample accuracy
  let T0 = maxpos;
  const x1 = c[T0 - 1] || 0;
  const x2 = c[T0];
  const x3 = c[T0 + 1] || 0;
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a) T0 = T0 - b / (2 * a);

  if (T0 < 1) return -1;
  const freq = sampleRate / T0;
  // Reasonable singing range filter
  if (freq < 60 || freq > 1500) return -1;
  return freq;
}

// Build a 3-note chord. Major = root, +4 semitones, +7. Minor = root, +3, +7.
// Voice range presets. Numbers are MIDI roots that work as the bottom of a major/minor triad
// while keeping the top note (root + 7 semitones = perfect fifth above) in a comfortable octave.
const VOICE_RANGES = {
  higher: {
    label: 'Higher voice',
    description: 'Soprano, alto, kids',
    roots: [60, 62, 64, 65, 67, 69, 71, 72, 74], // C4..D5
  },
  lower: {
    label: 'Lower voice',
    description: 'Tenor, baritone, bass',
    roots: [48, 50, 52, 53, 55, 57, 59, 60, 62], // C3..D4
  },
};

// Auto-detected: build a roots list centered on the user's calibration note (±5 semitones).
function rangeFromCalibration(midi) {
  const center = Math.round(midi);
  const roots = [];
  // Keep root within ±4 semitones of detected note. Top of triad (root+7) ends up center+3.
  // That keeps the triad mostly within ±5 semitones of where they sang.
  for (let m = center - 4; m <= center + 4; m++) roots.push(m);
  return roots;
}

function generateChord(roots) {
  const pool = roots && roots.length ? roots : [55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72]; // default G3..C5
  const root = pool[Math.floor(Math.random() * pool.length)];
  const isMajor = Math.random() < 0.5;
  const intervals = isMajor ? [0, 4, 7] : [0, 3, 7];
  const notes = intervals.map(i => root + i);
  return {
    name: `${midiToName(root)} ${isMajor ? 'MAJOR' : 'MINOR'}`,
    notes: notes.map(midi => ({ midi, freq: midiToFreq(midi), name: midiToName(midi) })),
  };
}

// ============ VOICE RANGE PICKER ============
// Asks user about their comfortable singing range. Two flavors:
// 1) Quick pick: Higher / Lower (no mic needed)
// 2) Auto-detect: hum a note for 2 seconds, we set the range from that
const VoiceRangePicker = ({ currentRange = null, onSet, onCancel = null }) => {
  const [mode, setMode] = useState('choose'); // 'choose' | 'detecting'
  const [detectedNote, setDetectedNote] = useState(null);
  const [detectionStatus, setDetectionStatus] = useState('');
  const [permissionError, setPermissionError] = useState('');

  // Auto-detect helpers
  const audioCtxRef = useRef(null);
  const streamRef = useRef(null);
  const samplesRef = useRef([]);

  const startCalibration = async () => {
    setMode('detecting');
    setDetectionStatus('Requesting mic…');
    setPermissionError('');
    try {
      if (typeof window !== 'undefined' && window.isSecureContext === false) {
        setPermissionError('Mic requires HTTPS. Use the Netlify URL on your phone.');
        setMode('choose');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      streamRef.current = stream;
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      const buffer = new Float32Array(analyser.fftSize);
      samplesRef.current = [];
      setDetectionStatus("Hum any comfortable note for 2 seconds…");

      const startedAt = performance.now();
      const tick = () => {
        if (!audioCtxRef.current) return; // disposed
        analyser.getFloatTimeDomainData(buffer);
        const freq = detectPitch(buffer, ctx.sampleRate);
        if (freq > 0) samplesRef.current.push(freq);
        const elapsed = performance.now() - startedAt;
        if (elapsed < 2500) {
          requestAnimationFrame(tick);
        } else {
          // Compute median pitch from collected samples
          const samples = samplesRef.current.filter(f => f > 70 && f < 1100);
          if (samples.length < 10) {
            setDetectionStatus("Didn't hear enough — try humming louder. Tap to retry.");
            cleanup();
            return;
          }
          // Octave-fold to a target octave to reduce mis-octave detections
          // Simple: use median frequency directly
          samples.sort((a, b) => a - b);
          const median = samples[Math.floor(samples.length / 2)];
          const midi = Math.round(69 + 12 * Math.log2(median / 440));
          setDetectedNote({ freq: median, midi, name: midiToName(midi) });
          setDetectionStatus('');
          cleanup();
        }
      };
      requestAnimationFrame(tick);
    } catch (err) {
      const name = err?.name || 'Error';
      let msg = err?.message || String(err);
      if (name === 'NotAllowedError') msg = 'Mic permission denied. Pick higher/lower instead.';
      setPermissionError(msg);
      setMode('choose');
    }
  };

  const cleanup = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});
    streamRef.current = null;
    audioCtxRef.current = null;
  };

  useEffect(() => () => cleanup(), []);

  const choose = (range) => {
    onSet({ voiceRange: range, voiceRangeMidi: null });
  };
  const acceptDetection = () => {
    onSet({ voiceRange: 'auto', voiceRangeMidi: detectedNote.midi });
  };

  return (
    <div className="border-2 border-amber-500 bg-stone-950 p-4 space-y-3">
      <div className="text-center">
        <div className="text-amber-500 text-base tracking-wider" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
          🎤 Pick your singing range
        </div>
        <div className="text-[11px] text-stone-400 mt-1">
          We'll match notes to where your voice sits comfortably.
        </div>
      </div>

      {mode === 'choose' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => choose('higher')}
              className={`p-3 border-2 transition-all ${currentRange === 'higher' ? 'border-amber-500 bg-amber-500/20' : 'border-stone-700 bg-stone-900/50 hover:border-amber-500/50'}`}>
              <div className="text-amber-500 text-base" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>HIGHER VOICE</div>
              <div className="text-[10px] text-stone-400 uppercase tracking-wider">soprano · alto · kids</div>
            </button>
            <button onClick={() => choose('lower')}
              className={`p-3 border-2 transition-all ${currentRange === 'lower' ? 'border-amber-500 bg-amber-500/20' : 'border-stone-700 bg-stone-900/50 hover:border-amber-500/50'}`}>
              <div className="text-amber-500 text-base" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>LOWER VOICE</div>
              <div className="text-[10px] text-stone-400 uppercase tracking-wider">tenor · baritone · bass</div>
            </button>
          </div>

          <div className="text-center text-[10px] uppercase tracking-widest text-stone-600">— or —</div>

          <button onClick={startCalibration}
            className="w-full p-3 border-2 border-stone-700 bg-stone-900/50 hover:border-amber-500/50 transition-all">
            <div className="text-stone-200 text-sm">🎙️ Hum a comfortable note</div>
            <div className="text-[10px] text-stone-500 uppercase tracking-wider mt-0.5">Auto-tune the range to your voice</div>
          </button>

          {permissionError && (
            <div className="text-[10px] text-red-400 text-center">{permissionError}</div>
          )}
          {onCancel && (
            <button onClick={onCancel} className="w-full text-[10px] text-stone-500 hover:text-stone-300 uppercase tracking-wider underline">
              Cancel
            </button>
          )}
        </>
      )}

      {mode === 'detecting' && !detectedNote && (
        <div className="border-2 border-blue-500 bg-blue-950/30 p-4 text-center space-y-2">
          <div className="text-3xl">🎙️</div>
          <div className="text-blue-300 text-sm uppercase tracking-widest">{detectionStatus}</div>
          {detectionStatus.includes('retry') && (
            <button onClick={startCalibration}
              className="px-3 py-1 mt-1 border border-blue-400 text-blue-300 text-[11px] uppercase">Retry</button>
          )}
          <button onClick={() => setMode('choose')} className="block w-full text-[10px] text-stone-500 underline">Cancel</button>
        </div>
      )}

      {mode === 'detecting' && detectedNote && (
        <div className="border-2 border-amber-500 bg-amber-950/30 p-4 text-center space-y-2">
          <div className="text-[10px] text-stone-400 uppercase tracking-widest">Detected note</div>
          <div className="text-amber-500 text-3xl" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
            {detectedNote.name}
          </div>
          <div className="text-[10px] text-stone-500">{detectedNote.freq.toFixed(1)} Hz</div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button onClick={() => { setDetectedNote(null); startCalibration(); }}
              className="p-2 border border-stone-700 text-stone-300 text-[11px] uppercase tracking-wider">Try again</button>
            <button onClick={acceptDetection}
              className="p-2 border-2 border-amber-500 bg-amber-500/20 text-amber-500 text-[11px] uppercase tracking-wider">Use this</button>
          </div>
        </div>
      )}
    </div>
  );
};


const PitchTuner = ({ onAccuracyUpdate, evaluateEveryMs = 2500, active = true,
                     voiceRange = 'higher', voiceRangeMidi = null, onChangeRange = null }) => {
  const [permission, setPermission] = useState('pending'); // 'pending' | 'granted' | 'denied' | 'unsupported' | 'insecure'
  const [errorDetail, setErrorDetail] = useState('');

  // Resolve which root pool to use based on voiceRange + optional calibration midi
  const resolveRoots = () => {
    if (voiceRange === 'auto' && voiceRangeMidi) return rangeFromCalibration(voiceRangeMidi);
    if (voiceRange === 'lower') return VOICE_RANGES.lower.roots;
    return VOICE_RANGES.higher.roots; // default
  };
  const [chord, setChord] = useState(() => generateChord(resolveRoots()));
  const [noteIdx, setNoteIdx] = useState(0); // current note in the chord (0..2)
  const [phase, setPhase] = useState('listen'); // 'listen' | 'sing'
  const [detectedFreq, setDetectedFreq] = useState(-1);
  const [sustainFill, setSustainFill] = useState(0); // 0..1 of current note's hold meter
  const [noteScores, setNoteScores] = useState([null, null, null]); // 0..1 per note

  // Refs for the audio pipeline (reset on remount)
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const bufferRef = useRef(null);

  // The active note's accumulator state (only counts during 'sing' phase)
  const noteStateRef = useRef({
    inTuneTime: 0,
    totalTime: 0,
    DURATION_MS: 2500, // 1 bar @ 0.5s × 5 ticks
    _lastTick: 0,
  });

  // Refs to avoid stale closures inside the rAF loop
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  const noteIdxRef = useRef(noteIdx);
  useEffect(() => { noteIdxRef.current = noteIdx; }, [noteIdx]);
  const chordRef = useRef(chord);
  useEffect(() => { chordRef.current = chord; }, [chord]);

  // Regenerate chord when the voice range setting changes
  const voiceRangeKey = `${voiceRange}:${voiceRangeMidi || ''}`;
  const lastRangeKeyRef = useRef(voiceRangeKey);
  useEffect(() => {
    if (lastRangeKeyRef.current !== voiceRangeKey) {
      lastRangeKeyRef.current = voiceRangeKey;
      setChord(generateChord(resolveRoots()));
      setNoteIdx(0);
      setNoteScores([null, null, null]);
    }
  }, [voiceRangeKey]);

  // Track the active reference-tone audio nodes so we can stop them on phase change / unmount
  const refTonesRef = useRef([]);

  // Full-chord scores reported up to parent for bonus rewards
  const chordScoresRef = useRef([]);

  // Synthesize a soft pleasant reference tone.
  // Uses fundamental + 1st harmonic (octave) at lower amplitude — gives an organ-like timbre.
  const playReferenceTone = (freq, durationSec = 2.0) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    // Stop any previous tones
    refTonesRef.current.forEach(t => { try { t.stop(); } catch {} });
    refTonesRef.current = [];

    const t = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, t);
    masterGain.gain.linearRampToValueAtTime(0.18, t + 0.05);
    masterGain.gain.setValueAtTime(0.18, t + durationSec - 0.15);
    masterGain.gain.linearRampToValueAtTime(0.0001, t + durationSec);
    masterGain.connect(ctx.destination);

    // Fundamental
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = freq;
    const g1 = ctx.createGain();
    g1.gain.value = 1.0;
    osc1.connect(g1).connect(masterGain);
    osc1.start(t);
    osc1.stop(t + durationSec + 0.05);

    // Octave harmonic (softer)
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2;
    const g2 = ctx.createGain();
    g2.gain.value = 0.18;
    osc2.connect(g2).connect(masterGain);
    osc2.start(t);
    osc2.stop(t + durationSec + 0.05);

    // Fifth harmonic (very soft, gives warmth)
    const osc3 = ctx.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.value = freq * 3;
    const g3 = ctx.createGain();
    g3.gain.value = 0.06;
    osc3.connect(g3).connect(masterGain);
    osc3.start(t);
    osc3.stop(t + durationSec + 0.05);

    refTonesRef.current = [osc1, osc2, osc3];
  };

  // Mount: request mic + set up audio pipeline
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        // Check secure context first — getUserMedia silently fails on http://
        if (typeof window !== 'undefined' && window.isSecureContext === false) {
          setPermission('insecure');
          setErrorDetail('This page is loaded over an insecure connection. The mic API only works on https:// or localhost.');
          return;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
          setPermission('unsupported');
          setErrorDetail('Your browser doesn\'t expose navigator.mediaDevices.getUserMedia. This usually means file:// on iOS Safari, or an old browser. Try hosting the page over HTTPS.');
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        audioCtxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        src.connect(analyser);
        analyserRef.current = analyser;
        bufferRef.current = new Float32Array(analyser.fftSize);
        setPermission('granted');
      } catch (err) {
        console.error('Mic init failed:', err);
        const name = err?.name || 'Error';
        let detail = err?.message || String(err);
        if (name === 'NotAllowedError') detail = 'Permission denied. Tap the lock icon in the URL bar and allow microphone access, then reload.';
        else if (name === 'NotFoundError') detail = 'No microphone found on this device.';
        else if (name === 'NotReadableError') detail = 'Mic is in use by another app or unavailable.';
        else if (name === 'SecurityError') detail = 'Browser blocked mic access — you might be on http:// instead of https://.';
        setErrorDetail(`${name}: ${detail}`);
        setPermission('denied');
      }
    };
    init();
    return () => {
      cancelled = true;
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      refTonesRef.current.forEach(t => { try { t.stop(); } catch {} });
      if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});
    };
  }, []);

  // Phase scheduler: when permission becomes granted (or note changes), kick off the listen phase.
  // The 'listen' phase plays the tone, then transitions to 'sing'. The 'sing' phase ends
  // after DURATION_MS, scores the note, advances to next.
  useEffect(() => {
    if (permission !== 'granted' || !active) return;
    let timer = null;

    // Phase 1: LISTEN — play the target note for DURATION_MS
    setPhase('listen');
    setSustainFill(0);
    const target = chord.notes[noteIdx];
    if (target) {
      playReferenceTone(target.freq, noteStateRef.current.DURATION_MS / 1000);
    }

    timer = setTimeout(() => {
      // Phase 2: SING — turn off tone, start accumulating
      setPhase('sing');
      const ns = noteStateRef.current;
      ns.inTuneTime = 0;
      ns.totalTime = 0;
      ns._lastTick = performance.now();

      timer = setTimeout(() => {
        // End of SING phase — score this note
        const ns2 = noteStateRef.current;
        const score = Math.min(1, ns2.inTuneTime / (ns2.DURATION_MS * 0.4));
        setNoteScores(prev => {
          const updated = [...prev];
          updated[noteIdxRef.current] = score;
          return updated;
        });
        chordScoresRef.current.push(score);

        // Advance to next note (or new chord)
        if (noteIdxRef.current < 2) {
          setNoteIdx(i => i + 1);
        } else {
          // Generate new chord using the configured voice range
          setChord(generateChord(resolveRoots()));
          setNoteIdx(0);
          setNoteScores([null, null, null]);
        }
      }, noteStateRef.current.DURATION_MS);
    }, noteStateRef.current.DURATION_MS);

    return () => {
      if (timer) clearTimeout(timer);
      // Stop any playing reference tones when phase changes
      refTonesRef.current.forEach(t => { try { t.stop(); } catch {} });
      refTonesRef.current = [];
    };
  }, [permission, active, chord, noteIdx]);

  // Pitch detection + accumulation loop (runs continuously while active, but only scores during 'sing')
  useEffect(() => {
    if (permission !== 'granted' || !active) return;
    let raf;
    let lastEval = performance.now();

    const tick = () => {
      const analyser = analyserRef.current;
      const buffer = bufferRef.current;
      if (!analyser || !buffer) { raf = requestAnimationFrame(tick); return; }

      analyser.getFloatTimeDomainData(buffer);
      const freq = detectPitch(buffer, audioCtxRef.current.sampleRate);
      setDetectedFreq(freq);

      const now = performance.now();

      // Only accumulate during 'sing' phase
      if (phaseRef.current === 'sing') {
        const ns = noteStateRef.current;
        const target = chordRef.current.notes[noteIdxRef.current];
        const dt = now - (ns._lastTick || now);
        ns._lastTick = now;
        ns.totalTime += dt;

        if (freq > 0 && target) {
          let cents = freqToCents(freq, target.freq);
          while (cents > 600) cents -= 1200;
          while (cents < -600) cents += 1200;
          if (Math.abs(cents) < 50) {
            ns.inTuneTime += dt;
          }
        }
        setSustainFill(Math.min(1, ns.inTuneTime / (ns.DURATION_MS * 0.4)));
      }

      // Periodically report accuracy
      if (now - lastEval > evaluateEveryMs) {
        lastEval = now;
        const scores = chordScoresRef.current;
        if (scores.length > 0) {
          const avg = scores.reduce((s, x) => s + x, 0) / scores.length;
          onAccuracyUpdate?.(avg, scores.length);
          chordScoresRef.current = scores.slice(-6);
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [permission, active, evaluateEveryMs]);

  // === RENDER ===
  if (permission === 'pending') {
    return (
      <div className="border-2 border-stone-800 bg-stone-900/50 p-6 text-center">
        <div className="text-amber-500 text-sm uppercase tracking-widest">Requesting mic...</div>
        <div className="text-xs text-stone-500 mt-2">Allow microphone access in your browser</div>
      </div>
    );
  }
  if (permission === 'denied' || permission === 'unsupported' || permission === 'insecure') {
    return (
      <div className="border-2 border-red-900 bg-red-950/30 p-4 text-left space-y-2">
        <div className="text-red-400 text-sm uppercase tracking-widest text-center">🎤 Mic unavailable</div>
        <div className="text-[11px] text-stone-400 leading-relaxed">{errorDetail || 'Could not access microphone.'}</div>
        {(permission === 'insecure' || permission === 'unsupported') && (
          <div className="text-[10px] text-stone-500 leading-relaxed border-t border-stone-800 pt-2 mt-2">
            <div className="text-amber-500 mb-1">How to fix:</div>
            Mobile browsers block mic access on <span className="font-mono">file://</span> URLs.
            Drag this HTML file onto <span className="font-mono">netlify.com/drop</span> from your computer to get an HTTPS link, then open that link on your phone.
          </div>
        )}
      </div>
    );
  }

  // Granted — render the tuner
  const target = chord.notes[noteIdx];
  let cents = 0;
  let isInTune = false;
  if (detectedFreq > 0 && target) {
    let c = freqToCents(detectedFreq, target.freq);
    while (c > 600) c -= 1200;
    while (c < -600) c += 1200;
    cents = c;
    isInTune = Math.abs(c) < 50;
  }
  // Clamp displayed needle to ±100 cents for visual clarity (in-tune zone is ±50, so it spans the middle half)
  const needleCents = Math.max(-100, Math.min(100, cents));
  const needlePos = (needleCents + 100) / 200; // 0..1

  return (
    <div className="border-2 border-stone-800 bg-stone-900/50 p-3 space-y-3">
      {/* Chord title */}
      <div className="text-center">
        <div className="text-xs uppercase tracking-[0.3em] text-stone-500">Listen, then repeat</div>
        <div className="text-amber-500 text-lg tracking-wider" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
          {chord.name}
        </div>
      </div>

      {/* Sequence dots */}
      <div className="flex justify-center gap-2">
        {chord.notes.map((n, i) => (
          <div key={i} className="flex flex-col items-center">
            <div className={`w-3 h-3 rounded-full border-2 transition-all ${
              i < noteIdx ? (noteScores[i] >= 0.7 ? 'bg-amber-500 border-amber-500' : noteScores[i] >= 0.3 ? 'bg-amber-700 border-amber-700' : 'bg-red-700 border-red-700') :
              i === noteIdx ? 'border-amber-500 animate-pulse' :
              'border-stone-700'
            }`} />
            <div className="text-[9px] text-stone-500 mt-1 font-mono">{n.name}</div>
          </div>
        ))}
      </div>

      {/* Phase indicator - big & obvious */}
      <div className={`text-center py-2 border-2 transition-all ${
        phase === 'listen' ? 'border-blue-500 bg-blue-500/10' : 'border-amber-500 bg-amber-500/10'
      }`}>
        <div className="text-[10px] uppercase tracking-[0.3em]" style={{ color: phase === 'listen' ? '#88AADD' : '#D4A017' }}>
          {phase === 'listen' ? '🔊 Listen' : '🎤 Your turn — sing it back'}
        </div>
        <div className="text-4xl font-black leading-none my-1" style={{
          fontFamily: '"Bebas Neue", "Oswald", sans-serif',
          color: phase === 'listen' ? '#88AADD' : '#D4A017',
        }}>
          {target?.name || '--'}
        </div>
        <div className="text-stone-500 text-[10px] font-mono">{target ? target.freq.toFixed(1) : '0'} Hz</div>
      </div>

      {/* Tuner needle - dimmed during listen phase */}
      <div className={`relative h-16 bg-stone-950 border-2 border-stone-800 overflow-hidden transition-opacity ${phase === 'listen' ? 'opacity-30' : 'opacity-100'}`}>
        {/* Tolerance zone — ±50 cents = middle 50% of the ±100 cent gauge. Looks generous on purpose. */}
        <div className="absolute top-0 bottom-0 bg-amber-500/15 border-l border-r border-amber-500/40" style={{ left: '25%', right: '25%' }} />
        {/* Center line (dim) */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-amber-500/20" />
        {/* Edge labels */}
        <div className="absolute top-1 left-2 text-[8px] text-stone-600 uppercase">flat</div>
        <div className="absolute top-1 right-2 text-[8px] text-stone-600 uppercase">sharp</div>
        <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[8px] text-amber-500 uppercase">in tune</div>
        {/* Needle */}
        {detectedFreq > 0 && phase === 'sing' && (
          <div className={`absolute top-6 bottom-2 w-1 transition-all duration-75 ${isInTune ? 'bg-amber-500' : 'bg-stone-300'}`}
            style={{ left: `${needlePos * 100}%`, transform: 'translateX(-50%)',
                     boxShadow: isInTune ? '0 0 12px #D4A017' : 'none' }} />
        )}
        {/* Cents readout */}
        {detectedFreq > 0 && phase === 'sing' && (
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-mono"
            style={{ color: isInTune ? '#D4A017' : '#a8a29e' }}>
            {cents > 0 ? '+' : ''}{cents.toFixed(0)}¢
          </div>
        )}
        {phase === 'sing' && detectedFreq < 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-stone-600 text-xs uppercase tracking-widest">
            sing now
          </div>
        )}
        {phase === 'listen' && (
          <div className="absolute inset-0 flex items-center justify-center text-stone-600 text-xs uppercase tracking-widest">
            playing reference tone...
          </div>
        )}
      </div>

      {/* Sustain meter */}
      <div className="space-y-1">
        <div className="flex justify-between text-[9px] uppercase text-stone-500 tracking-wider">
          <span>{phase === 'sing' ? 'Hold the note' : 'Get ready...'}</span>
          <span>{Math.round(sustainFill * 100)}%</span>
        </div>
        <div className="h-3 bg-stone-950 border border-stone-800 overflow-hidden">
          <div className="h-full transition-all duration-75"
            style={{ width: `${sustainFill * 100}%`, background: sustainFill >= 0.95 ? '#D4A017' : sustainFill >= 0.5 ? '#aa8000' : '#5a4030' }} />
        </div>
      </div>
    </div>
  );
};

// ============ BEATBOX HERO MINI-GAME ============
// Guitar-Hero style rhythm trainer for Technicality.
// 4 lanes (B/T/K/Pf), 4-bar patterns, alternating DEMO and PLAYER reps.
// Reports cumulative accuracy via onAccuracyUpdate; fires onLessonComplete on final-rep end.

// Lane order left-to-right
const HERO_LANES = ['B', 'T', 'K', 'Pf'];

// Each lesson is a 4-bar (16-beat) pattern. `beat` is in quarter-note units
// (0..15.999), so 0.5 = 8th-note offset, 0.25 = 16th-note offset.
const _patBoom = () => Array.from({ length: 16 }, (_, i) => ({ beat: i, sound: 'B' }));
const _patBackbeat = () => Array.from({ length: 16 }, (_, i) => ({ beat: i, sound: i % 2 === 0 ? 'B' : 'Pf' }));
const _patHat8ths = () => Array.from({ length: 32 }, (_, i) => ({ beat: i * 0.5, sound: 'T' }));
const _patKitGroove = () => {
  const p = [];
  for (let b = 0; b < 16; b++) {
    p.push({ beat: b, sound: b % 2 === 0 ? 'B' : 'Pf' });
    p.push({ beat: b + 0.5, sound: 'T' });
  }
  return p;
};
const _patWithRim = () => {
  const p = _patKitGroove();
  // Rimshot fills on the "e" of beat 4 each bar
  [3.75, 7.75, 11.75, 15.75].forEach(beat => p.push({ beat, sound: 'K' }));
  return p;
};
const _patSyncoKick = () => {
  const p = [];
  for (let bar = 0; bar < 4; bar++) {
    const off = bar * 4;
    p.push({ beat: off + 0,    sound: 'B'  });
    p.push({ beat: off + 1,    sound: 'Pf' });
    p.push({ beat: off + 1.75, sound: 'B'  });
    p.push({ beat: off + 2.5,  sound: 'B'  });
    p.push({ beat: off + 3,    sound: 'Pf' });
  }
  return p;
};
const _patOffbeatHat = () => {
  const p = [];
  for (let bar = 0; bar < 4; bar++) {
    const off = bar * 4;
    p.push({ beat: off + 0, sound: 'B'  });
    p.push({ beat: off + 1, sound: 'Pf' });
    p.push({ beat: off + 2, sound: 'B'  });
    p.push({ beat: off + 3, sound: 'Pf' });
    // Hats only on the offbeats ("ands")
    [0.5, 1.5, 2.5, 3.5].forEach(o => p.push({ beat: off + o, sound: 'T' }));
  }
  return p;
};
// Lessons 6-12: each introduces a catalog sound that must be owned to unlock.
// `lanes` overrides the default 4 lanes for that lesson; the K (rimshot) lane
// is typically swapped for the lesson's required sound.
const _patL6 = () => { // LIPROLL
  const p = [];
  for (let bar = 0; bar < 4; bar++) {
    const off = bar * 4;
    p.push({ beat: off + 0,    sound: 'B'        });
    p.push({ beat: off + 0.5,  sound: 'T'        });
    p.push({ beat: off + 1,    sound: 'Pf'       });
    p.push({ beat: off + 1.5,  sound: 'lip_roll' });
    p.push({ beat: off + 2,    sound: 'B'        });
    p.push({ beat: off + 2.5,  sound: 'T'        });
    p.push({ beat: off + 3,    sound: 'Pf'       });
    p.push({ beat: off + 3.5,  sound: 'lip_roll' });
  }
  return p;
};
const _patL7 = () => { // 808 THROAT
  const p = [];
  for (let bar = 0; bar < 4; bar++) {
    const off = bar * 4;
    p.push({ beat: off + 0,    sound: 'throat_kick' });
    p.push({ beat: off + 0.5,  sound: 'T' });
    p.push({ beat: off + 1,    sound: 'Pf' });
    p.push({ beat: off + 1.5,  sound: 'T' });
    p.push({ beat: off + 1.75, sound: 'throat_kick' });
    p.push({ beat: off + 2,    sound: 'throat_kick' });
    p.push({ beat: off + 2.5,  sound: 'T' });
    p.push({ beat: off + 3,    sound: 'Pf' });
    p.push({ beat: off + 3.5,  sound: 'T' });
  }
  return p;
};
const _patL8 = () => { // FAST HATS
  const p = [];
  for (let bar = 0; bar < 4; bar++) {
    const off = bar * 4;
    p.push({ beat: off + 0, sound: 'B' });
    p.push({ beat: off + 1, sound: 'Pf' });
    p.push({ beat: off + 2, sound: 'B' });
    p.push({ beat: off + 3, sound: 'Pf' });
    for (let i = 0; i < 8; i++) p.push({ beat: off + i * 0.5, sound: 'fast_hats' });
  }
  return p;
};
const _patL9 = () => { // INWARD K SNARE
  const p = [];
  for (let bar = 0; bar < 4; bar++) {
    const off = bar * 4;
    p.push({ beat: off + 0, sound: 'B' });
    p.push({ beat: off + 1, sound: 'inward_k' });
    p.push({ beat: off + 2, sound: 'B' });
    p.push({ beat: off + 3, sound: 'inward_k' });
    for (let i = 0; i < 8; i++) p.push({ beat: off + i * 0.5, sound: 'T' });
    p.push({ beat: off + 0.75, sound: 'K' });
    p.push({ beat: off + 2.75, sound: 'K' });
  }
  return p;
};
const _patL10 = () => { // INWARD BASS
  const p = [];
  for (let bar = 0; bar < 4; bar++) {
    const off = bar * 4;
    p.push({ beat: off + 0,    sound: 'inward_bass' });
    p.push({ beat: off + 1,    sound: 'Pf' });
    p.push({ beat: off + 1.75, sound: 'inward_bass' });
    p.push({ beat: off + 2,    sound: 'inward_bass' });
    p.push({ beat: off + 3,    sound: 'Pf' });
    for (let i = 0; i < 8; i++) p.push({ beat: off + i * 0.5, sound: 'T' });
  }
  return p;
};
const _patL11 = () => { // CLICK ROLL
  const p = [];
  for (let bar = 0; bar < 4; bar++) {
    const off = bar * 4;
    p.push({ beat: off + 0, sound: 'B' });
    p.push({ beat: off + 1, sound: 'Pf' });
    p.push({ beat: off + 2, sound: 'B' });
    p.push({ beat: off + 3, sound: 'Pf' });
    for (let i = 0; i < 8; i++) p.push({ beat: off + i * 0.5, sound: 'T' });
    p.push({ beat: off + 3.5, sound: 'click_roll' });
  }
  return p;
};
const _patL12 = () => { // UVULAR FINALE
  const p = [];
  for (let bar = 0; bar < 4; bar++) {
    const off = bar * 4;
    p.push({ beat: off + 0,    sound: 'uvular_roll' });
    p.push({ beat: off + 1,    sound: 'inward_bass' });
    p.push({ beat: off + 1.75, sound: 'click_roll'  });
    p.push({ beat: off + 2,    sound: 'uvular_roll' });
    p.push({ beat: off + 2.5,  sound: 'click_roll'  });
    p.push({ beat: off + 3,    sound: 'inward_bass' });
    p.push({ beat: off + 3.75, sound: 'click_roll'  });
    for (let i = 0; i < 8; i++) p.push({ beat: off + i * 0.5, sound: 'fast_hats' });
  }
  return p;
};

const HERO_LESSONS = [
  // Lessons 1-5 use only the 4 hero sounds (always unlocked by progression)
  { name: 'BOOM BASIC',   desc: 'Kick on every beat',            tier: 1, pattern: _patBoom() },
  { name: 'BACKBEAT',     desc: 'Kick on 1 & 3, snare on 2 & 4', tier: 1, pattern: _patBackbeat() },
  { name: 'HI-HAT 8THS',  desc: 'Hat on every 8th note',         tier: 1, pattern: _patHat8ths() },
  { name: 'KIT GROOVE',   desc: 'Boom + snare + 8th hats',       tier: 2, pattern: _patKitGroove() },
  { name: 'WITH RIMSHOT', desc: 'Kit groove + rim accents',      tier: 2, pattern: _patWithRim() },
  // Lessons 6-12 each gate on owning a specific catalog sound (buy it in the shop).
  { name: 'LIP ROLL DRILL', desc: 'Lip rolls on the offbeats',    tier: 2,
    requires: 'lip_roll',    lanes: ['B', 'T', 'lip_roll', 'Pf'],     pattern: _patL6() },
  { name: '808 THROAT',     desc: 'Heavy throat-kick groove',     tier: 2,
    requires: 'throat_kick', lanes: ['throat_kick', 'T', 'K', 'Pf'],  pattern: _patL7() },
  { name: 'FAST HATS',      desc: 'TKs doubling the hi-hat lane', tier: 2,
    requires: 'fast_hats',   lanes: ['B', 'fast_hats', 'K', 'Pf'],    pattern: _patL8() },
  { name: 'INWARD SNARE',   desc: 'Alternate snare voice',        tier: 2,
    requires: 'inward_k',    lanes: ['B', 'T', 'K', 'inward_k'],      pattern: _patL9() },
  { name: 'INWARD BASS',    desc: 'Deep inward bass kick',        tier: 3,
    requires: 'inward_bass', lanes: ['inward_bass', 'T', 'K', 'Pf'],  pattern: _patL10() },
  { name: 'CLICK ROLL',     desc: 'Click roll fills',             tier: 3,
    requires: 'click_roll',  lanes: ['B', 'T', 'click_roll', 'Pf'],   pattern: _patL11() },
  { name: 'UVULAR FINALE',  desc: 'All four advanced sounds',     tier: 4,
    requires: 'uvular_roll', lanes: ['uvular_roll', 'fast_hats', 'click_roll', 'inward_bass'],
    pattern: _patL12() },
];

// ============ MIC BEATBOX DETECTOR ============
// Listens through the mic, runs onset detection, and classifies each transient
// into one of the 4 hero keys (B/T/K/Pf) via a simple frequency-band heuristic.
// Calls onHit(key) when it registers a hit. Used by Beatbox Hero in mic mode.

const MicBeatboxDetector = ({ active, paused = false, onHit }) => {
  const [permission, setPermission] = useState('idle'); // 'idle'|'requesting'|'granted'|'denied'|'insecure'
  const [errorDetail, setErrorDetail] = useState('');
  const [level, setLevel] = useState(0);
  const [lastDetected, setLastDetected] = useState(null);
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  const lastDetectedAtRef = useRef(0);
  const onHitRef = useRef(onHit);
  useEffect(() => { onHitRef.current = onHit; }, [onHit]);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let stream = null;
    let mounted = true;
    let lastOnsetMs = 0;
    let recentRms = 0;
    const cooldownMs = 80;
    const onsetFloor = 0.04;

    (async () => {
      if (typeof window !== 'undefined' && window.isSecureContext === false) {
        setPermission('insecure'); setErrorDetail('Mic requires HTTPS.');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setPermission('denied'); setErrorDetail('Mic API unavailable.');
        return;
      }
      setPermission('requesting');
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        });
      } catch (e) {
        setPermission('denied'); setErrorDetail((e && e.message) || 'Mic permission denied.');
        return;
      }
      if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
      const ctx = getAudioCtx();
      if (!ctx) { setPermission('denied'); setErrorDetail('No audio context.'); return; }
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0;
      src.connect(analyser);
      setPermission('granted');

      const fftSize = analyser.fftSize;
      const sampleRate = ctx.sampleRate;
      const binHz = sampleRate / fftSize;
      const timeBuf = new Float32Array(fftSize);
      const freqBuf = new Uint8Array(analyser.frequencyBinCount);
      const energyInBand = (lo, hi) => {
        const a = Math.max(0, Math.floor(lo / binHz));
        const b = Math.min(freqBuf.length, Math.ceil(hi / binHz));
        let s = 0;
        for (let i = a; i < b; i++) s += freqBuf[i];
        return s / Math.max(1, b - a);
      };

      const tick = () => {
        analyser.getFloatTimeDomainData(timeBuf);
        let sumSq = 0;
        for (let i = 0; i < timeBuf.length; i++) sumSq += timeBuf[i] * timeBuf[i];
        const rms = Math.sqrt(sumSq / timeBuf.length);
        if (mounted) setLevel(rms);

        const now = performance.now();
        // Slow-moving noise floor; gate triggers at max(static floor, 2× ambient)
        recentRms = recentRms * 0.95 + rms * 0.05;
        const dynThresh = Math.max(onsetFloor, recentRms * 2);

        // Skip classification while paused (e.g. during DEMO phase, so the demo
        // notes the game just played don't get picked up by the mic and trigger
        // a feedback loop).
        if (pausedRef.current) {
          raf = requestAnimationFrame(tick);
          return;
        }

        if (rms > dynThresh && now - lastOnsetMs > cooldownMs) {
          lastOnsetMs = now;
          analyser.getByteFrequencyData(freqBuf);
          const subBass  = energyInBand(40, 150);
          const lowMid   = energyInBand(150, 500);
          const mid      = energyInBand(500, 2000);
          const high     = energyInBand(2000, 6000);
          const veryHigh = energyInBand(6000, 14000);
          const total = subBass + lowMid + mid + high + veryHigh;
          if (total > 8) {
            // Normalize the observed band energies to a probability distribution,
            // then pick the key whose ideal profile is most similar (cosine).
            const obs = [subBass / total, lowMid / total, mid / total, high / total, veryHigh / total];
            // Per-key profiles: [subBass, lowMid, mid, high, veryHigh]
            const PROFILES = {
              B:  [0.46, 0.34, 0.15, 0.04, 0.01], // kick — dominant sub + low-mid
              K:  [0.05, 0.18, 0.45, 0.22, 0.10], // rim/tongue click — mid-tonal
              Pf: [0.04, 0.10, 0.22, 0.46, 0.18], // snare — bright noise centered in high
              T:  [0.03, 0.07, 0.16, 0.30, 0.44], // hi-hat — dominant very-high
            };
            const cosSim = (a, b) => {
              let dot = 0, na = 0, nb = 0;
              for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
              return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
            };
            let bestKey = 'K', bestSim = -Infinity;
            for (const k of Object.keys(PROFILES)) {
              const s = cosSim(obs, PROFILES[k]);
              if (s > bestSim) { bestSim = s; bestKey = k; }
            }
            if (mounted) {
              setLastDetected(bestKey);
              lastDetectedAtRef.current = now;
            }
            onHitRef.current?.(bestKey);
          }
        }

        // Clear the "detected" label after 400ms
        if (lastDetected && now - lastDetectedAtRef.current > 400 && mounted) {
          setLastDetected(null);
        }

        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    })();

    return () => {
      mounted = false;
      if (raf) cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const meterColor = level < 0.04 ? '#84cc16' : level < 0.15 ? '#fbbf24' : '#ef4444';
  const meterPct = Math.min(100, level * 250);
  const detectedMeta = lastDetected ? HERO_SOUNDS[lastDetected] : null;

  return (
    <div className="space-y-1.5 border-2 border-stone-800 bg-stone-900/40 p-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-stone-500">
          🎤 {permission === 'granted' ? (paused ? 'paused — demo playing' : 'listening') :
              permission === 'requesting' ? 'requesting mic…' :
              permission === 'denied' ? 'mic denied' :
              permission === 'insecure' ? 'needs https' : 'idle'}
        </span>
        {detectedMeta && (
          <span className="text-[10px] tracking-widest" style={{ color: detectedMeta.color }}>
            {detectedMeta.label} · {detectedMeta.name.toUpperCase()}
          </span>
        )}
      </div>
      {permission === 'granted' && (
        <div className="h-2 bg-stone-950 border border-stone-800 overflow-hidden">
          <div className="h-full transition-all duration-75"
            style={{ width: `${meterPct}%`, background: meterColor }} />
        </div>
      )}
      {(permission === 'denied' || permission === 'insecure') && errorDetail && (
        <div className="text-[10px] text-red-400 uppercase tracking-wider">{errorDetail}</div>
      )}
    </div>
  );
};

const BeatboxHero = ({
  onAccuracyUpdate,
  onLessonComplete,
  evaluateEveryMs = 2500,
  active = true,
  bpm = 90,
  lessonIdx = 0,
  mode = 'practice', // 'practice' = 4 reps demo/player loop; 'battle' = single player rep, no auto-restart
  inputMode = 'tap', // 'tap' = drum pads; 'mic' = beatbox into the mic (wider hit windows)
}) => {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const [, forceRender] = useState(0);
  const rerender = () => forceRender(n => (n + 1) & 0xffff);

  // Latest props mirrored to refs (so the rAF loop reads fresh values without needing dep changes)
  const bpmRef = useRef(bpm);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  const lessonIdxRef = useRef(lessonIdx);
  useEffect(() => { lessonIdxRef.current = lessonIdx; }, [lessonIdx]);

  // Constants — wider hit windows in mic mode to compensate for ~50–100 ms
  // detection latency.
  const HIT_PERFECT_MS = inputMode === 'mic' ? 200 : 110;
  const HIT_GOOD_MS    = inputMode === 'mic' ? 350 : 180;
  const LOOKAHEAD_MS = 1400; // notes appear ~1.4s before the strike line (was 2000)
  const REPS_TOTAL = (mode === 'battle' || mode === 'spectate') ? 1 : 4; // single rep in battle/spectate, 2 demo+2 player in practice
  const COMPLETE_HOLD_MS = 1800;

  // Visual constants — shorter than before so the canvas fits above the fold
  const TRACK_W = 320;
  const TRACK_H = mode === 'practice' ? 260 : 220;
  const STRIKE_Y = TRACK_H - 56;
  const LANE_W = TRACK_W / 4;
  const PIXELS_PER_SEC = STRIKE_Y / (LOOKAHEAD_MS / 1000);

  const initState = (config) => {
    const lesson = HERO_LESSONS[config.lessonIdx] || HERO_LESSONS[0];
    const lanes = lesson.lanes || HERO_LANES;
    const beatMs = 60000 / config.bpm;
    const patternMs = 16 * beatMs;

    const notes = [];
    for (let rep = 0; rep < REPS_TOTAL; rep++) {
      // Practice mode alternates demo/player; battle = player; spectate = demo
      const isDemo = (mode === 'practice' && rep % 2 === 0) || mode === 'spectate';
      const repStart = rep * patternMs;
      lesson.pattern.forEach((n, i) => {
        const lane = lanes.indexOf(n.sound);
        notes.push({
          id: `r${rep}n${i}`,
          time: repStart + n.beat * beatMs,
          sound: n.sound,
          lane: lane >= 0 ? lane : 0,
          isDemo,
          rep,
          hit: false,
          judged: false,
          hitTime: 0,
          hitGrade: null,
        });
      });
    }

    const laneFlash = {};
    lanes.forEach(k => { laneFlash[k] = 0; });

    return {
      lesson,
      lessonIdx: config.lessonIdx,
      bpm: config.bpm,
      lanes,
      beatMs,
      patternMs,
      totalMs: REPS_TOTAL * patternMs,
      notes,
      // Shift start by LOOKAHEAD_MS so notes spawn at the top of the canvas
      // and scroll down to the strike line — instead of appearing already at it.
      startTime: performance.now() + LOOKAHEAD_MS,
      hits: 0,
      misses: 0,
      perfects: 0,
      laneFlash,
      audioScheduled: new Set(),
      phase: mode === 'battle' ? 'player' : 'demo',
      completeAt: 0,
      completionFired: false,
      mode,
    };
  };

  const handleTap = (sound) => {
    const state = stateRef.current;
    if (!state) return;
    const now = performance.now();
    const songT = now - state.startTime;
    const lane = state.lanes.indexOf(sound);

    // In mic mode the player is the audio source — playing back the matched
    // sound through the speakers would feed back into the mic.
    if (inputMode !== 'mic') playGameSound(sound);
    state.laneFlash[sound] = now;

    if (state.phase !== 'player') { rerender(); return; }

    let bestIdx = -1;
    let bestDelta = Infinity;
    for (let i = 0; i < state.notes.length; i++) {
      const n = state.notes[i];
      if (n.judged || n.isDemo) continue;
      if (n.lane !== lane) continue;
      const delta = Math.abs(n.time - songT);
      if (delta < bestDelta && delta <= HIT_GOOD_MS) {
        bestDelta = delta;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      const n = state.notes[bestIdx];
      n.hit = true;
      n.judged = true;
      n.hitTime = now;
      const isPerfect = bestDelta <= HIT_PERFECT_MS;
      n.hitGrade = isPerfect ? 'perfect' : 'good';
      state.hits++;
      if (isPerfect) state.perfects++;
    } else {
      // Stray tap — no note in this lane near the strike line. Count it as a
      // miss so spamming all four pads drops the accuracy.
      state.misses++;
    }
    rerender();
  };

  // Track latest active flag for the rAF loop to read without re-mounting
  const activeRef = useRef(active);

  // When active flips on (e.g. round starts after a countdown), restart the song state
  useEffect(() => {
    activeRef.current = active;
    if (active && stateRef.current) {
      const s = stateRef.current;
      s.startTime = performance.now() + LOOKAHEAD_MS;
      s.hits = 0;
      s.misses = 0;
      s.perfects = 0;
      s.audioScheduled = new Set();
      s.completionFired = false;
      s.completeAt = 0;
      s.phase = mode === 'practice' ? 'demo' : (mode === 'spectate' ? 'demo' : 'player');
      s.notes.forEach(n => { n.hit = false; n.judged = false; n.hitTime = 0; n.hitGrade = null; });
      rerender();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Main loop — runs once per lesson, draws every frame whether active or not.
  useEffect(() => {
    const ctx = getAudioCtx();
    if (ctx?.state === 'suspended') ctx.resume().catch(() => {});

    stateRef.current = initState({ bpm: bpmRef.current, lessonIdx });
    rerender();

    let raf = 0;

    const drawCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const c = canvas.getContext('2d');
      const state = stateRef.current;
      if (!state) return;
      const now = performance.now();
      const songT = now - state.startTime;

      c.fillStyle = '#0c0a09';
      c.fillRect(0, 0, TRACK_W, TRACK_H);

      // Lane backgrounds
      for (let i = 0; i < 4; i++) {
        c.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)';
        c.fillRect(i * LANE_W, 0, LANE_W, TRACK_H);
      }
      // Lane separators
      c.fillStyle = '#1c1917';
      for (let i = 1; i < 4; i++) c.fillRect(i * LANE_W, 0, 1, TRACK_H);

      // Lane flash overlay (~120ms fade)
      state.lanes.forEach((sound, i) => {
        const age = now - (state.laneFlash[sound] || 0);
        if (age < 120) {
          const meta = getSoundDisplay(sound);
          c.globalAlpha = (1 - age / 120) * 0.30;
          c.fillStyle = meta?.color || '#D4A017';
          c.fillRect(i * LANE_W, 0, LANE_W, TRACK_H);
          c.globalAlpha = 1;
        }
      });

      // Strike line
      c.fillStyle = 'rgba(212, 160, 23, 0.12)';
      c.fillRect(0, STRIKE_Y - 14, TRACK_W, 28);
      c.fillStyle = '#D4A017';
      c.fillRect(0, STRIKE_Y - 2, TRACK_W, 4);

      // Notes
      state.notes.forEach(n => {
        const dt = n.time - songT;
        const y = STRIKE_Y - dt * PIXELS_PER_SEC / 1000;
        if (y < -40 || y > TRACK_H + 40) return;

        const x = n.lane * LANE_W;
        const meta = getSoundDisplay(n.sound) || { color: '#D4A017', label: '?' };

        // Hit splash
        if (n.hit && (now - n.hitTime) < 260) {
          const a = (now - n.hitTime) / 260;
          c.globalAlpha = 1 - a;
          c.fillStyle = n.hitGrade === 'perfect' ? '#D4A017' : '#22d3ee';
          c.fillRect(x + 2, STRIKE_Y - 16, LANE_W - 4, 32);
          c.globalAlpha = 1;
          return;
        }
        if (n.judged) return;

        const pad = 4;
        const noteH = 24;
        if (n.isDemo) {
          c.globalAlpha = 0.18;
          c.fillStyle = meta.color;
          c.fillRect(x + pad, y - noteH / 2, LANE_W - pad * 2, noteH);
          c.globalAlpha = 0.8;
          c.strokeStyle = meta.color;
          c.lineWidth = 2;
          c.strokeRect(x + pad, y - noteH / 2, LANE_W - pad * 2, noteH);
          c.globalAlpha = 1;
        } else {
          c.fillStyle = meta.color;
          c.fillRect(x + pad, y - noteH / 2, LANE_W - pad * 2, noteH);
          c.fillStyle = 'rgba(255,255,255,0.30)';
          c.fillRect(x + pad, y - noteH / 2, LANE_W - pad * 2, 4);
          c.fillStyle = 'rgba(0,0,0,0.65)';
          c.font = 'bold 11px monospace';
          c.textAlign = 'center';
          c.fillText(meta.label, x + LANE_W / 2, y + 4);
        }
      });

      // Phase banner — skipped on battle/spectate completion (no celebratory text)
      const inactiveLabel = mode === 'spectate' ? 'STARTING SOON' : 'GET READY';
      const phaseLabel = !activeRef.current               ? inactiveLabel
                       : state.phase === 'complete'        ? (mode === 'practice' ? 'LESSON COMPLETE' : null)
                       : state.phase === 'demo'            ? (mode === 'spectate' ? 'OPPONENT · WATCH' : 'DEMO · LISTEN')
                                                           : 'YOUR TURN';
      if (phaseLabel) {
        const phaseColor = !activeRef.current               ? '#a8a29e'
                         : state.phase === 'complete'        ? '#22c55e'
                         : state.phase === 'demo'            ? '#22d3ee'
                                                             : '#D4A017';
        c.fillStyle = phaseColor;
        c.font = 'bold 14px "Bebas Neue", "Oswald", sans-serif';
        c.textAlign = 'center';
        c.fillText(phaseLabel, TRACK_W / 2, 22);
      }
    };

    const tick = () => {
      const state = stateRef.current;
      if (!state) { raf = requestAnimationFrame(tick); return; }

      // When inactive (e.g. during a countdown before a player round), just paint the
      // canvas with empty lanes + a "READY" banner so buttons + lanes are pre-visible.
      if (!activeRef.current) {
        drawCanvas();
        raf = requestAnimationFrame(tick);
        return;
      }

      const now = performance.now();
      const songT = now - state.startTime;

      // Phase transitions
      if (songT >= state.totalMs && state.phase !== 'complete') {
        state.phase = 'complete';
        state.completeAt = now;
        const total = state.hits + state.misses;
        const finalAcc = total > 0 ? state.hits / total : 0;
        if (!state.completionFired) {
          state.completionFired = true;
          onLessonComplete?.(state.lessonIdx, finalAcc);
        }
        rerender();
      } else if (state.phase !== 'complete') {
        const repIdx = Math.floor(songT / state.patternMs);
        // Battle mode: always 'player'. Practice: alternate demo/player.
        const newPhase = mode === 'battle'   ? 'player'
                       : mode === 'spectate' ? 'demo'
                       : (repIdx % 2 === 0 ? 'demo' : 'player');
        if (newPhase !== state.phase) {
          state.phase = newPhase;
          rerender();
        }
      }

      // Auto-restart after celebration hold (practice only — battle stays on completion)
      if (mode === 'practice' && state.phase === 'complete' && now - state.completeAt > COMPLETE_HOLD_MS) {
        stateRef.current = initState({ bpm: bpmRef.current, lessonIdx: lessonIdxRef.current });
        rerender();
        raf = requestAnimationFrame(tick);
        return;
      }

      // Auto-miss player notes that passed without being hit
      for (let i = 0; i < state.notes.length; i++) {
        const n = state.notes[i];
        if (n.judged || n.hit || n.isDemo) continue;
        if (n.time + HIT_GOOD_MS < songT) {
          n.judged = true;
          state.misses++;
        }
      }

      // Fire demo sounds at strike-line crossing
      for (let i = 0; i < state.notes.length; i++) {
        const n = state.notes[i];
        if (!n.isDemo) continue;
        if (state.audioScheduled.has(n.id)) continue;
        if (n.time > songT) continue;
        if (songT - n.time < 200) {
          playGameSound(n.sound);
          state.laneFlash[n.sound] = now;
        }
        state.audioScheduled.add(n.id);
      }

      drawCanvas();
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    const evalInt = setInterval(() => {
      if (!activeRef.current) return;
      const state = stateRef.current;
      if (!state) return;
      const total = state.hits + state.misses;
      if (total === 0) return;
      onAccuracyUpdate?.(state.hits / total, state.hits, total);
    }, evaluateEveryMs);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(evalInt);
    };
    // active toggles via activeRef without re-mount; bpm snapshotted at lesson start
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonIdx]);

  const state = stateRef.current;
  const totalJudged = state ? (state.hits + state.misses) : 0;
  const accuracyPct = totalJudged > 0 ? Math.round((state.hits / totalJudged) * 100) : 0;
  const phaseLabel = state?.phase === 'complete' ? 'COMPLETE'
                   : state?.phase === 'player'   ? 'YOUR TURN'
                                                 : 'DEMO';

  return (
    <div className="space-y-2">
      <canvas ref={canvasRef}
        width={TRACK_W} height={TRACK_H}
        className="w-full block border-2 border-stone-800"
        style={{ aspectRatio: `${TRACK_W} / ${TRACK_H}`, background: '#0c0a09', imageRendering: 'auto' }} />

      {/* Mic detector replaces the drum pads when inputMode === 'mic' */}
      {mode !== 'spectate' && inputMode === 'mic' && (
        <MicBeatboxDetector
          active={active}
          paused={state?.phase !== 'player'}
          onHit={handleTap} />
      )}

      {/* Drum buttons — hidden in spectate mode (player can't tap) and in mic mode */}
      {mode !== 'spectate' && inputMode !== 'mic' && (
        <div className="grid grid-cols-4 gap-1">
          {(state?.lanes || HERO_LANES).map((sound, idx) => {
            const meta = getSoundDisplay(sound) || { color: '#D4A017', label: '?' };
            return (
              <button key={sound + idx}
                onPointerDown={(e) => { e.preventDefault(); handleTap(sound); }}
                className="py-5 border-2 active:scale-95 transition-transform select-none touch-none"
                style={{
                  borderColor: meta.color,
                  background: `${meta.color}1f`,
                  color: meta.color,
                  fontFamily: '"Bebas Neue", "Oswald", sans-serif',
                  fontSize: 22,
                  letterSpacing: '0.15em',
                }}>
                {meta.label}
              </button>
            );
          })}
        </div>
      )}

      {/* HUD — only when player is the one tapping */}
      {mode !== 'spectate' && (
        <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-stone-500 px-1">
          <span><span className="text-amber-500">{phaseLabel}</span></span>
          <span>HITS <span className="text-amber-500">{state?.hits || 0}</span> · MISS <span className="text-red-500">{state?.misses || 0}</span></span>
          <span>ACC <span className="text-amber-500">{accuracyPct}%</span></span>
        </div>
      )}
    </div>
  );
};

// ============ ORIGINALITY SEQUENCER ============
// 16-step beat sequencer used during originality training. Tracks are dynamic —
// 4 hero sounds by default, plus any owned catalog sounds. Plays in a loop while
// active and reports a "creativity" score (0..1) every evaluateEveryMs so the
// parent's onReward can scale ori stat gain.
// Pattern persists per-character via char.oriPattern.

const SEQ_STEPS = 16;
const SEQ_SLOTS = 4;

// Helper for cell arrays
const _cells = (arr) => { const c = Array(SEQ_STEPS).fill(false); arr.forEach(i => { if (i >= 0 && i < SEQ_STEPS) c[i] = true; }); return c; };

// Four built-in starter patterns. Player can edit any of them; each slot
// persists independently on char.oriSlots[idx].
const _seqStarter = (i) => {
  if (i === 0) return { name: 'Boom Bap', tracks: [
    { key: 'B',  cells: _cells([0, 8]) },
    { key: 'Pf', cells: _cells([4, 12]) },
    { key: 'T',  cells: _cells([0, 2, 4, 6, 8, 10, 12, 14]) },
    { key: 'K',  cells: Array(SEQ_STEPS).fill(false) },
  ]};
  if (i === 1) return { name: '4 on Floor', tracks: [
    { key: 'B',  cells: _cells([0, 4, 8, 12]) },
    { key: 'Pf', cells: _cells([4, 12]) },
    { key: 'T',  cells: _cells([2, 6, 10, 14]) },
    { key: 'K',  cells: Array(SEQ_STEPS).fill(false) },
  ]};
  if (i === 2) return { name: 'Half-Time', tracks: [
    { key: 'B',  cells: _cells([0, 6]) },
    { key: 'Pf', cells: _cells([8]) },
    { key: 'T',  cells: _cells([0, 2, 4, 6, 8, 10, 12, 14]) },
    { key: 'K',  cells: _cells([10, 14]) },
  ]};
  return { name: 'Empty', tracks: [
    { key: 'B',  cells: Array(SEQ_STEPS).fill(false) },
    { key: 'Pf', cells: Array(SEQ_STEPS).fill(false) },
    { key: 'T',  cells: Array(SEQ_STEPS).fill(false) },
    { key: 'K',  cells: Array(SEQ_STEPS).fill(false) },
  ]};
};
const _seqDefault = () => _seqStarter(0); // back-compat with old single-pattern call sites
const _seqDefaultSlots = () => Array.from({ length: SEQ_SLOTS }, (_, i) => _seqStarter(i));

const Sequencer = ({
  onCreativityUpdate,
  evaluateEveryMs = 2500,
  active = true,
  bpm = 100,
  pattern = null,
  slots = null,        // array of patterns, one per save slot
  slotIdx = 0,         // currently selected save slot
  ownedSounds = [],
  onPatternChange,     // (pattern) => void — writes to the active slot
  onSlotChange,        // (idx) => void — switches active slot
  onBpmChange,
}) => {
  // Active pattern for editing — derive from slots[slotIdx] or fall back to legacy pattern prop
  const activePattern = (slots && slots[slotIdx])
    || (pattern && Array.isArray(pattern.tracks) && pattern.tracks.length > 0 ? pattern : null)
    || _seqDefault();
  const [workPattern, setWorkPattern] = useState(activePattern);
  // When slot changes (or active pattern changes externally), refresh local state
  useEffect(() => {
    setWorkPattern(activePattern);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotIdx]);
  const [currentStep, setCurrentStep] = useState(-1);
  const [showAddTrack, setShowAddTrack] = useState(false);

  const stepRef = useRef(-1);
  const intervalRef = useRef(null);
  const patternRef = useRef(workPattern);
  useEffect(() => { patternRef.current = workPattern; }, [workPattern]);
  const bpmRef = useRef(bpm);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);

  const computeCreativity = () => {
    const tracks = patternRef.current?.tracks || [];
    let activeCells = 0, usedSounds = 0;
    tracks.forEach(t => {
      const c = t.cells.filter(Boolean).length;
      if (c > 0) usedSounds++;
      activeCells += c;
    });
    const variety = Math.min(1, usedSounds / 4) * 0.5;
    const density = Math.min(1, activeCells / 24) * 0.5;
    return variety + density;
  };

  // Playback loop — restarts when active or bpm changes
  useEffect(() => {
    if (!active) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      stepRef.current = -1;
      setCurrentStep(-1);
      return;
    }
    const ctx = getAudioCtx();
    if (ctx?.state === 'suspended') ctx.resume().catch(() => {});

    const tick = () => {
      stepRef.current = (stepRef.current + 1) % SEQ_STEPS;
      setCurrentStep(stepRef.current);
      const tracks = patternRef.current?.tracks || [];
      tracks.forEach(t => {
        if (t.cells[stepRef.current]) playGameSound(t.key);
      });
    };
    const stepMs = 60000 / Math.max(40, bpmRef.current) / 4;
    intervalRef.current = setInterval(tick, stepMs);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); intervalRef.current = null; };
  }, [active, bpm]);

  // Periodic creativity reporting
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => onCreativityUpdate?.(computeCreativity()), evaluateEveryMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, evaluateEveryMs]);

  const updatePattern = (mut) => {
    setWorkPattern(p => {
      const next = mut(p);
      onPatternChange?.(next);
      return next;
    });
  };

  const toggleCell = (trackIdx, step) => {
    updatePattern(p => ({
      ...p,
      tracks: p.tracks.map((t, i) => i === trackIdx
        ? { ...t, cells: t.cells.map((c, j) => j === step ? !c : c) }
        : t),
    }));
  };
  const addTrack = (key) => {
    updatePattern(p => p.tracks.some(t => t.key === key)
      ? p
      : ({ ...p, tracks: [...p.tracks, { key, cells: Array(SEQ_STEPS).fill(false) }] }));
    setShowAddTrack(false);
  };
  const removeTrack = (trackIdx) => {
    updatePattern(p => ({ ...p, tracks: p.tracks.filter((_, i) => i !== trackIdx) }));
  };
  const clearPattern = () => {
    updatePattern(p => ({ ...p, tracks: p.tracks.map(t => ({ ...t, cells: Array(SEQ_STEPS).fill(false) })) }));
  };

  const usedKeys = new Set(workPattern.tracks.map(t => t.key));
  const heroDefaults = new Set(Object.values(HERO_SOUNDS).map(m => m.defaultSound).filter(Boolean));
  const availableSounds = [
    ...Object.keys(HERO_SOUNDS),
    ...ownedSounds.filter(k => !HERO_SOUNDS[k] && SOUND_CATALOG[k] && !heroDefaults.has(k)),
  ].filter(k => !usedKeys.has(k));

  const activeCells = workPattern.tracks.reduce((a, t) => a + t.cells.filter(Boolean).length, 0);

  return (
    <div className="space-y-2">
      {/* Slot picker — 4 patterns saved per character */}
      {slots && (
        <div className="flex items-center gap-1">
          <span className="text-[9px] uppercase tracking-widest text-stone-500 mr-1">Slot</span>
          {Array.from({ length: SEQ_SLOTS }).map((_, i) => {
            const s = slots[i];
            const selected = i === slotIdx;
            const label = s?.name || `Slot ${i + 1}`;
            return (
              <button key={i}
                onPointerDown={(e) => { e.preventDefault(); onSlotChange?.(i); }}
                className={`flex-1 px-1.5 py-1 border-2 text-[9px] uppercase tracking-widest whitespace-nowrap overflow-hidden transition-all ${
                  selected ? 'border-amber-500 bg-amber-500/10 text-amber-500' :
                            'border-stone-700 text-stone-400 hover:border-amber-500/50'
                }`}>
                <div className="text-amber-500/70 leading-tight" style={{ fontSize: 9 }}>#{i + 1}</div>
                <div className="leading-tight truncate">{label}</div>
              </button>
            );
          })}
        </div>
      )}

      {/* Step grid */}
      <div className="space-y-1">
        {workPattern.tracks.map((track, trackIdx) => {
          const meta = getSoundDisplay(track.key);
          if (!meta) return null;
          return (
            <div key={track.key + trackIdx} className="flex items-center gap-1">
              <div className="w-14 flex-shrink-0 flex items-center gap-0.5">
                <button onPointerDown={(e) => { e.preventDefault(); removeTrack(trackIdx); }}
                  className="text-stone-600 text-sm hover:text-red-500 px-1 leading-none">×</button>
                <div className="flex-1 h-7 border flex items-center justify-center text-[10px] font-mono"
                  style={{ borderColor: meta.color, color: meta.color, background: `${meta.color}15` }}
                  title={meta.name}>
                  {meta.label}
                </div>
              </div>
              <div className="flex gap-[2px] flex-1">
                {track.cells.map((on, step) => {
                  const isCurrent = step === currentStep;
                  const isBeat = step % 4 === 0;
                  return (
                    <button key={step}
                      onPointerDown={(e) => { e.preventDefault(); toggleCell(trackIdx, step); }}
                      className={`flex-1 h-7 border transition-colors ${
                        isCurrent ? 'ring-1 ring-amber-500' : ''
                      }`}
                      style={on
                        ? { borderColor: meta.color, background: meta.color }
                        : { borderColor: isBeat ? '#44403c' : '#292524', background: isBeat ? '#1c1917' : '#0c0a09' }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add-track UI */}
      {availableSounds.length > 0 && (
        !showAddTrack ? (
          <button onPointerDown={(e) => { e.preventDefault(); setShowAddTrack(true); }}
            className="w-full py-1.5 border-2 border-dashed border-stone-700 text-stone-500 text-[10px] uppercase tracking-widest hover:border-amber-500/50 hover:text-amber-500">
            + Add track
          </button>
        ) : (
          <div className="space-y-1 border border-stone-800 p-2">
            <div className="text-[10px] uppercase tracking-widest text-stone-500">Pick a sound:</div>
            <div className="flex flex-wrap gap-1">
              {availableSounds.map(k => {
                const m = getSoundDisplay(k);
                if (!m) return null;
                return (
                  <button key={k}
                    onPointerDown={(e) => { e.preventDefault(); addTrack(k); }}
                    className="px-2 py-1 border-2 text-[10px] uppercase tracking-widest"
                    style={{ borderColor: m.color, color: m.color }}>
                    {m.label} · {m.name}
                  </button>
                );
              })}
              <button onPointerDown={(e) => { e.preventDefault(); setShowAddTrack(false); }}
                className="px-2 py-1 border border-stone-700 text-stone-500 text-[10px] uppercase tracking-widest">
                cancel
              </button>
            </div>
          </div>
        )
      )}

      {/* BPM + clear */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button onPointerDown={(e) => { e.preventDefault(); onBpmChange?.(Math.max(60, bpm - 5)); }}
            className="w-8 h-8 border-2 border-stone-700 text-amber-500 active:scale-95">−</button>
          <div className="text-center min-w-[80px]">
            <div className="text-amber-500 text-lg tracking-wider leading-none" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
              {bpm} BPM
            </div>
            <div className="text-[9px] text-stone-500 uppercase tracking-widest mt-0.5">
              {activeCells} hits · {workPattern.tracks.filter(t => t.cells.some(Boolean)).length} sounds
            </div>
          </div>
          <button onPointerDown={(e) => { e.preventDefault(); onBpmChange?.(Math.min(180, bpm + 5)); }}
            className="w-8 h-8 border-2 border-stone-700 text-amber-500 active:scale-95">+</button>
        </div>
        <button onPointerDown={(e) => { e.preventDefault(); clearPattern(); }}
          className="px-3 py-1.5 border border-stone-700 text-stone-400 text-[10px] uppercase tracking-widest hover:border-red-500 hover:text-red-400">
          Clear
        </button>
      </div>
    </div>
  );
};

// ============ SOUND STUDIO ============
// Record & manage custom samples for the 4 hero sounds (B/T/K/Pf).
// Per-character samples (stored in IndexedDB keyed by slot).
// Time does NOT advance while in here — it's a configuration screen.

// Color per SOUND_CATALOG category (used in Studio + Sequencer for owned sounds)
const CAT_COLORS = {
  Kicks: '#CC2200',
  Hats: '#22d3ee',
  Snares: '#fbbf24',
  Rimshot: '#a78bfa',
  Liproll: '#f97316',
  Bass: '#7f1d1d',
  Scratch: '#84cc16',
  Whistles: '#67e8f9',
  Clicks: '#fb7185',
};

// Build a 2-3 char label from a sound name (e.g. 'Lip Roll' → 'LR', 'Throat Kick' → 'TK').
const _abbrevFromName = (name) => {
  const words = name.replace(/[()]/g, '').split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

// Look up display info for any sound key (hero or catalog).
const getSoundDisplay = (key) => {
  if (HERO_SOUNDS[key]) {
    const m = HERO_SOUNDS[key];
    return { key, label: m.label, color: m.color, name: m.name, isHero: true };
  }
  const m = SOUND_CATALOG[key];
  if (!m) return null;
  return {
    key,
    label: _abbrevFromName(m.name),
    color: CAT_COLORS[m.cat] || '#a78bfa',
    name: m.name,
    isHero: false,
    cat: m.cat,
  };
};

const SoundStudio = ({ activeSlot, showToast, char }) => {
  const [permission, setPermission] = useState('idle'); // 'idle' | 'requesting' | 'granted' | 'denied' | 'insecure'
  const [errorDetail, setErrorDetail] = useState('');
  // sampleStatus only holds the *active* recording's transient status. Persistent
  // 'default' / 'custom' is derived from HERO_SAMPLES at render time.
  const [sampleStatus, setSampleStatus] = useState({});
  const [micLevel, setMicLevel] = useState(0); // 0..1 RMS
  const [recordingKey, setRecordingKey] = useState(null); // which sound is being recorded
  const [refreshKey, setRefreshKey] = useState(0); // to force re-render after sample save

  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const recorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const rmsBufferRef = useRef(null);
  const onsetDetectedRef = useRef(false);
  const recordStartedAtRef = useRef(0);
  const onsetAtRef = useRef(0);
  const silenceStartedAtRef = useRef(0);
  const rafRef = useRef(0);
  // Mirror of recordingKey for use inside rAF loop (avoids stale closure)
  const recordingKeyRef = useRef(null);
  // Mounted flag — guards async state updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Onset and silence thresholds for auto-detect recording
  const ONSET_THRESHOLD = 0.04;
  const SILENCE_THRESHOLD = 0.015;
  const SILENCE_DURATION_MS = 120;
  const MAX_AFTER_ONSET_MS = 1500;
  const MAX_TOTAL_WAIT_MS = 4000;

  // Reset all transient recording state. Safe to call multiple times.
  const resetRecordingState = () => {
    recordingKeyRef.current = null;
    onsetDetectedRef.current = false;
    silenceStartedAtRef.current = 0;
    recordStartedAtRef.current = 0;
    onsetAtRef.current = 0;
    recordedChunksRef.current = [];
    if (mountedRef.current) {
      setRecordingKey(null);
      setSampleStatus({});
    }
  };

  // Initialize mic and analyser once
  const ensureMicReady = async () => {
    // If we already have a stream + analyser, just make sure the meter loop is running.
    if (streamRef.current && analyserRef.current) {
      ensureMeterLoopRunning();
      return true;
    }
    setPermission('requesting');
    try {
      if (typeof window !== 'undefined' && window.isSecureContext === false) {
        setPermission('insecure');
        setErrorDetail('Mic requires HTTPS. Use a hosted URL.');
        return false;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setPermission('denied');
        setErrorDetail('Mic API not available in this browser.');
        return false;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return false;
      }
      streamRef.current = stream;
      const ctx = getAudioCtx();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      analyserRef.current = analyser;
      rmsBufferRef.current = new Float32Array(analyser.fftSize);
      setPermission('granted');
      ensureMeterLoopRunning();
      return true;
    } catch (err) {
      const name = err?.name || 'Error';
      let msg = err?.message || String(err);
      if (name === 'NotAllowedError') msg = 'Mic permission denied.';
      else if (name === 'NotFoundError') msg = 'No mic found.';
      else if (name === 'SecurityError') msg = 'Browser blocked mic. Need HTTPS.';
      setErrorDetail(`${name}: ${msg}`);
      setPermission('denied');
      return false;
    }
  };

  // Ensure exactly one rAF meter loop is running. Idempotent.
  const ensureMeterLoopRunning = () => {
    if (rafRef.current) return; // already running
    const tick = () => {
      // If component unmounted or analyser disposed, stop forever
      if (!mountedRef.current) { rafRef.current = 0; return; }
      const analyser = analyserRef.current;
      const buf = rmsBufferRef.current;
      if (!analyser || !buf) { rafRef.current = 0; return; }
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      setMicLevel(rms);

      // Recording state machine — uses refs for stable values across ticks
      if (recorderRef.current && recordingKeyRef.current) {
        const key = recordingKeyRef.current;
        const now = performance.now();
        const elapsed = now - recordStartedAtRef.current;

        if (!onsetDetectedRef.current) {
          if (rms > ONSET_THRESHOLD) {
            onsetDetectedRef.current = true;
            onsetAtRef.current = now;
            setSampleStatus(s => ({ ...s, [key]: 'recording' }));
          } else if (elapsed > MAX_TOTAL_WAIT_MS) {
            // No onset → abort (recorder.onstop will fire and finalize state)
            stopRecorder('no-onset');
          }
        } else {
          const sinceOnset = now - onsetAtRef.current;
          if (rms < SILENCE_THRESHOLD) {
            if (silenceStartedAtRef.current === 0) silenceStartedAtRef.current = now;
            else if (now - silenceStartedAtRef.current >= SILENCE_DURATION_MS) {
              stopRecorder('silence');
            }
          } else {
            silenceStartedAtRef.current = 0;
          }
          if (sinceOnset > MAX_AFTER_ONSET_MS) {
            stopRecorder('max-duration');
          }
        }
      }
      // ALWAYS schedule the next frame — never break the loop
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  // Cleanup on unmount
  useEffect(() => () => {
    mountedRef.current = false;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
    if (recorderRef.current) {
      try { recorderRef.current.stop(); } catch {}
      recorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    analyserRef.current = null;
    rmsBufferRef.current = null;
  }, []);

  // Stop the active recorder. The recorder's onstop handler does blob processing.
  // The 'no-onset' case also clears UI state immediately because onstop won't have a useful blob.
  const stopRecorder = (reason) => {
    const recorder = recorderRef.current;
    const key = recordingKeyRef.current;
    if (!recorder) return;
    recorderRef.current = null;
    try { recorder.stop(); } catch {}
    if (reason === 'no-onset') {
      // Don't wait for onstop to clean UI — clear it now.
      if (key && mountedRef.current) {
        setSampleStatus(s => { const c = { ...s }; delete c[key]; return c; });
      }
      recordingKeyRef.current = null;
      if (mountedRef.current) setRecordingKey(null);
      showToast?.('No sound detected — try again', 'bad');
    }
    // For 'silence' / 'max-duration', recorder.onstop will fire and finalize.
  };

  // Manual abort — user-initiated cancel
  const abortRecording = () => {
    const key = recordingKeyRef.current;
    if (!recorderRef.current) {
      // Not recording but UI is stuck — force-clean everything
      resetRecordingState();
      return;
    }
    const recorder = recorderRef.current;
    recorderRef.current = null;
    try { recorder.stop(); } catch {}
    // Discard any captured chunks so onstop doesn't try to save garbage
    recordedChunksRef.current = [];
    if (key && mountedRef.current) {
      setSampleStatus(s => { const c = { ...s }; delete c[key]; return c; });
    }
    recordingKeyRef.current = null;
    onsetDetectedRef.current = false;
    silenceStartedAtRef.current = 0;
    if (mountedRef.current) setRecordingKey(null);
  };

  // Begin recording for a given key
  const recordSound = async (key) => {
    if (!activeSlot) { showToast?.('Need an active character first', 'bad'); return; }
    // If something's already recording, abort it first (user retry case)
    if (recorderRef.current) abortRecording();
    const ok = await ensureMicReady();
    if (!ok) return;
    if (!mountedRef.current) return;

    // Set up state for the new recording
    recordingKeyRef.current = key;
    setRecordingKey(key);
    setSampleStatus(s => ({ ...s, [key]: 'waiting' }));
    onsetDetectedRef.current = false;
    silenceStartedAtRef.current = 0;
    recordStartedAtRef.current = performance.now();
    recordedChunksRef.current = [];

    let recorder;
    try {
      const stream = streamRef.current;
      recorder = new MediaRecorder(stream);
    } catch (err) {
      console.error('MediaRecorder constructor failed:', err);
      resetRecordingState();
      showToast?.('Recording not supported on this browser', 'bad');
      return;
    }

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    recorder.onerror = (e) => {
      console.error('Recorder error:', e);
      resetRecordingState();
      showToast?.('Recorder error', 'bad');
    };
    recorder.onstop = async () => {
      // Always clear the active recorder ref (defensive)
      if (recorderRef.current === recorder) recorderRef.current = null;

      const chunks = recordedChunksRef.current;
      recordedChunksRef.current = [];

      // If aborted (no chunks) — just cleanup and bail
      if (chunks.length === 0) {
        if (mountedRef.current && recordingKeyRef.current === key) {
          setSampleStatus(s => { const c = { ...s }; delete c[key]; return c; });
          recordingKeyRef.current = null;
          setRecordingKey(null);
        }
        return;
      }

      try {
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const arrayBuf = await blob.arrayBuffer();
        const ctx = getAudioCtx();
        const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
        const processed = processSample(ctx, decoded);

        if (!mountedRef.current) return;

        if (!processed) {
          setSampleStatus(s => { const c = { ...s }; delete c[key]; return c; });
          recordingKeyRef.current = null;
          setRecordingKey(null);
          showToast?.('Recording too short — try again', 'bad');
          return;
        }

        await saveSampleForSlot(activeSlot, key, processed);
        if (!mountedRef.current) return;

        setSampleStatus(s => { const c = { ...s }; delete c[key]; return c; });
        recordingKeyRef.current = null;
        setRecordingKey(null);
        setRefreshKey(k => k + 1);
        showToast?.(`✓ ${(getSoundDisplay(key)?.name) || key} recorded`, 'win');
        setTimeout(() => playGameSound(key), 200);
      } catch (err) {
        console.error('Sample processing failed:', err);
        if (!mountedRef.current) return;
        setSampleStatus(s => { const c = { ...s }; delete c[key]; return c; });
        recordingKeyRef.current = null;
        setRecordingKey(null);
        showToast?.('Recording failed — try again', 'bad');
      }
    };

    recorderRef.current = recorder;
    try {
      recorder.start();
    } catch (err) {
      console.error('recorder.start failed:', err);
      recorderRef.current = null;
      resetRecordingState();
      showToast?.('Recorder failed to start', 'bad');
    }
  };

  // Process a decoded AudioBuffer: trim silence, cap length, normalize peak.
  // Returns a new AudioBuffer or null if too short.
  const processSample = (ctx, buf) => {
    const data = buf.getChannelData(0);
    const sr = buf.sampleRate;
    const TRIM_THRESHOLD = 0.02;
    const SAFETY_LEAD_MS = 5;
    const SAFETY_TAIL_MS = 30;
    const MAX_LEN_MS = 600;

    // Trim leading silence
    let start = 0;
    while (start < data.length && Math.abs(data[start]) < TRIM_THRESHOLD) start++;
    start = Math.max(0, start - Math.floor(sr * SAFETY_LEAD_MS / 1000));
    // Trim trailing silence
    let end = data.length - 1;
    while (end > start && Math.abs(data[end]) < TRIM_THRESHOLD) end--;
    end = Math.min(data.length, end + Math.floor(sr * SAFETY_TAIL_MS / 1000));
    // Cap length
    const maxSamples = Math.floor(sr * MAX_LEN_MS / 1000);
    if (end - start > maxSamples) end = start + maxSamples;
    const trimmedLen = end - start;
    if (trimmedLen < Math.floor(sr * 0.02)) return null; // <20ms = failure

    // Normalize peak to 0.85
    let peak = 0;
    for (let i = start; i < end; i++) {
      const v = Math.abs(data[i]);
      if (v > peak) peak = v;
    }
    const gain = peak > 0 ? 0.85 / peak : 1;
    const out = ctx.createBuffer(1, trimmedLen, sr);
    const outData = out.getChannelData(0);
    for (let i = 0; i < trimmedLen; i++) outData[i] = data[start + i] * gain;
    return out;
  };

  // Reset a single sound to default (synth)
  const resetSound = async (key) => {
    if (!activeSlot) return;
    await deleteSampleForSlot(activeSlot, key);
    setRefreshKey(k => k + 1);
    showToast?.(`${(getSoundDisplay(key)?.name) || key} reset to default`, 'info');
  };

  // Reset all sounds
  const resetAll = async () => {
    if (!activeSlot) return;
    await deleteAllSamplesForSlot(activeSlot);
    setRefreshKey(k => k + 1);
    showToast?.('All sounds reset to default', 'info');
  };

  // Mic level indicator color
  const meterColor = micLevel < 0.04 ? '#84cc16' : micLevel < 0.15 ? '#fbbf24' : '#ef4444';
  const meterPct = Math.min(100, micLevel * 250); // amplify visual scale

  return (
    <Panel title="Sound Studio">
      <div className="space-y-3">
        <div className="text-[10px] uppercase tracking-wider text-stone-500">
          Record your own beatbox sounds. They'll replace the defaults across the game.
        </div>

        {/* Live mic level meter */}
        {permission === 'granted' && (
          <div className="space-y-1">
            <div className="flex justify-between text-[9px] uppercase tracking-wider text-stone-500">
              <span>🎤 Mic level</span>
              <span className="font-mono">{(micLevel * 100).toFixed(0)}%</span>
            </div>
            <div className="h-2 bg-stone-950 border border-stone-800 overflow-hidden">
              <div className="h-full transition-all duration-75"
                style={{ width: `${meterPct}%`, background: meterColor }} />
            </div>
          </div>
        )}

        {permission === 'denied' && (
          <div className="border-2 border-red-900 bg-red-950/30 p-3 text-[11px] text-stone-300">
            <div className="text-red-400 uppercase tracking-widest mb-1">Mic unavailable</div>
            {errorDetail}
          </div>
        )}

        {/* Sound cards: 4 hero + every owned catalog sound */}
        <div className="space-y-2" key={refreshKey}>
          {(() => {
            const heroEntries = Object.keys(HERO_SOUNDS);
            // Hide catalog ids that are already a hero default (e.g. classic_kick → B).
            const heroDefaults = new Set(Object.values(HERO_SOUNDS).map(m => m.defaultSound).filter(Boolean));
            const ownedExtras = (char?.sounds || [])
              .filter(id => SOUND_CATALOG[id] && !HERO_SOUNDS[id] && !heroDefaults.has(id));
            const allKeys = [...heroEntries, ...ownedExtras];
            return allKeys.map(key => {
              const meta = getSoundDisplay(key);
              if (!meta) return null;
              const isThisRecording = recordingKey === key;
              const transient = sampleStatus[key];
              const isWaiting = isThisRecording && transient === 'waiting';
              const isRecording = isThisRecording && transient === 'recording';
              const isCustom = !isThisRecording && !!HERO_SAMPLES[key];
              const isDisabled = recordingKey && recordingKey !== key;

              return (
                <div key={key}
                  className={`border-2 p-3 flex items-center gap-3 transition-all ${
                    isWaiting || isRecording ? 'border-red-500 bg-red-950/30' :
                    isCustom ? 'border-amber-500 bg-amber-500/5' :
                    'border-stone-800 bg-stone-900/40'
                  }`}>
                  <div className="w-12 h-12 border-2 flex items-center justify-center text-lg font-mono"
                    style={{ borderColor: meta.color, color: meta.color, background: `${meta.color}15` }}>
                    {meta.label}
                  </div>
                  <div className="flex-1">
                    <div className="text-stone-100 text-sm tracking-wider"
                      style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
                      {meta.name.toUpperCase()}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider mt-0.5"
                      style={{ color: isWaiting || isRecording ? '#ef4444' : isCustom ? '#D4A017' : '#78716c' }}>
                      {isWaiting ? 'WAITING FOR SOUND…' :
                       isRecording ? 'RECORDING…' :
                       isCustom ? '✓ CUSTOM SAMPLE' :
                       meta.isHero ? 'DEFAULT SYNTH' : 'CATALOG SYNTH'}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    {isThisRecording ? (
                      <button onClick={abortRecording}
                        className="px-3 py-1 border-2 border-stone-500 bg-stone-800 text-stone-200 text-[10px] uppercase tracking-wider">
                        ✕ Stop
                      </button>
                    ) : (
                      <button onClick={() => recordSound(key)} disabled={isDisabled}
                        className="px-3 py-1 border-2 border-red-700 bg-red-900/30 text-red-300 text-[10px] uppercase tracking-wider disabled:opacity-30">
                        REC
                      </button>
                    )}
                    <button onClick={() => playGameSound(key)} disabled={isThisRecording}
                      className="px-3 py-1 border-2 border-stone-700 bg-stone-800 text-stone-300 text-[10px] uppercase tracking-wider disabled:opacity-30">
                      ▶ Play
                    </button>
                    {isCustom && (
                      <button onClick={() => resetSound(key)}
                        className="px-3 py-1 border border-stone-800 text-stone-500 text-[9px] uppercase tracking-wider hover:text-amber-500">
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              );
            });
          })()}
        </div>

        {/* Reset all */}
        {ALL_SAMPLE_KEYS().some(k => HERO_SAMPLES[k]) && (
          <button onClick={resetAll}
            className="w-full py-2 border border-stone-800 text-stone-500 text-[10px] uppercase tracking-widest hover:text-red-400 hover:border-red-700">
            Reset all sounds to default
          </button>
        )}

        {/* Recovery: if UI looks stuck, force-reset everything */}
        {recordingKey && (
          <button onClick={() => { abortRecording(); resetRecordingState(); }}
            className="w-full py-1 border border-stone-800 text-stone-600 text-[9px] uppercase tracking-widest hover:text-stone-300">
            Stuck? Tap to reset recording state
          </button>
        )}

        <div className="text-[9px] uppercase tracking-wider text-stone-600 leading-relaxed pt-2 border-t border-stone-800">
          Tip: tap REC, wait for "WAITING FOR SOUND", then make the sound clearly. Recording auto-stops on silence.
        </div>
      </div>
    </Panel>
  );
};


// ---------- JAM ANIMATION ----------
// A cypher: 4 beatboxers in a circle. The "active" one (whose turn it is) bobs and emits sounds.
// Active beatboxer rotates through positions over time. Crowd silhouettes behind. Hands raised in time.
const JamAnimation = ({ color = '#D4A017', block = 0, rewardKey = 0, active = true }) => {
  const canvasRef = useRef(null);
  const PXSCALE = 4;
  const W = 140, H = 90;
  const propsRef = useRef({ color, block, active });
  useEffect(() => { propsRef.current = { color, block, active }; }, [color, block, active]);

  const lastRewardRef = useRef(0);
  const sparklesRef = useRef([]); // sparkles fly out on reward

  useEffect(() => {
    if (rewardKey > lastRewardRef.current) {
      lastRewardRef.current = rewardKey;
      for (let i = 0; i < 8; i++) {
        const angle = Math.random() * Math.PI * 2;
        sparklesRef.current.push({
          x: W / 2,
          y: H / 2,
          vx: Math.cos(angle) * (1 + Math.random()),
          vy: Math.sin(angle) * (1 + Math.random()) - 0.5,
          life: 0,
          ttl: 30 + Math.random() * 20,
          color: ['#D4A017', '#C8DCEF', '#fb7185', '#a78bfa'][Math.floor(Math.random() * 4)],
        });
      }
    }
  }, [rewardKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    let raf, frameCount = 0;

    // Cypher members - positioned roughly in an oval for perspective
    // Player is always one of them (front-center, your color). Others are randomized.
    const members = [
      { x: 70, y: 64, scale: 1.0, color: 'PLAYER', name: 'you' },     // front center (player)
      { x: 30, y: 56, scale: 0.85, color: '#84cc16', name: 'left' },  // back left
      { x: 110, y: 56, scale: 0.85, color: '#fb7185', name: 'right' }, // back right
      { x: 70, y: 50, scale: 0.75, color: '#a78bfa', name: 'back' },   // far back
    ];

    const draw = () => {
      frameCount++;
      const { color, block, active } = propsRef.current;

      if (canvas.width !== W * PXSCALE || canvas.height !== H * PXSCALE) {
        canvas.width = W * PXSCALE;
        canvas.height = H * PXSCALE;
        ctx.imageSmoothingEnabled = false;
      }
      const px = (x, y, w, h, c) => _px(ctx, x, y, w, h, c);

      ctx.save();
      ctx.scale(PXSCALE, PXSCALE);

      // night sky
      px(0, 0, W, 50, '#1a1428');
      // stars
      for (let i = 0; i < 12; i++) {
        const sx = (i * 17 + 7) % W;
        const sy = (i * 11) % 30 + 4;
        const twinkle = Math.sin(frameCount * 0.05 + i) > 0.5 ? '#fef3c7' : '#a89060';
        px(sx, sy, 1, 1, twinkle);
      }
      // moon
      px(115, 10, 8, 8, '#fef3c7');
      px(116, 10, 6, 6, '#fef3c7');
      px(118, 11, 3, 3, '#0c0a09'); // crescent shadow

      // crowd silhouette in background (behind cypher)
      const crowdY = 42;
      for (let i = 0; i < 18; i++) {
        const cx = i * 8 + (i % 2) * 2;
        const headBob = Math.sin(frameCount * 0.1 + i * 0.5) * 0.5;
        // head
        px(cx, crowdY + headBob, 4, 4, '#0a0a0a');
        // body
        px(cx - 1, crowdY + 4 + headBob, 6, 8, '#0a0a0a');
        // raised arms (some)
        if (i % 3 === 0) {
          const armUp = Math.sin(frameCount * 0.15 + i) > 0;
          if (armUp) {
            px(cx - 2, crowdY + 1 + headBob, 1, 4, '#0a0a0a');
            px(cx + 5, crowdY + 1 + headBob, 1, 4, '#0a0a0a');
          }
        }
      }

      // ground - dim concrete circle for the cypher
      px(0, 50, W, 40, '#2a2520');
      // cypher floor circle outline
      ctx.strokeStyle = '#3a3530';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(70, 70, 50, 16, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Determine whose turn it is - rotates every ~5 seconds (300 frames at 60fps)
      const turnIndex = Math.floor(frameCount / 240) % members.length;

      // Sort members by y for depth (back to front)
      const sortedIdx = [...members.keys()].sort((a, b) => members[a].y - members[b].y);

      // Draw each member
      sortedIdx.forEach(idx => {
        const m = members[idx];
        const isActive = idx === turnIndex && active;
        const memberColor = m.color === 'PLAYER' ? color : m.color;
        const s = m.scale;

        const cx = m.x, cy = m.y + 12; // feet position
        const charH = Math.floor(20 * s);
        const charW = Math.floor(8 * s);

        // shadow
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(cx - charW / 2, cy + 1, charW, 1);

        const bob = isActive ? Math.floor(frameCount / 5) % 2 : 0;

        // legs
        px(cx - 2, cy - 5 - bob, 1, 5, '#1a1a2e');
        px(cx + 1, cy - 5 + bob, 1, 5, '#1a1a2e');
        // shoes
        px(cx - 2, cy - 1, 1, 1, '#fff');
        px(cx + 1, cy - 1, 1, 1, '#fff');

        // body
        const bodyH = Math.floor(7 * s);
        const bodyW = Math.floor(6 * s);
        px(cx - bodyW / 2, cy - 5 - bodyH, bodyW, bodyH, memberColor);
        // hood
        const hoodH = Math.floor(4 * s);
        px(cx - bodyW / 2, cy - 5 - bodyH - hoodH, bodyW, hoodH, memberColor);
        // head
        const headSize = Math.floor(5 * s);
        px(cx - headSize / 2, cy - 5 - bodyH - headSize, headSize, headSize, '#d4a87a');

        // mic if active
        if (isActive) {
          // arm up holding mic
          px(cx + bodyW / 2, cy - 5 - bodyH + 1, 1, 2, memberColor);
          px(cx + bodyW / 2 + 1, cy - 5 - bodyH - 2, 1, 2, '#d4a87a');
          // mic
          px(cx + bodyW / 2 + 2, cy - 5 - bodyH - 3, 2, 2, '#888');
          // open mouth (animated)
          const mouthOpen = Math.floor(frameCount / 4) % 2;
          if (mouthOpen) {
            px(cx - 1, cy - 5 - bodyH - 1, 2, 1, '#3a1010');
          }
        }
      });

      // Soundwaves from active member
      if (active) {
        const activeMember = members[turnIndex];
        const ax = activeMember.x;
        const ay = activeMember.y - 4;
        for (let i = 0; i < 3; i++) {
          const phase = (frameCount * 0.04 + i * 0.33) % 1;
          const radius = phase * 25;
          const opacity = (1 - phase) * 0.6;
          ctx.strokeStyle = `rgba(212, 160, 23, ${opacity})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(ax, ay, radius, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Sparkles (reward burst)
      sparklesRef.current = sparklesRef.current.filter(s => {
        s.life++;
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.05;
        const opacity = 1 - s.life / s.ttl;
        ctx.fillStyle = s.color;
        ctx.globalAlpha = opacity;
        ctx.fillRect(Math.floor(s.x), Math.floor(s.y), 2, 2);
        ctx.globalAlpha = 1;
        return s.life < s.ttl;
      });

      // "WHOSE TURN" indicator
      if (active) {
        const turnNames = ['YOU', 'L1', 'R1', 'B1'];
        ctx.fillStyle = '#D4A017';
        ctx.font = 'bold 6px monospace';
        ctx.fillText(`▶ ${turnNames[turnIndex]}`, 4, 87);
      }

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas ref={canvasRef}
      className="w-full block border-2 border-stone-800"
      style={{ imageRendering: 'pixelated', background: '#0a0815', aspectRatio: `${W} / ${H}` }} />
  );
};

// ---------- RUN ANIMATION ----------
// Side-scrolling park: character jogs in place, world scrolls past (parallax trees).
const RunAnimation = ({ color = '#D4A017', block = 0, rewardKey = 0, active = true }) => {
  const canvasRef = useRef(null);
  const PXSCALE = 4;
  const W = 140, H = 90;
  const propsRef = useRef({ color, block, active });
  useEffect(() => { propsRef.current = { color, block, active }; }, [color, block, active]);

  const lastRewardRef = useRef(0);
  const sweatRef = useRef([]);

  useEffect(() => {
    if (rewardKey > lastRewardRef.current) {
      lastRewardRef.current = rewardKey;
      // Spawn a "+1!" floating text
    }
  }, [rewardKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    let raf, frameCount = 0;
    let scrollX = 0; // ground scroll
    let scrollX2 = 0; // far parallax

    const draw = () => {
      frameCount++;
      const { color, block, active } = propsRef.current;
      const speed = active ? 1.5 : 0;

      if (canvas.width !== W * PXSCALE || canvas.height !== H * PXSCALE) {
        canvas.width = W * PXSCALE;
        canvas.height = H * PXSCALE;
        ctx.imageSmoothingEnabled = false;
      }
      const px = (x, y, w, h, c) => _px(ctx, x, y, w, h, c);

      ctx.save();
      ctx.scale(PXSCALE, PXSCALE);

      // sky gradient (manual, for pixel feel)
      px(0, 0, W, 25, '#fde8a8');  // peach
      px(0, 25, W, 15, '#f5b070');  // amber
      px(0, 40, W, 15, '#9b6a8e');  // purple-pink

      // sun
      const sunX = 95;
      const sunY = 20;
      px(sunX - 6, sunY - 6, 12, 12, '#fde0b0');
      px(sunX - 5, sunY - 5, 10, 10, '#fef3c7');
      px(sunX - 4, sunY - 4, 8, 8, '#ffd070');
      px(sunX - 3, sunY - 3, 6, 6, '#ffb050');

      scrollX2 -= speed * 0.3;
      // distant mountains (slow parallax)
      ctx.fillStyle = '#5a4868';
      for (let i = 0; i < 6; i++) {
        const mx = ((i * 30 + scrollX2) % (W + 30)) - 15;
        const my = 38;
        ctx.beginPath();
        ctx.moveTo(mx, my + 10);
        ctx.lineTo(mx + 15, my);
        ctx.lineTo(mx + 30, my + 10);
        ctx.fill();
      }

      // mid layer trees (medium parallax)
      scrollX -= speed;
      const treePositions = [0, 28, 55, 82, 110, 140, 168];
      treePositions.forEach((tp, i) => {
        const tx = ((tp + scrollX) % (W + 28)) - 14;
        const ty = 48;
        // trunk
        px(tx + 4, ty + 8, 3, 8, '#3a2818');
        // leaves (round-ish blob)
        px(tx, ty - 2, 11, 11, '#2a5028');
        px(tx + 1, ty - 4, 9, 4, '#2a5028');
        px(tx - 1, ty + 1, 13, 5, '#2a5028');
        // highlights
        px(tx + 2, ty - 1, 3, 3, '#3a6a38');
      });

      // path / ground
      px(0, 60, W, 30, '#7a5a30');
      px(0, 60, W, 1, '#9a7a48');

      // path lines (perspective lines moving toward viewer to suggest motion)
      ctx.fillStyle = '#5a4020';
      const lineSpacing = 12;
      for (let i = 0; i < 6; i++) {
        const lx = ((i * lineSpacing + scrollX) % (lineSpacing * 6)) - 4;
        if (lx > -4 && lx < W) {
          ctx.fillRect(Math.floor(lx), 80, 4, 2);
        }
      }

      // foreground grass tufts (fast parallax)
      const grassPositions = [10, 35, 55, 80, 100, 125, 145];
      grassPositions.forEach((gp, i) => {
        const gx = ((gp + scrollX * 1.5) % (W + 20)) - 10;
        const gy = 86;
        px(gx, gy, 1, 3, '#4a7028');
        px(gx + 1, gy + 1, 1, 2, '#4a7028');
        px(gx - 1, gy + 1, 1, 2, '#4a7028');
        px(gx + 2, gy + 1, 1, 2, '#5a8038');
      });

      // RUNNER - center, bobbing in place
      const runX = 50;
      const runY = 70;
      const runFrame = active ? Math.floor(frameCount / 4) % 4 : 0; // 4-frame run cycle
      const bob = active ? (runFrame % 2 === 0 ? 0 : -1) : 0;

      // shadow (oscillates with run)
      ctx.fillStyle = `rgba(0,0,0,${0.4 + (runFrame === 0 || runFrame === 2 ? 0 : 0.1)})`;
      ctx.fillRect(runX - 5, runY + 8, 10, 1);

      // legs - 4 frame run cycle
      // Legs swing forward/back
      if (runFrame === 0) {
        // mid stride 1
        px(runX - 3, runY, 2, 6, '#1a1a2e'); // back leg
        px(runX + 1, runY, 2, 6, '#1a1a2e'); // front leg
        px(runX - 3, runY + 6, 2, 1, '#fff');
        px(runX + 1, runY + 6, 2, 1, '#fff');
      } else if (runFrame === 1) {
        // right leg back, left leg forward
        px(runX - 4, runY, 3, 5, '#1a1a2e');
        px(runX + 2, runY, 3, 4, '#1a1a2e');
        px(runX - 4, runY + 5, 3, 1, '#fff');
        px(runX + 2, runY + 4, 3, 1, '#fff');
      } else if (runFrame === 2) {
        // mid stride 2
        px(runX - 3, runY, 2, 6, '#1a1a2e');
        px(runX + 1, runY, 2, 6, '#1a1a2e');
        px(runX - 3, runY + 6, 2, 1, '#fff');
        px(runX + 1, runY + 6, 2, 1, '#fff');
      } else {
        // left leg back, right leg forward
        px(runX - 4, runY, 3, 4, '#1a1a2e');
        px(runX + 2, runY, 3, 5, '#1a1a2e');
        px(runX - 4, runY + 4, 3, 1, '#fff');
        px(runX + 2, runY + 5, 3, 1, '#fff');
      }

      // body
      px(runX - 4, runY - 8 + bob, 8, 8, color);
      px(runX - 4, runY - 8 + bob, 8, 1, '#fff');

      // arms swinging (alternates with legs)
      if (runFrame === 1 || runFrame === 0) {
        // left arm forward, right arm back
        px(runX + 4, runY - 7 + bob, 2, 5, color);
        px(runX + 5, runY - 3 + bob, 2, 1, '#d4a87a');
        px(runX - 6, runY - 5 + bob, 2, 4, color);
        px(runX - 6, runY - 1 + bob, 2, 1, '#d4a87a');
      } else {
        // right arm forward
        px(runX - 6, runY - 7 + bob, 2, 5, color);
        px(runX - 7, runY - 3 + bob, 2, 1, '#d4a87a');
        px(runX + 4, runY - 5 + bob, 2, 4, color);
        px(runX + 4, runY - 1 + bob, 2, 1, '#d4a87a');
      }

      // head
      px(runX - 3, runY - 14 + bob, 6, 6, '#d4a87a');
      // hair / cap (forward-leaning)
      px(runX - 3, runY - 15 + bob, 6, 2, '#1a1a2e');
      px(runX + 2, runY - 14 + bob, 2, 1, '#1a1a2e'); // hair flopping in wind
      // eyes (looking forward, focused)
      px(runX - 1, runY - 12 + bob, 1, 1, '#1a1a2e');
      px(runX + 1, runY - 12 + bob, 1, 1, '#1a1a2e');
      // mouth (slight 'o' for breathing)
      px(runX, runY - 10 + bob, 1, 1, '#5a2020');

      // sweat drops (occasional)
      if (active && frameCount % 30 === 0) {
        sweatRef.current.push({ x: runX - 6, y: runY - 14, vx: -0.3, vy: 0.1, life: 0 });
      }
      sweatRef.current = sweatRef.current.filter(s => {
        s.life++;
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.05;
        px(s.x, s.y, 1, 2, '#88c0d0');
        return s.life < 30;
      });

      // motion lines behind runner
      if (active) {
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
          const lineX = runX - 12 - i * 4 - (frameCount % 8);
          ctx.beginPath();
          ctx.moveTo(lineX, runY - 5 + i * 3);
          ctx.lineTo(lineX - 5, runY - 5 + i * 3);
          ctx.stroke();
        }
      }

      // Distance counter (small UI inside scene)
      if (active) {
        const km = (lastRewardRef.current * 0.5 + (block * 0.1)).toFixed(1);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 6px monospace';
        ctx.fillText(`${km}KM`, 4, 9);
      }

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas ref={canvasRef}
      className="w-full block border-2 border-stone-800"
      style={{ imageRendering: 'pixelated', background: '#fde8a8', aspectRatio: `${W} / ${H}` }} />
  );
};

// ---------- PIXEL ICON ----------
// Tiny 16x16 icons rendered on canvas. Used in menu lists.
// Each kind is a hand-coded sprite.

const PIXEL_ICONS = {
  mic: (px) => {
    // microphone
    px(7, 2, 4, 1, '#999');
    px(6, 3, 6, 5, '#bbb');
    px(7, 3, 4, 5, '#888');
    px(7, 4, 1, 1, '#fff');
    px(8, 8, 2, 1, '#666');
    px(8, 9, 2, 4, '#999');
    px(6, 13, 6, 1, '#666');
  },
  jam: (px) => {
    // 2 figures with sound waves between them (clearer cypher icon)
    // Left figure
    px(3, 5, 3, 4, '#D4A017');
    px(4, 3, 1, 2, '#d4a87a'); // head
    px(3, 9, 1, 3, '#1a1a2e'); // legs
    px(5, 9, 1, 3, '#1a1a2e');
    // Right figure
    px(10, 5, 3, 4, '#fb7185');
    px(11, 3, 1, 2, '#d4a87a'); // head
    px(10, 9, 1, 3, '#1a1a2e'); // legs
    px(12, 9, 1, 3, '#1a1a2e');
    // Sound burst between them
    px(7, 6, 2, 2, '#fef3c7');
    px(7, 5, 1, 1, '#D4A017');
    px(8, 5, 1, 1, '#D4A017');
    px(7, 8, 1, 1, '#D4A017');
    px(8, 8, 1, 1, '#D4A017');
    // ground
    px(2, 12, 12, 1, '#3a3a3a');
  },
  shoe: (px) => {
    // running shoe
    px(2, 9, 12, 3, '#D4A017');
    px(3, 8, 8, 1, '#fff');
    px(4, 7, 6, 1, '#fff');
    px(11, 9, 1, 1, '#888'); // sole detail
    px(2, 12, 12, 1, '#444'); // sole
    px(5, 9, 1, 1, '#666'); // lace
    px(7, 9, 1, 1, '#666');
    px(9, 9, 1, 1, '#666');
  },
  fridge: (px) => {
    // refrigerator
    px(4, 2, 8, 12, '#e5e5e5');
    px(4, 7, 8, 1, '#888'); // door split
    px(10, 4, 1, 2, '#666'); // upper handle
    px(10, 9, 1, 3, '#666'); // lower handle
    px(5, 3, 2, 1, '#D4A017'); // sticker
  },
  pc: (px) => {
    // monitor
    px(2, 3, 12, 8, '#1a1a2e');
    px(3, 4, 10, 6, '#3a5a8a');
    px(4, 5, 2, 1, '#D4A017'); // waveform on screen
    px(7, 5, 1, 2, '#D4A017');
    px(10, 5, 2, 1, '#D4A017');
    px(7, 11, 2, 1, '#666'); // stand
    px(5, 13, 6, 1, '#666'); // base
  },
  couch: (px) => {
    // couch profile
    px(2, 7, 12, 5, '#7a3030');
    px(2, 6, 12, 1, '#9a4040');
    px(3, 8, 3, 3, '#5a2020'); // cushion
    px(7, 8, 3, 3, '#5a2020');
    px(11, 8, 2, 3, '#5a2020');
    px(2, 12, 1, 1, '#3a1010'); // legs
    px(13, 12, 1, 1, '#3a1010');
    px(2, 4, 2, 4, '#5a2020'); // arm rest
  },
  star: (px) => {
    // 4-point star
    px(7, 2, 2, 12, '#D4A017');
    px(2, 7, 12, 2, '#D4A017');
    px(6, 3, 4, 10, '#fef3c7');
    px(3, 6, 10, 4, '#fef3c7');
    px(7, 7, 2, 2, '#D4A017');
  },
  fist: (px) => {
    // raised fist
    px(5, 4, 6, 4, '#d4a87a');
    px(5, 3, 6, 1, '#a87858');
    px(4, 5, 1, 3, '#a87858');
    px(11, 5, 1, 3, '#a87858');
    px(5, 8, 6, 6, '#d4a87a');
    px(5, 8, 6, 1, '#a87858');
    px(5, 9, 1, 1, '#a87858');
    px(7, 6, 1, 1, '#1a1a2e'); // knuckle dots
    px(9, 6, 1, 1, '#1a1a2e');
  },
  music: (px) => {
    // music note
    px(8, 2, 1, 9, '#D4A017');
    px(9, 2, 3, 1, '#D4A017');
    px(11, 3, 1, 4, '#D4A017');
    px(5, 9, 4, 4, '#D4A017');
    px(4, 10, 1, 2, '#D4A017');
  },
  sparkle: (px) => {
    // diamond/sparkle
    px(7, 2, 2, 1, '#a78bfa');
    px(6, 3, 4, 1, '#c4b5fd');
    px(5, 4, 6, 1, '#c4b5fd');
    px(4, 5, 8, 1, '#a78bfa');
    px(3, 6, 10, 4, '#a78bfa');
    px(4, 10, 8, 1, '#a78bfa');
    px(5, 11, 6, 1, '#7c3aed');
    px(6, 12, 4, 1, '#7c3aed');
    px(7, 13, 2, 1, '#5b21b6');
    px(7, 5, 1, 1, '#fff'); // shine
    px(7, 6, 1, 1, '#fff');
  },
  crown: (px) => {
    // crown
    px(2, 6, 12, 5, '#D4A017');
    px(2, 5, 1, 1, '#D4A017');
    px(7, 4, 2, 2, '#D4A017');
    px(13, 5, 1, 1, '#D4A017');
    px(2, 11, 12, 1, '#a87800');
    px(2, 4, 1, 1, '#fef3c7');
    px(7, 3, 2, 1, '#fef3c7');
    px(13, 4, 1, 1, '#fef3c7');
    px(4, 8, 1, 1, '#CC2200'); // gem
    px(7, 8, 2, 1, '#22d3ee');
    px(11, 8, 1, 1, '#CC2200');
  },
  zap: (px) => {
    // lightning bolt
    px(8, 2, 3, 3, '#D4A017');
    px(7, 5, 3, 2, '#D4A017');
    px(6, 7, 4, 1, '#fef3c7');
    px(5, 8, 4, 2, '#D4A017');
    px(4, 10, 4, 1, '#D4A017');
    px(3, 11, 3, 3, '#D4A017');
  },
  beer: (px) => {
    // beer mug
    px(3, 4, 8, 1, '#fef3c7'); // foam
    px(3, 3, 8, 1, '#fef3c7');
    px(2, 4, 1, 1, '#fef3c7');
    px(11, 4, 1, 1, '#fef3c7');
    px(3, 5, 8, 8, '#f5b070');
    px(3, 5, 1, 8, '#aa7050');
    px(11, 5, 1, 1, '#aa7050');
    px(11, 12, 1, 1, '#aa7050');
    px(11, 6, 2, 6, '#aa7050'); // handle
    px(13, 7, 1, 4, '#aa7050');
    px(11, 7, 1, 4, '#f5b070');
    px(3, 13, 8, 1, '#aa7050');
  },
  shop: (px) => {
    // shopping bag
    px(4, 5, 8, 9, '#C8DCEF');
    px(4, 5, 8, 1, '#88abd0');
    px(3, 6, 1, 7, '#88abd0');
    px(12, 6, 1, 7, '#88abd0');
    px(5, 3, 1, 2, '#88abd0'); // handles
    px(10, 3, 1, 2, '#88abd0');
    px(5, 2, 6, 1, '#88abd0');
    px(7, 8, 2, 3, '#D4A017'); // tag
  },
  home: (px) => {
    // house
    px(7, 2, 2, 1, '#888'); // chimney
    px(7, 3, 2, 2, '#666');
    px(7, 3, 1, 6, '#7a3030'); // roof
    px(8, 3, 1, 1, '#7a3030');
    for (let i = 0; i < 7; i++) {
      px(7 - i, 3 + i, 1, 1, '#7a3030');
      px(8 + i, 3 + i, 1, 1, '#7a3030');
    }
    px(3, 9, 10, 5, '#D4A017');
    px(3, 9, 10, 1, '#a87800');
    px(7, 11, 2, 3, '#3a2818'); // door
    px(5, 11, 1, 1, '#88abd0'); // window
    px(11, 11, 1, 1, '#88abd0');
  },
  tree: (px) => {
    // tree
    px(7, 8, 2, 6, '#3a2818');
    px(4, 4, 8, 5, '#2a5028');
    px(5, 3, 6, 1, '#2a5028');
    px(3, 5, 1, 3, '#2a5028');
    px(12, 5, 1, 3, '#2a5028');
    px(5, 5, 2, 2, '#3a6a38');
    px(8, 6, 1, 1, '#3a6a38');
  },
  coffee: (px) => {
    // coffee cup
    px(4, 4, 7, 1, '#fff'); // steam
    px(5, 3, 1, 1, '#aaa');
    px(8, 3, 1, 1, '#aaa');
    px(4, 5, 7, 8, '#a87858');
    px(4, 5, 7, 1, '#3a1810'); // coffee top
    px(4, 5, 1, 8, '#7a4830');
    px(10, 5, 1, 8, '#7a4830');
    px(11, 7, 2, 4, '#a87858'); // handle
    px(12, 8, 1, 2, '#a87858');
    px(11, 7, 1, 1, '#7a4830');
    px(11, 10, 1, 1, '#7a4830');
    px(4, 13, 7, 1, '#3a1810'); // saucer
  },
};

const PixelIcon = ({ name, size = 16, className = '' }) => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const pixelSize = size / 16;
    canvas.width = size;
    canvas.height = size;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);
    const drawer = PIXEL_ICONS[name];
    if (!drawer) {
      // fallback: a simple square
      ctx.fillStyle = '#666';
      ctx.fillRect(2, 2, 12, 12);
      return;
    }
    const px = (x, y, w, h, c) => {
      ctx.fillStyle = c;
      ctx.fillRect(x * pixelSize, y * pixelSize, w * pixelSize, h * pixelSize);
    };
    drawer(px);
  }, [name, size]);
  return (
    <canvas ref={canvasRef}
      className={className}
      width={size} height={size}
      style={{ imageRendering: 'pixelated', width: size, height: size }} />
  );
};

const ProgressBar = ({ block, total = 5, label, color = '#D4A017' }) => (
  <div className="space-y-1">
    {label && <div className="text-[10px] uppercase tracking-widest text-stone-500">{label}</div>}
    <div className="flex gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex-1 h-3 border border-stone-700 bg-stone-900 overflow-hidden">
          <div className="h-full transition-all"
            style={{ width: i < block ? '100%' : i === block ? '50%' : '0%', background: color }} />
        </div>
      ))}
    </div>
  </div>
);


// ============ COMPONENTS ============

const Bar = ({ value, max, color, icon: Icon, label }) => (
  <div className="flex items-center gap-2">
    {Icon && <Icon size={14} className="text-stone-400" />}
    <div className="flex-1">
      <div className="flex justify-between text-[10px] uppercase tracking-widest text-stone-500 mb-0.5">
        <span>{label}</span>
        <span>{Math.round(value)}/{max}</span>
      </div>
      <div className="h-2 bg-stone-900 border border-stone-800">
        <div className="h-full transition-all" style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`, background: color }} />
      </div>
    </div>
  </div>
);

const Btn = ({ children, onClick, disabled, variant = 'default', className = '' }) => {
  const styles = {
    default: 'bg-stone-900 border-stone-700 hover:border-amber-500 text-stone-200',
    primary: 'bg-amber-500 border-amber-600 hover:bg-amber-400 text-stone-950',
    danger: 'bg-red-900 border-red-700 hover:bg-red-800 text-red-100',
    ghost: 'bg-transparent border-stone-800 hover:border-stone-600 text-stone-400',
  };
  return (
    <button onClick={onClick} disabled={disabled}
      className={`px-3 py-2 border-2 font-mono text-xs uppercase tracking-wider transition-all disabled:opacity-30 disabled:cursor-not-allowed ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
};

const Panel = ({ children, title, className = '' }) => (
  <div className={`bg-stone-950/80 border-2 border-stone-800 ${className}`}>
    {title && <div className="border-b-2 border-stone-800 px-3 py-2 bg-stone-900/50">
      <div className="text-amber-500 font-mono text-xs uppercase tracking-[0.2em]">{title}</div>
    </div>}
    <div className="p-3">{children}</div>
  </div>
);

// ============ CUTSCENE ============
// Beat-based narrative cinematics. Each "beat" has an optional pixel-art scene
// drawer (function (ctx, frameCount) => void) and an array of text lines.

const PixelScene = ({ draw, w = 200, h = 130, scale = 3 }) => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    let raf, fc = 0;
    const loop = () => {
      fc++;
      ctx.save();
      ctx.scale(scale, scale);
      ctx.fillStyle = '#0c0a09';
      ctx.fillRect(0, 0, w, h);
      try { draw(ctx, fc); } catch (e) { /* swallow scene errors */ }
      ctx.restore();
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [draw, w, h, scale]);
  return (
    <canvas ref={canvasRef}
      style={{ imageRendering: 'pixelated', width: '100%', aspectRatio: `${w}/${h}` }}
      className="block border-2 border-stone-800" />
  );
};

const Cutscene = ({ speaker = null, speakerColor = '#D4A017', beats, lines, onComplete }) => {
  const allBeats = beats || (lines ? [{ lines }] : []);
  const [beatIdx, setBeatIdx] = useState(0);
  const [lineIdx, setLineIdx] = useState(0);
  const beat = allBeats[beatIdx];
  const beatLines = beat?.lines || [];
  const isLastLine = lineIdx + 1 >= beatLines.length;
  const isLastBeat = beatIdx + 1 >= allBeats.length;
  const isFinal = isLastLine && isLastBeat;
  const advance = () => {
    if (isFinal) onComplete?.();
    else if (isLastLine) { setBeatIdx(b => b + 1); setLineIdx(0); }
    else setLineIdx(l => l + 1);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5"
      style={{ background: 'radial-gradient(circle at center, #1c1917 0%, #0c0a09 100%)' }}>
      <button onClick={onComplete}
        className="absolute top-4 right-4 text-stone-500 text-[10px] uppercase tracking-widest hover:text-amber-500 px-2 py-1">
        Skip →
      </button>
      <div className="max-w-md w-full space-y-4">
        {beat?.drawScene && (
          <div key={beatIdx} style={{ animation: 'cutFade 0.5s ease-out' }}>
            <PixelScene draw={beat.drawScene} />
          </div>
        )}
        {speaker && (
          <div className="text-[11px] uppercase tracking-[0.4em]"
            style={{ color: speakerColor, fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
            {speaker}
          </div>
        )}
        <div key={`${beatIdx}-${lineIdx}`} className="text-stone-100 text-xl leading-snug min-h-[3em]"
          style={{ fontFamily: '"Oswald", "Bebas Neue", sans-serif', fontWeight: 300, letterSpacing: '0.02em', animation: 'cutFade 0.4s ease-out' }}>
          {beatLines[lineIdx]}
        </div>
        <button onClick={advance}
          className="text-amber-500 text-3xl active:scale-90 transition-transform">
          {isFinal ? 'OK' : '→'}
        </button>
        <div className="flex gap-1 pt-1">
          {allBeats.map((_, i) => (
            <div key={i} className="h-0.5 flex-1 transition-colors"
              style={{ background: i < beatIdx ? '#D4A017' : i === beatIdx ? '#a8740a' : '#3a3530' }} />
          ))}
        </div>
      </div>
      <style>{`
        @keyframes cutFade {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

// ============ INTRO SCENE DRAWERS (pixel art) ============

const drawOffice = (ctx, fc) => {
  const W = 200;
  _px(ctx, 0, 0, W, 100, '#454e5e');
  _px(ctx, 0, 100, W, 30, '#2a2820');
  _px(ctx, 110, 12, 78, 38, '#5a7090');
  _px(ctx, 110, 12, 78, 1, '#1a1a1a');
  _px(ctx, 110, 50, 78, 1, '#1a1a1a');
  _px(ctx, 110, 12, 1, 38, '#1a1a1a');
  _px(ctx, 187, 12, 1, 38, '#1a1a1a');
  _px(ctx, 148, 12, 1, 38, '#1a1a1a');
  for (let i = 0; i < 8; i++) {
    const bx = 112 + i * 9, bh = 14 + (i % 3) * 8;
    _px(ctx, bx, 50 - bh, 8, bh, '#252a38');
    if ((fc + i) % 12 < 8) _px(ctx, bx + 3, 52 - bh, 1, 1, '#fef3c7');
  }
  _px(ctx, 178, 0, 22, 100, '#3a3a42');
  _px(ctx, 22, 76, 110, 5, '#7a5a40');
  _px(ctx, 22, 81, 110, 24, '#4a3a28');
  _px(ctx, 26, 105, 4, 8, '#2a1808');
  _px(ctx, 124, 105, 4, 8, '#2a1808');
  _px(ctx, 42, 44, 50, 32, '#0a0a0a');
  _px(ctx, 45, 47, 44, 26, fc % 14 < 11 ? '#5a8a3a' : '#3a5a2a');
  ctx.fillStyle = '#0c0a09';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('AI', 67, 65);
  _px(ctx, 62, 76, 10, 4, '#1a1a1a');
  _px(ctx, 100, 56, 25, 20, '#a87844');
  _px(ctx, 100, 56, 25, 2, '#c89a64');
  _px(ctx, 105, 54, 14, 4, '#a87844');
  _px(ctx, 102, 62, 21, 1, '#5a3a18');
  _px(ctx, 56, 92, 22, 4, '#3a2818');
  _px(ctx, 56, 92, 3, 18, '#3a2818');
  _px(ctx, 75, 92, 3, 18, '#3a2818');
  _px(ctx, 62, 88, 12, 6, '#5a6068');
  _px(ctx, 64, 80, 8, 9, '#d4a87a');
  _px(ctx, 64, 80, 8, 3, '#1a1a2e');
  if (fc % 90 < 4) {
    ctx.globalAlpha = 0.18;
    _px(ctx, 0, 0, W, 100, '#fef3c7');
    ctx.globalAlpha = 1;
  }
};

const drawBedroom = (ctx, fc) => {
  const W = 200;
  _px(ctx, 0, 0, W, 95, '#3a3540');
  _px(ctx, 0, 95, W, 35, '#3a2818');
  _px(ctx, 130, 15, 50, 45, '#1a0d2e');
  _px(ctx, 130, 15, 50, 1, '#1a1a1a');
  _px(ctx, 130, 60, 50, 1, '#1a1a1a');
  _px(ctx, 130, 15, 1, 45, '#1a1a1a');
  _px(ctx, 179, 15, 1, 45, '#1a1a1a');
  _px(ctx, 154, 15, 1, 45, '#1a1a1a');
  for (let i = 0; i < 14; i++) {
    const sx = 132 + (i * 4) % 46;
    const sy = 18 + (i * 7) % 38;
    if ((fc + i * 5) % 60 < 50) _px(ctx, sx, sy, 1, 1, i % 2 ? '#fbbf24' : '#fef3c7');
  }
  _px(ctx, 8, 95, 80, 25, '#a87844');
  _px(ctx, 8, 95, 80, 2, '#c89a64');
  _px(ctx, 8, 117, 80, 3, '#5a3a18');
  _px(ctx, 12, 92, 24, 8, '#dac0a0');
  _px(ctx, 100, 70, 30, 25, '#5a4030');
  _px(ctx, 100, 70, 30, 2, '#7a5a40');
  _px(ctx, 110, 50, 8, 20, '#1a1a1a');
  _px(ctx, 105, 45, 18, 6, '#fbbf24');
  if (fc % 6 < 3) {
    ctx.fillStyle = 'rgba(254, 243, 199, 0.22)';
    ctx.fillRect(95, 50, 35, 50);
  }
  // Budget sheet on the table — red numbers doing the math, in case you missed
  // the point that the bills are bigger than the savings.
  const sx = 99, sy = 78;
  _px(ctx, sx, sy, 32, 15, '#f0e4c8');           // paper
  _px(ctx, sx, sy, 32, 1, '#c0a070');            // top shadow line
  _px(ctx, sx + 31, sy, 1, 15, '#c0a070');       // right shadow line
  ctx.font = 'bold 5px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#3a2818';
  ctx.fillText('RENT',  sx + 2, sy + 5);
  ctx.fillText('FOOD',  sx + 2, sy + 9);
  ctx.fillText('BAL',   sx + 2, sy + 14);
  // Red numbers — pulse subtly to draw the eye
  ctx.fillStyle = (fc % 60 < 30) ? '#dc2626' : '#9a1a1a';
  ctx.textAlign = 'right';
  ctx.fillText('-800',  sx + 30, sy + 5);
  ctx.fillText('-50',   sx + 30, sy + 9);
  ctx.fillText('-123',  sx + 30, sy + 14);
  // Underline above total
  _px(ctx, sx + 14, sy + 11, 16, 1, '#3a2818');
  // Pencil next to the paper
  _px(ctx, sx - 6, sy + 13, 7, 1, '#fbbf24');
  _px(ctx, sx - 7, sy + 13, 1, 1, '#3a2818');    // tip
  _px(ctx, sx + 1, sy + 13, 2, 1, '#dc2626');    // eraser
};

const drawPhone = (ctx, fc) => {
  const W = 200, H = 130;
  _px(ctx, 0, 0, W, H, '#0a0a14');
  for (let i = 0; i < 26; i++) {
    const x = (i * 17 + 5) % W;
    const y = (i * 13 + 3) % H;
    _px(ctx, x, y, 1, 1, '#1c1c2a');
  }
  _px(ctx, 70, 78, 60, 50, '#2a1f1a');
  _px(ctx, 75, 70, 50, 10, '#5a3a20');
  _px(ctx, 84, 30, 32, 65, '#1c1917');
  _px(ctx, 87, 35, 26, 55, '#0c0a09');
  for (let i = 0; i < 14; i++) {
    const x = 89 + i * 2;
    const amp = 4 + Math.abs(Math.sin((fc + i * 6) * 0.18) * 14);
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(x, 60 - amp / 2, 1, amp);
  }
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(94, 80, 1, 4);
  ctx.fillRect(98, 78, 1, 6);
  ctx.fillRect(102, 80, 1, 4);
  ctx.fillStyle = 'rgba(34, 211, 238, 0.10)';
  ctx.fillRect(70, 22, 60, 80);
  if (fc % 5 < 2) {
    ctx.fillStyle = 'rgba(34, 211, 238, 0.04)';
    ctx.fillRect(0, 0, W, H);
  }
};

const drawMirror = (ctx, fc) => {
  const W = 200;
  _px(ctx, 0, 0, W, 95, '#2a253a');
  _px(ctx, 0, 95, W, 35, '#3a2818');
  _px(ctx, 60, 8, 80, 104, '#5a4030');
  _px(ctx, 65, 13, 70, 94, '#1c1917');
  const shirt = '#a78bfa', skin = '#d4a87a', hair = '#1a1a2e';
  _px(ctx, 88, 78, 22, 24, shirt);
  _px(ctx, 88, 78, 22, 2, '#fff');
  _px(ctx, 84, 80, 4, 16, shirt);
  _px(ctx, 110, 80, 4, 16, shirt);
  _px(ctx, 110, 88, 4, 5, skin);
  _px(ctx, 113, 65, 3, 22, '#888');
  _px(ctx, 112, 62, 5, 4, '#aaa');
  _px(ctx, 89, 56, 20, 20, skin);
  _px(ctx, 89, 53, 20, 5, hair);
  if (fc % 180 < 6) {
    _px(ctx, 94, 64, 3, 1, skin);
    _px(ctx, 102, 64, 3, 1, skin);
  } else {
    _px(ctx, 94, 64, 3, 2, '#0c0a09');
    _px(ctx, 102, 64, 3, 2, '#0c0a09');
  }
  _px(ctx, 96, 70, 7, 1, '#3a1010');
  if (fc % 40 < 20) {
    ctx.fillStyle = 'rgba(254, 243, 199, 0.05)';
    ctx.fillRect(65, 13, 70, 94);
  }
};

const drawDoor = (ctx, fc) => {
  const W = 200, H = 130;
  _px(ctx, 0, 0, W, H, '#1a1820');
  _px(ctx, 50, 8, 100, 112, '#2a1f1a');
  _px(ctx, 56, 14, 88, 100, '#1a0d2e');
  for (let i = 0; i < 6; i++) {
    const bx = 58 + i * 14;
    const bh = 28 + (i % 3) * 14;
    _px(ctx, bx, 70 - bh, 12, bh, '#252a38');
    for (let j = 0; j < 3; j++) {
      if ((fc + i * 2 + j * 3) % 18 < 13) {
        _px(ctx, bx + 2 + j * 4, 75 - bh + j * 8, 2, 2, '#fbbf24');
      }
    }
  }
  if (fc % 14 < 10) {
    ctx.fillStyle = '#fb7185';
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CYPHER', 100, 38);
  } else if (fc % 14 < 12) {
    ctx.fillStyle = '#7a3a40';
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CYPHER', 100, 38);
  }
  const stand = fc % 24 < 12 ? 0 : 1;
  _px(ctx, 92, 70 + stand, 16, 50, '#0c0a09');
  _px(ctx, 94, 60 + stand, 12, 12, '#0c0a09');
  _px(ctx, 107, 60 + stand, 1, 60, '#fbbf24');
  _px(ctx, 0, 117, W, 13, '#3a2818');
  _px(ctx, 0, 117, W, 1, '#5a4030');
  _px(ctx, 50, 117, 100, 1, '#fbbf24');
};

const INTRO_BEATS = [
  { drawScene: drawOffice, lines: [
    'three years at the desk.',
    'one HR meeting. one cardboard box.',
    "they said the AI's just faster.",
  ]},
  { drawScene: drawBedroom, lines: [
    "rent's due sunday.",
    'the savings ran out tuesday.',
    "you do the math twice. it doesn't get better.",
  ]},
  { drawScene: drawPhone, lines: [
    "you've been beatboxing in your bedroom since you were fourteen.",
    'never on a stage. never for money.',
    '312 followers. half of them bots.',
  ]},
  { drawScene: drawMirror, lines: [
    'the parents would take you back.',
    "that's the worst part — they would.",
    'so you tell yourself: not yet.',
  ]},
  { drawScene: drawDoor, lines: [
    'practice every day.',
    'busk till the jar fills up.',
    'and tonight — tonight you go to the cypher.',
  ]},
];

// ============ SLOTS SCREEN ============
// Five save slots. User can switch between, create new, or delete characters.

function SlotsScreen({ activeSlot, onSwitch, onDelete, onBack = null }) {
  const [slots, setSlots] = useState(null); // array of (char | null)
  const [confirmDelete, setConfirmDelete] = useState(null); // slot number being confirmed
  const [confirmText, setConfirmText] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    loadAllSlots().then(setSlots);
  }, [refreshKey]);

  const handleDelete = async (n) => {
    await onDelete(n);
    setConfirmDelete(null);
    setConfirmText('');
    setRefreshKey(k => k + 1);
  };

  if (!slots) {
    return (
      <div className="text-center py-20 text-stone-500 uppercase tracking-widest text-xs">Loading…</div>
    );
  }

  return (
    <div className="space-y-3 pt-4">
      <div className="text-center mb-2">
        <div className="text-3xl tracking-widest text-amber-500" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
          BEATBOXERS
        </div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Pick a character or start fresh</div>
      </div>

      {slots.map((slot, idx) => {
        const slotN = idx + 1;
        const isActive = activeSlot === slotN;
        const isFilled = slot && slot.created;
        const isConfirming = confirmDelete === slotN;

        return (
          <div key={slotN}
            className={`border-2 transition-all ${
              isActive ? 'border-amber-500 bg-amber-500/5' :
              isFilled ? 'border-stone-700 bg-stone-900/40' :
              'border-stone-800 bg-stone-950/40 border-dashed'
            }`}>
            {!isConfirming ? (
              <button onClick={() => onSwitch(slotN)}
                className="w-full p-4 flex items-center gap-4 text-left hover:bg-stone-900/30 transition-all">
                <div className="w-10 h-10 border-2 flex items-center justify-center text-sm font-mono"
                  style={{
                    borderColor: isFilled ? (slot.color || '#D4A017') : '#44403c',
                    background: isFilled ? `${slot.color || '#D4A017'}22` : 'transparent',
                    color: isFilled ? (slot.color || '#D4A017') : '#57534e',
                  }}>
                  {slotN}
                </div>
                <div className="flex-1">
                  {isFilled ? (
                    <>
                      <div className="flex items-center gap-2">
                        <div className="text-stone-100 text-base tracking-wider"
                          style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
                          {slot.name || 'UNNAMED'}
                        </div>
                        {isActive && (
                          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 bg-amber-500 text-stone-950 font-bold">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-stone-500 uppercase tracking-wider mt-0.5">
                        Lvl {slot.level || 1} · Day {slot.day || 1} · ${slot.cash || 0} · {slot.followers || 0} fans
                      </div>
                      <div className="text-[10px] text-stone-600 uppercase tracking-wider mt-0.5">
                        Mus {slot.stats?.mus || 0} · Tec {slot.stats?.tec || 0} · Ori {slot.stats?.ori || 0} · Sho {slot.stats?.sho || 0}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-stone-500 text-sm tracking-wider"
                        style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
                        EMPTY SLOT
                      </div>
                      <div className="text-[10px] text-stone-600 uppercase tracking-wider mt-0.5">
                        Tap to create new character
                      </div>
                    </>
                  )}
                </div>
                {isFilled && !isActive && (
                  <span className="text-stone-600 text-[10px] uppercase tracking-wider">Switch →</span>
                )}
                {isFilled && isActive && (
                  <span className="text-amber-500 text-[10px] uppercase tracking-wider">Continue →</span>
                )}
                {!isFilled && (
                  <span className="text-stone-600 text-2xl">+</span>
                )}
              </button>
            ) : (
              // Delete confirmation state — must type DELETE
              <div className="p-4 space-y-3">
                <div className="text-red-400 text-sm uppercase tracking-widest">⚠ Delete {slot.name}?</div>
                <div className="text-[11px] text-stone-400">
                  This will permanently erase this character. Type <span className="text-red-400 font-mono font-bold">DELETE</span> below to confirm:
                </div>
                <input
                  type="text"
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                  placeholder="Type DELETE"
                  autoFocus
                  className="w-full px-3 py-2 bg-stone-950 border-2 border-red-900 text-stone-200 font-mono text-sm placeholder-stone-700 focus:border-red-500 outline-none uppercase tracking-wider"
                />
                <div className="flex gap-2">
                  <button onClick={() => { setConfirmDelete(null); setConfirmText(''); }}
                    className="flex-1 py-2 border-2 border-stone-700 text-stone-400 text-[11px] uppercase tracking-widest hover:border-stone-500">
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDelete(slotN)}
                    disabled={confirmText !== 'DELETE'}
                    className="flex-1 py-2 border-2 border-red-700 bg-red-900/30 text-red-300 text-[11px] uppercase tracking-widest hover:bg-red-900/50 disabled:opacity-30 disabled:cursor-not-allowed">
                    Delete forever
                  </button>
                </div>
              </div>
            )}

            {/* Delete trigger - only show on filled non-confirming slots */}
            {isFilled && !isConfirming && (
              <button onClick={() => setConfirmDelete(slotN)}
                className="w-full px-4 py-1.5 border-t border-stone-800 text-[10px] text-stone-600 hover:text-red-400 uppercase tracking-widest transition-colors text-right">
                🗑 Delete
              </button>
            )}
          </div>
        );
      })}

      {onBack && (
        <button onClick={onBack}
          className="w-full mt-4 py-2 border-2 border-stone-800 text-stone-500 text-[11px] uppercase tracking-widest hover:border-stone-600">
          ← Back to game
        </button>
      )}
    </div>
  );
}

// ============ MAIN APP ============

export default function BeatboxStory() {
  const [char, setChar] = useState(null);
  const [screen, setScreen] = useState('loading');
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState(null);
  const [activeSlot, setActiveSlotState] = useState(null); // 1..5, null if none
  // Active narrative cutscene. Shape: { speaker, speakerColor, lines, onComplete }
  // (onComplete handles both advance-past-end and skip.)
  const [cutscene, setCutscene] = useState(null);
  // Pause the activity tick + time progression while a cutscene is up
  useEffect(() => { setGamePaused(!!cutscene); }, [cutscene]);
  // Queue a cutscene + a story flag to set when it ends. flagPath e.g. 'introSeen'.
  const playCutscene = (props, flagPath, after) => {
    setCutscene({ ...props, onComplete: () => {
      setCutscene(null);
      if (flagPath) {
        setChar(c => c ? { ...c, storyFlags: { ...(c.storyFlags || {}), [flagPath]: true } } : c);
      }
      after?.();
    }});
  };

  // Apply migrations to a loaded character object (handles old saves missing new fields)
  const migrateChar = (c) => {
    if (!c) return c;
    if (typeof c.minutes !== 'number') c.minutes = 0;
    if (c.voiceRange === undefined) c.voiceRange = null;
    if (c.voiceRangeMidi === undefined) c.voiceRangeMidi = null;
    if (typeof c.maxEnergy !== 'number') c.maxEnergy = 100;
    if (typeof c.tecLessonsCompleted !== 'number') c.tecLessonsCompleted = 0; // 0 = none completed yet, only lesson 1 unlocked
    if (typeof c.tecCurrentLesson !== 'number') c.tecCurrentLesson = 0; // index into curriculum
    if (typeof c.tecBpm !== 'number') c.tecBpm = 90;
    if (typeof c.oriBpm !== 'number') c.oriBpm = 100;
    if (c.oriPattern === undefined) c.oriPattern = null;
    // Migrate single oriPattern → oriSlots[0], seed the rest with starter patterns
    if (!Array.isArray(c.oriSlots)) {
      const slots = _seqDefaultSlots();
      if (c.oriPattern && Array.isArray(c.oriPattern.tracks) && c.oriPattern.tracks.length > 0) {
        slots[0] = { name: c.oriPattern.name || 'Custom', tracks: c.oriPattern.tracks };
      }
      c.oriSlots = slots;
    }
    if (typeof c.oriSlotIdx !== 'number' || c.oriSlotIdx < 0 || c.oriSlotIdx >= SEQ_SLOTS) c.oriSlotIdx = 0;
    if (c.pendingDebuff === undefined) c.pendingDebuff = null;
    if (c.showcaseBooking === undefined) c.showcaseBooking = null;
    if (c.lastShowcaseDay === undefined) c.lastShowcaseDay = null;
    if (c.lastBattleDay === undefined) c.lastBattleDay = null;
    if (typeof c.skin !== 'string') c.skin = '#d4a87a';
    if (typeof c.hairColor !== 'string') c.hairColor = '#1a1a2e';
    if (typeof c.hairStyle !== 'string') c.hairStyle = 'short';
    if (typeof c.openMicCount !== 'number') c.openMicCount = 0;
    if (!c.storyFlags || typeof c.storyFlags !== 'object') c.storyFlags = {};
    return c;
  };

  // On mount: migrate legacy save, find active slot, load it (or show slots picker)
  useEffect(() => {
    (async () => {
      await migrateLegacy();
      const slot = await getActiveSlot();
      if (slot) {
        const c = await loadSlot(slot);
        if (c && c.created) {
          setChar(migrateChar(c));
          setActiveSlotState(slot);
          await loadSamplesForSlot(slot);
          setScreen('hood');
          setLoaded(true);
          return;
        }
      }
      // No active slot or it's empty — show the slots picker
      setScreen('slots');
      setLoaded(true);
    })();
  }, []);

  // Save the active slot whenever char changes (post-load).
  useEffect(() => {
    if (char && char.created && loaded && activeSlot) saveSlot(activeSlot, char);
  }, [char, loaded, activeSlot]);

  // Switch to a different character slot (or to a new one)
  const switchToSlot = async (n) => {
    const c = await loadSlot(n);
    if (c && c.created) {
      setChar(migrateChar(c));
      setActiveSlotState(n);
      await setActiveSlot(n);
      await loadSamplesForSlot(n); // load that character's custom samples
      setScreen('hood');
    } else {
      // Empty slot → intro cutscene → character creation
      setChar(initialChar());
      setActiveSlotState(n);
      await setActiveSlot(n);
      await loadSamplesForSlot(n);
      playCutscene({ beats: INTRO_BEATS }, 'introSeen', () => setScreen('create'));
    }
  };

  // Delete a slot. Only the active char is rendered, so if active is deleted we go back to picker.
  const deleteSlotAt = async (n) => {
    await deleteSlot(n);
    if (activeSlot === n) {
      setChar(null);
      setActiveSlotState(null);
      setScreen('slots');
    }
  };

  const showToast = (msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2200);
  };

  const update = (patch) => setChar(c => ({ ...c, ...patch }));
  const updateStats = (patch) => setChar(c => ({ ...c, stats: { ...c.stats, ...patch } }));

  const passTime = (energyCost = 0) => {
    setChar(c => ({
      ...c,
      energy: Math.max(0, c.energy - energyCost),
      hunger: Math.max(0, c.hunger - 5),
      mood: Math.max(0, c.mood - 2),
    }));
  };

  const checkLevelUp = (c) => {
    const need = c.level * 100;
    if (c.xp >= need) {
      showToast(`LEVEL UP! → ${c.level + 1}`, 'win');
      return { ...c, level: c.level + 1, xp: c.xp - need };
    }
    return c;
  };

  if (!loaded) {
    return <div className="min-h-screen bg-stone-950 flex items-center justify-center text-amber-500 font-mono">LOADING...</div>;
  }

  // The slots screen renders without an active character
  if (screen === 'slots' && !char) {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-200 font-mono">
        <div className="max-w-md mx-auto min-h-screen border-x border-stone-900 p-3">
          <SlotsScreen
            activeSlot={activeSlot}
            onSwitch={switchToSlot}
            onDelete={deleteSlotAt}
            onBack={null}
          />
        </div>
      </div>
    );
  }

  if (!char) {
    return <div className="min-h-screen bg-stone-950 flex items-center justify-center text-amber-500 font-mono">LOADING...</div>;
  }

  const palette = TIME_PALETTES[timeOfDay(char?.minutes ?? 0)];

  return (
    <div className="min-h-screen text-stone-200 font-mono transition-colors duration-1000"
      style={{
        background: palette.bg,
        backgroundImage: `radial-gradient(circle at 20% 10%, ${palette.glow} 0%, transparent 50%),
                          radial-gradient(circle at 80% 80%, rgba(204,34,0,0.06) 0%, transparent 50%),
                          repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.01) 2px, rgba(255,255,255,0.01) 4px)`
      }}>
      <div className="max-w-md mx-auto min-h-screen border-x border-stone-900 relative">

        {/* HEADER */}
        {char && char.created && screen !== 'slots' && (
          <div className="sticky top-0 z-20 bg-stone-950/95 backdrop-blur border-b-2 border-stone-800">
            <div className="px-3 py-2 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] uppercase tracking-[0.3em] text-amber-500">{DAY_NAMES_SHORT[dayOfWeek(char.day)]}</span>
                  <span className="text-[9px] uppercase tracking-[0.3em] text-stone-500">Day {char.day}</span>
                  <Clock minutes={char.minutes ?? 0} day={char.day} />
                </div>
                <div className="text-amber-500 font-bold tracking-wider text-sm" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
                  {char.name.toUpperCase()} <span className="text-stone-500">·</span> LVL {char.level}
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="text-right">
                  <div className="text-amber-400 font-bold text-sm">${char.cash}</div>
                  <div className="text-[9px] text-stone-500 uppercase tracking-widest">{char.followers} fans</div>
                </div>
                <button
                  onClick={() => setScreen('slots')}
                  aria-label="Profiles & save slots"
                  title="Profiles & save slots"
                  className="w-8 h-8 flex items-center justify-center text-stone-500 hover:text-amber-500 border border-stone-800 hover:border-amber-500/50 transition-all">
                  ⚙
                </button>
              </div>
            </div>
            <div className="px-3 pb-2 grid grid-cols-3 gap-2">
              <Bar value={char.energy} max={char.maxEnergy ?? 100} color="#D4A017" icon={Zap} label="Energy" />
              <Bar value={char.hunger} max={100} color="#84cc16" icon={Coffee} label="Fed" />
              <Bar value={char.mood} max={100} color="#C8DCEF" icon={Heart} label="Mood" />
            </div>
            <div className="px-3 pb-2">
              <div className="h-1 bg-stone-900">
                <div className="h-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all"
                  style={{ width: `${(char.xp / (char.level * 100)) * 100}%` }} />
              </div>
            </div>
          </div>
        )}

        {/* TOAST */}
        {cutscene && <Cutscene {...cutscene} />}

        {toast && (
          <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 max-w-xs">
            <div className={`px-4 py-2 border-2 font-mono text-xs uppercase tracking-wider ${
              toast.type === 'win' ? 'bg-amber-500 border-amber-600 text-stone-950' :
              toast.type === 'bad' ? 'bg-red-900 border-red-700 text-red-100' :
              'bg-stone-900 border-stone-700 text-stone-200'
            }`}>{toast.msg}</div>
          </div>
        )}

        {/* SCREENS */}
        <div className="p-3 pb-20">
          {screen === 'slots' && (
            <SlotsScreen
              activeSlot={activeSlot}
              onSwitch={switchToSlot}
              onDelete={deleteSlotAt}
              onBack={char && char.created && activeSlot ? () => setScreen('hood') : null}
            />
          )}
          {screen === 'create' && <CreateScreen char={char} setChar={setChar} onDone={() => { setChar(c => ({ ...c, created: true })); setScreen('hood'); }} />}
          {screen === 'hood' && <HoodScreen go={setScreen} char={char} />}
          {screen === 'house' && <HouseScreen char={char} update={update} updateStats={updateStats} passTime={passTime} setChar={setChar} checkLevelUp={checkLevelUp} showToast={showToast} go={setScreen} activeSlot={activeSlot} />}
          {screen === 'shop' && <ShopScreen char={char} setChar={setChar} showToast={showToast} go={setScreen} />}
          {screen === 'park' && <ParkScreen char={char} setChar={setChar} passTime={passTime} showToast={showToast} go={setScreen} checkLevelUp={checkLevelUp} playCutscene={playCutscene} />}
          {screen === 'bar' && <BarScreen char={char} setChar={setChar} go={setScreen} showToast={showToast} checkLevelUp={checkLevelUp} />}
          {screen === 'battle' && <BattleScreen char={char} setChar={setChar} go={setScreen} showToast={showToast} checkLevelUp={checkLevelUp} />}
        </div>

        {/* FOOTER NAV */}
        {char && char.created && screen !== 'battle' && screen !== 'create' && screen !== 'slots' && (
          <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-stone-950 border-t-2 border-stone-800 z-20">
            <div className="grid grid-cols-5 text-[10px]">
              {[
                { id: 'house', label: 'HOUSE', Icon: Home },
                { id: 'park', label: 'PARK', Icon: TreePine },
                { id: 'hood', label: 'HOOD', Icon: Music },
                { id: 'shop', label: 'SHOP', Icon: ShoppingBag },
                { id: 'bar', label: 'BAR', Icon: Beer },
              ].map(t => (
                <button key={t.id} onClick={() => setScreen(t.id)}
                  className={`py-3 flex flex-col items-center gap-1 border-r border-stone-900 last:border-r-0 transition-all ${
                    screen === t.id ? 'text-amber-500 bg-stone-900/50' : 'text-stone-500 hover:text-stone-300'
                  }`}>
                  <t.Icon size={16} />
                  <span className="tracking-widest">{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ SCREEN: CREATE ============

function CreateScreen({ char, setChar, onDone }) {
  const [name, setName] = useState('');
  const colors    = ['#D4A017', '#CC2200', '#C8DCEF', '#84cc16', '#a78bfa', '#fb7185', '#22d3ee', '#f97316'];
  const skins     = ['#f5d4a8', '#d4a87a', '#a87844', '#8a5a3a', '#5a3a20'];
  const hairs     = ['#1a1a2e', '#5a3a18', '#a87044', '#fbbf24', '#9ca3af', '#a78bfa'];
  const styles    = [
    { id: 'short',  label: 'Short' },
    { id: 'fade',   label: 'Fade' },
    { id: 'mohawk', label: 'Mohawk' },
    { id: 'spike',  label: 'Spikes' },
    { id: 'long',   label: 'Long' },
  ];
  const [color, setColor]         = useState(colors[0]);
  const [skin, setSkin]           = useState(skins[1]);
  const [hairColor, setHairColor] = useState(hairs[0]);
  const [hairStyle, setHairStyle] = useState(styles[0].id);

  const previewLook = { shirt: color, skin, hair: hairColor, style: hairStyle, accessory: null };

  return (
    <div className="space-y-4 pt-6">
      <div className="text-center">
        <div className="text-amber-500 text-5xl tracking-tighter font-black" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif', letterSpacing: '-0.02em' }}>
          BEATBOX
        </div>
        <div className="text-stone-300 text-3xl tracking-widest font-light -mt-2" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
          STORY
        </div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.3em] text-stone-500">From bedroom to world champion</div>
      </div>

      <div className="flex justify-center">
        <CharacterPortrait look={previewLook} size={140} active={true} />
      </div>

      <Panel title="Stage Name">
        <input type="text" value={name} onChange={e => setName(e.target.value.slice(0, 16))}
          placeholder="Your beatbox name..."
          className="w-full bg-stone-900 border-2 border-stone-700 px-3 py-2 text-amber-500 font-mono uppercase tracking-wider focus:outline-none focus:border-amber-500" />
      </Panel>

      <Panel title="Shirt color">
        <div className="flex flex-wrap gap-2 justify-center">
          {colors.map(c => (
            <button key={c} onClick={() => setColor(c)}
              className={`w-9 h-9 border-2 transition-all ${color === c ? 'border-white scale-110' : 'border-stone-700'}`}
              style={{ background: c }} />
          ))}
        </div>
      </Panel>

      <Panel title="Skin tone">
        <div className="flex flex-wrap gap-2 justify-center">
          {skins.map(c => (
            <button key={c} onClick={() => setSkin(c)}
              className={`w-9 h-9 border-2 transition-all ${skin === c ? 'border-white scale-110' : 'border-stone-700'}`}
              style={{ background: c }} />
          ))}
        </div>
      </Panel>

      <Panel title="Hair">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2 justify-center">
            {hairs.map(c => (
              <button key={c} onClick={() => setHairColor(c)}
                className={`w-9 h-9 border-2 transition-all ${hairColor === c ? 'border-white scale-110' : 'border-stone-700'}`}
                style={{ background: c }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-1 justify-center">
            {styles.map(s => (
              <button key={s.id} onClick={() => setHairStyle(s.id)}
                className={`px-3 py-1.5 border-2 text-[10px] uppercase tracking-widest ${hairStyle === s.id ? 'border-amber-500 text-amber-500 bg-amber-500/10' : 'border-stone-700 text-stone-400'}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      <Btn variant="primary"
        onClick={() => { setChar(c => ({ ...c, name: name.trim(), color, skin, hairColor, hairStyle })); onDone(); }}
        disabled={name.trim().length < 2} className="w-full text-base py-3">
        ENTER THE CIRCLE →
      </Btn>
    </div>
  );
}

// ============ SCREEN: HOOD ============

function HoodScreen({ go, char }) {
  const mins = char.minutes ?? 0;
  const places = [
    { id: 'house', name: 'The House', desc: 'Train, eat, rest', pixelIcon: 'home', color: '#D4A017' },
    { id: 'park', name: 'The Park', desc: 'Jam, busk, run', pixelIcon: 'tree', color: '#84cc16',
      locked: !isDayTime(mins), lockReason: 'The park is empty at night. Come back at sunrise (6 AM).' },
    { id: 'shop', name: 'The Shop', desc: 'Gear & food', pixelIcon: 'shop', color: '#C8DCEF' },
    { id: 'bar', name: 'The Bar', desc: `Tonight: ${BAR_SCHEDULE[dayOfWeek(char.day)].title}`, pixelIcon: 'beer', color: '#CC2200',
      locked: !isNightTime(mins), lockReason: 'The bar opens at 6 PM. The cypher only happens at night.' },
  ];
  return (
    <div className="space-y-3 pt-4">
      <div className="text-center mb-2">
        <div className="text-2xl tracking-widest text-stone-300" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>THE HOOD</div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Where will you go?</div>
      </div>
      {places.map(p => (
        <button key={p.id} onClick={() => p.locked ? null : go(p.id)} disabled={p.locked}
          className={`w-full p-4 flex items-center gap-4 transition-all group border-2 ${
            p.locked ? 'bg-stone-950/50 border-stone-900 opacity-50 cursor-not-allowed' :
            'bg-stone-900/50 border-stone-800 hover:border-amber-500'
          }`}>
          <div className={`w-14 h-14 border-2 flex items-center justify-center ${p.locked ? 'border-stone-800' : 'border-stone-700 group-hover:border-amber-500'}`}
            style={{ background: p.locked ? '#0c0a0922' : `${p.color}22` }}>
            <PixelIcon name={p.pixelIcon} size={40} className={p.locked ? 'opacity-40' : ''} />
          </div>
          <div className="flex-1 text-left">
            <div className={`tracking-wider text-lg ${p.locked ? 'text-stone-600' : 'text-amber-500'}`} style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
              {p.name} {p.locked && <span className="text-xs">🔒</span>}
            </div>
            <div className="text-[11px] text-stone-500 uppercase tracking-wider">
              {p.locked ? p.lockReason : p.desc}
            </div>
          </div>
          {!p.locked && <div className="text-stone-700 group-hover:text-amber-500 text-2xl">→</div>}
        </button>
      ))}
    </div>
  );
}

// ============ SCREEN: HOUSE ============

function HouseScreen({ char, setChar, passTime, showToast, checkLevelUp, go, activeSlot }) {
  const [tab, setTab] = useState('train');
  const [trainStat, setTrainStat] = useState(null); // 'mus' | 'tec' | 'ori' | 'sho' | null
  const [pendingStart, setPendingStart] = useState(false);
  const [playMode, setPlayMode] = useState(false); // false = AFK, true = pitch tuner mini-game (mus only)
  const [tecInputMode, setTecInputMode] = useState('tap'); // 'tap' | 'mic' for Beatbox Hero
  const [showRangePicker, setShowRangePicker] = useState(false); // shown when user wants to set/change voice range

  const charRef = useRef(char);
  useEffect(() => { charRef.current = char; }, [char]);

  // Latest reported tuner accuracy (0..1) — applied as bonus to musicality reward
  const accuracyRef = useRef(0);
  const handleAccuracy = (acc) => { accuracyRef.current = acc; };

  const trainConfig = {
    mus: { name: 'Musicality', desc: 'Watch beatbox vids on YouTube', tickEnergyCost: 1.5, color: '#D4A017' },
    tec: { name: 'Technicality', desc: 'Drill on Discord with the squad', tickEnergyCost: 2, color: '#C8DCEF' },
    ori: { name: 'Originality', desc: 'Experiment, record loops', tickEnergyCost: 2.5, color: '#a78bfa' },
    sho: { name: 'Showmanship', desc: 'Stream live, work the camera', tickEnergyCost: 1, color: '#CC2200' },
  };

  // Always call hook — pick a default stat config when none selected
  const tCfg = trainConfig[trainStat || 'mus'];
  const trainActivity = useActivity({
    char, setChar, checkLevelUp, showToast,
    config: {
      blocksPerReward: 5,
      // Energy drains slower while engaging with a mini-game (so sessions feel substantial)
      tickEnergyCost: playMode ? tCfg.tickEnergyCost * 0.4 : tCfg.tickEnergyCost,
      tickHungerCost: 1,
      tickMoodDelta: -0.3,
      // Slow ticks down 4x when actively engaging with a mini-game (only mus has one for now,
      // but the slowdown applies to all training when playMode is on so future mini-games inherit)
      tickRealMs: playMode ? 2000 : undefined,
      onReward: () => {
        if (!trainStat) return;
        // For musicality (tuner) and technicality (Beatbox Hero), accuracy gives bonus stat gain.
        let statGain = 1;
        let bonusText = '';
        if (trainStat === 'mus') {
          const acc = accuracyRef.current || 0;
          if (acc >= 0.8) { statGain = 3; bonusText = ' (perfect pitch!)'; }
          else if (acc >= 0.5) { statGain = 2; bonusText = ' (+1 bonus)'; }
        } else if (trainStat === 'tec') {
          // Reward is tied to actual hits — watching demo or missing every note
          // earns 0. Bonuses kick in as accuracy improves.
          const acc = accuracyRef.current || 0;
          if (acc <= 0)        { statGain = 0; }
          else if (acc >= 0.8) { statGain = 3; bonusText = ' (locked in!)'; }
          else if (acc >= 0.5) { statGain = 2; bonusText = ' (+1 bonus)'; }
          else                 { statGain = 1; }
          // Higher BPM = bigger reward (only when there's a base gain)
          if (statGain > 0) {
            const bpmMult = Math.max(1, (charRef.current.tecBpm || 90) / 90);
            if (bpmMult > 1) {
              const before = statGain;
              statGain = Math.round(statGain * bpmMult);
              if (statGain > before) bonusText += ` (×${bpmMult.toFixed(2)} BPM)`;
            }
          }
        } else if (trainStat === 'ori') {
          // Sequencer creativity score → bonus
          const c = accuracyRef.current || 0;
          if (c >= 0.8) { statGain = 3; bonusText = ' (creative!)'; }
          else if (c >= 0.5) { statGain = 2; bonusText = ' (+1 bonus)'; }
        }
        if (statGain > 0) {
          setChar(cc => {
            const updated = { ...cc, xp: cc.xp + 10,
              stats: { ...cc.stats, [trainStat]: cc.stats[trainStat] + statGain } };
            return checkLevelUp(updated);
          });
          showToast(`+${statGain} ${trainConfig[trainStat].name}${bonusText}`, 'win');
        } else {
          // Earned no stat — give a nudge instead of a confusing "+0" toast
          showToast(`Block ended — no ${trainConfig[trainStat].name} gain. Keep playing!`, 'info');
        }
      },
    },
  });

  // When pendingStart is set, kick off training after render commits
  useEffect(() => {
    if (pendingStart && trainStat && !trainActivity.active) {
      setPendingStart(false);
      trainActivity.start();
    }
  }, [pendingStart, trainStat, trainActivity.active]);

  // Reset play mode when training stops
  useEffect(() => {
    if (!trainActivity.active) {
      setPlayMode(false);
      accuracyRef.current = 0;
    }
  }, [trainActivity.active]);

  const eat = (foodKey) => {
    const f = FOOD[foodKey];
    if (char.cash < f.cost) { showToast('Not enough cash', 'bad'); return; }
    setChar(c => ({
      ...c,
      cash: c.cash - f.cost,
      minutes: c.minutes + 5, // eating takes 5 min
      energy: Math.max(0, Math.min(c.maxEnergy ?? 100, c.energy + f.energy)),
      hunger: Math.max(0, Math.min(100, c.hunger + f.hunger)),
      mood: Math.max(0, Math.min(100, c.mood + f.mood)),
    }));
    showToast(`${f.kind === 'drink' ? 'Drank' : 'Ate'} ${f.name}`, 'win');
  };

  const sleep = () => {
    // Can't sleep on an empty stomach — go eat something first
    if ((char.hunger ?? 0) <= 0) {
      showToast('Too hungry to sleep — eat something first!', 'bad');
      return;
    }
    setChar(c => {
      const max = c.maxEnergy ?? 100;
      let energy = max;
      let hunger = Math.max(0, c.hunger - 30);
      let mood = Math.min(100, c.mood + 10);
      // Apply any pending debuff from last night's bar items (hangover/crash etc.)
      const d = c.pendingDebuff;
      if (d) {
        energy = Math.max(0, Math.min(max, energy + (d.energy || 0)));
        hunger = Math.max(0, Math.min(100, hunger + (d.hunger || 0)));
        mood = Math.max(0, Math.min(100, mood + (d.mood || 0)));
      }
      return { ...c, energy, hunger, mood, day: c.day + 1, minutes: 0, pendingDebuff: null };
    });
    showToast(char.pendingDebuff ? 'Slept it off — feeling rough' : 'Slept till morning', char.pendingDebuff ? 'info' : 'win');
  };

  return (
    <div className="space-y-3">
      <div className="text-center mb-2">
        <div className="text-2xl tracking-widest text-stone-300" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>THE HOUSE</div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Your home base</div>
      </div>

      <div className="grid grid-cols-4 gap-1">
        {[['train', 'PC / Train', 'pc'], ['studio', 'Studio', 'mic'], ['eat', 'Kitchen', 'fridge'], ['rest', 'Couch', 'couch']].map(([id, label, icon]) => (
          <button key={id} onClick={() => setTab(id)} disabled={trainActivity.active}
            className={`py-2 border-2 text-[10px] uppercase tracking-widest transition-all disabled:opacity-30 flex flex-col items-center gap-1 ${
              tab === id ? 'border-amber-500 bg-amber-500/10 text-amber-500' : 'border-stone-800 text-stone-500'
            }`}>
            <PixelIcon name={icon} size={20} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {tab === 'train' && (
        <>
          {!trainActivity.active && (
            <Panel title="Tap a stat to start training">
              <div className="space-y-2">
                {Object.entries(trainConfig).map(([key, t]) => {
                  const iconName = key === 'mus' ? 'music' : key === 'tec' ? 'zap' : key === 'ori' ? 'sparkle' : 'crown';
                  return (
                    <button key={key}
                      onClick={() => { setTrainStat(key); setPendingStart(true); }}
                      disabled={char.energy < t.tickEnergyCost}
                      className="w-full flex items-center gap-3 p-2 border-2 border-stone-800 bg-stone-900/30 hover:border-amber-500 disabled:opacity-30 transition-all">
                      <PixelIcon name={iconName} size={28} />
                      <div className="flex-1 text-left">
                        <div className="text-stone-200 text-sm">{t.name} <span className="text-stone-500 text-xs">· {char.stats[key]}</span></div>
                        <div className="text-[10px] text-stone-500 uppercase">{t.desc}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-amber-500 text-xs">START ▶</div>
                        <div className="text-[10px] text-stone-500">-{t.tickEnergyCost}⚡/tick</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Panel>
          )}

          {trainActivity.active && trainStat && (
            <Panel title={`Training ${trainConfig[trainStat].name} — IN PROGRESS`}>
              <div className="space-y-3">
                {trainStat === 'mus' && !playMode && !showRangePicker && (
                  <button onClick={() => {
                    accuracyRef.current = 0;
                    if (!char.voiceRange) {
                      setShowRangePicker(true);
                    } else {
                      setPlayMode(true);
                    }
                  }}
                    className="w-full p-4 border-2 border-amber-500 bg-gradient-to-r from-amber-950/40 to-amber-900/20 hover:from-amber-900/40 hover:to-amber-800/30 transition-all group">
                    <div className="flex items-center gap-3">
                      <div className="text-3xl">🎤</div>
                      <div className="text-left flex-1">
                        <div className="text-amber-500 text-base tracking-wider" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
                          SING ALONG · TAP TO START
                        </div>
                        <div className="text-[11px] text-stone-400 uppercase tracking-wider mt-0.5">
                          Match the notes with your voice → up to ×3 stat gain
                        </div>
                      </div>
                      <div className="text-amber-500 text-xl group-hover:translate-x-1 transition-transform">▶</div>
                    </div>
                  </button>
                )}
                {trainStat === 'mus' && showRangePicker && (
                  <VoiceRangePicker
                    currentRange={char.voiceRange}
                    onSet={({ voiceRange, voiceRangeMidi }) => {
                      setChar(c => ({ ...c, voiceRange, voiceRangeMidi }));
                      setShowRangePicker(false);
                      setPlayMode(true);
                    }}
                    onCancel={() => setShowRangePicker(false)}
                  />
                )}
                {trainStat === 'mus' && playMode && (
                  <>
                    <PitchTuner
                      onAccuracyUpdate={handleAccuracy}
                      evaluateEveryMs={2500}
                      active={trainActivity.active}
                      voiceRange={char.voiceRange || 'higher'}
                      voiceRangeMidi={char.voiceRangeMidi}
                    />
                    <div className="flex gap-2">
                      <button onClick={() => { setPlayMode(false); setShowRangePicker(true); }}
                        className="flex-1 py-2 border border-stone-700 bg-stone-900/50 text-stone-400 text-[10px] uppercase tracking-widest hover:border-amber-500/50 transition-all">
                        🎤 Range: {char.voiceRange === 'lower' ? 'Lower' : char.voiceRange === 'auto' ? 'Auto' : 'Higher'} (change)
                      </button>
                      <button onClick={() => { setPlayMode(false); accuracyRef.current = 0; }}
                        className="flex-1 py-2 border-2 border-stone-700 bg-stone-900/50 text-stone-400 text-xs uppercase tracking-widest hover:border-stone-600 transition-all">
                        ◀ Back to AFK
                      </button>
                    </div>
                  </>
                )}
                {trainStat === 'tec' && !playMode && (
                  <button onClick={() => { accuracyRef.current = 0; setPlayMode(true); }}
                    className="w-full p-4 border-2 border-amber-500 bg-gradient-to-r from-amber-950/40 to-amber-900/20 hover:from-amber-900/40 hover:to-amber-800/30 transition-all group">
                    <div className="flex items-center gap-3">
                      <div className="text-3xl">🎮</div>
                      <div className="text-left flex-1">
                        <div className="text-amber-500 text-base tracking-wider" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
                          BEATBOX HERO · TAP TO START
                        </div>
                        <div className="text-[11px] text-stone-400 uppercase tracking-wider mt-0.5">
                          Hit the notes in time → up to ×3 stat gain
                        </div>
                      </div>
                      <div className="text-amber-500 text-xl group-hover:translate-x-1 transition-transform">▶</div>
                    </div>
                  </button>
                )}
                {trainStat === 'tec' && playMode && (() => {
                  const completed = char.tecLessonsCompleted || 0;
                  const ownedSet = new Set(char.sounds || []);
                  // A lesson is "playable" if (i) progression unlocks it AND (ii) any required sound is owned.
                  const isPlayable = (i) => {
                    if (i > completed) return false;
                    const lesson = HERO_LESSONS[i];
                    if (lesson?.requires && !ownedSet.has(lesson.requires)) return false;
                    return true;
                  };
                  // Current selected lesson — fall back to the highest playable one if invalid.
                  let currentIdx = Math.min(char.tecCurrentLesson || 0, HERO_LESSONS.length - 1);
                  if (!isPlayable(currentIdx)) {
                    for (let j = currentIdx; j >= 0; j--) { if (isPlayable(j)) { currentIdx = j; break; } }
                  }
                  const currentLesson = HERO_LESSONS[currentIdx] || HERO_LESSONS[0];
                  const bpm = char.tecBpm || 90;
                  const bpmMult = Math.max(1, bpm / 90);
                  const stepBpm = (delta) => setChar(c => ({ ...c, tecBpm: Math.max(60, Math.min(140, (c.tecBpm || 90) + delta)) }));
                  return (
                    <>
                      {/* Lesson selector */}
                      <div className="overflow-x-auto -mx-1">
                        <div className="flex gap-1.5 px-1 pb-1">
                          {HERO_LESSONS.map((lesson, i) => {
                            const progressionOk = i <= completed;
                            const needsSound = lesson.requires && !ownedSet.has(lesson.requires);
                            const playable = progressionOk && !needsSound;
                            const selected = i === currentIdx;
                            return (
                              <button key={i}
                                disabled={!playable}
                                onClick={() => setChar(c => ({ ...c, tecCurrentLesson: i }))}
                                className={`flex-shrink-0 px-2.5 py-1.5 border-2 text-[10px] uppercase tracking-widest whitespace-nowrap transition-all ${
                                  selected ? 'border-amber-500 bg-amber-500/10 text-amber-500' :
                                  playable ? 'border-stone-700 text-stone-400 hover:border-amber-500/50' :
                                             'border-stone-800 text-stone-600 opacity-40'
                                }`}>
                                {!playable && '🔒 '}#{i + 1}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="text-center -mt-1">
                        <div className="text-amber-500 text-sm tracking-widest" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
                          #{currentIdx + 1} {currentLesson.name}
                        </div>
                        <div className="text-[10px] text-stone-500 uppercase tracking-wider">{currentLesson.desc}</div>
                        {currentLesson.requires && (
                          <div className="text-[10px] uppercase tracking-wider mt-0.5"
                            style={{ color: ownedSet.has(currentLesson.requires) ? '#22c55e' : '#fbbf24' }}>
                            {ownedSet.has(currentLesson.requires)
                              ? `✓ uses ${SOUND_CATALOG[currentLesson.requires]?.name || currentLesson.requires}`
                              : `🔒 needs ${SOUND_CATALOG[currentLesson.requires]?.name || currentLesson.requires} (buy in shop)`}
                          </div>
                        )}
                      </div>

                      {/* Input mode toggle: tap pads vs beatbox into mic */}
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] uppercase tracking-widest text-stone-500 mr-1">Input</span>
                        <button onClick={() => setTecInputMode('tap')}
                          className={`flex-1 px-2 py-1.5 border-2 text-[10px] uppercase tracking-widest transition-all ${
                            tecInputMode === 'tap'
                              ? 'border-amber-500 bg-amber-500/10 text-amber-500'
                              : 'border-stone-700 text-stone-400 hover:border-amber-500/50'
                          }`}>
                          Tap pads
                        </button>
                        <button onClick={() => setTecInputMode('mic')}
                          className={`flex-1 px-2 py-1.5 border-2 text-[10px] uppercase tracking-widest transition-all ${
                            tecInputMode === 'mic'
                              ? 'border-amber-500 bg-amber-500/10 text-amber-500'
                              : 'border-stone-700 text-stone-400 hover:border-amber-500/50'
                          }`}>
                          🎤 Mic
                        </button>
                      </div>
                      {tecInputMode === 'mic' && (
                        <div className="text-[9px] text-stone-500 uppercase tracking-widest text-center">
                          Tip: headphones recommended · mic pauses during the demo
                        </div>
                      )}

                      <BeatboxHero
                        onAccuracyUpdate={handleAccuracy}
                        inputMode={tecInputMode}
                        onLessonComplete={(idx, accuracy) => {
                          setChar(c => {
                            const next = { ...c };
                            if (idx >= (c.tecLessonsCompleted || 0)) {
                              next.tecLessonsCompleted = Math.min(HERO_LESSONS.length, idx + 1);
                            }
                            if (idx + 1 < HERO_LESSONS.length) {
                              next.tecCurrentLesson = idx + 1;
                            }
                            return next;
                          });
                        }}
                        evaluateEveryMs={2500}
                        active={trainActivity.active}
                        bpm={bpm}
                        lessonIdx={currentIdx}
                      />

                      {/* BPM control */}
                      <div className="flex items-center justify-center gap-3">
                        <button onPointerDown={(e) => { e.preventDefault(); stepBpm(-5); }}
                          className="w-10 h-10 border-2 border-stone-700 text-amber-500 text-xl active:scale-95 hover:border-amber-500/50 transition-all">
                          −
                        </button>
                        <div className="text-center min-w-[90px]">
                          <div className="text-amber-500 text-2xl tracking-wider leading-none" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
                            {bpm} BPM
                          </div>
                          <div className="text-[9px] text-stone-500 uppercase tracking-widest mt-0.5">
                            {bpmMult > 1 ? `×${bpmMult.toFixed(2)} bonus` : 'normal pace'}
                          </div>
                        </div>
                        <button onPointerDown={(e) => { e.preventDefault(); stepBpm(5); }}
                          className="w-10 h-10 border-2 border-stone-700 text-amber-500 text-xl active:scale-95 hover:border-amber-500/50 transition-all">
                          +
                        </button>
                      </div>

                      <button onClick={() => { setPlayMode(false); accuracyRef.current = 0; }}
                        className="w-full py-2 border-2 border-stone-700 bg-stone-900/50 text-stone-400 text-xs uppercase tracking-widest hover:border-stone-600 transition-all">
                        ◀ Back to AFK
                      </button>
                    </>
                  );
                })()}
                {trainStat === 'ori' && !playMode && (
                  <button onClick={() => { accuracyRef.current = 0; setPlayMode(true); }}
                    className="w-full p-4 border-2 border-amber-500 bg-gradient-to-r from-amber-950/40 to-amber-900/20 hover:from-amber-900/40 hover:to-amber-800/30 transition-all group">
                    <div className="flex items-center gap-3">
                      <div className="text-3xl">🥁</div>
                      <div className="text-left flex-1">
                        <div className="text-amber-500 text-base tracking-wider" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
                          BEAT SEQUENCER · TAP TO START
                        </div>
                        <div className="text-[11px] text-stone-400 uppercase tracking-wider mt-0.5">
                          Program your beats → up to ×3 stat gain
                        </div>
                      </div>
                      <div className="text-amber-500 text-xl group-hover:translate-x-1 transition-transform">▶</div>
                    </div>
                  </button>
                )}
                {trainStat === 'ori' && playMode && (
                  <>
                    <Sequencer
                      onCreativityUpdate={handleAccuracy}
                      evaluateEveryMs={2500}
                      active={trainActivity.active}
                      bpm={char.oriBpm || 100}
                      slots={char.oriSlots}
                      slotIdx={char.oriSlotIdx || 0}
                      ownedSounds={char.sounds || []}
                      onPatternChange={(p) => setChar(c => {
                        const slots = (c.oriSlots && c.oriSlots.length === SEQ_SLOTS)
                          ? [...c.oriSlots]
                          : _seqDefaultSlots();
                        const idx = c.oriSlotIdx || 0;
                        slots[idx] = { ...p, name: slots[idx]?.name || p.name };
                        return { ...c, oriSlots: slots };
                      })}
                      onSlotChange={(idx) => setChar(c => ({ ...c, oriSlotIdx: idx }))}
                      onBpmChange={(b) => setChar(c => ({ ...c, oriBpm: b }))}
                    />
                    <button onClick={() => { setPlayMode(false); accuracyRef.current = 0; }}
                      className="w-full py-2 border-2 border-stone-700 bg-stone-900/50 text-stone-400 text-xs uppercase tracking-widest hover:border-stone-600 transition-all">
                      ◀ Back to AFK
                    </button>
                  </>
                )}
                <div className="text-[10px] text-stone-500 uppercase tracking-wider">5 blocks → +1 {trainConfig[trainStat].name}{trainStat === 'mus' ? ' (up to +3 with tuner)' : trainStat === 'tec' ? ' (up to +3 with Beatbox Hero, ×BPM bonus)' : trainStat === 'ori' ? ' (up to +3 with creative beats)' : ''}</div>
                <ProgressBar block={trainActivity.block} total={5} label={`Block ${trainActivity.block}/5`} color={trainConfig[trainStat].color} />
                <div className="flex justify-between text-[10px] uppercase tracking-wider text-stone-500">
                  <span>Stat increases: <span className="text-amber-500">{trainActivity.rewardsEarned}</span></span>
                  <span>1 block = 10 game min ({playMode ? '2s · slow' : '0.5s'})</span>
                </div>
                <Btn variant="danger" onClick={() => trainActivity.stop('Training stopped')} className="w-full py-3">
                  STOP ■
                </Btn>
              </div>
            </Panel>
          )}
        </>
      )}

      {tab === 'studio' && (
        <SoundStudio activeSlot={activeSlot} showToast={showToast} char={char} />
      )}

      {tab === 'eat' && (
        <Panel title="Fridge — wholefood plant-based">
          <div className="space-y-2">
            {Object.entries(FOOD).map(([k, f]) => {
              const foodIcon = f.kind === 'drink' ? 'coffee' : 'star';
              return (
                <div key={k} className="flex items-center gap-3 p-2 border border-stone-800 bg-stone-900/30">
                  <PixelIcon name={foodIcon} size={20} />
                  <div className="flex-1">
                    <div className="text-stone-200 text-sm">{f.name}</div>
                    <div className="text-[10px] text-stone-500 uppercase tracking-wider">
                      {f.energy ? `${f.energy >= 0 ? '+' : ''}${f.energy}⚡ ` : ''}
                      {f.hunger ? `${f.hunger >= 0 ? '+' : ''}${f.hunger}🍴 ` : ''}
                      {f.mood ? `${f.mood >= 0 ? '+' : ''}${f.mood}♥` : ''}
                    </div>
                  </div>
                  <Btn onClick={() => eat(k)} disabled={char.cash < f.cost}>${f.cost}</Btn>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {tab === 'rest' && (
        <Panel title="The Couch">
          <div className="text-center space-y-3">
            <div className="text-stone-400 text-xs uppercase tracking-wider">
              Sleep until 6 AM. Restores full energy & advances a day.
              {char.minutes < 720 && <div className="text-amber-500 mt-1">It's still daytime — are you sure?</div>}
            </div>
            <Btn variant="primary" onClick={sleep} className="w-full py-3">SLEEP 💤</Btn>
          </div>
        </Panel>
      )}
    </div>
  );
}

// ============ SCREEN: SHOP ============

function ShopScreen({ char, setChar, showToast, go }) {
  const sounds = Object.entries(SOUND_CATALOG).filter(([id]) => !char.sounds.includes(id));
  const cost = (s) => s.tier * 80;

  const buy = (id, s) => {
    const c = cost(s);
    if (char.cash < c) { showToast('Not enough cash', 'bad'); return; }
    if (char.followers < s.tier * 50) { showToast(`Need ${s.tier * 50} followers`, 'bad'); return; }
    setChar(ch => ({ ...ch, cash: ch.cash - c, sounds: [...ch.sounds, id] }));
    showToast(`Learned ${s.name}!`, 'win');
  };

  return (
    <div className="space-y-3">
      <div className="text-center mb-2">
        <div className="text-2xl tracking-widest text-stone-300" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>THE SHOP</div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Buy techniques & sounds</div>
      </div>
      <Panel title={`New sounds (${sounds.length} left)`}>
        {sounds.length === 0 ? (
          <div className="text-stone-500 text-center py-4 text-xs uppercase">All sounds learned 👑</div>
        ) : (
          <div className="space-y-2">
            {sounds.map(([id, s]) => {
              const c = cost(s);
              const fNeeded = s.tier * 50;
              const canAfford = char.cash >= c && char.followers >= fNeeded;
              return (
                <div key={id} className="p-2 border border-stone-800 bg-stone-900/30">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-stone-200 text-sm">{s.name}</div>
                    <div className="flex gap-1">{Array.from({ length: s.tier }).map((_, i) => <Star key={i} size={10} className="text-amber-500 fill-amber-500" />)}</div>
                  </div>
                  <div className="text-[10px] text-stone-500 uppercase mb-2 tracking-wider">
                    {s.cat} · {s.base}pts · {s.stamina}⚡ · {s.stat}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] text-stone-500">Need {fNeeded} fans</div>
                    <Btn onClick={() => buy(id, s)} disabled={!canAfford}>${c}</Btn>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Equipped sounds (max 5)">
        <div className="space-y-1 mb-2">
          {char.sounds.map(id => {
            const s = SOUND_CATALOG[id];
            const equipped = char.equipped.includes(id);
            return (
              <div key={id} className="flex items-center justify-between p-2 border border-stone-800 bg-stone-900/30">
                <div className="flex-1">
                  <div className="text-sm text-stone-200">{s.name}</div>
                  <div className="text-[10px] text-stone-500 uppercase">{s.cat} · {s.base}pts</div>
                </div>
                <Btn variant={equipped ? 'primary' : 'ghost'} onClick={() => {
                  setChar(c => {
                    if (equipped) return { ...c, equipped: c.equipped.filter(x => x !== id) };
                    if (c.equipped.length >= 5) { showToast('Max 5 sounds', 'bad'); return c; }
                    return { ...c, equipped: [...c.equipped, id] };
                  });
                }}>{equipped ? 'EQUIPPED' : 'EQUIP'}</Btn>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

// ============ SCREEN: PARK ============

function ParkScreen({ char, setChar, passTime, showToast, go, checkLevelUp, playCutscene }) {
  const [selected, setSelected] = useState(null); // 'busk' | 'jam' | 'run' | null
  const [pendingStart, setPendingStart] = useState(false);
  const [playMode, setPlayMode] = useState(false); // false = AFK pixel art, true = rhythm tap mini-game

  // Refs to capture latest char in onReward closures
  const charRef = useRef(char);
  useEffect(() => { charRef.current = char; }, [char]);

  // Tracks the latest reported accuracy from the rhythm tap mini-game (0..1).
  // Used by the busk onReward to apply a bonus.
  const accuracyRef = useRef(0);
  const handleAccuracy = (acc) => { accuracyRef.current = acc; };

  // RunTracker state: each block reports avg bar position + burn ratio.
  // Burn ratio is used to apply an extra energy penalty during burn-zone running.
  // Good-block ratio modulates the run reward (cash/sho).
  const runBlockRef = useRef({ avg: 0, isGood: false, burnRatio: 0 });
  const handleRunBlock = (result) => { runBlockRef.current = result; };
  // When the RunTracker fires a max-energy gain (every 5 good bars), grow the player's max energy.
  const handleMaxEnergyTick = () => {
    setChar(c => ({
      ...c,
      maxEnergy: Math.min(150, (c.maxEnergy ?? 100) + 1), // soft cap at 150
    }));
    showToast('💪 Max Energy +1', 'win');
  };

  // Each activity: rewards every 5 ticks (= 50 game minutes = 10 real seconds)
  const activities = {
    busk: {
      name: 'Busk',
      desc: 'Perform on the street for tips',
      Icon: Mic,
      pixelIcon: 'mic',
      tickEnergyCost: 2,
      tickHungerCost: 1,
      tickMoodDelta: -0.5,
      label: '5 blocks → cash + maybe a fan',
      onReward: () => {
        const c = charRef.current;
        // Cash scales with total skills, so beginners earn pocket change while
        // a seasoned beatboxer pulls a real crowd.
        const totalSkills = (c.stats.mus || 0) + (c.stats.tec || 0) + (c.stats.ori || 0) + (c.stats.sho || 0);
        const baseEarned = Math.floor(totalSkills / 6) + Math.floor(Math.random() * 3);
        // Bonus from rhythm tap accuracy (0 = no bonus, 1.0 = +100%)
        const acc = accuracyRef.current || 0;
        let bonusMult = 1;
        if (acc >= 0.8) bonusMult = 2.0;
        else if (acc >= 0.5) bonusMult = 1 + (acc - 0.5) / 0.3 * 0.5;
        const earned = Math.floor(baseEarned * bonusMult);
        const fans = Math.random() < 0.4 || acc >= 0.8 ? 1 : 0;
        setChar(cc => {
          const updated = { ...cc, cash: cc.cash + earned, followers: cc.followers + fans, xp: cc.xp + 6 };
          return checkLevelUp(updated);
        });
        const bonusText = bonusMult > 1 ? ` (${Math.round((bonusMult - 1) * 100)}% bonus!)` : '';
        showToast(`+$${earned}${fans ? ' +1 fan' : ''}${bonusText}`, 'win');
      },
    },
    jam: {
      name: 'Jam Session',
      desc: 'Cypher with other beatboxers',
      Icon: Music,
      pixelIcon: 'jam',
      tickEnergyCost: 2,
      tickHungerCost: 1,
      tickMoodDelta: 1,
      label: '5 blocks → random stat +1, mood up, fans',
      onReward: () => {
        const c = charRef.current;
        const stat = ['mus', 'tec', 'ori'][Math.floor(Math.random() * 3)];
        const fans = 1 + Math.floor(Math.random() * 3);
        const statName = { mus: 'Musicality', tec: 'Technicality', ori: 'Originality' }[stat];
        setChar(cc => {
          const updated = { ...cc, followers: cc.followers + fans, xp: cc.xp + 8,
            stats: { ...cc.stats, [stat]: cc.stats[stat] + 1 } };
          return checkLevelUp(updated);
        });
        showToast(`+1 ${statName}, +${fans} fans`, 'win');
        // First-jam narrative beat — fires once per character
        if (!c?.storyFlags?.firstJam) {
          playCutscene?.({
            speaker: null,
            lines: [
              'You stand in the circle.',
              "Strangers, all of them. None of them care where you slept last night.",
              'Maybe this is what you needed.',
            ],
          }, 'firstJam');
        }
      },
    },
    run: {
      name: 'Go Running',
      desc: 'Build stamina and clear your head',
      Icon: Dumbbell,
      pixelIcon: 'shoe',
      tickEnergyCost: 3,
      tickHungerCost: 2,
      tickMoodDelta: 0.5,
      label: '5 blocks → +1 Showmanship, mood up',
      onReward: () => {
        // In play mode, modulate reward by mini-game performance
        const result = runBlockRef.current;
        const isPlayMode = playMode && selected === 'run';
        // burnSurcharge: if you spent significant time in burn zone this block, take an extra hit
        const burnEnergy = isPlayMode ? Math.round(8 * (result.burnRatio || 0)) : 0;
        // sho gain: 1 normally; when running in play mode and the last block was good, bump to 2
        const shoGain = (isPlayMode && result.isGood) ? 2 : 1;

        setChar(cc => {
          const updated = { ...cc,
            xp: cc.xp + 5,
            mood: Math.min(100, cc.mood + 4),
            energy: Math.max(0, cc.energy - burnEnergy),
            stats: { ...cc.stats, sho: cc.stats.sho + shoGain }
          };
          return checkLevelUp(updated);
        });
        if (burnEnergy > 0) {
          showToast(`+${shoGain} Showmanship · 🔥 -${burnEnergy} energy (burnout)`, 'win');
        } else {
          showToast(`+${shoGain} Showmanship${isPlayMode && result.isGood ? ' (+1 bonus)' : ''}`, 'win');
        }
      },
    },
  };

  // Hook always has to be called — uses the selected activity config (default busk if none)
  const cfg = activities[selected || 'busk'];
  const activity = useActivity({
    char, setChar, checkLevelUp, showToast,
    config: {
      blocksPerReward: 5,
      tickEnergyCost: cfg.tickEnergyCost,
      tickHungerCost: cfg.tickHungerCost,
      tickMoodDelta: cfg.tickMoodDelta,
      onReward: cfg.onReward,
      stopWhen: (c) => !isDayTime(c.minutes),
      stopReason: 'The sun is setting — park is emptying out',
    },
  });

  // When pendingStart is set, kick off the activity after render commits
  useEffect(() => {
    if (pendingStart && selected && !activity.active) {
      setPendingStart(false);
      activity.start();
    }
  }, [pendingStart, selected, activity.active]);

  // Reset play mode + accuracy when activity ends
  useEffect(() => {
    if (!activity.active) {
      setPlayMode(false);
      accuracyRef.current = 0;
    }
  }, [activity.active]);

  // Lock park at night
  if (!isDayTime(char.minutes ?? 0)) {
    return (
      <div className="space-y-3 pt-8 text-center">
        <div className="text-6xl">🌙</div>
        <div className="text-xl text-stone-400" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>THE PARK IS QUIET</div>
        <div className="text-xs text-stone-500 uppercase tracking-wider px-6">Beatboxers don't gather here at night. Come back at sunrise — or head to the bar where the cypher lives after dark.</div>
        <Btn onClick={() => go('hood')} className="mt-4">← BACK TO HOOD</Btn>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-center mb-2">
        <div className="text-2xl tracking-widest text-stone-300" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>THE PARK</div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Tap an activity to commit</div>
      </div>

      {!activity.active && (
        <Panel title="Activities">
          <div className="space-y-2">
            {Object.entries(activities).map(([key, a]) => {
              return (
                <button key={key}
                  onClick={() => { setSelected(key); setPendingStart(true); }}
                  disabled={char.energy < a.tickEnergyCost}
                  className="w-full flex items-center gap-3 p-3 border-2 border-stone-800 bg-stone-900/30 hover:border-amber-500 disabled:opacity-30 transition-all">
                  <PixelIcon name={a.pixelIcon} size={32} />
                  <div className="flex-1 text-left">
                    <div className="text-stone-200 text-sm">{a.name}</div>
                    <div className="text-[10px] text-stone-500 uppercase tracking-wider">{a.desc}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-amber-500 text-xs">START ▶</div>
                    <div className="text-[10px] text-stone-500 uppercase">-{a.tickEnergyCost}⚡/tick</div>
                  </div>
                </button>
              );
            })}
          </div>
        </Panel>
      )}

      {activity.active && (
        <Panel title={cfg.name + ' — IN PROGRESS'}>
          <div className="space-y-3">
            {selected === 'busk' && !playMode && (
              <BuskAnimation color={char.color} block={activity.block} rewardKey={activity.rewardsEarned} active={activity.active} />
            )}
            {selected === 'busk' && playMode && (
              <RhythmTap onAccuracyUpdate={handleAccuracy} evaluateEveryMs={2500} active={activity.active} />
            )}
            {selected === 'jam' && (
              <JamAnimation color={char.color} block={activity.block} rewardKey={activity.rewardsEarned} active={activity.active} />
            )}
            {selected === 'run' && !playMode && (
              <RunAnimation color={char.color} block={activity.block} rewardKey={activity.rewardsEarned} active={activity.active} />
            )}
            {selected === 'run' && playMode && (
              <RunTracker
                onBlockResult={handleRunBlock}
                onMaxEnergyTick={handleMaxEnergyTick}
                evaluateEveryMs={2500}
                active={activity.active}
              />
            )}
            {selected === 'busk' && (
              <button onClick={() => { setPlayMode(p => !p); accuracyRef.current = 0; }}
                className="w-full py-2 border-2 border-amber-500/50 bg-amber-500/10 text-amber-500 text-xs uppercase tracking-widest hover:bg-amber-500/20 transition-all">
                {playMode ? '◀ AFK MODE' : '▶ PLAY RHYTHM (bonus tips)'}
              </button>
            )}
            {selected === 'run' && (
              <button onClick={() => { setPlayMode(p => !p); runBlockRef.current = { avg: 0, isGood: false, burnRatio: 0 }; }}
                className="w-full py-2 border-2 border-amber-500/50 bg-amber-500/10 text-amber-500 text-xs uppercase tracking-widest hover:bg-amber-500/20 transition-all">
                {playMode ? '◀ AFK MODE' : '▶ SPRINT MODE (build max ⚡ energy)'}
              </button>
            )}
            <div className="text-[10px] text-stone-500 uppercase tracking-wider">{cfg.label}</div>
            <ProgressBar block={activity.block} total={5} label={`Block ${activity.block}/5`} />
            <div className="flex justify-between text-[10px] uppercase tracking-wider text-stone-500">
              <span>Rewards earned: <span className="text-amber-500">{activity.rewardsEarned}</span></span>
              <span>1 block = 10 game min (0.5s)</span>
            </div>
            <Btn variant="danger" onClick={() => activity.stop('Stopped early')} className="w-full py-3">
              STOP ■
            </Btn>
          </div>
        </Panel>
      )}
    </div>
  );
}

// ============ ROHZEL — BAR KEEPER ============
// Funny dialogue NPC who books Friday showcases.

const ROHZEL_GREETINGS = [
  "Yo, lil homie! What you sippin' on tonight?",
  "Aaayy, the people's champion in the building.",
  "Look who decided to show up — you smell like ambition.",
  "Welcome back. Try not to scare my regulars.",
  "Ay, this ain't no daycare. You here to spit or what?",
  "I run this bar, the cypher, and your hopes & dreams. What's good?",
];
const ROHZEL_NEED_FANS = [
  "Ten fans? Ten?? My DOG got more followers than that. Build a buzz, then we talk.",
  "Lil bro come back when more than your mama is screaming your name.",
  "I need a crowd that pays my electric bill. Not a Spotify playlist of three.",
];
const ROHZEL_NEED_OPEN_MICS = [
  "I haven't even seen you on my open mic stage. Earn your reps first.",
  "Five open mics. That's the bar. Literally.",
  "Friday's a privilege. Tue, Wed, Thu — the work's there. Show up.",
];
const ROHZEL_COOLDOWN = [
  "Already had your slot this week, hotshot. Let the people miss you.",
  "One show a week. That's the rule. Even Beyoncé gotta breathe.",
];
const ROHZEL_BOOKED_OK = (timeStr, day) => [
  `Aight, I see you. Friday ${timeStr}. Don't be late or I give the slot to a 14-year-old TikTok kid.`,
  `Cool. Friday at ${timeStr}. Be sober, be loud, be there.`,
  `Locked in: Friday, ${timeStr}. Mess this up and you're banned from karaoke too.`,
];
const ROHZEL_REMINDER = (timeStr) => [
  `You're already on the list, Friday ${timeStr}. Don't make me regret it.`,
  `Booked, kid. Friday ${timeStr}. Show up or shut up.`,
];
const _pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// 8 PM .. 0:30 AM in 30-min slots (in-game minutes since 6 AM)
const SHOWCASE_SLOTS = [];
for (let m = 14 * 60; m <= 18 * 60 + 30; m += 30) SHOWCASE_SLOTS.push(m);

// How many days from current to next Friday (DAY_NAMES idx 4 = Friday).
// If today IS Friday and the slot pool still has a future time, book today.
const daysToNextFriday = (currentDay, currentMinutes) => {
  const dow = dayOfWeek(currentDay);
  if (dow < 4) return 4 - dow;
  if (dow === 4) {
    // Today; only book today if at least one slot is still in the future
    const earliest = SHOWCASE_SLOTS[0];
    if (currentMinutes < earliest) return 0;
    return 7; // next Friday
  }
  return 11 - dow;
};

// Pick a random slot, biased to "still in the future" if today.
const pickShowcaseSlot = (currentDay, bookingDay, currentMinutes) => {
  const candidates = (currentDay === bookingDay)
    ? SHOWCASE_SLOTS.filter(m => m > currentMinutes + 30)
    : [...SHOWCASE_SLOTS];
  return candidates[Math.floor(Math.random() * candidates.length)];
};

// ============ SHOWCASE PERFORMANCE ============
// Free-play MPC pad grid using all of the player's owned sounds. 20-second
// performance — taps + variety determine the reward.

const ShowcasePerformance = ({ char, durationMs = 20000, onComplete }) => {
  const [tapsCount, setTapsCount] = useState(0);
  const [distinctSet, setDistinctSet] = useState(() => new Set());
  const [elapsedMs, setElapsedMs] = useState(0);
  const [pulse, setPulse] = useState({}); // {soundKey: timestamp} for visual flash
  const startedAtRef = useRef(performance.now());
  const finishedRef = useRef(false);
  const tapsRef = useRef(0);
  const distinctRef = useRef(new Set());

  // Build the pad list: hero 4 + every owned non-default catalog sound
  const heroDefaults = new Set(Object.values(HERO_SOUNDS).map(m => m.defaultSound).filter(Boolean));
  const pads = [
    ...Object.keys(HERO_SOUNDS),
    ...(char.sounds || []).filter(id => SOUND_CATALOG[id] && !HERO_SOUNDS[id] && !heroDefaults.has(id)),
  ];

  useEffect(() => {
    let raf;
    const tick = () => {
      const now = performance.now();
      const t = now - startedAtRef.current;
      setElapsedMs(t);
      if (t >= durationMs && !finishedRef.current) {
        finishedRef.current = true;
        onComplete?.({
          totalTaps: tapsRef.current,
          distinctSounds: distinctRef.current.size,
          durationMs,
        });
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onTap = (key) => {
    if (finishedRef.current) return;
    playGameSound(key);
    tapsRef.current += 1;
    distinctRef.current.add(key);
    setTapsCount(tapsRef.current);
    setDistinctSet(new Set(distinctRef.current));
    setPulse(p => ({ ...p, [key]: performance.now() }));
  };

  const progress = Math.min(1, elapsedMs / durationMs);
  const cols = pads.length <= 4 ? pads.length : 4;

  return (
    <div className="space-y-3">
      <div className="text-center">
        <div className="text-amber-500 text-2xl tracking-wider" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
          🔥 LIVE — {char.name?.toUpperCase()}
        </div>
        <div className="text-[10px] text-stone-500 uppercase tracking-[0.3em]">Free play · go off</div>
      </div>

      <div className="h-2 bg-stone-950 border border-stone-800 overflow-hidden">
        <div className="h-full transition-all" style={{ width: `${progress * 100}%`, background: progress < 0.85 ? '#D4A017' : '#ef4444' }} />
      </div>

      <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {pads.map(key => {
          const meta = getSoundDisplay(key) || { color: '#D4A017', label: '?', name: key };
          const lastTap = pulse[key] || 0;
          const age = performance.now() - lastTap;
          const flashing = age < 150;
          return (
            <button key={key}
              onPointerDown={(e) => { e.preventDefault(); onTap(key); }}
              className="aspect-square border-2 active:scale-95 transition-transform select-none touch-none"
              style={{
                borderColor: meta.color,
                background: flashing ? meta.color : `${meta.color}1f`,
                color: flashing ? '#0c0a09' : meta.color,
                fontFamily: '"Bebas Neue", "Oswald", sans-serif',
                fontSize: 22,
                letterSpacing: '0.15em',
              }}>
              <div>{meta.label}</div>
              <div className="text-[9px] tracking-widest mt-1" style={{ opacity: flashing ? 0.7 : 0.5 }}>
                {meta.name?.toUpperCase()}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-stone-500">
        <span>HITS <span className="text-amber-500">{tapsCount}</span></span>
        <span>SOUNDS <span className="text-amber-500">{distinctSet.size}/{pads.length}</span></span>
        <span>TIME <span className="text-amber-500">{Math.max(0, Math.ceil((durationMs - elapsedMs) / 1000))}s</span></span>
      </div>
    </div>
  );
};

// ============ SCREEN: BAR ============

function BarScreen({ char, setChar, go, showToast, checkLevelUp }) {
  const [selected, setSelected] = useState(null);
  const [rohzelLine, setRohzelLine] = useState(() => _pick(ROHZEL_GREETINGS));
  const [performingShowcase, setPerformingShowcase] = useState(false);

  // Lock bar during daytime
  if (!isNightTime(char.minutes ?? 0)) {
    return (
      <div className="space-y-3 pt-8 text-center">
        <div className="text-6xl">🍺</div>
        <div className="text-xl text-stone-400" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>THE BAR IS CLOSED</div>
        <div className="text-xs text-stone-500 uppercase tracking-wider px-6">Doors open at 6 PM. Come back tonight.</div>
        <Btn onClick={() => go('hood')} className="mt-4">← BACK TO HOOD</Btn>
      </div>
    );
  }

  const dow = dayOfWeek(char.day);
  const schedule = BAR_SCHEDULE[dow];
  const dayName = DAY_NAMES[dow];

  // Apply a temporary boost from the bar menu, queue the next-day debuff
  const orderItem = (id) => {
    const item = BAR_MENU[id];
    if (!item) return;
    if (char.cash < item.cost) { showToast('Not enough cash', 'bad'); return; }
    setChar(c => {
      const max = c.maxEnergy ?? 100;
      const im = item.immediate;
      const next = {
        ...c,
        cash: c.cash - item.cost,
        minutes: c.minutes + 5,
        energy: Math.max(0, Math.min(max, c.energy + (im.energy || 0))),
        hunger: Math.max(0, Math.min(100, c.hunger + (im.hunger || 0))),
        mood:   Math.max(0, Math.min(100, c.mood   + (im.mood   || 0))),
      };
      // Stack debuffs if multiple items consumed in one night
      const prev = c.pendingDebuff || {};
      next.pendingDebuff = {
        energy: (prev.energy || 0) + (item.debuff.energy || 0),
        mood:   (prev.mood   || 0) + (item.debuff.mood   || 0),
        hunger: (prev.hunger || 0) + (item.debuff.hunger || 0),
      };
      return next;
    });
    showToast(`${item.kind === 'drink' ? 'Drank' : 'Ate'} ${item.name}`, 'win');
  };

  // Day-activity actions
  const doOpenMic = () => {
    if (char.energy < 10) { showToast('Too tired to perform', 'bad'); return; }
    const sho = char.stats.sho || 0;
    // Open mic is unpaid — you do it for the cred, the heat, and maybe a fan or two.
    const fanGain = (Math.random() < 0.4 ? 1 : 0) + (sho >= 8 ? 1 : 0);
    setChar(c => ({
      ...c,
      energy: Math.max(0, c.energy - 10),
      mood: Math.min(100, c.mood + 5),
      minutes: c.minutes + 30,
      heat: (c.heat || 0) + 2,
      followers: c.followers + fanGain,
      openMicCount: (c.openMicCount || 0) + 1,
      xp: c.xp + 8,
    }));
    showToast(fanGain > 0 ? `Open mic done · +${fanGain} fan${fanGain === 1 ? '' : 's'}` : 'Open mic done · built some heat', 'win');
  };
  const doKaraoke = () => {
    if (char.energy < 8) { showToast('Too tired to sing', 'bad'); return; }
    const earn = 4 + Math.floor(Math.random() * 5);
    const musGain = 1 + (Math.random() < 0.25 ? 1 : 0);
    setChar(c => ({
      ...c,
      cash: c.cash + earn,
      energy: Math.max(0, c.energy - 8),
      mood: Math.min(100, c.mood + 6),
      minutes: c.minutes + 30,
      stats: { ...c.stats, mus: c.stats.mus + musGain },
      xp: c.xp + 5,
    }));
    showToast(`Karaoke: +${musGain} musicality, +$${earn}`, 'win');
  };

  // ---- Rohzel / Friday-showcase booking ----
  const SHOWCASE_FANS_REQ = 50;
  const SHOWCASE_OPEN_MICS_REQ = 5;
  const FRIDAY_DOW = 4;
  const showcaseCooldownDaysLeft = char.lastShowcaseDay
    ? Math.max(0, 7 - (char.day - char.lastShowcaseDay))
    : 0;
  const onCooldown = showcaseCooldownDaysLeft > 0;
  const meetsBookingReqs = (char.followers || 0) >= SHOWCASE_FANS_REQ && (char.openMicCount || 0) >= SHOWCASE_OPEN_MICS_REQ;
  const askRohzel = () => {
    if (char.showcaseBooking) {
      setRohzelLine(_pick(ROHZEL_REMINDER(clockString(char.showcaseBooking.minute))));
      return;
    }
    if (onCooldown) {
      setRohzelLine(_pick(ROHZEL_COOLDOWN));
      return;
    }
    if ((char.followers || 0) < SHOWCASE_FANS_REQ) {
      setRohzelLine(_pick(ROHZEL_NEED_FANS));
      return;
    }
    if ((char.openMicCount || 0) < SHOWCASE_OPEN_MICS_REQ) {
      setRohzelLine(_pick(ROHZEL_NEED_OPEN_MICS));
      return;
    }
    // Book it
    const days = daysToNextFriday(char.day, char.minutes);
    const bookingDay = char.day + days;
    const slot = pickShowcaseSlot(char.day, bookingDay, char.minutes);
    const timeStr = clockString(slot);
    setChar(c => ({ ...c, showcaseBooking: { day: bookingDay, minute: slot } }));
    setRohzelLine(_pick(ROHZEL_BOOKED_OK(timeStr, bookingDay)));
    showToast(`Booked: Friday ${timeStr}`, 'win');
  };
  const chatRohzel = () => setRohzelLine(_pick(ROHZEL_GREETINGS));

  // Friday-night gig logic: are we in the booking window?
  const booking = char.showcaseBooking;
  const isBookingDay = booking && char.day === booking.day;
  const minutesToGig = isBookingDay ? booking.minute - char.minutes : Infinity;
  const inGigWindow = isBookingDay && minutesToGig <= 30 && minutesToGig >= -60;
  const missedGig = booking && (char.day > booking.day || (isBookingDay && minutesToGig < -60));

  // Auto-clear missed booking
  useEffect(() => {
    if (missedGig) {
      setChar(c => ({ ...c, showcaseBooking: null }));
      showToast('Missed your showcase. Rohzel ain\'t happy.', 'bad');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missedGig]);

  const startShowcaseGig = () => {
    if (!booking) return;
    // Time skip to gig start
    setChar(c => ({ ...c, minutes: booking.minute }));
    setPerformingShowcase(true);
  };
  const finishShowcaseGig = ({ totalTaps, distinctSounds }) => {
    const sho = char.stats.sho || 0;
    const mus = char.stats.mus || 0;
    const tec = char.stats.tec || 0;
    const baseReward = 100 + sho * 10 + mus * 4 + tec * 4;
    const engagement = Math.min(2, totalTaps / 30);
    const variety = Math.min(1.5, distinctSounds / 4);
    const reward = Math.round(baseReward * Math.max(0.5, engagement) * Math.max(0.7, variety));
    const fans = Math.max(2, Math.floor(sho / 2 + distinctSounds));
    setChar(c => {
      const updated = {
        ...c,
        cash: c.cash + reward,
        followers: c.followers + fans,
        energy: Math.max(0, c.energy - 25),
        minutes: c.minutes + 30, // 30 in-game min performance
        mood: Math.min(100, c.mood + 18),
        heat: (c.heat || 0) + 8,
        xp: c.xp + 60,
        showcaseBooking: null,
        lastShowcaseDay: c.day,
      };
      return checkLevelUp ? checkLevelUp(updated) : updated;
    });
    showToast(`Showcase: +$${reward} · +${fans} fans 🔥`, 'win');
    setPerformingShowcase(false);
  };

  // Battle once-per-week gating (Saturday, lastBattleDay)
  const battleCooldownDaysLeft = char.lastBattleDay
    ? Math.max(0, 7 - (char.day - char.lastBattleDay))
    : 0;
  const battleOnCooldown = battleCooldownDaysLeft > 0;

  // While performing, take over the screen
  if (performingShowcase) {
    return (
      <div className="space-y-3 pt-2">
        <ShowcasePerformance char={char} durationMs={20000} onComplete={finishShowcaseGig} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-center mb-1">
        <div className="text-2xl tracking-widest text-stone-300" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>THE BAR</div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-amber-500">{dayName} · {schedule.title}</div>
        <div className="text-[10px] text-stone-500 uppercase tracking-wider mt-0.5">{schedule.tagline}</div>
      </div>

      {/* Closed Mondays */}
      {schedule.activity === 'closed' && (
        <Panel title="Closed">
          <div className="text-center py-4 space-y-2">
            <div className="text-5xl">🚪</div>
            <div className="text-xs text-stone-400 uppercase tracking-wider">No show tonight. Sleep it off and come back tomorrow.</div>
          </div>
        </Panel>
      )}

      {schedule.activity === 'openmic' && (
        <Panel title="Open Mic Sign-Up">
          <div className="space-y-2">
            <div className="text-[10px] text-stone-500 uppercase tracking-wider">
              Quick set, friendly crowd. Unpaid — you're here for the heat (and maybe a new fan).
            </div>
            <Btn variant="primary" onClick={doOpenMic} disabled={char.energy < 10} className="w-full py-3">
              TAKE THE MIC 🎤 (-10⚡, +30 min)
            </Btn>
            {char.energy < 10 && <div className="text-[10px] text-red-500 text-center uppercase">Need 10 energy</div>}
          </div>
        </Panel>
      )}

      {schedule.activity === 'showcase' && (
        <Panel title="Friday Showcase">
          <div className="space-y-2">
            {!booking && (
              <div className="text-[10px] text-stone-500 uppercase tracking-wider">
                No booking. Talk to Rohzel below — he runs the slot list.
              </div>
            )}
            {booking && !isBookingDay && (
              <div className="text-[10px] text-amber-500 uppercase tracking-wider">
                You're booked Friday at {clockString(booking.minute)}. Come back then.
              </div>
            )}
            {booking && isBookingDay && minutesToGig > 30 && (
              <div className="text-[10px] text-amber-500 uppercase tracking-wider">
                Gig at {clockString(booking.minute)} · {Math.ceil(minutesToGig / 10) * 10} game-min to go. Hang tight.
              </div>
            )}
            {booking && inGigWindow && (
              <>
                <div className="text-[10px] text-amber-500 uppercase tracking-widest text-center">
                  ⭐ ON DECK — {clockString(booking.minute)}
                </div>
                <Btn variant="primary" onClick={startShowcaseGig} disabled={char.energy < 25} className="w-full py-3">
                  READY FOR THE GIG 🔥 (-25⚡)
                </Btn>
                {char.energy < 25 && <div className="text-[10px] text-red-500 text-center uppercase">Need 25 energy</div>}
              </>
            )}
          </div>
        </Panel>
      )}

      {schedule.activity === 'battle' && battleOnCooldown && (
        <Panel title="Battle Night">
          <div className="text-center py-3 space-y-2">
            <div className="text-4xl">🥊</div>
            <div className="text-xs text-stone-400 uppercase tracking-wider">You already battled this week. Come back in {battleCooldownDaysLeft} day{battleCooldownDaysLeft === 1 ? '' : 's'}.</div>
          </div>
        </Panel>
      )}

      {schedule.activity === 'battle' && !battleOnCooldown && (
        <Panel title="Choose your opponent">
          <div className="space-y-2">
            {NPCS.map((n, i) => {
              const beaten = char.defeated.includes(n.name);
              const locked = i > 0 && !char.defeated.includes(NPCS[i - 1].name);
              return (
                <button key={n.name} onClick={() => !locked && setSelected(n)} disabled={locked}
                  className={`w-full p-3 border-2 text-left transition-all ${
                    locked ? 'border-stone-900 bg-stone-950 opacity-40' :
                    selected?.name === n.name ? 'border-amber-500 bg-amber-500/10' :
                    beaten ? 'border-green-900/50 bg-green-950/20 hover:border-amber-500' :
                    'border-stone-800 bg-stone-900/30 hover:border-amber-500'
                  }`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="text-amber-500 tracking-wider" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>{n.name.toUpperCase()}</div>
                      {beaten && <Trophy size={12} className="text-green-500" />}
                      {locked && <span className="text-[10px] text-stone-600">🔒</span>}
                    </div>
                    <div className="text-[10px] text-stone-500">LVL {n.level}</div>
                  </div>
                  <div className="text-[10px] text-stone-500 uppercase tracking-wider">
                    M{n.stats.mus} · T{n.stats.tec} · O{n.stats.ori} · S{n.stats.sho} · ${n.reward}
                  </div>
                </button>
              );
            })}
          </div>
        </Panel>
      )}

      {schedule.activity === 'battle' && selected && (
        <Panel title={`vs ${selected.name}`}>
          <div className="text-[10px] text-stone-400 uppercase tracking-wider mb-3">Sounds: {selected.sounds.map(s => SOUND_CATALOG[s]?.name).join(', ')}</div>
          <Btn variant="danger" onClick={() => go('battle') || setChar(c => ({ ...c, _opponent: selected }))} className="w-full py-3"
            disabled={char.energy < 30 || char.equipped.length === 0}>
            START BATTLE 🎤 (-30⚡)
          </Btn>
          {char.energy < 30 && <div className="text-[10px] text-red-500 text-center mt-2 uppercase">Need 30 energy</div>}
          {char.equipped.length === 0 && <div className="text-[10px] text-red-500 text-center mt-2 uppercase">No sounds equipped! Visit Shop</div>}
        </Panel>
      )}

      {schedule.activity === 'karaoke' && (
        <Panel title="Karaoke Night">
          <div className="space-y-2">
            <div className="text-[10px] text-stone-500 uppercase tracking-wider">
              Sing along — sharpen your musicality.
            </div>
            <Btn variant="primary" onClick={doKaraoke} disabled={char.energy < 8} className="w-full py-3">
              GRAB THE MIC 🎶 (-8⚡, +30 min)
            </Btn>
            {char.energy < 8 && <div className="text-[10px] text-red-500 text-center uppercase">Need 8 energy</div>}
          </div>
        </Panel>
      )}

      {/* Rohzel — bar keeper + Friday showcase booking */}
      {schedule.activity !== 'closed' && (
        <Panel title="Rohzel · Bar Keeper">
          <div className="flex gap-3 items-start">
            <CharacterPortrait
              look={{ shirt: '#1c1917', skin: '#5a3a20', hair: '#0c0a09', style: 'fade', accessory: null }}
              size={64} active={true} />
            <div className="text-[10px] text-stone-500 uppercase tracking-widest absolute" style={{ display: 'none' }}>Rohzel</div>
            <div className="flex-1 space-y-2">
              <div className="text-stone-200 text-sm tracking-wide italic border-l-2 border-amber-500/50 pl-2">
                "{rohzelLine}"
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button onClick={askRohzel}
                  className="px-2 py-1.5 border-2 border-amber-500/60 bg-amber-500/10 text-amber-500 text-[10px] uppercase tracking-widest hover:bg-amber-500/20">
                  Friday gig?
                </button>
                <button onClick={chatRohzel}
                  className="px-2 py-1.5 border-2 border-stone-700 text-stone-400 text-[10px] uppercase tracking-widest hover:border-amber-500/40">
                  Just chatting
                </button>
              </div>
              <div className="text-[9px] text-stone-600 uppercase tracking-wider">
                Need {SHOWCASE_FANS_REQ}+ fans · {SHOWCASE_OPEN_MICS_REQ}+ open mics done · 1 show / week
              </div>
              {booking && (
                <div className="text-[9px] text-amber-500 uppercase tracking-widest border-t border-stone-800 pt-1">
                  ✓ booked: friday {clockString(booking.minute)}
                </div>
              )}
            </div>
          </div>
        </Panel>
      )}

      {/* Bar menu — drinks & snacks (always available when bar is open) */}
      {schedule.activity !== 'closed' && (
        <Panel title="Bar Menu">
          <div className="space-y-2">
            {Object.entries(BAR_MENU).map(([k, item]) => {
              const im = item.immediate;
              const db = item.debuff;
              const fmt = (s, sym) => {
                const e = s.energy ? `${s.energy >= 0 ? '+' : ''}${s.energy}⚡` : '';
                const m = s.mood   ? `${s.mood   >= 0 ? '+' : ''}${s.mood}♥` : '';
                const h = s.hunger ? `${s.hunger >= 0 ? '+' : ''}${s.hunger}🍴` : '';
                return [e, m, h].filter(Boolean).join(' ');
              };
              return (
                <div key={k} className="flex items-center gap-3 p-2 border border-stone-800 bg-stone-900/30">
                  <PixelIcon name={item.kind === 'drink' ? 'coffee' : 'star'} size={20} />
                  <div className="flex-1">
                    <div className="text-stone-200 text-sm">{item.name}</div>
                    <div className="text-[10px] text-amber-500 uppercase tracking-wider">
                      {fmt(im)}
                    </div>
                    <div className="text-[9px] text-red-400 uppercase tracking-wider">
                      hangover: {fmt(db)}
                    </div>
                  </div>
                  <Btn onClick={() => orderItem(k)} disabled={char.cash < item.cost}>${item.cost}</Btn>
                </div>
              );
            })}
            {char.pendingDebuff && (
              <div className="text-[10px] text-red-400 text-center uppercase tracking-wider">
                ⚠ already feeling a hangover building for tomorrow
              </div>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}


// Floating sound name with wiggle
const FloatingSound = ({ text, side, color = '#D4A017' }) => (
  <div className="absolute pointer-events-none" style={{
    left: side === 'P' ? '15%' : '55%',
    top: '38%',
    animation: 'soundFloat 1.2s ease-out forwards',
  }}>
    <div className="text-2xl font-black tracking-wider px-3 py-1"
      style={{
        fontFamily: '"Bebas Neue", "Oswald", sans-serif',
        color,
        textShadow: '2px 2px 0 #0c0a09, -1px -1px 0 #0c0a09, 1px -1px 0 #0c0a09, -1px 1px 0 #0c0a09',
        WebkitTextStroke: '0.5px #0c0a09',
      }}>
      {text.toUpperCase()}
    </div>
  </div>
);

// ============ PIXEL BATTLE STAGE ============
// Pixel-art battle stage. Replaces the SVG SketchStage. The player wears their
// chosen color shirt (matching busk/run animations); each opponent has a
// distinct look. Judges sit on a bench and react with floating pixel hearts.

// Per-opponent visuals — keyed by NPC name
const OPP_LOOKS = {
  'Pig Pen':     { shirt: '#5a4030', skin: '#d4a87a', hair: '#1a1a2e', style: 'mohawk', accessory: 'shades' },
  'Joel Burner': { shirt: '#84cc16', skin: '#f5d4a8', hair: '#5a3a18', style: 'short',  accessory: null     },
  'CeDe':        { shirt: '#3b82f6', skin: '#d4a87a', hair: '#1a1a2e', style: 'mohawk', accessory: 'shades' },
  'Sikker':      { shirt: '#a78bfa', skin: '#8a5a3a', hair: '#1c1917', style: 'long',   accessory: null     },
  'Alim':        { shirt: '#f97316', skin: '#a87844', hair: '#1c1917', style: 'short',  accessory: null     },
  'Olexinho':    { shirt: '#94a3b8', skin: '#c8b8a0', hair: '#9ca3af', style: 'spike',  accessory: 'shades' },
  'FatboxG':     { shirt: '#fbbf24', skin: '#5a3a20', hair: '#0c0a09', style: 'fade',   accessory: null     },
};
const _defaultOppLook = { shirt: '#CC2200', skin: '#d4a87a', hair: '#1c1917', style: 'short', accessory: null };

// Judge bias → visual hint (hair color signals their personality)
const JUDGE_LOOKS = {
  technicality: { hair: '#22d3ee', shirt: '#0e3a4a' },
  musicality:   { hair: '#a78bfa', shirt: '#3a2a5a' },
  originality:  { hair: '#fbbf24', shirt: '#5a4030' },
  showmanship:  { hair: '#fb7185', shirt: '#4a1820' },
  random:       { hair: '#84cc16', shirt: '#2a3a1a' },
};

// Draw a beatboxer at logical (x, y), where y is feet level.
const drawBeatboxer = (ctx, x, y, look, facing, active, frameCount) => {
  const px = (dx, dy, w, h, c) => _px(ctx, x + dx, y + dy, w, h, c);
  const bob = active ? Math.floor(frameCount / 6) % 2 : 0;

  // Shadow
  px(-7, 0, 14, 1, 'rgba(0,0,0,0.45)');
  // Legs (alternating bob)
  px(-4, -8 - bob, 3, 8, '#1a1a2e');
  px(1, -8 + bob, 3, 8, '#1a1a2e');
  // Shoes
  px(-4, -1, 3, 1, '#fff');
  px(1, -1, 3, 1, '#fff');
  // Body / shirt
  px(-5, -19, 10, 11, look.shirt);
  px(-5, -19, 10, 1, '#fff'); // collar highlight
  // Arms (shirt color)
  px(-7, -18, 2, 8, look.shirt);
  px(5, -18, 2, 8, look.shirt);
  // Mic-side hand
  const handX = facing === 'right' ? 6 : -8;
  px(handX, -14, 2, 3, look.skin);
  // Mic
  const micX = facing === 'right' ? 6 : -10;
  px(micX, -19, 2, 3, '#888');
  px(micX - 1, -20, 4, 2, '#aaa');
  // Head
  px(-4, -25, 8, 7, look.skin);
  // Hair styles
  if (look.style === 'short') {
    px(-4, -27, 8, 2, look.hair);
  } else if (look.style === 'mohawk') {
    px(-4, -25, 8, 1, look.hair);
    px(-1, -28, 2, 3, look.hair);
  } else if (look.style === 'long') {
    px(-5, -26, 10, 2, look.hair);
    px(-5, -23, 1, 5, look.hair);
    px(4, -23, 1, 5, look.hair);
  } else if (look.style === 'spike') {
    px(-4, -26, 8, 1, look.hair);
    px(-3, -28, 2, 2, look.hair);
    px(0, -29, 2, 3, look.hair);
    px(2, -28, 2, 2, look.hair);
  } else if (look.style === 'fade') {
    px(-4, -27, 8, 2, look.hair);
    px(-4, -25, 8, 1, '#000');
  }
  // Eyes / accessory
  const blink = frameCount % 120 < 4;
  if (look.accessory === 'shades') {
    px(-3, -23, 7, 1, '#0c0a09');
  } else if (!blink) {
    px(-3, -23, 1, 1, '#1a1a2e');
    px(1, -23, 1, 1, '#1a1a2e');
  }
  // Mouth (animated when active)
  const mf = active ? Math.floor(frameCount / 4) % 4 : 0;
  if (active && (mf === 1 || mf === 3)) {
    px(-1, -20, 3, 2, '#3a1010');
  } else {
    px(-1, -20, 3, 1, '#5a2020');
  }
};

// Draw a seated judge at (x, y).
const drawJudge = (ctx, x, y, look, vote, revealed, frameCount) => {
  const px = (dx, dy, w, h, c) => _px(ctx, x + dx, y + dy, w, h, c);
  // Body (seated, smaller)
  px(-3, -7, 6, 7, look.shirt);
  // Head
  px(-3, -12, 6, 5, '#d4a87a');
  // Hair
  px(-3, -13, 6, 2, look.hair);
  // Eyes
  px(-2, -10, 1, 1, '#1a1a2e');
  px(1, -10, 1, 1, '#1a1a2e');
  // Vote indicator (revealed at end)
  if (revealed && vote === 'P') {
    px(-2, -16, 4, 2, '#22c55e');
    px(-1, -17, 2, 1, '#22c55e');
  } else if (revealed && vote === 'O') {
    px(-2, -16, 4, 2, '#dc2626');
    px(-1, -15, 2, 1, '#dc2626');
  }
};

// Tiny pixel heart (3 wide × 3 tall, plus 2 side dots = 5 wide effective)
const drawPixelHeart = (ctx, x, y, alpha = 1) => {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#fb7185';
  ctx.fillRect(x - 1, y, 1, 1);
  ctx.fillRect(x + 1, y, 1, 1);
  ctx.fillRect(x - 2, y - 1, 1, 1);
  ctx.fillRect(x + 2, y - 1, 1, 1);
  ctx.fillRect(x - 1, y - 1, 3, 1);
  ctx.fillRect(x, y + 1, 1, 1);
  ctx.globalAlpha = 1;
};

// Build the canvas-friendly "look" object from a character record
const lookFromChar = (char) => ({
  shirt: char?.color || '#D4A017',
  skin:  char?.skin || '#d4a87a',
  hair:  char?.hairColor || '#1a1a2e',
  style: char?.hairStyle || 'short',
  accessory: null,
});

// Reusable pixel-art portrait — renders drawBeatboxer at any size on a small canvas.
const CharacterPortrait = ({ look, size = 64, active = false, bg = '#1c1917', className = '' }) => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = 40, H = 40;
    const PXSCALE = Math.max(1, Math.floor(size / W));
    canvas.width = W * PXSCALE;
    canvas.height = H * PXSCALE;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    let raf, frame = 0;
    const draw = () => {
      frame++;
      ctx.save();
      ctx.scale(PXSCALE, PXSCALE);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      drawBeatboxer(ctx, 20, 36, look, 'right', active, frame);
      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [look, size, active, bg]);
  return (
    <canvas ref={canvasRef}
      style={{ imageRendering: 'pixelated', background: bg, width: size, height: size }}
      className={`block border-2 border-stone-700 ${className}`} />
  );
};

const PixelStage = ({ char, opponent, activeSide, currentSound, soundColor, judgeVotes, revealedJudges, judgeHearts = [0,0,0,0,0], comboLabel = null }) => {
  const canvasRef = useRef(null);
  const PXSCALE = 3;
  // Tighter aspect (5:3 vs old 5:4): cropped the top empty sky so the stage sits
  // higher on screen and BeatboxHero fits below without scrolling.
  const W = 200, H = 120;

  const heartsRef = useRef([]);
  const sparksRef = useRef([]);
  const lastHeartsRef = useRef([0,0,0,0,0]);
  const wavesPlayerRef = useRef([]);
  const wavesOppRef = useRef([]);
  const propsRef = useRef({});
  const activeSideRef = useRef(activeSide);

  useEffect(() => {
    propsRef.current = { activeSide, currentSound, soundColor, judgeVotes, revealedJudges };
    activeSideRef.current = activeSide;
  }, [activeSide, currentSound, soundColor, judgeVotes, revealedJudges]);

  // Watch judgeHearts: spawn floating hearts + sparks per judge bump
  useEffect(() => {
    judgeHearts.forEach((h, i) => {
      if (h > lastHeartsRef.current[i]) {
        lastHeartsRef.current[i] = h;
        const judgeX = 30 + i * 30;
        const judgeY = 20;
        heartsRef.current.push({
          x: judgeX, y: judgeY,
          vx: (Math.random() - 0.5) * 0.5,
          vy: -0.8 - Math.random() * 0.6,
          life: 0, ttl: 60,
        });
        for (let s = 0; s < 5; s++) {
          const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
          sparksRef.current.push({
            x: judgeX + (Math.random() - 0.5) * 4,
            y: judgeY,
            vx: Math.cos(angle) * (0.4 + Math.random() * 0.8),
            vy: Math.sin(angle) * (0.4 + Math.random() * 0.8),
            life: 0, ttl: 16,
            color: ['#fb7185', '#fbbf24', '#f43f5e'][Math.floor(Math.random() * 3)],
          });
        }
      }
    });
  }, [judgeHearts]);

  // Watch currentSound — emit a sound wave from the active side
  useEffect(() => {
    if (!currentSound || !activeSideRef.current) return;
    const arr = activeSideRef.current === 'P' ? wavesPlayerRef.current : wavesOppRef.current;
    arr.push({ life: 0, ttl: 30, color: soundColor || '#D4A017' });
  }, [currentSound, soundColor]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    let raf, frameCount = 0;

    const playerLook = lookFromChar(char);
    const oppLook = OPP_LOOKS[opponent.name] || _defaultOppLook;

    const draw = () => {
      frameCount++;
      const { activeSide, judgeVotes, revealedJudges } = propsRef.current;

      if (canvas.width !== W * PXSCALE || canvas.height !== H * PXSCALE) {
        canvas.width = W * PXSCALE;
        canvas.height = H * PXSCALE;
        ctx.imageSmoothingEnabled = false;
      }

      ctx.save();
      ctx.scale(PXSCALE, PXSCALE);

      // Back wall (sky compressed: 0..30)
      _px(ctx, 0, 0, W, 30, '#1a0d2e');
      _px(ctx, 0, 0, W, 15, '#0f0820');
      // Stars on back wall
      for (let i = 0; i < 12; i++) {
        const sx = (i * 17 + 9) % W;
        const sy = (i * 5 + 4) % 14;
        _px(ctx, sx, sy, 1, 1, i % 3 === 0 ? '#fef3c7' : '#a78bfa');
      }

      // Spotlights from top corners (subtle cones)
      ctx.fillStyle = 'rgba(212, 160, 23, 0.10)';
      ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(0, 0); ctx.lineTo(0, 60); ctx.lineTo(80, 60); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(W - 20, 0); ctx.lineTo(W, 0); ctx.lineTo(W, 60); ctx.lineTo(W - 80, 60); ctx.closePath(); ctx.fill();

      // Judges bench (was at y=60, now at y=30)
      _px(ctx, 18, 30, 164, 4, '#5a4030');
      _px(ctx, 18, 34, 164, 1, '#3a2818');
      _px(ctx, 22, 34, 2, 6, '#3a2818');
      _px(ctx, 176, 34, 2, 6, '#3a2818');

      // Judges
      const biases = ['technicality', 'musicality', 'originality', 'showmanship', 'random'];
      for (let i = 0; i < 5; i++) {
        const jx = 30 + i * 30;
        const v = judgeVotes?.[i];
        const look = JUDGE_LOOKS[biases[i]] || JUDGE_LOOKS.random;
        drawJudge(ctx, jx, 30, look, v?.vote, i < revealedJudges, frameCount);
      }

      // Stage floor (was 90..140, now 60..100)
      _px(ctx, 0, 60, W, 40, '#3a2818');
      for (let i = 0; i < 3; i++) _px(ctx, 0, 65 + i * 11, W, 1, '#2a1808');
      _px(ctx, 0, 60, W, 2, '#5a4030');

      // Crowd silhouette (was 140..160, now 100..120)
      _px(ctx, 0, 100, W, 20, '#0c0a09');
      for (let i = 0; i < 25; i++) {
        const cx = 4 + i * 8;
        const ch = 4 + ((i * 7) % 6);
        _px(ctx, cx, 100 - ch, 6, ch, '#1c1917');
        _px(ctx, cx + 1, 98 - ch, 4, 3, '#0c0a09');
      }
      // Crowd hands raised when someone is performing
      if (activeSide && frameCount % 30 < 15) {
        for (let i = 0; i < 6; i++) {
          const cx = 12 + i * 30 + ((i * 3) % 7);
          _px(ctx, cx, 94, 1, 4, '#1c1917');
        }
      }

      // Beatboxers (feet at y=95, was 130)
      drawBeatboxer(ctx, 60, 95, playerLook, 'right', activeSide === 'P', frameCount);
      drawBeatboxer(ctx, 140, 95, oppLook, 'left', activeSide === 'O', frameCount);

      // Sound waves emanating from active beatboxer (centered on torso ~y=78)
      const drawWaves = (waves, sx) => {
        for (let i = waves.length - 1; i >= 0; i--) {
          const w = waves[i];
          w.life++;
          if (w.life > w.ttl) { waves.splice(i, 1); continue; }
          const t = w.life / w.ttl;
          ctx.globalAlpha = (1 - t) * 0.6;
          ctx.fillStyle = w.color;
          const r = 4 + t * 18;
          for (let a = 0; a < 10; a++) {
            const angle = (a / 10) * Math.PI * 2;
            const xx = Math.floor(sx + Math.cos(angle) * r);
            const yy = Math.floor(78 + Math.sin(angle) * r);
            if (xx >= 0 && xx < W && yy >= 0 && yy < H) ctx.fillRect(xx, yy, 1, 1);
          }
          ctx.globalAlpha = 1;
        }
      };
      drawWaves(wavesPlayerRef.current, 60);
      drawWaves(wavesOppRef.current, 140);

      // Hearts floating up
      heartsRef.current = heartsRef.current.filter(h => {
        h.life++; h.x += h.vx; h.y += h.vy; h.vy += 0.02;
        const t = h.life / h.ttl;
        if (t > 1) return false;
        drawPixelHeart(ctx, Math.floor(h.x), Math.floor(h.y), 1 - t * 0.7);
        return true;
      });

      // Spark particles
      sparksRef.current = sparksRef.current.filter(s => {
        s.life++; s.x += s.vx; s.y += s.vy; s.vy += 0.05;
        if (s.life > s.ttl) return false;
        const t = s.life / s.ttl;
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = s.color;
        ctx.fillRect(Math.floor(s.x), Math.floor(s.y), 1, 1);
        ctx.globalAlpha = 1;
        return true;
      });

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [char.color, opponent.name]);

  return (
    <div className="relative w-full overflow-hidden border-2 border-stone-800" style={{ aspectRatio: '5/3', background: '#0c0a09' }}>
      <canvas ref={canvasRef} className="block w-full h-full" style={{ imageRendering: 'pixelated' }} />
      {currentSound && activeSide && (
        <FloatingSound key={currentSound + Date.now()} text={currentSound} side={activeSide} color={soundColor} />
      )}
      {comboLabel && activeSide === 'P' && (
        <div key={comboLabel.key} className="absolute pointer-events-none"
          style={{ left: '8%', top: '12%', animation: 'comboPop 1.6s ease-out forwards' }}>
          <div className="text-base font-black tracking-widest px-2 py-1 border-2 border-amber-500 bg-amber-500/20"
            style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif', color: '#D4A017', textShadow: '2px 2px 0 #0c0a09' }}>
            🔥 {comboLabel.text}
          </div>
        </div>
      )}
      <style>{`
        @keyframes soundFloat {
          0% { transform: translateY(0) scale(0.6); opacity: 0; }
          15% { transform: translateY(-5px) scale(1.1); opacity: 1; }
          80% { transform: translateY(-30px) scale(1); opacity: 1; }
          100% { transform: translateY(-50px) scale(0.9); opacity: 0; }
        }
        @keyframes comboPop {
          0% { transform: translateY(8px) scale(0.5) rotate(-4deg); opacity: 0; }
          15% { transform: translateY(-2px) scale(1.15) rotate(-2deg); opacity: 1; }
          85% { transform: translateY(-4px) scale(1) rotate(-2deg); opacity: 1; }
          100% { transform: translateY(-12px) scale(0.95) rotate(-2deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

// The full sketch stage

// HUD overlay - the top bar with names, bars, sound icons
const BattleHUD = ({ char, opponent, timeLeft, pScore, oScore }) => {
  const playerSounds = char.equipped.slice(0, 5).map(id => SOUND_CATALOG[id]);
  const oppSounds = opponent.sounds.slice(0, 5).map(id => SOUND_CATALOG[id]);
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center mb-2">
      {/* Player */}
      <div>
        <div className="text-amber-500 text-xs tracking-wider truncate" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
          {char.name.toUpperCase()}
        </div>
        <div className="h-1.5 bg-stone-900 border border-stone-800 mb-1">
          <div className="h-full bg-amber-500" style={{ width: `${Math.min(100, (pScore / 400) * 100)}%`, transition: 'width 0.3s' }} />
        </div>
        <div className="flex gap-1">
          {playerSounds.map((s, i) => (
            <div key={i} className="w-5 h-5 border border-stone-700 bg-stone-900 flex items-center justify-center text-[8px] text-amber-500">
              {s?.cat?.[0] || '?'}
            </div>
          ))}
        </div>
      </div>

      {/* Center timer */}
      <div className="w-12 h-12 rounded-full border-2 border-stone-700 flex items-center justify-center bg-stone-900">
        <span className="text-amber-500 font-mono text-lg font-bold">{timeLeft}</span>
      </div>

      {/* Opponent */}
      <div className="text-right">
        <div className="text-red-500 text-xs tracking-wider truncate" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
          {opponent.name.toUpperCase()}
        </div>
        <div className="h-1.5 bg-stone-900 border border-stone-800 mb-1">
          <div className="h-full bg-red-600 ml-auto" style={{ width: `${Math.min(100, (oScore / 400) * 100)}%`, transition: 'width 0.3s' }} />
        </div>
        <div className="flex gap-1 justify-end">
          {oppSounds.map((s, i) => (
            <div key={i} className="w-5 h-5 border border-stone-700 bg-stone-900 flex items-center justify-center text-[8px] text-red-500">
              {s?.cat?.[0] || '?'}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ============ BEATBOX AUDIO SYNTH ============
// Synthesizes beatbox-style sounds in-browser using Web Audio API.
// No external samples — keeps the artifact self-contained.

let _audioCtx = null;
const getAudioCtx = () => {
  if (typeof window === 'undefined') return null;
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  }
  if (_audioCtx.state === 'suspended') _audioCtx.resume().catch(() => {});
  return _audioCtx;
};

// ============ BEATBOX HERO SOUND SYSTEM ============
// Four named sounds: B (Kick), T (Hi-Hat), K (Rimshot), Pf (Snare).
// Each has a synth fallback. User can override any of them with a custom
// recorded AudioBuffer (per save slot, persisted in IndexedDB).
//
// HERO_SOUNDS[key] -> { name, color, label, cat, defaultSound }
// HERO_SAMPLES[key] -> AudioBuffer | null (loaded custom recording for current slot)

const HERO_SOUNDS = {
  B:  { name: 'Kick',    color: '#CC2200', label: 'B',  cat: 'Kicks',  defaultSound: 'classic_kick' },
  T:  { name: 'Hi-Hat',  color: '#22d3ee', label: 'T',  cat: 'Hats',   defaultSound: 'hi_hat' },
  K:  { name: 'Rimshot', color: '#a78bfa', label: 'K',  cat: 'Rimshot', defaultSound: 'rimshot' },
  Pf: { name: 'Snare',   color: '#fbbf24', label: 'Pf', cat: 'Snares', defaultSound: 'psh_snare' },
};

// Storage for currently loaded custom samples (per-slot).
// Keys are 'B' / 'T' / 'K' / 'Pf'; values are AudioBuffer or undefined.
const HERO_SAMPLES = {};

// Synthesize Rimshot sound: 350Hz hollow body + 800Hz click + noise burst, ~90ms
const playRimshot = (ctx, t) => {
  // Body — woody mid-low tone
  const body = ctx.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(350, t);
  body.frequency.exponentialRampToValueAtTime(180, t + 0.08);
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0.4, t);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  body.connect(bodyGain).connect(ctx.destination);
  body.start(t); body.stop(t + 0.1);
  // Click — sharp top-end attack
  const click = ctx.createOscillator();
  click.type = 'square';
  click.frequency.setValueAtTime(800, t);
  click.frequency.exponentialRampToValueAtTime(400, t + 0.02);
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(0.2, t);
  clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
  click.connect(clickGain).connect(ctx.destination);
  click.start(t); click.stop(t + 0.03);
  // Noise — short stick/wood grit
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 0.05);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2000;
  filter.Q.value = 1.5;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.15, t);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  noise.connect(filter).connect(noiseGain).connect(ctx.destination);
  noise.start(t); noise.stop(t + 0.05);
};

// Play a hero sound by key. Uses custom sample if available, else falls back to synth.
// Returns immediately (no scheduling latency for the audio dispatch).
const playHeroSound = (key) => {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const sample = HERO_SAMPLES[key];
  if (sample) {
    // Custom sample: fire via BufferSource with no envelope scheduling
    try {
      const src = ctx.createBufferSource();
      src.buffer = sample;
      const gain = ctx.createGain();
      gain.gain.value = 1.0;
      src.connect(gain).connect(ctx.destination);
      src.start(0);
      return;
    } catch (e) { /* fall through to synth */ }
  }
  // Synth fallback
  const t = ctx.currentTime;
  const meta = HERO_SOUNDS[key];
  if (!meta) return;
  if (key === 'B') playKick(ctx, t, 60);
  else if (key === 'T') playHat(ctx, t, false);
  else if (key === 'K') playRimshot(ctx, t);
  else if (key === 'Pf') playSnare(ctx, t);
};

// Play any sound by key. Handles hero keys (B/T/K/Pf) and SOUND_CATALOG ids.
// For catalog ids: plays the player's recorded sample if available, else the catalog synth.
// This is the unified audio entry point used by sequencer + tec lessons + battle.
const playGameSound = (soundKey) => {
  if (!soundKey) return;
  if (HERO_SOUNDS[soundKey]) { playHeroSound(soundKey); return; }
  const ctx = getAudioCtx();
  if (!ctx) return;
  const sample = HERO_SAMPLES[soundKey];
  if (sample) {
    try {
      const src = ctx.createBufferSource();
      src.buffer = sample;
      const gain = ctx.createGain();
      gain.gain.value = 1.0;
      src.connect(gain).connect(ctx.destination);
      src.start(0);
      return;
    } catch (e) { /* fall through to catalog synth */ }
  }
  const meta = SOUND_CATALOG[soundKey];
  if (meta) playSound(meta.cat, meta.name);
};

// ============ INDEXEDDB SAMPLE STORAGE ============
// Per-slot persistence of custom recorded samples.
// Each sample stored as { float32: ArrayBuffer, sampleRate: number }
// keys look like 'slot1:sample-B', 'slot1:sample-Pf', etc.

const IDB_NAME = 'beatbox-story-samples';
const IDB_STORE = 'samples';
let _idbPromise = null;

const openIdb = () => {
  if (_idbPromise) return _idbPromise;
  _idbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB not supported')); return; }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _idbPromise;
};

const idbGet = async (key) => {
  try {
    const db = await openIdb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch { return null; }
};

const idbPut = async (key, value) => {
  try {
    const db = await openIdb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const req = tx.objectStore(IDB_STORE).put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch { /* storage unavailable, silently skip */ }
};

const idbDelete = async (key) => {
  try {
    const db = await openIdb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const req = tx.objectStore(IDB_STORE).delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch { }
};

// Convert a stored {float32, sampleRate} record to an AudioBuffer
const recordToBuffer = (record) => {
  if (!record || !record.float32 || !record.sampleRate) return null;
  const ctx = getAudioCtx();
  if (!ctx) return null;
  const float32 = record.float32 instanceof Float32Array
    ? record.float32
    : new Float32Array(record.float32);
  const buf = ctx.createBuffer(1, float32.length, record.sampleRate);
  buf.getChannelData(0).set(float32);
  return buf;
};

// All sound keys we may have stored a sample for: 4 hero keys + every catalog id.
const ALL_SAMPLE_KEYS = () => [...Object.keys(HERO_SOUNDS), ...Object.keys(SOUND_CATALOG)];

// Load all stored samples for a given slot into HERO_SAMPLES.
// Sets undefined for keys without a stored sample (= use synth fallback).
const loadSamplesForSlot = async (slotN) => {
  if (!slotN) {
    Object.keys(HERO_SAMPLES).forEach(k => { delete HERO_SAMPLES[k]; });
    return;
  }
  for (const k of ALL_SAMPLE_KEYS()) {
    const rec = await idbGet(`slot${slotN}:sample-${k}`);
    const buf = recordToBuffer(rec);
    if (buf) HERO_SAMPLES[k] = buf;
    else delete HERO_SAMPLES[k];
  }
};

// Save a recorded AudioBuffer for a given slot+key.
// Stores Float32Array samples + sample rate.
const saveSampleForSlot = async (slotN, key, buffer) => {
  if (!slotN) return;
  const float32 = buffer.getChannelData(0).slice(); // copy out
  HERO_SAMPLES[key] = buffer;
  await idbPut(`slot${slotN}:sample-${key}`, {
    float32,
    sampleRate: buffer.sampleRate,
  });
};

const deleteSampleForSlot = async (slotN, key) => {
  if (!slotN) return;
  delete HERO_SAMPLES[key];
  await idbDelete(`slot${slotN}:sample-${key}`);
};

const deleteAllSamplesForSlot = async (slotN) => {
  if (!slotN) return;
  for (const k of ALL_SAMPLE_KEYS()) {
    delete HERO_SAMPLES[k];
    await idbDelete(`slot${slotN}:sample-${k}`);
  }
};

// Helpers
const noiseBuffer = (ctx, duration = 0.5) => {
  const buf = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
};

const playKick = (ctx, t, pitch = 60) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(pitch * 2.5, t);
  osc.frequency.exponentialRampToValueAtTime(pitch * 0.6, t + 0.12);
  gain.gain.setValueAtTime(0.9, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t); osc.stop(t + 0.2);
};

const playSnare = (ctx, t) => {
  // noise burst + tonal body
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 0.2);
  const nFilter = ctx.createBiquadFilter();
  nFilter.type = 'highpass'; nFilter.frequency.value = 1500;
  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(0.5, t);
  nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
  noise.connect(nFilter).connect(nGain).connect(ctx.destination);
  noise.start(t);

  const osc = ctx.createOscillator();
  const oGain = ctx.createGain();
  osc.type = 'triangle'; osc.frequency.value = 200;
  oGain.gain.setValueAtTime(0.3, t);
  oGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  osc.connect(oGain).connect(ctx.destination);
  osc.start(t); osc.stop(t + 0.1);
};

const playHat = (ctx, t, open = false) => {
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 0.1);
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass'; filter.frequency.value = 7000;
  const gain = ctx.createGain();
  const dur = open ? 0.18 : 0.04;
  gain.gain.setValueAtTime(0.25, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  noise.connect(filter).connect(gain).connect(ctx.destination);
  noise.start(t); noise.stop(t + dur + 0.05);
};

const playBass = (ctx, t) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth'; osc.frequency.value = 55;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.value = 200; filter.Q.value = 8;
  gain.gain.setValueAtTime(0.4, t);
  gain.gain.linearRampToValueAtTime(0.5, t + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start(t); osc.stop(t + 0.4);
};

const playScratch = (ctx, t) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(800, t);
  osc.frequency.exponentialRampToValueAtTime(200, t + 0.08);
  osc.frequency.exponentialRampToValueAtTime(1200, t + 0.16);
  gain.gain.setValueAtTime(0.3, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t); osc.stop(t + 0.2);
};

const playWhistle = (ctx, t) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(2000, t);
  osc.frequency.exponentialRampToValueAtTime(3500, t + 0.25);
  gain.gain.setValueAtTime(0.001, t);
  gain.gain.linearRampToValueAtTime(0.2, t + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t); osc.stop(t + 0.32);
};

const playLipRoll = (ctx, t) => {
  // amplitude-modulated low buzz
  const osc = ctx.createOscillator();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  const mainGain = ctx.createGain();
  osc.type = 'sawtooth'; osc.frequency.value = 90;
  lfo.frequency.value = 28; lfoGain.gain.value = 0.3;
  lfo.connect(lfoGain).connect(mainGain.gain);
  mainGain.gain.setValueAtTime(0.25, t);
  mainGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  osc.connect(mainGain).connect(ctx.destination);
  osc.start(t); lfo.start(t);
  osc.stop(t + 0.42); lfo.stop(t + 0.42);
};

const playClick = (ctx, t) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(1500, t);
  osc.frequency.exponentialRampToValueAtTime(400, t + 0.02);
  gain.gain.setValueAtTime(0.2, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t); osc.stop(t + 0.05);
};

// Map a sound category to its synth function
const playSound = (cat, soundName) => {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  try {
    switch (cat) {
      case 'Kicks':
        if (/uvular|roll/i.test(soundName || '')) {
          // roll: 4 fast kicks
          for (let i = 0; i < 4; i++) playKick(ctx, t + i * 0.06, 70);
        } else if (/throat|808/i.test(soundName || '')) {
          playKick(ctx, t, 45);
        } else {
          playKick(ctx, t, 60);
        }
        break;
      case 'Snares':
        playSnare(ctx, t);
        break;
      case 'Hats':
        if (/fast/i.test(soundName || '')) {
          for (let i = 0; i < 6; i++) playHat(ctx, t + i * 0.05, false);
        } else {
          playHat(ctx, t, false);
        }
        break;
      case 'Bass':
        playBass(ctx, t);
        break;
      case 'Scratch':
        playScratch(ctx, t);
        break;
      case 'Whistles':
        playWhistle(ctx, t);
        break;
      case 'Liproll':
        playLipRoll(ctx, t);
        break;
      case 'Clicks':
        if (/roll/i.test(soundName || '')) {
          for (let i = 0; i < 5; i++) playClick(ctx, t + i * 0.05);
        } else {
          playClick(ctx, t);
        }
        break;
      default:
        playKick(ctx, t);
    }
  } catch {}
};

// Short countdown beep (pitch up on final BEATBOX)
const playBeep = (high = false) => {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = high ? 880 : 440;
  gain.gain.setValueAtTime(0.001, t);
  gain.gain.linearRampToValueAtTime(0.25, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t + (high ? 0.4 : 0.18));
  osc.connect(gain).connect(ctx.destination);
  osc.start(t); osc.stop(t + (high ? 0.42 : 0.2));
};

// ============ SCREEN: BATTLE ============

function BattleScreen({ char, setChar, go, showToast, checkLevelUp }) {
  // Phases: intro, tactical, rps, countdown{1..4}, round{1..4}, judging, result
  // Sequence: A, B, A, B (RPS loser is "A" = goes first).
  // Each side plays 2 prepared HERO_LESSONS patterns; player rounds use BeatboxHero
  // in battle mode (MPC tap-along), opponent rounds auto-play their pattern.
  const [phase, setPhase] = useState('intro');
  const [countdownVal, setCountdownVal] = useState(3);
  const [judgeHearts, setJudgeHearts] = useState([0, 0, 0, 0, 0]);
  const [rps, setRps] = useState(null);
  const [result, setResult] = useState(null);
  const [revealedJudges, setRevealedJudges] = useState(0);
  const [activeSide, setActiveSide] = useState(null);
  const [playerFirst, setPlayerFirst] = useState(true);
  const [currentSound, setCurrentSound] = useState(null);
  const [currentSoundColor, setCurrentSoundColor] = useState('#D4A017');
  const [liveScore, setLiveScore] = useState({ p: 0, o: 0 });
  const [timeLeft, setTimeLeft] = useState(15);
  const [comboLabel, setComboLabel] = useState(null);
  // Pattern picks (lesson indexes) for each side's two rounds. [first turn, second turn]
  const [playerPatternIdxs, setPlayerPatternIdxs] = useState(null);
  const [oppPatternIdxs, setOppPatternIdxs] = useState(null);
  // Which player slot we're currently editing in the tactical screen (0 or 1)
  const [tacticalSlot, setTacticalSlot] = useState(0);
  const opponent = char._opponent;
  const eventTimers = useRef([]);
  const playerScoreRef = useRef(0);
  const oppScoreRef = useRef(0);
  const BATTLE_BPM = 115;
  const ROUND_SECONDS = 12;
  const TOTAL_ROUNDS = 4;

  // Which side performs round n (1..4)?
  const sideForRound = (n) => {
    const isA = (n % 2 === 1);
    return playerFirst ? (isA ? 'P' : 'O') : (isA ? 'O' : 'P');
  };
  // Each side performs twice; which "turn slot" (0 or 1) is round n for that side?
  const turnSlotForRound = (n) => (n <= 2 ? 0 : 1);

  // Which lesson plays in round n
  const lessonIdxForRound = (n) => {
    const side = sideForRound(n);
    const slot = turnSlotForRound(n);
    if (side === 'P') return playerPatternIdxs?.[slot];
    return oppPatternIdxs?.[slot];
  };

  // Lesson scoring weight: longer + higher tier patterns are worth more
  const lessonValue = (lesson) => {
    if (!lesson) return 0;
    const tier = lesson.tier || 1;
    return Math.round(lesson.pattern.length * (1 + tier * 0.4));
  };
  const playerRoundScore = (lessonIdx, accuracy) => {
    const lesson = HERO_LESSONS[lessonIdx];
    if (!lesson) return 0;
    const base = lessonValue(lesson);
    const statMult = 1 + (char.stats.tec + char.stats.mus) / 80;
    return Math.round(base * accuracy * statMult);
  };
  const oppRoundScore = (lessonIdx) => {
    const lesson = HERO_LESSONS[lessonIdx];
    if (!lesson) return 0;
    const base = lessonValue(lesson);
    const focus = 0.55 + (opponent.stats.tec / 60) * 0.4;
    const statMult = 1 + (opponent.stats.tec + opponent.stats.mus) / 80;
    return Math.round(base * focus * statMult);
  };

  // What lessons can the player pick? Same gating as tec training:
  // progression-unlocked AND any required catalog sound is owned.
  const ownedSet = new Set(char.sounds || []);
  const completed = char.tecLessonsCompleted || 0;
  const isPlayableForPlayer = (i) => {
    if (i > completed) return false;
    const l = HERO_LESSONS[i];
    return !l.requires || ownedSet.has(l.requires);
  };
  const playablePlayerIdxs = HERO_LESSONS.map((_, i) => i).filter(isPlayableForPlayer);

  // Default pattern picks for both sides — first 2 distinct playable lessons (player),
  // 2 random from a level-scaled pool (opponent).
  const computeDefaultPlayerPicks = () => {
    const a = playablePlayerIdxs[0] ?? 0;
    const b = playablePlayerIdxs[1] ?? a;
    return [a, b];
  };
  const computeOppPicks = () => {
    const oppLevel = opponent.level || 1;
    const maxIdx = Math.max(0, Math.min(HERO_LESSONS.length - 1, oppLevel + 1));
    const pool = []; for (let i = 0; i <= maxIdx; i++) pool.push(i);
    const pick = () => pool[Math.floor(Math.random() * pool.length)];
    return [pick(), pick()];
  };

  useEffect(() => {
    if (!opponent) { go('bar'); return; }
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => { eventTimers.current.forEach(clearTimeout); };
  }, []);

  if (!opponent) return null;

  const playRps = (choice) => {
    const opp = ['rock', 'paper', 'scissors'][Math.floor(Math.random() * 3)];
    const beats = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
    let outcome;
    if (choice === opp) outcome = 'tie';
    else if (beats[choice] === opp) outcome = 'win';
    else outcome = 'lose';
    setRps({ player: choice, opp, outcome });
    setTimeout(() => {
      if (outcome === 'tie') { setRps(null); return; }
      // Loser of RPS goes first (the "A" beatboxer)
      setPlayerFirst(outcome === 'lose');
      setPhase('countdown1');
    }, 1400);
  };

  // Enter tactical phase: lock in default picks for both sides (player can change theirs).
  const startTactical = () => {
    getAudioCtx();
    setPlayerPatternIdxs(computeDefaultPlayerPicks());
    setOppPatternIdxs(computeOppPicks());
    setTacticalSlot(0);
    setPhase('tactical');
  };

  // Opponent round: auto-play the picked lesson pattern at battle BPM, awarding a fixed
  // score (derived from pattern value × focus from stats) progressively as the round runs.
  // Opponent round: BeatboxHero (mounted in JSX in spectate mode) handles audio + visual notes.
  // Here we just tick the score, emit occasional judge hearts, and signal completion.
  const playOpponentRoundPattern = (lessonIdx, color, onDone) => {
    eventTimers.current.forEach(clearTimeout);
    eventTimers.current = [];
    setActiveSide('O');
    setTimeLeft(ROUND_SECONDS);
    setComboLabel(null);
    setCurrentSound(HERO_LESSONS[lessonIdx]?.name || null);
    setCurrentSoundColor(color);

    const lesson = HERO_LESSONS[lessonIdx];
    if (lesson) {
      const beatMs = 60000 / BATTLE_BPM;
      // Random judge hearts — chance per pattern note (without firing audio; that's BeatboxHero's job)
      const startMs = 0;
      lesson.pattern.forEach(note => {
        const t = startMs + note.beat * beatMs;
        if (t < ROUND_SECONDS * 1000 - 100) {
          if (Math.random() < 0.3) {
            eventTimers.current.push(setTimeout(() => {
              setJudgeHearts(h => {
                const next = [...h];
                const i = Math.floor(Math.random() * 5);
                next[i] = next[i] + 1;
                return next;
              });
            }, t));
          }
        }
      });

      // Score ticks up linearly so it feels alive
      const startScore = oppScoreRef.current;
      const finalScore = oppRoundScore(lessonIdx);
      const endScore = startScore + finalScore;
      for (let pct = 1; pct <= 10; pct++) {
        const at = (ROUND_SECONDS * 1000 * pct) / 10;
        eventTimers.current.push(setTimeout(() => {
          const v = Math.round(startScore + (endScore - startScore) * pct / 10);
          oppScoreRef.current = v;
          setLiveScore(s => ({ ...s, o: v }));
        }, at));
      }
    }

    for (let s = ROUND_SECONDS - 1; s >= 0; s--) {
      eventTimers.current.push(setTimeout(() => setTimeLeft(s), (ROUND_SECONDS - s) * 1000));
    }

    eventTimers.current.push(setTimeout(() => {
      setCurrentSound(null);
      setActiveSide(null);
      setComboLabel(null);
      onDone();
    }, ROUND_SECONDS * 1000));
  };

  // Player round: rely on BeatboxHero (mounted in JSX) for audio + tap input. We just
  // prep state — the score is awarded when BeatboxHero fires onLessonComplete.
  const startPlayerRound = (lessonIdx, color) => {
    eventTimers.current.forEach(clearTimeout);
    eventTimers.current = [];
    setActiveSide('P');
    setCurrentSound(HERO_LESSONS[lessonIdx]?.name || null);
    setCurrentSoundColor(color);
    setTimeLeft(ROUND_SECONDS);
    setComboLabel({ text: HERO_LESSONS[lessonIdx]?.name || '', key: Date.now() });

    // Tick the countdown in sync with what BeatboxHero is doing
    for (let s = ROUND_SECONDS - 1; s >= 0; s--) {
      eventTimers.current.push(setTimeout(() => setTimeLeft(s), (ROUND_SECONDS - s) * 1000));
    }
  };

  // Countdown effect: 3 → 2 → 1 → BEATBOX! → start round
  useEffect(() => {
    const isCountdown = /^countdown[1-4]$/.test(phase);
    if (!isCountdown) return;
    const roundN = parseInt(phase.replace('countdown', ''));
    setCountdownVal(3);
    playBeep(false);
    const timers = [
      setTimeout(() => { setCountdownVal(2); playBeep(false); }, 800),
      setTimeout(() => { setCountdownVal(1); playBeep(false); }, 1600),
      setTimeout(() => { setCountdownVal('BEATBOX!'); playBeep(true); }, 2400),
      setTimeout(() => setPhase(`round${roundN}`), 3300),
    ];
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  // Reset cumulative scores at the start of round 1
  useEffect(() => {
    if (phase === 'countdown1') {
      playerScoreRef.current = 0;
      oppScoreRef.current = 0;
      setLiveScore({ p: 0, o: 0 });
    }
  }, [phase]);

  // Round runner: opponent rounds auto-play their pattern; player rounds are driven
  // by the BeatboxHero component mounted in JSX (its onLessonComplete advances phase).
  useEffect(() => {
    const m = /^round([1-4])$/.exec(phase);
    if (!m) return;
    if (!playerPatternIdxs || !oppPatternIdxs) return;
    const roundN = parseInt(m[1]);
    const side = sideForRound(roundN);
    const lessonIdx = lessonIdxForRound(roundN);
    const nextPhase = roundN < TOTAL_ROUNDS ? `countdown${roundN + 1}` : 'judging';
    if (side === 'O') {
      playOpponentRoundPattern(lessonIdx, '#CC2200', () => setPhase(nextPhase));
    } else {
      startPlayerRound(lessonIdx, char.color);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, playerPatternIdxs, oppPatternIdxs]);

  // When player's BeatboxHero finishes its single rep, score the round and advance.
  const handlePlayerRoundComplete = (roundN, accuracy) => {
    const lessonIdx = lessonIdxForRound(roundN);
    const score = playerRoundScore(lessonIdx, accuracy);
    const newScore = playerScoreRef.current + score;
    playerScoreRef.current = newScore;
    setLiveScore(s => ({ ...s, p: newScore }));
    // Brief celebratory hold before advancing
    eventTimers.current.push(setTimeout(() => {
      setActiveSide(null);
      setComboLabel(null);
      const nextPhase = roundN < TOTAL_ROUNDS ? `countdown${roundN + 1}` : 'judging';
      setPhase(nextPhase);
    }, 1500));
  };

  // When judging starts, compute the result from accumulated scores + judges' biases.
  useEffect(() => {
    if (phase !== 'judging' || result) return;
    const finalP = playerScoreRef.current;
    const finalO = oppScoreRef.current;
    // Distinct sounds across each side's two patterns (originality bias)
    const playerLessons = (playerPatternIdxs || []).map(i => HERO_LESSONS[i]).filter(Boolean);
    const oppLessons = (oppPatternIdxs || []).map(i => HERO_LESSONS[i]).filter(Boolean);
    const playerUniqueSounds = new Set(playerLessons.flatMap(l => l.pattern.map(n => n.sound)));
    const oppUniqueSounds = new Set(oppLessons.flatMap(l => l.pattern.map(n => n.sound)));
    const judgeVotes = JUDGES.map(j => {
      let p = finalP, o = finalO;
      if (j.bias === 'technicality') {
        p *= 1 + char.stats.tec / 60;
        o *= 1 + opponent.stats.tec / 60;
      } else if (j.bias === 'musicality') {
        p *= 1 + char.stats.mus / 60;
        o *= 1 + opponent.stats.mus / 60;
      } else if (j.bias === 'originality') {
        p *= 1 + playerUniqueSounds.size / 8;
        o *= 1 + oppUniqueSounds.size / 8;
      } else if (j.bias === 'showmanship') {
        p *= 1 + char.stats.sho / 50;
        o *= 1 + opponent.stats.sho / 50;
      } else {
        p *= 0.85 + Math.random() * 0.3;
        o *= 0.85 + Math.random() * 0.3;
      }
      return { judge: j, vote: p > o ? 'P' : 'O', pScore: Math.round(p), oScore: Math.round(o) };
    });
    const playerVotes = judgeVotes.filter(v => v.vote === 'P').length;
    setResult({ won: playerVotes >= 3, finalP, finalO, judgeVotes, playerVotes });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (phase === 'judging' && result) {
      if (revealedJudges < 5) {
        const t = setTimeout(() => setRevealedJudges(r => r + 1), 700);
        return () => clearTimeout(t);
      } else {
        const t = setTimeout(() => setPhase('result'), 800);
        return () => clearTimeout(t);
      }
    }
  }, [phase, revealedJudges, result]);

  const finishBattle = () => {
    const won = result.won;
    setChar(c => {
      const reward = won ? opponent.reward : Math.floor(opponent.reward * 0.1);
      const fans = won ? Math.floor(opponent.reward / 10) : 1;
      const xp = won ? 60 : 20;
      let newC = {
        ...c,
        cash: c.cash + reward,
        followers: c.followers + fans,
        energy: Math.max(0, c.energy - 30),
        minutes: c.minutes + 90, // a battle takes ~90 game minutes
        mood: Math.min(100, Math.max(0, c.mood + (won ? 15 : -10))),
        xp: c.xp + xp,
        defeated: won && !c.defeated.includes(opponent.name) ? [...c.defeated, opponent.name] : c.defeated,
        lastBattleDay: c.day, // 1-battle-per-week cooldown
      };
      delete newC._opponent;
      return checkLevelUp(newC);
    });
    showToast(won ? `🏆 WIN! +$${opponent.reward}` : 'You lost. Train harder!', won ? 'win' : 'bad');
    go('bar');
  };

  return (
    <div className="space-y-3 pt-2">
      <button onClick={() => { eventTimers.current.forEach(clearTimeout); setChar(c => { const n = { ...c }; delete n._opponent; return n; }); go('bar'); }}
        className="text-stone-500 hover:text-stone-300 text-xs uppercase tracking-wider flex items-center gap-1">
        <ArrowLeft size={14} /> Forfeit
      </button>

      {phase === 'intro' && (
        <div className="space-y-3 pt-2">
          <div className="text-center text-3xl tracking-tighter text-amber-500 font-black" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
            BATTLE TIME
          </div>
          <PixelStage char={char} opponent={opponent} activeSide={null} currentSound={null}
            judgeVotes={[]} revealedJudges={0} />
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="border-2 border-stone-800 bg-stone-900/30 p-2">
              <div className="text-amber-500 text-sm tracking-wider" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>{char.name.toUpperCase()}</div>
              <div className="text-[10px] text-stone-500 uppercase">M{char.stats.mus} T{char.stats.tec} O{char.stats.ori} S{char.stats.sho}</div>
            </div>
            <div className="border-2 border-stone-800 bg-stone-900/30 p-2">
              <div className="text-red-500 text-sm tracking-wider" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>{opponent.name.toUpperCase()}</div>
              <div className="text-[10px] text-stone-500 uppercase">M{opponent.stats.mus} T{opponent.stats.tec} O{opponent.stats.ori} S{opponent.stats.sho}</div>
            </div>
          </div>
          <Btn variant="primary" onClick={startTactical} className="w-full py-3">PICK YOUR PATTERNS ▶</Btn>
        </div>
      )}

      {phase === 'tactical' && playerPatternIdxs && (() => {
        const slots = [0, 1];
        const setPick = (slot, idx) => {
          setPlayerPatternIdxs(p => { const n = [...p]; n[slot] = idx; return n; });
        };
        return (
          <div className="space-y-3">
            <div className="text-center">
              <div className="text-amber-500 text-2xl tracking-wider" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
                PREP YOUR SET
              </div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Pick a pattern for each of your two rounds</div>
            </div>
            {slots.map(slot => {
              const currentIdx = playerPatternIdxs[slot];
              const currentLesson = HERO_LESSONS[currentIdx];
              return (
                <div key={slot} className="border-2 border-stone-800 bg-stone-900/30 p-2 space-y-2">
                  <div className="flex items-baseline justify-between">
                    <div className="text-amber-500 text-xs uppercase tracking-widest"
                      style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
                      Your turn #{slot + 1}
                    </div>
                    <div className="text-[10px] text-stone-400">
                      {currentLesson?.name || '—'}
                    </div>
                  </div>
                  <div className="overflow-x-auto -mx-1">
                    <div className="flex gap-1.5 px-1 pb-1">
                      {HERO_LESSONS.map((lesson, i) => {
                        const playable = isPlayableForPlayer(i);
                        const selected = i === currentIdx;
                        return (
                          <button key={i}
                            disabled={!playable}
                            onClick={() => setPick(slot, i)}
                            className={`flex-shrink-0 px-2.5 py-1.5 border-2 text-[10px] uppercase tracking-widest whitespace-nowrap transition-all ${
                              selected ? 'border-amber-500 bg-amber-500/10 text-amber-500' :
                              playable ? 'border-stone-700 text-stone-400 hover:border-amber-500/50' :
                                         'border-stone-800 text-stone-600 opacity-40'
                            }`}>
                            {!playable && '🔒 '}#{i + 1}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="text-[10px] text-stone-500 uppercase tracking-wider">
                    {currentLesson?.desc || ''}
                  </div>
                </div>
              );
            })}
            <Btn variant="primary" onClick={() => setPhase('rps')} className="w-full py-3">LOCK IN ▶</Btn>
          </div>
        );
      })()}

      {phase === 'rps' && (
        <div className="space-y-4 text-center pt-4">
          <div className="text-amber-500 text-xl tracking-wider" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>ROCK PAPER SCISSORS</div>
          <div className="text-[10px] uppercase tracking-widest text-stone-500">Loser goes first</div>
          {!rps && (
            <div className="grid grid-cols-3 gap-2 pt-4">
              {[{ k: 'rock', e: '✊' }, { k: 'paper', e: '✋' }, { k: 'scissors', e: '✌️' }].map(o => (
                <button key={o.k} onClick={() => playRps(o.k)}
                  className="aspect-square border-2 border-stone-800 hover:border-amber-500 text-5xl bg-stone-900/30 transition-all">
                  {o.e}
                </button>
              ))}
            </div>
          )}
          {rps && (
            <div className="pt-4">
              <div className="flex items-center justify-around text-5xl">
                <div>{{ rock: '✊', paper: '✋', scissors: '✌️' }[rps.player]}</div>
                <div className="text-stone-700 text-2xl">vs</div>
                <div>{{ rock: '✊', paper: '✋', scissors: '✌️' }[rps.opp]}</div>
              </div>
              <div className={`mt-4 text-2xl tracking-wider ${rps.outcome === 'win' ? 'text-amber-500' : rps.outcome === 'lose' ? 'text-red-500' : 'text-stone-400'}`}
                style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
                {rps.outcome === 'win' ? 'YOU WIN! THEY START' : rps.outcome === 'lose' ? 'YOU GO FIRST' : 'TIE — REPLAY'}
              </div>
            </div>
          )}
        </div>
      )}

      {/^(round|countdown)[1-4]$/.test(phase) && playerPatternIdxs && oppPatternIdxs && (() => {
        const m = /^(round|countdown)([1-4])$/.exec(phase);
        const isCountdown = m[1] === 'countdown';
        const roundN = parseInt(m[2]);
        const side = sideForRound(roundN);
        const lessonIdx = lessonIdxForRound(roundN);
        const lesson = HERO_LESSONS[lessonIdx];
        const upcomingName = side === 'P' ? char.name : opponent.name;
        const isPlayerRound = side === 'P';
        const isOppRound = side === 'O';
        return (
          <div className="space-y-2">
            <BattleHUD char={char} opponent={opponent} timeLeft={isCountdown ? ROUND_SECONDS : timeLeft} pScore={liveScore.p} oScore={liveScore.o} />
            <div className="relative">
              <PixelStage char={char} opponent={opponent}
                activeSide={isCountdown ? null : activeSide}
                currentSound={isCountdown ? null : currentSound}
                soundColor={isCountdown ? '#D4A017' : currentSoundColor}
                judgeVotes={[]} revealedJudges={0}
                judgeHearts={isCountdown ? [0,0,0,0,0] : judgeHearts}
                comboLabel={isCountdown ? null : comboLabel} />
              {isCountdown && (
                <div className="absolute inset-0 flex items-center justify-center bg-stone-950/70 backdrop-blur-sm">
                  <div key={countdownVal} className="text-center"
                    style={{ animation: 'countdownPop 0.7s ease-out' }}>
                    <div className="text-amber-500 text-[10px] uppercase tracking-[0.4em] mb-2">
                      Round {roundN} / {TOTAL_ROUNDS}
                    </div>
                    <div className={`font-black tracking-tighter ${typeof countdownVal === 'string' ? 'text-amber-500 text-6xl' : 'text-stone-100 text-8xl'}`}
                      style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif', textShadow: '4px 4px 0 #0c0a09' }}>
                      {countdownVal}
                    </div>
                    {typeof countdownVal === 'string' && (
                      <div className="text-stone-400 text-xs uppercase tracking-[0.4em] mt-2">
                        {upcomingName}'s turn
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            {!isCountdown && (
              <div className="text-center text-amber-500 text-sm tracking-widest uppercase">
                ROUND {roundN}/{TOTAL_ROUNDS} · {upcomingName} · {lesson?.name}
              </div>
            )}
            {/* Player rounds: BeatboxHero pre-mounts during countdown so canvas + buttons
                are visible while the player gets ready. Activates when round starts. */}
            {isPlayerRound && lesson != null && (
              <BeatboxHero
                mode="battle"
                active={!isCountdown}
                bpm={BATTLE_BPM}
                lessonIdx={lessonIdx}
                onAccuracyUpdate={() => {}}
                onLessonComplete={(_idx, accuracy) => handlePlayerRoundComplete(roundN, accuracy)}
              />
            )}
            {/* Opponent rounds: spectate-mode BeatboxHero shows their pattern as
                ghost notes scrolling so the player can watch + listen. */}
            {isOppRound && !isCountdown && lesson != null && (
              <BeatboxHero
                mode="spectate"
                active={true}
                bpm={BATTLE_BPM}
                lessonIdx={lessonIdx}
                onAccuracyUpdate={() => {}}
                onLessonComplete={() => {}}
              />
            )}
            <style>{`
              @keyframes countdownPop {
                0% { transform: scale(0.4); opacity: 0; }
                30% { transform: scale(1.3); opacity: 1; }
                60% { transform: scale(1); opacity: 1; }
                100% { transform: scale(1); opacity: 1; }
              }
            `}</style>
          </div>
        );
      })()}

      {phase === 'judging' && result && (
        <div className="space-y-3">
          <div className="text-center text-amber-500 text-xl tracking-wider" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>JUDGES VOTE</div>
          <PixelStage char={char} opponent={opponent} activeSide={null} currentSound={null}
            judgeVotes={result.judgeVotes} revealedJudges={revealedJudges} judgeHearts={[0,0,0,0,0]} />
          <div className="grid grid-cols-5 gap-1">
            {result.judgeVotes.map((v, i) => (
              <div key={i} className={`p-2 border-2 text-center transition-all ${
                i >= revealedJudges ? 'border-stone-800 bg-stone-900' :
                v.vote === 'P' ? 'border-amber-500 bg-amber-500/20' :
                'border-red-700 bg-red-950/30'
              }`}>
                <div className="text-lg">{v.judge.emoji}</div>
                <div className="text-[8px] uppercase mt-0.5 text-stone-400">{v.judge.name}</div>
                {i < revealedJudges && <div className={`text-[10px] font-bold ${v.vote === 'P' ? 'text-amber-500' : 'text-red-500'}`}>{v.vote === 'P' ? 'YOU' : 'OPP'}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {phase === 'result' && result && (
        <div className="space-y-4 text-center pt-2">
          <div className={`text-6xl tracking-tighter font-black ${result.won ? 'text-amber-500' : 'text-red-500'}`} style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
            {result.won ? 'VICTORY' : 'DEFEAT'}
          </div>
          <div className="text-stone-400 text-sm">
            {result.playerVotes} - {5 - result.playerVotes}
          </div>
          <Panel title="Breakdown">
            <div className="text-left text-xs space-y-1">
              <div className="flex justify-between"><span className="text-stone-500">Your score:</span> <span className="text-amber-500 font-bold">{result.finalP}</span></div>
              <div className="flex justify-between"><span className="text-stone-500">Opponent:</span> <span className="text-red-500 font-bold">{result.finalO}</span></div>
              <div className="flex justify-between"><span className="text-stone-500">Reward:</span> <span className="text-green-500 font-bold">${result.won ? opponent.reward : Math.floor(opponent.reward * 0.1)}</span></div>
              <div className="flex justify-between"><span className="text-stone-500">XP gained:</span> <span className="text-blue-400">+{result.won ? 60 : 20}</span></div>
            </div>
          </Panel>
          <Btn variant="primary" onClick={finishBattle} className="w-full py-3">CONTINUE →</Btn>
        </div>
      )}
    </div>
  );
}
