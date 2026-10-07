// CHARACTER CAST: builds the whole game cast from Core data (never from copies): NPCS (Foxy, BeeAmGee, Rohzel, Pig Pen, Penny, regulars), the thrift CLERK,
// every OPPONENT and FINAL, the five JUDGES (new looks with props) and generic CROWD members. Everything is lazy: createCast() only reads data, characters are built on first use.
//   const cast = createCast(ctx, Core, { clerk })      // Core = BBH.Core, clerk = places.js CLERK look (optional, a copy is used otherwise)
//   cast.npc('foxy') | cast.opponent('hexx') | cast.final('wc3') | cast.judge('tek') | cast.clerk() | cast.crowdMember(i)      each returns the SAME character on repeat calls
//   cast.looks  plain look data of everybody (cheap, no GL), cast.buildAll(), cast.dispose()
import { createCharacter } from './characters.js';
import { createNPC, NPC_LOOKS } from './char_npc.js';

// the clerk of the thrift shop (same look as places.js CLERK; Core/places data wins when passed)
export const CLERK_LOOK = { name: 'Clerk', body: 'girl', skin: '#d9a46e', hair: { style: 'buns', color: '#7b3a22' }, top: { id: 'hawaiian', color: '#ff6b35' }, bottom: { id: 'skirt', color: '#2a9d8f' }, shoes: { id: 'hightops', color: '#f7f2e8' }, glasses: { id: 'round', color: '#d4a017' } };

// the five judges of the battle panel: each one reads at a glance (colour, silhouette, prop). prop = what they hold, in the 'hold' clip
export const JUDGES3D = {
  tek: { prop: { kind: 'clipboard', color: '#2ee6ff' }, look: { name: 'Tek', body: 'neutral', skin: '#e8cdbb', hair: { style: 'undercut', color: '#2ee6ff' }, eyes: { style: 'sharp', color: '#1ec8e0' }, brows: 'straight', glasses: { id: 'nerd', color: '#2ee6ff' }, top: { id: 'turtleneck', color: '#17141f' }, bottom: { id: 'techpants', color: '#34303f' }, shoes: { id: 'retro', color: '#2ee6ff' }, acc: { neck: { id: 'hpneck', color: '#2ee6ff' }, wrist: { id: 'watch', color: '#c9d3e6' } } } },
  mel: { prop: { kind: 'scorecard', color: '#ff3ea5' }, look: { name: 'Mel', body: 'girl', skin: '#a56c3f', hair: { style: 'long', color: '#9b5cff' }, eyes: { style: 'lashes', color: '#d98a1a' }, brows: 'arched', marks: ['blush'], top: { id: 'kimono', color: '#7b4fe0', color2: '#ffb703' }, bottom: { id: 'flares', color: '#ffb703' }, shoes: { id: 'platform', color: '#ff3ea5' }, acc: { ears: { id: 'hpears', color: '#ff3ea5' }, wrist: { id: 'bracelets', color: '#d4a017' } } } },
  origi: { prop: { kind: 'card', color: '#8dff4a' }, look: { name: 'Origi', body: 'boy', skin: '#d2a06f', hair: { style: 'mohawk', color: '#8dff4a' }, eyes: { style: 'wide', color: '#1c1620' }, brows: 'thick', facial: 'stubble', glasses: { id: 'goggles', color: '#ffb703' }, marks: ['starpaint'], top: { id: 'poncho', color: '#ff6b35', color2: '#2a9d8f' }, bottom: { id: 'ripped', color: '#2f5d3a' }, shoes: { id: 'fatlaces', color: '#2ee6ff' }, acc: { ears: { id: 'dangles', color: '#ffd23f' }, neck: { id: 'scarf', color: '#e03cc8' } } } },
  showtime: { prop: { kind: 'scorecard', color: '#d4a017' }, look: { name: 'Showtime', body: 'boy', skin: '#5e3823', hair: { style: 'fadewave', color: '#1a1420' }, eyes: { style: 'happy', color: '#1c1620' }, brows: 'arched', facial: 'mustache', glasses: { id: 'monocle', color: '#d4a017' }, hat: { id: 'tophat', color: '#17141f' }, marks: ['goldgrill'], top: { id: 'tux', color: '#17141f', color2: '#d4a017' }, bottom: { id: 'slacks', color: '#17141f' }, shoes: { id: 'loafers', color: '#d4a017' }, acc: { neck: { id: 'bowtie', color: '#d6203f' }, wrist: { id: 'icedwatch', color: '#e8f4ff' } } } },
  wildcard: { prop: { kind: 'card', color: '#e63946' }, look: { name: 'Wildcard', body: 'neutral', skin: '#f4d3bd', hair: { style: 'spiky', color: '#e03cc8' }, eyes: { style: 'cat', color: '#9b5cff' }, brows: 'thin', glasses: { id: 'eyepatch', color: '#17141f' }, marks: ['scar', 'starpaint'], top: { id: 'bomber', color: '#17141f', color2: '#e03cc8' }, bottom: { id: 'camo', color: '#7d1f3f' }, shoes: { id: 'skate', color: '#e63946' }, acc: { ears: { id: 'hoops', color: '#e63946' }, wrist: { id: 'stackedbands', color: '#2ee6ff' } } } },
};

