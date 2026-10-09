// Runs one world for any number of connected peers. The same class powers solo play
// (in the browser, see client/net/connection.ts) and the dedicated server
// (server/main.ts), so both behave identically.

import { MAX_PLAYERS, NET, TILE } from '../config';
import { PAL } from '../palette';
import { BUILDINGS } from '../data/buildings';
import * as dev from '../sim/dev';
import { Sim } from '../sim/sim';
import { derived } from '../sim/stats';
import type { Ent, PlayerS } from '../sim/types';
import { ClientMsg, PlayerDelta, PlayerView, PROTOCOL, ServerMsg, TickMsg } from './protocol';
import { hashKey, sha256 } from './sha256';

const BAD_NAMES = new Set(['__proto__', 'constructor', 'prototype', 'tostring', 'valueof', 'hasownproperty']);
/** Text from the wire: only strings and numbers count, so an object with a nasty toString can never throw. */
const text = (v: unknown, max: number) => (typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, max) : '');
const randomHex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
/** A farmer's name: 2 to 16 letters, numbers and a few marks, starting with a letter or number. */
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} _.'-]{1,15}$/u;
/** A name as typed on the title screen, made safe: control characters and angle brackets dropped, then the account rule; '' when nothing usable is left (the sim then says "Farmer N"). */
function cleanName (v: unknown) {
    const n = text(v, 64).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16).trim();
    return NAME_RE.test(n) && !BAD_NAMES.has(n.toLowerCase()) ? n : '';
}

export interface Peer {
    send (text: string): void;
    close? (): void;
    /** Where the connection comes from (the server passes the remote address): the developer key's lock is kept by it, so a reconnect does not reset it. */
    addr?: string;
    /** False while the connection cannot take more (its send buffer is full): the tick is kept for later instead of piling up. */
    ready? (): boolean;
}

const PUBLIC_KEYS = ['id', 'name', 'color', 'slot', 'online', 'x', 'y', 'fx', 'fy', 'moving', 'warp',
    'hearts', 'downed', 'revive', 'level', 'equip', 'line', 'look', 'co'] as const;

/** What everyone else may see of a player; `mh` is their max hearts (their skills stay private). */
function publicView (p: PlayerS, mh: number): PlayerView {
    const v: Record<string, unknown> = {};
    for (const k of PUBLIC_KEYS) v[k] = p[k];
    v.mh = mh;
    return v as PlayerView;
}

/** Where an entity is, in pixels (for area-of-interest streaming). */
function entPos (e: Ent): [number, number] {
    if (e.k === 'node') return [(e.tx + 0.5) * TILE, (e.ty + 0.5) * TILE];
    if (e.k === 'bld') { const [w, h] = BUILDINGS[e.kind].size; return [(e.tx + w / 2) * TILE, (e.ty + h / 2) * TILE]; }
    return [e.x, e.y];
}

/** A record split into its keys, each key's JSON kept for cheap comparison. */
function keyed (v: Record<string, unknown>) {
    const j: Record<string, string> = {};
    for (const k in v) { const s = JSON.stringify(v[k]); if (s !== undefined) j[k] = s; }
    return { v, j };
}

/** What changed in a player since this peer was last told; null when nothing did. Remembers `cur` as told. */
function delta (told: Map<string, Record<string, string>>, id: string, cur: { v: Record<string, unknown>; j: Record<string, string> }): PlayerDelta | null {
    const last = told.get(id);
    const d: Record<string, unknown> = {};
    let changed = false;
    for (const k in cur.j) if (!last || last[k] !== cur.j[k]) { d[k] = cur.v[k]; changed = true; }
    let rm: string[] | undefined;
    if (last) for (const k in last) if (!(k in cur.j)) { (rm ??= []).push(k); changed = true; }
    told.set(id, cur.j);
    if (!changed) return null;
    d.id = id;
    if (rm) d.rm = rm;
    return d as PlayerDelta;
}

/** Two hashes of the same length are equal, compared without stopping at the first difference. */
function sameHash (a: string, b: string) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

