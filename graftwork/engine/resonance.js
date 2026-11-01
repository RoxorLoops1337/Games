// School Resonance: 3 grafts of one school in the deck wakes tier 3, 6 wakes tier 6. Hooks mirror relic hooks.
import { GRAFTS, CARDS } from '../data/index.js';

export function resonanceOf(run) {
  const counts = {};
  for (const i of run.deck) for (const gid of i.grafts) { const s = GRAFTS[gid] && GRAFTS[gid].school; if (s) counts[s] = (counts[s] || 0) + 1; }
  const tiers = {};
  for (const s of Object.keys(counts)) tiers[s] = counts[s] >= 6 ? 6 : counts[s] >= 3 ? 3 : 0;
  return { counts, tiers };
}

const T = (c, s) => (c.res && c.res[s]) || 0;
export const RES_HOOKS = {
  combatStart: (A) => {
    const c = A.c;
    if (T(c, 'echo') >= 3) A.status(A.player, 'echo', T(c, 'echo') >= 6 ? 2 : 1);
    if (T(c, 'hoard') >= 6) c.handSize += 1;
  },
  turnStart: (A) => {
    const c = A.c;
    c.resEmber = false; c.resBloodHeal = false; c.resBloodStr = 0;
    if (T(c, 'hoard') >= 3 && c.turn === 1) A.draw(1);
    if (T(c, 'static') >= 3) A.status(A.player, 'charge', T(c, 'static') >= 6 ? 2 : 1);
  },
  cardPlayed: (A, p) => {
    const c = A.c, t = T(c, 'ember');
    if (t >= 3 && p.spec.type === 'attack' && p.target && !p.target.dead && (t >= 6 || !c.resEmber)) { c.resEmber = true; A.status(p.target, 'burn', 2); }
  },
  selfHurt: (A) => {
    const c = A.c, t = T(c, 'blood');
    if (t >= 3 && !c.resBloodHeal) { c.resBloodHeal = true; A.heal(A.player, 2); }
    if (t >= 6 && c.resBloodStr < 3) { c.resBloodStr++; A.status(A.player, 'strength', 1); }
  },
  junkDrawn: (A) => { const c = A.c; if (T(c, 'rust') >= 3) A.block(A.player, 2); },
  turnEnd: (A) => {
    const c = A.c;
    if (T(c, 'rust') >= 6) {
      const n = c.hand.filter((k) => CARDS[k.inst.id].type === 'junk').length;
      for (let i = 0; i < n; i++) for (const e of A.alive()) A.dmg(A.player, e, 2, { noMods: true, pierce: true });
    }
  },
  combatEnd: (A) => {
    const t = T(A.c, 'gilded');
    if (t >= 3) A.gold(t >= 6 ? 20 : 10);
  },
};
