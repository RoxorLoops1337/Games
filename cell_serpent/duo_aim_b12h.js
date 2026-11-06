// 02-duo-pets (round 12): the duo AIMS in circle stages. The duo is fixed in the middle and small, so it needs to read where it points:
// 1) aimPose: the body leans a touch toward the aim, the heads shear toward it (the singers turn their faces) and every volley kicks the duo back.
// 2) a shared microphone with a gloved hand held out toward the aim, pulled back by the recoil with a few sound arcs at its tip (baked sprite, no gradients).
// 3) petSlot: the pets keep to their own sides but slide off the aim line, so the notes never fly through a pet.
// 4) eyeCode: the pet pupils look toward the nearest snake head (three baked looks per pet: left, ahead, right).
// Pure maths plus a few numbers of state: nothing is allocated per frame (the pose objects are reused).
export const TAU = 6.2832;
export const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
export const KICK_LEN = 0.16, MIC_D = 44;

export function createAim() { return { a: -Math.PI / 2, init: false, turn: 0, tilt: 0, dx: 0, dy: 0, hx: 0, kick: 0, mx: 0, my: 0, rot: -Math.PI / 2, tx: 0, ty: 0 }; }

// shortest signed angle from a to b
export function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return d; }

// st: state, aim: the sim aim angle, since: seconds since the last shot, dt: frame seconds, still: reduced motion (no spring, no kick)
export function aimPose(st, aim, since, dt, still) {
  if (!st.init || still) { st.a = aim; st.init = true; }
  else st.a += angDiff(st.a, aim) * Math.min(1, dt * 16);   // the visual aim follows a hair behind the sim aim, so quick flicks swing instead of jumping
  const c = Math.cos(st.a), s = Math.sin(st.a);
  const k = still ? 0 : since >= 0 && since < KICK_LEN ? 1 - since / KICK_LEN : 0, kk = k * k;
  st.kick = kk;
  st.turn = c * 5;                      // heads shear toward the aim (px at the head)
  st.tilt = c * 0.06;                   // the body leans toward it (radians)
  st.dx = -c * kk * 4; st.dy = -s * kk * 3 + (s > 0 ? s * 1.5 : 0);   // recoil: pushed back against the aim; a little crouch when aiming down
  st.hx = 78 * Math.sin(st.tilt) + st.turn * 0.9 + st.dx;            // where a hat on the heads moves to
  const d = MIC_D - kk * 10;
  st.mx = c * d; st.my = -8 + s * d * 0.92; st.rot = st.a;
  st.tx = c * (d + 56); st.ty = -8 + s * (d + 56) * 0.92;   // the mic tip, for the sound arcs
  return st;
}

// where a pet wants to stand, relative to the duo: its own side (side -1 or 1), pushed off the aim line when the line would cross it.
// out gets {x, y}. clear: how far the pet's centre must stay from the line.
export function petSlot(out, side, aim, t, i, clear = 58) {
  let x = side * 86 + Math.sin(t * 1.7 + i) * 4, y = 8 + Math.cos(t * 1.3 + i * 2) * 2;
  const c = Math.cos(aim), s = Math.sin(aim), fwd = x * c + y * s, cr = x * -s + y * c;   // along and across the aim line
  if (fwd > -20 && Math.abs(cr) < clear) {   // the pet is on the aimed side and close to the line: slide it across, never behind the singers
    const dA = clear - cr, dB = -clear - cr, yA = y + c * dA, yB = y + c * dB, okA = yA >= -6, okB = yB >= -6;
    const dp = okA && okB ? (Math.abs(dA) <= Math.abs(dB) ? dA : dB) : okA ? dA : okB ? dB : (yA > yB ? dA : dB);
    x -= s * dp; y += c * dp;
  }
  out.x = x; out.y = y; return out;
}

// which baked look: 0 ahead, 1 left, 2 right. cur: the previous code for a little hysteresis, dx: head x minus pet x, near: head distance.
export function eyeCode(cur, dx, near) {
  if (!(near < 560) || dx !== dx) return 0;
  const th = cur ? 22 : 44;
  return dx > th ? 2 : dx < -th ? 1 : 0;
}
// the sprite mood number for a pet that looks to one side (only the plain and alert faces have open eyes)
export const lookMood = (mood, code) => (code && (mood === 0 || mood === 2) ? mood + 20 * code : mood);

// the baked microphone: a gloved hand and a sleeve on the left, a silver handle, a mesh ball with a pink band. Points along +x.
const MIC_W = 96, MIC_H = 48;
export function bakeMic(kit) {
  if (!kit || !kit.bake) return null;
  return kit.bake('mic|b12h', MIC_W, MIC_H, g => {
    const INK = '#2a1a2e';
    const rr = (x, y, w, h, r, fill) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); g.fillStyle = fill; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke(); };
    const dc = (x, y, r, fill) => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = fill; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke(); };
    rr(-46, -9, 22, 18, 7, '#ff7eb6');           // sleeve
    rr(-14, -5.5, 30, 11, 5, '#cfd6e4');          // handle
    g.fillStyle = '#9aa6c0'; g.fillRect(-4, 1.5, 18, 2.5);
    dc(-17, 0, 10, '#ffffff');                     // the glove
    g.strokeStyle = INK; g.lineWidth = 2.4; g.lineCap = 'round'; g.beginPath(); g.moveTo(-21, -3); g.lineTo(-13, -3); g.moveTo(-21, 3); g.lineTo(-13, 3); g.stroke();
    rr(14, -4, 6, 8, 2, '#ff7eb6');                // band
    dc(30, 0, 14, '#8d97b4');                      // mesh ball
    g.save(); g.beginPath(); g.arc(30, 0, 11.5, 0, TAU); g.clip(); g.strokeStyle = '#c3cbe0'; g.lineWidth = 1.6;
    for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(16 + k * 5, -14); g.lineTo(44 + k * 5, 14); g.stroke(); g.beginPath(); g.moveTo(44 + k * 5, -14); g.lineTo(16 + k * 5, 14); g.stroke(); }
    g.restore();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(25, -5, 3, 0, TAU); g.fill();
  }, 2);
}
export const MIC_SIZE = { w: MIC_W, h: MIC_H };

// three short arcs flying out of the mic tip, k = kick 0..1 (1 right after the shot)
export function micArcs(ctx, x, y, rot, k) {
  if (k <= 0.05) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const f = 1 - k, r = 8 + i * 9 + f * 14; ctx.globalAlpha = Math.min(1, k * 1.4) * (1 - i * 0.22);
    ctx.strokeStyle = '#2a1a2e'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(0, 0, r, -0.6, 0.6); ctx.stroke();
    ctx.strokeStyle = i & 1 ? '#fff6a8' : '#6fe3ff'; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.arc(0, 0, r, -0.6, 0.6); ctx.stroke();
  }
  ctx.restore();
}
