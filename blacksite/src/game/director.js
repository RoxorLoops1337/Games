// The director: mission script, pacing, and where the enemies come from.
//
// Two clocks run here at once and they answer different questions.
//
// The mission script answers "what is the player doing" — a short campaign of
// objectives that walks them from the perimeter to the silo and back out again.
// It is authored, ordered and finite, because a shooter without a shape is a
// shooting gallery.
//
// The pacing loop answers "how hard is it right now" — the Left 4 Dead model.
// It estimates player stress from what actually happened to them in the last few
// seconds, spawns against a target intensity, holds the peak briefly, then shuts
// the tap off completely for a valley. The valley is the part people skip and it
// is the part that matters: a fight only reads as a peak if the thing before it
// was quiet. Constant pressure flattens into noise inside ninety seconds.
//
// Pure simulation. No Three.js, no DOM. Everything the presentation layer needs
// leaves through `emit`.

import * as C from '../core/constants.js';
import { V, clamp, emit, lookDir, vec3 } from '../core/state.js';
import { lineOfSight } from '../world/collision.js';
import * as AI from './ai.js';

// ── the mission ──────────────────────────────────────────────────────────────
//
// Zones are indices into the three clusters the level's spawn points fall into,
// ordered outward from wherever the player starts: 0 is the surface approach,
// 1 the pad and control bunker, 2 the silo head. Objectives deliberately walk
// 0 → 1 → 2 → 0, so the last leg is the level re-read backwards under fire —
// the cheapest way to make twenty thousand square metres feel like more.
//
// `peak` is the intensity this phase builds toward, and it is the whole shape of
// the campaign in one column: 0 → .28 → .40 → .55 → .44 → .66 → .60. The dip
// at the sabotage beat is not a mistake. A single monotonic ramp reads as a
// difficulty slider being dragged; a dip lets the payload push land as a peak
// instead of as "more of the same, again".

export const MISSION = [
  {
    id: 'insertion', kind: 'move', zone: 0, quiet: true,
    text: 'MOVE UP TO THE MOTOR POOL — MAINTAIN RADIO SILENCE',
    peak: 0, maxT: 150, reach: 6,
  },
  {
    id: 'contact', kind: 'clear', zone: 0,
    text: 'PERIMETER WATCH SIGHTED — ELIMINATE',
    peak: 0.28, budget: 2.2, maxAlive: 3, tokens: 1,
    roster: [['rifleman', 1]],
    valley: [20, 28], maxT: 200,
  },
  {
    id: 'push', kind: 'move', zone: 1,
    text: 'ADVANCE TO THE CONTROL BUNKER',
    peak: 0.40, budget: 3.6, maxAlive: 4, tokens: 2,
    roster: [['rifleman', 3], ['smg', 1]],
    valley: [26, 38], maxT: 260, reach: 6, minT: 55,
  },
  {
    id: 'hold', kind: 'hold', zone: 1, hold: 72,
    text: 'HOLD THE PAD — MAINFRAME WIPE IN PROGRESS',
    peak: 0.55, budget: 5.4, maxAlive: 6, tokens: 2,
    roster: [['rifleman', 4], ['shotgun', 2], ['marksman', 1]],
    valley: [25, 34], maxT: 300, reach: 9,
  },
  {
    id: 'sabotage', kind: 'sabotage', zone: 2, points: 2, hold: 6,
    text: 'CUT GANTRY POWER — BREAKER',
    peak: 0.44, budget: 4.2, maxAlive: 5, tokens: 2,
    roster: [['rifleman', 3], ['marksman', 2], ['smg', 1]],
    valley: [30, 40], maxT: 300, reach: 4.5,
  },
  {
    id: 'payload', kind: 'fetch', zone: 2, hold: 12, minT: 45,
    text: 'RECOVER THE PAYLOAD CORE',
    peak: 0.66, budget: 7.0, maxAlive: 7, tokens: 3,
    roster: [['rifleman', 4], ['shotgun', 2], ['marksman', 1], ['heavy', 1]],
    valley: [20, 28], maxT: 300, reach: 4.5,
  },
  {
    id: 'exfil', kind: 'exfil', zone: 0,
    text: 'CORE SECURED — RUN IT TO THE LZ, MOTOR POOL',
    peak: 0.60, budget: 6.4, maxAlive: 7, tokens: 3,
    roster: [['rifleman', 3], ['shotgun', 1], ['smg', 1], ['heavy', 1]],
    valley: [22, 30], maxT: 300, reach: 7,
  },
];

// Archetype keys are `ai.js`'s, not ours — rifleman / smg / shotgun / marksman /
// heavy. What a body costs out of a wave budget is not its health: a heavy is
// worth three riflemen because it takes three times as long to deal with, and
// the budget is really a stopwatch in disguise.
const COST = { rifleman: 1, smg: 1.2, shotgun: 1.7, marksman: 1.5, heavy: 3 };

const MIN_SPAWN_DIST = 14;     // closer than this and they materialise in your lap
const MAX_SPAWN_DIST = 62;     // further and they never arrive before the valley
const SPAWN_FOV_MARGIN = 0.20; // radians of slack outside the frustum edge
const PICKUP_RADIUS = 1.7;
const RELAX_LEVEL = 0.22;      // intensity below which the fight is genuinely over

const _a = vec3(), _b = vec3(), _fwd = vec3(), _right = vec3(), _up = vec3(0, 1, 0);
// Two separate eye-height scratch vectors, because every sight test takes two
// points at once and a single shared temp would quietly compare a point to itself.
const _e1 = vec3(), _e2 = vec3();

// ── lifecycle ────────────────────────────────────────────────────────────────

