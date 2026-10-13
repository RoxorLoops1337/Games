// Hearthvale client: title screen, HUD, input, panels.
import { View } from './scene.js';
import { soloLink, wsLink } from './net.js';
import { findSpot as _fs } from '../shared/sim.js';
import { BUILDINGS, RECIPES, TECH, MAX_BLD_LEVEL, upgradeCost, upgradeNeedsLevel, UPGRADE_NOTE, ICON, GOODS, SELL, QUESTS, LEVEL_XP, VALLEY_LEVEL_XP, PLOT, VALLEY_FIELDS, NODE_TYPES } from '../shared/data.js';

const $ = (s) => document.querySelector(s);
const qs = new URLSearchParams(location.search);
const view = new View($('#gl'));
let link = null, snap = null, you = null, myId = null, mode = null, selected = null, panel = null, prevSnapT = 0;
const labels = new Map();
const HINTS = { q_wood: 'Tap a tree to send a villager', q_house: 'Build > Cottage, tap the grass, Place', q_farm: 'Build > Wheat Field, then tap it to sow', q_wheat: 'Tap the field when it is golden', q_kitch: 'Build > Kitchen', q_soup: 'Tap the Kitchen, cook soup', q_hire: 'Tap the Hearth Hall', q_lvl2: 'Keep gathering and building to earn XP', q_order: 'Open the Valley board 📜 and tap Give', q_saw: 'Needs level 2', q_plank: 'Tap the Sawmill, saw planks', q_study: 'Needs level 3', q_lvl5: 'Fill Valley orders for big XP' };

// ---------- tiny synth sfx ----------
let ac = null;
function sfx(kind) {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume();
    const t = ac.currentTime, seq = { pop: [[660, 0.06]], done: [[523, 0.08], [659, 0.08], [784, 0.14]], level: [[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.25]], bad: [[200, 0.12]], click: [[500, 0.03]], coin: [[988, 0.05], [1319, 0.1]] }[kind] || [];
    let at = t; for (const [f, d] of seq) { const o = ac.createOscillator(), g = ac.createGain(); o.type = kind === 'bad' ? 'square' : 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.12, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + d); o.connect(g).connect(ac.destination); o.start(at); o.stop(at + d + 0.02); at += d * 0.9; }
  } catch {}
}
const toast = (text) => { const d = document.createElement('div'); d.className = 't'; d.textContent = text; $('#toast').appendChild(d); setTimeout(() => d.remove(), 3100); while ($('#toast').children.length > 4) $('#toast').firstChild.remove(); };
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const costStr = (cost, have) => Object.entries(cost).map(([k, n]) => { const h = k === 'coins' ? you.coins : you.res[k]; return `<span class="${h < n ? 'bad' : ''}">${ICON[k]}${n}</span>`; }).join(' ');
const canAfford = (cost) => Object.entries(cost).every(([k, n]) => (k === 'coins' ? you.coins : you.res[k]) >= n);
const myPub = () => snap && snap.players.find(p => p.id === myId);
const cmd = (c) => { sfx('click'); return link.cmd(c); };

