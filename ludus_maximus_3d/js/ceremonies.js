// Ceremonies: the big emotional moments, built on the UI kit with CSS-only confetti and the existing audio hooks.
//   levelUp(ctx, g, level)      queued, non-blocking fanfare overlay (tap to skip)
//   trophy(ctx, list)           Promise, replaces the plain "Trophy earned" dialog
//   seasonFinale(ctx, fin)      Promise, shown when a season ends (fin = weekFinish result with .recap)
//   eulogy(ctx, o)              Promise, retirement / fallen farewell (o.body = the caller's own report node)
// Every entry point is wrapped so a ceremony can never break the weekly flow. No em dashes. Styles: .lx-cer-* in css/ui.css.
import * as U from './ui_kit.js';
import { glyph, trophyIcon } from './glyphs.js'; // WAVE3

const h = U.h;
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const wait = (ms) => new Promise((r) => setTimeout(r, U.reduced() ? Math.min(ms, 250) : ms));
const GOLDS = ['#f2c14e', '#ffe08a', '#d9942f', '#fff3c8', '#b5532f', '#7b4fb8', '#5b7a3a'];
const safe = (f) => (...a) => { try { return f(...a); } catch (e) { console.warn('ceremony', e && e.message); return null; } };
const sfx = (ctx, n, o) => { try { ctx.sfx(n, o); } catch (e) { /* audio locked */ } };

// ------------------------------------------------------------------ confetti (pure CSS pieces)
let layer;
function confettiLayer() {
  if (!layer || !layer.isConnected) { layer = h('div', 'lx-cer-layer'); layer.setAttribute('aria-hidden', 'true'); document.body.append(layer); }
  return layer;
}
// layering: the body-level layer is z 48, under every modal (50), so a dialog's title and text are never drawn over. A level-up burst passes `into` (its own overlay) and sits under that overlay's text.
// A pending burst is cleared the moment a dialog opens (ui_kit fires lx-modal-open), so confetti never trails into the next dialog.
if (typeof document !== 'undefined') document.addEventListener('lx-modal-open', () => { if (layer && layer.isConnected) layer.querySelectorAll('.lx-cer-conf').forEach((e) => e.classList.add('gone')); setTimeout(() => { if (layer && layer.isConnected) layer.replaceChildren(); }, 450); });
/** mode 'burst' shoots up from (x,y) in viewport fractions then falls; 'rain' drops from the top edge */
export function confetti({ n = 48, mode = 'burst', x = 0.5, y = 0.55, colors = GOLDS, ms = 3600, into = null } = {}) {
  if (U.reduced()) return;
  let host = confettiLayer(); const sc = [...document.querySelectorAll('.lx-scrim:not(.lx-out)')].pop(), into2 = into || sc; // inside the open dialog's scrim the pieces sit under the sheet (z 2), so text is never covered
  if (into2 && into2.isConnected) { host = h('div', 'lx-cer-layer inlay'); host.setAttribute('aria-hidden', 'true'); if (into2 === sc) into2.prepend(host); else into2.append(host); setTimeout(() => host.remove(), ms + 1600); }
  const els = [];
  for (let i = 0; i < n; i++) {
    const p = h('i', 'lx-cer-conf ' + mode); const r = (k) => ((i * 7919 + k * 104729) % 1000) / 1000;
    const spread = (r(1) - 0.5) * (mode === 'burst' ? 560 : 120);
    p.style.cssText = `left:${mode === 'burst' ? x * 100 : r(2) * 100}%;top:${mode === 'burst' ? y * 100 : -4}%;--c:${colors[i % colors.length]};--dx:${spread.toFixed(0)}px;--up:${(120 + r(3) * 260).toFixed(0)}px;--fall:${(mode === 'burst' ? 260 + r(4) * 260 : innerHeight * 1.1).toFixed(0)}px;--rot:${(r(5) * 900 - 450).toFixed(0)}deg;--dur:${((mode === 'burst' ? 1.9 : 3) + r(6) * 1.3).toFixed(2)}s;--del:${(r(7) * (mode === 'burst' ? 0.15 : 1.2)).toFixed(2)}s;--w:${(5 + r(8) * 6).toFixed(0)}px`;
    if (i % 3 === 0) p.classList.add('round');
    host.append(p); els.push(p);
  }
  setTimeout(() => els.forEach((e) => e.remove()), ms + 1500);
}

