// doodle_heroes.js: the DOODLE version of RoxorLoops, Jasmin, Loopy and the logo: a child's crayon portrait of the duo on notebook paper.
// Same API as art_heroes.js: drawHero (feet centre), drawBust (centre of the bust box), drawLoopy (centre), drawLogo (centre), setArtScale.
// Every pose is baked once into 3 "boil" frames (doodle_kit style) and replayed, so a hero costs a drawImage per frame. Bobbing, jumping, squash and
// sway are applied on top. Pose variants (arms up or down, mouth open or shut, blink) are separate baked sprites, chosen from the time `t`.
import { Pen, C, clamp, arc, rect, star, heart, makeCanvas, getScale, setScale, BOIL_FPS } from './doodle_kit.js';

const TAU = Math.PI * 2;
const INK = C.ink;
export function setArtScale(n) { setScale(n); cache.clear(); }
export { makeCanvas };

// ------------------------------------------------------------------------------------------------ baking (own small LRU)
const cache = new Map();
const MAX_SPRITES = 70;
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; }
// draw(pen, ctx) paints in a w x h box centred on (0, 0)
function bake(key, w, h, draw) {
  const sc = getScale(), k = key + '|' + sc;
  let e = cache.get(k);
  if (e) { cache.delete(k); cache.set(k, e); return e; }
  e = { w, h, key, draw, frames: [], direct: false };
  for (let f = 0; f < 3; f++) {
    const cv = makeCanvas(w * sc, h * sc), c = cv && cv.getContext && cv.getContext('2d');
    if (!c) { e.direct = true; e.frames.length = 0; break; }
    c.scale(sc, sc); c.translate(w / 2, h / 2);
    draw(new Pen(c, hashStr(key) + f * 977, 1), c);
    e.frames.push(cv);
  }
  cache.set(k, e);
  if (cache.size > MAX_SPRITES) cache.delete(cache.keys().next().value);
  return e;
}
function put(ctx, e, x, y, t, phase = 0, s = 1) {
  if (e.direct) { ctx.save(); ctx.translate(x, y); if (s !== 1) ctx.scale(s, s); e.draw(new Pen(ctx, hashStr(e.key), 1), ctx); ctx.restore(); return; }
  const f = Math.abs(Math.floor((t + phase) * BOIL_FPS)) % e.frames.length;
  ctx.drawImage(e.frames[f], x - e.w * s / 2, y - e.h * s / 2, e.w * s, e.h * s);
}
const eyeBlink = (t, seed) => { const c = (t + seed * 1.7) % 3.6; return c > 3.46; };

// ------------------------------------------------------------------------------------------------ poses
// hands in figure space (feet at 0,0, head centre about (0,-80)). h: [left, right] hands, alt: second variant. mic: angle. eye, mouth: closed | open | alt (toggles) | o | sad
const POSE = {
  idle:  { sp: 2.2, bob: 1.6, hands: [[-25, -30], [26, -32]], mic: -0.5, eye: 'open', mouth: 'closed' },
  cheer: { sp: 5, bob: 2.4, jump: 5, hands: [[-36, -104], [37, -106]], alt: [[-32, -94], [33, -97]], mic: -0.15, eye: 'happy', mouth: 'open' },
  sing:  { sp: 2.4, bob: 1.4, hands: [[-28, -42], [11, -70]], alt: [[-31, -46], [10, -72]], mic: -2.0, eye: 'happy', mouth: 'alt', micMouth: true, tilt: -0.05 },
  beat:  { sp: 8, bob: 3, hands: [[-26, -62], [11, -70]], alt: [[-24, -50], [11, -70]], mic: -2.0, eye: 'happy', mouth: 'alt', micMouth: true, foot: true },
  sad:   { sp: 1.2, bob: 0.8, hands: [[-15, -22], [15, -22]], mic: 1.5, eye: 'sad', mouth: 'sad', tilt: 0.09, slump: 5 },
  shock: { sp: 14, bob: 1.2, jump: 2.5, hands: [[-44, -74], [44, -74]], mic: -0.4, eye: 'wide', mouth: 'o', tilt: -0.03 },
  talk:  { sp: 2.4, bob: 1.4, hands: [[-23, -30], [38, -62]], alt: [[-23, -30], [41, -74]], mic: -0.7, eye: 'open', mouth: 'alt', talkOnly: true, tilt: 0.03 },
  point: { sp: 2.4, bob: 1.6, hands: [[-23, -30], [55, -68]], mic: 0.3, eye: 'open', mouth: 'closed', point: true, tilt: -0.04 },
  hype:  { sp: 6, bob: 2.6, jump: 4, hands: [[-31, -98], [31, -98]], alt: [[-28, -84], [28, -84]], mic: -0.3, eye: 'happy', mouth: 'open' },
};

