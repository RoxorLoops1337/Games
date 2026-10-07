'use strict';
// Encore Island — the Town: buildings that upgrade the whole crew, and per-fan training. All numbers live here.
const TOWN = [
  { id: 'cottage', name: 'Cottages', icon: 'home', max: HOUSE_MAX, base: HOUSE0, mul: HOUSE_MUL, need: 0, col: ['#ffa8cf', '#e0488f'], desc: 'More beds for your crew.', eff: (l) => '+' + BEDS_PER_HOUSE * l + ' beds', per: '+4 beds per level' },
  { id: 'shed', name: 'Loot Shed', icon: 'cap', max: 8, base: 4500, mul: 2.55, need: 1, col: ['#8ef0e4', '#1f9a98'], desc: 'Collectors haul more loot per trip.', eff: (l) => '+' + 2 * l + ' carry', per: '+2 carry per level' },
  { id: 'yard', name: 'Rehearsal Studio', icon: 'dmg', max: 10, base: 6500, mul: 2.5, need: 2, col: ['#ff9a8a', '#d8384f'], desc: 'Fighters hit harder.', eff: (l) => '+' + 18 * l + '% fighter damage', per: '+18% damage per level' },
  { id: 'booth', name: 'Sound Booth', icon: 'rate', max: 8, base: 8000, mul: 2.6, need: 3, col: ['#b99cff', '#6a3fd8'], desc: 'Fighters sing faster and reach farther.', eff: (l) => '+' + 7 * l + '% rate · +' + 5 * l + '% range', per: '+7% rate, +5% range per level' },
  { id: 'track', name: 'Tour Bus Depot', icon: 'speed', max: 8, base: 5500, mul: 2.4, need: 2, col: ['#ffe27a', '#e8921e'], desc: 'Your whole crew moves faster.', eff: (l) => '+' + 9 * l + '% crew speed', per: '+9% speed per level' },
  { id: 'merch', name: 'Merch Stand', icon: 'coin', max: 10, base: 9500, mul: 2.7, need: 2, col: ['#ffd94a', '#d89a10'], desc: 'Collectors sell loot for more coins.', eff: (l) => '+' + 7 * l + '% crew sales', per: '+7% sale value per level' },
  { id: 'club', name: 'Fan Club HQ', icon: 'heart', max: 8, base: 14000, mul: 2.8, need: 3, col: ['#ff8fb8', '#c8306a'], desc: 'Every fan you own cheers your hero on.', eff: (l) => '+' + (0.35 * l).toFixed(2).replace(/\.?0+$/, '') + '% hero damage per fan', per: '+0.35% hero damage per fan, per level' },
  { id: 'academy', name: 'Talent Academy', icon: 'star', max: 5, base: 9000, mul: 3.2, need: 2, col: ['#9ec4ff', '#4a6fd8'], desc: 'Raises how far each fan can be trained.', eff: (l) => 'fan max Lv ' + (FAN_LV0 + 2 * l), per: '+2 max fan level per level' },
  { id: 'snack', name: 'Snack Bar', icon: 'gift', max: 8, base: 12000, mul: 2.6, need: 4, col: ['#ffc58a', '#e06a2e'], desc: 'Your crew keeps earning while you are away.', eff: (l) => '+' + 20 * l + '% offline coins', per: '+20% offline coins per level' },
];
const TOWN_BY = {}; for (const b of TOWN) TOWN_BY[b.id] = b;
const FAN_LV0 = 3, FAN_LV_CAP = 13;
const TOWN_TIERS = [['Hamlet', 0], ['Village', 6], ['Town', 14], ['City', 26], ['Metropolis', 42], ['Megacity', 64]];
const FAN_NAMES = ['Kiki', 'Bo', 'Mimi', 'Tux', 'Zed', 'Luna', 'Pip', 'Rex', 'Nova', 'Sunny', 'Miko', 'Dash', 'Echo', 'Fizz', 'Gigi', 'Harper', 'Indy', 'Jules', 'Kai', 'Lola', 'Max', 'Nia', 'Otis', 'Penny', 'Quinn', 'Remy', 'Sky', 'Tori', 'Uma', 'Vic'];
const fanName = (f) => FAN_NAMES[(f.id || 0) % FAN_NAMES.length];