// generic spectators / passers-by with a full look (the instanced crowd in char_crowd.js is for far away people). Deterministic per (seed, i).
const SKIN = ['#fde7d9', '#f2c4ae', '#e6bb8a', '#d9a46e', '#c68b5e', '#a56c3f', '#8f5632', '#6f3d2b', '#573220', '#3b2216'];
const HAIRC = ['#1a1420', '#2a2024', '#3b2418', '#5a3520', '#a5502a', '#b89558', '#dcbc6a', '#b9b9c8', '#ff3ea5', '#2ee6ff', '#9b5cff', '#8dff4a'];
const OUTC = ['#e63946', '#ff6b35', '#ffb703', '#8ac926', '#2a9d8f', '#1d9bd1', '#3a5fcd', '#7b4fe0', '#c13fcf', '#ff4fa3', '#f7f2e8', '#6b6b80', '#34303f', '#17141f', '#2f5d3a', '#7d1f3f'];
const TOPSL = ['tee', 'tank', 'hoodie', 'croptop', 'sweater', 'flannel', 'dress', 'jacket', 'varsity', 'tracktop', 'hawaiian', 'overalls', 'oversized', 'hoodiebig', 'bomber', 'windbreaker', 'denimjacket', 'puffvest'];
const BOTL = ['jeans', 'cargo', 'shorts', 'skirt', 'joggers', 'baggy', 'leggings', 'trackpants', 'sweatpants', 'camo', 'slacks'];
const SHOEL = ['sneakers', 'hightops', 'boots', 'sandals', 'skate', 'retro', 'slides', 'fatlaces'];
const HAIRL = ['crop', 'buzz', 'sidepart', 'quiff', 'undercut', 'waves', 'curly', 'afro', 'bob', 'long', 'ponytail', 'pigtails', 'buns', 'topknot', 'braids', 'locs', 'mohawk', 'fade', 'cornrows', 'twists', 'fadewave'];
const HATL = ['none', 'none', 'none', 'cap', 'beanie', 'bucket', 'snapback', 'bandana', 'headband', 'trucker'];
const GLASL = ['none', 'none', 'none', 'none', 'round', 'nerd', 'shades', 'wayfarer'];
export function crowdLook(i, seed) {
  let s = ((seed || 1) * 2654435761 + i * 40503 + 977) >>> 0; const r = () => { s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return (s >>> 8) / 16777216; }, pick = (a) => a[Math.floor(r() * a.length) % a.length];
  const body = pick(['boy', 'girl', 'neutral']);
  return { name: 'Fan ' + (i + 1), body, skin: pick(SKIN), hair: { style: pick(HAIRL), color: pick(HAIRC) }, eyes: { style: pick(['round', 'sharp', 'sleepy', 'happy', 'lashes', 'wide']), color: '#4a2c1a' }, facial: body === 'boy' && r() < 0.25 ? pick(['stubble', 'goatee', 'beard']) : 'none', marks: r() < 0.15 ? ['freckles'] : [],
    top: { id: pick(TOPSL), color: pick(OUTC), color2: pick(OUTC) }, bottom: { id: pick(BOTL), color: pick(OUTC) }, shoes: { id: pick(SHOEL), color: pick(OUTC) }, hat: { id: pick(HATL), color: pick(OUTC) }, glasses: { id: pick(GLASL), color: '#17141f' }, acc: {} };
}

