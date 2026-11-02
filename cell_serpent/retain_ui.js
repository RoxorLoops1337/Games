// Cell Serpent: round 2 retention UI. The Daily Quests strip on the Battle tab, the quests + chest panel,
// the 30 day Season panel and the tiny achievement toast. Everything here is a free gift, none of it is required.
import {
  questState, claimQuestChest, seasonStatus, claimSeason, ensureSeason, clearSeasonNote, SEASON_DAYS,
  achievementCount, popAchievements, rewardText, spinStreak, spinFrame,
} from './sim.js';

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
      `<div class="qpills"><button class="qpill${se.ready ? ' ready' : ''}" id="qSeason">🌟 Season <b>${se.stamps}/${SEASON_DAYS}</b></button><button class="qpill" id="qAch">🏆 Achievements <b>${ac.got}/${ac.total}</b></button></div>`;
    $('qOpen').onclick = () => { audio.unlock(); audio.play('click'); openQuests(); };
    $('qSeason').onclick = () => { audio.unlock(); audio.play('click'); openSeason(); };
    $('qAch').onclick = () => { audio.unlock(); audio.play('click'); if (openTrophies) openTrophies(); };
  }
  function ensureSeasonSafe(s, day) { if (s.addict.season.key !== Math.floor(day / SEASON_DAYS)) { ensureSeason(s, day); c.persist(); } }

  // ---- quests panel
  function openQuests() {
    openPanel('DAILY QUESTS', body => buildQuests(body), () => c.openHub());
  }
  function buildQuests(body) {
    const day = c.dayKey(), q = questState(save(), day);
    const intro = document.createElement('div'); intro.className = 'sub'; intro.textContent = 'Three little quests, fresh every day. Finish them all for a chest!'; body.appendChild(intro);
    const g = document.createElement('div'); g.className = 'tiles'; body.appendChild(g);
    for (const x of q.quests) g.appendChild(tile({ cls: 't-gold one' + (x.done ? ' done' : ''), ic: x.icon, name: x.text, desc: '', bar: Math.round(x.prog / x.target * 100), barText: x.prog + ' / ' + x.target, btn: x.done ? 'DONE' : 'KEEP GOING', disabled: true, onclick: () => {} }));
    const cg = document.createElement('div'); cg.className = 'tiles'; cg.style.marginTop = '10px'; body.appendChild(cg);
    cg.appendChild(tile({ cls: 't-gold one', ic: q.chestOpened ? '📭' : '🎁', name: 'Quest Chest', chip: q.doneCount + '/3', desc: 'Inside: ' + rewardText(q.chest), bar: Math.round(q.doneCount / 3 * 100), barText: q.doneCount + ' of 3 quests', btn: q.chestOpened ? 'OPENED' : q.chestReady ? 'OPEN' : 'FINISH 3 QUESTS', gold: q.chestReady, disabled: !q.chestReady,
      onclick: () => { const r = claimQuestChest(save(), day); if (r) { after(); audio.play('levelup'); c.toast('Quest chest: ' + rewardText(r)); rebuild(buildQuests); renderStrip(); c.renderNext && c.renderNext(); } } }));
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
    head.innerHTML = `<div class="sealine"><b>Day ${se.dayNo} of ${SEASON_DAYS}</b><span>${se.daysLeft ? se.daysLeft + ' days left' : 'Last day!'}</span></div><div class="seabar"><i style="width:${Math.round(se.stamps / SEASON_DAYS * 100)}%"></i></div><div class="seasub">Play a run each day to collect a stamp. Free gifts, no hurry!</div>` + (se.note ? `<div class="seanote">${esc(se.note)}</div>` : '');
    body.appendChild(head);
    if (se.note) { clearSeasonNote(s); c.persist(); }
    const grid = document.createElement('div'); grid.className = 'seagrid';
    let html = '';
    for (let i = 1; i <= SEASON_DAYS; i++) {
      const mi = se.miles.find(m => m.at === i), stamped = i <= se.stamps;
      html += `<span class="sday${stamped ? ' on' : ''}${i === se.dayNo ? ' today' : ''}${mi ? ' ms' : ''}"><small>${i}</small><b>${stamped ? '⭐' : mi ? '🎁' : ''}</b></span>`;
    }
    grid.innerHTML = html; body.appendChild(grid);
    const g = document.createElement('div'); g.className = 'tiles'; g.style.marginTop = '12px'; body.appendChild(g);
    for (const m of se.miles) g.appendChild(tile({ cls: 't-gold one' + (m.claimed ? ' done' : ''), ic: m.got ? '🌟' : '🎁', name: m.at + ' stamps', desc: rewardText(m.reward), bar: Math.round(Math.min(1, se.stamps / m.at) * 100), barText: Math.min(se.stamps, m.at) + ' / ' + m.at, btn: m.claimed ? 'GOT IT' : m.ready ? 'CLAIM' : 'KEEP STAMPING', gold: m.ready, disabled: !m.ready,
      onclick: () => { if (claimSeason(save(), day, m.i)) { after(); audio.play('levelup'); rebuild(buildSeason); renderStrip(); c.renderNext && c.renderNext(); } } }));
  }

  // ---- tiny toast when an achievement pops (reuses the trophy shelf, claim it there)
  let achEl = null, achT = 0;
  function achToast(name) {
    if (!achEl) { achEl = document.createElement('div'); achEl.id = 'achToast'; document.body.appendChild(achEl); }
    achEl.innerHTML = `<b>🏆</b><span>Achievement<em>${esc(name)}</em></span>`; achEl.classList.remove('on'); void achEl.offsetWidth; achEl.classList.add('on');
    clearTimeout(achT); achT = setTimeout(() => achEl.classList.remove('on'), 2800);
  }
  function checkAch() {
    const fresh = popAchievements(save()); if (!fresh.length) return 0;
    c.persist(); audio.play('levelup');
    fresh.slice(0, 3).forEach((t, i) => setTimeout(() => achToast(t.name), i * 3000));
    return fresh.length;
  }
  return { renderStrip, openQuests, openSeason, checkAch, achToast, spinInfo: (s, day) => spinFrame(spinStreak(s, day)) };
}
