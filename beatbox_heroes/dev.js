// BEATBOX HEROES -- dev.js: the developer menu. Triple-tap the clock, enter 808. Every action goes through
// Core.dev / Core.apply (the same reducer as the game), so using it also exercises the real code.
(function (root) {
  'use strict';
  const BBH = root.BBH, E = BBH.E, Core = BBH.Core, CAT = BBH.CATALOG, PAL = BBH.PAL;
  const G = BBH.G = BBH.G || {};
  const h = E.h;
  const SFX = ['click', 'back', 'confirm', 'error', 'coin', 'buy', 'unlock', 'levelup', 'achievement', 'hit_perfect', 'hit_good', 'miss', 'combo', 'win', 'lose', 'equip', 'swoosh', 'sleep', 'eat', 'step', 'door', 'crowd_cheer', 'crowd_boo', 'applause', 'sparkle', 'whoosh', 'record', 'countdown', 'go'];
  const MUSIC = ['title', 'creator', 'street', 'home', 'park', 'shop', 'bar', 'studio', 'battle', 'victory', 'defeat', 'intro'];

  G.openDev = function () {
    if (E.store.getItem('bbh:dev') !== '1') {
      const inp = h('input', { type: 'text', placeholder: 'CODE', maxlength: 8 });
      E.modal({ title: 'DEV CODE', body: h('div', null, inp), buttons: [{ label: 'CANCEL' }, { label: 'OK', cls: 'gold', fn: () => { if (inp.value.trim() === '808') { E.store.setItem('bbh:dev', '1'); E.toast('Dev menu unlocked', 'good'); G.openDev(); } else E.toast('Nope.', 'warn'); } }] });
      return;
    }
    if (!G.ch) { E.toast('Start a game first.', 'warn'); return; }
    const veil = h('div.full', { style: { zIndex: 70, background: 'rgba(10,6,24,.5)' } });
    const close = () => { veil.remove(); box.remove(); };
    veil.addEventListener('click', close);
    const body = h('div.scroll', { style: { position: 'absolute', left: '6px', right: '6px', top: '24px', bottom: '4px' } });
    const box = h('div.panel.sheet', { style: { height: '300px', padding: '0', zIndex: 71 } }, h('div.row', { style: { position: 'absolute', left: '6px', right: '6px', top: '4px', justifyContent: 'space-between' } }, h('div.h2.pink', null, 'DEV MENU'), E.btn('X', '', close, { padding: '2px 5px' })), body);
    E.ui.append(veil, box);
    const sec = (title) => body.appendChild(h('div.tp.cyan', { style: { margin: '6px 0 3px' } }, title));
    const grid = () => { const g = h('div.grid'); body.appendChild(g); return g; };
    const b = (g, label, fn, cls) => g.appendChild(E.btn(label, cls || '', () => { fn(); refresh(); }, { fontSize: '5px', padding: '4px 5px 5px' }));
    const info = h('div.ts'); const refresh = () => { const c = G.ch; info.textContent = 'D' + c.day + ' ' + Core.clock(c.minutes) + '  $' + c.cash + '  ' + c.fans + 'f  LV' + c.level + '  ' + (c.dev.unlockAll ? 'UNLOCKED ' : '') + (c.dev.noGates ? 'NOGATES' : ''); };
    body.appendChild(info); refresh();

    sec('STATE'); let g = grid();
    b(g, '+$100', () => G.dev({ k: 'cash', v: 100 })); b(g, '+$1000', () => G.dev({ k: 'cash', v: 1000 })); b(g, '+100 FANS', () => G.dev({ k: 'fans', v: 100 })); b(g, '+1000 FANS', () => G.dev({ k: 'fans', v: 1000 }));
    b(g, '+100 XP', () => G.dev({ k: 'xp', v: 100 })); b(g, 'LV +1', () => G.dev({ k: 'level', v: G.ch.level + 1 })); b(g, 'LV +5', () => G.dev({ k: 'level', v: G.ch.level + 5 })); b(g, 'LV 15', () => G.dev({ k: 'level', v: 15 }));
    b(g, 'STATS +5', () => G.dev({ k: 'stats', v: 5 })); b(g, 'STATS +20', () => G.dev({ k: 'stats', v: 20 })); b(g, 'RESTORE', () => G.dev({ k: 'restore' }), 'green');
    sec('TIME'); g = grid();
    [['06:00', 0], ['09:00', 180], ['12:00', 360], ['17:30', 690], ['20:00', 840], ['22:00', 960], ['00:30', 1110], ['01:55', 1195]].forEach(([l, m]) => b(g, l, () => G.dev({ k: 'time', v: m })));
    b(g, 'DAY +1', () => G.dev({ k: 'day', v: G.ch.day + 1 })); b(g, 'DAY +7', () => G.dev({ k: 'day', v: G.ch.day + 7 })); b(g, 'DAY 4 (FRI)', () => G.dev({ k: 'day', v: Math.max(G.ch.day, 4 + Math.ceil((G.ch.day - 4) / 7) * 7) })); b(g, 'DAY 5 (SAT)', () => G.dev({ k: 'day', v: Math.max(G.ch.day, 5 + Math.ceil((G.ch.day - 5) / 7) * 7) }));
    sec('UNLOCKS'); g = grid();
    b(g, 'ALL COSMETICS ' + (G.ch.dev.unlockAll ? 'ON' : 'OFF'), () => G.dev({ k: 'unlockAll' }), 'gold'); b(g, 'NO GATES ' + (G.ch.dev.noGates ? 'ON' : 'OFF'), () => G.dev({ k: 'noGates' }), 'gold'); b(g, 'ALL ACHIEVEMENTS', () => G.dev({ k: 'unlockAch' })); b(g, 'BEAT ALL 7', () => G.dev({ k: 'beatAll' })); b(g, 'RESET COOLDOWN', () => G.dev({ k: 'cooldown' })); b(g, 'AFFINITY MAX', () => G.dev({ k: 'affinity' }));
    sec('GO TO'); g = grid();
    for (const p of ['home', 'park', 'shop', 'studio', 'bar']) b(g, p.toUpperCase(), () => { close(); G.ch.place = p; G.goPlace(p); });
    b(g, 'STREET', () => { close(); E.go('street'); }); b(g, 'WARDROBE', () => { close(); E.go('creator', { mode: 'wardrobe', back: { scene: 'street' } }); }); b(g, 'TITLE', () => { close(); G.quitToTitle(); }); b(g, 'INTRO', () => { close(); E.go('intro', { next: 'continue' }); });
    sec('PLAY'); g = grid();
    Core.OPPONENTS.forEach((o) => b(g, 'VS ' + o.name.split(' ')[0].toUpperCase(), () => { close(); E.go('rhythm', { mode: 'battle', opp: o, stage: ['pink', 'cyan', 'lime', 'gold'][o.style % 4], onDone: () => E.go('street'), onAbort: () => E.go('street') }); }, 'pink'));
    Core.FINALS.forEach((o) => b(g, o.name.split(' ')[0].toUpperCase() + ' FINAL', () => { close(); E.go('rhythm', { mode: 'battle', opp: o, stage: 'gold', onDone: () => E.go('street'), onAbort: () => E.go('street') }); }, 'pink'));
    [['EASY', 0.2, 88], ['MEDIUM', 0.5, 100], ['HARD', 0.8, 120], ['INSANE', 1, 140]].forEach(([l, d, bpm]) => b(g, 'RHYTHM ' + l, () => { close(); E.go('rhythm', { mode: 'practice', title: 'TEST ' + l, bpm, bars: 8, difficulty: d, style: 1, stage: 'cyan', onDone: (res) => { G.showResult({ kind: 'test', res, rw: Core.reward('practice', res, G.ch) }, () => E.go('street')); }, onAbort: () => E.go('street') }); }));
    sec('MINI GAMES'); g = grid();
    b(g, 'RUN', () => { close(); E.go('run', { back: { scene: 'street' } }); }); b(g, 'TUNER', () => { close(); E.go('tuner', { back: { scene: 'street' } }); }); b(g, 'BEAT MAKER', () => { close(); E.go('seq', { back: { scene: 'street' } }); }); b(g, 'RECORDER', () => { close(); E.go('studio', { back: { scene: 'street' } }); }); b(g, 'CREW', () => { close(); G.openCrew(); }); b(g, 'SONGS', () => { close(); G.openSongs(); });
    sec('AUDIO'); g = grid();
    MUSIC.forEach((m) => b(g, '♪ ' + m.toUpperCase(), () => E.music(m), 'cyan')); b(g, 'STOP MUSIC', () => { try { E.A().music.stop(0.3); } catch (e) { /* ignore */ } });
    const g2 = grid(); SFX.forEach((s) => b(g2, s, () => E.sfx(s)));
    sec('VISUALS'); g = grid();
    b(g, 'FPS ' + (E.showFps ? 'ON' : 'OFF'), () => { E.showFps = !E.showFps; });
    b(g, 'CAST GALLERY', () => { close(); G.castGallery(); }); b(g, 'PARTY BURST', () => { E.burst(180, 267, 60, { colors: [PAL.gold, PAL.neonPink, PAL.neonCyan, PAL.neonLime], speed: 120, up: 80, life: 1200 }); E.flash('#fff', 200); E.shake(4, 300); });
    b(g, 'TEST BANNER', () => { E.banner('achievement', 'Test Banner', 'Looks good?', E.icon('trophy')); }); b(g, 'TEST LEVELUP', () => { E.banner('levelup', 'Level 99', 'Wow.', E.icon('level')); });
    sec('SAVE'); g = grid();
    b(g, 'EXPORT TO CLIPBOARD', () => { const s = JSON.stringify(G.ch); try { navigator.clipboard.writeText(s); E.toast('Copied ' + s.length + ' bytes', 'good'); } catch (e) { E.toast('Clipboard blocked', 'warn'); } });
    b(g, 'IMPORT FROM CLIPBOARD', () => { navigator.clipboard.readText().then((s) => { const ch = Core.migrate(JSON.parse(s)); if (ch) { G.setChar(ch); E.toast('Imported', 'good'); } }).catch(() => E.toast('Import failed', 'warn')); });
    b(g, 'FORCE SAVE', () => { G.flush(); E.toast('Saved slot ' + G.slot, 'good'); }); b(g, 'LOCK DEV MENU', () => { E.store.removeItem('bbh:dev'); close(); E.toast('Dev menu locked', 'warn'); }, 'red');
  };

  // every named character and opponent, for art review
  G.castGallery = function () {
    const veil = h('div.full', { style: { zIndex: 70, background: 'rgba(10,6,24,.95)' } }), close = () => veil.remove();
    const list = Object.entries(Core.NPCS).map(([k, n]) => [n.name, n.look]).concat(Core.OPPONENTS.map((o) => [o.name, o.look]), Core.FINALS.map((o) => [o.name, o.look]));
    const grid = h('div.grid.scroll', { style: { position: 'absolute', left: '4px', right: '4px', top: '24px', bottom: '30px', gap: '4px' } });
    for (const [name, look] of list) { const l = BBH.Chars.fix(look); grid.appendChild(h('div.col', { style: { width: '60px', alignItems: 'center', gap: '1px' } }, E.pixEl(BBH.Chars.render(l, 'idle', 0, { frame: 0 }), 1), h('div.tp', { style: { fontSize: '5px', textAlign: 'center' } }, name.toUpperCase()))); }
    veil.append(h('div.h2.ctr', { style: { position: 'absolute', left: 0, right: 0, top: '8px' } }, 'CAST'), grid, E.btn('CLOSE', 'gold', close, { position: 'absolute', left: '80px', right: '80px', bottom: '6px' }));
    E.add(veil);
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