// ------------------------------------------------------------------------------------------------ the figures
const SKIN = { roxor: '#f1b98a', jasmin: '#f8cfa8' };
function limb(pen, x0, y0, x1, y1, col, w, bend = 0) {
  const mx = (x0 + x1) / 2 + bend, my = (y0 + y1) / 2 + Math.abs(bend) * 0.4;
  const p = [x0, y0, mx, my, x1, y1];
  pen.ln(p, INK, w + 5, false, 0.7); pen.ln(p, col, w, false, 0.5);
}
function hand(pen, x, y, skin, r = 6.2) { pen.dot(x, y, r + 1.6, INK); pen.dot(x, y, r, skin); }
function mic(pen, hx, hy, ang, band) {
  const ex = hx + Math.cos(ang) * 17, ey = hy + Math.sin(ang) * 17;
  pen.ln([hx, hy, ex, ey], INK, 11, false, 0.4); pen.ln([hx, hy, ex, ey], '#5b5669', 6, false, 0.4);
  const bx = hx + Math.cos(ang) * 11, by = hy + Math.sin(ang) * 11;
  pen.ln([hx + Math.cos(ang) * 6, hy + Math.sin(ang) * 6, bx, by], band, 7.5, false, 0.3);
  const hx2 = ex + Math.cos(ang) * 7, hy2 = ey + Math.sin(ang) * 7;
  pen.shp(pen.blob(hx2, hy2, 8, 8, 10, 0.05), '#b9b6c7', INK, 2.8, { gap: 3.2, alpha: 0.9 });
  pen.ln([hx2 - 3, hy2 - 3, hx2 + 3, hy2 + 3], '#fff', 1.8, false, 0.2);
}
function eyeBall(pen, x, y, r, iris, look, lash) {
  pen.dot(x, y, r + 1.4, INK); pen.dot(x, y, r, '#fff');
  pen.dot(x + Math.cos(look) * r * 0.28, y + Math.sin(look) * r * 0.28, r * 0.64, iris);
  pen.dot(x + Math.cos(look) * r * 0.34, y + Math.sin(look) * r * 0.34, r * 0.34, INK);
  pen.dot(x + r * 0.14, y - r * 0.28, r * 0.16, '#fff');
  if (lash) { pen.ln([x - r * 0.9, y - r * 0.5, x - r * 1.4, y - r * 0.95], INK, 2, false, 0.2); pen.ln([x + r * 0.9, y - r * 0.5, x + r * 1.4, y - r * 0.95], INK, 2, false, 0.2); }
}
function eyes(pen, who, st, hx, hy, spread, r) {
  const iris = who === 'roxor' ? '#8fa6c8' : '#6b4a3a', lash = who === 'jasmin';
  for (const sx of [-1, 1]) {
    const x = hx + sx * spread, y = hy;
    if (st.blink) { pen.ln([x - r, y + 1, x, y + 3, x + r, y + 1], INK, 3, false, 0.3); continue; }
    if (st.eye === 'happy') { pen.ln(arc(x, y + 3, r, r * 0.9, 200, 340), INK, 3.4, false, 0.4); if (lash) pen.ln([x + sx * r, y - 1, x + sx * (r + 5), y - 5], INK, 2, false, 0.2); continue; }
    if (st.eye === 'wide') { eyeBall(pen, x, y, r * 1.3, iris, -1.57, lash); pen.dot(x, y, r * 0.3, INK); continue; }
    eyeBall(pen, x, y, r, iris, st.look, lash);
    if (st.eye === 'sad') { pen.ln([x - sx * r * 1.2, y - r * 1.5 - 1, x + sx * r * 1.1, y - r * 1.1 + 4], INK, 3, false, 0.3); pen.shp(pen.blob(x + sx * r * 0.7, y + r * 1.9, 2.2, 3.4, 8, 0.06), C.cyan, INK, 1.6, { gap: 2 }); }
  }
}
function mouth(pen, who, st, cx, cy) {
  const m = st.mouth;
  if (m === 'open') {
    const p = [cx - 8, cy - 4, cx + 8, cy - 4, cx + 6, cy + 5, cx, cy + 9, cx - 6, cy + 5];
    pen.shp(p, '#b0303c', INK, 2.8, { gap: 3, alpha: 0.95 });
    pen.ln([cx - 6, cy - 3, cx + 6, cy - 3], '#fff', 3.2, false, 0.3);
    pen.dot(cx, cy + 5.5, 3.2, '#ff8fa8');
  } else if (m === 'o') { pen.dot(cx, cy + 2, 6.5, INK); pen.dot(cx, cy + 3, 3.6, '#b0303c'); }
  else if (m === 'sad') pen.ln(arc(cx, cy + 9, 8, 6, 210, 330), INK, 3.2, false, 0.3);
  else if (who === 'roxor') {   // cheeky smirk with a flash of teeth
    pen.ln([cx - 8, cy, cx - 2, cy + 4, cx + 7, cy + 2, cx + 10, cy - 3], INK, 3.2, false, 0.4);
    pen.ln([cx - 3, cy + 3, cx + 5, cy + 2], '#fff', 2.6, false, 0.2);
  } else pen.ln(arc(cx, cy - 1, 9, 6, 20, 160), INK, 3.2, false, 0.4);
}

