// Cell Serpent: the "Goals" panel (lucky spin, weekly challenge, mastery, collection book), the always-visible
// Next Reward bar, the comeback gift and the one-more-run line on the result screen. Everything here is a gift.
import {
  SPIN_PRIZES, spinReady, doSpin, spinPrize, weekChallenge, ensureWeek, weekReady, claimWeek, WEEK_REWARD,
  masteryList, claimMastery, claimAllMastery, bookStatus, claimBook, rewardText, comebackGift, claimComeback, touchSeen,
  nextReward, nudgeFor, spinStreak, spinFrame, comebackLines, hasShield, SHIELD_AT, idleAmount, claimIdle,
} from './sim.js';
import { todayHTML, flyChips, flyReward } from './goals_polish.js';
import { riskHTML, bookCell, nextUnmet } from './keep_ui.js';
import { tomorrowPeek, questNear, stickerAlbum, claimSticker, stickerHint, stickerGridHTML } from './chase.js';

export function createAddictUI(c, openPanel, sec) {
  const { $, tile, audio } = c;
  const save = () => c.save();
  let comebackShown = false;
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const reduce = () => !!save().settings.reduceMotion;
  const after = () => { c.persist(); c.refreshCur(); };

  // ---- the bar that is always on the hub: the closest thing to unlock
  function renderNext() {
    const el = $('nextRew'); if (!el) return;
    const n = nextReward(save(), c.dayKey());
    el.className = 'nextrew' + (n.ready ? ' ready' : '');
    el.innerHTML = `<span class="nri">${n.icon}</span><span class="nrm"><b>${esc(n.label)}${n.more ? ` +${n.more}` : ''}</b>` +
      (n.ready ? '<em>Tap to collect</em>' : `<span class="nrb"><i style="width:${Math.round(n.frac * 100)}%"></i></span>`) + `</span>` + (n.ready ? '' : `<small>${esc(n.text)}</small>`);
    el.insertAdjacentHTML('beforeend', riskHTML(save(), c.dayKey()));
    el.onclick = () => { audio.unlock(); audio.play('click'); openGoals(); };
  }

  // streak shield: gifted at 7 and 14 spin days, forgives one missed day, used up when it saves the streak
  function shieldLine(sv, streak, pop) {
    if (hasShield(sv)) return `<span class="shieldrow on${pop ? ' pop' : ''}"><i>🛡️</i>Streak Shield ready: it forgives one missed day</span>`;
    const nx = SHIELD_AT.find(a => a > streak);
    return nx ? `<span class="shieldrow"><i>🛡️</i>Streak Shield at ${nx} days</span>` : '';
  }
  // a finished book page: confetti rains over the page, a COMPLETE! ribbon pops, the bar shines
  function pageDone(id) {
    const box = document.querySelector('.bookcat[data-cat="' + id + '"]'); if (!box) return;
    box.scrollIntoView({ block: 'center', behavior: reduce() ? 'auto' : 'smooth' });
    box.classList.add('bkdone'); setTimeout(() => box.classList.remove('bkdone'), 2300);
    if (reduce()) return;
    const cols = ['#6fe08a', '#ffd24a', '#ff7eb6', '#4fd8f0', '#fff'];
    for (let i = 0; i < 46; i++) {
      const p = document.createElement('i'); p.className = 'cfp sq'; const x = (Math.random() - 0.5) * 100;
      p.style.cssText = `left:${50 + x * 0.9}%;top:-4px;background:${cols[i % cols.length]};--dx:${x * 0.8}px;--dy:${70 + Math.random() * 110}px;animation-delay:${Math.random() * 0.35}s`;
      box.appendChild(p); setTimeout(() => p.remove(), 1700);
    }
  }
  // little confetti for the lucky spin, more of it on a longer streak (cosmetic only)
  function burst(host, n, color) {
    const cols = [color, '#ff7eb6', '#4fd8f0', '#9dff6d', '#ffd24a'];
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i'); p.className = 'cfp'; const a = Math.random() * 6.283, d = 60 + Math.random() * 110;
      p.style.cssText = `background:${cols[i % cols.length]};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 30}px`; host.appendChild(p); setTimeout(() => p.remove(), 1200);
    }
  }

  // ---- the goals panel
  function openGoals() {
    openPanel('GOALS', body => build(body), () => { c.openHub(); });
  }
  function rebuild() { const body = $('pBody'), top = body.scrollTop; body.innerHTML = ''; build(body); body.scrollTop = top; }
  function grid(body) { const g = document.createElement('div'); g.className = 'tiles'; body.appendChild(g); return g; }
  function build(body) {
    const s = save(), day = c.dayKey();
    // (the old readybar banner is folded into the Today strip as tappable chips)
    { const wk0 = ensureWeek(s, day), nm = masteryList(s).filter(m => m.ready >= 0).length, nb = bookStatus(s).cats.filter(k => k.ready && !s.addict.claimed['book:' + k.id]).length;
      const bits = []; if (spinReady(s, day)) bits.push({ go: 'Lucky Spin', text: '🎡 Spin' }); if (!wk0.claimed && weekReady(s, day)) bits.push({ go: 'Weekly Challenge', text: '🏅 Weekly' }); if (nm) bits.push({ go: 'Mastery', text: '🐍 ' + nm + ' rank' + (nm > 1 ? 's' : '') }); if (nb) bits.push({ go: 'Collection Book', text: '📖 Book' });
      const td = document.createElement('div'); td.innerHTML = todayHTML(s, day, bits); const tdy = td.firstChild; body.appendChild(tdy);   // round 7 rhythm strip, round 8 holds the ready chips
      tdy.querySelectorAll('.tdgo').forEach(bt => { bt.onclick = () => { audio.play('click'); const h = [...body.querySelectorAll('.sec span')].find(x => x.textContent.trim().indexOf(bt.dataset.go) === 0); if (h) h.scrollIntoView({ block: 'start', behavior: reduce() ? 'auto' : 'smooth' }); }; }); }
    // lucky spin
    sec(body, 'Lucky Spin', '#ff7eb6');
    const w = document.createElement('div'); w.className = 'spinbox';
    const ready = spinReady(s, day), streak = spinStreak(s, day) + (ready ? 1 : 0), fr = spinFrame(streak);
    w.innerHTML = `<div class="spinstreak"><b>${streak > 1 ? '🔥 ' + streak + ' day streak' : 'Spin daily to build a streak'}</b><small>${esc(fr.name)}${fr.next ? '. Next look at ' + fr.next + ' days' : '. Top look!'}</small>${shieldLine(s, streak)}</div><div class="wheelwrap"><i class="wptr">${fr.ptr}</i><div class="wheel" id="wheel" style="border-color:${fr.color};box-shadow:0 5px 0 #8a6a10${fr.glow ? `,0 0 ${fr.glow}px ${fr.color}` : ''}">${SPIN_PRIZES.map((p, i) => `<span class="wseg" style="transform:rotate(${i * 45}deg) translateY(-82px)"><b style="transform:rotate(${-i * 45}deg)">${p.icon}</b></span>`).join('')}</div></div>` +
      `<div class="spinmsg" id="spinMsg">${ready ? 'One free spin every day. Just for fun!' : 'Today you won ' + esc(rewardText(SPIN_PRIZES[s.addict.spin.prize >= 0 ? s.addict.spin.prize : spinPrize(day)].reward)) + '. Come back tomorrow!'}</div>` + (ready ? '' : `<div class="spinpeek" id="spinPeek">${esc(tomorrowPeek(day).line)}</div>`) +
      `<button class="btn small go gold" id="spinGo" ${ready ? '' : 'disabled'}>${ready ? 'SPIN' : 'SEE YOU TOMORROW'}</button>`;
    body.appendChild(w);
    w.querySelector('#spinGo').onclick = () => {
      audio.unlock(); const r = doSpin(save(), day); if (!r) return; after(); audio.play('click');
      const wheel = w.querySelector('#wheel'), btn = w.querySelector('#spinGo'); btn.disabled = true; btn.textContent = 'SPINNING...';
      wheel.style.transition = reduce() ? 'none' : 'transform 3s cubic-bezier(.15,.7,.2,1)'; wheel.style.transform = `rotate(${360 * 4 - r.index * 45}deg)`;
      setTimeout(() => { audio.play('levelup'); w.querySelector('#spinMsg').textContent = 'You won ' + rewardText(r.prize.reward) + '!' + (r.gift ? ' And a Streak Shield!' : '') + (r.saved ? ' Your shield saved the streak!' : ''); if (r.gift || r.saved) { const sh = w.querySelector('.shieldrow'); if (sh) sh.outerHTML = shieldLine(save(), save().addict.spin.n, r.gift); } btn.textContent = 'SEE YOU TOMORROW'; { const pk = document.createElement('div'); pk.className = 'spinpeek'; pk.id = 'spinPeek'; pk.textContent = tomorrowPeek(day).line; btn.before(pk); } w.querySelector('.wseg:nth-child(' + (r.index + 1) + ')').classList.add('win'); renderNext(); if (!reduce()) { burst(w.querySelector('.wheelwrap'), fr.burst + 8, fr.color); flyReward(w.querySelector('.wheelwrap'), r.prize.reward, false); } }, reduce() ? 0 : 3100);
    };
    // weekly challenge
    sec(body, 'Weekly Challenge', '#ffd24a');
    const wc = weekChallenge(day), wk = ensureWeek(s, day), wdone = weekReady(s, day), wclaimed = !!wk.claimed;
    { const di = ((day | 0) + 3) % 7, left = 6 - di, pct = Math.min(100, Math.round(wk.prog / wc.target * 100)), per = Math.ceil((wc.target - wk.prog) / (left + 1));
      const pips = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => `<i class="${i < di ? 'past' : i === di ? 'now' : ''}">${l}</i>`).join('');
      const rc = [WEEK_REWARD.sparkles ? `✨ ${WEEK_REWARD.sparkles}` : '', WEEK_REWARD.eggs ? `🥚 ${WEEK_REWARD.eggs}` : '', WEEK_REWARD.energy ? `⚡ ${WEEK_REWARD.energy}` : ''].filter(Boolean).map(x => `<b>${x}</b>`).join('');
      const hint = wclaimed ? 'Claimed, see you on Monday!' : wdone ? 'Done! Come and get it' : per <= 0 ? '' : left === 0 ? 'Last day, you can do it!' : `About ${per} a day gets you there`;
      const card = document.createElement('div'); card.className = 'wkcard' + (wclaimed ? ' claimed' : wdone ? ' ready' : '');
      card.innerHTML = `<div class="wkt"><span class="wki">🏅</span><b>${esc(wc.text)}</b></div><div class="wkdays">${pips}<em>${left ? left + (left === 1 ? ' day left' : ' days left') : 'Last day'}</em></div><div class="wkbar"><i style="width:${pct}%"></i><span>${wk.prog} / ${wc.target}</span></div><div class="wkh">${esc(hint)}</div><div class="wkr">${rc}</div>`;
      const wb = document.createElement('button'); wb.className = 'btn small go gold'; wb.disabled = !wdone; wb.textContent = wclaimed ? 'CLAIMED' : wdone ? 'CLAIM' : 'KEEP GOING';
      wb.onclick = () => { const fl = [...card.querySelectorAll('.wkr b')]; if (claimWeek(save(), day)) { after(); audio.play('levelup'); flyChips(fl, reduce()); if (!reduce()) burst(card, 18, '#ffd24a'); setTimeout(() => { rebuild(); renderNext(); }, reduce() ? 0 : 700); } };
      card.appendChild(wb); body.appendChild(card); }
    // mastery
    sec(body, 'Mastery', '#4fd8f0');
    // closest to the next rank first: ready ones on top, finished ones last, so the list always shows what to chase
    const mfrac = m => m.ready >= 0 ? 2 : m.next ? Math.min(1, m.val / m.next.at) : -1;
    const ms = masteryList(s).map((m, i) => ({ m, i })).sort((a, b) => mfrac(b.m) - mfrac(a.m) || a.i - b.i).map(x => x.m);
    const claimAll = document.createElement('button'); claimAll.className = 'btn small alt'; claimAll.style.marginBottom = '6px';
    claimAll.textContent = 'CLAIM ALL'; claimAll.disabled = !ms.some(m => m.ready >= 0);
    claimAll.onclick = () => { const n = claimAllMastery(save()); if (n) { after(); audio.play('levelup'); c.toast && c.toast(n + ' mastery reward' + (n > 1 ? 's' : '')); rebuild(); renderNext(); } };
    body.appendChild(claimAll);
    const mg = grid(body);
    for (const m of ms) {
      const rdy = m.ready >= 0, target = rdy ? m.miles[m.ready] : m.next, full = !rdy && !m.next;
      const pips = m.miles.map((_x, i) => `<i class="${i < m.done ? 'on' : ''}"></i>`).join('');
      mg.appendChild(tile({ cls: 't-weapon mast', ic: m.kind === 'sk' ? c.icon(m.id) : (c.bodyURL && c.bodyURL(m.id) ? `<img src="${c.bodyURL(m.id)}" alt="">` : '🐍'), name: esc(m.name), chip: 'Rank ' + m.done + '/' + m.miles.length, desc: full ? 'Master!' : 'Reward: ' + rewardText(target.reward),
        bar: full ? 100 : Math.round(Math.min(1, m.val / target.at) * 100), barText: full ? m.val + ' ' + m.unit : m.val + ' / ' + target.at + ' ' + m.unit, pips,
        btn: rdy ? 'CLAIM' : full ? 'DONE' : 'KEEP GOING', gold: rdy, disabled: !rdy, onclick: ev => { const rwm = rdy && target.reward, fb = ev && ev.currentTarget; if (claimMastery(save(), m.key, m.ready)) { flyReward(fb, rwm, reduce()); after(); audio.play('levelup'); rebuild(); renderNext(); } } }));
    }
    // collection book
    const bk = bookStatus(s);
    sec(body, `Collection Book ${bk.got}/${bk.total}`, '#6fe08a');
    for (const cat of bk.cats) {
      const box = document.createElement('div'); box.className = 'bookcat'; box.dataset.cat = cat.id;
      box.classList.toggle('pagefull', cat.got >= cat.total); box.innerHTML = `<div class="bch"><b><i class="bci">${{ species: '🐍', pets: '🐾', keeps: '🎁', outfits: '👗' }[cat.id] || '📖'}</i>${esc(cat.name)}</b><span>${cat.got}/${cat.total}</span><em class="bcp">${Math.round(cat.got / cat.total * 100)}%</em></div><div class="bcg">${cat.list.map(x => bookCell(x, cat.id, c, s, nextUnmet(cat.list))).join('')}</div><div class="bcbar${cat.got >= cat.total ? ' full' : ''}"><i style="width:${Math.round(cat.got / cat.total * 100)}%"></i></div>`;
      const b = document.createElement('button'); b.className = 'btn small go gold'; b.disabled = !cat.ready;
      b.textContent = s.addict.claimed['book:' + cat.id] ? 'COMPLETE' : cat.ready ? 'CLAIM ' + rewardText(cat.reward) : 'Complete for ' + rewardText(cat.reward);
      b.onclick = () => { const rwb = cat.reward; if (claimBook(save(), cat.id)) { flyReward(b, rwb, reduce()); after(); audio.play('levelup'); rebuild(); renderNext(); pageDone(cat.id); } };
      box.appendChild(b); body.appendChild(box);
    }
    const ag = grid(body);
    bk.all.forEach(m => ag.appendChild(tile({ cls: 't-gold one', ic: '📖', name: `Book ${Math.round(m.at * 100)}% full`, desc: rewardText(m.reward), btn: s.addict.claimed['book:all' + m.i] ? 'CLAIMED' : m.ready ? 'CLAIM' : Math.round(bk.got / bk.total * 100) + '%', gold: true, disabled: !m.ready,
      onclick: ev => { const fb = ev && ev.currentTarget; if (claimBook(save(), 'all' + m.i)) { flyReward(fb, m.reward, reduce()); after(); audio.play('levelup'); rebuild(); renderNext(); } } })));
    // round 9: stage stickers
    { const al = stickerAlbum(s);
      sec(body, `Stage Stickers ${al.gold}/${al.cells.length}`, '#ffd24a');
      const box = document.createElement('div'); box.className = 'stkbox';
      box.innerHTML = `<div class="stkh">${esc(stickerHint(al))}</div>${stickerGridHTML(al)}<div class="stkm">${al.miles.map(m => `<button class="stkb${m.ready ? ' rdy' : ''}${m.claimed ? ' got' : ''}" data-at="${m.at}" ${m.ready ? '' : 'disabled'}><b>${m.claimed ? '✔' : '★ ' + m.at}</b><small>${esc(rewardText(m.reward))}</small></button>`).join('')}</div>`;
      body.appendChild(box);
      box.querySelectorAll('.stkb').forEach(bt => { bt.onclick = () => { const at = +bt.dataset.at, m = al.miles.find(x => x.at === at); if (claimSticker(save(), at)) { flyReward(bt, m.reward, reduce()); after(); audio.play('levelup'); rebuild(); renderNext(); } }; }); }
  }

  // the tip jar chip on the welcome card: only when a fair amount has piled up
  function idleChip() {
    const n = idleAmount(save(), Date.now()); if (n < 40) return '';
    return `<button class="cbidle" id="cbIdle" aria-label="Collect ${n} Beats from the tip jar"><b>🧺</b><span>The tip jar is full: <em>+${n} Beats</em></span><i>COLLECT</i></button>`;
  }
  // ---- welcome back: a friendly gift after a break, shown once per visit, never expires
  function maybeComeback() {
    const s = save(), now = Date.now(), g = comebackGift(s, now);
    if (!g) { touchSeen(s, now); c.persist(); return false; }
    if (comebackShown) return false;
    comebackShown = true;
    const lines = comebackLines(s, c.dayKey(), now);
    openPanel('WELCOME BACK!', body => {
      const d = document.createElement('div'); d.className = 'comeback';
      const wait = lines.slice(1, -1).map(x => { const m = /^(\S+)\s+(.*)$/.exec(x); return m && m[1].charCodeAt(0) > 255 ? { ic: m[1], tx: m[2] } : { ic: '🐾', tx: x }; });
      const chips = rw => [rw.beats ? ['🪙', rw.beats, 'Beats'] : 0, rw.sparkles ? ['✨', rw.sparkles, 'Sparkles'] : 0, rw.energy ? ['⚡', rw.energy, 'Energy'] : 0, rw.eggs ? ['🥚', rw.eggs, rw.eggs > 1 ? 'Eggs' : 'Egg'] : 0].filter(Boolean).map(x => `<i class="cbchip"><b>${x[0]}</b>+${x[1]}<small>${x[2]}</small></i>`).join('');
      d.innerHTML = `<div class="cbi"><span class="cbpet">🐱</span><button class="cbbox" id="cbBox" aria-label="Open your gift">🎁</button><span class="cbpet b">🐶</span></div><div class="cbt">We missed you!</div><div class="cbs">${esc(lines[0] || '')} ${g.days} days away, so here is a little gift from the whole band. Tap the box!</div><div class="cbr" id="cbR"></div><div class="cbwait"><em>Waiting for you</em>${wait.map(x => `<span><b>${x.ic}</b>${esc(x.tx)}</span>`).join('')}</div>${idleChip()}<div class="cbkind">${esc(lines[lines.length - 1] || '')}</div>`;
      const b = document.createElement('button'); b.className = 'btn'; b.textContent = 'OPEN MY GIFT'; const later = { remove() {} };
      let opened = false;
      const open = () => {
        if (opened) { c.openHub(); return; }
        opened = true; if (claimComeback(save(), Date.now())) { after(); audio.play('levelup'); }
        const box = d.querySelector('#cbBox'); box.classList.add('open'); box.textContent = '🎉'; d.querySelector('#cbR').innerHTML = chips(g.reward); d.classList.add('opened');
        if (!reduce()) burst(d.querySelector('.cbi'), 30, '#ffd24a');
        b.textContent = "LET'S PLAY!"; later.remove();
      };
      { const ib = d.querySelector('#cbIdle'); if (ib) ib.onclick = () => {   // round 7: Backstage tips waiting, collected with one tap
        const n = claimIdle(save(), Date.now()); if (!n) return; after(); audio.play('coin'); ib.disabled = true; ib.classList.add('got'); ib.innerHTML = '<b>🧺</b><span>Collected <em>+' + n + ' Beats</em></span><i>&#10003;</i>'; flyChips([ib.querySelector('em') ? { getBoundingClientRect: () => ib.getBoundingClientRect(), textContent: '🪙' } : ib], reduce()); } }
      d.querySelector('#cbBox').onclick = open; b.onclick = open;
      d.appendChild(b); body.appendChild(d);
    }, () => { c.openHub(); });
    return true;
  }

  // ---- one more run: a near miss and the next reward on the result screen
  function renderResultNudge(r, prevPct) {
    const el = $('rNudge'); if (!el) return;
    const line = nudgeFor(save(), r, prevPct), n = nextReward(save(), c.dayKey()), qn = questNear(save(), c.dayKey());
    el.innerHTML = (line ? `<div class="nudge">${esc(line)}</div>` : '') +
      (qn && !n.ready ? `<div class="nudge2 qnear">${qn.icon} ${esc(qn.text)}</div>` : `<div class="nudge2">${n.icon} ${esc(n.label)}${n.ready ? ' (collect it in Goals)' : ' ' + esc(n.text)}</div>`);
  }
  return { renderNext, openGoals, maybeComeback, renderResultNudge };
}
