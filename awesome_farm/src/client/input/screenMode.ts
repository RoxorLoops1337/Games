// Phones play in landscape, full screen, at the game's own 16:9 shape (960×540 logical). The browser only allows full screen
// from a tap, so the first tap on a phone goes full screen (and locks the screen to landscape where the browser lets us);
// held upright it shows a "turn your phone sideways" card and pauses. Where full screen is impossible (an iPhone, or a page inside
// someone else's frame) it quietly stops trying, and the card still works. Desktop is left alone: use the Full screen setting or F11.

import * as Phaser from 'phaser';
import { saveSettings, settings } from '../settings';

/** True on a phone or tablet (a touch screen without a desktop OS). */
const isTouchDevice = (game: Phaser.Game) => game.device.input.touch && !game.device.os.desktop;

/** Go full screen now (call from a tap), and keep the screen sideways. */
function enterFullscreen (game: Phaser.Game) {
    if (game.scale.isFullscreen) return;
    try { game.scale.startFullscreen({ navigationUI: 'hide' }); } catch { /* unsupported */ }
}

function exitFullscreen (game: Phaser.Game) {
    if (game.scale.isFullscreen) game.scale.stopFullscreen();
}

/** The Full screen setting: turn it on or off, and apply it now (from a click). */
export function setFullscreenSetting (game: Phaser.Game, on: boolean) {
    settings.fullscreen = on;
    saveSettings();
    if (on) enterFullscreen(game); else exitFullscreen(game);
}

function lockLandscape () {
    const o = (typeof screen !== 'undefined' ? screen.orientation : undefined) as (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined;
    o?.lock?.('landscape')?.catch(() => { /* only allowed in full screen, and not everywhere */ });
}

/** The card shown while a phone is held upright. */
function makeRotateCard () {
    const el = document.createElement('div');
    el.id = 'rotate-card';
    el.setAttribute('style', 'position:fixed;inset:0;z-index:9999;display:none;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:#2a1d2c;color:#fff6e0;font-family:"Fredoka","Trebuchet MS",sans-serif;text-align:center;padding:24px;');
    el.innerHTML = '<style>@keyframes rotphone{0%,15%{transform:rotate(0)}55%,100%{transform:rotate(-90deg)}}</style>'
        + '<svg width="96" height="96" viewBox="0 0 24 24" style="animation:rotphone 2.2s ease-in-out infinite"><rect x="7" y="2" width="10" height="20" rx="2.2" fill="none" stroke="#ffd966" stroke-width="1.6"/><rect x="10.5" y="19" width="3" height="1" rx=".5" fill="#ffd966"/></svg>'
        + '<div style="font-size:26px;font-weight:600">Turn your phone sideways</div>'
        + '<div style="font-size:15px;opacity:.75;max-width:280px">Awesome Farm plays in landscape, full screen.</div>';
    document.body.appendChild(el);
    return el;
}

export function initScreenMode (game: Phaser.Game) {
    if (!isTouchDevice(game)) return;
    let failures = 0, unsupported = false;
    game.scale.on(Phaser.Scale.Events.FULLSCREEN_UNSUPPORTED, () => { unsupported = true; });
    game.scale.on(Phaser.Scale.Events.FULLSCREEN_FAILED, () => { failures++; });
    game.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, lockLandscape);

    // the first tap (and every later one, if the player left full screen by accident) goes full screen
    const tap = () => {
        if (!settings.fullscreen || unsupported || failures >= 2 || game.scale.isFullscreen) return;
        enterFullscreen(game);
        lockLandscape();
    };
    document.addEventListener('click', tap, { passive: true });
    document.addEventListener('touchend', tap, { passive: true });

    // upright: ask for a turn, and rest the game until it happens
    const card = makeRotateCard();
    let asleep = false;
    const check = () => {
        const upright = window.innerHeight > window.innerWidth;
        card.style.display = upright ? 'flex' : 'none';
        if (upright && !asleep) { asleep = true; game.loop.sleep(); }
        else if (!upright && asleep) { asleep = false; game.loop.wake(true); }
    };
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    check();
}
