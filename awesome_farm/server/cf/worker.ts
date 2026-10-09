// Awesome Farm on Cloudflare: a Worker in front of one Durable Object per world.
// The Durable Object runs the very same SimHost as server/main.ts (and as solo play in the browser); only the
// plumbing differs: Cloudflare WebSockets instead of `ws`, a timer while somebody is connected instead of a
// process-long setInterval, and saves in the object's own storage (server/cf/store.ts) instead of files.
//
//   GET  /            → the game page, pointed at this server
//   GET  /status      → what the title screen asks before Join (public, any origin)
//   GET  /ws          → a player's WebSocket
//   GET  /admin       → the admin page (admin.html: unlocked with the DEV_KEY, works on a phone)
//   /admin/*          → status, farmers, kick, secret words, announcements, backups, restore, a new world, the log
//                       (Authorization: Bearer <DEV_KEY>)
//
// Deploy: see server/cf/README.md. Never store secrets in wrangler.toml: PASSWORD and DEV_KEY are `wrangler secret`s.
import { DurableObject } from 'cloudflare:workers';
import { MAX_PLAYERS, TUNING } from '../../src/shared/config';
import { SEASONS, seasonOf } from '../../src/shared/season';
import { SimHost, type Peer } from '../../src/shared/net/host';
import { PROTOCOL } from '../../src/shared/net/protocol';
import { sha256 } from '../../src/shared/net/sha256';
import { makeSeed } from '../../src/shared/rng';
import { Sim } from '../../src/shared/sim/sim';
import type { WorldState } from '../../src/shared/sim/types';
import { WorldStore } from './store';
import ADMIN_PAGE from './admin.html';
import { DEFAULT_WORLD, routeOf, WORLDS, worldInfo } from '../../src/shared/data/servers';

export interface Env {
    WORLD: DurableObjectNamespace<World>;
    WORLD_NAME?: string;            // the world the old, world-less addresses (/status, /ws, /admin) mean (default "farm"); the worlds themselves are in src/shared/data/servers.ts
    SERVER_NAME?: string;           // shown to players
    GAME_URL?: string;              // the game page ("/" sends people there with ?server=<this host>)
    VERSION?: string;               // the game's version, stamped by the deploy script
    PASSWORD?: string;              // secret: players must type it (optional)
    DEV_KEY?: string;               // secret: unlocks the developer menu and the /admin routes
}

const adminPage = () => new Response(ADMIN_PAGE, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer' } });
/** The world the old, world-less addresses mean. */
const defaultWorld = (env: Env) => { const w = (env.WORLD_NAME || DEFAULT_WORLD).replace(/[^a-zA-Z0-9_-]/g, ''); return w || DEFAULT_WORLD; };
/** Hand a request to one world's Durable Object, with the path it knows (/status, /ws, /admin/…). */
function toWorld (env: Env, world: string, req: Request, path: string): Promise<Response> {
    const to = new URL(req.url);
    to.pathname = path;
    const fwd = new Request(to.toString(), req);
    fwd.headers.set('x-world', world);
    return env.WORLD.get(env.WORLD.idFromName(world)).fetch(fwd);
}

/** Seconds a farmer whose line dropped (a phone asleep) is kept in the world. */
const GRACE_S = 30;
/** Inbound messages per connection (movement is 10 a second): a steady rate with a burst; a flood ends the connection. */
const MSG_PER_S = 40, MSG_BURST = 80, MSG_DROPS_TO_KICK = 400, MSG_MAX = 64 * 1024;
/** The simulation's heartbeat while anybody is connected (SimHost steps at 20 Hz and broadcasts at 10 Hz inside it). */
const TICK_MS = 50;
/** Wrong admin keys: this many in ten minutes locks the admin routes for ten minutes. */
const ADMIN_TRIES = 10, ADMIN_WINDOW = 10 * 60_000;

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
/** A secret as set (`wrangler secret put` reading a piped value may keep its line ending). */
const secret = (v?: string) => (v ?? '').trim();
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...CORS } });

