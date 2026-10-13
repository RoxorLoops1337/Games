// rearrange.js : the Rearrange mode controller (MOVE). The sim rules are LM.moveQuote / LM.moveBuilding / LM.moveUndo (core/ext.js), the 3D parts (markers, lift,
// ghost, cinematic, construction sites) live in hub.js and buildings.js. This file is the glue and the UI: the hammer button, the mode bar, tap / pointer / keyboard
// input, the confirm card and the aria-live announcements.
//   const rearr = createRearrange(game);   game.rearr = rearr
//   rearr.start({ lift: plotIndex? })      enter the mode (optionally with a building already lifted)
//   rearr.stop()                           leave it (also called by game.js before a week runs, a screen opens or the scene changes)
//   rearr.active / rearr.state             test hooks;  rearr.tap(i) = what a tap on plot i does (used by the keyboard, the bot and tests)
//   rearr.undoAll()                        undo every move that can still be undone this week
import * as U from './ui_kit.js';
const h = U.h;
const D = new Proxy({}, { get: (_, k) => globalThis.LM_D[k] }), L = () => globalThis.LM;
const fmt = (n) => Math.round(n).toLocaleString('en-US');
// the screen kit (pills, cards) is only needed for the confirm card: loaded on the first start, not at boot
let SK = null; const loadSK = () => (SK ? Promise.resolve(SK) : import('./screens/sk.js').then((m) => (SK = m)));
const ICON = { barracks: 'roster', palaestra: 'sword', kitchen: 'heart', bath: 'duststorm', infirmary: 'unbreakable', forge: 'gear', market: 'market', scout: 'scroll', sparring: 'bladedance', stands: 'arena', shrine: 'fame', hall: 'star' };

const ROWS = ['rear terrace', 'second terrace', 'third terrace', 'front terrace by the gate'];
const COLS = 4;
const plotName = (i) => `plot ${i + 1}, ${ROWS[Math.floor(i / COLS)]}, column ${(i % COLS) + 1}`;

const CSS = `
.lx-rr-fab{left:auto !important;right:calc(var(--lx-sar) + var(--lx-gut)) !important}
.lx-rr-fab[aria-pressed="true"]{background:linear-gradient(180deg,#8fe0a0,#3fa660 55%,#25754a);color:#06240f;border-color:#0d3a1c}
@media (max-width:600px) and (min-height:521px){body .lx-rr-fab{bottom:calc(var(--lx-sab) + 86px)}}
.lx-rr-modebar{position:fixed;left:50%;transform:translateX(-50%);top:calc(var(--lx-sat) + 62px);z-index:29;display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center;width:min(94vw,560px);padding:8px 10px;border-radius:12px;background:rgba(29,24,48,.9);border:2px solid #4fbf6f;box-shadow:0 6px 18px rgba(0,0,0,.5);color:#f6ecd0;font:600 13px/1.3 system-ui,sans-serif}
.lx-rr-modebar b{font:800 13px Georgia,serif;letter-spacing:.08em;text-transform:uppercase;color:#8fe0a0}
.lx-rr-modebar .lx-rr-msg{flex:1 1 220px;min-width:180px}
.lx-rr-modebar button{min-height:44px;min-width:44px;padding:8px 14px;border-radius:9px;cursor:pointer;font:800 12px system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;border:2px solid #7a4e1c;background:linear-gradient(180deg,#f2c14e,#c58a2a);color:#2a1a30;touch-action:manipulation}
.lx-rr-modebar button.alt{background:rgba(255,255,255,.08);color:#f6ecd0;border-color:#8a7aa8}
.lx-rr-modebar button[hidden]{display:none}
.lx-rr-modebar button:focus-visible{outline:3px solid #fff;outline-offset:2px}
.lx-rr-confirm{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(var(--lx-sab) + 10px);z-index:41;width:min(96vw,520px);box-sizing:border-box;padding:12px 14px 12px;border-radius:14px;background:linear-gradient(180deg,rgba(54,36,66,.97),rgba(29,24,48,.97));border:2px solid #4fbf6f;box-shadow:0 10px 28px rgba(0,0,0,.6);color:#f6ecd0;font:600 13px/1.35 system-ui,sans-serif}
.lx-rr-confirm h3{margin:0 0 6px;font:800 16px/1.2 Georgia,serif;letter-spacing:.04em;color:#f2c14e}
.lx-rr-confirm .pl{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}
.lx-rr-confirm .pl span{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:999px;background:rgba(255,255,255,.1);font:800 12px system-ui,sans-serif}
.lx-rr-confirm .pl span.g{background:rgba(242,193,78,.18);color:#ffe7a8}.lx-rr-confirm .pl span.w{background:rgba(224,162,58,.2);color:#ffd9a0}
.lx-rr-confirm p{margin:4px 0;opacity:.92}
.lx-rr-confirm .bt{display:flex;gap:8px;margin-top:10px}
.lx-rr-confirm button{flex:1;min-height:48px;border-radius:10px;cursor:pointer;font:800 14px system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;border:2px solid #7a4e1c;background:linear-gradient(180deg,#f2c14e,#c58a2a);color:#2a1a30;touch-action:manipulation}
.lx-rr-confirm button.alt{background:rgba(255,255,255,.08);color:#f6ecd0;border-color:#8a7aa8}
.lx-rr-confirm button:focus-visible{outline:3px solid #fff;outline-offset:2px}
@media (max-width:600px){.lx-rr-modebar{top:calc(var(--lx-sat) + 104px);flex-wrap:nowrap;padding:6px 8px}.lx-rr-modebar b{display:none}.lx-rr-modebar .lx-rr-msg{min-width:0;font-size:12px}}
.lx-rr-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
`;

