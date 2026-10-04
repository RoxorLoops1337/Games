// The contact sheet. URL params: sheet=all|mains|poses|busts|crew  w=1600 h=900  (RJ.draw / RJ.bust are defined by the character files)
(function () {
  const q = new URLSearchParams(location.search);
  const W = +q.get('w') || 1600, H = +q.get('h') || 900, which = q.get('sheet') || 'all';
  const cv = document.getElementById('c'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const tk = ART.tk;
  ctx.fillStyle = '#2a2050'; ctx.fillRect(0, 0, W, H);
  const lab = (t, x, y) => { ctx.fillStyle = '#f2e7ff'; ctx.font = '16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(t, x, y); };
  const draw = (who, x, y, s, o) => { try { RJ.draw(ctx, who, Object.assign({ x, y, s }, o || {})); } catch (e) { ctx.fillStyle = '#f66'; ctx.font = '14px sans-serif'; ctx.fillText(who + ': ' + e.message, x, y - 40); } };
  const bust = (who, x, y, w, h) => { ctx.save(); ctx.translate(x, y); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip(); try { RJ.bust(ctx, who, w, h); } catch (e) { ctx.fillStyle = '#f66'; ctx.fillText(who + ': ' + e.message, 10, 20); } ctx.restore(); };
  const mains = ['roxor', 'jasmin'], crew = ['rawclaw', 'andy', 'jordan'];
  if (which === 'mains') { mains.forEach((w, i) => { draw(w, 400 + i * 800, 840, 2.4); }); }
  else if (which === 'poses') { const poses = ['idle', 'sing', 'attack', 'hurt', 'cheer']; mains.forEach((w, r) => poses.forEach((p, i) => { const x = 160 + i * 310, y = 400 + r * 430; draw(w, x, y, 1.1, { pose: p }); lab(w + ' ' + p, x, y + 24); })); }
  else if (which === 'busts') { mains.concat(crew).forEach((w, i) => { const x = 20 + (i % 5) * 315, y = 40 + Math.floor(i / 5) * 430; bust(w, x, y, 300, 400); lab(w, x + 150, y + 420); }); }
  else if (which === 'crew') { crew.forEach((w, i) => { draw(w, 300 + i * 500, 840, 2.2); lab(w, 300 + i * 500, 880); }); }
  else { mains.concat(crew).forEach((w, i) => { const x = 160 + i * 300; draw(w, x, 560, 1.5); lab(w, x, 600); });
         mains.concat(crew).forEach((w, i) => { bust(w, 20 + i * 315, 620, 300, 280); }); }
  window.__done = true;
})();
