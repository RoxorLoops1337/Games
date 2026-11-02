// 02-animal-art (round 7): a baked "arms up" frame of the duo for the kill-streak cheer.
// The idle picture has R pointing and J waving outwards. We copy it, rub those two arms out (they are plain
// skin against empty space) and paint two raised fists in the same ink and skin colours. Built once, lazily.
const INK = '#3a1d1d', SKIN = '#fdd4b7', SKIN_SH = '#f2b999', HAIR = '#5a2f1b';
let cache = null, cacheFor = null;

function arm(g, pts, w) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  const path = () => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); };
  g.strokeStyle = INK; g.lineWidth = w + 9; path(); g.stroke();
  g.strokeStyle = SKIN; g.lineWidth = w; path(); g.stroke();
  g.strokeStyle = SKIN_SH; g.lineWidth = 3; g.globalAlpha = 0.7; g.beginPath(); g.moveTo(pts[1][0] + 7, pts[1][1] + 6); g.lineTo(pts[2][0] + 6, pts[2][1] + 6); g.stroke(); g.globalAlpha = 1;
}
function fist(g, x, y, s, tilt) {
  g.save(); g.translate(x, y); g.rotate(tilt); g.scale(s, s);
  g.lineJoin = 'round';
  g.fillStyle = SKIN; g.strokeStyle = INK; g.lineWidth = 5;
  g.beginPath(); g.ellipse(0, 0, 20, 18, 0, 0, Math.PI * 2); g.fill(); g.stroke();   // the fist
  g.beginPath(); g.ellipse(-16, 8, 7.5, 10, 0.5, 0, Math.PI * 2); g.fill(); g.stroke();   // thumb
  g.strokeStyle = SKIN_SH; g.lineWidth = 2.6; g.lineCap = 'round';
  for (const dx of [-6, 3, 11]) { g.beginPath(); g.moveTo(dx, -14); g.lineTo(dx, -3); g.stroke(); }   // finger lines
  g.restore();
}

// im: the duo_idle image. Returns a canvas of the same size, or null when there is no DOM (headless tests)
export function cheerFrame(im) {
  if (!im || typeof document === 'undefined') return null;
  if (cache && cacheFor === im) return cache;
  const W = im.width, H = im.height;
  if (W < 500 || H < 440) return null;   // not the shipped picture: leave it alone
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); if (!g) return null;
  g.drawImage(im, 0, 0);
  // 1) rub out the two lowered arms
  g.save(); g.globalCompositeOperation = 'destination-out';
  g.beginPath(); for (const [x, y] of [[0, 222], [40, 222], [50, 234], [64, 246], [67.5, 251], [84, 286], [80, 290], [0, 290]]) g.lineTo(x, y); g.closePath(); g.fill();
  g.beginPath(); for (const [x, y] of [[418, 262], [440, 258], [462, 262], [490, 262], [495, 272], [488, 305], [455, 318], [426, 322], [412, 312]]) g.lineTo(x, y); g.closePath(); g.fill();
  g.restore();
  // J's waving hand sat in front of the ponytail tip: paint the hole it leaves with hair
  g.save(); g.globalCompositeOperation = 'destination-over'; g.fillStyle = HAIR; g.strokeStyle = INK; g.lineWidth = 4; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(450, 238); g.lineTo(494, 246); g.quadraticCurveTo(508, 272, 507, 288); g.quadraticCurveTo(504, 304, 497, 309); g.quadraticCurveTo(488, 296, 470, 298); g.lineTo(446, 296); g.closePath(); g.fill(); g.stroke();
  g.restore();
  // 2) two raised arms, shoulders on the sleeves, fists above head height
  arm(g, [[80, 268], [38, 236], [30, 162], [30, 128]], 22); fist(g, 29, 112, 1.05, -0.12);
  arm(g, [[418, 288], [470, 268], [492, 196], [490, 160]], 20); fist(g, 490, 142, 1.0, 0.12);
  cache = c; cacheFor = im; return c;
}
