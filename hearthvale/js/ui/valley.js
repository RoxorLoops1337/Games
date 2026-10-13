// The Valley screen: Orders, the Great Project, the travelling Merchant and Players (leaderboard, gifts, emotes).
import { icon } from '../icons.js';
import { S, esc, fmt, store, cmd, coinFrom, have, goodName, GOOD, GOODS, SELL } from './state.js';
import { register } from './frame.js';
import { thumbHtml } from '../thumbs.js';
import { toast, snd, ui, haptic, confetti, sparkAt, floatOver, flyTo, pulse } from './fx.js';
import { VALLEY_FIELDS, VALLEY_LEVEL_XP, PROJECT_STAGES, FESTIVAL, MERCHANT, VISITOR_NAMES } from '../../shared/data.js';

const q5 = (f) => Math.round(f * 25) * 4;
const rewardHtml = (r) => Object.entries(r).map(([k, n]) => `<span class="cc">${icon(k === 'xp' ? 'star' : k, 17)}${n}${k === 'xp' ? ' xp' : ''}</span>`).join('');

register({
  id: 'valley', modal: true, wide: true, tall: true, title: 'The Valley', icon: 'valley', defaultTab: 'orders',
  sub: () => `Valley level ${S.snap.valley.level}`,
  onOpen(S0, p) { p.tab = p.tab || store.get('valleytab', 'orders'); if (p.tab === 'project') store.set('projseen', Date.now()); if (p.tab === 'merchant') S.unseen.merchant = false; },
  onTab(S0, p, id) { store.set('valleytab', id); if (id === 'project') store.set('projseen', Date.now()); if (id === 'merchant') S.unseen.merchant = false; },
  tabs() {
    const V = S.snap.valley, mer = V.merchant && V.merchant.until > S.snap.t, P = V.project;
    return [{ id: 'orders', label: 'Orders', icon: 'scrolls', pip: V.orders.filter((o) => !o.done && Object.keys(o.need).some((g) => o.got[g] < o.need[g] && have(g) > 0)).length || 0 },
      { id: 'project', label: 'Project', icon: 'fountain', pip: 0 }, { id: 'merchant', label: 'Merchant', icon: 'merchant', pip: mer && S.unseen.merchant ? true : 0 }, { id: 'players', label: 'Players', icon: 'players', pip: 0 }];
  },
  render(S0, p, tab) { return tab === 'project' ? project(p) : tab === 'merchant' ? merchant() : tab === 'players' ? players(p) : orders(); },
  act(a, el, S0, p, api) {
    if (a === 'give') { const o = S.snap.valley.orders.find((o) => o.id == el.dataset.o), g = el.dataset.g; if (!o) return; coinFrom(el); const n = Math.min(o.need[g] - o.got[g], have(g)); const r = cmd({ op: 'contribute', id: o.id, res: g, n }); if (r.ok !== false) { snd('coin', { vol: 0.7 }); haptic(12); flyTo(el.getBoundingClientRect ? { x: el.getBoundingClientRect().left + 20, y: el.getBoundingClientRect().top + 10 } : null, document.querySelector('#tools #tQuests'), { icon: g, n: Math.min(4, 1 + Math.floor(n / 10)), size: 22, trail: '#8fd3f4' }); } }
    else if (a === 'field') { cmd({ op: 'assign', k: 'valley', id: el.dataset.f }); toast('A villager heads to the field', { icon: 'worker', type: 'good', key: 'vf', sound: false }); api.close(); S.view.focus(0, 0, 40); }
    else if (a === 'pgive') {
      const g = el.dataset.g, P = S.snap.valley.project, need = P.need[g] - (P.got[g] || 0), m = el.dataset.n, n = Math.min(need, have(g), m === 'all' ? 1e9 : +m); if (n < 1) return;
      const r = cmd({ op: 'projectGive', res: g, n }); if (r.ok !== false) { snd('reward', { vol: 0.8 }); haptic(16); const rc = el.getBoundingClientRect(); floatOver(el, '+' + n, 'fl-good'); sparkAt(rc.left + rc.width / 2, rc.top, 8); const hero = document.querySelector('.phero'); if (hero) { pulse(hero, 1.06, 400); flyTo({ x: rc.left + rc.width / 2, y: rc.top }, hero, { icon: g, n: Math.min(5, 1 + Math.floor(n / 8)), size: 24, trail: '#ffd54a' }); } }
    }
    else if (a === 'trade') { const i = +el.dataset.i; const r = cmd({ op: 'merchantTrade', i }); if (r.ok !== false) { coinFrom(el); snd('cashRegister'); haptic([10, 30, 16]); const rc = el.getBoundingClientRect(); confetti(rc.left + rc.width / 2, rc.top, 26, { cone: 2.4, power: 0.7 }); const o = S.snap.valley.merchant.offers[i]; if (o) { toast(`Traded for ${o.get.n} ${goodName(o.get.res).toLowerCase()}!`, { icon: o.get.res, type: 'gold' }); flyTo({ x: rc.left + rc.width / 2, y: rc.top }, document.querySelector(o.get.res === 'coins' ? '#pCoins' : o.get.res === 'scrolls' ? '#pScrolls' : '#strip'), { icon: o.get.res, n: 4 }); } } }
    else if (a === 'visit') { S.view.focusVillage(el.dataset.p, 26); api.close(); }
    else if (a === 'giftopen') { p.gift = p.gift && p.gift.to === el.dataset.p ? null : { to: el.dataset.p, res: null, n: 5 }; api.rerender(); }
    else if (a === 'giftres') { p.gift.res = el.dataset.g; api.rerender(); }
    else if (a === 'giftn') { p.gift.n = +el.dataset.n; api.rerender(); }
    else if (a === 'giftsend') { const g = p.gift; if (!g || !g.res) return; const n = Math.min(g.n, have(g.res)); const r = cmd({ op: 'gift', to: g.to, res: g.res, n }); if (r.ok !== false) { snd('giftSent'); haptic(14); const rc = el.getBoundingClientRect(); sparkAt(rc.left + rc.width / 2, rc.top, 10, ['#ff9db3', '#fff', '#ffd54a']); toast(`Gift sent! ${n} ${goodName(g.res).toLowerCase()}`, { icon: 'gift', type: 'pink' }); p.gift = null; api.rerender(); } }
    else if (a === 'sort') { p.sort = el.dataset.s; api.rerender(); }
    else if (a === 'emote') { cmd({ op: 'emote', e: el.dataset.e }); snd('giggle', { vol: 0.6 }); }
  },
});

