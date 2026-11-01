// Stacking Cats: RELICS. An item is worn by one cat (ITEMS in cats.js). A relic is different: it belongs to the whole run, it is not worn by
// anyone, and it rewards a way of building. Some care about a kind of cat (lightning, fire, guardians...), some about the place in the tower
// (the top cat, the bottom cat, the cats in the middle), some about the start of every wave. Nest rewards offer them (pick one of three) and
// the Shady Deal sells them with a price.
//
// How a relic is described (the sim reads these, relics.js has no logic of its own):
//   tagFx:  { tag, fx }      cats that have the synergy tag get these per-cat effects (the FX_KEYS in sim.js, e.g. extra, haste, stun, burn)
//   posFx:  { pos, fx }      the cat at pos ('top', 'bottom', 'mid') gets them. The tower is read from the bottom (the cat that gets bitten first)
//   allFx:  fx               every cat gets them
//   team:   { stat: v }      a plain team stat (dmg haste hp dr crit critMul range curse waveHeal snackMul coin)
//   scale:  { tag, key, per, max }   a team stat that grows with the number of living cats of a kind in the tower
//   variety: v               team damage for every different kind of cat in the tower (up to 8)
//   matching: v              damage for cats that share their kind with another cat in the tower
//   rule:   { name: v }      a rule the sim checks at one spot: burnVuln stunVuln firstHit firstKill freshCrit burnBoom early
//   cost:   { stat: v }      (Shady relics only) the price: a negative team stat, or hurt = mice bite that much harder
export const RELIC_THEMES = {
  storm: 'Lightning', fire: 'Fire', gun: 'Guns', blade: 'Blades', magic: 'Magic', guardian: 'Guardians', tech: 'Tech', cheer: 'Cheer',
  top: 'Top cat', bottom: 'Bottom cat', mid: 'Middle cats', first: 'Start of a wave', team: 'Whole team', shady: 'Shady deal',
};
// which synergy tag a theme listens to (the others are about the tower, not about a kind of cat)
export const THEME_TAG = { storm: 'storm', fire: 'fire', gun: 'gun', blade: 'blade', magic: 'magic', guardian: 'guardian', tech: 'tech', cheer: 'cheer' };

