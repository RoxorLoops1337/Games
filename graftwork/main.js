// Boot + flow. Screens never import each other: they call app.shared.flow.* and read app.shared.run.
import * as A11Y from './ui/a11y.js';
import { createApp } from './ui/core.js';
import { FX_OPTS, defaultQuality } from './ui/fx.js';
import * as audio from './ui/audio.js';
import { installPost } from './ui/post.js';
import { cleanGraphics } from './ui/quality.js';
import { assets } from './ui/assets.js';
import { templates } from './ui/templates.js';
import * as TRANS from './ui/transitions.js';
import * as RUN from './engine/run.js';
import * as META from './engine/meta.js';
import { saveRun, loadRun, hasRun } from './engine/save.js';

import title from './ui/title.js';
import combat from './ui/combat.js';
import reward from './ui/reward.js';
import graft from './ui/graft.js';
import shop from './ui/shop.js';
import forge from './ui/forge.js';
import event from './ui/event.js';
import end from './ui/end.js';
import ward, { wardInterlude } from './ui/ward.js';
import deckview from './ui/deckview.js';
import codex from './ui/codex.js';
import archive from './ui/archive.js';
import wardrobe from './ui/wardrobe.js';
import { setCardBack, cardFrame } from './art/cards.js';
import { setHeroTint } from './art/heroes.js';
import settings, { TEXT_STEPS, QUALITY } from './ui/settings.js';
import pause, { installPause, drawPauseOverlay } from './ui/pause.js';
import { installFullscreen } from './ui/fullscreen.js';
import { initInstall, installHelp, drawInstallToast } from './ui/install.js';
import { initOffline } from './ui/offline.js';
import { appPanel, offlinePrompt } from './ui/app_panel.js';
import { installWings } from './ui/wings.js';

const PHASE_SCREEN = { ward: 'ward', combat: 'combat', reward: 'reward', graft: 'graft', shop: 'shop', forge: 'forge', event: 'event', dead: 'end', won: 'end' };
const ACT_THEME = { 1: 'ward', 2: 'market', 3: 'theatre' };

function applyLoadout(m) { try { setCardBack(m.loadout.back); setHeroTint(META.tintColor(m)); } catch (e) { /* cosmetics are optional */ } }

