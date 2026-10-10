// Battle Call: the organiser console. Everything the host does in one place, built for a phone held in one hand
// next to a stage: one big obvious next step per phase, and confirmation before anything that cannot be undone.
import { esc, ic } from '../dom.js';
import { S, bbName, size, rounds, curMatch, nextMatch, sides, leftKey, seedOf, mkView, mkTitle, mkLabel, serverBase } from '../state.js';
import { ui, av, userAv, perfStats, loops, pill, rankBuilder, bracket, empty, duel, x, catBar, catArt, countdown } from '../ui.js';
import { matchRound, SIZES } from '../shared.js';
import { photoUrl } from '../net.js';

const TABS = [['run', 'Run', 'bolt'], ['lineup', 'Lineup', 'mic'], ['markets', 'Bets', 'dice'], ['players', 'Players', 'users'], ['setup', 'Setup', 'cog']];

export function hostLogin() {
  return `<main class="front">
    <div class="glow g1"></div>
    <a class="back" href="#/">${ic('left', 18)} Home</a>
    <div class="brand">${ic('cog', 30)}<div><b>Organiser</b><small>Event ${esc(S.code)}</small></div></div>
    <h1>Welcome back</h1>
    <form class="card form" data-form="hostLogin">
      <label>Organiser password<input name="password" type="password" autocomplete="current-password" placeholder="The one you set when you made the event"></label>
      <button class="btn big" type="submit" ${ui.busy ? 'disabled' : ''}>${ui.busy ? 'One moment...' : 'Open the console'}</button>
      ${ui.err ? `<p class="err">${esc(ui.err)}</p>` : ''}
    </form></main>`;
}

export function hostShell() {
  const ev = S.meta;
  const conn = { live: ['Live', 'ok'], poll: ['Polling', 'warn'], down: ['Offline', 'bad'], idle: ['...', ''] }[S.conn];
  const body = { run, lineup, markets, players, setup }[ui.hostTab]();
  return `<div class="shell host">
    <header class="top"><a class="brand-mini" href="#/">${ic('cog', 18)}<b>Organiser</b></a>
      <div class="evname">${esc(ev.name)}<small>${esc(S.code)} · <i class="conn ${conn[1]}">${conn[0]}</i> · ${S.live ? S.live.on : 0} online</small></div>
      <a class="wallet" href="#/s/${S.code}" target="_blank" rel="noopener" title="Big screen">${ic('tv', 18)}<b>Screen</b></a></header>
    <main class="page">${catBar(true)}${liveElsewhere()}${body}</main>
    <nav class="tabs host">${TABS.map(([k, l, i]) => `<button class="${ui.hostTab === k ? 'on' : ''}" data-a="hostTab" data-t="${k}">${ic(i, 22)}<span>${l}</span></button>`).join('')}</nav>
  </div>`;
}

/* ------------------------------------------------------------ run */
/** One step back, always. It says exactly what it will take back. */
function undoBtn() {
  const u = S.meta.undo;
  if (!u) return '';
  return `<button class="btn ghost undo" data-a="hUndo" data-hard="${u.hard ? 1 : 0}" data-label="${esc(u.label)}">${ic('undo', 20)}<span><small>Undo last step</small><b>${esc(u.label)}</b></span></button>`;
}

/** A battle is on in a category the organiser is not looking at: say so, with a way back to it. */
function liveElsewhere() {
  const c = S.meta.cats.find((x) => x.live && x.id !== S.catId);
  return c ? `<button class="card elsewhere" data-a="catPick" data-id="${c.id}">${ic('live', 18)}<span>A battle is live in <b>${esc(c.name)}</b></span>${ic('right', 16)}</button>` : '';
}

function stat(n, l) { return `<div><b>${n}</b><small>${l}</small></div>`; }

