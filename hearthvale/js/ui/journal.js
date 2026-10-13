// The journal: quests by chapter with a pinned tracker, and the achievements shelf with title equipping.
import { icon } from '../icons.js';
import { S, esc, store, cmd } from './state.js';
import { register } from './frame.js';
import { HINTS, pinnedQuest } from './hud.js';
import { toast, snd, pulse, sparkAt } from './fx.js';
import { QUESTS, ACHIEVEMENTS } from '../../shared/data.js';

const rewards = (r) => Object.entries(r).map(([k, n]) => `<span class="cc">${icon(k, 17)}${n}</span>`).join('');
const q5 = (f) => Math.round(f * 25) * 4;

register({
  id: 'quests', modal: true, tall: true, title: 'Journal', icon: 'quests', onOpen() { S.unseen.quest = 0; },
  sub: () => { const d = QUESTS.filter((q) => S.you.quests[q.id]).length; return `${d} of ${QUESTS.length} done`; },
  render() {
    const pin = pinnedQuest(), you = S.you; let h = '';
    if (pin) { const v = Math.min(pin.n, Math.floor(you.stats[pin.stat] || 0)); h += `<div class="sec nextup"><small class="lab">${icon('leaf', 16)} Up next</small><b class="big2">${esc(pin.text)}</b><div class="bar g sh"><i style="width:${q5(v / pin.n)}%"></i></div><div class="row sp"><span class="small">${v}/${pin.n}</span><span class="chips">${rewards(pin.reward)}</span></div><div class="hintline">${icon('hand', 18)} ${esc(HINTS[pin.id] || 'Keep going!')}</div></div>`; }
    else h += `<div class="sec done ctr"><b>${icon('star', 22)} Every quest is done! ${icon('star', 22)}</b><p class="small">You are a true Hearthvale legend.</p></div>`;
    for (const ch of [1, 2]) {
      const list = QUESTS.filter((q) => (q.ch || 1) === ch), done = list.filter((q) => you.quests[q.id]).length;
      h += `<div class="chap"><b>Chapter ${ch}: ${ch === 1 ? 'A Cozy Start' : 'Farms, Friends and Fortune'}</b><span class="small">${done}/${list.length}</span></div>`;
      h += list.map((q) => { const d = you.quests[q.id], v = Math.min(q.n, Math.floor(you.stats[q.stat] || 0)), cur = pin && pin.id === q.id;
        return `<div class="rowi sq quest ${d ? 'done' : ''} ${cur ? 'cur' : ''}">${d ? icon('check', 26) : '<span class="ring"></span>'}<div class="grow"><b>${esc(q.text)}</b>${d ? '' : `<div class="bar thin g"><i style="width:${q5(v / q.n)}%"></i></div>`}<div class="chips small">${rewards(q.reward)}${d ? '' : `<span class="muted">${v}/${q.n}</span>`}</div></div>${d ? '' : `<button class="b ${cur ? 'b-green' : 'b-cream'} small-b round pinb" data-a="pin" data-q="${q.id}" aria-label="Pin this quest" data-snd="tap2">${icon('leaf', 20)}</button>`}</div>`; }).join('');
    }
    return h;
  },
  act(a, el, S0, p, api) { if (a === 'pin') { store.set('pin', el.dataset.q); toast('Pinned to your screen!', { icon: 'leaf', type: 'good', key: 'pin', sound: false }); api.rerender(); } },
});

const CATS = [['all', 'All', 'trophy'], ['build', 'Build', 'hammer'], ['craft', 'Craft', 'pot'], ['gather', 'Gather', 'wood'], ['animals', 'Animals', 'paw'], ['gift', 'Gifts', 'gift'], ['project', 'Project', 'fountain'], ['charm', 'Charm', 'heart'], ['level', 'Levels', 'star'], ['valley', 'Valley', 'valley']];
register({
  id: 'achievements', modal: true, tall: true, title: 'Trophies', icon: 'trophy', onOpen() { S.unseen.ach = 0; },
  sub: () => `${ACHIEVEMENTS.filter((a) => S.you.ach[a.id] && S.you.ach[a.id][1]).length} of ${ACHIEVEMENTS.length}`,
  render(S0, p) {
    const f = p.cat || 'all', you = S.you; const list = ACHIEVEMENTS.filter((a) => f === 'all' || a.cat === f).map((a) => { const [pr, un] = you.ach[a.id] || [0, 0]; return { a, pr, un, frac: Math.min(1, pr / a.n) }; }).sort((x, y) => x.un - y.un || y.frac - x.frac);
    let h = `<div class="catrow" data-keep="cats">${CATS.map(([id, l, ic]) => `<button class="chipb ${f === id ? 'on' : ''}" data-a="cat" data-c="${id}" data-snd="tab">${icon(ic, 18)} ${l}</button>`).join('')}</div>`;
    h += `<div class="equip"><span class="small">Title:</span> <b>${you.title ? esc((ACHIEVEMENTS.find((a) => a.id === you.title) || {}).title || '') : 'none'}</b>${you.title ? `<button class="b b-cream small-b" data-a="untitle" data-snd="back">Clear</button>` : ''}</div>`;
    h += list.map(({ a, pr, un, frac }) => `<div class="rowi sq ach ${un ? 'got' : ''}"><span class="medal ${un ? 'on' : ''}">${icon(un ? 'medal' : 'lock', 34)}</span><div class="grow"><b>${esc(a.name)}</b><div class="small">${esc(a.desc)}</div>${un ? '' : `<div class="bar thin"><i style="width:${q5(frac)}%"></i></div><div class="small muted">${pr}/${a.n}</div>`}<div class="chips small">${rewards(a.reward)}${a.title ? `<span class="ttag">${icon('crown', 13)} ${esc(a.title)}</span>` : ''}</div></div>${un && a.title ? (you.title === a.id ? `<button class="b b-green small-b" data-a="untitle" data-snd="back">${icon('check', 16)} On</button>` : `<button class="b b-gold small-b" data-a="title" data-id="${a.id}" data-snd="confirm">Wear</button>`) : ''}</div>`).join('');
    return h;
  },
  act(a, el, S0, p, api) {
    if (a === 'cat') { p.cat = el.dataset.c; api.rerender(); }
    else if (a === 'title') { const r = cmd({ op: 'setTitle', id: el.dataset.id }); if (r.ok !== false) { snd('unlock'); sparkAt(el.getBoundingClientRect().left + 20, el.getBoundingClientRect().top, 8); } }
    else if (a === 'untitle') cmd({ op: 'setTitle', id: '' });
  },
});