function headRoxor(pen, st, onesie) {
  const hx = 0, hy = -80;
  if (onesie) {   // monster hood: green fur with cream horns
    pen.shp(pen.spiky(35, 34, 11, 0.1, hx, hy + 1), C.green, INK, 3.4, { gap: 5, f2: C.lime });
    for (const sx of [-1, 1]) pen.shp([hx + sx * 15, hy - 28, hx + sx * 22, hy - 52, hx + sx * 30, hy - 26], '#f6e7c4', INK, 3, { gap: 4, f2: '#e1c889' });
  } else {   // mullet tail behind, shaved side
    pen.shp([hx - 20, hy + 4, hx - 38, hy + 12, hx - 32, hy + 28, hx - 18, hy + 18], '#8a4a24', INK, 3, { gap: 4 });
  }
  pen.shp(pen.blob(hx, hy, 27, 26, 16, 0.03), SKIN.roxor, INK, 3.6, { gap: 5.5, alpha: 0.78, ang: -0.9 });
  pen.dot(hx - 27, hy + 1, 6, INK); pen.dot(hx - 27, hy + 1, 4.4, SKIN.roxor);   // ear
  if (!onesie) {
    // swooping mohawk crest pushed up and forward
    const crest = [hx - 22, hy - 14, hx - 24, hy - 34, hx - 12, hy - 46, hx + 4, hy - 48, hx + 24, hy - 40, hx + 36, hy - 24, hx + 22, hy - 28, hx + 14, hy - 22, hx + 4, hy - 26, hx - 8, hy - 22, hx - 14, hy - 12];
    pen.shp(crest, '#8a4a24', INK, 3.4, { gap: 4.2, f2: '#b8743c', ang: -0.5 });
    pen.ln([hx - 14, hy - 38, hx + 4, hy - 42, hx + 22, hy - 34], '#d29a60', 2.2, false, 0.6);
    for (let i = 0; i < 7; i++) pen.dot(hx - 22 + pen.rnd() * 7, hy - 8 + i * 4.5 + pen.rnd() * 2, 1.1, '#6a5a52');   // stubble on the shaved side
  } else pen.ln([hx - 16, hy - 20, hx - 6, hy - 26, hx + 8, hy - 24, hx + 18, hy - 19], INK, 3, false, 0.5);
  // face
  eyes(pen, 'roxor', st, hx, hy - 4, 11, 6.6);
  if (st.eye !== 'sad') { pen.ln([hx - 17, hy - 15, hx - 5, hy - 13], INK, 3.4, false, 0.3); pen.ln([hx + 4, hy - 17, hx + 17, hy - 14], INK, 3.4, false, 0.3); }
  pen.ln([hx - 1, hy + 4, hx + 3, hy + 8, hx - 1, hy + 10], INK, 2.2, false, 0.3);   // nose
  mouth(pen, 'roxor', st, hx + 1, hy + 14);
  for (let i = 0; i < 6; i++) pen.dot(hx - 14 + i * 5.6 + pen.rnd() * 2, hy + 21 + pen.rnd() * 2, 1, '#9a6a50');   // chin stubble
  pen.shp(pen.blob(hx - 17, hy + 8, 4, 2.6, 8, 0.1), '#ff9a8a', null, 0, { gap: 2.4, alpha: 0.5 });
  pen.shp(pen.blob(hx + 19, hy + 8, 4, 2.6, 8, 0.1), '#ff9a8a', null, 0, { gap: 2.4, alpha: 0.5 });
}
function headJasmin(pen, st, onesie) {
  const hx = 0, hy = -80;
  const maneCols = ['#ff5fb0', '#ff9226', '#ffd60a', '#43b94a', '#2f7de1', '#7b4fd0'];
  if (!onesie) {   // long dark hair behind and the high ponytail
    pen.shp([hx - 26, hy - 8, hx - 33, hy + 26, hx - 22, hy + 40, hx - 8, hy + 30, hx + 10, hy + 32, hx + 26, hy + 22, hx + 28, hy - 6], '#2a2236', INK, 3, { gap: 4.4, f2: '#51406a' });
    pen.shp([hx + 4, hy - 30, hx + 12, hy - 52, hx + 34, hy - 58, hx + 46, hy - 44, hx + 42, hy - 20, hx + 34, hy - 30, hx + 30, hy - 40, hx + 20, hy - 34], '#2a2236', INK, 3.2, { gap: 4.2, f2: '#51406a', ang: -0.4 });
  } else {   // unicorn hood with a rainbow mane down the back
    pen.shp(pen.blob(hx, hy + 1, 34, 33, 16, 0.04), '#f1e8ff', INK, 3.4, { gap: 5, f2: C.lav });
    for (let i = 0; i < 6; i++) pen.ln([hx + 22 + i * 1.5, hy - 24 + i * 7, hx + 40 + i * 3, hy - 14 + i * 9, hx + 36 + i * 3, hy + 4 + i * 9], maneCols[i], 4.4, false, 1);
    for (const sx of [-1, 1]) pen.shp([hx + sx * 18, hy - 26, hx + sx * 25, hy - 46, hx + sx * 31, hy - 22], '#f1e8ff', INK, 3, { gap: 4, f2: C.pink });
  }
  pen.shp(pen.blob(hx, hy, 26.5, 25.5, 16, 0.03), SKIN.jasmin, INK, 3.6, { gap: 5.5, alpha: 0.72, ang: -0.9 });
  pen.dot(hx - 26, hy + 3, 5.6, INK); pen.dot(hx - 26, hy + 3, 4, SKIN.jasmin);
  if (!onesie) {
    pen.shp([hx - 27, hy - 4, hx - 26, hy - 22, hx - 12, hy - 33, hx + 8, hy - 34, hx + 24, hy - 24, hx + 27, hy - 4, hx + 16, hy - 14, hx + 4, hy - 20, hx - 6, hy - 16, hx - 16, hy - 8], '#2a2236', INK, 3.2, { gap: 4, f2: '#51406a', ang: -0.7 });
    pen.shp(pen.blob(hx + 8, hy - 31, 8, 6, 10, 0.1), C.pink, INK, 2.8, { gap: 2.8 });   // pink scrunchie
    pen.ln([hx + 4, hy - 33, hx + 12, hy - 29], '#fff', 1.8, false, 0.3);
    pen.ln(arc(hx - 27, hy + 12, 6, 7, 180, 540), C.gold, 2.6, false, 0.3);   // hoop earring
  } else {
    pen.shp([hx - 6, hy - 28, hx + 4, hy - 62, hx + 12, hy - 28], '#ffc83a', INK, 3, { gap: 3.4 });   // golden horn
    pen.ln([hx - 3, hy - 38, hx + 9, hy - 40], INK, 2, false, 0.2); pen.ln([hx - 1, hy - 48, hx + 7, hy - 50], INK, 2, false, 0.2);
    pen.ln([hx - 20, hy - 14, hx - 6, hy - 22, hx + 8, hy - 21, hx + 20, hy - 14], INK, 2.6, false, 0.5);
  }
  eyes(pen, 'jasmin', st, hx, hy - 3, 10.5, 7.2);
  if (st.eye === 'open' || st.eye === 'wide') { pen.ln([hx - 17, hy - 15, hx - 6, hy - 14], INK, 2.4, false, 0.3); pen.ln([hx + 6, hy - 14, hx + 17, hy - 15], INK, 2.4, false, 0.3); }
  pen.ln([hx, hy + 5, hx + 2, hy + 8], INK, 2, false, 0.2);
  mouth(pen, 'jasmin', st, hx, hy + 14);
  pen.shp(pen.blob(hx - 17, hy + 9, 5, 3, 8, 0.1), '#ff7aa8', null, 0, { gap: 2.4, alpha: 0.6 });
  pen.shp(pen.blob(hx + 17, hy + 9, 5, 3, 8, 0.1), '#ff7aa8', null, 0, { gap: 2.4, alpha: 0.6 });
}

