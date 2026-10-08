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

  /* ------------------------------------------------- story: the park jam arc and BeeAmGee (from Beatbox Story, STORY_PLAN.md) */
  // The JAM: the cypher by the graffiti wall in the park, every afternoon from day 2 (Beatbox Story: daytime park activity, the "try Jam" tip from day 2).
  // BeeAmGee is NOT in the park at the start: he watches you from the back of the cypher (2nd jam, or a battle win and a jam, or 4 busks from day 3),
  // is gone again, and from the NEXT day he sits on his bench: the first visit after that is the meeting. flags: bmgSighted (day), bmgVia ('jam'|'busk'), bmgMet (day),
  // pigpenJam (day), famousJam (day), story (1 = save made with this story; older saves migrate keeping BeeAmGee). n.jams counts finished jams.
  const JAM = { fromDay: 2, open: 12, close: 18, minutes: 60, energy: 10, sightJams: 2, sightBusks: 4, sightBuskDay: 3, pigpenJams: 3, famousJams: 5, famousFans: 30 };
  const jamOn = (ch) => !!ch && ch.day >= JAM.fromDay && hourOf(ch.minutes) >= JAM.open && hourOf(ch.minutes) < JAM.close;
  const JAM_WHEN = 'every afternoon, 12:00 to 18:00';
  const bmgDue = (ch) => !!(ch && ch.flags && ch.flags.bmgSighted && !ch.flags.bmgMet && ch.day > ch.flags.bmgSighted);
  const bmgHere = (ch) => !!(ch && ch.flags && (ch.flags.bmgMet || bmgDue(ch)));
  const N = (text) => ({ who: null, text }), BMG = (text) => ({ who: 'beeamgee', text }), PIG = (text) => ({ who: 'pigpen', mood: 'angry', text });
  const STORY = {
    firstJam: [N('You step into the circle by the graffiti wall.'), N('Strangers, all of them. None of them care where you slept last night.'), N('Maybe this is what you needed.')],
    sightJam: [N('Someone is standing at the back of the cypher.'), N('Grey beard. Denim jacket. Gold glasses. He does not perform.'), N('He nods once when you finish your round. Then he is gone.'), N('...who was that?')],
    sightBusk: [N('An old man with a grey beard watches your whole set from across the path.'), N('He does not drop a coin. He nods once when you finish. Then he is gone.'), N('...who was that?')],
    meet: [BMG('Saw you in the cypher the other day.'), BMG('You have got something. Raw. Unfinished. But something.'), BMG('Name is BeeAmGee. Been at this thirty years. This bench is my office.'), BMG('Sit with me any day for a free lesson. When you are ready for the real thing, private coaching is fifty bucks.')],
    pigpen: [N('The circle goes loud. A guy in a red bomber pushes in and stares you down.'), PIG('Yo. You. New face.'), PIG('You sound like you have been practising in a closet.'), PIG('Saturday nights at the bar. Climb the ladder. I will be waiting at the top.'), PIG('Do not bring a friend. You will need them on the way home.')],
    famous: [N('The circle goes quiet mid-round.'), N('Heads turn. Someone you know from the videos just stepped into the cypher.'), N('They throw a thirty second flurry that nobody can answer. Then they are gone, walking off with two friends.'), N('Someone whispers their name. You pretend you were not watching.'), N('There is a long way to go.')],
  };
  const storyLines = (ch, id) => (id === 'meet' && ch.flags.bmgVia === 'busk' ? [BMG('Saw you busking the other day.')].concat(STORY.meet.slice(1)) : STORY[id] || []).map((l) => Object.assign({}, l));
  // Foxy reads the room (Beatbox Story FOXY_TIPS, the jam arc rules): a story line, or null for the normal tip rotation
  const STORY_TIPS = {
    foxyNoJam: ['I heard there are jams in the park. That is where the beatboxers go, right?', 'If you are going to do this beatbox thing, go where they are. The park has a cypher every afternoon.', 'You are not going to make it sitting in the flat. There are people in the park.'],
    foxyJams: ['Still going to the jams? Keep at it.', 'The cypher again? Good. Go.', 'More practice in the circle. Less in the bedroom.', 'The park people are your people now, I guess.'],
    foxyPigpen: ['Some loud guy was asking about you. Saturday at the bar?', 'I do not know who Pig Pen is. Does not sound like a friend.'],
  };
  function storyTip(ch, who, i) {
    if (who !== 'foxy' || !ch) return null; const n = ch.n || {}, f = ch.flags || {}, pick = (a) => a[Math.abs(i | 0) % a.length];
    if (!n.jams && ch.day >= JAM.fromDay) return pick(STORY_TIPS.foxyNoJam);
    if (f.pigpenJam && !(ch.beat && ch.beat.pigpen)) return pick(STORY_TIPS.foxyPigpen);
    if (n.jams && n.jams < JAM.pigpenJams) return pick(STORY_TIPS.foxyJams);
    return null;
  }
  // after a finished set: at most one story beat per set (first jam, the BeeAmGee sighting, Pig Pen crashes the cypher, a famous beatboxer drops in)
  function storyAfter(ch, kind, fx) {
    const f = ch.flags, n = ch.n; let id = null;
    if (kind === 'jam') {
      if (n.jams === 1) id = 'firstJam';
      else if (!f.bmgSighted && (n.jams >= JAM.sightJams || n.battlesWon >= 1)) { f.bmgSighted = ch.day; f.bmgVia = 'jam'; id = 'sightJam'; }
      else if (!f.pigpenJam && n.jams >= JAM.pigpenJams) { f.pigpenJam = ch.day; id = 'pigpen'; }
      else if (!f.famousJam && n.jams >= JAM.famousJams && ch.fans >= JAM.famousFans) { f.famousJam = ch.day; id = 'famous'; }
    } else if (kind === 'busk' && !f.bmgSighted && n.busks >= JAM.sightBusks && ch.day >= JAM.sightBuskDay) { f.bmgSighted = ch.day; f.bmgVia = 'busk'; id = 'sightBusk'; }
    if (id) fx.push({ t: 'story', id, lines: storyLines(ch, id) });
    return id;
  }
  // a story beat that waits for you when you walk into a place (the place scenes run it): 'bmgMeet' or null
  const storyArrive = (ch, place) => (place === 'park' && bmgDue(ch) ? 'bmgMeet' : null);

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
      owned: {}, ach: {}, beat: {}, flags: { story: 1 }, dev: {}, place: 'home', rentDebt: 0, lastBattleDay: -9, lastShowcaseDay: -9,
      affinity: {}, seen: {}, history: [], songs: [], crew: [], patterns: [0, 1, 2, 3].map((i) => emptyPattern(i)), patIdx: 0,
      n: { busks: 0, openMics: 0, showcases: 0, karaoke: 0, battlesWon: 0, battlesLost: 0, meals: 0, homeMeals: 0, perfects: 0, bestCombo: 0, perfectLane: [0, 0, 0, 0], sRanks: 0, collapses: 0, nights: 0, mingles: 0, dates: 0, rentPaid: 0, spent: 0, trains: 0, wardrobe: 0, bought: 0, runs: 0, tunes: 0, seqs: 0, songs: 0, streams: 0, coaches: 0, recorded: 0, jobs: 0, jams: 0 },
      created: 0, trainLv: defaultTrainLv(), sounds: START_SOUNDS.slice(),
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
    for (const snd of sweepSounds(ch)) fx.push({ t: 'soundUnlocked', id: snd.id, name: snd.name }, { t: 'toast', text: 'New sound: ' + snd.name, kind: 'good' }, { t: 'sfx', name: 'unlock' });
  }

  /* ---------------------------------------------------------- the clock */
  // Spend game minutes (and optionally energy/hunger). Handles the 02:00 collapse. Returns true if the day rolled.
  function spend(ch, minutes, energy, fx, rng) {
    const m0 = ch.minutes; ch.minutes += minutes;
    // the jam starts while you are busy: tell the player where to go (the map pin and the park spot light up too)
    if (!jamOn(Object.assign({}, ch, { minutes: m0 })) && jamOn(ch) && hourOf(m0) < JAM.open) fx.push({ t: 'toast', text: 'The JAM has started in the PARK! Beatboxers are gathering by the graffiti wall.', kind: 'good' }, { t: 'sfx', name: 'sparkle' }, { t: 'jamStart', day: ch.day });
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
    if (ch.day >= JAM.fromDay && !ch.n.jams) lines.push('Foxy: "There is a jam in the park this afternoon, 12:00 to 18:00. That is where the beatboxers go."');
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
      case 'jam': return { minutes: JAM.minutes, energy: JAM.energy, cash: 0, fans: Math.round((1.5 + st.ori * 0.06 + st.show * 0.04) * (0.5 + 1.5 * q) * bonus), xp: Math.round(10 + 14 * q), mood: q < 0.4 ? 2 : 6 };
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

  /* ------------------------------------------------- training (TRAINING_PLAN section 1) */
  // Every skill trains two ways: IDLE (the clock runs, points tick up) or PLAY (a mini game: less time, about double the gain).
  const TRAIN = { mus: { game: 'ear', alt: 'tune' }, tech: { game: 'beat' }, ori: { game: 'make' }, show: { game: 'pose' } };
  const TRAIN_CFG = {
    idleRatePerHour: 1.0,                 // stat points per hour of idle practice at stat 0 (scaled by 1 - stat/120)
    idleMinStep: 15, idleMaxMinutes: 240, playMul: 2,
    playMinutes: { ear: 20, tune: 20, beat: 20, make: 25, pose: 20 }, levelMax: 8,
    energyPerHour: 12, xpPerHour: 8, unlockQ: 0.7, studioMul: 1.4,
  };
  const TRAIN_GAMES = ['ear', 'beat', 'pose', 'make', 'tune'];
  const gameStat = (game) => (game === 'tune' ? 'mus' : STATS.find((s) => TRAIN[s].game === game) || null);
  const levelMul = (l) => 1 + 0.18 * (clamp(Math.floor(l || 1), 1, TRAIN_CFG.levelMax) - 1);
  // Stat points for `minutes` of idle practice, integrated in 15 minute steps so it is monotonic in time and
  // diminishing both with the current stat and (gently) within a long session. where === 'studio' adds x1.4.
  function idleGain(ch, stat, minutes, where) {
    let s = ch && ch.stats && ch.stats[stat] !== undefined ? ch.stats[stat] : 3, left = Math.max(0, minutes || 0), g = 0;
    const mul = where === 'studio' ? TRAIN_CFG.studioMul : 1, step = TRAIN_CFG.idleMinStep;
    while (left > 1e-9) {
      const m = Math.min(step, left), d = TRAIN_CFG.idleRatePerHour * (m / 60) * Math.max(0, 1 - s / 120) * mul;
      g += d; s = Math.min(99, s + d); left -= m;
    }
    return g;
  }
  const playGain = (ch, stat, game, level, q, where) => idleGain(ch, stat, TRAIN_CFG.playMinutes[game] || 20, where) * TRAIN_CFG.playMul * levelMul(level) * (0.4 + 0.6 * clamp(q || 0, 0, 1));
  const defaultTrainLv = () => ({ ear: 1, beat: 1, pose: 1, make: 1, tune: 1 });

  // EAR TRAINING: eight lessons for total beginners. Notes are MIDI numbers (60 = middle C).
  const EAR_LEVELS = [
    { level: 1, id: 'updown', name: 'Up or Down', ask: 'Did the second note go higher or lower?', rounds: 6, choices: ['higher', 'lower'],
      lesson: { title: 'High and low', text: 'Every note has a height. A bird chirp is high, a tuba is low. You will hear two notes. Does the second one climb up, like going upstairs, or step down? Tip: hum along. If your voice has to go up to match it, the note went up.',
        examples: [{ label: 'Going up', notes: [60, 67] }, { label: 'Going down', notes: [67, 60] }, { label: 'Tiny step up', notes: [60, 62] }] } },
    { level: 2, id: 'same', name: 'Same or Different', ask: 'Were the two notes the same or different?', rounds: 6, choices: ['same', 'different'],
      lesson: { title: 'Twins or strangers', text: 'Sometimes two notes are exactly the same, like the first two notes of "Twinkle Twinkle Little Star". Sometimes they move a tiny bit. Listen for a wobble: if the second note feels even a little higher or lower, it is different.',
        examples: [{ label: 'Same (Twin, kle)', notes: [60, 60] }, { label: 'Different, a tiny bit', notes: [60, 61] }, { label: 'Different, clearly', notes: [60, 64] }] } },
    { level: 3, id: 'stepleap', name: 'Step or Leap', ask: 'Was that a small step or a big leap?', rounds: 8, choices: ['step', 'leap'],
      lesson: { title: 'Walking and jumping', text: 'A step moves to the very next note, like walking. "Mary Had a Little Lamb" is almost all steps. A leap jumps over notes, like the big jump at the start of "Somewhere Over the Rainbow" ("Some-where"). Steps feel smooth, leaps feel like a surprise.',
        examples: [{ label: 'Step (Ma, ry)', notes: [64, 62] }, { label: 'Leap (Some, where)', notes: [60, 72] }, { label: 'Another leap', notes: [62, 69] }] } },
    { level: 4, id: 'majmin', name: 'Happy or Sad Chord', ask: 'Did the chord sound happy (major) or sad (minor)?', rounds: 8, choices: ['major', 'minor'],
      lesson: { title: 'Chords have moods', text: 'A chord is three notes played together. A major chord sounds bright and happy, like a birthday party. A minor chord sounds sad or mysterious, like a rainy movie scene. Only one middle note changes between them, but the whole mood flips.',
        examples: [{ label: 'Major (happy)', notes: [60, 64, 67], chord: true }, { label: 'Minor (sad)', notes: [60, 63, 67], chord: true }, { label: 'Major, higher up', notes: [65, 69, 72], chord: true }] } },
    { level: 5, id: 'octfifth', name: 'Octave or Fifth', ask: 'Was that jump an octave or a fifth?', rounds: 8, choices: ['octave', 'fifth'],
      lesson: { title: 'Two famous jumps', text: 'An octave is the same note, just higher. It sounds hollow and complete, like "Some-where" in "Somewhere Over the Rainbow". A fifth is a strong, open jump, like the first "Twin-kle, twin-kle" in "Twinkle Twinkle Little Star". The octave feels like home again, the fifth feels like a big step up a hill.',
        examples: [{ label: 'Octave (Some, where)', notes: [60, 72] }, { label: 'Fifth (Twinkle, twinkle)', notes: [60, 67] }, { label: 'Both together', notes: [60, 67, 72], chord: true }] } },
    { level: 6, id: 'thirds', name: 'Bright or Dark Third', ask: 'Was that a major third (bright) or a minor third (dark)?', rounds: 10, choices: ['major 3rd', 'minor 3rd'],
      lesson: { title: 'The mood maker', text: 'A third is a small jump that decides if music feels happy or sad. A major third sounds bright and happy, like the start of "Oh When the Saints" ("Oh when"). A minor third sounds darker and a bit sad, like the first two notes of the "Smoke on the Water" riff.',
        examples: [{ label: 'Major 3rd (Oh, when)', notes: [60, 64] }, { label: 'Minor 3rd (Smoke on the Water)', notes: [67, 70] }, { label: 'Major 3rd, together', notes: [60, 64], chord: true }, { label: 'Minor 3rd, together', notes: [60, 63], chord: true }] } },
    { level: 7, id: 'fourfifth', name: 'Fourth or Fifth', ask: 'Was that a fourth or a fifth?', rounds: 10, choices: ['4th', '5th'],
      lesson: { title: 'Wedding or stars', text: 'These two sound alike, so use songs. A fourth is "Here Comes the Bride" ("Here comes"). It sounds like a question being called out. A fifth is "Twinkle Twinkle" (the jump to the second "twinkle"), and it sounds wider and more open, like the Star Wars theme opening.',
        examples: [{ label: 'Fourth (Here, comes)', notes: [60, 65] }, { label: 'Fifth (Twinkle, twinkle)', notes: [60, 67] }, { label: 'Fourth, then fifth', notes: [62, 67] }] } },
    { level: 8, id: 'name', name: 'Name That Jump', ask: 'Which jump was that?', rounds: 12, choices: ['minor 3rd', 'major 3rd', '4th', '5th', 'octave'],
      lesson: { title: 'Your song toolbox', text: 'Now you know five jumps. Match each one to its song: minor 3rd is "Smoke on the Water", major 3rd is "Oh When the Saints", 4th is "Here Comes the Bride", 5th is "Twinkle Twinkle", and the octave is "Somewhere Over the Rainbow". Sing the song in your head and see which fits.',
        examples: [{ label: 'Minor 3rd', notes: [60, 63] }, { label: 'Major 3rd', notes: [60, 64] }, { label: '4th', notes: [60, 65] }, { label: '5th', notes: [60, 67] }, { label: 'Octave', notes: [60, 72] }] } },
  ];
  const EAR_SEMIS = { 'minor 3rd': 3, 'major 3rd': 4, '4th': 5, '5th': 7, fifth: 7, octave: 12 };
  // One question for an ear level: { notes, chord, answer } (answer is one of the level's choices). Deterministic with a seeded rng.
  function earQuestion(level, rng) {
    rng = rng || Math.random; const L = EAR_LEVELS[clamp((level | 0) - 1, 0, EAR_LEVELS.length - 1)];
    const answer = L.choices[Math.floor(rng() * L.choices.length)], root = 55 + Math.floor(rng() * 10);
    switch (L.id) {
      case 'updown': { const d = 2 + Math.floor(rng() * 6); return { notes: answer === 'higher' ? [root, root + d] : [root + d, root], chord: false, answer }; }
      case 'same': return { notes: [root, answer === 'same' ? root : root + (rng() < 0.5 ? -1 : 1) * (1 + Math.floor(rng() * 3))], chord: false, answer };
      case 'stepleap': { const d = answer === 'step' ? 1 + Math.floor(rng() * 2) : 5 + Math.floor(rng() * 8), up = rng() < 0.5; return { notes: up ? [root, root + d] : [root + d, root], chord: false, answer }; }
      case 'majmin': return { notes: [root, root + (answer === 'major' ? 4 : 3), root + 7], chord: true, answer };
      default: return { notes: [root, root + EAR_SEMIS[answer]], chord: false, answer };
    }
  }

  // RHYTHM TRAINING: real, known beginner beatbox patterns. lanes: one char per step (B kick, t hat, K snare, P pf, . rest).
  const BEAT_LANE = { B: 0, t: 1, K: 2, P: 3 };
  const BEAT_LEVELS = [
    { level: 1, id: 'bootscats', name: 'Boots and Cats', say: 'B t K t', steps: 8, lanes: 'B.t.K.t.', bpm: 80, tip: 'Say "boots and cats and" out loud, then drop the vowels. B is a tiny lip pop, t is a quick tongue tap, K is a sharp "k" at the back of the mouth.' },
    { level: 2, id: 'bootsti', name: 'Boots Ti Ti', say: 'B t t B K t', steps: 8, lanes: 'BttBK.t.', bpm: 84, tip: '"Boots ti ti boots cats ti". The two quick hats push you into the second kick. Keep them light.' },
    { level: 3, id: 'eighthhats', name: 'Running Hats', say: 'B t t t K t t t', steps: 8, lanes: 'BtttKttt', bpm: 88, tip: 'Hats on every step, like a ticking clock. Kick and snare just replace a hat. Keep the t tiny so you do not run out of air.' },
    { level: 4, id: 'boombap', name: 'Boom Bap', say: 'B . t B K . t .', steps: 8, lanes: 'B.tBK.t.', bpm: 90, tip: 'The classic 90s hip hop groove. Lean back on the rests. The kick right before the snare is what makes it bounce.' },
    { level: 5, id: 'doublekick', name: 'Double Kick', say: 'B t K B B t K t', steps: 8, lanes: 'BtKBBtKt', bpm: 94, tip: 'Two kicks in a row in the middle. Reset your lips quickly between them, like saying "b b".' },
    { level: 6, id: 'pfclap', name: 'Pf Clap', say: 'B t K t B P K t', steps: 8, lanes: 'BtKtBPKt', bpm: 98, tip: 'Pf is a kick and a hiss together, like a soft clap: press your lips, push air, let it buzz out as "pff".' },
    { level: 7, id: 'dnb', name: 'Drum and Bass', say: 'B . K . . B K .', steps: 8, lanes: 'B.K..BK.', bpm: 150, tip: 'Fast but sparse. The kick that lands just before the second snare is the famous drum and bass skip. Real DnB runs near 170, we start at 150.' },
    { level: 8, id: 'doubletime', name: 'Double Time Mix', say: 'B t B t K t B t B B K t P t K t', steps: 16, lanes: 'BtBtKtBtBBKtPtKt', bpm: 92, tip: 'Sixteen steps per bar: everything you learned, twice as busy. Breathe in through the hats and keep the kicks short.' },
  ];
  for (const L of BEAT_LEVELS) L.notes = L.lanes.split('').map((c, i) => ({ step: i, beat: i * 4 / L.steps, lane: BEAT_LANE[c] === undefined ? -1 : BEAT_LANE[c] })).filter((n) => n.lane >= 0);

  // SHOWMANSHIP: a pose Simon Says. len grows 3..8, the move pool grows, and the beat speeds up.
  const POSE_MOVES = ['left', 'right', 'duck', 'jump', 'point', 'spin', 'freeze', 'clap'];
  const POSE_LEVELS = [3, 3, 4, 5, 5, 6, 7, 8].map((len, i) => ({ level: i + 1, len, moves: POSE_MOVES.slice(0, Math.min(8, 4 + i)), bpm: 90 + i * 6 }));

  // SOUNDS: the beatbox vocabulary. The first four are known from the start, the rest unlock as you progress.
  // unlock.k: 'start' | 'level' (player level >= v) | 'npc' (met that NPC) | 'win' (v = opponent id, or v = number of battle wins)
  //           | 'ach' (achievement id) | 'day' (day >= v, optionally `place`). An optional `or` holds an alternative rule.
  const SOUNDS = [
    { id: 'B', name: 'Kick', lane: 0, blurb: 'A tiny lip pop, like saying "b" without the voice.', unlock: { k: 'start' } },
    { id: 't', name: 'Hi-hat', lane: 1, blurb: 'A quick tongue tap behind the teeth: "t".', unlock: { k: 'start' } },
    { id: 'K', name: 'Snare', lane: 2, blurb: 'A sharp "k" at the back of the mouth.', unlock: { k: 'start' } },
    { id: 'Pf', name: 'Pf snare', lane: 3, blurb: 'Lips pop and air hisses out: "pff". A soft clap.', unlock: { k: 'start' } },
    { id: 'RIM', name: 'Rimshot', blurb: 'A clicky tongue pop that sounds like a stick on a drum rim.', unlock: { k: 'level', v: 3 } },
    { id: 'LR', name: 'Lip roll', blurb: 'Relaxed lips flap like a motorboat. The bass wobble of modern beatbox.', unlock: { k: 'npc', v: 'beeamgee', or: { k: 'level', v: 4 } } },
    { id: 'TB', name: 'Throat bass', blurb: 'A deep growl from the throat. Feels like a subwoofer.', unlock: { k: 'win', v: 'tick' } },
    { id: 'CR', name: 'Click roll', blurb: 'The tongue clicks and rattles on the roof of the mouth.', unlock: { k: 'day', v: 4, place: 'studio' } },
    { id: 'IK', name: 'Inward K', blurb: 'A snare sucked in on the breath, so you never run out of air.', unlock: { k: 'level', v: 6 } },
    { id: 'WB', name: 'Water drop', blurb: 'A round "bloop" from popping the cheeks. Miro taught you.', unlock: { k: 'npc', v: 'miro' } },
    { id: 'ZP', name: 'Zipper', blurb: 'A zipping scratch sucked in through the lips.', unlock: { k: 'win', v: 3 } },
    { id: 'HUM', name: 'Hum bass', blurb: 'Hum a note while you drum. Your first melody.', unlock: { k: 'ach', v: 'tuned' } },
    { id: 'SI', name: 'Siren', blurb: 'A whistle that slides up and down like a police siren.', unlock: { k: 'level', v: 10 } },
  ];
  const START_SOUNDS = SOUNDS.filter((s) => s.unlock.k === 'start').map((s) => s.id);
  const metNpc = (ch, who) => !!((ch.seen && ch.seen[who]) || (ch.affinity && ch.affinity[who] > 0) || (ch.crew || []).some((m) => m.id === who) || (who === 'beeamgee' && ch.n && ch.n.coaches > 0));
  function soundRule(ch, u) {
    if (!u) return false;
    let met;
    switch (u.k) {
      case 'start': met = true; break;
      case 'level': met = ch.level >= u.v; break;
      case 'npc': met = metNpc(ch, u.v); break;
      case 'win': met = typeof u.v === 'string' ? !!(ch.beat && ch.beat[u.v]) : (ch.n && ch.n.battlesWon || 0) >= u.v; break;
      case 'ach': met = !!(ch.ach && ch.ach[u.v]); break;
      case 'day': met = ch.day >= u.v && (!u.place || ch.place === u.place); break;
      default: met = false;
    }
    return met || (u.or ? soundRule(ch, u.or) : false);
  }
  function soundUnlocked(ch, id) {
    const s = SOUNDS.find((x) => x.id === id); if (!s) return false;
    if (s.unlock.k === 'start' || (ch.dev && ch.dev.unlockAll)) return true;
    return (ch.sounds || []).indexOf(id) >= 0;
  }
  const soundsFor = (ch) => SOUNDS.filter((s) => soundUnlocked(ch, s.id));
  function soundUnlockText(u) {
    if (!u) return '';
    const one = (r) => r.k === 'start' ? 'Known from the start' : r.k === 'level' ? 'Reach level ' + r.v : r.k === 'npc' ? 'Meet ' + (NPCS[r.v] ? NPCS[r.v].name : (CREW.find((c) => c.id === r.v) || { name: r.v }).name) : r.k === 'win' ? (typeof r.v === 'string' ? 'Beat ' + ((OPPONENTS.find((o) => o.id === r.v) || { name: r.v }).name) : 'Win ' + r.v + ' battles') : r.k === 'ach' ? 'Achievement: ' + ((ACHIEVEMENTS.find((a) => a.id === r.v) || { name: r.v }).name) : r.k === 'day' ? 'Visit the ' + (r.place ? PLACES[r.place].name : 'city') + ' from day ' + r.v : '?';
    return one(u) + (u.or ? ' or ' + one(u.or).replace(/^R/, 'r') : '');
  }
  // latch newly met sound rules into ch.sounds; returns the new SOUNDS entries
  function sweepSounds(ch) {
    if (!Array.isArray(ch.sounds)) ch.sounds = START_SOUNDS.slice();
    const out = [];
    for (const s of SOUNDS) if (ch.sounds.indexOf(s.id) < 0 && soundRule(ch, s.unlock)) { ch.sounds.push(s.id); out.push(s); }
    return out;
  }

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
      case 'trainIdle': {                                          // a.stat, a.minutes, a.where?: idle practice, ticks every 15 min
        const stat = a.stat; if (STATS.indexOf(stat) < 0) break;
        const C = TRAIN_CFG, step = C.idleMinStep, where = a.where || (ch.place === 'studio' ? 'studio' : 'home'), fee = where === 'studio' ? STUDIO_FEE : 0;
        const want = clamp(Math.round((a.minutes || 60) / step) * step, step, C.idleMaxMinutes), ePer = C.energyPerHour * step / 60;
        if (ch.cash < fee) { toast('The studio costs $' + fee + '.', 'warn'); fx.push({ t: 'sfx', name: 'error' }); break; }
        if (ch.energy < ePer) { toast('Too tired to train.', 'warn'); fx.push({ t: 'sfx', name: 'error' }); break; }
        if (ch.minutes + step >= CFG.collapseAt) { toast('Too late to train. Go to bed.', 'warn'); fx.push({ t: 'sfx', name: 'error' }); break; }
        ch.cash -= fee; ch.n.spent += fee; ch.n.trains++;
        let done = 0, total = 0, stop = '';
        const day0 = ch.day;
        while (done < want) {
          if (ch.energy < ePer) { stop = 'You ran out of energy.'; break; }
          if (ch.minutes + step >= CFG.collapseAt) { stop = 'It is late. You stop for the night.'; break; }
          if (ch.place !== 'home' && !canEnter(ch, ch.place).ok) { stop = (PLACES[ch.place] ? PLACES[ch.place].name : 'This place') + ' is closing.'; break; }
          const g = idleGain(ch, stat, step, where);
          bumpStat(ch, stat, g); total += g; done += step;
          fx.push({ t: 'trainTick', stat, gain: +g.toFixed(2), minute: done });
          gainXp(ch, C.xpPerHour * step / 60 * (where === 'studio' ? 1.3 : 1), fx);
          if (spend(ch, step, ePer, fx, rng) || ch.day !== day0) break;
        }
        ch.n.idleMin = (ch.n.idleMin || 0) + done; ch.mood += done >= 60 ? 1 : 0;
        fx.push({ t: 'sfx', name: 'confirm' });
        if (stop) toast(stop, 'info');
        toast(STAT_NAMES[stat] + ' +' + total.toFixed(1) + ' (' + done + ' min)', 'good');
        break;
      }
      case 'trainGame': {                                          // a.stat, a.game, a.level, a.q 0..1, a.minutes?, a.where?
        const game = a.game; if (!TRAIN_CFG.playMinutes[game]) break;
        const stat = STATS.indexOf(a.stat) >= 0 ? a.stat : gameStat(game);
        const where = a.where === 'studio' ? 'studio' : 'home', fee = where === 'studio' ? STUDIO_FEE : 0;
        const mins = Math.max(1, Math.round(a.minutes || TRAIN_CFG.playMinutes[game])), en = TRAIN_CFG.energyPerHour * mins / 60;
        if (!ch.trainLv) ch.trainLv = defaultTrainLv();
        const top = ch.trainLv[game] || 1, level = clamp(Math.floor(a.level || top), 1, top), q = clamp(+a.q || 0, 0, 1);
        if (ch.cash < fee) { toast('The studio costs $' + fee + '.', 'warn'); fx.push({ t: 'sfx', name: 'error' }); break; }
        if (ch.energy < en) { toast('Too tired to train.', 'warn'); fx.push({ t: 'sfx', name: 'error' }); break; }
        ch.cash -= fee; ch.n.spent += fee; ch.n.trainGames = (ch.n.trainGames || 0) + 1;
        if (game === 'tune') ch.n.tunes++; else if (game === 'make') ch.n.seqs++;
        const gain = playGain(ch, stat, game, level, q, where);
        bumpStat(ch, stat, gain);
        gainXp(ch, TRAIN_CFG.xpPerHour * (TRAIN_CFG.playMinutes[game] / 60) * TRAIN_CFG.playMul * levelMul(level) * (0.4 + 0.6 * q) * (where === 'studio' ? 1.3 : 1), fx);
        ch.mood += q >= 0.7 ? 3 : q < 0.3 ? -1 : 1;
        fx.push({ t: 'trainResult', stat, game, level, q, gain: +gain.toFixed(2) });
        if (q >= TRAIN_CFG.unlockQ && level === top && top < TRAIN_CFG.levelMax) {
          ch.trainLv[game] = top + 1;
          fx.push({ t: 'levelUp', game, level: top + 1 }, { t: 'sfx', name: 'unlock' });
          toast('Level ' + (top + 1) + ' unlocked!', 'good');
        }
        toast(STAT_NAMES[stat] + ' +' + gain.toFixed(1), 'good');
        spend(ch, mins, en, fx, rng); fx.push({ t: 'sfx', name: 'confirm' });
        break;
      }
      case 'meet': {                                               // a.who: first conversation with an NPC or crew member
        if (!a.who) break;
        if (!ch.seen) ch.seen = {};
        if (!ch.seen[a.who]) ch.seen[a.who] = ch.day;
        break;
      }
      case 'perform': {                                            // a.kind, a.res (summarize output)
        const res = a.res, rw = reward(a.kind, res, ch), k = a.kind;
        if (k === 'busk') ch.n.busks++; else if (k === 'openmic') ch.n.openMics++; else if (k === 'showcase') { ch.n.showcases++; ch.lastShowcaseDay = ch.day; } else if (k === 'karaoke') ch.n.karaoke++; else if (k === 'jam') { ch.n.jams = (ch.n.jams || 0) + 1; ch.flags.jamDay = ch.day; }
        ch.n.perfects += res.perfect; ch.n.bestCombo = Math.max(ch.n.bestCombo, res.bestCombo);
        res.perfectLane.forEach((v, i) => { ch.n.perfectLane[i] += v; });
        if (res.rank === 'S') ch.n.sRanks++;
        ch.cash += rw.cash; ch.fans += rw.fans; ch.mood += rw.mood; gainXp(ch, rw.xp, fx);
        // performing also nudges the stats a little (Showmanship especially)
        bumpStat(ch, 'show', 0.15 + 0.4 * res.accuracy); bumpStat(ch, 'mus', 0.1 + 0.3 * res.accuracy);
        if (res.bestCombo >= 30) bumpStat(ch, 'tech', 0.2);
        // the cypher teaches you something (Beatbox Story jam: a random skill up)
        if (k === 'jam') { const st = ['mus', 'tech', 'ori'][Math.floor(rng() * 3)], g = 0.5 + 0.7 * clamp(res.accuracy, 0, 1); bumpStat(ch, st, g); toast('The cypher taught you something: ' + STAT_NAMES[st] + ' +' + g.toFixed(1), 'good'); }
        spend(ch, rw.minutes, rw.energy, fx, rng);
        storyAfter(ch, k, fx);
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
      case 'jamWatch': {                                           // stand at the edge of the cypher and listen: no mini game, a little Originality and mood
        if (!jamOn(ch) && !ch.dev.noGates) { toast('The jam is ' + JAM_WHEN + '.', 'warn'); break; }
        ch.mood += 5; bumpStat(ch, 'ori', 0.25); gainXp(ch, 4, fx); spend(ch, 30, 3, fx, rng); fx.push({ t: 'sfx', name: 'applause' }); toast('You watch the cypher. Originality up.', 'good');
        break;
      }
      case 'story': {                                              // a.k: 'bmgMeet' (the first meeting with BeeAmGee on his bench)
        if (a.k === 'bmgMeet') {
          if (!bmgDue(ch)) break;
          ch.flags.bmgMet = ch.day; if (!ch.seen) ch.seen = {}; if (!ch.seen.beeamgee) ch.seen.beeamgee = ch.day;
          fx.push({ t: 'story', id: 'meet', lines: storyLines(ch, 'meet') }, { t: 'sfx', name: 'sparkle' });
        }
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
    const tl = defaultTrainLv(), rl = raw.trainLv && typeof raw.trainLv === 'object' ? raw.trainLv : {};
    for (const g of TRAIN_GAMES) tl[g] = clamp(Math.floor(+rl[g] || 1), 1, TRAIN_CFG.levelMax);
    ch.trainLv = tl; ch.seen = raw.seen || {};
    // saves from before the story (no flags.story): if they already met BeeAmGee on the old always-there bench, he stays met and on his bench
    if (!ch.flags.story) {
      const f = ch.flags, met = f.visited_park || f.tip_beeamgee || f.coachDay !== undefined || f.proCoachDay !== undefined || ch.seen.beeamgee || (ch.n.coaches || 0) > 0;
      if (met && !f.bmgMet) { f.bmgMet = ch.day || 1; f.bmgSighted = f.bmgSighted || f.bmgMet; f.bmgVia = f.bmgVia || 'busk'; }
      f.story = 1;
    }
    ch.sounds = Array.isArray(raw.sounds) ? raw.sounds.filter((id) => SOUNDS.some((x) => x.id === id)) : [];
    for (const id of START_SOUNDS) if (ch.sounds.indexOf(id) < 0) ch.sounds.push(id);
    sweepSounds(ch);                                                // silently latch sounds an old save already earned
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
      TRAIN, TRAIN_CFG, TRAIN_GAMES, gameStat, idleGain, playGain, levelMul, defaultTrainLv,
      EAR_LEVELS, earQuestion, BEAT_LEVELS, BEAT_LANE, POSE_LEVELS, POSE_MOVES,
      SOUNDS, START_SOUNDS, soundUnlocked, soundsFor, soundRule, soundUnlockText, sweepSounds, metNpc,
      JAM, JAM_WHEN, jamOn, bmgDue, bmgHere, STORY, STORY_TIPS, storyLines, storyTip, storyAfter, storyArrive,
    },
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = BBH.Core;
})(typeof globalThis !== 'undefined' ? globalThis : this);
