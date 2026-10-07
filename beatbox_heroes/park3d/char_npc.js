// NPC cast built from the same kit: BeeAmGee (seated mentor with a boombox), Foxy, Rohzel and the rest of the game's NPCS (looks copied from core.js).
import { THREE } from './kit.js';
import { MB, K, plainGeo } from './char_geo.js';
import { boombox } from './char_gear.js';
import { createCharacter, sharedMats } from './characters.js';

const L = (o) => o;
export const NPC_LOOKS = {
  beeamgee: L({ name: 'BeeAmGee', body: 'boy', age: 'old', skin: '#e6bb8a', hair: { style: 'sidepart', color: '#b9b9c8' }, eyes: { style: 'sleepy', color: '#7a8aa0' }, brows: 'thick', facial: 'longbeard', top: { id: 'denimjacket', color: '#3a5fcd', color2: '#2c4a9e' }, bottom: { id: 'jeans', color: '#34303f' }, shoes: { id: 'timbs', color: '#b98b5e' }, hat: { id: 'flatcap', color: '#7a6a58', color2: '#5a4c3e' }, glasses: { id: 'gold_round', color: '#d4a017' }, acc: { neck: { id: 'chain', color: '#d4a017' } } }),
  foxy: L({ name: 'Foxy', body: 'neutral', skin: '#e6bb8a', hair: { style: 'waves', color: '#7b3a22' }, eyes: { style: 'happy', color: '#2f8a4a' }, marks: ['freckles'], top: { id: 'hoodiebig', color: '#3f9b5a', color2: '#f7f2e8' }, bottom: { id: 'ripped', color: '#3a5fcd' }, shoes: { id: 'fatlaces', color: '#f7f2e8' }, hat: { id: 'none' }, acc: { ears: { id: 'studs', color: '#d4a017' } } }),
  rohzel: L({ name: 'Rohzel', body: 'neutral', skin: '#8f5632', hair: { style: 'cornrows', color: '#1a1420' }, eyes: { style: 'sleepy', color: '#4a2c1a' }, top: { id: 'jersey', color: '#17141f', color2: '#d4a017' }, bottom: { id: 'camo', color: '#5a5a48' }, shoes: { id: 'timbs', color: '#b98b5e' }, hat: { id: 'none' }, acc: { ears: { id: 'iced', color: '#e8f4ff' } } }),
  pigpen: L({ name: 'Pig Pen', body: 'boy', skin: '#cf9456', hair: { style: 'fadewave', color: '#1a1420' }, eyes: { style: 'sharp', color: '#1c1620' }, facial: 'goatee', top: { id: 'bomber', color: '#d6203f', color2: '#17141f' }, bottom: { id: 'techpants', color: '#17141f' }, shoes: { id: 'retro', color: '#d6203f' }, hat: { id: 'fitted', color: '#d6203f' }, acc: { neck: { id: 'cubanchain', color: '#d4a017' } } }),
  penny: L({ name: 'Penny', body: 'girl', skin: '#f2c4ae', hair: { style: 'bob', color: '#ff3ea5' }, eyes: { style: 'cat', color: '#8a4fd6' }, top: { id: 'champ', color: '#d4a017' }, bottom: { id: 'leggings', color: '#17141f' }, shoes: { id: 'platform', color: '#ff3ea5' }, glasses: { id: 'chromeshield', color: '#c9d3e6' }, hat: { id: 'none' }, acc: { wrist: { id: 'icedwatch', color: '#e8f4ff' }, hand: { id: 'goldmic', color: '#d4a017' } } }),
  luca: L({ name: 'Luca', body: 'boy', skin: '#d9a46e', hair: { style: 'quiff', color: '#3b2418' }, top: { id: 'windbreaker', color: '#e63946', color2: '#f7f2e8' }, bottom: { id: 'jeans', color: '#17141f' }, shoes: { id: 'retro', color: '#f7f2e8' }, hat: { id: 'none' } }),
  mira: L({ name: 'Mira', body: 'girl', skin: '#6f3d2b', hair: { style: 'afro', color: '#1a1420' }, top: { id: 'croptop', color: '#ffb703' }, bottom: { id: 'sweatpants', color: '#7b4fe0' }, shoes: { id: 'fatlaces', color: '#f7f2e8' }, hat: { id: 'none' }, acc: { ears: { id: 'hoops', color: '#d4a017' } } }),
  sky: L({ name: 'Sky', body: 'neutral', skin: '#f4d3bd', hair: { style: 'undercut', color: '#2ee6ff' }, top: { id: 'oversized', color: '#7b4fe0' }, bottom: { id: 'techpants', color: '#34303f' }, shoes: { id: 'retro', color: '#2ee6ff' }, hat: { id: 'trucker', color: '#17141f' } }),
  pascal: L({ name: 'Pascal', body: 'boy', skin: '#b87f4e', hair: { style: 'curly', color: '#2a2024' }, facial: 'stubble', top: { id: 'hawaiian', color: '#2a9d8f' }, bottom: { id: 'shorts', color: '#f7f2e8' }, shoes: { id: 'slides', color: '#17141f' }, hat: { id: 'none' } }),
  jin: L({ name: 'Jin', body: 'neutral', skin: '#efb9a6', hair: { style: 'bob', color: '#1a1420' }, top: { id: 'turtleneck', color: '#17141f' }, bottom: { id: 'slacks', color: '#6b6b80' }, glasses: { id: 'round', color: '#17141f' }, shoes: { id: 'loafers', color: '#17141f' }, hat: { id: 'none' } }),
  roo: L({ name: 'Roo', body: 'girl', skin: '#a56c3f', hair: { style: 'pigtails', color: '#ff8a2a' }, top: { id: 'varsity', color: '#3a5fcd' }, bottom: { id: 'shorts', color: '#17141f' }, shoes: { id: 'hightops', color: '#ff8a2a' }, hat: { id: 'none' }, acc: { wrist: { id: 'stackedbands', color: '#ff3ea5' } } }),
};