function bodyParts(pen, who, onesie, st, bust) {
  const roxor = who === 'roxor';
  const sx = [-1, 1];
  if (!bust) {
    // legs
    const legCol = onesie ? (roxor ? C.green : '#f1e8ff') : (roxor ? C.olive : '#3f6fc6');
    for (const s of sx) {
      const lift = st.foot && s > 0 ? -8 : 0, foot = lift ? [s * 14, -8] : [s * 10, -2];
      limb(pen, s * 7, -28, foot[0], foot[1] - 5, legCol, 9);
      const shoe = [foot[0] - 9 + (s > 0 ? 2 : -2), foot[1] - 5, foot[0] + 11 + (s > 0 ? 3 : -1), foot[1] - 5, foot[0] + 12 + (s > 0 ? 3 : -1), foot[1] + 4, foot[0] - 9, foot[1] + 4];
      pen.shp(shoe, onesie ? (roxor ? C.lime : C.pink) : (roxor ? C.lime : '#fff'), INK, 3, { gap: 3.6, f2: roxor ? '#e9ff9a' : C.pink });
    }
  }
  // torso
  const slump = st.slump || 0;
  const torso = [-17, -57 + slump, 17, -57 + slump, 19, -26, -19, -26];
  if (onesie) {
    pen.shp(torso, roxor ? C.green : '#f1e8ff', INK, 3.4, { gap: 4.6, f2: roxor ? C.lime : C.lav });
    pen.shp(pen.blob(0, -41, 10, 11, 10, 0.05), roxor ? '#e8f7b0' : C.pink, INK, 2.4, { gap: 3.6, alpha: 0.7 });
    if (roxor) for (let i = 0; i < 3; i++) pen.ln([-8 + i * 8, -34, -5 + i * 8, -30], INK, 2, false, 0.3);
  } else if (roxor) {
    pen.shp(torso, '#403a4c', INK, 3.4, { gap: 4.6, f2: '#6b6578' });
    pen.shp(pen.blob(0, -41, 8.5, 8.5, 12, 0.04), C.orange, INK, 2.4, { gap: 3, f2: C.yellow });   // the orange smiley
    pen.dot(-3, -43, 1.2, INK); pen.dot(3, -43, 1.2, INK); pen.ln(arc(0, -41, 4.6, 3.6, 25, 155), INK, 1.8, false, 0.2);
  } else {
    pen.shp(torso, C.pink, INK, 3.4, { gap: 4.4, f2: '#ff9ad2' });
    if (!bust || true) { pen.ln([-3, -57, 0, -50, 3, -57], INK, 1.6, false, 0.2); pen.shp(heart(0, -49, 11), '#ff2f7a', INK, 2, { gap: 2.4 }); }
    pen.ln([-8, -57, 0, -50, 8, -57], INK, 1.6, false, 0.3);
  }
  // neck
  pen.shp([-6, -60 + slump, 6, -60 + slump, 6, -54 + slump, -6, -54 + slump], SKIN[who], INK, 2.4, { gap: 3, alpha: 0.7 });
}

