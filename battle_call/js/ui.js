// Battle Call: UI state and the small components every screen shares.
import { esc, ic, hue } from './dom.js';
import { S, bbName, seedOf, sides, rounds, isOut, size, secsLeft, serverNow } from './state.js';
import { photoUrl } from './net.js';
import { matchRound, slotsFor } from './shared.js';

/** Local, per-phone UI state (not the server's). */
export const ui = {
  tab: 'live', hostTab: 'run', sheet: null, modal: null, search: '', rank: { top: null, seeds: [] }, topSaved: true,
  betFilter: 'open', stake: 100, predRound: 0, boardTab: 'rank', voteOpen: null, voteDismissed: {}, vote: {}, resultSeen: {},
  authMode: 'join', busy: false, err: '', showPw: false, lineupSearch: '', mkFilter: 'all', playerSearch: '', judges: { a: 0, b: 0 },
  hostMatch: null, vsecs: null, later: null, liveRound: null, drag: null, qr: null, seenLog: 0, winCelebrated: false, hapt: true,
};

export const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?';

/** Beatboxer avatar: their photo, or a stable gradient with initials. */
export function av(id, cls = '') {
  const b = S.bb[id];
  if (!b) return `<span class="av ${cls}" style="--h:240">?</span>`;
  const p = photoUrl(b);
  return `<span class="av ${cls}" style="--h:${hue(b.name)}">${p ? `<img src="${p}" alt="" loading="lazy" decoding="async">` : `<i>${esc(initials(b.name))}</i>`}</span>`;
}
export function userAv(name, cls = '') {
  return `<span class="av user ${cls}" style="--h:${hue(name)}"><i>${esc(initials(name))}</i></span>`;
}

export const loops = (n, cls = '') => `<span class="lp ${cls}">${ic('loops', 16)}<b>${Math.round(n).toLocaleString('en-US')}</b></span>`;
export const x = (m) => 'x' + (m >= 10 ? Math.round(m) : m.toFixed(2).replace(/0$/, ''));

export function pill(text, cls = '') { return `<span class="pill ${cls}">${text}</span>`; }

export function empty(icon, title, text) {
  return `<div class="empty">${ic(icon, 34)}<h3>${esc(title)}</h3><p>${text}</p></div>`;
}

/** Big matchup picture: left blue, right red. */
export function duel(m, { size: sz = '', winner = true } = {}) {
  const [l, r] = sides(m);
  const lk = m.swap ? 'b' : 'a';
  const side = (id, col, key) => {
    const won = winner && m.w === key, lost = winner && m.w && m.w !== key;
    return `<div class="fighter ${col} ${won ? 'won' : ''} ${lost ? 'lost' : ''}">
      ${av(id, 'xl')}
      <b class="fname">${esc(bbName(id))}</b>
      <small>${seedOf(id) ? 'Seed ' + seedOf(id) : ''}${won ? ' · winner' : ''}</small>
    </div>`;
  };
  return `<div class="duel-fighters ${sz}">${side(l, 'blue', lk)}<div class="vs"><span>VS</span></div>${side(r, 'red', lk === 'a' ? 'b' : 'a')}</div>`;
}

