// battle.js: the canvas battle view. Owns a Run (sim.js), draws it with the art modules, turns pointer input into sim calls,
// turns sim events into particles and sounds, draws the HUD, and drives the guided tutorial.
import {
  W, H, COLS, ROWS, TILE, BOARD_X, BOARD_Y, BOARD_W, BOARD_H, TURRETS, ENEMIES, BOSSES, WORLD_BY_ID, COL, ECON, MAX_LEVEL, fmt, tileCx, tileCy,
} from './data_core.js';
import { Run } from './sim.js';
import { Fx } from './fx.js';
import { REMIX, WAVE_MODS } from './data_run.js';
import { TUTORIAL, HINTS, LOOPY_TIPS } from './data_story.js';
import * as AE from './art_entities.js';
import * as AW from './art_world.js';

const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';
const inR = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
const inC = (c, x, y) => (x - c.x) * (x - c.x) + (y - c.y) * (y - c.y) <= c.r * c.r;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// HUD geometry (logical px)
export const R = {
  pause:  { x: 8, y: 8, w: 52, h: 48 },
  hp:     { x: 68, y: 10, w: 190, h: 44 },
  wave:   { x: 266, y: 10, w: 130, h: 44 },
  coins:  { x: 404, y: 10, w: 128, h: 44 },
  hype:   { x: 12, y: 66, w: 280, h: 40 },
  speed:  { x: 298, y: 62, w: 56, h: 46 },
  call:   { x: 360, y: 62, w: 172, h: 46 },
  deploy: { x: 168, y: 856, w: 204, h: 92 },
  merge:  { x: 104, y: 868, w: 58, h: 68 },
  reroll: { x: 378, y: 868, w: 58, h: 68 },
  heroR:  { x: 56, y: 902, r: 44 },
  heroJ:  { x: 484, y: 902, r: 44 },
};

export class Battle {
  constructor(app, o = {}) {
    this.app = app;
    this.prof = app.profile;
    this.o = o;
    this.run = o.run;
    this.fx = new Fx();
    this.t = 0;
    this.speed = clamp(app.profile.settings.speed || 1, 1, 3);
    this.paused = false;
    this.selected = null;       // turret id
    this.targetSlot = null;     // slot idx chosen for the next drop
    this.drag = null;           // { id, x, y, sx, sy, moved }
    this.hoverSlot = null;
    this.banner = null; this.bannerQ = [];
    this.endTimer = 0; this.ended = false;
    this.hurtFlash = 0;
    this.deployPulse = 0;
    this.comboShow = 0;
    this.tip = LOOPY_TIPS[(o.run.seed + 3) % LOOPY_TIPS.length];
    this.beatLast = -1;
    this.bossBar = null;
    this.musicBoss = false;
    this.enemyScaleCache = {};
    this.hintQueue = [];
    this.shownHints = {};
    this.world = o.run.world;
    this.slotHint = [];
    this.tut = o.tutorial ? { i: 0, t: 0, flags: {}, done: false, blockUntil: 0 } : null;
    this.tutBubble = null;
    if (this.tut) this.tutEnter();
    this.rects = {};   // dynamic rects for the tutorial (turrets)
    app.audio.musicStart('world_' + this.world.id);
  }

  get beatPhase() {
    const info = this.app.audio.beatInfo && this.app.audio.beatInfo();
    if (info && info.phase != null) return info.phase;
    return this.run.beatPhase();
  }

