/*
  '90s car model library — 20 low-poly cars based on real 1990s cars.
  Original procedural geometry (no ripped assets); names are fictional
  soundalikes so the data is safe to ship in a game, `basis` records the
  real car each model is modeled after.

  Exposes window.NINETIES_CARS = { cars: [...], toObj }.
  Each car: { id, name, basis, year, category, price, color, build() }
  build() returns { verts: [[x,y,z],...], faces: [{idx:[...], color}] }.
  Coordinates: x = length (+x nose), y = up (ground at 0), z = width. Meters.
*/
(function () {
  'use strict';

  /* ---------------- mesh helpers ---------------- */

  function newMesh() { return { verts: [], faces: [] }; }
  function addVert(m, x, y, z) { m.verts.push([x, y, z]); return m.verts.length - 1; }
  function addFace(m, idx, color) { m.faces.push({ idx, color }); }

  function addBox(m, x0, x1, y0, y1, z0, z1, color) {
    const v = [
      addVert(m, x0, y0, z0), addVert(m, x1, y0, z0),
      addVert(m, x1, y1, z0), addVert(m, x0, y1, z0),
      addVert(m, x0, y0, z1), addVert(m, x1, y0, z1),
      addVert(m, x1, y1, z1), addVert(m, x0, y1, z1),
    ];
    addFace(m, [v[0], v[1], v[2], v[3]], color);
    addFace(m, [v[5], v[4], v[7], v[6]], color);
    addFace(m, [v[4], v[0], v[3], v[7]], color);
    addFace(m, [v[1], v[5], v[6], v[2]], color);
    addFace(m, [v[3], v[2], v[6], v[7]], color);
    addFace(m, [v[4], v[5], v[1], v[0]], color);
  }

  /*
    Body loft. Slice: { x, yb, ym, yt, wb, wm, wt, sw, tw, tc, bc }
      yb/ym/yt = sill / beltline / roofline heights
      wb/wm/wt = half-widths at those heights
      sw = segment starting here has glass on the upper sides
      tw = segment starting here has glass on top (wind/rear screens)
      tc = explicit top color for the segment (cockpits, black roofs)
      bc = explicit upper-side color for the segment
  */
  function S(x, yb, ym, yt, wb, wm, wt, o) {
    const s = { x, yb, ym, yt, wb, wm, wt };
    return o ? Object.assign(s, o) : s;
  }

  function loftBody(m, slices, C) {
    const ring = (s) => [
      [s.wb, s.yb], [s.wm, s.ym], [s.wt, s.yt],
      [-s.wt, s.yt], [-s.wm, s.ym], [-s.wb, s.yb],
    ];
    const ids = slices.map((s) => ring(s).map(([z, y]) => addVert(m, s.x, y, z)));
    for (let i = 0; i < slices.length - 1; i++) {
      const a = ids[i], b = ids[i + 1], s = slices[i];
      const side = s.bc || (s.sw ? C.glass : C.body);
      const top = s.tc || (s.tw ? C.glass : C.body);
      addFace(m, [a[0], b[0], b[1], a[1]], C.body);
      addFace(m, [a[1], b[1], b[2], a[2]], side);
      addFace(m, [a[2], b[2], b[3], a[3]], top);
      addFace(m, [a[3], b[3], b[4], a[4]], side);
      addFace(m, [a[4], b[4], b[5], a[5]], C.body);
      addFace(m, [a[5], b[5], b[0], a[0]], C.under);
    }
    addFace(m, ids[0].slice().reverse(), C.body);
    addFace(m, ids[ids.length - 1], C.body);
  }

  function addWheel(m, cx, cy, cz, r, w, side, hubColor) {
    const N = 12, out = cz + side * w / 2, inn = cz - side * w / 2;
    const TIRE = '#181820', CAP = '#20202b';
    const ringO = [], ringI = [];
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      const y = cy + Math.sin(a) * r, x = cx + Math.cos(a) * r;
      ringO.push(addVert(m, x, y, out));
      ringI.push(addVert(m, x, y, inn));
    }
    for (let k = 0; k < N; k++) {
      const k2 = (k + 1) % N;
      addFace(m, [ringO[k], ringO[k2], ringI[k2], ringI[k]], TIRE);
    }
    addFace(m, ringO.slice(), CAP);
    addFace(m, ringI.slice().reverse(), CAP);
    const hub = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      hub.push(addVert(m, cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, out + side * 0.015));
    }
    addFace(m, hub, hubColor || '#b9b9c4');
  }

  function addWheels(m, frontX, rearX, trackZ, r, w, hubColor) {
    addWheel(m, frontX, r, trackZ, r, w, +1, hubColor);
    addWheel(m, frontX, r, -trackZ, r, w, -1, hubColor);
    addWheel(m, rearX, r, trackZ, r, w, +1, hubColor);
    addWheel(m, rearX, r, -trackZ, r, w, -1, hubColor);
  }

  function addMirrors(m, x, y, z, color) {
    addBox(m, x - 0.07, x + 0.07, y, y + 0.1, z - 0.09, z + 0.02, color);
    addBox(m, x - 0.07, x + 0.07, y, y + 0.1, -z - 0.02, -z + 0.09, color);
  }

  // Wing on two struts. Plank spans z ±plankZ at height wy..wy+0.06.
  function addWing(m, x0, x1, strutY0, wy, strutZ, plankZ, color) {
    const sx0 = x0 + (x1 - x0) * 0.3, sx1 = x0 + (x1 - x0) * 0.7;
    addBox(m, sx0, sx1, strutY0, wy, strutZ - 0.06, strutZ + 0.06, color);
    addBox(m, sx0, sx1, strutY0, wy, -strutZ - 0.06, -strutZ + 0.06, color);
    addBox(m, x0, x1, wy, wy + 0.06, -plankZ, plankZ, color);
  }

  /* ---------------- shared colors ---------------- */

  const GLASS = '#39566e', UNDER = '#16161c', INT = '#191922';
  const LIGHT = '#ffedb0', TAIL = '#c1132f', TRIM = '#26262e', CHROME = '#c4c8ce';

  function pal(body) { return { body, glass: GLASS, under: UNDER }; }

  /* ---------------- the 20 cars ---------------- */

  // 1993 Toyota Supra RZ (A80) — long curvy coupe, hoop wing, wide hips.
  function buildSupra() {
    const m = newMesh(), C = pal('#c22a35');
    loftBody(m, [
      S(-2.26, .30, .60, .90, .80, .88, .74),
      S(-1.60, .22, .60, 1.00, .84, .90, .78, { sw: 1, tw: 1 }),
      S(-0.90, .20, .58, 1.24, .84, .90, .64, { sw: 1 }),
      S(0.10, .20, .58, 1.27, .84, .90, .62, { sw: 1, tw: 1 }),
      S(0.70, .20, .58, .94, .84, .90, .80),
      S(1.80, .22, .50, .72, .82, .88, .76),
      S(2.26, .28, .42, .56, .74, .80, .68),
    ], C);
    addWheels(m, 1.35, -1.20, .80, .33, .24);
    addWing(m, -2.22, -1.86, .95, 1.24, .55, .86, C.body); // tall hoop wing
    addBox(m, -2.28, -2.24, .58, .78, -.68, .68, TAIL);
    addBox(m, 2.24, 2.29, .44, .53, -.62, -.24, LIGHT);
    addBox(m, 2.24, 2.29, .44, .53, .24, .62, LIGHT);
    addBox(m, 2.10, 2.30, .18, .30, -.78, .78, TRIM);
    addBox(m, -2.28, -2.10, .18, .30, -.78, .78, TRIM);
    addMirrors(m, 0.65, .92, .92, C.body);
    return m;
  }

  // 1992 Mazda RX-7 (FD3S) — very low, smooth, slim lip wing.
  function buildRx7() {
    const m = newMesh(), C = pal('#dfb93c');
    loftBody(m, [
      S(-2.15, .30, .58, .86, .76, .84, .70),
      S(-1.50, .22, .58, .96, .80, .87, .74, { sw: 1, tw: 1 }),
      S(-0.80, .20, .56, 1.20, .80, .875, .60, { sw: 1 }),
      S(0.05, .20, .56, 1.23, .80, .875, .58, { sw: 1, tw: 1 }),
      S(0.62, .20, .56, .88, .80, .875, .76),
      S(1.60, .22, .48, .64, .78, .85, .72),
      S(2.15, .30, .42, .52, .68, .76, .62),
    ], C);
    addWheels(m, 1.25, -1.18, .77, .32, .23);
    addWing(m, -2.13, -1.90, .90, 1.00, .50, .64, C.body);
    addBox(m, -2.17, -2.13, .56, .74, -.60, .60, TAIL);
    addBox(m, 2.13, 2.18, .42, .50, -.56, -.20, LIGHT);
    addBox(m, 2.13, 2.18, .42, .50, .20, .56, LIGHT);
    addBox(m, 2.00, 2.19, .18, .30, -.74, .74, TRIM);
    addBox(m, -2.17, -2.00, .18, .30, -.74, .74, TRIM);
    addMirrors(m, 0.55, .90, .89, C.body);
    return m;
  }

  // 1990 Honda NSX (NA1) — cab-forward mid-engine, black roof, full-width tail bar.
  function buildNsx() {
    const m = newMesh(), C = pal('#e7e8ec');
    const ROOF = '#15151a';
    loftBody(m, [
      S(-2.21, .28, .56, .88, .80, .88, .76),
      S(-1.30, .20, .56, .94, .84, .90, .78, { sw: 1, tw: 1 }),
      S(-0.55, .18, .54, 1.12, .84, .905, .60, { sw: 1, tc: ROOF }),
      S(0.35, .18, .54, 1.17, .84, .90, .58, { sw: 1, tw: 1 }),
      S(0.95, .18, .54, .80, .84, .90, .76),
      S(1.75, .20, .46, .60, .80, .86, .72),
      S(2.21, .26, .38, .50, .70, .78, .64),
    ], C);
    addWheels(m, 1.30, -1.23, .80, .31, .23);
    addBox(m, -2.23, -2.19, .56, .76, -.72, .72, TAIL);
    addBox(m, 2.19, 2.24, .40, .48, -.56, -.20, LIGHT);
    addBox(m, 2.19, 2.24, .40, .48, .20, .56, LIGHT);
    addBox(m, 2.06, 2.25, .16, .28, -.76, .76, TRIM);
    addBox(m, -2.23, -2.06, .16, .28, -.76, .76, TRIM);
    addMirrors(m, 0.30, .88, .91, C.body);
    return m;
  }

  // 1991 Nissan Skyline GT-R (R32) — crisp boxy coupe, trunk wing, four round tails.
  function buildR32() {
    const m = newMesh(), C = pal('#4b545e');
    loftBody(m, [
      S(-2.27, .32, .66, 1.00, .78, .84, .72),
      S(-1.45, .24, .66, 1.06, .82, .88, .74, { sw: 1, tw: 1 }),
      S(-0.80, .22, .62, 1.30, .82, .88, .62, { sw: 1 }),
      S(0.45, .22, .62, 1.34, .82, .88, .62, { sw: 1, tw: 1 }),
      S(1.05, .22, .62, 1.00, .82, .88, .76),
      S(2.00, .22, .54, .86, .80, .86, .72),
      S(2.27, .30, .46, .70, .72, .78, .66),
    ], C);
    addWheels(m, 1.35, -1.27, .78, .32, .23, '#9aa0a8');
    addWing(m, -2.15, -1.88, 1.06, 1.18, .58, .80, C.body);
    for (const z of [-.62, -.36, .26, .52]) {
      addBox(m, -2.29, -2.26, .72, .88, z, z + .10, TAIL);
    }
    addBox(m, 2.25, 2.30, .50, .62, -.60, -.22, LIGHT);
    addBox(m, 2.25, 2.30, .50, .62, .22, .60, LIGHT);
    addBox(m, 2.25, 2.29, .50, .60, -.16, .16, '#1c1c24');
    addBox(m, 2.12, 2.31, .22, .36, -.76, .76, TRIM);
    addBox(m, -2.31, -2.12, .22, .36, -.76, .76, TRIM);
    addMirrors(m, 0.95, .96, .90, C.body);
    return m;
  }

  // 1990 Mazda MX-5 Miata (NA) — tiny roadster, top down, open cockpit.
  function buildMiata() {
    const m = newMesh(), C = pal('#2767cd');
    loftBody(m, [
      S(-1.97, .28, .56, .82, .72, .80, .66),
      S(-1.15, .22, .56, .92, .76, .84, .70, { tc: INT }),   // cockpit
      S(0.30, .20, .55, 1.08, .76, .84, .58, { tw: 1 }),     // windshield
      S(0.62, .20, .55, .95, .76, .84, .62),
      S(1.55, .22, .48, .66, .74, .82, .68),
      S(1.97, .28, .40, .54, .66, .72, .60),
    ], C);
    addWheels(m, 1.13, -1.13, .72, .30, .21);
    addBox(m, -1.99, -1.95, .52, .68, -.56, -.30, TAIL);
    addBox(m, -1.99, -1.95, .52, .68, .30, .56, TAIL);
    addBox(m, 1.95, 2.00, .40, .47, -.50, -.20, LIGHT);
    addBox(m, 1.95, 2.00, .40, .47, .20, .50, LIGHT);
    addBox(m, 1.84, 2.01, .18, .30, -.68, .68, TRIM);
    addBox(m, -1.99, -1.84, .18, .30, -.68, .68, TRIM);
    addMirrors(m, 0.42, .82, .82, C.body);
    return m;
  }

  // 1994 BMW M3 (E36) coupé — three-box, kidney grille, quad lights.
  function buildE36() {
    const m = newMesh(), C = pal('#4c3ca6');
    loftBody(m, [
      S(-2.21, .30, .64, 1.00, .76, .82, .70),
      S(-1.35, .22, .64, 1.06, .80, .855, .72, { sw: 1, tw: 1 }),
      S(-0.70, .22, .60, 1.32, .80, .855, .60, { sw: 1 }),
      S(0.50, .22, .60, 1.35, .80, .855, .60, { sw: 1, tw: 1 }),
      S(1.10, .22, .60, .98, .80, .855, .74),
      S(1.95, .22, .52, .84, .78, .84, .70),
      S(2.21, .30, .44, .68, .70, .76, .62),
    ], C);
    addWheels(m, 1.35, -1.27, .77, .31, .22);
    addBox(m, -2.23, -2.19, .60, .80, -.66, -.26, TAIL);
    addBox(m, -2.23, -2.19, .60, .80, .26, .66, TAIL);
    addBox(m, 2.19, 2.24, .48, .60, -.60, -.20, LIGHT);
    addBox(m, 2.19, 2.24, .48, .60, .20, .60, LIGHT);
    addBox(m, 2.19, 2.23, .46, .58, -.15, -.03, '#1c1c24'); // kidneys
    addBox(m, 2.19, 2.23, .46, .58, .03, .15, '#1c1c24');
    addBox(m, 2.08, 2.26, .24, .40, -.76, .76, C.body);
    addBox(m, -2.26, -2.08, .24, .40, -.76, .76, C.body);
    addMirrors(m, 1.00, .96, .87, C.body);
    return m;
  }

  // 1992 Mercedes-Benz 500E (W124) — long executive sedan, big tails, chrome grille.
  function buildW124() {
    const m = newMesh(), C = pal('#3a3d46');
    loftBody(m, [
      S(-2.37, .32, .68, 1.06, .76, .82, .70),
      S(-1.45, .24, .68, 1.10, .80, .87, .74, { sw: 1, tw: 1 }),
      S(-0.75, .22, .64, 1.40, .80, .87, .62, { sw: 1 }),
      S(0.60, .22, .64, 1.43, .80, .87, .62, { sw: 1, tw: 1 }),
      S(1.25, .22, .64, 1.04, .80, .87, .76),
      S(2.10, .22, .56, .90, .78, .85, .72),
      S(2.37, .32, .46, .74, .70, .76, .64),
    ], C);
    addWheels(m, 1.40, -1.40, .78, .31, .22);
    addBox(m, -2.39, -2.35, .58, .84, -.70, -.24, TAIL);
    addBox(m, -2.39, -2.35, .58, .84, .24, .70, TAIL);
    addBox(m, 2.35, 2.40, .50, .64, -.62, -.26, LIGHT);
    addBox(m, 2.35, 2.40, .50, .64, .26, .62, LIGHT);
    addBox(m, 2.35, 2.40, .50, .66, -.20, .20, CHROME); // grille
    addBox(m, 2.24, 2.42, .26, .44, -.78, .78, TRIM);
    addBox(m, -2.42, -2.24, .26, .44, -.78, .78, TRIM);
    addBox(m, -1.9, 1.7, .50, .57, .855, .885, TRIM);
    addBox(m, -1.9, 1.7, .50, .57, -.885, -.855, TRIM);
    addMirrors(m, 1.12, 1.00, .89, C.body);
    return m;
  }

  // 1995 Volvo 850 T-5R estate — the brick: long roof, vertical tail lights, roof rails.
  function buildV850() {
    const m = newMesh(), C = pal('#e5d885');
    loftBody(m, [
      S(-2.33, .30, .66, 1.36, .78, .84, .66, { sw: 1 }),
      S(-1.95, .24, .66, 1.42, .80, .88, .64, { sw: 1 }),
      S(0.55, .22, .62, 1.42, .80, .88, .64, { sw: 1, tw: 1 }),
      S(1.15, .22, .62, 1.02, .80, .88, .76),
      S(2.05, .22, .54, .88, .78, .86, .72),
      S(2.33, .30, .46, .72, .70, .78, .64),
    ], C);
    addWheels(m, 1.33, -1.33, .78, .31, .22);
    addBox(m, -2.35, -2.31, .55, 1.30, -.76, -.62, TAIL); // vertical tails
    addBox(m, -2.35, -2.31, .55, 1.30, .62, .76, TAIL);
    addBox(m, 2.31, 2.36, .48, .62, -.60, -.24, LIGHT);
    addBox(m, 2.31, 2.36, .48, .62, .24, .60, LIGHT);
    addBox(m, 2.31, 2.35, .48, .60, -.18, .18, '#1c1c24');
    addBox(m, 2.20, 2.38, .24, .40, -.76, .76, TRIM);
    addBox(m, -2.38, -2.20, .24, .40, -.76, .76, TRIM);
    addBox(m, -2.05, .85, 1.43, 1.48, .48, .56, TRIM); // roof rails
    addBox(m, -2.05, .85, 1.43, 1.48, -.56, -.48, TRIM);
    addMirrors(m, 1.05, .98, .90, C.body);
    return m;
  }

  // 1993 VW Golf GTI (Mk3) — hot hatch, red grille stripe, chunky bumpers.
  function buildGolf() {
    const m = newMesh(), C = pal('#2f6444');
    loftBody(m, [
      S(-2.01, .28, .60, 1.24, .74, .82, .64, { sw: 1, tw: 1 }),
      S(-1.60, .22, .60, 1.40, .78, .845, .60, { sw: 1 }),
      S(0.40, .22, .60, 1.42, .78, .845, .60, { sw: 1, tw: 1 }),
      S(1.00, .22, .60, 1.00, .78, .845, .72),
      S(1.75, .24, .52, .86, .76, .83, .70),
      S(2.01, .30, .44, .70, .70, .78, .64),
    ], C);
    addWheels(m, 1.23, -1.23, .74, .30, .21);
    addBox(m, -2.03, -1.99, .62, 1.02, -.64, -.44, TAIL);
    addBox(m, -2.03, -1.99, .62, 1.02, .44, .64, TAIL);
    addBox(m, 1.99, 2.04, .48, .60, -.58, -.24, LIGHT);
    addBox(m, 1.99, 2.04, .48, .60, .24, .58, LIGHT);
    addBox(m, 1.99, 2.03, .50, .56, -.20, .20, '#1c1c24');
    addBox(m, 1.99, 2.035, .565, .59, -.24, .24, '#c8102e'); // GTI red stripe
    addBox(m, 1.90, 2.06, .24, .46, -.78, .78, TRIM);
    addBox(m, -2.06, -1.90, .24, .46, -.78, .78, TRIM);
    addBox(m, -1.76, -1.54, 1.42, 1.48, -.56, .56, C.body); // roof lip
    addMirrors(m, 0.92, .96, .86, C.body);
    return m;
  }

  // 1992 Honda Civic SiR (EG6) — short nose, arched roof, tall glass hatch.
  function buildCivic() {
    const m = newMesh(), C = pal('#20876b');
    loftBody(m, [
      S(-2.04, .26, .58, 1.10, .72, .80, .62, { sw: 1, tw: 1 }),
      S(-1.45, .22, .58, 1.33, .76, .85, .58, { sw: 1 }),
      S(0.10, .20, .56, 1.35, .76, .85, .58, { sw: 1, tw: 1 }),
      S(0.85, .20, .56, .92, .76, .85, .70),
      S(1.60, .22, .48, .76, .74, .83, .68),
      S(2.04, .28, .42, .62, .66, .74, .60),
    ], C);
    addWheels(m, 1.25, -1.25, .75, .30, .21);
    addBox(m, -2.06, -2.02, .60, .98, -.60, -.40, TAIL);
    addBox(m, -2.06, -2.02, .60, .98, .40, .60, TAIL);
    addBox(m, 2.02, 2.07, .44, .56, -.54, -.20, LIGHT);
    addBox(m, 2.02, 2.07, .44, .56, .20, .54, LIGHT);
    addBox(m, 1.92, 2.08, .22, .40, -.72, .72, TRIM);
    addBox(m, -2.08, -1.92, .22, .40, -.72, .72, TRIM);
    addMirrors(m, 0.78, .92, .86, C.body);
    return m;
  }

  // 1992 Lancia Delta HF Integrale Evo — boxy rally hatch, box flares, roof spoiler.
  function buildDelta() {
    const m = newMesh(), C = pal('#e2ddd0');
    loftBody(m, [
      S(-1.95, .28, .62, 1.22, .76, .84, .62, { sw: 1, tw: 1 }),
      S(-1.55, .24, .62, 1.34, .80, .885, .60, { sw: 1 }),
      S(0.35, .22, .60, 1.36, .80, .885, .60, { sw: 1, tw: 1 }),
      S(0.95, .22, .60, .98, .80, .885, .72),
      S(1.65, .24, .54, .86, .78, .86, .70),
      S(1.95, .30, .46, .72, .72, .78, .64),
    ], C);
    addWheels(m, 1.24, -1.24, .80, .30, .22, '#d8d8de');
    // box fender flares
    addBox(m, 0.90, 1.58, .30, .62, .86, .93, C.body);
    addBox(m, 0.90, 1.58, .30, .62, -.93, -.86, C.body);
    addBox(m, -1.58, -0.90, .30, .62, .86, .93, C.body);
    addBox(m, -1.58, -0.90, .30, .62, -.93, -.86, C.body);
    addBox(m, -1.97, -1.93, .64, 1.04, -.62, -.42, TAIL);
    addBox(m, -1.97, -1.93, .64, 1.04, .42, .62, TAIL);
    addBox(m, 1.93, 1.98, .48, .60, -.56, -.10, LIGHT); // quad lamps
    addBox(m, 1.93, 1.98, .48, .60, .10, .56, LIGHT);
    addBox(m, 1.85, 2.00, .24, .44, -.74, .74, TRIM);
    addBox(m, -2.00, -1.85, .24, .44, -.74, .74, TRIM);
    addBox(m, -1.70, -1.48, 1.36, 1.44, -.54, .54, C.body); // roof spoiler
    addMirrors(m, 0.88, .96, .90, C.body);
    return m;
  }

  // 1992 Ford Escort RS Cosworth — the whale tail.
  function buildCossie() {
    const m = newMesh(), C = pal('#26437e');
    loftBody(m, [
      S(-2.10, .28, .60, 1.22, .74, .82, .62, { sw: 1, tw: 1 }),
      S(-1.65, .22, .60, 1.38, .78, .87, .60, { sw: 1 }),
      S(0.35, .22, .60, 1.42, .78, .87, .60, { sw: 1, tw: 1 }),
      S(0.95, .22, .60, 1.00, .78, .87, .72),
      S(1.75, .24, .52, .84, .76, .85, .70),
      S(2.10, .30, .44, .68, .70, .77, .62),
    ], C);
    addWheels(m, 1.27, -1.27, .78, .31, .22);
    addWing(m, -2.10, -1.72, 1.24, 1.54, .44, .78, C.body); // whale tail
    addBox(m, -2.12, -2.08, .62, 1.00, -.62, -.42, TAIL);
    addBox(m, -2.12, -2.08, .62, 1.00, .42, .62, TAIL);
    addBox(m, 2.08, 2.13, .46, .58, -.56, -.22, LIGHT);
    addBox(m, 2.08, 2.13, .46, .58, .22, .56, LIGHT);
    addBox(m, 1.98, 2.14, .24, .44, -.74, .74, TRIM);
    addBox(m, -2.14, -1.98, .24, .44, -.74, .74, TRIM);
    addMirrors(m, 0.88, .96, .89, C.body);
    return m;
  }

  // 1994 Subaru Impreza WRX — sedan, hood scoop, small trunk wing, gold wheels.
  function buildImpreza() {
    const m = newMesh(), C = pal('#2953b0');
    loftBody(m, [
      S(-2.17, .30, .64, 1.00, .74, .80, .68),
      S(-1.40, .24, .64, 1.05, .78, .845, .72, { sw: 1, tw: 1 }),
      S(-0.75, .22, .60, 1.36, .78, .845, .60, { sw: 1 }),
      S(0.45, .22, .60, 1.40, .78, .845, .60, { sw: 1, tw: 1 }),
      S(1.05, .22, .60, 1.00, .78, .845, .72),
      S(1.90, .22, .52, .86, .76, .82, .68),
      S(2.17, .30, .44, .70, .68, .75, .62),
    ], C);
    addWheels(m, 1.26, -1.26, .76, .31, .22, '#c9a437'); // gold
    addBox(m, 1.15, 1.55, .96, 1.06, -.18, .18, C.body); // hood scoop
    addWing(m, -2.05, -1.78, 1.00, 1.12, .50, .70, C.body);
    addBox(m, -2.19, -2.15, .62, .82, -.62, -.24, TAIL);
    addBox(m, -2.19, -2.15, .62, .82, .24, .62, TAIL);
    addBox(m, 2.15, 2.20, .48, .60, -.58, -.22, LIGHT);
    addBox(m, 2.15, 2.20, .48, .60, .22, .58, LIGHT);
    addBox(m, 2.04, 2.22, .24, .42, -.74, .74, TRIM);
    addBox(m, -2.22, -2.04, .24, .42, -.74, .74, TRIM);
    addMirrors(m, 0.95, .94, .86, C.body);
    return m;
  }

  // 1992 Dodge Viper RT/10 — roadster: giant hood, open cockpit, side pipes.
  function buildViper() {
    const m = newMesh(), C = pal('#d0202e');
    loftBody(m, [
      S(-2.22, .26, .54, .84, .84, .92, .74),
      S(-1.35, .20, .54, .92, .88, .96, .78, { tc: INT }),   // cockpit
      S(0.25, .18, .52, 1.02, .88, .96, .60, { tw: 1 }),     // windshield
      S(0.60, .18, .52, .90, .88, .96, .64),
      S(1.70, .20, .46, .68, .84, .92, .72),
      S(2.22, .26, .38, .52, .72, .80, .62),
    ], C);
    addWheels(m, 1.22, -1.22, .84, .33, .26);
    addBox(m, -0.90, 1.00, .30, .42, .93, 1.00, CHROME); // side pipes
    addBox(m, -0.90, 1.00, .30, .42, -1.00, -.93, CHROME);
    addBox(m, -2.24, -2.20, .52, .70, -.62, -.30, TAIL);
    addBox(m, -2.24, -2.20, .52, .70, .30, .62, TAIL);
    addBox(m, 2.20, 2.25, .38, .46, -.54, -.22, LIGHT);
    addBox(m, 2.20, 2.25, .38, .46, .22, .54, LIGHT);
    addBox(m, 2.08, 2.26, .16, .28, -.80, .80, TRIM);
    addMirrors(m, 0.40, .80, .94, C.body);
    return m;
  }

  // 1995 Porsche 911 Carrera (993) — fastback rear, full-width tail bar.
  function build993() {
    const m = newMesh(), C = pal('#b9bcc2');
    loftBody(m, [
      S(-2.13, .30, .60, .86, .76, .84, .70),
      S(-1.55, .24, .60, 1.02, .80, .87, .72, { sw: 1, tw: 1 }),
      S(-0.75, .22, .58, 1.26, .80, .87, .60, { sw: 1 }),
      S(0.20, .22, .58, 1.30, .80, .87, .58, { sw: 1, tw: 1 }),
      S(0.80, .22, .58, .96, .80, .87, .74),
      S(1.60, .24, .50, .74, .78, .85, .70),
      S(2.13, .30, .42, .58, .70, .78, .62),
    ], C);
    addWheels(m, 1.30, -1.00, .78, .31, .23);
    addBox(m, -2.15, -2.11, .56, .76, -.70, .70, '#b8272f'); // full-width tail
    addBox(m, 2.11, 2.16, .44, .54, -.54, -.24, LIGHT);
    addBox(m, 2.11, 2.16, .44, .54, .24, .54, LIGHT);
    addBox(m, 2.00, 2.17, .20, .32, -.74, .74, TRIM);
    addBox(m, -2.17, -2.00, .20, .32, -.74, .74, TRIM);
    addMirrors(m, 0.62, .92, .89, C.body);
    return m;
  }

  // 1990 Lamborghini Diablo — extreme wedge, huge width, side intakes.
  function buildDiablo() {
    const m = newMesh(), C = pal('#7a34ad');
    loftBody(m, [
      S(-2.23, .24, .52, .96, .90, 1.00, .80),
      S(-1.35, .18, .50, 1.00, .92, 1.02, .72, { sw: 1, tw: 1 }),
      S(-0.60, .16, .48, 1.10, .92, 1.02, .56, { sw: 1 }),
      S(0.10, .16, .48, 1.10, .92, 1.02, .54, { sw: 1, tw: 1 }),
      S(1.10, .16, .46, .70, .90, 1.00, .72),
      S(2.23, .22, .34, .44, .76, .86, .64),
    ], C);
    addWheels(m, 1.30, -1.35, .90, .31, .26);
    addBox(m, -0.90, -0.30, .50, .62, .96, 1.03, TRIM); // NACA intakes
    addBox(m, -0.90, -0.30, .50, .62, -1.03, -.96, TRIM);
    addBox(m, -2.25, -2.21, .40, .84, -.80, .80, '#1c1c24'); // rear grille panel
    addBox(m, -2.26, -2.22, .60, .78, -.76, -.44, TAIL);
    addBox(m, -2.26, -2.22, .60, .78, .44, .76, TAIL);
    addBox(m, 2.21, 2.26, .30, .38, -.52, -.20, LIGHT);
    addBox(m, 2.21, 2.26, .30, .38, .20, .52, LIGHT);
    addMirrors(m, 0.28, .84, 1.00, C.body);
    return m;
  }

  // 1994 Ferrari F355 Berlinetta — low wedge, side intakes, quad round tails.
  function buildF355() {
    const m = newMesh(), C = pal('#d42a24');
    loftBody(m, [
      S(-2.12, .26, .54, .92, .84, .92, .76),
      S(-1.30, .20, .52, .98, .86, .95, .74, { sw: 1, tw: 1 }),
      S(-0.55, .18, .50, 1.12, .86, .95, .58, { sw: 1 }),
      S(0.15, .18, .50, 1.14, .86, .95, .56, { sw: 1, tw: 1 }),
      S(0.85, .18, .50, .78, .86, .95, .72),
      S(1.75, .20, .42, .60, .82, .90, .68),
      S(2.12, .24, .34, .48, .72, .80, .60),
    ], C);
    addWheels(m, 1.22, -1.23, .84, .31, .24);
    addBox(m, -0.75, -0.25, .45, .60, .90, .97, TRIM); // side intakes
    addBox(m, -0.75, -0.25, .45, .60, -.97, -.90, TRIM);
    for (const z of [-.60, -.38, .28, .50]) {
      addBox(m, -2.14, -2.11, .62, .76, z, z + .10, TAIL);
    }
    addBox(m, 2.10, 2.15, .34, .42, -.52, -.20, LIGHT);
    addBox(m, 2.10, 2.15, .34, .42, .20, .52, LIGHT);
    addBox(m, 2.00, 2.16, .16, .26, -.72, .72, TRIM);
    addMirrors(m, 0.35, .82, .94, C.body);
    return m;
  }

  // 1993 McLaren F1 — narrow center cabin, roof snorkel intake, papaya.
  function buildMcF1() {
    const m = newMesh(), C = pal('#e07820');
    loftBody(m, [
      S(-2.14, .24, .50, .86, .80, .88, .70),
      S(-1.30, .18, .48, .96, .84, .91, .68, { sw: 1, tw: 1 }),
      S(-0.45, .16, .46, 1.14, .84, .91, .52, { sw: 1 }),
      S(0.30, .16, .46, 1.14, .84, .91, .50, { sw: 1, tw: 1 }),
      S(1.00, .16, .46, .72, .84, .91, .68),
      S(1.75, .18, .40, .56, .78, .86, .62),
      S(2.14, .22, .32, .44, .68, .76, .56),
    ], C);
    addWheels(m, 1.36, -1.36, .80, .31, .24);
    addBox(m, -0.45, -0.05, 1.14, 1.24, -.10, .10, C.body); // roof snorkel
    addBox(m, -2.16, -2.12, .54, .72, -.60, -.30, TAIL);
    addBox(m, -2.16, -2.12, .54, .72, .30, .60, TAIL);
    addBox(m, 2.12, 2.17, .32, .40, -.50, -.18, LIGHT);
    addBox(m, 2.12, 2.17, .32, .40, .18, .50, LIGHT);
    addBox(m, 2.02, 2.18, .14, .24, -.70, .70, TRIM);
    addMirrors(m, 0.30, .84, .90, C.body);
    return m;
  }

  // 1993 Jeep Cherokee (XJ) — pure box, long glasshouse, roof rack, cladding.
  function buildXj() {
    const m = newMesh(), C = pal('#355744');
    loftBody(m, [
      S(-2.12, .40, .80, 1.58, .76, .84, .68, { sw: 1 }),
      S(-1.60, .36, .80, 1.62, .78, .895, .66, { sw: 1 }),
      S(0.55, .36, .78, 1.63, .78, .895, .66, { sw: 1, tw: 1 }),
      S(1.10, .36, .78, 1.16, .78, .895, .74),
      S(1.90, .36, .70, 1.06, .76, .87, .70),
      S(2.12, .42, .60, .94, .70, .78, .64),
    ], C);
    addWheels(m, 1.29, -1.29, .80, .36, .25);
    addBox(m, -2.14, -2.10, .60, 1.20, -.70, -.52, TAIL);
    addBox(m, -2.14, -2.10, .60, 1.20, .52, .70, TAIL);
    addBox(m, 2.10, 2.15, .62, .78, -.56, -.24, LIGHT);
    addBox(m, 2.10, 2.15, .62, .78, .24, .56, LIGHT);
    addBox(m, 2.10, 2.14, .62, .76, -.18, .18, '#1c1c24');
    addBox(m, 2.00, 2.16, .34, .52, -.76, .76, TRIM);
    addBox(m, -2.16, -2.00, .34, .52, -.76, .76, TRIM);
    addBox(m, -1.9, 1.7, .36, .52, .87, .91, TRIM);  // lower cladding
    addBox(m, -1.9, 1.7, .36, .52, -.91, -.87, TRIM);
    addBox(m, -1.95, .40, 1.64, 1.70, .48, .56, TRIM); // roof rack
    addBox(m, -1.95, .40, 1.64, 1.70, -.56, -.48, TRIM);
    addMirrors(m, 1.05, 1.10, .90, TRIM);
    return m;
  }

  // 1991 Toyota Previa — the egg van: one-box, huge windshield.
  function buildPrevia() {
    const m = newMesh(), C = pal('#9fb4bd');
    loftBody(m, [
      S(-2.37, .34, .80, 1.50, .74, .82, .62, { sw: 1 }),
      S(-1.90, .28, .82, 1.72, .80, .90, .66, { sw: 1 }),
      S(0.30, .26, .82, 1.75, .80, .90, .68, { sw: 1, tw: 1 }),
      S(1.30, .26, .80, 1.20, .80, .90, .74),
      S(2.00, .28, .66, .98, .76, .86, .68),
      S(2.37, .36, .52, .76, .66, .74, .58),
    ], C);
    addWheels(m, 1.43, -1.43, .78, .32, .23);
    addBox(m, -2.39, -2.35, .60, 1.30, -.72, -.56, TAIL);
    addBox(m, -2.39, -2.35, .60, 1.30, .56, .72, TAIL);
    addBox(m, 2.35, 2.40, .52, .68, -.56, -.22, LIGHT);
    addBox(m, 2.35, 2.40, .52, .68, .22, .56, LIGHT);
    addBox(m, 2.26, 2.41, .28, .44, -.72, .72, TRIM);
    addBox(m, -2.41, -2.26, .28, .44, -.72, .72, TRIM);
    addMirrors(m, 1.55, 1.10, .88, TRIM);
    return m;
  }

  /* ---------------- OBJ / MTL export ---------------- */

  function hexRgb(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }

  function toObj(mesh, name) {
    const mats = [], matOf = {};
    for (const f of mesh.faces) {
      if (!(f.color in matOf)) { matOf[f.color] = 'm' + mats.length; mats.push(f.color); }
    }
    let obj = `# ${name} — low-poly '90s car\nmtllib ${name}.mtl\no ${name}\n`;
    for (const [x, y, z] of mesh.verts) {
      obj += `v ${x.toFixed(4)} ${y.toFixed(4)} ${z.toFixed(4)}\n`;
    }
    let cur = null;
    for (const f of mesh.faces) {
      const mn = matOf[f.color];
      if (mn !== cur) { obj += `usemtl ${mn}\n`; cur = mn; }
      obj += 'f ' + f.idx.map((i) => i + 1).join(' ') + '\n';
    }
    let mtl = `# materials for ${name}\n`;
    mats.forEach((hex, i) => {
      const [r, g, b] = hexRgb(hex);
      mtl += `newmtl m${i}\nKd ${(r / 255).toFixed(4)} ${(g / 255).toFixed(4)} ${(b / 255).toFixed(4)}\nKa 0 0 0\nKs 0.1 0.1 0.1\nNs 12\n`;
    });
    return { obj, mtl };
  }

  /* ---------------- catalog ---------------- */

  const cars = [
    { id: 'tsubasa_gtz', name: "'93 Tsubasa GT-Z", basis: 'Toyota Supra RZ (A80)', year: 1993, category: 'sports', price: 40000, color: '#c22a35', build: buildSupra },
    { id: 'akagi_rs', name: "'92 Akagi RS", basis: 'Mazda RX-7 (FD3S)', year: 1992, category: 'sports', price: 32000, color: '#dfb93c', build: buildRx7 },
    { id: 'meiko_nx', name: "'90 Meiko NX", basis: 'Honda NSX (NA1)', year: 1990, category: 'sports', price: 62000, color: '#e7e8ec', build: buildNsx },
    { id: 'kaminari_32r', name: "'91 Kaminari 32R", basis: 'Nissan Skyline GT-R (R32)', year: 1991, category: 'sports', price: 35000, color: '#4b545e', build: buildR32 },
    { id: 'sorella_na', name: "'90 Sorella Roadster", basis: 'Mazda MX-5 Miata (NA)', year: 1990, category: 'roadster', price: 14000, color: '#2767cd', build: buildMiata },
    { id: 'bergmann_mc', name: "'94 Bergmann M-C", basis: 'BMW M3 (E36) coupé', year: 1994, category: 'coupe', price: 38000, color: '#4c3ca6', build: buildE36 },
    { id: 'kaiser_500', name: "'92 Kaiser 500", basis: 'Mercedes-Benz 500E (W124)', year: 1992, category: 'sedan', price: 75000, color: '#3a3d46', build: buildW124 },
    { id: 'bricklund_t8', name: "'95 Bricklund T-8", basis: 'Volvo 850 T-5R estate', year: 1995, category: 'wagon', price: 32000, color: '#e5d885', build: buildV850 },
    { id: 'pronto_gti', name: "'93 Pronto GTi", basis: 'VW Golf GTI (Mk3)', year: 1993, category: 'hatch', price: 15000, color: '#2f6444', build: buildGolf },
    { id: 'hachi_si', name: "'92 Hachi Si", basis: 'Honda Civic SiR (EG6)', year: 1992, category: 'hatch', price: 13000, color: '#20876b', build: buildCivic },
    { id: 'stradale_evo', name: "'92 Stradale Evo", basis: 'Lancia Delta HF Integrale Evo', year: 1992, category: 'rally', price: 34000, color: '#e2ddd0', build: buildDelta },
    { id: 'whitworth_rs', name: "'92 Whitworth RS", basis: 'Ford Escort RS Cosworth', year: 1992, category: 'rally', price: 30000, color: '#26437e', build: buildCossie },
    { id: 'hokkaido_rx', name: "'94 Hokkaido RX", basis: 'Subaru Impreza WRX', year: 1994, category: 'rally', price: 22000, color: '#2953b0', build: buildImpreza },
    { id: 'copperhead_v10', name: "'92 Copperhead V10", basis: 'Dodge Viper RT/10', year: 1992, category: 'roadster', price: 55000, color: '#d0202e', build: buildViper },
    { id: 'neunelf_36', name: "'95 Neunelf 3.6", basis: 'Porsche 911 Carrera (993)', year: 1995, category: 'sports', price: 68000, color: '#b9bcc2', build: build993 },
    { id: 'toro_nero', name: "'90 Toro Nero", basis: 'Lamborghini Diablo', year: 1990, category: 'supercar', price: 240000, color: '#7a34ad', build: buildDiablo },
    { id: 'rosso_35', name: "'94 Rosso 3.5", basis: 'Ferrari F355 Berlinetta', year: 1994, category: 'supercar', price: 130000, color: '#d42a24', build: buildF355 },
    { id: 'apex_one', name: "'93 Apex One", basis: 'McLaren F1', year: 1993, category: 'supercar', price: 815000, color: '#e07820', build: buildMcF1 },
    { id: 'frontier_scout', name: "'93 Frontier Scout", basis: 'Jeep Cherokee (XJ)', year: 1993, category: 'suv', price: 18000, color: '#355744', build: buildXj },
    { id: 'orbit_lx', name: "'91 Orbit LX", basis: 'Toyota Previa', year: 1991, category: 'van', price: 24000, color: '#9fb4bd', build: buildPrevia },
  ];

  const api = { cars, toObj };
  if (typeof window !== 'undefined') window.NINETIES_CARS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
