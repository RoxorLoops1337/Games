// COMBAT: direct control of one fighter (optional, default off). Keyboard, floating touch stick + buttons, Gamepad API.
// The sim half is core/arena.js (LM.dcEnable / LM.dcInput). Every input leaves this file as a tap through FightView.tap, which records it keyed by the sim step F.n,
// so a replay (and the highlight reel) plays the same fight. The stick is quantised to 16 directions x 2 speeds (LM.dcCode), so a held direction costs one tap, not one per frame.
// Layout: left half of the screen above the ultimate bar = the stick (it appears under the thumb), right side = Strike (big), Heavy, Roll, Block (hold), Lock.
const PREF_KEY = 'ludus_maximus_3d_prefs';
const KEYMAP = { ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r' };
const GLYPH_KEY = { light: 'J', heavy: 'K', roll: 'L', block: 'Space', lock: 'R' }, GLYPH_PAD = { light: 'A', heavy: 'X', roll: 'B', block: 'LT', lock: 'RB' };

/** the saved preference { on, gid } (also mirrored in globalThis.LM3D_DC, which js/fightsetup.js reads when a fight is built) */
export function readDc() { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return { on: !!p.dc, gid: p.dcId == null ? null : p.dcId, barks: p.barks !== false }; } catch (e) { return { on: false, gid: null, barks: true }; } }
export function writeDc(on, gid) {
  try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); p.dc = !!on; if (gid !== undefined) p.dcId = gid; localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) { /* storage blocked */ }
  globalThis.LM3D_DC = { on: !!on, gid: gid === undefined ? (globalThis.LM3D_DC && globalThis.LM3D_DC.gid) : gid };
}
{ const d = readDc(); globalThis.LM3D_DC = { on: d.on, gid: d.gid }; }

const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