export function resetDirector(G) {
  const D = G.director;
  // Keep the four keys main.js and the HUD already know about, and hang the rest
  // of the machine off the same object rather than inventing a parallel one.
  D.wave = 0; D.alive = 0; D.budget = 0; D.nextSpawn = 0; D.phase = 'idle';

  D.state = 'idle';            // build | sustain | fade | relax
  D.idx = -1;                  // index into MISSION
  D.missionT = 0;
  D.intensity = 0; D.target = 0;
  D.skill = 0.55; D.tokens = 1; D.budgetMul = 1;
  D.perf = 0;                  // −1 struggling … +1 cruising
  D.objective = ''; D.marker = null; D.markerReach = 5; D.progress = 0;
  D.subPoint = 0; D.dwell = 0; D.phaseT = 0;
  D.waveT = 0; D.valleyUntil = 0; D.sustainUntil = 0; D.fadeT = 0;
  D.pending = [];              // staggered squad members waiting to appear
  D.zones = null; D.spawnPts = null; D.start = null;
  D.stress = { dmg: 0, kill: 0, prox: 0, ammo: 0, combat: 0 };
  D.lastTaken = 0; D.lastKills = 0; D.lastShots = 0; D.lastHits = 0;
  D.hpAvg = 1; D.clearAvg = 22; D.accAvg = 0.3; D.takenRate = 0; D.difficulty = 1;
  D.emitT = 0; D.pickupSeq = 0;
  D.squadSeq = 0;
  G.pickups = G.pickups || [];
  G.pickups.length = 0;
  return D;
}

export function startMission(G) {
  const D = resetDirector(G);
  D.start = V.clone(G.player.pos);
  buildZones(G);
  D.phase = 'briefing';
  emit(G, 'missionStart', { phases: MISSION.length });
  enterPhase(G, 0);
  return D;
}

// Test/host seam. The AI module owns `spawnEnemy`; until it lands (or in a
// headless driver that has no AI at all) a host can supply its own maker here so
// the pacing loop is still exercisable. Resolution order is: this, then
// `AI.spawnEnemy`, then nothing at all.
export function setSpawnFn(G, fn) { G.director.spawnFn = fn; }
// `resetDirector` deliberately leaves `spawnFn` alone: a host that installed one
// installed it for the process, not for the run.

// ── the frame ────────────────────────────────────────────────────────────────

export function updateDirector(G, dt) {
  const D = G.director;
  if (!G.world || !G.world.ready) return;
  // Death is handled before the mode gate, because `damagePlayer` flips the mode
  // to 'dead' inside the same step — gate first and the failure event never
  // leaves the building.
  if (!G.player.alive && D.phase !== 'idle' && D.phase !== 'complete' && D.phase !== 'failed') {
    failMission(G, 'killed');
  }

  if (D.phase === 'idle') {
    if (G.mode !== 'playing' && G.mode !== 'boot') return;
    startMission(G);
  }
  if (D.phase === 'complete' || D.phase === 'failed') {
    // The mission is over but the world is not: stragglers are still shooting and
    // the music still has to come down off the peak, so the estimate keeps
    // running even though nothing more will ever be spawned against it.
    countAlive(G); measure(G, dt); updatePickups(G, dt);
    D.emitT -= dt;
    if (D.emitT <= 0) { D.emitT = 0.25; emit(G, 'intensity', { value: D.intensity, target: 0, state: 'idle', phase: D.phase, wave: D.wave, alive: D.alive }); }
    return;
  }

  if (G.mode !== 'playing' && G.mode !== 'boot') return;

  D.missionT += dt;
  D.phaseT += dt;

  // The level agent may finish populating spawns after the first frame; noticing
  // that costs one integer compare a tick and saves a mission spawned into a
  // level that did not exist yet.
  if (!D.spawnPts || D.spawnPts.length !== (G.world.spawns ? G.world.spawns.length : 0)) buildZones(G);

  countAlive(G);
  measure(G, dt);
  adapt(G, dt);
  runPacing(G, dt);
  emergencyCache(G);
  flushPending(G);
  updateObjective(G, dt);
  updatePickups(G, dt);

  // Four intensity samples a second is plenty for a music layer to chase and it
  // keeps the event queue from carrying 120 near-identical numbers per second.
  D.emitT -= dt;
  if (D.emitT <= 0) {
    D.emitT = 0.25;
    emit(G, 'intensity', {
      value: D.intensity, target: D.target, state: D.state,
      phase: D.phase, wave: D.wave, alive: D.alive,
    });
  }
}

// ── stress estimate ──────────────────────────────────────────────────────────
//
// Six signals, each normalised to 0..1 and each answering a different flavour of
// "is this hard right now": damage taken, how many live men are close and looking
// at you, health, ammunition, time in contact, kills. Damage dominates because it
// is the only one the player feels in their hands; proximity is second, because a
// rifleman eight metres away is stressful whether or not he has hit you yet.
//
// The output is smoothed asymmetrically: fast up, slow down. That mirrors how
// arousal actually decays — you are still breathing hard ten seconds after the
// last body drops — and it stops the curve from flickering between two spawns.