// ------------------------------------------------------------------ level up (queued so a double level never overlaps)
let q = Promise.resolve();
const celebrated = new WeakMap(); // g -> highest level already celebrated (flow.js calls from several places)
export function levelUp(ctx, g, level) {
  if (!g) return q; level = level == null ? g.lvl : level;
  if ((celebrated.get(g) || 0) >= level) return q; celebrated.set(g, level);
  q = q.then(() => play(ctx, g, level == null ? g.lvl : level)).catch(() => {});
  return q;
}
const playLevel = safe(async (ctx, g, level) => {
  let ph = null; try { ph = ctx.portrait ? ctx.portrait(g, 104) : null; } catch (e) { ph = null; }
  const ring = h('div', 'lx-cer-ring', [ph || U.icon('star', 48)]);
  const D = globalThis.LM_D, st = D && D.STYLES && D.STYLES[g.style] ? D.STYLES[g.style].n : '';
  const el = h('div', 'lx-cer-lvl', [h('i', 'lx-rays'), ring, U.laurel('lx-cer-laurel'),
    h('div', 'lx-cer-kicker', 'Level up'), h('div', 'lx-cer-num lx-num', String(Math.max(1, level - 1))), h('div', 'lx-cer-name lx-engrave', g.name), st ? h('div', 'lx-cer-sub', st) : null]);
  el.setAttribute('role', 'status'); document.body.append(el);
  void el.offsetWidth; el.classList.add('in');
  sfx(ctx, 'levelUp'); setTimeout(() => sfx(ctx, 'crowdCheer', { gain: 0.7 }), 420);
  const num = el.querySelector('.lx-cer-num'); setTimeout(() => { num.textContent = String(level); num.classList.add('pop'); confetti({ n: 56, y: 0.45, into: el }); }, U.reduced() ? 0 : 520);
  await new Promise((done) => { let t = setTimeout(done, globalThis.__CER_HOLD || (U.reduced() ? 1400 : 2700)); el.addEventListener('pointerdown', () => { clearTimeout(t); done(); }); });
  el.classList.add('out'); await wait(380); el.remove();
});
const play = playLevel;

// ------------------------------------------------------------------ trophies
const CUP = '<svg viewBox="0 0 64 64" class="lx-cer-cupsvg" aria-hidden="true"><defs><linearGradient id="lxc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3c8"/><stop offset=".45" stop-color="#f2c14e"/><stop offset="1" stop-color="#9a6420"/></linearGradient></defs><path d="M18 8h28v16c0 9-6 15-14 15S18 33 18 24z" fill="url(#lxc)" stroke="#5a3a12" stroke-width="2"/><path d="M18 12H8c0 9 4 14 11 15M46 12h10c0 9-4 14-11 15" fill="none" stroke="#d9942f" stroke-width="3" stroke-linecap="round"/><path d="M29 39h6v8h-6z" fill="#b8803a"/><path d="M20 56l3-9h18l3 9z" fill="url(#lxc)" stroke="#5a3a12" stroke-width="2" stroke-linejoin="round"/><path d="M24 12v12c0 5 3 8 6 9" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="2.5" stroke-linecap="round"/></svg>';
export const trophy = safe(async (ctx, list) => {
  const body = h('div', 'lx-cer-troph');
  list.forEach((x) => {
    const cup = h('div', 'lx-cer-cup'); cup.innerHTML = x.ic || x.id ? `<div class="lx-bl-cmedal">${glyph(trophyIcon(x), { size: 54, sw: 1.7 })}</div>` : CUP; // WAVE3: per-trophy glyph
    const chips = h('div', 'lx-cer-chips', [x.r && x.r.gold ? h('span', 'lx-cer-chip gold', `+${x.r.gold} gold`) : null, x.r && x.r.fame ? h('span', 'lx-cer-chip fame', `+${x.r.fame} fame`) : null, x.r && x.r.laurels ? h('span', 'lx-cer-chip laurel', `+${x.r.laurels} laurels`) : null]);
    body.append(h('div', 'lx-cer-tr', [h('div', 'lx-cer-cupwrap', [h('i', 'lx-rays'), cup]), h('div', 'lx-cer-trname lx-engrave', x.n), h('div', 'lx-cer-trdesc', x.d), chips]));
  });
  try { const D = globalThis.LM_D, S = ctx.S, got = Object.keys(S.trophies || {}).length; if (D && D.TROPHIES) body.append(h('div', 'lx-bl-tcount', `${got} of ${D.TROPHIES.length} trophies in your hall`)); } catch (e) { /* optional */ }
  const p = ctx.ask({ title: list.length > 1 ? 'Trophies earned' : 'Trophy earned', body, actions: [{ label: 'Magnificent', value: 'ok', variant: 'gold', icon: 'star' }], dismiss: 'ok' });
  tag('lx-cer-scrim');
  sfx(ctx, 'levelUp'); setTimeout(() => { sfx(ctx, 'crowdRoar', { gain: 0.8 }); confetti({ n: 70, y: 0.4 }); confetti({ n: 40, mode: 'rain' }); }, 380);
  return p;
});

