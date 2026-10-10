// Battle Call: the app. Routing, rendering, and every button.
//   #/            home (enter a code)      #/new        create an event
//   #/e/CODE      the audience app         #/h/CODE     the organiser console      #/s/CODE   the big screen
import { morph, esc, ic, $, $$, toast, confetti, runTickers, buzz, setHaptics } from './dom.js';
import { S, emit, subscribe, resetState, sessions, saveSession, dropSession, deviceId, serverBase, setServer, mkView, curMatch, bbName, size, leftKey, sides, myBet, mkTitle, mkLabel, payoutIf } from './state.js';
import { connect, disconnect, act, http, register, login, hostLogin, info, createEvent, uploadPhoto, isDemo, demoCtl } from './net.js';
import { ui, loops } from './ui.js';
import { MIN_BET } from './shared.js';
import { homeView, createView, authView } from './views/auth.js';
import { liveTab } from './views/live.js';
import { predictTab } from './views/predict.js';
import { betsTab, stakeSheet } from './views/bets.js';
import { boardTab, meSheet } from './views/board.js';
import { voteOverlay } from './views/vote.js';
import { hostLogin as hostLoginView, hostShell, photoQueueSheet, joinLink } from './views/host.js';
import { screenView } from './views/screen.js';

const app = document.getElementById('app');
let route = { a: '', code: '' }, entered = '';

