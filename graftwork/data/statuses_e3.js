// Act III statuses (The Gilt Theatre). Same schema as statuses.js.
// 'marked' (Usher) already lives in statuses.js and is reused by the enemies.
export const STATUS_E3 = [
  // Puppet: while strings remain, every hit is absorbed and cuts one string (logic in the Puppet's modDamage).
  { id: 'strings', name: 'Strings', good: true, stack: 'int', desc: (n) => `${n} string${n > 1 ? 's' : ''} left. Each hit that lands only cuts one string and deals no damage.` },
  // Gilded Cherub: fragile gilding.
  { id: 'fragile', name: 'Fragile', good: false, stack: 'int', mod: { inMul: () => 1.5 }, desc: () => 'Takes 50% more attack damage. Does not wear off.' },
  // Velvet Curtain: hides whoever stands behind it.
  { id: 'veiled', name: 'Veiled', good: true, stack: 'dur', mod: { inMul: () => 0.7 }, desc: (n) => `Behind the curtain: takes 30% less attack damage for ${n} turn${n > 1 ? 's' : ''}.` },
  // Impresario: which act the baton is on (display only; the Impresario reads its own HP).
  { id: 'baton', name: 'Baton', good: true, stack: 'int', desc: (n) => `The baton is raised for act ${n}. The score changes when it falls.` },
];
