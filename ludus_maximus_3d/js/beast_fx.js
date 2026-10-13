// Ludus Maximus 3D: how the fight view presents beasts (Venatio). Pure presentation: reads sim events, plays beast clips, sounds, FX, crowd and camera cues.
// fightview.js calls into this module from a few tagged BEAST hooks (rig factory, atk, hit, down, beast event, plate height, director size) so the file
// that another team owns stays almost untouched. Nothing here touches the sim or its RNG.
import * as THREE from 'three';
import { createBeast } from './beast.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** heavier beasts shrug off shoves (fightview MASS table is extended with these) */
export const MASS = { wolf: 1.3, lion: 1.8, bear: 3.2, boar: 2.4, nemean: 5, elephant: 9 };
const ATK_CLIP = { bite: 'bite', claw: 'claw', pounce: 'pounce', maul: 'maul', swipe: 'swipe', swat: 'swat', gore: 'gore' };
const HEAVY = new Set(['trample', 'stomp', 'charge', 'pounce', 'maul', 'swat', 'swipe']);
const VOICE_PITCH = { wolf: 1.15, lion: 1, bear: 0.9, boar: 1, nemean: 0.78, elephant: 1 };
const NAME = { lion: 'The lion', wolf: 'The wolf', bear: 'The bear', boar: 'The boar', nemean: 'The Nemean Lion', elephant: 'The war elephant' };

/** build the rig for a beast unit (fightview calls this instead of createGladiator) */
export function makeRig(view, u) { return createBeast(u, { detail: view.tier }); }

/** after fightview has created the fighter record: paw thuds on the big ones, per-fighter state */
export function setup(view, f, u) {
  const rig = f.rig, size = rig.size || 1, prev = rig.onEvent;
  f.beast = true;
  if (size >= 1.3) rig.onEvent = (n, c) => { if (prev) prev(n, c); if (n === 'step' && !view.silent && view.phase === 'fight') { const d = view.camera.position.distanceTo(rig.root.position); if (d < 26) { view.audio.sfx('pawThud', { pitch: 1.1 / Math.sqrt(size), gain: clamp(0.5 + size * 0.14, 0.4, 1) * (1 - d / 30), pan: clamp(rig.root.position.x / 12, -1, 1) }); if (size >= 2 && d < 20) view.feel.addTrauma && view.feel.addTrauma(0.03 * size); } } };
}

/** 'atk' event from a beast: pick the clip and sync its hit frame to the sim's windup */
export function atk(view, e, src, dst, fs) {
  if (!fs) return; const an = fs.rig.animator, kind = e.beast || 'bite', name = ATK_CLIP[kind] || 'bite', info = an.clipInfo(name) || { hitAt: 0.3 };
  const wind = e.w || 0.22, speed = kind === 'pounce' ? 1 : clamp(info.hitAt / Math.max(0.1, wind), 0.7, 2.6);
  an.mode = an.mode === 'charge' && kind !== 'pounce' ? '' : an.mode; an.release(); an.play(name, { speed }); fs.rig.squashKick(-0.05);
  if (dst && (kind === 'claw' || kind === 'swipe' || kind === 'swat' || kind === 'maul')) { const dir = view.dirOf(src, dst); view.fx.later(wind * 0.45, () => { if (!view.F.done) view.fx.slash(view.chest(src, 0.9 * (fs.rig.size || 1)), dir, '#f0e6d0', 1.6 + (fs.rig.size || 1) * 0.5); }); }
  if (kind === 'pounce') view.audio.sfx('beastGrowl', { kind: src.beast, pitch: VOICE_PITCH[src.beast], pan: clamp(src.x / 12, -1, 1) });
}

/** extra sound / dust for 'hit' events that involve a beast (the generic code still does numbers, gore, shove and camera shake) */
export function hitFx(view, e, src, dst, fd) {
  const A = view.audio, tag = e.tech || 'bite', pan = clamp(dst.x / 12, -1, 1);
  if (src && src.beast) {
    const snd = tag === 'claw' || tag === 'swipe' || tag === 'swat' ? 'beastClaw' : tag === 'gore' ? 'beastGore' : tag === 'bite' || tag === 'maul' ? 'beastBite' : tag === 'javelin' ? 'spearThrust' : 'beastSlam';
    A.sfx(snd, { pan, pitch: 1 / Math.sqrt(Math.max(0.6, (view.fm.get(src.id) || { rig: {} }).rig.size || 1)) });
    if (HEAVY.has(tag)) { view.fx.dust(view.feet(dst), 7); view.feel.addTrauma && view.feel.addTrauma(0.1 + (src.boss ? 0.1 : 0)); }
    if (Math.random() < 0.25 && tag !== 'javelin') A.sfx('beastGrowl', { kind: src.beast, pitch: VOICE_PITCH[src.beast], pan: clamp(src.x / 12, -1, 1), gain: 0.6 });
  }
  if (dst.beast && Math.random() < 0.6) A.sfx('beastHurt', { kind: dst.beast, pitch: VOICE_PITCH[dst.beast], pan });
}

/** a beast died: its own death cry and the heavy thud, a camera nudge for the big ones */
export function down(view, dst) {
  const A = view.audio, pan = clamp(dst.x / 12, -1, 1), big = dst.boss;
  A.sfx('beastDeath', { kind: dst.beast, pitch: VOICE_PITCH[dst.beast], pan, gain: big ? 1.1 : 0.9 });
  view.after(big ? 900 : 450, () => A.sfx('beastSlam', { pan, gain: big ? 1 : 0.7, pitch: big ? 0.7 : 1 }));
  if (big) { view.feel.addTrauma && view.feel.addTrauma(0.35); view.banner(`${NAME[dst.beast] || dst.name} falls!`, 'ult'); A.sfx('crowdRoar', { gain: 0.9 }); }
  else A.sfx('crowdGasp', { gain: 0.8 });
}

