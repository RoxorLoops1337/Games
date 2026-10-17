'use strict';
// ===================== SCENES: menus, map, shop, rest, events, modals =====================
function setScene(s) { G.scene = s; G.modal = null; if (s.enter) s.enter(); }
function toast(msg) { floatText(W / 2, 140, msg, C.mustard, 34, { life: 1.6 }); }

// ---------- run ----------
function newRun(charId) {
  const ch = charById(charId);
  const run = {
    char: charId, hp: ch.hp, maxhp: ch.hp, money: 60, act: 1, pos: -1, map: null, usedEvents: [],
    deck: ch.deck.map(id => ({ id, up: false })), ndeck: ch.ndeck.map(id => ({ id, up: false })), grafts: [ch.graft],
    stats: { fights: 0, talks: 0, nodes: 0, gold: 60, start: Date.now() }
  };
  if (ch.graft === 'scrap_heart') { run.maxhp += 12; run.hp += 12; }
  run.map = genMap(1);
  return run;
}
function saveRun() { if (G.run) store.set('rg_run', G.run); }
function addGraft(run, id) {
  if (run.grafts.includes(id)) return;
  run.grafts.push(id);
  if (id === 'scrap_heart') { run.maxhp += 12; run.hp += 12; }
}
function genMap(act) {
  const cols = 9, nodes = [], byCol = [];
  const rowsFor = c => c === 0 ? 3 : c === cols ? 1 : ri(2, 4);
  let id = 0;
  for (let c = 0; c <= cols; c++) {
    const n = rowsFor(c), arr = [];
    for (let i = 0; i < n; i++) {
      const x = c === cols ? 1160 : 110 + c * 116 + rnd(-14, 14);
      const y = n === 1 ? 400 : 205 + (i + .5) / n * 420 + rnd(-18, 18);
      arr.push({ id: id++, col: c, x, y, type: 'fight', next: [], done: false });
    }
    byCol.push(arr); nodes.push(...arr);
  }
  const pickType = c => {
    const w = { fight: 46, event: 22, shop: c >= 2 ? 10 : 0, rest: c >= 2 ? 12 : 0, elite: c >= 3 ? 14 : 0, chest: c >= 3 ? 6 : 0 };
    let t = Object.values(w).reduce((a, b) => a + b, 0), r = Math.random() * t;
    for (const k in w) { r -= w[k]; if (r <= 0) return k; }
    return 'fight';
  };
  byCol.forEach((arr, c) => arr.forEach(n => {
    n.type = c === 0 ? 'fight' : c === cols ? 'boss' : c === cols - 1 ? 'rest' : pickType(c);
  }));
  // guarantee a shop in cols 3-5 and an elite in 4-7
  const guarantee = (type, c0, c1) => {
    if (nodes.some(n => n.type === type && n.col >= c0 && n.col <= c1)) return;
    const arr = byCol[ri(c0, c1)]; pick(arr).type = type;
  };
  guarantee('shop', 3, 5); guarantee('elite', 4, 7); guarantee('rest', 3, 5); guarantee('event', 1, 2);
  // edges
  for (let c = 0; c < cols; c++) {
    const a = byCol[c], b = byCol[c + 1];
    a.forEach(n => {
      const sorted = b.slice().sort((p, q) => Math.abs(p.y - n.y) - Math.abs(q.y - n.y));
      n.next.push(sorted[0].id);
      if (sorted[1] && Math.random() < .55 && c + 1 < cols) n.next.push(sorted[1].id);
    });
    b.forEach(m => {
      if (!a.some(n => n.next.includes(m.id))) {
        const near = a.slice().sort((p, q) => Math.abs(p.y - m.y) - Math.abs(q.y - m.y))[0]; near.next.push(m.id);
      }
    });
  }
  nodes.forEach(n => {
    if (n.type === 'fight') n.enc = pick(ENC[act].fight);
    else if (n.type === 'elite') n.enc = pick(ENC[act].elite);
    else if (n.type === 'boss') n.enc = pick(ENC[act].boss);
  });
  return { nodes, cols, act };
}

// ---------- HUD ----------
function drawHUD(c, run, o = {}) {
  const ch = charById(run.char);
  c.save();
  const hg = c.createLinearGradient(0, 0, 0, 58); hg.addColorStop(0, '#2a2040'); hg.addColorStop(1, '#120c20'); c.fillStyle = hg; c.fillRect(0, 0, W, 56);
  c.fillStyle = '#1fc5d8'; c.fillRect(0, 56, W, 2); c.fillStyle = C.ink; c.fillRect(0, 58, W, 3); c.fillStyle = 'rgba(31,197,216,.18)'; c.fillRect(0, 61, W, 3);
  // portrait
  c.save(); c.beginPath(); c.arc(36, 28, 23, 0, 6.3); c.clip(); c.fillStyle = C.teal; c.fillRect(0, 0, 80, 60);
  c.translate(34, 28 + 54 * .3); c.scale(.3, .3); drawFigure(c, ch.spec, { t: 0, atk: 0, talk: 0 }); c.restore();
  c.strokeStyle = C.ink; c.lineWidth = 3; c.beginPath(); c.arc(36, 28, 23, 0, 6.3); c.stroke();
  txt(c, ch.name, 66, 26, { size: 22, font: FD, color: C.cream, stroke: C.ink, sw: 4 });
  txt(c, ch.title, 66, 46, { size: 14, color: C.paper2 });
  // hp
  let x = 200;
  icon(c, 'heart', x, 28, 15); const hp = o.battle ? Math.ceil(o.battle.P.hp) : (o.neg ? run.hp : run.hp);
  txt(c, `${hp}/${run.maxhp}`, x + 22, 38, { size: 26, font: FD, color: C.cream, stroke: C.ink, sw: 4 });
  if (UI.hit(x - 18, 8, 110, 40)) tip('Health', 'Your life. Carries between encounters.');
  x = 330; icon(c, 'coin', x, 28, 15); txt(c, `${run.money}`, x + 22, 38, { size: 26, font: FD, color: C.mustard, stroke: C.ink, sw: 4 });
  if (UI.hit(x - 18, 8, 90, 40)) tip('Shil', 'The local currency. Buy cards, grafts, and favours.');
  x = 440; icon(c, 'compass', x, 28, 15); txt(c, `Act ${run.act}`, x + 22, 38, { size: 24, font: FD, color: C.cream, stroke: C.ink, sw: 4 });
  // grafts
  run.grafts.forEach((g, i) => {
    const gx = 580 + i * 40, G_ = GRAFTS[g];
    inkEll(c, gx, 28, 16, 16, C.teal, { seed: 3 + i, lw: 3, off: 0, shade: false, n: 8 });
    icon(c, G_.icon, gx, 28, 11);
    if (UI.hit(gx - 18, 8, 36, 40)) tip(G_.name, G_.desc);
  });
  if (!o.hideBtns) {
    if (UI.btn(1060, 8, 100, 38, 'DECK', { col: C.teal, size: 22 })) openDeckView('Your Decks', { b: run.deck, n: run.ndeck });
    if (UI.btn(1170, 8, 100, 38, 'MENU', { col: C.plum, size: 22 })) openPause();
  }
  c.restore();
}
function drawTip(c) {
  const t = G.tip; if (!t) return;
  c.save(); c.font = `18px ${FB}`;
  const lines = wrapLines(c, t.body || '', 260); const h = 40 + lines.length * 22;
  let x = clamp(t.x + 16, 8, W - 288), y = clamp(t.y + 20, 66, H - h - 8);
  inkRect(c, x, y, 280, h, C.cream, 5, { lw: 4, r: 8, off: 3, amp: .8 });
  txt(c, t.title, x + 14, y + 26, { size: 22, font: FD, color: C.red });
  c.fillStyle = C.ink; c.textBaseline = 'alphabetic'; lines.forEach((l, i) => c.fillText(l, x + 14, y + 50 + i * 22));
  c.restore();
}