/** The developer menu's key: wrong tries in a row from one address lock it for a while, and too many anywhere lock everybody out for longer. */
const DEV_TRIES = 4, DEV_LOCK_MS = 5 * 60_000, DEV_ALL_TRIES = 20, DEV_ALL_WINDOW_MS = 10 * 60_000, DEV_ALL_LOCK_MS = 10 * 60_000;
/** Hellos: a connection gets a few (a refused one closes it anyway); every secret word costs a stretched hash, so only so many a minute for everybody; and one device makes only so many new farmers. */
const HELLOS_PER_PEER = 5, HASHES_PER_MIN = 60, ACCOUNTS_PER_DEVICE = 2;
/** Broadcasts answering actions, on top of the regular ticks: a burst, then at most sixty a second, so command spam cannot become a tick flood for everyone. */
const FLUSH_BURST = 30, FLUSH_PER_S = 60;

/** What a congested connection has not been told yet (see `flush`). */
interface Missed { dirty: Set<number>; gone: Set<number>; plots: Set<number>; dug: number[] }

export interface HostOptions {
    /** The developer menu's key (a server's `--dev-key`). Only a salted hash of it is kept, and it is never logged, sent or saved. Without one the menu can never be unlocked here. */
    devKey?: string;
    /** Anybody may unlock the developer menu, with any key: solo play, where the world is nobody else's. */
    devOpen?: boolean;
    /** How a secret word is hashed: the same stretched SHA-256 as `hashKey` (the rows in the save depend on it), but a server passes its native one, which is far cheaper. */
    hash?: (key: string, salt: string) => string;
    /** Seconds a farmer whose connection dropped stays online, waiting for it to come back (a phone that fell asleep); 0 = leave at once. */
    grace?: number;
}

export class SimHost {
    /** Wrong secret words so far, per account name (a few in a row lock the name for a minute). */
    private fails = new Map<string, { n: number; until: number }>();
    /** The developer key as a salted hash (null: no key, so nobody can unlock the menu, unless `devOpen`). */
    private devHash: { salt: string; h: string } | null = null;
    private readonly devOpen: boolean;
    /** Wrong developer keys: per address (or player id, when the peer has none), and all together (how many, since when, and until when everybody is locked out). */
    private devFails = new Map<string, { n: number; until: number }>();
    private devAll = { n: 0, since: 0, until: 0 };
    /** The clock every rate limit and the reconnect wait read (tests swap it). */
    now: () => number = () => Date.now();
    private readonly hash: (key: string, salt: string) => string;
    private readonly grace: number;
    private readonly pwHash: string;
    private peers = new Map<Peer, string | null>();    // peer → player id once hello'd
    private hellos = new Map<Peer, number>();          // hellos heard on each connection
    private known = new Map<Peer, Set<number>>();      // entity ids each peer has been sent
    private told = new Map<Peer, Map<string, Record<string, string>>>();   // per peer: each player's keys as last sent (JSON)
    private missed = new Map<Peer, Missed>();          // per congested peer: what it has not been sent yet
    /** Farmers whose connection dropped, by id → when (on `now`) to let them leave unless they are back. */
    private ghosts = new Map<string, number>();
    private hashes: number[] = [];                     // when the recent secret-word hashes happened
    private signups = new Map<string, number>();       // new accounts made per device id (this run)
    private count = 0;                                 // connections that have said hello
    private stepAcc = 0;
    private sendAcc = 0;
    private saveAcc = 0;
    private prodAcc = 0;
    private flushWanted = false;
    private flushTokens = FLUSH_BURST;
    private saveWanted = false;
    private posX = new Float64Array(0);                // every entity's position, worked out once per broadcast
    private posY = new Float64Array(0);
    /** Called with the world as JSON every NET.saveEvery seconds and on demand. */
    onSave?: (json: string) => void;
    onLog?: (line: string) => void;

    constructor (readonly sim: Sim, readonly serverName = 'Awesome Farm', password = '', opts: HostOptions = {}) {
        this.devOpen = !!opts.devOpen;
        this.hash = opts.hash ?? hashKey;
        this.grace = Math.max(0, opts.grace ?? 0);
        this.pwHash = sha256(password);            // (compared as digests, so a guess learns nothing from the timing)
        if (typeof opts.devKey === 'string' && opts.devKey) { const salt = randomHex(12); this.devHash = { salt, h: this.hash(opts.devKey, salt) }; }
        // an account whose farmer is gone (a sign-up the world was too full for) only holds a name hostage: drop it
        const accts = sim.s.accounts;
        if (accts) for (const k of Object.keys(accts)) if (!sim.s.players[accts[k].id]) delete accts[k];
    }

