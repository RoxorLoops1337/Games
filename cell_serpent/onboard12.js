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
export function showTutorial(onDone, audio) {
  const el = document.createElement('div'); el.className = 'tut12'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'How to play');
  el.innerHTML = `<div class="tbox">
    <div class="tstep s1 on"><div class="tbar"><i class="tcell"></i><b class="tfinger">\u{1F446}</b></div><div class="tarrows"><em>◀</em><em>▶</em></div></div>
    <div class="tstep s2"><div class="tgold"><i class="tyel">★</i><i class="tshot"></i><i class="tburst"></i></div><div class="tbar"><i class="tcell"></i></div></div>
    <div class="tstep s3"><div class="tchain"><i></i><i></i><i></i><div class="tface"><span class="tshield"></span><b>\u{1F40D}</b></div></div><div class="tbar"><i class="tcell"></i></div></div>
    <div class="tdots"><i class="on"></i><i></i><i></i></div>
    <div class="tbtns"><button class="tskip" type="button">SKIP</button><button class="tnext" type="button" aria-label="Next">▶</button></div></div>`;
  document.body.appendChild(el);
  let n = 0, done = false, timer = 0;
  const steps = el.querySelectorAll('.tstep'), dots = el.querySelectorAll('.tdots i');
  const go = k => { n = k; steps.forEach((s, i) => { s.classList.toggle('on', i === k); if (i === k) { s.style.animation = 'none'; void s.offsetWidth; s.style.animation = ''; } }); dots.forEach((d, i) => d.classList.toggle('on', i === k)); clearTimeout(timer); timer = setTimeout(next, 3400); };
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
