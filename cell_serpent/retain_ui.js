// Cell Serpent: round 2 retention UI. The Daily Quests strip on the Battle tab, the quests + chest panel,
// the 30 day Season panel and the tiny achievement toast. Everything here is a free gift, none of it is required.
import {
  questState, claimQuestChest, seasonStatus, claimSeason, ensureSeason, clearSeasonNote, SEASON_DAYS,
  achievementCount, popAchievements, rewardText, spinStreak, spinFrame, hasShield,
} from './sim.js';
import { landStamp } from './keep_ui.js';

export function createRetainUI(c, openPanel, sec, openTrophies) {
  const { $, tile, audio } = c;
  const save = () => c.save();
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const after = () => { c.persist(); c.refreshCur(); };
  const reduce = () => !!save().settings.reduceMotion;

  // ---- the strip: three quest segments, the chest, and two small pills (Season, Achievements)
  function renderStrip() {
    const el = $('qStrip'); if (!el) return;
    const day = c.dayKey(), s = save(), q = questState(s, day), se = seasonStatus(s, day), ac = achievementCount(s);
    ensureSeasonSafe(s, day);
    const segs = q.quests.map(x => `<span class="qseg${x.done ? ' done' : ''}" title="${esc(x.text)}"><b>${x.done ? '✔' : x.icon}</b><span class="qsb"><i style="width:${Math.round(x.prog / x.target * 100)}%"></i></span></span>`).join('');
    const chest = q.chestOpened ? '📭' : q.chestReady ? '🎁' : '📦';
    el.innerHTML = `<button class="qmain${q.chestReady ? ' ready' : ''}" id="qOpen" aria-label="Daily Quests, ${q.doneCount} of 3 done"><span class="qt"><b>Daily Quests</b><small>${q.chestOpened ? 'All done, see you tomorrow' : q.chestReady ? 'Open your chest!' : q.doneCount + ' / 3'}</small></span><span class="qsegs">${segs}</span><span class="qchest${q.chestReady ? ' pop' : ''}">${chest}</span></button>` +
      `<div class="qpills"><button class="qpill${se.ready ? ' ready' : ''}" id="qSeason"${hasShield(s) ? ' aria-label="Season, Streak Shield ready"' : ''}>🌟 Season <b>${se.stamps}/${SEASON_DAYS}</b>${hasShield(s) ? '<i class="qshield" title="Streak Shield ready">🛡️</i>' : ''}</button><button class="qpill" id="qAch">🏆 Achievements <b>${ac.got}/${ac.total}</b></button></div>`;
    $('qOpen').onclick = () => { audio.unlock(); audio.play('click'); openQuests(); };
    $('qSeason').onclick = () => { audio.unlock(); audio.play('click'); openSeason(); };
    $('qAch').onclick = () => { audio.unlock(); audio.play('click'); if (openTrophies) openTrophies(); };
    landStamp($('qSeason'), reduce());
  }
  function ensureSeasonSafe(s, day) { if (s.addict.season.key !== Math.floor(day / SEASON_DAYS)) { ensureSeason(s, day); c.persist(); } }

  // ---- quests panel
  function openQuests() {
    openPanel('DAILY QUESTS', body => buildQuests(body), () => c.openHub());
  }
  function buildQuests(body) {
    const day = c.dayKey(), q = questState(save(), day);
    const intro = document.createElement('div'); intro.className = 'sub'; intro.textContent = 'Three little quests, fresh every day. Finish them all for a chest!'; body.appendChild(intro);
    const list = document.createElement('div'); list.className = 'qlist'; body.appendChild(list);
    for (const x of q.quests) {
      const pct = Math.round(x.prog / x.target * 100), row = document.createElement('div'); row.className = 'qrow' + (x.done ? ' done' : pct >= 50 ? ' half' : '');
      row.innerHTML = `<span class="qri">${x.done ? '✔' : x.icon}</span><span class="qrm"><b>${esc(x.text)}</b><span class="qrb"><i style="width:${pct}%"></i></span></span><em>${x.done ? 'DONE' : x.prog + '/' + x.target}</em>`;
      list.appendChild(row);
    }
    // the chest: three padlocks that open as the quests finish
    const hero = document.createElement('div'); hero.className = 'qhero' + (q.chestReady ? ' ready' : q.chestOpened ? ' opened' : '');
    const locks = [0, 1, 2].map(i => `<i class="${i < q.doneCount ? 'on' : ''}">${i < q.doneCount ? '🔓' : '🔒'}</i>`).join('');
    hero.innerHTML = `<div class="qhc">${q.chestOpened ? '📭' : q.chestReady ? '🎁' : '📦'}</div><div class="qhl">${locks}</div><div class="qhn">${q.chestOpened ? 'Opened today, see you tomorrow!' : q.chestReady ? 'Your chest is open!' : (3 - q.doneCount) + ' more to unlock'}</div><div class="qhr">Inside: ${esc(rewardText(q.chest))}</div>`;
    const cb = document.createElement('button'); cb.className = 'btn small go' + (q.chestReady ? ' gold' : ''); cb.disabled = !q.chestReady;
    cb.textContent = q.chestOpened ? 'OPENED' : q.chestReady ? 'OPEN CHEST' : 'FINISH 3 QUESTS';
    cb.onclick = () => { const r = claimQuestChest(save(), day); if (r) { after(); audio.play('levelup'); c.toast('Quest chest: ' + rewardText(r)); rebuild(buildQuests); renderStrip(); c.renderNext && c.renderNext(); } };
    hero.appendChild(cb); body.appendChild(hero);
  }
  function rebuild(fn) { const body = $('pBody'), top = body.scrollTop; body.innerHTML = ''; fn(body); body.scrollTop = top; }

  // ---- season panel: 30 day cells, stamps, milestone gifts
  function openSeason() {
    const s0 = save(), day0 = c.dayKey(); ensureSeason(s0, day0); c.persist();
    openPanel('SEASON', body => buildSeason(body), () => c.openHub());
  }
  function buildSeason(body) {
    const day = c.dayKey(), s = save(), se = seasonStatus(s, day);
    const head = document.createElement('div'); head.className = 'seahead';
    const nxt = se.miles.find(m => !m.got), left = nxt ? nxt.at - se.stamps : 0;
    const flags = se.miles.map(m => `<i class="sflag${m.got ? ' got' : ''}" style="left:${Math.round(m.at / SEASON_DAYS * 100)}%">${m.claimed ? '✔' : '🎁'}</i>`).join('');
    head.innerHTML = `<div class="sealine"><b>Day ${se.dayNo} of ${SEASON_DAYS}</b><span>${se.daysLeft ? se.daysLeft + ' days left' : 'Last day!'}</span></div><div class="searail"><div class="seabar"><i style="width:${Math.round(se.stamps / SEASON_DAYS * 100)}%"></i></div>${flags}</div>` +
      `<div class="seastat"><span class="${se.stampedToday ? 'ok' : 'todo'}">${se.stampedToday ? '⭐ Today\'s stamp is yours' : '🐾 Play a run to stamp today'}</span><span>${nxt ? 'Next gift in ' + left + (left === 1 ? ' stamp' : ' stamps') : 'Every gift unlocked!'}</span></div>` + (se.note ? `<div class="seanote">${esc(se.note)}</div>` : '');
    body.appendChild(head);
    if (se.note) { clearSeasonNote(s); c.persist(); }
    const grid = document.createElement('div'); grid.className = 'seagrid';
    let html = '';
    for (let i = 1; i <= SEASON_DAYS; i++) {
      const mi = se.miles.find(m => m.at === i), stamped = i <= se.stamps;
      html += `<span class="sday${stamped ? ' on' : ''}${stamped && i === se.stamps && se.stampedToday ? ' fresh' : ''}${i === se.dayNo ? ' today' : ''}${mi ? ' ms' : ''}"><small>${i}</small><b>${stamped ? '⭐' : mi ? '🎁' : ''}</b></span>`;
    }
    grid.innerHTML = html; body.appendChild(grid);
    const g = document.createElement('div'); g.className = 'tiles'; g.style.marginTop = '12px'; body.appendChild(g);
    for (const m of se.miles) g.appendChild(tile({ cls: 't-gold one' + (m.claimed ? ' done' : ''), ic: m.got ? '🌟' : '🎁', name: m.at + ' stamps', desc: rewardText(m.reward), bar: Math.round(Math.min(1, se.stamps / m.at) * 100), barText: Math.min(se.stamps, m.at) + ' / ' + m.at, btn: m.claimed ? 'GOT IT' : m.ready ? 'CLAIM' : 'KEEP STAMPING', gold: m.ready, disabled: !m.ready,
      onclick: () => { if (claimSeason(save(), day, m.i)) { after(); audio.play('levelup'); rebuild(buildSeason); renderStrip(); c.renderNext && c.renderNext(); } } }));
  }

  // ---- the achievement card (round 6): a share-style card, tap it to open the shelf
  let achEl = null, achT = 0;
  const tierOf = r => (r && r.sparkles >= 60 ? 'gold' : r && (r.sparkles >= 25 || r.eggs) ? 'silver' : 'bronze');
  function achToast(name, reward) {
    if (!achEl) { achEl = document.createElement('div'); achEl.id = 'achToast'; document.body.appendChild(achEl); }
    const ac = achievementCount(save()), tier = tierOf(reward), pct = Math.round(ac.got / ac.total * 100);
    const canShare = typeof navigator !== 'undefined' && !!navigator.share;
    achEl.className = 't-' + tier;
    achEl.innerHTML = `<div class="acmed"><i class="acrays"></i><b>🏆</b></div><div class="acmid"><small>ACHIEVEMENT UNLOCKED</small><strong>${esc(name)}</strong><span class="acbar"><i style="width:${pct}%"></i></span><span class="accnt">${ac.got} of ${ac.total} on the shelf</span></div>` +
      (reward ? `<u class="acrw">${esc(rewardText(reward))}<small>tap to collect</small></u>` : '') + (canShare ? '<button class="acshare" aria-label="Share" type="button">⤴</button>' : '');
    const open = () => { achEl.classList.remove('on'); audio.play('click'); if (openTrophies) openTrophies(); };
    achEl.onclick = e => { if (e.target.closest && e.target.closest('.acshare')) { try { navigator.share({ title: 'Cell Serpent', text: `Achievement unlocked in Cell Serpent: ${name}! RoxorLoops & Jasmin vs the Serpent.` }).catch(() => {}); } catch (_) {} return; } open(); };
    void achEl.offsetWidth; achEl.classList.add('on');
    clearTimeout(achT); achT = setTimeout(() => achEl.classList.remove('on'), 3600);
  }
  function checkAch() {
    const fresh = popAchievements(save()); if (!fresh.length) return 0;
    c.persist(); audio.play('levelup');
    fresh.slice(0, 3).forEach((t, i) => setTimeout(() => achToast(t.name, t.reward), i * 3800));
    return fresh.length;
  }
  return { renderStrip, openQuests, openSeason, checkAch, achToast, spinInfo: (s, day) => spinFrame(spinStreak(s, day)) };
}
