// Villager screens: the full list (hire, state, hunger, work button) and one villager's card with 8 skills and rename.
import { icon } from '../icons.js';
import { S, esc, cmd, myPub, canAfford, missing, goodName } from './state.js';
import { register } from './frame.js';
import { thumbHtml } from '../thumbs.js';
import { stateText, sendIdle } from './hud.js';
import { costHtml } from './build.js';
import { toast, snd, confetti, sparkAt } from './fx.js';
import { SKILLS, SKILL_XP } from '../../shared/data.js';

const SKILL_IC = { woodcutting: 'wood', mining: 'stone', farming: 'wheat', building: 'hammer', cooking: 'pot', studying: 'book', fishing: 'fish', herding: 'paw' };
const SKILL_NAME = { woodcutting: 'Woodcutting', mining: 'Mining', farming: 'Farming', building: 'Building', cooking: 'Cooking', studying: 'Studying', fishing: 'Fishing', herding: 'Herding' };
const hatOf = (id) => { const v = myPub().v.find((v) => v[0] === id); return v ? v[4] : id; };
const portrait = (v, cls = 'sm') => `<span class="th ${cls} por" style="--b1:#ffe6ef">${thumbHtml('v', hatOf(v.id), S.pub.color, 'worker', 34)}</span>`;
const topSkill = (v) => { let bi = 0; v.skx.forEach((x, i) => { if (x > v.skx[bi]) bi = i; }); return v.skx[bi] > 0 ? { i: bi, lv: v.skills[bi] } : null; };
const hungerBar = (v) => { const pct = Math.round(v.hunger / 10) * 10; return `<span class="mbar ${pct < 30 ? 'low' : ''}"><i style="width:${pct}%"></i></span>`; };

register({
  id: 'villagers', modal: true, title: 'My villagers', icon: 'players', tall: true,
  sub: () => `${S.you.villagers.length}/${S.you.housing} homes`,
  render() {
    const you = S.you, full = you.villagers.length >= you.housing;
    const why = full ? 'Build more Cottages to make room' : !canAfford(you.hire) ? 'Need ' + missing(you.hire).map(([k, n]) => n + ' more ' + goodName(k).toLowerCase()).join(', ') : '';
    let h = `<div class="sec"><div class="row sp"><div><b>Welcome a new villager</b><div class="small">Hungry villagers eat soup and work hard.</div></div><span class="chips">${costHtml(you.hire)}</span></div><button class="b b-green big w100 ${why ? 'off' : 'shine'}" data-a="hire" data-why="${esc(why)}" data-snd="hire">${icon('worker', 26)} Welcome!</button></div>`;
    h += you.villagers.map((v) => { const ts = topSkill(v); return `<div class="rowi sq vrow tap" data-a="open" data-id="${v.id}">${portrait(v)}<div class="grow"><b>${esc(v.name)}</b><div class="small st">${stateText(v)}</div><div class="vmeta">${hungerBar(v)}${ts ? `<span class="small sk">${icon(SKILL_IC[SKILLS[ts.i]], 14)} Lv ${ts.lv}</span>` : ''}</div></div>
      ${v.state === 'idle' ? `<button class="b b-gold small-b" data-a="work" data-id="${v.id}" data-snd="confirm">Work!</button>` : `<button class="b b-cream small-b round" data-a="stop" data-id="${v.id}" aria-label="Stop" data-snd="back">${icon('stop', 20)}</button>`}</div>`; }).join('');
    return h;
  },
  act(a, el, S0, p, api) {
    const id = +el.dataset.id;
    if (a === 'hire') { const r = cmd({ op: 'hire' }); if (r.ok !== false) { toast('A new villager joined!', { icon: 'worker', type: 'gold' }); confetti(innerWidth / 2, innerHeight * 0.5, 40, { cone: 2.6 }); } }
    else if (a === 'open') api.open('villager', { id }, el);
    else if (a === 'work') { sendIdle(id); }
    else if (a === 'stop') cmd({ op: 'recall', vid: id });
  },
});

register({
  id: 'villager', modal: true, title: (S0, p) => { const v = S.you.villagers.find((v) => v.id === p.id); return v ? esc(v.name) : 'Villager'; },
  icon: (S0, p) => { const v = S.you.villagers.find((v) => v.id === p.id); return v ? portrait(v, 'sm') : ''; },
  sub: (S0, p) => { const v = S.you.villagers.find((v) => v.id === p.id); return v ? stateText(v) : ''; },
  render(S0, p, tab, api) {
    const v = S.you.villagers.find((v) => v.id === p.id); if (!v) { setTimeout(() => api.close(), 0); return ''; }
    const pct = Math.round(v.hunger / 10) * 10;
    let h = `<div class="sec"><div class="row sp"><b>${icon('soup', 20)} Tummy</b><span class="small">${pct < 30 ? 'Getting hungry! Keep soup in stock.' : 'Eats soup automatically'}</span></div><div class="bar p"><i style="width:${pct}%"></i></div></div>`;
    h += `<div class="sec"><h4>${icon('star', 20)} Skills</h4><div class="skills">${SKILLS.map((nm, i) => {
      const lv = v.skills[i], xp = v.skx[i], lo = SKILL_XP[lv - 1], hi = SKILL_XP[lv], f = hi === undefined ? 1 : (xp - lo) / (hi - lo), cur = v.skill === i + 1;
      return `<div class="skill ${cur ? 'cur' : ''}"><span class="si">${icon(SKILL_IC[nm], 26)}</span><div class="grow"><div class="row sp"><b>${SKILL_NAME[nm]}</b><span class="stars">${Array.from({ length: 5 }, (_, k) => `<span class="${k < lv ? '' : 'dim'}">${icon('star', 13)}</span>`).join('')}</span></div><div class="bar thin ${cur ? 'g' : 'bb'}"><i style="width:${Math.round(f * 20) * 5}%"></i></div></div></div>`;
    }).join('')}</div><p class="small">Each level makes this skill work 8% faster.</p></div>`;
    h += `<div class="row"><button class="b b-cream grow" data-a="rename">${icon('pencil', 20)} Rename</button><button class="b b-cream grow" data-a="stop" data-snd="back">${icon('stop', 20)} Stop task</button><button class="b b-green grow" data-a="pick" data-snd="confirm">${icon('hand', 20)} Give a job</button></div>`;
    return h;
  },
  act(a, el, S0, p, api) {
    const v = S.you.villagers.find((v) => v.id === p.id); if (!v) return;
    if (a === 'rename') S.api.ask({ title: 'Name this villager', value: v.name, max: 12, ok: 'Save' }).then((n) => { if (n) { const r = cmd({ op: 'renameVillager', vid: v.id, name: n }); if (r.ok !== false) toast('Nice name, ' + n + '!', { icon: 'pencil', type: 'good' }); } });
    else if (a === 'stop') cmd({ op: 'recall', vid: v.id });
    else if (a === 'pick') { api.close(); S.selected = { k: 'vil', id: v.id, pid: S.myId }; toast('Now tap a tree, a field or a building', { icon: 'hand', type: 'gold', ms: 3500 }); }
  },
});
