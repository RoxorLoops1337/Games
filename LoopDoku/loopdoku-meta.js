/* =====================================================================================================================
   LOOPDOKU META  (load after loopdoku-core.js and loopdoku-levels.js; shared by every skin page)
   Progress, points, level packs, skins and their unlocks, the Daily Jam, settings, and the support screen, plus a small
   themable overlay UI (levels, skin shop, support, settings) so every skin gets the same menus in its own colours.

   LD.meta
     .state                      the save (localStorage 'loopdoku_save_v1'; survives without storage, just not between visits)
     .packs()                    [{id, name, unlocked, need, solved, total, levels: [{id, num, n, unlocked, solved, stars, bestMs}]}]
     .level(id)                  a playable puzzle object: {id, pack, packName, num, n, rows, sol, region, city, venue, country, diff}
     .currentId() / .setCurrent(id)
     .newGame(id?, opts?)        new LD.Game for that level (default: the current one), with the player's assist settings applied
     .nextId(id)                 the level after id (null at the very end)
     .recordWin(id, winEvent)    -> {points, base, starBonus, firstClear, daily, total, nextId, support, affordable: [skins],
                                    streak, streakBonus, dayStreak, dayBonus, goal {count, target, hit, bonus}, packUnlocked, nextLook, tease, cheer}
     .recordLoss()               -> {streakLost, cheer, nextLook}
     .today()  .nextLook()  .tease()
     .daily()                    -> {id, puzzle, done}  today's Daily Jam (double points the first time)
     .points()                   current points
     .skins()                    [{id, name, artist, file, cost, unlocked, current}]   .skin() current id
     .buySkin(id)                -> {ok, reason}      .useSkin(id) saves and opens that skin's page
     .settings()                 {sound, music, assist}  .set(key, value)
     .supportDue()               true when it is time to show the support screen (call after a win)
   LD.ui (overlays; theme them with CSS variables on :root, see THEME below)
     .levels({onPlay(id)})  .skins()  .support()  .settings({onChange})  .confirm(text, yesLabel, onYes)  .toast(text)  .close()
     .winExtras(r)  .loseExtras(lossResult)  .titleExtras()   -> a card with the duo's cheer, streaks, the daily set and the next-look bar
     .isOpen()
   THEME (set on :root in your skin; all optional)
     --ld-font --ld-font-display --ld-ink --ld-muted --ld-panel --ld-panel-2 --ld-backdrop --ld-accent --ld-accent-ink
     --ld-accent-2 --ld-accent-2-ink --ld-line (border, e.g. 3px solid #111) --ld-radius --ld-shadow --ld-lock
   ===================================================================================================================== */
