// Run-length + base64 packing for chunk layers (works in browsers, Node and Workers).
export function rle(bytes) {
  const out = [];
  let i = 0;
  while (i < bytes.length) {
    const v = bytes[i];
    let n = 1;
    while (i + n < bytes.length && bytes[i + n] === v && n < 255) n++;
    out.push(v, n);
    i += n;
  }
  return Uint8Array.from(out);
}
export function unrle(src, size) {
  const out = new Uint8Array(size);
  let o = 0;
  for (let i = 0; i + 1 < src.length && o < size; i += 2) {
    const v = src[i], n = src[i + 1];
    out.fill(v, o, Math.min(size, o + n));
    o += n;
  }
  return out;
}
export function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
export function packLayers(fg, bg, liq) {
  const all = new Uint8Array(fg.length * 3);
  all.set(fg, 0); all.set(bg, fg.length); all.set(liq, fg.length * 2);
  return toB64(rle(all));
}
export function unpackLayers(b64, n) {
  const all = unrle(fromB64(b64), n * 3);
  return { fg: all.slice(0, n), bg: all.slice(n, n * 2), liq: all.slice(n * 2) };
}
