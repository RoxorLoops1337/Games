// MAP screen (run.phase === 'map'): a pinned surgical chart. Row 0 at the bottom, the boss at the top.
// Reads the run, calls RUN.enterNode then flow.route(). Left panel = the patient, right panel = legend + school resonance.
import { COL, EASE, W, H, clamp, lerp, rgba, FONT, FONT_UI } from './core.js';
import * as RUN from '../engine/run.js';
import { strainInfo } from '../engine/cards.js';
import { HEROES, RELICS, POTIONS, SCHOOLS, CARDS } from '../data/index.js';
import { drawBackground } from '../art/backgrounds.js';
import { drawNodeIcon, drawRelic, drawPotion, drawHeart, drawCoin } from '../art/icons.js';
import { drawPortrait } from '../art/heroes.js';
import { drawSchoolGlyph } from '../art/cards.js';

const ACT_NAMES = { 1: 'The Ward', 2: 'The Cellar Market', 3: 'The Gilt Theatre' };
const ROMAN = { 1: 'I', 2: 'II', 3: 'III' };
const SP = 96; // row spacing
const CHART = { x: 330, y: 0, w: 620, h: 720 };
const NODE_INFO = {
  fight: ['Fight', 'A ward patient with opinions. Reward: gold, a graft.'],
  elite: ['Elite', 'A harder fight. Reward: a relic, gold and a graft.'],
  event: ['Event', '???'],
  shop: ['Shop', 'Cards, grafts, relics, potions and a few services.'],
  forge: ['Forge', 'Rest, expand, refine, strip or reforge. Pick one.'],
  boss: ['Boss', 'The floor warden. Reward: a choice of boss relic.'],
  final: ['The Grafter', 'The last node. Nothing is saved after this.'],
};
const NODE_COL = { fight: '#c9b48a', elite: COL.scar, event: '#6fa8bd', shop: COL.gold, forge: COL.ember, boss: '#b33a4a', final: '#F5E6A8' };
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

function worldH(map) { return map.rows * SP + 120; }
function worldY(map, row) { return worldH(map) - 70 - row * SP; }
function nodeWorld(map, n) { return { x: 350 + n.x * 580, y: worldY(map, n.row) + (hash(n.id) - 0.5) * 14 }; }

function reducedMotion(app) { const s = app.shared.meta && app.shared.meta.settings; return !!(s && (s.reduceMotion || s.reducedMotion)); }

function drawScalpel(g, x, y, rot, s = 1, glow = 0) {
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s);
  if (glow) { g.shadowColor = COL.lamp; g.shadowBlur = 14 * glow; }
  g.fillStyle = '#2b1e1a'; g.beginPath(); g.roundRect ? g.roundRect(-4, -4, 8, 34, 3) : g.rect(-4, -4, 8, 34); g.fill();
  g.fillStyle = '#d8dde0'; g.beginPath(); g.moveTo(-3, -4); g.quadraticCurveTo(0, -30, 6, -34); g.quadraticCurveTo(5, -16, 3, -4); g.closePath(); g.fill();
  g.strokeStyle = '#0e0e0e'; g.lineWidth = 1.2; g.stroke();
  g.restore();
}

function stitchPath(g, a, b, seed) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  const segs = Math.max(3, Math.round(len / 28));
  g.beginPath(); g.moveTo(a.x, a.y);
  for (let i = 1; i < segs; i++) {
    const t = i / segs, o = (hash(seed + i) - 0.5) * 7;
    g.lineTo(a.x + dx * t + nx * o, a.y + dy * t + ny * o);
  }
  g.lineTo(b.x, b.y);
}

