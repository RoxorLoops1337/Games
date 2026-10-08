// THE JUICE RULE: every key action = a sound + a small particle burst + a little
// camera shake. Actions are listed in shared/actions.ts (the server emits them as
// events); FX is a Record over that list and FxSpec requires all three parts, so the
// compiler refuses an action that skips one. Call `fx.play('action', x, y)` — never
// playSfx/shake/explode by hand for game actions.

import type { Action } from '../../shared/actions';
import { PAL } from '../../shared/palette';
import { settings } from '../settings';
import { playSfx, SfxId } from './sfx';

interface Burst {
    tex: 'px' | 'dot' | 'spark' | 'leafbit' | 'star';
    colors: number[];
    count: number;
    speed: number;      // px/s at world scale
    life: number;       // ms
    gravity?: number;   // px/s² (positive = falls)
    up?: boolean;       // fountain upwards instead of a ring
}
interface FxSpec {
    sfx: SfxId;
    burst: Burst;
    shake: { px: number; ms: number }; // peak offset in SCREEN pixels — keep it little
}

const C = PAL;
const FX = {
    hitWood:     { sfx: 'chop',    burst: { tex: 'leafbit', colors: [C.leaf, C.lime, C.wood], count: 5, speed: 50, life: 380, gravity: 140 }, shake: { px: 1.5, ms: 60 } },
    hitEarth:    { sfx: 'thud',    burst: { tex: 'px', colors: [C.dirt, C.sand, C.cream], count: 5, speed: 45, life: 340, gravity: 150 }, shake: { px: 1.2, ms: 55 } },
    hitCrystal:  { sfx: 'ting',    burst: { tex: 'spark', colors: [C.foam, C.snow, C.sea], count: 4, speed: 60, life: 360, gravity: 40 }, shake: { px: 1.5, ms: 60 } },
    breakEarth:  { sfx: 'thud',    burst: { tex: 'px', colors: [C.dirt, C.sand, C.cream, C.bark], count: 12, speed: 65, life: 460, gravity: 170 }, shake: { px: 3, ms: 100 } },
    breakCrystal: { sfx: 'crystal', burst: { tex: 'spark', colors: [C.foam, C.snow, C.sea, C.plum], count: 18, speed: 90, life: 620, gravity: 60 }, shake: { px: 5, ms: 140 } },
    craft:       { sfx: 'craft',   burst: { tex: 'spark', colors: [C.gold, C.cream, C.pumpkin], count: 10, speed: 55, life: 450, gravity: 80 }, shake: { px: 2, ms: 80 } },
    look:        { sfx: 'equip',   burst: { tex: 'star', colors: [C.blossom, C.cream, C.gold], count: 14, speed: 55, life: 600, up: true, gravity: 40 }, shake: { px: 1, ms: 60 } },
    equip:       { sfx: 'equip',   burst: { tex: 'dot', colors: [C.cream, C.gold], count: 6, speed: 40, life: 350, gravity: 40 }, shake: { px: 1, ms: 50 } },
    skill:       { sfx: 'skill',   burst: { tex: 'star', colors: [C.gold, C.cream, C.blossom, C.lime], count: 14, speed: 60, life: 700, up: true, gravity: 40 }, shake: { px: 2.5, ms: 100 } },
    unlock:      { sfx: 'unlock',  burst: { tex: 'star', colors: [C.gold, C.cream, C.foam, C.blossom], count: 26, speed: 85, life: 900, up: true, gravity: 70 }, shake: { px: 4, ms: 160 } },
    load:        { sfx: 'shuffle', burst: { tex: 'px', colors: [C.stone, C.cream, C.pumpkin], count: 5, speed: 30, life: 300, gravity: 100 }, shake: { px: 0.8, ms: 45 } },
    collect:     { sfx: 'gather',  burst: { tex: 'dot', colors: [C.gold, C.cream, C.lime], count: 8, speed: 45, life: 450, up: true, gravity: 60 }, shake: { px: 1.2, ms: 60 } },
    drink:       { sfx: 'gulp',    burst: { tex: 'dot', colors: [C.blossom, C.foam, C.lime], count: 8, speed: 35, life: 500, gravity: 20 }, shake: { px: 1, ms: 60 } },
    hitStone:    { sfx: 'clink',   burst: { tex: 'px', colors: [C.stone, C.pebble], count: 5, speed: 55, life: 320, gravity: 160 }, shake: { px: 1.5, ms: 60 } },
    breakTree:   { sfx: 'timber',  burst: { tex: 'leafbit', colors: [C.leaf, C.lime, C.pine, C.wood], count: 14, speed: 70, life: 600, gravity: 120 }, shake: { px: 4, ms: 120 } },
    breakRock:   { sfx: 'crack',   burst: { tex: 'px', colors: [C.stone, C.pebble, C.slate], count: 14, speed: 75, life: 480, gravity: 180 }, shake: { px: 4, ms: 120 } },
    breakOre:    { sfx: 'crack',   burst: { tex: 'spark', colors: [C.gold, C.pumpkin, C.pebble], count: 14, speed: 80, life: 500, gravity: 140 }, shake: { px: 4, ms: 130 } },
    breakPlant:  { sfx: 'pluck',   burst: { tex: 'leafbit', colors: [C.leaf, C.lime, C.blossom], count: 8, speed: 45, life: 420, gravity: 90 }, shake: { px: 2, ms: 70 } },
    openChest:   { sfx: 'chest',   burst: { tex: 'star', colors: [C.gold, C.cream], count: 16, speed: 70, life: 700, up: true, gravity: 80 }, shake: { px: 4, ms: 120 } },
    pickup:      { sfx: 'pop',     burst: { tex: 'dot', colors: [C.gold, C.cream], count: 3, speed: 25, life: 250 }, shake: { px: 0.6, ms: 40 } },
    build:       { sfx: 'build',   burst: { tex: 'px', colors: [C.dirt, C.sand, C.cream], count: 16, speed: 60, life: 500, gravity: 120 }, shake: { px: 5, ms: 140 } },
    buyLand:     { sfx: 'land',    burst: { tex: 'dot', colors: [C.foam, C.sea, C.cream], count: 26, speed: 90, life: 700, up: true, gravity: 150 }, shake: { px: 6, ms: 220 } },
    levelUp:     { sfx: 'levelup', burst: { tex: 'star', colors: [C.gold, C.cream, C.lime], count: 20, speed: 70, life: 800, up: true, gravity: 60 }, shake: { px: 3, ms: 120 } },
    perk:        { sfx: 'perk',    burst: { tex: 'star', colors: [C.plum, C.blossom, C.gold], count: 16, speed: 65, life: 700, up: true, gravity: 60 }, shake: { px: 3, ms: 100 } },
    eat:         { sfx: 'munch',   burst: { tex: 'dot', colors: [C.berry, C.pumpkin, C.cream], count: 8, speed: 40, life: 400, gravity: 120 }, shake: { px: 1.5, ms: 70 } },
    plant:       { sfx: 'plant',   burst: { tex: 'px', colors: [C.dirt, C.leaf], count: 8, speed: 40, life: 380, gravity: 140 }, shake: { px: 1.5, ms: 70 } },
    harvestCrop: { sfx: 'harvest', burst: { tex: 'leafbit', colors: [C.pumpkin, C.gold, C.leaf], count: 12, speed: 60, life: 520, up: true, gravity: 140 }, shake: { px: 3, ms: 90 } },
    sell:        { sfx: 'coin',    burst: { tex: 'star', colors: [C.gold, C.cream], count: 12, speed: 60, life: 600, up: true, gravity: 100 }, shake: { px: 2.5, ms: 90 } },
    smelt:       { sfx: 'smelt',   burst: { tex: 'spark', colors: [C.pumpkin, C.gold, C.berry], count: 10, speed: 50, life: 500, up: true, gravity: -20 }, shake: { px: 2, ms: 90 } },
    upgrade:     { sfx: 'clang',   burst: { tex: 'spark', colors: [C.gold, C.cream, C.foam], count: 18, speed: 85, life: 550, gravity: 60 }, shake: { px: 5, ms: 160 } },
    hurt:        { sfx: 'hurt',    burst: { tex: 'dot', colors: [C.berry, C.cream], count: 12, speed: 70, life: 450 }, shake: { px: 7, ms: 200 } },
    heal:        { sfx: 'heal',    burst: { tex: 'dot', colors: [C.berry, C.blossom], count: 8, speed: 35, life: 600, up: true, gravity: -30 }, shake: { px: 1, ms: 60 } },
    enemyHit:    { sfx: 'squish',  burst: { tex: 'dot', colors: [C.plum, C.blossom], count: 6, speed: 55, life: 350, gravity: 120 }, shake: { px: 2, ms: 70 } },
    enemyDie:    { sfx: 'poof',    burst: { tex: 'dot', colors: [C.plum, C.blossom, C.cream], count: 16, speed: 80, life: 500, gravity: 60 }, shake: { px: 4, ms: 120 } },
    dusk:        { sfx: 'dusk',    burst: { tex: 'star', colors: [C.cream, C.foam], count: 10, speed: 30, life: 900, up: true, gravity: -10 }, shake: { px: 1.5, ms: 200 } },
    dawn:        { sfx: 'dawn',    burst: { tex: 'star', colors: [C.gold, C.cream], count: 12, speed: 35, life: 900, up: true, gravity: -10 }, shake: { px: 1.5, ms: 150 } },
    deny:        { sfx: 'deny',    burst: { tex: 'px', colors: [C.berry, C.ink], count: 5, speed: 30, life: 300 }, shake: { px: 2, ms: 80 } },
    win:         { sfx: 'win',     burst: { tex: 'star', colors: [C.gold, C.blossom, C.lime, C.foam], count: 40, speed: 110, life: 1200, up: true, gravity: 90 }, shake: { px: 6, ms: 300 } },
    downed:      { sfx: 'death',   burst: { tex: 'dot', colors: [C.cream, C.berry, C.ink], count: 20, speed: 70, life: 800, gravity: 60 }, shake: { px: 7, ms: 260 } },
    revive:      { sfx: 'heal',    burst: { tex: 'star', colors: [C.lime, C.cream, C.blossom], count: 18, speed: 60, life: 800, up: true, gravity: -20 }, shake: { px: 3, ms: 120 } },
    shoot:       { sfx: 'shoot',   burst: { tex: 'dot', colors: [C.cream, C.foam], count: 3, speed: 30, life: 220 }, shake: { px: 0.5, ms: 40 } },
    slam:        { sfx: 'slam',    burst: { tex: 'px', colors: [C.dirt, C.sand, C.stone, C.cream], count: 26, speed: 110, life: 620, gravity: 120 }, shake: { px: 9, ms: 300 } },
    roar:        { sfx: 'roar',    burst: { tex: 'star', colors: [C.plum, C.berry, C.cream], count: 24, speed: 80, life: 800, up: true, gravity: 50 }, shake: { px: 6, ms: 420 } },
    bossDie:     { sfx: 'bossDie', burst: { tex: 'star', colors: [C.gold, C.cream, C.blossom, C.lime, C.foam], count: 64, speed: 130, life: 1400, up: true, gravity: 90 }, shake: { px: 8, ms: 520 } },
    dash:        { sfx: 'dash',    burst: { tex: 'dot', colors: [C.cream, C.foam], count: 5, speed: 40, life: 260 }, shake: { px: 1, ms: 50 } },
    crit:        { sfx: 'crit',    burst: { tex: 'spark', colors: [C.gold, C.snow, C.pumpkin], count: 9, speed: 85, life: 380, gravity: 60 }, shake: { px: 2.5, ms: 90 } },
    summon:      { sfx: 'summon',  burst: { tex: 'star', colors: [C.plum, C.foam, C.cream], count: 30, speed: 90, life: 900, up: true, gravity: 40 }, shake: { px: 4, ms: 220 } },
    throwPod:    { sfx: 'throw',   burst: { tex: 'dot', colors: [C.cream, C.pumpkin], count: 4, speed: 30, life: 240 }, shake: { px: 0.8, ms: 50 } },
    catchOk:     { sfx: 'catch',   burst: { tex: 'star', colors: [C.blossom, C.gold, C.lime, C.foam], count: 38, speed: 90, life: 1000, up: true, gravity: 60 }, shake: { px: 4, ms: 200 } },
    catchFail:   { sfx: 'escape',  burst: { tex: 'dot', colors: [C.pebble, C.cream], count: 10, speed: 50, life: 400, gravity: 40 }, shake: { px: 2, ms: 90 } },
    petLevel:    { sfx: 'petlvl',  burst: { tex: 'star', colors: [C.gold, C.blossom, C.cream], count: 14, speed: 55, life: 800, up: true, gravity: 40 }, shake: { px: 1.5, ms: 80 } },
    post:        { sfx: 'equip',   burst: { tex: 'star', colors: [C.lime, C.gold, C.cream], count: 12, speed: 55, life: 650, up: true, gravity: 50 }, shake: { px: 1.5, ms: 80 } },
    petWork:     { sfx: 'tick',    burst: { tex: 'px', colors: [C.cream, C.gold, C.lime], count: 3, speed: 28, life: 260, gravity: 60 }, shake: { px: 0.4, ms: 40 } },
    riftEnter:   { sfx: 'riftgate', burst: { tex: 'star', colors: [C.plum, C.foam, C.cream, C.blossom], count: 28, speed: 80, life: 900, up: true, gravity: 30 }, shake: { px: 3, ms: 240 } },
    waveStart:   { sfx: 'horn',    burst: { tex: 'px', colors: [C.plum, C.berry, C.cream], count: 16, speed: 90, life: 600, gravity: 20 }, shake: { px: 4, ms: 220 } },
    waveClear:   { sfx: 'fanfare', burst: { tex: 'star', colors: [C.gold, C.lime, C.cream], count: 24, speed: 80, life: 900, up: true, gravity: 70 }, shake: { px: 2.5, ms: 160 } },
    boon:        { sfx: 'boon',    burst: { tex: 'star', colors: [C.gold, C.cream, C.blossom], count: 18, speed: 50, life: 900, up: true, gravity: -10 }, shake: { px: 1.5, ms: 90 } },
    riftWin:     { sfx: 'riftwin', burst: { tex: 'star', colors: [C.gold, C.cream, C.blossom, C.lime, C.foam, C.plum], count: 56, speed: 120, life: 1400, up: true, gravity: 80 }, shake: { px: 6, ms: 380 } },
    riftFail:    { sfx: 'riftfail', burst: { tex: 'dot', colors: [C.plum, C.berry, C.ink, C.cream], count: 18, speed: 60, life: 800, gravity: 50 }, shake: { px: 4, ms: 240 } },
    eggStart:    { sfx: 'eggs',    burst: { tex: 'star', colors: [C.blossom, C.cream, C.gold], count: 12, speed: 40, life: 800, up: true, gravity: -10 }, shake: { px: 1.2, ms: 80 } },
    awaken:      { sfx: 'awaken',  burst: { tex: 'star', colors: [C.gold, C.cream, C.foam, C.blossom], count: 34, speed: 100, life: 1100, up: true, gravity: 30 }, shake: { px: 3, ms: 180 } },
    hatch:       { sfx: 'hatch',   burst: { tex: 'star', colors: [C.cream, C.blossom, C.gold, C.lime, C.foam], count: 40, speed: 90, life: 1000, up: true, gravity: 60 }, shake: { px: 4, ms: 220 } },
    cast:        { sfx: 'splash',  burst: { tex: 'dot', colors: [C.foam, C.cream, C.sea], count: 8, speed: 42, life: 420, gravity: 120 }, shake: { px: 0.6, ms: 60 } },
    bite:        { sfx: 'plop',    burst: { tex: 'dot', colors: [C.foam, C.cream], count: 10, speed: 58, life: 460, up: true, gravity: 140 }, shake: { px: 1.6, ms: 90 } },
    fishCatch:   { sfx: 'reelin',  burst: { tex: 'star', colors: [C.foam, C.gold, C.cream, C.sea], count: 22, speed: 70, life: 900, up: true, gravity: 60 }, shake: { px: 3, ms: 140 } },
    fishLost:    { sfx: 'escape',  burst: { tex: 'dot', colors: [C.pebble, C.foam], count: 8, speed: 40, life: 380, gravity: 80 }, shake: { px: 1.4, ms: 80 } },
    dig:         { sfx: 'dig',     burst: { tex: 'px', colors: [C.dirt, C.sand, C.gold, C.cream], count: 14, speed: 70, life: 500, gravity: 170 }, shake: { px: 3, ms: 100 } },
    descend:     { sfx: 'thud', burst: { tex: 'px', colors: [C.dirt, C.sand, C.stone, C.cream], count: 22, speed: 70, life: 700, gravity: 90 }, shake: { px: 3, ms: 140 } },
    packDrop:    { sfx: 'death',   burst: { tex: 'dot', colors: [C.wood, C.cream, C.gold, C.berry], count: 24, speed: 80, life: 900, up: true, gravity: 120 }, shake: { px: 5, ms: 200 } },
    crateOpen:   { sfx: 'crateopen', burst: { tex: 'star', colors: [C.gold, C.cream, C.blossom, C.foam], count: 28, speed: 90, life: 900, up: true, gravity: 70 }, shake: { px: 4, ms: 150 } },
    lucky:       { sfx: 'lucky',   burst: { tex: 'star', colors: [C.gold, C.cream, C.lime], count: 16, speed: 75, life: 700, up: true, gravity: 70 }, shake: { px: 2, ms: 90 } },
    golden:      { sfx: 'golden',  burst: { tex: 'star', colors: [C.gold, C.cream, C.pumpkin, C.blossom], count: 34, speed: 100, life: 1000, up: true, gravity: 80 }, shake: { px: 5, ms: 200 } },
    jackpot:     { sfx: 'jackpot', burst: { tex: 'star', colors: [C.gold, C.cream, C.blossom, C.lime, C.foam, C.plum], count: 70, speed: 140, life: 1500, up: true, gravity: 90 }, shake: { px: 8, ms: 480 } },
    spin:        { sfx: 'spin',    burst: { tex: 'dot', colors: [C.gold, C.cream, C.blossom], count: 10, speed: 60, life: 500, up: true, gravity: 40 }, shake: { px: 1.5, ms: 100 } },
    gambleWin:   { sfx: 'gamblewin', burst: { tex: 'star', colors: [C.gold, C.lime, C.cream], count: 24, speed: 80, life: 800, up: true, gravity: 70 }, shake: { px: 3, ms: 140 } },
    gambleLose:  { sfx: 'gamblelose', burst: { tex: 'dot', colors: [C.berry, C.plum, C.ink], count: 14, speed: 60, life: 600, gravity: 60 }, shake: { px: 4, ms: 180 } },
    rare:        { sfx: 'rare',    burst: { tex: 'star', colors: [C.plum, C.foam, C.cream, C.blossom], count: 22, speed: 80, life: 900, up: true, gravity: 40 }, shake: { px: 2.5, ms: 120 } },
    mail:        { sfx: 'chime',   burst: { tex: 'dot', colors: [C.cream, C.gold, C.blossom], count: 10, speed: 45, life: 600, up: true, gravity: 40 }, shake: { px: 1, ms: 60 } },
    tutorial:    { sfx: 'chime',   burst: { tex: 'star', colors: [C.gold, C.cream, C.lime], count: 14, speed: 55, life: 700, up: true, gravity: 50 }, shake: { px: 1, ms: 60 } },
    join:        { sfx: 'chest',   burst: { tex: 'star', colors: [C.foam, C.cream, C.gold], count: 16, speed: 55, life: 800, up: true, gravity: 40 }, shake: { px: 2, ms: 100 } },
    // the Perfect dash (the farmer's own screen also slows for a beat: juice/slowmo.ts) and the Titan nodes (a hollow knock, and the fall)
    perfect:     { sfx: 'perfect', burst: { tex: 'star', colors: [C.snow, C.foam, C.cream, C.gold], count: 18, speed: 85, life: 650, gravity: 20 }, shake: { px: 2, ms: 90 } },
    hollow:      { sfx: 'hollow',  burst: { tex: 'dot', colors: [C.pebble, C.cream, C.stone], count: 4, speed: 30, life: 260, gravity: 40 }, shake: { px: 0.8, ms: 60 } },
    titan:       { sfx: 'titan',   burst: { tex: 'star', colors: [C.gold, C.cream, C.lime, C.blossom], count: 34, speed: 105, life: 1000, up: true, gravity: 80 }, shake: { px: 5, ms: 220 } },
    // the evening hearth and the companion's bond
    hearth:      { sfx: 'hearth',  burst: { tex: 'star', colors: [C.pumpkin, C.gold, C.cream, C.blossom], count: 26, speed: 70, life: 1000, up: true, gravity: -30 }, shake: { px: 1.5, ms: 160 } },
    pat:         { sfx: 'pat',     burst: { tex: 'dot', colors: [C.blossom, C.berry, C.cream], count: 7, speed: 34, life: 650, up: true, gravity: -40 }, shake: { px: 0.5, ms: 50 } },
    gift:        { sfx: 'gift',    burst: { tex: 'px', colors: [C.dirt, C.sand, C.gold, C.cream], count: 12, speed: 55, life: 520, gravity: 150 }, shake: { px: 1.2, ms: 80 } },
    chute:       { sfx: 'chutecoin', burst: { tex: 'dot', colors: [C.gold, C.cream], count: 4, speed: 22, life: 380, up: true, gravity: 40 }, shake: { px: 0.3, ms: 40 } },
    feast:       { sfx: 'feast',   burst: { tex: 'dot', colors: [C.gold, C.pumpkin, C.cream, C.blossom], count: 14, speed: 40, life: 800, up: true, gravity: 25 }, shake: { px: 1.2, ms: 80 } },
    // co-op boss statuses (sim/costatus.ts): quiet, and a friend's never shakes your camera (the sim names the affected farmer)
    freeze:      { sfx: 'freeze',  burst: { tex: 'spark', colors: [C.foam, C.snow, C.sea], count: 20, speed: 75, life: 600, gravity: 50 }, shake: { px: 3, ms: 120 } },
    thaw:        { sfx: 'thaw',    burst: { tex: 'dot', colors: [C.foam, C.sea, C.cream], count: 14, speed: 50, life: 600, gravity: 110 }, shake: { px: 1.5, ms: 80 } },
    hex:         { sfx: 'curse',   burst: { tex: 'star', colors: [C.plum, C.blossom, C.foam], count: 16, speed: 60, life: 800, up: true, gravity: 30 }, shake: { px: 3, ms: 140 } },
    hexTick:     { sfx: 'cursetick', burst: { tex: 'dot', colors: [C.plum, C.blossom], count: 4, speed: 25, life: 300, gravity: -10 }, shake: { px: 0.8, ms: 60 } },
    hexJump:     { sfx: 'hexjump', burst: { tex: 'spark', colors: [C.plum, C.blossom, C.cream], count: 12, speed: 70, life: 420, gravity: 20 }, shake: { px: 1.5, ms: 80 } },
    chain:       { sfx: 'chain',   burst: { tex: 'spark', colors: [C.gold, C.cream, C.stone], count: 14, speed: 60, life: 450, gravity: 80 }, shake: { px: 3, ms: 110 } },
    chainTug:    { sfx: 'tug',     burst: { tex: 'dot', colors: [C.gold, C.cream], count: 5, speed: 30, life: 280, gravity: 20 }, shake: { px: 1.2, ms: 70 } },
    unbind:      { sfx: 'unbind',  burst: { tex: 'star', colors: [C.foam, C.cream, C.plum], count: 8, speed: 40, life: 600, up: true, gravity: -10 }, shake: { px: 0.8, ms: 60 } },
} satisfies Record<Action, FxSpec>;