// ---------- start ----------
const tokenKey = 'hearthvale.token';
let token = null; try { token = localStorage.getItem(tokenKey); } catch {}
if (!token) { token = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join(''); try { localStorage.setItem(tokenKey, token); } catch {} }
try { $('#nameIn').value = localStorage.getItem('hearthvale.name') || ''; } catch {}
const defaultServer = qs.get('server') || (/pages\.dev|github\.io/.test(location.host) ? '' : (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
try { $('#srvIn').value = localStorage.getItem('hearthvale.server') || defaultServer; } catch { $('#srvIn').value = defaultServer; }
const nameVal = () => ($('#nameIn').value.trim() || 'Newbrook').slice(0, 16);
$('#goSolo').onclick = () => { try { localStorage.setItem('hearthvale.name', nameVal()); } catch {} begin(soloLink(nameVal(), token)); };
$('#goServer').onclick = () => {
  let url = $('#srvIn').value.trim(); if (!url) { $('#titleMsg').textContent = 'Type the server address first.'; return; }
  if (!/^wss?:\/\//.test(url)) url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + url;
  try { localStorage.setItem('hearthvale.name', nameVal()); localStorage.setItem('hearthvale.server', url); } catch {}
  $('#titleMsg').textContent = 'Connecting...';
  begin(wsLink(url, nameVal(), token, { onFull: () => { $('#title').hidden = false; $('#hud').hidden = true; $('#titleMsg').textContent = 'That valley is full (16 villages).'; }, onState: (s) => setConn(s) }));
};
if (qs.get('solo') !== null) setTimeout(() => $('#goSolo').click(), 0);
if (qs.get('server') && qs.get('auto') !== null) setTimeout(() => $('#goServer').click(), 0);
function setConn(s) { $('#conn').textContent = link.kind === 'solo' ? 'Solo' : s === 'online' ? '🟢 ' + link.lag + ' ms' : '🟠 ' + s; }

function begin(l) {
  link = l; l.onNack = (err) => { toast(err); sfx('bad'); };
  let first = true;
  l.onSnap = (s) => {
    snap = s; myId = l.id; you = s.you;
    if (!you) return;
    view.sync(s, myId); view.setTime(s.t + 60);
    if (first) { first = false; $('#title').hidden = true; $('#hud').hidden = false; view.focusVillage(myId, 26); setupHud(); }
    onSnap(s);
  };
}

// ---------- HUD ----------
function setupHud() {
  $('#bBuild').onclick = () => { closeSheet(); openBuildMenu(); };
  $('#bHome').onclick = () => { view.focusVillage(myId, 24); view.goal.yaw = 0; sfx('click'); };
  $('#bValley').onclick = () => { view.focus(0, 0, 30); openPanel('valley'); };
  document.querySelectorAll('#tools button').forEach(b => b.onclick = () => openPanel(b.dataset.p));
  $('#placeOk').onclick = confirmPlace; $('#placeNo').onclick = cancelPlace;
}
function onSnap(s) {
  $('#pname').textContent = myPub() ? myPub().name : '';
  $('#plvl').textContent = you.level;
  const lo = LEVEL_XP[you.level - 1], hi = LEVEL_XP[you.level] || lo + 1;
  $('#xpbar').style.width = Math.min(100, ((you.xp - lo) / (hi - lo)) * 100) + '%';
  const shown = GOODS.filter(g => you.res[g] > 0 || ['wood', 'clay', 'stone', 'wheat', 'soup'].includes(g));
  $('#res').innerHTML = `<span class="chip">🪙 ${you.coins}</span>` + shown.map(g => `<span class="chip ${you.res[g] >= you.cap ? 'full' : you.res[g] === 0 ? 'dim' : ''}" title="${g}">${ICON[g]} ${you.res[g]}</span>`).join('');
  setConn(link.state || 'online');
  const q = QUESTS.find(q => !you.quests[q.id]); const tr = $('#track');
  if (q) { const v = Math.min(q.n, you.stats[q.stat] || 0); tr.hidden = false; tr.innerHTML = `<b>📋 ${q.text}</b><div class="bar"><i style="width:${v / q.n * 100}%"></i></div><div class="hint">${HINTS[q.id] || ''}</div>`; tr.onclick = () => openPanel('quests'); } else tr.hidden = true;
  for (const p of you.popups || []) popup(p);
  for (const e of s.events || []) {
    if (e.t === 'levelup' && e.pid === myId) { toast('🎉 Village level ' + e.level + '!'); sfx('level'); const V = view.villages.get(myId); if (V) view.burst(V.group.position.x, V.group.position.z); }
    else if (e.t === 'quest' && e.pid === myId) { toast('📋 Quest complete!'); sfx('coin'); }
    else if (e.t === 'built' && e.pid === myId) { sfx('done'); const V = view.villages.get(myId); const m = V && V.b.get(e.id); if (m) view.burst(V.group.position.x + m.position.x, V.group.position.z + m.position.z, '#fff3a0'); }
    else if (e.t === 'order') { toast('📜 A Valley order was finished!'); sfx('done'); }
    else if (e.t === 'valleylevel') toast('🌄 The Valley reached level ' + e.level + '!');
    else if (e.t === 'emote') { const p = s.players.find(p => p.id === e.pid); if (p) { const V = view.villages.get(p.id); if (V) popupAt(V.group.position.x, 3.5, V.group.position.z, e.e); } }
  }
  if (selected) refreshSheet();
  if (panel) refreshPanel();
  updateLabels();
}
function popup(p) { popupAt(p.x, 1.8, p.z, p.text); sfx('pop'); }
function popupAt(x, y, z, text) {
  const s = view.project(x, y, z); if (!s.vis) return;
  const d = document.createElement('div'); d.className = 'pop'; d.textContent = text; d.style.left = s.x + 'px'; d.style.top = s.y + 'px'; $('#popups').appendChild(d); setTimeout(() => d.remove(), 1500);
}
function updateLabels() {
  for (const p of snap.players) {
    let l = labels.get(p.id); if (!l) { l = document.createElement('div'); l.className = 'label'; $('#popups').appendChild(l); labels.set(p.id, l); }
    l.textContent = `${p.id === myId ? '⭐ ' : ''}${p.name}  Lv${p.level}${p.online ? '' : ' 💤'}`; l.style.color = '#fff';
  }
  for (const [id, l] of labels) if (!snap.players.some(p => p.id === id)) { l.remove(); labels.delete(id); }
}
const vlabels = new Map();
function placeLabels() {
  for (const [id, m] of view.villagers) {
    if (m.userData.pid !== myId) continue;
    const ic = { idle: '💤', hungry: '😫', blocked: '⏳', full: '📦' }[m.userData.state];
    let l = vlabels.get(id);
    if (!ic) { if (l) l.style.display = 'none'; continue; }
    if (!l) { l = document.createElement('div'); l.className = 'label'; l.style.fontSize = '16px'; $('#popups').appendChild(l); vlabels.set(id, l); }
    const sp = view.project(m.position.x, 1.5, m.position.z); l.textContent = ic; l.style.display = sp.vis && view.look.dist < 40 ? '' : 'none'; l.style.left = sp.x + 'px'; l.style.top = sp.y + 'px';
  }
  for (const [id, l] of vlabels) if (!view.villagers.has(id)) { l.remove(); vlabels.delete(id); }
  for (const [id, l] of labels) { const V = view.villages.get(id); if (!V) { l.style.display = 'none'; continue; } const s = view.project(V.group.position.x, 3.4, V.group.position.z - 5); l.style.display = s.vis && view.look.dist < 70 ? '' : 'none'; l.style.left = s.x + 'px'; l.style.top = s.y + 'px'; }
}

// a press on a panel pauses its refresh so a tap never lands on a button that was just rebuilt
let pressed = false;
for (const id of ['#panel', '#sheet']) { const e = $(id); e.addEventListener('pointerdown', () => { pressed = true; }); for (const ev of ['pointerup', 'pointercancel']) e.addEventListener(ev, () => { pressed = false; setTimeout(() => { if (panel) refreshPanel(); if (selected && selected.k) refreshSheet(); }, 30); }); }
// ---------- panels ----------
function openPanel(name) { if (panel === name) { closePanel(); return; } panel = name; $('#panel').hidden = false; refreshPanel(true); }
function closePanel() { panel = null; $('#panel').hidden = true; }
let chatDraft = '';
function refreshPanel(force) {
  const el = $('#panel'); if (!panel || (pressed && !force)) return;
  if (panel === 'chat' && !force && document.activeElement && document.activeElement.id === 'chatIn') { renderChatLog(); return; }
  const head = (t) => `<h3>${t}<button class="x" id="px">✖</button></h3>`;
  let h = '';
  if (panel === 'quests') {
    h = head('📋 Quests') + QUESTS.map(q => { const v = Math.min(q.n, you.stats[q.stat] || 0), done = you.quests[q.id]; return `<div class="order ${done ? 'done' : ''}"><b>${done ? '✅' : '▫️'} ${q.text}</b><div class="bar"><i style="width:${v / q.n * 100}%"></i></div><div class="small">${v}/${q.n} · Reward ${Object.entries(q.reward).map(([k, n]) => ICON[k] + n).join(' ')}</div></div>`; }).join('');
  } else if (panel === 'valley') {
    const V = snap.valley, lo = VALLEY_LEVEL_XP[V.level - 1], hi = VALLEY_LEVEL_XP[V.level] || lo + 1;
    h = head('🌄 Valley board · Lv ' + V.level) + `<div class="bar"><i style="width:${Math.min(100, (V.xp - lo) / (hi - lo) * 100)}%"></i></div><div class="small">Everyone fills these orders together. Rewards are shared by how much you gave.</div>`;
    h += `<div class="row small" style="margin:6px 0">${V.fields.map(f => { const d = VALLEY_FIELDS.find(x => x.id === f.id); return `<span class="chip" data-f="${f.id}">${ICON[d.res]} ${Math.round(f.stock / 10) * 10}</span>`; }).join('')}</div>`;
    h += V.orders.map(o => `<div class="order ${o.done ? 'done' : ''}"><b>Order #${o.id}</b> ${o.done ? '✅ Done!' : ''}${Object.keys(o.need).map(g => `<div class="need"><span>${ICON[g]}</span><div class="bar"><i style="width:${o.got[g] / o.need[g] * 100}%"></i></div><span>${o.got[g]}/${o.need[g]}</span>${o.done || o.got[g] >= o.need[g] ? '' : `<button data-o="${o.id}" data-g="${g}">Give</button>`}</div>`).join('')}<div class="small">Reward ${o.reward.coins}🪙 ${o.reward.scrolls}📜 ${o.reward.xp}xp${o.contrib[myId] ? ' · you gave ' + o.contrib[myId] : ''}</div></div>`).join('');
  } else if (panel === 'players') {
    h = head('👥 Villages (' + snap.players.length + '/16)') + [...snap.players].sort((a, b) => b.level - a.level).map(p => `<div class="pl" data-p="${p.id}"><span class="dot" style="background:${p.color}"></span><b>${esc(p.name)}</b><span class="small">Lv ${p.level} ${p.online ? '🟢' : '💤'}</span><span style="flex:1"></span><button>Visit</button></div>`).join('');
  } else if (panel === 'chat') {
    h = head('💬 Chat') + `<div class="chatlog" id="chatlog"></div><input id="chatIn" maxlength="120" placeholder="Say hello..." value="${esc(chatDraft)}"><div class="emotes">${['👋', '❤️', '😂', '🎉', '🙏', '🌾'].map(e => `<button data-e="${e}">${e}</button>`).join('')}</div>`;
  } else if (panel === 'menu') {
    h = head('⚙️ Menu') + `<div class="row"><button id="mRename">✏️ Rename village</button>${link.kind === 'solo' ? '<button id="mReset">🗑 New solo game</button>' : ''}<button id="mFs">⛶ Fullscreen</button></div><p class="small">${link.kind === 'solo' ? 'Solo mode: five friendly neighbour villages share your valley. Your game saves in this browser.' : 'Connected to a server. Your village is tied to this browser, so keep your link.'}</p><p class="small">Controls: drag to pan, pinch or wheel to zoom, right-drag or two fingers to rotate. Tap trees, rocks and clay to send a villager. Tap buildings to use them.</p>`;
  }
  if (!force && el.dataset.h === h) { if (panel === 'chat') renderChatLog(); return; }
  const keep = el.scrollTop; el.dataset.h = h; el.innerHTML = h; el.scrollTop = keep;
  $('#px').onclick = closePanel;
  el.querySelectorAll('[data-o]').forEach(b => b.onclick = () => { const o = snap.valley.orders.find(o => o.id == b.dataset.o); const g = b.dataset.g; cmd({ op: 'contribute', id: o.id, res: g, n: o.need[g] - o.got[g] }); });
  el.querySelectorAll('[data-f]').forEach(c => c.onclick = () => { cmd({ op: 'assign', k: 'valley', id: c.dataset.f }); toast('Villager sent to the field'); });
  el.querySelectorAll('.pl').forEach(r => r.onclick = () => { view.focusVillage(r.dataset.p, 26); });
  if (panel === 'chat') {
    renderChatLog(); const inp = $('#chatIn'); inp.oninput = () => chatDraft = inp.value;
    inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter' && inp.value.trim()) { link.cmd({ op: 'chat', text: inp.value }); chatDraft = ''; inp.value = ''; } };
    el.querySelectorAll('[data-e]').forEach(b => b.onclick = () => link.cmd({ op: 'emote', e: b.dataset.e }));
  }
  if (panel === 'menu') {
    $('#mRename').onclick = () => { const n = prompt('Village name', myPub().name); if (n) link.cmd({ op: 'rename', name: n }); };
    const r = $('#mReset'); if (r) r.onclick = () => { if (confirm('Delete your solo game and start over?')) link.reset(); };
    $('#mFs').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen && document.documentElement.requestFullscreen());
  }
}
function renderChatLog() { const l = $('#chatlog'); if (!l) return; l.innerHTML = snap.chat.map(c => `<div><b style="color:${c.color}">${esc(c.name)}</b> ${esc(c.text)}</div>`).join(''); l.scrollTop = 1e6; }

// ---------- build menu & placing ----------
function openBuildMenu() {
  const s = $('#sheet'); s.hidden = false; selected = { menu: true };
  const rows = Object.entries(BUILDINGS).filter(([, d]) => !d.hidden).map(([id, d]) => {
    const lock = you.level < d.lvl ? 'Level ' + d.lvl : d.tech && !you.tech[d.tech] ? 'Research ' + TECH[d.tech].name : null;
    return `<div class="card ${lock ? 'lock' : ''}" data-b="${id}"><div class="nm">${d.name}</div><div class="small">${d.w}×${d.h}</div><div class="cost">${lock ? '🔒 ' + lock : costStr(d.cost)}</div></div>`;
  }).join('');
  s.innerHTML = `<h3>🔨 Build<button class="x" id="sx">✖</button></h3><div class="grid">${rows}</div>`;
  $('#sx').onclick = closeSheet;
  s.querySelectorAll('[data-b]').forEach(c => c.onclick = () => startPlace(c.dataset.b));
}
function startPlace(type, moveId = null) {
  const d = BUILDINGS[type]; if (!d || d.hidden) return; const lock = you.level < d.lvl ? 'Reach level ' + d.lvl : d.tech && !you.tech[d.tech] ? 'Research ' + TECH[d.tech].name + ' first' : !moveId && !canAfford(d.cost) ? 'Not enough resources' : null;
  if (lock) { toast(lock); sfx('bad'); return; }
  closeSheet(); mode = { type, moveId }; view.setGhost(type, myPub().color);
  const spot = _fs(fakeP(), d.w, d.h, 0) || { x: 0, y: 0 }; ghostTo(spot.x, spot.y);
  $('#place').hidden = false; $('#placeName').textContent = (moveId ? 'Move ' : 'Place ') + d.name; $('#bottom').hidden = true;
}
// a stand-in village for the client-side placement check (matches the server rule)
function fakeP() {
  const p = myPub(); return { buildings: [{ x: 6, y: 6, w: 3, h: 3, id: 0 }, ...p.b.filter(b => !(mode && b[0] === mode.moveId)).map(b => ({ id: b[0], x: b[2], y: b[3], w: (BUILDINGS[b[1]] || { w: 3 }).w, h: (BUILDINGS[b[1]] || { h: 3 }).h }))].filter((b, i, a) => a.findIndex(o => o.id === b.id) === i), nodes: p.n.map(n => ({ x: n[2], y: n[3] })) };
}
function ghostTo(tx, ty) {
  const G = view.ghost; if (!G) return; const d = G.d; tx = Math.max(0, Math.min(PLOT - d.w, tx)); ty = Math.max(0, Math.min(PLOT - d.h, ty));
  const P = fakeP(); const ok = P.buildings.concat([]).every(b => !(tx < b.x + b.w && b.x < tx + d.w && ty < b.y + b.h && b.y < ty + d.h)) && P.nodes.every(n => !(tx < n.x + 1 && n.x < tx + d.w && ty < n.y + 1 && n.y < ty + d.h));
  view.moveGhost(view.villages.get(myId), tx, ty, ok);
}
function confirmPlace() {
  const G = view.ghost; if (!G) return;
  if (!G.ok) { toast('Something is in the way'); sfx('bad'); return; }
  if (mode.moveId) cmd({ op: 'move', id: mode.moveId, x: G.x, y: G.y }); else cmd({ op: 'place', type: mode.type, x: G.x, y: G.y });
  cancelPlace();
}
function cancelPlace() { mode = null; view.setGhost(null); view.hideGrids(); $('#place').hidden = true; $('#bottom').hidden = false; }

// ---------- selection sheet ----------
function closeSheet() { selected = null; $('#sheet').hidden = true; view.select(null); }
let sheetKey = '';
function sheet(html) { const s = $('#sheet'); s.hidden = false; const same = s.dataset.h === html && sheetKey === JSON.stringify(selected); if (!same) { const keep = s.scrollTop; s.dataset.h = html; sheetKey = JSON.stringify(selected); s.innerHTML = html; s.scrollTop = keep; } const x = $('#sx'); if (x) x.onclick = closeSheet; s.same = same; return s; }
function refreshSheet() { if (pressed) return; if (selected && selected.k) showSelection(selected, true); else if (selected && selected.menu) { /* keep menu stable */ } }
function showSelection(sel, silent) {
  selected = sel;
  if (sel.k === 'bld') {
    const mine = sel.pid === myId; const pub = snap.players.find(p => p.id === sel.pid); const b = pub && pub.b.find(x => x[0] === sel.id); if (!b) { closeSheet(); return; }
    const type = b[1], d = BUILDINGS[type] || { name: type, w: 2, h: 2 }; const st = mine && you.buildings.find(x => x.id === sel.id);
    let h = `<h3>${d.name}<button class="x" id="sx">✖</button></h3>`;
    if (!mine) { h += `<div class="small">Belongs to ${esc(pub.name)}</div>`; return sheet(h); }
    if (b[4] < 1) { h += `<div class="bar"><i style="width:${Math.round(b[4] * 20) * 5}%"></i></div><div class="small">Under construction. A villager is on the way.</div><div class="row" style="margin-top:8px"><button id="aHelp">👷 Send a builder</button><button id="aDem">🗑 Cancel</button></div>`; const s = sheet(h); $('#aHelp').onclick = () => cmd({ op: 'assign', k: 'bld', id: sel.id }); $('#aDem').onclick = () => { cmd({ op: 'demolish', id: sel.id }); closeSheet(); }; return; }
    if (type === 'hall') {
      h += `<div>Villagers ${you.villagers.length}/${you.housing} · Storage ${you.cap} per good · Level ${you.level}</div><div class="row" style="margin:8px 0"><button id="aHire" ${you.villagers.length >= you.housing ? 'disabled' : ''}>🧑‍🌾 Welcome a villager (${costStr(you.hire)})</button></div>`;
      h += you.villagers.length >= you.housing ? '<div class="small">Build more Cottages to make room.</div>' : '';
      h += '<div class="small">Villagers</div>' + you.villagers.map(v => `<div class="pl" data-v="${v.id}"><b>${esc(v.name)}</b><span class="small">${stateText(v)}</span><span style="flex:1"></span><span class="small">🍲 ${Math.round(v.hunger / 10) * 10}%</span></div>`).join('');
      const s = sheet(h); const hb = $('#aHire'); if (hb) hb.onclick = () => cmd({ op: 'hire' }); s.querySelectorAll('[data-v]').forEach(r => r.onclick = () => showSelection({ k: 'vil', id: +r.dataset.v, pid: myId })); return;
    }
    if (d.field) {
      const stg = b[5], txt = stg === 'empty' ? 'Ready to sow' : stg === 'grow' ? 'Growing ' + Math.round(b[6] * 10) * 10 + '%' : 'Ripe, ready to harvest!';
      h += `<div>${txt}</div><div class="row" style="margin-top:8px"><button id="aGo" ${stg === 'grow' ? 'disabled' : ''}>${stg === 'ripe' ? '🌾 Harvest' : '🌱 Sow'}</button>`;
    } else if (d.craft) {
      h += `<div class="row">`;
      for (const r of d.craft) { const rc = RECIPES[r]; h += `<button data-r="${r}" ${canAfford(rc.in) ? '' : 'disabled'}>${ICON[r]} ${r} ×1 <span class="small">(${costStr(rc.in)})</span></button><button data-r5="${r}">×5</button>`; }
      h += `</div>`;
      if (st && st.queue.length) h += '<div class="small" style="margin-top:6px">Queue: ' + st.queue.map((q, i) => `<span class="chip" data-dq="${i}">${ICON[q.recipe]}×${q.n}${q.started ? ' ⏳' : ''} ✖</span>`).join(' ') + '</div>';
      if (d.research) {
        h += '<div class="small" style="margin-top:8px">Research</div><div class="grid">' + Object.entries(TECH).map(([id, t]) => `<div class="card ${you.tech[id] ? 'lock' : ''}" data-t="${id}"><div class="nm">${t.name}</div><div class="small">${t.desc}</div><div class="cost">${you.tech[id] ? '✅ Learned' : (you.res.scrolls < t.scrolls ? '<span class="bad">' : '<span>') + '📜' + t.scrolls + '</span>'}</div></div>`).join('') + '</div>';
        if (st && st.research) h += `<div class="small">Studying ${TECH[st.research.tech].name}... ${Math.ceil(st.research.left / 5) * 5}s</div>`;
      }
      h += `<div class="row" style="margin-top:8px">`;
    } else if (d.market) {
      h += '<div class="small">Sell goods for coins</div><div class="grid">' + GOODS.filter(g => you.res[g] > 0).map(g => `<div class="card" data-s="${g}">${ICON[g]} ${you.res[g]}<div class="small">${SELL[g]}🪙 each</div></div>`).join('') + '</div><div class="row" style="margin-top:8px">';
    } else { h += `<div class="small">${d.decor ? 'A lovely decoration (+charm).' : ''}</div><div class="row">`; }
    {
      const lvl = (st && st.lvl) || 1; const need = upgradeNeedsLevel(type, lvl);
      if (st && st.up) h += `<div class="small" style="width:100%">⬆ Upgrading... ${Math.round((b[8] || 0) * 10) * 10}%</div>`;
      else if (lvl < MAX_BLD_LEVEL) { const cost = upgradeCost(type, lvl); h += `<button id="aUp" ${you.level >= need && canAfford(cost) ? '' : 'disabled'}>⬆ Level ${lvl + 1} <span class="small">${you.level < need ? '(village Lv ' + need + ')' : costStr(cost)}</span></button>`; }
      h = h.replace(/<h3>([^<]*)</, `<h3>$1 <span class="small">★${lvl} · ${UPGRADE_NOTE[type] || ''}</span><`);
    }
    h += `<button id="aSend">👷 Send villager</button><button id="aMove">✋ Move</button><button id="aDem">🗑 Demolish</button></div>`;
    const s = sheet(h);
    const go = $('#aGo'); if (go) go.onclick = () => cmd({ op: 'assign', k: 'bld', id: sel.id });
    s.querySelectorAll('[data-r]').forEach(b => b.onclick = () => cmd({ op: 'queue', id: sel.id, recipe: b.dataset.r, n: 1 }));
    s.querySelectorAll('[data-r5]').forEach(b => b.onclick = () => cmd({ op: 'queue', id: sel.id, recipe: b.dataset.r5, n: 5 }));
    s.querySelectorAll('[data-dq]').forEach(b => b.onclick = () => cmd({ op: 'dequeue', id: sel.id, i: +b.dataset.dq }));
    s.querySelectorAll('[data-t]').forEach(b => b.onclick = () => cmd({ op: 'research', id: sel.id, tech: b.dataset.t }));
    s.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { cmd({ op: 'sell', res: b.dataset.s, n: 10 }); sfx('coin'); });
    const up = $('#aUp'); if (up) up.onclick = () => cmd({ op: 'upgrade', id: sel.id });
    $('#aSend').onclick = () => cmd({ op: 'assign', k: 'bld', id: sel.id });
    $('#aMove').onclick = () => startPlace(type, sel.id);
    $('#aDem').onclick = () => { if (confirm('Demolish ' + d.name + '? You get part of the cost back.')) { cmd({ op: 'demolish', id: sel.id }); closeSheet(); } };
  } else if (sel.k === 'vil') {
    const v = you.villagers.find(v => v.id === sel.id); if (!v || sel.pid !== myId) { closeSheet(); return; }
    const s = sheet(`<h3>🧑‍🌾 ${esc(v.name)}<button class="x" id="sx">✖</button></h3><div>${stateText(v)}</div><div class="bar"><i style="width:${Math.round(v.hunger / 10) * 10}%"></i></div><div class="small">Hunger (eats soup automatically)</div><div class="row" style="margin-top:8px"><button id="vRecall">🛑 Stop task</button></div><div class="small" style="margin-top:6px">Now tap something to give this villager a job.</div>`);
    $('#vRecall').onclick = () => cmd({ op: 'recall', vid: v.id });
  }
}
const stateText = (v) => ({ idle: '😴 Idle', walk: '🚶 Walking', work: '⛏ Working', build: '🔨 Building', hungry: '😫 Hungry, no soup!', blocked: '⏳ Waiting for ingredients', full: '📦 Storage full' }[v.state] || v.state);
let chosenVillager = null;

// ---------- input ----------
const cv = $('#gl'); const ptrs = new Map(); let tap = null, lastPinch = null;
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button });
  tap = ptrs.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 } : null; lastPinch = null;
});
cv.addEventListener('pointermove', (e) => {
  const p = ptrs.get(e.pointerId); if (!p) { hoverGhost(e); return; }
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  const L = view.goal;
  if (ptrs.size === 1) {
    if (tap) tap.moved += Math.abs(dx) + Math.abs(dy);
    if (p.b === 2) { L.yaw -= dx * 0.006; L.pitch = Math.max(0.35, Math.min(1.35, L.pitch + dy * 0.004)); }
    else if (!tap || tap.moved > 6) pan(dx, dy);
  } else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()]; const dist = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
    if (lastPinch) { L.dist = Math.max(8, Math.min(90, L.dist * (lastPinch.d / dist))); L.yaw -= (ang - lastPinch.a); }
    lastPinch = { d: dist, a: ang }; if (tap) tap.moved = 99;
  }
});
function pan(dx, dy) {
  const L = view.goal, s = L.dist * 0.0022, c = Math.cos(L.yaw), si = Math.sin(L.yaw);
  L.x += -c * dx * s - si * dy * s; L.z += si * dx * s - c * dy * s;
  // forward = -(sin, cos); dragging down moves the target forward
  const r = Math.hypot(L.x, L.z); if (r > 62) { L.x *= 62 / r; L.z *= 62 / r; }
}
cv.addEventListener('pointerup', (e) => {
  const was = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); lastPinch = null;
  if (tap && was && ptrs.size === 0 && tap.moved <= 6 && performance.now() - tap.t < 500 && was.b !== 2) onTap(e.clientX, e.clientY);
  tap = null;
});
cv.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); tap = null; });
cv.addEventListener('wheel', (e) => { e.preventDefault(); view.goal.dist = Math.max(8, Math.min(90, view.goal.dist * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const L = view.goal, s = L.dist * 0.04;
  if (e.key === 'Escape') { if (mode) cancelPlace(); else { closeSheet(); closePanel(); } }
  else if (e.key === 'b') $('#bBuild').click(); else if (e.key === 'h') $('#bHome').click(); else if (e.key === 'v') $('#bValley').click();
  else if (e.key === 'q') L.yaw += 0.2; else if (e.key === 'e') L.yaw -= 0.2;
  else if (e.key === 'ArrowLeft' || e.key === 'a') { L.x -= Math.cos(L.yaw) * s; L.z += Math.sin(L.yaw) * s; }
  else if (e.key === 'ArrowRight' || e.key === 'd') { L.x += Math.cos(L.yaw) * s; L.z -= Math.sin(L.yaw) * s; }
  else if (e.key === 'ArrowUp' || e.key === 'w') { L.x -= Math.sin(L.yaw) * s; L.z -= Math.cos(L.yaw) * s; }
  else if (e.key === 'ArrowDown' || e.key === 's') { L.x += Math.sin(L.yaw) * s; L.z += Math.cos(L.yaw) * s; }
  else if (e.key === 'Enter' && mode) confirmPlace();
});
function hoverGhost(e) { if (!mode || e.pointerType === 'touch') return; const V = view.villages.get(myId), t = view.tileAt(V, e.clientX, e.clientY); if (t) ghostTo(t.tx - Math.floor(view.ghost.d.w / 2), t.ty - Math.floor(view.ghost.d.h / 2)); }
function onTap(x, y) {
  if (!link) return;
  if (mode) { const V = view.villages.get(myId), t = view.tileAt(V, x, y); if (t) ghostTo(t.tx - Math.floor(view.ghost.d.w / 2), t.ty - Math.floor(view.ghost.d.h / 2)); return; }
  const hit = view.pick(x, y);
  if (!hit) { closeSheet(); return; }
  if (hit.k === 'board') { view.focus(0, 0, 28); openPanel('valley'); return; }
  if (hit.k === 'valley') { const r = cmd({ op: 'assign', k: 'valley', id: hit.id }); if (r && r.ok !== false) toast('Villager heads to the ' + VALLEY_FIELDS.find(f => f.id === hit.id).name); return; }
  if (hit.pid !== myId) { closePanel(); if (hit.k === 'bld' || hit.k === 'vil') { view.focusVillage(hit.pid, 26); const p = snap.players.find(p => p.id === hit.pid); toast(p ? p.name + "'s village · Lv " + p.level : ''); } return; }
  if (hit.k === 'node') {
    const chosen = selected && selected.k === 'vil' ? selected.id : undefined;
    cmd({ op: 'assign', k: 'node', id: hit.id, vid: chosen }); view.select(hit.obj, 0.7); setTimeout(() => view.select(null), 700); return;
  }
  if (hit.k === 'bld') {
    if (selected && selected.k === 'vil') { cmd({ op: 'assign', k: 'bld', id: hit.id, vid: selected.id }); }
    closePanel(); view.select(hit.obj, 1.4); showSelection({ k: 'bld', id: hit.id, pid: hit.pid }); return;
  }
  if (hit.k === 'vil') { closePanel(); view.select(hit.obj, 0.5); showSelection({ k: 'vil', id: hit.id, pid: hit.pid }); }
}

// ---------- main loop ----------
let lastT = performance.now();
function loop(t) { const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t; view.frame(dt); placeLabels(); requestAnimationFrame(loop); }
requestAnimationFrame(loop);
window.__hv = { view, get snap() { return snap; }, get link() { return link; }, cmd: (c) => link.cmd(c) };
