// BEATBOX HEROES r3 -- icons3d.js (UI owner)
// Inline SVG icon set with the SAME names as World.icon (world_b.js) so no call site changes.
// Chunky sticker style: flat saturated fills, 1.7 dark outline (#2a1648), white glints. 24x24 viewBox.
//   BBH.R3Icons.svg(name, px)          -> svg string
//   BBH.R3Icons.el(name, px, style)    -> <svg> element (px: number = pixels, string = any CSS length)
//   BBH.R3Icons.names / has(name)      -> list / test
// Classic script. Safe to load without the game (BBH is created if missing).
(function (root) {
  'use strict';
  const BBH = root.BBH = root.BBH || {};
  const INK = '#2a1648', W = '#fff6e8';
  const o = (inner, sw) => '<g stroke="' + INK + '" stroke-width="' + (sw || 1.7) + '" stroke-linejoin="round" stroke-linecap="round">' + inner + '</g>';
  // a stroke-only line with a dark outline: draw wide dark stroke then the colour on top
  const thick = (d, col, w) => '<path d="' + d + '" fill="none" stroke="' + INK + '" stroke-width="' + (w + 3.2) + '" stroke-linecap="round" stroke-linejoin="round"/><path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"/>';
  const glint = (d, w) => '<path d="' + d + '" fill="none" stroke="#fff" stroke-width="' + (w || 1.5) + '" stroke-linecap="round" opacity=".85"/>';
  const P = (d, fill) => '<path d="' + d + '" fill="' + fill + '"/>';
  const C = (cx, cy, r, fill) => '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + fill + '"/>';
  const R = (x, y, w, h, rx, fill) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + rx + '" fill="' + fill + '"/>';
  const E = (cx, cy, rx, ry, fill) => '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + fill + '"/>';
  const dot = (cx, cy, r, fill) => '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + (fill || INK) + '" stroke="none"/>';
  function gear(cx, cy, ro, ri, n) {
    let d = ''; const step = Math.PI * 2 / n;
    for (let i = 0; i < n; i++) {
      const a = i * step - step / 2, pts = [[ri, a], [ro, a + step * 0.16], [ro, a + step * 0.34], [ri, a + step * 0.5]];
      pts.forEach((p, k) => { d += (i === 0 && k === 0 ? 'M' : 'L') + (cx + Math.cos(p[1]) * p[0]).toFixed(2) + ' ' + (cy + Math.sin(p[1]) * p[0]).toFixed(2); });
    }
    return d + 'Z';
  }
  function starPath(cx, cy, ro, ri, n) {
    let d = ''; for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, r = i % 2 ? ri : ro; d += (i ? 'L' : 'M') + (cx + Math.cos(a) * r).toFixed(2) + ' ' + (cy + Math.sin(a) * r).toFixed(2); }
    return d + 'Z';
  }

  const I = {};
  I.energy = o(P('M13.8 2.4 5 13.6h5.6l-1.6 8 9.4-12.2h-5.8z', '#ffd23f')) + glint('M12.6 5.6 9 10.4');
  I.food = o(P('M12 7.8C10 6 4.8 6.6 4.8 12.4c0 4.6 3 9 5.6 9 .9 0 1.3-.6 1.6-.6s.7.6 1.6.6c2.6 0 5.6-4.4 5.6-9 0-5.8-5.2-6.4-7.2-4.6z', '#ff5a68') + P('M12 7.6c-.3-2.7 1.2-4.5 4.2-4.9.1 2.9-1.3 4.7-4.2 4.9z', '#5fd16f')) + glint('M7.4 11.2c.2-1.2.8-2 1.6-2.5');
  I.mood = o(C(12, 12, 9.5, '#ffd23f') + '<path d="M7.6 14.2c1 2.5 2.9 3.6 4.4 3.6s3.4-1.1 4.4-3.6" fill="none"/>') + dot(8.8, 10.1, 1.5) + dot(15.2, 10.1, 1.5) + glint('M5.8 8.6a7 7 0 0 1 3.4-3.4');
  I.coin = o(C(12, 12, 9.6, '#ffbf2d') + C(12, 12, 6.6, '#ffe07a')) + '<path d="M14.3 9.6c-.4-1-1.3-1.6-2.4-1.6-1.4 0-2.4.8-2.4 1.9 0 2.7 5.1 1.4 5.1 4.1 0 1.2-1 2-2.5 2-1.2 0-2.2-.6-2.6-1.6M12 6.5V8M12 16v1.5" fill="none" stroke="#a8620a" stroke-width="1.6" stroke-linecap="round"/>' + glint('M5.2 8.6a7.4 7.4 0 0 1 3-3.4');
  I.cash = I.coin;
  I.fans = o(C(6.2, 9, 2.8, '#a98bff') + P('M1.6 18.5c0-3 2-5 4.6-5s4.6 2 4.6 5z', '#a98bff') + C(17.8, 9, 2.8, '#a98bff') + P('M13.2 18.5c0-3 2-5 4.6-5s4.6 2 4.6 5z', '#a98bff') + C(12, 8.4, 3.7, '#ff6bb5') + P('M5.4 21.4c0-4 2.8-6.8 6.6-6.8s6.6 2.8 6.6 6.8z', '#ff6bb5')) + glint('M10 6.4a2.4 2.4 0 0 1 1.6-.9');
  I.level = o(P('M12 2.4l8 3v6c0 5.2-3.4 8.8-8 10.4-4.6-1.6-8-5.2-8-10.4v-6z', '#2ee6ff')) + '<path d="M8 10.5l4-3.4 4 3.4M8 15l4-3.4 4 3.4" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>';
  I.mus = o(E(7.8, 18, 3.9, 3, '#2ee6ff') + P('M11.2 17.6V4.4l8.4 2.3v5.4l-8.4-2.3', '#2ee6ff')) + glint('M6.2 17.2c.4-.5 1-.7 1.6-.7');
  I.tech = o(R(5.5, 5.5, 13, 13, 3, '#9ea5cc') + '<path d="M9 2.8v2.7M15 2.8v2.7M9 18.5v2.7M15 18.5v2.7M2.8 9h2.7M2.8 15h2.7M18.5 9h2.7M18.5 15h2.7" fill="none"/>' + R(9, 9, 6, 6, 1.4, '#2f2a55')) + dot(12, 12, 1.4, '#2ee6ff') + glint('M7.5 9a2 2 0 0 1 1.4-1.4');
  I.ori = o(P('M12 2.6a6.5 6.5 0 0 0-3.6 11.9c.7.5 1.1 1.2 1.1 2h5c0-.8.4-1.5 1.1-2A6.5 6.5 0 0 0 12 2.6z', '#ffe14d') + P('M9.6 18.4h4.8v1.9a1.6 1.6 0 0 1-1.6 1.6h-1.6a1.6 1.6 0 0 1-1.6-1.6z', '#b9b6d6')) + glint('M8.2 8a4 4 0 0 1 2.4-2.6');
  I.show = o(P('M2.8 8.2l4.6 4.2L12 4.6l4.6 7.8 4.6-4.2-1.7 11.4H4.5z', '#ffd23f')) + dot(12, 4.6, 1.5, '#ff3ea5') + dot(2.8, 8.2, 1.4, '#2ee6ff') + dot(21.2, 8.2, 1.4, '#2ee6ff') + glint('M7.4 15.6h9.2', 1.4);
  I.lock = thick('M8 11V7.6a4 4 0 0 1 8 0V11', '#cfcbe6', 2.4) + o(R(4.6, 10.4, 14.8, 11.2, 3.2, '#ffb630')) + dot(12, 15.2, 1.7) + '<path d="M12 16v2.6" stroke="' + INK + '" stroke-width="1.8" stroke-linecap="round"/>' + glint('M7 13.4v3', 1.3);
  I.check = thick('M5 12.6l4.8 4.8L19.4 7', '#4fe07a', 3.2);
  I.cross = thick('M6 6l12 12M18 6 6 18', '#ff5a6e', 3.2);
  I.heart = o(P('M12 21C5.8 16.6 3 13 3 9.5A4.9 4.9 0 0 1 12 6.8 4.9 4.9 0 0 1 21 9.5C21 13 18.2 16.6 12 21z', '#ff4f78')) + glint('M6.2 9.2a2.6 2.6 0 0 1 2-2.2');
  I.star = o(P(starPath(12, 12.6, 10, 4.4, 5), '#ffd23f')) + glint('M9.8 9.4l1.6-3.2');
  I.note = o(R(8.2, 5.6, 2.2, 12.6, 1, '#ff3ea5') + R(18.8, 3.8, 2.2, 12.6, 1, '#ff3ea5') + P('M8.4 5.8l12.6-2.2v4.2L8.4 10z', '#ff3ea5') + E(6.2, 18.4, 3.4, 2.7, '#ff3ea5') + E(16.8, 16.6, 3.4, 2.7, '#ff3ea5')) + glint('M5 17.8c.4-.4.8-.6 1.4-.6');
  I.mic = thick('M5.6 11.2a6.4 6.4 0 0 0 12.8 0', '#cfcbe6', 1.8) + o(R(8.4, 2.6, 7.2, 11.6, 3.6, '#e4e0f5') + '<path d="M12 17.6V21M8.4 21.4h7.2" fill="none"/>') + '<path d="M9 7h6M9 10h6" stroke="#8d88b5" stroke-width="1.3" stroke-linecap="round"/>' + glint('M10.3 4.6v2.2', 1.2);
  I.hat = o(P('M4 15.4a8 8 0 0 1 16 0z', '#3f6ae0') + P('M12.4 15.2c3.6-.4 8 .5 8.6 2.4-4 .8-9.4.6-13.8-.4z', '#2f52b8')) + dot(12, 7.4, 1.4, '#ff3ea5') + glint('M7.4 12.2a5 5 0 0 1 3-3.4');
  I.glasses = o(R(2.4, 8, 8.4, 7.4, 3, '#3a2a6a') + R(13.2, 8, 8.4, 7.4, 3, '#3a2a6a') + '<path d="M10.8 10.4q1.2-1 2.4 0M2.4 9.8 1 8M21.6 9.8 23 8" fill="none"/>') + glint('M4.4 11.4l2.4-1.6M15.2 11.4l2.4-1.6', 1.6);
  I.shirt = o(P('M8.6 3.4 3 6.6l2 4.2 2.6-1.2V20.6h8.8V9.6l2.6 1.2 2-4.2-5.6-3.2c-.5 1.5-1.9 2.5-3.4 2.5s-2.9-1-3.4-2.5z', '#ff6b6b')) + glint('M9.6 12.6v4.4');
  I.pants = o(P('M6.2 3h11.6l1.4 18.6h-5.4L12 11.4l-1.8 10.2H4.8z', '#3f6ae0') + '<path d="M6.4 6.6h11.2" fill="none"/>') + dot(12, 4.9, 1, '#ffd23f') + glint('M8.2 10l-.6 6');
  I.shoe = o(P('M3 7.4h5.2l1.8 3.2c2.2.8 5.4 1.2 8 2.6 1.9 1 3 1.9 3 4.2H3z', '#ff4fa8') + R(3, 17.2, 18, 3.6, 1.6, '#fff6e8')) + glint('M5.2 10l1.4.2M10.4 13l1.4.8', 1.4);
  I.sleep = o(P('M17.6 15.2A8.4 8.4 0 1 1 9.4 3.4a6.6 6.6 0 0 0 8.2 11.8z', '#ffe14d')) + thick('M13.2 3.6h5.4l-5.4 5.6h5.4', '#b393ff', 1.9) + glint('M5.4 12a5 5 0 0 1 2.4-4.6');
  I.eat = o(P('M2.8 12.2h18.4a9.2 8.6 0 0 1-18.4 0z', '#fff0c9') + C(7.6, 8.6, 3, '#5fd16f') + C(12.4, 7.8, 3.2, '#ff6b6b') + C(16.6, 9, 2.6, '#7fe08a')) + glint('M6 14.8a6 5 0 0 0 3.4 3.4');
  I.train = o(R(2.4, 7.6, 3.8, 8.8, 1.6, '#9fb2d8') + R(17.8, 7.6, 3.8, 8.8, 1.6, '#9fb2d8') + R(6.2, 9.8, 2.6, 4.4, 1, '#c9d2ea') + R(15.2, 9.8, 2.6, 4.4, 1, '#c9d2ea') + R(8.8, 11, 6.4, 2, 1, '#cfcbe6')) + glint('M4 9.4v3');
  I.busk = o(P('M5 10.6h14l-1.5 9.4a2 2 0 0 1-2 1.7h-7a2 2 0 0 1-2-1.7z', '#e07a3c') + E(12, 10.6, 7, 2.7, '#fff0c9')) + thick('M15.6 8 20.6 3M8.4 8 3.4 3', '#c98a50', 1.6) + dot(20.8, 2.8, 1.6, '#ffd23f') + dot(3.2, 2.8, 1.6, '#ffd23f') + glint('M7.4 14.4l.6 4');
  I.battle = thick('M5.4 19 17 7.4', '#ece7fb', 2) + thick('M18.6 19 7 7.4', '#ece7fb', 2) + o(C(18.6, 5.6, 3.1, '#ff3ea5') + C(5.4, 5.6, 3.1, '#2ee6ff')) + glint('M17.4 4.6a1.6 1.6 0 0 1 1-.8', 1.2);
  I.shop = thick('M8.6 10.6V7a3.4 3.4 0 0 1 6.8 0v3.6', '#cfcbe6', 1.8) + o(P('M5 8.2h14l1 12.4a1.6 1.6 0 0 1-1.6 1.7H5.6A1.6 1.6 0 0 1 4 20.6z', '#ffb630')) + dot(9, 12.6, 1.1) + dot(15, 12.6, 1.1) + glint('M6.8 11.4l-.3 5');
  I.home = o(P('M5.4 10.6V21h13.2V10.6L12 5z', '#ffd18a') + P('M2.4 11.4 12 3l9.6 8.4-1.4 1.6L12 5.8 3.8 13z', '#ff6b6b') + R(10, 14, 4, 7, 1.2, '#8a4ac4')) + glint('M7 13.4v3');
  I.park = o(R(10.4, 14.6, 3.2, 6.8, 1, '#a0693c') + C(7.6, 11.2, 4.6, '#3fae5a') + C(16.4, 11.2, 4.6, '#3fae5a') + C(12, 7, 4.8, '#52c96c')) + glint('M10 5.2a3 3 0 0 1 2-1.2');
  I.bar = o(P('M3.4 4h17.2L12.9 12.6V20h4.3v1.8H6.8V20h4.3v-7.4z', '#ff3ea5')) + dot(15.4, 3.4, 1.9, '#9dff4a') + glint('M6.4 6.4h5');
  I.studio = thick('M4.8 14.4V12a7.2 7.2 0 0 1 14.4 0v2.4', '#cfcbe6', 1.8) + o(R(2.6, 13, 5, 8, 2.2, '#2ee6ff') + R(16.4, 13, 5, 8, 2.2, '#2ee6ff')) + glint('M4.4 15.2v3.4M18 15.2v3.4', 1.3);
  I.gear = o('<path d="' + gear(12, 12, 10, 7.6, 8) + '" fill="#cfcbe6"/>' + C(12, 12, 3.3, '#5b4a8c')) + glint('M6.6 7.4a7 7 0 0 1 2-1.6');
  I.sound = o(P('M3.4 9.4h3.8L12.6 5v14l-5.4-4.4H3.4z', '#cfcbe6')) + thick('M16 9.2a4.2 4.2 0 0 1 0 5.6M18.8 6.6a8 8 0 0 1 0 10.8', '#2ee6ff', 1.7);
  I.mute = o(P('M3.4 9.4h3.8L12.6 5v14l-5.4-4.4H3.4z', '#9b97bd')) + thick('M15.6 9.4l5 5M20.6 9.4l-5 5', '#ff5a6e', 2.2);
  I.back = thick('M8.6 4.8 3.6 9.6l5 4.8', W, 2.4) + thick('M4 9.6h9.6a5.4 5.4 0 0 1 0 10.8H9', W, 2.4);
  I.left = o(P('M15.6 4.4 6.2 12l9.4 7.6z', W));
  I.right = o(P('M8.4 4.4 17.8 12l-9.4 7.6z', W));
  I.trophy = thick('M6.8 5.6H3.6v2.6a3.6 3.6 0 0 0 3.6 3.6M17.2 5.6h3.2v2.6a3.6 3.6 0 0 1-3.6 3.6', '#ffbf2d', 1.5) + o(P('M6.4 3.2h11.2v6.4a5.6 5.6 0 0 1-11.2 0z', '#ffd23f') + R(10.4, 14.4, 3.2, 3.6, 0.8, '#e0a72b') + R(7.2, 18, 9.6, 3.4, 1.4, '#ffbf2d')) + glint('M8.8 5.8v3.6');
  I.clock = o(C(12, 12, 9.6, '#fff0c9') + '<path d="M12 6.6V12l3.6 2.2" fill="none"/>') + dot(12, 12, 1.2, INK) + glint('M5.4 8.6a7.4 7.4 0 0 1 3-3.2', 1.4);
  I.sun = '<g stroke="#ffbe3a" stroke-width="2.2" stroke-linecap="round"><path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7"/></g>' + o(C(12, 12, 5.4, '#ffd23f')) + glint('M9.4 10.4a3 3 0 0 1 1.8-1.6', 1.3);
  I.moon = o(P('M19.6 15.4A9 9 0 1 1 9.2 3.2a7.2 7.2 0 0 0 10.4 12.2z', '#ffe9a8')) + dot(9.6, 12.6, 1, '#e8cf7f') + dot(13.4, 16.6, 1.3, '#e8cf7f') + glint('M5.2 11.4A6.6 6.6 0 0 1 8 6.2');
  I.dice = o(R(3.4, 3.4, 17.2, 17.2, 4.4, '#fff6e8')) + dot(8, 8, 1.7, '#ff3ea5') + dot(16, 8, 1.7, '#ff3ea5') + dot(12, 12, 1.7, '#ff3ea5') + dot(8, 16, 1.7, '#ff3ea5') + dot(16, 16, 1.7, '#ff3ea5');
  I.shuffle = thick('M3.6 7.2h3.4c3.6 0 5 2.4 6.4 4.8s2.8 4.8 6.4 4.8h.8M3.6 16.8h3.4c1.8 0 3-.6 4-1.6M13.6 8.8c1-1 2.2-1.6 3.8-1.6h.8', '#2ee6ff', 2) + o(P('M17.4 3.8 21.4 7.2l-4 3.4z', '#2ee6ff') + P('M17.4 13.4 21.4 16.8l-4 3.4z', '#2ee6ff'));
  I.camera = o(P('M8.4 5h7.2l1.4 2.2h2.2a2 2 0 0 1 2 2v8.6a2 2 0 0 1-2 2H4.8a2 2 0 0 1-2-2V9.2a2 2 0 0 1 2-2h2.2z', '#9ea5cc') + C(12, 13.4, 4.2, '#2f2a55')) + dot(12, 13.4, 2.1, '#2ee6ff') + dot(18.4, 9.8, 1, '#ff3ea5') + glint('M10.2 11.8a2.4 2.4 0 0 1 1.4-.8', 1.2);
  I.palette = o(P('M12 3C6.8 3 2.6 6.8 2.6 11.8c0 4.8 3.8 8.2 8 8.2 1.6 0 2.2-1 1.8-2.1-.5-1.4.4-2.6 1.8-2.6h2.6c2.8 0 4.6-1.7 4.6-4.5C21.4 6.8 17.4 3 12 3z', '#e8b87c')) + dot(7.4, 10.6, 1.7, '#ff3ea5') + dot(10.4, 6.8, 1.7, '#2ee6ff') + dot(15.2, 7, 1.7, '#ffe14d') + dot(6.6, 14.8, 1.7, '#9dff4a') + dot(10.4, 17, 1.4, '#a98bff') + glint('M5 9a7 7 0 0 1 3-3.6', 1.3);
  I.wand = thick('M4 20 14.6 9.4', '#a98bff', 3) + o(P(starPath(16.6, 7.4, 5.6, 2.6, 4), '#ffe14d')) + dot(5, 6, 1, '#2ee6ff') + dot(20, 17, 1, '#ff3ea5') + dot(8.4, 3.6, .9, '#ffd23f');
  // extras for the 3D HUD
  I.map = o(P('M3 6.4 9 4l6 2.4 6-2.4v13.6l-6 2.4-6-2.4-6 2.4z', '#9ff0a0') + '<path d="M9 4v13.6M15 6.4V20" fill="none"/>') + dot(12, 11, 2, '#ff4f78') + glint('M4.8 8.6v6');
  I.menu = thick('M5 7h14M5 12h14M5 17h14', W, 2.4);
  I.flag = o(R(4.4, 3, 2.2, 18.4, 1, '#cfcbe6') + P('M6.6 4.2h12.8l-3 4.4 3 4.4H6.6z', '#ff3ea5')) + glint('M8.6 6.2h5.6', 1.3);
  I.pin = o(P('M12 21.6c-5-5.4-7-8.6-7-11.8a7 7 0 0 1 14 0c0 3.2-2 6.4-7 11.8z', '#ff4f78')) + dot(12, 9.8, 2.6, '#fff6e8');
  I.close = thick('M6 6l12 12M18 6 6 18', W, 2.6);
  I.plus = thick('M12 5v14M5 12h14', W, 2.6);
  I.info = o(C(12, 12, 9.6, '#2ee6ff')) + dot(12, 7.6, 1.5, '#fff') + '<path d="M12 11v6" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>';
  I.hood = I.map;

  const names = Object.keys(I);
  function svg(name, px, cls) {
    const body = I[name] || I.star; const sz = px === undefined ? '' : ' width="' + (typeof px === 'number' ? px : px) + '" height="' + (typeof px === 'number' ? px : px) + '"';
    return '<svg class="i3 i3-' + name + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24"' + sz + ' aria-hidden="true" focusable="false">' + body + '</svg>';
  }
  const cache = {};
  function el(name, px, style) {
    let t = cache[name]; if (!t) { const d = document.createElement('div'); d.innerHTML = svg(name); t = cache[name] = d.firstChild; }
    const n = t.cloneNode(true);
    if (px !== undefined) { const v = typeof px === 'number' ? px + 'px' : px; n.style.width = v; n.style.height = v; }
    if (style) Object.assign(n.style, style);
    return n;
  }
  BBH.R3Icons = { svg, el, names, has: (n) => !!I[n], raw: I };
})(typeof globalThis !== 'undefined' ? globalThis : this);
