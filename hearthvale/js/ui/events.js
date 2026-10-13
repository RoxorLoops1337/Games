// Turns sim events and popups into sound, scene celebrations, toasts and flying rewards (see docs/AUDIO.md for the trigger table).
import { icon } from '../icons.js';
import { S, $, esc, goodName, GOODS, BUILDINGS, coinFrom } from './state.js';
import { toast, toastGain, snd, ui, haptic, panAt, sparkAt, flyTo, shake, floatAt, confetti, reduced } from './fx.js';
import { showLevelUp, achBanner, questCard, projectSplash } from './celebrate.js';
import { open } from './frame.js';
import { ICON, ACHIEVEMENTS, PROJECT_STAGES, QUESTS, SKILLS } from '../../shared/data.js';

const EMOJI = {}; for (const g of GOODS) EMOJI[ICON[g]] = g; EMOJI[ICON.coins] = 'coins';
const SOUND_FOR = { wood: 'chop', stone: 'mine', clay: 'dig', wheat: 'harvest', fish: 'fishCatch', egg: 'cluck', milk: 'moo', wool: 'baa', apple: 'gather', planks: 'sawing', bricks: 'craft', flour: 'bake', bread: 'bake', soup: 'cook', scrolls: 'craft', cheese: 'cook', jam: 'cook', cloth: 'craft', pie: 'bake' };
const RAW = new Set(['wood', 'clay', 'stone', 'wheat']);
let hungerAt = new Map(), booted = false;

export function initEvents() { booted = true; }
const myV = () => S.view.villages.get(S.myId);
const bldPos = (pid, id) => { const V = S.view.villages.get(pid), m = V && V.b.get(id); return m ? { x: V.group.position.x + m.position.x, z: V.group.position.z + m.position.z } : (V ? { x: V.group.position.x, z: V.group.position.z } : { x: 0, z: 0 }); };
const homePos = (pid) => { const V = S.view.villages.get(pid); return V ? { x: V.group.position.x, z: V.group.position.z } : { x: 0, z: 0 }; };