function run() {
  const ev = S.meta, N = size(), h = S.host, users = h ? h.total : S.live ? S.live.n : 0;
  const tops = h && h.tops ? h.tops[S.catId] : null;
  const phaseName = { lobby: 'Doors open', picks: 'Picks and bets open', elimination: 'Elimination', bracket: 'Bracket', finished: 'Finished' }[ev.phase];
  const steps = ['lobby', 'picks', 'elimination', 'bracket', 'finished'];
  const ix = steps.indexOf(ev.phase);
  const rail = `<ol class="rail">${['Doors', 'Picks', 'Elimination', 'Bracket', 'Done'].map((l, i) => `<li class="${i < ix ? 'done' : i === ix ? 'now' : ''}"><i></i><span>${l}</span></li>`).join('')}</ol>`;
  let main = '';
  if (ev.phase === 'lobby') {
    const solo = ev.bbs.length === 1, need = solo ? 0 : N - ev.bbs.length;
    main = `<div class="card todo ${need <= 0 ? 'ok' : ''}"><i>${ic(need <= 0 ? 'check' : 'mic', 20)}</i><div><b>${ev.bbs.length} beatboxers in</b><small>${solo ? 'One entrant: a walkover. They are crowned after the elimination.' : need > 0 ? `Add at least ${need} more (or lower the bracket size in Setup)` : 'Enough for a Top ' + N}</small></div><button class="btn sm ghost" data-a="hostTab" data-t="lineup">Lineup</button></div>
      <div class="card todo ${users ? 'ok' : ''}"><i>${ic('qr', 20)}</i><div><b>${users} players joined</b><small>Show the QR code so the audience can join</small></div><button class="btn sm ghost" data-a="hostTab" data-t="setup">QR</button></div>
      <button class="btn big" data-a="hPhase" data-to="picks" ${need > 0 ? 'disabled' : ''}>${ic('predict', 20)} Open predictions and bets</button>
      <button class="btn ghost" data-a="hPhase" data-to="elimination" ${need > 0 ? 'disabled' : ''}>Skip picks, go straight to the elimination</button>`;
  } else if (ev.phase === 'picks') {
    main = `<div class="stats4">${stat(users, 'players')}${stat(tops == null ? '-' : tops, 'Top ' + N + ' in')}${stat(h ? h.volume.toLocaleString() : '-', 'Loops staked')}${stat(ev.mk.filter((m) => m.st === 'open').length, 'open bets')}</div>
      <button class="btn big" data-a="hPhase" data-to="elimination">${ic('lock', 20)} Lock picks, start the elimination</button>
      <p class="muted small center">Picks and "makes the cut" bets lock together. You can reopen them until the ranking is published.</p>
      ${consensusCard()}`;
  } else if (ev.phase === 'elimination' && ev.bbs.length === 1) {
    main = `<div class="card tip"><b>Walkover</b><p>${esc(ev.bbs[0].name)} is the only entrant in ${esc(ev.catName)}, so there are no battles. Crown them when the elimination round is done.</p></div>
      <button class="btn big hot" data-a="hWalkover">${ic('trophy', 20)} Crown ${esc(ev.bbs[0].name)} the champion</button>
      <button class="btn ghost" data-a="hPhase" data-to="picks">Reopen the picks</button>`;
  } else if (ev.phase === 'elimination') {
    main = `${performerPanel()}<div class="card tip"><b>Enter the ranking</b><p>Tap the beatboxers in the order the judges ranked them: first tap is seed 1, the best. Reorder with the arrows. The bracket is drawn the moment you publish.</p></div>
      ${rankBuilder({ which: 'seeds', list: ui.rank.seeds, N })}
      <button class="btn big" data-a="hPublish" ${ui.rank.seeds.length === N ? '' : 'disabled'}>${ic('trophy', 20)} Publish the Top ${N} and draw the bracket</button>
      <button class="btn ghost" data-a="hPhase" data-to="picks">Reopen the picks</button>
      ${consensusCard()}`;
  } else if (ev.phase === 'bracket') {
    main = matchConsole();
  } else {
    main = `<div class="card champ-card">${av(ev.champion, 'xl')}<div><small>Champion</small><b>${esc(bbName(ev.champion))}</b></div></div>
      <a class="btn big" href="${require_export()}" target="_blank" rel="noopener">${ic('download', 20)} Download the results</a>
      <p class="muted small center">The audience screens show the podium. Re-open a result below if the last one was wrong.</p>
      ${matchList()}`;
  }
  const stage = ev.active !== S.catId && S.meta.cats.length > 1
    ? `<button class="btn ghost" data-a="hStage" data-id="${S.catId}">${ic('tv', 18)} Put ${esc(ev.catName)} on stage</button>` : '';
  return `<section class="phasebar"><small>${esc(ev.catName)}</small><b>${phaseName}</b></section>${stage}${rail}${undoBtn()}${main}
    <section class="block"><h3>Message to the hall</h3>
      <form class="inline" data-form="banner"><input name="text" maxlength="140" placeholder="e.g. Break time, voting opens in 5" value="${esc(ev.banner ? ev.banner.text : '')}" autocomplete="off"><button class="btn" type="submit">Send</button>${ev.banner ? '<button type="button" class="btn ghost" data-a="hBannerClear">Clear</button>' : ''}</form></section>`;
}
const require_export = () => `${serverBase()}/api/e/${S.code}/export?ht=${encodeURIComponent(S.ht)}`;

