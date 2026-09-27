// No Room For Heroes trailer: heroes, monsters, champions and bosses, sliced
// with the game's own tables (index.html SPRITES / MON_SPRITES / CHAMP_* /
// BOSS_ANIM_SRC). Heroes face RIGHT (row 3), monsters face LEFT (dirRow 1).
// Positions are WORLD px; footY is where the feet touch (FLOOR - LIFT).
'use strict';

const HERO_DEF = {
  warrior: { base: 'sprites/knight/knight_', scale: .92, clips: {
    idle: { sheet: 'idle', fw: 64, fh: 64, n: 2, fps: 4, row: 3, ax: 41, ay: 62 },
    walk: { sheet: 'walk', fw: 64, fh: 64, n: 8, fps: 11, row: 3, ax: 41, ay: 62 },
    slash: { sheet: 'slash', fw: 192, fh: 192, n: 5, fps: 13, row: 3, ax: 97, ay: 126 },
    thrust: { sheet: 'thrust', fw: 192, fh: 192, n: 7, fps: 14, row: 3, ax: 98, ay: 126 },
    hurt: { sheet: 'hurt', fw: 64, fh: 64, n: 5, fps: 12, row: 0, ax: 32, ay: 62 } } },
  mage: { base: 'sprites/wizard/wizard_', scale: .86, clips: {
    idle: { sheet: 'idle', fw: 192, fh: 192, n: 2, fps: 4, row: 3, ax: 103, ay: 126 },
    walk: { sheet: 'walk', fw: 192, fh: 192, n: 8, fps: 11, row: 3, ax: 103, ay: 126 },
    cast: { sheet: 'cast', fw: 64, fh: 64, n: 6, fps: 10, row: 3, ax: 31, ay: 62 } } },
  cleric: { uni: 'sprites/cleric/cleric_universal.png', scale: .83, clips: {
    idle: { fw: 64, fh: 64, row: 11, n: 1, fps: 1, ax: 24, ay: 62 },
    walk: { fw: 64, fh: 64, row: 11, n: 9, fps: 11, ax: 24, ay: 62 },
    slash: { fw: 64, fh: 64, row: 15, n: 6, fps: 13, ax: 24, ay: 62 },
    cast: { fw: 64, fh: 64, row: 3, n: 7, fps: 11, ax: 24, ay: 62 } } },
  rogue: { base: 'sprites/rogue/rogue_', scale: .92, clips: {
    idle: { sheet: 'idle', fw: 64, fh: 64, n: 2, fps: 4, row: 3, ax: 32, ay: 62 },
    walk: { sheet: 'walk', fw: 64, fh: 64, n: 8, fps: 11, row: 3, ax: 32, ay: 62 },
    slash: { sheet: 'slash', fw: 192, fh: 192, n: 5, fps: 13, row: 3, ax: 96, ay: 126 },
    thrust: { sheet: 'thrust', fw: 64, fh: 64, n: 7, fps: 14, row: 3, ax: 32, ay: 62 } } },
};
const MON_DEF = {
  goblin: { base: 'sprites/goblin/goblin_', scale: .8, row: 1, clips: {
    idle: { sheet: 'idle', fw: 64, fh: 64, n: 2, fps: 4, ax: 25, ay: 61 },
    walk: { sheet: 'walk', fw: 64, fh: 64, n: 8, fps: 10, ax: 25, ay: 61 },
    slash: { sheet: 'slash', fw: 64, fh: 64, n: 5, fps: 12, ax: 25, ay: 61 } } },
  goblin2: { base: 'sprites/goblin2/goblin2_', scale: .8, row: 1, clips: {
    idle: { sheet: 'idle', fw: 64, fh: 64, n: 2, fps: 4, ax: 25, ay: 61 },
    walk: { sheet: 'walk', fw: 64, fh: 64, n: 8, fps: 10, ax: 25, ay: 61 },
    slash: { sheet: 'slash', fw: 192, fh: 192, n: 5, fps: 12, ax: 96, ay: 126 } } },
  goblin3: { base: 'sprites/goblin3/goblin3_', scale: .8, row: 1, clips: {
    idle: { sheet: 'idle', fw: 64, fh: 64, n: 2, fps: 4, ax: 25, ay: 61 },
    walk: { sheet: 'walk', fw: 64, fh: 64, n: 8, fps: 10, ax: 25, ay: 61 },
    slash: { sheet: 'smash', fw: 192, fh: 192, n: 4, fps: 11, ax: 96, ay: 126 } } },
  skeleton: { base: 'sprites/skeleton/skeleton_', scale: .82, row: 1, clips: {
    idle: { sheet: 'idle', fw: 64, fh: 64, n: 2, fps: 4, ax: 32, ay: 61 },
    walk: { sheet: 'walk', fw: 64, fh: 64, n: 8, fps: 10, ax: 32, ay: 61 },
    slash: { sheet: 'slash', fw: 192, fh: 192, n: 5, fps: 12, ax: 96, ay: 126 } } },
  skeleton3: { base: 'sprites/skeleton3/skeleton3_', scale: .82, row: 1, clips: {
    idle: { sheet: 'idle', fw: 64, fh: 64, n: 2, fps: 4, ax: 32, ay: 61 },
    walk: { sheet: 'walk', fw: 64, fh: 64, n: 8, fps: 10, ax: 32, ay: 61 },
    slash: { sheet: 'slash', fw: 192, fh: 192, n: 5, fps: 12, ax: 96, ay: 126 } } },
  ogre: { base: 'sprites/ogre/ogre_', scale: 1.15, row: 1, clips: {
    idle: { sheet: 'idle', fw: 192, fh: 192, n: 2, fps: 4, ax: 96, ay: 126 },
    walk: { sheet: 'walk', fw: 192, fh: 192, n: 8, fps: 10, ax: 96, ay: 126 },
    slash: { sheet: 'islash', fw: 192, fh: 192, n: 5, fps: 12, ax: 96, ay: 126 } } },
  ogre2: { base: 'sprites/ogre2/ogre2_', scale: 1.15, row: 1, clips: {
    idle: { sheet: 'idle', fw: 192, fh: 192, n: 2, fps: 4, ax: 96, ay: 126 },
    walk: { sheet: 'walk', fw: 192, fh: 192, n: 8, fps: 10, ax: 96, ay: 126 },
    slash: { sheet: 'slash', fw: 192, fh: 192, n: 5, fps: 12, ax: 96, ay: 126 } } },
  warden: { base: 'sprites/warden/warden_', scale: .95, row: 1, clips: {
    idle: { sheet: 'idle', fw: 192, fh: 192, n: 2, fps: 4, ax: 96, ay: 126 },
    walk: { sheet: 'walk', fw: 192, fh: 192, n: 8, fps: 10, ax: 96, ay: 126 },
    slash: { sheet: 'slash', fw: 64, fh: 64, n: 5, fps: 12, ax: 32, ay: 61 } } },
  slime: { base: 'sprites/slime/slime_', scale: .096, row: 0, clips: {
    idle: { sheet: 'idle', fw: 890, fh: 957, n: 4, fps: 5, ax: 444, ay: 943 },
    walk: { sheet: 'walk', fw: 950, fh: 887, n: 4, fps: 9, ax: 483, ay: 868 },
    slash: { sheet: 'slash', fw: 986, fh: 871, n: 7, fps: 13, ax: 463, ay: 858 } } },
  dragon: { base: 'sprites/dragon/dragon_', scale: .3, row: 0, clips: {
    idle: { sheet: 'idle', fw: 298, fh: 210, n: 6, fps: 7, ax: 174, ay: 210 },
    slash: { sheet: 'slash', fw: 346, fh: 210, n: 7, fps: 13, ax: 172, ay: 210 } } },
};
const SHEETS = {};
function sheet(path) { return SHEETS[path] || (SHEETS[path] = img(path)); }
for (const k in HERO_DEF) { const d = HERO_DEF[k]; for (const c in d.clips) d.clips[c].im = d.uni ? sheet(d.uni) : sheet(d.base + d.clips[c].sheet + '.png'); }
for (const k in MON_DEF) { const d = MON_DEF[k]; for (const c in d.clips) d.clips[c].im = sheet(d.base + d.clips[c].sheet + '.png'); }