/** runs BEFORE the HUD diff so coin payouts know where on screen they came from */
export function preEvents(s) {
  const view = S.view; for (const e of s.events || []) {
    const mine = e.pid === S.myId; let w = null;
    if (e.t === 'order') w = { x: 0, z: 0 }; else if (e.t === 'project') w = { x: 0, z: -5.4 }; else if (e.t === 'visitor' && mine && e.state === 'served') w = homePos(S.myId); else if (e.t === 'quest' && mine) w = homePos(S.myId);
    if (w) { const p = view.project(w.x, 1.6, w.z); if (p.vis) coinFrom({ x: p.x, y: p.y }); }
  }
}
export function handleEvents(s, prev, prevYou) {
  const me = S.myId, you = S.you, view = S.view;
  // ----- popups (world text, gains, warnings) -----
  for (const p of you.popups || []) popup(p);
  // ----- quests finished since the last snapshot -----
  if (prevYou) for (const k of Object.keys(you.quests)) if (you.quests[k] && !prevYou.quests[k]) { S.unseen.quest++; questCard(k); }
  // ----- villagers getting hungry -----
  for (const v of you.villagers) { if (v.state === 'hungry') { const t = hungerAt.get(v.id) || 0; if (performance.now() - t > 60000) { hungerAt.set(v.id, performance.now()); snd('hungry', { vol: 0.7 }); } } }
  // ----- events -----
  for (const e of s.events || []) {
    const mine = e.pid === me;
    switch (e.t) {
      case 'levelup': if (mine) showLevelUp(e.level); break;
      case 'built': if (mine) { const b = S.snap.players.find((p) => p.id === me).b.find((b) => b[0] === e.id); const d = b && BUILDINGS[b[1]]; const w = bldPos(me, e.id); snd(d && d.field ? 'sow' : 'buildDone', { pan: panAt(w.x) }); view.celebrate('built', w.x, w.z, { w: d ? d.w : 2, h: d ? d.h : 2 }); haptic(20); if (d) toast(d.name + ' is ready!', { icon: b[1], type: 'good', sound: false, key: 'built' }); } break;
      case 'order': snd('orderComplete'); toast('A Valley order was finished!', { icon: 'scrolls', type: 'gold', sound: false }); view.celebrate('cheer', 0, 0); break;
      case 'valleylevel': toast('The Valley reached level ' + e.level + '!', { icon: 'valley', type: 'gold', sound: false }); snd('reward'); break;
      case 'gift': if (e.to === me) { const from = s.players.find((p) => p.id === e.from); toast(`${from ? from.name : 'A neighbour'} sent you ${e.n} ${goodName(e.res).toLowerCase()}!`, { icon: 'gift', type: 'pink', sound: false }); snd('giftReceived'); haptic([10, 30, 10]); const h = homePos(me); view.hearts(h.x, h.z); const p0 = view.project(h.x, 1.5, h.z); if (p0.vis) flyTo(p0, $('#strip'), { icon: e.res, n: 3 }); } break;
      case 'emote': { const p = s.players.find((p) => p.id === e.pid); const V = p && view.villages.get(p.id); if (V) { const sp = view.project(V.group.position.x, 3.5, V.group.position.z); if (sp.vis) floatAt(sp.x, sp.y, `<span class="emo">${esc(e.e)}</span>`, 'fl-emo'); if (e.pid !== me) snd('giggle', { vol: 0.5, pan: panAt(V.group.position.x) }); } break; }
      case 'ach': if (mine) { S.unseen.ach++; achBanner(e.id); } break;
      case 'project': projectSplash(e.stage); break;
      case 'daily': if (mine) { /* the daily screen plays its own show */ } break;
      case 'visitor': if (mine) { if (e.state === 'arrive') { S.unseen.visitor = true; snd('visitorArrive'); toast('A visitor has arrived!', { icon: 'visitor', type: 'gold', sound: false, click: () => open('visitor', {}), ms: 4500 }); const h = homePos(me); view.celebrate('cheer', h.x, h.z); } else if (e.state === 'leave') toast('The visitor wandered off', { icon: 'visitor', sound: false }); else if (e.state === 'served') { const h = homePos(me); view.celebrate('ach', h.x, h.z); } } break;
      case 'festival': if (e.state === 'start') { snd('festivalStart'); toast('The festival has begun!', { icon: 'festival', type: 'pink', sound: false, ms: 4500 }); view.celebrate('festival', 0, 0); setTimeout(() => view.celebrate('festival', 8, -6), 700); view.flash('#ffe6f2', 0.2, 0.7); haptic([20, 40, 20]); } else toast('The festival is over. See you next time!', { icon: 'festival', sound: false }); break;
      case 'merchant': if (e.state === 'arrive') { S.unseen.merchant = true; snd('merchantArrive'); toast('The travelling merchant is here! Ring ring!', { icon: 'bell', type: 'gold', sound: false, click: () => open('valley', { tab: 'merchant' }), ms: 5000 }); } else toast('The merchant packed up and left', { icon: 'merchant', sound: false }); break;
      case 'trade': break;
      case 'animal': if (mine) { const k = e.kind; snd({ chicken: 'cluck', cow: 'moo', sheep: 'baa' }[k] || 'cheer'); const w = bldPos(me, e.id); view.celebrate('cheer', w.x, w.z); toast('A new friend: ' + k + '!', { icon: k, type: 'pink', sound: false, key: 'animal' }); } break;
      case 'skill': if (mine) { toast(`Skill up! ${SKILLS.includes(e.skill) ? e.skill : 'skill'} level ${e.level}`, { icon: 'star', type: 'gold', sound: false, key: 'skill' }); snd('unlock', { vol: 0.7 }); } break;
      default: break;
    }
  }
}

