// Title: an animated island scene, your name, solo play, or join a server (the dedicated
// server serves this page too, in which case its address is filled in for you), and the view: 2D or 3D (beta).
// A page reload that switches the view (world/view3d-bridge.ts) comes back here and goes straight into the same world.

import * as Phaser from 'phaser';
import { PUBLIC_SERVER, splitAddress, worldAddress, type WorldInfo } from '../../shared/data/servers';
import { PROTOCOL } from '../../shared/net/protocol';
import { css, PAL } from '../../shared/palette';
import { TILE_SHALLOW, tileCliff, tileGround, tileShore } from '../art/sprites';
import { Fx } from '../juice/fx';
import { LAB } from '../lab';
import { LocalConnection, stashResume, statusUrl, takeResume, worldsUrl, WsConnection, type Connection, type Resume } from '../net/connection';
import { canSwitchLive } from '../world/view3d-bridge';
import { profile, saveProfile } from '../profile';
import { saveSettings, settings } from '../settings';
import { button, FONT_TEXT, H, label, panel, W } from '../ui/kit';
import { rect, STYLES } from '../ui/px';
import { hudCamera } from '../res';
import { PAPER, TEXT, WOOD } from '../ui/theme';

/** The Defense Lab opens by itself once per page load. */
let labOpened = false;

export class TitleScene extends Phaser.Scene {
    private fx!: Fx;
    private starting = false;
    private nameInput!: HTMLInputElement;
    private addrInput!: HTMLInputElement;
    /** The server buttons (Play online): shown when the address in the box is a Cloudflare host with several worlds. */
    private picker: { base: string; def: string; worlds: WorldInfo[]; btns: ReturnType<typeof button>[]; counts: Map<string, string>; custom: boolean } | null = null;
    private serverLabel!: Phaser.GameObjects.Text;
    private customLink!: Phaser.GameObjects.Text;
    private passInput!: HTMLInputElement;
    private keyInput!: HTMLInputElement;
    private serverStatus!: Phaser.GameObjects.Text;
    private notice = '';          // why we came back (wrong password, server gone…): shown until you edit the form
    private checkTimer?: Phaser.Time.TimerEvent;
    private wipeArmed = false;
    /** The address came from the player (typed, saved from last time, or Join was pressed): a server that cannot be reached is then worth a red line. A default nobody asked for is checked quietly. */
    private addrTheirs = false;
    private clouds: Phaser.GameObjects.Graphics[] = [];
    private t = 0;
    private waves!: Phaser.GameObjects.Graphics;

    constructor () {
        super('Title');
    }

    init (data?: { notice?: string }) {
        this.notice = data?.notice ?? '';
    }

