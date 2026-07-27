// Squad coordination — a blackboard, not a hierarchy.
//
// Individually competent enemies still read as a mob: three of them take the
// same doorway, all four shoot from the same angle, and the fight collapses into
// one problem the player solves once. The fix used since Halo is embarrassingly
// small — a shared scratchpad plus a handful of tokens that only one agent may
// hold at a time. Nobody is commanding anybody. Each enemy still decides for
// itself; it just cannot decide to do the thing a squadmate already claimed.
//
// Everything here is plain data so the whole thing survives being driven by the
// headless suite, and every list is rebuilt from the live enemy array each tick
// so a dead or despawned member cannot hold a token forever.

export const TOKEN = { ATTACK: 'attack', FLANK: 'flank', SUPPRESS: 'suppress' };

export const EARSHOT = 28;        // metres a shouted callout carries
export const COMMS_DELAY = 0.35;  // seconds between one man seeing and the rest knowing

export function createBlackboard(id) {
  return {
    id,
    members: [],                // enemy ids, rebuilt every tick
    size: 0,
    alive: 0,

    // What the squad collectively believes about the player. `conf` decays with
    // age: at 0 it is a rumour worth sweeping, at 1 it is a man looking at him.
    lastKnown: null,            // { x, y, z }
    lastKnownT: -999,
    lastKnownVel: { x: 0, y: 0, z: 0 },
    conf: 0,
    contacts: 0,                // how many members have eyes on him right now
    alert: 0,                   // 0 unaware · 1 something happened · 2 engaged

    attackers: [],              // token holders, capped by maxAttackers()
    flanker: null,
    suppressor: null,

    spots: [],                  // { owner, x, z, y, until } — claimed destinations
    searched: [],               // { x, z, t } — corners already swept
    relay: [],                  // { to, x, y, z, conf, at } — callouts in flight

    lastCallout: -999,
    lastFlankT: -999,
    deaths: 0,
    firstContactT: -999,
  };
}

export function getSquad(ai, id) {
  let bb = ai.squads.get(id);
  if (!bb) ai.squads.set(id, bb = createBlackboard(id));
  return bb;
}

// How many men may press the attack at once. One enemy alone always gets the
// token — being pinned by a token system you are the only member of is the kind
// of bug that reads as "the AI is broken", not "the AI is cautious".
export function maxAttackers(bb) {
  if (bb.alive <= 1) return 1;
  if (bb.alive <= 3) return 2;
  return 3;
}

// ── per-tick housekeeping ────────────────────────────────────────────────────

export function squadTick(G, ai, dt) {
  const now = G.time.t;
  const live = new Map();
  for (const e of G.enemies) if (e.alive) live.set(e.id, e);

  for (const bb of ai.squads.values()) {
    bb.members.length = 0;
    bb.alive = 0;
    bb.contacts = 0;
    for (const e of G.enemies) {
      if (e.squad !== bb.id) continue;
      bb.members.push(e.id);
      if (e.alive) { bb.alive++; if (e.canSee) bb.contacts++; }
    }
    bb.size = bb.members.length;

    // Tokens are held, never granted for life. Prune anything held by a body.
    bb.attackers = bb.attackers.filter((id) => live.has(id));
    if (bb.flanker && !live.has(bb.flanker)) bb.flanker = null;
    if (bb.suppressor && !live.has(bb.suppressor)) bb.suppressor = null;

    // Claims expire on their own so a man killed mid-move does not reserve the
    // best piece of cover on the map for the rest of the fight.
    for (let i = bb.spots.length - 1; i >= 0; i--) {
      const s = bb.spots[i];
      if (s.until < now || !live.has(s.owner)) bb.spots.splice(i, 1);
    }
    for (let i = bb.searched.length - 1; i >= 0; i--) {
      if (now - bb.searched[i].t > 22) bb.searched.splice(i, 1);
    }

    // Confidence in the last known position bleeds away with time. Twelve
    // seconds after the last sighting the squad is guessing, and it should
    // behave like it is guessing.
    if (bb.contacts > 0) bb.conf = 1;
    else bb.conf = Math.max(0, bb.conf - dt * 0.085);

    if (bb.alert > 0 && bb.contacts === 0 && now - bb.lastKnownT > 35) bb.alert = Math.max(0, bb.alert - 1);

    // Deliver callouts that were in flight. The delay is what makes a squad
    // read as men shouting at each other rather than one networked organism.
    for (let i = bb.relay.length - 1; i >= 0; i--) {
      const r = bb.relay[i];
      if (r.at > now) continue;
      bb.relay.splice(i, 1);
      const e = live.get(r.to);
      if (!e) continue;
      e.heardCall = { x: r.x, y: r.y, z: r.z, conf: r.conf, t: now };
    }
  }
}

// ── contact sharing ──────────────────────────────────────────────────────────

/**
 * One enemy saw or heard something. Write it to the board and shout it to
 * everyone close enough to hear, minus a beat for the shouting.
 */
