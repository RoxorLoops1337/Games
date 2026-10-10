// Battle Call: the big screen for the hall. Open /battle_call/#/s/CODE on the projector laptop: read-only, no login,
// it follows the organiser by itself.
import { esc, ic } from '../dom.js';
import { S, perfNow, bbName, size, rounds, curMatch, nextMatch, sides, leftKey, seedOf } from '../state.js';
import { ui, av, perfStats, lockClock, bracket, feedStrip, crown, wordmark, countdown } from '../ui.js';
import { matchRound } from '../shared.js';
import { joinLink } from './host.js';

const eq = '<span class="eq lg"><i></i><i></i><i></i><i></i><i></i></span>';

export function screenView() {
  const ev = S.meta, N = size();
  const hold = ui.screenHold && Date.now() < ui.screenHold.until ? S.match[ui.screenHold.id] : null;
  const cur = curMatch() || (hold && hold.status === 'done' ? hold : null), nx = nextMatch();
  let body = '';
  const pf = perfNow(), running = ev.phase === 'elimination' || (ev.phase === 'picks' && ev.elimOn);
  if (ev.phase === 'lobby' || (ev.phase === 'picks' && !ev.elimOn)) body = joinStage();
  else if (running && pf) body = `<div class="st-perf"><p class="eyebrow">${eq} On stage now</p><div class="pp">${av(pf.id, 'hero')}<h1 class="mega">${esc(bbName(pf.id))}</h1></div>${perfStats(pf)}${ev.phase === 'picks' ? `<div class="st-lock">${lockClock(ev) || 'Predictions are still open'}</div>` : ''}</div>${ev.phase === 'picks' ? qrCorner('top') : ''}`;
  else if (ev.phase === 'picks') body = predictionsStage();
  else if (ev.phase === 'elimination') body = judgingStage();
  else if (ev.phase === 'finished' && !cur) body = champion();
  else if (cur) body = duelStage(cur);
  else body = idleStage(nx);
  return `<div class="stage ph-${ev.phase}"><div class="glow g1"></div><div class="glow g2"></div>
    <header class="st-head"><div class="brand">${crown('sm', false)}<div><b>${esc(ev.name)}</b><small>${ev.cats.length > 1 ? esc(ev.catName) + ' · ' : ''}BattleCall</small></div></div>
    <div class="st-meta"><span>${S.live ? S.live.n : 0} ${S.live && S.live.n === 1 ? 'player' : 'players'}</span><span class="code">${esc(S.code)}</span></div></header>
    ${ev.banner ? `<div class="st-banner" data-k="b${ev.banner.id}">${ic('mega', 28)}<span>${esc(ev.banner.text)}</span></div>` : ''}
    <div class="st-body">${body}</div>${feedStrip(3)}</div>`;
}

const qrCorner = (cls = '') => `<div class="qrcorner ${cls}"><div class="qrbox sm" data-static id="qr"></div><div><small>Join</small><b>${esc(S.code)}</b></div></div>`;

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