function armsAndMic(pen, who, onesie, st, hands) {
  const roxor = who === 'roxor';
  const sleeve = onesie ? (roxor ? C.green : '#f1e8ff') : (roxor ? '#403a4c' : C.pink);
  const armCol = onesie ? (roxor ? C.green : '#f1e8ff') : SKIN[who];
  const sh = [[-16, -54 + (st.slump || 0)], [16, -54 + (st.slump || 0)]];
  const micHand = st.micMouth || st.pose === 'sing' || st.pose === 'beat' ? 1 : (st.pose === 'point' ? 0 : 1);
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1, h = hands[i];
    limb(pen, sh[i][0], sh[i][1], h[0], h[1], armCol, 7.4, s * 5);
    if (!onesie) pen.shp(pen.blob(sh[i][0] + s * 2, sh[i][1] + 5, 7, 7, 8, 0.05), sleeve, INK, 2.6, { gap: 3.4 });
  }
  for (let i = 0; i < 2; i++) {
    const h = hands[i];
    if (i === micHand) { hand(pen, h[0], h[1], onesie ? (roxor ? C.green : '#fff') : SKIN[who]); mic(pen, h[0], h[1], st.mic, roxor ? C.lime : C.pink); }
    else if (st.point) { hand(pen, h[0], h[1], SKIN[who], 5.2); pen.ln([h[0], h[1], h[0] + 15, h[1] - 3], INK, 7.5, false, 0.3); pen.ln([h[0], h[1], h[0] + 15, h[1] - 3], SKIN[who], 4, false, 0.3); }
    else hand(pen, h[0], h[1], onesie ? (roxor ? C.green : '#fff') : SKIN[who]);
  }
}

function drawFigure(pen, ctx, who, pose, onesie, v) {
  const P = POSE[pose], hands = (v && P.alt) ? P.alt : P.hands;
  const st = { pose, eye: P.eye, mouth: v.mouth, blink: v.blink, look: who === 'roxor' ? 0.25 : 0.1, mic: P.mic, micMouth: P.micMouth, slump: P.slump || 0, foot: P.foot && v.alt, point: P.point };
  ctx.save(); ctx.translate(0, P.slump ? P.slump * 0.4 : 0);
  bodyParts(pen, who, onesie, st, false);
  armsAndMic(pen, who, onesie, st, hands.map((h) => [h[0], h[1] + (P.slump || 0) * 0.3]));
  ctx.save(); ctx.translate(0, P.slump || 0); ctx.translate(0, -80 * 0); ctx.rotate((P.tilt || 0) * 0.8);
  (who === 'roxor' ? headRoxor : headJasmin)(pen, st, onesie);
  ctx.restore(); ctx.restore();
}

// mouth state for time t
function mouthAt(P, t, talk) {
  let m = P.mouth;
  if (talk && (m === 'closed' || m === 'alt')) m = 'alt';
  if (m === 'alt') return Math.sin(t * 15) > -0.1 ? 'open' : 'closed';
  return m;
}

