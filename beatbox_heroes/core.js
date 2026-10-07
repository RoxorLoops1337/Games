// BEATBOX HEROES -- core.js
// Pure game rules: the save object ("char"), time, needs, money, XP, unlocks, achievements,
// the rhythm scoring, the battle/judging maths and save slots. No DOM, no Phaser, no canvas.
// Every action is `Core.apply(char, action, rng) -> { char, fx:[...] }`: it returns a NEW char and a list of
// effects (toast, sfx, levelup, unlock, achievement, morning...) that the client plays. The UI never
// edits the save directly.
(function (root) {
  'use strict';
  const BBH = root.BBH || (root.BBH = {});
  if (typeof require !== 'undefined') { if (!BBH.Pix) require('./pix.js'); if (!BBH.CATALOG) require('./catalog.js'); }
  const CAT = BBH.CATALOG;
  const { clamp } = BBH;

  /* ---------------------------------------------------------------- config */
  const CFG = {
    version: 1, slots: 3,
    dayStart: 6 * 60, collapseAt: 20 * 60,          // minutes since 00:00 are NOT used: char.minutes counts from 06:00
    maxLevel: 30, rent: 60, rentLate: 15, travelMin: 10,
    startCash: 40, startEnergy: 100,
    cooldownBattle: 2, mingleMin: 45, dateCost: 25,
    cosmeticAnyColourLevel: 8,                       // free colour wheel for hair/skin from this level
  };
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const STATS = ['mus', 'tech', 'ori', 'show'];
  const STAT_NAMES = { mus: 'Musicality', tech: 'Technicality', ori: 'Originality', show: 'Showmanship' };

  /* ------------------------------------------------------------------ time */
  // minutes: 0 = 06:00 ... 720 = 18:00 ... 1080 = 00:00 ... 1200 = 02:00 (forced collapse)
  const dow = (day) => day % 7;                                    // Day 1 = Tuesday (index 1)
  const dayName = (day) => DAYS[dow(day)];
  const clock = (min) => { const t = (6 * 60 + Math.floor(min)) % 1440; return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
  const hourOf = (min) => ((6 * 60 + Math.floor(min)) % 1440) / 60;
  const phase = (min) => { const h = hourOf(min); return h >= 6 && h < 17.5 ? 'day' : h >= 17.5 && h < 19.5 ? 'dusk' : 'night'; };
  // continuous 0 (full day) .. 1 (full night) for cross-fading
  const nightness = (min) => {
    const h = hourOf(min);
    if (h >= 6 && h < 17) return 0;
    if (h >= 17 && h < 20) return (h - 17) / 3;
    if (h >= 20 || h < 4) return 1;
    return 1 - (h - 4) / 2;                                         // 04:00-06:00 dawn (only reachable via dev)
  };

  /* ----------------------------------------------------------------- cast */
  const NPCS = {
    foxy: { name: 'Foxy', role: 'Roommate', look: { name: 'Foxy', body: 'neutral', skin: '#e6bb8a', hair: { style: 'waves', color: '#7b3a22' }, eyes: { style: 'happy', color: '#2f8a4a' }, marks: ['freckles'], top: { id: 'hoodiebig', color: '#3f9b5a', color2: '#f7f2e8' }, bottom: { id: 'ripped', color: '#3a5fcd' }, shoes: { id: 'fatlaces', color: '#f7f2e8' }, hat: { id: 'none' }, acc: { ears: { id: 'studs', color: '#d4a017' }, hand: { id: 'none_hand' }, neck: { id: 'none_neck' } } } },
    pigpen: { name: 'Pig Pen', role: 'Rival', look: { name: 'Pig Pen', body: 'boy', skin: '#cf9456', hair: { style: 'fadewave', color: '#1a1420' }, eyes: { style: 'sharp', color: '#1c1620' }, facial: 'goatee', marks: ['goldgrill'], top: { id: 'bomber', color: '#d6203f', color2: '#17141f' }, bottom: { id: 'techpants', color: '#17141f' }, shoes: { id: 'retro', color: '#d6203f' }, hat: { id: 'fitted', color: '#d6203f' }, acc: { neck: { id: 'cubanchain', color: '#d4a017' }, hand: { id: 'none_hand' } } } },
    beeamgee: { name: 'BeeAmGee', role: 'Mentor', look: { name: 'BeeAmGee', body: 'boy', skin: '#e6bb8a', hair: { style: 'sidepart', color: '#b9b9c8' }, eyes: { style: 'sleepy', color: '#7a8aa0' }, facial: 'longbeard', brows: 'thick', top: { id: 'denimjacket', color: '#3a5fcd' }, bottom: { id: 'jeans', color: '#34303f' }, shoes: { id: 'timbs', color: '#b98b5e' }, hat: { id: 'none' }, glasses: { id: 'gold_round', color: '#d4a017' }, acc: { neck: { id: 'chain', color: '#d4a017' }, hand: { id: 'none_hand' } } } },
    rohzel: { name: 'Rohzel', role: 'Bar keeper', look: { name: 'Rohzel', body: 'neutral', skin: '#8f5632', hair: { style: 'cornrows', color: '#1a1420' }, eyes: { style: 'sleepy', color: '#4a2c1a' }, top: { id: 'jersey', color: '#17141f', color2: '#d4a017' }, bottom: { id: 'camo', color: '#34303f' }, shoes: { id: 'timbs', color: '#b98b5e' }, hat: { id: 'none' }, acc: { ears: { id: 'iced', color: '#e8f4ff' }, hand: { id: 'none_hand' } } } },
    penny: { name: 'Penny', role: 'Champion', look: { name: 'Penny', body: 'girl', skin: '#f2c4ae', hair: { style: 'bob', color: '#ff3ea5' }, eyes: { style: 'cat', color: '#8a4fd6' }, top: { id: 'champ', color: '#d4a017' }, bottom: { id: 'leggings', color: '#17141f' }, shoes: { id: 'platform', color: '#ff3ea5' }, glasses: { id: 'chromeshield', color: '#c9d3e6' }, hat: { id: 'none' }, acc: { wrist: { id: 'icedwatch', color: '#e8f4ff' }, hand: { id: 'goldmic', color: '#d4a017' } } } },
    luca: { name: 'Luca', role: 'Regular', look: { name: 'Luca', body: 'boy', skin: '#d9a46e', hair: { style: 'quiff', color: '#3b2418' }, top: { id: 'windbreaker', color: '#e63946', color2: '#f7f2e8' }, bottom: { id: 'jeans', color: '#17141f' } , shoes: { id: 'retro', color: '#f7f2e8' }, hat: { id: 'none' } } },
    mira: { name: 'Mira', role: 'Regular', look: { name: 'Mira', body: 'girl', skin: '#6f3d2b', hair: { style: 'afro', color: '#1a1420' }, top: { id: 'croptop', color: '#ffb703' }, bottom: { id: 'sweatpants', color: '#7b4fe0' } , shoes: { id: 'fatlaces', color: '#f7f2e8' }, hat: { id: 'none' }, acc: { ears: { id: 'hoops', color: '#d4a017' }, hand: { id: 'none_hand' } } } },
    sky: { name: 'Sky', role: 'Regular', look: { name: 'Sky', body: 'neutral', skin: '#f4d3bd', hair: { style: 'undercut', color: '#2ee6ff' }, top: { id: 'oversized', color: '#7b4fe0' }, bottom: { id: 'techpants', color: '#34303f' } , shoes: { id: 'retro', color: '#2ee6ff' }, hat: { id: 'trucker', color: '#17141f' } } },
    pascal: { name: 'Pascal', role: 'Regular', look: { name: 'Pascal', body: 'boy', skin: '#b87f4e', hair: { style: 'curly', color: '#2a2024' }, facial: 'stubble', top: { id: 'hawaiian', color: '#2a9d8f' }, bottom: { id: 'shorts', color: '#f7f2e8' } , shoes: { id: 'slides', color: '#17141f' }, hat: { id: 'none' } } },
    jin: { name: 'Jin', role: 'Regular', look: { name: 'Jin', body: 'neutral', skin: '#efb9a6', hair: { style: 'bob', color: '#1a1420' }, top: { id: 'turtleneck', color: '#17141f' }, bottom: { id: 'slacks', color: '#6b6b80' }, glasses: { id: 'round', color: '#17141f' } , shoes: { id: 'loafers', color: '#17141f' }, hat: { id: 'none' } } },
    roo: { name: 'Roo', role: 'Regular', look: { name: 'Roo', body: 'girl', skin: '#a56c3f', hair: { style: 'pigtails', color: '#ff8a2a' }, top: { id: 'varsity', color: '#3a5fcd' }, bottom: { id: 'shorts', color: '#17141f' } , shoes: { id: 'hightops', color: '#ff8a2a' }, hat: { id: 'none' }, acc: { wrist: { id: 'stackedbands', color: '#ff3ea5' }, hand: { id: 'none_hand' } } } },
  };
  const ROMANCE = ['luca', 'mira', 'sky', 'pascal', 'jin', 'roo'];

  // Battle STYLES (VHS Story style orders): rock-paper-scissors. Pick a style each round; it reshapes your chart and the
  // judges score the exchange: beating the opponent's style is worth +14%, losing to it -10%.
  const STYLES = [
    { id: 'boom', name: 'BOOM', lane: 0, desc: 'More heavy kicks' },
    { id: 'hats', name: 'HATS', lane: 1, desc: 'More fast hats' },
    { id: 'rim', name: 'RIM', lane: 3, desc: 'More Pf and rim hits' },
    { id: 'snare', name: 'SNARE', lane: 2, desc: 'More sharp snares' },
  ];
  const STYLE_BEATS = { boom: 'hats', hats: 'rim', rim: 'snare', snare: 'boom' };      // key beats value
  const styleMul = (mine, theirs) => (!mine || !theirs ? 1 : STYLE_BEATS[mine] === theirs ? 1.14 : STYLE_BEATS[theirs] === mine ? 0.9 : 1);
  const opponentStyle = (opp, rng) => { const fav = opp.fav || STYLES.map((x) => x.id); return rng() < 0.7 ? fav[Math.floor(rng() * fav.length)] : STYLES[Math.floor(rng() * 4)].id; };
  // bend a chart towards a style: about a third of the notes move to the style's lane
  function styleChart(notes, style, seed) {
    const st = STYLES.find((x) => x.id === style); if (!st) return notes;
    const r = BBH.rng((seed || 1) + 91);
    return notes.map((n, i) => (i % 3 === 1 || r() < 0.12 ? { beat: n.beat, lane: st.lane } : n));
  }

  const JUDGES = [
    { id: 'tek', name: 'Tek', likes: 'tech', quip: 'Clean. Precise. Boring? Maybe not.' },
    { id: 'mel', name: 'Mel', likes: 'mus', quip: 'I felt the groove in my ribs.' },
    { id: 'origi', name: 'Origi', likes: 'ori', quip: 'Have I heard that before? No. Good.' },
    { id: 'showtime', name: 'Showtime', likes: 'show', quip: 'The crowd is yours or it is not.' },
    { id: 'wildcard', name: 'Wildcard', likes: null, quip: 'I flipped a coin. Then I ignored it.' },
  ];

  // The ladder. skill: how good their rounds are (0..1). bpm/style: what the groove is like.
  const OPPONENTS = [
    { id: 'tick', fav: ['hats', 'rim'], name: 'Lil Tick', tier: 1, level: 1, skill: 0.50, bpm: 92, style: 0, traits: { tech: 0.4, mus: 0.3, ori: 0.2, show: 0.3 }, taunt: 'You call that a hi-hat? I have seen cats with more tss.', defeat: 'Okay okay. The cat can tss.', look: { name: 'Lil Tick', body: 'boy', skin: '#d2a06f', hair: { style: 'hightop', color: '#8dff4a' }, top: { id: 'jersey', color: '#ff6b35', color2: '#17141f' }, bottom: { id: 'camo', color: '#34303f' }, shoes: { id: 'fatlaces', color: '#f7f2e8' }, hat: { id: 'none' } } },
    { id: 'moe', fav: ['boom', 'snare'], name: 'Mouthpiece Moe', tier: 2, level: 3, skill: 0.58, bpm: 98, style: 1, traits: { tech: 0.5, mus: 0.5, ori: 0.3, show: 0.5 }, taunt: 'Moe talks. Moe wins. Moe talks about winning.', defeat: 'Moe has no words. Write that down.', look: { name: 'Moe', body: 'boy', skin: '#6f3d2b', hair: { style: 'afro', color: '#1a1420' }, glasses: { id: 'oversized', color: '#17141f' }, top: { id: 'bomber', color: '#3a5fcd', color2: '#f7f2e8' }, bottom: { id: 'sweatpants', color: '#17141f' }, shoes: { id: 'retro', color: '#e63946' }, hat: { id: 'none' } } },
    { id: 'kat', fav: ['rim', 'hats'], name: 'Kat Cadence', tier: 3, level: 5, skill: 0.65, bpm: 104, style: 2, traits: { tech: 0.6, mus: 0.7, ori: 0.5, show: 0.6 }, taunt: 'Nine lives, nine breaks. Pick one to lose to.', defeat: 'That was one life. I have eight.', look: { name: 'Kat', body: 'girl', skin: '#f0be9b', hair: { style: 'pigtails', color: '#ff3ea5' }, hat: { id: 'catears', color: '#17141f' }, top: { id: 'croptop', color: '#17141f' }, bottom: { id: 'skirt', color: '#7b4fe0' }, shoes: { id: 'platform', color: '#ff3ea5' } } },
    { id: 'doc', fav: ['snare', 'boom'], name: 'Dr. Bassline', tier: 4, level: 8, skill: 0.72, bpm: 110, style: 3, traits: { tech: 0.9, mus: 0.6, ori: 0.5, show: 0.4 }, taunt: 'My prescription: sit down and listen to a real low end.', defeat: 'The patient is... better than expected.', look: { name: 'Doc', body: 'neutral', skin: '#e6bb8a', hair: { style: 'buzz', color: '#b9b9c8' }, glasses: { id: 'nerd', color: '#17141f' }, top: { id: 'hawaiian', color: '#2a9d8f' }, bottom: { id: 'slacks', color: '#6b6b80' }, shoes: { id: 'loafers', color: '#7a4a2a' }, acc: { neck: { id: 'hpneck', color: '#6b6b80' } } } },
    { id: 'hexx', fav: ['rim', 'snare'], name: 'Hexx', tier: 5, level: 11, skill: 0.78, bpm: 116, style: 0, traits: { tech: 0.7, mus: 0.6, ori: 0.95, show: 0.7 }, taunt: 'I sank three crews before breakfast. Yours is next.', defeat: 'The sea takes me. For now.', look: { name: 'Hexx', body: 'girl', skin: '#a15f3d', hair: { style: 'long', color: '#9b5cff' }, hat: { id: 'pirate', color: '#17141f' }, top: { id: 'kimono', color: '#7d1f3f' }, bottom: { id: 'leggings', color: '#17141f' }, shoes: { id: 'combat', color: '#17141f' }, glasses: { id: 'eyepatch', color: '#17141f' } } },
    { id: 'pigpen', fav: ['boom', 'hats'], name: 'Pig Pen', tier: 6, level: 14, skill: 0.84, bpm: 122, style: 1, traits: { tech: 0.85, mus: 0.8, ori: 0.6, show: 0.9 }, taunt: 'Rookie of the year? More like rookie of the minute.', defeat: 'Fine. You are real. Do not tell anyone I said that.', look: null },
    { id: 'vox', fav: ['hats', 'snare'], name: 'Vox Prime', tier: 7, level: 17, skill: 0.90, bpm: 128, style: 2, traits: { tech: 0.95, mus: 0.9, ori: 0.8, show: 0.85 }, taunt: 'Last year I won with my mouth closed. Do the math.', defeat: 'Impossible. Do it again.', look: { name: 'Vox', body: 'boy', skin: '#33201a', hair: { style: 'fadewave', color: '#1a1420' }, glasses: { id: 'chromeshield', color: '#c9d3e6' }, top: { id: 'bomber', color: '#17141f', color2: '#d4a017' }, bottom: { id: 'techpants', color: '#17141f' }, shoes: { id: 'retro', color: '#d4a017' }, hat: { id: 'none' }, acc: { neck: { id: 'cubanchain', color: '#d4a017' }, ears: { id: 'iced', color: '#e8f4ff' } } } },
  ];
  OPPONENTS[5].look = NPCS.pigpen.look;
  const FINALS = [   // the Beatbox Heroes World Cup: three rounds of the bracket, no cooldown between
    { id: 'wc1', fav: ['rim', 'snare'], name: 'Hexx (Rematch)', tier: 5, skill: 0.84, bpm: 120, style: 0, traits: OPPONENTS[4].traits, look: OPPONENTS[4].look, taunt: 'The tide came back.' },
    { id: 'wc2', fav: ['boom', 'hats'], name: 'Pig Pen (Finals)', tier: 6, skill: 0.89, bpm: 126, style: 1, traits: OPPONENTS[5].traits, look: OPPONENTS[5].look, taunt: 'One more time. For the trophy.' },
    { id: 'wc3', fav: ['hats', 'boom', 'snare'], name: 'Penny', tier: 8, skill: 0.94, bpm: 132, style: 3, traits: { tech: 1, mus: 1, ori: 0.9, show: 1 }, look: NPCS.penny.look, taunt: 'Welcome to the top. It is lonely and very loud.' },
  ];

  const FOODS = [
    { id: 'banana', name: 'Banana', price: 1, hunger: 14, energy: 2, mood: 0, home: true },
    { id: 'oats', name: 'Berry Oats', price: 3, hunger: 30, energy: 6, mood: 2, home: true },
    { id: 'dates', name: 'Date Balls', price: 2, hunger: 10, energy: 8, mood: 4, home: true },
    { id: 'bowl', name: 'Burrito Bowl', price: 6, hunger: 46, energy: 4, mood: 4, home: true },
    { id: 'smoothie', name: 'Green Smoothie', price: 4, hunger: 22, energy: 10, mood: 3, home: true },
    { id: 'tea', name: 'Ginger Tea', price: 2, hunger: 4, energy: 6, mood: 5, home: true },
  ];

  // Where you can go, and when (hours are clock hours, wrap through midnight allowed with open>close).
  const PLACES = {
    home: { name: 'Home', open: 0, close: 24 },
    park: { name: 'Park', open: 6, close: 20 },
    shop: { name: 'Thrift Shop', open: 10, close: 22, fromDay: 3 },
    studio: { name: 'Sound Lab', open: 9, close: 24, fromDay: 2 },
    bar: { name: 'The Bar', open: 18, close: 26, fromDay: 2 },   // 26 = 02:00
  };

  /* ------------------------------------------- songs, crew, coaching (from Beatbox Story) */
  const SONG_DECAY = [0.32, 0.24, 0.18, 0.12, 0.08, 0.04, 0.02];                    // a released song pays fans for 7 days (sums to 1.00)
  const MAX_ACTIVE_SONGS = 3;                                                       // stops release-spam fan farming
  const SEQ_STEPS = 16, SEQ_SLOTS = 4;
  const emptyPattern = (i) => ({ name: 'Beat ' + (i + 1), bpm: 100, steps: [0, 1, 2, 3].map(() => new Array(SEQ_STEPS).fill(0)) });
  const patternHits = (p) => (p && p.steps ? p.steps.reduce((a, row) => a + row.filter(Boolean).length, 0) : 0);
  // creativity 0..1: variety of sounds used and how full the pattern is, with a bonus for off-beat hits
  function patternScore(p) {
    if (!p || !p.steps) return 0; const used = p.steps.filter((r) => r.some(Boolean)).length, cells = patternHits(p);
    const off = p.steps.reduce((a, r) => a + r.filter((v, i) => v && i % 4 !== 0).length, 0);
    return clamp(Math.min(1, used / 4) * 0.4 + Math.min(1, cells / 24) * 0.4 + Math.min(1, off / 8) * 0.2, 0, 1);
  }
  const CREW = [
    { id: 'jaxx', name: 'JAXX', blurb: 'Local cypher regular. Loves a four-on-the-floor.', cost: 80, minFans: 25, dailyCash: 6, dailyFans: 1, look: { name: 'Jaxx', body: 'boy', skin: '#d4a87a', hair: { style: 'cornrows', color: '#3a2410' }, top: { id: 'jersey', color: '#a04040', color2: '#f7f2e8' }, bottom: { id: 'sweatpants', color: '#34303f' }, shoes: { id: 'fatlaces', color: '#f7f2e8' }, hat: { id: 'none' }, acc: { hand: { id: 'none_hand' } } } },
    { id: 'noor', name: 'NOOR', blurb: 'Tutorial nerd with a sharp ear.', cost: 200, minFans: 75, dailyCash: 12, dailyFans: 2, look: { name: 'Noor', body: 'girl', skin: '#c08070', hair: { style: 'bob', color: '#5a2010' }, glasses: { id: 'nerd', color: '#17141f' }, top: { id: 'windbreaker', color: '#5a7050', color2: '#f7f2e8' }, bottom: { id: 'techpants', color: '#34303f' }, shoes: { id: 'retro', color: '#f7f2e8' }, hat: { id: 'none' }, acc: { hand: { id: 'none_hand' } } } },
    { id: 'duot', name: 'DUO-T', blurb: 'Twin brothers. One mic, two voices.', cost: 400, minFans: 200, dailyCash: 22, dailyFans: 4, look: { name: 'Duo-T', body: 'boy', skin: '#a87844', hair: { style: 'hightop', color: '#1a1a2e' }, top: { id: 'bomber', color: '#7a5a30', color2: '#d4a017' }, bottom: { id: 'camo', color: '#34303f' }, shoes: { id: 'timbs', color: '#b98b5e' }, hat: { id: 'none' }, acc: { hand: { id: 'none_hand' } } } },
    { id: 'glaze', name: 'GLAZE', blurb: 'Producer and hat specialist. Ex radio host.', cost: 800, minFans: 500, dailyCash: 38, dailyFans: 7, look: { name: 'Glaze', body: 'neutral', skin: '#e0b890', hair: { style: 'waves', color: '#dadada' }, top: { id: 'denimjacket', color: '#3a5a6a' }, bottom: { id: 'jeans', color: '#17141f' }, shoes: { id: 'sneakers', color: '#f7f2e8' }, hat: { id: 'fitted', color: '#17141f' }, acc: { hand: { id: 'none_hand' } } } },
    { id: 'miro', name: 'MIRO', blurb: 'Choir-trained ringer with perfect pitch.', cost: 1500, minFans: 1200, dailyCash: 60, dailyFans: 12, look: { name: 'Miro', body: 'girl', skin: '#d4a87a', hair: { style: 'long', color: '#7a3a20' }, top: { id: 'kimono', color: '#a06090' }, bottom: { id: 'leggings', color: '#17141f' }, shoes: { id: 'platform', color: '#a06090' }, hat: { id: 'none' }, acc: { hand: { id: 'none_hand' } } } },
  ];
  const COACH_LINES = [
    "First time I battled was '92. Lost ugly. Cried in the bathroom. Came back the next week.",
    'Every kid who comes through here thinks they invented the bass kick.',
    'I made it to the world finals once. Three times, actually. Never won.',
    'Your tongue knows more than your brain. Trust it.',
    "It is not the win. It is that you fought for it. Nobody remembers second place except second place.",
    'I had a daughter. She would be your age now.',
    'She did not beatbox. She liked the violin. Fancy that.',
    'You can hear when somebody is afraid of the mic. You can hear when they are not. That is the only difference.',
    'There is no secret. There are just hours, and somebody who will sit in the room with you while you do them.',
    'Do not end up like me, kid. Find someone to come home to.',
  ];
  const COACH_FEE = 50, COACH_COOLDOWN = 3, STREAM_MIN_FANS = 20;

  /* ---------------------------------------------------------- achievements */
  // check(ch) -> true when earned. `reward` is flavour text (cosmetics hook in via catalog `ach` unlocks).
  const ACHIEVEMENTS = [
    { id: 'firstbusk', name: 'Street Debut', desc: 'Busk in the park for the first time.', check: (c) => c.n.busks >= 1 },
    { id: 'firstopenmic', name: 'Open Mic Virgin', desc: 'Play your first open mic.', check: (c) => c.n.openMics >= 1 },
    { id: 'firstbattle', name: 'Battle Scarred', desc: 'Win your first beatbox battle.', check: (c) => c.n.battlesWon >= 1 },
    { id: 'showcase', name: 'Friday Headliner', desc: 'Play a paid Friday showcase.', check: (c) => c.n.showcases >= 1 },
    { id: 'firstdate', name: 'Heart Eyes', desc: 'Go on a date.', check: (c) => c.n.dates >= 1 },
    { id: 'rhythmking', name: 'Rhythm King', desc: 'Get an S rank on a performance.', check: (c) => c.n.sRanks >= 1 },
    { id: 'streak10', name: 'Never Drop', desc: 'Reach a 60 note combo.', check: (c) => c.n.bestCombo >= 60 },
    { id: 'allsounds', name: 'Four Voices', desc: 'Land 60 perfect hits on every lane.', check: (c) => c.n.perfectLane.every((v) => v >= 60) },
    { id: 'cooked', name: 'Home Cooking', desc: 'Make 15 meals in your own kitchen.', check: (c) => c.n.homeMeals >= 15 },
    { id: 'fans100', name: 'Hundred Hearts', desc: 'Reach 100 fans.', check: (c) => c.fans >= 100 },
    { id: 'fans500', name: 'Half a Thousand', desc: 'Reach 500 fans.', check: (c) => c.fans >= 500 },
    { id: 'fans2000', name: 'Local Legend', desc: 'Reach 2000 fans.', check: (c) => c.fans >= 2000 },
    { id: 'level5', name: 'Getting Warm', desc: 'Reach level 5.', check: (c) => c.level >= 5 },
    { id: 'level10', name: 'Double Digits', desc: 'Reach level 10.', check: (c) => c.level >= 10 },
    { id: 'level20', name: 'Veteran', desc: 'Reach level 20.', check: (c) => c.level >= 20 },
    { id: 'rich', name: 'Tip Jar Full', desc: 'Hold $500 at once.', check: (c) => c.cash >= 500 },
    { id: 'rent4', name: 'Responsible Adult', desc: 'Pay rent four times.', check: (c) => c.n.rentPaid >= 4 },
    { id: 'stylist', name: 'Fashion Victim', desc: 'Unlock 15 cosmetics.', check: (c) => Object.keys(c.owned).length >= 15 },
    { id: 'ladder', name: 'Top of the Ladder', desc: 'Beat all seven opponents.', check: (c) => OPPONENTS.every((o) => c.beat[o.id]) },
    { id: 'firstsong', name: 'Record Deal', desc: 'Release your first song.', check: (c) => c.n.songs >= 1 },
    { id: 'crew3', name: 'Squad Goals', desc: 'Recruit three crew members.', check: (c) => (c.crew || []).length >= 3 },
    { id: 'streamer', name: 'Going Live', desc: 'Do your first livestream.', check: (c) => c.n.streams >= 1 },
    { id: 'runner', name: 'Morning Runner', desc: 'Go for 5 runs in the park.', check: (c) => c.n.runs >= 5 },
    { id: 'recorder', name: 'In Your Own Voice', desc: 'Record your own drum sounds in the Sound Lab.', check: (c) => c.n.recorded >= 1 },
    { id: 'tuned', name: 'Pitch Perfect', desc: 'Finish 5 pitch tuner sessions.', check: (c) => c.n.tunes >= 5 },
    { id: 'worldcup', name: 'World Cup Champion', desc: 'Win the Beatbox Heroes World Cup.', check: (c) => !!c.flags.worldcup },
  ];

  /* ------------------------------------------------------------- unlocking */
  function unlockText(u) {
    switch (u.t) {
      case 'free': return '';
      case 'level': return 'Reach level ' + u.n;
      case 'fans': return 'Reach ' + u.n + ' fans';
      case 'day': return 'Reach day ' + u.n;
      case 'ach': { const a = ACHIEVEMENTS.find((x) => x.id === u.id); return 'Achievement: ' + (a ? a.name : u.id); }
      case 'beat': { const o = OPPONENTS.find((x) => x.id === u.id); return 'Beat ' + (o ? o.name : u.id); }
      case 'shop': return 'Thrift Shop $' + u.price + (u.lvl > 1 ? ' (level ' + u.lvl + ')' : '');
      case 'stat': return STAT_NAMES[u.k] + ' ' + u.n;
      default: return '?';
    }
  }
  // Is the condition itself met (ignoring ownership)?
  function condMet(ch, u) {
    switch (u.t) {
      case 'free': return true;
      case 'level': return ch.level >= u.n;
      case 'fans': return ch.fans >= u.n;
      case 'day': return ch.day >= u.n;
      case 'ach': return !!ch.ach[u.id];
      case 'beat': return !!ch.beat[u.id];
      case 'stat': return Math.floor(ch.stats[u.k]) >= u.n;
      case 'shop': return false;                                    // only by buying
      default: return false;
    }
  }
  const groupArr = (group) => CAT.GROUPS[group] || [];
  const findItem = (group, id) => groupArr(group).find((x) => x.id === id);
  const ownKey = (group, id) => group + ':' + id;
  function isUnlocked(ch, group, id) {
    const it = findItem(group, id);
    if (!it) return false;
    if (it.unlock.t === 'free') return true;
    if (ch.dev && ch.dev.unlockAll) return true;
    return !!ch.owned[ownKey(group, id)] || condMet(ch, it.unlock);
  }
  // Latch newly satisfied conditions into `owned` so unlocks never revert; returns the newly unlocked items.
  function sweepUnlocks(ch) {
    const out = [];
    for (const g of Object.keys(CAT.GROUPS)) for (const it of CAT.GROUPS[g]) {
      const k = ownKey(g, it.id);
      if (ch.owned[k] || it.unlock.t === 'free' || it.unlock.t === 'shop') continue;
      if (condMet(ch, it.unlock)) { ch.owned[k] = 1; out.push({ group: g, id: it.id, name: it.name }); }
    }
    return out;
  }
  // Every item the look currently wears that is locked -> replaced by its default (used when loading or hacking)
  function sanitizeLook(ch, look) {
    const L = JSON.parse(JSON.stringify(look)), D = CAT.DEFAULT_LOOK;
    const chk = (group, id, fallback) => (isUnlocked(ch, group, id) ? id : fallback);
    L.hair.style = chk('hairStyle', L.hair.style, 'crop');
    L.eyes.style = chk('eyeStyle', L.eyes.style, 'round');
    L.facial = chk('facial', L.facial, 'none');
    L.marks = (L.marks || []).filter((m) => isUnlocked(ch, 'marks', m));
    L.top.id = chk('top', L.top.id, 'tee'); L.bottom.id = chk('bottom', L.bottom.id, 'jeans'); L.shoes.id = chk('shoes', L.shoes.id, 'sneakers');
    L.hat.id = chk('hat', L.hat.id, 'none'); L.glasses.id = chk('glasses', L.glasses.id, 'none');
    for (const s of CAT.ACC_SLOTS) if (L.acc && L.acc[s]) L.acc[s].id = chk('acc', L.acc[s].id, 'none_' + s);
    if (!ch.dev.unlockAll) {
      const any = ch.level >= CFG.cosmeticAnyColourLevel;
      const nat = (hex) => CAT.HAIR_COLORS.some((c) => c.color.toLowerCase() === String(hex).toLowerCase() && isUnlocked(ch, 'hairColor', c.id));
      if (!any && !nat(L.hair.color)) L.hair.color = D.hair.color;
    }
    return L;
  }

  /* ------------------------------------------------------------- new char */
  function newChar(look, name) {
    const L = JSON.parse(JSON.stringify(look || CAT.DEFAULT_LOOK)); if (name) L.name = name;
    const ch = {
      v: CFG.version, name: L.name || 'Hero', look: L, day: 1, minutes: 60,         // wakes 07:00 on day 1
      energy: CFG.startEnergy, maxEnergy: CFG.startEnergy, hunger: 70, mood: 60, cash: CFG.startCash, fans: 0,
      xp: 0, level: 1, stats: { mus: 3, tech: 3, ori: 3, show: 3 },
      owned: {}, ach: {}, beat: {}, flags: {}, dev: {}, place: 'home', rentDebt: 0, lastBattleDay: -9, lastShowcaseDay: -9,
      affinity: {}, seen: {}, history: [], songs: [], crew: [], patterns: [0, 1, 2, 3].map((i) => emptyPattern(i)), patIdx: 0,
      n: { busks: 0, openMics: 0, showcases: 0, karaoke: 0, battlesWon: 0, battlesLost: 0, meals: 0, homeMeals: 0, perfects: 0, bestCombo: 0, perfectLane: [0, 0, 0, 0], sRanks: 0, collapses: 0, nights: 0, mingles: 0, dates: 0, rentPaid: 0, spent: 0, trains: 0, wardrobe: 0, bought: 0, runs: 0, tunes: 0, seqs: 0, songs: 0, streams: 0, coaches: 0, recorded: 0, jobs: 0 },
      created: 0,
    };
    sweepUnlocks(ch);
    return ch;
  }

  /* ---------------------------------------------------------- level / xp */
  const xpNeed = (level) => Math.round(30 + level * 22 + level * level * 1.6);
  function gainXp(ch, n, fx) {
    ch.xp += Math.max(0, Math.round(n));
    while (ch.level < CFG.maxLevel && ch.xp >= xpNeed(ch.level)) {
      ch.xp -= xpNeed(ch.level); ch.level++;
      ch.maxEnergy = Math.min(140, ch.maxEnergy + 2); ch.energy = Math.min(ch.maxEnergy, ch.energy + 10); ch.mood = clamp(ch.mood + 6, 0, 100);
      fx.push({ t: 'levelup', level: ch.level }, { t: 'sfx', name: 'levelup' });
    }
    if (ch.level >= CFG.maxLevel) ch.xp = Math.min(ch.xp, xpNeed(ch.level) - 1);
  }
  const bumpStat = (ch, k, amount) => { ch.stats[k] = clamp(ch.stats[k] + amount, 1, 99); };

  /* ------------------------------------------------------ housekeeping fx */
  function afterChange(ch, fx) {
    ch.energy = clamp(ch.energy, 0, ch.maxEnergy); ch.hunger = clamp(ch.hunger, 0, 100); ch.mood = clamp(ch.mood, 0, 100);
    ch.cash = Math.max(0, Math.round(ch.cash)); ch.fans = Math.max(0, Math.round(ch.fans));
    // achievements first (they may unlock cosmetics), then conditional unlocks
    for (let pass = 0; pass < 3; pass++) {
      let again = false;
      for (const a of ACHIEVEMENTS) if (!ch.ach[a.id] && a.check(ch)) { ch.ach[a.id] = ch.day; fx.push({ t: 'achievement', id: a.id, name: a.name, desc: a.desc }, { t: 'sfx', name: 'achievement' }); again = true; }
      const ul = sweepUnlocks(ch);
      for (const u of ul) { fx.push({ t: 'unlock', group: u.group, id: u.id, name: u.name }); again = true; }
      if (ul.length) fx.push({ t: 'sfx', name: 'unlock' });
      if (!again) break;
    }
  }

  /* ---------------------------------------------------------- the clock */
  // Spend game minutes (and optionally energy/hunger). Handles the 02:00 collapse. Returns true if the day rolled.
  function spend(ch, minutes, energy, fx, rng) {
    ch.minutes += minutes;
    ch.energy -= energy || 0;
    ch.hunger -= minutes * 0.045;
    if (ch.hunger <= 0) { ch.hunger = 0; ch.energy -= minutes * 0.05; ch.mood -= minutes * 0.02; }
    if (ch.minutes >= CFG.collapseAt) { endDay(ch, 'collapse', fx, rng); return true; }
    return false;
  }

  const MORNING_EVENTS = [
    { w: 3, text: 'Foxy left a bowl of oats on the counter. No note. Just oats.', fx: (c) => { c.hunger += 18; c.mood += 4; } },
    { w: 3, text: 'You found a crumpled $5 in last night\'s jacket.', fx: (c) => { c.cash += 5; } },
    { w: 2, text: 'The neighbour practised drums at 6 am. You are weirdly inspired.', fx: (c) => { c.mood += 3; bumpStat(c, 'mus', 0.2); } },
    { w: 2, text: 'Rain on the window. Cosy. You stay in bed ten minutes too long.', fx: (c) => { c.mood += 5; c.minutes += 10; } },
    { w: 2, text: 'A stranger streamed your busk. +6 fans overnight.', fx: (c) => { c.fans += 6; } },
    { w: 2, text: 'Your phone buzzes: a mum-shaped text. "Eat something green!" You do.', fx: (c) => { c.hunger += 8; c.mood += 6; } },
    { w: 1, text: 'Bad dream: you forgot every sound. You wake up tense.', fx: (c) => { c.mood -= 8; } },
    { w: 1, text: 'The pipes burst a little. Foxy mops. You help. Bonding.', fx: (c) => { c.energy -= 4; c.mood += 4; } },
  ];
  function pickWeighted(list, rng) {
    let t = 0; for (const e of list) t += e.w; let r = rng() * t;
    for (const e of list) { r -= e.w; if (r <= 0) return e; } return list[list.length - 1];
  }

  // THE one day-rollover pipeline. cause: 'sleep' | 'collapse' | 'nap' (nap is not a rollover, see apply)
  function endDay(ch, cause, fx, rng) {
    const lines = [];
    const late = ch.minutes >= 1080;                                // slept after midnight
    ch.day++; ch.minutes = 60; ch.n.nights++;
    if (cause === 'collapse') {
      ch.n.collapses++;
      ch.energy = Math.round(ch.maxEnergy * 0.6); ch.hunger -= 25; ch.mood -= 12;
      lines.push('You collapsed at 2 am on the floor. Foxy dragged you to bed.');
    } else {
      const base = ch.hunger < 15 ? 0.82 : 1;
      ch.energy = Math.round(ch.maxEnergy * (late ? Math.min(base, 0.92) : base)); ch.hunger -= 12; ch.mood += late ? 0 : 4;
      lines.push(late ? 'You slept late. Not fully rested.' : 'You slept well.');
    }
    // passive income: fans stream your tracks
    const stream = Math.floor(ch.fans / 40);
    if (stream > 0) { ch.cash += stream; lines.push('Streams paid $' + stream + '.'); }
    // song royalties (7-day fade) and crew daily yield
    if (ch.songs && ch.songs.length) {
      const ts = ch.stats.mus + ch.stats.tech + ch.stats.ori + ch.stats.show; let sf = 0;
      ch.songs = ch.songs.map((sg) => { const age = ch.day - sg.releasedDay; if (age <= 0 || age > SONG_DECAY.length) return sg; const pool = Math.max(5, Math.floor(ts / 4 + sg.activeCells * 1.5)); const earned = Math.round(pool * SONG_DECAY[age - 1]); sf += earned; return Object.assign({}, sg, { lifetimeFans: (sg.lifetimeFans || 0) + earned }); });
      if (sf > 0) { ch.fans += sf; lines.push('Your songs earned ' + sf + ' new fans overnight.'); }
    }
    if (ch.crew && ch.crew.length) {
      let cc = 0, cf = 0; for (const m of ch.crew) { const npc = CREW.find((x) => x.id === m.id); if (npc) { cc += npc.dailyCash; cf += npc.dailyFans; m.lifetimeCash = (m.lifetimeCash || 0) + npc.dailyCash; m.lifetimeFans = (m.lifetimeFans || 0) + npc.dailyFans; } }
      ch.cash += cc; ch.fans += cf; lines.push('Your crew brought in $' + cc + ' and ' + cf + ' fans.');
    }
    // rent when waking into Sunday
    if (dow(ch.day) === 6) {
      if (ch.cash >= CFG.rent + ch.rentDebt) { ch.cash -= CFG.rent + ch.rentDebt; ch.n.rentPaid++; lines.push('Rent paid: $' + (CFG.rent + ch.rentDebt) + '.'); ch.rentDebt = 0; }
      else { ch.rentDebt += CFG.rent + CFG.rentLate - 0; ch.mood -= 10; lines.push('You could not cover rent. Foxy covers it, with a look. You owe $' + ch.rentDebt + ' (late fee included).'); fx.push({ t: 'sfx', name: 'error' }); }
    }
    // one random morning event (30%)
    if (rng() < 0.3) { const e = pickWeighted(MORNING_EVENTS, rng); e.fx(ch); lines.push(e.text); }
    ch.hunger = clamp(ch.hunger, 0, 100); ch.mood = clamp(ch.mood, 0, 100);
    ch.place = 'home';
    fx.push({ t: 'morning', day: ch.day, name: dayName(ch.day), lines, cause });
  }

  /* ------------------------------------------------------------ gating */
  const barProgramme = (day) => {
    const d = dow(day);
    return d === 0 ? { id: 'closed', name: 'Closed', desc: 'Rohzel\'s day off.' }
      : d <= 3 ? { id: 'openmic', name: 'Open Mic', desc: 'Sign up, play a set.' }
      : d === 4 ? { id: 'showcase', name: 'Friday Showcase', desc: 'Paid slot. Needs 50 fans and 5 open mics.' }
      : d === 5 ? { id: 'battle', name: 'Battle Night', desc: 'Step up. Beat the ladder.' }
      : { id: 'karaoke', name: 'Karaoke Sunday', desc: 'No pressure. Just vibes.' };
  };
  function canEnter(ch, place) {
    const p = PLACES[place]; if (!p) return { ok: false, reason: 'No such place.' };
    if (ch.dev.noGates) return { ok: true };
    if (p.fromDay && ch.day < p.fromDay) return { ok: false, reason: 'Not open to you yet. (day ' + p.fromDay + ')' };
    const h = hourOf(ch.minutes), hh = place === 'bar' && h < 6 ? h + 24 : h;
    if (place !== 'home' && (hh < p.open || hh >= p.close)) return { ok: false, reason: p.name + ' is closed. Open ' + String(p.open % 24).padStart(2, '0') + ':00 to ' + String(p.close % 24).padStart(2, '0') + ':00.' };
    if (place === 'bar' && barProgramme(ch.day).id === 'closed') return { ok: false, reason: 'The bar is closed on Mondays.' };
    return { ok: true };
  }

  /* ------------------------------------------------------- rhythm scoring */
  // Hit windows in ms, widened by Musicality. Notes fall for `fallMs` (faster with Technicality for a bit more challenge? no: slower).
  const windows = (stats) => ({ perfect: 70 + Math.min(40, stats.mus * 0.5), good: 135 + Math.min(60, stats.mus * 0.7) });
  function judgeHit(deltaMs, win) { const d = Math.abs(deltaMs); return d <= win.perfect ? 'perfect' : d <= win.good ? 'good' : 'miss'; }
  const HIT_SCORE = { perfect: 100, good: 60, miss: 0 };
  // Build a note chart out of STANDARD BEATBOX PATTERNS (B = kick, T = hat "t", K = snare "k", P = Pf).
  // Easy charts are mostly the classic "B t K t" (bars of four quarter notes), with a "B B K t" or "B t K B" variation
  // near the end. Medium and hard move to eighth-note grooves, and hard adds Pf and fills. Deterministic per seed.
  const LANE = { B: 0, T: 1, K: 2, P: 3, '.': -1 };
  const Q = (str) => str.split('').map((ch, i) => ({ beat: i, lane: LANE[ch] }));            // 4 quarter notes
  const E8 = (str) => str.split('').map((ch, i) => ({ beat: i * 0.5, lane: LANE[ch] }));      // 8 eighth notes
  const PAT = {
    basic: Q('BTKT'),
    easyEnd: [Q('BBKT'), Q('BTKB')],
    mid: [E8('BTKTBBKT'), E8('B.KTBBK.'), E8('BTKTB.KT'), E8('BBKTBTKT'), E8('B.KTBKKT')],
    midEnd: [E8('BTKTBBKT'), E8('BBKBBTKT')],
    hard: [E8('BTKPBTKP'), E8('BBKTBKPT'), E8('BTKTBBKP'), E8('BPKTBPKT'), E8('BBKKBTKP'), E8('BTKBBTKT')],
    hardFill: [E8('BBKKPPKK'), E8('BKBKPKPK'), E8('BTKPKPKP')],
  };
  function makeChart(seed, o) {
    const r = BBH.rng(seed), notes = [], bars = o.bars || 8, diff = clamp(o.difficulty === undefined ? 0.5 : o.difficulty, 0, 1);
    for (let bar = 0; bar < bars; bar++) {
      const toEnd = bars - 1 - bar;                              // 0 = last bar
      let pat;
      if (diff < 0.35) {                                         // EASY: B t K t, variations near the end
        pat = toEnd <= 1 && bars >= 4 && (toEnd === 0 || r() < 0.6) ? r.pick(PAT.easyEnd) : PAT.basic;
      } else if (diff < 0.7) {                                   // MEDIUM: quarter notes and eighth grooves
        pat = toEnd === 0 && bars >= 4 ? r.pick(PAT.midEnd) : r() < 0.7 - (diff - 0.35) ? PAT.basic : r.pick(PAT.mid);
        if (bar === 0) pat = PAT.basic;
      } else {                                                   // HARD: dense grooves, Pf, fills
        pat = toEnd === 0 && bars >= 4 ? r.pick(PAT.hardFill) : r() < 0.25 ? r.pick(PAT.mid) : r.pick(PAT.hard);
        if (bar === 0) pat = r.pick(PAT.mid);
      }
      for (const n of pat) if (n.lane >= 0) notes.push({ beat: bar * 4 + n.beat, lane: n.lane });
    }
    return notes;
  }
  function rank(acc) { return acc >= 0.96 ? 'S' : acc >= 0.88 ? 'A' : acc >= 0.74 ? 'B' : acc >= 0.55 ? 'C' : 'D'; }
  // tally a finished performance. hits: array of {lane, grade}. total = notes in chart.
  function summarize(hits, total, bestCombo) {
    let pts = 0, perfect = 0, good = 0, miss = 0; const lane = [0, 0, 0, 0];
    for (const h of hits) { pts += HIT_SCORE[h.grade]; if (h.grade === 'perfect') { perfect++; lane[h.lane]++; } else if (h.grade === 'good') good++; else miss++; }
    miss += Math.max(0, total - hits.length);
    const acc = total ? pts / (total * 100) : 0;
    return { accuracy: clamp(acc, 0, 1), perfect, good, miss, total, bestCombo: bestCombo || 0, perfectLane: lane, rank: rank(acc), score: Math.round(pts * (1 + (bestCombo || 0) / 100)) };
  }

  /* ------------------------------------------------------ battle / judges */
  // A judge's vote for one performance: weights the relevant stat, with a touch of noise.
  function judgeScore(judge, q, stats, rng) {
    const bias = judge.likes ? (stats[judge.likes] - 20) / 120 : (rng() - 0.5) * 0.3;
    return q * (1 + bias) + (rng() - 0.5) * 0.06;
  }
  // The opponent's round quality (0..1)
  function opponentRound(opp, round, rng) { return clamp(opp.skill + (rng() - 0.5) * 0.16 + (round === 2 ? 0.02 : 0), 0.15, 0.99); }
  function oppJudgeScore(opp, judge, q, rng) {
    // same formula as the player's: an opponent trait of 0.6 counts like a stat of 60
    const bias = judge.likes ? (opp.traits[judge.likes] * 100 - 20) / 120 : (rng() - 0.5) * 0.3;
    return q * (1 + bias) + (rng() - 0.5) * 0.06;
  }
  // rounds: [{ q: playerQuality 0..1, style?: 'boom'|... }]; oppStyles: the opponent's style for each round (picked if omitted)
  function resolveBattle(ch, opp, rounds, rng, oppStyles) {
    const oS = rounds.map((_, i) => (oppStyles && oppStyles[i]) || opponentStyle(opp, rng));
    const mul = rounds.map((r, i) => styleMul(r.style, oS[i]));
    const oppRounds = rounds.map((_, i) => opponentRound(opp, i, rng));
    const votes = JUDGES.map((j) => {
      let p = 0, o = 0;
      rounds.forEach((r, i) => { p += judgeScore(j, Math.min(1.2, r.q * mul[i]), ch.stats, rng); o += oppJudgeScore(opp, j, Math.min(1.2, oppRounds[i] * (mul[i] === 1.14 ? 0.95 : mul[i] === 0.9 ? 1.06 : 1)), rng); });
      return { judge: j.id, name: j.name, player: +p.toFixed(3), opp: +o.toFixed(3), forPlayer: p > o };
    });
    const forPlayer = votes.filter((v) => v.forPlayer).length;
    return { votes, forPlayer, win: forPlayer >= 3, oppRounds, oppStyles: oS, mul };
  }

  /* ----------------------------------------------------------- rewards */
  function reward(kind, res, ch) {
    const q = res.accuracy, st = ch.stats, bonus = 1 + st.show * 0.012;
    switch (kind) {
      case 'busk': return { minutes: 60, energy: 12, cash: Math.round((5 + st.show * 0.5) * (0.3 + 1.4 * q)), fans: Math.round((1 + st.ori * 0.06 + st.show * 0.05) * (0.4 + 1.6 * q) * bonus), xp: Math.round(6 + 12 * q), mood: q > 0.7 ? 4 : q < 0.4 ? -4 : 0 };
      case 'openmic': return { minutes: 90, energy: 16, cash: Math.round(6 * (0.4 + q)), fans: Math.round((3 + st.ori * 0.1 + st.show * 0.1) * (0.5 + 1.5 * q) * bonus), xp: Math.round(14 + 18 * q), mood: q > 0.7 ? 6 : q < 0.4 ? -5 : 1 };
      case 'showcase': return { minutes: 120, energy: 22, cash: Math.round(55 + 90 * q), fans: Math.round((14 + st.show * 0.3) * (0.5 + 1.2 * q) * bonus), xp: Math.round(36 + 30 * q), mood: q > 0.7 ? 10 : q < 0.4 ? -8 : 2 };
      case 'karaoke': return { minutes: 75, energy: 8, cash: 0, fans: Math.round((2 + 8 * q) * bonus), xp: Math.round(8 + 10 * q), mood: 10 };
      case 'practice': return { minutes: 60, energy: 14, cash: 0, fans: 0, xp: Math.round(6 + 10 * q), mood: 1 };
      default: return { minutes: 30, energy: 5, cash: 0, fans: 0, xp: 0, mood: 0 };
    }
  }
  const STUDIO_FEE = 15;
  // Odd jobs (VHS Story style part-time work): safe money when busking is not paying yet.
  const JOBS = [
    { id: 'flyers', place: 'park', name: 'Hand out flyers', minutes: 90, energy: 14, cash: 14, fans: 2, text: 'You hand out flyers for a local gig. A few people ask who you are.' },
    { id: 'shelves', place: 'shop', name: 'Stock shelves', minutes: 120, energy: 16, cash: 20, fans: 0, text: 'You sort donated clothes into racks. Boring, but the clerk pays cash.' },
    { id: 'dishes', place: 'bar', name: 'Wash dishes', minutes: 120, energy: 18, cash: 24, fans: 1, text: 'Rohzel pays you cash to wash glasses. You hum beats the whole time.' },
  ];

  /* ----------------------------------------------------------- mingling */
  const MINGLE = [
    { w: 3, text: (n) => n + ' loves your last set and buys you a green juice.', fx: (c) => { c.mood += 6; c.hunger += 6; }, aff: 1 },
    { w: 3, text: (n) => n + ' shares a beat idea on a napkin. Surprisingly good.', fx: (c) => { bumpStat(c, 'ori', 0.4); c.mood += 3; }, aff: 1 },
    { w: 2, text: (n) => n + ' teaches you a lip-roll trick.', fx: (c) => { bumpStat(c, 'tech', 0.4); }, aff: 1 },
    { w: 2, text: (n) => 'You and ' + n + ' trade bars until the bar closes its tab.', fx: (c) => { c.fans += 5; c.mood += 4; }, aff: 2 },
    { w: 1, text: (n) => n + ' is not in the mood. Awkward silence.', fx: (c) => { c.mood -= 4; }, aff: 0 },
  ];

  /* ------------------------------------------------------------ reducer */
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function apply(ch0, a, rng) {
    rng = rng || Math.random;
    const ch = clone(ch0), fx = [];
    const toast = (text, kind) => fx.push({ t: 'toast', text, kind: kind || 'info' });
    switch (a.t) {
      case 'travel': {
        const ok = canEnter(ch, a.to);
        if (!ok.ok) { toast(ok.reason, 'warn'); fx.push({ t: 'sfx', name: 'error' }); break; }
        if (ch.place !== a.to) { ch.place = a.to; if (a.to !== 'home') spend(ch, CFG.travelMin, 0.5, fx, rng); fx.push({ t: 'sfx', name: 'door' }); }
        fx.push({ t: 'navigate', to: a.to });
        break;
      }
      case 'eat': {
        const f = FOODS.find((x) => x.id === a.food); if (!f) break;
        const price = a.free ? 0 : f.price;
        if (ch.cash < price) { toast('Not enough cash.', 'warn'); fx.push({ t: 'sfx', name: 'error' }); break; }
        ch.cash -= price; ch.n.spent += price; ch.hunger += f.hunger; ch.energy += f.energy; ch.mood += f.mood; ch.n.meals++;
        if (a.home) ch.n.homeMeals++;
        spend(ch, 15, 0, fx, rng); fx.push({ t: 'sfx', name: 'eat' }); toast(f.name + ': hunger +' + f.hunger, 'good');
        break;
      }
      case 'sleep': {
        const h = hourOf(ch.minutes);
        if (h < 20 && h >= 6 && !ch.dev.noGates) { toast('Too early to sleep. Try a nap (or wait until 20:00).', 'warn'); fx.push({ t: 'sfx', name: 'error' }); break; }
        fx.push({ t: 'sfx', name: 'sleep' }); endDay(ch, 'sleep', fx, rng);
        break;
      }
      case 'nap': {
        if (ch.minutes + 90 >= CFG.collapseAt) { toast('Too late for a nap. Go to bed.', 'warn'); break; }
        ch.energy += 22; ch.mood += 2; spend(ch, 90, 0, fx, rng); fx.push({ t: 'sfx', name: 'sleep' }); toast('Power nap. +22 energy.', 'good');
        break;
      }
      case 'train': {                                              // a.stat, a.q (0..1 practice quality), a.where
        const where = a.where || 'home', fee = where === 'studio' ? STUDIO_FEE : 0;
        if (ch.cash < fee) { toast('The studio costs $' + fee + '.', 'warn'); fx.push({ t: 'sfx', name: 'error' }); break; }
        const q = a.q === undefined ? 0.5 : a.q, rw = reward('practice', { accuracy: q }, ch);
        if (ch.energy < rw.energy * 0.6) { toast('Too tired to train.', 'warn'); fx.push({ t: 'sfx', name: 'error' }); break; }
        ch.cash -= fee; ch.n.spent += fee; ch.n.trains++;
        const gain = (0.5 + 1.6 * q) * (where === 'studio' ? 1.4 : 1) * (1 - ch.stats[a.stat] / 120);
        bumpStat(ch, a.stat, gain);
        ch.mood += rw.mood; gainXp(ch, rw.xp * (where === 'studio' ? 1.3 : 1), fx);
        spend(ch, rw.minutes, rw.energy, fx, rng); fx.push({ t: 'sfx', name: 'confirm' });
        toast(STAT_NAMES[a.stat] + ' +' + gain.toFixed(1), 'good');
        break;
      }
      case 'perform': {                                            // a.kind, a.res (summarize output)
        const res = a.res, rw = reward(a.kind, res, ch), k = a.kind;
        if (k === 'busk') ch.n.busks++; else if (k === 'openmic') ch.n.openMics++; else if (k === 'showcase') { ch.n.showcases++; ch.lastShowcaseDay = ch.day; } else if (k === 'karaoke') ch.n.karaoke++;
        ch.n.perfects += res.perfect; ch.n.bestCombo = Math.max(ch.n.bestCombo, res.bestCombo);
        res.perfectLane.forEach((v, i) => { ch.n.perfectLane[i] += v; });
        if (res.rank === 'S') ch.n.sRanks++;
        ch.cash += rw.cash; ch.fans += rw.fans; ch.mood += rw.mood; gainXp(ch, rw.xp, fx);
        // performing also nudges the stats a little (Showmanship especially)
        bumpStat(ch, 'show', 0.15 + 0.4 * res.accuracy); bumpStat(ch, 'mus', 0.1 + 0.3 * res.accuracy);
        if (res.bestCombo >= 30) bumpStat(ch, 'tech', 0.2);
        spend(ch, rw.minutes, rw.energy, fx, rng);
        fx.push({ t: 'sfx', name: res.rank === 'S' || res.rank === 'A' ? 'crowd_cheer' : res.rank === 'D' ? 'crowd_boo' : 'applause' });
        fx.push({ t: 'result', kind: k, rw, res });
        break;
      }
      case 'battle': {                                             // a.opp (id or object), a.rounds [{q}], a.final
        const opp = typeof a.opp === 'string' ? OPPONENTS.find((o) => o.id === a.opp) : a.opp;
        const out = resolveBattle(ch, opp, a.rounds, rng, a.oppStyles);
        const tier = opp.tier;
        if (!a.final) ch.lastBattleDay = ch.day;
        ch.n.perfects += a.perfects || 0; ch.n.bestCombo = Math.max(ch.n.bestCombo, a.bestCombo || 0);
        (a.perfectLane || []).forEach((v, i) => { ch.n.perfectLane[i] += v; });
        let rw;
        if (out.win) {
          ch.n.battlesWon++; ch.beat[opp.id] = ch.day;
          rw = { cash: 30 + tier * 22, fans: 12 + tier * 10, xp: 30 + tier * 16, mood: 14 };
        } else { ch.n.battlesLost++; rw = { cash: 0, fans: Math.round(2 + tier), xp: 10 + tier * 2, mood: -9 }; }
        ch.cash += rw.cash; ch.fans += rw.fans; ch.mood += rw.mood; gainXp(ch, rw.xp, fx);
        bumpStat(ch, 'tech', out.win ? 0.5 : 0.2); bumpStat(ch, 'ori', out.win ? 0.4 : 0.15);
        if (a.final === 'wc3' && out.win) ch.flags.worldcup = ch.day;
        spend(ch, a.final ? 45 : 75, a.final ? 12 : 20, fx, rng);
        fx.push({ t: 'sfx', name: out.win ? 'win' : 'lose' }, { t: 'battleResult', opp: opp.id, out, rw });
        break;
      }
      case 'buy': {
        const it = findItem(a.group, a.id); if (!it || it.unlock.t !== 'shop') break;
        const k = ownKey(a.group, a.id);
        if (ch.owned[k]) { toast('You already own that.', 'info'); break; }
        if (ch.level < it.unlock.lvl) { toast('Not in stock for you yet.', 'warn'); break; }
        if (ch.cash < it.unlock.price) { toast('Not enough cash.', 'warn'); fx.push({ t: 'sfx', name: 'error' }); break; }
        ch.cash -= it.unlock.price; ch.n.spent += it.unlock.price; ch.n.bought++; ch.owned[k] = 1;
        fx.push({ t: 'sfx', name: 'buy' }); toast('Bought ' + it.name + '!', 'good');
        break;
      }
      case 'equip': {                                              // a.look
        ch.look = sanitizeLook(ch, a.look); ch.name = ch.look.name || ch.name; ch.n.wardrobe++;
        fx.push({ t: 'sfx', name: 'equip' });
        break;
      }
      case 'mingle': {                                             // a.who (npc id)
        const n = NPCS[a.who]; if (!n) break;
        if (ch.energy < 6) { toast('Too tired to chat.', 'warn'); break; }
        const e = pickWeighted(MINGLE, rng); e.fx(ch);
        ch.affinity[a.who] = Math.min(10, (ch.affinity[a.who] || 0) + e.aff); ch.n.mingles++;
        spend(ch, CFG.mingleMin, 5, fx, rng); fx.push({ t: 'sfx', name: 'sparkle' }); toast(e.text(n.name), 'info');
        break;
      }
      case 'date': {
        const n = NPCS[a.who]; if (!n || (ch.affinity[a.who] || 0) < 4) { toast('Get to know them first.', 'warn'); break; }
        if (ch.cash < CFG.dateCost) { toast('A date costs $' + CFG.dateCost + '.', 'warn'); break; }
        ch.cash -= CFG.dateCost; ch.n.spent += CFG.dateCost; ch.n.dates++; ch.mood += 18; ch.affinity[a.who] = Math.min(10, ch.affinity[a.who] + 2);
        spend(ch, 120, 8, fx, rng); fx.push({ t: 'sfx', name: 'sparkle' }); toast('A date with ' + n.name + '. Smiling for hours.', 'good');
        break;
      }
      case 'at': ch.place = a.to; break;
      case 'run': {                                                // a.q 0..1 (time in the target zone), a.goodBars
        if (ch.energy < 14) { toast('Too tired to run.', 'warn'); fx.push({ t: 'sfx', name: 'error' }); break; }
        const q = clamp(a.q || 0, 0, 1), gb = a.goodBars || 0, gain = Math.floor(gb / 3);
        ch.n.runs++; ch.mood += 5 + Math.round(q * 4); gainXp(ch, 6 + 8 * q, fx); bumpStat(ch, 'tech', 0.1 + 0.2 * q);
        if (gain) { ch.maxEnergy = Math.min(140, ch.maxEnergy + gain); toast('Stamina up: max energy +' + gain, 'good'); }
        spend(ch, 60, 14, fx, rng); fx.push({ t: 'sfx', name: 'confirm' });
        break;
      }
      case 'tune': {                                               // pitch tuner session, a.q 0..1 (time in tune)
        if (ch.energy < 10) { toast('Too tired to sing.', 'warn'); fx.push({ t: 'sfx', name: 'error' }); break; }
        const q = clamp(a.q || 0, 0, 1), gain = (0.4 + 1.3 * q) * (1 - ch.stats.mus / 120) * 1.1;
        bumpStat(ch, 'mus', gain); ch.n.tunes++; ch.mood += 2; gainXp(ch, 10 + 10 * q, fx); spend(ch, 60, 10, fx, rng);
        fx.push({ t: 'sfx', name: 'confirm' }); toast('Musicality +' + gain.toFixed(1), 'good');
        break;
      }
      case 'seqsave': {                                            // a.slot, a.pattern
        const i = clamp(a.slot | 0, 0, SEQ_SLOTS - 1); ch.patterns[i] = a.pattern; ch.patIdx = i; break;
      }
      case 'seqtrain': {                                           // a.score 0..1 = patternScore of the pattern you built
        if (ch.energy < 10) { toast('Too tired to make beats.', 'warn'); fx.push({ t: 'sfx', name: 'error' }); break; }
        const q = clamp(a.score || 0, 0, 1), gain = (0.3 + 1.4 * q) * (1 - ch.stats.ori / 120) * (a.studio ? 1.3 : 1);
        bumpStat(ch, 'ori', gain); ch.n.seqs++; gainXp(ch, 8 + 10 * q, fx); spend(ch, 60, 10, fx, rng);
        fx.push({ t: 'sfx', name: 'confirm' }); toast('Originality +' + gain.toFixed(1), 'good');
        break;
      }
      case 'release': {                                            // a.slot, a.name
        const pat = ch.patterns[clamp(a.slot | 0, 0, SEQ_SLOTS - 1)], hits = patternHits(pat);
        const active = ch.songs.filter((sg) => ch.day - sg.releasedDay < SONG_DECAY.length).length;
        if (hits < 4) { toast('Too sparse: at least 4 hits to release.', 'warn'); fx.push({ t: 'sfx', name: 'error' }); break; }
        if (active >= MAX_ACTIVE_SONGS) { toast('You already have ' + MAX_ACTIVE_SONGS + ' songs earning. Wait for one to fade.', 'warn'); fx.push({ t: 'sfx', name: 'error' }); break; }
        const nm = String(a.name || pat.name || 'Track ' + (ch.songs.length + 1)).slice(0, 24);
        ch.songs.push({ id: 'song' + ch.day + '_' + ch.songs.length, name: nm, releasedDay: ch.day, activeCells: hits, lifetimeFans: 0, quality: +patternScore(pat).toFixed(2) });
        ch.n.songs++; ch.mood += 6; gainXp(ch, 12, fx); fx.push({ t: 'sfx', name: 'unlock' }); toast('Released "' + nm + '". Fans start tomorrow.', 'good');
        break;
      }
      case 'recruit': {
        const m = CREW.find((x) => x.id === a.id); if (!m || ch.crew.some((x) => x.id === m.id)) break;
        if (ch.fans < m.minFans) { toast(m.name + ' needs ' + m.minFans + ' fans first.', 'warn'); fx.push({ t: 'sfx', name: 'error' }); break; }
        if (ch.cash < m.cost) { toast('You need $' + m.cost + ' to recruit ' + m.name + '.', 'warn'); fx.push({ t: 'sfx', name: 'error' }); break; }
        ch.cash -= m.cost; ch.n.spent += m.cost; ch.crew.push({ id: m.id, joinedDay: ch.day, lifetimeCash: 0, lifetimeFans: 0 });
        fx.push({ t: 'sfx', name: 'unlock' }); toast(m.name + ' joined your crew!', 'good');
        break;
      }
      case 'stream': {
        if (ch.fans < STREAM_MIN_FANS) { toast('You need ' + STREAM_MIN_FANS + ' fans to go live.', 'warn'); break; }
        if (ch.flags.streamDay === ch.day) { toast('You already streamed today.', 'warn'); break; }
        if (ch.energy < 15) { toast('Too tired to stream.', 'warn'); fx.push({ t: 'sfx', name: 'error' }); break; }
        const skill = ch.stats.mus + ch.stats.tech + ch.stats.ori + ch.stats.show, cap = Math.max(8, Math.floor(ch.fans * 0.15)), sk = Math.min(1.5, 0.5 + skill / 80);
        const viewers = Math.floor((10 + rng() * cap) * sk), tips = Math.floor(viewers * (0.3 + rng() * 0.4)), fg = Math.floor(viewers / 6);
        ch.cash += tips; ch.fans += fg; ch.mood += 4; ch.flags.streamDay = ch.day; ch.flags.lastViewers = viewers; ch.n.streams++; gainXp(ch, 6, fx);
        spend(ch, 60, 15, fx, rng); fx.push({ t: 'sfx', name: 'crowd_cheer' }); toast('Stream done: ' + viewers + ' viewers, $' + tips + ' tips, +' + fg + ' fans.', 'good');
        break;
      }
      case 'coach': {                                              // paid private coaching with BeeAmGee: +1 skill
        if (ch.cash < COACH_FEE) { toast('Private coaching costs $' + COACH_FEE + '.', 'warn'); fx.push({ t: 'sfx', name: 'error' }); break; }
        if (ch.flags.proCoachDay !== undefined && ch.day - ch.flags.proCoachDay < COACH_COOLDOWN) { toast('BeeAmGee is busy. Come back in ' + (COACH_COOLDOWN - (ch.day - ch.flags.proCoachDay)) + ' day(s).', 'warn'); break; }
        ch.cash -= COACH_FEE; ch.n.spent += COACH_FEE; ch.flags.proCoachDay = ch.day; bumpStat(ch, a.stat, 1); ch.n.coaches++; gainXp(ch, 14, fx);
        spend(ch, 90, 8, fx, rng); fx.push({ t: 'sfx', name: 'levelup' }, { t: 'coachLine', text: COACH_LINES[Math.min(COACH_LINES.length - 1, ch.n.coaches - 1)] }); toast(STAT_NAMES[a.stat] + ' +1', 'good');
        break;
      }
      case 'recorded': ch.n.recorded = (ch.n.recorded || 0) + (a.n || 1); break;
      case 'job': {
        const j = JOBS.find((x) => x.id === a.job); if (!j) break;
        if (ch.energy < j.energy) { toast('Too tired for a shift.', 'warn'); fx.push({ t: 'sfx', name: 'error' }); break; }
        ch.cash += j.cash; ch.fans += j.fans; ch.n.jobs = (ch.n.jobs || 0) + 1; ch.mood -= 2;
        spend(ch, j.minutes, j.energy, fx, rng); fx.push({ t: 'sfx', name: 'coin' }); toast(j.text + ' +$' + j.cash, 'good');
        break;
      }
      case 'tape': {                                               // watch a beatbox VHS tape on the couch
        if (ch.flags.tapeDay === ch.day) { toast('You already watched a tape today.', 'warn'); break; }
        ch.flags.tapeDay = ch.day; ch.mood += 8; bumpStat(ch, 'ori', 0.35); gainXp(ch, 6, fx);
        spend(ch, 60, 2, fx, rng); fx.push({ t: 'sfx', name: 'sparkle' }); toast('You watch an old battle tape. Originality up.', 'good');
        break;
      }
      case 'flag': ch.flags[a.k] = a.v === undefined ? 1 : a.v; break;
      case 'rename': ch.name = a.name; ch.look.name = a.name; break;
      case 'wait': spend(ch, a.minutes || 30, 0, fx, rng); break;
      default: break;
    }
    afterChange(ch, fx);
    return { char: ch, fx };
  }

  /* -------------------------------------------------------------- saves */
  // Storage-like: { getItem, setItem, removeItem }
  const slotKey = (i) => 'bbh:slot' + i;
  function migrate(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const fresh = newChar(raw.look || CAT.DEFAULT_LOOK);
    const ch = Object.assign({}, fresh, raw);
    ch.n = Object.assign({}, fresh.n, raw.n || {}); ch.stats = Object.assign({}, fresh.stats, raw.stats || {});
    ch.songs = raw.songs || []; ch.crew = raw.crew || []; ch.patterns = (raw.patterns && raw.patterns.length === SEQ_SLOTS) ? raw.patterns : fresh.patterns;
    ch.dev = raw.dev || {}; ch.owned = raw.owned || {}; ch.ach = raw.ach || {}; ch.beat = raw.beat || {}; ch.flags = raw.flags || {}; ch.affinity = raw.affinity || {};
    ch.v = CFG.version; return ch;
  }
  const Save = {
    list(store) {
      const out = [];
      for (let i = 1; i <= CFG.slots; i++) {
        let ch = null; try { const s = store.getItem(slotKey(i)); ch = s ? migrate(JSON.parse(s)) : null; } catch (e) { ch = null; }
        out.push(ch);
      }
      return out;
    },
    load(store, i) { try { const s = store.getItem(slotKey(i)); return s ? migrate(JSON.parse(s)) : null; } catch (e) { return null; } },
    save(store, i, ch) { try { store.setItem(slotKey(i), JSON.stringify(ch)); return true; } catch (e) { return false; } },
    remove(store, i) { try { store.removeItem(slotKey(i)); } catch (e) { /* ignore */ } },
    // leading + trailing debounce: first call saves now, further calls inside `ms` collapse to one save at the end
    scheduler(saveFn, ms, now, setT, clearT) {
      let last = -Infinity, timer = null, pending = null;
      return {
        push(v) {
          const t = now();
          if (t - last >= ms) { last = t; saveFn(v); pending = null; return; }
          pending = v; if (timer === null) timer = setT(() => { timer = null; if (pending) { last = now(); saveFn(pending); pending = null; } }, ms - (t - last));
        },
        flush() { if (timer !== null) { clearT(timer); timer = null; } if (pending) { last = now(); saveFn(pending); pending = null; } },
      };
    },
  };

  /* --------------------------------------------------------- dev actions */
  // Dev menu actions go through the same reducer so they exercise real code.
  function dev(ch0, a, rng) {
    rng = rng || Math.random;
    const ch = clone(ch0), fx = [];
    switch (a.k) {
      case 'cash': ch.cash += a.v; break;
      case 'fans': ch.fans += a.v; break;
      case 'xp': gainXp(ch, a.v, fx); break;
      case 'level': while (ch.level < Math.min(a.v, CFG.maxLevel)) gainXp(ch, xpNeed(ch.level) - ch.xp, fx); break;
      case 'stats': for (const s of STATS) bumpStat(ch, s, a.v); break;
      case 'restore': ch.energy = ch.maxEnergy; ch.hunger = 100; ch.mood = 100; break;
      case 'time': ch.minutes = clamp(a.v, 0, CFG.collapseAt - 1); break;
      case 'day': { const n = a.v - ch.day; for (let i = 0; i < Math.max(0, n); i++) endDay(ch, 'sleep', [], rng); if (n < 0) ch.day = a.v; break; }
      case 'unlockAll': ch.dev.unlockAll = !ch.dev.unlockAll; break;
      case 'noGates': ch.dev.noGates = !ch.dev.noGates; break;
      case 'unlockAch': for (const x of ACHIEVEMENTS) ch.ach[x.id] = ch.day; break;
      case 'beatAll': for (const o of OPPONENTS) ch.beat[o.id] = ch.day; break;
      case 'cooldown': ch.lastBattleDay = -9; break;
      case 'affinity': for (const r of ROMANCE) ch.affinity[r] = 10; break;
      default: break;
    }
    afterChange(ch, fx);
    return { char: ch, fx };
  }

  Object.assign(BBH, {
    Core: {
      CFG, SONG_DECAY, MAX_ACTIVE_SONGS, SEQ_STEPS, SEQ_SLOTS, emptyPattern, patternHits, patternScore, CREW, COACH_LINES, COACH_FEE, COACH_COOLDOWN, STREAM_MIN_FANS, DAYS, STYLES, STYLE_BEATS, styleMul, opponentStyle, styleChart, JOBS, STATS, STAT_NAMES, NPCS, ROMANCE, JUDGES, OPPONENTS, FINALS, FOODS, PLACES, ACHIEVEMENTS, MORNING_EVENTS, MINGLE, STUDIO_FEE,
      dow, dayName, clock, hourOf, phase, nightness, barProgramme, canEnter,
      newChar, apply, dev, endDay, spend, gainXp, xpNeed, afterChange, sweepUnlocks, sanitizeLook, isUnlocked, unlockText, condMet, findItem, ownKey,
      windows, judgeHit, HIT_SCORE, makeChart, summarize, rank, reward, resolveBattle, judgeScore, opponentRound,
      Save, migrate, clone,
    },
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = BBH.Core;
})(typeof globalThis !== 'undefined' ? globalThis : this);
