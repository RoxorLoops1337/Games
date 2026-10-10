// Battle Call: the Live tab. It follows the organiser: whatever phase the event is in, this is the page that explains it.
import { esc, ic } from '../dom.js';
import { S, bbName, size, rounds, curMatch, nextMatch, seedOf, sides, leftKey, myBet, mkView, mkTitle } from '../state.js';
import { ui, av, userAv, perfStats, duel, bracket, resultCard, loops, pill, x, catArt, crown, ART_FILE, countdown } from '../ui.js';
import { matchRound } from '../shared.js';
import { callStats } from '../share.js';
import { REACTIONS, levelOf, badgesOf, soundOn } from '../juice.js';

/** The category's picture, standing in the corner of a hero card. */
const heroArt = () => `<img class="heroart" src="img/${ART_FILE[S.meta.art] || 'male-solo'}.webp" alt="" decoding="async">`;
const livePill = () => `<span class="livepill"><i></i>LIVE</span><span class="onl">${ic('users', 14)} ${S.live ? S.live.on : 0} online</span>`;
const eq = '<span class="eq"><i></i><i></i><i></i><i></i><i></i></span>';

export function liveTab() {
  const ev = S.meta;
  const parts = [];
  if (ev.banner) parts.push(`<div class="banner" data-k="banner-${ev.banner.id}">${ic('mega', 18)}<span>${esc(ev.banner.text)}</span></div>`);
  if (S.role === 'guest') parts.push(`<div class="guestbar"><span>You are watching. Join to predict, bet and vote.</span><button class="btn sm" data-a="authOpen">Join</button></div>`);
  if (S.role === 'user' && S.me && ev.phase !== 'bracket') parts.push(playerCard()); // in the bracket the battle comes first
  switch (ev.phase) {
    case 'lobby': parts.push(lobby()); break;
    case 'picks': parts.push(picks()); break;
    case 'elimination': parts.push(elimination()); break;
    case 'bracket': parts.push(bracketPhase()); break;
    case 'finished': parts.push(finished()); break;
  }
  return parts.join('');
}

function playerCard() {
  const me = S.me, L = levelOf(me), sk = me.streak || 0;
  return `<section class="pcard" data-k="pcard"><div class="lv"><span><small>LVL</small>${L.lvl}</span></div>
    <div><b>${esc(L.title)}</b> <small>${L.xp} XP · ${L.toNext} to level ${L.lvl + 1}</small></div>
    <div class="fire ${sk >= 2 ? '' : 'off'}">\u{1F525} ${sk}<small>streak</small></div>
    <div class="xpbar"><i style="width:${Math.max(4, L.pct)}%"></i></div>
  </section>
  <div class="badges" data-k="badges">${badgesOf(me).filter((b) => b.got).map((b) => `<span class="badge" title="${esc(b.name)}">${b.icon} ${esc(b.name)}</span>`).join('')}
    <button class="badge" data-a="toggleSound">${soundOn() ? '\u{1F50A} Sound on' : '\u{1F507} Sound off'}</button></div>`;
}

const rxBar = () => (S.role === 'user' ? `<div class="rxbar" data-k="rxbar">${REACTIONS.map(([k, e]) => `<button data-a="react" data-e="${k}" aria-label="${k}">${e}</button>`).join('')}</div>` : '');

function lineup(limit = 60) {
  const list = S.meta.bbs.slice(0, limit);
  if (!list.length) return '';
  return `<section class="block"><h3>The lineup <small>${S.meta.bbs.length}</small></h3>
    <div class="lineup">${list.map((b) => `<div class="lu" data-k="lu${b.id}">${av(b.id, 'md')}<b>${esc(b.name)}</b></div>`).join('')}</div></section>`;
}

