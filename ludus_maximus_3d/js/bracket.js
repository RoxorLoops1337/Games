// Tournament presentation (Ludus Maximus 3D): the marble bracket tablet and the fight intro (VS) splash.
//   showBracket(ctx, T, {mode:'before'|'after'|'preview', name, ev, champion, won, note}) -> Promise<void>
//     'before'  the tablet before a round: the current bout is lit, the crowd's odds and favourites are shown (the crowd only knows level and style)
//     'after'   the round just played: results of every bout are revealed one by one, winners slide into the next round, the player's path is gilded
//     'preview' the seeding before you enter (Arena screen), closes with a button
//   vsIntro({host, a:[unit], b:[unit], league, meta, ms}) -> Promise: portrait busts, names, the arena theme's colour and ambience
// Pure DOM/CSS/SVG. The tablet markup uses .lx-scrim + .lx-actions so keyboard users, the bot and the monkey treat it like any other dialog.
import * as U from './ui_kit.js';

const D = () => globalThis.LM_D, L = () => globalThis.LM;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('lx-rm') || document.body.classList.contains('lx-rm'); } catch (e) { return false; } };

const KEY = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='12' viewBox='0 0 24 12'%3E%3Cpath d='M0 11h3V2h18v7H9V5h6' fill='none' stroke='%237a5222' stroke-width='1.6'/%3E%3C/svg%3E";
const VEINS = "data:image/svg+xml;utf8," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='640' height='420' viewBox='0 0 640 420' fill='none' stroke-linecap='round'><g stroke='rgb(112,92,74)' stroke-opacity='.30' stroke-width='1.3'><path d='M-10 96C110 40 190 170 320 118S520 30 650 104'/><path d='M-10 330C90 270 210 380 330 300S560 250 650 340'/><path d='M120 -10C150 90 90 150 160 230S250 340 220 430'/></g><g stroke='rgb(112,92,74)' stroke-opacity='.16' stroke-width='2.4'><path d='M-10 180C80 150 140 240 260 200S420 130 650 210'/><path d='M400 -10C380 80 470 140 430 230S520 360 500 430'/></g><g stroke='rgb(150,126,100)' stroke-opacity='.22' stroke-width='.8'><path d='M-10 250C120 280 160 200 300 240S520 300 650 260'/><path d='M60 -10C40 70 120 90 90 170S30 300 70 430'/><path d='M560 -10C590 60 520 110 580 190S600 330 560 430'/></g></svg>");
const CSS = `
.bk-root{position:fixed;inset:0;z-index:55;display:flex!important;align-items:center!important;justify-content:center;padding:calc(var(--lx-sat,0px) + 8px) 8px calc(var(--lx-sab,0px) + 8px);background:radial-gradient(ellipse at 50% 30%,rgba(58,45,82,.96),rgba(14,9,26,.98) 75%)!important;overflow:hidden}
.bk-tab{position:relative;display:flex;flex-direction:column;width:min(1000px,100%);max-height:100%;box-sizing:border-box;padding:18px 12px 12px;border-radius:14px;color:#3a2a18;border:4px solid #b8803a;
 background:url("${VEINS}") center/cover,radial-gradient(ellipse at 18% 8%,#fffaf0 0,rgba(255,250,240,0) 55%),radial-gradient(ellipse at 85% 95%,#e4d6b8 0,rgba(228,214,184,0) 60%),linear-gradient(160deg,#f6eedb,#e8dcc2 48%,#f2e9d3);
 box-shadow:inset 0 0 0 2px #7a5222,inset 0 0 46px rgba(120,90,50,.38),0 24px 60px rgba(0,0,0,.75);animation:bk-rise .5s cubic-bezier(.2,.9,.25,1.1) both}
.bk-tab::before{content:'';position:absolute;left:12px;right:12px;top:4px;height:12px;background:url("${KEY}") repeat-x left center/24px 12px;opacity:.85}
@keyframes bk-rise{from{opacity:0;transform:translateY(24px) scale(.97)}to{opacity:1;transform:none}}
.bk-head{text-align:center;padding:2px 6px 8px}
.bk-kick{font:700 11px/1 var(--lx-serif,Georgia,serif);letter-spacing:.34em;text-transform:uppercase;color:#7a5222}
.bk-title{margin:4px 0 0;font:900 clamp(20px,5.6vw,34px)/1.05 var(--lx-serif,Georgia,serif);letter-spacing:.1em;text-transform:uppercase;color:#4a2f12;text-shadow:0 1px 0 rgba(255,246,222,.95),0 -1px 0 rgba(90,60,30,.45),0 2px 3px rgba(90,60,30,.3)}
.bk-sub{margin-top:4px;font:600 12px/1.3 var(--lx-sans,system-ui);color:#5a4630}
.bk-scroll{position:relative;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;flex:1 1 auto;min-height:0;padding:4px 2px 8px;scroll-snap-type:x proximity}
.bk-grid{position:relative;display:flex;gap:clamp(14px,3.4vw,40px);min-width:min-content;justify-content:center;align-items:stretch;min-height:230px}
.bk-col{display:flex;flex-direction:column;justify-content:space-around;gap:10px;width:clamp(150px,30vw,200px);flex:none;scroll-snap-align:center}
.bk-colh{text-align:center;font:800 11px/1 var(--lx-serif,Georgia,serif);letter-spacing:.2em;text-transform:uppercase;color:#7a5222;padding-bottom:2px}
.bk-m{position:relative;display:flex;flex-direction:column;gap:3px;padding:4px;border-radius:10px;background:rgba(255,250,236,.55);box-shadow:inset 0 0 0 1.5px rgba(122,82,34,.45)}
.bk-m.cur{background:rgba(255,243,200,.85);box-shadow:inset 0 0 0 2.5px #d9a21f,0 0 0 3px rgba(242,193,78,.45),0 0 22px rgba(242,193,78,.6);animation:bk-glow 1.6s ease-in-out infinite}
@keyframes bk-glow{50%{box-shadow:inset 0 0 0 2.5px #f2c14e,0 0 0 5px rgba(242,193,78,.25),0 0 34px rgba(242,193,78,.85)}}
.bk-m .bk-tag{position:absolute;top:-9px;left:50%;transform:translateX(-50%);padding:2px 8px;border-radius:999px;background:#d9a21f;color:#2a1a30;font:900 9px/1.2 var(--lx-sans,system-ui);letter-spacing:.12em;text-transform:uppercase;white-space:nowrap}
.bk-p{position:relative;display:flex;align-items:center;gap:6px;min-height:42px;padding:3px 6px 3px 4px;border-radius:7px;background:linear-gradient(180deg,#fffaf0,#efe3c8);box-shadow:inset 0 0 0 1px rgba(122,82,34,.4),0 1px 0 rgba(255,255,255,.7);transition:opacity .4s,transform .4s,filter .4s}
.bk-p.you{background:linear-gradient(180deg,#ffe9a6,#f2c14e);box-shadow:inset 0 0 0 2px #8a5a14,0 1px 0 rgba(255,255,255,.6)}
.bk-p.win{box-shadow:inset 0 0 0 2px #3f8a50,0 0 12px rgba(63,138,80,.55)}
.bk-p.you.win{box-shadow:inset 0 0 0 2px #8a5a14,0 0 16px rgba(242,193,78,.85)}
.bk-p.lose{opacity:.5;filter:grayscale(.8)}
.bk-p.lose .bk-n{text-decoration:line-through;text-decoration-thickness:1.5px}
.bk-p.hide{opacity:0;transform:scale(.8) translateX(-10px)}
.bk-p.unk{opacity:.55}
.bk-ph{flex:none;width:34px;height:34px;border-radius:50%;overflow:hidden;box-shadow:inset 0 0 0 2px #7a5222;display:grid;place-items:center;background:#2a2540}
.bk-ph>*{width:100%!important;height:100%!important;border-radius:50%}
.bk-i{min-width:0;flex:1}
.bk-n{display:block;font:800 12px/1.15 var(--lx-sans,system-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#2a1a30}
.bk-l{display:block;font:700 10px/1.2 var(--lx-sans,system-ui);color:#6a5230;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bk-o{flex:none;min-width:34px;text-align:center;padding:2px 4px;border-radius:6px;background:rgba(58,42,24,.88);color:#f6e6b8;font:800 11px/1.2 var(--lx-sans,system-ui);font-variant-numeric:tabular-nums}
.bk-o.fav{background:#7a5a10;color:#fff3c0}
.bk-star{position:absolute;right:-5px;top:-7px;width:18px;height:18px;filter:drop-shadow(0 1px 1px rgba(0,0,0,.5))}
.bk-lines{position:absolute;left:0;top:0;pointer-events:none;overflow:visible}
.bk-lines path{fill:none;stroke:rgba(122,82,34,.55);stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
.bk-lines path.you{stroke:#d9a21f;stroke-width:4}
.bk-lines path.pend{stroke-dasharray:var(--len);stroke-dashoffset:var(--len)}
.bk-lines path.on{stroke-dashoffset:0;transition:stroke-dashoffset .5s ease-out}
.bk-lines path.dim{stroke:rgba(122,82,34,.25)}
.bk-champ{align-self:center;display:flex;flex-direction:column;align-items:center;gap:6px;width:clamp(110px,24vw,170px);flex:none;scroll-snap-align:center}
.bk-crown{width:64px;height:64px;color:#c98e14;filter:drop-shadow(0 2px 0 rgba(255,246,222,.9)) drop-shadow(0 4px 6px rgba(90,60,30,.5));transition:transform .6s cubic-bezier(.3,1.6,.5,1),opacity .4s}
.bk-champ.pend .bk-crown{opacity:.35;transform:scale(.8)}
.bk-champ.won .bk-crown{animation:bk-crown 1.2s ease-out both}
@keyframes bk-crown{0%{transform:scale(.4) rotate(-12deg);opacity:0}60%{transform:scale(1.3) rotate(4deg);opacity:1}100%{transform:scale(1)}}
.bk-note{margin:6px 6px 0;padding:7px 10px;border-radius:9px;background:rgba(58,42,24,.1);box-shadow:inset 0 0 0 1px rgba(122,82,34,.3);font:600 12.5px/1.4 var(--lx-sans,system-ui);text-align:center;color:#3a2a18}
.bk-note b{color:#7a2f30}
.bk-tab .lx-actions{padding-top:10px;justify-content:center}
.bk-tab .lx-actions .lx-btn{flex:0 1 280px}
.bk-fav{display:inline-flex;align-items:center;gap:4px;font:700 11px/1 var(--lx-sans,system-ui);color:#7a5a10}
.bk-burst{position:absolute;inset:0;pointer-events:none;overflow:hidden;border-radius:10px}
.bk-burst i{position:absolute;left:50%;top:44%;width:7px;height:7px;border-radius:50%;background:#f2c14e;box-shadow:0 0 8px #f2c14e;animation:bk-fly 1.4s ease-out forwards}
@keyframes bk-fly{from{transform:translate(0,0) scale(1);opacity:1}to{transform:translate(var(--dx),var(--dy)) scale(.2);opacity:0}}
@media (max-height:520px){.bk-tab{padding-top:14px}.bk-title{font-size:20px}.bk-p{min-height:36px}.bk-ph{width:28px;height:28px}.bk-grid{min-height:160px}}
@media (prefers-reduced-motion:reduce){.bk-tab,.bk-m.cur,.bk-champ.won .bk-crown{animation:none}.bk-p,.bk-lines path.on{transition:none}}
/* VS intro */
.vs3{position:fixed;inset:0;z-index:40;pointer-events:none;overflow:hidden;--tc:#f2c14e;--tc2:#7a5222;font-family:var(--lx-sans,system-ui);color:#f6ead0;animation:vs3-in .25s ease-out both}
.vs3.out{opacity:0;transition:opacity .45s}
@keyframes vs3-in{from{opacity:0}to{opacity:1}}
.vs3-bar{position:absolute;left:0;right:0;height:calc(11vh + var(--lx-sat,0px));background:linear-gradient(180deg,#0b0713,rgba(11,7,19,.0));}
.vs3-bar.t{top:0}.vs3-bar.b{bottom:0;transform:rotate(180deg);height:calc(13vh + var(--lx-sab,0px))}
.vs3-half{position:absolute;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:5px;padding:0 12px 6px;box-sizing:border-box}
.vs3-half.a{left:0;top:13vh;width:56%;bottom:40vh;align-items:flex-start;text-align:left;animation:vs3-l .6s cubic-bezier(.2,.9,.25,1.1) both}
.vs3-half.b{right:0;top:40vh;width:56%;bottom:13vh;align-items:flex-end;text-align:right;animation:vs3-r .6s .14s cubic-bezier(.2,.9,.25,1.1) both}
@keyframes vs3-l{from{transform:translateX(-110%)}to{transform:none}}@keyframes vs3-r{from{transform:translateX(110%)}to{transform:none}}
.vs3-bg{position:absolute;inset:0;z-index:-1;background:linear-gradient(100deg,rgba(18,12,30,.82),color-mix(in srgb,var(--tc) 22%,rgba(18,12,30,.7)) 60%,rgba(18,12,30,0));clip-path:polygon(0 0,100% 0,88% 100%,0 100%);box-shadow:inset 0 -3px 0 var(--tc)}
.vs3-half.b .vs3-bg{background:linear-gradient(260deg,rgba(18,12,30,.82),color-mix(in srgb,#c2392f 22%,rgba(18,12,30,.7)) 60%,rgba(18,12,30,0));clip-path:polygon(12% 0,100% 0,100% 100%,0 100%);box-shadow:inset 0 3px 0 #c2392f}
.vs3-half.a .vs3-busts{justify-content:flex-start}.vs3-half.b .vs3-busts{justify-content:flex-end}
.vs3-busts{display:flex;align-items:flex-end;gap:4px;flex:1 1 0;min-height:0;width:100%;padding-top:8px;box-sizing:border-box}
.vs3-bust{height:100%;max-height:min(40vh,290px);width:auto;max-width:calc(50% - 2px);aspect-ratio:192/232;object-fit:cover;object-position:50% 20%;border-radius:46% 46% 8px 8px/30% 30% 8px 8px;box-shadow:inset 0 0 0 3px var(--tc),0 6px 18px rgba(0,0,0,.6);background:#2a2540;min-width:0}
.vs3-busts>.vs3-bust:only-child{max-width:80%}
.vs3-half.b .vs3-bust{box-shadow:inset 0 0 0 3px #c2392f,0 6px 18px rgba(0,0,0,.6)}
.vs3-nm,.vs3-sub{max-width:calc(100% - 38px)}
.vs3-nm{font:900 clamp(17px,5.4vw,34px)/1.05 var(--lx-serif,Georgia,serif);letter-spacing:.07em;text-transform:uppercase;color:var(--tc);text-shadow:0 2px 0 #000,0 0 18px rgba(0,0,0,.8);overflow-wrap:anywhere}
.vs3-half.b .vs3-nm{color:#ff9d8f}
.vs3-sub{font:700 clamp(10px,2.8vw,13px)/1.2 var(--lx-sans,system-ui);letter-spacing:.14em;text-transform:uppercase;opacity:.9;text-shadow:0 1px 3px #000}
.vs3-seal{position:absolute;left:50%;top:50%;width:clamp(64px,18vw,104px);height:clamp(64px,18vw,104px);margin:calc(clamp(64px,18vw,104px) / -2) 0 0 calc(clamp(64px,18vw,104px) / -2);border-radius:50%;display:grid;place-items:center;z-index:3;background:radial-gradient(circle at 35% 30%,#ffe08a,#c98e24 60%,#6a4210);box-shadow:0 0 0 4px #3b1a08,0 0 36px rgba(242,193,78,.85),inset 0 0 0 3px rgba(255,255,255,.35);animation:vs3-seal .7s .35s cubic-bezier(.3,1.9,.5,1) both}
.vs3-seal b{font:900 clamp(30px,9vw,46px)/1 var(--lx-serif,Georgia,serif);color:#3b1a08;text-shadow:0 1px 0 rgba(255,255,255,.5)}
@keyframes vs3-seal{from{transform:scale(3.2) rotate(-25deg);opacity:0}to{transform:none;opacity:1}}
.vs3-flash{position:absolute;inset:0;background:#fff;opacity:0;animation:vs3-fl .5s .38s ease-out both;z-index:4}
@keyframes vs3-fl{0%{opacity:.85}100%{opacity:0}}
.vs3-foot{position:absolute;left:0;right:0;bottom:calc(var(--lx-sab,0px) + 3.2vh);text-align:center;z-index:3;padding:0 14px;animation:vs3-up .6s .5s ease-out both}
.vs3-th{font:900 clamp(14px,4.4vw,22px)/1.1 var(--lx-serif,Georgia,serif);letter-spacing:.2em;text-transform:uppercase;color:var(--tc);text-shadow:0 2px 0 #000,0 0 14px rgba(0,0,0,.8)}
.vs3-ev{margin-top:3px;font:700 clamp(10px,3vw,13px)/1.25 var(--lx-sans,system-ui);letter-spacing:.12em;text-transform:uppercase;opacity:.9;text-shadow:0 1px 3px #000}
@keyframes vs3-up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.vs3-amb{position:absolute;inset:0;z-index:1;overflow:hidden}
.vs3-amb i{position:absolute;bottom:-10px;width:6px;height:6px;border-radius:50%;background:var(--tc);opacity:0;animation:vs3-rise var(--d) var(--w) linear infinite}
.vs3.t-gaul .vs3-amb i{top:-10px;bottom:auto;background:#fff;animation-name:vs3-fall}
.vs3.t-desert .vs3-amb i{width:28px;height:2px;border-radius:2px;background:#fff0c8;animation-name:vs3-drift}
@keyframes vs3-rise{0%{transform:translate(0,0);opacity:0}15%{opacity:.9}100%{transform:translate(var(--x),-80vh);opacity:0}}
@keyframes vs3-fall{0%{transform:translate(0,0);opacity:0}15%{opacity:.9}100%{transform:translate(var(--x),95vh);opacity:0}}
@keyframes vs3-drift{0%{transform:translate(-30px,0);opacity:0}20%{opacity:.8}100%{transform:translate(110vw,var(--x));opacity:0}}
@media (max-height:520px){.vs3-half.a{top:12vh;bottom:30vh}.vs3-half.b{top:30vh;bottom:12vh}.vs3-bust{max-height:36vh}}
@media (min-aspect-ratio:11/10){.vs3-half.a{width:46%;top:14vh;bottom:14vh;left:0}.vs3-half.b{width:46%;top:14vh;bottom:14vh;right:0}.vs3-bust{max-height:min(48vh,340px)}}
@media (prefers-reduced-motion:reduce){.vs3,.vs3-half,.vs3-seal,.vs3-flash,.vs3-foot,.vs3-amb i{animation:none}.vs3-flash{display:none}}
`;
function css() { if (document.getElementById('bk-css')) return; const s = document.createElement('style'); s.id = 'bk-css'; s.textContent = CSS; document.head.append(s); }
const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };

