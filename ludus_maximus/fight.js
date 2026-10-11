// Ludus Maximus: the live arena renderer. DOM sprites for the gladiators, a canvas layer for particles and
// effects, plus camera shake, hit-stop, slow-mo and the ultimate buttons. Reads the sim in arena.js.
(function (G) {
  const D = G.LM_D, A = G.LM_ART, L = G.LM, U = G.LMUI; const ACT = U.ACT; const R = L.ARENA_R;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = U.esc;
  const mergeCtx = (c, extra) => { if (!extra) return; for (const k in extra.syn) c.syn[k] = (c.syn[k] || 0) + extra.syn[k]; c.xfx = c.xfx || {}; for (const k in extra.xfx) c.xfx[k] = (c.xfx[k] || 0) + extra.xfx[k]; };
  const STL = { stun: 'STUNNED', slow: 'SLOWED', blind: 'BLINDED', bleed: 'BLEEDING', guard: 'GUARD', taunt: 'TAUNT', frenzy: 'FRENZY', rally: 'RALLY', air: 'AIRBORNE', spin: 'TORNADO', rage: 'RAGE' };
  const STC = { stun: '#f6b82d', slow: '#4aa3f0', blind: '#999', bleed: '#d2412b', guard: '#7b4fb8', taunt: '#e0742a', frenzy: '#d2412b', rally: '#22b5a0', air: '#f5ead2', spin: '#c2395f', rage: '#d2412b', root: '#8a5a2b', unb: '#7b4fb8' };

  function run(S, gl, opps, stance, o) {
    return new Promise((resolve) => {
      const ev = o.ev || {};
      const stB = L.oppStance(S, opps[0]); const odds = L.odds(S, gl, opps, stance, 30);
      const ctxA = L.teamCtx(S, gl, stance); const ctxB = L.teamCtx(null, opps, stB);
      (o.tricks || []).forEach((id) => { const T = D.TRICKS.find((t) => t.id === id); if (T.foe) mergeCtx(ctxB, { syn: T.foe, xfx: {} }); if (T.me) mergeCtx(ctxA, { syn: T.me, xfx: {} }); });
      if (o.augs && o.augs.length) mergeCtx(ctxA, L.augCtx(o.augs));
      if (o.foeAugs && o.foeAugs.length) mergeCtx(ctxB, L.augCtx(o.foeAugs));
      const unitsA = L.mkUnits(gl, 'A', ctxA, gl.map((g) => (o.hpf && o.hpf[g.id] != null ? o.hpf[g.id] : 1)));
      const unitsB = L.mkUnits(opps, 'B', ctxB);
      if (L.isRevenge(S, ev)) unitsA.forEach((u) => { u.grudge = true; });
      const F = L.createFight(unitsA, unitsB, { autoA: !!S.flags.auto });
      const root = $('#fightRoot');

      const bars = (side) => F.units.filter((u) => u.side === side).map((u) => `<div class="fu" id="fu-${u.id}"><div class="nm">${A.styleIcon(u.style, 16)}<span>${esc(u.name)}</span><b class="lv">${u.g.lvl}</b></div><div class="bar hp"><i id="hp-${u.id}" style="width:100%"></i><em id="sh-${u.id}"></em><span id="ht-${u.id}" class="hnum"></span></div></div>`).join('');
      const ubtn = unitsA.map((u) => `<div class="ur"><div class="who">${esc(u.name)}</div>${u.ults.map((c, k) => `<div class="ub" id="ub-${u.id}-${k}" data-a="fult" data-u="${u.id}" data-k="${k}" style="--c:${D.ULTS[c.id].c}"><div class="ubi">${A.ultIcon(c.id, 26)}</div><div class="ubn">${D.ULTS[c.id].n}</div><i class="ubcd"></i><b class="ubt"></b></div>`).join('')}</div>`).join('');
      const augChips = (o.augs || []).map((a) => `<span class="achip" style="border-color:${D.TIERS[a.t].c}" title="${a.d}">${esc(a.n)}</span>`).join('');
      root.innerHTML = `<div id="fight"><div class="inner"><div class="f-top"><div class="side">${bars('A')}</div><div class="h" style="color:#fff;align-self:center;font-size:14px;text-shadow:2px 2px 0 var(--ink)">VS</div><div class="side r">${bars('B')}</div></div><div class="f-stage" id="stage"><div id="cam"></div><canvas id="fxc"></canvas><div class="f-banner" id="fban"></div><div class="f-flash" id="fflash"></div></div><div class="f-hype"><i id="hype"></i><span>Crowd hype</span></div><div class="f-log" id="flog">${esc(gl[0].name)} (${L.STANCES[stance]}) vs ${esc(opps[0].name)}.${augChips ? '' : ''}</div>${augChips ? `<div class="f-aug">${augChips}</div>` : ''}<div class="f-ults ${unitsA.length > 1 ? 'many' : ''}">${ubtn}</div><div class="f-speed"><button class="btn sm on" data-a="fspeed" data-v="1">1x</button><button class="btn sm" data-a="fspeed" data-v="2">2x</button><button class="btn sm" data-a="fspeed" data-v="3">3x</button><button class="btn sm ${F.auto.A ? 'on' : ''}" id="fauto" data-a="fauto">Auto ult</button><button class="btn sm ghost" data-a="fskip">Skip</button></div></div></div>`;
      const stage = $('#stage'), cam = $('#cam'), cv = $('#fxc'); const W = stage.clientWidth, H = stage.clientHeight; const dpr = Math.min(2, G.devicePixelRatio || 1);
      cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; const cx = cv.getContext('2d'); cx.scale(dpr, dpr);
      const fy0 = H * 0.27, fy1 = H * 0.97; const SX = (x) => W / 2 + x * ((W * 0.46) / R), SY = (y) => (fy0 + fy1) / 2 + y * (((fy1 - fy0) * 0.44) / R);
      const sw = Math.max(70, Math.min(150, W * 0.31)); const sh = sw * 1.34;
      cam.innerHTML = A.arenaBG2(W, H) + '<div id="world"></div>';
      const world = $('#world');
      F.units.forEach((u) => {
        const e = document.createElement('div'); e.className = 'fs ' + (u.side === 'B' ? 'foe' : 'mine'); e.id = 'fs-' + u.id; e.dataset.a = u.side === 'B' ? 'ffocus' : ''; e.dataset.id = u.id; e.style.width = sw + 'px'; e.style.height = sh + 'px';
        e.innerHTML = `<div class="fshadow"></div><div class="fsb"><div class="fsi">${A.gladOf(u.g, { size: sw, tunic: u.side === 'A' ? U.myColor() : u.g.color || '#3d3b46', mood: 'fight' })}</div></div><div class="fhb"><i class="fhp"></i><i class="fshd"></i></div><div class="fsts"></div><div class="fstk"></div><span class="tgt">TARGET</span>`;
        world.appendChild(e); u.el = e; u.elb = e.querySelector('.fsb'); u.elhp = e.querySelector('.fhp'); u.elsh = e.querySelector('.fshd'); u.elst = e.querySelector('.fsts'); u.elstk = e.querySelector('.fstk'); u.elsd = e.querySelector('.fshadow'); u.stKey = '';
        u.elb.animate([{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 400, easing: 'ease-out' });
      });
      const fx = { F, speed: 1, skip: false, intro: 1.5, freeze: 0, slow: 0, shake: 0, zoom: 0, flash: 0, parts: [], rings: [], lines: [], teles: [], done: false };
      U.fight = fx;
      const el = (id) => document.getElementById(id);
      const byId = (id) => F.units.find((u) => u.id === id);
      const P = (u) => ({ x: SX(u.x), y: SY(u.y) - sh * 0.45 });
      const ban = (t, c) => { const b = $('#fban'); b.textContent = t; b.style.color = c || ''; b.classList.remove('on'); void b.offsetWidth; b.classList.add('on'); };
      const logt = (t) => { $('#flog').textContent = t; };
      const shake = (n) => { fx.shake = Math.max(fx.shake, n); };

      // ----- particles & fx -----
      const spark = (x, y, n, c, sp) => { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, v = (sp || 160) * (0.4 + Math.random()); fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0.35 + Math.random() * 0.3, max: 0.65, c, r: 2 + Math.random() * 2.5, g: 380 }); } };
      const dust = (x, y, n) => { for (let i = 0; i < n; i++) fx.parts.push({ x: x + (Math.random() - 0.5) * 20, y, vx: (Math.random() - 0.5) * 50, vy: -20 - Math.random() * 30, life: 0.5, max: 0.5, c: '#c9a360', r: 3 + Math.random() * 3, g: -10 }); };
      const ring = (x, y, r, c, big) => fx.rings.push({ x, y, r: 6, max: r, life: big ? 0.55 : 0.4, t: big ? 0.55 : 0.4, c, w: big ? 6 : 4 });
      const floatAt = (u, text, cls) => {
        const p = P(u); const f = document.createElement('div'); f.className = 'float ' + (cls || ''); f.textContent = text; f.style.left = p.x + (Math.random() * 24 - 12) + 'px'; f.style.top = p.y - sh * 0.2 + 'px'; cam.appendChild(f); setTimeout(() => f.remove(), 1000);
      };
      const lightning = (a, b) => { const pts = [[a.x, a.y]]; const n = 6; for (let i = 1; i < n; i++) pts.push([a.x + ((b.x - a.x) * i) / n + (Math.random() - 0.5) * 22, a.y + ((b.y - a.y) * i) / n + (Math.random() - 0.5) * 22]); pts.push([b.x, b.y]); fx.lines.push({ pts, life: 0.2, max: 0.2, c: '#9fd8ff', w: 4 }); };
      const mpx = (m) => m * ((W * 0.46) / R);

      function handle(e) {
        const sp = fx.skip; const src = e.src ? byId(e.src) : null, dst = e.dst ? byId(e.dst) : null;
        if (sp && e.k !== 'down') { if (e.k === 'hit') logt(`${src.name} hits ${dst.name} for ${e.dmg}.`); return; }
        if (e.k === 'atk') { const dir = src.face; src.elb.animate([{ transform: 'translateX(0) rotate(0)' }, { transform: `translateX(${dir * 16}px) rotate(${dir * 8}deg)`, offset: 0.55 }, { transform: 'translateX(0) rotate(0)' }], { duration: Math.max(160, 330 / fx.speed) }); }
        else if (e.k === 'hit') {
          const p = P(dst); dst.el.classList.add('hurt'); setTimeout(() => dst.el.classList.remove('hurt'), 110);
          dst.elb.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${-dst.face * 9}px) scaleY(.94)` }, { transform: 'translateX(0)' }], { duration: 160 });
          spark(p.x, p.y, e.crit ? 14 : 6, e.crit ? '#ffd34d' : '#fff', e.crit ? 240 : 150);
          floatAt(dst, (e.crit ? 'CRIT ' : '') + e.dmg, e.crit ? 'crit' : e.tech && e.tech !== 'riposte' ? 'tech' : '');
          if (e.save) floatAt(dst, e.save + '!', 'tech');
          if (e.crit) { fx.freeze = Math.max(fx.freeze, 0.06); shake(5); fx.zoom = Math.max(fx.zoom, 0.025); } else if (e.dmg > dst.maxhp * 0.12) shake(2.5);
          U.snd(e.crit ? 'crit' : 'hit');
          logt(`${src.name} hits ${dst.name} for ${e.dmg}${e.crit ? ' (CRIT)' : ''}.`);
        } else if (e.k === 'miss') { floatAt(dst, e.inv ? 'IMMUNE' : 'DODGE', 'miss'); dst.elb.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${dst.face * 14}px)` }, { transform: 'translateX(0)' }], { duration: 220 }); U.snd('miss'); }
        else if (e.k === 'tech') { floatAt(src, D.TECHS[e.tech].n + '!', 'tech'); ring(P(src).x, P(src).y + sh * 0.3, 40, '#f5ead2'); U.snd('tech'); logt(`${src.name} uses ${D.TECHS[e.tech].n}!`); }
        else if (e.k === 'ult') { const U0 = D.ULTS[e.id]; ban(U0.n + '!', U0.c); fx.flash = 0.35; fx.zoom = Math.max(fx.zoom, 0.06); shake(6); U.snd('roar'); logt(`${src.name} unleashes ${U0.n}!`); ring(P(src).x, P(src).y + sh * 0.3, 90, U0.c, true); }
        else if (e.k === 'aoe') { const x = SX(e.x), y = SY(e.y); ring(x, y, mpx(e.r), e.c, e.big); dust(x, y, e.big ? 18 : 8); if (e.big) shake(e.meteor ? 12 : 7); if (e.meteor) { fx.flash = 0.5; spark(x, y, 30, '#ffb347', 320); U.snd('crit'); } }
        else if (e.k === 'tele') fx.teles.push({ x: SX(e.x), y: SY(e.y), r: mpx(e.r), life: e.t, max: e.t, c: e.c });
        else if (e.k === 'hook') { const a = P(src), b = P(dst); fx.lines.push({ pts: [[a.x, a.y], [b.x, b.y]], life: 0.5, max: 0.5, c: '#d9e4ee', w: 5, chain: 1, a: src, b: dst }); spark(b.x, b.y, 10, '#fff', 200); U.snd('hit'); }
        else if (e.k === 'proj') { const a = P(src), b = P(dst); const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; const far = e.long ? { x: a.x + (dx / l) * W, y: a.y + (dy / l) * W } : b; fx.lines.push({ pts: [[a.x, a.y], [far.x, far.y]], life: 0.25, max: 0.25, c: e.c || '#fff', w: e.long ? 7 : 4, proj: 1 }); }
        else if (e.k === 'zap') { lightning(P(src), P(dst)); U.snd('crit'); }
        else if (e.k === 'dash') { const p = P(src); dust(p.x, p.y + sh * 0.4, 10); }
        else if (e.k === 'heal') { floatAt(dst, '+' + e.amt, 'heal'); const p = P(dst); spark(p.x, p.y, 4, '#7dffb4', 70); }
        else if (e.k === 'revive') { floatAt(dst, 'REVIVE!', 'tech'); ring(P(dst).x, P(dst).y + sh * 0.3, 80, '#f6b82d', true); fx.flash = 0.3; }
        else if (e.k === 'rune') floatAt(src, e.id === 'grasp' ? 'GRASP' : e.id === 'electro' ? 'ELECTROCUTE' : 'PHASE RUSH', 'st');
        else if (e.k === 'status') { if (STL[e.st]) floatAt(dst, STL[e.st], 'st'); }
        else if (e.k === 'resist') floatAt(dst, 'RESIST', 'st');
        else if (e.k === 'bleed') floatAt(dst, '-' + e.dmg, e.fire ? 'tech' : 'miss');
        else if (e.k === 'thorn') floatAt(dst, e.dmg + ' thorns', 'miss');
        else if (e.k === 'down') { dst.el.classList.add('dead'); const f = el('fu-' + e.dst); if (f) f.classList.add('dead'); logt(`${dst.name} is down!`); if (!sp) { fx.slow = 0.9; fx.flash = 0.25; shake(9); const p = P(dst); spark(p.x, p.y, 24, '#fff', 260); U.snd('crit'); } }
        else if (e.k === 'roar') { ban('Crowd roars!'); U.snd('roar'); shake(4); const bg = cam.querySelector('.arena-bg'); if (bg) { bg.classList.add('roar'); setTimeout(() => bg.classList.remove('roar'), 1500); } logt(e.side === 'A' ? 'The crowd backs YOU!' : 'The crowd backs the underdog!'); }
      }

      function layout() {
        F.units.forEach((u) => {
          const p = { x: SX(u.x), y: SY(u.y) }; const depth = 0.84 + (0.3 * (u.y + R)) / (2 * R); const lift = u.z * (H * 0.05);
          u.el.style.transform = `translate(${p.x - sw / 2}px,${p.y - sh * 0.93}px) scale(${depth})`; u.el.style.zIndex = Math.round(p.y);
          u.elb.parentElement.style.setProperty('--lift', lift + 'px');
          const spin = u.s.spin ? (F.t * 900) % 360 : u.s.air ? Math.sin(F.t * 12) * 12 : 0;
          u.el.firstChild.style.transform = `scale(${Math.max(0.4, 1 - u.z * 0.12)})`;
          u.elb.style.marginTop = -lift + 'px';
          u.el.querySelector('.fsi').style.transform = `scaleX(${u.face}) rotate(${spin}deg)`;
          u.el.classList.toggle('walk', u.spdNow > 0.8 && !u.down); u.el.classList.toggle('winding', u.wind > 0);
          const hpf = u.hp / u.maxhp; u.elhp.style.width = hpf * 100 + '%'; u.elhp.style.background = hpf < 0.3 ? '#d2412b' : '#2a9d6f'; u.elsh.style.width = Math.min(100, (u.shield / u.maxhp) * 100) + '%';
          const hh = el('hp-' + u.id); if (hh) { hh.style.width = hpf * 100 + '%'; el('sh-' + u.id).style.width = Math.min(100, (u.shield / u.maxhp) * 100) + '%'; el('ht-' + u.id).textContent = Math.ceil(u.hp) + '/' + u.maxhp; }
          const key = Object.keys(u.s).filter((k) => STC[k]).join(','); if (key !== u.stKey) { u.stKey = key; u.elst.innerHTML = key.split(',').filter(Boolean).map((k) => `<i style="background:${STC[k]}" title="${k}"></i>`).join(''); }
          const stk = (u.stk.fr || 0) + (u.stk.lt || 0) + (u.stk.cq || 0); u.elstk.textContent = stk > 1 ? 'x' + stk : '';
          if (u.side === 'B') u.el.classList.toggle('focus', F.foc.A === u.id);
        });
        unitsA.forEach((u) => u.ults.forEach((c, k) => { const b = el(`ub-${u.id}-${k}`); if (!b) return; const ready = c.cd <= 0 && !u.down; b.classList.toggle('ready', ready); b.classList.toggle('dead', u.down); b.querySelector('.ubcd').style.background = ready ? 'transparent' : `conic-gradient(rgba(20,16,15,.72) ${(c.cd / c.max) * 360}deg, transparent 0)`; b.querySelector('.ubt').textContent = ready || u.down ? '' : Math.ceil(c.cd); }));
        $('#hype').style.width = Math.min(100, F.hype) + '%';
      }
      function drawFx(dt) {
        cx.clearRect(0, 0, W, H);
        fx.teles = fx.teles.filter((t) => (t.life -= dt) > 0); fx.teles.forEach((t) => { const k = 1 - t.life / t.max; cx.globalAlpha = 0.25 + 0.25 * Math.sin(k * 30); cx.fillStyle = '#d2412b'; cx.beginPath(); cx.ellipse(t.x, t.y, t.r, t.r * 0.62, 0, 0, 6.28); cx.fill(); cx.globalAlpha = 1; cx.strokeStyle = '#fff'; cx.lineWidth = 3; cx.beginPath(); cx.ellipse(t.x, t.y, t.r * (1 - k * 0.15), t.r * 0.62 * (1 - k * 0.15), 0, 0, 6.28); cx.stroke(); });
        fx.rings = fx.rings.filter((r) => (r.t -= dt) > 0); fx.rings.forEach((r) => { const k = 1 - r.t / r.life; cx.globalAlpha = 1 - k; cx.strokeStyle = r.c; cx.lineWidth = r.w; cx.beginPath(); cx.ellipse(r.x, r.y, 6 + (r.max - 6) * k, (6 + (r.max - 6) * k) * 0.62, 0, 0, 6.28); cx.stroke(); cx.globalAlpha = 1; });
        fx.lines = fx.lines.filter((l) => (l.life -= dt) > 0); fx.lines.forEach((l) => {
          const k = l.life / l.max; cx.globalAlpha = Math.min(1, k * 1.6); cx.strokeStyle = l.c; cx.lineWidth = l.w; cx.lineCap = 'round'; cx.lineJoin = 'round';
          if (l.chain) { const a = P(l.a), b = P(l.b); cx.setLineDash([9, 5]); cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b.x, b.y); cx.stroke(); cx.setLineDash([]); } else { cx.beginPath(); l.pts.forEach((p, i) => (i ? cx.lineTo(p[0], p[1]) : cx.moveTo(p[0], p[1]))); cx.stroke(); }
          cx.globalAlpha = 1;
        });
        fx.parts = fx.parts.filter((p) => (p.life -= dt) > 0); fx.parts.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; cx.globalAlpha = Math.max(0, p.life / p.max); cx.fillStyle = p.c; cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 6.28); cx.fill(); }); cx.globalAlpha = 1;
      }

      let last = performance.now(); let acc = 0; let finished = false; let introDone = false; let countN = 4;
      const STEP = 1 / 60;
      function end() {
        if (finished) return; finished = true; const win = F.winner === 'A'; ban(win ? 'Victory!' : 'Defeat', win ? '#f6b82d' : '#d2412b'); U.snd(win ? 'win' : 'lose');
        if (win) for (let i = 0; i < 70; i++) fx.parts.push({ x: Math.random() * W, y: -10 - Math.random() * 60, vx: (Math.random() - 0.5) * 60, vy: 60 + Math.random() * 120, life: 2.2, max: 2.2, c: ['#f6b82d', '#d2412b', '#2f78c4', '#f5ead2'][i % 4], r: 3 + Math.random() * 3, g: 30 });
        const hpf = {}; unitsA.forEach((u) => { hpf[u.g.id] = u.hp / u.maxhp; });
        const tick = (t) => { if (fx.over) return; const dt = Math.min(0.05, (t - last) / 1000); last = t; drawFx(dt); layout(); if (!fx.over) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
        setTimeout(() => { fx.over = true; root.innerHTML = ''; U.fight = null; resolve({ win, hype: Math.max(F.peak, F.hype), hpf, odds, F, stB }); }, 1900);
      }
      function frame(now) {
        if (finished) return;
        const real = Math.min(0.1, (now - last) / 1000); last = now;
        if (fx.intro > 0) { fx.intro -= real; const n = Math.ceil(fx.intro / 0.4); if (n !== countN && n > 0 && n <= 3) { countN = n; ban(String(n)); U.snd('click'); } if (fx.intro <= 0) { ban('FIGHT!', '#f6b82d'); U.snd('roar'); introDone = true; } }
        else {
          let dt = real; if (fx.freeze > 0) { fx.freeze -= real; dt = 0; } if (fx.slow > 0) { fx.slow -= real; dt *= 0.3; }
          if (fx.skip) { let n = 0; while (!F.done && n++ < 6000) L.step(F, 0.1); } else { acc += dt * fx.speed; let n = 0; while (acc >= STEP && !F.done && n++ < 12) { L.step(F, STEP); acc -= STEP; } }
        }
        F.ev.splice(0).forEach(handle);
        drawFx(real); layout();
        if (fx.shake > 0.1 || fx.zoom > 0.002 || fx.flash > 0) { const s = fx.shake; cam.style.transform = `translate(${(Math.random() - 0.5) * s}px,${(Math.random() - 0.5) * s}px) scale(${1 + fx.zoom})`; fx.shake *= 0.86; fx.zoom *= 0.9; const fl = el('fflash'); if (fl) { fl.style.opacity = fx.flash; fx.flash = Math.max(0, fx.flash - real * 1.6); } } else cam.style.transform = '';
        if (F.done) { end(); return; }
        requestAnimationFrame(frame);
      }
      if (!S.flags.ultHint) { S.flags.ultHint = 1; setTimeout(() => U.toast('Tap the glowing ULTIMATE buttons. Tap an enemy to focus it.'), 1700); }
      layout(); requestAnimationFrame((t) => { last = t; frame(t); });
    });
  }

  ACT.fult = (el) => {
    const fx = U.fight; if (!fx || fx.intro > 0) return; const r = L.useUlt(fx.F, el.dataset.u, +el.dataset.k);
    if (r === 'range') U.toast('Too far! Get closer or tap a nearer enemy.'); else if (!r) U.snd('miss');
  };
  ACT.ffocus = (el) => { const fx = U.fight; if (!fx) return; L.focus(fx.F, 'A', el.dataset.id); U.snd('click'); };
  ACT.fspeed = (el) => { const fx = U.fight; if (!fx) return; fx.speed = +el.dataset.v; document.querySelectorAll('.f-speed [data-a=fspeed]').forEach((b) => b.classList.toggle('on', b === el)); };
  ACT.fauto = (el) => { const fx = U.fight; if (!fx) return; fx.F.auto.A = !fx.F.auto.A; U.S().flags.auto = fx.F.auto.A; el.classList.toggle('on', fx.F.auto.A); };
  ACT.fskip = () => { const fx = U.fight; if (fx && fx.intro <= 0) fx.skip = true; };
  G.LMFIGHT = { run };
})(typeof globalThis !== 'undefined' ? globalThis : this);
