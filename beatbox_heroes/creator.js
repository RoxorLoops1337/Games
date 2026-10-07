// BEATBOX HEROES -- creator.js: the character creator / wardrobe.
// A spotlit turntable with a 4x hero, tabbed pickers underneath. Locked items can be PREVIEWED (they show what
// you are working towards) but are removed when you confirm.
(function (root) {
  'use strict';
  const BBH = root.BBH, E = BBH.E, Core = BBH.Core, CAT = BBH.CATALOG, PAL = BBH.PAL;
  const G = BBH.G = BBH.G || {};
  const h = E.h, C = () => BBH.Chars, K = E.K, k = (n) => Math.round(n * K);

  const POSES = ['idle', 'beatbox', 'dance', 'cheer', 'point', 'battle'];
  const TABS = [
    ['body', 'fans', 'BODY'], ['skin', 'palette', 'SKIN'], ['hair', 'wand', 'HAIR'], ['face', 'mood', 'FACE'], ['top', 'shirt', 'TOPS'],
    ['bottom', 'pants', 'PANTS'], ['shoes', 'shoe', 'SHOES'], ['hat', 'hat', 'HATS'], ['glasses', 'glasses', 'SHADES'], ['extra', 'star', 'EXTRAS'],
  ];
  const SKIN_UI_LEVEL = Core.CFG.cosmeticAnyColourLevel;

  E.scenes.creator = {
    enter(a) {
      this.mode = a.mode || 'new'; this.slot = a.slot || 1; this.back = a.back || null;
      this.bg = BBH.World.scene('creator'); const sp0 = (this.bg && this.bg.spots && this.bg.spots.hero) || { x: 180, y: 536 }; this.dy = sp0.y - k(280); this.spot = { x: sp0.x, y: k(280) };
      this.look = C().fix(this.mode === 'wardrobe' ? G.ch.look : (G.draft || CAT.DEFAULT_LOOK));
      if (this.mode === 'new' && !G.draft) this.look.name = '';
      this.ch = this.mode === 'wardrobe' ? G.ch : Core.newChar(this.look);
      this.tab = a.tab || 'body'; this.pose = 'idle'; this.hop = 0; this.ringT = 0; this.rings = []; this.previewing = {};
      E.music('creator');
      this.build();
    },
    leave() { if (this.mode === 'new') G.draft = this.look; },
    isOpen(group, id) { return Core.isUnlocked(this.ch, group, id); },
    changed(sparkle) {
      this.hop = 1; E.sfx('equip');
      if (sparkle !== false) { const sp = E.fxSprite('spark'); E.burst(this.spot.x, this.spot.y - 120, 10, { colors: [PAL.neonCyan, PAL.neonPink, PAL.gold, '#fff'], speed: 70, up: 20, gravity: 60, spr: Array.isArray(sp) ? null : sp, life: 500 }); }
    },
    // ----------------------------------------------------------------- UI
    build() {
      E.clearUI();
      const wd = this.mode === 'wardrobe';
      this.nameInp = h('input', { type: 'text', maxlength: 12, placeholder: 'NAME', value: this.look.name || '' });
      this.nameInp.addEventListener('input', () => { this.look.name = this.nameInp.value.replace(/[^\w \-'.!]/g, ''); });
      E.add(h('div.row', { style: { position: 'absolute', left: '6px', right: '6px', top: '6px', gap: '4px', zIndex: 5 } },
        E.btn('<', '', () => this.exit(), { width: '22px' }), h('div.grow', null, this.nameInp),
        E.btn('', 'cyan', () => this.randomize(), { width: '24px', padding: '3px 0 2px' }).appendChild(E.iconEl('dice', 1, { display: 'block', margin: '0 auto' })).parentNode,
        E.btn(wd ? 'SAVE' : 'GO!', 'gold', () => this.confirm(), { width: '38px' })));
      this.hint = h('div.tp', { style: { position: 'absolute', left: 0, right: 0, top: '34px', textAlign: 'center', color: PAL.fog, fontSize: '5px', zIndex: 4 } }, 'TAP YOUR HERO TO CHANGE POSE');
      E.add(this.hint);
      this.tabsEl = h('div.tabs', { style: { position: 'absolute', left: '0', right: '0', top: '-22px' } });
      this.content = h('div.scroll', { style: { position: 'absolute', left: '6px', right: '6px', top: '4px', bottom: '4px' } });
      this.panel = h('div.panel.sheet', { style: { height: '178px', padding: 0 } }, this.tabsEl, this.content);
      E.add(this.panel);
      this.renderTabs(); this.renderTab();
    },
    renderTabs() {
      this.tabsEl.innerHTML = '';
      for (const [id, icon, label] of TABS) {
        const t = h('div.tab' + (this.tab === id ? '.on' : ''), { title: label }, E.iconEl(icon, 1));
        t.addEventListener('click', () => { this.tab = id; E.sfx('click'); this.renderTabs(); this.renderTab(); });
        this.tabsEl.appendChild(t);
      }
    },
    head(text, extra) { return h('div.row', { style: { margin: '5px 0 3px', justifyContent: 'space-between' } }, h('div.tp.cyan', null, text), extra || null); },
    // tile grid: items from a catalog group; sel(id) true if chosen; pick(id)
    tiles(group, items, sel, pick, thumbGroup, look) {
      const grid = h('div.grid');
      for (const it of items) {
        const open = this.isOpen(group, it.id), on = sel(it.id);
        let pix = null; try { pix = C().thumb(thumbGroup || group, it.id, look || this.look); } catch (e) { pix = null; }
        const price = !open && it.unlock.t === 'shop' ? '$' + it.unlock.price : '';
        const tile = h('div.tile' + (on ? '.on' : '') + (open ? '' : '.lock'), { title: it.name },
          pix ? E.pixEl(pix, 1) : h('div.tp', null, it.name.slice(0, 3)),
          open ? null : h('div.lk', null, E.iconEl('lock', 1)), price ? h('div.pr', null, price) : null);
        tile.addEventListener('click', () => {
          if (!open) { E.toast(it.name + ': ' + Core.unlockText(it.unlock), 'warn'); E.sfx('error'); this.previewing[group + ':' + it.id] = 1; }
          pick(it.id); this.changed(open); this.renderTab(true);
        });
        grid.appendChild(tile);
      }
      return grid;
    },
    chips(group, items, sel, pick) {                              // text chips for small sets
      const g = h('div.grid');
      for (const it of items) {
        const open = this.isOpen(group, it.id);
        const b = h('div.btn' + (sel(it.id) ? '.gold' : '') + (open ? '' : '.dis'), { style: { padding: '4px 5px 5px', fontSize: '6px' } }, it.name.toUpperCase());
        b.addEventListener('click', () => { if (!open) { E.toast(it.name + ': ' + Core.unlockText(it.unlock), 'warn'); E.sfx('error'); } pick(it.id); this.changed(false); this.renderTab(true); });
        g.appendChild(b);
      }
      return g;
    },
    swatches(colors, current, pick, o) {
      o = o || {}; const g = h('div.grid', { style: { marginTop: '2px' } });
      const cur = String(current || '').toLowerCase();
      colors.forEach((c) => {
        const col = typeof c === 'string' ? c : c.color, locked = o.locked && o.locked(c);
        const sw = h('div.sw' + (cur === col.toLowerCase() ? '.on' : '') + (locked ? '.lock' : ''), { style: { background: col }, title: c.name || '' });
        sw.addEventListener('click', () => { if (locked) { E.toast((c.name || col) + ': ' + Core.unlockText(c.unlock), 'warn'); E.sfx('error'); } pick(col, c); this.changed(!locked); this.renderTab(true); });
        g.appendChild(sw);
      });
      if (o.custom !== false) {
        const gated = o.customGate && !o.customGate();
        const inp = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(cur) ? cur : '#888888', title: 'Any colour' });
        if (gated) { inp.disabled = true; inp.style.opacity = '0.35'; }
        inp.addEventListener('input', () => { pick(inp.value, null); this.hop = 0.5; });
        inp.addEventListener('change', () => { this.changed(false); this.renderTab(true); });
        const wrap = h('div', { style: { position: 'relative', width: '16px', height: '16px', flex: 'none', background: 'conic-gradient(#f33,#fd3,#3f6,#3df,#85f,#f3c,#f33)', boxShadow: '0 0 0 1px var(--ink)' } }, inp);
        inp.style.opacity = gated ? '0.2' : '0.01'; inp.style.position = 'absolute'; inp.style.inset = '0'; inp.style.width = '16px'; inp.style.height = '16px';
        if (gated) { wrap.addEventListener('click', () => E.toast('Any-colour wheel: reach level ' + SKIN_UI_LEVEL, 'warn')); wrap.appendChild(E.iconEl('lock', 1, { position: 'absolute', left: '2px', top: '2px' })); }
        g.appendChild(wrap);
      }
      return g;
    },
    renderTab(keepScroll) {
      const st = keepScroll ? this.content.scrollTop : 0, L = this.look, el = this.content; el.innerHTML = '';
      const set = (fn) => () => { fn(); };
      const T = this.tab;
      if (T === 'body') {
        const row = h('div.row', { style: { justifyContent: 'center', gap: '6px', marginTop: '6px' } });
        for (const b of CAT.BODIES) {
          const l2 = C().fix(Object.assign({}, L, { body: b.id })); const pix = C().render(l2, 'idle', 0, { frame: 0 });
          const t = h('div.tile' + (L.body === b.id ? '.on' : ''), { style: { width: '56px', height: '78px', flexDirection: 'column', gap: '2px' } }, E.pixEl(pix, 1), h('div.tp', { style: { fontSize: '5px' } }, b.name.toUpperCase()));
          t.addEventListener('click', () => { L.body = b.id; this.changed(); this.renderTab(true); }); row.appendChild(t);
        }
        el.append(row, h('div.ts.ctr', { style: { marginTop: '8px' } }, 'Boy, girl or neutral. Mix any look with any body.'), h('div.ts.ctr', { style: { marginTop: '6px' } }, this.mode === 'new' ? 'Most extras unlock as you play. Locked items can be previewed here.' : 'Items you own are shown here. Locked ones can be previewed.'));
        const pr = h('div.row', { style: { marginTop: '8px', justifyContent: 'center', flexWrap: 'wrap' } });
        POSES.forEach((p) => pr.appendChild(E.btn(p.toUpperCase(), this.pose === p ? 'gold' : '', () => { this.pose = p; this.hop = 1; this.renderTab(true); }, { fontSize: '5px', padding: '3px 4px 4px' })));
        el.appendChild(pr);
      } else if (T === 'skin') {
        el.appendChild(this.head('SKIN TONE'));
        el.appendChild(this.swatches(CAT.SKINS, L.skin, (c) => { L.skin = c; }, { custom: false }));
        el.appendChild(this.head('FANTASY'));
        el.appendChild(this.swatches(CAT.SKINS_FANTASY, L.skin, (c, it) => { L.skin = c; if (it && !this.isOpen('skin', it.id)) this.previewing['skin:' + it.id] = 1; }, { locked: (c) => !this.isOpen('skin', c.id), custom: false }));
        el.appendChild(this.head('FINE TUNE'));
        const [hh, ss, ll] = BBH.toHsl(L.skin);
        const mk = (label, min, max, val, track, on) => {
          const inp = h('input', { type: 'range', min, max, step: 1, value: Math.round(val) }); inp.style.setProperty('--track', track);
          inp.addEventListener('input', () => { on(parseFloat(inp.value)); this.hop = 0.4; });
          return h('div.row', null, h('div.tp', { style: { width: '44px' } }, label), h('div.grow', null, inp));
        };
        const cur = { h: hh, s: ss * 100, l: ll * 100 }; const apply = () => { L.skin = BBH.hsl(cur.h, cur.s / 100, cur.l / 100); };
        el.appendChild(h('div.col', { style: { gap: '5px', marginTop: '2px' } },
          mk('LIGHT', 8, 94, cur.l, 'linear-gradient(90deg,#1c120e,#7a4a2a,#d9a46e,#fde7d9)', (v) => { cur.l = v; apply(); }),
          mk('WARMTH', 0, 50, Math.max(0, Math.min(50, cur.h)), 'linear-gradient(90deg,#d4806e,#d99a6e,#d9b46e,#d6c070)', (v) => { cur.h = v; apply(); }),
          mk('RICHNESS', 10, 90, cur.s, 'linear-gradient(90deg,#9a8e86,#b98a52,#d9822e)', (v) => { cur.s = v; apply(); })));
        const anyOk = this.ch.level >= SKIN_UI_LEVEL || this.ch.dev.unlockAll;
        el.appendChild(this.head('ANY COLOUR' + (anyOk ? '' : ' (LV ' + SKIN_UI_LEVEL + ')')));
        el.appendChild(this.swatches([], L.skin, (c) => { L.skin = c; }, { customGate: () => anyOk }));
      } else if (T === 'hair') {
        el.appendChild(this.head('STYLE'));
        el.appendChild(this.tiles('hairStyle', CAT.HAIR_STYLES, (id) => L.hair.style === id, (id) => { L.hair.style = id; }));
        el.appendChild(this.head('COLOUR'));
        const anyOk = this.ch.level >= SKIN_UI_LEVEL || this.ch.dev.unlockAll;
        el.appendChild(this.swatches(CAT.HAIR_COLORS, L.hair.color, (c, it) => { L.hair.color = c; if (it && !this.isOpen('hairColor', it.id)) this.previewing['hairColor:' + it.id] = 1; }, { locked: (c) => !this.isOpen('hairColor', c.id), customGate: () => anyOk }));
        el.appendChild(this.head('DYED TIPS', E.btn(L.hair.tip ? 'ON' : 'OFF', L.hair.tip ? 'green' : '', () => { L.hair.tip = L.hair.tip ? null : '#ff3ea5'; this.changed(); this.renderTab(true); }, { fontSize: '5px', padding: '3px 5px' })));
        if (L.hair.tip) el.appendChild(this.swatches(CAT.HAIR_COLORS.filter((c) => this.isOpen('hairColor', c.id)), L.hair.tip, (c) => { L.hair.tip = c; }, {}));
      } else if (T === 'face') {
        el.appendChild(this.head('EYES'));
        el.appendChild(this.tiles('eyeStyle', CAT.EYE_STYLES, (id) => L.eyes.style === id, (id) => { L.eyes.style = id; }));
        el.appendChild(this.head('EYE COLOUR'));
        el.appendChild(this.swatches(CAT.EYE_COLORS, L.eyes.color, (c) => { L.eyes.color = c; }));
        el.appendChild(this.head('BROWS'));
        el.appendChild(this.tiles('brows', CAT.BROWS, (id) => L.brows === id, (id) => { L.brows = id; }));
        el.appendChild(this.head('FACIAL HAIR'));
        el.appendChild(this.tiles('facial', CAT.FACIAL, (id) => L.facial === id, (id) => { L.facial = id; }));
        el.appendChild(this.head('FACE MARKS'));
        el.appendChild(this.tiles('marks', CAT.MARKS, (id) => L.marks.includes(id), (id) => { L.marks = L.marks.includes(id) ? L.marks.filter((m) => m !== id) : L.marks.concat(id); }));
      } else if (T === 'top' || T === 'bottom' || T === 'shoes' || T === 'hat' || T === 'glasses') {
        const grp = { top: 'TOPS', bottom: 'BOTTOMS', shoes: 'SHOES', hat: 'HAT', glasses: 'GLASSES' }[T];
        const arr = CAT.GROUPS[T], slot = L[T];
        el.appendChild(this.head({ top: 'TOPS', bottom: 'PANTS', shoes: 'SHOES', hat: 'HEADWEAR', glasses: 'SHADES' }[T]));
        el.appendChild(this.tiles(T, arr, (id) => slot.id === id, (id) => { slot.id = id; }));
        const noColor = (T === 'hat' && slot.id === 'none') || (T === 'glasses' && slot.id === 'none');
        if (!noColor) {
          el.appendChild(this.head(T === 'glasses' ? 'FRAME COLOUR' : 'COLOUR'));
          el.appendChild(this.swatches(CAT.OUTFIT_COLORS, slot.color, (c) => { slot.color = c; }));
          if (T === 'top') { el.appendChild(this.head('ACCENT')); el.appendChild(this.swatches(CAT.OUTFIT_COLORS, slot.color2, (c) => { slot.color2 = c; })); }
        }
        void grp;
      } else if (T === 'extra') {
        const names = { neck: 'NECK', ears: 'EARS', back: 'BACK', hand: 'HAND', wrist: 'WRIST' };
        for (const s of CAT.ACC_SLOTS) {
          el.appendChild(this.head(names[s]));
          const items = CAT.ACCESSORIES.filter((a) => a.slot === s);
          el.appendChild(this.tiles('acc', items, (id) => L.acc[s].id === id, (id) => { L.acc[s].id = id; }));
          if (!/^none_/.test(L.acc[s].id)) el.appendChild(this.swatches(CAT.OUTFIT_COLORS, L.acc[s].color, (c) => { L.acc[s].color = c; }));
        }
      }
      el.scrollTop = st;
    },
    randomize() {
      const l = C().random(BBH.rng(Math.floor(Math.random() * 1e9)), (g, id) => this.isOpen(g, id));
      l.name = this.look.name; this.look = C().fix(l); this.previewing = {}; this.changed(); E.flash('#ffffff', 100); this.renderTab();
    },
    // ------------------------------------------------------------- finishing
    confirm() {
      const name = (this.look.name || '').trim();
      if (!name) { E.toast('Give your hero a name!', 'warn'); E.sfx('error'); this.nameInp.focus(); return; }
      this.look.name = name;
      const clean = Core.sanitizeLook(this.ch, this.look), stripped = JSON.stringify(clean) !== JSON.stringify(Core.sanitizeLook(Object.assign({}, this.ch, { dev: { unlockAll: true } }), this.look));
      if (stripped) E.toast('Locked previews were removed.', 'warn');
      E.sfx('win'); E.flash('#fff0c9', 200);
      if (this.mode === 'new') { G.draft = null; G.newGame(this.slot, clean); }
      else { G.do({ t: 'equip', look: clean }); this.exit(true); }
    },
    exit(saved) {
      if (this.mode === 'new') { G.draft = this.look; E.go('slots', { mode: 'new' }); return; }
      const b = this.back || { scene: 'street' };
      if (b.scene === 'place') E.go('place', b.args); else E.go(b.scene, b.args);
    },
    // ---------------------------------------------------------------- scene
    update(dt) {
      this.hop = Math.max(0, this.hop - dt / 420);
      if (this.pose === 'beatbox' || this.pose === 'finisher') { this.ringT += dt; if (this.ringT > 420) { this.ringT = 0; this.rings.push({ age: 0 }); E.A().drum && E.sfx('click', { quiet: true, pitch: 0.7 }); } }
      for (const r of this.rings) r.age += dt; this.rings = this.rings.filter((r) => r.age < 700);
    },
    pointer(type, x, y) {
      if (type !== 'down' || y > k(300)) return;
      const i = (POSES.indexOf(this.pose) + 1) % POSES.length; this.pose = POSES[i]; this.hop = 1; E.sfx('hit_good'); E.burst(x, y, 6, { color: PAL.neonCyan, speed: 40, gravity: 0, life: 300 });
      if (this.tab === 'body') this.renderTab(true);
    },
    draw(c) {
      const t = E.t;
      if (this.bg) this.bg.layers[0].pix.draw(c, 0, -this.dy); else { c.fillStyle = PAL.night1; c.fillRect(0, 0, E.W, E.H); }
      for (const l of (this.bg && this.bg.lights) || []) E.drawGlow(c, l.x, l.y - this.dy, l.r, l.color, (l.a || 0.5) * (l.flicker ? 0.85 + 0.15 * Math.sin(t / 130 + l.x) : 1));
      const hop = -Math.abs(Math.sin(this.hop * Math.PI)) * 10 * this.hop, sx = this.spot.x, sy = this.spot.y;
      // beam of light behind the hero
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.07 + 0.02 * Math.sin(t / 500); c.fillStyle = '#9b7bff'; c.beginPath(); c.moveTo(sx - 30, 0); c.lineTo(sx + 30, 0); c.lineTo(sx + 120, sy); c.lineTo(sx - 120, sy); c.closePath(); c.fill(); c.restore();
      for (const r of this.rings) { const kk = r.age / 700; c.save(); c.globalAlpha = 1 - kk; c.strokeStyle = [PAL.neonCyan, PAL.neonYellow, PAL.neonLime, PAL.neonPink][Math.floor(r.age / 175) % 4]; c.lineWidth = 2; c.beginPath(); c.ellipse(sx, sy - 190, 34 + kk * 100, 26 + kk * 70, 0, 0, 7); c.stroke(); c.restore(); }
      E.hero(c, this.look, this.pose, sx, sy + hop, { scale: 3, shadow: false, t });
      E.shadow(c, sx, sy + 2, 100, 0.4);
      // sparkles
      for (let i = 0; i < 6; i++) { const a = t / 1400 + i * 1.05, rr = 95 + (i % 3) * 18; const px = sx + Math.cos(a) * rr, py = sy - 130 + Math.sin(a * 1.3) * 100; const tw = (Math.sin(t / 200 + i * 2) + 1) / 2; if (tw > 0.55) { c.fillStyle = i % 2 ? PAL.neonCyan : PAL.neonPink; c.fillRect(Math.round(px), Math.round(py), 1, 1); c.fillRect(Math.round(px) - 1, Math.round(py), 3, 1); c.fillRect(Math.round(px), Math.round(py) - 1, 1, 3); } }
      const pv = Object.keys(this.previewing).filter((k) => { const [g, id] = k.split(':'); return !this.isOpen(g, id) && this.isWorn(g, id); });
      if (pv.length) E.txt(c, 'PREVIEW: LOCKED ITEMS WORN', E.W / 2, k(280), { align: 'c', color: PAL.gold, a: 0.6 + 0.4 * Math.sin(t / 250) });
    },
    isWorn(g, id) {
      const L = this.look;
      switch (g) { case 'hairStyle': return L.hair.style === id; case 'top': return L.top.id === id; case 'bottom': return L.bottom.id === id; case 'shoes': return L.shoes.id === id; case 'hat': return L.hat.id === id; case 'glasses': return L.glasses.id === id;
        case 'eyeStyle': return L.eyes.style === id; case 'facial': return L.facial === id; case 'marks': return L.marks.includes(id); case 'acc': return CAT.ACC_SLOTS.some((s) => L.acc[s].id === id); case 'skin': return L.skin === (CAT.GROUPS.skin.find((x) => x.id === id) || {}).color; case 'hairColor': return L.hair.color === (CAT.HAIR_COLORS.find((x) => x.id === id) || {}).color; default: return false; }
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
