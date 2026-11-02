// gamepad.js: gamepad support for the battle view. One PadControl per Battle, polled once per frame from Battle.update.
// Zero cost without a pad: poll() returns at once until a pad was seen (the gamepadconnected event, or a pad already listed at load).
// A tile cursor snaps to the build slots (the D-pad or the left stick, soft wrap, repeat while held); the buttons call the same Battle
// methods as the pointer and the keyboard, so the tutorial gates and every rule stay in one place. The cursor and the 'gamepad connected'
// toast appear only after the pad is actually used, and the cursor hides again on the next pointer press.
import { COLS, ROWS, TILE, BOARD_X, BOARD_Y, W, tileCx, tileCy } from './data_core.js';
import * as K from './doodle_kit.js';
import { BT } from './battle_text.js';

// Layout of a standard-mapping pad (also used as the best guess for non-standard pads).
export const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
export const PAD_TUNING = { dead: 0.5, delay: 0.35, rate: 0.12 };   // stick dead zone, repeat delay and repeat interval in seconds

// The mapping, for the How to Play card: pad is the button label, id selects the text (BT.padHelp(id), translated at call time).
export const GAMEPAD_HELP = [
  { pad: 'D-pad / Left stick', id: 'move' },
  { pad: 'A', id: 'a' },
  { pad: 'B', id: 'b' },
  { pad: 'X', id: 'x' },
  { pad: 'Y', id: 'y' },
  { pad: 'LB', id: 'lb' },
  { pad: 'RB', id: 'rb' },
  { pad: 'Start', id: 'start' },
  { pad: 'Back', id: 'back' },
  { pad: 'LT / RT', id: 'triggers' },
  { pad: 'L3 / R3', id: 'stick' },
  { pad: 'Menus', id: 'menus' },
];
export const gamepadHelp = () => GAMEPAD_HELP.map((h) => ({ pad: h.pad, text: BT.padHelp(h.id) }));

// ---- reading one pad, tolerant of anything the browser hands over
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
export function btn(gp, i) {
  const x = gp && gp.buttons && gp.buttons[i];
  if (x == null) return false;
  if (typeof x === 'object') return !!x.pressed || num(x.value) > 0.5;
  return x === true || num(x) > 0.5;
}
// -> { b: { A: bool, ... }, dir: 'up' | 'down' | 'left' | 'right' | null }
export function readPad(gp) {
  const b = {};
  for (const k of Object.keys(BTN)) b[k] = btn(gp, BTN[k]);
  let dir = b.UP ? 'up' : b.DOWN ? 'down' : b.LEFT ? 'left' : b.RIGHT ? 'right' : null;
  const ax = (gp && gp.axes) || [];
  if (!dir && gp && gp.mapping !== 'standard' && ax.length >= 10) {   // some non-standard pads report the hat switch as axis 9 (-1 up ... 1 left, 1.29 centred)
    const h = num(ax[9]);
    if (h <= 1.01 && h >= -1.01) { const i = Math.round((h + 1) / (2 / 7)) % 8; dir = ['up', 'right', 'right', 'down', 'down', 'left', 'left', 'up'][i] || null; }
  }
  if (!dir) {
    const x = num(ax[0]), y = num(ax[1]), d = PAD_TUNING.dead;
    if (Math.max(Math.abs(x), Math.abs(y)) > d) dir = Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up');
  }
  return { b, dir };
}

// ---- connection state, shared by every battle (listeners are installed once)
let seen = false, listening = false;
function listen() {
  if (listening) return; listening = true;
  try {
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('gamepadconnected', () => { seen = true; });
      window.addEventListener('gamepaddisconnected', () => { /* poll() notices an empty list itself */ });
    }
    if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
      const l = navigator.getGamepads(); if (l && Array.prototype.some.call(l, (g) => !!g)) seen = true;
    }
  } catch (e) { /* no gamepad API here */ }
}
function systemPads() {
  try { return typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : null; } catch (e) { return null; }
}
export const padSeen = () => seen;