// ------------------------------------------------------------------------------------------------ public: hero and bust
const BOX_W = 132, BOX_H = 156, FEET = 70;   // sprite box: feet sit FEET below the box centre
export function drawHero(ctx, who, x, y, size, o) {
  o = o || {}; who = who === 'jasmin' ? 'jasmin' : 'roxor';
  const t = o.t || 0, pose = POSE[o.pose] ? o.pose : 'idle', P = POSE[pose], onesie = o.outfit === 'onesie', k = size / 118;
  const ph = t * P.sp, bob = Math.sin(ph) * P.bob, jump = P.jump ? Math.abs(Math.sin(ph * 0.9)) * P.jump * 1.4 : 0;
  const alt = P.alt || P.foot ? (Math.floor(t * P.sp * 0.55 + (who === 'jasmin' ? 0.5 : 0)) % 2 === 1 ? 1 : 0) : 0;
  const mouthSt = mouthAt(P, t, !!o.talk), blink = eyeBlink(t, who === 'jasmin' ? 2 : 0);
  const key = ['hero', who, pose, onesie ? 'o' : 'd', alt, mouthSt, blink ? 1 : 0].join('|');
  const e = bake(key, BOX_W, BOX_H, (pen, c) => { c.translate(0, FEET); drawFigure(pen, c, who, pose, onesie, { alt, mouth: mouthSt, blink }); });
  ctx.save(); ctx.translate(x, y); if (o.flip) ctx.scale(-1, 1); ctx.scale(k, k);
  ctx.fillStyle = 'rgba(43,39,51,0.17)'; ctx.beginPath(); ctx.ellipse(0, 2, 26 - jump * 0.6, 5.5, 0, 0, TAU); ctx.fill();
  const sq = 1 + Math.sin(ph * 2) * 0.012 * P.bob - (jump > 0 ? jump * 0.004 : 0);
  ctx.translate(Math.sin(ph * 0.5) * (P.tilt ? 1.2 : 0.4), -jump - Math.max(0, bob) * 0.6);
  ctx.rotate((P.tilt || 0) * 0.35 + Math.sin(ph * 0.5) * 0.014 + Math.sin(t * 1.3) * 0.01);
  ctx.scale(1 / Math.sqrt(sq), sq);
  put(ctx, e, 0, -FEET, t, who === 'jasmin' ? 0.17 : 0);
  ctx.restore();
}