/* ------------------------------------------------------------ routing */
function parse() {
  const [a = '', code = '', tab = ''] = location.hash.replace(/^#\/?/, '').split('/');
  return { a, code: code.toUpperCase().replace(/[^A-Z0-9]/g, ''), tab };
}

async function onRoute() {
  const r = parse();
  route = r;
  const kind = r.a === 'e' || r.a === 'h' || r.a === 's' ? r.a : '';
  if (!kind || !r.code) {
    if (entered) { disconnect(); resetState(); entered = ''; }
    ui.err = ''; ui.notFound = false; ui.offline = false;
    emit();
    return;
  }
  const key = kind + r.code;
  if (entered === key) { emit(); return; }
  entered = key;
  disconnect(); resetState();
  Object.assign(ui, { sheet: null, modal: null, voteOpen: null, notFound: false, offline: false, err: '', watching: false, tab: r.tab && ['live', 'predict', 'bets', 'board'].includes(r.tab) ? r.tab : 'live', rank: { top: null, seeds: [] }, topSaved: true });
  S.code = r.code;
  const sess = sessions()[r.code] || {};
  if (r.code === 'DEMO') { S.role = kind === 'e' ? 'user' : kind === 'h' ? 'host' : 'guest'; S.tk = 'demo'; S.ht = 'demo'; S.name = 'You'; }
  else if (kind === 'e' && sess.tk) { S.role = 'user'; S.tk = sess.tk; S.name = sess.name || ''; }
  else if (kind === 'h' && sess.ht) { S.role = 'host'; S.ht = sess.ht; }
  else S.role = 'guest';
  try { const v = localStorage.getItem('bc.seen.' + r.code); ui.seenLog = v === null ? null : +v || 0; } catch (_) { ui.seenLog = null; }
  emit();
  const i = await info(r.code);
  if (entered !== key) return;
  if (!i.ok) { if (i.offline) ui.offline = true; else ui.notFound = true; emit(); return; }
  if (r.code !== 'DEMO') saveSession(r.code, { ev: i.name });
  if (kind === 'h' && S.role === 'guest') { emit(); return; } // needs the organiser password first
  connect(r.code, onPush);
}
addEventListener('hashchange', onRoute);

/* ------------------------------------------------------------ views */
function loadingView(msg = 'Tuning up...') { return `<main class="front center"><div class="spinner"></div><p class="muted">${msg}</p></main>`; }
function problem(title, text, extra = '') {
  return `<main class="front"><div class="glow g1"></div><a class="back" href="#/">${ic('left', 18)} Home</a><h1>${esc(title)}</h1><p class="lead">${text}</p>${extra}</main>`;
}

function view() {
  return viewMain() + (S.code === 'DEMO' && S.meta && ['e', 'h', 's'].includes(route.a) ? demoBar() : '');
}

function demoBar() {
  const here = route.a, auto = demoCtl().isAuto(), done = S.meta.phase === 'finished';
  const seg = (r, l) => `<button class="seg ${here === r ? 'on' : ''}" data-a="demoGo" data-r="${r}">${l}</button>`;
  return `<div class="demobar ${here === 's' ? 'tiny' : ''}" data-k="demobar"><b>Demo</b><div class="segs mini">${seg('e', 'Phone')}${seg('h', 'Organiser')}${seg('s', 'Screen')}</div>
    <button class="btn sm" data-a="demoNext" ${done ? 'disabled' : ''}>Next step</button>
    <button class="btn sm ${auto ? 'hot' : 'ghost'}" data-a="demoPlay" ${done ? 'disabled' : ''}>${auto ? 'Pause' : 'Autoplay'}</button>
    <button class="ib dim" data-a="demoReset" aria-label="Start the demo again">${ic('undo', 16)}</button></div>`;
}

function viewMain() {
  const r = route;
  if (r.a === 'new') return createView();
  if (!['e', 'h', 's'].includes(r.a) || !r.code) return homeView();
  if (ui.notFound) return problem('No event with that code', `We could not find <b>${esc(r.code)}</b>. Check the code on the screen and try again.`);
  if (ui.offline) return problem('Cannot reach the server', `The app could not talk to <b>${esc(serverBase())}</b>. Check your connection${location.hostname.endsWith('pages.dev') ? ', or set the server address of the Battle Call Worker' : ''}.`, `<button class="btn big" data-a="serverEdit">Set server address</button><a class="btn ghost big" href="#/e/DEMO">Try the demo instead</a>`);
  if (S.gone) return problem('This event was deleted', 'The organiser closed it.');
  if (r.a === 'h') {
    if (S.role !== 'host') return hostLoginView();
    if (!S.meta) return loadingView();
    return hostShell() + overlays();
  }
  if (!S.meta) return loadingView();
  if (r.a === 's') return screenView();
  if (S.role === 'guest' && !ui.watching) return authView();
  return audienceShell() + overlays();
}

function audienceShell() {
  const ev = S.meta, me = S.me;
  const conn = { live: '', poll: 'Slow connection', down: 'Reconnecting...', idle: '' }[S.conn];
  const content = { live: liveTab, predict: predictTab, bets: betsTab, board: boardTab }[ui.tab]();
  const cur = curMatch();
  const voteDue = cur && cur.status === 'voting' && me && !me.votes[cur.id];
  const pickDue = ev.phase === 'picks' && me && me.top.length < size();
  const tabs = [['live', 'Live', 'live', voteDue], ['predict', 'Predict', 'predict', pickDue], ['bets', 'Bets', 'dice', false], ['board', 'Board', 'board', false]];
  return `<div class="shell">
    <header class="top"><a class="brand-mini" href="#/">${ic('mic', 18)}<b>Battle Call</b></a>
      <div class="evname">${esc(ev.name)}${conn ? `<small class="warnline">${conn}</small>` : ''}</div>
      ${me ? `<button class="wallet" data-a="openMe" aria-label="Your wallet">${ic('loops', 18)}<b data-count="${me.bal}">${me.bal}</b></button>` : `<button class="btn sm" data-a="authOpen">Join</button>`}</header>
    <main class="page" data-k="page-${ui.tab}">${content}</main>
    <nav class="tabs">${tabs.map(([k, l, i, dot]) => `<button class="${ui.tab === k ? 'on' : ''}" data-a="tab" data-t="${k}">${ic(i, 22)}<span>${l}</span>${dot ? '<i class="dot"></i>' : ''}</button>`).join('')}</nav>
  </div>`;
}

function overlays() {
  let h = '';
  if (ui.voteOpen && route.a === 'e') h += voteOverlay();
  if (ui.sheet) {
    const body = ui.sheet.t === 'stake' ? stakeSheet() : ui.sheet.t === 'me' ? meSheet() : ui.sheet.t === 'photos' ? photoQueueSheet() : '';
    if (body) h += `<div class="scrim" data-a="sheetClose" data-k="scrim"></div>${body}`;
  }
  if (ui.modal) {
    const m = ui.modal;
    h += `<div class="scrim" data-a="modalNo" data-k="mscrim"></div><div class="modal" role="alertdialog"><h2>${esc(m.title)}</h2><p>${m.text}</p>
      ${m.input ? `<input id="modalin" class="mi" value="${esc(m.input.value)}" maxlength="${m.input.max || 60}" autocomplete="off" type="${m.input.type || 'text'}" placeholder="${esc(m.input.ph || '')}">` : ''}
      <div class="cta-row"><button class="btn ghost" data-a="modalNo">Cancel</button><button class="btn ${m.danger ? 'danger' : ''}" data-a="modalYes">${esc(m.ok || 'OK')}</button></div></div>`;
  }
  return h;
}

/* ------------------------------------------------------------ render */
let lastKey = '';
function render() {
  onState();
  if (ui.drag) return; // a row is being dragged: leave the DOM alone until it lands
  const key = route.a + route.code + ui.tab + ui.hostTab;
  morph(app, view());
  runTickers(app);
  drawQr();
  document.body.classList.toggle('noscroll', !!(ui.voteOpen && route.a === 'e') || !!ui.sheet || !!ui.modal);
  document.body.dataset.mode = route.a === 's' ? 'screen' : route.a === 'h' ? 'host' : route.a === 'e' ? 'app' : 'front';
  if (key !== lastKey) { lastKey = key; window.scrollTo(0, 0); }
  if (ui.modal && ui.modal.input && !ui.modal.focused) { ui.modal.focused = true; setTimeout(() => { const i = $('#modalin'); i && i.focus(); i && i.select(); }, 30); }
}
subscribe(render);

function drawQr() {
  const el = document.getElementById('qr');
  if (!el || typeof qrcode === 'undefined') return;
  const url = joinLink();
  if (el._url === url) return;
  el._url = url;
  const q = qrcode(0, 'M'); q.addData(url); q.make();
  el.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true, alt: 'QR code to join' });
}