// ---- DOM menus (pause, remix pick, hints, results): the pad drives the same keyboard path as a keyboard (Tab focus, Enter on the focus, Escape)
const domOpen = () => typeof document !== 'undefined' && !!document.querySelector && !!document.querySelector('.modal-bg');
export function domPadKey(k) {   // k: 'next' | 'prev' | 'ok' | 'back'
  if (!domOpen()) return false;
  const fire = (key, shift) => { try { document.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey: !!shift, bubbles: true, cancelable: true })); } catch (e) { return false; } return true; };
  if (k === 'back') return fire('Escape');
  const bgs = document.querySelectorAll('.modal-bg'), box = bgs[bgs.length - 1];
  const list = [...box.querySelectorAll('button:not([disabled]),[tabindex]:not([tabindex="-1"]),[role=button]')].filter((el) => !el.hidden && el.offsetParent !== null);
  if (!list.length) return false;
  const i = list.indexOf(document.activeElement);
  if (k === 'ok') { const t = i >= 0 ? list[i] : list[0]; t.click(); return true; }
  const j = i < 0 ? 0 : (i + (k === 'next' ? 1 : list.length - 1)) % list.length;
  try { list[j].focus({ preventScroll: true }); } catch (e) { return false; }
  return true;
}

const COL_WARN = '#ff9a3c';
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'BACK', 'START', 'L3', 'R3'];

