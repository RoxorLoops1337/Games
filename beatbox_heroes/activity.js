// BEATBOX HEROES -- activity.js: the RETURN TICKET. One rule for every activity, 2D and 3D (?r=3d):
//   when an activity ends you stand in the same place, at the spot where you started it (no walk in from the door), and every result card offers
//   PLAY AGAIN / TRAIN AGAIN (same activity, same level and settings, greyed with the Core reason when energy, cash, time or opening hours say no),
//   BACK (the selection menu that launched it, reopened at that spot) and CONTINUE (just stand there).
// Classic script, loaded after game.js. Nothing here changes a rule: AGAIN replays the same E.go(scene, args) the launcher used, the place scenes do the landing.
//   G.activityReturn = { place, spot, hot, pos, scene, args, label, menu, mode }   recorded by E.go when a place scene starts an activity scene (ACT), consumed by the
//       next place scene enter (G.takeReturn). spot = the 3D spot id, hot = the 2D hotspot (G.places.ACTIONS key), pos = where the player stood ({x, z, h} in 3D, {x, y} in 2D),
//       menu(S) = reopens the launching menu (default: the spot's own action), mode = null | 'stay' | 'menu' | 'again' (set by the card buttons).
//   G.retHint({ label, menu })   one-shot extras for the next ticket (the training menu passes its own skill / game / level menu)
//   G.canAgain(t?) -> { ok, reason }      G.retActs(o?) -> [{ id: 'again'|'back'|'continue', label, cls, dis, reason, pre }]  (pre() sets the mode, the card then runs its own CONTINUE path)
//   G.retMode(mode)   G.takeReturn(placeId, args) -> ticket | null   G.retRow2d(then, o) -> the three buttons for the 2D DOM cards
// E.go is wrapped: an activity scene left with mode 'again' (and no morning card pending) starts the same activity again instead of going back to the place.
(function (root) {
  'use strict';
  const BBH = root.BBH, E = BBH && (BBH.Eng || BBH.E), G = BBH && BBH.G, Core = BBH && BBH.Core;
  if (!E || !G || !Core || typeof E.go !== 'function') return;
  const ACT = { rhythm: 1, run: 1, tuner: 1, seq: 1, studio: 1, ear: 1, pose: 1, creator: 1 };
  const NO_AGAIN = { creator: 1, studio: 1 };
  const safe = (fn, d) => { try { return fn(); } catch (e) { console.error('[return]', e); return d; } };
  let hint = null;
  G.activityReturn = null;
  G.retHint = (x) => { hint = x ? Object.assign({ at: Date.now() }, x) : null; };
  G.retMode = (m) => { if (G.activityReturn) G.activityReturn.mode = m || null; };

  const placeOf = (a) => { if (!a) return null; if (a.place && Core.PLACES[a.place]) return a.place; if (a.back && a.back.args && Core.PLACES[a.back.args.id]) return a.back.args.id; if (typeof a.back === 'string' && Core.PLACES[a.back]) return a.back; return null; };
  // 3D spot id <-> 2D hotspot key (r3/spotmap.js tables; the park busk spot is the 2D 'spot')
  const keyOf = (place, spot) => { const SM = BBH.R3Spots; if (!spot || !SM || !SM.resolve) return spot || null; const r = SM.resolve(place, spot); return r && r.kind === 'act' ? r.key : spot; };
  const spotOf = (place, key) => { const SM = BBH.R3Spots; if (!key) return null; if (SM && SM.spotFor) return SM.spotFor(place, key) || key; return key === 'spot' && place === 'park' ? 'busk' : key; };

  function arm(name, args) {
    const S = E.scene, h = hint && Date.now() - hint.at < 3000 ? hint : null; hint = null;
    const t = { scene: name, args: args || {}, place: placeOf(args), spot: null, hot: null, pos: null, menu: (h && h.menu) || null, label: (h && h.label) || null, mode: null, day: G.ch ? G.ch.day : 0 };
    if (E.sceneName === 'place' && S && S.id) {
      t.place = S.id;
      if (S.is3d) {
        t.spot = S.activeSpot || null; t.hot = t.spot ? keyOf(S.id, t.spot) : (S.npcAct || null); if (!t.spot && t.hot) t.spot = spotOf(S.id, t.hot);
        safe(() => { const st = S.w && S.w.controls && S.w.controls.state(); if (st) t.pos = { x: st.x, z: st.z, h: st.heading }; });
      } else { t.hot = S.lastHot || null; t.spot = spotOf(S.id, t.hot); if (typeof S.hx === 'number') t.pos = { x: S.hx, y: S.hy }; }
    }
    G.activityReturn = t; return t;
  }

  /* ------------------------------------------------------------------ AGAIN: can we, and what is it called */
  G.canAgain = function (t) {
    t = t || G.activityReturn; const ch = G.ch, no = (r) => ({ ok: false, reason: r || 'Not now.' });
    if (!t || !t.scene || !ch || NO_AGAIN[t.scene]) return no('Nothing to repeat.');
    if (G.pendingMorning) return no('A new day starts first.');
    const a = t.args || {}, P = t.place, C = Core.TRAIN_CFG || {}, pm = C.playMinutes || {}, eph = C.energyPerHour || 12;
    if (P && P !== 'home' && Core.PLACES[P]) { const e = Core.canEnter(ch, P); if (!e.ok) return no(e.reason); }
    const where = a.where || (a.train && a.train.where) || null; let need = 10, fee = where === 'studio';
    switch (t.scene) {
      case 'rhythm': {
        const m = a.mode || 'perform', prog = Core.barProgramme(ch.day);
        if (m === 'battle') {
          if (a.final) return no('The World Cup is one run.');
          if (P === 'bar' && prog.id !== 'battle') return no('No battles tonight. Tonight: ' + prog.name + '.');
          if (ch.day - ch.lastBattleDay < Core.CFG.cooldownBattle && !(ch.dev && ch.dev.noGates)) return no('You battled recently. Rest up.');
          need = 20;
        } else if (m === 'perform') {
          need = { busk: 14, openmic: 16, showcase: 22, karaoke: 10 }[a.kind] || 14;
          if (P === 'bar' && prog.id !== a.kind) return no('Tonight: ' + prog.name + '.');
          if (a.kind === 'showcase' && ch.lastShowcaseDay >= ch.day - 6) return no('One showcase a week.');
        } else if (m === 'train') need = eph * (pm.beat || 20) / 60;
        else { need = 12; if (!where && P === 'studio') fee = true; }
        break;
      }
      case 'run': need = 14; break;
      case 'tuner': need = a.train ? eph * (pm.tune || 20) / 60 : 10; break;
      case 'seq': need = a.train ? eph * (pm.make || 25) / 60 : 10; break;
      case 'ear': need = eph * (pm.ear || 20) / 60; break;
      case 'pose': need = eph * (pm.pose || 20) / 60; break;
      default: return no('Nothing to repeat.');
    }
    if (fee && ch.cash < Core.STUDIO_FEE) return no('The studio costs $' + Core.STUDIO_FEE + '.');
    if (ch.energy < need) return no('Too tired. Eat, nap or sleep first.');
    if (Core.CFG.collapseAt && ch.minutes + 20 >= Core.CFG.collapseAt) return no('It is too late. Go home and sleep.');
    return { ok: true, reason: '' };
  };
  function againLabel(t) {
    if (t.label) return t.label; const a = t.args || {};
    if (t.scene === 'rhythm' && (a.mode === 'battle' || !a.mode || a.mode === 'perform')) return 'PLAY AGAIN';
    if (t.scene === 'run') return 'RUN AGAIN';
    return 'TRAIN AGAIN';
  }
  // the buttons of a result card. o.only: CONTINUE only (World Cup finals). pre() records the choice, the card then runs its own CONTINUE path.
  G.retActs = function (o) {
    o = o || {}; const t = G.activityReturn, out = [];
    if (!o.only && t && t.scene && !NO_AGAIN[t.scene] && !o.noAgain) { const c = G.canAgain(t); out.push({ id: 'again', label: againLabel(t), cls: 'alt', dis: !c.ok, reason: c.reason, pre: () => G.retMode('again') }); }
    if (!o.only && t && t.place) out.push({ id: 'back', label: 'BACK', cls: 'alt', dis: false, reason: '', pre: () => G.retMode('menu') });
    out.push({ id: 'continue', label: 'CONTINUE', cls: '', dis: false, reason: '', pre: () => G.retMode('stay') });
    return out;
  };
  // 2D DOM cards: the three buttons (then = what the card's CONTINUE did)
  G.retRow2d = function (then, o) {
    const h = E.h, acts = G.retActs(o), row = h('div.row', { style: { gap: '4px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '4px' } }); let why = '';
    for (const a of acts) {
      const b = E.btn(a.label, a.dis ? 'dis' : a.id === 'continue' ? 'gold big' : 'cyan', () => { if (a.dis) { E.toast(a.reason, 'warn'); E.sfx('error'); return; } a.pre(); then(); }, { flex: a.id === 'continue' ? '1 1 100%' : '1 1 40%' });
      b.setAttribute('data-act', a.id); row.appendChild(b); if (a.dis && a.reason) why = a.reason;
    }
    return why ? h('div.col', { style: { gap: '3px' } }, row, h('div.ts.ctr', { 'data-why': '1', style: { color: '#ff9ad0' } }, why)) : row;
  };

  /* ------------------------------------------------------------------ landing (the place scenes call this in enter) */
  G.takeReturn = function (id, a) {
    const t = G.activityReturn; G.activityReturn = null;
    if ((a && a.morningFirst) || G.pendingMorning) return id === 'home' ? { place: 'home', spot: 'bed', hot: 'bed', pos: null, mode: 'stay', morning: true } : null;   // a new day: you wake up in bed
    if (!t || t.place !== id || t.mode === 'again') return null;
    return t;
  };

  /* ------------------------------------------------------------------ E.go: record the ticket, replay on AGAIN */
  const go0 = E.go;
  E.go = function (name, args, o) {
    const from = E.sceneName, t = G.activityReturn;
    if (ACT[name] && !ACT[from]) arm(name, args);
    else if (t && ACT[from] && !ACT[name] && t.mode === 'again') {
      t.mode = null;
      if (!G.pendingMorning) { const c = G.canAgain(t); if (c.ok) return go0.call(E, t.scene, t.args, o); safe(() => E.toast(c.reason, 'warn')); }
    } else if (t && !ACT[name] && name !== 'place') G.activityReturn = null;            // street, map, title: the ticket is void
    return go0.apply(E, arguments);
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
