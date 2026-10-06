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
  ok(Core.ACHIEVEMENTS.length === 20, '20 achievements');
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
  ch = Core.dev(ch, { k: 'cash', v: 1000 }).char; ok(ch.cash >= 1000, 'dev cash'); ch = Core.dev(ch, { k: 'unlockAch' }).char; ok(Object.keys(ch.ach).length === 20, 'dev unlock all achievements');
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
done();
