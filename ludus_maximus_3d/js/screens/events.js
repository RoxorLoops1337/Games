// The Chronicle: everything that has happened to the ludus between fights. Log of weekly events with the choice you made and what it cost,
// threads still in motion (consequences due in later weeks), lingering conditions, and a codex of the deck. Sim in core/ext.js (LM.EVENTS, LM.evLog).
import { U, h, D, L, openScreen, sec, card, row, col, note, hint, kv, medal, pill, empty, chipRow } from './sk.js';
import { injectDepCss } from './wounds_ui.js';

const TAGS = { omen: ['Omens', 'star'], plot: ['Plots', 'skull'], rival: ['Rivals', 'sword'], patron: ['Patrons', 'coin'], luck: ['Luck', 'coin'], barracks: ['Barracks', 'roster'], coin: ['Coin', 'coin'], fame: ['Fame', 'fame'], memory: ['Memory', 'scroll'], infirmary: ['Healing', 'heart'] };
const st = { tag: 'all' };

export function render(ctx, root, draw) {
  injectDepCss(); root.classList.add('lx-dep'); const S = ctx.S, lm = L(), log = (S.evLog || []).slice().reverse();
  const ids = Object.keys(lm.EVENTS), seen = Object.keys(S.evHist || {}).filter((id) => lm.EVENTS[id]), threads = lm.evThreads(S), status = lm.evStatusList(S);
  root.append(card([row([medal('scroll', 'dark big'), col([h('div', 'ax-name', 'The Chronicle'), note('Between the fights, life in a ludus goes on: rumours, visitors, plots and favours. Many choices come back a few weeks later with interest. The log keeps what you chose and what it cost.')], 'ax-grow')]),
    h('div', 'ax-row ax-wrap', [pill(`${seen.length} of ${ids.length} stories met`, { tone: 'gold', ico: 'scroll' }), pill(`${threads.length} thread${threads.length === 1 ? '' : 's'} in motion`, { tone: threads.length ? 'warn' : '' }), pill(`${log.length} in the log`, {})])], 'gold'));
  if (status.length || (S.evFlags && S.evFlags.guarded)) {
    root.append(sec('In the air'));
    root.append(card([...status.map((x) => h('div', 'ax-kv', [h('span', '', x.id === 'plague' ? 'Sickness in the barracks' : x.id), pill(`${x.left} more week${x.left > 1 ? 's' : ''}`, { tone: 'bad' })])), S.evFlags && S.evFlags.guarded ? h('div', 'ax-kv', [h('span', '', 'The night watch is up'), pill('Guarded', { tone: 'good' })]) : null]));
  }
  if (threads.length) {
    root.append(sec('Threads in motion'));
    root.append(card([note('Something you did, or chose not to do, is still unfolding.'), ...threads.map((t) => h('div', 'dp-thread', [U.icon((TAGS[t.tag] || [0, 'scroll'])[1], 20), col([h('div', 'ax-b', t.n), h('div', 'ax-sub', t.in <= 0 ? 'Any day now.' : `In about ${t.in} week${t.in > 1 ? 's' : ''}.`)], 'ax-grow')]))]));
  }
  root.append(sec('The log'));
  const tags = ['all'].concat(Object.keys(TAGS).filter((t) => log.some((e) => e.tag === t)));
  root.append(chipRow(tags.map((t) => ({ id: t, label: t === 'all' ? 'All' : TAGS[t][0] })), st.tag, (id) => { st.tag = id; ctx.sfx('uiTap'); draw(); }));
  const shown = log.filter((e) => st.tag === 'all' || e.tag === st.tag);
  if (!shown.length) root.append(card([empty('scroll', 'Nothing yet', 'Events begin around the third week. About four weeks in ten bring one.')]));
  shown.slice(0, 40).forEach((e) => root.append(h('div', 'dp-log', [
    h('div', 'ax-row ax-wrap', [h('span', 't', e.n), pill(`Week ${e.wk}`, {}), e.tag && TAGS[e.tag] ? pill(TAGS[e.tag][0], { ico: TAGS[e.tag][1], tone: 'vio' }) : null, e.follow ? pill('Consequence', { tone: 'warn' }) : null]),
    h('div', 'c', `You chose: ${e.choice}`), h('div', 'r', e.r), e.fx && e.fx.length ? h('div', 'dp-fx', e.fx.map((f) => pill(f, { tone: /-\d|hurt|Strained|sickness|gone|\dw$|Barracks full/i.test(f) ? 'bad' : 'good' }))) : null])));
  root.append(sec('Codex'));
  const byTag = {}; ids.forEach((id) => { const E = lm.EVENTS[id], tg = (E.deck && E.deck.tag) || E.tag || 'coin'; (byTag[tg] = byTag[tg] || []).push(id); });
  const cx = h('div', 'ax-grid');
  Object.keys(byTag).forEach((tg) => {
    const l = byTag[tg], got = l.filter((id) => (S.evHist || {})[id] != null);
    cx.append(card([row([U.icon((TAGS[tg] || [0, 'scroll'])[1], 20), h('div', 'ax-b', (TAGS[tg] || [tg])[0]), pill(`${got.length}/${l.length}`, { tone: got.length === l.length ? 'good' : '' })]), ...l.map((id) => h('div', 'ax-sub' + ((S.evHist || {})[id] != null ? '' : ' dp-chk'), (S.evHist || {})[id] != null ? lm.EVENTS[id].n || id : '? ? ?'))]));
  });
  root.append(cx);
}
export function open(ctx, arg) {
  arg = arg || {}; const scr = openScreen(ctx, { title: 'Chronicle', wide: true, onClose: arg.onClose });
  const draw = () => scr.render((root) => render(ctx, root, draw)); draw(); scr.m.el.dataset.tutSheet = 'events'; return scr;
}
