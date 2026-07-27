// The heads-up display.
//
// Everything here is DOM on top of the canvas, and everything here runs every
// frame, so the whole module is built around one discipline: read state freely,
// write to the document almost never. Values are smoothed in JS, quantised to
// the step at which a change becomes visible, and then pushed through the
// guarded setters in ui/util.js, which drop the write when nothing moved. A
// steady scene produces single-digit DOM writes per frame.
//
// The second rule is that the HUD owns no gameplay truth. It reads `G`, it
// reacts to events, and it degrades in silence when a field it wants does not
// exist yet — weapons, AI and the director land in parallel with this module, so
// everything they own is probed for rather than assumed.

import { clamp, lerp } from '../core/state.js';
import {
  injectCSS, el, svg, txt, css, attr, cls, quant, reducedMotion, play,
  DEG, wrapDeg, bearingOf, project, posOf, nameOf,
} from './util.js';

// ── crosshair geometry, in the SVG's own units (1 unit = 1 CSS px) ───────────
const CH_SIZE = 200;              // the box the reticle lives in
const CH_C = CH_SIZE / 2;
const CH_GAP_MIN = 3.0;           // crouched, still, nothing happening
const CH_GAP_BASE = 7.5;          // standing, still
const CH_GAP_MAX = 52;            // sprinting, mid-burst, in the air
const CH_TICK = 10;
const CH_RELOAD_R = 30;

