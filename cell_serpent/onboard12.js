// Title and first-run onboarding: tap-the-animals easter egg, the one-time 3-step wordless tutorial before the
// very first run, the one-time "tap a pet" hub hint, and a rich demo loadout for the title backdrop.
// Flags live in their own localStorage keys so the save format never changes.
const KEY_TUT = 'cell_serpent_tut12', KEY_PET = 'cell_serpent_pethint12';
const getFlag = k => { try { return localStorage.getItem(k) === '1'; } catch (e) { return false; } };
const setFlag = k => { try { localStorage.setItem(k, '1'); } catch (e) { /* ignore */ } };

export const ANIMAL_SOUND = { kitten: 'meow', puppy: 'bark', piglet: 'oink', lamb: 'baa', hamster: 'squeak', turtle: 'boop' };
export const needsTutorial = save => !!save && !save.runs && !getFlag(KEY_TUT);
export const needsPetHint = save => !!save && save.eggs > 0 && !getFlag(KEY_PET);

// ---- demo behind the title: the new art with many skills out at once
export function richDemo(demo) {
  demo.p.hp = demo.p.maxHp = 9999;
  demo.weap = { swab: { lv: 3, cd: 0 }, daggers: { lv: 3, cd: 0 }, dragon: { lv: 2, cd: 0 }, tower: { lv: 2, cd: 0 }, bubble: { lv: 2, cd: 0 }, satellite: { lv: 2, cd: 0 }, needles: { lv: 2, cd: 0 } };
  demo.ups = { notes: 2, aspd: 3 };
}

// ---- tap the animals on the title screen
export function setupTapAnimals(host, audio) {
  if (!host) return;
  let taps = 0;
  const jump = (im, delay = 0) => im.animate([{ translate: '0 0', scale: '1 1' }, { translate: '0 -34px', scale: '1.12 .92', offset: 0.35 }, { translate: '0 0', scale: '1.1 .86', offset: 0.7 }, { translate: '0 0', scale: '1 1' }], { duration: 520, delay, easing: 'ease-out' });
  const sound = (im, delay = 0) => setTimeout(() => audio.play(ANIMAL_SOUND[im.dataset.pet] || 'boop'), delay);
  const heart = im => {
    const r = im.getBoundingClientRect(), s = document.createElement('span'); s.className = 'heart12'; s.textContent = '♥';
    s.style.left = (r.left + r.width / 2) + 'px'; s.style.top = (r.top + r.height * 0.2) + 'px'; document.body.appendChild(s); setTimeout(() => s.remove(), 900);
  };
  host.addEventListener('pointerdown', e => {
    const im = e.target.closest && e.target.closest('img'); if (!im) return;
    audio.unlock(); sound(im); jump(im); heart(im); taps++;
    if (taps % 8 === 0) [...host.querySelectorAll('img')].forEach((o, i) => { sound(o, 220 + i * 140); jump(o, 220 + i * 140); });   // a little chorus
  });
}
export function tagPets(host, names) { [...host.querySelectorAll('img')].forEach((im, i) => { im.dataset.pet = names[i]; im.setAttribute('role', 'button'); im.setAttribute('aria-label', 'Pet ' + names[i]); }); }

// ---- first-run tutorial: slide, pop yellow cells, the face is shielded. Wordless, skippable, shown once.
// real art from the drawing kit (the same sprites as the run), baked once into small data URLs
function artURL(kit, w, h, fn) { try { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return c.toDataURL(); } catch (e) { return ''; } }
export function tutorialArt(kit, art) {
  if (!kit || !kit.SPR) return null;
  const body = (kind, size) => artURL(kit, size, size, (g, w, h) => kit.blit(g, kit.SPR.body('love', false, kind), w / 2, h / 2, size));
  const duo = art && art.get && art.get('duo_idle');
  return {
    cell: body('', 92), gold: body('upgrade', 104),
    head: artURL(kit, 120, 120, (g) => kit.drawHead(g, 60, 60, 40, Math.PI / 2, { skin: 'love', t: 1, look: [0, 1] })),
    duo: duo ? artURL(kit, Math.round(120 * duo.width / duo.height), 120, (g, w, h) => g.drawImage(duo, 0, 0, w, h)) : '',
  };
}
export function showTutorial(onDone, audio, kit, art) {
  const el = document.createElement('div'); el.className = 'tut12'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'How to play');
  const A = tutorialArt(kit, art || (window.CS && window.CS.art)), im = (u, c) => u ? `<img class="${c}" alt="" src="${u}">` : '';
  const duo = A && A.duo ? im(A.duo, 'tduo') : '<i class="tcell"></i>';
  el.classList.toggle('art12', !!A);
  el.innerHTML = `<div class="tbox">
    <div class="tstep s1 on"><div class="tcap">SLIDE</div><div class="tbar">${duo}<b class="tfinger">\u{1F446}</b></div><div class="tarrows"><em>◀</em><em>▶</em></div></div>
    <div class="tstep s2"><div class="tcap">SHOOT</div><div class="tgold">${A ? im(A.gold, 'tyelimg') : '<i class="tyel">★</i>'}<i class="tshot"></i><i class="tburst"></i></div><div class="tbar">${duo}</div></div>
    <div class="tstep s3"><div class="tcap">POP THE FACE</div><div class="tchain">${A ? im(A.cell, 'tseg') + im(A.cell, 'tseg') + im(A.cell, 'tseg') : '<i></i><i></i><i></i>'}<div class="tface"><span class="tshield"></span>${A ? im(A.head, 'thead') : '<b>\u{1F40D}</b>'}</div></div><div class="tbar">${duo}</div></div>
    <div class="tdots"><i class="on"></i><i></i><i></i></div>
    <div class="tbtns"><button class="tskip" type="button">SKIP</button><button class="tnext" type="button" aria-label="Next">▶</button></div></div>`;
  document.body.appendChild(el);
  let n = 0, done = false, timer = 0;
  const steps = el.querySelectorAll('.tstep'), dots = el.querySelectorAll('.tdots i');
  const go = k => { n = k; steps.forEach((s, i) => { s.classList.toggle('on', i === k); if (i === k) { s.style.animation = 'none'; void s.offsetWidth; s.style.animation = ''; } }); dots.forEach((d, i) => d.classList.toggle('on', i === k)); const nb = el.querySelector('.tnext'); nb.classList.toggle('go', k === 2); nb.textContent = k === 2 ? 'GO!' : '\u25B6'; clearTimeout(timer); timer = setTimeout(next, 3400); };
  const finish = () => { if (done) return; done = true; clearTimeout(timer); setFlag(KEY_TUT); el.classList.add('out'); setTimeout(() => el.remove(), 220); onDone(); };
  const next = () => { audio.play('click'); if (n >= 2) finish(); else go(n + 1); };
  el.querySelector('.tnext').onclick = next;
  el.querySelector('.tskip').onclick = () => { audio.play('click'); finish(); };
  go(0);
  return el;
}

