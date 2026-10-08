// Packages the dedicated server into server-dist/, ready to copy to any machine with Node 18+:
//   server-dist/awesome-farm-server.mjs   the server + simulation + ws, one file
//   server-dist/public/                   the game client (from `npm run build`)
//   server-dist/start.sh, start.bat       double-click / ./start.sh to run
//   server-dist/README.txt
// Run via `npm run server:build` (which builds the client first).
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// SERVER_DIST=some/dir packages somewhere else (handy when a running server is using server-dist/)
const out = process.env.SERVER_DIST ? pathToFileURL(resolve(process.env.SERVER_DIST) + sep) : new URL('../server-dist/', import.meta.url);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
    entryPoints: [new URL('../server/main.ts', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')],
    outfile: fileURLToPath(new URL('awesome-farm-server.mjs', out)),
    bundle: true,
    platform: 'node',
    // the one version number lives in package.json
    define: { 'process.env.AWESOME_FARM_VERSION': JSON.stringify(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version) },
    target: 'node18',
    format: 'esm',
    // ws is CommonJS; give the ESM bundle a real `require` for Node built-ins
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
    external: ['bufferutil', 'utf-8-validate'],
    legalComments: 'none',
    logLevel: 'warning',
});

const dist = new URL('../dist/', import.meta.url);
if (existsSync(new URL('index.html', dist))) cpSync(dist, new URL('public/', out), { recursive: true });
else console.warn('!! dist/ has no index.html — run `npm run build` first to bundle the game client');

writeFileSync(new URL('start.sh', out), '#!/bin/sh\ncd "$(dirname "$0")"\nexec node awesome-farm-server.mjs "$@"\n', { mode: 0o755 });
writeFileSync(new URL('start.bat', out), '@echo off\r\ncd /d "%~dp0"\r\nnode awesome-farm-server.mjs %*\r\npause\r\n');
writeFileSync(new URL('README.txt', out), `AWESOME FARM — DEDICATED SERVER
================================

One persistent world for up to 16 players. Needs Node.js 18 or newer (https://nodejs.org).

START
  Windows:  double-click start.bat
  Mac/Linux: ./start.sh
  Anywhere: node awesome-farm-server.mjs --help

Then open http://localhost:7777 — the server serves the game itself.
Friends on the same network use the LAN address the server prints.

PLAYING OVER THE INTERNET (pick one)
  * Free tunnel, no router setup: install cloudflared and run
        cloudflared tunnel --url http://localhost:7777
    Share the https://….trycloudflare.com link it prints.
  * Port forwarding: forward TCP port 7777 on your router to this machine and share
        http://<your public IP>:7777
  * A VPS / home server: copy this folder there, run start.sh, open the port
    (put it behind HTTPS with Caddy or nginx if you want an https:// address).

OPTIONS (flags or environment variables)
  --port 7777          PORT
  --world farm         WORLD        each world name is its own save file
  --password secret    PASSWORD     players must type it to join
  --name "My Farm"     SERVER_NAME
  --data ./worlds      DATA_DIR     saves live here (farm.json + farm.json.bak)
  --dev-key secret     AWESOME_FARM_DEV_KEY   unlocks the in-game developer menu (tap the portrait 7 times);
                                    without it nobody can open the menu on this server
  --cheats                          allow the old test commands: never on a real server

The world saves every 20 seconds, whenever a player leaves, and on Ctrl+C or when the window closes.
A damaged farm.json is set aside and the backup is loaded instead. If the simulation ever crashes,
the world as it was goes to farm.crash-<time>.json and the last good save is left alone.
Back up the worlds/ folder to keep your farm safe.

FARMERS AND SECRET WORDS
  On the title screen a player picks a name and a secret word the first time they join. The same two on any phone or
  computer bring back the same farmer. The server keeps only a salted hash of the word, in the world save.
`);
console.log('server-dist/ ready');
