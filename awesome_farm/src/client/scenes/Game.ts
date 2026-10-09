// The world view. Everything authoritative lives in the SimHost (in this browser for
// solo, on the dedicated server online); this scene mirrors its state, draws it, moves
// your own farmer (client-authoritative) and sends commands. Server events become FX.
//
// The scene keeps the mirror (ents, players, clock), the entity views and the message handlers; the rest lives in
// world/*: farmers (how farmers are drawn and moved), placing (the building ghost), interact (targets and the keys),
// hands (the hotbar and pods), ambience (hearths, roofs, caves, waves), buildviews (what a building wears),
// factoryview (machines, wires, badges), prodhist, and combat, critters, titan, costatus; juice/slowmo is the Perfect beat.
//
// The view setting (2D, or 3D beta) changes only who draws the world and how a pointer becomes a spot in it: see
// world/view3d-bridge.ts. In 3D this scene is hidden but runs exactly as in 2D, feeding the 3D view the same state and events.

import * as Phaser from 'phaser';
import { RIFT_ISLANDS, TILE, TUNING, WORLD_TILES, ZOOM } from '../../shared/config';
import { dist } from '../../shared/geom';
import { hasRod } from '../../shared/sim/fishing';
import { BUILDINGS, BuildingKind, StationId } from '../../shared/data/buildings';
import { ITEMS, ItemId, Res, iconOf } from '../../shared/data/items';
import { MOBS } from '../../shared/data/mobs';
import { NODES } from '../../shared/data/nodes';
import { isHearthSpot } from '../../shared/data/hearth';
import { applyPlayerDelta, type PlayerDelta, type PlayerView, type ServerMsg, type TickMsg } from '../../shared/net/protocol';
import { PAL } from '../../shared/palette';
import { nightAmount, sunlight } from '../../shared/daylight';
import { countOf, derived, hasUnlock } from '../../shared/sim/stats';
import { hotKind } from '../../shared/sim/hotbar';
import type { BuildE, ChronEntry, Cmd, CritE, Ent, PlayerS, Plot, Shop, SimEvent, UiKind, WishState, WorldState } from '../../shared/sim/types';
import { World } from '../../shared/world';
import { Fx } from '../juice/fx';
import { SlowMo } from '../juice/slowmo';
import type { Connection } from '../net/connection';
import { TileLayer } from '../world/tiles';
import { animateMob, animateProj, CombatFx, createMob, createProj } from '../world/combat';
import { castTarget, FishLines, type LineView } from '../world/fishing';
import { BlueprintTool, loadBlueprints, MAX_SAVED, saveBlueprints } from '../world/blueprints';
import { FactoryView } from '../world/factoryview';
import { CoFx } from '../world/costatus';
import { Farmers, flash, freshLocal, squash, type Local } from '../world/farmers';
import { Placer, type Placing } from '../world/placing';
import { Interact, type Target } from '../world/interact';
import { Hands } from '../world/hands';
import { Ambience } from '../world/ambience';
import { BuildViews } from '../world/buildviews';
import { ProdHistory } from '../world/prodhist';
import { destroyView, type EntView } from '../world/views';
import { occupy, vacate } from '../world/occupancy';
import { computePrompt, type PromptHost } from '../ui/prompt';
import type { TipData } from '../ui/kit';
import type { Blueprint } from '../../shared/blueprint';
import { mixc } from '../art/paint';
import { saveSettings, settings, type ViewMode } from '../settings';
import { stashResume } from '../net/connection';
import { canSwitchLive, loadView3D, Pointer2D, Pointer3D, type View3D, type View3DFarmer, type View3DFrame, type WorldPointer, type XY } from '../world/view3d-bridge';
import { animateCrit, createCrit, CritFx } from '../world/critters';
import { VeinLayer } from '../world/veins';
import { TitanFx } from '../world/titan';
import { BlightFx } from '../world/blight';
import { SS } from '../res';
import { physPressed, physReset } from '../input/layout';
import { Sea } from '../world/sea';

type Img = Phaser.GameObjects.Image;
type Spr = Phaser.GameObjects.Sprite;
type Derived = ReturnType<typeof derived>;
/** How close the world is drawn (logical zoom): every step is a whole number of screen pixels per art pixel, so the pixels stay crisp. 3 is the classic view. */
const ZOOM_STEPS = [1.5, 2, 2.5, 3, 4, 5, 6];
const nearestZoom = (z: number) => ZOOM_STEPS.reduce((best, s) => (Math.abs(s - z) < Math.abs(best - z) ? s : best), ZOOM);
/** What the corner map marks, and the monsters and creatures that glow in the dark (ui/night.ts draws the light). */
const LANDMARKS = new Set<BuildingKind>(['waystone', 'den', 'altar']);
const LIGHT_MOBS = new Set<string>(['wisp', 'wraith', 'oldheart', 'witch']);
const LIGHT_SPECIES = new Set<string>(['glimmoth', 'aurorin', 'cinderkit', 'pyrelion']);

/** Events the HUD listens to (prefixed: Phaser emits its own pause/resume/shutdown here). */
export interface GameEvents {
    'hud:float': { key?: string; x: number; y: number; text: string; color?: number };
    'hud:banner': { text: string; sub?: string; color?: number };
    'hud:toast': { text: string; icon?: string; color?: number };
    'hud:ready': void;
    'hud:open': { ui: UiKind; id: number };
    'hud:plotsChanged': void;
    'hud:hurt': void;
    'hud:social': SimEvent;
    'hud:riftend': Extract<SimEvent, { e: 'riftend' }>;
    'hud:catch': Extract<SimEvent, { e: 'catch' }>;
    'hud:loot': Extract<SimEvent, { e: 'loot' }>;
    'hud:spin': Extract<SimEvent, { e: 'spin' }>;
    'hud:gamble': Extract<SimEvent, { e: 'gamble' }>;
    'hud:story': Extract<SimEvent, { e: 'story' }>;
    'hud:factip': TipData | null;
}