/** style the scrim the kit just appended (modal() adds it synchronously inside ask) */
function tag(cls) { const all = document.querySelectorAll('.lx-scrim:not(.lx-out)'); const s = all[all.length - 1]; if (s) s.classList.add(cls); return s; }

// ------------------------------------------------------------------ season finale
export const seasonFinale = safe(async (ctx, fin) => {
  const r = fin.recap, S = ctx.S; if (!r) return;
  const tiles = [['Wins', r.wins], ['Losses', r.losses], ['Fame', r.fame], ['Titles', r.tour]];
  const grid = h('div', 'lx-cer-tiles', tiles.map(([k, v]) => { const n = h('b', 'lx-num', '0'); const t = h('div', 'lx-cer-tile', [n, h('span', '', k)]); t._n = n; t._v = v; return t; }));
  const body = h('div', 'lx-cer-fin-body', [h('i', 'lx-rays'), U.laurel('lx-cer-bigl'), h('div', 'lx-cer-kicker', `Season ${fin.season - 1}`), h('div', 'lx-cer-finh lx-engrave', 'Complete'), grid]);
  if (r.mvp) { let ph = null; const mg = S.glads.find((x) => x.name === r.mvp.name); try { ph = mg && ctx.portrait ? ctx.portrait(mg, 64) : null; } catch (e) { ph = null; } body.append(h('div', 'lx-cer-mvp', [ph ? h('div', 'lx-cer-mvpph', ph) : U.icon('star', 28), h('div', '', [h('small', '', 'Most valuable gladiator'), h('b', '', `${r.mvp.name}`), h('span', '', ` ${r.mvp.w} win${r.mvp.w === 1 ? '' : 's'}`)])])); }
  if (r.rival) body.append(h('div', 'lx-cer-riv', [h('small', '', 'Rivals of the year'), h('b', '', `${r.rival.a} and ${r.rival.b}`), h('span', '', ` +${r.rival.fame} fame`)]));
  body.append(h('div', 'lx-cer-next', `Season ${fin.season} awaits. The rivals have grown stronger.`));
  try { ctx.audio.music.setMode('season', { fade: 0.3 }); } catch (e) { /* locked */ }
  const p = ctx.ask({ title: 'Season finale', body, actions: [{ label: `Onward to season ${fin.season}`, value: 'ok', variant: 'gold', icon: 'arena' }], dismiss: 'ok' });
  tag('lx-cer-scrim'); tag('lx-cer-fin');
  sfx(ctx, 'horn'); setTimeout(() => sfx(ctx, 'crowdRoar'), 700);
  grid.querySelectorAll('.lx-cer-tile').forEach((t, i) => setTimeout(() => { U.countUp(t._n, t._v, { dur: 1100 }); sfx(ctx, 'coin', { gain: 0.4 }); }, U.reduced() ? 0 : 600 + i * 380));
  setTimeout(() => { confetti({ n: 90, y: 0.3 }); confetti({ n: 60, mode: 'rain' }); }, 500);
  const v = await p;
  try { ctx.audio.music.setMode('ludus', { fade: 1.5 }); } catch (e) { /* locked */ }
  return v;
});

