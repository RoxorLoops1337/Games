// BBH.Mic (pure DSP + fake-browser wrapper), BBH.Samples and the audio.js sample hook.
import { ok, eq, near, between, done, load } from './beatbox_heroes_lib.mjs';
import * as R from '../tools/beatbox_heroes/audio_render.mjs';

const BBH = load('audio', 'mic', 'samples');
const M = BBH.Mic, S = BBH.Samples;

/* ---------------------------------------------------------------- synthetic voice generators (seeded) */
function rngf(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
const U=(r,a,b)=>a+(b-a)*r();
function gauss(r){return Math.sqrt(-2*Math.log(r()+1e-12))*Math.cos(2*Math.PI*r());}
function biquad(type,f,q,sr){const w=2*Math.PI*f/sr,c=Math.cos(w),s=Math.sin(w),al=s/(2*q);let b0,b1,b2;
 if(type==='hp'){b0=(1+c)/2;b1=-(1+c);b2=(1+c)/2;}else if(type==='bp'){b0=al;b1=0;b2=-al;}else{b0=(1-c)/2;b1=1-c;b2=(1-c)/2;}
 const a0=1+al,a1=-2*c,a2=1-al;return{b0:b0/a0,b1:b1/a0,b2:b2/a0,a1:a1/a0,a2:a2/a0};}
function filt(x,type,f,q,sr){const k=biquad(type,f,q,sr),y=new Float32Array(x.length);let x1=0,x2=0,y1=0,y2=0;
 for(let i=0;i<x.length;i++){const v=k.b0*x[i]+k.b1*x1+k.b2*x2-k.a1*y1-k.a2*y2;x2=x1;x1=x[i];y2=y1;y1=v;y[i]=v;}return y;}
function noise(n,r){const x=new Float32Array(n);for(let i=0;i<n;i++)x[i]=gauss(r);return x;}
function norm(x,amp){const T=Math.min(400,x.length>>1);for(let i=0;i<T;i++)x[x.length-1-i]*=i/T;let p=0;for(const v of x)p=Math.max(p,Math.abs(v));const g=p?amp/p:0;for(let i=0;i<x.length;i++)x[i]*=g;return x;}
/** voice: 0 = default voice, 1 = shifted voice */
function kick(sr,r,voice=0){const n=Math.floor(sr*0.25),x=new Float32Array(n);const f=voice?U(r,85,115):U(r,48,75),dec=voice?U(r,0.05,0.09):U(r,0.06,0.11),sw=U(r,0.6,1.4);let ph=0;
 for(let i=0;i<n;i++){const t=i/sr;ph+=2*Math.PI*f*(1+sw*Math.exp(-t/0.02))/sr;x[i]=Math.sin(ph)*Math.exp(-t/dec);}return norm(x,U(r,0.4,0.9));}
function hat(sr,r,voice=0){const n=Math.floor(sr*0.08),w=noise(n,r);let x=filt(w,'hp',voice?U(r,3800,4800):U(r,5500,7500),0.8,sr);const dec=U(r,0.012,0.03);
 for(let i=0;i<n;i++)x[i]*=Math.exp(-(i/sr)/dec);return norm(x,U(r,0.25,0.8));}
function snare(sr,r,voice=0){const n=Math.floor(sr*0.16),w=noise(n,r),nz=filt(filt(w,'hp',voice?U(r,500,800):U(r,900,1500),0.7,sr),'lp',voice?U(r,3500,5000):U(r,5500,8000),0.7,sr);
 const x=new Float32Array(n),tf=voice?U(r,260,320):U(r,180,230),nd=U(r,0.04,0.08),td=U(r,0.05,0.09),tb=U(r,0.5,1.2);
 let mx=0;for(const v of nz)mx=Math.max(mx,Math.abs(v));
 for(let i=0;i<n;i++){const t=i/sr;x[i]=nz[i]/mx*Math.exp(-t/nd)+tb*0.5*Math.sin(2*Math.PI*tf*t)*Math.exp(-t/td);}return norm(x,U(r,0.4,0.9));}
function pf(sr,r,voice=0){const n=Math.floor(sr*0.16),w=noise(n,r);const c=voice?U(r,2000,3000):U(r,2800,4000);let x=filt(w,'bp',c,voice?0.9:1.1,sr);const at=U(r,0.004,0.01),dec=U(r,0.03,0.07);
 for(let i=0;i<n;i++){const t=i/sr;x[i]*=Math.min(1,t/at)*Math.exp(-t/dec);}return norm(x,U(r,0.1,0.3));}
const GEN=[kick,hat,snare,pf];


const TWO_PI = 2 * Math.PI;
function sine(freq, sr, n, amp = 0.5, phase = 0) { const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = amp * Math.sin(TWO_PI * freq * i / sr + phase); return x; }
const centsOff = (f, t) => 1200 * Math.log2(f / t);

/* ---------------------------------------------------------------- yin */
{
  for (const sr of [44100, 48000]) {
    for (const f of [110, 220, 440, 880]) {
      const r = M.yin(sine(f, sr, 2048), sr);
      ok(r.freq > 0 && Math.abs(centsOff(r.freq, f)) < 10, `yin sine ${f} Hz @${sr}`);
      ok(r.clarity > 0.9, `yin clarity high for a clean sine ${f}@${sr} (${r.clarity.toFixed(3)})`);
    }
    const rng = rngf(7);
    for (const f of [110, 196, 330, 523]) {
      const x = sine(f, sr, 2048, 0.4), a = sine(2 * f, sr, 2048, 0.25, 1), b = sine(3 * f, sr, 2048, 0.15, 2);
      for (let i = 0; i < x.length; i++) x[i] += a[i] + b[i];
      const r = M.yin(x, sr);
      ok(Math.abs(centsOff(r.freq, f)) < 10, `yin sine+2nd+3rd harmonics ${f}@${sr} (got ${r.freq.toFixed(2)})`);
      /* strong 2nd harmonic, weak fundamental must not jump an octave up */
      const y = sine(f, sr, 2048, 0.3), y2 = sine(2 * f, sr, 2048, 0.45, 0.5);
      for (let i = 0; i < y.length; i++) y[i] += y2[i];
      const r2 = M.yin(y, sr);
      ok(Math.abs(centsOff(r2.freq, f)) < 10, `yin strong 2nd harmonic keeps the fundamental ${f}@${sr} (got ${r2.freq.toFixed(2)})`);
    }
    /* 20 dB SNR */
    let good = 0, tot = 0;
    for (const f of [110, 220, 440, 880]) for (let k = 0; k < 5; k++) {
      const x = sine(f, sr, 2048, 0.5, k), sig = 0.5 / Math.SQRT2, sigma = sig / 10;
      for (let i = 0; i < x.length; i++) x[i] += gauss(rng) * sigma;
      const r = M.yin(x, sr); tot++;
      if (Math.abs(centsOff(r.freq, f)) < 15) good++;
    }
    ok(good === tot, `yin at 20 dB SNR ${good}/${tot} @${sr}`);
    eq(M.yin(new Float32Array(2048), sr).freq, 0, 'yin silence -> 0');
    let noiseHits = 0;
    for (let k = 0; k < 40; k++) { const w = noise(2048, rng); for (let i = 0; i < w.length; i++) w[i] *= 0.3; if (M.yin(w, sr).freq > 0) noiseHits++; }
    ok(noiseHits <= 1, `yin white noise is unvoiced (${noiseHits}/40 false)`);
    /* sweep: octave errors < 3% */
    let n = 0, oct = 0, bad = 0;
    for (let f = 75; f < 1050; f *= 1.017) {
      const x = sine(f, sr, 2048, 0.5, f), h = sine(2 * f, sr, 2048, 0.2, 1);
      for (let i = 0; i < x.length; i++) x[i] += h[i];
      const r = M.yin(x, sr); n++;
      const ratio = r.freq / f;
      if (Math.abs(Math.log2(ratio)) > 0.8 && Math.abs(Math.log2(ratio)) < 1.2) oct++;
      else if (Math.abs(centsOff(r.freq || 1, f)) > 30) bad++;
    }
    ok(oct / n < 0.03, `yin sweep octave errors ${oct}/${n} @${sr}`);
    ok(bad / n < 0.03, `yin sweep other errors ${bad}/${n} @${sr}`);
  }
  /* runtime */
  const x = sine(220, 44100, 2048), y = sine(660, 48000, 2048);
  M.yin(x, 44100);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 400; i++) { M.yin(i & 1 ? x : y, i & 1 ? 44100 : 48000); }
  const per = Number(process.hrtime.bigint() - t0) / 1e6 / 400;
  ok(per < 1, `yin runtime ${per.toFixed(3)} ms per frame (< 1 ms)`);
  ok(M.yin(sine(30, 44100, 2048), 44100).freq === 0 || M.yin(sine(30, 44100, 2048), 44100).freq >= 70, 'yin stays inside 70..1100 Hz');
}

