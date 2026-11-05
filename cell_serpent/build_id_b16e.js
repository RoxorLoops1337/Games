// Batch 16 (agent e): BUILD IDENTITY. Every run gets a name made from the cards it picked ("Echo Cow Choir"), shown on the
// result screen and the pause menu, collected in save.builds, and drawn on a shareable result picture (canvas, toBlob, share or download).
// Pure helpers first (tests run them headless), the canvas card last. Nothing here runs per frame.
import { WEAPONS, SKINS, SKIN_NAMES } from './sim.js';

// first word: the upgrade the run leaned on most
export const UP_WORD = {
  aspd: 'Quickstep', notes: 'Harmony', burst: 'Echo', cdmg: 'Boom', power: 'Loud', haste: 'Tempo', crit: 'Perfect Pitch', vital: 'Lullaby', guard: 'Doorstop',
  enc: 'Encore', dbeat: 'Downbeat', fork: 'Tuning Fork', gear: 'Golden Ear', harm: 'Four-Part', chk: 'Soundcheck', cres: 'Crescendo', fan: 'Fan Club', brg: 'Bridge',
  brk: 'Icebreaker', hbk: 'Sweetheart', oil: 'Oil Can', swt: 'Sweet Tooth', hwd: 'Heart Ward', hny: 'Honey Jar',
  tis: 'Tissue Box', mir: 'Pocket Mirror', tea: 'Chamomile', muf: 'Ear Muffs', speed: 'Sharp Notes',
};
// second word: the animal skill that was levelled most
export const WEAPON_WORD = { swab: 'Kitty', daggers: 'Chick', tower: 'Cow', dragon: 'Dove', needles: 'Hedgehog', stick: 'Bunny', bubble: 'Duckling', satellite: 'Owl', maw: 'Bulldog' };
// last word: how many different things the run was built from
export const GROUP_WORD = ['Solo', 'Solo', 'Duet', 'Trio', 'Quartet', 'Band', 'Choir', 'Choir', 'Orchestra'];
export const BARE_NAME = 'Unplugged Duo';

const WIDS = new Set(WEAPONS.map(w => w.id));

// what a run was built from: { weap: {id: extra levels}, ups: {id: picks}, picks }. `weap` is g.weap, `ups` is g.ups, `loadout` the equipped skills
// (a loadout skill starts at level 1, so only the levels above that count; a skill found on a yellow cell counts from its first level).
export function buildTraits(weap, ups, loadout, picks) {
  const w = {}, u = {}, lo = new Set(loadout || []);
  for (const id of Object.keys(weap || {})) { const lv = weap[id] ? weap[id].lv | 0 : 0; const ex = lo.has(id) ? lv - 1 : lv; if (WIDS.has(id) && ex > 0) w[id] = ex; }
  for (const id of Object.keys(ups || {})) if ((ups[id] | 0) > 0) u[id] = ups[id] | 0;
  return { weap: w, ups: u, picks: picks | 0 };
}
const top = (obj, order) => Object.keys(obj).sort((a, b) => obj[b] - obj[a] || order(a) - order(b));
const upOrder = id => { const k = Object.keys(UP_WORD).indexOf(id); return k < 0 ? 99 : k; };
const wOrder = id => { const k = WEAPONS.findIndex(x => x.id === id); return k < 0 ? 99 : k; };

export function buildName(t) {
  if (!t || (!Object.keys(t.weap).length && !Object.keys(t.ups).length)) return BARE_NAME;
  const ups = top(t.ups, upOrder), ws = top(t.weap, wOrder);
  const a = ups.length ? UP_WORD[ups[0]] || ups[0] : '';
  let b = ws.length ? WEAPON_WORD[ws[0]] : '';
  if (!b && ups.length > 1) b = UP_WORD[ups[1]] || ups[1];
  const kinds = ups.length + ws.length;
  const c = GROUP_WORD[Math.min(GROUP_WORD.length - 1, kinds)];
  return [a, b, c].filter(Boolean).join(' ');
}
// one short line under the name: "7 cards, Cow power"
export function buildTagline(t) {
  if (!t || !t.picks) return 'No cards picked, just the voices';
  const ws = top(t.weap, wOrder);
  return t.picks + (t.picks === 1 ? ' card' : ' cards') + (ws.length ? ', ' + WEAPON_WORD[ws[0]] + ' power' : ', all voice');
}
// the animal skills the picture shows, strongest first (at most n)
export function topWeapons(t, n = 4) { return top(t.weap, wOrder).slice(0, n).map(id => ({ id, lv: t.weap[id] })); }

