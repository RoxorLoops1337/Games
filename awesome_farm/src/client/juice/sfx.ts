// Procedural one-shot sound effects on Phaser's Web Audio context.
// No audio files: each sound is a short recipe of tones/noise with a pitch sweep.

import { settings } from '../settings';

type Wave = OscillatorType | 'noise';
interface Tone {
    w: Wave;
    f?: number;      // start frequency (Hz) — ignored for noise
    to?: number;     // end frequency (Hz) — exponential sweep
    at?: number;     // start offset (s)
    d: number;       // duration (s)
    v: number;       // peak gain (keep one-shots ≤ 0.3; master is 0.5)
    lp?: number;     // lowpass cutoff (Hz)
    hp?: number;     // highpass cutoff (Hz)
}

const arp = (w: Wave, notes: number[], step: number, d: number, v: number): Tone[] =>
    notes.map((f, i) => ({ w, f, at: i * step, d, v }));

const SFX = {
    swish:   [{ w: 'noise', d: 0.07, v: 0.05, hp: 2500 }],
    chop:    [{ w: 'noise', d: 0.06, v: 0.22, lp: 1800 }, { w: 'square', f: 190, to: 110, d: 0.07, v: 0.1 }],
    clink:   [{ w: 'triangle', f: 1250, to: 900, d: 0.08, v: 0.16 }, { w: 'noise', d: 0.03, v: 0.1, hp: 3000 }],
    timber:  [{ w: 'noise', d: 0.28, v: 0.22, lp: 900 }, { w: 'sawtooth', f: 260, to: 70, d: 0.25, v: 0.07, lp: 1200 }],
    crack:   [{ w: 'noise', d: 0.2, v: 0.26, lp: 2500 }, { w: 'square', f: 220, to: 60, d: 0.16, v: 0.08, lp: 1500 }],
    pluck:   [{ w: 'sine', f: 500, to: 900, d: 0.07, v: 0.16 }, { w: 'noise', d: 0.04, v: 0.08, hp: 2000 }],
    pop:     [{ w: 'sine', f: 620, to: 1100, d: 0.07, v: 0.14 }],
    build:   [{ w: 'noise', d: 0.08, v: 0.18, lp: 600 }, ...arp('square', [523, 659, 784, 1046], 0.06, 0.09, 0.07)],
    land:    [{ w: 'noise', d: 0.45, v: 0.18, lp: 1200 }, ...arp('triangle', [392, 523, 659, 784, 1046], 0.07, 0.16, 0.12)],
    levelup: arp('square', [523, 659, 784, 1046, 1318], 0.07, 0.12, 0.07),
    perk:    [{ w: 'triangle', f: 880, d: 0.14, v: 0.14 }, { w: 'triangle', f: 1320, at: 0.08, d: 0.22, v: 0.14 }],
    munch:   [{ w: 'square', f: 180, to: 120, d: 0.05, v: 0.09, lp: 900 }, { w: 'square', f: 160, to: 110, at: 0.09, d: 0.05, v: 0.09, lp: 900 }],
    plant:   [{ w: 'noise', d: 0.06, v: 0.14, lp: 700 }, { w: 'sine', f: 440, to: 660, at: 0.04, d: 0.08, v: 0.12 }],
    harvest: [{ w: 'sine', f: 700, to: 1200, d: 0.08, v: 0.14 }, { w: 'triangle', f: 1320, at: 0.07, d: 0.14, v: 0.12 }],
    coin:    [{ w: 'square', f: 988, d: 0.06, v: 0.08 }, { w: 'square', f: 1319, at: 0.06, d: 0.16, v: 0.08 }],
    smelt:   [{ w: 'noise', d: 0.3, v: 0.16, lp: 600 }, { w: 'sine', f: 140, to: 90, d: 0.25, v: 0.12 }],
    clang:   [{ w: 'triangle', f: 1400, d: 0.35, v: 0.16 }, { w: 'triangle', f: 1870, d: 0.25, v: 0.08 }, { w: 'noise', d: 0.04, v: 0.12, hp: 4000 }],
    hurt:    [{ w: 'square', f: 320, to: 110, d: 0.22, v: 0.13, lp: 2000 }],
    squish:  [{ w: 'noise', d: 0.08, v: 0.16, lp: 1200 }, { w: 'sine', f: 260, to: 180, d: 0.08, v: 0.1 }],
    poof:    [{ w: 'noise', d: 0.18, v: 0.16, lp: 2000 }, { w: 'sine', f: 500, to: 150, d: 0.18, v: 0.09 }],
    heal:    [{ w: 'sine', f: 660, to: 990, d: 0.15, v: 0.12 }, { w: 'triangle', f: 1320, at: 0.1, d: 0.15, v: 0.08 }],
    dusk:    [{ w: 'sine', f: 330, to: 220, d: 1.2, v: 0.08 }, { w: 'sine', f: 247, to: 165, at: 0.1, d: 1.2, v: 0.06 }],
    dawn:    arp('triangle', [523, 659, 784], 0.12, 0.3, 0.08),
    chest:   [...arp('square', [659, 784, 988, 1318], 0.05, 0.08, 0.07), { w: 'triangle', f: 2637, at: 0.22, d: 0.2, v: 0.06 }],
    deny:    [{ w: 'square', f: 140, d: 0.1, v: 0.08 }, { w: 'square', f: 110, at: 0.1, d: 0.12, v: 0.08 }],
    death:   arp('square', [440, 392, 330, 220], 0.15, 0.2, 0.09),
    win:     [...arp('square', [523, 659, 784], 0.1, 0.1, 0.08), { w: 'square', f: 1046, at: 0.3, d: 0.45, v: 0.09 }, { w: 'triangle', f: 784, at: 0.3, d: 0.45, v: 0.08 }],
    ui:      [{ w: 'square', f: 880, d: 0.03, v: 0.05 }],
    thud:    [{ w: 'noise', d: 0.09, v: 0.2, lp: 500 }, { w: 'sine', f: 130, to: 70, d: 0.09, v: 0.14 }],
    ting:    [{ w: 'triangle', f: 1800, to: 1400, d: 0.12, v: 0.12 }, { w: 'triangle', f: 2400, at: 0.02, d: 0.1, v: 0.07 }],
    crystal: [...arp('triangle', [1568, 1976, 2349, 2637], 0.04, 0.16, 0.09), { w: 'noise', d: 0.1, v: 0.1, hp: 4000 }],
    craft:   [{ w: 'noise', d: 0.05, v: 0.12, hp: 2000 }, { w: 'triangle', f: 1100, at: 0.03, d: 0.12, v: 0.12 }, { w: 'triangle', f: 1650, at: 0.1, d: 0.18, v: 0.1 }],
    equip:   [{ w: 'square', f: 300, to: 500, d: 0.06, v: 0.09 }, { w: 'triangle', f: 900, at: 0.05, d: 0.1, v: 0.1 }],
    skill:   [...arp('square', [659, 784, 988, 1175], 0.06, 0.12, 0.07), { w: 'triangle', f: 1568, at: 0.26, d: 0.3, v: 0.1 }],
    unlock:  [...arp('square', [523, 659, 784, 1046, 1318], 0.08, 0.14, 0.07), { w: 'triangle', f: 784, at: 0.4, d: 0.5, v: 0.1 }, { w: 'triangle', f: 1046, at: 0.4, d: 0.5, v: 0.08 }],
    shuffle: [{ w: 'noise', d: 0.08, v: 0.14, lp: 1500 }, { w: 'sine', f: 300, to: 400, d: 0.06, v: 0.08 }],
    gather:  arp('sine', [880, 1100, 1320], 0.05, 0.08, 0.1),
    shoot:   [{ w: 'noise', d: 0.09, v: 0.07, hp: 1800 }, { w: 'sine', f: 700, to: 400, d: 0.08, v: 0.05 }],
    slam:    [{ w: 'noise', d: 0.36, v: 0.26, lp: 420 }, { w: 'sine', f: 95, to: 38, d: 0.34, v: 0.22 }, { w: 'noise', d: 0.1, v: 0.12, hp: 2500 }],
    roar:    [{ w: 'sawtooth', f: 120, to: 55, d: 0.7, v: 0.1, lp: 650 }, { w: 'noise', d: 0.55, v: 0.07, lp: 500 }, { w: 'square', f: 82, to: 50, at: 0.05, d: 0.6, v: 0.06, lp: 400 }],
    bossDie: [{ w: 'noise', d: 0.9, v: 0.2, lp: 1600 }, ...arp('square', [392, 330, 262, 196, 131], 0.13, 0.28, 0.09), { w: 'triangle', f: 1046, at: 0.7, d: 0.6, v: 0.09 }, { w: 'triangle', f: 1318, at: 0.8, d: 0.6, v: 0.08 }],
    dash:    [{ w: 'noise', d: 0.12, v: 0.1, hp: 1500 }, { w: 'sine', f: 300, to: 700, d: 0.1, v: 0.06 }],
    crit:    [{ w: 'triangle', f: 1500, to: 2200, d: 0.1, v: 0.12 }, { w: 'noise', d: 0.05, v: 0.12, hp: 3000 }],
    summon:  [{ w: 'sine', f: 200, to: 640, d: 0.45, v: 0.1 }, { w: 'triangle', f: 300, to: 940, at: 0.05, d: 0.45, v: 0.07 }, { w: 'noise', d: 0.4, v: 0.05, hp: 3000 }],
    throw:   [{ w: 'noise', d: 0.1, v: 0.08, hp: 2200 }, { w: 'sine', f: 380, to: 900, d: 0.12, v: 0.08 }],
    catch:   [...arp('triangle', [784, 988, 1175, 1568], 0.08, 0.2, 0.1), { w: 'sine', f: 2093, at: 0.34, d: 0.4, v: 0.07 }],
    escape:  [{ w: 'triangle', f: 700, to: 300, d: 0.3, v: 0.1 }, { w: 'noise', d: 0.1, v: 0.06, lp: 1500 }],
    petlvl:  arp('triangle', [659, 880, 1175], 0.06, 0.14, 0.09),
    tick:    [{ w: 'sine', f: 740, to: 560, d: 0.05, v: 0.05 }],
    thunder: [{ w: 'noise', d: 1.4, v: 0.14, lp: 380 }, { w: 'sine', f: 70, to: 38, d: 1.2, v: 0.1 }, { w: 'noise', at: 0.35, d: 0.9, v: 0.08, lp: 260 }],
    riftgate: [{ w: 'sine', f: 140, to: 880, d: 0.55, v: 0.1 }, { w: 'triangle', f: 280, to: 1320, at: 0.04, d: 0.5, v: 0.07 }, { w: 'noise', d: 0.5, v: 0.05, hp: 2500 }],
    horn:    [{ w: 'sawtooth', f: 196, to: 147, d: 0.55, v: 0.08, lp: 900 }, { w: 'sawtooth', f: 294, to: 220, at: 0.04, d: 0.5, v: 0.05, lp: 900 }],
    fanfare: arp('triangle', [523, 659, 784, 1046], 0.07, 0.16, 0.09),
    boon:    [{ w: 'triangle', f: 1175, d: 0.35, v: 0.09 }, { w: 'triangle', f: 1568, at: 0.07, d: 0.4, v: 0.08 }, { w: 'sine', f: 2349, at: 0.14, d: 0.5, v: 0.06 }],
    riftwin: [...arp('square', [523, 659, 784, 1046, 1318], 0.09, 0.14, 0.07), { w: 'triangle', f: 1046, at: 0.5, d: 0.7, v: 0.1 }, { w: 'triangle', f: 1318, at: 0.5, d: 0.7, v: 0.08 }, { w: 'triangle', f: 1568, at: 0.5, d: 0.7, v: 0.07 }],
    riftfail: arp('triangle', [392, 330, 262, 196], 0.14, 0.24, 0.08),
    eggs:    [{ w: 'sine', f: 520, to: 700, d: 0.12, v: 0.09 }, { w: 'triangle', f: 780, at: 0.1, d: 0.2, v: 0.07 }],
    awaken:  [{ w: 'sine', f: 330, to: 660, d: 0.3, v: 0.07 }, ...arp('triangle', [659, 880, 1175, 1568, 2093], 0.07, 0.2, 0.08), { w: 'sine', f: 2637, at: 0.34, d: 0.5, v: 0.05 }],
    hatch:   [{ w: 'noise', d: 0.06, v: 0.14, hp: 2500 }, { w: 'noise', at: 0.14, d: 0.06, v: 0.14, hp: 2500 }, ...arp('triangle', [880, 1175, 1568, 1760], 0.07, 0.16, 0.1), { w: 'sine', f: 1318, at: 0.1, to: 1760, d: 0.18, v: 0.07 }],
    splash:  [{ w: 'noise', d: 0.16, v: 0.1, lp: 2200, hp: 400 }, { w: 'sine', f: 520, to: 180, d: 0.12, v: 0.06 }],
    plop:    [{ w: 'sine', f: 380, to: 780, d: 0.07, v: 0.12 }, { w: 'noise', d: 0.05, v: 0.07, lp: 1800 }, { w: 'sine', f: 780, to: 420, at: 0.07, d: 0.08, v: 0.08 }],
    reelin:  [{ w: 'noise', d: 0.2, v: 0.08, lp: 1500 }, ...arp('triangle', [659, 784, 988, 1318], 0.06, 0.14, 0.09), { w: 'sine', f: 1568, at: 0.26, d: 0.3, v: 0.06 }],
    dig:     [{ w: 'noise', d: 0.12, v: 0.14, lp: 900 }, { w: 'sine', f: 160, to: 70, d: 0.14, v: 0.12 }, { w: 'noise', at: 0.1, d: 0.08, v: 0.06, hp: 2400 }],
    crateopen: [{ w: 'noise', d: 0.09, v: 0.14, hp: 1800 }, { w: 'sine', f: 140, to: 80, d: 0.12, v: 0.12 }, ...arp('triangle', [523, 659, 784, 1046], 0.05, 0.14, 0.09), { w: 'sine', f: 1568, at: 0.22, d: 0.3, v: 0.06 }],
    lucky:   [{ w: 'triangle', f: 1318, d: 0.12, v: 0.1 }, { w: 'triangle', f: 1760, at: 0.07, d: 0.14, v: 0.1 }, { w: 'sine', f: 2637, at: 0.14, d: 0.3, v: 0.07 }],
    golden:  [...arp('triangle', [784, 988, 1318, 1568, 1976], 0.06, 0.2, 0.1), { w: 'noise', d: 0.5, v: 0.05, hp: 4000 }, { w: 'sine', f: 2637, at: 0.3, d: 0.5, v: 0.06 }],
    jackpot: [...arp('square', [523, 659, 784, 1046, 1318, 1568], 0.07, 0.15, 0.07), { w: 'triangle', f: 1046, at: 0.55, d: 0.9, v: 0.09 }, { w: 'triangle', f: 1318, at: 0.55, d: 0.9, v: 0.08 }, { w: 'triangle', f: 1568, at: 0.55, d: 0.9, v: 0.07 }, { w: 'triangle', f: 2093, at: 0.62, d: 0.9, v: 0.06 }, { w: 'noise', d: 0.6, v: 0.07, hp: 3000 }],
    spin:    [{ w: 'noise', d: 0.3, v: 0.06, hp: 1200 }, { w: 'sine', f: 300, to: 900, d: 0.3, v: 0.05 }],
    gamblewin: arp('triangle', [659, 880, 1175, 1568], 0.05, 0.14, 0.1),
    gamblelose: [{ w: 'triangle', f: 392, to: 196, d: 0.4, v: 0.1 }, { w: 'sawtooth', f: 130, to: 65, d: 0.4, v: 0.05, lp: 500 }],
    rare:    [{ w: 'sine', f: 1568, d: 0.5, v: 0.08 }, { w: 'sine', f: 2093, at: 0.1, d: 0.5, v: 0.07 }, { w: 'sine', f: 2637, at: 0.2, d: 0.6, v: 0.06 }],
    chime:   [...arp('triangle', [784, 1046, 1318], 0.07, 0.14, 0.1), { w: 'sine', f: 2093, at: 0.2, d: 0.3, v: 0.05 }],
    hearth:  [{ w: 'sine', f: 196, to: 220, d: 0.7, v: 0.1 }, { w: 'triangle', f: 294, at: 0.04, d: 0.7, v: 0.08 }, { w: 'triangle', f: 392, at: 0.1, d: 0.7, v: 0.07 }, { w: 'sine', f: 588, at: 0.22, d: 0.6, v: 0.05 }, { w: 'noise', d: 0.3, v: 0.04, lp: 700 }],
    pat:     [{ w: 'sine', f: 520, to: 780, d: 0.09, v: 0.1 }, { w: 'sine', f: 660, to: 990, at: 0.07, d: 0.11, v: 0.08 }],
    gift:    [{ w: 'noise', d: 0.1, v: 0.09, lp: 1100 }, { w: 'sine', f: 140, to: 80, d: 0.1, v: 0.08 }, { w: 'triangle', f: 1175, at: 0.12, d: 0.16, v: 0.09 }, { w: 'triangle', f: 1568, at: 0.2, d: 0.26, v: 0.08 }],
    feast:   [...arp('triangle', [392, 494, 587, 784], 0.09, 0.26, 0.09), { w: 'sine', f: 196, d: 0.6, v: 0.08 }, { w: 'sine', f: 294, at: 0.1, d: 0.55, v: 0.06 }, { w: 'sine', f: 1175, at: 0.34, d: 0.45, v: 0.045 }],
    gulp:    [{ w: 'sine', f: 300, to: 150, d: 0.1, v: 0.14 }, { w: 'sine', f: 260, to: 130, at: 0.12, d: 0.1, v: 0.12 }, { w: 'noise', d: 0.2, v: 0.06, lp: 700 }],
    perfect: [...arp('sine', [784, 1046, 1318, 1760], 0.05, 0.22, 0.11), { w: 'triangle', f: 2349, at: 0.16, d: 0.4, v: 0.06 }, { w: 'noise', d: 0.12, v: 0.04, hp: 5000 }],
    hollow:  [{ w: 'triangle', f: 230, to: 150, d: 0.24, v: 0.14, lp: 900 }, { w: 'sine', f: 340, to: 290, at: 0.01, d: 0.18, v: 0.07 }, { w: 'noise', d: 0.05, v: 0.08, lp: 700 }],
    titan:   [{ w: 'noise', d: 0.4, v: 0.2, lp: 700 }, { w: 'sine', f: 110, to: 45, d: 0.4, v: 0.2 }, ...arp('triangle', [392, 523, 659, 784, 1046], 0.07, 0.28, 0.09), { w: 'triangle', f: 1318, at: 0.35, d: 0.5, v: 0.07 }],
    // the export chute: one soft coin in a slot, once for a whole batch (a belt can feed it six things a second)
    chutecoin: [{ w: 'triangle', f: 1568, to: 1400, d: 0.05, v: 0.05 }, { w: 'sine', f: 2093, at: 0.045, d: 0.09, v: 0.04 }],
    // co-op boss statuses (quiet)
    freeze:  [{ w: 'noise', d: 0.16, v: 0.08, hp: 3500 }, ...arp('triangle', [2093, 1760, 1397, 1175], 0.04, 0.12, 0.06)],
    thaw:    [{ w: 'sine', f: 500, to: 900, d: 0.1, v: 0.09 }, { w: 'sine', f: 700, to: 1200, at: 0.09, d: 0.12, v: 0.08 }, { w: 'noise', d: 0.12, v: 0.04, lp: 1800 }],
    curse:   [{ w: 'sawtooth', f: 180, to: 90, d: 0.4, v: 0.06, lp: 700 }, { w: 'sine', f: 360, to: 140, d: 0.35, v: 0.06 }, { w: 'noise', d: 0.25, v: 0.03, hp: 2000 }],
    cursetick: [{ w: 'sine', f: 240, to: 150, d: 0.09, v: 0.06 }],
    hexjump: [{ w: 'noise', d: 0.18, v: 0.06, hp: 1200 }, { w: 'sine', f: 200, to: 800, d: 0.15, v: 0.06 }],
    chain:   [{ w: 'triangle', f: 900, to: 600, d: 0.1, v: 0.09 }, { w: 'triangle', f: 1400, at: 0.06, d: 0.12, v: 0.07 }, { w: 'noise', d: 0.05, v: 0.06, hp: 3500 }],
    tug:     [{ w: 'triangle', f: 520, to: 300, d: 0.14, v: 0.07 }, { w: 'square', f: 130, to: 90, d: 0.08, v: 0.03, lp: 800 }],
    // the Blight
    nesthit: [{ w: 'noise', d: 0.09, v: 0.16, lp: 900 }, { w: 'sine', f: 150, to: 95, d: 0.12, v: 0.12 }],
    nestdie: [{ w: 'noise', d: 0.5, v: 0.22, lp: 800 }, { w: 'sawtooth', f: 220, to: 50, d: 0.45, v: 0.07, lp: 900 }, ...arp('triangle', [392, 523, 659, 784], 0.08, 0.2, 0.08)],
    nestgrow: [{ w: 'sine', f: 90, to: 140, d: 0.45, v: 0.12 }, { w: 'noise', d: 0.3, v: 0.05, lp: 500 }],
    raid:    [{ w: 'sawtooth', f: 110, to: 140, d: 0.5, v: 0.06, lp: 600 }, { w: 'sawtooth', f: 165, to: 210, at: 0.2, d: 0.5, v: 0.05, lp: 700 }],
    bowtwang: [{ w: 'triangle', f: 420, to: 260, d: 0.08, v: 0.06 }, { w: 'noise', d: 0.05, v: 0.04, hp: 2500 }],
    ballista: [{ w: 'square', f: 140, to: 70, d: 0.14, v: 0.08, lp: 900 }, { w: 'noise', d: 0.1, v: 0.08, lp: 1400 }],
    zap:     [{ w: 'sawtooth', f: 900, to: 300, d: 0.12, v: 0.05, hp: 600 }, { w: 'noise', d: 0.1, v: 0.05, hp: 3000 }],
    spike:   [{ w: 'triangle', f: 700, to: 500, d: 0.05, v: 0.06 }, { w: 'noise', d: 0.04, v: 0.05, hp: 2500 }],
    unbind:  [{ w: 'sine', f: 880, to: 520, d: 0.18, v: 0.06 }, { w: 'noise', d: 0.1, v: 0.025, lp: 1500 }],
} satisfies Record<string, Tone[]>;

