// The building sheet: preview, level and upgrade, production queue, animals, research, market, decor, move and demolish.
import { icon } from '../icons.js';
import { S, esc, fmt, cmd, coinFrom, have, canAfford, missing, goodName, yourB, pubB, BUILDINGS, GOOD, SELL, GOODS } from './state.js';
import { register } from './frame.js';
import { thumbHtml } from '../thumbs.js';
import { startPlace } from './place.js';
import { costHtml } from './build.js';
import { toast, snd, ui, haptic, pulse, sparkAt, confetti, floatOver } from './fx.js';
import { RECIPES, TECH, MAX_BLD_LEVEL, upgradeCost, upgradeNeedsLevel, UPGRADE_NOTE, ANIMALS, STOCK_CAP, CRAFTED, SKILLS } from '../../shared/data.js';

export const ring = (f, ic, size = 48, cls = '') => `<span class="ringp ${cls}" style="--s:${size}px"><svg viewBox="0 0 48 48"><circle class="t" cx="24" cy="24" r="20"/><circle class="a" cx="24" cy="24" r="20" stroke-dasharray="125.7" stroke-dashoffset="${(125.7 * (1 - Math.max(0, Math.min(1, f)))).toFixed(1)}"/></svg>${ic ? icon(ic, Math.round(size * 0.5)) : ''}</span>`;
const q5 = (f) => Math.round(f * 20) / 20;
export const stars = (lvl, max = MAX_BLD_LEVEL) => `<span class="stars">${Array.from({ length: max }, (_, i) => `<span class="${i < lvl ? '' : 'dim'}">${icon('star', 15)}</span>`).join('')}</span>`;
const stockOf = (st) => Object.values(st.stock || {}).reduce((a, b) => a + b, 0);
const marketLvl = () => { const p = S.snap.players.find((q) => q.id === S.myId); const m = p.b.find((b) => b[1] === 'market' && b[4] >= 1); const st = m && yourB(m[0]); return st ? st.lvl || 1 : 1; };
const sellValue = (g, n) => Math.round(n * SELL[g] * (1 + 0.1 * (marketLvl() - 1) + 0) * (S.snap.valley.project.stage >= 5 && CRAFTED.includes(g) ? 1.1 : 1));
const KEEP = 20;
const surplus = () => GOODS.filter((g) => g !== 'scrolls' && g !== 'soup' && (S.you.res[g] || 0) > KEEP).map((g) => [g, S.you.res[g] - KEEP]);

export const bldWorld = (id) => { const V = S.view.villages.get(S.myId), m = V && V.b.get(id); return m ? { x: V.group.position.x + m.position.x, z: V.group.position.z + m.position.z } : null; };
function charmOf(d, lvl) { return d.decor ? d.decor + (lvl - 1) * Math.ceil(d.decor / 2) : lvl - 1; }