// The compass tape shows a 140° window. Wider and the marks crowd together;
// narrower and a contact enters the tape too late to be worth having.
const CO_W = 420, CO_H = 34, CO_PXDEG = CO_W / 140, CO_C = CO_W / 2;
const CO_SPAN = 360 * CO_PXDEG;   // one full turn, in tape units
const CO_HALF = 68;               // degrees either side of centre that stay visible

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function createHUD(G, root) {
  const doc = root.ownerDocument || document;
  const win = doc.defaultView || window;
  const reduce = reducedMotion(win);
  injectCSS(doc, 'bs-hud-css', CSS);

  const hud = root.querySelector('#hud');
  if (!hud) return { update() {}, handle() {}, dispose() {} };

  const q = (s) => root.querySelector(s);
  const E = {
    crosshair: q('#crosshair'),
    hitmark: q('#hitmark'),
    dmg: q('#dmg'),
    lowhp: q('#lowhp'),
    dmgdir: q('#dmgdir'),
    compass: q('#compass'),
    objective: q('#objective'),
    objText: q('#objective span'),
    objTitle: q('#objective b'),
    killfeed: q('#killfeed'),
    ammo: q('#ammo'),
    mag: q('#ammo .mag'),
    res: q('#ammo .res'),
    wname: q('#ammo .name'),
    fire: q('#ammo .fire'),
    health: q('#health'),
    hpNum: q('#health .num'),
    hpBar: q('#health .bar i'),
    hpLabel: q('#health .label'),
    toast: q('#toast'),
    perf: q('#perf'),
  };

  // The corner blocks slide in with the HUD. Tagging them from here rather than
  // editing the markup keeps index.html out of this module's hands.
  for (const n of [E.ammo, E.health, E.objective, E.killfeed]) if (n) n.classList.add('blk');

  // The debug readout is lifted out of #hud, which fades to zero outside play.
  // A profiler you cannot see while sitting in the pause menu is not a profiler.
  if (E.perf && E.perf.parentNode === hud) root.appendChild(E.perf);

  // ── crosshair ──────────────────────────────────────────────────────────────
  // One path holds all four ticks, so a spread change is a single attribute
  // write rather than four. It is drawn twice: a wide dark stroke underneath, a
  // thin bright one on top. That outline is what lets the reticle survive both
  // the blown-out sky and the black interiors without a panel behind it.
  attr(E.crosshair, 'viewBox', `0 0 ${CH_SIZE} ${CH_SIZE}`);
  const chShadow = svg(doc, 'path', { class: 'ch-sh' });
  const chTicks = svg(doc, 'path', { class: 'ch-tk' });
  const chDotSh = svg(doc, 'circle', { class: 'ch-sh', cx: CH_C, cy: CH_C, r: 2.1 });
  const chDot = svg(doc, 'circle', { class: 'ch-tk', cx: CH_C, cy: CH_C, r: 1.15 });
  const chReload = svg(doc, 'path', { class: 'ch-rl' });
  if (E.crosshair) {
    clear(E.crosshair);
    E.crosshair.append(chShadow, chTicks, chDotSh, chDot, chReload);
  }

  // ── hitmarker ──────────────────────────────────────────────────────────────
  // Three variants separated by shape first and colour second: a plain hit is
  // four short ticks, a headshot adds a ring, a kill is a longer heavier X with
  // a centre diamond. Someone who cannot tell amber from red still reads all
  // three apart, which is the point.
  if (E.hitmark) {
    clear(E.hitmark);
    attr(E.hitmark, 'viewBox', '0 0 40 40');
    E.hitmark.append(
      svg(doc, 'path', { class: 'hm-body', d: 'M11 11 L16 16 M29 11 L24 16 M11 29 L16 24 M29 29 L24 24' }),
      svg(doc, 'circle', { class: 'hm-ring', cx: 20, cy: 20, r: 12.5 }),
      svg(doc, 'path', { class: 'hm-pip', d: 'M20 16.4 L23.6 20 L20 23.6 L16.4 20 Z' }),
    );
  }

  // ── directional damage ─────────────────────────────────────────────────────
  // A small pool of arcs. Each keeps the world position it came from and is
  // re-aimed every frame, because an indicator that freezes the instant you turn
  // toward the shooter is worse than no indicator at all.
  const dirs = [];
  if (E.dmgdir) {
    for (let i = 0; i < 5; i++) {
      const n = el(doc, 'i');
      E.dmgdir.appendChild(n);
      dirs.push({ node: n, src: null, life: 0, max: 1, ang: 1e9, peak: 0 });
    }
  }

  // ── floating damage numbers ────────────────────────────────────────────────
  // The call: yes, but heavily rationed. A stream of numbers is an RPG tell and
  // this game's register is a terminal readout, so hits on the same target
  // accumulate into one figure for half a second and that figure is what floats.
  // A four-round burst reads "104" once instead of "26" four times, which is the
  // number the player actually wanted. Switchable off in settings.
  const numLayer = el(doc, 'div', 'dmgnum');
  hud.appendChild(numLayer);
  const numPool = [];
  for (let i = 0; i < 8; i++) {
    const n = el(doc, 'div', 'dn');
    n.style.opacity = '0';
    numLayer.appendChild(n);
    numPool.push({ node: n, key: null, total: 0, t: -99, anim: null, base: '' });
  }

  // ── compass ────────────────────────────────────────────────────────────────
  attr(E.compass, 'viewBox', `0 0 ${CO_W} ${CO_H}`);
  attr(E.compass, 'preserveAspectRatio', 'xMidYMid slice');
  let tape = null;
  const pips = [];
  let objPip = null;
  if (E.compass) {
    clear(E.compass);
    tape = svg(doc, 'g', { class: 'co-tape' });
    // Three copies of a full turn, so the tape scrolls with one transform and
    // still wraps seamlessly through north.
    for (let copy = -1; copy <= 1; copy++) tape.appendChild(buildTape(doc, copy * CO_SPAN));
    const marks = svg(doc, 'g', { class: 'co-marks' });
    for (let i = 0; i < 8; i++) {
      const p = svg(doc, 'path', { class: 'co-pip', d: 'M0 34 L-4.5 28 L4.5 28 Z', opacity: '0' });
      marks.appendChild(p);
      pips.push({ node: p });
    }
    objPip = svg(doc, 'path', { class: 'co-obj', d: 'M0 27.5 L4.5 31 L0 34.5 L-4.5 31 Z', opacity: '0' });
    marks.appendChild(objPip);
    E.compass.append(tape, marks,
      svg(doc, 'path', { class: 'co-index', d: `M${CO_C} 7 L${CO_C - 4.5} 1 L${CO_C + 4.5} 1 Z` }));
  }

  // ── ammo extras ────────────────────────────────────────────────────────────
  // A red magazine counter is not enough on its own: colour is the only channel
  // it uses, and it is the channel most likely to be missing. The state tag
  // spells the condition out in words beside it.
  const ammoTag = el(doc, 'div', 'tag');
  const reloadBar = el(doc, 'div', 'rl');
  const reloadFill = el(doc, 'i');
  reloadBar.appendChild(reloadFill);
  if (E.ammo) { E.ammo.append(ammoTag, reloadBar); }

  // ── health extras ──────────────────────────────────────────────────────────
  // The ghost bar is the chunk just lost, draining a beat behind the real one.
  // It gives a hit a readable size: the live bar snaps, and the gap between the
  // two is what that snap was worth.
  let hpGhost = null;
  if (E.hpBar && E.hpBar.parentNode) {
    hpGhost = el(doc, 'i', 'ghost');
    E.hpBar.parentNode.insertBefore(hpGhost, E.hpBar);
  }

  const objBar = el(doc, 'div', 'obar');
  const objFill = el(doc, 'i');
  objBar.appendChild(objFill);
  if (E.objective) E.objective.appendChild(objBar);

  // ── mutable HUD state ──────────────────────────────────────────────────────
  const S = {
    fireBloom: 0,        // decaying kick the reticle takes from shooting
    moveBloom: 0,        // smoothed, so stopping tightens the reticle instead of snapping it
    gap: CH_GAP_BASE,
    hpShown: G.player.maxHp,
    hpGhost: G.player.maxHp,
    dmgFlash: 0,
    lowPulse: 0,
    heading: 0,
    lastWeapon: null,
    obj: { title: 'Objective', text: '', pos: null, progress: -1 },
    objKey: '',
    feed: [],
    toastT: 0,
    perfT: 0,
    cine: 0,
  };

  const _p = { x: 0, y: 0 };

  // ── debug overlay toggle ───────────────────────────────────────────────────
  // F3, because it is the key already in the muscle memory of anyone who has
  // debugged a game, and because input.js binds nothing in the function row.
  // Backquote is an alias for keyboards where F3 is a media key.
  const onKey = (e) => {
    if (e.code !== 'F3' && e.code !== 'Backquote') return;
    e.preventDefault();
    root.classList.toggle('debug');
    S.perfT = 0;
  };
  doc.addEventListener('keydown', onKey);

  // ───────────────────────────────────────────────────────────────────────────
  function update(dt, perf) {
    if (!(dt > 0)) dt = 1 / 60;
    if (dt > 0.1) dt = 0.1;                     // a stalled tab must not fling every spring
    const p = G.player;
    const w = G.weapons.slots[G.weapons.active];

    const playing = G.mode === 'playing' || G.mode === 'dead';
    cls(root, 'playing', playing);
    S.cine = lerp(S.cine, cinematic(G) ? 1 : 0, 1 - Math.exp(-9 * dt));
    cls(hud, 'in', playing && S.cine < 0.5);
    cls(hud, 'cine', S.cine >= 0.5);

    updateCrosshair(dt, p, w);
    updateAmmo(dt, w);
    updateHealth(dt, p);
    updateCompass(dt, p);
    updateDirs(dt, p);
    updateFeed(dt);
    if (S.toastT > 0 && (S.toastT -= dt) <= 0) css(E.toast, 'opacity', '0');
    // Read the class rather than caching a flag: the overlay is also turned on
    // by the test rig and by hand from the console, and a private boolean would
    // silently disagree with what the page is showing.
    if (root.classList.contains('debug')) updatePerf(dt, perf);
  }

  // ── crosshair ──────────────────────────────────────────────────────────────
  function updateCrosshair(dt, p, w) {
    S.fireBloom *= Math.exp(-7 * dt);

    // The honest version: the weapons module publishes the live cone in degrees,
    // so the gap is that cone projected through the camera. A reticle whose ticks
    // sit exactly on the edge of the cone is the one promise a crosshair can make
    // that the ballistics will actually keep — anything else is decoration that
    // lies at some ranges.
    const deg = spreadDeg(w);
    let gap;
    if (deg >= 0) {
      // The live camera FOV, not the setting: sprint pushes it out and ADS pulls
      // it in, and a cone drawn against the wrong FOV is wrong exactly when the
      // player is moving fastest.
      const cam = win.BLACKSITE && win.BLACKSITE.engine && win.BLACKSITE.engine.camera;
      const half = Math.tan(clamp(num(cam && cam.fov, G.settings.fov), 20, 130) * 0.5 / DEG);
      gap = Math.tan(clamp(deg, 0, 45) / DEG) / half * (win.innerHeight * 0.5);
    } else {
      // Fallback for a weapon that publishes no cone: movement bloom smoothed
      // asymmetrically, opening as fast as the player accelerates and closing on
      // a settle time, so stopping to shoot stays a real decision with a cost.
      const speed = Math.hypot(p.vel.x, p.vel.z);
      const moveT = clamp(speed / 6.4, 0, 1) * (p.grounded ? 1 : 1.4);
      S.moveBloom += (moveT - S.moveBloom) * (1 - Math.exp((moveT > S.moveBloom ? -22 : -7) * dt));
      const still = clamp(1 - speed / 1.2, 0, 1);
      gap = lerp(CH_GAP_BASE, CH_GAP_MIN, still * (p.stance === 'crouch' ? 1 : 0.4))
        * (p.stance === 'crouch' ? 0.72 : 1) + S.moveBloom * 15;
    }
    // A couple of pixels of pure feel on top of the physics: the cone already
    // grew when the shot went off, but the eye needs the kick to be legible at
    // the fire rate, not just correct.
    gap = clamp(gap + Math.min(S.fireBloom, 2.4) * 2.6, CH_GAP_MIN, CH_GAP_MAX);
    S.gap += (gap - S.gap) * (1 - Math.exp(-26 * dt));

    const g = quant(S.gap, 0.25);
    const d = `M${CH_C} ${CH_C - g}v${-CH_TICK}M${CH_C} ${CH_C + g}v${CH_TICK}` +
              `M${CH_C - g} ${CH_C}h${-CH_TICK}M${CH_C + g} ${CH_C}h${CH_TICK}`;
    attr(chShadow, 'd', d);
    attr(chTicks, 'd', d);

    // Down the sights the sight picture *is* the reticle; a floating crosshair
    // on top of it is the clearest possible "this is a HUD, not a scope".
    const alpha = clamp(1 - (p.ads || 0) * 1.7, 0, 1) * (p.sprinting ? 0.4 : 1);
    css(E.crosshair, 'opacity', String(quant(alpha, 0.04)));

    // A centre dot is a precision affordance, so it goes to the weapons that
    // reward a precise first shot — semi-autos, bolt guns, anything scoped — and
    // never to a shotgun or a full-auto whose first round is a suggestion.
    const dot = wantsDot(w) ? '1' : '0';
    css(chDot, 'opacity', dot);
    css(chDotSh, 'opacity', dot);

    // Reload closes a ring around the reticle: it is already where the player is
    // looking, and it needs no label.
    const rl = reloadProgress(w);
    if (rl >= 0) {
      attr(chReload, 'd', arcPath(CH_C, CH_C, CH_RELOAD_R, -Math.PI / 2,
        -Math.PI / 2 + Math.max(0.015, quant(rl, 0.01)) * Math.PI * 2));
      css(chReload, 'opacity', '0.95');
    } else css(chReload, 'opacity', '0');
  }

  // ── ammo ───────────────────────────────────────────────────────────────────
  function updateAmmo(dt, w) {
    css(E.ammo, 'opacity', w ? '' : '0');
    if (!w) return;
    if (w !== S.lastWeapon) {
      // A swap re-introduces the whole block instead of swapping the digits
      // under the player's eyes, which would read as a glitch.
      S.lastWeapon = w;
      play(E.ammo, [{ opacity: 0, transform: 'translateY(9px)' }, { opacity: 1, transform: 'none' }],
        { duration: 260, easing: 'cubic-bezier(.2,.9,.25,1)' }, reduce);
    }

    const ammo = num(w.ammo, 0);
    const res = num(w.res, num(w.reserve, 0));
    const mag = num(w.mag, Math.max(ammo, 1));
    txt(E.mag, String(ammo));
    txt(E.res, '/ ' + res);
    txt(E.wname, String(w.name || w.id || '—'));
    txt(E.fire, String(w.mode || 'semi').toUpperCase());

    const rl = reloadProgress(w);
    const low = ammo > 0 && ammo <= Math.max(1, Math.min(6, Math.ceil(mag * 0.25)));
    cls(E.mag, 'low', low);
    const tag = rl >= 0 ? 'Reloading' : ammo === 0 ? (res > 0 ? 'Reload' : 'Dry') : low ? 'Low' : '';
    txt(ammoTag, tag);
    css(ammoTag, 'opacity', tag ? '1' : '0');
    cls(ammoTag, 'bad', ammo === 0 || low);
    cls(ammoTag, 'pulse', (low || ammo === 0) && rl < 0);

    css(reloadBar, 'opacity', rl >= 0 ? '1' : '0');
    css(reloadFill, 'transform', `scaleX(${quant(Math.max(0, rl), 0.01)})`);
  }

  // ── health ─────────────────────────────────────────────────────────────────
  function updateHealth(dt, p) {
    const max = p.maxHp || 100;
    const hp = clamp(p.hp, 0, max);

    // The asymmetry is the whole design. Damage snaps, because the player has to
    // feel the hit on the frame it lands or the fight becomes unreadable.
    // Recovery eases in over about a second: partly because relief should feel
    // slower than harm, and partly because a smoothed curve hides the exact
    // regen rate, so nobody ends up playing the health bar instead of the fight.
    if (hp < S.hpShown) S.hpShown = hp;
    else S.hpShown += (hp - S.hpShown) * (1 - Math.exp(-3.4 * dt));

    if (S.hpGhost < S.hpShown) S.hpGhost = S.hpShown;
    else S.hpGhost += (S.hpShown - S.hpGhost) * (1 - Math.exp(-5.5 * dt));

    const f = S.hpShown / max;
    txt(E.hpNum, String(Math.max(0, Math.ceil(S.hpShown))));
    css(E.hpBar, 'transform', `scaleX(${quant(f, 0.004)})`);
    css(hpGhost, 'transform', `scaleX(${quant(S.hpGhost / max, 0.004)})`);

    // Three states, each carrying a word as well as a colour.
    const state = f <= 0.25 ? 2 : f <= 0.5 ? 1 : 0;
    cls(E.health, 'warn', state === 1);
    cls(E.health, 'crit', state === 2);
    txt(E.hpLabel, state === 2 ? 'Vitals · Critical' : state === 1 ? 'Vitals · Wounded' : 'Vitals');

    // Vignette plus desaturation. The colour drain is the cue that survives a
    // red-blind player and a bright monitor, and it is affordable because it
    // only exists below half health — a full-screen backdrop filter is not
    // something to leave switched on for a whole run.
    const lowT = clamp((0.45 - f) / 0.45, 0, 1);
    S.lowPulse += dt * lerp(1.6, 3.4, lowT);
    const breathe = reduce ? 1 : 0.82 + Math.sin(S.lowPulse) * 0.18;
    css(E.lowhp, 'opacity', String(quant(lowT * breathe, 0.02)));
    css(E.lowhp, 'backdropFilter', lowT > 0.02 ? `saturate(${quant(1 - lowT * 0.7, 0.05)})` : '');

    // The hit flash is driven here rather than by the stylesheet's transition,
    // because a transition restarted by a fresh write every frame never resolves.
    S.dmgFlash *= Math.exp(-5.5 * dt);
    css(E.dmg, 'opacity', String(quant(Math.min(1, S.dmgFlash), 0.03)));
  }

  // ── compass ────────────────────────────────────────────────────────────────
  function updateCompass(dt, p) {
    if (!tape) return;
    // Heading smoothing has to go the short way round: without a wrap-aware
    // delta the tape unspools 360° every time the player crosses north.
    const want = norm360(-p.yaw * DEG);
    S.heading = norm360(S.heading + wrapDeg(want - S.heading) * (1 - Math.exp(-30 * dt)));
    css(tape, 'transform', `translateX(${quant(CO_C - S.heading * CO_PXDEG, 0.5)}px)`);

    // Contacts. Painting every enemy would hand the player a wallhack, so a pip
    // only appears for a hostile that has made itself known — alert, engaging,
    // or already bleeding — with a distance fallback for the AI build that does
    // not publish a state yet.
    let n = 0;
    const list = G.enemies;
    for (let i = 0; i < list.length && n < pips.length; i++) {
      const e = list[i];
      if (!e || e.alive === false || e.dead) continue;
      const ep = posOf(e);
      if (!ep) continue;
      const d = Math.hypot(ep.x - p.pos.x, ep.z - p.pos.z);
      if (d > 90) continue;
      const known = e.alert || e.aware || e.alerted || e.state === 'combat' || e.state === 'attack' ||
        (typeof e.hp === 'number' && typeof e.maxHp === 'number' && e.hp < e.maxHp) || d < 26;
      if (!known) continue;
      const rel = wrapDeg(bearingOf(p.pos, ep) - S.heading);
      if (Math.abs(rel) > CO_HALF) continue;
      const pip = pips[n++];
      css(pip.node, 'transform', `translateX(${quant(CO_C + rel * CO_PXDEG, 0.5)}px)`);
      css(pip.node, 'opacity', String(quant(clamp(1.05 - d / 110, 0.35, 1), 0.05)));
    }
    for (let i = n; i < pips.length; i++) css(pips[i].node, 'opacity', '0');

    const op = S.obj.pos;
    if (!op) { css(objPip, 'opacity', '0'); return; }
    const bear = norm360(bearingOf(p.pos, op));
    const rel = wrapDeg(bear - S.heading);
    const inView = Math.abs(rel) <= CO_HALF;
    css(objPip, 'opacity', inView ? '1' : '0');
    if (inView) css(objPip, 'transform', `translateX(${quant(CO_C + rel * CO_PXDEG, 0.5)}px)`);
    // Digits live in the objective block, where there is room for them; the tape
    // stays a picture. The key check keeps this from building a string a frame.
    const key = `${Math.round(bear)}|${Math.round(Math.hypot(op.x - p.pos.x, op.z - p.pos.z))}`;
    if (key !== S.objKey) {
      S.objKey = key;
      const [b, m] = key.split('|');
      txt(E.objText, `${S.obj.text} · ${pad3(b)}° ${m}m`);
    }
  }

  // ── directional damage ─────────────────────────────────────────────────────
  function updateDirs(dt, p) {
    for (let i = 0; i < dirs.length; i++) {
      const d = dirs[i];
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) { css(d.node, 'opacity', '0'); d.src = null; continue; }

      // Re-aimed every frame: the arc is a bearing, not a decal. Turning toward
      // the shooter has to walk it up to the top of the screen.
      if (d.src) {
        const a = quant(wrapDeg(bearingOf(p.pos, d.src) - norm360(-p.yaw * DEG)), 1);
        if (a !== d.ang) { d.ang = a; css(d.node, 'transform', `rotate(${a}deg)`); }
      }
      // Snap in over 70 ms, hold, then fade: long enough to turn on, short
      // enough not to litter the screen during a firefight.
      const age = d.max - d.life;
      const env = Math.min(age / 0.07, 1) * Math.min(1, (d.life / d.max) * 2.2);
      css(d.node, 'opacity', String(quant(clamp(env, 0, 1) * d.peak, 0.04)));
    }
  }

  // ── killfeed ───────────────────────────────────────────────────────────────
  function updateFeed(dt) {
    for (let i = S.feed.length - 1; i >= 0; i--) {
      const r = S.feed[i];
      r.life -= dt;
      if (r.life <= 0.4 && !r.out) { r.out = true; r.node.classList.add('out'); }
      if (r.life <= 0) { r.node.remove(); S.feed.splice(i, 1); }
    }
  }

  // ── debug overlay ──────────────────────────────────────────────────────────
  function updatePerf(dt, perf) {
    // Throttled to 5 Hz. A per-frame readout of a per-frame number is unreadable
    // anyway, and building the string is the most expensive thing the HUD does.
    S.perfT -= dt;
    if (S.perfT > 0) return;
    S.perfT = 0.2;

    const B = win.BLACKSITE;
    // renderer.info has autoReset off and is reset at the top of engine.render(),
    // so what is readable here is last frame's counts — which is what we want.
    const info = B && B.engine && B.engine.renderer && B.engine.renderer.info;
    const rend = info && info.render, mem = info && info.memory;
    const fx = B && B.fx;
    const parts = fx ? num(fx.count, num(fx.live, num(fx.particles && fx.particles.count, -1))) : -1;
    let alive = 0;
    for (let i = 0; i < G.enemies.length; i++) {
      const e = G.enemies[i];
      if (e && e.alive !== false && !e.dead) alive++;
    }
    const fps = perf ? num(perf.fps, 0) : 0;
    const ms = perf ? num(perf.smoothed, num(perf.ms, 0)) : 0;
    const p = G.player;

    txt(E.perf,
      `${fps.toFixed(0).padStart(3)} fps  ${ms.toFixed(2)} ms  tier ${G.settings.quality}\n` +
      `draw ${rend ? rend.calls : '—'}  tri ${rend ? fmtK(rend.triangles) : '—'}  ` +
      `prog ${info && info.programs ? info.programs.length : '—'}\n` +
      `tex ${mem ? mem.textures : '—'}  geo ${mem ? mem.geometries : '—'}  ` +
      `parts ${parts < 0 ? '—' : parts}\n` +
      `enemies ${alive}/${G.enemies.length}  steps ${G.time.steps}  frame ${G.time.frame}\n` +
      `pos ${p.pos.x.toFixed(1)} ${p.pos.y.toFixed(1)} ${p.pos.z.toFixed(1)}  ` +
      `hdg ${pad3(Math.round(S.heading))}  spd ${Math.hypot(p.vel.x, p.vel.z).toFixed(1)}`);
  }

  // ── events ─────────────────────────────────────────────────────────────────
  function handle(e) {
    switch (e.type) {
      case 'shot': return onShot(e);
      case 'damage': return onDamage(e);
      case 'kill': return onKill(e);
      case 'playerHurt': return onHurt(e);
      case 'playerDied': return onDied();
      case 'objective': case 'phase': return onObjective(e);
      case 'wave': return onWave(e);
      case 'pickup': case 'notice': case 'toast':
        return toast(e.text || e.message || nameOf(e.item, ''));
      default: return;
    }
  }

  function onShot(e) {
    void e;
    // Bloom scales with the weapon's own recoil figure, so a heavy weapon opens
    // the reticle further per shot without a per-weapon table living in the HUD.
    const w = G.weapons.slots[G.weapons.active];
    S.fireBloom = Math.min(3.2, S.fireBloom + 0.42 * clamp(num(w && w.recoil, 1), 0.4, 2.5));
    play(E.mag, [
      { transform: 'scale(1.16)', filter: 'brightness(1.7)' },
      { transform: 'scale(1)', filter: 'brightness(1)' },
    ], { duration: 110, easing: 'ease-out' }, reduce);
  }

  function onDamage(e) {
    // Only damage the player dealt draws a marker. Incoming damage arrives as
    // playerHurt and belongs on the other side of the screen entirely.
    if (isPlayer(e.target)) return;
    const head = isHead(e);
    hitmark(head ? 'head' : 'hit');
    if (numbersOn()) damageNumber(e, head);
  }

  function onKill(e) {
    hitmark('kill');
    feed(nameOf(e.actor, 'YOU'), nameOf(e.target, 'HOSTILE'), e.weapon, !!(e.headshot || isHead(e)));
  }

  function onHurt(e) {
    const amt = num(e.amount, 8);
    S.dmgFlash = Math.min(1, S.dmgFlash + clamp(amt / 42, 0.16, 0.9));
    play(E.hpNum, [{ transform: 'scale(1.14)' }, { transform: 'scale(1)' }],
      { duration: 150, easing: 'ease-out' }, reduce);

    // The arc needs a world position. Fall damage, gas and scripted hits have
    // none, and for those a full ring is the honest answer: something hurt you,
    // and inventing a direction would be a lie the player would act on.
    const src = posOf(e.source) || posOf(e.from) || posOf(e.attacker) || posOf(e.origin);
    const life = clamp(0.9 + amt / 60, 0.9, 1.8);

    // Fold into an arc already pointing the same way rather than stacking two a
    // few degrees apart, which just reads as one thick smear.
    if (src) {
      const bear = bearingOf(G.player.pos, src);
      for (const d of dirs) {
        if (d.life > 0 && d.src && Math.abs(wrapDeg(bearingOf(G.player.pos, d.src) - bear)) < 22) {
          d.src = src;
          d.max = d.life = Math.max(d.life, life);
          d.peak = Math.min(1, d.peak + 0.2);
          return;
        }
      }
    }
    let d = dirs[0];
    for (const c of dirs) if (c.life < d.life) d = c;
    if (!d) return;
    d.src = src || null;
    d.max = d.life = life;
    d.peak = clamp(0.55 + amt / 50, 0.55, 1);
    d.ang = 1e9;
    cls(d.node, 'omni', !src);
    if (!src) css(d.node, 'transform', 'rotate(0deg)');
  }

  function onDied() {
    S.dmgFlash = 1;
    for (const d of dirs) { d.life = 0; css(d.node, 'opacity', '0'); }
  }

  function onObjective(e) {
    const o = S.obj;
    o.title = String(e.title || e.name || o.title || 'Objective');
    o.text = String(e.text || e.desc || e.label || e.phase || o.text || '');
    o.pos = posOf(e.pos) || posOf(e.target) || o.pos;
    o.progress = num(e.progress, -1);
    S.objKey = '';
    txt(E.objTitle, o.title);
    if (!o.pos) txt(E.objText, o.text);
    css(objBar, 'opacity', o.progress >= 0 ? '1' : '0');
    css(objFill, 'transform', `scaleX(${quant(clamp(o.progress, 0, 1), 0.01)})`);
    play(E.objective, [{ opacity: 0, transform: 'translateX(-8px)' }, { opacity: 1, transform: 'none' }],
      { duration: 300, easing: 'cubic-bezier(.2,.9,.25,1)' }, reduce);
  }

  function onWave(e) {
    const n = num(e.wave, num(e.index, num(G.director.wave, 0)));
    toast(e.text || (n > 0 ? `Wave ${n}` : 'Contact'));
  }

  // ── event helpers ──────────────────────────────────────────────────────────
  function hitmark(kind) {
    if (!E.hitmark) return;
    attr(E.hitmark, 'class', 'k-' + kind);
    const big = kind === 'kill';
    play(E.hitmark, [
      { transform: `translate(-50%,-50%) scale(${big ? 0.5 : 0.62})`, opacity: 1 },
      { transform: `translate(-50%,-50%) scale(${big ? 1.3 : 1.06})`, opacity: 1, offset: 0.22 },
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 0 },
    ], { duration: big ? 420 : 300, easing: 'cubic-bezier(.15,.85,.3,1)' }, reduce);
  }

  function damageNumber(e, head) {
    const key = keyOf(e.target);
    const now = G.time.t;
    let slot = null;
    for (const s of numPool) if (s.key === key && now - s.t < 0.55) { slot = s; break; }
    const fresh = !slot;
    if (fresh) {
      slot = numPool[0];
      for (const s of numPool) if (s.t < slot.t) slot = s;
      slot.total = 0;
    }
    slot.key = key; slot.t = now;
    slot.total += num(e.amount, 0);
    txt(slot.node, String(Math.round(slot.total)));
    cls(slot.node, 'head', head);

    if (!fresh) {
      // An accumulating number is punched in place rather than respawned, so a
      // burst reads as one figure climbing.
      play(slot.node, [{ transform: slot.base + ' scale(1.22)' }, { transform: slot.base + ' scale(1)' }],
        { duration: 110, easing: 'ease-out' }, reduce);
      return;
    }

    // Anchored where the round landed, projected once. Re-projecting every frame
    // would pin the number to a corpse that is already ragdolling out of view.
    const world = posOf(e.point) || posOf(e.target);
    const cam = win.BLACKSITE && win.BLACKSITE.engine && win.BLACKSITE.engine.camera;
    let x = win.innerWidth * 0.5 + 30, y = win.innerHeight * 0.5 - 20;
    if (world && cam && project(cam, world, _p, win.innerWidth, win.innerHeight)) { x = _p.x; y = _p.y; }
    x = Math.round(x); y = Math.round(y);
    slot.base = `translate(${x}px,${y}px)`;
    if (slot.anim) { try { slot.anim.cancel(); } catch { /* already finished */ } }
    slot.anim = play(slot.node, [
      { transform: `translate(${x}px,${y}px) scale(.8)`, opacity: 0 },
      { transform: `translate(${x}px,${y - 6}px) scale(1)`, opacity: 1, offset: 0.14 },
      { transform: `translate(${x}px,${y - 34}px) scale(1)`, opacity: 0 },
    ], { duration: 780, easing: 'cubic-bezier(.1,.7,.3,1)' }, reduce);
  }

  function feed(actor, target, weapon, head) {
    if (!E.killfeed) return;
    const row = el(doc, 'div');
    const mark = el(doc, 'span', 'w', head ? '✖ HS' : '✖');
    if (weapon) mark.title = String(weapon);
    row.append(el(doc, 'span', 'a', String(actor).toUpperCase()), mark,
      el(doc, 'span', 'b', String(target).toUpperCase()));
    E.killfeed.appendChild(row);
    S.feed.push({ node: row, life: 5.5, out: false });
    while (S.feed.length > 5) S.feed.shift().node.remove();
  }

  function toast(text) {
    if (!E.toast || !text) return;
    txt(E.toast, String(text));
    const a = play(E.toast, [
      { opacity: 0, transform: 'translateX(-50%) translateY(8px)' },
      { opacity: 1, transform: 'translateX(-50%) translateY(0)', offset: 0.14 },
      { opacity: 1, transform: 'translateX(-50%) translateY(0)', offset: 0.8 },
      { opacity: 0, transform: 'translateX(-50%) translateY(-6px)' },
    ], { duration: 2200, easing: 'ease-out' }, reduce);
    // Without WAAPI the toast still has to appear and still has to leave, so the
    // frame loop takes it down instead.
    if (!a) { css(E.toast, 'opacity', '1'); S.toastT = 2.2; }
  }

  function numbersOn() {
    if (G.settings.dmgNumbers === undefined) G.settings.dmgNumbers = true;
    return !!G.settings.dmgNumbers;
  }

  return {
    update,
    handle,
    dispose() { doc.removeEventListener('keydown', onKey); },
  };
}

