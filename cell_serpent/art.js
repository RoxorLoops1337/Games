// Image loader. Only the player art is a PNG: the RoxorLoops and Jasmin figures, baked
// from the Hocus Vocus chibi kit (assets/duo_idle.png, assets/duo_sing.png). Everything
// else (snake, minions, pickups, shots, background) is drawn in code by art_draw.js.
export const ART_KEYS = ['duo_idle', 'duo_sing'];

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
