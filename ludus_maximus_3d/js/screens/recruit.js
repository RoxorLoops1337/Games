// Recruit screen: volunteers at the gate (S.recruits), hire through LM.hire, reroll for 30 gold. arg {first:true} = first-fighter framing.
import { h, U, D, L, fmt, portrait, injectCss, addCss, clearTips, chip, sec, statTag, wide, empty, note } from './ui_common.js';

const CSS = `
.rc-hero{text-align:center;display:grid;gap:4px;justify-items:center;padding:2px 4px 2px}
.rc-hero .lx-laurel{width:120px;height:22px;color:#b8803a}
.rc-hero p{margin:0;max-width:52ch;font:500 14px/20px var(--lx-sans);color:#4a3550}
.rc-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));margin-top:8px}
.rc-card{display:grid;gap:8px;align-content:start;transition:transform .2s var(--lx-ease),opacity .25s}
.rc-card.gone{opacity:0;transform:scale(.94) translateY(-6px)}
.rc-head{display:flex;gap:10px;align-items:center;min-width:0}
.rc-buy{flex:none;display:grid;gap:4px;justify-items:end;align-content:center}
.rc-price{display:inline-flex;align-items:center;gap:5px;font:900 18px/1 var(--lx-sans);color:#7a5222}
.rc-price.poor{color:#9d2a20}
.rc-hire{min-width:96px;min-height:44px;padding:6px 12px}
.rc-why{font:700 11px/1.2 var(--lx-sans);color:#9d2a20;text-align:right;max-width:104px}
.rc-stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px}
.lm-stag{display:grid;justify-items:center;gap:1px;padding:4px 2px 5px;border-radius:8px;background:rgba(255,255,255,.55);border-top:3px solid var(--sc);box-shadow:inset 0 0 0 1px rgba(122,82,34,.22);min-width:0}
.lm-stag-n{font:800 10px/1.1 var(--lx-serif);letter-spacing:.08em;color:#7a5222}
.lm-stag b{font:900 16px/18px var(--lx-sans);color:#2a1a30}
.rc-head .lm-name{white-space:normal;overflow:visible;text-overflow:clip;overflow-wrap:break-word}.rc-head .lm-name small{display:block}
.rc-trait{font:600 12px/16px var(--lx-sans);color:#4a3550;overflow-wrap:break-word}
.rc-gold{display:flex;justify-content:center;gap:8px;flex-wrap:wrap}
.rc-foot{margin:6px 0 0}
.rc-first .lx-sheet-scroll{scroll-padding-top:4px}
@media (max-height:760px){.rc-hero .lx-laurel{display:none}.rc-hero p{font-size:13px;line-height:18px}.rc-foot{display:none}.rc-card{padding:8px;gap:6px}}
@media (min-width:900px){.rc-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
`;