/* ------------------------------------------------------------ reacting to the server */
const prevStatus = {};
let prevPhase = null, celebratedChamp = false, resultTimer = 0;

function onState() {
  const ev = S.meta;
  if (!ev) return;
  if (S.authFail) {
    S.authFail = false;
    if (S.role === 'user') { dropSession(S.code, ['tk']); S.role = 'guest'; S.tk = ''; ui.authMode = 'login'; ui.err = 'Your session ended. Log in again.'; disconnect(); connect(S.code, onPush); }
    else if (S.role === 'host') { dropSession(S.code, ['ht']); S.role = 'guest'; S.ht = ''; ui.err = 'Please log in again.'; disconnect(); }
  }
  if (S.role === 'user' && S.me && S.me.banned) { /* shown as errors on actions */ }
  const first = prevPhase === null;
  if (prevPhase && prevPhase !== ev.phase) {
    if (route.a !== 's') {
      if (ev.phase === 'picks') toast('Picks are open! Build your Top ' + size(), 'info');
      if (ev.phase === 'elimination') toast('Picks and bets are locked', 'info');
      if (ev.phase === 'bracket') toast('The bracket is drawn!', 'info');
    }
    if (ui.sheet && ui.sheet.t === 'stake') ui.sheet = null;
    buzz(30);
  }
  prevPhase = ev.phase;
  for (const m of ev.matches) {
    const was = prevStatus[m.id];
    prevStatus[m.id] = m.status;
    if (was === undefined || was === m.status) continue;
    if (route.a === 'e' && S.role === 'user') {
      if (m.status === 'voting') {
        ui.voteDismissed[m.id] = false;
        if (!S.me || !S.me.votes[m.id]) { ui.voteOpen = m.id; buzz([40, 60, 40]); }
        else toast('Voting is open. Your screen is ready.', 'info');
      }
      if (m.status === 'closed' && ui.voteOpen === m.id) buzz([60, 40, 60, 40, 120]);
      if (m.status === 'live') toast('The battle is on!', 'info');
    }
    if (m.status === 'done') {
      if (route.a === 's') {
        confetti({ x: 0.5, y: 0.5, n: 160, power: 1.4 });
        ui.screenHold = { id: m.id, until: Date.now() + 18000 };
        setTimeout(emit, 18200); // the hall gets the result for a while before the bracket comes back
      }
      if (route.a === 'e' && ui.voteOpen === m.id) {
        const mine = S.me && S.me.votes[m.id];
        if (mine && mine === m.w) confetti({ n: 120 });
        clearTimeout(resultTimer);
        resultTimer = setTimeout(() => { if (ui.voteOpen === m.id) { ui.voteOpen = null; emit(); } }, 9000);
      }
    }
    if (m.status === 'upcoming' && was === 'wait' && route.a === 'e') toast(`Up next: ${bbName(m.a)} vs ${bbName(m.b)}`, 'info');
  }
  if (ev.phase === 'finished' && !celebratedChamp && !first) { celebratedChamp = true; confetti({ n: 220, power: 1.6, gold: true }); setTimeout(() => confetti({ x: 0.2, n: 100 }), 400); setTimeout(() => confetti({ x: 0.8, n: 100 }), 700); }
  if (ev.phase === 'finished' && first) celebratedChamp = true;
  // close the vote screen if the match it belongs to is gone (the organiser re-drew the ranking)
  if (ui.voteOpen && !S.match[ui.voteOpen]) ui.voteOpen = null;
}