// ---------- modals ----------
function closeModal() { G.modal = null; }
function openPileView(title, list) { openDeckView(title, { b: list }); }
function openDeckView(title, lists, o = {}) { G.modal = new DeckModal(title, lists, o); }
class DeckModal {
  constructor(title, lists, o) {
    this.title = title; this.lists = lists; this.o = o; this.tab = lists.b ? 'b' : 'n'; this.scroll = 0; this.t = 0; this.hov = -1;
    if (o.startTab) this.tab = o.startTab;
  }
  items() {
    const l = (this.lists[this.tab] || []).slice();
    if (this.o.sort !== false) l.sort((a, b) => (BC[a.id] || NC[a.id]).rarity.localeCompare((BC[b.id] || NC[b.id]).rarity) || a.id.localeCompare(b.id));
    return l;
  }
  onWheel(d) { this.scroll += d * .6; }
  onKey(k) { if (k === 'Escape') { closeModal(); if (this.o.onClose) this.o.onClose(); } }
  update(dt) { this.t += dt; }
  draw(c) {
    UI.enabled = true;
    c.fillStyle = 'rgba(15,8,3,.82)'; c.fillRect(0, 0, W, H);
    const items = this.items(); const cols = 6, sw = 170, sh = 205, x0 = (W - cols * sw) / 2 + sw / 2, top = 195;
    const rows = Math.ceil(items.length / cols), maxScroll = Math.max(0, rows * sh - (H - top - 20));
    this.scroll = clamp(this.scroll, 0, maxScroll);
    disp(c, this.title, W / 2, 56, 52, C.mustard);
    // tabs
    const tabs = Object.keys(this.lists);
    if (tabs.length > 1) tabs.forEach((k, i) => {
      const bx = W / 2 - 170 + i * 180;
      if (UI.btn(bx, 98, 160, 44, (k === 'b' ? 'BATTLE ' : 'TALK ') + `(${this.lists[k].length})`, { col: this.tab === k ? C.orange : C.grey, size: 22 })) { this.tab = k; this.scroll = 0; }
    });
    else txt(c, `${items.length} cards`, W / 2, 130, { size: 22, color: C.paper2, align: 'center' });
    if (this.o.hint) txt(c, this.o.hint, W / 2, 170, { size: 22, color: C.cream, align: 'center' });
    c.save(); c.beginPath(); c.rect(0, top - 40, W, H - top + 30); c.clip();
    let hov = -1;
    items.forEach((inst, i) => {
      const col = i % cols, row = (i / cols) | 0; const x = x0 + col * sw, y = top + 90 + row * sh - this.scroll;
      if (y < top - 120 || y > H + 120) return;
      const inside = Math.abs(In.x - x) < 70 && Math.abs(In.y - y) < 98 && In.y > top - 30;
      if (inside) hov = i;
      const d = cd(inst); const ok = this.o.canPick ? this.o.canPick(inst, this.tab) : true;
      drawCard(c, d, x, y, 0, inside ? 0.98 : 0.86, { dim: this.o.pick && !ok, glow: inside && ok && this.o.pick ? C.mustard : null });
      if (inside && In.click && this.o.pick && ok) {
        In.click = null; Snd.play('click'); closeModal(); this.o.pick(inst, this.tab); return;
      }
    });
    c.restore();
    if (hov >= 0 && this.o.preview) { const hi = items[hov]; if (hi && !hi.up) { drawCard(c, cd({ id: hi.id, up: true }), W - 150, 330, 0, 1.3, { glow: C.green }); txt(c, 'UPGRADED', W - 150, 480, { size: 26, font: FD, color: C.green, align: 'center', stroke: C.ink, sw: 5 }); } }
    if (hov >= 0) UI.cursor = this.o.pick ? 'pointer' : 'default';
    if (maxScroll > 0) { const k = this.scroll / maxScroll; c.fillStyle = C.ink; c.fillRect(W - 14, top, 6, H - top - 20); c.fillStyle = C.mustard; c.fillRect(W - 14, top + k * (H - top - 20 - 60), 6, 60); }
    if (UI.btn(W - 160, 20, 130, 46, this.o.pick ? 'CANCEL' : 'CLOSE', { col: C.red, size: 26 })) { closeModal(); if (this.o.onClose) this.o.onClose(); }
    if (!items.length) disp(c, 'Nothing here.', W / 2, 400, 40, C.paper2);
  }
}
function openPause() {
  if (G.modal) return;
  G.modal = new PauseModal();
}
class PauseModal {
  constructor() { this.view = 'main'; this.confirm = false; }
  onKey(k) { if (k === 'Escape') { if (this.view !== 'main') this.view = 'main'; else closeModal(); } }
  draw(c) {
    UI.enabled = true;
    c.fillStyle = 'rgba(15,8,3,.78)'; c.fillRect(0, 0, W, H);
    const px = W / 2 - 230, py = 90;
    inkRect(c, px, py, 460, 540, C.paper, 7, { lw: 6, r: 14, off: 6 });
    if (this.view === 'main') {
      disp(c, 'PAUSED', W / 2, py + 60, 60, C.orange);
      if (UI.btn(px + 60, py + 120, 340, 56, 'RESUME', { col: C.teal })) closeModal();
      if (G.run && UI.btn(px + 60, py + 190, 340, 56, 'VIEW DECKS', { col: C.mustard })) { closeModal(); openDeckView('Your Decks', { b: G.run.deck, n: G.run.ndeck }); }
      if (UI.btn(px + 60, py + 260, 340, 56, 'OPTIONS', { col: C.blue })) this.view = 'opt';
      if (UI.btn(px + 60, py + 330, 340, 56, 'HOW TO PLAY', { col: C.plum })) { closeModal(); openHelp(); }
      if (G.run) {
        if (!this.confirm) { if (UI.btn(px + 60, py + 420, 340, 56, 'ABANDON RUN', { col: C.red })) this.confirm = true; }
        else {
          txt(c, 'Abandon this run for good?', W / 2, py + 410, { size: 22, align: 'center' });
          if (UI.btn(px + 60, py + 425, 160, 50, 'YES', { col: C.red })) { store.del('rg_run'); G.run = null; closeModal(); go(() => setScene(new MenuScene())); }
          if (UI.btn(px + 240, py + 425, 160, 50, 'NO', { col: C.teal })) this.confirm = false;
        }
      } else if (UI.btn(px + 60, py + 420, 340, 56, 'MAIN MENU', { col: C.red })) { closeModal(); go(() => setScene(new MenuScene())); }
    } else {
      disp(c, 'OPTIONS', W / 2, py + 56, 52, C.orange);
      const s = G.settings;
      const sl = (y, label, key) => {
        txt(c, label, px + 40, y, { size: 24 });
        const sx = px + 200, sw = 210;
        c.fillStyle = C.ink; c.fillRect(sx, y - 12, sw, 8); c.fillStyle = C.orange; c.fillRect(sx, y - 12, sw * s[key], 8);
        const kx = sx + sw * s[key]; inkEll(c, kx, y - 8, 12, 12, C.mustard, { seed: 3, lw: 3, off: 0, shade: false, n: 8 });
        if (In.down && Math.abs(In.y - (y - 8)) < 22 && In.x > sx - 14 && In.x < sx + sw + 14 && In.dx > sx - 20 && In.dx < sx + sw + 20 && Math.abs(In.dy - (y - 8)) < 24) { s[key] = clamp((In.x - sx) / sw, 0, 1); Snd.updateVol(); this.dirty = true; }
      };
      sl(py + 140, 'Sound FX', 'sfx'); sl(py + 200, 'Music', 'music'); sl(py + 260, 'Screen Shake', 'shake');
      const tog = (y, label, key) => {
        txt(c, label, px + 40, y + 28, { size: 24 });
        if (UI.btn(px + 280, y, 130, 42, s[key] ? 'ON' : 'OFF', { col: s[key] ? C.green : C.grey, size: 22 })) { s[key] = s[key] ? 0 : 1; saveSettings(); }
      };
      tog(py + 290, 'Line Boil (wobble)', 'boil'); tog(py + 345, 'Fast Animations', 'fast');
      if (UI.btn(px + 60, py + 410, 340, 48, 'FULLSCREEN', { col: C.blue, size: 24 })) { try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } catch (e) { } }
      if (UI.btn(px + 60, py + 470, 340, 48, 'BACK', { col: C.teal, size: 24 })) { this.view = 'main'; saveSettings(); }
      if (!In.down && this.dirty) { saveSettings(); this.dirty = false; }
    }
  }
}
function openHelp() { G.modal = new HelpModal(); }
class HelpModal {
  constructor() { this.page = 0; }
  onKey(k) { if (k === 'Escape') closeModal(); }
  draw(c) {
    UI.enabled = true;
    c.fillStyle = 'rgba(15,8,3,.85)'; c.fillRect(0, 0, W, H);
    inkRect(c, 140, 60, 1000, 600, C.paper, 3, { lw: 6, r: 14, off: 6 });
    const pages = [
      { t: 'THE BASICS', icon: 'compass', l: ['Travel the map from left to right. Every stop is a fight, a fast talk, a shop, a campfire or a strange event.', 'Reach the BOSS at the end to clear the act. Clear both acts to rule the Rustgrift.', 'You carry two decks: a BATTLE deck of weapons and tricks, and a TALK deck of arguments and charm. Add to them after each win.'] },
      { t: 'BATTLE', icon: 'sword', l: ['Each turn you get 3 AP and draw 5 cards. Click a card (or drag it up) to play it. Click a target if it needs one.', 'Enemies telegraph their next move above their heads. Block absorbs damage. Hover icons to learn what they do.', 'Bleed hurts at turn start. Weak lowers damage dealt. Vulnerable raises damage taken. Strength adds damage.'] },
      { t: 'TALKING', icon: 'mouth', l: ['Pick TALK instead of FIGHT when an enemy can be reasoned with. Win without losing HP, and earn more shil.', 'Spend AP on Influence to wear down their Resolve. Destroy their Arguments before they pressure you or shield their core.', 'Composure soaks pressure first. If your Resolve hits zero, they get angry and the fight begins with them enraged!'] },
      { t: 'CONTROLS', icon: 'star', l: ['Mouse: click cards, drag them onto enemies, click buttons. Right-click cancels.', 'Keys: 1-9 select a card, E or Enter ends the turn, Esc opens the menu.', 'Your run auto-saves at every map stop. Use CONTINUE from the title screen.'] }
    ];
    const p = pages[this.page];
    disp(c, p.t, W / 2, 130, 64, C.orange);
    icon(c, p.icon, W / 2, 215, 44);
    c.font = `26px ${FB}`; let y = 290;
    p.l.forEach(s => { const ls = wrapLines(c, s, 860); ls.forEach(l => { txt(c, l, W / 2, y, { size: 26, align: 'center' }); y += 34; }); y += 14; });
    txt(c, `${this.page + 1} / ${pages.length}`, W / 2, 625, { size: 20, align: 'center', color: C.grey });
    if (this.page > 0 && UI.btn(170, 590, 140, 48, '< PREV', { col: C.blue, size: 24 })) this.page--;
    if (this.page < pages.length - 1 && UI.btn(970, 590, 140, 48, 'NEXT >', { col: C.teal, size: 24 })) this.page++;
    if (UI.btn(W / 2 - 80, 585, 160, 50, 'CLOSE', { col: C.red, size: 26 })) closeModal();
  }
}