export function boot(canvas) {
  const meta = META.loadMeta();
  META.retireClassicRun(meta); // a saved run on the retired map is closed and counted before the title looks for a save (the title shows meta.notice)
  applyLoadout(meta);
  const app = createApp(canvas, { shared: { run: null, meta } });
  const flow = {
    app, audio, RUN, META,
    start(opts) {
      const run = RUN.newRun(META.withUnlocks(app.shared.meta, opts)); // content gating: the player's unlocked set (Daily: starting pool)
      app.shared.run = run; META.onRunStart(app.shared.meta, run); saveRun(run);
      flow.route();
    },
    startPractice(snap) { const run = META.newPracticeRun(snap, app.shared.meta); app.shared.run = run; saveRun(run); flow.route(); },
    resume() { if (META.retireClassicRun(app.shared.meta)) return false; const run = loadRun(); if (!run) return false; app.shared.run = run; flow.route(); return true; },
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
      const scr = PHASE_SCREEN[run.phase] || 'ward';
      if (scr !== 'ward' && scr !== 'end' && wardInterlude(app, run, scr)) return; // the hero walks to the next trigger on the Ward first
      const kind = run.pending && run.pending.fightKind;
      audio.music(scr === 'combat' ? (kind === 'boss' || kind === 'final' ? 'boss' : ACT_THEME[run.act])
        : scr === 'graft' ? 'grafting' : scr === 'shop' ? 'shop' : scr === 'forge' ? 'forge'
        : scr === 'end' ? (run.phase === 'won' ? 'victory' : 'defeat') : ACT_THEME[run.act]);
      app.go(scr, { run });
    },
    openDeck(opts) { app.push('deckview', opts || {}); },
    openCodex() { app.push('codex', {}); },
    openArchive() { app.push('archive', {}); },
    openWardrobe() { app.push('wardrobe', {}); },
    openSettings() { app.push('settings', {}); },
    openPause() { if (!app.stack.some((s) => s.name === 'pause')) app.push('pause', {}); },
    // a setting or a cosmetic changed: it applies now, and the frozen picture under a modal is painted again with it
    saveMeta() { META.saveMeta(app.shared.meta); applyLoadout(app.shared.meta); applySettings(); app.refreshBelow('look'); },
  };
  if (!QUALITY.includes(meta.settings && meta.settings.quality)) { meta.settings = meta.settings || {}; meta.settings.quality = defaultQuality(); }
  installPost(app);
  installWings(app); // wide phones: the picture runs on into the side bars (ui/wings.js)
  TRANS.installTransitions(app);
  app.shared.transitions = TRANS;
  installPause(app);
  installFullscreen(app);
  initInstall();
  initOffline();
  app.shared.flow = flow;
  app.shared.audio = audio;
  app.onClick = () => audio.sfx('uiClick');
  app.onHover = () => audio.sfx('uiHover', { vol: 0.35 });
  const S = { title, ward, combat, reward, graft, shop, forge, event, end, deckview, codex, archive, wardrobe, settings, pause, install_help: installHelp, app_panel: appPanel, offline_prompt: offlinePrompt };
  for (const k of Object.keys(S)) app.register(k, S[k]);
  const first = () => { audio.initAudio(); window.removeEventListener('pointerdown', first); window.removeEventListener('keydown', first); };
  window.addEventListener('pointerdown', first); window.addEventListener('keydown', first);
  const st = meta.settings || {};
  audio.setVolumes({ master: st.master ?? META.SETTING_DEFAULTS.master, sfx: st.sfx ?? META.SETTING_DEFAULTS.sfx, music: st.music ?? META.SETTING_DEFAULTS.music });
  let artVer = assets.ver, uiVer = templates.ver;
  app.belowOverlay = () => TRANS.drawTransitions(app, true); // a wipe or a boss plate caught by a modal is part of the frozen picture
  // meta.settings into the switches the screens read (every frame, and at once when a setting is saved)
  function applySettings() {
    const st = app.shared.meta.settings || {};
    FX_OPTS.shake = st.screenShake !== false; FX_OPTS.reduced = !!st.reducedMotion;
    const ts = TEXT_STEPS.includes(st.textScale) ? st.textScale : (st.textSize === 'large' ? 125 : 100);
    app.textScale = ts / 100;
    const gm = cleanGraphics(st.graphics); if (app.perf.q.mode !== gm) app.perf.q.setMode(gm, performance.now()); // Settings > Graphics: Auto | High | Low
    app.quality = st.quality || 'high'; FX_OPTS.quality = app.quality === 'off' ? 0 : app.quality === 'low' ? 0.5 : 1;
    A11Y.applySettings(app);
    templates.sync(app); // the painted art preview: the Settings toggle, the page URL and the graphics tier decide (ui/preview.js), live
  }
  app.overlay = () => {
    applySettings();
    // decoded image memory: about 96 MB on phones (64 in the minimal tier), 192 MB on desktop; the least recently drawn images go first, every ~2 s
    assets.budget = (FX_OPTS.mobile ? 96 : 192) * 1048576 * (app.perf.q.tier === 'minimal' ? 0.66 : 1);
    // (not while a modal is open: the frozen screen draws nothing, so its pictures would look unused and be the first to go)
    if (!app.frozen && (app.frame & 127) === 0) assets.maintain(performance.now());
    if (artVer !== assets.ver || uiVer !== templates.ver) { artVer = assets.ver; uiVer = templates.ver; app.refreshBelow('look'); } // a picture arrived (or the painted preview changed): a frozen screen shows it too
    if (!app.frozen) TRANS.drawTransitions(app);
    drawPauseOverlay(app);
    drawInstallToast(app);
  };
  try { if (/[?&]perf\b/.test(location.search)) app.perf.debug = true; } catch (e) { /* no location */ }
  { const pt = app.preTick; app.preTick = (a, dt) => { cardFrame(); if (pt) pt(a, dt); }; } // the per-frame budget of card face builds (art/face_lod.js)
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
