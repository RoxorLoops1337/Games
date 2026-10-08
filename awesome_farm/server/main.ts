// Awesome Farm dedicated server.
//
// One Node.js process = one persistent world for up to 16 players. It serves the game
// itself (so friends just open http://<host>:7777), accepts players over a WebSocket at
// /ws, runs the shared simulation (src/shared) and saves the world to disk.
//
//   node awesome-farm-server.mjs [--port 7777] [--world farm] [--password secret]
//                                [--name "My Farm"] [--data ./worlds] [--public ./public] [--dev-key secret]
// Every flag also reads an env var: PORT, WORLD, PASSWORD, SERVER_NAME, DATA_DIR, PUBLIC_DIR, AWESOME_FARM_DEV_KEY.

import { createHash } from 'node:crypto';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { copyFile, rename, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { MAX_PLAYERS } from '../src/shared/config';
import { SimHost, type Peer } from '../src/shared/net/host';
import { PROTOCOL } from '../src/shared/net/protocol';
import { makeSeed } from '../src/shared/rng';
import { Sim } from '../src/shared/sim/sim';
import type { WorldState } from '../src/shared/sim/types';

/** The version in package.json: stamped into the bundle by scripts/build-server.mjs; a dev run (tsx) reads the file itself. */
const VERSION: string = process.env.AWESOME_FARM_VERSION ?? (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;
/** Seconds a farmer whose socket dropped (a phone asleep) stays in the world before they count as gone. */
const GRACE_S = 30;
/** Inbound messages per connection: a steady rate with a burst (movement is 10 a second), and a flood ends the connection. */
const MSG_PER_S = 40, MSG_BURST = 80, MSG_DROPS_TO_KICK = 400, MSG_MAX = 64 * 1024;
/** Outbound: a tick waits while a connection's send buffer is this full, and a connection that cannot keep up at all is cut. */
const SLOW_BYTES = 256 * 1024, DEAD_BYTES = 2 * 1024 * 1024;

// ── config ─────────────────────────────────────────────────────────────────
function flag (name: string, env: string, fallback: string) {
    const i = process.argv.indexOf(`--${name}`);
    if (i > 0 && process.argv[i + 1] !== undefined) return process.argv[i + 1];
    return process.env[env] ?? fallback;
}
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`Awesome Farm dedicated server — one persistent world for up to ${MAX_PLAYERS} players.

  node awesome-farm-server.mjs [options]

  --port <n>         port for the game and its WebSocket   (PORT, default 7777)
  --world <name>     which world file to load or create    (WORLD, default farm)
  --password <text>  players must enter this to join       (PASSWORD, default none)
  --name <text>      server name shown to players          (SERVER_NAME)
  --data <dir>       where world saves live                (DATA_DIR, default ./worlds)
  --public <dir>     game client to serve                  (PUBLIC_DIR, default ./public)
  --dev-key <text>   the secret that unlocks the in-game developer menu   (AWESOME_FARM_DEV_KEY, default: nobody can)
  --cheats           allow test commands (never on a real server)`);
    process.exit(0);
}
const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(flag('port', 'PORT', '7777'));
const WORLD = flag('world', 'WORLD', 'farm').replace(/[^a-zA-Z0-9_-]/g, '') || 'farm';
const PASSWORD = flag('password', 'PASSWORD', '');
const NAME = flag('name', 'SERVER_NAME', 'Awesome Farm server');
const DEV_KEY = flag('dev-key', 'AWESOME_FARM_DEV_KEY', '');        // (never logged, never sent; the host keeps only a salted hash)
const CHEATS = process.argv.includes('--cheats');
const DATA = resolve(flag('data', 'DATA_DIR', join(process.cwd(), 'worlds')));
const PUBLIC = resolve(flag('public', 'PUBLIC_DIR', [join(here, 'public'), join(here, '..', 'dist')].find((d) => existsSync(join(d, 'index.html'))) ?? join(here, 'public')));

