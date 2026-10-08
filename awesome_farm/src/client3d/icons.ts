// Item icons as data URLs, drawn from the 2D game's icon grids.
import { CHAR } from '../shared/palette';
import { iconGrids } from '../client/art/icons';
import type { Grid } from '../client/art/pixels';

export const INK = 0x2a1d2c;
export let grids: Record<string, Grid> | null = null;
export const cache = new Map<string, string>();
export function iconUrl(key: string, scale = 3) {
    const id = `${key}@${scale}`, hit = cache.get(id);
    if (hit !== undefined) return hit;
    grids ??= iconGrids();
    const g = grids[key.startsWith('i_') || key.startsWith('k_') ? key : `i_${key}`];
    if (!g) {
        cache.set(id, '');
        return '';
    }
    const w = g[0].length + 2, h = g.length + 2, c = document.createElement('canvas');
    c.width = w * scale;
    c.height = h * scale;
    const x = c.getContext('2d')!;
    const solid = (px: number, py: number) => {
        const r = g[py - 1];
        return !!r && px >= 1 && px <= r.length && r[px - 1] !== '.';
    };
    const fill = (px: number, py: number, hex: number) => {
        x.fillStyle = '#' + hex.toString(16).padStart(6, '0');
        x.fillRect(px * scale, py * scale, scale, scale);
    };
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
        if (solid(px, py)) fill(px, py, CHAR[g[py - 1][px - 1]] ?? INK);
        else if (solid(px - 1, py) || solid(px + 1, py) || solid(px, py - 1) || solid(px, py + 1)) fill(px, py, INK);
    }
    const url = c.toDataURL();
    cache.set(id, url);
    return url;
}
