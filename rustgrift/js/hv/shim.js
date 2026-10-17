'use strict';
// Minimal DATA stand-in for the Hocus Vocus art stack (util.js, art.js, art_cast_kit.js, art_cast.js are
// copied unchanged from the Hocus Vocus game in this repo; only the pieces they read at load time are declared).
const DATA = {
  LISTS: { fx: [], sizeHeight: { s: 120, m: 170, l: 230, xl: 290 }, poses: ['idle', 'attack', 'cast', 'hurt', 'block', 'down', 'cheer', 'walk'], heroIds: ['hanae', 'kuro', 'suzu', 'raiga'] },
  heroes: {}, enemies: {}, rosterById: {}, cards: {}
};
