// Share card: a 1080x1080 picture of the run (tower, wave, nests, mice, best hit) and the share/download helper.
import { drawCat } from './art_cats.js';
import { CAT_BY_ID } from './cats.js';

import { chapterOf } from './story.js';

// the line that goes with the picture when it is shared
export function shareText(info) {
  const wave = (info && info.wave) | 0;
  const kills = (info && info.kills) | 0;
  const mice = kills > 0 ? ` and chased off ${kills} ${kills === 1 ? 'mouse' : 'mice'}, paws-itively purr-fect!` : '!';
  return `I reached wave ${wave} (chapter ${chapterOf(wave).n}) in Stacking Cats${mice} https://${SHARE_URL}/`;
}

export const SHARE_W = 1080, SHARE_H = 1080;
const DISPLAY = '"Lilita One","Baloo 2","Arial Rounded MT Bold",system-ui,sans-serif';
const BODY = '"Baloo 2","Nunito","Arial Rounded MT Bold",system-ui,sans-serif';
export const SHARE_URL = 'games-71g.pages.dev/stacking_cats';
export const SHARE_TAGLINE = 'Help rescue the catnapped cats of Whiskerton!';

const fmt = (n) => { n = Math.round(+n || 0); return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : String(n); };

// info: { wave, kills, bossKills, biggest, diff, daily, cats: [catId, ...] top of the tower first or last, any order }
// size and spacing of the cat tower on the card: tall stacks shrink so the top cat stays below the subtitle
export const SHARE_CATS = 5;
export const shareExtra = (total) => Math.max(0, total - SHARE_CATS);
export function shareStack(n) {
  const bottom = 880, topLimit = 215, step = 0.5;
  const cell = Math.min(250, (bottom - topLimit) / (1 + Math.max(0, n - 1) * step));
  return { cell, step: cell * step, bottom };
}

export function drawShareCard(canvas, info = {}) {
  try {
    canvas.width = SHARE_W; canvas.height = SHARE_H;
    const x = canvas.getContext('2d');
    if (!x) return false;
    const W = SHARE_W, H = SHARE_H;
    const sky = x.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#2a1d4a'); sky.addColorStop(0.55, '#7a4f9a'); sky.addColorStop(0.82, '#ffa8a0'); sky.addColorStop(1, '#ffd9a8');
    x.fillStyle = sky; x.fillRect(0, 0, W, H);
    // stars
    x.fillStyle = 'rgba(255,255,255,.7)';
    for (let i = 0; i < 40; i++) { x.beginPath(); x.arc(((i * 197) % 1000) + 40, ((i * 83) % 420) + 20, 1.5 + (i % 3), 0, 6.283); x.fill(); }
    // hills and ground
    x.fillStyle = '#4a3578'; x.beginPath(); x.moveTo(0, 860); x.quadraticCurveTo(300, 760, 620, 850); x.quadraticCurveTo(880, 920, W, 820); x.lineTo(W, H); x.lineTo(0, H); x.fill();
    x.fillStyle = '#2f2358'; x.fillRect(0, 900, W, H - 900);
    x.fillStyle = '#3d2d6e'; x.fillRect(0, 900, W, 8);

    // title
    x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    x.font = `110px ${DISPLAY}`; x.lineJoin = 'round'; x.lineWidth = 16; x.strokeStyle = '#271c33'; x.fillStyle = '#ffd23f';
    x.strokeText('Stacking Cats', W / 2, 140); x.fillText('Stacking Cats', W / 2, 140);
    x.font = `38px ${BODY}`; x.fillStyle = '#fff8ef';
    x.fillText(info.daily ? `Daily challenge  -  ${info.diff || 'Normal'}` : `${info.diff || 'Normal'} difficulty`, W / 2, 200);

    // the tower: bottom cat at the bottom, up to 5 cats overlapping
    const all = (info.cats || []).filter((id) => CAT_BY_ID[id]);
    const ids = all.slice(0, SHARE_CATS);
    const { cell, step, bottom } = shareStack(ids.length), cx = 300;
    for (let i = 0; i < ids.length; i++) {
      const y = bottom - cell - i * step;
      x.save(); x.translate(cx - cell / 2, y); x.scale(cell / 120, cell / 120);
      x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = 12;
      try { drawCat(x, CAT_BY_ID[ids[ids.length - 1 - i]]); } catch (e) { /* skip a cat that fails to draw */ }
      x.restore();
    }

    if (shareExtra(all.length) > 0) {
      x.textAlign = 'center'; x.font = `40px ${DISPLAY}`; x.fillStyle = "#ffd23f";
      x.fillText(`+${shareExtra(all.length)} more cats`, cx, 936);
    }

    // stats panel
    const px = 560, py = 270, pw = 460, ph = 570;
    x.fillStyle = 'rgba(32,22,58,.82)'; x.strokeStyle = 'rgba(255,255,255,.25)'; x.lineWidth = 4;
    if (x.roundRect) { x.beginPath(); x.roundRect(px, py, pw, ph, 36); x.fill(); x.stroke(); } else { x.fillRect(px, py, pw, ph); }
    x.textAlign = 'left';
    const rows = [['Wave reached', info.wave], ['Nests destroyed', info.bossKills], ['Mice defeated', info.kills], ['Best hit', info.biggest]];
    rows.forEach(([label, v], i) => {
      const y = py + 130 + i * 128;
      x.font = `34px ${BODY}`; x.fillStyle = '#c9b8f0'; x.fillText(label, px + 40, y - 52);
      x.font = `84px ${DISPLAY}`; x.fillStyle = i === 0 ? '#ffd23f' : '#ffffff'; x.fillText(fmt(v), px + 40, y + 20);
    });

    // footer
    x.textAlign = 'center'; x.font = `40px ${BODY}`; x.fillStyle = '#fff8ef';
    x.font = `36px ${BODY}`; x.fillStyle = '#ffd23f'; x.fillText(SHARE_TAGLINE, W / 2, 986);
    x.font = `40px ${BODY}`; x.fillStyle = '#fff8ef';
    x.fillText(SHARE_URL, W / 2, 1040);
    return true;
  } catch (e) { return false; }
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// Resolves to 'shared', 'downloaded' or 'failed'. Never rejects.
export async function shareRun(info) {
  try {
    try { if (document.fonts && document.fonts.load) await Promise.race([document.fonts.load('40px "Lilita One"'), new Promise((r) => setTimeout(r, 800))]); } catch (e) { /* fallback font */ }
    const c = document.createElement('canvas');
    if (!drawShareCard(c, info)) return 'failed';
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    if (!blob) return 'failed';
    const name = 'stacking-cats-wave-' + (info.wave || 0) + '.png';
    try {
      const file = new File([blob], name, { type: 'image/png' });
      const data = { files: [file], title: 'Stacking Cats', text: shareText(info) };
      if (navigator.share && (!navigator.canShare || navigator.canShare(data))) { await navigator.share(data); return 'shared'; }
    } catch (e) {
      if (e && e.name === 'AbortError') return 'failed';       // the player closed the share sheet
    }
    download(blob, name);
    return 'downloaded';
  } catch (e) { return 'failed'; }
}
