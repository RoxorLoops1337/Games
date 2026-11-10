// MAP screen (run.phase === 'map'): a pinned surgical chart. Row 0 at the bottom, the boss at the top.
// Reads the run, calls RUN.enterNode then flow.route(). Left panel = the patient, right panel = legend + school resonance.
import { titleName } from '../engine/meta2.js';
import { COL, EASE, W, H, clamp, lerp, rgba, FONT, FONT_UI } from './core.js';
import * as RUN from '../engine/run.js';
import { strainInfo } from '../engine/cards.js';
import { HEROES, RELICS, POTIONS, SCHOOLS, CARDS } from '../data/index.js';
import { resonanceText } from '../data/schools.js';
import { drawBackground } from '../art/backgrounds.js';
import { drawNodeIcon, drawRelic, drawPotion, drawHeart, drawCoin } from '../art/icons.js';
import { drawPortrait } from '../art/heroes.js';
import { drawSchoolGlyph } from '../art/cards.js';
import { maybeTip } from './tutorial.js';
import { tscale } from './graft_parts.js';
import { lnw } from '../art/linework.js';

const ACT_NAMES = { 1: 'The Ward', 2: 'The Cellar Market', 3: 'The Gilt Theatre' };
const ROMAN = { 1: 'I', 2: 'II', 3: 'III' };
const SP = 96; // row spacing
const CHART = { x: 330, y: 0, w: 620, h: 720 };
const NODE_INFO = {
  fight: ['Fight', 'A ward patient with opinions. Reward: gold, a graft.'],
  elite: ['Elite', 'A harder fight. Reward: a relic, gold and a graft.'],
  event: ['Event', 'A short story with choices. Could cost you, could pay off.'],
  shop: ['Shop', 'Buy cards, grafts, relics and potions with gold.'],
  forge: ['Forge', 'Heal, upgrade a card, or rework your grafts. Pick one.'],
  boss: ['Boss', 'The floor warden. Reward: a choice of boss relic.'],
  final: ['The Grafter', 'The last node. Nothing is saved after this.'],
};
const NODE_COL = { fight: '#c9b48a', elite: COL.scar, event: '#6fa8bd', shop: COL.gold, forge: COL.ember, boss: '#b33a4a', final: '#F5E6A8' };
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

function worldH(map) { return map.rows * SP + 170; }
function worldY(map, row) { return worldH(map) - 140 - row * SP; }
function nodeWorld(map, n) { return { x: 350 + n.x * 580, y: worldY(map, n.row) + (hash(n.id) - 0.5) * 14 }; }

function reducedMotion(app) { const s = app.shared.meta && app.shared.meta.settings; return !!(s && (s.reduceMotion || s.reducedMotion)); }