function measure(G, dt) {
  const D = G.director, p = G.player, s = D.stress;

  const tookNow = Math.max(0, G.stats.taken - D.lastTaken); D.lastTaken = G.stats.taken;
  // Damage per second, averaged over about half a minute. `hpAvg` alone lies
  // about a player who is being hurt constantly and healing constantly — which
  // is exactly what a struggling player looks like from the outside.
  D.takenRate += (tookNow / Math.max(dt, 1e-5) - D.takenRate) * (1 - Math.exp(-dt / 30));
  const killsNow = Math.max(0, G.stats.kills - D.lastKills); D.lastKills = G.stats.kills;

  // ~6 s and ~9 s memories. Long enough that a burst of chip damage reads as one
  // event, short enough that a fight two valleys ago is genuinely forgotten.
  s.dmg = s.dmg * Math.exp(-dt / 6) + tookNow;
  s.kill = s.kill * Math.exp(-dt / 9) + killsNow;

  // Proximity, weighted by whether they can actually see you. A flanker behind a
  // wall is worth less than half of one holding an angle on your chest.
  let prox = 0, near = 0;
  const eye = p.pos;
  for (let i = 0; i < G.enemies.length; i++) {
    const e = G.enemies[i];
    if (!isAlive(e)) continue;
    const ep = e.pos || e; if (!ep || ep.x === undefined) continue;
    const d = V.dist(eye, ep);
    if (d > 34) continue;
    near++;
    const t = clamp(1 - (d - 3) / 31, 0, 1);
    // `e.pos` is feet, `e.eyePos` is the eye — use the eye where the AI offers
    // one, because a sight line to someone's boots is not a sight line to them.
    const look = e.eyePos && Number.isFinite(e.eyePos.y) ? e.eyePos : aimPoint(ep, _e1);
    prox += t * t * (lineOfSight(G.world, eye, look) ? 1 : 0.42);
  }
  s.prox = 1 - Math.exp(-prox * 0.62);

  const w = G.weapons.slots[G.weapons.active];
  if (w) {
    const magFrac = clamp(w.ammo / Math.max(1, w.mag), 0, 1);
    const resFrac = clamp(w.res / Math.max(1, w.mag * 4), 0, 1);
    s.ammo = clamp(1 - (0.45 * magFrac + 0.55 * resFrac), 0, 1);
  }

  // Time in contact, capped at 45 s. Being under fire for a minute is tiring in
  // a way that being under fire for ten seconds is not, and the curve should say
  // so even if the player is winning comfortably.
  const engaged = near > 0 || tookNow > 0;
  s.combat = engaged ? Math.min(45, s.combat + dt) : Math.max(0, s.combat - dt * 2.2);

  const hpDef = 1 - clamp(p.hp / Math.max(1, p.maxHp), 0, 1);
  const raw = clamp(
    0.34 * (1 - Math.exp(-s.dmg / 45)) +
    0.30 * s.prox +
    0.14 * hpDef +
    0.09 * s.ammo +
    0.08 * (s.combat / 45) +
    0.05 * (1 - Math.exp(-s.kill / 5)), 0, 1);

  const rate = raw > D.intensity ? 2.2 : 0.55;
  D.intensity += (raw - D.intensity) * (1 - Math.exp(-rate * dt));
  if (D.intensity < 1e-4) D.intensity = 0;
}

// ── adaptive difficulty ──────────────────────────────────────────────────────
//
// Four read-outs of how the player is actually doing — accuracy, health held,
// damage taken per second, and how long a wave takes them to clear — blended into
// one number in −1..+1 and then smoothed over about fourteen seconds so it never
// moves fast enough to be noticed as a rubber band. What it moves is the enemy
// skill scalar, `ai.js`'s global fairness multiplier, how many squads press at
// once, and the wave budget.
//
// The bounds are the whole design: a player at +1 still faces skill 0.92 and a
// full budget, so cruising never turns the game off. A player at −1 still faces
// skill 0.38 and two-body squads, so struggling never turns it into a walk.

function adapt(G, dt) {
  const D = G.director;
  const k = 1 - Math.exp(-dt / 14);

  const shots = G.stats.shots - D.lastShots, hits = G.stats.hits - D.lastHits;
  if (shots >= 8) {
    D.accAvg += (clamp(hits / shots, 0, 1) - D.accAvg) * 0.34;
    D.lastShots = G.stats.shots; D.lastHits = G.stats.hits;
  }
  D.hpAvg += (clamp(G.player.hp / Math.max(1, G.player.maxHp), 0, 1) - D.hpAvg) * k;

  const accTerm = clamp((D.accAvg - 0.26) / 0.34, -1, 1);
  const hpTerm = clamp((D.hpAvg - 0.68) / 0.30, -1, 1);
  // 0.9 hp/s of incoming damage is a fair fight; 2.3 is a player being taken
  // apart, whatever their health bar happens to read between waves.
  const dmgTerm = clamp((0.9 - D.takenRate) / 1.4, -1, 1);
  const clearTerm = clamp((26 - D.clearAvg) / 18, -1, 1);
  const want = clamp(0.34 * accTerm + 0.26 * hpTerm + 0.26 * dmgTerm + 0.14 * clearTerm, -1, 1);
  D.perf += (want - D.perf) * k;

  const ph = phase(D);
  D.skill = clamp(0.55 + 0.30 * D.perf + (ph && ph.peak >= 0.65 ? 0.06 : 0), 0.38, 0.92);
  D.budgetMul = clamp(0.78 + 0.42 * D.perf, 0.62, 1.34);
  D.tokens = Math.round(clamp((ph ? ph.tokens || 1 : 1) + D.perf * 1.2, 1, 4));
  // `squad.js` caps attackers per blackboard and does not read this, so `tokens`
  // is spent in `commitSquad` by opening a second squad lane rather than by
  // being handed over. It stays on the state object because the HUD debug view
  // and the tests both want to see what the director intended.
  D.attackTokens = D.tokens;

  // `ai.js` keeps a global fairness multiplier on top of each man's own skill and
  // says outright that the director owns it, so the director turns it. Changed
  // only when it has actually drifted — this runs 120 times a second.
  if (typeof AI.setDifficulty === 'function') {
    const want = clamp(0.78 + 0.40 * D.perf, 0.60, 1.25);
    if (Math.abs(want - (D.difficulty || 0)) > 0.015) { D.difficulty = want; AI.setDifficulty(G, want); }
  }
}

// ── the pacing loop ──────────────────────────────────────────────────────────
//
// build → sustain → fade → relax → build. Only `build` and a starved `sustain`
// are allowed to spawn; `fade` and `relax` are the tap being closed.
//
// The valley is 20–40 s depending on the phase, because that is about how long a
// player takes to reload, reposition, re-read the room and decide where they are
// going next. Cut it to ten and the next wave reads as the same fight continuing
// through a lull; stretch it past fifty and they go looking for the fight, which
// is worse, because then they meet it on the level's terms instead of theirs.