/** Between battles: the bracket, then facts about what the hall predicted, one slide every few seconds. */
function idleStage(nx) {
  const ev = S.meta, N = size(), d = S.live && S.live.pk && S.live.pk[ev.id];
  const name = (id) => esc(bbName(id));
  const slides = [`<div class="st-top"><p class="eyebrow">${nx ? 'Up next' : 'The bracket'}</p></div>${nx ? upNext(nx) : ''}<div class="st-bracket ${N >= 16 ? 'scroll' : ''}">${bracket({ mode: 'view' })}</div>`];
  const share = (a, b) => (a + b ? Math.round((a / (a + b)) * 100) : null);
  if (nx && d && d.pk[nx.id]) {
    const [pa, pb] = d.pk[nx.id], mk = ev.mk.find((m) => m.kind === 'match' && m.mid === nx.id), lv = mk && S.live && S.live.mk && S.live.mk[mk.id];
    const ba = lv ? lv[0][mk.bbs.indexOf(nx.a)] || 0 : 0, bb = lv ? lv[0][mk.bbs.indexOf(nx.b)] || 0 : 0;
    const [l, r] = sides(nx), lk = leftKey(nx);
    const side = (id, col, picks, otherPicks, bets, otherBets) => `<div class="side ${col}">${av(id, 'xl')}<h2>${name(id)}</h2><b class="big">${share(picks, otherPicks) === null ? '-' : share(picks, otherPicks) + '%'}</b><small>of the hall picked them</small>${bets + otherBets > 0 ? `<span class="bets">${share(bets, otherBets)}% of the Loops</span>` : ''}</div>`;
    const pl = lk === 'a' ? pa : pb, pr = lk === 'a' ? pb : pa, bl = lk === 'a' ? ba : bb, br = lk === 'a' ? bb : ba;
    slides.push({ t: 'Who the hall picked for this battle', h: `<div class="st-pick2">${side(l, 'blue', pl, pr, bl, br)}<i>VS</i>${side(r, 'red', pr, pl, br, bl)}</div>` });
  }
  if (d) {
    const alive = Object.entries(d.champ).filter(([id]) => ev.out[id] === undefined).sort((a, b) => b[1] - a[1]).slice(0, 5), tot = Object.values(d.champ).reduce((x, y) => x + y, 0);
    if (alive.length) slides.push({ t: 'Who wins it all?', h: `<p class="lead">The hall's picks for the title, among those still in</p><ol class="st-pred">${alive.map(([id, n]) => `<li data-k="w${id}">${av(id, 'md')}<b>${name(id)}</b><i class="pbar"><u style="width:${Math.round((n / tot) * 100)}%"></u></i><small>${Math.round((n / tot) * 100)}%</small></li>`).join('')}</ol>` });
    const done = ev.matches.filter((m) => !m.third && m.status === 'done' && d.pk[m.id] && d.pk[m.id][0] + d.pk[m.id][1] > 0).sort((a, b) => b.ds - a.ds).slice(0, 5);
    if (done.length) slides.push({ t: 'How the hall called it', h: `<ol class="st-pred">${done.map((m) => { const win = m.w === 'a' ? m.a : m.b, k = d.pk[m.id], got = m.w === 'a' ? k[0] : k[1], p = Math.round((got / (k[0] + k[1])) * 100); return `<li data-k="d${m.id}">${av(win, 'md')}<b>${name(win)} won</b><i class="pbar"><u style="width:${p}%"></u></i><small class="seat">${p}% saw it coming</small></li>`; }).join('')}</ol>` });
  }
  const top = (S.board || []).slice(0, 5);
  if (top.length && top[0].net) slides.push({ t: 'Best callers right now', h: `<ol class="st-pred">${top.map((r, i) => `<li data-k="u${r.n}"><span class="n">${i + 1}</span><b>${esc(r.n)}</b><small class="seat">${r.net.toLocaleString()} Loops</small></li>`).join('')}</ol>` });
  const i = Math.floor(Date.now() / SLIDE_MS) % slides.length, sl = slides[i];
  const dots = slides.length > 1 ? `<div class="dots">${slides.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>` : '';
  return `<div class="st-idle" data-cycle="${slides.length}" data-cur="${i}">${typeof sl === 'string' ? sl : `<p class="eyebrow">${eq} While we wait for the next battle</p><h1 class="mega" data-k="it${i}">${sl.t}</h1><div class="jbody" data-k="ib${i}">${sl.h}</div>`}${dots}</div>`;
}