    get playerCount () { return this.count; }
    /** Somebody is still owed a tick though nobody is connected: a farmer being waited for, a save or a broadcast. */
    get pending () { return this.ghosts.size > 0 || this.saveWanted || this.flushWanted; }
    /** Ids of the farmers whose connection dropped and who are being waited for. */
    get waiting () { return [...this.ghosts.keys()]; }

    attach (peer: Peer) { this.peers.set(peer, null); }

    /** The connection is gone. `clean`: the player closed it on purpose (leave now); otherwise the farmer is kept for `grace` seconds in case they come back. */
    detach (peer: Peer, clean = true) {
        const id = this.forget(peer);
        if (!id || this.hasPeer(id)) return;       // (another connection of the same farmer carries on)
        dev.lock(this.sim, id);                    // the key has to be brought again by the next connection
        if (!clean && this.grace > 0 && this.sim.s.players[id]?.online) {
            this.ghosts.set(id, this.now() + this.grace * 1000);
            this.onLog?.(`${this.sim.s.players[id].name} lost its connection (kept for ${this.grace} s)`);
            return;
        }
        this.leave(id);
    }

    /** Drop a peer from every table; returns the player id it had, if any. */
    private forget (peer: Peer) {
        const id = this.peers.get(peer);
        this.peers.delete(peer);
        this.hellos.delete(peer);
        this.known.delete(peer);
        this.told.delete(peer);
        this.missed.delete(peer);
        if (id) this.count--;
        return id;
    }

    private leave (id: string) {
        this.sim.leave(id);
        this.onLog?.(`${this.sim.s.players[id]?.name ?? id} left (${this.playerCount} online)`);
        this.saveWanted = true;                    // (written on the next update, not inside the socket's close event)
    }

    receive (peer: Peer, text: string) {
        let msg: ClientMsg;
        try { msg = JSON.parse(text); } catch { return; }
        if (!msg || typeof msg !== 'object') return;
        const id = this.peers.get(peer);
        if (id === undefined) return;              // (not attached: a socket that was replaced)
        if (msg.t === 'ping') { this.send(peer, { t: 'pong' }); return; }
        if (msg.t === 'hello') { if (!id) this.hello(peer, msg); return; }
        if (msg.t !== 'cmd' || !id || !msg.c || typeof msg.c !== 'object') return;
        if (msg.c.t === 'dev') { this.unlockDev(peer, id, (msg.c as { key?: unknown }).key); this.poke(); return; }
        this.sim.command(id, msg.c);
        // answer actions right away so hits feel instant; movement waits for the regular tick
        if (msg.c.t !== 'move') this.poke();
    }

    /** A broadcast now if the budget allows, otherwise with the next update. */
    private poke () {
        if (this.flushTokens >= 1) { this.flushTokens--; this.flush(); } else this.flushWanted = true;
    }

    private full () { return Object.keys(this.sim.s.players).length >= MAX_PLAYERS; }