// ── small pure helpers ───────────────────────────────────────────────────────

function num(v, d) { return typeof v === 'number' && Number.isFinite(v) ? v : d; }
function norm360(d) { d %= 360; return d < 0 ? d + 360 : d; }
function pad3(n) { return String(n).padStart(3, '0'); }
function fmtK(n) { return n > 9999 ? (n / 1000).toFixed(0) + 'k' : String(n); }
function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

function isPlayer(t) {
  return t === 'player' || !!(t && (t.isPlayer || t.tag === 'player' || t.team === 0));
}

function isHead(e) {
  const p = e.part || e.hitbox || e.region;
  return !!(e.headshot || (typeof p === 'string' && p.toLowerCase() === 'head'));
}

let keySeq = 0;
function keyOf(t) {
  if (t == null) return 'x';
  if (typeof t !== 'object') return String(t);
  if (t.id != null) return 'i' + t.id;
  return t.__hudKey || (t.__hudKey = 'o' + (++keySeq));
}

function cinematic(G) {
  return !!(G.cinematic || G.cutscene || G.mode === 'cinematic' ||
    (G.director && (G.director.cinematic || G.director.phase === 'cinematic')));
}

// The live cone half-angle in degrees, or −1 if this weapon publishes none.
// `spreadDeg` is the flat mirror weapons.js maintains for exactly this purpose;
// the rest of the list is there so a weapon written to a different convention
// still drives the reticle instead of silently freezing it.
const SPREAD_KEYS = ['spreadDeg', 'spreadNow', 'spreadCur', 'curSpread', 'spreadLive'];
function spreadDeg(w) {
  if (!w) return -1;
  for (let i = 0; i < SPREAD_KEYS.length; i++) {
    const v = w[SPREAD_KEYS[i]];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  }
  return -1;
}

