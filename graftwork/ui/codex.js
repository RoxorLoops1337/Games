// PLACEHOLDER screen (owner replaces).
import { COL } from './core.js';
export default {
  enter(app, params) { this.p = params; },
  draw(app) {
    const g = app.ctx; g.fillStyle = COL.slab; g.fillRect(0, 0, app.w, app.h);
    app.text('codex (placeholder)', 640, 300, { size: 32, align: 'center' });
    if (app.button('Back to title', 540, 380, 200, 50)) app.shared.flow.toTitle();
  },
};
