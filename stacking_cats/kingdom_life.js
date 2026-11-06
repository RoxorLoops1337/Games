// Whiskerton Walk: the living village. Pure helpers (no DOM, no Math.random, no clock unless a date is passed in).
// Time of day and season, what freed cats say, the Daily Mewsprint headline, the Stackstone record statue,
// cleaning of the additive save fields (save.records, save.walk), where to spawn, and the avatar quirk table.
// Rule: the walk never pays coins, gems or run power. Every reward in this file is a stamp, a lore line or a record.
// All text is English data; i18n.js translates the finished string (# = number, {} = name in the dictionary key).
import { CAT_BY_ID, CAT_TAGS, BUILDING_BY_ID, WONDER_BY_ID, nextGoal, affordableWonder, kingdomLevel } from './cats.js';
import { WORLD_W, DISTRICTS, BUILDING_X, WONDER_X, SLOTS, GROUND } from './kingdom_layout.js';

const hash = (s) => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const num = (v, max = 1e9) => (Number.isFinite(+v) ? Math.max(0, Math.min(max, Math.floor(+v))) : 0);
const toDate = (d) => (d instanceof Date ? d : new Date(d == null ? 0 : d));

// ---------------------------------------------------------------- clock and calendar
export function dayPart(now) {
  const h = toDate(now).getHours();
  if (h >= 5 && h < 8) return 'dawn';
  if (h >= 8 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'dusk';
  return 'night';
}
export function seasonOf(date) {
  const m = toDate(date).getMonth();   // 0 = January
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'autumn';
  return 'winter';
}
// Phase 1 keeps one width; the hook exists so later districts can widen the street with the Kingdom
export const worldWidthFor = () => WORLD_W;
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WEATHER_LINES = {
  spring: 'Forecast: petals, with a chance of naps.',
  summer: 'Forecast: sunny, with fireflies after dark.',
  autumn: 'Forecast: falling leaves, all of them pounceable.',
  winter: 'Forecast: snow, and paw prints that tell on you.',
};

// ---------------------------------------------------------------- the 8 avatar quirks (cosmetic, never touch runs)
export const QUIRKS = {
  tabby: { name: 'Tall grass swipe', text: 'Swipe cuts tall grass and finds dig hints.' },
  ember: { name: 'Lantern lighter', text: 'Lights lanterns, and lit lamps stay on until dawn.' },
  mochi: { name: 'Crate pusher', text: 'Pushes one crate at a time onto ledges.' },
  sparky: { name: 'Power paws', text: 'Powers dynamos and the fountain pump for a while.' },
  yuki: { name: 'Ice bridge', text: 'Freezes a pond tile for a short bridge.' },
  pudding: { name: 'Gathering purr', text: 'Purr: villagers gather and wilted flowers bloom.' },
  hawkeye: { name: 'Spyglass', text: 'Secrets nearby sparkle.' },
  merlin: { name: 'Ghost blocks', text: 'Reveals ghost blocks for a short while.' },
};
export const quirkOf = (id) => QUIRKS[id] || null;

// ---------------------------------------------------------------- freed cats and their stat lines
const styleOf = (id) => (CAT_TAGS[id] && CAT_TAGS[id][0]) || 'plain';
// each line takes the cat's own numbers: K = mice defeated together, R = runs together, B = best wave
const STAT_LINES = {
  blade: [['K', 'I have sliced # mice. Politely. Mostly.'], ['R', '# runs together and not one scratch on my fur. Okay, a few.'], ['B', 'My best wave is #. My best nap is longer.']],
  fire: [['K', 'We have toasted # mice together. Smells like victory and burnt toast.'], ['R', '# runs! I am only a little bit on fire.'], ['B', 'Wave # was my finest hour. Please do not stand behind me.']],
  storm: [['K', '# mice zapped. My fur has not been flat since.'], ['R', '# runs and I still get static from every blanket.'], ['B', 'Wave # was electric. Please do not pet me for a minute.']],
  gun: [['K', 'I have popped # mice. They all got a free sticker.'], ['R', '# runs and my aim only got better. The wall is not so sure.'], ['B', 'Wave # from my rail. The view is great, the pigeons are rude.']],
  guardian: [['K', '# mice bounced off me. They are fine, I checked.'], ['R', 'I blocked for # runs. Nobody asked how my shoulders are.'], ['B', 'Wave # and still standing. Mostly because sitting is allowed.']],
  cheer: [['K', '# mice defeated and I cheered for every one. My voice is a bit hoarse.'], ['R', 'I sang through # runs. The mice asked for a quieter song.'], ['B', 'Wave # was a banger. Encore, encore, encore!']],
  magic: [['K', '# mice turned into confused mice. It is a start.'], ['R', '# runs of spells. Only two turned someone into a sandwich.'], ['B', 'Wave # by my spell. The sandwich was a side effect.']],
  tech: [['K', '# mice debugged. The patch notes are mostly squeaks.'], ['R', '# runs and zero crashes. One soft reboot, do not ask.'], ['B', 'Wave # filed under excellent, with sparks.']],
  plain: [['K', 'We have bopped # mice together. I kept count on my paws.'], ['R', '# runs together. Same time next week?'], ['B', 'Wave # was a good day to be a cat.']],
};
const UNPLAYED_LINES = {
  blade: 'Nobody picked me yet. I have been polishing a very small sword.',
  fire: 'Take me on a run! I have been practicing my toast.',
  storm: 'My fur is charged and I have nobody to zap. Pick me!',
  gun: 'Still on the rail with my snack ration. Pick me!',
  guardian: 'I have been guarding the bench. It is very safe.',
  cheer: 'I wrote a song for our first run. It has four verses!',
  magic: 'I have a spell ready. Probably it makes snacks. Pick me!',
  tech: 'I ran a thousand simulations. We win in most of them. Pick me!',
  plain: 'I have not been on a run yet. I am very patient. Mostly.',
};
export const FREED_STYLES = Object.keys(STAT_LINES);
export const STAT_TEMPLATES = Object.values(STAT_LINES).flatMap((a) => a.map((x) => x[1]));
export const UNPLAYED_TEMPLATES = Object.values(UNPLAYED_LINES);

// n lets a repeat tap cycle through the three lines; the same n always gives the same line
export function freedCatLine(id, catStats, n = 0) {
  const style = STAT_LINES[styleOf(id)] ? styleOf(id) : 'plain';
  const row = catStats && catStats[id];
  if (!row || !(row.runs > 0)) return UNPLAYED_LINES[style];
  const set = STAT_LINES[style];
  const pick = set[(hash(id) + (n | 0) % 3 + 3) % 3];
  const val = pick[0] === 'K' ? num(row.kills) : pick[0] === 'R' ? num(row.runs) : num(row.best);
  // a zero stat reads badly ("0 mice sliced"), so fall back to the runs line
  if (!val) return set[1][1].replace('#', String(num(row.runs)));
  return pick[1].replace('#', String(val));
}

// the fixed villagers (see world.md); the crier and the cats are built from live data
export const NPC_LINES = {
  pip: 'I used to raid this stall. Now I work here. Same hours, better pay.',
  knotty: 'Please do not ask where the sweater begins. We lost it in March.',
  squeaks: 'I watch the nests so you do not have to. Mostly I watch my sandwich.',
  crier: 'Extra, extra! Read all about it!',
};
export function npcLine(id, save, lastRun, n = 0) {
  if (id === 'crier') return mewsprintHeadline(save, lastRun);
  if (id.startsWith('cat:')) return freedCatLine(id.slice(4), save && save.catStats, n);
  return NPC_LINES[id] || '';
}

// ---------------------------------------------------------------- the Daily Mewsprint headline
// lastRun (all optional): { wave, kills, bossKills, cats: [catIds], cashed, daily, newBest }
// A template is plain English with # for a number and {} for a name, so the finished headline matches its i18n key.
const H = (id, text, when, args) => ({ id, text, when, args });
export const HEADLINES = [
  // lost early
  H('early1', 'Tower topples at wave #, {} blames the snacks', (c) => c.lost && c.wave <= 5, (c) => [c.wave, c.A]),
  H('early2', 'Wave # was a warm up, says {}', (c) => c.lost && c.wave <= 5, (c) => [c.wave, c.A]),
  H('early3', 'Local tower naps early at wave #, mice stay polite', (c) => c.lost && c.wave <= 5, (c) => [c.wave]),
  H('early4', 'Nine lives, eight to go: the stack takes a breather at wave #', (c) => c.lost && c.wave <= 7, (c) => [c.wave]),
  // lost in the middle
  H('mid1', 'Wave # reached, {} says the stack just needed one more hug', (c) => c.lost && c.wave >= 6 && c.wave <= 14, (c) => [c.wave, c.A]),
  H('mid2', '# mice shown the door, tower leans out at wave #', (c) => c.lost && c.wave >= 6 && c.wave <= 14 && c.kills > 0, (c) => [c.kills, c.wave]),
  H('mid3', '{} wobbles at wave #, witnesses call it brave', (c) => c.lost && c.wave >= 6, (c) => [c.A, c.wave]),
  H('mid4', 'Stack sways, stack stands, stack sits down at wave #', (c) => c.lost && c.wave >= 8 && c.wave <= 16, (c) => [c.wave]),
  // lost late
  H('late1', 'Epic trip! Wave # remembered by the whole street', (c) => c.lost && c.wave >= 15, (c) => [c.wave]),
  H('late2', 'Wave #! {} asks for a statue and a snack', (c) => c.lost && c.wave >= 15, (c) => [c.wave, c.A]),
  H('late3', 'Tower of the week stands until wave #', (c) => c.lost && c.wave >= 18, (c) => [c.wave]),
  // nests
  H('nest1', 'A nest falls, a cat goes free, the street cheers', (c) => c.nests === 1, () => []),
  H('nest2', 'Third nest in a row! Squeakimus cancels the party', (c) => c.nests === 3, () => []),
  H('nest3', '# nests smashed in one trip, Squeakimus updates his locks', (c) => c.nests >= 2 && c.nests !== 3, (c) => [c.nests]),
  H('nest4', 'No nests this time, but wave # was brisk', (c) => c.hasRun && c.nests === 0 && c.wave >= 8, (c) => [c.wave]),
  // cashed out
  H('cash1', 'Cashed out early: wise or chicken? Readers split', (c) => c.cashed, () => []),
  H('cash2', 'Home by tea time at wave #, {} approves', (c) => c.cashed, (c) => [c.wave, c.A]),
  H('cash3', 'Cash out at wave #: the bank cat nods slowly', (c) => c.cashed && c.wave >= 10, (c) => [c.wave]),
  // daily
  H('daily1', 'Daily challenge done, wave # is on the board', (c) => c.daily, (c) => [c.wave]),
  H('daily2', 'Today\'s challenge: {} wants a rematch after wave #', (c) => c.daily, (c) => [c.A, c.wave]),
  // records
  H('rec1', 'New record! Wave # makes the Stackstone shake', (c) => c.newBest, (c) => [c.wave]),
  H('rec2', 'Record broken at wave #, builders order more marble', (c) => c.newBest, (c) => [c.wave]),
  H('rec3', '{} carries the street to a new best of wave #', (c) => c.newBest, (c) => [c.A, c.wave]),
  // mice counts
  H('kills1', '# mice politely escorted out of town', (c) => c.hasRun && c.kills >= 50, (c) => [c.kills]),
  H('kills2', 'Mouse traffic report: # fewer on the roads', (c) => c.hasRun && c.kills >= 100, (c) => [c.kills]),
  // fresh village
  H('new1', 'Whiskerton opens its doors, the tower is waiting for you', (c) => !c.hasRun, () => []),
  H('new2', 'Fresh paws wanted: the first trip is always the best', (c) => !c.hasRun, () => []),
  H('new3', 'Extra, extra! The village is quiet, hurry back to the gate', (c) => !c.hasRun, () => []),
  // always welcome fillers (so no two days read the same)
  H('fill1', 'Kitten finds a button, the town is thrilled', () => true, () => []),
  H('fill2', 'Mouse seen at the stall: peaceful chat, nothing stolen', () => true, () => []),
  H('fill3', 'Weather office says: nap first, forecast later', () => true, () => []),
  H('fill4', '{} spotted napping in the sun, council declares it a landmark', (c) => c.hasRun, (c) => [c.A]),
  H('fill5', 'Street sweepers report # leaves, all of them pounced', (c) => true, (c) => [Math.max(3, (c.seed % 40) + 3)]),
];
export const HEADLINE_TEMPLATES = HEADLINES.map((h) => h.text);

function fillTemplate(text, vals) {
  let i = 0;
  return text.replace(/#|\{\}/g, () => String(vals[i++]));
}
function headlineCtx(save, lastRun) {
  const r = lastRun && typeof lastRun === 'object' ? lastRun : null;
  const st = (save && save.stats) || {};
  const ids = ((r && r.cats) || []).filter((id) => CAT_BY_ID[id]);
  const wave = r ? num(r.wave, 999) : 0;
  const seed = hash([wave, r ? num(r.kills) : 0, r ? num(r.bossKills) : 0, ids.join(','), st.runs | 0].join('|'));
  let A = 'Tabby';
  if (ids.length) A = CAT_BY_ID[ids[seed % ids.length]].name;
  else if (save && save.unlocked && save.unlocked.length) { const u = save.unlocked.filter((id) => CAT_BY_ID[id]); if (u.length) A = CAT_BY_ID[u[seed % u.length]].name; }
  const hasRun = !!(r && wave > 0);
  return { hasRun, wave, kills: r ? num(r.kills) : 0, nests: r ? num(r.bossKills, 99) : 0, cashed: !!(r && r.cashed), daily: !!(r && r.daily), newBest: !!(r && r.newBest), lost: hasRun && !(r && r.cashed), A, seed };
}
// returns one finished English headline; the same save and run always give the same headline
export function mewsprintHeadline(save, lastRun) {
  const c = headlineCtx(save, lastRun);
  const pool = HEADLINES.filter((h) => h.when(c));
  // specific stories first: take the most specific half of the pool when there is one, fillers only fill gaps
  const specific = pool.filter((h) => !h.id.startsWith('fill'));
  const use = specific.length >= 2 ? (c.seed % 4 === 0 ? pool : specific) : pool;
  const h = use[(c.seed >>> 3) % use.length];
  return fillTemplate(h.text, h.args(c));
}

// ---------------------------------------------------------------- records and the Stackstone
export const MAX_RECORDS = 8;
const cleanRecord = (r) => {
  if (!r || typeof r !== 'object') return null;
  const wave = num(r.wave, 999);
  if (wave < 1) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(r.date)) ? String(r.date) : '';
  const cats = (Array.isArray(r.cats) ? r.cats : []).filter((id) => typeof id === 'string' && CAT_BY_ID[id]).slice(0, 8);
  return { wave, date, cats };
};
export const cleanRecords = (raw) => (Array.isArray(raw) ? raw.map(cleanRecord).filter(Boolean).slice(-MAX_RECORDS) : []);
export const dayString = (now) => { const d = toDate(now); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// run = { wave, cats: [ids in stack order], date?: 'YYYY-MM-DD' | ms }; a record is only written when the wave beats every record
export function recordsUpdate(records, run) {
  const list = cleanRecords(records);
  const wave = run ? num(run.wave, 999) : 0;
  const best = list.reduce((m, r) => Math.max(m, r.wave), 0);
  if (wave < 3 || wave <= best) return { records: list, isNew: false, hauled: null };
  const date = typeof run.date === 'string' ? run.date : dayString(run.date == null ? 0 : run.date);
  const rec = cleanRecord({ wave, date, cats: run.cats });
  const top = list.length ? list.reduce((a, r) => (r.wave >= a.wave ? r : a), list[0]) : null;
  const next = [...list, rec].slice(-MAX_RECORDS);
  return { records: next, isNew: true, hauled: top };   // hauled = the old statue that moves to the Statue Walk
}
// top = the Stackstone (best wave, latest on ties); walk = the older records, oldest first, as many as the street shows
export function stackstoneView(records, maxWalk = 6) {
  const list = cleanRecords(records);
  if (!list.length) return { top: null, walk: [], total: 0 };
  let ti = 0;
  list.forEach((r, i) => { if (r.wave >= list[ti].wave) ti = i; });
  const walk = list.filter((_, i) => i !== ti).slice(-maxWalk);
  const label = (r) => ({ ...r, plaque: `Wave ${r.wave}`, dateText: dateText(r.date) });
  return { top: label(list[ti]), walk: walk.map(label), total: list.length };
}
export function dateText(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date));
  return m ? `${+m[3]} ${MONTHS[+m[2] - 1] || ''} ${m[1]}` : '';
}

