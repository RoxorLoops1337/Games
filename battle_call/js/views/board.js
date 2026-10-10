// Battle Call: the Board tab (ranking, results, the crowd's view) and the "Me" sheet.
import { esc, ic } from '../dom.js';
import { S, bbName, size, seedOf } from '../state.js';
import { ui, av, userAv, empty, loops, resultCard, pill } from '../ui.js';
import { rowOf } from './live.js';

export function boardTab() {
  const t = ui.boardTab;
  const seg = (k, l) => `<button class="seg ${t === k ? 'on' : ''}" data-a="boardTab" data-b="${k}">${l}</button>`;
  return `<div class="segs">${seg('rank', 'Ranking')}${seg('results', 'Results')}${seg('crowd', 'The crowd')}</div>` +
    (t === 'rank' ? ranking() : t === 'results' ? results() : crowd());
}

function ranking() {
  const rows = S.board, me = S.me;
  if (!rows.length) return empty('trophy', 'Nobody on the board yet', 'The ranking fills up as people join.');
  const inTop = me && rows.some((r) => r.n === me.name);
  return `<ol class="board">${rows.map(rowOf).join('')}</ol>
    ${me && !inTop ? `<ol class="board pin"><li class="me"><span class="rk">${me.rank}</span>${userAv(me.name, 'sm')}<b>${esc(me.name)} <i>you</i></b><span class="net">${loops(me.net)}</span></li></ol>` : ''}
    <p class="muted center small">Ranked by net worth: your Loops plus what is riding on open bets.</p>`;
}

function results() {
  const done = S.meta.matches.filter((m) => m.status === 'done').sort((a, b) => b.r - a.r || a.i - b.i);
  if (!done.length) return empty('flag', 'No results yet', 'Every finished battle shows up here with the judges and the crowd side by side.');
  return `<div class="stack">${done.map(resultCard).join('')}</div>`;
}

function crowd() {
  const c = S.meta.consensus, N = size();
  if (!c || !c.rows.length) return empty('users', 'The crowd has not spoken', 'Once the picks lock you can see the Top ' + N + ' the whole hall predicted.');
  return `<div class="card tip"><b>The hall's Top ${N}</b><p>${c.voters} players ranked. Sorted by points across everybody's lists.</p></div>
    <ol class="cons wide">${c.rows.map((r, i) => {
      const s = seedOf(r.id);
      return `<li data-k="c${r.id}"><span class="n">${i + 1}</span>${av(r.id, 'sm')}<b>${esc(bbName(r.id))}</b><small>${Math.round((r.n / c.voters) * 100)}% · avg seat ${r.avg}</small>${S.meta.seeds ? `<span class="act ${s ? (s === i + 1 ? 'exact' : 'in') : 'out'}">${s ? 'Seed ' + s : 'Out'}</span>` : ''}</li>`;
    }).join('')}</ol>`;
}

const KIND = { win: 'check', pred: 'predict', vote: 'hand', loss: 'x', refund: 'undo', tip: 'gift', grant: 'gift', fix: 'undo' };
export function meSheet() {
  const me = S.me;
  if (!me) return '';
  const st = me.st;
  const log = [...me.log].reverse();
  return `<div class="sheet tall" role="dialog" aria-label="Profile">
    <div class="grab"></div>
    <button class="ib close" data-a="sheetClose" aria-label="Close">${ic('x', 20)}</button>
    <div class="me-head">${userAv(me.name, 'lg')}<div><h2>${esc(me.name)}</h2><small class="muted">Rank ${me.rank} of ${me.of}</small></div></div>
    <div class="stats4"><div><b data-count="${me.bal}">${me.bal}</b><small>Loops</small></div><div><b>${me.staked.toLocaleString()}</b><small>on the line</small></div>
      <div><b>${st.pred || 0}</b><small>from predictions</small></div><div><b>${st.won || 0}/${(st.won || 0) + (st.lost || 0)}</b><small>bets won</small></div></div>
    <div class="stats4"><div><b>${st.votes || 0}</b><small>votes cast</small></div><div><b>${st.sync || 0}</b><small>matched judges</small></div><div><b>${st.hits || 0}</b><small>right calls</small></div><div><b>${me.net.toLocaleString()}</b><small>net worth</small></div></div>
    <h3 class="sh">Wallet</h3>
    <ul class="wallet-log">${log.length ? log.map((l) => `<li class="${l.d > 0 ? 'up' : l.d < 0 ? 'down' : ''}">${ic(KIND[l.k] || 'loops', 16)}<span>${esc(l.x)}</span><b>${l.d > 0 ? '+' : ''}${l.d || ''}</b></li>`).join('') : '<li class="muted">Nothing yet.</li>'}</ul>
    <div class="cta-row"><button class="btn ghost" data-a="haptics">${ic('speaker', 18)} Vibration ${ui.hapt ? 'on' : 'off'}</button>${S.code === 'DEMO' ? '' : `<button class="btn ghost" data-a="logout">${ic('logout', 18)} Log out</button>`}</div>
    <h3 class="sh">How scoring works</h3>
    <ul class="rules">
      <li><b>Your Top ${size()}</b> ${S.meta.set.pts.topIn} Loops per pick who makes it, +${S.meta.set.pts.topExact} for the exact seat, +${S.meta.set.pts.topNear} when you are one seat off.</li>
      <li><b>Battle calls</b> ${S.meta.set.pts.pick} Loops for a right pick in the first round, doubling every round up to the final.</li>
      <li><b>Bets</b> Winners share the pot, so the multiplier moves as the hall bets. Never less than ${S.meta.set.minPayout.toFixed(1)}x.</li>
      <li><b>Votes</b> ${S.meta.set.pts.vote} Loops for voting, +${S.meta.set.pts.sync} more when you agree with the judges.</li>
      <li><b>Run dry?</b> A busking tip tops you up when a round ends.</li></ul>
  </div>`;
}
