// ui_wardrobe.js: the Band tab cosmetics. Per hero a horizontal outfit strip (each outfit drawn on the hero) and the Stage skins strip
// (live board thumbnails). Buying goes through meta.buyOutfit / meta.buySkin, wearing through the same calls.
import { BOARD_X, BOARD_Y, BOARD_W, BOARD_H, WORLD_BY_ID } from './data_core.js';
import { SKIN_FALLBACK, SKIN_PRICES } from './data_meta.js';
import * as M from './meta.js';
import { t } from './i18n.js';
import { h, canvasOf, icon, toast, btn, AW } from './ui_core.js';

const NAME = { roxor: 'RoxorLoops', jasmin: 'Jasmin' };
const COLOR = { roxor: 'var(--green)', jasmin: 'var(--pink)' };

// one outfit card: the outfit on the hero, its name, and a state button (worn / wear / buy price / locked requirement)
function outfitCard(app, who, o, rerender) {
  const p = app.profile;
  const cls = 'ward-card' + (o.worn ? ' worn' : '') + (o.locked ? ' locked' : '');
  const cv = canvasOf(86, 112, (ctx) => { AW.drawHero(ctx, who, 43, 106, 100, { t: 0.4, outfit: o.id, pose: 'idle' }); });
  const act = (label, cb, kind) => btn(label, cb, kind + ' small ward-act');
  let state;
  if (o.worn) state = h('div', { class: 'ward-state worn' }, icon('check', 18, '#43b94a'), t('ward.worn', 'Worn'));
  else if (o.owned) state = act(t('ward.wear', 'Wear'), () => { M.buyOutfit(p, who, o.id); app.audio.play('ui_click'); app.save(); rerender(); }, 'green');
  else if (o.locked) {
    const how = o.unlock && o.unlock.world !== undefined ? t('ward.clear_stage', 'Clear {stage}', { stage: (WORLD_BY_ID[o.unlock.world] || {}).name || o.unlock.world }) : t('ward.reach_endless', 'Reach Endless wave {n}', { n: o.unlock && o.unlock.endless });
    state = h('div', { class: 'ward-state lock' }, icon('lock', 16, '#6b6477'), how);
  }
  else {
    const can = p.diamonds >= o.price;
    state = act([icon('diamond', 18), o.price], () => {
      const r = M.buyOutfit(p, who, o.id);
      if (!r.ok) { app.audio.play('error'); toast(t('ward.need_outfit', 'Need {price} diamonds for the {name}.', { price: o.price, name: o.name })); return; }
      app.audio.play('reveal_rare'); app.audio.play('diamond', { vol: 0.5 }); app.save(); rerender();
    }, can ? 'gold' : 'dark off');
  }
  return h('div', { class: cls, 'data-outfit': who + ':' + o.id, title: o.desc }, cv, h('div', { class: 'ward-name' }, o.name), state);
}

export function wardrobeSection(app, who, rerender) {
  const p = app.profile;
  const list = M.outfitList(p, who);
  const have = list.filter((o) => o.owned).length;
  return h('div', { class: 'ward', 'data-ward': who },
    h('div', { class: 'row ward-head' }, h('h3', { style: 'margin:0;color:' + COLOR[who] }, t('ward.title', "{name}'s wardrobe", { name: NAME[who] })), h('span', { class: 'pill' }, have + '/' + list.length)),
    h('div', { class: 'ward-strip' }, list.map((o) => outfitCard(app, who, o, rerender))));
}

// ---- board skins
function skinNames() { try { return AW.BOARD_SKINS || null; } catch (e) { return null; } }
export function skinThumb(id, w = 84, hgt = 118) {
  return canvasOf(w, hgt, (ctx, t) => {
    const k = Math.min(w / BOARD_W, hgt / BOARD_H);
    ctx.save(); ctx.translate((w - BOARD_W * k) / 2, (hgt - BOARD_H * k) / 2); ctx.scale(k, k); ctx.translate(-BOARD_X, -BOARD_Y);
    ctx.beginPath(); ctx.rect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H); ctx.clip();
    try { AW.drawBoard(ctx, 'garage', 'garage', 0.3, { skin: id }); } catch (e) { /* the art may not know this skin yet */ }
    ctx.restore();
  });
}
export function skinsSection(app, rerender) {
  const p = app.profile;
  const names = skinNames();
  const list = M.skinList(p, names);
  return h('div', { class: 'ward skins' },
    h('div', { class: 'row ward-head' }, h('h3', { style: 'margin:0' }, t('ward.skins', 'Stage skins')), h('span', { class: 'pill' }, p.skins.owned.length + '/' + list.length)),
    h('div', { class: 'sub', style: 'margin:0 0 6px;font-size:15px' }, t('ward.skins_hint', 'How your battle board looks. Pure style, no effect on play.')),
    h('div', { class: 'ward-strip' }, list.map((s) => {
      let state;
      if (s.worn) state = h('div', { class: 'ward-state worn' }, icon('check', 18, '#43b94a'), t('ward.on', 'On'));
      else if (s.owned) state = btn(t('ward.use', 'Use'), () => { M.equipSkin(p, s.id); app.audio.play('ui_click'); app.applySettings(); app.save(); rerender(); }, 'green small ward-act');
      else {
        const can = p.diamonds >= s.price;
        state = btn([icon('diamond', 18), s.price], () => {
          const r = M.buySkin(p, s.id);
          if (!r.ok) { app.audio.play('error'); toast(t('ward.need_skin', 'Need {price} diamonds for {name}.', { price: s.price, name: s.name })); return; }
          M.equipSkin(p, s.id); app.audio.play('reveal_rare'); app.applySettings(); app.save(); rerender();
        }, (can ? 'gold' : 'dark off') + ' small ward-act');
      }
      return h('div', { class: 'ward-card skin' + (s.worn ? ' worn' : ''), 'data-skin': s.id, title: s.desc }, skinThumb(s.id), h('div', { class: 'ward-name' }, s.name), state);
    })));
}
export { SKIN_FALLBACK, SKIN_PRICES };
