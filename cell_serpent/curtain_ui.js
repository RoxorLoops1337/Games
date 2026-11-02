// Round 10 (agent 19): leaving the hub for a run opens a stage curtain. Two velvet halves with a gold fringe start
// closed over the screen and part to the sides, so the stage is "revealed" the way a gig starts. Only transform is
// animated, pointer events pass straight through, and Reduce Motion skips it.

export const CURTAIN_MS = 560;

// pure: the keyframe offsets for one half (side -1 left, +1 right): a short hold, a quick pull, a soft settle
export function curtainFrames(side) {
  const out = side < 0 ? -1 : 1;
  return [
    { transform: 'translateX(0)', offset: 0 },
    { transform: 'translateX(0)', offset: 0.14 },
    { transform: `translateX(${out * 6}%)`, offset: 0.3 },
    { transform: `translateX(${out * 104}%)`, offset: 1 },
  ];
}

let heard = null;
export const onCurtain = f => { heard = f; };   // r11: main plays the swish when the curtain really opens
export function curtainOpen(reduced) {
  if (reduced || typeof document === 'undefined' || !document.body || !document.body.animate) return false;
  const old = document.getElementById('curtain10'); if (old) old.remove();
  const root = document.createElement('div'); root.id = 'curtain10'; root.setAttribute('aria-hidden', 'true');
  root.innerHTML = '<i class="cu l"></i><i class="cu r"></i>';
  document.body.appendChild(root);
  let left = 2;
  root.querySelectorAll('.cu').forEach((el, i) => {
    const a = el.animate(curtainFrames(i === 0 ? -1 : 1), { duration: CURTAIN_MS, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' });
    a.onfinish = a.oncancel = () => { if (--left <= 0) root.remove(); };
  });
  setTimeout(() => root.remove(), CURTAIN_MS + 400);
  if (heard) heard();
  return true;
}
