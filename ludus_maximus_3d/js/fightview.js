// FightView: binds the sim (core/arena.js fight object F) to the 3D world: rigs, FX, feel, director, audio, HUD.
// Frame order (see .claude/skills/ludus3d-vfx-gamefeel): feel.update(real) -> sim.step(scaled) -> events -> actors -> fx.update -> camera -> render.
import * as THREE from 'three';
import { createSky, createLightRig, applyTOD, TOD } from './sky.js';
import { createArena } from './env_arena.js';
import { createDustMotes, createGodRays } from './envfx.js';
import { createFx } from './fx.js';
import { createFeel } from './feel.js';
import { FightDirector } from './director.js';
import { createGladiator } from './gladiator.js';
import * as U from './ui_kit.js';

const D = () => globalThis.LM_D, L = () => globalThis.LM;
const STEP = 1 / 30;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const VOICE = { murmillo: 0, hoplomachus: 1, retiarius: 2, dimachaerus: 1, thraex: 3 };
const ULT_EL = { pulverize: 'earth', hookshot: 'earth', bladedance: 'wind', skewer: 'wind', tornado: 'wind', unbreakable: 'holy', bloodrage: 'fire', meteor: 'fire', duststorm: 'wind' };
const COLOR_EL = (c) => { c = (c || '').toLowerCase(); if (/e8742a|d2412b|e0742a|f6b82d/.test(c)) return 'fire'; if (/3f7fd6|2f78c4|a8d8ff/.test(c)) return 'lightning'; if (/c98a52|b8892a/.test(c)) return 'earth'; return 'holy'; };
const STATUS_FX = new Set(['stun', 'slow', 'bleed', 'blind', 'taunt', 'root', 'burn']);
const STATUS_LABEL = { stun: 'STUNNED', slow: 'SLOWED', bleed: 'BLEEDING', blind: 'BLINDED', taunt: 'TAUNT', netted: 'NETTED', guard: 'GUARD', frenzy: 'FRENZY', rage: 'RAGE', rally: 'RALLY', root: 'ROOTED', air: 'KNOCKED UP', spin: 'WHIRLING' };

export class FightView {
  constructor({ renderer, post, camera, audio, host, tier = 'high' }) {
    this.renderer = renderer; this.post = post; this.camera = camera; this.audio = audio; this.host = host; this.tier = tier;
    this.scene = new THREE.Scene(); post.setScene && post.setScene(this.scene);
    this.sky = createSky(); this.scene.add(this.sky.mesh);
    this.light = createLightRig(this.scene, { shadowSize: tier === 'low' ? 1024 : tier === 'medium' ? 1536 : 2048, shadowRadius: 34, shadowCenter: new THREE.Vector3(0, 0, 0), far: 300 });
    this.arena = createArena({ density: tier === 'low' ? 0.45 : tier === 'medium' ? 0.7 : 1, decalRes: tier === 'low' ? 1024 : 2048 });
    this.scene.add(this.arena.group);
    this.preset = Object.assign({}, TOD.golden, { sunElev: 46, sunAz: 205 });
    applyTOD(this.preset, { rig: this.light, scene: this.scene, sky: this.sky, renderer, nightUniforms: [{ set value(v) { this._a && this._a(v); } }] });
    this.arena.setNight(this.preset.night || 0);
    const sd = this.light.sunDir, rays = [];
    for (let i = 0; i < 14; i++) { const th = (i / 14) * Math.PI * 2 + 0.2; const p = this.arena.ring(9 + (i % 3) * 2, th); rays.push({ x: p[0], y: 19.5, z: p[1], w: 2.2 + (i % 4) * 0.5, len: 26 }); }
    this.godrays = createGodRays(rays, sd, { color: new THREE.Color(this.preset.sunColor).getHex(), intensity: 0.12 * (1 - (this.preset.night || 0)) });
    this.scene.add(this.godrays.mesh);
    this.dust = createDustMotes({ count: tier === 'low' ? 160 : 380, min: new THREE.Vector3(-28, 0.4, -20), max: new THREE.Vector3(28, 16, 20), size: 3, intensity: 1.1 });
    this.scene.add(this.dust.points);
    this.fx = createFx(this.scene, { arenaRadius: 24, groundY: 0, sand: this.arena, quality: tier === 'low' ? 0.5 : tier === 'medium' ? 0.75 : 1, decalSize: 1024 });
    this.feel = createFeel({ overlay: true, fov: camera.fov });
    this.dir = new FightDirector({ aspect: camera.aspect, radius: 13.2, gateAngle: 0 });
    this.t = 0; this.F = null; this.fm = new Map(); this.sim = 0; this.acc = 0; this.userSpeed = 1; this.phase = 'idle';
    this.buildHud();
  }