/* ---------------------------------------------------------------- note helpers */
{
  eq(M.noteName(440), 'A4', 'noteName 440'); eq(M.noteName(261.63), 'C4', 'noteName C4'); eq(M.noteName(110), 'A2', 'noteName A2');
  eq(M.noteName(466.16), 'A#4', 'noteName A#4'); eq(M.noteName(0), '', 'noteName 0');
  near(M.midi(440), 69, 1e-9, 'midi 440'); near(M.midi(880), 81, 1e-9, 'midi 880'); near(M.midi(261.6256), 60, 1e-3, 'midi C4');
  near(M.cents(440, 69), 0, 1e-9, 'cents 0'); near(M.cents(466.1638, 69), 100, 0.01, 'cents +100'); near(M.cents(415.3047, 69), -100, 0.01, 'cents -100');
  near(M.cents(440 * Math.pow(2, 0.25 / 12), 69), 25, 0.01, 'cents +25');
}

/* ---------------------------------------------------------------- rms / bands / featureVec */
{
  near(M.rms(sine(440, 44100, 4410, 1)), Math.SQRT1_2, 1e-3, 'rms of a unit sine'); eq(M.rms(new Float32Array(10)), 0, 'rms zero');
  const b = M.bandFeatures(sine(200, 44100, 1024, 0.5), 44100);
  eq(b.length, 8, '8 bands');
  let mx = 0; for (let i = 1; i < 8; i++) if (b[i] > b[mx]) mx = i;
  eq(mx, 1, 'a 200 Hz sine lands in band 150-300');
  const b2 = M.bandFeatures(sine(6000, 48000, 1024, 0.5), 48000);
  mx = 0; for (let i = 1; i < 8; i++) if (b2[i] > b2[mx]) mx = i;
  eq(mx, 6, 'a 6 kHz sine lands in band 5k-8k');
  const fv = M.featureVec(sine(3000, 44100, 1024, 0.5), 44100);
  eq(fv.vec.length, 10, 'featureVec has 10 entries'); near(fv.centroid, 3000, 120, 'centroid of a 3 kHz sine'); near(fv.rms, 0.3536, 0.01, 'featureVec rms');
  near(fv.zcr, 2 * 3000 / 44100, 0.01, 'zcr of a 3 kHz sine');
  const quiet = M.featureVec(sine(3000, 44100, 1024, 0.05), 44100);
  near(quiet.vec[5], fv.vec[5], 0.05, 'band shape is loudness independent');
}