/* ------------------------------------------------------------ ranking builder (audience Top N, organiser ranking) */
export function rankBuilder({ which, list, N, intro, ctaLabel }) {
  const taken = new Set(list);
  const q = ui.search.trim().toLowerCase();
  const pool = S.meta.bbs.filter((b) => !taken.has(b.id) && (!q || b.name.toLowerCase().includes(q)));
  const slots = Array.from({ length: N }, (_, i) => {
    const id = list[i];
    if (!id) return `<li class="slot empty" data-k="s${i}"><span class="n">${i + 1}</span><span class="hint">${i === list.length ? 'Tap a beatboxer below' : ''}</span></li>`;
    return `<li class="slot" data-k="s${i}-${id}"><span class="grip" data-grip data-w="${which}" data-i="${i}" aria-label="Drag to reorder">${ic('drag', 18)}</span><span class="n">${i + 1}</span>${av(id, 'sm')}<b>${esc(bbName(id))}</b>
      <span class="mv">
        <button class="ib" data-a="rankMove" data-w="${which}" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">${ic('up', 18)}</button>
        <button class="ib" data-a="rankMove" data-w="${which}" data-i="${i}" data-d="1" ${i === list.length - 1 ? 'disabled' : ''} aria-label="Move down">${ic('down', 18)}</button>
        <button class="ib dim" data-a="rankRm" data-w="${which}" data-i="${i}" aria-label="Remove">${ic('x', 16)}</button>
      </span></li>`;
  }).join('');
  const full = list.length >= N;
  return `
    <div class="rb">
      ${intro || ''}
      <div class="rb-head"><div class="ring" style="--p:${Math.round((list.length / N) * 100)}"><b>${list.length}</b><small>/ ${N}</small></div>
        <div><b>Your Top ${N}</b><small>${full ? 'Full house. Reorder with the arrows.' : `${N - list.length} to go`}</small></div>
        ${list.length ? `<button class="btn ghost sm" data-a="rankClear" data-w="${which}">Clear</button>` : ''}</div>
      <ol class="slots">${slots}</ol>
      ${ctaLabel ? `<div class="rb-cta">${ctaLabel}</div>` : ''}
      ${full ? '' : `<div class="pool">
        <label class="search">${ic('predict', 18)}<input data-in="search" value="${esc(ui.search)}" placeholder="Search beatboxers" autocomplete="off"></label>
        <div class="chips">${pool.map((b) => `<button class="chip bb" data-k="p${b.id}" data-a="rankAdd" data-w="${which}" data-id="${b.id}">${av(b.id, 'xs')}<span>${esc(b.name)}</span>${ic('plus', 14)}</button>`).join('') || '<p class="muted">Nobody matches.</p>'}</div></div>`}
    </div>`;
}

