import StartGame from './client/main';
import { initScreenMode } from './client/input/screenMode';

document.addEventListener('DOMContentLoaded', () => {

    const game = StartGame('game-container');
    initScreenMode(game);
    if (import.meta.env.DEV) import('./dev/harness').then((m) => m.installHarness(game));

});