/** One entrant: nothing to predict, they walk straight to the title once the elimination is done. */
function soloHero(eyebrow) {
  const b = S.meta.bbs[0];
  return `<section class="hero lobby photo">${heroArt()}<p class="eyebrow">${eq} ${eyebrow}</p><h1>${esc(b.name)}</h1>
    <p class="lead">${esc(b.name)} is the only entrant in ${esc(S.meta.catName)}. No bracket here: a walkover to the title after the elimination round.</p>
    <div class="pills">${pill('Walkover')}</div></section>`;
}

function lobby() {
  const ev = S.meta;
  if (ev.bbs.length === 1) return soloHero('Doors are open');
  return `
    <section class="hero lobby photo">
      ${heroArt()}
      <p class="eyebrow">${eq} Doors are open</p>
      <h1>${esc(ev.name)}</h1>
      <p class="lead">Call the Top ${size()}, back your winners and vote in every battle. Everyone starts with <b>${ev.set.start.toLocaleString()} Loops</b>.</p>
      <div class="pills">${livePill()}${pill(`${S.live ? S.live.n : 0} ${S.live && S.live.n === 1 ? 'player' : 'players'} in`)}${pill(`${ev.bbs.length} beatboxers`)}</div>
      <button class="btn ghost sm sharebtn" data-a="shareEvent">${ic('copy', 16)} Share this event</button>
    </section>
    <section class="how">
      <div class="card how-c"><i class="hi v">${ic('predict', 22)}</i><b>Predict</b><p>Build your Top ${size()} before the elimination. Then call every battle in the bracket.</p></div>
      <div class="card how-c"><i class="hi g">${ic('dice', 22)}</i><b>Bet</b><p>Put Loops on who makes the cut, who reaches the final, who wins a battle.</p></div>
      <div class="card how-c"><i class="hi b">${ic('hand', 22)}</i><b>Vote</b><p>Pick blue or red, then hold your screen up high so the whole hall sees it.</p></div>
    </section>
    ${lineup()}`;
}

function picks() {
  if (S.meta.bbs.length === 1) return soloHero('Picks are open elsewhere');
  const me = S.me, N = size(), n = me ? me.top.length : 0;
  const tops = S.host ? S.host.tops : null;
  return `
    <section class="hero picks photo">
      ${heroArt()}
      <p class="eyebrow">${eq} Picks are open</p>
      <h1>Who is making the Top ${N}?</h1>
      <p class="lead">Rank your Top ${N}. You earn Loops for every beatboxer who gets through, and more for the exact seat.</p>
      <div class="cta-row">
        <button class="btn big" data-a="tab" data-t="predict">${ic('predict', 20)} ${n ? 'Edit my Top ' + N : 'Build my Top ' + N}</button>
        <button class="btn big ghost" data-a="tab" data-t="bets">${ic('dice', 20)} Hot takes</button>
      </div>
      ${S.role !== 'guest' ? `<div class="prog"><div class="ring" style="--p:${Math.round((n / N) * 100)}"><b>${n}</b><small>/ ${N}</small></div><span>${n >= N ? 'Your Top ' + N + ' is in. You can still change it.' : n ? 'Keep going, ' + (N - n) + ' more to fill.' : 'You have not picked yet.'}</span></div>` : ''}
    </section>
    ${lineup()}`;
}

function elimination() {
  if (S.meta.bbs.length === 1) return soloHero('Elimination is on');
  const c = S.meta.consensus, N = size(), pf = S.meta.perf;
  return `
    ${pf ? `<section class="hero perf"><p class="eyebrow">${eq} On stage now</p><div class="crownwrap"><div class="crown">${av(pf.id, 'xxl')}</div></div><h1>${esc(bbName(pf.id))}</h1>${perfStats(pf)}</section>` : ''}
    <section class="hero elim photo">
      <p class="eyebrow">${eq} Elimination is on</p>
      <h1>The judges are choosing</h1>
      <p class="lead">Picks and bets are locked. Sit tight: the Top ${N} is about to be announced.</p>
    </section>
    ${S.me && S.me.top.length ? `<section class="block"><h3>Your Top ${N}</h3><div class="lineup mini">${S.me.top.map((id, i) => `<div class="lu" data-k="m${id}"><span class="seat">${i + 1}</span>${av(id, 'md')}<b>${esc(bbName(id))}</b></div>`).join('')}</div></section>` : ''}
    ${c && c.rows.length ? `<section class="block"><h3>The crowd's Top ${N} <small>${c.voters} players</small></h3>
      <ol class="cons">${c.rows.map((r, i) => `<li data-k="c${r.id}"><span class="n">${i + 1}</span>${av(r.id, 'sm')}<b>${esc(bbName(r.id))}</b><small>${Math.round((r.n / c.voters) * 100)}% have them in</small></li>`).join('')}</ol></section>` : ''}`;
}

