// Arena screen: weekly schedule (league and week tabs, fog of war, festivals), entry picker, withdraw, extra modes and glory.
import { U, h, D, L, fmt, openScreen, sec, card, row, col, note, hint, kv, medal, pill, goldPill, famePill, tabs, chipRow, meter, empty, actions, styleTag, styleBadge, pickFighters, confirmDialog } from './sk.js';
import { startPit, startHorde, startChamp, startBounty, pitState, hordeState, champState, bountyState } from './modes.js';
import { legendsSheet } from './legacy.js';

const KIND = {
  duel: { ico: 'sword', k: '#7a5222', label: 'Duel' },
  tourney: { ico: 'fame', k: '#5a1f5e', label: 'Tournament' },
  grand: { ico: 'star', k: '#a8780f', label: 'Grand Games' },
  team: { ico: 'shield', k: '#3e6a3a', label: 'Team clash' },
};
const st = { tab: 'sched', league: null, wk: 0 };
const GRADE_TIP = 'Letter grades compare a stat to the level average. Scouting level 2 shows exact numbers.';

export function open(ctx, arg) {
  const S = ctx.S, lm = L(); arg = arg || {};
  if (arg.tab) st.tab = arg.tab;
  if (arg.wk != null) st.wk = arg.wk; // the calendar opens the week you tapped
  if (st.league == null || arg.league != null) st.league = arg.league != null ? arg.league : lm.maxLeague(S);
  st.league = Math.min(st.league, D.LEAGUES.length - 1);
  const scr = openScreen(ctx, { title: 'The Arena', wide: true });
  const draw = () => scr.render((root) => {
    root.append(tabs([{ id: 'sched', label: 'Schedule', icon: 'arena' }, { id: 'modes', label: 'Challenges', icon: 'skull' }, { id: 'glory', label: 'Glory', icon: 'fame' }], st.tab, (id) => { st.tab = id; ctx.sfx('uiTap'); scr.scroller.scrollTop = 0; draw(); }));
    if (st.tab === 'sched') schedule(ctx, scr, root, draw); else if (st.tab === 'modes') modes(ctx, root, draw); else glory(ctx, root, draw);
  }, true);
  draw(); return scr;
}

// ------------------------------------------------------------------ schedule
function schedule(ctx, scr, root, draw) {
  activeDraw = draw;
  const S = ctx.S, lm = L(), ml = lm.maxLeague(S), lv = lm.scoutLevel(S), look = lm.lookahead(S);
  if (st.wk >= look) st.wk = 0;
  entriesCard(ctx, root, draw);
  root.append(actions([U.button({ label: 'Season calendar', icon: 'scroll', variant: 'ghost', onClick: () => ctx.open('world', { tab: 'calendar' }) }), U.button({ label: 'Rival ludi', icon: 'skull', variant: 'ghost', onClick: () => ctx.open('world', { tab: 'rivals' }) })]));
  root.append(chipRow(D.LEAGUES.map((Lg) => ({ id: Lg.id, label: Lg.n, lock: Lg.id > ml, tip: Lg.id > ml ? `Reach ${Lg.fame} fame to enter.` : Lg.d })), st.league, (id) => { st.league = id; ctx.sfx('uiTap'); draw(); }));
  if (look > 1) root.append(chipRow(Array.from({ length: look }, (_, i) => ({ id: i, label: i === 0 ? 'This week' : 'Week ' + (S.week + i), sub: lm.festival(S, S.week + i) ? '★' : '' })), st.wk, (id) => { st.wk = id; ctx.sfx('uiTap'); draw(); }));
  // scouting
  const sb = U.button({ label: 'Scout Tower', variant: 'ghost', icon: 'scroll', onClick: () => { const i = lm.plotOf(S, 'scout'); const e = S.plots.findIndex((p, k) => !p && k < S.rows * lm.COLS); if (i >= 0) ctx.open('building', { plot: i }); else if (e >= 0) ctx.open('building', { type: 'plot', i: e, empty: true }); else U.toast('No free plot. Buy land first.', { kind: 'bad' }); } });
  root.append(card([row([medal('scroll', 'dark'), col([h('div', 'ax-name', `Scouting level ${lv}`), note(`${lm.fogNote[lv]}. A taller Scout Tower reveals more and looks further ahead (now ${look} week${look > 1 ? 's' : ''}).`)], 'ax-grow')]), lm.spyActive(S) ? pill('A spy boosts scouting this week', { tone: 'good' }) : null, sb], ''));
  const week = S.week + st.wk, Lg = D.LEAGUES[st.league], fs = lm.festival(S, week);
  if (st.league > ml) { root.append(card([row([medal('lock', 'dark big'), col([h('div', 'ax-name', Lg.n), note(Lg.d), note(`Reach ${fmt(Lg.fame)} fame to enter. You have ${fmt(S.fame)}.`)], 'ax-grow')]), meter(S.fame, Lg.fame, 'var(--lx-gold)')], 'dim')); return; }
  if (fs) { const b = h('div', 'ax-banner', [medal('star', 'big'), col([h('div', 'ax-name', fs.n), h('div', '', fs.d)], 'ax-grow')]); b.style.setProperty('--k', fs.c); root.append(b); }
  const evs = lm.events(S, week, st.league);
  if (!evs.length) { root.append(empty('arena', 'No matches announced', 'Advance the week, or try a challenge.')); return; }
  const list = h('div', 'ax-grid'); evs.forEach((ev) => list.append(eventCard(ctx, ev, lv, draw))); root.append(list);
}

