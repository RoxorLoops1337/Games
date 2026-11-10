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
// the id an actor goes by in this table: Level 2 elites share the Level 1 entry
export const gaitKey = (id) => String(id || '').replace(/_l2$/, '');
export const gaitEntry = (id) => GAITS[gaitKey(id)] || null;
