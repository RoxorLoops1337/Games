// Character Studio output: the stage backdrops, tight-cropped PNG sprites, the pose sheet, the round avatar, the duo poster, downloads and the
// browser storage helpers. Everything draws through CC.draw / CC.view, so what you export is exactly what the preview shows.
(function () {
  'use strict';
  const CC = window.CC, tk = ART.tk;
  const { clamp, lerp, TAU } = CC.u;

  // ---- storage (every call is guarded: a private window or a full disk must never break the editor) ----
  CC.store = {
    get(k) { try { const v = window.localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };

  // ---- backdrops ----
  const hash = (i) => { let x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  CC.BG = [
    { id: 'stage', label: 'Stage' }, { id: 'night', label: 'Night' }, { id: 'blossom', label: 'Blossom' }, { id: 'meadow', label: 'Meadow' },
    { id: 'duo', label: 'Pink + green' }, { id: 'cream', label: 'Cream' }, { id: 'clear', label: 'Clear' },
  ];
  function floor(g, cx, y, rx, c1, c2) {
    g.save(); g.fillStyle = c2; g.beginPath(); g.ellipse(cx, y + 6, rx * 1.04, rx * 0.2, 0, 0, TAU); g.fill();
    g.fillStyle = c1; g.beginPath(); g.ellipse(cx, y, rx, rx * 0.19, 0, 0, TAU); g.fill();
    g.restore();
  }
  CC.drawBg = function (g, w, h, id, t, feetY, cx) {
    t = t || 0; feetY = feetY || h * 0.9; cx = cx === undefined ? w / 2 : cx;
    g.save();
    if (id === 'clear') {
      const s = 16; g.fillStyle = '#2a2250'; g.fillRect(0, 0, w, h); g.fillStyle = '#322a5e';
      for (let y = 0; y < h; y += s) for (let x = (y / s) % 2 ? s : 0; x < w; x += s * 2) g.fillRect(x, y, s, s);
    } else if (id === 'cream') {
      g.fillStyle = '#fff4e6'; g.fillRect(0, 0, w, h);
      const gr = g.createRadialGradient(cx, feetY - h * 0.2, 10, cx, feetY - h * 0.2, h * 0.8); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,200,170,0.25)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      floor(g, cx, feetY, Math.min(w, h) * 0.34, '#ffe3cc', 'rgba(60,30,20,0.12)');
    } else if (id === 'duo') {
      g.fillStyle = '#3fcf6a'; g.fillRect(0, 0, w, h); g.fillStyle = '#ff7eb6'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(0, h); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,244,230,0.9)'; g.beginPath(); g.ellipse(cx, feetY - h * 0.34, Math.min(w, h) * 0.42, Math.min(w, h) * 0.42, 0, 0, TAU); g.fill();
      floor(g, cx, feetY, Math.min(w, h) * 0.3, 'rgba(255,244,230,0.9)', 'rgba(45,23,15,0.25)');
    } else if (id === 'meadow') {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#8fd7ff'); gr.addColorStop(0.62, '#d9fff4'); gr.addColorStop(1, '#a8f0cf'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = '#7fe0a0'; g.beginPath(); g.moveTo(0, feetY - h * 0.1); g.quadraticCurveTo(w * 0.25, feetY - h * 0.3, w * 0.5, feetY - h * 0.12); g.quadraticCurveTo(w * 0.78, feetY - h * 0.02, w, feetY - h * 0.2); g.lineTo(w, h); g.lineTo(0, h); g.fill();
      g.fillStyle = '#5fcf88'; g.beginPath(); g.moveTo(0, feetY - h * 0.02); g.quadraticCurveTo(w * 0.4, feetY - h * 0.14, w, feetY); g.lineTo(w, h); g.lineTo(0, h); g.fill();
      for (let i = 0; i < 4; i++) { const x = (hash(i + 3) * 0.8 + 0.1) * w, y = h * (0.12 + hash(i) * 0.25) + Math.sin(t * 0.4 + i) * 4; g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.ellipse(x, y, 40, 11, 0, 0, TAU); g.ellipse(x + 20, y - 8, 26, 10, 0, 0, TAU); g.fill(); }
      floor(g, cx, feetY, Math.min(w, h) * 0.3, '#5fcf88', 'rgba(20,60,40,0.25)');
    } else if (id === 'blossom') {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffe3f1'); gr.addColorStop(1, '#ff9bc0'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 18; i++) { const u = (t * (0.04 + hash(i) * 0.05) + hash(i + 9)) % 1, x = ((hash(i + 1) + Math.sin(t * 0.6 + i) * 0.04) % 1) * w, y = u * (h + 40) - 20; tk.petal(g, x, y, 8 + hash(i + 4) * 8, t * 1.2 + i, 0.9); }
      floor(g, cx, feetY, Math.min(w, h) * 0.3, '#ffc9de', 'rgba(150,40,90,0.25)');
    } else if (id === 'night') {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0d0b1e'); gr.addColorStop(1, '#3b2a7a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) { const tw = 0.6 + 0.4 * Math.sin(t * 2 + i * 1.7); tk.sparkle(g, hash(i) * w, hash(i + 50) * h * 0.8, (1.5 + hash(i + 9) * 3.5) * tw, { color: i % 5 ? '#fff4e6' : '#ffd84d', glow: 0.25, thin: 0.3 }); }
      g.fillStyle = 'rgba(255,244,230,0.92)'; g.beginPath(); g.arc(w * 0.82, h * 0.2, Math.min(w, h) * 0.07, 0, TAU); g.fill();
      floor(g, cx, feetY, Math.min(w, h) * 0.3, '#4b2f8a', 'rgba(0,0,0,0.35)');
    } else {                                                                 // stage: curtains, a spotlight, a round stage
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2a1d5a'); gr.addColorStop(1, '#0d0b1e'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const cw = Math.min(w * 0.17, 190);
      [[0, 1], [w, -1]].forEach((s) => {
        const x0 = s[0], dir = s[1];
        g.fillStyle = '#8f1838'; g.beginPath(); g.moveTo(x0, 0); for (let y = 0; y <= h; y += 12) g.lineTo(x0 + dir * (cw + Math.sin(y * 0.02 + 1) * 8 + (h - y) * 0.06), y); g.lineTo(x0, h); g.closePath(); g.fill();
        for (let i = 0; i < 5; i++) { const o = i * (cw / 5); g.fillStyle = i % 2 ? '#c8264f' : '#a01c3f'; g.beginPath(); g.moveTo(x0 + dir * o, 0); for (let y = 0; y <= h; y += 12) g.lineTo(x0 + dir * (o + cw / 5 + Math.sin(y * 0.02 + i) * 4), y); g.lineTo(x0 + dir * o, h); g.closePath(); g.globalAlpha = 0.55; g.fill(); g.globalAlpha = 1; }
      });
      const cone = g.createRadialGradient(cx, -20, 10, cx, feetY, h * 0.95); cone.addColorStop(0, 'rgba(255,244,214,0.5)'); cone.addColorStop(0.55, 'rgba(255,244,214,0.12)'); cone.addColorStop(1, 'rgba(255,244,214,0)');
      g.fillStyle = cone; g.beginPath(); g.moveTo(cx - 24, 0); g.lineTo(cx + 24, 0); g.lineTo(cx + w * 0.3, feetY + 20); g.lineTo(cx - w * 0.3, feetY + 20); g.closePath(); g.fill();
      for (let i = 0; i < 26; i++) { const a = 0.35 + 0.35 * Math.sin(t * 1.4 + i * 2.1), x = cx + (hash(i) - 0.5) * w * 0.55, y = hash(i + 7) * feetY * 0.95; g.fillStyle = 'rgba(255,244,214,' + a * 0.45 + ')'; g.beginPath(); g.arc(x, y, 1 + hash(i + 3) * 1.8, 0, TAU); g.fill(); }
      floor(g, cx, feetY, Math.min(w, h) * 0.36, '#5b3fa8', 'rgba(0,0,0,0.4)');
      g.strokeStyle = '#fff4e6'; g.lineWidth = 3; g.beginPath(); g.ellipse(cx, feetY, Math.min(w, h) * 0.36, Math.min(w, h) * 0.36 * 0.19, 0, 0, TAU); g.stroke();
    }
    g.restore();
  };

  // ---- PNG sprites ----
  function tightBox(cv) {
    const w = cv.width, h = cv.height, d = cv.getContext('2d').getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? null : [x0, y0, x1 + 1, y1 + 1];
  }
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  // one pose, transparent, cropped to the figure. o: {pose, expr, scale, t, flip, shadow, pad}
  CC.render = {
    sprite(cfg, o) {
      o = o || {};
      const k = o.scale || 2, W = 520 * k, H = 520 * k, cv = mk(W, H), g = cv.getContext('2d');
      CC.draw(g, cfg, { x: W / 2, y: H - 70 * k, s: k, pose: o.pose || 'idle', t: o.t === undefined ? 1 : o.t, expr: o.expr, flip: !!o.flip, noShadow: o.shadow === false });
      const b = tightBox(cv);
      if (!b) return cv;
      const pad = Math.round((o.pad === undefined ? 8 : o.pad) * k), out = mk(b[2] - b[0] + pad * 2, b[3] - b[1] + pad * 2);
      out.getContext('2d').drawImage(cv, b[0], b[1], b[2] - b[0], b[3] - b[1], pad, pad, b[2] - b[0], b[3] - b[1]);
      return out;
    },
    // every pose on one transparent sheet, one cell each
    sheet(cfg, o) {
      o = o || {};
      const poses = CC.CAT.pose.map((p) => p.id), cols = 5, k = o.scale || 1, cw = 360 * k, ch = 440 * k, rows = Math.ceil(poses.length / cols), cv = mk(cols * cw, rows * ch), g = cv.getContext('2d');
      poses.forEach((p, i) => { CC.draw(g, cfg, { x: (i % cols) * cw + cw * 0.55, y: Math.floor(i / cols) * ch + ch - 40 * k, s: k, pose: p, t: 1, expr: o.expr, noShadow: o.shadow === false }); });
      return cv;
    },
    // a round avatar: the face on a disc in the game's colours, a cream rim and a warm outline
    avatar(cfg, size, o) {
      o = o || {};
      const cv = mk(size, size), g = cv.getContext('2d'), r = size / 2;
      g.save(); g.beginPath(); g.arc(r, r, r - 2, 0, TAU); g.clip();
      const gr = g.createLinearGradient(0, 0, size, size); gr.addColorStop(0, o.c1 || '#ff7eb6'); gr.addColorStop(1, o.c2 || '#3fcf6a'); g.fillStyle = gr; g.fillRect(0, 0, size, size);
      g.fillStyle = 'rgba(255,244,230,0.35)'; g.beginPath(); g.arc(r, r * 1.05, r * 0.78, 0, TAU); g.fill();
      CC.view(g, cfg, size, size, { pose: 'bust', span: 240, dy: -22, at: 0.5, expr: o.expr });
      g.restore();
      g.lineWidth = size * 0.035; g.strokeStyle = '#fff4e6'; g.beginPath(); g.arc(r, r, r - size * 0.025, 0, TAU); g.stroke();
      g.lineWidth = size * 0.02; g.strokeStyle = '#2d170f'; g.beginPath(); g.arc(r, r, r - 1.5, 0, TAU); g.stroke();
      return cv;
    },
    // a poster of one or two characters on a backdrop
    poster(cfgs, o) {
      o = o || {};
      const W = o.w || 1600, H = o.h || 900, cv = mk(W, H), g = cv.getContext('2d'), n = cfgs.length, s = (H * 0.78) / 340;
      CC.drawBg(g, W, H, o.bg || 'stage', 1, H * 0.9, W / 2);
      cfgs.forEach((c, i) => { CC.draw(g, c, { x: n === 1 ? W / 2 : W * (0.5 + (i ? 0.2 : -0.2)), y: H * 0.9, s, pose: (o.poses && o.poses[i]) || 'idle', t: 1, flip: i === 1 }); });
      return cv;
    },
  };

  CC.download = function (cv, name) {
    cv.toBlob((b) => {
      if (!b) return;
      const a = document.createElement('a'), u = URL.createObjectURL(b);
      a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
    }, 'image/png');
  };
  CC.downloadText = function (text, name, type) {
    const b = new Blob([text], { type: type || 'application/json' }), a = document.createElement('a'), u = URL.createObjectURL(b);
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
  };
  CC.slug = (s) => String(s || 'character').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'character';
})();