function onPush(kind, prev, next) {
  if (kind !== 'me') return;
  // money lines the viewer has not seen yet (on a phone that has never seen this event, start from now: no replay of old news)
  if (ui.seenLog === null) {
    ui.seenLog = next.log.length ? next.log[next.log.length - 1].i : 0;
    try { localStorage.setItem('bc.seen.' + S.code, String(ui.seenLog)); } catch (_) { /* */ }
  }
  const fresh = next.log.filter((l) => l.i > ui.seenLog);
  if (fresh.length) {
    const top = next.log[next.log.length - 1].i;
    const gains = fresh.filter((l) => l.d > 0 && l.k !== 'fix');
    for (const l of gains.slice(-3)) toast(`<b>+${l.d}</b> ${esc(l.x)}`, 'win');
    if (gains.some((l) => l.k === 'win' || l.k === 'pred')) { confetti({ n: 70, gold: true, y: 0.2 }); buzz([30, 40, 30]); }
    for (const l of fresh.filter((l2) => l2.k === 'loss').slice(-1)) toast(esc(l.x), 'loss');
    ui.seenLog = top;
    try { localStorage.setItem('bc.seen.' + S.code, String(top)); } catch (_) { /* */ }
  }
  if (ui.topSaved && ui.rank.top && next.top.join() !== ui.rank.top.join()) ui.rank.top = [...next.top];
  if (ui.rank.top == null) ui.rank.top = [...next.top];
}

/* ------------------------------------------------------------ actions */
const fail = (r) => { if (!r.ok) { toast(esc(r.err || 'That did not work'), 'loss'); buzz(60); } return r.ok; };
const confirmBox = (m) => { ui.modal = { ...m, focused: false }; emit(); };
const ask = (title, text, ok, run, extra = {}) => confirmBox({ title, text, ok, run, ...extra });
let topTimer = 0;

function saveTop() {
  ui.topSaved = false; emit();
  clearTimeout(topTimer);
  topTimer = setTimeout(async () => {
    const r = await act({ a: 'top', order: ui.rank.top });
    if (r.ok) { ui.topSaved = true; } else { ui.topSaved = true; if (r.err) toast(esc(r.err), 'loss'); if (S.me) ui.rank.top = [...S.me.top]; }
    emit();
  }, 450);
}

const ranks = (w) => (w === 'top' ? ui.rank.top : ui.rank.seeds);
const afterRank = (w) => { if (w === 'top') saveTop(); else emit(); };

