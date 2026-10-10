// Battle Call: the share card. A 1080 x 1350 picture of how the player did, drawn on a canvas on their own phone
// (nothing is uploaded), shared with the native share sheet or downloaded.
import { S } from './state.js';
import { levelOf } from './juice.js';

/** How many finished battles the player called right, across every category. */
export function callStats() {
  const picks = (S.me && S.me.picks) || {};
  let hit = 0, tot = 0;
  for (const c of (S.event ? S.event.cats : [])) {
    for (const m of c.matches) {
      if (m.third || m.status !== 'done') continue;
      tot++;
      if (picks[m.id] && picks[m.id] === (m.w === 'a' ? m.a : m.b)) hit++;
    }
  }
  return { hit, tot };
}

const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
const font = (w, px) => `${w} ${px}px "Bricolage Grotesque", ui-rounded, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

export async function drawCard() {
  const W = 1080, H = 1350, me = S.me, ev = S.event;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const [bg, wm] = await Promise.all([load('img/hero.webp'), load('img/wordmark.svg')]);
  g.fillStyle = '#0a0914'; g.fillRect(0, 0, W, H);
  if (bg) { const k = Math.max(W / bg.width, H / bg.height); g.globalAlpha = 0.55; g.drawImage(bg, (W - bg.width * k) / 2, (H - bg.height * k) / 2, bg.width * k, bg.height * k); g.globalAlpha = 1; }
  const sh = g.createLinearGradient(0, 0, 0, H); sh.addColorStop(0, 'rgba(10,9,20,.35)'); sh.addColorStop(0.55, 'rgba(10,9,20,.8)'); sh.addColorStop(1, 'rgba(10,9,20,.95)');
  g.fillStyle = sh; g.fillRect(0, 0, W, H);
  const gl = g.createRadialGradient(W * 0.2, 0, 0, W * 0.2, 0, 900); gl.addColorStop(0, 'rgba(139,92,255,.5)'); gl.addColorStop(1, 'rgba(139,92,255,0)'); g.fillStyle = gl; g.fillRect(0, 0, W, H);
  if (wm) { const h = 70, w = (wm.width / wm.height) * h; g.drawImage(wm, (W - w) / 2, 70, w, h); }
  g.textAlign = 'center'; g.fillStyle = '#c9c4f0'; g.font = font(700, 38);
  g.fillText(String(ev ? ev.name : 'Battle').toUpperCase().slice(0, 34), W / 2, 220);

  const { hit, tot } = callStats();
  g.fillStyle = '#fff'; g.font = font(800, 76); g.fillText(me.name, W / 2, 420);
  const grad = g.createLinearGradient(0, 480, W, 760); grad.addColorStop(0, '#8b5cff'); grad.addColorStop(0.6, '#ff4fb0'); grad.addColorStop(1, '#ff8a4d');
  g.fillStyle = grad; g.font = font(800, 300); g.fillText('#' + me.rank, W / 2, 720);
  g.fillStyle = '#c9c4f0'; g.font = font(600, 46); g.fillText(`of ${me.of} players`, W / 2, 790);

  const cell = (x, y, big, small) => {
    g.fillStyle = 'rgba(255,255,255,.09)'; g.beginPath(); g.roundRect(x, y, 440, 200, 36); g.fill();
    g.fillStyle = '#fff'; g.font = font(800, 84); g.fillText(big, x + 220, y + 110);
    g.fillStyle = '#a29dc9'; g.font = font(600, 34); g.fillText(small, x + 220, y + 162);
  };
  cell(80, 860, tot ? `${hit} of ${tot}` : String(hit), 'battles called');
  cell(560, 860, me.net.toLocaleString(), 'Loops');
  cell(80, 1090, String((me.st && me.st.won) || 0), 'bets won');
  cell(560, 1090, 'Lv ' + levelOf(me).lvl, levelOf(me).title);
  g.fillStyle = '#a29dc9'; g.font = font(600, 32); g.fillText('Call the battle. Join the next one.', W / 2, 1325);
  return cv;
}

/** Share the card (native sheet with the picture when the phone can, else a download). */
export async function shareCard() {
  const cv = await drawCard();
  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
  if (!blob) return { ok: false };
  const file = new File([blob], 'battlecall.png', { type: 'image/png' });
  const text = `I called ${callStats().hit} of ${callStats().tot} battles. Rank ${S.me.rank} of ${S.me.of} on BattleCall!`;
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text, title: 'BattleCall' }); return { ok: true }; }
  } catch (e) { if (e && e.name === 'AbortError') return { ok: true }; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'battlecall.png';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return { ok: true, saved: true };
}
