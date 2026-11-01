// Input for Whiskerton Walk: a floating thumb stick, jump and interact buttons, tap to walk, and the keyboard.
// All pointer maths goes through the injected stagePoint(event) -> {x, y} in 960x540 stage pixels, because an upright phone turns
// the whole stage a quarter turn. The controls are children of the stage element, so they turn with it and use stage pixels.
// createInput(el, { stagePoint, onSide, onTap, isActive, buttons, stageW }) ->
//   { read() -> { dir, jump, interact, moveTo }, destroy(), setButtonsVisible(bool), setPrompt(text|null), setMoveTo(x|null), clearMoveTo() }
//   dir is -1..1, jump and interact are edges (true once per press), moveTo is a world x the cat should walk to or null.
//   onTap(stageX, stageY) -> world x | null : a short press that is not a stick drag (the caller maps it to the world or to a building).
//   onSide(name): 'back' (Escape), 'list' (L), 'sit' (S), 'prompt' (the interact chip was pressed), for things that are not movement.
//   isActive() -> bool : keys are ignored while it returns false (a sheet or menu is open).

export const STICK_DEAD = 8, STICK_FULL = 44, STICK_ZONE = 0.45, TAP_MOVE = 14, TAP_TIME = 450, MOVETO_TTL = 8;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// pure: stick offset in stage px -> -1..1 (a dead zone, then linear up to full)
export function stickDir(dx) {
  const a = Math.abs(dx);
  if (!Number.isFinite(dx) || a <= STICK_DEAD) return 0;
  return Math.sign(dx) * Math.min(1, (a - STICK_DEAD) / (STICK_FULL - STICK_DEAD));
}
// pure: which keys mean what
const LEFT = ['arrowleft', 'a'], RIGHT = ['arrowright', 'd'], JUMP = [' ', 'arrowup', 'w'], ACT = ['e', 'enter'];
export function keyDir(down) {
  const l = LEFT.some((k) => down.has(k)), r = RIGHT.some((k) => down.has(k));
  return (r ? 1 : 0) - (l ? 1 : 0);
}