export class GameScene extends Phaser.Scene {
    conn!: Connection;
    ready = false;
    me = '';
    meS: PlayerS | null = null;
    players: Record<string, PlayerView> = {};
    world!: World;
    ents: Record<number, Ent> = {};
    clock = { time: 0, clock: 0, day: 1, night: false, nightLen: TUNING.nightLength, paused: false };
    prompt = '';
    serverName = '';
    /** Written by the HUD's touch controls. */
    touch = { mx: 0, my: 0, act: false, use: false, dem: false };
    menuOpen = false;
    /** Your own farmer's movement (client-authoritative); the farmers module walks it. */
    readonly local: Local = freshLocal();
    keys!: Record<string, Phaser.Input.Keyboard.Key>;
    readonly camTarget = new Phaser.Math.Vector2();
    /** The pointer in the world, how long a mouse has been aiming, whether its button is held, and the finger that aims on a phone (shared by placing and targeting). */
    readonly pointerWorld = new Phaser.Math.Vector2();
    mouseAimT = 0;
    mouseHeld = false;
    aimPointer: Phaser.Input.Pointer | null = null;
    /** The entity views, and the ones on screen this frame (plus every boss, whose arena ring may show while it does not), for the fight overlay and the factory arms. */
    readonly views = new Map<number, EntView>();
    readonly visViews: EntView[] = [];
    tiles: TileLayer | null = null;
    /** Active pings (set by the HUD) for the minimap. */
    pingMarks: { x: number; y: number; color: number; age: number }[] = [];
    /** The waystones the last Waystone use listed. */
    ways: { from: number; list: { id: number; x: number; y: number; plot: number; by?: string }[] } = { from: 0, list: [] };
    /** Copy / paste layouts: the tool, and the saved book. */
    bp!: BlueprintTool;
    blueprints: Blueprint[] = [];
    /** Status badges, hover tooltips, the Factory view, the machines as they run and the wires (world/factoryview.ts). `overUi`: the HUD says the pointer is over one of its controls. */
    fv!: FactoryView;
    overUi = false;
    /** The world's helpers (world/*.ts): the farmers, the building ghost, targets and keys, the hotbar, the ambience and what buildings wear. */
    farmers!: Farmers;
    placer!: Placer;
    act!: Interact;
    hands!: Hands;
    amb!: Ambience;
    private bviews!: BuildViews;
    private prodHist = new ProdHistory();
    private fx!: Fx;
    private slow!: SlowMo;
    private sea: Sea | null = null;
    private ambient!: Phaser.GameObjects.Particles.ParticleEmitter;
    private glint!: Phaser.GameObjects.Particles.ParticleEmitter;
    private zoomTarget = ZOOM;
    private seed = '';
    private chuteHushUntil = 0;
    private gates: Spr[] = [];
    private gateFrame = -1;
    private shopState: Shop | null = null;
    private chron: ChronEntry[] = [];
    private wishS: WishState | null = null;
    private combat!: CombatFx;
    private fishLines!: FishLines;
    private crit!: CritFx;
    /** The "2+" badge, ring and health bar on Titan nodes (world/titan.ts). */
    private titanFx!: TitanFx;
    /** The Blight: nests (world/blight.ts). */
    private blightFx!: BlightFx;
    /** Ice blocks, curses and chains (co-op boss statuses). */
    private coFx!: CoFx;
    private veins: VeinLayer | null = null;
    private tally = new Map<Res, { n: number; t: number }>();
    private promptIn = 0;
    private promptHost!: PromptHost;
    /** The sea's own clock (it runs slow in the Perfect beat too). */
    private seaT = 0;
    private dCache: { me: PlayerS; d: Derived } | null = null;
    /**
     * Lists kept as the world changes, so nothing per frame walks every entity: the landmarks the corner map marks (waystones, dens,
     * altars, bosses), what casts light at night (lit buildings, projectiles, glowing monsters and creatures) and the buildings.
     */
    private marks = new Map<number, Ent>();
    private lit = new Map<number, Ent>();
    readonly blds = new Map<number, BuildE>();
    /** Bumped when a building appears or goes (the power wires and the building list are rebuilt from it). */
    bldVersion = 0;
    /** How the world is drawn right now ('3d' only once the 3D view has loaded), the 3D view itself, and the pointer bridge for the view in use. */
    viewMode: ViewMode = '2d';
    view3d: View3D | null = null;
    private ptr2d!: Pointer2D;
    private ptr!: WorldPointer;
    private viewToken = 0;
    private farmers3d: View3DFarmer[] = [];

    constructor () {
        super('Game');
    }

    init (data: { conn: Connection }) {
        // Phaser reuses the scene object — reset every field (the helpers in world/* are made anew in create)
        this.conn = data.conn;
        this.ready = false; this.me = ''; this.meS = null; this.players = {}; this.ents = {};
        this.prompt = ''; this.serverName = '';
        this.touch = { mx: 0, my: 0, act: false, use: false, dem: false };
        this.menuOpen = false; this.tiles = null; this.sea = null;
        this.views.clear(); this.visViews.length = 0;
        Object.assign(this.local, freshLocal());
        this.mouseHeld = false; this.mouseAimT = 0; this.aimPointer = null;
        this.tally = new Map(); this.veins = null; this.dCache = null; this.prodHist = new ProdHistory();
        this.marks = new Map(); this.lit = new Map(); this.blds.clear(); this.bldVersion = 0;
        this.seaT = 0; this.tweens.timeScale = 1;
        this.promptIn = 0; this.gates = []; this.gateFrame = -1;
        this.viewMode = '2d'; this.view3d = null; this.farmers3d = [];
    }

    create () {
        this.fx = new Fx(this, 1);
        this.slow = new SlowMo(this);
        const size = WORLD_TILES * TILE;
        this.zoomTarget = nearestZoom(settings.zoom);
        this.cameras.main.setZoom(this.zoomTarget * SS).setBackgroundColor(PAL.deepSea).setBounds(0, 0, size, size);
        this.combat = new CombatFx(this);
        this.fishLines = new FishLines(this);
        this.blueprints = loadBlueprints();
        this.farmers = new Farmers(this, this);
        this.placer = new Placer(this, this);
        this.act = new Interact(this, this);
        this.amb = new Ambience(this, this);
        const self = this;
        this.bviews = new BuildViews(this, {
            get world () { return self.world; }, get ents () { return self.ents; }, get views () { return self.views; }, get roofs () { return self.amb.roofs; },
            pop: (x, y, n) => this.pop(x, y, n),
            shadowFor: (x, y, w) => this.shadowFor(x, y, w),
        });
        this.hands = new Hands({
            get ready () { return self.ready; }, get menuOpen () { return self.menuOpen; }, get meS () { return self.meS; }, get local () { return self.local; },
            derivedMe: () => this.derivedMe(),
            send: (c) => this.send(c),
            play: (a, x, y) => this.fx.play(a, x, y, { noShake: true }),
            say: (t) => { this.fx.play('deny', this.local.x, this.local.y - 10); this.float(this.local.x, this.local.y - 22, t, PAL.berry); },
            wildNear: () => this.act.wildNear(),
        });
        this.bp = new BlueprintTool(this, {
            get ents () { return self.ents; },
            get local () { return self.local; },
            pointer: () => this.placer.pointerSpot(),
            me: () => this.meS!,
            send: (c) => this.send(c),
            valid: (k, tx, ty) => this.placer.valid(k, tx, ty),
            say: (t, c) => { this.fx.play('deny', this.local.x, this.local.y - 10); this.float(this.local.x, this.local.y - 24, t, c ?? PAL.cream); },
            saved: (bp) => this.saveBlueprint(bp),
        });
        this.fv = new FactoryView(this, {
            get world () { return self.world; },
            get ents () { return self.ents; },
            get clock () { return self.clock; },
            get seed () { return self.seed; },
            get blds () { return self.blds; },
            get bldVersion () { return self.bldVersion; },
            get visViews () { return self.visViews; },
            get placing () { return self.placer.cur; },
            me: () => this.meS,
            tip: (d) => this.emitEvent('hud:factip', d),
            busy: () => this.menuOpen || this.overUi || !!this.placer.cur || this.bp.active,
            pop: (x, y, n) => this.pop(x, y, n),
            toWorld: (p, out, aim) => this.toWorld(p, out, aim),
        });
        this.promptHost = {
            get meS () { return self.meS!; },
            get placing () { return self.placer.cur; },
            bpPrompt: () => (this.bp.active ? this.bp.prompt() : null),
            get near () { return self.act.near; },
            get target () { return self.act.target; },
            get world () { return self.world; },
            get clock () { return self.clock; },
            get players () { return self.players; },
            get derived () { return self.derivedMe(); },
            gateNear: () => this.act.gateNear(),
            distToBuilding: (b) => this.act.distToBuilding(b),
            petPrompt: () => this.act.petPrompt(),
            canCast: () => !!castTarget(this.world, this.local),
            podFor: (sp) => this.hands.podFor(sp),
        };
        this.crit = new CritFx(this);
        this.titanFx = new TitanFx(this);
        this.blightFx = new BlightFx(this);
        this.coFx = new CoFx(this);
        this.ambient = this.add.particles(0, 0, 'px', {
            emitting: false, speed: { min: 4, max: 14 }, angle: { min: 240, max: 300 },
            lifespan: { min: 500, max: 900 }, scale: { start: 1, end: 0 }, alpha: { start: 0.9, end: 0 },
            tint: [PAL.pumpkin, PAL.gold, PAL.foam],
        }).setDepth(9e4);
        this.glint = this.add.particles(0, 0, 'star', {
            emitting: false, speed: { min: 3, max: 10 }, angle: { min: 230, max: 310 },
            lifespan: { min: 600, max: 1000 }, scale: { start: 0.9, end: 0 }, alpha: { start: 1, end: 0 },
            tint: [PAL.gold, PAL.cream, PAL.foam],
        }).setDepth(9e4);
        this.cameras.main.startFollow(this.camTarget, true, 0.15, 0.15);
        this.setupInput();
        this.ptr2d = new Pointer2D(() => this.cameras.main);
        this.ptr = this.ptr2d;
        this.events.once('shutdown', () => { this.viewToken++; this.dropView3d(); });
        if (settings.view === '3d' && canSwitchLive(this.game)) void this.setView('3d');       // (booted in 2D, the title screen already reloaded into 3D)
        this.scene.launch('Hud');
        this.exposeDebug();
        // the solo world is written every 20 s, and again the moment the page is closed or sent to the background (a phone may never say goodbye)
        const save = () => { if (this.conn.mode === 'solo') this.conn.saveNow?.(); };
        const hide = () => { if (document.visibilityState === 'hidden') save(); };
        window.addEventListener('pagehide', save);
        document.addEventListener('visibilitychange', hide);
        this.events.once('shutdown', () => { window.removeEventListener('pagehide', save); document.removeEventListener('visibilitychange', hide); });
    }