/* ---------------------------------------------------------------- classifier on synthetic voices */
function hit(l, sr, rng, voice, hiss = 0.002, gain = 1) {
  const s = GEN[l](sr, rng, voice), buf = new Float32Array(2048), off = Math.floor(sr * 0.003 * U(rng, 0.7, 1.3));
  buf.set(s.subarray(0, Math.min(s.length, 2048 - off)), off);
  const h = noise(2048, rng);
  for (let k = 0; k < 2048; k++) buf[k] = buf[k] * gain + h[k] * hiss;
  return buf;
}
{
  const cls = M.makeClassifier();
  eq(M.defaultProfiles().length, 4, 'four default profiles');
  for (const sr of [44100, 48000]) {
    let right = 0, tot = 0;
    const per = [0, 0, 0, 0];
    const rng = rngf(1234 + sr);
    for (let l = 0; l < 4; l++) for (let i = 0; i < 50; i++) {
      const fv = M.featureVec(hit(l, sr, rng, 0, U(rng, 0.0005, 0.004), U(rng, 0.4, 1)), sr);
      const c = cls.classify(fv.vec); tot++;
      if (c.lane === l) { right++; per[l]++; }
      if (i === 0) { near(c.scores.reduce((a, b) => a + b, 0), 1, 1e-6, 'scores sum to 1'); ok(c.confidence >= 0.25 && c.confidence <= 1, 'confidence in range'); }
    }
    ok(right / tot >= 0.9, `default classifier accuracy ${(100 * right / tot).toFixed(1)}% @${sr} per lane ${per}`);
    ok(per.every((p) => p >= 40), `every lane >= 80% @${sr}: ${per}`);
  }
  /* learn() pulls a lane toward the examples */
  const c2 = M.makeClassifier(), rng = rngf(55);
  for (let i = 0; i < 6; i++) c2.learn(3, M.featureVec(hit(1, 44100, rng, 0), 44100).vec);
  eq(c2.count(3), 6, 'learn count');
  eq(c2.learn(9, new Float32Array(10)), false, 'learn rejects a bad lane');
}