function runPacing(G, dt) {
  const D = G.director, ph = phase(D);
  if (!ph || ph.quiet) { D.state = 'quiet'; D.target = 0; return; }
  const t = G.time.t;
  D.target = ph.peak;

  // Wave-level patience. `fade` has its own, but a wave can also hang in `build`
  // — the alive cap full of men the player has decided to ignore, budget unspent,
  // nothing able to happen. Ninety seconds is longer than any wave that is
  // actually working, so reaching it means this one is not, and the valley is
  // more use than waiting.
  if (D.state !== 'relax' && D.state !== 'quiet' && t - D.waveT > 90) { enterValley(G, ph); return; }

  switch (D.state) {
    case 'build':
      if (D.intensity >= D.target) {
        // Hold the top briefly rather than immediately backing off, so the peak
        // has a plateau to be recognised by instead of a single spike.
        D.state = 'sustain';
        D.sustainUntil = t + 4 + G.rng() * 5;
      } else if (D.budget <= 0) {
        // Spent, whether or not the field is clear. The wave is over as a
        // *spending* decision the moment the last man is paid for; whether the
        // player has finished with them is `fade`'s problem, and it has its own
        // patience timer for the case where they never do.
        D.state = 'fade'; D.fadeT = 0;
      } else if (D.alive < maxAlive(D, ph) &&
                 (t >= D.nextSpawn || D.alive === 0)) {
        // An empty field mid-wave means they cleared the last squad faster than
        // the spacing expected. Waiting out the timer there reads as the game
        // pausing, so the next door opens immediately instead.
        commitSquad(G, ph);
      }
      break;

    case 'sustain':
      // If they clear the plateau early, top it up rather than dropping straight
      // into a valley they did not earn.
      if (D.budget > 0 && t >= D.nextSpawn &&
          (D.alive === 0 || D.intensity < D.target - 0.15)) commitSquad(G, ph);
      else if (t >= D.sustainUntil) { D.state = 'fade'; D.fadeT = 0; }
      break;

    case 'fade':
      D.fadeT += dt;
      // Nothing new arrives here. We are waiting for the fight the player is
      // already in to actually finish — or, if they are hiding from it, for the
      // patience budget to run out so the valley still happens on schedule.
      if ((D.alive === 0 && D.intensity < RELAX_LEVEL + 0.12) ||
          D.intensity < RELAX_LEVEL || D.fadeT > 45) enterValley(G, ph);
      break;

    case 'relax':
      if (t >= D.valleyUntil) startWave(G, ph);
      break;

    default:
      startWave(G, ph);
  }
}

function startWave(G, ph) {
  const D = G.director;
  D.wave++;
  D.budget = ph.budget * D.budgetMul;
  D.waveT = G.time.t;
  D.state = 'build';
  D.nextSpawn = G.time.t;
  emit(G, 'waveStart', {
    wave: D.wave, phase: D.phase, budget: D.budget,
    target: ph.peak, skill: D.skill, tokens: D.tokens,
  });
}

function enterValley(G, ph) {
  const D = G.director, t = G.time.t;
  if (D.wave > 0) {
    const dur = t - D.waveT;
    // Time-to-clear feeds the difficulty read; a long wave means they are
    // struggling with it whatever their accuracy says.
    D.clearAvg += (clamp(dur, 6, 90) - D.clearAvg) * 0.3;
    emit(G, 'waveEnd', { wave: D.wave, phase: D.phase, duration: dur, cleared: D.alive === 0 });
  }
  const [lo, hi] = ph.valley || [24, 34];
  // A hurt player gets a longer valley. Health regenerates on a timer they do
  // not control, so shortening their breather is just deciding they lose.
  const hurt = 1 - clamp(G.player.hp / Math.max(1, G.player.maxHp), 0, 1);
  D.valleyUntil = t + (lo + G.rng() * (hi - lo)) * (1 + 0.45 * hurt) * (D.perf > 0.4 ? 0.85 : 1);
  D.state = 'relax';
  D.budget = 0;
  restock(G, ph);
}

// ── squads ───────────────────────────────────────────────────────────────────
//
// A squad is a rifleman core plus at most one specialist, and the specialist is
// what the player actually remembers: the shotgunner is the reason you cannot
// stand still, the marksman is the reason you cannot cross the open, the heavy
// is the reason you have to leave the room you liked. Roll them rarely enough
// that each arrival still means something.

function pickComposition(G, ph, budget) {
  const D = G.director;
  const roster = ph.roster || [['rifleman', 1]];
  const out = [];
  let left = Math.min(budget, 8);
  let specialists = 0;

  // Bigger squads later, and slightly bigger when the player is cruising.
  const wantSize = clamp(Math.round(1.6 + budget * 0.42 + D.perf * 0.5), 1, 5);

  while (out.length < wantSize && left >= COST.rifleman) {
    let type = 'rifleman';
    if (specialists < 1 && out.length > 0 && G.rng() < 0.55) {
      const t = weightedPick(G, roster.filter((r) => r[0] !== 'rifleman'));
      if (t && COST[t] <= left) { type = t; specialists++; }
    }
    if (COST[type] > left) type = 'rifleman';
    out.push(type);
    left -= COST[type];
  }
  if (!out.length) out.push('rifleman');
  return out;
}

function weightedPick(G, list) {
  if (!list || !list.length) return null;
  let total = 0;
  for (const [, w] of list) total += w;
  let r = G.rng() * total;
  for (const [id, w] of list) { r -= w; if (r <= 0) return id; }
  return list[list.length - 1][0];
}

