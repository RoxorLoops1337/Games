// A recording stand-in for CanvasRenderingContext2D so render modules can be exercised headless.
// Usage: const ctx = makeCtx(); draw(ctx, ...); ctx.calls.length; ctx.assertClean() checks no NaN/Infinity reached the API
// and that save/restore balanced.
export function makeCtx(w = 390, h = 800) {
  const calls = []; let depth = 0, minDepth = 0; const bad = [];
  const grad = () => ({ addColorStop() {} });
  const state = { canvas: { width: w, height: h }, globalAlpha: 1, globalCompositeOperation: 'source-over', font: '10px sans-serif' };
  const num = (v) => typeof v === 'number' && !Number.isFinite(v);
  const handler = {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'calls') return calls;
      if (k === 'assertClean') return () => { if (bad.length) throw new Error('non-finite args: ' + bad.slice(0, 3).join(' | ')); if (depth !== 0) throw new Error('save/restore unbalanced: ' + depth); if (minDepth < 0) throw new Error('restore without save'); };
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createConicGradient') return grad;
      if (k === 'createPattern') return () => ({});
      if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (k === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      if (k === 'getImageData') return (x, y, ww, hh) => ({ data: new Uint8ClampedArray(Math.max(0, ww * hh * 4)), width: ww, height: hh });
      return (...a) => {
        if (k === 'save') depth++; else if (k === 'restore') { depth--; minDepth = Math.min(minDepth, depth); }
        if (a.some(num)) bad.push(String(k) + '(' + a.join(',') + ')');
        calls.push(k);
      };
    },
    set(t, k, v) { if (num(v)) bad.push('set ' + String(k)); t[k] = v; return true; },
  };
  return new Proxy(state, handler);
}
