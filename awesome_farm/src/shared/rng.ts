// Seeded RNG so every run is reproducible from its seed string (roguelike runs).

export class Rng {
    private s: number;

    constructor (seed: string | number) {
        this.s = typeof seed === 'number' ? seed >>> 0 : hashString(seed);
    }

    /** mulberry32 → [0, 1) */
    next (): number {
        let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    range (min: number, max: number) { return min + this.next() * (max - min); }
    int (min: number, max: number) { return Math.floor(this.range(min, max + 1)); }
    chance (p: number) { return this.next() < p; }
    pick<T> (arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }

    weighted<K extends string> (table: Partial<Record<K, number>>): K {
        const entries = Object.entries(table) as [K, number][];
        let roll = this.next() * entries.reduce((sum, [, w]) => sum + w, 0);
        for (const [key, w] of entries) {
            roll -= w;
            if (roll < 0) return key;
        }
        return entries[entries.length - 1][0];
    }

    shuffle<T> (arr: T[]): T[] {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(this.next() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
}

function hashString (str: string): number {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
}

/** Short, shareable run seed like "MOSS-4821" */
export function makeSeed (): string {
    const words = ['MOSS', 'PEAR', 'FERN', 'PLUM', 'CORN', 'KALE', 'SAGE', 'BEAN', 'LEEK', 'RYE', 'OAT', 'FIG'];
    return `${words[Math.floor(Math.random() * words.length)]}-${Math.floor(1000 + Math.random() * 9000)}`;
}
