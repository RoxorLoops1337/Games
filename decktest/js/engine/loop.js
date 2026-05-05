window.Decktest = window.Decktest || {};

(function () {
  function start({ update, render, fixedDt }) {
    fixedDt = fixedDt || 1 / 60;
    let last = performance.now() / 1000;
    let acc = 0;
    let running = true;

    function frame(now) {
      if (!running) return;
      const t = now / 1000;
      let dt = t - last;
      last = t;
      if (dt > 0.25) dt = 0.25;
      acc += dt;
      while (acc >= fixedDt) {
        update(fixedDt);
        acc -= fixedDt;
      }
      render(acc / fixedDt);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    return { stop() { running = false; } };
  }

  Decktest.loop = { start };
})();