function entriesCard(ctx, root, draw) {
  const S = ctx.S, lm = L(), keys = Object.keys(S.entries).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  const items = keys.map((k) => ({ k, ev: lm.eventByKey(S, k), en: S.entries[k] })).filter((x) => x.ev);
  if (!items.length) return;
  const due = items.filter((x) => x.ev.week === S.week).length;
  const c = card([row([medal('check', 'dark'), col([h('div', 'ax-name', 'Your entries'), note(due ? `${due} fight${due > 1 ? 's' : ''} will be fought when you advance the week.` : 'Nothing is due this week.')], 'ax-grow')])], 'gold');
  items.forEach(({ k, ev, en }) => {
    const names = en.ids.map((id) => (ctx.gOf(id) || { name: '?' }).name).join(', ');
    const wd = U.button({ label: 'Withdraw', variant: 'ghost', onClick: () => withdraw(ctx, ev, draw) });
    c.append(row([col([h('div', 'ax-b', ev.title), h('div', 'ax-sub', `${ev.week === S.week ? 'This week' : 'Week ' + ev.week} · ${D.LEAGUES[ev.league].n} · ${names}`)], 'ax-grow'), wd], 'ax-wrap'));
  });
  root.append(c);
}

function withdraw(ctx, ev, draw) {
  const en = ctx.S.entries[ev.key]; const paid = en ? en.paid : 0;
  L().withdraw(ctx.S, ev.key); ctx.save(); ctx.refresh(); ctx.sfx('coin'); U.toast(`Entry withdrawn. Refunded ${fmt(paid)} gold.`, { kind: 'info', ico: 'coin' }); draw();
}