// ---------- title menu ----------
class MenuScene {
  constructor() { this.t = 0; this.parts = []; }
  enter() { Snd.setMood('menu'); this.hasSave = !!store.get('rg_run', null); }
  update(dt) {
    this.t += dt;
    if (Math.random() < dt * 6) G.particles.push({ x: rnd(0, W), y: H + 10, vx: rnd(-20, 20), vy: rnd(-90, -40), life: 0, max: rnd(4, 8), size: rnd(3, 7), col: pick([C.orange, C.mustard, C.cream]), grav: 0, rot: 0, vr: rnd(-2, 2), shape: 'rect', drag: .1 });
  }
  draw(c) {
    drawBackdrop(c, 'alley', 2, G.time);
    // characters
    const poseA = { t: G.time, atk: 0, talk: 0 };
    c.save(); c.translate(330, 560); c.scale(1.45, 1.45); drawFigure(c, CHARS[0].spec, poseA); c.restore();
    c.save(); c.translate(130, 590); c.scale(1.6, 1.6); drawFigure(c, CHARS[1].spec, { t: G.time + 1, atk: 0, talk: 0 }); c.restore();
    c.save(); c.translate(960, 570); c.scale(-1.35, 1.35); drawFigure(c, ENEMIES.venn.spec, { t: G.time + 3, atk: 0, talk: 0 }); c.restore();
    c.save(); c.translate(1140, 585); c.scale(-1.45, 1.45); drawFigure(c, CHARS[2].spec, { t: G.time + 2, atk: 0, talk: 0 }); c.restore();
    c.save(); c.translate(820, 640); c.scale(-1.0, 1.0); drawFigure(c, ENEMIES.hound.spec, { t: G.time + 3, atk: 0, talk: 0 }); c.restore();
    // logo
    const k = ease.elastic(clamp(this.t * .9, 0, 1));
    c.save(); c.translate(W / 2, 150); c.rotate(-.03); c.scale(k, k);
    inkShape(c, [[-340, -78], [330, -92], [352, 0], [332, 82], [-330, 90], [-358, 6]], C.red, { seed: 21, lw: 8, off: 9, sharp: 1, amp: 2 });
    halftone(c, -340, -80, 680, 160, 'rgba(0,0,0,.15)', 10, 3, 'down');
    txt(c, 'RUSTGRIFT', 0, 28, { size: 128, font: FD, color: C.mustard, align: 'center', stroke: C.ink, sw: 16, shadow: C.orange });
    c.restore();
    txt(c, 'Fight dirty. Talk dirtier.', W / 2, 262, { size: 34, color: C.cream, align: 'center', stroke: C.ink, sw: 8, rot: -.02 });
    const bx = W / 2 - 150;
    let y = 310;
    if (this.hasSave) { if (UI.btn(bx, y, 300, 58, 'CONTINUE', { col: C.green, size: 34 })) this.cont(); y += 70; }
    if (UI.btn(bx, y, 300, 58, 'NEW RUN', { col: C.orange, size: 34 })) go(() => setScene(new CharSelectScene())); y += 70;
    if (UI.btn(bx, y, 300, 52, 'CARD CODEX', { col: C.teal, size: 28 })) go(() => setScene(new CodexScene())); y += 62;
    if (UI.btn(bx, y, 145, 48, 'HOW TO', { col: C.plum, size: 24 })) openHelp();
    if (UI.btn(bx + 155, y, 145, 48, 'OPTIONS', { col: C.blue, size: 24 })) { G.modal = new PauseModal(); G.modal.view = 'opt'; }
    txt(c, `Runs: ${G.meta.runs}   Wins: ${G.meta.wins}   Best: Act ${G.meta.best || 0}`, W / 2, 700, { size: 20, color: C.cream, align: 'center', stroke: C.ink, sw: 4 });
    txt(c, 'An original homage to deckbuilding roguelikes', W - 20, 706, { size: 14, color: C.paper2, align: 'right' });
  }
  cont() {
    const r = store.get('rg_run', null); if (!r) return;
    G.run = r; go(() => setScene(new MapScene()));
  }
}

// ---------- codex ----------
class CodexScene {
  enter() { Snd.setMood('menu'); this.open = true; this.modal(); }
  modal() {
    const all = k => Object.values(k).filter(c => c.rarity !== 'curse').map(c => ({ id: c.id, up: false }));
    G.modal = new DeckModal('Card Codex', { b: all(BC), n: all(NC) }, { onClose: () => go(() => setScene(new MenuScene())) });
  }
  update() { }
  draw(c) { drawBackdrop(c, 'night', 3, G.time); if (!G.modal) go(() => setScene(new MenuScene())); }
}

