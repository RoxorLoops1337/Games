// New-best celebration on the result screen (DOM only): the ribbon pops big with a shimmer, a ring and a spray of sparks
// burst from it, and a small "+N%" chip says how far past the old best the run got.
let timer = 0, clean = null;
const COLS = ['#ffd84d', '#fff3b0', '#ff9ad6', '#9ff0ff', '#9dff6d'];

export function stopBest() { clearTimeout(timer); if (clean) { clean(); clean = null; } }

// el = #rRibbon (already filled and switched on), delta = percentage points over the old best (0 for stars / first clear)
export function celebrateBest(el, { reduce = false, delta = 0, play = null } = {}) {
  stopBest();
  el.classList.remove('fx6'); el.querySelectorAll('.rb6d').forEach(n => n.remove());
  if (!el.classList.contains('on')) return;
  if (delta > 0) { const b = document.createElement('b'); b.className = 'rb6d'; b.textContent = '+' + delta + '%'; el.appendChild(b); }
  el.classList.add('fx6');
  if (reduce) return;
  timer = setTimeout(() => {
    if (!el.classList.contains('on') || !el.isConnected) return;
    const r = el.getBoundingClientRect(); if (!r.width) return;
    const box = document.createElement('div'); box.className = 'rb6fx'; box.setAttribute('aria-hidden', 'true');
    box.style.left = (r.left + r.width / 2) + 'px'; box.style.top = (r.top + r.height / 2) + 'px';
    let h = '<i class="rb6ring"></i><i class="rb6ring b"></i>';
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + (i % 2) * 0.2, d = 70 + (i % 4) * 26 + (i % 3) * 14;
      h += `<s style="--dx:${Math.round(Math.cos(a) * d * 1.5)}px;--dy:${Math.round(Math.sin(a) * d * 0.8 - 16)}px;--c:${COLS[i % COLS.length]};animation-delay:${(i % 4) * 30}ms"></s>`;
    }
    box.innerHTML = h; (el.closest('.scr') || document.body).appendChild(box);
    if (play) play();
    clean = () => { box.remove(); }; timer = setTimeout(stopBest, 1500);
  }, 620);
}