function consensusCard() {
  const c = S.host && S.host.consensus ? S.host.consensus[S.catId] : null;
  if (!c || !c.rows.length) return '';
  return `<section class="block"><h3>What the hall predicts <small>${c.voters} players</small></h3><ol class="cons">${c.rows.slice(0, 16).map((r, i) => `<li data-k="c${r.id}"><span class="n">${i + 1}</span>${av(r.id, 'sm')}<b>${esc(bbName(r.id))}</b><small>${Math.round((r.n / c.voters) * 100)}%</small></li>`).join('')}</ol></section>`;
}

/** Elimination round: who is on stage now, who has been, and what the hall predicted for the one on stage. */
function performerPanel() {
  const ev = S.meta, cur = ev.perf, done = new Set(ev.performed || []);
  const left = ev.bbs.filter((b) => !done.has(b.id) && !(cur && cur.id === b.id));
  return `<section class="block perf"><h3>On stage <small>${done.size} done · ${left.length} to go</small></h3>
    ${cur ? `<div class="card perfcard">${av(cur.id, 'lg')}<div><small>On stage now</small><b>${esc(bbName(cur.id))}</b></div></div>${perfStats(cur)}` : '<p class="muted small">Tap a beatboxer when they step up. The screen and every phone show the hall\'s predictions for them.</p>'}
    <div class="cta-row">${left.length ? `<button class="btn big hot" data-a="hPerfNext">${ic('mic', 20)} Next: ${esc(left[0].name)}</button>` : ''}${cur ? '<button class="btn ghost" data-a="hPerf" data-id="">Done, nobody on stage</button>' : ''}</div>
    <div class="plist">${ev.bbs.map((b) => { const now = cur && cur.id === b.id, dn = done.has(b.id); return `<button class="prow ${now ? 'now' : dn ? 'done' : ''}" data-k="pr${b.id}" data-a="hPerf" data-id="${b.id}">${av(b.id, 'sm')}<b>${esc(b.name)}</b><small>${now ? 'On stage' : dn ? 'Done' : ''}</small></button>`; }).join('')}</div></section>`;
}

const STEPS = ['upcoming', 'live', 'voting', 'closed', 'done'];
const STEP_L = { upcoming: 'Up next', live: 'Battle on', voting: 'Audience vote', closed: 'Judging', done: 'Result' };