function eventCard(ctx, ev, lv, draw) {
  const S = ctx.S, lm = L(), m = KIND[ev.kind] || KIND.duel, en = S.entries[ev.key], wx = lm.weather(S, ev.key), rev = lm.isRevenge(S, ev);
  const head = h('div', 'ax-evh', [medal(m.ico), col([h('div', 'ax-evt', ev.title), h('div', 'ax-sub', `${m.label} · ${D.LEAGUES[ev.league].n}`)], 'ax-grow')]);
  head.style.setProperty('--k', m.k);
  const tags = h('div', 'ax-row ax-wrap ax-gap4');
  if (D.DIFF[ev.diff]) tags.append(pill(D.DIFF[ev.diff].n, { tone: ev.diff === 2 ? 'bad' : ev.diff === 1 ? 'warn' : 'good', tip: ev.diff === 2 ? 'A stronger opponent for a bigger purse.' : ev.diff === 0 ? 'A weaker opponent for a smaller purse.' : 'An even match.', tipTitle: D.DIFF[ev.diff].n + ' duel' }));
  if (ev.kind === 'team') tags.append(pill(`${ev.size}v${ev.size} team`, { ico: 'roster', tone: 'blue', tip: `Send ${ev.size} fighters. Mixed styles earn synergy bonuses, and fighters with a strong bond unlock a duo ultimate.`, tipTitle: 'Team clash' }));
  if (ev.kind === 'tourney' || ev.kind === 'grand') tags.append(pill(`${ev.size} fighters`, { ico: 'fame', tone: 'vio', tip: 'One fighter enters a knockout bracket. Wounds carry over between rounds.', tipTitle: 'Bracket' }));
  if (wx !== 'clear') tags.append(pill(D.WEATHER[wx].n, { tone: 'blue', tip: D.WEATHER[wx].d, tipTitle: 'Weather' }));
  if (rev) tags.append(pill('Revenge!', { tone: 'bad', tip: 'They beat you last time. Your fighters get a grudge bonus.' }));
  if (ev.opps.some((o) => o.gh)) tags.append(pill('Ghost', { tone: 'warn', tip: 'One of your own former champions, back as a rival.' }));
  const stale = lm.staleErr(S, ev.week);
  if (lv >= 2 && stale > 0) tags.append(pill(`Intel ${lm.weeksAhead(S, ev.week)}w old`, { tone: 'warn', tip: 'Rivals keep training. Real numbers may be higher. Scout again closer to the date.' }));
  const opps = h('div', ev.kind === 'tourney' || ev.kind === 'grand' ? 'ax-row ax-wrap ax-gap4' : 'ax-row ax-wrap');
  ev.opps.forEach((o, i) => opps.append(oppButton(ctx, ev, i, lv)));
  const rew = h('div', 'ax-row ax-wrap ax-gap4', [
    goldPill(ev.purse, 'Prize gold for the winner'), famePill(ev.fame),
    pill(`Fee ${fmt(ev.fee)}`, { tone: S.gold >= ev.fee ? '' : 'bad', tip: 'Paid when you enter. Refunded in full if you withdraw.', tipTitle: 'Entry fee' }),
    ev.loot ? pill('Pick 1 of 3 loot', { tone: 'good', tip: 'The winner chooses one prize from the Emperor\'s gift table.' }) : null,
  ]);
  const foot = h('div', 'ax-row ax-wrap');
  if (en) {
    foot.append(col([h('div', 'ax-b', 'ENTERED'), h('div', 'ax-sub', en.ids.map((id) => (ctx.gOf(id) || { name: '?' }).name).join(', '))], 'ax-grow'), U.button({ label: 'Withdraw', variant: 'ghost', onClick: () => withdraw(ctx, ev, draw) }));
  } else {
    foot.append(U.button({ label: 'Scout', variant: 'ghost', icon: 'scroll', onClick: () => dossier(ctx, ev, 0) }), h('span', 'ax-grow'), (() => { const eb = U.button({ label: 'Enter', variant: 'gold', icon: 'sword', onClick: () => enter(ctx, ev, lv, draw) }); eb.dataset.tut = 'enter'; if (ev.kind === 'duel') eb.dataset.tutKind = 'duel'; return eb; })());
  }
  return card([head, tags, opps, rew, foot], en ? 'gold' : ev.kind === 'grand' ? 'gold' : ev.kind === 'tourney' ? 'purple' : '');
}

function oppButton(ctx, ev, i, lv) {
  const o = ev.opps[i], S = D.STYLES[o.style], compact = ev.kind === 'tourney' || ev.kind === 'grand';
  const b = h('button', 'ax-opp' + (compact ? '' : ' big'), [styleBadge(o.style, compact ? 32 : 40), compact ? h('b', 'ax-num', `Lv ${o.lvl}`) : h('div', 'ax-grow', [h('div', 'ax-oname', o.name + (o.nick ? ' ' + o.nick : '')), h('small', '', `${S.n} · Level ${o.lvl}`)])]);
  b.type = 'button'; b.setAttribute('aria-label', `${o.name}, ${S.n}, level ${o.lvl}. Open intel.`); b.onclick = () => dossier(ctx, ev, i); return b;
}

