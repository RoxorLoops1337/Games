// Clawspire -- PHYS: the claw and item physics, ported from Claw Crawl.
//
// Bodies are compounds of circles (a ball, a capsule chain or a rounded blob)
// that collide with each other, with static capsule walls and with the
// kinematic claw (a hub circle plus two prongs of three capsule segments).
// Sequential impulses with Coulomb friction, restitution only on hard hits,
// bias-limited penetration recovery (with a lower cap against the claw so it
// can never fling anything), sleeping bodies that wake on hits, and hard
// floor / wall / lid clamps so nothing ever leaves the cabinet.  Fixed 1/240 s
// substeps.  Units: pixels and seconds, y grows downward.  Headless: no DOM,
// no Math.random (the rig takes a cfg.rand stream for loosen and jolt).
const PHYS = (() => {
  'use strict';

  // ---- constants ---------------------------------------------------------
  const H = 1 / 240;             // fixed substep, seconds
  const MAX_SUB = 12;            // max substeps per W.step call
  const TAU = Math.PI * 2;
  // Claw Crawl's solver dials.
  const PH = {
    it: 10,            // solver iterations per substep
    slop: 0.5,         // allowed penetration (px)
    beta: 0.24,        // fraction of the penetration removed per second-ish (bias = beta/h * pen)
    maxBias: 200,      // px/s cap on penetration recovery
    clawBias: 110,     // ...and a lower cap against the claw, so it never flings
    e: 0.12,           // default restitution
    bounceV: 90,       // restitution only above this approach speed (px/s)
    maxV: 1600,        // linear speed cap (px/s)
    linDamp: 0.15, angDamp: 1.6,
    sleepV: 14, sleepW: 0.35, sleepT: 0.45,   // rest this long below these speeds and sleep
    wakePen: 2.5, wakeV: 70,                   // a sleeper pushed this deep, or hit this fast, wakes
    wallMu: 0.4,
    wallTol: 3,        // a body's EXTENT may sink this far into a side wall before it is pushed back (round 23, stuck prize fix)
    heldDecay: 8,     // b.held counts down this fast per second (2 -> 0 in a quarter second)
  };
  // Item part shapes derived from Clawspire's shape descriptors.
  const SHAPE = {
    capRMax: 18,       // fat boxes stay pills no wider than this radius
    capThin: 12,       // long polygons (axe, shard, bottle) become thin pills
    capAspect: 1.8,    // polygons at least this elongated become capsules, rounder ones blobs
    blobK: 0.92,       // blob radius = half the long axis times this
  };
  // The claw (Claw Crawl's numbers; the base scale is tuned for Clawspire's
  // bigger prizes, see DESIGN.md).
  const PRONG = [[0, 0], [14, 28], [9, 48], [1, 57]];   // one prong, local (x out, y down), times size
  const PHI_OPEN = 0.62, PHI_CLOSED = -0.1;               // prong angles (rad)
  const RIG = {
    base: 0.74,            // claw size = base * cfg.width (* prong3Size with a third prong)
    prong3Size: 1.08,
    gripBase: 0.35, gripSlope: 0.3, gripMin: 0.15,   // grip_cc = clamp(gripBase + gripSlope * (grip - 0.75), gripMin, 1)
    rubberGrip: 0.15, prong3Grip: 0.1, greaseGrip: 0.3,
    hubR: 13, segR: 4.5, hingeX: 7, hingeY: 7,      // times size
    hubDrop: 14,           // hub centre below the rail when parked
    dropSpeed: 250, liftSpeed: 175, carSpeed: 330,
    closeRate: 2.6, openRate: 3.2, openT: 0.35, openHold: 0.6,
    passT: 0.7,                // s a wedged item ignores the claw so it can fall out of it
    idleShed: 0.35,            // s at home before anything still riding the claw is dropped
    closeMin: 0.18, closeMax: 0.8, blockT: 0.08,    // closing ends when both prongs have been blocked blockT (after closeMin), or at closeMax
    haltBase: 1.5, haltGrip: 3,                     // a prong stalls past halt = haltBase + haltGrip * grip px of penetration
    haltOpen: 7,                                    // ...plus haltOpen * open^2 while still wide open
    loosen: 0.12, loosenT: 0.4,                     // the lift loosens (1 - grip) * loosen rad over loosenT s
    joltP: 0.25, jolt: 0.05, joltT: 0.1,            // a twitch open at the top with probability (1 - grip) * joltP
    swayKick: 2.2,
    floorClear: 60,        // hub stops floorClear * size + 2 above the floor
    cargoY: 70,            // held items above hub y + cargoY * size are the cargo at the lift
    slipY: 95,             // cargo below hub y + slipY * size, falling, has slipped
    slipV: 60,
    carryWait: 0.2,        // s over the chute before opening
    magnetR: 110, magnetF: 420,
    tray: 44,              // the chute has no floor: a hidden tray this far below the cabinet floor catches prizes
    lid: -64,              // the lid segment's y (items may fly a little above the glass)
    clampTop: -50,
    floorSink: 3,          // an item's centre may sink to this far above the floor surface (the thinnest items, r 4, still touch it)
    touchHub: 1.2, touchProng: 3,   // penetration that counts as landing on something
  };
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  let nextId = 1;

  // ---- claw types ----------------------------------------------------------
  // Every claw type is the same rig and phase machine with its own geometry
  // and grip rules (DESIGN.md "Claw types"). Polylines are one prong / jaw /
  // finger, local (x out, y down) from its hinge, times size. The classic
  // row is the old rig exactly (its multipliers are all 1, so the classic
  // claw steps bit for bit as before).
  //   poly       one side's polyline (null: no prongs, the magnet and the hook)
  //   segR hubR  capsule radius of a prong segment, hub radius (times size)
  //   open closed  prong angles (rad)
  //   size       x the base size (the tri-claw is narrower)
  //   speed drop lift close   x the carriage / drop / lift / closing speed
  //   gripAdd    added to grip_cc (the hand is sticky)
  //   mu         x the claw-item friction; roundMu / longMu for balls and
  //              blobs / for long capsules (tri cups round things, the
  //              scoop cannot hold a sword)
  //   haltK      x the halt threshold (the scoop plows through the pile)
  //   dig        s the scoop keeps sinking after it touched the pile
  //   floorClear the hub stops this far (x size, + 2) above the floor
  //   weld       'metal' (magnet: every touching metal sticks), 'one' (hand:
  //              the heaviest held item sticks, the rest drop), 'spear'
  //              (hook: the first item the barb enters sticks)
  //   tear       px (x size) a welded item may lag its spot before it tears off
  //   closeT     s the magnet energises / the barb bites before the lift
  const TRI_PRONG = [[0, 0], [15, 20], [13, 40], [3, 53]];
  const SCOOP_JAW = [[0, 0], [20, 6], [30, 22], [29, 40], [18, 53], [2, 59]];
  const FINGER = [[0, 0], [9, 16], [13, 34], [10, 50], [2, 60]];
  const CLAW_TYPES = {
    classic: { id: 'classic', poly: PRONG, segR: RIG.segR, hubR: RIG.hubR, open: PHI_OPEN, closed: PHI_CLOSED, size: 1,
      speed: 1, drop: 1, lift: 1, close: 1, gripAdd: 0, mu: 1, roundMu: 1, longMu: 1, haltK: 1, dig: 0, floorClear: RIG.floorClear, weld: null },
    tri: { id: 'tri', poly: TRI_PRONG, segR: 4.2, hubR: 12, open: 0.66, closed: -0.16, size: 0.9,
      speed: 1, drop: 1, lift: 1, close: 1.1, gripAdd: 0.06, mu: 1, roundMu: 1.7, longMu: 0.8, haltK: 1, dig: 0, floorClear: 56, weld: null, ghost: true },
    scoop: { id: 'scoop', poly: SCOOP_JAW, segR: 5, hubR: 14, open: 0.95, closed: 0, size: 0.94,
      speed: 0.85, drop: 1, lift: 0.9, close: 1.35, gripAdd: 0, mu: 1.1, roundMu: 1.3, longMu: 0.35, haltK: 3, dig: 0.1, floorClear: 60, weld: null,
      tipLen: 38, tipP: 0.8 },   // a long thing (a capsule over tipLen px) tips out of the bucket on the way up, with chance tipP
    hand: { id: 'hand', poly: FINGER, segR: 6.5, hubR: 15, open: 0.72, closed: -0.28, size: 0.98,
      speed: 0.72, drop: 0.8, lift: 0.8, close: 0.85, gripAdd: 0.22, mu: 1.45, roundMu: 1, longMu: 1, haltK: 1.2, dig: 0, floorClear: 62, weld: 'one', tear: 30, weldK: 0.2, weldV: 320 },
    magnet: { id: 'magnet', poly: null, segR: 0, hubR: 24, open: 0, closed: 0, size: 1,
      speed: 0.95, drop: 0.9, lift: 0.9, close: 1, gripAdd: 0, mu: 1, roundMu: 1, longMu: 1, haltK: 1, dig: 0, floorClear: 25, weld: 'metal', tear: 26, weldK: 0.3, weldV: 700, closeT: 0.4,
      fieldR: 118, fieldF: 2600 },
    hook: { id: 'hook', poly: null, segR: 0, hubR: 6, open: 0, closed: 0, size: 1,
      speed: 1.1, drop: 2.1, lift: 1.1, close: 1, gripAdd: 0, mu: 1, roundMu: 1, longMu: 1, haltK: 1, dig: 0, floorClear: 30, weld: 'spear', tear: 34, weldK: 0.3, weldV: 800, closeT: 0.12,
      tip: 28, barb: 3 },
    // ---- CR8 (round 8, DESIGN.md "Mama Mech and two new claws"): the vacuum
    // nozzle and the twin claws.
    //   vacuum: weld 'suck'. It parks and lifts `park` px lower (the wand and
    //     the canister ride above the nozzle); suction pulls light things
    //     within suckR (x width, x1.25 with the second intake) toward the mouth
    //     with suckF (x grip), weaker on heavy ones; whatever reaches the mouth
    //     and fits the bore (bore x size) and weighs under suckM (x grip) flies
    //     up the wand into the canister (at most `cap`, +1 wide, +1 third prong);
    //     a big thing plugs the nozzle (the clog: welded to the mouth, no more
    //     suction until it is released). `can` / `wand` size the canister.
    //   twin: two small claws on one bar (sep x size from the middle). At the
    //     drop each head slides up to `seek` x size toward the nearest prize
    //     under it (`slide` px/s), keeping `gap` x size apart; the bar comes
    //     down until one head lands, then the other reels out on its own
    //     cable (at most `ext` x size); they close independently (pL / pR are
    //     the two heads), `hang` x size of cable under the bar.
    vacuum: { id: 'vacuum', poly: null, segR: 0, hubR: 17, open: 0, closed: 0, size: 1,
      speed: 0.9, drop: 0.95, lift: 0.95, close: 1, gripAdd: 0, mu: 1, roundMu: 1, longMu: 1, haltK: 1, dig: 0, floorClear: 22, weld: 'suck', tear: 20, weldK: 0.3, weldV: 600, closeT: 0.6,
      park: 70, suckR: 92, suckF: 5200, suckM: 11, bore: 20.5, cap: 3, can: 34, wand: 38 },
    twin: { id: 'twin', poly: PRONG, segR: RIG.segR, hubR: 10, open: PHI_OPEN, closed: PHI_CLOSED, size: 0.72,
      speed: 1, drop: 1, lift: 1, close: 1.15, gripAdd: -0.05, mu: 1, roundMu: 1, longMu: 0.9, haltK: 1, dig: 0, floorClear: 60, weld: null,
      twin: { sep: 36, seek: 32, slide: 260, hang: 22, ext: 110, gap: 70 } },
  };
  const typeOf = (id) => CLAW_TYPES[id] || CLAW_TYPES.classic;
  /* A claw drawn without a world (the picker, the title): the same geometry
     as a rig of that type, hub at (x, y), o.open 0 (closed) .. 1 (open),
     o.width, o.cable (px of cable above the hub). Returns an object shaped
     like a rig for RENDER.claw. */
  function clawPose(type, o) {
    o = o || {};
    const T = typeOf(type), id = CLAW_TYPES[type] ? type : 'classic';
    const s = RIG.base * (o.width || 1) * T.size;
    const x = o.x || 0, y = o.y || 0, u = o.open == null ? 1 : clamp(o.open, 0, 1);
    const phi = T.closed + (T.open - T.closed) * u;
    const side = (sd) => {
      if (!T.poly) return [];
      const hx = x + sd * RIG.hingeX * s, hy = y + RIG.hingeY * s, al = -sd * phi, ca = Math.cos(al), sa = Math.sin(al);
      return T.poly.map(([lx, ly]) => { const px = sd * lx * s, py = ly * s; return { x: hx + px * ca - py * sa, y: hy + px * sa + py * ca }; });
    };
    const hy = y + RIG.hingeY * s;
    const ghost = T.ghost ? T.poly.map(([lx, ly]) => ({ x: x + lx * 0.18 * s * (u - 0.35), y: hy + ly * (0.9 - 0.08 * u) * s })) : null;
    if (T.twin || T.weld === 'suck') return cr8Pose(T, id, s, x, y, phi, o);   // CR8: the twin claws, the vacuum nozzle
    return {
      phase: o.phase || 'idle', type: id, sway: 0, field: o.field || 0, auto: null,
      geo: { s, hubR: T.hubR * s, type: id }, cfg: { type: id, prongs: 2, rubber: 0, magnet: 0 },
      cableTop: { x, y: y - (o.cable == null ? 40 : o.cable) },
      bodies: { hub: { x, y, r: T.hubR * s }, prongs: [side(-1), side(1)], ghost, tip: T.weld === 'spear' ? { x, y: y + T.tip * s } : null },
      stuck: () => [],
    };
  }
  // ---- CR8: the twin claws and the vacuum nozzle (shared by the rig and clawPose)
  /* One prong of a small twin head hung at (hx, hy), angle phi: the same
     maths as a classic prong, side -1 / 1 the geometric side. */
  function cr8Prong(T, s, hx, hy, side, phi) {
    const px0 = hx + side * RIG.hingeX * s, py0 = hy + RIG.hingeY * s, al = -side * phi, ca = Math.cos(al), sa = Math.sin(al);
    return T.poly.map(([lx, ly]) => { const px = side * lx * s, py = ly * s; return { x: px0 + px * ca - py * sa, y: py0 + px * sa + py * ca }; });
  }
  /* The vacuum's parts for the renderer, around a nozzle hub at (x, y): the
     mouth, the wand's top (the intake), the canister (centre and radius)
     and the load. Fills and returns out. */
  function cr8VacGeo(T, s, x, y, st, out) {
    out = out || {};
    out.x = x; out.y = y; out.s = s; out.r = T.hubR * s;
    out.mouthY = y + T.hubR * s * 0.55;
    out.topY = y - T.wand * s;
    out.cr = T.can * s; out.cy = out.topY - out.cr * 0.72;
    out.n = st.n | 0; out.cap = st.cap | 0; out.clog = !!st.clog; out.full = out.cap > 0 && out.n >= out.cap; out.suck = st.suck || 0;
    return out;
  }
  function cr8Pose(T, id, s, x, y, phi, o) {
    const base = { phase: o.phase || 'idle', type: id, sway: 0, field: o.field || 0, auto: null,
      geo: { s, hubR: T.hubR * s, type: id }, cfg: { type: id, prongs: 2, rubber: 0, magnet: 0 },
      cableTop: { x, y: y - (o.cable == null ? 40 : o.cable) }, stuck: () => [], tube: () => [] };
    if (T.twin) {
      const sep = T.twin.sep * s, hang = T.twin.hang * s;
      const heads = [{ x: x - sep, y: y + hang, r: T.hubR * s }, { x: x + sep, y: y + hang, r: T.hubR * s }];
      const prongs = [];
      for (const hd of heads) for (const sd of [-1, 1]) prongs.push(cr8Prong(T, s, hd.x, hd.y, sd, phi));
      base.bodies = { hub: { x, y, r: 5 * s + 2 }, prongs, ghost: null, tip: null, twin: heads };
      base.geo.reach = hang + (RIG.hingeY + T.poly[T.poly.length - 1][1]) * s;
      return base;
    }
    base.bodies = { hub: { x, y, r: T.hubR * s }, prongs: [[], []], ghost: null, tip: null };
    base.vac = cr8VacGeo(T, s, x, y, { n: o.fill ? Math.round(o.fill * T.cap) : 0, cap: T.cap, clog: !!o.clog, suck: o.field || 0 });
    base.geo.reach = T.hubR * s;
    return base;
  }

  // ---- materials -----------------------------------------------------------
  // Every item gets a physical personality from its tags (and its art / fx for
  // the elements), so a new item behaves right with no extra data.  The
  // physics half lives on the body (gravity scale, air drag, floor slickness,
  // a bouncier restitution); the rest are trait flags the game and the
  // renderer turn into sparks, cracks, sloshing, fuses and so on.
  //   g        gravity scale (magic floats down, light things drift)
  //   drag     extra linear damping per second (air resistance)
  //   slick    multiplier on floor / item friction (ice slides), never on the claw's grip
  //   bounce   minimum restitution, bounceV the approach speed restitution starts at
  const MATERIALS = {
    stuff: { id: 'stuff', label: 'Stuff' },
    metal: { id: 'metal', label: 'Metal', snd: 'clank' },
    glass: { id: 'glass', label: 'Glass', snd: 'tinkle' },
    heavy: { id: 'heavy', label: 'Heavy', snd: 'thud' },
    rubber: { id: 'rubber', label: 'Bouncy', snd: 'boing', bounce: 0.62, bounceV: 35 },
    potion: { id: 'potion', label: 'Potion', snd: 'slosh' },
    food: { id: 'food', label: 'Food', snd: 'squish' },
    magic: { id: 'magic', label: 'Magic', snd: 'chime', g: 0.62, drag: 0.6 },
    bomb: { id: 'bomb', label: 'Bomb', snd: 'thud' },
    frost: { id: 'frost', label: 'Frost', snd: 'tinkle', slick: 0.3 },
    light: { id: 'light', label: 'Light', snd: 'squish', g: 0.92, drag: 0.8 },
  };
  // Which personality leads (the sound, the label) when an item has several.
  const MAT_ORDER = ['bomb', 'frost', 'potion', 'glass', 'rubber', 'food', 'magic', 'heavy', 'metal', 'light'];
  const matCache = new Map();
  /* PHYS.materialOf(def) -> {id, label, snd, g, drag, slick, bounce, bounceV,
     traits: {metal, glass, heavy, rubber, liquid, food, magic, fuse, frost,
     light, small, fire, poison}}.  Pure; cached per def id. */
  function materialOf(def) {
    def = def || {};
    const key = def.id ? def.id + '|' + (def.art || '') : null;
    if (key && matCache.has(key)) return matCache.get(key);
    const tags = Array.isArray(def.tags) ? def.tags : [];
    const has = (t) => tags.indexOf(t) >= 0;
    const fxs = Array.isArray(def.fx) ? def.fx : [];
    const st = (s) => fxs.some(f => f && ((f.k === 'status' && f.s === s) || (s === 'poison' && f.k === 'poisonAll')));
    const art = def.art || '';
    const circle = !!(def.shape && def.shape.kind === 'circle');
    const rest = def.restitution == null ? 0.1 : def.restitution;
    const T = {
      metal: has('metal'), glass: has('glass'), heavy: has('heavy'), food: has('food'), magic: has('magic'),
      light: has('light'), small: has('small'), liquid: has('potion'), fuse: art === 'bomb',
      frost: art === 'snowball' || art === 'iceblock' || (art === 'iceshard' && !has('magic')) || st('chill') || has('frost'),
      fire: art === 'torch' || art === 'slag' || st('burn') || has('fire'),
      poison: st('poison') || has('poison'),
      rubber: false,
    };
    T.rubber = circle && !T.metal && !T.glass && !T.fuse && !T.frost && (rest >= 0.3 || (T.light && rest >= 0.2));
    let id = 'stuff';
    const lead = { bomb: T.fuse, frost: T.frost, potion: T.liquid, glass: T.glass, rubber: T.rubber, food: T.food, magic: T.magic, heavy: T.heavy, metal: T.metal, light: T.light };
    for (const k of MAT_ORDER) if (lead[k]) { id = k; break; }
    const base = MATERIALS[id];
    const m = {
      id, label: base.label, snd: base.snd || null, traits: T,
      g: T.magic ? (T.heavy ? 0.8 : 0.62) : T.light ? 0.92 : 1,
      drag: T.magic ? 0.6 : T.light ? 0.8 : 0,
      slick: T.frost ? 0.3 : 1,
      bounce: T.rubber ? Math.max(rest, 0.62) : rest,
      bounceV: T.rubber ? 35 : PH.bounceV,
    };
    if (key) matCache.set(key, m);
    return m;
  }
  /* Put a material's physics on a body (gravity scale, drag, slickness, bounce). */
  function applyMaterial(b, m) {
    if (!b || !m) return b;
    b.gs = m.g == null ? 1 : m.g;
    b.drag = m.drag || 0;
    b.slick = m.slick == null ? 1 : m.slick;
    if (m.bounce != null) b.restitution = Math.max(b.restitution, m.bounce);
    b.bounceV = m.bounceV || PH.bounceV;
    b.mat = m;
    return b;
  }
  /* A shape descriptor scaled by k (a melting ice item shrinks). */
  function scaleShape(sh, k) {
    if (!sh) return sh;
    switch (sh.kind) {
      case 'circle': case 'ball': return Object.assign({}, sh, { r: sh.r * k });
      case 'box': return { kind: 'box', w: sh.w * k, h: sh.h * k };
      case 'cap': return Object.assign({}, sh, { len: sh.len * k, r: sh.r * k });
      case 'blob': return Object.assign({}, sh, { r: sh.r * k });
      case 'poly': return { kind: 'poly', verts: (sh.verts || []).map(v => ({ x: v.x * k, y: v.y * k })) };
      default: return sh;
    }
  }

  // ---- shapes ------------------------------------------------------------
  /* Box shape descriptor (maps to a capsule). */
  function box(w, h) { return { kind: 'box', w, h }; }

  /* Reduce any shape descriptor to ball / cap / blob with its dimensions.
     Capsules run along local x (ax 0) or y (ax pi/2) to match the art. */
  function partSpec(shape) {
    let sh = shape || { kind: 'circle', r: 16 };
    if (sh.kind === 'poly' && sh.verts && sh.verts.kind === 'box') sh = sh.verts;
    switch (sh.kind) {
      case 'ball': case 'circle': return { kind: 'ball', r: sh.r || 16, len: (sh.r || 16) * 2 };
      case 'cap': return { kind: 'cap', len: sh.len, r: sh.r, ax: sh.ax || 0 };
      case 'blob': return { kind: 'blob', r: sh.r, len: sh.r * 2 };
      case 'box': {
        const L = Math.max(sh.w, sh.h), S = Math.min(sh.w, sh.h);
        return { kind: 'cap', len: L, r: Math.min(S / 2, SHAPE.capRMax), ax: sh.w >= sh.h ? 0 : Math.PI / 2 };
      }
      default: {
        const v = sh.verts || [];
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const p of v) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
        if (!v.length || !isFinite(x0)) return { kind: 'ball', r: 16, len: 32 };
        const w = x1 - x0, h = y1 - y0, L = Math.max(w, h), S = Math.min(w, h);
        if (S > 0 && L / S >= SHAPE.capAspect) return { kind: 'cap', len: L, r: Math.min(S / 2, SHAPE.capThin), ax: w >= h ? 0 : Math.PI / 2 };
        return { kind: 'blob', r: 0.5 * L * SHAPE.blobK, len: L };
      }
    }
  }

  /* Circle parts (local coordinates, not yet centred on the mass centre). */
  function mkParts(spec) {
    const out = [];
    if (spec.kind === 'cap') {
      const len = spec.len, r = spec.r, ax = spec.ax || 0, cx = Math.cos(ax), sy = Math.sin(ax);
      if (len - 2 * r < 1) { out.push({ x: 0, y: 0, r }); return out; }
      const n = Math.max(2, Math.round((len - 2 * r) / (r * 0.9)) + 1);
      for (let i = 0; i < n; i++) { const t = -len / 2 + r + (len - 2 * r) * i / (n - 1); out.push({ x: t * cx, y: t * sy, r }); }
    } else if (spec.kind === 'blob') {
      const r = spec.r;
      out.push({ x: 0, y: 0, r: r * 0.62 });
      for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * TAU / 3; out.push({ x: Math.cos(a) * r * 0.42, y: Math.sin(a) * r * 0.42, r: r * 0.58 }); }
    } else out.push({ x: 0, y: 0, r: spec.r });
    return out;
  }

  // ---- bodies ------------------------------------------------------------
  /* body({type, shape, x, y, angle, density, friction, restitution, group, data}).
     Mass and inertia come from the parts (pi r^2 * density * 0.01 each). */
  function body(o) {
    o = o || {};
    const spec = partSpec(o.shape);
    const dens = o.density == null ? 1 : o.density;
    const parts = mkParts(spec);
    let m = 0, cx = 0, cy = 0;
    for (const p of parts) { const pm = Math.PI * p.r * p.r * dens * 0.01; m += pm; cx += p.x * pm; cy += p.y * pm; }
    cx /= m; cy /= m;
    let I = 0, br = 0;
    for (const p of parts) { p.x -= cx; p.y -= cy; const pm = Math.PI * p.r * p.r * dens * 0.01; I += pm * (0.5 * p.r * p.r + p.x * p.x + p.y * p.y); br = Math.max(br, Math.hypot(p.x, p.y) + p.r); }
    const type = o.type || 'dynamic', dyn = type === 'dynamic';
    const b = {
      id: nextId++, type, shape: o.shape || { kind: 'circle', r: 16 }, spec, density: dens,
      friction: o.friction == null ? 0.5 : o.friction,
      restitution: o.restitution == null ? PH.e : o.restitution,
      group: o.group || 'item', data: o.data || {},
      x: o.x || 0, y: o.y || 0, a: o.angle || 0, vx: 0, vy: 0, av: 0,
      m, I, invM: dyn ? 1 / m : 0, invI: dyn ? 1 / I : 0,
      parts, br, px: new Float64Array(parts.length), py: new Float64Array(parts.length),
      sl: !dyn, slT: 0, held: 0, world: null,
      // material physics (applyMaterial): gravity scale, air drag, floor slickness, bounce threshold
      gs: o.gs == null ? 1 : o.gs, drag: o.drag || 0, slick: o.slick == null ? 1 : o.slick, bounceV: o.bounceV || PH.bounceV, mat: null,
      box: { x0: 0, y0: 0, x1: 0, y1: 0 },
      aabb() { return this.box; },
    };
    if (o.mat) applyMaterial(b, o.mat);
    sync(b);
    return b;
  }

  /* Refresh the world positions of the parts and the AABB from x/y/a. */
  function sync(b) {
    const c = Math.cos(b.a), s = Math.sin(b.a);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < b.parts.length; i++) {
      const p = b.parts[i];
      const px = b.x + p.x * c - p.y * s, py = b.y + p.x * s + p.y * c;
      b.px[i] = px; b.py[i] = py;
      if (px - p.r < x0) x0 = px - p.r; if (px + p.r > x1) x1 = px + p.r;
      if (py - p.r < y0) y0 = py - p.r; if (py + p.r > y1) y1 = py + p.r;
    }
    b.box.x0 = x0; b.box.y0 = y0; b.box.x1 = x1; b.box.y1 = y1;
  }

  /* Teleport a body. */
  function setPose(b, x, y, a) { b.x = x; b.y = y; if (a != null) b.a = a; sync(b); }

  function wake(b) { if (b.type === 'dynamic') { b.sl = false; b.slT = 0; } }

  // ---- segments (walls and claw parts) -------------------------------------
  function mkSeg(ax, ay, bx, by, r, name) { return { ax, ay, bx, by, r, own: 9, vx: 0, vy: 0, om: 0, hx: 0, hy: 0, wall: name || null }; }
  const segTmp = { x: 0, y: 0 };
  function segClosest(s, px, py, out) {
    const dx = s.bx - s.ax, dy = s.by - s.ay, l2 = dx * dx + dy * dy;
    let t = l2 > 1e-6 ? ((px - s.ax) * dx + (py - s.ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    out.x = s.ax + dx * t; out.y = s.ay + dy * t;
    return out;
  }

  // ---- contacts ------------------------------------------------------------
  function addContact(W, a, b, px, py, nx, ny, pen, mu, seg) {
    W.contacts.push({ a, b, px, py, nx, ny, pen, mu, seg, jn: 0, jt: 0, kn: 0, kt: 0, bias: 0,
      rax: 0, ray: 0, rbx: 0, rby: 0, kvx: 0, kvy: 0, ima: 0, iIa: 0, imb: 0, iIb: 0 });
  }
  /* Parts of b against one capsule segment (a wall or a claw part).  Claw
     contacts also feed the rig: touch (the claw landed on something) and
     per-prong halt (something is in the way of the closing sweep). */
  function bodyVsSeg(W, b, s, claw) {
    const q = segClosest(s, b.x, b.y, segTmp);
    const R0 = b.br + s.r, qx0 = b.x - q.x, qy0 = b.y - q.y;
    if (qx0 * qx0 + qy0 * qy0 > R0 * R0) return;
    const K = claw ? W.ctl : null;
    for (let i = 0; i < b.parts.length; i++) {
      const r = b.parts[i].r, px = b.px[i], py = b.py[i];
      const c = segClosest(s, px, py, segTmp);
      const ex = c.x - px, ey = c.y - py, d2 = ex * ex + ey * ey, rr = r + s.r;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2);
      const nx = d > 1e-6 ? ex / d : 0, ny = d > 1e-6 ? ey / d : -1;
      const pen = rr - d;
      let mu;
      if (claw) { mu = K.mu * clamp(Math.sqrt(b.friction / 0.45), 0.35, 1.15); if (K.T !== CLAW_TYPES.classic) mu *= shapeMu(K.T, b); }
      else mu = Math.sqrt(PH.wallMu * b.friction) * b.slick;
      addContact(W, b, null, px + nx * r, py + ny * r, nx, ny, pen, mu, s);
      if (claw) {
        wake(b);
        b.held = 2;
        if ((s.own === 0 && pen > RIG.touchHub && ny < -0.2) || (s.own !== 0 && pen > RIG.touchProng && ny < -0.3)) {
          K.touch = true;
          if (s.head) K.tw.touch[s.head < 0 ? 0 : 1] = true;   // CR8: which twin head landed
        }
        // CR8: a light twin head can shove a loose pile down instead of sinking
        // into it, so steady pressing on anything below also counts as landing
        if (s.head && s.own === 0 && ny < -0.5 && pen > 0.08) K.tw.press[s.head < 0 ? 0 : 1] = true;
        // ...and so does shoving something too big to hold into the floor
        if (s.head && ny < -0.3 && b.br > 40 * K.s && b.box.y1 > W.clampBox.floorY + RIG.floorSink + 5 && b.x < W.clampBox.chuteX) K.tw.touch[s.head < 0 ? 0 : 1] = true;
        // a prong only stalls on something in the way of its closing sweep,
        // not on the pile leaning against its outside
        if (s.own !== 0) {
          const open = ((s.own < 0 ? K.pL : K.pR) - K.T.closed) / (K.T.open - K.T.closed);
          if (pen > K.halt + RIG.haltOpen * open * open) {
            // (a twin head's prongs: own is the head, sd the side it sweeps from)
            const omc = (s.sd || s.own) * RIG.closeRate, cvx = -omc * (py - s.hy), cvy = omc * (px - s.hx);
            if (cvx * nx + cvy * ny < 0) { if (s.own < 0) K.hitL = true; else K.hitR = true; }
          }
        }
      }
    }
  }
  /* A claw type's friction multiplier for one body: round things (balls,
     blobs) and long capsules grip differently in a tri-claw or a scoop. */
  function shapeMu(T, b) {
    const k = b.spec ? b.spec.kind : 'ball';
    if (k === 'ball') return T.mu * T.roundMu;
    if (k === 'blob') return T.mu * (1 + T.roundMu) * 0.5;
    return T.mu * (b.spec.len > 40 ? T.longMu : (1 + T.longMu) * 0.5);
  }
  function collide(W) {
    const B = W.bodies; W.contacts.length = 0;
    if (W.ctl && W.ctl.tw) W.ctl.tw.press[0] = W.ctl.tw.press[1] = false;   // CR8: twin heads re-read each step
    for (const b of B) sync(b);
    for (let i = 0; i < B.length; i++) {
      const a = B[i];
      if (a.tube) continue;   // CR8: riding up the vacuum's hose (the rig moves it)
      for (let j = i + 1; j < B.length; j++) {
        const b = B[j];
        if ((a.sl && b.sl) || b.tube) continue;
        const dx = b.x - a.x, dy = b.y - a.y, RR = a.br + b.br;
        if (dx * dx + dy * dy > RR * RR) continue;
        const mu = Math.sqrt(a.friction * b.friction) * Math.min(a.slick, b.slick);
        for (let m = 0; m < a.parts.length; m++) {
          const ra = a.parts[m].r;
          for (let n = 0; n < b.parts.length; n++) {
            const rb = b.parts[n].r;
            const ex = b.px[n] - a.px[m], ey = b.py[n] - a.py[m], d2 = ex * ex + ey * ey, rr = ra + rb;
            if (d2 >= rr * rr) continue;
            const d = Math.sqrt(d2);
            const nx = d > 1e-6 ? ex / d : 0, ny = d > 1e-6 ? ey / d : 1;
            const pen = rr - d;
            addContact(W, a, b, a.px[m] + nx * (ra - pen * 0.5), a.py[m] + ny * (ra - pen * 0.5), nx, ny, pen, mu, null);
          }
        }
      }
    }
    for (const b of B) {
      if (b.type !== 'dynamic' || b.tube) continue;
      if (!b.sl) for (const s of W.segs) bodyVsSeg(W, b, s, false);
      if (!(b.passClaw > 0)) for (const s of W.csegs) bodyVsSeg(W, b, s, true);
    }
  }
  function relVel(c, out) {
    const a = c.a;
    const vax = a.vx - a.av * c.ray, vay = a.vy + a.av * c.rax;
    let vbx = 0, vby = 0;
    if (c.b) { const b = c.b; vbx = b.vx - b.av * c.rby; vby = b.vy + b.av * c.rbx; }
    else if (c.seg) { vbx = c.kvx; vby = c.kvy; }
    out.x = vbx - vax; out.y = vby - vay;
    return out;
  }
  const rv = { x: 0, y: 0 };
  function prepContacts(W, h) {
    for (const c of W.contacts) {
      const a = c.a, b = c.b;
      // a sleeper hit hard or pushed deep wakes up
      if (b && a.sl !== b.sl) {
        const s = a.sl ? a : b, o = a.sl ? b : a;
        if (c.pen > PH.wakePen || Math.hypot(o.vx, o.vy) > PH.wakeV) wake(s);
      }
      const ima = a.sl ? 0 : a.invM, iIa = a.sl ? 0 : a.invI;
      const imb = b && !b.sl ? b.invM : 0, iIb = b && !b.sl ? b.invI : 0;
      c.ima = ima; c.iIa = iIa; c.imb = imb; c.iIb = iIb;
      c.rax = c.px - a.x; c.ray = c.py - a.y;
      if (b) { c.rbx = c.px - b.x; c.rby = c.py - b.y; }
      else if (c.seg) { const s = c.seg; c.kvx = s.vx - s.om * (c.py - s.hy); c.kvy = s.vy + s.om * (c.px - s.hx); }
      const nx = c.nx, ny = c.ny, tx = -ny, ty = nx;
      const rna = c.rax * ny - c.ray * nx, rta = c.rax * ty - c.ray * tx;
      let kn = ima + iIa * rna * rna, kt = ima + iIa * rta * rta;
      if (b) { const rnb = c.rbx * ny - c.rby * nx, rtb = c.rbx * ty - c.rby * tx; kn += imb + iIb * rnb * rnb; kt += imb + iIb * rtb * rtb; }
      c.kn = kn > 0 ? 1 / kn : 0; c.kt = kt > 0 ? 1 / kt : 0;
      const cap = c.seg && c.seg.own !== 9 ? PH.clawBias : PH.maxBias;
      c.bias = Math.min(cap, PH.beta / h * Math.max(0, c.pen - PH.slop));
      const v = relVel(c, rv), vn = v.x * nx + v.y * ny;
      const e = Math.max(a.restitution, b ? b.restitution : 0);
      // a bouncy body (rubber) rebounds from gentler hits too
      const bv = b ? Math.min(a.bounceV, b.bounceV) : a.bounceV;
      if (vn < -bv) c.bias = Math.max(c.bias, -e * vn);
      c.jn = 0; c.jt = 0;
    }
  }
  function applyImp(c, Px, Py) {
    const a = c.a;
    a.vx -= Px * c.ima; a.vy -= Py * c.ima; a.av -= c.iIa * (c.rax * Py - c.ray * Px);
    if (c.b) { const b = c.b; b.vx += Px * c.imb; b.vy += Py * c.imb; b.av += c.iIb * (c.rbx * Py - c.rby * Px); }
  }
  function solveContacts(W) {
    const C = W.contacts;
    for (let k = 0; k < PH.it; k++) {
      for (let i = 0; i < C.length; i++) {
        const c = C[i];
        if (!c.kn) continue;
        let v = relVel(c, rv);
        const vn = v.x * c.nx + v.y * c.ny;
        let j = (c.bias - vn) * c.kn;
        const o = c.jn; c.jn = Math.max(0, o + j); j = c.jn - o;
        applyImp(c, j * c.nx, j * c.ny);
        const tx = -c.ny, ty = c.nx;
        v = relVel(c, rv);
        const vt = v.x * tx + v.y * ty;
        let jt = -vt * c.kt;
        const mx = c.mu * c.jn, ot = c.jt;
        c.jt = clamp(ot + jt, -mx, mx); jt = c.jt - ot;
        applyImp(c, jt * tx, jt * ty);
      }
    }
  }
  /* Slide a body that pokes through a side wall back inside (by its real
     part extents, not its centre).  The wall's own surface is at xMin - 5 /
     xMax + 5; PH.wallTol of sink is left alone so a body resting on the wall
     is never nudged (normal physics is unchanged). */
  const ext = { lo: 0, hi: 0 };
  /* A body's horizontal extent from its centre right now (live pose, not the
     last sync): ext.lo is how far left of b.x it reaches, ext.hi how far right. */
  function extentX(b) {
    const c = Math.cos(b.a), s = Math.sin(b.a);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < b.parts.length; i++) {
      const p = b.parts[i], dx = p.x * c - p.y * s;
      if (dx - p.r < lo) lo = dx - p.r;
      if (dx + p.r > hi) hi = dx + p.r;
    }
    ext.lo = -lo; ext.hi = hi;
    return ext;
  }
  function wallInside(b, cb) {
    const e = extentX(b);
    const maxR = cb.xMax + 5 + PH.wallTol, minL = cb.xMin - 5 - PH.wallTol;
    if (b.x + e.hi > maxR) { b.x = maxR - e.hi; if (b.vx > 0) b.vx = 0; }
    else if (b.x - e.lo < minL) { b.x = minL + e.lo; if (b.vx < 0) b.vx = 0; }
  }
  /* One substep: gravity and damping, contacts, integration, the hard
     clamps, held decay and sleeping. */
  function physStep(W, h) {
    const g = W.gravity, B = W.bodies, cb = W.clampBox;
    for (const b of B) {
      if (b.sl || b.type !== 'dynamic' || b.tube) continue;
      // material gravity scale (magic floats down) and air drag (light things drift)
      b.vx += g.x * h * b.gs; b.vy += g.y * h * b.gs;
      const ld = 1 - (PH.linDamp + b.drag) * h, ad = 1 - PH.angDamp * h;
      b.vx *= ld; b.vy *= ld; b.av *= ad;
    }
    collide(W);
    prepContacts(W, h);
    solveContacts(W);
    for (const b of B) {
      if (b.sl || b.type !== 'dynamic' || b.tube) continue;
      const sp = b.vx * b.vx + b.vy * b.vy;
      if (sp > PH.maxV * PH.maxV) { const k = PH.maxV / Math.sqrt(sp); b.vx *= k; b.vy *= k; }
      b.x += b.vx * h; b.y += b.vy * h; b.a += b.av * h;
      // the claw can shove things into the floor; never let them through it
      if (b.x < cb.chuteX - 4) { if (b.y > cb.floorY) { b.y = cb.floorY; if (b.vy > 0) b.vy = 0; } }
      else if (b.y > cb.trayY) { b.y = cb.trayY; if (b.vy > 0) b.vy = 0; }
      // ...or through the side walls and the lid, however hard the claw shoves
      if (b.x < cb.xMin) { b.x = cb.xMin; if (b.vx < 0) b.vx = 0; }
      else if (b.x > cb.xMax) { b.x = cb.xMax; if (b.vx > 0) b.vx = 0; }
      if (b.y < cb.yMin) { b.y = cb.yMin; if (b.vy < 0) b.vy = 0; }
      // (round 23) the clamps above only bound the CENTRE: a long item (a sword) whose centre sits at the
      // clamp has its far end in or beyond the wall, where the wall segment pushes those parts OUT, pins
      // the body, and it hangs there at rail height for ever.  Bound the extent too.
      if (b.x + b.br > cb.xMax + 5 + PH.wallTol || b.x - b.br < cb.xMin - 5 - PH.wallTol) wallInside(b, cb);
      if (b.held > 0) b.held -= h * PH.heldDecay;
      if (b.passClaw > 0) b.passClaw -= h;
      if (!W.busy && sp < PH.sleepV * PH.sleepV && Math.abs(b.av) < PH.sleepW && b.held <= 0) {
        b.slT += h;
        if (b.slT > PH.sleepT) { b.sl = true; b.vx = b.vy = b.av = 0; }
      } else b.slT = 0;
    }
  }

  // ---- world ---------------------------------------------------------------
  /* world({w, h, gravity}) -> W.  Pre hooks run before each substep (the rig
     plans its velocities there), post hooks after (the rig moves). */
  function world(o) {
    o = o || {};
    const w = o.w || 480, h = o.h || 390;
    const W = {
      gravity: { x: o.gravity ? o.gravity.x : 0, y: o.gravity ? o.gravity.y : 1400 },
      w, h, bodies: [], segs: [], csegs: [], contacts: [], ctl: null, busy: false,
      pre: [], post: [], time: 0, acc: 0, steps: 0,
      clampBox: { xMin: 5, xMax: w - 5, yMin: RIG.clampTop, floorY: h - RIG.floorSink, chuteX: w + 100, trayY: h - RIG.floorSink },
      add, remove, step, setGravity, energy, contactsOf, queryAABB, wakeAll, addHook, removeHook, addPost, removePost, sync,
    };
    function add(b) { if (W.bodies.indexOf(b) < 0) W.bodies.push(b); b.world = W; sync(b); return b; }
    function remove(b) {
      const i = W.bodies.indexOf(b); if (i >= 0) W.bodies.splice(i, 1);
      b.world = null;
      wakeAll();   // whatever rested on it must fall
    }
    function setGravity(x, y) { W.gravity.x = x; W.gravity.y = y; wakeAll(); }
    function wakeAll() { for (const b of W.bodies) wake(b); }
    function addHook(fn) { if (W.pre.indexOf(fn) < 0) W.pre.push(fn); }
    function removeHook(fn) { const i = W.pre.indexOf(fn); if (i >= 0) W.pre.splice(i, 1); }
    function addPost(fn) { if (W.post.indexOf(fn) < 0) W.post.push(fn); }
    function removePost(fn) { const i = W.post.indexOf(fn); if (i >= 0) W.post.splice(i, 1); }
    /* Sum of kinetic energy (linear + angular) of the dynamic bodies. */
    function energy() {
      let e = 0;
      for (const b of W.bodies) if (b.type === 'dynamic') e += 0.5 * b.m * (b.vx * b.vx + b.vy * b.vy) + 0.5 * b.I * b.av * b.av;
      return e;
    }
    function queryAABB(x0, y0, x1, y1) {
      const out = [];
      for (const b of W.bodies) { const bx = b.box; if (bx.x1 >= x0 && bx.x0 <= x1 && bx.y1 >= y0 && bx.y0 <= y1) out.push(b); }
      return out;
    }
    /* Contacts touching b from the last substep; the normal points from b to
       other.  other is a body, or a segment ({wall} for cabinet walls, {own}
       -1/0/1 for claw parts). */
    function contactsOf(b) {
      const out = [];
      for (const c of W.contacts) {
        if (c.a === b) out.push({ other: c.b || c.seg, nx: c.nx, ny: c.ny, px: c.px, py: c.py, depth: c.pen, claw: !!(c.seg && c.seg.own !== 9) });
        else if (c.b === b) out.push({ other: c.a, nx: -c.nx, ny: -c.ny, px: c.px, py: c.py, depth: c.pen, claw: false });
      }
      return out;
    }
    function substep() {
      for (let i = 0; i < W.pre.length; i++) W.pre[i](H, W);
      physStep(W, H);
      for (let i = 0; i < W.post.length; i++) W.post[i](H, W);
      W.time += H; W.steps++;
    }
    /* Fixed-step accumulator: whole substeps, at most MAX_SUB per call. */
    function step(dt) {
      if (!(dt > 0)) return;
      W.acc += Math.min(dt, MAX_SUB * H);
      let n = 0;
      while (W.acc >= H - 1e-9 && n < MAX_SUB) { substep(); W.acc -= H; n++; }
      if (W.acc < 1e-9) W.acc = 0;
      if (W.acc > H) W.acc = H;
      for (const b of W.bodies) sync(b);
    }
    return W;
  }

  // ---- impulses ----------------------------------------------------------
  /* A bomb going off in the bin: every dynamic body within r of (x, y) is
     woken and thrown outward (and a little up), harder the closer it is.
     Deterministic; the hard clamps keep everything inside the glass.
     Returns the bodies it pushed. */
  function blast(W, x, y, r, power, except) {
    const out = [];
    if (!W || !(r > 0)) return out;
    power = power == null ? 900 : power;
    for (const b of W.bodies) {
      if (b.type !== 'dynamic' || b === except) continue;
      const dx = b.x - x, dy = b.y - y, d = Math.hypot(dx, dy);
      if (d > r + b.br) continue;
      const k = clamp(1 - d / (r + b.br), 0.15, 1);
      const nx = d > 1 ? dx / d : 0, ny = d > 1 ? dy / d : -1;
      wake(b);
      b.passClaw = 0;
      b.vx += nx * power * k;
      b.vy += ny * power * k - power * 0.45 * k;
      b.av += (nx >= 0 ? 1 : -1) * 9 * k;
      out.push(b);
    }
    return out;
  }
  /* A heavy thud shakes the floor: bodies within r hop up by up to v px/s
     (less the farther they are). Returns the bodies that hopped. */
  function hop(W, x, y, r, v, except) {
    const out = [];
    if (!W || !(r > 0)) return out;
    for (const b of W.bodies) {
      if (b.type !== 'dynamic' || b === except || b.held > 0) continue;
      const d = Math.hypot(b.x - x, b.y - y);
      if (d > r) continue;
      const k = clamp(1 - d / r, 0.3, 1);
      wake(b);
      b.vy = Math.min(b.vy, 0) - v * k;
      b.av += (b.x < x ? -1 : 1) * 2.5 * k;
      out.push(b);
    }
    return out;
  }

  // ---- cabinet -----------------------------------------------------------
  /* Static capsule walls around the interior [0,w]x[0,h]: left, right, floor
     (none under the chute: prizes fall through it onto a hidden tray), the
     chute divider on the RIGHT, and the lid.  Also sets the world's hard
     clamps.  Returns {inChute(b), bounds, segs}. */
  function cabinet(W, o) {
    o = o || {};
    const w = o.w || 480, h = o.h || 390, chuteW = o.chuteW || 64;
    const dividerH = o.dividerH == null ? 0.6 : o.dividerH;
    const chuteX = w - chuteW, dividerTop = h - dividerH * h, trayY = h + RIG.tray;
    const segs = [
      mkSeg(-4, -120, -4, h + 4, 4, 'left'),
      mkSeg(w + 4, -120, w + 4, trayY + 40, 4, 'right'),
      mkSeg(-8, h + 4, chuteX, h + 4, 4, 'floor'),
      mkSeg(chuteX, dividerTop, chuteX, trayY + 4, 5, 'divider'),   // runs down to the tray: no pocket under the floor
      mkSeg(-8, RIG.lid, w + 8, RIG.lid, 4, 'lid'),
      mkSeg(chuteX - 2, trayY + 4, w + 8, trayY + 4, 4, 'tray'),
    ];
    // Optional floor slopes: two ramps that push the pile toward the middle so
    // it heaps up instead of spreading into one thin row across the glass.
    const slopeW = o.slopeW || 0, slopeH = o.slopeH || 0;
    if (slopeW > 0 && slopeH > 0) {
      segs.push(mkSeg(-4, h - slopeH, slopeW, h + 2, 5, 'slopeL'));
      segs.push(mkSeg(chuteX - slopeW, h + 2, chuteX - 6, h - slopeH, 5, 'slopeR'));
    }
    W.segs = segs;
    W.clampBox = { xMin: 5, xMax: w - 5, yMin: RIG.clampTop, floorY: h - RIG.floorSink, chuteX, trayY: trayY - RIG.floorSink };
    return {
      segs, bodies: [],
      bounds: { w, h, chuteX, chuteW, dividerTop, floorY: h, trayY, slopeW, slopeH },
      inChute(b) { return b.x > chuteX && b.x < w && b.y > dividerTop; },
    };
  }

  // ---- claw rig ----------------------------------------------------------
  /* clawRig(W, {cabinet, homeX, chuteX, railY, type, prongs, width, grip,
     speed, rubber, magnet, rand}).  Kinematic hub + two prongs driven by
     Claw Crawl's state machine: idle -> drop -> close -> lift -> carry ->
     open -> return.  type picks the variant (CLAW_TYPES; default classic).
     See DESIGN.md for the public surface. */
  function clawRig(W, o) {
    o = o || {};
    const C = o.cabinet;
    const cw = C ? C.bounds.w : W.w, ch = C ? C.bounds.h : W.h;
    const binX = C ? C.bounds.chuteX : cw - 64;              // right edge of the bin (the divider)
    const cfg = {
      type: CLAW_TYPES[o.type] ? o.type : 'classic',
      prongs: o.prongs === 3 ? 3 : 2, width: o.width == null ? 1 : o.width,
      grip: o.grip == null ? 1 : o.grip, speed: o.speed == null ? 1 : o.speed,
      rubber: o.rubber ? 1 : 0, magnet: o.magnet ? 1 : 0, grease: o.grease ? 1 : 0,
    };
    const rand = o.rand || (() => 0.5);
    const railY = o.railY == null ? 26 : o.railY;
    const RAIL = railY + RIG.hubDrop;
    const homeX = o.homeX == null ? binX * 0.5 : o.homeX;
    const chuteX = o.chuteX == null ? binX + (C ? C.bounds.chuteW : 64) * 0.5 : o.chuteX;
    const T0 = typeOf(cfg.type);
    // Internal claw state (Claw Crawl's F.claw), shared with bodyVsSeg through W.ctl.
    const K = {
      x: homeX, y: RAIL, tx: homeX, vx: 0, vy: 0, pL: T0.open, pR: T0.open, wL: 0, wR: 0,
      st: 'idle', t: 0, s: 1, grip: 0.5, mu: 1, halt: 2.2, pending: false, moving: false,
      touch: false, hitL: false, hitR: false, haltL: false, haltR: false, blkL: 0, blkR: 0,
      loosen: 0, jolt: 0, sway: 0, swayV: 0, cargo: [], returning: false,
      T: T0, stuck: [], digT: 0, spear: null, field: 0,
      // CR8: the twin heads (x offsets from the bar, cable reeled out, their
      // slide / reel speeds, the goals, who landed), the vacuum's tube, clog and clock
      tw: { x: [0, 0], d: [0, 0], vx: [0, 0], vd: [0, 0], goal: [0, 0], touch: [false, false], done: [false, false], press: [false, false], lean: [0, 0] },
      tube: [], clog: null, vt: 0, blowN: 0,
    };
    /* CR8: how far below the rail a type parks (the vacuum's wand and canister
       ride above its nozzle; a small cabinet gets a shorter drop). */
    const parkOf = (T) => Math.min(T.park || 0, ch * 0.18);
    const R = {
      phase: 'idle', x: homeX, y: RAIL + parkOf(T0), targetX: homeX, sway: 0, type: cfg.type, auto: null, field: 0,
      cableTop: { x: homeX, y: railY },
      bodies: { hub: { x: homeX, y: RAIL + parkOf(T0), r: T0.hubR }, prongs: [[], []], ghost: null, tip: null },
      cfg, homeX, chuteX, railY, geo: null, ctl: K, events: [],
      setTarget, drop, update, held, locked, cradle, open, setConfig, destroy, calm, size, gripCC, shed: () => shedRiders(),
      autoSteer, cancelAuto, aimAt, stuck: () => K.stuck.map(sk => sk.b),
      tube: () => K.tube.map(e => e.b), vac: null,   // CR8: what the vacuum holds in its canister, its parts for the renderer
    };
    K.y = RAIL + parkOf(T0);
    /* CR8: where the hub parks and lifts to. */
    function railOf() { return RAIL + parkOf(K.T); }
    function size() { return RIG.base * cfg.width * (cfg.prongs === 3 ? RIG.prong3Size : 1) * K.T.size; }
    /* Clawspire's grip (0.75..2+) mapped onto Claw Crawl's 0..1 grip. */
    function gripCC() {
      let g = clamp(RIG.gripBase + RIG.gripSlope * (cfg.grip - 0.75), RIG.gripMin, 1);
      g += cfg.rubber ? RIG.rubberGrip : 0;
      g += cfg.prongs === 3 ? RIG.prong3Grip : 0;
      g -= cfg.grease ? RIG.greaseGrip : 0;
      g += K.T.gripAdd;
      return clamp(g, 0.05, 1);
    }
    /* How far down a closed claw reaches below the hub centre (the tips, the
       magnet's face, the hook's barb). */
    function reachOf() {
      const T = K.T;
      if (T.twin) return T.twin.hang * K.s + (RIG.hingeY + T.poly[T.poly.length - 1][1]) * K.s;   // CR8: a twin head's tips
      if (T.weld === 'spear') return T.tip * K.s;
      if (!T.poly) return T.hubR * K.s;
      return (RIG.hingeY + T.poly[T.poly.length - 1][1]) * K.s;
    }
    function refresh() {
      K.T = typeOf(cfg.type); R.type = cfg.type;
      K.s = size(); K.grip = gripCC(); K.mu = 0.6 + K.grip * 0.8;
      const s = K.s;
      R.geo = { s, grip: K.grip, hubR: K.T.hubR * s, reach: reachOf(), span: openSpan() * 2, halt: (RIG.haltBase + RIG.haltGrip * K.grip) * K.T.haltK, mu: K.mu, type: cfg.type };
    }
    /* Horizontal reach of an open prong tip from the hub centre. */
    function openSpan() {
      const P = K.T.twin ? twinPts(1, 1) : prongPts(1);
      let m = K.T.hubR * K.s; for (const p of P) m = Math.max(m, p.x - K.x);
      return m;
    }
    function lim() { return K.T.twin ? twinSpan() + K.T.twin.sep * K.s + 6 : Math.max(34 * K.s, K.T.hubR * K.s + 4) + 6; }
    function clampX(x) { return clamp(x, lim(), binX - lim()); }
    function prongPts(side) {
      const T = K.T;
      if (!T.poly) return [];
      const s = K.s, phi = side < 0 ? K.pL : K.pR;
      const hx = K.x + side * RIG.hingeX * s, hy = K.y + RIG.hingeY * s;
      const al = -side * phi, ca = Math.cos(al), sa = Math.sin(al);
      return T.poly.map(([lx, ly]) => { const x = side * lx * s, y = ly * s; return { x: hx + x * ca - y * sa, y: hy + x * sa + y * ca }; });
    }
    // ---- CR8: the twin heads. Head i (0 left, 1 right) hangs hang x size under
    // the bar plus the cable it reeled out, its prongs at the head's own angle
    // (pL for the left head, pR for the right one).
    function headX(i) { return K.x + K.tw.x[i]; }
    function headY(i) { return K.y + K.T.twin.hang * K.s + K.tw.d[i]; }
    function twinPts(i, side) { return cr8Prong(K.T, K.s, headX(i), headY(i), side, i ? K.pR : K.pL); }
    // How far an open head reaches out from its own centre.
    function twinSpan() { let m = K.T.hubR * K.s; for (const p of cr8Prong(K.T, K.s, 0, 0, 1, K.T.open)) m = Math.max(m, p.x); return m; }
    /* The height the cargo and slip checks measure from: the hub, or the lower twin head. */
    function hubY() { return K.T.twin ? Math.max(headY(0), headY(1)) : K.y; }
    /* The drop's first beat: the prize nearest the aim (the topmost on a
       tie) is the main one. A big one (wider than a head can hold) is hugged
       by both heads, one on each side; a small one goes to the head on its
       side and the other head picks the nearest prize on its own side (or
       stays home). The heads always keep gap apart. */
    function twinSeek() {
      const T = K.T, tw = K.tw, s = K.s, sep = T.twin.sep * s, reach = (T.twin.sep + T.twin.seek) * s, gap = T.twin.gap * s;
      const best = (x0, side, not) => {
        let bb = null, bd = Infinity;
        for (const b of W.bodies) {
          if (b.type !== 'dynamic' || b.tube || b === not || b.group !== 'item' || b.x >= binX || b.y < K.y) continue;
          if (Math.abs(b.x - K.x) > reach || (side < 0 && b.x > K.x + sep * 0.25) || (side > 0 && b.x < K.x - sep * 0.25)) continue;
          const d = Math.abs(b.x - x0);
          if (d < bd - 2 || (d <= bd + 2 && bb && b.box.y0 < bb.box.y0)) { bd = Math.min(d, bd); bb = b; }
        }
        return bb;
      };
      const main = best(K.x, 0, null);
      let g0 = -sep, g1 = sep;
      if (main && main.br > twinSpan() * 0.85) {
        const hs = Math.max(gap / 2, Math.min(main.br * 0.75, sep * 1.4));
        g0 = main.x - K.x - hs; g1 = main.x - K.x + hs;
      } else if (main) {
        const mine = main.x <= K.x ? 0 : 1;
        const other = best(K.x + (mine ? -sep : sep), mine ? -1 : 1, main);
        if (mine === 0) { g0 = main.x - K.x; if (other) g1 = other.x - K.x; }
        else { g1 = main.x - K.x; if (other) g0 = other.x - K.x; }
      }
      if (g1 - g0 < gap) {
        // too close: the main prize's head stays on it, the other steps aside
        if (main && main.br <= twinSpan() * 0.85 && main.x > K.x) g0 = g1 - gap;
        else if (main && main.br <= twinSpan() * 0.85) g1 = g0 + gap;
        else { const m = (g0 + g1) / 2; g0 = m - gap / 2; g1 = m + gap / 2; }
      }
      const lo = twinSpan() + 6 - K.x, hi = binX - twinSpan() - 6 - K.x;
      tw.goal[0] = clamp(g0, lo, hi - gap); tw.goal[1] = clamp(g1, lo + gap, hi);
    }
    /* Slide each head toward its goal (px/s capped), this substep. */
    function twinSlide(h, g0, g1) {
      const tw = K.tw, v = K.T.twin.slide;
      if (g0 != null) { tw.goal[0] = g0; tw.goal[1] = g1; }
      for (let i = 0; i < 2; i++) tw.vx[i] = clamp((tw.goal[i] - tw.x[i]) / h, -v, v);
    }
    /* The twin drop: the bar comes down until a head lands, then the other
       head reels out on its own cable until it lands too (or the floor, or
       the end of its cable); both landed, the claws close. */
    function twinDrop(h, maxY) {
      const T = K.T, tw = K.tw, s = K.s;
      if (K.t <= h * 1.5) { twinSeek(); tw.done[0] = tw.done[1] = tw.touch[0] = tw.touch[1] = false; tw.lean[0] = tw.lean[1] = 0; }
      twinSlide(h);
      const was = tw.done[0] || tw.done[1];
      for (let i = 0; i < 2; i++) {
        tw.lean[i] = tw.press[i] ? tw.lean[i] + h : 0;
        if (tw.done[i]) continue;
        if (tw.touch[i] || tw.lean[i] > 0.03 || headY(i) >= maxY - 0.5 || tw.d[i] >= T.twin.ext * s) tw.done[i] = true;
      }
      const first = !was && (tw.done[0] || tw.done[1]);
      tw.touch[0] = tw.touch[1] = false;
      const v = RIG.dropSpeed * T.drop;
      tw.vd[0] = tw.vd[1] = 0;
      if (!tw.done[0] && !tw.done[1]) {
        K.vy = v;
        const low = Math.max(headY(0), headY(1));
        if (low + K.vy * h > maxY) K.vy = Math.max(0, (maxY - low) / h);
      } else {
        for (let i = 0; i < 2; i++) if (!tw.done[i]) tw.vd[i] = Math.max(0, Math.min(v, (maxY - headY(i)) / h));
      }
      if (first) emit('touch');
      if (tw.done[0] && tw.done[1]) {
        K.st = 'close'; K.t = 0; K.haltL = K.haltR = false; K.blkL = K.blkR = 0;
        K.halt = (RIG.haltBase + RIG.haltGrip * K.grip) * T.haltK;
        K.vy = 0;
        emit('close');
      }
    }
    /* The drawn-only third finger: a shorter straight prong down the middle
       (the tri-claw's is a full prong that curls with the other two). */
    function ghostPts() {
      const s = K.s, phi = (K.pL + K.pR) * 0.5;
      const hy = K.y + RIG.hingeY * s;
      if (K.T.ghost) {
        const T = K.T, u = (phi - T.closed) / (T.open - T.closed);
        return T.poly.map(([lx, ly]) => ({ x: K.x + lx * 0.18 * s * (u - 0.35), y: hy + ly * (0.9 - 0.08 * u) * s }));
      }
      const k = 0.86;
      return PRONG.map(([lx, ly]) => ({ x: K.x + lx * 0.25 * s * (1 - phi), y: hy + ly * k * s }));
    }
    function buildSegs() {
      const s = K.s, out = W.csegs, T = K.T; out.length = 0;
      if (T.weld === 'spear') return;   // the harpoon's rope passes through everything
      if (T.twin) {
        // CR8: two small heads, each a hub and two prongs; own is the head
        // (-1 left, 1 right), sd the prong's side, head says who touched
        for (let i = 0; i < 2; i++) {
          const hx = headX(i), hy = headY(i), vx = K.vx + K.tw.vx[i], vy = K.vy + K.tw.vd[i], own = i ? 1 : -1, dphi = i ? K.wR : K.wL;
          const hub = mkSeg(hx, hy, hx, hy, T.hubR * s); hub.own = 0; hub.head = own; hub.vx = vx; hub.vy = vy; hub.hx = hx; hub.hy = hy;
          out.push(hub);
          for (const side of [-1, 1]) {
            const P = twinPts(i, side), phx = hx + side * RIG.hingeX * s, phy = hy + RIG.hingeY * s;
            for (let k = 0; k < P.length - 1; k++) {
              const g = mkSeg(P[k].x, P[k].y, P[k + 1].x, P[k + 1].y, T.segR * s);
              g.own = own; g.sd = side; g.head = own; g.vx = vx; g.vy = vy; g.om = -side * dphi; g.hx = phx; g.hy = phy;
              out.push(g);
            }
          }
        }
        return;
      }
      const hub = mkSeg(K.x, K.y, K.x, K.y, T.hubR * s); hub.own = 0; hub.vx = K.vx; hub.vy = K.vy; hub.hx = K.x; hub.hy = K.y;
      out.push(hub);
      if (!T.poly) return;
      for (const side of [-1, 1]) {
        const dphi = side < 0 ? K.wL : K.wR;
        const hx = K.x + side * RIG.hingeX * s, hy = K.y + RIG.hingeY * s;
        const P = prongPts(side);
        for (let k = 0; k < P.length - 1; k++) {
          const g = mkSeg(P[k].x, P[k].y, P[k + 1].x, P[k + 1].y, T.segR * s);
          g.own = side; g.vx = K.vx; g.vy = K.vy; g.om = -side * dphi; g.hx = hx; g.hy = hy;
          out.push(g);
        }
      }
    }
    function emit(ev) { R.events.push(ev); }
    function phaseName() {
      switch (K.st) {
        case 'idle': return K.moving ? 'moving' : 'idle';
        case 'drop': return 'dropping';
        case 'close': return 'closing';
        case 'lift': return 'lifting';
        case 'carry': return 'carrying';
        case 'open': return 'releasing';
        default: return 'returning';
      }
    }
    function mirror() {
      R.x = K.x; R.y = K.y; R.phase = phaseName(); R.sway = K.sway; R.targetX = K.tx; R.field = K.field;
      R.cableTop.x = K.x - K.sway * 12; R.cableTop.y = railY;
      const hb = R.bodies.hub; hb.x = K.x; hb.y = K.y; hb.r = K.T.hubR * K.s;
      if (K.T.twin) { cr8Mirror(); return; }   // CR8: the twin heads
      R.bodies.prongs.length = 2; R.bodies.twin = null;
      R.bodies.prongs[0] = prongPts(-1); R.bodies.prongs[1] = prongPts(1);
      R.bodies.ghost = cfg.prongs === 3 || K.T.ghost ? (K.T.poly ? ghostPts() : null) : null;
      R.bodies.tip = K.T.weld === 'spear' ? { x: K.x, y: K.y + K.T.tip * K.s } : null;
      R.vac = K.T.weld === 'suck' ? cr8VacGeo(K.T, K.s, K.x, K.y, { n: K.tube.length, cap: vacCap(), clog: !!K.clog, suck: K.field }, R.vac || {}) : null;
    }
    /* CR8: the rig's picture of the twin claws: the bar (the hub), four prongs
       (left head's two, then the right head's) and the two heads. */
    function cr8Mirror() {
      const B = R.bodies, s = K.s;
      B.hub.r = 5 * s + 2;
      for (let i = 0; i < 2; i++) {
        B.prongs[i * 2] = twinPts(i, -1); B.prongs[i * 2 + 1] = twinPts(i, 1);
      }
      if (!B.twin) B.twin = [{ x: 0, y: 0, r: 0 }, { x: 0, y: 0, r: 0 }];
      for (let i = 0; i < 2; i++) { B.twin[i].x = headX(i); B.twin[i].y = headY(i); B.twin[i].r = K.T.hubR * s; }
      B.ghost = null; B.tip = null; R.vac = null;
    }
    /* Travel toward tx at the carriage speed; true when arrived. */
    function travel(tx, h) {
      const d = tx - K.x;
      if (Math.abs(d) > 0.6) { K.vx = Math.sign(d) * Math.min(RIG.carSpeed * cfg.speed * K.T.speed * (R.auto ? R.auto.speed : 1) * (K.clog ? 0.7 : 1), Math.abs(d) / h); return false; }   // (CR8: a plugged vacuum strains)
      return true;
    }
    /* Decide this substep's claw velocities (pre hook). */
    function plan(h) {
      K.vx = 0; K.vy = 0; K.wL = 0; K.wR = 0; K.t += h;
      const T = K.T;
      const maxY = ch - T.floorClear * K.s - 2;
      if (T.twin) cr8TwinPlan(h);   // CR8: the heads slide home, reel in, bunch up over the chute
      switch (K.st) {
        case 'idle': {
          const arrived = travel(clampX(K.tx), h);
          K.moving = !arrived;
          // Nothing rides the parked claw: a leftover passenger is dropped.
          if (arrived && K.t > RIG.idleShed && W.bodies.some(b => b.held > 0 && b.type === 'dynamic')) shedRiders();
          if (arrived && K.pending) {
            K.pending = false; K.st = 'drop'; K.t = 0; K.touch = false; K.cargo = []; K.digT = 0; K.spear = null;
            K.blowN = 0; K.tw.done[0] = K.tw.done[1] = false;   // (CR8)
            W.wakeAll(); emit('drop');
          }
          break;
        }
        case 'return': {
          if (travel(clampX(K.tx), h)) { K.st = 'idle'; K.t = 0; K.moving = false; R.auto = null; emit('home'); }
          break;
        }
        case 'drop': {
          if (T.twin) { twinDrop(h, maxY); break; }   // CR8: each head lands on its own
          K.vy = RIG.dropSpeed * T.drop;
          if (T.weld === 'spear' && !K.spear) spearTest();
          if (T.weld === 'suck' && vacNear()) K.touch = true;   // CR8: the nozzle hovers just over the pile
          let touched = K.touch || !!K.spear;
          // the scoop bites on into the pile a moment before it closes
          if (T.dig > 0 && (touched || K.digT > 0) && K.digT < T.dig && K.y < maxY) {
            if (K.digT === 0) emit('touch');
            K.digT += h; touched = false;
          }
          if (touched || (T.dig > 0 && K.digT >= T.dig) || K.y >= maxY) {
            if (touched && !(T.dig > 0)) emit('touch');
            K.st = 'close'; K.t = 0; K.haltL = K.haltR = false; K.blkL = K.blkR = 0;
            K.halt = (RIG.haltBase + RIG.haltGrip * K.grip) * T.haltK;
            if (K.spear) stick(K.spear);
            emit('close');
          }
          break;
        }
        case 'close': {
          if (T.weld === 'metal' || T.weld === 'spear' || T.weld === 'suck') {
            // the magnet energises (every piece of metal it touches sticks), the barb bites,
            // the vacuum sucks for closeT (CR8: suck() does the work)
            if (T.weld === 'metal') magnetStick(true);
            if (K.t > T.closeT) toLift();
            break;
          }
          // keep squeezing; a prong that has been blocked for a moment has closed on something
          K.blkL = K.hitL ? K.blkL + h : 0;
          K.blkR = K.hitR ? K.blkR + h : 0;
          const cr = RIG.closeRate * T.close;
          if (!K.hitL && K.pL > T.closed) K.wL = -cr;
          if (!K.hitR && K.pR > T.closed) K.wR = -cr;
          if (K.hitL && !K.haltL) K.haltL = true;
          if (K.hitR && !K.haltR) K.haltR = true;
          const doneL = K.blkL > RIG.blockT || K.pL <= T.closed, doneR = K.blkR > RIG.blockT || K.pR <= T.closed;
          if ((doneL && doneR && K.t > RIG.closeMin) || K.t > RIG.closeMax) toLift();
          break;
        }
        case 'lift':
          K.vy = -RIG.liftSpeed * T.lift;
          if (K.t < RIG.loosenT && T.poly) { K.wL = K.wR = K.loosen / RIG.loosenT; }
          // a live magnet keeps snatching the metal that leaps up to it
          if (T.weld === 'metal' && K.t < 0.3) magnetStick(false);
          // a long thing in the scoop sticks out over the rim and tips out
          if (K.tipOut && K.tipOut.length && K.t > 0.22) {
            for (const b of K.tipOut) { const sd = b.x < K.x ? -1 : 1; b.passClaw = RIG.passT; b.held = 0; wake(b); b.vx += sd * 90; b.av += sd * 5; }
            K.tipOut.length = 0;
          }
          if (K.y <= railOf()) {
            K.st = 'carry'; K.t = 0; K.swayV += RIG.swayKick;
            // the jolt at the top: a weak claw twitches open a touch
            K.jolt = rand() < (1 - K.grip) * RIG.joltP ? RIG.jolt : 0;
            // ...and a welded load too heavy for it may tear off
            if (T.weld) tearHeavy();
            emit('carry');
          }
          break;
        case 'carry': {
          if (K.jolt > 0 && K.t < RIG.joltT && T.poly) { K.wL = K.wR = K.jolt / RIG.joltT; }
          if (travel(chuteX + (T.twin ? 3 : 0), h) && K.t > RIG.carryWait) { K.st = 'open'; K.t = 0; K.jolt = 0; unstickAll(); emit('release'); }   // (CR8: the twin a hair right, clear of the divider)
          break;
        }
        case 'open':
          if (K.pL < T.open) K.wL = RIG.openRate;
          if (K.pR < T.open) K.wR = RIG.openRate;
          if (T.weld === 'suck') cr8Blow();   // CR8: the vacuum blows its canister out, one prize at a time
          // hold still until the load has let go of the prongs (it can hang on a
          // tip for a moment), then travel back to the aim point
          if (K.t > RIG.openT && (K.t > RIG.openT + RIG.openHold || !W.bodies.some(b => b.held > 0))) {
            // Anything still wedged in the open claw (two shields jammed
            // against the hub, say) is let go for real: it stops colliding
            // with the claw for a moment and drops straight down the chute.
            shedRiders();
            K.st = 'return'; K.t = 0; K.cargo = [];
          }
          break;
      }
      if (K.st === 'drop' && K.y + K.vy * h > maxY) K.vy = (maxY - K.y) / h;
      if (K.st === 'lift' && K.y + K.vy * h < railOf()) K.vy = (railOf() - K.y) / h;
      K.touch = false; K.hitL = false; K.hitR = false;
      W.busy = K.st === 'drop' || K.st === 'close' || K.st === 'lift';
      W.ctl = K;
      if (T.weld) weldStep(h);
      if (T.weld === 'suck') suck(h);   // CR8: the vacuum's suction
      buildSegs();
      magnet(h);
      if (T.weld === 'metal') {
        // the field: warming up on the way down, full while it holds, off when it lets go
        const on = K.st === 'close' || ((K.st === 'lift' || K.st === 'carry') && K.stuck.length) ? 1 : K.st === 'drop' ? 0.45 : 0;
        K.field += (on - K.field) * Math.min(1, h * 12);
        if (K.st === 'drop' || K.st === 'close' || (K.st === 'lift' && K.t < 0.3)) field(h);
      }
    }
    /* close -> lift: the loosen, and what the claw has hold of. */
    function toLift() {
      const T = K.T;
      K.st = 'lift'; K.t = 0;
      K.loosen = (1 - K.grip) * RIG.loosen * (0.7 + rand() * 0.6);
      if (!T.weld) {
        const y0 = hubY();   // (CR8: the lower twin head)
        K.cargo = W.bodies.filter(b => b.type === 'dynamic' && b.held > 0 && b.y < y0 + RIG.cargoY * K.s);
        // the scoop is a bucket: a sword sticks out of it and tips out on the way up
        K.tipOut = [];
        if (T.tipLen) for (const b of K.cargo) if (b.spec && b.spec.kind === 'cap' && b.spec.len > T.tipLen && rand() < T.tipP) K.tipOut.push(b);
      } else if (T.weld === 'one') {
        // the hand: the biggest thing in its fingers sticks, the rest drops out
        let best = null;
        for (const b of W.bodies) {
          if (b.type !== 'dynamic' || !(b.held > 0) || b.y > K.y + RIG.cargoY * K.s) continue;
          if (!best || b.m > best.m + 1e-9 || (Math.abs(b.m - best.m) <= 1e-9 && b.y < best.y)) best = b;
        }
        for (const b of W.bodies) if (b !== best && b.type === 'dynamic' && b.held > 0) { b.passClaw = RIG.passT; b.held = 0; wake(b); }
        if (best) stick(best);
        K.cargo = K.stuck.map(sk => sk.b);
      } else {
        // the magnet and the hook carry only what they hold (plus whatever
        // happens to ride on that, which is a bonus, not cargo); the vacuum
        // what is in its canister and a clog (CR8)
        K.cargo = K.stuck.map(sk => sk.b);
        if (T.weld === 'suck') for (const e of K.tube) K.cargo.push(e.b);
      }
      emit('lift');
    }
    const isMetal = (b) => !!(b && b.data && b.data.tags && b.data.tags.indexOf('metal') >= 0);
    const isStuck = (b) => { for (const sk of K.stuck) if (sk.b === b) return true; return false; };
    /* Weld a body to the claw at its current offset from the hub. */
    function stick(b) {
      if (!b || isStuck(b)) return;
      K.stuck.push({ b, dx: b.x - K.x, dy: b.y - K.y, a: b.a });
      b.held = 2; b.passClaw = 0; wake(b);
    }
    function unstick(i, drop) {
      const sk = K.stuck[i]; if (!sk) return;
      K.stuck.splice(i, 1);
      const b = sk.b;
      b.held = 0; wake(b);
      if (drop) { b.passClaw = 0.3; if (b.vy < 30) b.vy = 30; }
      const c = K.cargo.indexOf(b); if (c >= 0) K.cargo.splice(c, 1);
      if (K.clog === b) { K.clog = null; emit('unclog'); }   // CR8: the plug is out of the vacuum's nozzle
    }
    function unstickAll() { for (let i = K.stuck.length - 1; i >= 0; i--) unstick(i, true); }
    /* Every welded body is driven to its spot under the hub (a soft velocity
       weld, capped), keeps its angle, and tears off when it lags too far. */
    function weldStep(h) {
      const T = K.T;
      if (!(K.st === 'close' || K.st === 'lift' || K.st === 'carry')) { if (K.stuck.length) unstickAll(); return; }
      if (T.weld === 'metal' && K.st !== 'close') {
        // the magnet's smooth housing holds nothing that is not metal: it slides off
        for (const b of W.bodies) {
          if (b.type !== 'dynamic' || !(b.held > 0) || isMetal(b) || isStuck(b)) continue;
          const sd = b.x < K.x ? -1 : 1;
          b.passClaw = RIG.passT * 0.5; b.held = 0; wake(b); b.vx += sd * 60; if (b.vy < 0) b.vy = 0;
        }
      }
      for (let i = K.stuck.length - 1; i >= 0; i--) {
        const sk = K.stuck[i], b = sk.b;
        if (b.world !== W) { K.stuck.splice(i, 1); continue; }
        let tx = K.x + K.vx * h + sk.dx;
        const ty = K.y + K.vy * h + sk.dy;
        // (round 23) a long load carried to the chute side keeps its far end inside the glass: the weld
        // used to drag a sword's tip through the right wall, where it jammed
        { const cb = W.clampBox, e = extentX(b), lo = cb.xMin - 5 + PH.wallTol + e.lo, hi = cb.xMax + 5 - PH.wallTol - e.hi;
          if (lo <= hi) tx = clamp(tx, lo, hi); }
        const ex = tx - b.x, ey = ty - b.y, e = Math.hypot(ex, ey);
        if (e > T.tear * K.s + 6) { unstick(i, true); b.passClaw = RIG.passT; emit('slip'); continue; }
        let vx = ex * T.weldK / h, vy = ey * T.weldK / h;
        const v = Math.hypot(vx, vy);
        if (v > T.weldV) { vx *= T.weldV / v; vy *= T.weldV / v; }
        b.vx = K.vx + vx; b.vy = K.vy + vy;
        b.av = clamp((sk.a - b.a) * 0.25 / h, -6, 6);
        b.held = 2; b.sl = false; b.slT = 0;
      }
    }
    /* The harpoon's barb: the first item part it enters is speared. */
    function spearTest() {
      const T = K.T, tx = K.x, ty = K.y + T.tip * K.s, rb = T.barb * K.s + (cfg.prongs === 3 ? 3 : 0) + (cfg.width - 1) * 6;
      let best = null, bd = Infinity;
      for (const b of W.bodies) {
        if (b.type !== 'dynamic') continue;
        const bx = b.box;
        if (tx < bx.x0 - rb || tx > bx.x1 + rb || ty < bx.y0 - rb || ty > bx.y1 + rb) continue;
        for (let i = 0; i < b.parts.length; i++) {
          const d = Math.hypot(b.px[i] - tx, b.py[i] - ty) - b.parts[i].r;
          if (d < rb && d < bd) { bd = d; best = b; }
        }
      }
      if (best) K.spear = best;
    }
    /* The electromagnet crane's field: metal in range leaps toward the face. */
    function field(h) {
      const T = K.T, s = K.s;
      const R0 = T.fieldR * (0.8 + 0.2 * cfg.width) * (cfg.prongs === 3 ? 1.25 : 1);
      const F0 = T.fieldF * (0.6 + 0.8 * K.grip) * (cfg.magnet ? 1.4 : 1);
      const fx = K.x, fy = K.y + T.hubR * s * 0.6;
      for (const b of W.bodies) {
        if (b.type !== 'dynamic' || !isMetal(b) || isStuck(b)) continue;
        const dx = fx - b.x, dy = fy - b.y, d = Math.hypot(dx, dy);
        if (d > R0 || d < 1) continue;
        const f = F0 * h / Math.max(1, d / 40);
        wake(b); b.vx += dx / d * f; b.vy += dy / d * f;
      }
    }
    /* Metal touching the magnet's face sticks; while energising, metal
       touching stuck metal sticks too (it is magnetised). */
    function magnetStick(chain) {
      const hr = K.T.hubR * K.s;
      for (const b of W.bodies) {
        if (b.type !== 'dynamic' || !isMetal(b) || isStuck(b)) continue;
        for (let i = 0; i < b.parts.length; i++) {
          if (Math.hypot(b.px[i] - K.x, b.py[i] - K.y) < hr + b.parts[i].r + 3) { stick(b); break; }
        }
      }
      if (!chain || !K.stuck.length) return;
      const n0 = K.stuck.length;
      for (const b of W.bodies) {
        if (b.type !== 'dynamic' || !isMetal(b) || isStuck(b)) continue;
        let hit = false;
        for (let k = 0; k < n0 && !hit; k++) {
          const o2 = K.stuck[k].b;
          if (Math.hypot(o2.x - b.x, o2.y - b.y) > o2.br + b.br + 2) continue;
          for (let i = 0; i < b.parts.length && !hit; i++) {
            for (let j = 0; j < o2.parts.length; j++) {
              if (Math.hypot(b.px[i] - o2.px[j], b.py[i] - o2.py[j]) < b.parts[i].r + o2.parts[j].r + 2) { hit = true; break; }
            }
          }
        }
        if (hit) stick(b);
      }
    }
    /* At the top of the lift a welded load heavier than the claw can bear
       may tear off (seeded rand; grip raises what it can bear). */
    function tearHeavy() {
      const T = K.T;
      const cap = T.weld === 'metal' ? 14 + 40 * K.grip : T.weld === 'spear' ? 10 + 36 * K.grip : T.weld === 'suck' ? 8 + 30 * K.grip : 18 + 50 * K.grip;
      for (let i = K.stuck.length - 1; i >= 0; i--) {
        const b = K.stuck[i].b;
        const p = clamp((b.m - cap) / (cap * 1.5), 0, 0.75);
        if (p > 0 && rand() < p) { unstick(i, true); b.passClaw = RIG.passT; emit('slip'); }
      }
    }
    /* Let every body still touching the claw fall through it. */
    function shedRiders() {
      let n = 0;
      for (const b of W.bodies) {
        if (b.type !== 'dynamic' || !(b.held > 0)) continue;
        if (K.stuck.length && isStuck(b)) continue;
        b.passClaw = RIG.passT; b.held = 0; wake(b);
        if (b.vy < 40) b.vy = 40;
        n++;
      }
      if (n) emit('slip');
      return n;
    }
    /* The electromagnet: metal within magnetR of the hub drifts in while the
       claw drops and closes. */
    function magnet(h) {
      if (!cfg.magnet || K.T.weld === 'metal' || (K.st !== 'drop' && K.st !== 'close')) return;
      const s = K.s, hx = K.x, hy = K.y + (K.T.weld === 'spear' ? K.T.tip * s : RIG.hingeY * s);
      for (const b of W.bodies) {
        if (b.type !== 'dynamic' || !b.data || !b.data.tags || b.data.tags.indexOf('metal') < 0) continue;
        const dx = hx - b.x, dy = hy - b.y, d = Math.hypot(dx, dy);
        if (d > RIG.magnetR || d < K.T.hubR * s + b.br - 2) continue;
        const f = RIG.magnetF * h / Math.max(1, d / 40);
        if (b.sl && f < 2) continue;
        wake(b); b.vx += dx / d * f; b.vy += dy / d * f;
      }
    }
    /* Move the claw by this substep's velocities (post hook) and watch the cargo. */
    function move(h) {
      const T = K.T;
      K.x += K.vx * h; K.y += K.vy * h;
      K.pL = clamp(K.pL + K.wL * h, T.closed - 0.02, T.open);
      K.pR = clamp(K.pR + K.wR * h, T.closed - 0.02, T.open);
      // CR8: the twin heads slide along the bar and reel their cables; the vacuum's hose carries its catch
      if (T.twin) for (let i = 0; i < 2; i++) { K.tw.x[i] += K.tw.vx[i] * h; K.tw.d[i] = Math.max(0, K.tw.d[i] + K.tw.vd[i] * h); }
      if (T.weld === 'suck') { K.vt += h; if (K.tube.length) tubeStep(h); }
      // purely visual cable sway
      K.swayV += (-K.sway * 40 - K.swayV * 3 - K.vx * 0.02) * h; K.sway += K.swayV * h;
      // cargo that slipped out of the prongs on the way
      if (K.st === 'lift' || K.st === 'carry') {
        const y0 = hubY();
        for (let i = K.cargo.length - 1; i >= 0; i--) {
          const b = K.cargo[i];
          if (b.world !== W) { K.cargo.splice(i, 1); continue; }
          if ((T.weld && isStuck(b)) || b.tube) continue;
          if (b.y > y0 + RIG.slipY * K.s && b.vy > RIG.slipV && b.x < binX) { K.cargo.splice(i, 1); emit('slip'); }
        }
      }
      mirror();
    }
    // ---- CR8: the twin heads' plan and the vacuum's suction, tube and blow
    /* Every substep before the state machine: a twin head slides home while
       the claw is idle or on its way back, reels in and bunches up over the
       chute as it lifts and carries (so both prizes fall into the chute). */
    function cr8TwinPlan(h) {
      const tw = K.tw, T = K.T, s = K.s;
      tw.vx[0] = tw.vx[1] = 0; tw.vd[0] = tw.vd[1] = 0;
      const sep = T.twin.sep * s, gap = T.twin.gap * s;
      if (K.st === 'idle' || K.st === 'return') twinSlide(h, -sep, sep);
      else if (K.st === 'carry' || K.st === 'open') {
        // closed heads fit closer together: both prizes over the chute (gently, not to knock them out)
        twinSlide(h, -gap * 0.3, gap * 0.3);
        for (let i = 0; i < 2; i++) tw.vx[i] = clamp(tw.vx[i], -120, 120);
      }
      if (K.st === 'lift' || K.st === 'carry' || K.st === 'open' || K.st === 'return' || K.st === 'idle') {
        const v = RIG.liftSpeed * T.lift * 1.4;
        for (let i = 0; i < 2; i++) tw.vd[i] = -Math.min(tw.d[i] / h, v);
      }
    }
    /* The vacuum stops a hair over the pile (never on it): true when a prize
       lies within 7 px under the nozzle's rim. */
    function vacNear() {
      const s = K.s, hr = K.T.hubR * s, bot = K.y + hr;
      for (const b of W.bodies) {
        if (b.type !== 'dynamic' || b.tube || b.x >= binX + 8) continue;
        if (b.box.x1 < K.x - hr || b.box.x0 > K.x + hr || b.box.y1 < bot || b.box.y0 > bot + 7) continue;
        for (let i = 0; i < b.parts.length; i++) {
          const r = b.parts[i].r;
          if (Math.abs(b.px[i] - K.x) < hr * 0.8 + r && b.py[i] - r < bot + 7 && b.py[i] > bot - r * 0.5) return true;
        }
      }
      return false;
    }
    /* How many prizes the canister holds: a Wider Palm and the Third Prong
       (a second intake) each add one. */
    function vacCap() { const T = K.T; return (T.cap || 3) + (cfg.width >= 1.3 ? 1 : 0) + (cfg.prongs === 3 ? 1 : 0); }
    const hasTag = (b, t) => !!(b && b.data && b.data.tags && b.data.tags.indexOf(t) >= 0);
    /* The suction (per substep, after the plan): light things in range are
       pulled at the mouth (weaker the heavier they are); at the mouth a
       prize that fits the bore flies up the wand, a big one plugs the
       nozzle (only while it sucks at full power: while dropping it just
       tugs). K.field is the suction's strength for the renderer. */
    function suck(h) {
      const T = K.T, s = K.s;
      const full = K.tube.length >= vacCap();
      const on = K.clog || full ? 0 : (K.st === 'close' || (K.st === 'lift' && K.t < 0.35)) ? 1 : K.st === 'drop' ? 0.45 : 0;
      K.field += (on - K.field) * Math.min(1, h * 14);
      if (on <= 0) return;
      const mx = K.x, my = K.y + T.hubR * s * 0.55, mr = T.hubR * s * 0.8;
      const R0 = T.suckR * (0.8 + 0.2 * cfg.width) * (cfg.prongs === 3 ? 1.25 : 1);
      const F0 = T.suckF * (0.6 + 0.8 * K.grip) * on;
      const bore = T.bore * s, mMax = T.suckM * (0.6 + 0.8 * K.grip) * cfg.width;
      for (const b of W.bodies) {
        if (b.type !== 'dynamic' || b.tube || isStuck(b) || b.x >= binX + 8) continue;
        const dx = mx - b.x, dy = my - b.y, d = Math.hypot(dx, dy);
        if (d > R0 + b.br) continue;
        let at = false, deep = false;
        for (let i = 0; i < b.parts.length; i++) {
          const q = Math.hypot(b.px[i] - mx, b.py[i] - my) - mr - b.parts[i].r;
          if (q < 2) at = true;
          if (q < -3) deep = true;
        }
        const heavy = hasTag(b, 'heavy');
        if (at) {
          if (b.br <= bore && !heavy && b.m <= mMax) {
            intoTube(b);
            if (K.tube.length >= vacCap()) { emit('full'); return; }
            continue;
          }
          // a big thing the suction really lifted (or rammed into the mouth) plugs it
          if (b.br > bore && on >= 1 && (b.vy < -30 || deep)) { clogWith(b); return; }
        }
        if (d < 1) continue;
        // heavy things resist; big ones hardly catch the airflow (only light big things jam it)
        const k = clamp(3.5 / b.m, 0.12, 1.5) * (heavy ? 0.3 : 1) * (b.br > bore ? 0.35 : 1);
        const f = F0 * k * h / Math.max(1, d / 30);
        wake(b); b.vx += dx / d * f; b.vy += dy / d * f;
      }
    }
    /* A prize flies up the hose: it stops colliding (b.tube) and the rig
       moves it from here on (tubeStep), up the wand into a canister slot. */
    function intoTube(b) {
      K.tube.push({ b, st: 'up', u: 0, rx: b.x - K.x, ry: b.y - K.y, k: K.tube.length });
      b.tube = 1; b.tubeK = 1; b.held = 2; b.passClaw = 0; b.sl = false; b.slT = 0; b.vx = 0; b.vy = 0;
      if (K.st === 'lift' || K.st === 'carry') K.cargo.push(b);
      emit('suck');
    }
    /* A big thing plugs the nozzle: welded to the mouth, and the suction
       stops until it is let go (at the chute, or when it tears off). */
    function clogWith(b) {
      if (K.clog) return;
      K.clog = b;
      stick(b);
      if (K.st === 'lift' || K.st === 'carry') K.cargo.push(b);
      emit('clog');
    }
    /* The canister's slot for the k-th prize of n, swirling (a cyclone). */
    const SLOT = { x: 0, y: 0 };
    function tubeSlot(k, n) {
      const T = K.T, s = K.s, cr = T.can * s, cy = K.y - T.wand * s - cr * 0.72;
      const a = K.vt * 5 + k * Math.PI * 2 / Math.max(1, n), rr = n > 1 ? cr * 0.4 : 0;
      SLOT.x = K.x + Math.cos(a) * rr; SLOT.y = cy + Math.sin(a) * rr * 0.55 + cr * 0.08;
      return SLOT;
    }
    /* Move what rides the hose (post hook, after the nozzle moved): from
       where it was caught to the mouth (never downward), up the wand, into
       its slot; it shrinks as it goes (b.tubeK, drawing only). Its
       velocity is the path's, so the game reads a smooth flight. */
    function tubeStep(h) {
      const T = K.T, s = K.s, n = K.tube.length;
      const mouthY = K.y + T.hubR * s * 0.55, topY = K.y - T.wand * s;
      for (let i = n - 1; i >= 0; i--) {
        const e = K.tube[i], b = e.b;
        if (b.world !== W) { K.tube.splice(i, 1); continue; }
        let x, y;
        if (e.st === 'up') {
          e.u = Math.min(1, e.u + h * 5.5);
          const u = e.u, y1 = Math.min(K.y + e.ry, mouthY);
          if (u < 0.3) { const q = u / 0.3; x = K.x + e.rx * (1 - q); y = K.y + e.ry + (y1 - K.y - e.ry) * q; }
          else if (u < 0.75) { const q = (u - 0.3) / 0.45; x = K.x; y = y1 + (topY - y1) * q; }
          else { const q = (u - 0.75) / 0.25, p = tubeSlot(e.k, Math.max(n, 1)); x = K.x + (p.x - K.x) * q; y = topY + (p.y - topY) * q; }
          b.tubeK = 1 - 0.4 * Math.min(1, u / 0.75);
          b.av = 14;
          if (u >= 1) e.st = 'in';
        } else {
          const p = tubeSlot(e.k, n);
          x = p.x; y = p.y; b.av = 5; b.tubeK = 0.6;
        }
        b.vx = (x - b.x) / h; b.vy = (y - b.y) / h;
        b.x = x; b.y = y; b.a += b.av * h;
        b.held = 2;
      }
      for (let i = 0; i < K.tube.length; i++) K.tube[i].k = i;
    }
    /* Over the chute: the canister blows its prizes out of the mouth, one
       every 0.07 s (the first with a 'blow'); they fall into the chute. */
    function cr8Blow() {
      if (!K.tube.length) return;
      if (K.t < K.blowN * 0.07) return;
      const e = K.tube.shift(), b = e.b, T = K.T;
      if (!K.blowN) emit('blow');
      K.blowN++;
      tubeOut(b, K.x + ((K.blowN % 2) ? -3 : 3), K.y + T.hubR * K.s * 0.55 + b.br * 0.6, 160);
    }
    /* Let a prize out of the hose at (x, y), falling at vy, colliding again. */
    function tubeOut(b, x, y, vy) {
      b.tube = 0; b.tubeK = 1; b.held = 0; b.passClaw = RIG.passT; b.sl = false; b.slT = 0;
      b.x = x; b.y = y; b.vx = 0; b.vy = vy; b.av = 0;
      sync(b); wake(b);
      const c = K.cargo.indexOf(b); if (c >= 0) K.cargo.splice(c, 1);
    }
    /* Everything in the hose drops out where it is (a rebuild, a type switch). */
    function ejectTube() {
      for (const e of K.tube) if (e.b.world === W) tubeOut(e.b, e.b.x, e.b.y, 0);
      K.tube.length = 0; K.blowN = 0;
    }
    // ---- public
    function setTarget(x) {
      if (K.st !== 'idle' || R.auto) return false;
      K.tx = clampX(x); R.targetX = K.tx;
      return true;
    }
    function drop() {
      if (K.st !== 'idle') return false;
      K.pending = true;
      return true;
    }
    /* An AI driver (the Prize Master) takes the claw: aim at x, optionally
       drop on arrival, carriage speed x o.speed. The player's setTarget is
       ignored until the claw is home again or cancelAuto(). */
    function autoSteer(x, o) {
      if (K.st !== 'idle') return false;
      o = o || {};
      K.tx = clampX(x); R.targetX = K.tx;
      R.auto = { x: K.tx, drop: !!o.drop, speed: o.speed > 0 ? o.speed : 1 };
      if (o.drop) K.pending = true;
      return true;
    }
    function cancelAuto() { R.auto = null; }
    /* The x over the topmost body matching pred (default: any item in the bin). */
    function aimAt(pred) {
      let best = null;
      for (const b of W.bodies) {
        if (b.type !== 'dynamic' || b.x >= binX) continue;
        if (pred ? !pred(b) : b.group !== 'item') continue;
        if (!best || b.box.y0 < best.box.y0) best = b;
      }
      return best ? clampX(best.x) : null;
    }
    /* Drive events out; the world's substeps do the moving. */
    function update() {
      const ev = R.events; R.events = [];
      mirror();
      return ev;
    }
    function busy() { return K.st === 'drop' || K.st === 'close' || K.st === 'lift' || K.st === 'carry' || K.st === 'open'; }
    /* Bodies the claw is touching right now (only meaningful while busy). */
    function held() { return busy() ? W.bodies.filter(b => b.type === 'dynamic' && b.held > 0) : []; }
    /* The cargo: what was held above the hub when the lift started and has not slipped. */
    function locked() { return K.st === 'lift' || K.st === 'carry' ? K.cargo.slice() : []; }
    function cradle(b) { return b ? K.cargo.indexOf(b) >= 0 : K.cargo.slice(); }
    /* Force the prongs open: a busy claw goes straight to 'releasing' and then returns. */
    function open() {
      unstickAll();
      if (K.st === 'idle' || K.st === 'return') { K.pL = K.pR = K.T.open; ejectTube(); return; }
      K.st = 'open'; K.t = 0; K.cargo = []; K.pending = false; K.jolt = 0; K.blowN = 0;
      mirror();
    }
    function setConfig(c) {
      c = c || {};
      if (c.type != null && CLAW_TYPES[c.type] && c.type !== cfg.type) {
        unstickAll(); ejectTube(); cfg.type = c.type;
        K.pL = K.pR = typeOf(c.type).open;
        // CR8: a new type parks at its own height with its heads home
        K.tw.x[0] = K.tw.x[1] = K.tw.d[0] = K.tw.d[1] = 0; K.clog = null;
        if (K.st === 'idle') K.y = RAIL + parkOf(typeOf(c.type));
      }
      if (c.width != null) cfg.width = c.width;
      if (c.prongs != null) cfg.prongs = c.prongs === 3 ? 3 : 2;
      if (c.rubber != null) cfg.rubber = c.rubber ? 1 : 0;
      if (c.grip != null) cfg.grip = c.grip;
      if (c.speed != null) cfg.speed = c.speed;
      if (c.magnet != null) cfg.magnet = c.magnet ? 1 : 0;
      if (c.grease != null) cfg.grease = c.grease ? 1 : 0;
      refresh();
      if (K.T.twin && K.st === 'idle' && !K.tw.x[0] && !K.tw.x[1]) { K.tw.x[0] = -K.T.twin.sep * K.s; K.tw.x[1] = K.T.twin.sep * K.s; }
      mirror();
    }
    function destroy() {
      unstickAll(); ejectTube();
      W.removeHook(plan); W.removePost(move);
      W.csegs.length = 0; W.ctl = null; W.busy = false;
      for (const b of W.bodies) b.held = 0;
    }
    function calm() { return K.st === 'idle' && !K.moving && Math.abs(K.x - K.tx) < 1; }

    refresh();
    if (K.T.twin) { K.tw.x[0] = -K.T.twin.sep * K.s; K.tw.x[1] = K.T.twin.sep * K.s; refresh(); }   // CR8: the heads start home
    K.tx = clampX(homeX); K.x = K.tx;
    W.addHook(plan); W.addPost(move);
    buildSegs(); mirror();
    return R;
  }

  // ---- ROS (round 10, DESIGN.md "Ms. Bubbles, the mutator pack and three pets")
  /* A soap bubble's lift, for a world pre-hook (every substep h): drives b
     toward (tx, ty) as a damped spring in zero g (gravity is cancelled for the
     substep before the step integrates it), speed capped. o: {k, c, vmax}. */
  function rosFloat(b, tx, ty, h, g, o) {
    if (!b || !(h > 0) || b.type !== 'dynamic') return;
    const k = (o && o.k) || 26, c = (o && o.c) || 9, vmax = (o && o.vmax) || 320;
    b.vx += ((tx - b.x) * k - b.vx * c) * h;
    b.vy += ((ty - b.y) * k - b.vy * c) * h - (g || 0) * (b.gs == null ? 1 : b.gs) * h;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > vmax) { b.vx *= vmax / sp; b.vy *= vmax / sp; }
    b.av *= 1 - Math.min(1, 3 * h);
    b.sl = false; b.slT = 0;
  }
  /* Moon Bounce: a body's restitution floor and a low bounce threshold. */
  function rosBounce(b, e) {
    if (!b || !(e > 0)) return b;
    b.restitution = Math.max(b.restitution, Math.min(0.95, e));
    b.bounceV = Math.min(b.bounceV || PH.bounceV, 28);
    return b;
  }
  /* Rising Water: a pre hook on W. Under the waterline y (for x < xMax, the
     bin, not the chute) a body gets buoyancy by its density (rho / density of
     gravity, times how deep it sits: lighter than water floats, heavier sinks
     slowly) and water drag. Returns {y, xMax, rho, drag, on, set(y), remove()}. */
  function rosFlood(W, o) {
    o = o || {};
    const S = { y: o.y == null ? 1e9 : o.y, xMax: o.xMax == null ? 1e9 : o.xMax, rho: o.rho || 1, drag: o.drag || 2.2, g: o.g || 1150, on: true, t: 0 };
    S.hook = (h) => {
      if (!S.on || !(h > 0)) return;
      S.t += h;
      for (const b of W.bodies) {
        if (b.type !== 'dynamic' || b.tube || b.x > S.xMax) continue;
        const r = b.br || 10, wy = S.y + Math.sin(S.t * 2.2 + b.x * 0.035) * 2.5;
        const frac = (b.y + r - wy) / (2 * r);
        if (frac <= 0) continue;
        const f = Math.min(1, frac), dens = Math.max(0.2, b.density || 1);
        if (b.sl && dens < S.rho) { b.sl = false; b.slT = 0; }
        if (b.sl) continue;
        b.vy -= S.g * (S.rho / dens) * f * h;
        const dk = Math.exp(-S.drag * f * h);
        b.vx *= dk; b.vy *= dk; b.av *= dk;
      }
    };
    S.set = (y) => { S.y = y; for (const b of W.bodies) if (b.type === 'dynamic' && b.sl && b.y + (b.br || 10) > y && (b.density || 1) < S.rho) { b.sl = false; b.slT = 0; } };
    S.remove = () => { S.on = false; W.removeHook(S.hook); };
    W.addHook(S.hook);
    return S;
  }

  // ---- stuck prize safety net (round 23) ---------------------------------
  /* Call once per frame after W.step(dt).  Two jobs, neither touches a body
     that is behaving:
       1. a body that left the glass (or is not a number) goes back in over
          the bin, still;
       2. an awake body with nothing under it, nearly still, that has not
          moved for o.after seconds (default 3) is nudged down and toward the
          bin; if that does not free it, it is set back in over the bin.
     o.skip(b) -> true exempts a body a game mode holds in the air on purpose.
     Returns the bodies it moved.  Pure state, so it is deterministic. */
  const strandSup = new Set();
  function strandWatch(W, dt, o) {
    const out = [];
    o = o || {};
    if (!W || !(dt > 0) || !(W.gravity.y > 0)) return out;
    const cb = W.clampBox, after = o.after == null ? 3 : o.after;
    const wallR = cb.xMax + 5, binR = Math.min(cb.chuteX, wallR) - 10, dropY = o.dropY == null ? 30 : o.dropY;
    strandSup.clear();
    for (const c of W.contacts) { if (c.ny > 0.25) strandSup.add(c.a); if (c.b && c.ny < -0.25) strandSup.add(c.b); }
    for (const b of W.bodies) {
      if (b.type !== 'dynamic') continue;
      const nan = !(Number.isFinite(b.x) && Number.isFinite(b.y));
      if (nan || b.x < -2 || b.x > wallR + 2 || b.y < cb.yMin - 30 || b.y > cb.trayY + 30) { strandBack(b, cb, binR, dropY, nan); out.push(b); continue; }
      if (b.sl || strandSup.has(b)) { b.stT = 0; b.stN = 0; continue; }   // settled: forgiven
      if (b.tube || b.held > 0 || Math.hypot(b.vx, b.vy) > 14 || (o.skip && o.skip(b))) { b.stT = 0; continue; }
      if (b.stT == null || Math.hypot(b.x - b.stX, b.y - b.stY) > 3) { b.stX = b.x; b.stY = b.y; b.stT = 0; continue; }
      b.stT += dt;
      if (b.stT < after) continue;
      b.stT = 0;
      if (b.stN > 0) { b.stN = 0; strandBack(b, cb, binR, dropY, false); }
      else { b.stN = 1; wake(b); b.vy = Math.max(b.vy, 80); b.vx += (b.x < binR * 0.5 ? 1 : -1) * 60; b.av += 1.5; }
      out.push(b);
    }
    return out;
  }
  function strandBack(b, cb, binR, dropY, nan) {
    const x = nan ? binR * 0.5 : b.x;
    b.x = clamp(x, cb.xMin + b.br, Math.max(cb.xMin + b.br, binR - b.br));
    b.y = dropY; b.vx = b.vy = b.av = 0; b.stT = 0; b.stN = 0; b.passClaw = 0; b.held = 0;
    if (nan) b.a = 0;
    wake(b); sync(b);
  }

  return { box, body, world, cabinet, clawRig, setPose, sync, partSpec, RIG, PH, SHAPE, PRONG, PHI_OPEN, PHI_CLOSED, H,
    strandWatch,
    MATERIALS, materialOf, applyMaterial, scaleShape, blast, hop, CLAW_TYPES, clawPose,
    rosFloat, rosBounce, rosFlood };   // ROS (round 10)
})();