export type SfxId = keyof typeof SFX;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

/** Hook into Phaser's (auto-unlocking) Web Audio context. Call once from Boot. */
export function initSfx (game: Phaser.Game) {
    const mgr = game.sound as Phaser.Sound.WebAudioSoundManager;
    if (!('context' in mgr) || !mgr.context) return;
    ctx = mgr.context;
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}

/** Play a sound. `pitch` multiplies every frequency (combo ramps, variation). */
export function playSfx (id: SfxId, pitch = 1) {
    if (!ctx || !master || !settings.sound || ctx.state !== 'running') return;
    master.gain.value = 0.5 * settings.volume;
    const p = pitch * (0.96 + Math.random() * 0.08); // ±4% so repeats don't drone
    const now = ctx.currentTime;
    for (const t of SFX[id] as Tone[]) {
        const start = now + (t.at ?? 0);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(t.v, start + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + t.d);
        let src: AudioScheduledSourceNode;
        if (t.w === 'noise') {
            const n = ctx.createBufferSource();
            n.buffer = noise;
            src = n;
        } else {
            const o = ctx.createOscillator();
            o.type = t.w;
            o.frequency.setValueAtTime((t.f ?? 440) * p, start);
            if (t.to) o.frequency.exponentialRampToValueAtTime(t.to * p, start + t.d);
            src = o;
        }
        let node: AudioNode = src;
        for (const [type, freq] of [['lowpass', t.lp], ['highpass', t.hp]] as const) {
            if (!freq) continue;
            const f = ctx.createBiquadFilter();
            f.type = type;
            f.frequency.value = freq;
            node.connect(f);
            node = f;
        }
        node.connect(gain).connect(master);
        src.start(start);
        src.stop(start + t.d + 0.02);
    }
}