const CHAMP = {
  walk: Array.from({ length: 12 }, (_, i) => img('sprites/champion/champion_' + i + '.png')), walkDH: 88,
  atk: Array.from({ length: 14 }, (_, i) => img('sprites/champion/attack/champion_attack_' + i + '.png')), atkDH: 99,
  death: Array.from({ length: 6 }, (_, i) => img('sprites/champion/death/' + (i + 1) + '.png')), deathDH: 92,
};
const SROGUE = {
  walk: Array.from({ length: 15 }, (_, i) => img('sprites/super_rogue/s_rogue_walk_' + String(i + 1).padStart(2, '0') + '.png')), walkDH: 96,
  atk1: Array.from({ length: 6 }, (_, i) => img('sprites/super_rogue/s_rogue_attack1_' + String(i + 1).padStart(2, '0') + '.png')), atkDH: 100,
  idle: Array.from({ length: 5 }, (_, i) => img('sprites/super_rogue/s_rogue_idle_' + String(i + 1).padStart(2, '0') + '.png')), idleDH: 110,
  death: Array.from({ length: 7 }, (_, i) => img('sprites/super_rogue/s_rogue_death_' + String(i + 1).padStart(2, '0') + '.png')), deathDH: 98,
};
const BOSS_SRC = { azzaroth: [4, 6], ignar: [4, 6], gormauth: [5, 5], karnak: [4, 5], mortis: [5, 6], thornheart: [5, 6] };
const BOSS = {};
for (const k in BOSS_SRC) BOSS[k] = {
  idle: Array.from({ length: BOSS_SRC[k][0] }, (_, i) => img(`sprites/${k}/${k}_idle_${i}.png`)),
  attack: Array.from({ length: BOSS_SRC[k][1] }, (_, i) => img(`sprites/${k}/${k}_attack_${i}.png`)),
};
const DEMON_HI = [0, 1, 2, 3].map(i => img('sprites/demon/demon_idle_' + i + '.png'));
// attack frames are framed differently from idle; these keep the body still
// (relScale, dx, dy in idle source px, measured by template matching)
const BOSS_ALIGN = { azzaroth: [1.04, -84, 4], gormauth: [1, 0, -20], ignar: [1.02, -24, -40], karnak: [1, 20, 4], mortis: [1.1, -176, -8], thornheart: [1.04, -16, 0] };