/* ---------------------------------------------------------------- onset detector */
function feedAll(det, x, sr, fl = 1024) {
  const out = [];
  for (let p = 0; p < x.length; p += fl) { const ev = det.feed(x.subarray(p, Math.min(x.length, p + fl)), sr); if (ev) out.push(ev); }
  return out;
}
function track(sr, times, lanes, seed, hiss = 0.002, voice = 0) {
  const rng = rngf(seed), n = Math.floor(sr * (times[times.length - 1] + 0.8)), x = noise(n, rng);
  for (let i = 0; i < n; i++) x[i] *= hiss;
  times.forEach((t, k) => { const s = GEN[lanes[k]](sr, rng, voice), o = Math.floor(t * sr); for (let i = 0; i < s.length && o + i < n; i++) x[o + i] += s[i]; });
  return x;
}
{
  for (const sr of [44100, 48000]) {
    const times = [0.5, 0.9, 1.3, 1.7, 2.1, 2.5, 2.9, 3.3], lanes = [0, 1, 2, 3, 0, 1, 2, 0];
    const x = track(sr, times, lanes, 99 + sr);
    const det = M.makeOnsetDetector(), ev = feedAll(det, x, sr);
    eq(ev.length, 8, `8-hit track gives 8 onsets @${sr}`);
    let worst = 0, labelled = 0;
    ev.forEach((e, i) => { if (times[i] != null) worst = Math.max(worst, Math.abs(e.time - times[i])); if (M.makeClassifier().classify(e.vec).lane === lanes[i]) labelled++; });
    ok(worst < 0.015, `onset timing error ${(worst * 1000).toFixed(1)} ms @${sr}`);
    ok(labelled >= 7, `onset features classify ${labelled}/8 @${sr}`);
    ok(ev.every((e) => e.strength > 0 && e.strength <= 1 && e.vec.length === 10), 'event shape');
    ok(ev.every((e) => e.ageSec >= 0.039 && e.ageSec < 0.07), 'events are emitted about 40 ms after the onset');
    /* frame size independence */
    const ev2 = feedAll(M.makeOnsetDetector(), x, sr, 256);
    eq(ev2.length, 8, `256-sample frames also give 8 onsets @${sr}`);
    ev2.forEach((e, i) => near(e.time, times[i], 0.015, 'timing with 256 frames'));
  }
  /* noise floor only */
  for (const level of [0.003, 0.02]) {
    const rng = rngf(31), n = 44100 * 6, x = noise(n, rng);
    for (let i = 0; i < n; i++) x[i] = x[i] * level + 0.001 * Math.sin(TWO_PI * 50 * i / 44100);
    eq(feedAll(M.makeOnsetDetector(), x, 44100).length, 0, `no false onsets in hiss at ${level}`);
  }
  eq(feedAll(M.makeOnsetDetector(), new Float32Array(44100 * 2), 44100).length, 0, 'no onsets in digital silence');
  /* refractory */
  const near2 = feedAll(M.makeOnsetDetector(), track(44100, [0.5, 0.55], [0, 0], 5), 44100);
  eq(near2.length, 1, 'two hits 50 ms apart give one onset');
  const far2 = feedAll(M.makeOnsetDetector(), track(44100, [0.5, 0.65], [0, 1], 6), 44100);
  eq(far2.length, 2, 'two hits 150 ms apart give two onsets');
  const longRef = feedAll(M.makeOnsetDetector({ refractoryMs: 300 }), track(44100, [0.5, 0.65, 1.2], [0, 1, 2], 8), 44100);
  eq(longRef.length, 2, 'refractoryMs option is honoured');
  /* quiet voice (pf-like) on a bed of hiss */
  const soft = feedAll(M.makeOnsetDetector(), track(44100, [0.5, 1.0, 1.5], [3, 3, 3], 17, 0.003), 44100);
  eq(soft.length, 3, 'soft Pf hits over hiss are found');
  /* a detector can be reused after reset */
  const d = M.makeOnsetDetector(); feedAll(d, track(44100, [0.5], [0], 3), 44100); d.reset();
  eq(feedAll(d, track(44100, [0.5], [0], 3), 44100).length, 1, 'reset restarts the detector');
}

/* ---------------------------------------------------------------- trimSample */
{
  const sr = 44100, rng = rngf(3);
  const k = kick(sr, rng, 0);
  const lead = Math.floor(sr * 0.4), tail = Math.floor(sr * 0.6), raw = new Float32Array(lead + k.length + tail);
  for (let i = 0; i < raw.length; i++) raw[i] = (rng() - 0.5) * 0.004 + 0.02;       // hiss and DC offset
  for (let i = 0; i < k.length; i++) raw[lead + i] += k[i] * 0.5;
  const t = M.trimSample(raw, sr);
  ok(t.length > 0, 'trim keeps the sound');
  const pk = (a) => { let m = 0; for (const v of a) m = Math.max(m, Math.abs(v)); return m; };
  near(pk(t), 0.85, 1e-4, 'trim normalises to 0.85 peak');
  ok(t.length < raw.length * 0.4, `leading and trailing silence removed (${t.length} of ${raw.length})`);
  ok(t.length <= Math.round(0.6 * sr) + 1, 'trim caps at 600 ms');
  let first = 0; while (first < t.length && Math.abs(t[first]) < 0.1) first++;
  between(first / sr * 1000, 0, 25, 'sound begins right after a short pre-roll (ms)');
  near(Math.abs(t[t.length - 1]), 0, 0.01, 'last sample is faded out');
  let sum = 0; for (let i = 0; i < 200; i++) sum += t[i]; ok(Math.abs(sum / 200) < 0.05, 'DC offset removed');
  /* long sound is capped */
  const longS = sine(200, sr, sr * 2, 0.5);
  const t2 = M.trimSample(longS, sr);
  eq(t2.length, Math.round(0.6 * sr), 'a 2 s tone is cut to 600 ms');
  /* silence / hiss -> empty */
  eq(M.trimSample(new Float32Array(sr), sr).length, 0, 'silence gives an empty sample');
  const hiss = noise(sr, rng); for (let i = 0; i < hiss.length; i++) hiss[i] *= 0.01;
  eq(M.trimSample(hiss, sr).length, 0, 'hiss below 0.04 RMS gives an empty sample');
  eq(M.trimSample(null, sr).length, 0, 'null buffer is safe');
  eq(M.trimSample(new Float32Array(0), sr).length, 0, 'empty buffer is safe');
  /* works at 48k and keeps a short hat short */
  const h = hat(48000, rng, 0), raw2 = new Float32Array(48000);
  raw2.set(h, 9000);
  const t3 = M.trimSample(raw2, 48000);
  ok(t3.length > 0 && t3.length < 48000 * 0.2, `short hat stays short (${t3.length})`);
}

