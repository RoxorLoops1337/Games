// Midnight Mog first-run tutorial: a spotlight overlay of about 90 seconds that teaches, in order,
//   place a cat, play a spell card, merge two cats, collect the town, open the first crate (with a free key),
// then hands off to the hub. Skippable at any time, resumable (the step lives in profile.stats.tut_step).
//
// Owner: integrator. main.js calls update() right after ui.begin() and draw() right after the screen's draw().
//
// State: profile.stats.tut_step = 1..11 while running, 99 when finished or skipped. A profile with no tut_step (a save
// from before the tutorial existed) counts as finished, so only brand new games ever see it.
//
// How it works: every step names a screen and finds its target rects at run time (a hand card, a rooftop tile, a button
// id read back with ui.rectOf). The overlay dims everything outside the target rects and puts a blocker layer over the dim
// area, so a tap can only hit the thing the step is about. The battle freezes (params.holdSim) while a step waits for the
// player, so nothing is lost by reading slowly.
import { PAL, rgba, glow } from '../palette.js';
import { drawText, wrapText } from '../render/text.js';
import * as CATART from '../render/catart.js';
import { CARD_BY_ID } from '../data/cards.js';
import { battleScreen } from './screens_battle.js';
import { crateScreen } from './screens_crate.js';
import { handLayout } from './hud.js';
import { chamfer, clamp, fin, outBack } from './shell.js';

export const TUT_DONE = 99;
export const TUT_FIRST = 1;
/** Tutorial battle deck: cheap archers to merge (pigeons fly, so melee cats could not touch them), zoomies to cast. Costs 1 each, the start energy is 3. */
export const TUT_DECK = ['call_whisker_scout', 'call_whisker_scout', 'call_whisker_scout', 'call_whisker_scout', 'call_whisker_scout', 'call_whisker_scout', 'zoomies', 'zoomies', 'zoomies', 'zoomies'];
export const TUT_SEED = 7771;

const STEP = { WELCOME: 1, PLACE: 2, SPELL: 3, MERGE: 4, FIGHT: 5, COLLECT: 6, CRATES: 7, KEY: 8, WAIT: 9, DONE: 10, HANDOFF: 11 };
const TOTAL = 8;                       // pips shown in the bubble
const PIP_OF = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, 9: 7, 10: 7, 11: 7 };
const MASCOT = 'scrap_tabby';

const COPY = {
  [STEP.WELCOME]: { title: 'Sergeant Mittens', text: 'Welcome to the roof, rookie. Pigeons arrive from the right. Our snack stash is on the left. Do not let the pigeons near the snacks.' },
  [STEP.PLACE]: { title: 'Place a cat', text: 'Cats cost energy, the cyan gems below. Tap a cat card, then tap a rooftop tile. Or drag it over, like a laser pointer.' },
  [STEP.SPELL]: { title: 'Cast a spell', text: 'Spells are one-paw magic. Tap Zoomies, then tap it again to cast. Your cats attack faster. Cats love going fast.' },
  [STEP.MERGE]: { title: 'Merge two cats', text: 'Two equal cats side by side fuse into one bigger, grumpier cat. Place a matching cat right next to the first one.' },
  [STEP.FIGHT]: { title: 'Hold the line', text: 'Gorgeous. I switched AUTO on, so your paws play cards for you. Tap the AUTO button to take over. Hold the line until the last pigeon falls.' },
  [STEP.COLLECT]: { title: 'Collect the town', text: 'Your buildings made fish while you fought. Cats do not do paperwork, so just tap Collect All.' },
  [STEP.CRATES]: { title: 'A free key', text: 'Fish buys crates, and crates hold cats and cards. Here is a free key, because we are nice. Tap Crates.' },
  [STEP.KEY]: { title: 'Open it', text: 'Tap Use Key. Whatever is inside, a cat will be thrilled.' },
  [STEP.WAIT]: { title: 'Drumroll', text: 'Tap anywhere to hurry it along. Cats are not known for patience.' },
  [STEP.DONE]: { title: 'Loot!', text: 'Doubles level up your cats, so nothing is wasted. Tap Done when you have admired it.' },
  [STEP.HANDOFF]: { title: 'That is the whole loop', text: 'Fight, collect, open crates, upgrade, repeat. The big PLAY button is always your next move. Go bother some pigeons.' },
};
const WRONG_SCREEN_OK = new Set([STEP.WAIT]);

