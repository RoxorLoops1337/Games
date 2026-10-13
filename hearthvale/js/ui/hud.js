// The heads-up display: player card, wallet, resource strip, tools, dock, quest tracker, quick work button, pips and hints.
import { icon } from '../icons.js';
import { S, $, $$, esc, fmt, store, myPub, cmd, coinFrom, GOOD, GOODS, BUILDINGS, canAfford, have } from './state.js';
import { roll, pulse, shake, floatOver, flyTo, toast, ui, snd, wobble, reduced, sparkAt, floatAt } from './fx.js';
import { open, close, isOpen, current } from './frame.js';
import { thumbHtml } from '../thumbs.js';
import { QUESTS, LEVEL_XP, NODE_TYPES, VALLEY_FIELDS, RECIPES } from '../../shared/data.js';

export const HINTS = {
  q_wood: 'Tap a tree to send a villager', q_house: 'Build, then Cottage, tap the grass, Place', q_farm: 'Build, then Wheat Field', q_wheat: 'Tap the field when it is golden', q_kitch: 'Build, then Kitchen',
  q_soup: 'Tap the Kitchen and cook soup', q_hire: 'Tap the Hearth Hall to welcome someone', q_lvl2: 'Keep gathering and building for XP', q_order: 'Open the Valley and give goods to an order', q_saw: 'Needs village level 2',
  q_plank: 'Tap the Sawmill, saw planks', q_study: 'Needs village level 3', q_up: 'Tap a building, then Level up', q_lvl5: 'Valley orders give big XP',
  q_coop: 'Research Husbandry in the Study first', q_chick: 'Open the Coop and buy a chicken', q_egg: 'Send a villager to the Coop to collect', q_orch: 'Build the Orchard, then tend it',
  q_apple: 'Harvest the Orchard when it is ripe', q_decor: 'Decor adds charm. Try flowers!', q_barn: 'Needs level 5 and Husbandry', q_milk: 'Buy a cow, then collect', q_dairy: 'Turns milk into cheese',
  q_cheese: 'Queue cheese in the Dairy', q_dock: 'Research Angling first', q_fish: 'Send a villager to the Dock', q_pantry: 'Research Preserving first', q_jam: 'Queue jam in the Pantry',
  q_visit: 'Visitors come when charm is 10+', q_weav: 'Research Weaving first', q_cloth: 'Queue cloth in the Weavery', q_trade: 'Open the Valley, Merchant tab', q_charm: 'Decorate your village',
  q_proj: 'Valley, Project tab: Give goods', q_pie: 'Queue pies in the Pantry', q_lvl10: 'Keep building and filling orders', q_charm2: 'More decor and upgrades', q_lvl15: 'You are a legend in the making',
};
const IDLE_ICON = { idle: 'sleep', hungry: 'hungry', blocked: 'clock', full: 'crate' };
export const stateText = (v) => { const t = { idle: ['sleep', 'Idle'], walk: ['walk', 'Walking'], work: ['hammer', 'Working'], build: ['hammer', 'Building'], hungry: ['hungry', 'Hungry, no soup!'], blocked: ['clock', 'Waiting for goods'], full: ['crate', 'Storage full'] }[v.state]; return t ? icon(t[0], 18) + ' ' + t[1] : esc(v.state); };

const C = {}; // cached DOM and last-written values, so a snapshot only touches what changed
const STRIP_ORDER = ['wood', 'clay', 'stone', 'wheat', 'planks', 'bricks', 'flour', 'soup', 'bread', 'egg', 'milk', 'wool', 'apple', 'fish', 'cheese', 'jam', 'cloth', 'pie'];
const CORE = new Set(['wood', 'clay', 'stone', 'wheat', 'soup']);

