// Recruit screen: volunteers at the gate (S.recruits), hire through LM.hire, reroll for 30 gold. arg {first:true} = first-fighter framing.
import { h, U, D, L, fmt, portrait, injectCss, addCss, chip, sec, statTag, wide, empty, note } from './ui_common.js';

const CSS = `
.rc-hero{text-align:center;display:grid;gap:6px;justify-items:center;padding:6px 4px 4px}
.rc-hero .lx-laurel{width:140px;height:28px;color:#b8803a}
.rc-hero h2{margin:0;font:900 clamp(22px,6.4vw,30px)/1.1 var(--lx-serif);letter-spacing:.06em;text-transform:uppercase;color:#5a1f5e;text-shadow:0 1px 0 rgba(255,240,200,.8)}
.rc-hero p{margin:0;max-width:46ch;font:500 14px/20px var(--lx-sans);color:#4a3550;overflow-wrap:anywhere}
.rc-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,270px),1fr));margin-top:10px}
.rc-card{display:grid;gap:9px;align-content:start;transition:transform .2s var(--lx-ease),opacity .25s}
.rc-card.gone{opacity:0;transform:scale(.94) translateY(-6px)}
.rc-head{display:flex;gap:12px;align-items:center;min-width:0}
.rc-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:6px}
.lm-stag{display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;gap:0 6px;align-items:center;padding:5px 7px;border-radius:8px;background:rgba(255,255,255,.55);border-left:4px solid var(--sc);box-shadow:inset 0 0 0 1px rgba(122,82,34,.22)}
.lm-stag-n{font:800 10.5px var(--lx-serif);letter-spacing:.1em;color:#7a5222}
.lm-stag b{font:900 16px/18px var(--lx-sans);color:#2a1a30;text-align:right}
.lm-stag .lm-pips{grid-column:1/3}
.rc-trait{font:600 12px/17px var(--lx-sans);color:#4a3550;overflow-wrap:anywhere}
.rc-buy{display:grid;gap:6px}
.rc-price{display:inline-flex;align-items:center;gap:6px;font:900 20px var(--lx-sans);color:#7a5222}
.rc-price.poor{color:#9d2a20}
.rc-gold{display:flex;justify-content:center;gap:8px;flex-wrap:wrap}
`;

export function open(ctx, arg) {
  injectCss(); addCss(CSS);
  const S = ctx.S, lm = L(), d = D(), first = !!(arg && arg.first);
  lm.ensureShops(S);
  const body = h('div', 'lm-sheetbody');
  let dead = false;
  const reroll = U.button({ label: 'New faces', icon: 'coin', variant: 'ghost', block: true, sub: '30 gold for three new volunteers', onClick: () => doReroll() });
  const m = wide(ctx.sheet({ title: first ? 'Your first fighter' : 'Volunteers', body, actions: [reroll], onClose: () => { dead = true; } }), 980);
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
    if (first) { ctx.sfx('levelUp'); m.close(); return; }
    card.classList.add('gone'); setTimeout(() => { if (!dead) render(); }, 240);
  }

  function card(g) {
    const st = d.STYLES[g.style], T = d.TRAITS[g.trait], cap = lm.rosterCap(S);
    const full = S.glads.length >= cap, short = S.gold < g.cost, bad = full || short;
    const c = h('div', 'lm-card rc-card');
    const sc = chip(st.n, 'bronze'); sc.style.background = st.c; U.tooltip(sc, `${st.role}. ${st.d}`, { title: st.n });
    const hasStyle = S.glads.some((x) => x.style === g.style);
    c.append(h('div', 'rc-head', [portrait(ctx, g, 72), h('div', 'lm-grow', [h('div', 'lm-name', [g.name, g.nick ? h('small', '', ' ' + g.nick) : null]), h('div', 'lm-chips', [sc, chip('Lv ' + g.lvl, 'gold')]), h('div', '', U.stars(lm.stars(g), 5))])]));
    const tags = h('div', 'lm-chips');
    if (S.glads.length && !hasStyle) tags.append(chip('New style for you', 'green', 'Your ludus has no ' + st.n + ' yet. A varied roster covers more matchups.'));
    const sd = lm.storyDef(g); if (sd) tags.append(chip(sd.n, 'grey', sd.text));
    if (tags.childNodes.length) c.append(tags);
    const stats = h('div', 'rc-stats'); d.STATS.forEach((s) => stats.append(statTag(g, s))); c.append(stats);
    c.append(h('div', 'rc-trait', [h('b', '', T.n + ': '), T.d]));
    c.append(h('div', 'rc-trait', [h('b', '', 'Ultimate: '), lm.ultsOf(g).map((u) => d.ULTS[u].n).join(', '), '. ', h('b', '', 'Techniques: '), g.techs.map((t) => d.TECHS[t].n).join(', ')]));
    const buy = h('div', 'rc-buy');
    const price = h('div', 'rc-price lm-num' + (short ? ' poor' : ''), [U.icon('coin', 22), fmt(g.cost)]);
    const btn = U.button({ label: 'Hire', icon: 'check', variant: 'gold', block: true, disabled: bad, sub: full ? 'Barracks full' : short ? `Need ${fmt(g.cost - S.gold)} more gold` : undefined, onClick: () => hire(g, c) });
    btn.setAttribute('aria-label', `Hire ${g.name} for ${g.cost} gold`);
    buy.append(h('div', 'lm-row', [price, h('span', 'lm-grow')]), btn); c.append(buy);
    return c;
  }

  function render() {
    if (dead) return;
    const cap = lm.rosterCap(S);
    body.replaceChildren();
    if (first) {
      body.append(h('div', 'rc-hero', [U.laurel(), h('h2', '', 'Choose your first fighter'), h('p', '', 'Free citizens queue at the gate hoping for bread, glory and a bed. Pick the one who will carry your ludus. Look at their stats, talent pips and trait; you can hire more later.')]));
    } else {
      body.append(note(`Free citizens queue at the gate every week. ${S.glads.length}/${cap} beds used.`));
    }
    body.append(h('div', 'rc-gold', [h('span', 'lx-counter lx-c-gold', [U.icon('coin', 20), h('b', 'lm-num', fmt(S.gold))]), chip(`${S.glads.length}/${cap} fighters`, S.glads.length >= cap ? 'red' : 'bronze', 'Beds used in the barracks')]));
    const list = S.recruits || [];
    if (!list.length) body.append(empty('The gate is quiet. Try new faces.'));
    else body.append(h('div', 'rc-grid', list.map(card)));
    body.append(note('Talent pips show how fast each stat grows: three pips is a natural. Stars sum up overall talent.'));
    reroll.disabled = S.gold < 30;
  }
  render();
  return m;
}