// ---- the collection: save.builds[name] = how often it was played (only real builds, at most 60 names)
export const BUILD_CAP = 60;
export function cleanBuilds(raw) {
  const out = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) for (const k of Object.keys(raw).slice(0, BUILD_CAP)) {
    if (k.length > 40 || !/^[A-Za-z\- ]+$/.test(k)) continue;
    const n = Math.min(9999, Math.max(0, Number(raw[k]) | 0)); if (n > 0) out[k] = n;
  }
  return out;
}
// record a finished run; returns { name, fresh, count, total }. A run with no cards does not fill the collection.
export function recordBuild(save, name) {
  if (!save) return { name, fresh: false, count: 0, total: 0 };
  if (!save.builds || typeof save.builds !== 'object') save.builds = {};
  const had = save.builds[name] | 0;
  if (name !== BARE_NAME && (had > 0 || Object.keys(save.builds).length < BUILD_CAP)) save.builds[name] = Math.min(9999, had + 1);
  return { name, fresh: name !== BARE_NAME && had === 0 && (save.builds[name] | 0) > 0, count: save.builds[name] | 0, total: Object.keys(save.builds).length };
}

// ---- the share picture
const PAL = { love: ['#ff7aa8', '#6a1840'], rust: ['#e0904a', '#4a2412'], sneezy: ['#7ad4a0', '#14463a'], grumpy: ['#c07ae0', '#3a1858'], sleepy: ['#7a9ae8', '#1a2468'],
  disco: ['#f06ad8', '#40186a'], sour: ['#c8e050', '#3a5214'], mighty: ['#ffb040', '#58300e'], frosty: ['#8adcf4', '#163a5e'], gloomy: ['#a0a8c8', '#242848'] };
export const CARD_W = 1080, CARD_H = 1350;
export function cardLines(r, stageName) {
  const won = !!(r && r.won), pc = Math.floor(((r && r.progress) || 0) * 100);
  const m = Math.floor(((r && r.time) || 0) / 60), s = String(Math.floor(((r && r.time) || 0) % 60)).padStart(2, '0');
  return {
    stage: r && r.mode ? 'Cell Serpent' : 'Stage ' + (r ? r.stage : 1) + (stageName ? ': ' + stageName : ''),
    result: won ? 'CLEARED' + (r.stars > 0 ? '  ' + '★'.repeat(r.stars) : '') : pc + '% CLEARED',
    facts: [['TIME', m + ':' + s], ['CELLS', String((r && r.kills) | 0)], ['GROOVE', String(Math.round((r && r.groove) || 0))]],
  };
}
function fit(g, text, max, size, weight) { let s = size; g.font = `${weight} ${s}px system-ui,sans-serif`; while (s > 40 && g.measureText(text).width > max) { s -= 4; g.font = `${weight} ${s}px system-ui,sans-serif`; } return s; }
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function wrapName(g, name, max) {   // at most two lines, split at the space that balances them best
  if (g.measureText(name).width <= max) return [name];
  const w = name.split(' '); let best = [name, ''], gap = 1e9;
  for (let i = 1; i < w.length; i++) { const a = w.slice(0, i).join(' '), b = w.slice(i).join(' '), d = Math.abs(g.measureText(a).width - g.measureText(b).width); if (d < gap) { gap = d; best = [a, b]; } }
  return best;
}