function popup(p) {
  const view = S.view, sp = view.project(p.x, 1.8, p.z), onScreen = sp.vis && sp.x > -20 && sp.x < innerWidth + 20 && sp.y > -20 && sp.y < innerHeight + 20;
  const text = p.text; const m = /^\+(\d+)\s*(\S+)/.exec(text); const good = m && EMOJI[m[2]];
  if (/Storage full/.test(text)) { for (const g of document.querySelectorAll('.gp.full')) shake(g); snd('warn', { vol: 0.7, pan: panAt(p.x) }); toast('Storage is full!', { icon: 'crate', type: 'warn', key: 'full', sound: false }); }
  else if (good && good !== 'coins') {
    snd(SOUND_FOR[good] || 'gather', { pan: panAt(p.x), vol: 0.65 }); if (good === 'wheat' || good === 'apple') view.celebrate('harvest', p.x, p.z, { color: good === 'apple' ? '#ff7f7f' : '#ffd84a' }); else if (!RAW.has(good) && !['egg', 'milk', 'wool', 'fish'].includes(good)) view.celebrate('craft', p.x, p.z);
    if (onScreen) { const dst = document.querySelector(`.gp[data-g="${good}"]`) || $('#strip'); flyTo(sp, dst, { icon: good, n: Math.min(3, 1 + Math.floor(+m[1] / 6)), size: 24, dur: 800, trail: '#fff' }); }
    if (!RAW.has(good)) toastGain(good, +m[1], goodName(good).toLowerCase(), good);
  } else if (/ready!|done!|upgraded|learned|Skill|Quest done|Achievement|Day \d/.test(text)) { /* covered by events */ }
  if (/^(Quest done|Achievement|Day \d|Order done)/.test(text)) return;
  if (onScreen && !(good && good !== 'coins')) { const d = document.createElement('div'); d.className = 'pop'; d.textContent = text; d.style.left = sp.x + 'px'; d.style.top = sp.y + 'px'; $('#popups').appendChild(d); setTimeout(() => d.remove(), 1500); }
  else if (onScreen && good) { const d = document.createElement('div'); d.className = 'pop'; d.innerHTML = `${esc(m[1] ? '+' + m[1] : '')} ${icon(good, 22)}`; d.style.left = sp.x + 'px'; d.style.top = sp.y + 'px'; $('#popups').appendChild(d); setTimeout(() => d.remove(), 1500); }
}

// ---------- ambient work and animal sounds, spatial and gentle (drive from actions, never every frame) ----------
const TOOL_SND = { axe: 'chop', pick: 'mine', hoe: 'dig', hammer: 'hammer', basket: 'gather', cane: 'fishCast', ladle: 'stir', saw: 'sawing' };
const CRITTER_SND = { sheep: 'baa', cow: 'moo', chicken: 'cluck', puppy: 'woof', kitten: 'meow', duckling: 'quack', froggy: 'ribbit', bunny: null, snail: null };
let wt = 1, ct = 9;
export function ambientSounds(dt) {
  const view = S.view; if (!view || !S.snap || S.photo) return; wt -= dt; ct -= dt; if (wt > 0 && ct > 0) return;
  const far = Math.max(0.25, Math.min(1, 1.25 - view.look.dist / 60));
  if (wt <= 0) {
    wt = 0.9 + Math.random() * 0.8; let n = 0;
    for (const [, m] of view.villagers) {
      const u = m.userData; if (u.pid !== S.myId || (u.state !== 'work' && u.state !== 'build')) continue;
      const sp = view.project(m.position.x, 1, m.position.z); if (!sp.vis || sp.x < 0 || sp.x > innerWidth || sp.y < 0 || sp.y > innerHeight || Math.random() < 0.45) continue;
      const nm = u.state === 'build' ? 'hammer' : TOOL_SND[u.tool]; if (nm) { snd(nm, { pan: panAt(m.position.x), vol: 0.55 * far }); if (++n >= 2) break; }
    }
  }
  if (ct <= 0) {
    ct = 8 + Math.random() * 16; const list = view.critters.filter((c) => c.visible && CRITTER_SND[c.userData.kind] && (c.userData.kind !== 'froggy' || (view.night || 0) > 0.4));
    if (list.length) { const c = list[(Math.random() * list.length) | 0]; snd(CRITTER_SND[c.userData.kind], { pan: panAt(c.position.x), vol: 0.6 * far }); }
  }
}
