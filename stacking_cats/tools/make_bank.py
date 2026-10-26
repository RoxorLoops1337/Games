#!/usr/bin/env python3
"""Builds stacking_cats/meows.<hash>.wav and stacking_cats/meow_bank.js from a folder of raw meow recordings.

    python3 stacking_cats/tools/make_bank.py <folder with the source files>

Every meow is cut out of its source (silence and room noise trimmed away, long recordings split into their single meows),
high-passed at 70 Hz, faded in and out so nothing clicks, level matched, soft limited and packed back to back into one
mono 16 bit WAV. The data module lists each clip with its position, pitch (f0) and a few tags the game uses to pick it.
The raw files are not in the repo (see stacking_cats/AUDIO_CREDITS.md), only this script and the processed result.
Needs ffmpeg and numpy.
"""
import hashlib, json, subprocess, sys, wave
import numpy as np

SR = 48000          # working rate
OUT_SR = 24000      # rate of the shipped bank
TARGET_RMS = -20.0  # dBFS over the loud part of every clip
# pitch tracking picks the 2nd harmonic of this one (960 Hz); the other mouth made meows and its own contour say about 485 Hz
F0_FIX = {'b8': 485.0}
CEIL = 0.84         # about -1.5 dBFS
GUARD = int(0.02 * OUT_SR)   # silence between clips in the bank

# key, file name (prefix match), cut threshold in dB under the clip's own peak, split a long recording into its meows
SOURCES = [
    ('b', 'ANMLCat_Cat_meow_made_with_mouth', -34, True),
    ('m', 'mixkit-cartoon-kitty-begging-meow-92', -40, True),
    ('s', 'mixkit-sweet-kitty-meow-93', -32, False),
    ('k', 'kitten_mew-1', -30, False),
    ('a', 'A_short_aggressive_c_1', -34, False),
    ('g', 'A_cute_singing_kung__', -34, False),    # two files: g1 g2
    ('c', 'A_cute_cat_meow_', -24, False),         # four files with a steady noise floor about 30 dB down: c1..c4
    ('h', 'A_short_cute_cat_meo_4', -30, False),
]


def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-af', 'highpass=f=70', '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def envelope(x, win=0.005):
    n = int(win * SR); m = len(x) // n
    return np.sqrt((x[:m * n].reshape(m, n) ** 2).mean(1) + 1e-12), n


def split(x, thr_db=-32, gap=0.05, minlen=0.15):
    """segments (start, end) in seconds where the sound stays above thr_db under the file's peak"""
    env, n = envelope(x, 0.01)
    db = 20 * np.log10(env / env.max() + 1e-9)
    act = db > thr_db
    gaps = int(gap / 0.01)
    out = []; i = 0; m = len(act)
    while i < m:
        if act[i]:
            j = i
            while j < m and (act[j] or act[j:j + gaps].any()): j += 1
            out.append((i * 0.01, j * 0.01)); i = j
        else:
            i += 1
    return [(a, b) for a, b in out if b - a >= minlen]


def trim(x, thr_db):
    """tight cut: from the first 5 ms frame above thr_db under the clip's own peak to the first sustained drop below it after the peak
    (so a noise bump or glitch at the very end of a generated file is left out), a few ms of lead in and a short tail"""
    env, n = envelope(x)
    db = 20 * np.log10(env / env.max() + 1e-9)
    peak = int(np.argmax(db))
    # the meow starts where the sound has stayed above the threshold for 30 ms: a lip click or noise blip before a gap is cut away
    run = 6
    a = 0
    for i in range(len(db) - run):
        if (db[i:i + run] > thr_db).all(): a = i; break
    hold = 12   # 60 ms below the threshold in a row ends the meow
    b = len(db) - 1
    for i in range(peak, len(db) - hold):
        if (db[i:i + hold] < thr_db).all(): b = i; break
    a = a * n
    # a lip or tongue click right at the start: a spike far above what follows it is skipped
    ms = SR // 1000
    pk = np.abs(x[a:a + 110 * ms])
    pk = pk[:len(pk) // ms * ms].reshape(-1, ms).max(1)
    if len(pk) > 60:
        body = np.median(pk[10:60]) + 1e-9
        spikes = [i for i in range(0, 12) if pk[i] > 3.5 * body]
        if spikes: a += (spikes[-1] + 3) * ms
    a = max(0, a - int(0.004 * SR)); b = min(len(x), (b + 1) * n + int(0.02 * SR))
    return x[a:b]


def fades(x, fin=0.008, fout=0.03):
    x = x.copy(); a = int(fin * SR); b = min(int(fout * SR), len(x) // 2); a = min(a, len(x) // 2)
    x[:a] *= 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, a))
    x[-b:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, b))
    return x


def f0_of(x, fmin=150, fmax=1400, thr=0.12):
    """median pitch over the middle of the clip, per frame with the YIN method (first dip of the normalised difference function under thr)"""
    n = int(0.04 * SR); h = int(0.01 * SR); lo = int(SR / fmax); hi = int(SR / fmin); vals = []; tot = 0
    a, b = int(len(x) * 0.2), int(len(x) * 0.8)
    for st in range(a, max(a + 1, b - n - hi), h):
        tot += 1
        w = x[st:st + n + hi].astype(np.float64)
        if (w[:n] ** 2).mean() < 1e-6: continue
        d = np.array([((w[:n] - w[t:t + n]) ** 2).sum() for t in range(1, hi + 1)])
        cm = np.cumsum(d) / np.arange(1, hi + 1)
        dn = d / (cm + 1e-12)
        tau = None
        for t in range(lo, hi - 1):
            if dn[t - 1] < thr:
                while t + 1 < hi and dn[t] < dn[t - 1]: t += 1
                tau = t; break
        if tau: vals.append(SR / tau)
    return (float(np.median(vals)), len(vals) / max(1, tot)) if vals else (0.0, 0.0)


