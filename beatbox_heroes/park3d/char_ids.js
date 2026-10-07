// CHARACTER IDS: the cosmetic ids the renderer knows. normLook() maps anything else to 'none' (or the group default) so a stale save or a typo can never break a character.
// tests/beatbox_heroes_look3d.test.mjs checks this list against CATALOG.GROUPS, so a new catalog item cannot be forgotten.
const L = (s) => s.split(' ');
export const KNOWN = {
  hair: L('bald buzz crop sidepart quiff undercut waves curly afro bob long ponytail pigtails buns topknot braids locs mohawk mullet fade spiky flame cornrows hightop twists dreadbun fadewave'),
  hat: L('none cap capback beanie bandana headband snapback bucket beret fedora cowboy catears tophat crown halo visor chef wizard pirate headphonehat durag fitted trucker hood bucketfur flatcap ivy'),
  glasses: L('none round nerd shades aviator wayfarer sport heart star pixel monocle goggles vr neonbar eyepatch chromeshield oversized gold_round visor_shield'),
  facial: L('none stubble mustache goatee beard longbeard'),
  eyes: L('round sharp sleepy wide lashes cat happy star'),
  brows: L('soft straight arched thick thin none'),
  marks: L('freckles blush beauty scar bandaid starpaint tear warpaint goldgrill eyebrowslit'),
  body: L('boy girl neutral'),
  acc: {
    neck: L('none_neck chain scarf bowtie hpneck lanyard medal cubanchain dogtags'),
    ears: L('none_ears studs hoops hpears dangles iced'),
    back: L('none_back backpack cape wings guitar crossbody'),
    hand: L('none_hand mic goldmic neonmic boombox'),
    wrist: L('none_wrist wristband watch bracelets icedwatch stackedbands'),
  },
};
const sets = {}; const has = (k, id) => (sets[k] || (sets[k] = new Set(k.indexOf('.') > 0 ? KNOWN.acc[k.split('.')[1]] : KNOWN[k]))).has(id);
export const known = has;