// head and shoulders portrait; (x, y) = centre of the bust box, size = box height
export function drawBust(ctx, who, x, y, size, o) {
  o = o || {}; who = who === 'jasmin' ? 'jasmin' : 'roxor';
  const t = o.t || 0, pose = POSE[o.pose] ? o.pose : 'idle', P = POSE[pose], onesie = o.outfit === 'onesie', k = size / 100;
  const mouthSt = mouthAt(P, t, !!o.talk), blink = eyeBlink(t, who === 'jasmin' ? 2 : 0);
  const key = ['bust', who, pose, onesie ? 'o' : 'd', mouthSt, blink ? 1 : 0].join('|');
  const e = bake(key, 112, 100, (pen, c) => {
    c.save(); c.beginPath(); c.rect(-56, -50, 112, 100); c.clip();
    c.translate(0, 66);
    const st = { pose, eye: P.eye, mouth: mouthSt, blink, look: who === 'roxor' ? 0.25 : 0.1, mic: P.mic, slump: P.slump || 0 };
    bodyParts(pen, who, onesie, st, true);
    c.save(); c.translate(0, P.slump || 0); c.rotate((P.tilt || 0) * 0.8); (who === 'roxor' ? headRoxor : headJasmin)(pen, st, onesie); c.restore();
    c.restore();
  });
  const bob = Math.sin(t * P.sp) * P.bob * 0.35;
  ctx.save(); ctx.translate(x, y + bob * k); if (o.flip) ctx.scale(-1, 1); ctx.scale(k, k);
  put(ctx, e, 0, 0, t, who === 'jasmin' ? 0.17 : 0);
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ Loopy
const MOOD = { happy: '#19d3ff', excited: '#9dff3a', worried: '#ffb02e', sleepy: '#8aa0ff' };
function loopyBody(pen, mood, eyesOpen, mouthOpen) {
  const glow = MOOD[mood];
  pen.shp(rect(-42, -32, 84, 70, 14), C.purple, INK, 3.6, { gap: 5.2, f2: '#a58cf0', ang: -0.6 });
  pen.ln([-34, -26, -18, -29], '#fff', 2.4, false, 0.4);   // highlight scribble
  for (let i = 0; i < 3; i++) { const kx = -22 + i * 22; pen.dot(kx, -24, 7.6, INK); pen.dot(kx, -24, 6, '#d6d3e4'); pen.ln([kx, -24, kx + (i - 1) * 4, -29], INK, 2.2, false, 0.2); }
  // screen with a pixel-doodle face
  pen.shp(rect(-30, -13, 60, 33, 6), '#16142a', INK, 3, { gap: 3, alpha: 0.95 });
  const ex = [-12, 12], ey = 0;
  for (const x of ex) {
    if (mood === 'sleepy') pen.ln([x - 6, ey + 1, x + 6, ey + 1], glow, 3.4, false, 0.3);
    else if (!eyesOpen) pen.ln(arc(x, ey + 2, 6, 5, 200, 340), glow, 3.4, false, 0.3);
    else if (mood === 'excited') { pen.shp(star(x, ey, 7.5, 0.5), glow, null, 0, { gap: 2.4 }); }
    else { pen.dot(x, ey, mood === 'worried' ? 5.2 : 4.6, glow); pen.dot(x + 1, ey - 1, 1.5, '#fff'); }
  }
  if (mood === 'worried') { pen.ln([-19, -9, -6, -7], glow, 2.4, false, 0.3); pen.ln([6, -7, 19, -9], glow, 2.4, false, 0.3); }
  if (mouthOpen) pen.shp(pen.blob(0, 12, 5, 4, 8, 0.05), glow, null, 0, { gap: 2.6 });
  else if (mood === 'worried') pen.ln(arc(0, 16, 7, 4, 200, 340), glow, 2.6, false, 0.3);
  else if (mood === 'sleepy') pen.dot(0, 12, 2.2, glow);
  else pen.ln(arc(0, 8, 8, 5, 20, 160), glow, 2.8, false, 0.3);
  // two foot-switch feet
  for (const sx of [-1, 1]) { pen.shp(pen.blob(sx * 18, 33, 11, 6, 10, 0.06), '#c9c6d8', INK, 3, { gap: 3.4, f2: '#fff' }); pen.dot(sx * 18, 33, 4, '#8f8ba6'); }
}
export function drawLoopy(ctx, x, y, size, o) {
  o = o || {}; const t = o.t || 0, mood = MOOD[o.mood] ? o.mood : 'happy', k = size / 100;
  const hopPh = Math.abs(Math.sin(t * 7)), hop = mood === 'excited' ? hopPh * 8 : mood === 'sleepy' ? 0 : Math.sin(t * 2.4) * 1.6;
  const squash = mood === 'excited' ? 1 - 0.1 * Math.pow(1 - hopPh, 3) + 0.05 * hopPh : 1 + Math.sin(t * 2.4) * 0.015;
  const eyesOpen = !(Math.floor(t * 0.9 + 0.3) % 5 === 0 && (t * 0.9 + 0.3) % 1 < 0.14);
  const mouthOpen = !!o.talk && Math.sin(t * 13) > -0.1;
  const key = ['loopy', mood, eyesOpen ? 1 : 0, mouthOpen ? 1 : 0].join('|');
  const e = bake(key, 124, 104, (pen, c) => loopyBody(pen, mood, eyesOpen, mouthOpen));
  ctx.save(); ctx.translate(x, y - Math.max(0, hop) * k); ctx.scale(k, k);
  ctx.fillStyle = 'rgba(43,39,51,0.17)'; ctx.beginPath(); ctx.ellipse(0, 46 + Math.max(0, hop), 40 - hop * 0.5, 5.5, 0, 0, TAU); ctx.fill();
  // cable tail: a wiggling crayon line (two cheap strokes)
  { const pts = []; let px = 42, py = 20, a = 0.1; pts.push([px, py]);
    for (let i = 0; i < 8; i++) { a += Math.sin(t * 3 - i * 0.6) * 0.22 + 0.1; px += Math.cos(a) * 5.4; py += Math.sin(a) * 5.4 + 0.5; pts.push([px, py]); }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [w, col] of [[7.5, INK], [4.4, C.orange]]) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke(); }
    const l = pts[pts.length - 1]; ctx.fillStyle = INK; ctx.fillRect(l[0] - 1, l[1] - 4.5, 9, 9); ctx.fillStyle = '#b9b6c7'; ctx.fillRect(l[0] + 0.5, l[1] - 3, 6, 6); }
  ctx.translate(0, 38); ctx.scale(1 / Math.sqrt(squash), squash); ctx.translate(0, -38);
  put(ctx, e, 0, 0, t, 0.11);
  if (mood === 'sleepy') { const zz = (t * 0.7) % 1; ctx.globalAlpha = 1 - zz; ctx.font = '900 ' + (14 + zz * 8) + 'px "Trebuchet MS",sans-serif'; ctx.fillStyle = C.blue; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeText('z', 34 + zz * 8, -34 - zz * 22); ctx.fillText('z', 34 + zz * 8, -34 - zz * 22); ctx.globalAlpha = 1; }
  if (mood === 'excited') for (let i = 0; i < 3; i++) { const a = t * 3 + i * 2.1, sx = Math.cos(a) * 50, sy = -22 + Math.sin(a) * 26; ctx.strokeStyle = C.yellow; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(sx - 4, sy); ctx.lineTo(sx + 4, sy); ctx.moveTo(sx, sy - 4); ctx.lineTo(sx, sy + 4); ctx.stroke(); }
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ the logo
const RAIN_TOP = [C.pink, C.orange, C.yellow, C.pink];
const RAIN_BOT = [C.lime, C.cyan, C.blue, C.lime];
function logoBase(pen, c, w) {
  const u = w;
  // doodled margins: notes, stars, hearts, a spiral
  const note = (nx, ny, s, col) => { pen.dot(nx, ny, 7 * s, col); pen.ln([nx + 6 * s, ny, nx + 6 * s, ny - 28 * s, nx + 18 * s, ny - 22 * s], col === C.ink ? INK : INK, 3, false, 0.5); pen.ln([nx + 6 * s, ny - 28 * s, nx + 18 * s, ny - 22 * s], col, 3, false, 0.4); };
  note(-u * 0.44, -u * 0.30, u / 500, C.pink); note(u * 0.40, u * 0.16, u / 480, C.green); note(-u * 0.38, u * 0.20, u / 520, C.blue); note(u * 0.43, -u * 0.31, u / 470, C.orange);
  pen.shp(star(-u * 0.30, -u * 0.38, u * 0.035), C.yellow, INK, 2.6, { gap: 3 }); pen.shp(star(u * 0.33, -u * 0.37, u * 0.028, 0.5, 0.3), C.cyan, INK, 2.6, { gap: 3 });
  pen.shp(heart(u * 0.45, u * 0.33, u * 0.06), C.red, INK, 2.6, { gap: 3 });
  const sp = []; for (let i = 0; i < 40; i++) { const a = i * 0.45, r = 3 + i * 1.1 * u / 500; sp.push(-u * 0.45 + Math.cos(a) * r, u * 0.36 + Math.sin(a) * r); } pen.ln(sp, C.purple, 3, false, 0.3);
  // the words
  const big = u * 0.27, ow = u * 0.02, lw = big * 0.2;
  pen.txt('DROP', 0, -u * 0.09, big, C.pink, { align: 'c', out: INK, ow, w: lw, rainbow: RAIN_TOP, rot: -0.025, ph: 0 });
  pen.txt('BASS', 0, u * 0.36, big, C.lime, { align: 'c', out: INK, ow, w: lw, rainbow: RAIN_BOT, rot: 0.02, ph: 1.4 });
  // THE on a blue felt-tip banner
  pen.shp([-u * 0.13, -u * 0.075, u * 0.13, -u * 0.095, u * 0.145, u * 0.025, -u * 0.12, u * 0.045], C.sky, INK, 3.2, { gap: 4.4, f2: '#cfeeff' });
  pen.txt('THE', 0, u * 0.04, u * 0.085, INK, { align: 'c', w: u * 0.016 });
}
export function drawLogo(ctx, x, y, w, t) {
  t = t || 0;
  const bass = (t * 2) % 1, pulse = Math.pow(Math.max(0, 1 - bass * 2.4), 2);
  const bw = Math.round(w / 8) * 8, key = 'logo|' + bw;
  const e = bake(key, Math.ceil(bw * 1.2), Math.ceil(bw * 0.82), (pen, c) => logoBase(pen, c, bw));
  ctx.save(); ctx.translate(x, y);
  // shock-wave scribbles: expanding wobbly rings (cheap live strokes)
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const kk = ((t * 0.55) + i / 3) % 1, rx = w * (0.2 + kk * 0.46), ry = w * (0.11 + kk * 0.25);
    ctx.globalAlpha = 0.8 * (1 - kk); ctx.strokeStyle = i % 2 ? C.cyan : C.pink; ctx.lineWidth = 3 + (1 - kk) * 4;
    ctx.beginPath(); for (let a = 0; a <= 36; a++) { const th = a / 36 * TAU, wob = 1 + Math.sin(th * 5 + t * 6 + i) * 0.025; ctx.lineTo(Math.cos(th) * rx * wob, Math.sin(th) * ry * wob); } ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const sc = 1 + pulse * 0.04; ctx.scale(sc, sc);
  put(ctx, e, 0, 0, t);
  // twinkling crayon sparkles
  for (let i = 0; i < 5; i++) {
    const a = i * 1.7, sx = Math.cos(a) * w * 0.42, sy = Math.sin(a * 1.3) * w * 0.3, tw = Math.max(0, Math.sin(t * 3 + i * 1.9)), r = w * 0.016 * (0.4 + tw);
    if (tw < 0.05) continue; ctx.strokeStyle = i % 2 ? C.yellow : C.cyan; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx - r, sy); ctx.lineTo(sx + r, sy); ctx.moveTo(sx, sy - r); ctx.lineTo(sx, sy + r); ctx.stroke();
  }
  ctx.restore();
}
