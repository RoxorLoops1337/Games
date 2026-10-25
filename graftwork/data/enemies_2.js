// Act II: The Cellar Market. Brown cellar, hanging lanterns, jar shelves.
// Disrupt intents (custom ops on the draw pile, because the hand is empty during the enemy phase):
//   Lantern Fish = mill + Lured, Wax Sealer = jam top cards + exhaust a grafted card, Ledgerman = Ledger Entries.
// Summon-only extras (not for the encounter pool): pickled_thing, bidder (flag summonOnly).

const ensureDraw = (A) => {
  const c = A.c;
  if (!c.drawPile.length && c.discard.length) { c.drawPile = c.rng.shuffle(c.discard.splice(0)); A.ev({ t: 'shuffle' }); }
};
const mill = (n) => (A) => {
  ensureDraw(A);
  const c = A.c;
  for (let i = 0; i < n && c.drawPile.length; i++) {
    const card = c.drawPile.pop();
    c.discard.push(card);
    A.ev({ t: 'discard', card: card.uid, why: 'effect' });
  }
};
const jamTop = (n) => (A) => {
  ensureDraw(A);
  for (const card of A.c.drawPile.slice(-n)) { card.jam = true; A.ev({ t: 'jam', card: card.uid }); }
};
const sealOne = (A) => {
  ensureDraw(A);
  const c = A.c;
  const top = c.drawPile.slice(-5);
  if (!top.length) return;
  let best = top[0];
  for (const k of top) if (k.inst.grafts.length > best.inst.grafts.length) best = k;
  c.drawPile.splice(c.drawPile.indexOf(best), 1);
  c.exhaust.push(best);
  A.ev({ t: 'exhaust', card: best.uid });
};
const grow = (n) => (A, ctx) => { const e = ctx.srcEnt; e.maxHp += n; e.hp += n; A.ev({ t: 'heal', who: e.uid, n }); };

// The Appraiser's price tags.
const scoreCard = (k) => k.inst.grafts.length * 10 + (k.inst.up ? 1 : 0);
const markBest = (n) => (A) => {
  const c = A.c;
  const pool = [...c.drawPile, ...c.discard, ...c.hand].filter((k) => !k.temp && !k.priced);
  pool.sort((a, b) => scoreCard(b) - scoreCard(a) || c.rng.int(2) - 0.5);
  for (const k of pool.slice(0, n)) { k.priced = true; A.ev({ t: 'mark', card: k.uid }); A.status(A.player, 'priced', 1); }
};
const clearMarks = (A) => {
  for (const k of [...A.c.drawPile, ...A.c.discard, ...A.c.hand, ...A.c.exhaust]) delete k.priced;
  A.setStatus(A.player, 'priced', 0);
};

