// BEATBOX HEROES -- game.js
// The controller: current save, the action pipeline (Core.apply -> effects -> UI), autosave, the pause menu,
// goals, and boot. Loaded last; starts the game.
(function (root) {
  'use strict';
  const BBH = root.BBH, E = BBH.E, Core = BBH.Core, CAT = BBH.CATALOG, PAL = BBH.PAL;
  const G = BBH.G = BBH.G || {};
  const h = E.h;
  G.ch = null; G.slot = 0;

  /* ------------------------------------------------------------- saving */
  const saver = Core.Save.scheduler((ch) => { if (G.slot) Core.Save.save(E.store, G.slot, ch); }, 2000, () => performance.now(), (fn, ms) => setTimeout(fn, ms), (t) => clearTimeout(t));
  G.flush = () => saver.flush();
  root.addEventListener('pagehide', G.flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) G.flush(); });
  G.setChar = (ch) => { G.ch = ch; if (G.slot) saver.push(ch); if (E.hudEl && E.hudEl.update && E.hudEl.isConnected) E.hudEl.update(ch); };

  /* ------------------------------------------------------ action pipeline */
  // Run a Core action, store the new save, play the effects. `hand` can intercept effect types: { morning(fx), result(fx), battleResult(fx), navigate(fx) }
  G.do = function (action, hand) {
    const r = Core.apply(G.ch, action, Math.random); G.setChar(r.char); G.play(r.fx, hand); return r;
  };
  G.dev = function (action) { const r = Core.dev(G.ch, action, Math.random); G.setChar(r.char); G.play(r.fx); return r; };
  G.play = function (fx, hand) {
    hand = hand || {};
    for (const f of fx) {
      if (hand[f.t]) { hand[f.t](f); continue; }
      switch (f.t) {
        case 'sfx': E.sfx(f.name); break;
        case 'toast': E.toast(f.text, f.kind); break;
        case 'levelup': E.banner('levelup', 'Level ' + f.level, 'Max energy up. Keep going.', E.icon('level')); E.flash('#9dff4a', 200); E.shake(2, 200); break;
        case 'achievement': E.banner('achievement', f.name, f.desc, E.icon('trophy')); break;
        case 'unlock': { let pix = null; try { pix = BBH.Chars.thumb(f.group, f.id, G.ch.look); } catch (e) { pix = null; } E.banner('unlock', f.name, 'Wear it from the wardrobe at home.', pix || E.icon('star')); break; }
        case 'morning': G.pendingMorning = f; break;
        case 'navigate': G.goPlace(f.to); break;
        default: break;
      }
    }
  };

  /* ---------------------------------------------------------- navigation */
  G.goPlace = function (to) {
    if (to === 'hood' || to === 'street') { E.go('street'); return; }
    E.go('place', { id: to });
  };
  G.enterPlace = function (to) {                                  // from the street: checks gates, spends travel time
    const ok = Core.canEnter(G.ch, to);
    if (!ok.ok) { E.toast(ok.reason, 'warn'); E.sfx('error'); return false; }
    G.do({ t: 'travel', to });                                    // emits navigate -> goPlace
    return true;
  };
  G.leavePlace = function () { G.do({ t: 'at', to: 'street' }); E.go('street'); };

  /* -------------------------------------------------------------- morning */
  G.showMorning = function (then) {
    const f = G.pendingMorning; G.pendingMorning = null; if (!f) { then && then(); return; }
    E.music('home', { fade: 1 });
    const el = h('div.full.fadein', { style: { background: 'linear-gradient(#120d1f,#2c1d4d)', zIndex: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px', gap: '10px' } },
      h('div.tp.cyan', null, f.cause === 'collapse' ? 'YOU PASSED OUT' : 'NEW DAY'), h('div.h1.pop', { style: { fontSize: '14px', lineHeight: '18px' } }, 'DAY ' + f.day), h('div.h2', null, f.name.toUpperCase()),
      h('div.col', { style: { gap: '6px', marginTop: '6px' } }, f.lines.map((l) => h('div.t.ctr', null, l))),
      h('div.tp.blink.gold', { style: { marginTop: '10px' } }, 'TAP TO START THE DAY'));
    E.ui.appendChild(el);
    el.addEventListener('click', () => { el.remove(); E.sfx('confirm'); then && then(); });
  };

  /* ---------------------------------------------------------------- goals */
  G.goal = function (ch) {
    const n = ch.n, nextOpp = Core.OPPONENTS.find((o) => !ch.beat[o.id]);
    if (ch.hunger < 22) return 'You are hungry. Go HOME and eat in the kitchen.';
    if (ch.energy < 22) return 'You are exhausted. Go HOME and nap or sleep.';
    if (!n.busks) return 'Next: go to the PARK and busk (play beats for tip money and fans).';
    if (ch.day < 2) return 'Next: it is getting late. Go HOME and sleep after 20:00.';
    if (!n.openMics) return 'Next: play an open mic at the BAR (Tue to Thu, after 18:00).';
    if (n.trains < 2) return 'Next: train a skill. Go HOME to the vocal booth, or the Sound Lab.';
    if (ch.fans < 50 || n.openMics < 5) return 'Next: reach 50 fans and 5 open mics to unlock Friday showcases.';
    if (nextOpp) return 'Next: win Saturday battle night at the BAR against ' + nextOpp.name + '.';
    if (!ch.flags.worldcup) return 'Next: enter the World Cup at the BAR on Saturday.';
    return 'You are the champion! Collect every cosmetic.';
  };

  /* ------------------------------------------------------------ how to play */
  G.openHelp = function (onClose) {
    const veil = h('div.full', { style: { background: 'rgba(10,6,24,.85)', zIndex: 65 } });
    const close = () => { veil.remove(); box.remove(); onClose && onClose(); };
    const item = (icon, title, text) => h('div.row', { style: { alignItems: 'flex-start', gap: '6px', padding: '4px 0', borderBottom: '1px solid #34235a' } }, E.iconEl(icon, 2, { flex: 'none' }),
      h('div.col.grow', { style: { gap: '2px' } }, h('div.tp.gold', null, title), h('div.ts', { style: { color: '#e6dcff' } }, text)));
    const box = h('div.panel.pop', { style: { left: '8px', right: '8px', top: '38px', bottom: '34px', zIndex: 66, padding: '6px', display: 'flex', flexDirection: 'column' } },
      h('div.h1.ctr', { style: { marginBottom: '4px' } }, 'HOW TO PLAY'),
      h('div.scroll.grow', null,
        item('trophy', 'THE GOAL', 'You are a beatboxer who lost their job. Earn money and fans, win beatbox battles, and become World Cup champion.'),
        item('coin', 'EARN MONEY', 'Busk in the PARK for tips. Odd jobs (flyers, shelves, dishes) pay a safe wage. Pay $' + Core.CFG.rent + ' rent every Sunday.'),
        item('fans', 'GET FANS', 'Play open mics at the BAR (Tue to Thu evening). Fans unlock showcases, shades and hats.'),
        item('battle', 'WIN BATTLES', 'Saturday is battle night at the BAR. Before each round pick a style (BOOM beats HATS beats RIM beats SNARE beats BOOM). Five judges vote. Beat all 7 opponents, then enter the World Cup.'),
        item('busk', 'THE RHYTHM GAME', 'Notes fall down 4 lanes: B (kick), T (hat), K (snare), Pf. Tap the lane when a note reaches the line, or press D F J K. Easy sets are mostly B t K t.'),
        item('mic', 'MIC MODE AND RECORDING', 'In any rhythm set press MIC and beatbox into your microphone. In the Sound Lab recorder you can record your own B, T, K and Pf sounds, which also train the detector.'),
        item('note', 'SONGS, CREW, STREAMS', 'Make beats in the Beat Maker and RELEASE them as songs (fans for 7 days). Recruit crew at the bar. Go live from your desk at home.'),
        item('energy', 'ENERGY, FOOD, MOOD', 'Every activity costs energy and time. Eat at home or the juice bar. Nap or sleep at HOME (sleep after 20:00). You pass out at 02:00.'),
        item('train', 'TRAIN SKILLS', 'At HOME in the vocal booth, or at the Sound Lab. Musicality helps timing, Technicality is skill, Originality wins judges and fans, Showmanship earns tips.'),
        item('hat', 'STYLE', 'Change your look in the wardrobe at HOME. Buy items in the Thrift Shop. Level up and win achievements to unlock more.')),
      h('div.vgap'), E.btn('GOT IT', 'gold', close));
    veil.addEventListener('click', () => {}); E.ui.append(veil, box);
  };

  /* ------------------------------------------------------------- the menu */
  G.openMenu = function () {
    const veil = h('div.full', { style: { background: 'rgba(10,6,24,.7)', zIndex: 60 } });
    const close = () => { veil.remove(); box.remove(); };
    veil.addEventListener('click', close);
    const atHome = G.ch.place === 'home' || G.ch.dev.noGates;
    const box = h('div.panel.pop', { style: { left: '30px', right: '30px', top: '110px', zIndex: 61, padding: '8px' } },
      h('div.h1.ctr', { style: { marginBottom: '8px' } }, 'MENU'),
      h('div.col', null,
        E.btn('RESUME', 'gold', close),
        E.btn('WARDROBE' + (atHome ? '' : ' (HOME)'), atHome ? 'pink' : 'dis', () => { close(); E.go('creator', { mode: 'wardrobe', back: E.sceneName === 'place' ? { scene: 'place', args: { id: G.ch.place } } : { scene: E.sceneName } }); }),
        E.btn('HOW TO PLAY', 'cyan', () => { close(); G.openHelp(); }),
        E.btn('SKILLS & STATS', '', () => { close(); G.openStats(); }),
        E.btn('ACHIEVEMENTS', '', () => { close(); G.openAchievements(); }),
        E.btn('SETTINGS', '', () => { close(); G.openSettings(); }),
        E.btn('SAVE & QUIT', 'red', () => { close(); G.flush(); G.quitToTitle(); })));
    E.ui.append(veil, box);
  };
  G.quitToTitle = function () { G.flush(); G.slot = 0; E.hudEl = null; E.go('title'); };

  G.openStats = function () {
    const ch = G.ch, veil = h('div.full', { style: { background: 'rgba(10,6,24,.8)', zIndex: 60 } });
    const close = () => { veil.remove(); box.remove(); };
    const row = (stat) => h('div.col', { style: { gap: '2px' } }, h('div.row', { style: { justifyContent: 'space-between' } }, h('div.row', null, E.iconEl(stat, 1), h('div.tp', null, Core.STAT_NAMES[stat].toUpperCase())), h('div.tp.gold', null, Math.floor(ch.stats[stat]))), E.bar('#ff3ea5', ch.stats[stat] / 99));
    const kv = (k, v) => h('div.row', { style: { justifyContent: 'space-between' } }, h('div.ts', null, k), h('div.t', null, String(v)));
    const box = h('div.panel.pop', { style: { left: '14px', right: '14px', top: '46px', zIndex: 61, padding: '8px' } },
      h('div.row', { style: { gap: '6px', marginBottom: '6px' } }, E.pixEl(BBH.Chars.portrait(BBH.Chars.fix(ch.look), 'happy'), 1), h('div.col', { style: { gap: '2px' } }, h('div.h1', null, ch.name), h('div.ts', null, 'Level ' + ch.level + '  ' + ch.xp + '/' + Core.xpNeed(ch.level) + ' xp'), h('div.ts', null, ch.fans + ' fans  $' + ch.cash))),
      h('div.col', { style: { gap: '5px' } }, Core.STATS.map(row)),
      h('div.vgap'), kv('Busks', ch.n.busks), kv('Open mics', ch.n.openMics), kv('Showcases', ch.n.showcases), kv('Battles won', ch.n.battlesWon + ' / ' + (ch.n.battlesWon + ch.n.battlesLost)), kv('Best combo', ch.n.bestCombo), kv('Perfect hits', ch.n.perfects), kv('Nights', ch.n.nights),
      h('div.vgap'), E.btn('CLOSE', 'gold', close));
    veil.addEventListener('click', close); E.ui.append(veil, box);
  };

  G.openAchievements = function () {
    const ch = G.ch, veil = h('div.full', { style: { background: 'rgba(10,6,24,.85)', zIndex: 60 } });
    const close = () => { veil.remove(); box.remove(); };
    const rewards = (id) => { const out = []; for (const g of Object.keys(CAT.GROUPS)) for (const it of CAT.GROUPS[g]) if (it.unlock.t === 'ach' && it.unlock.id === id) out.push(it.name); return out; };
    const list = Core.ACHIEVEMENTS.map((a) => {
      const got = !!ch.ach[a.id], rw = rewards(a.id);
      return h('div.row', { style: { opacity: got ? 1 : 0.55, alignItems: 'flex-start', padding: '3px 0', borderBottom: '1px solid #34235a' } }, E.iconEl(got ? 'trophy' : 'lock', 1),
        h('div.grow', null, h('div.tp', { style: { color: got ? 'var(--gold2)' : 'var(--cream)' } }, a.name.toUpperCase()), h('div.ts', null, a.desc), rw.length ? h('div.ts.pink', null, 'Unlocks: ' + rw.join(', ')) : null));
    });
    const got = Object.keys(ch.ach).length;
    const box = h('div.panel.pop', { style: { left: '10px', right: '10px', top: '44px', bottom: '40px', zIndex: 61, padding: '6px', display: 'flex', flexDirection: 'column' } },
      h('div.h1.ctr', { style: { marginBottom: '4px' } }, 'ACHIEVEMENTS ' + got + '/' + Core.ACHIEVEMENTS.length), h('div.scroll.grow', null, list), h('div.vgap'), E.btn('CLOSE', 'gold', close));
    veil.addEventListener('click', close); E.ui.append(veil, box);
  };

  G.openSettings = function (onClose) {
    const veil = h('div.full', { style: { background: 'rgba(10,6,24,.8)', zIndex: 60 } });
    const close = () => { veil.remove(); box.remove(); E.saveSettings(); onClose && onClose(); };
    const slider = (label, key, min, max, step, fmt) => {
      const val = h('div.tp.gold', null, fmt(E.settings[key]));
      const inp = h('input', { type: 'range', min, max, step, value: E.settings[key] });
      inp.addEventListener('input', () => { E.settings[key] = parseFloat(inp.value); val.textContent = fmt(E.settings[key]); E.applyAudioSettings(); });
      inp.addEventListener('change', () => { E.sfx('hit_perfect'); E.saveSettings(); });
      return h('div.col', { style: { gap: '2px' } }, h('div.row', { style: { justifyContent: 'space-between' } }, h('div.tp', null, label), val), inp);
    };
    const toggle = (label, key, after) => { const b = E.btn('', E.settings[key] ? 'green' : '', null); const set = () => { b.textContent = label + ': ' + (E.settings[key] ? 'ON' : 'OFF'); b.className = 'btn ' + (E.settings[key] ? 'green' : ''); }; set(); b.addEventListener('click', () => { E.settings[key] = !E.settings[key]; set(); E.applyAudioSettings(); after && after(); E.saveSettings(); }); return b; };
    const box = h('div.panel.pop', { style: { left: '14px', right: '14px', top: '70px', zIndex: 61, padding: '8px' } },
      h('div.h1.ctr', { style: { marginBottom: '8px' } }, 'SETTINGS'),
      h('div.col', { style: { gap: '7px' } }, slider('MUSIC', 'music', 0, 1, 0.05, (v) => Math.round(v * 100) + '%'), slider('SOUND FX', 'sfx', 0, 1, 0.05, (v) => Math.round(v * 100) + '%'),
        slider('AUDIO OFFSET', 'offset', -150, 150, 5, (v) => (v > 0 ? '+' : '') + v + 'ms'), h('div.ts', null, 'Notes feel late? Lower it. Early? Raise it.'),
        toggle('MUTE', 'muted'), toggle('REDUCE MOTION', 'reduce'), toggle('SCANLINES', 'scan')),
      h('div.vgap'), E.btn('DONE', 'gold', close));
    veil.addEventListener('click', close); E.ui.append(veil, box);
  };

  /* ----------------------------------------------------------- game start */
  G.loadSamples = () => { try { if (BBH.Samples) Promise.resolve(BBH.Samples.init(G.slot)).then(() => BBH.Samples.applyToAudio(G.slot)).catch(() => {}); } catch (e) { /* ignore */ } };
  G.startSlot = function (slot, ch) {                             // load/continue
    G.slot = slot; G.setChar(ch); E.applyAudioSettings(); G.loadSamples();
    if (!ch.flags.intro) { E.go('intro', { next: 'continue' }); return; }
    G.resume();
  };
  G.resume = function () { const p = G.ch.place; if (p && p !== 'street' && Core.PLACES[p]) E.go('place', { id: p }); else E.go('street'); };
  G.newGame = function (slot, look) {
    const ch = Core.newChar(look); ch.created = Date.now(); G.slot = slot; G.setChar(ch); G.flush(); try { BBH.Samples && BBH.Samples.removeAll && BBH.Samples.removeAll(slot); } catch (e) { /* ignore */ } G.loadSamples(); E.go('intro', { next: 'new' });
  };

  /* ---------------------------------------------------------------- boot */
  G.boot = function () {
    E.applyAudioSettings();
    E.go('boot', {}, { nofade: true });
    E.start();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', G.boot); else G.boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
