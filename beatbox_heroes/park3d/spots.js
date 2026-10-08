// SPOTS module (Gameplay Engineer). Activity spots in the park with glowing world markers, floating icons, proximity prompts. CONTRACT:
//   buildSpots(ctx, terrain) -> { group, spots:[{id,label,icon,x,z,radius,release,color,cine}], update(dt,t,playerPos), nearest(playerPos)->spot|null, activate(id) }
//   Flat (interior) scene: terrain.spotDefs [{id,anchor,label,color,color2,cine,icon}] replaces the park list, ring radius 1.1, icons hover lower. Park ids: busk (crate stage: play a set), bench (rest + talk to BeeAmGee + lesson), run (jog loop start), flyers (gate corner: odd job), gate (leave to the street), jam (the cypher: world_park.js adds it, shown while terrain.anchors.jam exists)
//   PORT (WP P4): terrain.spotDefs for EVERY world (park DEFS stay the fallback; an explicit [] = no spots). Def fields: id, anchor | x,z, label, icon, color, color2, cine, kind ('door': walking into the ring activates at once, no prompt button; with intent {dwell, nx, nz} (outward normal) it activates only on intent, see refresh),
//   ring (visual radius), radius (enter), release, iconY, iconK, pillar. setSpotState(id,{locked,reason,goal,badge}) (padlock + grey icon + dim ring; gold light beam + bobbing arrow; red dot or 1-2 char text), getSpotState(id), api.canFire() gate set by controls, api.doorIntent(spot) -> 'go'|'dwell'|'' also set by controls (intent doors).
//   Glyph ids: busk bench jam run flyers gate booth couch bed desk kitchen wardrobe door map hats racks mirror counter mic mixer stage stool (unknown = star). Events: 'spot' {id,scene,kind,locked,reason}; doors also emit 'door' {id,...} just before 'spot'.
//   activate(id) emits ctx.events 'spot' with {id, scene}. The game bridge (main.js) maps these onto the real game actions; controls.js listens to the same event for the
//   short cinematic (lock input, ease camera, face the spot, play a clip) and unlocks on ctx.events 'spotDone'.
// Look: a pooled glow ring on the ground (additive, pulsing), a slowly rotating dashed outer ring, tiny rising sparkles, and a bobbing billboard icon + label.
// Cost: 2 canvas textures in total (fx atlas, icon atlas), 3 draw calls per spot plus 1 shared sparkle Points draw.
import { THREE } from './kit.js';

// positions come from terrain.anchors, re-read lazily (terrain may still be changing). cine = what controls.js does when the spot is activated.
const DEFS = [
  { id: 'busk', anchor: 'buskSpot', label: 'BUSK', color: '#ff3ea5', color2: '#ffe14d', cine: { snap: true, face: 'rot', clip: 'beatbox', zoom: 0.22 } },
  { id: 'bench', anchor: 'bench', label: 'TALK', color: '#a86bff', color2: '#2ee6ff', cine: { snap: true, exact: true, face: 'rot', clip: 'sit', zoom: 0.2 } },
  { id: 'run', anchor: 'runStart', label: 'RUN', color: '#2ee6ff', color2: '#ffe14d', cine: { snap: true, face: 'rot', clip: 'cheer', zoom: 0.16 } },
  { id: 'flyers', anchor: 'flyers', label: 'FLYERS', color: '#ffe14d', color2: '#ff3ea5', cine: { snap: false, face: 'toward', clip: 'wave', zoom: 0.18 } },
  { id: 'gate', anchor: 'gate', label: 'LEAVE', color: '#9dff4a', color2: '#2ee6ff', cine: { snap: false, face: 'toward', clip: 'wave', zoom: 0.14 } },
];
const ENTER_R = 1.6, RELEASE_R = 2.25, RING_R = 1.55;

