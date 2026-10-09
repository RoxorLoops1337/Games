// BBH.MicPlay: calibration, mic timing probe, lane snapping, online adaptation, silence watchdog, profile storage.
import { ok, eq, near, between, done, load } from './beatbox_heroes_lib.mjs';

const BBH = load('audio', 'mic', 'samples', 'mic_play');
const M = BBH.Mic, P = BBH.MicPlay;

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

/* ---------------------------------------------------------------- classifier on synthetic voices */
function hit(l, sr, rng, voice, hiss = 0.002, gain = 1) {
  const s = GEN[l](sr, rng, voice), buf = new Float32Array(2048), off = Math.floor(sr * 0.003 * U(rng, 0.7, 1.3));
  buf.set(s.subarray(0, Math.min(s.length, 2048 - off)), off);
  const h = noise(2048, rng);
  for (let k = 0; k < 2048; k++) buf[k] = buf[k] * gain + h[k] * hiss;
  return buf;
}

const SR = 44100;
const ev = (l, rng, voice = 0, strength = 0.8) => ({ vec: M.featureVec(hit(l, SR, rng, voice, U(rng, 0.0005, 0.003), U(rng, 0.5, 1)), SR).vec, strength });

/* ---------------------------------------------------------------- Calibrator */
{
  const rng = rngf(11), c = P.Calibrator();
  let p = c.prompt();
  eq([p.lane, p.index, p.of, p.step, p.steps], [0, 0, 4, 0, 16], 'first prompt is B 1/4 of 16');
  eq(c.add({ vec: ev(0, rng).vec, strength: 0.05 }).reason, 'quiet', 'a whisper-quiet hit is rejected');
  eq(c.add(null).reason, 'bad', 'null event rejected');
  eq(c.prompt().index, 0, 'rejects do not advance');
  for (let l = 0; l < 4; l++) for (let i = 0; i < 4; i++) {
    eq(c.prompt().lane, l, `prompting lane ${l}`);
    ok(c.add(ev(l, rng, 1)).accepted, `lane ${l} hit ${i} accepted`);
  }
  ok(c.done(), 'calibration done after 16 hits'); eq(c.prompt(), null, 'no prompt after done'); eq(c.add(ev(0, rng)).reason, 'done', 'add after done is refused');
  const r = c.result();
  ok(r.ok && r.quality >= 0.9, `separable shifted voice calibrates well (quality ${r.quality})`);
  eq(r.profiles.length, 4, 'four profiles');
  eq(r.confused, [], 'no confused pairs on separable voices');
  /* the calibrated classifier beats the default on the shifted voice */
  const def = M.makeClassifier(), mine = M.makeClassifier(r.profiles), t = rngf(99);
  let a = 0, b = 0, n = 0;
  for (let l = 0; l < 4; l++) for (let i = 0; i < 40; i++) { const e = ev(l, t, 1); n++; if (def.classify(e.vec).lane === l) a++; if (mine.classify(e.vec).lane === l) b++; }
  ok(b >= a && b / n >= 0.9, `calibrated accuracy ${(100 * b / n).toFixed(0)}% >= default ${(100 * a / n).toFixed(0)}% on a shifted voice`);
}
{
  /* a cough / different sound in the middle of lane B is rejected as odd */
  const rng = rngf(5), c = P.Calibrator({ per: 4 });
  c.add(ev(0, rng)); c.add(ev(0, rng));
  eq(c.add(ev(1, rng)).reason, 'odd', 'a hat sound during B is an outlier');
  ok(c.add(ev(0, rng)).accepted, 'a real B is still accepted');
  /* undo steps back */
  const n0 = c.progress(); c.undo(); ok(c.progress() < n0, 'undo removes the last hit');
  /* same sound for two lanes is flagged */
  const c2 = P.Calibrator({ per: 4 }), r2 = rngf(21);
  for (let l = 0; l < 4; l++) for (let i = 0; i < 4; i++) c2.add(ev(l === 3 ? 1 : l, r2));
  const res = c2.result();
  ok(res.confused.length > 0 && res.perLane[3] < 0.75 || res.perLane[1] < 0.75 || !res.ok, 'T and Pf made with the same sound are flagged');
}

