// Cell Serpent, batch 16 (agent c): the Daily Challenge screens. A tile in the Battle tab ("DAILY SHOW"), a panel with the
// rules, your best, the name field, the board and a share button, and the result screen lines. The rules and the score live
// in daily_b16c.js; the run itself is a normal run (mode 'daily') started by main.js through c.start().
import { dayId, dailySeed, dailyStage, dailyTitle, dailyScore, dchToday, cleanName, dailyShare, fetchBoard, postScore, myRank, DAILY_RIBBONS } from './daily_b16c.js';

const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
export const dailyOpts = id => ({ seed: dailySeed(id), stage: dailyStage(id), mode: 'daily', did: id });   // the house band: no meta, no pets, no gear
export const untilNext = (now = Date.now()) => { const ms = 86400000 - (now % 86400000), h = Math.floor(ms / 3600000); return h ? h + 'h ' + Math.floor(ms % 3600000 / 60000) + 'm' : Math.floor(ms / 60000) + 'm'; };

let cache = null;   // { id, at, board } : one fetch per half minute at most
async function board(force) {
  const id = dayId(), now = Date.now();
  if (!force && cache && cache.id === id && now - cache.at < 30000) return cache.board;
  const b = await fetchBoard(); cache = { id, at: now, board: b }; return b;
}
export function ensureName(save) {
  const d = dchToday(save, dayId());
  if (!d.name) d.name = 'Duo ' + String(100 + Math.floor(Math.random() * 900));
  return d.name;
}

// ---- the Battle tab tile: inserted once above the Daily Gigs box, refreshed on every renderBattle
export function mountDailyTile(c) {
  const doc = document, ref = doc.querySelector('#tabBattle .gl-box'); if (!ref) return;
  let box = doc.getElementById('dchBox');
  if (!box) { box = doc.createElement('div'); box.id = 'dchBox'; box.className = 'stagebox dchbox'; ref.parentElement.insertBefore(box, ref); }
  const open = c.isUnlocked(); box.hidden = !open; if (!open) return;
  const id = dayId(), d = dchToday(c.save(), id), st = dailyStage(id), name = c.stageName(st);
  box.innerHTML = `<div class="dch"><div class="dch-top"><i class="dch-ic" aria-hidden="true">🎪</i><div class="dch-tx"><b>DAILY SHOW</b><span>${esc(dailyTitle(id))} · Stage ${st}</span><small>${d.best ? 'Best today <em>' + d.best + '</em>' : 'Same snake for everyone'} · new in ${untilNext()}</small></div></div>` +
    `<div class="dch-row"><button type="button" class="btn small go dch-go">${d.tries ? 'AGAIN' : 'PLAY FREE'}</button><button type="button" class="btn small dim dch-bd" aria-label="Daily board">BOARD</button></div></div>`;
  box.querySelector('.dch-go').onclick = () => { c.audio.unlock(); c.audio.play('click'); c.start(); };
  box.querySelector('.dch-bd').onclick = () => { c.audio.play('click'); openDailyPanel(c); };
  box.setAttribute('aria-label', 'Daily show: ' + name);
}