const log = (line: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${line}`);

// ── world: load the save, else its backup, else start fresh ────────────────
mkdirSync(DATA, { recursive: true });
const file = join(DATA, `${WORLD}.json`);
const bak = `${file}.bak`;
let sim: Sim | null = null;
for (const [path, what] of [[file, 'save'], [bak, 'backup']] as const) {
    if (!existsSync(path)) continue;
    try {
        const state = JSON.parse(readFileSync(path, 'utf8')) as WorldState;
        sim = new Sim(state);
        log(`Loaded world "${WORLD}"${what === 'backup' ? ' from its backup' : ''} — day ${state.day}, ${Object.keys(state.players).length} farmers, ${state.plots.filter((p) => p.owned).length} plots of land`);
        break;
    } catch (err) {
        // a save from an older version (or a damaged one) is kept aside, never overwritten
        const aside = join(DATA, `${WORLD}.incompatible-${Date.now()}${what === 'backup' ? '-bak' : ''}.json`);
        renameSync(path, aside);
        log(`!! the ${what} could not be loaded: ${(err as Error).message}. It was moved to ${aside}.`);
    }
}
if (!sim) {
    sim = Sim.create(`${WORLD}-${makeSeed()}`, WORLD);
    log(`Created a new world "${WORLD}" (seed ${sim.s.seed})`);
}
sim.cheats = CHEATS;

/** The same stretched hash as `hashKey` in net/sha256.ts (the saved rows depend on it), with Node's native SHA-256: about 2 ms instead of 13. */
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function hashKeyNative (key: string, salt: string) {
    let h = sha(`${salt}:${key}`);
    for (let i = 0; i < 2000; i++) h = sha(`${h}${salt}`);
    return h;
}

const host = new SimHost(sim, NAME, PASSWORD, { devKey: DEV_KEY, hash: hashKeyNative, grace: GRACE_S });
host.onLog = log;

// ── saves: a temp file, the current save copied to .bak, the temp file renamed over it, so a save always exists ──
let writing = false, queued: string | null = null;
async function writeWorld (json: string) {
    if (writing) { queued = json; return; }                          // (one write at a time; the newest state wins)
    writing = true;
    const tmp = `${file}.tmp`;
    try {
        await writeFile(tmp, json);
        if (existsSync(file)) await copyFile(file, bak);
        await rename(tmp, file);
    } catch (err) {
        log(`!! could not save the world: ${(err as Error).message}`);
    } finally {
        writing = false;
        if (queued) { const next = queued; queued = null; void writeWorld(next); }
    }
}
/** The same, blocking: for the way out (shutdown, a crash), when nothing may be left half done. */
function writeWorldSync (json: string) {
    const tmp = `${file}.exit.tmp`;                                   // (its own name: an async write may still own the other)
    writeFileSync(tmp, json);
    if (existsSync(file)) copyFileSync(file, bak);
    renameSync(tmp, file);
}
/** A world that may be half-changed goes to its own file, never over the good save. */
function writeCrash () {
    const path = join(DATA, `${WORLD}.crash-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    try { writeFileSync(path, JSON.stringify(sim!.s)); log(`The world as it was went to ${path}`); } catch (err) { log(`!! could not write the crash file: ${(err as Error).message}`); }
}
let tainted = false;      // a tick threw: the state may be half-changed, so nothing goes over the good save until a tick completes cleanly
host.onSave = (json) => { if (!tainted) void writeWorld(json); };

// ── http: status + the game client ─────────────────────────────────────────
const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
    '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