export function initHud() {
  for (const e of $$('[data-ic]')) e.innerHTML = icon(e.dataset.ic, +e.dataset.s || 20);
  C.card = $('#card'); C.pname = $('#pname'); C.ptitle = $('#ptitle'); C.plvl = $('#plvl'); C.xp = $('#xpbar'); C.arc = $('#xparc'); C.charm = $('#pcharm'); C.face = $('#pface');
  C.coins = $('#pCoins'); C.scr = $('#pScrolls'); C.strip = $('#strip'); C.track = $('#track'); C.quick = $('#quick'); C.mini = $('#mini');
  C.strip.innerHTML = `<button class="gp more" id="stripMore" aria-label="All goods">${icon('crate', 24)}<span>All</span></button>` + STRIP_ORDER.map((g, i) => `${i === 4 || i === 7 || i === 9 ? '<i class="gsep"></i>' : ''}<button class="gp" data-g="${g}" data-snd="tap2" hidden aria-label="${GOOD[g].name}"><span class="gi">${icon(g, 26)}</span><b class="num">0</b><i class="cap"><u></u></i><em>MAX</em></button>`).join('');
  C.gp = {}; for (const b of $$('.gp[data-g]', C.strip)) C.gp[b.dataset.g] = { el: b, num: $('.num', b), cap: $('u', b), gsep: b.previousElementSibling && b.previousElementSibling.classList.contains('gsep') ? b.previousElementSibling : null, v: -1 };
  $('#pCoins .gi').innerHTML = icon('coins', 28); $('#pScrolls .gi').innerHTML = icon('scrolls', 26);
  C.strip.addEventListener('click', (e) => { const b = e.target.closest('.gp'); if (!b) return; open('inventory', { focus: b.dataset.g, toggle: true }, b); });
  C.strip.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { C.strip.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  $('#pCoins').onclick = (e) => open('inventory', { focus: 'coins', toggle: true }, e.currentTarget); $('#pScrolls').onclick = (e) => open('inventory', { focus: 'scrolls', toggle: true }, e.currentTarget);
  C.card.onclick = (e) => open('profile', { toggle: true }, C.card);
  // tools
  const tools = [['tQuests', 'quests', 'Quests', 'quests'], ['tDaily', 'daily', 'Daily gift', 'chest'], ['tAch', 'achievements', 'Trophies', 'trophy'], ['tChat', 'chat', 'Chat', 'chat'], ['tPhoto', 'photo', 'Photo mode', 'camera'], ['tMenu', 'settings', 'Settings', 'menu']];
  $('#tools').innerHTML = '<button id="tVisitor" class="rb visitor" hidden aria-label="A visitor is waiting"></button>' + tools.map(([id, scr, label, ic]) => `<button id="${id}" class="rb" data-scr="${scr}" aria-label="${label}" title="${label}">${icon(ic, 30)}</button>`).join('');
  $('#tVisitor').innerHTML = icon('visitor', 30) + '<svg class="vring" viewBox="0 0 48 48"><circle cx="24" cy="24" r="21" /></svg>';
  for (const b of $$('#tools .rb[data-scr]')) b.onclick = () => { if (b.dataset.scr === 'photo') S.api.photo && S.api.photo(true); else open(b.dataset.scr, { toggle: true }, b); };
  $('#tVisitor').onclick = (e) => open('visitor', { toggle: true }, e.currentTarget);
  // dock
  $('#bHome').innerHTML = icon('house', 30); $('#bVil').innerHTML = icon('players', 30); $('#bValley').innerHTML = icon('valley', 30); $('#bShop').innerHTML = icon('merchant', 30);
  $('#bBuild').innerHTML = `<span class="bi">${icon('hammer', 34)}</span><span>Build</span>`;
  $('#bHome').onclick = () => { S.view.focusVillage(S.myId, S.api.homeDist() - 2); S.view.goal.yaw = 0; };
  $('#bVil').onclick = (e) => open('villagers', { toggle: true }, e.currentTarget);
  $('#bBuild').onclick = (e) => { S.api.closeSel && S.api.closeSel(); open('build', { toggle: true }, e.currentTarget); };
  $('#bValley').onclick = (e) => { open('valley', { toggle: true, tab: store.get('valleytab', 'orders') }, e.currentTarget); };
  $('#bShop').onclick = (e) => { S.unseen.merchant = false; open('valley', { tab: 'merchant', toggle: true }, e.currentTarget); };
  S.api.short = () => { shake(C.coins); };
  C.quick.innerHTML = `<span class="qi">${icon('bolt', 30)}</span><span class="ql">Work!</span><i class="pip"></i>`; C.quick.onclick = () => sendIdle();
  C.track.onclick = () => open('quests', { toggle: true }, C.track);
  // mini card for a tapped villager
  C.mini.addEventListener('pointerdown', () => { C.miniDown = true; }); addEventListener('pointerup', () => { C.miniDown = false; });
  C.mini.addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (!b || !S.selected) return; if (b.dataset.m === 'more') open('villager', { id: S.selected.id }, b); else if (b.dataset.m === 'stop') { cmd({ op: 'recall', vid: S.selected.id }); } else if (b.dataset.m === 'x') S.api.closeSel(); });
}

