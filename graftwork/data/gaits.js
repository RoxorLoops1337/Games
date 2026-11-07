// GAITS: how each actor walks when it is animated as a PUPPET (ui/puppet.js). No art is needed: the standing sprite is split into a left leg, a right leg and an
// upper body from its own alpha (the analysis finds the hip line and the valley between the legs). Actors without two legs get a body gait instead.
//
//   gait: 'legged'  two legs found in the alpha (the default for anything the analysis can split): a real step cycle, one foot forward then the other
//         'hop'     blobs and swarms: crouch, spring, land and squash
//         'waddle'  jars, bells, many-legged bugs and animals: rock from corner to corner
//         'roll'    gurneys, carts and machines on wheels: a steady glide with wheel lean and a little rattle
//         'flap'    flyers: hover bob with a wing-beat squash
// An entry here WINS over the automatic classification (the alpha analysis only decides actors that have no entry). `tune` entries override the global puppet tune
// (ui/puppet.js TUNE) for that actor, for example { lift: 0.05 }.
// PUPPET_PREF: true = always use the puppet walk, false = keep the painted walk frames (only where the owner has approved the painted cycle). Anything not listed uses
// the puppet walk (default for heroes and every actor, because the painted cycles do not alternate feet). tools/graftwork_art_meta.json carries the same `puppet`
// flags for the art session; tests/graftwork_puppet.test.mjs keeps the two in step.
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
  knitter: { gait: 'legged', split: { hip: 0.83, valley: 0.557 } },
  ward_clerk: { gait: 'legged', split: { hip: 0.84, valley: 0.46 } },
  the_resident: { gait: 'legged', minHip: 0.7 },
  crutchling: { gait: 'waddle' }, // the crutches are part of the leg runs: a limp rock reads better than swinging crutches
};
export const PUPPET_PREF = {
  marrow: true, wick: true, odile: true, crutchling: true, gauze_mummy: true, leech_jar: true, night_nurse: true, orderly: true,
};
export const GAIT_KINDS = ['legged', 'hop', 'waddle', 'roll', 'flap'];
// the id an actor goes by in this table: Level 2 elites share the Level 1 entry
export const gaitKey = (id) => String(id || '').replace(/_l2$/, '');
export const gaitEntry = (id) => GAITS[gaitKey(id)] || null;
// true unless the owner has approved the painted walk of this actor (PUPPET_PREF false)
export const wantsPuppet = (id) => PUPPET_PREF[gaitKey(id)] !== false;
