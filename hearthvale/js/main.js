// Hearthvale client: boot, title screen, snapshot pump, world input. The HUD, panels and celebrations live in js/ui/.
import { View } from './scene.js';
import { icon } from './icons.js';
import { soloLink, wsLink } from './net.js';
import { Audio } from './audio.js';
import { S, $, esc, store, myPub, cmd, BUILDINGS } from './ui/state.js';
import { initReduce, installPress, toast, snd, ui, haptic } from './ui/fx.js';
import { initFrame, open, close, current, isOpen, refresh } from './ui/frame.js';
import { initHud, updateHud, syncLabels, placeLabels } from './ui/hud.js';
import { VALLEY_FIELDS } from '../shared/data.js';
import { initScreens, startPlace, ghostTo, cancelPlace, confirmPlace, selectWorld, closeSel, photoMode } from './ui/screens.js';
import { handleEvents, initEvents, ambientSounds, preEvents } from './ui/events.js';
import { initTour, tourTick } from './ui/tour.js';
import { checkDaily } from './ui/celebrate.js';
import { initTheme } from './ui/theme.js';

const qs = new URLSearchParams(location.search);
const view = new View($('#gl')); S.view = view;
initReduce(); installPress(); initTheme();
document.querySelectorAll('[data-ic]').forEach((e) => { e.innerHTML = icon(e.dataset.ic, +e.dataset.s || 20); });
if (view.tier === 'low') document.body.classList.add('lowfx');
S.haptics = store.get('haptics', true);
try { Audio.setMusic('title'); } catch { /* audio is optional */ }