// ------------------------------------------------------------------ the model
/** the crowd only knows level and style: chance that slot a beats slot b (never stats, never gear) */
export function crowdOdds(a, b) {
  const lm = L(), adv = lm && lm.adv && a.style && b.style ? lm.adv(a.style, b.style) : 0;
  return 1 / (1 + Math.exp(-(0.2 * ((a.lvl || 1) - (b.lvl || 1)) + 0.35 * adv)));
}
export function roundNames(size) { const n = Math.round(Math.log2(size)), base = ['Final', 'Semifinal', 'Quarterfinal']; return Array.from({ length: n }, (_, r) => { const k = n - 1 - r; return base[k] || 'Round of ' + (size >> r); }); }
/** rounds -> matches {a, b, w}: slot indexes into T.slots, a/b null until known, w the winner when the round has been played */
export function bracketModel(T) {
  const n = Math.round(Math.log2(T.size)), names = roundNames(T.size), rounds = [];
  for (let r = 0; r < n; r++) {
    const players = r === 0 ? Array.from({ length: T.size }, (_, i) => i) : (T.hist[r - 1] || null), res = T.hist[r] || null, m = [];
    for (let i = 0; i < (T.size >> (r + 1)); i++) m.push({ a: players ? players[i * 2] : null, b: players ? players[i * 2 + 1] : null, w: res ? res[i] : null });
    rounds.push({ name: names[r], matches: m });
  }
  const champ = T.hist.length >= n ? T.hist[n - 1][0] : null;
  return { rounds, champ, n };
}