/* ---------------------------------------------------------------- trainFromSamples on a shifted voice */
{
  const sr = 44100;
  const acc = (cls, seed, voice) => {
    const rng = rngf(seed); let right = 0, tot = 0;
    for (let l = 0; l < 4; l++) for (let i = 0; i < 50; i++) { tot++; if (cls.classify(M.featureVec(hit(l, sr, rng, voice, 0.002, U(rng, 0.4, 1)), sr).vec).lane === l) right++; }
    return right / tot;
  };
  const base = acc(M.makeClassifier(), 71, 1);
  const rng = rngf(2024), rec = {};
  for (let l = 0; l < 4; l++) {
    const s = GEN[l](sr, rng, 1), raw = new Float32Array(sr); raw.set(s, 6000);
    rec[l] = M.trimSample(raw, sr);
  }
  const prof = M.trainFromSamples(rec, sr);
  eq(prof.length, 4, 'trainFromSamples returns 4 profiles');
  const trained = acc(M.makeClassifier(prof), 71, 1);
  const viaFrom = acc(M.makeClassifier().fromSamples(rec, sr), 71, 1);
  ok(trained >= base - 0.02, `trained accuracy ${(trained * 100).toFixed(1)}% vs default ${(base * 100).toFixed(1)}% on a shifted voice`);
  ok(trained >= 0.85, `trained accuracy at least 85% (${(trained * 100).toFixed(1)}%)`);
  near(viaFrom, trained, 0.001, 'classifier.fromSamples matches trainFromSamples');
  /* missing lanes fall back to the defaults */
  const partial = M.trainFromSamples({ 0: rec[0] }, sr);
  eq(partial[2].name, 'K', 'untrained lane keeps its default profile');
  ok(acc(M.makeClassifier(), 72, 0) >= 0.9, 'default classifier still fine for the default voice');
}

/* ---------------------------------------------------------------- Samples store (memory path) */
{
  const f = new Float32Array(2000); for (let i = 0; i < f.length; i++) f[i] = 0.8 * Math.sin(i * 0.07);
  eq(S.put(1, 2, f, 44100), true, 'put');
  const g = S.get(1, 2);
  ok(g && g.f32.length === 2000 && g.rate === 44100, 'get round trip'); near(g.f32[100], f[100], 0, 'get returns the same data');
  f[100] = 0; ok(S.get(1, 2).f32[100] !== 0, 'put copies the data');
  eq(S.get(1, 0), null, 'missing lane is null'); eq(S.get(2, 2), null, 'slots are separate');
  eq(S.put(1, 7, f, 44100), false, 'bad lane rejected'); eq(S.put(1, 0, new Float32Array(0), 44100), false, 'empty sample rejected');
  S.put(1, 0, f, 48000);
  eq(S.list(1).map((e) => e.lane), [0, 2], 'list'); near(S.list(1)[0].seconds, 2000 / 48000, 1e-9, 'list seconds');
  const ex = S.exportSlot(1);
  eq(JSON.parse(JSON.stringify(ex)).lanes[2].n, 2000, 'export is JSON-able');
  ok(typeof ex.lanes[0].pcm === 'string' && ex.lanes[0].rate === 48000, 'export carries PCM and rate');
  S.removeAll(1); eq(S.list(1).length, 0, 'removeAll');
  eq(S.importSlot(3, ex), 2, 'import returns the lane count');
  const back = S.get(3, 2);
  ok(back && back.f32.length === 2000, 'import round trip length');
  let err = 0; const orig = new Float32Array(2000); for (let i = 0; i < 2000; i++) orig[i] = 0.8 * Math.sin(i * 0.07);
  for (let i = 0; i < 2000; i++) err = Math.max(err, Math.abs(back.f32[i] - orig[i]));
  ok(err < 1e-3, 'import round trip error below 16-bit quantisation (' + err + ')');
  eq(S.get(3, 0).rate, 48000, 'rate survives export/import');
  eq(S.importSlot(4, { nope: 1 }), 0, 'bad import gives 0'); eq(S.importSlot(4, null), 0, 'null import gives 0');
  eq(S.importSlot(3, { v: 1, lanes: {} }), 0, 'empty import clears the slot'); eq(S.list(3).length, 0, 'slot cleared by an empty import');
  S.put(5, 1, f, 44100); eq(S.remove(5, 1), true, 'remove'); eq(S.remove(5, 1), false, 'remove twice');
  S._clearMemory();
  const r = await S.init(9);
  ok(r.ok && r.persistent === false, 'init without IndexedDB is a memory store');
  await S.flush();
}

