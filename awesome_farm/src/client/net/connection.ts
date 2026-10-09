// How the client talks to a world. Solo runs the same SimHost the dedicated server runs,
// inside this browser; online talks to a server over a WebSocket. The Game scene only
// sees this interface, so solo and online play behave the same.

import { SimHost, type Peer } from '../../shared/net/host';
import { PROTOCOL, type ClientMsg, type ServerMsg } from '../../shared/net/protocol';
import { makeSeed } from '../../shared/rng';
import * as labWorld from '../../shared/sim/lab';
import { Sim } from '../../shared/sim/sim';
import type { Cmd, WorldState } from '../../shared/sim/types';
import { profile, saveProfile, SOLO_KEY } from '../profile';

export interface Connection {
    readonly mode: 'solo' | 'online';
    readonly label: string;
    /** `connecting` is also a dropped line being picked up again (`error` then says so); `closed` is final. */
    status: 'connecting' | 'open' | 'closed';
    error: string;
    send (c: Cmd): void;
    /** Advance (solo) and hand over every message received since the last call. */
    poll (dt: number): ServerMsg[];
    /** Solo: write the world to the browser's storage right now (the page is going away). */
    saveNow? (): void;
    /** Solo: set when the browser refused the save (storage full or blocked), so the player can be told. */
    saveFailed?: boolean;
    /** What it takes to open this same connection again after a page reload (switching to the 3D view comes straight back to the world). */
    resumeInfo (): Resume;
    close (): void;
}

/** A connection written down for one page reload: solo, or the server with the password and secret word that got you in. */
export type Resume = { mode: 'solo' } | { mode: 'online'; addr: string; password: string; key: string };
/** sessionStorage, read once by the title screen and removed at once (it can hold a server password, so it never outlives the tab). */
const RESUME_KEY = 'awesome_farm_resume_v1';

export function stashResume (r: Resume) {
    try { sessionStorage.setItem(RESUME_KEY, JSON.stringify(r)); } catch { /* blocked storage: the title screen shows as usual */ }
}

export function takeResume (): Resume | null {
    try {
        const raw = sessionStorage.getItem(RESUME_KEY);
        sessionStorage.removeItem(RESUME_KEY);
        const r = raw ? JSON.parse(raw) as Partial<Resume> : null;
        if (r?.mode === 'solo') return { mode: 'solo' };
        if (r?.mode === 'online' && typeof r.addr === 'string' && r.addr) return { mode: 'online', addr: r.addr, password: String(r.password ?? ''), key: String(r.key ?? '') };
    } catch { /* nothing usable */ }
    return null;
}

/** Solo world saved in localStorage; or, with `lab`, the Defense Lab (shared/sim/lab.ts): a world of its own, never saved, cheats on. */
export class LocalConnection implements Connection {
    readonly mode = 'solo';
    readonly label: string;
    status: Connection['status'] = 'open';
    resumeInfo (): Resume { return { mode: 'solo' }; }
    error = '';
    private host: SimHost;
    private peer: Peer;
    private inbox: ServerMsg[] = [];
    saveFailed = false;
    /** How long the last simulation step took, in milliseconds (a running average; the Developer screen shows it). */
    stepMs = 0;

    static savedDay (): number | null {
        try {
            const raw = localStorage.getItem(SOLO_KEY);
            return raw ? (JSON.parse(raw) as WorldState).day : null;
        } catch { return null; }
    }

    static wipe () { try { localStorage.removeItem(SOLO_KEY); } catch { /* ignore */ } }

    constructor (readonly lab: '' | 'defense' = '') {
        this.label = lab ? 'Defense Lab' : 'Solo';
        if (lab) {
            // the lab: built fresh every time, never read from or written to the browser's storage
            this.host = new SimHost(labWorld.create(profile.id, profile.name), 'Defense Lab', '', { devOpen: true });
            this.peer = { send: (text) => { this.inbox.push(JSON.parse(text)); } };
            this.host.attach(this.peer);
            this.host.receive(this.peer, JSON.stringify({ t: 'hello', v: PROTOCOL, id: profile.id, name: profile.name } satisfies ClientMsg));
            this.send({ t: 'devdo', op: 'god', on: true });          // (god mode to begin with: a new connection strips the menu's buffs)
            const sim = this.host.sim;
            sim.events = [];                          // (no "welcome back" and no float for that: a lab banner instead)
            for (const m of this.inbox) if (m.t === 'tick') m.ev = [];
            sim.banner('Defense Lab', 'Send a wave from the Lab panel and watch the towers work', 0xffd966, profile.id);
            return;
        }
        let sim: Sim | null = null;
        try {
            const raw = localStorage.getItem(SOLO_KEY);
            if (raw) {
                try { sim = new Sim(JSON.parse(raw)); } catch (err) {
                    // an older (or damaged) world: keep it aside instead of overwriting it with the new one
                    try { localStorage.setItem(`${SOLO_KEY}:old-${Date.now()}`, raw); } catch { /* quota */ }
                    console.warn('Solo world could not be loaded, a fresh one was started:', (err as Error).message);
                }
            }
        } catch { sim = null; }
        this.host = new SimHost(sim ?? Sim.create(makeSeed(), 'solo'), 'Solo', '', { devOpen: true });       // (solo: the world is nobody else's, so the developer menu needs no key)
        this.host.sim.cheats = import.meta.env.DEV;
        this.host.onSave = (json) => { try { localStorage.setItem(SOLO_KEY, json); this.saveFailed = false; } catch { this.saveFailed = true; } };
        this.peer = { send: (text) => { this.inbox.push(JSON.parse(text)); } };
        this.host.attach(this.peer);
        this.host.receive(this.peer, JSON.stringify({ t: 'hello', v: PROTOCOL, id: profile.id, name: profile.name } satisfies ClientMsg));
        this.host.save();
    }

