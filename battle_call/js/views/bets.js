// Battle Call: the Bets tab. Parimutuel markets: everybody's stakes make one pot and the winners share it,
// so the multiplier you see moves as the hall bets. The sheet at the bottom is where a stake is set.
import { esc, ic } from '../dom.js';
import { S, bbName, size, mkView, mkTitle, mkLabel, myBet, payoutIf, seedOf, sides, leftKey, isOut } from '../state.js';
import { ui, av, empty, loops, x, pill } from '../ui.js';
import { roundInfo, MIN_BET } from '../shared.js';

const FILTERS = [['open', 'Open'], ['play', 'In play'], ['mine', 'Mine'], ['done', 'Done']];

export function betsTab() {
  const ev = S.meta;
  if (S.role === 'guest') return empty('lock', 'Join to bet', 'Bets use Loops, the points everybody starts with. Make an account to play.') + '<div class="center"><button class="btn big" data-a="authOpen">Join the battle</button></div>';
  const all = ev.mk.map(mkView).filter((m) => m.st !== 'void' || m.mine);
  if (!all.length) return empty('dice', 'No bets yet', ev.phase === 'lobby' ? 'Markets open when the picks start.' : 'The organiser will open the next market soon.');
  const f = ui.betFilter;
  const q = ui.search.trim().toLowerCase();
  const match = (m) => !q || (m.kind === 'match' ? m.bbs.some((id) => bbName(id).toLowerCase().includes(q)) : m.bb ? bbName(m.bb).toLowerCase().includes(q) : 'champion winner'.includes(q));
  const pick = all.filter((m) => match(m) && (f === 'open' ? m.st === 'open' : f === 'play' ? m.st === 'locked' : f === 'mine' ? !!m.mine : m.st === 'settled' || m.st === 'void'));
  const counts = { open: 0, play: 0, mine: 0, done: 0 };
  for (const m of all) { if (m.st === 'open') counts.open++; if (m.st === 'locked') counts.play++; if (m.mine) counts.mine++; if (m.st === 'settled' || m.st === 'void') counts.done++; }
  const chips = FILTERS.map(([k, l]) => `<button class="seg ${f === k ? 'on' : ''}" data-a="betFilter" data-f="${k}">${l} <small>${counts[k]}</small></button>`).join('');
  const matches = pick.filter((m) => m.kind === 'match').sort((a, b) => S.match[a.mid].r - S.match[b.mid].r || S.match[a.mid].i - S.match[b.mid].i);
  const champs = pick.filter((m) => m.kind === 'champion');
  const reach = pick.filter((m) => m.kind === 'reach').sort((a, b) => b.to - a.to || a.mult[0] - b.mult[0]);
  const qual = pick.filter((m) => m.kind === 'qualify').sort((a, b) => a.mult[0] - b.mult[0]);
  const many = qual.length + reach.length > 6;
  return `
    <div class="segs">${chips}</div>
    ${many ? `<label class="search">${ic('predict', 18)}<input data-in="search" value="${esc(ui.search)}" placeholder="Find a beatboxer" autocomplete="off"></label>` : ''}
    ${!pick.length ? empty('dice', f === 'mine' ? 'No bets yet' : 'Nothing here', f === 'mine' ? 'Tap a multiplier on any open market to back it.' : 'Check another tab.') : ''}
    ${matches.length ? `<h3 class="sh">Battle winners</h3><div class="stack">${matches.map(matchCard).join('')}</div>` : ''}
    ${champs.length ? `<h3 class="sh">Outright</h3><div class="stack">${champs.map(champCard).join('')}</div>` : ''}
    ${reach.length ? `<h3 class="sh">Going all the way</h3><div class="stack">${reach.map(binCard).join('')}</div>` : ''}
    ${qual.length ? `<h3 class="sh">Making the Top ${size()}</h3><div class="stack">${qual.map(binCard).join('')}</div>` : ''}`;
}

function status(m) {
  if (m.st === 'open') return pill('Open', 'open');
  if (m.st === 'locked') return pill(ic('lock', 12) + ' In play', 'locked');
  if (m.st === 'void') return pill('Refunded', 'void');
  return pill('Settled', 'done');
}

function resultLine(m) {
  if (!m.mine) return '';
  const [o, amt, paid] = m.mine;
  if (m.st === 'settled' || m.st === 'void') {
    if (m.st === 'void') return `<div class="mybet back">Stake back: ${loops(amt)}</div>`;
    return paid > 0 ? `<div class="mybet won">${ic('check', 14)} You won ${loops(paid - amt)}</div>` : `<div class="mybet lost">You lost ${loops(amt)}</div>`;
  }
  return `<div class="mybet">${ic('dice', 14)} Your bet: ${loops(amt)} on <b>${esc(mkLabel(m, o))}</b> · pays ${loops(payoutIf({ ...m, pool: m.pool.map((p, i) => (i === o ? p - amt : p)) }, o, amt))}</div>`;
}

function opt(m, i, cls, inner) {
  const mine = m.mine && m.mine[0] === i;
  const won = m.st === 'settled' && m.win === i;
  const dis = m.st !== 'open' || m.dead[i];
  return `<button class="opt ${cls} ${mine ? 'mine' : ''} ${won ? 'win' : ''} ${m.st === 'settled' && !won ? 'lose' : ''}" ${dis ? 'disabled' : ''} data-a="bet" data-mk="${m.id}" data-o="${i}">${inner}</button>`;
}

