// The Infirmary: every wound with its Treat or Rest decision, risks shown before you pay; convalescence; scars and what they cost.
// Sim in core/ext.js (wounds, treatments, scars). Opened with ctx.open('infirmary', {id?, onClose?}) or embedded as a World tab via render().
import { U, h, D, L, fmt, openScreen, sec, card, row, col, note, hint, kv, medal, pill, goldPill, empty, actions, meter, styleBadge } from './sk.js';
import { bodyIcon, scarChip, woundName, injectDepCss } from './wounds_ui.js';

const PLAN_NOTE = { rest: 'Heals a week faster every week; -3 morale a week. Scar risk x0.8.', pou: 'Cheap. 60% saves a week. Scar risk x0.85.', doc: 'Saves two weeks. Scar risk x0.45.', surg: 'Long wounds only. Saves a week, scar risk x0.12, but 1 in 4 goes wrong (+2 weeks, -10 morale).' };

function woundRow(ctx, g, wd, draw) {
  const S = ctx.S, lm = L(), P = D.WOUNDS[wd.part], odds = (k) => lm.treatOdds(S, g, wd, k);
  const sc = Math.round(lm.scarChance(S, g, wd) * 100);
  const top = h('div', 'ax-col', [
    h('div', 'ax-row ax-wrap ax-gap4', [h('span', 'ax-b', P.n), pill(`${wd.w} week${wd.w > 1 ? 's' : ''} left`, { tone: 'bad' }), pill(`Scar risk ${sc}%`, { tone: sc >= 25 ? 'warn' : '', ico: 'skull', tip: `Chance that this wound leaves a permanent scar (${D.SCARS[P.scar].n}) when it closes. Treatment, bed rest and a good Infirmary all lower it.`, tipTitle: 'Scar risk' }), wd.rest ? pill('Bed rest', { tone: 'good', ico: 'heart' }) : null, wd.tr ? pill({ pou: 'Poulticed', doc: 'Physician', surg: 'Operated' }[wd.tr], { tone: 'blue' }) : null]),
    meter(wd.w, Math.max(wd.w0, wd.w), '#e0644f'),
    h('div', 'dp-sub', `${P.d} Afterwards: ${lm.modText(P.weak).join(', ') || 'no lasting penalty'} for a week or two.`)]);
  const w = h('div', 'dp-w', [bodyIcon(wd.part, 30), top]);
  const plans = h('div', 'dp-plans');
  const bed = U.button({ label: wd.rest ? 'End bed rest' : 'Strict bed rest', sub: wd.rest ? 'Back to light duty' : `Free · scar ${odds('rest').scar}%`, icon: 'heart', variant: wd.rest ? 'gold' : 'bronze', onClick: () => { lm.setRest(S, g, wd, !wd.rest); ctx.save(); ctx.sfx('uiTap'); draw(); } });
  U.tooltip(bed, PLAN_NOTE.rest, { title: 'Strict bed rest' }); plans.append(bed);
  [['pou', 'Poultice'], ['doc', 'Physician'], ['surg', 'Surgeon']].forEach(([k, label]) => {
    const why = lm.treatWhy(S, g, wd, k), o = odds(k), cost = lm.treatCost(S, k);
    const b = U.button({ label: `${label} ${cost}g`, sub: k === 'pou' ? `60% -1 wk · scar ${o.scar}%` : k === 'doc' ? `-2 wk · scar ${o.scar}%` : `-1 wk · scar ${o.scar}% · 25% risk`, icon: k === 'surg' ? 'skull' : 'coin', variant: k === 'doc' ? 'gold' : 'bronze', disabled: !!why, onClick: () => {
      const r = lm.treatWound(S, g, wd, k); if (typeof r === 'string') { ctx.sfx('uiError'); return U.toast(r, { kind: 'bad' }); }
      ctx.save(); ctx.refresh(); ctx.sfx(r.bad ? 'uiError' : 'coin'); U.toast(`${g.name}: ${r.msg}`, { kind: r.bad ? 'bad' : r.ok ? 'good' : 'info' }); draw();
    } });
    U.tooltip(b, why || PLAN_NOTE[k], { title: label }); plans.append(b);
  });
  w.append(plans); return w;
}