    send (c: Cmd) { this.host.receive(this.peer, JSON.stringify({ t: 'cmd', c } satisfies ClientMsg)); }

    saveNow () { this.host.save(); }

    /** Dev harness access to the in-browser simulation. */
    get debugSim () { return this.host.sim; }

    poll (dt: number) {
        const t0 = performance.now();
        this.host.update(dt);
        this.stepMs += (performance.now() - t0 - this.stepMs) * 0.1;
        const msgs = this.inbox;
        this.inbox = [];
        return msgs;
    }

    close () {
        this.host.save();
        this.host.detach(this.peer);
        this.status = 'closed';
    }
}

/** "host:port", "http(s)://host" or "ws(s)://host/ws" → a WebSocket URL. */
function toWsUrl (address: string) {
    let a = address.trim().replace(/\/+$/, '');
    if (/^https:\/\//i.test(a)) a = 'wss://' + a.slice(8);
    else if (/^http:\/\//i.test(a)) a = 'ws://' + a.slice(7);
    else if (!/^wss?:\/\//i.test(a)) a = (location.protocol === 'https:' ? 'wss://' : 'ws://') + a;
    return /\/ws$/.test(a) ? a : `${a}/ws`;
}

/** "…/ws" WebSocket URL → the server's http(s) status endpoint. */
export const statusUrl = (address: string) => toWsUrl(address).replace(/^ws/, 'http').replace(/\/ws$/, '/status');

/** How long to wait before each new try at a dropped connection, in seconds; after the last the connection is closed for good. */
export const RECONNECT_WAITS = [1, 2, 4, 8, 8];
/** A small ping while connected, even standing still: a Cloudflare-hosted world counts its CPU budget from the last message it got, and any server learns sooner that a line went quiet. */
const HEARTBEAT_MS = 10_000;

/** A party world on a dedicated server. A line that drops after we were in is picked up again (the server keeps the farmer a while); the welcome re-syncs the world. */
export class WsConnection implements Connection {
    readonly mode = 'online';
    status: Connection['status'] = 'connecting';
    error = '';
    private ws!: WebSocket;
    private inbox: ServerMsg[] = [];
    private welcomed = false;          // we were in once: a drop is worth retrying
    private refused = false;           // the server said no: no point retrying
    private tries = 0;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private beat: ReturnType<typeof setInterval> | null = null;
    resumeInfo (): Resume { return { mode: 'online', addr: this.label, password: this.password, key: this.key }; }
    private readonly onVisible = () => { if (document.visibilityState === 'visible' && this.timer) { clearTimeout(this.timer); this.timer = null; this.open(); } };

    constructor (readonly label: string, private password: string, private key = '') {
        this.open();
        document.addEventListener('visibilitychange', this.onVisible);       // a phone waking up tries at once instead of waiting out the backoff
    }

    private open () {
        const ws = this.ws = new WebSocket(toWsUrl(this.label));
        ws.onopen = () => {
            if (ws !== this.ws) return;
            this.status = 'open';
            this.error = '';
            this.tries = 0;
            const id = profile.srv?.[this.label] ?? profile.id;
            ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL, id, name: profile.name, password: this.password, ...(this.key ? { acct: { name: profile.name, key: this.key } } : {}) } satisfies ClientMsg));
            if (!this.beat) this.beat = setInterval(() => { if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'ping' } satisfies ClientMsg)); }, HEARTBEAT_MS);
        };
        ws.onmessage = (ev) => {
            try {
                const msg = JSON.parse(String(ev.data)) as ServerMsg;
                if (msg.t === 'refused') { this.error = msg.reason; this.refused = true; }
                if (msg.t === 'welcome') {
                    this.welcomed = true;
                    if ((profile.srv?.[this.label] ?? profile.id) !== msg.you) { (profile.srv ??= {})[this.label] = msg.you; saveProfile(); }       // the server knows you as this farmer
                }
                this.inbox.push(msg);
            } catch { /* ignore junk */ }
        };
        ws.onclose = () => {
            if (ws !== this.ws || this.status === 'closed') return;
            if (!this.welcomed || this.refused) {
                if (!this.error) this.error = this.status === 'connecting' ? "Couldn't reach the server." : 'Lost connection to the server.';
                this.status = 'closed';
                this.stop();
                return;
            }
            if (this.tries >= RECONNECT_WAITS.length) {
                this.error = 'Lost connection to the server.';
                this.status = 'closed';
                this.stop();
                return;
            }
            const wait = RECONNECT_WAITS[this.tries++];
            this.status = 'connecting';
            this.error = `Reconnecting… (try ${this.tries} of ${RECONNECT_WAITS.length})`;
            this.timer = setTimeout(() => { this.timer = null; this.open(); }, wait * 1000);
        };
        ws.onerror = () => { /* onclose follows with the message */ };
    }

    private stop () {
        if (this.timer) { clearTimeout(this.timer); this.timer = null; }
        if (this.beat) { clearInterval(this.beat); this.beat = null; }
        document.removeEventListener('visibilitychange', this.onVisible);
    }

    send (c: Cmd) {
        if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'cmd', c } satisfies ClientMsg));
    }

    poll () {
        const msgs = this.inbox;
        this.inbox = [];
        return msgs;
    }

    close () {
        this.status = 'closed';
        this.stop();
        this.ws.close();
    }
}