export function createDirectControl(fv) {
  const S = { on: false, uid: '', code: 0, sentN: -9, blk: false, keys: { u: 0, d: 0, l: 0, r: 0 }, stick: { id: -1, ox: 0, oy: 0, x: 0, y: 0 }, pad: { x: 0, y: 0, last: null, on: false }, lock: '', root: null, hold: null, bind: null, glyph: GLYPH_KEY };
  const fwd = { x: 0, z: -1 };

  function build() {
    const root = S.root = el('div', 'dc-root'); root.setAttribute('aria-label', 'Direct control'); root.setAttribute('role', 'group');
    const zone = S.zone = el('div', 'dc-zone'); const base = S.base = el('div', 'dc-stick'); const knob = S.knob = el('i', 'dc-knob'); base.append(knob); zone.append(base);
    const pad = S.padEl = el('div', 'dc-pad');
    const mk = (id, label, cls) => { const b = el('button', 'dc-btn ' + cls); b.type = 'button'; b.dataset.dc = id; b.setAttribute('aria-label', label); const l = el('span', 'dc-bl', label), g = el('small', 'dc-bg', GLYPH_KEY[id]); b.append(l, g); b.style.touchAction = 'none'; return b; };
    S.btn = { light: mk('light', 'Strike', 'dc-main'), heavy: mk('heavy', 'Heavy', 'dc-sub'), roll: mk('roll', 'Roll', 'dc-sub'), block: mk('block', 'Block', 'dc-sub'), lock: mk('lock', 'Lock', 'dc-mini') };
    pad.append(S.btn.light, S.btn.heavy, S.btn.roll, S.btn.block, S.btn.lock);
    const bar = S.bar = el('div', 'dc-sta'); bar.append(el('b', '', 'STAMINA'), S.fill = el('i')); bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', 'Stamina');
    S.hint = el('div', 'dc-hint', ''); root.append(zone, pad, bar, S.hint); fv.hud.append(root);
    // buttons
    const press = (id, e) => { e.preventDefault(); e.stopPropagation(); if (id === 'lock') return cycleLock(); if (id === 'block') { setBlock(true); S.btn.block.setPointerCapture && S.btn.block.setPointerCapture(e.pointerId); return; } send(id); S.btn[id].classList.add('on'); setTimeout(() => S.btn[id] && S.btn[id].classList.remove('on'), 120); };
    for (const id of ['light', 'heavy', 'roll', 'block', 'lock']) S.btn[id].addEventListener('pointerdown', (e) => press(id, e));
    const rel = (e) => { e.preventDefault(); setBlock(false); }; S.btn.block.addEventListener('pointerup', rel); S.btn.block.addEventListener('pointercancel', rel); S.btn.block.addEventListener('lostpointercapture', () => setBlock(false));
    // floating stick
    zone.addEventListener('pointerdown', (e) => { if (S.stick.id >= 0) return; e.preventDefault(); const r = zone.getBoundingClientRect(); S.stick.id = e.pointerId; S.stick.ox = e.clientX; S.stick.oy = e.clientY; S.stick.x = S.stick.y = 0; zone.setPointerCapture && zone.setPointerCapture(e.pointerId); base.style.display = 'block'; base.style.left = (e.clientX - r.left) + 'px'; base.style.top = (e.clientY - r.top) + 'px'; knob.style.transform = 'translate(-50%,-50%)'; });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId !== S.stick.id) return; const R = 48; let dx = e.clientX - S.stick.ox, dy = e.clientY - S.stick.oy; const m = Math.hypot(dx, dy); if (m > R) { dx *= R / m; dy *= R / m; } S.stick.x = dx / R; S.stick.y = dy / R; knob.style.transform = `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px))`; });
    const end = (e) => { if (e.pointerId !== S.stick.id) return; S.stick.id = -1; S.stick.x = S.stick.y = 0; base.style.display = 'none'; };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  const canDrive = () => fv.F && !fv.F.done && fv.phase === 'fight' && !fv.paused && !fv.replaying && !fv.hold && !fv.ex;
  const me = () => (fv.F ? fv.F.units.find((u) => u.id === S.uid) : null);
  function send(act) { if (!canDrive()) return false; return fv.tap('dcact', S.uid, act); }
  function setBlock(on) { if (S.blk === on) return; S.blk = on; S.btn.block.classList.toggle('on', on); if (canDrive() || !on) fv.tap('dcact', S.uid, on ? 'blk1' : 'blk0'); }
  function cycleLock() {
    const F = fv.F, u = me(); if (!F || !u) return; const foes = F.units.filter((x) => x.side !== u.side && !x.down).sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y));
    if (!foes.length) return; const i = foes.findIndex((x) => x.id === S.lock), nxt = i < 0 ? foes[0] : (i === foes.length - 1 ? null : foes[i + 1]);
    S.lock = nxt ? nxt.id : ''; send('lock:' + S.lock); paintLock(); fv.audio.sfx('uiTap');
  }
  function paintLock() { for (const f of fv.fm.values()) f.plate.classList.toggle('fv-lock', f.u.id === S.lock && !f.u.down); S.btn.lock.classList.toggle('on', !!S.lock); }

  // camera relative movement: the stick is in screen terms, the sim plane is the ground (x, z)
  function camBasis() { // the camera's forward on the ground (looking nearly straight down: its up vector instead)
    const e = fv.camera.matrixWorld.elements; let fx = -e[8], fz = -e[10]; if (Math.hypot(fx, fz) < 0.35) { fx = e[4]; fz = e[6]; } const n = Math.hypot(fx, fz) || 1; fwd.x = fx / n; fwd.z = fz / n;
  }
  function readInput() {
    // sum of: keyboard, touch stick, gamepad stick (largest wins); screen x right, y up
    let sx = S.keys.r - S.keys.l, sy = S.keys.u - S.keys.d;
    if (S.stick.id >= 0) { sx = S.stick.x; sy = -S.stick.y; }
    if (S.pad.on && (Math.abs(S.pad.x) > 0.2 || Math.abs(S.pad.y) > 0.2)) { sx = S.pad.x; sy = -S.pad.y; }
    const m = Math.hypot(sx, sy); if (m > 1) { sx /= m; sy /= m; }
    camBasis(); const rx = -fwd.z, rz = fwd.x;   // right = (-fz, fx) in (x, z)
    return { x: rx * sx + fwd.x * sy, y: rz * sx + fwd.z * sy };
  }
  function pollPad() {
    const gps = navigator.getGamepads ? navigator.getGamepads() : null; let g = null; if (gps) for (const p of gps) if (p && p.connected) { g = p; break; }
    if (!g) { if (S.pad.on) { S.pad.on = false; S.pad.last = null; S.glyph = GLYPH_KEY; paintGlyphs(); } return; }
    if (!S.pad.on) { S.pad.on = true; S.glyph = GLYPH_PAD; paintGlyphs(); }
    S.pad.x = g.axes[0] || 0; S.pad.y = g.axes[1] || 0; const b = g.buttons.map((x) => !!(x && (x.pressed || x.value > 0.5))), l = S.pad.last || [];
    const edge = (i) => b[i] && !l[i];
    if (edge(0)) send('light'); if (edge(2)) send('heavy'); if (edge(1)) send('roll'); if (edge(5) || edge(11)) cycleLock();
    const blk = !!(b[4] || b[6] || b[7]); if (blk !== !!(l[4] || l[6] || l[7]) || (S.pad.last === null && blk)) setBlock(blk);
    S.pad.last = b;
  }
  function paintGlyphs() { for (const id in S.btn) { const g = S.btn[id].querySelector('.dc-bg'); if (g) g.textContent = S.glyph[id]; } S.hint.textContent = S.pad.on ? 'Pad: stick move, A strike, X heavy, B roll, LT block, RB lock' : 'Keys: WASD move, J strike, K heavy, L roll, Space block, R lock'; }

  function place() { // keep the controls above the ultimate bar and out of the way of the nameplates
    if (!S.root || !fv.ultBar) return; const hb = fv.host.getBoundingClientRect(), ub = fv.ultBar.getBoundingClientRect(), H = hb.height || innerHeight;
    const top = ub.height > 0 ? Math.min(H, ub.top - hb.top) : H, off = Math.max(8, H - top + 8); S.root.style.setProperty('--dc-b', off.toFixed(0) + 'px');
    S.root.classList.toggle('dc-land', hb.width > hb.height);
  }

  S.start = function (F) {
    S.stop(); const id = F.meta && F.meta.dc; if (!id || fv.replaying || F.quiet) return; S.uid = id; S.on = true; S.code = 0; S.sentN = -9; S.blk = false; S.lock = '';
    if (!S.root) build(); S.root.style.display = ''; S.glyph = GLYPH_KEY; paintGlyphs(); place();
    S.bind = {
      kd: (e) => {
        if (!S.on || e.ctrlKey || e.metaKey || e.altKey) return; const tg = e.target; if (tg && /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName)) return; if (document.querySelector('.lx-scrim')) return;
        const k = KEYMAP[e.code]; if (k) { S.keys[k] = 1; e.preventDefault(); return; }
        if (e.repeat) { if (e.code === 'Space' && !(tg && tg.tagName === 'BUTTON')) e.preventDefault(); return; }
        if (e.code === 'KeyJ' || e.code === 'KeyZ') { send('light'); S.btn.light.classList.add('on'); setTimeout(() => S.btn.light.classList.remove('on'), 110); e.preventDefault(); }
        else if (e.code === 'KeyK' || e.code === 'KeyX') { send('heavy'); e.preventDefault(); }
        else if (e.code === 'KeyL' || e.code === 'KeyC') { send('roll'); e.preventDefault(); }
        else if (e.code === 'Space' && !(tg && tg.tagName === 'BUTTON')) { setBlock(true); e.preventDefault(); }
        else if (e.code === 'KeyR') { cycleLock(); e.preventDefault(); }
      },
      ku: (e) => { const k = KEYMAP[e.code]; if (k) S.keys[k] = 0; else if (e.code === 'Space') setBlock(false); },
      blur: () => { S.keys.u = S.keys.d = S.keys.l = S.keys.r = 0; setBlock(false); },
    };
    document.addEventListener('keydown', S.bind.kd, true); document.addEventListener('keyup', S.bind.ku, true); window.addEventListener('blur', S.bind.blur);
    const f = fv.fm.get(S.uid); if (f) f.plate.classList.add('fv-dc');
  };
  S.stop = function () {
    if (S.bind) { document.removeEventListener('keydown', S.bind.kd, true); document.removeEventListener('keyup', S.bind.ku, true); window.removeEventListener('blur', S.bind.blur); S.bind = null; }
    S.on = false; S.keys.u = S.keys.d = S.keys.l = S.keys.r = 0; S.stick.id = -1; if (S.root) S.root.style.display = 'none'; if (S.base) S.base.style.display = 'none';
  };
  // per frame: send a changed stick code, poll the pad, paint the stamina bar
  S.frame = function (dt) {
    if (!S.on) return; const F = fv.F, u = me(); if (!F || !u) return;
    if (fv.phase !== 'fight' || fv.replaying || F.done) { if (S.code !== 0 && fv.phase === 'fight' && !F.done) fv.tap('dcmove', S.uid, 0); S.code = 0; S.root.style.visibility = fv.phase === 'fight' && !F.done ? '' : 'hidden'; return; }
    S.root.style.visibility = ''; pollPad(); if (!canDrive()) return;
    const v = readInput(), code = L().dcCode(v.x, v.y);
    if (code !== S.code && (F.n - S.sentN >= 2 || code === 0)) { fv.tap('dcmove', S.uid, code); S.code = code; S.sentN = F.n; }
    if (S.lock) { const t = F.units.find((x) => x.id === S.lock); if (!t || t.down) { S.lock = ''; paintLock(); } }
    // stamina: width in whole percent, class while tired / winded
    const p = u.stM > 0 ? Math.round(100 * u.sta / u.stM) : 100; if (p !== S.pc) { S.pc = p; S.fill.style.width = p + '%'; S.bar.setAttribute('aria-valuenow', p); }
    const w = u.wndT > 0 ? 2 : u.sta < 25 ? 1 : 0; if (w !== S.w) { S.w = w; S.bar.classList.toggle('low', w === 1); S.bar.classList.toggle('winded', w === 2); }
    S.btn.heavy.classList.toggle('dim', u.sta < 26); S.btn.roll.classList.toggle('dim', u.sta < 20 || u.dcCd > 0); S.btn.light.classList.toggle('dim', u.sta < 8);
    S.btn.block.classList.toggle('up', !!u.blk);
  };
  const L = () => globalThis.LM;
  S.place = place;
  S.dispose = () => { S.stop(); if (S.root) { S.root.remove(); S.root = null; } };
  return S;
}