const A = {
  home() { location.hash = '#/'; },
  demoGo(el) { location.hash = `#/${el.dataset.r}/DEMO`; },
  demoNext() { if (!demoCtl().next()) toast('Nothing to do next', 'info'); },
  demoPlay() { demoCtl().toggleAuto(); emit(); },
  demoReset() { demoCtl().reset(); ui.rank = { top: null, seeds: [] }; ui.voteOpen = null; ui.hostMatch = null; ui.seenLog = null; for (const k of Object.keys(prevStatus)) delete prevStatus[k]; celebratedChamp = false; toast('Demo restarted', 'info'); emit(); },
  tab(el) { ui.tab = el.dataset.t; if (el.dataset.b) ui.boardTab = el.dataset.b; ui.search = ''; emit(); },
  authOpen() { ui.watching = false; ui.err = ''; emit(); },
  watch() { ui.watching = true; emit(); },
  authMode(el) { ui.authMode = el.dataset.m; ui.err = ''; emit(); },
  togglePw() { ui.showPw = !ui.showPw; emit(); },
  openMe() { ui.sheet = { t: 'me' }; emit(); },
  sheetClose() { ui.sheet = null; emit(); },
  haptics() { ui.hapt = !ui.hapt; setHaptics(ui.hapt); try { localStorage.setItem('bc.hapt', ui.hapt ? '1' : '0'); } catch (_) { /* */ } emit(); },
  logout() {
    dropSession(S.code, ['tk', 'name']); ui.sheet = null; S.role = 'guest'; S.tk = ''; S.me = null; ui.watching = false; ui.authMode = 'login';
    disconnect(); connect(S.code, onPush); emit();
  },
  modalNo() { ui.modal = null; emit(); },
  async modalYes() {
    const m = ui.modal; if (!m) return;
    const v = m.input ? ($('#modalin') || {}).value : undefined;
    ui.modal = null; emit();
    await m.run(v);
  },
  serverEdit() {
    ask('Server address', 'Where the Battle Call Worker runs. Leave empty for the default.', 'Save', (v) => { setServer((v || '').trim()); entered = ''; location.reload(); },
      { input: { value: serverBase(), ph: 'https://battle-call.you.workers.dev', max: 200 } });
  },
  createSize(el) { ui.createSize = +el.dataset.n; emit(); },

  /* ranking builder */
  rankAdd(el) { const l = ranks(el.dataset.w), N = size(); if (l.length >= N) return; if (!l.includes(el.dataset.id)) l.push(el.dataset.id); ui.search = ''; buzz(10); afterRank(el.dataset.w); },
  rankRm(el) { const l = ranks(el.dataset.w); l.splice(+el.dataset.i, 1); afterRank(el.dataset.w); },
  rankClear(el) { const w = el.dataset.w; const run = () => { if (w === 'top') ui.rank.top = []; else ui.rank.seeds = []; afterRank(w); }; if (ranks(w).length > 3) ask('Clear the list?', 'This empties all your picks.', 'Clear', run); else run(); },
  rankMove(el) { const l = ranks(el.dataset.w), i = +el.dataset.i, j = i + +el.dataset.d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; afterRank(el.dataset.w); },

  /* bracket picks, bets, votes */
  predRound(el) { ui.predRound = +el.dataset.r; emit(); },
  async pick(el) {
    const mid = el.dataset.m, id = el.dataset.id, cur = S.me && S.me.picks[mid];
    buzz(12);
    fail(await act({ a: 'pick', mid, bb: cur === id ? null : id }));
  },
  betFilter(el) { ui.betFilter = el.dataset.f; emit(); },
  boardTab(el) { ui.boardTab = el.dataset.b; emit(); },
  bet(el) {
    const m = S.mk[el.dataset.mk], o = +el.dataset.o;
    if (!m) return;
    if (S.role === 'guest') { ui.watching = false; emit(); return; }
    const mine = myBet(m.id);
    ui.stake = mine && mine[0] === o && mine[2] == null ? mine[1] : Math.min(100, Math.max(MIN_BET, Math.floor((S.me ? S.me.bal : 100) / 10) * 10));
    ui.sheet = { t: 'stake', mk: m.id, o }; buzz(10); emit();
  },
  stakeAdj(el) { ui.stake = Math.max(MIN_BET, ui.stake + +el.dataset.d * (ui.stake >= 500 ? 5 : 1)); clampStake(); emit(); },
  stakeSet(el) { ui.stake = +el.dataset.v; clampStake(); emit(); },
  async betPlace(el) {
    clampStake();
    const r = await act({ a: 'bet', mk: el.dataset.mk, o: +el.dataset.o, amt: ui.stake });
    if (fail(r)) { ui.sheet = null; buzz(25); toast(`Bet placed: ${ui.stake} Loops`, 'info'); emit(); }
  },
  async betCancel(el) { const r = await act({ a: 'bet', mk: el.dataset.mk, o: 0, amt: 0 }); if (fail(r)) { ui.sheet = null; toast('Bet taken back', 'info'); emit(); } },

  voteOpen(el) { ui.voteOpen = el.dataset.m; ui.voteDismissed[el.dataset.m] = false; keepAwake(true); emit(); },
  async vote(el) {
    const mid = el.dataset.m, side = el.dataset.side;
    ui.vote[mid] = side; buzz(35); keepAwake(true); goFull(); emit();
    const r = await act({ a: 'vote', mid, side });
    if (!r.ok) { delete ui.vote[mid]; toast(esc(r.err || 'Vote not counted'), 'loss'); emit(); }
  },
  voteChange() { const mid = ui.voteOpen; if (!mid) return; delete ui.vote[mid]; if (S.me) delete S.me.votes[mid]; emit(); },
  voteClose() { if (ui.voteOpen) ui.voteDismissed[ui.voteOpen] = true; ui.voteOpen = null; keepAwake(false); leaveFull(); emit(); },

  /* organiser */
  hostTab(el) { ui.hostTab = el.dataset.t; ui.search = ''; emit(); },
  hPhase(el) {
    const to = el.dataset.to;
    const go = async () => { fail(await act({ a: 'phase', to })); };
    if (to === 'elimination') ask('Start the elimination?', 'Top picks and "makes the cut" bets lock for everyone.', 'Lock and start', go);
    else go();
  },
  hPublish() {
    const N = size();
    ask(`Publish the Top ${N}?`, 'This draws the bracket, pays the Top ' + N + ' predictions and settles the "makes the cut" bets.', 'Publish', async () => {
      const r = await act({ a: 'seeds', order: ui.rank.seeds });
      if (fail(r)) { ui.rank.seeds = []; ui.hostTab = 'run'; toast('Bracket drawn', 'info'); emit(); }
    });
  },
  hRevertSeeds() { ask('Take the ranking back?', 'Prediction points are taken back and bets refunded, then you can enter the ranking again.', 'Take it back', async () => { if (fail(await act({ a: 'seeds.revert' }))) { ui.rank.seeds = []; } }, { danger: true }); },
  async hStep(el) { ui.hostMatch = null; fail(await act({ a: 'step', mid: el.dataset.m, to: el.dataset.to })); },
  async hSwap(el) { fail(await act({ a: 'swap', mid: el.dataset.m })); },
  hSelect(el) { ui.hostMatch = el.dataset.m; ui.judges = { a: 0, b: 0 }; window.scrollTo(0, 0); emit(); },
  hJudge(el) { const s = el.dataset.s; ui.judges[s] = Math.max(0, Math.min(20, ui.judges[s] + +el.dataset.d)); emit(); },
  hResult(el) {
    const mid = el.dataset.m, w = el.dataset.w, m = S.match[mid], id = w === 'a' ? m.a : m.b;
    const j = { ...ui.judges };
    const tied = j.a === j.b && (j.a || j.b);
    ask(`${bbName(id)} wins?`, `This pays every bet and prediction on the battle${j.a || j.b ? ` (judges ${j.a}-${j.b})` : ''}. ${tied ? 'The judges are level, are you sure?' : 'You can still take it back until the next battle starts.'}`, 'Yes, confirm', async () => {
      const r = await act({ a: 'result', mid, w, judges: j.a || j.b ? j : undefined });
      if (fail(r)) { ui.judges = { a: 0, b: 0 }; ui.hostMatch = null; emit(); }
    });
  },
  hReopen(el) { ask('Take the result back?', 'Every payout for this battle is reversed and the winner leaves the next round.', 'Take it back', async () => { if (fail(await act({ a: 'reopen', mid: el.dataset.m }))) ui.hostMatch = el.dataset.m; }, { danger: true }); },
  hBbEdit(el) {
    const id = el.dataset.id, b = S.bb[id];
    ask('Rename beatboxer', 'Change how the name shows for everyone.', 'Save', async (v) => { fail(await act({ a: 'bb.edit', id, name: v })); }, { input: { value: b.name, max: 28 } });
  },
  hBbRm(el) { const id = el.dataset.id; ask(`Remove ${bbName(id)}?`, 'Bets on them are refunded and they leave everyone\'s Top list.', 'Remove', async () => { fail(await act({ a: 'bb.rm', id })); }, { danger: true }); },
  photoQueue() { ui.photoSkip = null; ui.sheet = { t: 'photos' }; emit(); },
  photoSkip(el) { ui.photoSkip = el.dataset.id; emit(); },
  async hMk(el) { fail(await act({ a: el.dataset.k, id: el.dataset.id })); },
  async hPreset(el) { const r = await act(el.dataset.champ ? { a: 'mk.preset', preset: 'champion' } : { a: 'mk.preset', preset: 'reach', to: +el.dataset.to }); if (fail(r)) toast('Market opened', 'info'); },
  hRain() { ask('Loop rain', 'How many Loops should every player get?', 'Make it rain', async (v) => { const n = Math.floor(+v); if (n) fail(await act({ a: 'grant', key: 'all', amount: n, text: 'Loop rain from the organiser' })); }, { input: { value: '100', type: 'number', max: 6 } }); },
  hGrantOne(el) { const n = el.dataset.n; ask(`Give ${n} Loops`, 'Use a negative number to take some away.', 'Give', async (v) => { const a = Math.floor(+v); if (a) fail(await act({ a: 'grant', key: n, amount: a })); }, { input: { value: '100', type: 'number', max: 7 } }); },
  async hBan(el) { fail(await act({ a: 'user.ban', key: el.dataset.n, on: el.dataset.on === '1' })); },
  async hQual(el) { fail(await act({ a: 'mk.qualify', ids: [el.dataset.id] })); },
  async hQualAll() { const r = await act({ a: 'mk.qualify', all: true }); if (fail(r)) toast(`${r.added} bets opened`, 'info'); },
  async hSize(el) { fail(await act({ a: 'settings', set: { size: +el.dataset.n } })); },
  mkFilter(el) { ui.mkFilter = el.dataset.f; emit(); },
  async hBannerClear() { fail(await act({ a: 'banner', text: '' })); },
  hDestroy() { ask('Delete this event?', 'Everything goes: players, picks, bets and photos. Download the results first if you want to keep them.', 'Delete forever', async () => { const r = await http(`/api/e/${S.code}/destroy`, {}, { headers: { 'x-host': S.ht } }); if (r.ok) { dropSession(S.code); location.hash = '#/'; } else toast(esc(r.err || 'Failed'), 'loss'); }, { danger: true }); },
  async copyLink() { try { await navigator.clipboard.writeText(joinLink()); toast('Link copied', 'info'); } catch (_) { prompt('Copy this link', joinLink()); } },
};

