// Shop, wardrobe and gear polish for round 8 (agent 10): a ribbon icon instead of the system emoji, the wardrobe
// try-on (tap an outfit and the duo wears it before you buy), and per-set tints for the Superb and Legendary keepsakes.
import { sideIconURL } from './side_icons.js';

export const ribIcon = (px = 18) => { const u = sideIconURL('ribbon'); return u ? `<img class="ribi" src="${u}" alt="" draggable="false" style="width:${px}px;height:${px}px">` : '🎀'; };
export const ribHTML = n => `${ribIcon()} ${n}`;
export const dressIcon = px => { const u = sideIconURL('dress'); return u ? `<img class="cico" src="${u}" alt="" style="width:${px}px;height:${px}px">` : '👗'; };

// each keepsake set has a colour of its own; only tier 2 and up wear it, so the common ones stay calm
export const SET_TINT = { stage: '#ff7ab8', cozy: '#ffb36b', snack: '#7be0a0' };
export const setTint = k => (k.tier >= 2 && SET_TINT[k.set]) || '';

// The wardrobe try-on. `ctx` = { top, hero, grid, hatsOn, perkOf }: it swaps the hats on the duo, the glow colour, the name
// and a perk line, and pins one button that runs the tile's own buy or wear action.
export function wardTry(ctx, o, tileEl, state) {
  const { hero, hatsOn, label, perk, act } = ctx;
  const was = state.id;
  const off = was === o.id;
  for (const t of ctx.grid.querySelectorAll('.tile.tryon')) t.classList.remove('tryon');
  state.id = off ? '' : o.id;
  const show = off ? ctx.worn : o;
  hero.style.setProperty('--oc', show ? show.color : '#ffd84d');
  hero.querySelectorAll('.what,.wardhat').forEach(e => e.remove());
  if (show) hero.querySelector('.wped').insertAdjacentHTML('beforebegin', hatsOn(show));
  hero.classList.remove('swap'); void hero.offsetWidth; hero.classList.add('swap');
  if (!off) tileEl.classList.add('tryon');
  label.textContent = show ? show.name : 'Everyday look';
  label.classList.toggle('try', !off);
  perk.hidden = off;
  if (!off) { perk.querySelector('span').textContent = ctx.perkOf(o); const btn = tileEl.querySelector('button'); act.innerHTML = btn.innerHTML; act.disabled = btn.disabled; act.className = btn.className + ' wtrygo'; act.hidden = false; act.onclick = () => btn.click(); }
  else act.hidden = true;
}

// Round 9: plant-based snack flavour lines for the daily treats, by deal kind
export const SNACK_DESC = { frag: 'Hummus on toast', keep: 'Backstage snack', egg: 'Warm and wiggly', energy: 'Oat milk latte', sparkles: 'Glitter sprinkles', beats: 'Chickpea crunch' };

// Round 9: the "new treats" clock ticks every second and turns urgent (red, pulsing) in the last hour of the day.
export const URGENT_SEC = 3600;
export const secsToMidnight = (d = new Date()) => Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1) - d) / 1000);
export const clockText = t => { const p = n => String(n).padStart(2, '0'); return `${p(Math.floor(t / 3600))}:${p(Math.floor((t % 3600) / 60))}:${p(t % 60)}`; };
export function tickTreats(row) {
  const sp = row.querySelector('span'); if (!sp) return null;
  const paint = () => { const t = secsToMidnight(); sp.textContent = 'New treats in ' + clockText(t); row.classList.toggle('urgent', t < URGENT_SEC); };
  paint();
  const id = setInterval(() => { if (!row.isConnected) { clearInterval(id); return; } paint(); }, 1000);
  return id;
}