// offscreen used to tint a sprite (hit flash / freeze) without touching the scene
const _tint = document.createElement('canvas'); _tint.width = 1200; _tint.height = 1100;
const _tg = _tint.getContext('2d');

// core: draw a cell of `im` so that its anchor (ax, ay in src px) lands on (x, y); scale s; dir -1 mirrors.
// fx: {flash:0..1 (white), tint:'#rgb', tintA, alpha}
function drawCell(g, im, sx, sy, sw, sh, ax, ay, x, y, s, dir = 1, fx = null) {
  if (!ok(im)) return;
  const m = g.getTransform(), scr = Math.hypot(m.a, m.b) * s;
  if (fx && fx.rim) {
    const r = fx.rim;
    drawCell(g, im, sx, sy, sw, sh, ax, ay, x + (r.dx || -1.5), y + (r.dy || 0), s, dir, { tint: r.col, tintA: 1, alpha: r.a != null ? r.a : .9, add: true });
  }
  g.save();
  g.translate(x, y); g.scale(s * dir, s);
  if (fx && fx.add) g.globalCompositeOperation = 'lighter';
  if (fx && fx.alpha != null) g.globalAlpha *= fx.alpha;
  g.imageSmoothingEnabled = scr < .98; g.imageSmoothingQuality = 'medium';
  if (fx && (fx.flash > 0 || fx.tintA > 0) && sw <= 1200 && sh <= 1100) {
    _tg.globalCompositeOperation = 'source-over'; _tg.clearRect(0, 0, sw, sh);
    _tg.imageSmoothingEnabled = false;
    _tg.drawImage(im, sx, sy, sw, sh, 0, 0, sw, sh);
    if (!(fx.tintA >= 1)) g.drawImage(_tint, 0, 0, sw, sh, -ax, -ay, sw, sh);
    _tg.globalCompositeOperation = 'source-atop';
    if (fx.tintA > 0) { _tg.globalAlpha = fx.tintA; _tg.fillStyle = fx.tint; _tg.fillRect(0, 0, sw, sh); }
    if (fx.flash > 0) { _tg.globalAlpha = fx.flash; _tg.fillStyle = '#fff'; _tg.fillRect(0, 0, sw, sh); }
    _tg.globalAlpha = 1;
    g.drawImage(_tint, 0, 0, sw, sh, -ax, -ay, sw, sh);
  } else {
    const [mi, f] = mip(im, scr);
    g.drawImage(mi, sx / f, sy / f, sw / f, sh / f, -ax, -ay, sw, sh);
  }
  g.restore();
}

