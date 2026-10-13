// The build menu: category tabs, 3D thumbnail cards, cost chips that go red when short, lock reasons and NEW badges.
import { icon } from '../icons.js';
import { S, esc, store, BUILDINGS, CATS, catOf, have, missing, canAfford, goodName, myPub } from './state.js';
import { register, frameApi } from './frame.js';
import { thumbHtml, want } from '../thumbs.js';
import { startPlace } from './place.js';
import { TECH, FESTIVAL } from '../../shared/data.js';
import { toast } from './fx.js';

export const costHtml = (cost) => Object.entries(cost).map(([k, n]) => `<span class="cc ${have(k) < n ? 'bad' : ''}">${icon(k, 17)}${n}</span>`).join('');
const BCOL = { house: '#ffd9e2', farm: '#fff0b0', kitchen: '#ffd9e2', sawmill: '#e3ecf7', kiln: '#ffd9cf', storehouse: '#ffe6bd', study: '#d3ecfb', mill: '#fff0b0', bakery: '#ffe6bd', market: '#ffd9d9', coop: '#ffe6bd', barn: '#ffd9cf', dairy: '#e6f4ff', orchard: '#e1f7cf', dock: '#d8f0ff', pantry: '#ffe0ec', weavery: '#e6dcff' };
export const lockOf = (type) => { const d = BUILDINGS[type]; if (S.you.level < d.lvl) return { why: 'Reach village level ' + d.lvl, short: 'Level ' + d.lvl }; if (d.tech && !S.you.tech[d.tech]) return { why: 'Research ' + TECH[d.tech].name + ' in the Study first', short: TECH[d.tech].name }; return null; };
const festOn = () => !!(S.snap.valley.event && S.snap.valley.event.kind === 'festival');
export const costFor = (id) => { const d = BUILDINGS[id]; return d.decor && festOn() ? Object.fromEntries(Object.entries(d.cost).map(([k, n]) => [k, Math.ceil(n * FESTIVAL.decorOff)])) : d.cost; };
const countOf = (type) => S.you.buildings.filter((b) => b.type === type).length;
const limitOf = (type) => { const d = BUILDINGS[type]; return d.decor || d.field || type === 'house' ? 0 : 6; };
const blurb = (d) => d.housing ? `Homes for ${d.housing} villagers` : d.craft ? 'Makes ' + d.craft.join(', ') : d.animals ? 'Holds ' + d.animals.join(' and ') + 's' : d.fishing ? 'Catch fish' : d.crop ? 'Grows apples' : d.field ? 'Grows wheat' : d.market ? 'Sell goods for coins' : d.storage ? '+' + d.storage + ' storage' : d.decor ? '+' + d.decor + ' charm' : '';

register({
  id: 'build', modal: true, tall: true, title: 'Build', icon: 'hammer', defaultTab: 'homes',
  sub: () => `${icon('coins', 14)} ${S.you.coins}`,
  onOpen(S0, p) { p.tab = p.tab || store.get('buildtab', 'homes'); },
  onClose() { const seen = new Set(store.get('seenB', [])); for (const id of Object.keys(BUILDINGS)) if (!BUILDINGS[id].hidden && !lockOf(id)) seen.add(id); store.set('seenB', [...seen]); },
  onTab(S0, p, id) { store.set('buildtab', id); },
  tabs() {
    const seen = new Set(store.get('seenB', []));
    return CATS.map((c) => ({ id: c.id, label: c.label, icon: c.icon, pip: c.ids.filter((id) => BUILDINGS[id] && !lockOf(id) && !seen.has(id)).length || 0 }));
  },
  render(S0, p, tab) {
    const c = CATS.find((c) => c.id === tab) || CATS[0], seen = new Set(store.get('seenB', [])), color = myPub().color;
    const ids = c.ids.filter((id) => BUILDINGS[id] && !BUILDINGS[id].hidden).sort((a, b) => (!!lockOf(a) - !!lockOf(b)) || BUILDINGS[a].lvl - BUILDINGS[b].lvl);
    return `<div class="grid bgrid">${ids.map((id) => {
      const d = BUILDINGS[id], lock = lockOf(id), lim = limitOf(id), n = countOf(id), full = lim && n >= lim, cost = costFor(id), sale = d.decor && festOn(), short = !lock && !canAfford(cost);
      const isNew = !lock && !seen.has(id);
      const why = lock ? lock.why : full ? 'You have the most of these allowed (' + lim + ')' : short ? 'Need ' + missing(cost).map(([k, m]) => m + ' more ' + goodName(k).toLowerCase()).join(' and ') : '';
      return `<div class="card tap bcard ${lock ? 'lock' : ''} ${why ? 'off' : ''}" data-a="pick" data-b="${id}" data-why="${esc(why)}" data-short="${short ? missing(cost).map(([k]) => k).join(',') : ''}" data-snd="${why ? 'none' : 'tap2'}">
        ${isNew ? '<i class="badge-new">NEW</i>' : sale ? '<i class="badge-new sale">HALF PRICE</i>' : ''}
        <div class="th" style="--b1:${BCOL[id] || '#d9f3ff'}">${lock ? `<span class="lk">${icon('lock', 26)}</span>` : ''}${thumbHtml('b', id, color, id, 40)}</div>
        <div class="nm">${d.name}</div>
        <div class="small">${d.w}x${d.h}${lim ? ` - ${n}/${lim}` : n ? ` - ${n} built` : ''}</div>
        <div class="small bl">${esc(blurb(d))}</div>
        <div class="cost">${lock ? `<span class="lockline">${icon('lock', 15)} ${esc(lock.short)}</span>` : costHtml(cost)}</div>
      </div>`;
    }).join('')}</div>${c.id === 'decor' ? '<p class="small ctr">Decorations add charm. At 10 charm, visitors start dropping by!</p>' : ''}`;
  },
  bind() { for (const t of document.querySelectorAll('.bgrid [data-b]')) { /* thumbs are queued by render */ } },
  act(a, el) {
    if (a !== 'pick') return; const id = el.dataset.b; if (startPlace(id)) { /* sheet closes itself */ }
  },
});