// ---------- pips: red bubbles that bounce when something new waits ----------
export function setPip(el, n) {
  if (!el) return; let p = el.querySelector(':scope > .pip'); const v = n === true ? '' : n ? String(n > 9 ? '9+' : n) : null;
  if (v === null) { if (p) { p.remove(); } return; }
  if (!p) { p = document.createElement('i'); p.className = 'pip'; el.appendChild(p); if (!reduced()) try { p.animate([{ transform: 'scale(0)' }, { transform: 'scale(1.5)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' }); } catch { /* ignore */ } }
  if (p.textContent !== v) { p.textContent = v; if (p.dataset.v !== undefined) pulse(p, 1.5, 360); } p.dataset.v = v; p.classList.toggle('dot', n === true);
}
const setHint = (el, on) => { if (el) el.classList.toggle('ringhint', !!on); };

// ---------- per snapshot ----------
export function updateHud(s) {
  const you = S.you, pub = myPub(); if (!you || !pub) return;
  // player card
  if (C.pname.textContent !== pub.name) C.pname.textContent = pub.name;
  const title = pub.title || ''; if (C.ptitle.textContent !== title) { C.ptitle.textContent = title; C.ptitle.hidden = !title; }
  const hat0 = pub.v[0] ? pub.v[0][4] : 0, fk = pub.color + '|' + hat0;
  if (C.face.dataset.c !== fk) { C.face.dataset.c = fk; C.face.style.background = `radial-gradient(circle at 35% 30%, #fff8, transparent 55%), ${pub.color}`; C.face.innerHTML = thumbHtml('v', hat0, pub.color, 'house', 24); }
  const lv = you.level, lo = LEVEL_XP[lv - 1], hi = LEVEL_XP[lv], frac = hi === undefined ? 1 : Math.max(0, Math.min(1, (you.xp - lo) / (hi - lo)));
  if (C.lv !== lv) { if (C.lv !== undefined) { pulse($('.av', C.card), 1.3, 600); sparkAt(...centerOf($('.av', C.card)), 10); } C.lv = lv; C.plvl.textContent = lv; }
  if (C.frac !== frac) { C.xp.style.transform = `scaleX(${frac})`; C.arc.style.strokeDashoffset = String(138.2 * (1 - frac)); if (C.frac !== undefined && frac > C.frac) C.xp.parentElement.classList.add('glow'), setTimeout(() => C.xp.parentElement.classList.remove('glow'), 900); C.frac = frac; }
  const cm = (you.charm || 0) + '|' + Math.round((you.xpBonus || 0) * 100); if (C.cm !== cm) { C.cm = cm; C.charm.innerHTML = `${icon('heart', 15)}<b>${you.charm || 0}</b>`; C.charm.title = 'Charm ' + (you.charm || 0) + ' (+' + Math.round((you.xpBonus || 0) * 100) + '% XP)'; }
  // wallet: rolling counters and +N floaters
  const dC = roll($('.num', C.coins), you.coins, fmt); if (dC > 0 && C.walletSeen) { floatOver(C.coins, `+${fmt(dC)}`, 'fl-gold'); coinsArrive(dC); }
  const dS = roll($('.num', C.scr), you.res.scrolls || 0, fmt); if (dS > 0 && C.walletSeen) floatOver(C.scr, `+${dS}`, 'fl-scroll');
  C.walletSeen = true; C.coins.classList.toggle('full', false);
  // resource strip
  let sepShow = false;
  STRIP_ORDER.forEach((g, i) => {
    const e = C.gp[g], v = you.res[g] || 0, show = CORE.has(g) || v > 0 || (g === 'planks' && lv >= 2) || (g === 'bricks' && lv >= 2);
    if (e.show !== show) { e.show = show; e.el.hidden = !show; }
    if (e.gsep) e.gsep.hidden = !CORE.has(g) && !show ? true : false;
    if (!show) return;
    if (e.v !== v) { const d = roll(e.num, v, String); if (d > 0 && e.v !== -1) { if (d >= 1) floatOver(e.el, '+' + d, 'fl-good'); } e.v = v; e.cap.style.transform = `scaleX(${Math.min(1, v / you.cap)})`; }
    const full = v >= you.cap; if (e.full !== full) { e.full = full; e.el.classList.toggle('full', full); }
    e.el.classList.toggle('dim', v === 0);
  });
  // quest tracker
  trackQuest();
  // tools and dock pips
  const idle = you.villagers.filter((v) => v.state === 'idle').length, dly = you.daily;
  setPip($('#tQuests'), S.unseen.quest || 0); setPip($('#tAch'), S.unseen.ach || 0); setPip($('#tDaily'), dly && dly.available ? true : 0);
  const wanted = projectWanted(); setPip($('#bValley'), wanted ? true : 0);
  const merch = s.valley.merchant && s.valley.merchant.until > s.t; const shop = $('#bShop'); if (shop.hidden === !!merch) { shop.hidden = !merch; if (merch) { wobble(shop); } }
  setPip(shop, merch && S.unseen.merchant ? true : 0);
  setPip($('#bVil'), idle || 0);
  const q = C.quick; const showQ = idle > 0 && !S.mode; if (q.hidden === showQ) { q.hidden = !showQ; if (showQ && !reduced()) try { q.animate([{ transform: 'scale(.3)' }, { transform: 'scale(1.15)', offset: 0.6 }, { transform: 'none' }], { duration: 420, easing: 'ease-out' }); } catch { /* ignore */ } }
  const qp = $('.pip', q); if (qp && qp.textContent !== String(idle)) qp.textContent = String(idle);
  // visitor
  const vis = you.visitor, tv = $('#tVisitor'); if (!!vis === tv.hidden) { tv.hidden = !vis; if (vis) { wobble(tv); } }
  if (vis) { tv.querySelector('circle').style.strokeDashoffset = String(132 * (1 - Math.max(0, Math.min(1, vis.expiresIn / 150)))); setPip(tv, S.unseen.visitor ? true : 0); }
  // next best action ring
  let hint = null; const dl = dly && dly.available;
  if (S.tourActive) hint = null; else if (dl) hint = '#tDaily'; else if (idle > 0 && !S.mode) hint = '#quick'; else if (needsBuild()) hint = '#bBuild';
  if (C.hint !== hint) { if (C.hint) setHint($(C.hint), false); C.hint = hint; if (hint) setHint($(hint), true); }
  // festival banner
  festival(s);
}
const centerOf = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

function coinsArrive(d) {
  const src = S.coinSrc && performance.now() - S.coinSrc.t < 2500 ? S.coinSrc : (() => { const V = S.view.villages.get(S.myId); if (!V) return null; const p = S.view.project(V.group.position.x, 1.5, V.group.position.z); return p.vis ? p : null; })();
  S.coinSrc = null; if (!src || d < 1) return;
  flyTo(src, C.coins, { icon: 'coins', n: Math.min(8, 2 + Math.round(Math.log2(d + 1))), onArrive: (i) => { if (i === 0 || i % 3 === 0) { pulse(C.coins, 1.12, 260); snd('coin', { vol: 0.5 }); } } });
}

const projectWanted = () => {
  const P = S.snap.valley.project; if (!P || P.stage >= P.max) return false; if (store.get('projseen', 0) > Date.now() - 120000) return false;
  return Object.keys(P.need).some((g) => (P.got[g] || 0) < P.need[g] && have(g) >= 8);
};
function needsBuild() {
  const q = QUESTS.find((q) => !S.you.quests[q.id]); if (!q || !q.stat.startsWith('b_')) return false;
  const type = q.stat.slice(2), d = BUILDINGS[type]; return !!d && S.you.level >= d.lvl && (!d.tech || S.you.tech[d.tech]) && canAfford(d.cost) && !isOpen('build') && !S.mode;
}

// ---------- quest tracker ----------
export const pinnedQuest = () => { const pin = store.get('pin', null); const q = pin && QUESTS.find((q) => q.id === pin && !S.you.quests[q.id]); return q || QUESTS.find((q) => !S.you.quests[q.id]) || null; };
function trackQuest() {
  const q = pinnedQuest(), tr = C.track; if (!q) { if (!tr.hidden) tr.hidden = true; return; }
  const v = Math.min(q.n, Math.floor(S.you.stats[q.stat] || 0)), key = q.id + '|' + v;
  if (C.tkey === key) return; const newQ = !C.tkey || C.tkey.split('|')[0] !== q.id; C.tkey = key; tr.hidden = false;
  tr.innerHTML = `<span class="pin">${icon('leaf', 26)}</span><b class="qt">${esc(q.text)}</b><span class="qp"><i style="transform:scaleX(${v / q.n})"></i></span><span class="qn">${v}/${q.n}</span><span class="hint">${esc(HINTS[q.id] || '')}</span>`;
  if (!newQ) pulse(tr, 1.05, 400); else if (!reduced()) try { tr.animate([{ transform: 'translateX(-30px) rotate(-6deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 520, easing: 'cubic-bezier(.3,1.5,.6,1)' }); } catch { /* ignore */ }
}

// ---------- festival bunting ----------
function festival(s) {
  const ev = s.valley.event, b = $('#festival'), on = !!(ev && ev.kind === 'festival'); const bun = $('#bunting');
  if (on) {
    if (b.hidden) { b.hidden = false; bun.hidden = false; document.body.classList.add('festive'); }
    const h = `${icon('festival', 22)}<b>Festival!</b><span class="cd" data-t="${ev.until}"></span><small>+25% XP, half price decor</small>`; if (b.dataset.h !== h) { b.dataset.h = h; b.innerHTML = h; }
  } else if (!b.hidden) { b.hidden = true; bun.hidden = true; document.body.classList.remove('festive'); }
}

// ---------- quick action: send the best job to an idle villager ----------
export function bestJob(vid) {
  const you = S.you, pub = myPub(), idle = you.villagers.filter((v) => v.state === 'idle' && (vid === undefined || v.id === vid)); if (!idle.length) return null;
  const v = idle[0], bs = pub.b, name = v.name;
  const T = (task, say) => ({ v, task, say });
  const site = bs.find((b) => b[4] < 1); if (site) return T({ k: 'bld', id: site[0] }, `${name} hurries to build!`);
  const up = you.buildings.find((b) => b.up && !you.villagers.some((w) => w.task && w.task.k === 'bld' && w.task.id === b.id)); if (up) return T({ k: 'bld', id: up.id }, `${name} helps upgrade`);
  const ripe = bs.find((b) => b[5] === 'ripe'); if (ripe) return T({ k: 'bld', id: ripe[0] }, `${name} goes to harvest!`);
  const pen = bs.find((b) => b[5] === 'ready'); if (pen) return T({ k: 'bld', id: pen[0] }, `${name} goes to collect`);
  const empty = bs.find((b) => b[5] === 'empty' && BUILDINGS[b[1]] && BUILDINGS[b[1]].field); if (empty) return T({ k: 'bld', id: empty[0] }, `${name} goes to sow`);
  const busy = you.buildings.find((b) => (b.queue && b.queue.length || b.research) && !you.villagers.some((w) => w.task && w.task.k === 'bld' && w.task.id === b.id)); if (busy) return T({ k: 'bld', id: busy.id }, `${name} gets to work`);
  const dock = bs.find((b) => b[1] === 'dock' && b[4] >= 1); if (dock && you.res.fish < you.cap * 0.5 && Math.random() < 0.4) return T({ k: 'bld', id: dock[0] }, `${name} goes fishing`);
  const raws = [['wood', 'tree', 'chop wood'], ['clay', 'clay', 'dig clay'], ['stone', 'rock', 'mine stone']].sort((a, b) => (you.res[a[0]] || 0) - (you.res[b[0]] || 0));
  for (const [g, nt, say] of raws) { const n = pub.n.find((n) => n[1] === nt && n[4]); if (n) return T({ k: 'node', id: n[0] }, `${name} goes to ${say}`); }
  const f = VALLEY_FIELDS.find((f) => f.res === raws[0][0]) || VALLEY_FIELDS[0]; return T({ k: 'valley', id: f.id }, `${name} heads to the ${f.name}`);
}
export function sendIdle(vid) {
  const j = bestJob(vid); if (!j) { toast('Everyone is busy. Lovely!', { icon: 'check', type: 'good' }); return; }
  const r = cmd({ op: 'assign', ...j.task, vid: j.v.id }); if (r && r.ok === false) return; toast(j.say, { icon: 'worker', type: 'good', key: 'quick' });
  const m = S.view.villagers.get(j.v.id); if (m) { const p = S.view.project(m.position.x, 1.6, m.position.z); if (p.vis) sparkAt(p.x, p.y, 6); S.view.celebrate('cheer', m.position.x, m.position.z); }
}

// ---------- world-anchored bits, once per frame ----------
const labels = new Map(), vlabels = new Map();
export function syncLabels() {
  const snap = S.snap, host = $('#popups'); if (!snap) return;
  for (const p of snap.players) {
    let l = labels.get(p.id); if (!l) { l = document.createElement('div'); l.className = 'label'; host.appendChild(l); labels.set(p.id, l); }
    const h = `${p.id === S.myId ? icon('star', 16) : ''}<span>${esc(p.name)}</span>${p.title ? `<small>${esc(p.title)}</small>` : ''}<span class="lv">${p.level}</span>${p.charm ? `<span class="ch">${icon('heart', 12)}${p.charm}</span>` : ''}${p.online ? '' : icon('sleep', 14)}`;
    if (l.dataset.h !== h) { l.dataset.h = h; l.innerHTML = h; }
  }
  for (const [id, l] of labels) if (!snap.players.some((p) => p.id === id)) { l.remove(); labels.delete(id); }
}
export function placeLabels() {
  const view = S.view; if (!view || !S.snap) return;
  for (const [id, m] of view.villagers) {
    if (m.userData.pid !== S.myId) continue;
    const ic = IDLE_ICON[m.userData.state]; let l = vlabels.get(id);
    if (!ic) { if (l && l.style.display !== 'none') l.style.display = 'none'; continue; }
    if (!l) { l = document.createElement('div'); l.className = 'label vbub'; $('#popups').appendChild(l); vlabels.set(id, l); }
    const sp = view.project(m.position.x, 1.5, m.position.z); if (l.dataset.st !== ic) { l.dataset.st = ic; l.innerHTML = icon(ic, 22); }
    const vis = sp.vis && view.look.dist < 40; l.style.display = vis ? '' : 'none'; if (vis) l.style.transform = `translate(${sp.x}px,${sp.y}px) translate(-50%,-100%)`;
  }
  for (const [id, l] of vlabels) if (!view.villagers.has(id)) { l.remove(); vlabels.delete(id); }
  for (const [id, l] of labels) { const V = view.villages.get(id); if (!V) { l.style.display = 'none'; continue; } const s = view.project(V.group.position.x, 3.4, V.group.position.z - 5); const vis = s.vis && view.look.dist < 70; l.style.display = vis ? '' : 'none'; if (vis) l.style.transform = `translate(${s.x}px,${s.y}px) translate(-50%,-100%)`; }
  placeMini();
}

// ---------- villager mini card ----------
function placeMini() {
  const m = C.mini, sel = S.selected; if (!sel || sel.k !== 'vil') { if (!m.hidden) m.hidden = true; return; }
  const v = S.you.villagers.find((v) => v.id === sel.id), vm = S.view.villagers.get(sel.id); if (!v || !vm) { if (!m.hidden) m.hidden = true; return; }
  const hpct = Math.round(v.hunger / 10) * 10, h = `<b>${esc(v.name)}</b><span class="ms">${stateText(v)}</span><span class="hb"><i style="width:${hpct}%"></i></span><span class="mb"><button class="mini-b" data-m="more">Details</button><button class="mini-b" data-m="stop" aria-label="Stop task">${icon('stop', 20)}</button><button class="mini-b x" data-m="x" aria-label="Close">${icon('close', 14)}</button></span>`;
  if (m.dataset.h !== h && !C.miniDown) { const fresh = m.hidden; m.dataset.h = h; m.innerHTML = h; if (fresh && !reduced()) try { m.animate([{ opacity: 0, scale: '.6' }, { opacity: 1, scale: '1' }], { duration: 300, easing: 'cubic-bezier(.3,1.6,.6,1)' }); } catch { /* ignore */ } }
  m.hidden = false; const sp = S.view.project(vm.position.x, 2.0, vm.position.z); const w = m.offsetWidth || 190, x = Math.max(w / 2 + 8, Math.min(innerWidth - w / 2 - 8, sp.x)), y = Math.max(120, Math.min(innerHeight - 190, sp.y - 8));
  m.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
}
