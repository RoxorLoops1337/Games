// Hearthvale client: title screen, HUD, input, panels.
import { View } from './scene.js';
import { icon } from './icons.js';
import { soloLink, wsLink } from './net.js';
import { toggleAudio, setAmbient, audioOn, wantsMusic } from './audio.js';
import { findSpot as _fs } from '../shared/sim.js';
import { BUILDINGS, RECIPES, TECH, MAX_BLD_LEVEL, upgradeCost, upgradeNeedsLevel, UPGRADE_NOTE, ICON, GOODS, SELL, QUESTS, LEVEL_XP, VALLEY_LEVEL_XP, PLOT, VALLEY_FIELDS, NODE_TYPES } from '../shared/data.js';

const $ = (s) => document.querySelector(s);
const qs = new URLSearchParams(location.search);
const view = new View($('#gl'));
let link = null, snap = null, you = null, myId = null, mode = null, selected = null, panel = null, prevSnapT = 0;
document.querySelectorAll('[data-ic]').forEach(e => { e.innerHTML = icon(e.dataset.ic, +e.dataset.s || 20); });
const labels = new Map(); const known = new Map(); let chatLog = [];
const HINTS = { q_wood: 'Tap a tree to send a villager', q_house: 'Build > Cottage, tap the grass, Place', q_farm: 'Build > Wheat Field, then tap it to sow', q_wheat: 'Tap the field when it is golden', q_kitch: 'Build > Kitchen', q_soup: 'Tap the Kitchen, cook soup', q_hire: 'Tap the Hearth Hall', q_lvl2: 'Keep gathering and building to earn XP', q_order: 'Open the Valley board and tap Give', q_saw: 'Needs level 2', q_plank: 'Tap the Sawmill, saw planks', q_study: 'Needs level 3', q_lvl5: 'Fill Valley orders for big XP' };

// ---------- tiny synth sfx ----------
let ac = null;
function sfx(kind) {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume();
    const t = ac.currentTime, seq = { pop: [[660, 0.06]], done: [[523, 0.08], [659, 0.08], [784, 0.14]], level: [[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.25]], bad: [[200, 0.12]], click: [[500, 0.03]], coin: [[988, 0.05], [1319, 0.1]] }[kind] || [];
    let at = t; for (const [f, d] of seq) { const o = ac.createOscillator(), g = ac.createGain(); o.type = kind === 'bad' ? 'square' : 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.12, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + d); o.connect(g).connect(ac.destination); o.start(at); o.stop(at + d + 0.02); at += d * 0.9; }
  } catch {}
}
const toast = (text, ic) => { const d = document.createElement('div'); d.className = 't'; d.innerHTML = (ic ? `<span class="ti">${icon(ic, 22)}</span>` : '') + `<span>${esc(text)}</span>`; $('#toast').appendChild(d); setTimeout(() => d.remove(), 3100); while ($('#toast').children.length > 4) $('#toast').firstChild.remove(); };
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const costStr = (cost, have) => Object.entries(cost).map(([k, n]) => { const h = k === 'coins' ? you.coins : you.res[k]; return `<span class="cc ${h < n ? 'bad' : ''}">${icon(k, 17)}${n}</span>`; }).join(' ');
const canAfford = (cost) => Object.entries(cost).every(([k, n]) => (k === 'coins' ? you.coins : you.res[k]) >= n);
const BCOL = { hall: '#cfeeff', house: '#ffd9e2', farm: '#fff0b0', kitchen: '#ffd9e2', sawmill: '#e3ecf7', kiln: '#ffd9cf', storehouse: '#ffe6bd', study: '#d3ecfb', mill: '#fff0b0', bakery: '#ffe6bd', market: '#ffd9d9', flowers: '#ffd9e8', lantern: '#fff0b0', fountain: '#d3ecfb', banner: '#ffd9e2' };
const rewardStr = (r) => Object.entries(r).map(([k, n]) => `<span class="cc">${icon(k, 17)}${n}</span>`).join('');
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
function setConn(s) { const c = $('#conn'), ok = link.kind === 'solo' || s === 'online'; c.classList.toggle('warn', !ok); c.innerHTML = link.kind === 'solo' ? icon('house', 16) + 'Solo' : `<span class="dot2 ${s === 'online' ? '' : 'warn'}"></span>` + (s === 'online' ? link.lag + ' ms' : esc(s)); }

