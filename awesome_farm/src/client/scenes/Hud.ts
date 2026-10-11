// HUD overlay scene (zoom 1, drawn above Game). Owns the always-on HUD layer, floating
// text, banners, toasts, land price tags and the screen manager (inventory, crafting,
// skills, build, machines, chests, market, menu). Menus never stop the shared world;
// in solo they pause it.

import * as labWorld from '../../shared/sim/lab';
import type { LocalConnection } from '../net/connection';
import { LabPanel } from '../ui/labpanel';
import * as Phaser from 'phaser';
import { TUNING, VIEW_W } from '../../shared/config';
import { BUILDINGS } from '../../shared/data/buildings';
import { css, PAL } from '../../shared/palette';
import { hasUnlock, PLAYER_COLORS } from '../../shared/sim/stats';
import type { Cmd, PlayerS, UiKind } from '../../shared/sim/types';
import { settings } from '../settings';
import { BossBar } from '../ui/bossbar';
import { CoHud } from '../ui/costatus';
import { CO_INFO } from '../../shared/data/costatus';
import { FishHud } from '../ui/fishing';
import { RiftHud } from '../ui/rift';
import { updateMusic } from '../juice/music';
import { ChatUI } from '../ui/chat';
import { NightLayer } from '../ui/night';
import { CompanionCard, QuestTracker } from '../ui/companion';
import { HudLayer } from '../ui/hudlayer';
import { DuskPill, PartyList } from '../ui/party';
import { ArtsBar } from '../ui/artsbar';
import { pausesWorld } from '../ui/screens/live';
import { button, forDevice, H, hideTip, icon, label, setHudScaleSource, setTooltip, tipOn, Toasts, Tooltip, W } from '../ui/kit';
import { LandPlates } from '../ui/plates';
import { TouchControls } from '../ui/touchcontrols';
import { BannerQueue, BOSS, bottomRect, bottomStack, CHIPS_H, clearOfHud, EDGE, glide, LEFT, PLAQUE, slots, toastLane, TOP_SLOT, topStack, worldBlock, type BottomStack, type TopStack } from '../ui/slots';
import { FactoryLabels } from '../ui/factorylabels';
import { FACTORY_VIEW_KEY } from '../../shared/data/howto';
import { bar, panel, rect, STYLES } from '../ui/px';
import { AltarScreen } from '../ui/screens/altar';
import { BlueprintScreen } from '../ui/screens/blueprints';
import { BoonScreen } from '../ui/screens/boons';
import { BuildScreen } from '../ui/screens/build';
import { CraftScreen } from '../ui/screens/craft';
import { ACTIVITY, spOf } from '../../shared/data/creatures';
import { CreatureScreen } from '../ui/screens/creatures';
import { DenScreen } from '../ui/screens/den';
import { DevToolsScreen } from '../ui/screens/devtools';
import { TowerScreen } from '../ui/screens/tower';
import { VaneScreen } from '../ui/screens/vane';
import { forecast } from '../../shared/weather';
import { DevUnlock } from '../ui/devunlock';
import { DockScreen } from '../ui/screens/dock';
import { HatcheryScreen } from '../ui/screens/hatchery';
import { RiftEndScreen } from '../ui/screens/riftend';
import { InventoryScreen } from '../ui/screens/inventory';
import { GearScreen } from '../ui/screens/gear';
import { ArtsScreen } from '../ui/screens/arts';
import { CrewPickScreen } from '../ui/screens/crewpick';
import { GuideScreen } from '../ui/screens/guide';
import { JobPostScreen } from '../ui/screens/jobpost';
import { LauncherScreen } from '../ui/screens/launcher';
import { createHints, type Hints } from '../ui/hints';
import { Tutorial } from '../ui/tutorial';
import { JournalScreen } from '../ui/screens/journal';
import { LootScreen } from '../ui/screens/loot';
import { StoryScreen, storySteps } from '../ui/screens/story';
import { WheelScreen } from '../ui/screens/wheel';
import { DeviceScreen } from '../ui/screens/device';
import { MachineScreen } from '../ui/screens/machine';
import { MenuScreen } from '../ui/screens/menu';
import { SkillScreen } from '../ui/screens/skills';
import { WaystoneScreen } from '../ui/screens/waystone';
import { LookScreen } from '../ui/screens/look';
import { WishScreen } from '../ui/screens/wish';
import { MailScreen } from '../ui/screens/mail';
import { TableScreen } from '../ui/screens/table';
import { shouldWelcome, WelcomeScreen } from '../ui/screens/welcome';
import { ChestSetupScreen } from '../ui/screens/chestcfg';
import { BedScreen, ChestScreen, MarketScreen } from '../ui/screens/storage';
import type { Screen, ScreenCtx } from '../ui/screens/types';
import type { GameEvents, GameScene } from './Game';
import { hudCamera, logical } from '../res';
import { keyOf, setTouchUi } from '../input/layout';

/** A floating text: `lift` raises it over a float that started at the same spot a moment before, so both can be read. */
interface Float { key?: string; wx: number; wy: number; t: Phaser.GameObjects.Text; age: number; lift: number }
/** The 'down' panel takes the top slot (the coach card, tips and banners wait while it is up), so the fallen farmer in the middle of the screen stays in view. */
const DOWN = { x: TOP_SLOT.x, y: TOP_SLOT.y, w: TOP_SLOT.w, h: 96, hFriends: 118 };

/** The window each `open` event's building kind gets, opened with `{ id }`. */
const UI_SCREEN: Partial<Record<UiKind, string>> = { proc: 'machine', device: 'device', altar: 'altar', den: 'den', waystone: 'waystone', dock: 'dock', hatchery: 'hatchery', vane: 'vane', chest: 'chest', bed: 'bed', fortune: 'wheel', mail: 'mail', table: 'table', tower: 'tower' };
/** Windows a hotkey does not swap away from (they belong to the thing in front of you, or hold a moment that should not be skipped). */
const STICKY = new Set(['machine', 'device', 'altar', 'den', 'chest', 'chestcfg', 'bed', 'dock', 'hatchery', 'boons', 'riftend', 'loot', 'wheel', 'story']);

