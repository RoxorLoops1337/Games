// Small helpers the content files share (one copy each; tools/graftwork_hygiene.mjs lists a helper written in two files).
// Pure: no imports, no state of their own. A file that needs a variant writes its own under another name.

// ---- enemy move ops (enemies_1.js, enemies_new1.js, enemies_3.js, enemies_new3.js) ----
export const dmg = (n, extra = {}) => ({ op: 'dmg', n, ...extra });
export const blk = (n) => ({ op: 'block', n, to: 'self' });
export const debuff = (s, n) => ({ op: 'status', s, n, to: 'player' });
export const buff = (s, n) => ({ op: 'status', s, n, to: 'self' });
export const ST = (s, n, to) => ({ op: 'status', s, n, to: to || 'player' });
export const CUSTOM = (intent, text, fn) => ({ op: 'custom', intent, text, fn });

// The Act 3 school order (Blood second, unlike data/schools.js): the tie-break of The Grafter's deck tally (enemies_3.js), the Locksmith's
// seal (enemies_new3.js), and the index n - 1 that the statuses Mirror and Sealed carry (statuses_e3.js). Changing it changes fights.
export const SCHOOL_ORDER = ['ember', 'blood', 'echo', 'hoard', 'rust', 'static', 'gilded'];

// ---- card conditions, cond(c, ctx) of an `if` op (cards_marrow.js, cards_wick.js, cards_odile.js) ----
export const OVL = (c, ctx) => !!(ctx.spec && ctx.spec.overload); // true when this card carries a 3rd graft
export const TEMP = (c, ctx) => !!(ctx.spec && ctx.spec.fused && ctx.spec.fused.length); // this card is Tempered
export const LINE2 = (c) => !!c.seam && Object.keys(c.seam.counts || {}).filter((k) => c.seam.counts[k] > 0).length >= 2; // the Line bridges 2+ schools

// ---- what a card spec does (graft `ok(spec)` filters) ----
export const hasD = (s) => s.fx.some((o) => o.op === 'dmg');
export const hasB = (s) => s.fx.some((o) => o.op === 'block');
export const dmgOrBlock = (s) => hasD(s) || hasB(s);

// ---- combat cards (k is a combat card: { inst, ... }) ----
export const isJunk = (k) => String(k.inst.id).startsWith('j_');
export const allCards = (A) => [...A.c.hand, ...A.c.drawPile, ...A.c.discard, ...A.c.exhaust, ...A.c.powers];
