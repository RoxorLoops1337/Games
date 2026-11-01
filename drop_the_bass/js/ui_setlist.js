// ui_setlist.js: the pre-run "Setlist" sheet. Hero move picker, run modifiers with a risk and reward readout, difficulty and the Start button.
// Opened by app.requestRun(cfg) from every Play button. A remembered "skip this screen" toggle (settings.skipSetlist) goes straight to the run.
import { WORLD_BY_ID } from './data_core.js';
import { HERO_ABILITIES, RUN_MODIFIERS, RUN_MODIFIER_BY_ID, MAX_RUN_MODIFIERS } from './data_depth.js';
import * as M from './meta.js';
import { h, canvasOf, icon, modal, toast, btn, AW } from './ui_core.js';

const WHO = [['roxor', 'RoxorLoops', 'var(--green)'], ['jasmin', 'Jasmin', 'var(--pink)']];
const pct = (v) => (v > 1 ? '+' + Math.round((v - 1) * 100) + '%' : v < 1 ? '-' + Math.round((1 - v) * 100) + '%' : '0%');
const times = (v) => 'x' + (Math.round(v * 100) / 100);
export const modeLabel = (cfg) => (cfg.mode === 'daily' ? (cfg.weekly ? 'Weekly Gig' : 'Daily Challenge') : cfg.mode === 'endless' ? 'Endless' : cfg.mode === 'rush' ? 'Boss Rush' : 'Story' + (cfg.encore ? ', Encore ' + cfg.encore : ''));
// flame icons for a number of flames (0 shows a calm dash)
export function flames(n, px = 18) { return h('span', { class: 'flames', 'aria-label': n + ' flames' }, n > 0 ? Array.from({ length: Math.min(5, n) }, () => icon('fire', px, '#ff7a1a')) : h('span', { class: 'sub' }, '-')); }
export const riskName = (n) => (n <= 0 ? 'No risk' : n <= 2 ? 'Spicy' : n <= 4 ? 'Hot' : 'Inferno');