// ---------- character select ----------
class CharSelectScene {
  constructor() { this.sel = 0; this.t = 0; }
  enter() { Snd.setMood('menu'); }
  update(dt) { this.t += dt; }
  draw(c) {
    drawBackdrop(c, 'market', 6, G.time);
    disp(c, 'CHOOSE YOUR HUSTLER', W / 2, 60, 64, C.mustard);
    CHARS.forEach((ch, i) => {
      const px = 70 + i * 400, py = 105, pw = 360, ph = 520;
      const hov = UI.hit(px, py, pw, ph), sel = this.sel === i;
      c.save(); c.translate(px + pw / 2, py + ph / 2); const s = sel ? 1.03 : hov ? 1.015 : 1; c.scale(s, s); c.translate(-pw / 2, -ph / 2);
      inkRect(c, 0, 0, pw, ph, sel ? C.cream : C.paper, 3 + i, { lw: 6, r: 16, off: 7 });
      halftone(c, 10, 10, pw - 20, 200, sel ? 'rgba(221,106,44,.3)' : 'rgba(90,60,20,.15)', 11, 4, 'down');
      c.save(); c.translate(pw / 2, 270); c.scale(1.12, 1.12); drawFigure(c, ch.spec, { t: G.time + i, atk: sel ? (Math.sin(G.time * 2) > .96 ? .5 : 0) : 0, talk: 0 }); c.restore();
      disp(c, ch.name.toUpperCase(), pw / 2, 308, 48, C.orange);
      txt(c, ch.title, pw / 2, 344, { size: 22, color: C.brown, align: 'center' });
      c.font = `19px ${FB}`; const ls = wrapLines(c, ch.desc, pw - 50); ls.forEach((l, k) => txt(c, l, pw / 2, 376 + k * 23, { size: 19, align: 'center' }));
      icon(c, 'heart', 40, 462, 14); txt(c, `${ch.hp} HP`, 62, 470, { size: 22, font: FD, color: C.red });
      icon(c, 'mouth', 150, 462, 14); txt(c, `${ch.nres} Resolve`, 172, 470, { size: 22, font: FD, color: C.blue });
      const g = GRAFTS[ch.graft]; icon(c, g.icon, 40, 500, 13); txt(c, g.name + ': ' + g.desc, 62, 506, { size: 15, color: C.ink });
      c.restore();
      if (hov && In.click) { In.click = null; Snd.play('click'); this.sel = i; }
    });
    if (UI.btn(W / 2 - 150, 640, 300, 60, 'START RUN', { col: C.orange, size: 38 })) {
      G.run = newRun(CHARS[this.sel].id); G.meta.runs++; saveMeta(); saveRun();
      go(() => setScene(new MapScene({ intro: true })));
    }
    if (UI.btn(30, 650, 130, 46, 'BACK', { col: C.grey, size: 24 })) go(() => setScene(new MenuScene()));
  }
}

// ---------- map ----------
class MapScene {
  constructor(o = {}) { this.o = o; this.t = 0; this.travel = null; this.hoverId = -1; this.deco = []; }
  enter() {
    Snd.setMood('map'); const run = G.run; this.map = run.map; saveRun();
    let sd = run.act * 99 + 5; const r = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    this.deco = []; for (let i = 0; i < 26; i++) this.deco.push({ x: r() * W, y: 90 + r() * 600, k: Math.floor(r() * 4), s: .6 + r() * .8 });
    if (this.o.intro) this.banner = { t: 0, text: `ACT ${run.act}`, sub: run.act === 1 ? 'THE RUST QUARTER' : 'THE DUST BELT' };
  }
  avail() {
    const run = G.run, nodes = this.map.nodes;
    if (run.pos < 0) return nodes.filter(n => n.col === 0).map(n => n.id);
    return nodes[run.pos].next;
  }
  update(dt) {
    this.t += dt;
    if (this.banner) { this.banner.t += dt; if (this.banner.t > 2.6) this.banner = null; }
    if (this.travel) {
      const tr = this.travel; tr.t += dt * 1.5;
      if (tr.t >= 1) { const n = tr.to; this.travel = null; this.arrive(n); }
    }
  }
  arrive(n) {
    const run = G.run; run.pos = n.id; n.done = true; run.stats.nodes++; saveRun();
    go(() => enterNode(n));
  }
  nodeIcon(n) { return { fight: 'sword', elite: 'skull', shop: 'shop', rest: 'tent', event: 'question', chest: 'chest', boss: 'crown' }[n.type]; }
  nodeName(n) { return { fight: 'Skirmish', elite: 'Elite Foe', shop: 'Market Stall', rest: 'Campfire', event: 'Strange Encounter', chest: 'Hidden Cache', boss: 'BOSS' }[n.type]; }
  draw(c) {
    const run = G.run, map = this.map, nodes = map.nodes;
    drawPaper(c, run.act === 1 ? null : 'rgb(245,215,160)');
    vignette(c, .5);
    // doodle terrain
    this.deco.forEach(d => {
      c.save(); c.translate(d.x, d.y); c.scale(d.s, d.s); c.globalAlpha = .55;
      if (d.k === 0) inkShape(c, [[-40, 20], [-5, -40], [15, -10], [30, -30], [60, 20]], '#c9b98a', { seed: (d.x | 0) % 50, lw: 3, sharp: 1, shade: true });
      else if (d.k === 1) { inkShape(c, [[-6, 20], [-6, -26], [6, -26], [6, 20]], C.green, { seed: 3, lw: 3 }); inkShape(c, [[-22, -4], [-22, -22], [-14, -22], [-14, -4], [-6, -4], [-6, 2], [-22, 2]], C.green, { seed: 4, lw: 3 }); }
      else if (d.k === 2) { inkShape(c, rectPts(-18, -10, 36, 30), '#b8a374', { seed: 5, lw: 3, sharp: 1 }); inkShape(c, [[-22, -10], [0, -30], [22, -10]], C.red, { seed: 6, lw: 3, sharp: 1 }); }
      else { for (let i = 0; i < 3; i++) inkEll(c, i * 14 - 14, 4 - i % 2 * 10, 10, 8, '#a89a7a', { seed: 7 + i, lw: 2.5, n: 7 }); }
      c.restore();
    });
    // title
    disp(c, run.act === 1 ? 'The Rust Quarter' : 'The Dust Belt', W / 2, 96, 44, C.red);
    // edges
    const av = this.avail();
    nodes.forEach(n => n.next.forEach(id => {
      const m = nodes[id]; const live = (run.pos === n.id) && !this.travel;
      c.save(); c.strokeStyle = live ? C.ink : 'rgba(60,35,15,.5)'; c.lineWidth = live ? 5 : 3; c.setLineDash([2, 12]); c.lineCap = 'round';
      c.beginPath(); c.moveTo(n.x, n.y); c.quadraticCurveTo((n.x + m.x) / 2, (n.y + m.y) / 2 + Math.sin(n.id) * 14, m.x, m.y); c.stroke(); c.restore();
    }));
    // nodes
    this.hoverId = -1;
    nodes.forEach(n => {
      const a = av.includes(n.id) && !this.travel, boss = n.type === 'boss', r = boss ? 46 : n.type === 'elite' ? 34 : 29;
      const hov = a && UI.hit(n.x - r - 6, n.y - r - 6, (r + 6) * 2, (r + 6) * 2);
      if (hov) { this.hoverId = n.id; UI.cursor = 'pointer'; }
      const pulse = a ? 1 + Math.sin(G.time * 5 + n.id) * .06 : 1;
      const col = n.type === 'elite' ? C.red : n.type === 'boss' ? C.plum : n.type === 'shop' ? C.mustard : n.type === 'rest' ? C.green : n.type === 'event' ? C.sky : n.type === 'chest' ? C.orange : C.cream;
      c.save(); c.translate(n.x, n.y); const s = pulse * (hov ? 1.2 : 1); c.scale(s, s);
      if (a) { c.globalAlpha = .5 + Math.sin(G.time * 5) * .2; c.fillStyle = C.mustard; c.beginPath(); c.arc(0, 0, r + 9, 0, 6.3); c.fill(); c.globalAlpha = 1; }
      c.globalAlpha = n.done && run.pos !== n.id ? .45 : 1;
      inkEll(c, 0, 0, r, r, col, { seed: n.id + 3, lw: 4.5, n: 11 });
      icon(c, this.nodeIcon(n), 0, 0, r * .62);
      if (n.done) { c.globalAlpha = 1; inkLine(c, -r * .7, 0, -r * .15, r * .6, 6, C.ink, 1); inkLine(c, -r * .15, r * .6, r * .8, -r * .6, 6, C.ink, 2); }
      c.restore();
      if (hov) { tip(this.nodeName(n), n.type === 'fight' ? 'Fight or talk your way past.' : n.type === 'elite' ? 'A dangerous foe. Better rewards, including a Graft.' : n.type === 'boss' ? 'The big one. Prepare yourself.' : n.type === 'shop' ? 'Spend shil on cards and grafts.' : n.type === 'rest' ? 'Heal or sharpen a card.' : n.type === 'event' ? 'Something odd is happening here.' : 'Free graft inside.'); if (In.click) { In.click = null; Snd.play('click'); this.travel = { from: run.pos >= 0 ? nodes[run.pos] : { x: 40, y: 400 }, to: n, t: 0 }; } }
    });
    // player marker
    let mx, my;
    if (this.travel) { const tr = this.travel, k = ease.inOut(clamp(tr.t, 0, 1)); mx = lerp(tr.from.x, tr.to.x, k); my = lerp(tr.from.y, tr.to.y, k) - Math.sin(k * Math.PI) * 30; }
    else if (run.pos >= 0) { mx = nodes[run.pos].x; my = nodes[run.pos].y; }
    else { mx = 50; my = 410; }
    c.save(); c.translate(mx, my - 36 + Math.sin(G.time * 4) * 3); c.scale(.28, .28); drawFigure(c, charById(run.char).spec, { t: G.time * (this.travel ? 3 : 1), atk: 0, talk: 0 }); c.restore();
    txt(c, 'START', 34, 440, { size: 18, font: FD, color: C.brown, align: 'center' });
    drawHUD(c, run);
    if (this.banner) {
      const b = this.banner, k = b.t / 2.6, a = k < .1 ? k / .1 : k > .8 ? (1 - k) / .2 : 1;
      c.fillStyle = `rgba(20,10,3,${.65 * a})`; c.fillRect(0, 230, W, 200);
      disp(c, b.text, W / 2, 300, 96 * ease.out(clamp(b.t * 3, 0, 1)), C.mustard, { alpha: a });
      disp(c, b.sub, W / 2, 380, 48, C.cream, { alpha: a });
    }
  }
  onKey(k) { if (k === 'Escape') openPause(); }
}
function enterNode(n) {
  const run = G.run;
  switch (n.type) {
    case 'fight': case 'elite': case 'boss': setScene(new EncounterScene(n)); break;
    case 'shop': setScene(new ShopScene()); break;
    case 'rest': setScene(new RestScene()); break;
    case 'event': setScene(new EventScene()); break;
    case 'chest': setScene(new RewardScene({ gold: ri(20, 40), cards: [], kind: 'b', graft: rollGraft(run), chest: true })); break;
  }
}