def resample(y):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-ar', str(OUT_SR), '-f', 'f32le', '-'], input=y.astype('<f4').tobytes(), capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype='<f4').copy()


def level(x):
    env, n = envelope(x, 0.02)
    loud = env > env.max() * 0.1
    rms = np.sqrt((env[loud] ** 2).mean())
    y = x * (10 ** (TARGET_RMS / 20) / rms)
    t = 0.6   # soft knee: untouched below 0.6, smoothly squeezed to CEIL above
    over = np.abs(y) > t
    y[over] = np.sign(y[over]) * (t + (CEIL - t) * np.tanh((np.abs(y[over]) - t) / (CEIL - t)))
    return y


def main(folder):
    import os, glob
    clips = []
    for key, prefix, thr, many in SOURCES:
        files = sorted((f for f in os.listdir(folder) if prefix in f and f.lower().endswith(('.wav', '.ogg'))), key=lambda f: f.split('-', 1)[-1] if '-' in f else f)
        for fi, f in enumerate(files):
            x = load(os.path.join(folder, f))
            parts = [x[int(a * SR):int(b * SR)] for a, b in split(x)] if many else [x]
            # long recordings: pull each part's edges outward a little so a soft onset is not clipped
            if many:
                parts = []
                for a, b in split(x):
                    a2 = max(0, int((a - 0.08) * SR)); b2 = min(len(x), int((b + 0.08) * SR)); parts.append(x[a2:b2])
            for pi, p in enumerate(parts):
                n = len(files) > 1 and not many
                cid = f'{key}{fi + 1}' if len(files) > 1 and not many else f'{key}{len(clips_of(clips, key)) + 1}'
                y = fades(trim(p, thr))
                f0, voiced = f0_of(y)
                if cid in F0_FIX: f0 = F0_FIX[cid]
                y = level(y)
                clips.append({'id': cid, 'src': f, 'x': y, 'f0': f0, 'voiced': voiced})
    # pack
    bank = []; meta = []; pos = 0
    for c in clips:
        y = c['x']
        z = resample(y)
        bank.append(z); bank.append(np.zeros(GUARD, dtype=np.float32))
        env, n = envelope(c['x'], 0.01)
        meta.append({'id': c['id'], 'start': pos, 'len': len(z), 'f0': round(c['f0'], 1), 'voiced': round(c['voiced'], 2), 'src': c['src']})
        pos += len(z) + GUARD
    data = np.concatenate(bank)
    pcm = (np.clip(data, -1, 1) * 32767).astype('<i2')
    out_dir = os.path.join(os.path.dirname(__file__), '..')
    # the file name carries a hash of its content: the service worker caches it by name, so a rebuilt bank is picked up by returning players
    tmp = os.path.join(out_dir, 'meows.tmp.wav')
    with wave.open(tmp, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(OUT_SR); w.writeframes(pcm.tobytes())
    name = 'meows.' + hashlib.sha1(open(tmp, 'rb').read()).hexdigest()[:8] + '.wav'
    for f in os.listdir(out_dir):
        if f.startswith('meows') and f.endswith('.wav') and f != name: os.remove(os.path.join(out_dir, f)) if f != 'meows.tmp.wav' else None
    os.replace(tmp, os.path.join(out_dir, name))
    print('bank file', name, '(put it in the PRECACHE list of sw.js and bump VERSION there)')
    write_module(meta, os.path.join(out_dir, 'meow_bank.js'), name)
    print(len(meta), 'clips', round(len(data) / OUT_SR, 2), 's', round(len(pcm) * 2 / 1024), 'KB')
    for m in meta: print(m['id'].ljust(4), f"{m['len'] / OUT_SR:.2f}s f0={m['f0']:6.1f} voiced={m['voiced']:.2f}", m['src'][:40])


def tags_of(m):
    t = []
    secs = m['len'] / OUT_SR
    if m['voiced'] >= 0.85 and m['f0'] > 0: t.append('tone')    # a steady pitch: can sing a note
    else: t.append('noisy')                                       # hissy or growly: good for drums
    if secs < 0.83: t.append('short')
    if secs >= 1.15: t.append('long')
    if m['id'].startswith('g'): t.append('sing')
    return t


def write_module(meta, path, name):
    rows = ',\n'.join("  { id: '%s', at: %d, len: %d, f0: %d, tags: %s }" % (m['id'], m['start'], m['len'], round(m['f0']), json.dumps(tags_of(m)).replace('"', "'")) for m in meta)
    open(path, 'w').write(f"""// Generated by stacking_cats/tools/make_bank.py. Do not edit by hand: change the script and run it again.
// {name} holds every clip back to back (mono, 16 bit, {OUT_SR} Hz): `at` and `len` are in samples, f0 is the pitch in Hz (0 = unpitched),
// tags: tone (steady pitch), noisy (hissy, for drums), short (under 0.83 s), long (over 1.15 s), sing (a sung one).
// Sources and licences: see AUDIO_CREDITS.md.
export const MEOW_BANK = {{ url: '{name}', rate: {OUT_SR} }};
export const MEOW_CLIPS = [
{rows},
];
""")


def clips_of(clips, key):
    return [c for c in clips if c['id'].startswith(key)]


if __name__ == '__main__':
    main(sys.argv[1])
