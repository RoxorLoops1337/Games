// Plain, short sentences for the level-up cards (display only: nothing here touches the simulation).
// The number comes from the card's own gain (c.gain), so the sentence always matches the stat line under it.
const s = n => (n === 1 ? '' : 's');
const PLAIN = {
  aspd: v => `Shoot ${v}% faster`,
  notes: v => `Shoot ${v} extra note${s(v)} with every shot`,
  burst: v => `Every shot repeats ${v} more time${s(v)}`,
  cdmg: v => `Your notes hit ${v}% harder`,
  power: v => `All your skills hit ${v}% harder`,
  haste: v => `Your skills recharge ${v}% faster`,
  crit: v => `${v}% more chance of a critical hit`,
  vital: v => `The snake walks ${Math.round(v / 4)}% slower`,
  guard: () => 'Pushes the snake back, right now',
  enc: v => `The Encore charges ${v}% faster`,
  dbeat: v => `Notes shot on the beat hit ${v}% harder`,
  speed: v => `Your notes pass through ${v} more cell${s(v)}`,
  fork: v => `Wards shield ${v}% less, lullabies last ${v}% longer`,
  gear: v => `Gold cells stay ${v}% longer and pay ${Math.round(v / 2)}% more`,
  harm: v => `Quartets stay linked ${Math.round(v / 2)}% longer and pay ${v}% more`,
  chk: v => `Popping special cells fills ${v}% of the Encore`,
  cres: v => `Each Quartet in a row: notes hit ${v}% harder (up to 5)`,
  fan: v => `Groove adds ${v}% more damage per point`,
  brg: v => `Bell cells ring ${v}% harder`,
};
export function plainDesc(c) {
  const f = c && PLAIN[c.id];
  if (f && c.gain > 0 && (c.kind === 'capsule' || c.kind === 'passive')) return f(c.gain);
  return (c && c.desc) || '';
}