// ---------- title screen ----------
const SAVE_KEY = 'hearthvale.solo.v1', tokenKey = 'hearthvale.token';
let token = null; try { token = localStorage.getItem(tokenKey); } catch { /* private mode */ }
if (!token) { token = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join(''); try { localStorage.setItem(tokenKey, token); } catch { /* ignore */ } }
try { $('#nameIn').value = localStorage.getItem('hearthvale.name') || ''; } catch { /* ignore */ }
const defaultServer = qs.get('server') || (/pages\.dev|github\.io/.test(location.host) ? '' : (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
try { $('#srvIn').value = localStorage.getItem('hearthvale.server') || defaultServer; } catch { $('#srvIn').value = defaultServer; }
const nameVal = () => ($('#nameIn').value.trim() || 'Newbrook').slice(0, 16);
function readSave() {
  try { const raw = localStorage.getItem(SAVE_KEY); if (!raw) return null; const w = JSON.parse(raw), p = w.players && w.players.me; if (!p) return null; return { name: p.name, level: p.level, b: p.buildings.filter((b) => b.built).length, vil: p.villagers.length }; } catch { return null; }
}
const save = readSave();
if (save) {
  $('#saveCard').hidden = false; $('#saveCard').innerHTML = `${icon('house', 34)}<span>Welcome back, ${esc(save.name)}!<small>Level ${save.level} - ${save.b} building${save.b === 1 ? "" : "s"} - ${save.vil} villagers</small></span>`;
  $('#goSoloT').textContent = 'Continue'; $('#goNew').hidden = false; $('#nameIn').hidden = true;
}
$('#goSolo').onclick = () => { const nm = save ? save.name : nameVal(); try { if (!save) localStorage.setItem('hearthvale.name', nm); } catch { /* ignore */ } begin(soloLink(nm, token)); };
$('#goNew').onclick = async () => {
  const ok = await S.api.confirm({ title: 'Start a new game?', text: 'Your current village will be deleted for good.', ok: 'Start over', danger: true }); if (!ok) return;
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } const nm = nameVal(); try { localStorage.setItem('hearthvale.name', nm); } catch { /* ignore */ } begin(soloLink(nm, token));
};
$('#goServer').onclick = () => {
  let url = $('#srvIn').value.trim(); if (!url) { $('#titleMsg').textContent = 'Type the server address first.'; return; }
  if (!/^wss?:\/\//.test(url)) url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + url;
  const nm = save ? save.name : nameVal(); try { localStorage.setItem('hearthvale.name', nm); localStorage.setItem('hearthvale.server', url); } catch { /* ignore */ }
  $('#titleMsg').textContent = 'Connecting...';
  begin(wsLink(url, nm, token, { onFull: () => { $('#title').hidden = false; $('#hud').hidden = true; $('#titleMsg').textContent = 'That valley is full (16 villages).'; }, onState: () => setConn() }));
};
if (qs.get('solo') !== null) setTimeout(() => $('#goSolo').click(), 0);
if (qs.get('server') && qs.get('auto') !== null) setTimeout(() => $('#goServer').click(), 0);
function setConn() {
  const c = $('#connb'), l = S.link; if (!l) return; const ok = l.kind === 'solo' || l.state === 'online';
  c.classList.toggle('warn', !ok); c.innerHTML = ok ? '' : `<span class="dot2 warn"></span>${esc(l.state || 'offline')}`;
}

// ---------- snapshots ----------
const known = new Map(); let chatLog = [], first = true, lastMode = 'day';
function begin(l) {
  S.link = l; S.kind = l.kind; $('#goSolo').disabled = true;
  l.onNack = (err, op) => { const t = String(err || 'no'); toast(t.charAt(0).toUpperCase() + t.slice(1), { type: /resources|need|storage|room/.test(t) ? 'warn' : 'bad', icon: 'info', key: 'nack', sound: false }); ui(/resources|need/.test(t) ? 'deny' : 'error'); if (/resources|need|storage/.test(t)) S.api.short && S.api.short(); };
  l.onSnap = (s) => {
    try { onSnapshot(s, l); } catch (e) { console.error('snapshot', e); }
  };
}
function onSnapshot(s, l) {
  // delta snapshots: villages whose buildings/nodes did not change come without them, keep the last ones
  for (const p of s.players) { const k = known.get(p.id) || {}; if (p.b) k.b = p.b; else p.b = k.b || []; if (p.n) k.n = p.n; else p.n = k.n || []; known.set(p.id, k); }
  for (const id of [...known.keys()]) if (!s.players.some((p) => p.id === id)) known.delete(id);
  if (s.chat.length || !chatLog.length) { const seen = new Set(chatLog.map((c) => c.t + c.pid + c.text)); for (const c of s.chat) if (!seen.has(c.t + c.pid + c.text)) chatLog.push(c); chatLog = chatLog.slice(-60); }
  s.chat = chatLog;
  const prev = S.snap, prevYou = S.you;
  S.snap = s; S.myId = l.id; S.you = s.you; S.snapAt = performance.now(); S.pub = myPub(); S.prev = prev; S.prevYou = prevYou;
  if (!S.you) return;
  view.sync(s, S.myId); view.setTime(s.t + 130);
  if (first) {
    first = false; $('#title').hidden = true; $('#hud').hidden = false; view.focusVillage(S.myId, S.api.homeDist());
    initHud(); initFrame(); initScreens(); initEvents(); initTour(); setConn();
    try { Audio.setMusic('day'); } catch { /* ignore */ }
    S.api.firstSnap = true;
  }
  preEvents(s); updateHud(s); handleEvents(s, prev, prevYou); syncLabels(); worldAudio(s); tourTick(); refresh(); setConn();
  if (S.selected && S.selected.k === 'bld') refresh();
  checkDaily();
}
function worldAudio(s) {
  const n = view.night || 0, r = view.rainAmt || 0, fest = !!(s.valley.event && s.valley.event.kind === 'festival');
  let m = lastMode;
  if (r > (m === 'rain' ? 0.35 : 0.5)) m = 'rain'; else if (fest) m = 'festival'; else if (n > (m === 'night' ? 0.5 : 0.6)) m = 'night'; else if (n > (m === 'dusk' || m === 'night' ? 0.17 : 0.25)) m = 'dusk'; else m = 'day';
  lastMode = m; try { Audio.setMusic(m); Audio.setAmbience({ night: n, rain: r, wind: 0.2 + 0.3 * r, water: 0.22 }); Audio.listener.set && Audio.listener.set(view.look.x); } catch { /* ignore */ }
}

// ---------- world input ----------
const cv = $('#gl'); const ptrs = new Map(); let tap = null, lastPinch = null;
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button });
  tap = ptrs.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 } : null; lastPinch = null;
});
cv.addEventListener('pointermove', (e) => {
  const p = ptrs.get(e.pointerId); if (!p) { hoverGhost(e); return; }
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; const L = view.goal;
  if (ptrs.size === 1) {
    if (tap) tap.moved += Math.abs(dx) + Math.abs(dy);
    if (p.b === 2) { L.yaw -= dx * 0.006; L.pitch = Math.max(0.35, Math.min(1.35, L.pitch + dy * 0.004)); } else if (!tap || tap.moved > 6) pan(dx, dy);
  } else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()]; const dist = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
    if (lastPinch) { L.dist = Math.max(8, Math.min(72, L.dist * (lastPinch.d / dist))); L.yaw -= (ang - lastPinch.a); }
    lastPinch = { d: dist, a: ang }; if (tap) tap.moved = 99;
  }
});
function pan(dx, dy) {
  const L = view.goal, s = L.dist * 0.0022, c = Math.cos(L.yaw), si = Math.sin(L.yaw);
  L.x += -c * dx * s - si * dy * s; L.z += si * dx * s - c * dy * s; const r = Math.hypot(L.x, L.z); if (r > 62) { L.x *= 62 / r; L.z *= 62 / r; }
}
cv.addEventListener('pointerup', (e) => {
  const was = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); lastPinch = null;
  if (tap && was && ptrs.size === 0 && tap.moved <= 6 && performance.now() - tap.t < 500 && was.b !== 2) onTap(e.clientX, e.clientY);
  tap = null;
});
cv.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); tap = null; });
cv.addEventListener('wheel', (e) => { e.preventDefault(); view.goal.dist = Math.max(8, Math.min(72, view.goal.dist * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || !S.you) return; const L = view.goal, s = L.dist * 0.04;
  if (e.key === 'Escape') { if (S.mode) cancelPlace(); else closeSel(); }
  else if (e.key === 'b') $('#bBuild').click(); else if (e.key === 'h') $('#bHome').click(); else if (e.key === 'v') $('#bValley').click(); else if (e.key === 'i') $('#bVil').click();
  else if (e.key === 'q') L.yaw += 0.2; else if (e.key === 'e') L.yaw -= 0.2;
  else if (e.key === 'ArrowLeft' || e.key === 'a') { L.x -= Math.cos(L.yaw) * s; L.z += Math.sin(L.yaw) * s; }
  else if (e.key === 'ArrowRight' || e.key === 'd') { L.x += Math.cos(L.yaw) * s; L.z -= Math.sin(L.yaw) * s; }
  else if (e.key === 'ArrowUp' || e.key === 'w') { L.x -= Math.sin(L.yaw) * s; L.z -= Math.cos(L.yaw) * s; }
  else if (e.key === 'ArrowDown' || e.key === 's') { L.x += Math.sin(L.yaw) * s; L.z += Math.cos(L.yaw) * s; }
  else if (e.key === 'Enter' && S.mode) confirmPlace();
});
function hoverGhost(e) { if (!S.mode || e.pointerType === 'touch') return; const V = view.villages.get(S.myId), t = view.tileAt(V, e.clientX, e.clientY); if (t) ghostTo(t.tx - Math.floor(view.ghost.d.w / 2), t.ty - Math.floor(view.ghost.d.h / 2)); }
function onTap(x, y) {
  if (!S.link || !S.you) return;
  if (S.mode) { const V = view.villages.get(S.myId), t = view.tileAt(V, x, y); if (t) { ghostTo(t.tx - Math.floor(view.ghost.d.w / 2), t.ty - Math.floor(view.ghost.d.h / 2)); snd('place', { vol: 0.5 }); } return; }
  const hit = view.pick(x, y);
  if (!hit) { closeSel(); if (current() && !current().def.modal) close(); return; }
  if (hit.k === 'board') { view.focus(0, 0, 28); open('valley', { tab: 'orders' }); return; }
  if (hit.k === 'project') { view.focus(0, -5.4, 22); open('valley', { tab: 'project' }); return; }
  if (hit.k === 'valley') { const r = cmd({ op: 'assign', k: 'valley', id: hit.id }); if (r && r.ok !== false) { toast('Villager heads to the ' + VALLEY_FIELDS.find((f) => f.id === hit.id).name, { icon: 'worker', key: 'vf' }); snd('step', { vol: 0.5 }); } return; }
  if (hit.pid !== S.myId) { if (hit.k === 'bld' || hit.k === 'vil') { closeSel(); close(); view.focusVillage(hit.pid, 26); const p = S.snap.players.find((p) => p.id === hit.pid); if (p) toast(`${p.name}'s village, level ${p.level}`, { icon: 'house', key: 'visit', type: 'pink', sound: false }); } return; }
  if (hit.k === 'node') {
    const chosen = S.selected && S.selected.k === 'vil' ? S.selected.id : undefined;
    cmd({ op: 'assign', k: 'node', id: hit.id, vid: chosen }); view.select(hit.obj, 0.7); setTimeout(() => view.select(null), 700); snd(hit.obj.userData.type === 'tree' ? 'chop' : hit.obj.userData.type === 'rock' ? 'mine' : 'dig', { vol: 0.5 }); S.api.tapNode && S.api.tapNode(); return;
  }
  if (hit.k === 'bld') { selectWorld(hit); return; }
  if (hit.k === 'vil') selectWorld(hit);
}

S.api.photo = (on) => photoMode(on);
S.api.homeDist = () => (innerWidth < innerHeight ? Math.min(56, 26 * (innerHeight / innerWidth) / 1.55) : 26);
// ---------- main loop ----------
let lastT = performance.now();
function loop(t) { const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t; try { view.frame(dt); placeLabels(); ambientSounds(dt); } catch (e) { console.error('frame', e); } requestAnimationFrame(loop); }
requestAnimationFrame(loop);
window.__hv = { view, get snap() { return S.snap; }, get link() { return S.link; }, cmd: (c) => S.link.cmd(c), S, ui: { open, close, current } };