const STAR = '<svg class="bk-star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3 6.5 7 .8-5.2 4.8 1.5 7-6.3-3.6-6.3 3.6 1.5-7L2 9.300l7-.8z" fill="#f2c14e" stroke="#7a5222" stroke-width="1.4" stroke-linejoin="round"/></svg>';
const CROWN = '<svg class="bk-crown" viewBox="0 0 64 64" aria-hidden="true"><path d="M8 46l-3-24 14 12 13-20 13 20 14-12-3 24z" fill="currentColor" stroke="#6a4210" stroke-width="2.4" stroke-linejoin="round"/><rect x="9" y="48" width="46" height="7" rx="2" fill="#e4b03a" stroke="#6a4210" stroke-width="2.4"/><circle cx="32" cy="14" r="3" fill="#c2392f"/><circle cx="9" cy="23" r="2.5" fill="#3f9a6a"/><circle cx="55" cy="23" r="2.5" fill="#4a8fd0"/></svg>';

// ------------------------------------------------------------------ the bracket tablet
export function showBracket(ctx, T, o = {}) {
  css(); const D0 = D(), mode = o.mode || 'before', M = bracketModel(T), n = M.n, rm = reduced();
  const lastPlayed = T.hist.length - 1;                       // 'after': the round whose results are revealed
  const played = mode === 'after' ? lastPlayed : -1;
  const curR = mode === 'before' ? T.round : -1, alive = new Set(T.alive || []);
  // crowd favourites among those still standing (mode before / preview): the two highest levels, the star goes to the best
  const standing = mode === 'preview' ? T.slots.map((_, i) => i) : (T.alive || []);
  const fav = standing.slice().sort((x, y) => (T.slots[y].lvl || 0) - (T.slots[x].lvl || 0) || x - y);
  const favSet = new Set(fav.slice(0, 2)), favBest = fav[0];
  return new Promise((resolve) => {
    let done = false, timers = [];
    const root = el('div', 'lx-scrim bk-root lx-in'); root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Tournament bracket');
    const tab = el('div', 'bk-tab'), head = el('div', 'bk-head'), kick = el('div', 'bk-kick', (o.ev && o.ev.title) || 'Tournament'), title = el('h2', 'bk-title');
    const D1 = D0.LEAGUES && o.ev && D0.LEAGUES[o.ev.league] ? D0.LEAGUES[o.ev.league].n : '';
    title.textContent = mode === 'after' ? (o.champion ? 'Champion' : o.won ? (M.rounds[lastPlayed] ? M.rounds[lastPlayed].name + ' won' : 'Advance') : 'Eliminated') : mode === 'preview' ? 'The bracket' : (o.name || (M.rounds[T.round] || {}).name || 'Next bout');
    const sub = el('div', 'bk-sub'); sub.textContent = [D1, `${T.size} fighters`, mode === 'before' ? 'The crowd knows only level and style' : mode === 'preview' ? 'Seeding as announced' : ''].filter(Boolean).join(' · ');
    head.append(kick, title, sub); tab.append(head);
    const sc = el('div', 'bk-scroll'), grid = el('div', 'bk-grid'); sc.append(grid); tab.append(sc);
    const lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); lines.setAttribute('class', 'bk-lines'); grid.append(lines);
    const cols = [], pl = new Map(); // key r:m:s -> plaque element
    const portrait = (g) => { const w = el('span', 'bk-ph'); try { const p = ctx && ctx.portrait ? ctx.portrait(g, 34) : null; if (p) w.append(p); else w.textContent = (g.name || '?')[0]; } catch (e) { w.textContent = (g.name || '?')[0]; } return w; };
    const plaque = (idx, r, m, s, hidden, showOdds, oddsP) => {
      const p = el('div', 'bk-p'); p.dataset.slot = idx == null ? '' : idx; pl.set(r + ':' + m + ':' + s, p);
      if (idx == null || idx < 0) { p.classList.add('unk'); p.append(el('span', 'bk-ph', '?'), Object.assign(el('div', 'bk-i'), { innerHTML: '<span class="bk-n">To be decided</span>' })); return p; }
      const g = T.slots[idx], you = idx === 0; if (you) p.classList.add('you'); if (hidden) p.classList.add('hide');
      const st = D0.STYLES && D0.STYLES[g.style] ? D0.STYLES[g.style].n : '', info = el('div', 'bk-i'), nm = el('span', 'bk-n', you ? 'YOU: ' + g.name : g.name), lv = el('span', 'bk-l', `Lv ${g.lvl || 1} · ${st}`);
      info.append(nm, lv); p.append(portrait(g), info);
      if (showOdds && oddsP != null) { const od = el('span', 'bk-o' + (oddsP >= 0.5 ? ' fav' : ''), Math.round(oddsP * 100) + '%'); od.title = "The crowd's odds (level and style only)"; p.append(od); }
      if (favBest === idx && (mode === 'before' || mode === 'preview')) { const s = el('span'); s.innerHTML = STAR; s.firstChild.setAttribute('role', 'img'); s.firstChild.setAttribute('aria-label', 'Crowd favourite'); p.append(s.firstChild); }
      p.setAttribute('aria-label', `${g.name}, level ${g.lvl || 1}${you ? ', you' : ''}${favSet.has(idx) && mode !== 'after' ? ', crowd favourite' : ''}`);
      return p;
    };
    const revealNext = played >= 0;                            // the column after the played round starts hidden and is revealed with the lines
    M.rounds.forEach((R, r) => {
      const col = el('div', 'bk-col'); col.append(el('div', 'bk-colh', R.name)); const wrap = el('div'); wrap.style.cssText = 'display:flex;flex-direction:column;justify-content:space-around;gap:12px;flex:1'; col.append(wrap);
      R.matches.forEach((mt, m) => {
        const box = el('div', 'bk-m'); box.dataset.r = r; box.dataset.m = m;
        const isCur = r === curR && (mt.a === 0 || mt.b === 0); if (isCur) { box.classList.add('cur'); box.append(el('span', 'bk-tag', 'Your bout')); }
        const known = mt.a != null && mt.b != null, oa = known ? crowdOdds(T.slots[mt.a], T.slots[mt.b]) : null;
        const hid = revealNext && r === played + 1;
        const pa = plaque(mt.a, r, m, 0, hid, isCur || (mode === 'preview' && r === 0), oa), pb = plaque(mt.b, r, m, 1, hid, isCur || (mode === 'preview' && r === 0), oa == null ? null : 1 - oa);
        // results: known winners are marked now, except for the round being revealed (marked step by step)
        if (mt.w != null && !(mode === 'after' && r === played)) { [pa, pb].forEach((p) => { const sl = +p.dataset.slot; if (p.dataset.slot !== '') p.classList.add(sl === mt.w ? 'win' : 'lose'); }); }
        box.append(pa, pb); wrap.append(box);
      });
      cols.push(col); grid.append(col);
    });
    const champ = el('div', 'bk-champ' + (M.champ == null ? ' pend' : (revealNext && played === n - 1 ? ' pend' : ' won'))); champ.innerHTML = CROWN; champ.append(el('div', 'bk-colh', M.champ != null ? 'Champion' : 'Champion'));
    const cn = el('div', 'bk-n'); cn.style.cssText = 'text-align:center;font:900 13px/1.2 var(--lx-serif,Georgia,serif);letter-spacing:.06em;color:#4a2f12'; cn.textContent = M.champ != null && !(revealNext && played === n - 1) ? T.slots[M.champ].name : '?'; champ.append(cn); grid.append(champ);
    root.append(tab);
    // lines: elbow from each match to its slot in the next round
    const drawLines = () => {
      lines.innerHTML = ''; const gr = grid.getBoundingClientRect(); lines.setAttribute('width', grid.scrollWidth); lines.setAttribute('height', grid.scrollHeight); const box = (r, m) => tab.querySelector(`.bk-m[data-r="${r}"][data-m="${m}"]`);
      const path = (a, b, cls, key) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(), x1 = ra.right - gr.left, y1 = ra.top + ra.height / 2 - gr.top, x2 = rb.left - gr.left, y2 = rb.top + rb.height / 2 - gr.top, xm = (x1 + x2) / 2; const d = `M${x1},${y1} H${xm} V${y2} H${x2}`, p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); p.setAttribute('class', cls); p.dataset.k = key; p.style.setProperty('--len', String(Math.abs(xm - x1) + Math.abs(y2 - y1) + Math.abs(x2 - xm) + 2)); lines.append(p); return p; };
      M.rounds.forEach((R, r) => R.matches.forEach((mt, m) => {
        const a = box(r, m), b = r + 1 < n ? box(r + 1, m >> 1) : champ; if (!a || !b) return; const youPath = mt.w === 0, isRev = mode === 'after' && r === played, known = mt.w != null;
        path(a, b, (youPath && !isRev ? 'you' : '') + (isRev ? ' pend' : known ? '' : ' dim'), r + ':' + m);
      }));
    };
    const layout = () => { try { drawLines(); } catch (e) { /* layout is cosmetic */ } };
    const close = () => { if (done) return; done = true; timers.forEach(clearTimeout); window.removeEventListener('resize', layout); document.removeEventListener('keydown', onKey, true); root.classList.remove('lx-in'); setTimeout(() => root.remove(), rm ? 0 : 160); resolve(); };
    const onKey = (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    const label = mode === 'preview' ? 'Close' : mode === 'before' ? 'To the arena!' : o.champion ? 'Glory!' : 'Continue';
    const act = el('div', 'lx-actions'), go = U.button({ label, variant: 'gold', icon: mode === 'before' ? 'sword' : 'check', onClick: close }); act.append(go);
    if (o.note) { const nt = el('div', 'bk-note'); nt.textContent = o.note; tab.append(nt); }
    tab.append(act); document.body.append(root); window.addEventListener('resize', layout); document.addEventListener('keydown', onKey, true);
    requestAnimationFrame(() => { layout(); const cur = tab.querySelector('.bk-m.cur') || tab.querySelector(`.bk-col:nth-child(${Math.max(1, (played >= 0 ? played + 1 : 0) + 1)})`); if (cur && cur.scrollIntoView) { try { cur.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' }); } catch (e) { /* old browser */ } } try { go.focus({ preventScroll: true }); } catch (e) { /* focus is optional */ } });
    // 'after': reveal the played round bout by bout, then the next column and the champion
    if (mode === 'after') {
      const R = M.rounds[played]; if (!R) return; const delay0 = rm ? 0 : 650, step = rm ? 0 : 340;
      const at = (ms, fn) => { if (!ms) fn(); else timers.push(setTimeout(() => { if (!done) fn(); }, ms)); };
      R.matches.forEach((mt, m) => at(delay0 + m * step, () => {
        const a = pl.get(played + ':' + m + ':0'), b = pl.get(played + ':' + m + ':1'); [a, b].forEach((p) => { if (!p || p.dataset.slot === '') return; p.classList.add(+p.dataset.slot === mt.w ? 'win' : 'lose'); });
        const ln = lines.querySelector(`path[data-k="${played}:${m}"]`); if (ln) { if (mt.w === 0) ln.classList.add('you'); void ln.getBoundingClientRect(); ln.classList.add('on'); }
        if (played + 1 < n) { const nx = pl.get((played + 1) + ':' + (m >> 1) + ':' + (m & 1)); if (nx) nx.classList.remove('hide'); }
        try { ctx && ctx.sfx && ctx.sfx(mt.w === 0 ? 'uiConfirm' : 'uiTap', { gain: mt.w === 0 ? 0.7 : 0.35 }); } catch (e) { /* sound is optional */ }
      }));
      at(delay0 + R.matches.length * step + 120, () => {
        if (played === n - 1 && M.champ != null) { champ.classList.remove('pend'); champ.classList.add('won'); cn.textContent = T.slots[M.champ].name; if (M.champ === 0) { burst(tab, rm); try { ctx.sfx('levelUp'); ctx.sfx('crowdRoar'); } catch (e) { /* sound is optional */ } } }
        else if (o.won) { try { ctx.sfx('crowdCheer', { gain: 0.8 }); } catch (e) { /* sound is optional */ } } else { try { ctx.sfx('crowdBoo', { gain: 0.7 }); } catch (e) { /* sound is optional */ } }
      });
    } else if (mode === 'before') { try { ctx && ctx.sfx && ctx.sfx('horn', { gain: 0.5 }); } catch (e) { /* sound is optional */ } }
  });
}
function burst(host, rm) { if (rm) return; const b = el('div', 'bk-burst'); for (let i = 0; i < 26; i++) { const s = el('i'); const a = Math.random() * 6.283, d = 80 + Math.random() * 200; s.style.setProperty('--dx', Math.cos(a) * d + 'px'); s.style.setProperty('--dy', Math.sin(a) * d - 40 + 'px'); s.style.animationDelay = Math.random() * 0.25 + 's'; b.append(s); } host.append(b); setTimeout(() => b.remove(), 1900); }

// ------------------------------------------------------------------ the fight intro
const THEME_INTRO = {
  sandpit: { c: '#e0b070', tag: 'Dust and splinters', amb: 'rise', col: '#d9b27c' }, capua: { c: '#f2c14e', tag: 'The old amphitheatre', amb: 'rise', col: '#f2c14e' },
  colosseum: { c: '#ffe08a', tag: 'Under the imperial gaze', amb: 'rise', col: '#ffe9a8' }, desert: { c: '#ffd27a', tag: 'No shade, no mercy', amb: 'drift', col: '#fff0c8' },
  gaul: { c: '#bfe0ff', tag: 'Frost on the sand', amb: 'fall', col: '#ffffff' }, etna: { c: '#ff9a52', tag: 'The mountain is awake', amb: 'rise', col: '#ff8a3a' },
};
function bustOf(g, w, h) {
  try {
    const game = globalThis.__LM3D && globalThis.__LM3D.game; if (!game || !g) return null; if (!game._portraits && game.portraitEl) game.portraitEl(g, 40);
    // BEAST: a cached portrait is kept as it is (removing the width attribute and setting it again wiped the canvas, which left the slot empty); until the render lands the slot shows a medallion
    const P = game._portraits; if (!P || !P.portrait) return null; const c = P.portrait(g, { w, h, style: 'bust' }); c.className = 'vs3-bust'; if (!c.dataset.ready) bustPlaceholder(c, g, w, h); return c;
  } catch (e) { return null; }
}
/** BEAST: a placeholder painted on the portrait canvas (the real render draws over it): a lit medallion with the beast's emblem, or a head and shoulders silhouette for a gladiator */
function bustPlaceholder(c, g, w, h) {
  const x = c.getContext('2d'); if (!x) return; const B = g.beast && D().BEASTS ? D().BEASTS[g.beast] : null, col = (B && B.c) || (D().STYLES[g.style] && D().STYLES[g.style].c) || '#b5532f';
  const lg = x.createLinearGradient(0, 0, 0, h); lg.addColorStop(0, '#2a2540'); lg.addColorStop(0.6, '#3a2a48'); lg.addColorStop(1, '#1d1830'); x.fillStyle = lg; x.fillRect(0, 0, w, h);
  const rg = x.createRadialGradient(w * 0.55, h * 0.4, 2, w * 0.55, h * 0.4, w * 0.8); rg.addColorStop(0, col + 'aa'); rg.addColorStop(1, 'rgba(42,37,64,0)'); x.fillStyle = rg; x.fillRect(0, 0, w, h);
  if (B) { import('./glyphs.js').then((m) => { if (c.dataset.ready) return; const svg = m.emblem(g.beast, { size: 128, color: col, boss: !!B.boss }).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '), im = new Image(); im.onload = () => { if (c.dataset.ready) return; const s = Math.min(w, h) * 0.8; x.drawImage(im, (w - s) / 2, (h - s) / 2 - h * 0.02, s, s); }; im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }).catch(() => {}); return; }
  x.fillStyle = 'rgba(20,16,32,.75)'; x.beginPath(); x.arc(w * 0.5, h * 0.42, w * 0.17, 0, 6.2832); x.fill(); x.beginPath(); x.ellipse(w * 0.5, h * 0.98, w * 0.34, h * 0.36, 0, Math.PI, 0); x.fill();
}
/** units: sim units (u.g is the gladiator or beast record). meta: F.meta (theme id, title, kind). Resolves when the splash has faded out. */
export function vsIntro({ host = document.body, a = [], b = [], league = '', meta = {}, theme = '', ms = 2600 } = {}) {
  css(); const D0 = D(), L0 = L(), rm = reduced(), th = THEME_INTRO[theme] || THEME_INTRO.capua;
  const root = el('div', 'vs3 t-' + (theme || 'capua')); root.style.setProperty('--tc', th.c); root.setAttribute('aria-hidden', 'true');
  root.append(el('div', 'vs3-bar t'), el('div', 'vs3-bar b'));
  const amb = el('div', 'vs3-amb'); for (let i = 0; i < (rm ? 0 : 16); i++) { const s = el('i'); s.style.left = ((i * 37) % 100) + '%'; s.style.setProperty('--d', 3.2 + (i % 5) * 0.7 + 's'); s.style.setProperty('--w', -(i % 7) * 0.5 + 's'); s.style.setProperty('--x', ((i % 2 ? 1 : -1) * (18 + (i * 11) % 60)) + 'px'); s.style.background = th.col; if (th.amb === 'drift') s.style.top = (10 + (i * 53) % 80) + '%'; amb.append(s); }
  root.append(amb);
  const half = (us, cls) => {
    const h = el('div', 'vs3-half ' + cls), bg = el('div', 'vs3-bg'), busts = el('div', 'vs3-busts'); h.append(bg);
    const bw = us.length > 2 ? 150 : us.length > 1 ? 170 : 192, bh = us.length > 2 ? 182 : us.length > 1 ? 206 : 232;
    us.slice(0, 3).forEach((u) => { const c = bustOf(u.g, bw, bh); if (c) busts.append(c); });
    const nm = el('div', 'vs3-nm', us.map((u) => u.name).join(' & ')), sub = el('div', 'vs3-sub');
    sub.textContent = us.map((u) => (u.beast && D0.BEASTS && D0.BEASTS[u.beast] ? D0.BEASTS[u.beast].n : D0.STYLES[u.style] ? D0.STYLES[u.style].n : '')).filter(Boolean).join(' / ') + ' · Lv ' + Math.round(us.reduce((x, u) => x + (u.g.lvl || 1), 0) / Math.max(1, us.length));
    if (busts.children.length) h.append(busts); h.append(nm, sub);
    const stars = Math.min(5, Math.round(us.reduce((x, u) => x + (L0.stars && !u.beast ? L0.stars(u.g) : 0), 0) / Math.max(1, us.length))); if (stars) { const s = U.stars ? U.stars(stars, 5) : null; if (s) h.append(s); }
    return h;
  };
  root.append(half(a, 'a'), half(b, 'b'), el('div', 'vs3-flash'));
  const seal = el('div', 'vs3-seal'); seal.append(el('b', '', 'VS')); root.append(seal);
  const T0 = THEMES_NAME(theme), foot = el('div', 'vs3-foot'); foot.append(el('div', 'vs3-th', T0), el('div', 'vs3-ev', [meta.title, league, th.tag].filter(Boolean).join(' · '))); root.append(foot);
  host.append(root);
  return new Promise((res) => setTimeout(() => { root.classList.add('out'); setTimeout(() => { root.remove(); res(); }, rm ? 0 : 460); }, rm ? Math.min(ms, 1400) : ms));
}
// theme names live in env_arena.js; imported lazily so bracket.js stays light for screens that only need the tablet
let _names = null; import('./env_arena.js').then((m) => { _names = m.THEMES; }).catch(() => {});
function THEMES_NAME(id) { return (_names && _names[id] && _names[id].name) || ({ sandpit: 'Provincial Sandpit', capua: 'Capua Amphitheatre', colosseum: 'Colosseum, Rome', desert: 'Desert Pit', gaul: 'Snowy Gaul Arena', etna: 'Etna Festival Arena' })[id] || 'The Arena'; }