export default {
    async fetch (req: Request, env: Env): Promise<Response> {
        const url = new URL(req.url);
        if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
        const toGame = (address: string) => {
            const to = new URL(env.GAME_URL!);
            to.searchParams.set('server', address);
            return Response.redirect(to.toString(), 302);
        };
        // the list of worlds to pick from: a plain answer, no world is woken for it
        if (url.pathname === '/worlds') return json({ game: 'awesome-farm', protocol: PROTOCOL, default: defaultWorld(env), worlds: WORLDS });
        if (url.pathname === '/' && env.GAME_URL) return toGame(url.origin);
        // one address per world: /w/<world>/status, /ws and /admin (the world's own page and routes)
        const bare = url.pathname.replace(/\/+$/, '');
        const routed = routeOf(bare);
        if (routed) {
            if (routed.rest === '/' && env.GAME_URL) return toGame(`${url.origin}/w/${routed.world}`);
            if (routed.rest === '/admin') return adminPage();
            if (routed.rest === '/status' || routed.rest === '/ws' || routed.rest.startsWith('/admin/')) return toWorld(env, routed.world, req, routed.rest);
            return new Response('Not found', { status: 404, headers: CORS });
        }
        if (url.pathname === '/admin' || url.pathname === '/admin/') return adminPage();
        // the old addresses: the first world, as before there were three
        if (url.pathname === '/status' || url.pathname === '/ws' || url.pathname.startsWith('/admin/')) return toWorld(env, defaultWorld(env), req, url.pathname);
        return new Response('Awesome Farm server. Open the game and join this address.', { status: 404, headers: CORS });
    },
} satisfies ExportedHandler<Env>;

export class World extends DurableObject<Env> {
    private store: WorldStore;
    private sim!: Sim;
    private host!: SimHost;
    private sockets = new Map<WebSocket, Peer>();
    private timer: ReturnType<typeof setInterval> | null = null;
    private last = 0;
    private tainted = false;                 // a tick threw: nothing goes over the good save until a tick completes cleanly
    private saving: Promise<void> = Promise.resolve();
    private queued: string | null = null;
    private logs: string[] = [];
    /** Today's traffic (UTC day, as Cloudflare counts): HTTP requests and incoming WebSocket messages (20 messages bill as one request). Saved with the world. */
    private usage = { day: '', http: 0, msgs: 0 };
    private readonly awake = Date.now();
    private adminFails: number[] = [];
    /** Which world this object is (its Durable Object name): the first, `farm`, is the one from before there were three. */
    private worldId = DEFAULT_WORLD;

    constructor (ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        this.worldId = ctx.id.name || (env.WORLD_NAME || DEFAULT_WORLD).replace(/[^a-zA-Z0-9_-]/g, '') || DEFAULT_WORLD;
        this.store = new WorldStore(ctx.storage as unknown as ConstructorParameters<typeof WorldStore>[0]);
        void ctx.blockConcurrencyWhile(async () => {
            let state: WorldState | null = null;
            try { const saved = await this.store.load(); if (saved) state = JSON.parse(saved) as WorldState; } catch (err) { this.log(`!! the save could not be read: ${(err as Error).message}; starting a new world (the old save stays in storage)`); }
            this.usage = (await ctx.storage.get<typeof this.usage>('usage')) ?? this.usage;
            this.boot(state);
        });
    }

    // ── the world ──────────────────────────────────────────────────────────
    private boot (state: WorldState | null) {
        const name = this.worldId;
        try { this.sim = state ? new Sim(state) : Sim.create(`${name}-${makeSeed()}`, name); } catch (err) {
            this.log(`!! the save could not be loaded: ${(err as Error).message}; starting a new world`);
            this.sim = Sim.create(`${name}-${makeSeed()}`, name);
        }
        this.host = new SimHost(this.sim, this.serverName(), secret(this.env.PASSWORD), { devKey: secret(this.env.DEV_KEY) || undefined, grace: GRACE_S });
        this.host.onLog = (line) => this.log(line);
        this.host.onSave = (text) => { if (!this.tainted) this.save(text); };
        this.tainted = false;
        this.log(`World "${name}" ready: day ${this.sim.s.day}, ${Object.keys(this.sim.s.players).length} farmers`);
    }

    /** What players see as the server's name: the deployment's name and the world's own ("Awesome Farm · Quarry"). */
    private serverName () {
        const base = this.env.SERVER_NAME || 'Awesome Farm', w = worldInfo(this.worldId);
        return w ? `${base} · ${w.name}` : base;
    }

    private log (line: string) {
        const at = new Date().toISOString().slice(11, 19);
        this.logs.push(`[${at}] ${line}`);
        if (this.logs.length > 200) this.logs.splice(0, this.logs.length - 200);
        console.log(line);
    }

    /** One save at a time; the newest state waiting wins. */
    private save (text: string) {
        if (this.queued !== null) { this.queued = text; return; }
        this.queued = text;
        this.saving = this.saving.then(async () => {
            const next = this.queued!;
            this.queued = null;
            try { await this.store.save(next); await this.ctx.storage.put('usage', this.usage); } catch (err) { this.log(`!! could not save the world: ${(err as Error).message}`); }
        });
    }

    // ── the clock: runs only while somebody is connected or owed a wait, a save or a broadcast ──
    private wake () {
        if (this.timer) return;
        this.last = Date.now();
        this.timer = setInterval(() => this.tick(), TICK_MS);
    }

