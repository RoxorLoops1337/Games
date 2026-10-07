// BEATBOX HEROES r3 -- hud3d.js (UI owner)
// Real-pixel HUD for the 3D scenes. Same contract as E.makeHud: `el.update(ch)`, `E.hudEl = el`, secret dev door = 3 taps on the clock chip.
//   const el = BBH.R3UI.hud.create(G, { nav, goal, menu, map, onPlace(id, info), onMenu(), onMap(), parent })
//   el.update(ch)                      refresh from a save (cheap: writes only changed values)
//   el.setNav({ show, here, goal, locked:{id:reason} })   bottom dock with the 5 place buttons (locked/goal/here are also auto-derived from Core)
//   el.setGoal(text|null)  el.show(bool)  el.destroy()  el.topHeight()
// Layout: top = [clock | cash | fans | level ring], [3 need rings ... MAP MENU], goal chip; bottom = nav dock.
// CSS vars published on :root: --h3-top (px below which scene UI may sit), --h3-dock (dock height incl. margin, 0 when hidden).
// Needs theme3d.css and body.r3 to be visible (the #hud3 layer is display:none otherwise).
(function (root) {
  'use strict';
  const BBH = root.BBH = root.BBH || {};
  const R3UI = BBH.R3UI = BBH.R3UI || {};
  const PLACES = [['park', 'PARK'], ['home', 'HOME'], ['shop', 'SHOP'], ['studio', 'LAB'], ['bar', 'BAR']];
  const NS = 'http://www.w3.org/2000/svg';
  const ic = (n) => (BBH.R3Icons ? BBH.R3Icons.svg(n) : '');
  const mk = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const fmt = (n) => { n = Math.round(+n || 0); return n >= 1e4 ? n.toLocaleString('en-US') : String(n); };
  const clamp = (v) => Math.max(0, Math.min(1, isFinite(v) ? v : 0));

  function layer(parent) {
    let l = document.getElementById('hud3');
    if (!l) { l = mk('div'); l.id = 'hud3'; (parent || document.body).appendChild(l); }
    return l;
  }
  function ringSvg() {
    return '<svg class="arc" viewBox="0 0 44 44" aria-hidden="true"><circle class="trk" cx="22" cy="22" r="19"/><circle class="val" cx="22" cy="22" r="19" pathLength="100" stroke-dasharray="100 100"/></svg>';
  }

  R3UI.hud = {
    create(G, opts) {
      opts = Object.assign({ nav: false, goal: true, menu: true, map: true }, R3UI.hudDefaults || {}, opts || {});
      const E = BBH.Eng || BBH.E, Core = BBH.Core;
      const host = layer(opts.parent);
      if (host._hud) { try { host._hud.destroy(); } catch (e) { /* ignore */ } }
      const el = mk('div', 'h3');
      // ---- top
      const top = mk('div', 'h3-top'); el.appendChild(top);
      const r1 = mk('div', 'h3-row'), r2 = mk('div', 'h3-row'); top.append(r1, r2);
      const clk = mk('button', 'h3-clk h3-glass'); clk.type = 'button'; clk.setAttribute('aria-label', 'Day and time');
      clk.innerHTML = '<span class="ci"></span><span><small></small><b></b></span>';
      const cash = mk('div', 'h3-pill cash h3-glass', ic('coin') + '<b></b>'), fans = mk('div', 'h3-pill fans h3-glass', ic('fans') + '<b></b>');
      const lvl = mk('div', 'h3-lvl', '<svg class="arc" viewBox="0 0 44 44" aria-hidden="true"><circle class="trk" cx="22" cy="22" r="19"/><circle class="val" cx="22" cy="22" r="19" pathLength="100" stroke-dasharray="0 100"/></svg><b></b>');
      lvl.setAttribute('role', 'img');
      r1.append(clk, cash, fans, mk('div', 'h3-sp'), lvl);
      const needs = mk('div', 'h3-needs h3-glass');
      const mkNeed = (cls, icon, label) => { const r = mk('div', 'h3-ring ' + cls, ringSvg() + ic(icon)); r.setAttribute('role', 'img'); r.setAttribute('aria-label', label); r.title = label; needs.appendChild(r); return { r, v: r.querySelector('.val') }; };
      const en = mkNeed('en', 'energy', 'Energy'), fd = mkNeed('fd', 'food', 'Food'), md = mkNeed('md', 'mood', 'Mood');
      r2.append(needs, mk('div', 'h3-sp'));
      const mkBtn = (cls, icon, label, fn) => { const b = mk('button', 'h3-btn ' + cls, ic(icon) + '<span>' + label + '</span>'); b.type = 'button'; b.setAttribute('aria-label', label); b.addEventListener('click', (ev) => { ev.stopPropagation(); try { E && E.sfx && E.sfx('click'); } catch (x) { /* ignore */ } fn(ev); }); return b; };
      const btnMap = opts.map ? mkBtn('cy', 'map', 'MAP', () => (opts.onMap ? opts.onMap() : (E && E.go && E.go('map')))) : null;
      const btnMenu = opts.menu ? mkBtn('', 'gear', 'MENU', () => (opts.onMenu ? opts.onMenu() : (G && G.openMenu && G.openMenu()))) : null;
      if (btnMap) r2.appendChild(btnMap); if (btnMenu) r2.appendChild(btnMenu);
      const goal = mk('div', 'h3-goal h3-glass', ic('flag') + '<span></span>'); goal.hidden = !opts.goal; top.appendChild(goal);
      // ---- dock
      const dock = mk('div', 'h3-dock h3-glass'); dock.hidden = true; el.appendChild(dock);
      const navBtns = {};
      PLACES.forEach(([id, label]) => {
        const b = mk('button', 'h3-nb', ic(id) + '<span>' + label + '</span>'); b.type = 'button'; b.setAttribute('aria-label', label);
        b.addEventListener('click', (ev) => {
          ev.stopPropagation(); const info = { locked: !!nav.locked[id], reason: nav.locked[id] || '' };
          try { E && E.sfx && E.sfx(info.locked ? 'error' : 'click'); } catch (x) { /* ignore */ }
          if (info.locked) { b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); }
          if (opts.onPlace) opts.onPlace(id, info);
        });
        dock.appendChild(b); navBtns[id] = b;
      });
      const nav = { show: !!opts.nav, here: null, goal: null, locked: {}, manual: false };
      host.appendChild(el); host._hud = el;

      // ---- state / update
      const last = {};
      const setText = (node, key, v) => { if (last[key] !== v) { last[key] = v; node.textContent = v; return true; } return false; };
      const ring = (n, key, frac, low) => { const v = Math.round(clamp(frac) * 100); if (last[key] !== v) { last[key] = v; n.v.setAttribute('stroke-dasharray', v + ' 100'); } if (last[key + 'L'] !== low) { last[key + 'L'] = low; n.r.classList.toggle('low', low); } };
      const clkI = clk.querySelector('.ci'), clkS = clk.querySelector('small'), clkB = clk.querySelector('b');
      const cashB = cash.querySelector('b'), fansB = fans.querySelector('b'), lvlB = lvl.querySelector('b'), lvlV = lvl.querySelector('.val'), goalS = goal.querySelector('span');
      const bump = (node) => { node.classList.remove('bump'); void node.offsetWidth; node.classList.add('bump'); };
      function measure() {
        try {
          const b = top.getBoundingClientRect(), s = document.documentElement.style;
          s.setProperty('--h3-top', Math.ceil(b.bottom) + 'px');
          s.setProperty('--h3-dock', nav.show ? Math.ceil(window.innerHeight - dock.getBoundingClientRect().top + 8) + 'px' : '0px');
        } catch (e) { /* ignore */ }
      }
      function applyNav() {
        dock.hidden = !nav.show;
        for (const [id] of PLACES) { const b = navBtns[id]; b.classList.toggle('here', nav.here === id); b.classList.toggle('goal', nav.goal === id && nav.here !== id); const lk = !!nav.locked[id]; b.classList.toggle('locked', lk); const had = b.querySelector('.lkb'); if (lk && !had) b.insertAdjacentHTML('beforeend', ic('lock').replace('class="i3', 'class="i3 lkb lk')); else if (!lk && had) had.remove(); }
        requestAnimationFrame(measure);
      }
      el.update = function (ch) {
        ch = ch || (G && G.ch); if (!ch) return;
        const night = Core && Core.nightness ? Core.nightness(ch.minutes) > 0.5 : false;
        if (last.night !== night) { last.night = night; clkI.innerHTML = ic(night ? 'moon' : 'sun'); }
        setText(clkS, 'dn', (Core && Core.dayName ? Core.dayName(ch.day).slice(0, 3).toUpperCase() : 'DAY') + ' ' + ch.day);
        setText(clkB, 'cl', Core && Core.clock ? Core.clock(ch.minutes) : '00:00');
        if (setText(cashB, 'cash', '$' + fmt(ch.cash)) && last.cashSeen) bump(cash); last.cashSeen = true;
        if (setText(fansB, 'fans', fmt(ch.fans)) && last.fansSeen) bump(fans); last.fansSeen = true;
        setText(lvlB, 'lv', String(ch.level)); lvl.setAttribute('aria-label', 'Level ' + ch.level);
        const need = Core && Core.xpNeed ? Core.xpNeed(ch.level) : 100, xv = Math.round(clamp(ch.xp / need) * 100);
        if (last.xp !== xv) { last.xp = xv; lvlV.setAttribute('stroke-dasharray', xv + ' 100'); lvl.title = 'XP ' + ch.xp + '/' + need; }
        ring(en, 'en', ch.energy / (ch.maxEnergy || 100), ch.energy < 20); ring(fd, 'fd', ch.hunger / 100, ch.hunger < 20); ring(md, 'md', ch.mood / 100, ch.mood < 20);
        en.r.setAttribute('aria-label', 'Energy ' + Math.round(ch.energy)); fd.r.setAttribute('aria-label', 'Food ' + Math.round(ch.hunger)); md.r.setAttribute('aria-label', 'Mood ' + Math.round(ch.mood));
        if (opts.goal && !nav.goalText) { let g = ''; try { g = G && G.goal ? G.goal(ch) : ''; } catch (e) { g = ''; } setText(goalS, 'goal', g); goal.hidden = !g; }
        if (nav.show) {
          let changed = false;
          if (!nav.manual) {
            const lk = {}; PLACES.forEach(([id]) => { try { const ok = Core.canEnter(ch, id); if (!ok.ok) lk[id] = ok.reason; } catch (e) { /* ignore */ } });
            const key = JSON.stringify(lk) + '|' + ch.place; if (last.lk !== key) { last.lk = key; nav.locked = lk; nav.here = ch.place && ch.place !== 'street' ? ch.place : null; changed = true; }
          }
          if (!nav.manualGoal) { let gd = null; try { gd = G && G.goalDoor ? G.goalDoor() : null; } catch (e) { gd = null; } if (gd && gd.id) gd = gd.id; if (nav.goal !== gd) { nav.goal = gd; changed = true; } }
          if (changed) applyNav();
        }
      };
      el.setNav = function (s) {
        s = s || {}; if ('show' in s) nav.show = !!s.show; if ('here' in s) nav.here = s.here; if ('goal' in s) { nav.goal = s.goal; nav.manualGoal = true; } if ('locked' in s) { nav.locked = s.locked || {}; nav.manual = true; }
        applyNav();
      };
      el.setGoal = function (text) { nav.goalText = text != null; if (text != null) { goalS.textContent = text; goal.hidden = !text; } else last.goal = null; };
      el.show = function (b) { el.style.display = b === false ? 'none' : ''; requestAnimationFrame(measure); };
      el.topHeight = () => Math.ceil(top.getBoundingClientRect().bottom);
      el.buttons = { map: btnMap, menu: btnMenu, clock: clk, dock, nav: navBtns };
      el.destroy = function () { if (host._hud === el) host._hud = null; el.remove(); if (E && E.hudEl === el) E.hudEl = null; document.documentElement.style.setProperty('--h3-top', '56px'); document.documentElement.style.setProperty('--h3-dock', '0px'); window.removeEventListener('resize', measure); };
      // the secret dev door: triple tap the clock
      let taps = 0, tt = 0;
      clk.addEventListener('click', (ev) => { ev.stopPropagation(); const n = performance.now(); taps = n - tt < 600 ? taps + 1 : 1; tt = n; if (taps >= 3) { taps = 0; if (G && G.openDev) G.openDev(); } });
      window.addEventListener('resize', measure);
      if (E) E.hudEl = el;
      applyNav(); if (G && G.ch) el.update(G.ch); setTimeout(measure, 60);
      return el;
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
