// VENUE 'arena' (Stage and Club Artist INT-B): the battle arena. Used by mg_rhythm opts.venue 'arena' (scale 1.6 to match the oversized performer) and by world `arena` (scale 1, world_arena.js).
// Built at 1:1 inside a rig group (units = metres), origin = middle of the floor, +z toward the camera:
//   round deck r 9.5 with theme rings | two podiums (YOU left x -2.7, OPPONENT right x +2.7, z 1.4, top y 0.9) with theme rims | judge tier at z -3.9 (top y 0.9) with five desks and the five judges
//   (Tek, Mel, Origi, Showtime, Wildcard from char_cast) each with a glowing score display | huge LED wall (12 x 4.8) for the VS splash | LED towers, truss arch, par cans, crowd barrier, crowd ring (instanced)
// Theme by opponent style: style % 4 -> pink | cyan | lime | gold (also lighting.setStageTheme). Everything that changes with the theme is white geometry tinted by two materials (V.TA / V.TB).
// API (on top of venue_base): setOpponent(opp | look), setPlayerName(s), setScores([5] | null, animate), reveal(i, score), vs({you, opp, round, sub}), setRound(n), splash(text, sub) (text may be the lines array of led.text), cheer(sec), mood(name),
//   characters: api.judges[], api.opponent, attachPlayer(character) (puts it on the left podium and keeps it facing the opponent), cams (VS whip, wide, over shoulder, judges, crowd; world coordinates), whip(...)
import { THREE, rng, disposeTree } from './kit.js';
import { createCrowd } from './char_crowd.js';
import { createCharacter } from './characters.js';
import { createCast, JUDGES3D } from './char_cast.js';
import { makeLed, speaker, truss, parCan, lightPool, cylT, K, mix, mul, bar, col, aoTint, PINKN, CYANN, GOLDN, GREENN, LIMEN, VIOLETN, WARMS } from './venue_kit.js';
import { THEME_IDS, THEMES, W3 } from './venue_base.js';

const BBH = () => (typeof window !== 'undefined' && window.BBH) || {};
export const ARENA = { podiumX: 2.7, podiumZ: 1.4, podiumR: 1.2, podiumTop: 0.9, tierZ: -3.9, deckH: 0.4 };
const JUDGE_IDS = ['tek', 'mel', 'origi', 'showtime', 'wildcard'], JUDGE_X = [-3.8, -1.9, 0, 1.9, 3.8];
const themeOfStyle = (s) => THEME_IDS[((s | 0) % 4 + 4) % 4];

function drawVs(g, w, h, d) {
  const T = THEMES[d.theme] || THEMES.pink; const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1d0b4a'); gr.addColorStop(1, '#090420'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.save(); g.translate(w / 2, h / 2); for (let i = 0; i < 20; i++) { g.rotate(Math.PI * 2 / 20); g.fillStyle = i % 2 ? T[0] + '30' : T[1] + '22'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, -h * 0.09); g.lineTo(w, h * 0.09); g.closePath(); g.fill(); } g.restore();
  g.fillStyle = T[0] + 'cc'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.46, 0); g.lineTo(w * 0.40, h); g.lineTo(0, h); g.closePath(); g.globalAlpha = 0.28; g.fill(); g.globalAlpha = 1;
  g.fillStyle = T[1]; g.beginPath(); g.moveTo(w, 0); g.lineTo(w * 0.54, 0); g.lineTo(w * 0.60, h); g.lineTo(w, h); g.closePath(); g.globalAlpha = 0.28; g.fill(); g.globalAlpha = 1;
  const font = (s) => '900 ' + s + 'px "Arial Black", Impact, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  // extruded VS: stacked offset copies fake the depth
  const vs = h * 0.62; g.font = font(vs); for (let k = 18; k >= 1; k--) { g.fillStyle = k > 9 ? '#2a0f5a' : '#5a2a9a'; g.fillText('VS', w / 2 + k * 1.3, h * 0.47 + k * 1.3); }
  g.lineWidth = vs * 0.1; g.strokeStyle = '#17102b'; g.strokeText('VS', w / 2, h * 0.47); const fg = g.createLinearGradient(0, h * 0.2, 0, h * 0.75); fg.addColorStop(0, '#fff6c8'); fg.addColorStop(0.5, T[2] || '#ffd23f'); fg.addColorStop(1, T[0]); g.shadowColor = T[0]; g.shadowBlur = vs * 0.2; g.fillStyle = fg; g.fillText('VS', w / 2, h * 0.47); g.shadowBlur = 0;
  const nm = (t, x, col) => { let s = h * 0.17; g.font = font(s); const mw = g.measureText(t).width; if (mw > w * 0.4) { s *= w * 0.4 / mw; g.font = font(s); } g.lineWidth = s * 0.16; g.strokeStyle = '#17102b'; g.strokeText(t, x, h * 0.87); g.shadowColor = col; g.shadowBlur = s * 0.3; g.fillStyle = col; g.fillText(t, x, h * 0.87); g.shadowBlur = 0; };
  nm(String(d.you || 'YOU').toUpperCase(), w * 0.22, '#7af0ff'); nm(String(d.opp || 'RIVAL').toUpperCase(), w * 0.78, '#ff9ad0');
  if (d.round) { g.font = font(h * 0.1); g.fillStyle = '#ffe9a0'; g.shadowColor = '#ffb23a'; g.shadowBlur = 10; g.fillText(String(d.round), w / 2, h * 0.09); g.shadowBlur = 0; }
  if (d.sub) { g.font = font(h * 0.075); g.fillStyle = '#cfe8ff'; g.fillText(String(d.sub), w / 2, h * 0.74); }
}

