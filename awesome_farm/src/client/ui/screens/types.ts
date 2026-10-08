import type * as Phaser from 'phaser';
import type { Cmd, PlayerS, SimEvent } from '../../../shared/sim/types';
import type { GameScene } from '../../scenes/Game';
import type { Tooltip } from '../kit';

/** What every screen gets from the HUD scene. */
export interface ScreenCtx {
    scene: Phaser.Scene;
    farm: GameScene;
    me (): PlayerS;
    send (c: Cmd): void;
    toast (text: string, icon?: string, color?: number): void;
    /** Close this screen (and resume the world in solo). */
    close (): void;
    /** Open another screen, closing this one. */
    open (name: string, arg?: unknown): void;
    tip: Tooltip;
    /** Draw the world map into a graphics object (and optional labels container). */
    drawMap (g: Phaser.GameObjects.Graphics, x: number, y: number, cell: number, labels?: Phaser.GameObjects.Container, view?: { gx: number; gy: number; span: number }): void;
}

export interface Screen {
    /** Per-frame: cheap check; rebuild/refresh parts only when something changed. */
    update (dt: number): void;
    /** Esc / key handling; return true if consumed. */
    onKey? (key: string, ev?: KeyboardEvent): boolean;
    /** The / key: put the cursor in the screen's search box, if it has one. */
    focusSearch? (): void;
    /** The server answered something this screen asked for (a spin, a gamble). */
    onEvent? (e: SimEvent): void;
    /** Mouse wheel while this screen is open. */
    wheel? (dy: number, x: number, y: number): void;
    destroy (): void;
}
