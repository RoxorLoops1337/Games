// A UI-driven autoplayer for the Inkwoven integration suite (tests/hocus_vocus_game.test.mjs). Not a suite itself.
//
//   import { boot } from './hocus_vocus_lib.mjs';
//   import { makePlayer } from './hocus_vocus_player.mjs';
//   const g = boot({ autoboot: true, seed: 7 });
//   const p = makePlayer(g, { heroes: ['hanae', 'kuro'], trial: 0 });
//   await p.until(() => g.UI.currentName === 'victory', { steps: 3000 });
//
// It plays like a person: every action is a REAL pointer, drag or key event on the DOM the screens built (title plates, hero
// cards, story Skip, map taps on the canvas, combat hand cards, enemy hit areas, pick overlays, reward cards, shop plaques, camp
// tiles, forge, chest, gem cache, fable choices, pause menu). It never calls a screen's internals. The only things it reaches
// around the UI for are the DOCUMENTED cheats of a test harness (cfg.cheat): topping up Ink so a chain can be painted, topping up
// HP and gold so a long run is not lost by the greedy fight policy. With cheat false it plays on its own wits.
//
// API: makePlayer(g, cfg) -> { step(), until(pred, {steps}), log, stats, cfg, shown, last }
//   cfg: heroes [idA, idB], trial, seed text, daily, cheat (default true), plan (node kinds to visit per chapter, in order),
//        eventPick (index of the fable choice to take, -1 = last), dragPlays (play no-target cards by dragging), pickBy (a function
//        (screen, options) -> index for reward cards), maxCombatTurns.
//   With cheat on it also unlocks the requested heroes and the Ink Trial in the live profile (see the top of makePlayer).
//   step() does ONE thing for the current screen or overlay and resolves to a short label. Everything is virtual time (g._tick).
//   shown: Set of screen names and overlay names seen so far.  stats: counters (plays, drags, taps, ...).
export function makePlayer(g, cfg = {}) {
  const { GAME, UI, DATA, RUN, MAP, META } = g;     // the page namespaces (the headless loader's api, or window globals in a real browser)
  const doc = g._doc;
  const C0 = Object.assign({ heroes: ['hanae', 'kuro'], trial: 0, seed: '', daily: false, cheat: true, plan: ['enemy', 'shop', 'camp', 'chest', 'forge', 'gemcache', 'event', 'elite'], eventPick: 0, dragPlays: true, maxCombatTurns: 40, buy: true, hpCheat: 400 }, cfg);
  const stats = { plays: 0, drags: 0, taps: 0, turns: 0, fights: 0, paints: 0, walks: 0, steps: 0, rewards: 0, overlays: 0, swaps: 0, picks: 0 };
  const shown = new Set();
  const log = [];
  const state = { doneKinds: new Set(), chapter: 0, planIdx: 0, visited: {}, fightTurns: 0, lastKey: '', stuck: 0, brushTried: false, campDone: 0, shopBought: 0, evPick: C0.eventPick };

  // The documented cheat for a fresh profile: heroes 3 and 4 and the higher Ink Trials are locked until achievements are earned, so a
  // test that wants Suzu, Raiga or Trial 5 unlocks them in the live profile first (cfg.cheat only; locked CARDS stay locked).
  if (C0.cheat && META && META.profile) {
    try {
      const P = META.profile;
      C0.heroes.forEach((id) => { if (!META.isUnlocked('hero', id) && P.unlocked && Array.isArray(P.unlocked.hero)) P.unlocked.hero.push(id); });
      if (C0.trial > 0 && P.stats) { P.stats.wins = Math.max(P.stats.wins || 0, 1); P.stats.trialBest = Math.max(P.stats.trialBest || 0, C0.trial - 1); }
      if (META.save) META.save();
    } catch (e) { /* a profile that cannot be edited just leaves the screens to refuse, and the player reports it */ }
  }

  const $ = (sel, root) => (root || doc).querySelector(sel);
  const $$ = (sel, root) => [...(root || doc).querySelectorAll(sel)];
  const label = (el) => ((el.getAttribute && el.getAttribute('aria-label')) || el.textContent || '').trim().replace(/\s+/g, ' ');
  const isOff = (el) => el.disabled === true || (el.getAttribute && el.getAttribute('aria-disabled') === 'true');
  // the stub DOM has no layout: hidden = a `hidden` attribute or display none up the tree. A real browser adapter supplies g._visible (computed style and geometry)
  const stubHidden = (el) => { for (let e = el; e && e.nodeType === 1; e = e.parentNode) { if (e.hasAttribute && e.hasAttribute('hidden')) return true; if (e.style && e.style.display === 'none') return true; } return false; };
  const hiddenEl = (el) => (typeof g._visible === 'function' ? !g._visible(el) : stubHidden(el));
  const live = (sel, root) => $$(sel, root).filter((e) => !hiddenEl(e));
  const btns = (root) => live('button, [role=button]', root || doc).filter((e) => !isOff(e));
  const byLabel = (re, root) => btns(root).find((e) => re.test(label(e)));
  const STEP = C0.frameMs || 48;                        // virtual frame length: the game clamps dt at 50 ms, so 48 ms frames are the cheapest honest ones
  const tick = (ms = 400) => g._tick(ms, STEP);
  const from = (el) => (typeof g._centre === 'function' ? g._centre(el) : [640, 620]);   // where a drag starts, in stage px: the stub lets it start anywhere, a real browser must start ON the card
  const R = () => GAME.state.R;
  const note = (s) => { log.push(s); if (log.length > 300) log.shift(); return s; };
  const click = async (el, ms = 300) => { if (!el) { await tick(ms); return false; } const ok = await g._click(el); stats.taps++; await tick(ms); return ok; };   // nothing to press: let time pass (animations finish, buttons appear)

  const topOverlay = () => { const o = UI.overlay; if (!o || !o.count || o.count() === 0) return null; const t = o.top && o.top(); return t && (t.name || t.id) ? (t.name || t.id) : (doc.querySelector('#overlays .overlay:last-child') || {}).className || 'overlay'; };

  // ---------------------------------------------------------------------------------------------- overlays
  async function overlayStep() {
    const roots = $$('#overlays .overlay');
    const root = roots[roots.length - 1];
    const cls = String(root.className);
    const name = (/\bo-([a-zA-Z]+)/.exec(cls) || [])[1] || 'overlay';
    shown.add('overlay:' + name);
    stats.overlays++;
    if (name === 'confirm') { return click(byLabel(/^(yes|abandon|confirm|ok|remove|burn|sharpen|take)/i, root) || btns(root).find((b) => b.classList.contains('btn-primary') || b.classList.contains('btn-danger')) || btns(root)[0]).then(() => note('overlay confirm')); }
    if (name === 'modal') { const b = btns(root); return click(b.find((x) => /back to title|continue|ok|close|got it/i.test(label(x))) || b[b.length - 1]).then(() => note('overlay modal')); }
    if (name === 'pause') { const b = byLabel(/^resume/i, root) || btns(root)[0]; return click(b).then(() => note('overlay pause resume')); }
    if (name === 'deck' && $('.dk-socket', root)) {
      // socket mode: try cards until a gem fits, then press Done
      const grid = live('.card.dk-card, .card.c-deck', root).filter((c) => !c.classList.contains('c-big'));
      let cut = false;
      for (let i = 0; i < Math.min(grid.length, 12) && !cut; i++) {
        const fresh = live('.card.dk-card, .card.c-deck', $('#overlays .overlay:last-child')).filter((c) => !c.classList.contains('c-big'))[i];
        if (!fresh) break;
        await click(fresh, 80);
        const gem = live('.dk-gem', root).find((b) => !b.classList.contains('nofit'));
        if (!gem) continue;
        await click(gem, 80);
        const go = live('.dk-go', root).find((b) => !isOff(b));
        if (go) { await click(go, 200); cut = true; if ($$('.dk-state.bad', root).length) cut = false; }
      }
      stats.cuts = (stats.cuts || 0) + (cut ? 1 : 0);
      await click(byLabel(/^done$/i, root) || byLabel(/done|close|cancel/i, root), 250);
      return note('overlay socket ' + (cut ? 'cut' : 'nothing'));
    }
    if (name === 'deck' || name === 'cardPick') {
      const cards = live('.card:not(.back):not(.c-big)', root).filter((c) => !c.classList.contains('dis') && !isOff(c));
      const confirmBtn = () => { const bs = btns(root).filter((b) => !b.classList.contains('dk-chip') && !b.classList.contains('seg-b') && !b.classList.contains('menu-btn')); return bs.find((b) => b.classList.contains('dk-go')) || bs.find((b) => b.classList.contains('btn-primary') || b.classList.contains('btn-danger')) || bs.find((b) => /^(choose|confirm|take|select|keep|exhaust|discard|done|pick|ok)/i.test(label(b))); };
      const pend = R() && R().pending && R().pending[0];
      let want = 1;
      if (name === 'cardPick') { const p = UI.overlay.top && UI.overlay.top(); want = Math.max(1, (p && p.params && p.params.n) || (pend && pend.n) || 1); }
      const selected = () => $$('.card.sel, .card.selected', root).filter((c) => !c.classList.contains('c-big')).length;
      let guard = 0;
      while (selected() < Math.min(want, cards.length) && guard++ < 8) { const c = cards.find((x) => !/\bsel(ected)?\b/.test(String(x.className))); if (!c) break; await click(c, 120); }
      let n0 = UI.overlay.count();
      for (let i = 0; i < 4 && UI.overlay.count() >= n0; i++) {
        const cb = confirmBtn();
        if (!cb) break;
        await click(cb, 200);
        if (UI.overlay.count() < n0) break;
      }
      if (UI.overlay.count() >= n0) {
        const cl = btns(doc.querySelector('#overlays')).find((b) => b.classList.contains('btn') && /close|cancel|skip|back|done/i.test(label(b)));
        if (cl) await click(cl, 200);
      }
      return note('overlay ' + name);
    }
    if (name === 'relics' || name === 'legend' || name === 'settings') { UI.overlay.close(); await tick(200); return note('overlay ' + name + ' closed'); }
    const any = btns(root)[0];
    if (any) { await click(any); return note('overlay ' + name + ' button'); }
    UI.overlay.close(); await tick(200); return note('overlay ' + name + ' forced');
  }

  // ---------------------------------------------------------------------------------------------- screens
  async function title() {
    const hasRun = META.hasRun && META.hasRun();
    if (C0.continueRun && hasRun) { await click($('[data-act=continue]')); return note('title continue'); }
    const gate = $('.mn-gate');
    if (gate && !hiddenEl(gate)) await click(gate, 150);
    if (C0.daily) { await click($('[data-act=daily]') || byLabel(/daily tale/i)); return note('title daily'); }
    await click($('[data-act=new]') || byLabel(/new tale/i));
    return note('title new');
  }

  async function heroSelect() {
    const st = UI.screens.heroSelect.state && UI.screens.heroSelect.state();
    const names = C0.heroes.map((id) => DATA.heroes[id].name);
    if (C0.daily) { const t = $('.mn-daily input, [aria-label*=Daily]'); if (t) await click(t); }
    if (st && st.chosen && st.chosen.length) {
      // already chosen from module memory: reset by re-clicking so the order is right
      const want = C0.heroes.join(',');
      if (st.chosen.join(',') !== want) { for (const id of st.chosen.slice()) { const b = $$('.mn-cards button').find((x) => label(x).startsWith(DATA.heroes[id].name + ',')); if (b) await click(b, 80); } }
    }
    const st2 = UI.screens.heroSelect.state();
    if (st2.chosen.join(',') !== C0.heroes.join(',')) {
      for (const n of names) { const b = $$('.mn-cards button').find((x) => label(x).startsWith(n + ',')); if (!b) throw new Error('hero card missing: ' + n); if (!/Chosen/.test(label(b))) await click(b, 80); }
    }
    const trialBtn = () => $('[data-act=trial-up]') || $$('button').find((x) => /Raise the (Ink|Tempo) Trial|Raise the Encore/.test(label(x)));
    for (let i = 0; i < 12 && (UI.screens.heroSelect.state().trial || 0) < C0.trial; i++) await click(trialBtn(), 60);
    if (C0.seed) { const inp = $('.mn-seed'); if (inp) await g._input(inp, C0.seed); await tick(60); }
    await click($('[data-act=begin]') || byLabel(/begin the (tale|journey)|start the tour/i), 500);
    return note('heroSelect begin');
  }

  async function story() {
    const b = $('[data-act=skip]') || $('[data-act=turn]') || byLabel(/^skip/i) || byLabel(/play on|on we go|turn the page|continue/i);
    shown.add('story:' + (UI.params && UI.params.id));
    await click(b, 500);
    return note('story skip');
  }

  // ---- the map
  const tileKey = (t) => t.q + ',' + t.r;
  function planTarget() {
    const r = R(), M = r.map;
    const tiles = Object.values(M.tiles).filter((t) => !t.done && t.type !== 'block' && t.type !== 'start' && t.type !== 'empty' && !(t.q === M.pos.q && t.r === M.pos.r && t.done));
    const cost = (t) => { const p = RUN.paintPreview(r, t.q, t.r); return t.painted ? 0 : (p && p.ok ? p.cost : 999); };
    const dist = (t) => MAP.dist(M.pos.q, M.pos.r, t.q, t.r);
    if (state.chapter !== r.chapter) { state.chapter = r.chapter; state.doneKinds = new Set(); }
    const wanted = C0.plan.filter((k) => !state.doneKinds.has(k));
    for (let i = 0; i < wanted.length; i++) {
      const kind = wanted[i];
      const cands = tiles.filter((t) => t.type === kind && (t.painted || cost(t) < 999));
      if (cands.length) {
        cands.sort((a, b) => (cost(a) + dist(a) * 0.5) - (cost(b) + dist(b) * 0.5));
        return cands[0];
      }
    }
    return tiles.find((t) => t.type === 'boss');
  }

  async function mapStep() {
    const r = R();
    const M = r.map;
    const sc = UI.screens.map;
    if (r.pending && r.pending.length) { await tick(200); }
    if (!sc.mapDebug.cam()) { await tick(300); return note('map wait'); }
    // fit the whole page so every hex is on screen
    await g._key('f'); await tick(120);
    let target = planTarget();
    if (!target) return note('map no target');
    if (r.chapterCleared || r.done) return note('map done');
    // a visited kind is crossed off by the plan: when the target is reached the tile is done
    const tgtKind = target.type;
    if (state.wasKind && state.wasKind === tgtKind && state.wasKey === tileKey(target)) state.stuck++; else state.stuck = 0;
    state.wasKind = tgtKind; state.wasKey = tileKey(target);
    if (state.stuck > 4) { // cannot reach it: forget this kind for now
      const i = C0.plan.indexOf(tgtKind, state.planIdx);
      if (i >= 0 && tgtKind !== 'boss') { C0.plan = C0.plan.filter((k, j) => j !== i); } else { target = Object.values(M.tiles).find((t) => t.type === 'boss'); }
      state.stuck = 0;
    }
    if (!target.painted) {
      let pv = RUN.paintPreview(r, target.q, target.r);
      if (!pv || !pv.ok) return note('map unreachable ' + tgtKind);
      if (C0.cheat && r.ink < Math.min(pv.cost, r.inkMax || 14)) r.ink = Math.min(r.inkMax || 14, pv.cost + 2);
      // a chain longer than the Ink pot is painted in stages: aim at the farthest hex of the path we can pay for
      if (r.ink < pv.cost) {
        const path = pv.path || [];
        let best = null;
        for (let i = path.length - 1; i >= 0 && !best; i--) { const sub = RUN.paintPreview(r, path[i][0], path[i][1]); if (sub && sub.ok && sub.cost <= r.ink) best = { t: M.tiles[path[i][0] + ',' + path[i][1]], pv: sub }; }
        if (!best) return note('map no ink');
        target = best.t; pv = best.pv;
      }
      const scr = sc.mapDebug.screenOf(target.q, target.r);
      if (!scr) { await tick(300); return note('map not ready'); }
      const cv = $('#view');
      const tapAt = async () => { await g._click(cv, { x: scr.x, y: scr.y }); stats.taps++; await tick(150); };
      const before = r.ink;
      await tapAt();
      if ((pv.path && pv.path.length > 1) || pv.cost > 1) { await tapAt(); }
      if (!M.tiles[tileKey(target)].painted && r.ink === before) { await tapAt(); }
      await tick(300);
      stats.paints++;
      return note('map paint ' + tgtKind + ' cost ' + pv.cost);
    }
    // walk there
    const wp = MAP.walkPath ? MAP.walkPath(M, M.pos.q, M.pos.r, target.q, target.r) : null;
    const scr = sc.mapDebug.screenOf(target.q, target.r);
    if (!scr) { await tick(300); return note('map not ready'); }
    await g._click($('#view'), { x: scr.x, y: scr.y }); stats.taps++;
    stats.walks++;
    await tick(600);
    if (UI.currentName === 'map') await tick(600);
    return note('map walk ' + tgtKind);
  }

  // ---- combat
  const cardEls = () => live('.cm-hand .card, .card.c-hand').filter((c) => !c.classList.contains('back'));
  async function combat() {
    const d = GAME.debug.combat();
    if (!d) { await tick(300); return note('combat wait'); }
    const C = d.C;
    shown.add('combat');
    // keep a cheating party alive: the policy is greedy, the point is to cross the screens
    // the screen still drains the events of the last action (a real browser plays the beats in real frames): input is locked until it finishes
    // (an open pick prompt keeps the screen "draining" until it is answered, so it is answered first)
    const pickOpen = !!(C.pending && (C.pending.kind || C.pending.length));
    if (!pickOpen && d.state && (d.state.draining || d.state.turnEnding)) { await tick(250); return note('combat drain'); }
    if (C0.cheat) C.heroes.forEach((h) => { if (!h.down && h.hp < h.maxHp * 0.5) { d.setHp(h.id, Math.floor(h.maxHp * 0.9)); } });
    if (C.phase === 'over' || C.result) { await tick(900); return note('combat over ' + C.result); }
    // an open pick prompt (hand select mode): answer it through the Confirm plaque
    if (C.pending && C.pending.length || (C.pending && C.pending.kind)) { return pickPrompt(C); }
    const vm = d.vm;
    if (C.phase !== 'player') { await tick(500); return note('combat enemy turn'); }
    // try to play something
    const hand = cardEls();
    const rank = (inst) => { const c = DATA.card(inst.id); return (c.type === 'power' ? 0 : c.type === 'attack' ? 1 : 2) + (c.cost === 0 ? -5 : 0); };
    const order = C.hand.map((inst, i) => ({ inst, i })).sort((a, b) => rank(a.inst) - rank(b.inst));
    for (const { inst, i } of order) {
      const needs = C.needsTarget(inst.uid);
      const legal = needs ? C.legalTargets(inst.uid) : [];
      if (needs && !legal.length) continue;
      const ok = C.canPlay(inst.uid, needs ? legal[0] : undefined);
      if (!ok || !ok.ok) continue;
      const el = hand.find((e) => e.dataset && e.dataset.uid === String(inst.uid)) || hand[i];
      if (!el) continue;
      const inHand = () => C.hand.some((h) => h.uid === inst.uid);
      if (needs) {
        const tid = legal[legal.length - 1];
        const tgt = $('.cm-en[data-enemy="' + tid + '"] .cm-ehit') || live('.cm-ehit')[0];
        if (C0.dragPlays && stats.plays % 3 === 1) {
          const a = g.SCENE && g.SCENE.anchor ? g.SCENE.anchor('enemy', tid) : null;
          const to = a ? [a.x + a.w / 2, a.y + a.h / 2] : [800, 400];
          await g._drag(el, from(el), to, 6); stats.drags++; await tick(500);
        }
        if (inHand()) { await click(el, 150); if (inHand()) await click(tgt, 150); await tick(500); }
      } else {
        if (C0.dragPlays && stats.plays % 2 === 0) { await g._drag(el, from(el), [640, 300], 6); stats.drags++; await tick(500); }
        if (inHand()) { await click(el, 150); if (inHand()) await click(el, 150); await tick(400); }
      }
      if (inHand()) { stats.stuckPlays = (stats.stuckPlays || 0) + 1; (stats.stuckIds = stats.stuckIds || []).push(inst.id + ':' + JSON.stringify(C.canPlay(inst.uid, needs ? legal[0] : undefined)) + ' legal=' + legal.join(',') + ' ehit=' + live('.cm-ehit').map(label).map((x) => x.slice(0, 18)).join('/') + ' sel=' + $$('.card.sel').length + ' phase=' + C.phase + ' pend=' + JSON.stringify(C.pending && C.pending.length)); }
      stats.plays++;
      return note('combat play ' + inst.id);
    }
    // nothing playable: end the turn with the plaque (or the E key)
    state.fightTurns++;
    stats.turns++;
    if (C0.cheat && (C.turn | 0) >= 12 && (C.turn | 0) % 6 === 0) { C.enemies.forEach((e) => { if (!e.down && e.hp > 4) d.setHp(e.id, 4); }); note('combat soften'); }   // a greedy policy cannot always out-damage a boss: weaken it, the kill is still played
    await click(live('.cm-end')[0] || byLabel(/end turn/i), 200);
    await tick(600);
    return note('combat end turn');
  }
  async function pickPrompt(C) {
    const el = byLabel(/^confirm/i) || byLabel(/^skip/i);
    const sel = cardEls().filter((c) => !c.classList.contains('dis'));
    stats.picks++;
    const need = (C.pending && C.pending.n) || 1;
    const picked = $$('.card.sel, .card.selected').length;
    for (let i = picked; i < Math.min(need, sel.length); i++) await click(sel[i], 100);
    await click(byLabel(/^confirm/i) || el, 300);
    return note('combat pick');
  }

  // ---- rewards, shops and the rest
  async function reward() {
    stats.rewards++;
    shown.add('reward');
    const node = R().node;
    if (state.rwNode !== node) { state.rwNode = node; state.rwRelic = false; state.rwCard = false; await tick(1800); }   // the ledger counts up and the cards are dealt and flipped: a real person waits for that
    // an elite offers one relic (Take it or Leave it); a boss offers a page of three
    const takeIt = byLabel(/^take it$/i);
    if (takeIt && !state.rwRelic) { state.rwRelic = true; stats.relicsTaken = (stats.relicsTaken || 0) + 1; await click(takeIt, 500); return note('reward take relic'); }
    const peds = live('.rw-ped').filter((e) => !isOff(e));
    if (peds.length && !state.rwRelic) { state.rwRelic = true; stats.relicsTaken = (stats.relicsTaken || 0) + 1; await click(peds[state.pedIdx = ((state.pedIdx | 0) + 1) % peds.length], 500); return note('reward boss relic'); }
    // three or four offers are dealt as `.c-reward` cards; a reward with 5 or more (a relic that widens the choice) deals the deck-sized `.c-deck` card instead,
    // all inside `.rw-cards`, so that container is the selector. The cards are ignored until dealt and flipped (the tick above covers that)
    const cards = live('.rw-cards .card:not(.back)');
    if (cards.length && !state.rwCard) { state.rwCard = true; await click(cards[(state.evPick >= 0 ? 0 : cards.length - 1) % cards.length], 250); return note('reward pick card'); }
    // "Skip card" is the way out of a reward whose cards were all passed over or none could be picked
    const cont = byLabel(/^(continue|take and continue|next|claim|skip card)/i);
    await click(cont || btns().find((b) => b.classList.contains('btn-primary')), 500);
    return note('reward continue');
  }

  async function shop() {
    shown.add('shop');
    if (C0.cheat) { R().gold = Math.max(R().gold, 400); }
    if (C0.buy && state.shopBought < 3) {
      const plaque = live('.sh-plaque').filter((b) => !isOff(b) && !/sold/i.test(label(b)) && !/remove|cut gems/i.test(label(b)));
      const card = live('.s-shop .card.c-deck').find((c) => !c.classList.contains('sold') && !isOff(c));
      const pick = card && state.shopBought % 2 === 0 ? card : plaque[0] || card;
      if (pick) {
        state.shopBought++;
        await click(pick, 250);
        const yes = byLabel(/^(buy|purchase|yes|confirm)/i, doc.querySelector('.s-shop'));
        if (yes) await click(yes, 300);
        return note('shop buy ' + label(pick).slice(0, 25));
      }
    }
    if (state.shopBought < 4 && C0.buy) {
      state.shopBought = 4;
      const rm = live('.sh-plaque.kind-remove')[0];
      if (rm && !isOff(rm)) { await click(rm, 300); return note('shop remove'); }
    }
    state.shopBought = 0;
    await click(byLabel(/leave the stall|leave/i), 400);
    return note('shop leave');
  }

  async function camp() {
    shown.add('camp');
    const acts = ['rest', 'sharpen', 'meditate', 'gems'];
    const tiles = live('.cp-tile').filter((t) => !isOff(t) && !t.classList.contains('done'));
    const want = tiles.find((t) => t.classList.contains('a-' + acts[state.campDone % 4])) || tiles[0];
    if (want && state.campDone < 6) {
      state.campDone++;
      await click(want, 300);
      return note('camp ' + (want.className.match(/a-(\w+)/) || [])[1]);
    }
    state.campDone = 0;
    const lb = byLabel(/break camp|back on the road|leave/i);
    await click(lb, 300);
    if (UI.overlay.count() === 0 && UI.currentName === 'camp') await click(byLabel(/break camp|back on the road|leave/i), 300);
    return note('camp leave');
  }

  async function forge() {
    shown.add('forge');
    const node = R().node;
    if (node && !node.used) {
      const up = live('.fg-mode.m-up').find((b) => !isOff(b));
      const strike = byLabel(/^(strike|hit it)/i);
      if (strike && state.forged) { await click(strike, 700); return note('forge strike'); }
      if (up && !state.forged) { state.forged = true; await click(up, 300); return note('forge sharpen mode'); }
      if (strike) { await click(strike, 700); return note('forge strike'); }
    }
    state.forged = false;
    await click(byLabel(/leave the forge|leave/i), 400);
    return note('forge leave');
  }

  async function chest() {
    shown.add('chest');
    const open = byLabel(/open the (chest|gift)/i);
    if (open) { await click(open, 600); return note('chest open'); }
    const take = byLabel(/take the treasure|take .*gem|just the gold|take/i);
    if (take) { await click(take, 400); return note('chest take'); }
    const gem = live('.ch-gem, .gc-gem').find((b) => !isOff(b));
    if (gem) { await click(gem, 200); return note('chest gem'); }
    await click(byLabel(/leave|continue|close|done/i) || btns().find((b) => b.classList.contains('btn-primary')), 400);
    return note('chest leave');
  }

  async function gemcache() {
    shown.add('gemcache');
    const node = R().node;
    const takeB = byLabel(/take this gem/i);
    const set = byLabel(/set it in a card/i);
    if (node && !node.taken) {
      const gem = live('.gc-gem').find((b) => !isOff(b));
      if (gem && !takeB) { await click(gem, 250); return note('gemcache weigh'); }
      if (takeB) { await click(takeB, 400); return note('gemcache take'); }
    }
    if (set && !state.gcSet) { state.gcSet = true; await click(set, 400); return note('gemcache socket'); }
    state.gcSet = false;
    await click(byLabel(/^(leave|continue|done|close|walk on|go on)/i) || btns().find((b) => b.classList.contains('btn-primary')), 400);
    return note('gemcache leave');
  }

  async function event() {
    shown.add('event');
    const node = R().node;
    const picked = $$('.ev-choice.picked').length > 0 || (node && node.chosen !== undefined && node.chosen !== null && node.chosen !== false);
    if (picked) {
      // the outcome page: Continue, or Fight! when the gamble ended in a real combat
      const go = byLabel(/^(continue|fight|leave|go on|play on|on we go|turn the page|move on|walk on)/i) || btns().find((b) => b.classList.contains('btn-primary'));
      await click(go, 600);
      return note('event continue');
    }
    const choices = live('.ev-choice').filter((b) => !isOff(b) && !b.classList.contains('gone'));
    if (choices.length) {
      const i = state.evPick < 0 ? choices.length - 1 : Math.min(state.evPick, choices.length - 1);
      await click(choices[i], 600);
      return note('event choice ' + i);
    }
    const page = $('.s-event');
    if (page) { await click(page, 200); }
    await tick(400);
    return note('event wait');
  }

  async function chapterClear() { shown.add('chapterClear'); await click(byLabel(/^continue/i), 700); return note('chapterClear continue'); }
  async function gameOver() { shown.add('gameOver'); return note('gameOver'); }
  async function victory() {
    shown.add('victory');
    // the ending has three beats (the page, a curtain call, the showcase): Skip jumps to the showcase, Continue leaves
    const skip = byLabel(/^skip/i);
    if (skip && !state.vcSkipped) { state.vcSkipped = true; await click(skip, 400); return note('victory skip'); }
    state.vcSkipped = false;
    await click(byLabel(/^continue/i), 600);
    return note('victory continue');
  }

  const handlers = { title, heroSelect, story, map: mapStep, combat, reward, shop, camp, forge, chest, gemcache, event, chapterClear, gameOver, victory };

  async function step() {
    stats.steps++;
    await g._settle();
    if (UI.overlay && UI.overlay.count && UI.overlay.count() > 0) return overlayStep();
    const name = UI.currentName;
    shown.add(name);
    const kindOf = { shop: 'shop', camp: 'camp', chest: 'chest', forge: 'forge', gemcache: 'gemcache', event: 'event' }[name] || (name === 'combat' && R() && R().node ? (R().node.tier === 'elite' ? 'elite' : R().node.tier === 'boss' ? 'boss' : 'enemy') : null);
    if (kindOf) state.doneKinds.add(kindOf);
    const h = handlers[name];
    if (!h) { await tick(300); return note('no handler for ' + name); }
    const s = await h();
    return s;
  }

  // a readable dump of what the player can press right now, for stuck reports
  function dump() {
    const els = [...live('#screens button, #screens [role=button], #overlays button, #overlays [role=button]')];
    return UI.currentName + (UI.overlay.count() ? ' +overlay' : '') + ': ' + els.map((b) => `[${String(b.className).split(' ').slice(0, 3).join('.')}] ${label(b).slice(0, 40)}${isOff(b) ? ' (off)' : ''}`).join(' | ');
  }

  async function until(pred, o = {}) {
    const max = o.steps || 2000, same = o.stuck || 25;
    let n = 0, run = 0, prev = '';
    while (n++ < max) {
      if (pred()) return true;
      const s = await step();
      const key = UI.currentName + '|' + s + '|' + (UI.overlay.count ? UI.overlay.count() : 0);
      if (key === prev && !/combat/.test(s)) run++; else { run = 0; prev = key; }
      if (run >= same) throw new Error('player stuck: "' + s + '" repeated ' + same + ' times. ' + dump());
      if (o.onStep) o.onStep(s, n);
    }
    return pred();
  }

  return { step, until, dump, log, stats, cfg: C0, shown, state, handlers, R, label, live, btns, click, tick };
}
