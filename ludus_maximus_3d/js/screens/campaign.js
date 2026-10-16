// CAMPAIGN UI: the dialogue sheet (portrait, speaker, text, choices with their exact consequences), the story flow that runs after the week
// (chapter cards, scenes, finale outcome, epilogue), the grudge/finale intro card, and the Story tab of The World. Sim in core/campaign.js. No em dashes.
import { U, h, D, L, injectCss, openScreen, sec, card, row, col, note, hint, kv, medal, pill, meter, empty, actions, styleBadge } from './sk.js';
import * as Cer from '../ceremonies.js';

const CSS = `
.cp{display:flex;flex-direction:column;gap:12px;min-width:0}
.cp *{min-width:0;box-sizing:border-box}
.cp-top{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.cp-log{display:flex;flex-direction:column;gap:12px}
.cp-ln{display:grid;grid-template-columns:52px 1fr;gap:10px;align-items:start;animation:cp-in .38s var(--lx-ease-out) both}
.cp-ln .pt{width:52px;height:52px;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:#2a2540;box-shadow:0 0 0 2px var(--lx-gold);color:var(--lx-gold)}
.cp-ln .pt>*{width:100%!important;height:100%!important;border-radius:50%}
.cp-ln .pt .lx-ico{width:26px!important;height:26px!important}
.cp-ln .nm{font:800 var(--lx-fs-s)/1.2 var(--lx-serif);letter-spacing:.08em;text-transform:uppercase;color:var(--lx-gold)}
.cp-ln .nm small{display:block;font:600 11px/1.3 var(--lx-sans);letter-spacing:.03em;text-transform:none;opacity:.75}
.cp-ln .tx{margin-top:3px;padding:9px 12px;border-radius:4px 12px 12px 12px;background:rgba(10,6,24,.5);box-shadow:inset 0 0 0 1px rgba(242,193,78,.25);line-height:1.5;font-size:var(--lx-fs-m);overflow-wrap:break-word}
.cp-ln.nar{display:block}
.cp-ln.nar .tx{margin:0;padding:2px 2px 2px 12px;border-radius:0;background:none;box-shadow:none;border-left:3px solid rgba(242,193,78,.55);font-style:italic;opacity:.94}
.cp-ln.you .tx{background:linear-gradient(90deg,rgba(242,193,78,.2),rgba(242,193,78,.05));box-shadow:inset 0 0 0 1px rgba(242,193,78,.5)}
@keyframes cp-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.cp-cho{display:flex;flex-direction:column;gap:10px}
.cp-opt{display:flex;flex-direction:column;gap:6px;padding:8px;border-radius:12px;background:rgba(10,6,24,.4);box-shadow:inset 0 0 0 1px rgba(242,193,78,.28)}
.cp-opt .lx-btn{min-height:48px;text-align:left}
.cp-opt .chs{display:flex;flex-wrap:wrap;gap:6px}
.cp-opt .why{font-size:var(--lx-fs-s);color:#ffb4a6}
.cp-res{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}
.cp-pick{font:700 var(--lx-fs-s)/1.3 var(--lx-serif);letter-spacing:.1em;text-transform:uppercase;color:var(--lx-gold);text-align:center}
.cp-ch-row{display:grid;grid-template-columns:34px 1fr auto;gap:10px;align-items:center;padding:6px 8px;border-radius:8px;background:rgba(10,6,24,.35)}
.cp-ch-row.now{background:linear-gradient(90deg,rgba(242,193,78,.26),rgba(242,193,78,.06));box-shadow:inset 0 0 0 1.5px var(--lx-gold)}
.cp-ch-row.lock{opacity:.5}
.cp-ch-row .n{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;font:800 13px/1 var(--lx-serif);background:radial-gradient(circle at 35% 30%,#d8a35c,#7a5222);color:#fff2d6}
.cp-nem{display:grid;grid-template-columns:84px 1fr;gap:12px;align-items:start}
.cp-nem .pf{width:84px;height:84px;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:#2a2540;box-shadow:0 0 0 3px var(--lx-gold),0 0 20px rgba(242,193,78,.3);color:var(--lx-gold)}
.cp-nem .pf>*{width:100%!important;height:100%!important;border-radius:50%}
.cp-nem .pf.unk{filter:grayscale(1) brightness(.55)}
.cp-fl{display:flex;flex-wrap:wrap;gap:6px}
.cp-log2{display:flex;flex-direction:column;gap:6px}
.cp-log2 .e{display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:baseline;font-size:var(--lx-fs-s);line-height:1.4}
.cp-end{display:grid;grid-template-columns:34px 1fr;gap:10px;align-items:start}
@media (max-width:420px){.cp-nem{grid-template-columns:64px 1fr}.cp-nem .pf{width:64px;height:64px}}
`;
function css() { injectCss(); if (document.getElementById('cp-css')) return; const s = document.createElement('style'); s.id = 'cp-css'; s.textContent = CSS; document.head.append(s); }

