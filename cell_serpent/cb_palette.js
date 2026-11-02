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