    emitEvent<K extends keyof GameEvents> (name: K, data?: GameEvents[K]) { this.events.emit(name, data); }
    private float (x: number, y: number, text: string, color?: number, key?: string) { this.emitEvent('hud:float', { x, y, text, color, key }); }
    /** A big banner for the HUD. */
    banner (d: GameEvents['hud:banner']) { this.emitEvent('hud:banner', d); }
    /** A few sparks at a spot. */
    pop (x: number, y: number, n: number) { this.ambient.explode(n, x, y); }
    /** "Can't do that": a buzz and a few words over your head (say why). */
    deny (why: string | null) {
        this.fx.play('deny', this.local.x, this.local.y - 10);
        this.float(this.local.x, this.local.y - 22, why ?? "Can't build there", PAL.berry, 'place-why');
    }

    send (c: Cmd) { this.conn.send(c); }

    /** A pointer onto the world (sim pixels), through the view in use (world/view3d-bridge.ts). `aim`: pick a thing, not the ground. */
    toWorld (p: Phaser.Input.Pointer, out: XY, aim = false) { return this.ptr.toWorld(p, out, aim); }

    /** A farmer swung (the 3D view poses its model; the 2D one is animated by the farmers module itself). */
    swung (id: string) { this.view3d?.swing(id); }

    // ── the view: 2D or 3D ──────────────────────────────────────────────────
    /**
     * Draw the world in 2D or in 3D (and remember the choice). Live when the page's canvas allows it (it booted in 3D, so the Phaser
     * canvas is transparent); otherwise the world is saved and the page reloads straight back into it in the new view ('reload').
     */
    async setView (mode: ViewMode): Promise<'live' | 'reload'> {
        settings.view = mode;
        saveSettings();
        const token = ++this.viewToken;
        if (mode === '2d') {
            this.dropView3d();
            return 'live';
        }
        if (this.view3d) return 'live';
        if (!canSwitchLive(this.game)) { this.reloadInto(); return 'reload'; }
        try {
            const make = await loadView3D();
            if (token !== this.viewToken || !this.sys.isActive()) return 'live';          // (switched back, or left the world, while it loaded)
            const v = make({ canvas: this.game.canvas, entCenter: (e) => this.act.entCenter(e) });
            this.view3d = v;
            this.ptr = new Pointer3D(v, this.ptr2d);
            this.viewMode = '3d';
            if (this.ready) v.welcome(this.world, Object.values(this.ents));
            this.scene.setVisible(false);              // (the scene still runs: only its drawing stops)
        } catch (err) {
            console.warn('The 3D view could not start:', err);
            settings.view = '2d'; saveSettings();
            this.emitEvent('hud:toast', { text: 'The 3D view could not start here: back to 2D', icon: 'k_gear', color: PAL.berry });
        }
        return 'live';
    }

    private dropView3d () {
        this.view3d?.dispose();
        this.view3d = null;
        this.ptr = this.ptr2d;
        this.viewMode = '2d';
        if (this.sys.isActive()) this.scene.setVisible(true);
    }

    /** Save, note how to come back, and reload: the title screen opens this same world again at once (net/connection.ts `takeResume`). */
    private reloadInto () {
        stashResume(this.conn.resumeInfo());
        this.conn.close();
        location.reload();
    }