// ---------- orders ----------
function orders() {
  const V = S.snap.valley, lo = VALLEY_LEVEL_XP[V.level - 1], hi = VALLEY_LEVEL_XP[V.level] || lo + 1, ev = V.event, nx = V.next;
  let h = `<div class="sec"><div class="row sp"><b>${icon('valley', 22)} Valley level ${V.level}</b><span class="small">${V.xp - lo}/${hi - lo} xp</span></div><div class="bar bb sh"><i style="width:${q5(Math.min(1, (V.xp - lo) / (hi - lo)))}%"></i></div><p class="small">Everyone fills these orders together. Rewards are shared by how much you give.</p></div>`;
  h += `<div class="fieldsrow">${V.fields.map((f) => { const d = VALLEY_FIELDS.find((x) => x.id === f.id); return `<button class="fieldchip tap" data-a="field" data-f="${f.id}" data-snd="confirm"><span class="th sm" style="--b1:${GOOD[d.res].tint}">${icon(d.res, 28)}</span><b>${Math.round(f.stock / 10) * 10}</b><small>${d.name}</small></button>`; }).join('')}</div>`;
  h += `<div class="evrow">${ev ? `<div class="evcard on">${icon('festival', 26)}<div><b>Festival is on!</b><div class="small"><span class="cd" data-t="${ev.until}"></span> left - bonus orders worth 1.5x</div></div></div>` : `<div class="evcard">${icon('festival', 26)}<div><b>Next festival</b><div class="small">in <span class="cd" data-t="${nx.festival}"></span></div></div></div>`}</div>`;
  h += V.orders.map((o) => {
    const mine = o.contrib && o.contrib[S.myId];
    return `<div class="sec order ${o.done ? 'done' : ''}">${o.fest ? '<i class="ribbon">FESTIVAL</i>' : ''}<div class="row sp"><b>${icon('scrolls', 22)} Order #${o.id}</b>${o.done ? `<b class="okk">${icon('check', 20)} Done!</b>` : ''}</div>
      ${Object.keys(o.need).map((g) => { const left = o.need[g] - o.got[g], f = o.got[g] / o.need[g], mineN = have(g); const why = !mineN ? 'You have no ' + goodName(g).toLowerCase() + ' yet' : '';
        return `<div class="need"><span class="th sm" style="--b1:${GOOD[g].tint}">${icon(g, 26)}</span><div class="grow"><div class="row sp"><b>${goodName(g)}</b><span class="small">${o.got[g]}/${o.need[g]}</span></div><div class="bar p"><i style="width:${q5(f)}%"></i></div></div>${o.done || left <= 0 ? `<span class="okk">${icon('check', 22)}</span>` : `<button class="b b-gold small-b ${why ? 'off' : ''}" data-a="give" data-o="${o.id}" data-g="${g}" data-why="${esc(why)}" data-snd="none">Give${mineN ? ' ' + Math.min(left, mineN) : ''}</button>`}</div>`; }).join('')}
      <div class="reward"><span>Reward</span>${rewardHtml(o.reward)}${mine ? `<span class="you">you gave ${mine}</span>` : ''}</div></div>`;
  }).join('');
  return h;
}

