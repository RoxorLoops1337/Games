// Battle Call: the Predict tab. Before the elimination you rank a Top N; once the bracket is drawn you pick every battle.
import { esc, ic } from '../dom.js';
import { S, bbName, size, rounds, seedOf } from '../state.js';
import { ui, av, rankBuilder, bracket, empty, loops } from '../ui.js';
import { slotsFor } from '../shared.js';

export function predictTab() {
  const ev = S.meta, N = size();
  if (S.role === 'guest') return empty('lock', 'Join to predict', 'Make an account (just a nickname and a password) to rank your Top ' + N + ' and call every battle.') + '<div class="center"><button class="btn big" data-a="authOpen">Join the battle</button></div>';
  if (ev.phase === 'lobby') {
    return `<section class="hero tight"><p class="eyebrow">Soon</p><h1>Picks open soon</h1><p class="lead">When the organiser opens the picks you will rank your Top ${N} here. You earn <b>${ev.set.pts.topIn}</b> Loops for each beatboxer who makes it and <b>${ev.set.pts.topExact}</b> more for the exact seat.</p></section>`;
  }
  if (ev.phase === 'picks') {
    if (ui.rank.top == null) ui.rank.top = [...(S.me ? S.me.top : [])];
    const intro = `<div class="card tip"><b>How it scores</b><p>${ev.set.pts.topIn} Loops for every pick who makes the Top ${N}. +${ev.set.pts.topExact} for the exact seat, +${ev.set.pts.topNear} when you are one seat off. Picks lock when the elimination starts.</p></div>`;
    return rankBuilder({ which: 'top', list: ui.rank.top, N, intro }) + `<div class="savebar ${ui.topSaved ? 'ok' : ''}">${ui.topSaved ? ic('check', 14) + ' Saved' : 'Saving...'}</div>`;
  }
  if (ev.phase === 'elimination') {
    const mine = S.me ? S.me.top : [];
    return `<section class="hero tight"><p class="eyebrow">${ic('lock', 14)} Locked</p><h1>Your Top ${N} is locked in</h1><p class="lead">The judges are choosing right now. Good luck!</p></section>
      ${mine.length ? `<ol class="slots ro">${mine.map((id, i) => `<li class="slot"><span class="n">${i + 1}</span>${av(id, 'sm')}<b>${esc(bbName(id))}</b></li>`).join('')}</ol>` : empty('predict', 'No Top ' + N + ' this time', 'You did not make a pick before the elimination started. You can still call every battle once the bracket is drawn.')}`;
  }
  // bracket / finished: the picker
  const picks = S.me ? S.me.picks : {};
  const R = rounds();
  if (ui.predRound >= R.length) ui.predRound = 0;
  const finalM = ev.matches.find((m) => m.r === R.length - 1 && !m.third);
  const champ = picks[finalM.id];
  const hits = S.me ? S.me.st.hits || 0 : 0;
  const open = ev.matches.filter((m) => m.r === ui.predRound && !m.third && !ev.locked[m.r] && m.status !== 'done').length;
  const tabs = R.map((r) => {
    const mine = ev.matches.filter((m) => m.r === r.r && !m.third && picks[m.id]).length, tot = ev.matches.filter((m) => m.r === r.r && !m.third).length;
    return `<button class="seg ${ui.predRound === r.r ? 'on' : ''}" data-a="predRound" data-r="${r.r}">${r.short}${ev.locked[r.r] ? ' ' + ic('lock', 12) : ` <small>${mine}/${tot}</small>`}</button>`;
  }).join('');
  const pts = ev.set.pts.pick * 2 ** ui.predRound;
  return `
    <section class="champpick card">
      <small>Your champion</small>
      ${champ && S.bb[champ] ? `<div class="cp">${av(champ, 'md')}<b>${esc(bbName(champ))}</b></div>` : '<div class="cp none"><b>Pick the final to choose your champion</b></div>'}
    </section>
    <div class="segs">${tabs}</div>
    <p class="muted center small">${ev.locked[ui.predRound] ? 'This round is locked.' : open ? `Tap a beatboxer to send them through. Each right call pays <b>${pts}</b> Loops.` : 'Nothing left to pick here.'}</p>
    ${bracket({ mode: 'pick', picks, only: ui.predRound })}
    ${hits ? `<p class="center muted small">${hits} right call${hits === 1 ? '' : 's'} so far</p>` : ''}`;
}