// ------------------------------------------------------------------------------------------------ profile helpers
/** Tutorial step stored in a profile. Missing means finished (old saves). */
export function stepOf(profile) {
  const v = profile && profile.stats ? profile.stats.tut_step : undefined;
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : TUT_DONE;
}
export function withStep(profile, step) { return { ...profile, stats: { ...(profile.stats || {}), tut_step: step } }; }
/** Where to send a player who comes back mid tutorial: {screen, params, step}. */
export function resumePlan(profile) {
  const s = stepOf(profile);
  if (s >= TUT_DONE) return null;
  if (s <= STEP.FIGHT) return { screen: 'battle', step: STEP.WELCOME };
  if (s <= STEP.CRATES) return { screen: 'town', step: s };
  if (s === STEP.KEY) return { screen: 'crates', step: STEP.KEY };
  return { screen: 'hub', step: STEP.HANDOFF };
}

// ------------------------------------------------------------------------------------------------ geometry helpers
/** Chamfer sub path that does not start a new path (shell.chamfer calls beginPath, which would drop the dim rect). */
function addChamfer(ctx, x, y, w, h, c) {
  c = Math.max(0, Math.min(c, w / 2, h / 2));
  ctx.moveTo(x + c, y); ctx.lineTo(x + w - c, y); ctx.lineTo(x + w, y + c); ctx.lineTo(x + w, y + h - c);
  ctx.lineTo(x + w - c, y + h); ctx.lineTo(x + c, y + h); ctx.lineTo(x, y + h - c); ctx.lineTo(x, y + c); ctx.closePath();
}
const pad = (r, d) => ({ x: r.x - d, y: r.y - d, w: r.w + d * 2, h: r.h + d * 2 });
/** Rects that cover the whole w x h area except the holes. */
export function blockRects(holes, w, h) {
  const ys = [0, h];
  for (const o of holes) { ys.push(clamp(o.y, 0, h), clamp(o.y + o.h, 0, h)); }
  ys.sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < ys.length - 1; i++) {
    const y0 = ys[i], y1 = ys[i + 1];
    if (y1 - y0 < 0.5) continue;
    const band = holes.filter((o) => o.y < y1 - 0.01 && o.y + o.h > y0 + 0.01).sort((a, b) => a.x - b.x);
    let x = 0;
    for (const o of band) {
      const ox = clamp(o.x, 0, w);
      if (ox - x > 0.5) out.push({ x, y: y0, w: ox - x, h: y1 - y0 });
      x = Math.max(x, clamp(o.x + o.w, 0, w));
    }
    if (w - x > 0.5) out.push({ x, y: y0, w: w - x, h: y1 - y0 });
  }
  return out;
}

