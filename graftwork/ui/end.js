// End-of-run screen (run.phase 'dead' or 'won'): recap, the deck as you left it, unlocks, next steps.
import { titleName, deathAdvice } from '../engine/meta2.js';
import { tscale } from './graft_parts.js';
import { COL, W, H, EASE, clamp, rgba } from './core.js';
import { Fx } from './fx.js';
import { drawBackground } from '../art/backgrounds.js';
import { drawCard, CARD_W, CARD_H } from '../art/cards.js';
import { drawRelic } from '../art/icons.js';
import { cardSpec, instWeight, strainInfo } from '../engine/cards.js';
import * as RUN from '../engine/run.js';
import { HEROES, ENEMIES, RELICS, GRAFTS } from '../data/index.js';
import { ACHIEVEMENT_LIST } from '../data/achievements.js';
import { lnw } from '../art/linework.js';
import { drawPortrait } from '../art/heroes.js';
import { KIND_LABEL, GOLD, drawArt } from './archive_kit.js';
import { UP } from '../engine/unlock.js';

const GAP = 7;
const calm = (app) => !!(app.shared.meta && app.shared.meta.settings && app.shared.meta.settings.reducedMotion);

function stitch(g, x1, y1, x2, y2, col = 'rgba(232,220,196,.25)') {
  g.save(); g.strokeStyle = col; g.lineWidth = lnw(1.5); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2);
  for (let x = x1; x < x2; x += 12) { g.moveTo(x, y1 - 3); g.lineTo(x, y1 + 3); }
  g.stroke(); g.restore();
}

