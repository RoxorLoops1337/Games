// Intent icons per move effect (pure, no DOM). intentIcons(mv, info, o) -> up to 3 icon entries [{ k, hits?, heavy? }]
// in a fixed priority order (attack, defend, debuff, buff, heal, summon, junk, special) so two different moves never share one bare sword:
//   attack  single hit            multi  several hits (the plate also shows "xN")     sweep  hits all of you / every target
//   heavy   one big hit (red ring)          defend  Block        debuff / poison  a status lands on you      buff  a status on itself or allies
//   heal  heals itself          summon  calls help          junk  clogs your deck       special  a custom effect with no clearer kind
// `info` is the intentOf result (kinds, dmg, hits, per); a move with an explicit `intent` keeps those kinds, mapped one to one.
const ORDER = ['attack', 'defend', 'debuff', 'buff', 'heal', 'summon', 'junk', 'special'];
const HEAVY_MIN = 15; // a single hit this big (or a fifth of max HP) gets the heavy sword

export function intentIcons(mv, info, o = {}) {
  const maxHp = o.maxHp || 0;
  if (!mv || !info) return [{ k: 'unknown' }];
  if (info.hidden) return [{ k: 'unknown' }];
  const has = new Set(); let all = false, poison = false;
  const walk = (ops, mul) => {
    for (const op of ops || []) {
      if (!op) continue;
      switch (op.op) {
        case 'dmg': has.add('attack'); if (op.to === 'all') all = true; break;
        case 'block': has.add('defend'); break;
        case 'status': if (['self', 'allies'].includes(op.to)) has.add('buff'); else { has.add('debuff'); if (op.s === 'poison') poison = true; } break;
        case 'heal': has.add('heal'); break;
        case 'summon': has.add('summon'); break;
        case 'addCard': has.add('junk'); break;
        case 'cleanse': has.add('buff'); break;
        case 'custom': if (op.intent) for (const k of [].concat(op.intent)) has.add(k); else if (!op.intentDmg) has.add('special'); break;
        case 'if': walk(op.then, mul); walk(op.else, mul); break;
        case 'repeat': walk(op.fx, mul); break;
        default: break;
      }
    }
  };
  if (mv.intent) { for (const k of [].concat(mv.intent)) has.add(k); } else walk(mv.fx, 1);
  for (const k of info.kinds || []) if (k !== 'unknown') has.add(k); // custom intentDmg adds 'attack' etc.
  if (info.kinds && info.kinds.includes('attack')) has.add('attack');
  if (has.size > 1) has.delete('special'); // a custom op next to a clearer effect adds nothing
  const hits = info.hits || 0, per = info.per || 0;
  const out = [];
  const list = [...has].sort((a, b) => (ORDER.indexOf(a) + 99 * (ORDER.indexOf(a) < 0)) - (ORDER.indexOf(b) + 99 * (ORDER.indexOf(b) < 0)));
  for (const k of list) {
    if (k === 'attack') {
      if (all) out.push({ k: 'sweep', hits });
      else if (hits > 1) out.push({ k: 'multi', hits });
      else if ((info.dmg || 0) >= Math.max(HEAVY_MIN, maxHp * 0.2)) out.push({ k: 'heavy', hits });
      else out.push({ k: 'attack', hits });
    } else if (k === 'debuff' && poison && !has.has('attack')) out.push({ k: 'poison' });
    else out.push({ k });
  }
  if (!out.length) out.push({ k: 'unknown' });
  return out.slice(0, 3);
}