function commitSquad(G, ph) {
  const D = G.director;
  const comp = pickComposition(G, ph, D.budget);
  const from = pickSpawn(G, { away: true });
  if (!from) { D.nextSpawn = G.time.t + 2; return; }

  // Attack tokens are per-blackboard in `squad.js` and cap at three, so the way
  // the director asks for more simultaneous pressure is to open a second lane:
  // two squads pushing from two ids is what "four men may shoot at once" means
  // in practice, and it also puts them on two sets of callouts instead of one.
  const lane = D.tokens >= 3 ? (D.squadSeq % 2 ? 'bravo' : 'alpha') : 'alpha';
  const squad = ++D.squadSeq;

  // The perimeter watch is a garrison — nobody phoned them. Everything after the
  // first shot of the mission was radioed in and arrives knowing roughly where
  // the player is, which is the difference between an ambush and a surprise.
  const alerted = D.phase !== 'contact' || D.wave > 1;

  let cost = 0;
  for (let i = 0; i < comp.length; i++) {
    const kind = comp[i];
    cost += COST[kind];
    // A squad that appears as one instant of four bodies reads as a spawn event.
    // Trickled over a second and a half it reads as a doorway.
    D.pending.push({
      at: G.time.t + i * (0.28 + G.rng() * 0.34),
      kind, squad, lane, alerted, from: pickNear(G, from, i),
    });
  }
  D.budget -= cost;

  // Spacing between squads shrinks as the gap to the target intensity grows —
  // if the curve is far below where it should be, stop being polite about it.
  const deficit = clamp(D.target - D.intensity, 0, 1);
  D.nextSpawn = G.time.t + (10 - 6 * deficit) + G.rng() * 2.5;

  emit(G, 'reinforcements', {
    wave: D.wave, squad, lane, count: comp.length, composition: comp.slice(),
    from: V.clone(from), phase: D.phase, skill: D.skill, alerted,
  });
}

function flushPending(G) {
  const D = G.director;
  if (!D.pending.length) return;
  const t = G.time.t;
  for (let i = D.pending.length - 1; i >= 0; i--) {
    const p = D.pending[i];
    if (t < p.at) continue;
    D.pending.splice(i, 1);
    spawnOne(G, p);
  }
}

function spawnOne(G, p) {
  const D = G.director;
  const fn = typeof D.spawnFn === 'function' ? D.spawnFn
    : (AI && typeof AI.spawnEnemy === 'function' ? AI.spawnEnemy : null);
  if (!fn) return null;   // the AI module has not landed yet; degrade, do not throw

  const pos = p.from;
  const marker = D.marker || G.player.pos;
  // Face them at the objective, not at the player: a man who turns to look at you
  // the instant he exists is the tell that he did not walk in.
  const yaw = Math.atan2(-(marker.x - pos.x), -(marker.z - pos.z));

  const n0 = G.enemies.length;
  let made = null;
  try {
    made = fn(G, {
      pos: { x: pos.x, y: pos.y, z: pos.z },
      yaw,
      kind: p.kind,
      skill: D.skill,
      squad: p.lane || 'alpha',
      alerted: p.alerted,
      // A garrison that has not been called gets a beat of patrol first, so the
      // player can find them rather than being found — the whole point of the
      // quiet approach is that it can end on the player's terms.
      patrol: p.alerted ? null : patrolFor(G, pos),
    });
  } catch { return null; }   // a broken spawner must not take the mission with it

  // Whatever it hands back, the canonical list is `G.enemies`. If the maker only
  // returned the record, adopt it; if it pushed, tag what it pushed.
  if (made && typeof made === 'object' && G.enemies.indexOf(made) === -1) G.enemies.push(made);
  for (let i = n0; i < G.enemies.length; i++) {
    const e = G.enemies[i];
    if (e && typeof e === 'object') { e.dirWave = D.wave; e.dirSquad = p.squad; }
  }
  return made;
}

// Two nearby spawn points make a short beat to walk between. Not a route around
// the level — a patrol that wanders off is a patrol the player never meets.
function patrolFor(G, pos) {
  const D = G.director;
  if (!D.spawnPts) return null;
  let best = null, bd = Infinity;
  for (const s of D.spawnPts) {
    const d = V.dist2(s.p, pos);
    if (d > 4 && d < bd) { bd = d; best = s.p; }
  }
  return best ? [{ x: pos.x, y: pos.y, z: pos.z }, { x: best.x, y: best.y, z: best.z }] : null;
}

// ── spawn selection ──────────────────────────────────────────────────────────
//
// Rules, in order of how badly breaking them hurts: never inside the frustum,
// never closer than 14 m, never further than 62 m, and prefer somewhere behind
// the player with a plausible line to where they are going. The frustum test is
// the real one — a body that fades in at the edge of the screen costs more
// credibility than twenty seconds of bad pathing.

export function pickSpawn(G, opts = {}) {
  const D = G.director;
  const pts = D.spawnPts;
  if (!pts || !pts.length) return null;
  const p = G.player;
  const marker = D.marker || p.pos;

  let best = null, bestScore = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const s = pts[i].p;
    const d = V.dist(p.pos, s);
    if (d < MIN_SPAWN_DIST || d > MAX_SPAWN_DIST) continue;
    if (inView(G, s)) continue;

    V.sub(_a, s, p.pos); _a.y = 0; V.norm(_a);
    lookDir(p.yaw, 0, _fwd);
    const behind = -V.dot(_a, _fwd);            // +1 directly behind, −1 dead ahead

    // The distance sweet spot is 20–34 m: far enough to arrive out of sight,
    // close enough that they arrive at all before the valley starts.
    const band = 1 - clamp(Math.abs(d - 27) / 22, 0, 1);

    // "Plausible path" without a navmesh: something that can see the player or
    // the objective can, near enough always, walk to it.
    const open = (lineOfSight(G.world, aimPoint(s, _e1), aimPoint(p.pos, _e2)) ? 0.5 : 0) +
                 (lineOfSight(G.world, aimPoint(s, _e1), aimPoint(marker, _e2)) ? 0.35 : 0);

    // Bias toward the zone the objective is in, so pressure comes from the
    // direction of travel rather than uniformly out of the walls.
    const zoneBonus = pts[i].zone === D.zoneIdx ? 0.25 : 0;

    let score = 0.9 * behind + 0.8 * band + open + zoneBonus + G.rng() * 0.35;
    if (opts.away === false) score -= 0.9 * behind;
    if (D.lastSpawnPt === i) score -= 0.6;      // spread arrivals across doorways

    if (score > bestScore) { bestScore = score; best = i; }
  }
  if (best == null) return null;
  D.lastSpawnPt = best;
  return pts[best].p;
}

