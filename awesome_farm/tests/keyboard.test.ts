// Keyboard layouts: movement follows key positions (so AZERTY's ZQSD works), hints name the keys you have,
// and the number row works without Shift on AZERTY.
import assert from 'node:assert/strict';
import { test } from 'node:test';

// the layout module listens on `window`; give it a bare one (no DOM in Node)
const win = new EventTarget();
(globalThis as unknown as { window: EventTarget }).window = win;
const fire = (type: 'keydown' | 'keyup', init: Record<string, unknown>) => win.dispatchEvent(Object.assign(new Event(type), init));
// (required, not imported: imports are hoisted above the window stub)
const L = require('../src/client/input/layout') as typeof import('../src/client/input/layout');
const { settings } = require('../src/client/settings') as typeof import('../src/client/settings');

test('movement reads key positions: ZQSD on AZERTY is the WASD block', () => {
    // on AZERTY the cap printed Z sits where W is on QWERTY, so the browser reports code KeyW with key "z"
    fire('keydown', { code: 'KeyW', key: 'z' });
    fire('keydown', { code: 'KeyA', key: 'q' });
    assert.ok(L.physDown('KeyW') && L.physDown('KeyA'));
    assert.ok(!L.physDown('KeyS'));
    fire('keyup', { code: 'KeyW', key: 'z' });
    assert.ok(!L.physDown('KeyW') && L.physDown('KeyA'));
    L.physReset();
    assert.ok(!L.physDown('KeyA'));
});

test('a press is consumed once; key repeat and modified presses do not count', () => {
    L.physReset();
    fire('keydown', { code: 'KeyQ', key: 'a' });
    assert.ok(L.physPressed('KeyQ'));
    assert.ok(!L.physPressed('KeyQ'), 'consumed');
    fire('keydown', { code: 'KeyQ', key: 'a', repeat: true });
    assert.ok(!L.physPressed('KeyQ'), 'auto-repeat is not a new press');
    L.physReset();
    fire('keydown', { code: 'KeyQ', key: 'q', ctrlKey: true });
    assert.ok(!L.physDown('KeyQ') && !L.physPressed('KeyQ'), 'Ctrl+Q is the browser\'s');
    win.dispatchEvent(new Event('keydown'));                    // a malformed event must not throw
});

test('losing focus lets go of every key', () => {
    fire('keydown', { code: 'KeyD', key: 'd' });
    win.dispatchEvent(new Event('blur'));
    assert.ok(!L.physDown('KeyD'));
});

test('old browsers without event.code still move', () => {
    L.physReset();
    fire('keydown', { code: '', key: 'w', keyCode: 87 });
    assert.ok(L.physDown('KeyW'));
    fire('keyup', { code: '', key: 'w', keyCode: 87 });
    assert.ok(!L.physDown('KeyW'));
});

test('hints name the keys you have', () => {
    settings.keyboard = 'qwerty';
    assert.equal(L.moveKeys(), 'WASD');
    assert.equal(L.keyLabel('KeyQ'), 'Q');
    settings.keyboard = 'azerty';
    assert.equal(L.moveKeys(), 'ZQSD');
    assert.equal(L.moveKeys(' '), 'Z Q S D');
    assert.equal(L.keyLabel('KeyQ'), 'A', 'AZERTY fishes with the cap printed A (the QWERTY Q position)');
    assert.equal(L.detectedName(), 'AZERTY');
    // Auto learns from real presses, whatever the layout (here: a Dvorak-ish "," in the W position)
    settings.keyboard = 'auto';
    fire('keydown', { code: 'KeyS', key: 'o' });
    L.physReset();
    assert.equal(L.keyLabel('KeyS'), 'O');
    settings.keyboard = 'auto';
});

test('the number row works by position, shifted or not', () => {
    const k = (code: string, key: string) => L.keyOf({ code, key } as KeyboardEvent);
    assert.equal(k('Digit3', '"'), '3', 'AZERTY unshifted');
    assert.equal(k('Digit3', '3'), '3');
    assert.equal(k('Numpad5', '5'), '5');
    assert.equal(k('Numpad1', 'End'), 'End', 'NumLock off is still End');
    assert.equal(k('KeyI', 'i'), 'i');
    assert.equal(k('Escape', 'Escape'), 'Escape');
});
