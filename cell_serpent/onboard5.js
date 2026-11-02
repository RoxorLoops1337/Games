// Round 5 title and onboarding extras (agent 12):
//  - a friendly snake that slithers across the title with a swaying head (real run art: baked body cells + live head)
//  - real run art for tutorial step 2 (the cell's music-note shot, a pop ring, star sparkles)
//  - the first-pop celebration: the very first cell a brand new player pops gets a sticker, confetti and a cheer
const TAU = Math.PI * 2;
const KEY_POP = 'cell_serpent_firstpop5';
const getFlag = k => { try { return localStorage.getItem(k) === '1'; } catch (e) { return false; } };
const setFlag = k => { try { localStorage.setItem(k, '1'); } catch (e) { /* ignore */ } };
const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

// ---------------------------------------------------------------- the title snake
const SKINS = ['love', 'sneezy', 'rust', 'love'];
const N = 13, GAP = 27;          // body cells and the arc spacing between them, in css px
export function setupTitleSnake(title, kit) {
  if (!title || !kit || !kit.SPR || title.querySelector('.snake5')) return null;
  const cv = document.createElement('canvas'); cv.className = 'snake5'; cv.setAttribute('aria-hidden', 'true');
  const anchor = title.querySelector('.peeks'); title.insertBefore(cv, anchor ? anchor.nextSibling : title.firstChild);
  const g = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1, head = -60, skin = 0, t0 = 0, last = 0, on = false, rafId = 0, pokeT = -9, pokeX = 0, pokeY = 0, pokeHit = false, nowT = 0;
  const A = 20, K = 1 / 44;   // wave height and spatial frequency of the road the snake follows
  const yAt = x => H * 0.5 + A * Math.sin(x * K) + A * 0.35 * Math.sin(x * K * 2.3 + 1);
  const dyAt = x => A * K * Math.cos(x * K) + A * 0.35 * K * 2.3 * Math.cos(x * K * 2.3 + 1);
  function fit() {
    const r = cv.getBoundingClientRect(); if (!r.width) return false;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    W = r.width; H = r.height; return true;
  }
  function draw(t) {
    if (!fit()) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const sk = SKINS[skin % SKINS.length], body = kit.SPR.body(sk, false, '');
    const pk = t - pokeT, bounce = i => (pk < 1.5 ? Math.max(0, Math.sin(pk * 15 - i * 0.6)) * Math.exp(-pk * (pokeHit ? 1.9 : 3.2)) * (pokeHit ? 15 : 7) : 0);
    const wob = 1 + Math.sin(t * 2.2) * 0.1;                       // the wave breathes a little
    g.save(); g.translate(0, 0);
    // soft ground shadow
    g.globalAlpha = 0.22; g.fillStyle = '#000';
    for (let i = N - 1; i >= 0; i--) { const x = head - i * GAP; if (x < -40 || x > W + 40) continue; g.beginPath(); g.ellipse(x, H * 0.5 + (yAt(x) - H * 0.5) * wob + 24, 14, 4, 0, 0, TAU); g.fill(); }
    g.globalAlpha = 1;
    for (let i = N - 1; i >= 1; i--) {                             // tail first, so the head is on top
      const x = head - i * GAP; if (x < -40 || x > W + 40) continue;
      const bn = bounce(i), y = H * 0.5 + (yAt(x) - H * 0.5) * wob - bn, rot = Math.atan2(dyAt(x) * wob, 1);
      const sz = 40 * (1 - 0.3 * i / N) * (1 + Math.sin(t * 5 - i * 0.7) * 0.035 + bn * 0.012);
      kit.blit(g, body, x, y, sz, rot * 0.5);
    }
    const hx = head, hy = H * 0.5 + (yAt(hx) - H * 0.5) * wob - bounce(0);
    const sway = Math.sin(t * 2.6) * 0.34 + Math.sin(t * 6.1) * 0.05;   // the head swings from side to side
    const ang = Math.atan2(dyAt(hx) * wob, 1) + sway;
    if (hx > -60 && hx < W + 60) kit.drawHead(g, hx + Math.cos(sway) * 3, hy - 3 + Math.sin(t * 3.1) * 2, 27, ang, { skin: sk, t, look: pk < 1.6 ? [Math.max(-1, Math.min(1, (pokeX - hx) / 90)), Math.max(-1, Math.min(1, (pokeY - hy) / 60))] : [Math.sin(t * 1.7) * 0.7, 0.2] });
    g.restore();
  }
  function frame(now) {
    rafId = requestAnimationFrame(frame);
    if (!title.getClientRects().length || document.hidden) { last = 0; return; }
    const t = now / 1000, dt = last ? Math.min(0.05, t - last) : 0; last = t;
    if (!on) { on = true; fit(); head = -GAP * 2; }
    nowT = t;
    if (!reduced()) { const pk = t - pokeT; head += dt * 52 * (1 + (pokeHit && pk < 1.3 ? 2.2 * (1 - pk / 1.3) : 0)); if (head - N * GAP > W + 10) { head = -20; skin++; } } else head = W * 0.62;
    draw(t);
  }
  rafId = requestAnimationFrame(frame);
  // a tap on the title: the snake looks at it; a tap on the snake itself makes it wiggle, squeak and speed up for a moment
  title.addEventListener('pointerdown', e => {
    if (e.target.closest && e.target.closest('button,.peeks img,a')) return;
    const r = cv.getBoundingClientRect(); if (!r.width || !title.getClientRects().length) return;
    const x = e.clientX - r.left, y = e.clientY - r.top;
    pokeHit = y > -6 && y < H + 6; pokeT = nowT || performance.now() / 1000; pokeX = x; pokeY = y;
    const cell = Math.max(0, Math.min(N - 1, Math.round((head - x) / GAP)));   // 0 = the head, N-1 = the tail tip
    title.dispatchEvent(new CustomEvent('snakepoke', { detail: { hit: pokeHit, x, y, cell, n: N } }));
  });
  cv._seek = x => { head = x; };   // for tests and screenshots
  return { stop() { cancelAnimationFrame(rafId); } };
}