    // ── input ───────────────────────────────────────────────────────────────
    private setupInput () {
        const kb = this.input.keyboard!;
        this.keys = kb.addKeys('UP,DOWN,LEFT,RIGHT,SPACE,SHIFT,E,F,R,X,T') as Record<string, Phaser.Input.Keyboard.Key>;
        kb.addCapture('SPACE,UP,DOWN,LEFT,RIGHT');
        this.input.mouse?.disableContextMenu();
        this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
            if (!this.ready || this.menuOpen) return;
            if (this.bp.active) {
                this.toWorld(p, this.pointerWorld); this.mouseAimT = 2;
                if (p.wasTouch && this.bp.mode === 'paste') { this.placer.touchAimDown(p); return; }
                if (p.wasTouch) this.aimPointer = p;                // (copying: this finger draws the box)
                if (this.bp.pointerDown(p.rightButtonDown())) return;
            }
            if (p.rightButtonDown()) { this.placer.cancel(); return; }
            if (p.middleButtonDown() || (p.event as MouseEvent | undefined)?.altKey) {
                this.toWorld(p, this.pointerWorld);
                this.send({ t: 'ping', x: Math.round(this.pointerWorld.x), y: Math.round(this.pointerWorld.y) });
                return;
            }
            this.mouseAimT = 2;
            if (this.placer.cur) {
                if (p.wasTouch) { this.placer.touchAimDown(p); return; }
                this.placer.click(); return;
            }
            this.mouseHeld = true;
        });
        this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
            // (another finger, say the one on the stick, lifting does not end a line or a box that this one is drawing)
            const aiming = !!this.aimPointer && this.aimPointer.id === p.id;
            if (aiming) this.placer.touchAimUp(p);
            if (aiming || !this.aimPointer) { this.mouseHeld = false; this.placer.pointerUp(); this.bp.pointerUp(); }
        });
        this.input.on('pointermove', (p: Phaser.Input.Pointer) => { if (!p.wasTouch) this.mouseAimT = 2; });
        const release = () => this.releaseInput();
        this.game.events.on(Phaser.Core.Events.BLUR, release);
        this.events.once('shutdown', () => this.game.events.off(Phaser.Core.Events.BLUR, release));
    }

    /** Drop held input (window blur, menus closing). */
    releaseInput () {
        this.mouseHeld = false;
        this.aimPointer = null; this.placer.release();
        this.touch.act = false;
        this.touch.use = false;
        this.touch.dem = false;
        this.input.keyboard?.resetKeys();
        physReset();
    }

    private pressed (k: string) { return Phaser.Input.Keyboard.JustDown(this.keys[k]); }

    private handleKeys (dt: number) {
        if (this.menuOpen) return;
        if (this.pressed('E')) this.act.interact();
        if (this.pressed('F')) { const h = this.heldItem(); this.eat(h && hotKind(h) === 'use' && countOf(this.meS!, h) > 0 ? h : undefined); }
        if (this.pressed('T')) this.hands.throwPod();
        if (physPressed('KeyQ')) this.fishKey();
        if (this.pressed('SHIFT')) this.dash();
        if (this.pressed('R')) this.placer.turn();
        if (this.placer.cur && this.pressed('SPACE')) this.placer.tryPlace();
        this.act.updateDismantle(dt);
    }

    // ── main loop ───────────────────────────────────────────────────────────
    update (_time: number, deltaMs: number) {
        const dt = Math.min(deltaMs / 1000, 0.1);
        const wdt = dt * this.slow.step(dt);             // (the world's own time: slower for a beat after a Perfect dash, otherwise the same as dt)
        this.seaT += wdt;
        this.sea?.update(this.seaT);
        for (const msg of this.conn.poll(dt)) this.handle(msg);
        if (!this.ready || !this.meS) return;
        for (const [res, t] of this.tally) { t.t -= dt; if (t.t <= 0) this.tally.delete(res); }
        this.farmers.updateLocal(dt);
        this.amb.updateRoofs(dt);
        this.act.scanNear();
        this.handleKeys(dt);
        this.updateZoom(dt);
        this.amb.updateDread(dt);
        this.amb.updateUnder(dt);
        this.act.updateTargetAndSwing(dt);
        this.act.updateRevive(dt);
        this.farmers.updateRemote(wdt);
        this.coFx.update(wdt, this.farmers.values(), this.players, this.clock.time);
        this.drawFishing(wdt);
        this.updateViews(wdt);
        this.combat.draw(wdt, this.visViews, this.cameras.main.worldView);
        this.fv.drawWorld();
        this.fv.update(dt);
        this.amb.updateWaves(wdt);
        const gf = Math.floor(this.time.now / 240) % 3;
        if (gf !== this.gateFrame) { this.gateFrame = gf; for (const gate of this.gates) gate.setFrame(gf); }
        this.placer.updateTouchAim();
        this.placer.update();
        this.bp.update();
        this.amb.drawBrackets(this.act.target, (id) => this.views.get(id));
        if ((this.promptIn -= dt) <= 0) { this.promptIn = 0.1; this.prompt = computePrompt(this.promptHost); }       // (ten times a second is as fast as anyone reads)
        this.view3d?.frame(wdt, this.frame3d());
    }

    /** What the 3D view draws this frame, read from the scene (world/view3d-bridge.ts View3DFrame). */
    private frame3d (): View3DFrame {
        const list = this.farmers3d, l = this.local;
        list.length = 0;
        for (const pv of this.farmers.values()) {
            const mine = pv.id === this.me, p = this.players[pv.id];         // (your own record is kept there too, whole)
            if (!p) continue;
            const held = mine ? this.heldItem() : null;
            list.push(mine
                ? { id: pv.id, p, x: l.x, y: l.y, fx: l.face.x, fy: l.face.y, moving: l.moving, hold: held && hotKind(held) === 'gear' ? held : undefined }
                : { id: pv.id, p, x: pv.x, y: pv.y, fx: p.fx, fy: p.fy, moving: p.moving });
        }
        return {
            me: this.me, camX: l.x, camY: l.y, zoom: this.zoomLevel, clock: this.clock, seed: this.seed, farmers: list,
            placing: this.placer.cur ? { kind: this.placer.cur.kind, tx: this.placer.cur.tx, ty: this.placer.cur.ty, rot: this.placer.cur.rot, valid: this.placer.cur.valid } : null,
            target: this.targetSpot(),
            shake: settings.shake,
        };
    }

    /** Where the thing a swing would hit stands (sim pixels) and how big a ring it gets (tiles). */
    private targetSpot (): View3DFrame['target'] {
        const t = this.act.target;
        if (!t) return null;
        if (t.kind === 'rock') return { x: (t.tx + 0.5) * TILE, y: (t.ty + 0.5) * TILE, r: 0.55 };
        const e = t.ent;
        if (e.k === 'node') return { x: (e.tx + 0.5) * TILE, y: (e.ty + 0.5) * TILE, r: 0.6 };
        if (e.k === 'bld') { const [w, h] = BUILDINGS[e.kind].size; return { x: (e.tx + w / 2) * TILE, y: (e.ty + h / 2) * TILE, r: Math.max(w, h) * 0.6 }; }
        const v = this.views.get(e.id);
        return { x: v?.x ?? e.x, y: v?.y ?? e.y, r: e.k === 'mob' ? Math.max(0.6, (MOBS[e.kind].r / TILE) * 1.3) : 0.6 };
    }

    // ── messages ────────────────────────────────────────────────────────────
    private handle (msg: ServerMsg) {
        if (msg.t === 'welcome') this.welcome(msg.you, msg.state, msg.server);
        else if (msg.t === 'tick' && this.ready) this.tick(msg);
    }

    private welcome (you: string, state: WorldState, server: string) {
        for (const v of this.views.values()) destroyView(v);
        this.views.clear();
        this.farmers.clear();
        this.amb.forgetRoofs();
        this.marks.clear(); this.lit.clear(); this.blds.clear(); this.bldVersion++;
        this.fv.clear();
        this.me = you;
        this.serverName = server;
        this.world = new World(state.plots, state.seed);
        this.amb.pendingDug = state.mine ? state.mine.dug.slice() : [];       // (the caves are only made when this farmer goes down there: until then it just remembers what was dug)
        this.amb.underNow = false;
        this.ents = state.ents;
        for (const e of Object.values(this.ents)) {
            occupy(this.world, e);
            this.createView(e, false);
        }
        this.veins?.destroy(); this.veins = null;
        this.tiles?.destroy();
        this.tiles = new TileLayer(this, this.world);
        this.sea?.destroy();
        this.sea = new Sea(this);
        // the four rift gates, one at the heart of each rift island
        for (const gate of this.gates) gate.destroy();
        this.gates = [];
        for (let i = 0; i < RIFT_ISLANDS; i++) {
            const c = this.world.riftCenter(i);
            this.shadowFor(c.x, c.y + 12, 30);
            this.gates.push(this.add.sprite(c.x, c.y + 14, 'riftgate', 0).setOrigin(0.5, 1).setDepth(c.y + 12));
        }
        this.veins = new VeinLayer(this.world, this.tiles);
        this.veins.sync();
        this.applyClock(state);
        this.seed = state.seed;
        this.prodHist.reset(state.prod ?? {}, this.clock.time);
        this.shopState = state.shop ?? null;
        this.chron = (state.chron ?? []).slice();
        this.wishS = state.wish ?? null;
        this.players = {};
        // (others arrive as their public view with their max hearts worked out by the server; only the own record is whole)
        for (const p of Object.values(state.players) as (PlayerView | PlayerS)[]) this.players[p.id] = { ...p, mh: 'mh' in p ? p.mh : derived(p).maxHearts };
        this.meS = state.players[you];
        this.local.x = this.meS.x; this.local.y = this.meS.y; this.local.warp = this.meS.warp;
        for (const p of Object.values(this.players)) if (p.online) this.farmers.ensure(p);
        this.camTarget.set(this.local.x, this.local.y - 8);
        this.cameras.main.centerOn(this.local.x, this.local.y - 8);
        this.view3d?.welcome(this.world, Object.values(this.ents));
        this.ready = true;
        this.emitEvent('hud:ready');
        this.emitEvent('hud:plotsChanged');
    }

    private applyClock (m: { time: number; clock: number; day: number; night: boolean; nightLen: number; paused: boolean }) {
        this.clock = { time: m.time, clock: m.clock, day: m.day, night: m.night, nightLen: m.nightLen, paused: m.paused };
    }

    private tick (m: TickMsg) {
        this.applyClock(m);
        if (m.prod) this.prodHist.set(m.prod, this.clock.time);
        if (m.shop) this.shopState = m.shop;
        if (m.plots.length) {
            const risen: Plot[] = [], changed: Plot[] = [];
            for (const p of m.plots) {
                const old = this.world.plots[p.i];
                // a plot bought, a nest isle rising out of the sea, or one cleansed (its ground turns back to its biome): re-tile it
                if ((!old.owned && p.owned) || (old.blight ?? 0) !== (p.blight ?? 0)) risen.push(old);
                for (const k of ['blight', 'nl', 'nk'] as const) if (!(k in p)) delete old[k];       // (a key gone from the plot is gone here too)
                Object.assign(old, p);
                changed.push(old);
            }
            this.world.recompute();
            this.view3d?.plots(changed, risen);
            for (const plot of risen) {
                this.tiles?.redraw(plot, (x, y, ring) => {
                    for (let i = 0; i < 6; i++) {
                        const a = Math.random() * Math.PI * 2;
                        this.ambient.explode(1, x + Math.cos(a) * ring * TILE, y + Math.sin(a) * ring * TILE);
                    }
                });
            }
            this.veins?.sync();
            this.emitEvent('hud:plotsChanged');
        }
        if (m.dug?.length) {                                    // somebody dug: open the rock (and re-tile it if we are looking)
            if (this.world.caveReady) { for (const i of m.dug) if (this.world.openTile(i)) this.tiles?.openCave(i); }
            else this.amb.pendingDug.push(...m.dug);
        }
        for (const p of m.players) this.updatePlayerData(p);
        for (const e of m.ev) { this.event(e); this.view3d?.event(e, this.me); }
        for (const e of m.ents) this.upsert(e);
        for (const id of m.gone) this.removeEnt(id);
    }

    private updatePlayerData (d: PlayerDelta) {
        const was = this.players[d.id];
        const p = applyPlayerDelta(was, d);
        this.players[p.id] = p;
        if (p.id === this.me) {
            this.meS = p as PlayerS;
            if (p.warp !== this.local.warp) {
                this.local.warp = p.warp;
                this.local.x = p.x; this.local.y = p.y;
                this.local.kx = 0; this.local.ky = 0;
                this.cameras.main.centerOn(p.x, p.y - 8);
            }
        }
        if (p.online) this.farmers.ensure(p);
        else if (was?.online) this.farmers.remove(p.id);
    }

    inView (x: number, y: number, margin = 40) {
        const v = this.cameras.main.worldView;
        return x > v.x - margin && x < v.right + margin && y > v.y - margin && y < v.bottom + margin;
    }

    private event (e: SimEvent) {
        switch (e.e) {
            case 'fx': {
                const mine = e.by === this.me || e.by === '*';
                if (!mine && !this.inView(e.x, e.y)) return;
                // many export chutes in view would rattle: one soft coin sound at a time
                const hush = e.fx === 'chute' && this.time.now < this.chuteHushUntil;
                if (e.fx === 'chute' && !hush) this.chuteHushUntil = this.time.now + 350;
                // the acting player gets the full trio; bystanders see and hear it
                this.fx.play(e.fx, e.x, e.y, { pitch: e.pitch, noShake: !mine, quiet: hush });
                if (e.fx === 'perfect') {
                    // a white ring and a flash on whoever pulled it off (everyone in view sees it); only that farmer's own screen slows for the beat
                    this.slow.ringFlash(e.x, e.y + 2);
                    flash(this, this.farmers.get(e.by ?? '')?.sprite, 140);
                    if (e.by === this.me) this.slow.begin();
                }
                return;
            }
            case 'swing': {
                if (e.by !== this.me) this.farmers.swingAnim(this.farmers.get(e.by), e.x);
                this.combat.swing(e);
                const v = this.viewAt(e.x, e.y);
                if (v && v.sprite.active) { squash(this, v.sprite, 1.15, 0.88, 60); flash(this, v.sprite); }
                return;
            }
            case 'pickup': {
                const v = this.views.get(e.id);
                const to = e.by === this.me ? this.local : this.farmers.get(e.by);
                if (v && to) {
                    v.claimed = true;
                    this.tweens.add({
                        targets: v.sprite, x: to.x, y: to.y - 8, scale: 0.6, duration: 160, ease: 'Quad.easeIn',
                        onComplete: () => destroyView(v),
                    });
                }
                if (e.by === this.me) {
                    const t = this.tally.get(e.res) ?? { n: 0, t: 0 };
                    t.n++; t.t = 0.9;
                    this.tally.set(e.res, t);
                    const name = e.res === 'coin' ? 'Coins' : ITEMS[e.res].name;
                    this.float(this.local.x, this.local.y - 22, `+${t.n} ${name}`, e.res === 'coin' ? PAL.gold : PAL.cream, `pick-${e.res}`);
                }
                return;
            }
            case 'tele': if (this.inView(e.x, e.y, 160)) this.combat.tele(e); return;
            case 'chat': case 'emote': case 'ping': this.emitEvent('hud:social', e); return;
            case 'wish': this.wishS = e.wish; return;
            case 'chron': this.chron.push(e.entry); if (this.chron.length > 300) this.chron.shift(); if (!/^(lvl|join):/.test(e.entry.k ?? '')) this.emitEvent('hud:toast', { text: e.entry.t, icon: 'k_book', color: PAL.cream }); return;
            case 'ways': this.ways = { from: e.from, list: e.list }; return;
            case 'pod': this.crit.pod(e, this.views.get(e.id)); return;
            case 'work': this.crit.work(e, this.views.get(e.id)); return;
            case 'hop': this.crit.hop(this.views.get(e.id)); return;
            case 'float': this.emitEvent('hud:float', e); return;
            case 'banner': this.emitEvent('hud:banner', e); return;
            case 'toast': this.emitEvent('hud:toast', e); return;
            case 'open': this.emitEvent('hud:open', { ui: e.ui, id: e.id }); return;
            case 'riftend': this.emitEvent('hud:riftend', e); return;
            case 'catch': this.emitEvent('hud:catch', e); return;
            case 'loot': this.emitEvent('hud:loot', e); return;
            case 'spin': this.emitEvent('hud:spin', e); return;
            case 'gamble': this.emitEvent('hud:gamble', e); return;
            case 'story': this.emitEvent('hud:story', e); return;
            case 'knock':
                if (e.to !== this.me) return;
                this.local.kx = e.vx; this.local.ky = e.vy;
                if (!e.soft) { flash(this, this.farmers.get(this.me)?.sprite, 90); this.emitEvent('hud:hurt'); }       // (a chain's pull is not a blow)
                return;
        }
    }

    // ── entity views ────────────────────────────────────────────────────────
    landmarks () { return this.marks.values(); }
    lightSources () { return this.lit.values(); }
    buildings (): BuildE[] { return [...this.blds.values()]; }
    wallMask (tx: number, ty: number) { return this.bviews.wallMask(tx, ty); }

    private track (e: Ent) {
        if (e.k === 'bld') { this.blds.set(e.id, e); if (LANDMARKS.has(e.kind)) this.marks.set(e.id, e); if (BUILDINGS[e.kind].light || e.kind === 'furnace' || e.kind === 'coalgen') this.lit.set(e.id, e); }
        else if (e.k === 'mob') { if (MOBS[e.kind].boss) this.marks.set(e.id, e); if (LIGHT_MOBS.has(e.kind)) this.lit.set(e.id, e); }
        else if (e.k === 'node' && e.kind === 'nest') this.lit.set(e.id, e);         // (a Blight nest smoulders in the dark)
        else if (e.k === 'proj') this.lit.set(e.id, e);
        else if (e.k === 'crit' && LIGHT_SPECIES.has(e.sp)) this.lit.set(e.id, e);
    }

    private upsert (e: Ent) {
        this.ents[e.id] = e;
        this.view3d?.upsert(e);
        const v = this.views.get(e.id);
        if (!v) { occupy(this.world, e); this.createView(e, true); return; }
        v.ent = e;
        if (this.marks.has(e.id)) this.marks.set(e.id, e);        // (a delta brings a new object: the lists must hold the live one)
        if (this.lit.has(e.id)) this.lit.set(e.id, e);
        if (e.k === 'bld') { this.blds.set(e.id, e); this.bviews.refresh(v, e); this.fv.touch(e); }
        else if (e.k === 'drop' && !v.claimed) v.sprite.setDepth(e.y + 1);
    }

    private removeEnt (id: number) {
        const e = this.ents[id];
        delete this.ents[id];
        this.view3d?.remove(id);
        this.marks.delete(id); this.lit.delete(id);
        if (this.blds.delete(id)) this.bldVersion++;
        this.fv.remove(id);
        this.titanFx.forget(id);
        this.blightFx.forget(id);
        if (e) vacate(this.world, e);
        if (e?.k === 'bld' && (BUILDINGS[e.kind].wall || BUILDINGS[e.kind].gate)) this.bviews.rejoinWalls(e);
        this.amb.roofs.delete(id);
        const v = this.views.get(id);
        if (!v) return;
        this.views.delete(id);
        const t = this.act.target;
        if (t?.kind === 'ent' && t.ent.id === id) this.act.target = null;
        if (v.claimed) return;
        if (e?.k === 'proj') { this.ambient.explode(2, v.x, v.y - 5); destroyView(v); return; }
        destroyView(v, true);
        this.tweens.add({ targets: v.sprite, scaleX: 1.4, scaleY: 0, alpha: 0, duration: 140, onComplete: () => v.sprite.destroy() });
    }

    shadowFor (x: number, y: number, w: number) {
        return this.add.image(x, y, 'shadow', 0).setTint(PAL.ink).setAlpha(0.3).setDepth(-5).setScale(Math.min(2.8, w / 12), 1);
    }

    private createView (e: Ent, pop: boolean) {
        let v: EntView;
        if (e.k === 'node') {
            const x = (e.tx + 0.5) * TILE, y = (e.ty + 1) * TILE - 1;
            const sprite = this.add.image(x, y, NODES[e.kind].tex(this.world.plots[e.plot]?.biome ?? 'meadow'), 0).setOrigin(0.5, 1).setDepth(y);
            v = { ent: e, sprite, shadow: this.shadowFor(x, y, sprite.width), x, y };
        } else if (e.k === 'bld') {
            v = this.bviews.create(e);
        } else if (e.k === 'drop') {
            const sprite = this.add.image(e.x, e.y, iconOf(e.res), 0).setOrigin(0.5, 1).setDepth(e.y + 1);
            v = { ent: e, sprite, x: e.x, y: e.y };
            if (pop) {
                const arc = { t: 0 };
                sprite.setPosition(e.ox, e.oy);
                this.tweens.add({
                    targets: arc, t: 1, duration: 380, ease: 'Linear',
                    onUpdate: () => sprite.active && sprite.setPosition(e.ox + (e.x - e.ox) * arc.t, e.oy + (e.y - e.oy) * arc.t - Math.sin(arc.t * Math.PI) * 10),
                });
            }
        } else if (e.k === 'proj') {
            const { sprite, glow } = createProj(this, e);
            v = { ent: e, sprite, glow, x: e.x, y: e.y };
        } else if (e.k === 'crit') {
            const { sprite, shadow } = createCrit(this, e);
            v = { ent: e, sprite, shadow, x: e.x, y: e.y, born: pop ? this.time.now : undefined };
            if (pop) this.ambient.explode(4, e.x, e.y - 4);
        } else {
            const { sprite, shadow } = createMob(this, e);
            v = { ent: e, sprite, shadow, x: e.x, y: e.y, born: pop ? this.time.now : undefined };
            if (pop && !MOBS[e.kind].boss) this.ambient.explode(5, e.x, e.y - 4);
        }
        if (pop && e.k !== 'drop' && e.k !== 'mob' && e.k !== 'proj' && e.k !== 'crit' && !(e.k === 'bld' && BUILDINGS[e.kind].floor)) {
            v.sprite.setScale(e.k === 'bld' ? 1.3 : 0, e.k === 'bld' ? 0.2 : 0);
            this.tweens.add({ targets: v.sprite, scaleX: 1, scaleY: 1, duration: e.k === 'bld' ? 320 : 260, ease: 'Back.easeOut' });
            if (e.k === 'node') this.ambient.explode(4, v.x, v.y - 4);
        }
        this.views.set(e.id, v);
        this.track(e);
        if (e.k === 'bld') { this.bldVersion++; this.fv.add(e); }
    }

    private viewAt (x: number, y: number): EntView | null {
        for (const v of this.views.values()) {
            const e = v.ent;
            const c = e.k === 'mob' ? { x: v.x, y: v.y - 4 } : e.k === 'node' || e.k === 'bld' ? { x: v.x, y: v.y - 6 } : null;
            const rad = e.k === 'mob' ? Math.max(14, MOBS[e.kind].r + 6) : 14;
            if (c && Math.abs(c.x - x) < rad && Math.abs(c.y - y) < rad * 0.9) return v;
        }
        return null;
    }

    /** Off screen a monster or creature only glides toward where the world says it is (what hangs over it waits for the sprite to show again). */
    private glide (v: EntView, e: Ent & { x: number; y: number }, dt: number, rate: number) {
        const k = Math.min(1, dt * rate);
        v.x += (e.x - v.x) * k; v.y += (e.y - v.y) * k;
        v.sprite.setPosition(v.x, v.y).setDepth(v.y);
        v.shadow?.setPosition(v.x, v.y);
        v.mark?.setVisible(false); v.bub?.setVisible(false); v.bubIcon?.setVisible(false); v.cargo?.setVisible(false); v.pod?.setVisible(false);
        v.stars?.forEach((im) => im.setVisible(false));
    }

    private updateViews (dt: number) {
        const night = this.nightAmount();
        const hearth = this.amb.beginHearths();
        const sun = sunlight(this.clock.clock, this.clock.nightLen);
        const wv = this.cameras.main.worldView, m = 48;
        const vis = this.visViews;
        vis.length = 0;
        for (const v of this.views.values()) {
            const e = v.ent;
            const onScreen = v.x > wv.x - m && v.x < wv.right + m && v.y > wv.y - m && v.y < wv.bottom + m;
            if (onScreen || (e.k === 'mob' && MOBS[e.kind].boss)) vis.push(v);       // (a boss's arena ring shows while it is off screen)
            if (!onScreen) {
                // off screen nothing is animated, only kept where it belongs (a hearth keeps its slow fill, it is cheap and rare)
                if (e.k === 'mob') this.glide(v, e, dt, MOBS[e.kind].boss ? 8 : 12);
                else if (e.k === 'crit') this.glide(v, e, dt, e.mode === 1 ? 9 : 12);
                else if (e.k === 'proj') animateProj(v, e, dt);
                else if (e.k === 'bld' && isHearthSpot(e.kind)) this.amb.drawHearth(hearth, v, e, dt);
                continue;
            }
            if (e.k === 'mob') {
                animateMob(this, v, e, dt, this.time.now);
            } else if (e.k === 'proj') {
                animateProj(v, e, dt);
            } else if (e.k === 'crit') {
                animateCrit(this, v, e, dt, this.time.now);
            } else if (e.k === 'node' && (e.gold || e.kind === 'mound')) {
                // luck you can see: golden nodes shine and sparkle, buried treasure glints
                const t = this.time.now / 1000;
                if (e.gold) (v.sprite as Img).setTint(mixc(0xffd966, 0xfff6e0, 0.5 + 0.5 * Math.sin(t * 4 + e.id)));
                if (Math.random() < dt * (e.gold ? 4 : 1.4)) this.glint.explode(1, v.x + (Math.random() - 0.5) * 12, v.y - 3 - Math.random() * (v.sprite.displayHeight * 0.8));
            } else if (e.k === 'node' && NODES[e.kind].titan) {
                this.titanFx.mark(v, e, this.inView(v.x, v.y - 16, 70));
            } else if (e.k === 'node' && e.kind === 'nest') {
                this.blightFx.nest(v, e, this.world.plots[e.plot], this.time.now);
            } else if (e.k === 'bld') {
                const def = BUILDINGS[e.kind];
                this.fv.animate(v, e, dt, sun);
                const working = def.proc && (e.prog ?? 0) > 0 && !!e.rcp;
                if (working && Math.random() < dt * 5) this.ambient.explode(1, v.x + (Math.random() - 0.5) * 4, v.y - 10);
                if (e.kind === 'campfire') {
                    if (Math.random() < dt * (this.clock.night ? 14 : 5)) this.ambient.explode(1, v.x + (Math.random() - 0.5) * 4, v.y - 6);
                    v.sprite.setScale(1, 1 + Math.sin(this.time.now / 90) * 0.04);
                }
                if (v.glow) {
                    const lit = e.kind === 'campfire' || night > 0.15;
                    v.glow.setAlpha(lit ? (0.05 + night * 0.16) * (0.85 + Math.sin(this.time.now / 130 + e.id) * 0.15) : 0);
                }
                if (e.kind === 'mill') v.blades?.setRotation(v.blades.rotation + dt * 1.2);
                if (isHearthSpot(e.kind)) this.amb.drawHearth(hearth, v, e, dt);
            }
        }
        this.titanFx.draw(this.time.now);
        this.blightFx.draw();
    }

    // ── the farmer: stats, actions, what the HUD asks ───────────────────────
    get playerPos () { return { x: this.local.x, y: this.local.y }; }

    /** Your farmer's derived stats, worked out once per state: `meS` is only replaced when a tick carries a delta, so everything that asks in between shares one answer. */
    derivedMe (): Derived {
        const me = this.meS!;
        if (this.dCache?.me !== me) this.dCache = { me, d: derived(me) };
        return this.dCache.d;
    }

    /** Is an entity within `range` of you? `spot` gives a matching entity's position (null: not one). Walks every entity: for the 2 Hz hint scans, never per frame. */
    private anyNear (range: number, spot: (e: Ent) => { x: number; y: number } | null) {
        for (const e of Object.values(this.ents)) {
            const p = spot(e);
            if (p && dist(p.x, p.y, this.local.x, this.local.y) <= range) return true;
        }
        return false;
    }

    /** Is a Titan node (a Great Oak, a Titan Boulder) close to you? The first-time hint for them waits for it. */
    titanNear (range = 100) {
        return this.anyNear(range, (e) => e.k === 'node' && NODES[e.kind].titan ? { x: (e.tx + 0.5) * TILE, y: (e.ty + 0.5) * TILE } : null);
    }

    /** Is a monster close to you winding up an attack (a boss's red warning, a charger crouching)? The first-time hint for the Perfect dash waits for it. */
    windupNear (range = 150) {
        return this.anyNear(range, (e) => e.k === 'mob' && e.st === 1 ? e : null);
    }

    // (the world/* helpers, in the words the HUD and the screens use)
    swingCooldownFrac () { return this.act.swingCooldownFrac(); }
    get demolishFrac () { return this.act.demolishFrac; }
    /** The building in hand (null: none). */
    get placing (): Placing | null { return this.placer.cur; }
    /** What you are aiming a swing at. */
    get target (): Target | null { return this.act.target; }
    interact () { this.act.interact(); }
    stationNear (station: StationId) { return this.act.stationNear(station); }
    petBeside () { return this.act.petBeside(); }
    get hotSel () { return this.hands.sel; }
    heldItem () { return this.hands.held(); }
    hotSelect (i: number, use = true) { this.hands.select(i, use); }
    hotCycle (dir: number) { this.hands.cycle(dir); }
    throwPod () { this.hands.throwPod(); }
    startPlacing (kind: BuildingKind) { this.placer.start(kind); }
    cancelPlacing () { this.placer.cancel(); }
    /** Turn what you are placing (R, or the phone's TURN button). */
    turnPlacing () { this.placer.turn(); }
    /** Stop whatever tool is in your hand: a building ghost, a blueprint selection or paste. */
    cancelTools () { this.placer.cancel(); this.bp.cancel(); }
    nightAmount () { return nightAmount(this.clock.clock, this.clock.nightLen); }
    /** Is the farmer down in the caves? */
    get underNow () { return this.amb.underNow; }
    get underground () { return this.amb.underNow; }
    undergroundAmount () { return this.amb.undergroundAmount(); }
    caveDepthHere () { return this.amb.caveDepthHere(); }
    dreadAmount () { return this.amb.dreadAmount(); }
    /** Items the farm's machines have made so far (for production goals). */
    prod () { return this.prodHist.map; }
    /** Per-item production over the recent past: items per minute and a bar history (oldest first). */
    prodRates (bars = 24) { return this.prodHist.rates(this.clock.time, bars); }
    serverSeed () { return this.seed; }
    shop () { return this.shopState; }
    /** The farm chronicle, oldest first (the Journal's Chronicle tab). */
    chronicle () { return this.chron; }
    /** The season wish vote (the Season wish window and the chip beside the buffs). */
    wishState () { return this.wishS; }

    /** Dash the way you are facing (Shift, or the phone's DASH button). */
    dash () {
        if (!this.ready || this.menuOpen || !hasUnlock(this.meS!, 'dash') || this.meS!.co?.k === 'frozen') return;
        const f = this.local.face;
        this.send({ t: 'dash', fx: f.x, fy: f.y });
    }

    /** What the phone's context buttons should offer right now (fish, throw a pod, turn or cancel a placement, dismantle, dash). */
    touchContext () {
        const me = this.meS;
        const none = { fish: '', pod: false, turn: false, cancel: false, take: false, dash: false };
        if (!this.ready || !me || me.downed > 0 || this.menuOpen) return none;
        const placing = !!this.placer.cur || this.bp.active;
        const wild = placing ? null : this.act.near.wild;
        return {
            fish: placing ? '' : me.fishing ? 'PULL' : hasRod(me) && castTarget(this.world, this.local) ? 'FISH' : '',
            pod: !!wild && !!this.hands.podFor(wild.sp),
            turn: (!!this.placer.cur && !!BUILDINGS[this.placer.cur.kind].dir) || this.bp.mode === 'paste',
            cancel: placing,
            take: !placing && !!this.act.near.take,
            dash: !placing && hasUnlock(me, 'dash'),
        };
    }

    buyPlot (plot: Plot) { if (this.ready) this.send({ t: 'buy', plot: plot.i }); }
    eat (item?: ItemId) { if (this.ready && !this.menuOpen) this.send({ t: 'eat', item }); }
    useItem (item: ItemId) { if (this.ready) this.send({ t: 'eat', item }); }
    /** Solo only: menus pause the world. */
    setPaused (on: boolean) { if (this.conn.mode === 'solo') this.send({ t: 'pause', on }); }

    /** Back to the title screen; `notice` is shown there (why the connection ended). */
    leave (notice = '') {
        this.conn.close();
        this.scene.stop('Hud');
        this.scene.start('Title', { notice });
    }

    /** Keep a freshly copied layout in the book (newest first) under the next free name. */
    private saveBlueprint (bp: Blueprint) {
        const used = this.blueprints.map((b) => Number(/^Blueprint (\d+)$/.exec(b.name)?.[1] ?? 0));
        bp.name = `Blueprint ${Math.max(0, ...used) + 1}`;
        this.blueprints.unshift(bp);
        if (this.blueprints.length > MAX_SAVED) this.blueprints.length = MAX_SAVED;
        saveBlueprints(this.blueprints);
        this.emitEvent('hud:toast', { text: `Saved ${bp.name}: ${bp.items.length} piece${bp.items.length > 1 ? 's' : ''}  (V to open your book)`, icon: 'k_gear', color: PAL.gold });
    }

    deleteBlueprint (id: string) {
        this.blueprints = this.blueprints.filter((b) => b.id !== id);
        saveBlueprints(this.blueprints);
    }

    // ── fishing ──────────────────────────────────────────────────────────────
    fishKey () {
        if (!this.ready || this.menuOpen || this.meS!.downed > 0 || this.meS!.co?.k === 'frozen' || this.placer.cur) return;
        const me = this.meS!;
        if (me.fishing) { this.send({ t: 'fish', op: 'reel' }); return; }
        if (!hasRod(me)) { this.fx.play('deny', this.local.x, this.local.y - 10); this.float(this.local.x, this.local.y - 24, 'Craft a Fishing Rod (Workbench)', PAL.cream); return; }
        const target = castTarget(this.world, this.local);
        if (!target) { this.fx.play('deny', this.local.x, this.local.y - 10); this.float(this.local.x, this.local.y - 24, 'Face open water', PAL.cream); return; }
        this.send({ t: 'fish', op: 'cast', x: Math.round(target.x), y: Math.round(target.y) });
        this.farmers.swingAnim(this.farmers.get(this.me), target.x);
    }

    private drawFishing (dt: number) {
        const lines: LineView[] = [];
        for (const pv of this.farmers.values()) {
            const p = pv.id === this.me ? this.meS : this.players[pv.id];
            const ln = p?.line;
            if (!ln || !p) continue;
            if (Math.abs(ln.x - pv.x) > 2) pv.flip = ln.x < pv.x;
            const side = pv.flip ? -1 : 1;
            lines.push({ id: pv.id, tipX: pv.x + side * 12, tipY: pv.y - 14, x: ln.x, y: ln.y, ph: ln.ph, mine: pv.id === this.me });
        }
        this.fishLines.draw(dt, lines);
    }

    // ── the camera and the HUD's questions ──────────────────────────────────
    /** Zoom in (+1) or out (-1) one step: the + and - keys, Ctrl + wheel, pinching, the buttons under the minimap. */
    zoomBy (dir: number) {
        const i = Math.max(0, Math.min(ZOOM_STEPS.length - 1, ZOOM_STEPS.indexOf(this.zoomTarget) + (dir > 0 ? 1 : -1)));
        if (ZOOM_STEPS[i] === this.zoomTarget) return;
        this.zoomTarget = ZOOM_STEPS[i];
        settings.zoom = this.zoomTarget;
        saveSettings();
    }

    /** How close the camera is going to be (1 is the classic view). */
    get zoomLevel () { return this.zoomTarget / ZOOM; }

    /** Glide to the chosen zoom instead of jumping. */
    private updateZoom (dt: number) {
        const cam = this.cameras.main, want = this.zoomTarget * SS * (1 + this.slow.punch());
        if (Math.abs(cam.zoom - want) < 0.02) { if (cam.zoom !== want) cam.setZoom(want); return; }
        cam.setZoom(cam.zoom + (want - cam.zoom) * Math.min(1, dt * 12));
    }

    /** World position → screen position for the HUD, through the view in use (2D: the camera has no rotation; 3D: projected through the 3D camera). */
    worldToScreen (x: number, y: number) {
        return this.ptr.toScreen(x, y);
    }

    /** The creatures at work close to you (workers and companions with something to do), where they are drawn, for the HUD's captions. */
    nearWorkers (range = 150): { id: number; e: CritE; x: number; y: number }[] {
        const out: { id: number; e: CritE; x: number; y: number }[] = [];
        for (const v of this.visViews) {           // (only what is on screen: a caption 150 px away is always in view, and this runs every frame)
            const e = v.ent;
            if (e.k !== 'crit' || !e.ac || (e.mode !== 2 && e.mode !== 1)) continue;
            if (dist(v.x, v.y, this.local.x, this.local.y) <= range) out.push({ id: e.id, e, x: v.x, y: v.y });
        }
        return out;
    }

    /** Rendered position of any player (smoothed), for name tags and the map. */
    playerScreenPos (id: string) {
        const pv = this.farmers.get(id);
        return pv ? { x: pv.x, y: pv.y } : null;
    }

    private exposeDebug () {
        if (!import.meta.env.DEV) return;
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const scene = this;
        window.__farm = {                       // (the shape is FarmDebug in src/dev/harness.ts, which also declares it on Window)
            scene,
            get conn () { return scene.conn; },
            /** solo only: the in-browser simulation (give items, jump the clock…) */
            get sim () { return (scene.conn as unknown as { debugSim?: unknown }).debugSim; },
            get me () { return scene.meS; },
            give: (res: Res, n = 10) => scene.send(res === 'coin' ? { t: 'devdo', op: 'coins', n } : { t: 'devdo', op: 'item', id: res, n }),
            xp: (n = 100) => scene.send({ t: 'devdo', op: 'xp', n }),
            unlockAll: () => scene.send({ t: 'devdo', op: 'skills' }),
            night: () => scene.send({ t: 'devdo', op: 'clock', n: TUNING.dayLength - 0.1 }),
        };
    }
}