/** One per scene. `unit` scales particles for the scene's camera (world = 1, HUD = ZOOM). */
export class Fx {
    private emitters = new Map<Action, Phaser.GameObjects.Particles.ParticleEmitter>();

    constructor (private scene: Phaser.Scene, private unit = 1, private depth = 1e6) {}

    /** `quiet` skips the sound (an action far away from this player). */
    play (action: Action, x: number, y: number, opts: { pitch?: number; quiet?: boolean; noShake?: boolean } = {}) {
        const spec: FxSpec = FX[action];
        if (!opts.quiet) playSfx(spec.sfx, opts.pitch);
        this.emitter(action, spec.burst).explode(spec.burst.count, x, y);
        if (!opts.noShake) this.shake(spec.shake.px, spec.shake.ms);
    }

    /** Remove this scene's emitters (a window that made its own Fx calls this when it closes). */
    destroy () { for (const e of this.emitters.values()) e.destroy(); this.emitters.clear(); }

    private shake (px: number, ms: number) {
        if (!settings.shake) return;
        const cam = this.scene.cameras.main;
        cam.shake(ms, px / (cam.width * cam.zoom), true);
    }

    private emitter (action: Action, b: Burst) {
        let e = this.emitters.get(action);
        if (!e) {
            const u = this.unit;
            e = this.scene.add.particles(0, 0, b.tex, {
                emitting: false,
                speed: { min: b.speed * 0.35 * u, max: b.speed * u },
                angle: b.up ? { min: 220, max: 320 } : { min: 0, max: 360 },
                lifespan: { min: b.life * 0.6, max: b.life },
                scale: { start: u, end: 0.3 * u },
                alpha: { start: 1, end: 0 },
                gravityY: (b.gravity ?? 0) * u,
                tint: b.colors,
            });
            e.setDepth(this.depth);
            this.emitters.set(action, e);
        }
        return e;
    }
}