/* ---------------------------------------------------------------- Samples store (fake IndexedDB path) */
{
  const store = new Map();
  const fakeIDB = {
    open() {
      const req = {};
      setTimeout(() => {
        const db = {
          createObjectStore() {},
          transaction() {
            const tx = {};
            const os = {
              put(v, k) { store.set(k, v); }, delete(k) { store.delete(k); },
              openCursor() {
                const rq = {}; const keys = [...store.keys()].sort(); let i = 0;
                const step = () => setTimeout(() => {
                  if (i >= keys.length) { rq.result = null; rq.onsuccess && rq.onsuccess(); setTimeout(() => tx.oncomplete && tx.oncomplete(), 0); return; }
                  const k = keys[i++]; rq.result = { key: k, value: store.get(k), continue: step }; rq.onsuccess && rq.onsuccess();
                }, 0);
                step(); return rq;
              },
            };
            tx.objectStore = () => os;
            setTimeout(() => tx.oncomplete && tx.oncomplete(), 5);
            return tx;
          },
        };
        req.result = db; req.onupgradeneeded && req.onupgradeneeded(); req.onsuccess && req.onsuccess();
      }, 0);
      return req;
    },
  };
  globalThis.indexedDB = fakeIDB;
  S._clearMemory();
  // fresh module instance so the cached db promise does not remember "no IndexedDB"
  delete globalThis.BBH.Samples;
  const path = (await import('node:path')).default, { createRequire } = await import('node:module');
  const rq = createRequire(import.meta.url);
  const file = path.join(path.dirname(rq.resolve('./beatbox_heroes_lib.mjs')), '..', 'beatbox_heroes', 'samples.js');
  delete rq.cache[file]; rq(file);
  const S2 = globalThis.BBH.Samples;
  const f = new Float32Array(500).fill(0.25);
  S2.put(2, 1, f, 44100); S2.put(2, 3, f, 44100); S2.put(3, 0, f, 44100);
  await S2.flush();
  ok([...store.keys()].sort().join() === 'slot2:lane1,slot2:lane3,slot3:lane0', 'writes land under slot{N}:lane{L} keys: ' + [...store.keys()]);
  ok(store.get('slot2:lane1').f32 instanceof Float32Array && store.get('slot2:lane1').rate === 44100, 'stored value is { f32, rate }');
  S2._clearMemory();
  const r = await S2.init(2);
  ok(r.ok && r.persistent && r.count === 2, 'init loads the slot from IndexedDB ' + JSON.stringify(r));
  ok(S2.get(2, 1) && S2.get(2, 3) && !S2.get(3, 0), 'only the requested slot is loaded');
  S2.remove(2, 1); await S2.flush();
  ok(!store.has('slot2:lane1'), 'remove deletes from IndexedDB');
  S2.removeAll(2); await S2.flush();
  ok(!store.has('slot2:lane3'), 'removeAll deletes from IndexedDB');
  delete globalThis.indexedDB;
  globalThis.BBH.Samples = S;
}

/* ---------------------------------------------------------------- audio.js sample hook */
{
  const AF = BBH.AudioFactory;
  const ctx = new R.FakeContext();
  const A = AF.create(() => ctx, { log: true, manual: true });
  A.unlock();
  for (let l = 0; l < 4; l++) eq(A.hasSample(l), false, 'no sample at start, lane ' + l);
  const src0 = ctx.sources;
  A.drum(0, { vel: 0.8 });
  const synthSources = ctx.sources - src0;
  ok(synthSources > 1, 'synth kick uses several sources');
  const samp = sine(100, 44100, 4410, 0.8);
  eq(A.setSample(0, samp, 44100), true, 'setSample'); eq(A.hasSample(0), true, 'hasSample'); eq(A.hasSample(1), false, 'other lanes untouched');
  eq(A.setSample(9, samp, 44100), false, 'bad lane'); eq(A.setSample(1, new Float32Array(0), 44100), false, 'empty sample rejected');
  const s1 = ctx.sources, when = ctx.currentTime + 0.25;
  eq(A.drum(0, { vel: 1, when }), true, 'drum with a sample plays');
  eq(ctx.sources - s1, 1, 'a sample hit is one buffer source');
  const last = A.log[A.log.length - 1];
  ok(last.k === 'drum' && last.sample === true && Math.abs(last.t - when) < 1e-9, 'logged as a sample hit at the requested time');
  const s1b = ctx.sources; eq(A.drum(1, { vel: 1 }), true, 'other lane still plays the synth'); ok(ctx.sources > s1b && !A.log[A.log.length - 1].sample, 'synth lane unaffected');
  A.clearSample(0); eq(A.hasSample(0), false, 'clearSample');
  const s2 = ctx.sources; A.drum(0); ok(ctx.sources - s2 > 1, 'back to the synth after clearSample');
  /* shared instance + Samples.applyToAudio */
  eq(typeof BBH.Audio.setSample, 'function', 'BBH.Audio.setSample'); eq(typeof BBH.Audio.hasSample, 'function', 'BBH.Audio.hasSample'); eq(typeof BBH.Audio.clearSample, 'function', 'BBH.Audio.clearSample');
  S.put(7, 1, samp, 44100); S.put(7, 3, samp, 44100);
  eq(S.applyToAudio(7), 2, 'applyToAudio sets the stored lanes');
  eq([0, 1, 2, 3].map((l) => BBH.Audio.hasSample(l)), [false, true, false, true], 'applyToAudio mirrors the slot');
  eq(S.applyToAudio(8), 0, 'applying an empty slot clears everything');
  eq([0, 1, 2, 3].map((l) => BBH.Audio.hasSample(l)), [false, false, false, false], 'lanes cleared');
  let threw = false; try { BBH.Audio.drum(1); } catch (e) { threw = true; } ok(!threw, 'shared drum without AudioContext never throws');
}