/* ------------------------------------------------------------ elimination: who is on stage */
/** What the hall predicted for the beatboxer on stage: tiles (`p` is meta.perf). */
export function perfStats(p) {
  if (!p) return '';
  const tile = (big, small) => `<div class="pt"><b>${big}</b><small>${small}</small></div>`;
  const none = !p.voters;
  return `<div class="pstats">
    ${tile(none ? '-' : p.pct + '%', none ? 'no Top ' + p.N + ' yet' : `have them in their Top ${p.N}`)}
    ${tile(p.n ? '#' + p.avg : '-', 'average seat')}
    ${tile(p.firsts, p.firsts === 1 ? 'player has them #1' : 'players have them #1')}
    ${tile(p.rank ? '#' + p.rank : '-', `in the hall's ranking`)}
    ${p.bets && p.bets.staked ? tile(p.bets.yes + '%', `bet they make the cut · ${p.bets.staked.toLocaleString()} Loops`) : ''}
  </div>`;
}

/** "Predictions close in 4:32": kept current by the ticker in main.js. */
export const lockClock = (ev, cls = '') => {
  if (!ev.picksEnd || ev.phase !== 'picks') return '';
  const left = Math.max(0, ev.picksEnd - serverNow()), s = Math.ceil(left / 1000);
  return `<span class="lockclk ${cls}" data-lock="${ev.picksEnd}">${ic('lock', 16)}<span class="lbl">Predictions close in</span> <b>${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</b></span>`;
};

/* ------------------------------------------------------------ vote countdown */
/** The ring that counts a vote down. The ticker in main.js keeps `data-cd` elements current without re-rendering. */
/** Seconds left as the ring shows them: 45 under a minute, 3:59 above. */
export const fmtLeft = (s) => (s >= 60 ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : String(s));
export function countdown(m, cls = '') {
  const s = secsLeft(m);
  if (s === null) return '';
  const f = Math.max(0, Math.min(1, (m.vend - serverNow()) / ((m.vsecs || 10) * 1000)));
  return `<div class="cd ${cls} ${s <= 3 ? 'hot' : ''} ${s >= 60 ? 'long' : ''}" data-cd="${m.vend}" data-tot="${(m.vsecs || 10) * 1000}" style="--f:${f.toFixed(3)}"><b>${fmtLeft(s)}</b><small>${s >= 60 ? 'min' : 'sec'}</small></div>`;
}

/* ------------------------------------------------------------ bracket */
const stLabel = { wait: '', upcoming: 'Up next', live: 'LIVE', voting: 'VOTE', closed: 'Judging', awaiting: 'Judges later', done: '' };

/** The whole tree. mode 'pick' makes the fighters tappable and shows the viewer's own picks. */
export function bracket({ mode = 'view', picks = {}, only = null } = {}) {
  const ev = S.meta, N = size();
  const cols = rounds().filter((r) => only == null || r.r === only).map((R) => {
    const ms = ev.matches.filter((m) => m.r === R.r && (mode !== 'pick' || !m.third));
    const locked = ev.locked[R.r];
    const cards = ms.map((m) => {
      const slots = mode === 'pick' ? slotsFor(ev.matches, picks, m) : [m.a, m.b];
      const mine = picks[m.id];
      const [lk, rk] = m.swap ? ['b', 'a'] : ['a', 'b'];
      const row = (idx) => {
        const id = slots[idx];
        const known = idx === 0 ? m.a : m.b;
        const key = idx === 0 ? 'a' : 'b';
        const col = key === lk ? 'blue' : 'red';
        if (!id) return `<div class="bm-row tbd ${col}"><span class="dot"></span><b>${m.feed ? 'Winner of ' + feedName(m, idx) : 'TBD'}</b></div>`;
        const won = m.w === key, lost = m.w && m.w !== key;
        const isMine = mine === id;
        const right = mode === 'pick' && m.status === 'done' ? (isMine ? (m.w === key ? `<em class="ok">${ic('check', 16)}</em>` : `<em class="bad">${ic('x', 16)}</em>`) : '')
          : isMine ? `<em class="mine">${ic('check', 16)}</em>` : '';
        const can = mode === 'pick' && !locked && m.status !== 'done' && id;
        const tent = mode === 'pick' && !known;
        return `<${can ? 'button' : 'div'} class="bm-row ${col} ${won ? 'won' : ''} ${lost ? 'lost' : ''} ${isMine ? 'picked' : ''} ${tent ? 'tent' : ''}" ${can ? `data-a="pick" data-m="${m.id}" data-id="${id}"` : ''}>
          <span class="dot"></span>${av(id, 'xs')}<b>${esc(bbName(id))}</b><small>${seedOf(id) ? '#' + seedOf(id) : ''}</small>${right}
        </${can ? 'button' : 'div'}>`;
      };
      return `<article class="bm ${m.status}" data-k="${m.id}"><div class="bm-h"><span>${m.third ? 'Third place' : 'Battle ' + (m.i + 1)}</span>${stLabel[m.status] ? `<i class="st ${m.status}">${stLabel[m.status]}</i>` : ''}${mode === 'view' && m.judges ? `<small>${m.judges.a}-${m.judges.b}</small>` : ''}</div>${row(0)}${row(1)}</article>`;
    }).join('');
    return `<div class="bcol" data-k="r${R.r}"><h4>${R.last ? crown('sm') : ''}${R.short}${locked ? ` ${ic('lock', 13)}` : ''}</h4><div class="bcards">${cards}</div></div>`;
  }).join('');
  return `<div class="bracket ${mode} n${N}">${cols}</div>`;
}
function feedName(m, idx) {
  const f = S.match[m.feed[idx]];
  return f ? `Battle ${f.i + 1}` : '?';
}

/** Last battle that finished, with the judges and the crowd. */
export function resultCard(m) {
  const [l, r] = sides(m);
  const lk = m.swap ? 'b' : 'a';
  const total = m.c ? m.c.a + m.c.b : 0;
  const crowdA = total ? Math.round((m.c.a / total) * 100) : 0;
  const crowdWin = !total ? null : m.c.a === m.c.b ? 'tie' : m.c.a > m.c.b ? 'a' : 'b';
  const lp = lk === 'a' ? crowdA : 100 - crowdA;
  const mine = S.me && S.me.votes ? S.me.votes[m.id] : null;
  return `<article class="res" data-k="res-${m.id}">
    <header><span>${matchRound(size(), m).short}${m.third ? '' : ' · Battle ' + (m.i + 1)}</span>${crowdWin && crowdWin !== 'tie' && crowdWin !== m.w ? '<span class="pill upset">Crowd upset</span>' : ''}</header>
    <div class="res-row">
      <div class="rs ${lk === m.w ? 'won' : ''}">${av(l, 'sm')}<b>${esc(bbName(l))}</b></div>
      <div class="rsmid">${m.judges ? `<b>${lk === 'a' ? m.judges.a : m.judges.b}</b><i>judges</i><b>${lk === 'a' ? m.judges.b : m.judges.a}</b>` : '<i>vs</i>'}</div>
      <div class="rs right ${lk !== m.w ? 'won' : ''}"><b>${esc(bbName(r))}</b>${av(r, 'sm')}</div>
    </div>
    ${total ? `<div class="crowd"><span class="blue">${lp}%</span><div class="bar"><i style="width:${lp}%"></i></div><span class="red">${100 - lp}%</span></div><small class="muted c">Crowd vote · ${total} voted${mine ? ` · you went ${((mine === lk) ? 'blue' : 'red')}` : ''}</small>` : ''}
  </article>`;
}

/** The latest big bets and wins, newest first. */
export function feedStrip(n = 3) {
  const items = (S.feed || []).slice(-n).reverse();
  if (!items.length) return '';
  return `<div class="feed">${items.map((f) => `<div class="fi ${f.k}" data-k="f${f.at}${f.t.length}">${ic(f.k === 'win' ? 'trophy' : 'fire', 15)}<span>${esc(f.t)}</span></div>`).join('')}</div>`;
}

/** The category tabs: one row, the one on stage marked. Shown to the audience only when there is more than one. */
export function catBar(host = false) {
  const m = S.meta;
  if (!host && m.cats.length < 2) return '';
  const chips = m.cats.map((c) => `<button class="cat ${c.id === S.catId ? 'on' : ''} ${c.live ? 'live' : ''}" data-k="cat${c.id}" data-a="catPick" data-id="${c.id}">
    ${catArt(c.art, 'tab')}<span><b>${esc(c.name)}</b><small>${c.size === 2 ? 'Final' : 'Top ' + c.size}${c.id === m.active ? ' · on stage' : ''}</small></span>${c.voting ? '<i class="dot"></i>' : ''}</button>`).join('');
  return `<div class="cats" data-k="cats">${chips}${host ? `<button class="cat add" data-a="hCatAdd">${ic('plus', 16)}<b>Category</b></button>` : ''}</div>`;
}

/* ------------------------------------------------------------ brand artwork */
export const ART_FILE = { male: 'male-solo', female: 'female-solo', duo: 'tag-team', crew: 'crew', loop: 'loop-station' };
export const ART_LABEL = { male: 'Solo', female: 'Solo female', duo: 'Tag team', crew: 'Crew', loop: 'Loop station' };
export const img = (name, ext = 'webp') => `img/${name}.${ext}`;
export const wordmark = (h = 28) => `<img class="wm" src="img/wordmark.svg" alt="BattleCall" height="${h}" style="height:${h}px">`;
export const crown = (cls = '', gold = true) => `<img class="crown-i ${cls}" src="img/crown-${gold ? 'gold' : 'pink'}.svg" alt="" aria-hidden="true">`;
/** The picture a category shows (a cut-out portrait), small and round for the tabs. */
export const catArt = (art, cls = '') => `<img class="catart ${cls}" src="img/${ART_FILE[art] || 'male-solo'}.webp" alt="" loading="lazy" decoding="async">`;