// True frustum test in camera space, with a margin: an enemy appearing just off
// the edge of the screen is nearly as bad as one appearing on it, because the
// player's next mouse movement is usually toward the noise.
function inView(G, s) {
  const p = G.player;
  lookDir(p.yaw, p.pitch, _fwd);
  V.cross(_right, _fwd, _up); V.norm(_right);
  const upx = _right.y * _fwd.z - _right.z * _fwd.y;
  const upy = _right.z * _fwd.x - _right.x * _fwd.z;
  const upz = _right.x * _fwd.y - _right.y * _fwd.x;

  V.sub(_b, s, p.pos);
  const z = V.dot(_b, _fwd);
  if (z <= 0) return false;                     // behind the camera plane
  const x = V.dot(_b, _right);
  const y = _b.x * upx + _b.y * upy + _b.z * upz;

  const vHalf = (G.settings.fov * Math.PI / 180) * 0.5 + SPAWN_FOV_MARGIN;
  const hHalf = Math.atan(Math.tan(vHalf) * (16 / 9)) + SPAWN_FOV_MARGIN;
  if (Math.abs(Math.atan2(x, z)) > hHalf) return false;
  if (Math.abs(Math.atan2(y, z)) > vHalf) return false;
  // Inside the cone — only actually visible if nothing is in the way.
  return lineOfSight(G.world, p.pos, aimPoint(s, _e1));
}

// Squadmates arrive from around the same doorway, not stacked in one voxel.
function pickNear(G, base, i) {
  if (!i) return V.clone(base);
  const a = G.rng() * Math.PI * 2, r = 1.1 + G.rng() * 1.8;
  return { x: base.x + Math.cos(a) * r, y: base.y, z: base.z + Math.sin(a) * r };
}

// ── objectives ───────────────────────────────────────────────────────────────

function enterPhase(G, idx) {
  const D = G.director;
  if (idx >= MISSION.length) { completeMission(G); return; }
  const ph = MISSION[idx];
  D.idx = idx;
  D.phase = ph.id;
  D.phaseT = 0;
  D.subPoint = 0;
  D.dwell = 0;
  D.progress = 0;
  D.zoneIdx = ph.zone;
  D.markerReach = ph.reach || 5;
  D.marker = zonePoint(G, ph.zone, 0);
  D.state = ph.quiet ? 'quiet' : 'relax';
  D.budget = 0;
  D.pending.length = 0;
  // Even the first hostile phase opens with a short valley, so the objective
  // text lands before the first magazine does.
  D.valleyUntil = G.time.t + (ph.quiet ? 0 : 6 + G.rng() * 5);
  D.waveT = G.time.t;
  announce(G);
  if (ph.peak >= 0.55) restock(G, ph, true);   // the cache before the peak, deliberate
}

function announce(G) {
  const D = G.director, ph = phase(D);
  if (!ph) return;
  let text = ph.text;
  if (ph.kind === 'sabotage') text = `${ph.text} ${D.subPoint + 1}/${ph.points}`;
  D.objective = text;
  emit(G, 'objective', {
    text, phase: ph.id, kind: ph.kind,
    index: D.idx + 1, total: MISSION.length,
    marker: D.marker ? V.clone(D.marker) : null,
    reach: D.markerReach, progress: D.progress,
  });
}

function updateObjective(G, dt) {
  const D = G.director, ph = phase(D);
  if (!ph) return;
  const p = G.player;
  const at = D.marker ? horizDist(p.pos, D.marker) < D.markerReach : false;

  switch (ph.kind) {
    case 'move':
      // Arriving finishes the leg — unless they arrived by running past a live
      // squad, in which case the objective waits for the fight to resolve. It
      // reads as "hold here a moment" rather than as a lock, because the moment
      // the field is clear it releases on its own.
      if (at && (D.alive === 0 || D.phaseT >= (ph.minT || 0))) return advance(G);
      break;

    case 'exfil':
      // No gate on the last one. The run home ends when you reach the LZ, under
      // fire or not; that is the whole promise the phase makes.
      if (at) return advance(G);
      break;

    case 'clear':
      // First contact ends when the bodies do, not when a timer says so — this
      // is the beat that teaches the player what a fight here costs.
      if (D.wave > 0 && D.alive === 0 && D.budget <= 0 && !D.pending.length) return advance(G);
      break;

    case 'hold': {
      // The wipe only runs while they are on the pad, and it bleeds back slowly
      // if they leave. Slowly, because punishing a repositioning player for
      // repositioning is how a hold objective turns into a corner to sit in.
      if (at) D.dwell = Math.min(ph.hold, D.dwell + dt);
      else D.dwell = Math.max(0, D.dwell - dt * 0.35);
      D.progress = D.dwell / ph.hold;
      if (D.dwell >= ph.hold) return advance(G);
      break;
    }

    case 'sabotage': {
      if (at) D.dwell += dt; else D.dwell = Math.max(0, D.dwell - dt * 1.5);
      D.progress = (D.subPoint + clamp(D.dwell / ph.hold, 0, 1)) / ph.points;
      if (D.dwell >= ph.hold) {
        D.dwell = 0;
        D.subPoint++;
        emit(G, 'objectiveDone', { phase: ph.id, point: D.subPoint, total: ph.points });
        if (D.subPoint >= ph.points) return advance(G);
        D.marker = zonePoint(G, ph.zone, D.subPoint);
        announce(G);
      }
      break;
    }

    case 'fetch': {
      // Cutting the core loose pins the player to one spot for twelve seconds,
      // which is the entire reason this is the peak: the hardest wave of the
      // mission arrives while they are the least able to move away from it. And
      // like the push, they do not get to leave with it mid-ambush.
      if (at) D.dwell += dt; else D.dwell = Math.max(0, D.dwell - dt * 1.5);
      D.progress = clamp(D.dwell / ph.hold, 0, 1);
      if (D.dwell >= ph.hold && (D.alive === 0 || D.phaseT >= (ph.minT || 0))) return advance(G);
      break;
    }
  }

  // A mission that cannot deadlock is worth the four lines it costs. If a phase
  // overruns — a spawner that never landed, an objective the player cannot
  // physically reach — it times out and the campaign carries on.
  if (ph.maxT && D.phaseT > ph.maxT) advance(G, true);
}

