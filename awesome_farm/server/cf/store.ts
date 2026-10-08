// World saves inside a Durable Object's storage: gzip, then chunks, because one stored value may not pass 2 MB.
// Pure (no Cloudflare imports): it talks to a small key-value interface, so tests/cf.test.ts runs it in Node.
//
// Layout (keys):
//   cur              { gen, n, bytes, at, sum }   the live save: chunks g<gen>:0 … g<gen>:<n-1>
//   g<gen>:<i>       Uint8Array chunks of the gzipped JSON. The previous generation is kept (one step back).
//   bk               Backup[]                      named backups (newest first, at most BACKUPS)
//   b<id>:<i>        their chunks
// A save writes its chunks and the new `cur` in ONE put (atomic), then deletes what is no longer needed,
// so a reader never sees half a save.

/** The bit of DurableObjectStorage this uses (Map-backed in tests). */
export interface Kv {
    get<T = unknown> (key: string): Promise<T | undefined>;
    put (entries: Record<string, unknown>): Promise<void>;
    delete (keys: string[]): Promise<number>;
}

/** One stored copy of a world: where its chunks are and what it held. */
export interface Copy { n: number; bytes: number; at: number; sum: string }
export interface Backup extends Copy { id: string; why: string }
interface Cur extends Copy { gen: number }

/** Bytes per chunk: well under the 2 MB limit for a key and its value together. */
export const CHUNK = 512 * 1024;
/** Named backups kept; the oldest goes when one more is made. */
export const BACKUPS = 12;
/** One put may carry at most 128 keys: chunks + the index row. */
const MAX_CHUNKS = 120;

async function pipe (bytes: Uint8Array, stream: TransformStream<Uint8Array, Uint8Array>) {
    const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await out.arrayBuffer());
}
export const gzip = (text: string) => pipe(new TextEncoder().encode(text), new CompressionStream('gzip'));
export const gunzip = async (bytes: Uint8Array) => new TextDecoder().decode(await pipe(bytes, new DecompressionStream('gzip')));

export function split (bytes: Uint8Array, size = CHUNK): Uint8Array[] {
    const out: Uint8Array[] = [];
    for (let i = 0; i < bytes.length; i += size) out.push(bytes.slice(i, i + size));
    return out.length ? out : [new Uint8Array(0)];
}

export function join (parts: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
}

/** "day 12, 3 farmers: Ann (level 4), …; 9 plots of land", or why not. */
export function summary (json: string): string {
    try {
        const s = JSON.parse(json) as { day?: number; players?: Record<string, { name?: string; level?: number }>; plots?: { owned?: boolean }[] };
        const ps = Object.values(s.players ?? {});
        const land = (s.plots ?? []).filter((p) => p.owned).length;
        return `day ${s.day ?? '?'}, ${ps.length} farmer${ps.length === 1 ? '' : 's'}${ps.length ? ': ' + ps.map((p) => `${p.name} (level ${p.level})`).join(', ') : ''}; ${land} plots of land`;
    } catch { return 'unreadable'; }
}

const range = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}:${i}`);

export class WorldStore {
    constructor (private kv: Kv, private now: () => number = () => Date.now()) {}

    private async pack (json: string) {
        const parts = split(await gzip(json));
        if (parts.length > MAX_CHUNKS) throw new Error(`the world is too big to save (${parts.length} chunks)`);
        return parts;
    }

    private async read (prefix: string, n: number): Promise<string> {
        const parts: Uint8Array[] = [];
        for (const key of range(prefix, n)) {
            const p = await this.kv.get<Uint8Array>(key);
            if (!p) throw new Error(`a piece of the save is missing (${key})`);
            parts.push(new Uint8Array(p));
        }
        return gunzip(join(parts));
    }

    /** The live world as JSON, or null when there is none yet. Falls back to the previous generation if the newest cannot be read. */
    async load (): Promise<string | null> {
        const cur = await this.kv.get<Cur>('cur');
        if (!cur) return null;
        try { return await this.read(`g${cur.gen}`, cur.n); } catch (err) {
            const prev = await this.kv.get<Cur>('prev');
            if (!prev) throw err;
            return this.read(`g${prev.gen}`, prev.n);
        }
    }

    /** Saves the live world; keeps the generation before it, drops the one before that. */
    async save (json: string): Promise<Copy> {
        const parts = await this.pack(json);
        const cur = await this.kv.get<Cur>('cur');
        const old = await this.kv.get<Cur>('prev');
        const gen = (cur?.gen ?? 0) + 1;
        const next: Cur = { gen, n: parts.length, bytes: parts.reduce((s, p) => s + p.length, 0), at: this.now(), sum: summary(json) };
        const entries: Record<string, unknown> = { cur: next };
        if (cur) entries.prev = cur;
        range(`g${gen}`, parts.length).forEach((k, i) => { entries[k] = parts[i]; });
        await this.kv.put(entries);
        if (old) await this.kv.delete(range(`g${old.gen}`, old.n));
        return next;
    }

    async info (): Promise<Copy | null> { return (await this.kv.get<Cur>('cur')) ?? null; }

    async backups (): Promise<Backup[]> { return (await this.kv.get<Backup[]>('bk')) ?? []; }

    /** Keeps a copy of `json` as a named backup (`why` says what was about to happen). */
    async backup (json: string, why: string): Promise<Backup> {
        const parts = await this.pack(json);
        const list = await this.backups();
        const at = this.now();
        const b: Backup = { id: `${at.toString(36)}${Math.floor(Math.random() * 1296).toString(36).padStart(2, '0')}`, why, n: parts.length, bytes: parts.reduce((s, p) => s + p.length, 0), at, sum: summary(json) };
        const keep = [b, ...list];
        const drop = keep.splice(BACKUPS);
        const entries: Record<string, unknown> = { bk: keep };
        range(`b${b.id}`, parts.length).forEach((k, i) => { entries[k] = parts[i]; });
        await this.kv.put(entries);
        for (const d of drop) await this.kv.delete(range(`b${d.id}`, d.n));
        return b;
    }

    /** A named backup's world as JSON. */
    async readBackup (id: string): Promise<string> {
        const b = (await this.backups()).find((x) => x.id === id);
        if (!b) throw new Error('No such backup');
        return this.read(`b${b.id}`, b.n);
    }
}
