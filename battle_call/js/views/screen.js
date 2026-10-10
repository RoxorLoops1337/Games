// Battle Call: the big screen for the hall. Open /battle_call/#/s/CODE on the projector laptop: read-only, no login,
// it follows the organiser by itself.
import { esc, ic } from '../dom.js';
import { S, bbName, size, rounds, curMatch, nextMatch, sides, leftKey, seedOf } from '../state.js';
import { ui, av, bracket } from '../ui.js';
import { roundInfo } from '../shared.js';
import { joinLink } from './host.js';

const eq = '<span class="eq lg"><i></i><i></i><i></i><i></i><i></i></span>';

export function screenView() {
  const ev = S.meta, N = size();
  const hold = ui.screenHold && Date.now() < ui.screenHold.until ? S.match[ui.screenHold.id] : null;
  const cur = curMatch() || (hold && hold.status === 'done' ? hold : null), nx = nextMatch();
  let body = '';
  if (ev.phase === 'lobby' || ev.phase === 'picks') body = joinStage();
  else if (ev.phase === 'elimination') body = `<div class="st-center">${eq}<p class="eyebrow">Picks are locked</p><h1 class="mega">Elimination</h1><p class="lead">The judges are choosing the Top ${N}</p></div>${consensus()}${qrCorner()}`;
  else if (ev.phase === 'finished' && !cur) body = champion();
  else if (cur) body = duelStage(cur);
  else body = `<div class="st-top"><p class="eyebrow">${nx ? 'Up next' : 'The bracket'}</p></div>${nx ? upNext(nx) : ''}<div class="st-bracket">${bracket({ mode: 'view' })}</div>${qrCorner()}`;
  return `<div class="stage ${ev.phase}"><div class="glow g1"></div><div class="glow g2"></div>
    <header class="st-head"><div class="brand">${ic('mic', 28)}<div><b>${esc(ev.name)}</b><small>Battle Call</small></div></div>
    <div class="st-meta"><span>${S.live ? S.live.n : 0} players</span><span class="code">${esc(S.code)}</span></div></header>
    ${ev.banner ? `<div class="st-banner" data-k="b${ev.banner.id}">${ic('mega', 28)}<span>${esc(ev.banner.text)}</span></div>` : ''}
    <div class="st-body">${body}</div></div>`;
}

const qrCorner = () => `<div class="qrcorner"><div class="qrbox sm" data-static id="qr"></div><div><small>Join</small><b>${esc(S.code)}</b></div></div>`;

function joinStage() {
  const ev = S.meta, N = size();
  const tops = S.host ? S.host.tops : null;
  return `<div class="st-join">
    <div class="st-left"><p class="eyebrow">${eq} ${ev.phase === 'picks' ? 'Picks are open' : 'Doors are open'}</p>
      <h1 class="mega">Call the<br>battle.</h1>
      <p class="lead">Scan, make a nickname, rank your Top ${N} and put your Loops where your ears are.</p>
      <div class="st-stats"><div><b>${S.live ? S.live.n : 0}</b><small>players in</small></div><div><b>${ev.bbs.length}</b><small>beatboxers</small></div></div></div>
    <div class="st-right"><div class="qrbox xl" data-static id="qr"></div><div class="bigcode">${esc(S.code)}</div><small>${esc(joinLink().replace(/^https?:\/\//, '').replace(/#.*/, ''))}</small></div>
  </div>
  <div class="mosaic">${ev.bbs.slice(0, 40).map((b) => `<div class="lu" data-k="mz${b.id}">${av(b.id, 'lg')}<b>${esc(b.name)}</b></div>`).join('')}</div>`;
}

function consensus() {
  const c = S.meta.consensus;
  if (!c || !c.rows.length) return '';
  return `<section class="st-cons"><h3>The hall's Top ${size()}</h3><ol>${c.rows.slice(0, 8).map((r, i) => `<li data-k="c${r.id}"><span class="n">${i + 1}</span>${av(r.id, 'md')}<b>${esc(bbName(r.id))}</b></li>`).join('')}</ol></section>`;
}

function upNext(m) {
  const [l, r] = sides(m);
  return `<div class="st-next"><div class="blue">${av(l, 'lg')}<b>${esc(bbName(l))}</b></div><i>VS</i><div class="red">${av(r, 'lg')}<b>${esc(bbName(r))}</b></div></div>`;
}

function duelStage(m) {
  const [l, r] = sides(m), lk = leftKey(m);
  const R = roundInfo(size(), m.r);
  const closed = m.status === 'closed' || m.status === 'done';
  let lp = 50, tot = 0;
  if (m.c) { tot = m.c.a + m.c.b; lp = tot ? Math.round(((lk === 'a' ? m.c.a : m.c.b) / tot) * 100) : 50; }
  const label = { live: 'Battle on', voting: 'Vote now! Pick your colour', closed: 'Hands up!', done: 'The judges decided' }[m.status];
  const jl = m.judges ? (lk === 'a' ? m.judges.a : m.judges.b) : null, jr = m.judges ? (lk === 'a' ? m.judges.b : m.judges.a) : null;
  const side = (id, col, key) => `<div class="pane ${col} ${m.w === key ? 'won' : ''} ${m.w && m.w !== key ? 'lost' : ''}">${av(id, 'hero')}<h2>${esc(bbName(id))}</h2><small>${seedOf(id) ? 'Seed ' + seedOf(id) : ''}</small>${m.w === key ? `<span class="crown">${ic('trophy', 40)}</span>` : ''}</div>`;
  return `<div class="st-duel ${m.status}">
    <div class="st-top"><p class="eyebrow">${R.long} · Battle ${m.i + 1}</p><h2 class="status">${label}</h2></div>
    <div class="panes">${side(l, 'blue', lk)}<div class="vs"><span>VS</span></div>${side(r, 'red', lk === 'a' ? 'b' : 'a')}</div>
    ${closed && tot ? `<div class="st-crowd"><b class="blue">${lp}%</b><div class="bar huge"><i style="width:${lp}%"></i></div><b class="red">${100 - lp}%</b><small>${tot} audience votes${m.judges ? '' : ''}</small></div>` : ''}
    ${m.judges ? `<div class="st-judges"><span class="blue">${jl}</span><small>JUDGES</small><span class="red">${jr}</span></div>` : ''}
    ${m.status === 'voting' ? qrCorner() : ''}
  </div>`;
}

function champion() {
  const ev = S.meta, champ = ev.champion;
  const top = S.board.slice(0, 5);
  return `<div class="st-champ"><p class="eyebrow">${ic('trophy', 22)} Champion</p><div class="crown">${av(champ, 'hero')}</div><h1 class="mega">${esc(bbName(champ))}</h1></div>
    ${top.length ? `<section class="st-cons right"><h3>Best callers</h3><ol>${top.map((r, i) => `<li><span class="n">${i + 1}</span><b>${esc(r.n)}</b><small>${r.net.toLocaleString()}</small></li>`).join('')}</ol></section>` : ''}`;
}
