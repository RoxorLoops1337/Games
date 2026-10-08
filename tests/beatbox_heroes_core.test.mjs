// Beatbox Heroes: rules, unlocks, economy, saves and the scoring maths.
import { ok, eq, near, between, done, load } from './beatbox_heroes_lib.mjs';
const BBH = load('pix', 'catalog', 'core');
const { Core, CATALOG: CAT } = BBH;
const rng = BBH.rng(7);

/* ---- catalog sanity */
{
  const seen = new Set();
  for (const [g, arr] of Object.entries(CAT.GROUPS)) {
    const ids = new Set();
    for (const it of arr) {
      ok(!ids.has(it.id), `${g}: duplicate id ${it.id}`); ids.add(it.id);
      ok(it.name && it.unlock && it.unlock.t, `${g}:${it.id} has name and unlock`);
      if (it.unlock.t === 'ach') ok(Core.ACHIEVEMENTS.some((a) => a.id === it.unlock.id), `${g}:${it.id} references real achievement ${it.unlock.id}`);
      if (it.unlock.t === 'beat') ok(Core.OPPONENTS.some((o) => o.id === it.unlock.id), `${g}:${it.id} references real opponent ${it.unlock.id}`);
      seen.add(g);
    }
  }
  ok(CAT.SKINS.length >= 40, 'at least 40 skin presets');
  ok(CAT.HAIR_STYLES.length >= 20, 'at least 20 hair styles');
  ok(CAT.GLASSES.length >= 12 && CAT.HATS.length >= 15, 'plenty of hats and glasses');
  ok(CAT.GLASSES.some((g) => g.id === 'pixel'), 'deal-with-it shades exist');
  for (const s of CAT.SKINS) ok(/^#[0-9a-f]{6}$/i.test(s.color), 'skin colour is hex: ' + s.id);
  ok(CAT.ACC_SLOTS.every((s) => CAT.ACCESSORIES.some((a) => a.slot === s && a.id === 'none_' + s)), 'every accessory slot has a none option');
  // every achievement id used by the catalog is earnable, every opponent is reachable
  ok(Core.ACHIEVEMENTS.length === 26, '26 achievements');
}

/* ---- time */
{
  eq(Core.clock(0), '06:00', '0 is 06:00'); eq(Core.clock(720), '18:00', '720 is 18:00'); eq(Core.clock(1080), '00:00', '1080 is midnight'); eq(Core.clock(1200), '02:00', '1200 is 02:00');
  eq(Core.dayName(1), 'Tuesday', 'day 1 is Tuesday'); eq(Core.dayName(6), 'Sunday', 'day 6 is Sunday'); eq(Core.dayName(7), 'Monday', 'day 7 is Monday');
  eq(Core.phase(60), 'day', '07:00 is day'); eq(Core.phase(690), 'dusk', '17:30 is dusk'); eq(Core.phase(900), 'night', '21:00 is night');
  ok(Core.nightness(0) === 0 && Core.nightness(900) === 1, 'nightness spans 0..1');
}

/* ---- new game / unlocks */
{
  let ch = Core.newChar();
  eq(ch.day, 1, 'starts day 1'); eq(ch.level, 1, 'starts level 1'); ok(ch.cash > 0, 'has start cash');
  ok(Core.isUnlocked(ch, 'hat', 'cap'), 'cap is free');
  ok(!Core.isUnlocked(ch, 'hat', 'crown'), 'crown is locked at start');
  ok(!Core.isUnlocked(ch, 'glasses', 'shades'), 'shades need the shop');
  ok(Core.isUnlocked(ch, 'hairStyle', 'bald'), 'bald is free');
  ok(!Core.isUnlocked(ch, 'hairStyle', 'mohawk'), 'mohawk needs level 4');
  ok(Core.unlockText(CAT.GLASSES.find((g) => g.id === 'shades').unlock).includes('$20'), 'shop unlock text shows price');
  // buying
  let r = Core.apply(ch, { t: 'buy', group: 'glasses', id: 'shades' }, rng);
  eq(r.char.cash, ch.cash - 20, 'shades cost $20'); ok(Core.isUnlocked(r.char, 'glasses', 'shades'), 'shades owned after buying');
  r = Core.apply(r.char, { t: 'buy', group: 'glasses', id: 'shades' }, rng);
  ok(r.fx.some((f) => f.t === 'toast'), 'buying twice is refused with a toast');
  ch = Core.newChar(); ch.cash = 5;
  r = Core.apply(ch, { t: 'buy', group: 'glasses', id: 'shades' }, rng);
  ok(!Core.isUnlocked(r.char, 'glasses', 'shades'), 'cannot buy without cash');
  // level unlock latches
  ch = Core.newChar(); r = Core.dev(ch, { k: 'level', v: 4 });
  ok(Core.isUnlocked(r.char, 'hairStyle', 'mohawk'), 'level 4 unlocks mohawk');
  ok(r.fx.some((f) => f.t === 'unlock' && f.id === 'mohawk'), 'unlock effect emitted');
  // sanitizing a hacked look strips locked items
  const hacked = Core.clone(CAT.DEFAULT_LOOK); hacked.hat.id = 'crown'; hacked.glasses.id = 'pixel';
  const clean = Core.sanitizeLook(Core.newChar(), hacked);
  eq(clean.hat.id, 'none', 'locked hat stripped'); eq(clean.glasses.id, 'none', 'locked glasses stripped');
  const all = Core.dev(Core.newChar(), { k: 'unlockAll' }).char;
  eq(Core.sanitizeLook(all, hacked).hat.id, 'crown', 'unlockAll lets everything through');
}

/* ---- eating, sleeping, the day loop */
{
  let ch = Core.newChar(); ch.hunger = 10;
  let r = Core.apply(ch, { t: 'eat', food: 'bowl' }, rng);
  ok(r.char.hunger > ch.hunger + 30, 'a burrito bowl fills you up'); eq(r.char.cash, ch.cash - 6, 'bowl costs $6');
  r = Core.apply(ch, { t: 'sleep' }, rng);
  ok(r.fx.some((f) => f.t === 'toast'), 'cannot sleep at 07:00');
  ch.minutes = 900;                                              // 21:00
  r = Core.apply(ch, { t: 'sleep' }, rng);
  eq(r.char.day, 2, 'sleeping advances the day'); eq(r.char.minutes, 60, 'wakes at 07:00'); eq(r.char.place, 'home', 'wakes at home');
  ok(r.fx.some((f) => f.t === 'morning'), 'a morning summary is emitted');
  // collapse at 02:00 uses the same pipeline and still rolls the day
  ch = Core.newChar(); ch.minutes = 1190; ch.energy = 100; ch.hunger = 90; ch.fans = 400; ch.cash = 100;
  r = Core.apply(ch, { t: 'wait', minutes: 20 }, rng);
  eq(r.char.day, 2, 'collapse rolls the day'); eq(r.char.n.collapses, 1, 'collapse is counted');
  ok(r.char.energy <= Math.round(r.char.maxEnergy * 0.6) + 1, 'collapse leaves you at 60% energy');
  ok(r.char.cash >= 100 + 10 - 1, 'streams still pay on collapse (400 fans -> $10)');
  // rent: day 5 (Saturday) -> sleep -> Sunday rent
  ch = Core.newChar(); ch.day = 5; ch.minutes = 1000; ch.cash = 200;
  r = Core.apply(ch, { t: 'sleep' }, rng);
  eq(Core.dayName(r.char.day), 'Sunday', 'woke into Sunday'); eq(r.char.cash, 140, 'rent $60 paid'); eq(r.char.n.rentPaid, 1, 'rent counted');
  ch = Core.newChar(); ch.day = 5; ch.minutes = 1000; ch.cash = 10;
  r = Core.apply(ch, { t: 'sleep' }, rng);
  ok(r.char.rentDebt > 0, 'unpaid rent becomes debt, no game over'); ok(r.char.mood < ch.mood + 4, 'late rent hurts mood');
  // week of sleeping never throws and never goes negative
  ch = Core.newChar();
  for (let i = 0; i < 60; i++) { ch.minutes = 1000; ch = Core.apply(ch, { t: 'sleep' }, rng).char; }
  ok(ch.cash >= 0 && ch.energy >= 0 && ch.hunger >= 0 && ch.mood >= 0, '60 nights never produce negative needs');
}

/* ---- gating */
{
  const ch = Core.newChar();
  ok(Core.canEnter(ch, 'park').ok, 'park open in the morning');
  ok(!Core.canEnter(ch, 'shop').ok, 'shop needs day 3'); ok(!Core.canEnter(ch, 'bar').ok, 'bar not open in the morning');
  ch.day = 3; ch.minutes = 400;                                  // 12:40, day 3 = Thursday
  ok(Core.canEnter(ch, 'shop').ok, 'shop opens on day 3');
  ch.minutes = 760;                                              // 18:40
  ok(Core.canEnter(ch, 'bar').ok, 'bar open Thursday evening'); ch.minutes = 900; ok(!Core.canEnter(ch, 'park').ok, 'park closed at night');
  ch.day = 7; ok(!Core.canEnter(ch, 'bar').ok, 'bar closed Mondays');
  eq(Core.barProgramme(2).id, 'openmic', 'Wednesday open mic'); eq(Core.barProgramme(4).id, 'showcase', 'Friday showcase'); eq(Core.barProgramme(5).id, 'battle', 'Saturday battle night'); eq(Core.barProgramme(6).id, 'karaoke', 'Sunday karaoke');
  const dev = Core.dev(ch, { k: 'noGates' }).char; ok(Core.canEnter(dev, 'bar').ok, 'dev noGates opens everything');
}

/* ---- rhythm */
{
  const a = Core.makeChart(123, { bars: 8, difficulty: 0.5 }), b = Core.makeChart(123, { bars: 8, difficulty: 0.5 });
  eq(a, b, 'charts are deterministic'); ok(a.length >= 20, 'a chart has a decent number of notes'); ok(a.every((n) => n.lane >= 0 && n.lane <= 3), 'lanes 0..3');
  ok(a.every((n, i) => i === 0 || n.beat > a[i - 1].beat), 'notes are strictly ordered in time');
  const easy = Core.makeChart(5, { bars: 16, difficulty: 0.1 }).length, hard = Core.makeChart(5, { bars: 16, difficulty: 0.9 }).length;
  ok(hard > easy * 1.4, 'harder charts are denser');
  const w = Core.windows({ mus: 3, tech: 3, ori: 3, show: 3 }), w2 = Core.windows({ mus: 80, tech: 3, ori: 3, show: 3 });
  ok(w2.perfect > w.perfect && w2.good > w.good, 'Musicality widens the hit windows');
  eq(Core.judgeHit(40, w), 'perfect', '40ms is perfect'); eq(Core.judgeHit(-120, w), 'good', '120ms early is good'); eq(Core.judgeHit(300, w), 'miss', '300ms is a miss');
  const hits = a.map((n) => ({ lane: n.lane, grade: 'perfect' })), s = Core.summarize(hits, a.length, a.length);
  eq(s.rank, 'S', 'all perfect is S'); near(s.accuracy, 1, 1e-9, 'accuracy 1'); const z = Core.summarize([], a.length, 0); eq(z.rank, 'D', 'nothing hit is D');
}

/* ---- performing and progression */
{
  let ch = Core.newChar(); ch.minutes = 300;
  const res = Core.summarize(Core.makeChart(1, { bars: 8 }).map((n) => ({ lane: n.lane, grade: 'perfect' })), 40, 40);
  const r = Core.apply(ch, { t: 'perform', kind: 'busk', res }, rng);
  ok(r.char.cash > ch.cash, 'busking pays'); ok(r.char.fans > 0, 'busking earns fans'); eq(r.char.n.busks, 1, 'busk counted');
  ok(r.char.ach.firstbusk, 'first busk achievement'); ok(Core.isUnlocked(r.char, 'top', 'bbhtee'), 'achievement unlocks the Heroes tee');
  ok(r.char.minutes > ch.minutes, 'busking takes time'); ok(r.char.energy < ch.energy, 'busking costs energy');
  // levels go up with enough xp
  let c2 = Core.newChar(); const fx = []; Core.gainXp(c2, 5000, fx); ok(c2.level > 5, 'lots of xp gives many levels'); ok(fx.some((f) => f.t === 'levelup'), 'levelup effect'); ok(c2.level <= Core.CFG.maxLevel, 'level cap');
  // training raises the stat with diminishing returns
  c2 = Core.newChar(); const r1 = Core.apply(c2, { t: 'train', stat: 'tech', q: 0.9 }, rng);
  ok(r1.char.stats.tech > c2.stats.tech, 'training raises the stat');
  c2.stats.tech = 90; const r2 = Core.apply(c2, { t: 'train', stat: 'tech', q: 0.9 }, rng);
  ok(r2.char.stats.tech - 90 < r1.char.stats.tech - 3, 'diminishing returns at high stat');
  c2 = Core.newChar(); c2.cash = 5; ok(Core.apply(c2, { t: 'train', stat: 'ori', q: 1, where: 'studio' }, rng).char.stats.ori === c2.stats.ori, 'studio needs cash');
}

/* ---- battles */
{
  const ch = Core.newChar(); ch.stats = { mus: 60, tech: 60, ori: 60, show: 60 };
  const tick = Core.OPPONENTS[0], vox = Core.OPPONENTS[6];
  const rounds = [{ q: 0.9 }, { q: 0.9 }, { q: 0.9 }];
  let wins = 0; for (let i = 0; i < 200; i++) if (Core.resolveBattle(ch, tick, rounds, BBH.rng(i)).win) wins++;
  ok(wins > 170, 'a strong player beats Lil Tick almost always (' + wins + '/200)');
  wins = 0; for (let i = 0; i < 200; i++) if (Core.resolveBattle(ch, vox, rounds, BBH.rng(i)).win) wins++;
  ok(wins < 130, 'Vox Prime is a real fight even at 0.9 accuracy (' + wins + '/200)');
  wins = 0; for (let i = 0; i < 200; i++) if (Core.resolveBattle(ch, tick, [{ q: 0.2 }, { q: 0.2 }, { q: 0.2 }], BBH.rng(i)).win) wins++;
  ok(wins < 20, 'a sloppy player loses to Tick (' + wins + '/200)');
  // win percentages climb with ladder tier
  const rates = Core.OPPONENTS.map((o) => { let w = 0; for (let i = 0; i < 300; i++) if (Core.resolveBattle(ch, o, [{ q: 0.8 }, { q: 0.8 }, { q: 0.8 }], BBH.rng(i + 99)).win) w++; return w; });
  ok(rates.every((v, i) => i === 0 || v <= rates[i - 1] + 25), 'win rate roughly falls along the ladder: ' + rates.join(','));
  const out = Core.resolveBattle(ch, tick, rounds, BBH.rng(1)); eq(out.votes.length, 5, 'five judges'); ok(out.forPlayer >= 0 && out.forPlayer <= 5, 'vote count sane');
  let c = Core.newChar(); c.minutes = 800; const r = Core.apply(c, { t: 'battle', opp: 'tick', rounds: [{ q: 1 }, { q: 1 }, { q: 1 }] }, BBH.rng(3));
  ok(r.char.beat.tick, 'beating Tick is recorded'); ok(r.fx.some((f) => f.t === 'battleResult'), 'battle result emitted'); ok(r.char.ach.firstbattle, 'first battle achievement'); ok(Core.isUnlocked(r.char, 'glasses', 'pixel'), 'deal with it shades unlocked by the first win');
  const fin = Core.apply(Core.newChar(), { t: 'battle', opp: Core.FINALS[2], final: 'wc3', rounds: [{ q: 1 }, { q: 1 }, { q: 1 }] }, BBH.rng(2));
  ok(fin.fx.some((f) => f.t === 'battleResult'), 'finals resolve');
}

/* ---- mingle / date */
{
  let ch = Core.newChar(); ch.minutes = 800;
  for (let i = 0; i < 5; i++) ch = Core.apply(ch, { t: 'mingle', who: 'mira' }, BBH.rng(i + 40)).char;
  ok(ch.affinity.mira >= 4, 'chatting builds affinity'); ch.cash = 100; ch.minutes = 800;
  const r = Core.apply(ch, { t: 'date', who: 'mira' }, rng); ok(r.char.n.dates === 1 && r.char.ach.firstdate, 'a date earns Heart Eyes'); ok(Core.isUnlocked(r.char, 'glasses', 'heart'), 'heart shades unlocked');
}

/* ---- saves */
{
  const mem = {}; const store = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; }, removeItem: (k) => { delete mem[k]; } };
  let ch = Core.newChar(); ch.cash = 123; ch.owned['hat:fedora'] = 1;
  ok(Core.Save.save(store, 2, ch), 'save succeeds'); const back = Core.Save.load(store, 2);
  eq(back.cash, 123, 'cash round-trips'); ok(back.owned['hat:fedora'], 'owned round-trips'); eq(Core.Save.list(store).map((x) => !!x), [false, true, false], 'slot list');
  mem['bbh:slot3'] = '{not json'; eq(Core.Save.load(store, 3), null, 'corrupt slot reads as empty');
  mem['bbh:slot1'] = JSON.stringify({ cash: 9, look: CAT.DEFAULT_LOOK }); const old = Core.Save.load(store, 1);
  eq(old.cash, 9, 'partial saves keep their data'); ok(old.n && old.stats && old.owned, 'partial saves are filled in by migrate');
  Core.Save.remove(store, 2); eq(Core.Save.load(store, 2), null, 'removed slot is empty');
  // scheduler: leading + trailing
  let t = 0, saves = [], timers = []; const sch = Core.Save.scheduler((v) => saves.push(v), 2000, () => t, (fn, ms) => { timers.push({ fn, at: t + ms }); return timers.length; }, () => { timers.length = 0; });
  sch.push(1); eq(saves, [1], 'first push saves immediately'); t = 500; sch.push(2); t = 900; sch.push(3); eq(saves, [1], 'pushes inside 2s are held');
  t = 2000; timers.forEach((x) => x.fn()); eq(saves, [1, 3], 'trailing save writes the latest value'); t = 2100; sch.push(4); sch.flush(); eq(saves, [1, 3, 4], 'flush writes pending immediately');
}

