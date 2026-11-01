// share.js: the crayon "brag card" of a finished run (1080 x 1350 PNG) and the share/download helper.
// makeShareCard(run, result, profile) -> canvas. shareCard(canvas, text) -> Promise<'shared'|'downloaded'|'cancelled'|'failed'>.
// Draws with the same art modules as the battle view (board floor, turret sprites at their levels, busts). Safe to call with partial data.
import { W, H, COLS, TURRETS, BOARD_X, BOARD_Y, BOARD_W, BOARD_H, fmt } from './data_core.js';
import * as AE from './art_entities.js';
import * as AW from './art_world.js';
import * as K from './doodle_kit.js';

export const SHARE_URL = 'games-71g.pages.dev/drop_the_bass/';
const CW = 1080, CH = 1350, LW = 540, LH = 675;     // canvas px, logical px (drawn at 2x)
const INK = '#2b2733', DIM = '#6b6477';
const FONT = '"Patrick Hand", "Gochi Hand", "Comic Sans MS", "Chalkboard SE", "Marker Felt", system-ui, sans-serif';

function newCanvas() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = CW; c.height = CH; return c;
}
function say(ctx, s, x, y, size, col, align = 'left', o = {}) {
  ctx.save();
  ctx.font = '400 ' + size + 'px ' + FONT; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  if (o.rot) { ctx.translate(x, y); ctx.rotate(o.rot); x = 0; y = 0; }
  if (o.halo) { ctx.lineWidth = o.haloW || Math.max(3, size * 0.16); ctx.strokeStyle = o.halo; ctx.strokeText(s, x, y); }
  ctx.fillStyle = col; ctx.fillText(s, x, y);
  ctx.restore();
}
function wob(ctx, x, y, w, h, r = 12) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y + 1.5); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w - 1.5, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h - 1.5);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x + 1.5, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
function card(ctx, x, y, w, h, fill = '#fbf6e6', shadow = true) {
  ctx.save();
  if (shadow) { ctx.fillStyle = INK; wob(ctx, x + 4, y + 5, w, h); ctx.fill(); }
  ctx.fillStyle = fill; wob(ctx, x, y, w, h); ctx.fill();
  ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
}
function safe(fn) { try { fn(); } catch (e) { /* art must never break the card */ } }