/** The judges are scoring: the screen cycles through facts about what the hall predicted, one every few seconds. */
const SLIDE_MS = 9000;
function judgingStage() {
  const ev = S.meta, N = size(), cons = S.live && S.live.cons && S.live.cons[ev.id];
  const rows = cons ? cons.rows : [], v = cons ? cons.voters : 0;
  const pct = (n) => (v ? Math.round((n / v) * 100) : 0);
  const name = (id) => esc(bbName(id));
  const tile = (big, small) => `<div class="pt"><b>${big}</b><small>${small}</small></div>`;
  const slides = [];
  if (rows.length) {
    slides.push({ t: `The hall's Top ${N}`, h: `<ol class="st-pred ${Math.min(N, 16) > 8 ? 'two' : ''}">${rows.slice(0, Math.min(N, 16)).map((r, i) => `<li><span class="n">${i + 1}</span>${av(r.id, 'md')}<b>${name(r.id)}</b><i class="pbar"><u style="width:${pct(r.n)}%"></u></i><small>${pct(r.n)}%</small></li>`).join('')}</ol>` });
    const firsts = [...rows].filter((r) => r.f).sort((a, b) => b.f - a.f).slice(0, 3);
    if (firsts.length) slides.push({ t: 'Picked as number one', h: `<div class="st-podium">${firsts.map((r, i) => `<div class="pp${i}" data-k="f${r.id}">${av(r.id, 'xl')}<b>${name(r.id)}</b><span>${r.f} ${r.f === 1 ? 'player' : 'players'} put them first</span></div>`).join('')}</div>` });
    const few = rows.filter((r) => r.n > 0).sort((a, b) => a.n - b.n || b.avg - a.avg).slice(0, 5);
    const unpicked = ev.bbs.filter((b) => !rows.some((r) => r.id === b.id)).length;
    if (rows.length >= 4) slides.push({ t: 'Long shots', h: `<p class="lead">Hardly anyone has these in their Top ${N}</p><ol class="st-pred">${few.map((r) => `<li data-k="l${r.id}">${av(r.id, 'md')}<b>${name(r.id)}</b><i class="pbar"><u style="width:${Math.max(3, pct(r.n))}%"></u></i><small>${pct(r.n)}%</small></li>`).join('')}</ol>${unpicked ? `<p class="lead">${unpicked} ${unpicked === 1 ? 'beatboxer' : 'beatboxers'} in nobody's Top ${N}</p>` : ''}` });
    const tight = [...rows].filter((r) => r.n >= 3).sort((a, b) => a.avg - b.avg).slice(0, 4);
    if (tight.length) slides.push({ t: 'Where the hall seats them', h: `<ol class="st-pred">${tight.map((r) => `<li data-k="s${r.id}">${av(r.id, 'md')}<b>${name(r.id)}</b><small class="seat">average seat #${r.avg}</small></li>`).join('')}</ol>` });
  }
  const cut = ev.mk.filter((m) => m.kind === 'qualify').map((m) => { const lv = S.live && S.live.mk && S.live.mk[m.id]; return { bb: m.bb, yes: lv ? lv[0][0] : 0, no: lv ? lv[0][1] : 0, ppl: lv ? lv[1][0] + lv[1][1] : 0 }; }).filter((x) => x.yes + x.no > 0).sort((a, b) => b.yes - a.yes).slice(0, 6);
  if (cut.length) slides.push({ t: 'Most backed to make the cut', h: `<ol class="st-pred">${cut.map((x) => `<li data-k="c${x.bb}">${av(x.bb, 'md')}<b>${name(x.bb)}</b><i class="pbar"><u style="width:${Math.round((x.yes / (x.yes + x.no)) * 100)}%"></u></i><small>${Math.round((x.yes / (x.yes + x.no)) * 100)}% yes</small></li>`).join('')}</ol><p class="lead">${cons ? cons.staked.toLocaleString() : 0} Loops on the cut</p>` });
  slides.push({ t: 'The hall in numbers', h: `<div class="pstats3">${tile(S.live ? S.live.n : 0, 'players')}${tile(v, 'locked in a Top ' + N)}${cons && cons.staked ? tile(cons.staked.toLocaleString(), 'Loops on who makes the cut') : ''}${tile(ev.bbs.length, 'beatboxers on stage tonight')}</div>` });
  const i = Math.floor(Date.now() / SLIDE_MS) % slides.length, sl = slides[i];
  return `<div class="st-judging" data-cycle="${slides.length}" data-cur="${i}"><p class="eyebrow">${eq} The judges are scoring</p>
    <h1 class="mega" data-k="jt${i}">${sl.t}</h1><div class="jbody" data-k="jb${i}">${sl.h}</div>
    <div class="dots">${slides.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div></div>`;
}

/** Everybody has performed: the screen shows the lock-in clock and how the hall's Top N is shaping up. */
function predictionsStage() {
  const ev = S.meta, N = size(), cons = S.live && S.live.cons && S.live.cons[ev.id];
  const rows = cons ? cons.rows.slice(0, N > 8 ? 16 : N) : [], v = cons ? cons.voters : 0;
  const list = rows.length
    ? `<ol class="st-pred ${rows.length > 8 ? 'two' : ''}">${rows.map((r, i) => `<li data-k="p${r.id}"><span class="n">${i + 1}</span>${av(r.id, 'md')}<b>${esc(bbName(r.id))}</b><i class="pbar"><u style="width:${v ? Math.round((r.n / v) * 100) : 0}%"></u></i><small>${v ? Math.round((r.n / v) * 100) : 0}%</small></li>`).join('')}</ol>`
    : '<p class="lead">The hall\'s Top ' + N + ' appears here as players lock in.</p>';
  return `<div class="st-predict">
    <div class="pl">
      <p class="eyebrow">${eq} ${(ev.performed || []).length ? 'Elimination is done' : 'Elimination is on'}</p>
      <h1 class="mega">${ev.picksEnd ? 'Lock in<br>your Top ' + N : 'Predictions<br>still open'}</h1>
      ${ev.picksEnd ? lockClock(ev, 'big') : '<p class="lead">Lock in your Top ' + N + ' before the judges announce it</p>'}
      <div class="pstats3"><div class="pt"><b>${v}</b><small>of ${S.live ? S.live.n : 0} players locked in a Top ${N}</small></div>
        ${cons && cons.staked ? `<div class="pt"><b>${cons.staked.toLocaleString()}</b><small>Loops on who makes the cut</small></div>` : ''}</div>
    </div>
    <section class="pr"><h3>The hall's Top ${N} so far</h3>${list}</section>
  </div>${qrCorner()}`;
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
  const R = matchRound(size(), m);
  const closed = m.status === 'closed' || m.status === 'done';
  let lp = 50, tot = 0;
  if (m.c) { tot = m.c.a + m.c.b; lp = tot ? Math.round(((lk === 'a' ? m.c.a : m.c.b) / tot) * 100) : 50; }
  const label = { live: 'Battle on', voting: 'Vote now! Pick your colour', closed: 'Hands up!', done: 'The judges decided' }[m.status];
  const jl = m.judges ? (lk === 'a' ? m.judges.a : m.judges.b) : null, jr = m.judges ? (lk === 'a' ? m.judges.b : m.judges.a) : null;
  const side = (id, col, key) => `<div class="pane ${col} ${m.w === key ? 'won' : ''} ${m.w && m.w !== key ? 'lost' : ''}">${av(id, 'hero')}<h2>${esc(bbName(id))}</h2><small>${seedOf(id) ? 'Seed ' + seedOf(id) : ''}</small>${m.w === key ? `<span class="crown">${crown('big')}</span>` : ''}</div>`;
  return `<div class="st-duel ${m.status}">
    <div class="st-top"><p class="eyebrow">${R.long}${m.third ? '' : ' · Battle ' + (m.i + 1)}</p><h2 class="status">${label}</h2></div>
    ${m.status === 'voting' ? countdown(m, 'huge') : ''}
    <div class="panes">${side(l, 'blue', lk)}<div class="vs"><span>VS</span></div>${side(r, 'red', lk === 'a' ? 'b' : 'a')}</div>
    ${closed && tot ? `<div class="st-crowd"><b class="blue">${lp}%</b><div class="bar huge"><i style="width:${lp}%"></i></div><b class="red">${100 - lp}%</b><small>${tot} audience votes${m.judges ? '' : ''}</small></div>` : ''}
    ${m.judges ? `<div class="st-judges"><span class="blue">${jl}</span><small>JUDGES</small><span class="red">${jr}</span></div>` : ''}
    ${m.status === 'voting' ? qrCorner() : ''}
  </div>`;
}

function champion() {
  const ev = S.meta, champ = ev.champion;
  const top = S.board.slice(0, 5);
  return `<div class="st-champ"><p class="eyebrow">${ic('trophy', 22)} Champion</p><div class="crownwrap">${crown('big')}<div class="crown">${av(champ, 'hero')}</div></div><h1 class="mega">${esc(bbName(champ))}</h1></div>
    ${top.length ? `<section class="st-cons right"><h3>Best callers</h3><ol>${top.map((r, i) => `<li><span class="n">${i + 1}</span><b>${esc(r.n)}</b><small>${r.net.toLocaleString()}</small></li>`).join('')}</ol></section>` : ''}`;
}
