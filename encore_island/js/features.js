'use strict';
// Encore Island — feature framework. Every "late game" feature is a self-contained module (js/f_*.js) that plugs in here:
//   regFeature({ id, keep, init(st), tick(dt), drawWorld(), drawHud(), on:{kill,boss,sell,...}, pips(), onLoad(), onTour() })
//   regTab(sheetId, tabId, label, draw(cw, sh) -> content height)      add a tab to an existing menu sheet
//   regMod(key, fn) / mod(key) / modAdd(key)                            stat modifiers read by the core formulas
// Persistent state lives in S.feat[id] (saved automatically; kept across Encore Tours when `keep` is true).
const FEATS = [], TABS = {}, MODS = {}, DOORS = [];
function regFeature(f) { FEATS.push(f); return f; }
// a doorway in the Backstage greenroom: { id, name, icon, hint, unlocked(): bool, enter() } . The room draws every registered door
// (built-in placeholders fill the empty frames); a door whose unlocked() is true opens when the hero stands in it for a moment.
function regDoor(d) { const i = DOORS.findIndex(o => o.id === d.id); if (i >= 0) DOORS[i] = d; else DOORS.push(d); return d; }
function regTab(sheet, id, label, draw, opts) { (TABS[sheet] || (TABS[sheet] = [])).push(Object.assign({ id, label, draw }, opts || {})); }
function regMod(key, fn) { (MODS[key] || (MODS[key] = [])).push(fn); }
function mod(key) { const a = MODS[key]; if (!a) return 1; let m = 1; for (let i = 0; i < a.length; i++) m *= a[i](); return m; }
function modAdd(key) { const a = MODS[key]; if (!a) return 0; let s = 0; for (let i = 0; i < a.length; i++) s += a[i](); return s; }
function fs(id) { return S.feat[id] || (S.feat[id] = {}); } // persistent state of one feature
function fEmit(name, a, b) { for (let i = 0; i < FEATS.length; i++) { const h = FEATS[i].on && FEATS[i].on[name]; if (h) h(a, b); } }
function toast(txt, ic, life) { S.toasts.push({ txt, t: 0, ic: ic || 'star', life }); }
function tickFeatures(dt) { for (let i = 0; i < FEATS.length; i++) if (FEATS[i].tick) FEATS[i].tick(dt); }
function drawFeaturesWorld() { for (let i = 0; i < FEATS.length; i++) if (FEATS[i].drawWorld) FEATS[i].drawWorld(); }
function drawFeaturesHud() { for (let i = 0; i < FEATS.length; i++) if (FEATS[i].drawHud) FEATS[i].drawHud(); }
function featPips() { const o = {}; for (let i = 0; i < FEATS.length; i++) if (FEATS[i].pips) { const p = FEATS[i].pips(); if (p) for (const k in p) if (p[k]) o[k] = true; } return o; }
function featsInit() { S.feat = S.feat || {}; for (const f of FEATS) { if (!S.feat[f.id]) S.feat[f.id] = {}; if (f.init) f.init(S.feat[f.id]); } }
function featsLoaded() { for (const f of FEATS) { if (!S.feat[f.id]) S.feat[f.id] = {}; if (f.init) f.init(S.feat[f.id]); if (f.onLoad) f.onLoad(S.feat[f.id]); } }
function featsKeep() { const k = {}; for (const f of FEATS) if (f.keep && S.feat[f.id]) k[f.id] = S.feat[f.id]; return k; }
function featsAfterTour(kept) { S.feat = kept || {}; featsInit(); for (const f of FEATS) if (f.onTour) f.onTour(S.feat[f.id]); }
// all tabs of a sheet: the base ones plus every registered extension (a tab-less sheet gets a "Main" tab so the base content stays reachable)
function sheetTabs(id) {
  const base = SHEETS[id].tabs, ext = (TABS[id] || []).filter(t => !t.show || t.show());
  if (!ext.length) return base;
  return (base || [['main', 'Main']]).concat(ext.map(t => [t.id, t.label]));
}
function extTab(sheetId, tabId) { return (TABS[sheetId] || []).find(t => t.id === tabId); }
