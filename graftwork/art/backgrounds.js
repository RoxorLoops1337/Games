// STUB. drawBackground(ctx, theme, t) paints the whole 1280x720 stage.
// themes: ward market theatre (combat per act) | map1 map2 map3 | title table shop forge event | win lose
import { COL } from '../ui/core.js';
const TINT = { ward: '#2F4A3A', market: '#3A2A1E', theatre: '#1E1630', map1: '#2F4A3A', map2: '#3A2A1E', map3: '#1E1630' };
export function drawBackground(ctx, theme, t = 0) { ctx.fillStyle = TINT[theme] || COL.slab; ctx.fillRect(0, 0, 1280, 720); }
