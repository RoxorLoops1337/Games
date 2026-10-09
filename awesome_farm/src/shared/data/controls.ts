// The controls: every key and every phone button, in words. Plain data so the menu's Controls tab (client/ui/screens/menu.ts)
// and the player wiki (scripts/wiki.ts) read the same rows. The movement block and the fishing key follow the key POSITIONS
// (client/input/layout.ts): the letters printed on those caps depend on the keyboard, so they are passed in.

/** The physical keys the game reads by position, by KeyboardEvent.code. */
export type PhysKey = 'KeyW' | 'KeyA' | 'KeyS' | 'KeyD' | 'KeyQ';

/** What is printed on the caps at those positions, per keyboard layout. */
export const KEY_LAYOUTS: Record<'qwerty' | 'azerty', Record<PhysKey, string>> = {
    qwerty: { KeyW: 'W', KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyQ: 'Q' },
    azerty: { KeyW: 'Z', KeyA: 'Q', KeyS: 'S', KeyD: 'D', KeyQ: 'A' },
};

export type ControlRow = [key: string, what: string];
export interface ControlGroup { title: string; rows: ControlRow[] }

/** The keyboard: `move` names the movement keys (spaced, "W A S D" or "Z Q S D"), `fish` the fishing key. Short, so a row is one or two lines. */
export const keyControls = (move: string, fish: string): ControlGroup[] => [
    {
        title: 'Moving and acting', rows: [
            [`${move} / arrows`, 'Move'],
            ['Space / hold click', 'Harvest, fight, attack'],
            ['Shift', 'Dash (needs the Dash skill)'],
            ['E', 'Use a building, buy land; hold to revive a friend'],
            ['R', 'When you are down: wake up at home now'],
            ['F', 'Eat the best food'],
            ['T', 'Throw a taming pod at a wild creature'],
            [fish, 'Fishing: cast at water, pull on a bite (needs a rod)'],
            ['1 – 8 / wheel', 'Hotbar: equip gear, use food and potions, hold a seed or a pod'],
            ['Right-click', 'Stop placing'],
        ],
    },
    {
        title: 'Windows, friends and the view', rows: [
            ['I   C   K   P', 'Backpack (right-click an item to pin it), Crafting, Skills, Creatures'],
            ['J   B   V   L', 'Journal, Build menu (R rotates, hold X dismantles), Blueprints, Factory view'],
            ['H', 'How to play: step-by-step guides'],
            ['M / Esc', 'Map and menu'],
            ['G, then 1 – 8', 'Emotes'],
            ['Enter', 'Chat (online worlds)'],
            ['Middle-click / Alt+click', 'Ping the map for your friends'],
            ['F2', 'Photo mode: hide the HUD (F2 or Esc to return)'],
            ['+ / − / Ctrl + wheel', 'Zoom in and out (pinch on a phone)'],
        ],
    },
];

/** A phone: the buttons and gestures, not the keys. */
export const TOUCH_CONTROLS: ControlGroup[] = [
    {
        title: 'Walking and acting', rows: [
            ['Stick', 'Drag on the lower left of the screen to walk'],
            ['ACT', 'Hold to harvest, dig and fight'],
            ['USE', 'Use a building, buy land, help a friend up'],
            ['EAT', 'Eat the best food you carry'],
            ['DASH', 'Roll away (needs the Dash skill)'],
            ['FISH / POD', 'Cast and reel in / throw a taming pod'],
            ['REMOVE', 'Hold to take down the piece beside you'],
        ],
    },
    {
        title: 'Windows and gestures', rows: [
            ['Hotbar', 'Tap a slot: equip, use, or hold a seed or pod'],
            ['BAG', 'Backpack · hold an item to pin it to the hotbar'],
            ['BUILD', 'Build menu · tap to aim, tap again to place'],
            ['TURN / CANCEL', 'Rotate the piece · stop placing'],
            ['MENU', 'Crafting, Skills, Creatures, Journal, map, guide'],
            ['Hold an item', 'In lists: the right-click (move one, sell 10)'],
            ['x1 x10 All', 'Market and chests: how many a tap moves'],
            ['Two fingers', 'Pinch to zoom the world'],
        ],
    },
];