// ------------------------------------------------------------------ eulogy (retirement or fallen)
const LINES = {
  retire: ['Their name will be shouted in this arena long after the sand is raked clean.', 'The crowd will remember the sound of that shield on iron.', 'A career carved in scars, and every one of them earned.', 'The gates open for the last time, and the whole ludus stands to watch.'],
  fallen: ['The sand drinks the last of the light, and the crowd falls quiet.', 'He fought to the end. That is all a gladiator owes the arena.', 'Let the lanista pour one cup on the sand for him tonight.'],
};
const pickLine = (k, name, w) => { const a = LINES[k] || LINES.retire; let s = 0; for (const c of name + w) s = (s * 31 + c.charCodeAt(0)) | 0; return a[Math.abs(s) % a.length]; };
export const eulogy = safe(async (ctx, o) => {
  const kind = o.kind === 'fallen' ? 'fallen' : 'retire', lg = o.legend || {};
  const name = lg.name || o.name || 'The gladiator';
  const rec = lg.w != null ? `${lg.w}W ${lg.l}L` : '', st = (globalThis.LM_D && globalThis.LM_D.STYLES[lg.style]) ? globalThis.LM_D.STYLES[lg.style].n : '';
  const candles = h('div', 'lx-cer-candles', [0, 1, 2, 3, 4].map((i) => { const c = h('i'); c.style.setProperty('--i', i); return c; }));
  const body = h('div', 'lx-cer-eul', [candles, h('div', 'lx-cer-kicker', kind === 'fallen' ? 'Fallen in the arena' : 'Farewell to the sand'),
    h('div', 'lx-cer-eulname lx-engrave', name + (lg.nick ? ' ' + lg.nick : '')), h('div', 'lx-cer-eulsub', [st, lg.lvl ? `Level ${lg.lvl}` : '', rec].filter(Boolean).join('  ·  ')),
    h('div', 'lx-cer-quote', `"${pickLine(kind, name, (lg.w || 0) + (lg.l || 0))}"`), o.body || null]);
  const p = ctx.ask({ title: kind === 'fallen' ? 'In memoriam' : 'Hall of Legends', body, actions: o.actions || [{ label: 'Farewell', value: 'ok', variant: 'gold' }], dismiss: o.dismiss === undefined ? 'ok' : o.dismiss, _cer: true });
  tag('lx-cer-scrim'); tag('lx-cer-eulscrim');
  if (kind === 'fallen') { try { ctx.audio.music.setMode('elegy', { fade: 0.6 }); p.then(() => { try { ctx.audio.music.setMode('ludus', { fade: 2 }); } catch (e) { /* locked */ } }); } catch (e) { /* locked */ } sfx(ctx, 'deathThud', { gain: 0.6 }); setTimeout(() => sfx(ctx, 'crowdGasp'), 300); } else { sfx(ctx, 'horn', { gain: 0.6 }); setTimeout(() => sfx(ctx, 'crowdChant', { gain: 0.8 }), 900); setTimeout(() => confetti({ n: 36, mode: 'rain', colors: ['#f2c14e', '#fff3c8', '#d9b27c'] }), 900); }
  return p;
});