function matchConsole() {
  const ev = S.meta;
  const sel = ui.hostMatch ? S.match[ui.hostMatch] : null;
  const m = sel || curMatch() || nextMatch() || ev.matches.find((x2) => x2.status !== 'wait' && x2.status !== 'done') || ev.matches[0];
  const R = matchRound(size(), m);
  const [l, r] = sides(m), lk = leftKey(m), rk = lk === 'a' ? 'b' : 'a';
  const live = S.live && S.live.v && S.live.v.id === m.id ? S.live.v : null;
  const cnt = live ? live : { a: m.c ? m.c.a : 0, b: m.c ? m.c.b : 0 };
  const tl = lk === 'a' ? cnt.a : cnt.b, tr = lk === 'a' ? cnt.b : cnt.a, tt = tl + tr;
  const pl = tt ? Math.round((tl / tt) * 100) : 50;
  const ix = STEPS.indexOf(m.status);
  const stepper = `<ol class="stepper">${STEPS.map((s, i) => `<li class="${i < ix ? 'done' : i === ix ? 'now' : ''}"><i></i><span>${STEP_L[s]}</span></li>`).join('')}</ol>`;
  const next = { upcoming: ['live', 'Start the battle', 'bolt'], live: ['voting', 'Open the audience vote', 'hand'], voting: ['closed', 'Close the vote: hands up!', 'lock'] }[m.status];
  const canResult = ['upcoming', 'live', 'voting', 'closed'].includes(m.status);
  const j = ui.judges;
  const win = (key, col) => `<button class="btn big ${col}" data-a="hResult" data-m="${m.id}" data-w="${key}">${esc(bbName(key === 'a' ? m.a : m.b))} wins</button>`;
  let ctl = '';
  if (m.status === 'wait') ctl = '<p class="muted center">Waiting for the battles before this one to finish.</p>';
  else if (m.status === 'done') {
    ctl = `<div class="card done-card">${ic('check', 20)}<div><b>${esc(bbName(m.w === 'a' ? m.a : m.b))} won</b><small>${m.judges ? `Judges ${m.judges.a}-${m.judges.b}` : 'No judge split recorded'}</small></div></div>
      <button class="btn ghost" data-a="hReopen" data-m="${m.id}">${ic('undo', 18)} Wrong winner? Take the result back</button>`;
  } else {
    ctl = `${stepper}
      ${m.status === 'live' ? voteLen() : ''}
      ${m.status === 'voting' && m.vend ? `<div class="cdrow">${countdown(m, 'lg')}<small>The vote closes by itself</small></div>` : ''}
      ${next ? `<button class="btn big hot" data-a="hStep" data-m="${m.id}" data-to="${next[0]}">${ic(next[2], 22)} ${next[1]}</button>` : ''}
      ${m.status === 'closed' ? `<button class="btn ghost" data-a="hStep" data-m="${m.id}" data-to="voting">Reopen the vote</button>` : ''}
      ${m.status === 'live' ? `<button class="btn ghost" data-a="hStep" data-m="${m.id}" data-to="upcoming">${ic('undo', 18)} Started by mistake? Put it back</button>` : ''}
      ${m.status === 'upcoming' ? `<button class="btn ghost" data-a="hSwap" data-m="${m.id}">${ic('swap', 18)} Swap sides (blue / red)</button>` : ''}
      ${['voting', 'closed'].includes(m.status) ? `<div class="votebar"><div class="vb-h"><b class="blue">${tl}</b><small>${tt} audience votes</small><b class="red">${tr}</b></div><div class="bar big"><i style="width:${pl}%"></i></div></div>` : ''}
      ${canResult ? `<div class="card judges"><b>Judges' decision</b>
        <div class="jrow"><div class="jc blue"><button class="ib" data-a="hJudge" data-s="${lk}" data-d="-1">${ic('minus', 18)}</button><b>${j[lk]}</b><button class="ib" data-a="hJudge" data-s="${lk}" data-d="1">${ic('plus', 18)}</button></div>
        <span>judges</span>
        <div class="jc red"><button class="ib" data-a="hJudge" data-s="${rk}" data-d="-1">${ic('minus', 18)}</button><b>${j[rk]}</b><button class="ib" data-a="hJudge" data-s="${rk}" data-d="1">${ic('plus', 18)}</button></div></div>
        <div class="cta-row">${win(lk, 'blue')}${win(rk, 'red')}</div></div>` : ''}`;
  }
  return `<section class="duel host ${m.status}">
    <div class="duel-top"><span>${R.long}${m.third ? '' : ' · Battle ' + (m.i + 1)}</span><i class="st ${m.status}">${STEP_L[m.status] || 'Waiting'}</i></div>
    ${m.a && m.b ? duel(m, { size: 'sm' }) : ''}
    ${ctl}</section>
    ${matchList(m.id)}
    ${ev.matches.every((q) => q.status === 'upcoming' || q.status === 'wait') ? `<button class="btn ghost" data-a="hRevertSeeds">${ic('undo', 18)} Wrong ranking? Take it back and redo it</button>` : ''}`;
}

