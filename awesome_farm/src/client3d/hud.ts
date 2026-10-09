// The 3D view's HUD: plain DOM over the canvas.
import { iconUrl } from './icons';

export const CSS = `
:root{--ink:#2a1d2c;--cream:#fff6e0;--paper:#f4e6c4;--wood:#a8703f;--bark:#6a402f;--gold:#ffd966;--berry:#e85d62;--lime:#d4f08a;--sea:#4ab2cf;--plum:#9d6fdb;--pebble:#d5d9e6}
#hud{position:fixed;inset:0;pointer-events:none;font:600 14px/1.25 'Fredoka','Nunito','Trebuchet MS',system-ui,sans-serif;color:var(--cream);user-select:none;-webkit-user-select:none;touch-action:none}
#hud *{box-sizing:border-box}
#hud .on{pointer-events:auto}
#hud.photo>*:not(.keep){opacity:0;pointer-events:none}
.frame{background:linear-gradient(#7a4a2e,#5a3320);border:2px solid var(--ink);border-radius:12px;box-shadow:0 2px 0 rgba(0,0,0,.35),inset 0 0 0 2px #b98450,inset 0 0 0 3px var(--ink);padding:8px 10px}
.paper{background:linear-gradient(#f9edd0,#ecd9ab);color:var(--ink);border:2px solid var(--ink);border-radius:10px;box-shadow:0 2px 0 rgba(0,0,0,.3),inset 0 0 0 2px #fff6e0}
.card{position:absolute;left:max(10px,env(safe-area-inset-left));top:max(10px,env(safe-area-inset-top));display:flex;gap:10px;align-items:center;min-width:230px}
.face{width:54px;height:54px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff6e0,#e8c88c 70%);border:2px solid var(--ink);display:flex;align-items:center;justify-content:center;font-size:26px;position:relative}
.face b{position:absolute;right:-6px;bottom:-6px;background:var(--plum);border:2px solid var(--ink);border-radius:10px;font-size:11px;padding:0 5px;color:#fff}
.bars{flex:1;display:flex;flex-direction:column;gap:4px}
.hearts{display:flex;gap:2px;flex-wrap:wrap;max-width:190px}
.heart{width:17px;height:15px;position:relative}
.heart:before,.heart:after{content:'';position:absolute;top:0;width:9px;height:14px;border-radius:9px 9px 0 0;background:var(--berry);box-shadow:inset -2px -2px 0 rgba(0,0,0,.18),0 0 0 1.5px var(--ink)}
.heart:before{left:1px;transform:rotate(-45deg);transform-origin:0 100%}.heart:after{left:8px;transform:rotate(45deg);transform-origin:100% 100%}
.heart.half:after,.heart.half:before{filter:grayscale(1) brightness(.5)}.heart.half:before{filter:none}
.heart.off:before,.heart.off:after{background:#4a3340;box-shadow:0 0 0 1.5px var(--ink)}
.bar{height:11px;border:2px solid var(--ink);border-radius:7px;background:#3a2530;overflow:hidden;position:relative}
.bar i{display:block;height:100%;transition:width .2s}
.bar.en i{background:linear-gradient(#ffe58f,#f1b93b)}.bar.xp i{background:linear-gradient(#c9a4f5,#8a5bd0)}
.world{position:absolute;right:max(10px,env(safe-area-inset-right));top:max(10px,env(safe-area-inset-top));width:178px;display:flex;flex-direction:column;gap:6px;align-items:stretch}
.time{display:flex;justify-content:space-between;align-items:center;gap:8px}.time .clock{font-size:20px;color:var(--gold);text-shadow:0 2px 0 var(--ink)}
.time small{display:block;color:#e8d3a8;font-weight:500;font-size:12px}
.coins{display:flex;align-items:center;gap:6px;justify-content:flex-end;font-size:17px}.coins img{width:22px;height:22px;image-rendering:pixelated}
#map{width:100%;aspect-ratio:1;border:2px solid var(--ink);border-radius:8px;background:#26588a;image-rendering:pixelated;display:block}
.zoom{display:flex;gap:4px;justify-content:space-between;align-items:center}
.btn{pointer-events:auto;cursor:pointer;border:2px solid var(--ink);border-radius:9px;background:linear-gradient(#ffe58f,#f1b93b);color:var(--ink);font:inherit;font-weight:700;padding:4px 10px;box-shadow:0 2px 0 var(--ink)}
.btn:active{transform:translateY(2px);box-shadow:none}.btn.dark{background:linear-gradient(#7a4a2e,#5a3320);color:var(--cream)}.btn.sm{padding:2px 9px;min-width:30px}
.btn.lime{background:linear-gradient(#e6f8a6,#a9d857)}.btn.berry{background:linear-gradient(#f58c90,#d44a50);color:#fff}.btn.sel{outline:3px solid var(--cream)}
.hotbar{position:absolute;left:50%;bottom:max(10px,env(safe-area-inset-bottom));transform:translateX(-50%);display:flex;gap:5px;padding:7px 8px}
.slot{position:relative;width:54px;height:54px;border:2px solid var(--ink);border-radius:9px;background:linear-gradient(#4a2c1c,#321c12);display:flex;align-items:center;justify-content:center;pointer-events:auto;cursor:pointer}
.slot img{width:36px;height:36px;image-rendering:pixelated}.slot.sel{outline:3px solid var(--gold);background:linear-gradient(#6d4a2a,#4a2f1a)}
.slot kbd{position:absolute;left:3px;top:1px;font-size:10px;color:#cdb589;font-family:inherit}.slot em{position:absolute;right:4px;bottom:1px;font-size:12px;font-style:normal;text-shadow:0 1px 0 var(--ink)}
.prompt{position:absolute;left:50%;bottom:calc(96px + env(safe-area-inset-bottom));transform:translateX(-50%);padding:5px 14px;white-space:nowrap;transition:opacity .15s}
.prompt kbd{display:inline-block;background:var(--gold);color:var(--ink);border:2px solid var(--ink);border-radius:6px;padding:0 6px;margin-right:6px;font-family:inherit;font-weight:700}
.toasts{position:absolute;right:max(10px,env(safe-area-inset-right));top:340px;display:flex;flex-direction:column;gap:5px;align-items:flex-end;width:240px}
.toast{padding:5px 11px;border-radius:9px;background:rgba(42,29,44,.88);border:2px solid var(--ink);display:flex;gap:8px;align-items:center;animation:pop .25s;transition:opacity .4s,transform .4s}
.toast.out{opacity:0;transform:translateX(30px)}.toast img{width:22px;height:22px;image-rendering:pixelated}
@keyframes pop{from{transform:scale(.7);opacity:0}}
.banner{position:absolute;left:50%;top:84px;transform:translateX(-50%);text-align:center;padding:10px 38px;background:linear-gradient(#e85d62,#b93a40);border:3px solid var(--ink);border-radius:6px;box-shadow:0 4px 0 rgba(0,0,0,.35);color:#fff;font-size:24px;text-shadow:0 2px 0 var(--ink);animation:ban 3.2s forwards;white-space:nowrap}
.banner small{display:block;font-size:13px;font-weight:500;opacity:.92}
@keyframes ban{0%{transform:translateX(-50%) translateY(-30px) scale(.8);opacity:0}8%{transform:translateX(-50%) scale(1.06);opacity:1}14%{transform:translateX(-50%) scale(1)}86%{opacity:1}100%{opacity:0;transform:translateX(-50%) translateY(-10px)}}
.float{position:absolute;left:0;top:0;font-size:18px;font-weight:700;text-shadow:0 2px 0 var(--ink),0 0 4px var(--ink);white-space:nowrap;will-change:transform}
.drawer{position:absolute;left:max(10px,env(safe-area-inset-left));bottom:max(10px,env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:6px;align-items:flex-start}
.panel{padding:10px;display:none;flex-direction:column;gap:8px;width:300px;max-height:60vh;overflow:auto;pointer-events:auto}
.panel.open{display:flex}.panel h4{margin:0;font-size:13px;color:var(--bark);text-transform:uppercase;letter-spacing:.06em}
.row{display:flex;gap:5px;flex-wrap:wrap}
.cards{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}
.bcard{border:2px solid var(--ink);border-radius:9px;background:#fff8e6;padding:5px 7px;cursor:pointer;text-align:left;font:inherit;color:var(--ink);display:flex;flex-direction:column;gap:2px}
.bcard.no{opacity:.45}.bcard b{font-size:13px}.bcard span{display:flex;gap:4px;flex-wrap:wrap;font-size:11px;align-items:center}.bcard img{width:14px;height:14px;image-rendering:pixelated}
.bcard span.miss{color:#b93a40}
.hint{font-size:12px;font-weight:500;color:var(--bark)}
.fps{position:absolute;left:50%;top:4px;transform:translateX(-50%);font-size:11px;opacity:.6}
.down{position:absolute;inset:0;background:radial-gradient(transparent 30%,rgba(180,30,40,.55));display:none;align-items:center;justify-content:center;font-size:34px;text-shadow:0 3px 0 var(--ink)}
.stick{position:absolute;left:max(24px,env(safe-area-inset-left));bottom:max(24px,env(safe-area-inset-bottom));width:150px;height:150px;border-radius:50%;background:rgba(255,246,224,.14);border:3px solid rgba(255,246,224,.45);pointer-events:auto;display:none}
.stick i{position:absolute;left:50%;top:50%;width:64px;height:64px;margin:-32px;border-radius:50%;background:rgba(255,246,224,.55);border:3px solid var(--ink)}
.pad{position:absolute;right:max(16px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));display:none;grid-template-columns:repeat(2,70px);gap:10px}
.pad button{pointer-events:auto;width:70px;height:70px;border-radius:50%;font-size:15px;border:3px solid var(--ink);background:linear-gradient(#ffe58f,#f1b93b);color:var(--ink);font-weight:800;font-family:inherit;box-shadow:0 3px 0 var(--ink)}
.pad button.use{background:linear-gradient(#e6f8a6,#a9d857)}.pad button.sm{width:56px;height:56px;font-size:12px;align-self:end;justify-self:end}
.touch .stick,.touch .pad{display:grid}.touch .stick{display:block}
.touch .drawer{left:50%;top:max(8px,env(safe-area-inset-top));bottom:auto;transform:translateX(-50%);flex-direction:column-reverse;align-items:center}
.touch .panel{max-height:56vh}
@media (max-height:460px){
.card{min-width:190px;padding:5px 8px;gap:8px}.face{width:42px;height:42px;font-size:20px}.hearts{max-width:150px}.heart{transform:scale(.85);margin-right:-1px}
.world{width:112px;gap:4px}.world .frame{padding:4px 8px}.time .clock{font-size:15px}.time small{font-size:10px}.time #q-sun{font-size:18px}.coins{font-size:13px}.coins img{width:16px;height:16px}.mapf{display:none}
.toasts{top:108px;width:170px}.toast{padding:3px 8px;font-size:12px}.banner{top:56px;font-size:18px;padding:6px 24px}
.stick{width:116px;height:116px;left:max(14px,env(safe-area-inset-left));bottom:max(12px,env(safe-area-inset-bottom))}.stick i{width:50px;height:50px;margin:-25px}
.pad{grid-template-columns:repeat(2,56px);gap:6px;right:max(12px,env(safe-area-inset-right));bottom:max(10px,env(safe-area-inset-bottom))}.pad button{width:56px;height:56px;font-size:13px}.pad button.sm{width:44px;height:44px;font-size:10px}
.hotbar{padding:4px 5px;gap:3px;bottom:max(6px,env(safe-area-inset-bottom))}.slot{width:40px;height:40px}.slot img{width:28px;height:28px}
.prompt{bottom:58px;padding:3px 10px;font-size:12px}
}
@media (max-width:760px){.world{width:130px}.toasts{top:240px;width:180px}.card{min-width:0}.hearts{max-width:130px}.slot{width:44px;height:44px}.slot img{width:30px;height:30px}.panel{width:min(300px,70vw)}.coins{font-size:14px}.time .clock{font-size:16px}}
`;
export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '', parent?: HTMLElement): HTMLElementTagNameMap[K] => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html) e.innerHTML = html;
    parent?.appendChild(e);
    return e;
};
/** A touch button: `down` on press, `up` (if any) on release. */
export const press = (e: HTMLElement, down: () => void, up?: () => void) => {
    e.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        e.setPointerCapture?.(ev.pointerId);
        down();
    });
    const end = (ev: PointerEvent) => {
        ev.stopPropagation();
        up?.();
    };
    e.addEventListener('pointerup', end);
    e.addEventListener('pointercancel', end);
};
/** What the HUD asks the game to do. */
export interface HudCallbacks {
    hot(i: number): void; act(down: boolean): void; use(): void; dash(): void; eat(): void; zoom(d: number): void;
    build(): void; pick(kind: string): void; cancelBuild(): void; stick(x: number, y: number): void;
    dismantle(down: boolean): void; turn(): void; lab(action: string): void;
}
/** One hotbar slot: the item, how many, its name. */
export interface HotSlot { id: string | null; n: number; name: string }
/** Everything the HUD shows, handed over ten times a second. */
export interface HudState {
    name: string; level: number; xp: number; xpNext: number; hearts: number; maxHearts: number; energy: number; maxEnergy: number;
    coins: number; day: number; season: string; clock: string; night: boolean; rain: number;
    hot: HotSlot[]; sel: number; prompt: string; zoom: number; fps: number; downed: boolean;
}
/** A card in the Build drawer: what, its group, whether it can be built now (or is locked), its cost and its description. */
export interface BuildCard { kind: string; name: string; cat: string; ok: boolean; locked: boolean; cost: [string, number][]; desc: string }
/** The 3D view's own HUD, plain DOM over the canvas: farmer card, clock, coins, minimap, hotbar, prompt, build drawer, lab, touch pad. */
export class Hud {
    cb: HudCallbacks;
    q: Record<string, HTMLElement> = {};
    slots: HTMLDivElement[] = [];
    key = '';
    cat = 'all';
    cards: BuildCard[] = [];
    touch = false;
    heartsKey = '';
    root = el('div');
    map: HTMLCanvasElement;
    toasts: HTMLDivElement;
    floats: HTMLDivElement;
    panel: HTMLDivElement;
    buildBox: HTMLDivElement;
    labBox: HTMLDivElement;
    constructor(host: HTMLElement, cb: HudCallbacks) {
        this.cb = cb;
        const st = el('style');
        st.textContent = CSS;
        document.head.appendChild(st);
        this.root.id = 'hud';
        host.appendChild(this.root);
        this.touch = matchMedia('(pointer:coarse)').matches && matchMedia('(hover:none)').matches && !/[?&]notouch/.test(location.search) || /[?&]touch/.test(location.search);
        if (this.touch) this.root.classList.add('touch');
        const r = this.root;
        const card = el('div', 'card frame on', `<div class="face">🌱<b id="q-lv">1</b></div><div class="bars"><div style="display:flex;justify-content:space-between"><span id="q-name"></span><span id="q-coinsm"></span></div><div class="hearts" id="q-hearts"></div><div class="bar en"><i id="q-en"></i></div><div class="bar xp"><i id="q-xp"></i></div></div>`, r);
        void card;
        const world = el('div', 'world', '', r);
        const tf = el('div', 'frame time on', `<div><div class="clock" id="q-clock">06:00</div><small id="q-day">Day 1</small></div><div id="q-sun" style="font-size:26px">☀️</div>`, world);
        void tf;
        el('div', 'frame coins', `<img id="q-coinimg"><span id="q-coins">0</span>`, world);
        const mapf = el('div', 'frame mapf', '', world);
        this.map = el('canvas', '', '', mapf);
        this.map.id = 'map';
        this.map.width = 96;
        this.map.height = 96;
        const z = el('div', 'zoom on', '', world);
        const mk = (t: string, f: () => void, cls = 'btn dark sm') => {
            const b = el('button', cls, t, z);
            b.onclick = f;
            return b;
        };
        mk('−', () => cb.zoom(-1));
        const zl = el('span', '', '100%', z);
        zl.id = 'q-zoom';
        mk('+', () => cb.zoom(1));
        mk('🏗', () => cb.build());
        mk('⚙', () => this.toggle(this.labBox));
        this.toasts = el('div', 'toasts', '', r);
        this.floats = el('div', 'keep', '', r);
        this.floats.style.cssText = 'position:absolute;inset:0;overflow:hidden';
        const hb = el('div', 'hotbar frame on', '', r);
        for (let i = 0; i < 8; i++) {
            const s = el('div', 'slot', `<kbd>${i + 1}</kbd><img><em></em>`, hb);
            s.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                cb.hot(i);
            });
            this.slots.push(s);
        }
        this.q.prompt = el('div', 'prompt frame', '', r);
        this.q.prompt.style.opacity = '0';
        this.q.down = el('div', 'down', 'You fell. A friend can pick you up…', r);
        const dr = el('div', 'drawer', '', r);
        this.panel = el('div', 'panel paper', '', dr);
        this.buildBox = el('div', '', '', this.panel);
        this.labBox = el('div', 'panel paper', '', dr);
        this.buildLab();
        const pill = el('div', 'row on', '', dr);
        const b1 = el('button', 'btn', '🏗 Build <small style="opacity:.6">B</small>', pill);
        b1.onclick = () => cb.build();
        const b2 = el('button', 'btn dark', '⚙ Lab', pill);
        b2.onclick = () => this.toggle(this.labBox);
        const b3 = el('button', 'btn dark', '📷', pill);
        b3.title = 'Photo mode (H)';
        b3.onclick = () => this.photo();
        const stick = el('div', 'stick', '<i></i>', r);
        this.stickPad(stick);
        const pad = el('div', 'pad', '', r);
        const act = el('button', '', 'ACT', pad);
        press(act, () => cb.act(true), () => cb.act(false));
        const use = el('button', 'use', 'USE', pad);
        press(use, () => cb.use());
        const dash = el('button', 'sm', 'DASH', pad);
        press(dash, () => cb.dash());
        const eat = el('button', 'sm', 'EAT', pad);
        press(eat, () => cb.eat());
        const rem = el('button', 'sm', 'TAKE', pad);
        press(rem, () => cb.dismantle(true), () => cb.dismantle(false));
        const turn = el('button', 'sm', 'TURN', pad);
        press(turn, () => cb.turn());
        this.q.fps = el('div', 'fps', '', r);
        for (const k of ['q-name', 'q-lv', 'q-hearts', 'q-en', 'q-xp', 'q-clock', 'q-day', 'q-sun', 'q-coins', 'q-zoom']) this.q[k] = document.getElementById(k)!;
        (document.getElementById('q-coinimg') as HTMLImageElement).src = iconUrl('coin', 3) || iconUrl('i_coin', 3);
        this.toggle(this.panel, false);
    }
    toggle(p: HTMLElement, on?: boolean) {
        const open = on ?? !p.classList.contains('open');
        for (const o of [this.panel, this.labBox]) o.classList.toggle('open', o === p && open);
    }
    get buildOpen() {
        return this.panel.classList.contains('open');
    }
    openBuild(on = true) {
        this.toggle(this.panel, on);
    }
    photo(on?: boolean) {
        this.root.classList.toggle('photo', on);
    }
    get photoMode() {
        return this.root.classList.contains('photo');
    }
    stickPad(pad: HTMLElement) {
        const knob = pad.firstElementChild as HTMLElement;
        let id = -1;
        const move = (e: PointerEvent) => {
            const r = pad.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
            let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2);
            const l = Math.hypot(dx, dy);
            if (l > 1) {
                dx /= l;
                dy /= l;
            }
            knob.style.transform = `translate(${dx * 42}px,${dy * 42}px)`;
            this.cb.stick(Math.abs(dx) < 0.12 ? 0 : dx, Math.abs(dy) < 0.12 ? 0 : dy);
        };
        pad.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            id = e.pointerId;
            pad.setPointerCapture(id);
            move(e);
        });
        pad.addEventListener('pointermove', (e) => {
            if (e.pointerId === id) move(e);
        });
        const end = (e: PointerEvent) => {
            if (e.pointerId !== id) return;
            id = -1;
            knob.style.transform = '';
            this.cb.stick(0, 0);
        };
        pad.addEventListener('pointerup', end);
        pad.addEventListener('pointercancel', end);
    }
    buildLab() {
        const b = this.labBox, add = (title: string, items: string[][]) => {
            el('h4', '', title, b);
            const row = el('div', 'row', '', b);
            for (const [label, action, cls] of items) {
                const x = el('button', 'btn sm ' + (cls ?? 'dark'), label, row);
                x.onclick = () => this.cb.lab(action);
            }
        };
        add('Time of day', [['🌅 Dawn', 'time:dawn'], ['☀ Noon', 'time:noon'], ['🌇 Dusk', 'time:dusk'], ['🌙 Night', 'time:midnight']]);
        add('The world', [['Raise land', 'land', 'lime'], ['Monsters', 'mobs', 'berry'], ['Clear monsters', 'killall'], ['Creatures', 'critters'], ['Loot drops', 'drops']]);
        add('Look', [['Shadows', 'shadows'], ['Bloom', 'bloom'], ['Sharper', 'res'], ['Clouds', 'rain'], ['FPS', 'fps']]);
        el('div', 'hint', 'WASD move · Space / click to hit or chop · E use · 1-8 hotbar · B build (R turns, X takes down) · H hides the HUD · wheel zooms', b);
    }
    setBuildList(cards: BuildCard[]) {
        this.cards = cards;
        this.renderBuild();
    }
    renderBuild() {
        const box = this.buildBox;
        box.innerHTML = '';
        el('h4', '', 'Build', box);
        const cats = ['all', ...new Set(this.cards.map((c) => c.cat))];
        const tabs = el('div', 'row', '', box);
        for (const c of cats) {
            const t = el('button', 'btn sm ' + (c === this.cat ? '' : 'dark'), c, tabs);
            t.onclick = () => {
                this.cat = c;
                this.renderBuild();
            };
        }
        const grid = el('div', 'cards', '', box);
        grid.style.marginTop = '8px';
        for (const c of this.cards) {
            if (this.cat !== 'all' && c.cat !== this.cat) continue;
            const card = el('button', 'bcard' + (c.ok ? '' : ' no'), '', grid);
            card.innerHTML = `<b>${c.name}</b><span>${c.cost.map(([r, n]) => `<img src="${iconUrl(r, 2)}"> ${n}`).join(' ')}</span>${c.locked ? '<span class="miss">locked</span>' : ''}`;
            card.title = c.desc;
            card.onclick = () => {
                if (c.ok) {
                    this.cb.pick(c.kind);
                    this.openBuild(false);
                }
            };
        }
    }
    set(s: HudState) {
        const key = JSON.stringify([s.hearts, s.maxHearts]);
        if (key !== this.heartsKey) {
            this.heartsKey = key;
            let h = '';
            for (let i = 0; i < Math.ceil(s.maxHearts); i++) h += `<div class="heart ${s.hearts >= i + 1 ? '' : s.hearts > i ? 'half' : 'off'}"></div>`;
            this.q['q-hearts'].innerHTML = h;
        }
        const k = JSON.stringify([s.name, s.level, s.coins, s.clock, s.day, s.energy, s.xp, s.zoom, s.night, s.rain]);
        if (k !== this.key) {
            this.key = k;
            this.q['q-name'].textContent = s.name;
            this.q['q-lv'].textContent = String(s.level);
            this.q['q-en'].style.width = `${Math.max(0, Math.min(100, s.energy / s.maxEnergy * 100))}%`;
            this.q['q-xp'].style.width = `${Math.max(0, Math.min(100, s.xp / s.xpNext * 100))}%`;
            this.q['q-coins'].textContent = s.coins.toLocaleString();
            this.q['q-clock'].textContent = s.clock;
            this.q['q-day'].textContent = `Day ${s.day} · ${s.season}`;
            this.q['q-sun'].textContent = s.rain > 0.3 ? '🌧' : s.night ? '🌙' : '☀️';
            this.q['q-zoom'].textContent = `${Math.round(s.zoom * 100)}%`;
        }
        s.hot.forEach((h, i) => {
            const sl = this.slots[i], img = sl.querySelector('img')!, em = sl.querySelector('em')!;
            const src = h.id ? iconUrl(h.id, 3) : '';
            if (img.getAttribute('src') !== src) {
                if (src) img.setAttribute('src', src);
                else img.removeAttribute('src');
            }
            img.style.visibility = src ? 'visible' : 'hidden';
            em.textContent = h.id && h.n > 1 ? String(h.n) : '';
            sl.classList.toggle('sel', i === s.sel);
            sl.title = h.name;
        });
        const p = this.q.prompt;
        if (s.prompt) {
            if (p.dataset.t !== s.prompt) {
                p.dataset.t = s.prompt;
                const m = /^(\S+)\s(.*)$/.exec(s.prompt);
                p.innerHTML = m ? `<kbd>${m[1]}</kbd>${m[2]}` : s.prompt;
            }
            p.style.opacity = '1';
        } else p.style.opacity = '0';
        this.q.down.style.display = s.downed ? 'flex' : 'none';
        this.q.fps.textContent = s.fps ? `${s.fps} fps` : '';
    }
    toast(text: string, icon = '', color = '#fff6e0') {
        const t = el('div', 'toast', `${icon ? `<img src="${icon}">` : ''}<span style="color:${color}">${text}</span>`, this.toasts);
        while (this.toasts.children.length > 4) this.toasts.firstElementChild!.remove();
        setTimeout(() => t.classList.add('out'), 2600);
        setTimeout(() => t.remove(), 3100);
    }
    banner(text: string, sub = '', color = '') {
        this.root.querySelectorAll('.banner').forEach((b3) => b3.remove());
        const b = el('div', 'banner keep', `${text}${sub ? `<small>${sub}</small>` : ''}`, this.root);
        if (color) b.style.background = color;
        setTimeout(() => b.remove(), 3300);
    }
}
