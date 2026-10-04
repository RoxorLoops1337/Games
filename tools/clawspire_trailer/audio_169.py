#!/usr/bin/env python3
"""Clawspire 2.0 trailer soundtrack, the 16:9 cut (frozen with cues_169.json): 25.0 s, 144 BPM, F minor.

Punchy arcade electro: four-on-the-floor kick, side-chained supersaw chords and
pads, a sub bass, the game's square-wave lead, risers into every section, an
impact on every cut, and the game's own moments (coin, claw clank, lightning,
coin shower, capsule pop, the crowd at LAMP FEVER, the capsule crack and the
legendary chord, bats, bubbles) placed from cues.json, the same file the
picture reads. Deterministic: run it twice, get the same WAV.

    python3 tools/clawspire_trailer/audio.py [out.wav]
"""
import json, os, sys
import numpy as np
from synth import *

HERE = os.path.dirname(os.path.abspath(__file__))
CUES = json.load(open(os.path.join(HERE, 'cues_169.json')))
BPM = CUES['bpm']
B = 60.0 / BPM                       # 0.416667
DUR = CUES['dur'] + 1.5              # render a tail, trimmed at the end
N = int(DUR * SR)
HIT = {}
for h in CUES['hits']:
    HIT.setdefault(h['k'], []).append(h['b'] * B)


def b(n):
    return n * B


BUS = {k: [np.zeros(N), np.zeros(N)] for k in ('drums', 'music', 'sfx', 'hit', 'end')}


def at(sig, t0, gain=1.0, pan=0.0, bus='sfx'):
    i0 = int(round(t0 * SR))
    if i0 >= N:
        return
    l, r = sig if isinstance(sig, tuple) else (sig, sig)
    if i0 < 0:
        l, r = l[-i0:], r[-i0:]; i0 = 0
    n = min(len(l), N - i0)
    gl = gain * np.sqrt((1 - pan) / 2) * 1.414
    gr = gain * np.sqrt((1 + pan) / 2) * 1.414
    BUS[bus][0][i0:i0 + n] += l[:n] * gl
    BUS[bus][1][i0:i0 + n] += r[:n] * gr


# ------------------------------------------------------------------ harmony
CH = {  # chord tones (pad voicing), bass root (octave 2)
    'Fm': ([53, 56, 60, 65], 41), 'Db': ([49, 53, 56, 61], 37), 'Ab': ([51, 56, 60, 63], 44), 'Eb': ([51, 55, 58, 63], 39),
    'Gb': ([54, 58, 61, 66], 42), 'C': ([52, 55, 58, 61], 36),
}
# (beat, chord) changes
PROG = [(0, 'Fm'), (4, 'Fm'), (8, 'Db'), (12, 'Ab'), (16, 'Eb'), (20, 'Fm'), (24, 'Db'), (28, 'Ab'), (32, 'Eb'),
        (36, 'Fm'), (38, 'Ab'), (40, 'Db'), (42, 'Eb'), (44, 'Fm'), (46, 'Gb'), (48, 'Fm'), (50, 'C'), (52, 'Db'), (54, 'Eb'), (56, 'Fm')]


def chord_at(beat):
    c = PROG[0][1]
    for bb, name in PROG:
        if beat >= bb - 1e-6:
            c = name
    return c


LEAD = [  # (beat offset in the 4-bar phrase, midi, beats)
    (0, 77, .5), (.5, 80, .5), (1, 84, .75), (1.75, 82, .25), (2, 80, .5), (2.5, 77, .5), (3, 75, .5), (3.5, 77, .5),
    (4, 77, .5), (4.5, 80, .5), (5, 85, .75), (5.75, 84, .25), (6, 80, .5), (6.5, 84, .5), (7, 82, 1),
    (8, 84, .5), (8.5, 80, .5), (9, 75, .5), (9.5, 77, .5), (10, 80, .75), (10.75, 82, .25), (11, 84, .5), (11.5, 87, .5),
    (12, 87, .75), (12.75, 84, .25), (13, 82, .5), (13.5, 79, .5), (14, 82, .5), (14.5, 84, .5), (15, 82, .5), (15.5, 79, .5),
]

# ------------------------------------------------------------------ the groove
# which beats have the full kit (drops) and which are thinned (breakdowns)
DROPS = [(4, 13.8), (15.4, 36), (40, 55)]
HALF = [(38, 40)]                     # half-time after LEGENDARY
kick_times = []