// −1 when not reloading, otherwise 0..1 complete. `reloadFrac` is the published
// figure; the fallback recomputes it for a weapon that only exposes the clock,
// and is careful that `reload` may be a table of phase timings rather than a
// duration.
function reloadProgress(w) {
  if (!w) return -1;
  const t = num(w.reloading, num(w.reloadT, 0));
  if (!(t > 0)) return -1;
  const f = num(w.reloadFrac, -1);
  if (f >= 0) return clamp(f, 0, 1);
  const total = num(w.reloadTime, num(w.reload, 0));
  if (!(total > 0)) return -1;
  return clamp(1 - t / total, 0, 1);
}

const DOT_IDS = /pistol|revolver|dmr|marksman|sniper|scout|magnum/i;
function wantsDot(w) {
  if (!w) return false;
  if (typeof w.dot === 'boolean') return w.dot;
  const id = String(w.id || '') + ' ' + String(w.name || '');
  if (/shotgun|pellet|smg/i.test(id)) return false;
  if (DOT_IDS.test(id)) return true;
  const m = String(w.mode || '');
  return m === 'semi' || m === 'bolt';
}

function arcPath(cx, cy, r, a0, a1) {
  if (a1 - a0 >= Math.PI * 2) a1 = a0 + Math.PI * 2 - 0.001;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${(cx + r * Math.cos(a0)).toFixed(2)} ${(cy + r * Math.sin(a0)).toFixed(2)}` +
    `A${r} ${r} 0 ${large} 1 ${(cx + r * Math.cos(a1)).toFixed(2)} ${(cy + r * Math.sin(a1)).toFixed(2)}`;
}

// One full turn of compass marks, offset into the tape's coordinate space.
function buildTape(doc, offset) {
  const g = svg(doc, 'g', { transform: `translate(${offset} 0)` });
  for (let d = 0; d < 360; d += 15) {
    const x = (d * CO_PXDEG).toFixed(1);
    const major = d % 45 === 0;
    g.appendChild(svg(doc, 'path', { class: major ? 'co-t co-major' : 'co-t', d: `M${x} ${major ? 8 : 11}V16` }));
    if (major) {
      const t = svg(doc, 'text', { class: 'co-lab', x, y: 26, 'text-anchor': 'middle' });
      t.textContent = CARDINALS[d / 45];
      g.appendChild(t);
    }
  }
  return g;
}

// ── styles ───────────────────────────────────────────────────────────────────
// Injected rather than added to index.html so this module stays self-contained.
// Every rule is scoped under #hud, and the ones that have to beat a rule already
// in the page carry the id twice to win on specificity rather than on !important.
const CSS = `
#hud .blk{opacity:0;transform:translateY(10px);
  transition:opacity .42s ease,transform .42s cubic-bezier(.2,.9,.25,1)}
