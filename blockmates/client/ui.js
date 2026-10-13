// DOM interface: hotbar, vitals, inventory + crafting, chests, chat, minimap, menus.
import { ITEMS, BLOCKS, RECIPES, PLAYER, I, MOBS, W, H } from '../shared/data.js';
import { JOB_COL } from './render.js';
import { itemIcon, drawChar, SKINS, HAIRS, SHIRTS, PANTS, HAIR_STYLES } from './art.js';

const el = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; };
const urlCache = new Map();
export function iconURL(id) { let u = urlCache.get(id); if (!u) { u = itemIcon(id).toDataURL(); urlCache.set(id, u); } return u; }

function heartIcon(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 18; const g = c.getContext('2d');
  const path = () => { g.beginPath(); g.moveTo(9, 16); g.bezierCurveTo(-3, 8, 2, -1, 9, 5); g.bezierCurveTo(16, -1, 21, 8, 9, 16); g.closePath(); };
  if (kind === 'heart') { path(); g.fillStyle = '#e63950'; g.fill(); g.strokeStyle = '#5a0c1a'; g.lineWidth = 1.5; g.stroke(); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(4, 4, 3, 2); }
  else if (kind === 'heart0') { path(); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fill(); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.2; g.stroke(); }
  else if (kind === 'food') { g.fillStyle = '#c9803a'; g.beginPath(); g.ellipse(8, 8, 6, 5, -0.5, 0, 7); g.fill(); g.strokeStyle = '#4a280e'; g.lineWidth = 1.5; g.stroke(); g.fillStyle = '#f2ead0'; g.fillRect(12, 11, 3, 6); g.beginPath(); g.arc(14, 17, 2, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(4, 5, 4, 2); }
  else if (kind === 'food0') { g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(8, 8, 6, 5, -0.5, 0, 7); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.3)'; g.stroke(); }
  else if (kind === 'bubble') { g.fillStyle = 'rgba(150,210,255,0.5)'; g.beginPath(); g.arc(9, 9, 6.5, 0, 7); g.fill(); g.strokeStyle = '#d6efff'; g.lineWidth = 1.5; g.stroke(); g.fillStyle = '#fff'; g.fillRect(6, 5, 2, 2); }
  return c.toDataURL();
}

export class UI {
  constructor(G) {
    this.G = G; this.open = null; this.pick = null; this.filter = ''; this.cat = 'all'; this.chatOpen = false; this.toastT = 0;
    this.icons = { heart: heartIcon('heart'), heart0: heartIcon('heart0'), food: heartIcon('food'), food0: heartIcon('food0'), bubble: heartIcon('bubble') };
    this.root = document.getElementById('hud');
    this.build();
  }
  build() {
    const r = this.root;
    r.innerHTML = '';
    this.vitals = el('div', 'vitals', r);
    this.hearts = el('div', 'row', this.vitals); this.foods = el('div', 'row', this.vitals); this.bubbles = el('div', 'row', this.vitals);
    this.clock = el('div', 'clock', r);
    this.fs = el('button', 'fsbtn', r); this.fs.textContent = '⛶'; this.fs.title = 'Full screen'; this.fs.onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else this.G.goFullscreen && this.G.goFullscreen(); };
    this.mapBox = el('div', 'mapbox', r); this.mapCv = el('canvas', '', this.mapBox); this.mapCv.width = 180; this.mapCv.height = 110;
    this.hotbar = el('div', 'hotbar', r);
    this.hotSlots = [];
    for (let i = 0; i < PLAYER.hotbar; i++) {
      const s = this.slotEl(this.hotbar); s.dataset.k = 'inv'; s.dataset.i = i;
      const n = el('span', 'key', s); n.textContent = (i + 1) % 10;
      s.onmousedown = (e) => { e.stopPropagation(); if (this.open) this.slotClick(e, 'inv', i); else this.G.selectSlot(i); };
      this.hotSlots.push(s);
    }
    this.chat = el('div', 'chat', r); this.chatLog = el('div', 'log', this.chat);
    this.chatIn = el('input', 'chatin', this.chat); this.chatIn.maxLength = 150; this.chatIn.placeholder = 'Say something. Enter sends, Esc cancels.';
    this.chatIn.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { const t = this.chatIn.value.trim(); if (t) this.G.send({ t: 'chat', text: t }); this.closeChat(); }
      else if (e.key === 'Escape') this.closeChat();
    };
    this.boss = el('div', 'bossbar', r); this.boss.innerHTML = '<b></b><div><i></i></div>';
    this.feed = el('div', 'feed', r);
    this.toast = el('div', 'toast', r);
    this.players = el('div', 'playerlist', r);
    this.tip = el('div', 'tip', r);
    this.hover = el('div', 'hovertip', r);
    this.panel = el('div', 'panel hidden', r);
    this.modal = el('div', 'modal hidden', r);
    this.death = el('div', 'death hidden', r); this.death.innerHTML = '<div><h1>You fell over</h1><p>Getting back up...</p></div>';
    this.status = el('div', 'status', r);
    this.touch();
    // drag and drop: pick a slot up, move the mouse, let go over another slot
    addEventListener('mousemove', (e) => {
      if (!this.pick || !this.dragStart || !this.open || this.open === 'trade') { this.ghost && this.ghost.remove(); this.ghost = null; return; }
      if (Math.hypot(e.clientX - this.dragStart.x, e.clientY - this.dragStart.y) < 8) return;
      const src = this.pick[0] === 'inv' ? this.G.inv[this.pick[1]] : this.pick[0] === 'armor' ? this.G.armor[this.pick[1]] : this.G.chest && this.G.chest.inv[this.pick[1]];
      if (!src) return;
      if (!this.ghost) { this.ghost = el('img', 'dragghost', this.root); this.ghost.src = iconURL(src.id); }
      this.ghost.style.left = e.clientX - 20 + 'px'; this.ghost.style.top = e.clientY - 20 + 'px';
    });
    addEventListener('mouseup', (e) => {
      if (this.ghost) { this.ghost.remove(); this.ghost = null; }
      if (!this.pick || !this.dragStart || !this.open || this.open === 'trade') return;
      if (Math.hypot(e.clientX - this.dragStart.x, e.clientY - this.dragStart.y) < 8) return;
      const t = document.elementFromPoint(e.clientX, e.clientY);
      const slot = t && t.closest && t.closest('.slot');
      this.dragStart = null;
      if (!slot || !slot.dataset.k) return;
      const [pk, pi, half] = this.pick; this.pick = null;
      const src = pk === 'inv' ? this.G.inv[pi] : pk === 'armor' ? this.G.armor[pi] : this.G.chest && this.G.chest.inv[pi];
      const n = half && src && src.n > 1 ? Math.ceil(src.n / 2) : undefined;
      if (!(pk === slot.dataset.k && pi === +slot.dataset.i)) this.G.send({ t: 'move', from: [pk, pi], to: [slot.dataset.k, +slot.dataset.i], n });
      this.renderPanel();
    });
  }
  slotEl(parent) {
    const s = el('div', 'slot', parent);
    const img = el('img', '', s); img.draggable = false; img.style.display = 'none';
    el('span', 'cnt', s); const d = el('div', 'dur', s); el('i', '', d);
    return s;
  }
  fill(s, st) {
    const img = s.children[0], cnt = s.querySelector('.cnt'), dur = s.querySelector('.dur');
    if (!st) { img.style.display = 'none'; cnt.textContent = ''; dur.style.display = 'none'; s.title = ''; return; }
    const def = ITEMS[st.id];
    img.style.display = 'block'; const u = iconURL(st.id); if (img.src !== u) img.src = u;
    cnt.textContent = st.n > 1 ? st.n : '';
    if (st.d && def.dur) { dur.style.display = 'block'; const f = Math.max(0, st.d / def.dur); const b = dur.firstChild; b.style.width = f * 100 + '%'; b.style.background = f > 0.5 ? '#6fcf4a' : f > 0.2 ? '#f2d33c' : '#e24a4a'; }
    else dur.style.display = 'none';
  }

  // ------------------------------------------------------------ per-frame updates
  update() {
    const G = this.G;
    if (!G.joined) return;
    this.hotSlots.forEach((s, i) => { this.fill(s, G.inv[i]); s.classList.toggle('sel', i === G.sel); s.classList.toggle('pick', !!this.pick && this.pick[0] === 'inv' && this.pick[1] === i); });
    const hp = Math.ceil(G.hp / 2), food = Math.ceil(G.food / 2);
    if (this._v !== hp + '|' + food + '|' + Math.ceil(G.breath)) {
      this._v = hp + '|' + food + '|' + Math.ceil(G.breath);
      this.hearts.innerHTML = Array.from({ length: PLAYER.hp / 2 }, (_, i) => `<img src="${i < hp ? this.icons.heart : this.icons.heart0}">`).join('');
      this.foods.innerHTML = Array.from({ length: PLAYER.food / 2 }, (_, i) => `<img src="${i < food ? this.icons.food : this.icons.food0}">`).join('');
      this.bubbles.innerHTML = G.breath < 10 ? Array.from({ length: Math.ceil(G.breath) }, () => `<img src="${this.icons.bubble}">`).join('') : '';
    }
    const t = G.time / 600, hh = Math.floor(((t * 24 + 6) % 24)), mm = Math.floor((((t * 24 + 6) % 1) * 60) / 10) * 10;
    this.clock.textContent = `Day ${G.day}  ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    this.death.classList.toggle('hidden', !G.me.dead);
    this.status.textContent = G.status;
    if (this.toastT > 0) { this.toastT -= 1 / 60; if (this.toastT <= 0) this.toast.classList.remove('on'); }
    // chat fade
    const now = performance.now();
    for (const c of this.chatLog.children) c.classList.toggle('old', !this.chatOpen && now - c._t > 9000);
    let boss = null;
    for (const m of G.mobs.values()) if (MOBS[m.type].boss) boss = m;
    this.boss.classList.toggle('on', !!boss);
    if (boss) { this.boss.firstChild.textContent = MOBS[boss.type].name; this.boss.querySelector('i').style.width = Math.max(0, boss.hp / MOBS[boss.type].hp * 100) + '%'; }
    this.players.classList.toggle('on', G.showPlayers);
    if (G.showPlayers && now - (this._plT || 0) > 400) {
      this._plT = now;
      this.players.innerHTML = `<h3>${G.worldName} <small>${G.players.size} online</small></h3>` + [...G.players.values()].map((p) => `<div class="pl"><canvas width="26" height="34" data-id="${p.id}"></canvas><b>${esc(p.name)}</b><span>${p.id === G.myId ? G.ping + ' ms' : ''}</span></div>`).join('');
      for (const cv of this.players.querySelectorAll('canvas')) drawChar(cv, G.players.get(+cv.dataset.id).look);
    }
  }
  emoteBar() {
    if (this.modalOpen && this.modal.querySelector('.emotes')) { this.hideModal(); return; }
    const E = ['♥', '!', '?', '♪', '☺', '✦', 'zZ', '☀', '☠'];
    this.showModal(`<div class="card"><h2>Emote</h2><div class="emotes">${E.map((e, i) => `<button data-e="${i + 1}">${e}</button>`).join('')}</div></div>`, (m) => {
      m.querySelectorAll('.emotes button').forEach((b) => { b.onclick = () => { this.G.send({ t: 'emote', e: +b.dataset.e }); this.hideModal(); }; });
      m.onclick = (ev) => { if (ev.target === m) this.hideModal(); };
    });
  }
  // "+3 Logs" lines when the backpack grows
  pickupFeed(inv) {
    const now = new Map();
    for (const st of inv) if (st) now.set(st.id, (now.get(st.id) || 0) + st.n);
    if (this._counts) for (const [id, n] of now) {
      const d = n - (this._counts.get(id) || 0);
      if (d > 0 && ITEMS[id]) {
        const row = el('div', 'feedrow', this.feed); row.innerHTML = `<img src="${iconURL(id)}"><b>+${d}</b> ${esc(ITEMS[id].label)}`;
        setTimeout(() => row.classList.add('gone'), 2200); setTimeout(() => row.remove(), 2800);
        while (this.feed.children.length > 6) this.feed.firstChild.remove();
      }
    }
    this._counts = now;
  }
  hoverText(text, x, y) {
    if (!text) { if (this._ht) { this.hover.style.display = 'none'; this._ht = ''; } return; }
    if (text !== this._ht) { this.hover.textContent = text; this.hover.style.display = 'block'; this._ht = text; }
    this.hover.style.left = x + 16 + 'px'; this.hover.style.top = y + 18 + 'px';
  }
  say(from, text, sys) {
    const d = el('div', 'msg' + (sys ? ' sys' : ''), this.chatLog); d._t = performance.now();
    d.innerHTML = (from ? `<b>${esc(from)}</b> ` : '') + esc(text);
    while (this.chatLog.children.length > 60) this.chatLog.firstChild.remove();
    this.chatLog.scrollTop = 1e6;
  }
  showToast(text) { this.toast.textContent = text; this.toast.classList.add('on'); this.toastT = 2.6; }
  openChat(pre = '') { this.chatOpen = true; this.chat.classList.add('open'); this.chatIn.value = pre; this.chatIn.focus(); }
  closeChat() { this.chatOpen = false; this.chat.classList.remove('open'); this.chatIn.blur(); this.chatIn.value = ''; }

  // ------------------------------------------------------------ inventory panel
  toggleInv(force) {
    if (this.open === 'trade') { this.closePanel(); return; }
    if (this.open === 'inv' && force !== 'keep') { this.closePanel(); return; }
    this.open = 'inv'; this.pick = null; this.renderPanel();
  }
  closePanel() {
    if (this.open === 'trade') { this.G.send({ t: 'tradecancel' }); this.trade = null; }
    if (this.open === 'chest' || this.G.chest) this.G.send({ t: 'chestclose' });
    this.G.chest = null; this.open = null; this.pick = null; this.panel.classList.add('hidden'); this.tip.classList.remove('on');
  }
  openChest() { this.open = 'chest'; this.pick = null; this.renderPanel(); }
  renderPanel() {
    const G = this.G, p = this.panel;
    p.classList.remove('hidden');
    p.innerHTML = '';
    const left = el('div', 'col', p);
    if (this.open === 'chest' && G.chest) {
      el('h3', '', left).textContent = 'Chest';
      const grid = el('div', 'grid chest', left);
      G.chest.inv.forEach((st, i) => { const s = this.slotEl(grid); s.dataset.k = 'chest'; s.dataset.i = i; this.fill(s, st); s.onmousedown = (e) => this.slotClick(e, 'chest', i); s.onmouseenter = () => this.showTip(st); s.onmouseleave = () => this.tip.classList.remove('on'); });
    }
    el('h3', '', left).textContent = 'Backpack';
    const arm = el('div', 'armor', left);
    ['Head', 'Body', 'Feet'].forEach((n, i) => { const s = this.slotEl(arm); s.classList.add('arm'); s.dataset.ph = n; s.dataset.k = 'armor'; s.dataset.i = i; this.fill(s, G.armor[i]); s.onmousedown = (e) => this.slotClick(e, 'armor', i); s.onmouseenter = () => this.showTip(G.armor[i]); s.onmouseleave = () => this.tip.classList.remove('on'); });
    const sum = el('div', 'armsum', arm); sum.textContent = 'Armor ' + G.armor.reduce((a, s) => a + (s ? ITEMS[s.id].armor : 0), 0);
    const grid = el('div', 'grid', left);
    for (let i = 0; i < PLAYER.inv; i++) { const s = this.slotEl(grid); s.dataset.k = 'inv'; s.dataset.i = i; this.fill(s, G.inv[i]); if (i < 10) s.classList.add('hot'); if (this.pick && this.pick[0] === 'inv' && this.pick[1] === i) s.classList.add('pick'); s.onmousedown = (e) => this.slotClick(e, 'inv', i); s.onmouseenter = () => this.showTip(G.inv[i]); s.onmouseleave = () => this.tip.classList.remove('on'); }
    const hint = el('p', 'hint', left); hint.textContent = 'Click a slot, then another to move or swap. Right click moves half. Q drops the held item.';
    // crafting
    const right = el('div', 'col craft', p);
    el('h3', '', right).textContent = 'Crafting';
    const tools = el('div', 'tools', right);
    const search = el('input', '', tools); search.placeholder = 'Search'; search.value = this.filter; search.onkeydown = (e) => e.stopPropagation();
    search.oninput = () => { this.filter = search.value.toLowerCase(); this.renderRecipes(list); };
    for (const c of ['all', 'tools', 'blocks', 'food', 'stuff']) { const b = el('button', this.cat === c ? 'on' : '', tools); b.textContent = c; b.onclick = () => { this.cat = c; this.renderPanel(); }; }
    const list = el('div', 'recipes', right);
    this.renderRecipes(list);
    const close = el('button', 'x', p); close.textContent = '×'; close.onclick = () => this.closePanel();
  }
  catOf(def) {
    if (def.tool || def.armor) return 'tools';
    if (def.food) return 'food';
    if (def.place) return 'blocks';
    return 'stuff';
  }
  renderRecipes(list) {
    const G = this.G;
    list.innerHTML = '';
    const have = (id) => G.count(id);
    const rows = [];
    RECIPES.forEach((r, ri) => {
      const def = ITEMS[r.out];
      if (this.cat !== 'all' && this.catOf(def) !== this.cat) return;
      if (this.filter && !def.label.toLowerCase().includes(this.filter)) return;
      const hasStation = r.st === 'hand' || G.stations.has(r.st);
      const can = hasStation && r.in.every(([id, c]) => have(id) >= c);
      const some = r.in.some(([id]) => have(id) > 0);
      rows.push({ r, ri, def, can, some, hasStation });
    });
    rows.sort((a, b) => (b.can - a.can) || (b.some - a.some));
    for (const { r, ri, def, can, hasStation } of rows) {
      const d = el('div', 'rec' + (can ? ' can' : ''), list);
      const img = el('img', '', d); img.src = iconURL(r.out);
      const info = el('div', 'info', d);
      el('b', '', info).textContent = def.label + (r.n > 1 ? ' ×' + r.n : '');
      const ing = el('div', 'ing', info);
      for (const [id, c] of r.in) { const sp = el('span', have(id) >= c ? 'ok' : 'no', ing); sp.innerHTML = `<img src="${iconURL(id)}">${have(id)}/${c}`; sp.title = ITEMS[id].label; }
      if (r.st !== 'hand') { const st = el('em', hasStation ? 'ok' : 'no', info); st.textContent = 'needs ' + r.st; }
      d.onmousedown = (e) => { e.preventDefault(); if (!can) { this.G.sound.play('click'); return; } this.G.send({ t: 'craft', r: ri, n: e.shiftKey ? 5 : 1 }); };
      d.onmouseenter = () => this.showTip({ id: r.out, n: r.n }); d.onmouseleave = () => this.tip.classList.remove('on');
    }
    if (!rows.length) el('p', 'hint', list).textContent = 'Nothing here yet. Gather wood to start.';
  }
  refreshPanel() { if (this.open) this.renderPanel(); }

  slotClick(e, kind, i) {
    e.preventDefault(); e.stopPropagation();
    if (e.currentTarget && e.currentTarget.dataset) { e.currentTarget.dataset.k = kind; e.currentTarget.dataset.i = i; }
    this.dragStart = { x: e.clientX, y: e.clientY };
    const G = this.G;
    if (!this.open) return;
    const stackOf = (k, idx) => (k === 'inv' ? G.inv[idx] : k === 'armor' ? G.armor[idx] : G.chest && G.chest.inv[idx]);
    if (!this.pick) {
      if (!stackOf(kind, i)) return;
      // shift+click: quick move between chest and backpack
      if (e.shiftKey && G.chest && kind !== 'armor') {
        const to = kind === 'inv' ? 'chest' : 'inv';
        const arr = to === 'chest' ? G.chest.inv : G.inv;
        let ti = arr.findIndex((s, j) => s && s.id === stackOf(kind, i).id && (to !== 'inv' || true));
        if (ti < 0) ti = arr.findIndex((s) => !s);
        if (ti >= 0) G.send({ t: 'move', from: [kind, i], to: [to, ti] });
        return;
      }
      if (kind === 'inv' && e.button === 2 && ITEMS[G.inv[i].id].armor || kind === 'inv' && e.button === 2 && ITEMS[G.inv[i].id].food) { G.send({ t: 'use', i }); return; }
      this.pick = [kind, i, e.button === 2]; this.renderPanel(); return;
    }
    const [pk, pi, half] = this.pick;
    this.pick = null;
    if (!(pk === kind && pi === i)) {
      const src = stackOf(pk, pi);
      const n = half && src && src.n > 1 ? Math.ceil(src.n / 2) : undefined;
      G.send({ t: 'move', from: [pk, pi], to: [kind, i], n });
    }
    this.renderPanel();
  }
  showTip(st) {
    if (!st) { this.tip.classList.remove('on'); return; }
    if (this.G.lastMouse) { this.tip.style.left = this.G.lastMouse.x + 14 + 'px'; this.tip.style.top = this.G.lastMouse.y + 14 + 'px'; }
    const def = ITEMS[st.id];
    let h = `<b>${def.label}</b>`;
    if (def.tool && def.tool !== 'sword' && def.tool !== 'bow') h += `<br>${def.tool} · power ${def.power.toFixed(1)} · tier ${def.tier}`;
    if (def.dmg) h += `<br>damage ${def.dmg.toFixed(1)}`;
    if (def.armor) h += `<br>armor ${def.armor}`;
    if (def.food) h += `<br>restores ${def.food / 2} food${def.heal ? ', ' + def.heal / 2 + ' hearts' : ''}`;
    if (st.d && def.dur) h += `<br>durability ${st.d}/${def.dur}`;
    if (def.place && BLOCKS[def.place].station) h += `<br>crafting station`;
    this.tip.innerHTML = h; this.tip.classList.add('on');
  }

  // ------------------------------------------------------------ trading
  tradeRequest(from, name) {
    this.G.sound.play('chat');
    this.showModal(`<div class="card"><h2>Trade?</h2><p><b>${esc(name)}</b> would like to trade with you.</p><div class="btns"><button id="mok">Accept</button><button id="mno">No thanks</button></div></div>`, (m) => {
      m.querySelector('#mok').onclick = () => { this.G.send({ t: 'tradeacc', from }); this.hideModal(); };
      m.querySelector('#mno').onclick = () => this.hideModal();
    });
  }
  openTrade(st) { this.trade = st; this.hideModal(); this.open = 'trade'; this.pick = null; this.renderTrade(); }
  closeTrade() { this.trade = null; if (this.open === 'trade') { this.open = null; this.panel.classList.add('hidden'); this.tip.classList.remove('on'); } }
  renderTrade() {
    const G = this.G, st = this.trade, p = this.panel;
    p.classList.remove('hidden'); p.innerHTML = '';
    const col = el('div', 'col', p);
    el('h3', '', col).textContent = `Trading with ${st.with}`;
    const row = el('div', 'tradecols', col);
    for (const [title, offer, mine] of [['You offer', st.mine, true], [st.with + ' offers', st.theirs, false]]) {
      const c = el('div', 'tcol' + ((mine ? st.okMine : st.okTheirs) ? ' ok' : ''), row);
      el('b', '', c).textContent = title + ((mine ? st.okMine : st.okTheirs) ? '  (ready)' : '');
      const g = el('div', 'grid three', c);
      for (let i = 0; i < 6; i++) {
        const s = this.slotEl(g); this.fill(s, offer[i]);
        s.onmouseenter = () => this.showTip(offer[i]); s.onmouseleave = () => this.tip.classList.remove('on');
        if (mine) s.onmousedown = (e) => { e.preventDefault(); if (offer[i]) G.send({ t: 'traderem', i }); };
      }
    }
    el('h3', '', col).textContent = 'Backpack (click to offer, right click offers one)';
    const grid = el('div', 'grid', col);
    for (let i = 0; i < PLAYER.inv; i++) { const s = this.slotEl(grid); this.fill(s, G.inv[i]); if (i < 10) s.classList.add('hot'); s.onmouseenter = () => this.showTip(G.inv[i]); s.onmouseleave = () => this.tip.classList.remove('on'); s.onmousedown = (e) => { e.preventDefault(); if (G.inv[i]) G.send({ t: 'tradeadd', slot: i, n: e.button === 2 ? 1 : G.inv[i].n }); }; }
    const btns = el('div', 'btns', col);
    const ok = el('button', '', btns); ok.textContent = st.okMine ? 'Waiting...' : 'Confirm trade'; ok.onclick = () => G.send({ t: 'tradeok' });
    const no = el('button', '', btns); no.textContent = 'Cancel'; no.onclick = () => G.send({ t: 'tradecancel' });
  }
  // ------------------------------------------------------------ buddies
  npcMenu(n) {
    const G = this.G;
    const jobs = [['follow', 'Follow me'], ['chop', 'Chop trees'], ['mine', 'Mine ore'], ['farm', 'Farm wheat'], ['guard', 'Guard'], ['stay', 'Stay here']];
    this.showModal(`<div class="card"><h2>${esc(n.owner)}'s Buddy</h2><p class="hint">Chop and Mine work near you. Farm needs seeds in your backpack to replant.</p><div class="ways">${jobs.map(([j, l]) => `<button class="way${n.job === j ? ' cur' : ''}" data-j="${j}"><b style="color:${JOB_COL[j]}">●</b> ${l}</button>`).join('')}</div><div class="btns"><button id="mdis">Dismiss</button><button id="mno">Close</button></div></div>`, (m) => {
      m.querySelectorAll('.way').forEach((b) => { b.onclick = () => { G.send({ t: 'npc', id: n.id, act: 'job', job: b.dataset.j }); this.hideModal(); }; });
      m.querySelector('#mdis').onclick = () => { G.send({ t: 'npc', id: n.id, act: 'dismiss' }); this.hideModal(); };
      m.querySelector('#mno').onclick = () => this.hideModal();
    });
  }

  // ------------------------------------------------------------ modals
  showModal(html, setup) {
    this.modal.innerHTML = html; this.modal.classList.remove('hidden'); this.modalOpen = true;
    if (setup) setup(this.modal);
  }
  hideModal() { this.modal.classList.add('hidden'); this.modalOpen = false; this.G.canvas.focus(); }
  signEdit(x, y, text) {
    this.showModal(`<div class="card"><h2>Sign</h2><input id="mtext" maxlength="60" value="${esc(text)}"><div class="btns"><button id="mok">Save</button><button id="mno">Cancel</button></div></div>`, (m) => {
      const i = m.querySelector('#mtext'); i.focus(); i.select();
      i.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') m.querySelector('#mok').click(); if (e.key === 'Escape') this.hideModal(); };
      m.querySelector('#mok').onclick = () => { this.G.send({ t: 'sign', x, y, text: i.value }); this.hideModal(); };
      m.querySelector('#mno').onclick = () => this.hideModal();
    });
  }
  waystones(from, list) {
    const G = this.G;
    const rows = list.filter((w) => !(w.x === from[0] && w.y === from[1])).map((w) => `<button class="way" data-x="${w.x}" data-y="${w.y}"><b>${esc(w.name)}</b><small>${esc(w.owner || '')} · ${Math.abs(w.x - Math.floor(G.me.x))} tiles away</small></button>`).join('') || '<p>No other waystones yet. Build another one somewhere!</p>';
    const here = list.find((w) => w.x === from[0] && w.y === from[1]);
    this.showModal(`<div class="card"><h2>Waystone</h2><p class="hint">Travel costs one <img class="inl" src="${iconURL(I.glowshard)}"> glowshard.</p><input id="wname" maxlength="16" value="${esc(here ? here.name : '')}" placeholder="Name this waystone"><div class="ways">${rows}</div><div class="btns"><button id="mno">Close</button></div></div>`, (m) => {
      const wi = m.querySelector('#wname'); wi.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') { G.send({ t: 'wname', x: from[0], y: from[1], name: wi.value }); wi.blur(); } };
      wi.onchange = () => G.send({ t: 'wname', x: from[0], y: from[1], name: wi.value });
      m.querySelectorAll('.way').forEach((b) => { b.onclick = () => { G.send({ t: 'way', x: +b.dataset.x, y: +b.dataset.y }); this.hideModal(); }; });
      m.querySelector('#mno').onclick = () => this.hideModal();
    });
  }
  pause() {
    const G = this.G;
    this.showModal(`<div class="card"><h2>Paused</h2>
      <label>Sound <input id="vs" type="range" min="0" max="100" value="${Math.round(G.sound.vol * 100)}"></label>
      <label>Music <input id="vm" type="range" min="0" max="100" value="${Math.round(G.sound.musicVol * 100)}"></label>
      <label>Graphics <select id="vg"><option value="1">Light</option><option value="1.5">Medium</option><option value="2">Sharp</option></select></label>
      <label>Zoom <input id="vz" type="range" min="30" max="180" value="${Math.round(G.zoom * 100)}"></label>
      <div class="keys"><b>WASD / arrows</b> move, <b>Space</b> jump, <b>Shift</b> run, <b>Click</b> a block to walk over and mine it, click open ground to walk there, <b>double click</b> any square to dig your way to it, <b>hold</b> to keep mining, <b>Right mouse</b> place or use, <b>Shift + click</b> back wall, <b>1-0 / wheel</b> hotbar, <b>E</b> backpack, <b>Q</b> drop, <b>T</b> chat, <b>Tab</b> players, <b>F</b> eat, <b>V</b> emotes, <b>+/-</b> zoom, <b>F2</b> photo</div>
      <div class="btns"><button id="mok">Resume</button><button id="mleave">Leave world</button></div></div>`, (m) => {
      m.querySelector('#vs').oninput = (e) => G.sound.setVol(e.target.value / 100, G.sound.musicVol);
      m.querySelector('#vm').oninput = (e) => G.sound.setVol(G.sound.vol, e.target.value / 100);
      const vg = m.querySelector('#vg'); vg.value = String(G.r.maxDpr); vg.onchange = () => { G.r.maxDpr = +vg.value; try { localStorage.setItem('blockmates.gfx', vg.value); } catch { /* private mode */ } };
      m.querySelector('#vz').oninput = (e) => { G.zoom = e.target.value / 100; };
      m.querySelector('#mok').onclick = () => this.hideModal();
      m.querySelector('#mleave').onclick = () => { this.hideModal(); G.leave(); };
    });
  }

  worldMap() {
    const G = this.G;
    if (this.modalOpen && this.modal.querySelector('#bigmap')) { this.hideModal(); return; }
    G.cw.paintMap();
    this.showModal('<div class="card wide"><h2>World map</h2><canvas id="bigmap"></canvas><div class="btns"><button id="mno">Close</button></div></div>', (m) => {
      const cv = m.querySelector('#bigmap');
      const x0 = Math.max(0, (G.cw.mapMin ?? 0) * 32 - 24), x1 = Math.min(W, ((G.cw.mapMax ?? 47) + 1) * 32 + 24);
      cv.width = x1 - x0; cv.height = H;
      const g = cv.getContext('2d');
      g.translate(-x0, 0);
      g.imageSmoothingEnabled = false; g.drawImage(G.cw.map, 0, 0);
      g.strokeStyle = '#000'; g.lineWidth = 3;
      for (const p of G.players.values()) {
        g.fillStyle = p === G.me || p.id === G.myId ? '#ffffff' : '#ffe14a';
        const x = p.x, y = p.y - 1; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); g.stroke();
        g.font = 'bold 18px sans-serif'; g.fillStyle = '#fff'; g.strokeText(p.name, x + 8, y - 6); g.fillText(p.name, x + 8, y - 6);
      }
      for (const [k, mt] of G.cw.meta) if (mt.k === 'waystone') { const [x, y] = k.split(',').map(Number); g.fillStyle = '#7ad8ff'; g.fillRect(x - 3, y - 6, 6, 8); }
      m.querySelector('#mno').onclick = () => this.hideModal();
    });
  }

  // ------------------------------------------------------------ minimap
  drawMap() {
    const G = this.G, cv = this.mapCv, g = cv.getContext('2d');
    const img = g.createImageData(180, 110), d = img.data;
    const px = Math.floor(G.me.x) - 90, py = Math.floor(G.me.y) - 55;
    for (let j = 0; j < 110; j++) for (let i = 0; i < 180; i++) {
      const x = px + i, y = py + j, o = (j * 180 + i) * 4;
      let c = null;
      const fg = G.cw.chunks.has((x / 32) | 0) ? G.cw.fgAt(x, y) : -1;
      if (fg === -1) { d[o + 3] = 255; d[o] = 12; d[o + 1] = 14; d[o + 2] = 24; continue; }
      const lq = G.cw.liqAt(x, y);
      if (fg && fg !== 0) c = BLOCKS[fg].color; else if (lq) c = (lq >> 4) === 2 ? '#ff6a1a' : '#3a86e0'; else if (G.cw.bgAt(x, y)) c = '#2c2a3a'; else c = (y < 92 ? '#8fd0ff' : '#1a1a28');
      const n = parseInt(c.slice(1), 16);
      d[o] = (n >> 16) & 255; d[o + 1] = (n >> 8) & 255; d[o + 2] = n & 255; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.fillStyle = '#fff'; g.fillRect(88, 53, 4, 5); g.strokeStyle = '#000'; g.strokeRect(87.5, 52.5, 5, 6);
    g.fillStyle = '#ffe14a';
    for (const p of G.players.values()) if (p !== G.me) { const x = Math.floor(p.x) - px, y = Math.floor(p.y) - py - 1; if (x >= 0 && x < 180 && y >= 0 && y < 110) g.fillRect(x - 1, y - 1, 3, 3); }
    g.fillStyle = '#ff5050';
    for (const m of G.mobs.values()) { const x = Math.floor(m.x) - px, y = Math.floor(m.y) - py - 1; if (x >= 0 && x < 180 && y >= 0 && y < 110) g.fillRect(x, y, 2, 2); }
  }

  // ------------------------------------------------------------ touch controls
  touch() {
    if (!('ontouchstart' in window) && !(navigator.maxTouchPoints > 0)) return;
    const G = this.G;
    document.body.classList.add('touch');
    const t = el('div', 'touchpad', this.root);
    const mk = (cls, label, bit) => {
      const b = el('button', cls, t); b.textContent = label;
      const on = (e) => { e.preventDefault(); G.touchKeys |= bit; b.classList.add('down'); }, off = (e) => { e.preventDefault(); G.touchKeys &= ~bit; b.classList.remove('down'); };
      b.addEventListener('touchstart', on, { passive: false }); b.addEventListener('touchend', off); b.addEventListener('touchcancel', off);
    };
    mk('l', '◀', 1); mk('r', '▶', 2); mk('j', '▲', 16); mk('d', '▼', 8);
    const mode = el('button', 'mode', t); mode.textContent = 'Mine';
    mode.onclick = () => { G.touchMode = G.touchMode === 'mine' ? 'place' : 'mine'; mode.textContent = G.touchMode === 'mine' ? 'Mine' : 'Place'; };
    const inv = el('button', 'invb', t); inv.textContent = 'Bag'; inv.onclick = () => this.toggleInv();
    const chat = el('button', 'chatb', t); chat.textContent = 'Chat'; chat.onclick = () => this.openChat();
  }
}
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
