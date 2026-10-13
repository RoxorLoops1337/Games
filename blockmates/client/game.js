// The running game: network messages in, prediction, input, particles, and the frame loop.
import { W, H, CHUNK, DT, REACH, BLOCKS, B, I, ITEMS, MOBS, PLAYER, L_LAVA } from '../shared/data.js';
import { stepBody, K_LEFT, K_RIGHT, K_UP, K_DOWN, K_JUMP, K_RUN } from '../shared/physics.js';
import { CWorld } from './cworld.js';
import { Renderer } from './render.js';
import { Sound } from './audio.js';
import { UI } from './ui.js';
import { clamp, daylight } from '../shared/util.js';
import { SKINS } from './art.js';
import { JOBS } from '../server/npcs.js';
import { Tutorial } from './tutorial.js';
import { phaseOf } from '../shared/util.js';

const INTERACTIVE = new Set(['door_closed', 'door_open', 'door_top_closed', 'door_top_open', 'chest', 'sign', 'bed', 'waystone']);
const PARTICLE_CAP = 600;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.cw = new CWorld();
    this.r = new Renderer(canvas);
    this.sound = new Sound();
    this.ui = new UI(this);
    this.tut = new Tutorial(this);
    this.weather = { kind: '', k: 0 };
    this.reset();
    this.zoom = clamp(window.innerHeight / (22 * 32), 0.7, 1.6);
    this.keys = new Set(); this.touchKeys = 0; this.touchMode = 'mine';
    this.mouse = { x: 0, y: 0, l: false, r: false };
    this.bindInput();
    this.running = false;
    this.last = performance.now(); this.acc = 0;
    this.fps = 60; this.frames = 0; this.fpsT = 0;
  }

  reset() {
    this.cw = new CWorld();
    this.joined = false; this.myId = 0; this.worldName = ''; this.status = '';
    this.players = new Map(); this.mobs = new Map(); this.npcs = new Map(); this.drops = new Map(); this.arrows = new Map();
    this.parts = [];
    this.inv = new Array(PLAYER.inv).fill(null); this.armor = [null, null, null]; this.sel = 0;
    this.hp = 20; this.food = 20; this.breath = 10; this.time = 60; this.day = 1;
    this.me = { x: 0, y: 0, vx: 0, vy: 0, w: PLAYER.w, h: PLAYER.h, onGround: false, dir: 1, dead: false, look: {}, name: '', anim: 0, id: 0 };
    this.cam = { x: 0, y: 0 };
    this.server = null; this.snapAt = 0; this.ping = 0; this.seq = 0; this.lastKeys = -1; this.sendT = 0;
    this.mining = null; this.chest = null; this.stations = new Set(); this.stT = 0;
    this.hurtFlash = 0; this.under = false; this.showPlayers = false; this.shake = 0;
    this.actT = 0; this.atkT = 0; this.stepT = 0; this.prevGround = false; this.prevVy = 0; this.mapT = 0;
    this.cursor = null; this.ghost = 0; this.t = 0; this.time0 = 0;
    if (this.ui) this.ui.build();
    this.me.dir = 1;
  }

  // ------------------------------------------------------------ connection
  async join(net, profile) {
    this.reset();
    this.net = net; this.profile = profile;
    this.status = 'Connecting...';
    net.onmsg = (m) => this.onmsg(m);
    net.onclose = () => { if (this.joined) { this.status = 'Disconnected.'; this.leave(true, 'Connection lost.'); } };
    await net.open();
    net.send({ t: 'join', name: profile.name, token: profile.token, look: profile.look, password: profile.password || '' });
    this.pinger = setInterval(() => net.send({ t: 'ping', c: performance.now() }), 2000);
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame((n) => this.frame(n));
    this.sound.start();
  }
  send(o) { if (this.net) this.net.send(o); }
  leave(silent, msg) {
    clearInterval(this.pinger);
    const net = this.net; this.net = null;
    if (net && !silent) { try { net.close(); } catch { /* closed */ } }
    this.running = false; this.joined = false;
    document.body.classList.remove('playing');
    if (this.onleave) this.onleave(msg);
  }
  count(id) { let c = 0; for (const s of this.inv) if (s && s.id === id) c += s.n; return c; }
  selectSlot(i) { this.sel = i; this.send({ t: 'sel', i }); this.sound.play('click'); }
  get held() { return this.inv[this.sel]; }

  onmsg(m) {
    switch (m.t) {
      case 'welcome': {
        this.myId = m.id; this.worldName = m.name; this.time = m.time; this.day = m.day; this.time0 = performance.now();
        this.me.id = m.id; this.me.x = m.you.x; this.me.y = m.you.y; this.me.look = m.you.look; this.me.name = this.profile.name;
        this.hp = m.you.hp; this.food = m.you.food; this.op = m.op;
        for (const p of m.players) this.addPlayer(p);
        this.players.set(m.id, this.mkPlayer({ id: m.id, name: this.profile.name, look: m.you.look }, true));
        this.joined = true; this.status = '';
        document.body.classList.add('playing');
        if (m.motd) this.ui.say('', m.motd, true);
        this.cam.x = this.me.x; this.cam.y = this.me.y - 1;
        this.waystones = m.waystones;
        break;
      }
      case 'deny': this.leave(true, m.why); break;
      case 'c': this.cw.setChunk(m.cx, m.d, m.m); break;
      case 'uc': this.cw.dropChunk(m.cx); break;
      case 'b': {
        for (const [x, y, l, v] of m.u) this.cw.apply(x, y, l, v);
        for (const [x, y, meta] of m.m || []) { if (meta) this.cw.meta.set(x + ',' + y, meta); else this.cw.meta.delete(x + ',' + y); }
        break;
      }
      case 's': this.onSnapshot(m); break;
      case 'inv': {
        this.inv = m.inv; this.armor = m.armor; if (m.sel !== undefined && m.sel !== this.sel) this.sel = m.sel;
        this.ui.refreshPanel();
        break;
      }
      case 'chest':
        if (m.close) { this.chest = null; if (this.ui.open === 'chest') this.ui.closePanel(); }
        else { const was = this.chest; this.chest = { x: m.x, y: m.y, inv: m.inv }; if (!was) this.ui.openChest(); else this.ui.renderPanel(); }
        break;
      case 'sign': this.ui.signEdit(m.x, m.y, m.text); break;
      case 'ways': this.ui.waystones(m.from, m.list); break;
      case 'toast': this.ui.showToast(m.text); break;
      case 'tradereq': this.ui.tradeRequest(m.from, m.name); break;
      case 'trade': if (m.done) this.ui.closeTrade(); else this.ui.openTrade(m); break;
      case 'chat': {
        this.ui.say(m.from, m.text, m.sys);
        if (!m.sys) { this.sound.play('chat'); const p = this.players.get(m.id); if (p) { p.say = m.text; p.sayT = 5; } }
        break;
      }
      case 'join': this.addPlayer(m.p); break;
      case 'leave': this.players.delete(m.id); break;
      case 'look': { const p = this.players.get(m.id); if (p) p.look = m.look; break; }
      case 'respawn': this.me.x = m.x; this.me.y = m.y; this.me.vx = this.me.vy = 0; this.cam.x = m.x; this.cam.y = m.y - 1; break;
      case 'pong': this.ping = Math.round(performance.now() - m.c); break;
      default:
    }
  }
  mkPlayer(p, mine) {
    return { id: p.id, name: p.name, look: p.look, x: mine ? this.me.x : 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0, dir: 1, anim: 0, onGround: true, held: 0, armor: [0, 0, 0], emote: 0, swingT: 0, blink: 0, blinkT: 2 + Math.random() * 3, hurtT: 0, dead: false, say: '', sayT: 0, fresh: true, climb: false, wet: false };
  }
  addPlayer(p) { if (p.id !== this.myId && !this.players.has(p.id)) this.players.set(p.id, this.mkPlayer(p)); }

  onSnapshot(m) {
    this.time = m.time; this.day = m.day; this.time0 = performance.now();
    const y = m.you;
    this.server = y; this.snapAt = performance.now();
    this.hp = y.hp; this.food = y.food; this.breath = y.breath; this.me.dead = y.dead;
    this.mining = y.mining ? { x: y.mining[0], y: y.mining[1], l: y.mining[2], prog: y.mining[3] } : null;
    if (this.me.dead) { this.me.x = y.x; this.me.y = y.y; }
    const seen = new Set();
    for (const a of m.p) {
      const [id, x, yy, vx, vy, dir, fl, held, hp, emote, h, c, f, fx, fy] = a;
      seen.add(id);
      let p = this.players.get(id);
      if (!p) { p = this.mkPlayer({ id, name: 'Player', look: {} }); this.players.set(id, p); }
      p.fish = fl & 32 ? { x: fx, y: fy } : null;
      if (id === this.myId) { p.held = held; p.armor = [h, c, f]; p.emote = emote; p.hp = hp; p.dead = !!(fl & 1); continue; }
      if (p.fresh) { p.x = x; p.y = yy; p.fresh = false; }
      p.tx = x; p.ty = yy; p.vx = vx; p.vy = vy; p.dir = dir; p.dead = !!(fl & 1); p.onGround = !!(fl & 2); p.climb = !!(fl & 16); p.wet = !!(fl & 8);
      if ((fl & 4) && p.swingT <= 0) p.swingT = 0.25;
      p.held = held; p.armor = [h, c, f]; p.emote = emote;
      if (hp < (p.hp ?? hp)) p.hurtT = 0.25;
      p.hp = hp;
    }
    const keep = (map, list, mk, upd) => {
      const ids = new Set();
      for (const e of list) { ids.add(e[0]); let o = map.get(e[0]); if (!o) { o = mk(e); map.set(e[0], o); } upd(o, e); }
      for (const k of map.keys()) if (!ids.has(k)) map.delete(k);
    };
    keep(this.mobs, m.m, (e) => ({ id: e[0], type: e[1], x: e[2], y: e[3], tx: e[2], ty: e[3], anim: 0, dir: e[5], hp: e[6], hurt: 0, vx: 0, onGround: true }), (o, e) => { o.tx = e[2]; o.ty = e[3]; o.vx = e[4]; o.dir = e[5]; if (e[6] < o.hp) o.hurt = 0.25; o.hp = e[6]; });
    keep(this.npcs, m.n || [], (e) => ({ id: e[0], x: e[1], y: e[2], tx: e[1], ty: e[2], vx: 0, dir: 1, anim: 0, job: 'follow', swingT: 0, owner: e[7], look: e[8], onGround: true }),
      (o, e) => { o.tx = e[1]; o.ty = e[2]; o.vx = e[3]; o.dir = e[4]; o.job = JOBS[e[5]] || 'follow'; o.onGround = !!(e[6] & 2); if ((e[6] & 4) && o.swingT <= 0) o.swingT = 0.25; o.owner = e[7]; });
    keep(this.drops, m.d, (e) => ({ id: e[0], item: e[1], x: e[2], y: e[3], tx: e[2], ty: e[3], n: e[4] }), (o, e) => { o.tx = e[2]; o.ty = e[3]; o.n = e[4]; });
    keep(this.arrows, m.a, (e) => ({ id: e[0], x: e[1], y: e[2], vx: e[3], vy: e[4] }), (o, e) => { o.x = e[1]; o.y = e[2]; o.vx = e[3]; o.vy = e[4]; });
    for (const e of m.e) this.onEvent(e);
  }

  onEvent([k, x, y, a]) {
    const near = Math.hypot(x - this.me.x, y - this.me.y);
    const vol = near < 30;
    switch (k) {
      case 'hit': if (vol) { this.sound.play('hit', a); this.burst(x, y, BLOCKS[a].color, 2, 0.12); } break;
      case 'break': if (vol) { this.sound.play('break'); this.burst(x, y, BLOCKS[a].color, 9, 0.2); } break;
      case 'place': if (vol) this.sound.play('place'); break;
      case 'pickup': if (vol) { this.sound.play('pickup'); this.sparkle(x, y, '#fff6a0', 4); } break;
      case 'hurt': if (a === this.myId) { this.hurtFlash = 1; this.shake = 0.35; this.sound.play('hurt'); } else if (vol) { this.sound.play('mobhit'); this.pop(x, y, '#ff5a5a'); } break;
      case 'die': if (vol) { this.sound.play('die'); this.burst(x, y, '#ff5050', 16, 0.3); } break;
      case 'mobhit': if (vol) { this.sound.play('mobhit'); this.pop(x, y, '#ffd0d0'); this.burst(x, y, '#d04a4a', 4, 0.12); } break;
      case 'mobdie': if (vol) { this.sound.play('mobdie'); this.burst(x, y, a ? '#ff9a3d' : '#f2f2f2', 14, 0.25); } break;
      case 'splash': if (vol) { this.sound.play('splash'); this.bubbles(x, y, 10); } break;
      case 'hiss': if (vol) { this.sound.play('hiss'); this.bubbles(x, y, 8, '#ddd'); } break;
      case 'craft': if (vol) { this.sound.play('craft'); this.sparkle(x, y, '#9af0ff', 8); } break;
      case 'door': if (vol) this.sound.play('door'); break;
      case 'eat': if (vol) this.sound.play('eat'); break;
      case 'tp': if (vol) { this.sound.play('tp'); this.sparkle(x, y, '#7ad8ff', 22); } break;
      case 'swing': if (vol) this.sound.play('swing'); break;
      case 'slam': if (vol) { this.sound.play('slam'); this.shake = Math.max(this.shake, 0.6); this.dust(x, y + 0.5, 14); } break;
      case 'shoot': if (vol) this.sound.play('shoot'); break;
      case 'thunk': if (vol) this.sound.play('thunk'); break;
      case 'toolbreak': if (vol) { this.sound.play('toolbreak'); this.burst(x, y, '#aaa', 8, 0.2); } break;
      default:
    }
  }

  // ------------------------------------------------------------ particles
  addPart(p) { if (this.parts.length < PARTICLE_CAP) this.parts.push(p); }
  burst(x, y, col, n, size) { for (let i = 0; i < n; i++) this.addPart({ x, y, vx: (Math.random() - 0.5) * 6, vy: -Math.random() * 5 - 1, g: 18, life: 0.6 + Math.random() * 0.4, max: 1, col, size: size * (0.6 + Math.random() * 0.8) }); }
  sparkle(x, y, col, n) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = 1 + Math.random() * 3; this.addPart({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, g: 0, life: 0.5 + Math.random() * 0.4, max: 0.9, col, size: 0.07, round: true }); } }
  bubbles(x, y, n, col = 'rgba(200,235,255,0.8)') { for (let i = 0; i < n; i++) this.addPart({ x: x + (Math.random() - 0.5), y, vx: (Math.random() - 0.5) * 2, vy: -1 - Math.random() * 3, g: -2, life: 0.8 + Math.random() * 0.6, max: 1.2, col, size: 0.07 + Math.random() * 0.06, round: true, ring: true }); }
  pop(x, y, col, text) { this.addPart({ x, y: y - 0.5, vx: (Math.random() - 0.5) * 1.5, vy: -3, g: 6, life: 0.8, max: 0.8, col, size: 0, text: text || '!' }); }
  dust(x, y, n = 3) { for (let i = 0; i < n; i++) this.addPart({ x: x + (Math.random() - 0.5) * 0.5, y, vx: (Math.random() - 0.5) * 2, vy: -Math.random() * 1.5, g: 3, life: 0.4, max: 0.5, col: 'rgba(220,210,190,0.7)', size: 0.12 + Math.random() * 0.1, round: true }); }

  // ------------------------------------------------------------ input
  bindInput() {
    const cv = this.canvas;
    addEventListener('keydown', (e) => this.onKey(e, true));
    addEventListener('keyup', (e) => this.onKey(e, false));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.l = this.mouse.r = false; });
    cv.addEventListener('mousedown', (e) => { this.sound.start(); this.mouse.x = e.offsetX; this.mouse.y = e.offsetY; if (e.button === 0) this.mouse.l = true; if (e.button === 2) { this.mouse.r = true; this.rClick = true; } e.preventDefault(); });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.l = false; if (e.button === 2) this.mouse.r = false; });
    cv.addEventListener('mousemove', (e) => { this.mouse.x = e.offsetX; this.mouse.y = e.offsetY; });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => { this.lastMouse = { x: e.clientX, y: e.clientY }; const t = this.ui.tip; if (t.classList.contains('on')) { t.style.left = e.clientX + 14 + 'px'; t.style.top = e.clientY + 14 + 'px'; } });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey) { this.zoom = clamp(this.zoom * (e.deltaY < 0 ? 1.1 : 0.9), 0.5, 2.2); return; }
      this.selectSlot((this.sel + (e.deltaY > 0 ? 1 : 9)) % 10);
    }, { passive: false });
    // touch: one finger on the world = mine/place at that spot
    const tpos = (t) => { const r = cv.getBoundingClientRect(); return [t.clientX - r.left, t.clientY - r.top]; };
    cv.addEventListener('touchstart', (e) => { this.sound.start(); const [x, y] = tpos(e.changedTouches[0]); this.mouse.x = x; this.mouse.y = y; if (this.touchMode === 'mine') this.mouse.l = true; else { this.mouse.r = true; this.rClick = true; } e.preventDefault(); }, { passive: false });
    cv.addEventListener('touchmove', (e) => { const [x, y] = tpos(e.changedTouches[0]); this.mouse.x = x; this.mouse.y = y; e.preventDefault(); }, { passive: false });
    const tend = (e) => { this.mouse.l = this.mouse.r = false; e.preventDefault(); };
    cv.addEventListener('touchend', tend, { passive: false }); cv.addEventListener('touchcancel', tend, { passive: false });
  }
  onKey(e, down) {
    if (!this.joined) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (down) {
      if (this.ui.modalOpen) { if (k === 'Escape') this.ui.hideModal(); return; }
      if (k === 'Escape') { if (this.ui.open) this.ui.closePanel(); else this.ui.pause(); e.preventDefault(); return; }
      if (k === 'e' || k === 'i') { this.ui.toggleInv(); e.preventDefault(); return; }
      if (k === 't' || k === 'Enter') { this.ui.openChat(); e.preventDefault(); return; }
      if (k === '/') { this.ui.openChat('/'); e.preventDefault(); return; }
      if (k === 'Tab') { this.showPlayers = true; e.preventDefault(); return; }
      if (/^[0-9]$/.test(k) && !e.repeat) { this.selectSlot((+k + 9) % 10); return; }
      if (k === 'q' && !e.repeat) { const i = this.sel; if (this.inv[i]) this.send({ t: 'drop', i, n: e.shiftKey ? this.inv[i].n : 1 }); return; }
      if (k === 'f' && !e.repeat) { this.send({ t: 'use', i: this.sel }); return; }
      if (k === 'v' && !e.repeat) { this.emoteN = (this.emoteN || 0) % 9 + 1; this.send({ t: 'emote', e: this.emoteN }); return; }
      if (k === '+' || k === '=') { this.zoom = clamp(this.zoom * 1.1, 0.5, 2.2); return; }
      if (k === '-') { this.zoom = clamp(this.zoom / 1.1, 0.5, 2.2); return; }
      if (k === 'h') { this.tut.toggle(); return; }
      if (k === 'm') { this.ui.worldMap(); e.preventDefault(); return; }
      if (k === 'F2') { this.photo(); e.preventDefault(); return; }
      if (k === 'F3') { this.debug = !this.debug; e.preventDefault(); return; }
      if (k === ' ' || k.startsWith('Arrow')) e.preventDefault();
      this.keys.add(k);
    } else {
      if (k === 'Tab') this.showPlayers = false;
      this.keys.delete(k);
    }
  }
  photo() {
    const hud = document.getElementById('hud'); hud.style.visibility = 'hidden';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this.canvas.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'blockmates-' + Date.now() + '.png'; a.click(); hud.style.visibility = ''; });
    }));
  }
  inputKeys() {
    if (this.ui.chatOpen || this.ui.modalOpen) return 0;
    const k = this.keys;
    let m = this.touchKeys;
    if (k.has('a') || k.has('ArrowLeft')) m |= K_LEFT;
    if (k.has('d') || k.has('ArrowRight')) m |= K_RIGHT;
    if (k.has('w') || k.has('ArrowUp')) m |= K_UP | K_JUMP;
    if (k.has(' ')) m |= K_JUMP;
    if (k.has('s') || k.has('ArrowDown')) m |= K_DOWN;
    if (k.has('Shift')) m |= K_RUN;
    return m;
  }

  // ------------------------------------------------------------ simulation step (fixed 30 Hz)
  fixedStep() {
    const me = this.me;
    const keys = me.dead ? 0 : this.inputKeys();
    if (!me.dead) {
      const wasGround = me.onGround, prevVy = me.vy;
      stepBody(this.cw, me, keys);
      const f = me.flags || {};
      this.under = !!f.deepWater;
      if (wasGround && !me.onGround && me.vy < -5) this.sound.play('jump');
      if (!wasGround && me.onGround && prevVy > 10) { this.sound.play('land'); this.dust(me.x, me.y, 4); }
      if (me.onGround && Math.abs(me.vx) > 2.5) { this.stepT -= DT; if (this.stepT <= 0) { this.stepT = 0.27; this.sound.play('step', 1); this.dust(me.x - me.dir * 0.2, me.y, 1); } }
      if (f.wet && !this.wasWet) { this.sound.play('splash'); this.bubbles(me.x, me.y - 0.5, 8); }
      this.wasWet = f.wet;
    }
    // send input
    this.sendT++;
    if (keys !== this.lastKeys || this.sendT >= 8) { this.lastKeys = keys; this.sendT = 0; this.send({ t: 'i', k: keys, s: ++this.seq }); }
    // reconcile
    const s = this.server;
    if (s && !me.dead) {
      const age = (performance.now() - this.snapAt) / 1000 + this.ping / 2000;
      const tx = s.x + s.vx * age, ty = s.y + s.vy * age * 0.5;
      const dx = tx - me.x, dy = ty - me.y, d = Math.hypot(dx, dy);
      if (d > 3.5) { me.x = s.x; me.y = s.y; me.vx = s.vx; me.vy = s.vy; }
      else if (d > 0.12) { const k = d > 1 ? 0.25 : 0.1; me.x += dx * k; me.y += dy * k; }
    }
  }

  // ------------------------------------------------------------ pointer actions
  cellAtMouse() {
    const ts = this.ts, r = this.r;
    const wx = this.cam.x + (this.mouse.x * r.dpr - r.w / 2) / ts, wy = this.cam.y + (this.mouse.y * r.dpr - r.h / 2) / ts;
    return { wx, wy, x: Math.floor(wx), y: Math.floor(wy) };
  }
  actions(dt) {
    const me = this.me;
    if (me.dead || this.ui.open || this.ui.modalOpen || this.ui.chatOpen) { this.cursor = null; this.ghost = 0; return; }
    const c = this.cellAtMouse();
    const dx = c.x + 0.5 - me.x, dy = c.y + 0.5 - (me.y - 0.9);
    const reach = dx * dx + dy * dy <= REACH * REACH;
    this.cursor = { x: c.x, y: c.y, ok: c.y >= 0 && c.y < H, reach };
    const held = this.held, def = held && ITEMS[held.id];
    // placement ghost
    this.ghost = 0;
    if (def && def.place && reach) {
      const bd = BLOCKS[def.place];
      if (!this.cw.fgAt(c.x, c.y) && !bd.door) this.ghost = def.place;
    }
    this.actT -= dt; this.atkT -= dt;
    if (this.mouse.l) {
      me.dir = c.wx >= me.x ? 1 : -1;
      if (def && def.tool === 'bow') {
        if (this.atkT <= 0) { this.atkT = 0.55; this.send({ t: 'shoot', x: c.wx, y: c.wy }); }
      } else {
        // creature under the cursor?
        let target = null;
        for (const m of this.mobs.values()) {
          const md = MOBS[m.type];
          if (Math.abs(c.wx - m.x) < md.w / 2 + 0.5 && c.wy > m.y - md.h - 0.5 && c.wy < m.y + 0.4 && Math.hypot(m.x - me.x, m.y - me.y) < 3.4) { target = m; break; }
        }
        if (target) {
          if (this.atkT <= 0) { this.atkT = 0.42; this.send({ t: 'atk', x: c.wx, y: c.wy }); me.swingT = 0.25; }
        } else if (reach && this.actT <= 0) {
          this.actT = 0.1;
          const fg = this.cw.fgAt(c.x, c.y);
          const layer = (this.keys.has('Shift') || !fg) ? 1 : 0;
          if ((layer === 0 && fg) || (layer === 1 && this.cw.bgAt(c.x, c.y) && !fg)) this.send({ t: 'mine', x: c.x, y: c.y, l: layer });
        }
      }
    } else if (this.wasMining) this.send({ t: 'mine', x: null });
    this.wasMining = this.mouse.l;
    if (this.mouse.r) {
      if (this.rClick) {
        this.rClick = false; this.rHeld = true;
        const fg = this.cw.fgAt(c.x, c.y);
        if (fg && reach && INTERACTIVE.has(BLOCKS[fg].name) && !this.keys.has('Shift')) { this.send({ t: 'use2', x: c.x, y: c.y }); this.actT = 0.3; return; }
        // another player or a Buddy under the cursor: trade / give orders
        const near = (o, rx) => Math.abs(c.wx - o.x) < 0.8 && c.wy > o.y - 2.1 && c.wy < o.y + 0.3 && Math.hypot(o.x - me.x, o.y - me.y) < rx;
        let hit = null;
        for (const n of this.npcs.values()) if (near(n, 10)) { hit = n; this.ui.npcMenu(n); break; }
        if (!hit) for (const o of this.players.values()) if (o.id !== this.myId && !o.dead && near(o, 16)) { this.send({ t: 'trade', to: o.id }); hit = o; break; }
        if (hit) { this.actT = 0.4; return; }
        if (def && def.food && !def.place) { this.send({ t: 'use', i: this.sel }); this.actT = 0.4; return; }
      }
      if (reach && this.actT <= 0 && def && (def.place || def.name.endsWith('bucket'))) {
        this.actT = 0.14;
        this.send({ t: 'place', x: c.x, y: c.y, l: this.keys.has('Shift') ? 1 : 0 });
        me.swingT = 0.2;
      }
    }
  }

  // ------------------------------------------------------------ frame
  frame(now) {
    if (!this.running) return;
    requestAnimationFrame((n) => this.frame(n));
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    this.t += dt;
    this.acc += dt;
    while (this.acc >= DT) { this.acc -= DT; this.fixedStep(); }
    if (!this.joined) { this.r.resize(); return; }
    this.update(dt);
    this.r.frame(this);
    this.frames++; this.fpsT += dt;
    if (this.fpsT > 1) { this.fps = this.frames; this.frames = 0; this.fpsT = 0; }
    if (this.debug) this.drawDebug();
    this.ui.update();
  }

  update(dt) {
    const me = this.me;
    this.ts = 32 * this.zoom * this.r.dpr;
    // sky clock keeps ticking between snapshots
    this.time += dt;
    // my entry in the player table follows the predicted body
    const mp = this.players.get(this.myId);
    if (mp) { mp.x = me.x; mp.y = me.y; mp.vx = me.vx; mp.vy = me.vy; mp.dir = me.dir; mp.onGround = me.onGround; mp.dead = me.dead; mp.climb = !!(me.flags && me.flags.climb); mp.wet = !!(me.flags && me.flags.wet); mp.name = this.profile.name; mp.look = me.look; if (this.mouse.l && !this.ui.open) mp.swingT = Math.max(mp.swingT, 0.01); }
    this.actions(dt);
    const k = Math.min(1, dt * 14);
    for (const p of this.players.values()) {
      if (p.id !== this.myId) { p.x += (p.tx + p.vx * 0.05 - p.x) * k; p.y += (p.ty + p.vy * 0.05 - p.y) * k; }
      p.anim += Math.abs(p.vx) * dt * 1.7;
      p.swingT = Math.max(0, p.swingT - dt); p.hurtT = Math.max(0, p.hurtT - dt); p.sayT = Math.max(0, p.sayT - dt);
      p.blinkT -= dt; if (p.blinkT < 0) { p.blink = 0.12; p.blinkT = 2 + Math.random() * 4; } p.blink = Math.max(0, p.blink - dt);
    }
    for (const m of this.mobs.values()) {
      m.x += (m.tx - m.x) * k; m.y += (m.ty - m.y) * k; m.anim += Math.abs(m.vx) * dt * 1.8; m.hurt = Math.max(0, m.hurt - dt);
      m.onGround = Math.abs(m.ty - m.y) < 0.05;
    }
    for (const n of this.npcs.values()) { n.x += (n.tx - n.x) * k; n.y += (n.ty - n.y) * k; n.anim += Math.abs(n.vx) * dt * 1.7; n.swingT = Math.max(0, n.swingT - dt); }
    for (const d of this.drops.values()) { d.x += (d.tx - d.x) * Math.min(1, dt * 20); d.y += (d.ty - d.y) * Math.min(1, dt * 20); }
    // particles
    for (const p of this.parts) { p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    this.parts = this.parts.filter((p) => p.life > 0);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.5);
    this.shake = Math.max(0, this.shake - dt);
    // camera
    const w = this.r.w / this.ts, h = this.r.h / this.ts;
    const tx = clamp(me.x, w / 2, W - w / 2), ty = clamp(me.y - 1.0, h / 2, H - h / 2);
    const kk = Math.min(1, dt * 7);
    this.cam.x += (tx - this.cam.x) * kk; this.cam.y += (ty - this.cam.y) * kk;
    if (this.shake > 0) { this.cam.x += (Math.random() - 0.5) * this.shake * 0.4; this.cam.y += (Math.random() - 0.5) * this.shake * 0.4; }
    this.biome = this.biomeAt(me.x);
    // nearby stations for the crafting panel (twice a second)
    this.stT -= dt;
    if (this.stT <= 0) {
      this.stT = 0.4;
      const st = new Set(); const px = Math.floor(me.x), py = Math.floor(me.y - 1);
      for (let x = px - 6; x <= px + 6; x++) for (let y = py - 5; y <= py + 5; y++) { const id = this.cw.fgAt(x, y); if (id && BLOCKS[id].station) st.add(BLOCKS[id].station); }
      const changed = st.size !== this.stations.size || [...st].some((s) => !this.stations.has(s));
      this.stations = st;
      if (changed && this.ui.open === 'inv') this.ui.renderPanel();
    }
    this.updateWeather(dt);
    this.tut.update(dt, this.ui.root);
    this.mapT -= dt;
    if (this.mapT <= 0) { this.mapT = 0.35; this.ui.drawMap(); }
    // music mood
    const surf = me.y < 90;
    this.sound.setMode(this.under ? 'water' : !surf && me.y > 110 ? 'cave' : daylight(this.time) < 0.35 ? 'night' : 'day');
  }
  updateWeather(dt) {
    const day = this.day, ph = phaseOf(this.time);
    const h = (Math.sin(day * 12.9898 + 4.1) * 43758.5453) % 1, hh = Math.abs(h);
    let target = 0;
    if (hh < 0.34) { const start = 0.04 + ((hh * 37) % 1) * 0.5, dur = 0.22; const t = (ph - start) / dur; if (t > 0 && t < 1) target = Math.min(1, Math.sin(t * Math.PI) * 2.2); }
    const b = this.biome;
    let kind = b === 'tundra' ? 'snow' : b === 'desert' ? '' : 'rain';
    if (b === 'mountains' && this.me.y < 70) kind = 'snow';
    if (this.me.y > 100 || this.under) target = 0;
    if (!kind) target = 0;
    this.weather.k += (target - this.weather.k) * Math.min(1, dt * 0.6);
    if (target > 0 || this.weather.k < 0.02) this.weather.kind = kind || this.weather.kind;
    this.sound.setRain(this.weather.kind === 'rain' ? this.weather.k : 0);
  }
  biomeAt(x) {
    // cheap client-side biome guess from what is under the player: only used for the hill colours
    const cx = Math.floor(x), top = this.cw.skyTop[cx];
    if (top < 0) return 'plains';
    const id = this.cw.fgAt(cx, top);
    return id === B.sand || id === B.sandstone ? 'desert' : id === B.snow || id === B.ice ? 'tundra' : id === B.stone ? 'mountains' : (this.cw.fgAt(cx + 3, top - 1) === B.log || this.cw.fgAt(cx - 3, top - 1) === B.log) ? 'forest' : 'plains';
  }
  drawDebug() {
    const g = this.r.g;
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(10, 10, 330, 112);
    g.fillStyle = '#9f9'; g.font = '14px monospace';
    const lines = [`fps ${this.fps}  ping ${this.ping}ms  seq ${this.seq}`, `pos ${this.me.x.toFixed(2)}, ${this.me.y.toFixed(2)}  v ${this.me.vx.toFixed(1)},${this.me.vy.toFixed(1)}`, `chunks ${this.cw.chunks.size} sections ${this.cw.secs.size}`, `players ${this.players.size} mobs ${this.mobs.size} drops ${this.drops.size}`, `time ${this.time.toFixed(0)} day ${this.day}  ${this.biome}`];
    lines.forEach((l, i) => g.fillText(l, 18, 30 + i * 18));
  }
}
void SKINS; void I; void L_LAVA; void CHUNK;