// default homes (x, z, rotY) so a casual createNPC lands somewhere sensible; call npc.place(x, z, rot) to move
const HOME = { foxy: [6.2, -4.2, 2.7], rohzel: [-5.5, 7, 1.07] };

// the boombox that sits beside BeeAmGee: separate meshes so the speakers can pump with the beat
function boomboxProp(colour) {
  const g = new THREE.Group(), M = sharedMats(), lit = new MB(41), glow = new MB(42);
  boombox(lit, glow, [0, 0, 0], [0, 0, 0], 1.25, K('hips'), colour, true);
  const m1 = new THREE.Mesh(plainGeo(lit), M.lit), m2 = new THREE.Mesh(plainGeo(glow), M.glow); m1.castShadow = true; m1.receiveShadow = true; g.add(m1, m2); g.userData.glow = m2;
  return g;
}

// createNPC(ctx, id, opts): opts.hat === false drops BeeAmGee's flat cap, opts.look overrides the stored look, opts.outline false is reserved
export function createNPC(ctx, id, opts) {
  opts = opts || {}; const base = NPC_LOOKS[id] || NPC_LOOKS.foxy, look = Object.assign({}, base, opts.look || {});
  if (id === 'beeamgee' && opts.hat === false) look.hat = { id: 'none' };
  const c = createCharacter(ctx, look); c.id = id; c.npcName = look.name;
  const seat = opts.seat === undefined ? 0.46 : opts.seat; c.seat = seat; c.music = { bpm: 92, level: 0 };
  const origUpdate = c.update, origPlay = c.play;
  // place(x, z, rotY, seatHeight, lateral): lateral shifts the character sideways along the bench (character-left = +); the terrain's player spot snaps to the bench centre
  c.lateral = opts.offset === undefined ? (id === 'beeamgee' ? -0.55 : 0) : opts.offset;
  c.place = (x, z, rot, seatH, lateral) => { if (lateral !== undefined) c.lateral = lateral; rot = rot || 0; c.object.position.set(x + c.lateral * Math.cos(rot), 0, z - c.lateral * Math.sin(rot)); c.object.rotation.y = rot; if (seatH !== undefined) { c.seat = seatH; if (id === 'beeamgee') origPlay('sit', { seat: seatH, bpm: c.music.bpm, slump: 1.4 }); } return c; };
  c.setMusic = (bpm, level) => { c.music.bpm = bpm || 0; c.music.level = level === undefined ? 1 : level; if (id === 'beeamgee') origPlay('sit', { seat, bpm: c.music.bpm, slump: 1.4, amp: c.music.level }); };
  if (id === 'beeamgee') {
    c.boombox = boomboxProp('#8d3b2f'); c.boombox.position.set(-0.8, 0.135, 0.1); c.boombox.rotation.y = 0.3; c.object.add(c.boombox);   // on the ground by the end of the bench
    c.place(-9, -4, 1.1526, seat);                       // the old bench of the terrain's bench cluster (anchors.bench: x -9, z -4, rot 1.1526, seatY 0.46)
    origPlay('sit', { seat, bpm: c.music.bpm, slump: 1.4 });
    // BeeAmGee never stands: every clip request becomes a seated variant
    c.play = (clip, o) => { const base = { seat: c.seat, slump: 1.4, bpm: c.music.bpm, amp: c.music.level }; if (clip === 'talk') origPlay('sit', Object.assign(base, { talk: true, bpm: 0 }, o)); else if (clip === 'wave') origPlay('sit', Object.assign(base, { wave: true }, o)); else origPlay('sit', Object.assign(base, o)); };
    let t0 = 0;
    c.update = (dt, t) => {
      origUpdate(dt, t); t0 += dt; const beat = (t0 * c.music.bpm) / 60, k = c.music.bpm ? Math.exp(-((beat % 1) * 5)) : 0, bx = c.boombox;
      bx.scale.set(1 + 0.02 * k, 1 - 0.015 * k, 1 + 0.02 * k); bx.userData.glow.visible = !c.music.bpm || (beat * 2) % 1 < 0.9;
    };
  } else if (HOME[id]) { c.place(HOME[id][0], HOME[id][1], HOME[id][2]); }
  return c;
}