export function open(ctx, arg) {
  injectCss(); addCss(CSS);
  const S = ctx.S, lm = L(), d = D(), first = !!(arg && arg.first);
  lm.ensureShops(S);
  const body = h('div', 'lm-sheetbody');
  let dead = false;
  const reroll = U.button({ label: 'New faces for 30 gold', icon: 'coin', variant: 'ghost', onClick: () => doReroll() });
  const acts = [reroll];
  // The first-run sheet CAN be closed: nothing forces a hire. The consequence is stated on the button, in a toast, and the hub's main button turns into "Hire your first fighter".
  if (first) acts.push(U.button({ label: 'Decide later', icon: 'roster', variant: 'bronze', onClick: () => m.close() }));
  const m = wide(ctx.sheet({ title: first ? 'Choose your first fighter' : 'Volunteers', body, actions: acts, tut: 'recruit', cls: first ? 'rc-first' : '', onClose: () => {
    dead = true;
    if (first && !S.glads.length) { ctx.game._recruitLater = true; ctx.toast('No fighter yet. Tap "Hire your first fighter" or open Roster, then Recruit, whenever you are ready.', { kind: 'info', ms: 5200 }); try { ctx.game.refresh(); } catch (e) { /* hub not ready */ } }
  } }), 980);
  const commit = () => { ctx.save(); ctx.refresh(); };

  function doReroll() {
    if (S.gold < 30) { ctx.toast('Not enough gold', { kind: 'bad' }); ctx.sfx('uiError'); return; }
    S.gold -= 30; S.recruits = null; lm.ensureShops(S); ctx.sfx('coin'); commit(); render();
  }

  function hire(g, card) {
    const e = lm.hire(S, g);
    if (e) { ctx.toast(e, { kind: 'bad' }); ctx.sfx('uiError'); return; }
    ctx.sfx('coin'); commit();
    ctx.toast(`${g.name} joined your ludus!`, { kind: 'good', ico: 'check' });
    ctx.game._recruitLater = false;
    if (first) { ctx.sfx('levelUp'); m.close(); return; }
    card.classList.add('gone'); setTimeout(() => { if (!dead) render(); }, 240);
  }

  function card(g) {
    const st = d.STYLES[g.style], T = d.TRAITS[g.trait], cap = lm.rosterCap(S);
    const full = S.glads.length >= cap, short = S.gold < g.cost, bad = full || short;
    const c = h('div', 'lm-card rc-card');
    const sc = chip(st.n, 'bronze'); sc.style.background = st.c; U.tooltip(sc, `${st.role}. ${st.d}`, { title: st.n });
    const hasStyle = S.glads.some((x) => x.style === g.style);
    const buy = h('div', 'rc-buy');
    const price = h('div', 'rc-price lm-num' + (short ? ' poor' : ''), [U.icon('coin', 20), fmt(g.cost)]);
    const btn = U.button({ label: 'Hire', icon: 'check', variant: 'gold', disabled: bad, onClick: () => hire(g, c) });
    btn.setAttribute('aria-label', `Hire ${g.name} for ${g.cost} gold`);
    btn.classList.add('rc-hire'); btn.dataset.tut = 'hire'; buy.append(price, btn);
    if (bad) buy.append(h('div', 'rc-why', full ? 'Barracks full' : `Need ${fmt(g.cost - S.gold)} more`));
    c.append(h('div', 'rc-head', [portrait(ctx, g, 64), h('div', 'lm-grow', [h('div', 'lm-name', [g.name, g.nick ? h('small', '', ' ' + g.nick) : null]), h('div', 'lm-chips', [sc, chip('Lv ' + g.lvl, 'gold')]), h('div', '', U.stars(lm.stars(g), 5))]), buy]));
    const tags = h('div', 'lm-chips');
    if (S.glads.length && !hasStyle) tags.append(chip('New style for you', 'green', 'Your ludus has no ' + st.n + ' yet. A varied roster covers more matchups.'));
    const sd = lm.storyDef(g); if (sd) tags.append(chip(sd.n, 'grey', sd.text));
    if (tags.childNodes.length) c.append(tags);
    const stats = h('div', 'rc-stats'); d.STATS.forEach((s) => stats.append(statTag(g, s))); c.append(stats);
    c.append(h('div', 'rc-trait', [h('b', '', T.n + ': '), T.d]));
    c.append(h('div', 'rc-trait', [h('b', '', 'Ultimate: '), lm.ultsOf(g).map((u) => d.ULTS[u].n).join(', '), '. ', h('b', '', 'Techniques: '), g.techs.map((t) => d.TECHS[t].n).join(', ')]));
    return c;
  }

  function render() {
    if (dead) return;
    const cap = lm.rosterCap(S);
    clearTips(); body.replaceChildren();
    if (first) {
      body.append(h('div', 'rc-hero', [U.laurel(), h('p', '', 'Three citizens wait at the gate hoping for bread, glory and a bed. Check their stats, talent pips and trait, then pick the one who will carry your ludus. You can hire more later.')]));
    } else {
      body.append(note(`Free citizens queue at the gate every week. ${S.glads.length}/${cap} beds used.`));
    }
    body.append(h('div', 'rc-gold', [h('span', 'lx-counter lx-c-gold', [U.icon('coin', 20), h('b', 'lm-num', fmt(S.gold))]), chip(`${S.glads.length}/${cap} fighters`, S.glads.length >= cap ? 'red' : 'bronze', 'Beds used in the barracks')]));
    const list = S.recruits || [];
    if (!list.length) body.append(U.emptyState({ icon: 'roster', title: 'The gate is quiet', text: 'No citizens are waiting right now. New volunteers arrive every week, or you can pay to call for fresh faces.', action: { label: 'New faces for 30 gold', icon: 'coin', onClick: () => doReroll() } }));
    else body.append(h('div', 'rc-grid', list.map(card)));
    { const f = note('Talent pips show how fast each stat grows: three pips is a natural. Stars sum up overall talent.'); f.classList.add('rc-foot'); body.append(f); }
    reroll.disabled = S.gold < 30;
  }
  render();
  return m;
}
