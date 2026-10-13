// Shared client UI state and tiny helpers. Everything the UI modules need to agree on lives in S.
import { GOODS, SELL, BUILDINGS } from '../../shared/data.js';

export const S = {
  view: null, link: null, snap: null, you: null, myId: null, pub: null, snapAt: 0,
  mode: null,            // placing a building: { type, moveId }
  selected: null,        // { k:'bld'|'vil', id, pid } currently highlighted world object
  unseen: { quest: 0, ach: 0, merchant: false, visitor: false },
  api: {},               // cross-module calls registered at start-up (open, close, toast, ...)
};
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** localStorage with try/catch and JSON; keys are namespaced "hearthvale.<k>" (so store.get('tour') is "hearthvale.tour") */
export const store = {
  get(k, d) { try { const v = localStorage.getItem('hearthvale.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('hearthvale.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

/** 1234 -> "1,234", 12345 -> "12.3k" */
export const fmt = (n) => { n = Math.floor(+n || 0); return n < 10000 ? String(n) : n < 1e6 ? (n / 1000).toFixed(n < 100000 ? 1 : 0).replace(/\.0$/, '') + 'k' : (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'; };
export const mmss = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
export const hms = (ms) => { const m = Math.max(0, Math.ceil(ms / 60000)); return m >= 60 ? Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm' : m + ' min'; };
export const cap1 = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

export const have = (k) => (S.you ? (k === 'coins' ? S.you.coins : S.you.res[k] || 0) : 0);
export const canAfford = (cost) => Object.entries(cost).every(([k, n]) => have(k) >= n);
export const missing = (cost) => Object.entries(cost).filter(([k, n]) => have(k) < n).map(([k, n]) => [k, n - have(k)]);
export const myPub = () => S.snap && S.snap.players.find((p) => p.id === S.myId);
export const yourB = (id) => S.you && S.you.buildings.find((b) => b.id === id);
export const pubB = (pid, id) => { const p = S.snap && S.snap.players.find((q) => q.id === pid); return p && p.b.find((b) => b[0] === id); };

/** where each good comes from and how it is grouped (inventory sheet, tooltips) */
export const GOOD = {
  wood:   { name: 'Wood',   grp: 'raw',     from: 'Chop trees and the Whisper Forest', tint: '#fbe4c0' },
  clay:   { name: 'Clay',   grp: 'raw',     from: 'Dig clay pits and the Riverbank', tint: '#ffd9cc' },
  stone:  { name: 'Stone',  grp: 'raw',     from: 'Mine boulders and the Granite Quarry', tint: '#e1e8f5' },
  wheat:  { name: 'Wheat',  grp: 'raw',     from: 'Wheat Field and the Golden Meadow', tint: '#fff0b0' },
  planks: { name: 'Planks', grp: 'crafted', from: 'Sawmill: 2 wood each', tint: '#fbe4c0' },
  bricks: { name: 'Bricks', grp: 'crafted', from: 'Brick Kiln: 2 clay each', tint: '#ffd9cc' },
  flour:  { name: 'Flour',  grp: 'crafted', from: 'Windmill: 2 wheat each', tint: '#fff4dc' },
  bread:  { name: 'Bread',  grp: 'crafted', from: 'Bakery: 2 flour each', tint: '#ffe6bd' },
  soup:   { name: 'Soup',   grp: 'crafted', from: 'Kitchen: 2 wheat. Feeds hungry villagers', tint: '#ffd9e2' },
  scrolls:{ name: 'Scrolls',grp: 'crafted', from: 'Study: plank + clay. Used for research', tint: '#fff3cf' },
  egg:    { name: 'Eggs',   grp: 'farm',    from: 'Chickens in the Coop', tint: '#fff6e0' },
  milk:   { name: 'Milk',   grp: 'farm',    from: 'Cows in the Barn', tint: '#e6f4ff' },
  wool:   { name: 'Wool',   grp: 'farm',    from: 'Sheep in the Barn', tint: '#ffe0ec' },
  apple:  { name: 'Apples', grp: 'farm',    from: 'Orchard harvest', tint: '#ffdcdc' },
  fish:   { name: 'Fish',   grp: 'farm',    from: 'Fishing Dock', tint: '#d8f0ff' },
  cheese: { name: 'Cheese', grp: 'treats',  from: 'Dairy: 2 milk each', tint: '#fff0b0' },
  jam:    { name: 'Jam',    grp: 'treats',  from: 'Pantry: 3 apples each', tint: '#ffd9e8' },
  cloth:  { name: 'Cloth',  grp: 'treats',  from: 'Weavery: 2 wool each', tint: '#e6dcff' },
  pie:    { name: 'Pie',    grp: 'treats',  from: 'Pantry: apples, flour, egg', tint: '#ffe6bd' },
};
export const GROUPS = [['raw', 'Gathered'], ['crafted', 'Workshop'], ['farm', 'Farm and sea'], ['treats', 'Treats']];
export const goodName = (g) => (g === 'coins' ? 'Coins' : GOOD[g] ? GOOD[g].name : g);
export const sellOf = (g) => SELL[g] || 0;
export { GOODS, SELL, BUILDINGS };

/** building category for the build menu */
export const CATS = [
  { id: 'homes', label: 'Homes', icon: 'house', ids: ['house'] },
  { id: 'food', label: 'Food', icon: 'pot', ids: ['kitchen', 'mill', 'bakery', 'dairy', 'pantry'] },
  { id: 'crafts', label: 'Crafts', icon: 'saw', ids: ['sawmill', 'kiln', 'storehouse', 'study', 'market', 'weavery'] },
  { id: 'farm', label: 'Farm', icon: 'paw', ids: ['farm', 'orchard', 'coop', 'barn', 'dock'] },
  { id: 'decor', label: 'Decor', icon: 'flower', ids: Object.keys(BUILDINGS).filter((k) => BUILDINGS[k].decor) },
];
export const catOf = (id) => { const c = CATS.find((c) => c.ids.includes(id)); return c ? c.id : 'crafts'; };

/** send a command to the sim or server; screens call this instead of touching the link */
export const cmd = (c) => (S.link ? S.link.cmd(c) : { ok: false, err: 'offline' });
/** remember where on screen the next coin payout comes from (a button or a world point) so coins fly from there */
export const coinFrom = (p) => { S.coinSrc = p && p.getBoundingClientRect ? (() => { const r = p.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, t: performance.now() }; })() : p ? { ...p, t: performance.now() } : null; };