    private hello (peer: Peer, msg: Extract<ClientMsg, { t: 'hello' }>) {
        const refuse = (reason: string) => { this.send(peer, { t: 'refused', reason }); peer.close?.(); };
        const tries = (this.hellos.get(peer) ?? 0) + 1;
        this.hellos.set(peer, tries);
        if (tries > HELLOS_PER_PEER) return refuse('Too many tries. Connect again.');
        if (msg.v !== PROTOCOL) return refuse('This server runs a different version of the game.');
        if (!sameHash(sha256(text(msg.password, 256)), this.pwHash)) return refuse('Wrong password.');
        let id = text(msg.id, 64);
        if (!id) return refuse('Missing player id.');
        const accts = this.sim.s.accounts;
        // a named farmer: the secret word finds your farmer on any device, and a new name keeps the farmer this device already has
        let signedAs = '', made = '';
        if (msg.acct !== undefined) {
            const r = this.account(msg.acct, id);
            if ('error' in r) return refuse(r.error);
            id = r.id; signedAs = r.name; made = r.made ?? '';
        } else if (accts && Object.values(accts).some((r) => r.id === id)) {
            // ids are visible to every client; the word is not, so a farmer with one is only ever theirs
            return refuse('This farmer has a secret word. Enter it to sign in.');
        }
        const name = signedAs || cleanName(msg.name);
        if (!signedAs && name && accts && Object.prototype.hasOwnProperty.call(accts, name.toLowerCase())) return refuse(`"${name}" is a farmer with a secret word. Sign in with it, or pick another name.`);
        // the same player connecting again (a second tab, or a reconnect) replaces the old socket
        for (const [other, oid] of this.peers) if (oid === id && other !== peer) { this.forget(other); other.close?.(); }
        const known = !!this.sim.s.players[id];
        if (!known && this.full()) return refuse(`This world already has ${MAX_PLAYERS} farmers.`);
        // a farmer back before the wait ran out never left: no join, no welcome-back, just the line again
        const waited = this.ghosts.delete(id) && known;
        const p = waited ? this.sim.s.players[id] : this.sim.join(id, name);
        if (!p) { if (made) delete this.sim.s.accounts?.[made]; return refuse('This world is full.'); }
        dev.lock(this.sim, id);                 // (a new connection never inherits an unlock: it has to bring the key itself)
        this.peers.set(peer, id);
        this.count++;
        this.onLog?.(`${p.name} ${waited ? 'is back' : 'joined'} (${this.playerCount} online)`);
        this.welcome(peer, p);
    }

    /** The world as this player sees it: the land, what is near them, and everyone's public record (their own in full). */
    private welcome (peer: Peer, p: PlayerS) {
        const s = this.sim.s;
        // the snapshot already includes this tick's changes; the next tick re-sends the near entities that changed (harmless upserts)
        const seen = new Set<number>();
        const near: Record<number, Ent> = {};
        for (const e of Object.values(s.ents)) {
            const [x, y] = entPos(e);
            if (Math.abs(x - p.x) <= NET.aoi && Math.abs(y - p.y) <= NET.aoi) { near[e.id] = e; seen.add(e.id); }
        }
        this.known.set(peer, seen);
        this.missed.delete(peer);
        // everyone else as what everyone may see (their max hearts worked out here, since their skills stay private); the first tick
        // then tells this client everything public about everyone, as before
        const players: Record<string, PlayerS | PlayerView> = {};
        for (const q of Object.values(s.players)) players[q.id] = q.id === p.id ? q : publicView(q, derived(q).maxHearts);
        this.told.set(peer, new Map());
        const { accounts: _secret, ...pub } = s;                 // (the secret words' hashes stay on the server)
        void _secret;
        this.send(peer, { t: 'welcome', v: PROTOCOL, you: p.id, state: { ...pub, ents: near, players: players as Record<string, PlayerS> }, server: this.serverName });
    }

    /** The developer menu's unlock: the key is checked here (a salted hash, compared in constant time) and the answer is a toast; the menu itself is in sim/dev.ts. */
    private unlockDev (peer: Peer, id: string, key: unknown) {
        const sim = this.sim, now = this.now();
        if (sim.devs.has(id)) return;
        const say = (t: string) => sim.toast(id, t, 'k_star', 0xe85d62);
        if (!this.devOpen && !sim.cheats) {
            const who = peer.addr ?? id, f = this.devFails.get(who), all = this.devAll;
            if ((f && f.until > now) || all.until > now) { say('Too many wrong tries. Wait a few minutes.'); return; }
            const attempt = text(key, 128);
            // (with no key set this still hashes, so a server with no menu looks the same as one with a key)
            const salt = this.devHash?.salt ?? 'none', want = this.devHash?.h ?? this.hash('', salt);
            if (!attempt || !this.devHash || !sameHash(this.hash(attempt, salt), want)) {
                const n = (f?.n ?? 0) + 1;
                if (this.devFails.size > 500) for (const [k, v] of this.devFails) if (v.until < now) this.devFails.delete(k);
                this.devFails.set(who, { n, until: n >= DEV_TRIES ? now + DEV_LOCK_MS : 0 });
                if (now - all.since > DEV_ALL_WINDOW_MS) { all.n = 0; all.since = now; }
                if (++all.n >= DEV_ALL_TRIES) { all.until = now + DEV_ALL_LOCK_MS; all.n = 0; }
                say('Wrong key');
                return;
            }
            this.devFails.delete(who);
        }
        dev.unlock(sim, id);
    }

