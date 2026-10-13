// Title screen, profile, and starting a game (solo or online).
import { Game } from './game.js';
import { LoopNet, WSNet, idbStore } from './net.js';
import { drawChar, SKINS, HAIRS, SHIRTS, PANTS, HAIR_STYLES } from './art.js';
import { DEFAULT_LOOK } from '../shared/data.js';
import { phaseOf } from '../shared/util.js';

const $ = (id) => document.getElementById(id);
const PROFILE_KEY = 'blockmates.profile';
let profile = { name: '', look: { ...DEFAULT_LOOK }, token: '', last: '', soloSeed: 0 };
try { Object.assign(profile, JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}')); } catch { /* fresh profile */ }
if (!profile.token) profile.token = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
if (!profile.soloSeed) profile.soloSeed = 1 + Math.floor(Math.random() * 2e9);
const save = () => { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch { /* private mode */ } };

const game = new Game($('game'));
window.__bm = game; // handy for tests and tinkering
const params = new URLSearchParams(location.search);

// ---- look editor
const lookEl = $('look');
const FIELDS = [['skin', 'Skin', SKINS], ['hairStyle', 'Hair', null, HAIR_STYLES], ['hair', 'Hair color', HAIRS], ['shirt', 'Shirt', SHIRTS], ['pants', 'Pants', PANTS]];
function renderLook() {
  lookEl.innerHTML = '';
  for (const [key, label, cols, count] of FIELDS) {
    const row = document.createElement('div'); row.className = 'row';
    const l = document.createElement('span'); l.textContent = label; row.appendChild(l);
    const sw = document.createElement('div'); sw.className = 'sw';
    const n = count || cols.length;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('i');
      if (cols) s.style.background = cols[i]; else { s.style.background = '#e9d3a3'; s.textContent = i; s.style.fontSize = '11px'; s.style.textAlign = 'center'; s.style.lineHeight = '16px'; }
      if (profile.look[key] === i) s.className = 'on';
      s.onclick = () => { profile.look[key] = i; save(); renderLook(); preview(); };
      sw.appendChild(s);
    }
    row.appendChild(sw); lookEl.appendChild(row);
  }
}
function preview() { drawChar($('prev'), profile.look); }
$('rand').onclick = () => {
  const r = (n) => Math.floor(Math.random() * n);
  profile.look = { skin: r(SKINS.length), hair: r(HAIRS.length), hairStyle: r(HAIR_STYLES), shirt: r(SHIRTS.length), pants: r(PANTS.length), eyes: r(5) };
  save(); renderLook(); preview();
};
$('name').value = profile.name || '';
$('addr').value = params.get('server') || profile.last || (location.hostname && !/pages\.dev$|github\.io$/.test(location.hostname) && location.port ? location.host : '');
renderLook(); preview();

// ---- title background: the sky and hills of the game, drifting
const menuG = { time: 150, cam: { x: 600, y: 90 }, ts: 32, t: 0, biome: 'plains' };
let menuRun = true, lastT = performance.now();
function menuLoop(now) {
  if (!menuRun) return;
  requestAnimationFrame(menuLoop);
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  menuG.t += dt; menuG.time += dt * 5; menuG.cam.x += dt * 0.5;
  const r = game.r; r.resize(); menuG.ts = Math.max(24, r.h / 22);
  menuG.cam.y = 90;
  r.drawSky(menuG);
  // a strip of grass at the bottom
  const g = r.g; const gy = r.h * 0.86;
  g.fillStyle = '#5fb844'; g.fillRect(0, gy, r.w, r.h - gy); g.fillStyle = '#8a5a36'; g.fillRect(0, gy + 26 * r.dpr, r.w, r.h);
  g.fillStyle = '#7bd85a'; g.fillRect(0, gy, r.w, 6 * r.dpr);
  void phaseOf;
}
requestAnimationFrame(menuLoop);

// ---- connecting
function normalizeAddr(a) {
  a = a.trim();
  if (!a) return '';
  if (/^https?:\/\//i.test(a)) a = a.replace(/^http/i, 'ws');
  if (!/^wss?:\/\//i.test(a)) a = (/^(localhost|127\.|192\.168\.|10\.|\[)/.test(a) || /:\d+(\/|$)/.test(a) ? 'ws://' : 'wss://') + a;
  const u = new URL(a);
  if (u.pathname === '/' || u.pathname === '') u.pathname = '/ws';
  return u.toString();
}
function statusUrl(ws) { const u = new URL(ws); u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:'; u.pathname = '/status'; return u.toString(); }
let statusTimer;
$('addr').oninput = () => {
  clearTimeout(statusTimer);
  statusTimer = setTimeout(async () => {
    $('srv').textContent = '';
    const ws = normalizeAddr($('addr').value); if (!ws) return;
    try {
      const r = await fetch(statusUrl(ws)); const j = await r.json();
      $('srv').textContent = `${j.name}: ${j.players}/${j.max} online, day ${j.day}${j.password ? ' (password)' : ''}`;
    } catch { $('srv').textContent = ''; }
  }, 500);
};
if ($('addr').value) $('addr').oninput();

async function start(kind) {
  $('err').textContent = '';
  const name = $('name').value.trim();
  if (name.length < 2) { $('err').textContent = 'Please type a name (2 to 16 letters).'; $('name').focus(); return; }
  profile.name = name; save();
  game.sound.start();
  try {
    let net;
    if (kind === 'solo') net = new LoopNet(idbStore, profile.soloSeed);
    else {
      const url = normalizeAddr($('addr').value);
      if (!url) { $('err').textContent = 'Type the server address first.'; return; }
      profile.last = $('addr').value.trim(); save();
      net = new WSNet(url);
    }
    $('solo').disabled = $('online').disabled = true;
    await game.join(net, { name, look: profile.look, token: profile.token });
    menuRun = false;
  } catch (e) {
    $('err').textContent = e.message || 'Could not connect.';
  } finally { $('solo').disabled = $('online').disabled = false; }
}
$('solo').onclick = () => start('solo');
$('online').onclick = () => start('online');
for (const id of ['name', 'addr']) $(id).onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') start(id === 'addr' ? 'online' : 'solo'); };
game.onleave = (msg) => {
  menuRun = true; lastT = performance.now(); requestAnimationFrame(menuLoop);
  $('err').textContent = msg || '';
};
$('newworld').onclick = async (e) => { e.preventDefault(); if (!confirm('Delete your saved solo world and start a new one?')) return; await idbStore.wipe(); profile.soloSeed = 1 + Math.floor(Math.random() * 2e9); save(); $('soloinfo').textContent = 'A fresh world is made for you on this device.'; $('newworld').style.display = 'none'; };
(async () => { try { const s = await idbStore.load(); if (s) $('newworld').style.display = 'inline'; $('soloinfo').textContent = s ? `Saved world found: day ${s.state.day}. Your progress continues.` : 'A fresh world is made for you on this device.'; } catch { $('soloinfo').textContent = 'Saving may be unavailable in this browser mode.'; } })();