// plain data of the whole cast, straight from Core (no characters are built here)
export function castLooks(Core, opts) {
  opts = opts || {}; const out = { npc: {}, opponent: {}, final: {}, judge: {}, clerk: opts.clerk || CLERK_LOOK };
  const NP = (Core && Core.NPCS) || {}; for (const id in NP) out.npc[id] = NP[id].look || NPC_LOOKS[id];
  ((Core && Core.OPPONENTS) || []).forEach((o) => { out.opponent[o.id] = o.look || (NP[o.id] && NP[o.id].look); });
  ((Core && Core.FINALS) || []).forEach((o) => { out.final[o.id] = o.look; });
  const JL = (Core && Core.JUDGES) || Object.keys(JUDGES3D).map((id) => ({ id })); JL.forEach((j) => { const d = JUDGES3D[j.id]; if (d) out.judge[j.id] = d.look; else out.judge[j.id] = Object.assign({}, JUDGES3D.wildcard.look, { name: j.name || j.id }); });
  return out;
}

export function createCast(ctx, Core, opts) {
  opts = opts || {}; const looks = castLooks(Core, opts), made = {}, jt = {}; (((Core && Core.JUDGES) || []).forEach((j) => { jt[j.id] = j; }));
  const get = (kind, id, make) => { const k = kind + ':' + id; if (!made[k]) { const look = kind === 'clerk' ? looks.clerk : looks[kind][id]; if (!look) throw new Error('no ' + kind + ' look for ' + id); made[k] = make(look); made[k].castKey = k; } return made[k]; };
  const named = (c, d) => { c.id = d.id; c.displayName = d.name; return c; };
  const cast = {
    looks, made,
    npc: (id) => get('npc', id, (look) => createNPC(ctx, id, { look })),
    opponent: (id) => get('opponent', id, (look) => { const d = ((Core && Core.OPPONENTS) || []).find((o) => o.id === id) || { id, name: id }; const c = named(createCharacter(ctx, look), d); c.taunt = d.taunt; c.defeat = d.defeat; return c; }),
    final: (id) => get('final', id, (look) => { const d = ((Core && Core.FINALS) || []).find((o) => o.id === id) || { id, name: id }; const c = named(createCharacter(ctx, look), d); c.taunt = d.taunt; return c; }),
    judge: (id) => get('judge', id, (look) => { const d = JUDGES3D[id], j = jt[id] || { id, name: look.name }, c = named(createCharacter(ctx, look), j); c.quip = j.quip; c.likes = j.likes; if (d) { c.setProp(d.prop.kind, { color: d.prop.color }); c.play('hold', { prop: d.prop.kind, raise: 0 }); } return c; }),
    clerk: () => get('clerk', 'clerk', (look) => { const c = createCharacter(ctx, look); c.id = 'clerk'; c.displayName = 'Clerk'; return c; }),
    crowdMember: (i, seed) => { const k = 'crowd:' + (seed || 1) + ':' + i; if (!made[k]) { made[k] = createCharacter(ctx, crowdLook(i, seed)); made[k].castKey = k; } return made[k]; },
    list() { const l = []; for (const kind in looks) { if (kind === 'clerk') l.push('clerk:clerk'); else for (const id in looks[kind]) l.push(kind + ':' + id); } return l; },
    buildAll() { const out = []; for (const k of cast.list()) { const [kind, id] = k.split(':'); out.push(kind === 'clerk' ? cast.clerk() : cast[kind](id)); } return out; },
    dispose() { for (const k in made) { try { made[k].dispose(); } catch (e) { /* ignore */ } delete made[k]; } },
  };
  return cast;
}
