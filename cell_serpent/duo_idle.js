// 02-animal-art (round 7): idle life for the single duo picture. The picture is cut into two columns (R and J, there is
// an empty gap between them) and eight rows. Each column leans and dips on its own phase, heads move most and the feet
// stay planted, so R and J sway like two people instead of one sticker. A beat nod dips both heads together.
// No allocations: pure arithmetic and a fixed number of drawImage calls (2 columns x 8 rows).
const ROWS = 8;

// ctx is already translated to the picture centre (and rotated). w, h: drawn size. t: seconds.
// nod 0..1: beat dip. amp 0..1: how much life (0 while reduced motion).
export function drawDuoLife(ctx, im, w, h, t, nod, amp) {
  const W = im.width, H = im.height, hw = W / 2, rh = H / ROWS;
  for (let col = 0; col < 2; col++) {
    const ph = col ? 1.9 : 0;
    const lean = Math.sin(t * 1.25 + ph) * 2.8 * amp;
    const dip = ((Math.sin(t * 2.3 + ph * 1.3) * 0.5 + 0.5) * 1.8 + nod * (col ? 2.8 : 3.4)) * amp;
    const sx = col * hw, dx = -w / 2 + col * hw * (w / W), dw = hw * (w / W);
    let y0 = -h / 2 + dip, x0 = lean;
    for (let r = 1; r <= ROWS; r++) {
      const f = r / ROWS, k = 1 - f, y1 = -h / 2 + f * h + dip * k * k, x1 = lean * k * k;
      ctx.drawImage(im, sx, (r - 1) * rh, hw, rh + (r < ROWS ? 0.7 : 0), dx + (x0 + x1) * 0.5, y0, dw, y1 - y0 + (r < ROWS ? 0.5 : 0));
      y0 = y1; x0 = x1;
    }
  }
}
