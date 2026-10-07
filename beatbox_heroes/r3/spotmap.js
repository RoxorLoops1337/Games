// BEATBOX HEROES r3 -- spotmap.js (GAME). The bridge from 3D world events to the REAL game handlers (PORT_PLAN 2.5).
// Classic script, loaded after places.js (needs G.places) and before r3/scenes_world.js. In 2D mode nothing here runs.
//
//   A 3D world emits ctx.events 'spot' {id, scene, kind, locked, reason} (a door walked into, a prompt tapped, spots.activate) and 'npc' {id} (an NPC tapped).
//   The tables below map each id to the SAME handler the 2D hotspot uses (G.places.ACTIONS, S.leave2, G.enterPlace, ...). The scene sibling (scenes_world.js) is `S`:
//   it provides S.sheet / row / closeSheet / eatMenu / mingleMenu / leave2 / showCard (delegated 2D methods) and S.w (the world).
//
//   BBH.R3Spots.TABLE[place][spotId]  -> 'enter' | 'map' | 'leave' | 'act' | 'run' | 'flyers' | 'card'     (place = street | home | park | shop | studio | bar | hood)
//   BBH.R3Spots.NPCS[place][npcId]    -> 'tip:<who>' | 'act:<key>' | 'mingle'
//   BBH.R3Spots.WORLD[place]          -> the Park3D world id of that scene (home -> flat, studio -> lab)
//   BBH.R3Spots.TRAIN[place][spotId]  -> 'home' | 'studio': a training spot, opens the training menu G.trainMenu(S, where)
//   resolve(place, id) -> {kind, key} | null     npcRoute(place, id) -> {kind, key} | null      run(S, place, r, id)      onSpot(S, place, e)      onNpc(S, place, e)      bind(S, world, place)
//   gates() / applyGates(world, lastSig) -> sig   door locks (Core.canEnter reasons) + goal beacon (G.goalDoor) for the street and the hood pins
//   goalSpot(place) / applyGoal(world, place, lastSig) -> sig   goal beacon on the spot inside a place the goal text points at
//   busy(S) / settle(S, dt)   world.done(spotId) once the sheet, shop panel, dialog, modal or overlay opened by the spot is closed again (never while a scene switch is pending)
//   anchors2d(world)          terrain anchors as the 2D scene's `sc.spots` ({x, y: z} in metres) so the delegated 2D code finds what it reads
//   spotFor(place, key)       the 3D spot id behind a 2D ACTIONS key ('spot' -> 'busk')
//   land(S, world, place, t)  the return ticket (activity.js): stand at the spot where the activity started, facing it, camera snapped (no fly-in, no start anchor)
//   reopen(S, world, place, t) BACK: the spot cinematic again (S.quietSpot: the bridge does not run the action twice) and the menu that launched the activity
(function (root) {
  'use strict';
  const BBH = root.BBH, E = BBH && (BBH.Eng || BBH.E), Core = BBH && BBH.Core, G = BBH && BBH.G;
  if (!E || !Core || !G) return;
  const M = BBH.R3Spots = BBH.R3Spots || {};

  M.WORLD = { street: 'street', home: 'flat', park: 'park', shop: 'shop', studio: 'lab', bar: 'bar', hood: 'hood' };
  M.DOORS = ['park', 'home', 'shop', 'studio', 'bar'];
  M.TABLE = {
    street: { park: 'enter', home: 'enter', shop: 'enter', studio: 'enter', bar: 'enter', map: 'map' },
    home: { booth: 'act', couch: 'act', bed: 'act', desk: 'act', kitchen: 'act', wardrobe: 'act', door: 'leave' },
    park: { busk: 'act', bench: 'act', run: 'run', flyers: 'flyers', gate: 'leave' },
    shop: { hats: 'act', racks: 'act', mirror: 'act', counter: 'act', door: 'leave' },
    studio: { mic: 'act', mixer: 'act', door: 'leave' },
    bar: { stage: 'act', counter: 'act', door: 'leave' },
    hood: { park: 'card', home: 'card', shop: 'card', studio: 'card', bar: 'card' },
  };
  M.ACTION_KEY = { park: { busk: 'spot' } };
  M.TRAIN = { home: { booth: 'home' }, studio: { mic: 'studio' } };       // training spots -> G.trainMenu(S, where) (r3/scenes_train.js: IDLE / PLAY menu)                       // 3D spot id -> ACTIONS key where they differ (the 2D hotspot is called 'spot')
  M.NPCS = {
    street: { foxy: 'tip:foxy' }, home: { foxy: 'tip:foxy' }, park: { beeamgee: 'act:bench' }, shop: { clerk: 'act:counter' },
    bar: { rohzel: 'act:counter', regular0: 'mingle', regular1: 'mingle', regular2: 'mingle' },
  };

  M.resolve = function (place, id) {
    const t = M.TABLE[place], kind = t && t[id]; if (!kind) return null;
    return { kind, key: kind === 'act' ? ((M.ACTION_KEY[place] || {})[id] || id) : id };
  };
  M.npcRoute = function (place, id) {
    const v = (M.NPCS[place] || {})[id]; if (!v) return null; const i = v.indexOf(':');
    return i < 0 ? { kind: v, key: id } : { kind: v.slice(0, i), key: v.slice(i + 1) };
  };

  M.spotFor = function (place, key) {
    if (!key) return null; const t = M.TABLE[place] || {};
    for (const id of Object.keys(t)) { const r = M.resolve(place, id); if (r && r.kind === 'act' && r.key === key) return id; }
    return t[key] ? key : null;
  };

  M.anchors2d = function (w) {
    const out = { stand: { x: 0, y: 0 } }, A = (w && w.terrain && w.terrain.anchors) || {};
    for (const k of Object.keys(A)) { const a = A[k]; if (a && typeof a.x === 'number' && typeof a.z === 'number') out[k] = { x: a.x, y: a.z }; }
    if (A.start) out.stand = { x: A.start.x, y: A.start.z };
    return out;
  };

  /* --------------------------------------------------------------- running a mapped spot */
  M.run = function (S, place, r, id) {
    const P = G.places;
    switch (r.kind) {
      case 'enter': G.enterPlace(id); break;
      case 'map': E.go('map'); break;
      case 'leave': S.leave2(); break;
      case 'card': S.showCard(id); break;
      case 'flyers': S.sheet('ODD JOB', [P.jobRow(S, 'flyers')]); break;
      case 'run':
        if (G.ch.energy < 14) { E.toast('Too tired to run.', 'warn'); E.sfx('error'); break; }
        S.closeSheet(); E.go('run', { back: { scene: 'place', args: { id: place } } }); break;
      case 'act': { const tw = (M.TRAIN[place] || {})[r.key]; if (tw && G.trainMenu) { G.trainMenu(S, tw); break; } const A = P.ACTIONS[place] && P.ACTIONS[place][r.key]; if (A) A(S); else E.toast('Nothing to do here.'); break; }
      default: break;
    }
  };

  // one world 'spot' event. Returns the kind that ran, 'closed' for a shut door, or false for an unknown id.
  M.onSpot = function (S, place, e) {
    const id = e.id, w = S.w, r = M.resolve(place, id);
    if (S.quietSpot && S.quietSpot === id) { S.activeSpot = id; S.idleT = 0; return 'quiet'; }   // reopen(): the cinematic only, the menu is opened by the caller
    S.npcAct = null;
    if (!r) { try { w.done(id); } catch (x) { /* ignore */ } return false; }      // an unmapped spot must never leave the player locked
    if (r.kind === 'enter') {
      const ok = Core.canEnter(G.ch, id);
      if (!ok.ok) { E.toast(ok.reason, 'warn'); E.sfx('error'); try { w.setSpotState(id, { locked: true, reason: ok.reason }); w.done(id); } catch (x) { /* ignore */ } return 'closed'; }
    }
    S.activeSpot = id; S.idleT = 0;
    M.run(S, place, r, id);
    return r.kind;
  };

  M.onNpc = function (S, place, e) {
    const P = G.places, r = M.npcRoute(place, e.id); if (!r) return false;
    if (r.kind === 'tip') { E.dialog([{ who: r.key, text: P.tip(r.key) }]); return 'tip'; }
    if (r.kind === 'act') { S.npcAct = r.key; const A = P.ACTIONS[place] && P.ACTIONS[place][r.key]; if (A) A(S); return 'act'; }
    if (r.kind === 'mingle') {
      const w = S.w, fn = w && (w.regularOf || (w.terrain && w.terrain.api && w.terrain.api.regularOf) || (w.bar && w.bar.regularOf));
      let who = fn ? fn.call(w.bar || w, e.id) : null; if (!who) { const i = +String(e.id).replace('regular', ''); const reg = S.regulars()[i]; who = reg && reg.id; }
      if (who) { S.mingleMenu(who); return 'mingle'; }
    }
    return false;
  };

  M.bind = function (S, world, place) {
    const live = () => E.scene === S && S.w === world;
    world.events.on('spot', (e) => { if (live() && e) M.onSpot(S, place, e); });
    world.events.on('npc', (e) => { if (live() && e) M.onNpc(S, place, e); });
  };

  /* --------------------------------------------------------------- the return ticket (activity.js) */
  const spotIn = (w, id) => { const sp = w && w.spots && w.spots.spots; return (id && sp && sp.find((x) => x.id === id)) || null; };
  M.land = function (S, w, place, t) {
    const c = w && w.controls; if (!c || !c.teleportTo || !t) return false;
    const s = spotIn(w, t.spot || M.spotFor(place, t.hot)), near = (p) => !s || Math.hypot(p.x - s.x, p.z - s.z) <= (s.radius || 1.6) + 1.2;
    let x, z, h;
    if (t.pos && isFinite(t.pos.x) && isFinite(t.pos.z) && near(t.pos)) { x = t.pos.x; z = t.pos.z; h = t.pos.h; }
    else if (s && isFinite(s.x) && isFinite(s.z)) { x = s.x; z = s.z; h = typeof s.rot === 'number' ? s.rot : undefined; }
    else return false;
    try { c.teleportTo(x, z, { face: h, free: true }); } catch (e) { return false; }
    S.landed = { spot: s ? s.id : null, x, z };
    return true;
  };
  M.reopen = function (S, w, place, t) {
    if (!t || t.mode !== 'menu') return false;
    const id = t.spot || M.spotFor(place, t.hot), r = id ? M.resolve(place, id) : null;
    if (r && (r.kind === 'act' || r.kind === 'flyers') && spotIn(w, id)) { S.quietSpot = id; try { w.activate(id); } catch (e) { /* ignore */ } S.quietSpot = null; S.activeSpot = id; S.idleT = 0; }
    if (typeof t.menu === 'function') { t.menu(S); return true; }
    if (r && (r.kind === 'act' || r.kind === 'flyers')) { M.run(S, place, r, id); return true; }
    return false;
  };

  /* --------------------------------------------------------------- done(spotId) */
  M.busy = function (S) {
    if ((S.sheetEl && S.sheetEl.isConnected) || (S.shop && S.shop.el && S.shop.el.isConnected)) return true;
    if (E.uiBlock > 0 || E.pendingSwitch || G.pendingMorning) return true;
    try { if (E.ui && E.ui.querySelector('.full, .sheet, .panel.pop')) return true; } catch (e) { /* ignore */ }
    return false;
  };
  M.settle = function (S, dt) {
    if (!S.activeSpot || !S.w) return;
    if (M.busy(S)) { S.idleT = 0; return; }
    S.idleT = (S.idleT || 0) + dt; if (S.idleT < 140) return;
    const id = S.activeSpot; S.activeSpot = null; S.idleT = 0;
    try { S.w.done(id); } catch (e) { /* ignore */ }
  };

  /* --------------------------------------------------------------- gates and goal beacons */
  M.gates = function () {
    const out = {}; for (const id of M.DOORS) { let ok; try { ok = Core.canEnter(G.ch, id); } catch (e) { ok = { ok: true }; } out[id] = { locked: !ok.ok, reason: ok.ok ? '' : ok.reason, goal: false }; }
    let gd = null; try { gd = G.goalDoor ? G.goalDoor() : null; } catch (e) { gd = null; }
    if (gd && out[gd] && !out[gd].locked) out[gd].goal = true;
    return out;
  };
  M.applyGates = function (w, last) {
    const g = M.gates(), sig = JSON.stringify(g); if (sig === last || !w) return sig;
    for (const id of M.DOORS) { try { w.setSpotState(id, g[id]); } catch (e) { /* ignore */ } }
    return sig;
  };
  // inside a place: the spot the current goal points at (replaces the bobbing arrow of the street)
  M.goalSpot = function (place, ch) {
    let g = ''; try { g = G.goal(ch || G.ch).toLowerCase(); } catch (e) { return null; }
    if (place === 'park' && /busk/.test(g)) return 'busk';
    if (place === 'home') { if (/hungry|eat/.test(g)) return 'kitchen'; if (/nap or sleep|sleep after|exhausted/.test(g)) return 'bed'; if (/train a skill|vocal booth/.test(g)) return 'booth'; }
    if (place === 'bar' && /open mic|battle|world cup|showcase/.test(g)) return 'stage';
    if (place === 'studio' && /train a skill/.test(g)) return 'mic';
    return null;
  };
  M.applyGoal = function (w, place, last) {
    const id = M.goalSpot(place), sig = String(id); if (sig === last || !w) return sig;
    const ids = Object.keys(M.TABLE[place] || {});
    for (const k of ids) { try { w.setSpotState(k, { goal: k === id }); } catch (e) { /* ignore */ } }
    return sig;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