// ---------- the Great Project ----------
function project(p) {
  const P = S.snap.valley.project, done = P.stage >= P.max, st = PROJECT_STAGES[Math.min(P.stage, P.max - 1)];
  const needKeys = Object.keys(P.need), got = needKeys.reduce((a, g) => a + Math.min(P.got[g] || 0, P.need[g]), 0), tot = needKeys.reduce((a, g) => a + P.need[g], 0), f = done ? 1 : tot ? got / tot : 0;
  const shown = Math.min(5, P.stage);
  let h = `<div class="phero"><div class="th lg pth" style="--b1:#d9f3ff">${thumbHtml('m', shown, '', 'fountain', 70)}</div><div class="pinfo"><small>${done ? 'Finished!' : 'Stage ' + (P.stage + 1) + ' of ' + P.max}</small><b class="pname">${esc(done ? 'The Great Tree of Hearthvale' : P.name)}</b><div class="bar g sh"><i style="width:${q5(f)}%"></i></div><small>${done ? 'Thank you, everyone!' : Math.round(f * 100) + '% of the goods are in'}</small></div></div>`;
  if (!done) {
    h += `<div class="sec"><div class="row sp"><b>${icon('gift', 20)} Goods needed</b><span class="small">Your points: <b>${S.you.project.pts}</b> (all-time ${S.you.project.total})</span></div>`;
    h += needKeys.map((g) => { const gv = P.got[g] || 0, need = P.need[g], left = need - gv, mine = have(g), why = left <= 0 ? '' : !mine ? 'You have no ' + goodName(g).toLowerCase() + ' right now' : '';
      return `<div class="need"><span class="th sm" style="--b1:${GOOD[g].tint}">${icon(g, 26)}</span><div class="grow"><div class="row sp"><b>${goodName(g)}</b><span class="small">${gv}/${need} - you have ${mine}</span></div><div class="bar ${left <= 0 ? 'g' : 'p'}"><i style="width:${q5(Math.min(1, gv / need))}%"></i></div></div>${left <= 0 ? `<span class="okk">${icon('check', 22)}</span>` : `<div class="gives"><button class="b b-gold small-b ${why ? 'off' : ''}" data-a="pgive" data-g="${g}" data-n="1" data-why="${esc(why)}" data-snd="coin">+1</button><button class="b b-gold small-b ${why ? 'off' : ''}" data-a="pgive" data-g="${g}" data-n="10" data-why="${esc(why)}" data-snd="coin">+10</button><button class="b b-green small-b ${why ? 'off' : ''}" data-a="pgive" data-g="${g}" data-n="all" data-why="${esc(why)}" data-snd="coin">All</button></div>`}</div>`; }).join('');
    h += `<div class="perk">${icon('sparkle', 20)} <span>Reward for all villages: ${rewardHtml(st.reward)}</span></div></div>`;
  }
  h += `<div class="sec"><h4>${icon('crown', 22)} Top builders</h4>${P.top.length ? P.top.slice(0, 10).map((t, i) => `<div class="lbrow ${t.id === S.myId ? 'me' : ''}"><span class="rank r${i}">${i < 3 ? icon(['crown', 'medal', 'medal'][i], 22) : i + 1}</span><b class="grow">${esc(t.name)}</b><span class="small">${fmt(t.pts)} pts</span></div>`).join('') : '<p class="small">Nobody has given yet. Be the first!</p>'}</div>`;
  h += `<div class="sec"><h4>${icon('trophy', 22)} The five stages</h4><div class="stages">${PROJECT_STAGES.map((s, i) => { const state = P.stage > i ? 'built' : P.stage === i ? 'now' : 'lock'; return `<div class="stage ${state}"><span class="sn">${state === 'built' ? icon('check', 22) : state === 'lock' ? icon('lock', 20) : i + 1}</span><div class="grow"><b>${s.name}</b><div class="small">${icon('sparkle', 13)} ${esc(s.perk)}</div></div></div>`; }).join('')}</div></div>`;
  return h;
}

