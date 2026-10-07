// RESULT CARD ACTIONS (shared by the mini game UIs: tuner, ear, run, pose, rhythm). In the game the scene hands opts.acts(), a function returning
//   [{ id: 'again'|'back'|'continue', label, cls: 'alt'|'', dis, reason, pre() }]   (beatbox_heroes/activity.js, G.retActs)
// and every button runs pre() (the game records the choice) and then the card's own CONTINUE path, so leaving the game stays one code path.
// A greyed act shows its reason under the row and only flashes when tapped.
//   actButtons(doc, parent, acts, o) -> the buttons it appended    o: { cls: 'base button class', alt: 'class added for cls alt', go(act), row: true (wrap in a flex row) }
export function actButtons(doc, parent, acts, o) {
  o = o || {}; const out = []; if (!acts || !acts.length || !parent) return out;
  const box = o.row === false ? parent : doc.createElement('div');
  if (box !== parent) { box.setAttribute('data-acts', '1'); box.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;justify-content:center;width:100%'; parent.appendChild(box); }
  let why = '';
  for (const a of acts) {
    const b = doc.createElement('button'); b.type = 'button'; b.className = (o.cls || '') + (a.cls === 'alt' && o.alt ? ' ' + o.alt : ''); b.textContent = a.label; b.setAttribute('data-act', a.id);
    if (box !== parent) b.style.flex = a.id === 'continue' ? '1 1 100%' : '1 1 40%';
    if (a.dis) { b.setAttribute('aria-disabled', 'true'); b.title = a.reason || ''; b.style.filter = 'grayscale(1)'; b.style.opacity = '0.45'; if (a.reason) why = a.reason; }
    b.onclick = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      if (a.dis) { b.animate && b.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 220 }); return; }
      if (b.dataset.used) return; out.forEach((x) => { x.dataset.used = '1'; });
      try { if (a.pre) a.pre(); } catch (err) { /* the choice is optional */ }
      if (o.go) o.go(a);
    };
    box.appendChild(b); out.push(b);
  }
  if (why) { const w = doc.createElement('div'); w.setAttribute('data-why', '1'); w.textContent = why; w.style.cssText = 'flex:1 1 100%;text-align:center;font-weight:700;font-size:12px;letter-spacing:.04em;color:#ff9ad0;margin-top:2px'; box.appendChild(w); }
  return out;
}
// the acts of the game when it gave them, else null (standalone pages keep their own buttons)
export function gameActs(opts) { try { const a = opts && typeof opts.acts === 'function' ? opts.acts() : null; return a && a.length ? a : null; } catch (e) { return null; } }