const SCREENS: Record<string, new (ctx: ScreenCtx, arg?: unknown) => Screen> = {
    inventory: InventoryScreen, gear: GearScreen, arts: ArtsScreen, craft: CraftScreen, skills: SkillScreen, build: BuildScreen,
    machine: MachineScreen, device: DeviceScreen, altar: AltarScreen, creatures: CreatureScreen, den: DenScreen, journal: JournalScreen, guide: GuideScreen, launcher: LauncherScreen, jobpost: JobPostScreen, crewpick: CrewPickScreen, waystone: WaystoneScreen, welcome: WelcomeScreen, chest: ChestScreen, chestcfg: ChestSetupScreen, market: MarketScreen, bed: BedScreen, menu: MenuScreen, map: MenuScreen,
    dock: DockScreen, boons: BoonScreen, riftend: RiftEndScreen, hatchery: HatcheryScreen, blueprints: BlueprintScreen,
    loot: LootScreen, wheel: WheelScreen, story: StoryScreen, look: LookScreen, dev: DevToolsScreen, wish: WishScreen, mail: MailScreen, vane: VaneScreen, table: TableScreen, tower: TowerScreen,
};

export class HudScene extends Phaser.Scene {
    private farm!: GameScene;
    private layer!: HudLayer;
    private bossBar!: BossBar;
    private riftHud!: RiftHud;
    private fishHud!: FishHud;
    private boonSeen = '';
    private chat!: ChatUI;
    private compCard!: CompanionCard;
    private party!: PartyList;
    private dusk!: DuskPill;
    private artsBar!: ArtsBar;
    /** Where the stacks at the top and above the hotbar are right now (they glide to where they should be). */
    private topNow: TopStack = topStack({});
    private botNow!: BottomStack;
    private chipsOn = false;
    private tracker!: QuestTracker;
    private labPanel: LabPanel | null = null;
    private tip!: Tooltip;
    private toasts!: Toasts;
    private night!: NightLayer;
    private promptT!: Phaser.GameObjects.Text;
    private statusT!: Phaser.GameObjects.Text;
    private downT!: Phaser.GameObjects.Text;
    private downSub!: Phaser.GameObjects.Text;
    private coHud!: CoHud;
    private respawnBtn!: ReturnType<typeof button>;
    /** What the down panel's title says: 0 nothing, 1 down, 2 being helped (its text is set only when this changes). */
    private downKey = 0;
    /** The down panel is up (it has the top slot: banners wait). */
    private downUp = false;
    private fpsIn = 0;
    private hints!: Hints;
    /** What the first-time hints look for in the world around you, looked at twice a second (not every frame: it walks the entities). */
    private hintScan = 0;
    private hintNear = { windup: false, titan: false };
    private tutorial!: Tutorial;
    private fpsT!: Phaser.GameObjects.Text;
    private barG!: Phaser.GameObjects.Graphics;
    private names = new Map<string, Phaser.GameObjects.Text>();
    private workTags = new Map<number, { t: Phaser.GameObjects.Text; key: string }>();
    private wheelZoom = 0;
    private zoomT!: Phaser.GameObjects.Text;
    private floats: Float[] = [];
    private plates!: LandPlates;
    private bannerTitle!: Phaser.GameObjects.Text;
    private bannerSub!: Phaser.GameObjects.Text;
    private banners = new BannerQueue();
    private bannerKey = '';
    private screen: Screen | null = null;
    private screenName = '';
    private queued: [string, unknown][] = [];
    private lootBack = '';
    private leaving = false;     // a failed connection is already taking us back to the title
    private photo = false;      // photo mode: the whole HUD hidden for screenshots
    private touchMode = false;
    private facLabels!: FactoryLabels;
    private facBtn!: ReturnType<typeof button>;
    private facState = '';
    private facTip = false;
    private overKey = '';
    private touchCtl: TouchControls | null = null;

    constructor () {
        super('Hud');
    }