// ---------- encounter (fight or talk) ----------
class EncounterScene {
  constructor(node) { this.node = node; this.t = 0; this.run = G.run; }
  enter() {
    Snd.setMood('battle'); const ids = this.node.enc;
    this.units = ids.map((id, i) => { const d = ENEMIES[id]; return makeUnit(d.spec, d.name, 1, 0, 455, { id, def: d }); });
    const n = this.units.length, xs = n === 1 ? [900] : n === 2 ? [790, 1010] : [700, 880, 1060];
    this.units.forEach((u, i) => { u.x = xs[i]; });
    this.leader = this.units.find(u => u.def.talk);
    const ch = charById(this.run.char); this.P = makeUnit(ch.spec, ch.name, 1, 250, 455);
    Snd.play('drum');
  }
  update(dt) { this.t += dt; }
  draw(c) {
    const act = this.run.act;
    drawBackdrop(c, (ENC[act] || ENC[1]).bg, act * 3 + 1, G.time);
    drawUnit(c, this.P, 1);
    const k = ease.out(clamp(this.t * 2, 0, 1));
    this.units.forEach((u, i) => { c.save(); c.globalAlpha = k; c.translate((1 - k) * 200, 0); drawUnit(c, u, -1); c.restore(); });
    const boss = this.node.type === 'boss', elite = this.node.type === 'elite';
    c.save(); c.translate(W / 2, 110); c.rotate(-.02);
    inkShape(c, [[-300, -50], [300, -56], [316, 0], [300, 52], [-300, 46], [-316, 4]], boss ? C.plum : elite ? C.red : C.orange, { seed: 17, lw: 6, off: 6, sharp: 1 });
    disp(c, boss ? 'BOSS ENCOUNTER' : elite ? 'ELITE ENCOUNTER' : 'ENCOUNTER!', 0, -4, 56 * ease.back(clamp(this.t * 3, 0, 1)), C.cream);
    c.restore();
    const names = this.units.map(u => u.def.name).join(' & ');
    disp(c, names, W / 2, 180, 38, C.cream);
    if (this.t > .5) {
      const by = 560;
      if (UI.btn(W / 2 - 330, by, 300, 74, 'FIGHT', { col: C.red, size: 48 })) go(() => setScene(new BattleScene({ enemies: this.node.enc, node: this.node, elite: elite, boss: boss })));
      if (this.leader) {
        const tk = this.leader.def.talk;
        if (UI.btn(W / 2 + 30, by, 300, 74, 'TALK', { col: C.teal, size: 48 })) go(() => setScene(new NegotiationScene({ enemy: this.leader.id, fightIds: this.node.enc, node: this.node, elite, boss })));
        txt(c, `Persuade ${this.leader.def.name} (${tk.core} Resolve). No HP lost on success; fail and they attack, enraged.`, W / 2 + 180, by + 100, { size: 17, color: C.cream, align: 'center', stroke: C.ink, sw: 4 });
      } else {
        inkRect(c, W / 2 + 30, by, 300, 74, C.grey, 3, { lw: 4, r: 8, off: 3 });
        disp(c, 'NO TALKING', W / 2 + 180, by + 37, 36, '#ccc');
        txt(c, 'Beasts and machines do not negotiate.', W / 2 + 180, by + 100, { size: 17, color: C.cream, align: 'center', stroke: C.ink, sw: 4 });
      }
    }
    drawHUD(c, this.run);
  }
  onKey(k) { if (k === 'Escape') openPause(); }
}