export function shareContact(G, ai, e, pos, conf, reason) {
  const bb = getSquad(ai, e.squad);
  const now = G.time.t;
  const fresher = conf >= bb.conf - 0.05 || now - bb.lastKnownT > 1.5;
  if (fresher) {
    bb.lastKnown = bb.lastKnown || { x: 0, y: 0, z: 0 };
    bb.lastKnown.x = pos.x; bb.lastKnown.y = pos.y; bb.lastKnown.z = pos.z;
    bb.lastKnownT = now;
    bb.conf = Math.max(bb.conf, conf);
    bb.lastKnownVel.x = ai.playerVel.x; bb.lastKnownVel.y = ai.playerVel.y; bb.lastKnownVel.z = ai.playerVel.z;
  }
  if (bb.firstContactT < 0 && conf > 0.8) bb.firstContactT = now;
  bb.alert = Math.max(bb.alert, conf > 0.8 ? 2 : 1);

  // Don't spam the relay: one callout per squad per second is plenty, and it
  // stops a firefight generating four hundred queued messages a minute.
  if (now - bb.lastCallout < 0.9) return bb;
  bb.lastCallout = now;
  for (const other of G.enemies) {
    if (!other.alive || other === e || other.squad !== e.squad) continue;
    const d = Math.hypot(other.pos.x - e.pos.x, other.pos.y - e.pos.y, other.pos.z - e.pos.z);
    if (d > EARSHOT) continue;
    bb.relay.push({
      to: other.id, x: pos.x, y: pos.y, z: pos.z,
      // A shouted grid reference is worse than seeing it yourself, and worse
      // the further the shout travelled.
      conf: conf * (0.55 + 0.35 * (1 - d / EARSHOT)),
      at: now + COMMS_DELAY + d * 0.008,
    });
  }
  G.events.push({ type: 'aiCallout', t: now, source: e.id, squad: bb.id, reason: reason || 'contact', pos: { x: pos.x, y: pos.y, z: pos.z } });
  return bb;
}

// ── tokens ───────────────────────────────────────────────────────────────────

export function hasToken(bb, e, kind) {
  if (kind === TOKEN.ATTACK) return bb.attackers.indexOf(e.id) >= 0;
  if (kind === TOKEN.FLANK) return bb.flanker === e.id;
  return bb.suppressor === e.id;
}

export function requestToken(G, bb, e, kind) {
  if (hasToken(bb, e, kind)) return true;
  if (kind === TOKEN.ATTACK) {
    if (bb.attackers.length >= maxAttackers(bb)) return false;
    bb.attackers.push(e.id);
    return true;
  }
  if (kind === TOKEN.FLANK) {
    // A flank is a commitment; only one at a time, and not immediately after
    // the last one ended or the squad spends the whole fight jogging.
    if (bb.flanker) return false;
    if (G.time.t - bb.lastFlankT < 6) return false;
    bb.flanker = e.id;
    bb.lastFlankT = G.time.t;
    return true;
  }
  if (bb.suppressor && bb.suppressor !== e.id) return false;
  bb.suppressor = e.id;
  return true;
}

export function releaseToken(G, bb, e, kind) {
  if (kind === TOKEN.ATTACK) {
    const k = bb.attackers.indexOf(e.id);
    if (k >= 0) bb.attackers.splice(k, 1);
  } else if (kind === TOKEN.FLANK) {
    if (bb.flanker === e.id) { bb.flanker = null; bb.lastFlankT = G.time.t; }
  } else if (bb.suppressor === e.id) bb.suppressor = null;
}

export function releaseAll(G, bb, e) {
  releaseToken(G, bb, e, TOKEN.ATTACK);
  releaseToken(G, bb, e, TOKEN.FLANK);
  releaseToken(G, bb, e, TOKEN.SUPPRESS);
  releaseSpot(bb, e);
}

// ── destination claims ───────────────────────────────────────────────────────

export function claimSpot(G, bb, e, pos, ttl = 8) {
  releaseSpot(bb, e);
  bb.spots.push({ owner: e.id, x: pos.x, y: pos.y, z: pos.z, until: G.time.t + ttl });
}

export function releaseSpot(bb, e) {
  for (let i = bb.spots.length - 1; i >= 0; i--) if (bb.spots[i].owner === e.id) bb.spots.splice(i, 1);
}

// The whole reason the blackboard exists: two men do not take the same doorway.
export function spotTaken(bb, e, x, z, r = 2.2) {
  const r2 = r * r;
  for (let i = 0; i < bb.spots.length; i++) {
    const s = bb.spots[i];
    if (s.owner === e.id) continue;
    const dx = s.x - x, dz = s.z - z;
    if (dx * dx + dz * dz < r2) return true;
  }
  return false;
}

// ── search coordination ──────────────────────────────────────────────────────

export function markSearched(G, bb, x, z) {
  bb.searched.push({ x, z, t: G.time.t });
  if (bb.searched.length > 24) bb.searched.shift();
}

export function alreadySearched(bb, x, z, r = 3.5) {
  const r2 = r * r;
  for (let i = 0; i < bb.searched.length; i++) {
    const s = bb.searched[i];
    const dx = s.x - x, dz = s.z - z;
    if (dx * dx + dz * dz < r2) return true;
  }
  return false;
}
