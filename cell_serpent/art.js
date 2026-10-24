// Sprite loader. Every sprite is an optional PNG in assets/. If one is missing the
// renderer draws a plain procedural stand-in, so swapping art never breaks the game.
// Conventions (also in assets/README.md): snake head and body sprites face RIGHT
// (toward the snake's head); everything else is drawn upright.
export const ART_KEYS = [
  'duo_idle', 'duo_sing',
  'snake_pink_head', 'snake_pink_body', 'snake_pinkelite_head', 'snake_pinkelite_body',
  'snake_purple_head', 'snake_purple_body', 'snake_purpleboss_head', 'snake_purpleboss_body',
  'min_green', 'min_red', 'min_yellow', 'min_jelly', 'min_eye', 'min_robot', 'min_mush',
  'min_golem', 'min_mine', 'min_plant',
  'mon_slime', 'mon_virus', 'mon_mushroom', 'mon_bat', 'mon_eyeball', 'mon_ninja', 'mon_skeleton',
  'mon_plant', 'mon_robot', 'mon_ghost',
  'icon_coin', 'icon_crystal', 'icon_heal', 'icon_shield', 'icon_heartsword',
  'bullet', 'bullet_crit', 'bg',
];

export function loadArt(base = 'assets/', ImageCtor = (typeof Image !== 'undefined' ? Image : null)) {
  const imgs = {};
  const art = { get: k => imgs[k] || null, has: k => !!imgs[k], count: () => Object.keys(imgs).length };
  if (!ImageCtor) return Promise.resolve(art);
  return Promise.all(ART_KEYS.map(k => new Promise(res => {
    const im = new ImageCtor();
    im.onload = () => { imgs[k] = im; res(); };
    im.onerror = () => res();
    im.src = base + k + '.png';
  }))).then(() => art);
}