    /** One more stretched hash may run now (so many a minute, for everybody). */
    private hashBudget () {
        const now = this.now();
        this.hashes = this.hashes.filter((t) => now - t < 60_000);
        if (this.hashes.length >= HASHES_PER_MIN) return false;
        this.hashes.push(now);
        return true;
    }

    /** Sign in or sign up. Returns the player id this name belongs to (`made`: the account row just created, for the caller to undo if the join fails). */
    private account (a: unknown, deviceId: string): { id: string; name: string; made?: string } | { error: string } {
        if (!a || typeof a !== 'object') return { error: 'Bad sign-in.' };
        const name = text((a as { name?: unknown }).name, 64).trim().slice(0, 16);
        const key = text((a as { key?: unknown }).key, 64);
        if (!NAME_RE.test(name) || BAD_NAMES.has(name.toLowerCase())) return { error: 'Pick a name of 2 to 16 letters or numbers.' };
        if (key.length < 4) return { error: 'Your secret word needs at least 4 characters.' };
        const nk = name.toLowerCase();
        const accts = (this.sim.s.accounts ??= {});
        const rec = Object.prototype.hasOwnProperty.call(accts, nk) ? accts[nk] : undefined;
        const now = this.now(), f = this.fails.get(nk);
        const busy = { error: 'The server is busy with sign-ins. Try again in a minute.' };
        if (rec) {
            if (f && f.until > now) return { error: 'Too many wrong tries. Wait a minute and try again.' };
            if (!this.hashBudget()) return busy;
            if (!sameHash(this.hash(key, rec.salt), rec.h)) {
                const n = (f?.n ?? 0) + 1;
                this.fails.set(nk, { n, until: n >= 6 ? now + 60_000 : 0 });
                return { error: 'That name already has a farmer, and that is not its secret word.' };
            }
            this.fails.delete(nk);
            return { id: rec.id, name };
        }
        // a new name: it keeps the farmer this device already has (so nothing is lost), unless that farmer belongs to another name
        const bound = new Set(Object.values(accts).map((r) => r.id));
        // a farmer who has played here before but never set a word keeps their name for their own device, so nobody else can take it
        if (this.sim.s.players[deviceId]?.name.toLowerCase() !== nk && Object.values(this.sim.s.players).some((p) => p.id !== deviceId && !bound.has(p.id) && p.name.toLowerCase() === nk)) return { error: 'A farmer with that name already plays here. Join from the device you played on, or pick another name.' };
        const id = bound.has(deviceId) ? `acct-${randomHex(16)}` : deviceId;
        // nothing is written for a farmer there is no room for, nor for a device that keeps making new ones
        if (!this.sim.s.players[id] && this.full()) return { error: `This world already has ${MAX_PLAYERS} farmers.` };
        const made = this.signups.get(deviceId) ?? 0;
        if (made >= ACCOUNTS_PER_DEVICE) return { error: 'This device has made enough new farmers for now.' };
        if (!this.hashBudget()) return busy;
        this.signups.set(deviceId, made + 1);
        const salt = randomHex(12);
        accts[nk] = { id, salt, h: this.hash(key, salt) };
        return { id, name, made: nk };
    }

    // ── the server's admin (the Cloudflare host's /admin page; any host may offer these) ──
    /** Every farmer in the world: who is connected now and who signs in with a secret word (under which names). */
    adminPlayers () {
        const live = new Set(this.peers.values());
        const words = new Map<string, string[]>();
        for (const [nk, r] of Object.entries(this.sim.s.accounts ?? {})) (words.get(r.id) ?? words.set(r.id, []).get(r.id)!).push(nk);
        return Object.values(this.sim.s.players).map((p) => ({ id: p.id, name: p.name, level: p.level, online: live.has(p.id), words: words.get(p.id) ?? [] }))
            .sort((a, b) => Number(b.online) - Number(a.online) || b.level - a.level || a.name.localeCompare(b.name));
    }

    /** Sends a farmer back to the title screen with `reason` (their game does not reconnect by itself). False when they are not connected. */
    kick (id: string, reason = 'The server admin sent you back to the title screen.') {
        let n = 0;
        for (const [peer, pid] of [...this.peers]) if (pid === id) { this.send(peer, { t: 'refused', reason: text(reason, 120) || 'Disconnected.' }); peer.close?.(); n++; }
        return n > 0;
    }