// ---- hub: a gentle hand on the Pets tab the first time an egg is ready; seen once the Pets tab is open
export function petHint(tabsRoot, hubTab, save) {
  const old = tabsRoot.querySelector('.pethint12'); if (old) old.remove();
  if (!needsPetHint(save)) return;
  if (hubTab === 'Pets') { setFlag(KEY_PET); return; }
  const b = tabsRoot.querySelector('button[data-tab="Pets"]'); if (!b) return;
  const h = document.createElement('i'); h.className = 'pethint12'; h.textContent = '\u{1F446}'; h.setAttribute('aria-hidden', 'true'); b.appendChild(h);
}
export function eggNudge(egg, save) { if (egg && save.eggs > 0) egg.classList.add('nudge12'); }

// ---- title extras: rising music notes, a tagline that cycles, a sparkle burst when PLAY is tapped
const TAGS = ['RoxorLoops & Jasmin vs the Serpent.', 'Slide. Shoot. Sing.', 'Pop the face, save the beat.', 'Every cell has a groove.'];
export function setupTitleLife(notesHost, tagEl) {
  if (notesHost && !notesHost.childNodes.length) {
    const G = ['\u266A', '\u266B', '\u2661', '\u266A', '\u266B', '\u2736', '\u266A'];
    G.forEach((ch, i) => { const n = document.createElement('i'); n.textContent = ch; n.style.cssText = `left:${22 + i * 9}%;--d:${-i * 0.75}s;--dx:${(i % 2 ? 1 : -1) * (14 + i * 4)}px;font-size:${18 + (i % 3) * 5}px`; notesHost.appendChild(n); });
  }
  if (tagEl && !tagEl._cycle12) {
    let k = 0;
    tagEl._cycle12 = setInterval(() => {
      if (!tagEl.offsetParent) return;
      tagEl.classList.add('swap12');
      setTimeout(() => { k = (k + 1) % TAGS.length; tagEl.textContent = TAGS[k]; tagEl.classList.remove('swap12'); }, 360);
    }, 4200);
  }
}
export function playBurst(btn) {
  if (!btn || !btn.animate || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  const r = btn.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, G = ['\u266A', '\u266B', '\u2605', '\u2661', '\u2736'], C = ['#ffd84d', '#ff8fcf', '#7fe6ff', '#fff'];
  for (let i = 0; i < 16; i++) {
    const s = document.createElement('span'); s.className = 'spark12'; s.textContent = G[i % G.length]; s.style.color = C[i % C.length];
    s.style.left = cx + (Math.random() - 0.5) * r.width * 0.7 + 'px'; s.style.top = cy + 'px'; document.body.appendChild(s);
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, d = 70 + Math.random() * 110;
    s.animate([{ transform: 'translate(-50%,-50%) scale(.4)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(a) * d}px),calc(-50% + ${Math.sin(a) * d}px)) scale(1.3) rotate(${(Math.random() - 0.5) * 90}deg)`, opacity: 0 }], { duration: 650 + Math.random() * 250, easing: 'cubic-bezier(.2,.8,.3,1)' }).onfinish = () => s.remove();
  }
  btn.animate([{ scale: '1' }, { scale: '1.12 .9' }, { scale: '.97' }], { duration: 260, easing: 'ease-out' });
}
