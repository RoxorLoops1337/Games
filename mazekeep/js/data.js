// MAZEKEEP content library. Pure declarative data — the engine interprets it.
// Keeping content here lets us tune/expand the game without touching systems.
//
// ── Tower schema ────────────────────────────────────────────────────────────
//   id, name, cost, desc, color, glyph
//   range (tiles), damage, fireRate (shots/sec), projSpeed (tiles/sec, 0=hitscan)
//   splash (tiles, 0=single), pierce (extra targets a shot passes through)
//   effect: null | 'slow' | 'poison' | 'burn' | 'chain' | 'buff' | 'gold'
//   fx: parameters for the effect (see engine combat code)
//   blocks: true if it occupies/blocks a tile for pathing (almost all do)
//   attacks: false for pure utility (wall/pylon/mint)
//   air: can it target flying enemies
//
// ── Enemy schema ────────────────────────────────────────────────────────────
//   id, name, hp, speed (tiles/sec), bounty, leak (lives lost if it reaches core)
//   color, glyph, size (0..1 tile), armor (flat dmg reduction), shield (absorb pool)
//   flying, traits:['regen','split','heal','immuneSlow','boss', ...], minWave
//
// ── Upgrade card schema (run-wide roguelite picks) ───────────────────────────
//   id, name, rarity, desc, effects:[ Effect ]
//   Effect kinds the engine understands:
//     {kind:'stat', stat, mode:'mul'|'add', value, type?}  type scopes to a tower id
//     {kind:'flag', flag, value}    additive integer/bool engine flags
//     {kind:'special', id}          hardcoded handler in engine
//
// ── Omen schema (pre-wave risk/reward "influence the enemies coming") ─────────
//   id, name, desc, risk (1-3), curse:{hpMul,spdMul,countMul,armorAdd,trait,...}
//   reward:{goldMul, cardBonus, rerollAdd, shardAdd, lifeAdd}
//
(function () {
  'use strict';
  const TD = (window.TD = window.TD || {});

  const TOWERS = [
    { id: 'wall', name: 'Bulwark', cost: 8, color: '#6b7280', glyph: '▣',
      range: 0, damage: 0, fireRate: 0, projSpeed: 0, splash: 0, pierce: 0,
      attacks: false, blocks: true, air: false, effect: null,
      desc: 'Cheap blocker. Build a maze to force the long way round.' },

    { id: 'arrow', name: 'Archer Spire', cost: 50, color: '#7dd3fc', glyph: '➹',
      range: 3.0, damage: 8, fireRate: 1.6, projSpeed: 11, splash: 0, pierce: 0,
      attacks: true, blocks: true, air: true, effect: null,
      desc: 'Reliable single-target fire. Fast and cheap.' },

    { id: 'cannon', name: 'Mortar', cost: 95, color: '#fb923c', glyph: '◎',
      range: 2.8, damage: 24, fireRate: 0.65, projSpeed: 7, splash: 1.1, pierce: 0,
      attacks: true, blocks: true, air: false, effect: null,
      desc: 'Lobbed splash damage. Shreds tightly packed swarms.' },

    { id: 'frost', name: 'Frost Pylon', cost: 70, color: '#67e8f9', glyph: '❄',
      range: 2.9, damage: 4, fireRate: 1.3, projSpeed: 13, splash: 0, pierce: 0,
      attacks: true, blocks: true, air: true, effect: 'slow',
      fx: { slow: 0.45, dur: 1.6 },
      desc: 'Chills targets, slowing them. Combos with everything.' },

    { id: 'tesla', name: 'Arc Coil', cost: 125, color: '#c4b5fd', glyph: '⚡',
      range: 2.7, damage: 13, fireRate: 1.0, projSpeed: 0, splash: 0, pierce: 0,
      attacks: true, blocks: true, air: true, effect: 'chain',
      fx: { chain: 3, falloff: 0.78, range: 2.2 },
      desc: 'Hitscan lightning that arcs between nearby enemies.' },

    { id: 'venom', name: 'Venom Sprayer', cost: 80, color: '#86efac', glyph: '☣',
      range: 3.0, damage: 3, fireRate: 1.1, projSpeed: 10, splash: 0, pierce: 0,
      attacks: true, blocks: true, air: true, effect: 'poison',
      fx: { dps: 7, dur: 3.5 },
      desc: 'Stacks corrosive poison that ignores armor over time.' },

    { id: 'sniper', name: 'Longshot', cost: 145, color: '#fca5a5', glyph: '✛',
      range: 6.5, damage: 70, fireRate: 0.45, projSpeed: 0, splash: 0, pierce: 1,
      attacks: true, blocks: true, air: true, effect: null,
      fx: { crit: 0.25, critMul: 2.5 },
      desc: 'Huge range hitscan, pierces one target. Picks off elites.' },

    { id: 'flame', name: 'Pyre', cost: 110, color: '#f97316', glyph: '🔥',
      range: 2.1, damage: 6, fireRate: 3.2, projSpeed: 9, splash: 0.7, pierce: 0,
      attacks: true, blocks: true, air: false, effect: 'burn',
      fx: { dps: 9, dur: 2.2 },
      desc: 'Short-range rapid fire that sets enemies ablaze.' },

    { id: 'pylon', name: 'Resonator', cost: 100, color: '#fde047', glyph: '✦',
      range: 1.7, damage: 0, fireRate: 0, projSpeed: 0, splash: 0, pierce: 0,
      attacks: false, blocks: true, air: false, effect: 'buff',
      fx: { dmgMul: 1.3, rangeMul: 1.12, rateMul: 1.15 },
      desc: 'No attack — supercharges every tower in its aura.' },

    { id: 'mint', name: 'Gilded Mint', cost: 90, color: '#fbbf24', glyph: '⛃',
      range: 0, damage: 0, fireRate: 0, projSpeed: 0, splash: 0, pierce: 0,
      attacks: false, blocks: true, air: false, effect: 'gold',
      fx: { perWave: 28 },
      desc: 'Generates bonus gold at the end of every wave.' },
  ];

  const ENEMIES = {
    grunt:   { id:'grunt', name:'Grunt', hp:34, speed:1.15, bounty:5, leak:1, color:'#cbd5e1', glyph:'●', size:0.34, minWave:1 },
    runner:  { id:'runner', name:'Runner', hp:20, speed:2.2, bounty:4, leak:1, color:'#fde68a', glyph:'➤', size:0.3, minWave:2 },
    armored: { id:'armored', name:'Ironclad', hp:80, speed:0.95, bounty:11, leak:1, color:'#94a3b8', glyph:'◆', size:0.38, armor:5, minWave:3 },
    brute:   { id:'brute', name:'Brute', hp:150, speed:0.8, bounty:13, leak:2, color:'#f87171', glyph:'⬢', size:0.46, minWave:4 },
    swarm:   { id:'swarm', name:'Swarmling', hp:11, speed:1.6, bounty:2, leak:1, color:'#fca5a5', glyph:'·', size:0.24, minWave:3 },
    shield:  { id:'shield', name:'Bulwarker', hp:55, shield:45, speed:1.0, bounty:13, leak:1, color:'#7dd3fc', glyph:'⬗', size:0.4, minWave:5 },
    flyer:   { id:'flyer', name:'Wisp', hp:46, speed:1.5, bounty:9, leak:2, color:'#d8b4fe', glyph:'▲', size:0.32, flying:true, minWave:4 },
    healer:  { id:'healer', name:'Mender', hp:70, speed:1.0, bounty:16, leak:1, color:'#86efac', glyph:'✚', size:0.38, traits:['heal'], minWave:6 },
    splitter:{ id:'splitter', name:'Splitter', hp:60, speed:1.05, bounty:11, leak:1, color:'#fdba74', glyph:'◈', size:0.4, traits:['split'], splitInto:'swarm', splitCount:3, minWave:5 },
    regen:   { id:'regen', name:'Knitter', hp:90, speed:1.0, bounty:14, leak:1, color:'#fbcfe8', glyph:'❀', size:0.4, traits:['regen'], regen:6, minWave:7 },
    juggernaut:{ id:'juggernaut', name:'Juggernaut', hp:520, speed:0.62, bounty:45, leak:4, color:'#ef4444', glyph:'⬣', size:0.55, armor:8, traits:['elite'], minWave:8 },
    dasher:  { id:'dasher', name:'Quicksilver', hp:42, speed:2.9, bounty:8, leak:1, color:'#a5f3fc', glyph:'»', size:0.3, traits:['immuneSlow'], minWave:6 },
    bulwark: { id:'bulwark', name:'Siegecrawler', hp:240, speed:0.7, bounty:22, leak:2, color:'#64748b', glyph:'⬟', size:0.5, armor:14, minWave:9 },
    spore:   { id:'spore', name:'Sporeling', hp:85, speed:1.25, bounty:13, leak:2, color:'#bef264', glyph:'❉', size:0.36, flying:true, traits:['split'], splitInto:'swarm', splitCount:4, minWave:10 },
    phantom: { id:'phantom', name:'Phantom', hp:130, speed:1.35, bounty:20, leak:2, color:'#c4b5fd', glyph:'◇', size:0.38, traits:['phase','regen'], regen:8, minWave:12 },
  };

  // Boss definitions keyed by the wave they appear on (multiples of 5).
  const BOSSES = {
    5:  { id:'colossus', name:'The Colossus', hp:1400, speed:0.55, bounty:160, leak:6, color:'#dc2626', glyph:'☗', size:0.7, armor:6, traits:['boss'] },
    10: { id:'overmind', name:'Overmind', hp:2600, speed:0.6, bounty:240, leak:6, color:'#a855f7', glyph:'⊛', size:0.72, traits:['boss','spawner'], spawn:'swarm', spawnEvery:2.2, spawnCount:2 },
    15: { id:'wraithlord', name:'Wraith Lord', hp:4200, speed:0.8, bounty:340, leak:8, color:'#818cf8', glyph:'❖', size:0.74, flying:true, traits:['boss','phase'] },
    20: { id:'thefall', name:'THE FALL', hp:9000, speed:0.5, bounty:600, leak:12, color:'#f43f5e', glyph:'☠', size:0.85, armor:10, traits:['boss','spawner','regen'], regen:40, spawn:'brute', spawnEvery:3, spawnCount:1 },
  };

  const R = { COMMON:'common', RARE:'rare', EPIC:'epic', LEGEND:'legendary' };

  const UPGRADES = [
    // ── Common ──
    { id:'sharp1', name:'Honed Edges', rarity:R.COMMON, desc:'+12% damage to all towers.',
      effects:[{kind:'stat',stat:'dmgMul',mode:'mul',value:1.12}] },
    { id:'range1', name:'Eagle Eyes', rarity:R.COMMON, desc:'+10% range to all towers.',
      effects:[{kind:'stat',stat:'rangeMul',mode:'mul',value:1.10}] },
    { id:'rate1', name:'Quick Hands', rarity:R.COMMON, desc:'+12% fire rate to all towers.',
      effects:[{kind:'stat',stat:'rateMul',mode:'mul',value:1.12}] },
    { id:'thrift', name:'Thrift', rarity:R.COMMON, desc:'+4% interest on gold between waves.',
      effects:[{kind:'stat',stat:'interest',mode:'add',value:0.04}] },
    { id:'bounty1', name:'Bounty Hunter', rarity:R.COMMON, desc:'+15% gold from kills.',
      effects:[{kind:'stat',stat:'goldMul',mode:'mul',value:1.15}] },
    { id:'frostbite', name:'Frostbite', rarity:R.COMMON, desc:'Frost towers slow 20% harder & longer.',
      effects:[{kind:'stat',stat:'slowMul',mode:'mul',value:1.2},{kind:'stat',stat:'slowDurMul',mode:'mul',value:1.2}] },

    // ── Rare ──
    { id:'sharp2', name:'Whetstone', rarity:R.RARE, desc:'+22% damage to all towers.',
      effects:[{kind:'stat',stat:'dmgMul',mode:'mul',value:1.22}] },
    { id:'crit1', name:'Weak Points', rarity:R.RARE, desc:'+12% crit chance, crits deal 2x.',
      effects:[{kind:'stat',stat:'critChance',mode:'add',value:0.12}] },
    { id:'pierce1', name:'Armor Piercing', rarity:R.RARE, desc:'Shots pierce +1 enemy & ignore 3 armor.',
      effects:[{kind:'flag',flag:'pierce',value:1},{kind:'stat',stat:'armorPen',mode:'add',value:3}] },
    { id:'chain1', name:'Forked Lightning', rarity:R.RARE, desc:'Arc Coils chain to +2 more enemies.',
      effects:[{kind:'flag',flag:'chainAdd',value:2}] },
    { id:'splash1', name:'Wide Blast', rarity:R.RARE, desc:'+30% splash radius & +15% splash damage.',
      effects:[{kind:'stat',stat:'splashMul',mode:'mul',value:1.3},{kind:'stat',stat:'dmgMul',mode:'mul',value:1.0,type:'cannon'}] },
    { id:'venomous', name:'Necrotic Venom', rarity:R.RARE, desc:'+50% poison & burn damage over time.',
      effects:[{kind:'stat',stat:'dotMul',mode:'mul',value:1.5}] },
    { id:'overcharge', name:'Overcharge', rarity:R.RARE, desc:'+18% fire rate & +10% damage.',
      effects:[{kind:'stat',stat:'rateMul',mode:'mul',value:1.18},{kind:'stat',stat:'dmgMul',mode:'mul',value:1.10}] },

    // ── Epic ──
    { id:'sharp3', name:'Apex Predator', rarity:R.EPIC, desc:'+35% damage to all towers.',
      effects:[{kind:'stat',stat:'dmgMul',mode:'mul',value:1.35}] },
    { id:'crit2', name:'Executioner', rarity:R.EPIC, desc:'+15% crit chance and crits deal +1.0x more.',
      effects:[{kind:'stat',stat:'critChance',mode:'add',value:0.15},{kind:'stat',stat:'critMul',mode:'add',value:1.0}] },
    { id:'fortune', name:'Fortune', rarity:R.EPIC, desc:'+8% interest and +25% kill gold.',
      effects:[{kind:'stat',stat:'interest',mode:'add',value:0.08},{kind:'stat',stat:'goldMul',mode:'mul',value:1.25}] },
    { id:'firstshot', name:'First Strike', rarity:R.EPIC, desc:'Towers deal +60% to enemies above 90% HP.',
      effects:[{kind:'special',id:'firstStrike'}] },
    { id:'momentum', name:'Killing Spree', rarity:R.EPIC, desc:'Each kill grants +1% damage this wave (stacks, resets each wave).',
      effects:[{kind:'special',id:'momentum'}] },
    { id:'glasscannon', name:'Glass Cannon', rarity:R.EPIC, desc:'+60% damage, but start each wave with -2 lives buffer (lose 2 life now).',
      effects:[{kind:'stat',stat:'dmgMul',mode:'mul',value:1.6},{kind:'special',id:'glassCannon'}] },

    // ── Legendary ──
    { id:'overflow', name:'Overflow Capacitor', rarity:R.LEGEND, desc:'Excess damage on a kill chains to the nearest enemy.',
      effects:[{kind:'special',id:'overflow'}] },
    { id:'avarice', name:'Avarice', rarity:R.LEGEND, desc:'+12% interest, +40% kill gold, Mints pay double.',
      effects:[{kind:'stat',stat:'interest',mode:'add',value:0.12},{kind:'stat',stat:'goldMul',mode:'mul',value:1.4},{kind:'stat',stat:'mintMul',mode:'mul',value:2}] },
    { id:'absolutezero', name:'Absolute Zero', rarity:R.LEGEND, desc:'All towers apply a minor slow; frozen enemies take +25% damage.',
      effects:[{kind:'special',id:'absoluteZero'}] },
    { id:'juggcap', name:'Siege Engine', rarity:R.LEGEND, desc:'+45% damage and +25% range to all towers.',
      effects:[{kind:'stat',stat:'dmgMul',mode:'mul',value:1.45},{kind:'stat',stat:'rangeMul',mode:'mul',value:1.25}] },
    { id:'tithe', name:'Blood Tithe', rarity:R.LEGEND, desc:'Restore 1 life for every 12 kills this wave.',
      effects:[{kind:'special',id:'bloodTithe'}] },

    // ── Common (expansion) ──
    { id:'sharp1b', name:'Keen Tips', rarity:R.COMMON, desc:'+14% damage to all towers.',
      effects:[{kind:'stat',stat:'dmgMul',mode:'mul',value:1.14}] },
    { id:'range1b', name:'Far Sight', rarity:R.COMMON, desc:'+12% range to all towers.',
      effects:[{kind:'stat',stat:'rangeMul',mode:'mul',value:1.12}] },
    { id:'arrowtrain', name:'Fletcher\'s Drill', rarity:R.COMMON, desc:'+18% fire rate to Archer Spires.',
      effects:[{kind:'stat',stat:'rateMul',mode:'mul',value:1.18,type:'arrow'}] },
    { id:'venomtutor', name:'Toxicology 101', rarity:R.COMMON, desc:'+15% poison & burn damage over time.',
      effects:[{kind:'stat',stat:'dotMul',mode:'mul',value:1.15}] },
    { id:'mintwax', name:'Minted Wax', rarity:R.COMMON, desc:'+15% gold from Gilded Mints.',
      effects:[{kind:'stat',stat:'mintMul',mode:'mul',value:1.15}] },
    { id:'coldsnap', name:'Cold Snap', rarity:R.COMMON, desc:'Frost slows last +25% longer.',
      effects:[{kind:'stat',stat:'slowDurMul',mode:'mul',value:1.25}] },

    // ── Rare (expansion) ──
    { id:'cannonmastery', name:'Cannon Mastery', rarity:R.RARE, desc:'+40% damage to Mortars.',
      effects:[{kind:'stat',stat:'dmgMul',mode:'mul',value:1.4,type:'cannon'}] },
    { id:'snipermastery', name:'Marksman\'s Eye', rarity:R.RARE, desc:'+30% damage & +20% range to Longshots.',
      effects:[{kind:'stat',stat:'dmgMul',mode:'mul',value:1.3,type:'sniper'},{kind:'stat',stat:'rangeMul',mode:'mul',value:1.2,type:'sniper'}] },
    { id:'flamejet', name:'Pressurized Jets', rarity:R.RARE, desc:'+25% fire rate & +20% splash to Pyres.',
      effects:[{kind:'stat',stat:'rateMul',mode:'mul',value:1.25,type:'flame'},{kind:'stat',stat:'splashMul',mode:'mul',value:1.2,type:'flame'}] },
    { id:'teslarange', name:'Conductive Field', rarity:R.RARE, desc:'Arc Coils gain +25% range and chain to +1 more enemy.',
      effects:[{kind:'stat',stat:'rangeMul',mode:'mul',value:1.25,type:'tesla'},{kind:'flag',flag:'chainAdd',value:1}] },
    { id:'projectile1', name:'Twin Bolts', rarity:R.RARE, desc:'+30% projectile speed & shots pierce +1 enemy.',
      effects:[{kind:'stat',stat:'projMul',mode:'mul',value:1.3},{kind:'flag',flag:'pierce',value:1}] },
    { id:'deepfreeze', name:'Deep Freeze', rarity:R.RARE, desc:'Slows are 30% stronger and last 20% longer.',
      effects:[{kind:'stat',stat:'slowMul',mode:'mul',value:1.3},{kind:'stat',stat:'slowDurMul',mode:'mul',value:1.2}] },
    { id:'usury', name:'Usury', rarity:R.RARE, desc:'+6% interest on banked gold.',
      effects:[{kind:'stat',stat:'interest',mode:'add',value:0.06}] },

    // ── Epic (expansion) ──
    { id:'rangelord', name:'Watchtower Doctrine', rarity:R.EPIC, desc:'+30% range and +15% damage to all towers.',
      effects:[{kind:'stat',stat:'rangeMul',mode:'mul',value:1.3},{kind:'stat',stat:'dmgMul',mode:'mul',value:1.15}] },
    { id:'rapidfire', name:'Sustained Barrage', rarity:R.EPIC, desc:'+35% fire rate to all towers.',
      effects:[{kind:'stat',stat:'rateMul',mode:'mul',value:1.35}] },
    { id:'penetrator', name:'Penetrator Rounds', rarity:R.EPIC, desc:'Shots pierce +2 enemies and ignore 8 armor.',
      effects:[{kind:'flag',flag:'pierce',value:2},{kind:'stat',stat:'armorPen',mode:'add',value:8}] },
    { id:'venomlord', name:'Plague Doctrine', rarity:R.EPIC, desc:'+90% poison & burn damage over time.',
      effects:[{kind:'stat',stat:'dotMul',mode:'mul',value:1.9}] },
    { id:'critforge', name:'Hairline Fractures', rarity:R.EPIC, desc:'+20% crit chance & crits deal +0.75x more.',
      effects:[{kind:'stat',stat:'critChance',mode:'add',value:0.2},{kind:'stat',stat:'critMul',mode:'add',value:0.75}] },

    // ── Legendary (expansion) ──
    { id:'arsenal', name:'Total Arsenal', rarity:R.LEGEND, desc:'+50% damage, +30% fire rate, +20% range to all towers.',
      effects:[{kind:'stat',stat:'dmgMul',mode:'mul',value:1.5},{kind:'stat',stat:'rateMul',mode:'mul',value:1.3},{kind:'stat',stat:'rangeMul',mode:'mul',value:1.2}] },
    { id:'plaguebearer', name:'Plaguebearer', rarity:R.LEGEND, desc:'Triple all damage over time; poison & burn become deadly.',
      effects:[{kind:'stat',stat:'dotMul',mode:'mul',value:3.0}] },
    { id:'assassin', name:'Assassin\'s Creed', rarity:R.LEGEND, desc:'+30% crit chance, crits deal +1.5x more, and +25% damage.',
      effects:[{kind:'stat',stat:'critChance',mode:'add',value:0.3},{kind:'stat',stat:'critMul',mode:'add',value:1.5},{kind:'stat',stat:'dmgMul',mode:'mul',value:1.25}] },
  ];

  // Omens — taken BEFORE sending a wave. Higher risk = better reward.
  const OMENS = [
    { id:'swarm', name:'The Swarm', risk:1, desc:'+60% enemy count this wave.', icon:'🐜',
      curse:{ countMul:1.6 }, reward:{ goldMul:1.4 } },
    { id:'haste', name:'Berserk', risk:2, desc:'Enemies move +45% faster.', icon:'💨',
      curse:{ spdMul:1.45 }, reward:{ goldMul:1.3, cardBonus:1 } },
    { id:'iron', name:'Iron Tide', risk:2, desc:'Enemies gain +6 armor and +25% HP.', icon:'🛡',
      curse:{ armorAdd:6, hpMul:1.25 }, reward:{ goldMul:1.3, shardAdd:2 } },
    { id:'bloodmoon', name:'Blood Moon', risk:3, desc:'Enemy HP +70%, but +2 gold per kill.', icon:'🌑',
      curse:{ hpMul:1.7 }, reward:{ flatKillGold:2, shardAdd:3, cardBonus:1 } },
    { id:'elite', name:'Vanguard', risk:3, desc:'A Juggernaut joins the wave. Guaranteed Epic+ card.', icon:'☢',
      curse:{ addElite:'juggernaut' }, reward:{ guaranteeRarity:'epic', shardAdd:3 } },
    { id:'fog', name:'Veil of Fog', risk:2, desc:'You cannot see enemy HP bars this wave. +1 reroll next shop.', icon:'🌫',
      curse:{ hideHp:true }, reward:{ rerollAdd:1, goldMul:1.2 } },
    { id:'storm', name:'Gathering Storm', risk:3, desc:'+40% count, +30% speed, +40% HP — but DOUBLE gold.', icon:'⛈',
      curse:{ countMul:1.4, spdMul:1.3, hpMul:1.4 }, reward:{ goldMul:2.0, shardAdd:4, cardBonus:1 } },
    { id:'phalanx', name:'The Phalanx', risk:1, desc:'Enemies gain +4 armor. +1 reroll next shop.', icon:'⚔',
      curse:{ armorAdd:4 }, reward:{ rerollAdd:1, goldMul:1.2 } },
    { id:'famine', name:'Famine', risk:2, desc:'+50% enemy HP and +30% speed. Guaranteed Rare+ card.', icon:'🍂',
      curse:{ hpMul:1.5, spdMul:1.3 }, reward:{ guaranteeRarity:'rare', goldMul:1.35, shardAdd:2 } },
    { id:'cataclysm', name:'Cataclysm', risk:3, desc:'A Juggernaut joins, +80% HP, +5 armor. Guaranteed Legendary & +1 life.', icon:'🔥',
      curse:{ addElite:'juggernaut', hpMul:1.8, armorAdd:5 }, reward:{ guaranteeRarity:'legendary', shardAdd:5, lifeAdd:1 } },
  ];

  // Biomes — chosen at run start. layout uses a string grid where:
  //   '.' buildable  '#' permanent rock  'S' spawn  'C' core  ' ' = '.'
  // The engine pads/centres these. Each biome has a passive modifier + theme.
  const BIOMES = [
    { id:'meadow', name:'Verdant Reach', theme:{ bg:'#0f291c', grid:'#15402c', rock:'#1f4d34', accent:'#4ade80' },
      musicTheme:0, desc:'Open fields. A gentle place to learn the maze.',
      passive:null, passiveDesc:'No modifier — balanced.',
      layout:[
        'S............C',
        '.............',
        '.....##......',
        '.....##......',
        '.............',
        'S............',
      ] },
    { id:'cavern', name:'Hollow Depths', theme:{ bg:'#1a1626', grid:'#2a2340', rock:'#3b2f5c', accent:'#a78bfa' },
      musicTheme:1, desc:'Rocky pillars carve natural maze lanes.',
      passive:{ goldMul:1.1 }, passiveDesc:'+10% kill gold (rich ore veins).',
      layout:[
        'S....##......',
        '.....##....C',
        '..##.......',
        '..##....##.',
        '.......##..',
        'S..........',
      ] },
    { id:'volcano', name:'Ashen Caldera', theme:{ bg:'#2a1410', grid:'#3d1d15', rock:'#5c2a1c', accent:'#fb7185' },
      musicTheme:2, desc:'Cramped and brutal. Enemies arrive angrier.',
      passive:{ enemyHpMul:1.15, startGold:60 }, passiveDesc:'Enemies +15% HP, but +60 starting gold.',
      layout:[
        'S..####......',
        '.......#....C',
        '...#........',
        '...#....#...',
        '......###...',
        'S...........',
      ] },
    { id:'void', name:'The Rift', theme:{ bg:'#04060f', grid:'#0b1230', rock:'#172554', accent:'#38bdf8' },
      musicTheme:3, desc:'Two cores, two fronts. For veterans only.', locked:true,
      passive:{ extraOmenSlot:1, enemyHpMul:1.2 }, passiveDesc:'Enemies +20% HP, but +1 Omen slot.',
      layout:[
        'S.....C.....S',
        '............',
        '...##..##...',
        '...##..##...',
        '............',
        'S.....C.....S',
      ] },
  ];

  // Meta-progression shop. Persistent unlocks bought with Shards across runs.
  // effect keys read by the engine at run start (see applyMeta).
  const META_UPGRADES = [
    { id:'gold1', name:'Seed Capital', desc:'+40 starting gold per level.', cost:8, max:5, effect:{ startGold:40 } },
    { id:'life1', name:'Reinforced Core', desc:'+3 starting lives per level.', cost:10, max:5, effect:{ lives:3 } },
    { id:'reroll1', name:'Foresight', desc:'+1 shop reroll per level.', cost:12, max:3, effect:{ rerolls:1 } },
    { id:'omen1', name:'Dark Pact', desc:'+1 Omen slot per level (more risk/reward).', cost:18, max:2, effect:{ omenSlot:1 } },
    { id:'interest1', name:'Compound Interest', desc:'+3% base interest per level.', cost:14, max:3, effect:{ interest:0.03 } },
    { id:'startcard', name:'Battle Plan', desc:'Begin each run with a free upgrade pick.', cost:20, max:1, effect:{ startCard:1 } },
    { id:'sell1', name:'Salvage Rights', desc:'+15% sell refund per level.', cost:10, max:2, effect:{ sellRate:0.15 } },
    { id:'unlockvoid', name:'Breach the Rift', desc:'Unlock the void biome (2 cores).', cost:35, max:1, effect:{ unlock:'void' } },
    { id:'shardgain', name:'Greedy Reaper', desc:'+25% Shards earned per run, per level.', cost:16, max:2, effect:{ shardGain:0.25 } },
  ];

  TD.DATA = { TOWERS, ENEMIES, BOSSES, UPGRADES, OMENS, BIOMES, META_UPGRADES, RARITY:R };
})();
