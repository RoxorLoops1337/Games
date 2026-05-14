import React, { useState, useEffect, useRef } from 'react';
import { Home, Music, Trophy, ShoppingBag, TreePine, Beer, Mic, Zap, Star, Coffee, Dumbbell, ArrowLeft, Heart, MessageSquare } from 'lucide-react';

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

// ============ SOUND UNLOCKS ============
// Sounds were previously sold in the shop. They're now milestone-gated
// achievements. Each entry has a `condition(c)` predicate; checkSoundUnlocks
// runs on every meaningful state change and adds newly-eligible sounds to
// char.sounds (auto-equipping if there's room) plus a celebratory toast.

const SOUND_UNLOCKS = {
  // Tier 1 — granted at character creation, no condition.
  classic_kick: { tier: 1, label: 'Start',                                cond: () => true },
  hi_hat:       { tier: 1, label: 'Start',                                cond: () => true },
  psh_snare:    { tier: 1, label: 'Start',                                cond: () => true },
  // Tier 2 — early-game milestones
  inward_k:     { tier: 2, label: 'Find the cypher · 3 jams',             cond: (c) => (c.storyFlags?.jamCount || 0) >= 3 },
  throat_kick:  { tier: 2, label: 'Beat Pig Pen',                         cond: (c) => (c.storyFlags?.pigPenWins || 0) >= 1 },
  fast_hats:    { tier: 2, label: '5 open mics performed',                cond: (c) => (c.openMicCount || 0) >= 5 },
  lip_roll:     { tier: 2, label: 'Originality stat ≥ 10',                cond: (c) => (c.stats?.ori || 0) >= 10 },
  // Tier 3 — mid-game
  inward_bass:  { tier: 3, label: 'Beat Sikker',                          cond: (c) => (c.defeated || []).includes('Sikker') },
  d_low:        { tier: 3, label: '200 followers',                        cond: (c) => (c.followers || 0) >= 200 },
  laser:        { tier: 3, label: 'Beat Alim',                            cond: (c) => (c.defeated || []).includes('Alim') },
  click_roll:   { tier: 3, label: '500 followers',                        cond: (c) => (c.followers || 0) >= 500 },
  // Tier 4 — late-game
  uvular_roll:  { tier: 4, label: 'Beat FatboxG',                         cond: (c) => (c.defeated || []).includes('FatboxG') },
};

// Returns array of sound IDs newly unlocked by `c` that aren't already owned.
const newlyUnlockedSounds = (c) => {
  const owned = new Set(c.sounds || []);
  return Object.entries(SOUND_UNLOCKS)
    .filter(([id, cfg]) => !owned.has(id) && cfg.cond(c))
    .map(([id]) => id);
};

// Apply unlocks to a char (returns new char + array of unlocked names so the
// caller can show toasts/cutscenes).
const applySoundUnlocks = (c) => {
  const ids = newlyUnlockedSounds(c);
  if (ids.length === 0) return { char: c, unlocked: [] };
  let next = { ...c, sounds: [...(c.sounds || []), ...ids] };
  // Auto-equip while there's room in the 5-slot equipped bar
  let equipped = [...(c.equipped || [])];
  for (const id of ids) if (equipped.length < 5 && !equipped.includes(id)) equipped.push(id);
  next.equipped = equipped;
  return { char: next, unlocked: ids.map(id => SOUND_CATALOG[id]?.name || id) };
};

// ============ GEAR EFFECT HELPERS ============
// Each helper queries char.gear[id] and returns a multiplier or boolean.
// Wired into the relevant code paths (training, runs, performances, etc.)
const hasGear = (c, id) => !!(c?.gear?.[id]);
// True if the houseplant is alive — owned AND watered within 5 days AND not overwatered to death.
const plantAlive = (c) => hasGear(c, 'houseplant') && !c?.plantDead && ((c?.day || 0) - (c?.lastPlantWaterDay || 0)) < 5;
// Earplugs disable noisy/heating bad-sleep reasons.
const FILTERED_BAD_SLEEP = (c) => hasGear(c, 'earplugs')
  ? BAD_SLEEP_REASONS.filter(r => r.id !== 'noisy' && r.id !== 'heating')
  : BAD_SLEEP_REASONS;


const FOOD = {
  banana:      { name: 'Banana',         cost: 4,  energy: 12, hunger: 15,  mood: 1, kind: 'food'  },
  smoothie:    { name: 'Green Smoothie', cost: 9,  energy: 25, hunger: 20,  mood: 3, kind: 'drink' },
  oat_bowl:    { name: 'Oat Bowl',       cost: 7,  energy: 18, hunger: 35,  mood: 2, kind: 'food'  },
  espresso:    { name: 'Espresso',       cost: 5,  energy: 25, hunger: -15, mood: 2, kind: 'drink' },
  buddha_bowl: { name: 'Buddha Bowl',    cost: 14, energy: 22, hunger: 50,  mood: 4, kind: 'food'  },
};

const NPCS = [
  // Rewards halved + opps tougher (see playOpponentRoundPattern focus formula).
  // counterSkill (0–1): when player wins RPS, opponent re-rolls picks to counter player based on this.
  { name: 'Pig Pen',     stats: { mus: 7,  tec: 7,  ori: 5,  sho: 6  }, sounds: ['classic_kick', 'hi_hat', 'psh_snare'],                                          reward: 20,  level: 1,  counterSkill: 0.20 },
  { name: 'Joel Burner', stats: { mus: 8,  tec: 8,  ori: 6,  sho: 7  }, sounds: ['classic_kick', 'hi_hat', 'psh_snare'],                                          reward: 25,  level: 1,  counterSkill: 0.30 },
  { name: 'CeDe',        stats: { mus: 12, tec: 11, ori: 9,  sho: 10 }, sounds: ['classic_kick', 'hi_hat', 'psh_snare', 'lip_roll'],                              reward: 50,  level: 3,  counterSkill: 0.40 },
  { name: 'Sikker',      stats: { mus: 15, tec: 15, ori: 14, sho: 12 }, sounds: ['classic_kick', 'inward_k', 'fast_hats', 'lip_roll'],                            reward: 100, level: 5,  counterSkill: 0.55 },
  { name: 'Alim',        stats: { mus: 19, tec: 18, ori: 17, sho: 15 }, sounds: ['throat_kick', 'inward_bass', 'fast_hats', 'lip_roll'],                          reward: 175, level: 7,  counterSkill: 0.70 },
  { name: 'Olexinho',    stats: { mus: 24, tec: 22, ori: 22, sho: 19 }, sounds: ['throat_kick', 'click_roll', 'd_low', 'laser', 'inward_bass'],                   reward: 350, level: 9,  counterSkill: 0.80 },
  { name: 'FatboxG',     stats: { mus: 30, tec: 32, ori: 28, sho: 28 }, sounds: ['uvular_roll', 'click_roll', 'd_low', 'inward_bass', 'laser', 'throat_kick'],    reward: 750, level: 12, counterSkill: 0.95 },
];

// Crew battles — 3v3 stat-check showdowns. Unlocked when player has beaten 3+
// solo opponents. Each crew has 3 members + a flavor name. Resolved as best
// of 3 rounds (each round: avg(playerStat) + ally bump vs avg(oppStat) +
// random±10, mood-modulated).
const CREWS = [
  {
    id: 'pen_pals',
    name: 'PEN PALS',
    desc: 'Pig Pen + 2 friends from his crew. Easy money if you survive.',
    minDefeated: 3,
    members: [
      { name: 'Pig Pen', stats: { mus: 7, tec: 7, ori: 5, sho: 6 } },
      { name: 'Ras-T',   stats: { mus: 9, tec: 8, ori: 7, sho: 6 } },
      { name: 'Kiko',    stats: { mus: 8, tec: 7, ori: 9, sho: 7 } },
    ],
    reward: { cash: 80, followers: 15 },
  },
  {
    id: 'vpn_vets',
    name: 'VPN VETS',
    desc: 'Three veterans of the regional scene. Watch the throat kicks.',
    minDefeated: 5,
    members: [
      { name: 'Klem',    stats: { mus: 14, tec: 14, ori: 12, sho: 13 } },
      { name: 'Niko-1',  stats: { mus: 13, tec: 15, ori: 14, sho: 12 } },
      { name: 'Boomer',  stats: { mus: 15, tec: 12, ori: 13, sho: 14 } },
    ],
    reward: { cash: 200, followers: 35, flag: 'crewVpn' },
  },
  {
    id: 'world_champs',
    name: 'WORLD CHAMPS',
    desc: 'Three names from the global circuit. Win this and you move continents.',
    minDefeated: 7,
    members: [
      { name: 'Vex',     stats: { mus: 26, tec: 27, ori: 24, sho: 25 } },
      { name: 'Mir',     stats: { mus: 28, tec: 24, ori: 26, sho: 26 } },
      { name: 'TK-9',    stats: { mus: 27, tec: 28, ori: 25, sho: 27 } },
    ],
    reward: { cash: 800, followers: 120, flag: 'crewChamps' },
  },
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
  songs: [], // released MPC patterns. Each: { id, name, releasedDay, activeCells, lifetimeFans }
  crew: [], // recruited NPCs. Each: { id, joinedDay, lifetimeCash, lifetimeFans }
  oriSlotIdx: 0, // currently active slot (0..3)
  pendingDebuff: null, // {energy?, mood?, hunger?} applied next time you sleep (from bar items)
  showcaseBooking: null, // { day: number, minute: number } — Rohzel's booked Friday slot
  lastShowcaseDay: null, // day a showcase was performed (cooldown: 7 days)
  lastBattleDay: null, // day a battle happened (cooldown: 7 days)
  openMicCount: 0, // total open mics performed (gates Friday show)
  apartmentTier: 1, // 1 = studio ($50/wk), 2 = nicer ($100), 3 = loft ($200)
  rentLate: 0, // consecutive missed Sundays (0..2 — at 3 you get evicted)
  lastRentPaidDay: null, // day rent was last paid (so we don't double-charge)
  evictionRecoveryDay: null, // day on which a couch-surf recovery resolves
  messages: [], // phone messages, newest last; { id, sender, text, day, minute, read }
  lastParentMsgDay: 0, // for cooldown on parent-message triggers
  lastFoxySafetyNetDay: 0, // last day Foxy fed you for free (one per in-game week)
  lastFoxySoupDay: 0, // last day you ate Foxy Soup (free, daily)
  foxyLoanTaken: false, // one-time $15 loan from Foxy when you're broke
  mingleCount: 0, // total bar conversations had
  romanceAffinity: {}, // { candidateId: number } per romance candidate
  romanceState: {}, // { candidateId: 'none' | 'romancing' | 'couple' }
  dateBooking: null, // { partner, day, minute } when a date is scheduled
  metEncounters: {}, // { encounterId: count } so we can vary lines per re-meet
  daily: {}, // counters reset every sleep — drives daily-challenge progress
  dailyChallenge: null, // { id, claimed } the challenge active for today
  weekly: {}, // counters reset every Monday morning — drives weekly-challenge progress
  weeklyChallenge: null, // { id, claimed } the challenge active for this week
  achievements: {}, // { id: dayEarned } unlocked achievements
  lastTourDay: 0, // last day a tour was started (cooldown: 7 days)
  festivalState: null, // null | 'invited' | 'prepping' | 'done'
  festivalAcceptedDay: 0,
  festivalPath: null, // 'A' | 'B' | 'C'
  festivalResult: null, // 'win' | 'lose'
  outfit: 'default', // active stage outfit id (see OUTFITS catalog)
  accessory: 'none', // active accessory id (see ACCESSORIES catalog)
  bjarneSessions: 0, // BeeAmGee studio coaching sessions completed
  lastBjarneDay: 0, // last day you trained with BeeAmGee (cooldown: 3 days)
  apartmentMovedInDay: 0, // track when you upgraded for the move-in cutscene gating
  sickDay: 0, // day you woke up sick (lose the day to bed)
  flashbacksSeen: {}, // { id: dayShownOn } so each fires only once
  gear: {}, // { itemId: true } for purchased gear (PC, headphones, plant, etc.)
  lastCoffeeDay: 0, // last day you used the home coffee machine
  lastPlantWaterDay: 0, // last day you watered the houseplant (alive ≤5 days)
  lastYogaDay: 0, // last day you meditated on the yoga mat
  storyFlags: {}, // narrative beats — see narrative spec; all start undefined/false
  created: false,
});

// ============ GLOBAL KEY DISPATCHER ============
// One document-level capture-phase keydown listener, attached on first
// subscription. Components register via onGlobalKey(handler) and get an
// unsubscribe function back. Capture-phase ensures we see keys before any
// other listener (or framework default) can stop propagation.

const _keyListeners = new Set();
let _keyListenerAttached = false;
let _lastGlobalKey = '';
let _lastGlobalKeyAt = 0;
const _dispatchGlobalKey = (e) => {
  // Stash for the debug overlay regardless of focus
  _lastGlobalKey = `${e.key}/${e.code}`;
  _lastGlobalKeyAt = performance.now();
  // Skip if focused inside an editable field, or if a modifier is held —
  // those are reserved for browser/system shortcuts.
  const ae = (typeof document !== 'undefined') ? document.activeElement : null;
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  _keyListeners.forEach(fn => { try { fn(e); } catch (err) { /* swallow */ } });
};
const onGlobalKey = (handler) => {
  _keyListeners.add(handler);
  if (!_keyListenerAttached && typeof document !== 'undefined' && typeof window !== 'undefined') {
    _keyListenerAttached = true;
    // Capture phase so we run before any framework listeners that might
    // stop propagation. document covers all child event targets.
    document.addEventListener('keydown', _dispatchGlobalKey, true);
  }
  return () => _keyListeners.delete(handler);
};

// ============ PHONE MESSAGES ============
// Low-cost narrative dripfeed channel. NPCs send one-way texts; the player
// can read them but doesn't reply. Each new unread message shows a badge
// on the phone icon in the header.

const SENDER_META = {
  parents: { display: 'PARENTS',   color: '#fbbf24' },
  rohzel:  { display: 'ROHZEL',    color: '#22d3ee' },
  pigpen:  { display: 'PIG PEN',   color: '#fb7185' },
  penny:   { display: 'PENNY',     color: '#a78bfa' },
  foxy:    { display: 'FOXY',      color: '#84cc16' },
  crystix: { display: 'CRYSTIX',   color: '#22d3ee' },
  beeamgee:{ display: 'BEEAMGEE',  color: '#D4A017' },
  unknown: { display: 'UNKNOWN',   color: '#a8a29e' },
};

// Parent message rotations — keyed by trigger reason.
const PARENT_MESSAGES = {
  hungerLow: [
    "are you eating? we're not mad about the job but call your mother",
    "did you eat today? please eat something",
  ],
  rentPaid: [
    "rent paid this month? we can help if you need",
    "we saw a couple thousand in our account if you need it",
  ],
  rentMissed: [
    "are you doing okay? the door's always open here",
    "your father said let us help you. text back",
  ],
  goodShow: [
    "saw your show on insta lol look at you",
    "the auntie is asking who taught you to do that. what do i tell her",
  ],
  random: [
    "just thinking of you ❤️",
    "dad found your high school yearbook 😂",
    "your cousin asked when you're coming home",
    "the dog misses you. i miss you too but the dog more",
  ],
};

// Anonymous internet messages — hate + fan. Sender shows as 'UNKNOWN'.
// Triggers: after performances (good show → fan, bad show → hate), and a
// small daily roll on sleep transition (3% each).
const UNKNOWN_MESSAGES_HATE = [
  "your beats are wack.",
  "stop posting. you're not it.",
  "saw your clip. yikes.",
  "delete your account.",
  "embarrassing tbh",
  "you peaked at the open mic lmao",
  "no one cares.",
  "0 talent. confirmed.",
  "could literally be replaced by a drum machine.",
  "this is why people miss real beatboxers.",
];
const UNKNOWN_MESSAGES_FAN = [
  "saw your clip — fire 🔥",
  "bro you're underrated. keep going.",
  "i don't know you but i love your stuff.",
  "the rolls last show?? insane.",
  "showed my friends your video. they're hooked.",
  "from a stranger: keep doing what you're doing.",
  "you're inspiring. that's all.",
  "your beats hit different.",
  "i wait for your posts. please don't stop.",
  "you remind me why i started.",
];

// Bad-sleep reasons — ~10% chance per sleep. Each has a narrative line
// and an `energyCap` (fraction of maxEnergy you wake up at instead of full).
// Some are state-conditional via `when(c, newDay)`.
const BAD_SLEEP_REASONS = [
  { id: 'nightmare',   energyCap: 0.7, line: "Bad dream. You woke up rattled." },
  { id: 'lonely',      energyCap: 0.75, line: "The apartment was too quiet for sleeping." },
  { id: 'noisy',       energyCap: 0.7, line: "Upstairs neighbor played speed garage at 3am." },
  { id: 'heating',     energyCap: 0.8, line: "Couldn't get comfortable. The heating is stuck on high." },
  { id: 'layoff',      energyCap: 0.6, line: "You woke up at 4am thinking about the job. Again." },
  { id: 'rent',        energyCap: 0.6, line: "You couldn't stop thinking about the rent.",
                       when: (c) => (c.rentLate || 0) >= 1 },
  { id: 'battle',      energyCap: 0.65, line: "Your brain ran the next battle on a loop.",
                       when: (c, newDay) => (newDay % 7) === 5 || (newDay % 7) === 4 },
  { id: 'showcase',    energyCap: 0.65, line: "Friday's set looped in your head all night.",
                       when: (c, newDay) => c.showcaseBooking?.day && c.showcaseBooking.day - newDay <= 1 && c.showcaseBooking.day >= newDay },
  { id: 'replay_loss', energyCap: 0.7, line: "You replayed the battle you lost. Every move.",
                       when: (c) => c.lastBattleDay && (c.day - c.lastBattleDay) <= 2 && (c.storyFlags?.pigPenWins || 0) === 0 && c.storyFlags?.pigPenBattled },
  { id: 'caffeine',    energyCap: 0.7, line: "That late espresso came back to bite.",
                       when: (c) => (c.pendingDebuff?.energy || 0) <= -10 },
];

// ============ RANDOM EVENTS ============
// Roll once per sleep transition. ~30% chance any event fires; the picker
// filters by `when(c)` then weighted-picks. Each event applies a small
// effect + a 1-beat narrative line. Some are pure flavor, some are setbacks,
// some are surprise wins.
const RANDOM_EVENTS = [
  { id: 'bird_poop', weight: 3, color: '#a8a29e',
    title: 'A SEAGULL JUST BLESSED YOU',
    lines: ['Right on the jacket. New jacket too.'],
    effects: { mood: -3 } },
  { id: 'street_compliment', weight: 4, color: '#fbbf24',
    title: 'STREET COMPLIMENT',
    lines: ["A stranger heard you in the park.", '"that\'s actually sick. keep it up."'],
    effects: { mood: +5, followers: +1 } },
  { id: 'lost_tenner', weight: 2, color: '#22c55e',
    title: 'TEN BUCKS ON THE GROUND',
    lines: ['Wadded up next to the bus stop.', 'Nobody else around. Yours now.'],
    effects: { cash: +10, mood: +4 } },
  { id: 'song_on_radio', weight: 3, when: (c) => c.day >= 10, color: '#fb7185',
    title: 'THE SONG',
    lines: [
      'A track came on. The one that made you start.',
      "You're standing in the kitchen at 1 AM.",
      "You're not the same person who first heard this.",
    ],
    effects: { mood: +12 } },
  { id: 'old_yt_comment', weight: 2, when: (c) => c.day >= 14, color: '#fb7185',
    title: 'A NOTIFICATION FROM 2017',
    lines: [
      'YouTube reminded you of a comment.',
      "'one day i'll do this on a real stage.'",
      "You'd forgotten you wrote it.",
    ],
    effects: { mood: +8 } },
  { id: 'birthday_gig', weight: 2, when: (c) => c.storyFlags?.firstJam, color: '#fbbf24',
    title: 'BIRTHDAY GIG',
    lines: ["Someone DM'd you: birthday party tonight, $30 cash.", "Twenty minutes. Done. Easy money."],
    effects: { cash: +30, followers: +3, mood: +5 } },
  { id: 'journalist_dm', weight: 2, when: (c) => (c.followers || 0) >= 20, color: '#22d3ee',
    title: 'A JOURNALIST WROTE',
    lines: ['Local mag wants 200 words about the scene.', 'You answered. Thoughtfully.'],
    effects: { stats: { sho: +1 }, mood: +6 } },
  { id: 'crystix_viral', weight: 1, when: (c) => c.storyFlags?.crystixMet, color: '#22d3ee',
    title: 'CRYSTIX TAGGED YOU',
    lines: ['Their clip blew up. Your face is in the duet panel.', 'Notifications won\'t stop.'],
    effects: { followers: +50, mood: +10 } },
  { id: 'bike_stolen', weight: 2, when: (c) => c.day >= 5, color: '#dc2626',
    title: 'YOUR BIKE IS GONE',
    lines: ['You locked it. They cut the lock.', 'Walking everywhere now.'],
    effects: { cash: -25, mood: -8 } },
  { id: 'phone_died', weight: 2, when: (c) => c.day >= 4, color: '#a8a29e',
    title: 'PHONE FROZE AT 3%',
    lines: ['Then died completely. You missed every text.'],
    effects: { mood: -5, special: 'markAllRead' } },
  { id: 'algorithm_dud', weight: 2, when: (c) => (c.followers || 0) >= 30, color: '#5a5046',
    title: 'POST FLOPPED',
    lines: ['12 likes in 6 hours. The algorithm forgot you.'],
    effects: { mood: -8 } },
  { id: 'free_coffee', weight: 2, when: (c) => (c.followers || 0) >= 50, color: '#fbbf24',
    title: 'FREE COFFEE',
    lines: ['Barista recognized you. "this one\'s on the house."', 'You almost cried.'],
    effects: { energy: +15, mood: +6 } },
  { id: 'og_invite', weight: 1, when: (c) => c.day >= 20, color: '#D4A017',
    title: 'AN OLDER VOICE LEFT A VOICEMEMO',
    lines: ['"come by the studio next week. bring patterns."', "You don't recognize the number."],
    effects: { stats: { tec: +1 }, mood: +8 } },
  { id: 'rent_help', weight: 1, when: (c) => (c.rentLate || 0) >= 1, color: '#84cc16',
    title: 'PARENTS WIRED MONEY',
    lines: ['$40 in your account. No note.', "You'll call your mum later. Maybe."],
    effects: { cash: +40, mood: +3 } },
  { id: 'good_dream', weight: 2, when: (c) => c.day >= 8, color: '#a78bfa',
    title: 'A GOOD DREAM',
    lines: ['You woke up smiling for once.', "Couldn't tell anyone what it was about."],
    effects: { mood: +10, energy: +5 } },
  // ---- Setbacks: bad days that test your discipline ----
  { id: 'sick_day', weight: 2, when: (c) => c.day >= 6 && (c.sickDay || 0) !== c.day, color: '#84cc16',
    title: 'YOU\'RE SICK',
    lines: [
      "Sore throat. Headache. The kind of tired sleep can't fix.",
      "No drills today. No mic. No bar.",
      "Soup, water, bed. The rest will wait.",
    ],
    effects: { mood: -8, energy: -25, special: 'sick' } },
  { id: 'parking_ticket', weight: 2, when: (c) => c.day >= 7, color: '#dc2626',
    title: 'PARKING TICKET',
    lines: ['$40 stuck under the wiper.', '"Expired permit." You forgot.'],
    effects: { cash: -40, mood: -6 } },
  { id: 'dentist', weight: 1, when: (c) => c.day >= 12, color: '#dc2626',
    title: 'DENTIST EMERGENCY',
    lines: ["Molar split on a piece of granola.", "$80 to numb it. $200 you don't have for the crown.", "You'll deal with it later."],
    effects: { cash: -80, mood: -10 } },
  { id: 'broken_phone', weight: 1, when: (c) => c.day >= 8, color: '#5a5046',
    title: 'CRACKED SCREEN',
    lines: ['Drop. Spider web. The repair guy charges $60.', "It still works. Mostly."],
    effects: { cash: -60, mood: -4 } },
  { id: 'food_poisoning', weight: 1, when: (c) => c.day >= 10, color: '#84cc16',
    title: 'BAD TAKEOUT',
    lines: ["Bathroom floor for two hours. The bin nearby just in case.", "Whatever was in that container, it's not in you anymore."],
    effects: { hunger: -30, mood: -8, energy: -15 } },
  { id: 'tax_letter', weight: 1, when: (c) => c.day >= 18, color: '#a8a29e',
    title: 'A LETTER FROM THE COUNCIL',
    lines: ['"Outstanding balance: $120."', "You don't fully understand it. But you owe it.", "Pay this month or it triples."],
    effects: { cash: -120, mood: -10 } },
  { id: 'bombed_set', weight: 2, when: (c) => (c.openMicCount || 0) >= 2 && c.day >= 5, color: '#dc2626',
    title: 'YOU BOMBED LAST NIGHT',
    lines: [
      "Wrong key. Wrong rhythm. The crowd just stared.",
      "A clip's already up. Twelve angry comments.",
      "Tomorrow's another day. Probably.",
    ],
    effects: { mood: -15, followers: -3 } },
  { id: 'rivalry_clip', weight: 1, when: (c) => (c.followers || 0) >= 80 && c.storyFlags?.pigPenWins, color: '#fb7185',
    title: 'SOMEONE DISSED YOU ONLINE',
    lines: ["A reply video. Your name. Your face. Forty thousand views and climbing.", "The comments are split. Some defend you.", "It feels like a fight you didn't pick."],
    effects: { mood: -12, followers: +8 } },
  { id: 'rent_increase_letter', weight: 1, when: (c) => c.day >= 25 && (c.apartmentTier || 1) === 1, color: '#dc2626',
    title: 'NOTICE FROM THE LANDLORD',
    lines: ['Rent goes up $10/week starting next month.', '"Market conditions." That\'s all the letter says.'],
    effects: { mood: -8, special: 'rentBump' } },
];

const pickRandomEvent = (c) => {
  const eligible = RANDOM_EVENTS.filter(e => !e.when || (() => { try { return e.when(c); } catch { return false; } })());
  if (!eligible.length) return null;
  const total = eligible.reduce((s, e) => s + (e.weight || 1), 0);
  let r = Math.random() * total;
  for (const e of eligible) { r -= (e.weight || 1); if (r <= 0) return e; }
  return eligible[eligible.length - 1];
};

// Apply a random event's effects to a char, returning a new char.
const applyRandomEvent = (c, ev) => {
  const e = ev?.effects || {};
  let next = { ...c };
  const max = c.maxEnergy ?? 100;
  if (typeof e.mood === 'number')      next.mood = _clampPct((c.mood || 0) + e.mood);
  if (typeof e.energy === 'number')    next.energy = Math.max(0, Math.min(max, (c.energy || 0) + e.energy));
  if (typeof e.hunger === 'number')    next.hunger = _clampPct((c.hunger || 0) + e.hunger);
  if (typeof e.cash === 'number')      next.cash = Math.max(0, (c.cash || 0) + e.cash);
  if (typeof e.followers === 'number') next.followers = Math.max(0, (c.followers || 0) + e.followers);
  if (e.stats) {
    next.stats = { ...(c.stats || {}) };
    for (const [k, v] of Object.entries(e.stats)) next.stats[k] = (next.stats[k] || 0) + v;
  }
  if (e.flags) next.storyFlags = { ...(c.storyFlags || {}), ...e.flags };
  if (e.special === 'markAllRead') {
    next.messages = (c.messages || []).map(m => ({ ...m, read: true }));
  }
  if (e.special === 'sick') {
    next.sickDay = c.day;
  }
  if (e.special === 'rentBump') {
    next.rentBumped = true; // visible elsewhere if we want a flag; not deducted automatically
  }
  return next;
};

// ============ DAILY CHALLENGES ============
// One challenge per in-game day. Picked at sleep transition based on the
// new day-of-week. Each targets a counter inside char.daily, which is
// reset every morning. Reward gets claimed once, manually, when target met.
const DAILY_CHALLENGES = [
  { id: 'jams_3',     label: 'Do 3 cypher jams',     target: 3, counter: 'jams',     reward: { cash: 15 } },
  { id: 'openmic_1',  label: 'Play 1 open mic',      target: 1, counter: 'openMics', reward: { cash: 15 },
    when: (dow) => dow >= 1 && dow <= 3 }, // Tue/Wed/Thu only
  { id: 'mingle_2',   label: 'Have 2 bar conversations', target: 2, counter: 'mingles', reward: { cash: 10 },
    when: (dow) => dow !== 0 }, // not Monday
  { id: 'busks_2',    label: 'Busk twice in the park',   target: 2, counter: 'busks',  reward: { cash: 12 } },
  { id: 'runs_1',     label: 'Complete a run session',   target: 1, counter: 'runs',   reward: { cash: 8, mood: 5 } },
  { id: 'battle_win', label: 'Win a battle tonight', target: 1, counter: 'battleWins', reward: { cash: 30 },
    when: (dow) => dow === 5 }, // Saturday
  { id: 'showcase',   label: 'Play the Friday showcase', target: 1, counter: 'showcases', reward: { cash: 30 },
    when: (dow) => dow === 4 }, // Friday
  { id: 'foxy_hi',    label: 'Say hi to Foxy',       target: 1, counter: 'foxyHi',   reward: { mood: 6 } },
];

const pickDailyChallenge = (dow, c) => {
  const eligible = DAILY_CHALLENGES.filter(ch => !ch.when || ch.when(dow));
  if (!eligible.length) return null;
  return eligible[Math.floor(Math.random() * eligible.length)];
};

// Bump a counter on char.daily AND char.weekly — used as a setChar updater
// fragment. Same counter feeds both clocks; daily resets every morning,
// weekly resets every Monday morning.
const bumpDaily = (c, counter, by = 1) => ({
  ...c,
  daily:  { ...(c.daily  || {}), [counter]: (c.daily?.[counter]  || 0) + by },
  weekly: { ...(c.weekly || {}), [counter]: (c.weekly?.[counter] || 0) + by },
});

const dailyChallengeMet = (c) => {
  const dc = c?.dailyChallenge;
  if (!dc) return false;
  const ch = DAILY_CHALLENGES.find(x => x.id === dc.id);
  if (!ch) return false;
  return (c.daily?.[ch.counter] || 0) >= ch.target;
};

// ============ WEEKLY CHALLENGES ============
// One per in-game week (resets every Monday-morning sleep). Counters live
// in char.weekly (auto-incremented by bumpDaily so any daily-tracked action
// also counts toward the weekly).
const WEEKLY_CHALLENGES = [
  { id: 'wk_battles_3',  label: 'Win 3 battles this week',     target: 3,  counter: 'battleWins', reward: { cash: 100, followers: 20 } },
  { id: 'wk_openmic_5',  label: 'Play 5 open mics this week',  target: 5,  counter: 'openMics',   reward: { cash: 80,  followers: 15 } },
  { id: 'wk_jams_15',    label: 'Do 15 cypher jams this week', target: 15, counter: 'jams',       reward: { cash: 60,  followers: 10 } },
  { id: 'wk_busks_10',   label: 'Busk 10 times this week',     target: 10, counter: 'busks',      reward: { cash: 70,  followers: 8 } },
  { id: 'wk_mingles_8',  label: 'Mingle 8 nights this week',   target: 8,  counter: 'mingles',    reward: { cash: 50,  mood: 10 } },
  { id: 'wk_runs_4',     label: 'Run 4 sessions this week',    target: 4,  counter: 'runs',       reward: { cash: 40,  mood: 15 } },
];

const pickWeeklyChallenge = () =>
  WEEKLY_CHALLENGES[Math.floor(Math.random() * WEEKLY_CHALLENGES.length)];

// ============ CREW ============
// Recruitable beatboxers. Each crew member adds a small daily passive cash +
// fan trickle that gets paid out on the morning sleep transition. They unlock
// progressively as the player's followers grow (the scene "comes to you").
// One-time recruitCost in cash. No upkeep — once you own them they're yours.
const CREW_NPCS = [
  {
    id: 'jaxx',  name: 'JAXX',   blurb: 'Local cypher regular · loves a 4-on-floor',
    look: { skin: '#d4a87a', hair: '#3a2410', shirt: '#a04040' },
    recruitCost: 80,   recruitMinFans: 25,   dailyCash: 6,  dailyFans: 1,
  },
  {
    id: 'noor',  name: 'NOOR',   blurb: 'YouTube tutorial nerd · sharp ear',
    look: { skin: '#c08070', hair: '#5a2010', shirt: '#5a7050' },
    recruitCost: 200,  recruitMinFans: 75,   dailyCash: 12, dailyFans: 2,
  },
  {
    id: 'duo_t', name: 'DUO-T',  blurb: 'Twin brothers — one mic, two voices',
    look: { skin: '#a87844', hair: '#1a1a2e', shirt: '#7a5a30' },
    recruitCost: 400,  recruitMinFans: 200,  dailyCash: 22, dailyFans: 4,
  },
  {
    id: 'glaze', name: 'GLAZE',  blurb: 'Producer / hat specialist · ex-radio host',
    look: { skin: '#e0b890', hair: '#dadada', shirt: '#3a5a6a' },
    recruitCost: 800,  recruitMinFans: 500,  dailyCash: 38, dailyFans: 7,
  },
  {
    id: 'mira',  name: 'MIRA',   blurb: 'Choir-trained ringer · perfect pitch',
    look: { skin: '#d4a87a', hair: '#7a3a20', shirt: '#a06090' },
    recruitCost: 1500, recruitMinFans: 1200, dailyCash: 60, dailyFans: 12,
  },
];

const crewIsRecruited = (c, id) => Array.isArray(c.crew) && c.crew.some(m => m.id === id);
const crewIsAvailable = (c, npc) => (c.followers || 0) >= (npc.recruitMinFans || 0);

// ============ ACHIEVEMENTS ============
// Auto-checked from checkLevelUp (same checkpoint as sound unlocks). Each
// has a tier (bronze/silver/gold) for visual flair.
const ACHIEVEMENTS = [
  { id: 'first_steps',     label: 'First Steps',         desc: 'Stand in the cypher for the first time', tier: 'b', cond: (c) => !!c.storyFlags?.firstJam },
  { id: 'cypher_regular',  label: 'Cypher Regular',      desc: 'Do 10 jams',                              tier: 'b', cond: (c) => (c.storyFlags?.jamCount || 0) >= 10 },
  { id: 'open_mic_newcomer', label: 'Open Mic Newcomer', desc: 'Play your first open mic',                tier: 'b', cond: (c) => (c.openMicCount || 0) >= 1 },
  { id: 'mic_veteran',     label: 'Mic Veteran',         desc: 'Play 10 open mics',                       tier: 's', cond: (c) => (c.openMicCount || 0) >= 10 },
  { id: 'first_saturday',  label: 'First Saturday',      desc: 'Show up to your first battle',            tier: 'b', cond: (c) => !!c.storyFlags?.pigPenBattled },
  { id: 'first_blood',     label: 'First Blood',         desc: 'Win your first battle',                   tier: 's', cond: (c) => (c.defeated || []).length >= 1 },
  { id: 'pen_to_penny',    label: 'Pen to Penny',        desc: 'Beat Pig Pen twice',                      tier: 's', cond: (c) => (c.storyFlags?.pigPenWins || 0) >= 2 },
  { id: 'the_crew',        label: 'The Crew',            desc: 'Defeat all 7 opponents',                  tier: 'g', cond: (c) => (c.defeated || []).length >= 7 },
  { id: 'one_hundred',     label: 'One Hundred',         desc: 'Reach 100 followers',                     tier: 'b', cond: (c) => (c.followers || 0) >= 100 },
  { id: 'thousand_strong', label: 'Thousand Strong',     desc: 'Reach 1,000 followers',                   tier: 's', cond: (c) => (c.followers || 0) >= 1000 },
  { id: 'ten_k',           label: 'Ten Thousand',        desc: 'Reach 10,000 followers',                  tier: 'g', cond: (c) => (c.followers || 0) >= 10000 },
  { id: 'gear_hoarder',    label: 'Gear Hoarder',        desc: 'Own 5 pieces of gear',                    tier: 'b', cond: (c) => Object.keys(c.gear || {}).length >= 5 },
  { id: 'completist_gear', label: 'Completist (Gear)',   desc: 'Own every shop item',                     tier: 'g', cond: (c) => Object.keys(c.gear || {}).length >= 14 },
  { id: 'sound_master',    label: 'Sound Master',        desc: 'Unlock every sound',                      tier: 'g', cond: (c) => (c.sounds || []).length >= 12 },
  { id: 'in_love',         label: 'In Love',             desc: 'Become a couple with someone',            tier: 's', cond: (c) => Object.values(c.romanceState || {}).includes('couple') },
  { id: 'penny_revealed',  label: 'Real Name Penny',     desc: 'Earn the Penny reveal',                   tier: 's', cond: (c) => !!c.storyFlags?.pennyReveal },
  { id: 'crystix',         label: 'Bro from the Forum',  desc: 'Meet Crystix in person',                  tier: 's', cond: (c) => !!c.storyFlags?.crystixMet },
  { id: 'sponsored',       label: 'Sponsored',           desc: 'Sign your first sponsorship',             tier: 'b', cond: (c) => Object.keys(c.storyFlags || {}).some(k => k.startsWith('sponsor_') && k.endsWith('_signed')) },
  { id: 'all_sponsors',    label: 'Five-Brand Athlete',  desc: 'Sign all 5 sponsorships',                 tier: 'g', cond: (c) => ['snortvpn','redfull','sure','adipas','samsong'].every(s => c.storyFlags?.[`sponsor_${s}_signed`]) },
  { id: 'level_10',        label: 'Level Ten',           desc: 'Reach level 10',                          tier: 'b', cond: (c) => (c.level || 1) >= 10 },
];
const TIER_COLOR = { b: '#a8a29e', s: '#dadada', g: '#fbbf24' };

const newlyEarnedAchievements = (c) => {
  return ACHIEVEMENTS.filter(a => !c.achievements?.[a.id] && a.cond(c));
};
const applyAchievements = (c) => {
  const newly = newlyEarnedAchievements(c);
  if (!newly.length) return { char: c, earned: [] };
  const day = c.day || 0;
  const ach = { ...(c.achievements || {}) };
  for (const a of newly) ach[a.id] = day;
  return { char: { ...c, achievements: ach }, earned: newly };
};

// ============ STAGE OUTFITS ============
// Cosmetic shirt-color overrides used for performances + the home screen
// avatar. Each outfit has a milestone gate (auto-unlocked) and applies
// only when the player picks it as their active outfit.
const OUTFITS = {
  default:        { name: 'Default', desc: 'Your everyday color', shirt: null,         cond: () => true },
  tracksuit:      { name: 'Track Suit',      desc: 'After signing Adipas',         shirt: '#1a1a1a',  cond: (c) => !!c.storyFlags?.sponsor_adipas_signed },
  stage_gold:     { name: 'Stage Gold',      desc: '100 followers',                shirt: '#fbbf24',  cond: (c) => (c.followers || 0) >= 100 },
  red_devil:      { name: 'Red Devil',       desc: 'Beat Pig Pen twice',           shirt: '#dc2626',  cond: (c) => (c.storyFlags?.pigPenWins || 0) >= 2 },
  champion_white: { name: 'Champion White',  desc: 'Win BBBWC2027',                shirt: '#dadada',  cond: (c) => !!c.storyFlags?.festivalWon },
  romance_pink:   { name: 'Mira\'s Hand-Stitched', desc: 'Mira couple',            shirt: '#fb7185',  cond: (c) => c.romanceState?.mira === 'couple' },
  romance_lime:   { name: 'Sky\'s Joke Shirt',     desc: 'Sky couple',             shirt: '#84cc16',  cond: (c) => c.romanceState?.sky === 'couple' },
  romance_cyan:   { name: 'Luca\'s Studio Tee',    desc: 'Luca couple',            shirt: '#22d3ee',  cond: (c) => c.romanceState?.luca === 'couple' },
  romance_amber:  { name: 'Pascal\'s Press Tee',   desc: 'Pascal couple',          shirt: '#fbbf24',  cond: (c) => c.romanceState?.pascal === 'couple' },
  romance_violet: { name: 'Jin\'s Studio Wrap',    desc: 'Jin couple',             shirt: '#a78bfa',  cond: (c) => c.romanceState?.jin === 'couple' },
  romance_rose:   { name: 'Roo\'s Festival Pass',  desc: 'Roo couple',             shirt: '#fb7185',  cond: (c) => c.romanceState?.roo === 'couple' },
};
const outfitUnlocked = (c, id) => {
  const o = OUTFITS[id];
  if (!o) return false;
  try { return o.cond(c); } catch { return false; }
};

// Stage accessories (hats, glasses) — separate slot from outfits, applied on
// top of the chosen outfit. Each has its own milestone gate.
const ACCESSORIES = {
  none:       { name: 'None',         desc: '',                          id: null,         cond: () => true },
  cap:        { name: 'Snapback',     desc: '5 open mics done',          id: 'cap',        cond: (c) => (c.openMicCount || 0) >= 5 },
  beanie:     { name: 'Studio Beanie', desc: 'Train with BeeAmGee 3x',    id: 'beanie',     cond: (c) => (c.bjarneSessions || 0) >= 3 },
  shades:     { name: 'Shades',       desc: '50 followers',              id: 'shades',     cond: (c) => (c.followers || 0) >= 50 },
  glasses:    { name: 'Round Glasses', desc: 'Pascal couple',            id: 'glasses',    cond: (c) => c.romanceState?.pascal === 'couple' },
  fedora:     { name: 'Fedora',       desc: '10 jams done',              id: 'fedora',     cond: (c) => (c.storyFlags?.jamCount || 0) >= 10 },
  headphones: { name: 'Headphones',   desc: 'Buy premium headphones',    id: 'headphones', cond: (c) => !!c.gear?.premium_headphones },
};
const accessoryUnlocked = (c, id) => {
  const a = ACCESSORIES[id];
  if (!a) return false;
  try { return a.cond(c); } catch { return false; }
};
// Returns the shirt color in effect for performances (active outfit if
// unlocked + selected, else char.color).
const activeOutfitShirt = (c) => {
  const id = c?.outfit || 'default';
  if (id !== 'default' && outfitUnlocked(c, id) && OUTFITS[id]?.shirt) return OUTFITS[id].shirt;
  return c?.color || '#D4A017';
};

// ============ FESTIVAL ARC (BBBWC2027) ============
// Trigger conditions intentionally loose for now (testable from a fresh
// save in a reasonable amount of play). Ratchet up after balancing.
const festivalEligible = (c) =>
  !c?.festivalState
  && (c?.defeated?.length || 0) >= 3
  && ((c?.openMicCount || 0) + Object.keys(c?.storyFlags || {}).filter(k => k === 'firstShowcase').length) >= 5
  && (c?.stats?.mus || 0) >= 8 && (c?.stats?.tec || 0) >= 8 && (c?.stats?.ori || 0) >= 8 && (c?.stats?.sho || 0) >= 8
  && (c?.day || 0) >= 25;
const FESTIVAL_PREP_DAYS = 14;

// Foxy — your roommate. Soft-spoken, plant person, makes too much soup.
// Ambient quips used as a fallback (when nothing else is going on).
const FOXY_QUIPS = [
  "the plant's still alive. barely.",
  "i made too much soup again.",
  "the kettle's still warm if you want tea.",
  "i'm at work till seven. don't burn anything.",
  "the heating's making that noise again.",
  "matcha?",
  "you've been weird this week. you good?",
  "post comes around four. i'll grab yours.",
];
const _pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---- Passive mood decay ----
// Mood doesn't just go up. Per game hour you lose ~1 mood passively
// (loneliness/boredom). Hunger or energy under 30 doubles the drain;
// hitting 0 makes it ~3x. Used at every meaningful time-passing event.
const _moodDrainFor = (c, minutes) => {
  let perHour = 0.3;
  if ((c.hunger || 0) < 30)  perHour += 0.5;
  if ((c.energy || 0) < 30)  perHour += 0.5;
  if ((c.hunger || 0) === 0) perHour += 1.0;
  if ((c.energy || 0) === 0) perHour += 1.0;
  return (minutes / 60) * perHour;
};
// Returns the new mood value after `minutes` of decay.
const decayMood = (c, minutes) => {
  return Math.max(0, (c.mood || 0) - _moodDrainFor(c, minutes));
};
// Convenience: returns a `{ minutes, mood }` partial that bumps minutes by
// `n` and applies passive mood decay. The activity's positive bumps (food,
// performance highs) are added on top by the caller.
const passMinutes = (c, n) => ({
  minutes: (c.minutes || 0) + n,
  mood: decayMood(c, n),
});

// Foxy's context-aware tip system. Returns a single tip string based on
// the player's current state. Priority order (high → low): survival
// (energy/hunger/mood) → rent/money → narrative arc (jam → pig pen) →
// showcase / open-mic gates → day-of-week awareness → fallback ambient.
//
// Each rule's `when(c)` is checked in order; the first match's `lines`
// pool is sampled. This makes Foxy feel like she's reading the room
// instead of cycling random one-liners.
const FOXY_TIPS = [
  // ---- Survival: critical ----
  { when: (c) => (c.energy || 0) <= 5, lines: [
    "stop. sleep. you can't beatbox like this.",
    "go to bed. seriously.",
    "you're zombie-walking. couch. now.",
  ]},
  { when: (c) => (c.hunger || 0) <= 5, lines: [
    "eat. now.",
    "i made too much soup. it's in the fridge. eat it.",
    "the fridge is right there. you are not running on vibes.",
  ]},
  { when: (c) => (c.mood || 0) <= 10, lines: [
    "you've been quiet for two days. talk to me.",
    "go for a run. i'm not joking.",
    "we don't have to talk. just don't sit there.",
  ]},
  // ---- Survival: low ----
  { when: (c) => (c.energy || 0) < 25, lines: [
    "you should take a nap. couch's right there.",
    "you look like shit. lie down.",
    "power nap. then we'll talk.",
  ]},
  { when: (c) => (c.hunger || 0) < 25, lines: [
    "you look hungry. there's leftovers in the fridge.",
    "the kitchen is fifteen feet from you. use it.",
    "soup's in the pot. don't wait for me.",
  ]},
  { when: (c) => (c.mood || 0) < 30, lines: [
    "go for a run or something. you've been weird all day.",
    "the park is free. fresh air, free.",
    "stream a movie. anything. unclench.",
  ]},
  // ---- Rent / money pressure ----
  { when: (c) => (c.rentLate || 0) >= 2, lines: [
    "look. i don't know your business. but pay the rent.",
    "the landlord came by. twice.",
    "if you get evicted i'm not telling your mum.",
  ]},
  { when: (c) => (c.rentLate || 0) === 1, lines: [
    "did you pay rent? i swear i heard them knock.",
    "the rent thing. you're handling it, right?",
    "i'm not bringing it up. i'm just saying.",
  ]},
  // Saturday before rent: "tomorrow's sunday"
  { when: (c) => ((c.day || 1) % 7) === 5 && (c.cash || 0) < 60 && (c.apartmentTier || 1) === 1, lines: [
    "tomorrow's sunday. just saying.",
    "rent's $50 every sunday. you got that?",
    "you're cutting it close again.",
  ]},
  { when: (c) => (c.cash || 0) < 5 && !c.foxyLoanTaken, lines: [
    "you're broke huh. tap me. i'll lend you something. once.",
    "i can spot you fifteen bucks. tap. just this once.",
    "you got cash for groceries? tap me. i'll figure it out.",
  ]},
  { when: (c) => (c.cash || 0) < 5 && c.foxyLoanTaken, lines: [
    "i already lent you fifteen. busk. the park.",
    "no more loans. busk. you're good at it.",
    "you're broke again. that's fine. eat the soup.",
  ]},
  // ---- Narrative: jam arc ----
  { when: (c) => !c.storyFlags?.firstJam, lines: [
    "i heard there's jams in the park. that's where the beatboxers go right?",
    "if you're going to do this beatbox thing, go where they are. park has a cypher.",
    "you're not gonna make it sitting in the apartment. there's people in the park.",
  ]},
  { when: (c) => c.storyFlags?.firstJam && !c.storyFlags?.pigPenChallenged
                 && (c.storyFlags?.jamCount || 0) < 3, lines: [
    "still going to the jams? keep at it.",
    "the cypher again? good. go.",
    "more practice in the circle. less in the bedroom.",
    "the park people are your people now i guess.",
  ]},
  { when: (c) => c.storyFlags?.pigPenChallenged && !c.storyFlags?.pigPenBattled, lines: [
    "some loud guy was asking about you. saturday at the bar?",
    "i don't know who 'pig pen' is. doesn't sound like a friend.",
    "battle night is saturday at the bar. that's all i know.",
  ]},
  { when: (c) => c.storyFlags?.pigPenBattled && (c.storyFlags?.pigPenWins || 0) === 0, lines: [
    "the loud guy still talks shit. ignore him. or beat him. either way.",
    "battles once a week. train, go again.",
    "you'll get him next time. i don't know what that even means but yeah.",
  ]},
  { when: (c) => (c.storyFlags?.pigPenWins || 0) === 1 && !c.storyFlags?.pennyReveal, lines: [
    "you've been smiling more this week.",
    "whatever you're doing on saturdays. keep doing it.",
    "the loud guy hasn't come around as much.",
  ]},
  // ---- Showcase / Rohzel ----
  { when: (c) => c.showcaseBooking?.day, lines: [
    "you got a show friday? i'll come. probably.",
    "friday show. don't bomb. eat first.",
    "i'll be in the back. don't look for me.",
  ]},
  { when: (c) => (c.followers || 0) >= 30 && !c.showcaseBooking?.day
                 && (c.openMicCount || 0) >= 5 && !c.storyFlags?.rohzelFridayOffer, lines: [
    "the bartender's been asking about you. go see him.",
    "you should talk to rohzel. friday slots are a thing.",
    "the bar guy. he doesn't say much. say less back.",
  ]},
  { when: (c) => (c.openMicCount || 0) === 0 && c.storyFlags?.firstJam, lines: [
    "the bar has open mics tue/wed/thu. small crowd, free slot.",
    "open mic at the bar. easy way to get reps.",
    "if the cypher's the gym, the open mic's the test.",
  ]},
  { when: (c) => (c.openMicCount || 0) >= 1 && (c.openMicCount || 0) < 3, lines: [
    "more open mics this week. it adds up.",
    "the bar still doing open mic? go.",
  ]},
  // ---- Followers / fans ----
  { when: (c) => (c.followers || 0) < 5 && c.storyFlags?.firstJam, lines: [
    "you've got like four followers. busk. people will see you.",
    "no one knows you exist yet. park, jar on the ground, go.",
    "the algorithm doesn't care if you're shy.",
  ]},
  // ---- Day-of-week awareness (fires when nothing more urgent) ----
  // dow 0 = MON (bar closed), 1 = TUE, 2 = WED, 3 = THU, 4 = FRI, 5 = SAT, 6 = SUN
  { when: (c) => ((c.day || 1) % 7) === 0, lines: [
    "the bar's closed mondays. don't bother.",
    "monday. quiet. go train. go run.",
    "mondays are for laundry. fyi.",
  ]},
  { when: (c) => {
    const dow = (c.day || 1) % 7;
    return dow >= 1 && dow <= 3;
  }, lines: [
    "open mic tonight if you've got the energy.",
    "the bar's open. open mic night.",
    "small crowd at the bar tonight. less to bomb in front of.",
  ]},
  { when: (c) => ((c.day || 1) % 7) === 4, lines: [
    "friday. weekend's basically here.",
    "friday's a show night if you've got the slot.",
    "people get loose on fridays. go play.",
  ]},
  { when: (c) => ((c.day || 1) % 7) === 5, lines: [
    "battle night. you ready?",
    "saturday. the bar gets loud tonight.",
    "saturdays are for war. so they tell me.",
  ]},
  { when: (c) => ((c.day || 1) % 7) === 6, lines: [
    "sunday. rent day. the long day.",
    "i'm doing groceries. need anything?",
    "sundays are slow. take the slow.",
  ]},
];

// Pick the highest-priority tip that applies, given the current char.
// Falls back to a random ambient quip if nothing matches.
const pickFoxyTip = (char) => {
  if (!char) return _pick(FOXY_QUIPS);
  for (const rule of FOXY_TIPS) {
    try { if (rule.when(char)) return _pick(rule.lines); } catch { /* skip */ }
  }
  return _pick(FOXY_QUIPS);
};

// Pick up to N tips for the modal — the top-priority match plus a couple
// of ambient quips for flavor.
const pickFoxyTipsForModal = (char, n = 3) => {
  const tips = [pickFoxyTip(char)];
  const pool = [...FOXY_QUIPS].sort(() => Math.random() - 0.5);
  for (const q of pool) {
    if (tips.length >= n) break;
    if (!tips.includes(q)) tips.push(q);
  }
  return tips;
};

// Push a new message onto a char's messages array (returns a new char).
const addMessage = (c, sender, text) => {
  const msg = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    sender,
    text,
    day: c.day,
    minute: c.minutes ?? 0,
    read: false,
  };
  return { ...c, messages: [...(c.messages || []), msg] };
};

// Count unread messages on a char (cheap; for the header badge).
const unreadMessageCount = (c) => (c.messages || []).filter(m => !m.read).length;

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

// ============ USER SETTINGS ============
// Player-level prefs (NOT per-save). Persisted in localStorage so they
// survive slot switches and reloads. Module-level cache + subscriber set
// so the audio + animation code can read the latest values synchronously
// without prop drilling, while React components can useSettings() to
// re-render on change.
const SETTINGS_KEY = 'beatbox_settings';
const DEFAULT_SETTINGS = {
  muted: false,         // kill all WebAudio output
  reducedMotion: false, // skip the cutscene fade + achievement modal pop
  fastDialogue: false,  // auto-advance cutscene lines after ~2s
};
let _settingsCache = (() => {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS };
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch { return { ...DEFAULT_SETTINGS }; }
})();
const _settingsListeners = new Set();
const getSettings = () => _settingsCache;
const updateSettings = (patch) => {
  _settingsCache = { ..._settingsCache, ...patch };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(_settingsCache)); } catch {}
  _settingsListeners.forEach(fn => fn(_settingsCache));
};
const useSettings = () => {
  const [s, setS] = useState(_settingsCache);
  useEffect(() => {
    const fn = (next) => setS(next);
    _settingsListeners.add(fn);
    return () => _settingsListeners.delete(fn);
  }, []);
  return [s, updateSettings];
};

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

// Convert minutes-since-6am to a 24-hour clock string ("HH:MM").
function clockString(mins) {
  const total = (mins + 360) % 1440; // 6am offset
  const h = Math.floor(total / 60);
  const m = Math.floor(total % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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

// Days from `fromDay` to the NEXT Tuesday (strictly after; if fromDay IS
// Tuesday, returns 7). Tuesday = idx 1 in DAY_NAMES.
const daysToNextTuesday = (fromDay) => {
  const dow = dayOfWeek(fromDay);
  if (dow === 1) return 7;
  return ((1 - dow) + 7) % 7;
};
// Earliest day a drowned plant can be replaced: the first Tuesday strictly
// after the death day. Returns 0 when the plant isn't dead.
const replantAvailableDay = (c) => {
  if (!c?.plantDead) return 0;
  const deathDay = c?.plantDeathDay || c?.day || 0;
  return deathDay + daysToNextTuesday(deathDay);
};

// Rent (auto-deducted on Sunday morning sleep transition; apartment tier sets the amount).
const RENT_BY_TIER = [50, 100, 200];   // tier 1 / 2 / 3 weekly rent
const COUCHSURF_DAYS = 3;              // days at Foxy's friend after eviction

// Apartment upgrades. tier 2 = nicer flat ($1500 to move in), tier 3 = loft ($5000).
// Each tier passively buffs the morning sleep transition, and tier 3 also boosts
// any home recording (+25% to studio coaching mus reward & sequencer ori).
const APT_UPGRADES = {
  2: {
    cost: 1500, dayReq: 14, fansReq: 30,
    name: 'Real apartment',
    desc: 'A bedroom. A kitchen. A door that locks. +5 mood every morning. Bad-sleep events less common.',
  },
  3: {
    cost: 5000, dayReq: 30, fansReq: 200,
    name: 'Loft with home studio',
    desc: 'Skyline view. Mixing desk. +10 mood every morning. +1 mus every full sleep. +25% home recording reward.',
  },
};

// ============ FLASHBACKS + DREAMS ============
// One-time narrative beats fired at the morning sleep transition. Each fires
// once when its `when` condition first matches; the id is stored under
// char.flashbacksSeen[id] = day so it never re-fires.
const FLASHBACKS = [
  { id: 'childhood',
    when: (c) => !!c.storyFlags?.firstJam && (c.day || 0) >= 5,
    speaker: null,
    drawFn: 'drawFlashbackChildhoodScene',
    lines: [
      "Before bed, a memory you hadn't pulled up in years.",
      "Twelve years old. Your bedroom mirror. A little phone propped on a stack of books.",
      "Three minutes of beats nobody would ever see. You said the bass kicks were 'sick'.",
      "It's still the same circuit. Just with better gear.",
    ],
  },
  { id: 'parent_voice',
    when: (c) => (c.rentLate || 0) >= 1 || (c.day || 0) >= 12,
    speaker: null,
    drawFn: 'drawFlashbackParentScene',
    lines: [
      "1 AM in the kitchen. The phone glows on the counter.",
      "An old voicemail you saved and kept saving.",
      "\"call when you get this. don't worry about waking us. we love you.\"",
      "You haven't called this week.",
    ],
  },
  { id: 'yt_comment',
    when: (c) => (c.followers || 0) >= 100,
    speaker: null,
    drawFn: 'drawFlashbackCommentScene',
    lines: [
      "Down a YouTube rabbit hole. Your old channel.",
      "A comment from 2017 you forgot you wrote.",
      "\"one day i'll do this on a real stage. saving this for when i'm 30.\"",
      "Not 30 yet. But not nothing, either.",
    ],
  },
  { id: 'the_song',
    when: (c) => !!c.storyFlags?.firstShowcase || (c.day || 0) >= 20,
    speaker: null,
    drawFn: 'drawFlashbackSongScene',
    lines: [
      "Last bus home. Window cold against your forehead.",
      "Earbuds in. The track that started everything plays again.",
      "Bus driver glances back. You realize you've been beatboxing under your breath.",
      "You're not the same person who first heard this.",
    ],
  },
];

// Resolve a 3-round crew battle. Returns { rounds: [...], won: bool, ourScore, theirScore }
// rounds[i] = { our: number, their: number, win: bool, ourMember, theirMember }
const resolveCrewBattle = (c, crew) => {
  const stats = c.stats || {};
  const ourTotal = (stats.mus || 0) + (stats.tec || 0) + (stats.ori || 0) + (stats.sho || 0);
  const moodMod = ((c.mood || 50) - 50) / 4; // -12.5 .. +12.5
  // Two allies — split a chunk of the player total. Ally strength scales with
  // the player's relationships (Foxy = always there, +5; defeated NPCs = +3 each).
  const allyBoost = 5 + Math.min(2, (c.defeated || []).length) * 3;
  const ourPerRound = Math.floor(ourTotal * 0.6) + allyBoost;
  const rounds = [];
  let ourScore = 0, theirScore = 0;
  for (let i = 0; i < 3; i++) {
    const them = crew.members[i];
    const theirTotal = (them.stats.mus || 0) + (them.stats.tec || 0) + (them.stats.ori || 0) + (them.stats.sho || 0);
    const ourRoll = ourPerRound + moodMod + (Math.random() * 20 - 10);
    const theirRoll = Math.floor(theirTotal * 0.7) + (Math.random() * 20 - 10);
    const win = ourRoll >= theirRoll;
    if (win) ourScore++; else theirScore++;
    rounds.push({ our: Math.round(ourRoll), their: Math.round(theirRoll), win, theirMember: them });
  }
  return { rounds, won: ourScore > theirScore, ourScore, theirScore };
};

// Mapping from id-string to actual function — the FLASHBACKS table can't
// reference these directly (defined later) without hoist friction.
const _flashbackDrawFn = (name) => {
  if (name === 'drawFlashbackChildhoodScene') return drawFlashbackChildhoodScene;
  if (name === 'drawFlashbackParentScene') return drawFlashbackParentScene;
  if (name === 'drawFlashbackCommentScene') return drawFlashbackCommentScene;
  if (name === 'drawFlashbackSongScene') return drawFlashbackSongScene;
  if (name === 'drawDreamScene') return drawDreamScene;
  return null;
};

// Pick the next flashback eligible for the given char. Returns null when none
// match or all already seen.
const pickFlashback = (c) => {
  const seen = c.flashbacksSeen || {};
  for (const f of FLASHBACKS) {
    if (seen[f.id]) continue;
    try { if (f.when(c)) return f; } catch { /* skip */ }
  }
  return null;
};

// ============ CONTENT GATING ============
// Locations and shop sub-stores unlock day-by-day so the early game has a
// natural ramp instead of dumping everything on the player at once.
const CONTENT_UNLOCKS = {
  bar:        { day: 3, label: "You're not ready for the cypher yet. Take a few days." },
  shop:       { day: 4, label: 'Shops open day 4. Save your cash.' },
  mingle:     { day: 5, label: 'You barely know the regulars yet. Day 5.' },
  // Shop sub-store unlocks
  store_music:     { day: 4, label: 'Day 4' },
  store_furniture: { day: 5, label: 'Day 5' },
  store_clothing:  { day: 7, label: 'Day 7' },
  store_pet:       { day: 10, label: 'Day 10' },
};
const isUnlocked = (c, key) => (c?.day || 0) >= (CONTENT_UNLOCKS[key]?.day || 0);


// Compute the rent event for a given char + new day. Returns null when
// rent isn't due (not Sunday or already paid this week). When due, returns
// { type: 'paid' | 'missed' | 'warning' | 'evicted', amount, ... }.
// Used by both finishSleep (full sleep transition) and the App's 2 AM
// collapse watcher.
const computeRentEvent = (c, newDay) => {
  if (newDay % 7 !== 6) return null;                       // not Sunday
  if (c.lastRentPaidDay === newDay) return null;           // already handled
  const tier = c.apartmentTier || 1;
  const amount = RENT_BY_TIER[tier - 1] || RENT_BY_TIER[0];
  if ((c.cash || 0) >= amount) {
    const firstTime = !c.storyFlags?.firstRentPaid;
    return { type: 'paid', amount, firstTime };
  }
  const next = (c.rentLate || 0) + 1;
  if (next >= 3)  return { type: 'evicted', amount, weeks: next };
  if (next === 2) return { type: 'warning', amount };
  return                  { type: 'missed', amount };
};

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

// ============ MINGLE — bar conversations ============
// One conversation = 30 game minutes + ~6 energy. Each `encounter` defines
// who you bump into, when they're available (gating), how often (weight),
// and a single-beat dialogue: opener line + 2-3 reply choices, each with
// a response line and small effects (mood/cash/followers/flags/affinity).
//
// Encounters share a registry so adding new ones (sponsors, romances,
// recurring NPCs) is a single config push.

const _enc = (id, cfg) => ({ id, weight: 1, when: () => true, ...cfg });

// Generic strangers — the fallback pool. All have weight ≥ 3 so they
// dominate the random roll until rare/triggered encounters fire.
const MINGLE_GENERIC = [
  _enc('barfly_old', { weight: 4, beats: [{
    speaker: { name: 'old timer', color: '#a8a29e' },
    line: "you new here? haven't seen your face.",
    options: [
      { text: "yeah. just moved this way.", outcome: { line: "well. don't make a fool of yourself.", effects: { mood: +2 } } },
      { text: "i've been around. you just don't notice.", outcome: { line: "ha. fair.", effects: { mood: +3 } } },
      { text: "(nod. say nothing.)",         outcome: { line: "...alright then.", effects: { mood: +0 } } },
    ],
  }]}),
  _enc('hipster_dj', { weight: 3, beats: [{
    speaker: { name: 'someone in a thrifted shirt', color: '#a78bfa' },
    line: "you look like you'd know a good record store.",
    options: [
      { text: "i don't really do vinyl.",         outcome: { line: "yeah, no, that's a thing.", effects: { mood: +1 } } },
      { text: "depends what you're looking for.", outcome: { line: "ok, ok. i see you.",         effects: { mood: +3, followers: +1 } } },
      { text: "is this a pickup line?",           outcome: { line: "haha. unfortunately yes.",   effects: { mood: +5 } } },
    ],
  }]}),
  _enc('shy_fan', { weight: 3, when: (c) => (c.followers || 0) >= 5, beats: [{
    speaker: { name: 'a quiet kid', color: '#22d3ee' },
    line: "i, um. i think i've seen your clips? sorry. that's weird.",
    options: [
      { text: "no, that's nice. thank you.",  outcome: { line: "ok cool ok cool ok bye.",   effects: { mood: +6, followers: +2 } } },
      { text: "oh — what'd you think?",       outcome: { line: "i liked the rolls. you're good.", effects: { mood: +5, followers: +3 } } },
      { text: "yeah that's me.",              outcome: { line: "...yeah. ok. cool.",         effects: { mood: +2, followers: +1 } } },
    ],
  }]}),
  _enc('know_it_all', { weight: 3, beats: [{
    speaker: { name: 'guy with strong opinions', color: '#fb7185' },
    line: "real beatbox died in 2009. fact.",
    options: [
      { text: "you might be right actually.",  outcome: { line: "thank you. THANK you.",     effects: { mood: -1 } } },
      { text: "that's a lot to put on 2009.",  outcome: { line: "no, see, you don't get it.", effects: { mood: -2 } } },
      { text: "(walk away)",                   outcome: { line: null,                         effects: { mood: +1 } } },
    ],
  }]}),
  _enc('regular_drunk', { weight: 3, beats: [{
    speaker: { name: 'a guy four beers in', color: '#f97316' },
    line: "i used to play guitar. did i tell you that?",
    options: [
      { text: "what'd you play?",          outcome: { line: "...i forget. but it was good.", effects: { mood: +2 } } },
      { text: "you should pick it up again.", outcome: { line: "yeah. yeah maybe i will.",     effects: { mood: +3 } } },
      { text: "(let him keep talking)",       outcome: { line: "you're a good listener.",      effects: { mood: +1 } } },
    ],
  }]}),
  _enc('travel_writer', { weight: 2, beats: [{
    speaker: { name: 'someone with a notebook', color: '#84cc16' },
    line: "you live here? i'm trying to find the real stuff.",
    options: [
      { text: "the real stuff is in your room. trust.", outcome: { line: "ok wow philosophical.", effects: { mood: +2 } } },
      { text: "go to the park on a thursday afternoon.",  outcome: { line: "park, thursday. got it.", effects: { mood: +3, followers: +1 } } },
      { text: "tourists ruin places. sorry.",            outcome: { line: "...damn. ok.",              effects: { mood: -1 } } },
    ],
  }]}),
  _enc('open_mic_friend', { weight: 3, when: (c) => (c.openMicCount || 0) >= 1, beats: [{
    speaker: { name: 'someone who saw you tuesday', color: '#fbbf24' },
    line: "tuesday. you. that thing you did at the end.",
    options: [
      { text: "good or bad?",                  outcome: { line: "good. i'm telling you good.", effects: { mood: +6, followers: +2 } } },
      { text: "thanks. it's been work.",      outcome: { line: "yeah it shows. keep going.",   effects: { mood: +5 } } },
      { text: "what thing.",                   outcome: { line: "the rolls. obviously.",        effects: { mood: +3 } } },
    ],
  }]}),
  _enc('overheard', { weight: 3, beats: [{
    speaker: { name: 'two friends talking', color: '#dadada' },
    line: "(you overhear: 'the thing about beatboxing is anyone can do it now, that's the problem.')",
    options: [
      { text: "actually... no it isn't.",                 outcome: { line: "oh — sorry, didn't see you there.", effects: { mood: +1 } } },
      { text: "(let it go and order a water)",            outcome: { line: null,                                effects: { mood: +0 } } },
      { text: "anyone CAN do it. that's the point.",      outcome: { line: "huh. yeah, i guess.",               effects: { mood: +2 } } },
    ],
  }]}),
  _enc('lost_phone', { weight: 2, beats: [{
    speaker: { name: 'someone panicking', color: '#fb7185' },
    line: "have you seen a phone? black case. screen cracked.",
    options: [
      { text: "i'll help you look.",     outcome: { line: "thank you thank you. you're a saint.", effects: { mood: +5 } } },
      { text: "you check the bathroom?", outcome: { line: "...not yet. okay.",                     effects: { mood: +2 } } },
      { text: "no, sorry.",              outcome: { line: "right. ok.",                            effects: {} } },
    ],
  }]}),
  _enc('quiet_one', { weight: 3, beats: [{
    speaker: { name: 'someone alone at the bar', color: '#a8a29e' },
    line: "...",
    options: [
      { text: "rough day?",                outcome: { line: "...yeah. yeah a bit.",              effects: { mood: +3 } } },
      { text: "(sit one stool over)",      outcome: { line: "(they nod, slightly.)",             effects: { mood: +2 } } },
      { text: "(walk past)",               outcome: { line: null,                                 effects: {} } },
    ],
  }]}),
];

// ---- Recurring named NPCs at the bar ----
// PIG PEN — only present once he's challenged you. Lines depend on whether
// you've battled, lost, won, or already had the Penny reveal beat.
const MINGLE_PIGPEN = [
  _enc('pigpen_pre', { weight: 4,
    look: { shirt: '#1a1a1a', skin: '#d4a87a', hair: '#dc2626' },
    when: (c) => c.storyFlags?.pigPenChallenged && !c.storyFlags?.pigPenBattled,
    beats: [{
      speaker: { name: 'PIG PEN', color: '#fb7185' },
      line: "saturday's getting close. you bringing your A or what.",
      options: [
        { text: "i'll be there.",                outcome: { line: "we'll see.",                effects: { mood: +1 } } },
        { text: "you sound nervous.",            outcome: { line: "ha. nervous. that's cute.",  effects: { mood: +2 } } },
        { text: "(stay quiet)",                  outcome: { line: "...whatever. saturday.",    effects: { mood: -1 } } },
      ],
    }],
  }),
  _enc('pigpen_after_loss', { weight: 4,
    look: { shirt: '#1a1a1a', skin: '#d4a87a', hair: '#dc2626' },
    when: (c) => c.storyFlags?.pigPenBattled && (c.storyFlags?.pigPenWins || 0) === 0,
    beats: [{
      speaker: { name: 'PIG PEN', color: '#fb7185' },
      line: "i told you. you're not ready.",
      options: [
        { text: "i'll be ready next time.",  outcome: { line: "yeah, alright. show me.",         effects: { mood: +2 } } },
        { text: "i was off my A.",           outcome: { line: "everyone's off their A. excuses.", effects: { mood: -2 } } },
        { text: "(walk past)",               outcome: { line: null,                              effects: {} } },
      ],
    }],
  }),
  _enc('pigpen_after_win', { weight: 4,
    look: { shirt: '#1a1a1a', skin: '#d4a87a', hair: '#dc2626' },
    when: (c) => (c.storyFlags?.pigPenWins || 0) >= 1 && !c.storyFlags?.pennyReveal,
    beats: [{
      speaker: { name: 'PIG PEN', color: '#fb7185' },
      line: "rematch. this saturday. i'm not letting that one stand.",
      options: [
        { text: "anytime.",                  outcome: { line: "good.",                          effects: { mood: +3 } } },
        { text: "you sure?",                 outcome: { line: "i said anytime.",                effects: { mood: +2 } } },
        { text: "you talk a lot.",           outcome: { line: "that's the GAME, brother.",      effects: { mood: +1 } } },
      ],
    }],
  }),
  _enc('pigpen_post_penny', { weight: 3,
    look: { shirt: '#1a1a1a', skin: '#d4a87a', hair: '#dc2626' },
    when: (c) => c.storyFlags?.pennyReveal,
    beats: [{
      speaker: { name: 'PIG PEN', color: '#fb7185' },
      line: "you eat dinner?",
      options: [
        { text: "not yet.",                  outcome: { line: "kitchen's closed. but the wings here are not bad.", effects: { mood: +5 } } },
        { text: "yeah. you?",                outcome: { line: "yeah. i'm good.",                                    effects: { mood: +4 } } },
        { text: "what'd you call me?",       outcome: { line: "...nothing. forget it.",                             effects: { mood: +2 } } },
      ],
    }],
  }),
];

// CRYSTIX — online friend, very rare in-person. Gated by 2+ battle wins
// total. No romance, just a warm meeting.
const MINGLE_CRYSTIX = [
  _enc('crystix_first_meet', { weight: 1,
    look: { shirt: '#22d3ee', skin: '#e0b890', hair: '#3a2410' },
    when: (c) => (c.defeated?.length || 0) >= 2 && !c.storyFlags?.crystixMet,
    beats: [{
      speaker: { name: 'CRYSTIX', color: '#22d3ee' },
      line: "yo. yo wait. you're— you're the kid. from the discord. the one that posts the rolls.",
      options: [
        { text: "crystix?? in the flesh??",       outcome: { line: "BRO. yes. i'm passing through. clip we doing — your tunes are nuts.",
                                                              effects: { mood: +12, followers: +3, flags: { crystixMet: true } } } },
        { text: "you're a real person.",          outcome: { line: "haha — i've been told. yeah. yeah it's me.",
                                                              effects: { mood: +10, followers: +2, flags: { crystixMet: true } } } },
        { text: "do i know you?",                 outcome: { line: "...crystix? from the forum? bro it's been YEARS.",
                                                              effects: { mood: +6, flags: { crystixMet: true } } } },
      ],
    }],
  }),
  // Re-meet — happens occasionally after the first time, low weight
  _enc('crystix_remeet', { weight: 1,
    look: { shirt: '#22d3ee', skin: '#e0b890', hair: '#3a2410' },
    when: (c) => c.storyFlags?.crystixMet,
    beats: [{
      speaker: { name: 'CRYSTIX', color: '#22d3ee' },
      line: "you again! i'm in town for like another week. wild we keep crossing.",
      options: [
        { text: "we should do something.",        outcome: { line: "for real. text me.",     effects: { mood: +6 } } },
        { text: "good to see you.",               outcome: { line: "you too man.",           effects: { mood: +5 } } },
        { text: "still here? thought you'd left.", outcome: { line: "ha — soon. soon.",       effects: { mood: +3 } } },
      ],
    }],
  }),
];

// SPONSORS — five brands, each with two stages. Pre-stage = casual stranger
// (low weight, before threshold). Post-stage = pitch (medium weight, once
// threshold hit). After accept/decline, the brand's flag locks them out.
const _sponsorEncounter = (id, brand, color, threshold, intro, pitchLine, accept, decline) => ([
  _enc(`sponsor_${id}_pre`, { weight: 2,
    look: { shirt: color, skin: '#d4a87a', hair: '#3a2410' },
    when: (c) => (c.followers || 0) < threshold && !c.storyFlags?.[`sponsor_${id}_done`],
    beats: [{
      speaker: { name: 'a guy in a logo polo', color },
      line: intro,
      options: [
        { text: "yeah, i do music.",     outcome: { line: "interesting. interesting.",  effects: { mood: +2 } } },
        { text: "what do you do?",       outcome: { line: "i'm in marketing. boring.",   effects: { mood: +1 } } },
        { text: "(nod)",                 outcome: { line: "...alright then.",            effects: {} } },
      ],
    }],
  }),
  _enc(`sponsor_${id}_pitch`, { weight: 4,
    look: { shirt: color, skin: '#d4a87a', hair: '#3a2410' },
    when: (c) => (c.followers || 0) >= threshold && !c.storyFlags?.[`sponsor_${id}_done`],
    beats: [{
      speaker: { name: `${brand.toUpperCase()} REP`, color },
      line: pitchLine,
      options: [
        { text: `accept the ${brand} deal`,
          outcome: { line: accept,
            effects: { cash: +50, followers: +10, mood: +8,
              flags: { [`sponsor_${id}_done`]: true, [`sponsor_${id}_signed`]: true } } } },
        { text: "i'll think about it.",
          outcome: { line: "no rush. we'll be around.",
            effects: { mood: +1 } } },
        { text: "not interested.",
          outcome: { line: decline,
            effects: { flags: { [`sponsor_${id}_done`]: true } } } },
      ],
    }],
  }),
]);

// Thresholds escalate so each sponsor unlocks at a different growth tier:
// 50 (Snort), 100 (Redfull), 200 (Sure), 500 (Adipas), 1000 (Samsong).
const MINGLE_SPONSORS = [
  ..._sponsorEncounter('snortvpn', 'Snort-VPN', '#a78bfa', 50,
    "*sniff* — yeah. *sniff* — i'm in cybersecurity. *sniff* — privacy stuff.",
    "*sniff sniff* — SNORT-VPN — best on the *sniff* market. $50 to mention us once a show. *sniff* deal?",
    "yeah! *sniff* — yeah! you won't regret this *sniff*.",
    "your call. *sniff* — your CALL."),
  ..._sponsorEncounter('redfull', 'Redfull', '#dc2626', 100,
    "those wings are NUTS huh. anyway — what do you do, you a musician?",
    "we love your energy. we'd love to put REDFULL on your stage. $50 sign-on, our cans at every show. you in?",
    "energy drink companies — sign every kid with a follower count. let's go.",
    "your loss. literally."),
  ..._sponsorEncounter('sure', 'Sure', '#fbbf24', 200,
    "the bar mics here are SO bad. you ever record clean?",
    "SURE microphones. we want one of our SM-class on every show you play. fifty bucks up front, the gear's yours to keep.",
    "the rolls deserve better than a bar mic. signed.",
    "fair. when you change your mind we're here."),
  ..._sponsorEncounter('adipas', 'Adipas', '#a8a29e', 500,
    "love your fit. did you get those at the thrift on søndergade?",
    "ADIPAS culture. we want to drop some kit on you. you wear the stripes, we wire $50 + a fresh tracksuit every quarter.",
    "stripes. shoes. tracksuit. you'll look the part for the festival.",
    "you sure? thought you'd love the kit."),
  ..._sponsorEncounter('samsong', 'Samsong', '#22d3ee', 1000,
    "i'm in tech. boring conference here this week. you're way more interesting.",
    "SAMSONG ELECTRONICS. our new headphones, your sets. fifty up front, swag for life. tasteful integration. you in?",
    "welcome to the family. tasteful. understated. samsong.",
    "alright. small loss for us, big loss for you. kidding."),
];

// ---- Romance candidates ----
// Three to start (one masc, one fem, one nb). Each conversation beat has
// three replies: a "right" answer that matches their vibe (+1 affinity, mood
// up), a neutral one (0 affinity, mood up a bit), and a "wrong" one that
// reads as rude or off-base (-1 affinity, slight mood penalty).
//
// Affinity thresholds drive state:
//   < 5  : building     (regular convos)
//   >= 5 : romancing    ("ask out" option appears, can schedule a date)
//   >= 10: couple       (locked in; date scenes unlock partner perks)
//
// applyMingleEffects auto-promotes state when affinity crosses thresholds.

// LUCA — he/him, sound engineer, music tech nerd. Right answers: curious
// about gear, engaged with the craft. Wrong: dismissive or rude.
const _LUCA_LOOK = { shirt: '#3a5060', skin: '#d4a87a', hair: '#1a1a2e' };
const ROMANCE_LUCA = _enc('romance_luca', { weight: 2,
  look: _LUCA_LOOK,
  when: () => true,
  beats: [
    { speaker: { name: 'LUCA', color: '#22d3ee' },
      line: "you're the beatboxer right? what mic you using on stage?",
      options: [
        { text: "honestly? whatever rohzel hands me. is that bad?",
          outcome: { line: "haha — yeah, kinda. dynamic mics eat your highs. i'll dm you a list.",
            effects: { mood: +6, affinity: { luca: +1 } } } },
        { text: "i don't really think about it.",
          outcome: { line: "you should. it's half the sound.",
            effects: { mood: +2 } } },
        { text: "is this a sales pitch?",
          outcome: { line: "...no. forget i asked.",
            effects: { mood: -3, affinity: { luca: -1 } } } },
      ]},
    { speaker: { name: 'LUCA', color: '#22d3ee' },
      line: "the room here is so dead. the bass just vanishes.",
      options: [
        { text: "yeah, the back wall eats it. the curtains don't help.",
          outcome: { line: "EXACTLY. someone said it. someone finally said it.",
            effects: { mood: +6, affinity: { luca: +1 } } } },
        { text: "i hadn't noticed.",
          outcome: { line: "now you'll never un-hear it. sorry.",
            effects: { mood: +2 } } },
        { text: "it's fine.",
          outcome: { line: "...sure.",
            effects: { mood: -2, affinity: { luca: -1 } } } },
      ]},
    { speaker: { name: 'LUCA', color: '#22d3ee' },
      line: "i'm engineering a session sunday. wanna come watch?",
      options: [
        { text: "i'd actually love that.",
          outcome: { line: "ok. cool. i'll text you the address.",
            effects: { mood: +8, affinity: { luca: +1 } } } },
        { text: "depends. who's it for?",
          outcome: { line: "a band. local. they're alright.",
            effects: { mood: +3 } } },
        { text: "i don't really do studios.",
          outcome: { line: "huh. ok.",
            effects: { mood: -2, affinity: { luca: -1 } } } },
      ]},
    { speaker: { name: 'LUCA', color: '#22d3ee' },
      line: "what do you listen to when you're not beatboxing?",
      options: [
        { text: "honestly a lot of weird minimal stuff. you?",
          outcome: { line: "minimal heads UNITE. i'll send you a playlist.",
            effects: { mood: +6, affinity: { luca: +1 } } } },
        { text: "depends on the day.",
          outcome: { line: "yeah, fair, fair.",
            effects: { mood: +2 } } },
        { text: "i don't really listen to music.",
          outcome: { line: "...wait what.",
            effects: { mood: -3, affinity: { luca: -1 } } } },
      ]},
  ],
});

// MIRA — she/her, visual artist, comes to the bar to sketch. Right answers:
// thoughtful, curious, low-key. Wrong: too cocky, dismissive of art.
const _MIRA_LOOK = { shirt: '#a06090', skin: '#e0b890', hair: '#5a2010' };
const ROMANCE_MIRA = _enc('romance_mira', { weight: 2,
  look: _MIRA_LOOK,
  when: () => true,
  beats: [
    { speaker: { name: 'MIRA', color: '#fb7185' },
      line: "i'm trying to draw the bar but i can't get the lights right.",
      options: [
        { text: "can i see? — without judgement.",
          outcome: { line: "...yeah. ok. just for a sec.",
            effects: { mood: +6, affinity: { mira: +1 } } } },
        { text: "you should add more red.",
          outcome: { line: "thanks. helpful.",
            effects: { mood: +1 } } },
        { text: "drawing in a bar is a bit much.",
          outcome: { line: "...alright.",
            effects: { mood: -3, affinity: { mira: -1 } } } },
      ]},
    { speaker: { name: 'MIRA', color: '#fb7185' },
      line: "i feel like everyone here is performing. you too. but it's nice.",
      options: [
        { text: "you noticed. i think about that all the time.",
          outcome: { line: "yeah. yeah you would.",
            effects: { mood: +6, affinity: { mira: +1 } } } },
        { text: "i'm not performing. this is just me.",
          outcome: { line: "okay. sure.",
            effects: { mood: +1 } } },
        { text: "everyone's performing all the time. it's not deep.",
          outcome: { line: "right. ok.",
            effects: { mood: -3, affinity: { mira: -1 } } } },
      ]},
    { speaker: { name: 'MIRA', color: '#fb7185' },
      line: "i saw a video of you. you really focus when you're in it.",
      options: [
        { text: "thank you. that's the only place i'm not in my head.",
          outcome: { line: "i could tell. that's why i kept watching.",
            effects: { mood: +8, affinity: { mira: +1 } } } },
        { text: "haha thanks.",
          outcome: { line: "(soft smile.)",
            effects: { mood: +3 } } },
        { text: "you watched me a lot then?",
          outcome: { line: "...not — not like that.",
            effects: { mood: -2, affinity: { mira: -1 } } } },
      ]},
    { speaker: { name: 'MIRA', color: '#fb7185' },
      line: "when did you know you wanted to do this?",
      options: [
        { text: "fourteen. i watched a video nine times in a row.",
          outcome: { line: "that's a real answer. most people give a fake one.",
            effects: { mood: +8, affinity: { mira: +1 } } } },
        { text: "i don't know. it just kept being there.",
          outcome: { line: "yeah. yeah it goes like that.",
            effects: { mood: +4 } } },
        { text: "it's just for cash, honestly.",
          outcome: { line: "oh. okay.",
            effects: { mood: -3, affinity: { mira: -1 } } } },
      ]},
  ],
});

// SKY — they/them, dancer, friend of Rohzel's, playful. Right answers:
// playful, honest, can take a joke. Wrong: too earnest or too try-hard.
const _SKY_LOOK = { shirt: '#fbbf24', skin: '#a87844', hair: '#dadada' };
const ROMANCE_SKY = _enc('romance_sky', { weight: 2,
  look: _SKY_LOOK,
  when: () => true,
  beats: [
    { speaker: { name: 'SKY', color: '#84cc16' },
      line: "ok don't beatbox at me. everyone does. it's exhausting.",
      options: [
        { text: "i wasn't going to. i'm trying to drink in peace.",
          outcome: { line: "OKAY thank you. that's the energy.",
            effects: { mood: +6, affinity: { sky: +1 } } } },
        { text: "deal.",
          outcome: { line: "deal.",
            effects: { mood: +3 } } },
        { text: "*does a small beat anyway*",
          outcome: { line: "...you couldn't help yourself.",
            effects: { mood: -2, affinity: { sky: -1 } } } },
      ]},
    { speaker: { name: 'SKY', color: '#84cc16' },
      line: "i dance. badly. on purpose. it's a whole thing.",
      options: [
        { text: "show me sometime?",
          outcome: { line: "absolutely not. you have to earn it.",
            effects: { mood: +6, affinity: { sky: +1 } } } },
        { text: "what does that mean.",
          outcome: { line: "you'll see one day. or you won't.",
            effects: { mood: +3 } } },
        { text: "you should take it more seriously.",
          outcome: { line: "ok dad.",
            effects: { mood: -3, affinity: { sky: -1 } } } },
      ]},
    { speaker: { name: 'SKY', color: '#84cc16' },
      line: "rohzel said you're new-ish. how's the city treating you?",
      options: [
        { text: "broke. tired. weirdly happy.",
          outcome: { line: "iconic. that's literally the trifecta.",
            effects: { mood: +8, affinity: { sky: +1 } } } },
        { text: "it's fine. it's a city.",
          outcome: { line: "ok mr. relatable.",
            effects: { mood: +3 } } },
        { text: "not how i pictured it.",
          outcome: { line: "yeah well, nothing is.",
            effects: { mood: +1 } } },
      ]},
    { speaker: { name: 'SKY', color: '#84cc16' },
      line: "if you HAD to dance to one song forever — what's it.",
      options: [
        { text: "something stupid. i'd want it to be stupid.",
          outcome: { line: "STOP. i love this answer. i love this person.",
            effects: { mood: +8, affinity: { sky: +1 } } } },
        { text: "i don't really dance.",
          outcome: { line: "everyone dances. some of us just lie about it.",
            effects: { mood: +3 } } },
        { text: "something profound. classical maybe.",
          outcome: { line: "...sure, mozart. mozart for life.",
            effects: { mood: -1, affinity: { sky: -1 } } } },
      ]},
  ],
});

// Ask-out variants — appear when affinity >= 5 and no current dateBooking.
// Schedule a park date 2 days from now at 16:00.
const _askOutEnc = (id, name, color, look) => _enc(`romance_${id}_askout`, { weight: 3,
  look,
  when: (c) => (c.romanceAffinity?.[id] || 0) >= 5
              && (c.romanceState?.[id] || 'building') !== 'couple'
              && !c.dateBooking,
  beats: [{
    speaker: { name, color },
    line: id === 'sky'
      ? "ok. listen. i'm gonna do something weird. you free saturday?"
      : id === 'mira'
        ? "i was thinking — would you wanna meet at the park sometime? not weird."
        : "i'm at the park sunday afternoon. you should come. we can just talk.",
    options: [
      { text: "yes. let's do it.",
        outcome: {
          line: id === 'sky' ? "OK ok ok ok. saturday. park. you better show.": id === 'mira' ? "ok. let's say sunday at four." : "i'll be at the park bench by the trees. you'll find me.",
          effects: { mood: +12, affinity: { [id]: +2 },
            flags: { [`${id}_dateScheduled`]: true } },
          // The encounter handler reads bookDate to schedule it.
          bookDate: { partner: id, partnerName: name, partnerColor: color, daysAhead: 2, minute: 600 },
        } },
      { text: "let me think about it.",
        outcome: { line: "...yeah. ok. sure.",
          effects: { mood: -1, affinity: { [id]: -1 } } } },
    ],
  }],
});

// PASCAL — he/him, music critic. Right answers: confident but humble, real.
// Wrong: defensive, name-dropping.
const _PASCAL_LOOK = { shirt: '#fbbf24', skin: '#c89878', hair: '#3a2010' };
const ROMANCE_PASCAL = _enc('romance_pascal', { weight: 2,
  look: _PASCAL_LOOK,
  when: (c) => (c.followers || 0) >= 30, // shows up once you're on the radar
  beats: [
    { speaker: { name: 'PASCAL', color: '#fbbf24' },
      line: "i write about music. i was at your last open mic. i had thoughts.",
      options: [
        { text: "go on. i can take it.",
          outcome: { line: "the third pattern needed more space. the second was perfect. you knew it was perfect.",
            effects: { mood: +6, affinity: { pascal: +1 } } } },
        { text: "good ones?",
          outcome: { line: "some good. some honest. you want both?",
            effects: { mood: +3 } } },
        { text: "everyone has thoughts.",
          outcome: { line: "...yeah. ok.",
            effects: { mood: -3, affinity: { pascal: -1 } } } },
      ]},
    { speaker: { name: 'PASCAL', color: '#fbbf24' },
      line: "i used to play. trumpet. i was never very good. that's why i write.",
      options: [
        { text: "i bet you were better than you remember.",
          outcome: { line: "...maybe. nobody's said that to me.",
            effects: { mood: +6, affinity: { pascal: +1 } } } },
        { text: "writing's its own thing. it counts.",
          outcome: { line: "thanks. i needed that.",
            effects: { mood: +5, affinity: { pascal: +1 } } } },
        { text: "trumpet's hard.",
          outcome: { line: "yeah. it is.",
            effects: { mood: +1 } } },
      ]},
    { speaker: { name: 'PASCAL', color: '#fbbf24' },
      line: "what's the worst review you've ever gotten?",
      options: [
        { text: "honestly? something my dad said in 2018. still in my head.",
          outcome: { line: "those are the only ones that count, aren't they.",
            effects: { mood: +8, affinity: { pascal: +1 } } } },
        { text: "i don't read reviews.",
          outcome: { line: "everyone reads them. don't lie.",
            effects: { mood: -2 } } },
        { text: "i don't get bad ones.",
          outcome: { line: "...alright, mozart.",
            effects: { mood: -4, affinity: { pascal: -1 } } } },
      ]},
    { speaker: { name: 'PASCAL', color: '#fbbf24' },
      line: "i'm trying to write a long-form piece about why this scene matters. why does it matter to you?",
      options: [
        { text: "it's the only place i'm in my body and not my head.",
          outcome: { line: "i'm putting that in. with your name. is that ok?",
            effects: { mood: +10, affinity: { pascal: +2 } } } },
        { text: "it's just fun.",
          outcome: { line: "fun's an underrated reason.",
            effects: { mood: +3 } } },
        { text: "i don't really think about it.",
          outcome: { line: "you should. now you'll have to.",
            effects: { mood: +2 } } },
      ]},
  ],
});

// JIN — they/them, dancer/choreographer. Right answers: respectful of the
// craft, willing to be wrong, curious.
const _JIN_LOOK = { shirt: '#a78bfa', skin: '#e4b890', hair: '#1a1a1a' };
const ROMANCE_JIN = _enc('romance_jin', { weight: 2,
  look: _JIN_LOOK,
  when: (c) => (c.openMicCount || 0) >= 3,
  beats: [
    { speaker: { name: 'JIN', color: '#a78bfa' },
      line: "i choreograph for the underground. i've been watching you. you have rhythm but no body.",
      options: [
        { text: "i'd love to learn what you mean by that.",
          outcome: { line: "...yeah. ok. that's the right answer.",
            effects: { mood: +6, affinity: { jin: +1 } } } },
        { text: "people pay to hear me. body's optional.",
          outcome: { line: "they'll pay more if you give them both.",
            effects: { mood: +1 } } },
        { text: "what's that even supposed to mean.",
          outcome: { line: "if you have to ask. yeah.",
            effects: { mood: -3, affinity: { jin: -1 } } } },
      ]},
    { speaker: { name: 'JIN', color: '#a78bfa' },
      line: "every great performer i've worked with stops thinking eventually. how close are you?",
      options: [
        { text: "honestly? not close. i'm in my head a lot.",
          outcome: { line: "good. that's the first step. admitting it.",
            effects: { mood: +6, affinity: { jin: +1 } } } },
        { text: "i'm there sometimes. depends on the night.",
          outcome: { line: "yeah. depends. always depends.",
            effects: { mood: +3 } } },
        { text: "i don't think while i perform.",
          outcome: { line: "everyone thinks. you just notice or you don't.",
            effects: { mood: +1 } } },
      ]},
    { speaker: { name: 'JIN', color: '#a78bfa' },
      line: "i work with my body for a living. mine hates me by 30. yours will too.",
      options: [
        { text: "what helps?",
          outcome: { line: "stretching every morning. your jaw, your neck. listen to your throat.",
            effects: { mood: +6, affinity: { jin: +1 } } } },
        { text: "i'm careful.",
          outcome: { line: "everyone says that until they aren't.",
            effects: { mood: +2 } } },
        { text: "i'll worry about that later.",
          outcome: { line: "famous last words.",
            effects: { mood: -3, affinity: { jin: -1 } } } },
      ]},
    { speaker: { name: 'JIN', color: '#a78bfa' },
      line: "i'm putting together a piece. dance + beatbox. live. would you ever do that?",
      options: [
        { text: "yes. immediately. tell me when.",
          outcome: { line: "ok. friday. i'll send you the studio address.",
            effects: { mood: +10, affinity: { jin: +2 }, flags: { jinCollab: true } } } },
        { text: "tell me more first.",
          outcome: { line: "fair. i'll write up the brief.",
            effects: { mood: +3 } } },
        { text: "not really my thing.",
          outcome: { line: "ok. fine. won't ask twice.",
            effects: { mood: -3, affinity: { jin: -1 } } } },
      ]},
  ],
});

// ROO — she/her, festival promoter. Right answers: ambitious without being
// transactional, says no when it's no.
const _ROO_LOOK = { shirt: '#fb7185', skin: '#d4a87a', hair: '#fbbf24' };
const ROMANCE_ROO = _enc('romance_roo', { weight: 2,
  look: _ROO_LOOK,
  when: (c) => (c.followers || 0) >= 80,
  beats: [
    { speaker: { name: 'ROO', color: '#fb7185' },
      line: "i book stages. nothing big yet. i'm watching everybody right now. don't be normal.",
      options: [
        { text: "no promises. but i'll try not to be boring.",
          outcome: { line: "good answer. that's the only one i'll remember tomorrow.",
            effects: { mood: +6, affinity: { roo: +1 } } } },
        { text: "i'm normal. that's why i beatbox.",
          outcome: { line: "haha. ok. you have a sense of humor at least.",
            effects: { mood: +3 } } },
        { text: "what kind of stages?",
          outcome: { line: "the kind you'd want to be on.",
            effects: { mood: +2 } } },
      ]},
    { speaker: { name: 'ROO', color: '#fb7185' },
      line: "everyone wants to be on a festival stage. nobody wants to do the work to deserve one.",
      options: [
        { text: "i'm doing the work. you'll see.",
          outcome: { line: "i hope so. i'm rooting for somebody this year.",
            effects: { mood: +6, affinity: { roo: +1 } } } },
        { text: "what's the work look like to you?",
          outcome: { line: "twenty minutes you'd watch sober. that's it.",
            effects: { mood: +5, affinity: { roo: +1 } } } },
        { text: "i deserve one.",
          outcome: { line: "...do you? we'll see.",
            effects: { mood: -3, affinity: { roo: -1 } } } },
      ]},
    { speaker: { name: 'ROO', color: '#fb7185' },
      line: "what would you do if i offered you a slot, no questions, just yes or no?",
      options: [
        { text: "i'd ask what slot. i'd want to know what i'm walking into.",
          outcome: { line: "good. people who say yes too fast disappoint me.",
            effects: { mood: +8, affinity: { roo: +1 } } } },
        { text: "yes. obviously.",
          outcome: { line: "...obviously.",
            effects: { mood: +1 } } },
        { text: "depends on the bag.",
          outcome: { line: "ok. i hear you. i don't love it. but i hear you.",
            effects: { mood: -2 } } },
      ]},
    { speaker: { name: 'ROO', color: '#fb7185' },
      line: "people in this scene get burned out fast. how do you keep showing up?",
      options: [
        { text: "i don't always. some weeks are bad. i just don't quit.",
          outcome: { line: "that's the answer. that's the only answer.",
            effects: { mood: +10, affinity: { roo: +2 } } } },
        { text: "i love it.",
          outcome: { line: "everyone says that. then they leave.",
            effects: { mood: +2 } } },
        { text: "i'm not burned out.",
          outcome: { line: "give it a year.",
            effects: { mood: -2 } } },
      ]},
  ],
});

const MINGLE_ROMANCE = [
  ROMANCE_LUCA,
  ROMANCE_MIRA,
  ROMANCE_SKY,
  ROMANCE_PASCAL,
  ROMANCE_JIN,
  ROMANCE_ROO,
  _askOutEnc('luca', 'LUCA', '#22d3ee', _LUCA_LOOK),
  _askOutEnc('mira', 'MIRA', '#fb7185', _MIRA_LOOK),
  _askOutEnc('sky',  'SKY',  '#84cc16', _SKY_LOOK),
  _askOutEnc('pascal', 'PASCAL', '#fbbf24', _PASCAL_LOOK),
  _askOutEnc('jin',    'JIN',    '#a78bfa', _JIN_LOOK),
  _askOutEnc('roo',    'ROO',    '#fb7185', _ROO_LOOK),
];

// Bad encounter — drunk in your face. No good options. Mood penalty.
const MINGLE_BAD = [
  _enc('drunk_aggressive', { weight: 2,
    look: { shirt: '#7a3a40', skin: '#a87844', hair: '#1a1a1a' },
    beats: [{
      speaker: { name: '???', color: '#dc2626' },
      line: "what're you LOOKIN at???",
      options: [
        { text: "nothing man, sorry.",       outcome: { line: "yeah, you better be sorry. PUNK.", effects: { mood: -8 } } },
        { text: "you alright?",              outcome: { line: "i'm GREAT. fuck off.",              effects: { mood: -10 } } },
        { text: "(walk away fast)",          outcome: { line: null,                                 effects: { mood: -3 } } },
      ],
    }],
  }),
];

// Combined mingle pool — used by the bar's MINGLE button.
const MINGLE_POOL = [
  ...MINGLE_GENERIC,
  ...MINGLE_PIGPEN,
  ...MINGLE_CRYSTIX,
  ...MINGLE_SPONSORS,
  ...MINGLE_ROMANCE,
  ...MINGLE_BAD,
];

// Filter encounters by their `when(c)` predicate, then weighted-pick one.
const pickMingleEncounter = (char, pool) => {
  const eligible = pool.filter(e => {
    try { return e.when(char); } catch { return false; }
  });
  if (eligible.length === 0) return null;
  const total = eligible.reduce((s, e) => s + (e.weight || 1), 0);
  let r = Math.random() * total;
  for (const e of eligible) {
    r -= (e.weight || 1);
    if (r <= 0) return e;
  }
  return eligible[eligible.length - 1];
};

// Apply the effects from a chosen reply to the char. Auto-promotes romance
// state based on resulting affinity (>=10 = couple, >=5 = romancing), and
// schedules a date booking if the option carried a `bookDate` directive.
const applyMingleEffects = (c, effects, outcome) => {
  const e = effects || {};
  const max = c.maxEnergy ?? 100;
  let next = { ...c };
  if (typeof e.mood === 'number')      next.mood = _clampPct((c.mood || 0) + e.mood);
  if (typeof e.energy === 'number')    next.energy = Math.max(0, Math.min(max, (c.energy || 0) + e.energy));
  if (typeof e.hunger === 'number')    next.hunger = _clampPct((c.hunger || 0) + e.hunger);
  if (typeof e.cash === 'number')      next.cash = Math.max(0, (c.cash || 0) + e.cash);
  if (typeof e.followers === 'number') next.followers = Math.max(0, (c.followers || 0) + e.followers);
  if (e.flags) next.storyFlags = { ...(c.storyFlags || {}), ...e.flags };
  if (e.affinity) {
    const aff = { ...(c.romanceAffinity || {}) };
    for (const [k, v] of Object.entries(e.affinity)) aff[k] = Math.max(0, (aff[k] || 0) + v);
    next.romanceAffinity = aff;
    // Auto-track romance state per candidate
    const state = { ...(c.romanceState || {}) };
    for (const id of Object.keys(aff)) {
      if (aff[id] >= 10)      state[id] = 'couple';
      else if (aff[id] >= 5)  state[id] = 'romancing';
      else                    state[id] = 'building';
    }
    next.romanceState = state;
  }
  // Date booking — set on the option that asks the partner out
  if (outcome?.bookDate) {
    const bd = outcome.bookDate;
    next.dateBooking = {
      partner: bd.partner,
      partnerName: bd.partnerName,
      partnerColor: bd.partnerColor,
      day: (c.day || 1) + (bd.daysAhead || 2),
      minute: bd.minute || 600,
    };
  }
  return next;
};

// ============ GEAR (the upgraded shop) ============
// One-time purchases. Each item lives in char.gear[id] = true once bought.
// Effects are applied at the relevant code paths (training, sleep, runs,
// performances, etc.). Items belong to one of four sub-stores.
//
// Stores: 'music' | 'furniture' | 'clothing' | 'pet'

const GEAR_CATALOG = {
  // ---- 🎵 Music store ----
  pc: {
    name: 'Studio PC', store: 'music', cost: 800,
    desc: '+25% to Tec & Ori training stat gains',
  },
  mpc: {
    name: 'Pro MPC (BBX-32)', store: 'music', cost: 600,
    desc: 'Doubles your sequencer slots (4 → 8)',
  },
  mic: {
    name: 'Studio Condenser Mic', store: 'music', cost: 500,
    desc: '+25% to all mic-mode + Mus reward; better PitchTuner accuracy',
  },
  premium_headphones: {
    name: 'Premium Headphones', store: 'music', cost: 250,
    desc: '+25% accuracy in BeatboxHero mic-mode',
  },
  studio_monitors: {
    name: 'Studio Monitors', store: 'music', cost: 300,
    desc: '+25% to ori sequencer creativity score',
  },
  camera_tripod: {
    name: 'Camera + Tripod', store: 'music', cost: 200,
    desc: 'Auto-posts your clips · +1 follower/day passively',
  },
  // ---- 🛋️ Furniture store ----
  new_bed: {
    name: 'Memory-Foam Bed', store: 'furniture', cost: 600,
    desc: '+20 max-energy boost the morning after a full sleep',
  },
  houseplant: {
    name: 'Houseplant', store: 'furniture', cost: 50,
    desc: '+1 mood every morning if it stays alive (water = $5/3 days)',
  },
  coffee_machine: {
    name: 'Coffee Machine', store: 'furniture', cost: 120,
    desc: 'One free home espresso per day (+25⚡, -15🍴, +2♥)',
  },
  yoga_mat: {
    name: 'Yoga Mat', store: 'furniture', cost: 60,
    desc: 'Daily meditate action: +5 mood, 10 game min',
  },
  earplugs: {
    name: 'Earplugs', store: 'furniture', cost: 30,
    desc: 'Removes "noisy upstairs" + "heating stuck" bad-sleep reasons',
  },
  // ---- 👕 Clothing store ----
  wardrobe_refresh: {
    name: 'Wardrobe Refresh', store: 'clothing', cost: 200,
    desc: '+1 sho gain on every battle / open mic / showcase',
  },
  premium_shoes: {
    name: 'Premium Running Shoes', store: 'clothing', cost: 150,
    desc: '+1 extra sho per run reward block',
  },
  // ---- 🐾 Pet store ----
  cat: {
    name: 'Cat 🐈', store: 'pet', cost: 100,
    desc: '+2 mood every morning · costs $3/day in food',
  },
};

// Sub-store metadata (display name + tone color + icon)
const STORE_META = {
  music:     { display: 'Music Store',     color: '#22d3ee', icon: '🎵' },
  furniture: { display: 'Furniture Store', color: '#84cc16', icon: '🛋️' },
  clothing:  { display: 'Clothing Store',  color: '#fb7185', icon: '👕' },
  pet:       { display: 'Pet Store',       color: '#fbbf24', icon: '🐾' },
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

  // Force-stop the activity if char.day changes underneath us (i.e. a 2 AM
  // collapse rolled the day over). Without this, the global day-end watcher
  // resets minutes to 0 and the activity tick happily ticks on the new day,
  // draining energy across multiple sleeps until you exhaust.
  const startDayRef = useRef(null);
  useEffect(() => {
    if (!active) { startDayRef.current = null; return; }
    if (startDayRef.current == null) { startDayRef.current = char?.day; return; }
    if (char?.day !== startDayRef.current) {
      activeRef.current = false;
      setActive(false);
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      startDayRef.current = null;
    }
  }, [char?.day, active]);

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

    // Activities can override how many in-game minutes one tick advances. Used
    // to slow time progression while the player is in an interactive mini-game
    // (so they get to actually play it instead of running out of energy/day).
    const tickMins = cfg.tickMinutes ?? TICK_MINUTES;

    const newMins = c.minutes + tickMins;
    const newEnergy = Math.max(0, c.energy - cfg.tickEnergyCost);
    const newHunger = Math.max(0, c.hunger - cfg.tickHungerCost);
    // Activity's own per-tick mood delta + passive decay (hunger/energy taxed)
    const passiveDrain = _moodDrainFor(c, tickMins);
    const newMood = _clampPct(c.mood + (cfg.tickMoodDelta || 0) - passiveDrain);

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
    if ((charRef.current.sickDay || 0) === charRef.current.day) { showToast('Too sick to do anything today', 'bad'); return; }
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

// Pixel-art sky-gradient strip. Fills (0,0)→(W,h) row-by-row with an
// rgb(r,g,b) interpolated per scanline. Each component takes a base byte
// and an end-byte; intermediate values are linearly interpolated and
// clamped to 255. Reused by every scene that paints a sky band.
const _drawSky = (ctx, W, h, fromR, fromG, fromB, toR, toG, toB) => {
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const r = Math.min(255, Math.floor(fromR + t * (toR - fromR)));
    const g = Math.min(255, Math.floor(fromG + t * (toG - fromG)));
    const b = Math.min(255, Math.floor(fromB + t * (toB - fromB)));
    _px(ctx, 0, y, W, 1, `rgb(${r},${g},${b})`);
  }
};

// Common preset: sunny-day blue gradient (top → horizon).
const _drawDaytimeSky = (ctx, W, h = 50) =>
  _drawSky(ctx, W, h, 0x7a, 0xc0, 0xe8, 0x7a + 0x30, 0xc0 + 0x18, 0xe8 + 0x10);

// Pct clamp helper: 0..100. Half a dozen places used _clampPct(...).
const _clampPct = (v) => v < 0 ? 0 : v > 100 ? 100 : v;

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

      // ---- Daytime park sky ----
      _drawDaytimeSky(ctx, W);
      // Sun (top-right)
      px(118, 8, 10, 10, '#fef3c7');
      px(120, 6, 6, 14, '#fef3c7');
      px(116, 10, 14, 6, '#fef3c7');
      ctx.fillStyle = 'rgba(254, 243, 199, 0.30)';
      ctx.beginPath(); ctx.arc(123, 13, 12, 0, Math.PI * 2); ctx.fill();
      // Drifting clouds
      const cloud = (cx, cy) => {
        px(cx, cy, 12, 3, '#fff');
        px(cx + 2, cy - 2, 8, 5, '#fff');
        px(cx + 4, cy - 3, 4, 6, '#fff');
        px(cx + 1, cy + 3, 10, 1, '#dadada');
      };
      cloud(20 + ((frameCount * 0.05) % 160) - 20, 10);
      cloud(70 + ((frameCount * 0.03) % 160) - 30, 22);
      // Distant buildings (light daytime palette behind park)
      px(0, 36, 26, 24, '#a8a4b8');
      px(26, 30, 22, 30, '#bcb8c8');
      px(48, 40, 18, 20, '#9ea0b8');
      px(66, 32, 26, 28, '#bcb8c8');
      px(92, 38, 22, 22, '#a8a4b8');
      px(114, 34, 26, 26, '#bcb8c8');
      // Building window glints (bright, not lit-from-within)
      for (let i = 0; i < 5; i++) {
        const wx = 8 + i * 24;
        const wy = 42 + (i % 2) * 4;
        px(wx, wy, 3, 2, '#dadada');
      }
      // Park grass (mid)
      px(0, 56, W, 8, '#5a8a3a');
      px(0, 56, W, 1, '#7aaa4a');
      // Tree foliage clusters at the edges
      const tree = (tx, ty) => {
        px(tx - 6, ty - 12, 14, 10, '#2a6020');
        px(tx - 4, ty - 16, 10, 6, '#3a7028');
        px(tx - 2, ty - 18, 6, 4, '#4a8030');
        // trunk
        px(tx - 1, ty - 2, 2, 6, '#3a2410');
      };
      tree(8, 60);
      tree(132, 60);
      // Path / sidewalk (warm gray, not shadowy)
      px(0, 64, W, 26, '#b0a890');
      px(0, 64, W, 1, '#c8c0a0');
      // Path edge stones
      for (let i = 0; i < 7; i++) px(i * 22 + 4, 88, 6, 1, '#7a7058');
      // Speckles in pavement
      px(20, 72, 1, 1, '#7a7058');
      px(45, 78, 1, 1, '#7a7058');
      px(95, 70, 1, 1, '#7a7058');
      px(120, 80, 1, 1, '#7a7058');
      // Lamp post turned off (decorative)
      px(15, 14, 2, 50, '#3a3530');
      px(11, 14, 10, 2, '#3a3530');
      px(8, 16, 4, 5, '#3a3530');
      // No glow during day

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

  // Keyboard taps: A=BOOM, S=TSS, D=KSH. Use a ref so the listener sees fresh
  // closures (active/state) on every render.
  const tapRef = useRef(tap);
  tapRef.current = tap;
  useEffect(() => onGlobalKey((e) => {
    if (e.code === 'KeyA' || e.key === 'a' || e.key === 'A')      tapRef.current(0);
    else if (e.code === 'KeyS' || e.key === 's' || e.key === 'S') tapRef.current(1);
    else if (e.code === 'KeyD' || e.key === 'd' || e.key === 'D') tapRef.current(2);
  }), []);

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
            className="py-3 border-2 active:scale-95 transition-transform select-none touch-none relative"
            style={{
              borderColor: lane.color,
              background: `${lane.color}22`,
              color: lane.color,
              fontFamily: '"Bebas Neue", "Oswald", sans-serif',
              fontSize: 18,
              letterSpacing: '0.15em',
            }}>
            {lane.label}
            <span className="absolute top-0.5 right-1 text-[8px] tracking-widest opacity-60">{['A','S','D'][i]}</span>
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

  // Keyboard taps: A=left, D=right (also ArrowLeft/ArrowRight).
  const handleTapRef = useRef(handleTap);
  handleTapRef.current = handleTap;
  useEffect(() => onGlobalKey((e) => {
    if (e.code === 'KeyA' || e.code === 'ArrowLeft' || e.key === 'a' || e.key === 'A')       handleTapRef.current('L');
    else if (e.code === 'KeyD' || e.code === 'ArrowRight' || e.key === 'd' || e.key === 'D') handleTapRef.current('R');
  }), []);

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
          style={{ touchAction: 'manipulation', WebkitUserSelect: 'none', userSelect: 'none', position: 'relative' }}>
          <div className="text-3xl">👈</div>
          <div className="text-amber-500 text-base tracking-widest mt-1"
            style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>LEFT</div>
          <span className="absolute top-1 right-2 text-[9px] tracking-widest text-amber-500/60">A</span>
        </button>
        <button
          onPointerDown={(e) => { e.preventDefault(); handleTap('R'); }}
          className={`py-6 border-4 transition-all select-none ${
            flashSide?.side === 'R'
              ? (flashSide.ok ? 'border-amber-300 bg-amber-500/40 scale-95' : 'border-red-500 bg-red-900/40')
              : 'border-amber-600 bg-amber-900/20 active:scale-95'
          }`}
          style={{ touchAction: 'manipulation', WebkitUserSelect: 'none', userSelect: 'none', position: 'relative' }}>
          <div className="text-3xl">👉</div>
          <div className="text-amber-500 text-base tracking-widest mt-1"
            style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>RIGHT</div>
          <span className="absolute top-1 right-2 text-[9px] tracking-widest text-amber-500/60">D</span>
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

// Per-mode tuner config:
//   intervals: 'triad' (random major/minor [0,4,7]/[0,3,7]) or 'doremi' ([0,2,4])
//   flow:      'alternating'    — listen one note → sing it → next
//              'demo-then-sing' — listen all 3 in a row → sing all 3 in a row
//   durationMs is per single note (both during listen and during sing).
const TUNER_MODES = {
  beginner: {
    label: 'Beginner',
    tag: 'echo each note',
    durationMs: 2500,
    intervals: 'triad',
    flow: 'alternating',
  },
  advanced: {
    label: 'Advanced',
    tag: '3 in a row',
    durationMs: 1000,
    intervals: 'doremi',
    flow: 'demo-then-sing',
  },
  karaoke: {
    label: 'Karaoke',
    tag: '5-note melody',
    durationMs: 700,
    intervals: 'melody',
    flow: 'demo-then-sing',
  },
};

// Diatonic 5-note melody templates for karaoke mode.
const MELODY_TEMPLATES = [
  { name: 'DO-RE-MI-FA-SOL',  intervals: [0, 2, 4, 5, 7] },
  { name: 'SOL-FA-MI-RE-DO',  intervals: [7, 5, 4, 2, 0] },
  { name: 'DO-MI-SOL-MI-DO',  intervals: [0, 4, 7, 4, 0] },
  { name: 'DO-RE-MI-RE-DO',   intervals: [0, 2, 4, 2, 0] },
  { name: 'MI-RE-DO-RE-MI',   intervals: [4, 2, 0, 2, 4] },
  { name: 'DO-MI-DO-SOL-DO',  intervals: [0, 4, 0, 7, 0] },
  { name: 'TWINKLE INTRO',    intervals: [0, 0, 7, 7, 9] },
];

function generateChord(roots, mode = 'beginner') {
  const cfg = TUNER_MODES[mode] || TUNER_MODES.beginner;
  const pool = roots && roots.length ? roots : [55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72]; // default G3..C5
  const root = pool[Math.floor(Math.random() * pool.length)];
  if (cfg.intervals === 'melody') {
    // Karaoke melody — 5 diatonic notes from a curated template.
    const tpl = MELODY_TEMPLATES[Math.floor(Math.random() * MELODY_TEMPLATES.length)];
    const notes = tpl.intervals.map(i => root + i);
    return {
      name: `${midiToName(root)} ${tpl.name}`,
      notes: notes.map(midi => ({ midi, freq: midiToFreq(midi), name: midiToName(midi) })),
    };
  }
  if (cfg.intervals === 'doremi') {
    // Do-Re-Mi: root, major 2nd, major 3rd. Always ascending, always major.
    const intervals = [0, 2, 4];
    const notes = intervals.map(i => root + i);
    return {
      name: `${midiToName(root)} DO-RE-MI`,
      notes: notes.map(midi => ({ midi, freq: midiToFreq(midi), name: midiToName(midi) })),
    };
  }
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
                     voiceRange = 'higher', voiceRangeMidi = null, onChangeRange = null,
                     mode = 'beginner' }) => {
  const [permission, setPermission] = useState('pending'); // 'pending' | 'granted' | 'denied' | 'unsupported' | 'insecure'
  const [errorDetail, setErrorDetail] = useState('');

  const modeCfg = TUNER_MODES[mode] || TUNER_MODES.beginner;

  // Resolve which root pool to use based on voiceRange + optional calibration midi
  const resolveRoots = () => {
    if (voiceRange === 'auto' && voiceRangeMidi) return rangeFromCalibration(voiceRangeMidi);
    if (voiceRange === 'lower') return VOICE_RANGES.lower.roots;
    return VOICE_RANGES.higher.roots; // default
  };
  const [chord, setChord] = useState(() => generateChord(resolveRoots(), mode));
  const [noteIdx, setNoteIdx] = useState(0); // current note in the chord (0..2)
  const [phase, setPhase] = useState('listen'); // 'listen' | 'sing'
  // Which note is currently being demoed during the listen-all phase of the
  // demo-then-sing flow (-1 when not in that phase). Drives UI highlight.
  const [demoIdx, setDemoIdx] = useState(-1);
  const [detectedFreq, setDetectedFreq] = useState(-1);
  const [sustainFill, setSustainFill] = useState(0); // 0..1 of current note's hold meter
  const [noteScores, setNoteScores] = useState(() => chord.notes.map(() => null)); // 0..1 per note

  // Refs for the audio pipeline (reset on remount)
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const bufferRef = useRef(null);

  // The active note's accumulator state (only counts during 'sing' phase).
  // DURATION_MS comes from the chosen mode (Beginner: 800ms; Advanced: 2500ms).
  const noteStateRef = useRef({
    inTuneTime: 0,
    totalTime: 0,
    DURATION_MS: modeCfg.durationMs,
    _lastTick: 0,
  });
  // Keep DURATION_MS in sync if the mode prop ever flips at runtime.
  useEffect(() => {
    noteStateRef.current.DURATION_MS = modeCfg.durationMs;
  }, [modeCfg.durationMs]);

  // Refs to avoid stale closures inside the rAF loop
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  const noteIdxRef = useRef(noteIdx);
  useEffect(() => { noteIdxRef.current = noteIdx; }, [noteIdx]);
  const chordRef = useRef(chord);
  useEffect(() => { chordRef.current = chord; }, [chord]);
  // Live mirrors for the SingStar-style pitch ribbon's rAF loop. State
  // setters re-render React; the canvas reads these refs each frame.
  const detectedFreqRef = useRef(-1);
  useEffect(() => { detectedFreqRef.current = detectedFreq; }, [detectedFreq]);
  const demoIdxRef = useRef(-1);
  useEffect(() => { demoIdxRef.current = demoIdx; }, [demoIdx]);
  const noteScoresRef = useRef([]);
  useEffect(() => { noteScoresRef.current = noteScores; }, [noteScores]);
  // Canvas the ribbon draws onto.
  const ribbonCanvasRef = useRef(null);

  // Regenerate chord when the voice range OR mode setting changes
  const voiceRangeKey = `${voiceRange}:${voiceRangeMidi || ''}:${mode}`;
  const lastRangeKeyRef = useRef(voiceRangeKey);
  useEffect(() => {
    if (lastRangeKeyRef.current !== voiceRangeKey) {
      lastRangeKeyRef.current = voiceRangeKey;
      const fresh = generateChord(resolveRoots(), mode);
      setChord(fresh);
      setNoteIdx(0);
      setNoteScores(fresh.notes.map(() => null));
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

  // Schedule a sequence of reference tones back-to-back via WebAudio's
  // absolute clock — used by the demo-then-sing flow so all 3 demo notes
  // play at consistent timing without setTimeout drift.
  const playReferenceSequence = (notes, durationSecEach, gapSec = 0.05) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    refTonesRef.current.forEach(t => { try { t.stop(); } catch {} });
    refTonesRef.current = [];
    const startBase = ctx.currentTime + 0.02;
    const allOscs = [];
    notes.forEach((note, i) => {
      const t0 = startBase + i * (durationSecEach + gapSec);
      const t1 = t0 + durationSecEach;
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.0001, t0);
      masterGain.gain.linearRampToValueAtTime(0.18, t0 + 0.04);
      masterGain.gain.setValueAtTime(0.18, Math.max(t0 + 0.05, t1 - 0.10));
      masterGain.gain.linearRampToValueAtTime(0.0001, t1);
      masterGain.connect(ctx.destination);
      const osc1 = ctx.createOscillator();
      osc1.type = 'sine'; osc1.frequency.value = note.freq;
      const g1 = ctx.createGain(); g1.gain.value = 1.0;
      osc1.connect(g1).connect(masterGain);
      osc1.start(t0); osc1.stop(t1 + 0.05);
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine'; osc2.frequency.value = note.freq * 2;
      const g2 = ctx.createGain(); g2.gain.value = 0.18;
      osc2.connect(g2).connect(masterGain);
      osc2.start(t0); osc2.stop(t1 + 0.05);
      const osc3 = ctx.createOscillator();
      osc3.type = 'sine'; osc3.frequency.value = note.freq * 3;
      const g3 = ctx.createGain(); g3.gain.value = 0.06;
      osc3.connect(g3).connect(masterGain);
      osc3.start(t0); osc3.stop(t1 + 0.05);
      allOscs.push(osc1, osc2, osc3);
    });
    refTonesRef.current = allOscs;
  };

  // SingStar-style pitch ribbon: draws the chord's notes as colored bars
  // laid out left-to-right at heights mapped to their pitch, plus the
  // player's detected pitch as a marker at the current note's column.
  // The marker turns green when within ±50¢ of the target so it's much
  // easier to see "am I on pitch?" than the abstract cents needle.
  useEffect(() => {
    const canvas = ribbonCanvasRef.current;
    if (!canvas) return;
    const W = 360, H = 130, S = 2;
    canvas.width = W * S; canvas.height = H * S;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    let raf;
    let fc = 0;
    const loop = () => {
      fc++;
      const chord = chordRef.current;
      const noteIdx = noteIdxRef.current;
      const demoIdx = demoIdxRef.current;
      const phase = phaseRef.current;
      const detectedFreq = detectedFreqRef.current;
      const noteScores = noteScoresRef.current || [];
      if (!chord || !chord.notes || !chord.notes.length) {
        raf = requestAnimationFrame(loop);
        return;
      }
      ctx.save();
      ctx.scale(S, S);
      // Background
      ctx.fillStyle = '#0c0a09';
      ctx.fillRect(0, 0, W, H);
      // Y-range with headroom — clamp the player's pitch into a sensible
      // window so a stray octave error doesn't fly the marker off-canvas.
      const midis = chord.notes.map(n => n.midi);
      const yMin = Math.min(...midis) - 4;
      const yMax = Math.max(...midis) + 4;
      const yRange = Math.max(8, yMax - yMin);
      const padX = 18, padTop = 14, padBottom = 22;
      const usableH = H - padTop - padBottom;
      const midiToY = (midi) => {
        const t = (midi - yMin) / yRange;
        return H - padBottom - t * usableH;
      };
      // Subtle staff lines every 2 semitones
      ctx.fillStyle = '#1c1917';
      for (let m = Math.ceil(yMin); m < yMax; m += 2) {
        const y = midiToY(m);
        ctx.fillRect(padX, y, W - 2 * padX, 1);
      }
      // Layout
      const barCount = chord.notes.length;
      const barAreaW = W - 2 * padX;
      const stepX = barAreaW / barCount;
      const barWidth = stepX * 0.7;
      const currentIdx = demoIdx >= 0 ? demoIdx : noteIdx;
      // Note bars
      chord.notes.forEach((n, i) => {
        const cx = padX + i * stepX + stepX / 2;
        const x = cx - barWidth / 2;
        const y = midiToY(n.midi);
        const isCurrent = i === currentIdx;
        const isPast = (noteScores[i] != null) || (i < noteIdx && phase === 'sing');
        const score = noteScores[i] || 0;
        const baseColor = isCurrent
          ? '#fbbf24'
          : isPast
            ? (score >= 0.7 ? '#5a8030' : score >= 0.3 ? '#7a6028' : '#7a2828')
            : '#3a3530';
        // Body
        ctx.fillStyle = baseColor;
        ctx.fillRect(x, y - 5, barWidth, 10);
        // Highlight stripe (lighter top edge)
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(x, y - 5, barWidth, 2);
        if (isCurrent) {
          // Animated pulsing outline
          const pulse = 0.6 + 0.4 * Math.sin(fc * 0.15);
          ctx.globalAlpha = pulse;
          ctx.strokeStyle = '#fef3c7';
          ctx.lineWidth = 1;
          ctx.strokeRect(x - 1.5, y - 6.5, barWidth + 3, 13);
          ctx.globalAlpha = 1;
        }
        // Note name label
        ctx.fillStyle = isCurrent ? '#fbbf24' : '#7a7570';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(n.name, cx, H - 6);
      });
      // Player's detected pitch — only render during the sing phase (not
      // listen / demo) so the player isn't looking at their own mic noise.
      if (detectedFreq > 0 && phase === 'sing' && currentIdx >= 0 && currentIdx < chord.notes.length) {
        const target = chord.notes[currentIdx];
        let detectedMidi = 69 + 12 * Math.log2(detectedFreq / 440);
        // Fold octave errors so the marker doesn't shoot off the chart
        while (detectedMidi - target.midi > 8) detectedMidi -= 12;
        while (target.midi - detectedMidi > 8) detectedMidi += 12;
        const clampedMidi = Math.max(yMin, Math.min(yMax, detectedMidi));
        const py = midiToY(clampedMidi);
        const targetX = padX + currentIdx * stepX + stepX / 2;
        let cents = freqToCents(detectedFreq, target.freq);
        while (cents > 600) cents -= 1200;
        while (cents < -600) cents += 1200;
        const absCents = Math.abs(cents);
        const inTune = absCents < 50;
        const close   = absCents < 100;
        const color = inTune ? '#22c55e' : close ? '#fbbf24' : '#dc2626';
        // Faint vertical guide from the bar to the player marker
        ctx.fillStyle = `${color}33`;
        const ty = midiToY(target.midi);
        const guideY1 = Math.min(py, ty);
        const guideY2 = Math.max(py, ty);
        ctx.fillRect(targetX - 1, guideY1, 2, Math.max(2, guideY2 - guideY1));
        // Player marker — small horizontal bar at the detected pitch
        const markerW = barWidth * 0.85;
        ctx.fillStyle = color;
        ctx.fillRect(targetX - markerW / 2, py - 2, markerW, 4);
        // In-tune glow
        if (inTune) {
          ctx.fillStyle = 'rgba(34,197,94,0.30)';
          ctx.fillRect(targetX - markerW / 2 - 4, py - 5, markerW + 8, 10);
        }
        // Cents readout next to marker
        ctx.fillStyle = color;
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'left';
        const centsLabel = `${cents > 0 ? '+' : ''}${cents.toFixed(0)}¢`;
        ctx.fillText(centsLabel, targetX + markerW / 2 + 4, py + 3);
      }
      // Phase label top-left
      ctx.fillStyle = phase === 'listen' ? '#88AADD' : '#fbbf24';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'left';
      const phaseTxt = (phase === 'listen' || demoIdx >= 0)
        ? (demoIdx >= 0 ? `🔊 LISTEN ${demoIdx + 1}/${chord.notes.length}` : '🔊 LISTEN')
        : `🎤 SING ${noteIdx + 1}/${chord.notes.length}`;
      ctx.fillText(phaseTxt, padX, padTop - 2);
      ctx.restore();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // Depend on `permission` because the canvas isn't in the DOM until
    // permission becomes 'granted' (the early-return UIs are rendered
    // for 'pending'/'denied'). With [] deps the effect would fire once
    // on the first mount when ribbonCanvasRef.current was still null
    // and never re-run, so the ribbon stayed empty forever.
  }, [permission]);

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
    const timers = [];
    const DUR = noteStateRef.current.DURATION_MS;
    const target = chord.notes[noteIdx];
    if (!target) return;

    // Helper: end-of-sing scoring and advance.
    const scoreAndAdvance = () => {
      const ns2 = noteStateRef.current;
      const score = Math.min(1, ns2.inTuneTime / (ns2.DURATION_MS * 0.4));
      setNoteScores(prev => {
        const updated = [...prev];
        updated[noteIdxRef.current] = score;
        return updated;
      });
      chordScoresRef.current.push(score);
      const lastIdx = (chordRef.current?.notes?.length || 1) - 1;
      if (noteIdxRef.current < lastIdx) {
        setNoteIdx(i => i + 1);
      } else {
        const fresh = generateChord(resolveRoots(), mode);
        setChord(fresh);
        setNoteIdx(0);
        setNoteScores(fresh.notes.map(() => null));
      }
    };

    // Helper: enter sing for the current target.
    const startSing = () => {
      setPhase('sing');
      setDemoIdx(-1);
      const ns = noteStateRef.current;
      ns.inTuneTime = 0;
      ns.totalTime = 0;
      ns._lastTick = performance.now();
      timers.push(setTimeout(scoreAndAdvance, DUR));
    };

    if (modeCfg.flow === 'demo-then-sing') {
      // Listen-all → sing-all flow. The listen-all phase only fires on
      // noteIdx === 0; on subsequent notes within the same chord, we go
      // straight to sing for that note.
      if (noteIdx === 0) {
        setPhase('listen');
        setSustainFill(0);
        setDemoIdx(0);
        playReferenceSequence(chord.notes, DUR / 1000, 0.05);
        // Highlight which note is currently being demoed.
        chord.notes.forEach((_, i) => {
          if (i > 0) timers.push(setTimeout(() => setDemoIdx(i), i * (DUR + 50)));
        });
        // After all 3 demo notes have played, transition to singing note 0.
        const totalDemoMs = chord.notes.length * DUR + (chord.notes.length - 1) * 50;
        timers.push(setTimeout(() => startSing(), totalDemoMs));
      } else {
        startSing();
      }
    } else {
      // Alternating: listen one, sing one (the original behavior).
      setPhase('listen');
      setSustainFill(0);
      setDemoIdx(-1);
      playReferenceTone(target.freq, DUR / 1000);
      timers.push(setTimeout(() => startSing(), DUR));
    }

    return () => {
      timers.forEach(clearTimeout);
      refTonesRef.current.forEach(t => { try { t.stop(); } catch {} });
      refTonesRef.current = [];
    };
  }, [permission, active, chord, noteIdx, modeCfg.flow]);

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

  // What to show as the "current note" — during the listen-all demo phase
  // we follow the demoIdx; otherwise the actual sing target.
  const displayNote = (demoIdx >= 0 ? chord.notes[demoIdx] : target);
  const isDemoAll = demoIdx >= 0;
  const phaseHint = isDemoAll
    ? `🔊 Listen — note ${demoIdx + 1} / ${chord.notes.length}`
    : phase === 'listen'
      ? '🔊 Listen'
      : modeCfg.flow === 'demo-then-sing'
        ? `🎤 Sing back — note ${noteIdx + 1} / ${chord.notes.length}`
        : '🎤 Your turn — sing it back';
  return (
    <div className="border-2 border-stone-800 bg-stone-900/50 p-3 space-y-3">
      {/* Chord title */}
      <div className="text-center">
        <div className="text-xs uppercase tracking-[0.3em] text-stone-500">
          {modeCfg.flow === 'demo-then-sing' ? `Listen all ${chord.notes.length}, then sing all ${chord.notes.length}` : 'Listen, then repeat'}
          <span className="text-stone-600"> · {modeCfg.label}</span>
        </div>
        <div className="text-amber-500 text-lg tracking-wider" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
          {chord.name}
        </div>
      </div>

      {/* Sequence dots */}
      <div className="flex justify-center gap-2">
        {chord.notes.map((n, i) => (
          <div key={i} className="flex flex-col items-center">
            <div className={`w-3 h-3 rounded-full border-2 transition-all ${
              isDemoAll && i === demoIdx ? 'bg-blue-500 border-blue-500 animate-pulse' :
              isDemoAll ? 'border-stone-700' :
              i < noteIdx ? (noteScores[i] >= 0.7 ? 'bg-amber-500 border-amber-500' : noteScores[i] >= 0.3 ? 'bg-amber-700 border-amber-700' : 'bg-red-700 border-red-700') :
              i === noteIdx ? 'border-amber-500 animate-pulse' :
              'border-stone-700'
            }`} />
            <div className="text-[9px] text-stone-500 mt-1 font-mono">{n.name}</div>
          </div>
        ))}
      </div>

      {/* SingStar-style pitch ribbon — primary visual feedback. Notes are
          laid out left→right at heights matching their pitch; the player's
          detected pitch shows as a marker at the active note's column,
          green when within ±50¢. Replaces the abstract cents needle as the
          go-to "am I on pitch?" indicator. */}
      <div className="flex items-baseline justify-between px-1">
        <div className="text-[9px] uppercase tracking-[0.3em] text-amber-500"
          style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
          🎯 PITCH TRACK
        </div>
        <div className="text-[8px] uppercase tracking-widest text-stone-600">
          green = on pitch
        </div>
      </div>
      <canvas ref={ribbonCanvasRef}
        className="w-full block border-2 border-amber-700/40"
        style={{ aspectRatio: '360 / 130', imageRendering: 'pixelated', background: '#0c0a09' }} />

      {/* Phase indicator - big & obvious */}
      <div className={`text-center py-2 border-2 transition-all ${
        (phase === 'listen' || isDemoAll) ? 'border-blue-500 bg-blue-500/10' : 'border-amber-500 bg-amber-500/10'
      }`}>
        <div className="text-[10px] uppercase tracking-[0.3em]" style={{ color: (phase === 'listen' || isDemoAll) ? '#88AADD' : '#D4A017' }}>
          {phaseHint}
        </div>
        <div className="text-4xl font-black leading-none my-1" style={{
          fontFamily: '"Bebas Neue", "Oswald", sans-serif',
          color: (phase === 'listen' || isDemoAll) ? '#88AADD' : '#D4A017',
        }}>
          {displayNote?.name || '--'}
        </div>
        <div className="text-stone-500 text-[10px] font-mono">{displayNote ? displayNote.freq.toFixed(1) : '0'} Hz</div>
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

// Style cycle (rock-paper-scissors for beats):
//   BOOM beats HATS · HATS beats RIM · RIM beats SNARE · SNARE beats BOOM
// Each pattern has a primary style. Picking a counter style multiplies your
// round score; getting countered by the opponent multiplies it down.
const STYLE_BEATS = { BOOM: 'HATS', HATS: 'RIM', RIM: 'SNARE', SNARE: 'BOOM' };
const STYLE_COLORS = { BOOM: '#CC2200', HATS: '#22d3ee', RIM: '#a78bfa', SNARE: '#fbbf24' };
const styleMatchup = (you, them) => {
  if (!you || !them) return 1;
  if (STYLE_BEATS[you] === them) return 1.5;     // you counter
  if (STYLE_BEATS[them] === you) return 0.7;     // they counter you
  return 1.0;                                    // neutral or mirror
};

const HERO_LESSONS = [
  // Lessons 1-5 use only the 4 hero sounds (always unlocked by progression)
  { name: 'BOOM BASIC',   desc: 'Kick on every beat',            tier: 1, style: 'BOOM',  pattern: _patBoom() },
  { name: 'BACKBEAT',     desc: 'Kick on 1 & 3, snare on 2 & 4', tier: 1, style: 'SNARE', pattern: _patBackbeat() },
  { name: 'HI-HAT 8THS',  desc: 'Hat on every 8th note',         tier: 1, style: 'HATS',  pattern: _patHat8ths() },
  { name: 'KIT GROOVE',   desc: 'Boom + snare + 8th hats',       tier: 2, style: 'SNARE', pattern: _patKitGroove() },
  { name: 'WITH RIMSHOT', desc: 'Kit groove + rim accents',      tier: 2, style: 'RIM',   pattern: _patWithRim() },
  // Lessons 6-12 each gate on owning a specific catalog sound (buy it in the shop).
  { name: 'LIP ROLL DRILL', desc: 'Lip rolls on the offbeats',    tier: 2, style: 'HATS',
    requires: 'lip_roll',    lanes: ['B', 'T', 'lip_roll', 'Pf'],     pattern: _patL6() },
  { name: '808 THROAT',     desc: 'Heavy throat-kick groove',     tier: 2, style: 'BOOM',
    requires: 'throat_kick', lanes: ['throat_kick', 'T', 'K', 'Pf'],  pattern: _patL7() },
  { name: 'FAST HATS',      desc: 'TKs doubling the hi-hat lane', tier: 2, style: 'HATS',
    requires: 'fast_hats',   lanes: ['B', 'fast_hats', 'K', 'Pf'],    pattern: _patL8() },
  { name: 'INWARD SNARE',   desc: 'Alternate snare voice',        tier: 2, style: 'SNARE',
    requires: 'inward_k',    lanes: ['B', 'T', 'K', 'inward_k'],      pattern: _patL9() },
  { name: 'INWARD BASS',    desc: 'Deep inward bass kick',        tier: 3, style: 'BOOM',
    requires: 'inward_bass', lanes: ['inward_bass', 'T', 'K', 'Pf'],  pattern: _patL10() },
  { name: 'CLICK ROLL',     desc: 'Click roll fills',             tier: 3, style: 'RIM',
    requires: 'click_roll',  lanes: ['B', 'T', 'click_roll', 'Pf'],   pattern: _patL11() },
  { name: 'UVULAR FINALE',  desc: 'All four advanced sounds',     tier: 4, style: 'BOOM',
    requires: 'uvular_roll', lanes: ['uvular_roll', 'fast_hats', 'click_roll', 'inward_bass'],
    pattern: _patL12() },
];

// ============ MIC BEATBOX DETECTOR ============
// Listens through the mic, runs onset detection, and classifies each transient
// into one of the 4 hero keys (B/T/K/Pf) via a simple frequency-band heuristic.
// Calls onHit(key) when it registers a hit. Used by Beatbox Hero in mic mode.

// Real-input radix-2 FFT (in-place Cooley-Tukey). Input length must be a power of 2.
// Returns Float32Array of magnitudes, length N/2.
const _fftMag = (input) => {
  const N = input.length;
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  // Hann window to reduce spectral leakage
  for (let i = 0; i < N; i++) re[i] = input[i] * (0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1))));
  // Bit-reverse
  let j = 0;
  for (let i = 1; i < N; i++) {
    let bit = N >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; }
  }
  // Butterflies
  for (let len = 2; len <= N; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wre = Math.cos(ang);
    const wim = Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let cre = 1, cim = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const tre = re[b] * cre - im[b] * cim;
        const tim = re[b] * cim + im[b] * cre;
        const ure = re[a];
        const uim = im[a];
        re[a] = ure + tre;
        im[a] = uim + tim;
        re[b] = ure - tre;
        im[b] = uim - tim;
        const ncre = cre * wre - cim * wim;
        cim = cre * wim + cim * wre;
        cre = ncre;
      }
    }
  }
  const mag = new Float32Array(N / 2);
  for (let i = 0; i < N / 2; i++) mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
  return mag;
};

// Compute a 5-band normalized spectral profile from a time-domain window.
const _bandProfile = (timeData, sampleRate) => {
  const N = timeData.length;
  const mag = _fftMag(timeData);
  const binHz = sampleRate / N;
  const sumPower = (lo, hi) => {
    const a = Math.max(0, Math.floor(lo / binHz));
    const b = Math.min(mag.length, Math.ceil(hi / binHz));
    let s = 0;
    for (let i = a; i < b; i++) s += mag[i] * mag[i];
    return s;
  };
  const bands = [
    sumPower(40, 150),    // sub-bass — kick
    sumPower(150, 500),   // low-mid
    sumPower(500, 2000),  // mid
    sumPower(2000, 6000), // high — snare
    sumPower(6000, 14000),// very-high — hat
  ];
  const total = bands.reduce((a, b) => a + b, 0);
  if (total < 1e-6) return null;
  return bands.map(b => b / total);
};

// Build a profile from a recorded studio sample. Picks the loudest moment
// in the buffer, takes a 2048-sample (~43ms at 48k) window starting just
// before the peak so the transient is in frame.
const _profileFromBuffer = (audioBuffer, fftSize = 2048) => {
  if (!audioBuffer) return null;
  const data = audioBuffer.getChannelData(0);
  const sr = audioBuffer.sampleRate;
  let peakIdx = 0, peakAbs = 0;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]);
    if (a > peakAbs) { peakAbs = a; peakIdx = i; }
  }
  const start = Math.max(0, peakIdx - (fftSize >> 2));
  const win = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    const src = start + i;
    win[i] = src < data.length ? data[src] : 0;
  }
  return _bandProfile(win, sr);
};

// Default profiles used when the player hasn't recorded that sound yet.
const _DEFAULT_PROFILES = {
  B:  [0.46, 0.34, 0.15, 0.04, 0.01],
  K:  [0.05, 0.18, 0.45, 0.22, 0.10],
  Pf: [0.04, 0.10, 0.22, 0.46, 0.18],
  T:  [0.03, 0.07, 0.16, 0.30, 0.44],
};

const MicBeatboxDetector = ({ active, paused = false, onHit }) => {
  const [permission, setPermission] = useState('idle'); // 'idle'|'requesting'|'granted'|'denied'|'insecure'
  const [errorDetail, setErrorDetail] = useState('');
  const [level, setLevel] = useState(0);
  const [lastDetected, setLastDetected] = useState(null);
  const [profileSources, setProfileSources] = useState({});
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
      analyser.fftSize = 2048; // 2048 = ~43 ms window @ 48k, better band resolution
      analyser.smoothingTimeConstant = 0;
      src.connect(analyser);
      setPermission('granted');

      const fftSize = analyser.fftSize;
      const sampleRate = ctx.sampleRate;
      const timeBuf = new Float32Array(fftSize);

      // Build per-key profiles from the player's recorded studio samples (if any)
      // and fall back to the hardcoded defaults for keys that aren't recorded.
      const profiles = {};
      const usingRecording = {};
      ['B', 'T', 'K', 'Pf'].forEach(k => {
        const buf = HERO_SAMPLES[k];
        const p = buf ? _profileFromBuffer(buf, fftSize) : null;
        profiles[k] = p || _DEFAULT_PROFILES[k];
        usingRecording[k] = !!p;
      });
      if (mounted) setProfileSources(usingRecording);

      const tick = () => {
        analyser.getFloatTimeDomainData(timeBuf);
        let sumSq = 0;
        for (let i = 0; i < timeBuf.length; i++) sumSq += timeBuf[i] * timeBuf[i];
        const rms = Math.sqrt(sumSq / timeBuf.length);
        if (mounted) setLevel(rms);

        const now = performance.now();
        recentRms = recentRms * 0.95 + rms * 0.05;
        const dynThresh = Math.max(onsetFloor, recentRms * 2);

        if (pausedRef.current) {
          raf = requestAnimationFrame(tick);
          return;
        }

        if (rms > dynThresh && now - lastOnsetMs > cooldownMs) {
          lastOnsetMs = now;
          // FFT the live time-domain buffer into a 5-band normalized profile,
          // then pick the closest profile by cosine similarity.
          const obs = _bandProfile(timeBuf, sampleRate);
          if (obs) {
            const cosSim = (a, b) => {
              let dot = 0, na = 0, nb = 0;
              for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
              return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
            };
            let bestKey = 'K', bestSim = -Infinity;
            for (const k of Object.keys(profiles)) {
              const s = cosSim(obs, profiles[k]);
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
        <>
          <div className="h-2 bg-stone-950 border border-stone-800 overflow-hidden">
            <div className="h-full transition-all duration-75"
              style={{ width: `${meterPct}%`, background: meterColor }} />
          </div>
          {/* Per-key profile source: ✓ = matched against your recording, otherwise default */}
          <div className="flex justify-between text-[9px] uppercase tracking-widest">
            {['B', 'T', 'K', 'Pf'].map(k => {
              const meta = HERO_SOUNDS[k];
              const learned = !!profileSources[k];
              return (
                <span key={k} style={{ color: learned ? meta.color : '#57534e' }}>
                  {learned ? '✓' : '·'} {meta.label}
                </span>
              );
            })}
          </div>
        </>
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
  onStreak,
  evaluateEveryMs = 2500,
  active = true,
  bpm = 90,
  lessonIdx = 0,
  mode = 'practice', // 'practice' = 4 reps demo/player loop; 'battle' = single player rep, no auto-restart
  inputMode = 'tap', // 'tap' = drum pads; 'mic' = beatbox into the mic (wider hit windows)
  accuracyBoost = 1, // 1.25 with premium_headphones — widens the hit windows
  lessonOverride = null, // optional synthesized lesson — used by battle combos (16 beats)
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
  const lessonOverrideRef = useRef(lessonOverride);
  useEffect(() => { lessonOverrideRef.current = lessonOverride; }, [lessonOverride]);
  const onStreakRef = useRef(onStreak);
  useEffect(() => { onStreakRef.current = onStreak; }, [onStreak]);

  // Constants — wider hit windows in mic mode to compensate for ~50–100 ms
  // detection latency. accuracyBoost (e.g. 1.25 with premium headphones)
  // widens both hit windows.
  const HIT_PERFECT_MS = (inputMode === 'mic' ? 200 : 110) * accuracyBoost;
  const HIT_GOOD_MS    = (inputMode === 'mic' ? 350 : 180) * accuracyBoost;
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
    // lessonOverride lets the parent inject a synthesized lesson (e.g. battle combos
    // built from two HERO_LESSONS halves). When absent we fall back to HERO_LESSONS[idx].
    const lesson = config.lessonOverride || HERO_LESSONS[config.lessonIdx] || HERO_LESSONS[0];
    const lanes = lesson.lanes || HERO_LANES;
    const beatMs = 60000 / config.bpm;
    // Patterns are now half-length by default (8 beats) — combos override to 16.
    const patternBeats = lesson.patternBeats ?? 8;
    const patternMs = patternBeats * beatMs;
    const filteredPattern = (lesson.pattern || []).filter(n => n.beat < patternBeats);

    const notes = [];
    for (let rep = 0; rep < REPS_TOTAL; rep++) {
      // Practice mode alternates demo/player; battle = player; spectate = demo
      const isDemo = (mode === 'practice' && rep % 2 === 0) || mode === 'spectate';
      const repStart = rep * patternMs;
      filteredPattern.forEach((n, i) => {
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
      streak: 0,        // current consecutive perfect hits
      bestStreak: 0,    // peak streak this run
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
      if (isPerfect) {
        state.perfects++;
        state.streak++;
        if (state.streak > state.bestStreak) state.bestStreak = state.streak;
        onStreakRef.current?.(state.streak);
      } else if (state.streak > 0) {
        state.streak = 0;
        onStreakRef.current?.(0);
      }
    } else {
      // Stray tap — no note in this lane near the strike line. Count it as a
      // miss so spamming all four pads drops the accuracy.
      state.misses++;
      if (state.streak > 0) {
        state.streak = 0;
        onStreakRef.current?.(0);
      }
    }
    rerender();
  };

  // Keyboard taps: A=lane0, S=lane1, D=lane2, F=lane3. Skipped in spectate
  // mode (player can't tap) and mic mode (voice is the input).
  const handleTapRef = useRef(handleTap);
  handleTapRef.current = handleTap;
  const heroModeRef = useRef({ mode, inputMode });
  heroModeRef.current = { mode, inputMode };
  useEffect(() => onGlobalKey((e) => {
    const { mode: m, inputMode: im } = heroModeRef.current;
    if (m === 'spectate' || im === 'mic') return;
    let idx = -1;
    if (e.code === 'KeyA' || e.key === 'a' || e.key === 'A') idx = 0;
    else if (e.code === 'KeyS' || e.key === 's' || e.key === 'S') idx = 1;
    else if (e.code === 'KeyD' || e.key === 'd' || e.key === 'D') idx = 2;
    else if (e.code === 'KeyF' || e.key === 'f' || e.key === 'F') idx = 3;
    if (idx < 0) return;
    const lanes = stateRef.current?.lanes || HERO_LANES;
    if (idx >= lanes.length) return;
    handleTapRef.current(lanes[idx]);
  }), []);

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
      s.streak = 0;
      s.bestStreak = 0;
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

    stateRef.current = initState({ bpm: bpmRef.current, lessonIdx, lessonOverride: lessonOverrideRef.current });
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
          onLessonComplete?.(state.lessonIdx, finalAcc, { bestStreak: state.bestStreak, perfects: state.perfects });
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
        stateRef.current = initState({ bpm: bpmRef.current, lessonIdx: lessonIdxRef.current, lessonOverride: lessonOverrideRef.current });
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
          if (state.streak > 0) {
            state.streak = 0;
            onStreakRef.current?.(0);
          }
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
            const keyHint = ['A','S','D','F'][idx];
            return (
              <button key={sound + idx}
                onPointerDown={(e) => { e.preventDefault(); handleTap(sound); }}
                className="py-5 border-2 active:scale-95 transition-transform select-none touch-none relative"
                style={{
                  borderColor: meta.color,
                  background: `${meta.color}1f`,
                  color: meta.color,
                  fontFamily: '"Bebas Neue", "Oswald", sans-serif',
                  fontSize: 22,
                  letterSpacing: '0.15em',
                }}>
                {meta.label}
                {keyHint && <span className="absolute top-1 right-1.5 text-[9px] tracking-widest opacity-60">{keyHint}</span>}
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
const SEQ_SLOTS = 4;     // base slot count
const SEQ_SLOTS_MPC = 8; // doubled when the Pro MPC gear is owned

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
  slotCount = SEQ_SLOTS, // total tabs to show — doubles to 8 with the Pro MPC gear
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
          {Array.from({ length: slotCount }).map((_, i) => {
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

      // ---- Daytime park sky ----
      _drawDaytimeSky(ctx, W);
      // Sun
      px(116, 6, 10, 10, '#fef3c7');
      px(118, 4, 6, 14, '#fef3c7');
      px(114, 8, 14, 6, '#fef3c7');
      ctx.fillStyle = 'rgba(254, 243, 199, 0.30)';
      ctx.beginPath(); ctx.arc(121, 11, 12, 0, Math.PI * 2); ctx.fill();
      // Drifting clouds
      const cloud = (cx, cy) => {
        px(cx, cy, 12, 3, '#fff');
        px(cx + 2, cy - 2, 8, 5, '#fff');
        px(cx + 4, cy - 3, 4, 6, '#fff');
        px(cx + 1, cy + 3, 10, 1, '#dadada');
      };
      cloud(15 + ((frameCount * 0.04) % 160) - 30, 12);
      cloud(70 + ((frameCount * 0.025) % 180) - 40, 24);

      // Trees in background (foliage line)
      for (let i = 0; i < 5; i++) {
        const tx = 5 + i * 30;
        px(tx - 8, 38, 16, 8, '#3a7028');
        px(tx - 6, 34, 12, 4, '#4a8030');
        px(tx - 3, 30, 6, 4, '#5a9038');
        px(tx - 1, 46, 2, 6, '#3a2410');                // trunk
      }

      // Daytime crowd silhouette (lighter, daylight bodies — not pure black)
      const crowdY = 40;
      for (let i = 0; i < 18; i++) {
        const cx = i * 8 + (i % 2) * 2;
        const headBob = Math.sin(frameCount * 0.1 + i * 0.5) * 0.5;
        const colors = ['#5a3020', '#6a4030', '#3a2818', '#5a3a28', '#7a5040'];
        const shirt = ['#a04040', '#5a7050', '#a06030', '#4060a0', '#a06090'][i % 5];
        // head (skin tone)
        px(cx, crowdY + headBob, 4, 4, '#a87844');
        // body shirt
        px(cx - 1, crowdY + 4 + headBob, 6, 8, shirt);
        // hair
        px(cx, crowdY - 1 + headBob, 4, 1, colors[i % colors.length]);
        // raised arms (some)
        if (i % 3 === 0) {
          const armUp = Math.sin(frameCount * 0.15 + i) > 0;
          if (armUp) {
            px(cx - 2, crowdY + 1 + headBob, 1, 4, shirt);
            px(cx + 5, crowdY + 1 + headBob, 1, 4, shirt);
          }
        }
      }

      // Ground — sunlit grass (lighter, warm)
      px(0, 50, W, 40, '#6a9a3a');
      // Grass blades (subtle texture)
      for (let i = 0; i < 18; i++) {
        const gx = (i * 8) % W;
        const gy = 56 + (i % 3) * 6;
        px(gx, gy, 1, 2, '#5a8a30');
      }
      // Cypher floor circle — dirt path stomped flat
      ctx.fillStyle = '#a89060';
      ctx.beginPath();
      ctx.ellipse(70, 72, 52, 17, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#7a6a48';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(70, 72, 50, 16, 0, 0, Math.PI * 2);
      ctx.stroke();
      // Speckles inside the dirt circle for texture
      for (let i = 0; i < 8; i++) {
        const sx = 30 + i * 10;
        const sy = 68 + (i % 3) * 4;
        px(sx, sy, 1, 1, '#7a6a48');
      }

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
      style={{ imageRendering: 'pixelated', background: '#7ec0e8', aspectRatio: `${W} / ${H}` }} />
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
        <div className="h-full transition-all" style={{ width: `${_clampPct((value / max) * 100)}%`, background: color }} />
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

// ============ ERROR BOUNDARY ============
// Catches render-time exceptions inside the screen layer and shows a small
// recovery card instead of unmounting the whole tree (which previously
// rendered as a fully black page). Logs the error so devtools surfaces it.
class ScreenErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) {
    // Surface to console so the dev can copy/paste the stack.
    console.error('ScreenErrorBoundary caught:', err, info?.componentStack);
  }
  reset = () => this.setState({ err: null });
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div style={{ padding: 16, color: '#e7e5e4', minHeight: '60vh' }}>
        <div style={{ color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.3em', fontSize: 11, marginBottom: 8 }}>
          ⚠ Render crashed
        </div>
        <div style={{ fontSize: 12, marginBottom: 8 }}>
          Something threw while drawing the screen. Your save is fine — tap Retry to re-render.
        </div>
        <pre style={{ fontSize: 10, color: '#fbbf24', background: '#1c1917', padding: 8, overflow: 'auto', maxHeight: '40vh', whiteSpace: 'pre-wrap' }}>
          {String(this.state.err?.message || this.state.err)}
          {this.state.err?.stack ? '\n\n' + this.state.err.stack : ''}
        </pre>
        <button onClick={this.reset}
          style={{ marginTop: 12, padding: '8px 16px', background: '#fbbf24', color: '#0c0a09', border: 'none', textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: 11, cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    );
  }
}

// Fixed banner at the top of the screen that surfaces async / effect /
// event-handler errors (which React's <ErrorBoundary> can't catch). Listens
// to window 'error' and 'unhandledrejection'. Tap the X to dismiss.
const GlobalErrorOverlay = () => {
  const [errors, setErrors] = useState([]);
  useEffect(() => {
    const push = (msg, src) => {
      setErrors(es => {
        // Dedup identical messages so a 60Hz spam doesn't fill the screen.
        if (es.some(e => e.msg === msg)) return es;
        return [...es, { msg, src, t: Date.now() }];
      });
    };
    const onError = (e) => push(
      String(e?.message || e?.error?.message || e?.error || 'unknown error'),
      `${e?.filename || ''}:${e?.lineno || ''}:${e?.colno || ''}`.replace(/^::$/, '')
    );
    const onRejection = (e) => push(
      String(e?.reason?.message || e?.reason || 'unhandled promise rejection'),
      'promise'
    );
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  if (errors.length === 0) return null;
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, padding: 8, background: '#7f1d1d', color: '#fef2f2', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.4, maxHeight: '40vh', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontWeight: 'bold', letterSpacing: '0.2em' }}>⚠ JS ERROR · {errors.length}</span>
        <button onClick={() => setErrors([])}
          style={{ background: 'transparent', border: '1px solid #fef2f2', color: '#fef2f2', padding: '2px 6px', fontFamily: 'monospace', fontSize: 10, cursor: 'pointer' }}>
          dismiss
        </button>
      </div>
      {errors.map((e, i) => (
        <div key={i} style={{ borderTop: i > 0 ? '1px solid #991b1b' : 'none', paddingTop: i > 0 ? 4 : 0, marginTop: i > 0 ? 4 : 0 }}>
          <div style={{ wordBreak: 'break-word' }}>{e.msg}</div>
          {e.src && <div style={{ opacity: 0.6, fontSize: 10 }}>{e.src}</div>}
        </div>
      ))}
    </div>
  );
};

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
    // Errors thrown by a scene's draw fn are caught so one bad scene can't
    // crash the whole canvas loop, but we surface each unique error to the
    // dev console once instead of swallowing 60 of them per second.
    const seenSceneErrors = new Set();
    const loop = () => {
      fc++;
      ctx.save();
      ctx.scale(scale, scale);
      ctx.fillStyle = '#0c0a09';
      ctx.fillRect(0, 0, w, h);
      try {
        draw(ctx, fc);
      } catch (e) {
        const key = (e && e.message) || String(e);
        if (!seenSceneErrors.has(key)) {
          seenSceneErrors.add(key);
          console.error('PixelScene draw threw:', e);
        }
      }
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
  const [settings] = useSettings();
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
  // Fast-dialogue mode: auto-advance after a short hold so the player can
  // skim through long beats without tapping. Tap still advances early.
  useEffect(() => {
    if (!settings.fastDialogue) return;
    const id = setTimeout(advance, 2000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beatIdx, lineIdx, settings.fastDialogue, isFinal]);
  const fade = settings.reducedMotion ? 'none' : 'cutFade 0.5s ease-out';
  const lineFade = settings.reducedMotion ? 'none' : 'cutFade 0.4s ease-out';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5"
      style={{ background: 'radial-gradient(circle at center, #1c1917 0%, #0c0a09 100%)' }}>
      <button onClick={onComplete}
        className="absolute top-4 right-4 text-stone-500 text-[10px] uppercase tracking-widest hover:text-amber-500 px-2 py-1">
        Skip →
      </button>
      <div className="max-w-md w-full space-y-4">
        {beat?.drawScene && (
          <div key={beatIdx} style={{ animation: fade }}>
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
          style={{ fontFamily: '"Oswald", "Bebas Neue", sans-serif', fontWeight: 300, letterSpacing: '0.02em', animation: lineFade }}>
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

// ============ MESSAGES PANEL ============
// Full-screen modal that shows the inbox. Newest first. Tapping a message
// marks it read.

const MessagesPanel = ({ char, setChar, onClose }) => {
  const messages = [...(char.messages || [])].reverse(); // newest first
  // Mark all as read on view (so badge clears once you open)
  useEffect(() => {
    if ((char.messages || []).some(m => !m.read)) {
      setChar(c => ({ ...c, messages: (c.messages || []).map(m => ({ ...m, read: true })) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Format "x minutes ago" / "today" / "Day N" relative to current
  const formatStamp = (m) => {
    const dayDelta = char.day - m.day;
    if (dayDelta === 0) return 'TODAY';
    if (dayDelta === 1) return 'YESTERDAY';
    if (dayDelta < 7) return `${dayDelta} DAYS AGO`;
    return `DAY ${m.day}`;
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3"
      style={{ background: 'rgba(12, 10, 9, 0.90)' }}>
      <div className="max-w-md w-full max-h-full overflow-y-auto bg-stone-950 border-2 border-stone-800">
        {/* Header */}
        <div className="sticky top-0 bg-stone-950 border-b-2 border-stone-800 px-3 py-2 flex items-center justify-between">
          <div>
            <div className="text-amber-500 text-xl tracking-widest"
              style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
              MESSAGES
            </div>
            <div className="text-[9px] uppercase tracking-[0.3em] text-stone-500">
              {messages.length} total
            </div>
          </div>
          <button onClick={onClose}
            className="text-stone-500 hover:text-amber-500 text-2xl px-3 py-1">
            ×
          </button>
        </div>
        {/* List */}
        {messages.length === 0 ? (
          <div className="p-8 text-center text-stone-500 text-sm">
            <div className="text-4xl mb-2 opacity-40">📭</div>
            no messages yet.
            <div className="text-[10px] uppercase tracking-widest mt-2 text-stone-700">
              your phone is quiet
            </div>
          </div>
        ) : (
          <div className="divide-y divide-stone-900">
            {messages.map(m => {
              const meta = SENDER_META[m.sender] || SENDER_META.unknown;
              return (
                <div key={m.id} className="px-3 py-2">
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-[11px] tracking-[0.3em] font-bold"
                      style={{ color: meta.color, fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
                      {meta.display}
                    </span>
                    <span className="text-[9px] uppercase tracking-widest text-stone-600">
                      · {formatStamp(m)}
                    </span>
                  </div>
                  <div className="text-stone-300 text-sm leading-snug"
                    style={{ fontFamily: '"Oswald", sans-serif', fontWeight: 300 }}>
                    {m.text}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ============ FOXY UI COMPONENTS ============
// Small avatar canvas showing just Foxy's face — used in the home-screen
// panel and the modal. drawFoxy lives later in the file (intro scenes
// section) but is already declared by the time these components render.

const FoxyAvatar = ({ size = 36, animate = true }) => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = 24, H = 24;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    let raf, fc = 0;
    const loop = () => {
      fc++;
      ctx.save();
      ctx.scale(size / W, size / H);
      ctx.fillStyle = '#1a3018';
      ctx.fillRect(0, 0, W, H);
      // A subtle radial glow
      ctx.fillStyle = 'rgba(132, 204, 22, 0.12)';
      ctx.beginPath(); ctx.arc(12, 12, 14, 0, Math.PI * 2); ctx.fill();
      // Foxy head only — copy the relevant pixels from drawFoxy at a fixed origin
      const x = 12, y = 22;
      // Head
      _px(ctx, x - 4, y - 17, 8, 7, '#e0b890');
      // Hair
      _px(ctx, x - 5, y - 19, 10, 3, '#7a3a20');
      _px(ctx, x - 5, y - 16, 1, 3, '#7a3a20');
      _px(ctx, x + 4, y - 16, 1, 3, '#7a3a20');
      // Eyes
      _px(ctx, x - 3, y - 14, 2, 1, '#3a2010');
      _px(ctx, x + 1, y - 14, 2, 1, '#3a2010');
      // Mouth
      _px(ctx, x - 1, y - 11, 3, 1, '#5a2020');
      // Earring sparkle (animated)
      _px(ctx, x + 4, y - 13, 1, 1, '#fbbf24');
      if (animate && fc % 90 < 4) _px(ctx, x + 4, y - 13, 1, 1, '#fef3c7');
      // Sweater shoulder peek
      _px(ctx, x - 5, y - 10, 10, 4, '#5a8030');
      _px(ctx, x - 5, y - 10, 10, 1, '#7aa040');
      ctx.restore();
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [size, animate]);
  return <canvas ref={canvasRef} style={{ imageRendering: 'pixelated', width: size, height: size, display: 'block' }} />;
};

// FoxyModal — tap-to-open interaction. Shows a bigger Foxy portrait, a
// stack of recent quips, and a "wave hi" action that gives a small mood
// boost (cooldown: once per in-game day).
const FoxyModal = ({ char, setChar, showToast, onClose }) => {
  // Three tips for this visit — top-priority context tip + 2 flavor quips.
  // Stable while the modal is open.
  const quipsRef = useRef(null);
  if (!quipsRef.current) quipsRef.current = pickFoxyTipsForModal(char, 3);
  const lastWaveDay = char.storyFlags?.lastFoxyWaveDay || 0;
  const canWave = (char.day - lastWaveDay) >= 1 || lastWaveDay === 0;
  const wave = () => {
    if (!canWave) return;
    setChar(c => ({
      ...c,
      mood: Math.min(100, (c.mood || 0) + 2),
      storyFlags: { ...(c.storyFlags || {}), lastFoxyWaveDay: c.day },
      daily: { ...(c.daily || {}), foxyHi: (c.daily?.foxyHi || 0) + 1 },
    }));
    showToast?.('Foxy waved back. +2 mood', 'info');
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3"
      style={{ background: 'rgba(12, 10, 9, 0.85)' }}>
      <div className="max-w-md w-full bg-stone-950 border-2 border-stone-800">
        <div className="border-b-2 border-stone-800 px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FoxyAvatar size={48} />
            <div>
              <div className="text-lime-500 text-xl tracking-widest"
                style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>FOXY</div>
              <div className="text-[9px] uppercase tracking-[0.3em] text-stone-500">roommate · they/them</div>
            </div>
          </div>
          <button onClick={onClose}
            className="text-stone-500 hover:text-amber-500 text-2xl px-3 py-1">×</button>
        </div>
        <div className="px-3 py-3 space-y-2">
          {quipsRef.current.map((q, i) => (
            <div key={i} className="text-stone-300 text-sm italic leading-snug"
              style={{ fontFamily: '"Oswald", sans-serif', fontWeight: 300 }}>
              "{q}"
            </div>
          ))}
        </div>
        <div className="border-t-2 border-stone-800 p-3 space-y-2">
          <button onClick={wave} disabled={!canWave}
            className={`w-full py-2 border-2 text-xs uppercase tracking-widest transition-all ${
              canWave ? 'border-lime-500 text-lime-500 hover:bg-lime-500/10'
                       : 'border-stone-800 text-stone-600 cursor-not-allowed'
            }`}>
            {canWave ? '👋 say hi to Foxy  ·  +2 mood' : 'already said hi today'}
          </button>
          {/* One-time $15 loan when you're really broke. */}
          {(char.cash || 0) < 5 && !char.foxyLoanTaken && (
            <button onClick={() => {
              setChar(c => {
                if (c.foxyLoanTaken || (c.cash || 0) >= 5) return c;
                let next = { ...c, cash: (c.cash || 0) + 15, foxyLoanTaken: true,
                             mood: Math.min(100, (c.mood || 0) + 3) };
                next = addMessage(next, 'foxy', "this is a one-time thing. go busk in the park. seriously.");
                return next;
              });
              showToast?.('Foxy lent you $15. Go busk.', 'win');
              onClose();
            }}
              className="w-full py-2 border-2 border-amber-500 text-amber-500 text-xs uppercase tracking-widest hover:bg-amber-500/10 transition-all">
              💸 ask Foxy for $15  ·  one-time
            </button>
          )}
          {char.foxyLoanTaken && (char.cash || 0) < 5 && (
            <div className="text-[10px] uppercase tracking-widest text-stone-600 text-center">
              you already borrowed once. busk in the park.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============ ACHIEVEMENTS PANEL ============
// Hidden developer mode panel. Triple-tap the day-of-week badge in the
// header → enter passcode (808) → this opens. Lets the developer skip
// ahead to specific days of the week, set the time, edit cash/energy/etc
// without grinding the live game loop.
const DevPanel = ({ char, setChar, onClose, onLock }) => {
  if (!char) return null;
  const setDow = (target) => {
    // Day-of-week formula: dayOfWeek(d) = d % 7. Move forward to nearest match.
    const cur = (char.day || 1) % 7;
    let delta = (target - cur + 7) % 7;
    if (delta === 0) delta = 7; // tap-same-day = jump a week forward
    setChar(c => ({ ...c, day: (c.day || 1) + delta, minutes: 0 }));
  };
  const bumpDay = (n) => setChar(c => ({ ...c, day: Math.max(1, (c.day || 1) + n) }));
  const setMinutes = (m) => setChar(c => ({ ...c, minutes: Math.max(0, Math.min(DAY_END - 30, m)) }));
  const setCash = (n) => setChar(c => ({ ...c, cash: Math.max(0, n) }));
  const fullRestore = () => setChar(c => ({
    ...c,
    energy: c.maxEnergy ?? 100,
    hunger: 100,
    mood: 100,
  }));
  const bumpFollowers = (n) => setChar(c => ({ ...c, followers: Math.max(0, (c.followers || 0) + n) }));
  const bumpStat = (key, n) => setChar(c => ({
    ...c,
    stats: { ...(c.stats || {}), [key]: Math.max(0, Math.min(100, ((c.stats?.[key]) || 0) + n)) },
  }));
  const minutesToHHMM = (mins) => {
    const t = ((mins || 0) + 6 * 60);  // day starts at 6 AM
    const h = Math.floor((t / 60) % 24);
    const m = (t % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/85 backdrop-blur-sm p-3"
      onClick={onClose}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-stone-950 border-2 border-amber-500/50 p-3 space-y-3"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: '0 0 32px rgba(212,160,23,0.18)' }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-amber-400 text-base tracking-widest uppercase" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>⚡ DEV PANEL</div>
            <div className="text-[10px] text-stone-500 uppercase tracking-widest">Hidden — triple-tap day badge to reopen</div>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-amber-500 text-lg leading-none px-2">×</button>
        </div>

        <Panel title={`Day ${char.day} · ${DAY_NAMES[dayOfWeek(char.day)]} · ${minutesToHHMM(char.minutes)}`}>
          <div className="space-y-2">
            <div className="text-[9px] uppercase tracking-widest text-stone-500">Jump to next…</div>
            <div className="grid grid-cols-7 gap-1">
              {DAY_NAMES_SHORT.map((n, i) => {
                const cur = dayOfWeek(char.day) === i;
                return (
                  <button key={n} onClick={() => setDow(i)}
                    className={`py-1.5 border-2 text-[10px] uppercase tracking-widest transition-all ${cur
                      ? 'border-amber-500 bg-amber-500/15 text-amber-500'
                      : 'border-stone-800 bg-stone-900/40 text-stone-300 hover:border-amber-500/40'}`}>
                    {n}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-4 gap-1 pt-1">
              <button onClick={() => bumpDay(-7)} className="py-1.5 border border-stone-800 bg-stone-900/40 text-stone-300 text-[10px] uppercase tracking-widest hover:border-amber-500/40">−7d</button>
              <button onClick={() => bumpDay(-1)} className="py-1.5 border border-stone-800 bg-stone-900/40 text-stone-300 text-[10px] uppercase tracking-widest hover:border-amber-500/40">−1d</button>
              <button onClick={() => bumpDay(+1)} className="py-1.5 border border-stone-800 bg-stone-900/40 text-stone-300 text-[10px] uppercase tracking-widest hover:border-amber-500/40">+1d</button>
              <button onClick={() => bumpDay(+7)} className="py-1.5 border border-stone-800 bg-stone-900/40 text-stone-300 text-[10px] uppercase tracking-widest hover:border-amber-500/40">+7d</button>
            </div>
          </div>
        </Panel>

        <Panel title={`Time of day · ${minutesToHHMM(char.minutes)}`}>
          <div className="space-y-2">
            <input type="range" min={0} max={DAY_END - 30} step={30}
              value={char.minutes || 0}
              onChange={(e) => setMinutes(Number(e.target.value))}
              className="w-full" />
            <div className="grid grid-cols-4 gap-1">
              {[
                { label: '06:00', m: 0 },
                { label: '12:00', m: 6 * 60 },
                { label: '18:00', m: 12 * 60 },
                { label: '23:00', m: 17 * 60 },
              ].map(p => (
                <button key={p.label} onClick={() => setMinutes(p.m)}
                  className="py-1.5 border border-stone-800 bg-stone-900/40 text-stone-300 text-[10px] uppercase tracking-widest hover:border-amber-500/40">
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title={`Cash · $${char.cash || 0}`}>
          <div className="grid grid-cols-4 gap-1">
            {[
              { label: '+$50', d: 50 },
              { label: '+$500', d: 500 },
              { label: '+$5k', d: 5000 },
              { label: '$0', set: 0 },
            ].map(p => (
              <button key={p.label}
                onClick={() => p.set != null ? setCash(p.set) : setCash((char.cash || 0) + p.d)}
                className="py-1.5 border border-stone-800 bg-stone-900/40 text-stone-300 text-[10px] uppercase tracking-widest hover:border-amber-500/40">
                {p.label}
              </button>
            ))}
          </div>
        </Panel>

        <Panel title={`Stats · ${char.followers || 0} fans · LVL ${char.level}`}>
          <div className="grid grid-cols-2 gap-1">
            <button onClick={fullRestore}
              className="py-1.5 border border-amber-500/40 bg-amber-500/10 text-amber-300 text-[10px] uppercase tracking-widest hover:border-amber-500">
              ⚡ Full restore
            </button>
            <button onClick={() => bumpFollowers(50)}
              className="py-1.5 border border-stone-800 bg-stone-900/40 text-stone-300 text-[10px] uppercase tracking-widest hover:border-amber-500/40">
              +50 fans
            </button>
            <button onClick={() => bumpFollowers(500)}
              className="py-1.5 border border-stone-800 bg-stone-900/40 text-stone-300 text-[10px] uppercase tracking-widest hover:border-amber-500/40">
              +500 fans
            </button>
            <button onClick={() => setChar(c => ({ ...c, xp: ((c.level || 1) * 100) }))}
              className="py-1.5 border border-stone-800 bg-stone-900/40 text-stone-300 text-[10px] uppercase tracking-widest hover:border-amber-500/40">
              Fill XP bar
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1 mt-1">
            {['mus', 'tec', 'ori', 'sho'].map(k => (
              <button key={k} onClick={() => bumpStat(k, 5)}
                className="py-1.5 border border-stone-800 bg-stone-900/40 text-stone-300 text-[10px] uppercase tracking-widest hover:border-amber-500/40">
                +5 {k.toUpperCase()}
              </button>
            ))}
          </div>
        </Panel>

        <button onClick={onLock}
          className="w-full py-2 border-2 border-stone-800 bg-stone-900/40 text-stone-500 text-[10px] uppercase tracking-widest hover:border-red-500/50 hover:text-red-400 transition-all">
          🔒 Lock dev mode (forget code)
        </button>
      </div>
    </div>
  );
};

// Player-facing options. Persists to localStorage via the module-level
// settings system above so it survives slot switches and reloads.
const SettingsModal = ({ onClose }) => {
  const [settings, update] = useSettings();
  const Row = ({ k, label, desc }) => (
    <label className="flex items-start gap-3 p-2 border-2 border-stone-800 bg-stone-900/30 cursor-pointer hover:border-stone-700 transition-all">
      <input
        type="checkbox"
        checked={!!settings[k]}
        onChange={(e) => update({ [k]: e.target.checked })}
        className="mt-0.5"
      />
      <div className="flex-1">
        <div className="text-stone-200 text-xs uppercase tracking-widest"
          style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
          {label}
        </div>
        <div className="text-[10px] text-stone-500 uppercase tracking-wider mt-0.5 leading-snug">
          {desc}
        </div>
      </div>
    </label>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/85 backdrop-blur-sm p-3"
      onClick={onClose}>
      <div className="w-full max-w-md bg-stone-950 border-2 border-stone-700 p-3 space-y-3"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="text-amber-500 text-base tracking-widest uppercase"
            style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
            ⚙ SETTINGS
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-amber-500 text-lg leading-none px-2">×</button>
        </div>
        <div className="space-y-1.5">
          <Row k="muted"         label="Mute audio"      desc="Silence every game sound — beats, stings, sleep rooster, the lot." />
          <Row k="reducedMotion" label="Reduce motion"   desc="Skip the cutscene fade and the achievement modal pop-in." />
          <Row k="fastDialogue"  label="Fast dialogue"   desc="Cutscene lines auto-advance after ~2s. Still tappable." />
        </div>
        <div className="text-[10px] uppercase tracking-widest text-stone-600 text-center pt-1 border-t border-stone-900">
          Preferences are saved on this device.
        </div>
      </div>
    </div>
  );
};

// Achievement unlock fanfare — a small celebratory modal that pops when a
// new achievement fires. Auto-dismisses after a short hold; tap anywhere
// to dismiss earlier. Respects reduced-motion (no scale-in animation).
const AchievementFanfare = ({ item, onClose }) => {
  const [settings] = useSettings();
  const reduce = settings.reducedMotion;
  const tierColor = (TIER_COLOR && TIER_COLOR[item.tier]) || '#fbbf24';
  useEffect(() => {
    const id = setTimeout(onClose, 3000);
    return () => clearTimeout(id);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3"
      style={{ background: 'rgba(12,10,9,0.78)' }}
      onClick={onClose}>
      <div className="w-full max-w-sm p-4 text-center border-2"
        style={{
          borderColor: tierColor,
          background: 'linear-gradient(180deg, rgba(28,25,23,0.95), rgba(12,10,9,0.95))',
          boxShadow: `0 0 28px ${tierColor}44`,
          animation: reduce ? 'none' : 'achPop 0.5s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}>
        <div className="text-[10px] uppercase tracking-[0.4em] mb-1" style={{ color: tierColor }}>
          Achievement Unlocked
        </div>
        <div className="text-5xl mb-2">🏆</div>
        <div className="text-stone-100 text-xl tracking-wider mb-1"
          style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
          {item.label}
        </div>
        <div className="text-[11px] text-stone-400 leading-snug px-2">
          {item.desc}
        </div>
        <button onClick={onClose}
          className="mt-3 px-4 py-1.5 text-[10px] uppercase tracking-widest border-2 text-stone-300 hover:text-amber-300"
          style={{ borderColor: tierColor }}>
          Nice
        </button>
      </div>
      <style>{`
        @keyframes achPop {
          0% { transform: scale(0.6); opacity: 0; }
          60% { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

const AchievementsPanel = ({ char, onClose, devUnlocked = false, onDevUnlock = null, onOpenDevPanel = null }) => {
  // Backup entry to dev mode — type "808" here if the triple-tap gesture isn't
  // working on this device. Hidden visually so casual players don't poke it.
  const [devCodeInput, setDevCodeInput] = useState('');
  const [devCodeBad, setDevCodeBad] = useState(false);
  const submitDevCode = () => {
    if (!onDevUnlock) return;
    const ok = onDevUnlock(devCodeInput);
    if (!ok) {
      setDevCodeBad(true);
      setTimeout(() => setDevCodeBad(false), 800);
    } else {
      setDevCodeInput('');
    }
  };
  const earned = ACHIEVEMENTS.filter(a => char.achievements?.[a.id]);
  const locked = ACHIEVEMENTS.filter(a => !char.achievements?.[a.id]);
  const Row = ({ a, isEarned }) => {
    const c = TIER_COLOR[a.tier] || '#a8a29e';
    return (
      <div className={`p-2 border bg-stone-900/30 ${isEarned ? 'border-stone-800' : 'border-stone-900 opacity-60'}`}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-lg">{isEarned ? '🏆' : '🔒'}</span>
            <span className="text-sm" style={{ color: isEarned ? c : '#5a5046', fontFamily: '"Bebas Neue", "Oswald", sans-serif', letterSpacing: 1 }}>
              {a.label.toUpperCase()}
            </span>
          </div>
          {isEarned && <span className="text-[9px] uppercase tracking-widest text-stone-600">day {char.achievements[a.id]}</span>}
        </div>
        <div className="text-[10px] text-stone-500 uppercase tracking-wider">{a.desc}</div>
      </div>
    );
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: 'rgba(12, 10, 9, 0.90)' }}>
      <div className="max-w-md w-full max-h-full overflow-y-auto bg-stone-950 border-2 border-stone-800">
        <div className="sticky top-0 bg-stone-950 border-b-2 border-stone-800 px-3 py-2 flex items-center justify-between">
          <div>
            <div className="text-amber-500 text-xl tracking-widest" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
              ACHIEVEMENTS
            </div>
            <div className="text-[9px] uppercase tracking-[0.3em] text-stone-500">
              {earned.length}/{ACHIEVEMENTS.length} unlocked
            </div>
          </div>
          <button onClick={onClose} className="text-stone-500 hover:text-amber-500 text-2xl px-3 py-1">×</button>
        </div>
        <div className="p-3 space-y-2">
          {earned.map(a => <Row key={a.id} a={a} isEarned />)}
          {earned.length > 0 && locked.length > 0 && <div className="border-t border-stone-900 my-1" />}
          {locked.map(a => <Row key={a.id} a={a} isEarned={false} />)}
          {/* Dev backdoor — if the triple-tap on the day chip won't fire on
              your device, type the code here. Already-unlocked sessions get
              a direct shortcut into the panel. */}
          <div className="border-t border-stone-900 mt-3 pt-3">
            {devUnlocked ? (
              <button onClick={() => { onOpenDevPanel?.(); }}
                className="w-full py-2 border border-amber-500/40 bg-amber-500/10 text-amber-300 text-[10px] uppercase tracking-widest hover:border-amber-500 transition-all">
                ⚡ Open dev panel
              </button>
            ) : (
              <div className="space-y-1.5">
                <div className="text-[9px] uppercase tracking-[0.3em] text-stone-700 text-center">— hidden —</div>
                <div className="flex gap-1">
                  <input
                    type="password"
                    value={devCodeInput}
                    onChange={(e) => setDevCodeInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submitDevCode(); }}
                    placeholder="code"
                    className={`flex-1 px-2 py-1.5 bg-stone-900 border-2 text-stone-300 text-[10px] uppercase tracking-widest font-mono outline-none ${devCodeBad ? 'border-red-700' : 'border-stone-800 focus:border-amber-500/40'}`}
                    style={{ animation: devCodeBad ? 'shake 0.4s' : 'none' }}
                  />
                  <button onClick={submitDevCode}
                    className="px-3 py-1.5 border-2 border-stone-800 bg-stone-900/40 text-stone-500 text-[10px] uppercase tracking-widest hover:border-amber-500/40">
                    Enter
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <style>{`@keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-4px)} 40%{transform:translateX(4px)} 60%{transform:translateX(-3px)} 80%{transform:translateX(3px)} }`}</style>
      </div>
    </div>
  );
};

// ============ MINGLE ENCOUNTER MODAL ============
// Single-beat dialogue UI: opener → reply choice → response. Applies the
// chosen option's effects (mood / followers / cash / story flags / romance
// affinity) on close. The whole conversation costs 30 game minutes + 6
// energy regardless of outcome.

const MingleEncounter = ({ char, setChar, encounter, showToast, onClose }) => {
  const [picked, setPicked] = useState(null); // selected reply option (or null)
  // Stable random beat per mount — encounters can carry multiple beats and
  // we pick one at random so each meeting feels fresh.
  const beatRef = useRef(null);
  if (!beatRef.current) {
    beatRef.current = encounter.beats[Math.floor(Math.random() * encounter.beats.length)];
  }
  const beat = beatRef.current;
  const speaker = beat.speaker;
  // Use the encounter's `look` if defined (for named NPCs like Pig Pen,
  // Crystix, sponsors); otherwise randomise a generic stranger.
  const lookRef = useRef(null);
  if (!lookRef.current) {
    if (encounter.look) {
      lookRef.current = encounter.look;
    } else {
      const shirts = ['#a04040','#5a7050','#a06030','#4060a0','#a06090','#7a3a40','#5a3a18','#3a5a6a'];
      const hairs = ['#1a1a2e','#3a2410','#5a2010','#7a3a20','#dadada'];
      const skins = ['#d4a87a','#a87844','#e0b890','#7a5040'];
      lookRef.current = {
        shirt: speaker?.color || shirts[Math.floor(Math.random() * shirts.length)],
        skin:  skins[Math.floor(Math.random() * skins.length)],
        hair:  hairs[Math.floor(Math.random() * hairs.length)],
      };
    }
  }
  const finish = () => {
    if (!picked) return;
    setChar(c => {
      let next = applyMingleEffects(c, picked.outcome.effects, picked.outcome);
      // 30 min at the bar — bump time + apply passive mood decay
      const t = passMinutes(c, 30);
      next.minutes = t.minutes;
      next.energy = Math.max(0, (next.energy || 0) - 6);
      next.mood = _clampPct(t.mood + (next.mood - (c.mood || 0)));
      next.mingleCount = (c.mingleCount || 0) + 1;
      next.daily = { ...(c.daily || {}), mingles: (c.daily?.mingles || 0) + 1 };
      next.metEncounters = { ...(c.metEncounters || {}),
        [encounter.id]: ((c.metEncounters || {})[encounter.id] || 0) + 1 };
      return next;
    });
    // Toast when a date gets scheduled or someone becomes a couple
    if (picked.outcome.bookDate) {
      const bd = picked.outcome.bookDate;
      const dayName = DAY_NAMES_SHORT[((char.day || 1) + (bd.daysAhead || 2)) % 7];
      const m = bd.minute || 600;
      const hh = String(Math.floor(((m + 360) / 60) % 24)).padStart(2, '0');
      const mm = String(Math.floor((m + 360) % 60)).padStart(2, '0');
      showToast?.(`Date with ${bd.partnerName}: ${dayName} ${hh}:${mm} · park`, 'win');
    } else if (picked.outcome.effects?.affinity) {
      // Detect promotion to couple
      for (const [id, delta] of Object.entries(picked.outcome.effects.affinity)) {
        const newAff = (char.romanceAffinity?.[id] || 0) + delta;
        const oldState = char.romanceState?.[id] || 'building';
        if (newAff >= 10 && oldState !== 'couple') {
          showToast?.(`You and ${id.toUpperCase()} are a couple now ❤️`, 'win');
          break;
        } else if (newAff >= 5 && oldState === 'building') {
          showToast?.(`Things with ${id.toUpperCase()} are getting real`, 'win');
          break;
        }
      }
    }
    onClose?.();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3"
      style={{ background: 'radial-gradient(circle at center, #1c1917 0%, #0c0a09 100%)' }}>
      <div className="max-w-md w-full bg-stone-950 border-2 border-stone-800">
        {/* Pixel-art bar interior + stranger silhouette */}
        <PixelScene draw={(ctx, fc) => drawMingleScene(ctx, fc, lookRef.current, encounter)} />
        {/* Speaker name */}
        <div className="px-3 pt-3">
          <div className="text-[11px] uppercase tracking-[0.4em] mb-1"
            style={{ color: speaker.color, fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
            {speaker.name}
          </div>
          <div className="text-stone-100 text-base leading-snug min-h-[2em]"
            style={{ fontFamily: '"Oswald", sans-serif', fontWeight: 300 }}>
            "{beat.line}"
          </div>
        </div>
        {/* Reply options or response */}
        <div className="p-3 space-y-2">
          {!picked ? (
            beat.options.map((opt, i) => (
              <button key={i} onClick={() => setPicked(opt)}
                className="w-full text-left px-3 py-2 border-2 border-stone-800 hover:border-amber-500/50 bg-stone-900/40 transition-all">
                <span className="text-stone-300 text-sm" style={{ fontFamily: '"Oswald", sans-serif' }}>
                  → {opt.text}
                </span>
              </button>
            ))
          ) : (
            <>
              <div className="px-3 py-2 border-2 border-amber-500/40 bg-amber-500/5">
                <div className="text-[9px] uppercase tracking-widest text-amber-500/60 mb-1">you said</div>
                <div className="text-stone-300 text-sm italic"
                  style={{ fontFamily: '"Oswald", sans-serif' }}>"{picked.text}"</div>
              </div>
              {picked.outcome.line && (
                <div className="px-3 py-2 border-2 border-stone-800 bg-stone-900/40">
                  <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: speaker.color }}>
                    {speaker.name}
                  </div>
                  <div className="text-stone-100 text-base"
                    style={{ fontFamily: '"Oswald", sans-serif', fontWeight: 300 }}>
                    "{picked.outcome.line}"
                  </div>
                </div>
              )}
              {/* Tiny effects readout (only show what changed) */}
              {(() => {
                const e = picked.outcome.effects || {};
                const bits = [];
                if (e.mood)      bits.push(`${e.mood > 0 ? '+' : ''}${e.mood}♥`);
                if (e.energy)    bits.push(`${e.energy > 0 ? '+' : ''}${e.energy}⚡`);
                if (e.hunger)    bits.push(`${e.hunger > 0 ? '+' : ''}${e.hunger}🍴`);
                if (e.cash)      bits.push(`${e.cash > 0 ? '+' : ''}$${e.cash}`);
                if (e.followers) bits.push(`${e.followers > 0 ? '+' : ''}${e.followers} fans`);
                return bits.length ? (
                  <div className="text-[10px] uppercase tracking-widest text-amber-500 text-center pt-1">
                    {bits.join(' · ')}
                  </div>
                ) : null;
              })()}
              <Btn variant="primary" onClick={finish} className="w-full py-3 mt-2">
                LEAVE THE BAR CHATTER →
              </Btn>
            </>
          )}
        </div>
        {/* Cost reminder + skip-out */}
        <div className="px-3 pb-3 flex items-center justify-between text-[10px] uppercase tracking-widest text-stone-600">
          <span>+30 min · -6⚡</span>
          {!picked && (
            <button onClick={() => onClose?.()} className="hover:text-amber-500">leave →</button>
          )}
        </div>
      </div>
    </div>
  );
};

// ============ INTRO SCENE DRAWERS (pixel art) ============

const drawOffice = (ctx, fc) => {
  const W = 200, H = 130;
  // Wall (cool corporate gray)
  _px(ctx, 0, 0, W, 100, '#454e5e');
  // Wall trim
  _px(ctx, 0, 99, W, 1, '#2a2f3a');
  // Floor (carpet brown)
  _px(ctx, 0, 100, W, 30, '#2a2820');
  _px(ctx, 0, 100, W, 1, '#3a3328');
  // Big window on the right showing skyscrapers (nighttime corporate vibe)
  _px(ctx, 116, 8, 76, 50, '#5a7090');
  _px(ctx, 116, 8, 76, 1, '#1a1a1a');
  _px(ctx, 116, 58, 76, 1, '#1a1a1a');
  _px(ctx, 116, 8, 1, 50, '#1a1a1a');
  _px(ctx, 191, 8, 1, 50, '#1a1a1a');
  _px(ctx, 154, 8, 1, 50, '#1a1a1a');     // window divider
  // Skyline silhouettes inside window
  for (let i = 0; i < 8; i++) {
    const bx = 118 + i * 9, bh = 12 + (i % 3) * 8;
    _px(ctx, bx, 58 - bh, 8, bh, '#252a38');
    if ((fc + i) % 12 < 8) _px(ctx, bx + 3, 60 - bh, 1, 1, '#fef3c7');
    if ((fc + i * 3) % 18 < 12) _px(ctx, bx + 5, 56 - bh + 2, 1, 1, '#fbbf24');
  }
  // Wall clock (top-left) — late hour
  _px(ctx, 18, 14, 18, 18, '#dadada');
  _px(ctx, 18, 14, 18, 1, '#a8a29e');
  _px(ctx, 35, 14, 1, 18, '#a8a29e');
  // Tick marks
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const x = 27 + Math.cos(ang) * 7;
    const y = 23 + Math.sin(ang) * 7;
    _px(ctx, Math.round(x), Math.round(y), 1, 1, '#1c1917');
  }
  // Hour hand — pointing at 11 (late evening, just got fired)
  ctx.strokeStyle = '#1c1917';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(27, 23);
  ctx.lineTo(27 - 3, 23 - 4);
  ctx.stroke();
  // Minute hand
  ctx.beginPath();
  ctx.moveTo(27, 23);
  ctx.lineTo(27 + 5, 23 - 1);
  ctx.stroke();
  // "EXIT" sign over door (dim red)
  _px(ctx, 78, 4, 22, 10, '#7a1a14');
  _px(ctx, 78, 4, 22, 1, '#a02a20');
  ctx.fillStyle = '#fef3c7';
  ctx.font = 'bold 7px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('EXIT', 89, 12);
  // Cubicle wall divider
  _px(ctx, 60, 30, 4, 70, '#3a3a45');
  _px(ctx, 60, 30, 1, 70, '#5a5a65');
  // Desk (extends across)
  _px(ctx, 22, 76, 100, 5, '#7a5a40');
  _px(ctx, 22, 76, 100, 1, '#a07c50');
  _px(ctx, 22, 81, 100, 22, '#4a3a28');
  // Desk legs
  _px(ctx, 26, 103, 4, 6, '#2a1808');
  _px(ctx, 116, 103, 4, 6, '#2a1808');
  // Monitor on desk
  _px(ctx, 70, 50, 32, 26, '#0a0a0a');
  _px(ctx, 70, 50, 32, 1, '#3a3a3a');
  _px(ctx, 73, 53, 26, 20, '#0c1428');         // dark blue screen
  // Animated AI takeover content — pulse + scanlines
  const pulse = Math.floor(fc / 6) % 3;
  // Scanlines
  for (let y = 0; y < 20; y += 2) {
    ctx.globalAlpha = 0.20;
    _px(ctx, 73, 53 + y, 26, 1, '#22d3ee');
    ctx.globalAlpha = 1;
  }
  // Big AI logo (pulses size with frame)
  const aiSize = 11 + pulse;
  ctx.fillStyle = pulse === 2 ? '#ef4444' : '#22d3ee';
  ctx.font = `bold ${aiSize}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('AI', 86, 67 + Math.floor(pulse / 2));
  // Glowing eye/cursor below
  if (fc % 30 < 18) _px(ctx, 85, 70, 2, 1, '#22d3ee');
  // Monitor stand
  _px(ctx, 84, 75, 4, 3, '#1a1a1a');
  _px(ctx, 80, 76, 12, 1, '#1a1a1a');
  // Cardboard box on desk (packed up belongings)
  _px(ctx, 26, 64, 28, 12, '#a87844');
  _px(ctx, 26, 64, 28, 2, '#c89a64');         // top highlight
  _px(ctx, 26, 76, 28, 2, '#5a3a18');         // shadow
  _px(ctx, 38, 60, 4, 6, '#a87844');          // sticking-out item
  _px(ctx, 32, 62, 3, 4, '#fef3c7');          // paper
  _px(ctx, 47, 61, 5, 5, '#22c55e');          // plant leaf
  _px(ctx, 49, 58, 1, 4, '#22c55e');
  // "FIRED" pink slip on top of box (alternates with reveal)
  if (fc % 90 < 60) {
    _px(ctx, 26, 70, 12, 6, '#fbbf24');
    _px(ctx, 26, 70, 12, 1, '#fef3c7');
    ctx.fillStyle = '#7a1a14';
    ctx.font = 'bold 4px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FIRED', 32, 75);
  }
  // Empty chair pushed back (just been vacated)
  _px(ctx, 102, 92, 18, 4, '#3a2818');        // seat
  _px(ctx, 102, 96, 4, 14, '#3a2818');        // left leg
  _px(ctx, 116, 96, 4, 14, '#3a2818');        // right leg
  _px(ctx, 110, 80, 4, 13, '#3a2818');        // back support
  _px(ctx, 102, 78, 18, 5, '#5a4030');        // chair back
  _px(ctx, 102, 78, 18, 1, '#7a5a40');
  // Player figure: standing dejected to the left of desk, holding nothing
  // Feet at y=110
  _px(ctx, 132, 102, 4, 8, '#1a1a2e');         // left leg
  _px(ctx, 138, 102, 4, 8, '#1a1a2e');
  _px(ctx, 132, 109, 4, 1, '#fff');            // shoes
  _px(ctx, 138, 109, 4, 1, '#fff');
  _px(ctx, 130, 88, 12, 14, '#5a5a6a');        // body (gray suit)
  _px(ctx, 130, 88, 12, 1, '#fff');
  _px(ctx, 128, 90, 2, 12, '#5a5a6a');         // arms hanging
  _px(ctx, 142, 90, 2, 12, '#5a5a6a');
  _px(ctx, 128, 100, 2, 2, '#d4a87a');         // hands
  _px(ctx, 142, 100, 2, 2, '#d4a87a');
  _px(ctx, 132, 78, 8, 10, '#d4a87a');         // head
  _px(ctx, 132, 76, 8, 3, '#1a1a2e');          // hair
  _px(ctx, 134, 82, 1, 1, '#0c0a09');          // eyes
  _px(ctx, 138, 82, 1, 1, '#0c0a09');
  _px(ctx, 134, 86, 5, 1, '#3a1010');          // mouth (slight frown)
  // Lightning flash from monitor (rare AI-took-my-job vibe)
  if (fc % 90 < 4) {
    ctx.globalAlpha = 0.18;
    _px(ctx, 0, 0, W, 100, '#fef3c7');
    ctx.globalAlpha = 1;
  }
};

const drawBedroom = (ctx, fc) => {
  const W = 200, H = 130;
  // Wall and floor
  _px(ctx, 0, 0, W, 95, '#3a3540');
  _px(ctx, 0, 95, W, 1, '#5a5060');                    // wall trim
  _px(ctx, 0, 95, W, 35, '#3a2818');                   // wood floor
  for (let i = 0; i < 5; i++) _px(ctx, i * 40, 96, 1, 34, '#2a1a10');
  // Window with starfield (deep night)
  _px(ctx, 130, 15, 50, 45, '#0a0a14');
  _px(ctx, 130, 15, 50, 1, '#1a1a1a');
  _px(ctx, 130, 60, 50, 1, '#1a1a1a');
  _px(ctx, 130, 15, 1, 45, '#1a1a1a');
  _px(ctx, 179, 15, 1, 45, '#1a1a1a');
  _px(ctx, 154, 15, 1, 45, '#1a1a1a');
  // Curtains on the window
  _px(ctx, 124, 14, 6, 47, '#5a3a40');
  _px(ctx, 180, 14, 6, 47, '#5a3a40');
  _px(ctx, 124, 14, 6, 2, '#7a5a60');
  _px(ctx, 180, 14, 6, 2, '#7a5a60');
  // Stars
  for (let i = 0; i < 16; i++) {
    const sx = 132 + (i * 4) % 46;
    const sy = 18 + (i * 7) % 38;
    if ((fc + i * 5) % 60 < 50) _px(ctx, sx, sy, 1, 1, i % 3 === 0 ? '#fbbf24' : '#fef3c7');
  }
  // Crescent moon
  _px(ctx, 162, 22, 6, 6, '#fef3c7');
  _px(ctx, 164, 22, 4, 5, '#0a0a14');
  // Bed (left side) with pillow
  _px(ctx, 4, 95, 76, 25, '#a87844');                  // bed frame
  _px(ctx, 4, 95, 76, 2, '#c89a64');                   // top highlight
  _px(ctx, 4, 117, 76, 3, '#5a3a18');                  // bottom shadow
  _px(ctx, 8, 92, 24, 8, '#dac0a0');                   // pillow
  _px(ctx, 8, 92, 24, 1, '#fff');
  // Rumpled blanket on bed
  _px(ctx, 36, 100, 42, 12, '#3a4a6a');
  _px(ctx, 36, 100, 42, 1, '#5a6a8a');
  for (let i = 0; i < 4; i++) _px(ctx, 40 + i * 10, 102, 6, 1, '#5a6a8a');
  // Desk (right side, smaller)
  _px(ctx, 96, 80, 60, 4, '#7a5a40');
  _px(ctx, 96, 80, 60, 1, '#a07c50');
  _px(ctx, 96, 84, 60, 18, '#5a4030');
  _px(ctx, 100, 102, 4, 14, '#3a2410');
  _px(ctx, 148, 102, 4, 14, '#3a2410');
  // Desk lamp - cone shade
  _px(ctx, 104, 60, 12, 2, '#1a1a1a');                 // shade top
  _px(ctx, 104, 62, 12, 5, '#fbbf24');                 // shade glow
  _px(ctx, 109, 67, 2, 13, '#1a1a1a');                 // lamp neck
  _px(ctx, 105, 79, 10, 1, '#1a1a1a');                 // lamp base
  // Lamp light cone (animated)
  if (fc % 6 < 5) {
    ctx.fillStyle = 'rgba(254, 243, 199, 0.18)';
    ctx.beginPath();
    ctx.moveTo(108, 67);
    ctx.lineTo(112, 67);
    ctx.lineTo(126, 88);
    ctx.lineTo(96, 88);
    ctx.closePath();
    ctx.fill();
  }
  // ---- Budget sheet on desk under the lamp ----
  const sx = 100, sy = 80 - 11;                         // paper sticks up over the desk top a bit
  _px(ctx, sx, sy, 36, 14, '#f0e4c8');                  // paper
  _px(ctx, sx, sy, 36, 1, '#c0a070');
  _px(ctx, sx + 35, sy, 1, 14, '#c0a070');
  // Place the actual paper on the desk — keep it readable
  const px2 = 102, py2 = 84;
  _px(ctx, px2, py2, 32, 14, '#f0e4c8');                // paper (lying flat)
  _px(ctx, px2, py2, 32, 1, '#c0a070');
  _px(ctx, px2 + 31, py2, 1, 14, '#c0a070');
  ctx.font = 'bold 5px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#3a2818';
  ctx.fillText('RENT', px2 + 2, py2 + 5);
  ctx.fillText('FOOD', px2 + 2, py2 + 9);
  ctx.fillText('BAL',  px2 + 2, py2 + 14);
  ctx.fillStyle = (fc % 60 < 30) ? '#dc2626' : '#9a1a1a';
  ctx.textAlign = 'right';
  ctx.fillText('-800', px2 + 30, py2 + 5);
  ctx.fillText('-50',  px2 + 30, py2 + 9);
  ctx.fillText('-123', px2 + 30, py2 + 14);
  _px(ctx, px2 + 14, py2 + 11, 16, 1, '#3a2818');
  // Pencil on desk to the left of paper
  _px(ctx, 92, 90, 8, 1, '#fbbf24');
  _px(ctx, 91, 90, 1, 1, '#3a2818');
  _px(ctx, 100, 90, 2, 1, '#dc2626');
  // ---- Player slumped on the bed, head in hands ----
  const slump = Math.floor(fc / 60) % 2;                // tiny head bob (sigh)
  // Legs out in front
  _px(ctx, 36, 108, 22, 4, '#1a1a2e');                  // legs (pants)
  _px(ctx, 56, 108, 4, 4, '#fff');                      // foot
  // Body sitting upright
  _px(ctx, 30, 92, 14, 16, '#7a5a40');                  // shirt (warm tan)
  _px(ctx, 30, 92, 14, 2, '#a07a50');                   // shirt collar
  // Arms holding head
  _px(ctx, 26, 86, 4, 8, '#7a5a40');                    // left arm up
  _px(ctx, 44, 86, 4, 8, '#7a5a40');                    // right arm up
  _px(ctx, 26, 86, 4, 2, '#d4a87a');                    // left hand at temple
  _px(ctx, 44, 86, 4, 2, '#d4a87a');                    // right hand at temple
  // Head
  _px(ctx, 30, 80 + slump, 14, 12, '#d4a87a');
  _px(ctx, 30, 78 + slump, 14, 3, '#1a1a2e');           // hair
  // Closed sad eyes
  _px(ctx, 33, 84 + slump, 2, 1, '#0c0a09');
  _px(ctx, 39, 84 + slump, 2, 1, '#0c0a09');
  // Frown
  _px(ctx, 34, 88 + slump, 6, 1, '#3a1010');
  // Small empty wallet on floor in front of bed
  _px(ctx, 64, 116, 14, 4, '#5a3a18');
  _px(ctx, 64, 116, 14, 1, '#7a5a30');
  _px(ctx, 70, 117, 2, 2, '#fbbf24');                   // last coin?
};

const drawPhone = (ctx, fc) => {
  const W = 200, H = 130;
  // Dim hand-holds-phone-in-bedroom backdrop
  _px(ctx, 0, 0, W, H, '#0a0a14');
  // Subtle dust motes
  for (let i = 0; i < 26; i++) {
    const x = (i * 17 + 5) % W;
    const y = (i * 13 + 3) % H;
    _px(ctx, x, y, 1, 1, '#1c1c2a');
  }
  // Hand holding phone (left hand at bottom)
  _px(ctx, 60, 110, 14, 20, '#d4a87a');
  _px(ctx, 60, 110, 14, 2, '#e4b88a');
  _px(ctx, 56, 116, 4, 10, '#d4a87a');                  // thumb
  _px(ctx, 56, 116, 4, 2, '#e4b88a');
  // Phone body (vertical)
  _px(ctx, 64, 14, 72, 110, '#1a1a1a');
  _px(ctx, 64, 14, 72, 2, '#3a3a3a');
  _px(ctx, 64, 122, 72, 2, '#0a0a0a');
  _px(ctx, 64, 14, 2, 110, '#3a3a3a');                  // left edge highlight
  _px(ctx, 134, 14, 2, 110, '#0a0a0a');                 // right edge shadow
  // Camera notch top
  _px(ctx, 96, 16, 8, 3, '#0a0a0a');
  _px(ctx, 99, 17, 2, 1, '#222');
  // Screen interior
  const sx = 68, sy = 22, sw = 64, sh = 96;
  _px(ctx, sx, sy, sw, sh, '#0c0a18');
  // Status bar
  _px(ctx, sx, sy, sw, 6, '#16142a');
  ctx.fillStyle = '#a89060';
  ctx.font = 'bold 4px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('11:42PM', sx + 2, sy + 5);
  ctx.textAlign = 'right';
  ctx.fillText('3%', sx + sw - 2, sy + 5);              // dying battery
  // Profile header (your account)
  _px(ctx, sx + 4, sy + 9, 12, 12, '#5a3a40');
  _px(ctx, sx + 5, sy + 10, 10, 10, '#a87844');         // avatar circle (you)
  _px(ctx, sx + 7, sy + 12, 6, 5, '#d4a87a');           // face
  _px(ctx, sx + 7, sy + 11, 6, 2, '#1a1a2e');           // hair
  // Name + handle
  ctx.fillStyle = '#fef3c7';
  ctx.font = 'bold 5px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('@you', sx + 19, sy + 14);
  ctx.fillStyle = '#5a5a6a';
  ctx.font = '4px monospace';
  ctx.fillText('beatboxer · home', sx + 19, sy + 19);
  // Big follower count "312"
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('312', sx + sw / 2, sy + 36);
  ctx.fillStyle = '#a89060';
  ctx.font = 'bold 5px monospace';
  ctx.fillText('FOLLOWERS', sx + sw / 2, sy + 43);
  // "half of them bots" — show a row of generic gray avatars with BOT tags
  const botRow = sy + 50;
  for (let i = 0; i < 5; i++) {
    const bx = sx + 4 + i * 12;
    _px(ctx, bx, botRow, 8, 8, '#3a3a45');              // avatar circle bg
    _px(ctx, bx + 1, botRow + 1, 6, 6, '#5a5a6a');      // face placeholder
    // Bot mark (animated occasional flag)
    if ((fc + i * 3) % 30 < 20 && i % 2 === 0) {
      _px(ctx, bx + 5, botRow - 1, 4, 3, '#dc2626');
      ctx.fillStyle = '#fef3c7';
      ctx.font = 'bold 3px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('BOT', bx + 7, botRow + 1);
    }
  }
  // Latest post: waveform card (a beatbox video)
  const cardY = sy + 64;
  _px(ctx, sx + 4, cardY, sw - 8, 30, '#1c1825');
  _px(ctx, sx + 4, cardY, sw - 8, 1, '#3a3540');
  // Waveform inside card
  for (let i = 0; i < 14; i++) {
    const x = sx + 8 + i * 3;
    const amp = 2 + Math.abs(Math.sin((fc + i * 6) * 0.18) * 8);
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(x, cardY + 14 - amp / 2, 2, amp);
  }
  // Like / Comment row under the card
  ctx.fillStyle = '#fb7185';
  ctx.font = 'bold 4px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('♥ 4', sx + 8, cardY + 27);
  ctx.fillStyle = '#5a5a6a';
  ctx.fillText('💬 0', sx + 24, cardY + 27);
  ctx.fillText('↗ 0', sx + 40, cardY + 27);
  // Subtle blue glow to feel like phone is the only light source
  ctx.fillStyle = 'rgba(34, 211, 238, 0.06)';
  ctx.fillRect(40, 0, 110, 130);
  // Occasional refresh flicker
  if (fc % 90 < 4) {
    ctx.fillStyle = 'rgba(34, 211, 238, 0.06)';
    ctx.fillRect(0, 0, W, H);
  }
};

const drawMirror = (ctx, fc) => {
  const W = 200, H = 130;
  // Bedroom wall + floor
  _px(ctx, 0, 0, W, 95, '#2a253a');
  _px(ctx, 0, 95, W, 35, '#3a2818');
  _px(ctx, 0, 95, W, 1, '#5a3a28');
  // Wallpaper hint
  for (let y = 6; y < 95; y += 14) {
    for (let x = 8; x < W; x += 14) _px(ctx, x, y, 1, 1, '#3a3045');
  }
  // Bedside lamp on the left (the light source)
  _px(ctx, 18, 50, 12, 8, '#fbbf24');
  _px(ctx, 18, 50, 12, 1, '#fef3c7');
  _px(ctx, 22, 58, 4, 16, '#1a1a1a');                   // lamp neck
  _px(ctx, 16, 74, 16, 2, '#1a1a1a');                   // lamp base
  // Lamp light glow
  ctx.fillStyle = 'rgba(254, 243, 199, 0.08)';
  ctx.beginPath(); ctx.arc(24, 56, 40, 0, Math.PI * 2); ctx.fill();
  // ---- The mirror ----
  // Frame (wooden)
  _px(ctx, 60, 8, 80, 104, '#5a4030');
  _px(ctx, 60, 8, 80, 2, '#7a5a40');                    // top highlight
  _px(ctx, 60, 8, 2, 104, '#7a5a40');                   // left highlight
  _px(ctx, 138, 8, 2, 104, '#3a2410');                  // right shadow
  _px(ctx, 60, 110, 80, 2, '#3a2410');                  // bottom shadow
  // Mirror surface — bluish gradient to feel like glass
  for (let y = 0; y < 94; y++) {
    const t = y / 94;
    const r = Math.floor(0x28 + t * 0x06);
    const g = Math.floor(0x28 + t * 0x06);
    const b = Math.floor(0x40 - t * 0x10);
    _px(ctx, 65, 13 + y, 70, 1, `rgb(${r},${g},${b})`);
  }
  // Glass sheen (subtle)
  for (let i = 0; i < 4; i++) {
    const sy = 18 + i * 22;
    _px(ctx, 67 + i * 3, sy, 8, 1, 'rgba(255,255,255,0.10)');
  }
  // ---- Character reflection inside the mirror ----
  const shirt = '#7a5a40';                              // tan plain shirt (intro: no chosen color yet)
  const skin = '#d4a87a';
  const hair = '#1a1a2e';
  // Use a subtle haze on the reflection to read as "in the mirror"
  ctx.save();
  ctx.beginPath();
  ctx.rect(65, 13, 70, 94);
  ctx.clip();
  ctx.globalAlpha = 0.92;
  // Body — face-on
  _px(ctx, 88, 76, 22, 28, shirt);                      // shirt body
  _px(ctx, 88, 76, 22, 2, '#a07a50');                   // collar
  _px(ctx, 88, 76, 1, 28, '#a07a50');                   // shoulder highlight left
  _px(ctx, 84, 80, 4, 18, shirt);                       // left arm
  _px(ctx, 110, 80, 4, 18, shirt);                      // right arm
  _px(ctx, 84, 96, 4, 4, skin);                         // left hand
  _px(ctx, 110, 96, 4, 4, skin);                        // right hand
  // Head
  _px(ctx, 88, 56, 22, 20, skin);                       // face
  _px(ctx, 88, 53, 22, 6, hair);                        // hair
  _px(ctx, 86, 58, 2, 6, hair);                         // sideburn left
  _px(ctx, 110, 58, 2, 6, hair);                        // sideburn right
  // Eyes (occasional blink)
  if (fc % 180 < 8) {
    _px(ctx, 94, 64, 4, 1, skin);
    _px(ctx, 102, 64, 4, 1, skin);
  } else {
    _px(ctx, 94, 64, 3, 2, '#0c0a09');
    _px(ctx, 102, 64, 3, 2, '#0c0a09');
  }
  // Slight conflicted mouth — tightens to a line every few seconds
  if (fc % 120 < 60) {
    _px(ctx, 96, 71, 7, 1, '#3a1010');                  // neutral line
  } else {
    _px(ctx, 96, 71, 7, 2, '#3a1010');                  // pursed
  }
  // A single tear drop occasionally (rare)
  if (fc % 240 < 30) {
    const ty = 66 + ((fc % 240) - 0) / 6;
    _px(ctx, 95, Math.floor(ty), 1, 2, '#22d3ee');
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  // Soft glow on mirror corner
  if (fc % 40 < 20) {
    ctx.fillStyle = 'rgba(254, 243, 199, 0.05)';
    ctx.fillRect(65, 13, 70, 24);
  }
  // Floor reflection of the mirror frame (suggests it stands on the floor)
  _px(ctx, 56, 112, 88, 1, '#3a2818');
  _px(ctx, 56, 113, 88, 1, '#2a1810');
};

const drawDoor = (ctx, fc) => {
  const W = 200, H = 130;
  // Night street
  _px(ctx, 0, 0, W, H, '#0a0a14');
  // Stars
  for (let i = 0; i < 18; i++) {
    const sx = (i * 11 + 5) % W;
    const sy = (i * 7) % 30;
    if ((fc + i * 5) % 90 < 70) _px(ctx, sx, sy, 1, 1, i % 3 ? '#fbbf24' : '#fef3c7');
  }
  // Brick wall surrounding the door
  _px(ctx, 0, 30, W, 90, '#3a1f1a');
  // Brick mortar pattern
  for (let y = 32; y < 120; y += 6) {
    _px(ctx, 0, y, W, 1, '#2a1410');
    const offset = (y / 6) % 2 === 0 ? 0 : 12;
    for (let x = offset; x < W; x += 24) _px(ctx, x, y, 1, 6, '#2a1410');
  }
  // Door frame (door is recessed)
  _px(ctx, 56, 28, 88, 92, '#1a0d10');
  _px(ctx, 56, 28, 88, 2, '#3a1810');                   // top frame
  _px(ctx, 56, 28, 2, 92, '#3a1810');
  _px(ctx, 142, 28, 2, 92, '#3a1810');
  // Door (red)
  _px(ctx, 62, 38, 76, 82, '#7a1a14');
  _px(ctx, 62, 38, 76, 2, '#a02a20');                   // top highlight
  _px(ctx, 62, 38, 2, 82, '#a02a20');                   // left highlight
  _px(ctx, 136, 38, 2, 82, '#3a0a08');                  // right shadow
  // Door panels (raised rectangles)
  _px(ctx, 70, 50, 28, 26, '#5a1410');
  _px(ctx, 70, 50, 28, 1, '#a02a20');
  _px(ctx, 102, 50, 28, 26, '#5a1410');
  _px(ctx, 102, 50, 28, 1, '#a02a20');
  _px(ctx, 70, 84, 28, 26, '#5a1410');
  _px(ctx, 70, 84, 28, 1, '#a02a20');
  _px(ctx, 102, 84, 28, 26, '#5a1410');
  _px(ctx, 102, 84, 28, 1, '#a02a20');
  // Doorknob
  _px(ctx, 130, 78, 2, 2, '#fbbf24');
  _px(ctx, 130, 78, 1, 1, '#fef3c7');
  // Marquee/sign over the door — neon "CYPHER" with bulbs
  _px(ctx, 50, 6, 100, 22, '#1a0a0d');
  _px(ctx, 50, 6, 100, 2, '#3a1a14');
  _px(ctx, 50, 26, 100, 2, '#0a0a08');
  // Marquee bulb border (animated chase)
  for (let i = 0; i < 14; i++) {
    const lx = 54 + i * 7;
    const litTop = (Math.floor(fc / 4) + i) % 4 < 2;
    _px(ctx, lx, 8, 2, 2, litTop ? '#fef3c7' : '#7a6a30');
    _px(ctx, lx, 24, 2, 2, litTop ? '#fbbf24' : '#7a6a30');
  }
  // CYPHER neon text — flickers (rare dim)
  const flicker = (fc % 100 < 4) ? '#7a3a40' : '#fb7185';
  ctx.fillStyle = flicker;
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('CYPHER', 100, 21);
  // Glow behind text
  ctx.fillStyle = 'rgba(251, 113, 133, 0.20)';
  ctx.fillRect(70, 11, 60, 16);
  // Tiny "TONIGHT" / arrow under marquee
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 5px monospace';
  ctx.fillText('TONIGHT', 100, 36);
  // Doorman silhouette to the right of the door
  _px(ctx, 150, 96, 8, 14, '#0c0a09');                  // body
  _px(ctx, 152, 88, 4, 8, '#0c0a09');                   // head
  _px(ctx, 150, 86, 8, 3, '#0c0a09');                   // hat brim
  _px(ctx, 152, 84, 4, 3, '#0c0a09');                   // hat top
  // Velvet rope post + rope toward off-screen
  _px(ctx, 162, 106, 2, 14, '#3a3a3a');
  _px(ctx, 161, 104, 4, 3, '#fbbf24');                  // post top
  _px(ctx, 164, 110, 28, 1, '#7a1a14');                 // rope
  _px(ctx, 164, 111, 28, 1, '#5a1010');
  // Player approaching from the left, viewed from behind (small silhouette)
  const stand = Math.floor(fc / 12) % 2;
  _px(ctx, 28, 96 + stand, 12, 14, '#1a1a2e');          // jacket
  _px(ctx, 28, 96 + stand, 12, 2, '#3a3a4a');
  _px(ctx, 30, 86 + stand, 8, 10, '#d4a87a');           // back of head + neck
  _px(ctx, 30, 84 + stand, 8, 4, '#1a1a2e');            // hair
  _px(ctx, 30, 110 + stand, 4, 8, '#1a1a2e');           // legs
  _px(ctx, 36, 110 + stand, 4, 8, '#1a1a2e');
  _px(ctx, 30, 117 + stand, 4, 1, '#fff');
  _px(ctx, 36, 117 + stand, 4, 1, '#fff');
  // Sidewalk
  _px(ctx, 0, 118, W, 12, '#3a2818');
  _px(ctx, 0, 118, W, 1, '#5a4030');
  // Sidewalk edge stripe
  _px(ctx, 0, 122, W, 1, '#fbbf24');
};

// ============ RENT CUTSCENE SCENES ============
// All four share the same apartment-front silhouette so it reads as the
// same place across the arc. `state` selects the dressing.

// Helper: paints a small Sunday-morning apartment exterior. mailboxState
// controls the notice on the door / overflow envelopes / boards on door.
const _drawRentScene = (ctx, fc, state) => {
  const W = 200, H = 130;
  // Sky — subtle dawn gradient
  _drawSky(ctx, W, 60, 0x4a, 0x40, 0x6a, 0x4a + 0x40, 0x40 + 0x40, 0x6a + 0x18);
  // Sun on the horizon
  _px(ctx, 28, 24, 12, 12, '#fef3c7');
  ctx.fillStyle = 'rgba(254,243,199,0.25)';
  ctx.beginPath(); ctx.arc(34, 30, 16, 0, Math.PI * 2); ctx.fill();
  // Apartment building
  _px(ctx, 60, 6, 84, 90, '#7a4030');
  _px(ctx, 60, 6, 84, 2, '#a06040');
  // Brick mortar
  for (let y = 10; y < 96; y += 6) {
    _px(ctx, 60, y, 84, 1, '#5a2810');
    const offset = (y / 6) % 2 === 0 ? 0 : 12;
    for (let x = 60 + offset; x < 144; x += 24) _px(ctx, x, y, 1, 6, '#5a2810');
  }
  // Upstairs window
  _px(ctx, 76, 16, 18, 16, '#3a3a4a');
  _px(ctx, 76, 16, 18, 1, '#1a1a1a');
  _px(ctx, 76, 31, 18, 1, '#1a1a1a');
  _px(ctx, 76, 16, 1, 16, '#1a1a1a');
  _px(ctx, 93, 16, 1, 16, '#1a1a1a');
  _px(ctx, 84, 16, 1, 16, '#1a1a1a');
  _px(ctx, 76, 23, 18, 1, '#1a1a1a');
  // Curtain
  if (state !== 'evicted') _px(ctx, 77, 17, 8, 14, '#5a4a30');
  _px(ctx, 110, 16, 18, 16, '#3a3a4a');
  _px(ctx, 110, 16, 18, 1, '#1a1a1a');
  _px(ctx, 110, 31, 18, 1, '#1a1a1a');
  _px(ctx, 110, 16, 1, 16, '#1a1a1a');
  _px(ctx, 127, 16, 1, 16, '#1a1a1a');
  _px(ctx, 118, 16, 1, 16, '#1a1a1a');
  _px(ctx, 110, 23, 18, 1, '#1a1a1a');
  // Door frame + door
  _px(ctx, 88, 50, 28, 46, '#3a1a14');
  _px(ctx, 90, 52, 24, 44, state === 'evicted' ? '#3a2820' : '#a02a20');
  _px(ctx, 90, 52, 24, 2, state === 'evicted' ? '#5a3a30' : '#c84030');
  // Door panels
  _px(ctx, 94, 56, 16, 16, state === 'evicted' ? '#2a1a10' : '#7a1a14');
  _px(ctx, 94, 56, 16, 1, state === 'evicted' ? '#4a3020' : '#c84030');
  _px(ctx, 94, 76, 16, 16, state === 'evicted' ? '#2a1a10' : '#7a1a14');
  _px(ctx, 94, 76, 16, 1, state === 'evicted' ? '#4a3020' : '#c84030');
  // Doorknob
  _px(ctx, 109, 75, 2, 2, '#fbbf24');
  // Stoop
  _px(ctx, 80, 96, 40, 4, '#5a4030');
  _px(ctx, 80, 96, 40, 1, '#7a5a40');
  // Sidewalk
  _px(ctx, 0, 100, W, 30, '#7a7a7a');
  _px(ctx, 0, 100, W, 1, '#a8a8a8');
  // Mailbox at the right of the stoop
  _px(ctx, 144, 80, 12, 14, '#3a3a3a');
  _px(ctx, 144, 80, 12, 2, '#5a5a5a');
  _px(ctx, 144, 90, 12, 1, '#1a1a1a');
  // Mail flag
  _px(ctx, 156, 82, 4, 1, state === 'paid' ? '#22c55e' : '#dc2626');
  _px(ctx, 156, 82, 1, 4, state === 'paid' ? '#22c55e' : '#dc2626');
  // Mailbox post
  _px(ctx, 148, 94, 4, 6, '#1a1a1a');
  // House number plaque
  ctx.fillStyle = '#fef3c7';
  ctx.font = 'bold 5px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('14', 102, 49);
  // ---- State-specific dressing ----
  if (state === 'paid') {
    // Coin sliding into mailbox + green check
    if (fc % 50 < 30) {
      const drop = (fc % 50) / 30;
      _px(ctx, 152, 70 + Math.floor(drop * 10), 3, 3, '#fbbf24');
      _px(ctx, 153, 70 + Math.floor(drop * 10), 1, 1, '#fef3c7');
    }
    // Big green check on door
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(96, 66); ctx.lineTo(100, 70); ctx.lineTo(108, 60);
    ctx.stroke();
  } else if (state === 'missed') {
    // Single overdue notice taped on door
    _px(ctx, 94, 60, 16, 14, '#fbbf24');
    _px(ctx, 94, 60, 16, 1, '#fef3c7');
    ctx.fillStyle = '#7a1a14';
    ctx.font = 'bold 4px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LATE', 102, 65);
    ctx.fillStyle = '#3a1a10';
    ctx.fillText('-50$', 102, 71);
    // Mailbox overflowing with bills
    _px(ctx, 145, 74, 10, 6, '#f0e4c8');
    _px(ctx, 146, 73, 8, 1, '#f0e4c8');
    _px(ctx, 147, 75, 6, 1, '#dc2626');
    // Pulsing red mail flag
    if (fc % 30 < 18) {
      _px(ctx, 156, 80, 4, 3, '#fb7185');
    }
    // Sad cloud above
    _px(ctx, 130, 12, 14, 6, '#5a5060');
    _px(ctx, 132, 10, 10, 4, '#5a5060');
    // Single tear
    if (fc % 60 < 40) _px(ctx, 137, 18, 1, 2, '#22d3ee');
  } else if (state === 'warning') {
    // Big red FINAL WARNING notice
    _px(ctx, 90, 56, 24, 24, '#dc2626');
    _px(ctx, 90, 56, 24, 2, '#fb7185');
    _px(ctx, 91, 57, 22, 22, '#7a1a14');
    ctx.fillStyle = '#fef3c7';
    ctx.font = 'bold 5px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FINAL', 102, 64);
    ctx.fillText('WARNING', 102, 70);
    ctx.font = 'bold 4px monospace';
    ctx.fillText('PAY OR LEAVE', 102, 76);
    // Flashing red border
    if (fc % 20 < 10) {
      _px(ctx, 88, 54, 28, 28, 'rgba(255,0,0,0.20)');
    }
    // Storm cloud above
    _px(ctx, 100, 4, 30, 8, '#3a3540');
    _px(ctx, 95, 6, 8, 6, '#3a3540');
    _px(ctx, 130, 6, 8, 6, '#3a3540');
    // Lightning flash (rare)
    if (fc % 70 < 4) {
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath();
      ctx.moveTo(118, 12); ctx.lineTo(114, 22); ctx.lineTo(118, 22);
      ctx.lineTo(112, 32); ctx.lineTo(120, 18); ctx.lineTo(116, 18);
      ctx.lineTo(120, 12); ctx.closePath();
      ctx.fill();
    }
    // Mailbox: lots of unopened bills
    _px(ctx, 145, 72, 10, 8, '#f0e4c8');
    _px(ctx, 144, 71, 12, 1, '#dc2626');
    _px(ctx, 146, 74, 8, 1, '#dc2626');
    _px(ctx, 146, 76, 8, 1, '#dc2626');
  } else if (state === 'evicted') {
    // Boards across the door
    _px(ctx, 86, 60, 32, 4, '#7a5030');
    _px(ctx, 86, 64, 32, 1, '#5a3010');
    _px(ctx, 86, 76, 32, 4, '#7a5030');
    _px(ctx, 86, 80, 32, 1, '#5a3010');
    // Nail heads
    for (let i = 0; i < 4; i++) {
      _px(ctx, 88 + i * 8, 61, 2, 2, '#1a1a1a');
      _px(ctx, 88 + i * 8, 77, 2, 2, '#1a1a1a');
    }
    // Eviction notice papered over
    _px(ctx, 94, 60, 16, 12, '#dadada');
    _px(ctx, 94, 60, 16, 1, '#fff');
    ctx.fillStyle = '#dc2626';
    ctx.font = 'bold 4px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('EVICTED', 102, 66);
    ctx.fillStyle = '#1c1917';
    ctx.font = 'bold 3px monospace';
    ctx.fillText('NO ENTRY', 102, 70);
    // Cardboard boxes on the stoop
    _px(ctx, 56, 86, 18, 12, '#a87844');
    _px(ctx, 56, 86, 18, 1, '#c89a64');
    _px(ctx, 56, 90, 18, 1, '#5a3a18');
    _px(ctx, 124, 88, 20, 10, '#a87844');
    _px(ctx, 124, 88, 20, 1, '#c89a64');
    _px(ctx, 124, 92, 20, 1, '#5a3a18');
    // Plant sticking out of one box
    _px(ctx, 64, 80, 4, 6, '#3a7028');
    _px(ctx, 62, 82, 8, 4, '#3a7028');
    // Lonely figure (shadow) walking off-screen left
    _px(ctx, 4, 102, 6, 14, '#1a1a1a');
    _px(ctx, 6, 96, 6, 6, '#1a1a1a');
    _px(ctx, 4, 116, 2, 4, '#1a1a1a');
    _px(ctx, 10, 116, 2, 4, '#1a1a1a');
    // Drag bag silhouette
    _px(ctx, 12, 110, 6, 6, '#3a2818');
    // Heavy gray sky tone
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(0, 0, W, 60);
  }
};

// 1. Rent paid (small celebratory beat — used as the first-rent intro only).
const drawRentPaidScene = (ctx, fc) => { _drawRentScene(ctx, fc, 'paid'); };
// 2. Rent missed (week 1 — overdue notice on door).
const drawRentMissedScene = (ctx, fc) => { _drawRentScene(ctx, fc, 'missed'); };
// 3. Eviction warning (week 2 — final warning notice + storm).
const drawEvictionWarningScene = (ctx, fc) => { _drawRentScene(ctx, fc, 'warning'); };
// 4. Eviction (week 3 — boards on door, boxes on stoop, character walking away).
const drawEvictedScene = (ctx, fc) => { _drawRentScene(ctx, fc, 'evicted'); };

// 5. Couch-surfing at Foxy's friend's place — second beat of eviction arc.
const drawCouchSurfScene = (ctx, fc, look) => {
  const W = 200, H = 130;
  // Wall (cool dim apartment)
  _px(ctx, 0, 0, W, 95, '#252a35');
  for (let y = 8; y < 95; y += 14) for (let x = 8; x < W; x += 14) _px(ctx, x, y, 1, 1, '#2a3040');
  // Floor
  _px(ctx, 0, 95, W, 35, '#2a1a10');
  _px(ctx, 0, 95, W, 1, '#3a2818');
  // Window with night sky
  _px(ctx, 130, 14, 50, 36, '#0c0a18');
  _px(ctx, 130, 14, 50, 1, '#1a1a1a');
  _px(ctx, 130, 49, 50, 1, '#1a1a1a');
  _px(ctx, 130, 14, 1, 36, '#1a1a1a');
  _px(ctx, 179, 14, 1, 36, '#1a1a1a');
  _px(ctx, 154, 14, 1, 36, '#1a1a1a');
  // Stars
  for (let i = 0; i < 12; i++) {
    const sx = 132 + (i * 4) % 46;
    const sy = 16 + (i * 7) % 32;
    if ((fc + i * 5) % 60 < 50) _px(ctx, sx, sy, 1, 1, '#fef3c7');
  }
  // Couch (someone else's — different color from your living room)
  _px(ctx, 24, 78, 110, 28, '#3a4040');
  _px(ctx, 24, 78, 110, 4, '#5a6060');
  _px(ctx, 18, 76, 12, 18, '#3a4040');
  _px(ctx, 128, 76, 12, 18, '#3a4040');
  // Spare blanket (Foxy gave them)
  _px(ctx, 36, 78, 80, 12, '#7a5040');
  _px(ctx, 36, 78, 80, 1, '#a07050');
  // Player slumped on couch — restless, eyes open
  // Pillow under head
  _px(ctx, 30, 78, 14, 3, '#a8a29e');
  // Head
  _px(ctx, 33, 72, 12, 9, look?.skin || '#d4a87a');
  _px(ctx, 33, 70, 12, 3, look?.hair || '#1a1a2e');
  // Open eyes (can't sleep) — staring up at ceiling
  _px(ctx, 37, 76, 1, 1, '#0c0a09');
  _px(ctx, 41, 76, 1, 1, '#0c0a09');
  // Frown
  _px(ctx, 38, 79, 4, 1, '#3a1010');
  // Body / blanket covering
  _px(ctx, 45, 73, 32, 8, look?.shirt || '#a78bfa');
  _px(ctx, 45, 73, 32, 1, '#fff');
  _px(ctx, 77, 75, 22, 6, '#1a1a1a');
  _px(ctx, 99, 72, 5, 3, '#fff');
  // Calendar on the wall, animating days passing (3 visible Xs)
  _px(ctx, 80, 16, 36, 28, '#f0e4c8');
  _px(ctx, 80, 16, 36, 1, '#c0a070');
  _px(ctx, 80, 16, 36, 5, '#7a1a14');
  ctx.fillStyle = '#fef3c7';
  ctx.font = 'bold 4px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('THIS WEEK', 98, 21);
  // Day grid (2 rows × 4)
  for (let r = 0; r < 2; r++) {
    for (let cn = 0; cn < 4; cn++) {
      const cx = 84 + cn * 8;
      const cy = 25 + r * 8;
      _px(ctx, cx, cy, 6, 6, '#fff');
      _px(ctx, cx, cy, 6, 1, '#c0a070');
      // X out the first 3 squares as days pass
      const idx = r * 4 + cn;
      const dayPassed = Math.min(3, Math.floor(fc / 60));
      if (idx < dayPassed) {
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx + 1, cy + 1); ctx.lineTo(cx + 5, cy + 5);
        ctx.moveTo(cx + 5, cy + 1); ctx.lineTo(cx + 1, cy + 5);
        ctx.stroke();
      }
    }
  }
  // Lamp on side table
  _px(ctx, 4, 64, 12, 4, '#fbbf24');
  _px(ctx, 8, 68, 4, 12, '#1a1a1a');
  _px(ctx, 4, 80, 12, 2, '#5a3a18');
  // Lamp glow
  ctx.fillStyle = 'rgba(254,243,199,0.10)';
  ctx.beginPath(); ctx.arc(10, 70, 24, 0, Math.PI * 2); ctx.fill();
};

// 6. Back on your feet — sun rising over restored apartment, fresh start.
const drawBackOnFeetScene = (ctx, fc) => {
  const W = 200, H = 130;
  // Bright sunrise sky (saturated peach → cool sky)
  _drawSky(ctx, W, 90, 0xff, 0xc0, 0x60, Math.floor(0xff * 0.8), 0xc0 + 0x20, 0x60 + 0x80);
  // Big rising sun
  const sunY = 50;
  _px(ctx, 88, sunY, 24, 24, '#fef3c7');
  _px(ctx, 92, sunY - 4, 16, 4, '#fef3c7');
  _px(ctx, 92, sunY + 24, 16, 4, '#fef3c7');
  _px(ctx, 84, sunY + 4, 4, 16, '#fef3c7');
  _px(ctx, 112, sunY + 4, 4, 16, '#fef3c7');
  // Sun rays
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2 + fc * 0.01;
    const r = 22 + ((fc + i * 5) % 40) * 0.4;
    const sx = Math.floor(100 + Math.cos(ang) * r);
    const sy = Math.floor(sunY + 12 + Math.sin(ang) * r);
    if (sx > 0 && sx < W && sy > 0 && sy < 90) {
      _px(ctx, sx, sy, 1, 1, '#fef3c7');
    }
  }
  // Apartment building (reopened, no boards)
  _px(ctx, 60, 30, 84, 70, '#7a4030');
  _px(ctx, 60, 30, 84, 2, '#a06040');
  for (let y = 34; y < 100; y += 6) {
    _px(ctx, 60, y, 84, 1, '#5a2810');
  }
  // Windows lit warm
  _px(ctx, 76, 38, 18, 14, '#fbbf24');
  _px(ctx, 76, 38, 18, 1, '#1a1a1a');
  _px(ctx, 76, 51, 18, 1, '#1a1a1a');
  _px(ctx, 110, 38, 18, 14, '#fbbf24');
  _px(ctx, 110, 38, 18, 1, '#1a1a1a');
  _px(ctx, 110, 51, 18, 1, '#1a1a1a');
  // Door (restored — red, no boards)
  _px(ctx, 88, 60, 28, 40, '#3a1a14');
  _px(ctx, 90, 62, 24, 38, '#a02a20');
  _px(ctx, 90, 62, 24, 2, '#c84030');
  _px(ctx, 94, 66, 16, 12, '#7a1a14');
  _px(ctx, 94, 66, 16, 1, '#c84030');
  _px(ctx, 94, 80, 16, 14, '#7a1a14');
  _px(ctx, 94, 80, 16, 1, '#c84030');
  _px(ctx, 109, 80, 2, 2, '#fbbf24');
  // Welcome mat
  _px(ctx, 80, 100, 40, 4, '#fbbf24');
  _px(ctx, 80, 100, 40, 1, '#fef3c7');
  ctx.fillStyle = '#3a1a10';
  ctx.font = 'bold 4px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('HOME', 100, 104);
  // Sidewalk
  _px(ctx, 0, 104, W, 26, '#a89060');
  _px(ctx, 0, 104, W, 1, '#cba880');
  // Player walking up to door (silhouette from behind, with new keys)
  const stand = Math.floor(fc / 12) % 2;
  _px(ctx, 32, 110 + stand, 12, 14, '#5a3a40');
  _px(ctx, 34, 100 + stand, 8, 10, '#d4a87a');
  _px(ctx, 34, 98 + stand, 8, 4, '#1a1a2e');
  _px(ctx, 32, 124 + stand, 4, 4, '#1a1a2e');
  _px(ctx, 38, 124 + stand, 4, 4, '#1a1a2e');
  // Keys jingling in hand (animated)
  _px(ctx, 44, 112 + stand, 2, 2, '#fbbf24');
  _px(ctx, 46, 113 + stand, 2, 2, '#fbbf24');
  if (fc % 16 < 8) _px(ctx, 47, 110 + stand, 1, 4, '#fef3c7');
  // Birds in the sky
  for (let i = 0; i < 3; i++) {
    const bx = (12 + i * 24 + Math.floor(fc * 0.3)) % W;
    const by = 14 + i * 6 + Math.sin((fc + i * 30) * 0.05) * 2;
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx - 2, by + 1); ctx.lineTo(bx, by); ctx.lineTo(bx + 2, by + 1);
    ctx.stroke();
  }
};

// ============ FOXY — ROOMMATE ============
// Foxy is non-binary, soft-spoken, plant person. Pixel art draws them with
// a green oversized sweater + soft layered hair. Always neutral expression.

// Draw a small Foxy figure at (x, y) where y = feet baseline. Used for the
// safety-net cutscene and the home-screen Foxy panel.
const drawFoxy = (ctx, x, y, frameCount) => {
  // Shadow
  _px(ctx, x - 7, y, 14, 1, 'rgba(0,0,0,0.45)');
  // Legs (slightly wider than the player)
  _px(ctx, x - 4, y - 9, 3, 9, '#1a1a1a');
  _px(ctx, x + 1, y - 9, 3, 9, '#1a1a1a');
  // Slip-on shoes (felt, not athletic)
  _px(ctx, x - 5, y - 1, 4, 1, '#5a3a40');
  _px(ctx, x + 1, y - 1, 4, 1, '#5a3a40');
  // Oversized green sweater (boxy)
  _px(ctx, x - 6, y - 22, 12, 13, '#5a8030');
  _px(ctx, x - 6, y - 22, 12, 1, '#7aa040');         // collar highlight
  _px(ctx, x - 6, y - 22, 1, 13, '#3a6020');         // shadow side
  // Sleeves (oversized — past wrists)
  _px(ctx, x - 8, y - 21, 2, 10, '#5a8030');
  _px(ctx, x + 6, y - 21, 2, 10, '#5a8030');
  _px(ctx, x - 8, y - 12, 2, 1, '#3a6020');          // sleeve cuff
  _px(ctx, x + 6, y - 12, 2, 1, '#3a6020');
  // Visible bit of hand (one)
  _px(ctx, x + 7, y - 11, 1, 2, '#d4a87a');
  // Head (slightly tilted softer skin tone)
  _px(ctx, x - 4, y - 28, 8, 7, '#e0b890');
  // Soft layered hair (warm tone — auburn-ish)
  _px(ctx, x - 5, y - 30, 10, 3, '#7a3a20');
  _px(ctx, x - 5, y - 27, 1, 3, '#7a3a20');          // sideburn left
  _px(ctx, x + 4, y - 27, 1, 3, '#7a3a20');          // sideburn right
  // Eyes (closed crescents — gentle/sleepy by default)
  _px(ctx, x - 3, y - 25, 2, 1, '#3a2010');
  _px(ctx, x + 1, y - 25, 2, 1, '#3a2010');
  // Soft neutral mouth
  _px(ctx, x - 1, y - 22, 3, 1, '#5a2020');
  // Tiny earring (occasional sparkle)
  _px(ctx, x + 4, y - 24, 1, 1, '#fbbf24');
  if (frameCount % 90 < 4) _px(ctx, x + 4, y - 24, 1, 1, '#fef3c7');
};

// Foxy's safety-net soup scene — small kitchen with an island. Bowl of green
// soup steams on the island, Foxy on the right, player on the left, looking
// tired.
const drawFoxySoupScene = (ctx, fc, look) => {
  const W = 200, H = 130;
  // Apartment kitchen wall
  _px(ctx, 0, 0, W, 95, '#3a2a30');
  // Wallpaper dots
  for (let y = 8; y < 95; y += 12) for (let x = 8; x < W; x += 12) _px(ctx, x, y, 1, 1, '#5a3a40');
  // Wall trim
  _px(ctx, 0, 94, W, 1, '#5a3a40');
  // Floor
  _px(ctx, 0, 95, W, 35, '#3a2010');
  _px(ctx, 0, 95, W, 1, '#5a3018');
  for (let i = 0; i < 5; i++) _px(ctx, i * 40, 96, 1, 34, '#2a1808');
  // Window upper-left
  _px(ctx, 6, 8, 30, 24, '#7ec0e8');
  _px(ctx, 6, 8, 30, 1, '#1a1a1a');
  _px(ctx, 6, 31, 30, 1, '#1a1a1a');
  _px(ctx, 6, 8, 1, 24, '#1a1a1a');
  _px(ctx, 35, 8, 1, 24, '#1a1a1a');
  _px(ctx, 20, 8, 1, 24, '#1a1a1a');
  _px(ctx, 6, 19, 30, 1, '#1a1a1a');
  // Cloud + sun in window
  _px(ctx, 26, 12, 6, 3, '#fef3c7');
  _px(ctx, 10, 22, 8, 2, '#fff');
  // Plant in pot on window sill
  _px(ctx, 4, 32, 12, 6, '#3a2410');
  _px(ctx, 6, 24, 8, 8, '#3a7028');
  _px(ctx, 4, 26, 4, 4, '#3a7028');
  _px(ctx, 14, 26, 4, 4, '#3a7028');
  _px(ctx, 8, 22, 4, 4, '#4a8038');
  // Cabinets along back wall
  _px(ctx, 60, 30, 84, 50, '#5a3a28');
  _px(ctx, 60, 30, 84, 2, '#7a5a40');
  // Cabinet doors
  for (let i = 0; i < 4; i++) {
    _px(ctx, 64 + i * 20, 32, 18, 22, '#3a2418');
    _px(ctx, 64 + i * 20, 32, 18, 1, '#7a5a40');
    _px(ctx, 72 + i * 20, 42, 2, 1, '#a07050');       // handle
  }
  // Counter top of cabinets
  _px(ctx, 60, 54, 84, 4, '#7a5040');
  _px(ctx, 60, 54, 84, 1, '#a07050');
  // Toaster on the back counter
  _px(ctx, 116, 46, 14, 8, '#a8a29e');
  _px(ctx, 116, 46, 14, 1, '#dadada');
  _px(ctx, 124, 50, 4, 1, '#1a1a1a');                 // slot
  // ---- Kitchen island in front ----
  const ix = 70, iy = 92;
  // Island surface (top, slightly visible angled edge)
  _px(ctx, ix, iy, 60, 4, '#7a5040');
  _px(ctx, ix, iy, 60, 1, '#a07050');
  // Island front face
  _px(ctx, ix, iy + 4, 60, 22, '#5a3a28');
  _px(ctx, ix, iy + 4, 60, 1, '#7a5a40');
  // Island legs
  _px(ctx, ix + 2, iy + 26, 4, 4, '#1a1a1a');
  _px(ctx, ix + 54, iy + 26, 4, 4, '#1a1a1a');
  // ---- Bowl of soup on the island ----
  const bx = 88, by = 86;
  // Bowl outer (wider top)
  _px(ctx, bx, by, 24, 1, '#a87844');                 // top rim
  _px(ctx, bx, by, 24, 1, '#c89a64');                 // top highlight
  _px(ctx, bx + 2, by + 1, 20, 4, '#a87844');         // bowl wall
  _px(ctx, bx + 4, by + 5, 16, 1, '#5a3a18');         // bowl bottom shadow
  // Soup (green inside the bowl)
  _px(ctx, bx + 3, by + 1, 18, 3, '#5a8030');
  _px(ctx, bx + 3, by + 1, 18, 1, '#7aa040');
  // Carrot bit floating
  _px(ctx, bx + 8, by + 2, 2, 1, '#f97316');
  _px(ctx, bx + 14, by + 2, 1, 1, '#f97316');
  // Spoon poking out
  _px(ctx, bx + 19, by - 4, 1, 5, '#a8a29e');
  _px(ctx, bx + 18, by - 5, 3, 2, '#dadada');
  // Steam plumes
  for (let i = 0; i < 3; i++) {
    const phase = (fc + i * 18) % 50;
    const sx = bx + 6 + i * 6;
    const sy = by - 6 - phase * 0.4;
    if (phase < 40) {
      ctx.globalAlpha = 0.7 * (1 - phase / 40);
      _px(ctx, Math.floor(sx + Math.sin(phase * 0.2) * 2), Math.floor(sy), 1, 2, '#dadada');
      ctx.globalAlpha = 1;
    }
  }
  // Foxy on the right side of the island
  drawFoxy(ctx, 156, 126, fc);
  // Player coming in from the left, looks tired
  const px = 28;
  // Legs
  _px(ctx, px - 4, 116, 3, 10, '#1a1a2e');
  _px(ctx, px + 1, 116, 3, 10, '#1a1a2e');
  _px(ctx, px - 4, 125, 3, 1, '#fff');
  _px(ctx, px + 1, 125, 3, 1, '#fff');
  // Body
  _px(ctx, px - 5, 105, 10, 11, look?.shirt || '#a78bfa');
  _px(ctx, px - 5, 105, 10, 1, '#fff');               // collar
  // Arms hanging
  _px(ctx, px - 7, 106, 2, 8, look?.shirt || '#a78bfa');
  _px(ctx, px + 5, 106, 2, 8, look?.shirt || '#a78bfa');
  _px(ctx, px - 7, 113, 2, 2, look?.skin || '#d4a87a');
  _px(ctx, px + 5, 113, 2, 2, look?.skin || '#d4a87a');
  // Head
  _px(ctx, px - 4, 98, 8, 7, look?.skin || '#d4a87a');
  _px(ctx, px - 4, 96, 8, 3, look?.hair || '#1a1a2e');
  // Tired eyes (small w/ dark circles)
  _px(ctx, px - 3, 101, 1, 1, '#0c0a09');
  _px(ctx, px + 1, 101, 1, 1, '#0c0a09');
  _px(ctx, px - 3, 100, 1, 1, '#3a2010');
  _px(ctx, px + 1, 100, 1, 1, '#3a2010');
  // Mouth (slight frown)
  _px(ctx, px - 1, 104, 3, 1, '#3a1010');
  // Heart particle drifting up between them
  if (fc % 80 < 60) {
    const hp = (fc % 80) / 60;
    const hx = 80 + Math.sin(fc * 0.05) * 4;
    const hy = 70 - hp * 50;
    ctx.globalAlpha = Math.max(0, 1 - hp);
    _px(ctx, Math.floor(hx), Math.floor(hy), 3, 2, '#fb7185');
    _px(ctx, Math.floor(hx), Math.floor(hy + 2), 1, 1, '#fb7185');
    _px(ctx, Math.floor(hx + 2), Math.floor(hy + 2), 1, 1, '#fb7185');
    ctx.globalAlpha = 1;
  }
};

// ============ PIG PEN — RIVAL ============
// Stocky local beatboxer. Cocky. Cap with a stylized clock face — his stage
// name is a wordplay on Big Ben. Black-and-red track jacket. Permasmirk.

// Draw Pig Pen at (x, y) — y is the feet baseline.
// `pose` controls his demeanor: 'smug' (default) | 'sad' (post-loss).
const drawPigPen = (ctx, x, y, frameCount, pose = 'smug') => {
  // Shadow
  _px(ctx, x - 9, y, 18, 1, 'rgba(0,0,0,0.5)');
  // Legs (slightly wide stance)
  _px(ctx, x - 6, y - 9, 4, 9, '#1a1a1a');
  _px(ctx, x + 2, y - 9, 4, 9, '#1a1a1a');
  // Trainers (white sole, red top)
  _px(ctx, x - 7, y - 1, 5, 1, '#fff');
  _px(ctx, x + 2, y - 1, 5, 1, '#fff');
  _px(ctx, x - 7, y - 2, 5, 1, '#dc2626');
  _px(ctx, x + 2, y - 2, 5, 1, '#dc2626');
  // Body — black track jacket with red side stripes
  _px(ctx, x - 7, y - 22, 14, 13, '#1a1a1a');
  _px(ctx, x - 7, y - 22, 14, 1, '#3a3a3a');
  // Red side stripes
  _px(ctx, x - 7, y - 18, 1, 8, '#dc2626');
  _px(ctx, x + 6, y - 18, 1, 8, '#dc2626');
  // Zipper
  _px(ctx, x, y - 20, 1, 10, '#5a5a5a');
  // Arms (longer than the player's — bigger character)
  _px(ctx, x - 9, y - 21, 2, 10, '#1a1a1a');
  _px(ctx, x + 7, y - 21, 2, 10, '#1a1a1a');
  // Hands
  _px(ctx, x - 9, y - 12, 2, 2, '#d4a87a');
  _px(ctx, x + 7, y - 12, 2, 2, '#d4a87a');
  // Pointing-finger pose for the smug version (right hand pointing forward)
  if (pose === 'smug') {
    _px(ctx, x + 9, y - 18, 4, 1, '#d4a87a');
  }
  // Head (slightly wider than player)
  _px(ctx, x - 5, y - 30, 10, 8, '#d4a87a');
  // Cap (red with yellow brim/Big Ben clock face)
  _px(ctx, x - 6, y - 33, 12, 4, '#dc2626');         // crown
  _px(ctx, x - 6, y - 33, 12, 1, '#fb7185');         // crown highlight
  _px(ctx, x - 6, y - 29, 12, 1, '#7a1a14');         // band shadow
  _px(ctx, x + 5, y - 31, 4, 1, '#1a1a1a');          // brim sticking out right
  // Clock face on cap (stylized — yellow circle with two lines)
  _px(ctx, x - 1, y - 32, 3, 3, '#fbbf24');
  _px(ctx, x, y - 31, 1, 1, '#1a1a1a');               // hour hand
  _px(ctx, x + 1, y - 30, 1, 1, '#1a1a1a');           // minute hand
  // Eyes
  if (pose === 'smug') {
    // Squinting smug (one eye narrowed)
    _px(ctx, x - 3, y - 25, 2, 1, '#1a1a2e');
    _px(ctx, x + 1, y - 25, 2, 1, '#1a1a2e');
  } else {
    // Sad / down-cast eyes (small pupils, looking down)
    _px(ctx, x - 3, y - 24, 1, 1, '#1a1a2e');
    _px(ctx, x + 2, y - 24, 1, 1, '#1a1a2e');
  }
  // Mouth — smug smirk vs flat
  if (pose === 'smug') {
    // Smirk: line up on one side
    _px(ctx, x - 1, y - 22, 4, 1, '#5a2020');
    _px(ctx, x + 2, y - 23, 1, 1, '#5a2020');         // upturned right corner
  } else {
    _px(ctx, x - 1, y - 22, 4, 1, '#3a1010');
  }
  // Goatee
  _px(ctx, x, y - 21, 2, 1, '#1a1a2e');
};

// ============ BEEAMGEE — OG MENTOR ============
// 50-something Danish OG. Gray beard, leather jacket, quiet posture.
// Always shows up exactly when needed. Doesn't perform anymore — just
// watches.

const drawBeeAmGee = (ctx, x, y, frameCount) => {
  // Shadow
  _px(ctx, x - 7, y, 14, 1, 'rgba(0,0,0,0.5)');
  // Legs (still, slightly wider stance)
  _px(ctx, x - 4, y - 9, 3, 9, '#1c1c1c');
  _px(ctx, x + 1, y - 9, 3, 9, '#1c1c1c');
  // Boots
  _px(ctx, x - 5, y - 1, 4, 1, '#2a2a2a');
  _px(ctx, x + 1, y - 1, 4, 1, '#2a2a2a');
  // Black leather jacket (bigger than the player's silhouette)
  _px(ctx, x - 6, y - 22, 12, 14, '#1a1a1a');
  _px(ctx, x - 6, y - 22, 12, 1, '#3a3a3a');           // collar highlight
  _px(ctx, x - 6, y - 8, 12, 1, '#0a0a0a');            // hem shadow
  // Lapels
  _px(ctx, x - 4, y - 21, 2, 8, '#3a3a3a');
  _px(ctx, x + 2, y - 21, 2, 8, '#3a3a3a');
  // Arms hanging
  _px(ctx, x - 8, y - 21, 2, 12, '#1a1a1a');
  _px(ctx, x + 6, y - 21, 2, 12, '#1a1a1a');
  // Hands (slightly weathered)
  _px(ctx, x - 8, y - 9, 2, 2, '#a87844');
  _px(ctx, x + 6, y - 9, 2, 2, '#a87844');
  // Head — slightly ruddy, weathered
  _px(ctx, x - 4, y - 30, 8, 8, '#c89065');
  // Hair & beard — gray. Hair receding (small patch on top, more around the back).
  _px(ctx, x - 4, y - 32, 8, 2, '#a8a29e');            // hair top
  _px(ctx, x - 4, y - 30, 1, 6, '#a8a29e');            // sideburn left
  _px(ctx, x + 3, y - 30, 1, 6, '#a8a29e');            // sideburn right
  // Beard
  _px(ctx, x - 3, y - 24, 6, 2, '#dadada');            // chin beard
  _px(ctx, x - 4, y - 25, 1, 1, '#a8a29e');
  _px(ctx, x + 4, y - 25, 1, 1, '#a8a29e');
  // Eyes — quiet, observing
  _px(ctx, x - 3, y - 28, 1, 1, '#1a1a2e');
  _px(ctx, x + 2, y - 28, 1, 1, '#1a1a2e');
  // Crow's feet (subtle wrinkle)
  _px(ctx, x - 4, y - 27, 1, 1, '#7a5040');
  _px(ctx, x + 3, y - 27, 1, 1, '#7a5040');
  // Mouth — flat (he doesn't smile easy)
  _px(ctx, x - 1, y - 26, 3, 1, '#5a3010');
  // Single faint glint on a watch (every few seconds)
  if (frameCount % 60 < 4) _px(ctx, x + 6, y - 11, 1, 1, '#fbbf24');
};

// Cypher sighting — daytime park, BeeAmGee in the back of the crowd.
// Triggered after the player wins their first Saturday battle.
const drawBjarneCypherScene = (ctx, fc, look) => {
  const W = 200, H = 130;
  _drawDaytimeSky(ctx, W);
  _px(ctx, 16, 8, 10, 10, '#fef3c7');
  ctx.fillStyle = 'rgba(254,243,199,0.30)';
  ctx.beginPath(); ctx.arc(21, 13, 14, 0, Math.PI * 2); ctx.fill();
  // Grass + ground
  _px(ctx, 0, 50, W, 80, '#6a9a3a');
  for (let i = 0; i < 24; i++) _px(ctx, (i * 9) % W, 52 + (i % 3) * 4, 1, 2, '#5a8a30');
  // Trees
  for (let i = 0; i < 5; i++) {
    const tx = 5 + i * 38;
    _px(ctx, tx - 8, 38, 16, 8, '#3a7028');
    _px(ctx, tx - 6, 34, 12, 4, '#4a8030');
    _px(ctx, tx - 1, 46, 2, 6, '#3a2410');
  }
  // Crowd silhouettes (brighter than background)
  for (let i = 0; i < 14; i++) {
    const cx = 4 + i * 14 + (i % 2) * 4;
    const headBob = Math.sin(fc * 0.1 + i * 0.5) * 0.5;
    _px(ctx, cx, 60 + headBob, 4, 4, '#a87844');
    _px(ctx, cx - 1, 64 + headBob, 6, 8, ['#a04040','#5a7050','#a06030','#4060a0','#a06090'][i % 5]);
  }
  // Cypher dirt circle
  ctx.fillStyle = '#a89060';
  ctx.beginPath(); ctx.ellipse(100, 106, 80, 18, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#7a6a48'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(100, 106, 78, 17, 0, 0, Math.PI * 2); ctx.stroke();
  // Player in the cypher (center)
  drawBeatboxer(ctx, 100, 110, look, 'right', true, fc);
  // BeeAmGee in the back, half-hidden by the crowd, watching
  drawBeeAmGee(ctx, 168, 88, fc);
  // Subtle eye-line: glow over BeeAmGee + a pixel arrow toward player
  if (fc % 30 < 18) {
    ctx.fillStyle = 'rgba(168, 162, 158, 0.18)';
    ctx.beginPath(); ctx.arc(168, 70, 18, 0, Math.PI * 2); ctx.fill();
  }
};

// BeeAmGee meets you at the open mic — bar interior, dim spotlight.
const drawBjarneMeetingScene = (ctx, fc, look) => {
  const W = 200, H = 130;
  // Dim bar
  _px(ctx, 0, 0, W, 95, '#1c1825');
  for (let y = 6; y < 95; y += 12) for (let x = 8; x < W; x += 14) _px(ctx, x, y, 1, 1, '#2a1f1a');
  // Floor
  _px(ctx, 0, 95, W, 35, '#3a2818');
  _px(ctx, 0, 95, W, 1, '#5a4030');
  // Stage edge (left side)
  _px(ctx, 4, 86, 80, 4, '#5a4030');
  _px(ctx, 4, 86, 80, 1, '#7a5a40');
  // Mic stand on stage
  _px(ctx, 38, 84, 12, 2, '#1a1a1a');
  _px(ctx, 43, 60, 2, 24, '#1a1a1a');
  _px(ctx, 41, 56, 6, 4, '#2a2a2a');
  // Spotlight cone over the stage
  ctx.save();
  ctx.fillStyle = 'rgba(254, 243, 199, 0.10)';
  ctx.beginPath();
  ctx.moveTo(30, 0); ctx.lineTo(56, 0);
  ctx.lineTo(70, 86); ctx.lineTo(16, 86);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  // Player on stage (just stepped off)
  drawBeatboxer(ctx, 44, 86, look, 'right', false, fc);
  // BeeAmGee approaching from right side
  drawBeeAmGee(ctx, 138, 110, fc);
  // Speech intent — small diagonal lines suggesting "approaching"
  if (fc % 24 < 12) {
    _px(ctx, 90, 100, 6, 1, '#fbbf24');
    _px(ctx, 100, 102, 6, 1, '#fbbf24');
  }
  // Crowd silhouettes far in the background
  for (let i = 0; i < 8; i++) {
    const cx = 80 + i * 14;
    _px(ctx, cx, 76, 4, 4, '#0c0a09');
    _px(ctx, cx - 1, 80, 6, 8, '#1a1a1a');
  }
};

// Studio coaching scene — small recording room with BeeAmGee at the desk
// + player at the mic. One scene reused for every coaching session.
const drawBjarneStudioScene = (ctx, fc, look) => {
  const W = 200, H = 130;
  // Wall — warm dark wood paneling
  _px(ctx, 0, 0, W, 95, '#3a2818');
  for (let y = 0; y < 95; y += 8) _px(ctx, 0, y, W, 1, '#2a1a10');
  // Floor
  _px(ctx, 0, 95, W, 35, '#1a1410');
  _px(ctx, 0, 95, W, 1, '#3a2818');
  // Wall acoustic foam (geometric pattern)
  for (let y = 8; y < 70; y += 14) for (let x = 8; x < W; x += 14) {
    _px(ctx, x, y, 8, 8, '#2a1a10');
    _px(ctx, x + 2, y + 2, 4, 4, '#5a3818');
  }
  // Mixing desk on the left (BeeAmGee's side)
  _px(ctx, 0, 78, 70, 16, '#1a1a1a');
  _px(ctx, 0, 78, 70, 2, '#3a3a3a');
  // Faders
  for (let i = 0; i < 8; i++) {
    const fx = 6 + i * 7;
    _px(ctx, fx, 80, 1, 12, '#4a4a4a');
    _px(ctx, fx - 1, 82 + (i % 4) * 2, 3, 2, '#fbbf24');
  }
  // VU meters (animated)
  for (let i = 0; i < 4; i++) {
    const mx = 60 + i;
    const lvl = Math.abs(Math.sin(fc * 0.3 + i)) * 8;
    _px(ctx, mx, 80, 1, 8, '#1c1917');
    for (let l = 0; l < lvl; l++) _px(ctx, mx, 88 - l, 1, 1, l > 5 ? '#dc2626' : l > 3 ? '#fbbf24' : '#22c55e');
  }
  // BeeAmGee at the desk
  drawBeeAmGee(ctx, 30, 110, fc);
  // Mic on a stand, right side, with player
  _px(ctx, 130, 108, 16, 2, '#1a1a1a');
  _px(ctx, 137, 70, 2, 38, '#1a1a1a');
  _px(ctx, 134, 68, 8, 4, '#2a2a2a');
  _px(ctx, 134, 64, 8, 4, '#2a2a2a');
  // Player at the mic
  drawBeatboxer(ctx, 156, 110, look, 'left', true, fc);
  // Sound waves from player toward mic
  if (fc % 8 < 4) {
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(146, 78, 2, 1);
    ctx.fillRect(146, 80, 4, 1);
    ctx.fillRect(146, 82, 2, 1);
  }
  // Hanging warm lamp
  _px(ctx, 100, 0, 1, 12, '#1a1a1a');
  _px(ctx, 96, 11, 9, 4, '#3a2818');
  _px(ctx, 97, 15, 7, 2, '#fbbf24');
  ctx.fillStyle = 'rgba(254, 243, 199, 0.08)';
  ctx.beginPath(); ctx.arc(100, 18, 32, 0, Math.PI * 2); ctx.fill();
};

// ---- Crew battle scene (3v3 lineup) ----
const drawCrewBattleScene = (ctx, fc, look, crewName) => {
  const W = 200, H = 130;
  // Bar interior (low light)
  _drawSky(ctx, W, 50, 0x2a, 0x18, 0x40, 0x4a, 0x20, 0x60);
  _px(ctx, 0, 50, W, 80, '#1a1018');
  // Stage edge
  _px(ctx, 0, 90, W, 4, '#3a2818');
  _px(ctx, 0, 94, W, 36, '#0d0608');
  // Stage lights
  for (let i = 0; i < 5; i++) {
    const lx = 16 + i * 42;
    _px(ctx, lx, 0, 4, 8, '#fbbf24');
    ctx.fillStyle = `rgba(254,243,199,${0.10 + 0.06 * Math.sin(fc * 0.2 + i)})`;
    ctx.beginPath(); ctx.arc(lx + 2, 6, 24, 0, Math.PI * 2); ctx.fill();
  }
  // Player crew on the left (3 figures)
  drawBeatboxer(ctx, 18, 110, look, 'right', true, fc);
  // Allies — generic friends drawn smaller, slightly offset
  _px(ctx, 50, 88, 12, 12, '#f4c098'); // ally head
  _px(ctx, 51, 91, 1, 1, '#0f0c0a');
  _px(ctx, 56, 91, 1, 1, '#0f0c0a');
  _px(ctx, 50, 100, 12, 10, '#84cc16');
  _px(ctx, 50, 110, 12, 10, '#1a1a1a');
  _px(ctx, 70, 90, 12, 12, '#d4a87a');
  _px(ctx, 71, 93, 1, 1, '#0f0c0a');
  _px(ctx, 76, 93, 1, 1, '#0f0c0a');
  _px(ctx, 70, 102, 12, 10, '#a78bfa');
  _px(ctx, 70, 112, 12, 8, '#1a1a1a');
  // Opponent crew on the right (3 figures)
  _px(ctx, 110, 88, 12, 12, '#d4a87a');
  _px(ctx, 110, 100, 12, 10, '#dc2626');
  _px(ctx, 110, 110, 12, 10, '#1a1a1a');
  _px(ctx, 130, 86, 14, 14, '#c89878');
  _px(ctx, 130, 100, 14, 12, '#fb7185');
  _px(ctx, 130, 112, 14, 8, '#1a1a1a');
  drawBeatboxer(ctx, 156, 110, { ...look, shirt: '#dc2626' }, 'left', true, fc);
  // VS in the middle
  if (fc % 30 < 18) _px(ctx, 96, 70, 4, 8, '#fbbf24');
  // Crew name banner
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(60, 14, 80, 14);
  ctx.fillStyle = '#fbbf24';
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(crewName || 'CREW', 100, 24);
  ctx.textAlign = 'start';
};

// ---- Flashbacks (childhood / origin scenes) and Dream sequence ----
// Childhood video — a kid alone in a bedroom with a mirror, recording.
const drawFlashbackChildhoodScene = (ctx, fc, look) => {
  const W = 200, H = 130;
  // Sepia tint background — childhood bedroom
  _px(ctx, 0, 0, W, 90, '#3a2a18');
  for (let y = 0; y < 90; y += 8) _px(ctx, 0, y, W, 1, '#2a1a08');
  _px(ctx, 0, 90, W, 40, '#5a3a18');
  // Posters on the wall (childhood beatbox heroes — colored squares)
  _px(ctx, 18, 14, 24, 32, '#dc2626');
  _px(ctx, 20, 16, 20, 26, '#fbbf24');
  _px(ctx, 50, 18, 22, 28, '#22d3ee');
  _px(ctx, 52, 20, 18, 22, '#a78bfa');
  // Mirror (small standing one)
  _px(ctx, 130, 30, 30, 50, '#5a4838');
  _px(ctx, 132, 32, 26, 46, '#1a2030');
  for (let i = 0; i < 5; i++) _px(ctx, 134 + i * 4, 35 + i * 8, 6, 2, 'rgba(255,255,255,0.10)');
  // Bed corner (left)
  _px(ctx, 0, 70, 30, 30, '#5a4040');
  // Kid (smaller drawBeatboxer-like figure, looking at the mirror)
  const kx = 100, ky = 110;
  _px(ctx, kx + 4, ky - 22, 8, 8, '#f4c098');     // head (smaller)
  _px(ctx, kx + 5, ky - 19, 1, 1, '#0f0c0a');     // eyes
  _px(ctx, kx + 9, ky - 19, 1, 1, '#0f0c0a');
  _px(ctx, kx + 4, ky - 14, 8, 6, look.shirt || '#a78bfa'); // shirt (small)
  _px(ctx, kx + 4, ky - 8, 8, 8, '#3a2818'); // pants
  _px(ctx, kx + 14, ky - 18, 5, 4, '#1a1a1a'); // tiny mic
  // "REC" indicator on a corner of the mirror (early phone screen)
  if (fc % 30 < 18) _px(ctx, 134, 35, 6, 4, '#dc2626');
  // Vignette
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  ctx.fillRect(0, 0, W, 12);
  ctx.fillRect(0, H - 16, W, 16);
};
// Parent voice — empty kitchen, late-night phone glow.
const drawFlashbackParentScene = (ctx, fc, look) => {
  const W = 200, H = 130;
  // Dark kitchen
  _px(ctx, 0, 0, W, 90, '#1a1818');
  _px(ctx, 0, 90, W, 40, '#2a2418');
  // Cabinets (silhouettes)
  for (let i = 0; i < 5; i++) _px(ctx, 8 + i * 36, 14, 30, 36, '#251f1c');
  // Phone glow on a counter — animated pulse
  const glow = 0.4 + 0.2 * Math.sin(fc * 0.1);
  ctx.fillStyle = `rgba(180, 200, 255, ${glow.toFixed(3)})`;
  ctx.beginPath(); ctx.arc(100, 100, 40, 0, Math.PI * 2); ctx.fill();
  // Phone (speaker on counter)
  _px(ctx, 95, 96, 12, 6, '#1a1a1a');
  _px(ctx, 96, 97, 10, 4, '#2a3050');
  // Player sitting on the floor against a wall, looking at phone
  drawBeatboxer(ctx, 60, 116, look, 'right', false, fc);
  // Tiny clock on the wall — late hour
  _px(ctx, 160, 16, 18, 18, '#1a1a1a');
  _px(ctx, 162, 18, 14, 14, '#3a3530');
  _px(ctx, 169, 19, 1, 6, '#fbbf24');
  _px(ctx, 169, 25, 4, 1, '#fbbf24');
};
// YouTube-comment flashback — a laptop screen at night.
const drawFlashbackCommentScene = (ctx, fc, look) => {
  const W = 200, H = 130;
  _px(ctx, 0, 0, W, 90, '#0a0d12');
  _px(ctx, 0, 90, W, 40, '#1a1818');
  // Laptop screen (centered)
  _px(ctx, 50, 30, 100, 60, '#1a1a1a');
  _px(ctx, 52, 32, 96, 56, '#0d0d0d');
  // Comment box (white with a quoted line)
  _px(ctx, 56, 38, 88, 24, '#fafafa');
  _px(ctx, 58, 41, 84, 2, '#e5e5e5');
  // Pretend text — alternating bars
  _px(ctx, 60, 45, 60, 1, '#0a0a0a');
  _px(ctx, 60, 48, 80, 1, '#0a0a0a');
  _px(ctx, 60, 51, 70, 1, '#0a0a0a');
  _px(ctx, 60, 56, 30, 2, '#dc2626'); // highlighted line
  // Reaction count + heart icon
  _px(ctx, 60, 64, 8, 6, '#dc2626');
  _px(ctx, 70, 65, 14, 4, '#7a7a7a');
  // Laptop base
  _px(ctx, 44, 90, 112, 6, '#2a2a2a');
  // Cursor blink
  if (fc % 30 < 16) _px(ctx, 144, 56, 1, 4, '#0a0a0a');
  // Player sitting in the dark, lit by the screen
  drawBeatboxer(ctx, 16, 116, look, 'right', false, fc);
};
// "The song" flashback — earbuds on a bus at night.
const drawFlashbackSongScene = (ctx, fc, look) => {
  const W = 200, H = 130;
  // Bus interior — windows show city lights streaking past
  _px(ctx, 0, 0, W, 90, '#15181f');
  _px(ctx, 0, 90, W, 40, '#0a0d10');
  // Windows
  for (let i = 0; i < 4; i++) {
    const wx = 10 + i * 48;
    _px(ctx, wx, 18, 38, 30, '#0a0d18');
    _px(ctx, wx, 18, 38, 1, '#3a3a40');
    _px(ctx, wx, 47, 38, 1, '#3a3a40');
    _px(ctx, wx, 18, 1, 30, '#3a3a40');
    _px(ctx, wx + 37, 18, 1, 30, '#3a3a40');
    // Streaking lights
    for (let l = 0; l < 5; l++) {
      const lx = (wx + 4 + ((fc * 2 + l * 9 + i * 7) % 30));
      _px(ctx, lx, 28 + (l % 3) * 5, 6, 1, '#fbbf24');
    }
  }
  // Player sitting (head bob — earbuds in)
  const bob = Math.floor(Math.sin(fc * 0.15) * 1);
  drawBeatboxer(ctx, 80, 110 + bob, look, 'right', false, fc);
  // Earbud cord — thin wavering line from ear to pocket
  ctx.strokeStyle = '#fafafa';
  ctx.beginPath();
  ctx.moveTo(94, 92 + bob);
  ctx.lineTo(96, 102 + bob);
  ctx.lineTo(94, 110 + bob);
  ctx.stroke();
  // Music notes drifting
  for (let i = 0; i < 3; i++) {
    const ny = 84 + bob - Math.floor(((fc + i * 12) % 36) / 2);
    _px(ctx, 110 + i * 6, ny, 2, 2, '#fbbf24');
    _px(ctx, 111 + i * 6, ny + 2, 1, 2, '#fbbf24');
  }
};

// ============ TITLE SCREEN ART ============
// Pixel-art splash for the main menu — sunset city skyline, neon sign, a
// mic on the foreground stage with animated sound rings + drifting embers.
// Sits behind the HTML title overlay in TitleScreen.
const drawTitleScene = (ctx, fc) => {
  const W = 200, H = 130;
  // Deep sunset sky
  _drawSky(ctx, W, 76, 0xff, 0x80, 0x40, 0x40, 0x18, 0x60);
  // Big sun
  _px(ctx, 130, 38, 30, 30, '#fef3c7');
  ctx.fillStyle = 'rgba(254,243,199,0.30)';
  ctx.beginPath(); ctx.arc(145, 53, 26, 0, Math.PI * 2); ctx.fill();
  // Distant city skyline silhouette (back row)
  for (let i = 0; i < 22; i++) {
    const bx = i * 9 - 4;
    const bh = 10 + ((i * 11 + 5) % 28);
    _px(ctx, bx, 76 - bh, 8, bh, '#1a0d2e');
    // Lit windows that twinkle
    for (let w = 0; w < 4; w++) {
      const wy = 76 - bh + 3 + w * 4;
      const wx = bx + (w % 2 ? 2 : 5);
      if ((fc + i * 3 + w * 7) % 90 < 40) _px(ctx, wx, wy, 1, 1, '#fbbf24');
    }
  }
  // Front-row taller buildings
  for (let i = 0; i < 7; i++) {
    const bx = i * 28 + 4;
    const bh = 30 + ((i * 13) % 14);
    _px(ctx, bx, 80 - bh, 24, bh, '#0c0820');
    _px(ctx, bx, 80 - bh, 1, bh, '#1a1530');         // edge highlight
    // Windows
    for (let r = 0; r < Math.floor(bh / 6); r++) {
      for (let c = 0; c < 3; c++) {
        const wx = bx + 4 + c * 6;
        const wy = 80 - bh + 4 + r * 6;
        if ((i + r + c) % 3 !== 0) {
          const on = (fc + i * 5 + r * 7 + c * 11) % 70 < 55;
          _px(ctx, wx, wy, 2, 2, on ? '#fbbf24' : '#3a3020');
        }
      }
    }
  }
  // Animated ground steam from subway grates
  for (let i = 0; i < 4; i++) {
    const phase = (fc + i * 20) % 60;
    const sx = 30 + i * 45;
    const sy = 92 - phase * 0.6;
    if (phase < 50) {
      ctx.globalAlpha = 0.4 * (1 - phase / 50);
      _px(ctx, sx, Math.floor(sy), 6, 2, '#a8a29e');
      _px(ctx, sx + 1, Math.floor(sy) - 2, 4, 2, '#a8a29e');
      ctx.globalAlpha = 1;
    }
  }
  // Stage floor + crowd
  _px(ctx, 0, 80, W, 50, '#0a0612');
  for (let i = 0; i < 20; i++) {
    const cx = 4 + i * 10;
    _px(ctx, cx, 110, 7, 6, '#1c1917');
    _px(ctx, cx + 1, 108, 5, 3, '#0c0a09');
  }
  // Mic stand center stage
  const mx = 100, my = 92;
  _px(ctx, mx, my, 2, 18, '#2a2a2a');                   // pole
  _px(ctx, mx - 1, my - 2, 4, 4, '#1a1a1a');           // base
  _px(ctx, mx - 3, my - 8, 8, 8, '#2a2a2a');           // head
  _px(ctx, mx - 2, my - 7, 6, 6, '#fbbf24');           // grille glow
  // Pulsing rings around the mic
  for (let r = 0; r < 4; r++) {
    const phase = ((fc + r * 14) % 56) / 56;
    ctx.globalAlpha = 0.45 * (1 - phase);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(mx + 1, my - 4, 6 + phase * 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // Rising embers
  for (let i = 0; i < 8; i++) {
    const phase = (fc + i * 11) % 110;
    const ex = mx + Math.sin((fc + i * 17) * 0.05) * (14 + phase * 0.2);
    const ey = my - 8 - phase * 0.6;
    if (ey > 30) {
      ctx.globalAlpha = (1 - phase / 110);
      _px(ctx, Math.floor(ex), Math.floor(ey), 1, 1, phase < 30 ? '#fef3c7' : '#fbbf24');
      ctx.globalAlpha = 1;
    }
  }
  // Vignette
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.fillRect(0, 0, W, 6);
  ctx.fillRect(0, H - 8, W, 8);
};

// ============ TITLE SCREEN ============
// Main-menu splash. Sits at the top of the screen flow on cold start.
// Plays the pixel-art title scene behind the game name; the Play button
// dispatches to the right downstream screen (hood / slots).
const TitleScreen = ({ char, hasActiveSlot, onPlay, onSlots, onSettings }) => {
  const [settings] = useSettings();
  const playLabel = hasActiveSlot && char?.name
    ? `Continue as ${char.name.toUpperCase()}`
    : 'New Game';
  return (
    <div className="min-h-screen flex flex-col items-center justify-between py-6 px-3 text-center"
      style={{
        background: 'linear-gradient(180deg, #1a0d2e 0%, #0c0a09 50%, #0c0a09 100%)',
        animation: settings.reducedMotion ? 'none' : 'screenFade 0.45s ease-out',
      }}>
      {/* Top spacer */}
      <div className="h-2" />

      {/* Title text */}
      <div className="space-y-1 pt-4">
        <div className="text-[10px] uppercase tracking-[0.5em] text-amber-500/70">A LIFE-SIM</div>
        <div className="text-[56px] sm:text-[72px] leading-none tracking-tighter text-amber-400"
          style={{
            fontFamily: '"Bebas Neue", "Oswald", sans-serif',
            textShadow: '4px 4px 0 #0c0a09, 8px 8px 24px rgba(212,160,23,0.30)',
          }}>
          BEATBOX<br />STORY
        </div>
        <div className="text-[11px] uppercase tracking-[0.4em] text-stone-400 pt-1">the cypher is calling</div>
      </div>

      {/* Centerpiece — hand-painted pixel-art title image. Sits in a
          framed box matching the rest of the game's UI; chunky-pixel
          imageRendering preserves the artwork's sharp pixels. */}
      <div className="w-full max-w-md mt-2">
        <div className="border-2 border-stone-800 overflow-hidden"
          style={{ boxShadow: '0 0 32px rgba(212,160,23,0.18)' }}>
          <img src="title.png" alt="Beatbox Story key art"
            className="block w-full h-auto"
            style={{ imageRendering: 'pixelated', aspectRatio: '1376 / 768' }} />
        </div>
      </div>

      {/* Buttons */}
      <div className="w-full max-w-md space-y-2">
        <button onClick={onPlay}
          className="w-full py-4 border-2 border-amber-500 bg-gradient-to-r from-amber-950/40 to-amber-900/30 text-amber-400 text-base uppercase tracking-[0.3em] hover:from-amber-900/50 hover:to-amber-800/40 active:scale-[0.98] transition-all"
          style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
          ▶ {playLabel}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onSlots}
            className="py-2 border-2 border-stone-700 text-stone-300 text-[11px] uppercase tracking-[0.3em] hover:border-amber-500/50 transition-all">
            👥 Beatboxers
          </button>
          <button onClick={onSettings}
            className="py-2 border-2 border-stone-700 text-stone-300 text-[11px] uppercase tracking-[0.3em] hover:border-amber-500/50 transition-all">
            ⚙ Settings
          </button>
        </div>
        <div className="text-[9px] uppercase tracking-[0.3em] text-stone-600 pt-1">
          v · built with ❤︎
        </div>
      </div>
    </div>
  );
};

// Dream sequence — abstract surreal scene. Fires on rare sleep events post-day-30.
const drawDreamScene = (ctx, fc, look) => {
  const W = 200, H = 130;
  // Violet/pink dream sky, darker at top
  _drawSky(ctx, W, 86, 0x12, 0x08, 0x30, 0x6a, 0x20, 0x8a);
  // Twinkling stars and pink motes
  for (let i = 0; i < 20; i++) {
    const sx = (i * 13 + (fc / 4 | 0)) % W;
    const sy = (i * 7) % 60;
    const tw = (fc + i * 9) % 80;
    if (tw < 50) _px(ctx, sx, sy, 1, 1, tw < 25 ? '#fef3c7' : '#fbcfe8');
  }
  // Glowing horizon band where the stage meets the void
  for (let y = 80; y < 90; y++) {
    const t = (y - 80) / 10;
    const r = Math.floor(0x6a + t * 0x40);
    const g = Math.floor(0x20 + t * 0x18);
    const b = Math.floor(0x8a - t * 0x40);
    _px(ctx, 0, y, W, 1, `rgb(${r},${g},${b})`);
  }
  // Stage floor — receding checker with subtle scroll
  _px(ctx, 0, 90, W, 40, '#0a0820');
  for (let row = 0; row < 5; row++) {
    const y = 90 + row * 8;
    const cellW = 6 + row * 3;
    const offset = (fc / 6 + row * 4) | 0;
    for (let x = -cellW + (offset % (cellW * 2)); x < W; x += cellW * 2) {
      _px(ctx, x, y, cellW, 8, '#1a0d3a');
    }
  }
  // Floating geometric shapes — drift, bob, faint echo trail
  const colors = ['#fbbf24', '#22d3ee', '#fb7185', '#a78bfa', '#84cc16', '#f97316', '#fde68a'];
  for (let i = 0; i < 8; i++) {
    const baseX = (i * 27 + (fc / 2 | 0)) % (W + 20) - 10;
    const baseY = 18 + ((i * 19) % 60) + Math.floor(Math.sin((fc + i * 30) * 0.04) * 4);
    const sz = 5 + (i % 3) * 3;
    const c = colors[i % colors.length];
    _px(ctx, baseX, baseY, sz, sz, c);
    _px(ctx, baseX + 1, baseY + 1, Math.max(1, sz - 3), 1, '#fff');
    ctx.globalAlpha = 0.25;
    _px(ctx, baseX - 4, baseY + 2, sz, sz, c);
    ctx.globalAlpha = 1;
  }
  // Crowd silhouettes — heads with arms that wave in and out
  for (let i = 0; i < 18; i++) {
    const cx = 4 + i * 11;
    const wave = Math.sin((fc + i * 14) * 0.06);
    const cy = 100 + (i % 3) * 4;
    _px(ctx, cx, cy, 6, 6, '#0a0510');
    if (wave > 0.4) {
      _px(ctx, cx - 1, cy - 5, 2, 6, '#0a0510');
      _px(ctx, cx + 5, cy - 5, 2, 6, '#0a0510');
    } else if (wave > 0) {
      _px(ctx, cx, cy - 3, 2, 4, '#0a0510');
      _px(ctx, cx + 4, cy - 3, 2, 4, '#0a0510');
    }
  }
  // Stage platform behind the crowd
  _px(ctx, 60, 86, 80, 4, '#1a1a1a');
  _px(ctx, 60, 86, 80, 1, '#3a3a3a');
  // Mic + stand on the stage; player floats above
  _px(ctx, 99, 60, 2, 26, '#1a1a1a');
  _px(ctx, 96, 56, 8, 6, '#2a2a2a');
  _px(ctx, 97, 57, 6, 4, '#fbbf24');
  // Spotlight cone from above
  ctx.fillStyle = 'rgba(254,243,199,0.10)';
  ctx.beginPath();
  ctx.moveTo(100, 0);
  ctx.lineTo(60, 90);
  ctx.lineTo(140, 90);
  ctx.closePath();
  ctx.fill();
  // Pulsing echo rings around the mic
  for (let r = 0; r < 4; r++) {
    const phase = ((fc + r * 18) % 72) / 72;
    ctx.globalAlpha = 0.5 * (1 - phase);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(100, 60, 6 + phase * 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // Player floating mid-air above the mic
  const float = Math.sin(fc * 0.12) * 3;
  drawBeatboxer(ctx, 92, Math.floor(46 + float), look, 'right', true, fc);
  // Vignette
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.fillRect(0, 0, W, 8);
  ctx.fillRect(0, H - 10, W, 10);
};

// Apartment Tier 2 move-in — a nicer flat. Hardwood, art on the wall, a window.
const drawApt2Scene = (ctx, fc, look) => {
  const W = 200, H = 130;
  _px(ctx, 0, 0, W, 90, '#3a2a1a'); // warm wall
  for (let y = 0; y < 90; y += 16) _px(ctx, 0, y, W, 1, '#2a1a10');
  _px(ctx, 0, 90, W, 40, '#4a3018'); // hardwood floor
  for (let x = 0; x < W; x += 14) _px(ctx, x, 90, 1, 40, '#3a2010');
  // Window
  _px(ctx, 130, 16, 50, 36, '#1a2030');
  _px(ctx, 130, 16, 50, 2, '#5a4830');
  _px(ctx, 130, 16, 2, 36, '#5a4830');
  _px(ctx, 178, 16, 2, 36, '#5a4830');
  _px(ctx, 130, 50, 50, 2, '#5a4830');
  _px(ctx, 154, 16, 2, 36, '#5a4830');
  _px(ctx, 130, 32, 50, 2, '#5a4830');
  // City lights through window (animated twinkle)
  for (let i = 0; i < 8; i++) {
    const lx = 134 + (i * 6 + (fc / 10 | 0)) % 44;
    const ly = 22 + (i % 3) * 8;
    if ((fc + i * 3) % 30 < 18) _px(ctx, lx, ly, 1, 1, '#fbbf24');
  }
  // Couch
  _px(ctx, 16, 70, 60, 22, '#7a3a3a');
  _px(ctx, 16, 70, 60, 3, '#9a4a4a');
  _px(ctx, 16, 92, 60, 4, '#3a1a1a');
  _px(ctx, 22, 64, 16, 8, '#9a4a4a');
  _px(ctx, 54, 64, 16, 8, '#9a4a4a');
  // Framed art on wall
  _px(ctx, 30, 14, 30, 22, '#1a1a1a');
  _px(ctx, 32, 16, 26, 18, '#fbbf24');
  _px(ctx, 36, 20, 18, 10, '#dc2626');
  // Plant
  _px(ctx, 88, 70, 12, 22, '#3a2010');
  _px(ctx, 86, 60, 16, 12, '#3a7028');
  _px(ctx, 88, 56, 12, 8, '#4a8030');
  // Player standing center, looking around
  drawBeatboxer(ctx, 110, 110, look, 'right', true, fc);
  // Boxes on the floor (just moved in)
  _px(ctx, 80, 100, 14, 12, '#7a5a30');
  _px(ctx, 80, 100, 14, 2, '#5a3a20');
};

// Apartment Tier 3 move-in — a loft with a home studio.
const drawApt3Scene = (ctx, fc, look) => {
  const W = 200, H = 130;
  _px(ctx, 0, 0, W, 92, '#1a1a20'); // dark loft wall
  // Brick texture accents
  for (let y = 0; y < 92; y += 6) for (let x = (y % 12 === 0 ? 0 : 6); x < W; x += 12) _px(ctx, x, y, 5, 5, '#2a2025');
  _px(ctx, 0, 92, W, 38, '#2a2018'); // polished concrete floor
  // Big window with skyline
  _px(ctx, 10, 8, 110, 60, '#0a1020');
  _px(ctx, 10, 8, 110, 2, '#5a4830');
  _px(ctx, 10, 66, 110, 2, '#5a4830');
  _px(ctx, 10, 8, 2, 60, '#5a4830');
  _px(ctx, 118, 8, 2, 60, '#5a4830');
  // City skyline silhouette
  for (let i = 0; i < 12; i++) {
    const bx = 12 + i * 9;
    const bh = 12 + ((i * 7) % 22);
    _px(ctx, bx, 68 - bh, 8, bh, '#1a1525');
    if ((fc + i * 5) % 50 < 30) _px(ctx, bx + 2 + (i % 3) * 2, 68 - bh + 4, 1, 1, '#fbbf24');
    if ((fc + i * 7) % 50 < 30) _px(ctx, bx + 4, 68 - bh + 8, 1, 1, '#fbbf24');
  }
  // Moon
  _px(ctx, 100, 16, 8, 8, '#fef3c7');
  // Mixing desk in foreground (signature loft-studio piece)
  _px(ctx, 130, 70, 60, 20, '#0a0a0a');
  _px(ctx, 130, 70, 60, 2, '#3a3a3a');
  for (let i = 0; i < 8; i++) {
    const fx = 134 + i * 7;
    _px(ctx, fx, 74, 1, 14, '#4a4a4a');
    _px(ctx, fx - 1, 76 + (i % 5) * 2, 3, 2, '#fbbf24');
  }
  // Monitors (twin speakers)
  _px(ctx, 132, 56, 12, 14, '#1a1a1a');
  _px(ctx, 134, 60, 8, 4, '#fbbf24');
  _px(ctx, 176, 56, 12, 14, '#1a1a1a');
  _px(ctx, 178, 60, 8, 4, '#fbbf24');
  // Player standing in the middle, taking it in
  drawBeatboxer(ctx, 70, 110, look, 'right', true, fc);
};

// Houseplant drowning — fires when the 4th watering of the day kills the plant.
// Late kitchen, water cascading off the pot, plant slumped, regretful pose.
const drawPlantDrownScene = (ctx, fc, look) => {
  const W = 200, H = 130;
  // Dim kitchen wall — same dotted wallpaper as the soup scene, blue-shifted
  _px(ctx, 0, 0, W, 95, '#2a1f30');
  for (let y = 8; y < 95; y += 12) for (let x = 8; x < W; x += 12) _px(ctx, x, y, 1, 1, '#3a2540');
  _px(ctx, 0, 94, W, 1, '#3a2540');
  // Floor
  _px(ctx, 0, 95, W, 35, '#251510');
  _px(ctx, 0, 95, W, 1, '#3a1f18');
  for (let i = 0; i < 5; i++) _px(ctx, i * 40, 96, 1, 34, '#1a0808');
  // Window — moonlit
  _px(ctx, 6, 8, 30, 24, '#0a1530');
  _px(ctx, 6, 8, 30, 1, '#1a1a1a');
  _px(ctx, 6, 31, 30, 1, '#1a1a1a');
  _px(ctx, 6, 8, 1, 24, '#1a1a1a');
  _px(ctx, 35, 8, 1, 24, '#1a1a1a');
  _px(ctx, 20, 8, 1, 24, '#1a1a1a');
  _px(ctx, 6, 19, 30, 1, '#1a1a1a');
  // Moon + a few stars
  _px(ctx, 26, 12, 4, 4, '#fef3c7');
  _px(ctx, 12, 14, 1, 1, '#fff');
  _px(ctx, 16, 24, 1, 1, '#fff');
  // Counter where the pot sits
  _px(ctx, 60, 64, 110, 4, '#7a5040');
  _px(ctx, 60, 64, 110, 1, '#a07050');
  _px(ctx, 60, 68, 110, 22, '#3a2418');
  // Sickly pendant lamp glow above the pot
  ctx.fillStyle = 'rgba(254,243,199,0.10)';
  ctx.beginPath(); ctx.arc(110, 50, 36, 0, Math.PI * 2); ctx.fill();
  _px(ctx, 108, 0, 4, 14, '#1a1a1a');
  _px(ctx, 102, 14, 16, 4, '#3a3a3a');
  _px(ctx, 104, 18, 12, 4, '#fbbf24');
  // ---- Pot of doom ----
  const px = 100, py = 44;
  // Pot body
  _px(ctx, px, py + 14, 22, 6, '#5a3018');
  _px(ctx, px - 1, py + 12, 24, 2, '#6a3820');
  _px(ctx, px, py + 14, 22, 1, '#8a5030');
  // Soaked dirt overflowing the rim
  _px(ctx, px + 1, py + 11, 20, 2, '#1a0a05');
  // Drowned plant — bent stalk + droopy leaves
  _px(ctx, px + 9, py - 2, 2, 14, '#4a5028');
  _px(ctx, px + 11, py + 1, 2, 4, '#4a5028');
  _px(ctx, px + 4, py + 2, 6, 2, '#a08030');
  _px(ctx, px + 3, py + 4, 4, 2, '#7a5028');
  _px(ctx, px + 13, py + 1, 6, 2, '#8a6028');
  _px(ctx, px + 16, py + 3, 5, 2, '#6a4828');
  // One leaf falling, drifting
  const leafY = py - 4 + Math.floor(((fc % 90) / 90) * 30);
  const leafX = px + 12 + Math.sin(fc * 0.1) * 3;
  ctx.globalAlpha = 0.9;
  _px(ctx, Math.floor(leafX), leafY, 4, 2, '#a08030');
  ctx.globalAlpha = 1;
  // Water cascading down the pot's sides
  for (let i = 0; i < 8; i++) {
    const phase = (fc + i * 7) % 50;
    const wx = px - 1 + (i % 2 === 0 ? 0 : 22);
    const wy = py + 12 + (phase / 2 | 0);
    if (wy < 96) _px(ctx, wx, wy, 1, 3, '#7ec0e8');
  }
  // Puddle expanding under the pot
  const pud = Math.min(28, 6 + Math.floor(fc / 8));
  _px(ctx, Math.floor(px + 11 - pud / 2), py + 20, pud, 2, '#3a6080');
  _px(ctx, Math.floor(px + 11 - pud / 2), py + 20, pud, 1, '#7ec0e8');
  // Drips spilling off the counter edge to the floor
  for (let i = 0; i < 4; i++) {
    const phase = (fc + i * 13) % 60;
    const dx = px - 6 + i * 11;
    const dy = 68 + phase;
    if (dy < 100) _px(ctx, dx, dy, 1, 3, '#7ec0e8');
  }
  // Watering can on the counter, tipped forward, still dripping
  const cx = 152, cy = 56;
  _px(ctx, cx, cy, 18, 8, '#5a8038');
  _px(ctx, cx, cy, 18, 1, '#7aa048');
  _px(ctx, cx + 16, cy - 4, 6, 4, '#5a8038');
  _px(ctx, cx + 16, cy - 4, 6, 1, '#7aa048');
  _px(ctx, cx - 4, cy + 1, 4, 5, '#3a5028');
  if (fc % 36 < 30) _px(ctx, cx + 18, cy + (fc % 36 / 4 | 0), 1, 2, '#7ec0e8');
  // Player on the left, hand to forehead, regretful
  const ppx = 30;
  // Legs
  _px(ctx, ppx - 4, 116, 3, 10, '#1a1a2e');
  _px(ctx, ppx + 1, 116, 3, 10, '#1a1a2e');
  _px(ctx, ppx - 4, 125, 3, 1, '#fff');
  _px(ctx, ppx + 1, 125, 3, 1, '#fff');
  // Body
  _px(ctx, ppx - 5, 105, 10, 11, look?.shirt || '#a78bfa');
  _px(ctx, ppx - 5, 105, 10, 1, '#fff');
  // Right arm hanging
  _px(ctx, ppx + 5, 106, 2, 8, look?.shirt || '#a78bfa');
  _px(ctx, ppx + 5, 113, 2, 2, look?.skin || '#d4a87a');
  // Left arm raised — hand on forehead
  _px(ctx, ppx - 7, 100, 2, 6, look?.shirt || '#a78bfa');
  _px(ctx, ppx - 5, 96, 4, 2, look?.shirt || '#a78bfa');
  _px(ctx, ppx - 1, 96, 2, 2, look?.skin || '#d4a87a');
  // Head
  _px(ctx, ppx - 4, 98, 8, 7, look?.skin || '#d4a87a');
  _px(ctx, ppx - 4, 96, 8, 3, look?.hair || '#1a1a2e');
  // Sad eyes, frown
  _px(ctx, ppx - 3, 101, 2, 1, '#0c0a09');
  _px(ctx, ppx + 1, 101, 2, 1, '#0c0a09');
  _px(ctx, ppx - 1, 104, 3, 1, '#3a1010');
  // Sweat drop above head
  if (fc % 60 < 40) {
    _px(ctx, ppx + 6, 90, 1, 3, '#7ec0e8');
    _px(ctx, ppx + 6, 92, 2, 2, '#7ec0e8');
  }
  // Vignette
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 0, W, 8);
  ctx.fillRect(0, H - 10, W, 10);
};

// Houseplant arrival — Tuesday morning. Bright, hopeful counterpart to the
// drown scene; fires when the player buys a replacement plant.
const drawPlantArrivedScene = (ctx, fc, look) => {
  const W = 200, H = 130;
  // Sunny morning kitchen — warmer wallpaper
  _px(ctx, 0, 0, W, 95, '#5a4a48');
  for (let y = 8; y < 95; y += 12) for (let x = 8; x < W; x += 12) _px(ctx, x, y, 1, 1, '#7a6a68');
  _px(ctx, 0, 94, W, 1, '#7a6a68');
  // Floor
  _px(ctx, 0, 95, W, 35, '#5a3018');
  _px(ctx, 0, 95, W, 1, '#8a5028');
  for (let i = 0; i < 5; i++) _px(ctx, i * 40, 96, 1, 34, '#3a1808');
  // Big window with bright morning sky
  _px(ctx, 110, 8, 60, 44, '#bfe0f0');
  _px(ctx, 110, 8, 60, 1, '#1a1a1a');
  _px(ctx, 110, 51, 60, 1, '#1a1a1a');
  _px(ctx, 110, 8, 1, 44, '#1a1a1a');
  _px(ctx, 169, 8, 1, 44, '#1a1a1a');
  _px(ctx, 140, 8, 1, 44, '#1a1a1a');
  _px(ctx, 110, 28, 60, 1, '#1a1a1a');
  // Sun + halo
  _px(ctx, 152, 14, 12, 12, '#fef3c7');
  ctx.fillStyle = 'rgba(254,243,199,0.30)';
  ctx.beginPath(); ctx.arc(158, 20, 18, 0, Math.PI * 2); ctx.fill();
  // Distant rooftops
  for (let i = 0; i < 6; i++) {
    const bx = 112 + i * 10;
    const bh = 6 + (i * 3) % 8;
    _px(ctx, bx, 50 - bh, 8, bh, '#3a4050');
  }
  // Counter
  _px(ctx, 0, 64, 90, 4, '#a07050');
  _px(ctx, 0, 64, 90, 1, '#c08070');
  _px(ctx, 0, 68, 90, 22, '#5a3a28');
  // Sunbeam falling onto the counter (with drifting dust motes)
  ctx.fillStyle = 'rgba(254,243,199,0.16)';
  ctx.beginPath();
  ctx.moveTo(132, 8); ctx.lineTo(160, 8);
  ctx.lineTo(80, 95); ctx.lineTo(50, 95);
  ctx.closePath(); ctx.fill();
  for (let i = 0; i < 8; i++) {
    const phase = (fc + i * 11) % 120;
    const dx = 60 + ((i * 9 + (fc / 4 | 0)) % 60);
    const dy = 20 + phase / 2;
    if (dy < 90) _px(ctx, dx, Math.floor(dy), 1, 1, '#fef3c7');
  }
  // Paper shopping bag with receipt sticking out
  const bagX = 12, bagY = 50;
  _px(ctx, bagX, bagY, 24, 14, '#c0a070');
  _px(ctx, bagX, bagY, 24, 2, '#a08050');
  _px(ctx, bagX + 4, bagY + 4, 4, 8, '#a08050');
  _px(ctx, bagX + 16, bagY + 4, 4, 8, '#a08050');
  _px(ctx, bagX + 26, bagY + 2, 6, 12, '#fafafa');
  _px(ctx, bagX + 27, bagY + 4, 4, 1, '#1a1a1a');
  _px(ctx, bagX + 27, bagY + 6, 3, 1, '#1a1a1a');
  _px(ctx, bagX + 27, bagY + 8, 4, 1, '#1a1a1a');
  // ---- Fresh houseplant centerpiece ----
  const px = 56, py = 40;
  // Terracotta pot
  _px(ctx, px, py + 14, 22, 8, '#a04020');
  _px(ctx, px - 1, py + 12, 24, 2, '#c05030');
  _px(ctx, px, py + 14, 22, 1, '#d06040');
  _px(ctx, px + 2, py + 16, 18, 1, '#7a3018');
  // Soil
  _px(ctx, px + 1, py + 11, 20, 2, '#3a1f10');
  // Plant — vibrant, layered greens
  _px(ctx, px + 9, py - 2, 2, 14, '#3a7028');
  _px(ctx, px + 2, py - 2, 8, 4, '#3a7028');
  _px(ctx, px + 3, py - 1, 6, 2, '#5a9038');
  _px(ctx, px + 11, py - 4, 8, 5, '#3a7028');
  _px(ctx, px + 12, py - 3, 6, 3, '#5a9038');
  _px(ctx, px + 6, py - 6, 8, 4, '#4a8030');
  _px(ctx, px + 7, py - 5, 6, 2, '#6aa040');
  _px(ctx, px + 4, py + 2, 14, 3, '#3a7028');
  _px(ctx, px + 5, py + 3, 12, 1, '#5a9038');
  // New shoot wiggling at the top
  const wig = Math.sin(fc * 0.08) * 1;
  _px(ctx, Math.floor(px + 9 + wig), py - 8, 1, 3, '#84cc16');
  _px(ctx, Math.floor(px + 9 + wig), py - 9, 2, 1, '#a3e635');
  // Sparkle particles
  for (let i = 0; i < 4; i++) {
    const phase = (fc + i * 24) % 96;
    if (phase < 60) {
      ctx.globalAlpha = 1 - phase / 60;
      const sx = px + 4 + i * 5;
      const sy = py - 14 + Math.floor(Math.sin((fc + i * 20) * 0.1) * 3);
      _px(ctx, sx, sy, 1, 3, '#fef3c7');
      _px(ctx, sx - 1, sy + 1, 3, 1, '#fef3c7');
      ctx.globalAlpha = 1;
    }
  }
  // "TUE" price sticker on the pot
  _px(ctx, px + 13, py + 17, 8, 4, '#fafafa');
  ctx.fillStyle = '#0a0a0a';
  ctx.font = 'bold 3px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('TUE', px + 17, py + 20);
  // Player on the right, smiling toward the plant
  const ppx = 150;
  _px(ctx, ppx - 4, 116, 3, 10, '#1a1a2e');
  _px(ctx, ppx + 1, 116, 3, 10, '#1a1a2e');
  _px(ctx, ppx - 4, 125, 3, 1, '#fff');
  _px(ctx, ppx + 1, 125, 3, 1, '#fff');
  _px(ctx, ppx - 5, 105, 10, 11, look?.shirt || '#a78bfa');
  _px(ctx, ppx - 5, 105, 10, 1, '#fff');
  _px(ctx, ppx - 7, 106, 2, 8, look?.shirt || '#a78bfa');
  _px(ctx, ppx + 5, 106, 2, 8, look?.shirt || '#a78bfa');
  _px(ctx, ppx - 7, 113, 2, 2, look?.skin || '#d4a87a');
  _px(ctx, ppx + 5, 113, 2, 2, look?.skin || '#d4a87a');
  _px(ctx, ppx - 4, 98, 8, 7, look?.skin || '#d4a87a');
  _px(ctx, ppx - 4, 96, 8, 3, look?.hair || '#1a1a2e');
  // Eyes + smile
  _px(ctx, ppx - 3, 101, 1, 1, '#0c0a09');
  _px(ctx, ppx + 2, 101, 1, 1, '#0c0a09');
  _px(ctx, ppx - 2, 103, 4, 1, '#3a1010');
  _px(ctx, ppx - 3, 102, 1, 1, '#3a1010');
  _px(ctx, ppx + 2, 102, 1, 1, '#3a1010');
  // Tiny heart drifting from player toward plant
  if (fc % 90 < 70) {
    const hp = (fc % 90) / 70;
    const hx = 140 - hp * 70;
    const hy = 96 - Math.sin(hp * Math.PI) * 12;
    ctx.globalAlpha = Math.max(0, 1 - hp * 0.8);
    _px(ctx, Math.floor(hx), Math.floor(hy), 3, 2, '#fb7185');
    _px(ctx, Math.floor(hx), Math.floor(hy + 2), 1, 1, '#fb7185');
    _px(ctx, Math.floor(hx + 2), Math.floor(hy + 2), 1, 1, '#fb7185');
    ctx.globalAlpha = 1;
  }
  // Vignette
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 0, W, 6);
  ctx.fillRect(0, H - 8, W, 8);
};

// ============ WEEKEND TOUR ============
// Three-beat sequence that plays when the player goes on the out-of-town tour.
// Beat 1 (road) → Beat 2 (motel) → Beat 3 (headline stage with reward).

// Beat 1 — the tour van rolling down the highway at golden hour, gear strapped
// to the roof, distant city skyline ahead.
const drawTourRoadScene = (ctx, fc, look) => {
  const W = 200, H = 130;
  // Sunset sky — orange high to pink-violet low
  _drawSky(ctx, W, 70, 0xff, 0x90, 0x40, 0x60, 0x30, 0x80);
  // Sun on the horizon, half-set
  _px(ctx, 144, 56, 22, 14, '#fef3c7');
  ctx.fillStyle = 'rgba(254,243,199,0.30)';
  ctx.beginPath(); ctx.arc(155, 60, 22, 0, Math.PI * 2); ctx.fill();
  // Distant city skyline silhouette
  for (let i = 0; i < 16; i++) {
    const bx = i * 13;
    const bh = 10 + ((i * 7 + 3) % 26);
    _px(ctx, bx, 70 - bh, 11, bh, '#1a1a25');
    // A few lit windows
    for (let w = 0; w < 3; w++) {
      const wx = bx + 2 + w * 3;
      const wy = 70 - bh + 4 + (w % 2) * 6;
      if ((i + w) % 3 === 0) _px(ctx, wx, wy, 1, 1, '#fbbf24');
    }
  }
  // Road horizon haze
  _px(ctx, 0, 70, W, 2, '#3a2a30');
  // Asphalt
  _px(ctx, 0, 72, W, 58, '#1a1a20');
  // Road shoulder lines
  _px(ctx, 0, 72, W, 1, '#5a5050');
  _px(ctx, 0, 128, W, 2, '#3a3030');
  // Receding lane stripes — animated scroll
  for (let i = 0; i < 14; i++) {
    const offset = (fc * 4) % 28;
    const x = (i * 28) - offset;
    // Perspective: stripes get longer/thicker as they come forward
    const t = i / 14;
    const stripeW = 12 + t * 16;
    const stripeH = 1 + Math.floor(t * 3);
    const y = 80 + Math.floor(t * 38);
    _px(ctx, Math.floor(x), y, Math.floor(stripeW), stripeH, '#fef3c7');
  }
  // Telephone poles passing on the right
  for (let i = 0; i < 4; i++) {
    const px = ((i * 60) - (fc * 3) % 60) + 180;
    if (px > -10 && px < W + 10) {
      _px(ctx, px, 50, 2, 30, '#3a2818');
      _px(ctx, px - 4, 52, 10, 1, '#3a2818');
    }
  }
  // ---- Tour van ----
  // Subtle bounce
  const vbob = Math.sin(fc * 0.3) > 0 ? 0 : 1;
  const vx = 50, vy = 86 + vbob;
  // Body
  _px(ctx, vx, vy, 76, 26, '#dc2626');
  _px(ctx, vx, vy, 76, 3, '#7a1010');                  // shadow band on top
  _px(ctx, vx, vy + 23, 76, 3, '#7a1010');             // skirt shadow
  // Cab front (slight slope)
  _px(ctx, vx + 76, vy + 4, 8, 22, '#dc2626');
  _px(ctx, vx + 84, vy + 8, 4, 18, '#dc2626');
  _px(ctx, vx + 88, vy + 12, 2, 14, '#dc2626');
  // Side windows
  _px(ctx, vx + 6, vy + 4, 18, 10, '#1a2030');
  _px(ctx, vx + 26, vy + 4, 18, 10, '#1a2030');
  _px(ctx, vx + 46, vy + 4, 18, 10, '#1a2030');
  _px(ctx, vx + 6, vy + 4, 18, 1, '#3a4050');          // top reflection
  _px(ctx, vx + 26, vy + 4, 18, 1, '#3a4050');
  _px(ctx, vx + 46, vy + 4, 18, 1, '#3a4050');
  // Window mullions
  _px(ctx, vx + 24, vy + 4, 2, 10, '#1a1a1a');
  _px(ctx, vx + 44, vy + 4, 2, 10, '#1a1a1a');
  // Player silhouette in middle window — head bobs
  const hbob = Math.sin(fc * 0.18) > 0 ? 0 : 1;
  _px(ctx, vx + 32, vy + 6 + hbob, 6, 6, look?.skin || '#d4a87a');
  _px(ctx, vx + 32, vy + 4 + hbob, 6, 3, look?.hair || '#1a1a2e');
  _px(ctx, vx + 33, vy + 8 + hbob, 1, 1, '#0c0a09');
  _px(ctx, vx + 36, vy + 8 + hbob, 1, 1, '#0c0a09');
  // Driver in the cab window
  _px(ctx, vx + 78, vy + 10, 5, 5, '#84cc16');
  _px(ctx, vx + 78, vy + 9, 5, 2, '#1a1a2e');
  // "TOUR" decal on the side
  ctx.fillStyle = '#fef3c7';
  ctx.font = 'bold 7px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('TOUR', vx + 38, vy + 22);
  // Headlight cone (it's getting dark)
  ctx.fillStyle = 'rgba(254,243,199,0.20)';
  ctx.beginPath();
  ctx.moveTo(vx + 90, vy + 18);
  ctx.lineTo(vx + 130, vy + 6);
  ctx.lineTo(vx + 130, vy + 30);
  ctx.closePath();
  ctx.fill();
  _px(ctx, vx + 88, vy + 16, 2, 4, '#fef3c7');
  // Tail light
  _px(ctx, vx, vy + 16, 2, 4, '#dc2626');
  // Wheels (animated rotation via simple alternating spokes)
  const spoke = (fc % 8) < 4;
  _px(ctx, vx + 8, vy + 22, 12, 8, '#0a0a0a');
  _px(ctx, vx + 11, vy + 24, 6, 4, spoke ? '#3a3a3a' : '#5a5a5a');
  _px(ctx, vx + 64, vy + 22, 12, 8, '#0a0a0a');
  _px(ctx, vx + 67, vy + 24, 6, 4, spoke ? '#3a3a3a' : '#5a5a5a');
  // Gear strapped to the roof — speakers + cases
  _px(ctx, vx + 10, vy - 8, 18, 8, '#1a1a1a');         // speaker case
  _px(ctx, vx + 12, vy - 6, 6, 4, '#fbbf24');          // speaker cone
  _px(ctx, vx + 30, vy - 6, 24, 6, '#3a2818');         // duffel
  _px(ctx, vx + 30, vy - 6, 24, 1, '#5a3828');
  _px(ctx, vx + 56, vy - 8, 14, 8, '#1a1a1a');         // mic case
  // Strap
  _px(ctx, vx + 8, vy - 8, 64, 1, '#5a5a5a');
  _px(ctx, vx + 8, vy + 1, 1, 1, '#5a5a5a');
  _px(ctx, vx + 72, vy + 1, 1, 1, '#5a5a5a');
  // Exhaust puff trailing behind
  for (let i = 0; i < 3; i++) {
    const ph = (fc + i * 12) % 36;
    if (ph < 30) {
      ctx.globalAlpha = 0.5 * (1 - ph / 30);
      _px(ctx, vx - 6 - i * 4, vy + 22, 4, 3, '#a8a29e');
      ctx.globalAlpha = 1;
    }
  }
  // Vignette
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  ctx.fillRect(0, 0, W, 6);
  ctx.fillRect(0, H - 8, W, 8);
};

// Beat 2 — cheap motel room at night with the gig gear staged for tomorrow.
// Neon "MOTEL" sign flickers through the window, TV static plays low.
const drawTourMotelScene = (ctx, fc, look) => {
  const W = 200, H = 130;
  // Dim wall — old wallpaper with a tired mustard-and-brown stripe
  _px(ctx, 0, 0, W, 95, '#3a2a18');
  for (let y = 0; y < 95; y += 6) _px(ctx, 0, y, W, 1, y % 12 === 0 ? '#4a3520' : '#2a1a08');
  // Wall trim
  _px(ctx, 0, 94, W, 1, '#5a3a20');
  // Carpet floor — ugly green
  _px(ctx, 0, 95, W, 35, '#3a4828');
  for (let i = 0; i < 24; i++) {
    const fx = (i * 9 + 3) % W;
    const fy = 96 + (i % 4) * 8;
    _px(ctx, fx, fy, 2, 1, '#2a3818');
  }
  // ---- Window with neon MOTEL sign outside ----
  _px(ctx, 110, 14, 70, 50, '#0a0a18');                 // night sky
  _px(ctx, 110, 14, 70, 1, '#1a1a1a');
  _px(ctx, 110, 63, 70, 1, '#1a1a1a');
  _px(ctx, 110, 14, 1, 50, '#1a1a1a');
  _px(ctx, 179, 14, 1, 50, '#1a1a1a');
  _px(ctx, 144, 14, 1, 50, '#1a1a1a');
  _px(ctx, 110, 38, 70, 1, '#1a1a1a');
  // Distant building rooftops
  for (let i = 0; i < 8; i++) {
    const bx = 112 + i * 9;
    const bh = 4 + (i * 5) % 10;
    _px(ctx, bx, 64 - bh, 7, bh, '#1a1525');
  }
  // Stars
  for (let i = 0; i < 8; i++) {
    const sx = 112 + (i * 8 + 3) % 65;
    const sy = 16 + (i * 3) % 18;
    if ((fc + i * 7) % 100 < 60) _px(ctx, sx, sy, 1, 1, '#fef3c7');
  }
  // Neon MOTEL sign (across the street)
  const flick = (fc % 90) < 80 ? 1 : 0.4;        // occasional flicker
  ctx.globalAlpha = flick;
  // Sign post
  _px(ctx, 150, 50, 2, 14, '#3a3a3a');
  // Sign frame
  _px(ctx, 138, 26, 30, 24, '#1a1a1a');
  _px(ctx, 140, 28, 26, 20, '#3a1010');
  // M O T E L letters in pink neon (5 little glyphs as colored bars)
  ctx.fillStyle = '#fb7185';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('MOTEL', 153, 41);
  // Neon glow halo
  ctx.globalAlpha = 0.3 * flick;
  ctx.fillStyle = '#fb7185';
  ctx.beginPath(); ctx.arc(153, 38, 24, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  // Cast pink light inside the room (window glow)
  ctx.fillStyle = `rgba(251,113,133,${(0.10 * flick).toFixed(3)})`;
  ctx.fillRect(80, 50, 100, 50);
  // ---- Bed (left) ----
  const bx = 6, by = 76;
  // Frame
  _px(ctx, bx, by, 80, 22, '#5a3a28');
  _px(ctx, bx, by, 80, 3, '#7a5040');
  // Mattress
  _px(ctx, bx + 4, by + 4, 72, 14, '#fafafa');
  _px(ctx, bx + 4, by + 4, 72, 1, '#dadada');
  // Tan blanket on top
  _px(ctx, bx + 8, by + 6, 64, 8, '#a87a48');
  _px(ctx, bx + 8, by + 6, 64, 1, '#c89a68');
  // Pillow
  _px(ctx, bx + 4, by + 4, 18, 8, '#fafafa');
  _px(ctx, bx + 4, by + 4, 18, 1, '#dadada');
  // Headboard
  _px(ctx, bx, by - 8, 80, 8, '#3a2418');
  _px(ctx, bx, by - 8, 80, 1, '#5a3828');
  // ---- Nightstand + lamp ----
  _px(ctx, 92, 84, 14, 14, '#3a2418');
  _px(ctx, 92, 84, 14, 1, '#5a3828');
  _px(ctx, 96, 76, 6, 8, '#3a3a3a');                    // lamp base
  _px(ctx, 94, 68, 10, 8, '#fef3c7');                   // lampshade lit
  // Lamp glow
  ctx.fillStyle = 'rgba(254,243,199,0.18)';
  ctx.beginPath(); ctx.arc(99, 74, 28, 0, Math.PI * 2); ctx.fill();
  // ---- TV on the dresser (right side, foreground) ----
  const tvX = 130, tvY = 84;
  _px(ctx, tvX - 6, tvY + 16, 60, 14, '#3a2418');       // dresser
  _px(ctx, tvX - 6, tvY + 16, 60, 1, '#5a3828');
  // TV body
  _px(ctx, tvX, tvY, 48, 16, '#1a1a1a');
  _px(ctx, tvX + 2, tvY + 2, 44, 12, '#0a0a0a');
  // TV static — random pixel noise
  for (let i = 0; i < 28; i++) {
    const nx = tvX + 3 + ((i * 13 + fc * 3) % 42);
    const ny = tvY + 3 + ((i * 7 + fc) % 10);
    const c = (i + fc) % 3 === 0 ? '#fafafa' : (i + fc) % 3 === 1 ? '#7a7a7a' : '#3a3a3a';
    _px(ctx, nx, ny, 1, 1, c);
  }
  // Two little antennas
  _px(ctx, tvX + 14, tvY - 8, 1, 8, '#3a3a3a');
  _px(ctx, tvX + 34, tvY - 8, 1, 8, '#3a3a3a');
  // ---- Open suitcase on the bed with gear ----
  _px(ctx, bx + 24, by - 4, 32, 6, '#1a1a1a');
  _px(ctx, bx + 24, by - 4, 32, 1, '#3a3a3a');
  _px(ctx, bx + 26, by - 2, 8, 4, '#dc2626');           // shirt
  _px(ctx, bx + 36, by - 2, 8, 4, '#84cc16');           // shirt
  _px(ctx, bx + 46, by - 2, 6, 4, '#fbbf24');           // headphones
  // ---- Player sitting on the edge of the bed, headphones on, practicing ----
  const ppx = 28, ppy = 72;
  // Legs hanging off the bed
  _px(ctx, ppx - 4, ppy + 18, 3, 12, '#1a1a2e');
  _px(ctx, ppx + 1, ppy + 18, 3, 12, '#1a1a2e');
  _px(ctx, ppx - 4, ppy + 29, 3, 1, '#fff');
  _px(ctx, ppx + 1, ppy + 29, 3, 1, '#fff');
  // Body — leaning slightly forward
  _px(ctx, ppx - 5, ppy + 7, 10, 11, look?.shirt || '#a78bfa');
  _px(ctx, ppx - 5, ppy + 7, 10, 1, '#fff');
  // Arms — one up to the ear (headphones), one down
  _px(ctx, ppx + 5, ppy + 8, 2, 10, look?.shirt || '#a78bfa');
  _px(ctx, ppx + 5, ppy + 17, 2, 2, look?.skin || '#d4a87a');
  _px(ctx, ppx - 7, ppy + 4, 2, 6, look?.shirt || '#a78bfa');
  _px(ctx, ppx - 5, ppy + 2, 4, 2, look?.shirt || '#a78bfa');
  _px(ctx, ppx - 1, ppy + 2, 2, 2, look?.skin || '#d4a87a');
  // Head
  _px(ctx, ppx - 4, ppy, 8, 7, look?.skin || '#d4a87a');
  _px(ctx, ppx - 4, ppy - 2, 8, 3, look?.hair || '#1a1a2e');
  // Headphones (over ears)
  _px(ctx, ppx - 5, ppy + 2, 1, 4, '#1a1a1a');
  _px(ctx, ppx + 4, ppy + 2, 1, 4, '#1a1a1a');
  _px(ctx, ppx - 5, ppy - 2, 10, 1, '#1a1a1a');         // headband
  _px(ctx, ppx - 5, ppy - 1, 10, 1, '#fbbf24');         // gold accent
  // Closed eyes (in the zone) and slight smirk
  _px(ctx, ppx - 3, ppy + 3, 2, 1, '#0c0a09');
  _px(ctx, ppx + 1, ppy + 3, 2, 1, '#0c0a09');
  _px(ctx, ppx - 1, ppy + 5, 3, 1, '#3a1010');
  // Music notes drifting up from the player
  for (let i = 0; i < 3; i++) {
    const ph = (fc + i * 24) % 90;
    if (ph < 70) {
      ctx.globalAlpha = 1 - ph / 70;
      const ny = ppy - 6 - Math.floor(ph * 0.5);
      const nx = ppx + 8 + i * 6 + Math.floor(Math.sin((fc + i * 20) * 0.1) * 2);
      _px(ctx, nx, ny, 2, 2, '#fbbf24');
      _px(ctx, nx + 1, ny + 2, 1, 2, '#fbbf24');
      ctx.globalAlpha = 1;
    }
  }
  // Tiny clock on the wall above the TV — 1:47am
  _px(ctx, 154, 70, 16, 8, '#1a1a1a');
  _px(ctx, 156, 71, 12, 6, '#0a0a0a');
  ctx.fillStyle = '#fb7185';
  ctx.font = 'bold 5px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('1:47', 162, 76);
  // Vignette
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.fillRect(0, 0, W, 8);
  ctx.fillRect(0, H - 10, W, 10);
};

// Beat 3 — bigger venue, bigger crowd, payday. Player headlining under colored
// stage lights with crowd silhouettes hands up.
const drawTourStageScene = (ctx, fc, look) => {
  const W = 200, H = 130;
  // Dark venue rear wall
  _px(ctx, 0, 0, W, 90, '#0a0612');
  // Faint ceiling rig — truss across the top
  _px(ctx, 4, 6, W - 8, 4, '#1a1a1a');
  for (let i = 0; i < 16; i++) _px(ctx, 6 + i * 12, 6, 2, 4, '#2a2a2a');
  // Hanging spotlights on the truss
  for (let i = 0; i < 5; i++) {
    const lx = 16 + i * 40;
    _px(ctx, lx, 10, 6, 4, '#3a3a3a');
    _px(ctx, lx + 1, 14, 4, 2, '#1a1a1a');
  }
  // Three colored spotlight cones — gentle sweep
  const sweep = Math.sin(fc * 0.04) * 14;
  const cones = [
    { x: 36, color: 'rgba(251,113,133,0.16)' },          // pink
    { x: 100, color: 'rgba(251,191,36,0.18)' },          // amber
    { x: 164, color: 'rgba(34,211,238,0.16)' },          // cyan
  ];
  for (const c of cones) {
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.moveTo(c.x, 14);
    ctx.lineTo(c.x - 26 + sweep, 92);
    ctx.lineTo(c.x + 26 + sweep, 92);
    ctx.closePath();
    ctx.fill();
  }
  // Smoke/haze layer (subtle horizontal bands)
  for (let y = 60; y < 90; y += 4) {
    ctx.globalAlpha = 0.10;
    _px(ctx, 0, y, W, 2, '#fafafa');
    ctx.globalAlpha = 1;
  }
  // ---- Big stage platform ----
  _px(ctx, 0, 90, W, 6, '#1a1a1a');
  _px(ctx, 0, 90, W, 1, '#3a3a3a');
  // Stage front lip lights
  for (let i = 0; i < 24; i++) {
    const lx = 4 + i * 8;
    const on = (fc + i * 4) % 30 < 18;
    _px(ctx, lx, 91, 4, 2, on ? '#fbbf24' : '#3a2818');
  }
  // Speaker stacks left + right
  _px(ctx, 4, 70, 16, 22, '#1a1a1a');
  _px(ctx, 6, 72, 12, 8, '#3a3a3a');
  _px(ctx, 6, 82, 12, 8, '#3a3a3a');
  _px(ctx, 8, 75, 8, 2, '#fbbf24');
  _px(ctx, 8, 85, 8, 2, '#fbbf24');
  _px(ctx, 180, 70, 16, 22, '#1a1a1a');
  _px(ctx, 182, 72, 12, 8, '#3a3a3a');
  _px(ctx, 182, 82, 12, 8, '#3a3a3a');
  _px(ctx, 184, 75, 8, 2, '#fbbf24');
  _px(ctx, 184, 85, 8, 2, '#fbbf24');
  // Banner / venue name backdrop
  _px(ctx, 60, 18, 80, 18, '#1a0d28');
  _px(ctx, 60, 18, 80, 1, '#3a2058');
  _px(ctx, 60, 35, 80, 1, '#3a2058');
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('LIVE', 100, 30);
  ctx.font = 'bold 4px monospace';
  ctx.fillStyle = '#a78bfa';
  ctx.fillText('TOUR · NIGHT 2', 100, 35);
  // ---- Dense crowd silhouettes — multiple rows for depth ----
  for (let row = 0; row < 4; row++) {
    const baseY = 100 + row * 6;
    const rowAlpha = 1 - row * 0.15;
    ctx.globalAlpha = rowAlpha;
    for (let i = 0; i < 22 + row * 2; i++) {
      const cx = (i * 9 + row * 4) % W - 2;
      const wave = Math.sin((fc + i * 11 + row * 6) * 0.07);
      const hsz = 5 + (row % 2);
      _px(ctx, cx, baseY, hsz, hsz, '#0a0510');
      // Some hands raised
      if (wave > 0.3 && row < 2) {
        _px(ctx, cx, baseY - 4, 1, 4, '#0a0510');
        _px(ctx, cx + hsz - 1, baseY - 4, 1, 4, '#0a0510');
      }
    }
    ctx.globalAlpha = 1;
  }
  // Phone screens in the crowd (little white dots held up)
  for (let i = 0; i < 6; i++) {
    const phx = 20 + (i * 30 + (fc / 10 | 0)) % 160;
    const phy = 92 + (i % 3) * 4;
    if ((fc + i * 15) % 80 < 60) _px(ctx, phx, phy, 1, 2, '#fafafa');
  }
  // ---- Player on stage, mic stand ----
  // Mic stand in the center
  _px(ctx, 99, 70, 2, 22, '#1a1a1a');
  _px(ctx, 96, 66, 8, 6, '#2a2a2a');
  _px(ctx, 97, 67, 6, 4, '#fbbf24');
  // Player drawn just left of the mic, facing forward
  drawBeatboxer(ctx, 86, 92, look, 'right', true, fc);
  // Confetti raining gently
  const cConfetti = ['#fbbf24', '#fb7185', '#22d3ee', '#a78bfa', '#84cc16'];
  for (let i = 0; i < 18; i++) {
    const lifeT = ((fc + i * 17) % 180) / 180;
    const cx = (i * 13 + 4) % W;
    const cy = lifeT * 100 + 6;
    _px(ctx, cx, Math.floor(cy), 2, 2, cConfetti[i % cConfetti.length]);
  }
  // Lens flare from the central spotlight, pulsing
  const flarePulse = 0.20 + 0.15 * Math.sin(fc * 0.12);
  ctx.fillStyle = `rgba(254,243,199,${flarePulse.toFixed(3)})`;
  ctx.beginPath(); ctx.arc(100, 60, 28, 0, Math.PI * 2); ctx.fill();
  // Vignette
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.fillRect(0, 0, W, 6);
  ctx.fillRect(0, H - 8, W, 8);
};

// Pig Pen's challenge — cutscene at the cypher (daytime park).
const drawPigPenChallengeScene = (ctx, fc, look) => {
  const W = 200, H = 130;
  // Daytime park sky
  _drawDaytimeSky(ctx, W);
  // Sun upper-left
  _px(ctx, 16, 8, 10, 10, '#fef3c7');
  ctx.fillStyle = 'rgba(254,243,199,0.30)';
  ctx.beginPath(); ctx.arc(21, 13, 14, 0, Math.PI * 2); ctx.fill();
  // Sunlit grass — fills everything below the sky
  _px(ctx, 0, 50, W, 80, '#6a9a3a');
  // Grass blades texture
  for (let i = 0; i < 24; i++) {
    const gx = (i * 9) % W;
    const gy = 52 + (i % 4) * 4;
    _px(ctx, gx, gy, 1, 2, '#5a8a30');
  }
  // Trees background
  for (let i = 0; i < 5; i++) {
    const tx = 5 + i * 38;
    _px(ctx, tx - 8, 38, 16, 8, '#3a7028');
    _px(ctx, tx - 6, 34, 12, 4, '#4a8030');
    _px(ctx, tx - 3, 30, 6, 4, '#5a9038');
    _px(ctx, tx - 1, 46, 2, 6, '#3a2410');
  }
  // Crowd silhouette behind (other cypher members, light tones)
  for (let i = 0; i < 14; i++) {
    const cx = 4 + i * 14 + (i % 2) * 4;
    const headBob = Math.sin(fc * 0.1 + i * 0.5) * 0.5;
    _px(ctx, cx, 60 + headBob, 4, 4, '#a87844');
    _px(ctx, cx - 1, 64 + headBob, 6, 8, ['#a04040','#5a7050','#a06030','#4060a0','#a06090'][i % 5]);
    _px(ctx, cx, 59 + headBob, 4, 1, ['#3a2410','#1a1a2e','#5a3010'][i % 3]);
  }
  // Dirt cypher circle (in front of crowd)
  ctx.fillStyle = '#a89060';
  ctx.beginPath();
  ctx.ellipse(100, 106, 80, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#7a6a48';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(100, 106, 78, 17, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Speckles
  for (let i = 0; i < 8; i++) _px(ctx, 40 + i * 18, 100 + (i % 3) * 4, 1, 1, '#7a6a48');
  // Pig Pen on the right, mid-trash-talk, finger-pointing pose
  drawPigPen(ctx, 138, 110, fc, 'smug');
  // Player on the left, facing him
  _px(ctx, 60, 100, 12, 14, look?.shirt || '#a78bfa');
  _px(ctx, 60, 100, 12, 2, '#fff');
  _px(ctx, 58, 102, 2, 8, look?.shirt || '#a78bfa');
  _px(ctx, 72, 102, 2, 8, look?.shirt || '#a78bfa');
  _px(ctx, 58, 109, 2, 2, look?.skin || '#d4a87a');
  _px(ctx, 72, 109, 2, 2, look?.skin || '#d4a87a');
  _px(ctx, 62, 89, 8, 11, look?.skin || '#d4a87a');
  _px(ctx, 62, 87, 8, 3, look?.hair || '#1a1a2e');
  _px(ctx, 64, 92, 1, 1, '#0c0a09');
  _px(ctx, 68, 92, 1, 1, '#0c0a09');
  _px(ctx, 64, 96, 4, 1, '#3a1010');
  // Legs
  _px(ctx, 60, 114, 4, 8, '#1a1a2e');
  _px(ctx, 68, 114, 4, 8, '#1a1a2e');
  _px(ctx, 60, 121, 4, 1, '#fff');
  _px(ctx, 68, 121, 4, 1, '#fff');
  // Speech bubbles / shouting marks from Pig Pen (visual punctuation)
  if (fc % 30 < 22) {
    ctx.fillStyle = '#dc2626';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('!', 122, 76);
    ctx.fillText('!', 119, 70);
  }
  // Sun/heat lines on Pig Pen
  if (fc % 12 < 6) {
    _px(ctx, 134, 70, 1, 3, '#fbbf24');
    _px(ctx, 142, 68, 1, 3, '#fbbf24');
  }
};

// Helper: draw a "seated at the bar" silhouette — head + torso + arms only,
// since the bar counter blocks the legs. Pig Pen pose 'sad' (head down).
const _drawSeatedAtBar = (ctx, x, counterY, look, frameCount, who) => {
  // who is 'pigpen' or 'player'
  if (who === 'pigpen') {
    // Stocky shoulders + black/red track jacket
    _px(ctx, x - 7, counterY - 16, 14, 16, '#1a1a1a');
    _px(ctx, x - 7, counterY - 16, 14, 1, '#3a3a3a');
    // Red side stripes
    _px(ctx, x - 7, counterY - 12, 1, 12, '#dc2626');
    _px(ctx, x + 6, counterY - 12, 1, 12, '#dc2626');
    // Zipper
    _px(ctx, x, counterY - 14, 1, 14, '#5a5a5a');
    // Slumped arms resting on the counter
    _px(ctx, x - 9, counterY - 4, 4, 4, '#1a1a1a');
    _px(ctx, x + 5, counterY - 4, 4, 4, '#1a1a1a');
    _px(ctx, x - 8, counterY - 1, 2, 1, '#d4a87a');
    _px(ctx, x + 7, counterY - 1, 2, 1, '#d4a87a');
    // Head — tilted down (lower y position with no neck visible)
    _px(ctx, x - 5, counterY - 26, 10, 8, '#d4a87a');
    // Cap (red, with clock face)
    _px(ctx, x - 6, counterY - 29, 12, 4, '#dc2626');
    _px(ctx, x - 6, counterY - 29, 12, 1, '#fb7185');
    _px(ctx, x - 6, counterY - 25, 12, 1, '#7a1a14');
    _px(ctx, x + 5, counterY - 27, 4, 1, '#1a1a1a');
    _px(ctx, x - 1, counterY - 28, 3, 3, '#fbbf24');
    _px(ctx, x, counterY - 27, 1, 1, '#1a1a1a');
    _px(ctx, x + 1, counterY - 26, 1, 1, '#1a1a1a');
    // Down-cast eyes (just dots low on the face)
    _px(ctx, x - 3, counterY - 21, 1, 1, '#1a1a2e');
    _px(ctx, x + 2, counterY - 21, 1, 1, '#1a1a2e');
    // Flat sad mouth
    _px(ctx, x - 1, counterY - 19, 3, 1, '#3a1010');
    // Goatee
    _px(ctx, x, counterY - 18, 2, 1, '#1a1a2e');
  } else {
    // Player seated, neutral
    _px(ctx, x - 5, counterY - 16, 10, 16, look?.shirt || '#a78bfa');
    _px(ctx, x - 5, counterY - 16, 10, 1, '#fff');
    _px(ctx, x - 7, counterY - 4, 3, 4, look?.shirt || '#a78bfa');
    _px(ctx, x + 4, counterY - 4, 3, 4, look?.shirt || '#a78bfa');
    _px(ctx, x - 7, counterY - 1, 2, 1, look?.skin || '#d4a87a');
    _px(ctx, x + 5, counterY - 1, 2, 1, look?.skin || '#d4a87a');
    // Head
    _px(ctx, x - 4, counterY - 25, 8, 8, look?.skin || '#d4a87a');
    _px(ctx, x - 4, counterY - 27, 8, 3, look?.hair || '#1a1a2e');
    _px(ctx, x - 3, counterY - 22, 1, 1, '#0c0a09');
    _px(ctx, x + 1, counterY - 22, 1, 1, '#0c0a09');
    _px(ctx, x - 1, counterY - 19, 3, 1, '#3a1010');
  }
};

// Penny reveal — bar interior, dim, Pig Pen at the bar after losing.
const drawPennyRevealScene = (ctx, fc, look) => {
  const W = 200, H = 130;
  // Dim bar wall (back wall)
  _px(ctx, 0, 0, W, 60, '#1c1825');
  // Wallpaper specs
  for (let y = 6; y < 60; y += 12) for (let x = 8; x < W; x += 14) _px(ctx, x, y, 1, 1, '#2a1f1a');
  // Shelves with bottles behind the bar (two rows)
  _px(ctx, 0, 14, W, 14, '#3a2418');
  _px(ctx, 0, 14, W, 1, '#5a3818');
  _px(ctx, 0, 27, W, 1, '#1a1408');
  for (let i = 0; i < 10; i++) {
    const bx = 8 + i * 18;
    const colors = ['#a04040', '#5a8030', '#fbbf24', '#22d3ee'];
    _px(ctx, bx, 16, 4, 9, colors[i % 4]);
    _px(ctx, bx + 1, 14, 2, 2, '#1a1a1a');
    if (fc % (40 + i * 3) < 4) _px(ctx, bx + 1, 17, 1, 1, '#fff');
  }
  _px(ctx, 0, 28, W, 14, '#3a2418');
  _px(ctx, 0, 28, W, 1, '#5a3818');
  _px(ctx, 0, 41, W, 1, '#1a1408');
  for (let i = 0; i < 8; i++) {
    const bx = 14 + i * 22;
    _px(ctx, bx, 30, 4, 10, ['#5a3a40', '#3a5060', '#7a3a20'][i % 3]);
    _px(ctx, bx + 1, 29, 2, 1, '#1a1a1a');
  }
  // Bar counter — top edge + face
  const counterY = 96;
  _px(ctx, 0, counterY, W, 4, '#7a5030');
  _px(ctx, 0, counterY, W, 1, '#a07050');
  _px(ctx, 0, counterY + 4, W, 4, '#5a3a18');
  _px(ctx, 0, counterY + 8, W, 22, '#3a2010');
  // Subtle counter glints
  for (let i = 0; i < 6; i++) _px(ctx, 14 + i * 32, counterY + 1, 4, 1, '#a07050');
  // Hanging warm bar light over Pig Pen
  const lightX = 110;
  _px(ctx, lightX, 0, 1, 18, '#1a1a1a');
  _px(ctx, lightX - 5, 17, 11, 4, '#3a2818');
  _px(ctx, lightX - 4, 21, 9, 2, '#fbbf24');
  ctx.fillStyle = 'rgba(254, 243, 199, 0.12)';
  ctx.beginPath(); ctx.arc(lightX, 22, 36, 0, Math.PI * 2); ctx.fill();
  // Player on the left side, seated
  _drawSeatedAtBar(ctx, 60, counterY, look, fc, 'player');
  // Pig Pen on the right side, head down, sad
  _drawSeatedAtBar(ctx, 116, counterY, null, fc, 'pigpen');
  // Drinks on the counter — player's blue, Pig Pen's amber whiskey
  // Player drink (blue)
  _px(ctx, 56, counterY - 8, 6, 8, '#3a3a40');         // glass walls
  _px(ctx, 57, counterY - 7, 4, 5, '#22d3ee');         // drink
  _px(ctx, 56, counterY - 8, 6, 1, '#dadada');         // rim
  // Pig Pen drink (amber, almost finished)
  _px(ctx, 124, counterY - 8, 6, 8, '#3a3a40');
  _px(ctx, 125, counterY - 4, 4, 3, '#fbbf24');        // half-empty amber
  _px(ctx, 124, counterY - 8, 6, 1, '#dadada');
  // A second empty glass beside Pig Pen (he's been here a while)
  _px(ctx, 132, counterY - 6, 6, 6, '#3a3a40');
  _px(ctx, 132, counterY - 6, 6, 1, '#dadada');
  // Coaster ring on the counter near Pig Pen
  _px(ctx, 134, counterY + 1, 4, 1, '#5a3a18');
  // Quiet vignette / dim atmosphere
  ctx.fillStyle = 'rgba(0, 0, 0, 0.20)';
  ctx.fillRect(0, 0, W, H);
};

// Park date scene — both characters on a bench under a tree, daylight,
// soft sparkles. Used as the cutscene backdrop when a player meets their
// scheduled romance partner at the park.
const drawDateScene = (ctx, fc, playerLook, partnerLook) => {
  const W = 200, H = 130;
  // Sky gradient
  _drawDaytimeSky(ctx, W);
  // Sun
  _px(ctx, 18, 8, 10, 10, '#fef3c7');
  ctx.fillStyle = 'rgba(254,243,199,0.30)';
  ctx.beginPath(); ctx.arc(23, 13, 14, 0, Math.PI * 2); ctx.fill();
  // Cloud
  _px(ctx, 100, 12, 22, 4, '#fff');
  _px(ctx, 104, 9, 14, 7, '#fff');
  _px(ctx, 108, 7, 6, 9, '#fff');
  _px(ctx, 102, 16, 18, 1, '#dadada');
  // Grass
  _px(ctx, 0, 50, W, 80, '#6a9a3a');
  for (let i = 0; i < 24; i++) {
    const gx = (i * 9) % W;
    const gy = 56 + (i % 3) * 6;
    _px(ctx, gx, gy, 1, 2, '#5a8a30');
  }
  // Tree on the left, behind the bench
  _px(ctx, 32, 30, 28, 30, '#3a7028');
  _px(ctx, 28, 36, 36, 18, '#3a7028');
  _px(ctx, 24, 40, 44, 12, '#3a7028');
  _px(ctx, 36, 46, 18, 8, '#4a8038');
  _px(ctx, 44, 60, 4, 24, '#3a2410');                    // trunk
  // Bench (centered-right under the tree)
  _px(ctx, 60, 90, 80, 4, '#7a5040');                    // seat plank
  _px(ctx, 60, 90, 80, 1, '#a07050');
  _px(ctx, 60, 78, 80, 2, '#7a5040');                    // back top
  _px(ctx, 60, 80, 4, 12, '#5a3a18');                    // left arm
  _px(ctx, 136, 80, 4, 12, '#5a3a18');                   // right arm
  _px(ctx, 64, 94, 4, 12, '#3a2410');                    // left leg
  _px(ctx, 132, 94, 4, 12, '#3a2410');                   // right leg
  // Two figures sitting on the bench, facing forward
  // Player on the left
  const px = 84, partnerX = 116, seatY = 92;
  // Player legs
  _px(ctx, px - 4, seatY + 1, 3, 8, '#1a1a2e');
  _px(ctx, px + 1, seatY + 1, 3, 8, '#1a1a2e');
  _px(ctx, px - 4, seatY + 8, 3, 1, '#fff');
  _px(ctx, px + 1, seatY + 8, 3, 1, '#fff');
  // Player body
  _px(ctx, px - 5, seatY - 11, 10, 12, playerLook?.shirt || '#a78bfa');
  _px(ctx, px - 5, seatY - 11, 10, 1, '#fff');
  // Player arms (one resting between them, one on lap)
  _px(ctx, px - 7, seatY - 9, 2, 8, playerLook?.shirt || '#a78bfa');
  _px(ctx, px + 5, seatY - 9, 2, 8, playerLook?.shirt || '#a78bfa');
  _px(ctx, px - 7, seatY - 2, 2, 2, playerLook?.skin || '#d4a87a');
  _px(ctx, px + 5, seatY - 2, 2, 2, playerLook?.skin || '#d4a87a');
  // Player head
  _px(ctx, px - 4, seatY - 18, 8, 7, playerLook?.skin || '#d4a87a');
  _px(ctx, px - 4, seatY - 20, 8, 3, playerLook?.hair || '#1a1a2e');
  _px(ctx, px - 3, seatY - 16, 1, 1, '#0c0a09');
  _px(ctx, px + 1, seatY - 16, 1, 1, '#0c0a09');
  _px(ctx, px - 1, seatY - 13, 3, 1, '#3a1010');         // small smile
  // Partner mirrored (head colors per their look)
  _px(ctx, partnerX - 4, seatY + 1, 3, 8, '#1a1a2e');
  _px(ctx, partnerX + 1, seatY + 1, 3, 8, '#1a1a2e');
  _px(ctx, partnerX - 4, seatY + 8, 3, 1, '#fff');
  _px(ctx, partnerX + 1, seatY + 8, 3, 1, '#fff');
  _px(ctx, partnerX - 5, seatY - 11, 10, 12, partnerLook?.shirt || '#fb7185');
  _px(ctx, partnerX - 5, seatY - 11, 10, 1, '#fff');
  _px(ctx, partnerX - 7, seatY - 9, 2, 8, partnerLook?.shirt || '#fb7185');
  _px(ctx, partnerX + 5, seatY - 9, 2, 8, partnerLook?.shirt || '#fb7185');
  _px(ctx, partnerX - 7, seatY - 2, 2, 2, partnerLook?.skin || '#e0b890');
  _px(ctx, partnerX + 5, seatY - 2, 2, 2, partnerLook?.skin || '#e0b890');
  _px(ctx, partnerX - 4, seatY - 18, 8, 7, partnerLook?.skin || '#e0b890');
  _px(ctx, partnerX - 4, seatY - 20, 8, 3, partnerLook?.hair || '#5a2010');
  _px(ctx, partnerX - 3, seatY - 16, 1, 1, '#0c0a09');
  _px(ctx, partnerX + 1, seatY - 16, 1, 1, '#0c0a09');
  _px(ctx, partnerX - 1, seatY - 13, 3, 1, '#3a1010');
  // Hearts drifting up between them
  for (let i = 0; i < 3; i++) {
    const phase = (fc * 0.6 + i * 28) % 80;
    if (phase < 60) {
      const hx = 100 + Math.sin((fc * 0.05) + i) * 4;
      const hy = 80 - phase * 0.6;
      ctx.globalAlpha = Math.max(0, 1 - phase / 60);
      _px(ctx, Math.floor(hx), Math.floor(hy), 3, 2, '#fb7185');
      _px(ctx, Math.floor(hx), Math.floor(hy + 2), 1, 1, '#fb7185');
      _px(ctx, Math.floor(hx + 2), Math.floor(hy + 2), 1, 1, '#fb7185');
      ctx.globalAlpha = 1;
    }
  }
  // Crowd silhouettes far in the background
  for (let i = 0; i < 6; i++) {
    const cx = 4 + i * 32;
    const headBob = Math.sin(fc * 0.15 + i * 0.5) * 0.5;
    _px(ctx, cx, 60 + headBob, 3, 3, '#a87844');
    _px(ctx, cx - 1, 63 + headBob, 5, 6, ['#a04040','#5a7050','#a06030'][i % 3]);
  }
  // Sparkles
  for (let i = 0; i < 6; i++) {
    if ((fc + i * 11) % 60 < 30) {
      const sx = 60 + i * 12;
      const sy = 30 + (i % 3) * 8;
      _px(ctx, sx, sy, 1, 1, '#fef3c7');
    }
  }
};

// Mingle scene — bar interior with the stranger silhouette occupying the
// stool-side of the counter. Used as the backdrop for any conversation.
// `encounter.id` lets us add bespoke set-pieces later (e.g. sponsor scenes
// with logos behind the bar) — for now everyone gets the same backdrop.
const drawMingleScene = (ctx, fc, look, encounter) => {
  const W = 200, H = 130;
  // Back wall + wallpaper
  _px(ctx, 0, 0, W, 60, '#1c1825');
  for (let y = 6; y < 60; y += 12) for (let x = 8; x < W; x += 14) _px(ctx, x, y, 1, 1, '#2a1f1a');
  // Shelf 1
  _px(ctx, 0, 14, W, 14, '#3a2418');
  _px(ctx, 0, 14, W, 1, '#5a3818');
  _px(ctx, 0, 27, W, 1, '#1a1408');
  for (let i = 0; i < 10; i++) {
    const bx = 8 + i * 18;
    const colors = ['#a04040', '#5a8030', '#fbbf24', '#22d3ee'];
    _px(ctx, bx, 16, 4, 9, colors[i % 4]);
    _px(ctx, bx + 1, 14, 2, 2, '#1a1a1a');
    if (fc % (40 + i * 3) < 4) _px(ctx, bx + 1, 17, 1, 1, '#fff');
  }
  // Shelf 2
  _px(ctx, 0, 28, W, 14, '#3a2418');
  _px(ctx, 0, 28, W, 1, '#5a3818');
  _px(ctx, 0, 41, W, 1, '#1a1408');
  for (let i = 0; i < 8; i++) {
    const bx = 14 + i * 22;
    _px(ctx, bx, 30, 4, 10, ['#5a3a40', '#3a5060', '#7a3a20'][i % 3]);
    _px(ctx, bx + 1, 29, 2, 1, '#1a1a1a');
  }
  // Bar counter
  const counterY = 96;
  _px(ctx, 0, counterY, W, 4, '#7a5030');
  _px(ctx, 0, counterY, W, 1, '#a07050');
  _px(ctx, 0, counterY + 4, W, 4, '#5a3a18');
  _px(ctx, 0, counterY + 8, W, 22, '#3a2010');
  // Hanging warm bar light (centered on the stranger)
  _px(ctx, 110, 0, 1, 18, '#1a1a1a');
  _px(ctx, 105, 17, 11, 4, '#3a2818');
  _px(ctx, 106, 21, 9, 2, '#fbbf24');
  ctx.fillStyle = 'rgba(254, 243, 199, 0.10)';
  ctx.beginPath(); ctx.arc(110, 22, 36, 0, Math.PI * 2); ctx.fill();
  // Stranger seated at the counter (right side) — shared seated drawer
  const x = 116;
  _drawSeatedAtBar(ctx, x, counterY, look, fc, 'player');
  // Drink in front of them — color varies a little per encounter
  _px(ctx, x - 9, counterY - 7, 5, 7, '#3a3a40');
  _px(ctx, x - 8, counterY - 5, 3, 4, ['#fbbf24','#22d3ee','#fb7185','#84cc16'][(encounter?.id?.length || 0) % 4]);
  _px(ctx, x - 9, counterY - 7, 5, 1, '#dadada');
  // Player's drink on the left side
  _px(ctx, 60, counterY - 7, 5, 7, '#3a3a40');
  _px(ctx, 61, counterY - 5, 3, 4, '#22d3ee');
  _px(ctx, 60, counterY - 7, 5, 1, '#dadada');
  // Vignette
  ctx.fillStyle = 'rgba(0, 0, 0, 0.20)';
  ctx.fillRect(0, 0, W, H);
};

// Open-mic stage: bar interior, raised platform, mic stand, player on stage,
// crowd silhouettes bobbing in front, spotlight cone overhead.
const drawOpenMicStage = (ctx, fc, look) => {
  const W = 200, H = 130;
  // Back wall (dim bar)
  _px(ctx, 0, 0, W, 90, '#1c1825');
  // Bar back top stripe
  _px(ctx, 0, 0, W, 4, '#2a1f1a');
  // String lights along the top
  for (let i = 0; i < 7; i++) {
    const lx = 12 + i * 28;
    if ((fc + i * 11) % 60 < 50) _px(ctx, lx, 6, 3, 3, i % 2 ? '#fbbf24' : '#fb7185');
  }
  // Stage platform
  _px(ctx, 30, 86, 140, 18, '#5a4030');
  _px(ctx, 30, 86, 140, 2, '#7a5a40');
  _px(ctx, 30, 102, 140, 2, '#3a2818');
  // Mic stand
  _px(ctx, 99, 60, 2, 25, '#1a1a1a');
  _px(ctx, 95, 84, 10, 1, '#1a1a1a');
  _px(ctx, 96, 56, 6, 5, '#aaa');
  _px(ctx, 96, 56, 6, 1, '#dadada');
  // Spotlight cone
  ctx.fillStyle = 'rgba(254, 243, 199, 0.07)';
  ctx.beginPath(); ctx.moveTo(80, 0); ctx.lineTo(120, 0); ctx.lineTo(140, 86); ctx.lineTo(60, 86); ctx.closePath(); ctx.fill();
  // Player on stage (centered) — drawBeatboxer feet at y=86 (top of platform)
  drawBeatboxer(ctx, 100, 86, look, 'right', true, fc);
  // Sound waves from player
  if (fc % 4 < 2) {
    const wavePhase = (fc * 0.35) % 12;
    ctx.globalAlpha = (1 - wavePhase / 12) * 0.7;
    ctx.fillStyle = look.shirt;
    const r = 4 + wavePhase * 1.6;
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      const xx = Math.floor(100 + Math.cos(ang) * r);
      const yy = Math.floor(70 + Math.sin(ang) * r);
      if (xx >= 0 && xx < W && yy >= 0 && yy < H) ctx.fillRect(xx, yy, 1, 1);
    }
    ctx.globalAlpha = 1;
  }
  // Crowd silhouettes in front (heads bobbing slightly)
  for (let i = 0; i < 14; i++) {
    const cx = 4 + i * 14;
    const ch = 14 + (i % 3) * 4;
    const bob = Math.floor(Math.sin((fc + i * 7) * 0.18));
    _px(ctx, cx, 130 - ch + bob, 10, ch, '#1c1917');
    _px(ctx, cx + 2, 130 - ch - 4 + bob, 6, 5, '#0c0a09');
    // Hands raised on every other person, occasionally
    if (i % 3 === 1 && (fc + i * 5) % 30 < 12) {
      _px(ctx, cx + 4, 130 - ch - 7 + bob, 1, 4, '#1c1917');
    }
  }
};

// Sleep scene: apartment, player on couch, light fades evening → night → dawn.
const drawSleepScene = (ctx, fc, look, progress) => {
  const W = 200, H = 130;
  // Ambient color shifts with progress
  let bgR, bgG, bgB;
  if (progress < 0.3) {
    const t = progress / 0.3;
    bgR = 50 - t * 36; bgG = 40 - t * 30; bgB = 70 - t * 50; // dusk → night
  } else if (progress < 0.7) {
    bgR = 14; bgG = 10; bgB = 20; // deep night
  } else {
    const t = (progress - 0.7) / 0.3;
    bgR = 14 + t * 90; bgG = 10 + t * 60; bgB = 20 + t * 30; // dawn warm
  }
  ctx.fillStyle = `rgb(${Math.floor(bgR)}, ${Math.floor(bgG)}, ${Math.floor(bgB)})`;
  ctx.fillRect(0, 0, W, H);
  // Floor
  _px(ctx, 0, 100, W, 30, '#3a2818');
  // Window — color tracks time
  let winColor;
  if (progress < 0.3) winColor = '#3a2840';
  else if (progress < 0.7) winColor = '#0a0a14';
  else winColor = '#fbbf24';
  _px(ctx, 130, 18, 50, 42, winColor);
  _px(ctx, 130, 18, 50, 1, '#1a1a1a');
  _px(ctx, 130, 60, 50, 1, '#1a1a1a');
  _px(ctx, 130, 18, 1, 42, '#1a1a1a');
  _px(ctx, 179, 18, 1, 42, '#1a1a1a');
  _px(ctx, 154, 18, 1, 42, '#1a1a1a');
  // Stars during night
  if (progress > 0.3 && progress < 0.7) {
    for (let i = 0; i < 10; i++) {
      const sx = 132 + (i * 4) % 46;
      const sy = 21 + (i * 7) % 36;
      if ((fc + i * 5) % 60 < 45) _px(ctx, sx, sy, 1, 1, '#fef3c7');
    }
  }
  // Sun on dawn
  if (progress > 0.85) {
    const t = (progress - 0.85) / 0.15;
    const sunR = 4 + t * 8;
    _px(ctx, 152, 50 - sunR, sunR * 2, sunR * 2, '#fbbf24');
  }
  // Couch
  _px(ctx, 24, 80, 110, 28, '#5a4030');
  _px(ctx, 24, 80, 110, 4, '#7a5a40');
  _px(ctx, 18, 76, 12, 18, '#5a4030');
  _px(ctx, 128, 76, 12, 18, '#5a4030');
  // Player lying on couch (head left, feet right) — chunky proportions
  // Pillow under head
  _px(ctx, 30, 78, 18, 3, '#a8a29e');
  _px(ctx, 30, 78, 18, 1, '#cbc4be');
  // Head
  _px(ctx, 33, 72, 12, 9, look?.skin || '#d4a87a');
  _px(ctx, 33, 70, 12, 3, look?.hair || '#1a1a2e');
  // Closed eyes
  _px(ctx, 37, 76, 2, 1, '#0c0a09');
  _px(ctx, 41, 76, 2, 1, '#0c0a09');
  // Tiny smile
  _px(ctx, 38, 79, 4, 1, '#3a1010');
  // Body / torso (chunky)
  _px(ctx, 45, 73, 32, 8, look?.shirt || '#a78bfa');
  _px(ctx, 45, 73, 32, 1, '#fff');
  // Pants/legs
  _px(ctx, 77, 75, 22, 6, '#1a1a2e');
  // Feet poking up
  _px(ctx, 99, 72, 5, 3, '#fff');
  // Z's during sleep
  if (progress > 0.05 && progress < 0.85) {
    const phase = Math.floor(fc / 24) % 3;
    const zY = 65 - phase * 8;
    if (fc % 48 < 36) {
      ctx.fillStyle = '#dac0a0';
      ctx.font = 'bold 8px monospace';
      ctx.fillText('z', 50 + phase * 5, zY);
    }
    if (fc % 48 < 18) {
      ctx.fillStyle = '#aaa';
      ctx.font = 'bold 6px monospace';
      ctx.fillText('z', 60, zY - 4);
    }
  }
  // Darkness overlay during deep night
  if (progress > 0.3 && progress < 0.75) {
    const dark = progress < 0.5 ? (progress - 0.3) / 0.2 : (0.75 - progress) / 0.25;
    ctx.fillStyle = `rgba(0, 0, 0, ${0.45 * dark})`;
    ctx.fillRect(0, 0, W, H);
  }
};

// ============ TRAINING SCENES ============
// Pixel-art animations rendered behind each training stat's AFK panel.

// Musicality: practicing in your own living room — couch, TV, lamp, plant,
// rug, character standing with a mic on a stand, singing.
const drawMusicalityScene = (ctx, fc, look) => {
  const W = 200, H = 130;
  // Wall (warm beige room tone)
  _px(ctx, 0, 0, W, 95, '#5a4848');
  // Wallpaper subtle stripes
  for (let x = 0; x < W; x += 12) _px(ctx, x, 0, 1, 95, '#4a3838');
  // Floor (wood planks)
  _px(ctx, 0, 95, W, 35, '#5a3a20');
  _px(ctx, 0, 95, W, 1, '#7a5a30');
  for (let i = 0; i < 5; i++) _px(ctx, i * 40, 96, 1, 34, '#3a2410');
  // Wall art (framed picture, top right)
  _px(ctx, 138, 14, 38, 28, '#3a2410');
  _px(ctx, 140, 16, 34, 24, '#7a5a40');
  // Picture content — abstract triangles
  _px(ctx, 144, 20, 6, 14, '#fbbf24');
  _px(ctx, 152, 22, 8, 12, '#22d3ee');
  _px(ctx, 162, 18, 8, 18, '#fb7185');
  // Window (small, top left) showing daytime
  _px(ctx, 16, 14, 38, 30, '#7ec0e8');
  _px(ctx, 16, 14, 38, 1, '#1a1a1a');
  _px(ctx, 16, 43, 38, 1, '#1a1a1a');
  _px(ctx, 16, 14, 1, 30, '#1a1a1a');
  _px(ctx, 53, 14, 1, 30, '#1a1a1a');
  _px(ctx, 35, 14, 1, 30, '#1a1a1a');                 // mullion
  _px(ctx, 16, 28, 38, 1, '#1a1a1a');                 // mullion
  // Cloud + sun in window
  _px(ctx, 44, 18, 6, 4, '#fef3c7');                  // sun
  _px(ctx, 22, 32, 8, 3, '#fff');                     // cloud
  _px(ctx, 24, 30, 4, 2, '#fff');
  // Rug under the singing area
  _px(ctx, 60, 110, 80, 16, '#7a3a40');
  _px(ctx, 60, 110, 80, 1, '#a05060');
  _px(ctx, 60, 125, 80, 1, '#5a2a30');
  // Rug pattern
  for (let i = 0; i < 4; i++) {
    _px(ctx, 70 + i * 18, 114, 8, 8, '#a05060');
    _px(ctx, 73 + i * 18, 117, 2, 2, '#fbbf24');
  }
  // Couch on the left
  _px(ctx, 4, 78, 50, 30, '#5a3a40');
  _px(ctx, 4, 78, 50, 4, '#7a5060');
  _px(ctx, 4, 108, 50, 4, '#3a2030');
  _px(ctx, 0, 74, 8, 30, '#5a3a40');                  // left armrest
  _px(ctx, 50, 74, 8, 30, '#5a3a40');                 // right armrest
  _px(ctx, 0, 74, 8, 2, '#7a5060');
  _px(ctx, 50, 74, 8, 2, '#7a5060');
  // Couch cushions (visible top edge)
  _px(ctx, 10, 80, 18, 6, '#7a5060');
  _px(ctx, 30, 80, 18, 6, '#7a5060');
  _px(ctx, 10, 80, 18, 1, '#a07080');
  _px(ctx, 30, 80, 18, 1, '#a07080');
  // Cushion small pillow
  _px(ctx, 40, 84, 10, 6, '#fbbf24');
  _px(ctx, 40, 84, 10, 1, '#fef3c7');
  // Couch legs
  _px(ctx, 4, 108, 4, 4, '#1a1a1a');
  _px(ctx, 50, 108, 4, 4, '#1a1a1a');
  // Plant on the right (potted)
  _px(ctx, 168, 92, 14, 10, '#3a2410');               // pot
  _px(ctx, 168, 92, 14, 2, '#5a3820');                // pot rim
  _px(ctx, 170, 78, 10, 14, '#3a7028');               // foliage main
  _px(ctx, 168, 80, 4, 8, '#3a7028');                 // leaf left
  _px(ctx, 180, 80, 4, 8, '#3a7028');                 // leaf right
  _px(ctx, 172, 74, 6, 6, '#4a8038');                 // top leaf
  // Floor lamp on the right (between plant and TV)
  _px(ctx, 152, 92, 4, 18, '#1a1a1a');                // pole
  _px(ctx, 148, 110, 12, 2, '#1a1a1a');               // base
  _px(ctx, 146, 80, 16, 6, '#fbbf24');                // shade
  _px(ctx, 146, 80, 16, 1, '#fef3c7');
  _px(ctx, 148, 86, 12, 2, '#a87a30');                // shade bottom
  // Lamp glow
  ctx.save();
  ctx.fillStyle = 'rgba(254, 243, 199, 0.08)';
  ctx.beginPath(); ctx.arc(154, 88, 26, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Small bookshelf or TV in the back? Keep it simple — small TV/cabinet
  _px(ctx, 64, 56, 60, 24, '#1a1a1a');                // TV
  _px(ctx, 64, 56, 60, 2, '#3a3a3a');
  _px(ctx, 66, 58, 56, 20, '#0c0a18');                // screen
  // Animated TV content — concentric circles (music video vibe)
  for (let i = 0; i < 3; i++) {
    const phase = ((fc + i * 12) % 30) / 30;
    const r = 2 + phase * 18;
    ctx.globalAlpha = 1 - phase;
    ctx.strokeStyle = ['#fb7185', '#22d3ee', '#fbbf24'][i];
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(94, 68, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // TV stand
  _px(ctx, 78, 80, 32, 6, '#3a2410');
  // ---- Mic stand (now in the living room, on the rug) ----
  // Round disc base
  _px(ctx, 86, 108, 16, 2, '#1a1a1a');
  _px(ctx, 88, 107, 12, 1, '#3a3a3a');
  _px(ctx, 90, 106, 8, 1, '#1a1a1a');
  // Pole
  _px(ctx, 93, 71, 2, 36, '#1a1a1a');
  _px(ctx, 93, 71, 1, 36, '#3a3a3a');                 // pole highlight
  // Mic clamp
  _px(ctx, 95, 69, 3, 3, '#3a3a3a');
  _px(ctx, 95, 69, 3, 1, '#5a5a5a');
  // Mic capsule — rounded ball
  _px(ctx, 99, 60, 2, 1, '#3a3a3a');
  _px(ctx, 98, 61, 4, 1, '#3a3a3a');
  _px(ctx, 97, 62, 6, 4, '#2a2a2a');
  _px(ctx, 98, 66, 4, 1, '#1a1a1a');
  _px(ctx, 99, 67, 2, 1, '#1a1a1a');
  _px(ctx, 98, 61, 2, 1, '#5a5a5a');
  _px(ctx, 97, 62, 1, 2, '#5a5a5a');
  _px(ctx, 98, 63, 4, 1, '#444');
  _px(ctx, 98, 65, 4, 1, '#444');
  // Player on the rug, facing left toward mic — feet land on the rug top
  drawBeatboxer(ctx, 112, 110, look, 'left', true, fc);
  // Singing waves from mouth toward mic
  const mf = Math.floor(fc / 6) % 4;
  if (mf >= 2) {
    const wavePhase = (fc * 0.3) % 14;
    ctx.globalAlpha = (1 - wavePhase / 14) * 0.85;
    ctx.fillStyle = '#fbbf24';
    for (let i = 0; i < 3; i++) {
      const r = 4 + wavePhase + i * 3;
      ctx.fillRect(Math.floor(105 - r / 2), 87 + i, Math.floor(r), 1);
    }
    ctx.globalAlpha = 1;
  }
  // Music notes floating up between mic and character
  for (let i = 0; i < 3; i++) {
    const phase = (fc * 0.6 + i * 28) % 80;
    if (phase < 60) {
      const nx = 90 + Math.sin((fc * 0.05) + i) * 3 + i * 6;
      const ny = 80 - phase * 0.5;
      ctx.globalAlpha = Math.max(0, 1 - phase / 60);
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(Math.floor(nx), Math.floor(ny), 3, 2);
      ctx.fillRect(Math.floor(nx + 2), Math.floor(ny - 5), 1, 5);
      ctx.fillRect(Math.floor(nx + 3), Math.floor(ny - 5), 2, 1);
      ctx.globalAlpha = 1;
    }
  }
};

// Technicality: side-view of desk with PC monitor, PC tower, headphones on character.
const drawTechnicalityScene = (ctx, fc, look) => {
  const W = 200, H = 130;
  // Back wall — cool studio tones
  _px(ctx, 0, 0, W, 95, '#1a1d2a');
  // Wall posters
  _px(ctx, 12, 16, 22, 16, '#5a3030'); _px(ctx, 13, 17, 20, 14, '#fb7185');
  _px(ctx, 13, 22, 20, 1, '#fff');
  _px(ctx, 162, 12, 24, 18, '#2a3a5a'); _px(ctx, 163, 13, 22, 16, '#22d3ee');
  _px(ctx, 165, 16, 18, 1, '#fff'); _px(ctx, 165, 20, 14, 1, '#fff');
  // Floor
  _px(ctx, 0, 95, W, 35, '#2a1a14');
  _px(ctx, 0, 95, W, 1, '#5a3a28');
  // Desk top + apron
  _px(ctx, 22, 80, 156, 4, '#7a5030');
  _px(ctx, 22, 80, 156, 1, '#a0703f');
  _px(ctx, 22, 84, 156, 12, '#5a3825');
  // Desk legs
  _px(ctx, 26, 84, 4, 24, '#3a2410');
  _px(ctx, 170, 84, 4, 24, '#3a2410');
  // PC tower under the right side of the desk
  _px(ctx, 152, 86, 16, 32, '#1a1a1a');
  _px(ctx, 152, 86, 16, 1, '#3a3a3a');
  _px(ctx, 153, 89, 14, 1, '#3a3a3a');
  // Front grille / drives
  _px(ctx, 154, 91, 12, 1, '#2a2a2a');
  _px(ctx, 154, 95, 12, 1, '#2a2a2a');
  // PC LED (animated)
  if (fc % 30 < 20) _px(ctx, 165, 100, 1, 1, '#22c55e');
  if (fc % 12 < 4)  _px(ctx, 162, 100, 1, 1, '#fbbf24');
  // Vent slits
  for (let i = 0; i < 3; i++) _px(ctx, 154, 110 + i * 2, 12, 1, '#0a0a0a');
  // Monitor: stand + screen
  _px(ctx, 100, 78, 22, 2, '#1a1a1a');             // stand base
  _px(ctx, 109, 60, 4, 18, '#1a1a1a');             // stand neck
  _px(ctx, 86, 26, 64, 38, '#0c0a09');             // bezel
  _px(ctx, 86, 26, 64, 2, '#3a3a3a');              // bezel top
  _px(ctx, 88, 28, 60, 34, '#2b2d31');             // discord screen bg (dark gray)
  // ---- Discord-style server UI on the screen ----
  const screenX = 88, screenY = 28, screenW = 60, screenH = 34;
  // Server icon column (left rail)
  _px(ctx, screenX, screenY, 8, screenH, '#1e1f22');
  // Active server indicator (white pill on left edge)
  _px(ctx, screenX, screenY + 5, 1, 5, '#fff');
  // Server icons (rounded squares)
  const serverColors = ['#5865f2', '#fbbf24', '#23a55a', '#f23f42'];
  for (let i = 0; i < 4; i++) {
    const sy = screenY + 4 + i * 7;
    _px(ctx, screenX + 2, sy, 5, 5, serverColors[i]);
    if (i === 0) {
      // active server has a square (rounded effect)
      _px(ctx, screenX + 2, sy, 5, 1, '#7884f3');
    }
  }
  // Channel sidebar (narrow — only icons + tiny labels)
  const sideX = screenX + 8, sideW = 14;
  _px(ctx, sideX, screenY, sideW, screenH, '#2b2d31');
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 4px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('BBX', sideX + 1, screenY + 5);
  // Channel list (super short labels)
  const channels = ['gen', 'beat', 'tec', 'clip'];
  for (let i = 0; i < channels.length; i++) {
    if (i === 1) {
      _px(ctx, sideX, screenY + 7 + i * 5, sideW, 5, '#404249');
      ctx.fillStyle = '#fff';
    } else {
      ctx.fillStyle = '#80848e';
    }
    ctx.fillText('#', sideX + 1, screenY + 11 + i * 5);
    ctx.fillText(channels[i], sideX + 5, screenY + 11 + i * 5);
  }
  // Main message area
  const msgX = screenX + 22, msgY = screenY, msgW = screenW - 22;
  _px(ctx, msgX, msgY, msgW, screenH, '#313338');
  // Channel header bar
  _px(ctx, msgX, msgY, msgW, 5, '#1e1f22');
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 4px monospace';
  ctx.fillText('# beat', msgX + 1, msgY + 4);
  ctx.fillStyle = '#7a7f87';
  ctx.fillText('· 12 on', msgX + 14, msgY + 4);
  // Messages — short text that fits
  const messages = [
    { color: '#fb7185', name: 'crystix', text: 'sick triplet!' },
    { color: '#22d3ee', name: 'rohzel',  text: 'friday is on' },
    { color: '#fbbf24', name: 'alim',    text: 'roll practice' },
  ];
  const newMsgIdx = Math.floor(fc / 90) % messages.length;
  for (let i = 0; i < 3; i++) {
    const my = msgY + 7 + i * 7;
    _px(ctx, msgX + 1, my + 1, 3, 3, messages[i].color);
    ctx.fillStyle = messages[i].color;
    ctx.font = 'bold 4px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(messages[i].name, msgX + 5, my + 3);
    ctx.fillStyle = '#dbdee1';
    ctx.font = '4px monospace';
    ctx.fillText(messages[i].text, msgX + 5, my + 7);
    if (i === newMsgIdx) {
      _px(ctx, msgX + msgW - 4, my + 1, 3, 2, '#f23f42');
    }
  }
  // Typing indicator at the bottom
  const typingDot = Math.floor(fc / 12) % 4;
  ctx.font = '4px monospace';
  for (let i = 0; i < 3; i++) {
    _px(ctx, msgX + 2 + i * 2, msgY + screenH - 3, 1, 1, i === typingDot ? '#dbdee1' : '#80848e');
  }
  ctx.fillStyle = '#80848e';
  ctx.fillText('typing', msgX + 9, msgY + screenH - 1);
  // Power LED on monitor bezel
  if (fc % 50 < 40) _px(ctx, 144, 62, 1, 1, '#22c55e');
  // Keyboard
  _px(ctx, 64, 78, 60, 3, '#2a2a2a');
  _px(ctx, 64, 78, 60, 1, '#3a3a3a');
  for (let i = 0; i < 14; i++) _px(ctx, 65 + i * 4, 79, 2, 1, '#1a1a1a');
  // Mouse
  _px(ctx, 130, 78, 6, 4, '#2a2a2a');
  _px(ctx, 130, 78, 6, 1, '#3a3a3a');
  _px(ctx, 132, 78, 1, 2, '#1a1a1a');
  // Coffee mug (left side of desk)
  _px(ctx, 30, 74, 8, 6, '#a8a29e');
  _px(ctx, 30, 74, 8, 1, '#cbc4be');
  _px(ctx, 38, 75, 2, 4, '#a8a29e');
  // Steam from mug
  if (fc % 40 < 30) {
    const sf = (fc % 40) / 30;
    ctx.globalAlpha = 0.5 * (1 - sf);
    _px(ctx, 33, 70 - Math.floor(sf * 8), 1, 2, '#dadada');
    _px(ctx, 35, 68 - Math.floor(sf * 6), 1, 2, '#dadada');
    ctx.globalAlpha = 1;
  }
  // ---- Player seated at desk, facing right ----
  // Chair back (taller, padded)
  _px(ctx, 36, 56, 14, 42, '#2a1a14');
  _px(ctx, 36, 56, 14, 2, '#3a2820');
  _px(ctx, 36, 96, 14, 6, '#1a1a1a');
  // Chair armrest hint
  _px(ctx, 50, 76, 4, 3, '#1a1a1a');
  // Chair stem and base
  _px(ctx, 41, 102, 4, 8, '#1a1a1a');
  _px(ctx, 32, 110, 22, 2, '#1a1a1a');
  _px(ctx, 30, 112, 4, 2, '#1a1a1a');
  _px(ctx, 52, 112, 4, 2, '#1a1a1a');
  // Head bob (very subtle while focused)
  const headBob = Math.floor(fc / 12) % 2;
  // Torso (visible above chair back), facing right
  _px(ctx, 50, 64, 12, 16, look?.shirt || '#a78bfa');
  _px(ctx, 50, 64, 12, 2, '#fff');                       // shirt collar/top
  _px(ctx, 50, 64, 1, 16, '#fff');                       // shirt left highlight
  // Right arm extending forward to keyboard
  _px(ctx, 62, 68, 8, 3, look?.shirt || '#a78bfa');
  _px(ctx, 70, 68, 4, 3, look?.skin || '#d4a87a');       // hand
  // Head (round-ish)
  _px(ctx, 52, 50 + headBob, 10, 10, look?.skin || '#d4a87a');
  // Hair (varied by style)
  if ((look?.style || 'short') === 'short') {
    _px(ctx, 52, 48 + headBob, 10, 3, look?.hair || '#1a1a2e');
  } else if (look?.style === 'long') {
    _px(ctx, 52, 49 + headBob, 10, 2, look?.hair || '#1a1a2e');
    _px(ctx, 52, 51 + headBob, 1, 8, look?.hair || '#1a1a2e');
  } else if (look?.style === 'mohawk') {
    _px(ctx, 52, 50 + headBob, 10, 1, look?.hair || '#1a1a2e');
    _px(ctx, 56, 46 + headBob, 2, 4, look?.hair || '#1a1a2e');
  } else if (look?.style === 'spike') {
    _px(ctx, 52, 49 + headBob, 10, 1, look?.hair || '#1a1a2e');
    _px(ctx, 53, 47 + headBob, 2, 2, look?.hair || '#1a1a2e');
    _px(ctx, 56, 46 + headBob, 2, 3, look?.hair || '#1a1a2e');
    _px(ctx, 58, 47 + headBob, 2, 2, look?.hair || '#1a1a2e');
  } else {
    _px(ctx, 52, 48 + headBob, 10, 3, look?.hair || '#1a1a2e');
  }
  // Headphones (over hair, big chunky cup over right ear since profile faces right)
  _px(ctx, 52, 47 + headBob, 10, 2, '#1a1a1a');          // band over head
  _px(ctx, 51, 49 + headBob, 2, 2, '#0c0a09');           // band side (wraps around)
  // Right ear cup (visible from this side)
  _px(ctx, 60, 53 + headBob, 4, 7, '#1a1a1a');
  _px(ctx, 60, 53 + headBob, 1, 7, '#3a3a3a');
  _px(ctx, 61, 54 + headBob, 2, 5, '#2a2a2a');
  // Eye (one visible)
  _px(ctx, 58, 55 + headBob, 1, 1, '#0c0a09');
  // Mouth (concentration)
  _px(ctx, 56, 58 + headBob, 2, 1, '#3a1010');
  // Cable from headphone cup down to PC tower
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(63, 60 + headBob);
  ctx.lineTo(70, 78);
  ctx.lineTo(155, 90);                                   // into PC tower
  ctx.stroke();
};

// Originality: front view of an MPC-style "BEATBOX" drum machine — flashing
// pads, LCD display, knobs, step LED row.
const drawOriginalityScene = (ctx, fc, look) => {
  const W = 200, H = 130;
  // Tabletop (dark wood with horizontal grain)
  _px(ctx, 0, 0, W, H, '#1c1410');
  for (let y = 0; y < H; y += 12) _px(ctx, 0, y, W, 1, '#2a1f18');
  // Soft warm glow from top
  ctx.save();
  ctx.fillStyle = 'rgba(212, 160, 23, 0.05)';
  ctx.beginPath(); ctx.arc(100, 0, 90, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // MPC body
  const mx = 24, my = 12, mw = 152, mh = 110;
  _px(ctx, mx + 4, my + mh, mw, 4, '#0a0a08');                 // drop shadow
  _px(ctx, mx, my, mw, mh, '#2a2a2a');
  _px(ctx, mx, my, mw, 2, '#4a4a4a');                          // top edge highlight
  _px(ctx, mx, my, 2, mh, '#3a3a3a');                          // left edge
  _px(ctx, mx + mw - 2, my, 2, mh, '#1a1a1a');                 // right edge
  _px(ctx, mx, my + mh - 2, mw, 2, '#1a1a1a');                 // bottom edge
  // Top control plate
  _px(ctx, mx + 4, my + 4, mw - 8, 16, '#1a1a1a');
  _px(ctx, mx + 4, my + 4, mw - 8, 1, '#3a3a3a');
  // Brand text on left
  ctx.fillStyle = '#D4A017';
  ctx.font = 'bold 5px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('BBX-16', mx + 8, my + 13);
  // LCD display
  const lcdX = mx + 38, lcdY = my + 6, lcdW = 50, lcdH = 12;
  _px(ctx, lcdX, lcdY, lcdW, lcdH, '#0a3a14');
  _px(ctx, lcdX, lcdY, lcdW, 1, '#1a5a24');
  _px(ctx, lcdX, lcdY + lcdH - 1, lcdW, 1, '#062a0a');
  // LCD shows the steady "BEATBOX" title (no flicker)
  ctx.fillStyle = '#22c55e';
  ctx.font = 'bold 7px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('BEATBOX', lcdX + lcdW / 2, lcdY + 9);
  // Knobs (3 along top right)
  for (let i = 0; i < 3; i++) {
    const kx = mx + mw - 30 + i * 9;
    _px(ctx, kx, my + 7, 7, 7, '#4a4a4a');
    _px(ctx, kx, my + 7, 7, 1, '#6a6a6a');
    _px(ctx, kx, my + 7, 1, 7, '#5a5a5a');
    // pointer (animated)
    const angle = (fc * 0.04 + i * 0.7) % (Math.PI * 2);
    const px = Math.floor(kx + 3.5 + Math.cos(angle) * 2.5);
    const py = Math.floor(my + 10.5 + Math.sin(angle) * 2.5);
    _px(ctx, px, py, 1, 1, '#fbbf24');
  }
  // Pad grid 4×4 — sized so the whole grid fits inside the body with margin
  const padSize = 14;
  const padGap  = 3;
  const gridW = padSize * 4 + padGap * 3;          // 4*14 + 3*3 = 65
  const padX0 = mx + Math.floor((mw - gridW) / 2); // centered horizontally
  const padY0 = my + 26;                           // below LCD/header
  const stepBeat = Math.floor(fc / 4) % 16;
  // A simple looping pattern across the 16 steps. step → (row, col)
  // Pads light up steady when their step is in the "on" set, brighten on the
  // current step.
  const padPattern = [
    [1, 0, 1, 0], // row 0 (kick)
    [0, 1, 0, 0], // row 1 (snare)
    [1, 1, 1, 1], // row 2 (hats)
    [0, 0, 0, 1], // row 3 (cymbal)
  ];
  const padColors = ['#fb7185', '#fbbf24', '#22d3ee', '#a78bfa'];
  const curRow = Math.floor(stepBeat / 4);
  const curCol = stepBeat % 4;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const px = padX0 + col * (padSize + padGap);
      const py = padY0 + row * (padSize + padGap);
      // Pad shell
      _px(ctx, px, py, padSize, padSize, '#0c0a09');
      _px(ctx, px + 1, py + 1, padSize - 2, padSize - 2, '#1a1a1a');
      _px(ctx, px + 1, py + 1, padSize - 2, 1, '#3a3a3a');
      const baseColor = padColors[row];
      const isHit = padPattern[row][col] === 1;
      const flash = (curRow === row && curCol === col);
      if (flash && isHit) {
        // Bright flash: full inner + white top streak
        _px(ctx, px + 2, py + 2, padSize - 4, padSize - 4, baseColor);
        _px(ctx, px + 2, py + 2, padSize - 4, 2, '#fff');
      } else if (flash) {
        // Step head over a non-hit: dim color highlight
        ctx.globalAlpha = 0.5;
        _px(ctx, px + 3, py + 3, padSize - 6, padSize - 6, baseColor);
        ctx.globalAlpha = 1;
      } else if (isHit) {
        // Steady-lit pad
        _px(ctx, px + 3, py + 3, padSize - 6, padSize - 6, baseColor);
        ctx.globalAlpha = 0.3;
        _px(ctx, px + 2, py + 2, padSize - 4, padSize - 4, baseColor);
        ctx.globalAlpha = 1;
      } else {
        // Dim glow
        ctx.globalAlpha = 0.15;
        _px(ctx, px + 4, py + 4, padSize - 8, padSize - 8, baseColor);
        ctx.globalAlpha = 1;
      }
    }
  }
  // Step LED row at the bottom of the unit (16 LEDs)
  const ledY = my + mh - 8;
  const ledStart = mx + 8;
  const ledW = 4, ledGap = 5;
  for (let s = 0; s < 16; s++) {
    const lx = ledStart + s * (ledW + ledGap - 1);
    const on = stepBeat === s;
    _px(ctx, lx, ledY, ledW, 3, on ? '#fbbf24' : '#3a2810');
    if (on) _px(ctx, lx, ledY, ledW, 1, '#fef3c7');
  }
  // Tiny labels above the LED row
  ctx.fillStyle = '#5a4a30';
  ctx.font = 'bold 4px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('STEPS', mx + 8, ledY - 1);
};

// Showmanship: bedroom with character dancing in front of a tall mirror.
// The reflection is clipped to the mirror's interior so it appears INSIDE.
const drawShowmanshipScene = (ctx, fc, look) => {
  const W = 200, H = 130;
  // Wall
  _px(ctx, 0, 0, W, 95, '#2a2335');
  // Wallpaper pattern (subtle dots)
  for (let y = 6; y < 95; y += 12) {
    for (let x = 8; x < W; x += 12) {
      _px(ctx, x, y, 1, 1, '#3a3045');
    }
  }
  // Floor
  _px(ctx, 0, 95, W, 35, '#3a2818');
  _px(ctx, 0, 95, W, 1, '#5a3a28');
  // Floor planks
  for (let i = 0; i < 5; i++) _px(ctx, i * 40, 96, 1, 34, '#2a1a10');
  // Disco ball at top center (mounted on cord)
  _px(ctx, 96, 6, 8, 8, '#aaa');
  _px(ctx, 96, 6, 8, 1, '#dadada');
  _px(ctx, 96, 7, 1, 6, '#888');                // ball left shadow
  _px(ctx, 103, 7, 1, 6, '#dadada');            // ball right highlight
  _px(ctx, 100, 0, 1, 6, '#1a1a1a');            // hanging cord
  // Animated facet glints inside the disco ball
  for (let i = 0; i < 6; i++) {
    const f = (fc + i * 7) % 24;
    if (f < 12) {
      const fx = 97 + (i * 3) % 6;
      const fy = 7 + Math.floor(i / 2);
      _px(ctx, fx, fy, 1, 1, '#fef3c7');
    }
  }
  // Sparkle rays radiating outward
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2 + fc * 0.02;
    const r = 14 + ((fc + i * 5) % 30) * 0.5;
    if ((fc + i * 11) % 60 < 35) {
      const sx = Math.floor(100 + Math.cos(ang) * r);
      const sy = Math.floor(10 + Math.sin(ang) * r);
      if (sx > 0 && sx < W && sy > 0 && sy < 90) {
        _px(ctx, sx, sy, 1, 1, i % 2 ? '#fbbf24' : '#fef3c7');
      }
    }
  }
  // ---- Mirror ----
  const mfX = 22, mfY = 30, mfW = 50, mfH = 78;
  // Outer ornate gold frame
  _px(ctx, mfX - 4, mfY - 4, mfW + 8, mfH + 8, '#7a540a');
  _px(ctx, mfX - 4, mfY - 4, mfW + 8, 2, '#fbbf24');           // top highlight
  _px(ctx, mfX - 4, mfY - 4, 2, mfH + 8, '#fbbf24');           // left highlight
  _px(ctx, mfX + mfW + 2, mfY - 4, 2, mfH + 8, '#3a2410');     // right shadow
  _px(ctx, mfX - 4, mfY + mfH + 2, mfW + 8, 2, '#3a2410');     // bottom shadow
  // Frame ornaments (small bumps)
  _px(ctx, mfX - 3, mfY - 6, 2, 2, '#fbbf24');
  _px(ctx, mfX + mfW + 1, mfY - 6, 2, 2, '#fbbf24');
  _px(ctx, mfX + Math.floor(mfW / 2) - 1, mfY - 6, 2, 2, '#fbbf24');
  // Mirror surface — bluish gradient
  for (let y = 0; y < mfH; y++) {
    const t = y / mfH;
    const r = Math.floor(0x44 + t * 0x06);
    const g = Math.floor(0x4a + t * 0x06);
    const b = Math.floor(0x6a - t * 0x10);
    _px(ctx, mfX, mfY + y, mfW, 1, `rgb(${r},${g},${b})`);
  }
  // Subtle diagonal sparkle on the glass
  for (let i = 0; i < 4; i++) {
    const sy = mfY + 6 + i * 18;
    _px(ctx, mfX + 4 + i * 2, sy, 6, 1, 'rgba(255,255,255,0.10)');
  }
  // Reflection — clipped to mirror bounds, drawn at fixed center inside mirror
  const danceFrame = Math.floor(fc / 8) % 4;
  ctx.save();
  ctx.beginPath();
  ctx.rect(mfX, mfY, mfW, mfH);
  ctx.clip();
  // Reflection-floor cue (slightly visible) at bottom of mirror
  _px(ctx, mfX, mfY + mfH - 6, mfW, 6, 'rgba(58,40,24,0.4)');
  // Reflection: mirrored dancer placed in the mirror interior, slight haze
  ctx.globalAlpha = 0.85;
  drawDancer(ctx, mfX + Math.floor(mfW / 2), mfY + mfH - 6, look, danceFrame, true, 1);
  ctx.globalAlpha = 1;
  ctx.restore();
  // Floor reflection of the mirror (subtle gradient strip)
  _px(ctx, mfX - 4, mfY + mfH + 5, mfW + 8, 1, 'rgba(255,255,255,0.05)');
  // Real dancer (right side of room)
  const playerX = 138, playerY = 112;
  drawDancer(ctx, playerX, playerY, look, danceFrame, false, 1);
  // Music notes streaming up from real dancer
  for (let i = 0; i < 4; i++) {
    const phase = (fc * 0.5 + i * 22) % 80;
    if (phase < 60) {
      const nx = playerX - 8 + Math.sin((fc * 0.05) + i) * 4 + i * 6;
      const ny = 100 - phase * 0.7;
      ctx.globalAlpha = Math.max(0, 1 - phase / 60);
      ctx.fillStyle = i % 2 ? '#fb7185' : '#fbbf24';
      ctx.fillRect(Math.floor(nx), Math.floor(ny), 3, 2);
      ctx.fillRect(Math.floor(nx + 2), Math.floor(ny - 5), 1, 5);
      ctx.fillRect(Math.floor(nx + 3), Math.floor(ny - 5), 2, 1);
      ctx.globalAlpha = 1;
    }
  }
  // Speaker box on the floor (giving the dancer something to dance to)
  _px(ctx, 162, 100, 18, 22, '#1a1a1a');
  _px(ctx, 162, 100, 18, 1, '#3a3a3a');
  _px(ctx, 165, 103, 12, 7, '#0a0a0a');                  // upper cone
  _px(ctx, 170, 105, 2, 3, '#2a2a2a');                   // cone center
  _px(ctx, 165, 113, 12, 7, '#0a0a0a');                  // lower cone
  _px(ctx, 170, 115, 2, 3, '#2a2a2a');
  // Speaker pulse (animated)
  if (fc % 16 < 8) {
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1;
    ctx.strokeRect(160, 98, 22, 26);
    ctx.globalAlpha = 1;
  }
};

// Tiny dancer pose helper used by the showmanship scene + its mirror.
// (x, y) is feet-center. Different `frame` produces different pose.
const drawDancer = (ctx, x, y, look, frame, mirrored, scaleHint) => {
  // We don't actually scale because pixel art looks better at 1:1, but we
  // do alter pose by frame.
  const px = (dx, dy, w, h, c) => {
    const rx = mirrored ? -dx - w + 1 : dx;
    _px(ctx, x + rx, y + dy, w, h, c);
  };
  // Pose by frame:
  // 0: arms up
  // 1: arms wide (left high, right out)
  // 2: arms down (rest)
  // 3: arms wide (left out, right high)
  const armUpL = (frame === 0) || (frame === 1);
  const armUpR = (frame === 0) || (frame === 3);
  const legSplit = frame % 2 === 1;
  // Shadow
  px(-7, 0, 14, 1, 'rgba(0,0,0,0.45)');
  // Legs
  if (legSplit) {
    px(-5, -8, 3, 8, '#1a1a2e');
    px(2, -8, 3, 8, '#1a1a2e');
  } else {
    px(-4, -8, 3, 8, '#1a1a2e');
    px(1, -8, 3, 8, '#1a1a2e');
  }
  // Shoes
  if (legSplit) { px(-5, -1, 3, 1, '#fff'); px(2, -1, 3, 1, '#fff'); }
  else          { px(-4, -1, 3, 1, '#fff'); px(1, -1, 3, 1, '#fff'); }
  // Body / shirt
  px(-5, -19, 10, 11, look?.shirt || '#a78bfa');
  px(-5, -19, 10, 1, '#fff');
  // Arms — depending on pose
  // Left arm
  if (armUpL) {
    px(-7, -25, 2, 6, look?.shirt || '#a78bfa'); // arm up
    px(-7, -27, 2, 2, look?.skin || '#d4a87a');   // hand
  } else {
    px(-9, -16, 2, 8, look?.shirt || '#a78bfa'); // arm out
    px(-11, -14, 2, 2, look?.skin || '#d4a87a'); // hand
  }
  // Right arm
  if (armUpR) {
    px(5, -25, 2, 6, look?.shirt || '#a78bfa');
    px(5, -27, 2, 2, look?.skin || '#d4a87a');
  } else {
    px(7, -16, 2, 8, look?.shirt || '#a78bfa');
    px(9, -14, 2, 2, look?.skin || '#d4a87a');
  }
  // Head
  px(-4, -25, 8, 7, look?.skin || '#d4a87a');
  // Hair
  if ((look?.style || 'short') === 'short') {
    px(-4, -27, 8, 2, look?.hair || '#1a1a2e');
  } else if (look?.style === 'mohawk') {
    px(-4, -25, 8, 1, look?.hair || '#1a1a2e');
    px(-1, -28, 2, 3, look?.hair || '#1a1a2e');
  } else if (look?.style === 'long') {
    px(-5, -26, 10, 2, look?.hair || '#1a1a2e');
  } else if (look?.style === 'spike') {
    px(-4, -26, 8, 1, look?.hair || '#1a1a2e');
    px(-3, -28, 2, 2, look?.hair || '#1a1a2e');
    px(0, -29, 2, 3, look?.hair || '#1a1a2e');
  } else if (look?.style === 'fade') {
    px(-4, -27, 8, 2, look?.hair || '#1a1a2e');
    px(-4, -25, 8, 1, '#000');
  }
  // Eyes
  px(-3, -23, 1, 1, '#1a1a2e');
  px(1, -23, 1, 1, '#1a1a2e');
  // Mouth (smile while dancing)
  px(-1, -20, 3, 1, '#3a1010');
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

// ============ TUTORIAL POP-UPS ============
// One-shot Foxy tips that fire on first-occurrence state transitions, to
// guide brand-new players through their opening loop. Each tutorial sets a
// flag (`tut_<id>`) on storyFlags so it never re-fires. Watcher lives inside
// the App component and only fires when no other cutscene is active.
const TUTORIALS = [
  { id: 'start_busk',
    when: (c) => (c.day || 1) === 1 && (c.minutes || 0) < 600 && (c.cash || 0) < 30,
    lines: [
      "first up — head to the park and busk for an hour.",
      "you'll get a few bucks and bump your showmanship. it's how everyone starts here.",
    ],
  },
  { id: 'low_energy',
    when: (c) => (c.energy || 0) <= 30 && !c._sleepingNow,
    lines: [
      "you're getting tired. when energy's low, head home.",
      "couch tab in your apartment — power nap to top up, or sleep till morning.",
    ],
  },
  { id: 'low_hunger',
    when: (c) => (c.hunger || 0) <= 30,
    lines: [
      "stomach's rumbling. swing by your kitchen and eat something.",
      "tip: i drop a free Foxy Soup in your fridge every day. take it.",
    ],
  },
  { id: 'low_mood',
    when: (c) => (c.mood || 100) <= 30,
    lines: [
      "you're in a slump. mood drains your training rewards if it stays low.",
      "talk to people at the bar, take a walk, or play a song to get back up.",
    ],
  },
  { id: 'first_money',
    when: (c) => (c.cash || 0) >= 25 && (c.day || 1) <= 4,
    lines: [
      "nice — pocket money. don't spend it all on snacks.",
      "sunday rent is $50 a week to start. budget around that.",
    ],
  },
  { id: 'try_jam',
    when: (c) => (c.day || 1) >= 2 && (c.cash || 0) >= 5 && !c.storyFlags?.firstJam,
    lines: [
      "once you've got busking down, try Jam in the park.",
      "5 cycles → +1 random stat + a few followers. that's how you get on the radar.",
    ],
  },
  { id: 'bar_open',
    when: (c) => (c.day || 1) >= 3,
    lines: [
      "the bar opens today. tap the bar tile in the city.",
      "tue/wed/thu = open mic — free shot at fans. fri = paid showcase, sat = battle, sun = karaoke.",
    ],
  },
  { id: 'late_night',
    when: (c) => (c.minutes || 0) >= 1080,
    lines: [
      "heads up — it's getting late.",
      "the day cuts off at 2 AM. sleep before then or you'll collapse and lose half your morning.",
    ],
  },
  { id: 'rent_warning',
    when: (c) => ((c.day || 1) % 7) === 5 && (c.cash || 0) < 50 && !c.storyFlags?.firstRentPaid,
    lines: [
      "saturday already. rent's $50 tomorrow.",
      "if you're short — busk hard, hit the karaoke bar tonight, or skip a meal. don't miss it.",
    ],
  },
  { id: 'shop_open',
    when: (c) => (c.day || 1) >= 4,
    lines: [
      "the shop opens today. four sub-stores: music, furniture, clothing, pet.",
      "music gear boosts training; furniture buffs your home; clothing affects shows; pet's a daily mood bump.",
    ],
  },
  { id: 'routines',
    when: (c) => (c.openMicCount || 0) >= 1,
    lines: [
      "now you've done a mic — about your routines.",
      "head home → PC/Train tab → train Originality. that's where the MPC lives — build your own loops there.",
      "your saved patterns are what gets played at open mics. better originality = better routines = better shows.",
    ],
  },
];

// ============ SLOTS SCREEN ============
// Five save slots. User can switch between, create new, or delete characters.

function SlotsScreen({ activeSlot, onSwitch, onDelete, onBack = null }) {
  const [slots, setSlots] = useState(null); // array of (char | null)
  const [confirmDelete, setConfirmDelete] = useState(null); // slot number being confirmed
  const [confirmText, setConfirmText] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [importStatus, setImportStatus] = useState(null); // { slot, msg, kind }
  const fileInputRefs = useRef({}); // hidden <input type="file"> per slot

  useEffect(() => {
    loadAllSlots().then(setSlots);
  }, [refreshKey]);

  const handleDelete = async (n) => {
    await onDelete(n);
    setConfirmDelete(null);
    setConfirmText('');
    setRefreshKey(k => k + 1);
  };

  // Serialize a slot's character to a JSON file the user can save to disk
  // (lightweight cloud-save: copy this file to another device + import).
  const exportSlot = (n, slot) => {
    if (!slot || !slot.created) return;
    const safeName = (slot.name || 'character').replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
    const filename = `beatbox-${safeName}-slot${n}-day${slot.day || 1}.json`;
    const blob = new Blob([JSON.stringify(slot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  // Import a JSON save into the given slot. Validates loosely (must have
  // `created: true` and look like an object) so a random file can't trash
  // the slot, but doesn't enforce schema — migrateChar will fill in any
  // missing fields the next time the slot is loaded.
  const importSlot = async (n, file) => {
    if (!file) return;
    setImportStatus({ slot: n, msg: 'Reading file...', kind: 'info' });
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || !parsed.created) {
        setImportStatus({ slot: n, msg: "That doesn't look like a Beatbox save.", kind: 'bad' });
        return;
      }
      await saveSlot(n, parsed);
      setImportStatus({ slot: n, msg: `Imported ${parsed.name || 'character'} ✓`, kind: 'win' });
      setRefreshKey(k => k + 1);
    } catch (e) {
      setImportStatus({ slot: n, msg: `Import failed: ${e.message || e}`, kind: 'bad' });
    }
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

            {/* Filled slot footer: Export + Delete side by side */}
            {isFilled && !isConfirming && (
              <div className="flex border-t border-stone-800">
                <button onClick={() => exportSlot(slotN, slot)}
                  className="flex-1 px-4 py-1.5 text-[10px] text-stone-600 hover:text-amber-400 uppercase tracking-widest transition-colors text-left">
                  📤 Export save
                </button>
                <button onClick={() => setConfirmDelete(slotN)}
                  className="flex-1 px-4 py-1.5 text-[10px] text-stone-600 hover:text-red-400 uppercase tracking-widest transition-colors text-right">
                  🗑 Delete
                </button>
              </div>
            )}

            {/* Empty slot footer: hidden file input + visible "import" link */}
            {!isFilled && (
              <div className="border-t border-stone-800">
                <input
                  type="file"
                  accept="application/json,.json"
                  ref={(el) => { fileInputRefs.current[slotN] = el; }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) importSlot(slotN, f);
                    e.target.value = '';
                  }}
                  style={{ display: 'none' }}
                />
                <button onClick={() => fileInputRefs.current[slotN]?.click()}
                  className="w-full px-4 py-1.5 text-[10px] text-stone-600 hover:text-amber-400 uppercase tracking-widest transition-colors text-center">
                  📥 Import save (.json)
                </button>
                {importStatus && importStatus.slot === slotN && (
                  <div className={`px-4 py-1.5 text-[10px] uppercase tracking-widest text-center ${
                    importStatus.kind === 'win' ? 'text-amber-400' :
                    importStatus.kind === 'bad' ? 'text-red-400' :
                    'text-stone-500'
                  }`}>
                    {importStatus.msg}
                  </div>
                )}
              </div>
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
  const [showMessages, setShowMessages] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // Queue of freshly-earned achievements waiting for their fanfare modal.
  const [achievementQueue, setAchievementQueue] = useState([]);
  // Hidden developer mode. Triple-tap the day-of-week badge → enter passcode
  // (808) → unlocks. Persists in localStorage so it's sticky between sessions.
  // Inside the panel you can jump days, set time, edit cash/energy/etc.
  const [devUnlocked, setDevUnlocked] = useState(() => {
    try { return typeof localStorage !== 'undefined' && localStorage.getItem('beatbox_dev') === '1'; }
    catch { return false; }
  });
  const [showDevPanel, setShowDevPanel] = useState(false);
  // Backup entry: if the prompt-based unlock is awkward on a phone, the
  // Achievements panel exposes a small input that calls this directly.
  const tryDevUnlock = (code) => {
    if (!code || code.trim() !== '808') return false;
    try { localStorage.setItem('beatbox_dev', '1'); } catch {}
    setDevUnlocked(true);
    setShowDevPanel(true);
    return true;
  };
  const devTapsRef = useRef({ count: 0, last: 0 });
  const handleDevBadgeTap = () => {
    const now = Date.now();
    const t = devTapsRef.current;
    if (now - t.last > 800) t.count = 0;
    t.last = now;
    t.count += 1;
    if (t.count < 3) return;
    t.count = 0;
    if (devUnlocked) { setShowDevPanel(true); return; }
    const code = typeof window !== 'undefined' ? window.prompt('Dev code:') : null;
    tryDevUnlock(code);
  };
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

  // Tutorial pop-ups — fire one Foxy tip per state transition, only when no
  // cutscene is up and only once per id. Stored under storyFlags as `tut_<id>`.
  useEffect(() => {
    if (!char || !char.created) return;
    if (cutscene) return;
    if (screen === 'loading' || screen === 'slots' || screen === 'create' || screen === 'intro') return;
    const flags = char.storyFlags || {};
    for (const t of TUTORIALS) {
      if (flags[`tut_${t.id}`]) continue;
      try { if (!t.when(char)) continue; } catch { continue; }
      playCutscene({
        speaker: 'FOXY · TIP',
        speakerColor: '#84cc16',
        lines: t.lines,
      }, `tut_${t.id}`);
      break;
    }
  }, [char?.day, char?.minutes, char?.energy, char?.hunger, char?.mood, char?.cash, char?.created, char?.storyFlags, cutscene, screen]);

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
    if (typeof c.apartmentTier !== 'number') c.apartmentTier = 1;
    if (typeof c.rentLate !== 'number') c.rentLate = 0;
    if (c.lastRentPaidDay === undefined) c.lastRentPaidDay = null;
    if (c.evictionRecoveryDay === undefined) c.evictionRecoveryDay = null;
    if (!Array.isArray(c.messages)) c.messages = [];
    if (typeof c.lastParentMsgDay !== 'number') c.lastParentMsgDay = 0;
    if (typeof c.lastFoxySafetyNetDay !== 'number') c.lastFoxySafetyNetDay = 0;
    if (typeof c.lastFoxySoupDay !== 'number') c.lastFoxySoupDay = 0;
    if (typeof c.foxyLoanTaken !== 'boolean') c.foxyLoanTaken = false;
    if (typeof c.mingleCount !== 'number') c.mingleCount = 0;
    if (!c.romanceAffinity || typeof c.romanceAffinity !== 'object') c.romanceAffinity = {};
    if (!c.romanceState || typeof c.romanceState !== 'object') c.romanceState = {};
    if (c.dateBooking === undefined) c.dateBooking = null;
    if (!c.metEncounters || typeof c.metEncounters !== 'object') c.metEncounters = {};
    if (!c.daily || typeof c.daily !== 'object') c.daily = {};
    if (c.dailyChallenge === undefined) c.dailyChallenge = null;
    if (!c.weekly || typeof c.weekly !== 'object') c.weekly = {};
    if (c.weeklyChallenge === undefined) c.weeklyChallenge = null;
    if (!Array.isArray(c.songs)) c.songs = [];
    if (!Array.isArray(c.crew)) c.crew = [];
    if (!c.achievements || typeof c.achievements !== 'object') c.achievements = {};
    if (typeof c.lastTourDay !== 'number') c.lastTourDay = 0;
    if (c.festivalState === undefined) c.festivalState = null;
    if (typeof c.festivalAcceptedDay !== 'number') c.festivalAcceptedDay = 0;
    if (c.festivalPath === undefined) c.festivalPath = null;
    if (c.festivalResult === undefined) c.festivalResult = null;
    if (typeof c.outfit !== 'string') c.outfit = 'default';
    if (typeof c.accessory !== 'string') c.accessory = 'none';
    if (typeof c.lastStreamDay !== 'number') c.lastStreamDay = 0;
    if (typeof c.lastStreamViewers !== 'number') c.lastStreamViewers = 0;
    if (typeof c.sickDay !== 'number') c.sickDay = 0;
    if (typeof c.bjarneSessions !== 'number') c.bjarneSessions = 0;
    if (typeof c.lastBjarneDay !== 'number') c.lastBjarneDay = 0;
    if (typeof c.apartmentMovedInDay !== 'number') c.apartmentMovedInDay = 0;
    if (!c.flashbacksSeen || typeof c.flashbacksSeen !== 'object') c.flashbacksSeen = {};
    if (!c.gear || typeof c.gear !== 'object') c.gear = {};
    if (typeof c.lastCoffeeDay !== 'number') c.lastCoffeeDay = 0;
    if (typeof c.lastPlantWaterDay !== 'number') c.lastPlantWaterDay = 0;
    if (typeof c.plantWaterCount !== 'number') c.plantWaterCount = 0;
    if (typeof c.plantWaterCountDay !== 'number') c.plantWaterCountDay = 0;
    if (typeof c.plantDead !== 'boolean') c.plantDead = false;
    if (typeof c.plantDeathDay !== 'number') c.plantDeathDay = 0;
    if (typeof c.lastYogaDay !== 'number') c.lastYogaDay = 0;
    if (!c.storyFlags || typeof c.storyFlags !== 'object') c.storyFlags = {};
    return c;
  };

  // On mount: migrate legacy save, find active slot, load it. Land on the
  // title screen regardless — tapping Play continues to 'hood' if there's
  // an active char, or 'slots' if not.
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
        }
      }
      setScreen('title');
      setLoaded(true);
    })();
  }, []);

  // Save the active slot whenever char changes, but throttled so we don't
  // serialize the whole char + hit storage on every activity tick. At most
  // one save per SAVE_THROTTLE_MS, with a trailing-edge save to capture the
  // latest state, plus a beforeunload flush so closing the tab doesn't lose
  // recent progress.
  const SAVE_THROTTLE_MS = 2000;
  const lastSaveTimeRef = useRef(0);
  const pendingSaveRef = useRef(null);
  const latestCharRef = useRef(char);
  useEffect(() => { latestCharRef.current = char; }, [char]);
  useEffect(() => {
    if (!(char && char.created && loaded && activeSlot)) return;
    const now = Date.now();
    const elapsed = now - lastSaveTimeRef.current;
    if (pendingSaveRef.current) {
      clearTimeout(pendingSaveRef.current);
      pendingSaveRef.current = null;
    }
    if (elapsed >= SAVE_THROTTLE_MS) {
      lastSaveTimeRef.current = now;
      saveSlot(activeSlot, char);
    } else {
      pendingSaveRef.current = setTimeout(() => {
        lastSaveTimeRef.current = Date.now();
        pendingSaveRef.current = null;
        saveSlot(activeSlot, latestCharRef.current);
      }, SAVE_THROTTLE_MS - elapsed);
    }
  }, [char, loaded, activeSlot]);
  // Best-effort flush on tab close / visibility hide so you never lose more
  // than the throttle window's worth of progress.
  useEffect(() => {
    const flush = () => {
      const c = latestCharRef.current;
      if (!(c && c.created && loaded && activeSlot)) return;
      if (pendingSaveRef.current) {
        clearTimeout(pendingSaveRef.current);
        pendingSaveRef.current = null;
      }
      lastSaveTimeRef.current = Date.now();
      saveSlot(activeSlot, c);
    };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    return () => {
      window.removeEventListener('beforeunload', flush);
      // visibilitychange listener is anonymous; harmless to leave on a
      // long-lived App. (App in this codebase mounts once.)
    };
  }, [loaded, activeSlot]);

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
    let next = c;
    const need = c.level * 100;
    if (c.xp >= need) {
      showToast(`LEVEL UP! → ${c.level + 1}`, 'win');
      try { playLevelUp(); } catch {}
      next = { ...c, level: c.level + 1, xp: c.xp - need };
    }
    // Sound unlocks fire from the same checkpoint — every event that
    // could shift a stat / follower / battle-win count routes through
    // checkLevelUp, so this catches them all in one place.
    const { char: withUnlocks, unlocked } = applySoundUnlocks(next);
    if (unlocked.length) {
      try { setTimeout(() => playUnlock(), 60); } catch {}
      setTimeout(() => unlocked.forEach(name => showToast(`🔓 Unlocked: ${name}`, 'win')), 80);
    }
    const { char: withAch, earned } = applyAchievements(withUnlocks);
    if (earned.length) {
      try { setTimeout(() => playAchievement(), 130); } catch {}
      // Queue the fanfare modals; toast still fires for catch-up info but the
      // modal is the headline moment.
      setAchievementQueue(q => [...q, ...earned]);
      setTimeout(() => earned.forEach(a => showToast(`🏆 Achievement: ${a.label}`, 'win')), 140);
    }
    return withAch;
  };

  // ---- 2 AM hard cap ----
  // Anywhere the player can drift past DAY_END (eating, mingle, bar drinks,
  // open mics, showcases, battles), this watcher catches it and force-
  // collapses them home: next day at 6 AM, partial energy, mood penalty.
  // Rent is also processed if the new day lands on a Sunday so they can't
  // dodge it by staying out late on Saturday.
  useEffect(() => {
    if (!char || !char.created) return;
    if ((char.minutes || 0) < DAY_END) return;
    setChar(c => {
      if ((c.minutes || 0) < DAY_END) return c;       // race-guard
      const max = c.maxEnergy ?? 100;
      const newDay = c.day + 1;
      const rent = computeRentEvent(c, newDay);
      let cash = c.cash || 0;
      let rentLate = c.rentLate || 0;
      let lastRentPaidDay = c.lastRentPaidDay;
      const flags = { ...(c.storyFlags || {}) };
      if (rent?.type === 'paid') {
        cash -= rent.amount;
        rentLate = 0;
        lastRentPaidDay = newDay;
        flags.firstRentPaid = true;
      } else if (rent?.type === 'missed' || rent?.type === 'warning') {
        rentLate = rent.type === 'warning' ? 2 : 1;
      } else if (rent?.type === 'evicted') {
        // Don't trigger the full eviction arc from a 2 AM collapse — keep
        // it at warning so the next *real* sleep handles it properly.
        rentLate = 2;
      }
      return {
        ...c,
        day: newDay,
        minutes: 0,
        energy: Math.floor(max * 0.6),
        hunger: Math.max(0, (c.hunger || 0) - 25),
        mood: Math.max(0, (c.mood || 0) - 12),
        cash,
        rentLate,
        lastRentPaidDay,
        pendingDebuff: null,
        storyFlags: flags,
      };
    });
    setScreen('house');
    setTimeout(() => showToast('You collapsed at 2 AM. Got home somehow.', 'bad'), 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [char?.minutes]);

  if (!loaded) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center font-mono px-6"
        style={{ background: 'linear-gradient(180deg, #1a0d2e 0%, #0c0a09 60%, #0c0a09 100%)' }}>
        <div className="text-[10px] uppercase tracking-[0.5em] text-amber-500/70 mb-2">A LIFE-SIM</div>
        <div className="text-[44px] sm:text-[60px] leading-none tracking-tighter text-amber-400 text-center"
          style={{
            fontFamily: '"Bebas Neue", "Oswald", sans-serif',
            textShadow: '3px 3px 0 #0c0a09, 6px 6px 18px rgba(212,160,23,0.30)',
            animation: 'loadPulse 2.4s ease-in-out infinite',
          }}>
          BEATBOX<br />STORY
        </div>
        <div className="text-[10px] uppercase tracking-[0.4em] text-stone-500 mt-4">loading<span style={{ animation: 'loadDots 1.4s steps(4) infinite' }}>...</span></div>
        <style>{`
          @keyframes loadPulse {
            0%, 100% { opacity: 0.85; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.02); }
          }
          @keyframes loadDots {
            0%   { opacity: 0; }
            25%  { opacity: 0.4; }
            50%  { opacity: 0.7; }
            75%  { opacity: 1; }
            100% { opacity: 0; }
          }
        `}</style>
      </div>
    );
  }

  // Title screen — main-menu splash. Sits at the top of the screen flow on
  // every cold start. Continues to 'hood' if there's an active loaded
  // character, otherwise dispatches to the slots picker.
  if (screen === 'title') {
    const hasActiveSlot = !!(char && char.created && activeSlot);
    return (
      <ScreenErrorBoundary>
        <GlobalErrorOverlay />
        <TitleScreen
          char={char}
          hasActiveSlot={hasActiveSlot}
          onPlay={() => setScreen(hasActiveSlot ? 'hood' : 'slots')}
          onSlots={() => setScreen('slots')}
          onSettings={() => setShowSettings(true)} />
        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
        <style>{`@keyframes screenFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      </ScreenErrorBoundary>
    );
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
    <ScreenErrorBoundary>
    <GlobalErrorOverlay />
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
                  <button onClick={handleDevBadgeTap}
                    type="button"
                    aria-label="Day of week"
                    title={devUnlocked ? 'Dev mode (triple-tap)' : ''}
                    className={`text-[9px] uppercase tracking-[0.3em] select-none p-0 m-0 bg-transparent border-0 ${devUnlocked ? 'text-amber-300' : 'text-amber-500'}`}
                    style={{
                      WebkitTapHighlightColor: 'transparent',
                      WebkitUserSelect: 'none',
                      userSelect: 'none',
                      WebkitTouchCallout: 'none',
                      touchAction: 'manipulation',
                      cursor: 'default',
                    }}>
                    {DAY_NAMES_SHORT[dayOfWeek(char.day)]}{devUnlocked ? '*' : ''}
                  </button>
                  <span className="text-[9px] uppercase tracking-[0.3em] text-stone-500">Day {char.day}</span>
                  <Clock minutes={char.minutes ?? 0} day={char.day} />
                </div>
                <div className="text-amber-500 font-bold tracking-wider text-sm" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
                  {char.name.toUpperCase()} <span className="text-stone-500">·</span> LVL {char.level}
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="text-right">
                  <div className="text-amber-400 font-bold text-sm">${char.cash}</div>
                  <div className="text-[9px] text-stone-500 uppercase tracking-widest">{char.followers} fans</div>
                </div>
                {(() => {
                  const unread = unreadMessageCount(char);
                  return (
                    <button
                      onClick={() => setShowMessages(true)}
                      aria-label="Messages"
                      title="Messages"
                      className="relative w-8 h-8 flex items-center justify-center text-stone-500 hover:text-amber-500 border border-stone-800 hover:border-amber-500/50 transition-all">
                      <MessageSquare size={14} />
                      {unread > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 px-1 flex items-center justify-center
                          text-[9px] font-bold bg-red-600 text-white rounded-full leading-none">
                          {unread > 9 ? '9+' : unread}
                        </span>
                      )}
                    </button>
                  );
                })()}
                <button
                  onClick={() => setShowSettings(true)}
                  aria-label="Settings"
                  title="Settings"
                  className="w-8 h-8 flex items-center justify-center text-stone-500 hover:text-amber-500 border border-stone-800 hover:border-amber-500/50 transition-all">
                  <span className="text-xs leading-none">⚙</span>
                </button>
                <button
                  onClick={() => setShowAchievements(true)}
                  aria-label="Achievements"
                  title="Achievements"
                  className="w-8 h-8 flex items-center justify-center text-stone-500 hover:text-amber-500 border border-stone-800 hover:border-amber-500/50 transition-all">
                  <Trophy size={14} />
                </button>
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
        {showMessages && <MessagesPanel char={char} setChar={setChar} onClose={() => setShowMessages(false)} />}
        {showAchievements && (
          <AchievementsPanel char={char} onClose={() => setShowAchievements(false)}
            devUnlocked={devUnlocked}
            onDevUnlock={(code) => tryDevUnlock(code)}
            onOpenDevPanel={() => { setShowAchievements(false); setShowDevPanel(true); }} />
        )}
        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
        {achievementQueue.length > 0 && (
          <AchievementFanfare
            key={achievementQueue[0].id}
            item={achievementQueue[0]}
            onClose={() => setAchievementQueue(q => q.slice(1))} />
        )}
        {showDevPanel && devUnlocked && (
          <DevPanel char={char} setChar={setChar} onClose={() => setShowDevPanel(false)}
            onLock={() => {
              try { localStorage.removeItem('beatbox_dev'); } catch {}
              setDevUnlocked(false);
              setShowDevPanel(false);
            }} />
        )}

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
          <ScreenErrorBoundary>
          <div key={screen} style={{
            animation: getSettings().reducedMotion ? 'none' : 'screenFade 0.28s ease-out',
          }}>
          {screen === 'slots' && (
            <SlotsScreen
              activeSlot={activeSlot}
              onSwitch={switchToSlot}
              onDelete={deleteSlotAt}
              onBack={char && char.created && activeSlot ? () => setScreen('hood') : null}
            />
          )}
          {screen === 'create' && <CreateScreen char={char} setChar={setChar} onDone={() => {
            setChar(c => {
              // Seed the inbox with a welcoming parent text so the player knows the icon exists.
              let next = { ...c, created: true };
              if (!(c.messages || []).length) {
                next = addMessage(next, 'parents', "you settled in? we're not mad about the job. come over for sunday dinner anytime ❤️");
                next.lastParentMsgDay = c.day || 1;
              }
              return next;
            });
            setScreen('hood');
          }} />}
          {screen === 'hood' && <HoodScreen go={setScreen} char={char} />}
          {screen === 'house' && <HouseScreen char={char} update={update} updateStats={updateStats} passTime={passTime} setChar={setChar} checkLevelUp={checkLevelUp} showToast={showToast} go={setScreen} activeSlot={activeSlot} playCutscene={playCutscene} />}
          {screen === 'shop' && <ShopScreen char={char} setChar={setChar} showToast={showToast} go={setScreen} playCutscene={playCutscene} />}
          {screen === 'park' && <ParkScreen char={char} setChar={setChar} passTime={passTime} showToast={showToast} go={setScreen} checkLevelUp={checkLevelUp} playCutscene={playCutscene} />}
          {screen === 'bar' && <BarScreen char={char} setChar={setChar} go={setScreen} showToast={showToast} checkLevelUp={checkLevelUp} playCutscene={playCutscene} />}
          {screen === 'battle' && <BattleScreen char={char} setChar={setChar} go={setScreen} showToast={showToast} checkLevelUp={checkLevelUp} playCutscene={playCutscene} />}
          </div>
          </ScreenErrorBoundary>
        </div>
        <style>{`@keyframes screenFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }`}</style>

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
    </ScreenErrorBoundary>
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
// Pixel-art map of the neighborhood with clickable location hotspots.
// Day / night background swaps based on the in-game clock; hotspots dim
// + show 🔒 when their location is locked (e.g. shop before day 5,
// bar at noon, park after sundown).
// Cat walking-path waypoints — coordinates are % of the hood map box.
// Tune in tools/cat-path-editor.html (live preview + drag-to-edit).
// CAT_DUR is total seconds for one full traversal.
const CAT_PATH = [
  { x: -5.99,  y: 71.73 },
  { x: 26.08,  y: 68.91 },
  { x: 30.76,  y: 71.99 },
  { x: 38.95,  y: 73.30 },
  { x: 58.86,  y: 73.31 },
  { x: 114.91, y: 64.29 },
];
const CAT_DUR = 5;

// Stationary animated characters drawn on top of the hood map. Each
// runs a sprite-sheet step animation in place. Tune positions in
// tools/character-editor.html and paste the array back here.
//   x, y       — center-bottom (paws/feet) anchor in % of map box
//   width      — sprite width in % of map width
//   sheet      — PNG filename in beatbox_story/
//   frames     — frame count along the horizontal sheet
//   aspect     — frame width / frame height ratio string for CSS aspectRatio
//   loop       — full cycle duration in seconds
const CHARACTERS = [
  {
    id: 'beatboxer1',
    name: 'Beatboxer',
    x: 40.1, y: 59.38,
    width: 8.61,
    sheet: 'beatboxer-park.png',
    frames: 8,
    aspect: '64 / 128',
    loop: 1,
  },
];

// Build a @keyframes string from CAT_PATH, distributing time stops by
// arc length so the cat walks at constant pixel-speed across segments
// of different lengths.
function buildCatKeyframe(path) {
  if (!path || path.length < 2) {
    return '@keyframes catHoodWalk { from { left: -12%; top: 54%; } to { left: 100%; top: 54%; } }';
  }
  const dists = [];
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    dists.push(Math.sqrt(dx * dx + dy * dy));
  }
  const total = dists.reduce((s, d) => s + d, 0) || 1;
  let cum = 0;
  const stops = path.map((p, i) => {
    const pct = i === 0 ? 0 : ((cum += dists[i - 1]) / total) * 100;
    return `${pct.toFixed(2)}% { left: ${p.x}%; top: ${p.y}%; }`;
  });
  return `@keyframes catHoodWalk {\n${stops.join('\n')}\n}`;
}

function HoodScreen({ go, char }) {
  const mins = char.minutes ?? 0;
  const isDay = isDayTime(mins);
  const shopLockedByDay = !isUnlocked(char, 'shop');
  const barLockedByDay  = !isUnlocked(char, 'bar');
  const catKeyframeCss = buildCatKeyframe(CAT_PATH);
  // Hotspot rectangles given as percentages of the map's box, eyeballed
  // from the source art. Tweak if the art shifts.
  const hotspots = [
    { id: 'house', name: 'House',
      top: 10.25, left: 32.88, width: 29.77, height: 21.19,
      locked: false,
      desc: 'Train, eat, rest' },
    { id: 'park', name: 'Park',
      top: 48.5, left: 19.79, width: 33.62, height: 18.35,
      locked: !isDayTime(mins),
      lockReason: 'Empty at night · come back at sunrise (6 AM)',
      desc: 'Jam, busk, run' },
    { id: 'bar', name: 'Bar',
      top: 39.85, left: 74.99, width: 25.01, height: 20.9,
      locked: barLockedByDay || !isNightTime(mins),
      lockReason: barLockedByDay ? CONTENT_UNLOCKS.bar.label : 'Opens at 6 PM',
      desc: barLockedByDay ? '' : `Tonight: ${BAR_SCHEDULE[dayOfWeek(char.day)].title}` },
    { id: 'shop', name: 'Shop',
      top: 71.21, left: 64, width: 36, height: 22.73,
      locked: shopLockedByDay,
      lockReason: shopLockedByDay ? CONTENT_UNLOCKS.shop.label : null,
      desc: 'Gear & food' },
  ];
  return (
    <div className="space-y-3 pt-2">
      <div className="text-center mb-1">
        <div className="text-2xl tracking-widest text-stone-300"
          style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
          THE HOOD
        </div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">
          {isDay ? '☀ daytime · streets are alive' : '🌙 nighttime · neon glow'}
        </div>
      </div>

      <div className="relative w-full max-w-md mx-auto border-2 border-stone-800 select-none overflow-hidden"
        style={{ aspectRatio: '480 / 860', background: '#0c0a09' }}>
        <img src={isDay ? 'hood-day.png' : 'hood-night.png'}
          alt="The hood"
          className="absolute inset-0 w-full h-full block pointer-events-none"
          style={{ imageRendering: 'pixelated' }} />

        {/* Animated lighting overlay — only at night. Each light is an
            absolutely-positioned div with a soft box-shadow glow and a
            CSS animation. pointer-events:none so hotspot taps fall
            through. Coordinates are eyeballed onto the night art. */}
        {!isDay && (
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            {/* Apartment windows — soft amber breathing. Positions hand-
                tuned by the user via tools/light-editor.html so each glow
                lands on a specific lit window in the painted art. Each
                window has its own duration so the flickers de-sync. */}
            {[
              { top: 21.60887855876111, left: 35.88158019709708, h: 3.97, w: 3.1, delay: 0 },
              { top: 21.47, left: 40.780805589704954, h: 4.04, w: 3.21, delay: 0.7 },
              { top: 21.527801873851825, left: 45.53975898239213, h: 4, w: 4, delay: 1.4 },
              { top: 20.4070108153233, left: 52.95284923263007, h: 3.3590420208708855, w: 4.056364163626268, delay: 0.3 },
              { top: 27.076680432612932, left: 36.44259542552348, h: 6.92, w: 5.08, delay: 1.1 },
              { top: 27.30008259567759, left: 43.678508932820435, h: 6.455435097857652, w: 4.676821016418147, delay: 1.8 },
              { top: 23.945225667563083, left: 53.36717634636739, h: 5.699917404322408, w: 3.661592590022208, delay: 2.10 },
              { top: 23.4730258121695, left: 58.781732084787436, h: 4.755517693535244, w: 4, delay: 2.45 },
            ].map((w, i) => (
              <div key={`w${i}`} className="absolute"
                style={{
                  top: `${w.top}%`, left: `${w.left}%`,
                  width: `${w.w}%`, height: `${w.h}%`,
                  background: 'radial-gradient(ellipse at center, rgba(255, 196, 96, 0.55), rgba(255, 196, 96, 0))',
                  animation: `nightWindow ${3.2 + (i % 4) * 0.45}s ease-in-out ${w.delay}s infinite`,
                  mixBlendMode: 'screen',
                }} />
            ))}

            {/* LIVE neon sign — main red bar + small accent. Different
                durations + delays so they don't flicker in lock-step. */}
            {[
              { top: 48.81112144123889, left: 78.7225000991434,  w: 18.429771771890863, h: 5.283319567387068, dur: 1.8, delay: 0 },
              { top: 45.383085614317544, left: 72.99491766140545, w: 4.38577440910533,   h: 6.888792504592703, dur: 2.3, delay: 0.5 },
            ].map((n, i) => (
              <div key={`n${i}`} className="absolute"
                style={{
                  top: `${n.top}%`, left: `${n.left}%`, width: `${n.w}%`, height: `${n.h}%`,
                  background: 'radial-gradient(ellipse at center, rgba(251,56,90,0.85), rgba(251,56,90,0))',
                  animation: `nightNeon ${n.dur}s ease-in-out ${n.delay}s infinite`,
                  mixBlendMode: 'screen',
                }} />
            ))}
            {/* Halo behind the sign for extra glow */}
            <div className="absolute"
              style={{
                top: '54.199507884425266%', left: '77.27580578799176%', width: '22.724194212008243%', height: '17.872036393283803%',
                background: 'radial-gradient(circle at 50% 50%, rgba(251,56,90,0.30), rgba(251,56,90,0) 60%)',
                animation: 'nightNeonHalo 2.2s ease-in-out 0.3s infinite',
                mixBlendMode: 'screen',
              }} />

            {/* Corner shop awning glow — warm orange. Pool of light
                centered slightly above box-center so it sits on the
                painted awning, with a tight 40% stop so the gradient
                is fully transparent at every edge — no hard cutoff. */}
            {/* Corner shop awning glow — warm orange. Centered ellipse
                with a tight 45% stop so the glow is fully contained
                within the box (no edge bleed, no hard top line). */}
            <div className="absolute"
              style={{
                top: '69.23025034533137%', left: '51.6139932574855%', width: '48.3860067425145%', height: '28.607787639872498%',
                background: 'radial-gradient(ellipse at 50% 50%, rgba(255,136,40,0.6), rgba(255,136,40,0) 45%)',
                animation: 'nightShop 4.5s ease-in-out 0.8s infinite',
                mixBlendMode: 'screen',
              }} />

            {/* Park / sidewalk lamps — small steady amber pools, each
                with its own period for organic shimmer. */}
            {[
              { top: 23.029415495909713, left: 18.13873418518465, size: 15.271526549438907 },
              { top: 61.447782907449316, left: 52.9376355198301,  size: 17.938335677947215 },
              { top: 81.02168556533128,  left: 16.74696755549343, size: 14.945217913375087 },
              { top: 78.75322962173223,  left: 40.39653618619476, size: 17.943380499530157 },
            ].map((l, i) => (
              <div key={`l${i}`} className="absolute"
                style={{
                  top: `${l.top}%`, left: `${l.left}%`,
                  width: `${l.size}%`, height: `${l.size * 0.7}%`,
                  background: 'radial-gradient(ellipse at center, rgba(255,176,80,0.45), rgba(255,176,80,0) 70%)',
                  animation: `nightLamp ${4.2 + (i % 3) * 0.7}s ease-in-out ${i * 0.55}s infinite`,
                  mixBlendMode: 'screen',
                }} />
            ))}

            {/* Sewer vapor — wispy white-blue steam rising from the
                manhole lids. Three sub-puffs per source, staggered by
                negative animation-delay so one is always rising while
                another fades at the top — gives a continuous smoky
                column instead of a single puff-and-gap rhythm. */}
            {[
              { top: 30.959064404764717, left: 34.71786927178655, w: 6.993201416099867, h: 8.132843920500472, delay: 0.00 },
              { top: 34.59510144083729,  left: 82.0809444317872,  w: 7.3453403696516,   h: 8.525934695465015, delay: 0.70 },
              { top: 34.595094963009664, left: 91.41269343675572, w: 8.401763033423983, h: 9.115559521713484, delay: 1.40 },
              { top: 72.62599990127791,  left: 34.54180269656928, w: 6.641056659430953, h: 8.132850398328099, delay: 2.10 },
              { top: 60.93172991552784,  left: 77.85524217046331, w: 6.81712903776541,  h: 8.525928217637388, delay: 2.80 },
            ].map((v, i) => {
              const dur = 3.5 + (i % 3) * 0.6;
              return (
                <div key={`v${i}`} className="absolute pointer-events-none"
                  style={{
                    top: `${v.top}%`, left: `${v.left}%`,
                    width: `${v.w}%`, height: `${v.h}%`,
                    mixBlendMode: 'screen',
                  }}>
                  {[0, 1, 2].map(j => (
                    <div key={j} style={{
                      position: 'absolute', inset: 0,
                      background: 'radial-gradient(ellipse at 50% 85%, rgba(220,230,240,0.45), rgba(220,230,240,0) 70%)',
                      animation: `nightVapor ${dur}s linear ${v.delay - j * (dur / 3)}s infinite`,
                    }} />
                  ))}
                </div>
              );
            })}

            {/* Distant skyline twinkles — tiny dots */}
            {Array.from({ length: 14 }).map((_, i) => {
              const top = 1 + (i * 13 % 6);
              const left = 5 + (i * 17 % 90);
              const dur = 2.5 + (i % 5) * 0.6;
              const delay = (i * 0.37) % 3;
              return (
                <div key={`s${i}`} className="absolute"
                  style={{
                    top: `${top}%`, left: `${left}%`,
                    width: '2px', height: '2px',
                    background: '#fef3c7',
                    boxShadow: '0 0 4px 2px rgba(254,243,199,0.7)',
                    animation: `nightTwinkle ${dur}s ease-in-out ${delay}s infinite`,
                    mixBlendMode: 'screen',
                  }} />
              );
            })}
            <style>{`
              @keyframes nightWindow {
                0%, 100% { opacity: 0.55; transform: scale(1); }
                17% { opacity: 0.62; }
                19% { opacity: 0.42; }
                21% { opacity: 0.64; }
                50% { opacity: 0.85; transform: scale(1.05); }
                67% { opacity: 0.72; }
                69% { opacity: 0.52; }
                71% { opacity: 0.78; }
              }
              @keyframes nightNeon {
                0%, 6%, 10%, 100% { opacity: 1; }
                4%, 8% { opacity: 0.35; }
                50% { opacity: 0.85; }
                52% { opacity: 0.4; }
                54% { opacity: 0.85; }
              }
              @keyframes nightNeonHalo {
                0%, 100% { opacity: 0.7; }
                11% { opacity: 0.55; }
                13% { opacity: 0.82; }
                50% { opacity: 1; }
                63% { opacity: 0.7; }
                65% { opacity: 0.9; }
              }
              @keyframes nightShop {
                0%, 100% { opacity: 0.85; }
                14% { opacity: 0.7; }
                16% { opacity: 0.92; }
                50% { opacity: 1; }
                66% { opacity: 0.78; }
                68% { opacity: 0.95; }
              }
              @keyframes nightLamp {
                0%, 100% { opacity: 0.7; }
                16% { opacity: 0.55; }
                18% { opacity: 0.82; }
                50% { opacity: 1; }
                68% { opacity: 0.65; }
                70% { opacity: 0.88; }
              }
              @keyframes nightTwinkle {
                0%, 100% { opacity: 0.2; transform: scale(0.8); }
                20% { opacity: 0.5; }
                22% { opacity: 0.15; }
                50% { opacity: 1; transform: scale(1.2); }
                72% { opacity: 0.55; }
                74% { opacity: 0.18; }
              }
              /* Vapor: rises from the bottom of its box, expanding and
                 fading. Plateau in the middle 70% of the cycle so
                 stacked staggered puffs blend without a visible
                 "born / die" line. */
              @keyframes nightVapor {
                0%   { opacity: 0;    transform: translateY(20%)  scale(0.5); }
                15%  { opacity: 0.55; }
                85%  { opacity: 0.5;  }
                100% { opacity: 0;    transform: translateY(-50%) scale(1.6); }
              }
            `}</style>
          </div>
        )}

        {hotspots.map(h => (
          <button key={h.id}
            onClick={() => { if (!h.locked) go(h.id); }}
            disabled={h.locked}
            aria-label={h.name}
            title={h.locked ? h.lockReason : `${h.name} · ${h.desc}`}
            className={`absolute transition-all ${
              h.locked
                ? 'opacity-60 cursor-not-allowed'
                : 'hover:scale-[1.02] active:scale-95'
            }`}
            style={{
              top: `${h.top}%`,
              left: `${h.left}%`,
              width: `${h.width}%`,
              height: `${h.height}%`,
              background: h.locked ? 'rgba(0,0,0,0.35)' : 'transparent',
              border: 'none',
              boxShadow: 'none',
            }}>
            <div
              className={`absolute left-1/2 -translate-x-1/2 px-1.5 py-0.5 text-[10px] uppercase tracking-widest whitespace-nowrap ${
                h.locked ? 'bg-stone-950/90 text-stone-400 border border-stone-800'
                         : 'bg-amber-500 text-stone-950 font-bold'
              }`}
              style={{
                fontFamily: '"Bebas Neue", "Oswald", sans-serif',
                bottom: '4px',
              }}>
              {h.locked ? '🔒 ' : ''}{h.name}
            </div>
          </button>
        ))}

        {/* A friendly tabby strolls through the park region on every
            mount of the hood map. Path is driven by the CAT_PATH array
            (waypoints in % of the map); the keyframe stops are
            distributed by arc length so the cat walks at constant
            pixel-speed regardless of segment length. Tune in
            tools/cat-path-editor.html and paste the array back here. */}
        <div className="absolute pointer-events-none"
          aria-hidden="true"
          style={{
            width: '6.5%',
            aspectRatio: '74 / 64',
            backgroundImage: 'url(cat-walk.png)',
            backgroundRepeat: 'no-repeat',
            backgroundSize: '400% 100%',
            imageRendering: 'pixelated',
            // Anchor by the paws (center-bottom) so the CAT_PATH coords
            // describe where the feet land, matching the editor preview.
            // Without this transform the cat's TOP-LEFT sits on the path
            // and renders ~one cat-height too low.
            transform: 'translate(-50%, -100%)',
            // Tie leg cycles to the walk duration so the legs stop the
            // moment the cat reaches the path's end (otherwise the cat
            // sits off-screen forever bobbing its legs).
            animation: `catLegs 0.5s steps(4, jump-none) ${Math.max(1, Math.round(CAT_DUR / 0.5))} forwards, catHoodWalk ${CAT_DUR}s linear forwards`,
            zIndex: 3,
          }} />

        {/* Stationary park characters — each is a sprite-sheet that
            cycles in place. Anchored center-bottom so { x, y } points
            at the character's feet. Hidden at night since the park
            hotspot is locked then (and the painted scene is empty). */}
        {isDay && CHARACTERS.map(c => (
          <div key={c.id}
            className="absolute pointer-events-none"
            aria-hidden="true"
            style={{
              left: `${c.x}%`,
              top: `${c.y}%`,
              width: `${c.width}%`,
              aspectRatio: c.aspect,
              backgroundImage: `url(${c.sheet})`,
              backgroundRepeat: 'no-repeat',
              backgroundSize: `${c.frames * 100}% 100%`,
              imageRendering: 'pixelated',
              transform: 'translate(-50%, -100%)',
              animation: `charStep_${c.id} ${c.loop}s steps(${c.frames}, jump-none) infinite`,
              zIndex: 2,
            }} />
        ))}
        <style>{`
          @keyframes catLegs {
            from { background-position: 0% 0; }
            to   { background-position: 100% 0; }
          }
          ${catKeyframeCss}
          ${CHARACTERS.map(c => `
            @keyframes charStep_${c.id} {
              from { background-position: 0% 0; }
              to   { background-position: 100% 0; }
            }
          `).join('\n')}
        `}</style>
      </div>

      {hotspots.some(h => h.locked) && (
        <div className="text-[10px] uppercase tracking-wider text-stone-500 px-2 space-y-0.5">
          {hotspots.filter(h => h.locked && h.lockReason).map(h => (
            <div key={h.id}>🔒 <span className="text-stone-400">{h.name}</span> · {h.lockReason}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Livestream panel: go live for X minutes, earn $/fans by stats + viewers ----
// ============ CREW PANEL ============
// Recruit beatboxers from CREW_NPCS as your followers grow. Each crew
// member adds a small daily cash + fan trickle (paid out in the morning
// sleep transition). One-time recruitCost in cash, no upkeep.
function CrewPanel({ char, setChar, showToast }) {
  const recruited = Array.isArray(char.crew) ? char.crew : [];
  const recruit = (npc) => {
    if (crewIsRecruited(char, npc.id)) return;
    if ((char.followers || 0) < npc.recruitMinFans) {
      showToast?.(`${npc.name} needs ${npc.recruitMinFans} fans first`, 'bad');
      return;
    }
    if ((char.cash || 0) < npc.recruitCost) {
      showToast?.(`Need $${npc.recruitCost} to recruit ${npc.name}`, 'bad');
      return;
    }
    setChar(c => ({
      ...c,
      cash: (c.cash || 0) - npc.recruitCost,
      crew: [
        ...(Array.isArray(c.crew) ? c.crew : []),
        { id: npc.id, joinedDay: c.day || 1, lifetimeCash: 0, lifetimeFans: 0 },
      ],
    }));
    showToast?.(`👥 ${npc.name} joined the crew`, 'win');
  };
  return (
    <Panel title={`Crew · ${recruited.length}/${CREW_NPCS.length}`}>
      <div className="space-y-2">
        {CREW_NPCS.map(npc => {
          const isIn = crewIsRecruited(char, npc.id);
          const member = recruited.find(m => m.id === npc.id);
          const available = crewIsAvailable(char, npc);
          const broke = (char.cash || 0) < npc.recruitCost;
          return (
            <div key={npc.id}
              className={`p-2 border-2 ${isIn ? 'border-amber-500/50 bg-amber-500/5' : available ? 'border-stone-700 bg-stone-900/40' : 'border-stone-800 bg-stone-950/40 opacity-60'}`}>
              <div className="flex items-center gap-3">
                {/* Tiny pixel avatar */}
                <div className="w-8 h-8 flex items-center justify-center" style={{
                  background: npc.look.shirt, border: '2px solid', borderColor: npc.look.hair,
                }}>
                  <div style={{ width: 14, height: 14, background: npc.look.skin, borderRadius: 2 }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="text-stone-100 text-sm tracking-wider"
                      style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
                      {npc.name}
                    </div>
                    {isIn && (
                      <span className="text-[9px] uppercase tracking-widest text-amber-500">CREW</span>
                    )}
                  </div>
                  <div className="text-[10px] text-stone-500 leading-snug">{npc.blurb}</div>
                  <div className="text-[9px] uppercase tracking-widest mt-0.5">
                    {isIn ? (
                      <span className="text-amber-400">
                        +${npc.dailyCash}/day · +{npc.dailyFans} fan{npc.dailyFans === 1 ? '' : 's'}/day
                        <span className="text-stone-600"> · lifetime ${member?.lifetimeCash || 0} / {member?.lifetimeFans || 0} fans</span>
                      </span>
                    ) : !available ? (
                      <span className="text-stone-600">🔒 unlock at {npc.recruitMinFans} fans</span>
                    ) : (
                      <span className="text-stone-500">
                        +${npc.dailyCash}/day · +{npc.dailyFans} fans/day
                      </span>
                    )}
                  </div>
                </div>
                {!isIn && available && (
                  <button onClick={() => recruit(npc)} disabled={broke}
                    className={`px-2 py-1 text-[10px] uppercase tracking-widest border ${
                      broke ? 'border-stone-800 text-stone-700 cursor-not-allowed'
                            : 'border-amber-500 text-amber-500 hover:bg-amber-500/10'
                    }`}>
                    ${npc.recruitCost}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {recruited.length > 0 && (() => {
          const totalDailyCash = recruited.reduce((a, m) => a + ((CREW_NPCS.find(x => x.id === m.id)?.dailyCash) || 0), 0);
          const totalDailyFans = recruited.reduce((a, m) => a + ((CREW_NPCS.find(x => x.id === m.id)?.dailyFans) || 0), 0);
          return (
            <div className="text-[10px] uppercase tracking-widest text-stone-500 text-center pt-1 border-t border-stone-800">
              Crew yield: +${totalDailyCash}/day · +{totalDailyFans} fan{totalDailyFans === 1 ? '' : 's'}/day
            </div>
          );
        })()}
      </div>
    </Panel>
  );
}

// ============ SONGS LIBRARY ============
// Lets the player "release" any of their MPC sequencer slots as a named
// song. Released songs trickle fans for ~7 days (decaying daily). Gives
// the sequencer a payoff beyond just training Originality and adds a soft
// idle layer to the loop. Actual fan accrual happens in the morning sleep
// transition — this panel is the UI for releasing + browsing.
const SONG_DECAY = [0.32, 0.24, 0.18, 0.12, 0.08, 0.04, 0.02]; // 7-day fade

function SongsLibrary({ char, setChar, showToast }) {
  const [drafting, setDrafting] = useState(false);
  const [pickSlotIdx, setPickSlotIdx] = useState(char.oriSlotIdx || 0);
  const [name, setName] = useState('');
  const slots = Array.isArray(char.oriSlots) ? char.oriSlots : [];
  const songs = Array.isArray(char.songs) ? char.songs : [];
  const today = char.day || 1;

  const countCells = (slot) => {
    if (!slot || !Array.isArray(slot.tracks)) return 0;
    return slot.tracks.reduce((acc, t) => acc + (t?.cells?.filter(Boolean).length || 0), 0);
  };

  const release = () => {
    const slot = slots[pickSlotIdx];
    if (!slot) return;
    const cells = countCells(slot);
    if (cells < 4) {
      showToast?.('Pattern is too sparse — at least 4 hits to release', 'bad');
      return;
    }
    const finalName = (name.trim() || slot.name || `Track ${(songs.length || 0) + 1}`).slice(0, 28);
    setChar(c => ({
      ...c,
      songs: [
        ...(Array.isArray(c.songs) ? c.songs : []),
        {
          id: `song_${Date.now()}`,
          name: finalName,
          releasedDay: c.day || 1,
          activeCells: cells,
          lifetimeFans: 0,
        },
      ],
    }));
    showToast?.(`🎵 Released "${finalName}" — earnings start tomorrow`, 'win');
    setDrafting(false);
    setName('');
  };

  return (
    <Panel title={`Songs · ${songs.length}`}>
      {!drafting && (
        <button onClick={() => { setPickSlotIdx(char.oriSlotIdx || 0); setDrafting(true); }}
          className="w-full p-2 mb-2 border-2 border-amber-500/40 bg-amber-500/5 text-amber-400 text-[11px] uppercase tracking-widest hover:bg-amber-500/10">
          🎙 Release a new song
        </button>
      )}

      {drafting && (
        <div className="space-y-2 mb-2 p-2 border-2 border-amber-500/40 bg-amber-500/5">
          <div className="text-[10px] uppercase tracking-widest text-amber-400">Pick a pattern</div>
          <div className="grid grid-cols-2 gap-1">
            {slots.map((s, i) => {
              const cells = countCells(s);
              const selected = pickSlotIdx === i;
              return (
                <button key={i} onClick={() => { setPickSlotIdx(i); if (!name) setName(s?.name || ''); }}
                  className={`p-1.5 border-2 text-left text-[10px] transition-all ${selected
                    ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                    : 'border-stone-800 bg-stone-900/40 text-stone-300 hover:border-stone-700'}`}>
                  <div className="uppercase tracking-widest font-bold truncate">{s?.name || `Slot ${i + 1}`}</div>
                  <div className="text-stone-500">{cells} hits</div>
                </button>
              );
            })}
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={slots[pickSlotIdx]?.name || 'Song name'}
            maxLength={28}
            className="w-full px-2 py-1.5 bg-stone-950 border-2 border-stone-800 text-stone-200 text-xs focus:border-amber-500/50 outline-none uppercase tracking-wider"
          />
          <div className="flex gap-1">
            <button onClick={() => { setDrafting(false); setName(''); }}
              className="flex-1 py-1.5 border-2 border-stone-800 text-stone-500 text-[10px] uppercase tracking-widest hover:border-stone-600">
              Cancel
            </button>
            <button onClick={release}
              className="flex-1 py-1.5 border-2 border-amber-500 bg-amber-500/15 text-amber-400 text-[10px] uppercase tracking-widest hover:bg-amber-500/25">
              🎵 Release
            </button>
          </div>
        </div>
      )}

      {songs.length === 0 && !drafting && (
        <div className="text-[10px] uppercase tracking-widest text-stone-500 text-center py-2">
          No songs released yet · Build a beat in the MPC, then come release it here
        </div>
      )}

      {songs.length > 0 && (
        <div className="space-y-1">
          {[...songs].reverse().map((s) => {
            const age = today - (s.releasedDay || 0);
            const earningDays = SONG_DECAY.length;
            const remaining = Math.max(0, earningDays - age);
            const isEarning = remaining > 0;
            return (
              <div key={s.id}
                className={`p-2 border-2 ${isEarning ? 'border-amber-500/40 bg-amber-500/5' : 'border-stone-800 bg-stone-900/40 opacity-70'}`}>
                <div className="flex items-center justify-between">
                  <div className="text-stone-200 text-xs tracking-wider truncate"
                    style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
                    🎵 {s.name}
                  </div>
                  <div className="text-[9px] uppercase tracking-widest text-stone-500">
                    {isEarning ? `${remaining}d left` : 'archived'}
                  </div>
                </div>
                <div className="text-[10px] text-stone-500 uppercase tracking-wider">
                  Released day {s.releasedDay} · {s.activeCells} hits · +{s.lifetimeFans || 0} fans earned
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// Unlocked at 20 followers (small audience needed). Once-per-day cooldown.
// Tier-2/3 apartment buffs your viewer ceiling and reward.
function LivestreamPanel({ char, setChar, showToast, checkLevelUp }) {
  const minFollowers = 20;
  const locked = (char.followers || 0) < minFollowers;
  const lastDay = char.lastStreamDay || 0;
  const onCooldown = lastDay === char.day;
  const tier = char.apartmentTier || 1;
  const energyCost = 15;
  const canStream = !locked && !onCooldown && (char.energy || 0) >= energyCost;
  const goLive = () => {
    if (!canStream) return;
    setChar(c => {
      const stats = c.stats || {};
      const skill = (stats.mus || 0) + (stats.tec || 0) + (stats.ori || 0) + (stats.sho || 0);
      const fanCap = Math.max(8, Math.floor((c.followers || 0) * 0.15));
      const tierBoost = tier === 3 ? 1.4 : tier === 2 ? 1.2 : 1.0;
      const skillFactor = Math.min(1.5, 0.5 + skill / 80);
      const viewers = Math.floor((10 + Math.random() * fanCap) * skillFactor * tierBoost);
      const tipDollars = Math.floor(viewers * (0.3 + Math.random() * 0.4));
      const fanGain = Math.floor(viewers / 6);
      const t = passMinutes(c, 60);
      return checkLevelUp({
        ...c, ...t,
        cash: c.cash + tipDollars,
        followers: c.followers + fanGain,
        energy: Math.max(0, c.energy - energyCost),
        mood: Math.min(100, t.mood + 4),
        xp: c.xp + 6,
        heat: (c.heat || 0) + 2,
        lastStreamDay: c.day,
        lastStreamViewers: viewers,
      });
    });
    showToast('Stream done — check the panel for tonight\'s numbers', 'win');
  };
  const lastViewers = char.lastStreamViewers || 0;
  return (
    <Panel title="Livestream">
      <div className="space-y-2">
        {locked ? (
          <div className="text-[10px] text-stone-500 uppercase tracking-wider">
            🔒 Need {minFollowers} followers to go live
          </div>
        ) : (
          <>
            <div className="text-[10px] text-stone-400 leading-relaxed">
              60 min · –{energyCost}⚡ · viewers and tips scale with skill, fans, and apartment tier.
            </div>
            {lastViewers > 0 && (
              <div className="text-[10px] text-stone-500 uppercase tracking-wider">
                last stream · {lastViewers} viewers
              </div>
            )}
            <Btn variant="primary" onClick={goLive} disabled={!canStream} className="w-full py-3">
              {onCooldown ? 'STREAMED TODAY' : (char.energy || 0) < energyCost ? 'TOO TIRED' : '🔴 GO LIVE — 60 min'}
            </Btn>
          </>
        )}
      </div>
    </Panel>
  );
}

// ---- BeeAmGee mentor: studio coaching panel ----
// $50/session, 3-day cooldown, +1 stat (player picks). Drips backstory lines.
const BJARNE_LINES = {
  1: "first time i battled was '92. lost ugly. cried in the bathroom. came back the next week.",
  2: "every kid who comes through here thinks they invented the bass kick.",
  3: "made it to the world finals once. three times, actually. never won.",
  4: "your tongue knows more than your brain. trust it.",
  5: "it's not the win. it's that you fought for it. nobody remembers second place except second place.",
  6: "i had a daughter. she'd be your age now.",
  7: "she didn't beatbox. she liked the violin. fancy that.",
  8: "you can hear when somebody's afraid of the mic. you can hear when they're not. that's the only difference.",
  9: "there's no secret. there's just hours. and somebody who'll sit in the room with you while you do them.",
  10: "don't end up like me, kid. find someone to come home to.",
};
const _bjarneLineFor = (n) => BJARNE_LINES[n] || "keep working. show me next week.";

function BjarneCoachingPanel({ char, setChar, showToast, playCutscene, checkLevelUp }) {
  const sessions = char.bjarneSessions || 0;
  const cooldownLeft = Math.max(0, 3 - (char.day - (char.lastBjarneDay || 0)));
  const onCooldown = cooldownLeft > 0 && (char.lastBjarneDay || 0) > 0;
  const canAfford = (char.cash || 0) >= 50;
  const canTrain = !onCooldown && canAfford && (char.energy || 0) >= 10;
  const train = (stat) => {
    if (!canTrain) return;
    const nextSessions = sessions + 1;
    setChar(c => {
      const t = passMinutes(c, 90); // 90-min studio session
      return checkLevelUp({
        ...c, ...t,
        cash: c.cash - 50,
        energy: Math.max(0, c.energy - 10),
        mood: Math.min(100, t.mood + 4),
        xp: c.xp + 10,
        stats: { ...(c.stats || {}), [stat]: (c.stats?.[stat] || 0) + 1 },
        bjarneSessions: nextSessions,
        lastBjarneDay: c.day,
      });
    });
    const statName = { mus: 'Musicality', tec: 'Technicality', ori: 'Originality', sho: 'Showmanship' }[stat];
    showToast(`Trained with BeeAmGee · +1 ${statName}`, 'win');
    playCutscene?.({
      speaker: 'BEEAMGEE',
      speakerColor: '#a3a3a3',
      beats: [{
        drawScene: (ctx, fc) => drawBjarneStudioScene(ctx, fc, lookFromChar(char)),
        lines: [
          _bjarneLineFor(nextSessions),
          'You run drills until your jaw aches. He nods, twice.',
          '"that\'s enough for today. same time next week."',
        ],
      }],
    });
  };
  return (
    <Panel title="BeeAmGee — Studio Coaching">
      <div className="space-y-3">
        <div className="text-[11px] text-stone-400 leading-relaxed">
          The old man taught half the city. He'll work with you for $50 a session.
          {sessions > 0 && <span className="block mt-1 text-stone-500">Sessions completed: {sessions}</span>}
        </div>
        {onCooldown ? (
          <div className="text-[10px] text-amber-500 uppercase tracking-wider text-center">
            Resting · {cooldownLeft} day{cooldownLeft === 1 ? '' : 's'} until next session
          </div>
        ) : (
          <>
            <div className="text-[10px] text-stone-500 uppercase tracking-wider">
              Pick a focus · 90 min · –10⚡ · –$50 · +1 stat
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[['mus','Musicality'],['tec','Technicality'],['ori','Originality'],['sho','Showmanship']].map(([id, label]) => (
                <Btn key={id} onClick={() => train(id)} disabled={!canTrain}>
                  {label}
                </Btn>
              ))}
            </div>
            {!canAfford && <div className="text-[10px] text-rose-500 uppercase tracking-wider text-center">Need $50</div>}
            {(char.energy || 0) < 10 && <div className="text-[10px] text-rose-500 uppercase tracking-wider text-center">Too tired</div>}
          </>
        )}
      </div>
    </Panel>
  );
}

// ============ SCREEN: HOUSE ============

function HouseScreen({ char, setChar, passTime, showToast, checkLevelUp, go, activeSlot, playCutscene }) {
  const [tab, setTab] = useState(null);  // null = no modal open, just the map
  const [trainStat, setTrainStat] = useState(null); // 'mus' | 'tec' | 'ori' | 'sho' | null
  const [pendingStart, setPendingStart] = useState(false);
  const [playMode, setPlayMode] = useState(false); // false = AFK, true = pitch tuner mini-game (mus only)
  const [tecInputMode, setTecInputMode] = useState('tap'); // 'tap' | 'mic' for Beatbox Hero
  const [tunerMode, setTunerMode] = useState('beginner'); // 'beginner' (do-re-mi) | 'advanced' (full triads)
  const [showRangePicker, setShowRangePicker] = useState(false); // shown when user wants to set/change voice range

  const charRef = useRef(char);
  useEffect(() => { charRef.current = char; }, [char]);

  // Latest reported tuner accuracy (0..1) — applied as bonus to musicality reward
  const accuracyRef = useRef(0);
  const handleAccuracy = (acc) => { accuracyRef.current = acc; };

  // Foxy's safety-net food — when you walk into the house with no cash and
  // no hunger, Foxy puts a bowl on the counter once per in-game week.
  // (cap: cash < 5 AND hunger == 0 AND ≥ 7 days since the last time.)
  useEffect(() => {
    if (!char) return;
    const cooled = (char.day - (char.lastFoxySafetyNetDay || 0)) >= 7
                || (char.lastFoxySafetyNetDay || 0) === 0;
    if (!cooled) return;
    if ((char.cash || 0) >= 5) return;
    if ((char.hunger || 0) > 0) return;
    // Trigger once
    const isFirst = !char.storyFlags?.foxyFirstSafetyNet;
    setChar(c => {
      let next = {
        ...c,
        hunger: Math.max(c.hunger || 0, 40),
        mood: Math.min(100, (c.mood || 0) + 5),
        lastFoxySafetyNetDay: c.day,
        storyFlags: { ...(c.storyFlags || {}), foxyFirstSafetyNet: true },
      };
      // Foxy follows up with a soft text the next time you check your phone.
      next = addMessage(next, 'foxy', _pick(FOXY_QUIPS));
      return next;
    });
    // Show the cutscene (only big the first time; later ones are silent + toast)
    if (isFirst) {
      setTimeout(() => playCutscene?.({
        speaker: 'FOXY',
        speakerColor: '#84cc16',
        beats: [{
          drawScene: (ctx, fc) => drawFoxySoupScene(ctx, fc, lookFromChar(char)),
          lines: [
            "i made too much.",
            "eat.",
          ],
        }],
      }, 'foxyFirstSafetyNet'), 50);
    } else {
      showToast('Foxy left soup on the counter (+40 hunger)', 'win');
    }
  }, [char?.day, char?.cash, char?.hunger, char?.lastFoxySafetyNetDay]);

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
      // While the player is actively engaged in a mini-game (BeatboxHero,
      // sequencer, pitch tuner) we cut the energy drain hard so a single
      // session lasts long enough to actually enjoy. AFK training stays at
      // full rate so passive grind still feels intentional.
      tickEnergyCost: playMode ? tCfg.tickEnergyCost * 0.3 : tCfg.tickEnergyCost,
      tickHungerCost: playMode ? 0.5 : 1,
      tickMoodDelta: playMode ? -0.15 : -0.3,
      // In playMode: slower real-time pulse AND each tick advances fewer in-
      // game minutes, so the in-game day doesn't end mid-bar either.
      // AFK training is unchanged.
      tickRealMs: playMode ? 2500 : undefined,
      tickMinutes: playMode ? 3 : undefined,
      onReward: () => {
        if (!trainStat) return;
        // For musicality (tuner) and technicality (Beatbox Hero), accuracy gives bonus stat gain.
        let statGain = 1;
        let bonusText = '';
        const cRef = charRef.current;
        if (trainStat === 'mus') {
          const acc = accuracyRef.current || 0;
          if (acc >= 0.8) { statGain = 3; bonusText = ' (perfect pitch!)'; }
          else if (acc >= 0.5) { statGain = 2; bonusText = ' (+1 bonus)'; }
        } else if (trainStat === 'tec') {
          // AFK drilling = baseline +1. Play-mode reward is tied to accuracy:
          // watching demo or whiffing every note earns 0; locked-in play earns +3.
          if (!playMode) {
            statGain = 1;
          } else {
            const acc = accuracyRef.current || 0;
            if (acc <= 0)        { statGain = 0; }
            else if (acc >= 0.8) { statGain = 3; bonusText = ' (locked in!)'; }
            else if (acc >= 0.5) { statGain = 2; bonusText = ' (+1 bonus)'; }
            else                 { statGain = 1; }
          }
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
          // Sequencer creativity score → bonus.
          // Studio monitors give a +25% boost so thresholds get cleared more easily.
          let cv = accuracyRef.current || 0;
          if (hasGear(cRef, 'studio_monitors')) cv = cv * 1.25;
          if (cv >= 0.8)      { statGain = 3; bonusText = ' (creative!)'; }
          else if (cv >= 0.5) { statGain = 2; bonusText = ' (+1 bonus)'; }
          if (hasGear(cRef, 'studio_monitors')) bonusText += ' · 🎚️';
        }
        // Gear multipliers on top of the base gain:
        //  - PC boosts Tec & Ori by 25%
        //  - Mic boosts Mus by 25%
        // Festival prep: doubles all training gains until the festival.
        if (statGain > 0) {
          let gearMult = 1;
          if ((trainStat === 'tec' || trainStat === 'ori') && hasGear(cRef, 'pc'))  gearMult *= 1.25;
          if (trainStat === 'mus' && hasGear(cRef, 'mic')) gearMult *= 1.25;
          if (cRef?.festivalState === 'prepping') gearMult *= 2;
          if (gearMult > 1) {
            const before = statGain;
            statGain = Math.round(statGain * gearMult);
            if (statGain > before) bonusText += cRef?.festivalState === 'prepping' ? ' · 🌟 prep' : ' · 🎛️';
          }
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

  // Escape key closes the tab modal (unless an activity is mid-tick;
  // matches the hotspot button's disabled-while-active behaviour).
  useEffect(() => {
    if (!tab) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !trainActivity.active) setTab(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab, trainActivity.active]);

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
    setChar(c => {
      const t = passMinutes(c, 5); // eating takes 5 min
      return {
        ...c,
        ...t,
        cash: c.cash - f.cost,
        energy: Math.max(0, Math.min(c.maxEnergy ?? 100, c.energy + f.energy)),
        hunger: _clampPct(c.hunger + f.hunger),
        mood:   _clampPct(t.mood + f.mood),
        storyFlags: { ...(c.storyFlags || {}), firstAte: true },
      };
    });
    showToast(`${f.kind === 'drink' ? 'Drank' : 'Ate'} ${f.name}`, 'win');
  };

  // Home espresso (Coffee Machine gear) — once per in-game day.
  const drinkHomeCoffee = () => {
    if (!hasGear(char, 'coffee_machine')) return;
    if (char.day === char.lastCoffeeDay) return;
    setChar(c => {
      const t = passMinutes(c, 5);
      return { ...c, ...t,
        energy: Math.max(0, Math.min(c.maxEnergy ?? 100, c.energy + 25)),
        hunger: Math.max(0, c.hunger - 15),
        mood:   _clampPct(t.mood + 2),
        lastCoffeeDay: c.day };
    });
    showToast('Home espresso · +25⚡ -15🍴 +2♥', 'win');
  };

  // Couch downtime — small mood pickup, no cost beyond time. No cooldown
  // (the time cost is the limiter). 30 min · +10 mood · -3 energy.
  const watchTv = () => {
    if ((char.energy || 0) < 3) { showToast('Too tired to focus', 'bad'); return; }
    setChar(c => {
      const t = passMinutes(c, 30);
      return { ...c, ...t,
        mood: _clampPct(t.mood + 10),
        energy: Math.max(0, c.energy - 3),
        hunger: Math.max(0, c.hunger - 4) };
    });
    showToast('Watched TV · +10 mood', 'win');
  };
  // Play games — slightly bigger mood + small ori bump. 45 min · +14 mood · -5 energy.
  const playGames = () => {
    if ((char.energy || 0) < 5) { showToast('Too tired to focus', 'bad'); return; }
    setChar(c => {
      const t = passMinutes(c, 45);
      return { ...c, ...t,
        mood: _clampPct(t.mood + 14),
        energy: Math.max(0, c.energy - 5),
        hunger: Math.max(0, c.hunger - 6),
        stats: { ...c.stats, ori: (c.stats?.ori || 0) + (Math.random() < 0.40 ? 1 : 0) } };
    });
    showToast('Played a few rounds · +14 mood', 'win');
  };

  // Yoga Mat meditation — daily +5 mood, 10 game min.
  const meditate = () => {
    if (!hasGear(char, 'yoga_mat')) return;
    if (char.day === char.lastYogaDay) return;
    setChar(c => {
      const t = passMinutes(c, 10);
      return { ...c, ...t,
        mood: _clampPct(t.mood + 5),
        lastYogaDay: c.day };
    });
    showToast('Meditated. +5 mood', 'win');
  };

  // Water the houseplant — costs $5, resets the 5-day timer. Max 3 waterings
  // per day; the 4th drowns the plant.
  const waterPlant = () => {
    if (!hasGear(char, 'houseplant')) return;
    if (char.plantDead) { showToast('The plant is dead. Buy a new one.', 'bad'); return; }
    if ((char.cash || 0) < 5) { showToast("Need $5 for water can refill", 'bad'); return; }
    const sameDay = char.plantWaterCountDay === char.day;
    const count = sameDay ? (char.plantWaterCount || 0) : 0;
    if (count >= 3) {
      // Already at the daily cap → this watering drowns the plant.
      setChar(c => ({ ...c,
        cash: c.cash - 5,
        plantDead: true,
        plantDeathDay: c.day,
        plantWaterCount: 4,
        plantWaterCountDay: c.day,
      }));
      showToast('You overwatered it. The plant drowned. 🥀 Replacement next Tuesday.', 'bad');
      setTimeout(() => playCutscene?.({
        speaker: 'the houseplant',
        speakerColor: '#a08030',
        beats: [{
          drawScene: (ctx, fc) => drawPlantDrownScene(ctx, fc, lookFromChar(char)),
          lines: [
            "blub. blub. ...blub.",
            "(it tipped over slow, like it knew.)",
            "Nursery only restocks plants on Tuesdays.",
          ],
        }],
      }), 200);
      return;
    }
    setChar(c => ({ ...c,
      cash: c.cash - 5,
      lastPlantWaterDay: c.day,
      plantWaterCount: count + 1,
      plantWaterCountDay: c.day,
    }));
    showToast(`Watered the plant (${count + 1}/3 today). +mood every morning while alive.`, 'win');
  };

  // Foxy Soup — free meal Foxy makes daily, claimable once per in-game day.
  // Modest stats, but keeps you from starving when broke.
  const eatFoxySoup = () => {
    if (char.day === char.lastFoxySoupDay) return;       // already had today's
    setChar(c => {
      const t = passMinutes(c, 5);
      return {
        ...c,
        ...t,
        energy: Math.max(0, Math.min(c.maxEnergy ?? 100, c.energy + 10)),
        hunger: _clampPct(c.hunger + 30),
        mood:   _clampPct(t.mood + 2),
        lastFoxySoupDay: c.day,
        storyFlags: { ...(c.storyFlags || {}), firstAte: true },
      };
    });
    showToast('Ate Foxy Soup. +30🍴 +10⚡ +2♥', 'win');
  };

  // Foxy's $15 loan — one-time only, when you're really broke. Comes with
  // a parental lecture-text afterward telling you to busk.
  const takeFoxyLoan = () => {
    if (char.foxyLoanTaken) return;
    if (char.cash >= 5) return;                          // only when broke
    setChar(c => {
      let next = {
        ...c,
        cash: (c.cash || 0) + 15,
        foxyLoanTaken: true,
        mood: Math.min(100, (c.mood || 0) + 3),
      };
      next = addMessage(next, 'foxy', "this is a one-time thing. go busk in the park. seriously.");
      return next;
    });
    showToast('Foxy lent you $15. Go busk.', 'win');
  };

  const [sleeping, setSleeping] = useState(false);
  const [napping, setNapping] = useState(false);
  const sleep = () => {
    if ((char.hunger ?? 0) <= 0) {
      showToast('Too hungry to sleep — eat something first!', 'bad');
      return;
    }
    setSleeping(true);
  };
  const moveToApt = (targetTier) => {
    const upgrade = APT_UPGRADES[targetTier];
    if (!upgrade) return;
    if ((char.cash || 0) < upgrade.cost) { showToast(`Need $${upgrade.cost}`, 'bad'); return; }
    if ((char.day || 0) < upgrade.dayReq) { showToast(`Wait until day ${upgrade.dayReq}`, 'bad'); return; }
    if ((char.followers || 0) < upgrade.fansReq) { showToast(`Need ${upgrade.fansReq} fans`, 'bad'); return; }
    setChar(c => ({
      ...c,
      cash: c.cash - upgrade.cost,
      apartmentTier: targetTier,
      apartmentMovedInDay: c.day,
      mood: Math.min(100, (c.mood || 0) + 15),
    }));
    showToast(`Moved in · -$${upgrade.cost}`, 'win');
    const draw = targetTier === 2 ? drawApt2Scene : drawApt3Scene;
    const lines2 = [
      "You sign the lease. Hand over the deposit. The keys feel light.",
      "It's small. But it's yours. With a real bedroom and a window.",
      "You sit on the floor for a minute, just listening. The traffic. Somebody laughing in the hall.",
      "This is what it sounds like to be doing okay.",
    ];
    const lines3 = [
      "The freight elevator groans up to the top floor.",
      "Concrete. Brick. Skyline through twelve feet of glass.",
      "You set the mixing desk up by the window. Plug in the monitors. Press play.",
      "It rings. The whole loft rings. Your loft.",
      "You earned this.",
    ];
    setTimeout(() => playCutscene?.({
      speaker: null,
      beats: [{
        drawScene: (ctx, fc) => draw(ctx, fc, lookFromChar(char)),
        lines: targetTier === 3 ? lines3 : lines2,
      }],
    }, `apt${targetTier}MovedIn`), 50);
  };
  const startNap = () => {
    if ((char.hunger ?? 0) <= 0) {
      showToast('Too hungry to nap — eat something first!', 'bad');
      return;
    }
    setNapping(true);
  };
  const finishNap = (finalMinutes, forced) => {
    setChar(c => {
      const slept = Math.max(0, finalMinutes - (c.minutes ?? 0));
      const hours = slept / 60;
      const max = c.maxEnergy ?? 100;
      return {
        ...c,
        minutes: Math.round(Math.min(1200, finalMinutes)),
        energy: Math.round(Math.max(0, Math.min(max, c.energy + Math.floor(hours * 12)))),
        hunger: Math.round(Math.max(0, c.hunger - Math.floor(hours * 3))),
        mood:   Math.round(_clampPct(c.mood + Math.floor(hours * 2))),
      };
    });
    setNapping(false);
    showToast(forced ? '2 AM — got booted off the couch' : 'Napped — feeling sharper', forced ? 'info' : 'win');
  };
  const finishSleep = () => {
    try { return _finishSleepImpl(); }
    catch (e) {
      // Surface ANY synchronous throw inside the sleep transition as a
      // visible red banner instead of silently unmounting to a black page.
      try {
        window.dispatchEvent(new ErrorEvent('error', {
          message: `finishSleep threw: ${e?.message || e}`,
          error: e,
        }));
      } catch {}
      setSleeping(false);
      showToast(`Sleep failed: ${String(e?.message || e).slice(0, 120)}`, 'bad');
    }
  };
  const _finishSleepImpl = () => {
    const c0 = char;
    if (!c0) { setSleeping(false); return; }
    // Pre-compute the morning song/crew yield from c0 BEFORE the setChar
    // updater, so the values are also available for the wake-up toasts
    // without round-tripping through ephemeral char fields (which were
    // leaking into the saved JSON).
    const _nextDayProbe = (c0.day || 0) + 1;
    const SONG_DECAY = [0.32, 0.24, 0.18, 0.12, 0.08, 0.04, 0.02];
    let _songFans = 0;
    let _updatedSongs = c0.songs;
    if (Array.isArray(c0.songs) && c0.songs.length) {
      const ts = (c0.stats?.mus || 0) + (c0.stats?.tec || 0) + (c0.stats?.ori || 0) + (c0.stats?.sho || 0);
      _updatedSongs = c0.songs.map(s => {
        const ageDays = _nextDayProbe - (s.releasedDay || 0);
        if (ageDays <= 0 || ageDays > SONG_DECAY.length) return s;
        const decay = SONG_DECAY[ageDays - 1];
        const pool = Math.max(5, Math.floor(ts / 4 + (s.activeCells || 0) * 1.5));
        const earned = Math.max(0, Math.round(pool * decay));
        _songFans += earned;
        return { ...s, lifetimeFans: (s.lifetimeFans || 0) + earned };
      });
    }
    let _crewCash = 0, _crewFans = 0;
    let _updatedCrew = c0.crew;
    if (Array.isArray(c0.crew) && c0.crew.length) {
      _updatedCrew = c0.crew.map(m => {
        const npc = CREW_NPCS.find(x => x.id === m.id);
        if (!npc) return m;
        const cash = npc.dailyCash || 0;
        const fans = npc.dailyFans || 0;
        _crewCash += cash;
        _crewFans += fans;
        return {
          ...m,
          lifetimeCash: (m.lifetimeCash || 0) + cash,
          lifetimeFans: (m.lifetimeFans || 0) + fans,
        };
      });
    }
    const newDayBase = c0.day + 1;
    const rentEvent = computeRentEvent(c0, newDayBase);
    // Eviction adds 3 couch-surf days on top of the normal +1
    const dayAdvance = rentEvent?.type === 'evicted' ? 1 + COUCHSURF_DAYS : 1;
    const newDay = c0.day + dayAdvance;

    // ---- Random event roll ----
    // ~30% chance overnight that something quietly happens. Picked from a
    // weighted pool gated by current state.
    let randomEvent = null;
    if (rentEvent?.type !== 'evicted' && Math.random() < 0.30) {
      randomEvent = pickRandomEvent({ ...c0, day: newDay });
    }

    // ---- Bad-sleep roll ----
    // ~10% chance of a rough night. Picks the most state-relevant reason
    // (so a battle is on, you'll lie awake about the battle; rent is late,
    // you'll lie awake about that). Falls back to a random ambient one.
    let badSleep = null;
    if (Math.random() < 0.10 && rentEvent?.type !== 'evicted') {
      const sourcePool = FILTERED_BAD_SLEEP(c0);     // earplugs strip noisy/heating
      const eligible = sourcePool.filter(r => !r.when || r.when(c0, newDay));
      const stateReasons = eligible.filter(r => r.when);
      const ambient = eligible.filter(r => !r.when);
      const pool = stateReasons.length && Math.random() < 0.6 ? stateReasons : (eligible.length ? eligible : ambient);
      badSleep = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    }

    setChar(c => {
      try {
      const max = c.maxEnergy ?? 100;
      // Memory-foam bed gives +20 max-energy worth of boost overnight
      const bedBonus = hasGear(c, 'new_bed') ? 20 : 0;
      let energy = Math.min(max, max + bedBonus);
      let hunger = Math.max(0, c.hunger - 30);
      let mood = Math.min(100, c.mood + 10);
      // Apply bad-sleep penalties (energy not full + mood hit)
      if (badSleep) {
        energy = Math.floor(max * (badSleep.energyCap ?? 0.7));
        mood = Math.max(0, mood - 10);
      }
      // Houseplant: +1 mood per morning if it's still alive
      if (plantAlive(c)) mood = Math.min(100, mood + 1);
      // Apartment tier bonuses — tier 2: +5 mood, tier 3: +10 mood + 1 mus
      const aptTier = c.apartmentTier || 1;
      let extraMusFromHome = 0;
      if (aptTier === 2) mood = Math.min(100, mood + 5);
      if (aptTier === 3) { mood = Math.min(100, mood + 10); extraMusFromHome = 1; }
      // Declared up here so the cat block below (which writes to `cash`)
      // doesn't hit a temporal-dead-zone error. The cat-gear save state in
      // particular was producing a silent setChar throw → black screen.
      let cash = c.cash;
      let rentLate = c.rentLate || 0;
      let lastRentPaidDay = c.lastRentPaidDay;
      // Cat: +2 mood / morning, costs $3/day in food (only if you can afford it)
      if (hasGear(c, 'cat') && (c.cash || 0) >= 3) {
        mood = Math.min(100, mood + 2);
        cash = Math.max(0, (c.cash || 0) - 3);
      }
      // Camera + Tripod: passive +1 follower per day from auto-posted clips
      let extraFollowers = hasGear(c, 'camera_tripod') ? 1 : 0;
      const flags = { ...(c.storyFlags || {}) };
      // Apply rent event (recomputed against `c`, the live state)
      if (rentEvent) {
        if (rentEvent.type === 'paid') {
          cash = Math.max(0, (c.cash || 0) - rentEvent.amount);
          rentLate = 0;
          lastRentPaidDay = newDayBase;
          flags.firstRentPaid = true;
        } else if (rentEvent.type === 'missed') {
          rentLate = 1;
          mood = Math.max(0, mood - 10);
        } else if (rentEvent.type === 'warning') {
          rentLate = 2;
          mood = Math.max(0, mood - 15);
        } else if (rentEvent.type === 'evicted') {
          // Couch surf debuffs: half energy, hunger drained, big mood hit.
          energy = Math.floor(max * 0.5);
          hunger = Math.max(0, hunger - 20);
          mood = Math.max(0, mood - 30);
          rentLate = 0;
          flags.evictedOnce = true;
        }
      }
      const d = c.pendingDebuff;
      if (d) {
        energy = Math.max(0, Math.min(max, energy + (d.energy || 0)));
        hunger = _clampPct(hunger + (d.hunger || 0));
        mood = _clampPct(mood + (d.mood || 0));
      }
      let next = { ...c, energy, hunger, mood, cash,
        rentLate, lastRentPaidDay,
        day: newDay, minutes: 0, pendingDebuff: null,
        storyFlags: flags,
        stats: { ...(c.stats || {}), mus: (c.stats?.mus || 0) + extraMusFromHome },
        followers: (c.followers || 0) + extraFollowers };
      // Apply random event effects inline so the morning state reflects them
      if (randomEvent) next = applyRandomEvent(next, randomEvent);
      // Reset daily counters + pick a new daily challenge
      next.daily = {};
      const newChallenge = pickDailyChallenge(newDay % 7, next);
      next.dailyChallenge = newChallenge ? { id: newChallenge.id, claimed: false } : null;
      // Apply pre-computed song + crew yields (computed from c0 above).
      next.songs = _updatedSongs;
      next.crew  = _updatedCrew;
      if (_songFans > 0) next.followers = (next.followers || 0) + _songFans;
      if (_crewCash > 0) next.cash      = (next.cash || 0) + _crewCash;
      if (_crewFans > 0) next.followers = (next.followers || 0) + _crewFans;
      // Old builds leaked these onto saved chars — strip them defensively.
      delete next._morningSongFans;
      delete next._morningCrewYield;
      // Weekly: reset on Monday-morning rollover (newDay % 7 === 0). Also
      // kickstart immediately for slots that don't have one yet so the
      // player isn't waiting until next Monday.
      const startOfWeek = (newDay % 7) === 0;
      if (startOfWeek || !next.weeklyChallenge) {
        next.weekly = {};
        const newWeekly = pickWeeklyChallenge();
        next.weeklyChallenge = newWeekly ? { id: newWeekly.id, claimed: false } : null;
      }
      // Parent message triggers (cooldown ≥3 days between parent texts)
      const cd = newDay - (next.lastParentMsgDay || 0);
      if (cd >= 3) {
        let reason = null;
        if (rentEvent?.type === 'paid'    && Math.random() < 0.45) reason = 'rentPaid';
        else if ((rentEvent?.type === 'missed' || rentEvent?.type === 'warning') && Math.random() < 0.75) reason = 'rentMissed';
        else if ((next.hunger || 0) < 30  && Math.random() < 0.50) reason = 'hungerLow';
        else if (newDay % 7 === 6         && Math.random() < 0.30) reason = 'random';
        if (reason) {
          next = addMessage(next, 'parents', _pick(PARENT_MESSAGES[reason]));
          next.lastParentMsgDay = newDay;
        }
      }
      // Anonymous internet messages — small daily roll. Followers > 0 →
      // some chance of a fan or a hater pinging in.
      if ((next.followers || 0) > 0) {
        if (Math.random() < 0.05) next = addMessage(next, 'unknown', _pick(UNKNOWN_MESSAGES_FAN));
        if (Math.random() < 0.04) next = addMessage(next, 'unknown', _pick(UNKNOWN_MESSAGES_HATE));
      }
      // Festival invite — when eligible, Rohzel sends the message that hooks
      // the late-game arc. Only fires once.
      if (festivalEligible(next) && !next.storyFlags?.festivalInviteSent) {
        next = addMessage(next, 'rohzel', "festival people called.\nthey want you.\nsit down. let's talk.");
        next.storyFlags = { ...(next.storyFlags || {}), festivalInviteSent: true };
        next.festivalState = 'invited';
      }
      return next;
      } catch (e) {
        // setChar updater errors happen inside React's batch; the outer
        // try/catch around finishSleep wouldn't catch them. Surface via the
        // GlobalErrorOverlay so we can see what threw, and return the
        // unmodified char so the user isn't stuck.
        try {
          window.dispatchEvent(new ErrorEvent('error', {
            message: `morning setChar updater threw: ${e?.message || e}`,
            error: e,
          }));
        } catch {}
        return c;
      }
    });
    setSleeping(false);

    // Bad-sleep narrative toast (skipped during eviction since that has
    // its own cutscene chain).
    if (badSleep && rentEvent?.type !== 'evicted') {
      setTimeout(() => showToast(`Bad sleep · ${badSleep.line}`, 'bad'), 100);
    }

    // Random event — small cutscene only on the rent-paid / clean path.
    if (randomEvent && rentEvent?.type !== 'evicted') {
      setTimeout(() => playCutscene({
        speaker: randomEvent.title,
        speakerColor: randomEvent.color || '#D4A017',
        beats: [{ lines: randomEvent.lines }],
      }), 200);
    }

    // Flashback — late-game one-shot reflection. ~25% chance per sleep when
    // an unseen flashback is eligible, fires once each.
    if (rentEvent?.type !== 'evicted' && Math.random() < 0.25) {
      const fb = pickFlashback({ ...c0, day: newDay });
      if (fb) {
        setChar(cc => ({ ...cc, flashbacksSeen: { ...(cc.flashbacksSeen || {}), [fb.id]: newDay } }));
        const draw = _flashbackDrawFn(fb.drawFn);
        setTimeout(() => playCutscene({
          speaker: fb.speaker || null,
          beats: [{
            drawScene: draw ? (ctx, fc) => draw(ctx, fc, lookFromChar(c0)) : undefined,
            lines: fb.lines,
          }],
        }), 320);
      }
    }

    // Dream sequence — late-game (day 30+). Small ~5% chance per sleep.
    if (rentEvent?.type !== 'evicted' && (newDay >= 30) && Math.random() < 0.05) {
      setTimeout(() => playCutscene({
        speaker: null,
        beats: [{
          drawScene: (ctx, fc) => drawDreamScene(ctx, fc, lookFromChar(c0)),
          lines: [
            "You're on a stage that goes forever in every direction.",
            "Faces in the crowd you don't recognize. They know your name.",
            "The mic in your hand is too heavy. Then weightless.",
            "You wake before the round ends.",
          ],
        }],
      }), 400);
    }

    // Toast + queued cutscene based on the rent event
    if (rentEvent?.type === 'paid') {
      showToast(`Rent paid · -$${rentEvent.amount}`, 'info');
      // First-time rent: show a quick celebratory beat
      if (rentEvent.firstTime) {
        setTimeout(() => playCutscene({
          beats: [{
            drawScene: drawRentPaidScene,
            lines: [
              "Sunday. Rent's paid.",
              `-$${rentEvent.amount}. The apartment's still yours.`,
              "Another week to make it work.",
            ],
          }],
        }, 'firstRentPaid'), 50);
      }
    } else if (rentEvent?.type === 'missed') {
      showToast(`Rent late · week 1. Mood -10`, 'bad');
      setTimeout(() => playCutscene({
        beats: [{
          drawScene: drawRentMissedScene,
          lines: [
            "You didn't make rent this week.",
            "The notice is taped to your door.",
            "You've got till next Sunday.",
          ],
        }],
      }), 50);
    } else if (rentEvent?.type === 'warning') {
      showToast(`Rent late · final warning. Mood -15`, 'bad');
      setTimeout(() => playCutscene({
        beats: [{
          drawScene: drawEvictionWarningScene,
          lines: [
            "Final warning, in red ink.",
            "Pay by Sunday or you're out.",
            "Your phone hasn't stopped buzzing.",
          ],
        }],
      }), 50);
    } else if (rentEvent?.type === 'evicted') {
      showToast(`Evicted. Couch-surfing for ${COUCHSURF_DAYS} days.`, 'bad');
      setTimeout(() => playCutscene({
        beats: [
          { drawScene: drawEvictedScene, lines: [
            "Boards on the door.",
            "Your stuff in two cardboard boxes.",
            "Nowhere to go but Foxy's friend's couch.",
          ]},
          { drawScene: (ctx, fc) => drawCouchSurfScene(ctx, fc, lookFromChar(char)), lines: [
            `${COUCHSURF_DAYS} nights on a stranger's couch.`,
            "You don't sleep much.",
            "The plant's probably dead by now.",
          ]},
          { drawScene: drawBackOnFeetScene, lines: [
            "A new key. A fresh start.",
            "Rent counter back to zero.",
            "Don't miss it again.",
          ]},
        ],
      }), 50);
    } else {
      showToast(char.pendingDebuff ? 'Slept it off — feeling rough' : 'Slept till morning', char.pendingDebuff ? 'info' : 'win');
    }
    // Wake-up toasts using the precomputed yields (no ephemeral char fields).
    if (_songFans > 0) {
      setTimeout(() => showToast(`🎵 Your songs earned +${_songFans} new fan${_songFans === 1 ? '' : 's'}`, 'win'), 500);
    }
    if (_crewCash > 0 || _crewFans > 0) {
      const parts = [];
      if (_crewCash > 0) parts.push(`+$${_crewCash}`);
      if (_crewFans > 0) parts.push(`+${_crewFans} fan${_crewFans === 1 ? '' : 's'}`);
      setTimeout(() => showToast(`👥 Crew brought in ${parts.join(' / ')}`, 'win'), 800);
    }
  };
  // ALL HOOKS MUST RUN BEFORE THE EARLY RETURNS BELOW.
  // Foxy modal open state.
  const [foxyOpen, setFoxyOpen] = useState(false);
  // Foxy's tip is recomputed whenever any of her trigger inputs changes
  // (hunger/energy/mood bins, day, story flags, etc). Stable between
  // unrelated renders so it doesn't flicker on every keystroke.
  const foxyTipKey = [
    char?.day,
    Math.floor((char?.energy || 0) / 25),
    Math.floor((char?.hunger || 0) / 25),
    Math.floor((char?.mood || 0) / 25),
    char?.rentLate || 0,
    Math.floor((char?.cash || 0) / 25),
    Math.floor((char?.followers || 0) / 10),
    char?.openMicCount || 0,
    char?.showcaseBooking?.day || 0,
    char?.storyFlags?.firstJam ? 1 : 0,
    char?.storyFlags?.jamCount || 0,
    char?.storyFlags?.pigPenChallenged ? 1 : 0,
    char?.storyFlags?.pigPenBattled ? 1 : 0,
    char?.storyFlags?.pigPenWins || 0,
    char?.storyFlags?.pennyReveal ? 1 : 0,
    char?.storyFlags?.rohzelFridayOffer ? 1 : 0,
    tab,
  ].join(':');
  const foxyTipRef = useRef('');
  const foxyTipKeyRef = useRef('');
  if (foxyTipKeyRef.current !== foxyTipKey) {
    foxyTipRef.current = pickFoxyTip(char);
    foxyTipKeyRef.current = foxyTipKey;
  }
  const foxyTip = foxyTipRef.current;

  if (sleeping) return <SleepAnimation char={char} onComplete={finishSleep} />;
  if (napping)  return <PowerNapAnimation char={char} onWake={finishNap} />;

  return (
    <div className="space-y-3">
      <div className="text-center mb-2">
        <div className="text-2xl tracking-widest text-stone-300" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>THE HOUSE</div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Your home base</div>
      </div>

      {/* Onboarding quest checklist — first-week goals, derived from existing
          state. Disappears once all 6 are checked OR after day 7. */}
      {(() => {
        const f = char.storyFlags || {};
        const items = [
          { key: 'busk',    label: 'Busk in the park',          done: !!f.firstBusk,                              hint: '🎤 Park · Busk' },
          { key: 'eat',     label: 'Eat from the kitchen',      done: !!f.firstAte || !!f.foxyFirstSafetyNet,     hint: '🍽 House · Kitchen' },
          { key: 'sleep',   label: 'Sleep till morning',        done: (char.day || 1) > 1,                        hint: '🛋 House · Couch' },
          { key: 'jam',     label: 'Jam with the cypher',       done: !!f.firstJam,                               hint: '🎶 Park · Jam' },
          { key: 'openmic', label: 'Play your first open mic',  done: (char.openMicCount || 0) >= 1,              hint: '🎙 Bar · Tue/Wed/Thu' },
          { key: 'shop',    label: 'Buy your first gear/sound', done: Object.keys(char.gear || {}).length >= 1, hint: '🛒 City · Shop' },
        ];
        const doneCount = items.filter(x => x.done).length;
        const allDone = doneCount === items.length;
        // Hide once all done & at least 1 day has passed since completion;
        // also hide outright after day 7 to keep the panel out of veterans'
        // way even if they skipped a step.
        const hideAfterDay = 7;
        if (allDone && (char.day || 1) > 2) return null;
        if ((char.day || 1) > hideAfterDay) return null;
        return (
          <div className="border-2 border-stone-700 bg-gradient-to-br from-amber-950/30 to-stone-900/40 px-3 py-2">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] uppercase tracking-[0.3em] text-amber-400" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
                FIRST WEEK · {doneCount}/{items.length}
              </div>
              <div className="text-[9px] uppercase tracking-widest text-stone-500">
                {allDone ? '✓ tutorial complete' : 'getting started'}
              </div>
            </div>
            <div className="space-y-0.5">
              {items.map(x => (
                <div key={x.key} className="flex items-center gap-2 text-[11px]">
                  <span className={`inline-block w-3 text-center ${x.done ? 'text-amber-400' : 'text-stone-600'}`}>
                    {x.done ? '✓' : '☐'}
                  </span>
                  <span className={`flex-1 ${x.done ? 'text-stone-500 line-through' : 'text-stone-200'}`}>
                    {x.label}
                  </span>
                  {!x.done && (
                    <span className="text-[9px] uppercase tracking-widest text-stone-600">{x.hint}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Foxy roommate panel — tap to open a small interaction modal. */}
      <button onClick={() => setFoxyOpen(true)}
        className="w-full border-2 border-stone-800 bg-stone-900/30 hover:border-lime-500/50 px-3 py-2 flex items-start gap-3 text-left transition-all">
        <div className="border border-stone-800 flex-shrink-0">
          <FoxyAvatar size={36} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="text-[9px] uppercase tracking-[0.3em] text-lime-500" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
              FOXY · roommate
            </div>
            <span className="text-[9px] uppercase tracking-widest text-stone-600">tap →</span>
          </div>
          <div className="text-stone-300 text-xs italic leading-snug whitespace-normal break-words">
            "{foxyTip}"
          </div>
        </div>
      </button>
      {foxyOpen && <FoxyModal char={char} setChar={setChar} showToast={showToast} onClose={() => setFoxyOpen(false)} />}

      {/* Daily challenge HUD */}
      {(() => {
        const dc = char.dailyChallenge;
        if (!dc) return null;
        const def = DAILY_CHALLENGES.find(x => x.id === dc.id);
        if (!def) return null;
        const progress = char.daily?.[def.counter] || 0;
        const met = progress >= def.target;
        const claimed = dc.claimed;
        const claim = () => {
          if (!met || claimed) return;
          setChar(c => {
            const r = def.reward || {};
            return {
              ...c,
              cash: (c.cash || 0) + (r.cash || 0),
              followers: (c.followers || 0) + (r.followers || 0),
              mood: _clampPct((c.mood || 0) + (r.mood || 0)),
              dailyChallenge: { ...c.dailyChallenge, claimed: true },
            };
          });
          showToast?.(`Daily: +${def.reward?.cash ? `$${def.reward.cash}` : ''}${def.reward?.mood ? ` +${def.reward.mood}♥` : ''}${def.reward?.followers ? ` +${def.reward.followers} fans` : ''}`, 'win');
        };
        return (
          <div className={`border-2 px-3 py-2 ${met && !claimed ? 'border-amber-500 bg-amber-500/5' : claimed ? 'border-stone-800 bg-stone-900/40 opacity-70' : 'border-stone-800 bg-stone-900/30'}`}>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[9px] uppercase tracking-[0.3em] text-amber-500" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
                DAILY CHALLENGE
              </div>
              <div className="text-[9px] uppercase tracking-widest text-stone-600">
                {progress}/{def.target}{claimed ? ' · claimed' : ''}
              </div>
            </div>
            <div className="text-stone-300 text-xs">{def.label}</div>
            <div className="flex items-center justify-between mt-1">
              <div className="text-[9px] uppercase tracking-widest text-stone-500">
                Reward: {def.reward?.cash ? `$${def.reward.cash}` : ''}{def.reward?.mood ? ` +${def.reward.mood}♥` : ''}{def.reward?.followers ? ` +${def.reward.followers} fans` : ''}
              </div>
              <button onClick={claim} disabled={!met || claimed}
                className={`px-2 py-1 text-[9px] uppercase tracking-widest border ${
                  met && !claimed ? 'border-amber-500 text-amber-500 hover:bg-amber-500/10'
                                  : 'border-stone-800 text-stone-700 cursor-not-allowed'
                }`}>
                {claimed ? 'CLAIMED' : met ? 'CLAIM →' : 'IN PROGRESS'}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Weekly challenge HUD — bigger goal, bigger reward, persists across days */}
      {(() => {
        const wc = char.weeklyChallenge;
        if (!wc) return null;
        const def = WEEKLY_CHALLENGES.find(x => x.id === wc.id);
        if (!def) return null;
        const progress = char.weekly?.[def.counter] || 0;
        const met = progress >= def.target;
        const claimed = wc.claimed;
        const dow = (char.day || 1) % 7;
        const daysToMonday = dow === 0 ? 7 : (7 - dow);
        const claim = () => {
          if (!met || claimed) return;
          setChar(c => {
            const r = def.reward || {};
            return {
              ...c,
              cash: (c.cash || 0) + (r.cash || 0),
              followers: (c.followers || 0) + (r.followers || 0),
              mood: _clampPct((c.mood || 0) + (r.mood || 0)),
              weeklyChallenge: { ...c.weeklyChallenge, claimed: true },
            };
          });
          showToast?.(`Weekly: +${def.reward?.cash ? `$${def.reward.cash}` : ''}${def.reward?.mood ? ` +${def.reward.mood}♥` : ''}${def.reward?.followers ? ` +${def.reward.followers} fans` : ''}`, 'win');
        };
        return (
          <div className={`border-2 px-3 py-2 ${met && !claimed ? 'border-fuchsia-500 bg-fuchsia-500/5' : claimed ? 'border-stone-800 bg-stone-900/40 opacity-70' : 'border-stone-800 bg-stone-900/30'}`}>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[9px] uppercase tracking-[0.3em] text-fuchsia-400" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
                WEEKLY CHALLENGE
              </div>
              <div className="text-[9px] uppercase tracking-widest text-stone-600">
                {progress}/{def.target}{claimed ? ' · claimed' : ` · ${daysToMonday}d left`}
              </div>
            </div>
            <div className="text-stone-300 text-xs">{def.label}</div>
            <div className="flex items-center justify-between mt-1">
              <div className="text-[9px] uppercase tracking-widest text-stone-500">
                Reward: {def.reward?.cash ? `$${def.reward.cash}` : ''}{def.reward?.mood ? ` +${def.reward.mood}♥` : ''}{def.reward?.followers ? ` +${def.reward.followers} fans` : ''}
              </div>
              <button onClick={claim} disabled={!met || claimed}
                className={`px-2 py-1 text-[9px] uppercase tracking-widest border ${
                  met && !claimed ? 'border-fuchsia-500 text-fuchsia-400 hover:bg-fuchsia-500/10'
                                  : 'border-stone-800 text-stone-700 cursor-not-allowed'
                }`}>
                {claimed ? 'CLAIMED' : met ? 'CLAIM →' : 'IN PROGRESS'}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Apartment map — clickable hotspots for each activity area.
          Day / night swaps the painted background based on game time.
          Tune positions in tools/hotspot-editor.html (use the Map
          dropdown to switch from hood to apartment). */}
      {(() => {
        const isDay = isDayTime(char.minutes ?? 0);
        const houseHotspots = [
          { id: 'train',    name: 'PC',       top: 4.06,  left: 9.07,  width: 38.53, height: 29.77, icon: 'pc' },
          { id: 'studio',   name: 'Studio',   top: 3.46,  left: 52.27, width: 42.67, height: 29.87, icon: 'mic' },
          { id: 'eat',      name: 'Kitchen',  top: 35.37, left: 59.07, width: 37.6,  height: 28.44, icon: 'fridge' },
          { id: 'wardrobe', name: 'Wardrobe', top: 35.67, left: 3.6,   width: 51.87, height: 22.67, icon: 'star' },
          { id: 'rest',     name: 'Couch',    top: 68.27, left: 41.47, width: 50.93, height: 22.9,  icon: 'couch' },
        ];
        return (
          <div className="relative w-full max-w-md mx-auto border-2 border-stone-800 select-none overflow-hidden"
            style={{ aspectRatio: '480 / 854', background: '#0c0a09' }}>
            <img src={isDay ? 'house-day.png' : 'house-night.png'}
              alt="The apartment"
              className="absolute inset-0 w-full h-full block pointer-events-none"
              style={{ imageRendering: 'pixelated' }} />

            {/* Apartment atmosphere — subtle, ambient. Sits between the
                painted map and the hotspot labels (pointer-events:none
                so taps fall through to the buttons below). */}
            <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
              {isDay && (
                /* Warm sun-shaft from the bedroom window. Sits over the
                   painted blinds and breathes slowly. */
                <div className="absolute" style={{
                  top: '4%', left: '4%', width: '30%', height: '22%',
                  background: 'radial-gradient(ellipse at 30% 20%, rgba(255,220,150,0.35), rgba(255,220,150,0) 65%)',
                  animation: 'houseSun 8s ease-in-out infinite',
                  mixBlendMode: 'screen',
                }} />
              )}

              {/* PC monitor glow — cyan, flickers subtly. Slightly
                  brighter at night. */}
              <div className="absolute" style={{
                top: '17%', left: '22%', width: '10%', height: '6%',
                background: 'radial-gradient(ellipse at center, rgba(150,210,255,0.55), rgba(150,210,255,0) 75%)',
                animation: 'houseMonitor 1.6s ease-in-out infinite',
                opacity: isDay ? 0.55 : 1,
                mixBlendMode: 'screen',
              }} />

              {/* Studio rec light — small red dot, only visible at
                  night so it doesn't fight the daylight scene. */}
              {!isDay && (
                <div className="absolute" style={{
                  top: '20%', left: '85%', width: '4%', height: '3%',
                  background: 'radial-gradient(circle at center, rgba(255,80,80,0.9), rgba(255,80,80,0) 70%)',
                  animation: 'houseRecLight 2.4s ease-in-out infinite',
                  mixBlendMode: 'screen',
                }} />
              )}

              {/* Kitchen ceiling light — warm cone. Always on. */}
              <div className="absolute" style={{
                top: '34%', left: '54%', width: '40%', height: '16%',
                background: 'radial-gradient(ellipse at 50% 0%, rgba(255,205,120,0.35), rgba(255,205,120,0) 75%)',
                animation: 'houseKitchen 5s ease-in-out infinite',
                mixBlendMode: 'screen',
              }} />

              {/* TV glow — blue, irregular flicker. Cranked up at
                  night so the living-room feels lived-in. */}
              <div className="absolute" style={{
                top: '64%', left: '4%', width: '14%', height: '10%',
                background: 'radial-gradient(ellipse at center, rgba(120,180,255,0.6), rgba(120,180,255,0) 75%)',
                animation: 'houseTv 1.2s steps(6) infinite',
                opacity: isDay ? 0.4 : 1,
                mixBlendMode: 'screen',
              }} />
              <style>{`
                @keyframes houseSun {
                  0%, 100% { opacity: 0.85; }
                  50%      { opacity: 1; }
                }
                @keyframes houseMonitor {
                  0%, 100% { opacity: 0.85; }
                  40%      { opacity: 1; }
                  42%      { opacity: 0.55; }
                  44%      { opacity: 1; }
                  60%      { opacity: 0.95; }
                }
                @keyframes houseRecLight {
                  0%, 100% { opacity: 0.8; }
                  50%      { opacity: 0.4; }
                }
                @keyframes houseKitchen {
                  0%, 100% { opacity: 0.85; }
                  50%      { opacity: 1; }
                }
                @keyframes houseTv {
                  0%   { opacity: 0.6; }
                  16%  { opacity: 0.95; }
                  33%  { opacity: 0.7; }
                  50%  { opacity: 1; }
                  66%  { opacity: 0.75; }
                  83%  { opacity: 0.9; }
                  100% { opacity: 0.6; }
                }
              `}</style>
            </div>
            {houseHotspots.map(h => (
              <button key={h.id}
                onClick={() => setTab(h.id)}
                disabled={trainActivity.active}
                aria-label={h.name}
                title={h.name}
                className={`absolute transition-all ${
                  trainActivity.active ? 'opacity-30 cursor-not-allowed'
                                       : 'hover:scale-[1.02] active:scale-95'
                }`}
                style={{
                  top: `${h.top}%`,
                  left: `${h.left}%`,
                  width: `${h.width}%`,
                  height: `${h.height}%`,
                  background: 'transparent',
                  border: 'none',
                  boxShadow: 'none',
                }}>
                <div
                  className={`absolute left-1/2 -translate-x-1/2 px-1.5 py-0.5 text-[10px] uppercase tracking-widest whitespace-nowrap flex items-center gap-1 ${
                    tab === h.id ? 'bg-amber-500 text-stone-950 font-bold'
                                 : 'bg-stone-950/80 text-stone-200 border border-stone-700'
                  }`}
                  style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif', bottom: '4px' }}>
                  <PixelIcon name={h.icon} size={12} />
                  <span>{h.name}</span>
                </div>
              </button>
            ))}
          </div>
        );
      })()}

      {/* Tab content as a modal popup over the apartment map. Tapping
          a hotspot opens it; tap the backdrop, the × button, or Escape
          to close. Locked open while an activity is active (matches
          the hotspot button's disabled state — you finish/stop the
          activity first, then you can leave the room). */}
      {tab && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
          onClick={() => { if (!trainActivity.active) setTab(null); }}
          aria-modal="true" role="dialog">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-stone-950 border-2 border-amber-500/40 w-full max-w-md max-h-[92vh] sm:max-h-[88vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 bg-stone-950 border-b-2 border-stone-800 px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-500 tracking-widest uppercase text-sm"
                style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
                <PixelIcon name={tab === 'train' ? 'pc' : tab === 'studio' ? 'mic' : tab === 'eat' ? 'fridge' : tab === 'wardrobe' ? 'star' : 'couch'} size={16} />
                <span>{tab === 'train' ? 'PC / Train' : tab === 'studio' ? 'Studio' : tab === 'eat' ? 'Kitchen' : tab === 'wardrobe' ? 'Wardrobe' : 'Couch'}</span>
              </div>
              <button onClick={() => setTab(null)}
                disabled={trainActivity.active}
                className="text-stone-400 hover:text-amber-500 disabled:opacity-30 disabled:cursor-not-allowed text-2xl leading-none w-8 h-8 flex items-center justify-center"
                aria-label="Close">×</button>
            </div>
            <div className="p-3 space-y-3">

      {tab === 'train' && (
        <>
          {!trainActivity.active && (() => {
            // Precheck: training needs enough headroom for several ticks. Block
            // entry up front with a clear message instead of starting and
            // bouncing the player out one tick later.
            const blockReason = (cost) => {
              if ((char.sickDay || 0) === char.day) return 'Too sick to train';
              if ((char.energy || 0) < cost * 3)    return 'Too tired';
              if ((char.hunger || 0) < 15)          return 'Too hungry';
              if ((char.mood || 0) < 15)            return 'Too grumpy';
              return null;
            };
            const blockHint = (cost) => {
              if ((char.sickDay || 0) === char.day) return 'Rest until tomorrow';
              if ((char.energy || 0) < cost * 3)    return 'Power nap on the couch';
              if ((char.hunger || 0) < 15)          return 'Eat in the kitchen';
              if ((char.mood || 0) < 15)            return 'Watch TV or take a walk';
              return null;
            };
            return (
              <Panel title="Tap a stat to start training">
                <div className="space-y-2">
                  {Object.entries(trainConfig).map(([key, t]) => {
                    const iconName = key === 'mus' ? 'music' : key === 'tec' ? 'zap' : key === 'ori' ? 'sparkle' : 'crown';
                    const reason = blockReason(t.tickEnergyCost);
                    const hint = blockHint(t.tickEnergyCost);
                    return (
                      <button key={key}
                        onClick={() => {
                          if (reason) { showToast(`${reason} · ${hint}`, 'bad'); return; }
                          setTrainStat(key); setPendingStart(true);
                        }}
                        title={reason ? `${reason} — ${hint}` : ''}
                        className={`w-full flex items-center gap-3 p-2 border-2 transition-all ${
                          reason
                            ? 'border-rose-900/60 bg-rose-950/20 cursor-not-allowed'
                            : 'border-stone-800 bg-stone-900/30 hover:border-amber-500'
                        }`}>
                        <div className={reason ? 'opacity-40' : ''}>
                          <PixelIcon name={iconName} size={28} />
                        </div>
                        <div className="flex-1 text-left">
                          <div className={`text-sm ${reason ? 'text-stone-500' : 'text-stone-200'}`}>
                            {t.name} <span className="text-stone-600 text-xs">· {char.stats[key]}</span>
                          </div>
                          <div className="text-[10px] text-stone-500 uppercase">{t.desc}</div>
                        </div>
                        <div className="text-right">
                          {reason ? (
                            <>
                              <div className="text-rose-400 text-xs uppercase tracking-wider">🔒 {reason}</div>
                              <div className="text-[10px] text-stone-500 uppercase">{hint}</div>
                            </>
                          ) : (
                            <>
                              <div className="text-amber-500 text-xs">START ▶</div>
                              <div className="text-[10px] text-stone-500">-{t.tickEnergyCost}⚡/tick</div>
                            </>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Panel>
            );
          })()}

          {trainActivity.active && trainStat && (
            <Panel title={`Training ${trainConfig[trainStat].name} — IN PROGRESS`}>
              <div className="space-y-3">
                {/* Pixel-art scene for the AFK training visual.
                    Hidden during the active mini-game (playMode), since that
                    has its own UI. Shown for sho regardless (no mini-game). */}
                {(!playMode || trainStat === 'sho') && (() => {
                  const lookFn = lookFromChar(char);
                  const sceneFn =
                    trainStat === 'mus' ? drawMusicalityScene  :
                    trainStat === 'tec' ? drawTechnicalityScene :
                    trainStat === 'ori' ? drawOriginalityScene  :
                                          drawShowmanshipScene;
                  return <PixelScene draw={(ctx, fc) => sceneFn(ctx, fc, lookFn)} />;
                })()}
                {trainStat === 'mus' && !playMode && !showRangePicker && (
                  <div className="space-y-2">
                    {/* Mode picker — pick the warm-up before starting the tuner */}
                    <div className="grid grid-cols-3 gap-2">
                      {Object.entries(TUNER_MODES).map(([key, m]) => {
                        const selected = tunerMode === key;
                        return (
                          <button key={key} onClick={() => setTunerMode(key)}
                            className={`p-2 border-2 transition-all text-left ${selected
                              ? 'border-amber-500 bg-amber-500/15'
                              : 'border-stone-800 bg-stone-900/40 hover:border-stone-700'}`}>
                            <div className={`text-xs uppercase tracking-wider ${selected ? 'text-amber-500' : 'text-stone-300'}`}
                              style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
                              {m.label}
                            </div>
                            <div className="text-[10px] text-stone-500 uppercase tracking-wider">{m.tag}</div>
                          </button>
                        );
                      })}
                    </div>
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
                            {tunerMode === 'beginner' && 'Full triads · echo each note one at a time'}
                            {tunerMode === 'advanced' && 'Do-re-mi · listen to all 3, then sing all 3 back'}
                            {tunerMode === 'karaoke'  && '5-note melody · listen, then sing the whole phrase back'}
                          </div>
                        </div>
                        <div className="text-amber-500 text-xl group-hover:translate-x-1 transition-transform">▶</div>
                      </div>
                    </button>
                  </div>
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
                      mode={tunerMode}
                    />
                    {/* Inline mode toggle — flip Beginner/Advanced without leaving */}
                    <div className="grid grid-cols-3 gap-1">
                      {Object.entries(TUNER_MODES).map(([key, m]) => {
                        const selected = tunerMode === key;
                        return (
                          <button key={key} onClick={() => setTunerMode(key)}
                            className={`py-1.5 border-2 text-[10px] uppercase tracking-widest transition-all ${selected
                              ? 'border-amber-500 bg-amber-500/15 text-amber-500'
                              : 'border-stone-800 bg-stone-900/40 text-stone-400 hover:border-stone-700'}`}>
                            {m.label} · {m.tag}
                          </button>
                        );
                      })}
                    </div>
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
                        accuracyBoost={(hasGear(char, 'premium_headphones') ? 1.25 : 1) * (hasGear(char, 'mic') ? 1.15 : 1)}
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
                      slotCount={hasGear(char, 'mpc') ? SEQ_SLOTS_MPC : SEQ_SLOTS}
                      ownedSounds={char.sounds || []}
                      onPatternChange={(p) => setChar(c => {
                        const target = hasGear(c, 'mpc') ? SEQ_SLOTS_MPC : SEQ_SLOTS;
                        let slots;
                        if (Array.isArray(c.oriSlots) && c.oriSlots.length === target) {
                          slots = [...c.oriSlots];
                        } else {
                          slots = _seqDefaultSlots();
                          // Pad up to target with starter patterns when MPC was just bought
                          while (slots.length < target) slots.push(_seqStarter(slots.length % 4));
                          // Carry over any existing patterns
                          if (Array.isArray(c.oriSlots)) {
                            for (let i = 0; i < c.oriSlots.length && i < target; i++) {
                              if (c.oriSlots[i]) slots[i] = c.oriSlots[i];
                            }
                          }
                        }
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
        <div className="space-y-3">
          <SoundStudio activeSlot={activeSlot} showToast={showToast} char={char} />
          <SongsLibrary char={char} setChar={setChar} showToast={showToast} />
          <CrewPanel char={char} setChar={setChar} showToast={showToast} />
          <LivestreamPanel char={char} setChar={setChar} showToast={showToast} checkLevelUp={checkLevelUp} />
          {char.storyFlags?.bjarneIntroduced && (
            <BjarneCoachingPanel char={char} setChar={setChar} showToast={showToast} playCutscene={playCutscene} checkLevelUp={checkLevelUp} />
          )}
        </div>
      )}

      {tab === 'eat' && (
        <Panel title="Fridge — wholefood plant-based">
          <div className="space-y-2">
            {/* Coffee Machine — daily free espresso (gear). */}
            {hasGear(char, 'coffee_machine') && (() => {
              const claimed = char.day === char.lastCoffeeDay;
              return (
                <div className="flex items-center gap-3 p-2 border-2 bg-stone-900/30"
                  style={{ borderColor: claimed ? '#3a3530' : '#7a5040' }}>
                  <span className="text-xl">☕</span>
                  <div className="flex-1">
                    <div className="text-stone-200 text-sm">Home Espresso</div>
                    <div className="text-[10px] text-stone-500 uppercase tracking-wider">
                      +25⚡ -15🍴 +2♥ · {claimed ? 'tomorrow' : 'free, today'}
                    </div>
                  </div>
                  <Btn onClick={drinkHomeCoffee} disabled={claimed}>
                    {claimed ? 'TODAY' : 'BREW'}
                  </Btn>
                </div>
              );
            })()}
            {/* Houseplant — water it to keep alive. Max 3/day; 4th drowns it. */}
            {hasGear(char, 'houseplant') && (() => {
              const alive = plantAlive(char);
              const dead = !!char.plantDead;
              const daysSinceWater = char.day - (char.lastPlantWaterDay || 0);
              const sameDay = char.plantWaterCountDay === char.day;
              const todayCount = sameDay ? (char.plantWaterCount || 0) : 0;
              const atCap = todayCount >= 3;
              const broke = (char.cash || 0) < 5;
              return (
                <div className="flex items-center gap-3 p-2 border-2 bg-stone-900/30"
                  style={{ borderColor: dead ? '#5a2020' : alive ? '#3a7028' : '#5a3a30' }}>
                  <span className="text-xl">{dead ? '💀' : alive ? '🌿' : '🥀'}</span>
                  <div className="flex-1">
                    <div className="text-stone-200 text-sm">
                      {dead ? 'Houseplant (drowned)' : alive ? 'Houseplant (alive)' : 'Houseplant (wilting)'}
                    </div>
                    <div className="text-[10px] text-stone-500 uppercase tracking-wider">
                      {dead
                        ? (() => {
                            const ready = replantAvailableDay(char);
                            const wait = Math.max(0, ready - (char.day || 0));
                            return wait > 0
                              ? `overwatered · nursery restocks tuesday (${wait}d)`
                              : 'overwatered · nursery has plants today — buy one';
                          })()
                        : <>+1♥ each morning · last watered {daysSinceWater} day{daysSinceWater === 1 ? '' : 's'} ago · {todayCount}/3 today</>}
                    </div>
                  </div>
                  <Btn onClick={waterPlant} disabled={dead || broke}>
                    {dead ? '💀' : atCap ? '💧 $5 ⚠️' : '💧 $5'}
                  </Btn>
                </div>
              );
            })()}
            {/* Foxy Soup — free, once per in-game day. */}
            {(() => {
              const claimed = char.day === char.lastFoxySoupDay;
              return (
                <div className="flex items-center gap-3 p-2 border-2 bg-stone-900/30"
                  style={{ borderColor: claimed ? '#3a3530' : '#84cc16' }}>
                  <FoxyAvatar size={20} animate={!claimed} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lime-500 text-sm" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
                        FOXY SOUP
                      </span>
                      <span className="text-[9px] uppercase tracking-widest text-stone-600">
                        {claimed ? '· tomorrow' : '· free, today'}
                      </span>
                    </div>
                    <div className="text-[10px] text-stone-500 uppercase tracking-wider">
                      +10⚡ +30🍴 +2♥
                    </div>
                  </div>
                  <Btn onClick={eatFoxySoup} disabled={claimed}>
                    {claimed ? 'EATEN' : 'TAKE'}
                  </Btn>
                </div>
              );
            })()}
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

      {tab === 'wardrobe' && (
        <Panel title="Wardrobe">
          <div className="space-y-3">
            {/* Stage Wardrobe — pick a stage outfit; unlocks via milestones */}
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-[0.3em] text-amber-500" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
                STAGE WARDROBE
              </div>
              <div className="grid grid-cols-4 gap-2">
                {Object.entries(OUTFITS).map(([id, o]) => {
                  const unlocked = outfitUnlocked(char, id);
                  const active = (char.outfit || 'default') === id;
                  return (
                    <button key={id}
                      onClick={() => unlocked && setChar(c => ({ ...c, outfit: id }))}
                      disabled={!unlocked}
                      title={unlocked ? `${o.name} · ${o.desc}` : `🔒 ${o.desc}`}
                      className={`aspect-square border-2 flex flex-col items-center justify-center gap-1 transition-all ${
                        active ? 'border-amber-500 bg-amber-500/10' :
                        unlocked ? 'border-stone-800 hover:border-amber-500/50 bg-stone-900/30' :
                                   'border-stone-900 bg-stone-950/40 opacity-40 cursor-not-allowed'
                      }`}>
                      <div className="w-7 h-7 border border-stone-700"
                        style={{ background: id === 'default' ? char.color : (o.shirt || '#a78bfa') }} />
                      <div className="text-[8px] uppercase tracking-widest text-stone-500 truncate w-full text-center px-1">
                        {unlocked ? o.name : '🔒'}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="text-[10px] text-stone-600 uppercase tracking-wider text-center">
                applied to all on-stage performances
              </div>
            </div>

            {/* Stage Accessories */}
            <div className="border-t border-stone-800 pt-3 space-y-2">
              <div className="text-[10px] uppercase tracking-[0.3em] text-amber-500" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
                ACCESSORIES
              </div>
              <div className="grid grid-cols-4 gap-2">
                {Object.entries(ACCESSORIES).map(([id, a]) => {
                  const unlocked = accessoryUnlocked(char, id);
                  const active = (char.accessory || 'none') === id;
                  const label = a.name;
                  return (
                    <button key={id}
                      onClick={() => unlocked && setChar(c => ({ ...c, accessory: id }))}
                      disabled={!unlocked}
                      title={unlocked ? `${a.name}${a.desc ? ' · ' + a.desc : ''}` : `🔒 ${a.desc}`}
                      className={`aspect-square border-2 flex items-center justify-center transition-all ${
                        active ? 'border-amber-500 bg-amber-500/10' :
                        unlocked ? 'border-stone-800 hover:border-amber-500/50 bg-stone-900/30' :
                                   'border-stone-900 bg-stone-950/40 opacity-40 cursor-not-allowed'
                      }`}>
                      <div className="text-[9px] uppercase tracking-widest text-stone-400 text-center px-1">
                        {unlocked ? label : '🔒'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Panel>
      )}

      {tab === 'rest' && (
        <Panel title="The Couch">
          <div className="space-y-3">
            <Btn variant="primary" onClick={startNap} className="w-full py-3">
              😴 POWER NAP
            </Btn>
            <div className="text-[10px] text-stone-500 uppercase tracking-wider text-center">
              wake whenever · ~+12⚡ / hour, –3🍴 / hour
            </div>
            <Btn variant="primary" onClick={sleep} className="w-full py-3">
              🌙 SLEEP TILL MORNING
            </Btn>
            <div className="text-[10px] text-stone-500 uppercase tracking-wider text-center">
              full energy · advances 1 day
              {char.minutes < 720 && <div className="text-amber-500 mt-1">It's still daytime — are you sure?</div>}
            </div>
            {/* Quick mood pickups — no cooldown, just a time cost */}
            <div className="border-t border-stone-800 pt-3 space-y-2">
              <div className="text-[10px] uppercase tracking-[0.3em] text-amber-500" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
                DOWNTIME
              </div>
              <Btn onClick={watchTv} disabled={(char.energy || 0) < 3} className="w-full py-3">
                📺 WATCH TV (+10♥, 30 min, –3⚡)
              </Btn>
              <Btn onClick={playGames} disabled={(char.energy || 0) < 5} className="w-full py-3">
                🎮 PLAY GAMES (+14♥, 45 min, –5⚡, sometimes +1 ori)
              </Btn>
              <div className="text-[10px] text-stone-600 uppercase tracking-wider text-center">
                kill some time, get your head right
              </div>
            </div>

            {/* Move out / Apartment upgrade */}
            {(char.apartmentTier || 1) < 3 && (
              <div className="border-t border-stone-800 pt-3 space-y-2">
                <div className="text-[10px] uppercase tracking-[0.3em] text-amber-500" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
                  MOVE OUT
                </div>
                {[2, 3].filter(t => t > (char.apartmentTier || 1)).map(t => {
                  const u = APT_UPGRADES[t];
                  const dayLocked = (char.day || 0) < u.dayReq;
                  const fansLocked = (char.followers || 0) < u.fansReq;
                  const broke = (char.cash || 0) < u.cost;
                  const locked = dayLocked || fansLocked || broke;
                  return (
                    <div key={t} className="p-2 border-2 bg-stone-900/30"
                      style={{ borderColor: locked ? '#3a3530' : '#7a5040' }}>
                      <div className="flex items-center gap-2">
                        <span className="text-stone-200 text-sm">{u.name}</span>
                        <span className="text-[9px] uppercase tracking-widest text-stone-600">tier {t}</span>
                      </div>
                      <div className="text-[10px] text-stone-500 mt-1 leading-snug">{u.desc}</div>
                      <div className="text-[10px] text-stone-500 uppercase tracking-wider mt-1">
                        ${u.cost} · day {u.dayReq}+ · {u.fansReq} fans · rent ${RENT_BY_TIER[t-1]}/wk
                      </div>
                      <Btn onClick={() => moveToApt(t)} disabled={locked} className="w-full mt-2">
                        {dayLocked ? `Wait til day ${u.dayReq}` :
                         fansLocked ? `Need ${u.fansReq} fans` :
                         broke ? `Need $${u.cost}` : `MOVE IN — $${u.cost}`}
                      </Btn>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Yoga Mat — gear-gated daily meditation */}
            {hasGear(char, 'yoga_mat') && (() => {
              const claimed = char.day === char.lastYogaDay;
              return (
                <>
                  <Btn onClick={meditate} disabled={claimed} className="w-full py-3">
                    {claimed ? '🧘 ALREADY MEDITATED TODAY' : '🧘 MEDITATE (+5♥, 10 min)'}
                  </Btn>
                  <div className="text-[10px] text-stone-500 uppercase tracking-wider text-center">
                    on the yoga mat · once per in-game day
                  </div>
                </>
              );
            })()}
          </div>
        </Panel>
      )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ SCREEN: SHOP ============

function ShopScreen({ char, setChar, showToast, go, playCutscene }) {
  const [branch, setBranch] = useState(null); // null = hub, otherwise store key
  const [showSounds, setShowSounds] = useState(false); // sounds catalog modal

  const buyGear = (id) => {
    const item = GEAR_CATALOG[id];
    if (!item) return;
    // Houseplant is the one consumable: a dead one can be replaced — but only
    // starting on the Tuesday after it drowned (overwatering has consequences).
    const replacingDeadPlant = id === 'houseplant' && char.plantDead;
    if (char.gear?.[id] && !replacingDeadPlant) return;     // already owned
    if (replacingDeadPlant) {
      const ready = replantAvailableDay(char);
      if ((char.day || 0) < ready) {
        const wait = ready - (char.day || 0);
        showToast(`Plant nursery restocks Tuesday — ${wait} day${wait === 1 ? '' : 's'} to go.`, 'bad');
        return;
      }
    }
    if (char.cash < item.cost) { showToast('Not enough cash', 'bad'); return; }
    setChar(c => {
      let next = { ...c, cash: c.cash - item.cost, gear: { ...(c.gear || {}), [id]: true } };
      // Special-case fields some gear needs initialized on purchase
      if (id === 'houseplant') {
        next.lastPlantWaterDay = c.day;
        next.plantDead = false;
        next.plantWaterCount = 0;
        next.plantWaterCountDay = c.day;
      }
      if (id === 'mpc') {
        // Pad oriSlots out to 8 with starter patterns (carry over existing)
        const existing = Array.isArray(c.oriSlots) ? c.oriSlots : [];
        const slots = [];
        for (let i = 0; i < SEQ_SLOTS_MPC; i++) {
          slots.push(existing[i] || _seqStarter(i % 4));
        }
        next.oriSlots = slots;
      }
      return next;
    });
    showToast(`Bought ${item.name}!`, 'win');
    if (replacingDeadPlant) {
      setTimeout(() => playCutscene?.({
        speaker: null,
        beats: [{
          drawScene: (ctx, fc) => drawPlantArrivedScene(ctx, fc, lookFromChar(char)),
          lines: [
            "Tuesday. The nursery had one left.",
            "You set it on the counter, careful this time.",
            "(every three days, a small drink. that's it.)",
          ],
        }],
      }), 200);
    }
  };

  // ---- Sounds catalog (replaces old sound-buying UI) ----
  if (showSounds) {
    const ordered = Object.entries(SOUND_CATALOG);
    return (
      <div className="space-y-3">
        <button onClick={() => setShowSounds(false)}
          className="text-stone-500 hover:text-amber-500 text-xs uppercase tracking-widest flex items-center gap-1">
          <ArrowLeft size={14} /> Back to shop
        </button>
        <div className="text-center mb-1">
          <div className="text-2xl tracking-widest text-stone-300" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>SOUNDS CATALOG</div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Locked sounds unlock as you grow</div>
        </div>
        <Panel title={`Owned (${(char.sounds || []).length}/${ordered.length})`}>
          <div className="space-y-2">
            {ordered.map(([id, s]) => {
              const owned = (char.sounds || []).includes(id);
              const equipped = (char.equipped || []).includes(id);
              const unlock = SOUND_UNLOCKS[id];
              return (
                <div key={id} className={`p-2 border bg-stone-900/30 ${owned ? 'border-stone-800' : 'border-stone-900 opacity-60'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className={`text-sm ${owned ? 'text-stone-200' : 'text-stone-500'}`}>
                      {owned ? '' : '🔒 '}{s.name}
                    </div>
                    <div className="flex gap-1">{Array.from({ length: s.tier }).map((_, i) => <Star key={i} size={10} className="text-amber-500 fill-amber-500" />)}</div>
                  </div>
                  <div className="text-[10px] text-stone-500 uppercase mb-1 tracking-wider">
                    {s.cat} · {s.base}pts · {s.stamina}⚡ · {s.stat}
                  </div>
                  {owned ? (
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] text-amber-500/70 uppercase tracking-widest">unlocked · {unlock?.label}</div>
                      <Btn variant={equipped ? 'primary' : 'ghost'} onClick={() => {
                        setChar(c => {
                          if (equipped) return { ...c, equipped: c.equipped.filter(x => x !== id) };
                          if (c.equipped.length >= 5) { showToast('Max 5 sounds', 'bad'); return c; }
                          return { ...c, equipped: [...c.equipped, id] };
                        });
                      }}>{equipped ? 'EQUIPPED' : 'EQUIP'}</Btn>
                    </div>
                  ) : (
                    <div className="text-[10px] text-stone-600 uppercase tracking-widest">
                      🔒 {unlock?.label || 'unlock condition unknown'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    );
  }

  // ---- Sub-store view ----
  if (branch) {
    const meta = STORE_META[branch];
    const items = Object.entries(GEAR_CATALOG).filter(([, it]) => it.store === branch);
    return (
      <div className="space-y-3">
        <button onClick={() => setBranch(null)}
          className="text-stone-500 hover:text-amber-500 text-xs uppercase tracking-widest flex items-center gap-1">
          <ArrowLeft size={14} /> Back to shop
        </button>
        <div className="text-center mb-1">
          <div className="text-2xl tracking-widest" style={{ color: meta.color, fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
            {meta.icon} {meta.display.toUpperCase()}
          </div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">tap an item to buy</div>
        </div>
        <Panel title={`${items.length} items`}>
          <div className="space-y-2">
            {items.map(([id, it]) => {
              const owned = char.gear?.[id];
              // Dead plant can be replaced — show as not-owned so the buy button comes back.
              const replaceable = id === 'houseplant' && char.plantDead;
              const showOwned = owned && !replaceable;
              const canAfford = (char.cash || 0) >= it.cost;
              // Drowned plants restock at the nursery on the next Tuesday.
              const replantReadyDay = replaceable ? replantAvailableDay(char) : 0;
              const replantLocked = replaceable && (char.day || 0) < replantReadyDay;
              const replantWait = replantLocked ? replantReadyDay - (char.day || 0) : 0;
              return (
                <div key={id} className={`p-2 border bg-stone-900/30 ${showOwned ? 'border-amber-500/50' : 'border-stone-800'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-stone-200 text-sm">
                      {it.name}
                      {replaceable && !replantLocked && <span className="text-rose-400 text-[10px] ml-2 uppercase tracking-widest">drowned · replace?</span>}
                      {replantLocked && <span className="text-stone-500 text-[10px] ml-2 uppercase tracking-widest">restocks tuesday</span>}
                    </div>
                    {showOwned ? (
                      <div className="text-[10px] uppercase tracking-widest text-amber-500">OWNED</div>
                    ) : replantLocked ? (
                      <div className="text-[10px] uppercase tracking-widest text-stone-500">{replantWait}d</div>
                    ) : (
                      <Btn onClick={() => buyGear(id)} disabled={!canAfford}>${it.cost}</Btn>
                    )}
                  </div>
                  <div className="text-[10px] text-stone-500 uppercase tracking-wider leading-snug">
                    {replantLocked
                      ? 'Nursery only restocks houseplants on Tuesdays. Try again then.'
                      : it.desc}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    );
  }

  // ---- Shop hub ----
  const stores = ['music', 'furniture', 'clothing', 'pet'];
  return (
    <div className="space-y-3">
      <div className="text-center mb-2">
        <div className="text-2xl tracking-widest text-stone-300" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>THE SHOP</div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">pick a branch</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {stores.map(s => {
          const meta = STORE_META[s];
          const totalHere = Object.values(GEAR_CATALOG).filter(it => it.store === s).length;
          const owned = Object.entries(GEAR_CATALOG).filter(([id, it]) => it.store === s && char.gear?.[id]).length;
          const locked = !isUnlocked(char, `store_${s}`);
          return (
            <button key={s} onClick={() => !locked && setBranch(s)} disabled={locked}
              className={`aspect-square border-2 flex flex-col items-center justify-center gap-2 transition-all p-3 ${
                locked ? 'border-stone-900 bg-stone-950/40 opacity-50 cursor-not-allowed'
                       : 'border-stone-800 hover:border-amber-500/50 bg-stone-900/30'
              }`}>
              <div className="text-4xl">{locked ? '🔒' : meta.icon}</div>
              <div className="text-xs uppercase tracking-widest" style={{ color: locked ? '#5a5046' : meta.color, fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
                {meta.display}
              </div>
              <div className="text-[9px] uppercase tracking-widest text-stone-600">
                {locked ? `unlocks ${CONTENT_UNLOCKS[`store_${s}`].label.toLowerCase()}` : `${owned}/${totalHere} owned`}
              </div>
            </button>
          );
        })}
      </div>
      <button onClick={() => setShowSounds(true)}
        className="w-full p-3 border-2 border-stone-800 hover:border-amber-500/50 bg-stone-900/30 flex items-center justify-between transition-all">
        <div>
          <div className="text-amber-500 text-sm uppercase tracking-widest" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
            🎚️ Sounds catalog
          </div>
          <div className="text-[10px] uppercase tracking-widest text-stone-500">
            {(char.sounds || []).length}/{Object.keys(SOUND_CATALOG).length} unlocked · view & equip
          </div>
        </div>
        <span className="text-amber-500 text-xl">→</span>
      </button>
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

  // ---- Date arrival check ----
  // If you walk into the park on the day a romance partner asked you to
  // meet here, surface a "MEET <PARTNER>" button. Trigger the date scene
  // when tapped; consume the booking either way (showing up = +affinity,
  // showing up late = mood penalty handled below).
  const dateBooking = char.dateBooking;
  const onDateDay = !!dateBooking && (dateBooking.day === char.day);
  const dateMissed = !!dateBooking && (dateBooking.day < char.day);
  // If you're already past the date day with the booking still set, fire
  // a one-time stand-up penalty + clear the booking.
  useEffect(() => {
    if (!dateMissed) return;
    const partner = dateBooking.partner;
    setChar(c => ({
      ...c,
      dateBooking: null,
      mood: Math.max(0, (c.mood || 0) - 10),
      romanceAffinity: { ...(c.romanceAffinity || {}), [partner]: Math.max(0, (c.romanceAffinity?.[partner] || 0) - 2) },
    }));
    showToast?.(`You stood ${dateBooking.partnerName} up. -10 mood.`, 'bad');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateMissed]);

  const goOnDate = () => {
    if (!onDateDay) return;
    const bd = dateBooking;
    const partnerLook =
      bd.partner === 'luca' ? _LUCA_LOOK :
      bd.partner === 'mira' ? _MIRA_LOOK :
      bd.partner === 'sky'  ? _SKY_LOOK  : { shirt: '#a78bfa' };
    const playerLook = lookFromChar(char);
    playCutscene?.({
      speaker: bd.partnerName,
      speakerColor: bd.partnerColor,
      beats: [{
        drawScene: (ctx, fc) => drawDateScene(ctx, fc, playerLook, partnerLook),
        lines: [
          "you came.",
          "i wasn't sure if you would.",
          "...this is nice.",
        ],
      }],
    });
    // Apply: clear booking, +affinity, +mood, +1 hour gametime
    setChar(c => {
      const aff = { ...(c.romanceAffinity || {}) };
      aff[bd.partner] = (aff[bd.partner] || 0) + 3;
      const state = { ...(c.romanceState || {}) };
      if (aff[bd.partner] >= 10)     state[bd.partner] = 'couple';
      else if (aff[bd.partner] >= 5) state[bd.partner] = 'romancing';
      return {
        ...c,
        dateBooking: null,
        minutes: (c.minutes || 0) + 60,
        mood: Math.min(100, (c.mood || 0) + 18),
        romanceAffinity: aff,
        romanceState: state,
      };
    });
  };

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
      tickHungerCost: 0,
      tickMoodDelta: 0,
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
          const updated = bumpDaily({
            ...cc,
            cash: cc.cash + earned,
            followers: cc.followers + fans,
            xp: cc.xp + 6,
            storyFlags: { ...(cc.storyFlags || {}), firstBusk: true },
          }, 'busks');
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
          const flags = cc.storyFlags || {};
          const jamCount = (flags.jamCount || 0) + 1;
          const updated = bumpDaily({ ...cc, followers: cc.followers + fans, xp: cc.xp + 8,
            stats: { ...cc.stats, [stat]: cc.stats[stat] + 1 },
            storyFlags: { ...flags, jamCount } }, 'jams');
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
          return;
        }
        // Pig Pen's challenge cutscene — fires once after 3+ jams or sho >= 8
        const flags = c?.storyFlags || {};
        const nextJamCount = (flags.jamCount || 0) + 1;
        const sho = c?.stats?.sho || 0;
        if (!flags.pigPenChallenged && (nextJamCount >= 3 || sho >= 8)) {
          playCutscene?.({
            speaker: 'PIG PEN',
            speakerColor: '#fb7185',
            beats: [{
              drawScene: (ctx, fc) => drawPigPenChallengeScene(ctx, fc, lookFromChar(c)),
              lines: [
                "yo. you. new face.",
                "you sound like you been practicing in a closet.",
                "saturday. bar. you and me.",
                "don't bring a friend. you'll need 'em on the way home.",
              ],
            }],
          }, 'pigPenChallenged');
        }
        // BeeAmGee cypher sighting — fires once after first battle win (any opponent)
        if ((c?.defeated?.length || 0) >= 1 && !flags.bjarneCypherSighting) {
          playCutscene?.({
            speaker: null,
            beats: [{
              drawScene: (ctx, fc) => drawBjarneCypherScene(ctx, fc, lookFromChar(c)),
              lines: [
                "Someone's standing at the back of the cypher.",
                "Gray beard. Leather jacket. Doesn't perform.",
                "He nods once when you finish your round. Then he's gone.",
                "...who was that?",
              ],
            }],
          }, 'bjarneCypherSighting');
        }
        // Famous beatboxer crashes the cypher — fires once mid-arc (5+ jams, 30+ followers)
        if (nextJamCount >= 5 && (c?.followers || 0) >= 30 && !flags.fatboxgVisit) {
          playCutscene?.({
            speaker: null,
            lines: [
              "The circle goes quiet mid-round.",
              "Heads turn. Someone you know from the videos just stepped into the cypher.",
              "They throw a 30-second flurry that nobody can answer. Then they're gone, walking off with two friends.",
              "Someone whispers their name. You pretend you weren't watching.",
              "There's a long way to go.",
            ],
          }, 'fatboxgVisit');
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
        // Premium running shoes give an additional +1 per block.
        const shoesBonus = hasGear(charRef.current, 'premium_shoes') ? 1 : 0;
        const shoGain = ((isPlayMode && result.isGood) ? 2 : 1) + shoesBonus;

        setChar(cc => {
          const updated = bumpDaily({ ...cc,
            xp: cc.xp + 5,
            mood: Math.min(100, cc.mood + 4),
            energy: Math.max(0, cc.energy - burnEnergy),
            stats: { ...cc.stats, sho: cc.stats.sho + shoGain }
          }, 'runs');
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
      // Mini-game playMode: slower drain + slower clock so a session in the
      // park (busk-tap, run, jam) lasts long enough to be fun.
      tickEnergyCost: playMode ? cfg.tickEnergyCost * 0.4 : cfg.tickEnergyCost,
      tickHungerCost: playMode ? cfg.tickHungerCost * 0.5 : cfg.tickHungerCost,
      tickMoodDelta: cfg.tickMoodDelta,
      tickRealMs: playMode ? 2500 : undefined,
      tickMinutes: playMode ? 3 : undefined,
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

      {/* Date trigger — when you're at the park on the day a romance partner asked you to meet here. */}
      {onDateDay && !activity.active && (
        <Panel title="Date">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-widest"
              style={{ color: dateBooking.partnerColor, fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
              {dateBooking.partnerName} is on the bench by the trees.
            </div>
            <div className="text-[10px] text-stone-500 uppercase tracking-wider">
              Skip and you'll stand them up. Mood + affinity penalty.
            </div>
            <Btn variant="primary" onClick={goOnDate} className="w-full py-3">
              💕 MEET {dateBooking.partnerName.toUpperCase()} (+1 hr)
            </Btn>
          </div>
        </Panel>
      )}

      {!activity.active && (() => {
        // Per-activity entry gate. Busk has no hunger/mood reqs (it's the
        // safety net); jam and run still need the player to be in shape.
        const blockReason = (key, cost) => {
          if ((char.sickDay || 0) === char.day) return 'Too sick';
          if ((char.energy || 0) < cost * 3)    return 'Too tired';
          if (key === 'busk') return null;
          if ((char.hunger || 0) < 15)          return 'Too hungry';
          if ((char.mood || 0) < 15)            return 'Too grumpy';
          return null;
        };
        const blockHint = (key, cost) => {
          if ((char.sickDay || 0) === char.day) return 'Rest until tomorrow';
          if ((char.energy || 0) < cost * 3)    return 'Power nap on the couch';
          if (key === 'busk') return null;
          if ((char.hunger || 0) < 15)          return 'Eat in the kitchen';
          if ((char.mood || 0) < 15)            return 'Watch TV or take a walk';
          return null;
        };
        return (
          <Panel title="Activities">
            <div className="space-y-2">
              {Object.entries(activities).map(([key, a]) => {
                const reason = blockReason(key, a.tickEnergyCost);
                const hint = blockHint(key, a.tickEnergyCost);
                return (
                  <button key={key}
                    onClick={() => {
                      if (reason) { showToast(`${reason} · ${hint}`, 'bad'); return; }
                      setSelected(key); setPendingStart(true);
                    }}
                    title={reason ? `${reason} — ${hint}` : ''}
                    className={`w-full flex items-center gap-3 p-3 border-2 transition-all ${
                      reason
                        ? 'border-rose-900/60 bg-rose-950/20 cursor-not-allowed'
                        : 'border-stone-800 bg-stone-900/30 hover:border-amber-500'
                    }`}>
                    <div className={reason ? 'opacity-40' : ''}>
                      <PixelIcon name={a.pixelIcon} size={32} />
                    </div>
                    <div className="flex-1 text-left">
                      <div className={`text-sm ${reason ? 'text-stone-500' : 'text-stone-200'}`}>{a.name}</div>
                      <div className="text-[10px] text-stone-500 uppercase tracking-wider">{a.desc}</div>
                    </div>
                    <div className="text-right">
                      {reason ? (
                        <>
                          <div className="text-rose-400 text-xs uppercase tracking-wider">🔒 {reason}</div>
                          <div className="text-[10px] text-stone-500 uppercase">{hint}</div>
                        </>
                      ) : (
                        <>
                          <div className="text-amber-500 text-xs">START ▶</div>
                          <div className="text-[10px] text-stone-500 uppercase">-{a.tickEnergyCost}⚡/tick</div>
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </Panel>
        );
      })()}

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

// Open Mic Performance: pixel-art stage scene + plays 2 random sequencer
// patterns from char.oriSlots back to back, then fires onComplete.
const OpenMicPerformance = ({ char, onComplete }) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const lookRef = useRef(lookFromChar(char));

  // Pick 2 random patterns that have any active cells. Falls back to starters
  // if the player hasn't built any beats yet.
  const picks = useRef(null);
  if (!picks.current) {
    const slots = (char.oriSlots || []).filter(s => s?.tracks?.some(t => t.cells?.some(Boolean)));
    if (slots.length === 0) {
      picks.current = [_seqStarter(0), _seqStarter(1)];
    } else if (slots.length === 1) {
      picks.current = [slots[0], slots[0]];
    } else {
      const shuffled = [...slots].sort(() => Math.random() - 0.5);
      picks.current = [shuffled[0], shuffled[1]];
    }
  }

  useEffect(() => {
    const ctx = getAudioCtx();
    if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
    // Open mic plays a notch faster than the player's saved sequencer BPM —
    // the room expects energy.
    const bpm = (char.oriBpm || 100) + 20;
    const stepMs = 60000 / Math.max(40, bpm) / 4;
    const STEPS = 16;
    const REPS_PER_PATTERN = 2;
    let step = 0, rep = 0, patIdx = 0;
    const id = setInterval(() => {
      const pattern = picks.current[patIdx];
      if (pattern?.tracks) {
        pattern.tracks.forEach(t => {
          if (t.cells[step]) playGameSound(t.key);
        });
      }
      step++;
      if (step >= STEPS) {
        step = 0;
        rep++;
        if (rep >= REPS_PER_PATTERN) {
          rep = 0;
          patIdx++;
          if (patIdx >= picks.current.length) {
            clearInterval(id);
            const t = setTimeout(onComplete, 700);
            return () => clearTimeout(t);
          } else {
            setActiveIdx(patIdx);
          }
        }
      }
    }, stepMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5"
      style={{ background: 'radial-gradient(circle at center, #1c1917 0%, #0c0a09 100%)' }}>
      <div className="max-w-md w-full space-y-3">
        <div className="text-center">
          <div className="text-amber-500 text-2xl tracking-wider"
            style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
            🎤 OPEN MIC NIGHT
          </div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">
            {(char.name || '').toUpperCase()} · the room is yours
          </div>
        </div>
        <PixelScene draw={(ctx, fc) => drawOpenMicStage(ctx, fc, lookRef.current)} />
        <div className="text-center text-[10px] uppercase tracking-widest text-amber-500">
          ROUTINE {Math.min(activeIdx + 1, picks.current.length)} / {picks.current.length} · {picks.current[activeIdx]?.name || 'CUSTOM'}
        </div>
      </div>
    </div>
  );
};

// Sleep animation: fades dusk → night → dawn, plays a rooster crow on wake.
// Power-nap modal: real-time "you nap on the couch, clock spins, wake when you want".
// Game minutes advance at REAL_MS_PER_GAME_HOUR until the player wakes or hits DAY_END.
const PowerNapAnimation = ({ char, onWake }) => {
  const [napMinutes, setNapMinutes] = useState(char.minutes ?? 0);
  const startedRealAtRef = useRef(performance.now());
  const startMinutesRef = useRef(char.minutes ?? 0);
  const lookRef = useRef(lookFromChar(char));
  const wokeRef = useRef(false);
  const REAL_MS_PER_GAME_HOUR = 1500; // ~1 game hour every 1.5 real seconds
  const DAY_LIMIT = 1200; // 02:00, same as DAY_END

  useEffect(() => {
    let raf;
    const tick = () => {
      if (wokeRef.current) return;
      const realElapsed = performance.now() - startedRealAtRef.current;
      const gameMinElapsed = (realElapsed / REAL_MS_PER_GAME_HOUR) * 60;
      const next = Math.min(DAY_LIMIT, startMinutesRef.current + gameMinElapsed);
      setNapMinutes(next);
      if (next >= DAY_LIMIT) {
        if (!wokeRef.current) { wokeRef.current = true; onWake(next, true); }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wakeUp = () => {
    if (wokeRef.current) return;
    wokeRef.current = true;
    onWake(napMinutes, false);
  };

  const slept = Math.max(0, napMinutes - startMinutesRef.current);
  const sleptHours = Math.floor(slept / 60);
  const sleptMins = Math.floor(slept % 60);
  // Wall-clock time (game minutes since 6 AM)
  const totalMin = napMinutes + 360;
  const hour24 = Math.floor(totalMin / 60) % 24;
  const minOfHour = Math.floor(totalMin % 60);
  // Predicted energy when waking right now — matches finishNap math
  // (+12 energy per hour slept, capped at maxEnergy).
  const maxEnergy = char.maxEnergy ?? 100;
  const predictedEnergy = Math.round(Math.min(maxEnergy, char.energy + Math.floor((slept / 60) * 12)));
  const energyPct = Math.round((predictedEnergy / maxEnergy) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5" style={{ background: '#0c0a09' }}>
      <div className="max-w-md w-full space-y-3">
        <div className="text-center">
          <div className="text-amber-500 text-2xl tracking-wider"
            style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
            POWER NAP
          </div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">
            Slept {sleptHours}h {String(sleptMins).padStart(2, '0')}m
          </div>
        </div>
        <PixelScene draw={(ctx, fc) => drawNapScene(ctx, fc, lookRef.current, napMinutes)} />
        {/* Live HUD: in-game wall clock + energy gauge */}
        <div className="grid grid-cols-2 gap-2">
          <div className="border-2 border-stone-800 bg-stone-900/50 p-2 text-center">
            <div className="text-[9px] uppercase tracking-widest text-stone-500">In-game time</div>
            <div className="text-amber-500 text-2xl tracking-widest leading-none mt-1"
              style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
              {String(hour24).padStart(2, '0')}:{String(minOfHour).padStart(2, '0')}
            </div>
          </div>
          <div className="border-2 border-stone-800 bg-stone-900/50 p-2 text-center">
            <div className="text-[9px] uppercase tracking-widest text-stone-500">Energy</div>
            <div className="text-amber-500 text-2xl tracking-widest leading-none mt-1"
              style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
              {predictedEnergy}/{maxEnergy}
            </div>
            <div className="mt-1 h-1.5 bg-stone-950 border border-stone-800">
              <div className="h-full bg-amber-500 transition-all" style={{ width: `${energyPct}%` }} />
            </div>
          </div>
        </div>
        <Btn variant="primary" onClick={wakeUp} className="w-full py-3">
          WAKE UP ☀️
        </Btn>
      </div>
    </div>
  );
};

// Power-nap scene: bedroom with player on couch + a clock that spins as the
// game minutes advance.
const drawNapScene = (ctx, fc, look, currentMinutes) => {
  const W = 200;
  // Apartment bg (afternoon dim)
  _px(ctx, 0, 0, W, 95, '#3a3540');
  _px(ctx, 0, 95, W, 35, '#3a2818');
  // Couch
  _px(ctx, 24, 80, 110, 28, '#5a4030');
  _px(ctx, 24, 80, 110, 4, '#7a5a40');
  _px(ctx, 18, 76, 12, 18, '#5a4030');
  _px(ctx, 128, 76, 12, 18, '#5a4030');
  // Player lying on couch — chunky proportions
  // Pillow under head
  _px(ctx, 30, 78, 18, 3, '#a8a29e');
  _px(ctx, 30, 78, 18, 1, '#cbc4be');
  // Head
  _px(ctx, 33, 72, 12, 9, look?.skin || '#d4a87a');
  _px(ctx, 33, 70, 12, 3, look?.hair || '#1a1a2e');
  // Closed eyes
  _px(ctx, 37, 76, 2, 1, '#0c0a09');
  _px(ctx, 41, 76, 2, 1, '#0c0a09');
  // Smile
  _px(ctx, 38, 79, 4, 1, '#3a1010');
  // Body / torso (chunky)
  _px(ctx, 45, 73, 32, 8, look?.shirt || '#a78bfa');
  _px(ctx, 45, 73, 32, 1, '#fff');
  // Pants/legs
  _px(ctx, 77, 75, 22, 6, '#1a1a2e');
  // Feet poking up
  _px(ctx, 99, 72, 5, 3, '#fff');
  // Z's drifting up
  if (fc % 30 < 24) {
    const phase = (fc / 30) % 3;
    ctx.fillStyle = '#dac0a0';
    ctx.font = 'bold 9px monospace';
    ctx.fillText('z', 50 + phase * 5, 65 - phase * 8);
  }
  // Clock in upper-right
  const cx = 158, cy = 32, r = 22;
  // Outer ring shadow + face
  ctx.fillStyle = '#3a3530';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#dadada';
  ctx.beginPath(); ctx.arc(cx, cy, r - 2, 0, Math.PI * 2); ctx.fill();
  // Tick marks (12 positions)
  ctx.fillStyle = '#1c1917';
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(ang) * (r - 4);
    const y = cy + Math.sin(ang) * (r - 4);
    const sz = i % 3 === 0 ? 2 : 1;
    ctx.fillRect(Math.floor(x - sz / 2), Math.floor(y - sz / 2), sz, sz);
  }
  // Hands — spin with elapsed game minutes
  const totalMin = (currentMinutes + 360);
  const hourPos = ((totalMin / 60) % 12) / 12;
  const minPos = (totalMin % 60) / 60;
  const drawHand = (frac, len, width) => {
    const ang = frac * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(ang) * len;
    const y = cy + Math.sin(ang) * len;
    ctx.strokeStyle = '#1c1917';
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
  };
  drawHand(hourPos, r - 10, 2.2);
  drawHand(minPos, r - 4, 1.2);
  // Center pin
  ctx.fillStyle = '#1c1917';
  ctx.beginPath(); ctx.arc(cx, cy, 1.5, 0, Math.PI * 2); ctx.fill();
};

const SleepAnimation = ({ char, durationMs = 4000, onComplete }) => {
  const [progress, setProgress] = useState(0);
  const startedAtRef = useRef(performance.now());
  const roosterPlayedRef = useRef(false);
  const lookRef = useRef(lookFromChar(char));

  useEffect(() => {
    let raf;
    const tick = () => {
      const t = (performance.now() - startedAtRef.current) / durationMs;
      setProgress(Math.min(1, t));
      if (t > 0.85 && !roosterPlayedRef.current) {
        roosterPlayedRef.current = true;
        playRooster();
      }
      if (t >= 1) { onComplete(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const phaseLabel = progress < 0.4 ? 'Drifting off…'
                  : progress < 0.85 ? 'Sleeping'
                                    : '🐓 Cock-a-doodle-doo';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5" style={{ background: '#0c0a09' }}>
      <div className="max-w-md w-full space-y-3">
        <PixelScene draw={(ctx, fc) => drawSleepScene(ctx, fc, lookRef.current, progress)} />
        <div className="text-center text-stone-300 text-base tracking-widest"
          style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
          {phaseLabel}
        </div>
      </div>
    </div>
  );
};

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

function BarScreen({ char, setChar, go, showToast, checkLevelUp, playCutscene }) {
  const [selected, setSelected] = useState(null);
  const [rohzelLine, setRohzelLine] = useState(() => _pick(ROHZEL_GREETINGS));
  const [performingShowcase, setPerformingShowcase] = useState(false);
  const [performingOpenMic, setPerformingOpenMic] = useState(false);
  const [mingleEncounter, setMingleEncounter] = useState(null);

  // Festival path resolver — wins/loses based on stat threshold + RNG.
  // Each path applies its reward + closing cutscene + sets festivalState='done'.
  const runFestival = (path) => {
    const stats = char.stats || {};
    const total = (stats.mus||0) + (stats.tec||0) + (stats.ori||0) + (stats.sho||0);
    // Win odds scale with total stats; floor 25% at low, near-certain at high.
    const winOdds = Math.min(0.95, 0.25 + total / 120);
    const won = Math.random() < winOdds;
    const cash = won ? (path === 'A' ? 600 : path === 'B' ? 350 : 450) : 80;
    const fans = won ? (path === 'B' ? 200 : path === 'A' ? 100 : 130) : 25;
    setChar(c => ({
      ...c,
      cash: (c.cash || 0) + cash,
      followers: (c.followers || 0) + fans,
      energy: Math.max(0, (c.energy || 0) - 50),
      mood: _clampPct((c.mood || 0) + (won ? 30 : -10)),
      xp: c.xp + (won ? 200 : 80),
      festivalState: 'done',
      festivalPath: path,
      festivalResult: won ? 'win' : 'lose',
      storyFlags: { ...(c.storyFlags || {}), festivalPlayed: true,
        ...(won ? { festivalWon: true } : {}) },
    }));
    const pathName = path === 'A' ? 'the gauntlet' : path === 'B' ? 'the collab' : 'the showcase';
    setTimeout(() => playCutscene?.({
      speaker: won ? 'YOU MADE IT' : 'YOU PLAYED',
      speakerColor: won ? '#fbbf24' : '#a8a29e',
      beats: [{ lines: won
        ? [
            `You won ${pathName}.`,
            "The room held its breath. The room let it out as you finished.",
            `+$${cash} · +${fans} fans · the rest of your life feels different now.`,
          ]
        : [
            `You played ${pathName}. The crowd was kind.`,
            "Some things you carry home aren't trophies.",
            `+$${cash} · +${fans} fans · you'll be back.`,
          ]
      }],
    }), 100);
    go('hood');
  };
  const startMingle = () => {
    if (char.energy < 6) { showToast('Too tired to chat', 'bad'); return; }
    const enc = pickMingleEncounter(char, MINGLE_POOL);
    if (!enc) { showToast('The bar is unusually quiet tonight.', 'info'); return; }
    setMingleEncounter(enc);
  };

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
      const t = passMinutes(c, 5);
      const next = {
        ...c, ...t,
        cash: c.cash - item.cost,
        energy: Math.max(0, Math.min(max, c.energy + (im.energy || 0))),
        hunger: _clampPct(c.hunger + (im.hunger || 0)),
        mood:   _clampPct(t.mood + (im.mood || 0)),
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
  // Open mic now opens a stage performance modal (plays 2 random sequencer
  // patterns) before applying the rewards. Fan gain scales slowly with
  // total skills + showmanship so it grows as the character improves.
  const doOpenMic = () => {
    if (char.energy < 10) { showToast('Too tired to perform', 'bad'); return; }
    if ((char.sickDay || 0) === char.day) { showToast('Too sick to perform tonight', 'bad'); return; }
    setPerformingOpenMic(true);
  };
  const finishOpenMic = () => {
    const cBefore = char;
    // Roll the fan gain ONCE up front so the toast can show the actual
    // number (not a re-derived approximation that drifts from reality).
    const stats = char.stats || {};
    const totalSkills = (stats.mus || 0) + (stats.tec || 0) + (stats.ori || 0) + (stats.sho || 0);
    const base = Math.floor(Math.max(0, totalSkills - 20) / 25);
    const showBonus = Math.floor((stats.sho || 0) / 8);
    const lucky = Math.floor(Math.random() * 3);
    // Slow scaling: 1–3 fans early game, ~10 mid-late, capped at 20 elite.
    const fanGain = Math.max(1, Math.min(20, base + showBonus + lucky));
    setChar(c => {
      // Wardrobe Refresh: +1 sho on every show
      const wardrobeBonus = hasGear(c, 'wardrobe_refresh') ? 1 : 0;
      const t = passMinutes(c, 60); // open mic is a full hour of game time
      let next = {
        ...c, ...t,
        energy: Math.max(0, c.energy - 10),
        mood: Math.min(100, t.mood + 5),
        heat: (c.heat || 0) + 2,
        followers: c.followers + fanGain,
        openMicCount: (c.openMicCount || 0) + 1,
        xp: c.xp + 8,
        stats: { ...(c.stats || {}), sho: (c.stats?.sho || 0) + wardrobeBonus },
        daily: { ...(c.daily || {}), openMics: (c.daily?.openMics || 0) + 1 },
      };
      // Good-show parent text trigger (only on a strong show, with cooldown)
      const cd = c.day - (c.lastParentMsgDay || 0);
      if (cd >= 3 && fanGain >= 5 && Math.random() < 0.35) {
        next = addMessage(next, 'parents', _pick(PARENT_MESSAGES.goodShow));
        next.lastParentMsgDay = c.day;
      }
      // Anonymous internet reactions to the show. Strong shows attract
      // fans, weak ones attract haters.
      if (fanGain >= 5 && Math.random() < 0.35) {
        next = addMessage(next, 'unknown', _pick(UNKNOWN_MESSAGES_FAN));
      } else if (fanGain <= 1 && Math.random() < 0.30) {
        next = addMessage(next, 'unknown', _pick(UNKNOWN_MESSAGES_HATE));
      }
      return next;
    });
    setPerformingOpenMic(false);
    // Cutscenes: first open-mic beat + BeeAmGee meeting (if eligible)
    setTimeout(() => {
      const c = cBefore || {};
      const flags = c.storyFlags || {};
      if (!flags.firstOpenMicDone) {
        playCutscene?.({
          speaker: null,
          lines: [
            'Hot lights. A mic. Forty strangers staring back.',
            'The room exhales when you do. Whatever happens here, it counts.',
            'You held the room. Even just for a minute.',
          ],
        }, 'firstOpenMicDone');
      }
      if (flags.bjarneCypherSighting && !flags.bjarneIntroduced) {
        playCutscene?.({
          speaker: 'BEEAMGEE',
          speakerColor: '#a3a3a3',
          beats: [{
            drawScene: (ctx, fc) => drawBjarneMeetingScene(ctx, fc, lookFromChar(c)),
            lines: [
              "saw you in the cypher last week.",
              "you've got something. raw. unfinished. but something.",
              "name's BeeAmGee. been at this thirty years.",
              "come find me when you're ready. studio. fifty bucks. i'll show you what i know.",
            ],
          }],
        }, 'bjarneIntroduced');
      }
    }, 0);
    showToast(`Open mic done · +${fanGain} new fans 🎤`, 'win');
  };
  const doCrewBattle = (crew) => {
    if ((char.energy || 0) < 30) { showToast('Need 30 energy', 'bad'); return; }
    if ((char.sickDay || 0) === char.day) { showToast('Too sick to battle', 'bad'); return; }
    const result = resolveCrewBattle(char, crew);
    setChar(c => {
      const t = passMinutes(c, 90);
      const reward = crew.reward;
      let next = {
        ...c, ...t,
        energy: Math.max(0, c.energy - 30),
        mood: Math.min(100, t.mood + (result.won ? 12 : -10)),
        cash: c.cash + (result.won ? reward.cash : Math.floor(reward.cash * 0.2)),
        followers: Math.max(0, c.followers + (result.won ? reward.followers : -3)),
        xp: c.xp + (result.won ? 30 : 12),
        heat: (c.heat || 0) + 4,
        lastBattleDay: c.day,
        storyFlags: { ...(c.storyFlags || {}),
          [`crew_${crew.id}_${result.won ? 'won' : 'lost'}`]: true,
          ...(result.won && reward.flag ? { [reward.flag]: true } : {}),
        },
      };
      if (result.won) next = checkLevelUp(next);
      return next;
    });
    const summaryLines = result.rounds.map((r, i) => `Round ${i+1}: ${r.win ? 'WON' : 'LOST'} vs ${r.theirMember.name} · ${r.our}–${r.their}`);
    setTimeout(() => playCutscene({
      speaker: result.won ? 'CREW BATTLE — WIN' : 'CREW BATTLE — LOSS',
      speakerColor: result.won ? '#84cc16' : '#dc2626',
      beats: [{
        drawScene: (ctx, fc) => drawCrewBattleScene(ctx, fc, lookFromChar(char), crew.name),
        lines: result.won ? [
          `vs ${crew.name}.`,
          ...summaryLines,
          `Final: ${result.ourScore}–${result.theirScore}.`,
          'You took the building. Your crew is howling. Drinks tonight are free.',
        ] : [
          `vs ${crew.name}.`,
          ...summaryLines,
          `Final: ${result.ourScore}–${result.theirScore}.`,
          'You held your own. Not enough. Next round, next month.',
        ],
      }],
    }), 50);
    showToast(result.won ? `Crew win! +${crew.reward.followers} fans, +$${crew.reward.cash}` : 'Crew loss · -3 fans, mood -10', result.won ? 'win' : 'bad');
  };
  const doKaraoke = () => {
    if (char.energy < 8) { showToast('Too tired to sing', 'bad'); return; }
    if ((char.sickDay || 0) === char.day) { showToast('Lost your voice — call it a night', 'bad'); return; }
    const earn = 4 + Math.floor(Math.random() * 5);
    const musGain = 1 + (Math.random() < 0.25 ? 1 : 0);
    setChar(c => {
      const t = passMinutes(c, 30);
      return { ...c, ...t,
        cash: c.cash + earn,
        energy: Math.max(0, c.energy - 8),
        mood: Math.min(100, t.mood + 6),
        stats: { ...c.stats, mus: c.stats.mus + musGain },
        xp: c.xp + 5 };
    });
    showToast(`Karaoke: +${musGain} musicality, +$${earn}`, 'win');
  };
  // Karaoke Challenge — 3-song streak with rising difficulty. Each "round" is a
  // skill check vs (mus + sho) + random — fail any and you bow out with what
  // you've got. Pure narrative resolution, no minigame UI.
  const doKaraokeChallenge = () => {
    if (char.energy < 24) { showToast('Need 24 energy for the challenge', 'bad'); return; }
    if ((char.sickDay || 0) === char.day) { showToast('Lost your voice — call it a night', 'bad'); return; }
    const stats = char.stats || {};
    const skill = (stats.mus || 0) + Math.floor((stats.sho || 0) / 2);
    let rounds = 0;
    const log = [];
    for (let i = 0; i < 3; i++) {
      const target = 5 + i * 6;
      const roll = skill + Math.floor(Math.random() * 12) - 4;
      if (roll >= target) { rounds++; log.push(`Round ${i+1}: nailed it (${roll} vs ${target})`); }
      else { log.push(`Round ${i+1}: cracked (${roll} vs ${target})`); break; }
    }
    const baseEarn = rounds * 14 + Math.floor(Math.random() * 8);
    const fanGain = rounds >= 3 ? 5 : rounds >= 1 ? 1 : 0;
    const musGain = 1 + Math.floor(rounds / 2);
    setChar(c => {
      const t = passMinutes(c, 30 + rounds * 10);
      return checkLevelUp({ ...c, ...t,
        cash: c.cash + baseEarn,
        followers: c.followers + fanGain,
        energy: Math.max(0, c.energy - 24),
        mood: Math.min(100, t.mood + (rounds >= 3 ? 14 : rounds >= 1 ? 6 : -4)),
        stats: { ...c.stats, mus: c.stats.mus + musGain, sho: c.stats.sho + 1 },
        xp: c.xp + (8 + rounds * 4) });
    });
    showToast(rounds === 3 ? `Karaoke 3-streak! +$${baseEarn}, +${fanGain} fans` : rounds >= 1 ? `Karaoke ${rounds}/3 · +$${baseEarn}` : 'Choked on round 1', rounds >= 1 ? 'win' : 'bad');
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
    // Reward roughly quartered from the original tuning. Early game (stats
    // around 5/5/5) tops out near $165 with a perfect performance; mid-game
    // (15/15/15) maxes ~$360; late game (25/25/25) maxes ~$435. The cap is
    // baseReward * 3 (engagement 2x * variety 1.5x).
    const baseReward = 30 + sho * 3 + mus + tec;
    const engagement = Math.min(2, totalTaps / 30);
    const variety = Math.min(1.5, distinctSounds / 4);
    const reward = Math.round(baseReward * Math.max(0.5, engagement) * Math.max(0.7, variety));
    const fans = Math.max(2, Math.floor(sho / 2 + distinctSounds));
    setChar(c => {
      const wardrobeBonus = hasGear(c, 'wardrobe_refresh') ? 1 : 0;
      const t = passMinutes(c, 30); // 30 in-game min performance
      const updated = {
        ...c, ...t,
        cash: c.cash + reward,
        followers: c.followers + fans,
        energy: Math.max(0, c.energy - 25),
        mood: Math.min(100, t.mood + 18),
        heat: (c.heat || 0) + 8,
        xp: c.xp + 60,
        showcaseBooking: null,
        lastShowcaseDay: c.day,
        stats: { ...(c.stats || {}), sho: (c.stats?.sho || 0) + wardrobeBonus },
        daily: { ...(c.daily || {}), showcases: (c.daily?.showcases || 0) + 1 },
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
  if (performingOpenMic) {
    return <OpenMicPerformance char={char} onComplete={finishOpenMic} />;
  }
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

      {/* Festival arc — invite, prep countdown, and the event button */}
      {char.festivalState === 'invited' && (
        <Panel title="🌟 BBBWC2027">
          <div className="space-y-2">
            <div className="text-stone-300 text-xs italic leading-snug" style={{ fontFamily: '"Oswald", sans-serif' }}>
              "Rohzel slides paperwork across the bar. <br/>
              World championship. Three weeks to prepare. They want you."
            </div>
            <div className="flex gap-2">
              <Btn variant="primary" className="flex-1 py-2"
                onClick={() => {
                  setChar(c => ({ ...c, festivalState: 'prepping', festivalAcceptedDay: c.day }));
                  setTimeout(() => playCutscene?.({
                    speaker: 'ROHZEL',
                    speakerColor: '#22d3ee',
                    beats: [{ lines: [
                      "good. fourteen days from today.",
                      "training gives double the gains till then.",
                      "don't waste it.",
                    ]}],
                  }), 100);
                }}>
                ACCEPT THE INVITE ✓
              </Btn>
              <Btn className="flex-1 py-2"
                onClick={() => showToast('Rohzel: come back when you decide.', 'info')}>
                NOT YET
              </Btn>
            </div>
          </div>
        </Panel>
      )}
      {char.festivalState === 'prepping' && (() => {
        const daysIn = char.day - (char.festivalAcceptedDay || char.day);
        const daysLeft = Math.max(0, FESTIVAL_PREP_DAYS - daysIn);
        const ready = daysLeft === 0;
        return (
          <Panel title="🌟 BBBWC2027 PREP">
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-widest text-amber-500">
                {ready ? 'TONIGHT IS THE NIGHT' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} to go · 2× training gains`}
              </div>
              {ready && (
                <Btn variant="primary" className="w-full py-3"
                  onClick={() => {
                    setTimeout(() => playCutscene?.({
                      speaker: 'BBBWC2027',
                      speakerColor: '#fbbf24',
                      beats: [{ lines: [
                        "The room is bigger than anything you've played.",
                        "Crew on the side. Sound check. Pick your path.",
                      ]}],
                      onComplete: () => {},
                    }), 50);
                    // open the path picker via a temporary screen flag
                    setChar(c => ({ ...c, festivalState: 'choosing' }));
                  }}>
                  GO TO BBBWC →
                </Btn>
              )}
            </div>
          </Panel>
        );
      })()}
      {char.festivalState === 'choosing' && (
        <Panel title="🌟 BBBWC2027 — PICK YOUR PATH">
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-widest text-stone-500">
              Each path: one big show. Win or lose, the arc closes.
            </div>
            {[
              { id: 'A', label: 'Solo Battle Gauntlet', desc: '3 escalating opponents · highest cash · classic battle UI' },
              { id: 'B', label: 'Collab with Crystix',   desc: 'duet showcase · highest fan gain', requires: c => !!c.storyFlags?.crystixMet, lock: 'Need to have met Crystix' },
              { id: 'C', label: 'Solo Showcase',         desc: 'judges, no opponents · balanced reward' },
            ].map(p => {
              const locked = p.requires && !p.requires(char);
              return (
                <button key={p.id} disabled={locked} onClick={() => runFestival(p.id)}
                  className={`w-full p-2 text-left border-2 ${locked ? 'border-stone-900 bg-stone-950/40 opacity-40' : 'border-stone-800 bg-stone-900/30 hover:border-amber-500'}`}>
                  <div className="text-amber-500 text-sm uppercase tracking-widest" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
                    {locked ? '🔒 ' : ''}{p.label}
                  </div>
                  <div className="text-[10px] text-stone-500 uppercase tracking-wider">
                    {locked ? p.lock : p.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </Panel>
      )}
      {char.festivalState === 'done' && (
        <Panel title="🌟 BBBWC2027 — done">
          <div className="text-[10px] uppercase tracking-widest text-amber-500 text-center py-1">
            you played the festival. {char.festivalResult === 'win' ? 'and you won.' : 'and you came home.'}
          </div>
        </Panel>
      )}

      {/* Out-of-town tour — gated by 50 followers, 7-day cooldown */}
      {(char.followers || 0) >= 50 && (() => {
        const cooled = (char.day - (char.lastTourDay || 0)) >= 7;
        const onCooldown = !cooled;
        const daysLeft = Math.max(0, 7 - (char.day - (char.lastTourDay || 0)));
        const goTour = () => {
          if (onCooldown || (char.energy || 0) < 30) return;
          const sho = char.stats?.sho || 0;
          const fans = 6 + Math.floor(sho / 2) + Math.floor(Math.random() * 6);
          const cash = 60 + sho * 4 + Math.floor(Math.random() * 30);
          setChar(c => ({
            ...c,
            day: c.day + 2,
            minutes: 0,
            cash: (c.cash || 0) + cash,
            followers: (c.followers || 0) + fans,
            energy: Math.floor((c.maxEnergy ?? 100) * 0.7),
            hunger: Math.max(0, (c.hunger || 0) - 30),
            mood: _clampPct((c.mood || 0) + 8),
            lastTourDay: c.day,
          }));
          go('hood');
          const tourLook = lookFromChar(char);
          setTimeout(() => playCutscene?.({
            speaker: 'WEEKEND TOUR',
            speakerColor: '#fbbf24',
            beats: [
              {
                drawScene: (ctx, fc) => drawTourRoadScene(ctx, fc, tourLook),
                lines: [
                  "Two days on the road. Two cities, two crowds.",
                  "Sun going down behind the skyline. Speakers strapped tight.",
                ],
              },
              {
                drawScene: (ctx, fc) => drawTourMotelScene(ctx, fc, tourLook),
                lines: [
                  "Bus seats. Cheap motel. Better sound system than home.",
                  "1:47am. Headphones on. Going through tomorrow's set one more time.",
                ],
              },
              {
                drawScene: (ctx, fc) => drawTourStageScene(ctx, fc, tourLook),
                lines: [
                  "Lights. Confetti. People who came just for you.",
                  `+$${cash} · +${fans} fans · two days gone.`,
                ],
              },
            ],
          }), 100);
        };
        return (
          <Panel title="Weekend Tour">
            <div className="space-y-2">
              <div className="text-[10px] text-stone-500 uppercase tracking-wider">
                Two cities, one weekend. Bigger crowds. Bigger payday.
              </div>
              <Btn variant="primary" onClick={goTour}
                disabled={onCooldown || (char.energy || 0) < 30}
                className="w-full py-3">
                {onCooldown ? `🚐 ON THE ROAD COOLDOWN · ${daysLeft}d`
                            : '🚐 GO ON TOUR (-30⚡, +2 days)'}
              </Btn>
              {(char.energy || 0) < 30 && !onCooldown && (
                <div className="text-[10px] text-red-500 text-center uppercase">Need 30 energy</div>
              )}
            </div>
          </Panel>
        );
      })()}

      {/* Closed Mondays */}
      {schedule.activity === 'closed' && (
        <Panel title="Closed">
          <div className="text-center py-4 space-y-2">
            <div className="text-5xl">🚪</div>
            <div className="text-xs text-stone-400 uppercase tracking-wider">No show tonight. Sleep it off and come back tomorrow.</div>
          </div>
        </Panel>
      )}

      {/* Mingle — chat with whoever's at the bar. Gated by day-5 unlock. */}
      {schedule.activity !== 'closed' && isUnlocked(char, 'mingle') && (
        <Panel title="Mingle">
          <div className="space-y-2">
            <div className="text-[10px] text-stone-500 uppercase tracking-wider">
              Read the room. Strike up a conversation. Sometimes you meet someone who matters.
            </div>
            <Btn variant="primary" onClick={startMingle} disabled={char.energy < 6} className="w-full py-3">
              MINGLE 🍻 (-6⚡, +30 min)
            </Btn>
            {char.energy < 6 && <div className="text-[10px] text-red-500 text-center uppercase">Need 6 energy</div>}
          </div>
        </Panel>
      )}
      {schedule.activity !== 'closed' && !isUnlocked(char, 'mingle') && (
        <Panel title="Mingle 🔒">
          <div className="text-[10px] text-stone-600 uppercase tracking-wider text-center py-1">
            {CONTENT_UNLOCKS.mingle.label}
          </div>
        </Panel>
      )}

      {/* The encounter modal — mounts when the player triggers Mingle. */}
      {mingleEncounter && (
        <MingleEncounter
          char={char} setChar={setChar} encounter={mingleEncounter}
          showToast={showToast} onClose={() => setMingleEncounter(null)} />
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

      {schedule.activity === 'battle' && !battleOnCooldown && (char.defeated || []).length >= 3 && (
        <Panel title="Crew Battle (3v3)">
          <div className="space-y-2">
            <div className="text-[10px] text-stone-500 uppercase tracking-wider">
              Bring two friends. Best of 3 rounds. Bigger wins, longer night.
            </div>
            {CREWS.map(crew => {
              const locked = (char.defeated || []).length < crew.minDefeated;
              const won = !!char.storyFlags?.[`crew_${crew.id}_won`];
              return (
                <button key={crew.id} onClick={() => !locked && doCrewBattle(crew)} disabled={locked || char.energy < 30}
                  className={`w-full p-3 border-2 text-left transition-all ${
                    locked ? 'border-stone-900 bg-stone-950 opacity-40 cursor-not-allowed' :
                    won ? 'border-green-900/50 bg-green-950/20 hover:border-amber-500' :
                    'border-stone-800 bg-stone-900/30 hover:border-amber-500'
                  }`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="text-amber-500 tracking-wider" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
                        {crew.name}
                      </div>
                      {won && <Trophy size={12} className="text-green-500" />}
                      {locked && <span className="text-[10px] text-stone-600">🔒 beat {crew.minDefeated} solo</span>}
                    </div>
                    <div className="text-[10px] text-stone-500">+${crew.reward.cash} · +{crew.reward.followers} fans</div>
                  </div>
                  <div className="text-[10px] text-stone-500 leading-snug">{crew.desc}</div>
                </button>
              );
            })}
            {char.energy < 30 && <div className="text-[10px] text-red-500 text-center uppercase">Need 30 energy</div>}
          </div>
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
            <div className="text-[10px] text-stone-500 uppercase tracking-wider mt-2">
              Or try the 3-song streak — bigger reward, harder each round.
            </div>
            <Btn variant="primary" onClick={doKaraokeChallenge} disabled={char.energy < 24} className="w-full py-3">
              KARAOKE CHALLENGE 🏆 (-24⚡)
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
  } else if (look.accessory === 'glasses') {
    // Round glasses — two circles with a bridge
    px(-3, -23, 2, 2, '#1a1a1a');
    px(1, -23, 2, 2, '#1a1a1a');
    px(-1, -22, 2, 1, '#1a1a1a');
    if (!blink) {
      px(-2, -22, 1, 1, '#fafafa');
      px(2, -22, 1, 1, '#fafafa');
    }
  } else if (!blink) {
    px(-3, -23, 1, 1, '#1a1a2e');
    px(1, -23, 1, 1, '#1a1a2e');
  }
  // Hat accessories layered over hair
  if (look.accessory === 'cap') {
    px(-5, -28, 10, 2, '#dc2626'); // crown
    px(-5, -28, 10, 1, '#fbbf24'); // band
    px(facing === 'right' ? 4 : -8, -27, 4, 1, '#dc2626'); // brim
  } else if (look.accessory === 'beanie') {
    px(-4, -29, 8, 4, '#1a1a1a');
    px(-4, -27, 8, 1, '#fbbf24');
    px(-1, -30, 2, 1, '#1a1a1a');
  } else if (look.accessory === 'fedora') {
    px(-6, -29, 12, 1, '#1a1a1a');
    px(-4, -31, 8, 2, '#1a1a1a');
    px(-3, -28, 6, 1, '#fbbf24');
  } else if (look.accessory === 'headphones') {
    // Headphones over the head
    px(-5, -27, 1, 5, '#1a1a1a');
    px(4, -27, 1, 5, '#1a1a1a');
    px(-4, -28, 8, 1, '#1a1a1a');
    px(-6, -25, 1, 3, '#dc2626');
    px(4, -25, 1, 3, '#dc2626');
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
const lookFromChar = (char) => {
  const accId = char?.accessory || 'none';
  const acc = ACCESSORIES[accId];
  const isUnlocked = acc && (() => { try { return acc.cond(char); } catch { return false; } })();
  return {
    shirt: activeOutfitShirt(char),
    skin:  char?.skin || '#d4a87a',
    hair:  char?.hairColor || '#1a1a2e',
    style: char?.hairStyle || 'short',
    accessory: isUnlocked ? acc.id : null,
  };
};

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

// Full-overlay splash that slams in when the player triggers a finisher at the
// end of a round. Big slab text, scanline flash, ember rain.
const FinisherSplash = ({ name, bonus, peak }) => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = 200, H = 120, S = 3;
    canvas.width = W * S; canvas.height = H * S;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    let raf, fc = 0;
    const sparks = [];
    for (let i = 0; i < 22; i++) {
      sparks.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.6,
        vy: -0.6 - Math.random() * 1.2,
        ttl: 60 + Math.random() * 40,
        life: 0,
        c: ['#fef3c7', '#fbbf24', '#f97316', '#dc2626'][Math.floor(Math.random() * 4)],
      });
    }
    const loop = () => {
      fc++;
      ctx.save();
      ctx.scale(S, S);
      // Backdrop — pulsing red-orange radial-feeling gradient via rings
      ctx.fillStyle = '#1a0612';
      ctx.fillRect(0, 0, W, H);
      const ringAlpha = 0.18 + 0.10 * Math.sin(fc * 0.15);
      ctx.fillStyle = `rgba(220,38,38,${ringAlpha})`;
      ctx.fillRect(0, 0, W, H);
      // Radial pulse rings from center
      for (let r = 0; r < 4; r++) {
        const phase = ((fc + r * 12) % 60) / 60;
        ctx.globalAlpha = (1 - phase) * 0.6;
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(W / 2, H / 2, 10 + phase * 90, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // Diagonal speed-line overlay scrolling
      for (let i = 0; i < 14; i++) {
        const lx = ((i * 18 + fc * 4) % (W + 60)) - 30;
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = '#fef3c7';
        ctx.fillRect(lx, 0, 2, H);
        ctx.globalAlpha = 1;
      }
      // Sparks rising
      for (const s of sparks) {
        s.life++;
        s.x += s.vx; s.y += s.vy;
        if (s.life > s.ttl || s.y < -4) { s.x = Math.random() * W; s.y = H + 4; s.life = 0; s.vy = -0.6 - Math.random() * 1.2; continue; }
        const t = s.life / s.ttl;
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = s.c;
        ctx.fillRect(Math.floor(s.x), Math.floor(s.y), 1, 1);
        ctx.globalAlpha = 1;
      }
      // Bottom flame strip
      for (let i = 0; i < 22; i++) {
        const fx = i * 9 + 4;
        const fy = H - 14 - Math.floor(Math.sin((fc + i * 12) * 0.2) * 3);
        _px(ctx, fx - 1, fy + 4, 4, 10, '#dc2626');
        _px(ctx, fx, fy + 2, 2, 10, '#f97316');
        _px(ctx, fx, fy, 1, 6, '#fbbf24');
        if ((fc + i) % 4 < 2) _px(ctx, fx, fy - 2, 1, 2, '#fef3c7');
      }
      // Big slab title
      ctx.fillStyle = '#0c0a09';
      ctx.font = 'bold 26px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('FINISHER!', W / 2 + 1, 50);  // shadow
      const flicker = (fc % 8) < 4 ? '#fef3c7' : '#fbbf24';
      ctx.fillStyle = flicker;
      ctx.fillText('FINISHER!', W / 2, 49);
      // Move name
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = '#fef3c7';
      ctx.fillText(`★ ${name} ★`, W / 2, 64);
      // Stats line
      ctx.font = 'bold 7px monospace';
      ctx.fillStyle = '#a8a29e';
      ctx.fillText(`${peak} PERFECT IN A ROW · BONUS +${bonus}`, W / 2, 78);
      ctx.restore();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [name, bonus, peak]);
  return (
    <div className="absolute inset-0 flex items-center justify-center"
      style={{ animation: 'finisherSlam 0.4s ease-out' }}>
      <canvas ref={canvasRef} className="w-full h-full" style={{ imageRendering: 'pixelated' }} />
      <style>{`
        @keyframes finisherSlam {
          0% { transform: scale(0.6); opacity: 0; }
          40% { transform: scale(1.1); opacity: 1; }
          70% { transform: scale(0.98); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

const PixelStage = ({ char, opponent, activeSide, currentSound, soundColor, judgeVotes, revealedJudges, judgeHearts = [0,0,0,0,0], comboLabel = null, playerStreak = 0 }) => {
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
    propsRef.current = { activeSide, currentSound, soundColor, judgeVotes, revealedJudges, playerStreak };
    activeSideRef.current = activeSide;
  }, [activeSide, currentSound, soundColor, judgeVotes, revealedJudges, playerStreak]);

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
      // If the player is on a perfect streak, paint a flame aura BEHIND them so
      // the sprite reads on top.
      const ps = propsRef.current.playerStreak || 0;
      if (ps >= 4) {
        const auraIntensity = Math.min(1, (ps - 4) / 6 + 0.4);  // 4 → 0.4, 10 → 1.0
        const auraR = 16 + Math.min(8, ps - 4);
        const cx = 60, cy = 78;
        // Outer glow halo (orange)
        ctx.globalAlpha = 0.18 * auraIntensity;
        ctx.fillStyle = '#f97316';
        ctx.beginPath(); ctx.arc(cx, cy, auraR + 4, 0, Math.PI * 2); ctx.fill();
        // Inner glow (gold)
        ctx.globalAlpha = 0.30 * auraIntensity;
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(cx, cy, auraR, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        // Pixel flame tongues licking up around the body
        const flameColors = ['#fef3c7', '#fbbf24', '#f97316', '#dc2626'];
        const flameCount = 7 + Math.min(6, ps - 4);
        for (let i = 0; i < flameCount; i++) {
          const angle = (i / flameCount) * Math.PI * 2 + frameCount * 0.04;
          const wob = Math.sin((frameCount + i * 11) * 0.18) * 2;
          const dist = auraR - 2 + wob;
          const fx = Math.floor(cx + Math.cos(angle) * dist);
          const fy = Math.floor(cy + Math.sin(angle) * dist - 2);
          // Layered flame: outer red, mid orange, core gold, tip white
          _px(ctx, fx - 1, fy - 4, 3, 6, flameColors[3]);     // red outer
          _px(ctx, fx, fy - 5, 2, 5, flameColors[2]);         // orange
          _px(ctx, fx, fy - 6, 1, 4, flameColors[1]);         // gold
          if ((frameCount + i) % 4 < 2) _px(ctx, fx, fy - 7, 1, 2, flameColors[0]); // tip
        }
        // Rising ember sparks
        for (let i = 0; i < 4; i++) {
          const phase = ((frameCount + i * 11) % 30) / 30;
          const ex = cx + Math.sin((frameCount + i * 17) * 0.1) * (12 + phase * 6);
          const ey = cy - 8 - phase * 22;
          ctx.globalAlpha = (1 - phase) * auraIntensity;
          _px(ctx, Math.floor(ex), Math.floor(ey), 1, 1, phase < 0.4 ? '#fef3c7' : '#fbbf24');
          ctx.globalAlpha = 1;
        }
        // FINISHER threshold: extra "charged" overlay on the body
        if (ps >= FINISHER_THRESHOLD) {
          if (frameCount % 12 < 6) {
            ctx.globalAlpha = 0.4;
            ctx.fillStyle = '#fef3c7';
            _px(ctx, cx - 8, cy - 14, 16, 28, '#fef3c7');
            ctx.globalAlpha = 1;
          }
          // "ARMED" text floating above
          ctx.fillStyle = '#fef3c7';
          ctx.font = 'bold 6px monospace';
          ctx.textAlign = 'center';
          const bob = Math.floor(Math.sin(frameCount * 0.2) * 1);
          ctx.fillText('⚡ ARMED', cx, 50 + bob);
        }
      }
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
// Hype label bands keyed off the score gap between player and opponent.
// Used in the HUD for the live momentum indicator (no exact numbers).
const _hypeLabel = (gap) => {
  if (gap >= 60) return { text: 'CROWD GOES WILD', color: '#fbbf24' };
  if (gap >= 25) return { text: 'YOU\'RE COOKING', color: '#fbbf24' };
  if (gap >= 8)  return { text: 'EDGE: YOU', color: '#a3e635' };
  if (gap > -8)  return { text: 'NECK AND NECK', color: '#a8a29e' };
  if (gap > -25) return { text: 'OPP HAS THE EDGE', color: '#fb923c' };
  if (gap > -60) return { text: 'SHAKE IT OFF', color: '#fb7185' };
  return { text: 'BURIED', color: '#dc2626' };
};

// Finisher arms once the player chains FINISHER_THRESHOLD perfect hits.
const FINISHER_THRESHOLD = 8;

const BattleHUD = ({ char, opponent, timeLeft, pScore, oScore, streak = 0, finisherArmed = false }) => {
  const playerSounds = char.equipped.slice(0, 5).map(id => SOUND_CATALOG[id]);
  const oppSounds = opponent.sounds.slice(0, 5).map(id => SOUND_CATALOG[id]);
  // Hype: relative score gap mapped to -100..+100, clamped.
  const gap = pScore - oScore;
  const hypePct = Math.max(-100, Math.min(100, (gap / 80) * 100));
  const hype = _hypeLabel(gap);
  const finisherFill = Math.min(100, (streak / FINISHER_THRESHOLD) * 100);
  return (
    <div className="space-y-1.5 mb-2">
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
        {/* Player */}
        <div>
          <div className="flex items-center justify-between">
            <div className="text-amber-500 text-xs tracking-wider truncate" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
              {char.name.toUpperCase()}
            </div>
            {streak > 0 && (
              <div className={`text-[9px] uppercase tracking-widest font-bold ${streak >= FINISHER_THRESHOLD ? 'text-amber-300 animate-pulse' : streak >= 4 ? 'text-amber-400' : 'text-stone-500'}`}>
                {streak >= 4 ? '🔥 ' : ''}×{streak}
              </div>
            )}
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

      {/* HYPE meter — symmetric momentum bar without exact numbers */}
      <div className="px-1">
        <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.3em] text-stone-500 mb-0.5">
          <span>OPP</span>
          <span style={{ color: hype.color, fontWeight: 'bold' }}>{hype.text}</span>
          <span>YOU</span>
        </div>
        <div className="relative h-2 bg-stone-900 border border-stone-800">
          {/* Center marker */}
          <div className="absolute top-0 bottom-0 left-1/2 w-px bg-stone-700" />
          {/* Fill: starts at center, extends right (player lead) or left (opp lead) */}
          {hypePct >= 0 ? (
            <div className="absolute top-0 bottom-0 left-1/2 bg-amber-500"
              style={{ width: `${hypePct / 2}%`, transition: 'width 0.4s' }} />
          ) : (
            <div className="absolute top-0 bottom-0 bg-red-600"
              style={{ left: `${50 + hypePct / 2}%`, width: `${-hypePct / 2}%`, transition: 'all 0.4s' }} />
          )}
        </div>
      </div>

      {/* Finisher gauge — visible while player streak is building or armed */}
      {(streak > 0 || finisherArmed) && (
        <div className="px-1">
          <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.3em] mb-0.5">
            <span className={finisherArmed ? 'text-amber-300 font-bold' : 'text-stone-500'}>
              {finisherArmed ? '⚡ FINISHER ARMED' : 'FINISHER'}
            </span>
            <span className="text-stone-600">{Math.min(streak, FINISHER_THRESHOLD)}/{FINISHER_THRESHOLD} perfects</span>
          </div>
          <div className="h-1 bg-stone-900 border border-stone-800">
            <div className={`h-full ${finisherArmed ? 'bg-amber-300' : 'bg-amber-600'}`}
              style={{ width: `${finisherFill}%`, transition: 'width 0.2s', boxShadow: finisherArmed ? '0 0 8px #fbbf24' : 'none' }} />
          </div>
        </div>
      )}
    </div>
  );
};

// ============ BEATBOX AUDIO SYNTH ============
// Synthesizes beatbox-style sounds in-browser using Web Audio API.
// No external samples — keeps the artifact self-contained.

let _audioCtx = null;
const getAudioCtx = () => {
  if (typeof window === 'undefined') return null;
  // Honor the player's mute setting — every audio helper in the game routes
  // through this getter, so returning null here kills all WebAudio cleanly.
  if (getSettings().muted) return null;
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
// "Cock-a-doodle-doo" via short oscillator notes — wake-up sound
const playRooster = () => {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const note = (freq, start, dur, type = 'sawtooth', vol = 0.14) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(vol, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur);
  };
  // "ki - ke - ri - kiiiiii"
  note(880, t0,        0.13);
  note(1100, t0 + 0.16, 0.13);
  note(990, t0 + 0.34, 0.16);
  note(770, t0 + 0.55, 0.65, 'sawtooth', 0.16);
};

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

// Quick helper: schedule a sine "blip" at freq starting at time t for `dur`s
// with a small attack + exponential decay envelope. Used by the polish stings.
const _blip = (ctx, t, freq, dur = 0.18, gainPeak = 0.22, type = 'sine') => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(gainPeak, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
};

// Level-up fanfare: rising arpeggio + held final note. Major triad.
const playLevelUp = () => {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  // C5 → E5 → G5 → C6 sweep
  _blip(ctx, t,        523.25, 0.16, 0.22, 'triangle');
  _blip(ctx, t + 0.10, 659.25, 0.16, 0.22, 'triangle');
  _blip(ctx, t + 0.20, 783.99, 0.16, 0.22, 'triangle');
  _blip(ctx, t + 0.30, 1046.5, 0.55, 0.26, 'triangle');
  // Sparkle layer — fifth above held final note
  _blip(ctx, t + 0.32, 1568.0, 0.40, 0.10, 'sine');
};

// Achievement: short, bright two-note chime (kalimba-ish).
const playAchievement = () => {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  _blip(ctx, t,        880,    0.30, 0.20, 'sine');
  _blip(ctx, t + 0.08, 1318.5, 0.45, 0.18, 'sine');
};

// Sound unlock: single soft "ding" (lower than achievement).
const playUnlock = () => {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  _blip(ctx, t,        659.25, 0.30, 0.18, 'sine');
  _blip(ctx, t + 0.06, 987.77, 0.45, 0.16, 'sine');
};

// Battle victory sting: confident I-V-I cadence.
const playWinSting = () => {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  // C5 - E5 - G5 - high C6 hold
  _blip(ctx, t,        523.25, 0.18, 0.24, 'triangle');
  _blip(ctx, t + 0.14, 659.25, 0.18, 0.24, 'triangle');
  _blip(ctx, t + 0.28, 783.99, 0.18, 0.24, 'triangle');
  _blip(ctx, t + 0.42, 1046.5, 0.70, 0.28, 'triangle');
  _blip(ctx, t + 0.42, 1318.5, 0.70, 0.18, 'triangle');  // 3rd above for richness
};

// Battle defeat sting: descending minor third, somber.
const playLossSting = () => {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  _blip(ctx, t,        440.0, 0.30, 0.22, 'sine');
  _blip(ctx, t + 0.20, 369.99, 0.55, 0.20, 'sine');  // F#4 → minor feel
  _blip(ctx, t + 0.50, 293.66, 0.85, 0.18, 'sine');
};

// ============ SCREEN: BATTLE ============

function BattleScreen({ char, setChar, go, showToast, checkLevelUp, playCutscene }) {
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
  // Live perfect-hit streak for the player (resets between rounds; drives aura,
  // hype, and the FINISHER trigger when it reaches FINISHER_THRESHOLD).
  const [streak, setStreak] = useState(0);
  // Set true when streak hits FINISHER_THRESHOLD during the round; latches until
  // the round ends so the bar keeps glowing even if the chain breaks.
  const [finisherArmed, setFinisherArmed] = useState(false);
  // Finisher splash overlay state. When non-null, full-screen splash is drawn
  // over the stage with the prepared move's name and a bonus score.
  const [finisher, setFinisher] = useState(null);
  // Pattern picks (lesson indexes) for each side's two rounds. [first turn, second turn]
  const [playerPatternIdxs, setPlayerPatternIdxs] = useState(null);
  const [oppPatternIdxs, setOppPatternIdxs] = useState(null);
  // Which player slot we're currently editing in the tactical screen (0 or 1)
  const [tacticalSlot, setTacticalSlot] = useState(0);
  const opponent = char._opponent;
  const eventTimers = useRef([]);
  const playerScoreRef = useRef(0);
  const oppScoreRef = useRef(0);
  // Used to scroll the BeatboxHero canvas + pads into view at the start of a
  // player round, so the buttons aren't half-hidden below the fold.
  const playerHeroRef = useRef(null);
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

  // Build a 16-beat combo lesson from two lesson indexes. Half A plays first
  // (beats 0..7), half B follows (beats 8..15, shifted). Combo uses A's lanes;
  // notes from B that use sounds outside those lanes are dropped.
  const combineLessons = (idxA, idxB) => {
    const a = HERO_LESSONS[idxA];
    if (!a) return null;
    const lanes = a.lanes || HERO_LANES;
    const aHalf = a.pattern.filter(n => n.beat < 8).map(n => ({ ...n }));
    const b = (idxB != null && idxB !== idxA) ? HERO_LESSONS[idxB] : null;
    let bHalf;
    let name;
    if (b) {
      const laneSet = new Set(lanes);
      bHalf = b.pattern
        .filter(n => n.beat < 8 && laneSet.has(n.sound))
        .map(n => ({ beat: n.beat + 8, sound: n.sound }));
      name = `${a.name} → ${b.name}`;
    } else {
      // Same pattern twice
      bHalf = a.pattern.filter(n => n.beat < 8).map(n => ({ beat: n.beat + 8, sound: n.sound }));
      name = a.name;
    }
    return {
      name,
      desc: a.desc,
      tier: Math.max(a.tier || 1, (b?.tier) || 1),
      requires: a.requires,
      lanes,
      pattern: [...aHalf, ...bHalf],
      patternBeats: 16,
    };
  };

  // Which combo lesson plays in round n
  const lessonForRound = (n) => {
    const side = sideForRound(n);
    const slot = turnSlotForRound(n);
    const ids = (side === 'P' ? playerPatternIdxs : oppPatternIdxs)?.[slot];
    if (!Array.isArray(ids)) return null;
    return combineLessons(ids[0], ids[1]);
  };

  // Lesson scoring weight: longer + higher tier patterns are worth more
  const lessonValue = (lesson) => {
    if (!lesson) return 0;
    const tier = lesson.tier || 1;
    return Math.round(lesson.pattern.length * (1 + tier * 0.4));
  };
  // Per-round style matchup: avg counter multiplier across both player picks
  // vs opp's matching turn slot picks. >1 = player counters; <1 = countered.
  const styleMatchupForRound = (n, asPlayer) => {
    const slot = turnSlotForRound(n);
    const me = (asPlayer ? playerPatternIdxs : oppPatternIdxs)?.[slot];
    const them = (asPlayer ? oppPatternIdxs : playerPatternIdxs)?.[slot];
    if (!Array.isArray(me) || !Array.isArray(them)) return 1;
    let sum = 0;
    for (let i = 0; i < me.length; i++) {
      const myStyle = HERO_LESSONS[me[i]]?.style;
      const theirStyle = HERO_LESSONS[them[i]]?.style;
      sum += styleMatchup(myStyle, theirStyle);
    }
    return sum / me.length;
  };

  const playerRoundScore = (lesson, accuracy, roundN) => {
    if (!lesson) return 0;
    const base = lessonValue(lesson);
    const statMult = 1 + (char.stats.tec + char.stats.mus) / 80;
    const counter = roundN ? styleMatchupForRound(roundN, true) : 1;
    return Math.round(base * accuracy * statMult * counter);
  };
  const oppRoundScore = (lesson, roundN) => {
    if (!lesson) return 0;
    const base = lessonValue(lesson);
    // Opp focus tightened — they're now genuinely good (was 0.55–0.95).
    const focus = 0.7 + (opponent.stats.tec / 60) * 0.3;
    const statMult = 1 + (opponent.stats.tec + opponent.stats.mus) / 80;
    const counter = roundN ? styleMatchupForRound(roundN, false) : 1;
    return Math.round(base * focus * statMult * counter);
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

  // Default pattern picks per turn — TWO patterns per round now (each is half-length
  // so two combine to fill the round). Player gets first 4 distinct playables.
  const computeDefaultPlayerPicks = () => {
    const p = playablePlayerIdxs;
    const a = p[0] ?? 0;
    const b = p[1] ?? a;
    const c = p[2] ?? b;
    const d = p[3] ?? c;
    return [[a, b], [c, d]];
  };
  const computeOppPicks = () => {
    const oppLevel = opponent.level || 1;
    const maxIdx = Math.max(0, Math.min(HERO_LESSONS.length - 1, oppLevel + 1));
    const pool = []; for (let i = 0; i <= maxIdx; i++) pool.push(i);
    const pick = () => pool[Math.floor(Math.random() * pool.length)];
    return [[pick(), pick()], [pick(), pick()]];
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
      setPhase('tactical');
    }, 1400);
  };

  // Keyboard shortcuts for RPS: 1=rock, 2=paper, 3=scissors (only while picking).
  useEffect(() => {
    if (phase !== 'rps' || rps) return;
    return onGlobalKey((e) => {
      const map = { '1': 'rock', '2': 'paper', '3': 'scissors',
                    'Digit1': 'rock', 'Digit2': 'paper', 'Digit3': 'scissors' };
      const choice = map[e.key] || map[e.code];
      if (choice) playRps(choice);
    });
  }, [phase, rps]);

  // Enter RPS phase from intro: pre-compute picks for both sides (player can change theirs in tactical).
  const startBattle = () => {
    getAudioCtx();
    setPlayerPatternIdxs(computeDefaultPlayerPicks());
    setOppPatternIdxs(computeOppPicks());
    setTacticalSlot(0);
    setPhase('rps');
  };

  // Counter style: which style beats `style`? (e.g. SNARE beats BOOM, so counterStyleOf('BOOM') === 'SNARE')
  const counterStyleOf = (style) => {
    if (!style) return null;
    return Object.keys(STYLE_BEATS).find(k => STYLE_BEATS[k] === style) || null;
  };

  // Opponent re-rolls picks to counter the player's locked-in picks. Per pick,
  // probability=counterSkill of choosing a counter-style; otherwise random from level pool.
  const oppCounterReroll = (playerPicks, opp) => {
    const oppLevel = opp.level || 1;
    const maxIdx = Math.max(0, Math.min(HERO_LESSONS.length - 1, oppLevel + 1));
    const pool = []; for (let i = 0; i <= maxIdx; i++) pool.push(i);
    const skill = (typeof opp.counterSkill === 'number') ? opp.counterSkill : 0.5;
    const pickFor = (playerIdx) => {
      const playerStyle = HERO_LESSONS[playerIdx]?.style;
      const desired = counterStyleOf(playerStyle);
      if (desired && Math.random() < skill) {
        const counters = pool.filter(i => HERO_LESSONS[i]?.style === desired);
        if (counters.length) return counters[Math.floor(Math.random() * counters.length)];
      }
      return pool[Math.floor(Math.random() * pool.length)];
    };
    return [
      [pickFor(playerPicks[0][0]), pickFor(playerPicks[0][1])],
      [pickFor(playerPicks[1][0]), pickFor(playerPicks[1][1])],
    ];
  };

  // Lock In handler: if player won RPS we proceed straight to countdown (player has
  // already seen and countered). If player lost, opp re-rolls picks to counter player.
  const lockInTactical = () => {
    if (playerFirst) {
      // Player lost RPS — opp adapts to counter player's plan
      const counterPicks = oppCounterReroll(playerPatternIdxs, opponent);
      setOppPatternIdxs(counterPicks);
      setPhase('oppReveal');
    } else {
      setPhase('countdown1');
    }
  };

  // Opponent round: auto-play the picked lesson pattern at battle BPM, awarding a fixed
  // score (derived from pattern value × focus from stats) progressively as the round runs.
  // Opponent round: BeatboxHero (mounted in JSX in spectate mode) handles audio + visual notes.
  // Here we just tick the score, emit occasional judge hearts, and signal completion.
  const playOpponentRoundPattern = (lesson, color, onDone, roundForOpp = null) => {
    eventTimers.current.forEach(clearTimeout);
    eventTimers.current = [];
    setActiveSide('O');
    setTimeLeft(ROUND_SECONDS);
    setComboLabel(null);
    setCurrentSound(lesson?.name || null);
    setCurrentSoundColor(color);

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
      const finalScore = oppRoundScore(lesson, roundForOpp);
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
  const startPlayerRound = (lesson, color) => {
    eventTimers.current.forEach(clearTimeout);
    eventTimers.current = [];
    setActiveSide('P');
    setCurrentSound(lesson?.name || null);
    setCurrentSoundColor(color);
    setTimeLeft(ROUND_SECONDS);
    setComboLabel({ text: lesson?.name || '', key: Date.now() });

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
    // Reset per-round streak/finisher state on every countdown so the gauge
    // and aura don't bleed between rounds.
    if (/^countdown[1-4]$/.test(phase)) {
      setStreak(0);
      setFinisherArmed(false);
      setFinisher(null);
    }
  }, [phase]);

  // When a player round actually starts, lock body scroll and pull the
  // BeatboxHero into the viewport so the pads aren't half-hidden below the
  // fold. Without this, mobile Safari's URL-bar-on-tap behavior makes the
  // page feel jumpy while the player is hammering buttons. Cleanup restores
  // scroll when the round ends or the screen unmounts.
  useEffect(() => {
    const m = /^round([1-4])$/.exec(phase);
    if (!m) return;
    const roundN = parseInt(m[1]);
    if (sideForRound(roundN) !== 'P') return;
    // Pull the canvas + pads into view, centered so the user can see both.
    requestAnimationFrame(() => {
      const el = playerHeroRef.current;
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    // Hard viewport lock for the duration of the round. body+html overflow
    // alone isn't enough on Android Chrome — the URL bar can still toggle
    // on edge-area touches, reflowing the page. Pinning the html element's
    // height + overscroll prevents Chrome from doing the URL-bar dance,
    // and a wrapper-level touchmove preventDefault stops any leftover
    // gesture from being interpreted as a scroll.
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      htmlHeight: html.style.height,
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
      bodyTouchAction: body.style.touchAction,
    };
    html.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    html.style.height = '100%';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    body.style.touchAction = 'none';
    // Swallow touchmove inside the player area so nothing the browser
    // interprets as a scroll can slip through. Has to be passive:false
    // to allow preventDefault on touch events.
    const wrapper = playerHeroRef.current;
    const stopMove = (e) => { e.preventDefault(); };
    wrapper?.addEventListener('touchmove', stopMove, { passive: false });
    return () => {
      html.style.overflow = prev.htmlOverflow;
      html.style.overscrollBehavior = prev.htmlOverscroll;
      html.style.height = prev.htmlHeight;
      body.style.overflow = prev.bodyOverflow;
      body.style.overscrollBehavior = prev.bodyOverscroll;
      body.style.touchAction = prev.bodyTouchAction;
      wrapper?.removeEventListener('touchmove', stopMove);
    };
  }, [phase]);

  // Round runner: opponent rounds auto-play their pattern; player rounds are driven
  // by the BeatboxHero component mounted in JSX (its onLessonComplete advances phase).
  useEffect(() => {
    const m = /^round([1-4])$/.exec(phase);
    if (!m) return;
    if (!playerPatternIdxs || !oppPatternIdxs) return;
    const roundN = parseInt(m[1]);
    const side = sideForRound(roundN);
    const lesson = lessonForRound(roundN);
    const nextPhase = roundN < TOTAL_ROUNDS ? `countdown${roundN + 1}` : 'judging';
    if (side === 'O') {
      playOpponentRoundPattern(lesson, '#CC2200', () => setPhase(nextPhase), roundN);
    } else {
      startPlayerRound(lesson, char.color);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, playerPatternIdxs, oppPatternIdxs]);

  // Pick the player's prepared finisher: by convention, MPC slot 0. Falls back
  // to a generic name if the player hasn't owned an MPC or written any pads.
  const finisherMoveName = () => {
    const slot0 = char.oriSlots?.[0];
    const hasNotes = slot0?.tracks?.some?.(t => t?.cells?.some?.(Boolean));
    if (!hasGear(char, 'mpc') || !hasNotes) return 'MEGA COMBO';
    return char.name ? `${char.name.toUpperCase()}'S SIGNATURE` : 'SIGNATURE COMBO';
  };

  // When player's BeatboxHero finishes its single rep, score the round and advance.
  const handlePlayerRoundComplete = (roundN, accuracy, info = {}) => {
    const lesson = lessonForRound(roundN);
    const score = playerRoundScore(lesson, accuracy, roundN);
    let total = playerScoreRef.current + score;
    // Finisher: armed mid-round (peak streak ≥ FINISHER_THRESHOLD) → bonus +
    // splash overlay. Bonus scales with peak streak so longer chains pay more.
    const peak = info.bestStreak || 0;
    const armed = peak >= FINISHER_THRESHOLD;
    if (armed) {
      const bonus = Math.round(score * 0.5 + peak * 4);
      total += bonus;
      setFinisher({ name: finisherMoveName(), bonus, peak });
    }
    playerScoreRef.current = total;
    setLiveScore(s => ({ ...s, p: total }));
    eventTimers.current.push(setTimeout(() => {
      setActiveSide(null);
      setComboLabel(null);
      setFinisher(null);
      setFinisherArmed(false);
      setStreak(0);
      const nextPhase = roundN < TOTAL_ROUNDS ? `countdown${roundN + 1}` : 'judging';
      setPhase(nextPhase);
    }, armed ? 2600 : 1500));
  };

  // BeatboxHero streak callback — drives aura, HUD gauge, and finisher arming.
  const handleStreak = (current) => {
    setStreak(current);
    if (current >= FINISHER_THRESHOLD) setFinisherArmed(true);
  };

  // When judging starts, compute the result from accumulated scores + judges' biases.
  useEffect(() => {
    if (phase !== 'judging' || result) return;
    const finalP = playerScoreRef.current;
    const finalO = oppScoreRef.current;
    // Distinct sounds across each side's four pattern picks (originality bias)
    const flatPlayerIdxs = (playerPatternIdxs || []).flat();
    const flatOppIdxs = (oppPatternIdxs || []).flat();
    const playerLessons = flatPlayerIdxs.map(i => HERO_LESSONS[i]).filter(Boolean);
    const oppLessons = flatOppIdxs.map(i => HERO_LESSONS[i]).filter(Boolean);
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
        // Play win/loss sting one beat before the result screen lands so it
        // syncs with the VICTORY/DEFEAT slab fade-in.
        try { setTimeout(() => (result.won ? playWinSting() : playLossSting()), 200); } catch {}
        const t = setTimeout(() => setPhase('result'), 800);
        return () => clearTimeout(t);
      }
    }
  }, [phase, revealedJudges, result]);

  const finishBattle = () => {
    const won = result.won;
    let triggerPennyReveal = false;
    setChar(c => {
      const reward = won ? opponent.reward : Math.floor(opponent.reward * 0.1);
      const fans = won ? Math.floor(opponent.reward / 10) : 1;
      const xp = won ? 60 : 20;
      const flags = { ...(c.storyFlags || {}) };
      // Pig Pen win counter — drives the Penny reveal arc
      if (won && opponent.name === 'Pig Pen') {
        flags.pigPenWins = (flags.pigPenWins || 0) + 1;
        flags.pigPenBattled = true;
        if (flags.pigPenWins === 2 && !flags.pennyReveal) triggerPennyReveal = true;
      } else if (opponent.name === 'Pig Pen') {
        flags.pigPenBattled = true;
      }
      const t = passMinutes(c, 90); // a battle takes ~90 game minutes
      let newC = {
        ...c, ...t,
        cash: c.cash + reward,
        followers: c.followers + fans,
        energy: Math.max(0, c.energy - 30),
        mood: Math.min(100, Math.max(0, t.mood + (won ? 15 : -10))),
        xp: c.xp + xp,
        defeated: won && !c.defeated.includes(opponent.name) ? [...c.defeated, opponent.name] : c.defeated,
        lastBattleDay: c.day, // 1-battle-per-week cooldown
        storyFlags: flags,
        stats: { ...(c.stats || {}), sho: (c.stats?.sho || 0) + (hasGear(c, 'wardrobe_refresh') ? 1 : 0) },
        daily: { ...(c.daily || {}), battleWins: (c.daily?.battleWins || 0) + (won ? 1 : 0) },
      };
      delete newC._opponent;
      return checkLevelUp(newC);
    });
    showToast(won ? `🏆 WIN! +$${opponent.reward}` : 'You lost. Train harder!', won ? 'win' : 'bad');
    go('bar');
    // Penny reveal — fires after 2 Pig Pen wins, after the bar transition.
    if (triggerPennyReveal) {
      setTimeout(() => playCutscene?.({
        speaker: 'PIG PEN',
        speakerColor: '#fb7185',
        beats: [{
          drawScene: (ctx, fc) => drawPennyRevealScene(ctx, fc, lookFromChar(char)),
          lines: [
            "you again. sit down.",
            "...",
            "y'know my mum used to call me Penny.",
            "...don't tell anyone that.",
            "call me Penny too if you want. just... not in front of the others.",
          ],
        }],
      }, 'pennyReveal'), 600);
    }
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
          <Btn variant="primary" onClick={startBattle} className="w-full py-3">START BATTLE ▶</Btn>
        </div>
      )}

      {phase === 'tactical' && playerPatternIdxs && oppPatternIdxs && (() => {
        const turns = [0, 1];
        const halves = [0, 1];
        // playerFirst === true means player LOST RPS (loser-goes-first). When true,
        // opponent's picks are hidden and they will re-roll on Lock In.
        const revealOpp = !playerFirst;
        const setPick = (turn, half, idx) => {
          setPlayerPatternIdxs(p => p.map((pair, t) => t === turn
            ? pair.map((v, h) => h === half ? idx : v)
            : pair));
        };
        const StyleBadge = ({ style, dim }) => style ? (
          <span className="text-[8px] tracking-widest uppercase px-1 py-[1px] border"
            style={{ borderColor: STYLE_COLORS[style], color: dim ? '#78716c' : STYLE_COLORS[style] }}>
            {style}
          </span>
        ) : null;
        const HiddenBadge = () => (
          <span className="text-[8px] tracking-widest uppercase px-1 py-[1px] border border-stone-700 text-stone-600">??</span>
        );
        return (
          <div className="space-y-3">
            <div className="text-center">
              <div className="text-amber-500 text-2xl tracking-wider" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
                PREP YOUR SET
              </div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">
                {revealOpp
                  ? "You won RPS — opponent's plan revealed · counter their style"
                  : "You lost RPS — opponent will counter your plan"}
              </div>
            </div>
            {/* Counter-cycle reference */}
            <div className="flex items-center justify-center gap-1 text-[9px] uppercase tracking-widest">
              <StyleBadge style="BOOM" /><span className="text-stone-600">›</span>
              <StyleBadge style="HATS" /><span className="text-stone-600">›</span>
              <StyleBadge style="RIM" /><span className="text-stone-600">›</span>
              <StyleBadge style="SNARE" /><span className="text-stone-600">›</span>
              <StyleBadge style="BOOM" dim />
            </div>
            {turns.map(turn => {
              const [oA, oB] = oppPatternIdxs[turn];
              const oppA = HERO_LESSONS[oA];
              const oppB = HERO_LESSONS[oB];
              return (
                <div key={turn} className="border-2 border-stone-800 bg-stone-900/30 p-2 space-y-2">
                  <div className="flex items-baseline justify-between">
                    <div className="text-amber-500 text-xs uppercase tracking-widest"
                      style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
                      Your turn #{turn + 1}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-red-400">
                      vs {revealOpp
                        ? <><StyleBadge style={oppA?.style} /> + <StyleBadge style={oppB?.style} /></>
                        : <><HiddenBadge /> + <HiddenBadge /></>}
                    </div>
                  </div>
                  {halves.map(half => {
                    const cur = playerPatternIdxs[turn][half];
                    const oppIdx = oppPatternIdxs[turn][half];
                    const myStyle = HERO_LESSONS[cur]?.style;
                    const oppStyle = revealOpp ? HERO_LESSONS[oppIdx]?.style : null;
                    const m = revealOpp ? styleMatchup(myStyle, oppStyle) : 1;
                    const matchTag = !revealOpp ? '· hidden' : (m > 1 ? '✓ counters' : m < 1 ? '✗ countered' : '· neutral');
                    const matchColor = !revealOpp ? '#78716c' : (m > 1 ? '#22c55e' : m < 1 ? '#ef4444' : '#a8a29e');
                    return (
                      <div key={half} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="text-[9px] uppercase tracking-widest text-stone-500 flex items-center gap-1">
                            Pattern {half === 0 ? 'A' : 'B'}: {HERO_LESSONS[cur]?.name || '—'} <StyleBadge style={myStyle} />
                          </div>
                          <span className="text-[9px] uppercase tracking-widest" style={{ color: matchColor }}>{matchTag}</span>
                        </div>
                        <div className="overflow-x-auto -mx-1">
                          <div className="flex gap-1 px-1 pb-1">
                            {HERO_LESSONS.map((lesson, i) => {
                              const playable = isPlayableForPlayer(i);
                              const selected = i === cur;
                              const styleM = revealOpp ? styleMatchup(lesson.style, oppStyle) : 1;
                              const tint = revealOpp ? (styleM > 1 ? '#22c55e' : styleM < 1 ? '#ef4444' : null) : null;
                              return (
                                <button key={i}
                                  disabled={!playable}
                                  onClick={() => setPick(turn, half, i)}
                                  className={`flex-shrink-0 px-2 py-1 border text-[10px] uppercase tracking-widest whitespace-nowrap transition-all ${
                                    selected ? 'border-amber-500 bg-amber-500/15 text-amber-500' :
                                    playable ? 'text-stone-400 hover:border-amber-500/50' :
                                               'border-stone-800 text-stone-600 opacity-40'
                                  }`}
                                  style={!selected && playable && tint ? { borderColor: tint } : (!selected && playable ? { borderColor: '#44403c' } : undefined)}>
                                  {!playable && '🔒 '}#{i + 1}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            <Btn variant="primary" onClick={lockInTactical} className="w-full py-3">LOCK IN ▶</Btn>
          </div>
        );
      })()}

      {phase === 'rps' && (
        <div className="space-y-4 text-center pt-4">
          <div className="text-amber-500 text-xl tracking-wider" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>ROCK PAPER SCISSORS</div>
          <div className="text-[10px] uppercase tracking-widest text-stone-500">Winner sees opponent's plan · loser gets countered</div>
          {!rps && (
            <div className="grid grid-cols-3 gap-2 pt-4">
              {[{ k: 'rock', e: '✊', n: 1 }, { k: 'paper', e: '✋', n: 2 }, { k: 'scissors', e: '✌️', n: 3 }].map(o => (
                <button key={o.k} onClick={() => playRps(o.k)}
                  className="relative aspect-square border-2 border-stone-800 hover:border-amber-500 text-5xl bg-stone-900/30 transition-all">
                  {o.e}
                  <span className="absolute top-1 right-2 text-[10px] tracking-widest text-amber-500/70">{o.n}</span>
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
                {rps.outcome === 'win' ? "YOU WIN! READ THEIR PLAN" : rps.outcome === 'lose' ? "YOU LOSE — THEY'LL COUNTER" : 'TIE — REPLAY'}
              </div>
            </div>
          )}
        </div>
      )}

      {phase === 'oppReveal' && playerPatternIdxs && oppPatternIdxs && (() => {
        const StyleBadge = ({ style }) => style ? (
          <span className="text-[10px] tracking-widest uppercase px-1.5 py-[2px] border"
            style={{ borderColor: STYLE_COLORS[style], color: STYLE_COLORS[style] }}>
            {style}
          </span>
        ) : null;
        const skillPct = Math.round((opponent.counterSkill ?? 0.5) * 100);
        return (
          <div className="space-y-4 text-center pt-4">
            <div className="text-red-500 text-xl tracking-wider" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
              {opponent.name.toUpperCase()} ADAPTS
            </div>
            <div className="text-[10px] uppercase tracking-widest text-stone-500">
              Counter skill {skillPct}% · they re-picked to counter your set
            </div>
            <div className="space-y-2">
              {[0, 1].map(turn => {
                const [pA, pB] = playerPatternIdxs[turn];
                const [oA, oB] = oppPatternIdxs[turn];
                const pStyleA = HERO_LESSONS[pA]?.style;
                const pStyleB = HERO_LESSONS[pB]?.style;
                const oStyleA = HERO_LESSONS[oA]?.style;
                const oStyleB = HERO_LESSONS[oB]?.style;
                return (
                  <div key={turn} className="border-2 border-stone-800 bg-stone-900/30 p-2 grid grid-cols-2 gap-2 text-[10px]">
                    <div className="text-amber-500 uppercase tracking-widest text-left">
                      Turn #{turn + 1} · You
                      <div className="flex gap-1 mt-1"><StyleBadge style={pStyleA} /> + <StyleBadge style={pStyleB} /></div>
                    </div>
                    <div className="text-red-400 uppercase tracking-widest text-left">
                      Them
                      <div className="flex gap-1 mt-1"><StyleBadge style={oStyleA} /> + <StyleBadge style={oStyleB} /></div>
                    </div>
                  </div>
                );
              })}
            </div>
            <Btn variant="primary" onClick={() => setPhase('countdown1')} className="w-full py-3">BRACE YOURSELF ▶</Btn>
          </div>
        );
      })()}

      {/^(round|countdown)[1-4]$/.test(phase) && playerPatternIdxs && oppPatternIdxs && (() => {
        const m = /^(round|countdown)([1-4])$/.exec(phase);
        const isCountdown = m[1] === 'countdown';
        const roundN = parseInt(m[2]);
        const side = sideForRound(roundN);
        const lesson = lessonForRound(roundN);
        const upcomingName = side === 'P' ? char.name : opponent.name;
        const isPlayerRound = side === 'P';
        const isOppRound = side === 'O';
        return (
          <div className="space-y-2">
            <BattleHUD char={char} opponent={opponent}
              timeLeft={isCountdown ? ROUND_SECONDS : timeLeft}
              pScore={liveScore.p} oScore={liveScore.o}
              streak={isCountdown ? 0 : streak}
              finisherArmed={isCountdown ? false : finisherArmed} />
            <div className="relative">
              <PixelStage char={char} opponent={opponent}
                activeSide={isCountdown ? null : activeSide}
                currentSound={isCountdown ? null : currentSound}
                soundColor={isCountdown ? '#D4A017' : currentSoundColor}
                judgeVotes={[]} revealedJudges={0}
                judgeHearts={isCountdown ? [0,0,0,0,0] : judgeHearts}
                comboLabel={isCountdown ? null : comboLabel}
                playerStreak={isCountdown ? 0 : streak} />
              {finisher && (
                <FinisherSplash name={finisher.name} bonus={finisher.bonus} peak={finisher.peak} />
              )}
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
              <div ref={playerHeroRef}
                // touch-action:none means the browser won't interpret any
                // gesture in this area as scroll/zoom; pads still get the
                // onPointerDown taps, but Android Chrome can't fire URL-bar
                // toggles or pull-to-refresh in here.
                style={{ touchAction: 'none', scrollMarginTop: 12, overscrollBehavior: 'none' }}>
                <BeatboxHero
                  key={`p-r${roundN}`}
                  mode="battle"
                  active={!isCountdown}
                  bpm={BATTLE_BPM}
                  lessonOverride={lesson}
                  accuracyBoost={hasGear(char, 'premium_headphones') ? 1.25 : 1}
                  onAccuracyUpdate={() => {}}
                  onStreak={handleStreak}
                  onLessonComplete={(_idx, accuracy, info) => handlePlayerRoundComplete(roundN, accuracy, info)}
                />
              </div>
            )}
            {/* Opponent rounds: spectate-mode BeatboxHero shows their pattern as
                ghost notes scrolling so the player can watch + listen. */}
            {isOppRound && !isCountdown && lesson != null && (
              <BeatboxHero
                key={`o-r${roundN}`}
                mode="spectate"
                active={true}
                bpm={BATTLE_BPM}
                lessonOverride={lesson}
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