function matchCard(m) {
  const mt = S.match[m.mid], lk = leftKey(mt);
  // market options are [a, b]; the blue side is whichever the hall sees on the left
  const order = lk === 'a' ? [0, 1] : [1, 0];
  const info = mkTitle(m);
  const split = m.real ? Math.round((m.pool[order[0]] / m.real) * 100) : 50;
  const o = (i, cls) => opt(m, i, cls, `${av(m.bbs[i], 'md')}<b>${esc(bbName(m.bbs[i]))}</b><span class="mult">${x(m.mult[i])}</span><small>${m.cnt[i]} ${m.cnt[i] === 1 ? 'player' : 'players'}</small>`);
  return `<article class="mk match" data-k="${m.id}">
    <header><span>${info.sub} · Battle ${mt.i + 1}</span>${status(m)}</header>
    <div class="opts">${o(order[0], 'blue')}${o(order[1], 'red')}</div>
    <div class="split" title="Share of Loops staked"><i style="width:${split}%"></i></div>
    ${resultLine(m)}
  </article>`;
}

function binCard(m) {
  const info = mkTitle(m);
  const yes = (i) => opt(m, i, i === 0 ? 'yes' : 'no', `<span>${i === 0 ? 'Yes' : 'No'}</span><span class="mult">${x(m.mult[i])}</span>`);
  return `<article class="mk bin" data-k="${m.id}">
    <div class="who">${av(m.bb, 'md')}<div><b>${esc(info.title)}</b><small>${info.sub}</small></div>${status(m)}</div>
    <div class="opts two">${yes(0)}${yes(1)}</div>
    ${m.people ? `<div class="split"><i style="width:${m.pct[0]}%"></i></div><small class="muted">${m.pct[0]}% say yes · ${m.people} ${m.people === 1 ? 'player' : 'players'}</small>` : ''}
    ${resultLine(m)}
  </article>`;
}

function champCard(m) {
  const order = m.bbs.map((id, i) => i).sort((a, b) => m.mult[a] - m.mult[b]);
  return `<article class="mk champ" data-k="${m.id}">
    <header><span>Battle champion</span>${status(m)}</header>
    <div class="rows">${order.map((i) => opt(m, i, m.dead[i] ? 'out' : '', `${av(m.bbs[i], 'sm')}<b>${esc(bbName(m.bbs[i]))}</b>${m.dead[i] ? '<small>out</small>' : `<small>${m.pct[i] ? m.pct[i] + '%' : ''}</small>`}<span class="mult">${x(m.mult[i])}</span>`)).join('')}</div>
    ${resultLine(m)}
  </article>`;
}

/* ------------------------------------------------------------ the stake sheet */
export function stakeSheet() {
  const sh = ui.sheet;
  const m0 = S.mk[sh.mk];
  if (!m0 || !S.me) return '';
  const m = mkView(m0), info = mkTitle(m), o = sh.o;
  const prev = m.mine && !(m.mine[2] != null) ? m.mine : null;
  const cap = S.me.bal + (prev ? prev[1] : 0);
  const max = Math.floor(cap / MIN_BET) * MIN_BET;
  const adj = { ...m, pool: m.pool.map((p, i) => (prev && prev[0] === i ? p - prev[1] : p)) };
  const stake = Math.max(MIN_BET, Math.min(max, ui.stake));
  const win = max >= MIN_BET ? payoutIf(adj, o, stake) : 0;
  const label = mkLabel(m, o);
  const quick = [50, 100, 250, 500].filter((v) => v < max);
  return `<div class="sheet" role="dialog" aria-label="Place a bet">
    <div class="grab"></div>
    <button class="ib close" data-a="sheetClose" aria-label="Close">${ic('x', 20)}</button>
    <p class="eyebrow">${esc(info.title)} · ${esc(info.sub)}</p>
    <h2>${m.kind === 'match' || m.kind === 'champion' ? esc(label) + ' to win' : esc(label)}</h2>
    <div class="odds"><span class="mult big">${x(adj.seed.length ? payoutIf(adj, o, 100) / 100 : 1)}</span><small>if you stake 100 right now · the pot has ${loops(m.total)}</small></div>
    ${max < MIN_BET ? '<p class="note">You need at least ' + MIN_BET + ' Loops to bet.</p>' : `
    <div class="stake"><button class="ib" data-a="stakeAdj" data-d="-10">${ic('minus', 20)}</button><div><b data-count="${stake}">${stake}</b><small>Loops</small></div><button class="ib" data-a="stakeAdj" data-d="10">${ic('plus', 20)}</button></div>
    <input class="range" type="range" min="${MIN_BET}" max="${max}" step="${MIN_BET}" value="${stake}" data-in="stake">
    <div class="chips q">${quick.map((v) => `<button class="chip" data-a="stakeSet" data-v="${v}">${v}</button>`).join('')}<button class="chip hot" data-a="stakeSet" data-v="${max}">All in</button></div>
    <div class="return"><span>If ${esc(label)} ${m.kind === 'qualify' || m.kind === 'reach' ? '' : 'wins'}</span><b>${loops(win)} <small>(+${win - stake})</small></b></div>
    <div class="cta-row"><button class="btn big" data-a="betPlace" data-mk="${m.id}" data-o="${o}">${prev ? 'Update bet' : 'Place bet'} · ${stake}</button>${prev ? `<button class="btn big ghost" data-a="betCancel" data-mk="${m.id}">Take it back</button>` : ''}</div>`}
    <p class="muted center small">You keep what you have not staked. Winners split the pot, never less than ${S.meta.set.minPayout.toFixed(1)}x.</p>
  </div>`;
}
