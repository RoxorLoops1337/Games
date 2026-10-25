// End-of-run screen (run.phase 'dead' or 'won'): recap, the deck as you left it, unlocks, next steps.
import { COL, W, H, EASE, clamp, rgba } from './core.js';
import { Fx } from './fx.js';
import { drawBackground } from '../art/backgrounds.js';
import { drawCard, CARD_W, CARD_H } from '../art/cards.js';
import { drawRelic } from '../art/icons.js';
import { cardSpec, instWeight, strainInfo } from '../engine/cards.js';
import * as RUN from '../engine/run.js';
import { HEROES, ENEMIES, RELICS, GRAFTS } from '../data/index.js';
import { ACHIEVEMENT_LIST } from '../data/achievements.js';

const GAP = 7;
const calm = (app) => !!(app.shared.meta && app.shared.meta.settings && app.shared.meta.settings.reducedMotion);

function stitch(g, x1, y1, x2, y2, col = 'rgba(232,220,196,.25)') {
  g.save(); g.strokeStyle = col; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2);
  for (let x = x1; x < x2; x += 12) { g.moveTo(x, y1 - 3); g.lineTo(x, y1 + 3); }
  g.stroke(); g.restore();
}

export default {
  enter(app, params) {
    const run = (params && params.run) || app.shared.run;
    this.run = run; this.won = run.phase === 'won'; this.fx = new Fx();
    this.scroll = 0; this.t0 = 0; this.toast = null; this.shown = 0;
    const info = run.endInfo || {};
    const strain = (() => { try { return strainInfo(run); } catch { return { weight: 0, budget: 0, strain: 0, tithed: [] }; } })();
    this.strain = strain; this.tithed = new Set(strain.tithed || []);
    this.cards = run.deck.map((inst) => { let spec = null; try { spec = cardSpec(inst); } catch { /* skip broken */ } return spec ? { inst, spec, w: instWeight(inst) } : null; }).filter(Boolean);
    this.cards.sort((a, b) => b.w - a.w || b.inst.grafts.length - a.inst.grafts.length || a.inst.uid - b.inst.uid);
    this.star = this.cards.length && this.cards[0].w > 0 ? this.cards[0] : null;
    this.unlocks = (info.newUnlocks || []).map((u) => {
      if (typeof u === 'string') { const h = HEROES[u]; return { kind: 'Unlocked', name: h ? h.name : u, text: h ? h.title : '' }; }
      return { kind: 'Unlocked', name: u.name || u.id, text: u.text || '' };
    });
    this.achs = (info.newAchievements || []).map((a) => {
      const id = typeof a === 'string' ? a : a.id; const d = ACHIEVEMENT_LIST.find((x) => x.id === id) || (typeof a === 'object' ? a : null);
      return { kind: 'Record', name: d ? d.name : id, text: d ? d.text : '' };
    });
    this.news = [...this.unlocks, ...this.achs];
    const kb = run.killedBy && (ENEMIES[run.killedBy] ? ENEMIES[run.killedBy].name : String(run.killedBy));
    this.killer = kb || null;
    const a = app.shared.audio;
    if (!calm(app)) {
      if (this.won) { this.fx.flash('#ffe6a0', 0.5, 0.9); this.fx.slowmo(0.5, 500); }
      else { this.fx.flash('#b3263a', 0.35, 0.6); this.fx.shake(0.35); }
    }
    this.nextNew = 1.4;
  },
  leave(app) { app.clearTweens(this); },
  draw(app) {
    const g = app.ctx, run = this.run, fx = this.fx, flow = app.shared.flow, t = (this.t0 += app.dt);
    const still = calm(app);
    const d = fx.update(app.dt);
    const off = still ? { x: 0, y: 0 } : fx.shakeOffset();
    g.save(); g.translate(off.x, off.y);
    drawBackground(g, this.won ? 'win' : 'lose', app.t);
    this.drawAtmosphere(app, t, still);
    g.restore();
    const hero = HEROES[run.hero];
    // ---- title ----
    const k = EASE.out(clamp(t / 0.8, 0, 1));
    const title = this.won ? 'THE GRAFTER IS UNMADE' : run.abandoned ? 'WALKED OUT' : 'FLATLINE';
    const tcol = this.won ? '#f7dc8a' : '#d9606c';
    g.save(); g.globalAlpha = k;
    app.text(title, 640, 22 + (1 - k) * -14, { size: this.won ? 50 : 62, bold: true, align: 'center', color: tcol, shadow: true, stroke: 'rgba(8,6,5,.85)', strokeW: 8 });
    let sub;
    if (this.won) sub = run.loop ? `The Grafter, again. Loop ${run.loop} stands on the floor behind you.` : 'You walk out into the dawn, mostly yourself.';
    else if (run.abandoned) sub = 'The procedure was left unfinished. The ward remembers.';
    else sub = this.killer ? `${this.killer} closed the file. Act ${run.act}, floor ${run.stats.floors}.` : `The ward closed over you on floor ${run.stats.floors} of act ${run.act}.`;
    app.text(sub, 640, this.won ? 84 : 92, { size: 18, italic: true, align: 'center', color: '#e0d4b8', shadow: true });
    g.restore();

    this.drawRecap(app, 30, 128, 300, 520, hero);
    this.drawGrid(app, 345, 128, 640, 520);
    this.drawSide(app, 1000, 128, 250, 520, t);
    this.drawButtons(app, flow, run);

    // hover-enlarged card on top
    if (this.hover) {
      const hc = this.hover, s = 0.82;
      const w = CARD_W * s, h = CARD_H * s;
      const x = clamp(hc.x, 8 + w / 2, W - 8 - w / 2), y = clamp(hc.y, 8 + h / 2, H - 8 - h / 2);
      g.save(); g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, 0, W, H); g.restore();
      drawCard(g, hc.spec, x, y, { scale: s, tithed: this.tithed.has(hc.inst.uid), glow: !!this.star && hc.inst === this.star.inst });
    }
    this.hover = null;
    fx.draw(g); fx.drawFlash(g, W, H);
    if (this.toast && this.toast.t > 0) { this.toast.t -= app.dt; app.text(this.toast.msg, 640, 624, { size: 16, ui: true, align: 'center', color: COL.lamp, alpha: clamp(this.toast.t * 2, 0, 1), shadow: true }); }
  },
  drawAtmosphere(app, t, still) {
    const g = app.ctx;
    if (this.won) {
      const gr = g.createLinearGradient(0, H, 0, 0); gr.addColorStop(0, 'rgba(255,200,90,.38)'); gr.addColorStop(0.5, 'rgba(255,170,70,.10)'); gr.addColorStop(1, 'rgba(255,170,70,0)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.save(); g.globalCompositeOperation = 'lighter'; g.translate(640, H + 40);
      for (let i = 0; i < 11; i++) {
        const a = -Math.PI * (0.08 + i * 0.084) + (still ? 0 : Math.sin(t * 0.2 + i) * 0.012);
        g.fillStyle = 'rgba(255,214,120,.045)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a - 0.025) * 1500, Math.sin(a - 0.025) * 1500); g.lineTo(Math.cos(a + 0.025) * 1500, Math.sin(a + 0.025) * 1500); g.fill();
      }
      g.restore();
      if (!still && Math.random() < 0.25) this.fx.emit({ x: Math.random() * W, y: H + 10, n: 1, colors: ['#ffe9a8', '#f2c14e'], speed: 40, angle: -Math.PI / 2, spread: 0.6, life: 5, size: 2.2, gravity: -10, drag: 0.1, glow: true });
    } else {
      const vg = g.createRadialGradient(640, 360, 200, 640, 360, 800); vg.addColorStop(0, 'rgba(60,8,16,0)'); vg.addColorStop(1, 'rgba(60,8,16,.62)');
      g.fillStyle = vg; g.fillRect(0, 0, W, H);
      // flatline: the ECG head sweeps, then holds flat
      const y = 128, sweep = clamp(t / 1.6, 0, 1), hx = sweep * W;
      g.save(); g.strokeStyle = '#d9606c'; g.lineWidth = 2.5; g.shadowColor = '#b3263a'; g.shadowBlur = 8; g.globalAlpha = 0.75; g.beginPath();
      for (let x = 0; x <= hx; x += 4) {
        let yy = y;
        const dx = x - 260; if (Math.abs(dx) < 44) yy += (dx < -14 ? 0 : dx < -4 ? -40 : dx < 6 ? 48 : dx < 18 ? -20 : 0) * (1 - Math.abs(dx) / 80);
        x === 0 ? g.moveTo(x, yy) : g.lineTo(x, yy);
      }
      g.stroke(); g.restore();
      if (!still && Math.random() < 0.15) this.fx.emit({ x: Math.random() * W, y: -10, n: 1, color: '#6b5a52', speed: 20, angle: Math.PI / 2, spread: 0.5, life: 6, size: 2, gravity: 8, drag: 0.1 });
    }
  },
  drawRecap(app, x, y, w, h, hero) {
    const g = app.ctx, run = this.run, st = run.stats, s = this.strain;
    app.panel(x, y, w, h, { r: 12, fill: 'rgba(16,12,11,.88)' });
    app.text('RECAP', x + 18, y + 12, { size: 12, ui: true, bold: true, color: COL.lamp });
    app.text(hero.name, x + 18, y + 28, { size: 26, bold: true, color: hero.color === '#9E0F2E' ? '#e66a7c' : hero.color });
    app.text(hero.title, x + 18, y + 58, { size: 14, italic: true, color: '#cdbf9d' });
    const rows = [
      ['Ascension', run.ascension || 0], ['Seed', String(run.seed).length > 16 ? String(run.seed).slice(0, 15) + '...' : run.seed],
      ['Floors climbed', st.floors], ['Fights won', st.fights - (this.won ? 0 : (run.phase === 'dead' && !run.abandoned ? 1 : 0))], ['Elites', st.elites],
      ['Grafts made', st.grafts], ['Shatters', st.shatters], ['Gold earned', st.goldEarned], ['Damage taken', st.damageTaken],
      ['Final Budget', `${s.weight} / ${s.budget}`], ['Final Strain', s.strain],
    ];
    if (run.loop) rows.splice(1, 0, ['Endless loops', run.loop]);
    if (run.daily) rows.splice(1, 0, ['Daily', run.dailyMod ? run.dailyMod.name : 'yes']);
    let yy = y + 84;
    rows.forEach(([a, b], i) => {
      const reveal = clamp((this.t0 - 0.3 - i * 0.07) / 0.25, 0, 1);
      g.save(); g.globalAlpha = reveal;
      app.text(a, x + 18, yy, { size: 15, ui: true, color: '#b7aa8c' });
      const bad = a === 'Final Strain' && b > 0;
      app.text(String(b), x + w - 18, yy, { size: 17, bold: true, align: 'right', color: bad ? '#ff8a8a' : a === 'Gold earned' ? COL.gold : COL.vellum });
      g.restore();
      yy += 24;
    });
    stitch(g, x + 18, yy + 4, x + w - 18, yy + 4); yy += 16;
    app.text(`RELICS  ${run.relics.length}`, x + 18, yy, { size: 12, ui: true, bold: true, color: COL.lamp }); yy += 20;
    const sz = 32;
    run.relics.forEach((id, i) => {
      const rx = x + 18 + (i % 8) * 34, ry = yy + Math.floor(i / 8) * 36;
      drawRelic(g, id, rx + sz / 2, ry + sz / 2, sz);
      if (app.inRect(rx, ry, sz, sz)) { const r = RELICS[id]; if (r) app.tooltip(r.name, r.text, { color: COL.lamp }); }
    });
  },
  drawGrid(app, x, y, w, h) {
    const g = app.ctx;
    app.panel(x, y, w, h, { r: 12, fill: 'rgba(16,12,11,.78)' });
    app.text('THE DECK AS YOU LEFT IT', x + 18, y + 12, { size: 12, ui: true, bold: true, color: COL.lamp });
    app.text(`${this.cards.length} cards, ${this.cards.filter((c) => c.w > 0).length} grafted`, x + w - 18, y + 12, { size: 12, ui: true, align: 'right', color: '#b7aa8c' });
    const top = y + 36, viewH = h - 46, n = this.cards.length;
    let CS = 0.3, COLS = Math.floor((w - 24 + GAP) / (CARD_W * 0.3 + GAP));
    for (let cols = 4; cols <= 10; cols++) {
      const sw = (w - 24 - GAP * (cols - 1)) / cols / CARD_W, rows = Math.ceil(n / cols), sh = (viewH - GAP * (rows - 1)) / rows / CARD_H;
      const sc = Math.min(sw, sh, 0.52); if (sc > CS || cols === 4) { CS = Math.max(0.3, sc); COLS = cols; }
    }
    const cw = CARD_W * CS, ch = CARD_H * CS, gx = x + (w - (COLS * (cw + GAP) - GAP)) / 2;
    const rows = Math.ceil(this.cards.length / COLS), contentH = rows * (ch + GAP);
    const maxS = Math.max(0, contentH - viewH);
    if (app.inRect(x, y, w, h)) this.scroll = clamp(this.scroll + app.mouse.wheel * 0.6, 0, maxS);
    this.scroll = clamp(this.scroll, 0, maxS);
    g.save(); g.beginPath(); g.rect(x + 2, top - 2, w - 4, viewH + 2); g.clip();
    let hov = null;
    this.cards.forEach((c, i) => {
      const cx = gx + (i % COLS) * (cw + GAP) + cw / 2, cy = top + Math.floor(i / COLS) * (ch + GAP) + ch / 2 - this.scroll;
      if (cy + ch / 2 < top - 4 || cy - ch / 2 > top + viewH + 4) return;
      const over = app.inRect(cx - cw / 2, cy - ch / 2, cw, ch) && app.inRect(x, top, w, viewH);
      if (over) hov = { ...c, x: cx, y: cy };
      const reveal = clamp((this.t0 - 0.5 - i * 0.03) / 0.3, 0, 1);
      drawCard(g, c.spec, cx, cy + (1 - EASE.out(reveal)) * 14, { scale: CS, tithed: this.tithed.has(c.inst.uid), alpha: reveal, glow: c === this.star });
    });
    g.restore();
    if (hov) { this.hover = hov; app.cursor = 'zoom-in'; }
    if (maxS > 0) {
      const th = viewH * (viewH / contentH), ty = top + (this.scroll / maxS) * (viewH - th);
      g.save(); app.rr(x + w - 9, ty, 5, th, 3); g.fillStyle = 'rgba(232,220,196,.35)'; g.fill(); g.restore();
    }
  },
  drawSide(app, x, y, w, h, t) {
    const g = app.ctx, run = this.run;
    // masterpiece
    const ph = 296;
    app.panel(x, y, w, ph, { r: 12, fill: 'rgba(30,22,10,.88)', stroke: this.star ? rgba(COL.lamp, 0.7) : 'rgba(232,220,196,.2)' });
    if (this.star) {
      const c = this.star, pulse = calm(app) ? 0.5 : 0.5 + Math.sin(app.t * 2) * 0.5;
      app.text('YOUR MASTERPIECE', x + w / 2, y + 12, { size: 13, ui: true, bold: true, align: 'center', color: COL.lamp });
      drawCard(g, c.spec, x + w / 2, y + 140, { scale: 0.52, tithed: this.tithed.has(c.inst.uid), glow: true });
      app.text(c.spec.name, x + w / 2, y + 232, { size: 17, bold: true, align: 'center' });
      const names = c.inst.grafts.map((id) => (GRAFTS[id] ? GRAFTS[id].name : id)).join(', ');
      app.text(`${c.inst.grafts.length} grafts, weight ${c.w}${c.spec.overload ? ', Overload' : ''}`, x + w / 2, y + 254, { size: 12, ui: true, align: 'center', color: '#d9cba8' });
      app.text(names, x + w / 2, y + 270, { size: 11, ui: true, align: 'center', color: '#a58f6b', maxW: w - 20, lineH: 13 });
      if (app.inRect(x + w / 2 - 60, y + 40, 120, 200)) { this.hover = { ...c, x: 640, y: 360 }; }
    } else {
      app.text('NO MASTERPIECE', x + w / 2, y + 100, { size: 14, ui: true, bold: true, align: 'center', color: '#8c8372' });
      app.text('Not one stitch in the deck. Clean, and unfinished.', x + w / 2, y + 126, { size: 14, italic: true, align: 'center', maxW: w - 40, color: '#b7aa8c' });
    }
    // unlocks and records
    const ny = y + ph + 12, nh = h - ph - 12;
    app.panel(x, ny, w, nh, { r: 12, fill: 'rgba(16,12,11,.88)', stroke: this.news.length ? rgba(COL.lamp, 0.5) : undefined });
    app.text(this.news.length ? 'NEW ON THE RECORD' : 'NOTHING NEW ON THE RECORD', x + w / 2, ny + 10, { size: 12, ui: true, bold: true, align: 'center', color: this.news.length ? COL.lamp : '#8c8372' });
    let yy = ny + 32;
    let fitted = 0;
    for (let i = 0; i < this.news.length; i++) {
      const n = this.news[i];
      const lines = app.wrap(n.text || '', w - 28, 12, { ui: true }).length, hh = 36 + Math.min(lines, 2) * 14 + 6;
      if (yy + hh > ny + nh - (i < this.news.length - 1 ? 24 : 6)) break;
      fitted = i + 1;
      const at = this.nextNew + i * 0.45, k = clamp((this.t0 - at) / 0.4, 0, 1);
      if (k > 0 && this.shown <= i) { this.shown = i + 1; if (!calm(app)) { this.fx.burst(x + w / 2, yy + 14, 'gild', { n: 18 }); this.fx.ring(x + w / 2, yy + 14, COL.lamp, 70, 0.6); } if (app.shared.audio) app.shared.audio.sfx(n.kind === 'Unlocked' ? 'relic' : 'gilded', { vol: 0.7 }); }
      g.save(); g.globalAlpha = EASE.out(k); g.translate((1 - EASE.out(k)) * 30, 0);
      app.text(n.kind === 'Unlocked' ? 'UNLOCKED' : 'RECORD', x + 14, yy, { size: 10, ui: true, bold: true, color: n.kind === 'Unlocked' ? '#8fe0a0' : COL.lamp });
      app.text(n.name, x + 14, yy + 11, { size: 17, bold: true, color: '#fbe9b0', shadow: true });
      app.text(lines > 2 ? (n.text || '').slice(0, 56) + '...' : n.text || '', x + 14, yy + 33, { size: 12, ui: true, maxW: w - 28, lineH: 14, color: '#cdbf9d' });
      g.restore();
      yy += hh;
    }
    if (this.news.length > fitted) app.text(`and ${this.news.length - fitted} more in the Codex`, x + w / 2, ny + nh - 24, { size: 12, ui: true, italic: true, align: 'center', color: '#a58f6b' });
  },
  drawButtons(app, flow, run) {
    const y = 662, bh = 46;
    const btns = [];
    btns.push(['New Run', 'new']);
    if (this.won) btns.push(['Endless', 'endless']);
    btns.push(['Copy seed', 'copy']);
    btns.push(['Back to title', 'title']);
    const bw = 200, gap = 18, total = btns.length * bw + (btns.length - 1) * gap;
    let x = 640 - total / 2;
    for (const [label, id] of btns) {
      const fill = id === 'new' ? '#4a3a1d' : id === 'endless' ? '#2a3a2a' : undefined;
      const stroke = id === 'new' ? COL.lamp : id === 'endless' ? '#8fe0a0' : undefined;
      const sub = id === 'new' ? `${HEROES[run.hero].name}, ascension ${run.ascension || 0}` : id === 'endless' ? 'The next loop, harder' : undefined;
      if (app.button(label, x, y, bw, bh, { size: 19, fill, stroke, sub })) {
        if (id === 'new') flow.start({ hero: run.hero, ascension: run.ascension || 0 });
        else if (id === 'endless') { RUN.startLoop(run); run.phase = 'map'; run.ended = false; delete run.endInfo; flow.route(); }
        else if (id === 'copy') this.copySeed(app);
        else flow.toTitle();
      }
      x += bw + gap;
    }
  },
  copySeed(app) {
    const seed = String(this.run.seed), say = (m) => { this.toast = { msg: m, t: 2 }; };
    try {
      const cb = typeof navigator !== 'undefined' && navigator.clipboard;
      if (cb && cb.writeText) cb.writeText(seed).then(() => say('Seed copied: ' + seed), () => say('Copy blocked. Seed: ' + seed));
      else say('No clipboard here. Seed: ' + seed);
    } catch { say('Copy blocked. Seed: ' + seed); }
  },
};