function clampStake() {
  const m = S.mk[ui.sheet && ui.sheet.mk];
  if (!m || !S.me) return;
  const mine = myBet(m.id), cap = S.me.bal + (mine && mine[2] == null ? mine[1] : 0);
  ui.stake = Math.max(MIN_BET, Math.min(Math.floor(cap / MIN_BET) * MIN_BET, Math.round(ui.stake / MIN_BET) * MIN_BET));
}

let lock = null;
async function keepAwake(on) {
  try {
    if (on && navigator.wakeLock && !lock) lock = await navigator.wakeLock.request('screen');
    else if (!on && lock) { await lock.release(); lock = null; }
  } catch (_) { lock = null; }
}
const goFull = () => { try { document.documentElement.requestFullscreen && !document.fullscreenElement && document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); } catch (_) { /* */ } };
const leaveFull = () => { try { document.fullscreenElement && document.exitFullscreen().catch(() => {}); } catch (_) { /* */ } };

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const f = A[el.dataset.a];
  if (!f) return;
  if (el.tagName === 'A' && el.getAttribute('href') && el.dataset.a !== 'x') return;
  e.preventDefault();
  Promise.resolve(f(el, e)).catch((err) => { console.error(err); toast('Something went wrong', 'loss'); });
});

/* inputs */
const IN = {
  search: (el) => { ui.search = el.value; emit(); },
  lineupSearch: (el) => { ui.lineupSearch = el.value; emit(); },
  playerSearch: (el) => { ui.playerSearch = el.value; emit(); },
  stake: (el) => { ui.stake = +el.value; emit(); },
  async hSet(el, type) { if (type === 'change') fail(await act({ a: 'settings', set: { [el.dataset.key]: el.checked } })); },
  async hSetNum(el, type) { if (type === 'change') fail(await act({ a: 'settings', set: { [el.dataset.key]: +el.value } })); },
  async hSetName(el, type) { if (type === 'change') fail(await act({ a: 'settings', set: { name: el.value } })); },
};
for (const type of ['input', 'change']) {
  document.addEventListener(type, (e) => {
    const el = e.target.closest('[data-in]');
    if (!el) return;
    const h = IN[el.dataset.in];
    const live = ['search', 'lineupSearch', 'playerSearch', 'stake'];
    if (h && (type === 'change' || live.includes(el.dataset.in))) h(el, type);
  });
}