function advance(G, timedOut = false) {
  const D = G.director, ph = phase(D);
  emit(G, 'objectiveComplete', { phase: ph.id, index: D.idx + 1, total: MISSION.length, timedOut });
  enterPhase(G, D.idx + 1);
}

function completeMission(G) {
  const D = G.director;
  D.phase = 'complete'; D.state = 'idle'; D.target = 0; D.budget = 0; D.pending.length = 0;
  D.objective = 'EXFIL COMPLETE';
  emit(G, 'objective', { text: D.objective, phase: 'complete', kind: 'done', index: MISSION.length, total: MISSION.length, marker: null });
  emit(G, 'missionComplete', {
    time: D.missionT, kills: G.stats.kills, shots: G.stats.shots,
    accuracy: G.stats.shots ? G.stats.hits / G.stats.shots : 0,
    taken: G.stats.taken, waves: D.wave,
  });
}

function failMission(G, reason) {
  const D = G.director;
  if (D.phase === 'failed') return;
  D.phase = 'failed'; D.state = 'idle'; D.target = 0; D.pending.length = 0;
  emit(G, 'missionFailed', { reason, phase: D.objective, time: D.missionT, kills: G.stats.kills });
}

// ── pickups ──────────────────────────────────────────────────────────────────
//
// Placed by the director, at the moment the pacing says the player is about to
// need them: at the top of a valley, and unconditionally before any phase that
// peaks above 0.7. A cache found thirty seconds before the hardest fight of the
// mission is a piece of level design; the same cache found at random is litter.

function restock(G, ph, force = false) {
  const w = G.weapons.slots[G.weapons.active];
  const hpFrac = clamp(G.player.hp / Math.max(1, G.player.maxHp), 0, 1);
  const resFrac = w ? clamp(w.res / Math.max(1, w.mag * 4), 0, 1) : 1;

  if (force || resFrac < 0.55) placePickup(G, 'ammo', w ? w.mag * 2 : 60);
  if (force ? hpFrac < 0.9 : hpFrac < 0.65) placePickup(G, 'health', 35);
  void ph;
}

// The valley is where restocking is supposed to happen, but a player can run the
// magazine out in the middle of a peak that has not finished yet — and a shooter
// where you are stood in front of four men with an empty rifle and no way out is
// not hard, it is broken. One cache, on a cooldown, only when it is genuinely
// that bad.
function emergencyCache(G) {
  const D = G.director;
  const w = G.weapons.slots[G.weapons.active];
  if (!w || w.res + w.ammo > w.mag) return;
  if (G.time.t - (D.lastCache || -99) < 45) return;
  for (const it of (G.pickups || [])) if (it.kind === 'ammo' && !it.taken) return;
  placePickup(G, 'ammo', w.mag * 2);
}

export function placePickup(G, kind, amount) {
  const D = G.director;
  const p = G.player;
  const marker = D.marker || p.pos;
  let best = null, bestScore = -Infinity;

  // Somewhere on the way to the objective, in sight, not underfoot. Between six
  // and thirty metres is "you will walk past this", which is the only placement
  // that works without a waypoint telling them it exists.
  const pool = (G.world.cover && G.world.cover.length ? G.world.cover : (D.spawnPts || []));
  for (let i = 0; i < pool.length; i++) {
    const c = pool[i];
    const q = c.p || c.pos || c;
    if (!q || q.x === undefined) continue;
    const d = V.dist(p.pos, q);
    if (d < 5 || d > 32) continue;
    V.sub(_a, marker, p.pos); _a.y = 0; V.norm(_a);
    V.sub(_b, q, p.pos); _b.y = 0; V.norm(_b);
    const onRoute = V.dot(_a, _b);
    const score = onRoute * 1.2 + (lineOfSight(G.world, aimPoint(p.pos, _e1), aimPoint(q, _e2)) ? 0.6 : 0)
      - Math.abs(d - 16) / 24 + G.rng() * 0.3;
    if (score > bestScore) { bestScore = score; best = q; }
  }
  const pos = best ? { x: best.x, y: best.y, z: best.z }
    : { x: marker.x + (G.rng() - 0.5) * 4, y: marker.y, z: marker.z + (G.rng() - 0.5) * 4 };

  if (kind === 'ammo') D.lastCache = G.time.t;
  const item = { id: ++D.pickupSeq, kind, amount, pos, taken: false, t: G.time.t };
  G.pickups = G.pickups || [];
  G.pickups.push(item);
  emit(G, 'pickupSpawn', { id: item.id, kind, amount, pos: V.clone(pos) });
  return item;
}