// ------------------------------------------------------------------ opponent dossier (fog of war)
export function dossier(ctx, ev, idx0) {
  const S = ctx.S, lm = L(), lv = lm.scoutLevel(S); let idx = idx0 || 0;
  const scr = openScreen(ctx, { title: 'Intel', mid: true });
  const draw = () => scr.render((root) => {
    const o = ev.opps[idx], S0 = D.STYLES[o.style], counters = lm.counters(o.style);
    root.append(card([
      row([styleBadge(o.style, 64), col([h('div', 'ax-name', `${o.name}${o.nick ? ' ' + o.nick : ''}`), h('div', 'ax-sub', `${o.lud || o.ludus || ''}`), h('div', 'ax-row ax-wrap ax-gap4', [pill(`Level ${o.lvl}`, { tone: 'blue' }), pill(S0.n, { tip: S0.d, tipTitle: S0.n + ' · ' + S0.role }), o.gh ? pill('Ghost', { tone: 'warn' }) : null])], 'ax-grow')]),
      o.rv && S.rivals[o.rv] ? note(`Your record against them: ${S.rivals[o.rv].w}W ${S.rivals[o.rv].l}L`) : null,
      h('div', 'ax-row ax-wrap', [h('span', 'ax-sub', 'Slight edge on'), ...S0.beats.map((b) => styleTag(b, 30)), h('span', 'ax-sub', 'Slight risk vs'), ...counters.map((b) => styleTag(b, 30))]),
    ]));
    if (o.gh) root.append(hint('One of your own former champions, back as a rival. They keep their old techniques and tricks.'));
    root.append(sec(`Intel (scouting ${lv})`));
    const stats = h('div', 'ax-grid s');
    const wk = ev.week, err = lm.staleErr(S, wk);
    D.STATS.forEach((s) => {
      const val = lv < 1 ? '?' : lv === 1 ? lm.grade(o.st[s], o.lvl) : (err > 0 ? '~' : '') + Math.floor(lm.scoutVal(S, wk, o.st[s]));
      const t = h('div', 'ax-row', [h('span', 'ax-pill', D.SA[s]), h('b', 'ax-grow ax-num', val)]); t.firstChild.style.cssText = `background:${D.SC[s]};color:#fff;box-shadow:none;min-width:48px;justify-content:center`;
      U.tooltip(t, lv < 2 ? GRADE_TIP : D.SN[s], { title: D.SN[s] }); t.tabIndex = 0; stats.append(t);
    });
    root.append(stats);
    if (lv < 1) root.append(note('Build or upgrade the Scout Tower to learn their stats, traits and gear.'));
    else {
      root.append(card([h('div', 'ax-b', `${D.TRAITS[o.trait].n}`), note(D.TRAITS[o.trait].d)]));
      if (lv === 1) root.append(note('Scouting level 2 reveals exact numbers, gear and win odds.'));
    }
    if (lv >= 2) {
      if (err > 0) root.append(hint(`Intel is ${lm.weeksAhead(S, wk)} week(s) old. Rivals keep training: real numbers may be up to ${Math.round(err * 100)}% higher. Scout again closer to the date.`));
      root.append(h('div', 'ax-row ax-wrap ax-gap4', o.techs.map((t) => pill(D.TECHS[t].n, { tone: 'vio', tip: D.TECHS[t].d, tipTitle: 'Technique' }))));
      root.append(note(`Ultimates: ${lm.ultsOf(o).map((x) => D.ULTS[x].n).join(', ')}. Rune: ${D.KEYSTONES[o.rune.k].n}${lv >= 3 && o.mast.length ? '. Masteries: ' + o.mast.map((m) => D.MASTS[m].n).join(', ') : ''}.`));
      const gear = h('div', 'ax-col ax-gap4');
      D.SLOTS.forEach((sl) => { const it = o.gear[sl]; if (!it) return; const r = pill(D.SLOT_NAME[sl], {}); r.style.background = D.RAR[it.rar].c; r.style.color = '#fff'; gear.append(row([r, h('span', 'ax-grow', it.name + (lv >= 3 && it.af.length ? ' (' + it.af.map((a) => D.AFFIX[a.id].n).join(', ') + ')' : ''))], 'ax-wrap')); });
      root.append(gear);
      if (lv >= 3) { const d = lm.derive(o, { noperf: true }); root.append(card([kv('HP / ATK / DEF', `${Math.round(d.hp)} / ${Math.round(d.atk)} / ${Math.round(d.def)}`), kv('SPD / CRIT / EVA', `${Math.round(d.spd)} / ${Math.round(d.crit * 100)}% / ${Math.round(d.eva * 100)}%`), d.sets.length ? note('Sets: ' + d.sets.map((x) => D.SETS[x.id].n + ' ' + x.n + 'pc').join(', ')) : null])); }
    }
    if (ev.opps.length > 1) {
      root.append(sec('Others in this event'));
      const w = h('div', 'ax-row ax-wrap ax-gap4');
      ev.opps.forEach((x, i) => { const b = h('button', 'ax-opp' + (i === idx ? ' on' : ''), [styleBadge(x.style, 30), h('b', 'ax-num', `Lv ${x.lvl}`)]); b.type = 'button'; b.setAttribute('aria-label', `${x.name}, ${D.STYLES[x.style].n}`); if (i === idx) b.style.boxShadow = 'inset 0 0 0 2px var(--lx-gold)'; b.onclick = () => { idx = i; ctx.sfx('uiTap'); draw(); scr.scroller.scrollTop = 0; }; w.append(b); });
      root.append(w);
    }
    root.append(note('Style matchups give a small edge only. Fights are decided by stats, gear, runes, augments and how well you time your ultimates.'));
    if (!S.entries[ev.key]) root.append(U.button({ label: 'Enter this event', variant: 'gold', icon: 'sword', block: true, onClick: () => { scr.close(); enterFromDossier(ctx, ev); } }));
  }, false);
  draw(); return scr;
}
let activeDraw = null;
function enterFromDossier(ctx, ev) { enter(ctx, ev, L().scoutLevel(ctx.S), activeDraw || (() => {})); }

