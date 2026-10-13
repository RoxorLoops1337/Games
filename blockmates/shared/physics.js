// Shared body physics: the server steps every player and creature with this, the client predicts its own player with it.
// A "world view" w must offer: fgAt(x, y) -> block id, liqAt(x, y) -> liquid byte. Coordinates are tiles, y grows downward.
import { BLOCKS, DT, L_LAVA } from './data.js';

export const GRAV = 46;
export const MAX_FALL = 32;
export const WALK = 6.4;
export const JUMP = 15.2;
export const SWIM = 3.4;
export const CLIMB = 4.2;

// input bits
export const K_LEFT = 1, K_RIGHT = 2, K_UP = 4, K_DOWN = 8, K_JUMP = 16, K_RUN = 32;

export function bodyFlags(w, b) {
  // sample cells the body overlaps
  const x0 = Math.floor(b.x - b.w / 2), x1 = Math.floor(b.x + b.w / 2);
  const y0 = Math.floor(b.y - b.h), y1 = Math.floor(b.y - 0.01);
  let water = 0, lava = false, climb = false, slow = false, hurt = 0, cells = 0, deepWater = false;
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      cells++;
      const l = w.liqAt(x, y);
      if (l) { if ((l >> 4) === L_LAVA) lava = true; else water++; }
      const id = w.fgAt(x, y);
      if (id) {
        const d = BLOCKS[id];
        if (d.climb) climb = true;
        if (d.slow) slow = true;
        if (d.hurts) hurt = Math.max(hurt, d.hurts);
      }
    }
  }
  // head in water?
  const hy = Math.floor(b.y - b.h + 0.25);
  const hl = w.liqAt(Math.floor(b.x), hy);
  deepWater = !!hl && (hl >> 4) !== L_LAVA;
  return { water: water > 0, lava, climb, slow, hurt, deepWater, wet: water > cells * 0.4 };
}

// one fixed step. b: {x,y,vx,vy,w,h,onGround,dir}; keys: bitmask. opts: {fly}
export function stepBody(w, b, keys, opts = {}) {
  const f = bodyFlags(w, b);
  b.flags = f;
  const left = keys & K_LEFT, right = keys & K_RIGHT, up = keys & K_UP, down = keys & K_DOWN, jump = keys & (K_JUMP);
  const speed = (opts.speed || WALK) * (keys & K_RUN ? 1.35 : 1) * (f.slow ? 0.35 : 1) * (f.wet ? 0.6 : 1);
  let tx = 0;
  if (left) tx -= speed;
  if (right) tx += speed;
  if (tx) b.dir = tx > 0 ? 1 : -1;
  // horizontal: accelerate quickly, slide on ice a little less
  const acc = b.onGround ? 70 : 34;
  if (tx === 0) b.vx *= b.onGround ? 0.55 : 0.94;
  else {
    const dv = tx - b.vx;
    const a = acc * DT;
    b.vx += Math.max(-a, Math.min(a, dv));
  }
  if (Math.abs(b.vx) < 0.02) b.vx = 0;

  // vertical
  if (f.climb && !(jump && (left || right))) {
    b.vy = (up || jump) ? -CLIMB : down ? CLIMB : 0;
  } else if (f.wet || f.lava) {
    b.vy += GRAV * 0.25 * DT;
    b.vy *= 0.92;
    if (jump || up) b.vy = Math.max(b.vy - 60 * DT, -SWIM * (f.lava ? 0.5 : 1));
    if (down) b.vy += 14 * DT;
    if (b.vy > 6) b.vy = 6;
  } else {
    b.vy = Math.min(MAX_FALL, b.vy + GRAV * DT);
    if (jump && b.onGround) { b.vy = -(opts.jump || JUMP); b.onGround = false; b.jumped = true; }
    else if (f.climb && jump) b.vy = -JUMP * 0.7;
  }

  moveBody(w, b, b.vx * DT, b.vy * DT, !!down);
  return f;
}

export function moveBody(w, b, dx, dy, dropThrough = false) {
  b.landV = 0;
  // horizontal in small increments
  let n = Math.max(1, Math.ceil(Math.abs(dx) / 0.4));
  let sx = dx / n;
  for (let i = 0; i < n; i++) {
    const nx = b.x + sx;
    if (!collides(w, nx, b.y, b, dropThrough)) { b.x = nx; continue; }
    // auto step up one tile when walking
    if (b.onGround && !collides(w, nx, b.y - 1.02, b, dropThrough) && !collides(w, b.x, b.y - 1.02, b, dropThrough)) {
      b.x = nx; b.y -= 1.0001; b.stepped = true; continue;
    }
    b.vx = 0; b.hitWall = true;
    // snap flush against the wall
    break;
  }
  // vertical
  n = Math.max(1, Math.ceil(Math.abs(dy) / 0.4));
  const sy = dy / n;
  b.onGround = false;
  for (let i = 0; i < n; i++) {
    const prevBottom = b.y;
    const ny = b.y + sy;
    if (!collides(w, b.x, ny, b, dropThrough, prevBottom)) { b.y = ny; continue; }
    if (sy > 0) {
      b.y = Math.floor(ny) ; // rest on the top of the tile below
      if (collides(w, b.x, b.y, b, dropThrough, prevBottom)) b.y = Math.floor(b.y) - 0.0001;
      else b.y -= 0.0001;
      b.onGround = true;
      b.landV = b.vy;
    } else {
      b.y = Math.ceil(ny - b.h) + b.h + 0.0001; // bump head
    }
    b.vy = 0;
    break;
  }
  // ground probe so onGround stays true while standing
  if (!b.onGround && b.vy >= 0 && collides(w, b.x, b.y + 0.05, b, dropThrough, b.y)) b.onGround = true;
  const bounce = bounceUnder(w, b);
  if (bounce && b.onGround && b.landV > 8) { b.vy = -Math.min(24, b.landV * 0.95); b.onGround = false; b.landV = 0; }
}

function bounceUnder(w, b) {
  const id = w.fgAt(Math.floor(b.x), Math.floor(b.y + 0.08));
  return !!(id && BLOCKS[id].bouncy);
}

function collides(w, x, y, b, dropThrough, prevBottom = Infinity) {
  const hw = b.w / 2 - 0.0001;
  const x0 = Math.floor(x - hw), x1 = Math.floor(x + hw);
  const y0 = Math.floor(y - b.h + 0.0001), y1 = Math.floor(y - 0.0001);
  for (let tx = x0; tx <= x1; tx++) {
    for (let ty = y0; ty <= y1; ty++) {
      const id = w.fgAt(tx, ty);
      if (!id) continue;
      const d = BLOCKS[id];
      if (d.solid) return true;
      if (d.oneway && !dropThrough && prevBottom <= ty + 0.002 && y > ty && y - 0.0001 < ty + 1.2 && ty === y1) return true;
    }
  }
  return false;
}

export function bodiesOverlap(a, b) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && a.y > b.y - b.h && a.y - a.h < b.y;
}