def in_any(x, spans):
    return any(a - 1e-6 <= x < c - 1e-6 for a, c in spans)


for beat in range(0, 56):
    tb = b(beat)
    full = in_any(beat, DROPS)
    half = in_any(beat, HALF)
    spooky = 44 <= beat < 52
    if full or (half and beat % 2 == 0):
        at(kick(1.0, .42, 160, 46), tb, 1.0, 0, 'drums'); kick_times.append(tb)
    if full and beat % 2 == 1:
        at(clap(1.0), tb, .55, .12, 'drums'); at(snare(.7), tb, .4, -.1, 'drums')
    if full:
        at(hat(.7, open_=True), tb + b(.5), .22, .3, 'drums')                    # offbeat open hat
        for s16 in (1, 3) if not spooky else (2,):
            at(hat(.5), tb + b(.25 * s16), .16, -.35, 'drums')
    if half:
        at(clap(1.0), tb + b(1) if beat % 2 == 0 else tb, .5 if beat % 2 else 0, 0, 'drums')

# the intro: a ticking hat and a heartbeat kick under the claw
for k in range(8):
    at(hat(.5), b(1) + b(.25) * k, .1 + .02 * k, .4, 'drums')
# snare roll into the drop (b2.5 -> b4), 16ths then 32nds
for k in range(12):
    tt = b(2.5) + (b(.25) * k if k < 6 else b(1.5) + b(.125) * (k - 6))
    if tt < b(3.95):
        at(snare(.5 + k * .04), tt, .18 + k * .025, (-.3, .3)[k % 2], 'drums')
# breakdown heartbeat (b36 -> b38)
for k, tt in enumerate((b(36), b(36.75), b(37), b(37.75))):
    at(kick(.9, .5, 90, 38), tt, .7, 0, 'drums')

# ------------------------------------------------------------------ bass + chords + lead
for beat8 in range(8, 112):                      # 8th notes from b4 to b56
    bt = beat8 / 2
    tb = b(bt)
    if not in_any(bt, DROPS + HALF) and not (36 <= bt < 38):
        continue
    name = chord_at(bt)
    tones, root = CH[name]
    if bt >= 36 and bt < 38:                     # breakdown: just a low pulse
        if beat8 % 2 == 0:
            at(sub_bass(hz(root - 12), b(.9), 1.0), tb, .5, 0, 'music')
        continue
    # off-beat pumping bass (the classic): root on the "and"s, sub on the downbeats
    if beat8 % 2 == 1:
        s = lp(supersaw(hz(root), b(.45), 3, .008), 1100) * adsr(int(b(.45) * SR), .003, .05, .8, .03)
        at(s, tb, .5, 0, 'music')
    at(sub_bass(hz(root - 12), b(.48), 1.0), tb, .4, 0, 'music')
    # plucked chord stabs on the 8ths, opening as sections build
    if not (44 <= bt < 52):
        for m in tones:
            at(pluck_saw(hz(m + 12), b(.5), 1.0, 2600 + 1600 * ((bt % 8) / 8), .12), tb, .16, ((m % 5) - 2) * .2, 'music')

# pads: one per chord change, wide
for i, (bb, name) in enumerate(PROG):
    if bb < 4 and bb != 0:
        continue
    nb = PROG[i + 1][0] if i + 1 < len(PROG) else 60
    if 44 <= bb < 52:
        continue                                  # Halloween uses the organ
    dur = b(nb - bb) + .1
    cut = 1200 if bb == 0 else 3200
    L, R = pad([hz(m) for m in CH[name][0]], dur, 1.0, cut)
    at((L, R), b(bb), .9 if bb != 0 else .7, 0, 'music')

# the lead: the 4-bar phrase on the drops (title, build, coop), an octave down in the grab bars
def lead_phrase(b0, b_end, transpose=0, gain=.22, pan=0.0, every=None):
    for off, m, ln in LEAD:
        bt = b0 + off
        if bt >= b_end:
            break
        if every and not every(bt):
            continue
        at(chip_lead(hz(m + transpose), b(ln) * .92, 1.0), b(bt), gain, pan, 'music')
        at(chip_lead(hz(m + transpose), b(ln) * .6, 1.0, duty=.125), b(bt + .75), gain * .28, -pan or .4, 'music')   # echo


