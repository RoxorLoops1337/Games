// Registers every screen and owns world selection, the confirm dialogs and photo mode.
import './overlay.js';
import './build.js';
import './building.js';
import './villagers.js';
import './inventory.js';
import './valley.js';
import './journal.js';
import './misc.js';
import { icon } from '../icons.js';
import { S, $, cmd } from './state.js';
import { open, close, current } from './frame.js';
import { toast, snd, ui, haptic, reduced } from './fx.js';
import { modal } from './overlay.js';
import { initPlace } from './place.js';
export { startPlace, ghostTo, cancelPlace, confirmPlace } from './place.js';

export function initScreens() {
  initPlace();
  S.api.closeSel = closeSel;
  $('#phExit').innerHTML = icon('close', 24); $('#phExit').onclick = () => photoMode(false);
  $('#phShot').innerHTML = icon('camera', 34); $('#phShot').onclick = shoot;
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.photo) photoMode(false); });
}
export function closeSel() {
  S.selected = null; S.view.select(null);
  const c = current(); if (c && (c.def.id === 'building')) close();
}
export function selectWorld(hit) {
  const view = S.view;
  if (hit.k === 'bld') {
    if (S.selected && S.selected.k === 'vil') { cmd({ op: 'assign', k: 'bld', id: hit.id, vid: S.selected.id }); toast('On the way!', { icon: 'worker', key: 'send', type: 'good', sound: false }); }
    S.selected = { k: 'bld', id: hit.id, pid: hit.pid }; view.select(hit.obj, 1.4); snd('door', { vol: 0.5 });
    open('building', { id: hit.id }); view.punch(0.012);
    // keep the tapped building visible above the sheet: slide the camera target toward the viewer when it sits low on screen
    const w = hit.obj.getWorldPosition ? hit.obj.getWorldPosition(new (hit.obj.position.constructor)()) : hit.obj.position; const sp = view.project(w.x, 1, w.z);
    if (sp.vis && sp.y > innerHeight * 0.4) { const L = view.goal, k = L.dist * 0.19; L.x = w.x + Math.sin(L.yaw) * k; L.z = w.z + Math.cos(L.yaw) * k; }
  } else if (hit.k === 'vil') {
    close(true); S.selected = { k: 'vil', id: hit.id, pid: hit.pid }; view.select(hit.obj, 0.5); snd('tap2', { vol: 0.6 });
  }
}

// ---------- photo mode ----------
export function photoMode(on) {
  on = on === undefined ? !S.photo : !!on; S.photo = on; S.view.photo(on); document.body.classList.toggle('photo', on); $('#photoBar').hidden = !on;
  if (on) { close(true); closeSel(); toast('Drag to look around, then press the shutter', { icon: 'camera', type: 'gold', ms: 3200 }); }
  else { /* back to the game */ }
}
function shoot() {
  const view = S.view, cv = view.canvas; let blob = null;
  try { view.frame(0.0001); } catch { /* ignore */ }
  const finish = (b) => {
    view.flash('#ffffff', 0.7, 0.35); snd('unlock', { vol: 0.8 }); haptic(25);
    if (!b) { toast('Could not take the photo on this device', { type: 'bad', icon: 'camera' }); return; }
    const url = URL.createObjectURL(b);
    const m = modal(`<div class="polaroid"><img src="${url}" alt="Your village"><small>Hearthvale - ${new Date().toLocaleDateString()}</small></div><div class="row ctr" style="margin-top:12px"><button class="b b-blue" data-r="share" data-snd="confirm">${icon('share', 22)} Share</button><button class="b b-green" data-r="save" data-snd="confirm">${icon('arrow', 20)} Save</button><button class="b b-cream" data-r="x" data-snd="back">Close</button></div>`, { cls: 'photo-ov', onClose: () => setTimeout(() => URL.revokeObjectURL(url), 2000) });
    m.card.addEventListener('click', async (e) => {
      const r = e.target.closest('[data-r]'); if (!r) return; const file = new File([b], 'hearthvale.png', { type: 'image/png' });
      if (r.dataset.r === 'share') { try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'My Hearthvale village' }); return; } } catch { /* cancelled */ } dl(); }
      else if (r.dataset.r === 'save') dl(); else m.close();
    });
    const dl = () => { const a = document.createElement('a'); a.href = url; a.download = 'hearthvale.png'; document.body.appendChild(a); a.click(); a.remove(); toast('Photo saved!', { icon: 'camera', type: 'good' }); };
  };
  // the drawing buffer is only valid right after a render, so capture synchronously in the same task
  try { cv.toBlob(finish, 'image/png'); } catch { finish(null); }
}
