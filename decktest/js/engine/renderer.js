window.Decktest = window.Decktest || {};

(function () {
  function makeRenderer(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    function clear(color) {
      ctx.fillStyle = color || '#050509';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    function rect(x, y, w, h, color) {
      ctx.fillStyle = color;
      ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
    }

    function strokeRect(x, y, w, h, color, lineWidth) {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth || 1;
      ctx.strokeRect((x | 0) + 0.5, (y | 0) + 0.5, w | 0, h | 0);
    }

    function text(str, x, y, opts) {
      const o = opts || {};
      ctx.fillStyle = o.color || '#e8e8f0';
      ctx.font = o.font || '12px ui-monospace, Menlo, Consolas, monospace';
      ctx.textAlign = o.align || 'left';
      ctx.textBaseline = o.baseline || 'top';
      ctx.fillText(str, x, y);
    }

    function hpBar(x, y, w, h, ratio, color) {
      ratio = Math.max(0, Math.min(1, ratio));
      rect(x, y, w, h, '#1a1a26');
      rect(x + 1, y + 1, (w - 2) * ratio, h - 2, color || '#4ade80');
      strokeRect(x, y, w, h, '#000');
    }

    return { ctx, canvas, clear, rect, strokeRect, text, hpBar };
  }

  Decktest.renderer = { makeRenderer };
})();