// ================================================================== CAMPAIGN: chapter title card, duel card (finale and grudge taunt), epilogue
// Built on the same overlay look as the level-up fanfare. Styles are injected once (cp-cer-css); every entry is wrapped by safe() so a story moment never breaks the weekly flow.
const CP_CSS = `
.cp-card{position:fixed;inset:0;z-index:66;display:grid;place-content:center;justify-items:center;gap:10px;padding:24px 20px;text-align:center;background:radial-gradient(ellipse at 50% 46%,rgba(46,22,64,.82),rgba(10,6,20,.94) 78%);opacity:0;transition:opacity .5s;cursor:pointer}
.cp-card.in{opacity:1}.cp-card.out{opacity:0}
.cp-card>*{position:relative;z-index:2}
.cp-card .lx-rays{position:absolute;z-index:1;left:50%;top:44%;width:150vmax;height:150vmax;margin:-75vmax 0 0 -75vmax;opacity:.35}
.cp-bars{position:absolute;left:0;right:0;z-index:3;height:11vh;background:#05030a}.cp-bars.t{top:0}.cp-bars.b{bottom:0}
.cp-num{font:900 clamp(56px,16vw,96px)/1 var(--lx-serif);letter-spacing:.08em;color:#fff3c8;text-shadow:0 0 28px rgba(242,193,78,.7),0 4px 0 rgba(0,0,0,.6);transform:scale(.8);opacity:0;transition:transform .9s var(--lx-ease-out),opacity .9s}
.cp-card.in .cp-num{transform:none;opacity:1}
.cp-ttl{font:800 clamp(22px,6.4vw,34px)/1.15 var(--lx-serif);letter-spacing:.1em;text-transform:uppercase;color:var(--lx-gold);max-width:92vw;text-shadow:0 2px 0 rgba(0,0,0,.7);opacity:0;transform:translateY(8px);transition:opacity .8s .5s,transform .8s .5s}
.cp-sub2{font:600 var(--lx-fs-m)/1.45 var(--lx-sans);color:var(--lx-sand);max-width:30em;opacity:0;transition:opacity .8s 1.1s}
.cp-goal{margin-top:6px;padding:6px 14px;border-radius:999px;font:700 var(--lx-fs-s)/1.3 var(--lx-sans);color:#2a1a08;background:linear-gradient(180deg,#ffe08a,#f2c14e);opacity:0;transition:opacity .8s 1.6s}
.cp-card.in .cp-ttl,.cp-card.in .cp-sub2,.cp-card.in .cp-goal{opacity:1;transform:none}
.cp-tap{font:600 11px/1 var(--lx-sans);letter-spacing:.2em;text-transform:uppercase;color:var(--lx-sand);opacity:.0;transition:opacity .6s 2.4s}.cp-card.in .cp-tap{opacity:.6}
.cp-duel{display:grid;justify-items:center;gap:10px;padding:2px 0 0;text-align:center}
.cp-duel .pf{width:116px;height:116px;border-radius:50%;padding:4px;background:conic-gradient(from 0deg,#fff3c8,#f2c14e,#9a6420,#f2c14e,#fff3c8);box-shadow:0 0 34px rgba(242,193,78,.55),0 6px 18px #000;overflow:hidden;display:grid;place-items:center}
.cp-duel .pf>*{border-radius:50%;width:100%!important;height:100%!important;background:#2a2540}
.cp-duel .nmx{font:800 var(--lx-fs-xl)/1.15 var(--lx-serif);letter-spacing:.06em;color:var(--lx-text)}
.cp-duel .nkx{font:700 var(--lx-fs-s)/1.2 var(--lx-sans);letter-spacing:.2em;text-transform:uppercase;color:var(--lx-gold)}
.cp-duel .qt{font:italic 500 var(--lx-fs-m)/1.45 var(--lx-serif);max-width:28em;color:var(--lx-travertine)}
.cp-duel .chs{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}
.cp-ep{display:grid;gap:10px;position:relative}
.cp-ep p{margin:0;text-align:left;line-height:1.5;color:var(--lx-text)}
.cp-ep .fl{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}
.cp-ep .fl span{padding:3px 10px;border-radius:999px;background:rgba(10,6,24,.5);box-shadow:inset 0 0 0 1px rgba(242,193,78,.3);font:600 var(--lx-fs-s)/1.3 var(--lx-sans)}
.cp-ep .nem{padding:10px 12px;border-radius:10px;background:rgba(10,6,24,.45);box-shadow:inset 0 0 0 1px rgba(242,193,78,.3);text-align:left;font:600 var(--lx-fs-s)/1.45 var(--lx-sans)}
.cp-ep .tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:100%}
`;
function cpCss() { if (typeof document === 'undefined' || document.getElementById('cp-cer-css')) return; const s = document.createElement('style'); s.id = 'cp-cer-css'; s.textContent = CP_CSS; document.head.append(s); }

/** the title card of a chapter: roman numeral, title, one line, the goal. Tap to skip; auto-continues. */
export const chapterCard = safe(async (ctx, ch) => {
  if (!ch) return; cpCss();
  const el = h('div', 'cp-card', [h('i', 'lx-rays'), h('i', 'cp-bars t'), h('i', 'cp-bars b'), U.laurel('lx-cer-laurel'), h('div', 'lx-cer-kicker', 'Chapter'), h('div', 'cp-num', ch.n), h('div', 'cp-ttl', ch.t), h('div', 'cp-sub2', ch.line), h('div', 'cp-goal', ch.goal), h('div', 'cp-tap', 'Tap to continue')]);
  el.setAttribute('role', 'status'); el.setAttribute('aria-label', `Chapter ${ch.n}: ${ch.t}. ${ch.line} ${ch.goal}`); document.body.append(el); void el.offsetWidth; el.classList.add('in');
  try { ctx.audio.music.setMode('season', { fade: 0.5 }); } catch (e) { /* locked */ }
  sfx(ctx, 'horn', { gain: 0.5 });
  await new Promise((done) => { let t = setTimeout(done, globalThis.__CER_HOLD ? globalThis.__CER_HOLD : (U.reduced() ? 1600 : 5200)); el.addEventListener('pointerdown', () => { clearTimeout(t); done(); }); });
  el.classList.add('out'); await wait(420); el.remove();
  try { ctx.audio.music.setMode('ludus', { fade: 1.5 }); } catch (e) { /* locked */ }
});