// ---------- reward ----------
class RewardScene {
  constructor(r) { this.r = r; this.t = 0; this.picked = r.cards.length === 0; this.gotGraft = !r.graft; this.shown = 0; this.goldGiven = false; this.pickAnim = null; }
  enter() {
    Snd.setMood('menu'); const run = G.run; run.stats.gold += this.r.gold; run.money += this.r.gold;
    if (this.r.talk) run.stats.talks++; else if (!this.r.chest) run.stats.fights++;
    if (this.r.boss) { run.hp = Math.min(run.maxhp, run.hp + Math.round(run.maxhp * .4)); }
    this.goldShown = 0; saveRun();
  }
  update(dt) {
    this.t += dt;
    if (this.goldShown < this.r.gold && this.t > .4) { this.goldShown = Math.min(this.r.gold, this.goldShown + Math.max(1, Math.ceil(this.r.gold * dt * 1.6))); if (Math.random() < .5) Snd.play('coin'); }
  }
  draw(c) {
    const run = G.run, r = this.r;
    drawPaper(c, 'rgb(240,200,140)'); halftone(c, 0, 0, W, 300, 'rgba(180,90,30,.2)', 14, 5, 'up'); vignette(c, .45);
    disp(c, r.chest ? 'HIDDEN CACHE' : r.talk ? 'SMOOTH TALKER!' : 'SPOILS OF WAR', W / 2, 110, 76, C.red);
    icon(c, 'coin', W / 2 - 100, 190, 26); txt(c, `+${this.goldShown} shil`, W / 2 - 60, 202, { size: 44, font: FD, color: C.orange, stroke: C.ink, sw: 8 });
    if (r.cards.length) {
      txt(c, this.picked ? 'Added to your deck!' : `Choose a ${r.kind === 'b' ? 'BATTLE' : 'TALK'} card`, W / 2, 262, { size: 28, align: 'center', color: C.brown });
      const n = r.cards.length, x0 = W / 2 - (n - 1) * 110 - (r.graft ? 130 : 0);
      r.cards.forEach((id, i) => {
        const x = x0 + i * 220, base = 470, ap = ease.out(clamp((this.t - .6 - i * .15) * 3, 0, 1));
        const y = base + (1 - ap) * 400;
        const hov = !this.picked && UI.hit(x - 90, y - 125, 180, 250);
        if (this.pickAnim && this.pickAnim.i === i) { const k = clamp((this.t - this.pickAnim.t0) * 2.5, 0, 1); drawCard(c, cd({ id, up: false }), x, y - k * 150, 0, 1.35 + k * .1, { alpha: 1 - k, glow: C.mustard }); return; }
        if (this.picked) return;
        drawCard(c, cd({ id, up: false }), x, y - (hov ? 16 : 0), hov ? 0 : (i - 1) * .03, hov ? 1.4 : 1.3, { glow: hov ? C.mustard : null });
        if (hov) { UI.cursor = 'pointer'; if (In.click) { In.click = null; this.take(i, id); } }
      });
      if (!this.picked && UI.btn(60, 640, 140, 46, 'SKIP CARD', { col: C.grey, size: 24 })) { this.picked = true; Snd.play('click'); }
    }
    if (r.graft) {
      const gx = r.cards.length ? W - 190 : W / 2, gy = r.cards.length ? 430 : 400, g = GRAFTS[r.graft];
      const hov = !this.gotGraft && UI.hit(gx - 90, gy - 120, 180, 240);
      c.save(); c.translate(gx, gy + Math.sin(G.time * 2) * 5); const s = hov ? 1.08 : 1; c.scale(s, s);
      c.globalAlpha = this.gotGraft ? .35 : 1;
      inkRect(c, -85, -115, 170, 230, C.cream, 33, { lw: 5, r: 14, off: 5 });
      disp(c, 'GRAFT', 0, -88, 30, C.teal);
      inkEll(c, 0, -32, 40, 40, C.teal, { seed: 5, lw: 5, n: 11 }); icon(c, g.icon, 0, -32, 26);
      txt(c, g.name, 0, 36, { size: 26, font: FD, color: C.orange, align: 'center' });
      c.font = `17px ${FB}`; wrapLines(c, g.desc, 150).forEach((l, i) => txt(c, l, 0, 62 + i * 20, { size: 17, align: 'center' }));
      c.restore();
      if (hov) { UI.cursor = 'pointer'; if (In.click) { In.click = null; this.gotGraft = true; addGraft(run, r.graft); Snd.play('buff'); burst(gx, gy, 40, { col: [C.teal, C.mustard, C.cream], shape: 'star', min: 100, max: 400, up: 100 }); shake(6, .2); toast(g.name + ' attached!'); } }
    }
    if (this.t > 1 && UI.btn(W / 2 - 130, 650, 260, 56, this.picked && this.gotGraft ? 'CONTINUE' : 'SKIP ALL & GO', { col: this.picked && this.gotGraft ? C.green : C.mustard, size: 30 })) this.next();
    drawHUD(c, run);
  }
  take(i, id) {
    const run = G.run; (this.r.kind === 'b' ? run.deck : run.ndeck).push({ id, up: false });
    this.picked = true; this.pickAnim = { i, t0: this.t };
    Snd.play('buff'); burst(W / 2 + (i - 1) * 220, 400, 30, { col: [C.mustard, C.cream, C.orange], shape: 'star', min: 100, max: 400 }); shake(5, .2);
  }
  next() {
    const run = G.run;
    if (this.r.boss) {
      if (run.act >= 2) { go(() => setScene(new VictoryScene())); return; }
      run.act++; run.pos = -1; run.map = genMap(run.act); run.hp = Math.min(run.maxhp, run.hp);
      go(() => setScene(new MapScene({ intro: true }))); return;
    }
    go(() => setScene(new MapScene()));
  }
}

// ---------- shop ----------
class ShopScene {
  enter() {
    Snd.setMood('menu'); const run = G.run;
    this.bcards = rollCards('b', run, 4).map(id => ({ id, sold: false, price: 0 }));
    this.ncards = rollCards('n', run, 3).map(id => ({ id, sold: false, price: 0 }));
    this.bcards.concat(this.ncards).forEach(it => { const d = BC[it.id] || NC[it.id]; it.price = Math.round(cardPrice(d) * (.85 + Math.random() * .3)); });
    const gs = Object.keys(GRAFTS).filter(g => !run.grafts.includes(g)); shuffle(gs);
    this.grafts = gs.slice(0, 2).map(id => ({ id, sold: false, price: GRAFTS[id].cost }));
    this.removeCost = 75 + 25 * (run.removed || 0); this.t = 0;
    this.shopkeeper = { kind: 'human', skin: '#c58b62', coat: '#e3a82a', accent: '#7a4b2a', hat: 'hair', hatCol: '#3a2a20', weapon: 'bottle', face: 'grin', build: 1.1, seed: 140, scarf: '#5d3b6b' };
    this.line = pick(['Everything\'s fair. Mostly.', 'No refunds. No questions.', 'Look, but don\'t touch.', 'Pay up or buzz off.']);
  }
  update(dt) { this.t += dt; }
  draw(c) {
    const run = G.run;
    drawBackdrop(c, 'market', 9, G.time);
    c.fillStyle = 'rgba(35,18,6,.55)'; c.fillRect(0, 60, W, H);
    // awning
    for (let i = 0; i < 14; i++) inkShape(c, [[i * 96 - 10, 60], [i * 96 + 86, 60], [i * 96 + 80, 112], [i * 96 + 38, 128], [i * 96 - 4, 112]], i % 2 ? C.red : C.cream, { seed: i + 5, lw: 3.5, sharp: 1, off: 0 });
    disp(c, 'THE GRIFT MARKET', W / 2, 160, 56, C.mustard);
    txt(c, 'BATTLE', 120, 205, { size: 20, font: FD, color: C.cream, stroke: C.ink, sw: 4 });
    const item = (it, x, y, kind) => {
      if (it.sold) { return; }
      const d = cd({ id: it.id }); const afford = run.money >= it.price;
      const hov = UI.hit(x - 78, y - 108, 156, 216);
      drawCard(c, d, x, y - (hov ? 8 : 0), 0, hov ? 1.0 : 0.93, { glow: hov && afford ? C.mustard : null, dim: !afford });
      c.save(); c.translate(x, y + 118); inkRect(c, -40, -4, 80, 30, afford ? C.mustard : C.grey, 5, { lw: 3, r: 8, off: 2 }); icon(c, 'coin', -22, 11, 9); txt(c, String(it.price), 4, 20, { size: 20, font: FD, color: C.ink }); c.restore();
      if (hov && In.click) { In.click = null; if (!afford) { Snd.play('error'); toast('Not enough shil'); } else { run.money -= it.price; it.sold = true; (kind === 'b' ? run.deck : run.ndeck).push({ id: it.id, up: false }); Snd.play('coin'); burst(x, y, 20, { col: [C.mustard, C.cream], shape: 'star' }); } }
    };
    this.bcards.forEach((it, i) => item(it, 160 + i * 175, 318, 'b'));
    txt(c, 'TALK', 100, 437, { size: 20, font: FD, color: C.cream, stroke: C.ink, sw: 4 });
    this.ncards.forEach((it, i) => item(it, 160 + i * 175, 556, 'n'));
    // grafts
    this.grafts.forEach((it, i) => {
      if (it.sold) return; const x = 830 + i * 150, y = 540, g = GRAFTS[it.id], afford = run.money >= it.price; const hov = UI.hit(x - 62, y - 90, 124, 180);
      c.save(); c.translate(x, y - (hov ? 6 : 0)); inkRect(c, -62, -90, 124, 150, C.cream, 40 + i, { lw: 4, r: 12, off: 4 });
      inkEll(c, 0, -46, 26, 26, C.teal, { seed: 5, lw: 4, n: 10 }); icon(c, g.icon, 0, -46, 17);
      txt(c, g.name, 0, -4, { size: 18, font: FD, color: C.orange, align: 'center' });
      c.font = `14px ${FB}`; wrapLines(c, g.desc, 108).forEach((l, k) => txt(c, l, 0, 14 + k * 15, { size: 14, align: 'center' }));
      inkRect(c, -40, 66, 80, 30, afford ? C.mustard : C.grey, 5, { lw: 3, r: 8, off: 2 }); icon(c, 'coin', -22, 81, 9); txt(c, String(it.price), 4, 91, { size: 20, font: FD, color: C.ink });
      c.restore();
      if (hov && In.click) { In.click = null; if (!afford) { Snd.play('error'); toast('Not enough shil'); } else { run.money -= it.price; it.sold = true; addGraft(run, it.id); Snd.play('buff'); burst(x, y, 30, { col: [C.teal, C.cream, C.mustard], shape: 'star' }); toast(g.name + ' installed!'); } }
    });
    txt(c, 'GRAFTS', 905, 430, { size: 20, font: FD, color: C.cream, stroke: C.ink, sw: 4 });
    // removal
    const aff = run.money >= this.removeCost;
    if (UI.btn(800, 215, 270, 60, `REMOVE CARD (${this.removeCost})`, { col: aff ? C.plum : C.grey, size: 24 })) {
      if (!aff) { Snd.play('error'); toast('Not enough shil'); } else openDeckView('Remove a Card', { b: run.deck, n: run.ndeck }, { pick: (inst, tab) => { run.money -= this.removeCost; run.removed = (run.removed || 0) + 1; this.removeCost += 25; const l = tab === 'b' ? run.deck : run.ndeck; const k = l.findIndex(q => q.id === inst.id && q.up === inst.up); if (k >= 0) l.splice(k, 1); Snd.play('stamp'); burst(W / 2, 360, 40, { col: [C.orange, C.ink], up: 100 }); toast('Card removed.'); }, hint: 'Choose a card to remove forever.' });
    }
    // shopkeeper
    c.save(); c.translate(1170, 380); c.scale(.85, .85); c.scale(-1, 1); drawFigure(c, this.shopkeeper, { t: G.time, atk: 0, talk: 0 }); c.restore();
    if (UI.hit(1100, 170, 140, 210)) tip('Shopkeeper', this.line);
    if (UI.btn(1080, 640, 170, 52, 'LEAVE', { col: C.red, size: 32 })) go(() => setScene(new MapScene()));
    drawHUD(c, run);
  }
  onKey(k) { if (k === 'Escape') openPause(); }
}