export function makeShareCard(run, result, profile) {
  const worn = (who) => (profile && profile.outfits && profile.outfits.worn && profile.outfits.worn[who]) || "default";
  const cv = newCanvas();
  if (!cv) return null;
  const ctx = cv.getContext('2d');
  const r = result || (run && run.result) || {};
  const won = !!r.won;
  const mode = r.mode || (run && run.mode) || 'story';
  const world = (run && run.world) || null;
  ctx.scale(CW / LW, CH / LH);

  // paper, a taped frame and the logo
  safe(() => K.paper(ctx, 0, 0, LW, LH, { holes: true }));
  ctx.save(); ctx.lineWidth = 6; ctx.strokeStyle = INK; wob(ctx, 8, 8, LW - 16, LH - 16, 14); ctx.stroke(); ctx.restore();
  safe(() => AW.drawLogo(ctx, LW / 2, 62, 140, 0));

  // headline
  const stage = world ? world.name : 'Drop the Bass';
  say(ctx, stage, LW / 2, 134, 30, INK, 'center', { halo: '#ffe28a', haloW: 9 });
  let head, sub;
  if (won) { head = mode === 'tutorial' ? 'PRACTICE DONE!' : 'VICTORY!'; sub = mode === 'story' && r.encore ? 'Encore ' + r.encore + ' cleared' : mode === 'boss_rush' ? 'Boss Rush cleared' : 'Stage cleared'; }
  else { head = 'WAVE ' + (r.wave || r.cleared || 0); sub = mode === 'endless' ? 'Endless run' : mode === 'daily' ? 'Daily challenge' : 'The Static won this round'; }
  say(ctx, head, LW / 2, 178, 46, won ? '#43b94a' : '#e8403f', 'center', { halo: INK, haloW: 11, rot: -0.02 });
  say(ctx, sub, LW / 2, 200, 18, DIM, 'center');

  // stars (story wins)
  if (won && mode === 'story') {
    for (let i = 0; i < 3; i++) safe(() => { ctx.save(); ctx.globalAlpha = i < (r.stars || 0) ? 1 : 0.25; AE.drawGlyph(ctx, 'star', LW / 2 + (i - 1) * 40, 226, 36, i < (r.stars || 0) ? '#ffc83d' : '#8a7cc0'); ctx.restore(); });
  }

  // the final board, cropped to the board rectangle and drawn at 0.56
  const bs = 0.46, bx = 22, by = 250, bw = BOARD_W * bs, bh = BOARD_H * bs;
  card(ctx, bx - 4, by - 4, bw + 8, bh + 8, '#fbf6e6');
  ctx.save();
  ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip();
  ctx.translate(bx, by); ctx.scale(bs, bs); ctx.translate(-BOARD_X, -BOARD_Y);
  if (run && run.map) {
    safe(() => AW.drawBoard(ctx, run.map.id, run.world.id, 0, { beat: 0 }));
    safe(() => AW.drawStageBase(ctx, run.world.id, run.map.base.x, run.map.base.y, { t: 0, hp: won ? 1 : 0.3, hit: 0, beat: 0 }));
    const ts = (run.turrets || []).slice().sort((a, b) => a.y - b.y);
    for (const tu of ts) {
      safe(() => { ctx.save(); ctx.globalAlpha = 0.2; ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(tu.x, tu.y + 24, 25 + tu.level, 8, 0, 0, 6.3); ctx.fill(); ctx.restore(); });
      safe(() => AE.drawTurret(ctx, tu.type, tu.level, tu.x, tu.y, { t: 0, ang: tu.ang || -1.2, fire: 0, spawn: 1, alpha: 1 }));
    }
  }
  ctx.restore();

  // stat notes on the right
  const sx = bx + bw + 22, sw = LW - sx - 18;
  const stats = [['Kills', fmt(r.kills || 0)], ['Best combo', 'x' + (r.bestCombo || 0)], [mode === 'endless' || !won ? 'Waves cleared' : 'Waves', String(r.cleared || 0)], ['Merges', String(r.merges || 0)]];
  stats.forEach(([k, v], i) => {
    const y = by + i * 52;
    card(ctx, sx, y, sw, 44, i % 2 ? '#fff1b8' : '#e6f1ff');
    say(ctx, k, sx + 12, y + 18, 16, DIM);
    say(ctx, v, sx + 12, y + 39, 26, INK);
  });
  // the duo
  const ty = by + 4 * 52 + 2;
  const room = by + bh - ty;
  const bust = Math.min(110, room - 14);
  safe(() => AW.drawBust(ctx, 'roxor', sx + sw * 0.27, ty + room * 0.5, bust, { t: 0, pose: won ? 'cheer' : 'sad', outfit: worn('roxor') }));
  safe(() => AW.drawBust(ctx, 'jasmin', sx + sw * 0.76, ty + room * 0.5, bust, { t: 0, pose: won ? 'cheer' : 'sad', outfit: worn('jasmin') }));
  say(ctx, 'RoxorLoops & Jasmin', sx + sw / 2, by + bh - 2, 16, INK, 'center', { halo: '#fbf6e6', haloW: 5 });

  // footer: the call and the url
  const fy = by + bh + 14;
  say(ctx, won ? 'Can you beat it?' : 'Think you can do better?', LW / 2, fy + 20, 26, INK, 'center');
  card(ctx, 70, fy + 28, LW - 140, 36, '#ffe28a');
  say(ctx, SHARE_URL, LW / 2, fy + 54, 22, INK, 'center');
  if (profile && profile.name) say(ctx, 'by ' + profile.name, LW - 24, 30, 16, DIM, 'right');
  return cv;
}

export function shareText(result, world) {
  const r = result || {};
  const where = world && world.name ? ' on ' + world.name : '';
  const line = r.won ? 'I cleared a stage' + where + (r.stars ? ' with ' + r.stars + ' star' + (r.stars > 1 ? 's' : '') : '') : 'I reached wave ' + (r.wave || r.cleared || 0) + where;
  return line + ' in Drop the Bass with RoxorLoops and Jasmin! https://' + SHARE_URL;
}

function toBlob(canvas) {
  return new Promise((res) => { try { canvas.toBlob((b) => res(b), 'image/png'); } catch (e) { res(null); } });
}
export async function shareCard(canvas, text) {
  if (!canvas) return 'failed';
  const blob = await toBlob(canvas);
  if (!blob) return 'failed';
  const name = 'drop-the-bass.png';
  try {
    if (typeof File !== 'undefined' && typeof navigator !== 'undefined' && navigator.share) {
      const file = new File([blob], name, { type: 'image/png' });
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: text || '', title: 'Drop the Bass' });
        return 'shared';
      }
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled';
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; a.style.display = 'none';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'downloaded';
  } catch (e) { return 'failed'; }
}
