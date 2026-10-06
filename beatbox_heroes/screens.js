// BEATBOX HEROES -- screens.js: boot, title, slot select, intro story.
(function (root) {
  'use strict';
  const BBH = root.BBH, E = BBH.E, Core = BBH.Core, CAT = BBH.CATALOG, PAL = BBH.PAL;
  const G = BBH.G = BBH.G || {};
  const h = E.h, K = E.K, k = (n) => Math.round(n * K), CX = E.W / 2;

  const scene = (name, def) => { E.scenes[name] = def; return def; };
  const safeScene = (id, v) => { try { return BBH.World.scene(id, v); } catch (e) { console.warn('scene ' + id, e); return null; } };

  /* ------------------------------------------------------------------ boot */
  scene('boot', {
    enter() {
      this.p = 0; this.msg = 'LOADING';
      const jobs = [
        ['title', () => safeScene('title')], ['logo', () => BBH.World.logo()], ['creator', () => safeScene('creator')], ['street', () => safeScene('street', 'night')],
        ['home', () => safeScene('home', 'day')], ['icons', () => ['energy', 'food', 'mood', 'coin', 'fans', 'level'].forEach((n) => E.icon(n))],
      ];
      let i = 0; const step = () => {
        if (i >= jobs.length) { setTimeout(() => E.go('title'), 150); return; }
        this.msg = jobs[i][0].toUpperCase();
        try { jobs[i][1](); } catch (e) { E.fatal(e); return; }
        i++; this.p = i / jobs.length; setTimeout(step, 16);
      };
      setTimeout(step, 60);
    },
    draw(c) {
      c.fillStyle = PAL.night0; c.fillRect(0, 0, E.W, E.H);
      E.txt(c, 'BEATBOX HEROES', CX, k(200), { align: 'c', color: PAL.gold, scale: 2, shadow: PAL.ink });
      c.fillStyle = PAL.ink; c.fillRect(k(55), k(262), k(160), 10); c.fillStyle = PAL.neonPink; c.fillRect(k(55) + 1, k(262) + 1, Math.round((k(160) - 2) * this.p), 8);
      c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(k(55) + 1, k(262) + 1, Math.round((k(160) - 2) * this.p), 1);
      E.txt(c, 'LOADING ' + this.msg, CX, k(282), { align: 'c', color: PAL.fog });
    },
  });

  /* ----------------------------------------------------------------- title */
  const cast = () => {
    // the street party at the bottom of the title: your last hero (or a random one) with friends
    let hero = null;
    try { const l = Core.Save.list(E.store).filter(Boolean).sort((a, b) => (b.created || 0) - (a.created || 0))[0]; if (l) hero = l.look; } catch (e) { /* ignore */ }
    if (!hero) hero = BBH.Chars.random(BBH.rng(Date.now() % 9999));
    return [{ look: BBH.Chars.fix(NPC('foxy')), x: k(74), pose: 'dance', dy: 8, flip: false }, { look: BBH.Chars.fix(hero), x: k(135), pose: 'beatbox', dy: 0 }, { look: BBH.Chars.fix(NPC('beeamgee')), x: k(196), pose: 'idle', dy: 8, flip: true }];
  };
  const NPC = (id) => Core.NPCS[id].look;

  scene('title', {
    enter() {
      this.bg = safeScene('title'); this.logo = BBH.World.logo(); this.state = 'tap'; this.cast = cast(); this.drop = 0;
      this.build = () => {
        E.clearUI();
        if (this.state === 'tap') {
          const veil = h('div.full', { style: { zIndex: 5 } }, h('div.tp.blink', { style: { position: 'absolute', left: 0, right: 0, bottom: '64px', textAlign: 'center', color: 'var(--cream)', fontSize: '8px' } }, 'TAP TO START'));
          veil.addEventListener('click', () => { this.state = 'menu'; E.unlockAudio(); E.applyAudioSettings(); E.music('title'); E.sfx('confirm'); this.build(); });
          E.add(veil); return;
        }
        const saves = Core.Save.list(E.store), any = saves.some(Boolean);
        const col = h('div.col.fadein', { style: { position: 'absolute', left: '50px', right: '50px', bottom: '34px', gap: '6px', zIndex: 5 } },
          any ? E.btn('CONTINUE', 'gold big', () => E.go('slots', { mode: 'continue' })) : null,
          E.btn('NEW GAME', any ? 'pink big' : 'gold big', () => E.go('slots', { mode: 'new' })),
          h('div.row', null, E.btn('SETTINGS', 'grow', () => G.openSettings()), E.btn(E.settings.muted ? 'SOUND OFF' : 'SOUND ON', 'grow', function () { E.settings.muted = !E.settings.muted; E.applyAudioSettings(); E.saveSettings(); this.textContent = E.settings.muted ? 'SOUND OFF' : 'SOUND ON'; })));
        E.add(col);
        E.add(h('div.tp.dim', { style: { position: 'absolute', left: 0, right: 0, bottom: '6px', textAlign: 'center', color: PAL.fog, fontSize: '5px' } }, 'ROXORLOOPS & JASMIN'));
      };
      this.build();
    },
    draw(c) {
      const t = E.t;
      if (this.bg) this.bg.layers[0].pix.draw(c, 0, 0); else { c.fillStyle = PAL.night1; c.fillRect(0, 0, E.W, E.H); }
      const beat = E.beat(), pulse = 0.5 + 0.5 * Math.cos((beat % 1) * Math.PI * 2);
      // neon flicker glows from the scene's lights
      if (this.bg) for (const l of this.bg.lights || []) { const fl = l.flicker ? 0.75 + 0.25 * Math.sin(t / 90 + l.x) * (Math.sin(t / 700 + l.y) > 0.7 ? 0.2 : 1) : 1; E.drawGlow(c, l.x, l.y, l.r, l.color, (l.a === undefined ? 0.6 : l.a) * fl); }
      // the street party
      for (const m of this.cast) E.hero(c, m.look, m.pose, m.x, k(392) + m.dy, { flip: m.flip, t: t + m.x * 7 });
      E.rain(c, t, { n: 90, color: 'rgba(160,190,255,.35)' });
      // logo drops in with a bounce and breathes with the beat
      this.drop = Math.min(1, this.drop + E.dt / 800);
      const e = this.drop, bounce = e < 1 ? -Math.abs(Math.cos(e * 7)) * (1 - e) * 38 : 0, y = Math.round(-95 + 160 * Math.min(1, e * 1.6) + bounce + (e >= 1 ? Math.sin(t / 600) * 2 : 0));
      if (this.logo) { const lx = Math.round((E.W - this.logo.w) / 2); E.drawGlow(c, CX, y + this.logo.h / 2, 160, PAL.neonViolet, 0.18 + pulse * 0.12); this.logo.draw(c, lx, y); }
      if (this.state === 'menu') E.txt(c, 'A BEATBOX LIFE-SIM', CX, y + (this.logo ? this.logo.h : 60) + 4, { align: 'c', color: PAL.fog });
    },
  });

  /* ----------------------------------------------------------------- slots */
  scene('slots', {
    enter(a) {
      this.mode = a.mode || 'continue'; this.bg = safeScene('title');
      const saves = Core.Save.list(E.store);
      const card = (i) => {
        const ch = saves[i - 1];
        const left = ch ? E.pixEl(BBH.Chars.portrait(BBH.Chars.fix(ch.look), 'happy'), 1) : h('div', { style: { width: '56px', height: '56px', background: 'var(--n0)', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, E.iconEl('star', 2, { opacity: 0.3 }));
        const info = ch ? h('div.col.grow', { style: { gap: '3px' } }, h('div.h2', null, ch.name), h('div.ts', null, 'Level ' + ch.level + '  Day ' + ch.day), h('div.ts', null, '$' + ch.cash + '  ' + ch.fans + ' fans'), h('div.ts', null, Object.keys(ch.ach).length + '/20 achievements'))
          : h('div.col.grow', null, h('div.h2', { style: { color: 'var(--cream)' } }, 'EMPTY SLOT'), h('div.ts', null, 'Create a new hero'));
        const el = h('div.panel', { style: { position: 'relative', height: '70px', padding: '7px', cursor: 'pointer' } }, h('div.row', { style: { gap: '8px' } }, left, info));
        el.addEventListener('click', () => {
          E.sfx('click');
          if (ch) {
            E.modal({ title: ch.name.toUpperCase(), body: h('div.ts.ctr', null, 'Level ' + ch.level + ', day ' + ch.day), top: '170px', buttons: [{ label: 'PLAY', cls: 'gold', fn: () => G.startSlot(i, ch) }, { label: 'DELETE', cls: 'red', fn: () => E.modal({ title: 'DELETE?', body: 'This hero will be gone for good.', buttons: [{ label: 'KEEP' }, { label: 'DELETE', cls: 'red', fn: () => { Core.Save.remove(E.store, i); E.go('slots', { mode: this.mode }, { nofade: true }); } }] }) }, { label: 'BACK' }] });
          } else E.go('creator', { mode: 'new', slot: i });
        });
        return el;
      };
      E.add(h('div.col', { style: { position: 'absolute', left: '12px', right: '12px', top: '70px', gap: '10px' } }, h('div.h1.ctr', null, this.mode === 'new' ? 'CHOOSE A SLOT' : 'SELECT HERO'), card(1), card(2), card(3)));
      E.add(E.btn('BACK', '', () => E.go('title'), { position: 'absolute', left: '12px', bottom: '12px', width: '60px' }));
    },
    draw(c) { c.fillStyle = PAL.night0; c.fillRect(0, 0, E.W, E.H); if (this.bg) { c.globalAlpha = 0.5; this.bg.layers[0].pix.draw(c, 0, 0); c.globalAlpha = 1; } c.fillStyle = 'rgba(18,13,31,.6)'; c.fillRect(0, 0, E.W, E.H); E.rain(c, E.t, { n: 40 }); },
  });

  /* ----------------------------------------------------------------- intro */
  const INTRO = [
    "Tuesday, 5:12 pm. You work in an office. Today your boss says: 'You are fired.' You leave with a box, a plant and $40.",
    "You walk home in the rain. You have one special skill: you are a beatboxer. You make drum sounds with your mouth.",
    "You live with your roommate Foxy. Rent is $60 every Sunday. You are out of work, so you need money fast.",
    "Foxy has an idea: 'Go busk in the park. Play beats for the people walking by. Tips pay rent, and every listener can become a fan.'",
    "That night you practise your first beats. They are bad. But the better your timing, the more money and fans you earn.",
    "The next day in the park, an old beatboxer called BeeAmGee watches you. He offers to coach you for free.",
    "Your plan: busk in the park, play open mics at the bar, win beatbox battles, and enter the Beatbox Heroes World Cup.",
  ];
  scene('intro', {
    enter(a) {
      this.next = a.next; this.i = -1; this.plates = []; this.fadeIn = 0; this.finished = false;
      for (let i = 1; i <= 6; i++) this.plates.push(safeScene('intro' + i)); this.plates.push(this.plates[5]);
      E.music('intro');
      this.box = h('div.panel', { style: { left: '8px', right: '8px', bottom: '14px', height: '120px', padding: '10px', zIndex: 10 } });
      this.txt = h('div.t', { style: { fontSize: '8px', lineHeight: '12px', height: '84px', overflow: 'hidden', color: PAL.cream } });
      this.hint = h('div.tp.blink.gold', { style: { position: 'absolute', right: '8px', bottom: '5px' } }, 'TAP >');
      this.box.append(this.txt, this.hint);
      this.skip = E.btn('SKIP', '', () => this.end(), { position: 'absolute', right: '8px', top: '8px', width: '44px', zIndex: 11 });
      E.add(this.box); E.add(this.skip);
      this.box.addEventListener('click', () => this.advance());
      this.advance();
    },
    advance() {
      if (this.finished) return;
      if (this.typing && this.shown < this.full.length) { this.shown = this.full.length; this.txt.textContent = this.full; clearInterval(this.timer); this.typing = false; return; }
      this.i++; if (this.i >= INTRO.length) { this.end(); return; }
      E.sfx('click'); this.prev = this.i > 0 ? this.plates[this.i - 1] : null; this.fadeIn = this.plates[this.i] === this.prev ? 1 : 0;
      this.full = INTRO[this.i]; this.shown = 0; this.typing = true; clearInterval(this.timer);
      this.timer = setInterval(() => { this.shown++; this.txt.textContent = this.full.slice(0, this.shown); if (this.shown % 3 === 1) E.sfx('click', { quiet: true, pitch: 1.5 }); if (this.shown >= this.full.length) { clearInterval(this.timer); this.typing = false; } }, 28);
    },
    end() {
      if (this.finished) return; this.finished = true; clearInterval(this.timer);
      const ch = G.ch; ch.flags.intro = 1; G.setChar(ch); G.flush();
      const first = this.next === 'new';
      E.fadeTo(1, 500);
      setTimeout(() => {
        E.clearUI(); this.card = true; this.cardT = 0;
        E.fadeTo(0, 500); E.music('street', { fade: 1 });
        setTimeout(() => { if (first) E.go('street', { tutorial: true }); else G.resume(); }, first ? 2600 : 50);
      }, 520);
    },
    leave() { clearInterval(this.timer); },
    draw(c) {
      c.fillStyle = PAL.ink; c.fillRect(0, 0, E.W, E.H);
      if (this.card) { this.cardT += E.dt; const lg = BBH.World.logo(); c.fillStyle = PAL.night0; c.fillRect(0, 0, E.W, E.H); E.drawGlow(c, CX, k(220), 170, PAL.neonViolet, 0.25); lg.draw(c, Math.round((E.W - lg.w) / 2), k(170)); E.txt(c, 'BUSK. BATTLE. BECOME CHAMPION.', CX, k(170) + lg.h + 16, { align: 'c', color: PAL.cream }); return; }
      this.fadeIn = Math.min(1, this.fadeIn + E.dt / 900);
      const y = k(56), PH = 360, plate = this.plates[Math.max(0, this.i)], prev = this.prev;
      c.fillStyle = PAL.night0; c.fillRect(0, y - 8, E.W, PH + 16);
      if (prev && this.fadeIn < 1) prev.layers[0].pix.draw(c, 0, y);
      if (plate) { c.save(); c.globalAlpha = this.fadeIn; plate.layers[0].pix.draw(c, 0, y); c.restore(); for (const l of plate.lights || []) E.drawGlow(c, l.x, l.y + y, l.r, l.color, (l.a || 0.5) * this.fadeIn * (l.flicker ? 0.8 + 0.2 * Math.sin(E.t / 110 + l.x) : 1)); }
      // letterbox bars and rain
      c.fillStyle = PAL.ink; c.fillRect(0, y - 8, E.W, 8); c.fillRect(0, y + PH, E.W, 8);
      c.save(); c.beginPath(); c.rect(0, y, E.W, PH); c.clip(); c.translate(0, y); if (this.i === 1 || this.i === 0) E.rain(c, E.t, { n: 90, h: PH, color: 'rgba(170,200,255,.4)' }); c.restore();
      E.txt(c, (Math.max(0, this.i) + 1) + '/' + INTRO.length, 12, k(24), { color: PAL.fog });
    },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