    private tick () {
        const now = Date.now();
        const dt = Math.min(1, (now - this.last) / 1000);
        this.last = now;
        try {
            this.host.update(dt);
            this.tainted = false;
        } catch (err) {
            this.log(`!! simulation error: ${(err as Error).stack ?? err}`);
            if (!this.tainted) { this.tainted = true; void this.store.backup(JSON.stringify(this.sim.s), 'the world as it was when the simulation failed').catch(() => {}); }
        }
        if (this.host.playerCount === 0 && !this.host.pending) {
            clearInterval(this.timer!);
            this.timer = null;
            if (!this.tainted) this.save(JSON.stringify(this.sim.s));          // (nobody left: the object may now be put away)
        }
    }

    // ── requests ───────────────────────────────────────────────────────────
    /** Counts one incoming request or message against today (a new UTC day starts from zero). */
    private count (kind: 'http' | 'msgs') {
        const day = new Date().toISOString().slice(0, 10);
        if (this.usage.day !== day) this.usage = { day, http: 0, msgs: 0 };
        this.usage[kind]++;
    }

    async fetch (req: Request): Promise<Response> {
        const url = new URL(req.url);
        const said = req.headers.get('x-world');
        if (said && !this.ctx.id.name && worldInfo(said)) this.worldId = said;        // (a runtime that does not tell an object its own name: the worker does)
        this.count('http');
        if (url.pathname === '/status') return json(this.status());
        if (url.pathname === '/ws') return this.openSocket(req);
        if (url.pathname.startsWith('/admin/')) return this.admin(req, url.pathname.slice(7));
        return new Response('Not found', { status: 404 });
    }

    private status () {
        const s = this.sim.s;
        return { game: 'awesome-farm', version: this.env.VERSION || '?', protocol: PROTOCOL, name: this.serverName(), world: this.worldId,
            online: this.host.playerCount, max: MAX_PLAYERS, farmers: Object.keys(s.players).length, day: s.day, password: !!secret(this.env.PASSWORD), host: 'cloudflare', tainted: this.tainted };
    }

    private openSocket (req: Request): Response {
        if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
        const pair = new WebSocketPair();
        const [client, ws] = [pair[0], pair[1]];
        ws.accept();
        const addr = req.headers.get('cf-connecting-ip') ?? '?';
        const peer: Peer = { addr, send: (text) => { if (ws.readyState === WebSocket.READY_STATE_OPEN) ws.send(text); }, close: () => { try { ws.close(1000, 'bye'); } catch { /* already gone */ } } };
        this.sockets.set(ws, peer);
        this.host.attach(peer);
        this.wake();
        // inbound rate: a token bucket per connection, movement counted too
        let tokens = MSG_BURST, filled = Date.now(), dropped = 0;
        ws.addEventListener('message', (ev) => {
            const data = ev.data;
            const text = typeof data === 'string' ? data : new TextDecoder().decode(data as ArrayBuffer);
            this.count('msgs');
            if (text.length > MSG_MAX) { ws.close(1009, 'Message too big'); return; }
            const now = Date.now();
            tokens = Math.min(MSG_BURST, tokens + (now - filled) / 1000 * MSG_PER_S);
            filled = now;
            if (tokens < 1) {
                if (++dropped >= MSG_DROPS_TO_KICK) { this.log(`!! ${addr} floods the server: disconnected`); ws.close(1008, 'Too many messages'); }
                return;
            }
            tokens--;
            try { this.host.receive(peer, text); } catch (err) { this.log(`!! bad message from a client: ${(err as Error).message}`); }
            this.wake();
        });
        const gone = (code: number) => {
            if (!this.sockets.delete(ws)) return;
            // 1006 is a line that just died (a phone asleep, a tunnel gone): the farmer is kept a while; a proper close means they left
            this.host.detach(peer, code !== 1006);
            this.wake();
        };
        ws.addEventListener('close', (ev) => gone(ev.code));
        ws.addEventListener('error', () => gone(1006));
        return new Response(null, { status: 101, webSocket: client });
    }

    // ── admin: backups, restore, a new world (the control page on the owner's PC uses these) ──
    private authorised (req: Request) {
        const key = secret(this.env.DEV_KEY);
        const now = Date.now();
        this.adminFails = this.adminFails.filter((t) => now - t < ADMIN_WINDOW);
        if (!key || this.adminFails.length >= ADMIN_TRIES) return false;
        const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
        // compared as two digests of the same length, without stopping at the first difference
        const a = sha256(`admin:${given}`), b = sha256(`admin:${key}`);
        let diff = 0;
        for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
        if (diff !== 0) { this.adminFails.push(now); return false; }
        return true;
    }

