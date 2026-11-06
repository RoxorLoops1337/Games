// Tour map, batch 16 (agent f): the 50 stages as a world tour. Ten gigs in ten cities, five songs each, a boss poster per
// gig (drawn in code, painted once when the view opens) and a setlist of clears. It lives inside the ALL STAGES sheet as a
// STAGES / TOUR switch; tapping a song goes back to the stage preview of that stage. Pure helpers first, then the DOM part.

export const GIGS = [
  { city: 'Barnyard Bay', venue: 'The Hay Loft', ic: '🐣', c1: '#ffb04d', c2: '#7a2d6b' },
  { city: 'Kitten Heights', venue: 'Whisker Hall', ic: '🐱', c1: '#ff7ac8', c2: '#41207a' },
  { city: 'Carrot Cove', venue: 'The Crunch Club', ic: '🥕', c1: '#ff9a2e', c2: '#1f5a4a' },
  { city: 'Oat Milk Harbor', venue: 'Foam Pier Stage', ic: '🥛', c1: '#bfe9ff', c2: '#2a3f8f' },
  { city: 'Lentil Lane', venue: 'The Soup Room', ic: '🍲', c1: '#e9b86a', c2: '#5a2a2a' },
  { city: 'Chickpea Springs', venue: 'Falafel Fields', ic: '🧆', c1: '#ffe14a', c2: '#2a6a3a' },
  { city: 'Puppy Pier', venue: 'Fetch Arena', ic: '🐶', c1: '#4fd8f0', c2: '#3a1f7a' },
  { city: 'Hummus Hills', venue: 'The Big Dip Dome', ic: '🏔️', c1: '#ffd9a0', c2: '#6a2a4a' },
  { city: 'Radish Rock', venue: 'Pink Stone Stadium', ic: '🎸', c1: '#ff6a8a', c2: '#2a1a5a' },
  { city: 'Encore Park', venue: 'The Golden Mic', ic: '👑', c1: '#ffd24a', c2: '#4a1a7a' },
];
export const GIG_SIZE = 5, TOUR_STAGES = GIGS.length * GIG_SIZE;
export const gigOf = n => Math.max(0, Math.min(GIGS.length - 1, Math.floor((Math.max(1, n) - 1) / GIG_SIZE)));
export const bossOf = gig => (gig + 1) * GIG_SIZE;

const SONGS = ['Heart Beat Hop', 'Hay Bale Boogie', 'Achoo Anthem', 'Grumble Groove', 'Lullaby Loop', 'Glitter Ball Bounce', 'Lemon Twist', 'Mamba Mambo', 'Frost Bite Beat', 'Gloom Doom Waltz'];
const MIXES = ['', ' II', ' III', ' IV', ' V'];
export const songTitle = n => SONGS[(Math.max(1, n) - 1) % SONGS.length] + MIXES[Math.min(MIXES.length - 1, Math.floor((Math.max(1, n) - 1) / 10))];

// per-gig facts from the save: cleared songs, stars, and a state id: soldout (all five cleared) / playing / next / locked
export function gigState(gig, save, reach) {
  const from = gig * GIG_SIZE + 1, cleared = (save && save.cleared) | 0, stars = (save && save.stars) || {};
  let done = 0, got = 0;
  for (let n = from; n < from + GIG_SIZE; n++) { if (n <= cleared) done++; got += stars[n] | 0; }
  const locked = from > reach, id = done >= GIG_SIZE ? 'soldout' : locked ? 'locked' : done > 0 ? 'playing' : 'next';
  return { gig, from, to: from + GIG_SIZE - 1, done, stars: got, id, locked, bossDone: done >= GIG_SIZE, bossLocked: bossOf(gig) > reach };
}
export const tourSummary = (save, reach) => {
  let gigs = 0, songs = 0, stars = 0;
  for (let i = 0; i < GIGS.length; i++) { const s = gigState(i, save, reach); if (s.id === 'soldout') gigs++; songs += s.done; stars += s.stars; }
  return { gigs, songs, stars };
};
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const STATE_LABEL = { soldout: 'SOLD OUT', playing: 'ON STAGE', next: 'NEXT GIG', locked: 'COMING SOON' };