/** the sim's own 'beast' events: roar, howl, enrage, telegraph, charge, land, stomp, javelin, winded */
export function event(view, e, src, dst, fs, fd) {
  if (!src) return; const A = view.audio, fx = view.fx, feel = view.feel, kind = src.beast, pan = clamp(src.x / 12, -1, 1), an = fs && fs.rig.animator, size = (fs && fs.rig.size) || 1;
  switch (e.a) {
    case 'roar': case 'howl':
      if (an) { an.release(); an.play(e.a === 'howl' ? 'howl' : 'roar'); }
      A.sfx(e.a === 'howl' ? 'beastHowl' : 'beastRoar', { kind, pitch: VOICE_PITCH[kind], pan });
      if (size >= 1.5) { feel.addTrauma && feel.addTrauma(0.22); feel.impact && feel.impact('roar', {}); view.banner(`${src.name} roars`, 'info'); A.sfx('crowdGasp', { gain: 0.9 }); }
      else if (e.r > 0) feel.addTrauma && feel.addTrauma(0.08);
      if (e.r > 0) { fx.ring(view.feet(src), '#e8d9b0', e.r * 0.8); fx.dust(view.feet(src), 10); }
      view.recent += 0.3; break;
    case 'enrage':
      if (an) { an.release(); an.play('roar', { speed: 1.25 }); }
      A.sfx('beastRoar', { kind, pitch: VOICE_PITCH[kind] * 1.05, pan, gain: 1.15 }); feel.impact && feel.impact('roar', {}); feel.addTrauma && feel.addTrauma(0.25);
      view.banner(`${NAME[kind] || src.name} goes wild!`, 'ult'); fx.ring(view.feet(src), '#d2412b', 2.6); fx.shockwave && fx.shockwave(view.feet(src), 2.6 * size, '#d2412b');
      A.sfx('crowdRoar', { gain: 0.8 }); view.arena.setWave && view.arena.setWave(1); view.after(3000, () => view.arena.setWave && view.arena.setWave(0)); view.recent += 0.6; break;
    case 'telegraph': { // the charge: paw the ground, a red lane on the sand
      if (an) { an.release(); an.play('paw'); }
      const tgt = new THREE.Vector3(e.x, 0.05, e.y); const h = fx.tele(tgt, Math.max(1.4, e.r * 1.4), 0.75, '#d2412b'); (view.teles = view.teles || []).push(h);
      A.sfx('beastSnort', { pan, pitch: size >= 1.5 ? 0.7 : 1 }); if (size >= 2) A.sfx(kind === 'elephant' ? 'beastRoar' : 'beastGrowl', { kind, pan, pitch: 1.1 }); break; }
    case 'charge': if (an) { an.release(); an.mode = 'charge'; } A.sfx('beastCharge', { pan, pitch: size >= 1.5 ? 0.7 : 1 }); feel.addTrauma && feel.addTrauma(0.08); break;
    case 'winded': if (an) an.mode = ''; fx.dust(view.feet(src), 12); break;
    case 'land': fx.dust(view.feet(src), 14); fx.ring(view.feet(src), '#c9b79c', 2); A.sfx('beastSlam', { pan, gain: 0.8 }); feel.addTrauma && feel.addTrauma(0.12); break;
    case 'stomp': if (an) { an.release(); an.play('stomp'); } A.sfx('beastRoar', { kind, pitch: 1.2, pan, gain: 0.7 }); view.after(550, () => A.sfx('beastSlam', { pan, pitch: 0.6, gain: 1 })); break;
    case 'javelin': if (an) an.play('javelin'); A.sfx('swish', { pan, heavy: true, pitch: 1.2 }); if (dst) view.after(300, () => A.sfx('spearThrust', { pan: clamp(dst.x / 12, -1, 1), gain: 0.7 })); break;
    default: break;
  }
}

/** demo / bot helper: a hunt fight without the management layer. o: {hunt: 'lion'|'wolves'|..., lvl, team (party size), auto}. Used by main.js ?demo=1&hunt=... */
export function demoHunt(o = {}) {
  const LM = globalThis.LM, D = globalThis.LM_D, id = D.HUNTS[o.hunt] ? o.hunt : 'lion', h0 = D.HUNTS[id], lvl = o.lvl || 6;
  const styles = ['murmillo', 'thraex', 'hoplomachus', 'retiarius', 'dimachaerus'], n = Math.max(1, Math.min(3, o.team || h0.party));
  const party = Array.from({ length: n }, (_, i) => LM.makeGlad({ style: styles[i % 5], lvl, id: 1 + i, name: ['Spartacus', 'Crixus', 'Varro'][i], r: LM.mulberry(31 + i) }));
  const S = { seed: 'demo', week: 1, fame: 0 }, hunt = Object.assign({ id, key: 'demo:' + id, lvl }, h0), beasts = LM.huntBeasts(S, hunt);
  const F = LM.createFight(LM.mkUnits(party, 'A', {}), LM.mkUnits(beasts, 'B', {}), { autoA: o.auto !== false });
  F.meta = { weather: 'clear', odds: 0.5, stB: 'bal', league: 0, season: 1, title: h0.n, kind: 'hunt', festival: '', theme: '' };
  return F;
}