  // ---------------------------------------------------------------- HUD
  buildHud() {
    const root = this.hud = document.createElement('div'); root.className = 'fv-hud'; root.style.cssText = 'position:absolute;inset:0;pointer-events:none;display:none';
    this.plates = document.createElement('div'); this.plates.className = 'lx-plates';
    this.banners = document.createElement('div'); this.banners.className = 'lx-banners';
    this.hudBox = document.createElement('div'); this.hudBox.className = 'lx-hud';
    const top = document.createElement('div'); top.className = 'lx-hud-top';
    this.speedBtn = U.button({ label: 'x1', variant: 'bronze', onClick: () => { this.userSpeed = this.userSpeed === 1 ? 2 : this.userSpeed === 2 ? 4 : 1; this.speedBtn.querySelector('span') ? 0 : 0; this.speedBtn.textContent = 'x' + this.userSpeed; this.feel.setUserScale && this.feel.setUserScale(1); } });
    this.skipBtn = U.button({ label: 'Skip', variant: 'ghost', onClick: () => { this.skip = true; } });
    const row = document.createElement('div'); row.className = 'lx-row'; row.append(this.speedBtn, this.skipBtn);
    this.topInfo = document.createElement('div'); this.topInfo.className = 'lx-row';
    top.append(this.topInfo, row);
    this.ultBar = document.createElement('div'); this.ultBar.className = 'lx-hud-ults';
    const mid = document.createElement('div'); mid.style.cssText = 'flex:1;pointer-events:none';
    this.hudBox.append(top, mid, this.ultBar);
    root.append(this.plates, this.hudBox, this.banners);
    this.host.append(root);
  }

  // ---------------------------------------------------------------- fight lifecycle
  /** F: fight from core/arena.js createFight. opts: {league, intro:true, quiet}. Resolves with {winner, F} after the outro. */
  start(F, opts = {}) {
    this.dispose();
    this.F = F; this.opts = opts; this.done = false; this.phase = 'intro'; this.phaseT = 0; this.skip = false; this.acc = 0; this.evSeen = 0; this.lastHitT = -9; this.recent = 0; this.intensity = 0.2; this.intTimer = 0;
    this.hud.style.display = 'block'; this.fx.reset && this.fx.reset(); this.arena.setGate(0); this.arena.setHype(0.3); this.feel.reset && this.feel.reset();
    const nA = F.units.filter((u) => u.side === 'A').length, nB = F.units.length - nA;
    F.units.forEach((u) => {
      const rig = createGladiator(u, { tunic: u.side === 'B' ? (u.g.color || null) : (u.g.color || null) });
      const gx = u.side === 'A' ? -22 : 22;
      const f = { u, rig, vx: 0, vz: 0, yaw: u.side === 'A' ? Math.PI / 2 : -Math.PI / 2, lx: gx, ly: u.y, handles: {}, atkN: 0, st: '', hpShown: u.hp, plate: null, ring: [], intro: { x: gx, y: u.y, tx: u.x, ty: u.y } };
      rig.root.position.set(gx, 0, u.y); this.scene.add(rig.root); rig.resetSecondary && rig.resetSecondary();
      const plate = U.nameplate({ name: u.name, level: u.g.lvl, hp: u.hp, maxHp: u.maxhp, team: u.side === 'A' ? 'ally' : 'foe', rank: 0 });
      this.plates.append(plate); f.plate = plate; this.fm.set(u.id, f);
    });
    // ultimates (player side)
    const mine = F.units.filter((u) => u.side === 'A'); let hk = 0;
    mine.forEach((u) => u.ults.forEach((slot, k) => {
      const col = D().ULTS[slot.id].c; const ring = U.cooldownRing({ ult: slot.id, color: col, size: innerWidth < 700 ? 72 : 84, hotkey: ['Q', 'W', 'E', 'R', 'T', 'Y'][hk++], onCast: () => this.cast(u, k) });
      this.ultBar.append(ring); this.fm.get(u.id).ring.push({ ring, slot });
    }));
    this.dir.setAspect(this.camera.aspect);
    this.dir.setShot('establishing', { dur: 3.2 }, 0); this.gateOpen = false;
    this.audio.music.setMode('arena', { fade: 1.2 }); this.audio.music.setIntensity(0.15); this.audio.crowd(0.3);
    this.audio.sfx('gate'); this.audio.sfx('horn');
    this.promise = new Promise((res) => { this.resolve = res; });
    return this.promise;
  }

