// Ludus Maximus: week flow, fight screen, results, tournaments.
(function (G) {
  const D = G.LM_D, A = G.LM_ART, L = G.LM, U = G.LMUI; const ACT = U.ACT;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = U.esc, fmt = U.fmt;
  const btn = (label, val, cls) => `<button class="btn full ${cls || ''}" style="margin-top:8px" data-a="res" data-v="${val}">${label}</button>`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  ACT.next = async () => {
    const S = U.S(); if (!S || U.busy) return;
    if (!S.glads.length) return U.toast('Recruit a gladiator first');
    U.busy = true; U.snd('click');
    try { await weekFlow(S); } catch (e) { console.error(e); U.toast('Oops: ' + e.message); } finally { U.busy = false; U.save(); U.render(); }
  };

  async function weekFlow(S) {
    const wk = S.week;
    const rep = L.weekTrain(S); U.save(); U.render();
    await U.dialog(trainHtml(S, rep, wk));
    await pickPends(S);
    for (const key of L.dueKeys(S)) {
      const ev = L.eventByKey(S, key); const en = S.entries[key];
      const gl = en.ids.map((id) => U.gOf(id)).filter(Boolean);
      if (!ev || gl.length !== en.ids.length || gl.some((g) => g.inj > 0)) { L.withdraw(S, key); U.toast('An entry was cancelled: fighter unavailable. Fee refunded.'); continue; }
      await runEvent(S, ev, gl, en);
      U.save(); U.render();
    }
    const fin = L.weekFinish(S); U.save(); U.render();
    await U.dialog(summaryHtml(S, fin, wk)); if (fin.story && fin.story.length) await stories(S, fin.story); await trophies(S);
    await rivalryEvent(S);
    await pendingEvent(S);
  }
  U.checkPending = async () => { const S = U.S(); if (S && (S.pendingEv || S.pendingRiv) && !U.busy) { U.busy = true; try { await rivalryEvent(S); await pendingEvent(S); } finally { U.busy = false; U.render(); } } };
  async function pendingEvent(S) {
    if (!S.pendingEv) return;
    const E = L.EVENTS[S.pendingEv]; if (!E) { S.pendingEv = null; return; }
    const i = await U.dialog(`<h2>Event</h2><div style="font-size:15px;margin:8px 0">${E.t}</div>` + E.c.map((c, k) => btn(c.l, k, k ? 'ghost' : '')).join(''));
    const msg = L.runEvent(S, +i); U.save(); U.render(); await U.dialog(`<h2>Result</h2><div style="font-size:15px;margin:8px 0">${esc(msg)}</div>` + btn('Okay', 'ok'));
  }
  const PICKT = { tech: ['New technique', 'Learn', (t) => `<span class="tag">${D.TECHS[t].cd}s</span> ${D.TECHS[t].d}`, (t) => D.TECHS[t].n], mast: ['New mastery', 'Take', (t) => D.MASTS[t].d, (t) => D.MASTS[t].n], ult: ['Second ultimate!', 'Learn', (t) => `<span class="tag">${D.ULTS[t].cd}s</span> ${D.ULTS[t].d}`, (t) => D.ULTS[t].n] };
  async function pickPends(S) {
    for (const g of S.glads) {
      let guard = 0;
      while (g.pend && g.pend.length && guard++ < 8) {
        const p0 = g.pend[0]; const M = PICKT[p0.t];
        const t = await U.dialog(`<h2>${esc(g.name)}: ${M[0]}</h2><div class="muted" style="margin-bottom:8px">Level ${g.lvl}. Choose one for good.</div>` + p0.o.map((t) => `<div class="tech"><b>${M[3](t)}</b><div>${M[2](t)}</div>${btn(M[1] + ' ' + M[3](t), t)}</div>`).join(''));
        L.choosePick(g, t);
      }
    }
  }
  const pickTechs = pickPends;
  const confetti = (n) => '<div class="cfw">' + Array.from({ length: n }, (_, i) => `<i class="cf" style="left:${(i * 37) % 100}%;background:${['#f6b82d', '#d2412b', '#2f78c4', '#2a9d6f', '#f5ead2'][i % 5]};animation-delay:${((i * 53) % 25) / 10}s;animation-duration:${2 + (i % 5) * 0.3}s"></i>`).join('') + '</div>';
  async function stories(S, list) {
    for (const x of list) { U.snd('levelup'); await U.dialog(`<h2>${esc(x.g.name)}'s story</h2><div class="row" style="justify-content:center">${U.spr(x.g, { size: 90 })}</div><div style="text-align:center;margin:6px 0"><b>${esc(x.st.n)}</b>: ${esc(x.st.text)}</div><div class="card" style="background:#fff3c4"><b>Goal reached!</b> ${esc(x.g.name)} is now ${esc(x.st.rew.title)}.<div class="row wrap" style="margin-top:4px"><span class="pill">+${x.st.rew.v} ${D.SA[x.st.rew.stat]}</span><span class="pill">${A.icon('fame', 12)} +${x.st.rew.fame}</span></div></div>` + btn('Wonderful', 'ok', 'green')); }
  }
  async function trophies(S) {
    const t = L.checkTrophies(S); if (!t.length) return; U.snd('levelup'); U.save();
    await U.dialog(`<h2>${t.length > 1 ? 'Trophies earned!' : 'Trophy earned!'}</h2>` + t.map((x) => `<div class="itm" style="cursor:default;border-color:var(--gold);background:#fff3c4"><div class="sbadge" style="background:var(--gold);width:40px;height:40px">${A.icon('fame', 26)}</div><div class="sp"><div class="gname" style="font-size:14px">${esc(x.n)}</div><div class="muted" style="opacity:1">${esc(x.d)}</div><div class="row wrap" style="margin-top:3px">${x.r.gold ? `<span class="pill">${A.icon('coin', 12)} +${x.r.gold}</span>` : ''}${x.r.fame ? `<span class="pill">${A.icon('fame', 12)} +${x.r.fame}</span>` : ''}${x.r.laurels ? `<span class="pill">${A.icon('laurel', 12)} +${x.r.laurels}</span>` : ''}</div></div></div>`).join('') + btn('Shiny!', 'ok', 'green'));
    U.render();
  }
  async function pickAug(S, level, have, force, title, seed) {
    let offer = seed ? L.withRandom(seed, () => L.augOffer(S, level, have, force)) : L.augOffer(S, level, have, force); let rerolls = 1 + L.facPerks(S).rerolls;
    for (;;) {
      const v = await U.dialog(`<h2>${title || 'Choose an augment'}</h2><div class="muted" style="margin-bottom:8px">Lasts for this fight${have && have.length ? ' (on top of ' + have.length + ' from earlier rounds)' : ''}. Silver, Gold or Prismatic: pick one.</div>` + offer.map((a) => `<div class="itm" data-a="res" data-v="${a.id}" style="border-color:${D.TIERS[a.t].c};box-shadow:0 0 0 3px ${D.TIERS[a.t].c}66"><div class="sp"><span class="tag" style="background:${D.TIERS[a.t].c}">${D.TIERS[a.t].n}</span><div class="gname" style="font-size:14px">${a.n}</div><div class="muted" style="opacity:1">${a.d}</div></div></div>`).join('') + (rerolls > 0 ? btn(`Reroll (${rerolls} free)`, 'reroll', 'ghost') : ''));
      if (v === 'reroll') { rerolls--; offer = L.augOffer(S, level, have, force); continue; }
      return D.AUGMENTS.find((a) => a.id === v);
    }
  }

  function trainHtml(S, rep, wk) {
    let h = `<h2>Week ${wk} training</h2>`;
    h += rep.lines.map((l) => { const g = U.gOf(l.id); return `<div class="itm" style="cursor:default"><div style="width:40px;height:46px;overflow:hidden;display:flex;align-items:flex-end;justify-content:center">${U.spr(g, { size: 42 })}</div><div class="sp"><div class="gname" style="font-size:12px">${esc(l.name)}</div><div class="small">${esc(l.txt)}</div></div></div>`; }).join('');
    if (rep.menuCost) h += `<div class="small">Kitchen: -${fmt(rep.menuCost)} gold</div>`;
    const due = L.dueKeys(S).length;
    return h + btn(due ? 'To the arena!' : 'Continue', 'ok', 'red');
  }
  function summaryHtml(S, fin, wk) {
    let h = `<h2>Week ${wk} done</h2><div class="kv"><span>Upkeep paid</span><b>-${fmt(fin.upkeep)}</b></div><div class="kv"><span>Market income</span><b>+${fmt(fin.income)}</b></div><div class="kv"><span>Gold now</span><b>${fmt(S.gold)}</b></div>`;
    fin.notes.forEach((n) => { h += `<div class="small" style="margin-top:6px">${esc(n)}</div>`; });
    if (fin.season) h += `<div class="card" style="margin-top:10px;background:var(--gold);overflow:hidden">${confetti(24)}<b class="h">Season ${fin.season} begins!</b><div class="small">Rivals have grown stronger. New prizes, new faces.</div></div>`;
    if (fin.recap) h += `<div class="recap"><b>SEASON ${fin.season - 1} RECAP</b><div class="small" style="font-weight:700;margin-top:4px">Record: <b>${fin.recap.wins}W ${fin.recap.losses}L</b> · Fame gained: <b>${fin.recap.fame}</b> · Tournaments won: <b>${fin.recap.tour}</b>${fin.recap.mvp ? `<br>MVP: <b>${esc(fin.recap.mvp.name)}</b> with ${fin.recap.mvp.w} win${fin.recap.mvp.w > 1 ? 's' : ''}` : ''}${fin.recap.rival ? `<br>Rivals of the Year: <b>${esc(fin.recap.rival.a)}</b> and <b>${esc(fin.recap.rival.b)}</b> (+${fin.recap.rival.fame} fame)` : ''}</div></div>`;
    return h + btn('Continue', 'ok');
  }

  // ---------- running one event ----------
  async function runEvent(S, ev, gl, en) {
    if (ev.kind === 'tourney' || ev.kind === 'grand') return runTourney(S, ev, gl[0]);
    const stance = await prep(S, ev, gl, ev.opps, {}); const bet = commit(S);
    const aug = await pickAug(S, ev.league, [], ev.kind === 'grand');
    const res = await fightScreen(S, gl, ev.opps, stance, { ev, tricks: bet.tricks, augs: [aug] });
    const rep = L.settle(S, ev, gl, res); settleBets(S, bet, res, rep.notes);
    await results(S, ev, gl, res, rep);
  }
  async function runTourney(S, ev, g) {
    const T = L.tourneyInit(S, ev, g); let champion = false; let hype = 0; let hpf = 1; let odds = null; const notes = []; const augs = [];
    const names = ev.size === 8 ? ['Quarterfinal', 'Semifinal', 'Final'] : ['Semifinal', 'Final'];
    for (;;) {
      const opp = L.tourneyOpp(T); const name = names[T.round];
      const stance = await prep(S, ev, [g], [opp], { T, name, hpf: T.hpf }); const bet = commit(S);
      augs.push(await pickAug(S, Math.min(3, ev.league + (T.round >= 1 ? 1 : 0)), augs, ev.kind === 'grand' && T.round === names.length - 1, `${name}: new augment`));
      const res = await fightScreen(S, [g], [opp], stance, { ev, hpf: { [g.id]: T.hpf }, tricks: bet.tricks, augs: augs.slice() });
      settleBets(S, bet, res, notes);
      hype = Math.max(hype, res.hype); hpf = res.hpf[g.id]; if (odds == null) odds = res.odds;
      const r = L.tourneyAdvance(S, T, res.win);
      if (res.win) {
        if (r.champion) { champion = true; break; }
        T.hpf = Math.min(1, hpf + 0.4 + (g.trait === 'hordearius' ? 0.1 : 0));
        await U.dialog(`<h2>${name} won!</h2><div class="small">${esc(g.name)} advances. Wounds carry over: next round starts at <b>${Math.round(T.hpf * 100)}% HP</b>.</div>` + btn('Next round', 'ok', 'red'));
      } else break;
    }
    const place = L.placeOf(T, champion);
    const res = { win: champion, place, hype, hpf: { [g.id]: hpf }, odds };
    const rep = L.settle(S, ev, [g], res); rep.notes.push(...notes);
    await results(S, ev, [g], res, rep);
  }

  function bracketHtml(T) {
    const rounds = Math.log2(T.size); let h = '<div class="brk">';
    for (let r = 0; r < rounds; r++) {
      const names = ['Quarterfinal', 'Semifinal', 'Final']; const title = rounds === 2 ? ['Semifinal', 'Final'][r] : names[r];
      const players = r === 0 ? Array.from({ length: T.size }, (_, i) => i) : (T.hist[r - 1] || Array(T.size >> r).fill(-1)); const done = r < T.hist.length;
      h += `<div class="col"><h4>${title}</h4>`;
      for (let i = 0; i < players.length; i += 2) {
        h += '<div class="m">' + [players[i], players[i + 1]].map((sl) => { if (sl < 0 || sl === undefined) return '<div class="p">?</div>'; const g = T.slots[sl]; const won = done && T.hist[r].includes(sl); const cls = (sl === 0 ? 'me ' : '') + (done ? (won ? 'w' : 'l') : ''); return `<div class="p ${cls}">${A.styleIcon(g.style, 13)}<span>${sl === 0 ? 'YOU' : esc(g.name)}</span></div>`; }).join('') + '</div>';
      }
      h += '</div>';
    }
    return h + '</div>';
  }
  async function rivalryEvent(S) {
    if (!S.pendingRiv) return; const [ia, ib] = S.pendingRiv; const a = U.gOf(ia), b = U.gOf(ib); if (!a || !b) { S.pendingRiv = null; return; }
    const c = await U.dialog(`<h2>Rivalry boils over!</h2><div class="row" style="justify-content:space-around;align-items:flex-end">${U.spr(a, { size: 84, mood: 'fight' })}<div class="h" style="font-size:22px">VS</div>${U.spr(b, { size: 84, mood: 'fight', flip: true })}</div><div style="text-align:center;margin:6px 0"><b>${esc(a.name)}</b> and <b>${esc(b.name)}</b> keep going at each other. Something has to give.</div><button class="btn full red" data-a="res" data-v="duel">Settle it in the arena</button><div class="tiny muted" style="text-align:center">A friendly bout: nobody gets hurt. The winner gains 40 XP, the loser 20.</div><button class="btn full green" style="margin-top:8px" data-a="res" data-v="partner">Make them training partners (+20 bond)</button><button class="btn full ghost" style="margin-top:8px" data-a="res" data-v="ignore">Ignore it</button>`);
    let winner = null;
    if (c === 'duel') { const clone = Object.assign({}, b, { color: '#2f78c4', id: 'bout' + b.id }); const res = await fightScreen(S, [a], [clone], 'bal', { ev: { kind: 'spar', title: 'Rivalry Bout', league: 0, opps: [clone] } }); winner = res.win ? a.id : b.id; }
    const out = L.rivalryResolve(S, a, b, c, winner); U.save(); U.render(); await U.dialog(`<h2>Rivalry</h2>${out.lines.map((x) => `<div style="margin:6px 0">${esc(x)}</div>`).join('')}` + btn('Okay', 'ok')); await pickPends(S); await trophies(S);
  }
  // ---------- prep ----------
  const PREP = { wager: 0, mult: 1, tricks: {}, gold: 0, lvl: 1 };
  const STN = [['bal', '', ''], ['agg', 'red'], ['grd', 'blue'], ['cun', 'green']];
  const trickCost = (t) => t.cost(PREP.lvl);
  function prepCost() { return Object.keys(PREP.tricks).filter((k) => PREP.tricks[k]).reduce((a, k) => a + trickCost(D.TRICKS.find((t) => t.id === k)), 0) + PREP.wager; }
  function prepPaint() {
    document.querySelectorAll('[data-a=pwager]').forEach((b) => b.classList.toggle('on', +b.dataset.v === PREP.wager));
    document.querySelectorAll('[data-a=ptrick]').forEach((b) => b.classList.toggle('on', !!PREP.tricks[b.dataset.v]));
    const c = $('#pcost'); if (c) c.textContent = prepCost() ? `Pre-fight spend: ${fmt(prepCost())} gold` : '';
  }
  ACT.pwager = (el) => { const v = +el.dataset.v; const tr = prepCost() - PREP.wager; if (v && tr + v > PREP.gold) return U.toast('Not enough gold'); PREP.wager = v; U.snd('click'); prepPaint(); };
  ACT.ptrick = (el) => { const id = el.dataset.v; const T = D.TRICKS.find((t) => t.id === id); if (!PREP.tricks[id] && prepCost() + trickCost(T) > PREP.gold) return U.toast('Not enough gold'); PREP.tricks[id] = !PREP.tricks[id]; U.snd('click'); prepPaint(); };
  function prep(S, ev, gl, opps, o) {
    const lv = L.scoutLevel(S); const a = L.adv(gl[0].style, opps[0].style); const ctx = L.teamCtx(S, gl, 'bal');
    PREP.wager = 0; PREP.tricks = {}; PREP.gold = S.gold; PREP.lvl = Math.round(opps.reduce((x, y) => x + y.lvl, 0) / opps.length); PREP.mult = L.wagerMult(gl, opps, S);
    let h = `<h2>${o.name ? o.name + ': ' : ''}${ev.title}</h2>`;
    h += `<div class="row" style="justify-content:space-around;align-items:flex-end"><div style="text-align:center">${gl.map((g) => U.spr(g, { size: 70 })).join('')}<div class="gname" style="font-size:12px">${gl.map((g) => esc(g.name)).join(' & ')}</div></div><div class="h" style="font-size:22px">VS</div><div style="text-align:center">${opps.map((x) => A.gladOf(x, { size: 70, tunic: x.color, flip: true, mood: 'fight' })).join('')}<div class="gname" style="font-size:12px">${opps.map((x) => esc(x.name)).join(' & ')}</div></div></div>`;
    h += `<div class="row wrap" style="justify-content:center;margin:8px 0">${gl.length === 1 && opps.length === 1 ? U.advTag(a) : ''}${opps.map((x) => A.styleIcon(x.style, 22)).join('')}${opps[0].gh ? '<span class="tag" style="background:#7d7d8c;color:#fff">Your old champion</span>' : ''}</div>`;
    if (o.hpf != null && o.hpf < 1) h += `<div class="card" style="background:#f7c9c0"><b>Wounded:</b> starting at ${Math.round(o.hpf * 100)}% HP</div>`;
    if (gl.length > 1) h += `<div class="small">Synergy: ${ctx.list.length ? ctx.list.map((s) => `<b>${s.n}</b> (${s.d})`).join(', ') : 'none'}</div>`;
    const low = gl.filter((g) => g.en < 60); if (low.length) h += `<div class="small" style="color:var(--terra)">${low.map((g) => esc(g.name)).join(', ')} ${low.length > 1 ? 'are' : 'is'} tired (energy under 60). Stats reduced.</div>`;
    const wxId = ev.key ? L.weather(S, ev.key) : 'clear'; if (wxId !== 'clear') h += `<div class="small" style="margin-top:4px"><b>Weather: ${D.WEATHER[wxId].n}.</b> ${D.WEATHER[wxId].d}</div>`;
    if (o.T) h += `<div class="sec" style="color:var(--terra);text-shadow:none">Bracket</div>` + bracketHtml(o.T);
    if (ev.mut) h += `<div class="card" style="background:#e9d3ff;margin:6px 0"><b>Mutator: ${ev.mut.n}</b><div class="small">${ev.mut.d}</div></div>`;
    if (gl.length === 1) { const g = gl[0]; h += `<div class="small" style="margin-top:4px"><b>${esc(D.KEYSTONES[g.rune.k].n)}</b> rune · Ultimates: ${L.ultsOf(g).map((x) => '<b>' + D.ULTS[x].n + '</b>').join(', ')}${(S.relicOn || []).length ? ' · ' + S.relicOn.length + ' relic(s)' : ''}</div>`; }
    if (!o.pit) {
      h += `<div class="sec" style="color:var(--terra);text-shadow:none">The bookmaker</div><div class="small">The crowd only knows level and style, not stats. Spot a mispriced fight and back yourself. Pays <b>x${PREP.mult.toFixed(1)}</b> on a win.</div><div class="row wrap" style="margin-top:6px"><button class="btn sm on" data-a="pwager" data-v="0">No bet</button>${L.wagerOptions(S).map((v) => `<button class="btn sm ghost" data-a="pwager" data-v="${v}">${A.icon('coin', 12)}${fmt(v)}</button>`).join('')}</div>`;
      h += `<div class="sec" style="color:var(--terra);text-shadow:none">Dirty tricks</div>` + D.TRICKS.map((t) => `<div class="menu-opt" data-a="ptrick" data-v="${t.id}" style="margin-bottom:4px"><div class="sp"><div class="gname" style="font-size:12px">${t.n}</div><div class="tiny" style="font-weight:600">${t.d}${t.risk ? ` <b style="color:var(--terra)">${Math.round(t.risk * 100)}% risk of being caught (-15 fame)</b>` : ''}</div></div><div class="h" style="font-size:12px">${A.icon('coin', 12)}${trickCost(t)}</div></div>`).join('');
    }
    h += `<div id="pcost" class="small" style="margin-top:6px;font-weight:900"></div><div class="sec" style="color:var(--terra);text-shadow:none">Choose a battle plan</div><div class="muted" style="opacity:1;font-size:11px">A plan reshapes your stats for this fight. It is a build choice, not a counter.</div>`;
    h += STN.map(([id, c]) => {
      let odds = ''; if (lv >= 2 && gl.length * opps.length <= 6) odds = `<span class="pill">${Math.round(L.odds(S, gl, opps, id, 24) * 100)}%</span>`;
      return `<button class="btn full ${c}" style="margin-top:8px;justify-content:space-between;text-align:left" data-a="res" data-v="${id}"><span>${L.STANCES[id]}<br><span class="tiny" style="text-transform:none;opacity:.9;font-weight:700">${L.STANCE_D[id]}</span></span>${odds}</button>`;
    }).join('');
    const pr = U.dialog(h); setTimeout(prepPaint, 0); return pr;
  }
  // pay for the chosen bet and tricks; returns what the fight needs
  function commit(S) {
    const tricks = Object.keys(PREP.tricks).filter((k) => PREP.tricks[k]);
    const cost = prepCost(); S.gold = Math.max(0, S.gold - cost);
    return { wager: PREP.wager, mult: PREP.mult, tricks };
  }
  function settleBets(S, bet, res, notes) {
    if (bet.wager) { if (res.win) { const w = Math.round(bet.wager * bet.mult); S.gold += w; notes.push(`Bet won: +${fmt(w - bet.wager)} gold`); L.facGain(S, 'mer', 4); U.snd('coin'); } else notes.push(`Bet lost: -${fmt(bet.wager)} gold`); }
    bet.tricks.forEach((id) => { const T = D.TRICKS.find((t) => t.id === id); if (T.risk && Math.random() < T.risk) { S.fame = Math.max(0, S.fame - 15); L.facGain(S, 'sen', -8); notes.push(`Caught ${T.n.toLowerCase()}! -15 fame, the Senate frowns`); } });
  }

  const fightScreen = (S, gl, opps, stance, o) => G.LMFIGHT.run(S, gl, opps, stance, o);

  // ---------- results ----------
  async function results(S, ev, gl, res, rep) {
    const win = res.win;
    const isT = ev.kind === 'tourney' || ev.kind === 'grand';
    const place = res.place; const ord = (n) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 || n === 4 ? 'Semifinalist' : 'Out early');
    let h = isT && win ? confetti(40) : ''; h += isT ? `<div class="big ${win ? 'win' : 'lose'}">${win ? 'CHAMPION' : ord(place)}</div>` : `<div class="big ${win ? 'win' : 'lose'}">${win ? 'Victory' : 'Defeat'}</div>`;
    h += `<div class="row" style="justify-content:center;margin:6px 0">${gl.map((g) => U.spr(g, { size: 80, mood: win ? 'idle' : 'idle' })).join('')}</div>`;
    h += `<div class="row wrap" style="justify-content:center"><span class="pill">${A.icon('coin', 14)} +${fmt(rep.gold)}</span><span class="pill">${A.icon('fame', 14)} +${fmt(rep.fame)}</span>${res.odds != null && res.odds < 0.4 && win ? '<span class="tag green">Underdog win!</span>' : ''}</div>`;
    rep.notes.forEach((n) => { h += `<div class="small" style="text-align:center;margin-top:4px">${esc(n)}</div>`; });
    (rep.fac || []).forEach((x) => { h += `<div class="small" style="text-align:center"><span class="tag blue">${esc(x.text)}</span>${x.up ? ' <b>New perk: ' + esc(x.up) + '</b>' : ''}</div>`; });
    h += '<div style="margin-top:8px">' + rep.xp.map((x) => { const g = U.gOf(x.id); return `<div class="kv"><span>${esc(g.name)}</span><b>+${x.xp} XP${x.up.length ? ' · LEVEL ' + x.up[x.up.length - 1] + '!' : ''}</b></div>`; }).join('') + '</div>';
    rep.lvl.forEach((l) => { h += `<div class="lvlup">${esc(U.gOf(l.id).name)} reached LEVEL ${l.to}!</div>`; });
    if (rep.lvl.length) U.snd('levelup');
    rep.inj.forEach((i) => { h += `<div class="small" style="color:var(--terra)">${esc(U.gOf(i.id).name)} is injured for ${i.w} week${i.w > 1 ? 's' : ''}.</div>`; });
    rep.loot.forEach((it) => { h += `<div class="itm" style="cursor:default;margin-top:6px">${A.itemIcon(it.slot, it.rar, 38)}<div class="sp"><div class="gname" style="font-size:12px">${esc(it.name)}</div>${U.rarTag(it.rar)}<div class="muted" style="opacity:1">${U.fmtSt(it)}</div></div><span class="tag green">Loot!</span></div>`; });
    U.snd(win ? 'win' : 'lose');
    if (win && ev.kind === 'duel') {
      h += `<div class="sec" style="color:var(--terra);text-shadow:none">The crowd waits. Your call.</div><button class="btn full green" data-a="res" data-v="mercy">Show mercy <span class="tiny" style="text-transform:none">more fame, 30% they join you</span></button><button class="btn full ghost" style="margin-top:8px" data-a="res" data-v="show">Showboat <span class="tiny" style="text-transform:none">extra gold</span></button>`;
      const c = await U.dialog(h);
      const m = L.mercy(S, ev, rep, c);
      if (m.joined) await U.dialog(`<h2>A new recruit!</h2><div class="row" style="justify-content:center">${U.spr(m.joined, { size: 100 })}</div><div style="text-align:center;margin:8px 0"><b>${esc(m.joined.name)}</b> (${D.STYLES[m.joined.style].n}, Lv ${m.joined.lvl}) was moved by your mercy and joins your ludus!</div>` + btn('Welcome!', 'ok', 'green'));
      else if (c === 'mercy') U.toast(`The crowd loves it. +${m.f} fame.`);
      else U.toast(`+${m.gd} gold from the crowd.`);
    } else await U.dialog(h + btn('Continue', 'ok', win ? 'red' : ''));
    if (rep.choice) {
      const id = await U.dialog(`<h2>Champion's loot</h2><div class="muted" style="margin-bottom:8px">Choose one prize from the Emperor's gift table.</div>` + rep.choice.map((it) => `<div class="itm" data-a="res" data-v="${it.id}">${A.itemIcon(it.slot, it.rar, 40)}<div class="sp"><div class="gname" style="font-size:12px">${esc(it.name)}</div>${U.rarTag(it.rar)}<div class="muted" style="opacity:1">${U.fmtSt(it)}</div>${U.affTxt(it)}</div></div>`).join(''));
      const it = rep.choice.find((x) => x.id === id) || rep.choice[0]; L.addItem(S, it);
    }
    if (rep.relic) await dropDialog('relic', rep.relic);
    if (rep.rune) await dropDialog('rune', rep.rune);
    await pickPends(S); await trophies(S);
  }
  async function dropDialog(kind, d) {
    if (kind === 'relic') await U.dialog(`<h2>Relic found!</h2><div class="itm" style="cursor:default;border-color:${d.c}"><div class="sp"><div class="gname">${esc(d.n)}</div><div class="muted" style="opacity:1">${d.d}</div></div></div><div class="small">Relics boost every fighter. Equip them in the Armory, Relics tab.</div>` + btn('Nice', 'ok', 'green'));
    else { const r = d.kind === 'k' ? D.KEYSTONES[d.id] : D.MINORS[d.id]; await U.dialog(`<h2>Rune unlocked!</h2><div class="itm" style="cursor:default"><div class="sp"><div class="gname">${esc(r.n)} <span class="tag">${d.kind === 'k' ? 'Keystone' : 'Minor'}</span></div><div class="muted" style="opacity:1">${r.d}</div></div></div><div class="small">Set it on a fighter in their profile.</div>` + btn('Nice', 'ok', 'green')); }
  }

  // ---------- Pit of Trials ----------
  ACT.pit = (isDaily) => {
    const S = U.S(); if (isDaily !== true) U.pitDaily = false; if (!U.pitDaily && S.pitWeek === S.week) return U.toast('You already descended this week');
    const list = S.glads.filter((g) => g.inj <= 0 && g.en >= 30);
    U.modal(`<h2>${U.pitDaily ? 'Daily Descent' : 'Pit of Trials'}</h2><div class="muted" style="margin-bottom:8px">${U.pitDaily ? 'Same opponents and augment offers for everyone today. +30% gold, and a laurel for reaching floor 5. ' : ''}Pick one fighter (needs 30+ energy, costs 30). Floors get harder, every 5th is a boss. After each win pick a boon, then cash out or go deeper. Defeat keeps half the rewards.</div>` + (list.length ? list.map((g) => `<div class="itm" data-a="pitgo" data-id="${g.id}"><div style="width:44px;height:52px;overflow:hidden;display:flex;align-items:flex-end;justify-content:center">${U.spr(g, { size: 46 })}</div><div class="sp"><div class="gname" style="font-size:13px">${esc(g.name)}</div><div class="row"><span class="pill">Lv ${g.lvl}</span>${A.styleIcon(g.style, 18)}</div><div class="bar en" style="margin-top:3px"><i style="width:${g.en}%"></i></div></div></div>`).join('') : '<div class="empty" style="color:var(--ink)">Nobody is fit to descend.</div>'));
  };
  ACT.pitdaily = () => {
    const S = U.S(); if (L.dailyDone(S)) return U.toast('Come back tomorrow for the next Daily Descent'); U.pitDaily = true; ACT.pit(true);
  };
  ACT.pitgo = async (el) => {
    const S = U.S(); if (U.busy) return; const g = U.gOf(+el.dataset.id); U.closeModal(); U.busy = true; const daily = !!U.pitDaily; U.pitDaily = false;
    try { await runPit(S, g, daily); } catch (e) { console.error(e); U.toast('Oops: ' + e.message); } finally { U.busy = false; U.save(); U.render(); }
  };
  async function runPit(S, g, daily) {
    if (daily) S.daily = { day: L.dayKey(), best: 0 }; else S.pitWeek = S.week;
    const mut = L.mutator(daily ? 'd' + L.dayKey() : 'w' + S.week); g.en = Math.max(0, g.en - 30); const augs = []; let floor = 0; let hpf = 1; let lost = false;
    for (;;) {
      const opp = daily ? L.withRandom(L.dailySeed(floor + 1, 'o'), () => L.pitOpp(S, floor + 1, g)) : L.pitOpp(S, floor + 1, g); floor++;
      const ev = { kind: 'pit', title: (floor % 5 === 0 ? 'BOSS: ' : '') + 'Pit floor ' + floor, opps: [opp], league: 0, key: (daily ? 'pitd' + L.dayKey() : 'pitw' + S.week) + ':' + floor, mut };
      const stance = await prep(S, ev, [g], [opp], { pit: true, hpf });
      augs.push(await pickAug(S, floor < 3 ? 0 : floor < 6 ? 1 : floor < 10 ? 2 : 3, augs, floor % 5 === 0, `Floor ${floor}: new augment`, daily ? L.dailySeed(floor, 'a') : null));
      const res = await fightScreen(S, [g], [opp], stance, { ev, hpf: { [g.id]: hpf }, augs: augs.slice(), mutator: mut });
      if (!res.win) { floor--; lost = true; break; }
      hpf = Math.min(1, res.hpf[g.id] + 0.25);
      const cur = L.pitReward(S, floor, [], false); const nx = floor + 1;
      const go = await U.dialog(`<h2>Floor ${floor} cleared</h2><div class="small">${esc(g.name)} recovers to <b>${Math.round(hpf * 100)}% HP</b>. Banked: ${A.icon('coin', 12)} ${fmt(cur.gold)} · ${A.icon('fame', 12)} ${cur.fame}${cur.items.length ? ' · ' + cur.items.length + ' item(s)' : ''}${floor >= 5 ? ' · a relic for the boss' : ''}</div><div class="tiny muted" style="margin-top:6px">Augments: ${augs.map((b) => b.n).join(', ')}</div><div class="small" style="margin-top:6px">Floor ${nx}${nx % 5 === 0 ? ' is a BOSS floor' : ''} awaits. Each floor adds an augment.</div>` + btn('Descend!', 'go', 'red') + btn('Cash out', 'cash', 'ghost'));
      if (go === 'cash') break;
    }
    const rw = L.pitReward(S, floor, [], lost); if (daily) { rw.gold = Math.round(rw.gold * 1.3); S.daily.best = floor; S.dailyBest = Math.max(S.dailyBest || 0, floor); if (floor >= 5) { S.laurels += 1; rw.laurel = 1; } } S.gold += rw.gold; S.fame += rw.fame; S.pitBest = Math.max(S.pitBest || 0, floor);
    const xp = floor * 12 + 8; const up = L.addXp(g, xp); g.en = Math.max(0, g.en - 5); let inj = '';
    if (lost && Math.random() < 0.35) { g.inj = 1 + Math.floor(Math.random() * 2); inj = `${g.name} is injured for ${g.inj} week(s).`; }
    rw.items.forEach((it) => L.addItem(S, it));
    const relic = rw.boss ? L.dropRelic(S) : null; const rune = floor >= 3 && Math.random() < 0.5 ? L.unlockRune(S) : null;
    U.snd(lost ? 'lose' : 'win');
    await U.dialog(`<div class="big ${lost ? 'lose' : 'win'}">${lost ? 'Fallen' : 'Cashed out'}</div><div style="text-align:center;margin:6px 0">${U.spr(g, { size: 80 })}</div><div class="row wrap" style="justify-content:center"><span class="pill">Floors ${floor}</span>${daily ? '<span class="tag blue">Daily</span>' : ''}${rw.laurel ? '<span class="pill">' + A.icon('laurel', 14) + ' +1 laurel</span>' : ''}<span class="pill">${A.icon('coin', 14)} +${fmt(rw.gold)}</span><span class="pill">${A.icon('fame', 14)} +${rw.fame}</span><span class="pill">+${xp} XP${up.length ? ' · LEVEL ' + up[up.length - 1] : ''}</span></div>${inj ? `<div class="small" style="color:var(--terra);text-align:center">${esc(inj)}</div>` : ''}` + rw.items.map((it) => `<div class="itm" style="cursor:default;margin-top:6px">${A.itemIcon(it.slot, it.rar, 38)}<div class="sp"><div class="gname" style="font-size:12px">${esc(it.name)}</div>${U.rarTag(it.rar)}</div><span class="tag green">Loot</span></div>`).join('') + btn('Continue', 'ok'));
    if (relic) await dropDialog('relic', relic); if (rune) await dropDialog('rune', rune);
    await pickPends(S); await trophies(S);
  }

  // ---------- Horde Trial ----------
  ACT.horde = () => {
    const S = U.S(); if (S.hordeWeek === S.week) return U.toast('You already faced the horde this week');
    const list = S.glads.filter((g) => g.inj <= 0 && g.en >= 30);
    U.modal(`<h2>Horde Trial</h2><div class="muted" style="margin-bottom:8px">One fighter against wave after wave of weaker foes, packs growing up to five. Every second wave you pick an augment. Retreat after any wave to keep the rewards; defeat keeps 60%. Needs 30+ energy.</div>` + (list.length ? list.map((g) => `<div class="itm" data-a="hordego" data-id="${g.id}"><div style="width:44px;height:52px;overflow:hidden;display:flex;align-items:flex-end;justify-content:center">${U.spr(g, { size: 46 })}</div><div class="sp"><div class="gname" style="font-size:13px">${esc(g.name)}</div><div class="row"><span class="pill">Lv ${g.lvl}</span>${A.styleIcon(g.style, 18)}</div></div></div>`).join('') : '<div class="empty" style="color:var(--ink)">Nobody is fit.</div>'));
  };
  ACT.hordego = async (el) => {
    const S = U.S(); if (U.busy) return; const g = U.gOf(+el.dataset.id); U.closeModal(); U.busy = true;
    try { await runHorde(S, g); } catch (e) { console.error(e); U.toast('Oops: ' + e.message); } finally { U.busy = false; U.save(); U.render(); }
  };
  async function runHorde(S, g) {
    S.hordeWeek = S.week; g.en = Math.max(0, g.en - 30); const augs = []; let wave = 0; let hpf = 1; let lost = false;
    for (;;) {
      wave++; const opps = L.hordeWave(S, wave, g); const ev = { kind: 'horde', title: 'Horde wave ' + wave, opps, league: 0, key: 'horde' + S.week + ':' + wave };
      await U.dialog(`<h2>Wave ${wave}</h2><div class="row" style="justify-content:center;gap:2px">${opps.map((o) => A.gladOf(o, { size: 50, tunic: o.color, flip: true, mood: 'fight' })).join('')}</div><div class="small" style="text-align:center">${opps.length} fighter${opps.length > 1 ? 's' : ''}, level ${opps[0].lvl}. ${esc(g.name)} starts at ${Math.round(hpf * 100)}% HP.</div>` + btn('Fight!', 'ok', 'red'));
      if (wave % 2 === 0) augs.push(await pickAug(S, wave < 4 ? 0 : wave < 8 ? 1 : 2, augs, false, `Wave ${wave}: new augment`));
      const res = await fightScreen(S, [g], opps, 'bal', { ev, hpf: { [g.id]: hpf }, augs: augs.slice() });
      if (!res.win) { wave--; lost = true; break; }
      hpf = Math.min(1, res.hpf[g.id] + 0.2); const cur = L.hordeReward(S, wave, false);
      const go = await U.dialog(`<h2>Wave ${wave} cleared</h2><div class="small">${esc(g.name)} recovers to <b>${Math.round(hpf * 100)}% HP</b>. Banked: ${A.icon('coin', 12)} ${fmt(cur.gold)} · ${A.icon('fame', 12)} ${cur.fame}${cur.items.length ? ' · ' + cur.items.length + ' item(s)' : ''}</div>` + btn('Next wave', 'go', 'red') + btn('Retreat with rewards', 'cash', 'ghost'));
      if (go === 'cash') break;
    }
    const rw = L.hordeReward(S, wave, lost); S.gold += rw.gold; S.fame += rw.fame; S.hordeBest = Math.max(S.hordeBest || 0, wave);
    const xp = wave * 14 + 8; const up = L.addXp(g, xp); g.en = Math.max(0, g.en - 5); let inj = '';
    if (lost && Math.random() < 0.3) { g.inj = 1; inj = `${g.name} is injured for 1 week.`; }
    rw.items.forEach((it) => L.addItem(S, it)); U.snd(lost ? 'lose' : 'win');
    await U.dialog(`<div class="big ${lost ? 'lose' : 'win'}">${lost ? 'Overrun' : 'Retreated'}</div><div style="text-align:center;margin:6px 0">${U.spr(g, { size: 80 })}</div><div class="row wrap" style="justify-content:center"><span class="pill">Waves ${wave}</span><span class="pill">${A.icon('coin', 14)} +${fmt(rw.gold)}</span><span class="pill">${A.icon('fame', 14)} +${rw.fame}</span><span class="pill">+${xp} XP${up.length ? ' · LEVEL ' + up[up.length - 1] : ''}</span></div>${inj ? `<div class="small" style="color:var(--terra);text-align:center">${esc(inj)}</div>` : ''}<div class="small" style="text-align:center">Best: wave ${S.hordeBest}</div>` + btn('Continue', 'ok'));
    await pickPends(S); await trophies(S);
  }

  U.afterBoot = () => { U.checkPending(); };
  U.boot();
  U.afterBoot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
