// Armory screen: Items, Forge, Relics, Runes. All rules are the sim's (LM.*); this file is presentation and flow only.
import * as P from './armory_parts.js';
const { U, h, D, L, tile, itemHead, statTable, affixList, setBlock, compareList, burst, btn, tip, pill, cost, portrait, power, scaled, emptyState } = P;

const TABS = [['items', 'Items', 'shield'], ['forge', 'Forge', 'bloodrage'], ['relics', 'Relics', 'fame'], ['runes', 'Runes', 'star']];
const MODES = [['upgrade', 'Upgrade'], ['evolve', 'Evolve'], ['reforge', 'Reforge'], ['merge', 'Merge']];
const SORTS = [['power', 'Power'], ['rarity', 'Rarity'], ['slot', 'Slot']];

export function open(ctx, arg) {
  P.ensureCss();
  const S = ctx.S, lm = L(), d = D();
  const st = { tab: (arg && arg.tab) || 'items', slot: 'all', sort: 'power', view: null, confirm: null, fx: null, mode: (arg && arg.mode) || 'upgrade', fid: (arg && arg.item) || null, merge: [], note: null, hl: null };
  if (!TABS.some((t) => t[0] === st.tab)) st.tab = 'items';
  const items = () => S.items;
  const byId = (id) => S.items.find((i) => i.id === id);
  const forgeL = () => lm.bfx(S, 'forge').l;
  let confirmT = 0;

  // ---------- frame ----------
  const root = h('div', 'am-root'), content = h('div', 'am-content'), tabsEl = h('div', 'am-tabs');
  tabsEl.setAttribute('role', 'tablist');
  const gold = P.goldChip(ctx), capBar = U.bar({ value: 0, max: 1, kind: 'xp', height: 8 }), capLab = h('div', '', '');
  const capTip = tip('Armory', 'Spare items you own. The Forge adds 4 slots per level. When the armory is full, new loot automatically sells your weakest item.', 'Capacity');
  capLab.append(capTip, document.createTextNode(' '), h('span', 'am-capn', ''));
  const cap = h('div', 'am-cap', [capLab, capBar]);
  const mk = U.iconButton('market', 'Open the Market', () => ctx.open('market'));
  root.append(h('div', 'am-top', [gold, cap, mk]), tabsEl, content);
  const tabBtns = TABS.map(([id, label, ic]) => {
    const b = h('button', 'am-tab', [U.icon(ic, 20), h('span', '', label)]); b.type = 'button'; b.setAttribute('role', 'tab');
    b.addEventListener('click', () => { if (st.tab === id) { st.view = null; render(); return; } ctx.sfx('uiTap'); st.tab = id; st.view = null; render(); content.scrollTop = 0; });
    tabsEl.append(b); return b;
  });
  const m = ctx.sheet({ title: 'Armory', body: root, actions: [] });
  P.shapeSheet(m, root);

  // ---------- helpers ----------
  const sync = () => { ctx.save(); try { ctx.refresh(); } catch (e) { console.error('refresh failed', e); } };
  function celebrate(text) { st.fx = { text }; }
  function sellIt(it) {
    const needs = it.rar >= 2 || it.up > 0;
    if (needs && st.confirm !== it.id) { st.confirm = it.id; clearTimeout(confirmT); confirmT = setTimeout(() => { st.confirm = null; render(); }, 3500); ctx.sfx('uiTap'); render(); return; }
    const v = lm.sellVal(it); lm.sellItem(S, it); st.confirm = null; st.view = null; st.merge = st.merge.filter((x) => x !== it.id); if (st.fid === it.id) st.fid = null;
    sync(); ctx.sfx('coin'); ctx.toast(`Sold ${it.name} for ${ctx.fmt(v)} gold`, { kind: 'good', ico: 'coin' }); render();
  }
  function equipOn(g, it) {
    lm.equip(S, g, it); sync(); ctx.sfx('uiConfirm'); ctx.toast(`${g.name} equipped ${it.name}`, { kind: 'good', ico: 'check' }); st.view = null; render();
  }
  function doUpgrade(it) {
    const e = lm.upgradeItem(S, it); if (e) { ctx.sfx('uiError'); ctx.toast(e, { kind: 'bad' }); return; }
    sync(); const top = it.up >= lm.maxUp(S); ctx.sfx(top ? 'levelUp' : 'uiConfirm'); celebrate('+' + it.up); render();
  }
  function goForge(it, mode) { st.tab = 'forge'; st.view = null; st.mode = mode || 'upgrade'; st.fid = it ? it.id : st.fid; if (mode === 'merge' && it) st.merge = [it.id]; render(); content.scrollTop = 0; }
  const backBtn = (label, fn) => { const b = U.button({ label: '‹ ' + label, variant: 'bronze', onClick: fn }); b.classList.add('am-back'); return b; };
  const secH = (t, extra) => h('div', 'am-h', [h('span', '', t), h('span', 'am-sp'), extra || null]);
  const card = (cls, kids) => { const c = h('div', 'am-card ' + (cls || ''), kids); c.style.position = 'relative'; return c; };

  // ---------- ITEMS ----------
  function sortedItems() {
    let list = items().slice(); if (st.slot !== 'all') list = list.filter((i) => i.slot === st.slot);
    const sc = (i) => lm.itemScore(i);
    list.sort((a, b) => (st.sort === 'slot' ? d.SLOTS.indexOf(a.slot) - d.SLOTS.indexOf(b.slot) : st.sort === 'rarity' ? b.rar - a.rar : 0) || sc(b) - sc(a));
    return list;
  }
  function viewItems() {
    const f = h('div', 'am-filters'); f.setAttribute('role', 'group'); f.setAttribute('aria-label', 'Filter by slot');
    const chip = (key, ic, label, n) => { const b = h('button', 'am-chipbtn' + (st.slot === key ? ' on' : ''), [ic ? U.icon(ic, 20) : h('span', '', label), n != null ? h('b', '', n) : null]); b.type = 'button'; b.setAttribute('aria-label', `${label}, ${n} items`); b.setAttribute('aria-pressed', st.slot === key); b.addEventListener('click', () => { st.slot = key; ctx.sfx('uiTap', { gain: 0.4 }); render(); }); return b; };
    f.append(chip('all', null, 'All', items().length));
    d.SLOTS.forEach((s) => f.append(chip(s, P.SLOT_ICON[s], d.SLOT_NAME[s], items().filter((i) => i.slot === s).length)));
    const sb = h('button', 'am-chipbtn', 'Sort: ' + SORTS.find((x) => x[0] === st.sort)[1]); sb.type = 'button'; sb.setAttribute('aria-label', 'Change sort order');
    sb.addEventListener('click', () => { st.sort = SORTS[(SORTS.findIndex((x) => x[0] === st.sort) + 1) % SORTS.length][0]; ctx.sfx('uiTap', { gain: 0.4 }); render(); });
    f.append(sb);
    const out = h('div', '', [f]);
    const list = sortedItems();
    if (!list.length) out.append(emptyState('shield', items().length ? 'Nothing in this slot.' : 'No spare items. Win fights, enter tournaments, or visit the Market.'));
    else { const g = h('div', 'am-grid'); list.forEach((it) => g.append(tile(ctx, it, { onClick: () => { st.view = { type: 'item', id: it.id }; ctx.sfx('uiTap', { gain: 0.5 }); render(); content.scrollTop = 0; } }))); out.append(g); }
    out.append(setsCodex());
    return out;
  }
  function setsCodex() {
    const det = h('details', 'am-sets'); det.append(h('summary', '', 'Item sets (' + d.SET_IDS.length + ')'));
    det.append(h('div', 'am-p', 'Wear 2 or 4 pieces of the same set on one fighter for bonuses. Set pieces carry a colored dot.'));
    d.SET_IDS.forEach((id) => {
      const s = d.SETS[id]; const users = S.glads.map((g) => [g, lm.setCounts(g)[id] || 0]).filter((x) => x[1] > 0); const have = items().filter((i) => i.set === id).length;
      const c = card('', [h('div', '', [pill(s.n, s.c), document.createTextNode(`  ${have} in armory`)]), h('div', 'am-p', [h('b', '', '2: '), s.d2]), h('div', 'am-p', [h('b', '', '4: '), s.d4]), users.length ? h('div', 'am-small', 'Worn: ' + users.map(([g, n]) => `${g.name} ${n}/5`).join(', ')) : null]);
      c.style.margin = '6px 0'; c.style.borderColor = s.c; det.append(c);
    });
    return det;
  }
  function viewItem(it) {
    const out = h('div');
    out.append(backBtn('Items', () => { st.view = null; st.confirm = null; render(); }));
    const c = card('', [itemHead(ctx, it)]); c.dataset.fx = '1'; c.append(h('div', '', [statTable(it)])); c.lastChild.style.marginTop = '10px';
    out.append(c, secH('Effects'), affixList(it)); const sb = setBlock(ctx, it); if (sb) { out.append(secH('Set'), sb); }
    out.append(secH('Equip on', tip('Power', 'Compared with what each fighter wears in this slot.', 'Compare')), compareList(ctx, it, { onEquip: (g) => equipOn(g, it) }));
    const max = lm.maxUp(S), upc = lm.upCost(it), val = lm.sellVal(it);
    const offUp = it.up >= max ? (max ? 'Upgrade the Forge building for a higher limit' : 'Build a Forge first') : S.gold < upc ? 'Not enough gold' : '';
    const sell = st.confirm === it.id;
    out.append(h('div', 'am-btns', [
      btn(ctx, { label: it.up >= max ? (max ? 'Maxed +' + it.up : 'Needs a Forge') : 'Upgrade +' + (it.up + 1), sub: it.up >= max ? '' : upc + ' gold', icon: 'coin', variant: 'gold', off: offUp, onClick: () => doUpgrade(it) }),
      U.button({ label: 'Forge', icon: 'bloodrage', variant: 'bronze', sub: 'evolve, reforge, merge', onClick: () => goForge(it, it.up >= Math.max(1, max) && max ? 'evolve' : 'upgrade') }),
      U.button({ label: sell ? 'Tap again to sell' : 'Sell', sub: ctx.fmt(val) + ' gold', icon: 'coin', variant: 'danger', onClick: () => sellIt(it) }),
    ]));
    return out;
  }

  // ---------- FORGE ----------
  function pickForgeItem() {
    const list = items().slice().sort((a, b) => lm.itemScore(b) - lm.itemScore(a));
    if (!list.find((i) => i.id === st.fid)) st.fid = list[0] ? list[0].id : null;
    return list;
  }
  function viewForge() {
    const out = h('div'), fl = forgeL();
    if (!fl) {
      out.append(card('warn', [h('div', 'am-name', 'No Forge yet'), h('div', 'am-p', 'Build a Forge in your ludus to upgrade, evolve, reforge and merge gear. ' + d.BUILD.forge.f(d.BUILD.forge.v[1]) + ' at level 1. It needs ' + d.BUILD.forge.fame + ' fame.')]));
      out.append(h('div', 'am-btns', [U.button({ label: 'Back to items', variant: 'bronze', onClick: () => { st.tab = 'items'; render(); } })]));
      return out;
    }
    const info = card('dark', [h('div', '', [tip('Forge', 'Each Forge level raises the item upgrade limit and adds 4 armory slots. Upgrade the building from your ludus.', 'Forge level'), document.createTextNode(` level ${fl}`)]), h('div', 'am-small', `Items upgrade up to +${lm.maxUp(S)}. Armory holds ${lm.armoryCap(S)}.`)]);
    info.querySelector('.am-small').style.color = '#d8c9a0'; out.append(info);
    const seg = h('div', 'am-seg'); seg.setAttribute('role', 'tablist');
    MODES.forEach(([id, label]) => { const b = h('button', st.mode === id ? 'on' : '', label); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', st.mode === id); b.addEventListener('click', () => { st.mode = id; st.note = null; st.hl = null; ctx.sfx('uiTap', { gain: 0.4 }); render(); }); seg.append(b); });
    out.append(seg);
    if (st.mode === 'merge') { out.append(mergePanel()); return out; }
    const list = pickForgeItem();
    if (!list.length) { out.append(emptyState('shield', 'You have no spare items to work on.')); return out; }
    const strip = h('div', 'am-strip'); strip.setAttribute('role', 'listbox'); strip.setAttribute('aria-label', 'Choose an item');
    list.forEach((it) => strip.append(tile(ctx, it, { sel: it.id === st.fid, arrow: false, onClick: () => { st.fid = it.id; st.note = null; st.hl = null; ctx.sfx('uiTap', { gain: 0.4 }); render(); } })));
    out.append(strip);
    const it = byId(st.fid); if (!it) return out;
    out.append(st.mode === 'upgrade' ? upgradePanel(it) : st.mode === 'evolve' ? evolvePanel(it) : reforgePanel(it));
    return out;
  }

  function upgradePanel(it) {
    const max = lm.maxUp(S), c = lm.upCost(it), at = it.up >= max;
    const wrap = card('', [itemHead(ctx, it, 56)]); wrap.dataset.fx = '1';
    const pips = h('div', 'am-pips'); pips.setAttribute('role', 'img'); pips.setAttribute('aria-label', `Upgrade level ${it.up} of ${max}`);
    for (let i = 0; i < max; i++) pips.append(h('i', i < it.up ? 'on' : i === it.up ? 'nx' : ''));
    wrap.append(pips);
    const now = scaled(it), nxt = at ? now : scaled(it, it.up + 1);
    const ba = h('div', 'am-ba', [h('div', 'col', [h('div', 'lab', 'Now +' + it.up), statTable(it)]), h('div', 'arr', '➜'), h('div', 'col', [h('div', 'lab', at ? 'At limit' : 'After +' + (it.up + 1)), statTable(it, { stats: nxt, ref: now, hl: at ? [] : Object.keys(nxt) })])]);
    wrap.append(ba);
    const out = h('div', '', [wrap]);
    if (at && max && lm.canEvolve(S, it)) out.append(card('good', [h('b', '', 'Fully upgraded.'), h('div', 'am-p', 'This item can now evolve to a higher rarity.')]), h('div', 'am-btns', [U.button({ label: 'Go to Evolve', variant: 'gold', onClick: () => { st.mode = 'evolve'; render(); } })]));
    else {
      const off = at ? 'Upgrade the Forge building for a higher limit' : S.gold < c ? 'Not enough gold' : '';
      out.append(h('div', 'am-btns', [btn(ctx, { label: at ? 'At the limit' : 'Upgrade to +' + (it.up + 1), sub: at ? '' : c + ' gold', icon: 'coin', variant: 'gold', off, onClick: () => doUpgrade(it), block: true })]));
      if (!at) out.append(h('div', 'am-small', [document.createTextNode('Cost '), cost(ctx, c), document.createTextNode(`  · you have ${ctx.fmt(S.gold)}`)]));
    }
    return out;
  }

  function evolvePanel(it) {
    const top = it.rar >= 4, need = Math.max(1, lm.maxUp(S)), c = lm.evolveCost(it), can = lm.canEvolve(S, it);
    const wrap = card('', [itemHead(ctx, it, 56)]); wrap.dataset.fx = '1';
    const out = h('div', '', [wrap]);
    if (top) { wrap.append(h('div', 'am-p', 'This item is already Legendary, the highest rarity.')); return out; }
    const nr = d.RAR[it.rar + 1];
    const req = (ok, text) => h('div', 'am-row', [U.icon(ok ? 'check' : 'lock', 20), h('div', 'am-mid', h('div', 'am-t', text)), h('span', 'am-tag ' + (ok ? 'pos' : 'neg'), ok ? 'Done' : 'To do')]);
    const ba = h('div', 'am-ba', [h('div', 'col', [h('div', 'lab', 'Now'), P.rarPill(it), h('div', 'am-small', `ilvl ${it.ilvl} · +${it.up}`)]), h('div', 'arr', '➜'), h('div', 'col', [h('div', 'lab', 'After'), (() => { const p = pill(nr.n, nr.c); p.style.color = it.rar + 1 === 4 ? '#3a2a00' : it.rar + 1 === 3 ? '#fff' : '#10202e'; return p; })(), h('div', 'am-small', `ilvl ${it.ilvl + 2} · +0`)])]);
    wrap.append(ba, h('ul', 'am-p', [h('li', '', 'Keeps your affixes' + (it.set ? ' and set' : '') + ' (they may grow stronger)'), h('li', '', `Gains a new affix: ${it.af.length} now, up to ${nr.af} at ${nr.n}`), h('li', '', 'Base stats are re-rolled for the higher tier'), h('li', '', 'Upgrade level resets to +0')]));
    wrap.lastChild.style.paddingLeft = '18px';
    out.append(secH('Requirements', tip('Evolve', 'Evolving raises an item one rarity step. It must first be fully upgraded to the Forge limit.', 'Evolve')), req(can, `Fully upgraded: +${it.up} of +${need}`), req(S.gold >= c, `Gold: ${ctx.fmt(c)} (you have ${ctx.fmt(S.gold)})`));
    const off = !can ? `Upgrade it to +${need} first` : S.gold < c ? 'Not enough gold' : '';
    out.append(h('div', 'am-btns', [btn(ctx, { label: 'Evolve to ' + nr.n, sub: ctx.fmt(c) + ' gold', icon: 'coin', variant: 'gold', off, block: true, onClick: () => doEvolve(it) })]));
    if (!can && it.up < need) out.append(h('div', 'am-btns', [U.button({ label: 'Upgrade first', variant: 'bronze', onClick: () => { st.mode = 'upgrade'; render(); } })]));
    return out;
  }
  function doEvolve(it) {
    const before = { name: it.name, rar: it.rar, ilvl: it.ilvl, st: Object.assign({}, it.st), up: it.up, af: it.af.map((a) => a.id) };
    const e = lm.evolve(S, it); if (e) { ctx.sfx('uiError'); ctx.toast(e, { kind: 'bad' }); return; }
    sync(); ctx.sfx('levelUp'); st.view = { type: 'result', kind: 'evolve', id: it.id, before, newAf: it.af.map((a, i) => (before.af.includes(a.id) ? -1 : i)).filter((i) => i >= 0) }; render(); content.scrollTop = 0;
  }

  function reforgePanel(it) {
    const c = lm.reforgeCost(it), wrap = card('', [itemHead(ctx, it, 56)]); wrap.dataset.fx = '1';
    wrap.append(secH('Affixes', tip('Reforge', 'Replaces one random affix with a different one that fits this slot. You cannot choose which one. Items without affixes cannot be reforged.', 'Reforge')), affixList(it, st.hl && st.hl.id === it.id ? st.hl.idx : null));
    const out = h('div', '', [wrap]);
    if (st.note && st.note.id === it.id) out.append(card('good', [h('b', '', st.note.text)]));
    const off = !it.af.length ? 'This item has no affix to reforge' : S.gold < c ? 'Not enough gold' : '';
    out.append(h('div', 'am-btns', [btn(ctx, { label: 'Reforge an affix', sub: ctx.fmt(c) + ' gold', icon: 'coin', variant: 'gold', off, block: true, onClick: () => {
      const bef = it.af.map((a) => a.id); const e = lm.reforge(S, it); if (e) { ctx.sfx('uiError'); ctx.toast(e, { kind: 'bad' }); return; }
      const idx = it.af.findIndex((a, i) => a.id !== bef[i]); sync(); ctx.sfx('uiConfirm'); st.hl = { id: it.id, idx }; st.note = { id: it.id, text: `${d.AFFIX[bef[idx]].n} became ${d.AFFIX[it.af[idx].id].n}` }; celebrate('Reforged'); render();
    } })]));
    return out;
  }

  function mergePanel() {
    const out = h('div'); const sel = st.merge.map(byId).filter(Boolean); st.merge = sel.map((i) => i.id);
    const r0 = sel.length ? sel[0].rar : null;
    out.append(h('div', 'am-p', [document.createTextNode('Combine '), tip('three items', 'All three must share a rarity. The result is one item a rarity higher with fresh affixes and a chance at a set piece.', 'Merge'), document.createTextNode(' of the same rarity into one better item.')]));
    const row = h('div', 'am-merge'); row.dataset.fx = '1'; row.style.position = 'relative';
    for (let i = 0; i < 3; i++) {
      const it = sel[i], b = h('button', 'am-slot' + (it ? ' fill' : '')); b.type = 'button';
      if (it) { b.style.setProperty('--rc', d.RAR[it.rar].c); b.append(U.rarityFrame(P.RAR_KEY[it.rar], U.icon(P.SLOT_ICON[it.slot], 22), 44), h('span', 'x', '×')); b.setAttribute('aria-label', `Remove ${it.name}`); b.addEventListener('click', () => { st.merge = st.merge.filter((x) => x !== it.id); ctx.sfx('uiTap', { gain: 0.4 }); render(); }); }
      else { b.textContent = '+'; b.setAttribute('aria-label', 'Empty merge slot'); b.disabled = true; }
      row.append(b);
    }
    const res = h('div', 'am-slot' + (sel.length === 3 && r0 < 4 ? ' fill' : '')); res.style.cursor = 'default';
    if (sel.length === 3 && r0 < 4) { res.style.setProperty('--rc', d.RAR[r0 + 1].c); res.append(U.rarityFrame(P.RAR_KEY[r0 + 1], U.icon('star', 22), 44)); } else res.textContent = '?';
    row.append(h('span', 'eq', '='), res);
    // keep a wider result slot readable: grid has 5 columns (3 slots, equals, result)
    row.style.gridTemplateColumns = '1fr 1fr 1fr auto 1fr';
    out.append(row);
    const ok = sel.length === 3 && r0 < 4, mc = r0 != null && r0 < 4 ? lm.mergeCost(r0) : null;
    if (ok) out.append(card('', [h('b', '', `Result: one ${d.RAR[r0 + 1].n} item`), h('div', 'am-p', `Slot of one of the three, ilvl ${Math.max(...sel.map((i) => i.ilvl)) + 1}, ${d.RAR[r0 + 1].af} affix${d.RAR[r0 + 1].af === 1 ? '' : 'es'}, a chance at a set piece.`)]));
    else out.append(h('div', 'am-small', `Pick ${3 - sel.length} more${r0 != null ? ' ' + d.RAR[r0].n : ''} item${3 - sel.length === 1 ? '' : 's'} below.`));
    const off = forgeL() < 1 ? 'Build a Forge first' : !ok ? 'Pick three items of the same rarity' : S.gold < mc ? 'Not enough gold' : '';
    const auto = U.button({ label: 'Auto-fill', variant: 'bronze', onClick: autoMerge }), clr = U.button({ label: 'Clear', variant: 'bronze', onClick: () => { st.merge = []; render(); } });
    out.append(h('div', 'am-btns', [btn(ctx, { label: ok ? 'Merge to ' + d.RAR[r0 + 1].n : 'Merge', sub: ok ? ctx.fmt(mc) + ' gold' : '', icon: 'coin', variant: 'gold', off, onClick: () => doMerge(sel) }), auto, clr]));
    const pool = items().filter((i) => i.rar < 4).sort((a, b) => a.rar - b.rar || lm.itemScore(a) - lm.itemScore(b));
    out.append(secH('Choose from your items'));
    if (!pool.length) { out.append(emptyState('shield', 'Nothing to merge.')); return out; }
    const g = h('div', 'am-grid');
    pool.forEach((it) => { const on = st.merge.includes(it.id), dim = r0 != null && it.rar !== r0; g.append(tile(ctx, it, { sel: on, dim, arrow: false, onClick: () => {
      if (on) st.merge = st.merge.filter((x) => x !== it.id); else { if (dim) st.merge = []; if (st.merge.length >= 3) st.merge.shift(); st.merge.push(it.id); }
      ctx.sfx('uiTap', { gain: 0.5 }); render(); } })); });
    out.append(g); return out;
  }
  function autoMerge() {
    const by = {}; items().filter((i) => i.rar < 4).forEach((i) => { (by[i.rar] = by[i.rar] || []).push(i); });
    const r = Object.keys(by).map(Number).sort((a, b) => a - b).find((k) => by[k].length >= 3);
    if (r == null) { ctx.sfx('uiError'); ctx.toast('You need three items of the same rarity', { kind: 'bad' }); return; }
    st.merge = by[r].sort((a, b) => lm.itemScore(a) - lm.itemScore(b)).slice(0, 3).map((i) => i.id); ctx.sfx('uiTap'); render();
  }
  function doMerge(sel) {
    const r = lm.merge(S, sel); if (r.err) { ctx.sfx('uiError'); ctx.toast(r.err, { kind: 'bad' }); return; }
    st.merge = []; sync(); ctx.sfx('levelUp'); st.view = { type: 'result', kind: 'merge', id: r.item.id }; render(); content.scrollTop = 0;
  }
  function viewResult(v) {
    const it = byId(v.id); const out = h('div'); if (!it) { st.view = null; return viewForge(); }
    const R = d.RAR[it.rar]; const box = h('div', 'am-result'); box.style.setProperty('--bc', R.c);
    const kick = v.kind === 'merge' ? 'Forged' : 'Evolved';
    box.append(h('i', 'am-flare'), h('div', 'am-kicker', kick + '!'));
    const fr = U.rarityFrame(P.RAR_KEY[it.rar], U.icon(P.SLOT_ICON[it.slot], 46), 96); fr.classList.add('am-pop'); box.append(fr, h('div', 'am-big', it.name), h('div', 'am-chips', [P.rarPill(it), pill(d.SLOT_NAME[it.slot], null, true), pill('ilvl ' + it.ilvl, null, true)]));
    box.lastChild.style.justifyContent = 'center'; box.dataset.fx = '1'; out.append(box);
    if (v.kind === 'evolve' && v.before) out.append(card('', [h('div', 'am-small', `Was ${v.before.name} (${d.RAR[v.before.rar].n}, +${v.before.up})`), statTable(it, { stats: scaled(it), ref: v.before.st })]));
    else out.append(card('', [statTable(it)]));
    out.append(secH('Effects'), affixList(it, v.newAf || (v.kind === 'merge' ? it.af.map((_, i) => i) : null)));
    const sb = setBlock(ctx, it); if (sb) out.append(secH('Set'), sb);
    out.append(secH('Equip on'), compareList(ctx, it, { onEquip: (g) => equipOn(g, it) }));
    out.append(h('div', 'am-btns', [U.button({ label: 'Continue', variant: 'gold', onClick: () => { st.view = null; render(); } })]));
    st.fx = { text: kick + '!', color: R.c };
    return out;
  }

  // ---------- RELICS ----------
  function viewRelics() {
    const out = h('div'), slots = lm.relicSlots(S), on = S.relicOn || [], owned = S.relics || [];
    const gb = lm.relicGold(S);
    const sl = h('div', 'am-slots'); for (let i = 0; i < slots; i++) { const o = on[i] && d.RELICS.find((r) => r.id === on[i]); const s = h('i', o ? 'on' : '', o ? U.icon('fame', 22) : U.icon('lock', 18)); if (o) s.style.background = `linear-gradient(180deg,${o.c},#1d1830)`; s.title = o ? o.n : 'Empty slot'; sl.append(s); }
    out.append(card('dark', [h('div', 'am-name', [tip('Relics', 'Ancient artifacts that boost every fighter at once. Only equipped relics count. Win tournaments, grand games and Pit bosses to find them. The Shrine adds slots.', 'Relics'), document.createTextNode(`  ${on.length} / ${slots}`)]), sl, gb ? h('div', 'am-small', `Active: +${Math.round(gb * 100)}% gold from fights`) : null]));
    out.firstChild.querySelector('.am-name').style.color = '#f2c14e'; out.firstChild.querySelectorAll('.am-small').forEach((e) => { e.style.color = '#d8c9a0'; });
    if (!owned.length) { out.append(emptyState('fame', 'No relics yet. Win tournaments, grand games and Pit bosses to find them.')); }
    owned.forEach((id) => {
      const r = d.RELICS.find((x) => x.id === id); if (!r) return; const isOn = on.includes(id);
      const b = h('button', 'am-row', [h('span', 'am-badge', U.icon('fame', 24)), h('div', 'am-mid', [h('div', 'am-t', r.n), h('div', 'am-s', r.d)]), h('span', 'am-tag ' + (isOn ? 'pos' : 'neu'), isOn ? 'Equipped' : 'Stored')]);
      b.type = 'button'; b.setAttribute('aria-pressed', isOn); b.setAttribute('aria-label', `${r.n}, ${isOn ? 'equipped, tap to store' : 'stored, tap to equip'}`);
      const bd = b.firstChild; bd.style.cssText = `width:40px;height:40px;background:${r.c}`; b.querySelector('.am-t').style.whiteSpace = 'normal';
      if (isOn) { b.style.borderColor = r.c; b.style.background = 'linear-gradient(90deg,#fff1bd,#f7e3a0)'; b.style.borderWidth = '2px'; }
      b.addEventListener('click', () => { const e = lm.toggleRelic(S, id); if (e) { ctx.sfx('uiError'); ctx.toast(e, { kind: 'bad' }); return; } sync(); ctx.sfx(isOn ? 'uiTap' : 'uiConfirm'); render(); });
      out.append(b);
    });
    const left = d.RELICS.length - owned.length;
    if (left > 0) { const lk = h('div', 'am-row am-lock', [U.icon('lock', 22), h('div', 'am-mid', [h('div', 'am-t', `${left} relic${left === 1 ? '' : 's'} still to find`), h('div', 'am-s', 'Tournaments, grand games and Pit bosses can drop them.')])]); out.append(lk); }
    return out;
  }

  // ---------- RUNES ----------
  function viewRunes() {
    const out = h('div'); const ks = Object.keys(d.KEYSTONES), ms = Object.keys(d.MINORS);
    const nK = ks.filter((k) => lm.runeOwned(S, 'k', k)).length, nM = ms.filter((k) => lm.runeOwned(S, 'm', k)).length;
    out.append(card('', [h('div', 'am-p', [tip('Runes', 'Every fighter wears one Keystone (a powerful trigger) and two Minors (small passives). Runes you own can be given to any fighter, and several fighters can share one.', 'Runes'), document.createTextNode(' are unlocked by winning tournaments, bosses and Pit floors. Choose them on a fighter\'s profile.')])]));
    if (S.glads.length) {
      out.append(secH('Your fighters'));
      S.glads.forEach((g) => { const r = g.rune; const row = h('button', 'am-row', [portrait(ctx, g, 40), h('div', 'am-mid', [h('div', 'am-t', g.name), h('div', 'am-s', `${d.KEYSTONES[r.k].n} + ${r.m.map((x) => d.MINORS[x].n).join(', ') || 'no minors'}`)]), h('span', 'am-tag neu', 'Change')]); row.type = 'button'; row.setAttribute('aria-label', `Change runes for ${g.name}`); row.addEventListener('click', () => ctx.open('profile', g.id)); out.append(row); });
    }
    const users = (kind, id) => S.glads.filter((g) => (kind === 'k' ? g.rune.k === id : g.rune.m.includes(id))).map((g) => g.name);
    const runeCard = (kind, id, R) => {
      const own = lm.runeOwned(S, kind, id), u = users(kind, id);
      const c = h('div', 'am-row' + (own ? '' : ' am-lock'), [h('span', 'am-badge', own ? U.icon(kind === 'k' ? 'star' : 'fame', 20) : U.icon('lock', 18)), h('div', 'am-mid', [h('div', 'am-t', R.n), h('div', 'am-s', R.d), u.length ? h('div', 'am-s', 'Used by ' + u.join(', ')) : null]), h('span', 'am-tag ' + (own ? 'pos' : 'neu'), own ? 'Owned' : 'Locked')]);
      c.style.alignItems = 'flex-start'; c.querySelector('.am-t').style.whiteSpace = 'normal'; const bd = c.firstChild; bd.style.cssText = `width:36px;height:36px;background:${own ? (R.c || '#8c5cc8') : '#8a7d68'}`;
      if (own && R.c) c.style.borderLeft = `5px solid ${R.c}`; return c;
    };
    out.append(secH('Keystones', h('span', 'am-small', `${nK} / ${ks.length}`))); ks.forEach((k) => out.append(runeCard('k', k, d.KEYSTONES[k])));
    out.append(secH('Minors', h('span', 'am-small', `${nM} / ${ms.length}`))); ms.forEach((k) => out.append(runeCard('m', k, d.MINORS[k])));
    return out;
  }

  // ---------- render ----------
  function render() {
    if (!m.el.isConnected) return;
    const keep = content.scrollTop;
    gold.set(S.gold);
    const n = items().length, cp = lm.armoryCap(S); capBar.set(n, cp); capLab.querySelector('.am-capn').textContent = `${n} / ${cp}`; cap.classList.toggle('full', n >= cp);
    tabBtns.forEach((b, i) => { const on = TABS[i][0] === st.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    let v;
    if (st.view && st.view.type === 'item') { const it = byId(st.view.id); if (it) v = viewItem(it); else st.view = null; }
    if (!v && st.view && st.view.type === 'result') v = viewResult(st.view);
    if (!v) v = st.tab === 'items' ? viewItems() : st.tab === 'forge' ? viewForge() : st.tab === 'relics' ? viewRelics() : viewRunes();
    content.replaceChildren(v); content.scrollTop = keep;
    if (st.fx) { const fx = st.fx; st.fx = null; const host = content.querySelector('[data-fx]'); requestAnimationFrame(() => burst(host, { text: fx.text, color: fx.color })); }
  }
  render();
  return m;
}
