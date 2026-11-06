// Boot + flow. Screens never import each other: they call app.shared.flow.* and read app.shared.run.
import * as A11Y from './ui/a11y.js';
import { createApp } from './ui/core.js';
import { FX_OPTS, defaultQuality } from './ui/fx.js';
import * as audio from './ui/audio.js';
import { installPost } from './ui/post.js';
import * as TRANS from './ui/transitions.js';
import { lights } from './ui/lights.js';
import * as RUN from './engine/run.js';
import * as META from './engine/meta.js';
import { saveRun, loadRun, clearRun, hasRun } from './engine/save.js';

import title from './ui/title.js';
import map from './ui/map.js';
import combat from './ui/combat.js';
import reward from './ui/reward.js';
import graft from './ui/graft.js';
import shop from './ui/shop.js';
import forge from './ui/forge.js';
import event from './ui/event.js';
import end from './ui/end.js';
import deckview from './ui/deckview.js';
import codex from './ui/codex.js';
import wardrobe from './ui/wardrobe.js';
import { setCardBack } from './art/cards.js';
import { setHeroTint } from './art/heroes.js';
import settings from './ui/settings.js';
import pause, { installPause, drawPauseOverlay } from './ui/pause.js';
import { installTransitions } from './ui/transitions.js';
import { installFullscreen } from './ui/fullscreen.js';

const PHASE_SCREEN = { map: 'map', combat: 'combat', reward: 'reward', graft: 'graft', shop: 'shop', forge: 'forge', event: 'event', dead: 'end', won: 'end' };
const ACT_THEME = { 1: 'ward', 2: 'market', 3: 'theatre' };

export function applyLoadout(m) { try { setCardBack(m.loadout.back); setHeroTint(META.tintColor(m)); } catch (e) { /* cosmetics are optional */ } }

export function boot(canvas) {
  const meta = META.loadMeta();
  applyLoadout(meta);
  const app = createApp(canvas, { shared: { run: null, meta } });
  const flow = {
    app, audio, RUN, META,
    start(opts) {
      const run = RUN.newRun(opts);
      app.shared.run = run; META.onRunStart && META.onRunStart(app.shared.meta, run); saveRun(run);
      flow.route();
    },
    startPractice(snap) { const run = META.newPracticeRun(snap); app.shared.run = run; saveRun(run); flow.route(); },
    resume() { const run = loadRun(); if (!run) return false; app.shared.run = run; flow.route(); return true; },
    hasSave: () => hasRun(),
    abandon() { const run = app.shared.run; if (run) { run.phase = 'dead'; run.abandoned = true; } flow.route(); },
    toTitle() { audio.music('title'); app.go('title'); },
    // Decide which screen the run is on. Call after ANY change to run.phase.
    route() {
      const run = app.shared.run;
      if (!run) return flow.toTitle();
      if ((run.phase === 'dead' || run.phase === 'won') && !run.ended) {
        run.ended = true; run.endInfo = META.recordRunEnd(app.shared.meta, run, run.phase === 'won' ? 'won' : 'dead');
      }
      saveRun(run);
      const scr = PHASE_SCREEN[run.phase] || 'map';
      const kind = run.pending && run.pending.fightKind;
      audio.music(scr === 'combat' ? (kind === 'boss' || kind === 'final' ? 'boss' : ACT_THEME[run.act])
        : scr === 'map' ? ACT_THEME[run.act] : scr === 'graft' ? 'grafting' : scr === 'shop' ? 'shop' : scr === 'forge' ? 'forge'
        : scr === 'end' ? (run.phase === 'won' ? 'victory' : 'defeat') : ACT_THEME[run.act]);
      app.go(scr, { run });
    },
    openDeck(opts) { app.push('deckview', opts || {}); },
    openCodex() { app.push('codex', {}); },
    openWardrobe() { app.push('wardrobe', {}); },
    openSettings() { app.push('settings', {}); },
    openPause() { if (!app.stack.some((s) => s.name === 'pause')) app.push('pause', {}); },
    saveMeta() { META.saveMeta(app.shared.meta); applyLoadout(app.shared.meta); },
  };
  if (!['off', 'low', 'high'].includes(meta.settings && meta.settings.quality)) { meta.settings = meta.settings || {}; meta.settings.quality = defaultQuality(); }
  installPost(app);
  installTransitions(app);
  app.lightsApi = lights; app.shared.transitions = TRANS;
  installPause(app);
  installFullscreen(app);
  app.shared.flow = flow;
  app.shared.audio = audio;
  app.onClick = () => audio.sfx('uiClick');
  app.onHover = () => audio.sfx('uiHover', { vol: 0.35 });
  const S = { title, map, combat, reward, graft, shop, forge, event, end, deckview, codex, wardrobe, settings, pause };
  for (const k of Object.keys(S)) app.register(k, S[k]);
  const first = () => { audio.initAudio(); window.removeEventListener('pointerdown', first); window.removeEventListener('keydown', first); };
  window.addEventListener('pointerdown', first); window.addEventListener('keydown', first);
  const st = meta.settings || {};
  audio.setVolumes({ master: st.master ?? 0.8, sfx: st.sfx ?? 0.8, music: st.music ?? 0.35 });
  app.overlay = () => {
    const st = app.shared.meta.settings || {};
    FX_OPTS.shake = st.screenShake !== false; FX_OPTS.reduced = !!st.reducedMotion;
    const ts = [100, 125, 150, 175].includes(st.textScale) ? st.textScale : (st.textSize === 'large' ? 125 : 100);
    app.textScale = ts / 100;
    app.quality = st.quality || 'high'; FX_OPTS.quality = app.quality === 'off' ? 0 : app.quality === 'low' ? 0.5 : 1;
    A11Y.applySettings(app);
    TRANS.drawTransitions(app);
    drawPauseOverlay(app);
  };
  A11Y.installA11y(app);
  app.go('title');
  app.start();
  return { app, flow };
}

if (typeof document !== 'undefined' && document.getElementById('cv')) {
  const { app, flow } = boot(document.getElementById('cv'));
  window.__gw = { app, flow };
  const b = document.getElementById('boot'); if (b) b.remove();
}