export function setlistSheet(app, cfg) {
  const p = app.profile;
  const fixed = cfg.mode === 'daily';   // Daily and the Weekly Gig: same run for everyone, no modifiers, always Normal
  const state = { focus: null };
  const body = h('div', { class: 'setlist' });
  const m = modal(body);

  const heroCard = ([who, name, col]) => {
    const rows = M.heroAbilityList(p, who).map((a) => {
      const cls = 'sl-ab' + (a.chosen ? ' on' : '') + (a.unlocked ? '' : ' locked');
      return h('button', { class: cls, 'aria-pressed': a.chosen ? 'true' : 'false', 'data-ability': a.id, onclick: () => {
        const r = M.setHeroAbility(p, who, a.id);
        if (r.ok) { app.audio.play('ui_click'); app.save(); draw(); } else { app.audio.play('error'); toast(a.name + ' needs ' + name + ' at level ' + a.unlockLv + '. Level up in the Studio.'); }
      } }, h('span', { class: 'sl-abn' }, a.unlocked ? icon(a.chosen ? 'check' : 'play', 18, a.chosen ? '#43b94a' : '#6b6477') : icon('lock', 18, '#6b6477'), a.name),
      h('span', { class: 'sl-abd' }, a.unlocked ? a.desc : 'Hero level ' + a.unlockLv + ' needed (now ' + p.heroLv[who] + ')'));
    });
    return h('div', { class: 'sl-hero', style: 'border-color:' + col },
      canvasOf(64, 92, (ctx, t) => AW.drawHero(ctx, who, 32, 88, 84, { t, outfit: p.outfits.worn[who], pose: 'idle' }), { live: true }),
      h('div', { class: 'grow' }, h('div', { class: 'sl-who', style: 'color:' + col }, name + '  Lv ' + p.heroLv[who]), h('div', { class: 'sl-abs' }, rows)));
  };

  const modPanel = () => {
    if (fixed) {
      return h('div', { class: 'card sl-lock' }, icon('lock', 34), h('div', { class: 'grow' }, h('b', null, 'Modifiers locked'),
        h('div', { class: 'sub' }, (cfg.weekly ? 'The Weekly Gig' : 'The Daily Challenge') + ' is the same for everyone, so there are no modifiers and the difficulty is Normal.')));
    }
    const on = M.modifiersOf(p);
    const mul = M.modMulOf(on);
    const total = on.reduce((a, id) => a + M.modFlames(id), 0);
    const grid = h('div', { class: 'sl-mods' });
    for (const mod of RUN_MODIFIERS) {
      const sel = on.includes(mod.id);
      grid.append(h('button', { class: 'sl-mod' + (sel ? ' on' : ''), 'aria-pressed': sel ? 'true' : 'false', 'data-mod': mod.id, onclick: () => {
        const r = M.toggleModifier(p, mod.id);
        state.focus = mod.id;
        if (!r.ok) { app.audio.play('error'); toast('Up to ' + MAX_RUN_MODIFIERS + ' modifiers per run. Tap one to turn it off.'); } else app.audio.play('ui_click');
        app.save(); draw();
      } }, h('span', { class: 'sl-mi' }, icon(mod.glyph, 24, sel ? '#43b94a' : '#2b2733')), h('span', { class: 'sl-mn' }, mod.name), flames(M.modFlames(mod.id), 14)));
    }
    const fm = state.focus && RUN_MODIFIER_BY_ID[state.focus];
    const read = h('div', { class: 'sl-read' },
      fm ? h('div', { class: 'sl-fd' }, h('b', null, fm.name + ': '), fm.desc, h('div', { class: 'sub' }, 'Reward ' + pct(fm.mul.records) + ' Records and Fans, ' + pct(fm.mul.diamonds) + ' diamonds.')) : h('div', { class: 'sub' }, 'Pick up to ' + MAX_RUN_MODIFIERS + '. Each one makes the run harder and pays more. Tap one to read it.'),
      h('div', { class: 'sl-sum' },
        h('div', null, h('span', { class: 'sub' }, 'Risk '), flames(total, 18), h('b', null, ' ' + riskName(total))),
        h('div', null, h('span', { class: 'sub' }, 'Payout '), h('b', { class: 'sl-pay' }, on.length ? times(mul.records) + ' Records, ' + times(mul.fans) + ' Fans, ' + times(mul.diamonds) + ' diamonds' : 'x1 (no modifiers)'))));
    const pin = h('div', { class: 'toggle sl-pin' }, 'Keep these for next runs', btn(p.modPin ? 'ON' : 'OFF', () => { p.modPin = !p.modPin; app.save(); draw(); }, p.modPin ? 'green small' : 'dark small'));
    return h('div', null, grid, read, pin);
  };

  const diff = () => {
    const cur = fixed ? 'normal' : M.difficultyOf(p);
    const seg = h('div', { class: 'seg diff' }, M.DIFFICULTY_IDS.map((id) => h('button', { class: cur === id ? 'on' : '', disabled: fixed ? true : null, 'data-diff': id, onclick: () => { if (cur !== id) { p.settings.difficulty = id; app.audio.play('ui_click'); app.save(); draw(); } } }, M.difficultyInfo(id).name)));
    return h('div', null, seg, h('div', { class: 'sub', style: 'text-align:center;font-size:15px' }, M.difficultyInfo(cur).desc));
  };

  function draw() {
    const w = WORLD_BY_ID[cfg.world];
    const sc = m.box.scrollTop;
    body.replaceChildren(
      h('h2', null, 'Setlist'),
      h('div', { class: 'sub', style: 'text-align:center;margin:-6px 0 8px' }, (w ? w.name : '') + '  |  ' + modeLabel(cfg)),
      h('h3', { class: 'sl-h' }, 'Hero moves'), WHO.map(heroCard),
      h('h3', { class: 'sl-h' }, 'Run modifiers'), modPanel(),
      h('h3', { class: 'sl-h' }, 'Difficulty'), diff(),
      h('div', { class: 'sl-foot' },
        h('div', { class: 'toggle sl-skip' }, 'Skip this screen next time', btn(p.settings.skipSetlist ? 'ON' : 'OFF', () => { p.settings.skipSetlist = !p.settings.skipSetlist; app.save(); draw(); }, p.settings.skipSetlist ? 'green small' : 'dark small')),
        h('div', { class: 'btnrow' }, btn('Back', () => m.close(), 'dark'), btn([icon('play', 26, '#fff'), 'START'], () => { m.close(); app.audio.play('ui_open'); app.startRun(cfg); }, 'green big sl-start', { 'data-start': '1' }))));
    m.box.scrollTop = sc;
  }
  draw();
  app.audio.play('ui_open');
  return m;
}