register({
  id: 'building', title: (S0, p) => { const b = pubB(S.myId, p.id); return b ? BUILDINGS[b[1]].name : 'Building'; },
  icon: (S0, p) => { const b = pubB(S.myId, p.id); return b ? `<span class="th sm bt">${thumbHtml('b', b[1], S.pub.color, b[1], 30)}</span>` : ''; },
  sub: (S0, p) => { const b = pubB(S.myId, p.id), st = yourB(p.id); if (!b || !st) return ''; return b[4] < 1 ? 'Under construction' : stars(st.lvl || 1) + ' <span>Level ' + (st.lvl || 1) + '</span>'; },
  onClose() { S.selected = null; if (S.view) S.view.select(null); },
  render(S0, p) {
    const b = pubB(S.myId, p.id), st = yourB(p.id); if (!b || !st) { setTimeout(() => S.api.closeSel && S.api.closeSel(), 0); return ''; }
    const type = b[1], d = BUILDINGS[type], lvl = st.lvl || 1; let h = '';
    if (b[4] < 1) {
      return `<div class="sec ctr"><div class="bigring">${ring(q5(b[4]), 'hammer', 84, 'gold')}<b class="pct">${Math.round(b[4] * 20) * 5}%</b></div><p class="small">Under construction. Builders are on the way!</p></div>
        <div class="row"><button class="b b-green grow" data-a="help" data-snd="confirm">${icon('worker', 24)} Send a builder</button><button class="b b-cream" data-a="demolish">${icon('trash', 22)} Cancel</button></div>`;
    }
    // ----- type specific -----
    if (type === 'hall') {
      const full = S.you.villagers.length >= S.you.housing;
      h += `<div class="stats"><div class="stat">${icon('players', 26)}<b>${S.you.villagers.length}/${S.you.housing}</b><small>Villagers</small></div><div class="stat">${icon('crate', 26)}<b>${S.you.cap}</b><small>Storage per good</small></div><div class="stat">${icon('heart', 26)}<b>${S.you.charm || 0}</b><small>Charm</small></div></div>`;
      const why = full ? 'Build more Cottages to make room' : !canAfford(S.you.hire) ? 'Need ' + missing(S.you.hire).map(([k, n]) => n + ' more ' + k).join(', ') : '';
      h += `<div class="sec"><div class="row sp"><b>Welcome a villager</b><span class="chips">${costHtml(S.you.hire)}</span></div><button class="b b-green big w100 ${why ? 'off' : 'shine'}" data-a="hire" data-why="${esc(why)}" data-snd="hire">${icon('worker', 28)} Welcome!</button></div>`;
      h += `<button class="b b-blue w100" data-a="villagers">${icon('players', 24)} See my villagers</button>`;
    } else if (d.animals) {
      h += pens(st, b, type, d);
    } else if (d.field) {
      h += field(st, b, type, d);
    } else if (d.fishing) {
      h += `<div class="sec"><div class="row"><span class="th sm">${icon('fish', 36)}</span><div class="grow"><b>Fishing Dock</b><p class="small">A villager fishes here again and again until you call them back. Each catch is 1 to 3 fish.</p></div></div><div class="row sp"><span class="chips"><span class="cc">${icon('fish', 18)} ${S.you.res.fish || 0}</span></span><span class="small">Fishing skill makes it faster</span></div><button class="b b-blue big w100" data-a="work" data-snd="confirm">${icon('hook', 26)} Send a fisher</button></div>`;
    } else if (d.craft) {
      h += craft(st, b, type, d);
      if (d.research) h += research(st);
    } else if (d.market) {
      h += market(p);
    } else if (d.decor) {
      const cm = charmOf(d, lvl);
      h += `<div class="sec ctr"><div class="hearts">${Array.from({ length: Math.min(8, cm) }, () => icon('heart', 28)).join('')}</div><b>+${cm} charm</b><p class="small">Your village has ${S.you.charm || 0} charm, worth +${Math.round((S.you.xpBonus || 0) * 100)}% XP. At 10 charm, visitors start dropping by.</p></div>`;
    } else if (d.housing) {
      h += `<div class="sec"><div class="row sp"><b>Homes for ${d.housing + (lvl - 1)} villagers</b><span class="chips">${icon('players', 20)} <b>${S.you.villagers.length}/${S.you.housing}</b></span></div></div>`;
    } else if (d.storage) {
      h += `<div class="sec"><div class="row sp"><b>Storage</b><span class="chips">${icon('crate', 20)} <b>${S.you.cap} per good</b></span></div></div>`;
    }
    // ----- upgrade -----
    if (st.up) h += `<div class="sec"><div class="row"><span class="ringp gold" style="--s:44px">${ring(q5(b[8] || 0), 'up', 44, 'gold')}</span><div class="grow"><b>Upgrading to level ${lvl + 1}...</b><div class="small">${esc(UPGRADE_NOTE[type] || '')}</div></div><b>${Math.round((b[8] || 0) * 20) * 5}%</b></div></div>`;
    else if (lvl < MAX_BLD_LEVEL) {
      const need = upgradeNeedsLevel(type, lvl), cost = upgradeCost(type, lvl), lvOk = S.you.level >= need, afford = canAfford(cost);
      const why = !lvOk ? 'Needs village level ' + need : !afford ? 'Need ' + missing(cost).map(([k, n]) => n + ' more ' + goodName(k).toLowerCase()).join(' and ') : '';
      h += `<div class="sec up"><div class="row sp"><b>${icon('up', 22)} Level ${lvl + 1}</b><span class="small">${esc(UPGRADE_NOTE[type] || '')}</span></div><div class="row sp" style="margin-top:6px"><span class="chips">${lvOk ? costHtml(cost) : `<span class="lockline">${icon('lock', 15)} Village level ${need}</span>`}</span><button class="b b-green ${why ? 'off' : 'shine'}" data-a="upgrade" data-why="${esc(why)}" data-short="${lvOk && !afford ? missing(cost).map(([k]) => k).join(',') : ''}" data-snd="upgrade">${icon('up', 22)} Upgrade!</button></div></div>`;
    } else h += `<div class="sec done ctr"><b>${icon('star', 20)} Max level! ${icon('star', 20)}</b></div>`;
    // ----- footer -----
    if (type !== 'hall') h += `<div class="row foot"><button class="b b-cream grow" data-a="work">${icon('worker', 22)} Work here</button><button class="b b-cream grow" data-a="move">${icon('move', 20)} Move</button><button class="b b-cream" data-a="demolish" aria-label="Demolish">${icon('trash', 20)}</button></div>`;
    return h;
  },
  act(a, el, S0, p, api) {
    const st = yourB(p.id), b = pubB(S.myId, p.id); if (!st || !b) return; const type = st.type, d = BUILDINGS[type];
    if (a === 'help' || a === 'work') { cmd({ op: 'assign', k: 'bld', id: p.id }); toast(a === 'help' ? 'A builder is coming!' : 'A villager is on the way', { icon: 'worker', key: 'send', type: 'good', sound: false }); snd('step', { vol: 0.6 }); }
    else if (a === 'upgrade') { const r = cmd({ op: 'upgrade', id: p.id }); if (r.ok !== false) { snd('upgrade'); haptic(18); const r0 = el.getBoundingClientRect(); sparkAt(r0.left + r0.width / 2, r0.top + 10, 10); confetti(r0.left + r0.width / 2, r0.top, 30, { cone: 2.4, power: 0.8 }); const w = bldWorld(p.id); if (w) S.view.celebrate('craft', w.x, w.z); } }
    else if (a === 'hire') { const r = cmd({ op: 'hire' }); if (r.ok !== false) { toast('A new villager joined!', { icon: 'worker', type: 'gold' }); confetti(innerWidth / 2, innerHeight * 0.55, 40, { cone: 2.6 }); } }
    else if (a === 'villagers') api.open('villagers', {}, el);
    else if (a === 'move') startPlace(type, p.id);
    else if (a === 'demolish') {
      const refund = Object.entries(d.cost).map(([k, n]) => `${Math.floor(n * (b[4] < 1 ? 0.8 : 0.3))} ${goodName(k).toLowerCase()}`).join(', ');
      S.api.confirm({ title: 'Demolish ' + d.name + '?', text: 'You get back ' + refund + '.' + (d.animals ? ' Animals are refunded too.' : ''), ok: 'Demolish', danger: true }).then((ok) => { if (ok) { cmd({ op: 'demolish', id: p.id }); snd('demolish'); S.api.closeSel(); } });
    }
    else if (a === 'make') { const r = el.dataset.r, n = el.dataset.n === 'max' ? Math.max(1, +el.dataset.max) : 1; const out = cmd({ op: 'queue', id: p.id, recipe: r, n }); if (out.ok !== false) { snd(r === 'soup' || r === 'bread' || r === 'cheese' || r === 'jam' || r === 'pie' || r === 'flour' ? 'cook' : 'craft', { vol: 0.8 }); pulse(el, 1.15); } }
    else if (a === 'dq') cmd({ op: 'dequeue', id: p.id, i: +el.dataset.i });
    else if (a === 'research') { const r = cmd({ op: 'research', id: p.id, tech: el.dataset.t }); if (r.ok !== false) snd('research'); }
    else if (a === 'buy') { const r = cmd({ op: 'buyAnimal', id: p.id, kind: el.dataset.k, with: el.dataset.w }); if (r.ok !== false) { snd({ chicken: 'cluck', cow: 'moo', sheep: 'baa' }[el.dataset.k] || 'buy', { vol: 0.9 }); haptic(14); const r0 = el.getBoundingClientRect(); sparkAt(r0.left + r0.width / 2, r0.top, 8); } }
    else if (a === 'collect') { cmd({ op: 'assign', k: 'bld', id: p.id }); toast('A villager is coming to collect', { icon: 'basket', type: 'good', key: 'send', sound: false }); }
    else if (a === 'qty') { const g = el.dataset.g, m = el.dataset.d, own = S.you.res[g] || 0; p.sell = p.sell || {}; const cur = p.sell[g] === undefined ? Math.min(own, 10) : p.sell[g]; p.sell[g] = Math.max(0, Math.min(own, m === 'all' ? own : m === 'ten' ? cur + 10 : cur + (+m))); api.rerender(); }
    else if (a === 'sell') {
      const g = el.dataset.g, own = S.you.res[g] || 0; p.sell = p.sell || {}; const n = Math.min(own, p.sell[g] === undefined ? Math.min(own, 10) : p.sell[g]); if (n < 1) return;
      coinFrom(el); const r = cmd({ op: 'sell', res: g, n }); if (r.ok !== false) { snd('sell'); haptic(14); const w = bldWorld(p.id); if (w) S.view.coins(w.x, w.z); delete p.sell[g]; const r0 = el.getBoundingClientRect(); floatOver(el, '+' + sellValue(g, n), 'fl-gold'); }
    }
    else if (a === 'sellall') {
      const list = surplus(); if (!list.length) return; coinFrom(el); let tot = 0; for (const [g, n] of list) { cmd({ op: 'sell', res: g, n }); tot += sellValue(g, n); } snd('cashRegister'); haptic([10, 30, 20]); confetti(el.getBoundingClientRect().left + 60, el.getBoundingClientRect().top, 24, { cone: 2.4, power: 0.6, colors: ['#ffd54a', '#ffe688', '#fff'] });
    }
  },
});

