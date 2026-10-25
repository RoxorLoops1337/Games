// Boot + flow. Screens never import each other: they call app.shared.flow.* and read app.shared.run.
import { createApp } from './ui/core.js';
import { FX_OPTS } from './ui/fx.js';
import * as audio from './ui/audio.js';
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
import settings from './ui/settings.js';

const PHASE_SCREEN = { map: 'map', combat: 'combat', reward: 'reward', graft: 'graft', shop: 'shop', forge: 'forge', event: 'event', dead: 'end', won: 'end' };
const ACT_THEME = { 1: 'ward', 2: 'market', 3: 'theatre' };

export function boot(canvas) {
  const meta = META.loadMeta();
  const app = createApp(canvas, { shared: { run: null, meta } });
  const flow = {
    app, audio, RUN, META,
    start(opts) {
      const run = RUN.newRun(opts);
      app.shared.run = run; META.onRunStart && META.onRunStart(app.shared.meta, run); saveRun(run);
      flow.route();
    },
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
    openSettings() { app.push('settings', {}); },
    saveMeta() { META.saveMeta(app.shared.meta); },
  };
  app.shared.flow = flow;
  app.shared.audio = audio;
  app.onClick = () => audio.sfx('uiClick');
  app.onHover = () => audio.sfx('uiHover', { vol: 0.35 });
  const S = { title, map, combat, reward, graft, shop, forge, event, end, deckview, codex, settings };
  for (const k of Object.keys(S)) app.register(k, S[k]);
  const first = () => { audio.initAudio(); window.removeEventListener('pointerdown', first); window.removeEventListener('keydown', first); };
  window.addEventListener('pointerdown', first); window.addEventListener('keydown', first);
  const st = meta.settings || {};
  audio.setVolumes({ master: st.master ?? 0.8, sfx: st.sfx ?? 0.8, music: st.music ?? 0.35 });
  app.overlay = () => {
    const st = app.shared.meta.settings || {};
    FX_OPTS.shake = st.screenShake !== false; FX_OPTS.reduced = !!st.reducedMotion;
    app.textScale = st.textSize === 'large' ? 1.12 : 1;
  };
  app.go('title');
  app.start();
  return { app, flow };
}

if (typeof document !== 'undefined' && document.getElementById('cv')) {
  const { app, flow } = boot(document.getElementById('cv'));
  window.__gw = { app, flow };
  const b = document.getElementById('boot'); if (b) b.remove();
}
