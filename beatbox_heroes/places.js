// BEATBOX HEROES -- places.js: the street (side scrolling hub) and every place you can enter, with their menus
// (kitchen, bed, desk, busking spot, thrift shop, studio, bar stage, mingling).
(function (root) {
  'use strict';
  const BBH = root.BBH, E = BBH.E, Core = BBH.Core, CAT = BBH.CATALOG, PAL = BBH.PAL;
  const G = BBH.G = BBH.G || {};
  const h = E.h;
  const SW = 1080, K = E.K, k = (n) => Math.round(n * K);
  const world = (id, v) => { try { return BBH.World.scene(id, v); } catch (e) { console.warn('scene ' + id + '/' + v, e); return null; } };

  const CLERK = { name: 'Clerk', body: 'girl', skin: '#d9a46e', hair: { style: 'buns', color: '#7b3a22' }, top: { id: 'hawaiian', color: '#ff6b35' }, bottom: { id: 'skirt', color: '#2a9d8f' }, shoes: { id: 'hightops', color: '#f7f2e8' }, glasses: { id: 'round', color: '#d4a017' } };
  const TIPS = {
    foxy: ['Eat before you perform. Hungry beatboxers sound like deflating tyres.', 'Rent is every Sunday. Fans pay a few dollars in streams too.', 'Sleep after 20:00 and you wake up fresh. Nap if you are fading.', 'The thrift shop has hats and shades. Dress like you mean it.', 'Open mics are Tuesday to Thursday at the bar. Fans love a regular.', 'Saturday is battle night. Train your Technicality first.', 'Try the wardrobe. A new look is a free mood boost.'],
    beeamgee: ['Again. But with your whole body this time.', 'Musicality widens your timing. Showmanship fills the tip jar.', 'Originality wins judges over. Technique wins rounds. Both win battles.', 'I busked before you were born. Stay curious, kid.', 'Do not chase fans. Chase the feeling. The fans follow.'],
    rohzel: ['Open mics Tuesday to Thursday. Friday is the paid showcase. Saturday: battles.', 'Fifty fans and five open mics and I will book you for a Friday.', 'Karaoke Sunday is for fun. Even champions sing badly on Sundays.', 'The green juice is on the house if you win tonight.', 'Pig Pen? Do not engage. Beat him on stage instead.'],
  };
  const jobRow = (S, id) => { const j = Core.JOBS.find((x) => x.id === id); return S.row(('ODD JOB: ' + j.name).toUpperCase() + '  ' + j.minutes + ' min', 'Safe pay: $' + j.cash + (j.fans ? ' and ' + j.fans + ' fans' : '') + '. Costs ' + j.energy + ' energy.', G.ch.energy < j.energy ? 'dis' : 'green', () => { S.closeSheet(); G.do({ t: 'job', job: id }); }); };
  const tip = (who) => { const arr = TIPS[who], k = 'tip_' + who, i = (G.ch.flags[k] || 0) % arr.length; G.do({ t: 'flag', k, v: i + 1 }); return arr[i]; };

  const variantFor = (id, ch) => {
    const n = Core.nightness(ch.minutes);
    if (id === 'bar') return 'night';
    if (id === 'park') return n < 0.3 ? 'day' : n < 0.75 ? 'dusk' : 'night';
    return n > 0.5 ? 'night' : 'day';
  };

  /* ---------------------------------------------------------------- street */
  E.scenes.street = {
    enter(a) {
      this.vs = { day: world('street', 'day'), dusk: world('street', 'dusk'), night: world('street', 'night') };
      const any = this.vs.night || this.vs.day; this.doors = ((any && any.hotspots) || []).filter((x) => x.id !== 'home' || true);
      this.floorY = (any && any.floorY) || 549; const from = a.from || (G.ch.place && G.ch.place !== 'street' ? G.ch.place : 'home');
      const door = this.doors.find((d) => d.id === from) || this.doors[1] || { x: 300, w: 64 };
      this.hx = door.x + (door.w || 48) / 2; this.target = null; this.queue = null; this.dir = 1; this.cam = Math.max(0, Math.min(SW - E.W, this.hx - E.W / 2)); this.moving = false; this.steam = 0;
      this.weather = G.ch.day % 5 === 0 ? 'rain' : null; this.look = BBH.Chars.fix(G.ch.look);
      E.music('street'); this.build(); this.fromPlace = from;
      if (a.tutorial) E.dialog([{ who: 'foxy', mood: 'happy', text: 'Welcome to the neighbourhood! You just lost your job, so here is how we fix that.' }, { who: 'foxy', text: 'Tap a door to walk there. The PARK is open all day. Go busk: play beats for tip money and fans.' }, { who: 'foxy', text: 'Watch the bars at the top: energy, hunger and mood. And rent is $' + Core.CFG.rent + ' every Sunday, so earn some cash.' }], () => G.openHelp());
    },
    build() {
      E.clearUI(); E.add(E.makeHud(G));
      this.goalEl = h('div.tp', { style: { position: 'absolute', left: '4px', right: '30px', top: '43px', padding: '3px 4px', background: 'rgba(18,13,31,.82)', color: PAL.cream, fontSize: '5px', lineHeight: '7px', boxShadow: '0 0 0 1px var(--ink)' } });
      E.add(this.goalEl); this.goalEl.textContent = G.goal(G.ch).toUpperCase();
      E.add(E.btn('', '', () => G.openMenu(), { position: 'absolute', right: '4px', top: '43px', width: '22px', height: '17px', padding: '2px 0' }).appendChild(E.iconEl('gear', 1, { display: 'block', margin: '1px auto' })).parentNode);
      const nav = h('div.row', { style: { position: 'absolute', left: '4px', right: '4px', bottom: '4px', gap: '3px', zIndex: 6 } });
      for (const id of ['park', 'home', 'shop', 'studio', 'bar']) {
        const b = h('div.btn.grow', { style: { padding: '3px 0 2px', fontSize: '5px' } }, E.iconEl(id, 1, { display: 'block', margin: '0 auto 1px' }), h('div', null, Core.PLACES[id].name.replace('The ', '').toUpperCase().slice(0, 6)));
        b.addEventListener('click', () => { E.sfx('click'); this.goDoor(id); }); nav.appendChild(b); this.navBtns = this.navBtns || {}; this.navBtns[id] = b;
      }
      E.add(nav);
    },
    goDoor(id) {
      const d = this.doors.find((x) => x.id === id); if (!d) return;
      const ok = Core.canEnter(G.ch, id); if (!ok.ok) { E.toast(ok.reason, 'warn'); E.sfx('error'); return; }
      this.target = d.x + (d.w || 64) / 2; this.queue = id;
    },
    pointer(type, x, y) {
      if (type !== 'down' || y < k(60) || y > k(448)) return;
      const wx = this.cam + x;
      const door = this.doors.find((d) => wx >= d.x - 14 && wx <= d.x + (d.w || 64) + 14 && y > (d.y || 330) - 26 && y < this.floorY + 26);
      if (door) { this.goDoor(door.id); return; }
      this.target = Math.max(20, Math.min(SW - 20, wx)); this.queue = null;
    },
    update(dt) {
      const s = dt / 1000; this.moving = false;
      if (this.target !== null) {
        const d = this.target - this.hx, step = 112 * s;
        if (Math.abs(d) <= step) { this.hx = this.target; this.target = null; if (this.queue) { const q = this.queue; this.queue = null; G.enterPlace(q); } }
        else { this.hx += Math.sign(d) * step; this.dir = Math.sign(d); this.moving = true; }
      }
      const want = Math.max(0, Math.min(SW - E.W, this.hx - E.W / 2)); this.cam += (want - this.cam) * Math.min(1, s * 6);
      this.steam += dt; if (this.steam > 900) { this.steam = 0; const sp = E.fxSprite('puff'); if (sp && !Array.isArray(sp)) E.spawn({ x: 213 - this.cam, y: this.floorY - 5, vx: 6, vy: -22, ay: 0, life: 1800, spr: sp, fade: true }); }
      if (this.t % 1000 < dt && this.goalEl) this.goalEl.textContent = G.goal(G.ch).toUpperCase();
    },
    draw(c) {
      const n = Core.nightness(G.ch.minutes), V = this.vs;
      let a = V.day, b = null, mix = 0;
      if (n < 0.02) { a = V.day; } else if (n < 0.5) { a = V.day; b = V.dusk; mix = n / 0.5; } else if (n < 0.98) { a = V.dusk; b = V.night; mix = (n - 0.5) / 0.48; } else { a = V.night; }
      const drawVar = (sc, alpha) => { if (!sc) return; c.save(); if (alpha < 1) c.globalAlpha = alpha; for (const l of sc.layers) l.pix.draw(c, -Math.round(this.cam * l.speed), 0); c.restore(); };
      c.fillStyle = PAL.night1; c.fillRect(0, 0, E.W, E.H); drawVar(a, 1); if (b) drawVar(b, mix);
      const sc = b && mix > 0.5 ? b : a;
      // additive lights (windows and lamps glow more at night)
      for (const l of ((sc || {}).lights || [])) {
        const on = l.kind === 'window' ? Math.max(0, (n - 0.35) * 1.5) : l.kind === 'lamp' ? Math.min(1, n * 1.4) : l.kind === 'neon' ? Math.min(1, 0.3 + n) : n;
        if (on <= 0.02) continue; const fl = l.flicker ? 0.8 + 0.2 * Math.sin(E.t / 90 + l.x * 3) * (Math.sin(E.t / 800 + l.x) > 0.8 ? 0.3 : 1) : 1;
        const x = l.x - this.cam; if (x < -l.r || x > E.W + l.r) continue; E.drawGlow(c, x, l.y, l.r, l.color, (l.a === undefined ? 0.5 : l.a) * on * fl);
      }
      // doors: bobbing arrow on the goal door, lock on closed ones
      for (const d of this.doors) {
        const dx = d.x + (d.w || 64) / 2 - this.cam; if (dx < -20 || dx > E.W + 20) continue; const ok = Core.canEnter(G.ch, d.id);
        if (!ok.ok) E.icon('lock').draw(c, dx - 8, (d.y || 330) - 20); else if (this.goalDoor() === d.id) { c.save(); c.translate(Math.round(dx), (d.y || 330) - 12 + Math.round(Math.sin(E.t / 200) * 4)); c.rotate(Math.PI / 2); E.icon('right').draw(c, -8, -8); c.restore(); }
      }
      E.hero(c, this.look, this.moving ? (BBH.Chars.POSES.walkside ? 'walkside' : 'walk') : 'idle', this.hx - this.cam, this.floorY, { flip: this.dir < 0, t: this.moving ? E.t : E.t * 0.6 });
      if (sc && sc.fg) sc.fg.draw(c, -Math.round(this.cam), 0);
      if (this.weather === 'rain' || n > 0.6) E.rain(c, E.t, { n: this.weather === 'rain' ? 80 : 14, color: 'rgba(170,200,255,.32)' });
      // night tint
      if (n > 0.02) { c.fillStyle = 'rgba(20,10,60,' + (n * 0.12) + ')'; c.fillRect(0, 0, E.W, E.H); }
    },
    goalDoor() {
      const g = G.goal(G.ch).toLowerCase();
      return /\bpark\b/.test(g) ? 'park' : /\bbar\b/.test(g) ? 'bar' : /\bhome\b/.test(g) ? 'home' : null;
    },
  };

  /* ---------------------------------------------------------------- places */
  const SPOT_FOR = { booth: 'booth', couch: 'couch', bed: 'bed', desk: 'desk', kitchen: 'kitchen', wardrobe: 'wardrobe', spot: 'busk', bench: 'bench', stage: 'stage', counter: 'rohzel', mic: 'stand', mixer: 'stand', hats: 'stand', racks: 'stand', mirror: 'stand', door: 'stand', gate: 'stand' };

  E.scenes.place = {
    enter(a) {
      this.id = a.id; this.look = BBH.Chars.fix(G.ch.look); this.sheetEl = null; this.walkQueue = null; this.dir = 1; this.moving = false;
      const go = () => {
        this.v = variantFor(this.id, G.ch); this.sc = world(this.id, this.v);
        const st = (this.sc && this.sc.spots && this.sc.spots.stand) || { x: 180, y: 533 }; this.hx = st.x; this.hy = st.y; this.path = [];
        E.music(this.id); this.build(); this.firstVisit();
      };
      if (G.pendingMorning) { E.clearUI(); G.showMorning(() => { E.fadeTo(0, 400); go(); }); this.sc = world('home', 'day'); this.v = 'day'; this.hx = 180; this.hy = 533; this.path = []; } else go();
    },
    leave() { this.closeSheet(); },
    build() {
      E.clearUI(); E.add(E.makeHud(G)); this.sheetEl = null;
      E.add(E.btn('', '', () => G.openMenu(), { position: 'absolute', right: '4px', top: '43px', width: '22px', height: '17px', padding: '2px 0' }).appendChild(E.iconEl('gear', 1, { display: 'block', margin: '1px auto' })).parentNode);
      E.add(E.btn('LEAVE', '', () => this.leave2(), { position: 'absolute', left: '4px', top: '43px', width: '44px', height: '17px', padding: '5px 0', fontSize: '5px' }));
    },
    leave2() { this.closeSheet(); if (this.id === 'home' && false) return; G.leavePlace(); },
    firstVisit() {
      const f = G.ch.flags, key = 'visited_' + this.id; if (f[key]) return; G.do({ t: 'flag', k: key });
      const lines = { home: [{ who: 'foxy', text: 'This is our flat. Sleep in the bedroom, eat in the kitchen, and practise in the vocal booth to train your skills.' }],
        park: [{ who: 'beeamgee', text: 'I am BeeAmGee. I teach beatboxing. Tap the busking spot to play a set for tips. Sit with me on the bench for a free lesson.' }],
        shop: [{ name: 'Clerk', look: CLERK, text: 'Welcome to the Thrift Shop. Buy clothes, hats and shades with your cash. Tap an item to try it on first.' }],
        studio: [{ name: 'Sound Lab', text: 'The Sound Lab costs $' + Core.STUDIO_FEE + ' per session, but you train faster here than at home. The jukebox plays the game music.' }],
        bar: [{ who: 'rohzel', text: 'I am Rohzel and I run the bar. Tue to Thu: open mic. Friday: paid showcase. Saturday: battles. Sunday: karaoke. Monday: closed.' }] }[this.id];
      if (lines) E.dialog(lines);
    },
    // ------------------------------------------------------------ sheets
    closeSheet() { if (this.sheetEl) { this.sheetEl.remove(); this.sheetEl = null; } },
    sheet(title, kids, o) {
      o = o || {}; this.closeSheet();
      const el = h('div.panel.sheet.pop', { style: { padding: '8px', maxHeight: o.maxH || '230px', display: 'flex', flexDirection: 'column', zIndex: 15 } },
        h('div.row', { style: { justifyContent: 'space-between', marginBottom: '5px' } }, h('div.h2', null, title), E.btn('X', '', () => this.closeSheet(), { padding: '3px 5px' })), h('div.scroll.col', { style: { gap: '4px' } }, kids));
      E.add(el); this.sheetEl = el; return el;
    },
    row(label, sub, cls, fn) { return E.btn('', cls || '', fn, { textAlign: 'left', padding: '5px 6px 6px' }).appendChild(h('div.col', { style: { gap: '2px' } }, h('div', null, label), sub ? h('div.ts', { style: { fontFamily: "'Silkscreen'", fontSize: '8px', color: '#d9c9ff' } }, sub) : null)).parentNode; },
    pointer(type, x, y) {
      if (type !== 'down' || y < k(62)) return;
      const hs = ((this.sc && this.sc.hotspots) || []).find((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
      if (hs) { this.walkTo(hs.id); return; }
      const sc = this.sc && this.sc.spots; if (sc && y > k(300) && !(this.sc && this.sc.nav)) { this.path = [{ x, y: Math.max((this.sc.floorY || y) - 53, Math.min(y, k(462))) }]; this.walkQueue = null; }
    },
    walkTo(hid) {
      this.closeSheet(); const spots = this.sc.spots || {}, name = SPOT_FOR[hid] || 'stand', sp = spots[name] || spots.stand || { x: 180, y: 533 };
      this.path = this.route(sp, name); this.walkQueue = hid;
    },
    // walk along the scene's nav graph (rooms joined by doorways) when it has one, else straight
    route(target, name) {
      const nav = this.sc && this.sc.nav; if (!nav || !nav.nodes) return [{ x: target.x, y: target.y }];
      const nodes = nav.nodes, near = (p) => { let b = null, bd = 1e9; for (const k of Object.keys(nodes)) { const d = Math.hypot(nodes[k].x - p.x, nodes[k].y - p.y); if (d < bd) { bd = d; b = k; } } return b; };
      const from = near({ x: this.hx, y: this.hy }), to = nodes[name] ? name : near(target);
      const adj = {}; for (const [a, b] of nav.edges || []) { (adj[a] = adj[a] || []).push(b); (adj[b] = adj[b] || []).push(a); }
      const prev = { [from]: null }, q = [from];
      while (q.length) { const u = q.shift(); if (u === to) break; for (const v of adj[u] || []) if (!(v in prev)) { prev[v] = u; q.push(v); } }
      const out = []; let u = to; if (!(to in prev)) return [{ x: target.x, y: target.y }];
      while (u) { out.unshift({ x: nodes[u].x, y: nodes[u].y }); u = prev[u]; }
      out.push({ x: target.x, y: target.y }); return out;
    },
    update(dt) {
      const s = dt / 1000; this.moving = false; this.vx = 0; this.vy = 0;
      if (this.path && this.path.length) {
        const p = this.path[0], dx = p.x - this.hx, dy = p.y - this.hy, d = Math.hypot(dx, dy), step = 133 * s;
        if (d <= step) { this.hx = p.x; this.hy = p.y; this.path.shift(); }
        else { this.hx += dx / d * step; this.hy += dy / d * step; this.moving = true; this.vx = dx; this.vy = dy; if (Math.abs(dx) > 1) this.dir = Math.sign(dx); }
      } else if (this.walkQueue) { const q = this.walkQueue; this.walkQueue = null; this.activate(q); }
    },
    heroPose() {
      if (!this.moving) return this.sheetEl && this.id === 'park' && this.sitting ? 'sit' : 'idle';
      const side = BBH.Chars.POSES.walkside && Math.abs(this.vx) >= Math.abs(this.vy) * 0.7;
      return side ? 'walkside' : 'walk';
    },
    draw(c) {
      const sc = this.sc; c.fillStyle = PAL.night1; c.fillRect(0, 0, E.W, E.H);
      if (sc) for (const l of sc.layers) l.pix.draw(c, 0, 0);
      const n = Core.nightness(G.ch.minutes);
      if (sc) for (const l of sc.lights || []) { const fl = l.flicker ? 0.8 + 0.2 * Math.sin(E.t / 100 + l.x) : 1; E.drawGlow(c, l.x, l.y, l.r, l.color, (l.a === undefined ? 0.5 : l.a) * fl * (this.v === 'day' && (l.kind === 'window') ? 0.5 : 1)); }
      // NPCs
      for (const np of this.npcs()) E.hero(c, np.look, np.pose || 'idle', np.x, np.y, { flip: np.flip, t: E.t + np.x * 9 });
      E.hero(c, this.look, this.heroPose(), this.hx, this.hy, { flip: this.dir < 0, t: E.t });
      if (sc && sc.fg) sc.fg.draw(c, 0, 0);
      // tappable hotspot hints (soft pulse on the ones you can use)
      if (sc) for (const hs of sc.hotspots || []) { if (hs.id === 'door' || hs.id === 'gate') continue; const p = 0.5 + 0.5 * Math.sin(E.t / 380 + hs.x); const cx = hs.x + hs.w / 2, cy = hs.y - 2; E.icon('star').draw(c, Math.round(cx - 8), Math.round(cy - 16 - p * 3)); }
      if (this.id === 'park' && n > 0.7) E.rain(c, E.t, { n: 10, color: 'rgba(170,200,255,.25)' });
    },
    npcs() {
      const sp = (this.sc && this.sc.spots) || {}, out = [], hr = Core.hourOf(G.ch.minutes);
      if (this.id === 'home' && sp.foxy && (hr < 11 || hr > 17)) out.push({ look: BBH.Chars.fix(Core.NPCS.foxy.look), x: sp.foxy.x, y: sp.foxy.y, id: 'foxy', pose: hr > 21 ? 'sit' : 'idle', flip: sp.foxy.x > this.hx });
      if (this.id === 'park' && sp.beeamgee) out.push({ look: BBH.Chars.fix(Core.NPCS.beeamgee.look), x: sp.beeamgee.x, y: sp.beeamgee.y, id: 'beeamgee', pose: 'sit', flip: false });
      if (this.id === 'bar' && sp.rohzel) out.push({ look: BBH.Chars.fix(Core.NPCS.rohzel.look), x: sp.rohzel.x, y: sp.rohzel.y, id: 'rohzel', pose: 'idle', flip: false });
      if (this.id === 'shop' && sp.clerk) out.push({ look: BBH.Chars.fix(CLERK), x: sp.clerk.x, y: sp.clerk.y, id: 'clerk', pose: 'idle', flip: false });
      if (this.id === 'bar') for (const r of this.regulars()) out.push(r);
      return out;
    },
    regulars() {
      if (this._reg && this._regDay === G.ch.day) return this._reg; this._regDay = G.ch.day;
      const pool = Core.ROMANCE.slice(), r = BBH.rng(G.ch.day * 31 + 7), picks = []; while (picks.length < 3) picks.push(pool.splice(r.int(pool.length), 1)[0]);
      const xs = [70, 150, 285], sy0 = ((this.sc.spots || {}).stand || { y: 573 }).y; const ys = [sy0 + 10, sy0 - 8, sy0 + 10];
      this._reg = picks.map((id, i) => ({ look: BBH.Chars.fix(Core.NPCS[id].look), x: xs[i], y: ys[i], id, pose: 'idle', flip: i === 2 })); return this._reg;
    },

    /* --------------------------------------------------------- activate */
    activate(hid) {
      const id = this.id, A = ACTIONS[id] && ACTIONS[id][hid];
      if (hid === 'door' || hid === 'gate') { this.leave2(); return; }
      if (A) A(this); else E.toast('Nothing to do here.');
    },
    tapNpc(x, y) { /* handled via pointer hotspots; NPC dialogue via sheets */ },
  };

  /* --------------------------------------------------------- shared menus */
  function foodRows(S, home) {
    return Core.FOODS.map((f) => S.row(f.name.toUpperCase() + '  $' + f.price, 'Hunger +' + f.hunger + (f.energy ? '  Energy +' + f.energy : '') + (f.mood ? '  Mood +' + f.mood : ''), G.ch.cash >= f.price ? '' : 'dis',
      () => { G.do({ t: 'eat', food: f.id, home }); if (S.sheetEl) S.eatMenu(home); }));
  }
  E.scenes.place.eatMenu = function (home) { this.sheet('KITCHEN  $' + G.ch.cash, foodRows(this, home)); };

  function trainRows(S, where) {
    const rows = [];
    for (const st of Core.STATS) {
      const lvl = Math.floor(G.ch.stats[st]);
      rows.push(S.row(Core.STAT_NAMES[st].toUpperCase() + '  ' + lvl, where === 'studio' ? 'Studio session  $' + Core.STUDIO_FEE + '  x1.4 gains' : 'Practice drill at home', G.ch.energy < 12 ? 'dis' : '',
        () => { S.closeSheet(); startTraining(S, st, where); }));
    }
    for (const b of (G.labRows ? G.labRows(S, where) : [])) rows.push(b);
    rows.push(S.row('QUICK PRACTICE', 'Skip the drill: small gain in a random skill', '', () => { S.closeSheet(); const st = Core.STATS[Math.floor(Math.random() * 4)]; G.do({ t: 'train', stat: st, q: 0.4, where }); }));
    return rows;
  }
  function startTraining(S, stat, where) {
    if (where === 'studio' && G.ch.cash < Core.STUDIO_FEE) { E.toast('The studio costs $' + Core.STUDIO_FEE + '.', 'warn'); return; }
    if (G.ch.energy < 12) { E.toast('Too tired to train.', 'warn'); return; }
    const base = { mus: 90, tech: 104, ori: 96, show: 100 }[stat];
    E.go('rhythm', { mode: 'practice', title: Core.STAT_NAMES[stat].toUpperCase(), sub: 'drill: ' + where, bpm: base, bars: 6, difficulty: 0.25 + Math.min(0.4, G.ch.stats[stat] / 120), style: Core.STATS.indexOf(stat), stage: 'cyan',
      onDone: (res) => { const held = G.doHold({ t: 'train', stat, q: res.accuracy, where }); G.showResult({ kind: 'practice', res, rw: Core.reward('practice', res, G.ch) }, () => G.finishActivity(held, S.id)); }, onAbort: () => E.go('place', { id: S.id }) });
  }

  function startPerform(S, kind, o) {
    const ch = G.ch;
    if (ch.energy < 14) { E.toast('Too tired. Eat, nap or sleep first.', 'warn'); E.sfx('error'); return; }
    E.go('rhythm', Object.assign({ mode: 'perform', kind, stage: 'pink', tip: true, onDone: (res) => {
      G.do({ t: 'flag', k: 'rhythmTip' });
      const held = G.doHold({ t: 'perform', kind, res }); const f = held.fx.find((x) => x.t === 'result');
      G.showResult(f, () => G.finishActivity(held, S.id));
    }, onAbort: () => E.go('place', { id: S.id }) }, o));
  }

  function startBattle(S, opp, final, chain) {
    E.go('rhythm', { mode: 'battle', opp, finalOpp: final ? opp : null, final: final || null, stage: STAGE[opp.style % 4], onDone: (r) => {
      if (final && r.win && chain && chain.length) { startBattle(S, chain[0], chain[0].id, chain.slice(1)); return; }
      if (G.pendingMorning) { E.go('place', { id: 'home' }); return; }
      E.go('place', { id: S.id });
    }, onAbort: () => E.go('place', { id: S.id }) });
  }
  const STAGE = ['pink', 'cyan', 'lime', 'gold'];

  /* ------------------------------------------------------------- actions */
  const ACTIONS = {
    home: {
      bed(S) {
        const hr = Core.hourOf(G.ch.minutes), late = hr >= 20 || hr < 6;
        S.sheet('BED', [
          S.row('NAP  90 min', 'Energy +22. Not available too late.', '', () => { S.closeSheet(); G.do({ t: 'nap' }); }),
          S.row('SLEEP', late ? 'End the day. Wake up fresh at 07:00.' : 'Only after 20:00.', late ? 'gold' : 'dis', () => {
            if (!late) { E.toast('Too early to sleep. Nap, or wait until 20:00.', 'warn'); return; }
            S.closeSheet(); E.fadeTo(1, 600); G.pendingMorning = null; const r = G.doHold({ t: 'sleep' }); r.play({ morning: (f) => { G.pendingMorning = f; } });
            setTimeout(() => { E.go('place', { id: 'home' }, { nofade: true }); }, 700);
          }),
        ]);
      },
      desk(S) {
        const ch = G.ch;
        S.sheet('DESK', [h('div.ts', null, G.goal(ch)),
          S.row('SKILLS', Core.STATS.map((st) => Core.STAT_NAMES[st].slice(0, 4) + ' ' + Math.floor(ch.stats[st])).join('  '), '', () => { S.closeSheet(); G.openStats(); }),
          S.row('GO LIVE  60 min', ch.fans < Core.STREAM_MIN_FANS ? 'Needs ' + Core.STREAM_MIN_FANS + ' fans.' : ch.flags.streamDay === ch.day ? 'You already streamed today.' : 'Stream to your fans for tips. Once a day.', ch.fans >= Core.STREAM_MIN_FANS && ch.flags.streamDay !== ch.day && ch.energy >= 15 ? 'pink' : 'dis', () => { S.closeSheet(); G.goLive(); }),
          S.row('MY SONGS  ' + ch.songs.length, 'Released songs and their earnings.', '', () => G.openSongs()),
          S.row('HOW TO PLAY', 'Goals, rules and controls.', 'cyan', () => { S.closeSheet(); G.openHelp(); }),
          S.row('QUICK PRACTICE', 'No mini-game: a small random skill gain.', ch.energy < 12 ? 'dis' : '', () => { S.closeSheet(); G.do({ t: 'train', stat: Core.STATS[Math.floor(Math.random() * 4)], q: 0.4, where: 'home' }); })]);
      },
      booth(S) { S.sheet('VOCAL BOOTH: TRAIN', trainRows(S, 'home')); },
      couch(S) {
        S.sheet('COUCH', [
          S.row('REST  30 min', 'Mood +8. Put your feet up.', '', () => { S.closeSheet(); const c0 = G.ch.mood; G.do({ t: 'wait', minutes: 30 }); const r = Core.clone(G.ch); r.mood = Math.min(100, r.mood + 8); G.setChar(r); E.toast('Mood +' + Math.round(r.mood - c0), 'good'); }),
          S.row('WATCH A BEATBOX TAPE  60 min', G.ch.flags.tapeDay === G.ch.day ? 'Already watched one today.' : 'An old VHS battle tape. Mood +8, Originality up. Once a day.', G.ch.flags.tapeDay === G.ch.day ? 'dis' : 'cyan', () => { S.closeSheet(); G.do({ t: 'tape' }); }),
          S.row('TALK TO FOXY', 'Tips and advice.', '', () => { S.closeSheet(); E.dialog([{ who: 'foxy', text: tip('foxy') }]); })]);
      },
      kitchen(S) { S.eatMenu(true); },
      wardrobe(S) { E.go('creator', { mode: 'wardrobe', back: { scene: 'place', args: { id: 'home' } } }); },
    },
    park: {
      spot(S) {
        const lvl = G.ch.level;
        S.sheet('BUSKING SPOT', [
          h('div.ts', null, 'Play a set for the passers-by. Better timing means more tips and fans.'),
          S.row('BUSK  60 min', 'The classic B t K t groove. Cash and a few fans.', G.ch.energy < 14 ? 'dis' : 'gold', () => { S.closeSheet(); startPerform(S, 'busk', { title: 'BUSKING', sub: 'park', bpm: 92 + Math.min(10, lvl), bars: 8, difficulty: 0.2 + Math.min(0.12, lvl * 0.008), style: 0, stage: 'cyan' }); }),
          S.row('BUSK HARD  60 min', 'Faster eighth-note grooves. Bigger rewards for a clean run.', G.ch.energy < 14 ? 'dis' : 'pink', () => { S.closeSheet(); startPerform(S, 'busk', { title: 'BUSKING+', sub: 'show them what you got', bpm: 108 + Math.min(14, lvl), bars: 8, difficulty: 0.55 + Math.min(0.3, lvl * 0.02), style: 1, stage: 'pink' }); }),
        ]);
      },
      bench(S) {
        S.sheet('BENCH', [
          S.row('REST  30 min', 'Mood +8. Watch the clouds.', '', () => { S.closeSheet(); const c0 = G.ch.mood; G.do({ t: 'wait', minutes: 30 }); const r = Core.clone(G.ch); r.mood = Math.min(100, r.mood + 8); G.setChar(r); E.toast('Mood +' + Math.round(r.mood - c0), 'good'); }),
          S.row('GO FOR A RUN  60 min', 'Alternate left and right taps. Builds stamina (max energy).', G.ch.energy < 14 ? 'dis' : 'cyan', () => { if (G.ch.energy < 14) { E.toast('Too tired to run.', 'warn'); return; } S.closeSheet(); E.go('run', { back: { scene: 'place', args: { id: 'park' } } }); }),
          S.row('PRIVATE COACHING  $' + Core.COACH_FEE, 'BeeAmGee teaches you one skill point.', 'gold', () => { S.closeSheet(); G.openCoaching(S); }),
          jobRow(S, 'flyers'),
          S.row('TALK TO BEEAMGEE', 'Advice from the old guard.', '', () => { S.closeSheet(); E.dialog([{ who: 'beeamgee', text: tip('beeamgee') }]); }),
          S.row('FREE LESSON', G.ch.flags.coachDay === G.ch.day ? 'Come back tomorrow.' : 'Pick a skill. Once a day. 45 min.', G.ch.flags.coachDay === G.ch.day ? 'dis' : 'cyan', () => {
            if (G.ch.flags.coachDay === G.ch.day) return;
            S.closeSheet(); S.sheet('LESSON WITH BEEAMGEE', Core.STATS.map((st) => S.row(Core.STAT_NAMES[st].toUpperCase(), 'Current ' + Math.floor(G.ch.stats[st]), '', () => { S.closeSheet(); G.do({ t: 'flag', k: 'coachDay', v: G.ch.day }); G.do({ t: 'train', stat: st, q: 0.9, where: 'coach' }); E.dialog([{ who: 'beeamgee', text: 'again. good. ' + (st === 'mus' ? 'listen to the space between the beats.' : st === 'tech' ? 'smaller movements. cleaner sound.' : st === 'ori' ? 'break the pattern, then rebuild it.' : 'play to the back row.') }]); })));
          }),
        ]);
      },
    },
    shop: { hats: (S) => G.openShop(S, 'hat'), racks: (S) => G.openShop(S, 'top'), mirror: (S) => G.openShop(S, 'glasses'), counter: (S) => { S.sheet('COUNTER', [jobRow(S, 'shelves'), S.row('BROWSE THE SHOP', 'Hats, shades, jackets and more.', 'gold', () => G.openShop(S, 'top')), S.row('CHAT', 'Ask the clerk about stock.', '', () => { S.closeSheet(); E.dialog([{ name: 'Clerk', look: CLERK, text: ['new stock appears as you level up. the gold stuff is not for sale. it is earned.', 'shades are twenty bucks. confidence is free.', 'we got a cape in the back. it is not for sale yet. you are not ready.'][Math.floor(Math.random() * 3)] }]); })]); } },
    studio: {
      mic(S) { S.sheet('SOUND LAB: TRAIN', trainRows(S, 'studio')); },
      mixer(S) {
        const ids = [['title', 'Neon City'], ['creator', 'Mirror Room'], ['street', 'Night Walk'], ['home', 'Warm Blanket'], ['park', 'Pigeon Pluck'], ['shop', 'Thrift Jazz'], ['bar', 'Smoky Funk'], ['studio', 'Clean Pads'], ['battle', 'Break Point'], ['intro', 'Pink Slip']];
        S.sheet('SOUND LAB', G.labRows(S, 'studio').concat([S.row('JUKEBOX', 'Listen to the game music.', '', () => { S.closeSheet(); S.sheet('JUKEBOX', ids.map(([id, name]) => S.row(name.toUpperCase(), 'Tap to play', '', () => { E.music(id); })).concat([S.row('BACK TO STUDIO TRACK', '', 'gold', () => E.music('studio'))]), { maxH: '260px' }); })]), { maxH: '300px' });
      },
    },
    bar: {
      stage(S) {
        const prog = Core.barProgramme(G.ch.day), ch = G.ch, rows = [];
        rows.push(h('div.ts', null, 'Tonight: ' + prog.name + '. ' + prog.desc));
        if (prog.id === 'openmic') rows.push(S.row('PLAY OPEN MIC  90 min', 'Fans, a little cash, and practice.', ch.energy < 16 ? 'dis' : 'gold', () => { S.closeSheet(); startPerform(S, 'openmic', { title: 'OPEN MIC', sub: 'the bar', bpm: 98 + Math.min(10, ch.level), bars: 10, difficulty: 0.4 + Math.min(0.3, ch.level * 0.02), style: 2, stage: 'lime' }); }));
        else if (prog.id === 'showcase') { const ok = ch.fans >= 50 && ch.n.openMics >= 5 && ch.lastShowcaseDay < ch.day - 6; rows.push(S.row('PLAY THE SHOWCASE  120 min', ok ? 'Paid slot. The big crowd.' : (ch.fans < 50 ? 'Need 50 fans.' : ch.n.openMics < 5 ? 'Need 5 open mics.' : 'One showcase a week.'), ok && ch.energy >= 22 ? 'gold' : 'dis', () => { if (!ok) { E.toast('Not ready for the showcase yet.', 'warn'); return; } S.closeSheet(); startPerform(S, 'showcase', { title: 'SHOWCASE', sub: 'friday night', bpm: 110, bars: 14, difficulty: 0.55 + Math.min(0.3, ch.level * 0.015), style: 3, stage: 'gold' }); })); }
        else if (prog.id === 'karaoke') rows.push(S.row('KARAOKE  75 min', 'Relaxed. Mood and fans.', ch.energy < 10 ? 'dis' : 'gold', () => { S.closeSheet(); startPerform(S, 'karaoke', { title: 'KARAOKE', sub: 'no pressure', bpm: 88, bars: 8, difficulty: 0.2, style: 0, stage: 'pink' }); }));
        else if (prog.id === 'battle') {
          const cd = ch.day - ch.lastBattleDay < Core.CFG.cooldownBattle && !ch.dev.noGates;
          rows.push(h('div.ts', null, cd ? 'You battled recently. Rest up.' : 'Pick your opponent. Five judges, three rounds.'));
          Core.OPPONENTS.forEach((o, i) => {
            const prev = i === 0 || ch.beat[Core.OPPONENTS[i - 1].id], lvlOk = ch.level >= o.level || ch.dev.noGates, ok = prev && lvlOk && !cd && ch.energy >= 20;
            rows.push(S.row(o.name.toUpperCase() + (ch.beat[o.id] ? '  (BEATEN)' : ''), prev ? (lvlOk ? 'Tier ' + o.tier + '  ' + o.bpm + ' bpm' : 'Reach level ' + o.level) : 'Beat ' + Core.OPPONENTS[i - 1].name + ' first', ok ? (ch.beat[o.id] ? '' : 'pink') : 'dis', () => { if (!ok) { E.toast(cd ? 'Cooling down.' : !prev ? 'Beat the previous opponent first.' : !lvlOk ? 'Reach level ' + o.level + '.' : 'Too tired.', 'warn'); return; } S.closeSheet(); E.dialog([{ look: o.look, name: o.name, text: o.taunt, mood: 'angry' }], () => startBattle(S, o)); }));
          });
          const all = Core.OPPONENTS.every((o) => ch.beat[o.id]);
          if (all && !ch.flags.worldcup) rows.push(S.row('THE WORLD CUP', ch.level >= 15 || ch.dev.noGates ? 'Three finals in a row. No cooldown. Go.' : 'Reach level 15.', ch.level >= 15 || ch.dev.noGates ? 'gold' : 'dis', () => { if (ch.level < 15 && !ch.dev.noGates) { E.toast('Reach level 15.', 'warn'); return; } S.closeSheet(); E.dialog([{ who: 'rohzel', text: 'the world cup. three battles, no breaks. i will pour you a water between them. go.' }], () => startBattle(S, Core.FINALS[0], 'wc1', Core.FINALS.slice(1).map((f, i) => Object.assign({}, f, { id: 'wc' + (i + 2) })))); }));
        } else rows.push(h('div.ts', null, 'Closed. Come back tomorrow.'));
        S.sheet('THE STAGE', rows, { maxH: '300px' });
      },
      counter(S) {
        S.sheet('JUICE BAR', foodRows(S, false).concat([S.row('YOUR CREW  ' + G.ch.crew.length + '/' + Core.CREW.length, 'Recruit helpers who earn you cash and fans every day.', 'gold', () => G.openCrew()), jobRow(S, 'dishes'), S.row('CHAT WITH ROHZEL', '', '', () => { S.closeSheet(); E.dialog([{ who: 'rohzel', text: tip('rohzel') }]); })]), { maxH: '300px' });
      },
    },
  };
  // Mingle: tap a regular
  const basePointer = E.scenes.place.pointer;
  E.scenes.place.pointer = function (type, x, y) {
    if (type === 'down' && this.id === 'bar') {
      for (const r of this.regulars()) if (Math.abs(x - r.x) < 22 && y > r.y - 84 && y < r.y + 6) { this.walkTo('stage'); this.walkQueue = null; this.mingleMenu(r.id); return; }
    }
    if (type === 'down' && this.id === 'home') { const f = this.npcs().find((n) => n.id === 'foxy'); if (f && Math.abs(x - f.x) < 22 && y > f.y - 84 && y < f.y + 6) { E.dialog([{ who: 'foxy', text: tip('foxy') }]); return; } }
    basePointer.call(this, type, x, y);
  };
  E.scenes.place.mingleMenu = function (who) {
    const n = Core.NPCS[who], aff = G.ch.affinity[who] || 0, S = this;
    S.sheet(n.name.toUpperCase(), [h('div.ts', null, n.role + '. Affinity ' + aff + '/10'),
      S.row('CHAT  45 min', 'Make conversation. Might be good.', G.ch.energy < 6 ? 'dis' : '', () => { G.do({ t: 'mingle', who }); S.mingleMenu(who); }),
      S.row('ASK OUT  $' + Core.CFG.dateCost, aff >= 4 ? 'A proper date. 2 hours.' : 'Chat a few more times first.', aff >= 4 && G.ch.cash >= Core.CFG.dateCost ? 'pink' : 'dis', () => { if (aff < 4) { E.toast('Get to know them first.', 'warn'); return; } S.closeSheet(); G.do({ t: 'date', who }); })]);
  };

  /* ------------------------------------------------------------------ shop */
  G.openShop = function (S, tab) {
    S.closeSheet(); if (S.shop) S.shop.el.remove();
    const st = { tab: tab || 'top', sel: null, look: Core.clone(G.ch.look) }; S.shop = st;
    const tabs = [['top', 'shirt', 'TOPS'], ['bottom', 'pants', 'PANTS'], ['shoes', 'shoe', 'SHOES'], ['hat', 'hat', 'HATS'], ['glasses', 'glasses', 'SHADES'], ['acc', 'star', 'EXTRAS']];
    const el = h('div.panel.sheet', { style: { height: '212px', padding: '0', zIndex: 15 } }); st.el = el; E.add(el);
    const tabsEl = h('div.tabs', { style: { position: 'absolute', left: 0, right: 0, top: '-22px' } }), body = h('div', { style: { position: 'absolute', left: '6px', right: '6px', top: '4px', bottom: '4px', display: 'flex', flexDirection: 'column', gap: '4px' } });
    el.append(tabsEl, body);
    const worn = (g, id) => { const L = st.look; switch (g) { case 'top': return L.top.id === id; case 'bottom': return L.bottom.id === id; case 'shoes': return L.shoes.id === id; case 'hat': return L.hat.id === id; case 'glasses': return L.glasses.id === id; case 'acc': return CAT.ACC_SLOTS.some((s) => L.acc[s].id === id); default: return false; } };
    const tryOn = (g, id) => { const L = st.look, it = CAT.GROUPS[g].find((x) => x.id === id); if (g === 'acc') L.acc[it.slot].id = id; else L[g].id = id; };
    const render = () => {
      tabsEl.innerHTML = ''; body.innerHTML = '';
      for (const [id, icon, label] of tabs) { const t = h('div.tab' + (st.tab === id ? '.on' : ''), null, E.iconEl(icon, 1)); t.addEventListener('click', () => { st.tab = id; st.sel = null; E.sfx('click'); render(); }); tabsEl.appendChild(t); }
      const items = CAT.GROUPS[st.tab].filter((it) => it.unlock.t === 'shop' || (it.unlock.t !== 'free' && G.ch.owned[CAT.key(st.tab, it.id)]));
      const grid = h('div.grid.scroll', { style: { flex: '1', maxHeight: '104px' } });
      for (const it of items) {
        const owned = Core.isUnlocked(G.ch, st.tab, it.id), stock = it.unlock.t !== 'shop' || G.ch.level >= it.unlock.lvl || owned;
        let pix = null; try { pix = BBH.Chars.thumb(st.tab, it.id, st.look); } catch (e) { pix = null; }
        const tile = h('div.tile' + (st.sel === it.id ? '.on' : '') + (stock ? '' : '.lock'), null, pix ? E.pixEl(pix, 1) : h('div.tp', null, '?'), owned ? h('div.lk', null, E.iconEl('check', 1)) : null, !owned && it.unlock.t === 'shop' ? h('div.pr', null, '$' + it.unlock.price) : null);
        tile.addEventListener('click', () => { st.sel = it.id; tryOn(st.tab, it.id); E.sfx('equip'); E.burst(180, 173, 8, { colors: [PAL.neonCyan, PAL.gold], speed: 65, gravity: 20, life: 400 }); render(); });
        grid.appendChild(tile);
      }
      if (!items.length) grid.appendChild(h('div.ts', null, 'Nothing here yet. Level up for new stock.'));
      body.appendChild(grid);
      const it = st.sel && CAT.GROUPS[st.tab].find((x) => x.id === st.sel), info = h('div.col', { style: { gap: '3px' } });
      if (it) {
        const owned = Core.isUnlocked(G.ch, st.tab, it.id), stock = it.unlock.t !== 'shop' || G.ch.level >= it.unlock.lvl || owned;
        info.append(h('div.h2', null, it.name.toUpperCase()), h('div.ts', null, owned ? 'You own this.' : stock ? 'Price $' + it.unlock.price + '   You have $' + G.ch.cash : 'Not in stock for you yet: level ' + it.unlock.lvl));
        const btns = h('div.row');
        if (!owned) btns.appendChild(E.btn('BUY $' + it.unlock.price, stock && G.ch.cash >= it.unlock.price ? 'gold' : 'dis', () => { G.do({ t: 'buy', group: st.tab, id: it.id }); render(); G.setChar(G.ch); }, { flex: 1 }));
        else btns.appendChild(E.btn('WEAR IT', 'green', () => { const L = Core.clone(G.ch.look); if (st.tab === 'acc') L.acc[it.slot].id = it.id; else L[st.tab].id = it.id; G.do({ t: 'equip', look: L }); S.look = BBH.Chars.fix(G.ch.look); st.look = Core.clone(G.ch.look); E.toast('Equipped ' + it.name, 'good'); render(); }, { flex: 1 }));
        info.appendChild(btns);
      } else info.appendChild(h('div.ts', null, 'Tap an item to try it on. Gold items are earned, not bought.'));
      body.appendChild(info); body.appendChild(E.btn('LEAVE SHOP', '', () => { el.remove(); S.shop = null; }, { padding: '4px' }));
    };
    render();
    // the try-on look is drawn by the scene (so the player sees the preview)
    S.tryLook = st;
  };
  const baseDraw = E.scenes.place.draw;
  E.scenes.place.draw = function (c) {
    baseDraw.call(this, c);
    if (this.shop && this.shop.el.isConnected) {      // big try-on preview with a spotlight
      c.save(); c.fillStyle = 'rgba(14,9,30,.55)'; c.fillRect(0, k(62), E.W, k(190)); c.restore();
      E.drawGlow(c, 180, 213, 95, PAL.neonViolet, 0.25);
      E.hero(c, BBH.Chars.fix(this.shop.look), 'idle', 180, k(250), { scale: 2, t: E.t });
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ------------------------------------------------------------------ hood map */
// An overhead map of the neighbourhood (inspired by Beatbox Story): tap a place to see if it is open and travel there.
(function (root) {
  'use strict';
  const BBH = root.BBH, E = BBH.E, Core = BBH.Core, PAL = BBH.PAL, G = BBH.G, h = E.h;
  const NAMES = { home: 'HOME', park: 'PARK', shop: 'THRIFT SHOP', studio: 'SOUND LAB', bar: 'THE BAR' };
  const INFO = { home: 'Sleep, eat, train in the vocal booth, change clothes.', park: 'Busk for tips and fans. Meet BeeAmGee.', shop: 'Buy clothes, hats and shades.', studio: 'Train faster for $' + Core.STUDIO_FEE + '. Jukebox.', bar: 'Open mic, showcase, battles, karaoke.' };
  const vs = (ch) => { const n = Core.nightness(ch.minutes); return n < 0.25 ? ['day', null, 0] : n < 0.5 ? ['day', 'dusk', (n - 0.25) / 0.25] : n < 0.8 ? ['dusk', 'night', (n - 0.5) / 0.3] : ['night', null, 0]; };
  E.scenes.map = {
    enter() {
      const [a, b, m] = vs(G.ch); this.a = a; this.b = b; this.mix = m; this.scA = this.load(a); this.scB = b ? this.load(b) : null; this.sel = null;
      if (!this.scA) { E.go('street'); return; }
      E.music('street'); this.build();
    },
    load(v) { try { return BBH.World.scene('hoodmap', v); } catch (e) { return null; } },
    build() {
      E.clearUI(); E.add(E.makeHud(G));
      E.add(E.btn('BACK', '', () => G.resume(), { position: 'absolute', left: '4px', top: '43px', width: '44px', height: '17px', padding: '5px 0', fontSize: '5px' }));
      E.add(h('div.tp', { style: { position: 'absolute', left: '52px', right: '4px', top: '43px', padding: '3px 4px', background: 'rgba(18,13,31,.82)', color: PAL.cream, fontSize: '5px', lineHeight: '7px', boxShadow: '0 0 0 1px var(--ink)' } }, 'TAP A PLACE TO TRAVEL'));
      this.card = null;
    },
    showCard(id) {
      this.sel = id; if (this.card) this.card.remove();
      const ok = Core.canEnter(G.ch, id), here = G.ch.place === id;
      this.card = h('div.panel.sheet.pop', { style: { padding: '8px', zIndex: 15 } },
        h('div.row', { style: { justifyContent: 'space-between' } }, h('div.h2', null, NAMES[id]), h('div.tp', { style: { color: ok.ok ? '#7be08f' : '#ff7b8e' } }, ok.ok ? 'OPEN' : 'CLOSED')),
        h('div.ts', { style: { margin: '4px 0 6px' } }, ok.ok ? INFO[id] : ok.reason),
        E.btn(here ? 'ENTER' : 'GO THERE', ok.ok ? 'gold' : 'dis', () => { if (here && G.ch.place !== 'street') G.goPlace(id); else G.enterPlace(id); }));
      E.add(this.card); E.sfx('click');
    },
    pointer(type, x, y) {
      if (type !== 'down') return; const hs = ((this.scA && this.scA.hotspots) || []).find((q) => x >= q.x - 6 && x <= q.x + q.w + 6 && y >= q.y - 6 && y <= q.y + q.h + 6);
      if (hs) this.showCard(hs.id);
    },
    draw(c) {
      const draw1 = (sc, a) => { if (!sc) return; c.save(); c.globalAlpha = a; for (const l of sc.layers) l.pix.draw(c, 0, 0); c.restore(); };
      draw1(this.scA, 1); if (this.scB) draw1(this.scB, this.mix);
      const sc = this.scB && this.mix > 0.5 ? this.scB : this.scA, n = Core.nightness(G.ch.minutes);
      for (const l of (sc && sc.lights) || []) { const on = l.kind === 'window' ? Math.max(0, (n - 0.3) * 1.5) : n; if (on > 0.02) E.drawGlow(c, l.x, l.y, l.r, l.color, (l.a === undefined ? 0.5 : l.a) * on * (l.flicker ? 0.8 + 0.2 * Math.sin(E.t / 90 + l.x) : 1)); }
      // pins
      for (const hs of (this.scA && this.scA.hotspots) || []) {
        const sp = (this.scA.spots || {})[hs.id] || { x: hs.x + hs.w / 2, y: hs.y }, ok = Core.canEnter(G.ch, hs.id).ok, bob = Math.round(Math.sin(E.t / 260 + hs.x) * 3), sel = this.sel === hs.id;
        c.save(); c.translate(sp.x, sp.y - 26 + bob); c.fillStyle = PAL.ink; c.fillRect(-14, -9, 28, 20); c.fillStyle = sel ? PAL.gold : ok ? '#7b4fe0' : '#5a3a4a'; c.fillRect(-13, -8, 26, 18); c.restore();
        E.icon(hs.id).draw(c, sp.x - 8, sp.y - 26 + bob - 6); if (!ok) E.icon('lock').draw(c, sp.x + 4, sp.y - 26 + bob - 12);
        E.txt(c, NAMES[hs.id], sp.x, sp.y - 8 + bob, { align: 'c', color: sel ? PAL.gold : PAL.cream });
        if (G.ch.place === hs.id) E.txt(c, 'YOU ARE HERE', sp.x, sp.y + 4, { align: 'c', color: PAL.neonLime });
      }
      if (n > 0.6) E.rain(c, E.t, { n: 12, color: 'rgba(170,200,255,.2)' });
    },
  };
  // a MAP button on the street and in every place (added after the scenes exist)
  const sBuild = E.scenes.street.build, pBuild = E.scenes.place.build;
  E.scenes.street.build = function () { sBuild.call(this); E.add(E.btn('MAP', 'cyan', () => E.go('map'), { position: 'absolute', right: '30px', top: '43px', width: '30px', height: '17px', padding: '5px 0', fontSize: '5px' })); const g = this.goalEl; if (g) g.style.right = '64px'; };
  E.scenes.place.build = function () { pBuild.call(this); E.add(E.btn('MAP', 'cyan', () => { this.closeSheet(); E.go('map'); }, { position: 'absolute', left: '52px', top: '43px', width: '30px', height: '17px', padding: '5px 0', fontSize: '5px' })); };
})(typeof globalThis !== 'undefined' ? globalThis : this);
