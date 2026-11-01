// Rules text generated from the spec, so a card always shows its REAL numbers (grafts, Overload and Tithe included).
import { STATUSES, CARDS } from '../data/index.js';
import { mult, scaleNum } from './combat.js';

const SRC_NAMES = {
  x: 'X', hand: 'card in hand', energy: 'Energy', block: 'Block', hp: 'HP', missingHp: 'missing HP', drawPile: 'card in draw pile', discard: 'card in discard',
  exhaust: 'exhausted card', plays: 'card played this turn', deck: 'card in your deck', grafts: 'graft in your deck', cardGrafts: 'graft on this card',
  strain: 'Strain', enemies: 'enemy', kills: 'kill this turn', dealt: 'damage dealt', gold: 'gold', junk: 'junk card', attacksInHand: 'Attack in hand',
};
export function srcName(src) {
  if (src.startsWith('st:')) { const [s, w] = src.slice(3).split('@'); return `${STATUSES[s] ? STATUSES[s].name : s} on ${w === 'target' ? 'the target' : 'you'}`; }
  return SRC_NAMES[src] || src;
}
function num(v, m) {
  if (typeof v === 'number') return String(m ? scaleNum(v, m) : v);
  if (!v) return '0';
  const base = v.base || 0;
  const b = m ? scaleNum(base, m) : base;
  const mul = v.mul === undefined ? 1 : v.mul;
  const per = v.per ? `${mul === 1 ? '' : mul + ' '}per ${srcName(v.per)}` : '';
  return v.per ? (b ? `${b} + ${per}` : per) : String(b);
}
// "Deal 4 damage, plus 2 per Charge on you." / "Deal 2 damage per Burn on the target." / "1 per 2 Burn"
function scaled(verb, v, noun, m, tail = '') {
  if (typeof v === 'number' || !v || !v.per) return `${verb} ${num(v, m)}${noun ? ' ' + noun : ''}${tail}.`;
  const mul = v.mul === undefined ? 1 : v.mul;
  const per = mul >= 1 ? `${mul === 1 ? '' : mul + ' '}${noun || ''} per ${srcName(v.per)}` : `1 ${noun || ''} per ${Math.round(1 / mul)} ${srcName(v.per)}`;
  const base = v.base ? (m ? scaleNum(v.base, m) : v.base) : 0;
  return base ? `${verb} ${base}${noun ? ' ' + noun : ''}${tail}, plus ${per.replace(/\s+/g, ' ').trim()}.` : `${verb} ${per.replace(/\s+/g, ' ').trim()}${tail}.`;
}
const sName = (s) => (STATUSES[s] ? STATUSES[s].name : s);
const plural = (n, w) => (n === 1 ? w : w + 's');
const toWord = { all: ' to ALL enemies', random: ' to a random enemy', allEnemies: ' to ALL enemies' };

export function opText(op, m) {
  if (op.t) return op.t;
  const nn = op.n;
  const one = typeof nn === 'number' && nn === 1;
  switch (op.op) {
    case 'dmg': { const h = op.hits ? ` ${num(op.hits)} times` : ''; return scaled('Deal', nn, 'damage', m, h + (toWord[op.to] || '')); }
    case 'block': return scaled('Gain', nn, 'Block', m);
    case 'status': {
      const self = op.to === 'self' || op.to === 'player';
      if (self) return scaled('Gain', nn, sName(op.s), 0);
      return scaled('Apply', nn, sName(op.s), 0, op.to === 'all' ? ' to ALL enemies' : '');
    }
    case 'setStatus': return `Set ${sName(op.s)} to ${num(nn)}.`;
    case 'double': return `Double ${sName(op.s)}${op.to === 'all' ? ' on ALL enemies' : ' on the target'}.`;
    case 'detonate': return `Deal damage equal to ${op.mul && op.mul !== 1 ? op.mul + 'x ' : ''}the target's ${sName(op.s)}, then remove it.`;
    case 'cleanse': return 'Remove all debuffs.';
    case 'draw': return scaled('Draw', nn, plural(one ? 1 : 2, 'card'), 0);
    case 'energy': return scaled('Gain', nn, 'Energy', 0);
    case 'heal': return scaled('Heal', nn, '', 0);
    case 'hp': return scaled('Lose', nn, 'HP', 0);
    case 'maxhp': return `Gain ${num(nn)} Max HP.`;
    case 'gold': return scaled('Gain', nn, 'gold', 0);
    case 'addCard': { const c = CARDS[op.card]; const z = { hand: 'your hand', draw: 'your draw pile', drawTop: 'the top of your draw pile', discard: 'your discard pile' }[op.to || 'discard']; return `Add ${num(nn || 1)} ${c ? c.name : op.card} to ${z}.`; }
    case 'summon': return `Summon ${op.n > 1 ? op.n + ' ' : 'a '}minion.`;
    case 'discard': return `Discard ${num(nn)} ${plural(one ? 1 : 2, 'card')}.`;
    case 'exhaustHand': return op.n === 'all' ? 'Exhaust your hand.' : `Exhaust ${num(nn)} ${plural(one ? 1 : 2, 'card')}.`;
    case 'fetch': return `Return ${num(nn || 1)} card from your ${op.from || 'discard pile'} to your hand.`;
    case 'if': return `${op.ifText || 'If the condition holds'}: ${(op.then || []).map((o) => opText(o, m)).join(' ')}${op.else ? ' Otherwise: ' + op.else.map((o) => opText(o, m)).join(' ') : ''}`;
    case 'repeat': return `${op.fx.map((o) => opText(o, m)).join(' ')} (x${num(nn)})`;
    case 'custom': return op.text || '...';
    default: return '';
  }
}

const FLAG_TEXT = { innate: 'Innate.', retain: 'Retain.', exhaust: 'Exhaust.', ethereal: 'Ethereal.', unplayable: 'Unplayable.' };
// Lines for a card spec (cardSpec(inst)); tithed marks a Tithe in this combat or preview.
export function cardLines(spec, tithed = false) {
  const m = mult(spec, tithed);
  const lines = [];
  if (spec.text) lines.push(spec.text);
  else for (const op of spec.fx) { const t = opText(op, op.op === 'dmg' || op.op === 'block' ? m : 0); if (t) lines.push(t); }
  if (spec.repeat > 0) lines.push(spec.repeat === 1 ? 'Plays twice.' : `Plays ${spec.repeat + 1} times.`);
  if (spec.lifesteal) lines.push('Heal for damage dealt.');
  for (const f of Object.keys(spec.flags)) if (FLAG_TEXT[f] && spec.flags[f]) lines.push(FLAG_TEXT[f]);
  return lines;
}
export function priceLines(spec) {
  const p = spec.price, out = [];
  if (p.selfHurt) out.push(`Lose ${p.selfHurt} HP when played.`);
  if (p.jam) out.push(`${Math.round(p.jam * 100)}% to jam when drawn (+1 cost).`);
  for (const j of p.junk) out.push(`${j.when === 'onPlay' ? 'Playing it adds' : 'Each combat adds'} ${j.n} ${CARDS[j.card] ? CARDS[j.card].name : j.card}.`);
  for (const s of p.selfStatus) out.push(`Gain ${s.n} ${sName(s.s)} when played.`);
  if (p.drawdown) out.push(`Draw ${p.drawdown} fewer next turn.`);
  if (p.gold) out.push(`Costs ${p.gold} gold to play.`);
  return out;
}
export function costText(spec, cost) { return spec.cost === 'X' ? 'X' : String(cost === undefined ? spec.cost : cost); }
export function statusText(id, n) { const d = STATUSES[id]; return d ? d.desc(n || 1) : id; }