// ---- the panel: rules, stats, name, play, share, board
export function openDailyPanel(c) {
  const id = dayId(), save = c.save(), st = dailyStage(id);
  c.openPanel('DAILY SHOW', body => {
    const d = dchToday(save, id), nm = ensureName(save); c.persist();
    body.innerHTML = `<div class="dchp"><div class="dch-hero"><b>${esc(dailyTitle(id))}</b><span>Stage ${st} · ${esc(c.stageName(st))}</span><small>The same snake and the same card rolls for everyone today. The house band plays: no upgrades from home, no revives. Free to retry. New show in ${untilNext()}.</small></div>` +
      `<div class="dch-st"><span>Best today<b id="dchBest">${d.best || '-'}</b></span><span>Tries<b>${d.tries}</b></span><span>Record<b>${d.top || '-'}</b></span></div>` +
      `<label class="dch-nm"><span>Your name on the board</span><input id="dchName" type="text" maxlength="16" value="${esc(nm)}" autocomplete="off" autocapitalize="words" spellcheck="false" aria-label="Your name on the board"></label>` +
      `<div class="dch-row"><button type="button" class="btn small go" id="dchPlay">${d.tries ? 'PLAY AGAIN' : 'PLAY FREE'}</button><button type="button" class="btn small dim" id="dchShare"${d.best ? '' : ' disabled'}>SHARE</button></div>` +
      `<div class="dch-bh">TODAY'S BOARD</div><div class="dch-bd" id="dchList" role="list"><div class="dch-load">Tuning up...</div></div></div>`;
    const inp = body.querySelector('#dchName');
    const saveName = () => { const v = cleanName(inp.value); if (v && v !== save.dch.name) { save.dch.name = v; c.persist(); } inp.value = save.dch.name; };
    inp.onchange = saveName; inp.onblur = saveName;
    body.querySelector('#dchPlay').onclick = () => { saveName(); c.audio.play('click'); c.start(); };
    body.querySelector('#dchShare').onclick = async () => { c.audio.play('click'); const b = cache && cache.board; c.share(dailyShare(id, save.dch.best, c.stageName(st), b ? myRank(b.top, save.dch.name) : 0, c.url)); };
    const paint = (b, mine) => {
      const list = body.querySelector('#dchList'); if (!list) return;
      if (!b) { list.innerHTML = '<div class="dch-load">The board is offline. Your best is kept on this phone.</div>'; return; }
      if (!b.top.length) { list.innerHTML = '<div class="dch-load">Nobody has played yet. Be the first!</div>'; return; }
      const me = cleanName(save.dch.name) || 'Anonymous';
      list.innerHTML = b.top.slice(0, 20).map((e, i) => `<div class="dch-r${e.name === me ? ' me' : ''}" role="listitem"><i>${i + 1}</i><span>${esc(e.name)}</span><b>${e.score}</b></div>`).join('');
    };
    board(true).then(async b => {
      // a best that never reached the board (offline, throttled): try again now
      if (b && d.best > 0) { const mine = b.top.find(e => e.name === (cleanName(save.dch.name) || 'Anonymous')); if (!mine || mine.score < d.best) { const r = await postScore(save.dch.name, d.best); if (r) { b = { day: r.day, top: r.top }; cache = { id, at: Date.now(), board: b }; } } }
      paint(b);
    });
  }, () => c.back());
}

// ---- the result screen
export function dailyResultRows(out, cu, curImg) {
  const dl = out.daily; if (!dl) return [];
  const rows = [`<div class="r">${'🎪'} ${cu(dl.score)} Daily points</div>`];
  if (dl.bestToday && dl.bestToday !== dl.score) rows.push(`<div class="r">⭐ Best today ${dl.bestToday}</div>`);
  if (out.ribbons) rows.push(`<div class="r">🎀 ${cu(out.ribbons)} Ribbons</div>`);
  return rows;
}
export function dailyAfterResult(c, r, out) {
  const dl = out.daily; if (!dl) return;
  const save = c.save(), $ = c.$;
  $('rTitle').textContent = r.won ? 'DAILY SHOW CLEARED!' : 'DAILY SHOW: ' + Math.floor((r.progress || 0) * 100) + '%';
  $('rSub').textContent = dl.score + ' points' + (dl.newBest ? ', a new best for today' : dl.prev > dl.score ? ', your best is ' + dl.prev : '') + '.';
  $('rHint').textContent = 'Same snake for everyone today. Retry is free.';
  $('rRibbon').textContent = dl.newBest || (dl.firstTry && dl.score > 0) ? 'DAILY BEST ' + dl.bestToday : ''; $('rRibbon').classList.toggle('on', !!$('rRibbon').textContent);
  $('rNext').style.display = 'none'; $('rRetry').style.display = ''; $('rRetry').innerHTML = 'RETRY <span class="rcost">free</span>';
  $('rRetry').onclick = () => { c.audio.play('click'); c.start(); };
  let rank = 0;
  $('rShare').onclick = () => { c.audio.play('click'); c.share(dailyShare(dl.id, dl.bestToday, c.stageName(r.stage), rank, c.url)); };
  if (dl.score >= dl.bestToday && dl.score > 0) {   // this run is today's best: put it on the board (fails soft)
    postScore(ensureName(save), dl.score).then(res => {
      if (!res) return; cache = { id: dl.id, at: Date.now(), board: { day: res.day, top: res.top } }; rank = res.rank || myRank(res.top, save.dch.name);
      if (rank && c.mode() === 'over' && $('result').classList.contains('on')) $('rSub').textContent = dl.score + ' points · #' + rank + ' on today’s board.';
    });
  }
}
export { dailyScore, DAILY_RIBBONS };
