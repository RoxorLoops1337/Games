// Player afflictions and enemy guard statuses from design/ENEMY_DEPTH.md section 1 (the memo rules; engine glue lives in
// engine/afflictions.js). `cap` is read by the afflictions guard (stack caps); hooks get (A, owner, n, payload).
// Per-combat scratch state lives on A.c.affl (created by engine/afflictions.js, defaulted here for safety).
const S = (A) => A.c.affl || (A.c.affl = {});
const dmgIn = (fx) => (fx || []).some((o) => o && (o.op === 'dmg' || (o.op === 'if' && (dmgIn(o.then) || dmgIn(o.else))) || (o.op === 'repeat' && dmgIn([].concat(o.fx || [])))));
const WILL_SAVE = (c) => (c.run.relics || []).includes('r_second_skin') && !(c.rx && c.rx.skin);

export const STATUS_AFF = [
  // Lose N HP at turn start (ignores Block, Intangible still caps it), then N rises by 1. Never kills below 1 HP while an untriggered wouldDie relic stands guard.
  { id: 'poison', name: 'Poison', good: false, stack: 'int', cap: 6, desc: (n) => `Lose ${n} HP at turn start (ignores Block), then Poison rises by 1 (max 6).`,
    hooks: {
      turnStart: (A, o, n) => {
        let d = n;
        if (o.kind === 'player' && WILL_SAVE(A.c) && o.hp - d < 1) d = Math.max(0, o.hp - 1);
        if (d > 0) A.dmg(null, o, d, { pierce: true, noMods: true, status: 'poison' });
        if (!A.c.over && !o.dead) A.setStatus(o, 'poison', Math.min(6, n + 1));
      },
      // its applier died: halve (round up what is left)
      kill: (A, o, n, p) => {
        const src = S(A).poisonSrc;
        if (src && p.enemy && src[p.enemy.uid]) { delete src[p.enemy.uid]; if (n > 1) A.setStatus(o, 'poison', Math.ceil(n / 2)); }
      },
    } },
  // When an attack empties your Block, take 25% of the broken amount (rounded up), max 6.
  { id: 'brittle', name: 'Brittle', good: false, stack: 'dur', cap: 3, desc: (n) => `Block you gain shatters: when an attack empties your Block, take 25% of the broken amount (max 6). ${n} turn${n > 1 ? 's' : ''}.`,
    hooks: { blockBroken: (A, o, n, p) => { const d = Math.min(6, Math.ceil(p.amount * 0.25)); if (d > 0) A.dmg(null, o, d, { pierce: true, noMods: true, status: 'brittle' }); } } },
  { id: 'rejection', name: 'Rejection', good: false, stack: 'dur', cap: 1, desc: () => 'Prices trigger twice this turn (self damage, junk, jam).' },
  { id: 'infection', name: 'Infection', good: false, stack: 'int', cap: 3, desc: (n) => `Strain counts +${n} this combat. It Tithes plain cards. Only a potion, a Rest or a Forge clears it.` },
  { id: 'numb', name: 'Numb', good: false, stack: 'dur', cap: 1, desc: () => 'The grafts on your top grafted card in hand stop working this turn. Their prices still bite.' },
  { id: 'unpicked', name: 'Unpicked', good: false, stack: 'dur', cap: 1, desc: () => 'One patch on one card in your hand is gone this turn. An Overload loses its x1.5 and its Shatter roll.' },
  { id: 'cadencelock', name: 'Cadence Lock', good: false, stack: 'dur', cap: 1, desc: () => 'Your Thread breaks the first time a school repeats this turn.' },
  // Every card past the 4th this turn banks N; the bank lands on the next enemy hit and resets at your turn start.
  { id: 'stagefright', name: 'Stagefright', good: false, stack: 'int', cap: 4, desc: (n) => `Each card past your 4th this turn adds ${n} to the damage of the next enemy hit.`,
    hooks: {
      cardPlayed: (A, o, n) => { if (A.c.cardsThisTurn.length > 4) { const s = S(A); s.stage = (s.stage || 0) + n; } },
      attacked: (A, o, n, p) => {
        const s = S(A);
        if (!s.stage || !p.attacker || p.attacker.kind !== 'enemy') return;
        const b = s.stage; s.stage = 0;
        if (!(o.st.intangible > 0)) A.dmg(null, o, b, { noMods: true, status: 'stagefright' });
      },
    } },
  // Ending a turn with 0 Block costs 2 per stack.
  { id: 'dread', name: 'Dread', good: false, stack: 'int', cap: 5, desc: (n) => `If you end your turn with no Block, take ${n * 2}.`,
    hooks: { turnEnd: (A, o, n) => { if (o.block <= 0) A.dmg(null, o, n * 2, { pierce: true, noMods: true, status: 'dread' }); } } },
  { id: 'leaden', name: 'Leaden', good: false, stack: 'dur', cap: 2, desc: () => 'Your highest-cost card costs 1 more.' },
  // Enemy: the next hit it lands deals +2 per stack; the stack is spent by that hit. engine/afflictions.js adds +1 per card type you skipped.
  { id: 'weightofdebt', name: 'Weight of Debt', good: true, stack: 'int', cap: 8, mod: { outAdd: (n) => 2 * n }, desc: (n) => `Its next hit deals ${n * 2} more. It gains 1 for each card type you skip.`,
    hooks: { turnEnd: (A, e, n) => { if (!(e.st.stun > 0) && e.move && dmgIn(e.def.moves[e.move] && e.def.moves[e.move].fx)) A.setStatus(e, 'weightofdebt', 0); } } },
  // Enemy: absorbs damage that gets past its Block (see afflAbsorb); the stack is what is left, and it refills to its peak if you play under 3 cards.
  { id: 'stitchedup', name: 'Stitched Up', good: true, stack: 'int', cap: 10, desc: (n) => `Absorbs the first ${n} damage each turn. Refills if you play fewer than 3 cards.` },
];
