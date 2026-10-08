// Dev-only helpers for driving the game from the console or browser automation.
// A hidden browser pane stops requestAnimationFrame, so __step() advances the loop by hand.
//
//   __step(60)          advance 60 frames (1 s)       → returns the active scene keys
//   __key('e')          tap a key (also 'down' / 'up') → Phaser sees a real keyCode
//   __farm              { scene, conn, me, sim } once in a world (sim = the in-browser world, solo only)
//   __errs              uncaught errors since load
//   __real(n)           n frames in real time (needed when something async is involved)
//   __solo(loot?)       from the title screen: start a solo world (optionally with a pile of items and levels)
//   __gallery(keys, o)  lay texture keys out on a meadow over the game (o: { zoom, cols, bg, close }) for looking at art; __gallery() removes it
//   __day(frames)       solo: step with the clock pinned at midday and every farmer topped up (for screenshots)
//   __shot(x,y,w,h)     the game canvas (or a crop of it, in canvas pixels, optionally scaled by 'z') as a PNG data URL

import type { Game } from 'phaser';
import type { Connection } from '../client/net/connection';
import type { GameScene } from '../client/scenes/Game';
import type { Res } from '../shared/data/items';
import type { PlayerS } from '../shared/sim/types';

/** What `__farm` gives the console once a world is running (GameScene.exposeDebug sets it, in dev builds only). */
interface FarmDebug {
    scene: GameScene;
    readonly conn: Connection;
    /** solo only: the in-browser simulation (give items, jump the clock…) */
    readonly sim: unknown;
    readonly me: PlayerS | null;
    give (res: Res, n?: number): void;
    xp (n?: number): void;
    unlockAll (): void;
    night (): void;
}

declare global {
    interface Window { __farm?: FarmDebug }
}

const KEYS: Record<string, [string, number]> = {
    ' ': ['Space', 32], Enter: ['Enter', 13], Escape: ['Escape', 27],
    w: ['KeyW', 87], a: ['KeyA', 65], s: ['KeyS', 83], d: ['KeyD', 68],
    e: ['KeyE', 69], f: ['KeyF', 70], b: ['KeyB', 66], r: ['KeyR', 82], m: ['KeyM', 77], i: ['KeyI', 73], c: ['KeyC', 67], k: ['KeyK', 75], x: ['KeyX', 88], Tab: ['Tab', 9],
    1: ['Digit1', 49], 2: ['Digit2', 50], 3: ['Digit3', 51], 4: ['Digit4', 52], 5: ['Digit5', 53], 6: ['Digit6', 54], 7: ['Digit7', 55], 8: ['Digit8', 56],
};
// every other letter, the arrows and a few more, so any hotkey can be fired
for (let c = 65; c < 91; c++) { const l = String.fromCharCode(c + 32); KEYS[l] ??= ['Key' + String.fromCharCode(c), c]; }
KEYS.ArrowUp = ['ArrowUp', 38]; KEYS.ArrowDown = ['ArrowDown', 40]; KEYS.ArrowLeft = ['ArrowLeft', 37]; KEYS.ArrowRight = ['ArrowRight', 39]; KEYS['/'] = ['Slash', 191];