/* forms */
const FORMS = {
  joinCode(f) {
    const code = f.code.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 5) { ui.err = 'Codes have 5 letters or numbers'; emit(); return; }
    ui.err = ''; location.hash = '#/e/' + code;
  },
  async create(f) {
    if (ui.busy) return;
    const name = f.name.value.trim(), password = f.password.value;
    ui.createName = name;
    if (password.length < 4) { ui.err = 'Pick an organiser password of at least 4 characters'; emit(); return; }
    ui.busy = true; ui.err = ''; emit();
    const r = await createEvent({ name, size: ui.createSize || 16, password, key: f.key ? f.key.value : undefined });
    ui.busy = false;
    if (!r.ok) { ui.err = r.err || 'Could not create the event'; if (r.status === 403) S.createKeyNeeded = true; emit(); return; }
    saveSession(r.code, { ht: r.hostToken, ev: name || 'Beatbox Battle' });
    entered = ''; location.hash = '#/h/' + r.code; onRoute();
  },
  async auth(f) {
    if (ui.busy) return;
    const name = f.name.value.trim(), password = f.password.value;
    ui.nick = name;
    if (name.length < 2) { ui.err = 'Nickname needs at least 2 characters'; emit(); return; }
    if (password.length < 4) { ui.err = 'Password needs at least 4 characters'; emit(); return; }
    ui.busy = true; ui.err = ''; emit();
    const r = ui.authMode === 'join' ? await register(S.code, name, password, deviceId()) : await login(S.code, name, password);
    ui.busy = false;
    if (!r.ok) { ui.err = r.err || 'That did not work'; emit(); return; }
    S.role = 'user'; S.tk = r.token; S.name = r.name;
    saveSession(S.code, { tk: r.token, name: r.name, ev: S.meta ? S.meta.name : '' });
    ui.err = ''; ui.watching = false; ui.seenLog = null;
    toast(ui.authMode === 'join' ? `Welcome, ${esc(r.name)}!` : `Welcome back, ${esc(r.name)}`, 'info');
    disconnect(); connect(S.code, onPush); emit();
  },
  async hostLogin(f) {
    if (ui.busy) return;
    ui.busy = true; ui.err = ''; emit();
    const r = await hostLogin(S.code, f.password.value);
    ui.busy = false;
    if (!r.ok) { ui.err = r.err || 'Wrong password'; emit(); return; }
    S.role = 'host'; S.ht = r.hostToken; saveSession(S.code, { ht: r.hostToken });
    connect(S.code, onPush); emit();
  },
  async bulk(f) {
    const names = f.names.value.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    const r = await act({ a: 'bb.add', names });
    if (fail(r)) { f.reset(); toast(`${r.added || 0} added`, 'info'); }
  },
  async banner(f) { const r = await act({ a: 'banner', text: f.text.value }); if (fail(r)) toast('Sent to every screen', 'info'); },
};
document.addEventListener('submit', (e) => {
  const f = e.target.closest('[data-form]');
  if (!f) return;
  e.preventDefault();
  FORMS[f.dataset.form] && FORMS[f.dataset.form](f);
});