    /** Gives a farmer a new secret word (a farmer who forgot theirs, or lost the device they played on). They sign in with the returned name and `word` on any device. */
    setWord (id: string, word: string): { name: string } | { error: string } {
        const p = this.sim.s.players[id];
        if (!p) return { error: 'No such farmer.' };
        const key = text(word, 64);
        if (key.length < 4) return { error: 'A secret word needs at least 4 characters.' };
        const accts = (this.sim.s.accounts ??= {});
        let nk = Object.keys(accts).find((k) => accts[k].id === id);
        if (!nk) {
            nk = p.name.toLowerCase();
            if (Object.prototype.hasOwnProperty.call(accts, nk)) return { error: `The name "${p.name}" already belongs to another farmer's secret word.` };
        }
        const salt = randomHex(12);
        accts[nk] = { id, salt, h: this.hash(key, salt) };
        this.fails.delete(nk);
        return { name: p.name };
    }

    /** Takes a farmer's secret word away: they can come back from the device they played on without one (and set a new one there). */
    forgetWord (id: string) {
        const accts = this.sim.s.accounts ?? {};
        const gone = Object.keys(accts).filter((k) => accts[k].id === id);
        for (const k of gone) delete accts[k];
        return gone.length;
    }

    /** A banner for everybody who is in the world now. */
    announce (message: string) {
        const t = text(message, 90).replace(/[\u0000-\u001f]/g, ' ').trim();
        if (!t) return false;
        this.sim.banner(t, 'from the server', PAL.gold);
        this.flushWanted = true;
        return true;
    }

    private send (peer: Peer, msg: ServerMsg) { peer.send(JSON.stringify(msg)); }
    private hasPeer (id: string) { for (const v of this.peers.values()) if (v === id) return true; return false; }

    /** Advance real time: fixed-step simulation, periodic broadcasts and saves. */
    update (dt: number) {
        const k = this.sim.timeScale;                 // (1, but for the Defense Lab's game speed)
        this.stepAcc = Math.min(this.stepAcc + dt * k, 0.25 * k);
        const step = 1 / NET.simHz;
        while (this.stepAcc >= step) { this.sim.step(step); this.stepAcc -= step; }
        this.flushTokens = Math.min(FLUSH_BURST, this.flushTokens + dt * FLUSH_PER_S);
        this.prodAcc += dt;
        this.sendAcc += dt;
        if (this.sendAcc >= NET.sendEvery) { this.sendAcc = 0; this.flush(); } else if (this.flushWanted) this.flush();
        if (this.ghosts.size) {
            const now = this.now();
            for (const [id, until] of this.ghosts) if (now >= until) { this.ghosts.delete(id); this.leave(id); }
        }
        this.saveAcc += dt;
        if (this.saveWanted || this.saveAcc >= NET.saveEvery) { this.saveAcc = 0; this.save(); }
    }

    save () { this.saveWanted = false; this.onSave?.(JSON.stringify(this.sim.s)); }