export const ENEMIES_2 = [
  // ---------- NORMALS ----------
  { id: 'jarhead', name: 'Jarhead', act: 2, kind: 'normal', hp: [60, 66], pattern: ['bonk', 'slosh', 'bonk'],
    moves: { bonk: { name: 'Glass Bonk', fx: [{ op: 'dmg', n: 15 }] }, slosh: { name: 'Brine Slosh', fx: [{ op: 'dmg', n: 8 }, { op: 'block', n: 8, to: 'self' }] } },
    on: { death: (A) => { A.summon('pickled_thing', 2); } },
    art: { body: 'jar', color: '#8fae6b', notes: 'Fat glass jar on stubby legs, cloudy brine, a cracked lid. Shatters into two small pickled things.' } },
  { id: 'haggler', name: 'Haggler', act: 2, kind: 'normal', hp: [60, 66], pattern: ['haggle', 'jab', 'jab'],
    moves: { haggle: { name: 'Raise the Price', fx: [{ op: 'dmg', n: 6 }, { op: 'status', s: 'costup', n: 1, to: 'player' }] }, jab: { name: 'Walking Stick', fx: [{ op: 'dmg', n: 15 }] } },
    art: { body: 'hunched', color: '#a9825a', notes: 'Hunched oval back, thin hooked nose, one long arm with an open palm.' } },
  { id: 'coin_mite', name: 'Coin Mite', act: 2, kind: 'normal', hp: [32, 36],
    pick: (A, e) => (e.data.flee ? 'flee' : ['nibble', 'nibble', 'scuttle'][e.turn % 3]),
    moves: {
      nibble: { name: 'Nibble Purse', fx: [{ op: 'dmg', n: 9 }, { op: 'custom', intent: 'debuff', text: 'Eats up to 15 of your gold.', fn: (A, ctx) => {
        const e = ctx.srcEnt; const take = Math.min(15, A.c.run.gold || 0);
        if (take > 0) { A.gold(-take); e.data.loot = (e.data.loot || 0) + take; }
      } }] },
      scuttle: { name: 'Scuttle', fx: [{ op: 'dmg', n: 5 }, { op: 'block', n: 6, to: 'self' }] },
      flee: { name: 'Flees With Loot', intent: ['buff'], fx: [{ op: 'custom', text: 'Runs off with your gold.', fn: (A, ctx) => { ctx.srcEnt.data.fled = true; A.kill(ctx.srcEnt); } }] },
    },
    on: {
      damaged: (A, e, dmg, o) => { if (o.hit && e.data.loot > 0 && !e.data.flee) { e.data.flee = true; e.move = 'flee'; A.ev({ t: 'intent', e: e.uid, move: 'flee' }); } },
      death: (A, e, src) => { if (!e.data.fled && e.data.loot > 0 && src) A.gold(e.data.loot); },
    },
    art: { body: 'disc', color: '#d9b43c', notes: 'Flat gold coin disc with six twitching leg lines and two pin eyes.' } },
  { id: 'lantern_fish', name: 'Lantern Fish', act: 2, kind: 'normal', hp: [60, 66], pattern: ['glow', 'bite', 'reel', 'bite'],
    moves: {
      glow: { name: 'Gloaming', fx: [{ op: 'dmg', n: 6 }, { op: 'custom', intent: 'debuff', text: 'Pulls 2 cards off your draw pile into the discard pile.', fn: mill(2) }] },
      bite: { name: 'Bite', fx: [{ op: 'dmg', n: 18 }] },
      reel: { name: 'Reel In', fx: [{ op: 'dmg', n: 5 }, { op: 'status', s: 'lured', n: 2, to: 'player' }] },
    },
    art: { body: 'lure', color: '#e2a64a', notes: 'Dark teardrop fish hanging from the ceiling by a polyline stalk ending in a glowing lantern circle.' } },
  { id: 'rust_hound', name: 'Rust Hound', act: 2, kind: 'normal', hp: [62, 68], pattern: ['gnaw', 'lunge', 'lunge'],
    moves: {
      gnaw: { name: 'Gnaw', fx: [{ op: 'custom', intent: 'debuff', text: 'Strips all your Block.', fn: (A) => { if (A.player.block > 0) { A.player.block = 0; A.ev({ t: 'corrode' }); } } }, { op: 'dmg', n: 11 }, { op: 'status', s: 'corroded', n: 2, to: 'player' }] },
      lunge: { name: 'Lunge', fx: [{ op: 'dmg', n: 7, hits: 2 }] },
    },
    art: { body: 'jagged', color: '#a8573a', notes: 'Low spiky polygon of rusted plates, sawtooth back, a jaw of nails.' } },
  { id: 'scale_merchant', name: 'Scale Merchant', act: 2, kind: 'normal', hp: [62, 68], pattern: ['tilt', 'weigh'],
    moves: {
      tilt: { name: 'Tilt', fx: [{ op: 'dmg', n: 6 }, { op: 'block', n: 8, to: 'self' }] },
      weigh: { name: 'Weigh', fx: [{ op: 'dmg', n: { base: 8, per: 'st:mirror@self', max: 28 } }], after: (A, e) => A.setStatus(e, 'mirror', 0) },
    },
    on: { damaged: (A, e, dmg, o) => { if (o.hit) A.setStatus(e, 'mirror', Math.min(dmg, 24)); } },
    art: { body: 'balance', color: '#c7b27a', notes: 'Thin upright beam with two swinging pan circles on chains, a small round head on top.' } },
  { id: 'cleaver', name: 'Cleaver', act: 2, kind: 'normal', hp: [60, 66], pattern: ['stalk', 'raise', 'chop'],
    moves: {
      stalk: { name: 'Stalk', fx: [{ op: 'dmg', n: 9 }, { op: 'block', n: 5, to: 'self' }] },
      raise: { name: 'Lifts the Blade', fx: [{ op: 'block', n: 8, to: 'self' }, { op: 'status', s: 'raised', n: 1, to: 'self' }] },
      chop: { name: 'Chop', hidden: true, fx: [{ op: 'dmg', n: 28 }], after: (A, e) => { A.setStatus(e, 'raised', 0); } },
    },
    on: {
      damaged: (A, e, dmg, o) => {
        if (e.move !== 'chop' || !o.hit) return;
        e.data.hurt = (e.data.hurt || 0) + dmg;
        if (e.data.hurt >= 18 && !e.st.stun) { A.setStatus(e, 'stun', 1); A.setStatus(e, 'raised', 0); e.data.hurt = 0; }
      },
      afterMove: (A, e) => { e.data.hurt = 0; },
    },
    art: { body: 'cleaver', color: '#b9b3a5', notes: 'Half-disc blade standing on two thin legs, flat edge down. Tilts back as it raises.' } },
  { id: 'mold_bloom', name: 'Mold Bloom', act: 2, kind: 'normal', hp: [60, 66], pattern: ['spore', 'smother', 'grow', 'smother'],
    moves: {
      spore: { name: 'Spore Cloud', fx: [{ op: 'dmg', n: 5 }, { op: 'addCard', card: 'j_clot', n: 2, to: 'draw' }] },
      smother: { name: 'Smother', fx: [{ op: 'dmg', n: 18 }] },
      grow: { name: 'Bloom', fx: [{ op: 'dmg', n: 6 }, { op: 'custom', intent: 'buff', text: 'Grows 8 max HP and heals 8.', fn: grow(8) }] },
    },
    art: { body: 'bloom', color: '#6f9a5a', notes: 'Cluster of overlapping circles of different sizes, fuzzy outlines, growing from a damp patch.' } },
  { id: 'twin_barrels', name: 'Twin Barrels', act: 2, kind: 'normal', hp: [60, 66], pattern: ['enrage', 'burst', 'roll'],
    moves: {
      enrage: { name: 'Left Barrel Rages', fx: [{ op: 'dmg', n: 4 }, { op: 'status', s: 'strength', n: 3, to: 'self' }] },
      burst: { name: 'Right Barrel Bursts', fx: [{ op: 'dmg', n: 16 }, { op: 'custom', intent: 'buff', text: 'Loses 8 HP.', fn: (A, ctx) => A.loseHp(ctx.srcEnt, 8, { floor1: true }) }] },
      roll: { name: 'Roll', fx: [{ op: 'dmg', n: 9 }] },
    },
    art: { body: 'barrels', color: '#8b5a2b', notes: 'Two stacked or side-by-side barrel rects with iron bands; the left glows red when enraged, the right bulges and cracks.' } },
  { id: 'ledgerman', name: 'Ledgerman', act: 2, kind: 'normal', hp: [62, 68], pattern: ['tick', 'tally', 'invoice'],
    moves: {
      tick: { name: 'Tick', fx: [{ op: 'dmg', n: 12 }] },
      tally: { name: 'Carry the One', fx: [{ op: 'dmg', n: 8 }, { op: 'block', n: 8, to: 'self' }] },
      invoice: { name: 'Invoice', fx: [{ op: 'dmg', n: 14 }, { op: 'addCard', card: 'j_ledger', n: 1, to: 'discard' }] },
    },
    start: { tally: 0 },
    on: {
      playerCard: (A, e) => {
        const k = A.c.cardsThisTurn.length;
        A.setStatus(e, 'tally', k);
        if (k === 5) { A.dmg(e, A.player, 6, { pierce: true, noMods: true }); A.addCard('j_ledger', 1, 'discard'); }
        else if (k > 5) A.dmg(e, A.player, 3, { pierce: true, noMods: true });
      },
      afterMove: (A, e) => A.setStatus(e, 'tally', 0),
    },
    art: { body: 'columns', color: '#b8a98a', notes: 'Two tall ledger-column rects side by side with tick marks scrolling down them, a small clock circle on top.' } },
  { id: 'wax_sealer', name: 'Wax Sealer', act: 2, kind: 'normal', hp: [60, 66], pattern: ['drip', 'seal', 'pour'],
    moves: {
      drip: { name: 'Drip', fx: [{ op: 'dmg', n: 8 }, { op: 'custom', intent: 'debuff', text: 'Jams the top 2 cards of your draw pile (+1 cost).', fn: jamTop(2) }] },
      seal: { name: 'Seal the Jar', fx: [{ op: 'dmg', n: 8 }, { op: 'custom', intent: 'debuff', text: 'Exhausts one of the top 5 cards of your draw pile, the most grafted first.', fn: sealOne }] },
      pour: { name: 'Hot Pour', fx: [{ op: 'dmg', n: 18 }] },
    },
    art: { body: 'candle', color: '#e6d9a8', notes: 'Stack of melting wax circles shaped like a tall candle body, drip polylines down the sides, one flame circle on top.' } },

  // ---------- SUMMON ONLY ----------
  { id: 'pickled_thing', name: 'Pickled Thing', act: 2, kind: 'normal', summonOnly: true, hp: [12, 14], pattern: ['nip', 'sour'],
    moves: { nip: { fx: [{ op: 'dmg', n: 5 }] }, sour: { name: 'Sour Spit', fx: [{ op: 'dmg', n: 3 }, { op: 'status', s: 'frail', n: 1, to: 'player' }] } },
    art: { body: 'hunched', color: '#7fa05a', notes: 'Small green lump with a stalk and two bead eyes, a shard of glass stuck in it.' } },
  { id: 'bidder', name: 'Bidder', act: 2, kind: 'normal', summonOnly: true, minion: true, hp: [14, 16], pattern: ['paddle', 'bid'],
    moves: { paddle: { fx: [{ op: 'dmg', n: 5 }] }, bid: { name: 'Raise Paddle', fx: [{ op: 'status', s: 'strength', n: 1, to: 'allies' }, { op: 'block', n: 4, to: 'self' }] } },
    art: { body: 'hunched', color: '#9a7a9a', notes: 'Small cloaked oval with a square paddle held high.' } },

  // ---------- ELITES ----------
  { id: 'the_appraiser', name: 'The Appraiser', act: 2, kind: 'elite', hp: [114, 120], pattern: ['appraise', 'audit', 'levy'],
    moves: {
      appraise: { name: 'Appraise', fx: [{ op: 'dmg', n: 8 }, { op: 'custom', intent: 'debuff', text: 'Prices your most grafted card (two below half HP). Playing it costs you.', fn: (A, ctx) => markBest(ctx.srcEnt.hp * 2 <= ctx.srcEnt.maxHp ? 2 : 1)(A) }] },
      audit: { name: 'Audit', fx: [{ op: 'dmg', n: 16 }, { op: 'block', n: 8, to: 'self' }] },
      levy: { name: 'Levy', fx: [{ op: 'dmg', n: 26 }] },
    },
    on: {
      playerCard: (A, e, { card }) => {
        if (!card.priced) return;
        delete card.priced;
        A.status(A.player, 'priced', -1);
        if ((A.c.run.gold || 0) >= 10) A.gold(-10); else A.dmg(e, A.player, 5, { pierce: true, noMods: true });
        A.block(e, 10, { raw: true });
      },
      death: (A) => clearMarks(A),
    },
    art: { body: 'loupe', color: '#c9a86a', notes: 'Tall thin coat rect with a huge round monocle circle for a head, a tag on a string in one hand.' } },
  { id: 'auction_house', name: 'Auction House', act: 2, kind: 'elite', hp: [114, 120],
    pick: (A, e) => {
      const bidders = A.alive().filter((x) => x.id === 'bidder').length;
      const t = e.data.t = (e.data.t || 0) + 1;
      if (bidders < 2 && t % 3 === 1) return 'open';
      return t % 2 ? 'sold' : 'gavel';
    },
    moves: {
      open: { name: 'Opening Bid', fx: [{ op: 'dmg', n: 6 }, { op: 'summon', id: 'bidder' }] },
      sold: { name: 'Sold', fx: [{ op: 'dmg', n: 10 }, { op: 'block', n: 12, to: 'self' }] },
      gavel: { name: 'Gavel', fx: [{ op: 'dmg', n: 22 }] },
    },
    art: { body: 'podium', color: '#7a4a2a', notes: 'Wide wooden podium rect with a stout gavel arm swinging from the top, a fringe of paddle shapes along the front.' } },
  { id: 'pickled_king', name: 'The Pickled King', act: 2, kind: 'elite', hp: [116, 122], pattern: ['sour', 'decree', 'crush'], start: { brined: 16 },
    moves: {
      sour: { name: 'Sour Crown', fx: [{ op: 'dmg', n: 14 }, { op: 'status', s: 'weak', n: 1, to: 'player' }] },
      decree: { name: 'Brined Decree', fx: [{ op: 'dmg', n: 6 }, { op: 'block', n: 12, to: 'self' }, { op: 'addCard', card: 'j_clot', n: 2, to: 'draw' }] },
      crush: { name: 'Lid Crush', fx: [{ op: 'dmg', n: 28 }] },
    },
    on: {
      damaged: (A, e) => {
        if (e.data.ferm || e.hp * 2 > e.maxHp) return;
        e.data.ferm = 1;
        A.setStatus(e, 'brined', 0);
        A.status(e, 'strength', 3);
        A.block(e, 15, { raw: true });
      },
    },
    art: { body: 'jar', color: '#6e8f3f', notes: 'Huge jar body, a jagged gold crown of three triangles on the lid, pale pickled limbs pressed against the glass.' } },

  // ---------- BOSS ----------
  { id: 'the_broker', name: 'The Broker', act: 2, kind: 'boss', hp: 220, start: { interest: 1 },
    pick: (A, e) => {
      const d = e.data;
      if (d.p2 === 1) return 'collect';
      d.i = (d.i || 0) + 1;
      const seq = d.p2 === 2 ? ['hands', 'foreclose', 'offer', 'sweet'] : ['sweet', 'hands', 'offer', 'foreclose'];
      return seq[(d.i - 1) % 4];
    },
    moves: {
      sweet: { name: 'Sweet Talk', fx: [{ op: 'dmg', n: 12 }, { op: 'status', s: 'frail', n: 1, to: 'player' }] },
      hands: { name: 'Dangling Hands', fx: [{ op: 'dmg', n: 7, hits: 3 }] },
      offer: { name: 'An Offer', fx: [{ op: 'dmg', n: 6 }, { op: 'status', s: 'offer', n: 1, to: 'self' }] },
      foreclose: { name: 'Foreclose', fx: [{ op: 'dmg', n: 34 }] },
      collect: { name: 'Collect', fx: [{ op: 'dmg', n: 8 }, { op: 'custom', intent: 'debuff', text: 'Steals up to 30 of your gold.', fn: (A) => { A.gold(-Math.min(30, A.c.run.gold || 0)); } }, { op: 'summon', id: 'coin_mite', n: 2 }], after: (A, e) => { e.data.p2 = 2; } },
    },
    on: {
      damaged: (A, e, dmg, o) => {
        if (e.st.offer && o.hit) e.data.offerDmg = (e.data.offerDmg || 0) + dmg;
        if (!e.data.p2 && e.hp * 2 <= e.maxHp) {
          e.data.p2 = 1;
          A.status(e, 'strength', 2);
          e.move = 'collect';
          A.ev({ t: 'intent', e: e.uid, move: 'collect' });
        }
      },
    },
    art: { body: 'tophat', color: '#c9a24a', notes: 'Tall narrow triangle body under a flat-topped top-hat rect, two very long arm polylines dangling past the feet, each ending in a loose open hand.' } },
];