// largest unscaled size (down to 9) at which str fits in maxW once the text scale and the phone floor are applied
function fitSize(app, str, maxW, size) {
  let s = size;
  while (s > 9 && app.measure(str, s, { ui: true }) > maxW) s -= 1;
  return s;
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
      return { kind: 'Record', name: d ? d.name : id, text: (typeof a === 'object' && a.text) || (d ? d.text : '') };
    });
    const cf = info.caseFile; // case file: milestones earned this run -> Credit (engine/meta2.js)
    this.caseNews = cf && cf.total > 0 ? [{ kind: 'Credit', name: `+${cf.total} Credit`, text: cf.items.map((i) => i.name + (i.first ? ' (first)' : '')).join(', ') + (cf.capped ? '. Run cap reached.' : ''), rows: cf.items.map((i) => ({ n: i.name, c: i.credit, first: i.first })), capped: cf.capped }] : [];
    this.news = [...this.caseNews, ...this.unlocks, ...this.achs];
    const kb = run.killedBy && (ENEMIES[run.killedBy] ? ENEMIES[run.killedBy].name : String(run.killedBy));
    this.killer = kb || null;
    this.advice = this.won || run.abandoned ? null : deathAdvice(run);
    const a = app.shared.audio;
    if (!calm(app)) {
      if (this.won) { this.fx.flash('#ffe6a0', 0.5, 0.9); this.fx.slowmo(0.5, 500); }
      else { this.fx.flash('#b3263a', 0.35, 0.6); this.fx.shake(0.35); }
    }
    this.nextNew = 1.4;
    // ARCHIVE: Unlock Points paid by this run, the progress bar and the items opened now (stamped in one by one)
    const ul = { up: 0, parts: {}, unlockedNow: [], points: 0, nextCost: 0, percent: 0, ...(info.unlock || {}) };
    this.ul = ul; this.stampN = 0; this.stampAt = 1.1;
    this.heroNews = (info.newUnlocks || []).filter((u) => u && (u.kind === 'hero' || typeof u === 'string')).map((u) => { const id = typeof u === 'string' ? u : u.id; const h = HEROES[id]; return { id, name: h ? h.name : id, text: h ? h.title : '' }; });
    this.stamps = [...this.heroNews.map((h) => ({ hero: h })), ...(ul.unlockedNow || []).map((v) => ({ v }))];
  },
  leave(app) { app.clearTweens(this); },
  // dense recap: the text scale is honoured up to 110%
  draw(app) {
    const ts = app.textScale; app.textScale = Math.min(tscale(app), 1.1);
    try { this.drawEnd(app); } finally { app.textScale = ts; }
  },
  drawEnd(app) {
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
    const title = run.practice ? (this.won ? 'PRACTICE CLEARED' : 'PRACTICE OVER') : this.won ? 'THE GRAFTER IS UNMADE' : run.abandoned ? 'WALKED OUT' : 'FLATLINE';
    const tcol = this.won ? '#f7dc8a' : '#d9606c';
    app.reg('end-title', 240, 8, 800, 128, { group: 'title' });
    g.save(); g.globalAlpha = k;
    app.text(title, 640, 8 + (1 - k) * -14, { size: this.won ? 46 : 54, bold: true, align: 'center', color: tcol, shadow: true, stroke: 'rgba(8,6,5,.85)', strokeW: 8 });
    let sub;
    if (this.won) sub = run.loop ? `The Grafter, again. Loop ${run.loop} stands on the floor behind you.` : 'You walk out into the dawn, mostly yourself.';
    else if (run.abandoned) sub = 'The procedure was left unfinished. The ward remembers.';
    else sub = this.killer ? `${this.killer} closed the file. Act ${run.act}, floor ${run.stats.floors}.` : `The ward closed over you on floor ${run.stats.floors} of act ${run.act}.`;
    app.text(sub, 640, 68, { size: 17, italic: true, align: 'center', color: '#e0d4b8', shadow: true });
    if (!this.won && !run.abandoned && this.advice) app.text(this.advice.text, 640, 94, { size: 15, ui: true, align: 'center', color: COL.lamp, shadow: true, maxW: 1000, lineH: 18 });
    g.restore();

    this.drawRecap(app, 30, 140, 300, 508, hero);
    this.drawArchive(app, 345, 140, 640, 272, t);
    this.drawGrid(app, 345, 424, 640, 224);
    this.drawSide(app, 1000, 140, 250, 508, t);
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
  // ---- ARCHIVE panel: points earned (with the breakdown), progress to the next unlock, items opened now ----
  drawArchive(app, x, y, w, h, t) {
    const g = app.ctx, ul = this.ul, run = this.run, st = run.stats || {}, still = calm(app), done = ul.done || (ul.total && ul.unlockedCount >= ul.total);
    app.reg('end-archive', x, y, w, h, { group: 'archive' });
    app.panel(x, y, w, h, { r: 12, fill: 'rgba(30,22,10,.9)', stroke: rgba(GOLD, 0.7), lw: 2 });
    app.text('ARCHIVE', x + 18, y + 10, { size: 14, ui: true, bold: true, color: GOLD });
    const k = EASE.out(clamp((t - 0.4) / 0.6, 0, 1));
    const parts = ul.parts || {}, f1 = (v) => String(Math.round(v * 10) / 10);
    const label = { base: 'Finishing a run', floors: `Floors climbed (${st.floors || 0})`, elites: `Elites (${Math.min(6, st.elites || 0)})`, bosses: `Bosses (${st.bosses || 0})`, act: `Act ${run.act || 1} reached`, win: run.ascension ? `Victory (ascension ${run.ascension})` : 'Victory', firstKills: `First kills (${ul.newKills || 0})`, achievements: `New achievements (${ul.newAchievements || 0})` };
    const rows = Object.keys(label).filter((id) => parts[id] > 0);
    const lx = x + 18, lw = 296, pitch = Math.min(Math.ceil(app.sz(13, { ui: true }) * 1.25) + 3, (h - 34 - 62) / Math.max(1, rows.length));
    g.save(); g.globalAlpha = k;
    let yy = y + 34;
    if (run.practice) yy += app.text('Practice pays no points.', lx, yy, { size: 14, ui: true, italic: true, color: '#b7aa8c', fit: { w: lw, lines: 2, soft: true } }) + 6;
    rows.forEach((id, i) => {
      const a = clamp((t - 0.5 - i * 0.08) / 0.25, 0, 1); g.globalAlpha = k * a;
      app.text(label[id], lx, yy, { size: 13, ui: true, color: '#cdbf9d', fit: { w: lw - 54, lines: 1 } });
      app.text('+' + f1(parts[id]), lx + lw, yy, { size: 13, ui: true, bold: true, align: 'right', color: COL.lamp, fit: { w: 50, lines: 1 } });
      yy += pitch;
    });
    g.globalAlpha = k;
    stitch(g, lx, yy + 3, lx + lw, yy + 3); yy += 8;
    const tot = Math.round(ul.up * clamp((t - 0.6) / 0.8, 0, 1));
    app.text(`+${still ? ul.up : tot}`, lx, yy, { size: 30, bold: true, color: '#fbe9b0', shadow: true, fit: { w: 90, lines: 1, soft: true } });
    app.text(ul.capped ? `points, capped at ${UP.RUN_CAP}` : run.assist ? 'points (assist pays half at most)' : 'points this run', lx + 96, yy + 10, { size: 13, ui: true, color: ul.capped ? '#ffb070' : '#e0d4b8', fit: { w: lw - 96, lines: 2, soft: true } });
    g.restore();
    // right column: progress, then the stamped items
    const rx = x + 330, rw = w - 330 - 16;
    app.text(done ? 'EVERYTHING UNLOCKED' : 'NEXT UNLOCK', rx, y + 10, { size: 12, ui: true, bold: true, color: done ? '#8fe0a0' : COL.lamp, fit: { w: rw, lines: 1 } });
    let ry = y + 10 + Math.ceil(app.sz(12, { ui: true, bold: true }) * 1.2) + 6;
    const fill = done ? 1 : ul.nextCost ? clamp(ul.points / ul.nextCost, 0, 1) : 0, bk = still ? 1 : EASE.out(clamp((t - 0.5) / 1, 0, 1));
    app.rr(rx, ry, rw, 14, 7); g.fillStyle = 'rgba(8,6,5,.85)'; g.fill(); g.lineWidth = lnw(1.2); g.strokeStyle = 'rgba(232,220,196,.3)'; g.stroke();
    if (fill * bk * (rw - 2) > 1) { app.rr(rx + 1, ry + 1, fill * bk * (rw - 2), 12, 6); g.fillStyle = done ? '#8fe0a0' : GOLD; g.fill(); }
    ry += 20;
    const line = !ul.nextCost && !done ? 'Points are paid when a run ends.' : done ? 'The Archive is complete. Thank you for the long stay.' : `${ul.points} of ${ul.nextCost} points to the next unlock. ${ul.percent} percent open.`;
    ry += app.text(line, rx, ry, { size: 13, ui: true, color: '#e0d4b8', fit: { w: rw, h: 34, lines: 2, soft: true } }) + 8;
    this.drawStamps(app, rx, ry, rw, y + h - 8 - ry, t);
  },
  drawStamps(app, x, y, w, h, t) {
    const g = app.ctx, still = calm(app), audio = app.shared.audio;
    if (!this.stamps.length) { app.text(this.run.practice ? '' : 'Nothing opened this time. The points are kept.', x, y + 8, { size: 13, ui: true, italic: true, color: '#a58f6b', fit: { w, h: 36, lines: 2, soft: true } }); return; }
    const lh = Math.ceil(app.sz(11, { ui: true, bold: true }) * 1.2);
    app.text('OPENED NOW', x, y, { size: 11, ui: true, bold: true, color: '#8fe0a0', fit: { w, lines: 1 } });
    let ty = y + lh + 4, room = h - lh - 4, idx = 0;
    const heroStamp = this.stamps.find((s) => s.hero);
    const stampK = (i) => (still ? 1 : clamp((t - this.stampAt - i * 0.5) / 0.28, 0, 1));
    const trigger = (i, cx, cy, hero) => {
      if (this.stampN > i) return; this.stampN = i + 1;
      if (audio) audio.sfx(hero ? 'victory' : 'relic', { vol: 0.7 });
      if (!still) { this.fx.burst(cx, cy, 'gild', { n: hero ? 40 : 16 }); this.fx.ring(cx, cy, GOLD, hero ? 120 : 60, 0.6); if (hero) this.fx.flash('#ffe6a0', 0.35, 0.5); }
    };
    if (heroStamp) {
      const i = this.stamps.indexOf(heroStamp), k = stampK(i), bh = Math.min(64, room - 40);
      if (k > 0) trigger(i, x + 36, ty + bh / 2, true);
      g.save(); g.globalAlpha = EASE.out(k); app.rr(x, ty, w, bh, 8); g.fillStyle = 'rgba(80,58,14,.85)'; g.fill(); g.lineWidth = lnw(2); g.strokeStyle = GOLD; g.stroke();
      g.save(); app.rr(x + 2, ty + 2, 64, bh - 4, 6); g.clip(); drawPortrait(g, heroStamp.hero.id, x + 34, ty + bh - 6, 78); g.restore();
      app.text(`${heroStamp.hero.name.toUpperCase()} JOINS YOU`, x + 74, ty + 6, { size: 15, bold: true, color: '#fbe9b0', shadow: true, fit: { w: w - 82, lines: 1 } });
      app.text(heroStamp.hero.text || 'A new hero is open on the select screen.', x + 74, ty + 8 + Math.ceil(app.sz(15, { bold: true }) * 1.2), { size: 12, ui: true, italic: true, color: '#e0d4b8', fit: { w: w - 82, h: bh - 34, lines: 2 } });
      g.restore();
      ty += bh + 6; room -= bh + 6;
    }
    const items = this.stamps.filter((s) => s.v), cw = Math.floor((w - 8) / 3), chh = 62, rows = Math.max(1, Math.floor(room / (chh + 4))), shown = Math.min(items.length, rows * 3);
    if (items.length > shown) app.text(`+${items.length - shown} more in the Archive`, x + w, y, { size: 11, ui: true, italic: true, align: 'right', color: '#a58f6b', fit: { w: Math.max(60, w - app.measure('OPENED NOW', 11, { ui: true, bold: true }) - 12), lines: 1, soft: true } });
    const nameH = Math.ceil(app.sz(11, { ui: true }) * 1.2) + 4;
    for (let j = 0; j < shown; j++) {
      const v = items[j].v, i = this.stamps.indexOf(items[j]), k = stampK(i), cx0 = x + (j % 3) * (cw + 4), cy0 = ty + Math.floor(j / 3) * (chh + 4);
      if (k > 0) trigger(i, cx0 + cw / 2, cy0 + 22, false);
      const sc = 1 + (1 - EASE.out(k)) * 0.7, artH = chh - nameH - 4;
      g.save(); g.globalAlpha = EASE.out(k);
      app.rr(cx0, cy0, cw, chh, 8); g.fillStyle = 'rgba(20,15,10,.9)'; g.fill(); g.lineWidth = lnw(1.5); g.strokeStyle = rgba(GOLD, 0.6); g.stroke();
      g.save(); g.beginPath(); g.rect(cx0 + 2, cy0 + 2, cw - 4, artH); g.clip(); g.translate(cx0 + cw / 2, cy0 + 2 + artH / 2); g.scale(sc, sc); drawArt(app, v.kind, v.itemId, 0, 0, Math.min(v.kind === 'card' ? 36 : 30, artH - 2)); g.restore();
      g.fillStyle = 'rgba(8,6,5,.92)'; g.fillRect(cx0 + 2, cy0 + chh - nameH - 2, cw - 4, nameH);
      app.text(v.name, cx0 + cw / 2, cy0 + chh - nameH, { size: 11, ui: true, align: 'center', color: '#fbe9b0', fit: { w: cw - 8, lines: 1, soft: true } });
      g.restore();
      if (k >= 1 && app.inRect(cx0, cy0, cw, chh)) app.tooltip(v.name, `New ${v.kind} in the Archive. ${KIND_LABEL[v.kind] || 'Items'} you open show up in offers from the next run.`, { color: GOLD });
    }
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
      g.save(); g.strokeStyle = '#d9606c'; g.lineWidth = lnw(2.5); g.shadowColor = '#b3263a'; g.shadowBlur = 8; g.globalAlpha = 0.75; g.beginPath();
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
    app.reg('end-recap', x, y, w, h, { group: 'recap' });
    app.panel(x, y, w, h, { r: 12, fill: 'rgba(16,12,11,.88)' });
    app.text('RECAP', x + 18, y + 12, { size: 12, ui: true, bold: true, color: COL.lamp });
    { const lt = titleName(app.shared.meta); if (lt) app.text(`"${lt}"`, x + w - 18, y + 12, { size: 12, ui: true, italic: true, align: 'right', color: COL.lamp, maxW: w - 100 }); }
    app.text(hero.name, x + 18, y + 32, { size: 26, bold: true, color: hero.color === '#9E0F2E' ? '#e66a7c' : hero.color });
    app.text(hero.title, x + 18, y + 62, { size: 14, italic: true, color: '#cdbf9d' });
    if (run.assist) app.text('Assisted run', x + w - 18, y + 62, { size: 14, ui: true, bold: true, align: 'right', color: '#8fe0a0' });
    const rows = [
      ['Ascension', run.ascension || 0], ['Seed', String(run.seed).length > 16 ? String(run.seed).slice(0, 15) + '...' : run.seed],
      ['Floors climbed', st.floors], ['Fights won', st.fights - (this.won ? 0 : (run.phase === 'dead' && !run.abandoned ? 1 : 0))], ['Elites', st.elites],
      ['Grafts made', st.grafts], ['Shatters', st.shatters], ['Gold earned', st.goldEarned], ['Damage taken', st.damageTaken],
      ['Final Budget', `${s.weight} / ${s.budget}`], ['Final Strain', s.strain],
    ];
    if (run.loop) rows.splice(1, 0, ['Endless loops', run.loop]);
    if (run.daily) rows.splice(1, 0, ['Daily', run.dailyMod ? run.dailyMod.name : 'yes']);
    let yy = y + 88;
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
    app.reg('end-grid', x, y, w, h, { group: 'grid' });
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
    const small = app.scale < 0.95, ph = small ? 318 : 296; // phones: the caption under the card is taller
    app.reg('end-star', x, y, w, ph, { group: 'star' });
    app.panel(x, y, w, ph, { r: 12, fill: 'rgba(30,22,10,.88)', stroke: this.star ? rgba(COL.lamp, 0.7) : 'rgba(232,220,196,.2)' });
    if (this.star) {
      const c = this.star, pulse = calm(app) ? 0.5 : 0.5 + Math.sin(app.t * 2) * 0.5;
      app.text('YOUR MASTERPIECE', x + w / 2, y + 12, { size: 13, ui: true, bold: true, align: 'center', color: COL.lamp });
      drawCard(g, c.spec, x + w / 2, y + (small ? 128 : 140), { scale: small ? 0.46 : 0.52, tithed: this.tithed.has(c.inst.uid), glow: true });
      let cy = y + (small ? 206 : 232); // the caption is stacked from the heights it really takes
      cy += app.text(c.spec.name, x + w / 2, cy, { size: 17, bold: true, align: 'center', fit: { w: w - 20, lines: 1 } }) + 2;
      const names = c.inst.grafts.map((id) => (GRAFTS[id] ? GRAFTS[id].name : id)).join(', ');
      cy += app.text(`${c.inst.grafts.length} grafts, weight ${c.w}${c.spec.overload ? ', Overload' : ''}`, x + w / 2, cy, { size: 12, ui: true, align: 'center', color: '#d9cba8', fit: { w: w - 20, lines: 1 } }) + 2;
      app.text(names, x + w / 2, cy, { size: 11, ui: true, align: 'center', color: '#a58f6b', lineH: 13, fit: { w: w - 20, h: y + ph - 6 - cy, lines: 2 } });
      if (app.inRect(x + w / 2 - 60, y + 40, 120, 200)) { this.hover = { ...c, x: 640, y: 360 }; }
    } else {
      app.text('NO MASTERPIECE', x + w / 2, y + 100, { size: 14, ui: true, bold: true, align: 'center', color: '#8c8372' });
      app.text('Not one stitch in the deck. Clean, and unfinished.', x + w / 2, y + 126, { size: 14, italic: true, align: 'center', maxW: w - 40, color: '#b7aa8c' });
    }
    // unlocks and records
    const ny = y + ph + 12, nh = h - ph - 12;
    app.reg('end-news', x, ny, w, nh, { group: 'news' });
    app.panel(x, ny, w, nh, { r: 12, fill: 'rgba(16,12,11,.88)', stroke: this.news.length ? rgba(COL.lamp, 0.5) : undefined });
    app.text(this.news.length ? 'NEW ON THE RECORD' : 'NOTHING NEW', x + w / 2, ny + 10, { size: 12, ui: true, bold: true, align: 'center', color: this.news.length ? COL.lamp : '#8c8372' });
    // phones inflate every label, so row offsets come from the real text heights
    const kH = Math.ceil(app.sz(10, { ui: true, bold: true }) * 1.2), nH = Math.ceil(app.sz(17, { bold: true }) * 1.2), tH = Math.ceil(app.sz(12, { ui: true }) * 1.22);
    const hdrH = Math.ceil(app.sz(12, { ui: true, bold: true }) * 1.2);
    let yy = ny + 10 + hdrH + 8;
    let fitted = 0;
    // Too many entries for the full rows (a phone panel holds about one): every entry becomes ONE line (tag + name), so each is listed and none is dropped
    const estH = this.news.reduce((a, n) => a + kH + nH + (n.rows ? Math.min(n.rows.length, 2) * (tH + 2) + tH : Math.min(app.wrap(n.text || '', w - 28, 12, { ui: true }).length, 2) * tH) + 10, 0);
    if (this.news.length > 1 && yy + estH > ny + nh - 6) {
      const lH = Math.ceil(app.sz(14, { bold: true }) * 1.25) + 3, cap = Math.max(1, Math.floor((ny + nh - 6 - yy) / lH)), shownN = Math.min(this.news.length, this.news.length > cap ? cap - 1 : cap);
      for (let i = 0; i < shownN; i++) {
        const n = this.news[i], at = this.nextNew + i * 0.3, k = clamp((this.t0 - at) / 0.3, 0, 1), ty = yy + i * lH;
        if (k > 0 && this.shown <= i) { this.shown = i + 1; if (app.shared.audio) app.shared.audio.sfx(n.kind === 'Unlocked' ? 'relic' : 'gilded', { vol: 0.5 }); }
        g.save(); g.globalAlpha = EASE.out(k);
        const tag = n.kind === 'Unlocked' ? 'NEW' : n.kind === 'Credit' ? 'FILE' : 'REC', tw = Math.ceil(app.measure(tag, 10, { ui: true, bold: true })) + 8;
        app.text(tag, x + 14, ty + 2, { size: 10, ui: true, bold: true, color: n.kind === 'Unlocked' ? '#8fe0a0' : COL.lamp });
        app.text(n.name, x + 14 + tw, ty, { size: 14, bold: true, color: '#fbe9b0', fit: { w: w - 28 - tw, lines: 1 } });
        g.restore();
      }
      if (this.news.length > shownN) app.text(`and ${this.news.length - shownN} more in the Codex`, x + w / 2, ny + nh - hdrH - 8, { size: 12, ui: true, italic: true, align: 'center', color: '#a58f6b', fit: { w: w - 20, lines: 1 } });
      return;
    }
    for (let i = 0; i < this.news.length; i++) {
      const n = this.news[i];
      const lines = app.wrap(n.text || '', w - 28, 12, { ui: true }).length;
      const rowH = tH + 2, room = ny + nh - (i < this.news.length - 1 ? hdrH + 8 : 6) - yy - kH - nH - 10;
      const nRows = n.rows ? Math.max(0, Math.min(n.rows.length, Math.floor(room / rowH) - (n.rows.length > Math.floor(room / rowH) ? 1 : 0))) : 0;
      const hh = kH + nH + (n.rows ? (nRows + (nRows < n.rows.length || n.capped ? 1 : 0)) * rowH : Math.min(lines, 2) * tH) + 10;
      if (yy + hh > ny + nh - (i < this.news.length - 1 ? hdrH + 8 : 6)) break;
      fitted = i + 1;
      const at = this.nextNew + i * 0.45, k = clamp((this.t0 - at) / 0.4, 0, 1);
      if (k > 0 && this.shown <= i) { this.shown = i + 1; if (!calm(app)) { this.fx.burst(x + w / 2, yy + 14, 'gild', { n: 18 }); this.fx.ring(x + w / 2, yy + 14, COL.lamp, 70, 0.6); } if (app.shared.audio) app.shared.audio.sfx(n.kind === 'Unlocked' ? 'relic' : 'gilded', { vol: 0.7 }); }
      g.save(); g.globalAlpha = EASE.out(k); g.translate((1 - EASE.out(k)) * 30, 0);
      app.text(n.kind === 'Unlocked' ? 'UNLOCKED' : n.kind === 'Credit' ? 'CASE FILE' : 'RECORD', x + 14, yy, { size: 10, ui: true, bold: true, color: n.kind === 'Unlocked' ? '#8fe0a0' : COL.lamp });
      app.text(n.name, x + 14, yy + kH, { size: 17, bold: true, color: '#fbe9b0', shadow: true });
      if (n.rows) {
        const ry = yy + kH + nH + 2;
        n.rows.slice(0, nRows).forEach((r, j) => {
          app.text(r.n, x + 14, ry + j * rowH, { size: 12, ui: true, maxW: w - 74, color: r.first ? '#fbe9b0' : '#cdbf9d' });
          app.text(`+${r.c}`, x + w - 14, ry + j * rowH, { size: 12, ui: true, bold: true, align: 'right', color: COL.lamp });
        });
        const more = n.rows.length - nRows;
        if (more > 0 || n.capped) app.text((more > 0 ? `and ${more} more` : '') + (more > 0 && n.capped ? ', ' : '') + (n.capped ? 'run cap reached' : ''), x + 14, ry + nRows * rowH, { size: 12, ui: true, italic: true, maxW: w - 28, color: '#a58f6b' });
      } else app.text(lines > 2 ? (n.text || '').slice(0, 56) + '...' : n.text || '', x + 14, yy + kH + nH + 2, { size: 12, ui: true, maxW: w - 28, lineH: 14, color: '#cdbf9d' });
      g.restore();
      yy += hh;
    }
    if (this.news.length > fitted) app.text(`and ${this.news.length - fitted} more in the Codex`, x + w / 2, ny + nh - hdrH - 8, { size: 12, ui: true, italic: true, align: 'center', color: '#a58f6b' });
  },
  drawButtons(app, flow, run) {
    const y = 660, bh = 48;
    const btns = [];
    btns.push(['New Run', 'new']);
    if (this.won && !run.practice) btns.push(['Endless', 'endless']);
    btns.push(['Copy seed', 'copy']);
    btns.push(['Back to title', 'title']);
    const small = app.scale < 0.95, bw = btns.length > 3 ? (small ? 236 : 200) : 236, gap = small ? 12 : 18, total = btns.length * bw + (btns.length - 1) * gap;
    let x = 640 - total / 2;
    for (const [label, id] of btns) {
      const fill = id === 'new' ? '#4a3a1d' : id === 'endless' ? '#2a3a2a' : undefined;
      const stroke = id === 'new' ? COL.lamp : id === 'endless' ? '#8fe0a0' : undefined;
      const sub = id === 'new' ? `${HEROES[run.hero].name}, ascension ${run.ascension || 0}` : id === 'endless' ? 'The next loop, harder' : undefined;
      app.reg('end-btn-' + id, x, y, bw, bh, { group: 'btn' + id });
      const fitSub = sub ? fitSize(app, sub, bw - 20, 12) : 12;
      if (app.button(label, x, y, bw, bh, { size: 18, fill, stroke, sub: sub ? ' ' : undefined })) {
        if (id === 'new') flow.start({ hero: run.hero, ascension: run.ascension || 0, ...(run.assist ? { assist: run.assist } : {}) });
        else if (id === 'endless') { RUN.startLoop(run); run.phase = 'map'; run.ended = false; delete run.endInfo; flow.route(); }
        else if (id === 'copy') this.copySeed(app);
        else flow.toTitle();
      }
      if (sub) app.text(sub, x + bw / 2, y + bh - app.sz(fitSub, { ui: true }) - 5, { size: fitSub, ui: true, align: 'center', color: 'rgba(232,220,196,.7)', maxW: bw - 16 });
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