function updatePickups(G, dt) {
  const list = G.pickups;
  if (!list || !list.length) return;
  const p = G.player;
  for (let i = list.length - 1; i >= 0; i--) {
    const it = list[i];
    if (it.taken) { list.splice(i, 1); continue; }
    if (horizDist(p.pos, it.pos) > PICKUP_RADIUS) continue;
    if (Math.abs(p.pos.y - it.pos.y) > 2.4) continue;

    let took = 0;
    if (it.kind === 'ammo') {
      const w = G.weapons.slots[G.weapons.active];
      if (!w) continue;
      const cap = w.mag * 7;
      if (w.res >= cap) continue;               // full: leave it for the way back
      took = Math.min(it.amount, cap - w.res);
      w.res += took;
    } else {
      if (p.hp >= p.maxHp) continue;
      took = Math.min(it.amount, p.maxHp - p.hp);
      p.hp += took;
    }
    it.taken = true;
    emit(G, 'pickupTaken', { id: it.id, kind: it.kind, amount: took, pos: V.clone(it.pos) });
  }
  void dt;
}

// ── zones ────────────────────────────────────────────────────────────────────
//
// The level agent owns the geometry, so the director derives its three zones
// from whatever it was given rather than hard-coding coordinates that will be
// wrong by tomorrow. If the level declares `world.zones`, that wins. Otherwise
// the spawn points are split into three clusters along the dominant horizontal
// axis and ordered outward from where the player started — which, for a level
// laid out as an approach, a pad and a silo, lands exactly where you would have
// put them by hand.

function buildZones(G) {
  const D = G.director;
  const raw = G.world.spawns || [];
  const pts = [];
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i];
    const p = s && s.pos ? s.pos : s;
    if (!p || !Number.isFinite(p.x)) continue;
    pts.push({ p: { x: p.x, y: p.y, z: p.z }, zone: 0, tag: (s && s.tag) || '' });
  }
  D.spawnPts = pts;

  const declared = G.world.zones;
  if (declared && declared.length >= 3) {
    D.zones = declared.slice(0, 3).map((z, i) => {
      const c = z.center || z.pos || (z.min && z.max
        ? { x: (z.min.x + z.max.x) / 2, y: (z.min.y + z.max.y) / 2, z: (z.min.z + z.max.z) / 2 }
        : { x: 0, y: C.EYE_STAND, z: 0 });
      return { i, c, pts: [], name: z.name || `zone${i}` };
    });
    for (const s of pts) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < D.zones.length; i++) {
        const d = V.dist2(s.p, D.zones[i].c);
        if (d < bd) { bd = d; bi = i; }
      }
      s.zone = bi; D.zones[bi].pts.push(s.p);
    }
    return;
  }

  if (!pts.length) { D.zones = null; return; }

  // Dominant axis: whichever of X/Z the points are actually spread along.
  let mx = 0, mz = 0;
  for (const s of pts) { mx += s.p.x; mz += s.p.z; }
  mx /= pts.length; mz /= pts.length;
  let vx = 0, vz = 0;
  for (const s of pts) { vx += (s.p.x - mx) ** 2; vz += (s.p.z - mz) ** 2; }
  const axis = vx >= vz ? 'x' : 'z';

  const order = pts.slice().sort((a, b) => a.p[axis] - b.p[axis]);
  const groups = [[], [], []];
  for (let i = 0; i < order.length; i++) groups[Math.min(2, Math.floor(i * 3 / order.length))].push(order[i]);
  for (const g of groups) if (!g.length) g.push(order[0]);

  const zones = groups.map((g) => {
    const c = { x: 0, y: 0, z: 0 };
    for (const s of g) V.add(c, s.p, 1 / g.length);
    // Snap the centroid to the nearest real spawn point: a centroid can easily
    // land inside a wall, and a marker inside a wall is an unreachable objective.
    let best = g[0].p, bd = Infinity;
    for (const s of g) { const d = V.dist2(c, s.p); if (d < bd) { bd = d; best = s.p; } }
    return { c: { x: best.x, y: best.y, z: best.z }, pts: g.map((s) => s.p) };
  });

  const from = D.start || G.player.pos;
  zones.sort((a, b) => V.dist2(from, a.c) - V.dist2(from, b.c));
  zones.forEach((z, i) => { z.i = i; });
  for (const s of pts) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < zones.length; i++) { const d = V.dist2(s.p, zones[i].c); if (d < bd) { bd = d; bi = i; } }
    s.zone = bi;
  }
  D.zones = zones;
  if (D.idx >= 0) { const ph = phase(D); if (ph) D.marker = zonePoint(G, ph.zone, D.subPoint); }
}

// Sub-points inside a zone (the two breakers) are picked as far apart as the
// cluster allows, so "go to the next breaker" is a walk and not a pivot.
function zonePoint(G, zoneIdx, k) {
  const D = G.director;
  if (!D.zones || !D.zones.length) return V.clone(G.player.pos);
  const z = D.zones[Math.min(zoneIdx, D.zones.length - 1)];
  if (!k) return { x: z.c.x, y: z.c.y, z: z.c.z };
  let best = z.c, bd = -1;
  for (const p of z.pts) { const d = V.dist2(p, z.c); if (d > bd) { bd = d; best = p; } }
  return { x: best.x, y: best.y, z: best.z };
}

// ── odds and ends ────────────────────────────────────────────────────────────

function phase(D) { return D.idx >= 0 && D.idx < MISSION.length ? MISSION[D.idx] : null; }

function maxAlive(D, ph) {
  return Math.max(2, Math.round((ph.maxAlive || 4) + D.perf * 1.4));
}

function countAlive(G) {
  const D = G.director;
  let n = 0;
  for (let i = 0; i < G.enemies.length; i++) if (isAlive(G.enemies[i])) n++;
  D.alive = n;
}

function isAlive(e) {
  if (!e || typeof e !== 'object') return false;
  if (e.alive === false || e.dead === true || e.state === 'dead' || e.removed === true) return false;
  if (typeof e.hp === 'number' && e.hp <= 0) return false;
  return true;
}

// Chest height, not floor height: a line of sight to someone's boots is not a
// line of sight to them.
function aimPoint(p, out = _e1) {
  out.x = p.x; out.y = p.y < 1.2 ? p.y + 1.2 : p.y; out.z = p.z;
  return out;
}

function horizDist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