export function installHarness (game: Game) {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const w = window as unknown as Record<string, unknown>;
    let t = performance.now();
    const errs: string[] = [];
    window.addEventListener('error', (e) => errs.push(String(e.message)));
    const step = (n = 60, dt = 1000 / 60) => {
        for (let i = 0; i < n; i++) { t += dt; game.loop.step(t); }
        return game.scene.getScenes(true).map((s) => s.scene.key);
    };
    const fire = (k: string, type: 'keydown' | 'keyup') => {
        const [code, keyCode] = KEYS[k];
        window.dispatchEvent(new KeyboardEvent(type, { key: k, code, keyCode, bubbles: true } as KeyboardEventInit));
    };
    const real = async (n: number) => { for (let i = 0; i < n; i++) { await sleep(16); step(1); } };
    w.__real = real;
    w.__solo = async (loot = false) => {
        await sleep(1800);
        await real(20);
        const title = game.scene.getScene('Title') as unknown as { start: (f: () => unknown) => void };
        const { LocalConnection } = await import('../client/net/connection');
        title.start(() => new LocalConnection());
        await real(60); await sleep(400); await real(80);
        const farm = window.__farm!;
        if (loot) {
            const items: [Res, number][] = [['wood', 60], ['stone', 40], ['iron', 12], ['copper', 6], ['coal', 20], ['sand', 8], ['clay', 6], ['fiber', 10], ['ironbar', 10], ['plank', 12], ['berry', 12], ['mushroom', 4], ['seed_wheat', 3], ['seed_carrot', 2], ['potion_heal', 2], ['bread', 3], ['crystal', 2], ['cotton', 6], ['glass', 4], ['brick', 6], ['coin', 150]];
            for (const [r, n] of items) farm.give(r, n);
            farm.xp(400);
        }
        await real(30);
        return game.scene.getScenes(true).map((sc) => sc.scene.key);
    };
    w.__shot = (cx = 0, cy = 0, cw = 0, ch = 0, z = 1) => new Promise<string>((resolve) => {
        game.renderer.snapshot((img) => {
            const done = (el: HTMLImageElement | Phaser.Display.Color) => {
                const c = document.createElement('canvas');
                const im = el as HTMLImageElement;
                const sw = cw || im.width, sh = ch || im.height;
                c.width = sw * z; c.height = sh * z;
                const cx2 = c.getContext('2d')!;
                cx2.imageSmoothingEnabled = false;
                cx2.drawImage(im, cx, cy, sw, sh, 0, 0, sw * z, sh * z);
                resolve(c.toDataURL('image/png'));
            };
            const im = img as HTMLImageElement;
            if (im.complete) done(im); else im.onload = () => done(im);
        });
        step(1);
    });
    let gallery: Phaser.GameObjects.Container | null = null;
    w.__gallery = (keys?: string[], o: { zoom?: number; cols?: number; bg?: number; gap?: number } = {}) => {
        gallery?.destroy(); gallery = null;
        if (!keys) return 0;
        const sc = game.scene.getScene('Hud') as Phaser.Scene;
        const zoom = o.zoom ?? 4, cols = o.cols ?? 8, gap = o.gap ?? 8;
        const c = sc.add.container(0, 0).setDepth(500);
        c.add(sc.add.rectangle(0, 0, 960, 540, o.bg ?? 0x92d364).setOrigin(0));
        let x = 8, y = 8, rowH = 0, n = 0;
        for (const key of keys) {
            if (!sc.textures.exists(key)) continue;
            const tex = sc.textures.get(key);
            const names = tex.getFrameNames().filter((nm) => nm !== '__BASE');
            for (const nm of (names.length ? names : [0]).slice(0, 6)) {
                const fr = tex.get(nm as string | number);
                const wpx = fr.realWidth * zoom, hpx = fr.realHeight * zoom;
                if (n > 0 && n % cols === 0) { x = 8; y += rowH + gap; rowH = 0; }
                c.add(sc.add.image(x, y, key, nm as string | number).setOrigin(0).setScale(zoom));
                x += wpx + gap; rowH = Math.max(rowH, hpx); n++;
            }
        }
        gallery = c;
        return n;
    };
    w.__day = (frames = 30) => {
        const sim = window.__farm?.sim as { s: { clock: number; players: Record<string, { hearts: number; mh?: number; downed: number }> } } | undefined;
        for (let i = 0; i < frames; i++) {
            const s = sim?.s;
            if (s) { s.clock = 50; (s as unknown as { night: boolean }).night = false; for (const p of Object.values(s.players)) { p.downed = 0; p.hearts = 20; } }
            step(1);
        }
    };
    w.__game = game;
    w.__errs = errs;
    w.__step = step;
    w.__key = (k: string, mode: 'tap' | 'down' | 'up' = 'tap') => {
        if (mode !== 'up') fire(k, 'keydown');
        if (mode === 'tap') step(2);
        if (mode !== 'down') fire(k, 'keyup');
        step(1);
    };
}