const VSECS = [5, 10, 15, 20, 30, 0];
/** How long the next vote runs: chips, defaulting to the event's setting. 0 means the organiser closes it by hand. */
function voteLen() {
  const cur = ui.vsecs == null ? S.meta.set.voteSecs : ui.vsecs;
  return `<div class="votelen"><small>Vote length</small><span class="segs mini">${VSECS.map((n) => `<button class="seg ${cur === n ? 'on' : ''}" data-a="hVSecs" data-n="${n}">${n ? n + 's' : 'Off'}</button>`).join('')}</span></div>`;
}

function matchList(selId) {
  const ev = S.meta;
  return `<section class="block"><h3>All battles</h3>${rounds().map((R) => `<h4 class="sh">${R.long}</h4><div class="mlist">${ev.matches.filter((m) => m.r === R.r).map((m) => {
    const [l, r] = sides(m);
    return `<button class="mrow ${m.id === selId ? 'sel' : ''} ${m.status}" data-a="hSelect" data-m="${m.id}"><span class="mn">${m.third ? '3rd' : m.i + 1}</span>
      <span class="mf blue ${m.w && m.w === leftKey(m) ? 'won' : ''}">${l ? esc(bbName(l)) : 'TBD'}</span><i>vs</i><span class="mf red ${m.w && m.w !== leftKey(m) ? 'won' : ''}">${r ? esc(bbName(r)) : 'TBD'}</span>
      <em class="st ${m.status}">${STEP_L[m.status] || 'Waiting'}</em></button>`;
  }).join('')}</div>`).join('')}</section>`;
}

/* ------------------------------------------------------------ lineup */
function lineup() {
  const ev = S.meta, locked = ev.phase === 'bracket' || ev.phase === 'finished';
  const q = ui.lineupSearch.trim().toLowerCase();
  const list = ev.bbs.filter((b) => !q || b.name.toLowerCase().includes(q));
  const missing = ev.bbs.filter((b) => !b.ph).length;
  return `
    ${locked ? '<div class="card tip"><b>The bracket is drawn</b><p>The lineup is locked. You can still fix a name or add a photo.</p></div>' : `
    <form class="card form" data-form="bulk"><label>Add beatboxers <small class="muted">one name per line, paste a whole list</small>
      <textarea name="names" rows="4" placeholder="Bboy Alpha&#10;MC Rhythm&#10;Vocal Storm"></textarea></label>
      <button class="btn big" type="submit">${ic('plus', 20)} Add to the lineup</button></form>`}
    <div class="row-between"><h3 class="sh">${ev.bbs.length} in the lineup</h3>${missing ? `<button class="btn sm" data-a="photoQueue">${ic('camera', 16)} Quick photos <small>${missing}</small></button>` : ''}</div>
    ${ev.bbs.length > 8 ? `<label class="search">${ic('predict', 18)}<input data-in="lineupSearch" value="${esc(ui.lineupSearch)}" placeholder="Search" autocomplete="off"></label>` : ''}
    <ul class="bblist">${list.map((b) => `<li data-k="bl${b.id}">
      <label class="ph" title="Add a photo">${av(b.id, 'md')}<span class="cam">${ic('camera', 14)}</span><input type="file" accept="image/*" data-file="photo" data-id="${b.id}" hidden></label>
      <button class="nm" data-a="hBbEdit" data-id="${b.id}"><b>${esc(b.name)}</b><small>${b.ph ? 'Photo set' : 'No photo yet'}</small></button>
      ${locked ? '' : `<button class="ib dim" data-a="hBbRm" data-id="${b.id}" aria-label="Remove ${esc(b.name)}">${ic('x', 18)}</button>`}</li>`).join('')}</ul>`;
}