export const RELICS = [
  // ---- lightning
  { id: 'rod', name: 'Lightning Rod', icon: '⚡', theme: 'storm', rarity: 'rare', desc: 'Every Lightning cat gets 1 extra: a longer chain, another bolt or a bigger blast.', tagFx: { tag: 'storm', fx: { extra: 1 } } },
  { id: 'thunder', name: 'Thunder Drum', icon: '\u{1F941}', theme: 'storm', rarity: 'rare', desc: 'Lightning cats attack 25% faster, and their hits can stun mice.', tagFx: { tag: 'storm', fx: { haste: 0.25, stun: 0.25 } } },
  { id: 'cloak', name: 'Static Cloak', icon: '\u{1F9E5}', theme: 'storm', rarity: 'epic', desc: 'Stunned mice take 35% more damage from every cat.', rule: { stunVuln: 0.35 } },
  // ---- fire
  { id: 'kindle', name: 'Kindling', icon: '\u{1F525}', theme: 'fire', rarity: 'epic', desc: 'Every cat can set mice on fire when it hits them.', allFx: { burn: 1 } },
  { id: 'scorch', name: 'Scorched Earth', icon: '♨', theme: 'fire', rarity: 'epic', desc: 'Burning mice take 15% more damage from every cat.', rule: { burnVuln: 0.15 } },
  { id: 'cinder', name: 'Cinder Bomb', icon: '\u{1F9E8}', theme: 'fire', rarity: 'rare', desc: 'Burning mice explode when they die and hurt the mice next to them.', rule: { burnBoom: 0.1 } },
  { id: 'heart', name: 'Ember Heart', icon: '❤', theme: 'fire', rarity: 'rare', desc: 'Fire cats deal 15% more damage.', tagFx: { tag: 'fire', fx: { dmg: 0.15 } } },
  // ---- guardians and armor
  { id: 'bulwark', name: 'Bulwark Banner', icon: '\u{1F6E1}', theme: 'bottom', rarity: 'rare', desc: 'The bottom cat takes 25% less damage.', posFx: { pos: 'bottom', fx: { dr: 0.25 } } },
  { id: 'anchor', name: 'Anchor Stone', icon: '\u{1FAA8}', theme: 'bottom', rarity: 'rare', desc: 'The bottom cat has 40% more health.', posFx: { pos: 'bottom', fx: { hp: 0.4 } } },
  { id: 'thorn', name: 'Thorn Mail', icon: '\u{1F9F1}', theme: 'bottom', rarity: 'rare', desc: 'A mouse that bites the bottom cat is hurt back for 80% of its bite.', posFx: { pos: 'bottom', fx: { thorns: 0.8 } } },
  { id: 'oath', name: 'Shield Oath', icon: '\u{1F9FF}', theme: 'team', rarity: 'epic', desc: 'Every cat starts each wave with a shield worth 10% of its health.', allFx: { shield: 0.1 } },
  { id: 'wall', name: 'Guardian Wall', icon: '\u{1F6E1}', theme: 'guardian', rarity: 'rare', desc: 'Guardian cats have 20% more health and take 15% less damage.', tagFx: { tag: 'guardian', fx: { hp: 0.2, dr: 0.15 } } },
  // ---- the place in the tower
  { id: 'peak', name: 'Crown of the Peak', icon: '\u{1F531}', theme: 'top', rarity: 'epic', desc: 'The top cat deals 30% more damage.', posFx: { pos: 'top', fx: { dmg: 0.3 } } },
  { id: 'perch', name: "Sniper's Perch", icon: '\u{1FAB6}', theme: 'top', rarity: 'rare', desc: 'The top cat attacks 15% faster and reaches 10% farther.', posFx: { pos: 'top', fx: { haste: 0.15, range: 0.1 } } },
  { id: 'medal', name: 'Middle Medal', icon: '\u{1F3C5}', theme: 'mid', rarity: 'rare', desc: 'Cats between the top and the bottom deal 30% more damage and attack 15% faster.', posFx: { pos: 'mid', fx: { dmg: 0.3, haste: 0.15 } } },
  // ---- the start of every wave
  { id: 'bell', name: 'Opening Bell', icon: '\u{1F514}', theme: 'first', rarity: 'epic', desc: 'The first hit your team lands in each wave does 3 times damage.', rule: { firstHit: 2 } },
  { id: 'cookie', name: 'First Treat', icon: '\u{1F36A}', theme: 'first', rarity: 'rare', desc: 'The first mouse you defeat in each wave gives 4 times the coins and heals the team 4%.', rule: { firstKill: 1 } },
  { id: 'claws', name: 'Fresh Claws', icon: '\u{1F43E}', theme: 'first', rarity: 'rare', desc: 'The first attack of every cat in each wave is a critical hit.', rule: { freshCrit: 1 } },
  { id: 'bird', name: 'Early Bird', icon: '\u{1F54A}', theme: 'first', rarity: 'rare', desc: 'In the first 10 seconds of each wave, every cat attacks 35% faster.', rule: { early: 1 } },
  // ---- one kind of cat
  { id: 'quiver', name: "Sharpshooter's Quiver", icon: '\u{1F3AF}', theme: 'gun', rarity: 'rare', desc: 'Gun cats shoot 1 extra shot with every attack.', tagFx: { tag: 'gun', fx: { extra: 1 } } },
  { id: 'stone', name: 'Whetstone', icon: '\u{1F5E1}', theme: 'blade', rarity: 'rare', desc: 'Blade cats hit 1 more mouse with every swing and get 15% more crit chance.', tagFx: { tag: 'blade', fx: { extra: 1, crit: 0.15 } } },
  { id: 'lens', name: 'Arcane Lens', icon: '\u{1F52E}', theme: 'magic', rarity: 'rare', desc: 'Magic cats reach 30% farther and charge their special moves 40% faster.', tagFx: { tag: 'magic', fx: { range: 0.3, spc: 0.4 } } },
  { id: 'parts', name: 'Spare Parts', icon: '⚙', theme: 'tech', rarity: 'rare', desc: 'The whole team deals 8% more damage for each Tech cat in the tower (up to 3 cats).', scale: { tag: 'tech', key: 'dmg', per: 0.08, max: 3 } },
  { id: 'pennant', name: 'Cheer Pennant', icon: '\u{1F3B5}', theme: 'cheer', rarity: 'rare', desc: 'The whole team heals 1% of its health every second for each Cheer cat in the tower (up to 3 cats).', scale: { tag: 'cheer', key: 'regenTeam', per: 0.01, max: 3 } },
  // ---- the whole tower
  { id: 'badge', name: "Collector's Badge", icon: '\u{1F380}', theme: 'team', rarity: 'epic', desc: 'The whole team deals 3% more damage for every different kind of cat in the tower (up to 8 kinds).', variety: 0.03 },
  { id: 'scarf', name: 'Matching Scarves', icon: '\u{1F9E3}', theme: 'team', rarity: 'rare', desc: 'A cat that shares its kind with another cat in the tower deals 15% more damage.', matching: 0.15 },
  { id: 'flag', name: 'Last Stand Flag', icon: '\u{1FAA7}', theme: 'team', rarity: 'rare', desc: 'A cat with less than half of its health hits 50% harder.', allFx: { berserk: 0.5 } },
];

