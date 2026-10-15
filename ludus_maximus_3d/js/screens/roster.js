// Roster screen: every fighter at a glance, quick weekly activity assignment, planner presets, kitchen menu, recruit entry.
import { h, U, D, L, fmt, portrait, injectCss, addCss, clearTips, chip, sec, wide, actDesc, activityGrid, empty, note } from './ui_common.js';
// FIGHTERS: barracks web summary + origin / age / quirk chips on the cards

const CSS = `
.lm-r-top{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));align-items:stretch}
.lm-cap{display:grid;gap:8px}
.lm-cap-n{font:800 22px/26px var(--lx-serif);color:#2a1a30}
.lm-cap-n small{font:700 12px var(--lx-sans);letter-spacing:.12em;text-transform:uppercase;color:#7a5222;margin-left:6px}
.lm-presets{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.lm-presets .lx-btn{min-height:44px;padding:6px 6px;font-size:11.5px;letter-spacing:.04em}
@media(min-width:700px){.lm-presets{grid-template-columns:repeat(6,minmax(0,1fr))}}
.lm-rec{flex:none;min-width:112px}
.lm-kt{margin-bottom:2px;font:800 12px/16px var(--lx-serif);letter-spacing:.16em;text-transform:uppercase;color:#7a2f30}
.lm-rc{display:grid;gap:9px}
.lm-rc-head{display:flex;gap:12px;align-items:center;padding:2px;margin:-2px;border-radius:10px;cursor:pointer;min-width:0;-webkit-tap-highlight-color:transparent}
.lm-rc-head:hover{background:rgba(242,193,78,.18)}
.lm-rc-head:focus-visible{outline:3px solid #5a1f5e;outline-offset:1px}
.lm-rc-go{flex:none;color:#7a5222;font:700 34px/1 var(--lx-sans);padding:0 4px}
.lm-stylechip{color:#fff;text-shadow:0 1px 1px rgba(0,0,0,.45)}
.lm-meters{display:grid;gap:5px}
.lm-menu-opt{display:flex;gap:10px;align-items:center;width:100%;text-align:left;min-height:56px;cursor:pointer;font-family:inherit;color:inherit}
.lm-menu-opt[aria-pressed=true]{border-color:#c98e24;box-shadow:0 0 0 2px #f2c14e,0 2px 6px rgba(60,40,10,.2)}
.lm-menu-opt:disabled{opacity:.55;cursor:not-allowed}
.lm-menu-opt:focus-visible{outline:3px solid #5a1f5e;outline-offset:2px}
.lm-kitchen{display:flex;gap:10px;align-items:center}
.lm-board-n{font:900 18px var(--lx-serif);width:26px;text-align:center;color:#7a2f30}
`;