export function photoQueueSheet() {
  const next = S.meta.bbs.find((b) => !b.ph && b.id !== ui.photoSkip);
  const all = S.meta.bbs.find((b) => !b.ph);
  const b = next || all;
  if (!b) return `<div class="sheet"><div class="grab"></div><button class="ib close" data-a="sheetClose">${ic('x', 20)}</button><h2>All done</h2><p class="muted">Every beatboxer has a photo.</p><button class="btn big" data-a="sheetClose">Close</button></div>`;
  return `<div class="sheet"><div class="grab"></div><button class="ib close" data-a="sheetClose" aria-label="Close">${ic('x', 20)}</button>
    <p class="eyebrow">Quick photos · ${S.meta.bbs.filter((q) => !q.ph).length} to go</p>
    <div class="center">${av(b.id, 'xxl')}<h2>${esc(b.name)}</h2></div>
    <label class="btn big">${ic('camera', 22)} Take or choose a photo<input type="file" accept="image/*" capture="user" data-file="photo" data-id="${b.id}" data-queue="1" hidden></label>
    <button class="btn ghost" data-a="photoSkip" data-id="${b.id}">Skip ${esc(b.name)}</button>
    ${ui.busy ? '<p class="muted center">Uploading...</p>' : ''}</div>`;
}

/* ------------------------------------------------------------ markets */
function markets() {
  const ev = S.meta, all = ev.mk.map(mkView).sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
  const f = ui.mkFilter;
  const list = all.filter((m) => f === 'all' || (f === 'open' && m.st === 'open') || (f === 'locked' && m.st === 'locked') || (f === 'done' && (m.st === 'settled' || m.st === 'void')));
  const R = rounds();
  const presets = ev.phase === 'bracket' ? R.filter((r) => r.r >= 1 && !ev.locked[r.r - 1]).map((r) => `<button class="btn sm ghost" data-a="hPreset" data-to="${r.r}">Reach the ${r.short}</button>`).join('') : '';
  const hasChamp = ev.mk.some((m) => m.kind === 'champion' && m.st !== 'void');
  const hasQ = (id) => ev.mk.some((m) => m.kind === 'qualify' && m.bb === id && m.st !== 'void');
  const missingQ = ev.phase === 'picks' && ev.set.qualifyBets && ev.bbs.length > ev.set.size ? ev.bbs.filter((b) => !hasQ(b.id)) : [];
  const qq = ui.search.trim().toLowerCase();
  const qpanel = missingQ.length ? `<section class="card"><b>Open "makes the cut" bets</b><p class="muted small">${missingQ.length} beatboxer${missingQ.length === 1 ? '' : 's'} without one. With a big field, pick the ones the hall will care about.</p>
    <button class="btn sm" data-a="hQualAll">Open all ${missingQ.length}</button>
    ${missingQ.length > 8 ? `<label class="search">${ic('predict', 18)}<input data-in="search" value="${esc(ui.search)}" placeholder="Search beatboxers" autocomplete="off"></label>` : ''}
    <div class="chips">${missingQ.filter((b) => !qq || b.name.toLowerCase().includes(qq)).slice(0, 60).map((b) => `<button class="chip bb" data-k="q${b.id}" data-a="hQual" data-id="${b.id}">${av(b.id, 'xs')}<span>${esc(b.name)}</span>${ic('plus', 14)}</button>`).join('')}</div></section>` : '';
  const tabs = [['all', 'All'], ['open', 'Open'], ['locked', 'In play'], ['done', 'Done']].map(([k, l]) => `<button class="seg ${f === k ? 'on' : ''}" data-a="mkFilter" data-f="${k}">${l}</button>`).join('');
  return `<div class="card tip"><b>Bets</b><p>Match, qualify and champion markets open by themselves. Add extra ones here, or lock and refund any of them.</p></div>
    ${qpanel}
    ${ev.phase === 'bracket' ? `<div class="chips">${presets}${hasChamp ? '' : '<button class="btn sm ghost" data-a="hPreset" data-champ="1">Who wins it all</button>'}</div>` : ''}
    <div class="segs">${tabs}</div>
    ${list.length ? `<div class="stack">${list.map((m) => {
    const t = mkTitle(m);
    return `<article class="card mkh" data-k="${m.id}"><div class="row-between"><div><b>${esc(t.title)}</b><small class="muted"> ${esc(t.sub)}</small></div>${pill(m.st, m.st)}</div>
      <div class="mopts">${m.seed.map((_, i) => `<span class="${m.st === 'settled' && m.win === i ? 'win' : ''}"><b>${esc(mkLabel(m, i))}</b> ${x(m.mult[i])} · ${m.cnt[i]} ${m.cnt[i] === 1 ? 'bet' : 'bets'} · ${m.pool[i].toLocaleString()} Loops</span>`).join('')}</div>
      <div class="cta-row">${m.st === 'open' ? `<button class="btn sm ghost" data-a="hMk" data-k="mk.lock" data-id="${m.id}">${ic('lock', 14)} Lock</button>` : ''}${m.st === 'locked' ? `<button class="btn sm ghost" data-a="hMk" data-k="mk.open" data-id="${m.id}">Reopen</button>` : ''}${m.st === 'open' || m.st === 'locked' ? `<button class="btn sm ghost" data-a="hMk" data-k="mk.void" data-id="${m.id}">Refund all</button>` : ''}</div></article>`;
  }).join('')}</div>` : empty('dice', 'No markets', 'They appear when the picks open.')}`;
}

