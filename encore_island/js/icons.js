'use strict';
// Encore Island — UI glyphs and world props painted in the same sticker style as the items. Painted once (128px), cached, blitted anywhere.
const ICON_PAINT = {
  speed() { shape(() => { ctx.moveTo(-40, 30); ctx.lineTo(-40, -6); ctx.quadraticCurveTo(-40, -30, -14, -30); ctx.lineTo(0, -30); ctx.lineTo(4, -8); ctx.quadraticCurveTo(30, -2, 46, 14); ctx.lineTo(46, 30); ctx.closePath(); }, '#ff9ac8', -30, 30); shape(() => rr(-44, 24, 92, 14, 7), '#fff4e6', 24, 38, 6);
    for (const [y, l] of [[-12, 12], [2, 8]]) { ctx.strokeStyle = '#fff4e6'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-30, y); ctx.lineTo(-30 + l * 2, y); ctx.stroke(); }
    shape(() => { ctx.moveTo(-6, -26); ctx.quadraticCurveTo(10, -60, 44, -54); ctx.quadraticCurveTo(30, -34, 12, -22); ctx.closePath(); }, '#ffffff', -60, -22, 5); glossE(-24, -10, 6, 14, 0.2, 0.5); spark(34, -12, 8); },
  cap() { shape(() => rr(-34, -34, 68, 74, 22), '#46d8cf', -34, 40); shape(() => rr(-24, -2, 48, 34, 10), '#7af0e6', -2, 32, 5); shape(() => rr(-12, -52, 24, 24, 10), '#2cc4bf', -52, -28, 5); ctx.fillStyle = HV.line; rr(-8, 10, 16, 6, 3); ctx.fill(); ctx.strokeStyle = '#fff4e6'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-34, -14); ctx.lineTo(-34, 22); ctx.moveTo(34, -14); ctx.lineTo(34, 22); ctx.stroke(); glossE(-18, -18, 6, 14, 0.2, 0.5); spark(24, -22, 8); },
  dmg() { for (const sd of [-1, 1]) { ctx.save(); ctx.rotate(sd * 0.7); shape(() => rr(-5, -50, 10, 100, 5), '#d9a468', -50, 50, 6); shape(() => ctx.arc(0, -52, 12, 0, TAU), '#fff4e6', -64, -40, 5); ctx.restore(); } spark(0, -4, 18); glossE(-4, -30, 3, 18, -0.7, 0.4); },
  rate() { shape(() => { ctx.moveTo(-28, 40); ctx.lineTo(-12, -44); ctx.lineTo(12, -44); ctx.lineTo(28, 40); ctx.closePath(); }, '#ffd84d', -44, 40); ctx.strokeStyle = HV.line; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 26); ctx.lineTo(18, -36); ctx.stroke(); ctx.strokeStyle = '#fff4e6'; ctx.lineWidth = 3.5; ctx.stroke(); shape(() => ctx.arc(14, -22, 8, 0, TAU), '#ff7eb6', -30, -14, 4); ctx.fillStyle = HV.line; rr(-14, 20, 28, 8, 4); ctx.fill(); glossE(-12, -4, 4, 18, 0.1, 0.5); },
  hp() { shape(() => { ctx.moveTo(0, 40); ctx.bezierCurveTo(-60, -4, -46, -48, -22, -42); ctx.bezierCurveTo(-8, -40, 0, -26, 0, -22); ctx.bezierCurveTo(0, -26, 8, -40, 22, -42); ctx.bezierCurveTo(46, -48, 60, -4, 0, 40); ctx.closePath(); }, '#ff4d7a', -48, 40, 8, 0.45, 0.25); glossE(-26, -20, 8, 14, 0.6, 0.65); spark(28, -22, 8, 0.8); },
  magnet() { ctx.lineCap = 'butt'; ctx.strokeStyle = HV.line; ctx.lineWidth = 36; ctx.beginPath(); ctx.arc(0, -4, 30, Math.PI, 0); ctx.lineTo(30, 30); ctx.moveTo(-30, -4); ctx.lineTo(-30, 30); ctx.stroke(); ctx.strokeStyle = '#ff4d5a'; ctx.lineWidth = 26; ctx.beginPath(); ctx.arc(0, -4, 30, Math.PI, 0); ctx.lineTo(30, 14); ctx.moveTo(-30, -4); ctx.lineTo(-30, 14); ctx.stroke(); shape(() => rr(17, 14, 26, 24, 4), '#e6ecf8', 14, 38, 5); shape(() => rr(-43, 14, 26, 24, 4), '#e6ecf8', 14, 38, 5); glossE(-14, -34, 14, 5, -0.2, 0.5); spark(30, -30, 8); },
  crit() { shape(() => { for (let i = 0; i < 16; i++) { const r = i % 2 ? 24 : 54, a = -1.5708 + i * 0.3927; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); }, '#ff9a2e', -54, 54, 7); shape(() => { for (let i = 0; i < 10; i++) { const r = i % 2 ? 9 : 22, a = -1.5708 + i * 0.6283; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); }, '#fff4a0', -22, 22, 4); },
  coin() { paintCoin(); },
  gem() { paintGem(); },
  crown() { paintCrown(); },
  tower() { shape(() => rr(-32, -50, 64, 100, 16), '#8f6be8', -50, 50); for (const [y, r] of [[-18, 20], [22, 15]]) { shape(() => ctx.arc(0, y, r + 4, 0, TAU), '#3a2a7a', y - r, y + r, 4, 0.1, 0.1); shape(() => ctx.arc(0, y, r * 0.45, 0, TAU), '#ff7eb6', y - r, y + r, 3); } glossE(-20, -34, 6, 18, 0.2, 0.45); spark(26, -40, 8); },
  disco() { ctx.strokeStyle = HV.line; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, -60); ctx.lineTo(0, -40); ctx.stroke(); shape(() => ctx.arc(0, 6, 44, 0, TAU), '#e6d9ff', -40, 50); ctx.save(); ctx.beginPath(); ctx.arc(0, 6, 42, 0, TAU); ctx.clip(); ctx.strokeStyle = 'rgba(80,60,160,0.5)'; ctx.lineWidth = 2.5; for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 14, -40); ctx.lineTo(i * 14, 52); ctx.moveTo(-44, 6 + i * 14); ctx.lineTo(44, 6 + i * 14); ctx.stroke(); } for (const [x, y, c] of [[-14, -8, '#ff9ac8'], [12, 14, '#9af0e8'], [-4, 24, '#ffe98a']]) { ctx.fillStyle = c; ctx.fillRect(x - 7, y - 7, 14, 14); } ctx.restore(); glossE(-18, -20, 10, 7, -0.6, 0.65); spark(30, -22, 10); spark(-34, 30, 6, 0.8); },
  boom() { shape(() => rr(-52, -22, 104, 58, 14), '#ff7eb6', -22, 36); ctx.strokeStyle = HV.line; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(-26, -22); ctx.quadraticCurveTo(0, -56, 26, -22); ctx.stroke(); for (const x of [-26, 26]) { shape(() => ctx.arc(x, 8, 17, 0, TAU), '#3a2a7a', -9, 25, 4); shape(() => ctx.arc(x, 8, 7, 0, TAU), '#ffe98a', 1, 15, 3); } glossE(-30, -14, 14, 4, 0, 0.5); },
  drums() { shape(() => rr(-38, -10, 76, 50, 12), '#ff7eb6', -10, 40); shape(() => ctx.ellipse(0, -10, 40, 16, 0, 0, TAU), '#fff4e6', -26, 6); ctx.strokeStyle = HV.line; ctx.lineWidth = 3; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 15, -4); ctx.lineTo(i * 8, 38); ctx.stroke(); } for (const sd of [-1, 1]) { ctx.save(); ctx.translate(sd * 18, -34); ctx.rotate(sd * 0.5); shape(() => rr(-3, -26, 6, 52, 3), '#d9a468', -26, 26, 4); ctx.restore(); } },
  gate() { for (const sd of [-1, 1]) shape(() => rr(sd * 38 - 9, -40, 18, 84, 6), '#ffd84d', -40, 44, 6); shape(() => { ctx.moveTo(-50, -34); ctx.quadraticCurveTo(0, -78, 50, -34); ctx.lineTo(50, -20); ctx.quadraticCurveTo(0, -62, -50, -20); ctx.closePath(); }, '#ff7eb6', -64, -20, 6); ctx.strokeStyle = HV.line; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-30, -2); ctx.quadraticCurveTo(0, 26, 30, -2); ctx.stroke(); ctx.strokeStyle = '#ff4d7a'; ctx.lineWidth = 4; ctx.stroke(); spark(0, -50, 8); },
  amp() { shape(() => rr(-46, -34, 92, 72, 12), '#6b4fc4', -34, 38); shape(() => rr(-38, -26, 76, 20, 6), '#2a1d5a', -26, -6, 4); for (const x of [-26, -9, 8, 25]) { shape(() => ctx.arc(x, -16, 6, 0, TAU), '#ffe98a', -22, -10, 3); } shape(() => ctx.arc(0, 16, 15, 0, TAU), '#3a2a7a', 1, 31, 4); glossE(-30, -30, 14, 3, 0, 0.4); spark(34, 28, 7, 0.8); },
  altar() { shape(() => rr(-44, 8, 88, 34, 8), '#e6d3a3', 8, 42); shape(() => rr(-28, -14, 56, 26, 8), '#ffe9a8', -14, 12, 6); paintCrownAt(0, -34, 0.55); spark(36, -20, 8); },
  forge() { shape(() => { ctx.moveTo(0, -56); ctx.bezierCurveTo(30, -26, 46, -2, 38, 22); ctx.bezierCurveTo(32, 46, -32, 46, -38, 22); ctx.bezierCurveTo(-46, -2, -14, -16, 0, -56); ctx.closePath(); }, '#ff7a2e', -56, 46, 7, 0.45, 0.2); shape(() => { ctx.moveTo(0, -20); ctx.bezierCurveTo(16, -4, 22, 8, 18, 22); ctx.bezierCurveTo(12, 38, -12, 38, -18, 22); ctx.bezierCurveTo(-22, 8, -6, -2, 0, -20); ctx.closePath(); }, '#ffd84d', -20, 38, 4); },
  way() { ctx.lineCap = 'round'; for (const [r, c, w] of [[40, '#6ec9e0', 14], [26, '#c6a8ff', 12], [12, '#fff4e6', 10]]) { ctx.strokeStyle = HV.line; ctx.lineWidth = w + 6; ctx.beginPath(); ctx.arc(0, 0, r, 0.5, 5.2); ctx.stroke(); ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke(); } spark(22, -24, 9); },
  egg() { shape(() => { ctx.moveTo(0, -52); ctx.bezierCurveTo(40, -52, 48, 20, 28, 40); ctx.bezierCurveTo(14, 54, -14, 54, -28, 40); ctx.bezierCurveTo(-48, 20, -40, -52, 0, -52); ctx.closePath(); }, '#fff4e6', -52, 54, 7, 0.1, 0.2); for (const [x, y, r, c] of [[-14, -8, 9, '#ff9ac8'], [12, 10, 11, '#9af0b4'], [-6, 28, 8, '#c6a8ff'], [16, -26, 7, '#ffe98a']]) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); } glossE(-18, -26, 6, 14, 0.4, 0.6); },
  groove() { ctx.lineCap = 'round'; for (const [x, y] of [[-20, 24], [22, 14]]) { shape(() => ctx.ellipse(x, y, 17, 12, -0.3, 0, TAU), '#ff7eb6', y - 12, y + 12, 6); } shape(() => { ctx.moveTo(-9, 22); ctx.lineTo(-9, -36); ctx.lineTo(33, -46); ctx.lineTo(33, 12); ctx.lineTo(29, 12); ctx.lineTo(29, -32); ctx.lineTo(-3, -24); ctx.lineTo(-3, 22); ctx.closePath(); }, '#fff4e6', -46, 22, 6); spark(42, -40, 8); },
  star() { shape(() => { for (let i = 0; i < 10; i++) { const r = i % 2 ? 22 : 52, a = -1.5708 + i * 0.6283; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r + 4); } ctx.closePath(); }, '#ffd84d', -50, 56, 7, 0.45, 0.2); glossE(-14, -14, 6, 12, 0.5, 0.6); },
  scroll() { shape(() => rr(-34, -40, 68, 80, 8), '#fff4e6', -40, 40, 7, 0.0, 0.2); for (const y of [-40, 40]) shape(() => rr(-42, y - 10, 84, 20, 10), '#e6d3a3', y - 10, y + 10, 6); ctx.strokeStyle = '#b89858'; ctx.lineWidth = 4; ctx.lineCap = 'round'; for (const y of [-16, -2, 12]) { ctx.beginPath(); ctx.moveTo(-20, y); ctx.lineTo(20, y); ctx.stroke(); } spark(26, -26, 8, 0.8); },
  trophy() { shape(() => { ctx.moveTo(-30, -44); ctx.lineTo(30, -44); ctx.quadraticCurveTo(32, 12, 0, 20); ctx.quadraticCurveTo(-32, 12, -30, -44); ctx.closePath(); }, '#ffd84d', -44, 20); for (const sd of [-1, 1]) { ctx.strokeStyle = HV.line; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(sd * 34, -26, 14, sd > 0 ? -1.4 : 1.7, sd > 0 ? 1.4 : 4.6); ctx.stroke(); ctx.strokeStyle = '#ffd84d'; ctx.lineWidth = 6; ctx.stroke(); } shape(() => rr(-8, 18, 16, 20, 3), '#e6a822', 18, 38, 5); shape(() => rr(-26, 36, 52, 14, 5), '#ffe98a', 36, 50, 5); glossE(-14, -26, 5, 16, 0.1, 0.6); },
  gift() { shape(() => rr(-40, -14, 80, 56, 8), '#ff7eb6', -14, 42); shape(() => rr(-46, -34, 92, 26, 8), '#ff9ac8', -34, -8, 6); shape(() => rr(-8, -34, 16, 76, 3), '#ffe98a', -34, 42, 4); ctx.strokeStyle = HV.line; ctx.lineWidth = 14; ctx.beginPath(); ctx.ellipse(-16, -46, 15, 10, -0.5, 0, TAU); ctx.ellipse(16, -46, 15, 10, 0.5, 0, TAU); ctx.stroke(); ctx.strokeStyle = '#ffe98a'; ctx.lineWidth = 7; ctx.stroke(); spark(30, -16, 8); },
  chest() { shape(() => rr(-46, -4, 92, 50, 10), '#b8803e', -4, 50); shape(() => { ctx.moveTo(-46, -2); ctx.quadraticCurveTo(0, -64, 46, -2); ctx.closePath(); }, '#d9a468', -50, -2); for (const x of [-26, 20]) shape(() => rr(x, -38, 10, 84, 3), '#ffd84d', -38, 46, 4); shape(() => rr(-10, -6, 20, 24, 5), '#ffe98a', -6, 18, 5); spark(32, -28, 8); },
  pet() { shape(() => ctx.ellipse(0, 16, 30, 26, 0, 0, TAU), '#ff9ac8', -10, 42); for (const [x, y, r] of [[-30, -18, 12], [-11, -38, 12], [11, -38, 12], [30, -18, 12]]) shape(() => ctx.ellipse(x, y, r, r * 1.2, 0, 0, TAU), '#ff9ac8', y - r, y + r, 5); glossE(-10, 6, 8, 5, -0.4, 0.5); },
  gear() { shape(() => { for (let i = 0; i < 16; i++) { const r = i % 2 ? 36 : 50, a = i * 0.3927 - 0.1; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.lineTo(Math.cos(a + 0.3) * r, Math.sin(a + 0.3) * r); } ctx.closePath(); }, '#c6a8ff', -50, 50); shape(() => ctx.arc(0, 0, 16, 0, TAU), '#fff4e6', -16, 16, 6); glossE(-20, -26, 8, 5, -0.6, 0.5); },
  sound() { shape(() => { ctx.moveTo(-40, -16); ctx.lineTo(-20, -16); ctx.lineTo(8, -40); ctx.lineTo(8, 40); ctx.lineTo(-20, 16); ctx.lineTo(-40, 16); ctx.closePath(); }, '#ffd84d', -40, 40); ctx.lineCap = 'round'; for (const r of [20, 36]) { ctx.strokeStyle = HV.line; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(10, 0, r, -0.8, 0.8); ctx.stroke(); ctx.strokeStyle = '#fff4e6'; ctx.lineWidth = 5; ctx.stroke(); } },
  mute() { ICON_PAINT.sound(); ctx.strokeStyle = HV.line; ctx.lineWidth = 16; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-40, -40); ctx.lineTo(44, 44); ctx.stroke(); ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 8; ctx.stroke(); },
  home() { shape(() => rr(-38, -4, 76, 52, 8), '#fff4e6', -4, 50); shape(() => { ctx.moveTo(-52, 0); ctx.lineTo(0, -52); ctx.lineTo(52, 0); ctx.closePath(); }, '#ff7eb6', -52, 0, 7); shape(() => rr(-10, 16, 20, 32, 5), '#9a6a48', 16, 48, 5); shape(() => rr(18, 8, 14, 14, 3), '#8fd0ff', 8, 22, 4); },
  mic() { shape(() => ctx.arc(0, -24, 24, 0, TAU), '#e6ecf8', -48, 0, 7); ctx.strokeStyle = 'rgba(80,60,140,0.55)'; ctx.lineWidth = 2.5; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 9, -46); ctx.lineTo(i * 9, -2); ctx.stroke(); } shape(() => { ctx.moveTo(-12, 4); ctx.lineTo(12, 4); ctx.lineTo(8, 52); ctx.lineTo(-8, 52); ctx.closePath(); }, '#ff7eb6', 4, 52, 6); glossE(-10, -34, 5, 8, 0.3, 0.6); spark(24, -44, 8); },
  menu() { for (const y of [-26, 0, 26]) shape(() => rr(-38, y - 8, 76, 16, 8), '#fff4e6', y - 8, y + 8, 5); },
  lock() { shape(() => rr(-34, -6, 68, 54, 12), '#ffd84d', -6, 48); ctx.strokeStyle = HV.line; ctx.lineWidth = 16; ctx.beginPath(); ctx.arc(0, -8, 22, Math.PI, 0); ctx.stroke(); ctx.strokeStyle = '#e6ecf8'; ctx.lineWidth = 8; ctx.stroke(); ctx.fillStyle = HV.line; ctx.beginPath(); ctx.arc(0, 18, 8, 0, TAU); ctx.fill(); ctx.fillRect(-3, 20, 6, 14); },
  elite() { ICON_PAINT.star(); },
  heart() { ICON_PAINT.hp(); },
  tick() { ctx.lineCap = 'round'; ctx.strokeStyle = HV.line; ctx.lineWidth = 22; ctx.beginPath(); ctx.moveTo(-32, 4); ctx.lineTo(-8, 30); ctx.lineTo(36, -26); ctx.stroke(); ctx.strokeStyle = '#7cf09a'; ctx.lineWidth = 12; ctx.stroke(); },
  paw() { ICON_PAINT.pet(); },
  vamp() { ICON_PAINT.hp(); }, range() { ICON_PAINT.way(); }, regen() { ICON_PAINT.hp(); }, nimble() { ICON_PAINT.speed(); }, magnet2() { ICON_PAINT.magnet(); },
  multi() { ICON_PAINT.groove(); }, critdmg() { ICON_PAINT.crit(); }, velocity() { ICON_PAINT.speed(); }, combow() { ICON_PAINT.groove(); }, scholar() { ICON_PAINT.scroll(); }, thorns() { ICON_PAINT.amp(); }, luck() { ICON_PAINT.star(); },
};
function paintCrownAt(x, y, s) { ctx.save(); ctx.translate(x, y); ctx.scale(s, s); paintCrown(); ctx.restore(); }
// draw a cached glyph centred at (x,y) with a nominal size in px
function drawIcon(key, x, y, size) {
  const p = ICON_PAINT[key]; if (!p) return false;
  const c = sprite('ic_' + key, 128, () => { ctx.scale(0.95, 0.95); p(); });
  if (c) ctx.drawImage(c, x - size / 2, y - size / 2, size, size);
  else { ctx.save(); ctx.translate(x, y); ctx.scale(size / 128 * 0.95, size / 128 * 0.95); p(); ctx.restore(); }
  return true;
}
// ---- world props: tree / pine / mushroom / bush / rock / flower, tinted per biome, cached ----
function paintProp(type, v, B) {
  const LN = HV.line;
  if (type === 'tree' && B.prop === 'pine') {
    ctx.fillStyle = LN; ctx.fillRect(-7, 20, 14, 36); ctx.fillStyle = '#9a6a48'; ctx.fillRect(-4.5, 20, 9, 34);
    for (const [y, w, h] of [[14, 48, 36], [-8, 40, 34], [-28, 30, 30]]) { shape(() => { ctx.moveTo(0, y - h); ctx.lineTo(w, y + 6); ctx.lineTo(-w, y + 6); ctx.closePath(); }, B.tree[v % 2], y - h, y + 6, 6, 0.25, 0.25); }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-10, -34, 4, 0, TAU); ctx.arc(8, -8, 4, 0, TAU); ctx.arc(-16, 14, 4, 0, TAU); ctx.fill(); spark(18, -34, 7, 0.8);
  } else if (type === 'tree' && B.prop === 'mush') {
    ctx.fillStyle = LN; rr(-12, -2, 24, 56, 10); ctx.fill(); ctx.fillStyle = '#fff4e6'; rr(-9, 0, 18, 52, 8); ctx.fill();
    shape(() => { ctx.moveTo(-54, 6); ctx.bezierCurveTo(-54, -54, 54, -54, 54, 6); ctx.quadraticCurveTo(0, 20, -54, 6); ctx.closePath(); }, B.tree[v % 2], -54, 14, 7, 0.3, 0.25);
    ctx.fillStyle = '#fff4e6'; for (const [x, y, r] of [[-24, -14, 8], [6, -26, 10], [28, -8, 7], [-4, -4, 5]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); } glossE(-26, -30, 12, 5, -0.5, 0.5);
  } else if (type === 'tree') {
    ctx.fillStyle = LN; rr(-9, 12, 18, 44, 6); ctx.fill(); ctx.fillStyle = '#9a6a48'; rr(-6, 14, 12, 40, 4); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(2, 14, 4, 40);
    const puffs = [[0, -22, 36], [-26, -4, 26], [26, -4, 26], [-10, -42, 22], [14, -38, 20]];
    ctx.fillStyle = LN; for (const q of puffs) { ctx.beginPath(); ctx.arc(q[0], q[1], q[2] + 5, 0, TAU); ctx.fill(); }
    for (const q of puffs) { ctx.fillStyle = litGrad(B.tree[0], q[1] - q[2], q[1] + q[2], 0.25, 0.28); ctx.beginPath(); ctx.arc(q[0], q[1], q[2], 0, TAU); ctx.fill(); }
    ctx.fillStyle = B.tree[1]; ctx.beginPath(); ctx.arc(-10, -34, 11, 0, TAU); ctx.arc(20, -14, 8, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff8f0'; for (const [x, y] of [[-26, -8], [8, -52], [30, -2], [-4, -18]]) { ctx.beginPath(); ctx.arc(x, y, 3.4, 0, TAU); ctx.fill(); } spark(-22, -44, 8, 0.7);
  } else if (type === 'rock') {
    shape(() => { ctx.moveTo(-44, 28); ctx.lineTo(-38, -4); ctx.lineTo(-14, -30); ctx.lineTo(22, -26); ctx.lineTo(44, 2); ctx.lineTo(38, 28); ctx.closePath(); }, '#aeb6c8', -30, 28, 7, 0.4, 0.25);
    ctx.fillStyle = '#d3d9e4'; ctx.beginPath(); ctx.moveTo(-38, -4); ctx.lineTo(-14, -30); ctx.lineTo(22, -26); ctx.lineTo(0, -2); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#7fd66e'; ctx.beginPath(); ctx.ellipse(-18, -12, 12, 5, -0.3, 0, TAU); ctx.fill();
  } else if (type === 'bush') {
    for (const [x, y, r] of [[-22, 8, 24], [22, 8, 24], [0, -6, 28]]) { ctx.fillStyle = LN; ctx.beginPath(); ctx.arc(x, y, r + 5, 0, TAU); ctx.fill(); }
    for (const [x, y, r] of [[-22, 8, 24], [22, 8, 24], [0, -6, 28]]) { ctx.fillStyle = litGrad(mixc(B.tuft, '#3fa86a', 0.4), y - r, y + r, 0.3, 0.2); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
    ctx.fillStyle = B.flowers[v % B.flowers.length]; for (const [x, y] of [[-14, -4], [10, -14], [24, 6]]) { ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffd84d'; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, TAU); ctx.fill(); ctx.fillStyle = B.flowers[v % B.flowers.length]; }
  } else { // flower patch
    for (const [x, y, c] of [[-22, 14, B.flowers[0]], [4, 4, B.flowers[1]], [24, 18, B.flowers[2]], [-4, 26, B.flowers[1]]]) {
      ctx.strokeStyle = LN; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y + 20); ctx.lineTo(x, y); ctx.stroke(); ctx.strokeStyle = '#4fbf6a'; ctx.lineWidth = 3.5; ctx.stroke();
      for (let k = 0; k < 5; k++) { const a = k * 1.2566; ctx.fillStyle = LN; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 11, y + Math.sin(a) * 11, 9, 0, TAU); ctx.fill(); }
      for (let k = 0; k < 5; k++) { const a = k * 1.2566; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 11, y + Math.sin(a) * 11, 7, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#ffd84d'; ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill();
    }
  }
}
const PROP_D = { tree: 92, rock: 50, bush: 58, flower: 50 };
function drawProp(p, B, bi) {
  const key = 'pr_' + bi + '_' + p.t + '_' + p.v, d = PROP_D[p.t] * p.s;
  const c = sprite(key, 128, () => { ctx.scale(0.95, 0.95); paintProp(p.t, p.v, B); });
  if (p.t === 'tree' || p.t === 'rock' || p.t === 'bush') { ctx.fillStyle = 'rgba(40,20,80,0.2)'; ctx.beginPath(); ctx.ellipse(p.x + d * 0.06, p.y + d * 0.04, d * (p.t === 'tree' ? 0.26 : 0.34), d * 0.08, 0, 0, TAU); ctx.fill(); }
  if (c) ctx.drawImage(c, p.x - d / 2, p.y - d * (p.t === 'tree' ? 0.78 : 0.62), d, d);
}