    create () {
        hudCamera(this.cameras.main);
        this.farm = this.scene.get('Game') as GameScene;
        this.names = new Map(); this.workTags = new Map(); this.floats = []; this.screen = null; this.screenName = ''; this.queued = []; this.lootBack = ''; this.photo = false; this.leaving = false; this.scene.setVisible(true, this.scene.key);
        this.touchMode = this.sys.game.device.input.touch && !this.sys.game.device.os.desktop;
        setTouchUi(this.touchMode);
        slots.reset(this.touchMode);
        setHudScaleSource(() => this.scale.displaySize.width / VIEW_W);
        this.banners = new BannerQueue(); this.bannerKey = '';

        this.night = new NightLayer(this, this.farm);
        this.plates = new LandPlates(this, this.farm);
        this.layer = new HudLayer(this, this.farm, (id) => this.toggle(id));
        this.bossBar = new BossBar(this, this.farm);
        this.riftHud = new RiftHud(this);
        this.fishHud = new FishHud(this);
        this.boonSeen = '';
        this.chat = new ChatUI(this, this.farm);
        this.compCard = new CompanionCard(this, this.farm);
        this.party = new PartyList(this, this.farm);
        this.dusk = new DuskPill(this, this.farm);
        this.artsBar = new ArtsBar(this, this.farm, () => this.openScreen('arts'));
        this.tracker = new QuestTracker(this, this.farm, () => this.toggle('journal'));
        this.topNow = topStack({});
        this.botNow = bottomStack(this.touchMode, {});
        this.tip = new Tooltip(this);
        setTooltip(this.tip);
        this.toasts = new Toasts(this);
        this.hints = createHints((t, i, c) => this.toasts.push(t, i, c));
        this.tutorial = new Tutorial(this, this.farm, () => this.screenName, (t, i, c) => this.toasts.push(t, i, c), () => this.hints.cooling);
        this.barG = this.add.graphics().setDepth(6);
        this.promptT = label(this, W / 2, this.botNow.prompt, '', 15, PAL.cream, { origin: [0.5, 0.5], stroke: true }).setDepth(6);
        this.statusT = label(this, W / 2, H / 2, '', 22, PAL.cream, { origin: [0.5, 0.5], align: 'center', stroke: true }).setDepth(20);
        // the down panel: a title, the bar, the way out and a hint, in one frame under the farmer
        this.downT = label(this, W / 2, DOWN.y + 18, '', 24, PAL.berry, { origin: [0.5, 0.5], align: 'center', font: 'head' }).setDepth(8).setVisible(false);
        this.downSub = label(this, W / 2, DOWN.y + 92, this.touchMode ? 'or wait: a friend can help you up (they hold USE next to you)' : 'or wait: a friend can help you up (hold E next to you)', 12, PAL.cream, { origin: [0.5, 0], align: 'center', wrap: DOWN.w - 24 }).setDepth(8).setVisible(false);
        this.respawnBtn = button(this, W / 2, DOWN.y + 68, 250, 34, this.touchMode ? 'Wake up at home' : 'Wake up at home  (R)', () => this.farm.send({ t: 'respawn' }), { style: STYLES.berry, size: 15 });
        this.respawnBtn.root.setDepth(8).setVisible(false);
        this.coHud = new CoHud(this, this.farm);
        this.fpsT = label(this, 8, H - 8, '', 11, PAL.pebble, { origin: [0, 1], stroke: 2 }).setDepth(30).setVisible(false);
        this.bannerTitle = label(this, W / 2, 150, '', 34, PAL.cream, { origin: [0.5, 0.5], stroke: 5 }).setDepth(8).setAlpha(0);
        this.bannerSub = label(this, W / 2, 172, '', 16, PAL.cream, { origin: [0.5, 0], stroke: 4, bold: false, wrap: 660, align: 'center' }).setDepth(8).setAlpha(0);

        // zoom row at the foot of the world block: − and + and (once there is a factory to look at) the Factory view toggle (key L) on the left, the zoom on the right
        const wb = worldBlock(this.touchMode), bs = wb.btn, zy = wb.zoomY, zx0 = wb.frame.x + 10, pitch = bs + (this.touchMode ? 8 : 6);
        const zb = (cx: number, text: string, dir: number) => { const b = button(this, cx, zy, bs, bs, text, () => this.farm.zoomBy(dir), { style: STYLES.dark, size: this.touchMode ? 22 : 17, ink: false, sfx: false }); b.root.setDepth(6); return b; };
        zb(zx0 + bs / 2, '−', -1);
        zb(zx0 + pitch + bs / 2, '+', 1);
        this.zoomT = label(this, wb.frame.x + wb.frame.w - 14, zy, '100%', 12, PAL.cream, { origin: [1, 0.5], bold: false }).setDepth(6);
        this.facBtn = button(this, zx0 + 2 * pitch + bs / 2, zy, bs, bs, '', () => this.farm.fv.toggle(), { style: STYLES.dark, size: 14, ink: false, sfx: false });
        this.facBtn.root.add(icon(this, 'k_belt', 0, -1, 2));       // (centred: the kit puts a button's icon beside its label)
        this.facBtn.root.setDepth(6).setVisible(false);
        tipOn(this.facBtn.zone, () => ({ title: 'Factory view', sub: 'Key: L', color: PAL.cream, lines: [{ t: 'Dims the ground and shows each power grid in its own colour with how well it is doing, which way things flow and how much each machine makes a minute.', c: PAL.pebble }] }));
        this.facLabels = new FactoryLabels(this, this.farm);
        this.facState = ''; this.facTip = false; this.overKey = '';
        new DevUnlock(this, () => this.screenName);          // (the secret way into the Developer screen: ui/devunlock.ts)
        this.wire();
        // the world may already have arrived (solo answers on the first frame)
        if (this.farm.ready) this.plates.rebuild();
        // a farmer who has never used the character creator makes their look first (it also stands in for the welcome card)
        this.time.delayedCall(700, () => { if (this.farm.ready && !this.screen && this.farm.meS && !this.farm.meS.look) this.openScreen('look', { first: true }); });
        this.time.delayedCall(900, () => { if (this.farm.ready && !this.screen && shouldWelcome()) this.openScreen('welcome'); });

        this.input.keyboard!.on('keydown', (ev: KeyboardEvent) => this.onKey(ev));
        // a dead connection: any tap goes back to the title (phones have no Esc key)
        this.input.on('pointerdown', () => { if (this.farm.conn?.status === 'closed' && this.farm.ready && !this.leaving) { this.leaving = true; this.farm.leave(this.farm.conn.error); } });
        // a phone has no wheel: dragging a finger up or down over a list scrolls it, a row for every 44 units
        if (this.touchMode) {
            let drag: { y: number; x0: number; y0: number } | null = null;
            this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { const q = logical(p); drag = this.screen?.wheel && this.screenName !== 'skills' ? { y: q.y, x0: q.x, y0: q.y } : null; });
            this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
                if (!drag || !p.isDown || !this.screen?.wheel) return;
                const q = logical(p);
                while (drag.y - q.y > 44) { drag.y -= 44; this.screen.wheel(1, drag.x0, drag.y0); }
                while (q.y - drag.y > 44) { drag.y += 44; this.screen.wheel(-1, drag.x0, drag.y0); }
            });
            this.input.on('pointerup', () => { drag = null; });
        }
        this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
            if (this.screen) { this.screen.wheel?.(dy, logical(p).x, logical(p).y); return; }
            const ev = p.event as WheelEvent | undefined;
            if (this.photo && this.farm.photo3d && dy !== 0) { ev?.preventDefault(); this.wheelZoom += dy; if (Math.abs(this.wheelZoom) >= 40) { this.farm.zoomBy(this.wheelZoom < 0 ? 1 : -1); this.wheelZoom = 0; } return; }      // photo mode in 3D: the wheel zooms the photo camera
            if (this.farm.ready && !this.farm.menuOpen && !this.photo && dy !== 0 && (ev?.ctrlKey || ev?.altKey)) { ev.preventDefault(); this.wheelZoom += dy; if (Math.abs(this.wheelZoom) >= 40) { this.farm.zoomBy(this.wheelZoom < 0 ? 1 : -1); this.wheelZoom = 0; } return; }       // Ctrl + wheel (or a trackpad pinch) zooms
            if (this.farm.ready && !this.farm.menuOpen && !this.photo && dy !== 0) this.farm.hotCycle(dy);      // scroll through the hotbar
        });
        this.events.once('shutdown', () => { this.closeScreen(false); setTooltip(null); });
        this.touchCtl = this.touchMode ? new TouchControls(this, this.farm, () => !!this.screen) : null;
        // the Defense Lab (`?lab=defense`): its panel, made after the touch controls so its buttons are over the stick's corner
        const conn = this.farm.conn as Partial<LocalConnection>;
        this.labPanel = conn.lab && conn.debugSim ? new LabPanel(this, (c) => this.farm.send(c), () => labWorld.readout(conn.debugSim!), this.touchMode) : null;
    }

    /** What the world scene tells the HUD (`hud:*` events: see the `listen` below for how they are unhooked). */
    private wire () {
        this.listen('hud:factip', (d) => { if (d) { this.tip.show(d); this.facTip = true; } else if (this.facTip) { this.tip.hide(); this.facTip = false; } });
        this.listen('hud:float', (d) => this.addFloat(d));
        this.listen('hud:banner', (d) => this.showBanner(d));
        this.listen('hud:toast', (d) => {
            if (/^Night falls in \d+ seconds$/.test(d.text)) return;          // the banner and the clock's countdown already say so
            if (d.text.startsWith('✓ ') && this.tutorial.active) return;       // the coach card praises the step itself
            this.toasts.push(d.text, d.icon, d.color);
        });
        this.listen('hud:open', (d) => this.openUi(d.ui, d.id));
        this.listen('hud:catch', (d) => { if (d) this.fishHud.showCatch(d); });
        this.listen('hud:riftend', (d) => { if (d) this.openScreen('riftend', d); });
        this.listen('hud:loot', (d) => { if (!d) return; const back = this.screenName === 'inventory' ? 'inventory' : this.screenName === 'loot' ? this.lootBack : ''; this.lootBack = back; this.openScreen('loot', { ...d, back }); });
        this.listen('hud:spin', (d) => { if (d) this.screen?.onEvent?.(d); });
        this.listen('hud:gamble', (d) => { if (d) this.screen?.onEvent?.(d); });
        this.listen('hud:story', (d) => { if (d) this.queueScreen('story', { steps: storySteps(d.ch) }); });
        this.listen('hud:plotsChanged', () => this.plates.rebuild());
        this.listen('hud:hurt', () => this.layer.flash(PAL.berry, 0.4));
        this.listen('hud:social', (e) => this.chat.onEvent(e));
    }

    private listen<K extends keyof GameEvents> (name: K, fn: (d: GameEvents[K]) => void) {
        this.farm.events.on(name, fn, this);
        this.events.once('shutdown', () => this.farm.events.off(name, fn, this));
    }

    // ── screens ─────────────────────────────────────────────────────────────
    private ctx (): ScreenCtx {
        return {
            scene: this, farm: this.farm, tip: this.tip,
            me: () => this.farm.meS as PlayerS,
            send: (c: Cmd) => this.farm.send(c),
            toast: (t, i, c) => this.toasts.push(t, i, c),
            close: () => this.closeScreen(),
            open: (name, arg) => this.openScreen(name, arg),
            drawMap: (g, x, y, cell, labels, view) => this.layer.drawMinimap(g, x, y, cell, labels, true, true, view),
        };
    }

    openScreen (name: string, arg?: unknown) {
        const down = this.farm.ready && this.farm.meS!.downed > 0;
        if (!this.farm.ready || (down && name !== 'skills' && name !== 'inventory' && name !== 'dev')) return;
        this.closeScreen(false);
        const Cls = SCREENS[name];
        if (!Cls) return;
        this.farm.cancelTools();
        this.farm.menuOpen = true;
        this.farm.setPaused(pausesWorld(name));
        this.screenName = name;
        this.screen = new Cls(this.ctx(), name === 'map' ? { tab: 'map' } : arg);
        hideTip();
    }

    closeScreen (resume = true) {
        if (!this.screen) return;
        this.screen.destroy();
        this.screen = null;
        this.screenName = '';
        hideTip();
        if (resume) {
            this.farm.menuOpen = false;
            this.farm.setPaused(false);
            this.farm.releaseInput();
        }
    }

    private toggle (name: string) {
        if (this.screenName === name || (name === 'map' && this.screenName === 'menu')) this.closeScreen();
        else this.openScreen(name);
    }

    /** A screen that should not interrupt what you are doing: it waits until nothing else is open. */
    private queueScreen (name: string, arg: unknown) {
        if (!this.screen) this.openScreen(name, arg); else this.queued.push([name, arg]);
    }

    /** Rain still to come today (0) or tomorrow (1), for the first-time hint about it (worked out again only when the day or the hour changes). */
    private rainMemo = { k: '', v: null as 0 | 1 | null };
    private rainSoon (): 0 | 1 | null {
        const f = this.farm, c = f.clock, k = `${f.serverSeed()}|${c.day}|${Math.floor(c.clock / 10)}`;
        if (k === this.rainMemo.k) return this.rainMemo.v;
        const [today, next] = forecast(f.serverSeed(), c.day, 2);
        this.rainMemo = { k, v: today.rain && c.clock < today.rain.start + today.rain.len ? 0 : next.rain ? 1 : null };
        return this.rainMemo.v;
    }

    /** A sim `open` event: the window for a building, by its id (the market, a crafting station and the season wish are the odd ones). */
    private openUi (ui: UiKind, id: number) {
        const e = this.farm.ents[id];
        if (ui === 'market') this.openScreen('market');
        else if (ui === 'station') { if (e?.k === 'bld') this.openScreen('craft', { station: BUILDINGS[e.kind].station }); }
        else if (ui === 'wish') this.queueScreen('wish', undefined);
        else { const name = UI_SCREEN[ui]; if (name) this.openScreen(name, { id }); }
    }

    /** Photo mode hides every HUD element (names, bars, hints) so the world can be screenshotted. */
    private setPhoto (on: boolean) {
        if (on && this.screen) this.closeScreen();
        this.photo = on;
        this.farm.setPhoto(on);                    // (in 3D the camera comes loose: world/photocam.ts)
        this.scene.setVisible(!on, this.scene.key);
    }

    private onKey (ev: KeyboardEvent) {
        if (this.farm.conn?.status === 'closed') {
            if ((ev.key === 'Escape' || ev.key === 'Enter') && !this.leaving) { ev.preventDefault(); this.leaving = true; this.farm.leave(this.farm.conn.error); }
            return;
        }
        if (!this.farm.ready) return;
        if (this.chat.handleKey(ev)) return;
        const k = keyOf(ev);
        const lower = k.length === 1 ? k.toLowerCase() : k;
        if (this.farm.meS!.downed > 0 && lower === 'r' && !this.screen) { ev.preventDefault(); this.farm.send({ t: 'respawn' }); return; }       // don't want to wait for a friend: wake up at home
        if (!this.screen && (ev.key === '+' || ev.key === '=' || ev.key === 'Add' || ev.code === 'NumpadAdd')) { ev.preventDefault(); this.farm.zoomBy(1); return; }
        if (!this.screen && (ev.key === '-' || ev.key === '_' || ev.key === 'Subtract' || ev.code === 'NumpadSubtract')) { ev.preventDefault(); this.farm.zoomBy(-1); return; }
        if (k === 'F2') { ev.preventDefault(); this.setPhoto(!this.photo); return; }
        if (this.photo && (k === 'Escape' || k === 'Enter')) { ev.preventDefault(); this.setPhoto(false); return; }
        if (!this.screen && lower === FACTORY_VIEW_KEY.toLowerCase() && !ev.ctrlKey && !ev.metaKey && !ev.altKey) { ev.preventDefault(); this.farm.fv.toggle(); return; }
        const hot: Record<string, string> = { i: 'inventory', Tab: 'inventory', c: 'craft', k: 'skills', u: 'gear', p: 'creatures', j: 'journal', b: 'build', v: 'blueprints', m: 'map', h: 'guide' };
        if (this.screen) {
            if (k === '/' && this.screen.focusSearch) { ev.preventDefault(); this.screen.focusSearch(); return; }
            if (this.screen.onKey?.(k, ev)) return;
            if (k === 'Escape' || (hot[lower] && hot[lower] === this.screenName) || (lower === 'm' && this.screenName === 'menu')) {
                ev.preventDefault();
                this.closeScreen();
            } else if (hot[lower] && !STICKY.has(this.screenName)) {
                ev.preventDefault();
                this.openScreen(hot[lower]);
            }
            return;
        }
        if (k === 'Escape' && (this.farm.placing || this.farm.bp.active)) { this.farm.cancelTools(); return; }
        if (hot[lower] || k === 'Escape') { ev.preventDefault(); if (this.photo) this.setPhoto(false); this.openScreen(hot[lower] ?? 'menu'); return; }
        const n = Number(k);
        if (n >= 1 && n <= 8 && k.length === 1) this.farm.hotSelect(n - 1);
    }

    // ── per frame ───────────────────────────────────────────────────────────
    update (_time: number, deltaMs: number) {
        const dt = deltaMs / 1000;
        const f = this.farm;
        const conn = f.conn;
        if (!f.ready || conn.status === 'closed') {
            const failed = conn.status === 'closed';
            // refused or unreachable before we ever got in (wrong password, server down): straight back to the title with the reason
            if (failed && !f.ready) { if (!this.leaving) { this.leaving = true; f.leave(conn.error || 'Could not connect.'); } return; }
            this.statusT.setText(failed ? `${conn.error || 'Disconnected.'}\n\nTap or press Esc to go back.` : `Connecting to ${conn.label}…`).setColor(css(failed ? PAL.berry : PAL.cream));
            if (!f.ready) return;
        } else if (conn.status === 'connecting') {
            // a dropped line being picked up again (the world stands still until the welcome re-syncs it)
            this.statusT.setText(conn.error || 'Reconnecting…').setColor(css(PAL.cream));
        } else {
            this.statusT.setText(f.clock.paused && !this.screen ? 'Paused' : '');
        }
        const me = f.meS!;
        if (!this.screen && this.queued.length && me.downed <= 0) { const [n, a] = this.queued.shift()!; this.openScreen(n, a); }
        this.night.update(dt, f.viewMode === '2d');
        updateMusic({ night: f.nightAmount(), rain: this.night.rainLevel, boss: this.bossBar.cur ? 1 : me.rift?.ph === 1 ? 0.35 : this.night.event === 'bloodmoon' ? 0.3 : 0, phase: this.bossBar.cur?.phase ?? 0, under: f.undergroundAmount(), dread: f.dreadAmount() });
        this.arrange(dt, me);
        this.layer.update(dt);
        this.tip.follow(this.input.activePointer);
        if (settings.fps !== this.fpsT.visible) this.fpsT.setVisible(settings.fps);
        if (settings.fps && (this.fpsIn -= dt) <= 0) { this.fpsIn = 0.25; this.fpsT.setText(`${Math.round(this.game.loop.actualFps)} fps`); }
        this.promptT.setText(this.screen ? '' : f.prompt).setY(Math.round(this.botNow.prompt));
        this.drawBars(me);
        this.coHud.update(dt, me, !!this.screen || this.photo);
        const top = this.topNow;
        this.dusk.update(top.dusk, !me.rift);
        this.artsBar.update(me, !this.touchMode && !this.screen && !this.photo);
        this.bossBar.update(dt, top.boss);
        this.riftHud.update(dt, me, top.plaque);
        this.fishHud.update(dt, me, this.botNow.fishing);
        this.checkBoons(me);
        this.chat.update(dt, this.botNow);
        f.pingMarks = this.chat.activePings;
        // the left column: the farmer card, then the companion, the party and the quests, each only when there is something to show
        const cardBottom = this.layer.cardRect.y + this.layer.cardRect.h + LEFT.gap;
        this.compCard.update(cardBottom);
        this.party.update(this.compCard.bottom);
        const coach = slots.get('card');
        if (this.labPanel) this.labPanel.update(dt, this.party.bottom, !!this.screen || this.photo);         // (the Defense Lab: its panel has the quests' place)
        else this.tracker.update(this.party.bottom, !!coach && this.tutorial.active, this.touchMode ? 340 : 470);
        if ((this.hintScan -= dt) <= 0) { this.hintScan = 0.5; this.hintNear = { windup: f.windupNear(), titan: f.titanNear() }; }
        this.hints.update(dt, { me, prompt: f.prompt, ...this.hintNear, petNear: !!f.petBeside(), rain: this.rainSoon() }, !!this.screen || me.downed > 0 || this.photo);
        // The top slot (see ui/slots.ts): the coach card and the tip cards wait for a banner, a banner waits for the cards to fade
        // away, and all of them wait for a window. Toasts sit in their own lane and hide under windows.
        this.tutorial.update(dt, !!this.screen || me.downed > 0 || this.photo, this.banners.busy || this.fishHud.cardUp, this.bossBar.visible);
        const hold = !!this.screen || this.fishHud.cardUp;      // (the catch card has the top slot: a banner waits, or pauses, until it is gone)
        this.banners.update(dt, hold, this.tutorial.slotClear && !this.fishHud.cardUp && !this.downUp);       // (the down panel has the slot too)
        this.drawBanner(hold || this.downUp);
        this.publishSlots(me);
        const card = slots.get('card');
        this.toasts.update(dt, !!this.screen || me.downed > 0, toastLane(this.touchMode, card ? card.y + card.h : 0));       // (the 'down' panel has the middle of the screen: toasts wait until you are up)
        this.layer.slotBusy = !!card || !!this.banners.cur || this.fishHud.cardUp;
        this.touchCtl?.update();
        this.updateFriends();
        this.updateWorkers();
        this.updateFactory(me);
        this.zoomT.setText(`${Math.round(f.zoomLevel * 100)}%`);
        // floating texts
        for (let i = this.floats.length - 1; i >= 0; i--) {
            const fl = this.floats[i];
            fl.age += dt;
            const s = f.worldToScreen(fl.wx, fl.wy);
            fl.t.setPosition(Math.round(s.x), Math.round(s.y - fl.age * 26 - fl.lift)).setAlpha(fl.age < 0.7 ? 1 : Math.max(0, 1 - (fl.age - 0.7) / 0.4));
            if (fl.age > 1.1) { fl.t.destroy(); this.floats.splice(i, 1); }
        }
        this.plates.place(me, dt, !this.screen);
        this.screen?.update(dt);
    }

    /**
     * Work out where the stacks go this frame: the top one (dusk, boss, expedition) and the one above the hotbar (status row, chat,
     * prompt, fishing). What shows takes room, what does not takes none, and each thing glides to its place.
     */
    private arrange (dt: number, me: PlayerS) {
        this.chipsOn = !!me.rift && ((me.boons?.length ?? 0) > 0 || (me.rift?.omens?.length ?? 0) > 0);
        const top = topStack({ dusk: DuskPill.left(this.farm) > 0 && !me.rift, boss: this.bossBar.visible, rift: !!me.rift, chips: this.chipsOn });
        const t = this.topNow;
        for (const k of ['dusk', 'boss', 'plaque', 'chips'] as const) t[k] = glide(t[k], top[k], dt, 16);
        t.bottom = top.bottom;
        const bot = bottomStack(this.touchMode, { status: this.layer.statusRow, chatLines: this.chat.visibleLines, typing: this.chat.isOpen });
        const b = this.botNow;
        for (const k of ['status', 'chatBottom', 'prompt', 'demolish', 'fishing', 'input', 'emote'] as const) b[k] = glide(b[k], bot[k], dt, 16);
        this.layer.stack = b;
    }

    /** A boon offer arrived: take over the screen with the three cards (once per offer). */
    private checkBoons (me: PlayerS) {
        const r = me.rift;
        if (!r?.offer) { if (this.boonSeen && !r) this.boonSeen = ''; return; }
        const key = `${r.arena}:${r.tier}:${r.wave}`;
        if (this.boonSeen === key || this.screenName === 'boons' || me.downed > 0) return;
        this.boonSeen = key;
        this.openScreen('boons');
    }

    private drawBars (me: PlayerS) {
        const g = this.barG;
        g.clear();
        const d = this.farm.demolishFrac;
        if (d > 0 && !this.screen) {
            const y = Math.round(this.botNow.demolish);
            panel(g, W / 2 - 62, y, 124, 14, { ...STYLES.deep, rim: PAL.berry });
            rect(g, W / 2 - 56, y + 5, Math.round(112 * d), 4, PAL.berry);
        }
        const down = me.downed > 0;
        const others = Object.values(this.farm.players).some((p) => p.id !== this.farm.me && p.online && p.downed <= 0);
        const showDown = down && !this.screen;
        this.downT.setVisible(showDown);
        this.respawnBtn.root.setVisible(showDown);
        this.downSub.setVisible(showDown && others);
        this.downUp = showDown;
        slots.set('down', showDown ? { x: DOWN.x, y: DOWN.y, w: DOWN.w, h: others ? DOWN.hFriends : DOWN.h } : null);
        if (!down) { this.downKey = 0; return; }
        const helping = me.revive > 0;
        if (this.downKey !== (helping ? 2 : 1)) {
            this.downKey = helping ? 2 : 1;
            this.downT.setText(helping ? 'A friend is helping you up!' : 'You are down').setColor(css(helping ? PAL.lime : PAL.berry));
        }
        rect(g, 0, 0, W, H, PAL.berry, 0.1);
        if (!showDown) return;
        // one frame in the top slot: the title, the bar (bleeding out, or being helped up), the way out, and what a friend can do
        const x = DOWN.x, h = others ? DOWN.hFriends : DOWN.h;
        panel(g, x, DOWN.y, DOWN.w, h, { ...STYLES.dark, rim: helping ? PAL.lime : PAL.berry, shadow: true });
        const frac = helping ? me.revive / TUNING.reviveSeconds : Math.min(1, me.downed / TUNING.downedSeconds);
        bar(g, x + 20, DOWN.y + 36, DOWN.w - 40, 12, frac, helping ? PAL.lime : PAL.berry);
    }

    private updateFriends () {
        const f = this.farm;
        const seen = new Set<string>();
        const obst = slots.obstacles();
        for (const p of Object.values(f.players)) {
            if (p.id === f.me || !p.online) continue;
            const pos = f.playerScreenPos(p.id);
            if (!pos) continue;
            seen.add(p.id);
            let t = this.names.get(p.id);
            if (!t) { t = label(this, 0, 0, '', 13, PLAYER_COLORS[p.color], { origin: [0.5, 1], stroke: true }).setDepth(4); this.names.set(p.id, t); }
            const s = f.worldToScreen(pos.x, pos.y - 20);
            t.setText(p.downed > 0 ? `${p.name} — down!` : p.co ? `${p.name} — ${CO_INFO[p.co.k].name.toLowerCase()}!` : p.name);       // (the same words leave the text alone)
            // a name that would sit under the cards slides sideways until it is clear (and waits out of sight when there is no room)
            const spot = clearOfHud({ x: s.x - t.width / 2, y: s.y - t.height, w: t.width, h: t.height }, obst);
            t.setPosition(Math.round(spot ? spot.x + t.width / 2 : s.x), Math.round(spot ? spot.y + t.height : s.y)).setVisible(!this.screen && !!spot);
            if (p.downed > 0 && !this.screen) {
                const w = 60, frac = p.revive / TUNING.reviveSeconds;
                const g = this.barG;
                panel(g, s.x - w / 2 - 3, s.y + 2, w + 6, 12, { ...STYLES.deep, rim: PAL.lime });
                rect(g, s.x - w / 2, s.y + 5, Math.max(2, Math.round(w * frac)), 6, PAL.lime);
            } else if (p.co?.k === 'frozen' && !this.screen) {                                  // a frozen friend: the thaw so far (hold E beside them)
                const w = 60, frac = (p.co.th ?? 0) / TUNING.coop.thawSeconds;
                const g = this.barG;
                panel(g, s.x - w / 2 - 3, s.y + 2, w + 6, 12, { ...STYLES.deep, rim: PAL.foam });
                rect(g, s.x - w / 2, s.y + 5, Math.max(2, Math.round(w * frac)), 6, frac > 0 ? PAL.lime : PAL.foam);
            }
        }
        for (const [id, t] of this.names) if (!seen.has(id)) { t.destroy(); this.names.delete(id); }
    }

    /** A caption above each creature at work near you: its name and what it is doing right now. */
    /** The Factory view's captions and button, and whether the pointer is over a HUD control (so the world shows no hover tooltip under it). */
    private updateFactory (me: PlayerS) {
        const f = this.farm, fv = f.fv;
        this.facLabels.update();
        const show = fv.on || hasUnlock(me, 'logistics') || hasUnlock(me, 'power') || hasUnlock(me, 'drills') || fv.size > 0;
        const key = `${show}|${fv.on}|${!!this.screen}`;
        if (key !== this.facState) {
            this.facState = key;
            this.facBtn.root.setVisible(show && !this.screen);
            this.facBtn.setStyle(fv.on ? STYLES.lime : STYLES.dark);
        }
        const p = this.input.activePointer;
        const ok = `${Math.round(p.x)},${Math.round(p.y)},${p.isDown},${!!this.screen}`;
        if (ok !== this.overKey) {
            this.overKey = ok;
            f.overUi = !!this.screen || this.input.hitTestPointer(p).some((o) => !o.getData?.('stick'));
        }
    }

    private updateWorkers () {
        const f = this.farm, seen = new Set<number>();
        if (!this.screen) {
            const obst = slots.obstacles();
            for (const w of f.nearWorkers()) {
                const act = ACTIVITY[w.e.ac!];
                if (!act) continue;
                seen.add(w.id);
                let tag = this.workTags.get(w.id);
                if (!tag) { tag = { t: label(this, 0, 0, '', 11, PAL.cream, { origin: [0.5, 1], stroke: 3, bold: false }).setDepth(3), key: '' }; this.workTags.set(w.id, tag); }
                const t = tag.t;
                const mine = w.e.owner === f.me ? f.meS?.pets?.find((p) => p.id === w.e.pid) : undefined;
                const name = mine?.name ?? spOf(w.e.sp).name;
                const s = f.worldToScreen(w.x, w.y - 44);
                const key = `${name}|${w.e.ac}`;
                if (tag.key !== key) {           // (the words and the colour are set only when they change: setColor always draws the text again)
                    tag.key = key;
                    t.setText(`${name}: ${act.text.toLowerCase()}`).setColor(css(w.e.ac === 'stuck' ? PAL.berry : w.e.ac === 'idle' ? PAL.pebble : PAL.cream));
                }
                const spot = clearOfHud({ x: s.x - t.width / 2, y: s.y - t.height, w: t.width, h: t.height }, obst);
                t.setPosition(Math.round(spot ? spot.x + t.width / 2 : s.x), Math.round(spot ? spot.y + t.height : s.y)).setVisible(!!spot);
            }
        }
        for (const [id, tag] of this.workTags) if (!seen.has(id)) { tag.t.destroy(); this.workTags.delete(id); }
    }

    // ── floats & banners ────────────────────────────────────────────────────
    private addFloat (d: GameEvents['hud:float']) {
        const existing = d.key ? this.floats.find((fl) => fl.key === d.key && fl.age < 0.8) : undefined;
        if (existing) {
            existing.t.setText(d.text);
            existing.age = 0;
            existing.wx = d.x; existing.wy = d.y;
            return;
        }
        const t = label(this, 0, 0, d.text, 15, d.color ?? PAL.cream, { origin: [0.5, 0.5], stroke: true }).setDepth(9);       // (above the cards in the top slot, under windows)
        // one that starts where another just did (a pickup and "GOLDEN!" at the same node) is lifted over it, so both are read
        const s = this.farm.worldToScreen(d.x, d.y);
        let lift = 0;
        for (const fl of this.floats) {
            if (fl.age > 0.3) continue;
            const o = this.farm.worldToScreen(fl.wx, fl.wy);
            if (Math.abs(o.x - s.x) < 12 && Math.abs(o.y - s.y) < 12) lift = Math.max(lift, fl.lift + 16);
        }
        this.floats.push({ key: d.key, wx: d.x, wy: d.y, t, age: 0, lift });
    }

    /** A banner event: it queues, and shows when the top slot is free (see BannerQueue). One that arrives while you are down is dropped: the down panel has the slot, and it already says so. */
    private showBanner (d: GameEvents['hud:banner']) { if (this.farm.ready && this.farm.meS!.downed > 0) return; this.banners.push(d); }

    private drawBanner (blocked: boolean) {
        const cur = this.banners.cur;
        if (!cur || blocked) { this.bannerTitle.setAlpha(0); this.bannerSub.setAlpha(0); this.bannerKey = ''; slots.set('banner', null); return; }
        const key = `${cur.text}|${cur.sub ?? ''}`;
        if (key !== this.bannerKey) {
            this.bannerKey = key;
            this.bannerTitle.setText(cur.text).setColor(css(cur.color ?? PAL.cream));
            this.bannerSub.setText(forDevice(cur.sub ?? ''));
        }
        const a = this.banners.alpha, y = Math.max(150, this.topNow.bottom ? Math.round(this.topNow.bottom) + 30 : 0);       // (under the boss bar, or a rift's plaque and boon chips, when they are up)
        this.bannerTitle.setPosition(W / 2, y).setAlpha(a).setScale(0.6 + 0.4 * Phaser.Math.Easing.Back.Out(this.banners.pop));
        this.bannerSub.setPosition(W / 2, y + 22).setAlpha(Math.min(a, Math.max(0, (this.banners.t - 0.12) / 0.28)));
        // (published as an obstacle, so a land plate never sits on the words)
        const bw = Math.max(this.bannerTitle.width, cur.sub ? this.bannerSub.width : 0) + 24;
        slots.set('banner', { x: Math.round(W / 2 - bw / 2), y: y - 24, w: Math.round(bw), h: 48 + (cur.sub ? Math.round(this.bannerSub.height) : 0) });
    }

    /** Tell the layout what is where, so toasts, land plates, captions and arrows keep clear of it. */
    private publishSlots (me: PlayerS) {
        const top = this.topNow;
        slots.set('me', this.layer.cardRect);
        slots.set('comp', this.compCard.rect);
        slots.set('party', this.party.rect);
        slots.set('tracker', this.tracker.rect);
        slots.set('lab', this.labPanel?.rect ?? null);
        slots.set('dusk', this.dusk.rect);
        slots.set('arts', this.artsBar.rect);
        slots.set('boss', this.bossBar.visible ? { x: Math.round(W / 2 - BOSS.w / 2), y: Math.round(top.boss), w: BOSS.w, h: BOSS.h } : null);
        slots.set('rift', me.rift ? { x: Math.round(W / 2 - PLAQUE.w / 2), y: Math.round(top.plaque), w: PLAQUE.w, h: PLAQUE.h + (this.chipsOn ? CHIPS_H + 6 : 0) } : null);
        slots.set('top', top.bottom ? { x: Math.round(W / 2 - BOSS.w / 2), y: EDGE, w: BOSS.w, h: Math.round(top.bottom) - EDGE } : null);
        slots.set('catch', this.fishHud.cardRect);
        slots.set('toast', this.toasts.rect);
        // what sits above the hotbar this frame (the prompt, the chat, the dismantle bar, the fishing panel), as one rectangle
        slots.set('bottom', bottomRect(this.touchMode, this.botNow, { promptW: this.screen ? 0 : this.promptT.width, chatLines: this.chat.visibleLines, typing: this.chat.isOpen, demolish: this.farm.demolishFrac > 0, fishing: !!me.fishing }));
    }
}