// ---------- rest ----------
class RestScene {
  enter() { Snd.setMood('menu'); this.done = false; this.msg = ''; this.t = 0; }
  update(dt) {
    this.t += dt;
    if (Math.random() < dt * 22) G.particles.push({ x: 800 + rnd(-30, 30), y: 520, vx: rnd(-30, 30), vy: rnd(-200, -90), life: 0, max: rnd(1, 2.4), size: rnd(2, 4.5), col: pick(['#ffb040', '#ff7a20', '#ffe080']), grav: -20, rot: 0, vr: 0, shape: 'circle', drag: .3 });
  }
  draw(c) {
    const run = G.run, t = G.time;
    drawBackdrop(c, 'camp', 3, t);
    // chair, backpack, bottle
    c.save(); c.translate(400, 560);
    inkShape(c, [[-60, -120], [-44, -124], [-22, -40], [-38, -34]], '#2a2438', { seed: 3, lw: 3.5, sharp: 1 });
    inkShape(c, [[-48, -34], [70, -34], [74, -24], [-44, -24]], '#3a3350', { seed: 4, lw: 3.5, sharp: 1 });
    limb(c, -40, -26, -52, 4, 6, '#2a2438', 5); limb(c, 60, -26, 74, 4, 6, '#2a2438', 6);
    c.restore();
    inkShape(c, ellPts(300, 520, 38, 46, 10), '#5c6a34', { seed: 9, lw: 3.5 }); inkShape(c, [[286, 490], [314, 490], [314, 500], [286, 500]], '#3a3a1c', { seed: 10, lw: 3, sharp: 1 });
    inkShape(c, [[212, 536], [232, 536], [232, 508], [226, 498], [218, 498], [212, 508]], '#2f6b3a', { seed: 11, lw: 3 });
    c.save(); c.translate(400, 560); drawFigure(c, charById(run.char).spec, { t: t * .6, atk: 0, talk: 0, sit: true, mug: true }); c.restore();
    drawFire(c, 800, 548, 1.25, t);
    lightPool(c, 800, 470, 520, .5, t);
    // title
    c.save(); c.translate(W / 2, 128); c.rotate(-.02);
    disp(c, 'THE CAMPFIRE', 0, 0, 96, '#f2b21c', { sw: 14 });
    c.fillStyle = '#f2b21c'; c.beginPath(); c.moveTo(-250, 56); c.quadraticCurveTo(0, 40, 270, 52); c.lineTo(262, 62); c.quadraticCurveTo(0, 54, -244, 68); c.closePath(); c.fill();
    c.restore();
    if (!this.done) {
      const heal = Math.round(run.maxhp * .35);
      if (UI.btn(W / 2 - 400, 215, 380, 100, `REST (+${heal} HP)`, { col: '#5fb03a', size: 40 })) { run.hp = Math.min(run.maxhp, run.hp + heal); this.finish(`You rest and recover ${heal} HP.`); Snd.play('heal'); burst(400, 440, 30, { col: C.green, shape: 'star', grav: -90 }); }
      if (UI.btn(W / 2 + 20, 215, 380, 100, 'SHARPEN (UPGRADE)', { col: '#f27a1a', size: 40 })) {
        openDeckView('Sharpen a Card', { b: run.deck, n: run.ndeck }, { pick: (inst, tab) => this.upgrade(inst, tab), canPick: inst => !inst.up && (BC[inst.id] || NC[inst.id]).rarity !== 'curse' && Object.keys((BC[inst.id] || NC[inst.id]).upg).length > 0, hint: 'Choose a card to upgrade.', preview: 1 });
      }
    } else {
      txt(c, this.msg, W / 2, 250, { size: 36, align: 'center', color: C.cream, stroke: C.ink, sw: 7 });
      if (UI.btn(W / 2 - 140, 280, 280, 64, 'MOVE ON', { col: C.teal, size: 38 })) go(() => setScene(new MapScene()));
    }
    drawHUD(c, run);
  }
  upgrade(inst, tab) {
    const run = G.run, l = tab === 'b' ? run.deck : run.ndeck; const k = l.findIndex(q => q.id === inst.id && q.up === inst.up);
    if (k >= 0) { l[k].up = true; Snd.play('buff'); shake(6, .2); burst(W / 2, 300, 50, { col: [C.mustard, C.cream, C.green], shape: 'star', min: 100, max: 460 }); this.finish(`${(BC[inst.id] || NC[inst.id]).name} sharpened!`); }
  }
  finish(m) { this.done = true; this.msg = m; saveRun(); }
  onKey(k) { if (k === 'Escape') openPause(); }
}