#hud.in .blk{opacity:1;transform:none}
#hud.in #health{transition-delay:.04s}
#hud.in #killfeed{transition-delay:.08s}
#hud.in #objective{transition-delay:.12s}
#hud #compass{height:${CO_H}px;opacity:0;
  transform:translateX(-50%) translateY(-12px);
  transition:opacity .45s ease,transform .45s cubic-bezier(.2,.9,.25,1)}
#hud.in #compass{opacity:1;transform:translateX(-50%) translateY(0)}
#hud.cine{opacity:0!important}

/* Contrast without a panel: a wide dark stroke under a thin bright one, plus a
   drop shadow on the text. Legible on white sky and on black concrete alike. */
#hud #crosshair{width:${CH_SIZE}px;height:${CH_SIZE}px}
#hud .ch-sh{fill:none;stroke:rgba(0,0,0,.62);stroke-width:4.8;stroke-linecap:round}
#hud circle.ch-sh{fill:rgba(0,0,0,.62);stroke:none}
#hud .ch-tk{fill:none;stroke:rgba(238,245,252,.98);stroke-width:2.1;stroke-linecap:round}
#hud circle.ch-tk{fill:rgba(236,244,251,.98);stroke:none}
#hud .ch-rl{fill:none;stroke:var(--amber);stroke-width:2.2;stroke-linecap:round;opacity:0;
  filter:drop-shadow(0 0 2px rgba(0,0,0,.85))}