/** body of the screen, also used as a tab of The World */
export function render(ctx, root, draw, arg) {
  injectDepCss(); root.classList.add('lx-dep');
  const S = ctx.S, lm = L(); S.glads.forEach((g) => lm.syncWounds(S, g));
  const hurt = S.glads.filter((g) => g.inj > 0), weak = S.glads.filter((g) => g.inj <= 0 && g.weak && g.weak.w > 0), scarred = S.glads.filter((g) => (g.scars || []).length);
  const il = lm.bfx(S, 'infirmary').l, rate = 1 + Math.floor(lm.bfx(S, 'infirmary').v) + lm.healBonus(S);
  root.append(card([row([medal('heart', 'dark big'), col([h('div', 'ax-name', 'The Infirmary'), note(`${il ? `Level ${il}. ` : 'No Infirmary yet. '}Wounds heal ${rate} week${rate > 1 ? 's' : ''} a week${lm.healBonus(S) ? ' (with the temple healers)' : ''}. Every injury is a body part now, and some leave a scar. Decide how to heal each one: rest costs time and morale, treatment costs gold and carries its own risk.`)], 'ax-grow')]),
    h('div', 'ax-row ax-wrap', [pill(`${hurt.length} wounded`, { tone: hurt.length ? 'bad' : 'good' }), pill(`${weak.length} recovering`, { tone: weak.length ? 'warn' : '' }), pill(`${scarred.reduce((a, g) => a + g.scars.length, 0)} scars in the ludus`, { tone: 'vio' }), goldPill(S.gold)])], 'gold'));
  root.append(sec(`The wounded (${hurt.length})`));
  if (!hurt.length) root.append(card([empty('heart', 'Nobody is hurt', 'Fighters who lose heavily, or fight at low health, can pick up wounds. They show up here.')]));
  hurt.forEach((g) => {
    const c = card([], ''); c.dataset.gid = g.id;
    c.append(row([ctx.portrait ? ctx.portrait(g, 52) : styleBadge(g.style, 48), col([h('div', 'ax-name', g.name), h('div', 'ax-sub', `${D.STYLES[g.style].n} · Level ${g.lvl} · Energy ${Math.round(g.en)} · Morale ${Math.round(g.mo)}`), (g.scars || []).length ? h('div', 'ax-row ax-wrap ax-gap4', g.scars.map(scarChip)) : null], 'ax-grow')]));
    g.wounds.slice().sort((a, b) => b.w - a.w).forEach((wd) => c.append(woundRow(ctx, g, wd, draw)));
    root.append(c);
  });
  if (weak.length) {
    root.append(sec('Recovering'));
    root.append(card([note('Healed, but not right yet. The penalty fades after a week or two. Entering a weak fighter in a big fight is a gamble.'), ...weak.map((g) => row([styleBadge(g.style, 38), col([h('div', 'ax-b', g.name), h('div', 'ax-sub', `${lm.modText(g.weak.mods).join(', ')} · ${g.weak.w} more week${g.weak.w > 1 ? 's' : ''}`)], 'ax-grow'), bodyIcon(g.weak.part, 22, '#f2c14e')]))]));
  }
  root.append(sec('Scars'));
  if (!scarred.length) root.append(card([note('No scars yet. A scar is permanent and never pure upside: a stiff arm hits softer but guards better, a lost eye hits harder but misjudges distance. Some are loved by the crowd.')]));
  scarred.forEach((g) => root.append(card([row([styleBadge(g.style, 38), col([h('div', 'ax-b', g.name), h('div', 'ax-row ax-wrap ax-gap4', g.scars.map(scarChip))], 'ax-grow')]), note(g.scars.map((id) => `${D.SCARS[id].n}: ${lm.modText(D.SCARS[id].mods).join(', ')}${D.SCARS[id].fame ? ` · +${Math.round(D.SCARS[id].fame * 100)}% fame` : ''}`).join('. ') + '.')])));
  const log = (S.woundLog || []).slice(-6).reverse();
  if (log.length) { root.append(sec('Recent')); root.append(card(log.map((e) => kv(`Week ${e.wk}: ${e.name}`, `${D.WOUNDS[e.part].n} healed${e.scar ? ', scar: ' + D.SCARS[e.scar].n : ''}`)))); }
  if (arg && arg.id) setTimeout(() => { const t = root.querySelector(`[data-gid="${arg.id}"]`); if (t && t.scrollIntoView) t.scrollIntoView({ block: 'start' }); }, 30);
}

export function open(ctx, arg) {
  arg = arg || {}; const scr = openScreen(ctx, { title: 'The Infirmary', wide: true, onClose: arg.onClose });
  const draw = () => scr.render((root) => render(ctx, root, draw, arg)); draw(); scr.m.el.dataset.tutSheet = 'infirmary'; return scr;
}

/** after the fights: a decision prompt for fresh serious wounds. Resolves when the player is done. First action is harmless (rest). */
export async function woundCall(ctx) {
  const S = ctx.S, lm = L(); if (!lm.syncWounds) return;
  const list = []; S.glads.forEach((g) => { lm.syncWounds(S, g); g.wounds.forEach((wd) => { if (!wd.asked && wd.w >= 2) list.push({ g, wd }); }); });
  S.glads.forEach((g) => (g.wounds || []).forEach((wd) => { wd.asked = true; }));
  if (!list.length) return;
  const body = h('div'); body.style.cssText = 'display:grid;gap:8px';
  body.append(h('p', '', 'The barracks is quiet except for the groaning. Left alone the wounds heal at the Infirmary rate, and some will leave a mark.'));
  list.slice(0, 5).forEach(({ g, wd }) => {
    const r = h('div', '', [bodyIcon(wd.part, 26, '#b5332a'), h('div', '', [h('b', '', `${g.name}: ${woundName(wd)}, ${wd.w} weeks`), h('div', '', `Scar risk ${Math.round(lm.scarChance(S, g, wd) * 100)}% if left alone, ${lm.treatOdds(S, g, wd, 'doc').scar}% with the physician.`)])]);
    r.style.cssText = 'display:flex;gap:10px;align-items:center;font:600 13px/18px system-ui,sans-serif;color:#33243a'; r.firstChild.style.color = '#6a3a3a'; body.append(r);
  });
  const v = await ctx.ask({ title: 'Wounds in the barracks', body, actions: [{ label: 'Let them rest', sub: 'Free. Heals at the Infirmary rate', value: 'rest', variant: 'bronze' }, { label: 'Treat them now', sub: 'Open the Infirmary', value: 'inf', variant: 'gold', icon: 'heart' }], dismiss: 'rest' });
  if (v === 'inf') await new Promise((res) => { open(ctx, { onClose: res }); });
}
