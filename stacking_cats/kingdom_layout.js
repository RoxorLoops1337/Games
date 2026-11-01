// Whiskerton Walk: the map. Pure data and one builder, no DOM, no randomness.
// y points down. One horizontal band 3600 px wide, 540 tall, ground line at GROUND.
// Three districts (Phase 1): Whisker Green, Maple Row, Lantern Roofs. Everything you can buy is reachable by walking
// (wonders by the Wind Lift pad under their cloud island); jumping is only for the roof ledges (optional spots).
import { BUILDINGS, WONDERS, CAT_BY_ID, CAT_TAGS } from './cats.js';

export const WORLD_W = 3600;
export const WORLD_H = 540;
export const GROUND = 440;
export const ISLAND_RISE = 170;          // cloud island top above the ground
export const ISLAND_W = 230;
export const MAX_WALK_STATUES = 6;       // the Statue Walk shows this many older records next to the Stackstone

// door x of every building, lift pad x of every wonder, and the fixed props (never move: keeps the street stable forever)
export const SLOTS = {
  gate: 100, crier: 190, stall: 260, pip: 310, spawn: 340, bench: 450, vault: 590, coin: 720, stackstone: 860,
  walk0: 960, walkStep: 46,
  dojo: 1320, yarn: 1500, knotty: 1560, cafe: 1680, beds: 1860, academy: 2040, bench1: 2300,
  tent: 2520, tower: 2700, roof1: 2745, shrine: 2880, paw: 3040, spa: 3200, spring: 3360, squeaks: 3440, lookout: 3510,
};

export const DISTRICTS = [
  { id: 'green', name: 'Whisker Green', themeId: 0, x0: 0, x1: 1200 },
  { id: 'maple', name: 'Maple Row', themeId: 1, x0: 1200, x1: 2400 },
  { id: 'roofs', name: 'Lantern Roofs', themeId: 2, x0: 2400, x1: WORLD_W },
];
export const districtAt = (x) => (DISTRICTS.find((d) => x >= d.x0 && x < d.x1) || DISTRICTS[DISTRICTS.length - 1]);

// which wonder sits on which cloud island (the island x is the lift pad x)
export const WONDER_X = { bench: SLOTS.bench, coin: SLOTS.coin, cafe: SLOTS.cafe, academy: SLOTS.academy, paw: SLOTS.paw, spring: SLOTS.spring };
export const BUILDING_X = { stall: SLOTS.stall, vault: SLOTS.vault, dojo: SLOTS.dojo, yarn: SLOTS.yarn, beds: SLOTS.beds, tent: SLOTS.tent, tower: SLOTS.tower, shrine: SLOTS.shrine, spa: SLOTS.spa };

// where each kind of cat likes to hang around (by its first synergy tag): fire cats by the springs, gun cats on the lookout rail...
const HOME_BY_TAG = { fire: SLOTS.spa, gun: SLOTS.lookout, blade: SLOTS.dojo, storm: SLOTS.tower, guardian: SLOTS.beds, cheer: SLOTS.cafe, magic: SLOTS.shrine, tech: SLOTS.yarn };
const NPC_MAX_CATS = 12;

const mostPlayed = (save) => {
  const unlocked = (save && save.unlocked) || [];
  const used = (id) => (save && save.catStats && save.catStats[id] && save.catStats[id].runs) || 0;
  return unlocked.map((id, i) => ({ id, i })).filter((x) => CAT_BY_ID[x.id]).sort((a, b) => used(b.id) - used(a.id) || a.i - b.i).map((x) => x.id);
};
// the cat you walk as when nothing is chosen: the stored choice if unlocked, else the most played, else tabby
export function defaultAvatar(save) {
  const order = mostPlayed(save);
  const pick = save && save.walk && save.walk.avatar;
  if (pick && order.includes(pick)) return pick;
  return order[0] || 'tabby';
}

const platform = (x, y, w) => ({ x, y, w, oneWay: true });