#hud #hitmark{width:40px;height:40px}
#hud #hitmark .hm-body{fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:square;
  filter:drop-shadow(0 0 2px rgba(0,0,0,.95))}
#hud #hitmark .hm-ring{fill:none;stroke:#fff;stroke-width:1.4;opacity:0;
  filter:drop-shadow(0 0 2px rgba(0,0,0,.95))}
#hud #hitmark .hm-pip{fill:#fff;opacity:0}
#hud #hitmark.k-head .hm-body,#hud #hitmark.k-head .hm-ring{stroke:var(--amber)}
#hud #hitmark.k-head .hm-ring{opacity:1}
#hud #hitmark.k-kill .hm-body{stroke:var(--bad);stroke-width:3.4}
#hud #hitmark.k-kill .hm-pip{fill:var(--bad);opacity:1}

/* Driven per frame from JS, so the page's transition would only add lag. */
#hud #dmg{transition:none}
#hud #lowhp{transition:backdrop-filter .5s linear}
#hud #dmgdir i{will-change:transform,opacity}
#hud #dmgdir i.omni{background:conic-gradient(rgba(255,60,40,.5),rgba(255,60,40,.5))}

#hud .dmgnum{position:absolute;inset:0;overflow:hidden}
#hud .dmgnum .dn{position:absolute;left:0;top:0;font-size:15px;font-weight:600;
  letter-spacing:.05em;color:rgba(240,246,252,.96);opacity:0;
  text-shadow:0 1px 3px rgba(0,0,0,.95);will-change:transform,opacity}