(function () {
  'use strict';
  const LD = window.LD;
  if (!LD || !LD.Game) { console.error('loopdoku-meta: load loopdoku-core.js first'); return; }

  // ---------------------------------------------------------------------------------------------------------------
  // CONFIG: links and numbers the owners may want to change
  // ---------------------------------------------------------------------------------------------------------------
  const CONFIG = (LD.CONFIG = {
    links: {
      instagram: 'https://www.instagram.com/roxorloopsandjasmin',
      tiktok: 'https://www.tiktok.com/@roxorloopsandjasmin',
      youtube: 'https://www.youtube.com/@RoxorLoops',
      facebook: 'https://web.facebook.com/RoxorLoopsAndJasmin/',
      website: 'https://roxorloopsandjasmin.com',
      shop: 'https://roxorloopsandjasmin.com/shop/',
      patreon: '',   // e.g. 'https://www.patreon.com/yourpage'  (the button appears once this is filled in)
      tip: '',       // e.g. a PayPal.me, MobilePay box or Ko-fi link  (the button appears once this is filled in)
    },
    supportAfterWins: 3,   // first support screen after this many wins
    supportEvery: 4,       // then every this many wins
    points: { easy: 15, normal: 30, chill: 40, hard: 60, expert: 100, terror: 150, extreme: 200, melt: 300, nightmare: 350 },
    dailyGoal: 3, dailyGoalBonus: 50,   // win this many gigs in a day for a bonus
    streakStep: 0.1, streakMax: 0.5,     // +10% per win in a row after the first, up to +50%
    dayStreakPoints: 10, dayStreakMax: 10, // first win of a day: +10 per day in a row, up to +100
    replayShare: 0.2,      // replaying a solved level pays this share
    packNeeds: { normal: ['easy', 3], chill: ['normal', 3], hard: ['normal', 5], expert: ['hard', 5], terror: ['hard', 8], extreme: ['expert', 5], melt: ['terror', 5], nightmare: ['extreme', 5] },
    openAhead: 3,          // inside a pack, this many unsolved levels are open at once
  });
  const SKINS = (LD.SKINS = [
    { id: 'neon', name: 'Neon Club Night', artist: 'DJ Lumen', file: 'neon.html', cost: 0 },
    { id: 'idol', name: 'Anime Idol Stage', artist: 'Kira Cel', file: 'idol.html', cost: 0 },
    { id: 'comic', name: 'Comic Pop-Art', artist: 'Kapow Kenji', file: 'comic.html', cost: 300 },
    { id: 'sticker', name: 'Stickerbomb', artist: 'Pia Peel', file: 'sticker.html', cost: 450 },
    { id: 'paper', name: 'Paper Craft', artist: 'Scissors Sol', file: 'paper.html', cost: 600 },
    { id: 'studio', name: 'Studio Gear', artist: 'Analog Ana', file: 'studio.html', cost: 800 },
    { id: 'riso', name: 'Riso Gig Poster', artist: 'Xerox Rex', file: 'riso.html', cost: 1000 },
    { id: 'jelly', name: 'Jelly Candy', artist: 'Gummi Gus', file: 'jelly.html', cost: 1200 },
    { id: 'watercolour', name: 'Watercolour Storybook', artist: 'Wren Wash', file: 'watercolour.html', cost: 1500 },
    { id: 'pixel', name: '16-bit Arcade', artist: 'Bitcrush Benny', file: 'pixel.html', cost: 1800 },
  ]);
  const FREE = SKINS.filter((k) => !k.cost).map((k) => k.id);
  // gig names for levels: cities the duo play, and the kinds of gigs they do
  const CITIES = [
    ['Copenhagen', 'DK'], ['Aarhus', 'DK'], ['Odense', 'DK'], ['Aalborg', 'DK'], ['Esbjerg', 'DK'], ['Roskilde', 'DK'], ['Vejle', 'DK'],
    ['Berlin', 'DE'], ['Hamburg', 'DE'], ['Cologne', 'DE'], ['Brussels', 'BE'], ['Antwerp', 'BE'], ['Ghent', 'BE'], ['Paris', 'FR'],
    ['Lyon', 'FR'], ['Stockholm', 'SE'], ['Malmö', 'SE'], ['Gothenburg', 'SE'], ['Amsterdam', 'NL'], ['Rotterdam', 'NL'], ['Utrecht', 'NL'],
    ['Athens', 'GR'], ['Thessaloniki', 'GR'], ['Quito', 'EC'], ['Guayaquil', 'EC'],
  ];
  const VENUES = ['Harbour Stage', 'Confirmation Party', 'Wedding Reception', 'Club Night', 'Street Festival', 'Canal Boat Gig', 'Rooftop Session',
    'Corporate Gala', 'Open-Air Theatre', 'School Workshop', 'Town Square', 'Beach Party', 'Summer Festival', 'Christmas Party', 'Birthday Bash',
    'Jazz Café', 'Library Late', 'Garden Party', 'Beatbox Battle', 'Theatre Matinee'];

  // ---------------------------------------------------------------------------------------------------------------
  // LEVELS
  // ---------------------------------------------------------------------------------------------------------------
  const RAW = window.LD_LEVELS || { plan: [], packs: {} };
  const PACKS = RAW.plan.map((p, pk) => ({ id: p.id, name: p.name, levels: (RAW.packs[p.id] || []).map((q, k) => ({ q, id: p.id + '-' + (k + 1), num: k + 1, pk })) }));
  const BY_ID = new Map();
  let gigNo = 0;
  for (const pack of PACKS) for (const L of pack.levels) {
    const ci = CITIES[(gigNo * 7) % CITIES.length], ve = VENUES[(gigNo * 3 + L.pk) % VENUES.length];
    gigNo++;
    BY_ID.set(L.id, Object.assign(L, { city: ci[0], country: ci[1], venue: ve, pack: pack.id, packName: pack.name }));
  }
  function puzzleOf(L, extra) {
    return LD.makePuzzle(L.q, Object.assign({ id: L.id, pack: L.pack, packName: L.packName, num: L.num, city: L.city, venue: L.venue, country: L.country, diff: L.packName }, extra || {}));
  }

  // ---------------------------------------------------------------------------------------------------------------
  // SAVE
  // ---------------------------------------------------------------------------------------------------------------
  const KEY = 'loopdoku_save_v1';
  const fresh = () => ({ v: 1, points: 0, earned: 0, wins: 0, losses: 0, solved: {}, current: null, skin: 'neon', unlocked: FREE.slice(),
    supportLast: 0, daily: {}, streak: 0, bestStreak: 0, dayStreak: 0, lastDay: '', dayWins: {}, settings: { sound: true, music: true, assist: false } });
  let S = fresh();
  try { const raw = localStorage.getItem(KEY); if (raw) S = Object.assign(fresh(), JSON.parse(raw)); } catch (_) { /* no storage: play without saving */ }
  S.settings = Object.assign(fresh().settings, S.settings || {});
  for (const id of FREE) if (!S.unlocked.includes(id)) S.unlocked.push(id);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) { /* ignore */ } };
  const yesterday = () => { const d = new Date(Date.now() - 864e5); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  // the page's skin name: hosts may drop the .html (Cloudflare Pages serves /LoopDoku/neon for neon.html)
  const pageName = () => decodeURIComponent((location.pathname || '').split('/').pop() || '').replace(/.html$/, '');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  function packInfo(pack) {
    const solvedCount = pack.levels.filter((L) => S.solved[L.id]).length;
    const need = CONFIG.packNeeds[pack.id];
    let unlocked = true;
    if (need) { const other = PACKS.find((p) => p.id === need[0]); unlocked = !!other && other.levels.filter((L) => S.solved[L.id]).length >= need[1]; }
    let openLeft = CONFIG.openAhead;
    const levels = pack.levels.map((L) => {
      const s = S.solved[L.id];
      let open = unlocked && (!!s || openLeft > 0);
      if (unlocked && !s && openLeft > 0) openLeft--;
      return { id: L.id, num: L.num, n: L.q.n, unlocked: open, solved: !!s, stars: s ? s.stars : 0, bestMs: s ? s.bestMs : 0, city: L.city, venue: L.venue };
    });
    return { id: pack.id, name: pack.name, unlocked, need: need ? { pack: need[0], count: need[1], name: (PACKS.find((p) => p.id === need[0]) || {}).name } : null, solved: solvedCount, total: pack.levels.length, levels };
  }

  const meta = (LD.meta = {
    get state() { return S; },
    config: CONFIG,
    save,
    packs: () => PACKS.map(packInfo),
    level(id) {
      if (id && id.startsWith('daily-')) return meta.daily().puzzle;
      const L = BY_ID.get(id) || PACKS[0].levels[0];
      return puzzleOf(L);
    },
    currentId() {
      if (S.current && (BY_ID.has(S.current) || S.current.startsWith('daily-'))) return S.current;
      for (const p of meta.packs()) for (const L of p.levels) if (L.unlocked && !L.solved) return L.id;
      return PACKS[0].levels[0].id;
    },
    setCurrent(id) { S.current = id; save(); },
    newGame(id, opts) {
      id = id || meta.currentId();
      meta.setCurrent(id);
      return new LD.Game(meta.level(id), Object.assign({ autoCross: !!S.settings.assist }, opts || {}));
    },
    nextId(id) {
      const L = BY_ID.get(id);
      if (!L) return meta.currentId();
      const pack = PACKS[L.pk];
      if (L.num < pack.levels.length) return pack.levels[L.num].id;
      const nextPack = PACKS[L.pk + 1];
      if (nextPack && packInfo(nextPack).unlocked) return nextPack.levels[0].id;
      return null;
    },
    recordWin(id, e) {
      e = e || {};
      const isDaily = id.startsWith('daily-');
      const L = BY_ID.get(id);
      const packId = isDaily ? meta.daily().pack : (L ? L.pack : 'easy');
      const prev = S.solved[id];
      const base = CONFIG.points[packId] || 20;
      const stars = e.stars || 1;
      const starBonus = Math.round(base * (stars === 3 ? 0.5 : stars === 2 ? 0.2 : 0));
      let points = base + starBonus;
      if (prev) points = Math.max(1, Math.round(points * CONFIG.replayShare));
      let daily = false;
      if (isDaily && !S.daily[today()]) { points *= 2; daily = true; S.daily[today()] = true; }
      const before = S.points;
      const packsBefore = meta.packs().filter((p) => p.unlocked).map((p) => p.id);
      // win streak: +10% per win in a row after the first
      S.streak = (S.streak || 0) + 1; S.bestStreak = Math.max(S.bestStreak || 0, S.streak);
      const streakBonus = Math.round(points * Math.min(CONFIG.streakMax, CONFIG.streakStep * (S.streak - 1)));
      // day streak: the first win of a day pays more the more days in a row you played
      const d = today(), firstToday = !S.dayWins[d];
      let dayBonus = 0;
      if (firstToday) {
        S.dayStreak = S.lastDay === yesterday() ? (S.dayStreak || 0) + 1 : 1;
        S.lastDay = d;
        dayBonus = CONFIG.dayStreakPoints * Math.min(CONFIG.dayStreakMax, S.dayStreak);
        for (const k of Object.keys(S.dayWins)) if (k !== d) delete S.dayWins[k];
      }
      S.dayWins[d] = (S.dayWins[d] || 0) + 1;
      const goalHit = S.dayWins[d] === CONFIG.dailyGoal;
      const goalBonus = goalHit ? CONFIG.dailyGoalBonus : 0;
      points += streakBonus + dayBonus + goalBonus;
      S.points += points; S.earned += points; S.wins++;
      const newBest = !prev || (e.ms && (!prev.bestMs || e.ms < prev.bestMs));
      S.solved[id] = { stars: Math.max(stars, prev ? prev.stars : 0), bestMs: prev && prev.bestMs && (!e.ms || prev.bestMs < e.ms) ? prev.bestMs : (e.ms || 0) };
      const nextId = isDaily ? meta.currentIdAfterDaily() : meta.nextId(id);
      if (nextId) S.current = nextId;
      const affordable = SKINS.filter((k) => !S.unlocked.includes(k.id) && k.id !== S.skin && k.cost <= S.points && k.cost > before);
      save();
      const packUnlocked = meta.packs().filter((p) => p.unlocked && !packsBefore.includes(p.id)).map((p) => p.name)[0] || null;
      const r = { points, base, starBonus, firstClear: !prev, daily, total: S.points, newBest: !!(prev && newBest), nextId, support: meta.supportDue(), affordable,
        streak: S.streak, streakBonus, dayStreak: S.dayStreak, dayBonus, goal: { count: Math.min(S.dayWins[d], CONFIG.dailyGoal), target: CONFIG.dailyGoal, hit: goalHit, bonus: goalBonus },
        packUnlocked, nextLook: meta.nextLook(), tease: meta.tease() };
      r.cheer = meta.cheer(r);
      return r;
    },
    currentIdAfterDaily() { S.current = null; return meta.currentId(); },
    recordLoss() {
      const lost = S.streak || 0;
      S.losses++; S.streak = 0; save();
      const lines = lost >= 3 ? ['A ' + lost + '-win streak! Win the next one to start a new one.', 'Even legends drop a mic. ' + lost + ' in a row was huge, go again!']
        : ['So close! Every gig you finish brings a new look nearer.', 'Shake it off and loop it again!', 'Roxor says: one more take. Jasmin agrees.'];
      return { streakLost: lost, cheer: lines[(S.losses + lost) % lines.length], nextLook: meta.nextLook() };
    },
    // the cheapest look still locked, and how far the player is from it
    nextLook() {
      const k = SKINS.filter((x) => !S.unlocked.includes(x.id)).sort((a, b) => a.cost - b.cost)[0];
      if (!k) return null;
      return { id: k.id, name: k.name, cost: k.cost, have: S.points, need: Math.max(0, k.cost - S.points), pct: Math.min(1, S.points / k.cost), ready: S.points >= k.cost };
    },
    // the nearest locked pack and how many wins it still needs
    tease() {
      for (const p of meta.packs()) {
        if (p.unlocked || !p.need) continue;
        const other = meta.packs().find((x) => x.id === p.need.pack);
        if (!other || !other.unlocked) continue;
        return { pack: p.name, need: Math.max(0, p.need.count - other.solved), from: other.name };
      }
      return null;
    },
    // today's progress, for the title screen
    today() {
      const d = today();
      const atRisk = S.dayStreak > 0 && S.lastDay === yesterday();
      return { goal: { count: Math.min(S.dayWins[d] || 0, CONFIG.dailyGoal), target: CONFIG.dailyGoal, bonus: CONFIG.dailyGoalBonus },
        dayStreak: S.lastDay === d || atRisk ? S.dayStreak : 0, playedToday: !!S.dayWins[d], atRisk, streak: S.streak || 0, bestStreak: S.bestStreak || 0 };
    },
    // one line from the duo, picked for the moment
    cheer(r) {
      const pick = (arr) => arr[(S.wins * 7 + (r.streak || 0)) % arr.length];
      if (r.packUnlocked) return 'New stage unlocked: ' + r.packUnlocked + '! Jasmin is already warming up.';
      if (r.affordable && r.affordable.length) return 'You can unlock ' + r.affordable[0].name + ' now! Open Looks.';
      if (r.nextLook && !r.nextLook.ready && r.nextLook.need <= 60) return 'Only ' + r.nextLook.need + ' pts to ' + r.nextLook.name + '. One more gig?';
      if (r.goal && r.goal.hit) return 'Daily set complete: +' + r.goal.bonus + ' pts! Roxor drops the beat for you.';
      if (r.streak >= 5) return pick([r.streak + ' in a row! The crowd is going wild!', 'Unstoppable! ' + r.streak + ' gigs straight!']);
      if (r.streak >= 3) return pick(['Hat trick! Keep the loop going for a bigger bonus.', r.streak + ' in a row! Next win pays even more.']);
      if (r.goal && r.goal.count === r.goal.target - 1) return 'One more gig today for the daily set bonus!';
      if (r.tease && r.tease.need > 0 && r.tease.need <= 2) return r.tease.need + ' more ' + r.tease.from + ' gig' + (r.tease.need > 1 ? 's' : '') + ' to open ' + r.tease.pack + '!';
      if (r.newBest) return 'New personal best! You are getting fast.';
      return pick(['Encore! The crowd wants one more.', 'That was smooth. Ready for the next gig?', 'Roxor: "Boots and cats!" Jasmin: "One more!"', 'Loop it again? The next stage is calling.', 'Mic drop! Keep the tour rolling.']);
    },
    daily() {
      const d = today();
      let h = 2166136261;
      for (const ch of d) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
      h >>>= 0;
      const pool = PACKS.filter((p) => p.id === 'hard' || p.id === 'expert');
      const pack = pool.length ? pool[h % pool.length] : PACKS[0];
      const L = pack.levels[(h >>> 4) % pack.levels.length];
      return { id: 'daily-' + d, pack: pack.id, done: !!S.daily[d], puzzle: puzzleOf(L, { id: 'daily-' + d, num: 0, city: 'Daily Jam', venue: d, packName: 'Daily Jam' }) };
    },
    points: () => S.points,
    skins: () => SKINS.map((k) => Object.assign({}, k, { unlocked: S.unlocked.includes(k.id), current: S.skin === k.id })),
    skin: () => S.skin,
    buySkin(id) {
      const k = SKINS.find((x) => x.id === id);
      if (!k) return { ok: false, reason: 'unknown' };
      if (S.unlocked.includes(id)) return { ok: true };
      if (S.points < k.cost) return { ok: false, reason: 'points', short: k.cost - S.points };
      S.points -= k.cost; S.unlocked.push(id); save();
      return { ok: true, bought: true };
    },
    useSkin(id, screen) {
      const k = SKINS.find((x) => x.id === id);
      if (!k || !S.unlocked.includes(id)) return false;
      S.skin = id; save();
      const here = pageName();
      if (here !== k.file.replace(/.html$/, '')) location.href = k.file + '#' + (screen || 'title');
      return true;
    },
    settings: () => S.settings,
    set(key, value) { S.settings[key] = value; save(); if (key === 'sound') LD.audio.setMuted(!value); if (key === 'music') LD.loop.silent = !value; },
    supportDue() {
      if (S.wins < CONFIG.supportAfterWins) return false;
      if (S.wins - S.supportLast < (S.supportLast ? CONFIG.supportEvery : 0)) return false;
      return true;
    },
    markSupportShown() { S.supportLast = S.wins; save(); },
    resetProgress() { const keep = { settings: S.settings }; S = Object.assign(fresh(), keep); save(); },
    formatTime(ms) { const s = Math.floor((ms || 0) / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); },
  });
  if (!S.settings.sound) LD.audio.setMuted(true);

  // a look that is still locked cannot be opened by typing its address: go back to the player's current look
  (function guard() {
    const here = pageName();
    const k = SKINS.find((x) => x.file.replace(/.html$/, '') === here);
    if (!k) return;
    if (S.unlocked.includes(k.id)) { if (S.skin !== k.id) { S.skin = k.id; save(); } return; }
    const back = SKINS.find((x) => x.id === S.skin && S.unlocked.includes(x.id)) || SKINS[0];
    if (back.file.replace(/.html$/, '') !== here && location.replace) location.replace(back.file + (location.hash || '#title'));
  })();

  // ---------------------------------------------------------------------------------------------------------------
  // OVERLAY UI
  // ---------------------------------------------------------------------------------------------------------------
  const CSS = `
  .ldui{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:flex-end;justify-content:center;background:var(--ld-backdrop,rgba(20,10,30,.55));
    font-family:var(--ld-font,system-ui,sans-serif);color:var(--ld-ink,#221);-webkit-tap-highlight-color:transparent;animation:ldfade .18s ease-out}
  @media (min-width:640px){.ldui{align-items:center}}
  .ldui *{box-sizing:border-box}
  .ldui-sheet{width:100%;max-width:520px;max-height:92dvh;display:flex;flex-direction:column;background:var(--ld-panel,#fff);border:var(--ld-line,0 solid transparent);
    border-radius:var(--ld-radius,22px) var(--ld-radius,22px) 0 0;box-shadow:var(--ld-shadow,0 -10px 40px rgba(0,0,0,.25));animation:ldup .32s cubic-bezier(.2,1.3,.4,1);
    padding-bottom:env(safe-area-inset-bottom,0px)}
  @media (min-width:640px){.ldui-sheet{border-radius:var(--ld-radius,22px);max-height:88dvh}}
  .ldui-head{display:flex;align-items:center;gap:10px;padding:16px 16px 10px}
  .ldui-title{flex:1;margin:0;font:400 26px/1.05 var(--ld-font-display,var(--ld-font,system-ui));letter-spacing:.01em}
  .ldui-pts{font-weight:800;font-size:14px;padding:7px 11px;border-radius:999px;background:var(--ld-accent-2,#ffd54a);color:var(--ld-accent-2-ink,#221);white-space:nowrap}
  .ldui-x{width:44px;height:44px;border-radius:50%;border:var(--ld-line,0 solid transparent);background:var(--ld-panel-2,#f1eef4);color:inherit;font:700 22px/1 system-ui;cursor:pointer}
  .ldui-body{overflow:auto;padding:4px 16px 18px;-webkit-overflow-scrolling:touch}
  .ldui-tabs{display:flex;gap:6px;overflow-x:auto;padding:0 16px 10px;scrollbar-width:none}
  .ldui-tab{flex:none;border:var(--ld-line,0 solid transparent);background:var(--ld-panel-2,#f1eef4);color:inherit;border-radius:999px;padding:9px 13px;font:800 14px var(--ld-font,system-ui);cursor:pointer}
  .ldui-tab[aria-selected="true"]{background:var(--ld-accent,#ff5aa5);color:var(--ld-accent-ink,#fff)}
  .ldui-tab .lk{opacity:.7;margin-left:4px}
  .ldui-note{margin:0 0 12px;font-size:14px;color:var(--ld-muted,#665)}
  .ldui-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
  .ldui-lv{position:relative;aspect-ratio:1;border:var(--ld-line,0 solid transparent);border-radius:calc(var(--ld-radius,22px)*.55);background:var(--ld-panel-2,#f1eef4);color:inherit;
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;cursor:pointer;font:800 18px/1 var(--ld-font,system-ui);padding:0}
  .ldui-lv small{font-size:10px;font-weight:700;opacity:.65}
  .ldui-lv .st{font-size:10px;letter-spacing:-1px;color:var(--ld-accent-2-ink,#b07a00)}
  .ldui-lv.solved{background:var(--ld-accent,#ff5aa5);color:var(--ld-accent-ink,#fff)}
  .ldui-lv.solved .st{color:inherit}
  .ldui-lv.now{outline:3px solid var(--ld-accent-2,#ffd54a);outline-offset:2px}
  .ldui-lv:disabled{opacity:.4;cursor:default}
  .ldui-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:12px 16px;border-radius:calc(var(--ld-radius,22px)*.6);
    border:var(--ld-line,0 solid transparent);background:var(--ld-accent,#ff5aa5);color:var(--ld-accent-ink,#fff);font:800 16px/1.1 var(--ld-font,system-ui);
    text-decoration:none;cursor:pointer;transition:transform .08s ease-out,filter .12s}
  .ldui-btn:hover{filter:brightness(1.06)} .ldui-btn:active,.ldui-lv:active:not(:disabled),.ldui-x:active,.ldui-tab:active{transform:translateY(2px) scale(.96)}
  .ldui-btn.alt{background:var(--ld-panel-2,#f1eef4);color:inherit}
  .ldui-btn.gold{background:var(--ld-accent-2,#ffd54a);color:var(--ld-accent-2-ink,#221)}
  .ldui-btn:disabled{opacity:.45;cursor:default;transform:none}
  .ldui-btn:focus-visible,.ldui-lv:focus-visible,.ldui-tab:focus-visible,.ldui-x:focus-visible{outline:3px solid var(--ld-accent-2,#ffd54a);outline-offset:2px}
  .ldui-skins{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
  .ldui-skin{display:flex;flex-direction:column;border:var(--ld-line,0 solid transparent);border-radius:calc(var(--ld-radius,22px)*.7);overflow:hidden;background:var(--ld-panel-2,#f1eef4)}
  .ldui-skin .pv{position:relative;aspect-ratio:3/4;background:#0001 center top/cover no-repeat}
  .ldui-skin.locked .pv{filter:grayscale(.85) brightness(.85)}
  .ldui-skin .pv b{position:absolute;left:8px;top:8px;font-size:11px;font-weight:800;padding:4px 8px;border-radius:999px;background:var(--ld-accent,#ff5aa5);color:var(--ld-accent-ink,#fff)}
  .ldui-skin .info{padding:10px;display:flex;flex-direction:column;gap:8px;flex:1}
  .ldui-skin .nm{font-weight:800;font-size:15px;line-height:1.15}
  .ldui-skin .by{font-size:12px;color:var(--ld-muted,#665);margin-top:-6px}
  .ldui-skin .ldui-btn{min-height:42px;font-size:14px;padding:9px 10px;margin-top:auto}
  .ldui-hero{display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;padding:4px 4px 8px}
  .ldui-hero h3{margin:0;font:400 28px/1.05 var(--ld-font-display,var(--ld-font,system-ui))}
  .ldui-hero p{margin:0;font-size:15px;line-height:1.45;color:var(--ld-muted,#554);max-width:36ch}
  .ldui-hearts{font-size:40px;line-height:1;animation:ldbeat .9s ease-in-out infinite}
  .ldui-links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:6px}
  .ldui-links .wide{grid-column:1/-1}
  .ldui-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid #0001}
  .ldui-row span{font-weight:700}
  .ldui-row small{display:block;font-weight:500;font-size:12px;color:var(--ld-muted,#665)}
  .ldui-sw{flex:none;width:56px;height:32px;border-radius:999px;border:var(--ld-line,0 solid transparent);background:var(--ld-panel-2,#ddd);position:relative;cursor:pointer}
  .ldui-sw::after{content:"";position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 1px 3px #0004;transition:transform .18s cubic-bezier(.3,1.4,.5,1)}
  .ldui-sw[aria-checked="true"]{background:var(--ld-accent,#ff5aa5)} .ldui-sw[aria-checked="true"]::after{transform:translateX(24px)}
  .ldui-toast{position:fixed;left:50%;top:calc(14px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:2147483001;padding:12px 18px;border-radius:999px;
    background:var(--ld-accent-2,#ffd54a);color:var(--ld-accent-2-ink,#221);font:800 15px var(--ld-font,system-ui);box-shadow:0 8px 24px #0003;border:var(--ld-line,0 solid transparent);
    animation:ldtoast 2.4s ease forwards;pointer-events:none;white-space:nowrap}
  .ldx{font-family:var(--ld-font,system-ui,sans-serif);color:var(--ld-ink,#221);background:var(--ld-panel,#fff);border:var(--ld-line,0 solid transparent);border-radius:calc(var(--ld-radius,22px)*.7);
    box-shadow:var(--ld-shadow,0 6px 20px rgba(0,0,0,.18));padding:10px 12px;display:grid;gap:8px;width:100%;max-width:420px;margin:0 auto;box-sizing:border-box;text-align:left;animation:ldup .4s cubic-bezier(.2,1.3,.4,1) both}
  .ldx *{box-sizing:border-box}
  .ldx-cheer{font:400 17px/1.2 var(--ld-font-display,var(--ld-font,system-ui));margin:0}
  .ldx-pills{display:flex;flex-wrap:wrap;gap:6px}
  .ldx-pill{display:inline-flex;align-items:center;gap:5px;font-weight:800;font-size:12.5px;line-height:1;padding:6px 9px;border-radius:999px;background:var(--ld-panel-2,#f1eef4);white-space:nowrap}
  .ldx-pill.hot{background:var(--ld-accent,#ff5aa5);color:var(--ld-accent-ink,#fff);animation:ldpop .5s cubic-bezier(.2,1.6,.4,1) both}
  .ldx-pill.gold{background:var(--ld-accent-2,#ffd54a);color:var(--ld-accent-2-ink,#221);animation:ldpop .5s .1s cubic-bezier(.2,1.6,.4,1) both}
  .ldx-goal{display:inline-flex;gap:3px;margin-left:2px}.ldx-goal i{width:9px;height:9px;border-radius:50%;background:currentColor;opacity:.25}.ldx-goal i.on{opacity:1}
  .ldx-look{display:grid;grid-template-columns:34px 1fr;gap:8px;align-items:center;font-size:12.5px;font-weight:700}
  .ldx-look img{width:34px;height:44px;object-fit:cover;object-position:top;border-radius:6px;border:var(--ld-line,0 solid transparent)}
  .ldx-bar{height:10px;border-radius:999px;background:var(--ld-panel-2,#eee);overflow:hidden;margin-top:4px;border:var(--ld-line,0 solid transparent)}
  .ldx-bar b{display:block;height:100%;width:var(--from,0%);background:var(--ld-accent,#ff5aa5);border-radius:inherit;animation:ldbar 1.1s .35s cubic-bezier(.3,1,.4,1) forwards}
  .ldx-look.ready .ldx-bar b{background:var(--ld-accent-2,#ffd54a)}
  @keyframes ldbar{to{width:var(--to,0%)}} @keyframes ldpop{from{transform:scale(.4);opacity:0}}
  @media (prefers-reduced-motion:reduce){.ldx,.ldx-pill{animation:none}.ldx-bar b{animation:none;width:var(--to,0%)}}
  @keyframes ldfade{from{opacity:0}} @keyframes ldup{from{transform:translateY(40px) scale(.96);opacity:0}}
  @keyframes ldbeat{0%,100%{transform:scale(1)}15%{transform:scale(1.18)}30%{transform:scale(1)}45%{transform:scale(1.1)}}
  @keyframes ldtoast{0%{opacity:0;transform:translate(-50%,20px) scale(.9)}10%{opacity:1;transform:translate(-50%,0) scale(1.05)}15%{transform:translate(-50%,0) scale(1)}85%{opacity:1}100%{opacity:0;transform:translate(-50%,-10px)}}
  @media (prefers-reduced-motion:reduce){.ldui,.ldui-sheet,.ldui-toast,.ldui-hearts{animation:none}}
  `;
  let styled = false, root = null, onCloseCb = null;
  function style() { if (styled) return; styled = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const click = () => { try { LD.audio.ui(); } catch (_) { /* no audio yet */ } };
  function open(title, html, opts) {
    style(); close(true);
    opts = opts || {};
    root = document.createElement('div');
    root.className = 'ldui';
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', title);
    root.innerHTML = `<div class="ldui-sheet"><div class="ldui-head"><h2 class="ldui-title">${esc(title)}</h2>${opts.points === false ? '' : `<span class="ldui-pts">★ ${S.points} pts</span>`}<button class="ldui-x" type="button" aria-label="Close">×</button></div>${opts.tabs || ''}<div class="ldui-body">${html}</div></div>`;
    root.addEventListener('pointerdown', (e) => { if (e.target === root) { close(); } });
    root.querySelector('.ldui-x').addEventListener('click', () => { LD.audio.uiBack && LD.audio.uiBack(); close(); });
    document.body.appendChild(root);
    onCloseCb = opts.onClose || null;
    const keyer = (e) => { if (e.key === 'Escape') { close(); } };
    window.addEventListener('keydown', keyer, { once: true });
    return root;
  }
  function close(silent) {
    if (!root) return;
    root.remove(); root = null;
    const cb = onCloseCb; onCloseCb = null;
    if (cb && !silent) cb();
  }
  function toast(text) {
    style();
    const t = document.createElement('div'); t.className = 'ldui-toast'; t.textContent = text;
    document.body.appendChild(t); setTimeout(() => t.remove(), 2500);
  }

  function levelsUI(o) {
    o = o || {};
    const packs = meta.packs();
    const cur = meta.currentId();
    let sel = (packs.find((p) => p.levels.some((L) => L.id === cur)) || packs[0]).id;
    const tabs = () => `<div class="ldui-tabs" role="tablist">${packs.map((p) => `<button class="ldui-tab" role="tab" type="button" data-p="${p.id}" aria-selected="${p.id === sel}">${esc(p.name)}<span class="lk">${p.unlocked ? `${p.solved}/${p.total}` : '🔒'}</span></button>`).join('')}</div>`;
    const body = () => {
      const p = packs.find((x) => x.id === sel);
      const sizes = [...new Set(p.levels.map((L) => L.n))].map((n) => n + '×' + n).join(', ');
      let html = `<p class="ldui-note">${p.unlocked ? `${esc(sizes)} boards. ${p.solved} of ${p.total} gigs played.` : `Locked. Clear ${p.need.count} ${esc(p.need.name)} gigs to open it.`}</p>`;
      if (sel === 'easy' || p.unlocked) {
        const d = meta.daily();
        if (sel === packs[0].id) html = `<button class="ldui-btn gold" type="button" data-daily="1" style="width:100%;margin-bottom:12px">${d.done ? '✓ Daily Jam played today' : '★ Daily Jam: double points today'}</button>` + html;
      }
      html += `<div class="ldui-grid">${p.levels.map((L) => `<button class="ldui-lv${L.solved ? ' solved' : ''}${L.id === cur ? ' now' : ''}" type="button" data-id="${L.id}" ${L.unlocked ? '' : 'disabled'} aria-label="${esc(p.name)} gig ${L.num}, ${L.n} by ${L.n}${L.solved ? ', ' + L.stars + ' stars' : ''}${L.unlocked ? '' : ', locked'}">${L.unlocked ? L.num : '🔒'}<small>${L.n}×${L.n}</small>${L.solved ? `<span class="st">${'★'.repeat(L.stars)}</span>` : ''}</button>`).join('')}</div>`;
      return html;
    };
    const r = open('World Tour', body(), { tabs: tabs() });
    const wire = () => {
      r.querySelectorAll('.ldui-tab').forEach((b) => b.addEventListener('click', () => { click(); sel = b.dataset.p; r.querySelector('.ldui-tabs').outerHTML = tabs(); r.querySelector('.ldui-body').innerHTML = body(); wire(); }));
      r.querySelectorAll('.ldui-lv').forEach((b) => b.addEventListener('click', () => { click(); const id = b.dataset.id; close(true); meta.setCurrent(id); if (o.onPlay) o.onPlay(id); }));
      const dj = r.querySelector('[data-daily]');
      if (dj) dj.addEventListener('click', () => { click(); const d = meta.daily(); close(true); meta.setCurrent(d.id); if (o.onPlay) o.onPlay(d.id); });
    };
    wire();
    const nowBtn = r.querySelector('.ldui-lv.now'); if (nowBtn) nowBtn.scrollIntoView({ block: 'center' });
  }

  function skinsUI() {
    const draw = () => meta.skins().map((k) => {
      const short = k.cost - S.points;
      const btn = k.current ? `<button class="ldui-btn alt" type="button" disabled>In use</button>`
        : k.unlocked ? `<button class="ldui-btn" type="button" data-use="${k.id}">Use this look</button>`
        : short > 0 ? `<button class="ldui-btn alt" type="button" disabled>🔒 ${k.cost} pts (${short} to go)</button>`
        : `<button class="ldui-btn gold" type="button" data-buy="${k.id}">Unlock for ${k.cost} pts</button>`;
      return `<div class="ldui-skin${k.unlocked ? '' : ' locked'}"><div class="pv" style="background-image:url('thumbs/skin-${k.id}.jpeg')">${k.current ? '<b>Playing</b>' : k.unlocked ? '' : '<b>🔒</b>'}</div><div class="info"><div class="nm">${esc(k.name)}</div><div class="by">by ${esc(k.artist)}</div>${btn}</div></div>`;
    }).join('');
    const r = open('Looks', `<p class="ldui-note">Play gigs to earn points, then unlock a whole new look for the game. Your progress stays with you in every look.</p><div class="ldui-skins">${draw()}</div>`);
    const wire = () => {
      r.querySelectorAll('[data-use]').forEach((b) => b.addEventListener('click', () => { click(); close(true); meta.useSkin(b.dataset.use); }));
      r.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => {
        const res = meta.buySkin(b.dataset.buy);
        if (res.ok) { try { LD.audio.win(); } catch (_) { /* */ } toast('Unlocked! ' + SKINS.find((k) => k.id === b.dataset.buy).name); r.querySelector('.ldui-skins').innerHTML = draw(); r.querySelector('.ldui-pts').textContent = '★ ' + S.points + ' pts'; wire(); }
      }));
    };
    wire();
  }

  function supportUI(o) {
    o = o || {};
    const L = CONFIG.links;
    const link = (href, label, cls) => (href ? `<a class="ldui-btn ${cls || ''}" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${label}</a>` : '');
    const html = `<div class="ldui-hero"><div class="ldui-hearts" aria-hidden="true">💚💗</div><h3>Keep LoopDoku ad-free</h3>
      <p>No ads, ever. LoopDoku is made by RoxorLoops &amp; Jasmin, a beatbox and singing duo. If you are enjoying it, the best way to say thanks is to follow us, share a gig with a friend, or chip in.</p></div>
      <div class="ldui-links">
        ${link(L.patreon, '★ Join our Patreon', 'gold wide')}${link(L.tip, '♥ Tip us a coffee', 'gold wide')}
        ${link(L.instagram, 'Instagram')}${link(L.tiktok, 'TikTok')}${link(L.youtube, 'YouTube')}${link(L.facebook, 'Facebook')}
        ${link(L.shop, 'Merch shop', 'alt')}${link(L.website, 'Book us for a gig', 'alt')}
        <button class="ldui-btn alt wide" type="button" data-later="1">Maybe later, let me play</button>
      </div>`;
    const r = open('Support the duo', html, { points: false, onClose: o.onClose });
    meta.markSupportShown();
    r.querySelector('[data-later]').addEventListener('click', () => { click(); close(); });
    r.querySelectorAll('a.ldui-btn').forEach((a) => a.addEventListener('click', click));
  }

  function settingsUI(o) {
    o = o || {};
    const st = meta.settings();
    const row = (key, label, note) => `<div class="ldui-row"><span>${label}<small>${note}</small></span><button class="ldui-sw" type="button" role="switch" data-k="${key}" aria-checked="${!!st[key]}" aria-label="${label}"></button></div>`;
    const html = row('sound', 'Sound', 'Beatbox clicks and voices') + row('music', 'Loop Station music', 'The groove that builds as you play')
      + row('assist', 'Auto-cross helper', 'Cross out everything a performer rules out (makes gigs easier)')
      + `<div style="display:grid;gap:8px;margin-top:16px"><button class="ldui-btn alt" type="button" data-support="1">💗 Support the duo</button><button class="ldui-btn alt" type="button" data-reset="1">Reset all progress</button></div>`;
    const r = open('Settings', html, { onClose: o.onClose });
    r.querySelectorAll('.ldui-sw').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.k, v = b.getAttribute('aria-checked') !== 'true';
      b.setAttribute('aria-checked', String(v)); meta.set(k, v);
      click(); if (o.onChange) o.onChange(k, v);
    }));
    r.querySelector('[data-support]').addEventListener('click', () => { click(); supportUI(); });
    r.querySelector('[data-reset]').addEventListener('click', () => confirmUI('Reset all progress? Points, stars and unlocked looks will be gone.', 'Reset everything', () => { meta.resetProgress(); toast('Progress reset'); if (o.onChange) o.onChange('reset', true); }));
  }

  function confirmUI(text, yes, onYes) {
    const r = open('Are you sure?', `<p class="ldui-note" style="font-size:16px">${esc(text)}</p><div style="display:grid;gap:8px"><button class="ldui-btn" type="button" data-y="1">${esc(yes)}</button><button class="ldui-btn alt" type="button" data-n="1">Cancel</button></div>`, { points: false });
    r.querySelector('[data-y]').addEventListener('click', () => { close(true); onYes(); });
    r.querySelector('[data-n]').addEventListener('click', () => close());
  }

  // ---- encouragement cards: drop them into your win / lose / title screen (themed by the same --ld-* variables) ----
  function lookRow(nl, fromPct) {
    if (!nl) return '<div class="ldx-look"><span></span><div>Every look unlocked. Legend!</div></div>';
    const to = Math.round(nl.pct * 100), from = Math.round((fromPct === undefined ? nl.pct : fromPct) * 100);
    return '<div class="ldx-look' + (nl.ready ? ' ready' : '') + '"><img src="thumbs/skin-' + nl.id + '.jpeg" alt=""><div>'
      + (nl.ready ? 'Ready to unlock: <b>' + esc(nl.name) + '</b>! Open Looks.' : 'Next look: <b>' + esc(nl.name) + '</b>, ' + nl.need + ' pts to go')
      + '<div class="ldx-bar"><b style="--from:' + from + '%;--to:' + to + '%"></b></div></div></div>';
  }
  function goalDots(g) { let s = ''; for (let k = 0; k < g.target; k++) s += '<i class="' + (k < g.count ? 'on' : '') + '"></i>'; return '<span class="ldx-goal">' + s + '</span>'; }
  function card(html) { style(); const d = document.createElement('div'); d.className = 'ldx'; d.innerHTML = html; return d; }
  function winExtras(r) {
    if (!r) return card('');
    const pills = [];
    if (r.streak >= 2) pills.push('<span class="ldx-pill hot">🔥 ' + r.streak + ' in a row' + (r.streakBonus ? ' +' + r.streakBonus : '') + '</span>');
    if (r.dayBonus) pills.push('<span class="ldx-pill gold">📅 Day ' + r.dayStreak + ' +' + r.dayBonus + '</span>');
    pills.push('<span class="ldx-pill' + (r.goal.hit ? ' gold' : '') + '">Daily set ' + goalDots(r.goal) + (r.goal.hit ? ' +' + r.goal.bonus : '') + '</span>');
    if (r.tease && r.tease.need > 0) pills.push('<span class="ldx-pill">🔒 ' + esc(r.tease.pack) + ': ' + r.tease.need + ' to go</span>');
    const before = r.nextLook ? Math.max(0, (r.total - r.points) / r.nextLook.cost) : 0;
    return card('<p class="ldx-cheer">' + esc(r.cheer) + '</p><div class="ldx-pills">' + pills.join('') + '</div>' + lookRow(r.nextLook, before));
  }
  function loseExtras(rl) {
    rl = rl || {};
    return card('<p class="ldx-cheer">' + esc(rl.cheer || 'So close! Go again.') + '</p>' + lookRow(meta.nextLook()));
  }
  function titleExtras() {
    const t = meta.today(), pills = [];
    if (t.dayStreak) pills.push('<span class="ldx-pill ' + (t.playedToday ? 'gold' : 'hot') + '">📅 ' + t.dayStreak + '-day streak' + (t.atRisk && !t.playedToday ? ': win today to keep it!' : '') + '</span>');
    pills.push('<span class="ldx-pill">Daily set ' + goalDots(t.goal) + ' +' + t.goal.bonus + '</span>');
    if (t.streak >= 2) pills.push('<span class="ldx-pill hot">🔥 ' + t.streak + ' in a row</span>');
    const ts = meta.tease();
    if (ts && ts.need > 0) pills.push('<span class="ldx-pill">🔒 ' + esc(ts.pack) + ': ' + ts.need + ' ' + esc(ts.from) + ' to go</span>');
    return card('<div class="ldx-pills">' + pills.join('') + '</div>' + lookRow(meta.nextLook()));
  }
  LD.ui = { winExtras, loseExtras, titleExtras, levels: levelsUI, skins: skinsUI, support: supportUI, settings: settingsUI, confirm: confirmUI, toast, close, isOpen: () => !!root };

  // the music setting: the Loop Station keeps its beat (skins pulse on it) but plays no sound when music is off
  LD.loop.silent = S.settings.music === false;
})();
