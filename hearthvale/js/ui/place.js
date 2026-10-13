// Placing and moving a building: the ghost, the validity check and the Place / Cancel bar.
import { icon } from '../icons.js';
import { S, $, esc, myPub, cmd, BUILDINGS, canAfford, missing, goodName, store } from './state.js';
import { toast, snd, ui, haptic } from './fx.js';
import { findSpot } from '../../shared/sim.js';
import { PLOT } from '../../shared/data.js';
import { close } from './frame.js';

// a stand-in village for the client-side placement check (matches the server rule)
function fakeP() {
  const p = myPub(); const moving = S.mode && S.mode.moveId;
  return { buildings: [{ x: 6, y: 6, w: 3, h: 3, id: 0 }, ...p.b.filter((b) => !(moving && b[0] === S.mode.moveId)).map((b) => ({ id: b[0], x: b[2], y: b[3], w: (BUILDINGS[b[1]] || { w: 3 }).w, h: (BUILDINGS[b[1]] || { h: 3 }).h }))].filter((b, i, a) => a.findIndex((o) => o.id === b.id) === i), nodes: p.n.map((n) => ({ x: n[2], y: n[3] })) };
}
export function startPlace(type, moveId = null) {
  const d = BUILDINGS[type]; if (!d || d.hidden) return false;
  close(true); S.api.closeSel && S.api.closeSel();
  S.mode = { type, moveId }; S.view.setGhost(type, myPub().color);
  const spot = findSpot(fakeP(), d.w, d.h, 0) || { x: 0, y: 0 }; ghostTo(spot.x, spot.y);
  $('#place').hidden = false; $('#placeName').innerHTML = `${icon(type, 28)} ${esc((moveId ? 'Move ' : 'Place ') + d.name)}`; $('#dock').hidden = true; $('#quick').hidden = true;
  if (!store.get('placehint', false)) { store.set('placehint', true); toast('Tap the grass to move it, then press Place', { icon: 'hand', type: 'gold', ms: 4200 }); }
  snd('place', { vol: 0.6 });
  return true;
}
export function ghostTo(tx, ty) {
  const G = S.view.ghost; if (!G) return; const d = G.d; tx = Math.max(0, Math.min(PLOT - d.w, tx)); ty = Math.max(0, Math.min(PLOT - d.h, ty));
  const P = fakeP(); const ok = P.buildings.every((b) => !(tx < b.x + b.w && b.x < tx + d.w && ty < b.y + b.h && b.y < ty + d.h)) && P.nodes.every((n) => !(tx < n.x + 1 && n.x < tx + d.w && ty < n.y + 1 && n.y < ty + d.h));
  S.view.moveGhost(S.view.villages.get(S.myId), tx, ty, ok);
  const okb = $('#placeOk'); okb.classList.toggle('off', !ok); okb.dataset.why = ok ? '' : 'Something is in the way. Tap a free spot!';
}
export function confirmPlace() {
  const G = S.view.ghost; if (!G || !S.mode) return;
  if (!G.ok) { toast('Something is in the way', { type: 'warn', icon: 'info' }); return; }
  const m = S.mode; let r;
  if (m.moveId) r = cmd({ op: 'move', id: m.moveId, x: G.x, y: G.y }); else {
    const d = BUILDINGS[m.type]; r = cmd({ op: 'place', type: m.type, x: G.x, y: G.y });
  }
  if (r && r.ok === false) return;
  snd(m.moveId ? 'place' : 'build', { vol: 0.9 }); haptic(20);
  S.view.punch(0.015);
  cancelPlace();
}
export function cancelPlace() {
  S.mode = null; S.view.setGhost(null); S.view.hideGrids(); $('#place').hidden = true; $('#dock').hidden = false;
}
export function initPlace() {
  $('#placeOk').onclick = confirmPlace; $('#placeNo').onclick = () => cancelPlace();
}