function matchHero(m) {
  const lk = leftKey(m);
  const R = matchRound(size(), m);
  const voted = S.me && S.me.votes ? S.me.votes[m.id] : null;
  const label = { upcoming: 'Up next', live: 'Battle live', voting: 'Vote now', closed: 'Voting closed' }[m.status];
  const pick = S.me && S.me.picks ? S.me.picks[m.id] : null;
  const mk = Object.values(S.mk).find((k) => k.kind === 'match' && k.mid === m.id);
  const bet = mk ? myBet(mk.id) : null;
  let body = '';
  if (m.status === 'upcoming') {
    body = `<div class="cta-row">
      <button class="btn big" data-a="tab" data-t="predict">${ic('predict', 20)} ${pick ? 'Pick: ' + esc(bbName(pick)) : 'Make your pick'}</button>
      ${mk ? `<button class="btn big ghost" data-a="tab" data-t="bets">${ic('dice', 20)} ${bet ? 'Bet placed' : 'Place a bet'}</button>` : ''}</div>`;
  } else if (m.status === 'live') {
    body = `<p class="note">${ic('lock', 16)} Bets are locked. Enjoy the battle, your vote opens when it ends.</p>`;
  } else if (m.status === 'voting') {
    body = voted
      ? `<button class="btn big ${voted === lk ? 'blue' : 'red'}" data-a="voteOpen" data-m="${m.id}">${ic('hand', 20)} Show my ${voted === lk ? 'BLUE' : 'RED'} screen</button>`
      : S.role === 'guest' ? '<button class="btn big" data-a="authOpen">Join to vote</button>'
      : `<button class="btn big pulse" data-a="voteOpen" data-m="${m.id}">${ic('hand', 20)} Cast your vote</button>`;
  } else {
    body = voted ? `<button class="btn big ${voted === lk ? 'blue' : 'red'}" data-a="voteOpen" data-m="${m.id}">${ic('hand', 20)} Hands up! Show ${voted === lk ? 'BLUE' : 'RED'}</button>`
      : '<p class="note">Voting is closed. The judges are deciding.</p>';
  }
  return `<section class="duel ${m.status}" data-k="duel">
    <div class="duel-top"><span>${R.long}${m.third ? '' : ' · Battle ' + (m.i + 1)}</span><i class="st ${m.status}">${label}</i></div>
    ${m.status === 'voting' ? countdown(m, 'inline') : ''}
    ${duel(m)}
    ${body}
    ${['live', 'voting', 'closed'].includes(m.status) ? rxBar() : ''}
  </section>`;
}

function bracketPhase() {
  const cur = curMatch(), nx = nextMatch();
  const done = S.meta.matches.filter((m) => m.status === 'done').sort((a, b) => b.r - a.r || b.i - a.i);
  return `
    ${cur ? matchHero(cur) : nx ? matchHero(nx) : '<section class="hero"><h1>Next round loading</h1></section>'}
    ${cur && nx ? `<p class="upnext">Up next: <b>${esc(bbName(nx.a))}</b> vs <b>${esc(bbName(nx.b))}</b></p>` : ''}
    ${S.role === 'user' && S.me ? playerCard() : ''}
    <section class="block"><h3>The bracket</h3>${bigBracket(cur || nx)}</section>
    ${done.length ? `<section class="block"><h3>Results</h3><div class="stack">${done.slice(0, 4).map(resultCard).join('')}</div>${done.length > 4 ? '<button class="btn ghost sm" data-a="tab" data-t="board" data-b="results">All results</button>' : ''}</section>` : ''}`;
}

