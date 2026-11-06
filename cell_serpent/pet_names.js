// Cell Serpent round 7: pet nicknames. save.petNames = { petId: 'Biscuit' } (sanitized in sim.js, old saves have none).
export const NICK_MAX = 10;
export const cleanNick = v => String(v == null ? '' : v).replace(/[^\w \-!+&.]/g, '').trim().slice(0, NICK_MAX);
// cute ideas for the dice button, per pet
export const NICK_IDEAS = {
  kitten: ['Biscuit', 'Mochi', 'Tofu', 'Pixel', 'Miso'],
  puppy: ['Bongo', 'Waffles', 'Scout', 'Beans', 'Ziggy'],
  piglet: ['Truffle', 'Pudding', 'Oink', 'Noodle', 'Peaches'],
  lamb: ['Cloud', 'Fluff', 'Marsh', 'Daisy', 'Nimbus'],
  hamster: ['Peanut', 'Pip', 'Turbo', 'Nacho', 'Squeak'],
  turtle: ['Shelly', 'Zen', 'Pebble', 'Mellow', 'Tango'],
};
export const petNick = (save, id) => (save.petNames && cleanNick(save.petNames[id])) || '';
export const petLabel = (save, p) => petNick(save, p.id) || p.name;
export function setPetNick(save, id, v) {
  const n = cleanNick(v); if (!save.petNames) save.petNames = {};
  if (n) save.petNames[id] = n; else delete save.petNames[id];
  return true;
}
// the next idea after the current name (wraps), never the pet's own current nickname
export function nextIdea(save, id) {
  const list = NICK_IDEAS[id] || ['Buddy'], cur = petNick(save, id), i = list.indexOf(cur);
  return list[(i + 1) % list.length];
}
