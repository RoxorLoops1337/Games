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
import { glass, button, liquidBar, bezel, text, wrapText, rrect, rrectPath, rgba } from './hudx.js';
import { drawGlow } from './fx.js';

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
          fx.sparks(e.x, e.y, [def.accent, '#fff'], 8, { speed: 220 });
          fx.ring(e.x, e.y, 46, def.color, { life: 0.35 });
          fx.light(e.x, e.y, 90, def.color, 0.3, 0.8);
          fx.pillar(e.x, e.y + 6, def.color, 120, 0.45);
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
          fx.ring(e.x, e.y, e.big ? 130 : 84, def.color, { life: 0.7, w: 3 });
          fx.pillar(e.x, e.y + 6, e.level >= 5 ? COL.gold : def.color, 120 + e.level * 40, 0.7);
          fx.light(e.x, e.y, 130 + e.level * 12, def.accent, 0.4, 0.9);
          fx.sparks(e.x, e.y, [def.accent, '#fff', COL.gold], 10 + e.level * 2, { speed: 300 });
          if (e.level >= 5) fx.raysBurst(e.x, e.y, COL.gold, 160 + e.level * 16, 0.8, 12);
          fx.floater(e.x, e.y - 34, e.level >= MAX_LEVEL ? 'MAX LEVEL!' : 'LEVEL ' + e.level, e.level >= 5 ? COL.gold : '#fff', e.big ? 22 : 18, { life: 1.0 });
          if (e.kind === 'remix') fx.floater(e.x, e.y - 58, 'REMIX!', COL.pink, 16);
          if (e.big) { fx.addShake(8); fx.addChroma(0.4); fx.confetti(e.x, e.y, 26); } else fx.addShake(e.level >= 3 ? 2 : 0);
          this.sfx(e.big ? 'merge_big' : 'merge', e.x, { pitch: 1 + (e.level - 2) * 0.06 });
          break;
        }
        case 'sell': fx.floater(e.x, e.y - 20, '+' + e.v, COL.coin, 16); fx.burst(e.x, e.y, COL.coin, 8, { speed: 100 }); this.sfx('sell', e.x); break;
        case 'move': this.sfx('ui_click', e.x); break;
        case 'shot': {
          const def = TURRETS[e.type];
          if (e.type !== 'hat' || (this.t * 60 | 0) % 3 === 0) fx.muzzle(e.x, e.y, e.ang, def.color, e.type === 'kick' || e.type === 'cowbell' ? 1.3 : e.type === 'hat' ? 0.55 : 0.9);
          this.sfx('shoot_' + (e.type === 'vocal' ? 'vocal' : e.type === 'amp' || e.type === 'loop' ? 'snare' : e.type), e.x, { vol: e.type === 'hat' ? 0.4 : 0.8 });
          break;
        }
        case 'hit': {
          hits++;
          if (set.numbers && (e.crit || e.heavy || hits < 5) && !e.dot) {
            fx.floater(e.x, e.y - 8, fmt(e.v), e.crit ? COL.gold : e.shield ? COL.cyan : '#fff', e.crit ? 22 : e.heavy ? 18 : 13, { life: e.crit ? 0.8 : 0.6, vy: -50, crit: e.crit });
          }
          if (e.crit) { fx.sparks(e.x, e.y, [COL.gold, '#fff'], 9, { speed: 330 }); fx.light(e.x, e.y, 60, COL.gold, 0.18, 0.7); fx.ring(e.x, e.y, 34, COL.gold, { life: 0.25, w: 3 }); this.sfx('crit', e.x); }
          else if (hits < 3) fx.sparks(e.x, e.y, ['#fff', '#cfe9ff'], 3, { speed: 200, life: 0.2 });
          else if (hits < 4) this.sfx('hit', e.x, { vol: 0.5 });
          break;
        }
        case 'kill': {
          const def = e.boss ? BOSSES[e.type] : ENEMIES[e.type];
          const col = e.affix === 'golden' ? COL.coin : def.color;
          fx.burst(e.x, e.y, [col, '#fff', '#2fe6ff', '#ff5fb0'], e.boss ? 40 : 10, { speed: e.boss ? 260 : 150, life: e.boss ? 0.9 : 0.5, size: e.boss ? 5 : 3 });
          fx.ring(e.x, e.y, e.boss ? 110 : e.r * 2.4, col, { life: e.boss ? 0.6 : 0.3 });
          fx.light(e.x, e.y, e.boss ? 220 : e.r * 3.4, col, e.boss ? 0.6 : 0.22, e.boss ? 1 : 0.55);
          fx.sparks(e.x, e.y, [col, '#fff'], e.boss ? 22 : 5, { speed: e.boss ? 360 : 230 });
          this.sfx(e.boss ? 'boss_die' : (e.r > 18 ? 'kill_big' : 'kill'), e.x);
          if (e.boss) { fx.addShake(14); fx.addChroma(0.8); fx.doFlash('#fff', 0.6); fx.confetti(e.x, e.y, 40); fx.raysBurst(e.x, e.y, col, 420, 1.1, 18); fx.ring(e.x, e.y, 260, '#fff', { life: 0.8, w: 8 }); fx.pillar(e.x, e.y + 10, col, 360, 0.9); this.bossBar = null; }
          break;
        }
        case 'coin': if (set.numbers) fx.floater(e.x, e.y - 14, '+' + e.v, COL.coin, 13, { life: 0.7, vy: -34 }); if (e.v >= 3) this.sfx('coin', e.x, { vol: 0.5 }); break;
        case 'gem': fx.floater(e.x, e.y - 24, '+1', COL.diamond, 18, { life: 1 }); fx.burst(e.x, e.y, COL.diamond, 10, { speed: 150 }); fx.sparks(e.x, e.y, [COL.diamond, '#fff'], 10, { speed: 300 }); fx.light(e.x, e.y, 70, COL.diamond, 0.4, 0.8); this.sfx('diamond', e.x); break;
        case 'leak': {
          fx.addShake(e.boss ? 16 : 7); fx.addChroma(e.boss ? 0.9 : 0.5); fx.doFlash('#ff2a4a', e.boss ? 0.55 : 0.28); this.hurtFlash = 1;
          fx.ring(this.run.map.base.x, this.run.map.base.y, 130, '#ff4a5e', { life: 0.5, w: 6 }); fx.light(this.run.map.base.x, this.run.map.base.y, 150, '#ff4a5e', 0.4, 0.9);
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
        case 'pulse': fx.ring(e.x, e.y, e.r, e.color, { life: 0.5, w: 7, fill: !!e.bass, chroma: !!e.bass }); fx.light(e.x, e.y, e.r * 1.1, e.color, 0.3, 0.45); if (e.bass) fx.addShake(2); break;
        case 'beam': fx.line(e.x1, e.y1, e.x2, e.y2, e.color, e.w, 0.2); break;
        case 'chain': fx.chain(e.pts, e.color); break;
        case 'cone': fx.cone(e.x, e.y, e.ang, e.range, e.spread, e.color); break;
        case 'explode': fx.ring(e.x, e.y, e.r, e.style === 'kick' ? '#ffb070' : '#ffd0f0', { life: 0.3, fill: true }); fx.burst(e.x, e.y, ['#ffb070', '#fff', '#ffd23c'], e.big ? 20 : 8, { speed: 170 }); fx.sparks(e.x, e.y, ['#ffd23c', '#fff'], e.big ? 14 : 6, { speed: 300 }); fx.light(e.x, e.y, e.r * 2.2, '#ffb070', 0.3, 0.9); fx.addShake(e.big ? 7 : 2); break;
        case 'hero': {
          if (e.who === 'roxor') {
            fx.ring(R.heroR.x, R.heroR.y, 900, COL.green, { life: 0.7, w: 14 }); fx.ring(W / 2, H / 2, 700, '#fff', { life: 0.5, w: 8 }); fx.ring(W / 2, H / 2, 420, COL.green, { life: 0.9, w: 10 }); fx.addChroma(1); fx.raysBurst(W / 2, H / 2, COL.green, 700, 0.8, 20);
            fx.addShake(14); fx.doFlash(COL.green, 0.45); this.sfx('hero_roxor'); this.vibrate(120);
            this.queueBanner('BEATBOX BLAST!', '', COL.green, 1.0, { small: true });
          } else {
            fx.ring(R.heroJ.x, R.heroJ.y, 900, COL.pink, { life: 0.8, w: 14 }); fx.doFlash(COL.pink, 0.4); fx.aurora('#ff5fb0', 2.2); fx.burst(W / 2, 700, [COL.pink, '#fff', '#ffd0f0'], 30, { speed: 220, up: 120, g: -40, life: 1.2, size: 4 }); this.sfx('hero_jasmin');
            this.queueBanner('SIREN SONG', 'Slowed, vulnerable, stage mended', COL.pink, 1.2, { small: true });
          }
          break;
        }
        case 'duet': fx.doFlash('#fff', 0.8); fx.addShake(18); fx.addChroma(1); fx.confetti(W / 2, H / 2, 60); fx.raysBurst(W / 2, H / 2, COL.gold, 760, 1.3, 24); fx.ring(W / 2, H / 2, 600, COL.gold, { life: 0.9, w: 12 }); fx.aurora('#ffc83d', 1.6); this.sfx('duet'); this.queueBanner('DUET FINALE!', '', COL.gold, 1.4, { small: true }); break;
        case 'levelup': fx.light(R.hype.x + 27, R.hype.y + 20, 90, COL.gold, 0.5, 0.9); fx.sparks(R.hype.x + 27, R.hype.y + 20, [COL.gold, '#fff'], 12, { speed: 240 }); this.sfx('levelup'); fx.floater(R.hype.x + 140, R.hype.y + 52, 'LEVEL UP!', COL.gold, 20, { life: 1.1 }); break;
        case 'choice': this.sfx('chest'); if (e.kind === 'chest') this.hint('chest'); break;
        case 'remix': this.sfx('remix_pick'); break;
        case 'relic': this.sfx('relic'); break;
        case 'heal': fx.floater(run.map.base.x, run.map.base.y - 40, '+' + e.n + ' HP', COL.green, 20); fx.pillar(run.map.base.x, run.map.base.y + 10, COL.green, 200, 0.8); fx.burst(run.map.base.x, run.map.base.y, [COL.green, '#fff'], 14, { speed: 120, up: 100, g: -30, life: 1 }); this.sfx('heal'); break;
        case 'jam': fx.burst(e.x, e.y, ['#ff6b6b', '#fff'], 8, { speed: 100 }); this.sfx('jam', e.x); break;
        case 'blink': fx.burst(e.x, e.y, ['#35f0c8', '#ff5fb0'], 8, { speed: 120 }); break;
        case 'drop': fx.doFlash('#7a5cff', 0.4); fx.addShake(10); fx.addChroma(0.6); fx.ring(W / 2, H / 2, 600, '#9b6bff', { life: 0.7, w: 12 }); this.sfx('merge_big'); break;
        case 'reroll': this.sfx('reroll'); break;
        case 'revive': this.queueBanner('SECOND WIND', 'The stage rises again', COL.green, 2); fx.doFlash('#fff', 0.6); this.sfx('heal'); break;
        case 'win': this.sfx('win'); fx.confetti(W / 2, 400, 80); fx.confetti(120, 500, 40); fx.confetti(420, 500, 40); fx.doFlash('#fff', 0.5); fx.raysBurst(W / 2, 420, COL.gold, 700, 1.4, 20); break;
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
    this.setPress(x, y);
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
  pressK(name) { return this.press && this.press.name === name ? Math.max(0, 1 - (this.t - this.press.t) / 0.16) : 0; }
  setPress(x, y) {
    let name = null;
    for (const k of ['pause', 'speed', 'call', 'deploy', 'merge', 'reroll']) if (inR(R[k], x, y)) name = k;
    if (inC(R.heroR, x, y)) name = 'heroR'; else if (inC(R.heroJ, x, y)) name = 'heroJ';
    if (name) this.press = { name, t: this.t };
  }
  draw(ctx, view) {
    const run = this.run, t = this.t, fx = this.fx;
    const world = this.world;
    const beat = Math.pow(1 - this.beatPhase, 3);
    const reduce = !!this.prof.settings.reduce;
    // full-canvas backdrop in device space
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    AW.drawBackdrop(ctx, world.id, view.cw, view.ch, t, { beat: beat * 0.6, staticAmt: clamp(1 - run.stageFrac, 0, 1) * 0.85 });
    // the board layer: shaken, and punched in a touch on big hits
    const [sx, sy] = fx.shakeOffset();
    const z = reduce ? 0 : fx.punch * 0.022, s = view.s * (1 + z);
    ctx.setTransform(view.dpr * s, 0, 0, view.dpr * s, view.dpr * (view.ox + sx - W / 2 * view.s * z), view.dpr * (view.oy + sy - H / 2 * view.s * z));
    this.drawBoard(ctx, t, beat);
    fx.drawWorld(ctx);
    ctx.setTransform(view.dpr * view.s, 0, 0, view.dpr * view.s, view.dpr * view.ox, view.dpr * view.oy);
    fx.drawScreenLight(ctx, W, H);
    fx.drawFloaters(ctx);
    if (!this.paused && !reduce) fx.speedLines(ctx, W, H, this.speed);
    // bloom and chromatic fringe run on the world before the HUD goes on top, so the UI stays crisp
    fx.post(ctx, { stage: 'world', cw: view.cw, ch: view.ch, dpr: view.dpr, beat, reduce });
    ctx.setTransform(view.dpr * view.s, 0, 0, view.dpr * view.s, view.dpr * view.ox, view.dpr * view.oy);
    this.drawHud(ctx, t, beat);
    this.drawBanner(ctx);
    if (this.tut && !this.tut.done) this.drawTutorial(ctx);
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    if (this.hurtFlash > 0) {
      const a = Math.min(0.55, this.hurtFlash * 0.55), g = ctx.createRadialGradient(view.cw / 2, view.ch / 2, Math.min(view.cw, view.ch) * 0.3, view.cw / 2, view.ch / 2, Math.hypot(view.cw, view.ch) * 0.55);
      g.addColorStop(0, 'rgba(255,30,70,0)'); g.addColorStop(1, 'rgba(255,30,70,' + a + ')'); ctx.fillStyle = g; ctx.fillRect(0, 0, view.cw, view.ch);
    }
    fx.post(ctx, { stage: 'grade', cw: view.cw, ch: view.ch, dpr: view.dpr, accent: world.accent, hp: run.stageFrac, beat, reduce });
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    fx.drawFlash(ctx, view.cw, view.ch);
  }
  drawBoard(ctx, t, beat) {
    const run = this.run, fx = this.fx;
    AW.drawBoard(ctx, run.map.id, run.world.id, t, { beat, slotHint: this.slotHint, hoverSlot: this.hoverSlot ? [this.hoverSlot.c, this.hoverSlot.r] : null, dropSlot: this.targetSlot != null ? [this.targetSlot % COLS, Math.floor(this.targetSlot / COLS)] : null });
    AW.drawStageBase(ctx, run.world.id, run.map.base.x, run.map.base.y, { t, hp: run.stageFrac, hit: Math.max(0, this.hurtFlash), beat });
    // selected range: a soft lit disc with a marching dashed edge
    const sel = this.selected ? run.turretById(this.selected) : null;
    if (sel) {
      const rg = run.turretRange(sel), def = TURRETS[sel.type];
      ctx.save();
      const g = ctx.createRadialGradient(sel.x, sel.y, rg * 0.2, sel.x, sel.y, rg); g.addColorStop(0, rgba(def.color, 0.03)); g.addColorStop(0.85, rgba(def.color, 0.11)); g.addColorStop(1, rgba(def.color, 0.26));
      ctx.beginPath(); ctx.arc(sel.x, sel.y, rg, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
      ctx.setLineDash([10, 9]); ctx.lineDashOffset = -t * 24; ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35; ctx.lineWidth = 6; ctx.strokeStyle = def.color; ctx.beginPath(); ctx.arc(sel.x, sel.y, rg, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    const dragT = this.drag && this.drag.moved ? run.turretById(this.drag.id) : null;
    const hintT = dragT || sel;
    // turrets: a lit pad glow under each, brighter on fire, plus the merge invitation
    const ts = run.turrets.slice().sort((a, b) => a.y - b.y);
    for (const tu of ts) {
      const hiddenByDrag = this.drag && this.drag.moved && this.drag.id === tu.id;
      const age = t - (tu.born || 0);
      const def = TURRETS[tu.type];
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, tu.x, tu.y + 6, 40 + tu.level * 2.5, def.color, (0.10 + 0.04 * tu.level / 7 + Math.max(0, tu.fire) * 0.35) * (hiddenByDrag ? 0.3 : 1));
      if (age < 0.5) drawGlow(ctx, tu.x, tu.y, 70 * (1 - age), '#ffffff', (0.5 - age) * 0.9);
      ctx.restore();
      const canMerge = hintT && hintT !== tu && run.canMerge(hintT, tu);
      if (canMerge) {
        const k = 0.5 + 0.5 * Math.sin(t * 8);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, tu.x, tu.y, 56 + k * 6, '#9dff3a', 0.55 + 0.3 * k);
        ctx.globalCompositeOperation = 'source-over'; ctx.beginPath(); ctx.arc(tu.x, tu.y, 40 + k * 3, 0, Math.PI * 2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.5; ctx.globalAlpha = 0.6 + 0.4 * k; ctx.stroke();
        ctx.restore();
      }
      AE.drawTurret(ctx, tu.type, tu.level, tu.x, tu.y, {
        t, ang: tu.ang, fire: Math.max(0, tu.fire), jammed: tu.jam > 0, buff: tu.auraRate > 0 ? 'rate' : tu.auraDmg > 0 ? 'dmg' : null,
        selected: tu.id === this.selected, alpha: hiddenByDrag ? 0.3 : 1, spawn: clamp(age / 0.25, 0, 1),
      });
    }
    // enemies, with a threat glow for bosses and golden elites
    const en = run.enemies.slice().sort((a, b) => (a.flying - b.flying) || (a.y - b.y));
    for (const e of en) {
      if (e.boss) {
        const bc = BOSSES[e.type].color;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, e.x, e.y, e.r * 2.6, e.gated ? '#ffd23c' : bc, 0.34 + 0.12 * Math.sin(t * 5)); ctx.restore();
        AE.drawBoss(ctx, e.type, e.x, e.y, { t, ang: e.ang, hp: e.hp / e.maxHp, hit: e.hitT > 0 ? e.hitT / 0.12 : 0, gated: e.gated, phase: e.phase, scale: e.r / BOSSES[e.type].r });
      } else {
        if (e.affix) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, e.x, e.y, e.r * 2.1, AFFIX_GLOW[e.affix] || '#fff', 0.3 + 0.1 * Math.sin(t * 6 + e.id)); ctx.restore(); }
        const sc = e.r / ENEMIES[e.type].r;
        AE.drawEnemy(ctx, e.type, e.x, e.y, {
          t, ang: e.ang, hp: e.hp / e.maxHp, hit: e.hitT > 0 ? e.hitT / 0.12 : 0, slow: e.slowT > 0 && e.slowAmt > 0, stun: e.stun > 0, burn: e.burnT > 0, mark: e.markT > 0,
          shield: e.shieldMax ? e.shield / e.shieldMax : 0, affix: e.affix, scale: sc, rage: e.rage, id: e.id,
        });
      }
    }
    // projectiles: ribbon trail and a hot glow around each
    for (const p of run.projectiles) {
      if (p.delay > 0) continue;
      const col = PROJ_COL[p.style] || '#fff';
      if (p.style !== 'hat') fx.trail(p.id, p.x, p.y, col, p.big ? 7 : 4.5);
      AE.drawProjectile(ctx, p.style, p.x, p.y, { t, ang: p.ang || 0, scale: p.small ? 0.7 : p.big ? 1.5 : 1 });
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, p.x, p.y, p.big ? 30 : p.small ? 11 : 19, col, 0.55); ctx.restore();
    }
    // dragged turret ghost
    if (this.drag && this.drag.moved) {
      const tu = run.turretById(this.drag.id);
      if (tu) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, this.drag.x, this.drag.y - 20, 62, TURRETS[tu.type].color, 0.5); ctx.restore();
        AE.drawTurret(ctx, tu.type, tu.level, this.drag.x, this.drag.y - 20, { t, ang: tu.ang, scale: 1.15, selected: true, alpha: 0.95 });
      }
    }
    this.panel = null;
    if (sel) this.drawPanel(ctx, sel);
  }
  drawPanel(ctx, tu) {
    const run = this.run, def = TURRETS[tu.type];
    const top = tu.y > BOARD_Y + BOARD_H / 2;
    const box = { x: 16, y: top ? BOARD_Y + 6 : BOARD_Y + BOARD_H - 92, w: 508, h: 86 };
    ctx.save();
    glass(ctx, box.x, box.y, box.w, box.h, 16, { tint: '#1a0f3d', edge: def.color, alpha: 0.9, glow: def.color, glowA: 0.45 });
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, box.x + 40, box.y + 43, 52, def.color, 0.5); ctx.restore();
    AE.drawTurretIconFlat(ctx, tu.type, box.x + 40, box.y + 43, 56);
    text(ctx, def.name, box.x + 80, box.y + 24, 20, '#fff', 'left');
    // level pips
    for (let i = 0; i < MAX_LEVEL; i++) { ctx.beginPath(); ctx.arc(box.x + 80 + 220 + i * 13, box.y + 24, 4.5, 0, Math.PI * 2); ctx.fillStyle = i < tu.level ? (tu.level >= 7 ? COL.gold : def.color) : 'rgba(255,255,255,0.14)'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#0a0420'; ctx.stroke(); }
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
    if (isAttacker) button(ctx, mode, '#3f2b8f', { label: { first: 'First', last: 'Last', strong: 'Strongest', close: 'Closest' }[tu.mode], sub: 'TARGET', size: 15 });
    button(ctx, sell, '#b53a52', { label: '+' + Math.floor(tu.paid * Math.min(0.95, ECON.sellBack + run.mods.sell)), sub: 'SELL', size: 17 });
    this.panel = { box, mode: isAttacker ? mode : { x: -99, y: -99, w: 0, h: 0 }, sell };
    ctx.restore();
  }
  drawHud(ctx, t, beat) {
    const run = this.run;
    const hudA = this.tut && !this.tut.done ? 1 : 1;
    // top and bottom bars: smoked glass fading into the board, with a hairline of stage colour at the seam
    ctx.save();
    const g = ctx.createLinearGradient(0, 0, 0, 120); g.addColorStop(0, 'rgba(8,3,26,0.96)'); g.addColorStop(0.8, 'rgba(8,3,26,0.55)'); g.addColorStop(1, 'rgba(8,3,26,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 120);
    const g2 = ctx.createLinearGradient(0, 836, 0, H); g2.addColorStop(0, 'rgba(8,3,26,0)'); g2.addColorStop(0.25, 'rgba(8,3,26,0.7)'); g2.addColorStop(1, 'rgba(8,3,26,0.98)');
    ctx.fillStyle = g2; ctx.fillRect(0, 836, W, 124);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5;
    const accent = this.world.accent, ln = ctx.createLinearGradient(0, 0, W, 0); ln.addColorStop(0, 'rgba(255,255,255,0)'); ln.addColorStop(0.5, accent); ln.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = ln; ctx.fillRect(0, 117, W, 2); ctx.fillRect(0, 843, W, 2);
    ctx.restore();
    // pause
    button(ctx, R.pause, '#3a2a86', { icon: 'pause', glyph: AE.drawGlyph, press: this.pressK('pause') });
    // stage health: heart socket + liquid bar with a white damage-lag ghost
    const hp = R.hp, f = run.stageFrac;
    if (this.hpLag == null || this.hpLag < f) this.hpLag = f; else this.hpLag += (f - this.hpLag) * 0.06;
    glass(ctx, hp.x, hp.y, hp.w, hp.h, 14, { tint: '#1a0f3d', edge: f < 0.3 ? '#ff4a5e' : '#5b3fd0', glow: f < 0.3 ? '#ff4a5e' : null, glowA: 0.4 + 0.3 * Math.sin(t * 9) });
    const bw = hp.w - 62;
    const hcol = f > 0.5 ? ['#2fd36a', '#9dff7a'] : f > 0.25 ? ['#e8a21c', '#ffe066'] : ['#d4203c', '#ff6a7a'];
    liquidBar(ctx, hp.x + 52, hp.y + 11, bw, 22, f, hcol[0], hcol[1], t, { lag: this.hpLag, glow: 0.35 });
    ctx.save();
    const hs = 1 + (f < 0.3 ? 0.14 * Math.max(0, Math.sin(t * 9)) : 0) + this.hurtFlash * 0.25;
    ctx.translate(hp.x + 26, hp.y + 22); ctx.scale(hs, hs);
    ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, 0, 0, 26, '#ff4a5e', 0.45); ctx.globalCompositeOperation = 'source-over';
    AE.drawGlyph(ctx, 'heart', 0, 0, 30, f < 0.3 && Math.sin(t * 10) > 0 ? '#fff' : COL.red);
    ctx.restore();
    text(ctx, run.stageHp + '/' + run.stageMax, hp.x + 52 + bw / 2, hp.y + 23, 15, '#fff', 'center');
    // wave
    const w = R.wave;
    glass(ctx, w.x, w.y, w.w, w.h, 14, { tint: '#1a0f3d', edge: '#5b3fd0' });
    text(ctx, run.endless ? 'WAVE ' + Math.max(1, run.wave) : 'WAVE ' + Math.max(1, run.wave) + '/' + run.wavesTotal, w.x + w.w / 2, w.y + 16, 19, '#fff', 'center');
    if (run.wmId) { const m = WAVE_MODS[run.wmId]; text(ctx, m.name, w.x + w.w / 2, w.y + 37, 14, m.good ? COL.green : COL.orange, 'center'); }
    else if (run.phase === 'prep' && (run.endless || run.wave < run.wavesTotal)) {
      const spec = run.upcoming();
      const types = [...new Set(spec.groups.map((gr) => gr.type))].slice(0, 3);
      const n = types.length + (spec.boss ? 1 : 0) + (spec.mod ? 1 : 0);
      let x = w.x + w.w / 2 - (n - 1) * 13;
      text(ctx, 'NEXT', w.x + 12, w.y + 37, 10, COL.dim, 'left');
      for (const ty of types) { AE.drawEnemy(ctx, ty, x + 8, w.y + 36, { t, scale: 0.62, hp: 1 }); x += 26; }
      if (spec.boss) { AE.drawGlyph(ctx, 'crown', x + 8, w.y + 36, 22, '#ff4a5e'); x += 26; }
      if (spec.mod) AE.drawGlyph(ctx, WAVE_MODS[spec.mod].glyph, x + 8, w.y + 36, 20, WAVE_MODS[spec.mod].good ? COL.green : COL.orange);
    } else text(ctx, run.world.name, w.x + w.w / 2, w.y + 37, 13, COL.dim, 'center');
    // coins: the number pops when it changes
    const c = R.coins;
    if (this._coinLast == null) this._coinLast = run.coins;
    if (run.coins !== this._coinLast) { this.coinPop = run.coins > this._coinLast ? 1 : 0.5; this._coinLast = run.coins; }
    this.coinPop = Math.max(0, (this.coinPop || 0) - 0.06);
    glass(ctx, c.x, c.y, c.w, c.h, 14, { tint: '#1a0f3d', edge: '#c9a21c' });
    ctx.save(); ctx.translate(c.x + 24, c.y + 22); const cs = 1 + this.coinPop * 0.25; ctx.scale(cs, cs);
    ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, 0, 0, 24, '#ffd44d', 0.3 + this.coinPop * 0.4); ctx.globalCompositeOperation = 'source-over';
    AE.drawGlyph(ctx, 'coin', 0, 0, 30); ctx.restore();
    ctx.save(); ctx.translate(c.x + 46, c.y + 23); const ts2 = 1 + this.coinPop * 0.18; ctx.scale(ts2, ts2); text(ctx, fmt(run.coins), 0, 0, 24, COL.coin, 'left', 900, this.coinPop > 0.3 ? { glow: '#ffd44d', blur: 10 } : null); ctx.restore();
    // hype
    const h = R.hype;
    const hf = clamp(run.hype / run.hypeNeed, 0, 1);
    glass(ctx, h.x, h.y, h.w, h.h, 14, { tint: '#1a0f3d', edge: hf > 0.85 ? '#ffc83d' : '#5b3fd0', glow: hf > 0.85 ? '#ffc83d' : null, glowA: 0.4 + 0.3 * Math.sin(t * 8) });
    liquidBar(ctx, h.x + 58, h.y + 10, h.w - 66, 20, hf, '#ff5fb0', '#ffc83d', t, { glow: hf > 0.85 ? 0.8 : 0.3 });
    bezel(ctx, h.x + 27, h.y + 20, 17, '#ffc83d');
    text(ctx, run.level + '', h.x + 27, h.y + 21, 16, COL.gold, 'center');
    text(ctx, 'HYPE', h.x + 58 + (h.w - 66) / 2, h.y + 20, 12, '#fff', 'center');
    // combo
    if (this.comboShow > 0.01) {
      ctx.save(); ctx.globalAlpha = this.comboShow;
      const big = run.combo >= 25, cs2 = 1 + Math.max(0, 1 - (t - (this.comboT || 0)) * 6) * 0.25;
      ctx.translate(R.hype.x + 10, R.hype.y + 56); ctx.scale(cs2, cs2);
      text(ctx, run.combo + ' COMBO', 0, 0, big ? 18 : 15, big ? COL.gold : COL.cyan, 'left', 900, big ? { glow: COL.gold, blur: 12 } : null);
      ctx.restore();
    }
    if (run.combo !== this._comboLast) { this._comboLast = run.combo; this.comboT = t; }
    // speed
    button(ctx, R.speed, '#3a2a86', { label: this.speed + 'x', sub: 'SPEED', size: 20, press: this.pressK('speed') });
    // call wave
    const call = R.call;
    const prep = run.phase === 'prep', canCall = prep || (run.phase === 'wave' && !run.spawnQ.length);
    const left = prep ? Math.max(0, Math.ceil(run.prepT)) : 0;
    const lastWave = !run.endless && run.wave >= run.wavesTotal;
    const cp = this.pressK('call');
    if (lastWave && run.phase !== 'prep') button(ctx, call, '#5a3aa8', { label: 'FINAL WAVE', size: 17, press: cp, glow: 0.4 + 0.3 * Math.sin(t * 6), glowColor: '#ff5fb0' });
    else if (prep) button(ctx, call, '#2fa84a', { label: run.wave === 0 ? 'START WAVE 1' : 'NEXT WAVE', sub: run.prepT > 100 ? 'tap to begin' : left + 's  +' + Math.round(Math.min(ECON.prepSeconds, run.prepT) * ECON.earlyBonusPerSec) + ' coins', size: 17, press: cp, shine: (t * 0.5) % 1, glow: 0.25 + 0.25 * Math.sin(t * 6), glowColor: '#9dff7a' });
    else if (canCall) button(ctx, call, '#2a74b8', { label: 'CALL NEXT', sub: 'bonus coins', size: 17, press: cp, shine: (t * 0.35) % 1 });
    else button(ctx, call, '#33266e', { label: run.enemies.length + ' left', sub: 'fighting', size: 17, dim: true, press: cp });
    // boss bar: a nameplate over a segmented fluid bar with a lag ghost
    const boss = run.enemies.find((e) => e.boss);
    if (boss) {
      const bx = 52, by = 112, bw = 436, bf = clamp(boss.hp / boss.maxHp, 0, 1);
      if (this.bossLag == null || this.bossLag < bf) this.bossLag = bf; else this.bossLag += (bf - this.bossLag) * 0.05;
      glass(ctx, bx - 8, by - 6, bw + 16, 30, 12, { tint: '#2a0a1c', edge: '#ff4a5e', alpha: 0.9, glow: '#ff4a5e', glowA: 0.25 });
      liquidBar(ctx, bx, by, bw, 18, bf, boss.gated ? '#e0a21c' : '#c4182f', boss.gated ? '#ffe066' : '#ff6a5a', t, { lag: this.bossLag, ticks: boss.type === 'playback' ? [0.33, 0.66] : null, glow: 0.4 });
      text(ctx, BOSSES[boss.type].name.toUpperCase(), W / 2, by + 10, 13, '#fff', 'center');
    } else this.bossLag = null;
    // bottom bar: heroes, merge, deploy, reroll
    this.drawHero(ctx, 'roxor', R.heroR, t);
    this.drawHero(ctx, 'jasmin', R.heroJ, t);
    const locked = !this.prof.autoMerge;
    button(ctx, R.merge, locked ? '#2f2150' : '#2a8a5a', { icon: locked ? 'lock' : 'merge', glyph: AE.drawGlyph, sub: 'MERGE', size: 13, press: this.pressK('merge'), dim: locked });
    button(ctx, R.reroll, '#3a2a86', { icon: 'reroll', glyph: AE.drawGlyph, sub: run.rerolls > 0 ? run.rerolls + ' free' : '3 gems', size: 13, press: this.pressK('reroll') });
    this.drawDeploy(ctx, t, beat);
    const slotsLeft = run.slotCapacity() - run.turrets.length;
    text(ctx, run.turrets.length + '/' + run.slotCapacity() + ' tiles', W / 2, 833, 13, slotsLeft < 3 ? COL.orange : COL.dim, 'center');
  }
  drawDeploy(ctx, t, beat) {
    const run = this.run, d = R.deploy;
    const cost = run.deployCost(false), can = run.coins >= cost && run.canDeploy().ok;
    const ph = this.beatPhase, nextDef = TURRETS[run.nextType];
    const near = this.prof.settings.beat && Math.min(ph, 1 - ph) * (60 / run.bpm) <= ECON.beatWindow;
    const pk = this.pressK('deploy');
    const sc = 1 + 0.035 * beat + Math.max(0, this.deployPulse) * 0.06 - pk * 0.04;
    ctx.save();
    ctx.translate(d.x + d.w / 2, d.y + d.h / 2); ctx.scale(sc, sc); ctx.translate(-(d.x + d.w / 2), -(d.y + d.h / 2));
    // the beat halo: a ring that closes in on the button and lights it up when the beat lands
    if (this.prof.settings.beat) {
      const grow = 1 + (1 - ph) * 0.2;
      ctx.save(); ctx.translate(d.x + d.w / 2, d.y + d.h / 2); ctx.globalCompositeOperation = 'lighter';
      rrect(ctx, -d.w / 2 * grow, -d.h / 2 * grow, d.w * grow, d.h * grow, 28);
      ctx.strokeStyle = near ? '#ffffff' : '#2fe6ff'; ctx.lineWidth = near ? 6 : 3; ctx.globalAlpha = near ? 1 : 0.2 + 0.55 * ph; ctx.stroke();
      if (near) { rrect(ctx, -d.w / 2 - 6, -d.h / 2 - 6, d.w + 12, d.h + 12, 28); ctx.lineWidth = 12; ctx.globalAlpha = 0.35; ctx.strokeStyle = '#2fe6ff'; ctx.stroke(); }
      ctx.restore();
    }
    button(ctx, d, can ? '#e63c9a' : '#4a3a7a', { radius: 22, press: pk, shine: can ? (t * 0.45) % 1 : null, glow: can ? 0.2 + 0.2 * beat : 0, glowColor: '#ff9ad6', dim: !can && false });
    // equalizer in the corner, dancing to the beat
    ctx.save(); ctx.globalAlpha = can ? 0.55 : 0.25;
    for (let i = 0; i < 5; i++) { const hh = 6 + 12 * (0.5 + 0.5 * Math.sin(t * (5 + i * 1.3) + i)) * (0.5 + beat * 0.7); ctx.fillStyle = '#fff'; rrect(ctx, d.x + d.w - 38 + i * 6, d.y + 28 - hh, 4, hh, 2); ctx.fill(); }
    ctx.restore();
    // socket with the next turret, lit in its own colour
    ctx.beginPath(); ctx.arc(d.x + 44, d.y + d.h / 2 - 4, 31, 0, Math.PI * 2); ctx.fillStyle = 'rgba(14,5,38,0.85)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#0a0420'; ctx.stroke();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, d.x + 44, d.y + d.h / 2 - 4, 40, nextDef.color, 0.55); ctx.restore();
    AE.drawTurretIconFlat(ctx, run.nextType, d.x + 44, d.y + d.h / 2 - 4, 54);
    text(ctx, 'DROP', d.x + 90, d.y + 28, 27, '#fff', 'left', 900, can ? { glow: '#ff9ad6', blur: 8 } : null);
    text(ctx, nextDef.name, d.x + 90, d.y + 50, 13, 'rgba(255,255,255,0.9)', 'left');
    if (run.mods.freeDeploys > 0) text(ctx, 'FREE x' + run.mods.freeDeploys, d.x + 90, d.y + 71, 17, COL.green, 'left');
    else { AE.drawGlyph(ctx, 'coin', d.x + 100, d.y + 70, 20); text(ctx, fmt(cost), d.x + 114, d.y + 71, 20, can ? COL.coin : '#ff9a9a', 'left'); }
    if (this.targetSlot != null) text(ctx, 'to chosen tile', d.x + d.w - 10, d.y + 71, 12, COL.cyan, 'right');
    ctx.restore();
  }
  drawHero(ctx, who, c, t) {
    const run = this.run, name = who === 'roxor' ? 'heroR' : 'heroJ';
    const ready = run.heroReady(who), max = run.heroMax(who), cd = run.heroCd[who];
    const col = who === 'roxor' ? COL.green : COL.pink;
    this._ready = this._ready || {};
    if (ready && this._ready[who] === false) this.readyFlash = Object.assign(this.readyFlash || {}, { [who]: t });
    this._ready[who] = ready;
    const rf = this.readyFlash && this.readyFlash[who] != null ? Math.max(0, 1 - (t - this.readyFlash[who]) * 2.2) : 0;
    const pk = this.pressK(name), pulse = ready ? 0.5 + 0.5 * Math.sin(t * 6) : 0;
    ctx.save();
    const sc = 1 - pk * 0.06 + rf * 0.08;
    ctx.translate(c.x, c.y); ctx.scale(sc, sc); ctx.translate(-c.x, -c.y);
    if (ready) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, c.x, c.y, c.r * (1.7 + pulse * 0.25), col, 0.45 + pulse * 0.25 + rf * 0.4); ctx.restore(); }
    bezel(ctx, c.x, c.y, c.r, ready ? col : '#6a5ba8');
    ctx.save(); ctx.beginPath(); ctx.arc(c.x, c.y, c.r - 6, 0, Math.PI * 2); ctx.clip();
    const bg = ctx.createRadialGradient(c.x, c.y - 10, 4, c.x, c.y, c.r); bg.addColorStop(0, ready ? rgba(col, 0.45) : 'rgba(80,60,140,0.4)'); bg.addColorStop(1, 'rgba(14,6,40,0.95)');
    ctx.fillStyle = bg; ctx.fillRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);
    ctx.globalAlpha = ready ? 1 : 0.5;
    AW.drawBust(ctx, who, c.x, c.y + 8, c.r * 2.1, { t, outfit: this.prof.outfits.worn[who], pose: ready ? 'hype' : 'idle' });
    ctx.globalAlpha = 1;
    if (!ready) {
      const a0 = -Math.PI / 2, a1 = a0 + Math.PI * 2 * (cd / max);
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.arc(c.x, c.y, c.r, a0, a1, false); ctx.closePath(); ctx.fillStyle = 'rgba(8,4,24,0.7)'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + Math.cos(a1) * c.r, c.y + Math.sin(a1) * c.r); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.stroke();
    } else {   // light sweep across the portrait
      ctx.globalCompositeOperation = 'lighter'; const sx = c.x - c.r + ((t * 0.7) % 1.6) * c.r * 2.4 - c.r * 0.4; const g = ctx.createLinearGradient(sx - 14, 0, sx + 14, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);
    }
    ctx.restore();
    if (!ready) text(ctx, Math.ceil(cd) + '', c.x, c.y, 26, '#fff', 'center');
    if (ready) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 + pulse * 0.4; ctx.lineWidth = 4; ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(c.x, c.y, c.r + 3 + pulse * 3, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    ctx.restore();
    const lab = who === 'roxor' ? 'BLAST' : 'SONG';
    text(ctx, ready ? lab : lab[0] + lab.slice(1).toLowerCase(), c.x, c.y + c.r + 12, 12, ready ? col : COL.dim, 'center');
  }
  drawBanner(ctx) {
    const b = this.banner; if (!b) return;
    const inK = clamp(b.t / 0.28, 0, 1), outK = clamp((b.life - b.t) / 0.3, 0, 1);
    const a = Math.min(inK, outK), k = b.t / b.life;
    const y = b.small ? 300 : 380;
    const sc = 0.6 + 0.4 * easeOutBack(inK) + (b.boss ? Math.sin(b.t * 30) * 0.004 * (1 - k) : 0);
    ctx.save();
    ctx.globalAlpha = a; ctx.translate(W / 2, y); ctx.scale(sc, sc);
    if (!b.small) {
      const bh = b.sub ? 112 : 80;
      glass(ctx, -250, -52, 500, bh, 22, { tint: b.boss ? '#3a0a1e' : '#150a38', edge: b.color, alpha: 0.9, glow: b.color, glowA: 0.55 });
      // light sweep + side streaks
      ctx.save(); rrect(ctx, -250, -52, 500, bh, 22); ctx.clip(); ctx.globalCompositeOperation = 'lighter';
      const sx = -300 + 640 * clamp(b.t / 0.7, 0, 1), g = ctx.createLinearGradient(sx - 40, 0, sx + 40, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(sx - 40, -52, 80, bh);
      if (b.boss) { ctx.globalAlpha = a * 0.25; ctx.fillStyle = '#ff2a4a'; for (let i = -6; i < 8; i++) { ctx.beginPath(); ctx.moveTo(-250 + i * 70 + (b.t * 40) % 70, -52); ctx.lineTo(-250 + i * 70 + 30 + (b.t * 40) % 70, -52); ctx.lineTo(-250 + i * 70 + 10 + (b.t * 40) % 70, -44); ctx.lineTo(-250 + i * 70 - 20 + (b.t * 40) % 70, -44); ctx.closePath(); ctx.fill(); } }
      ctx.restore();
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * 0.5 * (1 - k);
      const wid = 260 * easeOutBack(inK), sg = ctx.createLinearGradient(-wid, 0, wid, 0); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, b.color); sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg; ctx.fillRect(-wid, -2, wid * 2, 4); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a;
    }
    text(ctx, b.text, 0, b.small ? 0 : -14, b.small ? 38 : (b.text.length > 20 ? 28 : 40), b.color, 'center', 900, { glow: b.color, blur: b.small ? 22 : 12 });
    if (b.sub && !b.small) wrapText(ctx, b.sub, 0, 28, 460, 16, 20, '#efe7ff', 'center');
    else if (b.sub) text(ctx, b.sub, 0, 36, 16, '#fff', 'center');
    ctx.restore();
  }
  drawTutorial(ctx) {
    const spot = this.tutSpot();
    const s = TUTORIAL[this.tut.i];
    if (!s) return;
    ctx.save();
    if (spot && !s.free) {
      ctx.fillStyle = 'rgba(6,2,20,0.74)';
      ctx.beginPath(); ctx.rect(0, 0, W, H);
      if (spot.round) { ctx.moveTo(spot.x + spot.w / 2 + spot.w / 2, spot.y + spot.h / 2); ctx.arc(spot.x + spot.w / 2, spot.y + spot.h / 2, spot.w / 2, 0, Math.PI * 2, true); }
      else rrectPath(ctx, spot.x, spot.y, spot.w, spot.h, 16, true);
      ctx.fill('evenodd');
    } else if (!s.free) { ctx.fillStyle = 'rgba(6,2,20,0.58)'; ctx.fillRect(0, 0, W, H); }
    if (spot) {
      const k = 0.5 + 0.5 * Math.sin(this.t * 6);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = '#2fe6ff'; ctx.lineWidth = 8 + k * 4; ctx.globalAlpha = 0.25 + 0.25 * k;
      if (spot.round) { ctx.beginPath(); ctx.arc(spot.x + spot.w / 2, spot.y + spot.h / 2, spot.w / 2 + 2, 0, Math.PI * 2); ctx.stroke(); } else { rrect(ctx, spot.x, spot.y, spot.w, spot.h, 16); ctx.stroke(); }
      ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3 + k * 1.5; ctx.globalAlpha = 0.7 + 0.3 * k;
      if (spot.round) { ctx.beginPath(); ctx.arc(spot.x + spot.w / 2, spot.y + spot.h / 2, spot.w / 2 + 2, 0, Math.PI * 2); ctx.stroke(); } else { rrect(ctx, spot.x, spot.y, spot.w, spot.h, 16); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    // Loopy and a warm speech bubble with a tail, floating a little
    const atTop = spot && spot.y > 400 ? true : (spot ? spot.y < 400 ? false : true : false);
    const bob = Math.sin(this.t * 2.2) * 3;
    const by = (atTop ? 140 : 560) + bob, bw = 470, bh = 150, bx = 60;
    rrect(ctx, bx - 30, by + 6, bw, bh, 22); ctx.fillStyle = 'rgba(4,0,16,0.4)'; ctx.fill();
    rrect(ctx, bx - 30, by, bw, bh, 22);
    const bg = ctx.createLinearGradient(0, by, 0, by + bh); bg.addColorStop(0, '#fffaf0'); bg.addColorStop(1, '#f4e6cf'); ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#12082b'; ctx.stroke();
    rrect(ctx, bx - 26, by + 4, bw - 8, bh - 8, 19); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx - 14, by + bh - 4); ctx.lineTo(bx - 34, by + bh + 26); ctx.lineTo(bx + 18, by + bh - 4); ctx.closePath(); ctx.fillStyle = '#f4e6cf'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#12082b'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx - 12, by + bh - 6); ctx.lineTo(bx + 16, by + bh - 6); ctx.lineTo(bx - 8, by + bh - 1); ctx.closePath(); ctx.fillStyle = '#f4e6cf'; ctx.fill();
    ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, 50, by + bh - 20, 60, '#2fe6ff', 0.25); ctx.globalCompositeOperation = 'source-over';
    AW.drawLoopy(ctx, 50, by + bh - 20, 78, { t: this.t, mood: 'happy', talk: this.tut.t < 2.5 });
    wrapText(ctx, this.tutBubble ? this.tutBubble.text : '', bx + 70, by + 32, bw - 100, 20, 24, '#241140', 'left');
    if (s.wait === 'tap') { const k2 = 0.5 + 0.5 * Math.sin(this.t * 5); ctx.globalAlpha = 0.6 + 0.4 * k2; text(ctx, 'tap to continue', bx - 30 + bw - 20, by + bh - 16, 14, '#7a5cff', 'right'); }
    ctx.restore();
  }
}

const easeOutBack = (k) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
const AFFIX_GLOW = { golden: '#ffd44d', swift: '#6dffd8', armored: '#9aa4c8', regen: '#8fffa0', giant: '#ff8a3c' };
const PROJ_COL = { kick: '#ffb070', snare: '#ffe27a', hat: '#9dffe0', scratch: '#ffffff', cowbell: '#ffd27a', vocal: '#ffd0f0', orb: '#ffd0f0' };
export { rrectPath, rrect, text, wrapText, button };