// ------------------------------------------------------------------ entering an event
async function enter(ctx, ev, lv, draw) {
  activeDraw = draw;
  const S = ctx.S, lm = L(), n = lm.teamSize(ev), bracket = ev.kind === 'tourney' || ev.kind === 'grand';
  const net = (g) => ev.opps.reduce((a, o) => a + lm.adv(g.style, o.style), 0);
  const intro = col([
    h('div', 'ax-row ax-wrap', ev.opps.slice(0, 8).map((o) => h('div', 'ax-row ax-gap4', [styleTag(o.style, 30), h('b', 'ax-num', `Lv ${o.lvl}`)]))),
    note(n > 1 ? `Pick ${n} fighters. Style fit and bonds matter.` : bracket ? 'Pick your champion. Wounds carry over between bracket rounds.' : 'Pick your fighter.'),
  ]);
  const ids = await pickFighters(ctx, {
    title: ev.title, intro, n,
    info(g) {
      if (g.inj > 0) return { reason: `Injured ${g.inj}w` };
      if (lm.busy(S, g, ev.week)) return { reason: 'Entered elsewhere that week' };
      const badges = []; const a = net(g);
      badges.push(a > 0 ? pill('Style edge', { tone: 'good', tip: 'Their styles are weak against yours: a small edge (+10%).', tipTitle: 'Style fit' }) : a < 0 ? pill('Style risk', { tone: 'bad', tip: 'Some of their styles counter yours: a small disadvantage.', tipTitle: 'Style fit' }) : pill('Even styles', { tip: 'No style advantage either way.', tipTitle: 'Style fit' }));
      if (g.en < 60) badges.push(pill('Tired', { tone: 'warn', tip: 'Energy under 60 lowers stats in the fight. Let them rest first.' }));
      let right = null;
      if (ev.kind === 'duel') {
        const p = lm.odds(S, [g], ev.opps, 'bal'), stale = lm.weeksAhead(S, ev.week) > 0 && lv < 3, pp = stale ? Math.round(p * 10) / 10 : p;
        const txt = lv >= 2 ? (pp !== p ? '~' : '') + Math.round(pp * 100) + '%' : lv === 1 ? (p > 0.6 ? 'Fav' : p < 0.4 ? 'Dog' : 'Even') : '?';
        right = h('div', 'ax-odds', [txt, h('small', '', 'win')]); U.tooltip(right, lv >= 2 ? 'Estimated win chance with the balanced plan.' : lv === 1 ? 'Favoured or underdog. Scouting level 2 shows the percentage.' : 'Build a Scout Tower to see odds.', { title: 'Win odds' });
      }
      return { badges, right };
    },
    footer(sel) {
      if (n < 2) return null;
      if (sel.length < n) return hint('Mixed styles earn team synergy. Fighters with a bond of 60 or more unlock a duo ultimate.');
      const tc = lm.teamCtx(S, sel, 'bal'), dp = lm.duoPair(S, sel), p = lv >= 2 ? lm.odds(S, sel, ev.opps, 'bal', 24) : null;
      return card([h('div', 'ax-name', 'Team synergy'), tc.list.length ? col(tc.list.map((s) => h('div', '', [h('b', '', s.n + ': '), s.d]))) : note('No style combo. Mix styles for bonuses.'),
        dp ? pill(`Duo: ${D.DUOS[dp.kind].n}`, { tone: 'good', tip: D.DUOS[dp.kind].d, tipTitle: 'Duo ultimate' }) : note('No duo ultimate yet. Train and spar together to raise their bond.'),
        p != null ? pill(`Win chance ${Math.round(p * 100)}%`, { tone: 'gold' }) : null], 'gold');
    },
    confirm() { const short = ev.fee - S.gold; return { label: `Enter for ${fmt(ev.fee)} gold`, disabled: short > 0, sub: short > 0 ? `Need ${fmt(short)} more gold` : undefined }; },
  });
  if (!ids) return;
  const e = lm.enter(S, ev, ids.slice(), 'bal');
  if (e) { ctx.sfx('uiError'); U.toast(e, { kind: 'bad' }); return; }
  ctx.save(); ctx.refresh(); ctx.sfx('uiConfirm'); U.toast('Entered! See you on games day.', { kind: 'good', ico: 'check' }); if (draw) draw();
}