#hud .dmgnum .dn.head{color:var(--amber);font-size:18px}
#hud .dmgnum .dn.head::after{content:'\\00a0\\25B2';font-size:9px;vertical-align:.28em}

#hud .co-t{stroke:rgba(208,220,232,.6);stroke-width:1.3}
#hud .co-major{stroke:rgba(238,245,252,.95);stroke-width:1.8}
#hud .co-lab{fill:rgba(232,240,247,.92);font:600 11px var(--ui);letter-spacing:.1em}
#hud .co-index{fill:var(--amber)}
#hud .co-pip{fill:var(--bad)}
#hud .co-obj{fill:var(--amber)}
#hud .co-tape{will-change:transform}
#hud #compass{filter:drop-shadow(0 1px 3px rgba(0,0,0,.85))}

#hud #ammo .mag{display:inline-block;will-change:transform}
#hud #ammo .tag{font-size:10px;letter-spacing:.3em;text-transform:uppercase;
  color:#8d9caa;margin-top:5px;opacity:0;transition:opacity .2s}
#hud #ammo .tag.bad{color:var(--bad)}
#hud #ammo .tag.pulse{animation:bs-pulse 1.05s ease-in-out infinite}
#hud #ammo .rl{margin:7px 0 0 auto;width:96px;height:2px;
  background:rgba(255,255,255,.12);opacity:0;transition:opacity .15s}