const C = () => L().campaign;
const TONE = { good: 'good', bad: 'bad', warn: 'warn' };
const chipEl = (c) => pill(c.t, { tone: TONE[c.tone] || '' });
const NUM = ['I', 'II', 'III', 'IV', 'V'];

// ------------------------------------------------------------------ the dialogue sheet
function portraitOf(ctx, S, spk) {
  const wrap = h('div', 'pt');
  try {
    if (['nem', 'fel', 'doc'].includes(spk.id)) {
      const g = C().speakerGlad(S, spk.id);
      if (g && ctx.portrait) { wrap.append(ctx.portrait(g, 52)); return wrap; }
    }
  } catch (e) { /* falls back to the medal */ }
  wrap.append(U.icon(spk.ico || 'scroll', 26)); return wrap;
}
function lineEl(ctx, S, ln, cls = '') {
  if (ln.who === 'nar') return h('div', 'cp-ln nar' + cls, h('div', 'tx', ln.text));
  const spk = ln.spk;
  return h('div', 'cp-ln' + cls, [portraitOf(ctx, S, spk), h('div', '', [h('div', 'nm', [spk.name, spk.role ? h('small', '', spk.role) : null]), h('div', 'tx', ln.text)])]);
}

/** Plays a scene in a sheet. Lines appear one per tap; then the choices (each with its exact numbers). `choose(i)` applies the pick and returns {done, then}.
 *  Resolves with the picked index (or null for a scene without choices). A scene with choices cannot be dismissed without an answer. */
export function playScene(ctx, sc, choose) {
  css();
  return new Promise((resolve) => {
    const S = ctx.S, x = C().CH[sc.ch - 1];
    const top = h('div', 'cp-top', [pill(`Chapter ${NUM[sc.ch - 1]}`, { tone: 'gold', ico: 'scroll' }), pill(x.t, { tone: '' })]);
    const log = h('div', 'cp-log'); log.setAttribute('aria-live', 'polite'); const cho = h('div', 'cp-cho'), body = h('div', 'cp', [top, log, cho]);
    const forced = !!(sc.choices && sc.choices.length);
    let shown = 0, phase = 'lines', picked = null, queue = [], closedBy = false, pendingDone = [];
    const cont = U.button({ label: 'Continue', variant: 'gold', icon: 'play', block: true, onClick: () => advance() });
    const setLabel = (t) => { const l = cont.querySelector('.lx-btn-label'); if (l) l.textContent = t; };
    const m = ctx.sheet({ title: sc.title, body, actions: [cont], closable: !forced, why: forced ? 'Choose an answer to go on.' : '', cls: 'cp-sheet', onClose: () => { if (!closedBy) { closedBy = true; resolve(picked); } } });
    m.el.dataset.tutSheet = 'story'; m.sheet.classList.add('ax-sheet'); // the dark night chrome of the World sheets
    const scroller = m.el.querySelector('.lx-sheet-scroll');
    const down = () => { try { scroller.scrollTo({ top: scroller.scrollHeight, behavior: U.reduced() ? 'auto' : 'smooth' }); } catch (e) { scroller.scrollTop = scroller.scrollHeight; } };
    const finish = () => { if (closedBy) return; closedBy = true; m.close(); resolve(picked); };
    const add = (ln, cls) => { log.append(lineEl(ctx, S, ln, cls)); ctx.sfx('uiTap', { gain: 0.25 }); down(); };
    const showChoices = () => {
      phase = 'choose'; cont.style.display = 'none';
      if (sc.pick) cho.append(h('div', 'cp-pick', sc.pick));
      sc.choices.forEach((c) => {
        const b = U.button({ label: c.label, variant: 'bronze', block: true, disabled: !!c.why, onClick: () => pickChoice(c.i) });
        const chs = c.chips.length ? h('div', 'chs', c.chips.map(chipEl)) : null;
        cho.append(h('div', 'cp-opt', [b, chs, c.hint ? note(c.hint) : null, c.why ? h('div', 'why', c.why) : null]));
      });
      down(); setTimeout(() => { const f = cho.querySelector('button:not([disabled])'); f && f.focus({ preventScroll: true }); }, 60);
    };
    const thenStep = () => {
      if (queue.length) add(queue.shift());
      if (queue.length) return;
      phase = 'end'; setLabel('Onward');
      if (pendingDone.length) { log.append(h('div', 'cp-res', pendingDone.map((t) => pill(t, { tone: /^-|lose|worn|sold/i.test(t) ? 'bad' : 'good' })))); pendingDone = []; down(); }
    };
    const pickChoice = (i) => {
      if (phase !== 'choose') return; ctx.sfx('uiConfirm'); const c = sc.choices.find((q) => q.i === i); picked = i;
      let res = { done: [], then: [] }; try { res = (choose && choose(i)) || res; } catch (e) { console.warn('story choice', e && e.message); }
      cho.replaceChildren(); add({ who: 'you', spk: { id: 'you', name: 'You', role: '', ico: 'star' }, text: c.label }, ' you');
      queue = (res.then || []).slice(); pendingDone = [...new Set([...(c.chips || []).map((x) => x.t), ...(res.done || [])])]; phase = 'then'; cont.style.display = ''; setLabel('Continue'); thenStep(); try { cont.focus({ preventScroll: true }); } catch (e) { /* detached */ }
    };
    const advance = () => {
      if (phase === 'lines') {
        if (shown < sc.lines.length) add(sc.lines[shown++]);
        if (shown >= sc.lines.length) { if (forced) showChoices(); else { phase = 'last'; setLabel('Onward'); } }
      } else if (phase === 'then') thenStep();
      else if (phase === 'last' || phase === 'end') finish();
    };
    log.addEventListener('click', () => { if (phase === 'lines' || phase === 'then') advance(); });
    if (!sc.lines.length) { if (forced) showChoices(); else { phase = 'last'; } } else advance();
  });
}