// ------------------------------------------------------------------ challenges
function modeCard({ ico, title, tone, text, chips, btns, locked }) {
  return card([row([medal(ico, 'dark big'), col([h('div', 'ax-name', title), note(text)], 'ax-grow')]), chips && chips.length ? h('div', 'ax-row ax-wrap ax-gap4', chips) : null, actions(btns)], tone + (locked ? ' dim' : ''));
}

function modes(ctx, root, draw) {
  const S = ctx.S, lm = L(), pit = pitState(ctx), hd = hordeState(ctx), ch = champState(ctx), bo = bountyState(ctx);
  const mutW = lm.mutator('w' + S.week), mutD = lm.mutator('d' + lm.dayKey());
  root.append(hint('Challenges are single-fighter runs. Each costs 30 energy and counts towards your weekly goals.'));
  root.append(modeCard({
    ico: 'skull', title: 'Pit of Trials', tone: 'red', text: 'One fighter descends. Wounds carry over and you pick an augment before every floor. Cash out or push deeper; a boss waits on every 5th floor.',
    chips: [pill(`Best floor ${S.pitBest || 0}`, { tone: 'gold' }), pill(`Daily best ${S.dailyBest || 0}`, { tone: 'vio', tip: 'Daily Descent: the same opponents and augment offers for everyone today. Resets at midnight UTC.', tipTitle: 'Daily Descent' }),
      pill(`This week: ${mutW.n}`, { tone: 'warn', tip: mutW.d, tipTitle: 'Mutator' }), pill(`Daily: ${mutD.n}`, { tone: 'warn', tip: mutD.d, tipTitle: 'Mutator' })],
    btns: [U.button({ label: pit.used ? 'Done this week' : 'Descend', variant: 'danger', icon: 'skull', disabled: pit.used, onClick: () => startPit(ctx, false) }),
      U.button({ label: pit.dailyDone ? 'Daily done' : 'Daily', variant: 'bronze', icon: 'star', disabled: pit.dailyDone, onClick: () => startPit(ctx, true) })],
  }));
  root.append(modeCard({
    ico: 'roster', title: 'Horde Trial', tone: 'purple', text: 'One fighter against growing packs of weaker foes, up to five at once. Retreat after any wave to keep the rewards; defeat keeps 60%.',
    chips: [pill(`Best wave ${S.hordeBest || 0}`, { tone: 'gold' })], btns: [U.button({ label: hd.used ? 'Done this week' : 'Face them', variant: 'danger', icon: 'sword', disabled: hd.used, onClick: () => startHorde(ctx) })],
  }));
  root.append(modeCard({
    ico: 'fame', title: S.rowner ? `${S.rowner.name}'s champion` : 'Champion duel', tone: 'gold', text: ch.ok ? 'A single duel against a stronger foe. Win and the rival owner is humbled.' : ch.why,
    chips: S.rowner ? [pill(`Rival leads ${S.rowner.w} to ${S.rowner.l}`, { tone: S.rowner.w >= 3 ? 'bad' : '', tip: 'The rival owner sends a champion once they have 3 wins.' })] : [],
    btns: [U.button({ label: ch.ok ? 'Challenge' : 'Not available', variant: 'gold', icon: 'sword', disabled: !ch.ok, onClick: () => startChamp(ctx) })], locked: !ch.ok,
  }));
  root.append(modeCard({
    ico: 'scroll', title: 'Bounty board', tone: 'green', text: bo.ok ? 'A wanted outlaw fights one duel for the purse. Once a week.' : bo.why,
    chips: [pill(`Claimed ${S.stats.bounties || 0}`, { tone: 'gold' }), S.bountyBonus === S.week ? pill('Double purse', { tone: 'good' }) : null],
    btns: [U.button({ label: bo.ok ? 'Take the bounty' : 'Not available', variant: 'gold', icon: 'sword', disabled: !bo.ok, onClick: () => startBounty(ctx) })], locked: !bo.ok,
  }));
}