/* photos: pick, shrink to a square, upload */
async function shrink(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const side = Math.min(bmp.width, bmp.height), c = document.createElement('canvas');
  c.width = c.height = 480;
  c.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 480, 480);
  for (const q of [0.84, 0.72, 0.6, 0.48]) {
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', q));
    if (blob && blob.size < 150 * 1024) return blob;
  }
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.4));
}
document.addEventListener('change', async (e) => {
  const el = e.target.closest('[data-file="photo"]');
  if (!el || !el.files[0]) return;
  const file = el.files[0], id = el.dataset.id;
  ui.busy = true; emit();
  try {
    const r = await uploadPhoto(id, await shrink(file));
    if (!r.ok) toast(esc(r.err || 'Upload failed'), 'loss'); else if (!el.dataset.queue) toast('Photo saved', 'info');
  } catch (_) { toast('That picture could not be read', 'loss'); }
  ui.busy = false; el.value = ''; emit();
});

/* drag a ranking row by its grip */
document.addEventListener('pointerdown', (e) => {
  const grip = e.target.closest('[data-grip]');
  if (!grip || e.button > 0) return;
  const row = grip.closest('.slot'), rows = [...row.parentElement.querySelectorAll('.slot:not(.empty)')];
  const from = rows.indexOf(row);
  if (from < 0) return;
  e.preventDefault();
  const rects = rows.map((r) => r.getBoundingClientRect()), h = rects[from].height + 8, y0 = e.clientY;
  ui.drag = { w: grip.dataset.w, from, to: from };
  row.classList.add('dragging');
  try { grip.setPointerCapture(e.pointerId); } catch (_) { /* */ }
  buzz(8);
  const move = (ev) => {
    const dy = ev.clientY - y0;
    row.style.transform = `translateY(${dy}px)`;
    const mid = rects[from].top + rects[from].height / 2 + dy;
    let to = 0;
    rects.forEach((r, i) => { if (i !== from && r.top + r.height / 2 < mid) to = i + (i < from ? 1 : 0); });
    if (mid < rects[0].top + rects[0].height / 2) to = 0;
    ui.drag.to = Math.max(0, Math.min(rows.length - 1, to));
    rows.forEach((r, i) => {
      if (i === from) return;
      const shift = from < ui.drag.to && i > from && i <= ui.drag.to ? -h : from > ui.drag.to && i < from && i >= ui.drag.to ? h : 0;
      r.style.transform = shift ? `translateY(${shift}px)` : '';
      r.style.transition = 'transform .15s';
    });
  };
  const end = () => {
    grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', end); grip.removeEventListener('pointercancel', end);
    const { w, from: f, to: t2 } = ui.drag;
    ui.drag = null;
    rows.forEach((r) => { r.style.transform = ''; r.style.transition = ''; r.classList.remove('dragging'); });
    if (t2 !== f) { const l = ranks(w); const [it] = l.splice(f, 1); l.splice(t2, 0, it); buzz(14); afterRank(w); } else emit();
  };
  grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', end); grip.addEventListener('pointercancel', end);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (ui.modal) A.modalNo(); else if (ui.sheet) A.sheetClose(); else if (ui.voteOpen) A.voteClose(); }
  if (e.key === 'Enter' && ui.modal && e.target.id === 'modalin') A.modalYes();
});

// A shared link can carry the server address: ?server=https://battle-call.you.workers.dev
try { const s = new URLSearchParams(location.search).get('server'); if (s && /^https?:\/\//.test(s)) setServer(s); } catch (_) { /* */ }

try { ui.hapt = localStorage.getItem('bc.hapt') !== '0'; setHaptics(ui.hapt); } catch (_) { /* */ }
onRoute();
render();