/** o: {kicker, title, glad (foe fighter for the portrait), name, nick, quote, chips:[{t,tone}], action, finale:boolean}. Resolves when the player confirms. */
export const duelCard = safe(async (ctx, o) => {
  cpCss();
  let ph = null; try { ph = o.glad && ctx.portrait ? ctx.portrait(o.glad, 116) : null; } catch (e) { ph = null; }
  const chips = h('div', 'chs', (o.chips || []).map((c) => h('span', 'lx-cer-chip ' + (c.tone === 'bad' ? 'fame' : c.tone === 'good' ? 'laurel' : 'gold'), c.t)));
  const body = h('div', 'cp-duel', [h('div', 'lx-cer-kicker', o.kicker), h('div', 'pf', [ph || U.icon('skull', 48)]), h('div', 'nmx lx-engrave', o.name), o.nick ? h('div', 'nkx', o.nick) : null, o.quote ? h('div', 'qt', `"${o.quote}"`) : null, chips]);
  try { ctx.audio.music.setMode(o.finale ? 'boss' : 'prep', { fade: 0.4 }); } catch (e) { /* locked */ }
  const p = ctx.ask({ title: o.title, body, actions: [{ label: o.action || 'To the sand', value: 'ok', variant: o.finale ? 'gold' : 'danger', icon: 'sword' }], dismiss: 'ok', closable: false, why: '' });
  tag('lx-cer-scrim'); tag('lx-cer-fin'); sfx(ctx, o.finale ? 'horn' : 'crowdGasp', { gain: 0.6 });
  return p;
});

/** the epilogue: the ending, what became of the nemesis, the fallen, the stats of your ludus. ep = LM.campaign.epilogue(S). */
export const epilogue = safe(async (ctx, ep) => {
  if (!ep) return; cpCss();
  const tiles = h('div', 'tiles', ep.stats.map(([k, v]) => h('div', 'lx-cer-tile', [h('b', 'lx-num', String(v)), h('span', '', k)])));
  const body = h('div', 'cp-ep', [h('i', 'lx-rays'), U.laurel('lx-cer-bigl'), h('div', 'lx-cer-kicker', `Epilogue: ${ep.kind}`), h('div', 'lx-cer-finh lx-engrave', ep.title), ...ep.paras.map((t) => h('p', '', t)), tiles]);
  if (ep.freed && ep.freed.length) body.append(h('div', 'lx-cer-kicker', 'Free men'), h('div', 'fl', ep.freed.map((n) => h('span', '', n))));
  if (ep.fallen && ep.fallen.length) body.append(h('div', 'lx-cer-kicker', 'Remembered'), h('div', 'fl', ep.fallen.map((f) => h('span', '', `${f.name}${f.nick ? ' ' + f.nick : ''}, level ${f.lvl}`))));
  body.append(h('div', 'nem', ep.nemLine || ''));
  try { ctx.audio.music.setMode(ep.id === 'ruin' ? 'elegy' : 'victory', { fade: 0.8 }); } catch (e) { /* locked */ }
  const p = ctx.ask({ title: 'The story so far', body, actions: [{ label: ep.id === 'ruin' ? 'Rebuild' : 'The sand remains', value: 'ok', variant: 'gold', icon: 'arena' }], dismiss: 'ok' });
  tag('lx-cer-scrim'); tag('lx-cer-fin'); sfx(ctx, ep.id === 'ruin' ? 'deathThud' : 'horn', { gain: 0.6 }); if (ep.id !== 'ruin') setTimeout(() => { confetti({ n: 90, y: 0.3 }); confetti({ n: 50, mode: 'rain' }); }, 600);
  const v = await p; try { ctx.audio.music.setMode('ludus', { fade: 2 }); } catch (e) { /* locked */ } return v;
});
