// Colour-blind safe palettes for the snake species (agent 18). Species are recoloured in place, so every
// reader of SPECIES (sprites, backgrounds, hub cards) follows. Colours differ in brightness as well as hue.
const CB = {
  love: { base: '#e58ab8', sh: '#a24d7e', lite: '#f8cfe3' },
  rust: { base: '#d55e00', sh: '#8a3c00', lite: '#f4b88a' },
  sneezy: { base: '#9cecca', sh: '#3fae8a', lite: '#dcfbef' },
  grumpy: { base: '#56b4e9', sh: '#1f79b0', lite: '#cfeaff' },
  sour: { base: '#1b5a31', sh: '#0c3519', lite: '#8fd1a0' },
  disco: { base: '#00a6a6', sh: '#006b78', lite: '#8ff0ee' },
};
const orig = new WeakMap();
// returns true when something changed (baked sprites are dropped)
export function applyCbPalette(kit, on) {
  if (!kit || !kit.SPECIES) return false;
  const want = on ? 1 : 0; if ((kit.__cb || 0) === want) return false; kit.__cb = want;
  for (const id of Object.keys(CB)) {
    const sp = kit.SPECIES[id]; if (!sp) continue;
    if (!orig.has(sp)) orig.set(sp, { base: sp.base, sh: sp.sh, lite: sp.lite });
    Object.assign(sp, on ? CB[id] : orig.get(sp));
  }
  if (kit.cache && kit.cache.clear) kit.cache.clear();
  return true;
}
export const CB_IDS = Object.keys(CB);

// ---- settings preview strip: every species colour in the default and the safer palette, plus how a red-green
// colour-blind player sees each (deuteranopia matrix), so the choice can be judged before switching it on
const DEUT = [[0.367, 0.861, -0.228], [0.280, 0.673, 0.047], [-0.012, 0.043, 0.969]];
export function simDeut(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const o = DEUT.map(r => Math.max(0, Math.min(255, Math.round(r[0] * c[0] + r[1] * c[1] + r[2] * c[2]))));
  return '#' + o.map(v => v.toString(16).padStart(2, '0')).join('');
}
export function cbPreview(kit) {
  const S = (kit && kit.SPECIES) || {};
  return CB_IDS.map(id => {
    const sp = S[id], o = sp && orig.get(sp), normal = (o || sp || {}).base || '#888888', safe = CB[id].base;
    return { id, name: (sp && sp.name) || id, normal, safe, normalSim: simDeut(normal), safeSim: simDeut(safe) };
  });
}
export function paintCbStrip(el, kit, on) {
  if (!el || typeof document === 'undefined') return;
  const rows = [['Default', 'normal'], ['Red-green view', 'normalSim'], ['Safer, red-green view', 'safeSim']], pv = cbPreview(kit);
  el.innerHTML = '';
  rows.forEach(([lab, key], ri) => {
    const r = document.createElement('div'); r.className = 'cbrow' + ((on ? ri === 2 : ri === 0) ? ' now' : '');
    const l = document.createElement('span'); l.className = 'cbl'; l.textContent = lab; r.appendChild(l);
    for (const p of pv) { const d = document.createElement('i'); d.style.background = p[key]; d.title = p.name; r.appendChild(d); }
    el.appendChild(r);
  });
  const names = pv.map(p => p.name).join(', ');
  el.setAttribute('role', 'img'); el.setAttribute('aria-label', 'Colour preview of the six snake species. Default colours, the same as seen with red-green colour blindness, and the safer palette as seen the same way. ' + (on ? 'Safer palette is on. ' : 'Safer palette is off. ') + names + '.');
}