// ---------- canvas glyphs (shared with ui3d.js for the prompt button) ----------
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function glyph(g, id, S) {
  g.save(); g.scale(S / 192, S / 192); g.lineJoin = 'round'; g.lineCap = 'round';
  const INK = '#17102b';
  if (id === 'busk') { // microphone, pink grille ball on a yellow handle
    g.rotate(-0.55);
    g.fillStyle = '#ffe14d'; rr(g, -11, 4, 22, 54, 9); g.fill(); g.strokeStyle = INK; g.lineWidth = 5; g.stroke();
    g.fillStyle = '#c9b6e8'; g.fillRect(-14, 0, 28, 8); g.strokeRect(-14, 0, 28, 8);
    g.beginPath(); g.arc(0, -22, 27, 0, 7); g.fillStyle = '#ff3ea5'; g.fill(); g.lineWidth = 6; g.stroke();
    g.save(); g.clip(); g.strokeStyle = 'rgba(23,16,43,.55)'; g.lineWidth = 3; for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(-30 + i * 9, -50); g.lineTo(-30 + i * 9 + 22, 6); g.stroke(); g.beginPath(); g.moveTo(30 + i * 9, -50); g.lineTo(30 + i * 9 - 22, 6); g.stroke(); } g.restore();
    g.beginPath(); g.arc(-9, -31, 7, 0, 7); g.fillStyle = 'rgba(255,255,255,.75)'; g.fill();
  } else if (id === 'bench') { // park bench
    g.lineWidth = 5; g.strokeStyle = INK;
    g.fillStyle = '#6a4230'; g.fillRect(-42, 2, 10, 46); g.strokeRect(-42, 2, 10, 46); g.fillRect(32, 2, 10, 46); g.strokeRect(32, 2, 10, 46);
    const slat = (y, c) => { g.fillStyle = c; rr(g, -52, y, 104, 14, 4); g.fill(); g.stroke(); };
    slat(-40, '#c07f48'); slat(-22, '#a8693b'); slat(8, '#c07f48');
    g.fillStyle = '#ffe14d'; g.beginPath(); g.arc(30, -52, 7, 0, 7); g.fill(); g.stroke();
  } else if (id === 'run') { // sneaker
    g.lineWidth = 5; g.strokeStyle = INK;
    g.beginPath(); g.moveTo(-50, 8); g.lineTo(-50, -34); g.quadraticCurveTo(-48, -42, -36, -40); g.lineTo(-14, -34); g.quadraticCurveTo(-4, -12, 14, -10); g.lineTo(40, -6); g.quadraticCurveTo(58, -2, 56, 14); g.lineTo(-50, 14); g.closePath(); g.fillStyle = '#2ee6ff'; g.fill(); g.stroke();
    g.fillStyle = '#fff6e8'; rr(g, -54, 14, 114, 16, 7); g.fill(); g.stroke();
    g.strokeStyle = '#ffe14d'; g.lineWidth = 5; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-26 + i * 14, -28 + i * 6); g.lineTo(-14 + i * 14, -20 + i * 6); g.stroke(); }
    g.strokeStyle = '#ff3ea5'; g.lineWidth = 6; g.beginPath(); g.moveTo(-34, 2); g.quadraticCurveTo(0, -14, 34, 4); g.stroke();
    g.strokeStyle = '#fff6e8'; g.lineWidth = 4; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-84, -14 + i * 12); g.lineTo(-62 - i * 6, -14 + i * 12); g.stroke(); }
  } else if (id === 'flyers') { // flyer sheets
    g.lineWidth = 5; g.strokeStyle = INK;
    g.save(); g.rotate(0.22); g.fillStyle = '#fff6e8'; rr(g, -36, -50, 72, 96, 6); g.fill(); g.stroke(); g.restore();
    g.save(); g.rotate(-0.16); g.fillStyle = '#ffe14d'; rr(g, -40, -54, 72, 96, 6); g.fill(); g.stroke();
    g.fillStyle = '#ff3ea5'; g.fillRect(-30, -42, 52, 16); g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(-30, -42, 52, 16);
    g.fillStyle = INK; for (let i = 0; i < 3; i++) g.fillRect(-30, -16 + i * 14, 52 - i * 10, 6);
    g.restore();
  } else if (id === 'gate') { // door with an arrow pointing out
    g.lineWidth = 5; g.strokeStyle = INK;
    g.fillStyle = '#6a4230'; rr(g, -50, -54, 56, 108, 5); g.fill(); g.stroke();
    g.fillStyle = '#a8693b'; g.fillRect(-42, -46, 40, 92);
    g.fillStyle = '#ffe14d'; g.beginPath(); g.arc(-12, 4, 5, 0, 7); g.fill();
    g.beginPath(); g.moveTo(8, -12); g.lineTo(34, -12); g.lineTo(34, -30); g.lineTo(64, 0); g.lineTo(34, 30); g.lineTo(34, 12); g.lineTo(8, 12); g.closePath(); g.fillStyle = '#9dff4a'; g.fill(); g.stroke();

  } else if (id === 'booth') { // padded vocal booth with a mic inside and a glowing sign
    g.lineWidth = 5; g.strokeStyle = INK;
    g.fillStyle = '#3a2760'; rr(g, -50, -56, 100, 112, 10); g.fill(); g.stroke();
    g.fillStyle = '#ff3ea5'; for (let i = 0; i < 3; i++) { rr(g, -42 + i * 30, -46, 24, 30, 4); g.fill(); g.lineWidth = 3; g.stroke(); }
    g.fillStyle = '#ffe14d'; g.fillRect(-42, -8, 84, 6);
    g.lineWidth = 5; g.fillStyle = '#c9b6e8'; g.beginPath(); g.moveTo(0, -4); g.lineTo(0, 26); g.stroke();
    g.beginPath(); g.arc(0, 14, 15, 0, 7); g.fillStyle = '#2ee6ff'; g.fill(); g.stroke();
    g.fillStyle = '#17102b'; g.beginPath(); g.arc(-4, 12, 2.5, 0, 7); g.arc(5, 12, 2.5, 0, 7); g.arc(0, 19, 2.5, 0, 7); g.fill();
    g.fillStyle = '#ff3a3a'; rr(g, -22, 36, 44, 14, 5); g.fill(); g.lineWidth = 3; g.stroke();
  } else if (id === 'couch') { // couch with a cassette on the cushion
    g.lineWidth = 5; g.strokeStyle = INK;
    g.fillStyle = '#7b4fe0'; rr(g, -50, -34, 100, 46, 14); g.fill(); g.stroke();
    g.fillStyle = '#a86bff'; rr(g, -62, -6, 28, 52, 10); g.fill(); g.stroke(); rr(g, 34, -6, 28, 52, 10); g.fill(); g.stroke();
    g.fillStyle = '#8f63ee'; rr(g, -36, 0, 72, 32, 8); g.fill(); g.stroke();
    g.fillStyle = '#17102b'; g.fillRect(-48, 46, 8, 10); g.fillRect(40, 46, 8, 10);
    g.save(); g.rotate(-0.12); g.fillStyle = '#fff6e8'; rr(g, -26, -22, 52, 34, 5); g.fill(); g.stroke(); g.fillStyle = '#ff3ea5'; g.fillRect(-20, -17, 40, 8);
    g.fillStyle = '#17102b'; g.beginPath(); g.arc(-11, 0, 6, 0, 7); g.arc(11, 0, 6, 0, 7); g.fill(); g.restore();
  } else if (id === 'bed') { // bed with a crescent moon
    g.lineWidth = 5; g.strokeStyle = INK;
    g.fillStyle = '#6a4230'; rr(g, -56, 0, 112, 52, 6); g.fill(); g.stroke(); g.fillRect(-56, -20, 12, 76); g.strokeRect(-56, -20, 12, 76);
    g.fillStyle = '#2ee6ff'; rr(g, -40, 6, 92, 34, 8); g.fill(); g.stroke();
    g.fillStyle = '#fff6e8'; rr(g, -38, -6, 36, 18, 8); g.fill(); g.stroke();
    g.beginPath(); g.arc(30, -38, 18, 0.5, 5.8); g.arc(38, -42, 14, 5.2, 1.0, true); g.closePath(); g.fillStyle = '#ffe14d'; g.fill(); g.lineWidth = 4; g.stroke();
  } else if (id === 'desk') { // desk with a laptop and a live dot
    g.lineWidth = 5; g.strokeStyle = INK;
    g.fillStyle = '#6a4230'; rr(g, -58, 22, 116, 14, 4); g.fill(); g.stroke(); g.fillRect(-50, 36, 10, 22); g.strokeRect(-50, 36, 10, 22); g.fillRect(40, 36, 10, 22); g.strokeRect(40, 36, 10, 22);
    g.fillStyle = '#3a2760'; rr(g, -34, -42, 68, 46, 6); g.fill(); g.stroke(); g.fillStyle = '#2ee6ff'; rr(g, -27, -35, 54, 32, 3); g.fill();
    g.fillStyle = '#c9b6e8'; rr(g, -46, 4, 92, 16, 5); g.fill(); g.stroke();
    g.fillStyle = '#17102b'; g.fillRect(-14, -20, 28, 5); g.fillRect(-14, -10, 18, 5);
    g.beginPath(); g.arc(34, -48, 13, 0, 7); g.fillStyle = '#ff3a3a'; g.fill(); g.lineWidth = 4; g.stroke(); g.beginPath(); g.arc(30, -52, 4, 0, 7); g.fillStyle = 'rgba(255,255,255,.8)'; g.fill();
  } else if (id === 'kitchen') { // plant-based: carrot and a bowl
    g.lineWidth = 5; g.strokeStyle = INK;
    g.save(); g.rotate(0.6); g.fillStyle = '#9dff4a'; for (let i = -1; i <= 1; i++) { g.beginPath(); g.ellipse(i * 11, -52, 7, 16, i * 0.3, 0, 7); g.fill(); g.stroke(); }
    g.fillStyle = '#ff8a2a'; g.beginPath(); g.moveTo(-18, -40); g.lineTo(18, -40); g.lineTo(0, 30); g.closePath(); g.fill(); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.moveTo(-9, -26); g.lineTo(-2, -26); g.moveTo(3, -12); g.lineTo(10, -12); g.moveTo(-5, 2); g.lineTo(0, 2); g.stroke(); g.restore();
    g.lineWidth = 5; g.fillStyle = '#fff6e8'; g.beginPath(); g.moveTo(-54, 6); g.lineTo(54, 6); g.quadraticCurveTo(50, 54, 0, 54); g.quadraticCurveTo(-50, 54, -54, 6); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#9dff4a'; g.beginPath(); g.ellipse(0, 6, 54, 9, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#ffe14d'; g.beginPath(); g.arc(-22, 4, 6, 0, 7); g.fill(); g.fillStyle = '#ff3ea5'; g.beginPath(); g.arc(24, 5, 6, 0, 7); g.fill();
  } else if (id === 'wardrobe') { // hoodie on a hanger
    g.lineWidth = 5; g.strokeStyle = INK;
    g.beginPath(); g.moveTo(0, -30); g.lineTo(0, -40); g.arc(0, -50, 10, Math.PI / 2, Math.PI * 2.1); g.stroke();
    g.fillStyle = '#ffe14d'; g.beginPath(); g.moveTo(-14, -30); g.lineTo(-52, -6); g.lineTo(-62, 28); g.lineTo(-44, 32); g.lineTo(-36, 6); g.lineTo(-36, 54); g.lineTo(36, 54); g.lineTo(36, 6); g.lineTo(44, 32); g.lineTo(62, 28); g.lineTo(52, -6); g.lineTo(14, -30); g.quadraticCurveTo(0, -12, -14, -30); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#e63946'; g.beginPath(); g.moveTo(-14, -30); g.quadraticCurveTo(0, -12, 14, -30); g.lineTo(18, -18); g.quadraticCurveTo(0, 0, -18, -18); g.closePath(); g.fill(); g.lineWidth = 4; g.stroke();
    g.fillStyle = '#fff6e8'; rr(g, -18, 22, 36, 18, 6); g.fill(); g.stroke();
  } else if (id === 'door') { // flat door with an arrow leading out
    g.lineWidth = 5; g.strokeStyle = INK;
    g.fillStyle = '#3a2760'; rr(g, -52, -56, 58, 112, 5); g.fill(); g.stroke();
    g.fillStyle = '#ff3ea5'; g.fillRect(-44, -48, 42, 96); g.strokeRect(-44, -48, 42, 96);
    g.beginPath(); g.arc(-12, 4, 5, 0, 7); g.fillStyle = '#ffe14d'; g.fill(); g.stroke();
    g.fillStyle = '#17102b'; g.fillRect(-36, -40, 26, 6);
    g.beginPath(); g.moveTo(8, -12); g.lineTo(34, -12); g.lineTo(34, -30); g.lineTo(64, 0); g.lineTo(34, 30); g.lineTo(34, 12); g.lineTo(8, 12); g.closePath(); g.fillStyle = '#9dff4a'; g.fill(); g.stroke();
  } else if (id === 'map') { // folded street map with a dashed route and a pin
    g.lineWidth = 5; g.strokeStyle = INK;
    g.fillStyle = '#fff6e8'; g.beginPath(); g.moveTo(-58, -34); g.lineTo(-20, -46); g.lineTo(20, -34); g.lineTo(58, -46); g.lineTo(58, 38); g.lineTo(20, 50); g.lineTo(-20, 38); g.lineTo(-58, 50); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#bfeeff'; g.beginPath(); g.moveTo(-20, -46); g.lineTo(20, -34); g.lineTo(20, 50); g.lineTo(-20, 38); g.closePath(); g.fill(); g.lineWidth = 4; g.stroke();
    g.strokeStyle = '#ff3ea5'; g.lineWidth = 6; g.setLineDash([9, 9]); g.beginPath(); g.moveTo(-46, 30); g.lineTo(-24, 10); g.lineTo(8, 22); g.lineTo(30, -2); g.stroke(); g.setLineDash([]);
    g.strokeStyle = INK; g.lineWidth = 5; g.fillStyle = '#ff3a3a'; g.beginPath(); g.moveTo(40, 6); g.quadraticCurveTo(22, -12, 26, -26); g.arc(40, -26, 14, Math.PI, 0); g.quadraticCurveTo(58, -12, 40, 6); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.arc(40, -26, 5, 0, 7); g.fillStyle = '#fff6e8'; g.fill();
  } else if (id === 'hats') { // snapback cap with a button and a price tag
    g.lineWidth = 5; g.strokeStyle = INK;
    g.fillStyle = '#ff3ea5'; g.beginPath(); g.moveTo(-46, 12); g.quadraticCurveTo(-48, -50, 0, -50); g.quadraticCurveTo(48, -50, 46, 12); g.closePath(); g.fill(); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.moveTo(0, -50); g.lineTo(0, 12); g.moveTo(-22, -44); g.quadraticCurveTo(-26, -16, -24, 12); g.moveTo(22, -44); g.quadraticCurveTo(26, -16, 24, 12); g.stroke();
    g.lineWidth = 5; g.fillStyle = '#ffe14d'; g.beginPath(); g.moveTo(-52, 8); g.lineTo(46, 8); g.quadraticCurveTo(80, 12, 72, 28); g.quadraticCurveTo(30, 36, -52, 24); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.arc(0, -52, 7, 0, 7); g.fillStyle = '#ffe14d'; g.fill(); g.stroke();
    g.save(); g.rotate(-0.25); g.fillStyle = '#fff6e8'; rr(g, -62, 24, 26, 28, 5); g.fill(); g.lineWidth = 4; g.stroke(); g.fillStyle = INK; g.fillRect(-56, 34, 14, 4); g.fillRect(-56, 42, 9, 4); g.restore();
  } else if (id === 'racks') { // clothes rail with three tees
    g.lineWidth = 5; g.strokeStyle = INK;
    g.strokeStyle = INK; g.lineWidth = 12; g.beginPath(); g.moveTo(-58, -40); g.lineTo(58, -40); g.moveTo(-50, -40); g.lineTo(-58, 54); g.moveTo(50, -40); g.lineTo(58, 54); g.stroke();
    g.strokeStyle = '#c9b6e8'; g.lineWidth = 5; g.beginPath(); g.moveTo(-58, -40); g.lineTo(58, -40); g.moveTo(-50, -40); g.lineTo(-58, 54); g.moveTo(50, -40); g.lineTo(58, 54); g.stroke();
    g.strokeStyle = INK; g.lineWidth = 5; const tees = [[-36, '#ff3ea5'], [0, '#2ee6ff'], [36, '#ffe14d']];
    tees.forEach(([x, c], k) => { g.fillStyle = c; g.beginPath(); g.moveTo(x - 20, -26 + k % 2 * 4); g.lineTo(x - 8, -34); g.lineTo(x + 8, -34); g.lineTo(x + 20, -26 + k % 2 * 4); g.lineTo(x + 15, -8); g.lineTo(x + 10, -12); g.lineTo(x + 10, 22); g.lineTo(x - 10, 22); g.lineTo(x - 10, -12); g.lineTo(x - 15, -8); g.closePath(); g.fill(); g.stroke(); });
  } else if (id === 'mirror') { // standing oval mirror with a sparkle
    g.lineWidth = 5; g.strokeStyle = INK;
    g.lineWidth = 11; g.beginPath(); g.moveTo(-14, 36); g.lineTo(-34, 62); g.moveTo(14, 36); g.lineTo(34, 62); g.stroke(); g.strokeStyle = '#a8693b'; g.lineWidth = 5; g.beginPath(); g.moveTo(-14, 36); g.lineTo(-34, 62); g.moveTo(14, 36); g.lineTo(34, 62); g.stroke();
    g.strokeStyle = INK; g.fillStyle = '#a8693b'; g.beginPath(); g.ellipse(0, -8, 36, 54, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#bfeeff'; g.beginPath(); g.ellipse(0, -8, 26, 44, 0, 0, 7); g.fill(); g.lineWidth = 3; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 6; g.beginPath(); g.moveTo(-14, -34); g.lineTo(-4, -46); g.moveTo(-16, -14); g.lineTo(6, -42); g.stroke();
    g.fillStyle = '#ffe14d'; g.strokeStyle = INK; g.lineWidth = 4; g.beginPath(); g.moveTo(44, -50); g.lineTo(48, -40); g.lineTo(58, -36); g.lineTo(48, -32); g.lineTo(44, -22); g.lineTo(40, -32); g.lineTo(30, -36); g.lineTo(40, -40); g.closePath(); g.fill(); g.stroke();
  } else if (id === 'counter') { // counter with a register and a juice glass
    g.lineWidth = 5; g.strokeStyle = INK;
    g.fillStyle = '#6a4230'; rr(g, -58, 12, 116, 44, 6); g.fill(); g.stroke();
    g.fillStyle = '#c07f48'; rr(g, -64, 2, 128, 16, 5); g.fill(); g.stroke();
    g.fillStyle = '#c9b6e8'; rr(g, -54, -22, 50, 26, 5); g.fill(); g.stroke();
    g.fillStyle = '#2ee6ff'; rr(g, -48, -44, 38, 20, 4); g.fill(); g.lineWidth = 4; g.stroke();
    g.fillStyle = INK; for (let i = 0; i < 3; i++) g.fillRect(-46 + i * 14, -12, 8, 6);
    g.lineWidth = 5; g.fillStyle = 'rgba(255,246,232,.85)'; g.beginPath(); g.moveTo(16, -34); g.lineTo(52, -34); g.lineTo(46, 2); g.lineTo(22, 2); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#9dff4a'; g.beginPath(); g.moveTo(18, -20); g.lineTo(50, -20); g.lineTo(46, 0); g.lineTo(22, 0); g.closePath(); g.fill();
    g.strokeStyle = '#ff3ea5'; g.lineWidth = 6; g.beginPath(); g.moveTo(36, -22); g.lineTo(42, -52); g.stroke();
  } else if (id === 'mic') { // studio condenser mic in a cradle with a pop filter
    g.lineWidth = 5; g.strokeStyle = INK;
    g.lineWidth = 11; g.beginPath(); g.moveTo(0, 22); g.lineTo(0, 52); g.stroke(); g.strokeStyle = '#c9b6e8'; g.lineWidth = 5; g.beginPath(); g.moveTo(0, 22); g.lineTo(0, 52); g.stroke();
    g.strokeStyle = INK; g.fillStyle = '#c9b6e8'; g.beginPath(); g.ellipse(0, 56, 34, 9, 0, 0, 7); g.fill(); g.stroke();
    g.lineWidth = 10; g.beginPath(); g.arc(0, -4, 30, 0.25, Math.PI - 0.25); g.stroke(); g.strokeStyle = '#ffe14d'; g.lineWidth = 4; g.beginPath(); g.arc(0, -4, 30, 0.25, Math.PI - 0.25); g.stroke();
    g.strokeStyle = INK; g.lineWidth = 5; g.fillStyle = '#7b4fe0'; g.beginPath(); g.ellipse(0, -18, 21, 34, 0, 0, 7); g.fill(); g.stroke();
    g.save(); g.beginPath(); g.ellipse(0, -18, 21, 34, 0, 0, 7); g.clip(); g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 3; for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(-26, -18 + i * 10); g.lineTo(26, -18 + i * 10); g.stroke(); } g.restore();
    g.strokeStyle = '#2ee6ff'; g.lineWidth = 6; g.fillStyle = 'rgba(46,230,255,.18)'; g.beginPath(); g.arc(42, -20, 20, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.arc(-44, -46, 9, 0, 7); g.fillStyle = '#ff3a3a'; g.fill(); g.strokeStyle = INK; g.lineWidth = 4; g.stroke();
  } else if (id === 'mixer') { // mixing desk with faders and meters
    g.lineWidth = 5; g.strokeStyle = INK;
    g.fillStyle = '#3a2760'; rr(g, -62, -34, 124, 82, 10); g.fill(); g.stroke();
    const cols = ['#ff3ea5', '#2ee6ff', '#ffe14d', '#9dff4a', '#a86bff'], hs = [3, 5, 2, 4, 3];
    for (let i = 0; i < 5; i++) { const x = -42 + i * 21; for (let k = 0; k < 4; k++) { g.fillStyle = k < hs[i] ? (k > 2 ? '#ff3a3a' : k > 1 ? '#ffe14d' : '#9dff4a') : 'rgba(255,255,255,.18)'; g.fillRect(x - 6, -26 + (3 - k) * 7, 12, 5); }
      g.fillStyle = INK; rr(g, x - 3, 4, 6, 38, 3); g.fill(); const ky = 8 + (i * 13) % 24; g.fillStyle = cols[i]; rr(g, x - 10, ky, 20, 12, 4); g.fill(); g.lineWidth = 3; g.stroke(); }
  } else if (id === 'stage') { // little stage: curtains, spot cone, mic stand
    g.lineWidth = 5; g.strokeStyle = INK;
    g.fillStyle = 'rgba(255,225,77,.5)'; g.beginPath(); g.moveTo(-8, -58); g.lineTo(8, -58); g.lineTo(44, 28); g.lineTo(-44, 28); g.closePath(); g.fill();
    g.fillStyle = '#e63946'; g.beginPath(); g.moveTo(-64, -58); g.lineTo(-26, -58); g.quadraticCurveTo(-40, -14, -28, 28); g.lineTo(-64, 28); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(64, -58); g.lineTo(26, -58); g.quadraticCurveTo(40, -14, 28, 28); g.lineTo(64, 28); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#6a4230'; g.beginPath(); g.moveTo(-66, 28); g.lineTo(66, 28); g.lineTo(54, 54); g.lineTo(-54, 54); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#c07f48'; rr(g, -68, 20, 136, 12, 3); g.fill(); g.stroke();
    g.lineWidth = 6; g.beginPath(); g.moveTo(0, -6); g.lineTo(0, 20); g.stroke(); g.lineWidth = 5; g.fillStyle = '#ff3ea5'; g.beginPath(); g.arc(0, -16, 12, 0, 7); g.fill(); g.stroke();
  } else if (id === 'stool') { // bar stool
    g.lineWidth = 5; g.strokeStyle = INK;
    g.lineWidth = 13; g.beginPath(); g.moveTo(-6, -2); g.lineTo(-34, 54); g.moveTo(6, -2); g.lineTo(34, 54); g.moveTo(0, -2); g.lineTo(0, 52); g.stroke();
    g.strokeStyle = '#c9b6e8'; g.lineWidth = 6; g.beginPath(); g.moveTo(-6, -2); g.lineTo(-34, 54); g.moveTo(6, -2); g.lineTo(34, 54); g.moveTo(0, -2); g.lineTo(0, 52); g.stroke();
    g.strokeStyle = INK; g.lineWidth = 5; g.fillStyle = '#b52a35'; g.beginPath(); g.moveTo(-42, -28); g.lineTo(-42, -12); g.quadraticCurveTo(0, 8, 42, -12); g.lineTo(42, -28); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#e63946'; g.beginPath(); g.ellipse(0, -28, 42, 15, 0, 0, 7); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 4; g.beginPath(); g.ellipse(0, -30, 26, 8, 0, Math.PI * 1.05, Math.PI * 1.7); g.stroke();
    g.strokeStyle = '#ffe14d'; g.lineWidth = 5; g.beginPath(); g.ellipse(0, 30, 24, 7, 0, 0, 7); g.stroke();
  } else if (id === 'jam') { // the cypher: a ring of heads around a mic, with a music note
    g.lineWidth = 5; g.strokeStyle = INK;
    g.strokeStyle = 'rgba(157,255,74,.7)'; g.lineWidth = 6; g.beginPath(); g.ellipse(0, 22, 52, 20, 0, 0, 7); g.stroke(); g.strokeStyle = INK; g.lineWidth = 5;
    [[-50, 8, '#ff3ea5'], [-26, -6, '#2ee6ff'], [26, -6, '#ffe14d'], [50, 8, '#a86bff']].forEach(([x, y, c]) => { g.fillStyle = c; rr(g, x - 13, y + 8, 26, 24, 8); g.fill(); g.stroke(); g.fillStyle = '#f4d3bd'; g.beginPath(); g.arc(x, y, 11, 0, 7); g.fill(); g.stroke(); });
    g.fillStyle = '#c9b6e8'; g.fillRect(-4, 6, 8, 34); g.strokeRect(-4, 6, 8, 34); g.beginPath(); g.arc(0, 0, 13, 0, 7); g.fillStyle = '#9dff4a'; g.fill(); g.stroke();
    g.fillStyle = '#fff6e8'; g.beginPath(); g.ellipse(-8, -40, 9, 7, -0.4, 0, 7); g.fill(); g.stroke(); g.lineWidth = 6; g.beginPath(); g.moveTo(0, -42); g.lineTo(0, -66); g.lineTo(18, -58); g.stroke();
  } else { // unknown id: a neon star, so a missing glyph is still readable
    g.lineWidth = 5; g.strokeStyle = INK; g.fillStyle = '#ffe14d'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 26 : 58; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); g.stroke();
  }
  g.restore();
}
// ---------- state decorations (shared extras atlas: lock chip, goal arrow, badge dot) ----------
export function drawLockChip(g, S) { // red-rimmed dark disc with a golden padlock
  g.save(); g.translate(S / 2, S / 2); g.scale(S / 128, S / 128); g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath(); g.arc(0, 0, 58, 0, 7); g.fillStyle = '#17102b'; g.fill(); g.lineWidth = 8; g.strokeStyle = '#ff5a5a'; g.stroke();
  g.strokeStyle = '#17102b'; g.lineWidth = 17; g.beginPath(); g.arc(0, -8, 19, Math.PI, 0); g.lineTo(19, 4); g.moveTo(-19, -8); g.lineTo(-19, 4); g.stroke();
  g.strokeStyle = '#fff6e8'; g.lineWidth = 8; g.beginPath(); g.arc(0, -8, 19, Math.PI, 0); g.lineTo(19, 4); g.moveTo(-19, -8); g.lineTo(-19, 4); g.stroke();
  g.fillStyle = '#ffd23f'; rr(g, -29, 2, 58, 42, 9); g.fill(); g.lineWidth = 6; g.strokeStyle = '#17102b'; g.stroke();
  g.fillStyle = '#17102b'; g.beginPath(); g.arc(0, 18, 7, 0, 7); g.fill(); g.fillRect(-3.5, 18, 7, 14);
  g.restore();
}
function drawArrow(g, S) { // bold down arrow
  g.save(); g.translate(S / 2, S / 2); g.scale(S / 128, S / 128); g.lineJoin = 'round'; g.beginPath(); g.moveTo(-17, -54); g.lineTo(17, -54); g.lineTo(17, -10); g.lineTo(44, -10); g.lineTo(0, 52); g.lineTo(-44, -10); g.lineTo(-17, -10); g.closePath();
  g.fillStyle = '#ffe14d'; g.fill(); g.lineWidth = 10; g.strokeStyle = '#17102b'; g.stroke(); g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(-9, -46, 8, 34); g.restore();
}
function drawDot(g, S, text) { g.save(); g.translate(S / 2, S / 2); g.beginPath(); g.arc(0, 0, S * 0.44, 0, 7); g.fillStyle = '#ff3a3a'; g.fill(); g.lineWidth = S * 0.09; g.strokeStyle = '#fff6e8'; g.stroke();
  if (text) { g.fillStyle = '#fff6e8'; g.font = '900 ' + Math.round(S * (String(text).length > 1 ? 0.46 : 0.6)) + 'px system-ui, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(text), 0, S * 0.04); } g.restore(); }
// badge = dark disc with a neon rim and the glyph in it. Used for the world icon atlas and the DOM prompt button. opts.locked greys it and adds the padlock.
export function drawBadge(g, id, color, S, opts) {
  const lk = !!(opts && opts.locked); g.save(); g.translate(S / 2, S / 2); const R = S * 0.46;
  g.beginPath(); g.arc(0, 0, R, 0, 7); const gr = g.createRadialGradient(0, -R * 0.3, R * 0.1, 0, 0, R); gr.addColorStop(0, '#4a2f7a'); gr.addColorStop(1, '#201438'); g.fillStyle = gr; g.fill();
  g.lineWidth = S * 0.05; g.strokeStyle = lk ? '#8a8499' : color; g.stroke(); g.lineWidth = S * 0.012; g.strokeStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(0, 0, R - S * 0.035, 0, 7); g.stroke();
  if (lk) g.globalAlpha = 0.5; glyph(g, id, S * 0.8); g.globalAlpha = 1;
  if (lk) { const cs = S * 0.42; g.save(); g.translate(R * 0.55 - cs / 2, R * 0.55 - cs / 2); drawLockChip(g, cs); g.restore(); }
  g.restore();
}
export function spotGlyphCanvas(id, color, S, opts) { const c = document.createElement('canvas'); c.width = c.height = S; drawBadge(c.getContext('2d'), id, color, S, opts); return c; }
export const SPOT_DEFS = DEFS;
export const SPOT_GLYPHS = ['busk', 'bench', 'jam', 'run', 'flyers', 'gate', 'booth', 'couch', 'bed', 'desk', 'kitchen', 'wardrobe', 'door', 'map', 'hats', 'racks', 'mirror', 'counter', 'mic', 'mixer', 'stage', 'stool'];
const INDOOR = { enter: 1.15, release: 1.75, ring: 1.1, iconY: 2.55, iconK: 0.78, pillar: 2.6 };
const GOLD = '#ffe14d', GREY = '#8a8499';

// soft additive sparkle points (also used by controls.js for the route dots). Per-point size/alpha/colour, no texture.
export function makeSparkles(THREE_, n, base) {
  const geo = new THREE_.BufferGeometry(); geo.setAttribute('position', new THREE_.BufferAttribute(new Float32Array(n * 3), 3)); geo.setAttribute('aColor', new THREE_.BufferAttribute(new Float32Array(n * 3).fill(1), 3)); geo.setAttribute('aSize', new THREE_.BufferAttribute(new Float32Array(n), 1)); geo.setAttribute('aAlpha', new THREE_.BufferAttribute(new Float32Array(n), 1));
  const mat = new THREE_.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE_.AdditiveBlending, uniforms: { uScale: { value: 400 }, uGain: { value: base || 1 } },
    vertexShader: 'attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uScale; varying vec3 vC; varying float vA; void main(){ vC=aColor; vA=aAlpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=max(1.0, aSize*uScale/-mv.z); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'varying vec3 vC; varying float vA; uniform float uGain; void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d); float core=smoothstep(0.5,0.0,r); float cr=smoothstep(0.07,0.0,min(abs(d.x),abs(d.y)))*smoothstep(0.5,0.05,r); float a=(core*core+cr*0.8)*vA*uGain; gl_FragColor=vec4(vC*a,a); }' });
  const pts = new THREE_.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 4; return pts;
}
export function updateSparkScale(pts, renderer, camera) { const h = renderer.domElement.height || 800; pts.material.uniforms.uScale.value = h * 0.5 / Math.tan(camera.fov * Math.PI / 360); }