/* ---------------------------------------------------------------- profile storage */
{
  const rng = rngf(3), c = P.Calibrator(); for (let l = 0; l < 4; l++) for (let i = 0; i < 4; i++) c.add(ev(l, rng));
  const r = c.result(), mem = new Map(), st = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  ok(P.saveProfile(2, r, st), 'save ok'); ok(mem.has('bbh:micprof:2'), 'stored under a per-slot key');
  const back = P.loadProfile(2, st);
  ok(back && back.profiles.length === 4, 'load round trip'); near(back.quality, r.quality, 1e-9, 'quality round trip');
  const e = ev(2, rng); eq(M.makeClassifier(back.profiles).classify(e.vec).lane, M.makeClassifier(r.profiles).classify(e.vec).lane, 'restored classifier decides like the original');
  eq(P.loadProfile(1, st), null, 'another slot has none');
  mem.set('bbh:micprof:3', '{broken'); eq(P.loadProfile(3, st), null, 'corrupt json -> null');
  mem.set('bbh:micprof:3', JSON.stringify({ v: 1, p: [{ mean: [1], std: [1] }, 1, 2, 3] })); eq(P.loadProfile(3, st), null, 'wrong shape -> null');
  P.clearProfile(2, st); eq(P.loadProfile(2, st), null, 'clear');
}

/* ---------------------------------------------------------------- LatencyProbe */
{
  const clicks = [1000, 1500, 2000, 2500, 3000, 3500], pr = P.LatencyProbe(clicks), jit = [-12, 8, 0, 15, -9, 5];
  clicks.forEach((c, i) => pr.add(c + 80 + jit[i]));
  const r = pr.result(30);
  ok(r.ok && Math.abs(r.medianMs - 80) <= 8, `lag found (${r.medianMs})`); between(r.lagMs, 105, 118, 'new total latency = current + lag');
  const bad = P.LatencyProbe(clicks); [900, 1700, 2100].forEach((t) => bad.add(t));
  eq(bad.result(30).ok, false, 'fewer than 4 pairs is not enough');
  const far = P.LatencyProbe([1000]); eq(far.add(1400), false, 'a hit far from any click is ignored');
  const wild = P.LatencyProbe(clicks); clicks.forEach((c, i) => wild.add(c + [-200, 200, -150, 190, 0, 120][i]));
  eq(wild.result(0).ok, false, 'wildly inconsistent timing is not trusted');
  const neg = P.LatencyProbe(clicks); clicks.forEach((c) => neg.add(c - 40)); eq(neg.result(10).lagMs, 0, 'never below 0');
  const dup = P.LatencyProbe([1000]); dup.add(1010); eq(dup.add(1012), false, 'one click pairs with one hit');
}

