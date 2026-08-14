/* THE SHAPES FROSTFELL IS CHECKED AT — one list, two consumers.

   The render suite drove eight shapes and the shot walk drove whatever the
   closing ritual happened to name, which was three. That gap is not academic:
   the overlap check added last round found a live defect on the VICTORY screen
   at 653x280 — a fold's cover display — and no shot walk had ever been taken at
   that shape, so nothing anyone LOOKED at could have shown it. The stub found
   it because the stub was the only thing there.

   Two lists maintained by discipline drift the moment one round is busy. One
   list imported by both cannot: `tests/frostfell_render.test.mjs` sweeps every
   entry, and `tools/frostfell/shots.mjs --all` photographs every entry. Adding
   a shape here adds it to both, and the render suite asserts it is using this
   file rather than a copy of it.

   `phone` marks the ones that are real devices rather than window sizes, and
   carries the pixel ratio and touch emulation the walk needs — a desktop
   Chromium at 844x390 is not an iPhone 14, and the text floor behaves
   differently on one. */
export const SHAPES = [
  { w: 1280, h: 720, name: 'the reference desktop' },
  { w: 1560, h: 720, name: 'a wide desktop' },
  { w: 1600, h: 720, name: 'wider still' },
  { w: 2400, h: 1080, name: 'a large landscape display' },
  { w: 1024, h: 768, name: 'a squat tablet' },
  { w: 667, h: 375, dpr: 2, phone: 'iphone-se', name: 'iPhone SE, landscape' },
  { w: 844, h: 390, dpr: 3, phone: 'iphone-14', name: 'iPhone 14, landscape' },
  { w: 892, h: 412, dpr: 2.6, phone: 'pixel-7', name: 'Pixel 7, landscape' },
  { w: 653, h: 280, dpr: 3, phone: 'galaxy-fold', name: 'Galaxy Fold cover, landscape' },
];

/** Just the dimensions, in the order above — what a sweep wants. */
export const SIZES = SHAPES.map((s) => [s.w, s.h]);

/** The devices, keyed the way `--phone <name>` names them. */
export const PHONES = Object.fromEntries(SHAPES.filter((s) => s.phone)
  .map((s) => [s.phone, { w: s.w, h: s.h, dpr: s.dpr, name: s.name }]));