// ------------------------------------------------------------------ the story flow (after the week)
/** Runs every ready scene in order: finale outcome, chapter card, beats, meetings, the ending and its epilogue. Never over the tutorial; nothing before week 3. */
export async function storyFlow(ctx) {
  const lm = L(), S = ctx.S, K = lm.campaign; if (!K) return;
  try {
    if (ctx.game && ctx.game.tutorial && ctx.game.tutorial.active) return;
    let guard = 0, xp = false;
    while (guard++ < 10) {
      const sc = K.next(S); if (!sc) break;
      if (sc.kind === 'card') { await Cer.chapterCard(ctx, sc.chapter); K.dismiss(S, sc); ctx.save(); continue; }
      if (sc.kind === 'epilogue') { await Cer.epilogue(ctx, K.epilogue(S)); K.dismiss(S, sc); ctx.save(); ctx.refresh(); continue; }
      const hasChoice = !!(sc.choices && sc.choices.length); let applied = null;
      const pick = await playScene(ctx, sc, (i) => { applied = K.choose(S, sc, i); ctx.save(); ctx.refresh(); if (applied && applied.done && applied.done.length) xp = true; return applied; });
      if (!hasChoice) K.dismiss(S, sc); else if (pick == null && !applied) break; // closed without answering (cannot happen: forced), leave it for next time
      ctx.save(); ctx.refresh();
    }
    if (xp) { try { (await import('../flow.js')).pickPends(ctx); } catch (e) { /* optional */ } }
  } catch (e) { console.warn('story', e && e.message); }
}

/** the card before a grudge match or a finale (called by flow.js runEvent for events with ev.camp) */
export async function campIntro(ctx, ev) {
  const S = ctx.S, K = L().campaign, c = K && K.get(S); if (!c || !ev || (ev.camp !== 'nem' && ev.camp !== 'cf')) return;
  try {
    const foe = ev.opps[0], d = K.dossier(S), x = K.CH[c.ch - 1], fin = ev.camp === 'cf';
    const chips = [];
    if (fin) {
      chips.push({ t: 'Win: the chapter closes, you choose a prize', tone: 'good' }, { t: 'Lose: nothing is lost, the finale stays open and gets a little easier', tone: 'warn' });
      if (c.stake) chips.push({ t: `Wager: ${c.stake} gold staked. Win pays ${c.stake * 4}. Lose: Ruin`, tone: 'bad' });
    } else {
      chips.push({ t: `Level ${foe.lvl}`, tone: '' }, { t: `Tactic: ${d.tactic.n}`, tone: 'warn' });
      if (d.scars.length) chips.push({ t: `Scars: ${d.scars.join(', ')}`, tone: '' });
      chips.push({ t: d.rec && (d.rec.w || d.rec.l) ? `Your record: ${d.rec.w}W ${d.rec.l}L` : 'First blood between you', tone: '' });
    }
    const cry = !fin ? tauntOf(S, K, d) : (foe.nem ? tauntOf(S, K, d) : '');
    await Cer.duelCard(ctx, { kicker: fin ? `Chapter ${x.n} finale` : 'Your rival remembers', title: fin ? x.fin : 'Grudge Match', glad: foe, name: foe.name, nick: foe.nick || '', quote: cry, chips, finale: fin, action: fin ? 'To the sand' : 'Face him' });
  } catch (e) { console.warn('intro', e && e.message); }
}
function tauntOf(S, K, d) {
  const c = S.camp, n = c.nem, p = K.NEM[n.a];
  if (n.state === 'avenger') return 'You opened the account with your hand. I close it with mine.';
  if (n.state === 'traitor') return 'I sold your house and I would sell it twice. Come and take it back.';
  if (d.hum > 0 && d.l === 0) return 'You made me a joke. Today the joke is yours.';
  if (d.l > 0 && d.l >= d.w) return 'I have beaten you before. I do not mind doing it again.';
  if (c.flags.respect && d.met === 0) return 'You sent me wine. I will drink to you after I have beaten you.';
  return p.cry;
}

