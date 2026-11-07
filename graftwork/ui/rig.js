// RIG: a tiny 2D skeletal runtime for layered characters (design/ART_MODULAR.md "Character animation", option A).
// A character is a set of separate PARTS (head, torso, arms, legs, feet, weapon) on one skeleton; the game poses the skeleton with a real step
// cycle, so feet alternate by construction (one foot forward, then the other) and no walk frames have to be generated. Pure math plus one draw
// function; parts come from a callback so the art can arrive later (assets/ui/manifest.json icons or an atlas) and a procedural placeholder draws today.
//
//   walkPhase(distance, stride)        steps walked (a plant at every integer), like assets.walkIndex's ph
//   leadFoot(ph)                       'L' | 'R': the foot that is forward at the last contact (alternates every step, L first)
//   walkPose(ph, o?)                   { legL, legR, kneeL, kneeR, armL, armR, bob, lean, lead }  angles in radians, + = forward (toward +x, the facing side)
//   solveRig(rig, pose, x, y, s, flip) [{ name, x, y, rot, part }] in draw order (world positions of every bone origin)
//   drawRig(ctx, rig, pose, x, y, o)   draws parts via o.part(name) -> { img, sx,sy,sw,sh, px,py, w,h } | null, else the procedural placeholder
// Positions are in rig units (about 64 tall); o.scale maps them to pixels. x,y is the point between the feet on the ground.
export const HUMANOID = {
  id: 'humanoid', height: 64,
  // name, parent, local offset from the parent's origin (pivot), length used by the placeholder, draw order z (low = behind)
  // LAYERS: the LEFT leg and arm are the NEAR side (in front of the body), the right ones the far side (behind it). Layers only: positions are unchanged.
  bones: [
    { n: 'hips', p: null, x: 0, y: -30, len: 0, z: 5 },
    { n: 'torso', p: 'hips', x: 0, y: 0, len: -20, z: 5 },
    { n: 'head', p: 'torso', x: 0, y: -20, len: -12, z: 7 },
    { n: 'armL_up', p: 'torso', x: -8, y: -18, len: 11, z: 8 }, { n: 'armL_lo', p: 'armL_up', x: 0, y: 11, len: 10, z: 8 }, { n: 'handL', p: 'armL_lo', x: 0, y: 10, len: 4, z: 8 },
    { n: 'armR_up', p: 'torso', x: 8, y: -18, len: 11, z: 2 }, { n: 'armR_lo', p: 'armR_up', x: 0, y: 11, len: 10, z: 2 }, { n: 'handR', p: 'armR_lo', x: 0, y: 10, len: 4, z: 2 },
    { n: 'weapon', p: 'handR', x: 0, y: 2, len: 14, z: 3 }, // the weapon hand is the far one now: the sword sits behind the torso, with that arm
    { n: 'legL_up', p: 'hips', x: -4, y: 0, len: 15, z: 6 }, { n: 'legL_lo', p: 'legL_up', x: 0, y: 15, len: 13, z: 6 }, { n: 'footL', p: 'legL_lo', x: 0, y: 13, len: 3, z: 6 },
    { n: 'legR_up', p: 'hips', x: 4, y: 0, len: 15, z: 1 }, { n: 'legR_lo', p: 'legR_up', x: 0, y: 15, len: 13, z: 1 }, { n: 'footR', p: 'legR_lo', x: 0, y: 13, len: 3, z: 1 },
  ],
};

export const walkPhase = (distance, stride) => (stride > 0 ? Math.max(0, distance) / stride : 0);
export const leadFoot = (ph) => (Math.floor(Math.max(0, ph) + 1e-9) % 2 === 0 ? 'L' : 'R');

