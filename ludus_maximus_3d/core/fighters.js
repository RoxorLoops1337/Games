// Ludus Maximus 3D: depth wave 10, module "fighters" (no DOM). Loaded after arena.js (index.html script tag; in Node arena.js requires it at its tail).
// FIGHTERS: individuality (origin + two quirks + bio + life log), relationships (S.fr: brotherhood, grudge, fondness, jealousy on top of S.bonds / S.rivalry),
// talent trees + weapon mastery + renown titles, the career arc (age, retirement options, trainers) and the look (g.look, rendered by gladiator.js).
// Rules: optional save fields only (old saves load, fields appear lazily and deterministically from hash(id)), NO rnd() draws (every roll here is a hash roll or a
// seeded mulberry run through LM.withRandom), never new unit fields (everything is translated into derive() shades and ctx.fb, the team shade table).
// Fields on a fighter g (all optional): org, q[2], age, ag0[age, week], tk{node:rank}, wm{weapon:points}, kl, sp, up, tt[], rn, ll[], lk{}, look{}, swan.
// Fields on S: fr{pairKey:{bro,fond,jeal,gr,n}}, trainers[], stats.freed.
(function (G) {
  const D = G.LM_D, L = G.LM;
  if (!D || !L || (L.fighters && L.fighters.ver > 1)) return;
  const clamp = L.clamp || ((v, a, b) => Math.max(a, Math.min(b, v)));
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const hs = (...a) => L.hash(a.join('|')) >>> 0;
  const roll = (...a) => (hs(...a) % 10007) / 10007;      // a deterministic 0..1 roll, never touches the game's random stream
  const pct = (v) => `${v > 0 ? '+' : '-'}${Math.round(Math.abs(v) * 1000) / 10}%`;
  const LAB = { hp: 'HP', atk: 'damage', def: 'armor', spd: 'speed', crit: 'crit', eva: 'dodge' };
  const KEYS = ['hp', 'atk', 'def', 'spd', 'crit', 'eva'];
  const addTo = (a, b, f = 1) => { for (const k in b) a[k] = (a[k] || 0) + b[k] * f; return a; };
  const modLine = (m) => KEYS.filter((k) => m && m[k]).map((k) => `${pct(m[k])} ${LAB[k]}`).join(', ');
  const bkey = (a, b) => (a < b ? a + '-' + b : b + '-' + a);

  // ============================================================ 1. origins and quirks
  const ORIGINS = {
    thracian: { n: 'Thracian captive', mods: { crit: 0.01 }, b: 'was dragged south in a Thracian war coffle and sold on the block at Capua', w: ['thraex', 'dimachaerus'] },
    gaul: { n: 'Gaulish prisoner', mods: { hp: 0.015 }, b: 'was taken when the Gaulish hill-fort fell, tall and angry, and still counts the winters since', w: ['murmillo', 'retiarius'] },
    legionary: { n: 'Ex-legionary', mods: { def: 0.015 }, b: 'marched for the eagles until a lost battle and a worse debt ended the career', w: ['hoplomachus', 'murmillo'] },
    debtor: { n: 'Debtor', mods: { atk: 0.01 }, b: 'sold their own freedom to settle a creditor and now fights to buy it back', w: [] },
    volunteer: { n: 'Freeborn volunteer', mods: { eva: 0.01 }, b: 'signed the auctoratus oath of their own will, chasing bread and a name the crowd will cheer', w: [] },
    numidian: { n: 'Numidian rider', mods: { spd: 0.02 }, b: 'rode with the Numidian horse before the horses were taken', w: ['dimachaerus', 'retiarius'] },
    greek: { n: 'Greek wrestler', mods: { eva: 0.015 }, b: 'grew up in the palaestra of a Greek port town, oiled and quick', w: ['hoplomachus', 'retiarius'] },
    briton: { n: 'Briton raider', mods: { atk: 0.01, hp: 0.005 }, b: 'was carried over the grey sea from the Britannic coast with blue woad still in the skin', w: ['thraex', 'murmillo'] },
    germanic: { n: 'Germanic tribesman', mods: { hp: 0.02, spd: -0.01 }, b: 'came out of the northern forests where nobody had heard of a ludus', w: ['murmillo'] },
    spaniard: { n: 'Celtiberian', mods: { crit: 0.01, def: 0.005 }, b: 'was a mercenary in the Hispanic hills who learned a curved blade from the elders', w: ['thraex', 'hoplomachus'] },
    egyptian: { n: 'Egyptian fisher', mods: { eva: 0.01, spd: 0.005 }, b: 'cast nets on the Nile until the tax collectors came', w: ['retiarius'] },
    heir: { n: 'Ward of the fallen', mods: { hp: 0.01 }, b: 'took up the arms of one who fell, and carries the name with care', w: [] },
  };
  const ORIGIN_IDS = Object.keys(ORIGINS).filter((k) => k !== 'heir');

  // a quirk: mods (stat shades), w / l (extra morale after a win / loss), wk (weekly morale), damp (fight morale multiplier), fame (fame from fights), bond (bond gain
  // multiplier), grief (extra morale lost when a comrade falls), evN / evP (event morale multipliers: bad / good), spare / kill (morale after sparing / killing a foe)
  const QUIRKS = {
    proud: { n: 'Proud', mods: { atk: 0.03 }, l: -4, evN: 1.5, pro: '+3% damage', con: 'Defeat costs 4 extra morale and slights sting half again as much', line: '{n} answers every slight, real or imagined.', no: ['humble'] },
    humble: { n: 'Humble', mods: { def: 0.02, hp: 0.01 }, fame: -0.06, pro: '+2% armor, +1% HP', con: '6% less fame from fights', line: '{n} keeps quiet in the yard and lets the sand do the talking.', no: ['proud', 'showy'] },
    loyal: { n: 'Loyal', mods: {}, grief: 4, pro: '+3% armor beside a bonded comrade', con: 'A fallen comrade costs 4 extra morale', line: '{n} would stand in front of a friend without being asked.', no: ['grudgeholder'] },
    greedy: { n: 'Greedy', mods: { atk: 0.01 }, gold: 0.03, upkeep: 0.1, pro: 'Wins pay 3% more gold, +1% damage', con: 'Costs 10% more upkeep and sulks (-2 morale a week) when the coffers are under 100 gold', line: '{n} counts every denarius twice and trusts nobody holding the purse.', no: ['charming'] },
    charming: { n: 'Charming', mods: { def: -0.02 }, bond: 1.5, pro: 'Bonds grow 50% faster', con: '-2% armor (too busy playing to the stands)', line: '{n} has a joke for every guard and a friend in every cell.', no: ['grudgeholder', 'greedy'] },
    pious: { n: 'Pious', mods: { hp: 0.02, crit: -0.02 }, wk: 1, evP: 1.25, pro: '+2% HP, +1 morale a week, good news lifts them more', con: '-2% crit, and killing a beaten foe costs 3 morale', kill: -3, line: '{n} leaves a pinch of salt at the shrine before every fight.', no: [] },
    reckless: { n: 'Reckless', mods: { atk: 0.04, def: -0.03 }, pro: '+4% damage', con: '-3% armor', line: '{n} charges first and thinks afterwards.', no: ['patient', 'wary'] },
    patient: { n: 'Patient', mods: { def: 0.03, spd: -0.02 }, pro: '+3% armor', con: '-2% speed (slow to start)', line: '{n} waits for the opening the way a heron waits for the fish.', no: ['reckless'] },
    showy: { n: 'Showy', mods: { def: -0.02 }, fame: 0.08, pro: '+8% fame from fights', con: '-2% armor', line: '{n} plays to the cheap seats and the cheap seats play back.', no: ['humble'] },
    grudgeholder: { n: 'Grudge-holder', mods: { crit: 0.03 }, bond: 0.5, clash: 2, pro: '+3% crit', con: 'Bonds grow half as fast and feuds fester twice as quickly', line: '{n} remembers every insult by date and by the man who said it.', no: ['loyal', 'charming'] },
    stoic: { n: 'Stoic', mods: { eva: -0.01 }, damp: 0.5, evN: 0.5, evP: 0.5, pro: 'Defeats and bad news sting half as much', con: 'Victories lift them half as much, -1% dodge', line: '{n} takes triumph and disaster with the same flat look.', no: [] },
    cunning: { n: 'Cunning', mods: { crit: 0.03, hp: -0.03 }, pro: '+3% crit', con: '-3% HP', line: '{n} watches the yard the way a fox watches a henhouse.', no: [] },
    brave: { n: 'Brave', mods: { hp: 0.03, eva: -0.02 }, pro: '+3% HP', con: '-2% dodge (will not give ground)', line: '{n} has never once looked for the exit.', no: ['wary'] },
    wary: { n: 'Wary', mods: { eva: 0.03, atk: -0.02 }, evN: 0.75, pro: '+3% dodge, bad news hits 25% softer', con: '-2% damage', line: '{n} checks the sand before stepping on it.', no: ['brave', 'reckless'] },
    gentle: { n: 'Gentle', mods: { atk: -0.02, def: 0.01 }, spare: 4, kill: -5, pro: 'Sparing a foe lifts morale by 4', con: '-2% damage, and a kill costs 5 morale', line: '{n} was kind to animals once, and has not quite forgotten how.', no: ['savage'] },
    savage: { n: 'Savage', mods: { atk: 0.03 }, fame: -0.03, spare: -4, kill: 3, pro: '+3% damage, a kill lifts morale by 3', con: 'Sparing a foe costs 4 morale, and the crowd finds them cruel (-3% fame)', line: '{n} fights like the sand owes them money.', no: ['gentle'] },
  };
  const QUIRK_IDS = Object.keys(QUIRKS);

  const STYLE_LINE = { murmillo: 'now stands as a murmillo, a wall of shield and fish-crested helm', retiarius: 'now works the net and trident as a retiarius', thraex: 'now fights as a thraex, small shield, curved sica', hoplomachus: 'now holds the spear and shield as a hoplomachus', dimachaerus: 'now fights with a blade in each hand as a dimachaerus' };

  // ============================================================ 2. ensure: lazy deterministic backfill
  L.fEnsure = (S, g) => {
    if (!g || g.beast || g.gh || g.rv) return g;           // beasts and rival ghosts never get one
    if (!g.org) {
      const aff = ORIGIN_IDS.filter((o) => ORIGINS[o].w.includes(g.style)), r = roll('org', g.id, g.skin, g.hair, g.style);
      g.org = r < 0.55 && aff.length ? aff[Math.floor(roll('org2', g.id, g.skin) * aff.length)] : ORIGIN_IDS[hs('org3', g.id, g.skin, g.hair) % ORIGIN_IDS.length];
    }
    if (!Array.isArray(g.q) || g.q.length < 2 || !g.q.every((x) => QUIRKS[x])) {
      const a = QUIRK_IDS[hs('q1', g.id, g.skin, g.hair) % QUIRK_IDS.length];
      let b = QUIRK_IDS[hs('q2', g.id, g.skin, g.hair) % QUIRK_IDS.length], n = 0;
      while ((b === a || QUIRKS[a].no.includes(b) || QUIRKS[b].no.includes(a)) && n++ < 40) b = QUIRK_IDS[(QUIRK_IDS.indexOf(b) + 1) % QUIRK_IDS.length];
      g.q = [a, b];
    }
    if (!(g.age > 0)) {
      const w = (S && S.week) || 1, base = 19 + (hs('age', g.id, g.skin) % 11) + Math.min(6, Math.floor((g.lvl || 1) / 3));
      g.ag0 = [base, w]; g.age = base;
    } else if (S && Array.isArray(g.ag0)) g.age = g.ag0[0] + Math.floor(Math.max(0, S.week - g.ag0[1]) / AGE_WEEKS);
    if (!isObj(g.tk)) g.tk = {}; if (!isObj(g.wm)) g.wm = {}; if (!Array.isArray(g.ll)) g.ll = []; if (!isObj(g.lk)) g.lk = {};
    return g;
  };
  /** log a notable deed once per key: {w, t}; the log keeps the newest 24 */
  L.fLog = (S, g, key, text) => {
    L.fEnsure(S, g); if (key) { if (g.lk[key]) return false; g.lk[key] = 1; }
    g.ll.push({ w: S ? S.week : 0, t: text }); if (g.ll.length > 24) g.ll.shift(); return true;
  };
  L.fOrigin = (g) => ORIGINS[g.org] || ORIGINS.volunteer;
  L.fQuirks = (g) => (g.q || []).map((id) => Object.assign({ id }, QUIRKS[id])).filter((q) => q.n);
  /** a short written bio from origin + quirks + style + age */
  L.fBio = (g) => {
    const o = L.fOrigin(g), qs = L.fQuirks(g); if (!qs.length) return '';
    const st = STYLE_LINE[g.style] || 'fights in the arena', nm = g.name;
    return `${nm} ${o.b}. ${qs.map((q) => q.line.replace('{n}', nm)).join(' ')} ${g.age ? `At ${g.age} years, ${nm} ${st}.` : `${nm} ${st}.`}`;
  };
  L.fSummary = (g) => ({ origin: L.fOrigin(g), quirks: L.fQuirks(g), stage: L.fStage(g), bio: L.fBio(g) });
  L.fighters = { ver: 2, off: false, ORIGINS, QUIRKS, KEYS, modLine, hs, roll };

  // ============================================================ 3. age and the career arc
  const AGE_WEEKS = 16;   // one year of age every 16 weeks (a season is 12): a 96 week career is six years
  const STAGES = [
    { id: 'green', n: 'Green', to: 21, mods: { spd: 0.02, hp: -0.02 }, d: 'Quick but unseasoned: +2% speed, -2% HP' },
    { id: 'prime', n: 'Prime', to: 33, mods: {}, d: 'In the best years of the body: no penalty' },
    { id: 'vet', n: 'Veteran', to: 37, mods: { crit: 0.02, def: 0.01, spd: -0.01 }, d: 'Reads a fight: +2% crit, +1% armor, -1% speed' },
    { id: 'waning', n: 'Waning', to: 41, mods: { crit: 0.02, atk: -0.015, spd: -0.025, hp: -0.015 }, d: 'The knees remember: +2% crit, -1.5% damage, -2.5% speed, -1.5% HP' },
    { id: 'old', n: 'Old lion', to: 999, mods: { crit: 0.03, atk: -0.03, spd: -0.05, hp: -0.03 }, d: 'Cunning but spent: +3% crit, -3% damage, -5% speed, -3% HP' },
  ];
  L.fStage = (g) => { const a = g.age || 25; return STAGES.find((s) => a <= s.to) || STAGES[1]; };
  L.fSTAGES = STAGES; L.fAGE_WEEKS = AGE_WEEKS;

  // ============================================================ 4. talents, mastery, titles
  const TREES = {
    murmillo: [
      { id: 'a', n: 'Bulwark', t1: { n: 'Shield Drill', per: { def: 0.008 } }, t2: { n: 'Immovable', per: { hp: 0.01, def: 0.004 }, cap: { n: 'Stone Wall', d: 'Start each fight behind a shield worth 8% HP', fx: { shield: 1 } } } },
      { id: 'b', n: 'Gladius', t1: { n: 'Short Blade', per: { atk: 0.008 } }, t2: { n: 'Fish-Crest Fury', per: { crit: 0.01, atk: 0.004 }, cap: { n: 'Executioner Habit', d: '+8% damage to targets under 35% HP', fx: { exec: 1 } } } },
      { id: 'c', n: 'Old Hand', t1: { n: 'Footwork', per: { spd: 0.008 } }, t2: { n: 'Second Wind', per: { hp: 0.008, eva: 0.006 }, cap: { n: 'Iron Lungs', d: 'Regenerate 0.25% HP per second', fx: { regen: 1 } } } },
    ],
    retiarius: [
      { id: 'a', n: 'Net Craft', t1: { n: 'Weighted Net', per: { crit: 0.008 } }, t2: { n: 'Tangle', per: { atk: 0.008, crit: 0.004 }, cap: { n: 'Barbed Net', d: '15% chance to cause bleeding', fx: { bleed: 1 } } } },
      { id: 'b', n: 'Trident', t1: { n: 'Long Reach', per: { atk: 0.008 } }, t2: { n: 'Skewer', per: { atk: 0.01 }, cap: { n: 'Piercing Points', d: 'Ignore 8% of enemy armor', fx: { pen: 1 } } } },
      { id: 'c', n: 'Footwork', t1: { n: 'Light Step', per: { spd: 0.008, eva: 0.004 } }, t2: { n: 'Fisher Poise', per: { eva: 0.01, hp: 0.005 }, cap: { n: 'Slip the Blow', d: '8% chance to counter-strike', fx: { riposte: 1 } } } },
    ],
    thraex: [
      { id: 'a', n: 'Sica', t1: { n: 'Hooked Edge', per: { atk: 0.008 } }, t2: { n: 'Gutting Cut', per: { atk: 0.008, crit: 0.006 }, cap: { n: 'Open Wound', d: '15% chance to cause bleeding', fx: { bleed: 1 } } } },
      { id: 'b', n: 'Parmula', t1: { n: 'Small Shield', per: { def: 0.008, eva: 0.004 } }, t2: { n: 'Quick Guard', per: { def: 0.01 }, cap: { n: 'Thorned Rim', d: 'Reflect 5% of damage taken', fx: { thorns: 1 } } } },
      { id: 'c', n: 'Fury', t1: { n: 'Hot Blood', per: { spd: 0.008 } }, t2: { n: 'Thracian Rage', per: { atk: 0.01 }, cap: { n: 'Fury Rising', d: 'Up to +10% damage as HP drops', fx: { fury: 1 } } } },
    ],
    hoplomachus: [
      { id: 'a', n: 'Phalanx', t1: { n: 'Locked Shield', per: { def: 0.008 } }, t2: { n: 'Spear Wall', per: { def: 0.008, hp: 0.006 }, cap: { n: 'Aegis', d: 'Start each fight behind a shield worth 8% HP', fx: { shield: 1 } } } },
      { id: 'b', n: 'Doru', t1: { n: 'Reach', per: { atk: 0.008 } }, t2: { n: 'Heavy Thrust', per: { atk: 0.01, crit: 0.004 }, cap: { n: 'Armor Piercer', d: 'Ignore 8% of enemy armor', fx: { pen: 1 } } } },
      { id: 'c', n: 'Marshal', t1: { n: 'Steady Breath', per: { hp: 0.008 } }, t2: { n: 'Leader Voice', per: { spd: 0.008, hp: 0.006 }, cap: { n: 'Rally Cry', d: 'Skills and ultimates come 6% faster', fx: { haste: 1 } } } },
    ],
    dimachaerus: [
      { id: 'a', n: 'Twin Strike', t1: { n: 'Quick Hands', per: { spd: 0.008 } }, t2: { n: 'Flurry', per: { atk: 0.01 }, cap: { n: 'Whirling Frenzy', d: 'Each hit gives +3% attack speed (stacks)', fx: { frenzy: 1 } } } },
      { id: 'b', n: 'Duelist', t1: { n: 'Open Guard', per: { crit: 0.008 } }, t2: { n: 'Dancing Blades', per: { crit: 0.01, eva: 0.006 }, cap: { n: 'Counter Edge', d: '8% chance to counter-strike', fx: { riposte: 1 } } } },
      { id: 'c', n: 'Bloodied', t1: { n: 'Pain Tolerance', per: { hp: 0.008 } }, t2: { n: 'Blood Drinker', per: { hp: 0.006, atk: 0.006 }, cap: { n: 'Vampiric Edge', d: 'Heal 4% of damage dealt', fx: { vamp: 1 } } } },
    ],
  };
  const MAXR = { 1: 3, 2: 2 };
  /** the flat node list of a style: id 'a1' / 'a2' (branch letter + tier) */
  L.fTree = (style) => (TREES[style] || TREES.murmillo).map((b) => ({ id: b.id, n: b.n, nodes: [Object.assign({ id: b.id + '1', t: 1, max: MAXR[1], branch: b.id }, b.t1), Object.assign({ id: b.id + '2', t: 2, max: MAXR[2], branch: b.id, need: b.id + '1' }, b.t2)] }));
  L.fNode = (style, id) => { for (const b of L.fTree(style)) for (const n of b.nodes) if (n.id === id) return n; return null; };
  L.fPoints = (lvl) => Math.min(Math.max(0, lvl - 1), 10) + (lvl >= 15 ? 1 : 0) + (lvl >= 20 ? 1 : 0);
  L.fSpent = (g) => Object.keys(g.tk || {}).reduce((a, k) => a + (g.tk[k] | 0), 0);
  L.fFree = (g) => Math.max(0, L.fPoints(g.lvl || 1) - L.fSpent(g));
  L.fRank = (g, id) => ((g.tk || {})[id] | 0);
  L.fTalentWhy = (S, g, id) => {
    const n = L.fNode(g.style, id); if (!n) return 'Unknown talent';
    if (L.fRank(g, id) >= n.max) return 'Already at the top rank';
    if (L.fFree(g) <= 0) return 'No talent points left';
    if (n.need && L.fRank(g, n.need) < 2) return `Needs two ranks of ${L.fNode(g.style, n.need).n}`;
    return '';
  };
  L.fTalent = (S, g, id) => {
    L.fEnsure(S, g); const why = L.fTalentWhy(S, g, id); if (why) return why;
    g.tk[id] = L.fRank(g, id) + 1; const n = L.fNode(g.style, id);
    if (n.t === 2 && g.tk[id] >= n.max) L.fLog(S, g, 'cap' + id, `Mastered ${n.cap.n}.`);
    return '';
  };
  L.fRespecCost = (g) => (L.fSpent(g) ? 40 + 12 * L.fSpent(g) : 0);
  L.fRespec = (S, g) => { const c = L.fRespecCost(g); if (!c) return 'Nothing to reset'; if (S.gold < c) return 'Not enough gold'; S.gold -= c; g.tk = {}; L.fLog(S, g, null, 'Unlearned their old habits and started again.'); return ''; };
  /** the stat shades the talents give right now (and capstone fx) */
  L.fTalentMods = (g) => {
    const m = {}, fx = {}; if (!g.tk) return { m, fx };
    for (const b of L.fTree(g.style)) for (const n of b.nodes) { const r = Math.min(n.max, g.tk[n.id] | 0); if (!r) continue; addTo(m, n.per, r); if (n.cap && r >= n.max) addTo(fx, n.cap.fx); }
    return { m, fx };
  };

  // weapon mastery: grows by use, one track per weapon (a style change keeps what the hands have learned)
  const WEAPON_OF = { murmillo: 'sword', thraex: 'sword', retiarius: 'spear', hoplomachus: 'spear', dimachaerus: 'dual' };
  const WEAPONS = {
    sword: { n: 'Gladius and sica', perks: ['Steady Grip', 'Edge Sense', 'Blade Dance', 'Master of the Sword'] },
    spear: { n: 'Spear and trident', perks: ['Long Reach', 'Point Control', 'Hooking Haft', 'Master of the Spear'] },
    dual: { n: 'Twin blades', perks: ['Quick Hands', 'Crossing Cuts', 'Whirling Steel', 'Master of Two Blades'] },
  };
  const MTIER = [{ n: 'Novice', at: 0, m: {} }, { n: 'Handy', at: 6, m: { atk: 0.005 } }, { n: 'Skilled', at: 18, m: { crit: 0.005 } }, { n: 'Expert', at: 36, m: { atk: 0.008 } }, { n: 'Master', at: 60, m: { crit: 0.01, spd: 0.005 } }];
  L.fWeaponOf = (g) => WEAPON_OF[g.style] || 'sword';
  L.fWEAPONS = WEAPONS; L.fMTIER = MTIER;
  L.fMastery = (g, w) => {
    w = w || L.fWeaponOf(g); const v = (g.wm || {})[w] || 0; let t = 0; MTIER.forEach((x, i) => { if (v >= x.at) t = i; });
    const nxt = MTIER[t + 1]; return { w, v, tier: t, n: MTIER[t].n, next: nxt ? nxt.at : null, perk: t > 0 ? WEAPONS[w].perks[t - 1] : '', perks: WEAPONS[w].perks };
  };
  const masteryMods = (g) => { const m = {}, t = L.fMastery(g).tier; for (let i = 1; i <= t; i++) addTo(m, MTIER[i].m); return m; };

  // renown titles earned from stats and deeds; the worn one shows on the nameplate and profile
  const TITLES = [
    { id: 'butcher', n: 'The Butcher', short: 'The Butcher', d: 'Finish 4 beaten foes', fame: 0.04, ok: (g) => (g.kl | 0) >= 4 },
    { id: 'merciful', n: 'The Merciful', short: 'Merciful', d: 'Spare 3 beaten foes', fame: 0.04, ok: (g) => (g.sp | 0) >= 3 },
    { id: 'fox', n: 'Sand Fox', short: 'Sand Fox', d: 'Take far less than you give over 6 fights', fame: 0.03, ok: (g) => g.ls && g.ls.fights >= 6 && g.ls.taken <= g.ls.dmg * 0.6 },
    { id: 'undefeated', n: 'The Undefeated', short: 'Undefeated', d: 'Win 8 fights without a loss', fame: 0.05, ok: (g) => g.rec && g.rec.l === 0 && g.rec.w >= 8 },
    { id: 'giant', n: 'Giant-Killer', short: 'Giant-Killer', d: 'Win 3 fights as the underdog', fame: 0.04, ok: (g) => (g.up | 0) >= 3 },
    { id: 'darling', n: "Crowd's Darling", short: 'Darling', d: 'Fan love at 80', fame: 0.03, ok: (g) => (g.fav || 0) >= 80 },
    { id: 'unbroken', n: 'The Unbroken', short: 'Unbroken', d: 'Carry 2 scars and 10 wins', fame: 0.04, ok: (g) => (g.scars || []).length >= 2 && g.rec && g.rec.w >= 10 },
    { id: 'wolf', n: 'The Old Wolf', short: 'Old Wolf', d: 'Win 20 fights at age 35 or more', fame: 0.04, ok: (g) => (g.age || 0) >= 35 && g.rec && g.rec.w >= 20 },
    { id: 'champion', n: 'The Champion', short: 'Champion', d: 'Reach level 15 with 25 wins', fame: 0.05, ok: (g) => g.lvl >= 15 && g.rec && g.rec.w >= 25 },
  ];
  L.fTITLES = TITLES;
  L.fTitleDef = (id) => TITLES.find((t) => t.id === id);
  L.fTitles = (S, g) => {
    L.fEnsure(S, g); g.tt = Array.isArray(g.tt) ? g.tt : []; const fresh = [];
    TITLES.forEach((t) => { if (!g.tt.includes(t.id) && t.ok(g)) { g.tt.push(t.id); fresh.push(t); L.fLog(S, g, 't' + t.id, `Earned the name "${t.n}".`); } });
    if (fresh.length && !L.fTitleDef(g.rn)) g.rn = fresh[0].id;
    return fresh;
  };
  L.fSetTitle = (g, id) => { if (id === '' || id == null) { delete g.rn; return ''; } if (!(g.tt || []).includes(id)) return 'Not earned yet'; g.rn = id; return ''; };
  /** the nameplate suffix, e.g. ' · Sand Fox' (empty when no title is worn) */
  L.fighters.plate = (g) => { const t = g && L.fTitleDef(g.rn); return t ? ' · ' + t.short : ''; };
  const titleFame = (g) => { const t = L.fTitleDef(g.rn); return t ? t.fame : 0; };

  // ============================================================ 5. relationships
  L.fRelOf = (S, a, b) => { const r = (isObj(S.fr) && S.fr[bkey(a, b)]) || {}; return { bro: r.bro || 0, fond: r.fond || 0, jeal: r.jeal || 0, gr: r.gr || 0, n: r.n || 0, bond: L.bond(S, a, b), riv: L.rivalryOf(S, a, b) }; };
  const relRec = (S, a, b) => { if (!isObj(S.fr)) S.fr = {}; const k = bkey(a, b); return (S.fr[k] = S.fr[k] || { bro: 0, fond: 0, jeal: 0, gr: 0, n: 0 }); };
  /** kinds of one pair, strongest first: sworn, fond, friend, jealous, grudge */
  L.fKinds = (S, a, b) => {
    const r = L.fRelOf(S, a, b), k = [];
    if (r.bro) k.push('sworn'); if (r.fond) k.push('fond'); if (!r.bro && r.bond >= 25) k.push('friend'); if (r.jeal) k.push('jealous'); if (r.gr > 0) k.push('grudge');
    return k;
  };
  const KIND_TXT = {
    sworn: { n: 'Sworn brothers', d: '+3% damage and armor for each, more with complementary roles. If one falls the other loses 12 morale.' },
    friend: { n: 'Friends', d: '+1.5% armor while on the same team.' },
    fond: { n: 'Fond', d: '+2% armor while together. If the other falls, a heavy loss of morale.' },
    jealous: { n: 'Jealous', d: '+2% damage but -2% armor while on the same team: trying to outshine.' },
    grudge: { n: 'Grudge', d: '-3% damage for both on the same team once it runs deep. Settle it in a sparring bout or it festers.' },
  };
  L.fKIND = KIND_TXT;
  const complementary = (r1, r2) => { const front = (r) => r === 'vanguard' || r === 'anchor', back = (r) => r === 'hunter' || r === 'flanker' || r === 'skirmisher'; return (front(r1) && back(r2)) || (front(r2) && back(r1)); };
  /** team shades by fighter id: { id: {atk, def, crit...} } from relationships in this team (and the battle-plan roles); capped at 6% per stat */
  function teamShades(S, glads, plan) {
    if (!isObj(S.fr) && !glads.some((g) => g.q)) return null;
    const out = {}, roles = (plan && plan.roles) || {}, get = (id) => (out[id] = out[id] || {});
    for (let i = 0; i < glads.length; i++) {
      const A = glads[i];
      // loyal: +3% armor beside any bonded comrade
      if (A.q && A.q.includes('loyal') && glads.some((B) => B !== A && L.bond(S, A.id, B.id) >= 30)) addTo(get(A.id), { def: 0.03 });
      for (let j = i + 1; j < glads.length; j++) {
        const B = glads[j], r = L.fRelOf(S, A.id, B.id), k = (id, m, f = 1) => addTo(get(id), m, f);
        const cp = complementary(roles[A.id], roles[B.id]) ? 1.5 : 1;
        if (r.bro) { k(A.id, { atk: 0.03, def: 0.03 }, cp); k(B.id, { atk: 0.03, def: 0.03 }, cp); }
        else if (r.bond >= 25) { k(A.id, { def: 0.015 }); k(B.id, { def: 0.015 }); }
        if (r.fond) { k(A.id, { def: 0.02 }); k(B.id, { def: 0.02 }); }
        if (r.jeal) { const who = r.jeal; k(who, { atk: 0.02, def: -0.02 }); }
        if (r.gr >= 30) { k(A.id, { atk: -0.03 }); k(B.id, { atk: -0.03 }); }
      }
    }
    for (const id in out) for (const key in out[id]) out[id][key] = clamp(out[id][key], -0.06, 0.06);
    return out;
  }
  L.fTeamShades = teamShades;
  const teamCtx0 = L.teamCtx;
  L.teamCtx = (S, glads, stance, plan) => {
    const ctx = teamCtx0(S, glads, stance, plan);
    if (S && glads.length > 1) { const fb = teamShades(S, glads, ctx.plan); if (fb) ctx.fb = fb; }
    return ctx;
  };
  const pairText = (S, a, b) => L.fKinds(S, a.id, b.id).map((k) => KIND_TXT[k].n).join(', ');
  L.fPairText = pairText;

  L.fSwearWhy = (S, a, b) => { const r = L.fRelOf(S, a.id, b.id); if (r.bro) return 'Already sworn brothers'; if (r.bond < 45) return 'Needs a bond of 45'; if (r.gr > 0) return 'Settle the grudge first'; if (S.gold < 30) return 'Costs 30 gold for the wine and the oath'; return ''; };
  L.fSwear = (S, a, b) => {
    const why = L.fSwearWhy(S, a, b); if (why) return why; S.gold -= 30; const r = relRec(S, a.id, b.id); r.bro = S.week; L.addBond(S, a.id, b.id, 10);
    a.mo = clamp(a.mo + 6, 0, 100); b.mo = clamp(b.mo + 6, 0, 100);
    L.fLog(S, a, 'bro' + b.id, `Swore the oath of brotherhood with ${b.name}.`); L.fLog(S, b, 'bro' + a.id, `Swore the oath of brotherhood with ${a.name}.`);
    L.forumAdd && L.forumAdd(S, `${a.name} and ${b.name} swore brotherhood over a cup of wine.`); return '';
  };
  L.fSparWhy = (S, a, b) => { if (a.inj > 0 || b.inj > 0) return 'An injured fighter cannot spar'; if (a.en < 30 || b.en < 30) return 'Both need 30 energy'; return ''; };
  /** settle a feud in a seeded sparring bout (never the game's random stream). The loser has a 20% chance to be hurt for a week. */
  L.fSparBout = (S, a, b) => {
    const why = L.fSparWhy(S, a, b); if (why) return { err: why };
    let win = null;
    L.withRandom(L.mulberry(hs('spar', S.seed || 0, S.week, a.id, b.id)), () => {
      const ca = L.teamCtx(null, [a], 'bal'), cb = L.teamCtx(null, [b], 'bal'), F = L.quick(L.mkUnits([a], 'A', ca), L.mkUnits([b], 'B', cb));
      win = F.winner === 'A' ? a : b;
    });
    const lose = win === a ? b : a, r = relRec(S, a.id, b.id), had = r.gr > 0; r.gr = 0; if (S.rivalry) S.rivalry[bkey(a.id, b.id)] = 0;
    win.mo = clamp(win.mo + 6, 0, 100); lose.mo = clamp(lose.mo - 4, 0, 100); a.en = clamp(a.en - 15, 0, 100); b.en = clamp(b.en - 15, 0, 100);
    L.addBond(S, a.id, b.id, had ? 12 : 4); const hurt = roll('sparhurt', S.week, a.id, b.id) < 0.2; if (hurt) lose.inj = Math.max(lose.inj, 1);
    L.fLog(S, win, null, `Beat ${lose.name} in a sparring bout${had ? ' and ended the feud' : ''}.`); L.fLog(S, lose, null, `Lost a sparring bout to ${win.name}${had ? ', and made peace' : ''}.`);
    return { win, lose, hurt, had, line: `${win.name} beats ${lose.name} in the yard.${had ? ' The grudge ends in a handshake and a bruise.' : ''}${hurt ? ` ${lose.name} is hurt for a week.` : ''}` };
  };
  /** the barracks web: every pair that has a bond kind, newest and strongest first */
  L.fWeb = (S) => {
    const out = { sworn: [], friend: [], fond: [], jealous: [], grudge: [] }, gl = S.glads.filter((g) => !g.beast);
    for (let i = 0; i < gl.length; i++) for (let j = i + 1; j < gl.length; j++) { L.fKinds(S, gl[i].id, gl[j].id).forEach((k) => out[k].push({ a: gl[i], b: gl[j], r: L.fRelOf(S, gl[i].id, gl[j].id) })); }
    out.friend.sort((x, y) => y.r.bond - x.r.bond); out.grudge.sort((x, y) => y.r.gr - x.r.gr); return out;
  };

  // ============================================================ 6. the derive shade
  function shade(g, ctx) {
    const m = {}, fx = {};
    const o = ORIGINS[g.org]; if (o) addTo(m, o.mods);
    (g.q || []).forEach((id) => { const q = QUIRKS[id]; if (q) addTo(m, q.mods); });
    if (g.age) addTo(m, L.fStage(g).mods);
    if (g.tk) { const t = L.fTalentMods(g); addTo(m, t.m); addTo(fx, t.fx); }
    if (g.wm) addTo(m, masteryMods(g));
    if (typeof g.swan === 'number') addTo(m, { atk: 0.08, hp: 0.06 });
    if (ctx && ctx.fb && ctx.fb[g.id]) addTo(m, ctx.fb[g.id]);
    return { m, fx };
  }
  L.fShade = shade;
  const derive1 = L.derive;
  L.derive = (g, ctx) => {
    const d = derive1(g, ctx);
    if (L.fighters.off || !g || g.beast || !(g.org || g.q || g.tk || g.wm || g.age)) return d;
    const s = shade(g, ctx), m = s.m;
    for (const k of ['hp', 'atk', 'def', 'spd']) if (m[k]) d[k] *= 1 + clamp(m[k], -0.2, 0.2);
    if (m.crit) d.crit = clamp(d.crit + clamp(m.crit, -0.1, 0.1), 0, 0.6); if (m.eva) d.eva = clamp(d.eva + clamp(m.eva, -0.1, 0.1), 0, 0.4);
    for (const k in s.fx) d.fx[k] = (d.fx[k] || 0) + s.fx[k];
    return d;
  };
  /** every shade a fighter carries, as labelled rows for the profile: [{src, mods, text}] */
  L.fShadeRows = (g, S) => {
    const rows = [], row = (src, m, extra) => { if (m && KEYS.some((k) => m[k])) rows.push({ src, mods: m, text: modLine(m) + (extra ? ', ' + extra : '') }); };
    const o = ORIGINS[g.org]; if (o) row(o.n, o.mods); (g.q || []).forEach((id) => { const q = QUIRKS[id]; if (q) row(q.n, q.mods); });
    if (g.age) row(L.fStage(g).n, L.fStage(g).mods); const t = L.fTalentMods(g); row('Talents', t.m); row('Weapon mastery', masteryMods(g));
    if (typeof g.swan === 'number') row('Last fight', { atk: 0.08, hp: 0.06 });
    return rows;
  };

  // ============================================================ 7. hooks: fights, fate, falls, events, upkeep, week
  const addMo = (g, d) => { g.mo = clamp(g.mo + d, 0, 100); };
  L.fAfterFight = (S, ev, glads, res, rep) => {
    const win = !!(res && (res.win || res.place === 1)), n = Math.max(1, glads.length); let fameAdd = 0, goldAdd = 0;
    glads.forEach((g) => {
      if (g.beast) return; L.fEnsure(S, g); const base = win ? 10 : -8; let d = 0, damp = 1;
      L.fQuirks(g).forEach((q) => { d += (win ? q.w : q.l) || 0; if (q.damp != null) damp *= q.damp; fameAdd += (q.fame || 0) * (rep.fame || 0) / n; goldAdd += (q.gold || 0) * (rep.gold || 0) / n; });
      d += base * (damp - 1); if (d) addMo(g, d);
      fameAdd += titleFame(g) * (rep.fame || 0) / n;
      const wk = L.fWeaponOf(g); g.wm[wk] = (g.wm[wk] || 0) + (win ? 2 : 1) + ((res && res.show) ? 0 : 0);
      if (win && res.odds != null && res.odds < 0.4) g.up = (g.up | 0) + 1;
      if (win && g.rec.w === 1) L.fLog(S, g, 'first', `First victory: ${ev.title || ev.kind}.`);
      if (g.rec.l === 1 && !win) L.fLog(S, g, 'firstl', 'First defeat, and the sand tasted of iron.');
      if (rep.lvl) rep.lvl.forEach((x) => { if (x.id === g.id && x.to % 5 === 0) L.fLog(S, g, 'lv' + x.to, `Reached level ${x.to}.`); });
      if (rep.inj) rep.inj.forEach((x) => { if (x.id === g.id) L.fLog(S, g, 'inj' + S.week, 'Carried off the sand with a wound.'); });
      if ((g.scars || []).length && (g.scars || []).length !== g.lsc) { if (g.lsc != null) L.fLog(S, g, 'sc' + g.scars.length, 'Took a scar that will not fade.'); g.lsc = g.scars.length; }
      if (g.swan != null && typeof g.swan === 'number') { g.swan = 'done'; L.fLog(S, g, 'swan', win ? 'Won a last fight, to roars from the stands.' : 'Fought a last fight and lost it with dignity.'); if (win) { fameAdd += 15 + g.lvl; } }
      L.fTitles(S, g).forEach((t) => rep.notes && rep.notes.push(`${g.name} is now known as "${t.n}".`));
    });
    for (let i = 0; i < glads.length; i++) for (let j = i + 1; j < glads.length; j++) {
      const A = glads[i], B = glads[j]; relRec(S, A.id, B.id).n++;
      const mul = ((A.q || []).map((q) => QUIRKS[q] && QUIRKS[q].bond).filter((x) => x != null).reduce((a, x) => a * x, 1)) * ((B.q || []).map((q) => QUIRKS[q] && QUIRKS[q].bond).filter((x) => x != null).reduce((a, x) => a * x, 1));
      if (mul !== 1) L.addBond(S, A.id, B.id, Math.round(4 * (mul - 1)));    // settle already added +4
    }
    fameAdd = Math.round(fameAdd); goldAdd = Math.round(goldAdd);
    if (fameAdd) { S.fame = Math.max(0, S.fame + fameAdd); rep.fame = (rep.fame || 0) + fameAdd; rep.notes && rep.notes.push(`Temperament and renown ${fameAdd > 0 ? 'add' : 'cost'} ${Math.abs(fameAdd)} fame.`); }
    if (goldAdd) { S.gold += goldAdd; rep.gold = (rep.gold || 0) + goldAdd; rep.notes && rep.notes.push(`Greedy hands squeeze ${goldAdd} gold more from the purse.`); }
  };
  const settle0 = L.settle;
  L.settle = (S, ev, glads, res) => { const rep = settle0(S, ev, glads, res); L.fAfterFight(S, ev, glads, res, rep); return rep; };

  // fate: sparing or killing a beaten foe shades morale by temperament and keeps the tally behind Merciful / The Butcher
  const fate0 = L.fate;
  L.fate = (S, ev, rep, choice, foe) => {
    const r = fate0(S, ev, rep, choice, foe);
    if (r && rep && rep.xp && (choice === 'spare' || choice === 'kill')) {
      rep.xp.forEach((x) => {
        const g = S.glads.find((y) => y.id === x.id); if (!g) return; L.fEnsure(S, g);
        L.fQuirks(g).forEach((q) => { const d = choice === 'spare' ? q.spare : q.kill; if (d) addMo(g, d); });
        if (choice === 'spare') { g.sp = (g.sp | 0) + 1; L.fLog(S, g, null, `Spared ${foe && foe.name ? foe.name : 'a beaten foe'}.`); } else { g.kl = (g.kl | 0) + 1; L.fLog(S, g, null, `Finished ${foe && foe.name ? foe.name : 'a beaten foe'}.`); }
        L.fTitles(S, g).forEach((t) => rep.notes && rep.notes.push(`${g.name} is now known as "${t.n}".`));
      });
    }
    return r;
  };

  // a fall: brothers, the fond, and old enemies all feel it; the heir carries a trait of the fallen
  const fall0 = L.fall;
  L.fall = (S, g, o) => {
    L.fEnsure(S, g); const others = S.glads.filter((x) => x !== g), kin = [];
    others.forEach((x) => {
      L.fEnsure(S, x); const r = L.fRelOf(S, g.id, x.id); let d = 0, why = '';
      L.fQuirks(x).forEach((q) => { d -= q.grief || 0; });
      if (r.bro) { d -= 12; why = 'brother'; x.grief = Math.max(x.grief || 0, 4); } if (r.fond) { d -= 10; why = why || 'fond'; } if (r.gr > 0) { d -= 3; why = why || 'grudge'; }
      if (d) { addMo(x, d); kin.push({ id: x.id, name: x.name, d, why }); }
      if (r.bro) L.fLog(S, x, 'fall' + g.id, `Lost their sworn brother ${g.name} to the arena.`); else if (r.fond || r.bond >= 40) L.fLog(S, x, 'fall' + g.id, `Mourned ${g.name}.`);
    });
    const res = fall0(S, g, o);
    if (S.heirPending) { S.heirPending.q = g.q && g.q[0]; S.heirPending.org = g.org; }
    if (res && typeof res === 'object') res.kin = kin;
    if (isObj(S.fr)) for (const k of Object.keys(S.fr)) if (k.split('-').includes(String(g.id))) delete S.fr[k];
    return res;
  };
  if (L.heirRecruit) {
    const hr0 = L.heirRecruit;
    L.heirRecruit = (S) => { const g = hr0(S); if (g) { const p = S.heirPending || {}; L.fEnsure(S, g); g.org = 'heir'; if (p.q && QUIRKS[p.q]) g.q = [p.q, g.q.find((x) => x !== p.q && !QUIRKS[p.q].no.includes(x)) || g.q[1]]; g.age = g.ag0 ? g.ag0[0] : g.age; } return g; };
  }

  // event outcomes: morale swings from an event are shaded by temperament (stoic halves, proud feels slights, pious takes good news to heart)
  const apply0 = L.applyFx;
  L.applyFx = (S, fx, ctx) => {
    const before = new Map(S.glads.map((g) => [g, g.mo])), out = apply0(S, fx, ctx);
    S.glads.forEach((g) => {
      if (!before.has(g) || g.mo === before.get(g) || !g.q) return; const d = g.mo - before.get(g); let f = 1;
      L.fQuirks(g).forEach((q) => { f *= (d < 0 ? q.evN : q.evP) || 1; });
      if (f !== 1) g.mo = clamp(Math.round(before.get(g) + d * f), 0, 100);
    });
    return out;
  };
  const upkeep0 = L.upkeep;
  L.upkeep = (S) => {
    let u = upkeep0(S); const per = (g) => Math.round((6 + g.lvl * 0.8) * (1 + (D.TRAITS[g.trait].upkeep || 0)));
    S.glads.forEach((g) => { if ((g.q || []).includes('greedy')) u += Math.round(per(g) * 0.1); });
    return u + (Array.isArray(S.trainers) ? S.trainers.length * 12 : 0);
  };

  // ---------- retirement
  L.fRetireOpts = (S, g) => {
    const fee = 150 + g.lvl * 40, fame = 10 + g.lvl * 3 + (g.rec ? g.rec.w : 0), tr = (S.trainers || []).length;
    return [
      { id: 'rudis', n: 'Buy freedom (the rudis)', fee, fame, why: g.lvl < 5 ? 'Needs level 5' : S.gold < fee ? `Needs ${fee} gold` : '', d: `Pay ${fee} gold for the wooden sword. They walk out a free person; the city talks about your ludus: +${fame} fame, +2 morale for everyone left.` },
      { id: 'trainer', n: 'Retire as a trainer', fee: 0, why: g.lvl < 8 ? 'Needs level 8' : tr >= 3 ? 'Three trainers already' : '', d: 'They join the Hall of Legends and stay as a permanent trainer: each week they coach one fighter (XP, and a point of their best stat every six weeks). Costs 12 gold a week.' },
      { id: 'last', n: 'One last fight', fee: 0, why: g.lvl < 8 ? 'Needs level 8' : typeof g.swan === 'number' ? 'Already chosen' : '', d: 'Stays for one more fight at +8% damage and +6% HP, win or lose, then retires to the Hall of Legends. Winning adds a burst of fame. The fight can end badly.' },
    ];
  };
  L.fRetire = (S, g, id) => {
    L.fEnsure(S, g); const o = L.fRetireOpts(S, g).find((x) => x.id === id); if (!o) return { err: 'Unknown option' }; if (o.why) return { err: o.why };
    if (id === 'rudis') {
      S.gold -= o.fee; S.fame += o.fame; S.freed = (S.freed || []).concat([{ name: g.name, wk: S.week, lvl: g.lvl, via: 'rudis' }]).slice(-20); S.stats.freed = (S.stats.freed | 0) + 1;
      S.glads.forEach((x) => { if (x !== g) addMo(x, 2); });
      (S.glads || []).forEach((x) => { if (x !== g && L.fRelOf(S, g.id, x.id).bro) addMo(x, -4); });
      L.forumAdd && L.forumAdd(S, `${g.name} bought the rudis and walked out of the gate a free person.`);
      L.release(S, g); return { ok: true, id, msg: `${g.name} leaves with the wooden sword. +${o.fame} fame.` };
    }
    if (id === 'trainer') {
      const snap = { id: g.id, name: g.name, nick: g.nick || '', style: g.style, lvl: g.lvl, best: D.STATS.reduce((a, s) => (g.st[s] > g.st[a] ? s : a), 'str'), w: g.rec.w, l: g.rec.l, skin: g.skin, hair: g.hair, plume: g.plume, face: g.face, age: g.age, q: (g.q || []).slice(), org: g.org, look: g.look ? Object.assign({}, g.look) : null, rn: g.rn || '', wk: S.week, p: 0 };
      const e = L.retire(S, g); if (e) return { err: e };
      S.trainers = (Array.isArray(S.trainers) ? S.trainers : []).concat([snap]); return { ok: true, id, msg: `${g.name} takes up the trainer's staff.` };
    }
    g.swan = S.week; L.fLog(S, g, 'swanc', 'Asked for one last fight.'); return { ok: true, id, msg: `${g.name} will fight once more, then retire.` };
  };
  L.fSwanCancel = (g) => { if (typeof g.swan === 'number') { delete g.swan; return ''; } return 'No last fight is planned'; };
  L.fTrainerPupil = (S, t) => {
    const gl = S.glads.filter((x) => !x.beast); const pick = gl.find((x) => x.id === t.p); if (pick) return pick;
    return gl.filter((x) => x.style === t.style && x.lvl < t.lvl).sort((a, b) => a.lvl - b.lvl)[0] || gl.filter((x) => x.lvl < t.lvl).sort((a, b) => a.lvl - b.lvl)[0] || null;
  };

  // ---------- the weekly pass
  L.fWeek = (S, rep) => {
    rep = rep || { notes: [] }; rep.notes = rep.notes || []; let said = 0; const say = (t) => { if (said++ < 3) rep.notes.push(t); };
    S.glads.forEach((g) => { if (g.beast) return; const a0 = g.age; L.fEnsure(S, g); if (a0 && g.age > a0) { L.fLog(S, g, 'age' + g.age, `Turned ${g.age}.`); if (g.age === 34 || g.age === 38 || g.age === 42) say(`${g.name} is ${L.fStage(g).n.toLowerCase()} now: ${L.fStage(g).d}.`); } });
    // quirk weeklies
    S.glads.forEach((g) => { if (g.beast) return; L.fQuirks(g).forEach((q) => { if (q.wk) addMo(g, q.wk); if (q.id === 'greedy' && S.gold < 100) addMo(g, -2); }); });
    // trainers coach
    (Array.isArray(S.trainers) ? S.trainers : []).forEach((t) => {
      const p = L.fTrainerPupil(S, t); if (!p) return; const same = p.style === t.style ? 1 : 0.5;
      const xp = Math.round((8 + t.lvl * 0.8) * same); const up = L.addXp(p, xp); L.addBond(S, t.id, p.id, 0);
      if ((S.week - t.wk) % 6 === 0 && p.lvl < 30) { const b = t.best; p.st[b] += 0.8 * same; }
      if (up.length) { L.diary(S, p, `Coached by ${t.name}: level ${up[up.length - 1]}.`); L.fLog(S, p, 'tr' + t.id, `Trained under the old master ${t.name}.`); say(`${t.name} coaches ${p.name} to level ${up[up.length - 1]}.`); }
    });
    // last fights are over: retire
    S.glads.filter((g) => g.swan === 'done').forEach((g) => { delete g.swan; const nm = g.name, e = L.retire(S, g); if (!e) say(`${nm} hangs up the sword with the crowd on their feet.`); });
    // relationships (at most one new bond per week keeps the barracks readable)
    if (!isObj(S.fr)) S.fr = {}; let born = 0; const gl = S.glads.filter((g) => !g.beast);
    for (let i = 0; i < gl.length; i++) for (let j = i + 1; j < gl.length; j++) {
      const A = gl[i], B = gl[j], k = bkey(A.id, B.id), r = S.fr[k] || null, R = L.fRelOf(S, A.id, B.id);
      const clash = (A.q || []).some((q) => QUIRKS[q] && QUIRKS[q].clash) || (B.q || []).some((q) => QUIRKS[q] && QUIRKS[q].clash) || (A.q || []).includes('proud') && (B.q || []).includes('proud') || (A.q || []).includes('showy') && (B.q || []).includes('showy');
      if (!R.bro && R.bond >= 75 && R.n >= 8 && born < 1) { relRec(S, A.id, B.id).bro = S.week; born++; addMo(A, 5); addMo(B, 5); L.fLog(S, A, 'bro' + B.id, `Became brothers in all but blood with ${B.name}.`); L.fLog(S, B, 'bro' + A.id, `Became brothers in all but blood with ${A.name}.`); say(`${A.name} and ${B.name} have fought side by side so long they are sworn brothers now.`); continue; }
      if (!R.gr && !R.bro && born < 1 && ((R.riv >= 25) || (clash && R.bond < 30 && roll('gr', S.seed || 0, S.week, k) < 0.05))) { relRec(S, A.id, B.id).gr = Math.max(10, Math.round(R.riv)); born++; L.fLog(S, A, 'gr' + B.id, `Fell out with ${B.name}.`); L.fLog(S, B, 'gr' + A.id, `Fell out with ${A.name}.`); say(`${A.name} and ${B.name} have fallen out. Settle it in the yard before it festers.`); continue; }
      if (r && r.gr > 0) {
        const grow = (clash ? 3 : 1) * ((A.q || []).includes('grudgeholder') || (B.q || []).includes('grudgeholder') ? 2 : 1) - (R.bond >= 30 ? 2 : 0);
        r.gr = clamp(r.gr + grow, 0, 100);
        if (r.gr >= 60) { addMo(A, -1); addMo(B, -1); }
        if (r.gr >= 100) { r.gr = 50; const w = roll('brawl', S.week, k) < 0.5 ? A : B; w.inj = Math.max(w.inj, 1); addMo(A, -8); addMo(B, -8); L.addBond(S, A.id, B.id, -10); L.fLog(S, A, 'brawl' + S.week, `Brawled with ${B.name} in the barracks.`); say(`${A.name} and ${B.name} came to blows in the barracks. ${w.name} is hurt for a week.`); }
        if (r.gr <= 0) delete r.gr;
      }
      if (!R.fond && !R.bro && born < 1 && R.bond >= 20 && R.bond < 70) {
        const who = [A, B].find((x) => (x.q || []).some((q) => q === 'charming' || q === 'loyal' || q === 'gentle' || q === 'pious')), other = who === A ? B : A;
        if (who && !gl.some((x) => S.fr && Object.keys(S.fr).some((kk) => S.fr[kk].fond === who.id)) && roll('fond', S.seed || 0, S.week, k) < 0.03) { relRec(S, A.id, B.id).fond = who.id; born++; L.fLog(S, who, 'fond' + other.id, `Grew fond of ${other.name}.`); say(`${who.name} has grown fond of ${other.name}. It shows on the sand.`); continue; }
      }
      if (!R.jeal && R.fond && born < 1) {
        const rival = gl.find((x) => x !== A && x !== B && L.bond(S, B.id, x.id) > R.bond + 15 && x.id !== R.fond);
        if (rival) { const fond = R.fond === A.id ? A : B, lover = fond === A ? B : A; relRec(S, fond.id, rival.id).jeal = fond.id; born++; L.fLog(S, fond, 'jeal' + rival.id, `Grew jealous of ${rival.name}.`); say(`${fond.name} watches ${rival.name} with a sour face. A little jealousy never helped a shield wall.`); }
      }
      if (!R.jeal && born < 1 && (A.fame || 0) > 12 && (B.fame || 0) * 2 < (A.fame || 0) && Math.abs(A.lvl - B.lvl) <= 2 && (B.q || []).some((q) => q === 'proud' || q === 'showy') && roll('jl', S.seed || 0, S.week, k) < 0.03) { relRec(S, A.id, B.id).jeal = B.id; born++; L.fLog(S, B, 'jeal' + A.id, `Grew jealous of ${A.name}'s fame.`); say(`${B.name} resents the cheers ${A.name} earns.`); }
    }
    // clean relation entries of people who left
    const ids = new Set(S.glads.map((g) => String(g.id))); for (const k of Object.keys(S.fr)) { const [a, b] = k.split('-'); if (!ids.has(a) || !ids.has(b)) delete S.fr[k]; }
    // mentor tales and titles
    (S.mentors || []).forEach((m) => { const mm = S.glads.find((x) => x.id === m.m), pp = S.glads.find((x) => x.id === m.p); if (mm && pp) L.fLog(S, pp, 'mt' + mm.id, `Took ${mm.name} as a mentor.`); });
    S.glads.forEach((g) => { if (!g.beast) L.fTitles(S, g).forEach((t) => say(`${g.name} is now known as "${t.n}".`)); });
    // an aging fighter hears the retirement question
    const old = S.glads.find((g) => (g.age || 0) >= 40 && g.lvl >= 8 && !g.lk.oldnote); if (old) { old.lk.oldnote = 1; say(`${old.name} is ${old.age}. Consider a dignified end: freedom, a trainer's staff, or one last fight.`); }
    return rep;
  };
  const week0 = L.extWeek;
  L.extWeek = (S, rep) => { if (week0) week0(S, rep); L.fWeek(S, rep); };

  // ---------- migrate: every fighter and every recruit gets origin, quirks, age
  const migrate0 = L.migrate;
  L.migrate = (S) => {
    const N = migrate0(S); if (!isObj(N.fr)) N.fr = {}; if (!Array.isArray(N.trainers)) N.trainers = [];
    (N.glads || []).forEach((g) => L.fEnsure(N, g)); (N.recruits || []).forEach((g) => L.fEnsure(N, g)); return N;
  };
  if (L.ensureShops) { const es0 = L.ensureShops; L.ensureShops = (S) => { const r = es0(S); (S.recruits || []).forEach((g) => L.fEnsure(S, g)); return r; }; }

  // ============================================================ 8. look (customization data; rendering is in js/gladiator.js)
  const HAIR_STYLES = [['bald', 'Shaved'], ['crop', 'Cropped'], ['short', 'Short'], ['curls', 'Curls'], ['tied', 'Tied back'], ['long', 'Long'], ['braid', 'Braided']];
  const HAIR_COLS = [['Raven', '#1b1210'], ['Chestnut', '#4a2c17'], ['Auburn', '#8a5a2b'], ['Fair', '#d9a21b'], ['Red', '#b5472b'], ['Grey', '#6b6b73'], ['White', '#cfcac0'], ['Midnight', '#10141c']];
  const DYES = [['Crimson', '#a8452a'], ['Indigo', '#2c4a8c'], ['Forest', '#2f6b45'], ['Saffron', '#d09a24'], ['Violet', '#6b3f94'], ['Ivory', '#e6dcc2'], ['Onyx', '#2a2a30'], ['Rust', '#b4622c']];
  const CRESTS = [['Scarlet', '#d2412b'], ['Gold', '#f6b82d'], ['Azure', '#2f78c4'], ['Emerald', '#2a9d6f'], ['Amethyst', '#7b4fb8'], ['Ivory', '#f5ead2'], ['Ember', '#e8742a'], ['Onyx', '#26262c']];
  const TATS = [['none', 'None', 'Clean skin.'], ['woad', 'Woad spirals', 'Blue spirals on both upper arms, the mark of the northern tribes.'], ['bands', 'Forearm bands', 'Dark bands from wrist to elbow.'], ['sun', 'Sun mark', 'A broad mark across the chest.'], ['sleeve', 'Sleeve', 'One arm inked from shoulder to wrist.'], ['legion', 'Legion tally', 'Short tally strokes across the shoulders and back.']];
  const FACES = ['Heroic', 'Lean', 'Rugged'], BEARDS = ['Clean', 'Short beard', 'Full beard'];
  L.fighters.HAIR_STYLES = HAIR_STYLES; L.fighters.HAIR_COLS = HAIR_COLS; L.fighters.DYES = DYES; L.fighters.CRESTS = CRESTS; L.fighters.TATS = TATS; L.fighters.FACES = FACES; L.fighters.BEARDS = BEARDS;
  /** normalised look of a fighter (never mutates it): any missing part is null = "as generated" */
  L.fLook = (g) => { const k = g.look || {}; return { face: k.face != null ? k.face : null, hair: k.hair || null, hairCol: k.hairCol || null, beard: k.beard != null ? k.beard : null, tat: k.tat || null, dye: k.dye || null, crest: k.crest || null }; };
  L.fLookCost = (g, look) => { if (!g.look) return 0; return JSON.stringify(L.fLook(Object.assign({}, g, { look }))) === JSON.stringify(L.fLook(g)) ? 0 : 10; };
  L.fLookApply = (S, g, look) => {
    const c = L.fLookCost(g, look); if (S.gold < c) return 'Not enough gold';
    const ok = (v, list) => list.some((x) => x[0] === v || x[1] === v);
    const k = {};
    if (look.face != null) k.face = ((look.face | 0) % 3 + 3) % 3; if (look.beard != null) k.beard = ((look.beard | 0) % 3 + 3) % 3;
    if (look.hair && HAIR_STYLES.some((x) => x[0] === look.hair)) k.hair = look.hair; if (look.hairCol && /^#[0-9a-f]{6}$/i.test(look.hairCol)) k.hairCol = look.hairCol;
    if (look.dye && /^#[0-9a-f]{6}$/i.test(look.dye)) k.dye = look.dye; if (look.crest && /^#[0-9a-f]{6}$/i.test(look.crest)) k.crest = look.crest;
    if (look.tat && TATS.some((x) => x[0] === look.tat && x[0] !== 'none')) k.tat = look.tat;
    S.gold -= c; g.look = k; return '';
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