/* ------------------------------------------------------------ players */
function players() {
  const h = S.host;
  if (!h) return empty('users', 'Loading...', 'One moment.');
  const q = ui.playerSearch.trim().toLowerCase();
  const list = h.users.filter((u) => !q || u.n.toLowerCase().includes(q)).sort((a, b) => b.net - a.net);
  return `<div class="stats4">${stat(h.total, 'players')}${stat(h.tops ? h.tops[S.catId] || 0 : 0, 'ranked a Top ' + size())}${stat(S.live ? S.live.on : 0, 'online now')}${stat(h.volume.toLocaleString(), 'Loops staked')}</div>
    <div class="cta-row"><button class="btn" data-a="hRain">${ic('gift', 18)} Loop rain for everyone</button></div>
    <label class="search">${ic('predict', 18)}<input data-in="playerSearch" value="${esc(ui.playerSearch)}" placeholder="Search players" autocomplete="off"></label>
    <ul class="plist">${list.slice(0, 200).map((u) => `<li class="${u.banned ? 'banned' : ''}" data-k="pl${u.n}">${userAv(u.n, 'sm')}<div><b>${esc(u.n)}</b><small>${u.tops ? 'ranked in ' + u.tops + ' · ' : ''}${u.picks} picks · ${u.votes} votes</small></div>${loops(u.net)}
      <button class="ib dim" data-a="hGrantOne" data-n="${esc(u.n)}" aria-label="Give Loops">${ic('gift', 18)}</button><button class="ib dim" data-a="hBan" data-n="${esc(u.n)}" data-on="${u.banned ? 0 : 1}" aria-label="${u.banned ? 'Unblock' : 'Block'}">${ic(u.banned ? 'check' : 'lock', 18)}</button></li>`).join('')}</ul>
    ${h.total > 200 ? `<p class="muted center small">Showing the top 200 of ${h.total}. Search to find the rest.</p>` : ''}`;
}

/* ------------------------------------------------------------ setup */
export function joinLink() {
  const u = new URL(location.href);
  u.hash = '#/e/' + S.code;
  const base = serverBase();
  if (base !== location.origin) u.searchParams.set('server', base); else u.searchParams.delete('server');
  return u.toString();
}