const townLvl = (id) => id === 'cottage' ? S.houses : (S.town[id] || 0);
const townCost = (b) => Math.ceil(b.base * Math.pow(b.mul, townLvl(b.id)));
const townLocked = (b) => S.lands.length < b.need;
function townLevelSum() { let n = 0; for (const b of TOWN) n += townLvl(b.id); return n; }
function townTierIdx() { const n = townLevelSum(); let t = 0; for (let i = 0; i < TOWN_TIERS.length; i++) if (n >= TOWN_TIERS[i][1]) t = i; return t; }
const townTierMul = () => 1 + 0.05 * townTierIdx();
function canTown(b) { return !townLocked(b) && townLvl(b.id) < b.max && S.wallet >= townCost(b); }
function buyTown(id) {
  const b = TOWN_BY[id]; if (!b) return false;
  if (townLocked(b) || townLvl(id) >= b.max || S.wallet < townCost(b)) { sfx('hurt'); return false; }
  const tier0 = townTierIdx(); S.wallet -= townCost(b);
  if (id === 'cottage') S.houses++; else S.town[id] = townLvl(id) + 1;
  sfx('built', true); shake(5); starBurst(STAGE.x, STAGE.y - 30, 16, ['#ffe98a', '#ff9ac8', '#9af0b4'], 260);
  S.toasts.push({ txt: b.name + ' → Lv ' + townLvl(id), t: 0, ic: b.icon });
  const t1 = townTierIdx(); if (t1 > tier0) { S.toasts.push({ txt: 'Your town is now a ' + TOWN_TIERS[t1][0].toUpperCase() + '!  +5% coins', t: 0, ic: 'crown' }); JUICE.flash = 0.5; sfx('levelup', true); }
  return true;
}
// ---- per-fan training ----
const fanMaxLvl = () => Math.min(FAN_LV_CAP, FAN_LV0 + 2 * townLvl('academy'));
const fanTrainCost = (f) => Math.ceil(900 * Math.pow(1.85, f.lvl || 0) * (1 + 0.06 * S.pop.length));
function trainFan(f) {
  if (!f || (f.lvl || 0) >= fanMaxLvl()) { sfx('hurt'); return false; }
  const c = fanTrainCost(f); if (S.wallet < c) { sfx('hurt'); return false; }
  S.wallet -= c; f.lvl = (f.lvl || 0) + 1; f.lvlFlash = 1;
  sfx('levelup', true); starBurst(f.x, f.y - 30, 10, ['#ffe98a', '#9af0b4'], 180); return true;
}
// ---- effects (read by the sim) ----
const fanCarryCap = (f) => PORTER_CAP + 2 * townLvl('shed') + (f.lvl || 0);
const fanDmgOf = (f) => fighterDmg() * (1 + 0.18 * townLvl('yard')) * (1 + 0.10 * (f.lvl || 0));
const fanRateOf = (f) => FIGHTER_RATE / ((1 + 0.07 * townLvl('booth')) * (1 + 0.02 * (f.lvl || 0)));
const fanRangeOf = () => FIGHTER_RANGE * (1 + 0.05 * townLvl('booth'));
const fanSpeed = () => INHAB_SPD * (1 + 0.09 * townLvl('track'));
const merchMul = () => 1 + 0.07 * townLvl('merch');
const clubMul = () => 1 + 0.0035 * townLvl('club') * S.pop.length;
const snackMul = () => 1 + 0.2 * townLvl('snack');
function crewStats() { // headline numbers for the Town screen
  let carry = 0, dps = 0, collectors = 0, fighters = 0;
  for (const f of S.pop) { if (f.role === 'fight') { fighters++; dps += fanDmgOf(f) / fanRateOf(f); } else { collectors++; carry += fanCarryCap(f); } }
  return { carry, dps, collectors, fighters };
}