  cast(u, k) {
    const r = L().useUlt(this.F, u.id, k);
    if (r === 'range') this.banner('Out of range', 'info');
    else if (!r) this.audio.sfx('uiError');
    return r;
  }

  banner(text, kind = 'info') { U.banner(text, kind, this.banners, 1700); }

  dispose() {
    for (const f of this.fm.values()) { this.scene.remove(f.rig.root); f.rig.dispose && f.rig.dispose(); f.plate && f.plate.remove(); f.ring.forEach((r) => r.ring.remove()); }
    this.fm.clear(); if (this.ultBar) this.ultBar.innerHTML = '';
    if (this.fx && this.fx.clearDecals) this.fx.clearDecals();
  }

  resize(w, h) { this.dir.setAspect(w / h); }

  // ---------------------------------------------------------------- per frame
  frame(realDt, t) {
    this.t = t; realDt = Math.min(realDt, 0.1);
    this.sky.update(this.camera, t); this.arena.update(t, realDt); this.godrays.update(t); this.dust.update(t, this.renderer.getPixelRatio());
    const ft = this.feel.update(realDt);
    if (!this.F) { this.camera.updateMatrixWorld(); this.fx.update(ft.dt, this.camera); return; }
    const F = this.F, speedUp = this.skip ? 8 : this.userSpeed;
    this.phaseT += realDt;
    // director first so timeScale (slow-mo cues) applies to this frame's sim
    const units = F.units.map((u) => { const f = this.fm.get(u.id); return { id: u.id, x: f.rx ?? u.x, y: f.ry ?? u.y, vx: f.vx, vy: f.vz, team: u.side === 'A' ? 0 : 1, alive: !u.down }; });
    const pose = this.dir.update(realDt, units);
    let dt = ft.dt * (this.phase === 'fight' ? pose.timeScale : 1);

    if (this.phase === 'intro') this.introStep(realDt, dt);
    else if (this.phase === 'fight') {
      this.acc += dt * speedUp; let n = 0;
      while (this.acc >= STEP && !F.done && n++ < 10 * speedUp) { L().step(F, STEP); this.acc -= STEP; this.consume(); }
      if (F.done && this.phase === 'fight') this.endFight();
      this.syncFighters(dt, true);
    } else { this.syncFighters(dt, false); }
    if (this.phase === 'outro') { this.outroT += realDt; if (this.outroT > 4.5 && !this.done) { this.done = true; this.resolve && this.resolve({ winner: F.winner, F }); } }

    this.fx.update(dt, this.camera);
    this.applyCamera(pose);
    this.updateHud(realDt, F);
    this.updateAudio(realDt, F);
  }

  introStep(realDt, dt) {
    const F = this.F; const k = clamp(this.phaseT / 4.2, 0, 1); const e = k * k * (3 - 2 * k);
    if (this.phaseT > 2.0 && !this.gateOpen) { this.gateOpen = true; this.arena.setGate(1, 0); this.arena.setGate(1, 1); }
    if (this.phaseT > 2.9 && this.dir.pose.shot === 'establishing') this.dir.setShot('gate', { gateAngle: 0, dur: 1.6 }, 0.5);
    for (const f of this.fm.values()) {
      const u = f.u; const x = f.intro.x + (f.intro.tx - f.intro.x) * e; f.rx = x; f.ry = u.y;
      const speed = (f.intro.tx - f.intro.x) * (6 * k * (1 - k)) / 4.2;
      f.vx = speed; f.vz = 0; f.yaw = u.side === 'A' ? Math.PI / 2 : -Math.PI / 2;
      const fwd = Math.abs(speed); f.rig.animator.setMove(fwd, 0); f.rig.root.position.set(x, 0, u.y); f.rig.root.rotation.y = f.yaw; f.rig.update(dt);
    }
    if (k >= 1) { this.phase = 'fight'; this.phaseT = 0; this.dir.setShot('follow', {}, 1.0); this.banner('FIGHT!', 'ult'); this.audio.sfx('drum'); this.feel.impact && this.feel.impact('roar', {}); for (const f of this.fm.values()) { f.rx = f.u.x; f.ry = f.u.y; } }
  }

