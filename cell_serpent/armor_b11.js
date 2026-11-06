// 01 enemy art b11: armour wear. An armour cell shows how beaten up it is: below 2/3 hp a crack runs across the plate and one rivet
// has popped off, below 1/3 hp the plate is split, dented and a chip hangs loose. Baked once per level (same bake box as the body: B * 3.2,
// r = B), blitted over the armour body with the same size, so it costs one drawImage per damaged armour cell.
const INK = '#2d170f';
export const ARMOR_WEAR_LEVELS = 2;
// 0 = fresh, 1 = cracked, 2 = split
export const armorWearLevel = (hp, max) => (!(max > 0) || hp >= max * 0.667 ? 0 : hp >= max * 0.334 ? 1 : 2);
export function paintArmorWear(g, r, lv) {
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  const crack = (pts, w) => {
    g.beginPath(); g.moveTo(pts[0][0] * r, pts[0][1] * r); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0] * r, pts[i][1] * r);
    g.lineWidth = w * r; g.strokeStyle = INK; g.stroke();
    g.lineWidth = w * r * 0.38; g.strokeStyle = '#eef3ff'; g.globalAlpha = 0.55; g.stroke(); g.globalAlpha = 1;
  };
  // a popped rivet: a dark socket where one of the eight rivets used to sit (rivet 5 at angle 5/8 turn + 0.39)
  const an = 5 / 8 * Math.PI * 2 + 0.39;
  g.fillStyle = '#47557a'; g.beginPath(); g.arc(Math.cos(an) * r * 0.76, Math.sin(an) * r * 0.76, r * 0.09, 0, Math.PI * 2); g.fill();
  crack([[-0.62, -0.7], [-0.38, -0.42], [-0.5, -0.2], [-0.18, 0.02]], 0.07);
  crack([[-0.5, -0.2], [-0.78, -0.12]], 0.05);
  if (lv >= 2) {
    crack([[0.7, 0.62], [0.42, 0.34], [0.54, 0.1], [0.2, -0.1], [-0.18, 0.02]], 0.08);   // the two cracks meet: the plate is split across
    crack([[0.42, 0.34], [0.2, 0.52]], 0.05);
    // a dent: a dark crescent on the lower left and a loose chip hanging off the rim
    g.fillStyle = 'rgba(45,23,15,.28)'; g.beginPath(); g.ellipse(-r * 0.5, r * 0.5, r * 0.3, r * 0.17, 0.8, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(r * 0.78, -r * 0.56); g.lineTo(r * 0.98, -r * 0.4); g.lineTo(r * 0.82, -r * 0.3); g.closePath();
    g.fillStyle = '#9fb0d4'; g.fill(); g.lineWidth = r * 0.06; g.strokeStyle = INK; g.stroke();
  }
  g.restore();
}