function makeArt(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; return { c, g, t, w, h, redraw() { draw(g, w, h); t.needsUpdate = true; } }; }

export function buildVenueArena(V) {
  const { S, TA, TB, o } = V, B = S.B, GL = S.GLOW, R = rng(o.seed * 7 + 11), A = ARENA, Core = o.Core || BBH().Core || null; const k = o.scale || 1;
  // ---------------------------------------------------------------- deck, rings, podiums
  B.lathe([[9.5, 0, aoTint(K.deckD, 0.5)], [9.5, A.deckH, K.deck], [0, A.deckH, mix(K.deck, K.plumL, 0.2)]], 18, 0, 0, 0, { rot: 0.1 });
  [[3.6, 3.45], [6.2, 6.05], [9.1, 8.95]].forEach(([r1, r0], i) => (i % 2 ? TB : TA).lathe([[r1, A.deckH + 0.006, W3], [r0, A.deckH + 0.006, W3]], 28, 0, 0, 0, { tint: 0 }));
  B.lathe([[40, -0.01, col('#1f1630')], [9.4, -0.01, col('#2a2040')]], 12, 0, 0, 0, {});
  S.atlas = null; const emb = makeArt(256, 256, (g, w, h) => { g.clearRect(0, 0, w, h); g.font = '900 150px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillText('VS', w / 2, h / 2); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 6; g.strokeText('VS', w / 2, h / 2); }); emb.redraw();
  const embMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.MeshBasicMaterial({ map: emb.t, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })); embMesh.rotation.x = -Math.PI / 2; embMesh.position.set(0, A.deckH + 0.012, 0.2); embMesh.name = 'vs_emblem'; S.group.add(embMesh);
  const podium = (x, TT) => { B.lathe([[A.podiumR, 0, aoTint(K.ink, 0.4)], [A.podiumR, A.podiumTop - A.deckH, mix(K.inkL, K.plum, 0.3)], [A.podiumR * 0.96, A.podiumTop - A.deckH + 0.02, K.deckL], [0, A.podiumTop - A.deckH + 0.02, mix(K.deckL, K.plumL, 0.3)]], 12, x, A.deckH, A.podiumZ, { rot: 0.13 });
    TT.lathe([[A.podiumR * 1.014, 0.12, W3], [A.podiumR * 1.014, 0.26, W3]], 12, x, A.deckH, A.podiumZ, { rot: 0.13, tint: 0 }); TT.lathe([[A.podiumR * 0.97, A.podiumTop - A.deckH + 0.024, W3], [A.podiumR * 0.86, A.podiumTop - A.deckH + 0.024, W3]], 12, x, A.deckH, A.podiumZ, { rot: 0.13, tint: 0 });
    S.soft(x, A.podiumZ, 0.9, 0.9, 0.3, 0, A.podiumTop + 0.03); };
  podium(-A.podiumX, TA); podium(A.podiumX, TB); lightPool(S.SOFT, -A.podiumX, A.deckH + 0.02, A.podiumZ, 2.4, 2.4, '#7af0ff', 0.14); lightPool(S.SOFT, A.podiumX, A.deckH + 0.02, A.podiumZ, 2.4, 2.4, '#ff9ad0', 0.14);
  // ---------------------------------------------------------------- judge tier, desks, backdrop, LED wall
  const tz = A.tierZ; B.box(0, A.deckH, tz - 0.2, 10.4, 0.5, 2.8, mix(K.deckD, K.plumD, 0.4), { base: 0.3, tint: 0.02, top: mix(K.deckL, K.plumL, 0.2) }); TA.box(0, A.deckH + 0.2, tz + 1.215, 10.4, 0.07, 0.03, W3, { base: 0, tint: 0 });
  JUDGE_X.forEach((x, i) => { const dz = tz + 0.7; B.box(x, 0.9, dz, 1.7, 0.78, 0.62, K.inkL, { base: 0.2, tint: 0.03, top: mix(K.woodL, K.cream, 0.1) }); B.box(x, 1.68, dz, 1.78, 0.05, 0.7, K.gold, { base: 0 }); (i % 2 ? TB : TA).box(x, 0.98, dz + 0.312, 1.5, 0.05, 0.02, W3, { base: 0, tint: 0 }); });
  B.box(0, A.deckH + 0.5, tz - 1.55, 13, 3.6, 0.35, mix(K.deckD, K.plumD, 0.5), { base: 0.3, tint: 0.02 });
  const led = makeLed(12, 4.6, 70); led.mesh.position.set(0, 6.25, tz - 1.36); S.group.add(led.mesh);
  B.box(0, 3.85, tz - 1.4, 12.5, 0.22, 0.22, K.ink, { base: 0 }); B.box(0, 8.65, tz - 1.4, 12.5, 0.22, 0.22, K.ink, { base: 0 }); [-6.15, 6.15].forEach((x) => B.box(x, 3.85, tz - 1.4, 0.22, 4.9, 0.22, K.ink, { base: 0 }));
  TA.box(-6.4, 3.7, tz - 1.25, 0.09, 5.2, 0.09, W3, { base: 0, tint: 0 }); TB.box(6.4, 3.7, tz - 1.25, 0.09, 5.2, 0.09, W3, { base: 0, tint: 0 }); TA.box(0, 8.95, tz - 1.25, 12.8, 0.09, 0.09, W3, { base: 0, tint: 0 }); TB.box(0, 3.62, tz - 1.25, 12.8, 0.09, 0.09, W3, { base: 0, tint: 0 });
  // ---------------------------------------------------------------- LED towers (line arrays), truss arch with par cans, crowd barrier
  [-8.4, 8.4].forEach((x, i) => { speaker(B, x, -2.6, i ? -0.5 : 0.5, { y0: A.deckH, h: 5, s: 1.3 }); (i ? TB : TA).box(x + (i ? -0.7 : 0.7), A.deckH + 0.2, -2.1, 0.07, 6.3, 0.07, W3, { base: 0, tint: 0 }); });
  const N = 14, arc = []; for (let i = 0; i <= N; i++) { const a = -1.5 + 3.0 * i / N; arc.push([8.6 * Math.sin(a), 9.6, 8.6 * Math.cos(a) - 1.0]); }
  for (let i = 0; i < N; i++) truss(B, arc[i], arc[i + 1], 0.42, K.steel, K.steelD, 0.9);
  [arc[0], arc[N]].forEach((p) => { truss(B, [p[0], A.deckH, p[2]], [p[0], p[1], p[2]], 0.42, K.steel, K.steelD, 0.9); B.box(p[0], A.deckH, p[2], 0.8, 0.07, 0.8, K.steelD, { base: 0 }); });
  truss(B, [-6.4, 9.2, tz - 0.6], [6.4, 9.2, tz - 0.6], 0.42, K.steel, K.steelD, 0.9);
  arc.forEach((p, i) => { if (i % 2) parCan(B, GL, p[0], p[1] - 0.3, p[2], Math.atan2(-p[0], -p[2] - 1.0) + Math.PI, 0.9, i % 4 === 1 ? PINKN : CYANN, 0.2); });
  for (let i = 0; i < 6; i++) parCan(B, GL, -5.4 + i * 2.16, 8.9, tz - 0.4, 0, 0.8, i % 2 ? GOLDN : VIOLETN, 0.2);
  V.anchors.rig = [arc[2], arc[4], arc[6], arc[8], arc[10], arc[12]].map((p) => ({ x: p[0], y: p[1] - 0.35, z: p[2] })); V.anchors.stageCenter = { x: 0, z: 1.0 };
  { const RB = 6.9, n = 26; for (let i = 0; i <= n; i++) { const a = -1.35 + 2.7 * i / n, x = Math.sin(a) * RB, z = Math.cos(a) * RB; cylT(B, x, 0, z, 0.05, 0.05, 1.05, 6, K.steel); if (i) { const pa = -1.35 + 2.7 * (i - 1) / n, px = Math.sin(pa) * RB, pz = Math.cos(pa) * RB; bar(B, [px, 1.05, pz], [x, 1.05, z], 0.06, 0.06, K.steelL); bar(B, [px, 0.55, pz], [x, 0.55, z], 0.04, 0.04, K.steelD); TA.box((px + x) / 2, 1.1, (pz + z) / 2, 0.03, 0.03, Math.hypot(x - px, z - pz), W3, { base: 0, tint: 0, ry: Math.atan2(x - px, z - pz) }); } } }
  // ---------------------------------------------------------------- hall wall (inside of a dark drum) and a glowing ribbon
  { const prof = [[27, 0, col('#241a3a')], [27, 14, col('#120c22')]]; for (let i = 0; i < 28; i++) { const a0 = (i / 28) * 6.283, a1 = ((i + 1) / 28) * 6.283; const c = i % 2 ? col('#2c2046') : col('#241a3a'); const P = (a, y) => [Math.sin(a) * 27, y, Math.cos(a) * 27]; B.quad(P(a1, 0), P(a0, 0), P(a0, 14), P(a1, 14), c, c, mul(c, 0.5), mul(c, 0.5)); } TB.lathe([[26.6, 3.2, W3], [26.6, 3.5, W3]], 28, 0, 0, 0, { tint: 0 }); TA.lathe([[26.6, 6.2, W3], [26.6, 6.4, W3]], 28, 0, 0, 0, { tint: 0 }); }
  // ---------------------------------------------------------------- score displays (one canvas, five quads, one draw call) and name plates
  const names = JUDGE_IDS.map((id) => (JUDGES3D[id] && JUDGES3D[id].look.name) || id), scores = [null, null, null, null, null], shown = [0, 0, 0, 0, 0];
  const board = makeArt(640, 128, (g, w, h) => { g.fillStyle = '#0c0820'; g.fillRect(0, 0, w, h); for (let i = 0; i < 5; i++) { const x = i * 128; g.fillStyle = '#17102b'; g.fillRect(x + 4, 4, 120, 120); g.strokeStyle = THEMES[V.theme] ? THEMES[V.theme][i % 2] : '#35f2e0'; g.lineWidth = 3; g.strokeRect(x + 5, 5, 118, 118); g.font = '900 20px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#cfe8ff'; g.fillText(names[i].toUpperCase(), x + 64, 22);
    const sc = scores[i]; g.font = '900 78px "Arial Black", Impact, sans-serif'; g.shadowColor = sc === null ? '#554a80' : '#ffd23f'; g.shadowBlur = sc === null ? 0 : 14; g.fillStyle = sc === null ? '#3f3466' : (sc >= 8 ? '#9dff4a' : sc >= 5 ? '#ffd23f' : '#ff7a6a'); g.fillText(sc === null ? '-' : String(Math.round(sc)), x + 64, 76); g.shadowBlur = 0;
    g.fillStyle = '#35f2e0'; for (let b = 0; b < 10; b++) { g.globalAlpha = sc !== null && b < sc ? 0.95 : 0.15; g.fillRect(x + 12 + b * 10.4, 108, 8, 8); } g.globalAlpha = 1; } });
  board.redraw();
  const bq = new THREE.BufferGeometry(), bp = [], bu = [], bi = []; JUDGE_X.forEach((x, i) => { const w = 1.3, hh = 0.7 * 1.0, y0 = 1.18, z = tz + 0.7 + 0.322, u0 = i / 5, u1 = (i + 1) / 5, n0 = bp.length / 3; bp.push(x - w / 2, y0, z, x + w / 2, y0, z, x + w / 2, y0 + hh, z, x - w / 2, y0 + hh, z); bu.push(u0, 0, u1, 0, u1, 1, u0, 1); bi.push(n0, n0 + 1, n0 + 2, n0, n0 + 2, n0 + 3); });
  bq.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); bq.setAttribute('uv', new THREE.Float32BufferAttribute(bu, 2)); bq.setIndex(bi); const boardMesh = new THREE.Mesh(bq, new THREE.MeshBasicMaterial({ map: board.t, toneMapped: false })); boardMesh.name = 'score_displays'; boardMesh.frustumCulled = false; S.group.add(boardMesh);
  // ---------------------------------------------------------------- characters: the five judges, the opponent (+ the player on request)
  const cast = createCast(V.ctx, Core, {}), judges = JUDGE_IDS.map((id, i) => { const c = cast.judge(id); c.object.position.set(JUDGE_X[i], 0.9, tz - 0.05); c.object.rotation.y = 0; S.group.add(c.object); return c; });
  const state = { opp: null, themeStyle: o.style, you: o.you || 'YOU', oppName: 'RIVAL', round: 1, sub: '' }; let opponent = null, player = null, vsT = -1, revealQ = [];
  function placeOpp() { if (!opponent) return; opponent.object.position.set(A.podiumX, A.podiumTop, A.podiumZ); opponent.object.rotation.y = -1.05; }
  function setOpponent(opp) {
    const list = (Core && Core.OPPONENTS) || [], d = typeof opp === 'number' ? list[opp] : (opp && opp.look ? opp : (opp ? { look: opp } : list[0]));
    if (!d || !d.look) return opponent; if (opponent) { try { disposeTree(opponent.object); S.group.remove(opponent.object); opponent.dispose(); } catch (e) { /* ignore */ } opponent = null; }
    opponent = createCharacter(V.ctx, d.look); opponent.id = d.id || 'opp'; S.group.add(opponent.object); placeOpp(); state.opp = d; state.oppName = d.name || (d.look && d.look.name) || 'RIVAL'; opponent.play('battle', { bpm: d.bpm || 100 }); try { opponent.setMood('angry'); } catch (e) { /* ignore */ }
    const th = themeOfStyle(d.style !== undefined ? d.style : 0); if (V.api) V.api.setTheme(th); else V.theme = th; api.opponent = opponent; return opponent;
  }
  function attachPlayer(c) { player = c; if (c && c.object) { if (c.object.parent !== S.group && o.attach !== false) S.group.add(c.object); c.object.position.set(-A.podiumX, A.podiumTop, A.podiumZ); c.object.rotation.y = 1.05; try { c.play('battle', { bpm: 100 }); } catch (e) { /* ignore */ } } return c; }
  // ---------------------------------------------------------------- crowd ring
  let crowd = null; const nC = o.crowd !== undefined ? o.crowd : (o.q === 'low' ? 18 : o.q === 'med' ? 30 : 44);
  if (nC > 0) { const pos = [], a0 = -2.35, a1 = 2.35; let guard = 0; while (pos.length < nC && guard++ < 4000) { const a = a0 + (a1 - a0) * R(), r = 7.6 + R() * 5.9, x = Math.sin(a) * r, z = Math.cos(a) * r; if (Math.abs(x) < 1.5 && z > 5) continue; pos.push([x, z, Math.atan2(-x, -z) + (R() - 0.5) * 0.3]); }
    crowd = createCrowd(V.ctx, pos.length, { positions: pos, seed: o.seed + 5, energy: 0.5, bpm: 110 }); S.group.add(crowd.object); }
  // ---------------------------------------------------------------- led content, per-frame work
  const splash = (text, sub) => led.text(Array.isArray(text) ? text : [{ t: String(text), c: '#ffd23f', k: 1.0 }, { t: String(sub || ''), c: '#7af0ff', k: 0.45 }], { bg: ['#2a1058', '#090420'], rays: ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0)'] });
  const vsDraw = () => { led.draw((g, w, h) => { drawVs(g, w, h, { theme: V.theme, you: state.you, opp: state.oppName, round: state.round ? 'ROUND ' + state.round : '', sub: state.sub }); led.grid(0.2); }); };
  vsDraw();
  V.ups.push((dt, t, e, pulse) => {
    // judges bounce a little to the beat, reveal queue, opponent keeps facing the player
    judges.forEach((c, i) => { c.object.position.y = 0.9 + 0.02 * pulse * (i % 2 ? 1 : 0.6); });
    if (revealQ.length) { revealQ[0].t -= dt; if (revealQ[0].t <= 0) { const r = revealQ.shift(); scores[r.i] = r.s; board.redraw(); if (crowd && r.s >= 8) crowd.cheer(0.8); if (revealQ.length) revealQ[0].t = 0.55; } }
    if (opponent) { opponent.update(dt, t); opponent.object.position.y = A.podiumTop; }
    if (player && o.attach !== false) { /* the world's host updates its own player */ }
    if (vsT >= 0) { vsT += dt; if (vsT > 3.2) { vsT = -1; led.text([{ t: String(state.oppName).toUpperCase(), c: '#ff9ad0', k: 0.8 }, { t: 'ROUND ' + state.round, c: '#ffe9a0', k: 0.5 }], { bg: ['#2a1058', '#090420'] }); } }
  });
  const P = (x, y, z) => [x * k + o.x, y * k, z * k + o.z];
  V.cams.wide = { pos: P(0, 6.4, 17.5), look: P(0, 1.7, -0.4), fov: 50 }; V.cams.vs = { pos: P(0, 1.7, 10.5), look: P(0, 2.1, 0.8), fov: 58 };
  V.cams.oppClose = { pos: P(-0.9, 2.1, 4.6), look: P(A.podiumX, 2.0, A.podiumZ), fov: 38 }; V.cams.youClose = { pos: P(0.9, 2.1, 4.6), look: P(-A.podiumX, 2.0, A.podiumZ), fov: 38 };
  V.cams.over = { pos: P(-5.4, 2.3, 2.6), look: P(2.0, 1.8, 1.1), fov: 46 }; V.cams.judges = { pos: P(0, 2.9, 8.8), look: P(0, 2.1, -4.0), fov: 70 }; V.cams.crowd = { pos: P(0, 2.7, 2.8), look: P(0, 2.4, 11), fov: 60 };
  V.cams.play = V.cams.over;
  V.anchors.player = { x: -A.podiumX * k + o.x, y: A.podiumTop * k, z: A.podiumZ * k + o.z, rot: 1.05 }; V.anchors.opponent = { x: A.podiumX * k + o.x, y: A.podiumTop * k, z: A.podiumZ * k + o.z, rot: -1.05 }; V.anchors.judges = JUDGE_X.map((x) => ({ x: x * k + o.x, y: 0.9 * k, z: tz * k + o.z }));
  V.anchors.stageFront = { x: o.x, y: 0.4 * k, z: 6.9 * k + o.z };
  const api = { judges, judgeIds: JUDGE_IDS, opponent: null, attachPlayer, setOpponent, cast,
    setScores(arr, animate) { if (!arr) { for (let i = 0; i < 5; i++) scores[i] = null; revealQ = []; board.redraw(); return; } revealQ = []; arr.forEach((s, i) => { if (animate) revealQ.push({ i, s, t: 0.0 }); else scores[i] = s; }); if (animate) { scores.fill(null); revealQ.forEach((r, n) => { r.t = n === 0 ? 0.25 : 0.55; }); } board.redraw(); },
    reveal(i, s) { scores[i] = s; board.redraw(); }, scoresNow: () => scores.slice(),
    vs(d) { d = d || {}; if (d.you) state.you = d.you; if (d.opp) state.oppName = d.opp; if (d.round !== undefined) state.round = d.round; state.sub = d.sub || ''; vsDraw(); vsT = 0; if (opponent) { try { opponent.setMood('angry'); opponent.play('battle', { bpm: 108 }); } catch (e) { /* ignore */ } } if (player) { try { player.setMood('angry'); } catch (e) { /* ignore */ } } },
    setRound(n) { state.round = n; vsDraw(); }, splash, cheer(sec) { if (crowd) crowd.cheer(sec); }, mood(m) { [opponent, player].forEach((c) => { try { if (c) c.setMood(m); } catch (e) { /* ignore */ } }); judges.forEach((c) => { try { c.setMood(m === 'angry' ? 'neutral' : m); } catch (e) { /* ignore */ } }); },
    heights: { podiumTop: A.podiumTop, deck: A.deckH, tier: 0.9 }, vsState: () => Object.assign({}, state, { scores: scores.slice(), theme: V.theme }),
  };
  V.disposers.push(() => { emb.t.dispose(); board.t.dispose(); try { cast.dispose(); } catch (e) { /* ignore */ } if (opponent) { try { opponent.dispose(); } catch (e) { /* ignore */ } } });
  V.pre = [() => { if (player && player.object && player.object.parent === S.group) V.ctx.scene.add(player.object); }];
  if (o.opp !== undefined && o.opp !== null) setOpponent(o.opp); else if (Core && Core.OPPONENTS) setOpponent(0);
  const hint = { profile: 'stage', theme: V.theme, interior: true, ceilY: 12, note: 'lighting.setProfile(stage) + setStageTheme(api.theme)' };
  return { led, crowd, characters: judges, hint, api, onTheme(name, T) { board.redraw(); vsDraw(); } };
}
export { themeOfStyle };
