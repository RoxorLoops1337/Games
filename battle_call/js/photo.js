// Battle Call: shrinking a beatboxer's photo to the square the app shows. Faces sit in the top of portrait photos, so a
// plain centre crop cuts the head off. Where the browser can find faces (FaceDetector) the square is centred on the
// face; otherwise a portrait keeps its top part.

/** The square [x, y, side] to cut out of a w x h picture. `face` is an optional {x, y, width, height} box. */
export function cropBox(w, h, face) {
  const side = Math.min(w, h);
  let cx = w / 2, cy = h / 2;
  if (face) { cx = face.x + face.width / 2; cy = face.y + face.height / 2 + side * 0.06; } // a little room for the hair, shoulders
  else if (h > w) cy = side * 0.5 + (h - side) * 0.18; // portrait: stay near the top
  const x = Math.max(0, Math.min(w - side, cx - side / 2)), y = Math.max(0, Math.min(h - side, cy - side / 2));
  return { x, y, side };
}

export async function shrink(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  let face = null;
  try {
    if ('FaceDetector' in window) {
      const f = await new window.FaceDetector({ fastMode: true, maxDetectedFaces: 3 }).detect(bmp);
      if (f.length) face = f.map((r) => r.boundingBox).sort((a, b) => b.width * b.height - a.width * a.height)[0];
    }
  } catch (_) { /* no detector: fall back to the top-biased crop */ }
  const { x, y, side } = cropBox(bmp.width, bmp.height, face), c = document.createElement('canvas');
  c.width = c.height = 480;
  c.getContext('2d').drawImage(bmp, x, y, side, side, 0, 0, 480, 480);
  for (const q of [0.84, 0.72, 0.6, 0.48]) {
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', q));
    if (blob && blob.size < 150 * 1024) return blob;
  }
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.4));
}