function begin(l) {
  link = l; l.onNack = (err) => { toast(err); sfx('bad'); };
  let first = true;
  l.onSnap = (s) => {
    // delta snapshots: villages whose buildings/nodes did not change come without them, keep the last ones
    for (const p of s.players) { const k = known.get(p.id) || {}; if (p.b) k.b = p.b; else p.b = k.b || []; if (p.n) k.n = p.n; else p.n = k.n || []; known.set(p.id, k); }
    for (const id of [...known.keys()]) if (!s.players.some(p => p.id === id)) known.delete(id);
    if (s.chat.length || !chatLog.length) { const seen = new Set(chatLog.map(c => c.t + c.pid + c.text)); for (const c of s.chat) if (!seen.has(c.t + c.pid + c.text)) chatLog.push(c); chatLog = chatLog.slice(-60); }
    s.chat = chatLog;
    snap = s; myId = l.id; you = s.you;
    if (!you) return;
    view.sync(s, myId); view.setTime(s.t + 130); setAmbient(view.night || 0, view.rainAmt || 0);
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
  $('#res').innerHTML = `<span class="chip" title="coins">${icon('coins', 24)} ${you.coins}</span>` + shown.map(g => `<span class="chip ${you.res[g] >= you.cap ? 'full' : you.res[g] === 0 ? 'dim' : ''}" title="${g}">${icon(g, 24)} ${you.res[g]}</span>`).join('');
  setConn(link.state || 'online');
  const q = QUESTS.find(q => !you.quests[q.id]); const tr = $('#track');
  if (q) { const v = Math.min(q.n, you.stats[q.stat] || 0); tr.hidden = false; tr.innerHTML = `<span class="pin">${icon('leaf', 28)}</span><b>${icon('quests', 20)}<span>${q.text}</span></b><div class="bar g"><i style="width:${v / q.n * 100}%"></i></div><div class="hint">${HINTS[q.id] || ''}</div>`; tr.onclick = () => openPanel('quests'); } else tr.hidden = true;
  for (const p of you.popups || []) popup(p);
  for (const e of s.events || []) {
    if (e.t === 'levelup' && e.pid === myId) { toast('Village level ' + e.level + '!', 'star'); sfx('level'); const V = view.villages.get(myId); if (V) view.burst(V.group.position.x, V.group.position.z); }
    else if (e.t === 'quest' && e.pid === myId) { toast('Quest complete!', 'quests'); sfx('coin'); }
    else if (e.t === 'built' && e.pid === myId) { sfx('done'); const V = view.villages.get(myId); const m = V && V.b.get(e.id); if (m) view.burst(V.group.position.x + m.position.x, V.group.position.z + m.position.z, '#fff3a0'); }
    else if (e.t === 'order') { toast('A Valley order was finished!', 'scrolls'); sfx('done'); }
    else if (e.t === 'valleylevel') toast('The Valley reached level ' + e.level + '!', 'valley');
    else if (e.t === 'gift' && e.to === myId) { toast('A neighbour sent you ' + e.n + ' ' + e.res, 'gift'); sfx('coin'); }
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
    l.innerHTML = `${p.id === myId ? icon('star', 16) : ''}${esc(p.name)}<span class="lv">${p.level}</span>${p.online ? '' : icon('sleep', 14)}`;
  }
  for (const [id, l] of labels) if (!snap.players.some(p => p.id === id)) { l.remove(); labels.delete(id); }
}
const vlabels = new Map();
function placeLabels() {
  for (const [id, m] of view.villagers) {
    if (m.userData.pid !== myId) continue;
    const ic = { idle: 'sleep', hungry: 'hungry', blocked: 'clock', full: 'crate' }[m.userData.state];
    let l = vlabels.get(id);
    if (!ic) { if (l) l.style.display = 'none'; continue; }
    if (!l) { l = document.createElement('div'); l.className = 'label vbub'; $('#popups').appendChild(l); vlabels.set(id, l); }
    const sp = view.project(m.position.x, 1.5, m.position.z); if (l.dataset.st !== ic) { l.dataset.st = ic; l.innerHTML = icon(ic, 22); } l.style.display = sp.vis && view.look.dist < 40 ? '' : 'none'; l.style.left = sp.x + 'px'; l.style.top = sp.y + 'px';
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
let chatDraft = '', giftFor = null;
function refreshPanel(force) {
  const el = $('#panel'); if (!panel || (pressed && !force)) return;
  if (panel === 'chat' && !force && document.activeElement && document.activeElement.id === 'chatIn') { renderChatLog(); return; }
  const head = (t, ic) => `<h3><span class="ttl">${icon(ic, 28)}<span>${t}</span></span><button class="x" id="px" aria-label="Close">${icon('close', 20)}</button></h3>`;
  let h = '';
  if (panel === 'quests') {
    h = head('Quests', 'quests') + QUESTS.map(q => { const v = Math.min(q.n, you.stats[q.stat] || 0), done = you.quests[q.id]; return `<div class="order ${done ? 'done' : ''}"><b>${done ? icon('check', 22) : '<span class="ring"></span>'}<span>${q.text}</span></b><div class="bar g"><i style="width:${v / q.n * 100}%"></i></div><div class="reward"><span>${v}/${q.n}</span><span>Reward</span>${rewardStr(q.reward)}</div></div>`; }).join('');
  } else if (panel === 'valley') {
    const V = snap.valley, lo = VALLEY_LEVEL_XP[V.level - 1], hi = VALLEY_LEVEL_XP[V.level] || lo + 1;
    h = head('Valley board · Lv ' + V.level, 'valley') + `<div class="bar b"><i style="width:${Math.min(100, (V.xp - lo) / (hi - lo) * 100)}%"></i></div><div class="small">Everyone fills these orders together. Rewards are shared by how much you gave.</div>`;
    h += `<div class="row small" style="margin:6px 0">${V.fields.map(f => { const d = VALLEY_FIELDS.find(x => x.id === f.id); return `<span class="chip" data-f="${f.id}" title="${d.name || d.res}">${icon(d.res, 24)} ${Math.round(f.stock / 10) * 10}</span>`; }).join('')}</div>`;
    h += V.orders.map(o => `<div class="order ${o.done ? 'done' : ''}"><b>${icon('scrolls', 22)}<span>Order #${o.id}</span> ${o.done ? icon('check', 20) + ' Done!' : ''}</b>${Object.keys(o.need).map(g => `<div class="need"><span>${icon(g, 26)}</span><div class="bar p"><i style="width:${o.got[g] / o.need[g] * 100}%"></i></div><span>${o.got[g]}/${o.need[g]}</span>${o.done || o.got[g] >= o.need[g] ? '' : `<button data-o="${o.id}" data-g="${g}">Give</button>`}</div>`).join('')}<div class="reward"><span>Reward</span><span class="cc">${icon('coins', 17)}${o.reward.coins}</span><span class="cc">${icon('scrolls', 17)}${o.reward.scrolls}</span><span class="cc">${icon('star', 17)}${o.reward.xp} xp</span>${o.contrib[myId] ? '<span>you gave ' + o.contrib[myId] + '</span>' : ''}</div></div>`).join('');
  } else if (panel === 'players') {
    h = head('Villages (' + snap.players.length + '/16)', 'players') + [...snap.players].sort((a, b) => b.level - a.level).map(p => `<div class="pl" data-p="${p.id}"><span class="dot" style="background:${p.color}"></span><b>${esc(p.name)}</b><span class="small">Lv ${p.level} ${p.online ? '<span class="dot2"></span>' : icon('sleep', 16)}</span><span style="flex:1"></span>${p.id === myId ? '' : `<button data-gift="${p.id}" aria-label="Send a gift">${icon('gift', 24)}</button>`}<button>Visit</button></div>${giftFor === p.id ? `<div class="row" style="margin:-2px 0 8px">${GOODS.filter(g => you.res[g] >= 5).map(g => `<button data-give="${g}">${icon(g, 22)} 5</button>`).join('') || '<span class="small">Nothing to give yet</span>'}</div>` : ''}`).join('');
  } else if (panel === 'chat') {
    h = head('Chat', 'chat') + `<div class="chatlog" id="chatlog"></div><input id="chatIn" maxlength="120" placeholder="Say hello..." value="${esc(chatDraft)}"><div class="emotes">${['👋', '❤️', '😂', '🎉', '🙏', '🌾'].map(e => `<button data-e="${e}">${e}</button>`).join('')}</div>`;
  } else if (panel === 'menu') {
    h = head('Menu', 'menu') + `<div class="row"><button class="menu-b" id="mRename">${icon('pencil', 22)} Rename village</button>${link.kind === 'solo' ? `<button class="menu-b" id="mReset">${icon('trash', 22)} New solo game</button>` : ''}<button class="menu-b" id="mFs">${icon('expand', 22)} Fullscreen</button><button class="menu-b" id="mMus">${audioOn() ? icon('sound', 22) + ' Music on' : icon('mute', 22) + ' Music off'}</button>${link.kind === 'server' ? `<button class="menu-b" id="mInv">${icon('link', 22)} Copy invite link</button>` : ''}</div><p class="small">${link.kind === 'solo' ? 'Solo mode: five friendly neighbour villages share your valley. Your game saves in this browser.' : 'Connected to a server. Your village is tied to this browser, so keep your link.'}</p><p class="small">Controls: drag to pan, pinch or wheel to zoom, right-drag or two fingers to rotate. Tap trees, rocks and clay to send a villager. Tap buildings to use them.</p>`;
  }
  if (!force && el.dataset.h === h) { if (panel === 'chat') renderChatLog(); return; }
  const keep = el.scrollTop; el.dataset.h = h; el.innerHTML = h; el.scrollTop = keep;
  $('#px').onclick = closePanel;
  el.querySelectorAll('[data-o]').forEach(b => b.onclick = () => { const o = snap.valley.orders.find(o => o.id == b.dataset.o); const g = b.dataset.g; cmd({ op: 'contribute', id: o.id, res: g, n: o.need[g] - o.got[g] }); });
  el.querySelectorAll('[data-f]').forEach(c => c.onclick = () => { cmd({ op: 'assign', k: 'valley', id: c.dataset.f }); toast('Villager sent to the field'); });
  el.querySelectorAll('.pl').forEach(r => r.onclick = (e) => { if (e.target.dataset.gift) { giftFor = giftFor === e.target.dataset.gift ? null : e.target.dataset.gift; refreshPanel(true); return; } view.focusVillage(r.dataset.p, 26); });
  el.querySelectorAll('[data-give]').forEach(b => b.onclick = () => { cmd({ op: 'gift', to: giftFor, res: b.dataset.give, n: 5 }); sfx('coin'); });
  if (panel === 'chat') {
    renderChatLog(); const inp = $('#chatIn'); inp.oninput = () => chatDraft = inp.value;
    inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter' && inp.value.trim()) { link.cmd({ op: 'chat', text: inp.value }); chatDraft = ''; inp.value = ''; } };
    el.querySelectorAll('[data-e]').forEach(b => b.onclick = () => link.cmd({ op: 'emote', e: b.dataset.e }));
  }
  if (panel === 'menu') {
    $('#mRename').onclick = () => { const n = prompt('Village name', myPub().name); if (n) link.cmd({ op: 'rename', name: n }); };
    const r = $('#mReset'); if (r) r.onclick = () => { if (confirm('Delete your solo game and start over?')) link.reset(); };
    $('#mMus').onclick = () => { toggleAudio(); refreshPanel(true); };
    const inv = $('#mInv'); if (inv) inv.onclick = () => { const u = location.origin + location.pathname + '?server=' + encodeURIComponent(link.url || '') + '&auto'; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast('Invite link copied!'), () => prompt('Copy this link', u)); };
    $('#mFs').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen && document.documentElement.requestFullscreen());
  }
}
function renderChatLog() { const l = $('#chatlog'); if (!l) return; l.innerHTML = snap.chat.map(c => `<div><b style="color:${c.color}">${esc(c.name)}</b> ${esc(c.text)}</div>`).join(''); l.scrollTop = 1e6; }

// ---------- build menu & placing ----------
function openBuildMenu() {
  const s = $('#sheet'); s.hidden = false; selected = { menu: true };
  const rows = Object.entries(BUILDINGS).filter(([, d]) => !d.hidden).map(([id, d]) => {
    const lock = you.level < d.lvl ? 'Level ' + d.lvl : d.tech && !you.tech[d.tech] ? 'Research ' + TECH[d.tech].name : null;
    return `<div class="card ${lock ? 'lock' : ''}" data-b="${id}"><div class="bub" style="--b1:${BCOL[id] || '#d9f3ff'}">${icon(id, 34)}</div><div class="nm">${d.name}</div><div class="small">${d.w}×${d.h}</div><div class="cost">${lock ? icon('lock', 16) + ' ' + lock : costStr(d.cost)}</div></div>`;
  }).join('');
  s.innerHTML = `${hd('Build', 'hammer')}<div class="grid">${rows}</div>`;
  $('#sx').onclick = closeSheet;
  s.querySelectorAll('[data-b]').forEach(c => c.onclick = () => startPlace(c.dataset.b));
}
function startPlace(type, moveId = null) {
  const d = BUILDINGS[type]; if (!d || d.hidden) return; const lock = you.level < d.lvl ? 'Reach level ' + d.lvl : d.tech && !you.tech[d.tech] ? 'Research ' + TECH[d.tech].name + ' first' : !moveId && !canAfford(d.cost) ? 'Not enough resources' : null;
  if (lock) { toast(lock); sfx('bad'); return; }
  closeSheet(); mode = { type, moveId }; view.setGhost(type, myPub().color);
  const spot = _fs(fakeP(), d.w, d.h, 0) || { x: 0, y: 0 }; ghostTo(spot.x, spot.y);
  $('#place').hidden = false; $('#placeName').innerHTML = icon(type, 26) + ' ' + esc((moveId ? 'Move ' : 'Place ') + d.name); $('#bottom').hidden = true;
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
const hd = (t, ic, extra = '') => `<h3><span class="ttl">${icon(ic, 28)}<span>${t}</span>${extra}</span><button class="x" id="sx" aria-label="Close">${icon('close', 20)}</button></h3>`;
function sheet(html) { const s = $('#sheet'); s.hidden = false; const same = s.dataset.h === html && sheetKey === JSON.stringify(selected); if (!same) { const keep = s.scrollTop; s.dataset.h = html; sheetKey = JSON.stringify(selected); s.innerHTML = html; s.scrollTop = keep; } const x = $('#sx'); if (x) x.onclick = closeSheet; s.same = same; return s; }
function refreshSheet() { if (pressed) return; if (selected && selected.k) showSelection(selected, true); else if (selected && selected.menu) { /* keep menu stable */ } }
function showSelection(sel, silent) {
  selected = sel;
  if (sel.k === 'bld') {
    const mine = sel.pid === myId; const pub = snap.players.find(p => p.id === sel.pid); const b = pub && pub.b.find(x => x[0] === sel.id); if (!b) { closeSheet(); return; }
    const type = b[1], d = BUILDINGS[type] || { name: type, w: 2, h: 2 }; const st = mine && you.buildings.find(x => x.id === sel.id);
    const lv0 = (st && st.lvl) || 1; let h = hd(d.name, type, (type !== 'hall' && b[4] >= 1 && mine) ? `<span class="small">${icon('star', 14)}${lv0} · ${UPGRADE_NOTE[type] || ''}</span>` : '');
    if (!mine) { h += `<div class="small">Belongs to ${esc(pub.name)}</div>`; return sheet(h); }
    if (b[4] < 1) { h += `<div class="bar g"><i style="width:${Math.round(b[4] * 20) * 5}%"></i></div><div class="small" style="margin-top:6px">Under construction. A villager is on the way.</div><div class="row" style="margin-top:10px"><button id="aHelp">${icon('worker', 24)} Send a builder</button><button id="aDem">${icon('trash', 22)} Cancel</button></div>`; const s = sheet(h); $('#aHelp').onclick = () => cmd({ op: 'assign', k: 'bld', id: sel.id }); $('#aDem').onclick = () => { cmd({ op: 'demolish', id: sel.id }); closeSheet(); }; return; }
    if (type === 'hall') {
      h += `<div class="stat"><span>${icon('players', 20)} ${you.villagers.length}/${you.housing}</span><span>${icon('crate', 20)} ${you.cap} per good</span><span>${icon('level', 20)} Level ${you.level}</span></div><div class="row" style="margin:8px 0"><button id="aHire" ${you.villagers.length >= you.housing ? 'disabled' : ''}>${icon('worker', 24)} Welcome a villager ${costStr(you.hire)}</button></div>`;
      h += you.villagers.length >= you.housing ? '<div class="small">Build more Cottages to make room.</div>' : '';
      h += '<div class="small" style="margin-bottom:6px">Villagers</div>' + you.villagers.map(v => `<div class="pl" data-v="${v.id}">${icon('worker', 26)}<b>${esc(v.name)}</b><span class="small">${stateText(v)}</span><span style="flex:1"></span><span class="small">${icon('soup', 18)} ${Math.round(v.hunger / 10) * 10}%</span></div>`).join('');
      const s = sheet(h); const hb = $('#aHire'); if (hb) hb.onclick = () => cmd({ op: 'hire' }); s.querySelectorAll('[data-v]').forEach(r => r.onclick = () => showSelection({ k: 'vil', id: +r.dataset.v, pid: myId })); return;
    }
    if (d.field) {
      const stg = b[5], txt = stg === 'empty' ? 'Ready to sow' : stg === 'grow' ? 'Growing ' + Math.round(b[6] * 10) * 10 + '%' : 'Ripe, ready to harvest!';
      h += `<div>${txt}</div>${stg === 'grow' ? `<div class="bar g"><i style="width:${Math.round(b[6] * 10) * 10}%"></i></div>` : ''}<div class="row" style="margin-top:10px"><button id="aGo" ${stg === 'grow' ? 'disabled' : ''}>${stg === 'ripe' ? icon('wheat', 24) + ' Harvest' : icon('sow', 24) + ' Sow'}</button>`;
    } else if (d.craft) {
      h += `<div class="row">`;
      for (const r of d.craft) { const rc = RECIPES[r]; h += `<button data-r="${r}" ${canAfford(rc.in) ? '' : 'disabled'}>${icon(r, 24)} ${r} ×1 <span class="small">${costStr(rc.in)}</span></button><button data-r5="${r}">×5</button>`; }
      h += `</div>`;
      if (st && st.queue.length) h += '<div class="queue"><span class="small">Queue</span>' + st.queue.map((q, i) => `<span class="chip" data-dq="${i}">${icon(q.recipe, 22)}×${q.n}${q.started ? ' ' + icon('clock', 16) : ''} ${icon('close', 12)}</span>`).join('') + '</div>';
      if (d.research) {
        h += '<div class="small" style="margin:10px 0 6px">Research</div><div class="grid">' + Object.entries(TECH).map(([id, t]) => `<div class="card ${you.tech[id] ? 'done' : ''}" data-t="${id}"><div class="nm">${t.name}</div><div class="small">${t.desc}</div><div class="cost">${you.tech[id] ? icon('check', 18) + ' Learned' : '<span class="cc ' + (you.res.scrolls < t.scrolls ? 'bad' : '') + '">' + icon('scrolls', 18) + t.scrolls + '</span>'}</div></div>`).join('') + '</div>';
        if (st && st.research) h += `<div class="hint-b">${icon('book', 20)} Studying ${TECH[st.research.tech].name}... ${Math.ceil(st.research.left / 5) * 5}s</div>`;
      }
      h += `<div class="row" style="margin-top:8px">`;
    } else if (d.market) {
      h += '<div class="small">Sell goods for coins</div><div class="grid">' + GOODS.filter(g => you.res[g] > 0).map(g => `<div class="card sell" data-s="${g}"><div class="bub" style="--b1:#fff0b0">${icon(g, 34)}</div><div class="nm">${you.res[g]}</div><div class="small cc">${SELL[g]}${icon('coins', 15)} each</div></div>`).join('') + '</div><div class="row" style="margin-top:8px">';
    } else { h += `<div class="small">${d.decor ? 'A lovely decoration (+charm).' : ''}</div><div class="row">`; }
    {
      const lvl = (st && st.lvl) || 1; const need = upgradeNeedsLevel(type, lvl);
      if (st && st.up) h += `<div class="hint-b" style="width:100%">${icon('up', 20)} Upgrading... ${Math.round((b[8] || 0) * 10) * 10}%</div>`;
      else if (lvl < MAX_BLD_LEVEL) { const cost = upgradeCost(type, lvl); h += `<button id="aUp" ${you.level >= need && canAfford(cost) ? '' : 'disabled'}>${icon('up', 22)} Level ${lvl + 1} <span class="small">${you.level < need ? '(village Lv ' + need + ')' : costStr(cost)}</span></button>`; }
    }
    h += `<button id="aSend">${icon('worker', 24)} Send villager</button><button id="aMove">${icon('move', 22)} Move</button><button id="aDem">${icon('trash', 22)} Demolish</button></div>`;
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
    const s = sheet(`${hd(esc(v.name), 'worker')}<div>${stateText(v)}</div><div class="bar p"><i style="width:${Math.round(v.hunger / 10) * 10}%"></i></div><div class="small" style="margin-top:4px">Hunger (eats soup automatically)</div><div class="row" style="margin-top:10px"><button id="vRecall">${icon('stop', 22)} Stop task</button></div><div class="small" style="margin-top:8px">Now tap something to give this villager a job.</div>`);
    $('#vRecall').onclick = () => cmd({ op: 'recall', vid: v.id });
  }
}
const stateText = (v) => { const t = { idle: ['sleep', 'Idle'], walk: ['walk', 'Walking'], work: ['hammer', 'Working'], build: ['hammer', 'Building'], hungry: ['hungry', 'Hungry, no soup!'], blocked: ['clock', 'Waiting for ingredients'], full: ['crate', 'Storage full'] }[v.state]; return t ? icon(t[0], 18) + ' ' + t[1] : esc(v.state); };
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
    if (lastPinch) { L.dist = Math.max(8, Math.min(72, L.dist * (lastPinch.d / dist))); L.yaw -= (ang - lastPinch.a); }
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
cv.addEventListener('wheel', (e) => { e.preventDefault(); view.goal.dist = Math.max(8, Math.min(72, view.goal.dist * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
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

addEventListener('pointerdown', () => { if (!audioOn() && wantsMusic() && !musicTried) { musicTried = true; toggleAudio(true); } }, { once: false });
let musicTried = false;
// ---------- main loop ----------
let lastT = performance.now();
function loop(t) { const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t; view.frame(dt); placeLabels(); requestAnimationFrame(loop); }
requestAnimationFrame(loop);
window.__hv = { view, get snap() { return snap; }, get link() { return link; }, cmd: (c) => link.cmd(c) };