function field(st, b, type, d) {
  const stg = b[5], orch = type === 'orchard', crop = orch ? 'apple' : 'wheat';
  const txt = stg === 'empty' ? (orch ? 'Ready to tend' : 'Ready to sow') : stg === 'grow' ? 'Growing' : 'Ripe and ready!';
  const f = stg === 'grow' ? b[6] : stg === 'ripe' ? 1 : 0, rain = S.snap.valley.rain;
  const label = stg === 'ripe' ? 'Harvest!' : stg === 'grow' ? 'Growing...' : orch ? 'Tend' : 'Sow';
  const yieldN = orch ? 5 + 2 * (st.lvl || 1) : null;
  return `<div class="sec"><div class="row"><div class="bigring sm">${ring(q5(f), stg === 'ripe' ? crop : 'sprout', 72, stg === 'ripe' ? 'gold' : '')}</div><div class="grow"><b>${txt}</b><div class="small">${stg === 'grow' ? Math.round(f * 20) * 5 + '% grown' + (rain ? ' - rain helps it grow twice as fast!' : '') : orch ? 'Apples ripen after a while.' : 'Wheat grows into a golden field.'}</div>${yieldN ? `<div class="chips" style="margin-top:4px">${icon('apple', 17)} <b>about ${yieldN}</b></div>` : ''}</div></div>
    <button class="b ${stg === 'ripe' ? 'b-gold shine' : 'b-green'} big w100 ${stg === 'grow' ? 'off' : ''}" data-a="work" data-why="It is still growing. Come back soon!" data-snd="confirm">${icon(stg === 'ripe' ? crop : 'sow', 26)} ${label}</button></div>`;
}