    private async admin (req: Request, op: string): Promise<Response> {
        if (!this.authorised(req)) return json({ error: secret(this.env.DEV_KEY) ? 'wrong key (or too many tries: wait ten minutes)' : 'this server has no DEV_KEY' }, 403);
        const world = () => JSON.stringify(this.sim.s);
        if (req.method === 'GET' && op === 'backup') {
            return new Response(world(), { headers: { 'content-type': 'application/json', 'content-disposition': `attachment; filename="farm-cloud-day${this.sim.s.day}.json"`, ...CORS } });
        }
        if (req.method === 'GET' && op === 'backups') return json({ live: await this.store.info(), backups: await this.store.backups() });
        if (req.method === 'GET' && op === 'log') return json({ lines: this.logs });
        if (req.method === 'GET' && op === 'state') {
            const s = this.sim.s, u = this.usage;
            return json({
                status: this.status(), clock: { day: s.day, clock: s.clock, night: s.night, nightLen: s.nightLen, dayLen: TUNING.dayLength, season: SEASONS[seasonOf(s.day)].name }, players: this.host.adminPlayers(),
                usage: { ...u, requests: u.http + Math.ceil(u.msgs / 20), limit: 100_000 }, awakeSince: this.awake,
                live: await this.store.info(), backups: await this.store.backups(), log: this.logs.slice(-60),
            });
        }
        if (req.method !== 'POST') return json({ error: 'unknown admin route' }, 404);
        const body = async () => { try { return (await req.json()) as Record<string, unknown>; } catch { return {} as Record<string, unknown>; } };
        const str = (v: unknown) => (typeof v === 'string' ? v : '');
        if (op === 'kick') {
            const b = await body();
            const done = this.host.kick(str(b.id), str(b.reason) || undefined);
            if (done) this.log(`Admin: sent ${this.sim.s.players[str(b.id)]?.name ?? str(b.id)} back to the title screen`);
            return done ? json({ ok: true }) : json({ error: 'That farmer is not connected.' }, 400);
        }
        if (op === 'word') {
            const b = await body();
            const r = this.host.setWord(str(b.id), str(b.word));
            if ('error' in r) return json(r, 400);
            this.log(`Admin: ${r.name} has a new secret word`);
            await this.saveNow();
            return json({ ok: true, name: r.name });
        }
        if (op === 'forget') {
            const b = await body();
            const n = this.host.forgetWord(str(b.id));
            if (n) { this.log(`Admin: ${this.sim.s.players[str(b.id)]?.name ?? str(b.id)} no longer needs a secret word`); await this.saveNow(); }
            return json({ ok: true, removed: n });
        }
        if (op === 'announce') {
            const b = await body();
            if (!this.host.announce(str(b.text))) return json({ error: 'Nothing to say.' }, 400);
            this.log(`Admin announced: ${str(b.text).slice(0, 90)}`);
            this.wake();
            return json({ ok: true, heard: this.host.playerCount });
        }
        if (op === 'save') { await this.saveNow(); return json({ ok: true, live: await this.store.info() }); }
        if (op === 'reset') {
            await this.replace(null, 'before a new world');
            return json({ ok: true, status: this.status() });
        }
        if (op === 'restore') {
            const id = new URL(req.url).searchParams.get('backup');
            const text = id ? await this.store.readBackup(id) : await req.text();
            let state: WorldState;
            try { state = JSON.parse(text) as WorldState; new Sim(JSON.parse(text) as WorldState); } catch (err) { return json({ error: `that is not a world this server can load: ${(err as Error).message}` }, 400); }
            await this.replace(state, id ? 'before a backup was put back' : 'before an uploaded world replaced it');
            return json({ ok: true, status: this.status() });
        }
        return json({ error: 'unknown admin route' }, 404);
    }

    private async saveNow () {
        this.host.save();
        await this.saving;
    }

    /** Keeps the world as it is in a named backup, then swaps in `state` (null: a new world). Everybody connected is sent back to the title screen and comes straight back in. */
    private async replace (state: WorldState | null, why: string) {
        await this.saving;
        await this.store.backup(JSON.stringify(this.sim.s), why);
        for (const [ws] of this.sockets) { try { ws.close(4000, 'The world was replaced: join again'); } catch { /* gone */ } }
        this.sockets.clear();
        if (this.timer) { clearInterval(this.timer); this.timer = null; }
        this.boot(state);
        await this.store.save(JSON.stringify(this.sim.s));
        this.log(why.startsWith('before a new') ? 'A new world was started (the old one is a backup)' : 'A world was restored (the one before is a backup)');
    }
}