  // ------------------------------------------------------------------------------------------------ update
  update(dt) {
    this.t += dt;
    const run = this.run;
    this.fx.update(dt);
    if (this.hurtFlash > 0) this.hurtFlash -= dt * 2.2;
    if (this.deployPulse > 0) this.deployPulse -= dt * 4;
    if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.life) this.banner = this.bannerQ.shift() || null; }
    else if (this.bannerQ.length) this.banner = this.bannerQ.shift();
    // align the sim's beat clock to the music so the DROP ring and on-beat checks agree
    const info = this.app.audio.beatInfo && this.app.audio.beatInfo();
    if (info && info.bpm) {
      run.bpm = info.bpm;
      const simPh = (((run.t + run.beatOffset) * run.bpm / 60) % 1 + 1) % 1;
      let d = info.phase - simPh; if (d > 0.5) d -= 1; if (d < -0.5) d += 1;
      run.beatOffset += d * 60 / run.bpm * 0.15;
    }
    const frozen = this.paused || this.hold || this.hintQueue.length > 0 || run.choice || this.ended || (this.tut && this.tutBlocking());
    if (!frozen) {
      const steps = this.speed;
      run.advance(dt * steps);
    }
    this.handleEvents(run.drain());
    if (this.tut) this.tutUpdate(dt);
    // combo feedback
    this.comboShow = run.combo >= 3 ? Math.min(1, this.comboShow + dt * 6) : Math.max(0, this.comboShow - dt * 4);
    // music intensity follows how busy the board is
    const inten = clamp(run.enemies.length / 25 + (run.stageHp / run.stageMax < 0.4 ? 0.3 : 0), 0, 1);
    this.app.audio.musicIntensity(this.paused ? 0.1 : inten);
    // end
    if ((run.phase === 'won' || run.phase === 'lost') && !this.ended) {
      this.endTimer += dt;
      if (this.endTimer > (run.phase === 'won' ? 1.6 : 1.2)) { this.ended = true; this.app.hooks.onEnd(run, this); }
    }
    if (run.choice && !this.choiceOpen) { this.choiceOpen = true; this.app.hooks.onChoice(run, this); }
    if (!run.choice) this.choiceOpen = false;
  }
  tutBlocking() {
    if (!this.tut || this.tut.done) return false;
    const s = TUTORIAL[this.tut.i];
    return s && !s.free;
  }

  // ------------------------------------------------------------------------------------------------ events -> fx and sound
  sfx(name, x, o) { this.app.audio.play(name, Object.assign({ pan: x == null ? 0 : clamp((x - W / 2) / (W / 2), -1, 1) * 0.6 }, o || {})); }
  queueBanner(text, sub, color, life = 1.8, o = {}) {
    const b = Object.assign({ text, sub, color: color || COL.bone, t: 0, life }, o);
    if (!this.banner) this.banner = b; else this.bannerQ.push(b);
  }
  hint(id) {
    if (this.prof.tutorial.hints[id] || this.shownHints[id] || !HINTS[id]) return;
    if (this.tut && !this.tut.done) return;
    this.shownHints[id] = true; this.prof.tutorial.hints[id] = true;
    this.hintQueue.push(id);
    this.app.hooks.onHint(id, () => { this.hintQueue.shift(); });
  }
  handleEvents(evs) {
    const fx = this.fx, set = this.prof.settings, run = this.run;
    let hits = 0;
    for (const e of evs) {
      switch (e.k) {
        case 'deploy': {
          const def = TURRETS[e.type];
          fx.burst(e.x, e.y, [def.color, def.accent, '#fff'], 14, { speed: 160, life: 0.5 });
          fx.ring(e.x, e.y, 46, def.color, { life: 0.35 });
          if (e.cost > 0) fx.floater(e.x, e.y - 30, '-' + e.cost, COL.coin, 15, { vy: -30 });
          else fx.floater(e.x, e.y - 30, 'FREE', COL.green, 15);
          this.sfx('deploy', e.x); this.deployPulse = 1;
          if (e.bonus) fx.floater(e.x, e.y - 52, 'BONUS!', COL.pink, 16);
          break;
        }
        case 'perfect': fx.floater(e.x, e.y - 52, 'ON BEAT!', COL.cyan, 16, { life: 0.9 }); this.sfx('combo', e.x); break;
        case 'merge': {
          const def = TURRETS[e.type];
          fx.burst(e.x, e.y, [def.color, def.accent, '#fff', COL.gold], e.big ? 34 : 20, { speed: 240, life: 0.7 });
          fx.ring(e.x, e.y, e.big ? 90 : 62, '#fff', { life: 0.45, w: 5 });
          fx.ring(e.x, e.y, e.big ? 70 : 48, def.color, { life: 0.5, w: 6, fill: true });
          fx.floater(e.x, e.y - 34, e.level >= MAX_LEVEL ? 'MAX LEVEL!' : 'LEVEL ' + e.level, e.level >= 5 ? COL.gold : '#fff', e.big ? 22 : 18, { life: 1.0 });
          if (e.kind === 'remix') fx.floater(e.x, e.y - 58, 'REMIX!', COL.pink, 16);
          if (e.big) { fx.addShake(8); fx.confetti(e.x, e.y, 26); }
          this.sfx(e.big ? 'merge_big' : 'merge', e.x, { pitch: 1 + (e.level - 2) * 0.06 });
          break;
        }
        case 'sell': fx.floater(e.x, e.y - 20, '+' + e.v, COL.coin, 16); fx.burst(e.x, e.y, COL.coin, 8, { speed: 100 }); this.sfx('sell', e.x); break;
        case 'move': this.sfx('ui_click', e.x); break;
        case 'shot': {
          const def = TURRETS[e.type];
          fx.burst(e.x + Math.cos(e.ang) * 26, e.y + Math.sin(e.ang) * 26, def.accent, 2, { speed: 80, life: 0.18, size: 2.6, dir: e.ang, spread: 0.6 });
          this.sfx('shoot_' + (e.type === 'vocal' ? 'vocal' : e.type === 'amp' || e.type === 'loop' ? 'snare' : e.type), e.x, { vol: e.type === 'hat' ? 0.4 : 0.8 });
          break;
        }
        case 'hit': {
          hits++;
          if (set.numbers && (e.crit || e.heavy || hits < 5) && !e.dot) {
            fx.floater(e.x, e.y - 8, fmt(e.v), e.crit ? COL.gold : e.shield ? COL.cyan : '#fff', e.crit ? 20 : e.heavy ? 17 : 13, { life: 0.6, vy: -50 });
          }
          if (e.crit) { fx.burst(e.x, e.y, [COL.gold, '#fff'], 5, { speed: 130, life: 0.3 }); this.sfx('crit', e.x); }
          else if (hits < 4) this.sfx('hit', e.x, { vol: 0.5 });
          break;
        }
        case 'kill': {
          const def = e.boss ? BOSSES[e.type] : ENEMIES[e.type];
          const col = e.affix === 'golden' ? COL.coin : def.color;
          fx.burst(e.x, e.y, [col, '#fff', '#2fe6ff', '#ff5fb0'], e.boss ? 40 : 10, { speed: e.boss ? 260 : 150, life: e.boss ? 0.9 : 0.5, size: e.boss ? 5 : 3 });
          fx.ring(e.x, e.y, e.boss ? 110 : e.r * 2.4, col, { life: e.boss ? 0.6 : 0.3 });
          this.sfx(e.boss ? 'boss_die' : (e.r > 18 ? 'kill_big' : 'kill'), e.x);
          if (e.boss) { fx.addShake(14); fx.doFlash('#fff', 0.6); fx.confetti(e.x, e.y, 40); this.bossBar = null; }
          break;
        }
        case 'coin': if (set.numbers) fx.floater(e.x, e.y - 14, '+' + e.v, COL.coin, 13, { life: 0.7, vy: -34 }); if (e.v >= 3) this.sfx('coin', e.x, { vol: 0.5 }); break;
        case 'gem': fx.floater(e.x, e.y - 24, '+1', COL.diamond, 18, { life: 1 }); fx.burst(e.x, e.y, COL.diamond, 10, { speed: 150 }); this.sfx('diamond', e.x); break;
        case 'leak': {
          fx.addShake(e.boss ? 16 : 7); fx.doFlash('#ff2a4a', e.boss ? 0.55 : 0.28); this.hurtFlash = 1;
          fx.floater(this.run.map.base.x, this.run.map.base.y - 36, '-' + e.n, COL.red, 22, { life: 1 });
          this.sfx('leak'); this.vibrate(e.boss ? 160 : 60);
          break;
        }
        case 'spawn': {
          if (!e.boss) { this.hint(e.type === 'mini' ? null : e.type); this.prof.seen.enemies[e.type] = true; }
          break;
        }
        case 'boss': {
          this.queueBanner('BOSS: ' + BOSSES[e.type].name.toUpperCase(), BOSSES[e.type].trick, COL.red, 3.2, { boss: true });
          this.sfx('boss_warn'); fx.addShake(8); this.prof.seen.bosses[e.type] = true;
          this.bossId = e.id; this.bossType = e.type;
          if (!e.small) { this.app.audio.musicStart('boss'); this.musicBoss = true; if (this.app.hooks.bossIntro && !this.tut) this.app.hooks.bossIntro(e.type, this); }
          this.hint('boss');
          break;
        }
        case 'bossdie': if (this.musicBoss) { this.app.audio.musicStart('world_' + this.world.id); this.musicBoss = false; } this.bossId = null; break;
        case 'bossphase': this.queueBanner('PHASE ' + e.phase, 'Mr. Playback gets serious', COL.pink, 2); fx.addShake(10); this.sfx('boss_warn'); break;
        case 'gate': this.sfx(e.on ? 'jam' : 'whoosh'); break;
        case 'wave': {
          const mod = e.mod ? WAVE_MODS[e.mod] : null;
          this.queueBanner('WAVE ' + e.w + (e.total ? ' / ' + e.total : ''), mod ? mod.name + ': ' + mod.desc : '', mod ? (mod.good ? COL.green : COL.orange) : COL.bone, mod ? 2.6 : 1.4);
          this.sfx('wave_start');
          if (mod) this.hint('mod');
          break;
        }
        case 'clear': {
          this.queueBanner('WAVE CLEAR', '+' + e.coins + ' coins', COL.green, 1.5);
          this.sfx('wave_clear');
          if (this.app.hooks.onWaveClear && !this.tut) setTimeout(() => this.app.hooks.onWaveClear(), 50);
          this.tip = LOOPY_TIPS[(run.wave * 7 + run.seed) % LOOPY_TIPS.length];
          break;
        }
        case 'pulse': fx.ring(e.x, e.y, e.r, e.color, { life: 0.5, w: 7, fill: !!e.bass }); if (e.bass) fx.addShake(2); break;
        case 'beam': fx.line(e.x1, e.y1, e.x2, e.y2, e.color, e.w, 0.2); break;
        case 'chain': fx.chain(e.pts, e.color); break;
        case 'cone': fx.cone(e.x, e.y, e.ang, e.range, e.spread, e.color); break;
        case 'explode': fx.ring(e.x, e.y, e.r, e.style === 'kick' ? '#ffb070' : '#ffd0f0', { life: 0.3, fill: true }); fx.burst(e.x, e.y, ['#ffb070', '#fff', '#ffd23c'], e.big ? 20 : 8, { speed: 170 }); fx.addShake(e.big ? 7 : 2); break;
        case 'hero': {
          if (e.who === 'roxor') {
            fx.ring(R.heroR.x, R.heroR.y, 900, COL.green, { life: 0.7, w: 14 }); fx.ring(W / 2, H / 2, 700, '#fff', { life: 0.5, w: 8 });
            fx.addShake(14); fx.doFlash(COL.green, 0.45); this.sfx('hero_roxor'); this.vibrate(120);
            this.queueBanner('BEATBOX BLAST!', '', COL.green, 1.0, { small: true });
          } else {
            fx.ring(R.heroJ.x, R.heroJ.y, 900, COL.pink, { life: 0.8, w: 14 }); fx.doFlash(COL.pink, 0.4); this.sfx('hero_jasmin');
            this.queueBanner('SIREN SONG', 'Slowed, vulnerable, stage mended', COL.pink, 1.2, { small: true });
          }
          break;
        }
        case 'duet': fx.doFlash('#fff', 0.7); fx.addShake(18); fx.confetti(W / 2, H / 2, 60); this.sfx('duet'); this.queueBanner('DUET FINALE!', '', COL.gold, 1.4, { small: true }); break;
        case 'levelup': this.sfx('levelup'); fx.floater(R.hype.x + 140, R.hype.y + 52, 'LEVEL UP!', COL.gold, 20, { life: 1.1 }); break;
        case 'choice': this.sfx('chest'); if (e.kind === 'chest') this.hint('chest'); break;
        case 'remix': this.sfx('remix_pick'); break;
        case 'relic': this.sfx('relic'); break;
        case 'heal': fx.floater(run.map.base.x, run.map.base.y - 40, '+' + e.n + ' HP', COL.green, 20); this.sfx('heal'); break;
        case 'jam': fx.burst(e.x, e.y, ['#ff6b6b', '#fff'], 8, { speed: 100 }); this.sfx('jam', e.x); break;
        case 'blink': fx.burst(e.x, e.y, ['#35f0c8', '#ff5fb0'], 8, { speed: 120 }); break;
        case 'drop': fx.doFlash('#7a5cff', 0.4); fx.addShake(10); this.sfx('merge_big'); break;
        case 'reroll': this.sfx('reroll'); break;
        case 'revive': this.queueBanner('SECOND WIND', 'The stage rises again', COL.green, 2); fx.doFlash('#fff', 0.6); this.sfx('heal'); break;
        case 'win': this.sfx('win'); fx.confetti(W / 2, 400, 80); fx.doFlash('#fff', 0.5); break;
        case 'lose': this.sfx('lose'); fx.addShake(10); break;
        case 'echoes': fx.burst(e.x, e.y, '#d6c7ff', 8, { speed: 90 }); break;
        case 'hum': break;
        case 'rage': fx.burst(e.x, e.y, '#ff8a3c', 6, { speed: 100 }); break;
        default: break;
      }
      if (this.tut) this.tutEvent(e);
    }
  }
  vibrate(ms) { if (this.prof.settings.vibrate && typeof navigator !== 'undefined' && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* ignore */ } } }

  // ------------------------------------------------------------------------------------------------ actions
  doDeploy() {
    const run = this.run;
    if (run.phase === 'won' || run.phase === 'lost' || this.paused) return;
    const onBeatCheck = this.beatPhase;
    const beatLen = 60 / run.bpm;
    const err = Math.min(onBeatCheck, 1 - onBeatCheck) * beatLen;
    const onBeat = this.prof.settings.beat && err <= ECON.beatWindow;
    let slotIdx = this.targetSlot;
    if (slotIdx == null && this.tut && !this.tut.done) slotIdx = [16, 17, 30, 32, 44, 45, 18, 15].find((i) => !run.grid.has(i) && run.map.buildable.some((s) => s.idx === i)) ?? null;
    const r = run.deploy(slotIdx, { onBeat });
    if (r.ok) { this.targetSlot = null; this.selected = null; this.app.audio.resume(); }
    else if (r.reason === 'coins') { this.fx.floater(R.deploy.x + R.deploy.w / 2, R.deploy.y - 12, 'Need ' + r.cost + ' coins', COL.red, 17, { life: 0.9 }); this.sfx('error'); this.deployPulse = 0; }
    else if (r.reason === 'full') { this.fx.floater(R.deploy.x + R.deploy.w / 2, R.deploy.y - 12, 'Board full! Merge or sell', COL.orange, 17, { life: 1.1 }); this.sfx('error'); this.hint('full'); }
    else if (r.reason === 'slot') { this.targetSlot = null; }
    return r;
  }
  doMergeAll() {
    if (!this.prof.autoMerge) { this.app.hooks.toast('Merge All is a shop unlock (150 diamonds).'); this.sfx('error'); return; }
    const n = this.run.mergeAll(10);
    if (!n) { this.fx.floater(R.merge.x + 29, R.merge.y - 6, 'No pairs', COL.dim, 15); this.sfx('error'); }
  }
  doReroll() {
    const run = this.run;
    if (run.rerolls <= 0) {
      if (this.prof.diamonds >= ECON.rerollCostDiamonds) { this.app.hooks.spendDiamonds(ECON.rerollCostDiamonds); run.rerolls++; }
      else { this.app.hooks.toast('Rerolls cost 3 diamonds. Earn more in runs and quests!'); this.sfx('error'); return; }
    }
    run.rerollDrop();
  }
  doCall() {
    const run = this.run;
    if (run.phase === 'prep' || (run.phase === 'wave' && !run.spawnQ.length)) {
      const wasPrep = run.phase === 'prep';
      if (run.startWave(true) && wasPrep) this.sfx('countdown');
    }
  }
  toggleSpeed() { this.speed = this.speed >= 3 ? 1 : this.speed + 1; this.prof.settings.speed = this.speed; this.sfx('ui_click'); }
  setPause(v) { this.paused = v; this.sfx(v ? 'ui_open' : 'ui_back'); }
  hero(who) {
    if (this.paused) return;
    if (!this.run.heroReady(who)) { this.sfx('error'); return; }
    this.run.useHero(who); this.app.audio.resume();
  }

  // ------------------------------------------------------------------------------------------------ input
  slotAtPoint(x, y) {
    const c = Math.floor((x - BOARD_X) / TILE), r = Math.floor((y - BOARD_Y) / TILE);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
    return this.run.map.buildable.find((s) => s.c === c && s.r === r) || null;
  }
  tutAllows(name) {
    if (!this.tut || this.tut.done) return true;
    const s = TUTORIAL[this.tut.i];
    if (!s || s.free) return true;
    if (s.wait === 'tap') return false;
    if (name === 'deploy') return s.spot === 'deploy';
    if (name === 'turrets') return s.spot === 'turrets';
    if (name === 'wave') return s.spot === 'wave';
    return false;
  }
  pointerDown(x, y) {
    this.app.audio.resume();
    if (this.tut && this.tutPointer(x, y)) return;
    if (this.paused || this.hintQueue.length || this.run.choice) return;
    const run = this.run;
    if (inR(R.pause, x, y)) { this.app.hooks.onPause(this); return; }
    if (inR(R.speed, x, y)) { this.toggleSpeed(); return; }
    if (inR(R.call, x, y)) { if (this.tutAllows('wave')) this.doCall(); return; }
    if (inR(R.deploy, x, y)) { if (this.tutAllows('deploy')) this.doDeploy(); return; }
    if (inR(R.merge, x, y)) { if (this.tutAllows('merge')) this.doMergeAll(); return; }
    if (inR(R.reroll, x, y)) { if (this.tutAllows('reroll')) this.doReroll(); return; }
    if (inC(R.heroR, x, y)) { this.hero('roxor'); return; }
    if (inC(R.heroJ, x, y)) { this.hero('jasmin'); return; }
    // selected turret panel buttons
    if (this.panel) {
      if (inR(this.panel.sell, x, y)) { if (this.tutAllows('sell')) { run.sell(this.selected); this.selected = null; } return; }
      if (inR(this.panel.mode, x, y)) { const t = run.turretById(this.selected); if (t) { const ms = ['first', 'last', 'strong', 'close']; t.mode = ms[(ms.indexOf(t.mode) + 1) % 4]; this.sfx('ui_click'); } return; }
      if (inR(this.panel.box, x, y)) return;
    }
    if (!this.tutAllows('turrets')) return;
    const slot = this.slotAtPoint(x, y);
    if (!slot) { this.selected = null; return; }
    const tur = run.grid.get(slot.idx);
    if (tur) {
      // tap-merge: a selected turret that can merge with this one
      if (this.selected && this.selected !== tur.id) {
        const sel = run.turretById(this.selected);
        if (sel && run.canMerge(sel, tur)) { run.merge(sel.id, tur.id); this.selected = tur.id; return; }
      }
      this.drag = { id: tur.id, x, y, sx: x, sy: y, moved: false };
      this.selected = tur.id;
      this.sfx('ui_tab');
    } else {
      this.selected = null;
      this.targetSlot = this.targetSlot === slot.idx ? null : slot.idx;
      this.sfx('ui_click');
    }
  }
  pointerMove(x, y) {
    this.hoverSlot = this.slotAtPoint(x, y);
    if (this.drag) {
      this.drag.x = x; this.drag.y = y;
      if (!this.drag.moved && Math.hypot(x - this.drag.sx, y - this.drag.sy) > 9) this.drag.moved = true;
    }
  }
  pointerUp(x, y) {
    if (!this.drag) return;
    const d = this.drag; this.drag = null;
    if (!d.moved) return;
    const run = this.run;
    const slot = this.slotAtPoint(x, y);
    const a = run.turretById(d.id);
    if (!a || !slot) return;
    const b = run.grid.get(slot.idx);
    if (b && b !== a) {
      if (run.canMerge(a, b)) { run.merge(a.id, b.id); this.selected = b.id; }
      else { run.move(a.id, slot.idx); this.selected = a.id; }
    } else if (!b) { run.move(a.id, slot.idx); this.selected = a.id; }
  }
  key(k) {
    if (k === ' ' || k === 'Enter') { if (this.tutAllows('deploy')) this.doDeploy(); }
    else if (k === 'm' || k === 'M') this.doMergeAll();
    else if (k === 'q' || k === 'Q') this.hero('roxor');
    else if (k === 'w' || k === 'W') this.hero('jasmin');
    else if (k === 'n' || k === 'N') this.doCall();
    else if (k === 'f' || k === 'F') this.toggleSpeed();
    else if (k === 'r' || k === 'R') this.doReroll();
    else if (k === 'Escape' || k === 'p' || k === 'P') this.app.hooks.onPause(this);
    else if (k === 's' || k === 'S') { if (this.selected) { this.run.sell(this.selected); this.selected = null; } }
  }

  // ------------------------------------------------------------------------------------------------ tutorial
  tutEnter() { this.tutBubble = { text: TUTORIAL[0].say, t: 0 }; }
  tutEvent(e) {
    const f = this.tut.flags;
    if (e.k === 'hero') f[e.who === 'roxor' ? 'heroR' : 'heroJ'] = true;
  }
  tutCond(id) {
    const run = this.run, f = this.tut.flags;
    switch (id) {
      case 'tap': return !!f.tap;
      case 'deployed1': return run.deploys >= 1;
      case 'deployed2': return run.deploys >= 2;
      case 'merged1': return run.merges >= 1;
      case 'wavestarted': return run.wave >= 1;
      case 'kills3': return run.kills >= 4;
      case 'remixopen': return run.remixCount >= 1;
      case 'heroR': return !!f.heroR;
      case 'heroJ': return !!f.heroJ;
      default: return false;
    }
  }
  tutUpdate(dt) {
    const tut = this.tut;
    if (tut.done) return;
    tut.t += dt;
    const s = TUTORIAL[tut.i];
    if (!s) { tut.done = true; return; }
    // prime the hero cooldowns when the hero steps arrive
    if (s.id === 'hero') this.run.heroCd.roxor = 0;
    if (s.id === 'hero2') this.run.heroCd.jasmin = 0;
    if (this.tutCond(s.wait) && tut.t > 0.6) this.tutNext();
    if (s.id === 'hype' && !this.run.choice && this.run.hype < this.run.hypeNeed * 0.9 && this.run.level === 1 && tut.t > 1) this.run.hype = this.run.hypeNeed;
  }
  tutNext() {
    const tut = this.tut;
    tut.i++; tut.t = 0; tut.flags.tap = false;
    const s = TUTORIAL[tut.i];
    if (!s) { tut.done = true; this.tutBubble = null; return; }
    this.tutBubble = { text: s.say, t: 0 };
    this.sfx('ui_tab');
  }
  tutPointer(x, y) {
    const tut = this.tut;
    if (tut.done) return false;
    const s = TUTORIAL[tut.i];
    if (!s) return false;
    if (s.wait === 'tap' && tut.t > 0.35) { tut.flags.tap = true; return true; }
    return false;
  }
  tutSpot() {
    if (!this.tut || this.tut.done) return null;
    const s = TUTORIAL[this.tut.i];
    if (!s || !s.spot || s.spot === 'none') return null;
    switch (s.spot) {
      case 'deploy': return { x: R.deploy.x - 8, y: R.deploy.y - 8, w: R.deploy.w + 16, h: R.deploy.h + 16 };
      case 'coins': return { x: R.coins.x - 6, y: R.coins.y - 6, w: R.coins.w + 12, h: R.coins.h + 12 };
      case 'wave': return { x: R.call.x - 6, y: R.call.y - 6, w: R.call.w + 12, h: R.call.h + 12 };
      case 'heroR': return { x: R.heroR.x - 52, y: R.heroR.y - 52, w: 104, h: 104, round: true };
      case 'heroJ': return { x: R.heroJ.x - 52, y: R.heroJ.y - 52, w: 104, h: 104, round: true };
      case 'turrets': {
        const ts = this.run.turrets;
        if (ts.length < 2) return null;
        const xs = ts.map((t) => t.x), ys = ts.map((t) => t.y);
        const x0 = Math.min(...xs) - 44, x1 = Math.max(...xs) + 44, y0 = Math.min(...ys) - 44, y1 = Math.max(...ys) + 44;
        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      }
      default: return null;
    }
  }

  // ------------------------------------------------------------------------------------------------ drawing
  draw(ctx, view) {
    const run = this.run, t = this.t, fx = this.fx;
    const world = this.world;
    const beat = Math.pow(1 - this.beatPhase, 3);
    // full-canvas backdrop in device space
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    AW.drawBackdrop(ctx, world.id, view.cw, view.ch, t, { beat: beat * 0.6, staticAmt: clamp(1 - run.stageFrac, 0, 1) * 0.85 });
    // logical space
    const [sx, sy] = fx.shakeOffset();
    ctx.setTransform(view.dpr * view.s, 0, 0, view.dpr * view.s, view.dpr * (view.ox + sx), view.dpr * (view.oy + sy));
    this.drawBoard(ctx, t, beat);
    fx.drawWorld(ctx);
    ctx.setTransform(view.dpr * view.s, 0, 0, view.dpr * view.s, view.dpr * view.ox, view.dpr * view.oy);
    fx.drawFloaters(ctx);
    this.drawHud(ctx, t, beat);
    this.drawBanner(ctx);
    if (this.tut && !this.tut.done) this.drawTutorial(ctx);
    if (this.hurtFlash > 0) { ctx.save(); ctx.globalAlpha = Math.min(0.35, this.hurtFlash * 0.35); ctx.strokeStyle = '#ff2a4a'; ctx.lineWidth = 40; ctx.strokeRect(-20, -20, W + 40, H + 40); ctx.restore(); }
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    fx.drawFlash(ctx, view.cw, view.ch);
  }
  drawBoard(ctx, t, beat) {
    const run = this.run;
    AW.drawBoard(ctx, run.map.id, run.world.id, t, { beat, slotHint: this.slotHint, hoverSlot: this.hoverSlot ? [this.hoverSlot.c, this.hoverSlot.r] : null, dropSlot: this.targetSlot != null ? [this.targetSlot % COLS, Math.floor(this.targetSlot / COLS)] : null });
    AW.drawStageBase(ctx, run.world.id, run.map.base.x, run.map.base.y, { t, hp: run.stageFrac, hit: Math.max(0, this.hurtFlash), beat });
    // selected range ring + panel
    const sel = this.selected ? run.turretById(this.selected) : null;
    if (sel) {
      const rg = run.turretRange(sel);
      ctx.save(); ctx.beginPath(); ctx.arc(sel.x, sel.y, rg, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill(); ctx.setLineDash([8, 8]); ctx.lineDashOffset = -t * 20; ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    }
    // merge hints while dragging or selected
    const dragT = this.drag && this.drag.moved ? run.turretById(this.drag.id) : null;
    const hintT = dragT || sel;
    // turrets
    const ts = run.turrets.slice().sort((a, b) => a.y - b.y);
    for (const tu of ts) {
      const hiddenByDrag = this.drag && this.drag.moved && this.drag.id === tu.id;
      const age = t - (tu.born || 0);
      const canMerge = hintT && hintT !== tu && run.canMerge(hintT, tu);
      if (canMerge) {
        const k = 0.5 + 0.5 * Math.sin(t * 8);
        ctx.save(); ctx.beginPath(); ctx.arc(tu.x, tu.y, 40 + k * 3, 0, Math.PI * 2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.globalAlpha = 0.55 + 0.4 * k; ctx.stroke();
        ctx.fillStyle = 'rgba(157,255,58,0.25)'; ctx.fill(); ctx.restore();
      }
      AE.drawTurret(ctx, tu.type, tu.level, tu.x, tu.y, {
        t, ang: tu.ang, fire: Math.max(0, tu.fire), jammed: tu.jam > 0, buff: tu.auraRate > 0 ? 'rate' : tu.auraDmg > 0 ? 'dmg' : null,
        selected: tu.id === this.selected, alpha: hiddenByDrag ? 0.3 : 1, spawn: clamp(age / 0.25, 0, 1),
      });
      if (tu.mode !== 'first' && tu.id === this.selected) { /* mode shown in panel */ }
    }
    // enemies
    const en = run.enemies.slice().sort((a, b) => (a.flying - b.flying) || (a.y - b.y));
    for (const e of en) {
      if (e.boss) {
        AE.drawBoss(ctx, e.type, e.x, e.y, { t, ang: e.ang, hp: e.hp / e.maxHp, hit: e.hitT > 0 ? e.hitT / 0.12 : 0, gated: e.gated, phase: e.phase, scale: e.r / BOSSES[e.type].r });
      } else {
        const sc = e.r / ENEMIES[e.type].r;
        AE.drawEnemy(ctx, e.type, e.x, e.y, {
          t, ang: e.ang, hp: e.hp / e.maxHp, hit: e.hitT > 0 ? e.hitT / 0.12 : 0, slow: e.slowT > 0 && e.slowAmt > 0, stun: e.stun > 0, burn: e.burnT > 0, mark: e.markT > 0,
          shield: e.shieldMax ? e.shield / e.shieldMax : 0, affix: e.affix, scale: sc, rage: e.rage, id: e.id,
        });
      }
    }
    // projectiles
    for (const p of run.projectiles) {
      if (p.delay > 0) continue;
      AE.drawProjectile(ctx, p.style, p.x, p.y, { t, ang: p.ang || 0, scale: p.small ? 0.7 : p.big ? 1.5 : 1 });
    }
    // dragged turret ghost
    if (this.drag && this.drag.moved) {
      const tu = run.turretById(this.drag.id);
      if (tu) AE.drawTurret(ctx, tu.type, tu.level, this.drag.x, this.drag.y - 20, { t, ang: tu.ang, scale: 1.15, selected: true, alpha: 0.95 });
    }
    // sell/merge panel
    this.panel = null;
    if (sel) this.drawPanel(ctx, sel);
  }
  drawPanel(ctx, tu) {
    const run = this.run, def = TURRETS[tu.type];
    const top = tu.y > BOARD_Y + BOARD_H / 2;
    const box = { x: 16, y: top ? BOARD_Y + 6 : BOARD_Y + BOARD_H - 92, w: 508, h: 86 };
    ctx.save();
    rrect(ctx, box.x, box.y, box.w, box.h, 14); ctx.fillStyle = 'rgba(18,8,43,0.92)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = def.color; ctx.stroke();
    AE.drawTurretIconFlat(ctx, tu.type, box.x + 40, box.y + 43, 56);
    text(ctx, def.name + '  Lv ' + tu.level + (tu.level >= MAX_LEVEL ? ' MAX' : ''), box.x + 80, box.y + 24, 20, '#fff', 'left');
    let line;
    if (def.kind === 'aura_rate') line = '+' + Math.round(def.aura * (1 + 0.2 * (tu.level - 1)) * 100 * (tu.level >= 7 ? 1.5 : 1)) + '% neighbour fire rate';
    else if (def.kind === 'aura_dmg') line = '+' + Math.round(def.aura * (1 + 0.2 * (tu.level - 1)) * 100 * (tu.level >= 7 ? 1.5 : 1)) + '% neighbour damage';
    else line = 'DMG ' + fmt(run.turretDmg(tu)) + '   RATE ' + run.turretRate(tu).toFixed(1) + '/s';
    text(ctx, line, box.x + 80, box.y + 48, 15, COL.dim, 'left');
    const perk = Object.keys(def.perks).map(Number).filter((k) => k > tu.level).sort((a, b) => a - b)[0];
    text(ctx, perk ? 'Lv ' + perk + ': ' + def.perks[perk] : 'Fully upgraded', box.x + 80, box.y + 70, 13, COL.gold, 'left');
    const mode = { x: box.x + box.w - 214, y: box.y + 14, w: 112, h: 58 };
    const sell = { x: box.x + box.w - 94, y: box.y + 14, w: 84, h: 58 };
    const isAttacker = def.kind !== 'aura_rate' && def.kind !== 'aura_dmg';
    if (isAttacker) {
      button(ctx, mode, '#3a2a7a', { label: { first: 'First', last: 'Last', strong: 'Strongest', close: 'Closest' }[tu.mode], sub: 'TARGET', size: 15 });
    }
    button(ctx, sell, '#7a2a3a', { label: '+' + Math.floor(tu.paid * Math.min(0.95, ECON.sellBack + run.mods.sell)), sub: 'SELL', size: 17 });
    this.panel = { box, mode: isAttacker ? mode : { x: -99, y: -99, w: 0, h: 0 }, sell };
    ctx.restore();
  }
  drawHud(ctx, t, beat) {
    const run = this.run, tut = this.tut && !this.tut.done;
    // HUD backing strip
    ctx.save();
    const g = ctx.createLinearGradient(0, 0, 0, 118); g.addColorStop(0, 'rgba(10,4,30,0.92)'); g.addColorStop(1, 'rgba(10,4,30,0.35)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 118);
    const g2 = ctx.createLinearGradient(0, 840, 0, H); g2.addColorStop(0, 'rgba(10,4,30,0.2)'); g2.addColorStop(1, 'rgba(10,4,30,0.95)');
    ctx.fillStyle = g2; ctx.fillRect(0, 840, W, 120);
    ctx.restore();
    // pause
    button(ctx, R.pause, '#2a1c5a', { icon: 'pause' });
    // stage health
    const hp = R.hp; const f = run.stageFrac;
    ctx.save();
    rrect(ctx, hp.x, hp.y, hp.w, hp.h, 12); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill();
    const bw = hp.w - 58;
    rrect(ctx, hp.x + 50, hp.y + 12, bw, 20, 8); ctx.fillStyle = '#1b0f3a'; ctx.fill();
    rrect(ctx, hp.x + 50, hp.y + 12, Math.max(6, bw * f), 20, 8); ctx.fillStyle = f > 0.5 ? '#6dff8a' : f > 0.25 ? '#ffd23c' : '#ff4a5e'; ctx.fill();
    ctx.restore();
    AE.drawGlyph(ctx, 'heart', hp.x + 26, hp.y + 22, 30, f < 0.3 && Math.sin(t * 10) > 0 ? '#fff' : COL.red);
    text(ctx, run.stageHp + '/' + run.stageMax, hp.x + 50 + bw / 2, hp.y + 23, 15, '#fff', 'center');
    // wave
    const w = R.wave;
    text(ctx, run.endless ? 'WAVE ' + Math.max(1, run.wave) : 'WAVE ' + Math.max(1, run.wave) + '/' + run.wavesTotal, w.x + w.w / 2, w.y + 16, 19, '#fff', 'center');
    if (run.wmId) { const m = WAVE_MODS[run.wmId]; text(ctx, m.name, w.x + w.w / 2, w.y + 37, 14, m.good ? COL.green : COL.orange, 'center'); }
    else if (run.phase === 'prep' && (run.endless || run.wave < run.wavesTotal)) {
      const spec = run.upcoming();
      const types = [...new Set(spec.groups.map((g) => g.type))].slice(0, 3);
      const n = types.length + (spec.boss ? 1 : 0) + (spec.mod ? 1 : 0);
      let x = w.x + w.w / 2 - (n - 1) * 13;
      text(ctx, 'NEXT', w.x + 12, w.y + 37, 10, COL.dim, 'left');
      for (const ty of types) { AE.drawEnemy(ctx, ty, x + 8, w.y + 36, { t, scale: 0.62, hp: 1 }); x += 26; }
      if (spec.boss) { AE.drawGlyph(ctx, 'crown', x + 8, w.y + 36, 22, '#ff4a5e'); x += 26; }
      if (spec.mod) AE.drawGlyph(ctx, WAVE_MODS[spec.mod].glyph, x + 8, w.y + 36, 20, WAVE_MODS[spec.mod].good ? COL.green : COL.orange);
    } else text(ctx, run.world.name, w.x + w.w / 2, w.y + 37, 13, COL.dim, 'center');
    // coins
    const c = R.coins;
    ctx.save(); rrect(ctx, c.x, c.y, c.w, c.h, 12); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill(); ctx.restore();
    AE.drawGlyph(ctx, 'coin', c.x + 24, c.y + 22, 30);
    text(ctx, fmt(run.coins), c.x + 46, c.y + 23, 24, COL.coin, 'left');
    // hype bar
    const h = R.hype;
    ctx.save();
    rrect(ctx, h.x, h.y, h.w, h.h, 12); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill();
    const hf = clamp(run.hype / run.hypeNeed, 0, 1);
    rrect(ctx, h.x + 58, h.y + 10, h.w - 66, 20, 8); ctx.fillStyle = '#1b0f3a'; ctx.fill();
    const hg = ctx.createLinearGradient(h.x + 58, 0, h.x + h.w, 0); hg.addColorStop(0, '#ff5fb0'); hg.addColorStop(1, '#ffc83d');
    rrect(ctx, h.x + 58, h.y + 10, Math.max(8, (h.w - 66) * hf), 20, 8); ctx.fillStyle = hg; ctx.fill();
    ctx.restore();
    text(ctx, 'LV ' + run.level, h.x + 29, h.y + 21, 17, COL.gold, 'center');
    text(ctx, 'HYPE', h.x + 58 + (h.w - 66) / 2, h.y + 21, 13, '#fff', 'center');
    // combo
    if (this.comboShow > 0.01) {
      ctx.save(); ctx.globalAlpha = this.comboShow;
      text(ctx, run.combo + ' COMBO', R.hype.x + 10, R.hype.y + 56, 15, run.combo >= 25 ? COL.gold : COL.cyan, 'left');
      ctx.restore();
    }
    // speed
    button(ctx, R.speed, '#2a1c5a', { label: this.speed + 'x', sub: 'SPEED', size: 20 });
    // call wave
    const call = R.call;
    const prep = run.phase === 'prep', canCall = prep || (run.phase === 'wave' && !run.spawnQ.length);
    const left = prep ? Math.max(0, Math.ceil(run.prepT)) : 0;
    const lastWave = !run.endless && run.wave >= run.wavesTotal;
    if (lastWave && run.phase !== 'prep') button(ctx, call, '#3a2a7a', { label: 'FINAL WAVE', size: 17 });
    else if (prep) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 6);
      button(ctx, call, pulse > 0.5 ? '#2fa84a' : '#27963f', { label: run.wave === 0 ? 'START WAVE 1' : 'NEXT WAVE', sub: run.prepT > 100 ? 'tap to begin' : left + 's  +' + Math.round(Math.min(ECON.prepSeconds, run.prepT) * ECON.earlyBonusPerSec) + ' coins', size: 17 });
    } else if (canCall) button(ctx, call, '#2a6a9a', { label: 'CALL NEXT', sub: 'bonus coins', size: 17 });
    else button(ctx, call, '#2a1c5a', { label: run.enemies.length + ' left', sub: 'fighting', size: 17, dim: true });
    // boss bar
    const boss = run.enemies.find((e) => e.boss);
    if (boss) {
      const bx = 60, by = 114, bw = 420;
      ctx.save(); rrect(ctx, bx - 4, by - 4, bw + 8, 22, 9); ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fill();
      rrect(ctx, bx, by, Math.max(6, bw * clamp(boss.hp / boss.maxHp, 0, 1)), 14, 6); ctx.fillStyle = boss.gated ? '#ffd23c' : '#ff4a5e'; ctx.fill();
      ctx.restore();
      text(ctx, BOSSES[boss.type].name.toUpperCase(), W / 2, by + 7, 12, '#fff', 'center');
    }
    // bottom: heroes, merge, deploy, reroll
    this.drawHero(ctx, 'roxor', R.heroR, t);
    this.drawHero(ctx, 'jasmin', R.heroJ, t);
    const mrg = R.merge, locked = !this.prof.autoMerge;
    button(ctx, mrg, locked ? '#2a1c3a' : '#2a6a4a', { icon: locked ? 'lock' : 'merge', sub: 'MERGE', size: 13 });
    const rr = R.reroll;
    button(ctx, rr, '#2a1c5a', { icon: 'reroll', sub: run.rerolls > 0 ? run.rerolls + ' free' : '3 gems', size: 13 });
    this.drawDeploy(ctx, t, beat);
    // next turret preview text and tip
    const slotsLeft = run.slotCapacity() - run.turrets.length;
    text(ctx, run.turrets.length + '/' + run.slotCapacity() + ' tiles', W / 2, 835, 13, slotsLeft < 3 ? COL.orange : COL.dim, 'center');
  }
  drawDeploy(ctx, t, beat) {
    const run = this.run, d = R.deploy;
    const cost = run.deployCost(false), can = run.coins >= cost && run.canDeploy().ok;
    const ph = this.beatPhase;
    const sc = 1 + 0.05 * beat + Math.max(0, this.deployPulse) * 0.06;
    ctx.save();
    ctx.translate(d.x + d.w / 2, d.y + d.h / 2); ctx.scale(sc, sc);
    const w = d.w, h = d.h;
    rrect(ctx, -w / 2, -h / 2, w, h, 22);
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    if (can) { g.addColorStop(0, '#ff7ac0'); g.addColorStop(1, '#d83a8e'); } else { g.addColorStop(0, '#4a3a7a'); g.addColorStop(1, '#2e2358'); }
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#12082b'; ctx.stroke();
    ctx.restore();
    // beat ring: closes in on the button edge right at the beat
    if (this.prof.settings.beat) {
      const k = ph; // 0 at the beat, grows to 1 just before the next
      const rad = 1 + (1 - k) * 0.0;
      const closing = 1 + (1 - Math.min(1, (1 - k) * 1)) * 0; // keep simple: pulse width
      ctx.save(); ctx.translate(d.x + d.w / 2, d.y + d.h / 2);
      const near = Math.min(ph, 1 - ph) * (60 / run.bpm) <= ECON.beatWindow;
      const grow = 1 + (1 - ph) * 0.22;   // ring shrinks toward the button as the beat approaches
      rrect(ctx, -d.w / 2 * grow, -d.h / 2 * grow, d.w * grow, d.h * grow, 26);
      ctx.strokeStyle = near ? '#fff' : 'rgba(47,230,255,0.75)'; ctx.lineWidth = near ? 5 : 3; ctx.globalAlpha = near ? 1 : 0.35 + 0.5 * (ph); ctx.stroke();
      ctx.restore();
    }
    // content: next type icon and label
    const next = TURRETS[run.nextType];
    AE.drawTurretIconFlat(ctx, run.nextType, d.x + 44, d.y + d.h / 2 - 4, 54);
    text(ctx, 'DROP', d.x + 90, d.y + 30, 26, '#fff', 'left');
    text(ctx, next.name, d.x + 90, d.y + 52, 13, 'rgba(255,255,255,0.85)', 'left');
    if (run.mods.freeDeploys > 0) text(ctx, 'FREE x' + run.mods.freeDeploys, d.x + 90, d.y + 74, 17, COL.green, 'left');
    else {
      AE.drawGlyph(ctx, 'coin', d.x + 100, d.y + 73, 20);
      text(ctx, fmt(cost), d.x + 114, d.y + 74, 20, can ? COL.coin : '#ff8a8a', 'left');
    }
    // target slot hint
    if (this.targetSlot != null) text(ctx, 'to chosen tile', d.x + d.w - 10, d.y + 74, 12, COL.cyan, 'right');
  }
  drawHero(ctx, who, c, t) {
    const run = this.run;
    const ready = run.heroReady(who), max = run.heroMax(who), cd = run.heroCd[who];
    const col = who === 'roxor' ? COL.green : COL.pink;
    ctx.save();
    const pulse = ready ? 0.5 + 0.5 * Math.sin(t * 7) : 0;
    ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fillStyle = ready ? 'rgba(30,18,70,0.95)' : 'rgba(20,12,45,0.95)'; ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(c.x, c.y, c.r - 2, 0, Math.PI * 2); ctx.clip();
    ctx.globalAlpha = ready ? 1 : 0.55;
    AW.drawBust(ctx, who, c.x, c.y + 8, c.r * 2.1, { t, outfit: this.prof.outfits.worn[who], pose: ready ? 'hype' : 'idle' });
    ctx.restore();
    // cooldown sweep
    if (!ready) {
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.arc(c.x, c.y, c.r - 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (cd / max), false); ctx.closePath();
      ctx.fillStyle = 'rgba(8,4,24,0.65)'; ctx.fill();
      text(ctx, Math.ceil(cd) + '', c.x, c.y, 24, '#fff', 'center');
    }
    ctx.lineWidth = 5; ctx.strokeStyle = ready ? col : '#4a3a7a'; ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.stroke();
    if (ready) { ctx.globalAlpha = 0.3 + pulse * 0.5; ctx.lineWidth = 8; ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(c.x, c.y, c.r + 4 + pulse * 3, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
    text(ctx, ready ? (who === 'roxor' ? 'BLAST' : 'SONG') : (who === 'roxor' ? 'Blast' : 'Song'), c.x, c.y + c.r + 10, 12, ready ? col : COL.dim, 'center');
  }
  drawBanner(ctx) {
    const b = this.banner; if (!b) return;
    const k = b.t / b.life;
    const inK = clamp(b.t / 0.22, 0, 1), outK = clamp((b.life - b.t) / 0.3, 0, 1);
    const a = Math.min(inK, outK);
    ctx.save();
    ctx.globalAlpha = a;
    const y = b.small ? 300 : 380;
    const sc = 0.8 + 0.2 * inK;
    ctx.translate(W / 2, y); ctx.scale(sc, sc);
    if (!b.small) {
      rrect(ctx, -250, -50, 500, b.sub ? 108 : 78, 20); ctx.fillStyle = 'rgba(12,5,34,0.82)'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = b.color; ctx.stroke();
    }
    text(ctx, b.text, 0, b.small ? 0 : -14, b.small ? 36 : (b.text.length > 20 ? 28 : 38), b.color, 'center');
    if (b.sub && !b.small) wrapText(ctx, b.sub, 0, 28, 460, 16, 20, '#e9e0ff', 'center');
    else if (b.sub) text(ctx, b.sub, 0, 34, 16, '#fff', 'center');
    ctx.restore();
  }
  drawTutorial(ctx) {
    const spot = this.tutSpot();
    const s = TUTORIAL[this.tut.i];
    if (!s) return;
    ctx.save();
    if (spot && !s.free) {
      ctx.fillStyle = 'rgba(6,2,20,0.72)';
      ctx.beginPath(); ctx.rect(0, 0, W, H);
      if (spot.round) { ctx.moveTo(spot.x + spot.w / 2 + spot.w / 2, spot.y + spot.h / 2); ctx.arc(spot.x + spot.w / 2, spot.y + spot.h / 2, spot.w / 2, 0, Math.PI * 2, true); }
      else rrectPath(ctx, spot.x, spot.y, spot.w, spot.h, 16, true);
      ctx.fill('evenodd');
    } else if (!s.free) { ctx.fillStyle = 'rgba(6,2,20,0.55)'; ctx.fillRect(0, 0, W, H); }
    if (spot) {
      const k = 0.5 + 0.5 * Math.sin(this.t * 6);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3 + k * 2; ctx.globalAlpha = 0.6 + 0.4 * k;
      if (spot.round) { ctx.beginPath(); ctx.arc(spot.x + spot.w / 2, spot.y + spot.h / 2, spot.w / 2 + 2, 0, Math.PI * 2); ctx.stroke(); }
      else { rrect(ctx, spot.x, spot.y, spot.w, spot.h, 16); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    // Loopy and the speech bubble
    const atTop = spot && spot.y > 400 ? true : (spot ? spot.y < 400 ? false : true : false);
    const by = atTop ? 140 : 560;
    const bw = 470, bh = 150;
    const bx = 20 + 40;
    ctx.translate(0, 0);
    rrect(ctx, bx - 30, by, bw, bh, 20); ctx.fillStyle = 'rgba(255,248,235,0.97)'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#12082b'; ctx.stroke();
    AW.drawLoopy(ctx, 50, by + bh - 20, 78, { t: this.t, mood: 'happy', talk: this.tut.t < 2.5 });
    wrapText(ctx, this.tutBubble ? this.tutBubble.text : '', bx + 70, by + 30, bw - 100, 20, 24, '#241140', 'left');
    if (s.wait === 'tap') text(ctx, 'tap to continue', bx - 30 + bw - 20, by + bh - 16, 14, '#7a5cff', 'right');
    ctx.restore();
  }
}

// ------------------------------------------------------------------------------------------------ small canvas helpers
export function rrectPath(ctx, x, y, w, h, r, reverse) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
export function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); rrectPath(ctx, x, y, w, h, r); }
export function text(ctx, s, x, y, size, color, align = 'left', weight = 900) {
  ctx.save();
  ctx.font = weight + ' ' + size + 'px ' + FONT; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size * 0.22); ctx.strokeStyle = 'rgba(12,5,34,0.9)'; ctx.strokeText(s, x, y);
  ctx.fillStyle = color; ctx.fillText(s, x, y);
  ctx.restore();
}
export function wrapText(ctx, s, x, y, maxW, size, lh, color, align = 'left') {
  ctx.save(); ctx.font = '800 ' + size + 'px ' + FONT;
  const words = s.split(' '); let line = ''; const lines = [];
  for (const w of words) { const test = line ? line + ' ' + w : w; if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test; }
  if (line) lines.push(line);
  ctx.restore();
  lines.slice(0, 5).forEach((l, i) => { ctx.save(); ctx.font = '800 ' + size + 'px ' + FONT; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(l, x, y + i * lh); ctx.restore(); });
}
export function button(ctx, r, color, o = {}) {
  ctx.save();
  rrect(ctx, r.x, r.y, r.w, r.h, 14);
  const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  g.addColorStop(0, lighten(color, 0.18)); g.addColorStop(1, color);
  ctx.globalAlpha = o.dim ? 0.7 : 1; ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#12082b'; ctx.stroke();
  ctx.globalAlpha = 1;
  if (o.icon) AE.drawGlyph(ctx, o.icon, r.x + r.w / 2, r.y + r.h / 2 - (o.sub ? 8 : 0), o.sub ? 30 : 28, '#fff');
  if (o.label) text(ctx, o.label, r.x + r.w / 2, r.y + r.h / 2 - (o.sub ? 7 : 0), o.size || 18, '#fff', 'center');
  if (o.sub) text(ctx, o.sub, r.x + r.w / 2, r.y + r.h - 12, (o.size && o.icon) ? o.size : 12, 'rgba(255,255,255,0.85)', 'center', 800);
  ctx.restore();
}
function lighten(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + 255 * k), g = Math.min(255, ((n >> 8) & 255) + 255 * k), b = Math.min(255, (n & 255) + 255 * k);
  return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
}