    create () {
        this.fx = new Fx(this, 3);
        this.starting = false;
        this.wipeArmed = false;
        this.t = 0;
        this.input.keyboard!.clearCaptures();   // let the text fields receive Space etc.
        hudCamera(this.cameras.main).setBackgroundColor(PAL.deepSea).fadeIn(300, 27, 26, 38);

        this.drawScene();
        const title = this.add.container(270, 104);
        const t1 = this.add.image(0, 0, 'logo_awesome');
        const t2 = this.add.image(0, 58, 'logo_farm');
        title.add([t1, t2]);
        this.tweens.add({ targets: title, y: 112, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: t1, angle: { from: -1.5, to: 1.5 }, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: t2, angle: { from: 1.5, to: -1.5 }, duration: 3100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        label(this, 270, 212, 'build a farm with up to 16 friends', 18, PAL.cream, { origin: [0.5, 0.5], stroke: 5, font: 'head' });
        label(this, 270, 520, 'You all start on far-apart islands — expand until you find each other.', 13, PAL.cream, { origin: [0.5, 0.5], stroke: 4, font: 'head', bold: false });

        const snd = button(this, 62, 24, 100, 28, `Sound ${settings.sound ? 'on' : 'off'}`, () => {
            settings.sound = !settings.sound; saveSettings(); snd.setLabel(`Sound ${settings.sound ? 'on' : 'off'}`);
        }, { style: STYLES.dark, size: 12, ink: false });
        const shk = button(this, 172, 24, 110, 28, `Shake ${settings.shake ? 'on' : 'off'}`, () => {
            settings.shake = !settings.shake; saveSettings(); shk.setLabel(`Shake ${settings.shake ? 'on' : 'off'}`);
        }, { style: STYLES.dark, size: 12, ink: false });

        this.drawPlay();
        this.detectHostServer();
        // back from a reload that switched the view: straight into the world we were in
        const back = takeResume();
        if (LAB && !labOpened) {
            // `?lab=defense`: straight into the Defense Lab (once per page: after leaving it the title screen offers it again)
            labOpened = true;
            this.time.delayedCall(60, () => this.start(() => new LocalConnection(LAB)));
            return;
        }
        if (back && !LAB) this.time.delayedCall(60, () => this.start(() => (back.mode === 'solo' ? new LocalConnection() : new WsConnection(back.addr, back.password, back.key)), back));
    }

    update (_t: number, dtMs: number) {
        const dt = dtMs / 1000;
        this.t += dt;
        for (const [i, c] of this.clouds.entries()) {
            c.x += dt * (6 + i * 3);
            if (c.x > W + 120) c.x = -160;
        }
        // shimmering sea
        const g = this.waves;
        g.clear();
        for (let row = 0; row < 9; row++) {
            const y = 316 + row * 26;
            for (let i = 0; i < 24; i++) {
                const x = ((i * 53 + row * 31 + this.t * (14 + row * 3)) % (W + 40)) - 20;
                rect(g, x, y + Math.sin(this.t * 1.6 + i) * 2, 10 + (i % 3) * 4, 2, PAL.foam, 0.12 + row * 0.015);
            }
        }
    }

    private drawScene () {
        // sky
        const sky = this.add.graphics();
        const bands = [PAL.foam, 0xaee6f7, 0x8fdcf2, 0x74cff0, PAL.sea];
        bands.forEach((c, i) => rect(sky, 0, i * 62, W, 63, c));
        for (let i = 0; i < 60; i++) rect(sky, (i * 137) % W, (i * 71) % 250, 2, 2, PAL.snow, 0.5);
        // sun
        const sun = this.add.image(740, 170, 'sun', 0).setScale(7).setAlpha(0.95);
        this.tweens.add({ targets: sun, scale: 7.4, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        // clouds
        for (let i = 0; i < 6; i++) {
            const c = this.add.graphics().setPosition((i * 190) % W, 40 + ((i * 53) % 130));
            const w = 70 + (i % 3) * 30;
            rect(c, 0, 10, w, 12, PAL.snow, 0.9); rect(c, 12, 2, w - 28, 12, PAL.snow, 0.95); rect(c, 4, 18, w - 8, 6, PAL.pebble, 0.5);
            this.clouds.push(c);
        }
        // sea
        const sea = this.add.graphics();
        rect(sea, 0, 300, W, 240, PAL.sea);
        for (let i = 0; i < 9; i++) rect(sea, 0, 300 + i * 26, W, 26, i % 2 ? PAL.sea : PAL.deepSea, i % 2 ? 1 : 0.55);
        rect(sea, 0, 300, W, 3, PAL.foam, 0.8);
        this.waves = this.add.graphics();
        // island
        this.drawIsland(268, 352);
    }

    /** A small island drawn as the game draws one: ground tiles with the corners cut, a cliff face along the south edge, and the
     *  shallow water round it wearing foam on the sides that touch land (the same frames and the same rule as world/tiles.ts). */
    private drawIsland (cx: number, cy: number) {
        const cols = 8, rows = 4, s = 3, T = 16;
        const x0 = cx - (cols * T * s) / 2, y0 = cy - (rows * T * s) / 2;
        const land = (x: number, y: number) => x >= 0 && x < cols && y >= 0 && y < rows && !((y === 0 || y === rows - 1) && (x === 0 || x === cols - 1));
        const frameAt = (x: number, y: number): number | null => {
            if (land(x, y)) return tileGround('meadow', (x * 7 + y * 3) % 3);
            if (land(x, y - 1)) return tileCliff('meadow');
            let near = false;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (land(x + dx, y + dy)) near = true;
            if (!near) return null;
            const e = land(x + 1, y), w = land(x - 1, y), so = land(x, y + 1);
            const se = !e && !so && land(x + 1, y + 1), sw = !w && !so && land(x - 1, y + 1);
            const mask = (e ? 1 : 0) | (w ? 2 : 0) | (so ? 4 : 0) | (se ? 8 : 0) | (sw ? 16 : 0);
            return mask ? tileShore(mask) : TILE_SHALLOW;
        };
        const isl = this.add.container(0, 0);
        for (let y = -1; y <= rows + 1; y++) {
            for (let x = -1; x <= cols; x++) {
                const frame = frameAt(x, y);
                if (frame !== null) isl.add(this.add.image(x0 + x * T * s, y0 + y * T * s, 'tiles', frame).setOrigin(0).setScale(s));
            }
        }
        const prop = (key: string, x: number, y: number, flip = false) => isl.add(this.add.image(x, y, key, 0).setOrigin(0.5, 1).setScale(s).setFlipX(flip));
        prop('tree', cx - 108, cy - 14); prop('tree', cx - 70, cy - 4, true); prop('rock', cx + 112, cy + 24); prop('bush', cx - 62, cy + 50);
        prop('flower', cx + 62, cy - 28); prop('ore_iron', cx + 76, cy - 6); prop('campfire', cx - 18, cy + 18); prop('workbench', cx + 40, cy + 22);
        const sprout = this.add.sprite(cx + 6, cy + 40, 'sprout', 0).setOrigin(0.5, 1).setScale(s);
        this.add.image(cx + 25, cy + 28, 'i_pick_flint', 0).setOrigin(0.5, 0.95).setScale(s).setRotation(0.5);
        this.tweens.add({ targets: sprout, scaleY: s * 0.92, scaleX: s * 1.06, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: isl, y: 5, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        // campfire embers
        this.add.particles(cx - 18, cy + 4, 'px', { speed: { min: 6, max: 24 }, angle: { min: 250, max: 290 }, lifespan: 900, scale: { start: 2, end: 0 }, alpha: { start: 1, end: 0 }, tint: [PAL.pumpkin, PAL.gold], frequency: 90 });
    }

    private field (x: number, y: number, w: number, value: string, placeholder: string, type = 'text') {
        const el = document.createElement('input');
        el.type = type;
        el.value = value;
        el.placeholder = placeholder;
        el.maxLength = type === 'password' ? 40 : 80;
        el.spellcheck = false;
        el.autocomplete = 'off';
        Object.assign(el.style, {
            width: `${w}px`, height: '30px', boxSizing: 'border-box', padding: '0 10px',
            font: `18px ${FONT_TEXT}`, color: css(TEXT.ink), background: css(PAPER.hi),
            border: `3px solid ${css(WOOD[1])}`, borderRadius: '4px', outline: 'none',
        });
        this.add.dom(x, y, el).setOrigin(0, 0.5);
        el.addEventListener('keydown', (ev) => ev.stopPropagation());
        return el;
    }

    private drawPlay () {
        const x = 540, y = 26, w = 390, h = 488;
        const g = this.add.graphics();
        panel(g, x, y, w, h, { ...STYLES.dark, shadow: true, r: 3 });
        label(this, x + 20, y + 26, 'Your name', 15, PAL.pebble, { origin: [0, 0.5] });
        this.nameInput = this.field(x + 130, y + 26, 240, profile.name, 'Farmer');

        // solo
        label(this, x + 20, y + 72, 'Solo', 22, PAL.lime, { origin: [0, 0.5] });
        this.drawViewToggle(x + w - 20, y + 72);
        const day = LAB ? null : LocalConnection.savedDay();
        if (LAB) {
            label(this, x + 20, y + 98, 'A test arena for towers and walls. It is never saved.', 12, PAL.pebble, { origin: [0, 0.5], bold: false });
            button(this, x + w / 2, y + 138, 330, 46, 'Enter the Defense Lab  ▶', () => this.start(() => new LocalConnection(LAB)), { style: STYLES.lime, size: 18 });
        } else label(this, x + 20, y + 98, day ? `Your world is on day ${day}. It saves in this browser.` : 'A private world that saves in this browser.', 12, PAL.pebble, { origin: [0, 0.5], bold: false });
        if (!LAB) button(this, x + w / 2, y + 138, 330, 46, day ? `Continue solo  ·  day ${day}  ▶` : 'Start a solo world  ▶', () => this.start(() => new LocalConnection()), { style: STYLES.lime, size: 18 });
        if (day) {
            const wipe = label(this, x + w / 2, y + 176, 'start a new solo world', 12, PAL.pebble, { origin: [0.5, 0.5], bold: false }).setInteractive({ useHandCursor: true });
            wipe.on('pointerup', () => {
                if (!this.wipeArmed) { this.wipeArmed = true; wipe.setText('click again to erase your solo world').setColor(css(PAL.berry)); return; }
                LocalConnection.wipe();
                this.fx.play('deny', wipe.x, wipe.y);
                this.scene.restart();
            });
        }

        // online
        const oy = y + 204;
        label(this, x + 20, oy, 'Play with friends', 22, PAL.gold, { origin: [0, 0.5] });
        label(this, x + 20, oy + 24, 'Join a farm server (up to 16 players).', 12, PAL.pebble, { origin: [0, 0.5], bold: false });
        this.serverLabel = label(this, x + 20, oy + 52, 'Server', 15, PAL.pebble, { origin: [0, 0.5] });
        // a friend's link can carry the server (…/awesome_farm/?server=https://…): it wins over the last one used, so one link is all a friend needs
        const linked = new URLSearchParams(location.search).get('server')?.trim().slice(0, 200) ?? '';
        this.addrInput = this.field(x + 110, oy + 52, 260, linked || profile.server || (import.meta.env.DEV ? 'localhost:7777' : ''), 'address:7777 or https://…');
        this.addrTheirs = !!(linked || profile.server);
        this.customLink = label(this, x + w - 20, oy + 24, '', 11, PAL.pebble, { origin: [1, 0.5], bold: false }).setInteractive({ useHandCursor: true });
        this.customLink.on('pointerup', () => this.togglePicker());
        label(this, x + 20, oy + 86, 'Password', 15, PAL.pebble, { origin: [0, 0.5] });
        this.passInput = this.field(x + 110, oy + 86, 260, '', 'only if the server has one', 'password');
        label(this, x + 20, oy + 120, 'Secret word', 15, PAL.pebble, { origin: [0, 0.5] });
        this.keyInput = this.field(x + 110, oy + 120, 260, profile.key ?? '', 'your name + this = your farmer', 'password');
        label(this, x + 20, oy + 146, 'Your name and secret word bring back your farmer on any device.\nSet them the first time you join, then use the same ones everywhere.', 11, PAL.pebble, { origin: [0, 0.5], bold: false });
        this.serverStatus = label(this, x + 20, oy + 176, '', 12, PAL.pebble, { origin: [0, 0.5], bold: false });
        button(this, x + w / 2, oy + 212, 330, 44, 'Join server  ▶', () => this.join(), { style: STYLES.gold, size: 18 });
        label(this, x + w / 2, oy + 258, 'Want to host? Run the Awesome Farm server on any PC (or on Cloudflare).\nFriends join with its address.', 11, PAL.pebble, { origin: [0.5, 0.5], align: 'center', bold: false });

        this.addrInput.addEventListener('input', () => { this.addrTheirs = true; this.clearNotice(); this.scheduleCheck(); });
        this.passInput.addEventListener('input', () => this.clearNotice());
        this.addrInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') this.join(); });
        this.passInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') this.join(); });
        this.keyInput.addEventListener('input', () => this.clearNotice());
        this.keyInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') this.join(); });
        this.scheduleCheck();
        void this.probeWorlds(x, oy);
        if (/password/i.test(this.notice)) this.time.delayedCall(400, () => this.passInput.focus());   // wrong password: ready to type it again
    }

    /** The view, for solo and online alike: 2D (the classic, the default) or 3D (beta). Two segments, the chosen one lit. */
    private drawViewToggle (right: number, y: number) {
        const w3 = 84, w2 = 56, gap = 6, h = 26;
        const pick = (mode: '2d' | '3d') => { settings.view = mode; saveSettings(); paint(); };
        const b2 = button(this, right - w3 - gap - w2 / 2, y, w2, h, '2D', () => pick('2d'), { style: STYLES.dark, size: 13 });
        const b3 = button(this, right - w3 / 2, y, w3, h, '3D beta', () => pick('3d'), { style: STYLES.dark, size: 13 });
        label(this, right - w3 - gap - w2 - 10, y, 'View', 15, PAL.pebble, { origin: [1, 0.5] });
        const paint = () => {
            b2.setStyle(settings.view === '2d' ? STYLES.lime : STYLES.dark);
            b3.setStyle(settings.view === '3d' ? STYLES.lime : STYLES.dark);
        };
        paint();
    }

    /**
     * Play online: ask the address in the box (a link's `?server=`, the last one used, or the built-in one) which worlds it hosts. A Cloudflare
     * host answers with a list and the box turns into one button per world, each with how many are in it; anything else (a PC's server,
     * a typed address, an older host) answers nothing and the box stays as it was.
     */
    private async probeWorlds (x: number, oy: number) {
        const start = splitAddress(this.addrInput.value || PUBLIC_SERVER);
        if (!start.base) return;
        try {
            const r = await fetch(worldsUrl(start.base), { signal: AbortSignal.timeout(4000) });
            const j = await r.json();
            if (j?.game !== 'awesome-farm' || !Array.isArray(j.worlds) || !this.scene.isActive()) return;
            const worlds: WorldInfo[] = j.worlds
                .filter((w: WorldInfo) => w && /^[a-z0-9_-]{1,24}$/.test(String(w.id)) && typeof w.name === 'string')
                .slice(0, 6).map((w: WorldInfo) => ({ id: w.id, name: w.name.slice(0, 14), blurb: String(w.blurb ?? '').slice(0, 60) }));
            if (!worlds.length) return;
            const def = worlds.some((w) => w.id === j.default) ? String(j.default) : worlds[0].id;
            const current = this.addrInput.value.trim() ? splitAddress(this.addrInput.value) : null;
            const at = current && current.base === start.base ? current.world ?? def : def;
            const bw = Math.floor((260 - 4 * (worlds.length - 1)) / worlds.length);
            const btns = worlds.map((wd, i) => button(this, x + 110 + bw / 2 + i * (bw + 4), oy + 52, bw, 38, wd.name, () => this.pickWorld(wd.id), { style: STYLES.dark, size: 13 }));
            this.picker = { base: start.base, def, worlds, btns, counts: new Map(), custom: false };
            this.showPicker(true);
            if (!this.addrInput.value.trim() || current?.base === start.base) this.setWorld(at, !!this.addrInput.value.trim());
            void this.countWorlds();
        } catch { /* no list of worlds here: the box stays as it was */ }
    }

    /** The address that names a world: the first world keeps the plain address, as before there were several (so a farmer already there is still known). */
    private worldAt (id: string) {
        const p = this.picker!;
        return id === p.def ? p.base : worldAddress(p.base, id);
    }

    private setWorld (id: string, theirs: boolean) {
        const p = this.picker!;
        this.addrInput.value = this.worldAt(id);
        if (theirs) this.addrTheirs = true;
        p.worlds.forEach((wd, i) => p.btns[i].setStyle(wd.id === id ? STYLES.lime : STYLES.dark));
        this.scheduleCheck();
    }

    private pickWorld (id: string) {
        this.clearNotice();
        this.setWorld(id, true);
    }

    /** Buttons or the plain address box: the one that is not in use is hidden. */
    private showPicker (on: boolean) {
        const p = this.picker!;
        p.custom = !on;
        for (const b of p.btns) b.root.setVisible(on);
        this.addrInput.style.display = on ? 'none' : '';
        this.serverLabel.setVisible(!on);
        this.customLink.setText(on ? 'other address…' : 'pick a server').setColor(css(PAL.pebble));
    }

    private togglePicker () { if (this.picker) this.showPicker(this.picker.custom); }

    /** How many are in each world (one small question per world, once: a world that sleeps is woken for it, so it is not asked again and again). */
    private async countWorlds () {
        const p = this.picker!;
        await Promise.all(p.worlds.map(async (wd, i) => {
            try {
                const r = await fetch(statusUrl(this.worldAt(wd.id)), { signal: AbortSignal.timeout(5000) });
                const s = await r.json();
                if (s?.game !== 'awesome-farm' || !this.scene.isActive()) return;
                p.btns[i].setLabel(`${wd.name}\n${s.online > 0 ? `● ${s.online} online` : `○ day ${s.day}`}`);
            } catch { if (this.scene.isActive()) p.btns[i].setLabel(`${wd.name}\n? asleep`); }
        }));
    }

    /** If this page was served by a game server, point the Join box at it. */
    private async detectHostServer () {
        try {
            const r = await fetch('/status', { signal: AbortSignal.timeout(2000) });
            const s = await r.json();
            if (s?.game !== 'awesome-farm' || !this.scene.isActive()) return;
            this.addrInput.value = location.host;
            this.addrTheirs = true;
            this.scheduleCheck();
        } catch { /* a plain static host (dev server, Pages) has no /status */ }
    }

    private clearNotice () {
        if (!this.notice) return;
        this.notice = '';
        this.scheduleCheck();
    }

    private scheduleCheck () {
        this.checkTimer?.remove();
        if (this.notice) { this.serverStatus.setText(`○ ${this.notice}`).setColor(css(PAL.berry)); return; }
        this.serverStatus.setText(this.addrInput.value.trim() && this.addrTheirs ? 'Checking…' : '').setColor(css(PAL.pebble));
        if (!this.addrInput.value.trim()) return;
        this.checkTimer = this.time.delayedCall(500, () => this.check());
    }

    private async check () {
        const addr = this.addrInput.value.trim();
        try {
            const r = await fetch(statusUrl(addr), { signal: AbortSignal.timeout(3000) });
            const s = await r.json();
            if (addr !== this.addrInput.value.trim() || !this.scene.isActive()) return;
            if (s.game !== 'awesome-farm') throw new Error();
            const versionOk = s.protocol === PROTOCOL;
            this.serverStatus.setText(versionOk
                ? `● ${s.name} — ${s.online}/${s.max} online · day ${s.day}${s.password ? ' · password' : ''}`
                : `● ${s.name} runs a different game version`).setColor(css(versionOk ? PAL.lime : PAL.pumpkin));
        } catch {
            if (addr !== this.addrInput.value.trim() || !this.scene.isActive()) return;
            if (!this.addrTheirs) { this.serverStatus.setText(''); return; }       // (nobody asked for this address: no red line for a brand-new player)
            const mixed = location.protocol === 'https:' && !/^https/i.test(addr);
            this.serverStatus.setText(mixed ? "○ Can't reach it — from an https page, use the server's https:// address" : "○ Can't reach that server").setColor(css(PAL.berry));
        }
    }

    private saveName () {
        profile.name = this.nameInput.value.trim().slice(0, 16) || profile.name || `Farmer ${Math.floor(100 + Math.random() * 900)}`;
        this.nameInput.value = profile.name;
        saveProfile();
    }

    private join () {
        const addr = this.addrInput.value.trim();
        this.addrTheirs = true;
        if (!addr) { this.fx.play('deny', 735, 306); this.addrInput.focus(); return; }
        profile.server = addr;
        const password = this.passInput.value;
        const key = this.keyInput.value.trim();
        if (key && (key.length < 4 || this.nameInput.value.trim().length < 2)) {
            this.notice = key.length < 4 ? 'Your secret word needs at least 4 characters.' : 'Pick your name first: it goes with the secret word.';
            this.scheduleCheck(); this.fx.play('deny', 735, 306); return;
        }
        profile.key = key || undefined;
        this.start(() => new WsConnection(addr, password, key), { mode: 'online', addr, password, key });
    }

    /**
     * Name first: the connection says hello with it. The 3D view needs a see-through canvas, made when the page boots: a page that
     * booted in 2D reloads first (the connection written down for the reload, which comes straight back here and in).
     */
    private start (connect: () => Connection, resume: Resume = { mode: 'solo' }) {
        if (this.starting) return;
        this.starting = true;
        this.saveName();
        if (settings.view === '3d' && !canSwitchLive(this.game)) {
            stashResume(resume);
            this.cameras.main.fadeOut(250, 27, 26, 38);
            this.cameras.main.once('camerafadeoutcomplete', () => location.reload());
            return;
        }
        const conn = connect();
        this.fx.play('dawn', W / 2, H / 2);
        this.cameras.main.fadeOut(300, 27, 26, 38);
        this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Game', { conn }));
    }
}