/** 16+ beatboxers make a bracket far too tall for a phone: one round at a time, following the battle on stage. */
function bigBracket(focus) {
  if (size() < 16) return `<div class="hscroll">${bracket({ mode: 'view' })}</div>`;
  const r = ui.liveRound != null ? ui.liveRound : focus ? focus.r : 0;
  return `<div class="segs mini rsel">${rounds().map((R) => `<button class="seg ${R.r === r ? 'on' : ''}" data-a="liveRound" data-r="${R.r}">${R.short}</button>`).join('')}</div>
    <div class="hscroll">${bracket({ mode: 'view', only: r })}</div>`;
}

function finished() {
  const ev = S.meta, champ = ev.champion;
  const fin = ev.matches.find((m) => m.r === rounds().length - 1 && !m.third);
  const runner = fin ? (fin.w === 'a' ? fin.b : fin.a) : null;
  const th = ev.matches.find((m) => m.third && m.status === 'done');
  const semis = th ? [th.w === 'a' ? th.a : th.b] : ev.matches.filter((m) => m.r === rounds().length - 2 && m.status === 'done').map((m) => (m.w === 'a' ? m.b : m.a));
  const me = S.me;
  const top3 = S.board.slice(0, 3);
  return `
    <section class="hero champ">
      <p class="eyebrow">${ic('trophy', 16)} Champion</p>
      <div class="crownwrap">${crown('big')}<div class="crown">${av(champ, 'xxl')}</div></div>
      <h1>${esc(bbName(champ))}</h1>
      <p class="lead">${esc(ev.name)} is done. What a battle.</p>
    </section>
    ${ev.walkover ? `<section class="block"><p class="note">Walkover: ${esc(bbName(champ))} was the only entrant in ${esc(ev.catName)}.</p></section>` : `<section class="block"><h3>Podium</h3>
      <div class="podium">
        <div class="pd p2">${runner ? av(runner, 'lg') : ''}<b>${esc(runner ? bbName(runner) : '')}</b><span>2</span></div>
        <div class="pd p1">${crown('sm')}${av(champ, 'lg')}<b>${esc(bbName(champ))}</b><span>1</span></div>
        <div class="pd p3">${semis[0] ? av(semis[0], 'lg') : ''}<b>${esc(semis[0] ? bbName(semis[0]) : '')}</b>${semis[1] ? `<small>and ${esc(bbName(semis[1]))}</small>` : ''}<span>3</span></div>
      </div>
    </section>`}
    ${me ? `<section class="block you"><h3>Your battle</h3><div class="stats4">
      <div><b>#${me.rank}</b><small>of ${me.of}</small></div><div><b>${me.net.toLocaleString()}</b><small>Loops</small></div>
      <div><b>${callStats().hit}/${callStats().tot}</b><small>battles called</small></div><div><b>${me.st.won || 0}</b><small>bets won</small></div></div>
      <button class="btn big" data-a="shareResults">${ic('copy', 20)} Share my result</button></section>` : ''}
    ${top3.length ? `<section class="block"><h3>Best callers</h3><ol class="board">${top3.map((r) => rowOf(r)).join('')}</ol></section>` : ''}`;
}

export function rowOf(r) {
  const mine = S.me && r.n === S.me.name;
  return `<li class="${mine ? 'me' : ''} r${r.rank}" data-k="u${r.n}"><span class="rk">${r.rank === 1 ? crown('xs') : r.rank}</span>${userAv(r.n, 'sm')}<b>${esc(r.n)}${mine ? ' <i>you</i>' : ''}</b><span class="net">${loops(r.net)}</span></li>`;
}
