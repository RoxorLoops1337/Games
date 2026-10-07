// World module adapter for the three mini games (rhythm, run, tuner). They own their scene content, camera and optional render(); the host only runs the loop.
// create(ctx, args) -> { mini: game } where game = MINIS[ctx.worldId](ctx, args) = { group, update(dt,t), render?, resize?, setLook?, start?, setQuality?, dispose? }.
import { MINIS } from './mg_index.js';

export default function create(ctx, args) {
  const name = ctx.worldId;
  if (name === 'rhythm') ctx.postRung = 2; // the busking stage stacks a lot of additive glow: 8-bit post avoids half-float overflow (black screen on some GPUs). ?rung=0..3 overrides
  const mini = MINIS[name](ctx, args || {});
  return { mini, profile: 'stage' };
}
