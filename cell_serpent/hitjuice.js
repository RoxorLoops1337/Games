// 04-hit-juice (round 2): golden upgrade orbs that fly to the upgrade counter, bomb debris and smoke,
// capsule muzzle flash and note trails. Own small pools with hard caps. Render-only: never touches the sim.
import { pointAt, pointInto, W } from './sim.js';
const PT1 = { x: 0, y: 0 }, PT2 = { x: 0, y: 0 };   // perf r10: scratch points for the dash telegraph (no object per path lookup per frame)
import { drawMark9, isNewKind, CHIP_COL } from './hit_juice9.js';
import { CRIT_FEEL, FINISH_FEEL, CRIT_GAP, CLASS_CAP, classOf, sparkCol, CASCADE_DUR, drawCascade } from './hit_juice10.js';
import { drawMark11, isKind11, numMotion } from './hit_fx_b11.js';
import { createMoments, rungOf, drawSpeciesDeath, drawMuzzle, DEATH_DUR } from './hit_juice8.js';
const TAU = Math.PI * 2;
export const UP_X = 42, UP_Y = 40, CHIP_X = 600;   // CHIP_X: the RAGE and SHIELD chips (hud.js) sit at the right edge
const H = 1280;   // the upgrade counter in the HUD (hud.js)

