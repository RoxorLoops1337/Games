// Beatbox unit definitions: stats, palettes, hand-drawn pixel sprites.
// Sprites are 14x16 char grids. Char meaning:
//   '.'  transparent
//   'O'  outline (dark)
//   'B'  body main
//   'b'  body shadow
//   'H'  highlight / face
//   'S'  skin shadow
//   'E'  eye
//   'M'  mouth
//   'A'  accent
//   'a'  accent shadow
//   'W'  white
window.Decktest = window.Decktest || {};

(function () {
  // ---- sprites -------------------------------------------------------------

  const KICK_SPRITE = [
    "....OOOOOO....",
    "..OOBBBBBBOO..",
    ".OBHHBBBBHHBO.",
    "OBHHHBBBBHHHBO",
    "OBHEEBBBBEEHBO",
    "OBHEEBBBBEEHBO",
    "OBBBBBMMBBBBBO",
    "OBBAAAAAAAABBO",
    "OBBAaaaaaaABBO",
    "OBBAAAAAAAABBO",
    "OBBBBBBBBBBBBO",
    ".OBBbbbbbbBBO.",
    "..OObbbbbbOO..",
    "....OOOOOO....",
    "....OO..OO....",
    "....OO..OO....",
  ];

  const SNARE_SPRITE = [
    ".OOOOOOOOOOOO.",
    "OBBBHHBBHHBBBO",
    "OBHHEEBBEEHHBO",
    "OBHHEEBBEEHHBO",
    "OBBBBBMMBBBBBO",
    "OAAAAAAAAAAAAO",
    "OBWBWBWBWBWBBO",
    "OAAAAAAAAAAAAO",
    "OBBBBBBBBBBBBO",
    "OAAAAAAAAAAAAO",
    "OBWBWBWBWBWBBO",
    "OBBbbbbbbbbBBO",
    ".OOOOOOOOOOOO.",
    "....OO..OO....",
    "....OO..OO....",
    "..............",
  ];

  const HIHAT_SPRITE = [
    "....AAAAAAAA..",
    "...AaaaaaaaA..",
    "....AAAAAAAA..",
    "......OO......",
    "...AAAAAAAAAA.",
    "..AaaaaaaaaaA.",
    "...AAAAAAAAAA.",
    "......OO......",
    ".....HHHHHH...",
    "....HEEHHEEH..",
    "....HEEHHEEH..",
    "....HHMMMMHH..",
    ".....HHHHHH...",
    ".....BBBBBB...",
    "....BBBBBBBB..",
    "....OOO..OOO..",
  ];

  const VOCAL_SPRITE = [
    "......AAAA....",
    ".....AaaaaA...",
    ".....AaaaaA...",
    "......AAAA....",
    ".......OO.....",
    ".......OO.....",
    "....HHHHHHHH..",
    "...HEEHHHHEEH.",
    "...HEEHHHHEEH.",
    "...HHHHMMHHHH.",
    "....HHHHHHHH..",
    "....BBBBBBBB..",
    "...BBBAAAABBB.",
    "...BBBAAAABBB.",
    "....BBBBBBBB..",
    "....OO....OO..",
  ];

  // ---- palettes -----------------------------------------------------------
  // Each palette maps the chars above to a hex color.

  const PAL_KICK = {
    O: '#1a0606', B: '#e74c3c', b: '#7f1d1d', H: '#fde2cf',
    E: '#1a0606', M: '#1a0606', A: '#fde047', a: '#a16207', W: '#ffffff',
  };
  const PAL_SNARE = {
    O: '#231a06', B: '#f5c518', b: '#7a5a00', H: '#fff7c2',
    E: '#231a06', M: '#231a06', A: '#dc2626', a: '#7f1d1d', W: '#ffffff',
  };
  const PAL_HIHAT = {
    O: '#031628', B: '#38bdf8', b: '#0c4a6e', H: '#e0f2fe',
    E: '#031628', M: '#031628', A: '#facc15', a: '#a16207', W: '#ffffff',
  };
  const PAL_VOCAL = {
    O: '#1a0628', B: '#c084fc', b: '#581c87', H: '#f3e8ff',
    E: '#1a0628', M: '#1a0628', A: '#f472b6', a: '#9d174d', W: '#ffffff',
  };

  // Enemy palettes: same sprites recolored to look like rivals.
  const PAL_KICK_FOE  = { ...PAL_KICK,  B: '#a3a3a3', b: '#404040', A: '#737373', a: '#262626' };
  const PAL_SNARE_FOE = { ...PAL_SNARE, B: '#9ca3af', b: '#374151', A: '#4b5563', a: '#1f2937' };
  const PAL_HIHAT_FOE = { ...PAL_HIHAT, B: '#94a3b8', b: '#334155', A: '#cbd5e1', a: '#475569' };
  const PAL_VOCAL_FOE = { ...PAL_VOCAL, B: '#71717a', b: '#27272a', A: '#a1a1aa', a: '#3f3f46' };

  // ---- unit definitions ---------------------------------------------------

  const UNIT_DEFS = {
    kick: {
      id: 'kick',
      name: 'Kick',
      role: 'Tank',
      tier: 1,
      cost: 3,
      hp: 26,
      atk: 4,
      atkSpeed: 0.9,        // attacks per second
      range: 1,             // tiles
      moveSpeed: 1.6,       // tiles per second
      sprite: KICK_SPRITE,
      palette: PAL_KICK,
      foePalette: PAL_KICK_FOE,
      blurb: 'Boom. Boom. Boom.',
    },
    snare: {
      id: 'snare',
      name: 'Snare',
      role: 'Bruiser',
      tier: 1,
      cost: 3,
      hp: 14,
      atk: 6,
      atkSpeed: 1.2,
      range: 1,
      moveSpeed: 2.0,
      sprite: SNARE_SPRITE,
      palette: PAL_SNARE,
      foePalette: PAL_SNARE_FOE,
      blurb: 'Crisp hits, sharp edges.',
    },
    hihat: {
      id: 'hihat',
      name: 'Hi-Hat',
      role: 'Skirmisher',
      tier: 1,
      cost: 2,
      hp: 8,
      atk: 2,
      atkSpeed: 2.6,
      range: 1,
      moveSpeed: 3.2,
      sprite: HIHAT_SPRITE,
      palette: PAL_HIHAT,
      foePalette: PAL_HIHAT_FOE,
      blurb: 'Tsst-tsst-tsst.',
    },
    vocal: {
      id: 'vocal',
      name: 'Vocal',
      role: 'Healer',
      tier: 1,
      cost: 4,
      hp: 11,
      atk: 2,
      atkSpeed: 0.9,
      range: 3,
      moveSpeed: 1.7,
      heal: 4,
      healCooldown: 2.4,
      sprite: VOCAL_SPRITE,
      palette: PAL_VOCAL,
      foePalette: PAL_VOCAL_FOE,
      blurb: 'Hits the high note.',
    },
  };

  // Spawn a live unit instance from a definition.
  function spawn(defId, team, col, row) {
    const def = UNIT_DEFS[defId];
    if (!def) throw new Error('Unknown unit: ' + defId);
    return {
      def,
      team,                 // 'player' or 'foe'
      col, row,             // logical grid position
      x: col, y: row,       // continuous position (for movement interp)
      hp: def.hp,
      maxHp: def.hp,
      atkCd: 0,             // attack cooldown timer
      healCd: def.healCooldown || 0,
      target: null,
      flashTimer: 0,        // visual: hit flash
      bobPhase: Math.random() * Math.PI * 2,
      attackAnim: 0,        // 0..1 progress for attack lunge
    };
  }

  Decktest.units = { UNIT_DEFS, spawn };
})();
