// Minigame registry. Each mini game module exports createMini(ctx, opts) -> { group, update(dt,t), render?(), setLook?(look), start?(), dispose?() } and sets camera itself.
// A mini game reports through ctx.events.emit('minigame', { game, result: {...} }) when it ends, and may call ctx.events.emit('minigameQuit').
import { createRhythm } from './mg_rhythm.js';
import { createRun } from './mg_run.js';
import { createTuner } from './mg_tuner.js';
export const MINIS = { rhythm: createRhythm, run: createRun, tuner: createTuner };