export default {
  enter(app, params) {
    const run = app.shared.run;
    this.run = run;
    this.scroll = 0; this.drag = null; this.moved = false; this.trav = null; this.kb = false; this.sel = 0; this.confirm = false;
    this.pulse = 0; this.flashT = 0;
    this.autoScroll(app, true);
    const key = `${run.seed}|${run.loop}|${run.act}`;
    if (run.node === null && run.row === -1 && MapShown.key !== key) { this.banner = { t: 0, act: run.act }; }
    else this.banner = null;
    MapShown.key = key;
  },
  leave() {},
  autoScroll(app, snap) {
    const run = this.run, map = run.map; if (!map) return;
    const row = Math.max(0, run.row);
    const target = clamp(worldY(map, row) - 470, 0, Math.max(0, worldH(map) - H));
    if (snap) { this.scroll = target; this.scrollTarget = null; } else this.scrollTarget = target;
    this.maxScroll = Math.max(0, worldH(map) - H);
  },
  update(app, dt) {
    const run = this.run; if (!run || !run.map) return;
    this.pulse += dt;
    this.maxScroll = Math.max(0, worldH(run.map) - H);
    if (this.banner) { this.banner.t += dt; if (this.banner.t > 2.6) this.banner = null; }
    if (this.trav) {
      this.trav.t += dt;
      if (this.trav.t >= this.trav.dur) {
        const id = this.trav.id; this.trav = null;
        RUN.enterNode(run, id);
        app.shared.flow.route();
      }
    }
  },
  key() { return false; },
  availSorted() {
    const run = this.run;
    return RUN.availableNodes(run).map((id) => run.map.nodes[id]).sort((a, b) => a.x - b.x);
  },
  startTravel(app, n) {
    if (this.trav || this.banner) return;
    const run = this.run, map = run.map;
    let from;
    if (run.node === null) from = { x: 640, y: worldY(map, 0) + 72 };
    else from = nodeWorld(map, map.nodes[run.node]);
    const to = nodeWorld(map, n);
    const dur = reducedMotion(app) ? 0.01 : 0.75;
    this.trav = { id: n.id, t: 0, dur, from, to };
    this.scrollTarget = clamp(to.y - 470, 0, this.maxScroll);
    if (app.shared.audio) app.shared.audio.sfx('stitch', { vol: 0.5 });
  },
  draw(app) {
    const g = app.ctx, run = this.run;
    if (!run || !run.map) return;
    const map = run.map, mouse = app.mouse;
    const blocked0 = app.blocked;
    if (this.confirm) app.blocked = true;
    drawBackground(g, 'map' + run.act, app.t);

    // ---- input: scroll / drag / keys ----
    const overChart = !app.blocked && mouse.x >= CHART.x && mouse.x <= CHART.x + CHART.w;
    if (!app.blocked) {
      if (mouse.wheel && overChart) { this.scroll += mouse.wheel * 0.7; this.scrollTarget = null; }
      if (mouse.pressed && overChart && !this.banner) { this.drag = { y: mouse.y, s: this.scroll }; this.moved = false; }
      if (this.drag && mouse.down) { const dy = mouse.y - this.drag.y; if (Math.abs(dy) > 6) this.moved = true; if (this.moved) { this.scroll = this.drag.s - dy; this.scrollTarget = null; } }
      if (this.drag && !mouse.down) this.drag = null;
    }
    if (this.scrollTarget !== null && this.scrollTarget !== undefined) {
      this.scroll = lerp(this.scroll, this.scrollTarget, 1 - Math.pow(0.0015, app.dt));
      if (Math.abs(this.scroll - this.scrollTarget) < 0.5) { this.scroll = this.scrollTarget; this.scrollTarget = null; }
    }
    this.scroll = clamp(this.scroll, 0, this.maxScroll);

    const avail = this.availSorted();
    const availIds = new Set(avail.map((n) => n.id));
    if (this.sel >= avail.length) this.sel = 0;
    if (!app.blocked && !this.trav) {
      for (const e of app.pressedKeys) {
        const k = e.key;
        if (this.banner) { this.banner.t = Math.max(this.banner.t, 2.0); continue; }
        if (!avail.length) continue;
        if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'a' || k === 'A' || k === 'w' || k === 'W') { this.sel = (this.sel + avail.length - 1) % avail.length; this.kb = true; }
        else if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'd' || k === 'D' || k === 's' || k === 'S') { this.sel = (this.sel + 1) % avail.length; this.kb = true; }
        else if (k === 'Enter' || k === ' ') { this.kb = true; this.startTravel(app, avail[this.sel]); }
      }
      if (this.kb && avail[this.sel]) {
        const wy = nodeWorld(map, avail[this.sel]).y - this.scroll;
        if (wy < 90 || wy > H - 90) this.scrollTarget = clamp(nodeWorld(map, avail[this.sel]).y - 400, 0, this.maxScroll);
      }
    }
    if (mouse.pressed || (Math.abs(mouse.rx || 0) > 0)) { /* mouse use clears keyboard focus below */ }

    // reachable set from the current position
    const reach = new Set();
    {
      const stack = run.node === null ? [...map.byRow[0]] : [...map.nodes[run.node].next];
      while (stack.length) { const id = stack.pop(); if (reach.has(id)) continue; reach.add(id); for (const nx of map.nodes[id].next) stack.push(nx); }
    }

    // ---- the chart ----
    g.save();
    // slab shadow + parchment
    app.rr(CHART.x - 6, CHART.y - 4, CHART.w + 12, CHART.h + 8, 14); g.fillStyle = 'rgba(8,6,5,.75)'; g.fill();
    app.rr(CHART.x, CHART.y + 6, CHART.w, CHART.h - 12, 10);
    const pg = g.createLinearGradient(0, 0, 0, H); pg.addColorStop(0, '#d8caa8'); pg.addColorStop(0.5, '#cfbf9a'); pg.addColorStop(1, '#bfae86');
    g.fillStyle = pg; g.fill();
    g.save(); app.rr(CHART.x, CHART.y + 6, CHART.w, CHART.h - 12, 10); g.clip();
    // faint grid (scrolls with the map)
    g.strokeStyle = 'rgba(70,52,34,.13)'; g.lineWidth = 1;
    const off = this.scroll % 40;
    for (let y = -off; y < H; y += 40) { g.beginPath(); g.moveTo(CHART.x, y); g.lineTo(CHART.x + CHART.w, y); g.stroke(); }
    for (let x = CHART.x + 10; x < CHART.x + CHART.w; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    // stains
    for (let i = 0; i < 5; i++) {
      const sx = CHART.x + 60 + hash('s' + i + run.act) * 500, sy = ((hash('t' + i + run.act) * worldH(map)) - this.scroll);
      const rg = g.createRadialGradient(sx, sy, 4, sx, sy, 70); rg.addColorStop(0, 'rgba(110,70,40,.10)'); rg.addColorStop(1, 'rgba(110,70,40,0)'); g.fillStyle = rg; g.fillRect(sx - 70, sy - 70, 140, 140);
    }
    // vignette edges
    const vg = g.createLinearGradient(CHART.x, 0, CHART.x + CHART.w, 0); vg.addColorStop(0, 'rgba(60,40,24,.28)'); vg.addColorStop(0.06, 'rgba(60,40,24,0)'); vg.addColorStop(0.94, 'rgba(60,40,24,0)'); vg.addColorStop(1, 'rgba(60,40,24,.28)');
    g.fillStyle = vg; g.fillRect(CHART.x, 0, CHART.w, H);
    // floor labels
    for (let r = 0; r < map.rows; r++) {
      const y = worldY(map, r) - this.scroll;
      if (y < -20 || y > H + 20) continue;
      const done = r <= run.row;
      app.text(String(r + 1), CHART.x + 22, y - 9, { size: 15, align: 'center', color: done ? 'rgba(43,30,26,.25)' : 'rgba(43,30,26,.55)', italic: true });
      g.strokeStyle = 'rgba(43,30,26,.22)'; g.lineWidth = 1; g.beginPath(); g.moveTo(CHART.x + 38, y + 14); g.lineTo(CHART.x + 50, y + 14); g.stroke();
    }

    // edges
    g.lineCap = 'round'; g.lineJoin = 'round';
    const from0 = run.node === null ? null : map.nodes[run.node];
    for (const n of Object.values(map.nodes)) {
      const a = nodeWorld(map, n); const ay = a.y - this.scroll;
      for (const nid of n.next) {
        const m = map.nodes[nid]; const b = nodeWorld(map, m); const by = b.y - this.scroll;
        if (Math.max(ay, by) < -40 || Math.min(ay, by) > H + 40) continue;
        const A = { x: a.x, y: ay }, B = { x: b.x, y: by };
        const traveled = n.visited && m.visited && (run.node === m.id || m.visited);
        const live = from0 ? (n === from0 && availIds.has(m.id)) : false;
        const reachable = reach.has(m.id) && (reach.has(n.id) || n === from0);
        g.setLineDash([9, 7]);
        if (traveled) { g.strokeStyle = 'rgba(14,14,14,.85)'; g.lineWidth = 2.6; }
        else if (live) { g.strokeStyle = COL.scar; g.lineWidth = 3; g.setLineDash([9, 6]); g.lineDashOffset = -app.t * 14; }
        else if (reachable) { g.strokeStyle = 'rgba(43,30,26,.55)'; g.lineWidth = 2; }
        else { g.strokeStyle = 'rgba(43,30,26,.16)'; g.lineWidth = 1.6; }
        stitchPath(g, A, B, n.id + m.id); g.stroke(); g.lineDashOffset = 0;
        g.setLineDash([]);
        if (live || traveled) { // knots at the ends
          g.fillStyle = live ? COL.scar : 'rgba(14,14,14,.85)'; g.beginPath(); g.arc(B.x, B.y, 2.6, 0, 6.283); g.fill();
        }
      }
    }
    // start thread under row 0
    if (run.node === null) {
      const ys = worldY(map, 0) + 72 - this.scroll;
      g.setLineDash([9, 7]); g.strokeStyle = COL.scar; g.lineWidth = 3; g.lineDashOffset = -app.t * 14;
      for (const id of map.byRow[0]) { const b = nodeWorld(map, map.nodes[id]); g.beginPath(); g.moveTo(640, ys); g.lineTo(b.x, b.y - this.scroll); g.stroke(); }
      g.setLineDash([]); g.lineDashOffset = 0;
      app.text('Admission', 640, ys + 10, { size: 14, align: 'center', italic: true, color: 'rgba(43,30,26,.6)' });
      drawScalpel(g, 640, ys, 0.5, 1.0, 0.6);
    }

    // nodes
    let hovered = null;
    const click = [];
    const nodes = Object.values(map.nodes).sort((a, b) => a.row - b.row);
    for (const n of nodes) {
      const p = nodeWorld(map, n); const x = p.x, y = p.y - this.scroll;
      if (y < -50 || y > H + 50) continue;
      const big = n.type === 'boss' || n.type === 'final';
      const isAvail = availIds.has(n.id) && !this.trav;
      const isCur = run.node === n.id;
      const isSel = this.kb && isAvail && avail[this.sel] === n;
      const R = big ? 38 : 27;
      const hov = !app.blocked && !this.banner && Math.hypot(mouse.x - x, mouse.y - y) < R + 5 && mouse.x > CHART.x && mouse.x < CHART.x + CHART.w;
      if (hov) { hovered = n; }
      const state = n.visited ? 'visited' : isAvail ? 'available' : reach.has(n.id) ? 'locked' : 'locked';
      const faint = !n.visited && !isAvail && !reach.has(n.id);
      const pulse = isAvail ? 0.5 + 0.5 * Math.sin(this.pulse * 4 + n.col) : 0;
      g.save();
      g.globalAlpha = n.visited ? (isCur ? 1 : 0.5) : faint ? 0.3 : isAvail ? 1 : 0.8;
      if (isAvail) { // pulsing halo
        g.fillStyle = rgba('#B3263A', 0.18 + 0.2 * pulse); g.beginPath(); g.arc(x, y, R + 9 + 4 * pulse, 0, 6.283); g.fill();
      }
      const sc = isAvail && (hov || isSel) ? 1.12 : 1;
      g.translate(x, y); g.scale(sc, sc);
      // disc
      g.fillStyle = '#1f1914'; g.beginPath(); g.arc(0, 0, R, 0, 6.283); g.fill();
      g.lineWidth = big ? 4 : 3; g.strokeStyle = NODE_COL[n.type] || '#aaa'; g.stroke();
      g.lineWidth = 1; g.strokeStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.arc(0, 0, R - 5, 0, 6.283); g.stroke();
      g.restore();
      g.save(); g.globalAlpha = n.visited ? 0.55 : faint ? 0.35 : 1;
      drawNodeIcon(g, n.type, x, y, R * 1.45 * sc, state);
      g.restore();
      if (n.visited) { // tick
        g.save(); g.strokeStyle = isCur ? COL.lamp : 'rgba(232,220,196,.9)'; g.lineWidth = 3.4; g.lineCap = 'round'; g.beginPath(); g.moveTo(x + R * 0.1, y + R * 0.9); g.lineTo(x + R * 0.38, y + R * 1.15); g.lineTo(x + R * 0.95, y + R * 0.5); g.stroke(); g.restore();
      }
      if (isCur) {
        g.save(); g.strokeStyle = COL.lamp; g.lineWidth = 3; g.shadowColor = COL.lamp; g.shadowBlur = 12;
        g.beginPath(); g.arc(x, y, R + 7, 0, 6.283); g.stroke(); g.setLineDash([4, 5]); g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, R + 13, 0, 6.283); g.stroke(); g.restore();
      }
      if (isSel || (hov && isAvail)) {
        g.save(); g.strokeStyle = COL.lamp; g.lineWidth = 2.5; g.setLineDash([6, 4]); g.lineDashOffset = -app.t * 20; g.beginPath(); g.arc(x, y, R + 12, 0, 6.283); g.stroke(); g.restore();
      }
      if (isAvail) click.push({ n, x, y, R, hov });
    }

    // scalpel marker at current node or travelling
    if (this.trav) {
      const t = EASE.inOut(clamp(this.trav.t / this.trav.dur, 0, 1));
      const a = this.trav.from, b = this.trav.to;
      const mx = lerp(a.x, b.x, t), my = lerp(a.y, b.y, t) - Math.sin(t * Math.PI) * 10 - this.scroll;
      g.save(); g.setLineDash([9, 7]); g.strokeStyle = COL.scar; g.lineWidth = 4; g.beginPath(); g.moveTo(a.x, a.y - this.scroll); g.lineTo(mx, my); g.stroke(); g.restore();
      drawScalpel(g, mx, my, Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2 + 0.2, 1.1, 1);
    } else if (run.node !== null) {
      const p = nodeWorld(map, map.nodes[run.node]);
      drawScalpel(g, p.x + 30, p.y - this.scroll - 30, 0.9 + Math.sin(this.pulse * 2) * 0.05, 0.9, 0.5);
    }

    // clicks
    if (!this.trav && !this.banner && !app.blocked) {
      for (const c of click) {
        if (c.hov && mouse.released && !this.moved && mouse.pressStart && Math.hypot(mouse.pressStart.x - c.x, mouse.pressStart.y - c.y) < c.R + 5) {
          if (app.onClick) app.onClick();
          this.kb = false; this.startTravel(app, c.n); break;
        }
      }
    }
    if (hovered) {
      if (hovered.id && click.some((c) => c.n === hovered)) { app.cursor = 'pointer'; this.kb = false; }
      const info = NODE_INFO[hovered.type] || [hovered.type, ''];
      const state = hovered.visited ? 'Visited.' : availIds.has(hovered.id) ? 'Click to enter.' : reach.has(hovered.id) ? 'Not yet reachable.' : 'Off your path.';
      const label = hovered.type === 'event' ? 'Event: ???' : hovered.type === 'elite' ? 'Elite: relic reward' : hovered.type === 'forge' ? 'Forge: rest, expand, refine, strip or reforge' : info[0];
      app.tooltip(info[0], (hovered.type === 'event' ? 'Event: ???\nWhatever is behind this door, it wants to talk.' : (label === info[0] ? info[1] : label + '\n' + info[1])) + '\n' + state, { color: NODE_COL[hovered.type] });
    }
    g.restore(); // clip
    // pins + border
    g.strokeStyle = 'rgba(30,20,12,.8)'; g.lineWidth = 3; app.rr(CHART.x, CHART.y + 6, CHART.w, CHART.h - 12, 10); g.stroke();
    for (const [px, py] of [[CHART.x + 14, 22], [CHART.x + CHART.w - 14, 22], [CHART.x + 14, H - 22], [CHART.x + CHART.w - 14, H - 22]]) {
      g.fillStyle = '#3b3028'; g.beginPath(); g.arc(px, py, 7, 0, 6.283); g.fill(); g.fillStyle = '#9a8a70'; g.beginPath(); g.arc(px - 1.5, py - 1.5, 3, 0, 6.283); g.fill();
    }
    // scrollbar
    if (this.maxScroll > 0) {
      const bx = CHART.x + CHART.w - 8, th = 120, ty = 40 + (this.scroll / this.maxScroll) * (H - 80 - th);
      g.fillStyle = 'rgba(43,30,26,.18)'; g.fillRect(bx, 40, 3, H - 80); g.fillStyle = 'rgba(43,30,26,.6)'; g.fillRect(bx - 1, ty, 5, th);
    }
    g.restore();

    this.leftPanel(app, run);
    this.rightPanel(app, run);
    if (this.banner) this.drawBanner(app);
    app.blocked = blocked0;
    if (this.confirm) this.drawConfirm(app);
  },

  leftPanel(app, run) {
    const g = app.ctx, hero = HEROES[run.hero];
    const X = 12, PW = 300;
    app.panel(X, 12, PW, 696, { fill: 'rgba(22,18,16,.94)', r: 12 });
    app.text('ACT ' + ROMAN[run.act] + (run.loop ? '  LOOP ' + (run.loop + 1) : ''), X + 18, 24, { size: 14, ui: true, color: COL.lamp, bold: true });
    app.text(ACT_NAMES[run.act], X + 18, 42, { size: 26, bold: true, color: COL.vellum });
    const rows = run.map.rows;
    app.text(run.row < 0 ? 'Admission. Floor 0 of ' + rows : 'Floor ' + (run.row + 1) + ' of ' + rows, X + 18, 76, { size: 15, ui: true, color: 'rgba(232,220,196,.7)' });
    g.strokeStyle = 'rgba(232,220,196,.25)'; g.setLineDash([6, 5]); g.beginPath(); g.moveTo(X + 18, 102); g.lineTo(X + PW - 18, 102); g.stroke(); g.setLineDash([]);

    // portrait
    app.panel(X + 18, 114, 80, 80, { fill: '#2b2420', stroke: hero.color, r: 8, lw: 2.5 });
    g.save(); app.rr(X + 20, 116, 76, 76, 6); g.clip(); drawPortrait(g, run.hero, X + 58, 154, 76); g.restore();
    app.text(hero.name, X + 112, 118, { size: 22, bold: true });
    app.text(hero.title, X + 112, 146, { size: 14, ui: true, color: 'rgba(232,220,196,.65)', maxW: 180 });
    // hp
    drawHeart(g, X + 126, 188, 18);
    const bx = X + 142, bw = 140;
    app.rr(bx, 180, bw, 16, 8); g.fillStyle = '#0e0b0a'; g.fill();
    const k = clamp(run.hp / run.maxHp, 0, 1);
    app.rr(bx, 180, Math.max(6, bw * k), 16, 8); g.fillStyle = k < 0.3 ? '#d33' : COL.scar; g.fill();
    app.rr(bx, 180, bw, 16, 8); g.strokeStyle = 'rgba(232,220,196,.5)'; g.lineWidth = 1.5; g.stroke();
    app.text(`${run.hp} / ${run.maxHp}`, bx + bw / 2, 181, { size: 13, ui: true, align: 'center', bold: true, shadow: true });
    if (app.inRect(X + 112, 176, 180, 24)) app.tooltip('Health', 'Heal at the Forge. Some events and relics help too.');
    // gold
    drawCoin(g, X + 30, 220, 20);
    app.text(String(run.gold), X + 46, 210, { size: 22, bold: true, color: COL.gold });
    app.text(`${run.deck.length} cards`, X + PW - 18, 214, { size: 14, ui: true, align: 'right', color: 'rgba(232,220,196,.65)' });

    // budget
    const si = strainInfo(run);
    app.text('BUDGET', X + 18, 242, { size: 13, ui: true, bold: true, color: 'rgba(232,220,196,.6)' });
    app.text(`${si.weight} / ${si.budget}`, X + PW - 18, 240, { size: 17, bold: true, align: 'right', color: si.strain ? COL.bad : COL.vellum });
    const pips = Math.max(si.budget, si.weight, 6), pw = Math.min(20, (PW - 36 - (pips - 1) * 3) / pips);
    for (let i = 0; i < pips; i++) {
      const px = X + 18 + i * (pw + 3);
      const over = i >= si.budget;
      app.rr(px, 264, pw, 14, 3);
      if (i < si.weight) g.fillStyle = over ? COL.scar : '#c9b48a'; else g.fillStyle = over ? 'rgba(179,38,58,.25)' : 'rgba(232,220,196,.12)';
      g.fill();
      g.strokeStyle = over ? 'rgba(179,38,58,.9)' : 'rgba(232,220,196,.35)'; g.lineWidth = 1; g.stroke();
    }
    const sTxt = si.strain ? `Strain ${si.strain}: ${si.tithed.length} card${si.tithed.length === 1 ? '' : 's'} Tithed` + (si.backfire ? `, Backfire ${si.backfire}` : '') : 'No Strain';
    app.text(sTxt, X + 18, 284, { size: 14, ui: true, color: si.strain ? COL.bad : COL.good, bold: true });
    if (app.inRect(X + 12, 236, PW, 70)) {
      const names = si.tithed.map((u) => { const i = run.deck.find((d) => d.uid === u); return i ? CARDS[i.id].name : ''; });
      app.tooltip('Budget', `Graft weight in your deck: ${si.weight}. Budget: ${si.budget}.\nEach point over is Strain, and lands a Tithe (-25% numbers) on a Bare card.` + (names.length ? '\nTithed now: ' + names.join(', ') + '.' : '') + (si.backfire ? `\nBackfire ${si.backfire}: grafted cards jam in your opening hand.` : ''), { color: si.strain ? COL.bad : COL.lamp });
    }

    // relics
    app.text('RELICS', X + 18, 314, { size: 13, ui: true, bold: true, color: 'rgba(232,220,196,.6)' });
    const per = 7, cell = 39;
    run.relics.forEach((id, i) => {
      const cx = X + 18 + (i % per) * cell + 18, cy = 350 + Math.floor(i / per) * cell;
      const over = app.inRect(cx - 18, cy - 18, 36, 36);
      app.rr(cx - 18, cy - 18, 36, 36, 6); g.fillStyle = over ? 'rgba(242,193,78,.2)' : 'rgba(232,220,196,.07)'; g.fill();
      drawRelic(g, id, cx, cy, 30);
      if (over && RELICS[id]) app.tooltip(RELICS[id].name, RELICS[id].text, { color: COL.lamp });
    });
    if (!run.relics.length) app.text('None yet.', X + 18, 338, { size: 14, ui: true, italic: true, color: 'rgba(232,220,196,.4)' });

    // potions
    app.text('POTIONS', X + 18, 466, { size: 13, ui: true, bold: true, color: 'rgba(232,220,196,.6)' });
    const slots = RUN.potionSlots(run);
    for (let i = 0; i < slots; i++) {
      const cx = X + 18 + i * 56 + 24, cy = 514, id = run.potions[i];
      app.rr(cx - 24, cy - 26, 48, 52, 10); g.fillStyle = 'rgba(232,220,196,.07)'; g.fill(); g.strokeStyle = 'rgba(232,220,196,.3)'; g.lineWidth = 1.5; g.setLineDash(id ? [] : [4, 4]); g.stroke(); g.setLineDash([]);
      if (id) {
        drawPotion(g, id, cx, cy, 38);
        if (app.inRect(cx - 24, cy - 26, 48, 52) && POTIONS[id]) app.tooltip(POTIONS[id].name, POTIONS[id].text + '\nUsed in combat.', { color: COL.energy });
      }
    }

    // buttons
    if (app.button(`Deck (${run.deck.length})`, X + 18, 568, 130, 42, { size: 18 })) app.shared.flow.openDeck();
    if (app.button('Settings', X + 154, 568, 128, 42, { size: 18 })) app.shared.flow.openSettings();
    if (app.button('Abandon run', X + 18, 626, PW - 36, 38, { size: 16, fill: '#2b1a1a', stroke: 'rgba(179,38,58,.7)', color: '#e6a0a0' })) this.confirm = true;
    app.text('Arrows or WASD to choose, Enter to go', X + PW / 2, 676, { size: 12, ui: true, align: 'center', color: 'rgba(232,220,196,.4)' });
  },

  rightPanel(app, run) {
    const g = app.ctx;
    const X = 968, PW = 300;
    app.panel(X, 12, PW, 696, { fill: 'rgba(22,18,16,.94)', r: 12 });
    app.text('LEGEND', X + 18, 24, { size: 14, ui: true, bold: true, color: COL.lamp });
    const types = ['fight', 'elite', 'event', 'shop', 'forge', run.act === 3 ? 'boss' : 'boss'];
    const leg = { fight: 'Fight: gold and a graft', elite: 'Elite: relic reward', event: 'Event: ???', shop: 'Shop: spend gold', forge: 'Forge: rest, expand, refine, strip or reforge', boss: run.act === 3 ? 'Warden, then The Grafter' : 'Boss: ends the act' };
    types.forEach((t, i) => {
      const y = 50 + i * 36;
      g.fillStyle = '#1f1914'; g.beginPath(); g.arc(X + 34, y + 14, 15, 0, 6.283); g.fill(); g.strokeStyle = NODE_COL[t]; g.lineWidth = 2.4; g.stroke();
      drawNodeIcon(g, t, X + 34, y + 14, 22, 'available');
      app.text(NODE_INFO[t][0], X + 58, y + 1, { size: 16, bold: true, color: NODE_COL[t] === COL.scar ? '#e07a86' : NODE_COL[t] });
      app.text(leg[t].split(': ')[1] || leg[t], X + 58, y + 19, { size: 12, ui: true, color: 'rgba(232,220,196,.6)', maxW: 220 });
    });
    // path key
    const ky = 268;
    g.setLineDash([9, 6]); g.lineWidth = 3; g.strokeStyle = COL.scar; g.beginPath(); g.moveTo(X + 18, ky); g.lineTo(X + 62, ky); g.stroke();
    g.strokeStyle = 'rgba(232,220,196,.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(X + 18, ky + 20); g.lineTo(X + 62, ky + 20); g.stroke(); g.setLineDash([]);
    app.text('Open path', X + 72, ky - 8, { size: 13, ui: true, color: 'rgba(232,220,196,.7)' });
    app.text('Possible later', X + 72, ky + 12, { size: 13, ui: true, color: 'rgba(232,220,196,.7)' });

    g.strokeStyle = 'rgba(232,220,196,.25)'; g.setLineDash([6, 5]); g.beginPath(); g.moveTo(X + 18, 306); g.lineTo(X + PW - 18, 306); g.stroke(); g.setLineDash([]);
    app.text('SCHOOL RESONANCE', X + 18, 318, { size: 14, ui: true, bold: true, color: COL.lamp });
    const res = RUN.resonance(run);
    SCHOOLS_LIST().forEach((s, i) => {
      const y = 346 + i * 48;
      const c = res.counts[s.id] || 0, tier = res.tiers[s.id] || 0;
      const hov = app.inRect(X + 10, y - 4, PW - 20, 46);
      if (hov) { app.rr(X + 10, y - 4, PW - 20, 46, 6); g.fillStyle = 'rgba(232,220,196,.07)'; g.fill(); }
      g.save(); g.globalAlpha = c ? 1 : 0.5;
      drawSchoolGlyph(g, s.id, X + 32, y + 16, 12, s.color);
      app.text(s.name, X + 54, y + 1, { size: 16, bold: true, color: c ? s.color : COL.vellum });
      app.text(String(c), X + PW - 22, y + 1, { size: 18, bold: true, align: 'right', color: tier ? COL.lamp : COL.vellum });
      // bar with ticks at 3 and 6
      const bx = X + 54, bw = 190, by = y + 25;
      app.rr(bx, by, bw, 8, 4); g.fillStyle = 'rgba(232,220,196,.12)'; g.fill();
      if (c) { app.rr(bx, by, Math.max(8, bw * clamp(c / 6, 0, 1)), 8, 4); g.fillStyle = s.color; g.fill(); }
      for (const t of [3, 6]) {
        const tx = bx + bw * (t / 6);
        g.strokeStyle = c >= t ? COL.lamp : 'rgba(232,220,196,.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(tx - (t === 6 ? 1 : 0), by - 4); g.lineTo(tx - (t === 6 ? 1 : 0), by + 12); g.stroke();
        app.text(String(t), tx - (t === 6 ? 1 : 0), by + 11, { size: 10, ui: true, align: 'center', color: c >= t ? COL.lamp : 'rgba(232,220,196,.5)' });
      }
      g.restore();
      if (hov) app.tooltip(s.name + ` (${c} graft${c === 1 ? '' : 's'})`, s.blurb + '\n' + (tier >= 3 ? '[ON] ' : '[3] ') + 'At 3: ' + s.resonance[3] + '\n' + (tier >= 6 ? '[ON] ' : '[6] ') + 'At 6: ' + s.resonance[6], { color: s.color });
    });
  },

  drawBanner(app) {
    const g = app.ctx, b = this.banner, t = b.t;
    const a = t < 0.35 ? t / 0.35 : t > 2.0 ? clamp(1 - (t - 2.0) / 0.6, 0, 1) : 1;
    g.save(); g.globalAlpha = a * 0.78; g.fillStyle = '#0a0807'; g.fillRect(0, 0, W, H); g.globalAlpha = a;
    const cy = 330, slide = (1 - EASE.out(clamp(t / 0.7, 0, 1))) * 60;
    g.fillStyle = 'rgba(22,18,16,.95)'; g.fillRect(0, cy - 90, W, 180);
    g.strokeStyle = COL.scar; g.lineWidth = 3; g.setLineDash([14, 9]);
    g.beginPath(); g.moveTo(0, cy - 88); g.lineTo(W, cy - 88); g.moveTo(0, cy + 88); g.lineTo(W, cy + 88); g.stroke(); g.setLineDash([]);
    app.text('ACT ' + ROMAN[b.act], 640 - slide, cy - 66, { size: 22, ui: true, bold: true, align: 'center', color: COL.lamp });
    app.text(ACT_NAMES[b.act], 640 + slide, cy - 36, { size: 64, bold: true, align: 'center', color: COL.vellum, shadow: true });
    const sub = { 1: 'Visiting hours are over.', 2: 'Everything here has a price tag, including you.', 3: 'The audience is already seated.' }[b.act];
    app.text(sub, 640, cy + 44, { size: 20, italic: true, align: 'center', color: 'rgba(232,220,196,.7)' });
    g.restore();
    if (app.mouse.pressed) b.t = Math.max(b.t, 2.0);
  },

  drawConfirm(app) {
    const g = app.ctx;
    g.fillStyle = 'rgba(8,6,5,.7)'; g.fillRect(0, 0, W, H);
    const x = 420, y = 240, w = 440, h = 220;
    app.panel(x, y, w, h, { fill: '#1d1815', stroke: COL.scar, r: 14, lw: 3 });
    app.text('Abandon this run?', 640, y + 26, { size: 28, bold: true, align: 'center' });
    app.text('The run ends now and counts as a loss. There is no stitching this one back.', 640, y + 72, { size: 16, ui: true, align: 'center', maxW: 380, color: 'rgba(232,220,196,.8)' });
    if (app.button('Keep going', x + 24, y + 140, 188, 52, { size: 20 })) this.confirm = false;
    if (app.button('Abandon', x + w - 212, y + 140, 188, 52, { size: 20, fill: '#5a1a22', stroke: COL.scar })) { this.confirm = false; app.shared.flow.abandon(); }
    for (const e of app.pressedKeys) if (e.key === 'Escape') this.confirm = false;
  },
};

const MapShown = { key: '' };
function SCHOOLS_LIST() { return Object.values(SCHOOLS); }