/* ---- dev */
{
  let ch = Core.newChar(); ch = Core.dev(ch, { k: 'day', v: 9 }).char; eq(ch.day, 9, 'dev day runs rollovers up to 9'); ok(ch.n.nights >= 8, 'rollovers really ran');
  ch = Core.dev(ch, { k: 'cash', v: 1000 }).char; ok(ch.cash >= 1000, 'dev cash'); ch = Core.dev(ch, { k: 'unlockAch' }).char; ok(Object.keys(ch.ach).length === Core.ACHIEVEMENTS.length, 'dev unlock all achievements');
  ch = Core.dev(ch, { k: 'level', v: 12 }).char; eq(ch.level, 12, 'dev level');
}

/* ---- cast: every NPC and opponent look uses real catalog ids */
{
  const chk = (look, who) => {
    if (!look) return;
    if (look.hair) ok(CAT.HAIR_STYLES.some((h) => h.id === look.hair.style), who + ' hair style exists: ' + look.hair.style);
    if (look.top) ok(CAT.TOPS.some((t) => t.id === look.top.id), who + ' top exists: ' + look.top.id);
    if (look.bottom) ok(CAT.BOTTOMS.some((t) => t.id === look.bottom.id), who + ' bottom exists: ' + look.bottom.id);
    if (look.shoes) ok(CAT.SHOES.some((t) => t.id === look.shoes.id), who + ' shoes exist: ' + look.shoes.id);
    if (look.hat) ok(CAT.HATS.some((t) => t.id === look.hat.id), who + ' hat exists: ' + look.hat.id);
    if (look.glasses) ok(CAT.GLASSES.some((t) => t.id === look.glasses.id), who + ' glasses exist: ' + look.glasses.id);
    if (look.facial) ok(CAT.FACIAL.some((t) => t.id === look.facial), who + ' facial exists: ' + look.facial);
    if (look.acc) for (const [s, v] of Object.entries(look.acc)) ok(CAT.ACCESSORIES.some((t) => t.id === v.id && t.slot === s), who + ' acc ' + s + ': ' + v.id);
  };
  for (const [k, n] of Object.entries(Core.NPCS)) chk(n.look, k);
  for (const o of Core.OPPONENTS.concat(Core.FINALS)) chk(o.look, o.id);
  eq(Core.OPPONENTS.length, 7, 'seven opponents');
}
/* ---- VHS Story ideas: style orders, odd jobs, tapes */
{
  eq(Core.STYLES.length, 4, 'four battle styles');
  ok(Core.STYLES.every((st) => Core.STYLE_BEATS[st.id] && Core.STYLES.some((x) => x.id === Core.STYLE_BEATS[st.id])), 'every style beats exactly one other');
  ok(Core.styleMul('boom', 'hats') > 1 && Core.styleMul('hats', 'boom') < 1 && Core.styleMul('boom', 'rim') === 1 && Core.styleMul(undefined, 'boom') === 1, 'style multipliers follow rock paper scissors');
  const ch = Core.newChar(); ch.stats = { mus: 40, tech: 40, ori: 40, show: 40 }; const opp = Core.OPPONENTS[2];
  let w1 = 0, w2 = 0;
  for (let i = 0; i < 300; i++) {
    const counter = Core.STYLE_BEATS.hats;                                                                       // hats beats this style, so it loses
    const good = Core.resolveBattle(ch, opp, [{ q: 0.6, style: 'boom' }, { q: 0.6, style: 'boom' }, { q: 0.6, style: 'boom' }], BBH.rng(i), ['hats', 'hats', 'hats']);
    const bad = Core.resolveBattle(ch, opp, [{ q: 0.6, style: counter }, { q: 0.6, style: counter }, { q: 0.6, style: counter }], BBH.rng(i), ['hats', 'hats', 'hats']);
    if (good.win) w1++; if (bad.win) w2++;
  }
  ok(w1 > w2, 'winning the style exchange wins more battles (' + w1 + ' vs ' + w2 + ')');
  ok(Core.OPPONENTS.every((o) => Array.isArray(o.fav) && o.fav.length >= 2), 'every opponent has favourite styles');
  const notes = Core.makeChart(5, { bars: 8, difficulty: 0.2 }), sc = Core.styleChart(notes, 'boom', 5);
  ok(sc.length === notes.length && sc.filter((n) => n.lane === 0).length > notes.filter((n) => n.lane === 0).length, 'a boom chart has more kicks');
  let c = Core.newChar(); c.minutes = 200;
  let r = Core.apply(c, { t: 'job', job: 'flyers' }, rng); ok(r.char.cash === c.cash + 14 && r.char.minutes > c.minutes && r.char.energy < c.energy, 'a job pays cash and costs time and energy');
  c.energy = 5; r = Core.apply(c, { t: 'job', job: 'dishes' }, rng); eq(r.char.cash, c.cash, 'too tired for a shift');
  c = Core.newChar(); r = Core.apply(c, { t: 'tape' }, rng); ok(r.char.mood > c.mood && r.char.stats.ori > c.stats.ori, 'a VHS tape lifts mood and Originality');
  r = Core.apply(r.char, { t: 'tape' }, rng); ok(r.fx.some((f) => f.t === 'toast'), 'only one tape a day');
}
/* ---- Beatbox Story features: run, tuner, sequencer, songs, crew, stream, coaching */
{
  let c = Core.newChar(); c.minutes = 200;
  let r = Core.apply(c, { t: 'run', q: 0.9, goodBars: 6 }, rng); ok(r.char.maxEnergy === c.maxEnergy + 2 && r.char.n.runs === 1 && r.char.minutes > c.minutes, 'a good run adds max energy (every 3 good bars)');
  r = Core.apply(c, { t: 'tune', q: 1 }, rng); ok(r.char.stats.mus > c.stats.mus, 'pitch tuner trains Musicality');
  const pat = Core.emptyPattern(0); pat.steps[0][0] = 1; pat.steps[0][8] = 1; pat.steps[2][4] = 1; pat.steps[1][3] = 1; pat.steps[1][7] = 1;
  ok(Core.patternHits(pat) === 5 && Core.patternScore(pat) > 0.3 && Core.patternScore(Core.emptyPattern(1)) === 0, 'pattern scoring');
  r = Core.apply(c, { t: 'seqsave', slot: 1, pattern: pat }, rng); eq(Core.patternHits(r.char.patterns[1]), 5, 'pattern saved in its slot');
  r = Core.apply(r.char, { t: 'seqtrain', score: Core.patternScore(pat) }, rng); ok(r.char.stats.ori > c.stats.ori, 'sequencer trains Originality');
  // songs: release, royalties over 7 days summing to 1.00, cap on active songs
  ok(Math.abs(Core.SONG_DECAY.reduce((a, b) => a + b, 0) - 1) < 1e-9, 'song decay sums to 1');
  let s = Core.apply(Core.apply(c, { t: 'seqsave', slot: 0, pattern: pat }, rng).char, { t: 'release', slot: 0, name: 'First Beat' }, rng).char;
  eq(s.songs.length, 1, 'song released'); ok(s.ach.firstsong, 'first song achievement');
  let fans0 = s.fans; for (let i = 0; i < 8; i++) { s.minutes = 1000; s = Core.apply(s, { t: 'sleep' }, rng).char; }
  ok(s.fans > fans0 + 5 && s.songs[0].lifetimeFans > 0, 'a song earns fans overnight');
  const earned = s.songs[0].lifetimeFans; for (let i = 0; i < 3; i++) { s.minutes = 1000; s = Core.apply(s, { t: 'sleep' }, rng).char; } eq(s.songs[0].lifetimeFans, earned, 'a song stops paying after 7 days');
  let q = Core.newChar(); q = Core.apply(Core.apply(q, { t: 'seqsave', slot: 0, pattern: pat }, rng).char, { t: 'release', slot: 0 }, rng).char;
  for (let i = 0; i < 4; i++) q = Core.apply(q, { t: 'release', slot: 0, name: 'S' + i }, rng).char; eq(q.songs.length, Core.MAX_ACTIVE_SONGS, 'only 3 songs can earn at once');
  const sparse = Core.apply(Core.newChar(), { t: 'release', slot: 3 }, rng); eq(sparse.char.songs.length, 0, 'a sparse pattern cannot be released');
  // crew
  let k = Core.newChar(); k.cash = 500; k.fans = 30; k = Core.apply(k, { t: 'recruit', id: 'jaxx' }, rng).char; eq(k.crew.length, 1, 'recruit Jaxx'); eq(k.cash, 420, 'Jaxx costs $80');
  const poor = Core.apply(Core.newChar(), { t: 'recruit', id: 'noor' }, rng); eq(poor.char.crew.length, 0, 'Noor needs fans and cash');
  const cash0 = k.cash; k.minutes = 1000; k = Core.apply(k, { t: 'sleep' }, rng).char; ok(k.cash >= cash0 + 6, 'crew pays daily');
  // stream
  let t = Core.newChar(); t.fans = 100; t.minutes = 300; r = Core.apply(t, { t: 'stream' }, BBH.rng(5)); ok(r.char.cash > t.cash && r.char.ach.streamer, 'streaming pays and earns Going Live');
  r = Core.apply(r.char, { t: 'stream' }, rng); ok(r.fx.some((f) => f.t === 'toast'), 'one stream a day'); ok(Core.apply(Core.newChar(), { t: 'stream' }, rng).char.n.streams === 0, 'streaming needs 20 fans');
  // coaching
  let cc = Core.newChar(); cc.cash = 200; cc.minutes = 300; cc = Core.apply(cc, { t: 'coach', stat: 'tech' }, rng); ok(cc.char.stats.tech >= 4 && cc.char.cash === 150 && cc.fx.some((f) => f.t === 'coachLine'), 'coaching: +1 skill, $50, story line');
  r = Core.apply(cc.char, { t: 'coach', stat: 'mus' }, rng); eq(r.char.stats.mus, cc.char.stats.mus, 'coaching has a 3 day cooldown');
  ok(Core.CREW.length === 5 && Core.COACH_LINES.length === 10, 'five crew, ten story lines');
}
/* ---- TRAINING_PLAN section 1: contract shapes */
{
  eq(Core.TRAIN, { mus: { game: 'ear', alt: 'tune' }, tech: { game: 'beat' }, ori: { game: 'make' }, show: { game: 'pose' } }, 'TRAIN map');
  const C = Core.TRAIN_CFG;
  ok(C.idleRatePerHour > 0 && C.idleMinStep === 15 && C.idleMaxMinutes === 240 && C.playMul === 2 && C.levelMax === 8, 'TRAIN_CFG constants');
  eq(C.playMinutes, { ear: 20, tune: 20, beat: 20, make: 25, pose: 20 }, 'play minutes');
  near(Core.levelMul(1), 1, 1e-9, 'levelMul(1)'); near(Core.levelMul(8), 1 + 0.18 * 7, 1e-9, 'levelMul(8)');
  ok([1, 2, 3, 4, 5, 6, 7, 8].every((l, i, a) => i === 0 || Core.levelMul(l) > Core.levelMul(a[i - 1])), 'higher levels give more');
  const ch = Core.newChar(); eq(ch.trainLv, { ear: 1, beat: 1, pose: 1, make: 1, tune: 1 }, 'new char trainLv');
  eq(ch.sounds, ['B', 't', 'K', 'Pf'], 'new char knows the four basic sounds');
  // ear levels
  eq(Core.EAR_LEVELS.length, 8, '8 ear levels');
  Core.EAR_LEVELS.forEach((L, i) => {
    ok(L.level === i + 1 && L.id && L.name && L.ask && L.rounds > 0 && L.choices.length >= 2, 'ear level shape ' + L.level);
    ok(L.lesson && L.lesson.title && L.lesson.text.length > 80 && L.lesson.examples.length >= 2, 'ear lesson has text and examples ' + L.level);
    ok(L.lesson.examples.every((e) => e.label && e.notes.length >= 2 && e.notes.every((n) => Number.isInteger(n) && n >= 40 && n <= 90)), 'ear examples are playable midi ' + L.level);
    const r = BBH.rng(100 + i), seenAns = new Set();
    for (let k = 0; k < 60; k++) { const qq = Core.earQuestion(L.level, r); ok(L.choices.includes(qq.answer) && qq.notes.length >= 2, 'ear question valid ' + L.level); seenAns.add(qq.answer); }
    eq(seenAns.size, L.choices.length, 'every answer of ear level ' + L.level + ' gets asked');
  });
  ok(Core.EAR_LEVELS.some((L) => L.lesson.examples.some((e) => e.chord)), 'some examples are chords');
  ok(/Saints/.test(Core.EAR_LEVELS[5].lesson.text), 'major third lesson names Oh When the Saints');
  // beat levels
  eq(Core.BEAT_LEVELS.length, 8, '8 beat levels');
  for (const L of Core.BEAT_LEVELS) {
    ok(L.name && L.bpm > 0 && L.tip && (L.steps === 8 || L.steps === 16) && L.lanes.length === L.steps && /^[BtKP.]+$/.test(L.lanes), 'beat level shape ' + L.level);
    ok(L.notes.length >= 4 && L.notes.every((n) => n.lane >= 0 && n.lane <= 3 && n.beat < 4), 'beat notes in one bar ' + L.level);
  }
  eq(Core.BEAT_LEVELS[0].say, 'B t K t', 'level 1 is boots and cats'); eq(Core.BEAT_LEVELS[3].lanes, 'B.tBK.t.', 'level 4 is boom bap'); eq(Core.BEAT_LEVELS[6].lanes, 'B.K..BK.', 'level 7 drum and bass'); eq(Core.BEAT_LEVELS[7].steps, 16, 'level 8 is 16 steps');
  // pose levels
  eq(Core.POSE_LEVELS.length, 8, '8 pose levels');
  Core.POSE_LEVELS.forEach((L, i) => ok(L.level === i + 1 && L.len >= 3 && L.len <= 8 && L.moves.length >= 2 && L.moves.every((m) => Core.POSE_MOVES.includes(m)) && L.bpm > 0, 'pose level shape ' + L.level));
  eq(Core.POSE_LEVELS[0].len, 3, 'pose starts at 3'); eq(Core.POSE_LEVELS[7].len, 8, 'pose ends at 8');
  ok(Core.POSE_LEVELS.every((L, i, a) => i === 0 || (L.len >= a[i - 1].len && L.bpm > a[i - 1].bpm)), 'pose gets longer and faster');
}
/* ---- idle gain: monotonic, diminishing; trainIdle ticks */
{
  const ch = Core.newChar();
  const g = [15, 30, 60, 120, 240].map((m) => Core.idleGain(ch, 'tech', m));
  ok(g.every((v, i) => i === 0 || v > g[i - 1]), 'idle gain grows with minutes: ' + g.map((v) => v.toFixed(2)).join(','));
  ok(g[4] / 240 < g[0] / 15, 'idle gain per minute shrinks in a long session');
  const lo = Core.idleGain({ stats: { tech: 5 } }, 'tech', 60), hi = Core.idleGain({ stats: { tech: 80 } }, 'tech', 60);
  ok(hi < lo && hi > 0, 'idle gain diminishes with the stat');
  between(lo, 0.6, 1.5, 'an hour of idle practice is about one point early on');
  ok(Core.idleGain(ch, 'tech', 60, 'studio') > Core.idleGain(ch, 'tech', 60) * 1.39, 'studio x1.4');
  let c = Core.newChar(); c.minutes = 200;
  let r = Core.apply(c, { t: 'trainIdle', stat: 'tech', minutes: 60 }, rng);
  const ticks = r.fx.filter((f) => f.t === 'trainTick');
  eq(ticks.length, 4, 'four ticks in an hour'); eq(ticks.map((t) => t.minute), [15, 30, 45, 60], 'tick minutes');
  ok(ticks.every((t) => t.stat === 'tech' && t.gain > 0), 'ticks carry stat and gain');
  eq(r.char.minutes, 260, 'idle hour costs an hour'); ok(r.char.energy < c.energy, 'idle drains energy'); ok(r.char.xp > c.xp, 'idle gives xp');
  near(r.char.stats.tech - c.stats.tech, Core.idleGain(c, 'tech', 60), 1e-6, 'idle action matches idleGain');
  r = Core.apply(c, { t: 'trainIdle', stat: 'mus', minutes: 50 }, rng); eq(r.char.minutes, 245, 'minutes round to 15 steps (50 -> 45)');
  r = Core.apply(c, { t: 'trainIdle', stat: 'mus', minutes: 999 }, rng); eq(r.char.minutes, 200 + 240, 'idle capped at 240 min');
  // stops at closing time (park closes 20:00 = minute 840)
  let p = Core.newChar(); p.place = 'park'; p.minutes = 780; r = Core.apply(p, { t: 'trainIdle', stat: 'show', minutes: 240 }, rng);
  ok(r.char.minutes <= 840 && r.char.day === 1, 'idle stops when the park closes');
  // never collapses
  p = Core.newChar(); p.minutes = 1150; r = Core.apply(p, { t: 'trainIdle', stat: 'show', minutes: 240 }, rng);
  eq(r.char.day, 1, 'idle never trains you into a collapse'); ok(r.char.minutes < Core.CFG.collapseAt, 'stops before 02:00');
  p = Core.newChar(); p.energy = 4; r = Core.apply(p, { t: 'trainIdle', stat: 'show', minutes: 240 }, rng);
  ok(r.fx.filter((f) => f.t === 'trainTick').length <= 1, 'idle stops when out of energy');
  // studio fee
  p = Core.newChar(); p.cash = 5; r = Core.apply(p, { t: 'trainIdle', stat: 'ori', minutes: 60, where: 'studio' }, rng); eq(r.char.stats.ori, p.stats.ori, 'studio idle needs the fee');
  p.cash = 100; r = Core.apply(p, { t: 'trainIdle', stat: 'ori', minutes: 60, where: 'studio' }, rng); eq(r.char.cash, 100 - Core.STUDIO_FEE, 'studio fee charged once');
}
/* ---- trainGame: about 2x for less time, level unlocks, cap */
{
  const c = Core.newChar(); c.minutes = 200;
  const idleHour = Core.apply(c, { t: 'trainIdle', stat: 'tech', minutes: 60 }, rng).char;
  const play = Core.apply(c, { t: 'trainGame', stat: 'tech', game: 'beat', level: 1, q: 1 }, rng);
  const dPlay = play.char.stats.tech - c.stats.tech, dIdle20 = Core.idleGain(c, 'tech', 20), dIdleHour = idleHour.stats.tech - c.stats.tech;
  between(dPlay / dIdle20, 1.9, 2.1, 'perfect play = 2x idle for the same minutes');
  ok(play.char.minutes - c.minutes === 20 && play.char.minutes - c.minutes < idleHour.minutes - c.minutes, 'play spends only 20 minutes');
  ok(dPlay / 20 > 1.9 * (dIdleHour / 60), 'per minute, playing well is about double idle');
  const sloppy = Core.apply(c, { t: 'trainGame', stat: 'tech', game: 'beat', level: 1, q: 0 }, rng).char.stats.tech - c.stats.tech;
  ok(sloppy > 0 && sloppy < dPlay * 0.45, 'a sloppy game still gives something but much less');
  ok(play.fx.some((f) => f.t === 'levelUp' && f.game === 'beat' && f.level === 2), 'q 1 unlocks level 2'); eq(play.char.trainLv.beat, 2, 'trainLv.beat is 2');
  let r = Core.apply(c, { t: 'trainGame', stat: 'tech', game: 'beat', level: 1, q: 0.69 }, rng); eq(r.char.trainLv.beat, 1, 'q 0.69 does not unlock');
  r = Core.apply(c, { t: 'trainGame', stat: 'tech', game: 'beat', level: 1, q: 0.7 }, rng); eq(r.char.trainLv.beat, 2, 'q 0.7 unlocks');
  r = Core.apply(c, { t: 'trainGame', stat: 'tech', game: 'beat', level: 5, q: 1 }, rng); eq(r.char.trainLv.beat, 2, 'cannot skip to a locked level');
  // higher level gives more
  let hi = Core.clone(c); hi.trainLv.ear = 8;
  const g1 = Core.apply(c, { t: 'trainGame', stat: 'mus', game: 'ear', level: 1, q: 0.8 }, rng).char.stats.mus - c.stats.mus;
  const g8 = Core.apply(hi, { t: 'trainGame', stat: 'mus', game: 'ear', level: 8, q: 0.8 }, rng).char.stats.mus - c.stats.mus;
  near(g8 / g1, Core.levelMul(8), 0.01, 'level 8 gives levelMul(8) more');
  // cap at 8
  let k = Core.newChar(); k.energy = 100;
  for (let i = 0; i < 12; i++) { k.minutes = 100; k.energy = 100; k = Core.apply(k, { t: 'trainGame', stat: 'show', game: 'pose', level: k.trainLv.pose, q: 1 }, rng).char; }
  eq(k.trainLv.pose, 8, 'pose levels cap at 8');
  r = Core.apply(k, { t: 'trainGame', stat: 'show', game: 'pose', level: 8, q: 1 }, rng); ok(!r.fx.some((f) => f.t === 'levelUp'), 'no levelUp past 8');
  // minutes override, tune/make counters, stat derived from game
  r = Core.apply(c, { t: 'trainGame', game: 'make', q: 0.5, minutes: 10 }, rng); eq(r.char.minutes - c.minutes, 10, 'a.minutes overrides time'); ok(r.char.stats.ori > c.stats.ori && r.char.n.seqs === 1, 'make trains Originality');
  r = Core.apply(c, { t: 'trainGame', stat: 'mus', game: 'tune', q: 0.5 }, rng); ok(r.char.n.tunes === 1 && r.char.stats.mus > c.stats.mus, 'tune game counts for Pitch Perfect');
  let t = Core.newChar(); t.energy = 1; r = Core.apply(t, { t: 'trainGame', stat: 'tech', game: 'beat', q: 1 }, rng); eq(r.char.stats.tech, t.stats.tech, 'too tired to play');
  // old actions untouched
  const o = Core.apply(c, { t: 'train', stat: 'tech', q: 0.5 }, rng); near(o.char.stats.tech - c.stats.tech, 1.3 * (1 - 3 / 120), 1e-9, 'old train gain unchanged'); eq(o.char.minutes - c.minutes, 60, 'old train 60 min');
}
/* ---- sounds: every unlock reachable, fx + toast */
{
  const ids = Core.SOUNDS.map((s) => s.id);
  eq(new Set(ids).size, ids.length, 'sound ids unique');
  for (const id of ['B', 't', 'K', 'Pf', 'LR', 'TB', 'IK', 'CR', 'ZP', 'SI', 'WB', 'RIM']) ok(ids.includes(id), 'sound exists: ' + id);
  ok(Core.SOUNDS.every((s) => s.name && s.blurb && ['start', 'level', 'npc', 'win', 'ach', 'day'].includes(s.unlock.k)), 'sound shapes');
  ok(Core.SOUNDS.every((s) => Core.soundUnlockText(s.unlock).length > 3), 'every sound has unlock text');
  const ch = Core.newChar();
  eq(Core.soundsFor(ch).map((s) => s.id), ['B', 't', 'K', 'Pf'], 'start set'); ok(!Core.soundUnlocked(ch, 'LR'), 'lip roll locked at start');
  const got = (r, id) => r.char.sounds.includes(id) && r.fx.some((f) => f.t === 'soundUnlocked' && f.id === id) && Core.soundUnlocked(r.char, id);
  // level rules through real level ups
  let r = Core.apply(ch, { t: 'trainIdle', stat: 'tech', minutes: 15 }, rng); ok(!r.fx.some((f) => f.t === 'soundUnlocked'), 'no unlock without progress');
  const lv = (n) => { const c = Core.newChar(); c.level = n - 1; c.xp = Core.xpNeed(n - 1) - 1; c.minutes = 200; return Core.apply(c, { t: 'trainGame', stat: 'tech', game: 'beat', q: 1 }, rng); };
  ok(got(lv(3), 'RIM'), 'level 3 unlocks rimshot'); ok(got(lv(4), 'LR'), 'level 4 unlocks lip roll'); ok(got(lv(6), 'IK'), 'level 6 unlocks inward K'); ok(got(lv(10), 'SI'), 'level 10 unlocks siren');
  r = lv(4); ok(r.fx.some((f) => f.t === 'toast' && f.text === 'New sound: Lip roll'), 'toast "New sound: Lip roll"');
  // BeeAmGee coaching
  let c = Core.newChar(); c.cash = 200; c.minutes = 300; r = Core.apply(c, { t: 'coach', stat: 'tech' }, rng); ok(got(r, 'LR'), 'coaching with BeeAmGee unlocks lip roll');
  c = Core.newChar(); r = Core.apply(c, { t: 'meet', who: 'beeamgee' }, rng); ok(got(r, 'LR'), 'meeting BeeAmGee unlocks lip roll');
  // wins
  c = Core.newChar(); c.minutes = 800; r = Core.apply(c, { t: 'battle', opp: 'tick', rounds: [{ q: 1 }, { q: 1 }, { q: 1 }] }, BBH.rng(3)); ok(got(r, 'TB'), 'beating Lil Tick unlocks throat bass');
  c = Core.clone(r.char); c.n.battlesWon = 2; c.minutes = 800; r = Core.apply(c, { t: 'battle', opp: 'tick', rounds: [{ q: 1 }, { q: 1 }, { q: 1 }] }, BBH.rng(3)); ok(got(r, 'ZP'), 'third battle win unlocks zipper');
  // Miro: meet or recruit
  c = Core.newChar(); r = Core.apply(c, { t: 'meet', who: 'miro' }, rng); ok(got(r, 'WB'), 'meeting Miro unlocks water drop');
  c = Core.newChar(); c.cash = 2000; c.fans = 1300; r = Core.apply(c, { t: 'recruit', id: 'miro' }, rng); ok(got(r, 'WB'), 'recruiting Miro unlocks water drop');
  // Sound Lab from day 4
  c = Core.newChar(); c.day = 4; c.minutes = 300; r = Core.apply(c, { t: 'travel', to: 'studio' }, rng); ok(got(r, 'CR'), 'Sound Lab on day 4 unlocks click roll');
  c = Core.newChar(); c.day = 3; c.minutes = 300; r = Core.apply(c, { t: 'travel', to: 'studio' }, rng); ok(!r.char.sounds.includes('CR'), 'not on day 3');
  // achievement
  c = Core.newChar(); c.n.tunes = 4; c.minutes = 200; r = Core.apply(c, { t: 'tune', q: 1 }, rng); ok(got(r, 'HUM'), 'Pitch Perfect unlocks hum bass');
  // every rule reachable by some route above or by dev: brute force check that a maxed char has them all
  let m = Core.newChar(); m = Core.dev(m, { k: 'level', v: 12 }).char; m = Core.dev(m, { k: 'beatAll' }).char; m = Core.dev(m, { k: 'unlockAch' }).char;
  m.n.battlesWon = 9; m.seen = { miro: 1, beeamgee: 1 }; m.day = 5; m.place = 'studio'; m = Core.apply(m, { t: 'wait', minutes: 15 }, rng).char;
  ok(Core.SOUNDS.every((s) => m.sounds.includes(s.id)), 'every SOUNDS unlock is reachable: ' + m.sounds.join(','));
  ok(Core.soundUnlocked(Core.dev(Core.newChar(), { k: 'unlockAll' }).char, 'SI'), 'dev unlockAll opens every sound');
  // latched: leaving the studio keeps the click roll
  c = Core.newChar(); c.day = 4; c.minutes = 300; r = Core.apply(c, { t: 'travel', to: 'studio' }, rng); r = Core.apply(r.char, { t: 'travel', to: 'home' }, rng); ok(r.char.sounds.includes('CR'), 'sounds never re-lock');
}
/* ---- migration of old saves */
{
  const mem = {}; const store = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; }, removeItem: (k) => { delete mem[k]; } };
  const old = Core.newChar(); delete old.trainLv; delete old.sounds; old.level = 5; old.beat = { tick: 2 };
  mem['bbh:slot1'] = JSON.stringify(old); const back = Core.Save.load(store, 1);
  eq(back.trainLv, { ear: 1, beat: 1, pose: 1, make: 1, tune: 1 }, 'old save gets default trainLv');
  ok(['B', 't', 'K', 'Pf', 'RIM', 'LR', 'TB'].every((id) => back.sounds.includes(id)), 'old save gets start sounds plus what it already earned');
  mem['bbh:slot2'] = JSON.stringify(Object.assign(Core.newChar(), { trainLv: { ear: 3, beat: 99 }, sounds: ['B', 'bogus', 'SI'] }));
  const b2 = Core.Save.load(store, 2);
  ok(b2.trainLv.ear === 3 && b2.trainLv.beat === 8 && b2.trainLv.pose === 1, 'trainLv merged and clamped'); ok(!b2.sounds.includes('bogus') && b2.sounds.includes('SI') && b2.sounds.includes('K'), 'sounds cleaned');
  const r = Core.apply(back, { t: 'trainGame', stat: 'tech', game: 'beat', q: 1 }, rng); eq(r.char.trainLv.beat, 2, 'migrated save trains and levels');
  ok(Core.apply(back, { t: 'seqtrain', score: 0.5 }, rng).char.stats.ori > back.stats.ori, 'old seqtrain still works on a migrated save');
}
/* ---- story (STORY_PLAN.md, from Beatbox Story): the park jam and BeeAmGee noticing you */
{
  const fr = () => 0.42, res = (acc) => ({ accuracy: acc, perfect: 10, good: 2, miss: 1, total: 13, bestCombo: 8, perfectLane: [1, 1, 1, 1], rank: 'B', score: 100 });
  const at = (day, hour, patch) => { const c = Core.newChar(); c.day = day; c.minutes = hour * 60 - 360; return Object.assign(c, patch || {}); };
  const stories = (fx) => fx.filter((f) => f.t === 'story').map((f) => f.id);
  const EM = String.fromCharCode(8212), allText = JSON.stringify([Core.STORY, Core.STORY_TIPS, Core.JAM_WHEN]);
  ok(allText.indexOf(EM) < 0, 'story text has no em dash');
  // BeeAmGee is not in the park at the start
  let c = Core.newChar();
  ok(c.flags.story === 1 && !c.flags.bmgMet && !c.flags.bmgSighted && c.n.jams === 0, 'a new hero has the story flag, has not met BeeAmGee and has no jams');
  ok(!Core.bmgHere(c) && !Core.bmgDue(c) && Core.storyArrive(c, 'park') === null, 'BeeAmGee is not in the park at the start');
  ok(!Core.metNpc(c, 'beeamgee') && !c.sounds.includes('LR'), 'and he does not count as met (no lip roll)');
  // the jam schedule: every afternoon 12:00 to 18:00, from day 2
  ok(!Core.jamOn(at(1, 14)), 'no jam on day 1'); ok(!Core.jamOn(at(2, 11.9)) && Core.jamOn(at(2, 12)) && Core.jamOn(at(2, 17.9)) && !Core.jamOn(at(2, 18)), 'day 2: the jam runs 12:00 to 18:00');
  ok([3, 4, 5, 6, 7, 8].every((d) => Core.jamOn(at(d, 15))), 'the jam meets every afternoon of the week');
  ok(/12:00 to 18:00/.test(Core.JAM_WHEN), 'JAM_WHEN says when: ' + Core.JAM_WHEN);
  // the start is announced: a toast when the clock crosses 12:00
  let r = Core.apply(at(2, 11.5), { t: 'wait', minutes: 60 }, fr);
  ok(r.fx.some((f) => f.t === 'toast' && /JAM has started in the PARK/.test(f.text)) && r.fx.some((f) => f.t === 'jamStart'), 'crossing 12:00 on day 2 toasts the jam start');
  ok(!Core.apply(at(1, 11.5), { t: 'wait', minutes: 60 }, fr).fx.some((f) => f.t === 'jamStart'), 'no jam toast on day 1');
  ok(!Core.apply(at(2, 13), { t: 'wait', minutes: 60 }, fr).fx.some((f) => f.t === 'jamStart'), 'no second toast while it runs');
  // the morning of a day without a jam yet mentions it
  r = Core.apply(at(1, 21), { t: 'sleep' }, fr); ok(r.fx.find((f) => f.t === 'morning').lines.some((l) => /jam in the park/.test(l)), 'the day 2 morning card mentions the jam in the park');
  // Foxy points you there (Beatbox Story FOXY_TIPS)
  ok(/jam/i.test(Core.storyTip(at(2, 9), 'foxy', 0)) && Core.storyTip(at(1, 9), 'foxy', 0) === null && Core.storyTip(at(2, 9), 'rohzel', 0) === null, 'Foxy nudges you to the jam from day 2');
  // joining the jam: rewards, the counter and a random skill up
  c = at(2, 14); const st0 = Object.assign({}, c.stats); r = Core.apply(c, { t: 'perform', kind: 'jam', res: res(0.85) }, fr);
  const rw = r.fx.find((f) => f.t === 'result').rw;
  ok(r.char.n.jams === 1 && r.char.flags.jamDay === 2, 'a jam counts (n.jams, flags.jamDay)');
  ok(rw.fans > 0 && rw.xp >= 10 && rw.cash === 0 && rw.minutes === Core.JAM.minutes, 'jam rewards: fans and xp, no cash, ' + Core.JAM.minutes + ' min');
  ok(r.char.fans === rw.fans && r.char.minutes === c.minutes + Core.JAM.minutes, 'rewards land on the save');
  ok(['mus', 'tech', 'ori'].some((s) => r.char.stats[s] - st0[s] >= 0.5) && r.fx.some((f) => f.t === 'toast' && /cypher taught you/.test(f.text)), 'the cypher raises a random skill');
  ok(Core.reward('jam', { accuracy: 1 }, c).fans > Core.reward('jam', { accuracy: 0.2 }, c).fans, 'a cleaner round earns more fans');
  // first jam beat, then the sighting at the 2nd jam (not the same day meeting)
  eq(stories(r.fx), ['firstJam'], 'the first jam plays the first-jam beat');
  ok(Core.STORY.firstJam.some((l) => /circle/.test(l.text)), 'first-jam text is the Beatbox Story one, adapted');
  r = Core.apply(r.char, { t: 'perform', kind: 'jam', res: res(0.7) }, fr);
  eq(stories(r.fx), ['sightJam'], 'the second jam: someone watches from the back of the cypher');
  ok(r.char.flags.bmgSighted === 2 && r.char.flags.bmgVia === 'jam', 'the sighting is stored (day, via the jam)');
  ok(!Core.bmgHere(r.char) && !Core.bmgDue(r.char) && Core.storyArrive(r.char, 'park') === null, 'he is gone again for the rest of that day');
  // the next day he is on his bench: the first park visit is the meeting
  c = Core.clone(r.char); c.day = 3; c.minutes = 120;
  ok(Core.bmgDue(c) && Core.bmgHere(c) && Core.storyArrive(c, 'park') === 'bmgMeet' && Core.storyArrive(c, 'bar') === null, 'next day: BeeAmGee waits on his bench in the park');
  r = Core.apply(c, { t: 'story', k: 'bmgMeet' }, fr);
  eq(stories(r.fx), ['meet'], 'the meeting plays'); ok(r.fx.find((f) => f.t === 'story').lines.every((l) => l.who === 'beeamgee') && /cypher/.test(r.fx.find((f) => f.t === 'story').lines[0].text), 'BeeAmGee speaks, and he saw you in the cypher');
  ok(r.char.flags.bmgMet === 3 && r.char.seen.beeamgee === 3 && Core.metNpc(r.char, 'beeamgee'), 'first-meeting flag and seen.beeamgee are set');
  ok(r.char.sounds.includes('LR') && r.fx.some((f) => f.t === 'soundUnlocked' && f.id === 'LR'), 'meeting him unlocks the lip roll');
  ok(Core.bmgHere(r.char) && !Core.bmgDue(r.char) && Core.storyArrive(r.char, 'park') === null, 'after the meeting he stays on his bench, no second meeting');
  c = Core.clone(r.char); c.day = 9; ok(Core.bmgHere(c), 'and he is still there on later days');
  eq(stories(Core.apply(Core.newChar(), { t: 'story', k: 'bmgMeet' }, fr).fx), [], 'no meeting without the sighting');
  // the busk route: he also notices you after 4 busks from day 3, and then says so
  c = at(3, 10); c.n.busks = 3; r = Core.apply(c, { t: 'perform', kind: 'busk', res: res(0.8) }, fr);
  eq(stories(r.fx), ['sightBusk'], 'the 4th busk on day 3 is a sighting too'); ok(r.char.flags.bmgVia === 'busk', 'via busk');
  c = Core.clone(r.char); c.day = 4; r = Core.apply(c, { t: 'story', k: 'bmgMeet' }, fr); ok(/busking/.test(r.fx.find((f) => f.t === 'story').lines[0].text), 'then he saw you busking');
  c = at(2, 10); c.n.busks = 3; eq(stories(Core.apply(c, { t: 'perform', kind: 'busk', res: res(0.8) }, fr).fx), [], 'busks on day 2 do not trigger it');
  // a battle win plus a jam is enough (Beatbox Story: after the first battle win)
  c = at(4, 14); c.n.jams = 1; c.n.battlesWon = 1; eq(stories(Core.apply(c, { t: 'perform', kind: 'jam', res: res(0.8) }, fr).fx), ['sightJam'], 'a battle winner is noticed at the next jam');
  // later jam beats: Pig Pen crashes the cypher at 3 jams, a famous beatboxer at 5 jams and 30 fans; one beat per jam
  c = at(5, 14); c.n.jams = 2; c.flags.bmgSighted = 3; r = Core.apply(c, { t: 'perform', kind: 'jam', res: res(0.8) }, fr); eq(stories(r.fx), ['pigpen'], 'the 3rd jam: Pig Pen crashes the cypher');
  ok(r.fx.find((f) => f.t === 'story').lines.some((l) => l.who === 'pigpen'), 'Pig Pen speaks');
  ok(/loud guy/.test(Core.storyTip(r.char, 'foxy', 0)) && /Pig Pen/.test(Core.storyTip(r.char, 'foxy', 1)), 'Foxy heard about the loud guy');
  c = Core.clone(r.char); c.n.jams = 4; c.fans = 40; eq(stories(Core.apply(c, { t: 'perform', kind: 'jam', res: res(0.8) }, fr).fx), ['famous'], 'the 5th jam with 30+ fans: a famous beatboxer drops in');
  c.fans = 0; eq(stories(Core.apply(c, { t: 'perform', kind: 'jam', res: res(0.8) }, fr).fx), [], 'not without the fans');
  // just listening: no mini game, only while the jam is on
  r = Core.apply(at(2, 14), { t: 'jamWatch' }, fr); ok(r.char.mood > at(2, 14).mood && r.char.minutes === at(2, 14).minutes + 30, 'JUST LISTEN: mood up, 30 min');
  r = Core.apply(at(2, 19), { t: 'jamWatch' }, fr); ok(r.char.minutes === at(2, 19).minutes && r.fx.some((f) => f.t === 'toast' && f.kind === 'warn'), 'no jam to listen to after 18:00');
  // old saves (no flags.story) that already met BeeAmGee on the old always-there bench keep him; fresh old saves do not get him for free
  const legacy = (patch) => { const o = JSON.parse(JSON.stringify(Core.newChar())); delete o.flags.story; return Core.migrate(Object.assign(o, patch)); };
  let m = legacy({ day: 6, flags: { intro: 1, visited_park: 1 } });
  ok(m.flags.story === 1 && m.flags.bmgMet === 6 && Core.bmgHere(m) && !Core.bmgDue(m), 'old save that visited the park: BeeAmGee stays met and on his bench');
  ok(Core.bmgHere(legacy({ seen: { beeamgee: 2 } })) && Core.bmgHere(legacy({ flags: { coachDay: 3 } })) && Core.bmgHere(legacy({ flags: { proCoachDay: 3 } })) && Core.bmgHere(legacy({ n: Object.assign(Core.newChar().n, { coaches: 2 }) })), 'old saves with a lesson, coaching or seen.beeamgee keep him too');
  m = legacy({ flags: { intro: 1 } }); ok(m.flags.story === 1 && !Core.bmgHere(m), 'an old save that never went to the park meets him the story way');
  ok(m.n.jams === 0, 'old saves get n.jams = 0');
  const mem = {}; const store = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; }, removeItem: (k) => { delete mem[k]; } };
  c = Core.newChar(); c.flags.visited_park = 1; Core.Save.save(store, 3, c); ok(!Core.bmgHere(Core.Save.load(store, 3)), 'a new save that visited the park does not get BeeAmGee on reload (flags.story guards the migration)');
}
done();
