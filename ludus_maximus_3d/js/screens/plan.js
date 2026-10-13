// The battle plan, chosen in the prep sheet before a fight (core/sim.js LM.ROLES / FORMS / SHOW / PRIO, core/arena.js applies them).
//   Team fights: a formation (start positions and default jobs), a role per fighter, and a priority target.
//   Solo fights: the Showmanship dial (more show: more fame, fans and crowd noise; less damage and armor, longer wind-ups, more wounds).
// Everything is pre-filled with a sensible suggestion, so one tap on "Fight!" starts. Every choice prints its exact gain and cost. No em dashes in copy.
import { h, D, L, portrait } from './ui_common.js';

const SW = 64, SH = 40;
/** a tiny map of a formation: your fighters (gold) on the left, a grey line of foes on the right */
function formMap(form, n) {
  const NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', `0 0 ${SW} ${SH}`); s.setAttribute('class', 'pl-map'); s.setAttribute('aria-hidden', 'true');
  const add = (cx, cy, r, cls) => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', cx.toFixed(1)); c.setAttribute('cy', cy.toFixed(1)); c.setAttribute('r', r); c.setAttribute('class', cls); s.append(c); };
  const sx = (x) => SW / 2 + x * 3.1, sy = (y) => SH / 2 + y * 1.55;
  for (let i = 0; i < n; i++) add(sx(6.4), sy((i - (n - 1) / 2) * (n > 2 ? 4.3 : 3.6)), 2.2, 'pl-dot-foe');
  for (let i = 0; i < n; i++) { const p = L().FORMS[form].pos(i, n); add(sx(p.x), sy(p.y), 3.1, 'pl-dot'); }
  return s;
}
/** a portrait for a gladiator, a plain medallion for a beast (the portrait renderer draws gladiators only) */
const face = (ctx, g, size) => { if (!g.beast) return portrait(ctx, g, size); const e = h('div', 'pl-beast', (g.name || '?').slice(0, 1)); e.style.width = e.style.height = size + 'px'; return e; };
const gainCost = (gain, cost) => h('div', 'pl-gc', [h('span', 'pl-g', 'Gain: ' + gain), h('span', 'pl-c', 'Cost: ' + cost)]);

/**
 * ctx: screen context. o: { gl, opps, start (a plan or null), solo (offer the Showmanship dial), onChange(plan) }
 * returns { el, get() -> plan, odds(cb) }
 */
