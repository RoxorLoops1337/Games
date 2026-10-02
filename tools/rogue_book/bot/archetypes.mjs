// Inkwoven balance bot: archetype classifier. CONTENT_SPEC section 3 names three archetypes per hero; the data has no archetype
// field, so cards are classified from their effect tags (resources produced or spent, statuses applied, hooks). A card can fit more
// than one; the strongest signal wins, ties go to the first archetype listed. Used by the report ("archetype usage") only: the draft
// itself prices cards by synergy, it does not commit to a label.
import { isNum } from './game.mjs';

export const ARCHETYPES = {
  hanae: ['bloom', 'flurry', 'riposte'],
  kuro: ['blight', 'sumi', 'scribe'],
  suzu: ['sanctuary', 'thorns', 'talisman'],
  raiga: ['storm', 'retaliation', 'brawler'],
};

const has = (o, k) => !!(o && o[k]);
const sum = (o, keys) => keys.reduce((s, k) => s + (o && o[k] ? 1 : 0), 0);

export function archetypeOf(DATA, V, cardId) {
  const d = DATA.cards[cardId];
  if (!d || !ARCHETYPES[d.hero]) return null;
  const res = DATA.resolveCard({ uid: 0, id: cardId, up: 0, gems: [] });
  const tg = V.tags(res);
  const hookOn = (on) => (res.fx || []).some((o) => o.op === 'hook' && o.on === on);
  const sc = {};
  switch (d.hero) {
    case 'hanae':
      sc.bloom = (has(tg.produces, 'bloom') ? 2 : 0) + (has(tg.consumes, 'bloom') ? 3 : 0) + (has(tg.payoff, 'bloom') ? 2 : 0);
      sc.flurry = (tg.hits >= 2 ? 2.5 : 0) + (has(tg.applies, 'might') ? 2.5 : 0) + (has(tg.payoff, 'cardsPlayed') ? 3 : 0) + (isNum(d.cost) && d.cost === 0 && tg.attack ? 1.5 : 0) + (tg.x ? 1 : 0);
      sc.riposte = (has(tg.payoff, 'block') ? 3 : 0) + (has(tg.applies, 'dodge') ? 3 : 0) + (has(tg.payoff, 'hurt') ? 3 : 0) + (hookOn('onDamaged') ? 3 : 0) + (tg.block > 0 && tg.dmg > 0 ? 1.5 : 0) + (tg.block > 0 ? 0.6 : 0);
      break;
    case 'kuro':
      sc.blight = (has(tg.applies, 'poison') ? 3 : 0) + (has(tg.applies, 'burn') ? 3 : 0) + (has(tg.payoff, 'poison') ? 3 : 0) + (has(tg.payoff, 'burn') ? 3 : 0) + (has(tg.payoff, 'debuffs') ? 1.5 : 0);
      sc.sumi = (has(tg.produces, 'sumi') ? 2.2 : 0) + (has(tg.consumes, 'sumi') ? 3 : 0) + (has(tg.payoff, 'sumi') ? 2.2 : 0);
      sc.scribe = (tg.draw > 0 ? 2 : 0) + (tg.energy > 0 ? 2.5 : 0) + (tg.pick ? 2 : 0) + (tg.exhaust ? 1 : 0) + (tg.swap ? 1.5 : 0) + ((d.kw || []).indexOf('retain') >= 0 ? 1.5 : 0);
      break;
    case 'suzu':
      sc.sanctuary = (tg.heal > 0 ? 2.5 : 0) + (has(tg.produces, 'ward') ? 2 : 0) + (has(tg.consumes, 'ward') ? 2 : 0) + (tg.block > 0 ? 1.5 : 0) + (has(tg.applies, 'regen') ? 2 : 0) + ((res.fx || []).some((o) => o.op === 'revive' || (o.op === 'hook' && (o.fx || []).some((f) => f.op === 'revive'))) ? 3 : 0);
      sc.thorns = (has(tg.applies, 'thorns') ? 3 : 0) + (has(tg.applies, 'taunt') ? 2.5 : 0) + (has(tg.payoff, 'thorns') ? 3 : 0);
      sc.talisman = (has(tg.applies, 'weak') ? 2.5 : 0) + (has(tg.applies, 'vulnerable') ? 2.5 : 0) + (has(tg.applies, 'mark') ? 2.5 : 0) + (has(tg.applies, 'stun') ? 3 : 0) + (has(tg.applies, 'frail') ? 1.5 : 0) + (has(tg.payoff, 'debuffs') ? 3 : 0);
      break;
    case 'raiga':
      sc.storm = (has(tg.produces, 'charge') ? 2 : 0) + (has(tg.consumes, 'charge') ? 3 : 0) + (has(tg.payoff, 'charge') ? 2.5 : 0) + (tg.aoe ? 1.5 : 0);
      sc.retaliation = (has(tg.applies, 'thorns') ? 3 : 0) + (has(tg.payoff, 'hurt') ? 3 : 0) + (hookOn('onDamaged') ? 3 : 0) + (has(tg.applies, 'taunt') ? 1.5 : 0) + (tg.selfHurt > 0 ? 1.5 : 0);
      sc.brawler = (has(tg.applies, 'stun') ? 3 : 0) + (has(tg.applies, 'burn') ? 2.5 : 0) + (tg.dmg >= 14 && !tg.aoe ? 2 : 0) + (has(tg.applies, 'might') ? 1.5 : 0) + (has(tg.payoff, 'burn') ? 2 : 0);
      break;
    default: break;
  }
  const names = ARCHETYPES[d.hero];
  let best = null;
  names.forEach((n) => { if (sc[n] > 0 && (!best || sc[n] > sc[best])) best = n; });
  void sum;
  return best;
}

// archetype of a final deck: counts per archetype for each hero, and the dominant label ('mixed' when there is no clear lead)
export function deckArchetypes(DATA, V, deckIds, cache) {
  const counts = {};
  deckIds.forEach((raw) => {
    const id = raw.replace(/\+$/, '');
    if (!cache.has(id)) cache.set(id, archetypeOf(DATA, V, id));
    const a = cache.get(id);
    const d = DATA.cards[id];
    if (!a || !d) return;
    const k = d.hero + ':' + a;
    counts[k] = (counts[k] || 0) + 1;
  });
  const heroes = {};
  Object.keys(counts).forEach((k) => { const [h, a] = k.split(':'); (heroes[h] = heroes[h] || []).push([a, counts[k]]); });
  const dom = {};
  Object.keys(heroes).forEach((h) => {
    const arr = heroes[h].sort((x, y) => y[1] - x[1]);
    const total = arr.reduce((s, x) => s + x[1], 0);
    dom[h] = arr[0][1] >= 4 && arr[0][1] >= 0.38 * total && (arr.length < 2 || arr[0][1] >= arr[1][1] + 1) ? arr[0][0] : 'mixed';
  });
  return { counts, dom };
}