// ---------------------------------------------------------------- tutorial step 2: real shot and pop art
function artURL(w, h, fn) { try { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return c.toDataURL(); } catch (e) { return ''; } }
export function tutorialShotArt(kit) {
  if (!kit || !kit.SPR) return null;
  const note = kit.SPR.note(false), crit = kit.SPR.note(true), coin = kit.SPR.pickup('spark');
  const shot = n => artURL(64, 64, (g, w, h) => kit.blit(g, n, w / 2, h / 2, 60, 0));
  return {
    shot: shot(note), crit: shot(crit),
    spark: artURL(48, 48, (g, w, h) => kit.blit(g, coin, w / 2, h / 2, 46, 0)),
  };
}
export function tutorialShotHTML(S) {
  if (!S || !S.shot) return '';
  const star = (c, i) => `<img class="tspk spk${i}" alt="" src="${S.spark}">`;
  return `<img class="tnote n1" alt="" src="${S.shot}"><img class="tnote n2" alt="" src="${S.shot}"><img class="tnote n3" alt="" src="${S.crit}">`
    + `<i class="tring"></i><i class="tring r2"></i>` + [0, 1, 2, 3, 4, 5].map(i => star('', i)).join('') + `<b class="tpop">POP!</b>`;
}

// ---------------------------------------------------------------- first-pop celebration
export const needsFirstPop = save => !!save && !save.runs && !getFlag(KEY_POP);
let celebrating = false;
export function firstPop(audio, buzz) {
  if (celebrating) return; celebrating = true; setFlag(KEY_POP);
  try { audio.play('levelup'); } catch (e) { /* ignore */ } try { if (buzz) buzz([18, 30, 18]); } catch (e) { /* ignore */ }
  const el = document.createElement('div'); el.className = 'fpop5'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<div class="fp-card"><small>FIRST POP!</small><b>Nice one</b></div>';
  const C = ['#ffd84d', '#ff8fcf', '#7fe6ff', '#9dff8a', '#fff'], G = ['♪', '♫', '★', '♡', '✶'];
  if (!reduced()) for (let i = 0; i < 22; i++) {
    const s = document.createElement('span'); s.textContent = G[i % G.length]; s.style.color = C[i % C.length];
    const a = (i / 22) * TAU + Math.random() * 0.3, d = 90 + Math.random() * 120;
    s.style.cssText += `;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 30}px;--rot:${(Math.random() - 0.5) * 140}deg;--del:${Math.random() * 0.12}s;font-size:${16 + (i % 3) * 6}px`;
    el.appendChild(s);
  }
  document.body.appendChild(el);
  setTimeout(() => { el.remove(); celebrating = false; }, 1900);
}