// ------------------------------------------------------------------ the Story tab (The World)
const STATE_TXT = { rival: ['Rival', 'bad'], dead: ['Fallen', ''], avenger: ['Avenger', 'bad'], ally: ['Ally', 'good'], traitor: ['Traitor', 'bad'], gone: ['Gone', ''] };
export function render(ctx, root, draw) {
  css(); const S = ctx.S, lm = L(), K = lm.campaign, c = K.get(S);
  if (!c) { root.append(card([empty('scroll', 'The story begins soon', 'Play your first weeks. A tale needs a ludus first: it starts in week 3.')])); return; }
  const x = K.CH[c.ch - 1], prog = K.progress(S), told = K.BEATS.filter((b) => b.ch === c.ch && c.seen[b.id] != null).length, all = K.BEATS.filter((b) => b.ch === c.ch).length;
  const head = card([row([medal('scroll', 'dark big'), col([h('div', 'ax-name', `Chapter ${x.n}: ${x.t}`), note(x.line)], 'ax-grow')]), meter(Math.round(prog * 100), 100, 'var(--lx-gold)', 'Chapter progress'),
    h('div', 'ax-row ax-wrap', [pill(`${Math.round(S.fame - x.from)} of ${x.to - x.from} fame`, { ico: 'fame', tone: 'vio' }), pill(`${told} of ${all} scenes told`, { ico: 'scroll', tone: 'gold' }), c.end ? pill(`Ending: ${K.ENDINGS[c.end].k}`, { tone: c.end === 'ruin' ? 'bad' : 'good' }) : null]), note(x.goal)], 'gold');
  if (c.fin && !c.end) {
    const tries = c.fin.tries | 0;
    head.append(hint(`The finale is open: ${K.CH[c.fin.ch - 1].fin}. Find the finale bout in the ${D.LEAGUES[c.fin.lg].n} schedule of the Arena. It costs nothing to enter.${tries ? ` You have tried ${tries} time${tries === 1 ? '' : 's'}; it is easier now.` : ''} The story never blocks your career: you can ignore it for as long as you like.`));
    if (c.stake) head.append(hint(`Your wager stands: ${c.stake} gold in escrow. Win the Emperor's Day and it returns fourfold. Lose it and the house is lost.`));
    head.append(U.button({ label: 'Open the Arena', icon: 'arena', variant: 'gold', block: true, onClick: () => { ctx.closeAll(); ctx.open('arena', { tab: 'sched', wk: 0 }); } }));
  } else if (!c.end) head.append(note('Scenes unfold as your fame grows. They are optional flavour with modest rewards: the story never blocks a league.'));
  if (c.end) head.append(U.button({ label: 'Read the epilogue', icon: 'scroll', variant: 'bronze', block: true, onClick: async () => { await Cer.epilogue(ctx, K.epilogue(S)); } }));
  root.append(head);

  root.append(sec('The chapters'));
  const list = h('div', 'ax-col'); K.CH.forEach((ch, i) => {
    const doneWk = c.done[i + 1], cur = i + 1 === c.ch && !c.end, lock = i + 1 > c.ch;
    list.append(h('div', 'cp-ch-row' + (cur ? ' now' : '') + (lock ? ' lock' : ''), [h('span', 'n', ch.n), col([h('div', 'ax-b', lock ? 'Not yet told' : ch.t), h('div', 'ax-sub', lock ? `Opens near ${ch.from} fame` : ch.line)]), pill(doneWk != null ? (doneWk < 0 ? 'Passed' : `Won, week ${doneWk}`) : cur ? 'Now' : 'Ahead', { tone: doneWk != null ? 'good' : cur ? 'gold' : '' })]));
  });
  root.append(card([list]));

  // the nemesis
  root.append(sec('Your rival'));
  const d = K.dossier(S), st = STATE_TXT[d.state] || ['', ''], nc = card([], 'red');
  let face; try { const g = d.intro ? K.speakerGlad(S, 'nem') : null; face = g && ctx.portrait ? ctx.portrait(g, 84) : null; } catch (e) { face = null; }
  const pf = h('div', 'pf' + (d.intro ? '' : ' unk'), [face || U.icon('skull', 38)]);
  const sty = D.STYLES[d.style];
  nc.append(h('div', 'cp-nem', [pf, col([h('div', 'ax-name', d.intro ? `${d.name} ${d.nick}` : 'A name you do not know yet'), d.intro ? h('div', 'ax-sub', `${sty.n} of ${d.school}, from ${d.from}`) : note('Someone is making a name in the Pit. You will hear it soon.'),
    d.intro ? h('div', 'ax-row ax-wrap', [pill(st[0], { tone: st[1] }), pill(`Level ${d.level >= 0 ? '+' + d.level : d.level} over the field`, { tone: 'warn', tip: 'He grows as the chapters pass and when he beats you.' }), pill(`${d.w + d.l ? `You: ${d.w}W ${d.l}L` : 'Not yet met'}`, {})]) : null])]));
  if (d.intro) {
    nc.append(note(d.grudge));
    nc.append(sec('How he fights'));
    nc.append(h('div', 'ax-kv', [h('span', '', d.tactic.n), pill(`Stage ${d.stage} of 4`, { tone: 'warn' })]), note(d.tactic.d));
    if (d.scars.length) nc.append(h('div', 'ax-row ax-wrap', d.scars.map((s) => pill(s, { tone: 'vio' }))));
    if (d.hum) nc.append(note(`You have humiliated him ${d.hum} time${d.hum === 1 ? '' : 's'}. He has not forgotten.`));
    if (d.fates.length) nc.append(note('What you did with him: ' + d.fates.map((f) => ({ kill: 'killed', spare: 'spared', ransom: 'ransomed' }[f.id] || f.id)).join(', then ') + '.'));
    if (d.prev) nc.append(note(`${d.prev} was killed by your hand. ${d.name} carries the vendetta.`));
    if (d.state === 'rival' || d.state === 'avenger' || d.state === 'traitor') nc.append(note(d.next ? `Next sighting: around week ${d.next}, as a Grudge Match in the ${D.LEAGUES[Math.min(c.ch > 3 ? 3 : K.CH[c.ch - 1].lg, 3)].n}. He may also enter brackets. He is optional pressure, never a wall.` : 'He is watching. Expect him soon.'));
    if (d.state === 'ally') nc.append(note(`He fights in your house now. Trust at the offer was ${d.trust}%.`));
    nc.append(note('Spare him, ransom him or kill him: each has consequences that carry through the chapters. The crowd, the Senate and his school all remember.'));
  }
  root.append(nc);

  // choices journal
  root.append(sec('What you have chosen'));
  const lg = (c.log || []).slice().reverse().slice(0, 14);
  root.append(card(lg.length ? [h('div', 'cp-log2', lg.map((e) => h('div', 'e', [pill(`Wk ${e.wk}`, {}), h('span', '', e.t)])))] : [note('Nothing yet. Your choices in scenes are recorded here.')]));

  // endings
  root.append(sec('Three endings'));
  const ends = [['glory', 'star', 'A Name in Marble', 'Win the Emperor\'s Day and take the laurel. Your house goes on, and so do you.'], ['freedom', 'heart', 'The Wooden Sword', 'Win the Emperor\'s Day and ask for the rudis. Your fighters leave as free men and become legends of the house.'], ['ruin', 'skull', 'Ashes on the Sand', 'Sign the Senator\'s wager in the last chapter and lose the Emperor\'s Day. The house is seized. It is a choice, never an accident.']];
  if (!c.end && c.ch < 4) root.append(card([row([medal('lock', 'dark'), col([h('div', 'ax-b', 'Three endings await'), h('div', 'ax-sub', 'They are named when the fourth chapter begins. One of them is a ruin you can only choose.')], 'ax-grow')])]));
  else root.append(card(ends.map(([id, ico, t, dsc]) => h('div', 'cp-end', [medal(ico, c.end === id ? '' : 'dark'), col([h('div', 'ax-b', c.end === id ? `${t} (yours)` : t), h('div', 'ax-sub', dsc)])]))));
}