export function createHitJuice({ ctx, S, OPT, glow, ring, burst, shaped, text, blit, sprite, sound, feel }) {
  const powers = [], chipfly = [], orbs = [], smoke = [], trail = [], flashes = [], marks = [];
  const lastKill = { x: 0, y: 0, t: -9, n: 0 };   // for the chain links
  const lastHit = { x: 0, y: 0, t: -9, src: '' };   // the latest hit, so a kill can pop in the style of the weapon that landed it
  let cls = '', skinNow = '', critFeelT = -9, finishFeelT = -9;   // round 10: the mark class of the event being handled, the skin of the snake it hit
  const casc = { t: 9, col: '#ffe14a', seed: 0 };   // the full chain clear cascade
  const lastSrc = {};   // per weapon: time of its last impact mark, so a busy fight does not drown in them
  const CHAIN_COL = ['#ffffff', '#9dff6d', '#6fe3ff', '#ffd84d', '#ff9ad6', '#ff6a3d'];
  const POW_COL = { heal: '#ff6a8a', shield: '#39d0ff', rage: '#ffb020' };
  const DARK = { swab: '#8a2a62', daggers: '#2a4f78', tower: '#7a3a0c', stick: '#6a5a00', needles: '#0e5a6a', satellite: '#2a3a8a', maw: '#4a2a8a', puppy: '#7a4a10', encore: '#7a6a00' };
  const TINT = { swab: '#ffd0ea', daggers: '#e8f4ff', tower: '#ffc98a', stick: '#fff08a', needles: '#a8f0ff', satellite: '#b6c8ff', maw: '#d9b2ff', puppy: '#ffe0b0', encore: '#fff2a0' };
  const tint = src => TINT[src] || null;
  function mark(m) { if (marks.length < cap(28)) marks.push(m); }
  // pooled event objects: one fixed shape, recycled through a free list, so a busy fight allocates nothing per hit
  const mfree = [], tfree = [], dud = { k: '', x: 0, y: 0, x1: 0, y1: 0, r: 0, n: 0, rot: 0, t: 0, dur: 1, col: '#fff', w: 0, vx: 0, vy: 0, gold: 0, inv: 0, seed: 0, wk: '', pool: 0, cl: '' };
  function M(k, x, y, r, dur, force) {
    if (marks.length >= (force ? 44 : cap(40))) return dud;   // round 10: the shared total is wider, the class budgets below do the fairness
    if (!force && room(classOf(k, cls)) <= 0) return dud;   // round 10: every class has its own budget, a chain burst cannot starve the kill pops
    const m = mfree.pop() || { k: '', x: 0, y: 0, x1: 0, y1: 0, r: 0, n: 0, rot: 0, t: 0, dur: 1, col: '#fff', w: 0, vx: 0, vy: 0, gold: 0, inv: 0, seed: 0, wk: '', pool: 1, cl: '' };
    m.k = k; m.x = x; m.y = y; m.r = r; m.dur = dur; m.t = 0; m.x1 = 0; m.y1 = 0; m.n = 0; m.rot = 0; m.col = '#fff'; m.w = 0; m.vx = 0; m.vy = 0; m.gold = 0; m.inv = 0; m.seed = 0; m.wk = ''; m.cl = classOf(k, cls);
    marks.push(m); return m;
  }
  function room(c) { let n = 0; for (let i = 0; i < marks.length; i++) if (marks[i].cl === c) n++; return cap(CLASS_CAP[c] || 8) - n; }
  const P = (k, x, y, r, dur, col, rot) => { const m = M(k, x, y, r, dur); m.col = col; m.rot = rot || 0; return m; };
  function tpush(x, y, vx, vy, life, s2, n, col) {   // a trail dot from the pool
    if (trail.length >= cap(56)) return;
    const q = tfree.pop() || { x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 0, s: 0, n: false, col: '#9fefff' };
    q.x = x; q.y = y; q.vx = vx; q.vy = vy; q.life = life; q.max = life; q.s = s2; q.n = n; q.col = col || '#9fefff'; trail.push(q);
  }
  let critN = 0, critT = -9;   // crits in a row (each within 1.6s of the last) decide how loud the next crit badge is
  const critTier = () => (critN >= 5 ? 3 : critN >= 3 ? 2 : critN >= 2 ? 1 : 0);
  const FIN_NAME = { capsule: 'NOTE', swab: 'SWAB', daggers: 'DAGGER', tower: 'TOWER', stick: 'STICK', needles: 'NEEDLE', satellite: 'ORBIT', maw: 'MAW', puppy: 'PUPPY', encore: 'ENCORE' };
  S.land = S.land || { coin: -9, up: -9 }; S.land.rage = S.land.rage || -9; S.land.shield = S.land.shield || -9;
  const calm = () => OPT.reduceMotion;
  const cap = n => (OPT.lowQuality ? n >> 1 : n);

  // round 8: sounds and the best-moment tally run even with reduce motion on (they are not motion)
  const MOM = createMoments(); let gRef = null, cN2 = 0, cT2 = -9, sndN = 0, sndT = -9, sndHit = '', sndHitT = -9;
  function sounds(e, g) {
    if (g !== gRef) { gRef = g; MOM.reset(); sndN = 0; sndT = -9; }
    if (e.t === 'hit') { sndHit = e.src || ''; sndHitT = S.t; if (e.crit) { cN2 = S.t - cT2 < 1.6 ? cN2 + 1 : 1; cT2 = S.t; MOM.crit(cN2 - 1); } return; }
    if (e.t !== 'kill') return;
    const n = S.t - sndT < 0.9 ? sndN + 1 : 1; sndN = n; sndT = S.t; MOM.chain(n);
    if (n >= 2 && sound) sound('rung' + rungOf(n));
    if (e.head) {
      const src = S.t - sndHitT < 0.12 && sndHit ? sndHit : 'capsule'; MOM.finished(src, S.t);
      if (sound) { sound('fin_' + src); sound('death_' + (e.skin || 'love')); }
    }
  }
  function event(e, g) {
    sounds(e, g);
    if (calm()) return;
    cls = e.t === 'kill' ? 'pop' : e.t === 'hit' ? 'hit' : '';
    if (e.t === 'clear') { casc.t = 0; casc.seed = (S.t * 13) | 0; casc.col = e.boss ? '#ff9ad6' : '#ffe14a'; }
    switch (e.t) {
      case 'hit': if (e.crit) { critN = S.t - critT < 1.6 ? critN + 1 : 1; critT = S.t; } lastHit.x = e.x; lastHit.y = e.y; lastHit.t = S.t; lastHit.src = e.src || ''; S.hitPulse = S.t; skinNow = skinOf(e, g); impact(e); if (e.s && e.s.kind === 'armor' && !(e.s.hp <= 0)) { const q = P('clank', e.x, e.y, 30 * (e.crit ? 1.4 : 1), 0.26, '#fff', Math.random() * 3); q.seed = Math.random() * 6; } if (e.crit) critFeel(e); break;
      case 'kill': {
        // a white flash disc and a starburst of rays where the cell was; heads get a bigger one
        const R = (e.r || 26) * (e.head ? 2.6 : 1.7);
        M('flash', e.x, e.y, R, e.head ? 0.3 : 0.2);
        { const m = M('rays', e.x, e.y, R * 1.5, e.head ? 0.34 : 0.24); m.n = e.head ? 10 : 6; m.rot = Math.random() * TAU; }
        const mine = S.t - lastHit.t < 0.12 && Math.abs(lastHit.x - e.x) < 90 && Math.abs(lastHit.y - e.y) < 90;
        if (mine) killPop(lastHit.src, e.x, e.y, R);
        if (e.head) { finish(mine ? lastHit.src : 'capsule', e); { const m = M('sdeath', e.x, e.y, 0, DEATH_DUR, true); m.wk = e.skin || 'love'; m.seed = Math.random() * 6; } }
        // kill chain: a glowing link from the previous kill and a note that climbs with the pitch ladder
        { const n = S.t - lastKill.t < 0.9 ? lastKill.n + 1 : 1, col = CHAIN_COL[Math.min(5, n >> 1)];
          if (n >= 5 && n % 5 === 0) { const q = M('shock', e.x, e.y, 200 + Math.min(n, 30) * 8, 0.55, true); q.col = col; q.rot = Math.random() * TAU; }   // round 9: a milestone shockwave
          if (n >= 2) { const l = M('link', lastKill.x, lastKill.y, 0, 0.3); l.x1 = e.x; l.y1 = e.y; l.col = col; l.w = 3 + Math.min(n, 12) * 0.4;
            const q = M('note', e.x + 20, e.y - 6, 11 + Math.min(n, 14), 0.55); q.col = col; q.vy = -70 - Math.min(n, 14) * 6; q.vx = (n & 1 ? 1 : -1) * 18; }
          lastKill.x = e.x; lastKill.y = e.y; lastKill.t = S.t; lastKill.n = n; }
        if (e.kind === 'armor') { const q = M('plates', e.x, e.y, (e.r || 26) * 1.2, 0.75); q.seed = Math.random() * 6; }   // round 11: the armor falls apart in steel plates
        if (e.kind === 'upgrade') {   // the yellow cell pops hard: gold rays, a fat ring and a UP badge that rises
          mark({ k: 'rays', x: e.x, y: e.y, r: 170, n: 12, rot: 0.2, t: 0, dur: 0.5, gold: 1 });
          if (S.floats.length < 56) S.floats.push({ x: e.x, y: e.y - 36, str: 'UPGRADE!', acc: 0, key: 'badge', col: '#ffe14a', size: 26, vy: -46, life: 1.0, max: 1.0, pop: 1 });
        }
        break;
      }
    }
    switch (e.t) {
      case 'kill':
        if (e.kind === 'upgrade' && orbs.length < 6)
          orbs.push({ x0: e.x, y0: e.y, cx: e.x + (e.x < 360 ? 90 : -90), cy: Math.max(e.y, 260) + 60, t: 0, dur: 0.75, lastTrail: 0 });
        break;
      case 'power':   // the power-up hops up out of the pile and flies into the duo
        if (powers.length < 4 && sprite) powers.push({ x0: e.x, y0: e.y, kind: e.kind, p: g.p, t: 0, dur: 0.42, lastTrail: 0 });
        break;
      case 'chest': chestJuice(e); break;
      case 'goldpop': M('goldburst', e.x, e.y, 54, 0.85, true); break;   // round 11: a fan of spinning coins
      case 'boom': {
        const x = e.x, y = e.y, R = e.r || 150;
        bombJuice(x, y, R);
        { const q = M('blast', x, y, R * 1.1, 0.5, true); q.seed = Math.random() * 6; if (feel) feel(x, y, 0.028, 0.7, 0.1); }   // round 11: a cracked scorch ring and a small thud
        ring(x, y, R * 1.15, '#fff2c8', 0.35);
        ring(x, y, R * 0.8, '#ff9a3d', 0.55);
        shaped(x, y, 12, 'c', ['#3a2a2a', '#6b4a3a', '#ff9a3d', '#ffd24a'], 520, 1.0, 9, 900);
        for (let i = 0; i < 7 && smoke.length < cap(14); i++) {
          const a = Math.random() * TAU, d = Math.random() * R * 0.45;
          smoke.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: Math.cos(a) * 30, vy: -40 - Math.random() * 50, r: 34 + Math.random() * 24, life: 1.0 + Math.random() * 0.5, max: 1.5, dark: Math.random() < 0.5 });
        }
        S.rings.push({ x, y, r: R * 1.3, life: 0.4, max: 0.4, col: '#ffb347', glow: true });
        break;
      }
      case 'swab': case 'dragon': case 'needles': case 'bubble': { const m = M('muz', g.p.x, g.p.y - 44, 0, e.t === 'needles' ? 0.2 : 0.34); m.wk = e.t; break; }   // a muzzle flash in the weapon's own look
      case 'shoot': {
        const p = g.p;
        if (flashes.length < 4) flashes.push({ x: p.x, y: p.y - 40, t: 0, dur: 0.12 });
        for (let i = 0; i < 3; i++) tpush(p.x + (Math.random() - 0.5) * 30, p.y - 44, (Math.random() - 0.5) * 120, -60 - Math.random() * 80, 0.35, 3 + Math.random() * 2, false);
        break;
      }
    }
  }

  // kill pop variety: the weapon that landed the last hit also decides how the cell bursts
  function killPop(src, x, y, R) {
    switch (src) {
      case 'swab': for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + Math.random(), m = P('puff', x, y, 13, 0.5, i & 1 ? '#fff' : '#ffc4e4'); m.vx = Math.cos(a) * 120; m.vy = Math.sin(a) * 120 - 20; } break;
      case 'daggers': { const a = -0.8 + (Math.random() - 0.5) * 0.4; P('slash', x, y, R * 1.3, 0.22, '#eaf6ff', a); P('slash', x, y, R * 1.3, 0.22, '#eaf6ff', a + 1.6); break; }
      case 'tower': P('ring', x, y, R * 1.5, 0.34, '#ffb15a'); P('ring', x, y, R * 0.95, 0.26, '#fff2c8'); break;
      case 'stick': for (let i = 0; i < 3; i++) { const m = P('zap', x, y, R * 0.9, 0.2, i & 1 ? '#fff' : '#fff08a', i * 1.05 + Math.random() * 0.5); m.seed = Math.random() * 9; } break;
      case 'needles': for (let i = 0; i < 8; i++) P('ping', x, y, 30, 0.24, '#a8f0ff', i / 8 * TAU); break;
      case 'satellite': P('ring', x, y, R * 1.4, 0.3, '#9db4ff'); P('ring', x, y, R * 0.8, 0.38, '#fff'); break;
      case 'maw': P('ring', x, y, R * 1.7, 0.38, '#c79bff').inv = 1; P('ring', x, y, R * 1.1, 0.3, '#e8d4ff').inv = 1; break;
      // round 9: the weapons that had no pop of their own
      case 'dragon': for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + Math.random(), m = P('feather', x, y, 11 + (i & 1) * 4, 0.9, '#fff', a); m.vx = Math.cos(a) * 95; m.vy = Math.sin(a) * 80 - 70; m.seed = Math.random() * 6; } break;
      case 'bubble': P('bpop', x, y, R * 1.25, 0.42, '#fff').seed = Math.random() * 6; for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + 0.6, q = P('bpop', x + Math.cos(a) * R * 0.8, y + Math.sin(a) * R * 0.8, R * 0.4, 0.36, '#fff'); q.seed = i; } break;
      case 'puppy': P('paw', x, y, R * 0.9, 0.7, '#ffe0b0', (Math.random() - 0.5) * 0.7); break;
      case 'bell': P('ding', x, y, R * 1.6, 0.5, '#ffd9a0'); for (let i = 0; i < 3; i++) { const m = P('twink', x, y, 9, 0.6, '#ffd9a0', i); m.vx = (i - 1) * 40; m.vy = -50 - i * 8; } break;
      case 'encore': for (let i = 0; i < 5; i++) { const m = P('twink', x + (i - 2) * 14, y, 11, 0.7, '#ffe14a', i); m.vx = (i - 2) * 26; m.vy = -80 - (i & 1) * 30; } break;
      default: for (let i = 0; i < 2; i++) { const m = M('note', x + (i ? 14 : -14), y, 13, 0.55); m.col = i ? '#ffd23a' : '#ff8a1a'; m.vy = -75; m.vx = (i ? 1 : -1) * 34; } break;   // the capsule: two notes hop out
    }
  }

  // the finishing blow: the snake head fell, so a badge in the silhouette and colours of the weapon that landed it pops up
  function finish(src, e) {
    const m = M('finish', Math.max(120, Math.min(600, e.x)), Math.max(190, e.y - 70), 36, 1.25, true); m.wk = CRIT_COL[src] ? src : 'capsule'; m.rot = (Math.random() - 0.5) * 0.16;
    finishFeelT = S.t;
    if (feel) { const f = FINISH_FEEL[m.wk] || FINISH_FEEL.capsule; feel(e.x, e.y, f[0], f[1], f[2]); }
    M('rays', e.x, e.y, 230, 0.5, true).gold = 1;
    const ring2 = M('ring', e.x, e.y, 210, 0.5, true); ring2.col = CRIT_COL[m.wk][0];
  }

  // a chest opens: a beam of light, a fountain of coins and gold rays
  function chestJuice(e) {
    M('beam', e.x, e.y, 70, 0.7, true);
    { const m = M('rays', e.x, e.y, 190, 0.45, true); m.n = 10; m.gold = 1; m.rot = 0.3; }
    P('ring', e.x, e.y, 120, 0.4, '#fff2a8');
    for (let i = 0; i < 9; i++) { const m = M('chunk', e.x, e.y, 7 + (i & 1) * 2, 0.9 + Math.random() * 0.3, true); m.gold = 1; m.vx = (i - 4) * 36 + (Math.random() - 0.5) * 20; m.vy = -380 - Math.random() * 160; m.seed = 900; m.col = '#ffd84d'; }
  }

  // a bomb goes off: a scorch smudge that lingers, flying embers and a BOOM tag
  function bombJuice(x, y, R) {
    M('scorch', x, y, R * 0.75, 1.3, true).seed = Math.random() * 6;
    for (let i = 0; i < 10; i++) { const a = Math.random() * TAU, v = 220 + Math.random() * 260, m = M('chunk', x, y, 5 + Math.random() * 5, 0.7 + Math.random() * 0.4, true); m.vx = Math.cos(a) * v; m.vy = Math.sin(a) * v - 200; m.seed = 760; m.col = i & 1 ? '#ff9a3d' : '#ffd24a'; }
    M('boomtxt', Math.max(110, Math.min(610, x)), Math.max(200, y - R * 0.5), 34, 0.8, true);
  }

  // a small mark per weapon where it lands: cotton puffs, slash lines, zaps, pings, rings
  function skinOf(e, g) { if (!g || !g.snakes) return g && g.skin || ''; for (let i = 0; i < g.snakes.length; i++) { const sn = g.snakes[i]; if (e.s && sn.segs && sn.segs.indexOf(e.s) >= 0) return sn.skin || g.skin || ''; } return g.skin || ''; }
  // a crit lands with the weapon's own weight: a short slow-mo and a tiny zoom around the cell
  function critFeel(e) {
    if (!feel || S.t - critFeelT < CRIT_GAP || S.t - finishFeelT < 0.55) return;   // r11: a light crit never cuts a finishing slow-mo short
    const f = CRIT_FEEL[e.src || 'capsule'] || CRIT_FEEL.capsule; critFeelT = S.t;
    feel(e.x, e.y, f[0] * (1 + 0.15 * Math.min(3, critTier())), f[1], f[2]);
  }
  function impact(e) {
    const src = e.src || 'capsule';
    if (S.t - (lastSrc[src] || -9) < (src === 'capsule' ? 0.05 : 0.09) && !e.crit) return;
    lastSrc[src] = S.t;
    const x = e.x, y = e.y, big = e.crit ? 1.5 : 1;
    switch (src) {
      case 'swab': for (let i = 0; i < 4; i++) { const m = P('puff', x + (Math.random() - 0.5) * 26, y + (Math.random() - 0.5) * 20, 9 * big, 0.38, i & 1 ? '#fff' : '#ffc4e4'); m.vx = (Math.random() - 0.5) * 60; m.vy = -30 - Math.random() * 30; } break;
      case 'daggers': P('slash', x, y, 40 * big, 0.17, '#eaf6ff', -0.9 + (Math.random() - 0.5) * 0.5); break;
      case 'tower': P('ring', x, y, 54 * big, 0.26, '#ffb15a'); M('flash', x, y, 26 * big, 0.14); break;
      case 'stick': P('zap', x, y, 34 * big, 0.16, '#fff08a', Math.random() * TAU).seed = Math.random() * 9; break;
      case 'needles': for (let i = 0; i < 3; i++) P('ping', x, y, 22 * big, 0.18, '#a8f0ff', -Math.PI / 2 + (i - 1) * 0.7); break;
      case 'satellite': P('ring', x, y, 38 * big, 0.24, '#9db4ff'); break;
      case 'maw': P('ring', x, y, 46 * big, 0.3, '#c79bff'); break;
      case 'dragon': for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + (i - 1) * 0.9 + (Math.random() - 0.5) * 0.4, m = P('feather', x, y, 13 * big, 0.6, '#fff', a); m.vx = Math.cos(a) * 70; m.vy = Math.sin(a) * 60; m.seed = Math.random() * 6; } break;
      case 'bubble': P('bpop', x, y, 48 * big, 0.34, '#fff').seed = Math.random() * 6; break;
      case 'puppy': P('paw', x, y, 30 * big, 0.55, '#ffe0b0', (Math.random() - 0.5) * 0.8); break;
      case 'bell': P('ding', x, y, 58 * big, 0.38, '#ffd9a0'); break;
      case 'encore': { const m = P('twink', x + (Math.random() - 0.5) * 24, y, 24 * big, 0.5, '#ffe14a', Math.random() * 3); m.vy = -50; break; }
      default: { const m = P('pow', x, y, e.crit ? 34 : 20, e.crit ? 0.22 : 0.14, e.crit ? '#ffe14a' : '#ffffff', Math.random() * TAU); m.n = e.crit ? 8 : 4; }
    }
    // round 9: every hit knocks a couple of chips off the cell in the weapon's colour (more on a crit)
    // round 10: every other chip is the colour of the snake that was hit, so the cell visibly breaks
    for (let i = 0, n = room('chip') > 0 ? (e.crit ? 4 : 2) : 0; i < n; i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, v = 90 + Math.random() * 120, m = P('chip', x, y, 5 + Math.random() * 2.4, 0.5, i & 1 ? sparkCol(skinNow, i >> 1) : CHIP_COL[src] || '#ffd23a', Math.random() * TAU); m.vx = Math.cos(a) * v; m.vy = Math.sin(a) * v - 60; m.seed = Math.random() * 6; }
  }

  // the finishing blow badge: the weapon's own crit silhouette, a pop, a hold, a lift; its name above a big FINISH
  function drawFinish(m, k, a) {
    const pop = k < 0.14 ? 0.3 + 1.0 * (k / 0.14) : k < 0.26 ? 1.3 - 0.3 * ((k - 0.14) / 0.12) : 1, R = 66 * pop, fade = Math.min(1, a * 3), cs = CRIT_COL[m.wk] || CRIT_COL.capsule;
    ctx.translate(0, -k * 26); ctx.rotate(m.rot); ctx.globalAlpha = 0.95 * fade;
    ctx.fillStyle = '#10131c'; critPath(m.wk, R * 1.12, 1); ctx.fill();
    ctx.fillStyle = cs[0]; critPath(m.wk, R, 1); ctx.fill();
    ctx.fillStyle = cs[1]; critPath(m.wk, R * 0.8, 1); ctx.fill();
    ctx.globalAlpha = fade; ctx.rotate(m.rot * -0.5);
    const pw = R * 1.75, ph = R * 0.98;   // a plate keeps the words readable whatever the silhouette is
    ctx.fillStyle = 'rgba(16,19,28,.88)'; ctx.strokeStyle = cs[1]; ctx.lineWidth = 3; ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-pw / 2, -ph / 2 - 2, pw, ph, ph * 0.3); else ctx.rect(-pw / 2, -ph / 2 - 2, pw, ph);
    ctx.fill(); ctx.stroke();
    text(FIN_NAME[m.wk] || 'NOTE', 0, -R * 0.24, Math.round(R * 0.27 / 2) * 2, cs[1], '#10131c');
    text('FINISH!', 0, R * 0.14, Math.round(R * 0.42 / 2) * 2, '#fff', '#a8330a');
  }

  // the kill-chain pitch ladder: a little staff on the right edge, one rung per step of the rising kill notes
  const LAD_X = 666, LAD_Y = 900, LAD_STEP = 30;
  function drawLadder() {
    const n = lastKill.n, age = S.t - lastKill.t;
    if (n < 2 || age > 1.15) return;
    const fade = Math.min(1, (1.15 - age) * 3.4) * Math.min(1, (n - 1) * 0.8), step = (n - 1) % 8, oct = (n - 1) >> 3, col = CHAIN_COL[Math.min(5, n >> 1)], hop = Math.max(0, 1 - age / 0.18);
    ctx.save(); ctx.globalAlpha = fade * 0.9; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(16,19,28,.6)'; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(LAD_X, LAD_Y + 12); ctx.lineTo(LAD_X, LAD_Y - 7 * LAD_STEP - 12); ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const y = LAD_Y - i * LAD_STEP, on = i <= step;
      ctx.strokeStyle = on ? col : 'rgba(255,255,255,.28)'; ctx.lineWidth = on ? 5 : 3; ctx.beginPath(); ctx.moveTo(LAD_X - 20, y); ctx.lineTo(LAD_X + 20, y); ctx.stroke();
    }
    const hy = LAD_Y - step * LAD_STEP - hop * 8, s = 1 + hop * 0.5;
    glow(LAD_X, hy, 36 * s, col, 0.7 * fade); ctx.globalAlpha = fade;
    ctx.fillStyle = '#10131c'; ctx.beginPath(); ctx.ellipse(LAD_X, hy, 14 * s + 3, 10 * s + 3, -0.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(LAD_X, hy, 14 * s, 10 * s, -0.4, 0, TAU); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(LAD_X, hy, 8 * s, 5.5 * s, -0.4, 0, TAU); ctx.fill();
    if (oct > 0) text('+' + oct + (' oct'), LAD_X - 4, LAD_Y + 34, 18, '#fff', '#10131c');
    ctx.restore();
  }

  function drawMarks(dt) {
    for (let i = marks.length - 1; i >= 0; i--) {
      const m = marks[i]; m.t += dt; if (m.t >= m.dur) { marks[i] = marks[marks.length - 1]; marks.pop(); if (m.pool) mfree.push(m); continue; }
      const k = m.t / m.dur, a = 1 - k;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(m.x, m.y);
      if (isNewKind(m.k)) { drawMark9(ctx, m, k, a, glow); ctx.restore(); continue; }
      if (isKind11(m.k)) { drawMark11(ctx, m, k, a, glow); ctx.restore(); continue; }
      switch (m.k) {
        case 'flash': glow(0, 0, m.r * (0.7 + k * 0.6), '#fff', 0.9 * a); ctx.fillStyle = '#fff'; ctx.globalAlpha = a * a; ctx.beginPath(); ctx.arc(0, 0, m.r * 0.35 * (1 - k * 0.5), 0, TAU); ctx.fill(); break;
        case 'link': { ctx.translate(-m.x, -m.y); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.strokeStyle = m.col; ctx.lineWidth = m.w * (0.5 + a); ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x1, m.y1); ctx.stroke(); ctx.globalAlpha = a * a; ctx.strokeStyle = '#fff'; ctx.lineWidth = m.w * 0.35; ctx.stroke(); break; }
        case 'note': { ctx.translate((m.vx || 0) * m.t, (m.vy || 0) * m.t); ctx.rotate(Math.sin(m.t * 9) * 0.25); const s = m.r; ctx.fillStyle = '#10131c'; ctx.strokeStyle = '#10131c'; ctx.lineWidth = 3;
          for (let pass = 0; pass < 2; pass++) { if (pass) { ctx.fillStyle = m.col; } ctx.beginPath(); ctx.ellipse(0, s * 0.5, s * 0.5, s * 0.36, -0.4, 0, TAU); if (!pass) ctx.stroke(); ctx.fill(); ctx.beginPath(); ctx.rect(s * 0.26, -s * 0.9, s * 0.2, s * 1.4); ctx.rect(s * 0.26, -s * 0.9, s * 0.7, s * 0.3); if (!pass) ctx.stroke(); ctx.fill(); }
          break; }
        case 'rays': { ctx.rotate(m.rot); ctx.fillStyle = m.gold ? '#ffe27a' : '#fff6c8'; const r0 = m.r * 0.25 + k * m.r * 0.35, r1 = m.r * (0.55 + k * 0.45);
          for (let j = 0; j < m.n; j++) { ctx.rotate(TAU / m.n); ctx.beginPath(); ctx.moveTo(r0, -2.4 * a - 0.6); ctx.lineTo(r1, 0); ctx.lineTo(r0, 2.4 * a + 0.6); ctx.closePath(); ctx.fill(); } break; }
        case 'pow': { ctx.rotate(m.rot); ctx.fillStyle = m.col; const r1 = m.r * (0.5 + k * 0.6), r0 = r1 * 0.3;
          ctx.beginPath(); for (let j = 0; j < m.n * 2; j++) { const rr = j & 1 ? r0 : r1, aa = (j / (m.n * 2)) * TAU; ctx.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr); } ctx.closePath(); ctx.fill(); break; }
        case 'puff': ctx.translate((m.vx || 0) * m.t, (m.vy || 0) * m.t); ctx.fillStyle = m.col; ctx.beginPath(); ctx.arc(0, 0, m.r * (0.8 + k * 0.9), 0, TAU); ctx.fill(); break;
        case 'slash': { ctx.rotate(m.rot); const L = m.r * (0.6 + k * 0.6); ctx.strokeStyle = m.col; ctx.lineCap = 'round'; ctx.lineWidth = 4 * a + 1; ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(L, 0); ctx.stroke(); ctx.lineWidth = 1.5; ctx.globalAlpha = a * 0.7; ctx.beginPath(); ctx.moveTo(-L * 0.6, 7); ctx.lineTo(L * 0.7, 7); ctx.stroke(); break; }
        case 'ring': ctx.strokeStyle = m.col; ctx.lineWidth = 4 * a + 1; ctx.beginPath(); ctx.arc(0, 0, m.r * (m.inv ? 1 - k * 0.75 : 0.3 + k * 0.7), 0, TAU); ctx.stroke(); break;
        case 'zap': { ctx.rotate(m.rot); ctx.strokeStyle = m.col; ctx.lineWidth = 2.6; ctx.lineJoin = 'round'; ctx.beginPath(); const n = 5; for (let j = 0; j <= n; j++) { const xx = -m.r + (j / n) * m.r * 2, yy = j === 0 || j === n ? 0 : Math.sin(m.seed * 3 + j * 2.1 + Math.floor(m.t * 40)) * 9; j ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); } ctx.stroke(); break; }
        case 'finish': drawFinish(m, k, a); break;
        case 'sdeath': ctx.scale(1.4, 1.4); drawSpeciesDeath(ctx, m.wk, k, m.seed, text); break;
        case 'muz': drawMuzzle(ctx, m.wk, k, m.seed); break;
        case 'beam': { ctx.globalCompositeOperation = 'lighter'; const w = m.r * (0.5 + 0.5 * a) * (k < 0.15 ? k / 0.15 : 1), h = 260 * (0.4 + k); ctx.globalAlpha = a * 0.55; ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.moveTo(-w * 0.35, 0); ctx.lineTo(-w, -h); ctx.lineTo(w, -h); ctx.lineTo(w * 0.35, 0); ctx.closePath(); ctx.fill(); ctx.globalAlpha = a * 0.8; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-w * 0.15, 0); ctx.lineTo(-w * 0.3, -h * 0.8); ctx.lineTo(w * 0.3, -h * 0.8); ctx.lineTo(w * 0.15, 0); ctx.closePath(); ctx.fill(); break; }
        case 'chunk': { const tx = m.vx * m.t, ty = m.vy * m.t + m.seed * m.t * m.t; ctx.translate(tx, ty);
          if (m.gold) { ctx.fillStyle = m.col; ctx.strokeStyle = '#8a5a00'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, m.r * (0.4 + 0.6 * Math.abs(Math.cos(m.t * 16))), m.r, 0, 0, TAU); ctx.fill(); ctx.stroke(); }
          else { glow(0, 0, m.r * 3, m.col, 0.5 * a); ctx.fillStyle = '#fff6c8'; ctx.beginPath(); ctx.arc(0, 0, m.r * a, 0, TAU); ctx.fill(); }
          break; }
        case 'scorch': { ctx.globalAlpha = Math.min(1, a * 1.3) * 0.5; ctx.fillStyle = '#1a0e14'; ctx.beginPath(); const R0 = m.r * (0.55 + 0.45 * Math.min(1, k * 6));
          for (let j = 0; j < 22; j++) { const aa = j / 22 * TAU, rr = R0 * (0.88 + 0.12 * Math.sin(m.seed + j * 1.7)); ctx.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr * 0.82); } ctx.closePath(); ctx.fill();
          ctx.globalAlpha = Math.min(1, a * 1.3) * 0.28; ctx.fillStyle = '#ff7a2a'; ctx.beginPath(); ctx.arc(0, 0, R0 * 0.45 * (1 - k), 0, TAU); ctx.fill(); break; }
        case 'boomtxt': { const pop = k < 0.2 ? 0.5 + 1.2 * (k / 0.2) : 1.1 - 0.1 * Math.min(1, (k - 0.2) * 3); ctx.globalAlpha = Math.min(1, a * 2.2); ctx.rotate(-0.12); text('BOOM!', 0, -k * 34, Math.round(m.r * pop / 2) * 2, '#ffe27a', '#8a2a08'); break; }
        case 'sigh': { // a broken chain: two links part and sink, a grey "x7" droops under them
          ctx.translate(-m.x, -m.y); ctx.lineCap = 'round'; ctx.strokeStyle = '#10131c'; const d = 10 + k * 30, fall = k * k * 56, tw = k * 0.5;
          for (let side = -1; side <= 1; side += 2) { ctx.save(); ctx.translate(m.x + side * d, m.y + fall * (side > 0 ? 1.25 : 0.8)); ctx.rotate(side * (0.3 + tw));
            ctx.lineWidth = 10; ctx.strokeStyle = '#10131c'; ctx.beginPath(); ctx.ellipse(0, 0, 22, 13, 0, 0, TAU); ctx.stroke(); ctx.lineWidth = 6; ctx.strokeStyle = side < 0 ? '#c4cbd8' : '#9aa3b4'; ctx.stroke(); ctx.restore(); }
          ctx.globalAlpha = Math.min(1, a * 1.6); text('x' + m.n, m.x, m.y + 38 + k * 26, 28, '#aab2c4', '#10131c');
          ctx.globalAlpha = a * 0.7; ctx.fillStyle = '#c4cbd8'; for (let j = 0; j < 3; j++) { const q = Math.min(1, k * 2.2 - j * 0.3); if (q > 0) { ctx.beginPath(); ctx.arc(m.x + 26 + j * 9, m.y - 14 - j * 7 - k * 14, 3.2 - j * 0.7, 0, TAU); ctx.fill(); } }
          break; }
        case 'ping': { ctx.rotate(m.rot); ctx.strokeStyle = m.col; ctx.lineWidth = 2; ctx.lineCap = 'round'; const a0 = m.r * (0.3 + k * 0.9); ctx.beginPath(); ctx.moveTo(0, -a0); ctx.lineTo(0, -a0 - m.r * 0.7 * a); ctx.stroke(); break; }
      }
      ctx.restore();
    }
  }

  // the dash telegraph: while a snake winds up (0.6s) red chevrons flow along the path in front of its head and a ring
  // closes in on it; during the dash it leaves streaks behind it. Reduce motion: steady, no flicker.
  function drawSurge(g) {
    if (!g || !g.snakes) return;
    for (let si = 0; si < g.snakes.length; si++) {
      const sn = g.snakes[si]; if (sn.surge !== 'warn' && sn.surge !== 'go') continue;
      const h = sn.segs[0]; if (!h || h.y < -30 || !sn.path) continue;
      const warn = sn.surge === 'warn', k = warn ? 1 - Math.max(0, sn.surgeT) / 0.6 : 1, still = calm();
      const pulse = still ? 0.8 : 0.65 + 0.35 * Math.sin(S.t * (warn ? 26 : 18));
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      if (warn) {
        glow(h.x, h.y, h.r * (3.2 - k * 1.2), '#ff2a4d', 0.35 + 0.4 * k * pulse);
        ctx.globalAlpha = 0.3 + 0.6 * k; ctx.strokeStyle = '#ff5a78'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(h.x, h.y, h.r * (2.6 - 1.4 * k), 0, TAU); ctx.stroke();
        const flow = still ? 0 : (S.t * 3) % 1;
        for (let i = 0; i < 6; i++) {
          const d = 40 + (i + flow) * 44, p = pointInto(sn.path, h.ps + d, PT1), q = pointInto(sn.path, h.ps + d + 10, PT2);
          if (p.y < -20 || p.y > 900) continue;
          const ang = Math.atan2(q.y - p.y, q.x - p.x), fade = (1 - i / 7) * (0.7 + 0.3 * k);
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang); ctx.globalAlpha = fade * pulse;
          ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.beginPath(); ctx.moveTo(-8, -15); ctx.lineTo(8, 0); ctx.lineTo(-8, 15);
          ctx.strokeStyle = 'rgba(40,4,16,.55)'; ctx.lineWidth = 12; ctx.stroke();
          ctx.strokeStyle = i & 1 ? '#ff3d5a' : '#ff8aa0'; ctx.lineWidth = 7; ctx.stroke(); ctx.restore();
        }
      } else {
        glow(h.x, h.y, h.r * 2.8, '#ff2a4d', 0.3 * pulse);
        ctx.lineCap = 'round';
        for (let i = 0; i < 5; i++) {
          const d = 26 + i * 30, p = pointInto(sn.path, h.ps - d, PT1), q = pointInto(sn.path, h.ps - d - 18, PT2);
          if (p.y < -20) continue;
          ctx.globalAlpha = (1 - i / 5) * 0.7; ctx.strokeStyle = i < 2 ? '#fff2f5' : '#ff5a78'; ctx.lineWidth = Math.max(2, h.r * 0.5 * (1 - i / 6));
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  // note trails behind the flying capsules (called from drawBullets with the live bullet list)
  // trails per weapon: needles leave thin streaks, dragon snot a green puff wake, bubbles shed tiny rising bubbles
  function weaponTrail(b, dt) {
    if (trail.length >= cap(56)) return;
    if (b.kind === 'needle') { if (Math.random() < dt * 40) tpush(b.x, b.y + 22, 0, 90, 0.16, 5, 'streak', b.crit ? '#ffe14a' : '#dff8ff'); }
    else if (b.kind === 'snot') { if (Math.random() < dt * 22) tpush(b.x + (Math.random() - 0.5) * 10, b.y + 10, (Math.random() - 0.5) * 30, 30, 0.45, 8, false, Math.random() < 0.5 ? '#9dff6d' : '#d6ffb0'); }
    else if (b.kind === 'bubble') { if (Math.random() < dt * 9) tpush(b.x + (Math.random() - 0.5) * b.r * 1.4, b.y + b.r * 0.5, (Math.random() - 0.5) * 20, -26, 0.7, 4 + Math.random() * 3, 'ring', '#d6f2ff'); }
  }
  function bullets(list, dt) {
    if (calm()) return;
    for (let i = 0; i < list.length && trail.length < cap(56); i++) {
      const b = list[i];
      if (b.kind && b.kind !== 'pill') { weaponTrail(b, dt); continue; }
      if (Math.random() < dt * (b.crit ? 26 : 12)) tpush(b.x + (Math.random() - 0.5) * 10, b.y + 18, (Math.random() - 0.5) * 40, 30 + Math.random() * 30, b.crit ? 0.55 : 0.4, b.crit ? 7 : 5, Math.random() < 0.35, b.crit ? '#ffe14a' : '#9fefff');
    }
  }

  // the dash telegraph dims the field under the cells and lights the lane the snake is about to take
  function under(g) {
    if (!g || !g.snakes) return;
    let k = 0, lead = null;
    for (let si = 0; si < g.snakes.length; si++) { const sn = g.snakes[si]; if (sn.surge === 'warn') { const w = 1 - Math.max(0, sn.surgeT) / 0.6; if (w >= k) { k = w; lead = sn; } } else if (sn.surge === 'go' && k < 0.9) { k = 0.9; lead = sn; } }
    if (!lead || !lead.path) return;
    const h = lead.segs[0]; if (!h) return;
    ctx.save(); ctx.globalAlpha = 0.34 * Math.min(1, k * 1.6); ctx.fillStyle = '#0a0414'; ctx.fillRect(-200, -200, 1400, 1900); ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const w = h.r * 2 + 18; ctx.beginPath(); let n = 0;
    for (let d = 0; d < 720 && n < 26; d += 30, n++) { const p = pointInto(lead.path, h.ps + d, PT1); if (n === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
    ctx.globalAlpha = 0.16 * Math.min(1, k * 1.5); ctx.strokeStyle = '#ff2a4d'; ctx.lineWidth = w; ctx.stroke();
    ctx.globalAlpha = 0.2 * Math.min(1, k * 1.5); ctx.strokeStyle = '#ff8aa0'; ctx.lineWidth = 3; ctx.setLineDash([14, 14]); ctx.lineDashOffset = calm() ? 0 : -S.t * 120; ctx.stroke();
    ctx.restore();
  }

  // coins on their way to the counter leave a few sparkles (called by the renderer per flying coin)
  function coinSpark(x, y, k) {
    if (calm() || Math.random() > 0.5) return;
    tpush(x + (Math.random() - 0.5) * 8, y + (Math.random() - 0.5) * 8, 0, 0, 0.28, 5 - 2 * k, false, '#ffe27a');
  }
  function coinLand(x, y) { if (calm()) return; ring(x, y, 34, '#ffd24a', 0.25); }


  // crit badge outlines, one silhouette per weapon so a crit reads as "whose" before you read the number
  const CRIT_COL = { capsule: ['#ff8a1a', '#ffd23a'], swab: ['#ff6fae', '#ffd0ea'], daggers: ['#3a7ac8', '#e8f4ff'], tower: ['#d9640c', '#ffc98a'], stick: ['#d6b400', '#fff08a'], needles: ['#14a0b8', '#b8f6ff'], satellite: ['#4a5ee0', '#c6d2ff'], maw: ['#7a3ad8', '#e0c6ff'], puppy: ['#c8741c', '#ffe0b0'], encore: ['#d8b400', '#fff2a0'] };
  function critPath(src, R, sy) {
    ctx.beginPath();
    switch (src) {
      case 'swab': for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ctx.arc(Math.cos(a) * R * 0.78, Math.sin(a) * R * 0.62, R * 0.3, 0, TAU); } break;
      case 'daggers': { const L = R * 1.25, w = R * 0.26; ctx.moveTo(0, -L); ctx.lineTo(w, -w); ctx.lineTo(L, 0); ctx.lineTo(w, w); ctx.lineTo(0, L); ctx.lineTo(-w, w); ctx.lineTo(-L, 0); ctx.lineTo(-w, -w); ctx.closePath(); break; }
      case 'tower': for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.52; ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R * 0.86); } ctx.closePath(); break;
      case 'stick': { const pts = [[0.2, -1.1], [0.45, -0.25], [1.1, -0.45], [0.5, 0.15], [0.75, 1], [-0.1, 0.35], [-0.95, 0.6], [-0.4, -0.1], [-0.8, -0.8], [-0.1, -0.35]]; for (let i = 0; i < pts.length; i++) ctx.lineTo(pts[i][0] * R, pts[i][1] * R * 0.85); ctx.closePath(); break; }
      case 'needles': for (let i = 0; i < 16; i++) { const rr = i & 1 ? R * 0.34 : R * 1.05, a = (i / 16) * TAU - Math.PI / 2; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.9); } ctx.closePath(); break;
      case 'satellite': ctx.ellipse(0, 0, R * 0.95, R * 0.76, 0, 0, TAU); break;
      case 'maw': for (let i = 0; i < 24; i++) { const rr = i & 1 ? R * 0.74 : R * 1.0, a = (i / 24) * TAU; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.8); } ctx.closePath(); break;
      default: for (let i = 0; i < 16; i++) { const rr = i & 1 ? R * 0.62 : R, a = (i / 16) * TAU; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.8); } ctx.closePath();
    }
  }

  // styled floating numbers: crit = starburst badge and tilt, heavy hits = weapon coloured outline, chain = pill, badge = upgrade ribbon
  const NUMM = { dx: 0, dy: 0, rot: 0, sc: 1 };
  function float(f) {
    if (!text) return false;
    const k = f.pop > 0 ? 1 + 0.3 * f.pop : 1;
    if (f.crit) {
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.src === 'daggers' ? -0.5 : f.src === 'stick' ? 0.1 : -0.1);
      const tier = f.tier | 0, R = f.size * (1.5 + 0.14 * tier) * k, fade = Math.min(1, f.life / 0.3), cs = CRIT_COL[f.src] || CRIT_COL.capsule;
      if (tier) ctx.rotate(Math.sin(f.life * 22) * 0.05 * tier);
      if (tier >= 2) {   // a spinning sunburst behind a hot streak, a rainbow rim on a monster one
        ctx.save(); ctx.globalAlpha = 0.55 * fade; ctx.rotate(S.t * 2.4); ctx.fillStyle = tier >= 3 ? CHAIN_COL[(S.t * 14 | 0) % 6] : '#fff2a8';
        for (let j = 0; j < 8; j++) { ctx.rotate(TAU / 8); ctx.beginPath(); ctx.moveTo(R * 0.7, -5); ctx.lineTo(R * 1.55, 0); ctx.lineTo(R * 0.7, 5); ctx.closePath(); ctx.fill(); }
        ctx.restore();
      }
      if (tier >= 3) { ctx.globalAlpha = 0.95 * fade; ctx.fillStyle = CHAIN_COL[(S.t * 14 | 0) % 6]; critPath(f.src, R * 1.1, 1); ctx.fill(); }
      ctx.globalAlpha = 0.92 * fade; ctx.fillStyle = cs[0]; critPath(f.src, R, 1); ctx.fill();
      ctx.globalAlpha = 0.95 * fade; ctx.fillStyle = cs[1]; critPath(f.src, R * 0.8, 1); ctx.fill();
      if (f.src === 'satellite' || f.src === 'tower') { ctx.globalAlpha = 0.6 * fade; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; critPath(f.src, R * 0.9, 1); ctx.stroke(); }
      if (f.src === 'daggers') ctx.rotate(0.5);
      ctx.globalAlpha = fade; text(f.str, 0, 0, Math.round(f.size * k / 4) * 4, '#fff', '#a8330a');
      if (tier) text(tier >= 3 ? 'MEGA!' : tier >= 2 ? 'SUPER!' : 'CRIT!', 0, -R * 1.05 - 6, 16 + tier * 2, tier >= 3 ? '#ff9ad6' : '#fff2a8', '#7a2a08');
      ctx.restore(); return true;
    }
    if (f.key === 'chain') {
      const sz = Math.round(f.size * k / 4) * 4, w = sz * (String(f.str).length * 0.62 + 1.3), h = sz * 1.15;
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(Math.sin(f.life * 12) * 0.05);
      ctx.fillStyle = 'rgba(16,19,28,.82)'; ctx.strokeStyle = f.col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-w / 2, -h / 2, w, h, h / 2) : ctx.rect(-w / 2, -h / 2, w, h); ctx.fill(); ctx.stroke();
      text(f.str, 0, 1, sz, f.col); ctx.restore(); return true;
    }
    if (f.key === 'badge') {
      const sz = Math.round(f.size * k / 4) * 4;
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(-0.06); text(f.str, 0, 0, sz, '#fff3a0', '#8a5a00'); ctx.restore(); return true;
    }
    if (f.key && f.size >= 20) {
      if (calm()) { text(f.str, f.x, f.y, Math.round(f.size * k / 4) * 4, f.col, DARK[f.src] || '#10131c'); return true; }
      const mo = numMotion(f.src, f.max - f.life, S.t, NUMM);   // round 11: the number moves like the weapon that hit
      ctx.save(); ctx.translate(f.x + mo.dx, f.y + mo.dy); ctx.rotate(mo.rot); if (mo.sc !== 1) ctx.scale(mo.sc, mo.sc);
      text(f.str, 0, 0, Math.round(f.size * k / 4) * 4, f.col, DARK[f.src] || '#10131c'); ctx.restore(); return true;
    }
    return false;
  }

  // the streak ends: a run of 5+ kills that stops for a beat leaves a sad broken chain where the last cell fell
  let sighFor = -1;
  function sighCheck() {
    const ch = S.chain; if (!ch || ch.n < 5 || ch.t === sighFor || S.t - ch.t < 0.95 || S.t - ch.t > 2) return;
    sighFor = ch.t; if (sound) sound('sigh');
    if (calm()) return;
    mark({ k: 'sigh', x: lastKill.x, y: lastKill.y, n: ch.n, t: 0, dur: 0.95 });
    S.slump = { t: S.t, n: ch.n };   // the pets droop and a small sad trombone answers
  }

  function draw(dt, g) {
    sighCheck();
    drawSurge(g);
    drawMarks(dt);
    if (casc.t < CASCADE_DUR) { casc.t += dt; if (casc.t < CASCADE_DUR) drawCascade(ctx, W, H, casc.t / CASCADE_DUR, casc.col, casc.seed); }
    drawLadder();
    for (let i = smoke.length - 1; i >= 0; i--) {
      const q = smoke[i]; q.life -= dt; if (q.life <= 0) { smoke.splice(i, 1); continue; }
      const k = 1 - q.life / q.max; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.96; q.vy *= 0.96;
      ctx.globalAlpha = Math.min(1, (1 - k) * 1.4) * 0.6; ctx.fillStyle = q.dark ? '#6e6478' : '#b9aebf';
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (0.6 + k), 0, TAU); ctx.fill();
    }
    for (let i = trail.length - 1; i >= 0; i--) {
      const q = trail[i]; q.life -= dt; if (q.life <= 0) { trail[i] = trail[trail.length - 1]; trail.pop(); tfree.push(q); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; const a = q.life / q.max;
      ctx.globalAlpha = a * 0.8; ctx.fillStyle = q.col || '#9fefff';
      if (q.n === 'streak') { ctx.strokeStyle = q.col; ctx.lineCap = 'round'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x, q.y + 26 * a + 4); ctx.stroke(); }
      else if (q.n === 'ring') { ctx.strokeStyle = q.col; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(q.x, q.y, q.s * (1.4 - a * 0.4), 0, TAU); ctx.stroke(); }
      else if (q.n) { const s = q.s; ctx.beginPath(); ctx.ellipse(q.x, q.y, s * 0.7, s * 0.5, -0.4, 0, TAU); ctx.fill(); ctx.fillRect(q.x + s * 0.4, q.y - s * 1.6, 1.8, s * 1.7); }
      else { ctx.beginPath(); ctx.arc(q.x, q.y, q.s * a, 0, TAU); ctx.fill(); }
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i]; f.t += dt; if (f.t >= f.dur) { flashes.splice(i, 1); continue; }
      const k = f.t / f.dur; glow(f.x, f.y, 62 * (1 - k * 0.4), '#bff6ff', 0.85 * (1 - k));
      ctx.save(); ctx.globalAlpha = 1 - k; ctx.fillStyle = '#fff'; ctx.translate(f.x, f.y); ctx.beginPath(); ctx.moveTo(0, -34 * (1 - k)); ctx.lineTo(7, 0); ctx.lineTo(0, 8); ctx.lineTo(-7, 0); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    for (let i = powers.length - 1; i >= 0; i--) {
      const o = powers[i]; o.t += dt; const k = Math.min(1, o.t / o.dur), e = k * k * (3 - 2 * k), tx = o.p.x, ty = o.p.y - 52;
      const col = POW_COL[o.kind] || '#ffd24a';
      if (k >= 1) {
        powers.splice(i, 1); ring(tx, ty, 80, col, 0.4); ring(tx, ty, 120, '#fff', 0.25);
        if (o.kind === 'heal') shaped(tx, ty, 6, 'h', ['#ff6a8a', '#ffc4d2', '#fff'], 230, 0.8, 9, -120);
        else if (o.kind === 'rage') { burst(tx, ty, 14, ['#ffb020', '#ff6a3d', '#fff2a0'], 320, 0.5, 5); S.flash = Math.max(S.flash, 0.12); S.flashCol = '#ffb020'; }
        else burst(tx, ty, 12, ['#39d0ff', '#bff6ff', '#fff'], 260, 0.5, 4);
        if ((o.kind === 'rage' || o.kind === 'shield') && chipfly.length < 3) chipfly.push({ x0: tx, y0: ty, kind: o.kind, t: 0, dur: 0.55, lastTrail: 0 });   // the power-up's icon then flies on to its timer chip
        continue;
      }
      const x = o.x0 + (tx - o.x0) * e, y = o.y0 + (ty - o.y0) * e - Math.sin(k * Math.PI) * 70;
      o.lastTrail += dt;
      if (o.lastTrail > 0.025) { o.lastTrail = 0; tpush(x + (Math.random() - 0.5) * 8, y + (Math.random() - 0.5) * 8, 0, 0, 0.32, 8, false, col); }
      glow(x, y, 54 * (1 - k * 0.3), col, 0.8); ctx.globalAlpha = 1;
      blit(sprite(o.kind), x, y, 92 * (1 + 0.35 * Math.sin(k * Math.PI)) * (1 - k * 0.55), k * 6.28 * 0.5);
    }
    for (let i = chipfly.length - 1; i >= 0; i--) {
      const o = chipfly[i]; o.t += dt; const k = Math.min(1, o.t / o.dur), e = k * k * (3 - 2 * k), col = POW_COL[o.kind];
      const tx = CHIP_X, ty = H - (o.kind === 'rage' ? 176 : 126) - (S.chipB || 0);
      if (k >= 1) { chipfly.splice(i, 1); S.land[o.kind] = S.t; ring(tx, ty, 70, col, 0.4); burst(tx, ty, 10, [col, '#fff2a0', '#fff'], 200, 0.4, 4); continue; }
      const x = o.x0 + (tx - o.x0) * e + Math.sin(k * Math.PI) * -50, y = o.y0 + (ty - o.y0) * e - Math.sin(k * Math.PI) * 60;
      o.lastTrail += dt;
      if (o.lastTrail > 0.03) { o.lastTrail = 0; tpush(x, y, 0, 0, 0.3, 7, false, col); }
      glow(x, y, 40, col, 0.8); ctx.globalAlpha = 1;
      if (sprite) blit(sprite(o.kind), x, y, 64 * (1 - k * 0.45), k * 6.28);
    }
    for (let i = orbs.length - 1; i >= 0; i--) {
      const o = orbs[i]; o.t += dt; const k = Math.min(1, o.t / o.dur), e = k * k * (3 - 2 * k), m = 1 - e;
      const x = m * m * o.x0 + 2 * m * e * o.cx + e * e * UP_X, y = m * m * o.y0 + 2 * m * e * o.cy + e * e * UP_Y;
      if (k >= 1) { orbs.splice(i, 1); S.land.up = S.t; ring(UP_X, UP_Y, 70, '#ffd84d', 0.4); burst(UP_X, UP_Y, 10, ['#ffd84d', '#fff1a8', '#fff'], 200, 0.4, 4); continue; }
      o.lastTrail += dt;
      if (o.lastTrail > 0.03) { o.lastTrail = 0; tpush(x, y, 0, 0, 0.3, 9, false, '#ffd84d'); }
      glow(x, y, 46, '#ffd84d', 0.8);
      ctx.globalAlpha = 1; ctx.fillStyle = '#fff6c2'; ctx.beginPath(); ctx.arc(x, y, 9 * (1 - k * 0.3), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  return { event, bullets, draw, moment: () => MOM.m, tint, under, float, coinSpark, coinLand, critTier, cascade: casc, pools: { chipfly, powers, orbs, smoke, trail, flashes, marks } };
}

// 1 at rest; right after a landing it pops and settles over 0.38s: the HUD takes the max with its own bounce
export function landBounce(S, key) {
  const k = Math.max(0, 1 - (S.t - (S.land ? S.land[key] : -9)) / 0.38);
  return k > 0 ? 1 + 0.5 * k * k + Math.sin(k * 3) * 0.05 : 1;
}
