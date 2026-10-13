import StartGame from './client/main';
import { initScreenMode } from './client/input/screenMode';
import { keepAwake } from './client/input/wakelock';

document.addEventListener('DOMContentLoaded', () => {

    const game = StartGame('game-container');
    initScreenMode(game);
    keepAwake();
    if (import.meta.env.DEV) import('./dev/harness').then((m) => m.installHarness(game));

});