function drawScalpel(g, x, y, rot, s = 1, glow = 0) {
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s);
  if (glow) { g.shadowColor = COL.lamp; g.shadowBlur = 14 * glow; }
  g.fillStyle = '#2b1e1a'; g.beginPath(); g.roundRect ? g.roundRect(-4, -4, 8, 34, 3) : g.rect(-4, -4, 8, 34); g.fill();
  g.fillStyle = '#d8dde0'; g.beginPath(); g.moveTo(-3, -4); g.quadraticCurveTo(0, -30, 6, -34); g.quadraticCurveTo(5, -16, 3, -4); g.closePath(); g.fill();
  g.strokeStyle = '#0e0e0e'; g.lineWidth = lnw(1.2); g.stroke();
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
    if (run.node === null) from = { x: 640, y: worldY(map, 0) + 62 };
    else from = nodeWorld(map, map.nodes[run.node]);
    const to = nodeWorld(map, n);
    const dur = reducedMotion(app) ? 0.01 : 0.75;
    this.trav = { id: n.id, t: 0, dur, from, to };
    this.scrollTarget = clamp(to.y - 470, 0, this.maxScroll);
    if (app.shared.audio) app.shared.audio.sfx('mapStep', { vol: 0.5 });
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
      app.touchPan = false; // the chart pans itself below
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
    g.strokeStyle = 'rgba(70,52,34,.13)'; g.lineWidth = lnw(1);
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
      if (y < 16 || y > H - 22) continue;
      const done = r <= run.row;
      app.text(String(r + 1), CHART.x + 22, y - 9, { size: 15, align: 'center', color: done ? 'rgba(43,30,26,.25)' : 'rgba(43,30,26,.55)', italic: true });
      g.strokeStyle = 'rgba(43,30,26,.22)'; g.lineWidth = lnw(1); g.beginPath(); g.moveTo(CHART.x + 38, y + 14); g.lineTo(CHART.x + 50, y + 14); g.stroke();
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
        if (traveled) { g.strokeStyle = 'rgba(14,14,14,.85)'; g.lineWidth = lnw(2.6); }
        else if (live) { g.strokeStyle = COL.scar; g.lineWidth = lnw(3); g.setLineDash([9, 6]); g.lineDashOffset = -app.t * 14; }
        else if (reachable) { g.strokeStyle = 'rgba(43,30,26,.55)'; g.lineWidth = lnw(2); }
        else { g.strokeStyle = 'rgba(43,30,26,.16)'; g.lineWidth = lnw(1.6); }
        stitchPath(g, A, B, n.id + m.id); g.stroke(); g.lineDashOffset = 0;
        g.setLineDash([]);
        if (live || traveled) { // knots at the ends
          g.fillStyle = live ? COL.scar : 'rgba(14,14,14,.85)'; g.beginPath(); g.arc(B.x, B.y, 2.6, 0, 6.283); g.fill();
        }
      }
    }
    // start thread under row 0
    if (run.node === null) {
      const ys = worldY(map, 0) + 62 - this.scroll;
      g.setLineDash([9, 7]); g.strokeStyle = COL.scar; g.lineWidth = lnw(3); g.lineDashOffset = -app.t * 14;
      for (const id of map.byRow[0]) { const b = nodeWorld(map, map.nodes[id]); g.beginPath(); g.moveTo(640, ys); g.lineTo(b.x, b.y - this.scroll); g.stroke(); }
      g.setLineDash([]); g.lineDashOffset = 0;
      app.text('Admission', 640, ys + 10, { size: 14, align: 'center', italic: true, color: 'rgba(43,30,26,.6)' });
      drawScalpel(g, 640, ys, 0.5, 1.0, 0.6);
    }

    app.reg('map-chart', CHART.x, 0, CHART.w, H, { layer: 'world', group: 'chart' });
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
      // reachable-later nodes keep their full colour (icons must read at a glance); only off-path nodes sink back
      const state = n.visited ? 'visited' : isAvail ? 'available' : reach.has(n.id) ? 'reach' : 'locked';
      const faint = !n.visited && !isAvail && !reach.has(n.id);
      const pulse = isAvail ? 0.5 + 0.5 * Math.sin(this.pulse * 4 + n.col) : 0;
      g.save();
      g.globalAlpha = n.visited ? (isCur ? 1 : 0.5) : faint ? 0.45 : isAvail ? 1 : 0.92;
      if (isAvail) { // pulsing halo
        g.fillStyle = rgba('#B3263A', 0.18 + 0.2 * pulse); g.beginPath(); g.arc(x, y, R + 9 + 4 * pulse, 0, 6.283); g.fill();
      }
      const sc = isAvail && (hov || isSel) ? 1.12 : 1;
      g.translate(x, y); g.scale(sc, sc);
      // disc
      g.fillStyle = '#1f1914'; g.beginPath(); g.arc(0, 0, R, 0, 6.283); g.fill();
      g.lineWidth = lnw(big ? 4 : 3); g.strokeStyle = NODE_COL[n.type] || '#aaa'; g.stroke();
      g.lineWidth = lnw(1); g.strokeStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.arc(0, 0, R - 5, 0, 6.283); g.stroke();
      g.restore();
      g.save(); g.globalAlpha = n.visited ? 0.55 : faint ? 0.6 : 1;
      drawNodeIcon(g, n.type, x, y, R * 1.45 * sc, state);
      g.restore();
      if (n.visited) { // tick
        g.save(); g.strokeStyle = isCur ? COL.lamp : 'rgba(232,220,196,.9)'; g.lineWidth = lnw(3.4); g.lineCap = 'round'; g.beginPath(); g.moveTo(x + R * 0.1, y + R * 0.9); g.lineTo(x + R * 0.38, y + R * 1.15); g.lineTo(x + R * 0.95, y + R * 0.5); g.stroke(); g.restore();
      }
      if (isCur) {
        g.save(); g.strokeStyle = COL.lamp; g.lineWidth = lnw(3); g.shadowColor = COL.lamp; g.shadowBlur = 12;
        g.beginPath(); g.arc(x, y, R + 7, 0, 6.283); g.stroke(); g.setLineDash([4, 5]); g.lineWidth = lnw(1.5); g.beginPath(); g.arc(x, y, R + 13, 0, 6.283); g.stroke(); g.restore();
      }
      if (isSel || (hov && isAvail)) {
        g.save(); g.strokeStyle = COL.lamp; g.lineWidth = lnw(2.5); g.setLineDash([6, 4]); g.lineDashOffset = -app.t * 20; g.beginPath(); g.arc(x, y, R + 12, 0, 6.283); g.stroke(); g.restore();
      }
      if (isAvail) click.push({ n, x, y, R, hov });
      { const rr = R * sc + 2, y0 = Math.max(0, y - rr), y1 = Math.min(H, y + rr); if (y1 > y0) app.reg('node:' + n.id, x - rr, y0, rr * 2, y1 - y0, { group: 'node:' + n.id, overlay: !!(this.banner || this.confirm) }); }
    }

    // scalpel marker at current node or travelling
    if (this.trav) {
      const t = EASE.inOut(clamp(this.trav.t / this.trav.dur, 0, 1));
      const a = this.trav.from, b = this.trav.to;
      const mx = lerp(a.x, b.x, t), my = lerp(a.y, b.y, t) - Math.sin(t * Math.PI) * 10 - this.scroll;
      g.save(); g.setLineDash([9, 7]); g.strokeStyle = COL.scar; g.lineWidth = lnw(4); g.beginPath(); g.moveTo(a.x, a.y - this.scroll); g.lineTo(mx, my); g.stroke(); g.restore();
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
      const label = hovered.type === 'elite' ? 'Elite: relic reward' : info[0];
      app.tooltip(info[0], (label === info[0] ? info[1] : label + '\n' + info[1]) + '\n' + state, { color: NODE_COL[hovered.type], anchor: { x: hovered.sx !== undefined ? hovered.sx : app.mouse.x - 10, y: hovered.sy !== undefined ? hovered.sy : app.mouse.y - 10, w: 20, h: 20, band: { x: 950, y: 70, bottom: 340, dir: 1 } } }); // node notes sit over the legend (which says the same), never over the neighbouring nodes
    }
    g.restore(); // clip
    // pins + border
    g.strokeStyle = 'rgba(30,20,12,.8)'; g.lineWidth = lnw(3); app.rr(CHART.x, CHART.y + 6, CHART.w, CHART.h - 12, 10); g.stroke();
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
    if (!this.banner && !this.confirm && !this.trav) {
      const slot = this._tipSlot || { top: 356, bottom: 500 };
      const TIPO = { pos: { x: 22, y: slot.top }, w: 262, maxBottom: slot.bottom, fallback: { pos: { x: 352, y: 12 }, w: 580, maxBottom: 140 } };
      if (!maybeTip(app, 'mapnodes', 640, 640, 'Pick a node to walk to. Fights give gold and a graft, elites a relic, events are a gamble, shops sell, forges mend. The legend is on the right.', TIPO)) maybeTip(app, 'resonance', 968, 340, undefined, TIPO);
    }
  },

  leftPanel(app, run) {
    const g = app.ctx, hero = HEROES[run.hero], S = tscale(app);
    const X = 12, PW = 300, IW = PW - 36, BOT = 708 - 12;
    const cs = (size, cap = 1.25) => ({ size: Math.round(size * Math.min(S, cap)), fixed: true }); // text that scales, but not past what the panel can hold
    app.panel(X, 12, PW, 696, { fill: 'rgba(22,18,16,.94)', r: 12 });
    app.reg('map-left', X, 12, PW, 696, { group: 'left' });
    // header (heights come back from app.text so a bigger text scale pushes the rest down)
    let y = 22;
    y += app.text('ACT ' + ROMAN[run.act] + (run.loop ? '  LOOP ' + (run.loop + 1) : ''), X + 18, y, { ...cs(14), ui: true, color: COL.lamp, bold: true, maxW: IW }) + 2;
    y += app.text(ACT_NAMES[run.act], X + 18, y, { ...cs(26, 1), bold: true, color: COL.vellum, maxW: IW }) + 2;
    const rows = run.map.rows;
    y += app.text(run.row < 0 ? 'Admission. Floor 0 of ' + rows : 'Floor ' + (run.row + 1) + ' of ' + rows, X + 18, y, { ...cs(15), ui: true, color: 'rgba(232,220,196,.7)', maxW: IW }) + 6;
    g.strokeStyle = 'rgba(232,220,196,.25)'; g.setLineDash([6, 5]); g.beginPath(); g.moveTo(X + 18, y); g.lineTo(X + PW - 18, y); g.stroke(); g.setLineDash([]);
    y += 10;

    // portrait + name
    app.panel(X + 18, y, 80, 80, { fill: '#2b2420', stroke: hero.color, r: 8, lw: 2.5 });
    app.reg('map-portrait', X + 18, y, 80, 80, { group: 'left' });
    g.save(); app.rr(X + 20, y + 2, 76, 76, 6); g.clip(); drawPortrait(g, run.hero, X + 58, y + 40, 76); g.restore();
    let ny = y + 2;
    ny += app.text(hero.name, X + 112, ny, { ...cs(22, 1), bold: true, maxW: IW - 94 }) + 2;
    { const lt = titleName(app.shared.meta); if (S <= 1.2) ny += app.text(lt ? `"${lt}"` : hero.title, X + 112, ny, { size: 14, ui: true, italic: !!lt, color: lt ? COL.lamp : 'rgba(232,220,196,.65)', maxW: IW - 94 }); }
    y = Math.max(y + 80, ny) + 10;
    // hp
    const bh = Math.max(16, Math.round(13 * Math.min(S, 1.25) * 1.25), Math.ceil(app.sz(Math.round(13 * Math.min(S, 1.25)), { ui: true, bold: true }) * 1.2) + 2), bx = X + 46, bw = IW - 28;
    drawHeart(g, X + 30, y + bh / 2, 18);
    app.reg('map-hp', bx, y, bw, bh, { group: 'left' });
    app.rr(bx, y, bw, bh, bh / 2); g.fillStyle = '#0e0b0a'; g.fill();
    const k = clamp(run.hp / run.maxHp, 0, 1);
    app.rr(bx, y, Math.max(6, bw * k), bh, bh / 2); g.fillStyle = k < 0.3 ? '#d33' : COL.scar; g.fill();
    app.rr(bx, y, bw, bh, bh / 2); g.strokeStyle = 'rgba(232,220,196,.5)'; g.lineWidth = lnw(1.5); g.stroke();
    { const hpO = { ...cs(13), ui: true, align: 'center', bold: true, shadow: true, fit: { w: bw - 12, h: bh } }, hpT = `${run.hp} / ${run.maxHp}`, hpL = app.layoutText(hpT, hpO);
      app.text(hpT, bx + bw / 2, y + (bh - hpL.size) / 2 - 1, hpO); }
    if (app.inRect(X + 18, y - 4, IW, bh + 8)) app.tooltip('Health', 'Heal at the Forge. Some events and relics help too.');
    y += bh + 10;
    // gold + deck count
    const gh = Math.round(22 * Math.min(S, 1.25) * 1.22);
    drawCoin(g, X + 30, y + gh / 2, 20);
    app.text(String(run.gold), X + 46, y, { ...cs(22), bold: true, color: COL.gold, maxW: 110 });
    app.text(`${run.deck.length} cards`, X + PW - 18, y + (gh - 14 * Math.min(S, 1.25)) / 2, { ...cs(14), ui: true, align: 'right', color: 'rgba(232,220,196,.65)' });
    y += gh + 8;

    // budget
    const si = strainInfo(run), by0 = y;
    app.text('GRAFT BUDGET', X + 18, y, { size: 13, ui: true, bold: true, color: 'rgba(232,220,196,.6)' });
    y += app.text(`${si.weight} / ${si.budget}`, X + PW - 18, y - 2, { ...cs(17), bold: true, align: 'right', color: si.strain ? COL.bad : COL.vellum }) + 2;
    const pips = Math.max(si.budget, si.weight, 6), pw = Math.min(20, (IW - (pips - 1) * 3) / pips);
    for (let i = 0; i < pips; i++) {
      const px = X + 18 + i * (pw + 3);
      const over = i >= si.budget;
      app.rr(px, y, pw, 14, 3);
      if (i < si.weight) g.fillStyle = over ? COL.scar : '#c9b48a'; else g.fillStyle = over ? 'rgba(179,38,58,.25)' : 'rgba(232,220,196,.12)';
      g.fill();
      g.strokeStyle = over ? 'rgba(179,38,58,.9)' : 'rgba(232,220,196,.35)'; g.lineWidth = lnw(1); g.stroke();
    }
    y += 18;
    const sTxt = si.strain ? `Strain ${si.strain}: ${si.tithed.length} card${si.tithed.length === 1 ? '' : 's'} Tithed` + (si.backfire ? `, Backfire ${si.backfire}` : '') : 'No Strain';
    y += app.text(sTxt, X + 18, y, { ...cs(14), ui: true, color: si.strain ? COL.bad : COL.good, bold: true, maxW: IW });
    if (app.inRect(X + 12, by0 - 4, PW, y - by0 + 8)) {
      const names = si.tithed.map((u) => { const i = run.deck.find((d) => d.uid === u); return i ? CARDS[i.id].name : ''; });
      app.tooltip('Budget', `Graft weight in your deck: ${si.weight}. Budget: ${si.budget}.\nEach point over is Strain, and lands a Tithe (-25% numbers) on a Bare card.` + (names.length ? '\nTithed now: ' + names.join(', ') + '.' : '') + (si.backfire ? `\nBackfire ${si.backfire}: grafted cards jam in your opening hand.` : ''), { color: si.strain ? COL.bad : COL.lamp });
    }
    y += 10;

    // buttons are anchored to the bottom (stacked when the text scale makes them wide)
    const stack = S > 1.2, bH = 42, aH = 38;
    const abY = BOT - aH, dY = stack ? abY - 8 - bH * 2 - 8 : abY - 8 - bH;
    const hint = app.mouse.touch ? 'Tap a node, tap again to go' : S <= 1 ? (app.measure('Arrows or WASD to choose, Enter to go', 13, { ui: true }) <= IW ? 'Arrows or WASD to choose, Enter to go' : 'WASD to move, Enter to go') : null;
    const hintH = Math.ceil(app.sz(13, { ui: true }) * 1.2), hintY = hint ? dY - hintH - 6 : dY;
    // potions
    const potTop = hintY - 8 - 58;
    // relics get whatever is left between here and the potions
    app.text('RELICS', X + 18, y, { size: 13, ui: true, bold: true, color: 'rgba(232,220,196,.6)' });
    y += 20;
    this._tipSlot = { top: y + 1, bottom: potTop - 26 + 20 }; // first-run bubble sits in the empty relic shelf, never over the RELICS header or the potion slots
    const per = 7, cell = 39, avail = Math.max(1, Math.floor((potTop - 26 - y) / cell));
    const cap = per * avail, over = run.relics.length > cap, shown = over ? cap - 1 : run.relics.length;
    run.relics.slice(0, shown).forEach((id, i) => {
      const cx = X + 18 + (i % per) * cell + 18, cy = y + 18 + Math.floor(i / per) * cell;
      const hv = app.inRect(cx - 18, cy - 18, 36, 36);
      app.reg('map-relic' + i, cx - 18, cy - 18, 36, 36, { group: 'left' });
      app.rr(cx - 18, cy - 18, 36, 36, 6); g.fillStyle = hv ? 'rgba(242,193,78,.2)' : 'rgba(232,220,196,.07)'; g.fill();
      drawRelic(g, id, cx, cy, 30);
      if (hv && RELICS[id]) app.tooltip(RELICS[id].name, RELICS[id].text, { color: COL.lamp });
    });
    if (over) {
      const i = shown, cx = X + 18 + (i % per) * cell + 18, cy = y + 18 + Math.floor(i / per) * cell, hv = app.inRect(cx - 18, cy - 18, 36, 36);
      app.reg('map-relic-more', cx - 18, cy - 18, 36, 36, { group: 'left' });
      app.rr(cx - 18, cy - 18, 36, 36, 6); g.fillStyle = hv ? 'rgba(242,193,78,.2)' : 'rgba(232,220,196,.07)'; g.fill();
      app.text('+' + (run.relics.length - shown), cx, cy - 8, { size: 14, ui: true, bold: true, align: 'center', fixed: true });
      if (hv) app.tooltip('More relics', run.relics.slice(shown).map((id) => (RELICS[id] ? RELICS[id].name : id)).join(', '), { color: COL.lamp });
    }
    if (!run.relics.length) app.text('None yet.', X + 18, y, { size: 14, ui: true, italic: true, color: 'rgba(232,220,196,.4)' });

    // potions
    app.text('POTIONS', X + 18, potTop - 20, { size: 13, ui: true, bold: true, color: 'rgba(232,220,196,.6)' });
    const slots = RUN.potionSlots(run);
    for (let i = 0; i < slots; i++) {
      const cx = X + 18 + i * 56 + 24, cy = potTop + 26, id = run.potions[i];
      app.reg('map-potion' + i, cx - 24, cy - 26, 48, 52, { group: 'left' });
      app.rr(cx - 24, cy - 26, 48, 52, 10); g.fillStyle = 'rgba(232,220,196,.07)'; g.fill(); g.strokeStyle = 'rgba(232,220,196,.3)'; g.lineWidth = lnw(1.5); g.setLineDash(id ? [] : [4, 4]); g.stroke(); g.setLineDash([]);
      if (id) {
        drawPotion(g, id, cx, cy, 38);
        if (app.inRect(cx - 24, cy - 26, 48, 52) && POTIONS[id]) app.tooltip(POTIONS[id].name, POTIONS[id].text + '\nUsed in combat.', { color: COL.energy });
      }
    }

    // buttons
    const dw = stack ? IW : 130, sw = stack ? IW : 128, sx = stack ? X + 18 : X + 154, sy = stack ? dY + bH + 8 : dY;
    app.reg('map-deck', X + 18, dY, dw, bH, { group: 'left' }); app.reg('map-settings', sx, sy, sw, bH, { group: 'left' }); app.reg('map-abandon', X + 18, abY, IW, aH, { group: 'left' });
    if (app.button(`Deck (${run.deck.length})`, X + 18, dY, dw, bH, { size: 18 })) app.shared.flow.openDeck();
    if (app.button('Settings', sx, sy, sw, bH, { size: 18 })) app.shared.flow.openSettings();
    if (app.button('Abandon run', X + 18, abY, IW, aH, { size: 16, fill: '#2b1a1a', stroke: 'rgba(179,38,58,.7)', color: '#e6a0a0' })) this.confirm = true;
    if (hint) app.text(hint, X + PW / 2, hintY, { size: 13, ui: true, align: 'center', color: 'rgba(232,220,196,.45)', maxW: IW });
  },

  // legend and resonance are reference panels: they follow the text scale up to 125%
  rightPanel(app, run) {
    const ts = app.textScale; app.textScale = Math.min(tscale(app), 1.25);
    try { this.rightPanelInner(app, run); } finally { app.textScale = ts; }
  },
  rightPanelInner(app, run, noNotes = false) {
    const g = app.ctx;
    const X = 968, PW = 300, Y0 = 64, PH = H - 12 - Y0; // starts under the global Pause / Fullscreen zone (x 1128..1272, y 0..56)
    if (noNotes === false) { // phones: when the legend with its notes leaves too little height for the seven school rows, it drops the notes (they move into a tooltip)
      const nH = Math.ceil(app.sz(16, { bold: true }) * 1.18), oH = Math.ceil(app.sz(14, { ui: true }) * 1.18), types0 = ['fight', 'elite', 'event', 'shop', 'forge', 'boss'];
      let ry0 = 64 + 34; for (const t of types0) ry0 += Math.max(36, nH + oH * (app.wrap(({ fight: 'gold and a graft', elite: 'relic reward', event: 'a story with choices', shop: 'buy with gold', forge: 'heal or upgrade a card', boss: 'the Act boss' })[t], 226, 14, { ui: true }).length) + 3);
      const rs0 = ry0 + 22 + Math.max(22, oH + 2) + 16 + 8 + Math.ceil(app.sz(14, { ui: true, bold: true }) * 1.2) + 6, SP0 = Math.min(38, (H - 12 - 8 - rs0) / 7);
      if (SP0 < Math.ceil(app.sz(16, { bold: true }) * 1.2) + 2) noNotes = true;
    }
    app.panel(X, Y0, PW, PH, { fill: 'rgba(22,18,16,.94)', r: 12 });
    app.reg('map-right', X, Y0, PW, PH, { group: 'right' });
    app.text('LEGEND', X + 18, Y0 + 10, { size: 14, ui: true, bold: true, color: COL.lamp });
    const types = ['fight', 'elite', 'event', 'shop', 'forge', 'boss'];
    const leg = { fight: 'Fight: gold and a graft', elite: 'Elite: relic reward', event: 'Event: a story with choices', shop: 'Shop: buy with gold', forge: 'Forge: heal or upgrade a card', boss: run.act === 3 ? 'Warden, then The Grafter' : 'Boss: ends the act' };
    // phones inflate the text: row pitch follows the real heights so name and note never overlap
    const nameH = Math.ceil(app.sz(16, { bold: true }) * 1.18), noteH = Math.ceil(app.sz(14, { ui: true }) * 1.18), LP = noNotes ? nameH + 6 : Math.max(36, nameH + noteH + 3);
    const noteL = types.map((t) => app.wrap(leg[t].split(': ')[1] || leg[t], 226, 14, { ui: true }).length), rowY = []; let ry = Y0 + 34; for (const n of noteL) { rowY.push(ry); ry += noNotes ? LP : Math.max(36, nameH + noteH * n + 3); }
    types.forEach((t, i) => {
      const y = rowY[i];
      g.fillStyle = '#1f1914'; g.beginPath(); g.arc(X + 34, y + 15, 15, 0, 6.283); g.fill(); g.strokeStyle = NODE_COL[t]; g.lineWidth = lnw(2.4); g.stroke();
      drawNodeIcon(g, t, X + 34, y + 15, 22, 'available');
      app.text(NODE_INFO[t][0], X + 58, y, { size: 16, bold: true, color: NODE_COL[t] === COL.scar ? '#e07a86' : NODE_COL[t] });
      if (!noNotes) app.text(leg[t].split(': ')[1] || leg[t], X + 58, y + nameH, { size: 14, ui: true, color: 'rgba(232,220,196,.7)', maxW: 226 });
      else if (app.inRect(X + 10, y - 2, PW - 20, LP - 2)) app.tooltip(NODE_INFO[t][0], leg[t].split(': ')[1] || leg[t]);
    });
    // path key
    const ky = ry + 22, pk = Math.max(22, noteH + 2);
    g.setLineDash([9, 6]); g.lineWidth = lnw(3); g.strokeStyle = COL.scar; g.beginPath(); g.moveTo(X + 18, ky); g.lineTo(X + 62, ky); g.stroke();
    g.strokeStyle = 'rgba(232,220,196,.5)'; g.lineWidth = lnw(2); g.beginPath(); g.moveTo(X + 18, ky + pk); g.lineTo(X + 62, ky + pk); g.stroke(); g.setLineDash([]);
    app.text('Open path', X + 72, ky - noteH / 2, { size: 14, ui: true, color: 'rgba(232,220,196,.75)' });
    app.text('Possible later', X + 72, ky + pk - noteH / 2, { size: 14, ui: true, color: 'rgba(232,220,196,.75)' });

    const divY = ky + pk + 16, hdrH = Math.ceil(app.sz(14, { ui: true, bold: true }) * 1.2), rs = divY + 8 + hdrH + 6;
    g.strokeStyle = 'rgba(232,220,196,.25)'; g.setLineDash([6, 5]); g.beginPath(); g.moveTo(X + 18, divY); g.lineTo(X + PW - 18, divY); g.stroke(); g.setLineDash([]);
    app.text('SCHOOL RESONANCE', X + 18, divY + 8, { size: 14, ui: true, bold: true, color: COL.lamp });
    const res = RUN.resonance(run);
    // rows: name over bar when the panel has the room, else name, bar and count on one line (phones inflate the text and the legend eats the height)
    const SP = Math.min(38, (Y0 + PH - 8 - rs) / 7), nmSz = app.sz(16, { bold: true });
    const roomy = SP >= Math.ceil(nmSz * 1.2) + 14;
    SCHOOLS_LIST().forEach((s, i) => {
      const y = rs + i * SP;
      const c = res.counts[s.id] || 0, tier = res.tiers[s.id] || 0;
      app.reg('map-school' + i, X + 10, y - 2, PW - 20, SP - 2, { group: 'right' });
      const hov = app.inRect(X + 10, y - 2, PW - 20, SP - 2);
      if (hov) { app.rr(X + 10, y - 2, PW - 20, SP - 2, 6); g.fillStyle = 'rgba(232,220,196,.07)'; g.fill(); }
      g.save(); g.globalAlpha = c ? 1 : 0.55;
      const rowH = SP - 2, nameW = roomy ? 150 : 84, bx = roomy ? X + 54 : X + 142, bw = roomy ? 190 : PW - 142 - 42 - 8;
      const nO = { size: 16, bold: true, color: c ? s.color : COL.vellum, fit: { w: nameW, h: Math.min(24, rowH) } }, nL = app.layoutText(s.name, nO);
      const cO = { size: 18, bold: true, align: 'right', color: tier ? COL.lamp : COL.vellum, fit: { w: 30, h: Math.min(24, rowH) } }, cL = app.layoutText(String(c), cO);
      const ny = roomy ? y : y - 2 + (rowH - nL.size) / 2 - 1, cy = roomy ? y : y - 2 + (rowH - cL.size) / 2 - 1;
      drawSchoolGlyph(g, s.id, X + 32, roomy ? y + 10 : y - 2 + rowH / 2, 11, s.color);
      app.text(s.name, roomy ? X + 54 : X + 48, ny, nO);
      app.text(String(c), X + PW - 22, cy, cO);
      // bar with ticks at 3 and 6
      const by = roomy ? y + Math.min(22, SP - 12) : y - 2 + rowH / 2 - 4;
      app.rr(bx, by, bw, 8, 4); g.fillStyle = 'rgba(232,220,196,.12)'; g.fill();
      if (c) { app.rr(bx, by, Math.max(8, bw * clamp(c / 6, 0, 1)), 8, 4); g.fillStyle = s.color; g.fill(); }
      for (const t of [3, 6]) {
        const tx = bx + bw * (t / 6) - (t === 6 ? 1 : 0);
        g.strokeStyle = c >= t ? COL.lamp : 'rgba(232,220,196,.6)'; g.lineWidth = lnw(2); g.beginPath(); g.moveTo(tx, by - 3); g.lineTo(tx, by + 11); g.stroke();
      }
      g.restore();
      if (hov) app.tooltip(s.name + ` (${c} graft${c === 1 ? '' : 's'})`, s.blurb + '\n' + (tier >= 3 ? '[ON] ' : '[3] ') + 'At 3: ' + resonanceText(s, 3) + '\n' + (tier >= 6 ? '[ON] ' : '[6] ') + 'At 6: ' + resonanceText(s, 6), { color: s.color });
    });
  },

  drawBanner(app) {
    const g = app.ctx, b = this.banner, t = b.t;
    const a = t < 0.35 ? t / 0.35 : t > 2.0 ? clamp(1 - (t - 2.0) / 0.6, 0, 1) : 1;
    g.save(); g.globalAlpha = a * 0.78; g.fillStyle = '#0a0807'; g.fillRect(0, 0, W, H); g.globalAlpha = a;
    const cy = 330, slide = (1 - EASE.out(clamp(t / 0.7, 0, 1))) * 60;
    app.reg('map-banner', 0, cy - 90, W, 180, { overlay: true });
    g.fillStyle = 'rgba(22,18,16,.95)'; g.fillRect(0, cy - 90, W, 180);
    g.strokeStyle = COL.scar; g.lineWidth = lnw(3); g.setLineDash([14, 9]);
    g.beginPath(); g.moveTo(0, cy - 88); g.lineTo(W, cy - 88); g.moveTo(0, cy + 88); g.lineTo(W, cy + 88); g.stroke(); g.setLineDash([]);
    app.text('ACT ' + ROMAN[b.act], 640 - slide, cy - 66, { size: 22, ui: true, bold: true, align: 'center', color: COL.lamp });
    app.text(ACT_NAMES[b.act], 640 + slide, cy - 36, { size: 64, bold: true, align: 'center', color: COL.vellum, shadow: true });
    const sub = { 1: 'Visiting hours are over.', 2: 'Everything here has a price tag, including you.', 3: 'The audience is already seated.' }[b.act];
    app.text(sub, 640, cy + 44, { size: 20, italic: true, align: 'center', color: 'rgba(232,220,196,.7)' });
    if (t > 0.8 && t < 2.0) app.text(app.mouse.touch ? 'tap to continue' : 'click to continue', W / 2, cy + 68, { size: 14, ui: true, align: 'center', color: 'rgba(232,220,196,.55)', alpha: clamp((t - 0.8) * 3, 0, 1) });
    g.restore();
    if ((app.mouse.pressed || app.mouse.released) && t > 0.15) b.t = Math.max(b.t, 2.0);
  },

  drawConfirm(app) {
    const g = app.ctx;
    g.fillStyle = 'rgba(8,6,5,.7)'; g.fillRect(0, 0, W, H);
    const x = 420, y = 240, w = 440, h = 220;
    app.reg('map-confirm', x, y, w, h, { overlay: true });
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