/* ---------------------------------------------------------------- in-play helpers */
{
  const notes = [{ lane: 0, t: 1.0, state: 0 }, { lane: 2, t: 1.5, state: 0 }, { lane: 1, t: 1.52, state: 1 }], tOf = (n) => n.t;
  eq(P.resolveLane({ lane: 3, confidence: 0.9 }, notes, 1.48, tOf), { lane: 3, snapped: false }, 'confident hit keeps its lane');
  eq(P.resolveLane({ lane: 3, confidence: 0.3 }, notes, 1.48, tOf), { lane: 2, snapped: true }, 'unsure hit snaps to the nearest unhit note (done notes ignored)');
  eq(P.resolveLane({ lane: 2, confidence: 0.3 }, notes, 1.48, tOf), { lane: 2, snapped: false }, 'snapping to the same lane is not a snap');
  eq(P.resolveLane({ lane: 3, confidence: 0.3 }, notes, 3.0, tOf), { lane: 3, snapped: false }, 'no note within 200 ms: keep the lane');
  eq(P.resolveLane({ lane: 1 }, notes, 1.0, tOf).lane, 0, 'missing confidence counts as unsure');
  eq(P.nearestNote(notes, 2, 1.4, tOf).note.lane, 2, 'nearestNote filters by lane'); eq(P.nearestNote([], -1, 0, tOf), null, 'nearestNote of nothing');

  const rng = rngf(8), cls = M.makeClassifier(), e = ev(0, rng);
  const good = { lane: 0, confidence: 0.95, strength: 0.7, vec: e.vec };
  eq(P.adapt(cls, good, 0, notes, 1.05, tOf), true, 'confident hit on its note teaches'); eq(cls.count(0), 1, 'one example learned');
  eq(P.adapt(cls, { ...good, confidence: 0.6 }, 0, notes, 1.05, tOf), false, 'unsure hit does not teach');
  eq(P.adapt(cls, { ...good, strength: 0.1 }, 0, notes, 1.05, tOf), false, 'quiet hit does not teach');
  eq(P.adapt(cls, good, 0, notes, 1.4, tOf), false, 'hit far from a note of its lane does not teach');
  eq(P.adapt(cls, { ...good, lane: 3 }, 0, notes, 1.05, tOf), false, 'snapped lane (event lane differs) does not teach');
  eq(P.adapt(null, good, 0, notes, 1.05, tOf), false, 'no classifier is safe');
  for (let i = 0; i < 100; i++) P.adapt(cls, good, 0, notes, 1.05, tOf); ok(cls.count(0) <= 64, 'examples stay capped');

  const w = P.Watchdog({ silenceMs: 5000 }); w.arm(0);
  eq(w.tick(4000, true), false, 'not yet'); eq(w.tick(6000, false), false, 'no notes due, no hint');
  eq(w.tick(6000, true), true, 'fires after the silence'); eq(w.tick(9000, true), false, 'only once per silence');
  w.hit(9500); eq(w.tick(12000, true), false, 'a hit resets'); eq(w.tick(15000, true), true, 'fires again after a new silence');
}

/* ---------------------------------------------------------------- start(): fake mic, calibrated profile wins */
{
  const calls = []; const fake = { open: async () => ({ ok: true }), close: () => calls.push('close'), listen: (cb, o) => { calls.push(o.classifier); return () => calls.push('unlisten'); }, setLatencyMs: (v) => calls.push('lat' + v), defaultProfiles: M.defaultProfiles, makeClassifier: M.makeClassifier, trainFromSamples: M.trainFromSamples, sampleRate: () => SR };
  const real = BBH.Mic; BBH.Mic = fake;
  const res = await P.start({ slot: 1, settings: { micLat: 90 }, onHit() {} });
  ok(res.ok && res.source === 'default', 'default voices when nothing is saved'); ok(calls.includes('lat90'), 'saved mic timing applied');
  res.stop(); ok(calls.includes('unlisten') && calls.includes('close'), 'stop unlistens and closes');
  BBH.Mic = { ...fake, open: async () => ({ ok: false, error: 'denied' }) };
  eq((await P.start({ slot: 1, settings: {}, onHit() {} })).error, 'denied', 'permission error is passed on');
  BBH.Mic = real;
}

/* ---------------------------------------------------------------- MicSetup.firstRun: asks once, never nags */
{
  Object.defineProperty(globalThis, 'navigator', { value: { mediaDevices: { getUserMedia() {} } }, configurable: true });
  load('mic_setup');
  const modals = [], saved = [];
  const mk = (settings) => { BBH.E = { settings, saveSettings: () => saved.push(JSON.stringify(settings)), h: () => ({}), modal: (m) => modals.push(m) }; };
  let nexts = 0; const next = () => nexts++;
  mk({}); BBH.MicSetup.firstRun(next);
  eq([modals.length, nexts], [1, 0], 'a new player is asked before the first set'); eq(BBH.E.settings.micAsked, true, 'and the ask is remembered');
  modals[0].buttons[0].fn(); eq([BBH.E.settings.mic, nexts], [false, 1], 'TAPS ONLY stores the choice and starts the set');
  mk({ micAsked: true }); BBH.MicSetup.firstRun(next); eq([modals.length, nexts], [1, 2], 'asked once only: next runs straight away');
  mk({ mic: true }); BBH.MicSetup.firstRun(next); eq([modals.length, nexts], [1, 3], 'a player who already uses the mic is never asked');
  mk({ mic: false }); BBH.MicSetup.firstRun(next); eq([modals.length, nexts], [1, 4], 'a player who turned the mic off is never asked');
}

done();