// Shady relics: only the Shady Deal sells them. A big boon for the whole team and a price that bites for the whole run.
// The boon is always worth a bit more than the price (a test checks it), so a deal is a choice, never a trap.
export const SHADY_RELICS = [
  { id: 'fang',     icon: '\u{1F9B7}', name: "Rat King's Fang",    theme: 'shady', rarity: 'rare', team: { dmg: 0.28 },                cost: { hp: -0.18 } },
  { id: 'pact',     icon: '\u{1F480}', name: 'Berserker Pact',     theme: 'shady', rarity: 'rare', team: { haste: 0.22 },              cost: { hurt: 0.10 } },
  { id: 'tooth',    icon: '\u{1FA99}', name: 'Golden Tooth',       theme: 'shady', rarity: 'rare', team: { coin: 0.30 },               cost: { hurt: 0.07 } },
  { id: 'appetite', icon: '\u{1F357}', name: 'Bottomless Appetite', theme: 'shady', rarity: 'rare', team: { snackMul: 0.5 },           cost: { coin: -0.2 } },
  { id: 'moon',     icon: '\u{1F319}', name: 'Moonlit Bargain',    theme: 'shady', rarity: 'rare', team: { crit: 0.12, critMul: 0.4 }, cost: { hp: -0.12 } },
  { id: 'tin',      icon: '\u{1F451}', name: 'Tin Crown',          theme: 'shady', rarity: 'rare', team: { curse: 0.18 },              cost: { hurt: 0.10 } },
  { id: 'iron',     icon: '\u{1F512}', name: 'Iron Contract',      theme: 'shady', rarity: 'rare', team: { dr: 0.12 },                 cost: { haste: -0.12 } },
  { id: 'locket',   icon: '\u{1F496}', name: 'Healing Bargain',    theme: 'shady', rarity: 'rare', team: { waveHeal: 0.10 },           cost: { dmg: -0.08 } },
  { id: 'spyglass', icon: '\u{1F52D}', name: 'Spyglass Deal',      theme: 'shady', rarity: 'rare', team: { range: 0.20 },              cost: { hp: -0.10 } },
];
export const ALL_RELICS = [...RELICS, ...SHADY_RELICS];
export const RELIC_BY_ID = Object.fromEntries(ALL_RELICS.map((r) => [r.id, r]));
export const NEST_RELIC_EVERY = 3;       // a relic pick after every 2nd nest, starting with the first (waves 5, 15, 25, ...)
export const DEAL_CATCH = 0.08;          // the price of a thematic relic bought in a Shady Deal: mice bite 8% harder for the whole run
export const EARLY_BIRD = { t: 10, haste: 0.35 };
export const FIRST_KILL = { coins: 4, heal: 0.04 };

const WORDS = {
  dmg: 'damage', haste: 'attack speed', hp: 'health', crit: 'crit chance', critMul: 'crit damage', dr: 'less damage taken', curse: 'extra damage to mice',
  waveHeal: 'healing after each wave', snackMul: 'snack strength', coin: 'coins', range: 'range',
};
const pct = (v) => Math.round(Math.abs(v) * 100);
// the lines a card shows, built from the numbers so text and effect can never drift apart: { boon: [...], cost: [...] }
export function relicLines(r) {
  const line = (k, v) => `${v < 0 ? '-' : '+'}${pct(v)}% ${WORDS[k]}`;
  if (!r.team) return { boon: [r.desc], cost: [] };
  return {
    boon: Object.entries(r.team).map(([k, v]) => line(k, v)),
    cost: Object.entries(r.cost || {}).map(([k, v]) => (k === 'hurt' ? `Mice bite ${pct(v)}% harder` : line(k, v))),
  };
}
