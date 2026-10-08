import { AUTO, Game, Scale, Types } from 'phaser';
import { VIEW_H, VIEW_W } from '../shared/config';
import { PAL } from '../shared/palette';
import { SS } from './res';
import { BootScene } from './scenes/Boot';
import { GameScene } from './scenes/Game';
import { HudScene } from './scenes/Hud';
import { TitleScene } from './scenes/Title';

// https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config: Types.Core.GameConfig = {
    type: AUTO,
    width: VIEW_W * SS,
    height: VIEW_H * SS,
    parent: 'game-container',
    backgroundColor: PAL.deepSea,
    pixelArt: true,
    roundPixels: true,
    input: { activePointers: 3 },
    dom: { createContainer: true },   // text fields on the title screen
    scale: {
        mode: Scale.FIT,
        autoCenter: Scale.CENTER_BOTH,
        fullscreenTarget: 'app',     // the page shell, so the dark margins go full screen with the canvas
    },
    scene: [BootScene, TitleScene, GameScene, HudScene],
};

const StartGame = (parent: string) => {
    return new Game({ ...config, parent });
};

export default StartGame;