function setup() {
  const ev = S.meta, s = ev.set, lobby = ev.phase === 'lobby';
  const sw = (key, label, on, hint) => `<label class="sw"><span><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</span><input type="checkbox" data-in="hSet" data-key="${key}" ${on ? 'checked' : ''}><i></i></label>`;
  const num = (key, label, val, hint, dis) => `<label class="numf"><span><b>${label}</b><small>${hint}</small></span><input type="number" inputmode="numeric" data-in="hSetNum" data-key="${key}" value="${val}" ${dis ? 'disabled' : ''}></label>`;
  return `
    <section class="card share"><div class="qrbox" data-static id="qr"></div>
      <div><small class="muted">Event code</small><div class="bigcode">${esc(S.code)}</div>
      <p class="muted small">${esc(joinLink().replace(/^https?:\/\//, ''))}</p>
      <div class="cta-row"><button class="btn sm" data-a="copyLink">${ic('copy', 16)} Copy link</button><a class="btn sm ghost" href="#/s/${S.code}" target="_blank" rel="noopener">${ic('tv', 16)} Big screen</a></div></div></section>
    <section class="block"><h3>Event</h3>
      <label class="numf wide"><span><b>Name</b><small>Shown to everyone</small></span><input data-in="hSetName" value="${esc(ev.name)}" maxlength="40"></label>
      <div class="numf"><span><b>Bracket size</b><small>${esc(ev.catName)}: ${lobby ? 'how many go through' : 'locked after the picks open'}</small></span>
        <span class="segs mini">${SIZES.map((n) => `<button class="seg ${s.size === n ? 'on' : ''}" data-a="hSize" data-n="${n}" ${lobby ? '' : 'disabled'}>${n === 2 ? 'Final' : n}</button>`).join('')}</span></div>
      ${sw('regOpen', 'Sign-ups open', s.regOpen, 'Turn off once everyone is in')}
      ${sw('qualifyBets', 'Bets on who makes the cut', s.qualifyBets, 'Yes/no market per beatboxer while picks are open')}
      ${sw('autoChampion', 'Champion market', s.autoChampion, 'Opens when the bracket is drawn')}
      ${num('start', 'Starting Loops', s.start, 'Fixed once people join', !lobby || (S.host && S.host.total > 0))}
      ${sw('thirdPlace', 'Third-place battle', s.thirdPlace, 'The two semi-final losers fight it out before the final')}
      ${num('voteSecs', 'Vote countdown (seconds)', ev.set.voteSecs, 'The vote closes by itself. 0 = organiser closes it')}
      ${num('maxPerDevice', 'Accounts per phone', s.maxPerDevice, '0 = no limit')}
      ${num('maxPerIp', 'Accounts per network', s.maxPerIp, 'A hall shares one wifi, keep it high. 0 = off')}</section>
    <section class="block"><h3>Categories</h3>
      ${S.event.cats.map((c) => `<div class="numf" data-k="cs${c.id}"><span><b>${esc(c.name)}</b><small>Top ${c.set.size} · ${c.bbs.length} beatboxers · ${c.phase}</small></span>
        <span class="row"><button class="ib dim art" data-a="hCatArt" data-id="${c.id}" aria-label="Change picture">${catArt(c.art, 'tab')}</button><button class="ib dim" data-a="hCatRename" data-id="${c.id}" aria-label="Rename">${ic('cog', 18)}</button>${c.phase === 'lobby' && S.event.cats.length > 1 ? `<button class="ib dim" data-a="hCatRm" data-id="${c.id}" aria-label="Remove">${ic('x', 18)}</button>` : ''}</span></div>`).join('')}
      <button class="btn ghost" data-a="hCatAdd">${ic('plus', 18)} Add a category</button></section>
    <section class="block"><h3>After the show</h3>
      <a class="btn ghost" href="${require_export()}" target="_blank" rel="noopener">${ic('download', 18)} Download results (JSON)</a>
      <button class="btn ghost danger" data-a="hDestroy">Delete this event</button></section>`;
}
