// GAITS: how each actor walks. Walking on the map IS the puppet (ui/puppet.js). No art is needed: the standing sprite is split into a left leg, a right leg and an
// upper body from its own alpha (the analysis finds the hip line and the valley between the legs). Actors without two legs get a body gait instead.
//
//   gait: 'legged'  two legs found in the alpha (the default for anything the analysis can split): a real step cycle, one foot forward then the other
//         'hop'     blobs and swarms: crouch, spring, land and squash
//         'waddle'  jars, bells, many-legged bugs and animals: rock from corner to corner
//         'roll'    gurneys, carts and machines on wheels: a steady glide with wheel lean and a little rattle
//         'flap'    flyers: hover bob with a wing-beat squash
// An entry here WINS over the automatic classification (the alpha analysis only decides actors that have no entry). `tune` entries override the global puppet tune
// (ui/puppet.js TUNE) for that actor, for example { lift: 0.05 }. Short forms on the entry: `tuck` (how far the leg part runs up UNDER the garment, figure heights, default
// TUNE.tuck 0.18; the hip pivot sits there, hidden by the cloth), `garment` (sway of the hem band, 0 = rigid cloth, default 1) and `hang` (true/false forces the garment
// detection: a hem band that sways and a crisp hem; the default measures the silhouette just above the hip against the legs below it).
export const GAITS = {
  bedpan_slime: { gait: 'hop' },
  pill_swarm: { gait: 'hop' },
  leech_jar: { gait: 'waddle' },
  the_matron: { gait: 'waddle' },
  surge_tick: { gait: 'waddle' },
  stitch_rat: { gait: 'waddle' },
  suture_wasp: { gait: 'flap' },
  fever_moth: { gait: 'flap' },
  gurney_foot: { gait: 'roll' },
  two_gurneys: { gait: 'roll' },
  defibrillator: { gait: 'roll' },
  iron_lung: { gait: 'roll' },
  // legs that touch in the silhouette: the split is set by hand (fractions of the image)
  candy_striper: { gait: 'legged', split: { hip: 0.73, valley: 0.49 } },
  orderly: { gait: 'legged', tuck: 0.1 }, // long trouser legs under a narrow coat: a short tuck keeps the hidden part from showing beside the coat
  knitter: { gait: 'legged', split: { hip: 0.83, valley: 0.557 }, tuck: 0.12 }, // only the boots show under the long skirt
  ward_clerk: { gait: 'legged', split: { hip: 0.84, valley: 0.46 }, tuck: 0.12 },
  the_resident: { gait: 'legged', minHip: 0.76, tuck: 0.08 }, // a tattered coat hem: gaps in it would show a longer hidden part
  crutchling: { gait: 'waddle' }, // the crutches are part of the leg runs: a limp rock reads better than swinging crutches
};
export const GAIT_KINDS = ['legged', 'hop', 'waddle', 'roll', 'flap'];
// RIG FEEL: how a character with a painted rig carries itself (ui/rig.js, the preview). Multipliers on the rig tune (RIG_TUNE), in the puppet's own words:
//   strideK step length, duty (added to the share of the cycle a foot stays planted), lift, bob, sway, lean, arms (arm swing), hem (cloth sway), head (nod).
// Stride and speed always agree (the step phase follows the distance walked), so a shorter step is a quicker step. The puppet never reads this table.
export const RIG_GAITS = {
  marrow: { strideK: 1, duty: 0.04, lift: 0.85, bob: 1.5, sway: 1.4, lean: 1.5, arms: 0.8, head: 1.3 }, // heavy: a long stance, a deep drop on every plant, the weight forward
  wick: { strideK: 0.88, duty: -0.03, lift: 1.2, bob: 0.9, sway: 0.8, lean: 0.7, arms: 1.1, hem: 1.2 }, // light and quick: short quick steps, feet picked up
  odile: { strideK: 0.92, duty: 0.05, lift: 0.6, bob: 0.4, sway: 0.5, lean: 0.25, arms: 0.6, hem: 0.8, head: 0.4 }, // gliding and upright: low feet, hardly a bob, a straight back
};
export const rigGait = (id) => RIG_GAITS[gaitKey(id)] || null;
// the id an actor goes by in this table: Level 2 elites share the Level 1 entry
export const gaitKey = (id) => String(id || '').replace(/_l2$/, '');
export const gaitEntry = (id) => GAITS[gaitKey(id)] || null;