function craft(st, b, type, d) {
  let h = `<div class="sec"><h4>${icon('hammer', 20)} Make something</h4><div class="recipes">`;
  for (const r of d.craft) {
    const rc = RECIPES[r], ok = canAfford(rc.in), per = Math.min(10, Math.max(1, Math.min(...Object.entries(rc.in).map(([k, n]) => Math.floor(have(k) / n))))), why = ok ? '' : 'Need ' + missing(rc.in).map(([k, n]) => n + ' more ' + goodName(k).toLowerCase()).join(' and ');
    h += `<div class="rowi sq recipe"><span class="th sm">${icon(r, 32)}</span><div class="grow"><b>${goodName(r)}</b><div class="chips small">${costHtml(rc.in)} <span class="muted">to 1 ${icon(r, 15)} - ${rc.time}s</span></div></div>
      <button class="b b-green small-b ${ok ? '' : 'off'}" data-a="make" data-r="${r}" data-n="1" data-why="${esc(why)}" data-short="${ok ? '' : missing(rc.in).map(([k]) => k).join(',')}" data-snd="none">Make</button>${per > 1 ? `<button class="b b-gold small-b" data-a="make" data-r="${r}" data-n="max" data-max="${per}" data-snd="none">x${per}</button>` : ''}</div>`;
  }
  h += '</div></div>';
  if (st.queue && st.queue.length) {
    h += `<div class="sec"><h4>${icon('clock', 20)} Queue</h4><div class="queue">${st.queue.map((q, i) => {
      const rc = RECIPES[q.recipe], f = q.started ? 1 - q.left / rc.time : 0;
      return `<button class="qitem tap" data-a="dq" data-i="${i}" data-snd="back" aria-label="Remove ${q.recipe}">${ring(q5(f), q.recipe, 48, i === 0 ? 'gold' : '')}<b class="qn">x${q.n}</b><i class="qx">${icon('close', 12)}</i></button>`;
    }).join('')}</div><p class="small">Tap an item to cancel it.</p></div>`;
  }
  return h;
}
function research(st) {
  const cur = st.research;
  let h = `<div class="sec"><h4>${icon('book', 20)} Research</h4>`;
  if (cur) { const t = TECH[cur.tech]; h += `<div class="rowi sq" style="margin-bottom:8px">${ring(q5(1 - cur.left / t.time), 'book', 48, 'blue')}<div class="grow"><b>Studying ${t.name}...</b><div class="small">${Math.ceil(cur.left / 5) * 5}s left</div></div></div>`; }
  h += '<div class="techs">';
  for (const [id, t] of Object.entries(TECH)) {
    const known = S.you.tech[id], short = (S.you.res.scrolls || 0) < t.scrolls, why = known ? '' : cur ? 'The Study is busy. One thing at a time!' : short ? 'Need ' + (t.scrolls - (S.you.res.scrolls || 0)) + ' more scrolls' : '';
    h += `<div class="tech ${known ? 'done' : ''}"><div class="grow"><b>${t.name}</b><div class="small">${esc(t.desc)}</div></div>${known ? `<span class="learned">${icon('check', 24)}</span>` : `<button class="b b-blue small-b ${why ? 'off' : ''}" data-a="research" data-t="${id}" data-why="${esc(why)}" data-snd="confirm"><span class="cc">${icon('scrolls', 18)}${t.scrolls}</span></button>`}</div>`;
  }
  return h + '</div></div>';
}
function market(p) {
  const goods = GOODS.filter((g) => (S.you.res[g] || 0) > 0 && g !== 'scrolls'); const sp = surplus(); const tot = sp.reduce((a, [g, n]) => a + sellValue(g, n), 0);
  const cur = p.sell || {};
  let h = `<button class="b b-gold big w100 ${tot ? 'shine' : 'off'}" data-a="sellall" data-why="Nothing extra to sell. I keep ${KEEP} of each good for you." data-snd="none">${icon('coins', 26)} Sell extras ${tot ? `<b>+${fmt(tot)}</b>` : ''}</button><p class="small ctr" style="margin:4px 0">Keeps ${KEEP} of every good (and your scrolls and soup).</p>`;
  if (!goods.length) return h + '<div class="sec ctr"><p class="small">You have nothing to sell yet. Go gather something!</p></div>';
  h += '<div class="sells">';
  for (const g of goods) {
    const own = S.you.res[g], q = cur[g] === undefined ? Math.min(own, 10) : Math.min(own, cur[g]);
    h += `<div class="rowi sq sellrow"><span class="th sm" style="--b1:${GOOD[g].tint}">${icon(g, 30)}</span><div class="grow"><b>${GOOD[g].name}</b><div class="small">${own} owned - ${sellValue(g, 1)}${icon('coins', 13)} each</div></div>
      <div class="stepper"><button class="b b-cream" data-a="qty" data-g="${g}" data-d="-1" data-snd="tap2" aria-label="Less">${icon('minus', 16)}</button><button class="v tap" data-a="qty" data-g="${g}" data-d="all" data-snd="tap2" title="All">${q}</button><button class="b b-cream" data-a="qty" data-g="${g}" data-d="1" data-snd="tap2" aria-label="More">${icon('plus', 16)}</button></div>
      <button class="b b-gold small-b ${q < 1 ? 'off' : ''}" data-a="sell" data-g="${g}" data-why="Pick how many to sell" data-snd="none">+${fmt(sellValue(g, q))}</button></div>`;
  }
  return h + '</div>';
}
function pens(st, b, type, d) {
  const an = st.an || {}, count = Object.values(an).reduce((a, c) => a + c, 0), room = st.room || 0, stock = stockOf(st), prod = Object.entries(st.stock || {}).filter(([, n]) => n > 0);
  let h = `<div class="sec"><div class="row sp"><b>${icon('paw', 22)} Animals</b><span class="small">${count} of ${room}</span></div><div class="slots">`;
  const list = []; for (const [k, n] of Object.entries(an)) for (let i = 0; i < n; i++) list.push(k);
  for (let i = 0; i < room; i++) h += `<span class="slot ${list[i] ? 'full' : ''}">${list[i] ? icon(list[i], 34) : icon('plus', 14)}</span>`;
  h += '</div>';
  if (st.hungry) h += `<div class="alert">${icon('hungry', 22)} Hungry! The animals need wheat in your storage. ${have('wheat') ? '' : 'You have none right now.'}</div>`;
  else if (count) h += `<div class="small">Fed for ${st.feed || 0} more products. 1 wheat feeds 2.</div>`;
  h += '</div>';
  h += `<div class="sec"><div class="row sp"><b>${icon('basket', 22)} Ready to collect</b><span class="chips">${prod.map(([k, n]) => `<span class="cc">${icon(k, 20)}${n}</span>`).join('') || '<span class="muted">nothing yet</span>'}</span></div><div class="bar g ${stock >= STOCK_CAP ? 'r' : ''}"><i style="width:${Math.round((stock / STOCK_CAP) * 20) * 5}%"></i></div><div class="small">${stock}/${STOCK_CAP} - animals rest when it is full</div>
    <button class="b b-gold big w100 ${stock ? 'shine' : 'off'}" data-a="collect" data-why="Nothing is ready yet. Animals take a while." data-snd="confirm">${icon('basket', 26)} Collect</button></div>`;
  h += `<div class="sec"><h4>${icon('coins', 20)} Welcome an animal</h4>`;
  for (const k of d.animals) {
    const a = ANIMALS[k], full = count >= room, byC = canAfford({ coins: a.coins }), byG = canAfford(a.goods);
    const whyC = full ? 'No room. Upgrade the building!' : byC ? '' : 'Need ' + (a.coins - S.you.coins) + ' more coins', whyG = full ? 'No room. Upgrade the building!' : byG ? '' : 'Need ' + missing(a.goods).map(([g, n]) => n + ' more ' + g).join(' and ');
    h += `<div class="rowi sq buy"><span class="th sm">${icon(k, 36)}</span><div class="grow"><b>${a.name}${an[k] ? ' x' + an[k] : ''}</b><div class="small">${icon(a.product, 14)} 1 ${a.product} per ${a.time}s</div></div>
      <div class="buys"><button class="b b-gold small-b ${whyC ? 'off' : ''}" data-a="buy" data-k="${k}" data-w="coins" data-why="${esc(whyC)}" data-snd="none"><span class="cc ${byC ? '' : 'bad'}">${icon('coins', 16)}${a.coins}</span></button><button class="b b-cream small-b ${whyG ? 'off' : ''}" data-a="buy" data-k="${k}" data-w="goods" data-why="${esc(whyG)}" data-snd="none">${costHtml(a.goods)}</button></div></div>`;
  }
  return h + '</div>';
}
