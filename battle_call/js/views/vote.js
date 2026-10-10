// Battle Call: the voting screen. Two big halves, left blue and right red. After you vote the whole phone turns
// your colour so you can hold it up in the hall.
import { esc, ic } from '../dom.js';
import { S, bbName, sides, leftKey, size, seedOf } from '../state.js';
import { ui, av } from '../ui.js';
import { roundInfo } from '../shared.js';

export function voteOverlay() {
  const m = S.match[ui.voteOpen];
  if (!m || !S.me) return '';
  const lk = leftKey(m), rk = lk === 'a' ? 'b' : 'a';
  const [l, r] = sides(m);
  const mine = S.me.votes[m.id] || ui.vote[m.id] || null;
  const R = roundInfo(size(), m.r);
  const head = `<div class="vhead"><span>${R.long} · Battle ${m.i + 1}</span><button class="ib" data-a="voteClose" aria-label="Close">${ic('x', 22)}</button></div>`;

  if (m.status === 'done') {
    const won = m.w === (mine || '');
    const winId = m.w === 'a' ? m.a : m.b, col = m.w === lk ? 'blue' : 'red';
    return `<div class="vote done ${col}" data-k="vote">${head}
      <div class="vcenter"><p class="eyebrow">The judges say</p><div class="wavatar">${av(winId, 'xxl')}</div><h1>${esc(bbName(winId))}</h1>
      ${m.judges ? `<p class="big">${m.judges.a}-${m.judges.b}</p>` : ''}
      <p class="lead">${mine ? (won ? 'You voted with the judges!' : 'You went the other way this time.') : ''}</p></div>
      <button class="btn big light" data-a="voteClose">Back to the battle</button></div>`;
  }

  if (mine) {
    const col = mine === lk ? 'blue' : 'red', id = mine === 'a' ? m.a : m.b;
    const closed = m.status !== 'voting';
    return `<div class="vote flag ${col} ${closed ? 'hands' : ''}" data-k="vote">
      <div class="flag-inner"><span class="flagname">${esc(bbName(id))}</span><span class="flagsub">${closed ? 'HANDS UP!' : col.toUpperCase()}</span></div>
      <div class="flag-bar">
        ${closed ? '' : `<button class="chip lightc" data-a="voteChange">Change my vote</button>`}
        <button class="chip lightc" data-a="voteClose">${ic('x', 14)} Close</button>
      </div></div>`;
  }

  const closed = m.status !== 'voting';
  const half = (id, col, key) => `<button class="half ${col}" data-a="vote" data-m="${m.id}" data-side="${key}" ${closed ? 'disabled' : ''}>
      ${av(id, 'xxl')}<b>${esc(bbName(id))}</b><small>${seedOf(id) ? 'Seed ' + seedOf(id) : ''}</small><span class="go">${closed ? 'Closed' : 'Vote ' + col.toUpperCase()}</span></button>`;
  return `<div class="vote pick" data-k="vote">${head}
    <p class="vtitle">${closed ? 'Voting is closed' : 'Who took it?'}</p>
    <div class="halves">${half(l, 'blue', lk)}${half(r, 'red', rk)}</div></div>`;
}