// hero: cls in HERO_DEF, clip name, t = seconds into the clip (loops unless once)
function drawHero(g, cls, clip, t, x, footY, o = {}) {
  const d = HERO_DEF[cls], c = d.clips[clip] || d.clips.walk;
  let f = Math.floor(t * c.fps * (o.speed || 1));
  f = o.once ? Math.min(c.n - 1, f) : ((f % c.n) + c.n) % c.n;
  const S = d.scale * (o.scale || 1);
  if (o.shadow !== false) shadowW(g, x, footY, 14 * (o.scale || 1));
  drawCell(g, c.im, f * c.fw, c.row * c.fh, c.fw, c.fh, c.ax, c.ay, x, footY, S, o.dir || 1, o.fx);
}
function drawMon(g, key, clip, t, x, footY, o = {}) {
  const d = MON_DEF[key], c = d.clips[clip] || d.clips.idle;
  let f = Math.floor(t * c.fps * (o.speed || 1));
  f = o.once ? Math.min(c.n - 1, f) : ((f % c.n) + c.n) % c.n;
  const S = d.scale * (o.scale || 1);
  if (o.shadow !== false) shadowW(g, x, footY, (key === 'ogre' || key === 'ogre2' ? 24 : key === 'slime' ? 30 : 14) * (o.scale || 1));
  drawCell(g, c.im, f * c.fw, d.row * c.fh, c.fw, c.fh, c.ax, c.ay, x, footY, S, o.dir || 1, o.fx);
}
// sequence (array of images) drawn by height dh with feet at footY, centred on x
function drawSeq(g, arr, f, x, footY, dh, o = {}) {
  const im = arr[clamp(f, 0, arr.length - 1)]; if (!ok(im)) return;
  const s = dh / im.naturalHeight;
  drawCell(g, im, 0, 0, im.naturalWidth, im.naturalHeight, im.naturalWidth / 2, im.naturalHeight - (o.foot != null ? o.foot : 2 / s), x, footY, s, o.dir || 1, o.fx);
}
function drawChampion(g, clip, t, x, footY, o = {}) {
  const k = o.scale || 1;
  if (o.shadow !== false) shadowW(g, x, footY, 30 * k);
  if (clip === 'walk') drawSeq(g, CHAMP.walk, 1 + Math.floor(t * 12) % 11, x, footY, CHAMP.walkDH * k, o);
  else if (clip === 'attack') drawSeq(g, CHAMP.atk, o.loop ? Math.floor(t * 20) % 14 : Math.min(13, Math.floor(t * 20)), x, footY, CHAMP.atkDH * k, o);
  else if (clip === 'death') drawSeq(g, CHAMP.death, Math.min(5, Math.floor(t * 1000 / 140)), x, footY, CHAMP.deathDH * k, o);
  else drawSeq(g, CHAMP.walk, 0, x, footY, CHAMP.walkDH * k, o);
}
function drawSuperRogue(g, clip, t, x, footY, o = {}) {
  const k = o.scale || 1;
  if (o.shadow !== false) shadowW(g, x, footY, 26 * k);
  if (clip === 'walk') drawSeq(g, SROGUE.walk, Math.floor(t * 14) % 15, x, footY, SROGUE.walkDH * k, o);
  else if (clip === 'attack') drawSeq(g, SROGUE.atk1, Math.min(5, Math.floor(t * 12)), x, footY, SROGUE.atkDH * k, o);
  else if (clip === 'death') drawSeq(g, SROGUE.death, Math.min(6, Math.floor(t * 1000 / 140)), x, footY, SROGUE.deathDH * k, o);
  else drawSeq(g, SROGUE.idle, Math.floor(t * 6) % 5, x, footY, SROGUE.idleDH * k, o);
}
// bosses: idle ping-pong at 170ms, attack plays once over `castMs`
function bossFrameIdx(n, t) { const pp = []; for (let i = 0; i < n; i++) pp.push(i); for (let i = n - 2; i >= 1; i--) pp.push(i); return pp[Math.floor(t * 1000 / 170) % pp.length]; }
function drawBoss(g, key, clip, t, cx, footY, dh = BOSS_H, o = {}) {
  const A = BOSS[key];
  const idle0 = A.idle[0];
  if (!ok(idle0)) return;
  const s = dh / idle0.naturalHeight;                   // idle scale drives both clips
  if (clip === 'attack') {
    const f = Math.min(A.attack.length - 1, Math.floor(t * 1000 / (o.castMs || 640) * A.attack.length));
    const im = A.attack[f]; if (!ok(im)) return;
    const [rs, dx, dy] = BOSS_ALIGN[key] || [1, 0, 0];
    // idle canvas top-left in world, then the attack canvas offset from it
    const ox = cx - idle0.naturalWidth / 2 * s * (o.dir || 1), oy = footY - idle0.naturalHeight * s;
    drawCell(g, im, 0, 0, im.naturalWidth, im.naturalHeight, 0, 0, ox + dx * s * (o.dir || 1), oy + dy * s, s * rs, o.dir || 1, o.fx);
    return;
  }
  const im = A.idle[bossFrameIdx(A.idle.length, t)]; if (!ok(im)) return;
  drawCell(g, im, 0, 0, im.naturalWidth, im.naturalHeight, im.naturalWidth / 2, im.naturalHeight, cx, footY, s, o.dir || 1, o.fx);
}
// Azzaroth's arcane aura (drawDemonAura) in world space
function demonAura(g, t, cx, y, dw, dh, front, k = 1) {
  const pulse = .5 + .5 * Math.sin(t * 1000 / 640);
  if (!front) {
    const gy = y - dh * .55, gr = dw * .72 * k;
    const gd = g.createRadialGradient(cx, gy, 3, cx, gy, gr);
    gd.addColorStop(0, 'rgba(190,90,240,0.48)'); gd.addColorStop(.45, 'rgba(150,55,210,0.226)'); gd.addColorStop(1, 'rgba(150,55,210,0)');
    g.save(); g.globalAlpha *= .708 + .292 * pulse; g.fillStyle = gd; g.beginPath(); g.arc(cx, gy, gr, 0, 7); g.fill();
    g.globalAlpha = .16 + .10 * pulse; g.fillStyle = '#b06bff'; g.beginPath(); g.ellipse(cx, y, dw * .42, 9, 0, 0, 7); g.fill(); g.restore();
  } else {
    g.save();
    for (let i = 0; i < 12; i++) {
      const prog = ((t * .4) + i * .137 * 7 / 12) % 1;
      const my = y - 3 - prog * dh * .95, mx = cx + Math.sin(t * 1000 / 780 + i * 1.9) * dw * .34 + (i - 6) * 2;
      const a = Math.sin(prog * Math.PI) * .75, sz = 2 + (i % 2);
      g.globalAlpha = a * .5; g.fillStyle = '#d9a8ff'; g.fillRect(mx - 1, my - 1, sz + 2, sz + 2);
      g.globalAlpha = a; g.fillStyle = '#f0d6ff'; g.fillRect(mx, my, sz, sz);
    }
    g.restore();
  }
}
function shadowW(g, x, y, rx) {
  g.save(); g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(x, y, rx, rx * .28, 0, 0, 7); g.fill(); g.restore();
}