// one gig card; info(n) gives the stage facts (the boss name). reach = the highest stage that can be picked.
export function gigHTML(gig, save, reach, info) {
  const g = GIGS[gig], st = gigState(gig, save, reach), cleared = (save && save.cleared) | 0, stars = (save && save.stars) || {};
  const boss = bossOf(gig), bi = info ? info(boss) : { name: 'Boss' };
  const rows = [];
  for (let n = st.from; n <= st.to; n++) {
    const lock = n > reach, done = n <= cleared, nxt = n === cleared + 1, s = stars[n] | 0, bs = n === boss;
    rows.push(`<button type="button" class="tsl${done ? ' done' : ''}${nxt ? ' nxt' : ''}${lock ? ' lock' : ''}${bs ? ' hl' : ''}" data-n="${n}" ${lock ? 'disabled' : ''} aria-label="Song ${n}, ${lock ? 'locked' : esc(songTitle(n))}${bs ? ', headliner' : ''}${done ? ', ' + s + ' stars' : nxt ? ', next' : ''}">` +
      `<i class="tsk">${lock ? '🔒' : done ? '✔' : nxt ? '▶' : n}</i><span class="tst"><b>${lock ? '???' : esc(songTitle(n))}</b><small>${bs ? 'Headliner: ' + (st.bossLocked ? '???' : esc(bi.name)) : 'Stage ' + n}</small></span>` +
      `<span class="tss">${lock ? '' : [1, 2, 3].map(q => (q <= s ? '<u>★</u>' : '★')).join('')}</span></button>`);
  }
  return `<section class="tgig ${st.id}" style="--g1:${g.c1};--g2:${g.c2}" data-gig="${gig}">` +
    `<div class="tposter"><canvas class="tpc${st.bossLocked ? ' sil' : ''}" width="84" height="112" data-boss="${boss}" aria-hidden="true"></canvas>` +
    `<em class="tpic">${st.bossLocked ? '🔒' : g.ic}</em>${st.id === 'soldout' ? '<u class="tpst">SOLD OUT</u>' : ''}</div>` +
    `<div class="tmain"><div class="thd"><small>GIG ${gig + 1} · ${STATE_LABEL[st.id]}</small><b>${esc(g.city)}</b><span>${esc(g.venue)}</span><span>${st.done}/${GIG_SIZE} songs · ★ ${st.stars}/15</span></div>` +
    `<div class="tset">${rows.join('')}</div></div></section>`;
}
export function tourHTML(save, reach, info) {
  const sum = tourSummary(save, reach), out = [`<div class="ttop"><b>WORLD TOUR</b><span>${sum.gigs}/${GIGS.length} gigs sold out · ${sum.songs}/${TOUR_STAGES} songs</span></div>`];
  for (let i = 0; i < GIGS.length; i++) out.push(gigHTML(i, save, reach, info));
  return out.join('');
}

// paints a poster once: sunburst rays in the gig colours, the headliner's face, a few confetti dots
export function paintPoster(cv, kit, gig, info) {
  if (!cv || cv.dataset.done) return;
  cv.dataset.done = '1';
  const W = cv.width, H = cv.height, g = GIGS[gig];
  const dpr = Math.max(1, Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const bg = c.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, g.c1); bg.addColorStop(1, g.c2); c.fillStyle = bg; c.fillRect(0, 0, W, H);
  c.save(); c.translate(W / 2, H * 0.46); c.fillStyle = 'rgba(255,255,255,.16)';
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * 140, Math.sin(a) * 140); c.lineTo(Math.cos(a + 0.2) * 140, Math.sin(a + 0.2) * 140); c.closePath(); c.fill(); }
  c.restore();
  c.fillStyle = 'rgba(255,255,255,.85)';
  for (let i = 0; i < 7; i++) { const x = (i * 37 + gig * 11) % (W - 8) + 4, y = (i * 53 + gig * 7) % (H - 40) + 4; c.fillRect(x, y, 2, 2); }
  c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, H - 22, W, 22);
  if (kit && kit.drawHead && info) { try { kit.drawHead(c, W / 2, H * 0.46, 25, Math.PI / 2, { skin: info.skin, boss: true, t: 0, look: [0, 0.8] }); } catch (e) { /* cosmetic */ } }
}

// adds the STAGES / TOUR switch to the sheet. c = { save(), reach(), info(n), kit(), audio }. Returns { show, isTour } or null.
export function wireTour(sh, c) {
  const head = sh.querySelector('.ovhd'), body = sh.querySelector('.ovbody');
  if (!head || !body || !c.info) return null;
  const mapHTML = body.innerHTML, tabs = document.createElement('div'), pv = sh.querySelector('.ovpv');
  tabs.className = 'ovtabs'; tabs.setAttribute('role', 'tablist');
  tabs.innerHTML = '<button type="button" role="tab" class="on" data-v="map" aria-selected="true">STAGES</button><button type="button" role="tab" data-v="tour" aria-selected="false">🎤 TOUR</button>';
  head.appendChild(tabs);
  let tour = false;
  const show = on => {
    tour = !!on;
    for (const b of tabs.children) { const a = (b.dataset.v === 'tour') === tour; b.classList.toggle('on', a); b.setAttribute('aria-selected', a ? 'true' : 'false'); }
    const small = head.querySelector('small');
    if (small) small.textContent = tour ? 'Tap a song to preview it' : 'Tap a stage to preview it, GO to jump';
    if (pv) pv.hidden = tour;
    sh.classList.toggle('tourv', tour);
    if (tour) {
      body.innerHTML = tourHTML(c.save(), c.reach(), c.info);
      const kit = c.kit && c.kit();
      for (const cv of body.querySelectorAll('.tpc')) { const n = +cv.dataset.boss; paintPoster(cv, kit, gigOf(n), c.info(n)); }
      const nx = body.querySelector('.tsl.nxt'); if (nx) nx.scrollIntoView({ block: 'center' });
    } else body.innerHTML = mapHTML;
  };
  tabs.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const want = b.dataset.v === 'tour'; if (want === tour) return; if (c.audio) c.audio.play('click'); show(want); });
  // a tap on a song: back to the stage view with that stage previewed (the second tap there jumps, as before)
  body.addEventListener('click', e => {
    const r = e.target.closest('.tsl'); if (!r || r.disabled || !tour) return;
    if (c.audio) c.audio.play('click');
    show(false);
    const cell = body.querySelector('.ovc[data-n="' + r.dataset.n + '"]'); if (!cell) return;
    const go = pv && pv.querySelector('.pvgo'), cur = go ? +(/\d+/.exec(go.getAttribute('aria-label') || '') || [0])[0] : 0;
    if (cur === +r.dataset.n) cell.classList.add('sel'); else cell.click();
    cell.scrollIntoView({ block: 'center' });
  });
  return { show, isTour: () => tour };
}
