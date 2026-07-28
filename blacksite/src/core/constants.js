// Tuning constants. Metres, seconds, radians.
//
// The movement numbers are deliberately not physical. Real gravity makes a jump
// feel floaty and real friction makes a stop feel like ice, so shooters run a
// heavier gravity with a shorter jump and a very high ground friction. These
// values are in the same family as the Quake-derived tuning most modern shooters
// still use underneath their animation layers.

export const TICK = 1 / 120;          // simulation step
export const MAX_STEPS = 5;           // per rendered frame, before we drop time

export const GRAVITY = -22;
export const JUMP_SPEED = 6.4;        // ~0.93 m apex under the gravity above
export const COYOTE = 0.10;           // grace after walking off a ledge
export const JUMP_BUFFER = 0.12;      // grace for pressing jump before landing

export const SPEED_WALK = 3.1;
export const SPEED_RUN = 5.4;
export const SPEED_SPRINT = 7.2;
export const SPEED_CROUCH = 1.7;
export const SPEED_ADS = 2.2;
export const SPEED_AIR = 1.4;         // air acceleration cap, not a max speed
export const ACCEL_GROUND = 62;
export const ACCEL_AIR = 26;
export const FRICTION = 11;

export const EYE_STAND = 1.62;
export const EYE_CROUCH = 1.05;
export const CAPSULE_R = 0.35;
export const CAPSULE_H = 1.80;
export const STEP_HEIGHT = 0.42;      // stairs and kerbs you climb without jumping
export const MANTLE_MAX = 1.35;       // ledges you can pull yourself over

export const SLIDE_MIN_SPEED = 5.0;
export const SLIDE_TIME = 0.95;
export const SLIDE_FRICTION = 2.6;

export const FOV_BASE = 80;
export const FOV_SPRINT = 86;
export const FOV_ADS_MUL = 0.62;      // multiplied into the base, per-weapon zoom scales it further

export const PLAYER_HP = 100;
export const REGEN_DELAY = 3.2;       // seconds out of combat before health returns
export const REGEN_RATE = 26;         // hp per second once it starts

// Surface ids drive impact FX, decals, footstep timbre and penetration.
export const SURFACE = {
  CONCRETE: 0, METAL: 1, SAND: 2, WOOD: 3, GLASS: 4,
  FLESH: 5, FOLIAGE: 6, WATER: 7, RUBBER: 8,
};

// How much velocity a bullet keeps per centimetre of material crossed, and the
// thickest slab it will still come out the far side of.
export const PENETRATION = {
  [SURFACE.CONCRETE]: { loss: 0.34, maxCm: 14 },
  [SURFACE.METAL]:    { loss: 0.52, maxCm: 6 },
  [SURFACE.SAND]:     { loss: 0.46, maxCm: 20 },
  [SURFACE.WOOD]:     { loss: 0.16, maxCm: 40 },
  [SURFACE.GLASS]:    { loss: 0.04, maxCm: 60 },
  [SURFACE.FLESH]:    { loss: 0.30, maxCm: 30 },
  [SURFACE.FOLIAGE]:  { loss: 0.02, maxCm: 100 },
  [SURFACE.WATER]:    { loss: 0.60, maxCm: 30 },
  [SURFACE.RUBBER]:   { loss: 0.40, maxCm: 12 },
};

// Damage multiplier by hit region. Limbs pay less, heads pay a lot — but not
// enough to make every fight a one-tap, which is why this is 1.9 and not 3.
export const HITBOX = { HEAD: 1.9, CHEST: 1.0, STOMACH: 1.0, ARM: 0.78, LEG: 0.72 };

export const QUALITY = { POTATO: 0, LOW: 1, HIGH: 2, ULTRA: 3 };

export const TEAM = { PLAYER: 0, HOSTILE: 1 };