// One step = contact (leading leg forward, body lowest), down, passing (legs together, body highest), up. The cycle is two steps.
export function walkPose(ph, o = {}) {
  const A = o.swing === undefined ? 0.55 : o.swing, K = o.knee === undefined ? 0.9 : o.knee, B = o.bob === undefined ? 2 : o.bob, AR = o.arms === undefined ? 0.5 : o.arms;
  const c = Math.cos(Math.PI * ph), s = Math.sin(Math.PI * ph);
  return {
    legL: A * c, legR: -A * c,
    kneeL: K * Math.max(0, -s), kneeR: K * Math.max(0, s), // the leg that swings forward folds its knee
    armL: -AR * c, armR: AR * c, // arms counter-swing: the arm opposite the forward leg goes forward
    bob: -B * (1 - Math.abs(c)), lean: 0.05 * s * (o.lean === undefined ? 1 : o.lean), lead: leadFoot(ph),
  };
}
export const IDLE_POSE = { legL: 0, legR: 0, kneeL: 0, kneeR: 0, armL: 0.05, armR: -0.05, bob: 0, lean: 0, lead: 'L' };

// local angle of each bone (canvas rotation: positive = clockwise, so a hanging limb swung FORWARD (+x) uses -angle)
function localAngle(name, P) {
  switch (name) {
    case 'torso': return P.lean;
    case 'armL_up': return -P.armL; case 'armR_up': return -P.armR;
    case 'armL_lo': return -Math.abs(P.armL) * 0.5 - 0.1; case 'armR_lo': return -Math.abs(P.armR) * 0.5 - 0.1;
    case 'legL_up': return -P.legL; case 'legR_up': return -P.legR;
    case 'legL_lo': return P.kneeL; case 'legR_lo': return P.kneeR; // the shin folds backward
    case 'footL': return -P.kneeL * 0.4 + P.legL * 0.5; case 'footR': return -P.kneeR * 0.4 + P.legR * 0.5; // keep the sole roughly flat
    default: return 0;
  }
}
export function solveRig(rig, P, x = 0, y = 0, s = 1, flip = false) {
  const W = {}, out = [], fx = flip ? -1 : 1;
  for (const b of rig.bones) {
    const par = b.p ? W[b.p] : null, la = localAngle(b.n, P) * fx;
    let wx, wy, rot;
    if (!par) { wx = x + b.x * s * fx; wy = y + (b.y + P.bob) * s; rot = 0; } else {
      const cs = Math.cos(par.rot), sn = Math.sin(par.rot), ox = b.x * fx;
      wx = par.x + (ox * cs - b.y * sn) * s; wy = par.y + (ox * sn + b.y * cs) * s; rot = par.rot + la;
    }
    W[b.n] = { name: b.n, x: wx, y: wy, rot, z: b.z, len: b.len };
  }
  for (const b of rig.bones) out.push(W[b.n]);
  return out.sort((a, b) => a.z - b.z);
}
// procedural placeholder: capsules in the hospital palette, so the rig is testable before any part art exists (never shipped as art)
export function drawRig(ctx, rig, P, x, y, o = {}) {
  const s = o.scale || 1, bones = solveRig(rig, P, x, y, s, !!o.flip), col = o.color || '#8a7a60', ink = '#2b1e1a';
  for (const b of bones) {
    const part = o.part ? o.part(b.name) : null;
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
    if (part && part.img) {
      ctx.drawImage(part.img, part.sx || 0, part.sy || 0, part.sw || part.img.width, part.sh || part.img.height, -(part.px || 0) * s, -(part.py || 0) * s, (part.w || part.sw) * s, (part.h || part.sh) * s);
    } else if (b.len) {
      const L = b.len * s, w = Math.max(2.5, Math.abs(b.len) * 0.28) * s;
      ctx.beginPath(); ctx.moveTo(-w, 0); ctx.lineTo(w, 0); ctx.lineTo(w * 0.8, L); ctx.lineTo(-w * 0.8, L); ctx.closePath();
      ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = ink; ctx.stroke();
    }
    ctx.restore();
  }
  return bones;
}