export class PadControl {
  // o.getPads: () => array of gamepad-like objects (tests); default navigator.getGamepads
  constructor(o = {}) {
    this.getPads = o.getPads || null;
    this.cursor = null;          // { c, r } build slot under the cursor
    this.active = false;         // true once the pad was used, false again after a pointer press: the cursor is drawn only while active
    this.toasted = false;
    this.prev = {}; this.dir = null; this.hold = 0; this.rep = false;
    this.branchIdx = null;       // focus on an upgrade-path card (0 or 1) while the branch sheet is being driven by the pad
    this.acts = 0;               // actions taken (tests)
    this.sellAsk = null;         // { id, t }: R3 pressed once on a selected turret
    this.domPrev = {}; this.domDir = null;   // edge tracking while a DOM menu is open
    if (!this.getPads) listen();
  }
  live() { return !!this.getPads || seen; }
  pad() {
    const list = this.getPads ? this.getPads() : systemPads();
    if (!list) return null;
    for (let i = 0; i < list.length; i++) if (list[i] && list[i].connected !== false) return list[i];
    return null;
  }
  hide() { this.active = false; }
  // rumble on the same events as the phone haptics (pat: a vibrate pattern, ms). No actuator or no pad: nothing happens.
  rumble(pat) {
    const gp = this.live() ? this.pad() : null, act = gp && gp.vibrationActuator;
    if (!act || typeof act.playEffect !== 'function') return false;
    const arr = Array.isArray(pat) ? pat : [pat]; let ms = 0, peak = 0;
    arr.forEach((v, i) => { if (i % 2 === 0) { ms += v; peak = Math.max(peak, v); } });
    ms = Math.max(30, Math.min(450, ms));
    try { act.playEffect('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, 0.35 + peak / 160), weakMagnitude: 0.3 }); } catch (e) { return false; }
    return true;
  }
  // one frame. Returns the number of actions taken.
  poll(dt, b) {
    if (!this.live()) return 0;
    const gp = this.pad();
    if (!gp) { this.prev = {}; this.dir = null; return 0; }
    const s = readPad(gp);
    const held = b.paused || b.hold || b.ended;   // a menu (DOM) is open or the run is over: track the buttons but do nothing
    let n = 0;
    if (domOpen()) {   // a DOM menu is open: the d-pad moves its focus, A presses, B closes
      for (const k of NAMES) this.prev[k] = s.b[k];   // a button held while the menu closes must not fire in the battle
      const edge = (k) => { const now = s.b[k], was = !!this.domPrev[k]; this.domPrev[k] = now; return now && !was; };
      const dirNow = s.dir, dirEdge = dirNow && dirNow !== this.domDir; this.domDir = dirNow;
      if (edge('A')) n += domPadKey('ok') ? 1 : 0;
      if (edge('B')) n += domPadKey('back') ? 1 : 0;
      if (dirEdge) n += domPadKey(dirNow === 'down' || dirNow === 'right' ? 'next' : 'prev') ? 1 : 0;
      this.acts += n; return n;
    }
    this.domPrev = { ...s.b }; this.domDir = s.dir;   // a button already held when a menu opens must not press in it
    for (const k of NAMES) {
      const now = s.b[k], was = !!this.prev[k]; this.prev[k] = now;
      if (now && !was && !held) { this.use(b); n += this.press(k, b) ? 1 : 0; }
    }
    if (s.dir && !held) {
      if (s.dir !== this.dir) { this.dir = s.dir; this.hold = 0; this.rep = false; this.use(b); n += this.move(s.dir, b) ? 1 : 0; }
      else {
        this.hold += dt;
        if (this.hold >= (this.rep ? PAD_TUNING.rate : PAD_TUNING.delay)) { this.hold = 0; this.rep = true; n += this.move(s.dir, b) ? 1 : 0; }
      }
    } else if (!s.dir) { this.dir = null; this.hold = 0; this.rep = false; }
    this.acts += n;
    return n;
  }
  // the first real input: show the cursor, say hello once
  use(b) {
    if (!this.active) {
      this.active = true;
      if (!this.cursor) this.cursor = this.startTile(b);
      if (!this.toasted) { this.toasted = true; try { b.app.hooks.toast(BT.padConnected()); } catch (e) { /* no toast hook */ } }
    }
  }
  slots(b) { return b.run.map.buildable; }
  startTile(b) {
    const sl = this.slots(b); let best = null, bd = 1e9;
    for (const s of sl) { const d = Math.abs(s.c - (COLS - 1) / 2) + Math.abs(s.r - (ROWS - 1) / 2); if (d < bd) { bd = d; best = s; } }
    return best ? { c: best.c, r: best.r } : { c: 3, r: 5 };
  }
  slotAt(b, cur) { return this.slots(b).find((s) => s.c === cur.c && s.r === cur.r) || null; }
  // the nearest build slot in a direction (straight lines are mostly path tiles, so any slot in the half plane counts, off-axis ones cost double);
  // nothing ahead: wrap to the far side
  step(b, dir) {
    const cur = this.cursor || this.startTile(b), [dc, dr] = DIRS[dir];
    let ahead = null, as = 1e9, wrap = null, ws = 1e9;
    for (const s of this.slots(b)) {
      if (s.c === cur.c && s.r === cur.r) continue;
      const along = (s.c - cur.c) * dc + (s.r - cur.r) * dr, perp = Math.abs((s.c - cur.c) * dr - (s.r - cur.r) * dc);
      if (along > 0) { const sc = along + 2 * perp; if (sc < as) { as = sc; ahead = s; } }
      else { const sc = 2 * perp - along; if (sc < ws) { ws = sc; wrap = s; } }
    }
    const to = ahead || wrap;
    return to ? { c: to.c, r: to.r } : cur;
  }
  move(dir, b) {
    if (this.branchIdx != null) {   // driving the branch sheet: left and right swap the focused card
      const cards = b.panel && b.panel.cards;
      if (!cards || !cards.length) { this.branchIdx = null; return false; }
      if (dir === 'left' || dir === 'right') { this.branchIdx = (this.branchIdx + (dir === 'right' ? 1 : cards.length - 1)) % cards.length; b.sfx('ui_tab'); return true; }
      return false;
    }
    if (b.popover || b.pv.open || b.run.choice || b.hintQueue.length) return false;
    const to = this.step(b, dir);
    if (to.c === (this.cursor && this.cursor.c) && to.r === this.cursor.r) return false;
    this.cursor = to; b.sfx('ui_click'); return true;
  }
  press(k, b) {
    const run = b.run, tut = b.tut && !b.tut.done;
    if (tut && k === 'A') { const s = b.tutStep && b.tutStep(); if (s && s.wait === 'tap') { b.pointerDown(W / 2, 500); b.pointerUp(W / 2, 500); return true; } }
    if (run.choice || b.hintQueue.length) return false;
    switch (k) {
      case 'A': return this.pressA(b);
      case 'B': return this.pressB(b);
      case 'X': if (!b.tutAllows('merge')) return false; b.doMergeAll(); return true;
      case 'Y': if (!b.tutAllows('reroll')) return false; b.doReroll('coins'); return true;
      case 'LB': b.hero('roxor'); return true;
      case 'RB': b.hero('jasmin'); return true;
      case 'START': b.app.hooks.onPause(b); return true;
      case 'BACK': if (!b.tutAllows('wavepill')) return false; b.togglePreview(); return true;
      case 'LT': b.cycleSpeed(-1); return true;
      case 'RT': b.cycleSpeed(1); return true;
      case 'R3': if (b.selected && b.tutAllows('sell')) return this.pressSell(b);   // a selected turret: R3 twice sells it
      // falls through
      case 'L3': if (!b.tutAllows('wave')) return false; b.doCall(); return true;
      default: return false;
    }
  }
  // R3 on a selected turret: the first press asks, a second one within 2 s sells it
  pressSell(b) {
    const now = b.t, id = b.selected;
    if (this.sellAsk && this.sellAsk.id === id && now - this.sellAsk.t <= 2) { this.sellAsk = null; b.run.sell(id); b.selected = null; return true; }
    this.sellAsk = { id, t: now };
    const tu = b.run.turretById(id);
    if (tu) b.fx.floater(tu.x, tu.y - 30, BT.padSellAgain(), COL_WARN, 16, { life: 1.6 });
    b.sfx('ui_click'); return true;
  }
  pressA(b) {
    const run = b.run;
    if (b.popover) { b.closePopover(); return true; }
    if (b.pv.open) { b.togglePreview(); return true; }
    if (this.branchIdx != null) {
      const cards = b.panel && b.panel.cards, c = cards && cards[this.branchIdx];
      if (!c) { this.branchIdx = null; return false; }
      const r = b.pickBranch(c.id); this.branchIdx = null; return !!(r && r.ok);
    }
    if (!this.cursor) this.cursor = this.startTile(b);
    const slot = this.slotAt(b, this.cursor);
    if (!slot) { b.sfx('error'); return false; }
    const tur = run.grid.get(slot.idx);
    if (tur) {
      if (b.selected === tur.id && b.panel && b.panel.cards && b.panel.cards.length && run.canBranch(tur)) { this.branchIdx = 0; b.sfx('ui_tab'); return true; }
      if (!b.tutAllows('turrets')) return false;
      b.pointerDown(slot.x, slot.y); b.pointerUp(slot.x, slot.y);   // selects it, or merges into it when the selected turret pairs with it
      this.active = true;
      return true;
    }
    if (!b.tutAllows('deploy')) return false;
    b.selected = null; b.targetSlot = slot.idx;
    const r = b.doDeploy();
    return !!(r && r.ok);
  }
  pressB(b) {
    if (this.branchIdx != null) { this.branchIdx = null; return true; }
    if (b.popover) { b.closePopover(); return true; }
    if (b.pv.open) { b.togglePreview(); return true; }
    if (b.selected) { b.selected = null; b.sfx('ui_back'); return true; }
    if (b.targetSlot != null) { b.targetSlot = null; b.sfx('ui_back'); return true; }
    return false;
  }
  // cursor ring on the tile, and a ring round the focused upgrade card; logical coordinates, called after the HUD
  draw(b, ctx) {
    if (!this.active || (b.tut && !b.tut.done) || b.paused) return;
    const cur = this.cursor; if (!cur) return;
    const t = b.t, k = 0.5 + 0.5 * Math.sin(t * 7);
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (this.branchIdx != null && b.panel && b.panel.cards && b.panel.cards[this.branchIdx]) {
      const c = b.panel.cards[this.branchIdx];
      ring(ctx, c.x - 6, c.y - 6, c.w + 12, c.h + 12, 18, 6 + k * 2, t);
    } else if (!b.popover && !b.pv.open) {
      const x = BOARD_X + cur.c * TILE + 3, y = BOARD_Y + cur.r * TILE + 3;
      ring(ctx, x, y, TILE - 6, TILE - 6, 12, 5 + k * 2, t);
      // a small A disc on the corner says what the button does
      const cx = x + TILE - 6, cy = y + 2;
      ctx.beginPath(); ctx.arc(cx - 6, cy + 6, 9, 0, Math.PI * 2); ctx.fillStyle = '#7bd66a'; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = K.C.ink; ctx.stroke();
      ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = K.C.ink; ctx.fillText('A', cx - 6, cy + 6.5);
    }
    ctx.restore();
  }
}
function ring(ctx, x, y, w, h, r, lw, t) {
  const path = () => {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  };
  path(); ctx.setLineDash([]); ctx.strokeStyle = K.C.ink; ctx.lineWidth = lw + 5; ctx.stroke();
  path(); ctx.setLineDash([14, 8]); ctx.lineDashOffset = -t * 30; ctx.strokeStyle = K.C.yellow; ctx.lineWidth = lw; ctx.stroke();
  ctx.setLineDash([]);
}

// ---- menus outside a battle (title, hub, modals): D-pad and stick move the focus through the buttons in reading order, A presses the focused one
// (nothing focused yet: A focuses the first), B closes a modal (Escape), LB and RB switch the hub tab. Polled once per frame from main.js.
const MENU_FOCUS = 'button:not([disabled]),[role=button],[role=tab],a[href],input:not([disabled]),select:not([disabled])';
const shown = (el) => !el.hidden && el.offsetParent !== null && !el.closest('[hidden]') && !el.closest('[aria-hidden="true"]');
export class MenuPad {
  constructor(o = {}) { this.getPads = o.getPads || null; this.prev = {}; this.dir = null; this.hold = 0; this.rep = false; this.acts = 0; if (!this.getPads) listen(); }
  live() { return !!this.getPads || seen; }
  pad() { const list = this.getPads ? this.getPads() : systemPads(); if (!list) return null; for (let i = 0; i < list.length; i++) if (list[i] && list[i].connected !== false) return list[i]; return null; }
  list(root) {
    const top = [...document.querySelectorAll('.modal-bg')].pop();
    const box = top || root || document.body;
    return [...box.querySelectorAll(MENU_FOCUS)].filter(shown);
  }
  focusAt(el) { try { el.focus({ preventScroll: true, focusVisible: true }); } catch (e) { try { el.focus(); } catch (e2) { /* ignore */ } } try { el.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ } }
  step(dir, root) {
    const l = this.list(root); if (!l.length) return false;
    const i = l.indexOf(document.activeElement), fwd = dir === 'down' || dir === 'right';
    this.focusAt(l[i < 0 ? (fwd ? 0 : l.length - 1) : (i + (fwd ? 1 : l.length - 1)) % l.length]); return true;
  }
  tab(d) {
    const tabs = [...document.querySelectorAll('.tabs [role=tab], .tabs button')].filter(shown); if (tabs.length < 2) return false;
    let i = tabs.findIndex((x) => x.getAttribute('aria-selected') === 'true' || x.classList.contains('on') || x.classList.contains('active'));
    if (i < 0) i = 0; tabs[(i + d + tabs.length) % tabs.length].click(); return true;
  }
  // one frame; returns the number of actions taken. root: the element holding the screen (default the document)
  poll(dt, root) {
    if (typeof document === 'undefined' || !this.live()) return 0;
    const gp = this.pad(); if (!gp) { this.prev = {}; this.dir = null; return 0; }
    const s = readPad(gp); let n = 0;
    const edge = (k) => { const now = !!s.b[k], was = !!this.prev[k]; this.prev[k] = now; return now && !was; };
    const modal = !!document.querySelector('.modal-bg');
    if (edge('A')) {
      const a = document.activeElement, l = this.list(root), w = !modal && document.querySelector('.title-wrap');
      if (w && w.querySelector('.tap')) {   // the 'TAP TO START' title: A starts it like a tap
        try { w.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); n++; } catch (e) { /* no PointerEvent */ }
      } else if (a && l.includes(a)) { a.click(); n++; } else if (l.length) { this.focusAt(l[0]); n++; }
    }
    if (edge('B')) { if (modal) { n += domPadKey('back') ? 1 : 0; } }
    if (!modal) { if (edge('LB')) n += this.tab(-1) ? 1 : 0; if (edge('RB')) n += this.tab(1) ? 1 : 0; } else { edge('LB'); edge('RB'); }
    if (s.dir) {
      if (s.dir !== this.dir) { this.dir = s.dir; this.hold = 0; this.rep = false; n += this.step(s.dir, root) ? 1 : 0; }
      else { this.hold += dt; if (this.hold >= (this.rep ? PAD_TUNING.rate : PAD_TUNING.delay)) { this.hold = 0; this.rep = true; n += this.step(s.dir, root) ? 1 : 0; } }
    } else { this.dir = null; this.hold = 0; this.rep = false; }
    this.acts += n; return n;
  }
}