#hud #ammo .rl i{display:block;height:100%;background:var(--amber);
  transform-origin:right;transform:scaleX(0)}
@keyframes bs-pulse{0%,100%{opacity:1}50%{opacity:.25}}

#hud #health .bar{position:relative}
#hud #health .bar i{position:absolute;inset:0;width:100%;transition:background .3s}
#hud #health .bar i.ghost{background:rgba(255,77,61,.62)}
#hud #health .num{display:inline-block;will-change:transform}
#hud #health.warn .bar i:not(.ghost){background:var(--amber)}
#hud #health.crit .bar i:not(.ghost){background:var(--bad)}
#hud #health.crit .num{color:var(--bad)}

#hud #objective .obar{margin-top:8px;width:150px;height:2px;
  background:rgba(255,255,255,.12);opacity:0;transition:opacity .2s}
#hud #objective .obar i{display:block;height:100%;background:var(--amber);
  transform-origin:left;transform:scaleX(0)}

#hud #killfeed div{display:flex;justify-content:flex-end;gap:9px;align-items:baseline}
#hud #killfeed .a{color:var(--hud)}
#hud #killfeed .w{color:var(--amber);letter-spacing:.14em;font-size:10.5px}
#hud #killfeed .b{color:#9fb0bd}
#hud #killfeed div.out{animation:bs-feed-out .4s forwards}
@keyframes bs-feed-out{to{opacity:0;transform:translateX(14px)}}

#hud #objective{max-width:min(34ch,30vw)}
#hud #objective span{display:block;line-height:1.55;color:rgba(226,235,243,.86)}
#hud #ammo,#hud #health,#hud #objective,#hud #killfeed,#hud #toast{
  text-shadow:0 1px 4px rgba(0,0,0,.85),0 0 12px rgba(0,0,0,.45)}

#perf{background:rgba(6,8,10,.6);padding:6px 9px;border-left:1px solid var(--amber-dim);
  color:#9fb0bd;font-size:10.5px;letter-spacing:.02em;z-index:40}

@media (prefers-reduced-motion:reduce){
  #hud .blk,#hud #compass,#hud #lowhp{transition:none}
  #hud #killfeed div.out{animation:none;opacity:0}
  #hud #ammo .tag.pulse{animation:none}
}
`;
