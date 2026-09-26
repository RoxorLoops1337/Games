// Clawspire -- INTRO. A 10 second cinematic drawn entirely with the game's own
// art (RENDER.item / enemy / claw / cabinet / hex ...), on the game canvas.
//
// Everything is a pure function of time: INTRO.draw(ctx, t, w, h) paints the
// frame at t seconds, so the same t always gives the same picture and a video
// can be captured frame by frame. Anything that needs simulation (the real
// physics scatter, the world map, particle seeds) is computed once in
// INTRO.prepare() and cached, never advanced per frame.
//
// Shot list (seconds):
//   0.0-1.0  the drop      black, one bulb flickers, the marquee chases on,
//                          the claw slams in from above with streaks and shake
//   1.0-3.0  the scatter   a real PHYS pile bursts in slow motion, the claw
//                          closes on a shield and a sword and rises at speed
//   3.0-5.5  the fight     arena montage: lunge, sword hit "12", status stamps,
//                          the goblin freezes, pink / cyan flashes, whip cuts
//   5.5-7.5  the climb     the world map, camera racing up the road to the boss
//   7.5-10   the name      CLAWSPIRE slams in letter by letter, the claw opens
//                          behind it, the tagline types, TAP TO PLAY pulses
//
// Headless (no ctx / no requestAnimationFrame) play() is a no-op that calls
// onDone at once, and draw() survives the test loader's no-op context.
const INTRO = (() => {
  const W = 540, H = 960, DUR = 10, FPS = 60;
  const TAU = Math.PI * 2;
  const PINK = '#ff2e88', CYAN = '#2ee6d6', GOLD = '#ffc94d', LIME = '#a6ff5e', BLOOD = '#ff5a4a', INK = '#12091f', CHROME = '#c9d3e0';
  const FONT = 'system-ui, "Segoe UI", Helvetica, Arial, sans-serif';
  // The cabinet as the fight screen places it (game.js CAB).
  const CAB = { x: 30, y: 410, w: 480, h: 390, chuteW: 64, frame: 30, dividerH: 0.45, wallThick: 40, slopeW: 110, slopeH: 55 };
  const GRAVITY = 1150;
  const SUB = 1 / 240;                 // the physics substep, also the scatter's recording rate
  const SHOTS = [
    { id: 'drop', t0: 0, t1: 1.0 }, { id: 'scatter', t0: 1.0, t1: 3.0 }, { id: 'fight', t0: 3.0, t1: 5.5 },
    { id: 'climb', t0: 5.5, t1: 7.5 }, { id: 'name', t0: 7.5, t1: 10 },
  ];
  // Fight montage cuts (hard whips between them).
  const CUTS = [3.0, 3.6, 4.2, 4.85, 5.5];
  const LETTERS = 'CLAWSPIRE'.split('');
  const LETTER_T0 = 7.55, LETTER_GAP = 0.08;
  const TAGLINE = 'Every fight is a grab.';
  const TAG_T0 = 8.65, TAG_RATE = 0.034;
  const MAP_SEED = 48;

  // Modules are read lazily: the file loads before or after its siblings and
  // stays harmless without them.
  const X = {
    get R() { return typeof RENDER !== 'undefined' ? RENDER : null; },
    get P() { return typeof PHYS !== 'undefined' ? PHYS : null; },
    get D() { return typeof DATA !== 'undefined' ? DATA : null; },
    get M() { return typeof MAP !== 'undefined' ? MAP : null; },
    get A() { return typeof AUDIO !== 'undefined' ? AUDIO : null; },
  };
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  // 0..1 progress of t through [a, b], clamped.
  const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const outCubic = (k) => 1 - Math.pow(1 - k, 3);
  const inCubic = (k) => k * k * k;
  const outBack = (k) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
  const inOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const rgba = (col, a) => {
    const R = X.R;
    if (R && R.rgba) return R.rgba(col, a);
    return col;
  };
  // Decaying shake amplitude for an impact at t0 (0 before it).
  const impact = (t, t0, amp, decay) => (t < t0 ? 0 : amp * Math.exp(-(t - t0) * (decay || 9)));
  // Deterministic 2D jitter from t: two incommensurate sines, like RENDER.fx.
  const jx = (t) => Math.sin(t * 63.1) * 0.7 + Math.sin(t * 29.7) * 0.3;
  const jy = (t) => Math.cos(t * 47.3) * 0.7 + Math.cos(t * 23.9) * 0.3;

  /* ------------------------------------------------------------ prepare */
  let P = null;

  // The items of the scatter pile: a knight's bin plus a handful of marbles.
  const PILE_IDS = ['rusty_sword', 'dented_shield', 'spiked_buckler', 'iron_chain', 'heater_shield', 'longsword', 'tower_shield',
    'crisp_apple', 'torch', 'femur', 'rattle_mallet', 'pot_lid', 'lucky_coin', 'cherry_bomb', 'stale_bread', 'war_hammer',
    'prize_marble', 'prize_marble', 'prize_marble', 'glass_bead', 'glass_bead', 'glass_bead', 'peppermint', 'lead_shot'];
  const HERO_IDS = ['dented_shield', 'rusty_sword'];

  function itemDef(id) {
    const D = X.D, tbl = D && D.ITEMS;
    if (tbl && tbl[id]) return tbl[id];
    return { id, name: id, tags: [], shape: { kind: 'circle', r: 14 }, color: '#8e98a8', color2: '#5a6373', art: 'rock', density: 1, friction: 0.5 };
  }
  function shapeFor(def) {
    const sh = def.shape || { kind: 'circle', r: 14 };
    if (sh.kind === 'circle') return { kind: 'circle', r: sh.r };
    if (sh.kind === 'box') return { kind: 'box', w: sh.w, h: sh.h };
    if (sh.verts) return { kind: 'poly', verts: sh.verts };
    return { kind: 'circle', r: 14 };
  }

  /* The scatter: a real pile in a real cabinet, a claw drop with a strong
     grip, and an outward burst applied to the pile on the touch. Recorded
     per substep (240 Hz) so the slow-motion frames stay smooth. */
  function simScatter() {
    const Ph = X.P;
    const out = { frames: [], events: {}, items: [], ok: false };
    if (!Ph || !Ph.world || !Ph.cabinet || !Ph.clawRig || !Ph.body) return out;
    const rng = U.rng(0xC1A0);
    const Wd = Ph.world({ gravity: { x: 0, y: GRAVITY }, w: CAB.w, h: CAB.h });
    const C = Ph.cabinet(Wd, { w: CAB.w, h: CAB.h, chuteW: CAB.chuteW, dividerH: CAB.dividerH, wallThick: CAB.wallThick, slopeW: CAB.slopeW, slopeH: CAB.slopeH });
    const binW = C.bounds.chuteX || (CAB.w - CAB.chuteW);
    const heroX = binW * 0.5;
    const rig = Ph.clawRig(Wd, { cabinet: C, homeX: heroX, chuteX: binW + CAB.chuteW * 0.5, railY: 26, prongs: 2, width: 1.15, grip: 2.6, speed: 1, rubber: 1, magnet: 0, rand: U.rng(7) });
    const bodies = [];
    const mk = (id, x, y, a) => {
      const def = itemDef(id);
      const b = Ph.body({ type: 'dynamic', shape: shapeFor(def), x, y, angle: a, density: def.density == null ? 1 : def.density,
        friction: def.friction == null ? 0.5 : def.friction, restitution: def.restitution == null ? 0.12 : def.restitution,
        group: 'item', data: { def, hero: false } });
      Wd.add(b); bodies.push(b);
      return b;
    };
    // The pile: everything but the heroes, showered across the bin.
    const ids = PILE_IDS.filter((id, i) => !(i < 2));
    // Five narrow columns around the drop point so the items heap into a mound.
    ids.forEach((id, i) => mk(id, heroX - 104 + (i % 5) * 52 + rng() * 10, 30 + Math.floor(i / 5) * 46 + rng() * 10, (rng() - 0.5) * 2));
    const step = (dt) => { const ev = rig.update(dt); Wd.step(dt); return ev; };
    for (let i = 0; i < 240 * 3; i++) step(SUB);
    // The heroes land last, on top, right under the parked claw.
    const shield = mk(HERO_IDS[0], heroX - 6, 120, 0.15); shield.data.hero = true;
    const sword = mk(HERO_IDS[1], heroX + 4, 80, 1.45); sword.data.hero = true;
    for (let i = 0; i < 240 * 2; i++) step(SUB);
    out.items = bodies.map((b) => ({ def: b.data.def, hero: b.data.hero }));
    // Record the grab.
    rig.setTarget(heroX);
    let t = 0;
    for (let i = 0; i < 240 && !rig.calm(); i++) { step(SUB); }
    if (!rig.drop()) return out;
    const snap = (phase) => {
      const B = rig.bodies;
      out.frames.push({
        t, phase, s: rig.geo ? rig.geo.s : 0.8, sway: rig.sway || 0,
        hub: { x: B.hub.x, y: B.hub.y, r: B.hub.r },
        prongs: B.prongs.map((pts) => pts.map((p) => ({ x: p.x, y: p.y }))),
        top: { x: rig.cableTop.x, y: rig.cableTop.y },
        items: bodies.map((b) => [b.x, b.y, b.a, b.vx, b.vy]),
      });
    };
    let burst = false, started = false, best = [];
    for (let i = 0; i < 240 * 8; i++) {
      const ev = step(SUB);
      t += SUB;
      for (const e of ev) {
        if (out.events[e] == null) out.events[e] = t;
        if (e === 'touch' && !burst) {
          burst = true;
          // The burst: everything but the heroes flies away from the palm.
          const hx = rig.bodies.hub.x, hy = rig.bodies.hub.y + 40;
          for (const b of bodies) {
            if (b.data.hero) continue;
            const dx = b.x - hx, dy = b.y - hy, d = Math.max(20, Math.hypot(dx, dy));
            const k = 780 / (1 + d / 90);
            b.sl = false; b.slT = 0;
            b.vx += (dx / d) * k * (0.8 + rng() * 0.5);
            b.vy += (dy / d) * k * 0.6 - 420 * (0.6 + rng() * 0.7);
            b.av += (rng() - 0.5) * 14;
          }
          if (Wd.wakeAll) Wd.wakeAll();
        }
      }
      snap(rig.phase);
      if (rig.phase === 'lifting' || rig.phase === 'carrying') {
        const l = rig.locked ? rig.locked() : [];
        if (l.length >= best.length) best = l.map((b) => bodies.indexOf(b));
      }
      if (rig.phase !== 'idle' && rig.phase !== 'moving') started = true;
      if (started && (rig.phase === 'releasing' || rig.phase === 'returning' || rig.phase === 'idle')) break;
    }
    out.locked = best;
    out.ok = out.frames.length > 10 && out.events.touch != null;
    return out;
  }

  /* Output time -> scatter sim time. Slow motion over the burst, then the
     close at speed, then the lift racing. Built as a piecewise-linear table. */
  function buildWarp(sc) {
    const touch = sc.events.touch != null ? sc.events.touch : 1.0;
    const lift = sc.events.lift != null ? sc.events.lift : touch + 0.5;
    const pre = 0.03;
    // [outT0, outT1, speed]
    const segs = [[1.0, 2.05, 0.32], [2.05, 2.35, 1.0], [2.35, 3.0, 3.4]];
    const keys = [];
    let simT = touch - pre;
    for (const [a, b, v] of segs) { keys.push({ a, b, s0: simT, v }); simT += (b - a) * v; }
    return { keys, touch, lift, end: simT };
  }
  function warpT(t) {
    const w = P.warp;
    for (const k of w.keys) if (t <= k.b) return k.s0 + (Math.max(t, k.a) - k.a) * k.v;
    const k = w.keys[w.keys.length - 1];
    return k.s0 + (k.b - k.a) * k.v;
  }
  function frameAt(simT) {
    const fr = P.scatter.frames;
    if (!fr.length) return null;
    const i = clamp(Math.round(simT / SUB) - 1, 0, fr.length - 1);
    return fr[i];
  }

  /* The world map for the climb: the road, per-tile paint and reveal times. */
  function prepMap() {
    const Mp = X.M, R = X.R;
    const out = { ok: false, tiles: [], road: [], roadLen: 0, hex: 46, orient: 'v' };
    if (!Mp || !Mp.generate || !Mp.toPixel) return out;
    let M;
    try { M = Mp.generate({ act: 1, rng: U.rng(MAP_SEED), cols: 16, rows: 22 }); } catch (e) { return out; }
    if (!M || !M.tiles) return out;
    const HEX = Mp.HEX || 46, orient = 'v';
    const bounds = Mp.bounds ? Mp.bounds(M, HEX, orient) : { ox: 0, oy: 0, w: 1600, h: 1400 };
    const worldOf = (q, r) => { const p = Mp.toPixel(q, r, HEX, orient); return { x: p.x + bounds.ox, y: p.y + bounds.oy }; };
    const biome = M.biome || (Mp.biomeOf ? Mp.biomeOf(1) : 'cellar');
    const dirs = Mp.DIRS || [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    // Coast edge mask, the way game.js mapPaint does it (edge i = corner i -> i+1).
    const o0 = Mp.toPixel(0, 0, 10, orient);
    const edgeOf = dirs.map(([dq, dr]) => {
      const a = Mp.toPixel(dq, dr, 10, orient), vx = a.x - o0.x, vy = a.y - o0.y;
      let best = 0, bd = -Infinity;
      for (let i = 0; i < 6; i++) { const m = (i + 0.5) * Math.PI / 3; const d = vx * Math.cos(m) + vy * Math.sin(m); if (d > bd) { bd = d; best = i; } }
      return best;
    });
    const road = (M.road || []).map(([q, r]) => worldOf(q, r));
    // Arc length along the road for the camera and for reveal timing.
    let len = 0;
    const cum = [0];
    for (let i = 1; i < road.length; i++) { len += Math.hypot(road[i].x - road[i - 1].x, road[i].y - road[i - 1].y); cum.push(len); }
    const rng = U.rng(MAP_SEED ^ 0x5151);
    for (const k in M.tiles) {
      const t = M.tiles[k];
      const w = worldOf(t.q, t.r);
      let mask = 0;
      if (t.coast) dirs.forEach(([dq, dr], i) => { const n = Mp.tileAt ? Mp.tileAt(M, t.q + dq, t.r + dr) : M.tiles[Mp.key(t.q + dq, t.r + dr)]; if (n && n.terrain && n.terrain !== 'land') mask |= 1 << edgeOf[i]; });
      const terr = t.terrain || 'land';
      const fill = R && R.terrainFill ? R.terrainFill(biome, terr, t.elev || 0) : '#8a8570';
      // Nearest road point: the reveal wave follows the camera up the road.
      let bi = 0, bd = Infinity;
      for (let i = 0; i < road.length; i++) { const d = Math.hypot(road[i].x - w.x, road[i].y - w.y); if (d < bd) { bd = d; bi = i; } }
      const near = bd < HEX * 3.4;
      const along = road.length > 1 ? cum[bi] / len : 0;
      const revealT = near ? 5.62 + along * 1.55 + bd / (HEX * 3.4) * 0.22 + rng() * 0.08 : Infinity;
      // A copy of the tile that the drawing mutates freely (revealed flips with t).
      const tile = { q: t.q, r: t.r, type: t.type, terrain: terr, elev: t.elev, coast: t.coast, known: t.known, road: t.road, revealed: !!t.road || t.type === 'boss' || t.type === 'start', visited: false };
      out.tiles.push({ tile, wx: w.x, wy: w.y, fill, mask, seed: U.hashStr(k), revealT, lit: tile.revealed, dist: bd });
    }
    out.tiles.sort((a, b) => a.wy - b.wy);
    out.road = road; out.cum = cum; out.roadLen = len; out.hex = HEX; out.orient = orient; out.biome = biome;
    out.boss = worldOf(M.boss.q, M.boss.r); out.start = worldOf(M.start.q, M.start.r);
    out.ok = road.length > 1;
    return out;
  }
  // Point on the road at arc length s.
  function roadAt(mp, s) {
    const rd = mp.road, cum = mp.cum;
    if (rd.length < 2) return { x: 0, y: 0 };
    s = clamp(s, 0, mp.roadLen);
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const k = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
    return { x: lerp(rd[i - 1].x, rd[i].x, k), y: lerp(rd[i - 1].y, rd[i].y, k) };
  }

  function prepare() {
    if (P) return P;
    const p = { ok: true };
    try { p.scatter = simScatter(); } catch (e) { p.scatter = { frames: [], events: {}, items: [], ok: false }; }
    p.warp = buildWarp(p.scatter);
    try { p.map = prepMap(); } catch (e) { p.map = { ok: false, tiles: [], road: [], cum: [0], roadLen: 0, hex: 46 }; }
    // Particle seeds: sparks at the slam, debris and glass glints, ink drops.
    const r = U.rng(0x5A7C);
    p.sparks = [];
    for (let i = 0; i < 46; i++) p.sparks.push({ a: -Math.PI / 2 + (r() - 0.5) * 2.6, v: 380 + r() * 620, life: 0.25 + r() * 0.45, w: 1.5 + r() * 2.5, col: i % 3 === 0 ? GOLD : i % 3 === 1 ? '#fff6c0' : PINK });
    p.dust = [];
    for (let i = 0; i < 24; i++) p.dust.push({ x: (r() - 0.5) * 300, v: 40 + r() * 120, r: 8 + r() * 22, ph: r() * 6 });
    p.stars = [];
    for (let i = 0; i < 70; i++) p.stars.push({ x: r() * W, y: r() * H * 0.7, s: 0.6 + r() * 1.6, ph: r() * 6 });
    p.rain = [];
    const keys = (X.R && X.R.ITEM_KEYS) || ['sword', 'shield', 'coin', 'gem', 'bomb', 'potion'];
    for (let i = 0; i < 26; i++) p.rain.push({ k: keys[Math.floor(r() * keys.length)], x: r(), sp: 0.05 + r() * 0.07, ph: r(), s: 0.4 + r() * 0.4, rot: r() * 6 });
    p.speedLines = [];
    for (let i = 0; i < 30; i++) p.speedLines.push({ y: r(), len: 60 + r() * 200, ph: r(), w: 1 + r() * 3 });
    p.glints = [];
    for (let i = 0; i < 16; i++) p.glints.push({ x: r() * CAB.w, y: r() * CAB.h, r: 6 + r() * 14, ph: r() });
    P = p;
    return P;
  }

  /* --------------------------------------------------------- utilities */
  function txt(ctx, s, x, y, size, col, weight, align, ol, olW) {
    ctx.font = (weight || 'bold') + ' ' + size + 'px ' + FONT;
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    if (ol) { ctx.strokeStyle = ol === true ? INK : ol; ctx.lineWidth = olW || Math.max(2, size * 0.16); ctx.strokeText(s, x, y); }
    ctx.fillStyle = col; ctx.fillText(s, x, y);
  }
  function rrect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  function glow(ctx, x, y, r, col, a) {
    const R = X.R;
    if (R && R.glowSprite) {
      const sp = R.glowSprite(col, r);
      if (sp) {
        ctx.save(); ctx.globalAlpha = a == null ? 1 : a; ctx.globalCompositeOperation = 'lighter';
        try { ctx.drawImage(sp, x - r - 1, y - r - 1, r * 2 + 2, r * 2 + 2); } catch (e) { /* stub */ }
        ctx.restore();
        return;
      }
    }
    ctx.save(); ctx.globalAlpha = (a == null ? 1 : a) * 0.35; ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.restore();
  }
  // Camera: push / zoom / rotate about the stage centre plus a deterministic shake.
  function camera(ctx, o) {
    const cx = o.cx == null ? W / 2 : o.cx, cy = o.cy == null ? H / 2 : o.cy;
    const z = o.zoom == null ? 1 : o.zoom;
    const sh = o.shake || 0;
    const t = o.t || 0;
    ctx.translate(W / 2 + (o.dx || 0) + jx(t) * sh, H / 2 + (o.dy || 0) + jy(t) * sh);
    if (o.rot) ctx.rotate(o.rot);
    ctx.scale(z, z);
    ctx.translate(-cx, -cy);
  }
  // Chromatic split: the hot layer drawn as a pink ghost to the left and a
  // cyan ghost to the right (through an offscreen silhouette), then normally.
  let OFF = null;
  function offscreen(ctx) {
    const cv = ctx.canvas;
    const cw = (cv && cv.width) || W, ch = (cv && cv.height) || H;
    if (!OFF) {
      try {
        if (typeof document === 'undefined' || !document || !document.createElement) return null;
        const c = document.createElement('canvas');
        const g = c.getContext && c.getContext('2d');
        if (!g) return null;
        OFF = { c, g };
      } catch (e) { OFF = null; return null; }
    }
    if (OFF.c.width !== cw || OFF.c.height !== ch) { OFF.c.width = cw; OFF.c.height = ch; }
    return OFF;
  }
  function split(ctx, fn, amt) {
    let m = null;
    try { m = ctx.getTransform ? ctx.getTransform() : null; } catch (e) { m = null; }
    const off = amt > 0 && m && m.a != null ? offscreen(ctx) : null;
    if (off) {
      const g = off.g, cw = off.c.width, ch = off.c.height;
      const cols = [[PINK, -amt], [CYAN, amt]];
      for (const [col, dx] of cols) {
        g.save();
        try {
          g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cw, ch);
          g.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
          fn(g);
          g.setTransform(1, 0, 0, 1, 0, 0);
          g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, cw, ch);
        } catch (e) { /* the ghost is optional */ }
        g.restore();
        ctx.save();
        try {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6;
          ctx.drawImage(off.c, dx * m.a, 0);
        } catch (e) { /* ignore */ }
        ctx.restore();
      }
    }
    fn(ctx);
  }
  // A synthetic rig for RENDER.claw: hub at (x, y), prongs at angle phi
  // (PHYS.PHI_OPEN .. PHYS.PHI_CLOSED), size s. Cabinet coordinates.
  function fakeRig(x, y, s, phi, topY, phase) {
    const Ph = X.P;
    const PR = (Ph && Ph.PRONG) || [[0, 0], [14, 28], [9, 48], [1, 57]];
    const hingeX = 7, hingeY = 7;
    const prong = (side) => {
      const hx = x + side * hingeX * s, hy = y + hingeY * s;
      const al = -side * phi, ca = Math.cos(al), sa = Math.sin(al);
      return PR.map(([lx, ly]) => { const px = side * lx * s, py = ly * s; return { x: hx + px * ca - py * sa, y: hy + px * sa + py * ca }; });
    };
    return { phase: phase || 'idle', geo: { s }, sway: 0, cableTop: { x, y: topY == null ? y - 200 : topY },
      bodies: { hub: { x, y, r: 13 * s }, prongs: [prong(-1), prong(1)], ghost: null }, cfg: { rubber: 0, magnet: 0, prongs: 2 } };
  }
  const PHI_OPEN = () => (X.P && X.P.PHI_OPEN != null ? X.P.PHI_OPEN : 0.62);
  const PHI_CLOSED = () => (X.P && X.P.PHI_CLOSED != null ? X.P.PHI_CLOSED : -0.1);

  /* ------------------------------------------------------- 0-1 the drop */
  function shotDrop(ctx, t) {
    ctx.fillStyle = '#05030a'; ctx.fillRect(0, 0, W, H);
    // Bulb rail across the top: one flickers, then the chase runs left to right.
    const n = 13, y = 92, x0 = 36, dx = (W - 72) / (n - 1);
    const chase = seg(t, 0.4, 0.7);
    const flick = t < 0.4 ? (Math.sin(t * 61) + Math.sin(t * 97) + Math.sin(t * 23) > 0.6 ? 1 : (t > 0.32 ? 0.6 : 0)) : 1;
    const shake = impact(t, 0.4, 5, 10);
    ctx.save();
    ctx.translate(jx(t) * shake, jy(t) * shake);
    if (t < 0.4 && flick > 0) {
      // the dying bulb throws a cone down the empty frame
      ctx.save(); ctx.globalAlpha = 0.09 * flick; ctx.fillStyle = GOLD;
      ctx.beginPath(); ctx.moveTo(x0 + 4 * dx - 16, y); ctx.lineTo(x0 + 4 * dx + 16, y); ctx.lineTo(x0 + 4 * dx + 240, H); ctx.lineTo(x0 + 4 * dx - 240, H); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    for (let i = 0; i < n; i++) {
      const bx = x0 + i * dx;
      const on = i === 4 ? flick : (chase > 0 && i / (n - 1) <= chase ? 1 : 0);
      ctx.beginPath(); ctx.arc(bx, y, 6, 0, TAU);
      ctx.fillStyle = on ? '#fff6c0' : '#2a1d40'; ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
      if (on) glow(ctx, bx, y, 26, GOLD, 0.8 * on);
    }
    // The rail itself, lit by the bulbs.
    ctx.beginPath(); rrect(ctx, 20, y - 14, W - 40, 28, 8);
    ctx.strokeStyle = rgba(PINK, 0.25 + chase * 0.5); ctx.lineWidth = 3; ctx.stroke();
    if (chase >= 1) {
      // a neon wash climbs the frame once the rail is lit
      const k = seg(t, 0.7, 1.0);
      ctx.fillStyle = rgba(PINK, 0.08 * k); ctx.fillRect(0, y, W, H - y);
    }
    // The claw slam: from above the frame (t 0.62) to the pile line (t 1.0).
    if (t > 0.6) {
      const k = seg(t, 0.62, 1.0), e = inCubic(k);
      const cy = lerp(-320, 620, e);
      const s = 4.2;
      const rig = fakeRig(W / 2, cy, s, PHI_OPEN() * 0.9, cy - 700, 'dropping');
      // motion streaks
      const spd = k > 0.05 ? e * 1.0 : 0;
      if (spd > 0.05) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 12; i++) {
          const lx = W / 2 + (i - 5.5) * 34 + Math.sin(i * 7) * 9, ly = cy - 40 - i * 13;
          ctx.strokeStyle = rgba(i % 2 ? CYAN : '#ffffff', 0.35 * spd); ctx.lineWidth = 2 + (i % 3);
          ctx.beginPath(); ctx.moveTo(lx, ly - 260 * spd); ctx.lineTo(lx, ly); ctx.stroke();
        }
        ctx.restore();
        // ghost trail of the claw itself
        const R = X.R;
        for (let g = 3; g >= 1; g--) {
          const gy = cy - g * 46 * spd;
          const gr = fakeRig(W / 2, gy, s, PHI_OPEN() * 0.9, gy - 700, 'dropping');
          ctx.save(); ctx.globalAlpha = 0.14 * (4 - g) * spd;
          if (R && R.claw) R.claw(ctx, gr, 0, 0, {});
          ctx.restore();
        }
      }
      if (X.R && X.R.claw) X.R.claw(ctx, rig, 0, 0, {});
      else { ctx.fillStyle = CHROME; ctx.beginPath(); ctx.arc(W / 2, cy, 40, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
  }

  /* ---------------------------------------------------- 1-3 the scatter */
  function drawCabinetShot(ctx, t, fr, o) {
    const R = X.R;
    const cfg = { w: CAB.w, h: CAB.h, chuteW: CAB.chuteW, dividerH: CAB.dividerH, frame: CAB.frame, railY: 26, slopeW: CAB.slopeW, slopeH: CAB.slopeH, claw: { rubber: 1 } };
    const st = { fog: 0, grease: 0, tilt: 0, act: 1, t };
    ctx.fillStyle = '#0b0616'; ctx.fillRect(-W, -H, W * 3, H * 3);
    if (R && R.cabinetBack) R.cabinetBack(ctx, CAB.x, CAB.y, cfg, st);
    ctx.save();
    ctx.beginPath(); ctx.rect(CAB.x, CAB.y, CAB.w, CAB.h); ctx.clip();
    const items = P.scatter.items;
    if (fr) {
      for (let i = 0; i < items.length; i++) {
        const b = fr.items[i];
        const held = o.held && o.held.indexOf(i) >= 0;
        // slow-motion smear: a faint copy trailing the velocity
        if (o.smear > 0) {
          const sp = Math.hypot(b[3], b[4]);
          if (sp > 120) {
            ctx.save(); ctx.globalAlpha = 0.28 * o.smear;
            if (R && R.item) R.item(ctx, items[i].def, CAB.x + b[0] - b[3] * 0.03, CAB.y + b[1] - b[4] * 0.03, b[2], 1, {});
            ctx.restore();
          }
        }
        if (R && R.item) R.item(ctx, items[i].def, CAB.x + b[0], CAB.y + b[1], b[2], 1, { glow: held ? CYAN : 0 });
        else { ctx.fillStyle = items[i].def.color || '#888'; ctx.beginPath(); ctx.arc(CAB.x + b[0], CAB.y + b[1], 12, 0, TAU); ctx.fill(); }
      }
      if (R && R.claw) R.claw(ctx, { phase: fr.phase, geo: { s: fr.s }, sway: fr.sway, cableTop: fr.top, bodies: { hub: fr.hub, prongs: fr.prongs, ghost: null }, cfg: cfg.claw }, CAB.x, CAB.y, cfg);
    }
    // sparks on the impact
    if (o.sparkT != null && t >= o.sparkT) {
      const age = (t - o.sparkT) * (o.sparkRate || 1);
      const hx = CAB.x + (fr ? fr.hub.x : CAB.w / 2), hy = CAB.y + (fr ? fr.hub.y + 60 : CAB.h * 0.6);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (const s of P.sparks) {
        if (age > s.life) continue;
        const k = age / s.life;
        const px = hx + Math.cos(s.a) * s.v * age, py = hy + Math.sin(s.a) * s.v * age + 900 * age * age;
        const qx = hx + Math.cos(s.a) * s.v * Math.max(0, age - 0.03), qy = hy + Math.sin(s.a) * s.v * Math.max(0, age - 0.03) + 900 * Math.pow(Math.max(0, age - 0.03), 2);
        ctx.strokeStyle = s.col; ctx.globalAlpha = 1 - k; ctx.lineWidth = s.w;
        ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(px, py); ctx.stroke();
      }
      ctx.restore();
      if (age < 0.12) glow(ctx, hx, hy, 140 * (1 - age / 0.12) + 20, '#fff6c0', 0.9);
    }
    // glass reflection wipe
    if (o.wipe != null) {
      const k = o.wipe;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const wx = CAB.x - 200 + k * (CAB.w + 400);
      ctx.fillStyle = rgba('#ffffff', 0.16);
      ctx.beginPath(); ctx.moveTo(wx, CAB.y); ctx.lineTo(wx + 70, CAB.y); ctx.lineTo(wx - 90, CAB.y + CAB.h); ctx.lineTo(wx - 160, CAB.y + CAB.h); ctx.closePath(); ctx.fill();
      ctx.fillStyle = rgba('#ffffff', 0.08);
      ctx.beginPath(); ctx.moveTo(wx + 100, CAB.y); ctx.lineTo(wx + 124, CAB.y); ctx.lineTo(wx - 36, CAB.y + CAB.h); ctx.lineTo(wx - 60, CAB.y + CAB.h); ctx.closePath(); ctx.fill();
      for (const g of P.glints) {
        const a = Math.max(0, 1 - Math.abs((CAB.x + g.x) - (wx - 60)) / 90);
        if (a > 0) glow(ctx, CAB.x + g.x, CAB.y + g.y, g.r, '#ffffff', a * 0.5);
      }
      ctx.restore();
    }
    ctx.restore();
    if (R && R.cabinetFront) R.cabinetFront(ctx, CAB.x, CAB.y, cfg, st);
  }
  function shotScatter(ctx, t) {
    const simT = warpT(t);
    const fr = frameAt(simT);
    const w = P.warp;
    const slow = t < 2.05;
    const lifting = fr && (fr.phase === 'lifting' || fr.phase === 'carrying');
    const hubY = fr ? CAB.y + fr.hub.y : CAB.y + 200;
    // camera: tight on the palm during the burst, pulling out as the claw rises
    const k = seg(t, 2.3, 3.0);
    const zoom = lerp(1.75, 1.05, outCubic(k));
    const cy = lerp(clamp(hubY + 60, CAB.y + 120, CAB.y + 300), CAB.y + CAB.h * 0.45, outCubic(k));
    const shake = impact(t, 1.0, 16, 6) + (lifting ? 1.5 : 0);
    ctx.save();
    camera(ctx, { cx: CAB.x + (fr ? fr.hub.x : CAB.w / 2) * 0.5 + W / 4, cy, zoom, shake, t });
    drawCabinetShot(ctx, t, fr, {
      held: lifting ? P.scatter.locked : null,
      smear: slow ? 1 : 0.4,
      sparkT: 1.0, sparkRate: slow ? 0.42 : 1,
      wipe: t > 1.05 && t < 2.2 ? seg(t, 1.05, 2.2) : null,
    });
    ctx.restore();
    // slow-motion stamp
    if (slow && t > 1.08) {
      ctx.save(); ctx.globalAlpha = 0.7 * seg(t, 1.08, 1.25) * (1 - seg(t, 1.9, 2.05));
      txt(ctx, 'x0.35', W - 34, 72, 22, CYAN, '800', 'right', INK, 4);
      ctx.restore();
    }
    void w;
  }

  /* ------------------------------------------------------ 3-5.5 the fight */
  function enemyDef(id) {
    const D = X.D, tbl = D && D.ENEMIES;
    return (tbl && tbl[id]) || { id, name: id, tier: 'normal', act: 1, size: 1, art: id };
  }
  function drawArena(ctx, t, o) {
    const R = X.R;
    // The arena backdrop drawn big: the fight's floor line lands at o.floorY.
    ctx.save();
    ctx.translate(W / 2, o.floorY); ctx.scale(o.bgScale, o.bgScale); ctx.translate(-W / 2, -302);
    if (R && R.bg) R.bg(ctx, W, 960, 1, t); else { ctx.fillStyle = INK; ctx.fillRect(-W, -H, W * 3, H * 3); }
    ctx.restore();
  }
  function speedLines(ctx, t, k, dir) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (const s of P.speedLines) {
      const ph = (s.ph + t * 6) % 1;
      const x = dir > 0 ? W * (1.2 - ph * 1.6) : W * (ph * 1.6 - 0.2);
      ctx.strokeStyle = rgba('#ffffff', 0.3 * k); ctx.lineWidth = s.w;
      ctx.beginPath(); ctx.moveTo(x, s.y * H); ctx.lineTo(x + dir * s.len, s.y * H); ctx.stroke();
    }
    ctx.restore();
  }
  function stamp(ctx, x, y, r, col, label, k, kind, t) {
    // a status stamp: a coloured disc with a hand-drawn icon and a label
    const e = outBack(clamp(k, 0, 1));
    ctx.save();
    ctx.translate(x, y); ctx.rotate((1 - e) * 0.6 - 0.1); ctx.scale(e * 1.0 + 0.001, e * 1.0 + 0.001);
    glow(ctx, 0, 0, r * 1.9, col, 0.8);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.82, 0, TAU); ctx.strokeStyle = rgba('#ffffff', 0.5); ctx.lineWidth = 2; ctx.stroke();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (kind === 'burn') {
      if (X.R && X.R.flames) X.R.flames(ctx, 0, r * 0.55, r * 1.0, r * 1.15, t, 2);
    } else if (kind === 'poison') {
      // a skull-ish blob: two eye sockets and three bubbles
      ctx.fillStyle = '#12091f';
      ctx.beginPath(); ctx.arc(-r * 0.22, -r * 0.12, r * 0.16, 0, TAU); ctx.arc(r * 0.22, -r * 0.12, r * 0.16, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-r * 0.3, r * 0.28); ctx.quadraticCurveTo(0, r * 0.55, r * 0.3, r * 0.28); ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.stroke();
      ctx.strokeStyle = INK; ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) { const bx = (i - 1) * r * 0.42, by = -r * 0.62 + Math.sin(t * 5 + i) * 3; ctx.beginPath(); ctx.arc(bx, by, r * 0.1 + i * 1.5, 0, TAU); ctx.stroke(); }
    } else if (kind === 'freeze') {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI / 3;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7); ctx.lineTo(-Math.cos(a) * r * 0.7, -Math.sin(a) * r * 0.7); ctx.stroke();
        for (const d of [1, -1]) { const px = Math.cos(a) * r * 0.42 * d, py = Math.sin(a) * r * 0.42 * d; ctx.beginPath(); ctx.moveTo(px + Math.cos(a + 0.9) * r * 0.2 * d, py + Math.sin(a + 0.9) * r * 0.2 * d); ctx.lineTo(px, py); ctx.lineTo(px + Math.cos(a - 0.9) * r * 0.2 * d, py + Math.sin(a - 0.9) * r * 0.2 * d); ctx.stroke(); }
      }
      ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7); ctx.lineTo(-Math.cos(a) * r * 0.7, -Math.sin(a) * r * 0.7); ctx.stroke(); }
    }
    ctx.restore();
    if (label) {
      ctx.save(); ctx.globalAlpha = clamp((k - 0.5) * 3, 0, 1);
      txt(ctx, label, x, y + r + 22, 22, col, '900', 'center', INK, 5);
      ctx.restore();
    }
  }
  function bigNumber(ctx, x, y, str, k, col) {
    const e = outBack(clamp(k * 2.2, 0, 1)), rise = outCubic(clamp(k, 0, 1)) * 26;
    ctx.save();
    ctx.translate(x, y - rise); ctx.rotate(-0.12 + (1 - e) * 0.4); ctx.scale(e * 1.15 + 0.001, e * 1.15 + 0.001);
    ctx.globalAlpha = k > 0.75 ? clamp((1 - k) / 0.25, 0, 1) : 1;
    txt(ctx, str, 0, 0, 96, col || GOLD, '900', 'center', INK, 12);
    ctx.font = '900 96px ' + FONT; ctx.strokeStyle = rgba('#ffffff', 0.7); ctx.lineWidth = 2; ctx.strokeText(str, 0, 0);
    ctx.restore();
  }
  function shotFight(ctx, t) {
    const R = X.R;
    const slime = enemyDef('slime'), goblin = enemyDef('goblin');
    // which cut
    let ci = 0;
    for (let i = 0; i < CUTS.length - 1; i++) if (t >= CUTS[i]) ci = i;
    const c0 = CUTS[ci], c1 = CUTS[ci + 1], u = seg(t, c0, c1);
    const floorY = 640, bgScale = 1.6, SX = 175, GX = 400, ES = 2.0;
    ctx.save();
    if (ci === 0) {
      // A: the lunge, camera whipping in from the right, both enemies sliding in with speed lines.
      const e = outCubic(seg(t, c0, c0 + 0.32));
      const push = 1.12 - 0.1 * e;
      camera(ctx, { cx: W / 2 + 40 * (1 - e), cy: floorY - 130, zoom: push, shake: impact(t, c0 + 0.3, 6, 12), t });
      drawArena(ctx, t, { floorY, bgScale });
      const sx = lerp(W + 240, SX, e), gx = lerp(W + 420, GX, outCubic(seg(t, c0, c0 + 0.42)));
      const atk = Math.max(0, Math.sin(seg(t, c0 + 0.18, c0 + 0.5) * Math.PI));
      if (R && R.enemy) {
        R.enemy(ctx, slime, sx, floorY, ES, t, { attack: atk });
        R.enemy(ctx, goblin, gx, floorY, ES * 0.95, t, { attack: atk * 0.8 });
      }
      speedLines(ctx, t, 1 - e * 0.6, -1);
    } else if (ci === 1) {
      // B: the sword flies from the chute into the slime; hit flash; the big number.
      const hitT = c0 + 0.22;
      const hit = t >= hitT;
      const hk = seg(t, hitT, c1);
      const zoomIn = 1.25 + 0.16 * outCubic(seg(t, hitT, hitT + 0.1)) - 0.08 * seg(t, hitT + 0.1, c1);
      camera(ctx, { cx: 230, cy: floorY - 130, zoom: zoomIn, shake: impact(t, hitT, 22, 8), t });
      drawArena(ctx, t, { floorY, bgScale });
      const hurt = hit ? Math.max(0, 1 - hk * 2.4) : 0;
      const hot = (g) => {
        if (R && R.enemy) R.enemy(g, slime, SX, floorY, ES, t, { hurt });
        if (R && R.enemy) R.enemy(g, goblin, GX + 40, floorY, ES * 0.95, t, {});
      };
      split(ctx, hot, hit ? 5 * (1 - seg(t, hitT, hitT + 0.28)) : 0);
      // the sword: from the bottom right (the chute) arcing into the slime
      const sk = seg(t, c0, hitT), sw = itemDef('rusty_sword');
      if (!hit) {
        const px = lerp(560, SX + 20, inOut(sk)), py = lerp(900, floorY - 100, sk) - Math.sin(sk * Math.PI) * 220;
        const ang = lerp(-0.6, 2.4, sk);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let i = 1; i <= 4; i++) {
          const q = clamp(sk - i * 0.05, 0, 1);
          const gx = lerp(560, SX + 20, inOut(q)), gy = lerp(900, floorY - 100, q) - Math.sin(q * Math.PI) * 220;
          ctx.globalAlpha = 0.25 - i * 0.05;
          if (R && R.item) R.item(ctx, sw, gx, gy, lerp(-0.6, 2.4, q), 1.7, {});
        }
        ctx.restore();
        if (R && R.item) R.item(ctx, sw, px, py, ang, 1.8, { glow: GOLD });
      } else {
        // the sword sticks in for a beat, then falls
        const fall = seg(t, hitT + 0.15, c1);
        if (R && R.item) R.item(ctx, sw, SX + 30 + fall * 20, floorY - 80 + fall * fall * 320, 2.4 + fall * 2, 1.6, {});
        const fk = seg(t, hitT, hitT + 0.16);
        if (fk < 1) {
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 - fk;
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; ctx.lineCap = 'round';
          for (let i = 0; i < 9; i++) { const a = i * TAU / 9 + 0.3; const r0 = 30 + fk * 90, r1 = 70 + fk * 140; ctx.beginPath(); ctx.moveTo(SX + 20 + Math.cos(a) * r0, floorY - 110 + Math.sin(a) * r0); ctx.lineTo(SX + 20 + Math.cos(a) * r1, floorY - 110 + Math.sin(a) * r1); ctx.stroke(); }
          ctx.restore();
          glow(ctx, SX + 20, floorY - 110, 180, '#ffffff', 1 - fk);
        }
        bigNumber(ctx, SX + 40, floorY - 250, '12', hk, GOLD);
      }
    } else if (ci === 2) {
      // C: the status stamps, then the goblin freezes solid.
      const frz = seg(t, c0 + 0.34, c0 + 0.5);
      camera(ctx, { cx: W / 2 + 20, cy: floorY - 150, zoom: 1.12 + frz * 0.08, shake: impact(t, c0 + 0.34, 12, 9) + impact(t, c0 + 0.05, 5, 12) + impact(t, c0 + 0.17, 5, 12), t });
      drawArena(ctx, t, { floorY, bgScale });
      const hot = (g) => {
        if (R && R.enemy) R.enemy(g, slime, SX, floorY, ES, t, { burning: t > c0 + 0.05, poisoned: t > c0 + 0.17, hurt: impact(t, c0 + 0.05, 1, 10) });
        if (R && R.enemy) R.enemy(g, goblin, GX, floorY, ES * 0.95, t, { frozen: t > c0 + 0.34, hurt: impact(t, c0 + 0.34, 1, 8) });
      };
      split(ctx, hot, 4 * impact(t, c0 + 0.34, 1, 10));
      const D = X.D, ST = (D && D.STATUS) || {};
      const col = (id, dflt) => (ST[id] && ST[id].color) || dflt;
      stamp(ctx, 130, floorY - 330, 40, col('burn', '#ff8a2e'), 'BURN', seg(t, c0 + 0.03, c0 + 0.2), 'burn', t);
      stamp(ctx, 270, floorY - 370, 40, col('poison', LIME), 'POISON', seg(t, c0 + 0.15, c0 + 0.32), 'poison', t);
      stamp(ctx, 415, floorY - 330, 40, col('freeze', CYAN), 'FREEZE', seg(t, c0 + 0.3, c0 + 0.47), 'freeze', t);
      if (frz > 0 && frz < 1) {
        // ice crack ring on the goblin
        ctx.save(); ctx.globalAlpha = 1 - frz; ctx.strokeStyle = '#dff4ff'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(GX, floorY - 110, 60 + frz * 160, 0, TAU); ctx.stroke(); ctx.restore();
      }
    } else {
      // D: pink then cyan flashes with a hard push on the pair, a second hit on the goblin.
      const hit2 = c0 + 0.32;
      camera(ctx, { cx: 300, cy: floorY - 140, zoom: 1.22 + 0.1 * outCubic(seg(t, hit2, hit2 + 0.12)), shake: impact(t, hit2, 18, 8), t });
      drawArena(ctx, t, { floorY, bgScale });
      const hot = (g) => {
        if (R && R.enemy) R.enemy(g, slime, SX, floorY, ES, t, { burning: true, poisoned: true });
        if (R && R.enemy) R.enemy(g, goblin, GX, floorY, ES * 0.95, t, { frozen: true, hurt: impact(t, hit2, 1, 8) });
      };
      split(ctx, hot, 5 * impact(t, hit2, 1, 8) + 2 * impact(t, c0, 1, 20));
      const sh = itemDef('dented_shield');
      const sk = seg(t, c0 + 0.05, hit2);
      if (t < hit2 && R && R.item) R.item(ctx, sh, lerp(600, GX, sk), lerp(920, floorY - 120, sk) - Math.sin(sk * Math.PI) * 200, sk * 5, 1.9, { glow: CYAN });
      if (t >= hit2) bigNumber(ctx, GX + 10, floorY - 260, '7', seg(t, hit2, c1), CYAN);
      // full-frame flashes: pink at the cut, cyan at the hit
      ctx.restore(); ctx.save();
      const fp = impact(t, c0, 0.5, 16), fc = impact(t, hit2, 0.45, 18);
      if (fp > 0.02) { ctx.globalAlpha = fp; ctx.fillStyle = PINK; ctx.fillRect(0, 0, W, H); }
      if (fc > 0.02) { ctx.globalAlpha = fc; ctx.fillStyle = CYAN; ctx.fillRect(0, 0, W, H); }
    }
    ctx.restore();
    void u;
  }

  /* ------------------------------------------------------ 5.5-7.5 the climb */
  function shotClimb(ctx, t) {
    const R = X.R, mp = P.map;
    if (R && R.mapBg) R.mapBg(ctx, W, H, 1, t); else { ctx.fillStyle = INK; ctx.fillRect(0, 0, W, H); }
    if (!mp.ok) return;
    const HEX = mp.hex;
    // The camera: races along the road with an ease-in, lands on the boss with a hit.
    const k = seg(t, 5.5, 7.3);
    const s = mp.roadLen * inOut(k);
    const at = roadAt(mp, s);
    const landing = seg(t, 7.3, 7.5);
    const zoom = lerp(1.3, 1.0, outCubic(seg(t, 5.5, 6.3))) * (1 + 0.85 * outCubic(landing));
    // the road ahead fills the frame (the crawler rides in the lower third), the boss lands just under the top
    const ahead = 230 / zoom * (1 - inCubic(seg(t, 6.9, 7.3)));
    const cx = lerp(at.x, mp.boss.x, landing);
    // never show past the top edge of the world: the boss sits on it
    const topEdge = mp.boss.y - HEX * 1.15;
    const cy = Math.max(lerp(at.y - ahead, mp.boss.y + 150, landing), topEdge + (H / 2) / zoom);
    const shake = impact(t, 7.3, 18, 7) + (k > 0.15 && k < 0.85 ? 2 : 0);
    ctx.save();
    camera(ctx, { cx, cy, zoom, shake, t });
    const st = { t, orient: mp.orient, biome: mp.biome, fill: null, seed: 0, mask: 0 };
    // cull to the view
    const vx0 = cx - W / zoom, vx1 = cx + W / zoom, vy0 = cy - H / zoom, vy1 = cy + H / zoom;
    const tiles = mp.tiles;
    for (const it of tiles) {
      if (it.wx < vx0 || it.wx > vx1 || it.wy < vy0 || it.wy > vy1) continue;
      st.fill = it.fill; st.seed = it.seed; st.mask = it.mask;
      if (R && R.terrainHex) R.terrainHex(ctx, it.wx, it.wy, HEX, it.tile, st);
    }
    if (R && R.mapRoad && mp.road.length > 1) R.mapRoad(ctx, mp.road, HEX, t);
    const flat = mp.orient === 'v';
    for (const it of tiles) {
      if (it.wx < vx0 || it.wx > vx1 || it.wy < vy0 || it.wy > vy1) continue;
      const tile = it.tile;
      tile.revealed = it.lit || t >= it.revealT;
      st.fill = it.fill; st.seed = it.seed; st.mask = it.mask;
      st.current = false; st.reachable = false;
      if (R && R.hex) R.hex(ctx, it.wx, it.wy, HEX, tile, st);
      // the ink splash painting the hex open
      const age = t - it.revealT;
      if (age >= 0 && age < 0.38) {
        const e = outCubic(age / 0.38);
        ctx.save(); ctx.translate(it.wx, it.wy); ctx.globalAlpha = 1 - e;
        ctx.fillStyle = INK;
        ctx.beginPath(); ctx.arc(0, 0, HEX * (0.3 + e * 1.1), 0, TAU); ctx.fill();
        for (let i = 0; i < 5; i++) { const a = i * TAU / 5 + it.seed % 7; const d = HEX * (0.5 + e * 1.3); ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, HEX * 0.14 * (1 - e * 0.5), 0, TAU); ctx.fill(); }
        ctx.restore();
      }
      void flat;
    }
    // the crawler riding the road
    if (R && R.crawler && k < 0.98) R.crawler(ctx, at.x, at.y, HEX, t * 3);
    // the boss skull landing: a heavy stamp ring
    if (landing > 0) {
      const e = outCubic(landing);
      ctx.save();
      ctx.strokeStyle = rgba(PINK, 1 - e); ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(mp.boss.x, mp.boss.y, HEX * (0.9 + e * 2.2), 0, TAU); ctx.stroke();
      glow(ctx, mp.boss.x, mp.boss.y, HEX * 2.4, PINK, 0.6 * (1 - e * 0.5));
      ctx.restore();
    }
    ctx.restore();
    // the act title card whipping past
    const tk = seg(t, 5.55, 5.75), tk2 = seg(t, 6.6, 6.8);
    if (tk > 0 && tk2 < 1) {
      ctx.save(); ctx.globalAlpha = Math.min(tk, 1 - tk2);
      txt(ctx, 'ACT 1', 40 + (1 - outCubic(tk)) * -80, 120, 46, PINK, '900', 'left', INK, 8);
      txt(ctx, 'THE DAMP CELLAR', 40 + (1 - outCubic(tk)) * -80, 160, 22, CYAN, '800', 'left', INK, 5);
      ctx.restore();
    }
    if (landing > 0) {
      const e = outBack(clamp(landing * 1.4, 0, 1));
      ctx.save(); camera(ctx, { cx, cy, zoom, shake, t });
      ctx.translate(mp.boss.x, mp.boss.y + HEX * 2.1); ctx.scale(e, e);
      txt(ctx, 'BOSS', 0, 0, 40, BLOOD, '900', 'center', INK, 7);
      ctx.restore();
    }
  }

  /* ------------------------------------------------------ 7.5-10 the name */
  function chromeText(ctx, s, x, y, fs, k) {
    // Chrome lettering like RENDER.title's logo: pink neon under-glow, ink
    // outline, chrome body, a white top half and a pink bottom half.
    ctx.font = '900 ' + fs + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.strokeStyle = rgba(PINK, 0.45 * k); ctx.lineWidth = fs * 0.34; ctx.strokeText(s, x, y);
    ctx.strokeStyle = INK; ctx.lineWidth = fs * 0.17; ctx.strokeText(s, x, y);
    ctx.fillStyle = CHROME; ctx.fillText(s, x, y);
    ctx.save(); ctx.beginPath(); ctx.rect(x - fs, y - fs * 0.5, fs * 2, fs * 0.42); ctx.clip(); ctx.fillStyle = '#ffffff'; ctx.fillText(s, x, y); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(x - fs, y + fs * 0.05, fs * 2, fs * 0.5); ctx.clip(); ctx.fillStyle = PINK; ctx.fillText(s, x, y); ctx.restore();
    ctx.strokeStyle = rgba('#ffffff', 0.6); ctx.lineWidth = 1.5; ctx.strokeText(s, x, y);
  }
  function shotName(ctx, t, o) {
    const R = X.R;
    ctx.fillStyle = '#0b0616'; ctx.fillRect(0, 0, W, H);
    const cx = W / 2, ly = 470;
    let fs = 92;
    // stars and the pink floor band
    ctx.save();
    for (const s of P.stars) { ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 2 + s.ph); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(s.x, s.y, s.s, 0, TAU); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = rgba(PINK, 0.08); ctx.fillRect(0, H * 0.55, W, H * 0.45);
    // rain of tiny prizes drifting down behind everything
    ctx.save();
    for (const p of P.rain) {
      const py = ((p.ph + (t - 7.5) * p.sp) % 1) * H * 1.1 - H * 0.05;
      ctx.save(); ctx.translate(p.x * W, py); ctx.rotate(p.rot + t * 0.8); ctx.globalAlpha = 0.45;
      if (R && R.item) R.item(ctx, { art: p.k, shape: { kind: 'circle', r: 15 } }, 0, 0, 0, p.s, {});
      ctx.restore();
    }
    ctx.restore();
    // Shake from the letter landings.
    let sh = 0;
    for (let i = 0; i < LETTERS.length; i++) sh += impact(t, LETTER_T0 + i * LETTER_GAP + 0.1, 7, 14);
    sh += impact(t, 9.6, 14, 8);
    ctx.save();
    ctx.translate(jx(t) * sh, jy(t) * sh);
    // The closed claw silhouette rising behind the logo, opening as the name lands.
    const rise = outCubic(seg(t, 7.5, 8.5));
    const open = seg(t, 8.4, 8.95);
    const hubY = lerp(H + 300, ly - 150, rise);
    const phi = lerp(PHI_CLOSED(), PHI_OPEN(), outBack(open));
    const rig = fakeRig(cx, hubY, 5.0, phi, -40, open > 0 ? 'releasing' : 'carrying');
    ctx.save();
    ctx.globalAlpha = 0.9;
    if (R && R.claw) R.claw(ctx, rig, 0, 0, {});
    ctx.restore();
    glow(ctx, cx, ly, 240, PINK, 0.25 + 0.2 * rise);
    // the letters
    // measured at 92 px, then shrunk to fit inside the frame with a margin (fonts differ per platform)
    ctx.font = '900 ' + fs + 'px ' + FONT;
    let widths = LETTERS.map((ch) => { try { const m = ctx.measureText(ch); return (m && m.width) || fs * 0.62; } catch (e) { return fs * 0.62; } });
    const track = 2;
    let total = widths.reduce((a, b) => a + b, 0) + track * (LETTERS.length - 1);
    if (total > W - 44) { const k = (W - 44) / total; fs = Math.floor(fs * k); widths = widths.map((w) => w * k); total = widths.reduce((a, b) => a + b, 0) + track * (LETTERS.length - 1); }
    let lx = cx - total / 2;
    for (let i = 0; i < LETTERS.length; i++) {
      const t0 = LETTER_T0 + i * LETTER_GAP;
      const k = seg(t, t0, t0 + 0.12);
      const x = lx + widths[i] / 2;
      lx += widths[i] + track;
      if (k <= 0) continue;
      const e = outBack(k);
      ctx.save();
      ctx.translate(x, ly);
      const sc = lerp(3.2, 1, e);
      ctx.scale(sc, sc); ctx.globalAlpha = clamp(k * 3, 0, 1);
      chromeText(ctx, LETTERS[i], 0, 0, fs, 1);
      ctx.restore();
      // landing dust ring
      const age = t - (t0 + 0.1);
      if (age > 0 && age < 0.25) {
        ctx.save(); ctx.globalAlpha = 1 - age / 0.25; ctx.strokeStyle = PINK; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(x, ly + fs * 0.45, 20 + age * 160, 6 + age * 30, 0, 0, TAU); ctx.stroke(); ctx.restore();
      }
    }
    // the neon under-glow strip
    const gl = seg(t, 8.3, 8.8);
    if (gl > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(PINK, 0.5 * gl);
      ctx.beginPath(); ctx.ellipse(cx, ly + fs * 0.5, total * 0.55 * gl, 12, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // the tagline types in
    const nCh = Math.floor(clamp((t - TAG_T0) / TAG_RATE, 0, TAGLINE.length));
    if (nCh > 0) {
      const shown = TAGLINE.slice(0, nCh);
      const caret = nCh < TAGLINE.length && Math.floor(t * 14) % 2 === 0 ? '_' : '';
      txt(ctx, shown + caret, cx, ly + fs * 0.85, 28, CYAN, '800', 'center', INK, 6);
    }
    // sub line
    if (t > 9.25) {
      ctx.save(); ctx.globalAlpha = seg(t, 9.25, 9.5);
      txt(ctx, 'a claw machine roguelike', cx, ly + fs * 0.85 + 36, 18, rgba('#f3ecff', 0.85), '700', 'center', INK, 4);
      ctx.restore();
    }
    // the fanfare hit: a white-hot ring
    const fh = t - 9.6;
    if (fh >= 0 && fh < 0.5) {
      const e = outCubic(fh / 0.5);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 - e;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 10 * (1 - e) + 2;
      ctx.beginPath(); ctx.ellipse(cx, ly, total * 0.6 + e * 300, fs * 0.8 + e * 260, 0, 0, TAU); ctx.stroke();
      ctx.restore();
      if (fh < 0.12) { ctx.save(); ctx.globalAlpha = 0.6 * (1 - fh / 0.12); ctx.fillStyle = '#ffffff'; ctx.fillRect(-50, -50, W + 100, H + 100); ctx.restore(); }
    }
    ctx.restore();
    // TAP TO PLAY (in-game only)
    if (o && o.tap && t >= 9.6) {
      const pul = 0.7 + 0.3 * Math.sin((t - 9.6) * 5);
      const k = seg(t, 9.6, 9.8);
      ctx.save(); ctx.globalAlpha = k * pul;
      txt(ctx, 'TAP TO PLAY', cx, H - 120, 30, GOLD, '900', 'center', INK, 7);
      ctx.restore();
    }
  }

  /* ----------------------------------------------------------- post fx */
  function whip(ctx, t) {
    // Hard whip transitions at each fight cut and into / out of the montage:
    // the outgoing frame streaks off left, the incoming one streaks in from
    // the right, in 0.07 s. Applied as a translate before the shot is drawn.
    const cuts = [1.0, 3.0, 3.6, 4.2, 4.85, 5.5, 7.5];
    const D = 0.07;
    for (const c of cuts) {
      const d = t - c;
      if (d < 0 && d > -D) { const k = 1 + d / D; return { dx: -W * inCubic(k), k }; }
      if (d >= 0 && d < D) { const k = 1 - d / D; return { dx: W * inCubic(k), k }; }
    }
    return null;
  }
  function whipStreaks(ctx, t, wp) {
    if (!wp || wp.k <= 0) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let i = 0; i < 14; i++) {
      const y = (i * 71 + 40) % H, len = 120 + (i % 4) * 90;
      ctx.strokeStyle = rgba(i % 2 ? '#ffffff' : CYAN, 0.35 * wp.k); ctx.lineWidth = 2 + (i % 3);
      ctx.beginPath(); ctx.moveTo((i * 137) % W - wp.dx * 0.5, y); ctx.lineTo((i * 137) % W - wp.dx * 0.5 + len * Math.sign(wp.dx || 1), y); ctx.stroke();
    }
    ctx.restore();
  }
  let VIG = null;
  function vignette(ctx, a) {
    ctx.save();
    try {
      if (!VIG && ctx.createRadialGradient) {
        const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.72);
        g.addColorStop(0, 'rgba(5,3,10,0)'); g.addColorStop(1, 'rgba(5,3,10,1)');
        VIG = g;
      }
      if (VIG) { ctx.globalAlpha = a; ctx.fillStyle = VIG; ctx.fillRect(0, 0, W, H); }
    } catch (e) { /* stub */ }
    ctx.restore();
  }
  function grain(ctx, t, a) {
    const k = Math.floor(t * FPS);
    const r = U.rng(k * 7919 + 13);
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 70; i++) ctx.fillRect(r() * W, r() * H, 2, 2);
    ctx.fillStyle = '#000000';
    for (let i = 0; i < 70; i++) ctx.fillRect(r() * W, r() * H, 2, 2);
    ctx.restore();
  }
  function letterbox(ctx, t) {
    // bars slide in for the montage (3.0) and out for the name (7.5)
    const k = Math.min(seg(t, 2.85, 3.05), 1 - seg(t, 7.45, 7.62));
    if (k <= 0) return;
    const hgt = 66 * outCubic(k);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, hgt); ctx.fillRect(0, H - hgt, W, hgt);
  }

  /* ------------------------------------------------------------ draw */
  function draw(ctx, t, w, h, opts) {
    if (!ctx) return;
    prepare();
    t = clamp(+t || 0, 0, DUR + 30);
    const tt = Math.min(t, DUR);
    w = w || W; h = h || H;
    ctx.save();
    try {
      ctx.scale(w / W, h / H);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
      ctx.fillStyle = '#05030a'; ctx.fillRect(0, 0, W, H);
      const wp = whip(ctx, tt);
      ctx.save();
      if (wp) ctx.translate(wp.dx, 0);
      if (tt < 1.0) shotDrop(ctx, tt);
      else if (tt < 3.0) shotScatter(ctx, tt);
      else if (tt < 5.5) shotFight(ctx, tt);
      else if (tt < 7.5) shotClimb(ctx, tt);
      else shotName(ctx, t, opts);
      ctx.restore();
      whipStreaks(ctx, tt, wp);
      letterbox(ctx, tt);
      vignette(ctx, tt < 1 ? 0.55 : 0.4);
      grain(ctx, t, 0.07);
      if (opts && opts.hint) {
        ctx.save(); ctx.globalAlpha = 0.75;
        txt(ctx, 'tap to skip', W - 20, H - 26, 15, rgba('#f3ecff', 0.8), '700', 'right', INK, 3);
        ctx.restore();
      }
    } catch (e) { /* the intro must never throw */ }
    ctx.restore();
  }

  /* ------------------------------------------------------------ play */
  let A = null;   // the active in-game run
  const HOLD = 4;  // seconds the hero frame waits for a tap before moving on
  function play(o) {
    o = o || {};
    const done = typeof o.onDone === 'function' ? o.onDone : () => {};
    const ctx = o.ctx;
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
    const perf = typeof performance !== 'undefined' && performance && typeof performance.now === 'function' ? performance : null;
    if (!ctx || o.headless || !raf || !perf) { done(); return false; }
    if (A) end(false);
    try { prepare(); } catch (e) { /* the shots degrade */ }
    const run = { ctx, done, px: o.px, t0: perf.now(), t: 0, ended: false, audio: null, frame: 0 };
    A = run;
    try {
      const Au = X.A;
      if (Au && Au.intro && Au.ready) run.audio = Au.intro();
    } catch (e) { run.audio = null; }
    const tick = (now) => {
      if (run.ended || A !== run) return;
      run.t = (now - run.t0) / 1000;
      const px = typeof run.px === 'function' ? run.px() : (run.px || 1);
      try {
        ctx.setTransform(px, 0, 0, px, 0, 0);
        draw(ctx, run.t, W, H, { tap: run.t >= 9.6, hint: run.t >= 1 && run.t < 9.6 });
      } catch (e) { /* keep going */ }
      if (run.t >= DUR + HOLD) { end(true); return; }
      run.frame = raf(tick);
    };
    run.frame = raf(tick);
    return true;
  }
  function end(callDone) {
    const run = A;
    if (!run) return;
    run.ended = true;
    A = null;
    try { if (typeof cancelAnimationFrame === 'function' && run.frame) cancelAnimationFrame(run.frame); } catch (e) { /* ignore */ }
    try { if (run.audio && run.audio.stop) run.audio.stop(); } catch (e) { /* ignore */ }
    if (callDone) { try { run.done(); } catch (e) { /* ignore */ } }
  }
  // A tap: skips to the title (the hero frame counts as finished too).
  function skip() { if (!A) return false; end(true); return true; }

  return {
    prepare, draw, play, skip, end: () => end(false),
    get active() { return !!A; },
    get time() { return A ? A.t : 0; },
    get prepared() { return !!P; },
    DUR, SHOTS: SHOTS.slice(), CUTS: CUTS.slice(), LETTERS: LETTERS.join(''), TAGLINE, W, H,
    _reset() { P = null; OFF = null; VIG = null; A = null; },
    _state() { return P; },
  };
})();