export function buildLayout(kingdomLevel, k, save) {
  const platforms = [];
  const zones = [];
  const npcs = [];

  // ---- gate, plaza props, lookout
  zones.push({ type: 'gate', id: 'gate', x: SLOTS.gate, y: GROUND, w: 110, h: 140 });
  zones.push({ type: 'lookout', id: 'lookout', x: SLOTS.lookout, y: GROUND, w: 110, h: 140 });
  zones.push({ type: 'statue', id: 'stackstone', x: SLOTS.stackstone, y: GROUND, w: 100, h: 140 });
  const recs = (save && Array.isArray(save.records)) ? save.records : [];
  const walkN = Math.max(0, Math.min(MAX_WALK_STATUES, recs.length - 1));
  for (let i = 0; i < walkN; i++) zones.push({ type: 'statue', id: 'walk' + i, x: SLOTS.walk0 + i * SLOTS.walkStep, y: GROUND, w: 40, h: 120 });
  zones.push({ type: 'bench', id: 'bench1', x: SLOTS.bench1, y: GROUND, w: 80, h: 60 });

  // ---- the nine buildings (plots with a sign when level 0), fixed slots
  for (const b of BUILDINGS) zones.push({ type: 'building', id: b.id, x: BUILDING_X[b.id], y: GROUND, w: 100, h: 130 });

  // ---- six wonders on cloud islands, each with a Wind Lift pad on the ground directly below
  for (const w of WONDERS) {
    const x = WONDER_X[w.id], top = GROUND - ISLAND_RISE;
    platforms.push(platform(x - ISLAND_W / 2, top, ISLAND_W));
    zones.push({ type: 'wonder', id: w.id, x, y: top, w: 130, h: 110 });
    zones.push({ type: 'lift', id: w.id, x, y: GROUND, w: 90, h: 60, toY: top });
  }

  // ---- optional roof ledges (jump only; two rises of 70 px, apex of a jump is about 90) with a sit spot on top
  platforms.push(platform(SLOTS.tower - 130, GROUND - 70, 90));
  platforms.push(platform(SLOTS.roof1 - 45, GROUND - 140, 100));
  zones.push({ type: 'bench', id: 'roof1', x: SLOTS.roof1, y: GROUND - 140, w: 70, h: 60 });
  platforms.push(platform(SLOTS.dojo + 120, GROUND - 70, 80));   // the crate by the laundry line in Maple Row

  // ---- NPCs: the crier at the gate, Pip at the stall, Knotty at the yarn shop, Sir Squeaks once a nest is down
  const addNpc = (n, range, w) => { npcs.push({ ...n, range }); zones.push({ type: 'npc', id: n.id, x: n.x, y: GROUND, w: w || 70, h: 90 }); };
  addNpc({ id: 'crier', kind: 'crier', x: SLOTS.crier }, 0, 80);
  addNpc({ id: 'pip', kind: 'mouse', x: SLOTS.pip }, 20, 60);
  addNpc({ id: 'knotty', kind: 'mouse', x: SLOTS.knotty }, 24, 60);
  if (save && save.stats && save.stats.bossKills > 0) addNpc({ id: 'squeaks', kind: 'mouse', x: SLOTS.squeaks }, 16, 60);

  // freed cats: every unlocked cat except the one you walk as, most played first, at the place that suits its kind
  const avatar = defaultAvatar(save);
  const cats = mostPlayed(save).filter((id) => id !== avatar).slice(0, NPC_MAX_CATS);
  const used = {};
  for (const id of cats) {
    const tag = (CAT_TAGS[id] && CAT_TAGS[id][0]) || 'cheer';
    const home = HOME_BY_TAG[tag] != null ? HOME_BY_TAG[tag] : SLOTS.stackstone;
    const n = used[home] = (used[home] || 0) + 1;
    const side = n % 2 ? 1 : -1;
    const x = Math.max(60, Math.min(WORLD_W - 60, home + side * (100 + 55 * Math.floor((n - 1) / 2))));
    addNpc({ id: 'cat:' + id, kind: 'cat', x, catId: id }, 40, 56);
  }

  return {
    width: WORLD_W, height: WORLD_H, groundY: GROUND,
    platforms, zones, npcs,
    districts: DISTRICTS.map((d) => ({ ...d })),
    spawn: { x: SLOTS.spawn, y: GROUND },
  };
}