  endFight() {
    const F = this.F; this.phase = 'outro'; this.outroT = 0;
    const win = F.winner;
    for (const f of this.fm.values()) { if (!f.u.down && f.u.side === win) f.rig.animator.setState('victory'); }
    const alive = F.units.filter((u) => u.side === win && !u.down)[0];
    const lastDown = F.units.filter((u) => u.down && u.side !== win).pop();
    this.dir.cue('kill', { victim: lastDown && lastDown.id, killer: alive && alive.id, next: { name: 'victory' } });
    this.audio.music.setMode(win === 'A' ? 'victory' : 'defeat'); this.audio.sfx(win === 'A' ? 'levelUp' : 'deathThud'); this.audio.sfx(win === 'A' ? 'crowdRoar' : 'crowdBoo');
    this.banner(win === 'A' ? 'VICTORY' : 'DEFEAT', win === 'A' ? 'kill' : 'crit');
    setTimeout(() => this.dir.setShot('victory', { winner: alive && alive.id }, 1.2), 2400);
  }

  // Establishing flyover is authored here (the director frames fighters; this one frames the bowl): sweep in from above the gate to hero height.
  introPose(t) {
    const k = clamp(t / 3.0, 0, 1), e = k * k * (3 - 2 * k), tall = Number.isFinite(this.dir.tall) ? this.dir.tall : 0;
    const a = [-16, 31, 47], b = [-17.5, 3.4, 8.5], pos = [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * e);
    pos[0] += Math.sin(k * 3.1) * 3; const look = { x: 1 * e, y: 6 - 4.6 * e, z: -2 * (1 - e) };
    return { pos: { x: pos[0], y: pos[1], z: pos[2] + tall * 6 }, look, fov: 48 + tall * 12, timeScale: 1 };
  }

  applyCamera(pose) {
    if (this.phase === 'intro' && this.phaseT < 3.0) pose = this.introPose(this.phaseT);
    const c = this.camera; c.position.set(pose.pos.x, pose.pos.y, pose.pos.z); c.lookAt(pose.look.x, pose.look.y, pose.look.z);
    if (Math.abs(c.fov - pose.fov) > 0.01) { c.fov = pose.fov; c.updateProjectionMatrix(); }
    this.feel.apply(c); c.updateMatrixWorld();
  }

