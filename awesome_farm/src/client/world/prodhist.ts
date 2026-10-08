// What the farm's machines have made: the running totals the server sends, and a history of snapshots for the Journal's
// factory report (items a minute, a bar per sample).

/** A snapshot every PROD_SAMPLE game-seconds, the last 20 minutes. */
const PROD_SAMPLE = 10, PROD_KEEP = 120;

export class ProdHistory {
    /** Items the farm's machines have made so far (for production goals). */
    map: Record<string, number> = {};
    private hist: { t: number; p: Record<string, number> }[] = [];

    /** A new world: its totals, and a fresh history. */
    reset (map: Record<string, number>, time: number) {
        this.map = map;
        this.hist = [];
        this.sample(time);
    }

    /** A tick brought new totals. */
    set (map: Record<string, number>, time: number) {
        this.map = map;
        this.sample(time);
    }

    private sample (t: number) {
        const last = this.hist[this.hist.length - 1];
        if (last && t - last.t < PROD_SAMPLE) return;
        this.hist.push({ t, p: { ...this.map } });
        if (this.hist.length > PROD_KEEP) this.hist.shift();
    }

    /** Per-item production over the recent past: items per minute and a bar history (oldest first). */
    rates (time: number, bars = 24): { item: string; total: number; perMin: number; bars: number[] }[] {
        const h = this.hist, now = this.map;
        const out: { item: string; total: number; perMin: number; bars: number[] }[] = [];
        const span = Math.min(h.length - 1, 30);                    // look back at most ~5 minutes for the rate
        const base = span > 0 ? h[h.length - 1 - span] : undefined;
        const dt = base ? Math.max(1, time - base.t) : 0;
        for (const [item, total] of Object.entries(now)) {
            const perMin = base && dt > 0 ? Math.max(0, total - (base.p[item] ?? 0)) / dt * 60 : 0;
            const bs: number[] = [];
            for (let i = Math.max(1, h.length - bars); i < h.length; i++) bs.push(Math.max(0, (h[i].p[item] ?? 0) - (h[i - 1].p[item] ?? 0)));
            const lastBar = total - (h.length ? h[h.length - 1].p[item] ?? 0 : 0);   // what has come since the last snapshot
            if (h.length) bs.push(Math.max(0, lastBar));
            out.push({ item, total, perMin, bars: bs.slice(-bars) });
        }
        return out.sort((a, b) => b.perMin - a.perMin || b.total - a.total);
    }
}