export function planPanel(ctx, o) {
  const S = ctx.S, lm = L(), gl = o.gl, opps = o.opps, team = gl.length > 1, lv = lm.scoutLevel(S);
  const sug = lm.defaultPlan(S, gl, opps);
  const st = { plan: lm.normPlan(o.start || sug, gl) };
  const root = h('div', 'pl-root'); root.dataset.plan = team ? 'team' : 'solo';
  const oddsEl = h('div', 'pl-odds'); let tm = 0;
  const changed = () => {
    o.onChange && o.onChange(st.plan);
    if (lv < 2 || gl.length * opps.length > 9) return;
    clearTimeout(tm); oddsEl.textContent = 'Win chance: working it out...';
    tm = setTimeout(() => { try { const p = Math.round(lm.odds(S, gl, opps, lm.normPlan(st.plan, gl), 24) * 100); oddsEl.textContent = `Win chance with this plan: about ${p}%`; } catch (e) { oddsEl.textContent = ''; } }, 140);
  };

  if (team) {
    // ---- formation
    const forms = h('div', 'pl-forms'); forms.setAttribute('role', 'radiogroup'); forms.setAttribute('aria-label', 'Formation');
    const fdesc = h('div', 'pl-desc'), rows = h('div', 'pl-roles');
    const drawForms = () => {
      forms.innerHTML = '';
      for (const id of lm.FORM_IDS) {
        const F = lm.FORMS[id], b = h('button', 'pl-form'); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(st.plan.form === id)); b.dataset.form = id;
        b.append(formMap(id, gl.length), h('span', 'pl-fn', F.n)); if (sug.form === id) b.append(h('i', 'pl-sug', 'Suggested'));
        b.addEventListener('click', () => { ctx.sfx('uiTap'); st.plan = lm.normPlan({ form: id, roles: {}, prio: st.plan.prio }, gl); drawForms(); drawRoles(); changed(); });
        forms.append(b);
      }
      const F = lm.FORMS[st.plan.form]; fdesc.textContent = ''; fdesc.append(F.d);
      if (F.gain || F.cost) fdesc.append(gainCost(F.gain ? F.gain + ', for everyone' : 'none', F.cost ? F.cost + ', for everyone' : 'none'));
    };
    // ---- roles
    const drawRoles = () => {
      rows.innerHTML = '';
      gl.forEach((g) => {
        const sel = h('select', 'pl-sel'); sel.setAttribute('aria-label', `Role for ${g.name}`);
        lm.ROLE_IDS.forEach((r) => { const op = h('option', '', lm.ROLES[r].n); op.value = r; sel.append(op); }); sel.value = st.plan.roles[g.id];
        const R = () => lm.ROLES[st.plan.roles[g.id]], info = h('div', 'pl-ri');
        const paint = () => { info.innerHTML = ''; info.append(h('div', 'pl-rd', R().d), gainCost(R().gain, R().cost)); };
        sel.addEventListener('change', () => { ctx.sfx('uiTap'); st.plan.roles[g.id] = sel.value; paint(); changed(); }); paint();
        rows.append(h('div', 'pl-role', [h('div', 'pl-rh', [portrait(ctx, g, 40), h('div', 'pl-rn', [h('b', '', g.name), h('small', '', D().STYLES[g.style].n)]), sel]), info]));
      });
    };
    // ---- priority
    const prio = h('div', 'pl-prio'), pdesc = h('p', 'pl-desc');
    const grade = ['Light', 'Solid', 'Dangerous'];
    const drawPrio = () => {
      prio.innerHTML = ''; const soft = lm.suggestFoc(opps);
      opps.forEach((f, i) => {
        const b = h('button', 'pl-foe'); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(st.plan.prio === i)); b.dataset.foe = String(i);
        const bits = [`${D().STYLES[f.style].n}, Lv ${f.lvl}`]; if (lv >= 2) bits.push(`HP ${Math.round(lm.derive(f, { noperf: true }).hp)}`); if (lv >= 1) bits.push(`Threat ${grade[lm.threatOf(f, opps)]}`);
        b.append(face(ctx, f, 40), h('div', 'pl-fi', [h('b', '', f.name), h('small', '', bits.join(' · '))])); if (i === soft) b.append(h('i', 'pl-sug', 'Suggested'));
        b.addEventListener('click', () => { ctx.sfx('uiTap'); st.plan.prio = st.plan.prio === i ? null : i; drawPrio(); changed(); });
        prio.append(b);
      });
      pdesc.textContent = st.plan.prio == null ? 'No priority: everyone picks the nearest foe. Easier to read, but the team spreads its blows.' : `${opps[st.plan.prio].name} first. ${lm.PRIO.gain}. Cost: ${lm.PRIO.cost.toLowerCase()}. Tap again to clear.`;
    };
    drawForms(); drawRoles(); drawPrio();
    root.append(h('div', 'pl-sec', 'Formation'), forms, fdesc, h('div', 'pl-sec', 'Roles'), rows, h('div', 'pl-sec', 'Priority target'), prio, pdesc);
    if (lv >= 1) { const ep = lm.oppPlan(S, opps, gl); if (ep) root.append(h('p', 'pl-foe-plan', `They line up as a ${lm.FORMS[ep.form].n}${ep.prio != null ? ` and go for ${gl[ep.prio].name} first` : ''}.`)); }
  } else if (o.solo) {
    const dial = h('div', 'pl-show'); dial.setAttribute('role', 'radiogroup'); dial.setAttribute('aria-label', 'Showmanship');
    const draw = () => {
      dial.innerHTML = '';
      lm.SHOW.forEach((sh, i) => {
        const b = h('button', 'pl-sh'); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(st.plan.show === i)); b.dataset.show = String(i);
        b.append(h('b', '', sh.n), h('span', 'pl-shd', sh.d), gainCost(sh.gain, sh.cost));
        b.addEventListener('click', () => { ctx.sfx('uiTap'); st.plan.show = i; draw(); changed(); });
        dial.append(b);
      });
    };
    draw();
    root.append(dial, h('p', 'pl-desc', 'A win pays the fame bonus in full. A loss pays little, but the fans still like the show. A louder crowd roars sooner, and its roar backs whoever is behind. The lost damage and the wound risk are real.'));
    if (gl[0].trait === 'showman') root.append(h('p', 'pl-foe-plan', `${gl[0].name} is a natural Showman: +25% fame already, and it stacks.`));
  }
  root.append(oddsEl); changed();
  return { el: root, get: () => lm.normPlan(st.plan, gl) };
}