  // ---------------------------------------------------------------- actors
  syncFighters(dt, simulating) {
    const k = 1 - Math.exp(-dt * 14);
    for (const f of this.fm.values()) {
      const u = f.u, rig = f.rig, an = rig.animator;
      const px = f.rx ?? u.x, py = f.ry ?? u.y;
      // smooth render position toward sim position (sim runs at 30 Hz)
      f.rx = px + (u.x - px) * k; f.ry = py + (u.y - py) * k;
      const ivx = (f.rx - px) / Math.max(dt, 1e-4), ivz = (f.ry - py) / Math.max(dt, 1e-4);
      f.vx += (ivx - f.vx) * 0.25; f.vz += (ivz - f.vz) * 0.25;
      // facing: toward target
      const tgt = u.tgt && this.fm.get(u.tgt); let want = f.yaw;
      if (!u.down && tgt && !tgt.u.down) want = Math.atan2(tgt.rx - f.rx, tgt.ry - f.ry); else if (!u.down) want = Math.atan2(u.face, 0) ;
      if (!u.down && !u.s.stun) { let d = want - f.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); f.yaw += d * (1 - Math.exp(-dt * 12)); }
      const fx_ = Math.sin(f.yaw), fz_ = Math.cos(f.yaw), lx_ = Math.cos(f.yaw), lz_ = -Math.sin(f.yaw);
      const vf = f.vx * fx_ + f.vz * fz_, vl = f.vx * lx_ + f.vz * lz_;
      if (!u.down) an.setMove(Math.abs(vf) < 0.15 ? 0 : vf, Math.abs(vl) < 0.15 ? 0 : vl);
      rig.root.position.set(f.rx, 0, f.ry); rig.root.rotation.y = f.yaw;
      // persistent states from the sim
      if (!u.down) {
        const stunned = !!(u.s.stun), guarding = !!(u.s.guard), spinning = !!u.s.spin;
        if (stunned && f.st !== 'stun') { an.setState('stun'); f.st = 'stun'; }
        else if (!stunned && f.st === 'stun') { an.setState('move'); f.st = ''; }
        if (guarding && !f.guarding) { an.play('block'); f.guarding = true; } else if (!guarding && f.guarding) { an.release(); f.guarding = false; }
        if (u.s.air && !f.air) { an.play('knockdown'); f.air = true; } else if (!u.s.air && f.air) { an.play('getup'); f.air = false; }
        if (spinning && !f.spin) { an.play('attack3', { speed: 2.4 }); f.spin = true; } else if (!spinning) f.spin = false;
      }
      rig.update(dt);
      // plate
      f.hpShown += (u.hp - f.hpShown) * 0.2; f.plate.hp && f.plate.hp.set(u.hp, u.maxhp);
      const head = new THREE.Vector3(f.rx, 2.05 * (rig.root.scale.y || 1), f.ry);
      f.plate.track(head, this.camera, this.renderer.domElement.clientWidth, this.renderer.domElement.clientHeight, 0.35);
      f.plate.style.opacity = u.down || this.phase === 'intro' ? 0.0 : 1;
    }
  }

  chest(u, y = 1.25) { const f = this.fm.get(u.id); return new THREE.Vector3(f ? (f.rx ?? u.x) : u.x, y, f ? (f.ry ?? u.y) : u.y); }
  feet(u) { return this.chest(u, 0.05); }
  dirOf(a, b) { const v = new THREE.Vector3(b.x - a.x, 0, b.y - a.y); if (v.lengthSq() < 1e-6) v.set(a.face || 1, 0, 0); return v.normalize(); }
  unitById(id) { return this.F.units.find((x) => x.id === id); }
  col(u) { return D().STYLES[u.style].c; }

  // ---------------------------------------------------------------- events
  consume() {
    const F = this.F, evs = F.ev.splice(0, F.ev.length);
    for (const e of evs) { try { this.onEvent(e); } catch (err) { console.error('event', e.k, err); } }
  }

  onEvent(e) {
    const F = this.F, fx = this.fx, A = this.audio, feel = this.feel;
    const src = e.src ? this.unitById(e.src) : null, dst = e.dst ? this.unitById(e.dst) : null;
    const fs = src && this.fm.get(src.id), fd = dst && this.fm.get(dst.id);
    const pan = (u) => clamp((u.x) / 12, -1, 1);
    switch (e.k) {
      case 'atk': {
        if (!fs || !dst) break; const an = fs.rig.animator; const rig = fs.rig;
        const name = fs.atkN++ % 5 === 4 && (src.style === 'murmillo' || src.style === 'hoplomachus' || src.style === 'dimachaerus') ? 'attack3' : (fs.atkN % 2 ? 'attack1' : 'attack2');
        const info = an.clipInfo(name) || { hitAt: 0.27 }; const wind = Math.min(0.22, 0.4 / L().apsOf(src));
        an.play(name, { speed: clamp(info.hitAt / wind, 0.8, 3.2) }); rig.squashKick && rig.squashKick(-0.04);
        const dir = this.dirOf(src, dst), c = this.col(src);
        fx.later(wind * 0.5, () => { if (!F.done) { fx.slash(this.chest(src, 1.3), dir, c, src.style === 'hoplomachus' || src.style === 'retiarius' ? 2.6 : 2.1); A.sfx('swish', { pan: pan(src), heavy: src.style === 'murmillo' }); } });
        break;
      }
      case 'hit': {
        if (!dst) break; const frac = e.dmg / dst.maxhp, dir = src ? this.dirOf(src, dst) : new THREE.Vector3(0, 0, 1);
        if (e.hz) { fx.number(this.chest(dst, 1.9), e.dmg + ' FIRE', 'fire'); fx.spark(this.chest(dst), new THREE.Vector3(0, 1, 0), 10, '#ffb347'); feel.addTrauma && feel.addTrauma(0.12); A.sfx('dust', { pan: pan(dst) }); this.flashHurt(fd, 0.1); break; }
        fx.hit(this.chest(dst), dir, { dmgFrac: frac, crit: !!e.crit, color: src ? this.col(src) : undefined });
        fx.number(this.chest(dst, 1.9), e.crit ? 'CRIT ' + e.dmg : String(e.dmg), e.crit ? 'crit' : (e.tech && !e.basic ? 'tech' : 'dmg'));
        if (e.save) fx.number(this.chest(dst, 2.3), e.save, 'block');
        feel.impact('hit', { dmgFrac: frac, crit: !!e.crit, mine: dst.side === 'A', dir, color: src ? this.col(src) : undefined });
        if (fd) { this.flashHurt(fd, frac); if (!(dst.s && dst.s.guard)) fd.rig.animator.hurt(1, clamp(0.55 + frac * 3, 0.5, 1.6)); else fd.rig.animator.hurt(1, 0.8); }
        if (fs && frac > 0.08) fs.rig.animator.hitStop(0.04);
        A.sfx(e.crit ? 'swordHitCrit' : (e.save || (dst.s && dst.s.guard)) ? 'shieldBlock' : 'swordHit', { pan: pan(dst) });
        if (Math.random() < 0.6) A.sfx('hurt', { voice: VOICE[dst.style] ?? 0, pan: pan(dst) });
        if (src && Math.random() < 0.25) A.sfx('grunt', { voice: VOICE[src.style] ?? 0, pan: pan(src) });
        this.recent += frac * 2 + (e.crit ? 0.25 : 0); this.lastHitT = this.t;
        this.arena.setHype(clamp(F.hype / 100 + 0.25, 0, 1));
        break;
      }
      case 'miss': if (dst) { fx.number(this.chest(dst, 1.9), e.inv ? 'IMMUNE' : 'DODGE', 'miss'); fx.kickup(this.feet(dst), src ? this.dirOf(src, dst) : new THREE.Vector3(1, 0, 0), 4); A.sfx(e.inv ? 'metalClang' : 'miss', { pan: pan(dst) }); } break;
      case 'whiff': if (src) A.sfx('swish', { pan: pan(src), gain: 0.5 }); break;
      case 'tech': if (src) { fx.number(this.chest(src, 2.1), (D().TECHS[e.tech] || {}).n + '!', 'tech'); fx.ring(this.feet(src), '#f5ead2', 1.8); A.sfx('uiConfirm', { gain: 0.5 }); if (fs) { const an = fs.rig.animator; an.play('attack3', { speed: 1.9 }); } } break;
      case 'dash': if (src) { fx.kickup(this.feet(src), new THREE.Vector3(src.face, 0, 0), 8); A.sfx('dust', { pan: pan(src) }); A.sfx('footstep', { pitch: 0.9 }); fx.trail && fx.trail(fs ? fs.rig.root : this.chest(src), this.col(src)); } break;
      case 'proj': if (src && dst) { const from = this.chest(src), to = this.chest(dst); fx.shoot(from, e.long ? from.clone().add(to.clone().sub(from).normalize().multiplyScalar(26)) : to, e.c || this.col(src), { speed: e.long ? 40 : 22 }); A.sfx('swish', { pitch: 1.3, heavy: !!e.long, pan: pan(src) }); if (fs) fs.rig.animator.play('attack3', { speed: 1.8 }); } break;
      case 'aoe': {
        const pos = new THREE.Vector3(e.x, 0.05, e.y), c = e.c || '#f5ead2';
        if (e.big) { fx.shockwave(pos, e.r, c); fx.dust(pos, 18); fx.debris && fx.debris(pos, 10); fx.groundDecal(pos, e.meteor ? 'scorch' : 'crater', { size: e.r * 1.3 }); feel.impact('aoe', { big: true }); A.sfx('ultEarth', { gain: 0.8 }); }
        else { fx.ring(pos, c, e.r); fx.dust(pos, 8); A.sfx('drum', { gain: 0.5 }); }
        if (e.meteor) { fx.ult.impact('fire', pos, e.r); feel.impact('meteor', {}); this.post.pulseCA && this.post.pulseCA(0.014); }
        break;
      }
      case 'tele': { const h = fx.tele(new THREE.Vector3(e.x, 0.05, e.y), e.r, e.t, e.c || '#e8742a'); (this.teles = this.teles || []).push(h); if (e.haz) this.banner('Fire jets! Get out of the red circle', 'info'); break; }
      case 'zap': if (src && dst) { fx.zap(this.chest(src), this.chest(dst), '#a8d8ff'); feel.addTrauma && feel.addTrauma(0.1); A.sfx('ultLightning', { gain: 0.4 }); } break;
      case 'hook': if (src && dst) { fx.chain(this.chest(src), this.chest(dst), '#d9e4ee'); fx.hit(this.chest(dst), this.dirOf(src, dst), { dmgFrac: 0.1 }); A.sfx('netThrow', { pan: pan(src) }); } break;
      case 'bleed': if (dst && e.dmg >= 3) fx.number(this.chest(dst, 1.9), '-' + e.dmg, e.fire ? 'fire' : 'thorn'); break;
      case 'thorn': if (dst) fx.number(this.chest(dst, 1.9), e.dmg + ' THORNS', 'thorn'); break;
      case 'status': this.onStatus(e, dst); break;
      case 'resist': if (dst) fx.number(this.chest(dst, 1.9), 'RESIST', 'status'); break;
      case 'heal': if (dst) { fx.heal(this.chest(dst), clamp(e.amt / dst.maxhp * 40, 6, 16)); fx.number(this.chest(dst, 1.9), '+' + e.amt, 'heal'); A.sfx('healSparkle', { pan: pan(dst), gain: 0.7 }); } break;
      case 'rune': if (src) { fx.number(this.chest(src, 2.1), (e.id || 'RUNE').toUpperCase(), 'status'); fx.ring(this.feet(src), '#f2c14e', 1.6); } break;
      case 'ult': {
        const el = ULT_EL[e.id] || COLOR_EL(e.c); const name = (D().ULTS[e.id] || (D().DUOS && D().DUOS[(e.id || '').slice(4)]) || { n: e.id }).n;
        if (src) { fx.ult.cast(el, this.feet(src)); fx.ring(this.feet(src), e.c, 2.6); if (fs) { fs.rig.animator.play('attack3', { speed: 1.4 }); fs.rig.flash(0.2, e.c); } }
        feel.impact('ult', { color: e.c }); this.banner(name + '!', 'ult'); A.sfx('ult', { element: el }); setTimeout(() => A.sfx('crowdRoar', { gain: 0.8 }), 600);
        if (src && src.side === 'A' && F.manualFavor !== undefined) { const t = this.nearestFoe(src); t && this.dir.cue('ultimate', { unit: src.id, target: t.id }); }
        else if (src) { const t = this.nearestFoe(src); t && this.dir.cue('ultimate', { unit: src.id, target: t.id }); }
        this.recent += 0.5; this.bump = 0.35;
        if (e.id === 'tornado') this.ultSustain(src, 'wind', 3); else if (e.id === 'bloodrage') this.ultSustain(src, 'fire', 6);
        else if (e.id === 'unbreakable') fx.aura(fs ? fs.rig.root : this.chest(src), '#9a6ad8', 6, { kind: 'guard' });
        break;
      }
      case 'down': if (dst) {
        const last = !F.units.some((u) => u.side === dst.side && !u.down && u !== dst);
        fx.hit(this.chest(dst), src ? this.dirOf(src, dst) : new THREE.Vector3(1, 0, 0), { dmgFrac: 0.4, crit: true }); fx.dust(this.feet(dst), 14); fx.debris && fx.debris(this.feet(dst), 4); fx.groundDecal(this.feet(dst), 'scuff', { size: 1.6 });
        fx.number(this.chest(dst, 1.9), 'DOWN', 'miss'); feel.impact(last ? 'finalKill' : 'kill', {}); if (last && this.post.zoomPunch) this.post.zoomPunch(0.06);
        if (fd) { fd.rig.animator.play('death'); this.dropHandles(dst.id); fd.rig.flash(0.15); }
        A.sfx('deathCry', { voice: VOICE[dst.style] ?? 0, pan: pan(dst) }); setTimeout(() => A.sfx('deathThud', { pan: pan(dst) }), 350); A.sfx('crowdGasp'); this.bump = 0.4;
        if (!last) this.dir.cue('kill', { victim: dst.id, killer: src && src.id });
      } break;
      case 'revive': if (dst) { fx.ult.impact('holy', this.feet(dst), 2.4); feel.impact('revive', {}); fx.number(this.chest(dst, 2.1), 'REVIVE!', 'tech'); A.sfx('healSparkle'); A.sfx('horn'); if (fd) { fd.rig.animator.dead = false; fd.rig.animator.setState('move'); fd.rig.animator.play('getup'); } } break;
      case 'roar': feel.impact('roar', {}); A.sfx(e.fav ? 'crowdCheer' : 'crowdRoar'); this.arena.setWave(1); setTimeout(() => this.arena.setWave(0), 3500); this.banner(e.fav ? "Crowd's Favor!" : D().CHANTS[(F.peak | 0) % D().CHANTS.length], e.fav ? 'ult' : 'info'); this.recent += 0.2; break;
      case 'favorready': this.banner("Crowd's Favor ready!", 'ult'); A.sfx('crowdCheer'); break;
      default: break;
    }
  }

  nearestFoe(u) { let best = null, bd = 1e9; for (const o of this.F.units) { if (o.side === u.side || o.down) continue; const d = Math.hypot(o.x - u.x, o.y - u.y); if (d < bd) { bd = d; best = o; } } return best; }
  flashHurt(fd, frac) { if (!fd) return; fd.rig.flash(0.1 + Math.min(0.1, frac), '#ffd7a8'); fd.rig.squashKick && fd.rig.squashKick(-0.05 - Math.min(0.1, frac)); }
  dropHandles(id) { const f = this.fm.get(id); if (!f) return; for (const k in f.handles) { try { f.handles[k].stop(); } catch (e) { /* ignore */ } } f.handles = {}; }
  ultSustain(u, el, dur) { const f = u && this.fm.get(u.id); if (!f) return; const h = this.fx.ult.sustain(el, f.rig.root, dur); f.handles['ult' + el] = h; }

  onStatus(e, dst) {
    if (!dst) return; const f = this.fm.get(dst.id), fx = this.fx, st = e.st; if (STATUS_LABEL[st]) fx.number(this.chest(dst, 2.1), STATUS_LABEL[st], 'status');
    const key = st; if (f.handles[key]) { try { f.handles[key].stop(); } catch (er) { /* ignore */ } delete f.handles[key]; }
    const tgt = f.rig.root, t = e.t || 3;
    if (STATUS_FX.has(st)) f.handles[key] = fx.status(tgt, st, t);
    else if (st === 'guard') f.handles[key] = fx.aura(tgt, '#9a6ad8', t || 4, { kind: 'guard' });
    else if (st === 'frenzy' || st === 'rage') f.handles[key] = fx.aura(tgt, '#d2412b', 6, { kind: 'rage' });
    else if (st === 'rally') f.handles[key] = fx.aura(tgt, '#2fb0a0', 6, { kind: 'rally' });
    if (st === 'stun') this.audio.sfx('stunChime', { gain: 0.8 }); else if (st === 'guard') this.audio.sfx('shieldBlock', { gain: 0.5 }); else if (st === 'rage' || st === 'frenzy') this.audio.sfx('drum', { gain: 0.6 }); else if (st === 'rally') this.audio.sfx('uiConfirm');
  }

  // ---------------------------------------------------------------- HUD + audio
  updateHud(dt, F) {
    for (const f of this.fm.values()) for (const { ring, slot } of f.ring) { const frac = slot.max ? clamp(slot.cd / slot.max, 0, 1) : 0; ring.set(f.u.down ? 1 : frac, Math.max(0, slot.cd)); }
  }

  updateAudio(dt, F) {
    this.recent = Math.max(0, this.recent - dt * 0.45); this.bump = Math.max(0, (this.bump || 0) - dt * 0.5);
    this.intTimer -= dt; if (this.intTimer > 0) return; this.intTimer = 0.25;
    const A = F.units.filter((u) => u.side === 'A' && !u.down), B = F.units.filter((u) => u.side === 'B' && !u.down);
    const lowest = Math.min(1, ...F.units.filter((u) => !u.down).map((u) => u.hp / u.maxhp));
    let target = 0.15 + 0.25 * clamp(1 - Math.min(A.length, B.length) / 3, 0, 1) + 0.3 * clamp(this.recent, 0, 1) + 0.1 * (lowest < 0.3 ? 1 : 0) + (this.bump || 0);
    if (A.length + B.length === 2 && lowest < 0.25) target = Math.max(target, 0.9);
    if (this.phase === 'fight') { this.audio.music.setIntensity(clamp(target, 0, 1)); this.audio.crowd(0.25 + 0.75 * clamp(target, 0, 1)); this.arena.setHype(clamp(0.2 + target * 0.8, 0, 1)); }
  }
}