const http = createServer((req, res) => {
    try {
        const url = new URL(req.url ?? '/', 'http://x');
        if (url.pathname === '/status') {
            res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
            res.end(JSON.stringify({
                game: 'awesome-farm', version: VERSION, protocol: PROTOCOL, name: NAME, world: WORLD,
                online: host.playerCount, max: MAX_PLAYERS, farmers: Object.keys(sim!.s.players).length,
                day: sim!.s.day, password: !!PASSWORD,
            }));
            return;
        }
        const path = resolve(PUBLIC, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
        if (!path.startsWith(PUBLIC + sep) || !existsSync(path) || !statSync(path).isFile()) {
            res.writeHead(404, { 'content-type': 'text/plain' });
            res.end(existsSync(PUBLIC) ? 'Not found' : 'This server has no game client bundled (see --public).');
            return;
        }
        res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
        createReadStream(path).on('error', () => res.destroy()).pipe(res);      // (a file that cannot be read ends the response, not the process)
    } catch {
        // a broken URL (an unfinished %-escape, say) is the caller's problem, never the world's
        if (res.headersSent) res.destroy();
        else { res.writeHead(400, { 'content-type': 'text/plain' }); res.end('Bad request'); }
    }
});

// ── websocket: one Peer per socket ─────────────────────────────────────────
// compress the messages: the welcome is a megabyte of plain JSON and a tick a few kilobytes, which is a lot to ask of a phone on mobile data
const wss = new WebSocketServer({
    server: http, path: '/ws', maxPayload: 2 * MSG_MAX,            // (the hard stop; our own check below closes with a reason first)
    perMessageDeflate: { threshold: 512, zlibDeflateOptions: { level: 3 }, serverNoContextTakeover: true, clientNoContextTakeover: true, concurrencyLimit: 4 },
});
wss.on('connection', (ws: WebSocket, req) => {
    const addr = req.socket.remoteAddress ?? '?';
    const peer: Peer = {
        addr,
        send: (text) => {
            if (ws.readyState !== ws.OPEN) return;
            // a connection that cannot keep up would only eat memory: cut it, the client reconnects
            if (ws.bufferedAmount > DEAD_BYTES) { log(`!! ${addr} cannot keep up (${(ws.bufferedAmount / 1024).toFixed(0)} KB waiting): disconnected`); ws.terminate(); return; }
            ws.send(text);
        },
        ready: () => ws.bufferedAmount < SLOW_BYTES,
        close: () => ws.close(),
    };
    host.attach(peer);
    let alive = true;
    ws.on('pong', () => { alive = true; });
    const ping = setInterval(() => {
        if (!alive) { ws.terminate(); return; }
        alive = false;
        ws.ping();
    }, 15000);
    // inbound rate: a token bucket per connection, with movement counted too
    let tokens = MSG_BURST, filled = performance.now(), dropped = 0;
    ws.on('message', (data) => {
        const size = Array.isArray(data) ? data.reduce((n, b) => n + b.byteLength, 0) : data.byteLength;
        if (size > MSG_MAX) { ws.close(1009, 'Message too big'); return; }
        const now = performance.now();
        tokens = Math.min(MSG_BURST, tokens + (now - filled) / 1000 * MSG_PER_S);
        filled = now;
        if (tokens < 1) {
            if (++dropped >= MSG_DROPS_TO_KICK) { log(`!! ${addr} floods the server: disconnected`); ws.close(1008, 'Too many messages'); }
            return;
        }
        tokens--;
        // whatever a client sends, it must never take the process down
        try { host.receive(peer, data.toString()); } catch (err) { log(`!! bad message from a client: ${(err as Error).message}`); }
    });
    // 1006 is a line that just died (a phone asleep, a tunnel gone): the farmer is kept a while; any proper close frame means they left
    ws.on('close', (code) => { clearInterval(ping); host.detach(peer, code !== 1006); });
    ws.on('error', () => ws.close());
});

// ── the clock: simulate only while someone is connected (or owed a save, a tick, or a wait) ──
let last = performance.now();
setInterval(() => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    if (host.playerCount === 0 && !host.pending) return;
    try {
        host.update(dt);
        tainted = false;
    } catch (err) {
        // one bad tick must not take the whole world down: say so, keep the world as it is in its own file, carry on
        log(`!! simulation error: ${(err as Error).stack ?? err}`);
        if (!tainted) { tainted = true; writeCrash(); }
    }
}, 50);

let leaving = false;
function shutdown (why: string) {
    if (leaving) return;                                              // (two signals, one save)
    leaving = true;
    log(`Saving and shutting down (${why})…`);
    try { if (tainted) writeCrash(); else writeWorldSync(JSON.stringify(sim!.s)); } catch (err) { log(`!! could not save the world: ${(err as Error).message}`); }
    process.exit(0);
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP'] as const) process.on(sig, () => shutdown(sig));
function die (what: string, err: unknown) {
    if (leaving) return;
    leaving = true;
    log(`!! ${what}: ${(err as Error)?.stack ?? err}`);
    // the world may be mid-change: a tainted one goes to a crash file, a sound one is saved as usual, and the process ends so the start script can bring it back
    try { if (tainted) writeCrash(); else writeWorldSync(JSON.stringify(sim!.s)); } catch (e) { log(`!! could not save the world: ${(e as Error).message}`); }
    process.exit(1);
}
process.on('uncaughtException', (err) => die('uncaught exception', err));
process.on('unhandledRejection', (err) => die('unhandled rejection', err));

http.listen(PORT, () => {
    const lan = Object.values(networkInterfaces()).flat()
        .filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => `http://${n!.address}:${PORT}`);
    log(`Awesome Farm server ${VERSION} — "${NAME}", world "${WORLD}"${PASSWORD ? ', password protected' : ''}${DEV_KEY ? ', developer menu: key set' : ''}${CHEATS ? ', CHEATS ON (testing only)' : ''}`);
    log(`Saves: ${file}`);
    log(existsSync(join(PUBLIC, 'index.html')) ? `Game client: ${PUBLIC}` : `!! No game client found at ${PUBLIC} — players can still join from another copy of the game`);
    log(`Play here:          http://localhost:${PORT}`);
    for (const url of lan) log(`Friends on your LAN: ${url}`);
    log('Over the internet: forward TCP port ' + PORT + ', or run a free tunnel:  cloudflared tunnel --url http://localhost:' + PORT);
});