// ---------- events ----------
class EventScene {
  enter() {
    Snd.setMood('menu'); const run = G.run;
    let pool = EVENTS.filter(e => !run.usedEvents.includes(e.id)); if (!pool.length) { run.usedEvents = []; pool = EVENTS; }
    this.ev = pick(pool); run.usedEvents.push(this.ev.id); this.result = null; this.t = 0;
  }
  update(dt) { this.t += dt; }
  draw(c) {
    const run = G.run, ev = this.ev;
    drawBackdrop(c, 'night', 11, G.time); c.fillStyle = 'rgba(20,10,5,.4)'; c.fillRect(0, 0, W, H);
    inkRect(c, 200, 100, 880, 540, C.paper, 9, { lw: 7, r: 16, off: 8 });
    halftone(c, 210, 110, 860, 90, 'rgba(120,70,20,.15)', 10, 3, 'down');
    icon(c, 'question', W / 2, 168, 34);
    disp(c, ev.title, W / 2, 240, 52, C.red);
    c.font = `28px ${FB}`;
    const txtShow = this.result ? this.result.msg : ev.text; const vis = this.result ? txtShow : txtShow.slice(0, Math.floor(this.t * 80));
    wrapLines(c, txtShow, 780).forEach((l, i) => { const upto = vis.length - txtShow.split('\n').join(' ').indexOf(l); txt(c, l, 250, 300 + i * 36, { size: 28 }); });
    if (!this.result) {
      ev.opts.forEach((o, i) => {
        const ok = !o.cond || o.cond(run);
        if (UI.btn(250, 440 + i * 64, 780, 52, o.label, { col: ok ? (i === ev.opts.length - 1 ? C.grey : C.teal) : C.grey, disabled: !ok, size: 26 })) {
          const res = o.fx(run); this.result = res; saveRun(); Snd.play('stamp');
          if (res.curse) { run.deck.push({ id: 'regret', up: false }); }
          if (res.graft) addGraft(run, rollGraft(run) || 'gold_tooth');
        }
      });
    } else {
      const r = this.result;
      let y = 470;
      if (r.card && !r.taken) { if (UI.btn(250, y, 780, 52, r.rare ? 'CHOOSE A RARE CARD' : 'CHOOSE A CARD', { col: C.orange, size: 26 })) this.cardPick(r); y += 64; }
      if (r.upgrade && !r.taken) { if (UI.btn(250, y, 780, 52, 'UPGRADE A CARD', { col: C.orange, size: 26 })) openDeckView('Upgrade', { b: run.deck, n: run.ndeck }, { pick: (inst, tab) => { const l = tab === 'b' ? run.deck : run.ndeck; const k = l.findIndex(q => q.id === inst.id && q.up === inst.up); if (k >= 0) l[k].up = true; r.taken = true; Snd.play('buff'); burst(W / 2, 300, 40, { col: [C.mustard, C.green], shape: 'star' }); }, canPick: inst => !inst.up && Object.keys((BC[inst.id] || NC[inst.id]).upg).length > 0, hint: 'Choose a card to upgrade.', preview: 1 }); y += 64; }
      if (r.removeCard && !r.taken) { if (UI.btn(250, y, 780, 52, 'REMOVE A CARD', { col: C.plum, size: 26 })) openDeckView('Remove', { b: run.deck, n: run.ndeck }, { pick: (inst, tab) => { const l = tab === 'b' ? run.deck : run.ndeck; const k = l.findIndex(q => q.id === inst.id && q.up === inst.up); if (k >= 0) l.splice(k, 1); r.taken = true; Snd.play('stamp'); }, hint: 'Choose a card to remove.' }); y += 64; }
      if (r.tradeCard && !r.taken) { if (UI.btn(250, y, 780, 52, 'TRADE A CARD', { col: C.plum, size: 26 })) openDeckView('Trade Away', { b: run.deck }, { pick: (inst) => { const k = run.deck.findIndex(q => q.id === inst.id && q.up === inst.up); if (k >= 0) run.deck.splice(k, 1); const rares = Object.values(BC).filter(b => b.rarity === 'rare' && (b.cls === 'any' || b.cls === run.char)); run.deck.push({ id: pick(rares).id, up: false }); r.taken = true; Snd.play('buff'); toast('Traded for a rare card!'); }, hint: 'Choose a card to trade.' }); y += 64; }
      if (UI.btn(W / 2 - 130, 570, 260, 56, 'CONTINUE', { col: C.green, size: 32 })) go(() => setScene(new MapScene()));
    }
    drawHUD(c, run);
  }
  cardPick(r) {
    const run = G.run; const ids = rollCards('b', run, 3, { rare: !!r.rare });
    r.taken = true;
    const lists = { b: ids.map(id => ({ id, up: false })) };
    openDeckView('Choose a Card', lists, { sort: false, pick: inst => { run.deck.push({ id: inst.id, up: false }); Snd.play('buff'); toast(cd(inst).name + ' added!'); }, hint: 'Pick one to add to your deck.' });
  }
  onKey(k) { if (k === 'Escape') openPause(); }
}

// ---------- end screens ----------
function runStatsBlock(c, x, y, run) {
  const mins = Math.round((Date.now() - run.stats.start) / 60000);
  const rows = [['Fights won', run.stats.fights], ['Talks won', run.stats.talks], ['Stops visited', run.stats.nodes], ['Shil earned', run.stats.gold], ['Deck size', run.deck.length + run.ndeck.length], ['Grafts', run.grafts.length], ['Time', mins + ' min']];
  rows.forEach((r, i) => { txt(c, r[0], x - 150, y + i * 34, { size: 24, color: C.cream, stroke: C.ink, sw: 4 }); txt(c, String(r[1]), x + 150, y + i * 34, { size: 24, font: FD, color: C.mustard, align: 'right', stroke: C.ink, sw: 4 }); });
}
class GameOverScene {
  constructor(o) { this.o = o; this.t = 0; }
  enter() { Snd.setMood('menu'); store.del('rg_run'); this.run = G.run; if (this.run) G.meta.best = Math.max(G.meta.best || 0, this.run.act); saveMeta(); }
  update(dt) { this.t += dt; }
  draw(c) {
    drawBackdrop(c, 'night', 13, G.time); c.fillStyle = 'rgba(60,5,5,.55)'; c.fillRect(0, 0, W, H);
    const run = this.run; const k = ease.back(clamp(this.t * 2, 0, 1));
    c.save(); c.translate(W / 2, 140); c.rotate(-.03); c.scale(k, k); disp(c, 'ROUGHED UP', 0, 0, 120, C.red); c.restore();
    txt(c, `Left in the gutter by ${this.o.cause}.`, W / 2, 230, { size: 30, align: 'center', color: C.cream, stroke: C.ink, sw: 6 });
    if (run) { runStatsBlock(c, W / 2, 310, run); const ch = charById(run.char); c.save(); c.translate(W / 2 + 330, 520); c.rotate(1.2); drawFigure(c, ch.spec, { t: G.time * .2, atk: 0, talk: 0 }); c.restore(); }
    if (UI.btn(W / 2 - 320, 600, 300, 64, 'TRY AGAIN', { col: C.orange, size: 38 })) go(() => setScene(new CharSelectScene()));
    if (UI.btn(W / 2 + 20, 600, 300, 64, 'MAIN MENU', { col: C.teal, size: 38 })) go(() => setScene(new MenuScene()));
  }
}
class VictoryScene {
  constructor() { this.t = 0; }
  enter() { Snd.setMood('menu'); Snd.play('win'); store.del('rg_run'); this.run = G.run; G.meta.wins++; G.meta.best = 2; saveMeta(); }
  update(dt) {
    this.t += dt;
    if (Math.random() < dt * 20) G.particles.push({ x: rnd(0, W), y: -10, vx: rnd(-40, 40), vy: rnd(80, 200), life: 0, max: 6, size: rnd(5, 10), col: pick([C.mustard, C.orange, C.red, C.teal, C.cream]), grav: 30, rot: 0, vr: rnd(-6, 6), shape: 'rect', drag: .1 });
  }
  draw(c) {
    drawBackdrop(c, 'alley', 5, G.time); c.fillStyle = 'rgba(30,15,3,.35)'; c.fillRect(0, 0, W, H);
    const run = this.run, k = ease.elastic(clamp(this.t, 0, 1));
    c.save(); c.translate(W / 2, 130); c.scale(k, k); c.rotate(-.02);
    inkShape(c, [[-480, -80], [470, -92], [500, 0], [480, 84], [-470, 92], [-505, 4]], C.mustard, { seed: 5, lw: 8, off: 9, sharp: 1 });
    txt(c, 'RUSTGRIFT RULER!', 0, 28, { size: 120, font: FD, color: C.red, align: 'center', stroke: C.ink, sw: 14 }); c.restore();
    txt(c, 'You grifted, fought and sweet-talked your way to the top.', W / 2, 250, { size: 30, align: 'center', color: C.cream, stroke: C.ink, sw: 6 });
    if (run) { runStatsBlock(c, W / 2, 320, run); c.save(); c.translate(W / 2 - 360, 560); c.scale(1.3, 1.3); drawFigure(c, charById(run.char).spec, { t: G.time, atk: 0, talk: 1 }); c.restore(); }
    if (UI.btn(W / 2 - 150, 600, 300, 64, 'MAIN MENU', { col: C.teal, size: 38 })) go(() => setScene(new MenuScene()));
  }
}