// draws the picture on `cv` (any canvas); `imgs` is { weaponId: loaded image } and may be empty (then a tile with the first letter is drawn)
export function drawShareCard(cv, info, imgs = {}) {
  cv.width = CARD_W; cv.height = CARD_H; const g = cv.getContext('2d');
  const pal = PAL[info.skin] || PAL.love, L = cardLines(info.r, info.stageName), W = CARD_W;
  const bg = g.createLinearGradient(0, 0, 0, CARD_H); bg.addColorStop(0, pal[0]); bg.addColorStop(0.55, pal[1]); bg.addColorStop(1, '#14081a'); g.fillStyle = bg; g.fillRect(0, 0, W, CARD_H);
  g.fillStyle = 'rgba(255,255,255,.08)';   // a field of soft note dots
  for (let i = 0; i < 46; i++) { const x = (i * 197) % W, y = (i * 311) % CARD_H, r = 6 + (i * 7) % 18; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
  g.fillStyle = '#fff'; g.font = '900 56px system-ui,sans-serif'; g.fillText('CELL SERPENT', W / 2, 120);
  g.fillStyle = 'rgba(255,255,255,.8)'; g.font = '700 34px system-ui,sans-serif'; g.fillText('RoxorLoops & Jasmin', W / 2, 172);
  g.fillStyle = '#ffe27a'; g.font = '800 38px system-ui,sans-serif'; g.fillText('THE BUILD', W / 2, 310);
  const size = fit(g, info.name, W - 140, 120, 900), lines = wrapName(g, info.name, W - 140).filter(Boolean);
  const fs = lines.length > 1 ? Math.min(size, 110) : size; g.font = `900 ${fs}px system-ui,sans-serif`;
  g.lineWidth = 14; g.strokeStyle = 'rgba(30,8,40,.85)'; g.fillStyle = '#fff';
  lines.forEach((ln, i) => { const y = 310 + 20 + fs * (i + 1) * 1.05; g.strokeText(ln, W / 2, y); g.fillText(ln, W / 2, y); });
  let y = 330 + fs * lines.length * 1.05 + 75;
  g.fillStyle = 'rgba(255,255,255,.9)'; g.font = '600 38px system-ui,sans-serif'; g.fillText(info.tagline || '', W / 2, y); y += 50;
  const ws = info.weapons || [], tile = 168, gap = 28, rowW = ws.length * tile + Math.max(0, ws.length - 1) * gap;
  ws.forEach((w, i) => {
    const x = (W - rowW) / 2 + i * (tile + gap);
    rrect(g, x, y, tile, tile, 34); g.fillStyle = 'rgba(255,255,255,.18)'; g.fill(); g.lineWidth = 5; g.strokeStyle = 'rgba(255,255,255,.55)'; g.stroke();
    const im = imgs[w.id];
    if (im) { try { g.drawImage(im, x + 18, y + 14, tile - 36, tile - 36); } catch (e) { /* broken picture: skip it */ } }
    else { g.fillStyle = '#fff'; g.font = '900 80px system-ui,sans-serif'; g.fillText((WEAPON_WORD[w.id] || '?')[0], x + tile / 2, y + tile / 2 + 28); }
    rrect(g, x + tile - 74, y + tile - 40, 80, 48, 22); g.fillStyle = '#ffd23f'; g.fill(); g.fillStyle = '#3a1a00'; g.font = '900 32px system-ui,sans-serif'; g.fillText('+' + w.lv, x + tile - 34, y + tile - 6);
  });
  y += ws.length ? tile + 70 : 20;
  rrect(g, 90, y, W - 180, 330, 48); g.fillStyle = 'rgba(15,4,24,.55)'; g.fill();
  g.fillStyle = '#fff'; g.font = '700 42px system-ui,sans-serif'; g.fillText(L.stage, W / 2, y + 80);
  g.fillStyle = info.r && info.r.won ? '#ffe27a' : '#ffb0c8'; g.font = '900 96px system-ui,sans-serif'; g.fillText(L.result, W / 2, y + 188);
  L.facts.forEach(([k, v], i) => { const cx = W / 2 + (i - 1) * 290; g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '700 30px system-ui,sans-serif'; g.fillText(k, cx, y + 250); g.fillStyle = '#fff'; g.font = '900 48px system-ui,sans-serif'; g.fillText(v, cx, y + 305); });
  g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '700 36px system-ui,sans-serif'; g.fillText('Can you beat this build?', W / 2, CARD_H - 96);
  g.fillStyle = 'rgba(255,255,255,.6)'; g.font = '600 30px system-ui,sans-serif'; g.fillText(info.url || '', W / 2, CARD_H - 48);
  return cv;
}
const loadImg = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
// builds the picture; `iconSrc(id)` returns a data URL for a weapon id
export async function makeShareCard(info, iconSrc, doc = globalThis.document) {
  const imgs = {}; await Promise.all((info.weapons || []).map(async w => { const s = iconSrc && iconSrc(w.id); if (s) { const im = await loadImg(s); if (im) imgs[w.id] = im; } }));
  return drawShareCard(doc.createElement('canvas'), info, imgs);
}
const toBlob = cv => new Promise(res => { try { cv.toBlob(b => res(b), 'image/png'); } catch (e) { res(null); } });
// share the picture: the system share sheet with the file when it can, else a download; 'fail' when no picture could be made
export async function shareCard(info, iconSrc, text, toast, env = {}) {
  const nav = env.nav || globalThis.navigator, doc = env.doc || globalThis.document;
  let blob = null; try { blob = await toBlob(await makeShareCard(info, iconSrc, doc)); } catch (e) { blob = null; }
  if (!blob) return 'fail';
  const fname = 'cell-serpent-' + info.name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '') + '.png';
  try {
    const file = new File([blob], fname, { type: 'image/png' });
    if (nav && nav.canShare && nav.canShare({ files: [file] }) && nav.share) { await nav.share({ files: [file], text }); return 'shared'; }
  } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  try {
    const a = doc.createElement('a'), u = URL.createObjectURL(blob); a.href = u; a.download = fname; doc.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
    if (toast) toast('Picture saved, send it to a friend'); return 'saved';
  } catch (e) { return 'fail'; }
}
export const skinName = skin => (SKIN_NAMES[SKINS.indexOf(skin)] || skin || '');