// ---------- merchant ----------
function merchant() {
  const V = S.snap.valley, M = V.merchant && V.merchant.until > S.snap.t ? V.merchant : null;
  if (!M) return `<div class="sec ctr merch-away"><div class="bigic">${icon('merchant', 80)}</div><b>The merchant is on the road</b><p class="small">A travelling merchant visits every few minutes with three special offers. Stock is shared by the whole valley, so be quick!</p><div class="evcard">${icon('clock', 26)}<div><b>Next visit</b><div class="small">in <span class="cd" data-t="${V.next.merchant}"></span></div></div></div></div>`;
  let h = `<div class="sec merch-here"><div class="row"><span class="th sm" style="--b1:#d8f0ff">${icon('merchant', 40)}</span><div class="grow"><div class="speech">Welcome, friend! Take a look at my wares.</div></div><div class="ctr"><b class="cdbig"><span class="cd" data-t="${M.until}"></span></b><div class="small">until I leave</div></div></div></div>`;
  h += M.offers.map((o, i) => {
    const sold = o.stock <= 0, short = have(o.give.res) < o.give.n, why = sold ? 'Sold out! Everyone was quick.' : short ? 'Need ' + (o.give.n - have(o.give.res)) + ' more ' + goodName(o.give.res).toLowerCase() : '';
    return `<div class="sec offer ${sold ? 'lock' : ''}"><div class="row sp"><div class="trade"><span class="cc ${short ? 'bad' : ''}">${icon(o.give.res, 30)}<b>${o.give.n}</b></span><span class="arrow">${icon('arrow', 22)}</span><span class="cc">${icon(o.get.res, 30)}<b>${o.get.n}</b></span></div><button class="b b-green ${why ? 'off' : 'shine'}" data-a="trade" data-i="${i}" data-why="${esc(why)}" data-snd="none">Trade</button></div><div class="row sp"><div class="bar thin l grow"><i style="width:${q5(o.stock / o.max)}%"></i></div><span class="small">${o.stock} of ${o.max} left</span></div></div>`;
  }).join('');
  return h;
}

// ---------- players ----------
const EMOTES = ['\u{1F44B}', '❤️', '\u{1F602}', '\u{1F389}', '\u{1F64F}', '\u{1F33E}'];
function players(p) {
  const sort = p.sort || 'level', list = [...S.snap.players].sort((a, b) => sort === 'charm' ? (b.charm || 0) - (a.charm || 0) || b.level - a.level : b.level - a.level || (b.charm || 0) - (a.charm || 0));
  let h = `<div class="row sp"><b>${S.snap.players.length} of 16 villages</b><div class="seg"><button class="${sort === 'level' ? 'on' : ''}" data-a="sort" data-s="level" data-snd="tab">Level</button><button class="${sort === 'charm' ? 'on' : ''}" data-a="sort" data-s="charm" data-snd="tab">Charm</button></div></div>`;
  h += `<div class="plist">` + list.map((pl, i) => {
    const me = pl.id === S.myId, open = p.gift && p.gift.to === pl.id;
    let r = `<div class="rowi pr ${me ? 'me' : ''}"><span class="rank r${i}">${i < 3 ? icon(['crown', 'medal', 'medal'][i], 22) : i + 1}</span><span class="dot" style="background:${pl.color}"></span><div class="grow"><b>${esc(pl.name)}</b>${pl.title ? `<small class="ttl">${esc(pl.title)}</small>` : ''}<div class="small">Lv ${pl.level} - ${icon('heart', 12)} ${pl.charm || 0} ${pl.online ? '<span class="dot2"></span>' : icon('sleep', 14)}</div></div>${me ? '<span class="small">you</span>' : `<button class="b b-pink small-b round" data-a="giftopen" data-p="${pl.id}" aria-label="Send a gift" data-snd="open">${icon('gift', 22)}</button>`}<button class="b b-cream small-b" data-a="visit" data-p="${pl.id}">Visit</button></div>`;
    if (open) {
      const g = p.gift, have2 = GOODS.filter((x) => (S.you.res[x] || 0) > 0);
      r += `<div class="sec giftbox"><b>Send ${esc(pl.name)} a present</b><div class="giftgoods">${have2.map((x) => `<button class="gg tap ${g.res === x ? 'on' : ''}" data-a="giftres" data-g="${x}" data-snd="tap2">${icon(x, 28)}<small>${S.you.res[x]}</small></button>`).join('') || '<span class="small">You have nothing to give yet</span>'}</div><div class="row sp"><div class="seg">${[1, 5, 10, 20].map((n) => `<button class="${g.n === n ? 'on' : ''}" data-a="giftn" data-n="${n}" data-snd="tab">${n}</button>`).join('')}</div><button class="b b-pink ${g.res ? '' : 'off'}" data-a="giftsend" data-why="Pick something to send first" data-snd="none">${icon('gift', 20)} Send</button></div></div>`;
    }
    return r;
  }).join('') + '</div>';
  h += `<div class="sec"><h4>${icon('chat', 20)} Say it with a bounce</h4><div class="emotes">${EMOTES.map((e) => `<button class="b b-cream round" data-a="emote" data-e="${e}" data-snd="giggle">${e}</button>`).join('')}</div></div>`;
  return h;
}