export function createInput(el, o = {}) {
  const sp = o.stagePoint || ((e) => ({ x: e.clientX, y: e.clientY }));
  const stageW = o.stageW || 960;
  const active = o.isActive || (() => true);
  const hasDom = !!(el && el.appendChild && typeof document !== 'undefined');
  const st = { stick: 0, keys: new Set(), jump: false, interact: false, moveTo: null, moveAt: 0, dead: false, buttons: !!o.buttons };
  const ptrs = new Map();
  let root = null, ring = null, knob = null, bJump = null, bAct = null, now = 0;
  const tick = () => (now = (typeof performance !== 'undefined' ? performance.now() : Date.now()));

  if (hasDom) {
    root = document.createElement('div'); root.className = 'kwin';
    root.innerHTML = '<div class="kwstick" hidden><i class="kwring"></i><i class="kwknob"></i></div>' +
      '<button type="button" class="kwbtn kwjump" aria-label="Jump" hidden><span>Jump</span></button>' +
      '<button type="button" class="kwbtn kwact" hidden></button>';
    el.appendChild(root);
    const stick = root.querySelector('.kwstick'); ring = stick; knob = root.querySelector('.kwknob');
    bJump = root.querySelector('.kwjump'); bAct = root.querySelector('.kwact');
    bJump.hidden = !st.buttons;
    const press = (fn) => (e) => { e.preventDefault(); e.stopPropagation(); if (active()) fn(); };
    bJump.addEventListener('pointerdown', press(() => { st.jump = true; }));
    bAct.addEventListener('pointerdown', press(() => { st.interact = true; if (o.onSide) o.onSide('prompt'); }));
    // a keyboard or screen reader user can still press the buttons (Enter or Space on a focused button fires click with no pointer)
    bJump.addEventListener('click', (e) => { if (e.detail === 0 && active()) st.jump = true; });
    bAct.addEventListener('click', (e) => { if (e.detail === 0 && active()) { st.interact = true; if (o.onSide) o.onSide('prompt'); } });
    for (const b of [bJump, bAct]) b.addEventListener('contextmenu', (e) => e.preventDefault());

    const showStick = (x, y, dx) => {
      ring.hidden = false; ring.style.left = x + 'px'; ring.style.top = y + 'px';
      knob.style.transform = `translate(${clamp(dx, -STICK_FULL, STICK_FULL)}px,0)`;
    };
    root.addEventListener('pointerdown', (e) => {
      if (e.target !== root || !active()) return;
      const p = sp(e);
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      tick();
      ptrs.set(e.pointerId, { x0: p.x, y0: p.y, t0: now, left: p.x < stageW * STICK_ZONE, stick: false, mouse: e.pointerType === 'mouse' });
      try { root.setPointerCapture(e.pointerId); } catch (err) { /* not needed */ }
    });
    root.addEventListener('pointermove', (e) => {
      const q = ptrs.get(e.pointerId);
      if (!q) return;
      const p = sp(e);
      if (!p || !Number.isFinite(p.x)) return;
      const dx = p.x - q.x0, dy = p.y - q.y0;
      if (!q.stick && q.left && !q.mouse && Math.hypot(dx, dy) > TAP_MOVE) { q.stick = true; st.moveTo = null; }
      if (q.stick) { st.stick = stickDir(dx); showStick(q.x0, q.y0, dx); }
      else if (Math.hypot(dx, dy) > TAP_MOVE) q.moved = true;
    });
    const end = (e, cancel) => {
      const q = ptrs.get(e.pointerId);
      if (!q) return;
      ptrs.delete(e.pointerId);
      if (q.stick) { st.stick = 0; ring.hidden = true; return; }
      tick();
      if (cancel || q.moved || now - q.t0 > TAP_TIME || !active()) return;
      const p = sp(e);
      if (!p || !Number.isFinite(p.x) || !o.onTap) return;
      const wx = o.onTap(p.x, p.y);
      if (typeof wx === 'number' && Number.isFinite(wx)) { st.moveTo = wx; st.moveAt = now; }
    };
    root.addEventListener('pointerup', (e) => end(e, false));
    root.addEventListener('pointercancel', (e) => end(e, true));
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  const typing = (e) => e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || '');
  const onKey = (e) => {
    if (st.dead || !active() || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = String(e.key).toLowerCase();
    const isMove = LEFT.includes(k) || RIGHT.includes(k), isJump = JUMP.includes(k), isAct = ACT.includes(k);
    const side = k === 'escape' ? 'back' : k === 'l' ? 'list' : k === 's' ? 'sit' : null;
    // a focused button keeps Enter and Space (so the Back button and the list button work by keyboard)
    const onBtn = e.target && /^(BUTTON|A)$/.test(e.target.tagName || '');
    if (!(isMove || isJump || isAct || side)) return;
    if (onBtn && (k === 'enter' || k === ' ')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat) return;
    if (isMove) { st.keys.add(k); st.moveTo = null; }
    if (isJump) { st.jump = true; st.keys.add(k); }
    if (isAct) st.interact = true;
    if (side && o.onSide) o.onSide(side);
  };
  const onUp = (e) => { st.keys.delete(String(e.key).toLowerCase()); };
  const onBlur = () => { st.keys.clear(); st.stick = 0; ptrs.clear(); if (ring) ring.hidden = true; };
  if (typeof addEventListener === 'function') {
    addEventListener('keydown', onKey, true); addEventListener('keyup', onUp, true); addEventListener('blur', onBlur);
  }

  return {
    read() {
      tick();
      let dir = st.stick || keyDir(st.keys);
      if (!active()) { st.jump = st.interact = false; dir = 0; }
      if (dir !== 0) st.moveTo = null;
      if (st.moveTo != null && now - st.moveAt > MOVETO_TTL * 1000) st.moveTo = null;
      const r = { dir: clamp(dir, -1, 1), jump: st.jump, interact: st.interact, moveTo: st.moveTo };
      st.jump = st.interact = false;
      return r;
    },
    setMoveTo(x) { st.moveTo = Number.isFinite(x) ? x : null; tick(); st.moveAt = now; },
    clearMoveTo() { st.moveTo = null; },
    setButtonsVisible(v) { st.buttons = !!v; if (bJump) bJump.hidden = !v; },
    // the interact chip: text null hides it
    setPrompt(text) {
      if (!bAct) return;
      if (!text) { if (!bAct.hidden) bAct.hidden = true; return; }
      if (bAct.textContent !== text) { bAct.textContent = text; bAct.setAttribute('aria-label', text); }
      if (bAct.hidden) bAct.hidden = false;
    },
    destroy() {
      st.dead = true;
      if (typeof removeEventListener === 'function') { removeEventListener('keydown', onKey, true); removeEventListener('keyup', onUp, true); removeEventListener('blur', onBlur); }
      if (root && root.remove) root.remove();
      ptrs.clear(); st.keys.clear();
    },
  };
}