    /** Send every peer what changed since the last broadcast. */
    flush () {
        const sim = this.sim, s = sim.s;
        this.flushWanted = false;
        const sendProd = this.prodAcc >= 1;
        if (sendProd) this.prodAcc = 0;
        const base = {
            ...(sendProd && s.prod ? { prod: s.prod } : {}),
            ...(sendProd && s.shop ? { shop: s.shop } : {}),
            t: 'tick' as const, time: s.time, clock: s.clock, day: s.day, night: s.night, nightLen: s.nightLen, paused: s.paused,
            plots: [...sim.dirtyPlots].map((i) => s.plots[i]),
            ...(sim.dirtyDug.length ? { dug: [...sim.dirtyDug] } : {}),
        };
        const all = Object.values(s.ents), n = all.length;
        // every entity's position once, not once per peer
        if (this.posX.length < n) { this.posX = new Float64Array(n * 2 + 64); this.posY = new Float64Array(n * 2 + 64); }
        const px = this.posX, py = this.posY;
        for (let i = 0; i < n; i++) {
            const e = all[i];
            if (e.k === 'node') { px[i] = (e.tx + 0.5) * TILE; py[i] = (e.ty + 0.5) * TILE; }
            else if (e.k === 'bld') { const [w, h] = BUILDINGS[e.kind].size; px[i] = (e.tx + w / 2) * TILE; py[i] = (e.ty + h / 2) * TILE; }
            else { px[i] = e.x; py[i] = e.y; }
        }
        const everyone = Object.values(s.players);
        const online = new Set(this.peers.values());
        // each player as JSON, key by key, once per broadcast: the public view for others, everything for yourself
        const pub = new Map<string, { v: Record<string, unknown>; j: Record<string, string> }>();
        const own = new Map<string, { v: Record<string, unknown>; j: Record<string, string> }>();
        for (const p of everyone) {
            const mh = derived(p).maxHearts;
            pub.set(p.id, keyed(publicView(p, mh)));
            if (online.has(p.id)) own.set(p.id, keyed({ ...p, mh, ...(sim.devs.has(p.id) ? { dev: true } : {}) }));      // (the developer menu's flag is in your own view only: never in the world, the save or what others see)
        }
        const R = NET.aoi, R2 = NET.aoi + 96;
        for (const [peer, id] of this.peers) {
            if (!id) continue;
            const me = s.players[id];
            const known = this.known.get(peer) ?? new Set<number>();
            let miss = this.missed.get(peer);
            if (peer.ready && !peer.ready()) {
                // the connection cannot take more right now: remember what it is missing, and tell it once it can
                // (the events of this tick are lost to it: effects it would not see anyway, and a toast or two)
                if (!miss) this.missed.set(peer, miss = { dirty: new Set(), gone: new Set(), plots: new Set(), dug: [] });
                for (const x of sim.dirty) miss.dirty.add(x);
                for (const g of sim.gone) miss.gone.add(g);
                for (const i of sim.dirtyPlots) miss.plots.add(i);
                miss.dug.push(...sim.dirtyDug);
                this.told.get(peer)?.clear();                       // (everyone's record goes out whole once it catches up)
                continue;
            }
            // stream only what's near this player: new arrivals, changed things, and goodbyes
            const ents: Ent[] = [], gone: number[] = [];
            for (let i = 0; i < n; i++) {
                const e = all[i];
                const dist = Math.max(Math.abs(px[i] - me.x), Math.abs(py[i] - me.y));
                if (known.has(e.id)) {
                    if (dist > R2) { gone.push(e.id); known.delete(e.id); } else if (sim.dirty.has(e.id) || (miss && miss.dirty.has(e.id))) ents.push(e);
                } else if (dist <= R) { ents.push(e); known.add(e.id); }
            }
            for (const gid of sim.gone) if (known.delete(gid)) gone.push(gid);
            if (miss) { for (const gid of miss.gone) if (known.delete(gid)) gone.push(gid); this.missed.delete(peer); }
            this.known.set(peer, known);
            let told = this.told.get(peer);
            if (!told) this.told.set(peer, told = new Map());
            const players: PlayerDelta[] = [];
            for (const p of everyone) {
                const cur = p.id === id ? own.get(id)! : pub.get(p.id)!;
                const d = delta(told, p.id, cur);
                if (d) players.push(d);
            }
            const msg: TickMsg = {
                ...base, ents, gone, players,
                ...(miss ? { plots: [...new Set([...sim.dirtyPlots, ...miss.plots])].map((i) => s.plots[i]) } : {}),
                ...(miss && (miss.dug.length || sim.dirtyDug.length) ? { dug: [...sim.dirtyDug, ...miss.dug] } : {}),
                ev: sim.events.filter((e) => {
                    if ('to' in e && e.to) return e.to === id;
                    // effects far from this player are never seen, so they are never sent
                    if (e.e === 'fx' || e.e === 'swing' || e.e === 'shot' || e.e === 'float' || e.e === 'tele' || e.e === 'pod' || e.e === 'work' || e.e === 'emote' || e.e === 'hop') return Math.max(Math.abs(e.x - me.x), Math.abs(e.y - me.y)) <= R2;
                    return true;
                }),
            };
            this.send(peer, msg);
        }
        sim.dirty.clear();
        sim.gone.clear();
        sim.dirtyPlots.clear();
        sim.dirtyDug.length = 0;
        sim.events = [];
    }
}
