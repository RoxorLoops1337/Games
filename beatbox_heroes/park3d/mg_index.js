// Minigame registry. Each mini game module exports createMini(ctx, opts) -> { group, update(dt,t), render?(), setLook?(look), start?(), dispose?() } and sets camera itself.
// A mini game reports through ctx.events.emit('minigame', { game, result: {...} }) when it ends, and may call ctx.events.emit('minigameQuit').
import { createRhythm } from './mg_rhythm.js';
import { createRun } from './mg_run.js';
import { createTuner } from './mg_tuner.js';
import { createEar } from './mg_ear.js';
export const MINIS = { rhythm: createRhythm, run: createRun, tuner: createTuner, ear: createEar };
// rhythm in the real game (r3/scenes_rhythm.js) takes opts.game, mode, kind, venue, theme, offsetMs, resolveBattle, onContinue ... : see the header of mg_rhythm.js. Venues dress the stage (INT-B venue.js).
export const RHYTHM_VENUES = ['busk', 'bar', 'showcase', 'booth', 'arena'];
import { createPose } from './mg_pose.js'; MINIS.pose = createPose;   // POSE: showmanship (pose Simon Says), r3/scenes_pose.js. The host world id 'pose' is registered at runtime by scenes_pose.js until worlds.js lists it