lead_phrase(4, 12, 0, .2)
lead_phrase(16, 20, -12, .2)                      # resolve row: the low answer
lead_phrase(28, 32, 0, .22)
lead_phrase(40, 44, 0, .24)
# co-op: call and response, host on the left, guest on the right
lead_phrase(52, 55, 0, .22, -.6, every=lambda x: (x // 1) % 2 == 0)
lead_phrase(52, 55, 12, .16, .6, every=lambda x: (x // 1) % 2 == 1)

# ------------------------------------------------------------------ Claw-o-ween (b44 - b52)
SPOOK = [(44, 'Fm'), (46, 'Gb'), (48, 'Fm'), (50, 'C')]
for bb, name in SPOOK:
    o = organ([hz(m) for m in CH[name][0]], b(2) + .05, 1.0)
    at(o, b(bb), .55, 0, 'music')
    for k in range(4):                            # swung organ stabs
        sw = .62 if k % 2 else 0
        at(organ([hz(m + 12) for m in CH[name][0][:3]], b(.3), 1.0), b(bb + k // 2 + sw * .5 + (k % 2) * .5), .25, (-.4, .4)[k % 2], 'music')
    root = CH[name][1]
    for k in range(4):
        at(sub_bass(hz(root - 12), b(.45), 1.0), b(bb + k * .5), .55, 0, 'music')
# the theremin line
THER = [(44.5, 72, 1.5, 65), (46, 73, 1.0, None), (47, 70, 1.0, None), (48, 72, 1.5, 68), (49.5, 68, .5, None), (50, 67, 1.5, 72)]
for bb, m, ln, fr in THER:
    at(theremin(hz(m), b(ln) + .1, 1.0, hz(fr) if fr else None), b(bb), .3, .2, 'music')

# ------------------------------------------------------------------ transitions + SFX
H = lambda k, i=0: HIT[k][i]

# I. cold open
at(pad([hz(m) for m in (41, 53, 56, 60)], b(4), 1.0, 700), 0, .5, 0, 'music')
t = H('coin')
at(whoosh(b(1), 1.0, 200, 3000, -.3, .1), 0, .35, 0, 'sfx')             # the coin falls
at(coin(1.0, hz(88)), t - .02, .9, 0, 'sfx')
at(clank(1.0, 1400, .5), t, .7, 0, 'sfx')
at(impact(1.0, 1.8, .7), t, .9, 0, 'hit')
at(sparkle(.9, 1.0, 1), t, .8, 0, 'sfx')
at(servo(b(2) - .05, 1.0, 160, 260), t + .02, .6, -.2, 'sfx')
for k in range(3):                                 # heartbeat while the claw dives
    at(kick(.9, .4, 100, 40), b(1.5 + k * .5), .55, 0, 'drums')
t = H('grab')
at(clank(1.0, 640), t, .9, 0, 'hit')
at(impact(.8, 1.4, .8), t, .7, 0, 'hit')
at(servo(b(1), 1.0, 320, 520), t + .06, .35, .2, 'sfx')
at(riser(b(3.9) - b(2), 240, 7000, 1.0), b(2), .5, 0, 'sfx')
at(reverse_crash(b(1.2), 1.0), b(4) - b(1.2), .45, 0, 'sfx')

# II. title
t = H('drop')
at(impact(1.4, 3.0, 1.0), t, 1.1, 0, 'hit'); at(crash(1.0, 2.6), t, .5, 0, 'hit'); at(sub_drop(1.0, 1.8, 80, 30), t, .8, 0, 'hit')
at(whoosh(.5, 1.0, 300, 6000, -.6, .6), t - .1, .55, 0, 'sfx')
at(whoosh(.35, 1.0, 400, 5000, -.8, .8), H('push') - .08, .5, 0, 'sfx'); at(taiko(1.0, .9), H('push'), .5, 0, 'hit')
at(riser(b(.5), 600, 9000, 1.0, tone=False), H('through'), .55, 0, 'sfx'); at(reverse_crash(b(.5), 1.0), H('through'), .4, 0, 'sfx')
t = H('twoh')
at(impact(1.6, 3.2, 1.0), t, 1.2, 0, 'hit'); at(crash(1.0, 2.8), t, .55, 0, 'hit')
for k, m in enumerate((77, 84, 89, 96)):
    at(chime(hz(m), 1.8, 1.0), t + k * .045, .35, -.3 + k * .2, 'sfx')
at(sub_drop(1.0, 1.6, 70, 28), H('sub'), .7, 0, 'hit')
at(riser(b(.5), 1000, 9000, 1.0), b(11.5), .45, 0, 'sfx')

# III. the grab
at(impact(1.0, 1.8, .8), H('cut'), .75, 0, 'hit')
at(servo(b(1.6), 1.0, 220, 140), H('cut'), .3, 0, 'sfx')
t = H('perfect')
at(impact(1.2, 3.0, .9), t, 1.0, 0, 'hit')
at(clank(1.0, 520, 1.0), t, .7, 0, 'hit')
for k, m in enumerate((84, 88, 91, 96, 100)):
    at(chime(hz(m), 2.2, 1.0), t + .02 + k * .06, .38, -.4 + k * .2, 'sfx')
at(reverse_crash(b(1.5), 1.0), t + b(.2), .3, 0, 'sfx')
at(whoosh(.45, 1.0, 300, 7000, -.3, .3), H('deliver') - .15, .6, 0, 'sfx')
at(impact(.9, 1.6, .7), H('word'), .8, 0, 'hit')
for k, t in enumerate(HIT['hit']):
    at(thwack(1.0, 170 + k * 12), t, .75, (-.5 + k * .25), 'hit')
    at(chip_sq(hz(84 + k * 2), .08, 1.0, .5, tau=.05), t + .01, .3, (-.5 + k * .25), 'sfx')
    at(coin(.5, hz(91 + k * 2)), t + .09, .14, (-.5 + k * .25), 'sfx')

# IV. the cabinet is alive
at(whoosh(.5, 1.0, 300, 7000, 1, -1), H('whip') - .18, .7, 0, 'sfx'); at(impact(1.0, 1.8, .8), H('whip'), .85, 0, 'hit')
t = H('surge')
at(zap(.6, 1.0), t, .7, -.5, 'hit'); at(zap(.4, 1.0), t + .07, .5, -.3, 'hit')
at(hp(noise(.4), 1500) * exp_env(int(.4 * SR), .03), t, .6, -.4, 'hit')       # the lightning crack
at(sub_drop(.7, .9, 70, 35), t, .5, 0, 'hit')
t = H('coins')
for k in range(16):
    at(coin(.6, hz(86 + (k * 5) % 12)), t + k * .028 + (k % 3) * .006, .16, ((k * 37) % 100 - 50) / 70, 'sfx')
at(taiko(1.0, .7, 110, 60), t, .5, 0, 'hit')
t = H('capsule')
at(taiko(1.0, .8, 90, 45), t, .7, .4, 'hit')
at(chip_sq(hz(72), .05, 1.0, .5, slide=1.0, tau=.04), t + .05, .4, .4, 'sfx')    # the pop
at(sparkle(.7, 1.0, 5), t + .05, .5, .5, 'sfx')
at(riser(b(1), 400, 8000, 1.0), b(23), .5, 0, 'sfx')
t = H('fever')
at(impact(1.5, 3.0, 1.0), t, 1.15, 0, 'hit'); at(crash(1.0, 2.6), t, .55, 0, 'hit')
at(cheer(2.2, 1.0, 11), t + .02, .7, 0, 'sfx')
for k in range(3):                                # a siren-ish lamp alarm in fifths
    at(chip_lead(hz(84 + (k % 2) * 7), b(.5), 1.0, duty=.5, vib=.03), t + b(.5) * k, .14, (-.4, .4)[k % 2], 'sfx')
t = H('fever2')
at(impact(1.0, 2.0, .8), t, .8, 0, 'hit'); at(cheer(1.6, .8, 12), t, .5, 0, 'sfx')
at(whoosh(.3, 1.0, 600, 8000, -.5, .5), t - .1, .4, 0, 'sfx')

# V. build anything
at(impact(1.2, 2.2, .9), H('word', 1), .9, 0, 'hit')
at(whoosh(.35, 1.0, 400, 7000, 1, -1), H('word', 1) - .15, .55, 0, 'sfx')
t = H('pick')
at(chip_sq(hz(84), .06, 1.0, .5, tau=.05), t, .35, 0, 'sfx'); at(chip_sq(hz(91), .18, 1.0, .5, tau=.12), t + .06, .35, 0, 'sfx')
for k, t in enumerate(HIT['combo']):            # the combo chips fire
    at(impact(.9, 1.4, .8), t, .7, 0, 'hit'); at(clank(.8, 700 + k * 200, .5), t, .5, (-.4, .4)[k], 'hit')
    for j, m in enumerate((84, 88, 91)):
        at(chip_sq(hz(m + k * 2), .07, 1.0, .25, tau=.05), t + .02 + j * .045, .25, (-.4, .4)[k], 'sfx')
at(whoosh(.3, 1.0, 400, 7000, 1, -1), H('combo') - .12, .5, 0, 'sfx')
t = H('joy')
at(whoosh(.3, 1.0, 400, 7000, -1, 1), t - .12, .5, 0, 'sfx'); at(chip_sq(hz(88), .06, 1.0, .5, tau=.05), t + .02, .3, -.3, 'sfx')
t = H('tech')
at(impact(.7, 1.0, .6), t, .5, 0, 'hit'); at(zap(.3, 1.0), t + .02, .4, .3, 'sfx'); at(taiko(1.0, .7), t, .5, 0, 'hit')
t = H('compactor')
at(whoosh(.3, 1.0, 400, 7000, 1, -1), t - .12, .5, 0, 'sfx'); at(hydraulic(1.0, .8), t, .8, 0, 'hit')
SCALE_UP = [65, 68, 70, 72, 75, 77, 80, 84]
for k, t in enumerate(HIT['claw']):
    at(clank(.8, 500 + k * 70, .45), t, .55, ((k * 3) % 8 - 3.5) / 5, 'hit')
    at(chip_sq(hz(SCALE_UP[k] + 12), .1, 1.0, .25, tau=.07), t + .01, .25, ((k * 3) % 8 - 3.5) / 5, 'sfx')
    at(taiko(1.0, .5, 120, 70), t, .35, 0, 'hit')
at(impact(1.0, 2.0, .8), H('claw', 4), .7, 0, 'hit')
at(riser(b(1), 300, 8000, 1.0), b(35), .5, 0, 'sfx')

# VI. capsule fever
t = H('breakdown')
at(impact(1.3, 3.0, .7), t, .8, 0, 'hit'); at(reverse_crash(b(2) - .05, 1.0), b(36) + .05, .35, 0, 'sfx')
at(riser(b(2), 120, 5000, 1.0), b(36), .4, 0, 'sfx')
for k, t in enumerate(HIT['tier']):                 # uncommon, rare, legendary: each tap a step up
    at(glass_crack(.6, .7), t, .5, (-.3, 0, .3)[k], 'hit'); at(taiko(1.0, .7, 100 + k * 20, 50), t, .55, 0, 'hit')
    at(chime(hz((79, 84, 91)[k]), 1.2, 1.0), t + .01, .35, (-.3, 0, .3)[k], 'sfx')
t = H('legendary')
at(impact(1.8, 4.0, 1.0), t, 1.3, 0, 'hit'); at(crash(1.0, 3.5), t, .6, 0, 'hit')
at(braam(hz(44), 2.8, 1.0, 4200), t, .7, 0, 'hit')
at(choir([hz(m) for m in (56, 60, 63, 68)], b(2) + .6, 1.0, 'ah'), t, 1.2, 0, 'music')
for k, m in enumerate((80, 84, 87, 92, 96, 99)):
    at(chime(hz(m), 2.6, 1.0), t + .03 + k * .07, .4, -.5 + k * .2, 'sfx')
at(sparkle(1.4, 1.0, 9), t + .1, .7, 0, 'sfx')
at(impact(1.2, 2.4, .9), H('word', 2), 1.0, 0, 'hit'); at(crash(.9, 2.2), H('word', 2), .45, 0, 'hit')
t = H('minis')
for k, m in enumerate((84, 88, 91, 96, 91, 96)):
    at(chip_sq(hz(m), .07, 1.0, .25, tau=.05), t + .05 + k * b(.25), .22, (-.4, .4)[k % 2], 'sfx')
at(riser(b(1.5), 300, 7000, 1.0), b(42.5), .5, 0, 'sfx')
t = H('bats')
at(whoosh(.9, 1.0, 300, 6000, -1, 1), t, .8, 0, 'sfx')
for k in range(22):
    at(squeak(2600 + (k * 397) % 2400, 1.0), t + k * .03 + (k % 4) * .01, .35, ((k * 53) % 100 - 50) / 55, 'sfx')

# VII. Claw-o-ween
t = H('halloween')
at(impact(1.4, 3.0, .8), t, 1.1, 0, 'hit')
at(lp(noise(2.4), 300) * np.exp(-T(2.4) / .8) * 2.0, t, .6, 0, 'hit')                 # thunder rumble
at(organ([hz(m) for m in (41, 53, 56, 60, 65)], 1.2, 1.0), H('word', 3), .5, 0, 'sfx')
at(impact(1.0, 2.0, .8), H('hfight'), .85, 0, 'hit')
t = H('depths')
at(impact(.9, 1.6, .5), t, .7, 0, 'hit')
for k in range(10):
    at(bubble(300 + (k * 173) % 700, 1.0, .1 + (k % 3) * .04), t + k * .04, .5, ((k * 31) % 100 - 50) / 60, 'sfx')
t = H('nl')
at(impact(.9, 1.6, .7), t, .8, 0, 'hit')
for k, m in enumerate((79, 84, 88)):
    at(chip_sq(hz(m), .08, 1.0, .5, tau=.06), t + .03 + k * .06, .25, 0, 'sfx')
at(whoosh(.4, 1.0, 300, 8000, -1, 1), b(51.55), .7, 0, 'sfx')
at(riser(b(1), 500, 9000, 1.0), b(51), .45, 0, 'sfx')

# VIII. co-op
t = H('coop')
at(impact(1.3, 2.6, .9), t, 1.0, 0, 'hit'); at(crash(1.0, 2.4), t, .5, 0, 'hit')
at(impact(.8, 1.6, .7), H('word', 4), .6, 0, 'hit')
for k in range(5):                               # the link crackles on the 8ths
    tt = b(52.5 + k * .5)
    at(zap(.22, 1.0), tt, .3, (-.6, .6)[k % 2], 'sfx')

# IX. the lockup
t = H('logo')
at(impact(1.9, 4.5, 1.0), t, 1.3, 0, 'end'); at(crash(1.0, 3.8), t, .6, 0, 'end')
at(braam(hz(41), 3.4, 1.0, 4600), t, .75, 0, 'end')
L_, R_ = pad([hz(m) for m in (53, 56, 60, 65, 72)], 1.75, 1.0, 5200)
at((L_, R_), t, 1.2, 0, 'end')
at(sub_bass(hz(29), 1.6, 1.0), t, .9, 0, 'end')
for k, m in enumerate((77, 80, 84, 89, 92, 96)):       # the gold chime sting, up the F minor chord
    at(chime(hz(m), 2.6, 1.0), t + .04 + k * .055, .42, -.5 + k * .2, 'end')
at(sparkle(1.6, 1.0, 21), t + .1, .6, 0, 'end')
at(chip_sq(hz(89), .07, 1.0, .5, tau=.05), H('cta'), .25, 0, 'end'); at(chip_sq(hz(96), .14, 1.0, .5, tau=.1), H('cta') + .07, .25, 0, 'end')
at(sparkle(.8, 1.0, 22), H('url'), .45, 0, 'end')

# ================================================================== mix
# sidechain: pads/bass/chords pump with every kick; the music also ducks under big hits
dk = duck_env(N, [(t, 1.0) for t in kick_times], depth=.6, release=.11)
big = [H(k) for k in ('drop', 'twoh', 'perfect', 'fever', 'legendary', 'halloween', 'coop')]
dk = np.minimum(dk, duck_env(N, [(t, 1.0) for t in big], depth=.55, release=.25))
for arr in BUS['music']:
    arr *= dk

# slow motion on PERFECT: the music sinks under water while time crawls (b13.8 - b15.3)
def filter_span(arrs, t0, t1, f=420, fade=.08):
    i0, i1, fd = int(t0 * SR), int(t1 * SR), int(fade * SR)
    for a in arrs:
        seg = a[i0 - fd:i1 + fd].copy()
        low = lp(seg, f, 2)
        w = np.ones(len(seg)); w[:fd] = np.linspace(0, 1, fd); w[-fd:] = np.linspace(1, 0, fd)
        a[i0 - fd:i1 + fd] = seg * (1 - w) + low * w * 1.3


filter_span(BUS['music'] + BUS['drums'], b(13.8), b(15.35), 380)
# the breakdown breathes: the bed sinks before LEGENDARY
i0, i1, fd = int(b(36) * SR), int(b(38) * SR), int(.05 * SR)
for a in BUS['music']:
    env = np.ones(len(a)); env[i0:i1] = .45; env[i0 - fd:i0] = np.linspace(1, .45, fd)
    a *= env
filter_span(BUS['music'] + BUS['drums'], b(49), b(50), 700)                    # the depths: under water

# glitch stutter at b11.5: the last half beat of music repeats a 32nd slice
def stutter(arrs, t0, t1, slice_b=.125):
    i0, i1, sl = int(t0 * SR), int(t1 * SR), int(b(slice_b) * SR)
    for a in arrs:
        piece = a[i0:i0 + sl].copy() * np.linspace(1, .7, sl)
        for i in range(i0, i1, sl):
            m = min(sl, i1 - i); a[i:i + m] = piece[:m]


stutter(BUS['music'] + BUS['drums'], b(11.5), b(12))
stutter(BUS['music'] + BUS['drums'], b(50.5), b(51), .25)

# tape stop: everything sags to a halt b55 -> b55.75, then silence until the logo
i0, i1 = int(b(55) * SR), int(b(56) * SR)
for k in ('drums', 'music', 'sfx', 'hit'):
    for a in BUS[k]:
        ts = tape_stop(a[i0:], b(55.75) - b(55))
        ts = ts * np.linspace(1, 0, len(ts)) ** .5
        a[i0:] = 0
        a[i0:i0 + len(ts)] = ts
for a in BUS['end']:
    a[:i1] = 0

def mixdown(keys, gains):
    return sum(BUS[k][0] * g_ for k, g_ in zip(keys, gains)), sum(BUS[k][1] * g_ for k, g_ in zip(keys, gains))


# width: the music and sfx buses get a decorrelated side signal (a short Haas delay of the
# mid, high-passed so the low end stays mono)
def widen(l, r, amt=.35, ms=13):
    d = int(ms * SR / 1000)
    m = (l + r) / 2
    side = hp(np.concatenate([np.zeros(d), m[:-d]]) - m, 250) * amt
    return l + side, r - side


for k in ('music', 'sfx', 'end'):
    BUS[k][0], BUS[k][1] = widen(BUS[k][0], BUS[k][1], .55 if k == 'music' else .3)
L, R = mixdown(('drums', 'music', 'sfx', 'hit', 'end'), (.8, .55, .85, 1.0, 1.0))
# reverb on the mids and highs
sendL, sendR = hp(L, 300), hp(R, 300)
wl, wr = reverb(sendL, sendR, wet=1.0, dur=2.0)
wl -= sendL; wr -= sendR
L = L + wl * .16; R = R + wr * .16
L, R = hp(L, 28), hp(R, 28)
# stereo width: widen the sides a touch above 200 Hz, keep the lows mono
M_, S_ = (L + R) / 2, (L - R) / 2
S_ = hp(S_, 200) * 1.35
L, R = M_ + S_, M_ - S_
# the synth kit is sub-heavy: keep the weight, give phones and laptops the mids
L = L - lp(L, 70, 2) * .5; R = R - lp(R, 70, 2) * .5
L = L + bp(L, 300, 1500) * .2; R = R + bp(R, 300, 1500) * .2
# presence for phones and laptops
L = L + bp(L, 2000, 5000) * .25; R = R + bp(R, 2000, 5000) * .25

M = int(CUES['dur'] * SR)
L, R = L[:M].copy(), R[:M].copy()
TARGET = -14.0
for it in range(4):
    gdb = TARGET - lufs(L, R)
    g_ = 10 ** (gdb / 20)
    L, R = limiter(L * g_, R * g_, ceiling=10 ** (-1.5 / 20))
tail = int(.5 * SR)
L[-tail:] *= np.linspace(1, 0, tail) ** 2; R[-tail:] *= np.linspace(1, 0, tail) ** 2
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'trailer.wav')
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
write_wav(out, L, R)
print('wrote', out, f'{M / SR:.2f}s', f'loudness {lufs(L, R):.1f} LUFS', f'true peak {20 * np.log10(true_peak(L, R)):.2f} dBTP')