/* ---------------------------------------------------------------- browser wrapper against a fake browser */
{
  eq(M.isOpen(), false, 'closed at start'); eq(M.level(), 0, 'level 0'); eq(M.sampleRate(), 0, 'no rate');
  const r0 = await M.open();
  ok(!r0.ok && r0.error === 'unsupported', 'open() in node reports unsupported (' + r0.error + ')');
  M.close(); M.close();
  const rec0 = await M.recordSample({ maxWaitMs: 100 });
  ok(!rec0.ok && rec0.reason === 'closed', 'recordSample while closed resolves closed');
  eq(M.pitchNow().freq, 0, 'pitchNow while closed');
  const stopL = M.listen(() => {}); stopL(); stopL();

  /* fake web audio + getUserMedia */
  const made = { tracksStopped: 0, ctxClosed: 0, spDisconnected: 0, srcDisconnected: 0, ctx: null, sp: null, constraints: null, ctxCreatedBeforeGUM: false };
  class FakeAC {
    constructor() { this.sampleRate = 44100; this.state = 'suspended'; this.destination = {}; made.ctx = this; made.ctxCount = (made.ctxCount || 0) + 1; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { this.state = 'closed'; made.ctxClosed++; return Promise.resolve(); }
    createMediaStreamSource() { return { connect() {}, disconnect() { made.srcDisconnected++; } }; }
    createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
    createScriptProcessor() { const sp = { connect() {}, disconnect() { made.spDisconnected++; }, onaudioprocess: null }; made.sp = sp; return sp; }
  }
  let mode = 'ok';
  const fakeNav = {
    mediaDevices: {
      getUserMedia(c) {
        made.constraints = c; made.ctxCreatedBeforeGUM = !!made.ctx && made.ctx.state !== 'closed';
        if (mode === 'denied') return Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' }));
        if (mode === 'notfound') return Promise.reject(Object.assign(new Error('no'), { name: 'NotFoundError' }));
        const tr = { stop() { made.tracksStopped++; }, getSettings() { return { latency: 0.012 }; }, onended: null };
        return new Promise((res) => setTimeout(() => res({ getTracks: () => [tr], getAudioTracks: () => [tr] }), mode === 'slow' ? 30 : 0));
      },
    },
  };
  const defs = (o) => { for (const k in o) Object.defineProperty(globalThis, k, { value: o[k], configurable: true, writable: true }); };
  defs({ navigator: fakeNav, AudioContext: FakeAC });
  const pump = (x, from = 0) => { let p = from; while (p + 1024 <= x.length) { made.sp.onaudioprocess({ inputBuffer: { getChannelData: () => x.subarray(p, p + 1024) } }); p += 1024; } return p; };

  mode = 'denied'; let r = await M.open(); ok(!r.ok && r.error === 'denied', 'denied permission maps to denied'); eq(made.ctxClosed, 1, 'context closed after a denied open');
  mode = 'notfound'; r = await M.open(); ok(!r.ok && r.error === 'notfound', 'missing device maps to notfound');
  defs({ isSecureContext: false }); r = await M.open(); ok(!r.ok && r.error === 'insecure', 'insecure context'); defs({ isSecureContext: true });

  mode = 'ok'; made.tracksStopped = 0; made.ctxClosed = 0;
  const [ra, rb] = await Promise.all([M.open(), M.open()]);
  ok(ra.ok && rb.ok, 'open succeeds, concurrent opens share one promise'); eq(made.ctxCount > 0, true, 'context created');
  ok(made.constraints.audio.echoCancellation === false && made.constraints.audio.noiseSuppression === false && made.constraints.audio.autoGainControl === false && made.constraints.audio.channelCount === 1, 'raw mic constraints');
  ok(made.ctxCreatedBeforeGUM, 'AudioContext is created before the permission prompt (iOS gesture rule)');
  eq(M.isOpen(), true, 'isOpen'); eq(M.sampleRate(), 44100, 'sampleRate'); near(M.latencyMs(), 12, 1e-9, 'latency from track settings');
  M.setLatencyMs(40); eq(M.latencyMs(), 40, 'manual latency override'); M.setLatencyMs(null);
  eq((await M.open()).ok, true, 'open while open is ok');

  /* frames, level, pitch */
  let got = 0, frames = [];
  const un = M.onFrame((f) => { got++; frames.push(f); });
  const tone = sine(220, 44100, 1024 * 6, 0.5);
  pump(tone);
  eq(got, 6, 'onFrame gets every frame'); ok(frames.every((f) => f === frames[0]), 'the frame buffer is reused');
  ok(M.level() > 0.2, 'level follows the signal (' + M.level().toFixed(3) + ')');
  const pn = M.pitchNow(); ok(pn.freq > 0 && Math.abs(centsOff(pn.freq, 220)) < 15, 'pitchNow ~220 Hz (' + pn.freq + ')');
  un(); pump(tone); eq(got, 6, 'unsubscribe works');
  const un2 = M.onFrame(() => { un2(); }); pump(tone.subarray(0, 1024)); pump(tone.subarray(0, 1024)); ok(true, 'unsubscribing inside a callback is safe');

  /* listen */
  const hits = [], stopListen = M.listen((h) => hits.push(h));
  {
    const rng = rngf(404), n = 44100 * 2, x = noise(n, rng); for (let i = 0; i < n; i++) x[i] *= 0.002;
    [[0.4, 0], [0.9, 2]].forEach(([t, l]) => { const s = GEN[l](44100, rng, 0), o = Math.floor(t * 44100); for (let i = 0; i < s.length; i++) x[o + i] += s[i]; });
    pump(x);
  }
  eq(hits.length, 2, 'listen reports both hits'); ok(hits.length === 2 && hits[0].lane === 0 && hits[1].lane === 2, 'listen classifies B then K: ' + hits.map((h) => h.lane));
  ok(hits.every((h) => h.strength > 0 && h.confidence > 0 && Math.abs(h.time - performance.now()) < 500), 'listen events carry strength, confidence and a performance.now time');
  stopListen();

  /* recordSample */
  {
    const rng = rngf(808), sr = 44100;
    const x = new Float32Array(sr * 3); for (let i = 0; i < x.length; i++) x[i] = (rng() - 0.5) * 0.004;
    const k = kick(sr, rng, 0); for (let i = 0; i < k.length; i++) x[sr + i] += k[i];
    const levels = [];
    const p = M.recordSample({ maxWaitMs: 2500, onLevel: (l, st) => levels.push(st) });
    pump(x);
    const res = await p;
    ok(res.ok && res.reason === 'ok' && res.sampleRate === 44100 && res.data.length > 1000, 'recordSample records the hit: ' + JSON.stringify({ ok: res.ok, reason: res.reason, n: res.data && res.data.length }));
    let pk = 0; for (const v of res.data) pk = Math.max(pk, Math.abs(v)); near(pk, 0.85, 1e-4, 'recorded sample is normalised');
    ok(res.data.length < 0.5 * sr, 'recorded sample is trimmed (' + res.data.length + ')');
    ok(levels.includes('wait') && levels.includes('rec'), 'onLevel reports the wait and rec states');
    /* timeout */
    const p2 = M.recordSample({ maxWaitMs: 500 }); pump(new Float32Array(1024 * 40));
    const r2 = await p2; ok(!r2.ok && r2.reason === 'timeout', 'silence times out');
    /* close in the middle of a recording */
    const p3 = M.recordSample({ maxWaitMs: 4000 }); pump(sine(200, 44100, 1024 * 3, 0.5));
    M.close();
    const r3 = await p3; ok(!r3.ok && r3.reason === 'closed', 'close() mid-recording resolves the recording as closed');
  }
  eq(M.isOpen(), false, 'closed'); ok(made.tracksStopped >= 1, 'close stops the mic tracks'); ok(made.ctxClosed >= 1, 'close closes the context');
  ok(made.spDisconnected >= 1 && made.srcDisconnected >= 1, 'close disconnects the nodes'); eq(made.sp.onaudioprocess, null, 'the processor callback is detached');
  const tracksBefore = made.tracksStopped; M.close(); M.close(); eq(made.tracksStopped, tracksBefore, 'double close is a no-op'); eq(M.level(), 0, 'level reset after close');

  /* close during a pending open must not leak the stream */
  mode = 'slow'; made.tracksStopped = 0;
  const pend = M.open(); M.close();
  const rp = await pend; ok(!rp.ok && rp.error === 'closed', 'close during open aborts it'); eq(made.tracksStopped, 1, 'the late stream is stopped'); eq(M.isOpen(), false, 'still closed');
  /* reopen works after all that */
  mode = 'ok'; r = await M.open(); ok(r.ok, 'can reopen'); M.close();
  delete globalThis.navigator; delete globalThis.AudioContext; delete globalThis.isSecureContext;
}

done();