// ---------------------------------------------------------------- save.walk (additive, cleaned on load and import)
// Rewards of the walk are stamps only (no coins, gems or run power). Unknown ids are dropped.
export const STAMPS = {
  first_steps: { name: 'First steps', text: 'Walked the street of Whiskerton.' },
  gate_pass: { name: 'Gate pass', text: 'Stepped through the gate for a trip.' },
  lookout_view: { name: 'Lookout view', text: 'Climbed to the lookout and read the nest map.' },
  statue_unveiled: { name: 'Unveiled', text: 'Unveiled a new Stackstone.' },
  cloud_rider: { name: 'Cloud rider', text: 'Rode a Wind Lift to a cloud island.' },
  roof_cat: { name: 'Roof cat', text: 'Sat on a rooftop ledge.' },
};
export const WALK_REWARDS = Object.entries(STAMPS).map(([id, s]) => ({ kind: 'stamp', id, name: s.name, text: s.text }));
export const rewardIsCosmetic = (r) => !!r && !('coins' in r) && !('gems' in r) && !('power' in r) && ['stamp', 'lore', 'record'].includes(r.kind);
export const emptyWalk = () => ({ v: 1, avatar: null, x: SLOTS.spawn, seen: {}, stamps: {}, unveiled: 0, visits: 0 });
export function cleanWalk(raw, unlocked) {
  const w = emptyWalk();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return w;
  if (typeof raw.avatar === 'string' && CAT_BY_ID[raw.avatar] && (!unlocked || unlocked.includes(raw.avatar))) w.avatar = raw.avatar;
  if (Number.isFinite(+raw.x) && raw.x !== null && raw.x !== '' && typeof raw.x !== 'boolean') w.x = Math.max(0, Math.min(WORLD_W, Math.floor(+raw.x)));
  for (const d of DISTRICTS) if (raw.seen && typeof raw.seen === 'object' && raw.seen[d.id] === true) w.seen[d.id] = true;
  for (const id in STAMPS) if (raw.stamps && typeof raw.stamps === 'object' && raw.stamps[id] === true) w.stamps[id] = true;
  w.unveiled = num(raw.unveiled, 999);
  w.visits = num(raw.visits, 1e6);
  return w;
}
// returns a new walk record with the stamp (never mutates), or the same one when it is unknown or already held
export function claimStamp(walk, id) {
  const w = cleanWalk(walk);
  if (!STAMPS[id] || w.stamps[id]) return { walk: w, gained: false };
  return { walk: { ...w, stamps: { ...w.stamps, [id]: true } }, gained: true };
}