export function open(ctx) {
  injectCss(); addCss(CSS);
  const S = ctx.S, lm = L(), d = D();
  const body = h('div', 'lm-sheetbody');
  const m = wide(ctx.sheet({ title: 'Roster', body }), 1000);
  let dead = false; const origClose = m.close; m.close = () => { dead = true; origClose.call(m); };

  const sw = (kind) => ctx.sfx(kind);
  const commit = () => { ctx.save(); ctx.refresh(); };

  function menuOf() { return d.MENUS.find((x) => x.id === S.menu) || d.MENUS[0]; }

  function topBar() {
    const cap = lm.rosterCap(S), n = S.glads.length, full = n >= cap;
    const capCard = h('div', 'lm-card lm-cap');
    const left = h('div', 'lm-grow', [h('div', 'lm-cap-n lm-num', [`${n}/${cap}`, h('small', '', 'fighters')]), U.bar({ value: n, max: Math.max(1, cap), kind: full ? 'hp' : 'stam', height: 8, segments: 1 }), h('div', 'lm-sub', full ? 'Barracks full. Upgrade it for more beds.' : `${cap - n} free bed${cap - n === 1 ? '' : 's'}`)]);
    left.children[1].style.margin = '5px 0 4px';
    const rec = U.button({ label: 'Recruit', icon: 'roster', variant: 'gold', onClick: () => ctx.open('recruit') });
    rec.classList.add('lm-rec'); rec.setAttribute('aria-label', 'Recruit fighters');
    capCard.append(h('div', 'lm-row', [left, rec]));

    const menu = menuOf();
    const kit = h('div', 'lm-card lm-kitchen', [h('div', 'lm-grow', [h('div', 'lm-sec-t lm-kt', 'Kitchen'), h('div', 'lm-name', menu.n), h('div', 'lm-sub', menu.d + (menu.c ? ` ${menu.c}g per fighter each week.` : ''))]), U.button({ label: 'Menu', variant: 'bronze', onClick: menuPicker })]);
    return h('div', 'lm-r-top', [capCard, kit]);
  }

  function menuPicker() {
    const kv = d.BUILD.kitchen.v[lm.bfx(S, 'kitchen').l];
    const b = h('div', 'lm-sheetbody', [note('Plant-based fuel for the whole ludus. Cost is per fighter per week. Better menus need a higher Kitchen level.')]);
    const pm = ctx.sheet({ title: 'Weekly menu', body: b });
    const list = h('div', 'lm-grid'); list.style.gridTemplateColumns = '1fr';
    const paint = () => {
      list.replaceChildren(...d.MENUS.map((mm) => {
        const ok = lm.menuOk(S, mm);
        const btn = h('button', 'lm-card lm-menu-opt'); btn.type = 'button'; btn.disabled = !ok; btn.setAttribute('aria-pressed', S.menu === mm.id);
        btn.append(h('div', 'lm-grow', [h('div', 'lm-name', mm.n), h('div', 'lm-sub', mm.d)]), ok ? chip(mm.c ? mm.c + 'g' : 'Free', S.menu === mm.id ? 'gold' : 'bronze') : chip('Kitchen L' + mm.k, 'grey'));
        if (!ok) btn.prepend(U.icon('lock', 20));
        btn.addEventListener('click', () => { if (!ok) return; S.menu = mm.id; sw('uiConfirm'); commit(); pm.close(); render(); });
        return btn;
      }));
    };
    paint(); b.append(list);
  }

  function planner() {
    const wrap = h('div', 'lm-presets');
    const P = [['Boot camp', 'boot', 'Everyone with energy trains their weakest stat; tired fighters rest.'], ['Rest week', 'rest', 'Everyone rests.'], ['Odd jobs', 'work', 'Fighters with energy take odd jobs for gold.'], ['Sparring', 'spar', 'Fighters with energy spar for XP.']];
    P.forEach(([label, kind, tip]) => { const b = U.button({ label, variant: 'bronze', onClick: () => { const n = lm.preset(S, kind); sw('uiTap'); commit(); render(); ctx.toast(n ? `Plans set for ${n} fighter${n > 1 ? 's' : ''}.` : 'Nothing to change.', { kind: n ? 'good' : 'info', ico: 'check' }); } }); U.tooltip(b, tip, { title: label }); wrap.append(b); });
    const auto = U.button({ label: 'Auto-plan', variant: 'gold', onClick: autoplan }); auto.dataset.tut = 'auto-plan'; U.tooltip(auto, 'Picks each fighter\'s weakest trainable stat; rests the tired and injured; works when gold is low.', { title: 'Auto-plan' });
    wrap.append(auto, U.button({ label: 'Drill board', variant: 'bronze', onClick: drillBoard }));
    return wrap;
  }

  function autoplan() {
    S.glads.forEach((g) => {
      if (g.inj > 0 || g.en < 45 || lm.busy(S, g, S.week)) { g.act = 'rest'; return; }
      if (S.gold < 70 && g.en > 60) { g.act = 'work'; return; }
      const B = d.STYLES[g.style].base; let best = 'str', bv = 1e9;
      d.STATS.forEach((s) => { const v = (g.st[s] / B[s]) / (0.8 + 0.1 * g.tal[s]); if (v < bv && g.st[s] < lm.cap(g)) { bv = v; best = s; } });
      g.act = best;
    });
    sw('uiConfirm'); commit(); render(); ctx.toast('Weekly plan set', { kind: 'good', ico: 'check' });
  }

  function drillBoard() {
    const l = S.glads.filter((g) => g.rtBest).sort((a, b) => a.rtBest - b.rtBest);
    const b = h('div', 'lm-sheetbody', [note('Best reflex times in your ludus. Reflex drills unlock with a level 3 Sparring Ring.')]);
    if (!l.length) b.append(empty('No reflex times yet.'));
    l.forEach((g, i) => b.append(h('div', 'lm-card lm-row', [h('div', 'lm-board-n lm-num', i + 1), portrait(ctx, g, 40), h('div', 'lm-name lm-grow', g.name), chip(g.rtBest + ' ms', 'gold')])));
    b.querySelectorAll('.lm-card').forEach((c) => { c.style.marginBottom = '8px'; });
    ctx.sheet({ title: 'Drill board', body: b });
  }

  function card(g) {
    const c = h('div', 'lm-card lm-rc' + (g.inj > 0 ? ' lm-dim' : ''));
    const st = d.STYLES[g.style], T = d.TRAITS[g.trait];
    const stylechip = chip(st.n, 'bronze'); stylechip.classList.add('lm-stylechip'); stylechip.style.background = st.c;
    const nm = h('div', 'lm-name', [g.name, g.nick ? h('small', '', ' ' + g.nick) : null]);
    const head = h('div', 'lm-rc-head', [portrait(ctx, g, 60), h('div', 'lm-grow', [nm, h('div', 'lm-chips', [stylechip, chip('Lv ' + g.lvl, 'gold'), chip(T.n, 'purple', T.d)]), h('div', '', U.stars(lm.stars(g), 5))]), h('span', 'lm-rc-go', '\u203a')]);
        head.setAttribute('role', 'button'); head.tabIndex = 0; head.setAttribute('aria-label', `Open profile of ${g.name}`);
    const go = () => { sw('uiTap'); ctx.open('profile', g.id); };
    head.addEventListener('click', go); head.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    c.append(head);

    const meter = (label, bar, val, tip) => { const r = h('div', 'lm-meter', [h('span', '', label), bar, h('b', 'lm-num', val)]); U.tooltip(r, tip, { title: label }); return r; };
    c.append(h('div', 'lm-meters', [
      meter('Energy', U.bar({ value: g.en, max: 100, kind: 'stam', height: 8, name: 'Energy' }), Math.round(g.en), 'Energy: training and fights drain it. Below 60 a fighter performs worse in the arena.'),
      meter('Morale', U.bar({ value: g.mo, max: 100, kind: 'foe', height: 8, name: 'Morale' }), Math.round(g.mo), 'Morale: a happy fighter hits harder and learns faster.'),
      meter('XP', U.bar({ value: g.xp, max: lm.need(g.lvl), kind: 'xp', height: 8 }), `${Math.floor(g.xp)}`, `Experience: ${Math.floor(g.xp)} of ${lm.need(g.lvl)} to level ${g.lvl + 1}.`),
    ]));

    const chips = h('div', 'lm-chips');
    if (lm.fEnsure && lm.fEnsure(S, g).q) { // FIGHTERS
      const tt = lm.fTitleDef(g.rn), sg = lm.fStage(g); if (tt) chips.append(chip(tt.short, 'gold', tt.n + ': ' + tt.d));
      chips.append(chip(`${g.age} ${sg.n}`, g.age >= 38 ? 'red' : g.age >= 34 ? 'bronze' : 'green', sg.d), ...lm.fQuirks(g).map((q) => chip(q.n, 'purple', `${q.pro}. ${q.con}.`)));
      if (lm.fFree(g) > 0) chips.append(chip(`${lm.fFree(g)} talent pt${lm.fFree(g) > 1 ? 's' : ''}`, 'green', 'Open the profile to spend talent points.'));
    }
    if (g.inj > 0) chips.append(chip(`${lm.woundOf && lm.woundOf(g) ? d.WOUNDS[lm.woundOf(g).part].n : 'Injured'} ${g.inj}w`, 'red', 'Injured fighters rest until healed. Treat or rest them from their profile or the Infirmary.')); // WAVE2: body part
    else if (g.weak && g.weak.w > 0) chips.append(chip(`Weak ${g.weak.w}w`, 'gold', 'Still recovering: ' + lm.modText(g.weak.mods).join(', ')));
    if (g.scars && g.scars.length) chips.append(chip(`${g.scars.length} scar${g.scars.length > 1 ? 's' : ''}`, 'purple', g.scars.map((id) => d.SCARS[id].n).join(', ')));
    const entered = lm.busy(S, g, S.week) ? 'this week' : lm.busy(S, g, S.week + 1) ? 'next week' : '';
    if (entered) chips.append(chip(`Fights ${entered}`, 'blue', 'Entered in a match. Let them rest to arrive fresh.'));
    if ((g.fav || 0) >= 50) chips.append(chip('Fan favorite', 'gold', 'The crowd loves them: purses are bigger.'));
    if (g.pend && g.pend.length) { const p = h('button', 'lm-chip lm-chip-green lm-chip-pulse', 'Level-up pick!'); p.type = 'button'; p.style.cssText = 'min-height:44px;padding:4px 14px;cursor:pointer;font-size:12px'; p.addEventListener('click', async () => { const f = await import('../flow.js'); sw('levelUp'); await f.pickPends(ctx); commit(); if (!dead) render(); }); chips.append(p); }
    if (chips.childNodes.length) c.append(chips);

    const desc = h('div', 'lm-actd', g.inj > 0 ? 'Recovering: injured fighters rest automatically.' : actDesc(lm.activity(g)));
    const swap = () => { clearTips(); const n = card(g); c.replaceWith(n); };
    const pick = (a) => { g.act = a.id; sw('uiTap'); ctx.save(); swap(); };
    c.append(activityGrid(g, pick), desc);

    if (lm.canDrill(S, g)) {
      c.append(U.button({ label: 'Training drill', icon: 'bladedance', variant: 'gold', block: true, onClick: async () => { const mod = await import('./drill.js'); mod.open(ctx, g, () => { commit(); if (!dead) swap(); }); } }));
    } else if (g.drill && g.drill.week === S.week) {
      c.append(chip(g.drill.m > 0 ? `Drilled +${Math.round(g.drill.m * 100)}% this week` : 'Drilled, no bonus', g.drill.m > 0 ? 'green' : 'grey'));
    }
    return c;
  }

  function webCard() { // FIGHTERS: who is sworn, friends, feuding, fond
    if (!lm.fWeb || S.glads.length < 2) return null;
    const W = lm.fWeb(S), n = (k) => W[k].length, c = h('div', 'lm-card'); const trs = (S.trainers || []);
    c.append(h('div', 'lm-row lm-wrap', [h('b', 'lm-name', 'Barracks web'), n('sworn') ? chip(`${n('sworn')} sworn`, 'gold') : null, n('friend') ? chip(`${n('friend')} friends`, 'green') : null, n('grudge') ? chip(`${n('grudge')} feud${n('grudge') > 1 ? 's' : ''}`, 'red') : null, n('fond') ? chip(`${n('fond')} fond`, 'purple') : null, n('jealous') ? chip(`${n('jealous')} jealous`, 'bronze') : null, trs.length ? chip(`${trs.length} trainer${trs.length > 1 ? 's' : ''}`, 'blue') : null]));
    const top = W.grudge[0] || W.sworn[0] || W.friend[0];
    c.append(h('div', 'lm-sub', top ? `${top.a.name} and ${top.b.name}: ${lm.fPairText(S, top.a, top.b)}.` : 'No bonds yet. Fighters who train and fight together grow close, or fall out.'));
    const b = U.button({ label: 'Open the web', icon: 'roster', variant: 'bronze', onClick: webSheet }); b.style.marginTop = '8px'; c.append(b); return c;
  }
  function webSheet() {
    const W = lm.fWeb(S), b = h('div', 'lm-sheetbody', [note('Every pair in the barracks. Sworn brothers fight better together, friends a little, a deep grudge hurts both until it is settled in the yard.')]); const sm = ctx.sheet({ title: 'Barracks web', body: b });
    const names = { sworn: 'Sworn brothers', friend: 'Friends', fond: 'Fond', jealous: 'Jealous', grudge: 'Grudges' };
    for (const k of ['grudge', 'sworn', 'fond', 'jealous', 'friend']) if (W[k].length) { b.append(sec(names[k]), h('div', 'lm-sub', lm.fKIND[k].d));
      W[k].forEach((p) => { const row = h('div', 'lm-card lm-row'); row.style.marginBottom = '6px'; row.append(portrait(ctx, p.a, 36), h('div', 'lm-grow', [h('div', 'lm-name', `${p.a.name} and ${p.b.name}`), h('div', 'lm-sub', k === 'grudge' ? `Grudge ${Math.round(p.r.gr)}` : `Bond ${Math.round(p.r.bond)}`)]), portrait(ctx, p.b, 36));
        if (k === 'grudge') row.append(U.button({ label: 'Settle', variant: 'gold', disabled: !!lm.fSparWhy(S, p.a, p.b), onClick: () => { const res = lm.fSparBout(S, p.a, p.b); if (res.err) { ctx.toast(res.err, { kind: 'bad' }); return; } ctx.sfx('uiConfirm'); commit(); ctx.toast(res.line, { kind: 'info', ms: 4200 }); sm.close(); render(); webSheet(); } }));
        b.append(row); }); }
    if (!Object.values(W).some((a) => a.length)) b.append(empty('No bonds yet.'));
    const trs = S.trainers || []; if (trs.length) { b.append(sec('Trainers')); trs.forEach((t) => { const p = lm.fTrainerPupil(S, t); const row = h('div', 'lm-card lm-row'); row.style.marginBottom = '6px'; row.append(h('div', 'lm-grow', [h('div', 'lm-name', `${t.name} (${d.STYLES[t.style].n}, Lv ${t.lvl})`), h('div', 'lm-sub', p ? `Coaching ${p.name}. 12 gold a week.` : 'No pupil to coach yet. 12 gold a week.')]));
      if (S.glads.length > 1) row.append(U.button({ label: 'Next pupil', variant: 'bronze', onClick: () => { const ids = S.glads.map((x) => x.id); const i = ids.indexOf(t.p); t.p = ids[(i + 1) % ids.length]; ctx.sfx('uiTap'); commit(); sm.close(); webSheet(); } })); b.append(row); }); }
  }

  function render() {
    if (dead) return;
    clearTips(); body.replaceChildren();
    body.append(topBar());
    { const wc = webCard(); if (wc) { wc.style.marginTop = '10px'; body.append(wc); } }
    body.append(sec('Weekly plan'), planner(), note('Each fighter repeats their activity every week until you change it. Fighters entered in games should rest.'));
    body.append(sec(`Fighters ${S.glads.length}`));
    if (!S.glads.length) { body.append(U.emptyState({ icon: 'roster', title: 'Your barracks are empty', text: 'Fighters you hire live here: their health, energy and the plan they follow each week.', how: 'Citizens wait at the gate every week.', action: { label: 'Recruit your first fighter', icon: 'roster', onClick: () => ctx.open('recruit', { first: true }) } })); }
    else { const grid = h('div', 'lm-grid', S.glads.map(card)); body.append(grid); }
    body.append(h('div', '', [note(`Upkeep ${fmt(lm.upkeep(S))} gold per week. Tap a fighter for their full profile.`)]));
  }
  render();
  return m;
}