export function createTutorial(app) {
  const T = {
    app,
    active: false,
    step: TUT_DONE,
    age: 0,          // seconds in the current step
    cool: 0,         // pause after a step is done, before the next spotlight shows
    fightT: 0,
    confirming: false,
    view: null,      // what draw() paints this frame (computed in update)
  };

  // ---- lifecycle
  function persist(step) {
    const p = app.profile;
    if (p && stepOf(p) !== step) app.setProfile(withStep(p, step));
  }
  function setStep(step, o) {
    o = o || {};
    T.step = step; T.age = 0; T.cool = o.cool === undefined ? 0.5 : o.cool; T.view = null;
    if (step >= TUT_DONE) { T.active = false; persist(TUT_DONE); return; }
    T.active = true;
    if (!o.noPersist) persist(step);
    if (step === STEP.CRATES) grantKey();
    if (step === STEP.KEY) grantKey();
  }
  function grantKey() {
    const p = app.profile;
    const keys = (p.town && p.town.keys) || {};
    if ((keys.alley_crate | 0) >= 1) return;
    app.setProfile({ ...p, town: { ...p.town, keys: { ...keys, alley_crate: 1 } } });
  }

  /** Begin (or resume) from the profile. Returns the resume plan, or null when there is nothing to run. */
  T.begin = function () {
    const plan = resumePlan(app.profile);
    if (!plan) { T.active = false; T.step = TUT_DONE; return null; }
    T.step = plan.step; T.age = 0; T.cool = 0.4; T.active = true; T.view = null;
    if (plan.step === STEP.CRATES || plan.step === STEP.KEY) grantKey();
    if (plan.step === STEP.HANDOFF) persist(STEP.HANDOFF);
    return plan;
  };
  T.skip = function () {
    T.confirming = false;
    setStep(TUT_DONE);
    if (app.toast) app.toast('Tutorial skipped. The Settings menu has no regrets.', 'info');
  };
  T.finish = function () { setStep(TUT_DONE); };

  /** Params for the tutorial battle (stage 1, fixed deck and seed). */
  T.battleParams = function () {
    return {
      district: 1, stage: 1, seed: TUT_SEED, deck: TUT_DECK, forceBattle: true, returnTo: 'hub',
      holdSim: (b) => T.holdSim(b),
      onDone: (res, quit) => T.onBattleDone(res, quit),
    };
  };
  T.onBattleDone = function (res, quit) {
    if (T.step > STEP.FIGHT || !T.active) { app.router.go('hub'); return; }
    if (res && res.won && !quit) {
      setStep(STEP.COLLECT);
      app.router.go('town', { reset: true });
    } else {
      // the pigeons won this one: nine lives, so go again without losing the tutorial
      T.step = STEP.PLACE; T.age = 0; T.cool = 0.6;
      if (app.toast) app.toast('Nine lives! Try again.', 'info');
      app.router.go('battle', T.battleParams());
    }
  };

  /** The first fight must be winnable by a player who has only learned three moves: switch AUTO on for this battle only. */
  function autoOn() {
    const st = battleState();
    if (st && !st.auto) { st.auto = true; st.autoAt = st.b.t + 0.2; }
  }

  // ---- queries on the battle
  function battleState() { return battleScreen && battleScreen.state && battleScreen.state.b ? battleScreen.state : null; }
  function aliveCats(b) { return b.units.filter((u) => !u.dead && u.kind === 'cat'); }
  function handIndex(b, pred) {
    for (let i = 0; i < b.hand.length; i++) { const c = CARD_BY_ID[b.hand[i]]; if (c && pred(c, i)) return i; }
    return -1;
  }
  const cost = (b, c) => Math.max(0, c.cost + (b.costAdd || 0));
  function freeTileNear(b, L, from) {
    const occupied = (col, lane) => b.units.some((u) => !u.dead && u.kind !== 'minion' && u.home && Math.round(u.home.x) === col && Math.round(u.home.y) === lane) || b.units.some((u) => !u.dead && Math.round(u.x) === col && Math.round(u.y) === lane && u.kind === 'cat');
    const tries = from ? [[from.x + 1, from.y], [from.x - 1, from.y], [from.x + 2, from.y]] : [[3, 2], [3, 1], [3, 3], [2, 2]];
    for (const [c, l] of tries) if (c >= 1 && c <= 8 && l >= 0 && l <= 4 && !occupied(c, l)) return { col: c, lane: l };
    return { col: 4, lane: 2 };
  }

  /** Battle freeze: hold the sim while a step waits for the player and they can afford the action. */
  T.holdSim = function (b) {
    if (!T.active || T.step > STEP.MERGE) return false;
    if (T.step === STEP.WELCOME) return true;
    const v = T.view;
    if (!v || v.waitEnergy) return false;
    return !v.done;
  };

  // ---- per step targets (called from update, results land in T.view)
  function battleView(ui) {
    const st = battleState();
    if (!st || !st.L || st.result || st.b.over) return null;
    const b = st.b, L = st.L;
    // a fresh battle (Retry after a loss) starts the lesson at the first action again
    if (T.lastB !== b) { if (T.lastB && T.step > STEP.PLACE && T.step <= STEP.FIGHT) { T.step = STEP.PLACE; T.age = 0; T.cool = 0.6; } T.lastB = b; }
    const v = { holes: [], arrow: null, info: false, done: false, waitEnergy: false, text: null };
    const hl = handLayout(L, Math.max(1, b.hand.length));
    const cardRect = (i) => { const r = ui.rectOf('hand' + i) || hl.cards[i]; return r ? { x: r.x, y: r.y, w: r.w, h: r.h } : null; };
    const tileRect = (t) => { const r = L.tile(t.col, t.lane); return { x: r.x, y: r.y, w: r.w, h: r.h }; };
    switch (T.step) {
      case STEP.WELCOME: v.info = true; break;
      case STEP.PLACE: {
        if (b.stats.summons >= 1) { v.done = true; break; }
        const i = handIndex(b, (c) => c.type === 'summon');
        if (i < 0) { v.text = 'No cat card in hand. Tap the redraw button, it costs 1 energy.'; const r = ui.rectOf('cycle'); if (r) { v.holes.push(r); v.arrow = r; } break; }
        const c = CARD_BY_ID[b.hand[i]];
        v.waitEnergy = b.energy + 1e-9 < cost(b, c);
        const cr = cardRect(i);
        if (cr) { v.holes.push(cr); v.arrow = cr; }
        if (st.sel === i || (st.drag && st.drag.active)) { const tr = tileRect(freeTileNear(b, L, null)); v.holes.push(tr); v.arrow = tr; }
        v.text = v.waitEnergy ? 'Almost enough energy. It fills by itself.' : null;
        break;
      }
      case STEP.SPELL: {
        if (b.stats.spellsCast >= 1) { v.done = true; break; }
        let i = handIndex(b, (c) => c.type === 'spell' && (c.effect.target || 'none') === 'none' && cost(b, c) <= b.energy + 1e-9);
        if (i < 0) i = handIndex(b, (c) => c.type === 'spell' && (c.effect.target || 'none') === 'none');
        if (i < 0) { v.text = 'No spell in hand. Tap the redraw button for 1 energy.'; const r = ui.rectOf('cycle'); if (r) { v.holes.push(r); v.arrow = r; } break; }
        const c = CARD_BY_ID[b.hand[i]];
        v.waitEnergy = b.energy + 1e-9 < cost(b, c);
        const cr = cardRect(i);
        if (cr) { v.holes.push(cr); v.arrow = cr; }
        v.text = v.waitEnergy ? 'Almost enough energy. It fills by itself.' : null;
        break;
      }
      case STEP.MERGE: {
        if (b.stats.merges >= 1) { v.done = true; break; }
        const cats = aliveCats(b);
        const first = cats.find((u) => !u.merged) || cats[0];
        if (!first) break;
        const i = handIndex(b, (c) => c.type === 'summon' && c.effect.cat === first.id);
        if (i < 0) { v.text = 'No matching cat in hand. Tap the redraw button for 1 energy.'; const r = ui.rectOf('cycle'); if (r) { v.holes.push(r); v.arrow = r; } break; }
        const c = CARD_BY_ID[b.hand[i]];
        v.waitEnergy = b.energy + 1e-9 < cost(b, c);
        const cr = cardRect(i);
        if (cr) { v.holes.push(cr); v.arrow = cr; }
        if (st.sel === i || (st.drag && st.drag.active)) {
          const home = first.home || { x: first.x, y: first.y };
          const tr = tileRect(freeTileNear(b, L, { x: Math.round(home.x), y: Math.round(home.y) }));
          v.holes.push(tr); v.arrow = tr;
        }
        v.text = v.waitEnergy ? 'Almost enough energy. It fills by itself.' : null;
        break;
      }
      case STEP.FIGHT: v.fight = true; break;
      default: break;
    }
    return v;
  }
  function uiView(ui, screenId) {
    const v = { holes: [], arrow: null, info: false, done: false, waitEnergy: false, text: null };
    const btn = (id) => { const r = ui.rectOf(id); if (r) { v.holes.push(r); v.arrow = r; } return r; };
    switch (T.step) {
      case STEP.COLLECT:
        btn('collect');
        if (ui.tapId === 'collect') v.done = true;
        break;
      case STEP.CRATES:
        btn('crates');
        if (ui.tapId === 'crates') v.done = true;
        break;
      case STEP.KEY: {
        btn('key1');
        if (ui.tapId === 'key1') v.done = true;
        break;
      }
      case STEP.WAIT: {
        const mode = crateScreen && crateScreen.state ? crateScreen.state.mode : '';
        v.free = true;           // no blockers: the ceremony needs taps anywhere
        if (mode === 'summary') v.done = true;
        break;
      }
      case STEP.DONE:
        btn('done');
        if (ui.tapId === 'done') v.done = true;
        break;
      case STEP.HANDOFF:
        btn('hub:play');
        v.info = true;
        if (ui.tapId === 'hub:play') v.done = true;
        break;
      default: break;
    }
    return v;
  }
  const SCREEN_OF = { [STEP.WELCOME]: 'battle', [STEP.PLACE]: 'battle', [STEP.SPELL]: 'battle', [STEP.MERGE]: 'battle', [STEP.FIGHT]: 'battle', [STEP.COLLECT]: 'town', [STEP.CRATES]: 'town', [STEP.KEY]: 'crates', [STEP.WAIT]: 'crates', [STEP.DONE]: 'crates', [STEP.HANDOFF]: 'hub' };

  /** Advance logic, once per frame after ui.begin(). */
  T.update = function (appRef, dt, ui, screenId) {
    if (!T.active) { T.view = null; return; }
    T.age += dt;
    if (T.cool > 0) T.cool = Math.max(0, T.cool - dt);
    // a player who wandered off the step's screen gets nudged back instead of seeing nothing
    const want = SCREEN_OF[T.step];
    if (screenId !== want && !(WRONG_SCREEN_OK.has(T.step) && screenId === 'crates')) {
      T.view = null;
      if (T.step === STEP.CRATES && screenId === 'crates') setStep(STEP.KEY);
      return;
    }
    const v = want === 'battle' ? battleView(ui) : uiView(ui, screenId);
    T.view = v;
    if (!v) return;
    // a step with nothing to point at must never trap the player behind a dim layer or a frozen battle
    if (!v.info && !v.fight && !v.done && !v.holes.length) { v.free = true; v.waitEnergy = true; }
    if (T.step === STEP.FIGHT) { T.fightT += dt; return; }
    if (v.done && (T.cool <= 0.0001 || want !== 'battle')) T.advance();
    // the crate screen can be entered by another route than the Crates button
    if (T.step === STEP.CRATES && screenId === 'crates') setStep(STEP.KEY, { cool: 0.4 });
  };
  T.advance = function () {
    switch (T.step) {
      case STEP.WELCOME: setStep(STEP.PLACE, { noPersist: true }); break;
      case STEP.PLACE: setStep(STEP.SPELL, { noPersist: true, cool: 0.9 }); break;
      case STEP.SPELL: setStep(STEP.MERGE, { noPersist: true, cool: 0.9 }); break;
      case STEP.MERGE: setStep(STEP.FIGHT, { noPersist: true, cool: 0.9 }); T.fightT = 0; autoOn(); break;
      case STEP.COLLECT: setStep(STEP.CRATES, { cool: 0.9 }); break;
      case STEP.CRATES: setStep(STEP.KEY, { cool: 0.2 }); break;
      case STEP.KEY: setStep(STEP.WAIT, { cool: 0 }); break;
      case STEP.WAIT: setStep(STEP.DONE, { cool: 0.8 }); break;
      case STEP.DONE: setStep(STEP.HANDOFF, { cool: 0.4 }); app.router.go('hub', { reset: true }); break;
      case STEP.HANDOFF: T.finish(); break;
      default: break;
    }
  };

  // ---- drawing
  T.draw = function (ctx, appRef, ui, screenId) {
    if (!T.active) return;
    const v = T.view;
    if (!v) return;
    const showing = T.cool <= 0.0001 && !(T.step === STEP.FIGHT && T.fightT > 9) && !(T.step === STEP.WAIT && T.age > 5);
    const t = ui.t;
    const w = ui.w, h = ui.h;
    const holes = showing ? v.holes.map((r) => pad(r, 5)) : [];
    const blocking = showing && !v.free && !v.fight;
    // ---- dim with holes
    if (showing && !v.fight && !v.free) {
      const fadeIn = ui.reduceMotion ? 1 : clamp(T.age / 0.25, 0, 1);
      ctx.save();
      ctx.fillStyle = rgba(PAL.void, 0.74 * fadeIn);
      ctx.beginPath(); ctx.rect(0, 0, w, h);
      for (const r of holes) addChamfer(ctx, r.x, r.y, r.w, r.h, 8);
      ctx.fill('evenodd');
      ctx.restore();
      for (const r of holes) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 5);
        ctx.save();
        glow(ctx, r.x + r.w / 2, r.y + r.h / 2, Math.max(r.w, r.h) * 0.9, PAL.cyan, 0.14 + 0.1 * pulse);
        chamfer(ctx, r.x, r.y, r.w, r.h, 8);
        ctx.lineWidth = 4; ctx.strokeStyle = PAL.ink; ctx.stroke();
        ctx.lineWidth = 2.5; ctx.strokeStyle = rgba(PAL.cyan, 0.7 + 0.3 * pulse); ctx.stroke();
        ctx.restore();
      }
    }
    // ---- input layer
    ui.pushLayer();
    if (blocking) {
      const rects = blockRects(holes, w, h);
      for (let i = 0; i < rects.length; i++) ui.region('tut:b' + i, rects[i], null);
    }
    // ---- arrow
    if (showing && v.arrow && !v.fight) T.arrow(ctx, pad(v.arrow, 5), ui, t);
    // ---- bubble
    if (showing) T.bubble(ctx, ui, v, holes);
    if (T.confirming && !ui.hasDialog()) T.confirming = false;
    ui.popLayer();
  };
  T.arrow = function (ctx, r, ui, t) {
    // a bouncing triangle on the side with more room
    const cx = r.x + r.w / 2;
    const above = r.y > 120;
    const bob = ui.reduceMotion ? 0 : Math.sin(t * 6) * 5;
    const y = above ? r.y - 8 - bob : r.y + r.h + 8 + bob;
    const dir = above ? 1 : -1;
    ctx.save();
    ctx.translate(cx, y);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-11, -16 * dir); ctx.lineTo(11, -16 * dir); ctx.closePath();
    ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = PAL.ink; ctx.stroke();
    ctx.fillStyle = PAL.lime; ctx.fill();
    ctx.restore();
  };
  T.bubble = function (ctx, ui, v, holes) {
    const copy = COPY[T.step];
    if (!copy) return;
    const c = ui.content;
    const bw = Math.min(c.w - 24, 440);
    const text = v.text || copy.text;
    const tsz = 14;
    const portrait = 64;
    const textW = bw - portrait - 36;
    const lines = wrapText(ctx, text, textW, { size: tsz, kind: 'body', weight: 600 });
    const hasBtn = v.info;
    const bh = clamp(36 + lines.length * 18 + 12 + 52, 140, 280);
    // put the bubble on the side away from the holes
    const hy = holes.length ? holes.reduce((s, r) => s + r.y + r.h / 2, 0) / holes.length : -1;
    const lowBound = ui.h - ui.safe.bottom - 12;
    let by;
    if (holes.length === 0) by = T.step === STEP.FIGHT ? ui.safe.top + 70 : lowBound - bh - 10;
    else if (hy > ui.h * 0.5) by = ui.safe.top + 70;
    else by = lowBound - bh - (ui.safe.bottom > 0 ? 0 : 0);
    // never cover a hole: if it would, flip
    const overlaps = (y) => holes.some((r) => r.y < y + bh && r.y + r.h > y && r.x < c.x + c.w / 2 + bw / 2 && r.x + r.w > c.x + c.w / 2 - bw / 2);
    if (overlaps(by)) by = by < ui.h / 2 ? lowBound - bh : ui.safe.top + 70;
    const bx = c.x + (c.w - bw) / 2;
    const k = ui.reduceMotion ? 1 : outBack(clamp(T.age / 0.35, 0, 1));
    ctx.save();
    ctx.translate(bx + bw / 2, by + bh / 2); ctx.scale(0.9 + 0.1 * k, 0.9 + 0.1 * k); ctx.translate(-(bx + bw / 2), -(by + bh / 2));
    ctx.globalAlpha = clamp(k, 0, 1);
    chamfer(ctx, bx, by, bw, bh, 10);
    ctx.lineWidth = 6; ctx.strokeStyle = PAL.ink; ctx.stroke();
    ctx.fillStyle = rgba(PAL.ink2, 0.98); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = PAL.cyan; ctx.stroke();
    // mascot
    const px = bx + 12, py = by + 14;
    try { CATART.drawCatPortrait(ctx, MASCOT, px, py, portrait, portrait * 1.15, { t: ui.t }); } catch (e) { /* art is optional */ }
    const tx = px + portrait + 12;
    drawText(ctx, copy.title, tx, by + 30, { size: 16, kind: 'display', color: PAL.lime, glow: 6, glowColor: PAL.lime, maxWidth: textW - 70 });
    const shown = ui.reduceMotion ? 1e9 : Math.floor(T.age * 70);
    let left = shown;
    for (let i = 0; i < lines.length; i++) {
      const s = lines[i].slice(0, Math.max(0, left));
      left -= lines[i].length + 1;
      if (s) drawText(ctx, s, tx, by + 54 + i * 18, { size: tsz, kind: 'body', weight: 600, color: PAL.bone, maxWidth: textW, stroke: 2.5 });
    }
    // progress pips
    const pip = PIP_OF[T.step] === undefined ? 0 : PIP_OF[T.step];
    for (let i = 0; i < TOTAL; i++) {
      ctx.fillStyle = i <= pip ? PAL.cyan : rgba(PAL.violet, 0.8);
      ctx.fillRect(bx + bw - 14 - (TOTAL - i) * 10, by + 14, 7, 4);
    }
    // skip lives in the bubble so it never covers the game's own top buttons
    if (T.step !== STEP.WAIT && !T.confirming && ui.button('tut:skip', { x: bx + 12, y: by + bh - 52, w: 104, h: 44 }, 'SKIP', { kind: 'secondary', size: 14, aria: 'Skip the tutorial' })) {
      T.confirming = true;
      ui.confirm('Skip the tutorial?', 'You can always find your way. Sergeant Mittens will pretend he is not hurt.', () => { T.skip(); }, { yesLabel: 'Skip it', noLabel: 'Keep going', id: 'tutskip' });
    }
    if (hasBtn) {
      const label = T.step === STEP.HANDOFF ? 'GOT IT' : 'LET US GO';
      if (ui.button('tut:next', { x: bx + bw - 150, y: by + bh - 52, w: 138, h: 44 }, label, { kind: 'positive', size: 16, pulse: true })) {
        if (T.step === STEP.HANDOFF) T.finish(); else T.advance();
      }
    }
    ctx.restore();
  };

  return T;
}

export default createTutorial;
