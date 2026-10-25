// Odile statuses (same schema as statuses.js).
import { CARDS } from './index.js'; // used only inside hooks at runtime (circular import is safe)

const costOf = (k) => { const d = CARDS[k.inst.id]; if (!d) return 0; return d.cost === 'X' ? 3 : (d.cost || 0); };

export const STATUS_ODILE = [
  { id: 'dividend', name: 'Dividend', good: true, stack: 'int', desc: (n) => `Gain ${n} gold at the end of your turn.`,
    hooks: { turnEnd: (A, o, n) => A.gold(n) } },
  // Keeps the n most expensive non-junk cards in hand at turn end, returns them at the next turn start.
  { id: 'keepsake', name: 'Keepsake', good: true, stack: 'int', desc: (n) => `At turn end, keep your ${n} most expensive card${n > 1 ? 's' : ''} out of the discard. They return next turn.`,
    hooks: {
      turnEnd: (A, o, n) => {
        const c = A.c; c.keepsake = c.keepsake || [];
        const pool = c.hand.filter((k) => CARDS[k.inst.id] && CARDS[k.inst.id].type !== 'junk' && !(CARDS[k.inst.id].flags || {}).ethereal);
        pool.sort((a, b) => costOf(b) - costOf(a));
        for (const k of pool.slice(0, n)) { c.hand.splice(c.hand.indexOf(k), 1); c.keepsake.push(k); }
      },
      turnStart: (A) => {
        const c = A.c; const keep = c.keepsake || []; c.keepsake = [];
        for (const k of keep) { if (c.hand.length < 10) { c.hand.push(k); c.ev.push({ t: 'draw', card: k.uid, id: k.inst.id }); } else c.discard.push(k); }
      },
    } },
  // Whenever you play an Attack and can pay 2 gold, pay it for 2n extra damage.
  { id: 'patronage', name: 'Patronage', good: true, stack: 'int', desc: (n) => `Whenever you play an Attack, pay 2 gold (if you can) to deal ${n * 2} extra damage.`,
    hooks: { cardPlayed: (A, o, n, p) => {
      if (p.spec.type !== 'attack' || !p.target || p.target.dead) return;
      if ((A.c.run.gold || 0) < 2) return;
      A.gold(-2); A.dmg(o, p.target, n * 2, { noMods: true, status: 'patronage' });
    } } },
  // Each turn start, your first card of the turn is played twice (Echo 1, only if you have none stored).
  { id: 'standing_order', name: 'Standing Order', good: true, stack: 'int', desc: (n) => `At the start of each turn, gain Echo (up to ${n}): your first card is played twice.`,
    hooks: { turnStart: (A, o, n) => { const have = o.st.echo || 0; if (have < n) A.status(o, 'echo', n - have); } } },
];
