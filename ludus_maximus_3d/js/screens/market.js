// Market screen: weekly stock, the special premium item, restock, quick selling and the wandering visitor.
// All rules are the sim's (LM.ensureShops/buyItem/rerollMarket/sellItem/visitor/visit); this file is presentation and flow only.
import * as P from './armory_parts.js';
const { U, h, D, L, tile, itemHead, statTable, affixList, setBlock, compareList, burst, btn, tip, pill, cost, portrait, scaled, emptyState, worn } = P;

const RESTOCK = 40;

export function open(ctx, arg) {
  P.ensureCss();
  const S = ctx.S, lm = L(), d = D();
  lm.ensureShops(S);
  const st = { tab: (arg && arg.tab) || 'shop', bid: {}, qty: {}, view: null, confirm: null, fx: null };
  const items = () => S.items, byId = (id) => S.market.find((i) => i.id === id);
  let confirmT = 0;

  const root = h('div', 'am-root'), content = h('div', 'am-content'), tabsEl = h('div', 'am-tabs');
  tabsEl.setAttribute('role', 'tablist');
  const gold = P.goldChip(ctx);
  const arm = U.iconButton('shield', 'Open the Armory', () => ctx.open('armory'));
  const capLab = h('div', 'am-cap'); const capBar = U.bar({ value: 0, max: 1, kind: 'xp', height: 8 });
  capLab.append(h('div', '', [tip('Armory space', 'Spare items you own. When it is full, buying loot sells your weakest item automatically.', 'Capacity'), document.createTextNode(' '), h('span', 'am-capn')]), capBar);
  root.append(h('div', 'am-top', [gold, capLab, arm]), tabsEl, content);
  const TABS = [['shop', 'Shop', 'market'], ['sell', 'Sell', 'coin'], ['auction', 'Auction', 'roster'], ['caravan', 'Caravan', 'scroll']]; // ECONOMY: auction + caravan tabs
  const tabBtns = TABS.map(([id, label, ic]) => { const b = h('button', 'am-tab', [U.icon(ic, 20), h('span', '', label)]); b.type = 'button'; b.setAttribute('role', 'tab'); b.addEventListener('click', () => { ctx.sfx('uiTap'); st.tab = id; st.view = null; st.confirm = null; render(); content.scrollTop = 0; }); tabsEl.append(b); return b; });
  tabsEl.style.gridAutoColumns = '1fr';
  const m = ctx.sheet({ title: 'Market', body: root, actions: [] });
  P.shapeSheet(m, root);

  const sync = () => { ctx.save(); try { ctx.refresh(); } catch (e) { console.error('refresh failed', e); } };
  const card = (cls, kids) => { const c = h('div', 'am-card ' + (cls || ''), kids); c.style.position = 'relative'; return c; };
  const secH = (t, extra) => h('div', 'am-h', [h('span', '', t), h('span', 'am-sp'), extra || null]);
  const backBtn = (label, fn) => { const b = U.button({ label: '‹ ' + label, variant: 'bronze', onClick: fn }); b.classList.add('am-back'); return b; };
  const price = (it) => lm.buyVal(S, it);
  const weakest = () => items().slice().sort((a, b) => lm.itemScore(a) - lm.itemScore(b))[0];
  const full = () => items().length >= lm.armoryCap(S);

  // ---------- SHOP ----------
  function discountPct() { const l = lm.bfx(S, 'market').l; return Math.round((0.03 * l + lm.facPerks(S).shop + (lm.fest(S, S.week) === 'saturn' ? 0.2 : 0)) * 100); }
  function viewShop() {
    const out = h('div'); const mk = lm.bfx(S, 'market'), pct = discountPct(), fest = lm.fest(S, S.week) === 'saturn';
    const info = card('dark', [h('div', 'am-name', [tip('Market', 'Each Market level gives 3% off all prices and weekly income. Stock is renewed every week.', 'Market level'), document.createTextNode(mk.l ? `  level ${mk.l}` : '  not built')]),
      h('div', 'am-small', (pct ? `Prices reduced by ${pct}%${fest ? ' (Saturnalia sale)' : ''}.` : 'Build a Market for discounts and weekly income.') + ' Stock changes every week.')]);
    info.querySelector('.am-name').style.color = '#f2c14e'; info.querySelectorAll('.am-small').forEach((e) => { e.style.color = '#d8c9a0'; });
    if (!mk.l) { const free = S.plots.findIndex((p, k) => !p && k < S.rows * lm.COLS); const bb = U.button({ label: free >= 0 ? 'Build a Market' : 'Open your buildings', icon: 'ludus', variant: 'gold', onClick: () => ctx.open('building', free >= 0 ? { type: 'plot', i: free, empty: true } : {}) }); const kids = [...info.childNodes]; info.replaceChildren(h('div', 'am-hero', [h('div', 'am-hi', kids), bb])); }
    out.append(info);
    if (S.raidWeek === S.week) { const w = card('warn', [h('b', '', 'Raided!'), h('div', 'am-p', `${S.rowner ? S.rowner.name : 'A rival'}'s agents bought the best item before you.`)]); w.style.marginTop = '8px'; out.append(w); }
    if (full()) { const w = card('warn', [h('b', '', 'Armory full'), h('div', 'am-p', `Buying will sell your weakest item (${weakest().name}) automatically. Sell spare gear first, or upgrade the Forge for more room.`)]); w.style.marginTop = '8px'; out.append(w); }
    const vis = lm.visitor(S);
    if (vis) {
      const c = card('gold', [h('div', 'am-hero', [h('span', 'am-badge', U.icon('scroll', 22)), h('div', 'am-hi', [h('div', 'am-name', vis.name), h('div', 'am-p', vis.d), h('div', 'am-small', vis.cost ? `Costs ${vis.cost} gold` : 'Free')]), U.button({ label: 'Meet', variant: 'bronze', onClick: () => { st.view = { type: 'visitor' }; ctx.sfx('uiTap'); render(); content.scrollTop = 0; } })])]);
      c.firstChild.firstChild.style.cssText = 'width:40px;height:40px;background:#5a1f5e'; c.style.marginTop = '10px'; c.append(h('span', 'am-ribbon', 'Visitor')); out.append(c);
    }
    const sp = S.market.find((i) => i.sp), rest = S.market.filter((i) => !i.sp);
    out.append(secH('Special offer', tip('Premium', 'A rare piece of gear sold at a 50% premium. A rival may buy it before you.', 'Special offer')));
    if (sp) {
      const hero = card('gold', [h('div', 'am-hero', [itemHead(ctx, sp, 60)])]); hero.style.marginTop = '10px'; hero.append(h('span', 'am-ribbon', 'Special'));
      hero.firstChild.firstChild.style.flex = '1'; hero.append(statLine(sp), h('div', 'am-btns', [U.button({ label: 'Inspect', variant: 'bronze', onClick: () => openItem(sp) }), btn(ctx, { label: 'Buy', sub: ctx.fmt(price(sp)) + ' gold', icon: 'coin', variant: 'gold', off: S.gold < price(sp) ? 'Not enough gold' : '', onClick: () => buy(sp) })]));
      out.append(hero);
    } else out.append(card('', [h('div', 'am-p', 'The special item is gone this week.')]));
    out.append(secH('On the stalls', h('span', 'am-small', rest.length + ' items')));
    if (!rest.length) out.append(emptyState('market', 'Sold out. Restock for fresh stock.'));
    else { const g = h('div', 'am-grid'); rest.forEach((it) => g.append(tile(ctx, it, { price: price(it), onClick: openItem }))); out.append(g); }
    const off = S.gold < RESTOCK ? 'Not enough gold' : '';
    out.append(h('div', 'am-btns', [btn(ctx, { label: 'Restock the stalls', sub: RESTOCK + ' gold', icon: 'coin', variant: 'bronze', off, onClick: restock, block: true })]));
    out.append(h('div', 'am-small', 'Restocking replaces all items, including the special offer, with new ones.'));
    return out;
  }
  function statLine(it) { const sc = scaled(it); const e = h('div', 'am-small', Object.keys(sc).map((k) => `${P.STAT_LAB[k]} ${sc[k]}`).join('  ·  ')); e.style.marginTop = '8px'; return e; }
  function openItem(it) { st.view = { type: 'item', id: it.id }; ctx.sfx('uiTap', { gain: 0.5 }); render(); content.scrollTop = 0; }
  function restock() {
    if (S.gold < RESTOCK) { ctx.sfx('uiError'); ctx.toast('Not enough gold', { kind: 'bad' }); return; }
    S.gold -= RESTOCK; lm.rerollMarket(S); sync(); ctx.sfx('coin'); ctx.toast(S.raidWeek === S.week ? 'Fresh stock, but a rival took the best piece' : 'Fresh stock on the stalls', { kind: 'info', ico: 'market' }); render();
  }
  function buy(it) {
    const p = price(it);
    if (S.gold < p) { ctx.sfx('uiError'); ctx.toast('Not enough gold', { kind: 'bad' }); return; }
    const w = full() ? weakest() : null;
    const e = lm.buyItem(S, it); if (e) { ctx.sfx('uiError'); ctx.toast(e, { kind: 'bad' }); return; }
    sync(); ctx.sfx('coin'); ctx.toast(`Bought ${it.name}` + (w ? `. Sold ${w.name} to make room` : ''), { kind: 'good', ico: 'coin' });
    st.view = { type: 'bought', item: it, sold: w }; st.fx = { text: 'Bought!', color: d.RAR[it.rar].c }; render(); content.scrollTop = 0;
  }
  function viewItem(it) {
    const out = h('div'); out.append(backBtn('Market', () => { st.view = null; render(); }));
    const c = card(it.sp ? 'gold' : '', [itemHead(ctx, it)]); c.dataset.fx = '1';
    // compare against the fighter who would gain the most
    const wearers = ctx.S.glads.filter((g) => worn(g, it)).map((g) => ({ g, c: worn(g, it), d: lm.itemScore(it) - lm.itemScore(worn(g, it)) })).sort((a, b) => b.d - a.d);
    const best = wearers[0] || null; let ref = null, refLab = '';
    if (best) { ref = scaled(best.c); refLab = `Compared with ${best.g.name}'s ${best.c.name}`; } else if (ctx.S.glads.length) refLab = `Nobody wears a ${d.SLOT_NAME[it.slot].toLowerCase()} yet`;
    const sc = h('div'); sc.style.marginTop = '10px'; if (refLab) sc.append(h('div', 'am-small', refLab)); sc.append(statTable(it, ref ? { ref } : {})); c.append(sc);
    out.append(c, secH('Effects'), affixList(it)); const sb = setBlock(ctx, it); if (sb) out.append(secH('Set'), sb);
    out.append(secH('Your fighters'), compareList(ctx, it));
    const p = price(it), w = full() ? weakest() : null;
    if (w) { const wc = card('warn', [h('b', '', 'Armory full'), h('div', 'am-p', `Buying sells ${w.name} for ${ctx.fmt(lm.sellVal(w))} gold.`)]); wc.style.marginTop = '10px'; out.append(wc); }
    out.append(h('div', 'am-btns', [btn(ctx, { label: w ? 'Buy and sell weakest' : 'Buy', sub: ctx.fmt(p) + ' gold', icon: 'coin', variant: 'gold', off: S.gold < p ? 'Not enough gold' : '', block: true, onClick: () => buy(it) })]));
    out.append(h('div', 'am-small', [document.createTextNode('Price '), cost(ctx, p), document.createTextNode(`  ·  you have ${ctx.fmt(S.gold)}`)]));
    return out;
  }
  function viewBought(v) {
    const it = v.item, R = d.RAR[it.rar], out = h('div');
    const box = h('div', 'am-result'); box.style.setProperty('--bc', R.c); box.dataset.fx = '1';
    const fr = U.rarityFrame(P.RAR_KEY[it.rar], U.icon(P.SLOT_ICON[it.slot], 40), 84); fr.classList.add('am-pop');
    box.append(h('i', 'am-flare'), h('div', 'am-kicker', 'Purchased'), fr, h('div', 'am-big', it.name), h('div', 'am-small', 'Added to your armory' + (v.sold ? `. ${v.sold.name} was sold to make room.` : '.')));
    out.append(box, secH('Equip now?'), compareList(ctx, it, { onEquip: (g) => { lm.equip(S, g, it); sync(); ctx.sfx('uiConfirm'); ctx.toast(`${g.name} equipped ${it.name}`, { kind: 'good', ico: 'check' }); st.view = null; render(); } }));
    out.append(h('div', 'am-btns', [U.button({ label: 'Keep shopping', variant: 'gold', onClick: () => { st.view = null; render(); } }), U.button({ label: 'Open armory', variant: 'bronze', onClick: () => ctx.open('armory') })]));
    return out;
  }

  // ---------- VISITOR ----------
  function viewVisitor() {
    const v = lm.visitor(S), out = h('div'); out.append(backBtn('Market', () => { st.view = null; render(); }));
    if (!v) { out.append(card('', [h('div', 'am-p', 'The visitor has moved on.')])); return out; }
    out.append(card('gold', [h('div', 'am-hero', [h('span', 'am-badge', U.icon('scroll', 24)), h('div', 'am-hi', [h('div', 'am-name', v.name), h('div', 'am-p', v.d)])]), v.cost ? h('div', 'am-small', [document.createTextNode('Price '), cost(ctx, v.cost)]) : h('div', 'am-small', 'Free of charge.')]));
    out.firstChild.nextSibling.querySelector('.am-badge').style.cssText = 'width:44px;height:44px;background:#5a1f5e';
    out.append(h('div', 'am-small', 'One visitor per week. You can accept one offer.'));
    if (v.kind === 'trainer') {
      out.append(secH('Who trains?'));
      if (!S.glads.length) out.append(emptyState('roster', 'Recruit a gladiator first.'));
      S.glads.forEach((g) => { const weak = d.STATS.slice().sort((a, b) => g.st[a] - g.st[b])[0]; const row = h('button', 'am-row', [portrait(ctx, g, 40), h('div', 'am-mid', [h('div', 'am-t', g.name), h('div', 'am-s', `Weakest: ${d.SN[weak]} ${g.st[weak]} ➜ ${g.st[weak] + 2}`)]), h('span', 'am-tag new', '+2')]); row.type = 'button'; row.addEventListener('click', () => accept(v, g)); out.append(row); });
    } else out.append(h('div', 'am-btns', [btn(ctx, { label: 'Accept', sub: v.cost ? v.cost + ' gold' : 'Free', icon: v.cost ? 'coin' : 'check', variant: 'gold', off: S.gold < v.cost ? 'Not enough gold' : '', block: true, onClick: () => accept(v, null) })]));
    return out;
  }
  function accept(v, g) {
    const r = lm.visit(S, v, g); if (typeof r === 'string') { ctx.sfx('uiError'); ctx.toast(r, { kind: 'bad' }); return; }
    sync(); ctx.sfx(v.cost ? 'coin' : 'uiConfirm'); ctx.toast(r.msg, { kind: 'good', ico: 'check' });
    st.view = { type: 'visited', text: r.msg, name: v.name }; render(); content.scrollTop = 0;
  }
  function viewVisited(v) {
    return h('div', '', [card('good', [h('b', '', v.name), h('div', 'am-p', v.text)]), h('div', 'am-btns', [U.button({ label: 'Back to market', variant: 'gold', onClick: () => { st.view = null; render(); } })])]);
  }

  // ---------- SELL ----------
  function viewSell() {
    const out = h('div'), list = items().slice().sort((a, b) => lm.sellVal(b) - lm.sellVal(a));
    out.append(card('', [h('div', 'am-p', 'Sell spare gear for gold. Upgraded and better items fetch more. Fighters\' worn gear is safe here.')]));
    if (!list.length) { out.append(U.emptyState({ icon: 'coin', title: 'Nothing to sell', text: 'Only spare gear can be sold here. Worn gear stays with its fighter.', how: 'Win loot in the arena, then come back.', action: { label: 'Browse the stalls', variant: 'bronze', icon: 'market', onClick: () => { st.tab = 'shop'; st.view = null; render(); } } })); return out; }
    const bulk = (label, key, fn) => {
      const sel = list.filter(fn), total = sel.reduce((a, i) => a + lm.sellVal(i), 0), armed = st.confirm === key;
      const b = btn(ctx, { label: armed ? 'Tap again to sell' : label, icon: 'coin', variant: armed ? 'danger' : 'bronze', off: sel.length ? '' : 'Nothing matches', onClick: () => {
        if (!armed) { arm_(key); return; }
        sel.forEach((i) => lm.sellItem(S, i)); st.confirm = null; sync(); ctx.sfx('coin'); ctx.toast(`Sold ${sel.length} items for ${ctx.fmt(total)} gold`, { kind: 'good', ico: 'coin' }); render(); } });
      const w = h('div', 'am-bulk', [b, h('div', 'am-small', sel.length ? `${sel.length} item${sel.length === 1 ? '' : 's'}, ${ctx.fmt(total)} gold` : 'None to sell')]); return w;
    };
    out.append(h('div', 'am-btns', [bulk('Sell all Common', 'c0', (i) => i.rar === 0 && !i.up), bulk('Sell Fine and below', 'c1', (i) => i.rar <= 1 && !i.up)]));
    out.append(secH('Your spare items', h('span', 'am-small', list.length + ' items')));
    list.forEach((it) => {
      const v = lm.sellVal(it), needs = it.rar >= 2 || it.up > 0, armed = st.confirm === it.id;
      const row = h('div', 'am-row', [U.rarityFrame(P.RAR_KEY[it.rar], U.icon(P.SLOT_ICON[it.slot], 20), 44), h('div', 'am-mid', [h('div', 'am-t', it.name + (it.up ? ' +' + it.up : '')), h('div', 'am-s', `${d.RAR[it.rar].n} ${d.SLOT_NAME[it.slot]} · Power ${P.power(it)}${it.set ? ' · ' + d.SETS[it.set].n : ''}`)])]);
      const b = U.button({ label: armed ? 'Sure?' : 'Sell', sub: ctx.fmt(v), variant: armed ? 'danger' : 'bronze', onClick: () => {
        if (needs && !armed) { arm_(it.id); return; }
        lm.sellItem(S, it); st.confirm = null; sync(); ctx.sfx('coin'); ctx.toast(`Sold ${it.name} for ${ctx.fmt(v)} gold`, { kind: 'good', ico: 'coin' }); render(); } });
      b.style.flex = 'none'; b.style.minWidth = '84px'; b.style.padding = '6px 10px'; row.append(b); out.append(row);
    });
    return out;
  }
  function arm_(key) { st.confirm = key; clearTimeout(confirmT); confirmT = setTimeout(() => { st.confirm = null; if (m.el.isConnected) render(); }, 3500); ctx.sfx('uiTap'); render(); }


  // ---------- ECONOMY: AUCTION ----------
  const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
  const BIDS = [1, 1.15, 1.3, 1.5];
  function viewAuction() {
    const out = h('div'), A = lm.auction(S), sees = lm.auctionSees(S), debt = lm.inDebtChapter(S);
    out.append(card('dark', [h('div', 'am-name', `The weekly auction, ${A.quarter}`), h('div', 'am-small', A.note + (A.fest ? ` A festival fills the hall (${d.FESTIVALS.find((f) => f.id === A.fest).n}).` : '')),
      h('div', 'am-small', 'Set the highest bid you will pay. If you win, you pay just above the best rival bid, never more than your bid. Rival schools bid against you, and they remember it.')]));
    out.firstChild.querySelectorAll('.am-name,.am-small').forEach((e) => { e.style.color = e.classList.contains('am-name') ? '#f2c14e' : '#d8c9a0'; });
    if (debt) out.append(card('warn', [h('b', '', 'Creditors at the door'), h('div', 'am-p', 'In a debt chapter your purchases would be seized. Clear what is overdue first.')]));
    if (S.glads.length >= lm.rosterCap(S)) out.append(card('warn', [h('b', '', 'Barracks full'), h('div', 'am-p', 'Release a fighter or upgrade the Barracks to bid.')]));
    A.lots.forEach((lot) => {
      const g = lot.g, res = A.res[lot.id], mult = st.bid[lot.id] || 1, bid = Math.round(lot.reserve * mult), why = lm.auctionWhy(S, lot, bid);
      const top = d.STATS.slice().sort((a, b) => g.st[b] - g.st[a]).slice(0, 3).map((k) => `${d.SA[k]} ${lm.grade(g.st[k], g.lvl)}`).join('  ');
      const c = card(lot.feature ? 'gold' : '', [h('div', 'am-hero', [portrait(ctx, g, 56), h('div', 'am-hi', [h('div', 'am-name', g.name + (g.nick ? ' ' + g.nick : '')), h('div', 'am-p', `${d.STYLES[g.style].n}, level ${g.lvl}  ${stars(lm.stars(g))}`), h('div', 'am-small', `${top}  ·  ${d.TRAITS[g.trait].n}`)])])]);
      if (lot.feature) c.append(h('span', 'am-ribbon', 'Featured'));
      const riv = lot.bids.length;
      c.append(h('div', 'am-small', sees >= 2 ? (riv ? `Rival ceilings: ${lot.bids.map((b) => `${b.name} ${b.ceil}`).join(', ')}` : 'No rival wants him.') : sees === 1 ? (riv ? `${riv} rival school${riv > 1 ? 's' : ''} in the room, top ceiling about ${Math.round(Math.max(...lot.bids.map((b) => b.ceil)) * 0.85)} to ${Math.round(Math.max(...lot.bids.map((b) => b.ceil)) * 1.15)}.` : 'Nobody else seems keen.') : 'Other schools are in the room. A Spymaster or a bribed auctioneer shows what they will pay.'));
      if (res) { c.append(h('div', 'am-p', res.won ? `Won for ${res.price} gold.` : `Lost to ${res.by}.`)); c.classList.add(res.won ? 'good' : 'warn'); }
      else {
        const chips = h('div', 'am-filters'); BIDS.forEach((m) => { const b = h('button', 'am-chipbtn' + (m === mult ? ' on' : ''), `${Math.round(lot.reserve * m)}`); b.type = 'button'; b.setAttribute('aria-pressed', m === mult ? 'true' : 'false'); b.addEventListener('click', () => { st.bid[lot.id] = m; ctx.sfx('uiTap'); render(); }); chips.append(b); });
        c.append(h('div', 'am-small', `Reserve ${lot.reserve} gold. Your highest bid:`), chips,
          h('div', 'am-btns', [btn(ctx, { label: `Bid up to ${bid}`, sub: 'gold', icon: 'coin', variant: 'gold', off: why, block: true, onClick: () => bidLot(lot, bid) })]));
      }
      out.append(c);
    });
    return out;
  }
  function bidLot(lot, bid) {
    const r = lm.auctionBid(S, lot.id, bid); if (r.err) { ctx.sfx('uiError'); ctx.toast(r.err, { kind: 'bad' }); return; }
    sync();
    if (r.won) { ctx.sfx('levelUp'); ctx.toast(`${r.g.name} is yours for ${r.price} gold`, { kind: 'good', ico: 'check' }); st.fx = { text: 'Sold!', color: '#f2c14e' }; }
    else { ctx.sfx('uiError'); ctx.toast(`${r.by} outbids you`, { kind: 'bad' }); }
    render();
  }

  // ---------- ECONOMY: CARAVAN, TRADE GOODS, PELTS, THE BACK ALLEY ----------
  function viewCaravan() {
    const out = h('div'), C = lm.caravan(S);
    out.append(card('dark', [h('div', 'am-name', C.here ? 'A merchant caravan is in town' : 'No caravan this week'), h('div', 'am-small', C.here ? `${lm.quarterName(S.week)} prices. The caravan sells gear at swinging prices, trades goods and buys pelts (today x${C.peltMul}).` : 'Caravans come most weeks. Trade goods and pelts can only be handled while one is here.')]));
    out.firstChild.querySelectorAll('.am-name,.am-small').forEach((e) => { e.style.color = e.classList.contains('am-name') ? '#f2c14e' : '#d8c9a0'; });
    if (C.here) {
      out.append(secH('Wares', h('span', 'am-small', 'prices swing with the season')));
      const g = h('div', 'am-grid'); C.items.forEach((row, i) => { if (!lm.caravanSold(S, i)) g.append(tile(ctx, row.it, { price: row.price, onClick: () => { st.view = { type: 'cvitem', i }; render(); content.scrollTop = 0; } })); });
      out.append(g.childNodes.length ? g : emptyState('market', 'The caravan is sold out.'));
      out.append(secH('Trade goods', h('span', 'am-small', `${lm.cargoUnits(S)} / ${lm.cargoCap(S)} crates`)));
      out.append(h('div', 'am-small', 'Buy where it is cheap, sell where it is dear. The season and the town you are in move the price. A 5% spread applies each way.'));
      Object.keys(lm.GOODS).forEach((id) => {
        const G = lm.GOODS[id], p = lm.goodPrice(S, id), held = lm.eco(S).cargo[id], rel = p / G.p;
        const tr = rel < 0.92 ? 'cheap' : rel > 1.08 ? 'dear' : 'fair';
        const r = h('div', 'am-row', [h('div', 'am-mid', [h('div', 'am-t', `${G.n}  ${p} gold`), h('div', 'am-s', `${tr === 'cheap' ? 'Cheap now' : tr === 'dear' ? 'Dear now' : 'Fair price'} (usual ${G.p})` + (held ? `  ·  you hold ${held.n}, paid ${Math.round(held.cost / held.n)} each` : ''))])]);
        const b1 = U.button({ label: 'Buy 2', variant: 'bronze', onClick: () => tradeDo(() => lm.goodBuy(S, id, 2)) }), b2 = U.button({ label: held ? `Sell ${held.n}` : 'Sell', variant: 'gold', onClick: () => tradeDo(() => lm.goodSell(S, id, held ? held.n : 1)) });
        [b1, b2].forEach((b) => { b.style.flex = 'none'; b.style.minWidth = '72px'; b.style.padding = '6px 10px'; r.append(b); }); out.append(r);
      });
      const V = lm.venatio(S), pk = Object.keys(V.pelts || {}).filter((k) => V.pelts[k] > 0);
      out.append(secH('Pelts and trophies of the hunt'));
      if (!pk.length) out.append(h('div', 'am-small', 'No pelts in the store. Beast hunts in the Arena bring them home.'));
      pk.forEach((k) => { const n = V.pelts[k], v = Math.round(n * lm.peltValue(S, k) * C.peltMul); out.append(h('div', 'am-row', [h('div', 'am-mid', [h('div', 'am-t', `${n} x ${lm.pelt(k)}`), h('div', 'am-s', `The caravan pays ${v} gold (x${C.peltMul})`)]), (() => { const b = U.button({ label: `Sell ${v}`, variant: 'gold', onClick: () => { const r = lm.peltSell(S, k); if (r.err) { ctx.sfx('uiError'); ctx.toast(r.err, { kind: 'bad' }); return; } sync(); ctx.sfx('coin'); ctx.toast(`Sold for ${r.gold} gold`, { kind: 'good', ico: 'coin' }); render(); } }); b.style.flex = 'none'; b.style.minWidth = '90px'; return b; })()])); });
    }
    // the back alley
    out.append(secH('The back alley', h('span', 'am-small', `Senate suspicion: ${lm.susLabel(lm.suspicion(S))} (${Math.round(lm.suspicion(S))})`)));
    const A = lm.alley(S);
    if (!A.here) out.append(h('div', 'am-small', 'The alley is empty tonight.'));
    else {
      out.append(h('div', 'am-small', 'Stolen goods at half price. Each purchase carries a chance the Senate hears of it. The odds are on the sign.'));
      const g = h('div', 'am-grid'); A.items.forEach((row) => g.append(tile(ctx, row.it, { price: row.price, onClick: () => { st.view = { type: 'alley', i: row.i }; render(); content.scrollTop = 0; } }))); out.append(g.childNodes.length ? g : emptyState('market', 'Nothing left tonight.'));
    }
    return out;
  }
  function tradeDo(fn) { const e = fn(); if (e) { ctx.sfx('uiError'); ctx.toast(e, { kind: 'bad' }); return; } sync(); ctx.sfx('coin'); render(); }
  function viewCvItem(v) {
    const C = lm.caravan(S), row = C.items[v.i], out = h('div'); out.append(backBtn('Caravan', () => { st.view = null; render(); }));
    if (!row || lm.caravanSold(S, v.i)) { out.append(card('', [h('div', 'am-p', 'Sold.')])); return out; }
    const it = row.it, base = lm.buyVal(S, it), diff = Math.round((row.price / base - 1) * 100);
    out.append(card('', [itemHead(ctx, it)]), secH('Effects'), affixList(it));
    out.append(card(diff <= -10 ? 'good' : diff >= 10 ? 'warn' : '', [h('div', 'am-p', `Shop price ${ctx.fmt(base)}. The caravan asks ${ctx.fmt(row.price)} (${diff >= 0 ? '+' : ''}${diff}%).`)]));
    out.append(secH('Your fighters'), compareList(ctx, it));
    out.append(h('div', 'am-btns', [btn(ctx, { label: 'Buy', sub: ctx.fmt(row.price) + ' gold', icon: 'coin', variant: 'gold', off: S.gold < row.price ? 'Not enough gold' : '', block: true, onClick: () => { const e = lm.caravanBuy(S, v.i); if (e) { ctx.sfx('uiError'); ctx.toast(e, { kind: 'bad' }); return; } sync(); ctx.sfx('coin'); ctx.toast(`Bought ${it.name}`, { kind: 'good', ico: 'coin' }); st.view = { type: 'bought', item: it, sold: null }; render(); } })]));
    return out;
  }
  function viewAlley(v) {
    const A = lm.alley(S), row = A.items.find((x) => x.i === v.i), out = h('div'); out.append(backBtn('Back alley', () => { st.view = null; render(); }));
    if (!row) { out.append(card('', [h('div', 'am-p', 'Gone.')])); return out; }
    const it = row.it;
    out.append(card('', [itemHead(ctx, it)]), secH('Effects'), affixList(it));
    out.append(card('warn', [h('b', '', `${Math.round(row.risk * 100)}% chance the Senate learns of it`), h('div', 'am-p', 'If it does: the item is confiscated, you pay a fine of 30% of the price on top, lose 5 fame and Senate standing, and suspicion climbs by 18. If not, suspicion still rises by 6 or more. The price is paid either way.'),
      h('div', 'am-small', `The odds rise with the item's rarity and your suspicion (now ${Math.round(lm.suspicion(S))}). A friendly Senate and a Spymaster lower them.`)]));
    out.append(h('div', 'am-btns', [btn(ctx, { label: 'Buy it, quietly', sub: ctx.fmt(row.price) + ' gold', icon: 'coin', variant: 'danger', off: S.gold < row.price ? 'Not enough gold' : '', block: true, onClick: () => { const r = lm.alleyBuy(S, v.i); if (r.err) { ctx.sfx('uiError'); ctx.toast(r.err, { kind: 'bad' }); return; } sync(); if (r.caught) { ctx.sfx('uiError'); ctx.toast(`Caught! The item is confiscated and you pay a fine of ${r.fine}`, { kind: 'bad' }); st.view = null; } else { ctx.sfx('coin'); ctx.toast(`Nobody noticed. ${it.name} is yours`, { kind: 'good', ico: 'coin' }); st.view = { type: 'bought', item: it, sold: null }; } render(); } })]));
    return out;
  }
  // ---------- render ----------
  function render() {
    if (!m.el.isConnected) return;
    const keep = content.scrollTop; gold.set(S.gold);
    const n = items().length, cp = lm.armoryCap(S); capBar.set(n, cp); capLab.querySelector('.am-capn').textContent = `${n} / ${cp}`; capLab.classList.toggle('full', n >= cp);
    tabBtns.forEach((b, i) => { const on = TABS[i][0] === st.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    let v;
    if (st.view) {
      const t = st.view.type;
      if (t === 'item') { const it = byId(st.view.id); v = it ? viewItem(it) : null; } else if (t === 'bought') v = viewBought(st.view); else if (t === 'visitor') v = viewVisitor(); else if (t === 'visited') v = viewVisited(st.view); else if (t === 'cvitem') v = viewCvItem(st.view); else if (t === 'alley') v = viewAlley(st.view); // ECONOMY
      if (!v) st.view = null;
    }
    if (!v) v = st.tab === 'shop' ? viewShop() : st.tab === 'sell' ? viewSell() : st.tab === 'auction' ? viewAuction() : viewCaravan();
    content.replaceChildren(v); content.scrollTop = keep;
    if (st.fx) { const fx = st.fx; st.fx = null; const host = content.querySelector('[data-fx]'); requestAnimationFrame(() => burst(host, { text: fx.text, color: fx.color })); }
  }
  render();
  return m;
}