export function buildSpots(ctx, terrain) {
  const THREE_ = THREE, group = new THREE_.Group(), events = ctx.events; group.name = 'spots';
  const sd = terrain && terrain.spotDefs, defs = (Array.isArray(sd) && sd.length ? sd : Array.isArray(sd) ? [] : DEFS).filter((d) => d && d.id), IN = !!(terrain && terrain.interior), N = defs.length;
  const base = IN ? INDOOR : { enter: ENTER_R, release: RELEASE_R, ring: RING_R, iconY: 3.9, iconK: 1, pillar: 4.4 };
  // per-def metrics: ring (visual radius), radius (enter), release, iconY, iconK, pillar height, kind ('door' = walking into the ring activates)
  const ring0 = (d) => (d.ring !== undefined ? d.ring : d.ringR !== undefined ? d.ringR : base.ring);
  const api = { group, spots: [], canFire: () => true, update() {}, nearest: () => null, activate(id) { events.emit('spot', { id, scene: ctx.sceneName || 'park' }); }, refresh() {}, setSpotState: () => false, getSpotState: () => null, ENTER_R: base.enter, RELEASE_R: base.release };
  if (!N) return api; // a world without spots is fine: nothing to draw, nothing to throw
  // ----- fx atlas (512x256): cell A = glow pool + ring, cell B = dashed ring -----
  const fx = document.createElement('canvas'); fx.width = 512; fx.height = 256; const g = fx.getContext('2d');
  { const cx = 128, cy = 128, H = 124; // cell A
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, H); gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.20)'); gr.addColorStop(0.74, 'rgba(255,255,255,0.45)'); gr.addColorStop(0.8, 'rgba(255,255,255,1)'); gr.addColorStop(0.92, 'rgba(255,255,255,1)'); gr.addColorStop(0.97, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, H, 0, 7); g.fill();
    // inner faint tick marks for a UI-hologram feel
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * H * 0.62, cy + Math.sin(a) * H * 0.62); g.lineTo(cx + Math.cos(a) * H * 0.7, cy + Math.sin(a) * H * 0.7); g.stroke(); }
    // cell B dashed ring
    const bx = 384; g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 10; g.lineCap = 'round'; const NN = 14; for (let i = 0; i < NN; i++) { const a0 = i / NN * Math.PI * 2, a1 = a0 + Math.PI * 2 / NN * 0.55; g.beginPath(); g.arc(bx, cy, 112, a0, a1); g.stroke(); }
  }
  const fxTex = new THREE_.CanvasTexture(fx); fxTex.colorSpace = THREE_.SRGBColorSpace; fxTex.anisotropy = 4;
  const cellGeo = (u0, u1) => { const p = new THREE_.PlaneGeometry(1, 1); p.rotateX(-Math.PI / 2); const uv = p.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), uv.getY(i)); return p; };
  const ringGeo = cellGeo(0, 0.5), dashGeo = cellGeo(0.5, 1);
  // ----- icon atlas: a grid of 192 x 256 cells (8 per row) -----
  const IW = 192, IH = 256, COLS = Math.min(N, 8), ROWS = Math.ceil(N / COLS), ic = document.createElement('canvas'); ic.width = IW * COLS; ic.height = IH * ROWS; const ig = ic.getContext('2d');
  defs.forEach((d, i) => { ig.save(); ig.translate((i % COLS) * IW, Math.floor(i / COLS) * IH); ig.drawImage(spotGlyphCanvas(d.icon || d.id, d.color || '#ff3ea5', 192), 0, 0);
    ig.font = '800 40px system-ui, Arial, sans-serif'; ig.textAlign = 'center'; ig.textBaseline = 'middle'; ig.lineJoin = 'round'; ig.lineWidth = 11; ig.strokeStyle = '#17102b'; const lb = String(d.label || d.id).toUpperCase(); ig.strokeText(lb, IW / 2, 222, 184); ig.fillStyle = '#fff6e8'; ig.fillText(lb, IW / 2, 222, 184); ig.restore(); });
  const iconTex = new THREE_.CanvasTexture(ic); iconTex.colorSpace = THREE_.SRGBColorSpace; iconTex.anisotropy = 4;
  const sparks = makeSparkles(THREE_, N * 9, 1.0); group.add(sparks);

  // lazily created decorations (lock chip, goal arrow, badge, beam) share one small atlas
  let xTex = null, xGeo = {};
  function xAtlas() { if (xTex) return xTex; const c = document.createElement('canvas'); c.width = 384; c.height = 128; const q = c.getContext('2d'); [drawLockChip, drawArrow, drawDot].forEach((fn, k) => { q.save(); q.translate(k * 128, 0); fn(q, 128); q.restore(); }); xTex = new THREE_.CanvasTexture(c); xTex.colorSpace = THREE_.SRGBColorSpace; xTex.anisotropy = 4; return xTex; }
  function xPlane(cell, size, order) { const pg = new THREE_.PlaneGeometry(size, size), uv = pg.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, (cell + uv.getX(k)) / 3, uv.getY(k)); const m = new THREE_.Mesh(pg, new THREE_.MeshBasicMaterial({ map: xAtlas(), transparent: true, depthWrite: false, depthTest: false, toneMapped: false, fog: false, alphaTest: 0.02 })); m.renderOrder = order; m.castShadow = false; m.visible = false; return m; }

  const byId = {};
  const spots = defs.map((d, i) => {
    const col = new THREE_.Color(d.color || '#ff3ea5'), ringR = ring0(d), radius = d.radius !== undefined ? d.radius : ringR + 0.05, release = d.release !== undefined ? d.release : radius + 0.6, iconK = d.iconK !== undefined ? d.iconK : base.iconK, iconY = d.iconY !== undefined ? d.iconY : base.iconY;
    const ringSize = ringR * 2 / 0.9 * (124 / 128), root = new THREE_.Group(); root.visible = false; group.add(root);
    const mk = (geo, size, order, gain) => { const m = new THREE_.Mesh(geo, new THREE_.MeshBasicMaterial({ map: fxTex, color: col.clone().multiplyScalar(gain), transparent: true, depthWrite: false, blending: THREE_.AdditiveBlending, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })); m.scale.set(size, 1, size); m.position.y = 0.1; m.renderOrder = order; m.castShadow = false; m.receiveShadow = false; root.add(m); return m; };
    const ring = mk(ringGeo, ringSize, 2, 1.7), dash = mk(dashGeo, ringSize * 1.02, 3, 1.9); dash.position.y = 0.12;
    const pg = new THREE_.PlaneGeometry(1.5 * iconK, 2.0 * iconK); const uv = pg.attributes.uv, cx = i % COLS, cy = Math.floor(i / COLS); for (let k = 0; k < uv.count; k++) uv.setXY(k, (cx + uv.getX(k)) / COLS, 1 - (cy + 1) / ROWS + uv.getY(k) / ROWS);
    const iconG = new THREE_.Group(); root.add(iconG);
    const icon = new THREE_.Mesh(pg, new THREE_.MeshBasicMaterial({ map: iconTex, transparent: true, depthWrite: false, toneMapped: false, fog: false, alphaTest: 0.02 })); icon.renderOrder = 6; icon.castShadow = false; iconG.add(icon);
    const s = { id: d.id, label: d.label || d.id, icon: d.icon || d.id, kind: d.kind || '', color: d.color || '#ff3ea5', color2: d.color2, cine: d.cine, anchor: d.anchor, def: d, x: 0, z: 0, rot: 0, iconY, iconK, ringR, radius, release, pr: ringR * 0.92, ph: d.pillar !== undefined ? d.pillar : base.pillar, ringSize, rk: ringR / RING_R,
      near: false, armed: false, intent: d.intent && d.kind === 'door' ? { dwell: d.intent.dwell !== undefined ? +d.intent.dwell : 0.35, nx: d.intent.nx, nz: d.intent.nz } : null, dwell: 0, glow: 0, pop: 0, i, root, iconG, ring, dash, iconMesh: icon, seed: Math.random() * 6.28, placed: false, locked: false, reason: '', goal: false, badge: false, ex: null, col: col.clone(), baseCol: col };
    byId[s.id] = s; return s;
  });
  const sp = { life: new Float32Array(N * 9), ang: new Float32Array(N * 9), rad: new Float32Array(N * 9) };
  for (let k = 0; k < sp.life.length; k++) { sp.life[k] = Math.random(); sp.ang[k] = Math.random() * 6.28; sp.rad[k] = (0.3 + Math.random() * 1.2) * spots[Math.floor(k / 9)].rk; }

  // light pillars: ONE merged additive mesh for all spots (vertex colour fades to black at the top = invisible when additive); unit radius, scaled per spot
  const SEG = 18, VPS = SEG * 6, pg2 = new THREE_.BufferGeometry(), pPos = new Float32Array(N * VPS * 3), pCol = new Float32Array(N * VPS * 3), pBase = [];
  for (let k = 0; k < SEG; k++) { const a0 = k / SEG * 6.2832, a1 = (k + 1) / SEG * 6.2832, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1); pBase.push([c0, 0.06, s0, 1], [c1, 0.06, s1, 1], [c1, 1, s1, 0], [c0, 0.06, s0, 1], [c1, 1, s1, 0], [c0, 1, s0, 0]); }
  function paintPillar(s) { const c = s.col, f0 = (IN ? 0.2 : 0.34) * (s.locked ? 0.3 : s.goal ? 1.5 : 1); pBase.forEach((v, vi) => { const o = (s.i * VPS + vi) * 3, f = v[3] * f0; pCol[o] = c.r * f; pCol[o + 1] = c.g * f; pCol[o + 2] = c.b * f; }); pg2.attributes.color.needsUpdate = true; }
  pg2.setAttribute('position', new THREE_.BufferAttribute(pPos, 3)); pg2.setAttribute('color', new THREE_.BufferAttribute(pCol, 3)); spots.forEach(paintPillar);
  const pillar = new THREE_.Mesh(pg2, new THREE_.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE_.AdditiveBlending, depthWrite: false, side: THREE_.DoubleSide, toneMapped: false, fog: false })); pillar.frustumCulled = false; pillar.renderOrder = 1; group.add(pillar);
  function placePillar(s) { const o0 = s.i * VPS * 3, y = s.root.position.y; pBase.forEach((v, vi) => { const o = o0 + vi * 3; pPos[o] = s.x + v[0] * s.pr; pPos[o + 1] = y + v[1] * (v[3] ? 1 : s.ph); pPos[o + 2] = s.z + v[2] * s.pr; }); pg2.attributes.position.needsUpdate = true; }
  function place(s) {
    const d = s.def, AN = terrain && terrain.anchors, a = (d.x !== undefined && d.z !== undefined ? d : null) || (AN && (AN[s.anchor] || AN[s.id]));
    // no anchor (or it went away: the park jam after 18:00): hidden, and its pillar collapses so no light beam is left standing
    if (!a || !isFinite(a.x) || !isFinite(a.z)) { if (s.placed) { const pr = s.pr; s.pr = 0; placePillar(s); s.pr = pr; } s.root.visible = false; s.placed = false; s.near = false; return; }
    if (s.placed && a.x === s.x && a.z === s.z) return; s.x = a.x; s.z = a.z; s.rot = a.rot || 0; s.placed = true; s.root.visible = true; s.root.position.set(s.x, terrain && terrain.heightAt ? terrain.heightAt(s.x, s.z) || 0 : 0, s.z); placePillar(s);
  }
  function fire(s) { const e = { id: s.id, scene: ctx.sceneName || 'park', kind: s.kind, locked: !!s.locked, reason: s.reason || '' }; if (s.kind === 'door') events.emit('door', e); events.emit('spot', e); }
  function refresh(p, dt) {
    if (!p) return; const can = !api.canFire || api.canFire();
    for (const s of spots) { place(s); if (!s.placed) continue; const d = Math.hypot(p.x - s.x, p.z - s.z); if (!s.near && d < s.radius) s.near = true; else if (s.near && d > s.release) s.near = false;
      if (s.kind !== 'door') continue; if (d > s.release) s.armed = true;
      if (!s.intent) { if (s.armed && d < s.radius && can) { s.armed = false; fire(s); } continue; }
      // intent door: inside the ring it fires only when api.doorIntent(s) says so: 'go' (the walk goal is this door) at once, 'dwell' (standing still or pressing
      // into the door) after intent.dwell seconds of dt (only the controls' refresh(pos, dt) counts time); just walking past gives '' and resets the timer
      const want = s.armed && d < s.radius && can ? (api.doorIntent ? api.doorIntent(s) : 'dwell') : '';
      if (want === 'go') { s.armed = false; s.dwell = 0; fire(s); } else if (want === 'dwell') { if (dt > 0) s.dwell += dt; if (s.dwell >= s.intent.dwell) { s.armed = false; s.dwell = 0; fire(s); } } else s.dwell = 0; }
  }
  function nearest(p) { refresh(p); let best = null, bd = 1e9; for (const s of spots) if (s.near && s.kind !== 'door') { const d = Math.hypot(p.x - s.x, p.z - s.z); if (d < bd) { bd = d; best = s; } } return best; }
  function activate(id) { const s = byId[id]; if (s) { if (s.kind === 'door') s.armed = false; fire(s); } else events.emit('spot', { id, scene: ctx.sceneName || 'park' }); }

  // ----- states: locked (grey icon, padlock, dim ring, dim pillar), goal (light beam + bobbing arrow), badge (dot or short text) -----
  const tmpC = new THREE_.Color();
  function beam(s) {
    const H = 16, mkB = (r0, r1, a) => { const geo = new THREE_.CylinderGeometry(r1, r0, H, 20, 1, true); geo.translate(0, H / 2, 0); const n = geo.attributes.position.count, cols = new Float32Array(n * 3); for (let k = 0; k < n; k++) { const f = 1 - geo.attributes.position.getY(k) / H; cols[k * 3] = cols[k * 3 + 1] = cols[k * 3 + 2] = f * f * a; } geo.setAttribute('color', new THREE_.BufferAttribute(cols, 3));
      const m = new THREE_.Mesh(geo, new THREE_.MeshBasicMaterial({ vertexColors: true, color: new THREE_.Color(GOLD), transparent: true, blending: THREE_.AdditiveBlending, depthWrite: false, side: THREE_.DoubleSide, toneMapped: false, fog: false })); m.renderOrder = 1; m.frustumCulled = false; return m; };
    const b = new THREE_.Group(); b.add(mkB(s.ringR * 0.5, s.ringR * 0.34, 0.26), mkB(s.ringR * 0.16, s.ringR * 0.1, 0.5)); b.position.y = 0.08; b.visible = false; s.root.add(b); return b;
  }
  function ensure(s) {
    if (s.ex) return s.ex; const k = s.iconK, e = { lock: xPlane(0, 0.78 * k, 7), arrow: xPlane(1, 0.78 * k, 8), dot: xPlane(2, 0.4 * k, 7), beam: beam(s), dotTex: null };
    e.lock.position.set(0.5 * k, -0.18 * k, 0.01); e.dot.position.set(0.55 * k, 0.8 * k, 0.01); e.arrow.position.set(0, 1.42 * k, 0.01); s.iconG.add(e.lock, e.dot, e.arrow); s.ex = e; return e;
  }
  function badgeTex(text, color) { const c = document.createElement('canvas'); c.width = c.height = 64; const q = c.getContext('2d'); drawDot(q, 64, text); if (color) { q.globalCompositeOperation = 'source-atop'; } const t = new THREE_.CanvasTexture(c); t.colorSpace = THREE_.SRGBColorSpace; return t; }
  function applyState(s) {
    const need = s.locked || s.goal || s.badge; if (!need && !s.ex) { s.col.copy(s.baseCol); s.icon_dim = 0; s.iconMesh.material.color.setRGB(1, 1, 1); paintPillar(s); return; }
    const e = ensure(s); e.lock.visible = s.locked; e.arrow.visible = s.goal; e.beam.visible = s.goal; e.dot.visible = !!s.badge;
    if (s.badge) { const b = s.badge, isColor = typeof b === 'string' && /^(#|rgb)/.test(b), txt = (typeof b === 'string' && !isColor) || typeof b === 'number' ? String(b).slice(0, 2) : ''; const m = e.dot.material;
      if (txt) { if (e.dotTex) e.dotTex.dispose(); e.dotTex = badgeTex(txt); m.map = e.dotTex; m.color.set(0xffffff); e.dot.geometry.attributes.uv.array.set([0, 1, 1, 1, 0, 0, 1, 0]); e.dot.geometry.attributes.uv.needsUpdate = true; e.dot.scale.setScalar(1.15); }
      else { m.map = xAtlas(); const uv = e.dot.geometry.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, (2 + (k % 2)) / 3, k < 2 ? 1 : 0); uv.needsUpdate = true; if (isColor) m.color.set(b); else m.color.set(0xffffff); e.dot.scale.setScalar(1); } m.needsUpdate = true; }
    s.col.copy(s.locked ? tmpC.set(GREY) : s.baseCol); s.iconMesh.material.color.setRGB(s.locked ? 0.5 : 1, s.locked ? 0.5 : 1, s.locked ? 0.55 : 1); paintPillar(s);
    const gain = s.locked ? 0.55 : 1, rc = s.col; s.ring.material.color.copy(rc).multiplyScalar(1.7 * gain); s.dash.material.color.copy(s.goal && !s.locked ? tmpC.set(GOLD) : rc).multiplyScalar(1.9 * gain);
  }
  function setSpotState(id, st) {
    const s = byId[id]; if (!s) return false; st = st || {}; if ('locked' in st) s.locked = !!st.locked; if ('reason' in st) s.reason = st.reason || ''; if ('goal' in st) s.goal = !!st.goal; if ('badge' in st) s.badge = st.badge === undefined || st.badge === null ? false : st.badge; if (st.locked === false && !('reason' in st)) s.reason = '';
    applyState(s); return true;
  }
  function getSpotState(id) { const s = byId[id]; return s ? { locked: s.locked, reason: s.reason, goal: s.goal, badge: s.badge } : null; }

  const ease = (a, b, k) => a + (b - a) * k;
  function update(dt, t, p) {
    refresh(p); const cam = ctx.camera, pa = sparks.geometry.attributes; updateSparkScale(sparks, ctx.renderer, cam);
    for (const s of spots) {
      if (!s.placed) continue; const on = s.near ? 1 : 0; s.glow = ease(s.glow, on, 1 - Math.exp(-6 * dt)); s.pop = ease(s.pop, on, 1 - Math.exp(-9 * dt));
      const lk = s.locked ? 0.4 : 1, pulse = Math.sin(t * Math.PI * 2 * (1.2 + s.glow * 0.8 + (s.goal ? 0.6 : 0)) + s.seed), sc = 1 + 0.035 * pulse + 0.05 * s.glow + (s.goal ? 0.05 * (1 + pulse) : 0);
      s.ring.scale.set(s.ringSize * sc, 1, s.ringSize * sc); s.ring.material.opacity = (0.72 + 0.18 * pulse + 0.25 * s.glow) * lk; s.dash.rotation.y = -t * (0.35 + s.glow * 0.5 + (s.goal ? 0.5 : 0)) + s.seed; s.dash.material.opacity = (0.55 + 0.3 * s.glow) * lk;
      const bob = Math.sin(t * Math.PI * 2 * 0.8 + s.seed) * 0.1; s.iconG.position.set(0, s.iconY + bob + s.pop * 0.15, 0); const k = 1 + 0.28 * s.pop; s.iconG.scale.set(k, k, 1); s.iconG.quaternion.copy(cam.quaternion);
      const e = s.ex; if (e) { if (s.goal) { e.arrow.position.y = (1.42 + 0.12 * Math.sin(t * 6.5 + s.seed)) * s.iconK; const bm = 0.8 + 0.2 * Math.sin(t * 3 + s.seed); e.beam.children.forEach((c, ci) => { c.material.opacity = bm * (ci ? 1 : 0.9); }); } if (s.badge && e.dot.visible) { const bp = 1 + 0.1 * Math.sin(t * 5 + s.seed); e.dot.scale.setScalar((e.dotTex ? 1.15 : 1) * bp); } }
    }
    for (let k = 0; k < sp.life.length; k++) {
      const si = Math.floor(k / 9), s = spots[si]; if (!s.placed) { pa.aAlpha.array[k] = 0; continue; }
      sp.life[k] += dt * (0.4 + 0.3 * s.glow); if (sp.life[k] > 1) { sp.life[k] -= 1; sp.ang[k] = Math.random() * 6.28; sp.rad[k] = (0.25 + Math.random() * 1.25) * s.rk; }
      const l = sp.life[k], r = sp.rad[k] * (1 - 0.15 * l), a = sp.ang[k] + l * 0.8; const c = s.col, lk = s.locked ? 0.25 : 1;
      pa.position.setXYZ(k, s.x + Math.cos(a) * r, 0.15 + l * (IN ? 1.4 : 2.0), s.z + Math.sin(a) * r); pa.aColor.setXYZ(k, c.r * 0.7 + 0.3, c.g * 0.7 + 0.3, c.b * 0.7 + 0.3);
      pa.aSize.array[k] = 0.16 + 0.12 * (1 - l) + 0.06 * s.glow; pa.aAlpha.array[k] = Math.sin(l * Math.PI) * (0.55 + 0.45 * s.glow) * lk;
    }
    pa.position.needsUpdate = pa.aColor.needsUpdate = pa.aSize.needsUpdate = pa.aAlpha.needsUpdate = true;
  }
  spots.forEach(place);
  Object.assign(api, { spots, update, nearest, activate, refresh, setSpotState, getSpotState, byId, ENTER_R: base.enter, RELEASE_R: base.release });
  return api;
}