export function createRearrange(game) {
  const st = { active: false, sel: -1, cursor: -1, dest: -1, cine: false, asking: false, msg: '' };
  let bar = null, msgEl = null, undoB = null, doneB = null, live = null, fab = null, unKey = null, tick = 0;
  const S = () => game.S, hub = () => game.hub, sfx = (n, o) => { try { game.audio.sfx(n, o); } catch (e) { /* audio optional */ } };
  const vib = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* no haptics */ } };
  const say = (t, short) => { st.msg = t; if (msgEl) msgEl.textContent = short || t; try { hub().say(t); } catch (e) { /* no hub */ } if (live) { live.textContent = ''; setTimeout(() => { if (live) live.textContent = t; }, 60); } };
  const bname = (i) => { const p = S().plots[i]; return p ? D.BUILD[p.b].n : 'empty plot'; };
  const unlocked = () => { const out = []; for (let i = 0; i < S().rows * COLS; i++) out.push(i); return out; };
  const anyUndo = () => S().plots.map((p, i) => (p && p.mv && L().moveUndoInfo(S(), i).ok ? i : -1)).filter((i) => i >= 0);

  // ---------------------------------------------------------------- markers and tags
  function items() {
    const lm = L(), s = S(), out = [];
    for (const i of unlocked()) {
      const p = s.plots[i];
      if (st.sel < 0) {
        if (!p) continue;
        const why = lm.moveWhySource(s, i);
        if (why) out.push({ i, kind: 'bad', text: '', icon: lm.moving(s, i) ? '⚒' : '⚓', why });
        else out.push({ i, kind: 'src', text: 'Lift', sub: '' });
      } else if (i === st.sel) out.push({ i, kind: 'src', text: 'Lifted', sub: '' });
      else {
        const q = lm.moveQuote(s, st.sel, i);
        if (!q.ok) out.push({ i, kind: 'bad', text: '', icon: lm.moving(s, i) ? '⚒' : '⚓', why: q.why });
        else if (s.gold < q.gold) out.push({ i, kind: 'bad', text: `${fmt(q.gold)}g`, icon: '○', why: `Not enough gold: ${fmt(q.gold)} needed, you have ${fmt(s.gold)}` });
        else out.push({ i, kind: q.kind === 'swap' ? 'swap' : 'ok', text: `${fmt(q.gold)}g`, sub: q.kind === 'swap' ? `swap, ${Math.max(q.weeks[0], q.weeks[1])} wk` : `${q.weeks[0]} wk`, q });
      }
    }
    return out;
  }
  let cached = [];
  function sync() {
    if (!st.active) return; cached = items(); try { hub().rrItems(cached, st.cursor); } catch (e) { /* hub optional */ }
    if (undoB) { const u = anyUndo(); undoB.hidden = !u.length; if (u.length) { const refund = u.reduce((a, i) => a + L().moveUndoInfo(S(), i).refund, 0); undoB.textContent = `Undo (+${fmt(refund)}g)`; undoB.setAttribute('aria-label', `Undo the last move for ${fmt(refund)} gold back`); } }
  }
  const reasonFor = (i) => { const it = cached.find((x) => x.i === i); if (it && it.why) return it.why; if (i >= S().rows * COLS) return 'Unclaimed land. Buy the row first.'; return ''; };

  // ---------------------------------------------------------------- UI chrome
  function build() {
    SK.injectCss(); ensureCss();
    bar = document.createElement('div'); bar.className = 'lx-rr-modebar'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Rearrange mode');
    msgEl = document.createElement('div'); msgEl.className = 'lx-rr-msg'; msgEl.setAttribute('aria-hidden', 'true');
    const ttl = document.createElement('b'); ttl.textContent = 'Rearrange';
    undoB = document.createElement('button'); undoB.type = 'button'; undoB.className = 'alt'; undoB.hidden = true; undoB.addEventListener('click', () => api.undoAll());
    doneB = document.createElement('button'); doneB.type = 'button'; doneB.textContent = 'Done'; doneB.setAttribute('aria-label', 'Leave rearrange mode'); doneB.addEventListener('click', () => api.stop());
    bar.append(ttl, msgEl, undoB, doneB); (document.getElementById('ui') || document.body).append(bar);
    live = document.createElement('div'); live.className = 'lx-rr-sr'; live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); document.body.append(live);
  }
  const ensureCss = () => { if (!document.getElementById('lx-rr-modecss')) { const t = document.createElement('style'); t.id = 'lx-rr-modecss'; t.textContent = CSS; document.head.appendChild(t); } };
  function ensureFab() {
    if (fab) return; ensureCss();
    fab = document.createElement('button'); fab.type = 'button'; fab.className = 'lx-photo-fab lx-rr-fab'; fab.setAttribute('aria-label', 'Rearrange buildings'); fab.title = 'Rearrange buildings'; fab.setAttribute('aria-pressed', 'false'); fab.dataset.tut = 'rearrange'; fab.append(U.icon('hammer', 22)); fab.hidden = true;
    fab.addEventListener('click', (e) => { e.stopPropagation(); if (st.active) api.stop(); else api.start(); });
    try { game.hud.append(fab); } catch (e) { /* hud not built yet */ }
  }
  function unbuild() { if (bar) bar.remove(); if (live) live.remove(); bar = msgEl = undoB = doneB = live = null; }

  // ---------------------------------------------------------------- picking and moving
  function lift(i) {
    st.sel = i; st.dest = -1; hub().rrLift(i); hub().rrGhost(null); sfx('uiSelect'); vib(18);
    sync(); const n = bname(i), p = S().plots[i];
    say(`${n} level ${p.l} lifted. Choose a green plot to move it, a teal one to swap, or the lifted building to put it back. Prices float above each plot.`, `${n} lifted: tap a green plot (move) or teal (swap)`);
  }
  function drop(silent) {
    const n = st.sel >= 0 ? bname(st.sel) : ''; st.sel = -1; st.dest = -1; hub().rrLift(-1); hub().rrGhost(null); sync();
    if (!silent) { sfx('uiClose', { gain: 0.6 }); say(`${n} put back. Tap a building to lift it.`, 'Tap a building to lift it'); }
  }
  async function preview(to) {
    const lm = L(), s = S(), from = st.sel, q = lm.moveQuote(s, from, to);
    if (!q.ok) return refuse(q.why);
    if (s.gold < q.gold) return refuse(`Not enough gold: ${fmt(q.gold)} needed, you have ${fmt(s.gold)}`);
    const A = s.plots[from], B = s.plots[to]; st.dest = to; st.asking = true;
    hub().rrGhost({ from, to, a: { b: A.b, l: A.l }, bb: B ? { b: B.b, l: B.l } : null }); hub().frameTwo(from, to, { dur: 0.8 }); sfx('uiOpen', { gain: 0.5 });
    say(`${q.kind === 'swap' ? 'Swap' : 'Move'} ${D.BUILD[A.b].n}${B ? ' with ' + D.BUILD[B.b].n : ''}: ${fmt(q.gold)} gold, ${q.weeks.filter(Boolean).join(' and ')} week${Math.max(...q.weeks) > 1 ? 's' : ''}. Confirm or cancel.`, 'Confirm or cancel below');
    const ok = await askConfirm(from, to, q);
    st.asking = false; if (!st.active) return;
    if (!ok) { st.dest = -1; hub().rrGhost(null); sfx('uiClose', { gain: 0.6 }); say('Cancelled. The building is still lifted: choose another plot, or tap it to put it back.', 'Cancelled. Pick another plot'); sync(); return; }
    commit(from, to, q);
  }
  let cardEl = null, cardRes = null;
  /** the confirm card: a compact sheet at the bottom so the ghost and the line stay visible above it */
  function askConfirm(from, to, q) {
    const s = S(), A = s.plots[from], B = s.plots[to], lm = L(), swap = q.kind === 'swap';
    const clo = () => { if (cardEl) cardEl.remove(); cardEl = null; };
    clo();
    const el = cardEl = document.createElement('div'); el.className = 'lx-rr-confirm'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', `${swap ? 'Swap' : 'Move'} the ${D.BUILD[A.b].n}`); el.dataset.rr = 'confirm';
    const t = document.createElement('h3'); t.textContent = swap ? `Swap ${D.BUILD[A.b].n} and ${D.BUILD[B.b].n}?` : `Move the ${D.BUILD[A.b].n} to plot ${to + 1}?`;
    const pl = document.createElement('div'); pl.className = 'pl';
    const mk = (cls, txt) => { const x = document.createElement('span'); x.className = cls; x.textContent = txt; return x; };
    pl.append(mk('g', `${fmt(q.gold)} gold`), mk('w', swap ? `${q.weeks[0]} and ${q.weeks[1]} weeks of construction` : `${q.weeks[0]} week${q.weeks[0] > 1 ? 's' : ''} of construction`), mk('', `${fmt(s.gold - q.gold)} gold left`));
    const lines = [];
    const pause = (p) => { const fx = lm.bfx(s, p.b); return `${D.BUILD[p.b].n}: ${D.BUILD[p.b].f(fx.v, p.l)}`; };
    lines.push(`Perks paused meanwhile. ${pause(A)}.${B ? ' ' + pause(B) + '.' : ''}${A.b === 'barracks' || (B && B.b === 'barracks') ? ' The barracks keep 3 beds in tents.' : ''}`);
    const eff = q.fx.filter((e) => e.pct); lines.push(eff.length ? 'Neighbors once rebuilt: ' + eff.map((e) => `${D.BUILD[e.b].n} ${e.pct > 0 ? '+' : ''}${e.pct}%`).join(', ') + '.' : 'No neighbor bonus changes.');
    lines.push(`Undo it this week for ${fmt(Math.floor(q.gold * D.MOVE.undoRefund))} gold back.`);
    el.append(t, pl); for (const l of lines) { const p = document.createElement('p'); p.textContent = l; el.append(p); }
    const bt = document.createElement('div'); bt.className = 'bt';
    const ok = document.createElement('button'); ok.type = 'button'; ok.textContent = `Confirm ${fmt(q.gold)}`; ok.dataset.rr = 'ok'; ok.setAttribute('aria-label', `Confirm, ${fmt(q.gold)} gold`);
    const no = document.createElement('button'); no.type = 'button'; no.className = 'alt'; no.textContent = 'Cancel'; no.dataset.rr = 'cancel';
    bt.append(ok, no); el.append(bt); (document.getElementById('ui') || document.body).append(el);
    return new Promise((resolve) => {
      let done = false; const fin = (v) => { if (done) return; done = true; cardRes = null; clo(); resolve(v); };
      cardRes = fin; ok.addEventListener('click', () => fin(true)); no.addEventListener('click', () => fin(false));
      el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fin(false); } else if (e.key === 'Tab') { const f = [ok, no], i = f.indexOf(document.activeElement); e.preventDefault(); f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus(); } });
      setTimeout(() => { try { ok.focus(); } catch (e) { /* hidden */ } }, 30);
    });
  }
  function commit(from, to, q) {
    const lm = L(), s = S(), A = s.plots[from], B = s.plots[to], a = { b: A.b, l: A.l }, bb = B ? { b: B.b, l: B.l } : null, n = D.BUILD[A.b].n;
    const err = lm.moveBuilding(s, from, to, { busy: game.busy });
    if (err) return refuse(err);
    game.save(); sfx('coin'); vib([30, 40, 30]); st.sel = -1; st.dest = -1; st.cine = true;
    hub().rrLift(-1); hub().rrGhost(null); cached = []; hub().rrItems([], -1);
    const wk = q.weeks[0];
    say(`${n} is being ${q.kind === 'swap' ? 'swapped' : 'moved'}. The crew starts now.`, 'The crew is at work...');
    hub().playMove({ from, to, a, bb, weeks: q.weeks }, () => {
      st.cine = false; if (!st.active) return; sync();
      say(`${n} is being rebuilt at ${plotName(to)}. It will be ready in ${wk} week${wk > 1 ? 's' : ''}${q.kind === 'swap' ? '. The other building is rebuilt too' : ''}. Lift another building, or press Done.`, `${n}: ready in ${wk} wk. Lift another, or Done`);
    });
    game.refresh();   // gold counter now; the hub holds the rebuild until the cinematic applies it
  }
  function refuse(why) { sfx('uiError'); vib(40); U.toast(why, { kind: 'bad' }); say(why); return false; }

  /** what a tap (or Enter) on plot i does */
  function tap(i) {
    if (!st.active || st.cine || st.asking) return;
    if (i == null || i < 0) { if (st.sel >= 0) drop(); return; }
    st.cursor = i;
    const s = S();
    if (st.sel < 0) {
      if (i >= s.rows * COLS) return refuse('Unclaimed land. Buy the row first.');
      if (!s.plots[i]) { sfx('uiTap', { gain: 0.5 }); return say(`${plotName(i)} is empty. Lift a building first.`, 'Empty plot: lift a building first'); }
      const why = L().moveWhySource(s, i); if (why) return refuse(why);
      return lift(i);
    }
    if (i === st.sel) return drop();
    if (i >= s.rows * COLS) return refuse('Unclaimed land. Buy the row first.');
    return preview(i);
  }
  function describe(i) {
    const s = S(), p = s.plots[i]; if (i >= s.rows * COLS) return `${plotName(i)}, unclaimed land.`;
    const it = cached.find((x) => x.i === i);
    if (st.sel < 0) return p ? `${D.BUILD[p.b].n} level ${p.l}, ${plotName(i)}. ${it && it.why ? it.why : 'Press Enter to lift it.'}` : `${plotName(i)}, empty.`;
    if (i === st.sel) return `${bname(i)}, lifted. Press Enter to put it back.`;
    if (it && it.q) return `${plotName(i)}, ${p ? D.BUILD[p.b].n + ', swap' : 'empty, move here'}: ${fmt(it.q.gold)} gold, ${Math.max(...it.q.weeks)} week${Math.max(...it.q.weeks) > 1 ? 's' : ''}. Press Enter to preview.`;
    return `${plotName(i)}. ${it && it.why ? it.why : ''}`;
  }
  function setCursor(i) { if (i === st.cursor) return; st.cursor = i; hub().rrItems(cached, i); say(describe(i)); sfx('uiHover', { gain: 0.35 }); }
  function moveCursor(dx, dy) {
    const list = unlocked(), from = hub().plotScreen(st.cursor >= 0 ? st.cursor : list[0]); let best = -1, bs = 1e9;
    for (const i of list) { if (i === st.cursor) continue; const p = hub().plotScreen(i); if (p.behind) continue; const ax = (p.x - from.x) * dx + (p.y - from.y) * dy, pr = Math.abs((p.x - from.x) * dy) + Math.abs((p.y - from.y) * dx); if (ax < 12) continue; const sc = ax + pr * 2.2; if (sc < bs) { bs = sc; best = i; } }
    if (best >= 0) setCursor(best); else sfx('uiError', { gain: 0.3 });
  }
  function onKey(e) {
    if (!st.active || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('.lx-scrim:not(.lx-out)') || st.asking) return;   // a dialog or the confirm card owns the keys
    const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    const k = e.key, onBtn = t && t.tagName === 'BUTTON' && (k === 'Enter' || k === ' ');
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); if (st.cine) return hub().skipMove(); if (st.sel >= 0) return drop(); return api.stop(); }
    if (onBtn) return;
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
    if (dir) { e.preventDefault(); e.stopPropagation(); if (st.cine) return; if (st.cursor < 0) { setCursor(st.sel >= 0 ? st.sel : (unlocked().find((i) => S().plots[i]) ?? 0)); return; } return moveCursor(dir[0], dir[1]); }
    if (k === 'Enter' || k === ' ') { e.preventDefault(); e.stopPropagation(); if (st.cine) return hub().skipMove(); if (st.cursor < 0) setCursor(unlocked().find((i) => S().plots[i]) ?? 0); else tap(st.cursor); }
  }

  // ---------------------------------------------------------------- the public controller
  const api = {
    get active() { return st.active; }, get state() { return Object.assign({}, st, { items: cached.length }); }, tap, sync,
    get fab() { return fab; },
    async start(o = {}) {
      if (st.active || game.scene !== 'hub' || game.busy || !game.hub || typeof game.hub.rrBegin !== 'function') return false;   // the hub stub has no rearrange support
      if (S().pendingEv) { U.toast('Answer the pending event first', { kind: 'bad' }); return false; }
      await loadSK(); if (st.active || game.scene !== 'hub' || game.busy) return false;
      game.closeAll(); build(); st.active = true; st.sel = -1; st.cursor = -1; st.dest = -1; st.cine = false; st.asking = false;
      fab.setAttribute('aria-pressed', 'true'); hub().rrBegin({ onTap: (r) => { if (!r || r.type !== 'plot') return tap(-1); tap(r.i); }, onHover: (r) => { if (r && r.type === 'plot' && r.i !== st.cursor && !st.cine && !st.asking && r.i < S().rows * COLS) { st.cursor = r.i; hub().rrItems(cached, r.i); } } });
      document.addEventListener('keydown', onKey, true); unKey = () => document.removeEventListener('keydown', onKey, true);
      sync(); sfx('uiOpen');
      const movable = unlocked().filter((i) => S().plots[i] && !L().moveWhySource(S(), i)).length;
      say(`Rearrange mode. ${movable} building${movable === 1 ? '' : 's'} can be moved. Tap a building to lift it, or use the arrow keys and Enter. Escape leaves.`, 'Tap a building to lift it');
      if (o.lift != null && o.lift >= 0) { const why = L().moveWhySource(S(), o.lift); if (why) refuse(why); else { st.cursor = o.lift; lift(o.lift); hub().frameTwo(o.lift, null, { dur: 0.9 }); } }
      return true;
    },
    stop(silent) {
      if (!st.active) return false;
      if (cardRes) cardRes(false); if (st.cine) { try { hub().skipMove(); } catch (e) { /* done */ } }
      st.active = false; st.sel = -1; st.cursor = -1; try { hub().rrEnd(); } catch (e) { /* hub optional */ }
      if (unKey) { unKey(); unKey = null; } if (fab) fab.setAttribute('aria-pressed', 'false'); const m = silent ? '' : 'Rearrange mode off.'; unbuild(); if (m) { try { hub().say(m); } catch (e) { /* none */ } }
      return true;
    },
    undoAll() {
      const lm = L(), s = S(); let n = 0, refund = 0;
      for (const i of anyUndo()) { const info = lm.moveUndoInfo(s, i); if (!lm.moveUndo(s, i)) { n++; refund += info.refund; } }
      if (!n) return refuse('Nothing to undo');
      game.save(); game.refresh(); sfx('coin'); vib(25); st.sel = -1; hub().rrLift(-1); hub().rrGhost(null); sync(); say(`Undone. ${fmt(refund)} gold returned.`); return true;
    },
  };
  // the button only makes sense on the hub, with nothing running
  ensureFab();
  tick = setInterval(() => { if (!fab) return; const on = game.scene === 'hub' && !game.busy && !document.querySelector('.lx-photo:not([hidden])'); fab.hidden = !on && !st.active; if (st.active && game.scene !== 'hub') api.stop(true); }, 300);
  void tick;
  return api;
}
