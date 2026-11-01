// ui_setlist.js: the pre-run "Setlist" sheet. Hero move picker, run modifiers with a risk and reward readout, difficulty and the Start button.
// Opened by app.requestRun(cfg) from every Play button. A remembered "skip this screen" toggle (settings.skipSetlist) goes straight to the run.
import { WORLD_BY_ID } from './data_core.js';
import { HERO_ABILITIES, RUN_MODIFIERS, RUN_MODIFIER_BY_ID, MAX_RUN_MODIFIERS } from './data_depth.js';
import * as M from './meta.js';
import { t, tn } from './i18n.js';
import { h, canvasOf, icon, modal, toast, btn, AW } from './ui_core.js';

const WHO = [['roxor', 'RoxorLoops', 'var(--green)'], ['jasmin', 'Jasmin', 'var(--pink)']];
const pct = (v) => (v > 1 ? '+' + Math.round((v - 1) * 100) + '%' : v < 1 ? '-' + Math.round((1 - v) * 100) + '%' : '0%');
const times = (v) => 'x' + (Math.round(v * 100) / 100);
export const modeLabel = (cfg) => (cfg.mode === 'daily' ? (cfg.weekly ? t('mode.weekly', 'Weekly Gig') : t('mode.daily', 'Daily Challenge')) : cfg.mode === 'endless' ? t('mode.endless', 'Endless') : cfg.mode === 'rush' ? t('mode.rush', 'Boss Rush') : cfg.encore ? t('mode.story_encore', 'Story, Encore {n}', { n: cfg.encore }) : t('mode.story', 'Story'));
// flame icons for a number of flames (0 shows a calm dash)
export function flames(n, px = 18) { return h('span', { class: 'flames', 'aria-label': tn('setlist.flames_aria', n, '{n} flame', '{n} flames') }, n > 0 ? Array.from({ length: Math.min(5, n) }, () => icon('fire', px, '#ff7a1a')) : h('span', { class: 'sub' }, '-')); }
export const riskName = (n) => (n <= 0 ? t('risk.none', 'No risk') : n <= 2 ? t('risk.spicy', 'Spicy') : n <= 4 ? t('risk.hot', 'Hot') : t('risk.inferno', 'Inferno'));

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
        if (r.ok) { app.audio.play('ui_click'); app.save(); draw(); } else { app.audio.play('error'); toast(t('setlist.ability_locked', '{ability} needs {hero} at level {lv}. Level up in the Studio.', { ability: a.name, hero: name, lv: a.unlockLv })); }
      } }, h('span', { class: 'sl-abn' }, a.unlocked ? icon(a.chosen ? 'check' : 'play', 18, a.chosen ? '#43b94a' : '#6b6477') : icon('lock', 18, '#6b6477'), a.name),
      h('span', { class: 'sl-abd' }, a.unlocked ? a.desc : t('setlist.hero_level_needed', 'Hero level {lv} needed (now {now})', { lv: a.unlockLv, now: p.heroLv[who] })));
    });
    return h('div', { class: 'sl-hero', style: 'border-color:' + col },
      canvasOf(64, 92, (ctx, t) => AW.drawHero(ctx, who, 32, 88, 84, { t, outfit: p.outfits.worn[who], pose: 'idle' }), { live: true }),
      h('div', { class: 'grow' }, h('div', { class: 'sl-who', style: 'color:' + col }, t('setlist.hero_lv', '{name}  Lv {lv}', { name, lv: p.heroLv[who] })), h('div', { class: 'sl-abs' }, rows)));
  };

  const modPanel = () => {
    if (fixed) {
      return h('div', { class: 'card sl-lock' }, icon('lock', 34), h('div', { class: 'grow' }, h('b', null, t('setlist.mods_locked', 'Modifiers locked')),
        h('div', { class: 'sub' }, cfg.weekly ? t('setlist.locked_weekly', 'The Weekly Gig is the same for everyone, so there are no modifiers and the difficulty is Normal.') : t('setlist.locked_daily', 'The Daily Challenge is the same for everyone, so there are no modifiers and the difficulty is Normal.'))));
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
        if (!r.ok) { app.audio.play('error'); toast(t('setlist.mods_max', 'Up to {max} modifiers per run. Tap one to turn it off.', { max: MAX_RUN_MODIFIERS })); } else app.audio.play('ui_click');
        app.save(); draw();
      } }, h('span', { class: 'sl-mi' }, icon(mod.glyph, 24, sel ? '#43b94a' : '#2b2733')), h('span', { class: 'sl-mn' }, mod.name), flames(M.modFlames(mod.id), 14)));
    }
    const fm = state.focus && RUN_MODIFIER_BY_ID[state.focus];
    const read = h('div', { class: 'sl-read' },
      fm ? h('div', { class: 'sl-fd' }, h('b', null, fm.name + ': '), fm.desc, h('div', { class: 'sub' }, t('setlist.reward', 'Reward {rec} Records and Fans, {dia} diamonds.', { rec: pct(fm.mul.records), dia: pct(fm.mul.diamonds) }))) : h('div', { class: 'sub' }, t('setlist.mods_hint', 'Pick up to {max}. Each one makes the run harder and pays more. Tap one to read it.', { max: MAX_RUN_MODIFIERS })),
      h('div', { class: 'sl-sum' },
        h('div', null, h('span', { class: 'sub' }, t('setlist.risk', 'Risk') + ' '), flames(total, 18), h('b', null, ' ' + riskName(total))),
        h('div', null, h('span', { class: 'sub' }, t('setlist.payout', 'Payout') + ' '), h('b', { class: 'sl-pay' }, on.length ? t('setlist.payout_val', '{rec} Records, {fans} Fans, {dia} diamonds', { rec: times(mul.records), fans: times(mul.fans), dia: times(mul.diamonds) }) : t('setlist.payout_none', 'x1 (no modifiers)')))));
    const pin = h('div', { class: 'toggle sl-pin' }, t('setlist.keep_mods', 'Keep these for next runs'), btn(p.modPin ? t('common.on', 'ON') : t('common.off', 'OFF'), () => { p.modPin = !p.modPin; app.save(); draw(); }, p.modPin ? 'green small' : 'dark small'));
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
      h('h2', null, t('setlist.title', 'Setlist')),
      h('div', { class: 'sub', style: 'text-align:center;margin:-6px 0 8px' }, (w ? w.name : '') + '  |  ' + modeLabel(cfg)),
      h('h3', { class: 'sl-h' }, t('setlist.hero_moves', 'Hero moves')), WHO.map(heroCard),
      h('h3', { class: 'sl-h' }, t('setlist.run_modifiers', 'Run modifiers')), modPanel(),
      h('h3', { class: 'sl-h' }, t('setlist.difficulty', 'Difficulty')), diff(),
      h('div', { class: 'sl-foot' },
        h('div', { class: 'toggle sl-skip' }, t('setlist.skip', 'Skip this screen next time'), btn(p.settings.skipSetlist ? t('common.on', 'ON') : t('common.off', 'OFF'), () => { p.settings.skipSetlist = !p.settings.skipSetlist; app.save(); draw(); }, p.settings.skipSetlist ? 'green small' : 'dark small')),
        h('div', { class: 'btnrow' }, btn(t('common.back', 'Back'), () => m.close(), 'dark'), btn([icon('play', 26, '#fff'), t('setlist.start', 'START')], () => { m.close(); app.audio.play('ui_open'); app.startRun(cfg); }, 'green big sl-start', { 'data-start': '1' }))));
    m.box.scrollTop = sc;
  }
  draw();
  app.audio.play('ui_open');
  return m;
}