// ------------------------------------------------------------------ glory
function glory(ctx, root, draw) {
  const S = ctx.S, lm = L();
  // weekly goals
  const goals = lm.weeklyGoals(S);
  root.append(sec('Weekly goals'));
  root.append(card([...goals.map((g) => row([pill(g.done ? 'Done' : g.p, { tone: g.done ? 'good' : '', ico: g.done ? 'check' : undefined }), h('span', 'ax-grow', g.t)])),
    note(`Each goal pays ${lm.goalPay(S)} gold at week end.${S.goalStreak ? ` Streak: ${S.goalStreak} week${S.goalStreak > 1 ? 's' : ''}.` : ''}`)]));
  // ladder
  const lw = lm.ladderWins(S), nx = lm.LADDER.find((t) => lw < t.n), prev = lm.LADDER.filter((t) => lw >= t.n).pop();
  root.append(sec('Season ladder'));
  root.append(card([row([medal('star', 'dark'), col([h('div', 'ax-name', `${lw} win${lw === 1 ? '' : 's'} this season`), note(nx ? `Next reward at ${nx.n} wins: ${nx.gold} gold, ${nx.fame} fame.` : 'All ladder rewards claimed!')], 'ax-grow')]),
    nx ? meter(lw - (prev ? prev.n : 0), nx.n - (prev ? prev.n : 0), 'var(--lx-gold)') : null,
    h('div', 'ax-row ax-wrap ax-gap4', lm.LADDER.map((t) => pill(`${t.n} wins`, { ico: lw >= t.n ? 'check' : undefined, tone: lw >= t.n ? 'good' : '', tip: `${t.gold} gold and ${t.fame} fame` })))]));
  // rival owner + forum
  root.append(sec('Rival owner'));
  const forum = (S.forum || []).slice().reverse();
  const fb = U.button({ label: 'Open the Forum', variant: 'bronze', icon: 'scroll', onClick: () => forumSheet(ctx) });
  root.append(card([row([medal('skull', 'dark'), col([h('div', 'ax-name', S.rowner ? S.rowner.name : 'No rival yet'), note(S.rowner ? `They lead ${S.rowner.w} to ${S.rowner.l}. They boast in the forum when they win.` : 'A rival owner appears after your next fight.')], 'ax-grow')]),
    forum.length ? col(forum.slice(0, 3).map((x) => row([pill('Wk ' + x.w, {}), h('span', 'ax-grow ax-sub', x.t)]))) : note('The forum is quiet. Play a week.'), fb]));
  // hall
  const slots = Math.round(lm.bfx(S, 'hall').v);
  root.append(sec('Hall of Legends'));
  root.append(card([row([medal('fame', 'dark'), col([h('div', 'ax-name', `${(S.legends || []).length} legend${(S.legends || []).length === 1 ? '' : 's'}`), note(`${slots} statue slot${slots === 1 ? '' : 's'}. Each active legend gives +1.5% training to all and +3% to their best stat.`)], 'ax-grow')]), U.button({ label: 'Open the Hall', variant: 'bronze', icon: 'fame', onClick: () => legendsSheet(ctx) })]));
}

export function forumSheet(ctx) {
  const scr = openScreen(ctx, { title: 'The Forum', mid: true });
  const log = (ctx.S.forum || []).slice().reverse();
  scr.render((root) => {
    if (!log.length) { root.append(empty('scroll', 'No news yet', 'Play a week and the Forum will talk.')); return; }
    log.forEach((x) => root.append(card([row([pill('Week ' + x.w, { tone: 'gold' }), h('span', 'ax-grow', x.t)])])));
  });
}
