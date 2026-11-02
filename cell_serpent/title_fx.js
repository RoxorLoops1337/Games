// Title screen extras: cute animals peeking in from the screen edges, and the sparkly best/streak line.
// Pets are drawn by art_draw (kit.SPR.pet) and turned into <img> once.
const SPOTS = [   // [pet, edge style, hidden offset, rotation, delay]
  ['kitten', 'left:-6px;top:22%', '-90%,0', '90deg', '0s'],
  ['puppy', 'right:-6px;top:34%', '90%,0', '-90deg', '-2.4s'],
  ['piglet', 'left:8%;bottom:-6px', '0,90%', '0deg', '-4.6s'],
  ['lamb', 'right:10%;bottom:-6px', '0,90%', '0deg', '-1.2s'],
  ['hamster', 'left:-6px;bottom:26%', '-90%,0', '90deg', '-5.8s'],
  ['turtle', 'right:-6px;top:12%', '90%,0', '-90deg', '-3.5s'],
];
export function setupPeeks(host, kit) {
  if (!host || !kit || host.childNodes.length) return;
  for (const [pet, pos, hide, rot, delay] of SPOTS) {
    const spr = kit.SPR.pet(pet); if (!spr || !spr.c || !spr.c.toDataURL) continue;
    const im = document.createElement('img'); im.alt = ''; im.src = spr.c.toDataURL();
    const [hx, hy] = hide.split(',');
    im.style.cssText = `${pos};--hx:${hx};--hy:${hy};--r:${rot};--d:${delay}`;
    host.appendChild(im);
  }
}
export function titleInfoHTML(save, stars) {
  if (!save.runs) return '';
  const n = save.streak.n;
  return `<b>\u{1F3C6} Best stage ${save.best || 0}</b><b style="--d:.5s">★ ${stars}</b>` + (n > 0 ? `<b class="hot" style="--d:1s">\u{1F525} ${n} day${n === 1 ? '' : 's'}</b>` : '');
}