// ---------------------------------------------------------------- where to appear
// From game over (fromOver) you stand at the building the game over screen pointed at (nextGoal), else a wonder
// you can pay for, else where you were last, else the normal spawn. Returns { x, y, at: 'building:id' | 'wonder:id' | 'last' | 'spawn' }.
export function spawnFor(save, fromOver = false, layout = null) {
  const y = layout ? layout.groundY : GROUND;
  const spawnX = layout ? layout.spawn.x : SLOTS.spawn;
  const k = save && save.kingdom;
  if (fromOver && k) {
    const g = nextGoal(k);
    if (g && BUILDING_X[g.id] != null) return { x: BUILDING_X[g.id], y, at: 'building:' + g.id };
    const w = affordableWonder(k);
    if (w && WONDER_X[w] != null) return { x: WONDER_X[w], y, at: 'wonder:' + w };
  }
  const last = save && save.walk && Number.isFinite(+save.walk.x) ? +save.walk.x : null;
  if (!fromOver && last != null && last >= 60 && last <= WORLD_W - 60) return { x: Math.floor(last), y, at: 'last' };
  return { x: spawnX, y, at: 'spawn' };
}

// how built the street is, 0 to 100 (for the Mewsprint)
export const streetPercent = (k) => Math.round((100 * kingdomLevel(k || {})) / CATS_BUILD_TOTAL());
function CATS_BUILD_TOTAL() { let t = 0; for (const id in BUILDING_BY_ID) t += BUILDING_BY_ID[id].max; return t || 1; }
export const WONDER_COUNT = Object.keys(WONDER_BY_ID).length;
