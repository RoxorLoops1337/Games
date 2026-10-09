// VIGNETTES: THE BAR (world 'bar', owner VIG town crew). VIGNETTES.md 2.12: the stage walk up before a set (open mic, showcase, karaoke), the bow after it, the battle walk out
// and the verdict back in the room, the juice bar (Rohzel serves every food: the green juice slides down the counter and stops exactly at you), the dishes job, mingling with the
// regulars (juice, napkin, lip roll, trading bars, the awkward silence), the date, and the bar's refusals. The story films (firstWin, firstLoss, firstShowcase, champion) own their
// moments: r3/vig.js never starts a stage OUT or a verdict while a film plays or after one played on that return.
// Staging (bar.js, metres, +z toward the gameplay camera; face 0 = +z (the room), 90 = +x, 180 = north, -90 = west). Cameras stay inside the room (x -5.6..5.6, z -4.6..5.0):
//   counter along the west wall x -4.75..-4.0, z -4.0..1.9, top 1.05; stools at x -3.4 (z -3.3 -2.4 -1.5 -0.6 0.3 1.2, seat 0.68); Rohzel's mark (-5.0,-0.7) faces east;
//   the back bar x -5.97..-5.4 (top 0.95) with the green juice machine at z -2.2
//   stage x 1..6, z -5..-2.5, deck 0.38; the house mic stand (3.5,-3.35); the LED wall over the stage (centre x 3.5, y 1.67, z -4.85); the stage spot (3.5,-1.65) faces the stage
//   regulars: regular0 on the banquette (-3.2,-4.42) facing south, regular1 at the first table (-1.95,-1.25) facing east (table (-1.15,-1.25), top 0.75), regular2 on counter stool (-3.4,-2.4)
//   the jukebox on the north wall (-0.15,-4.62); the dance floor and the crowd x 0.3..5.7, z -2.2..1.5
import { cue, shot, clip, place, face, look, mood, sfx, drum, word, say, stamp, call, ref, spawn, hold, put, gone, withProp, anim, BEAT } from './vignette_kit.js';
import { food, glass, mug, steam, bowlOats, bowlBurrito, tub, HAND, TABLE } from './vignette_props.js';
import { juice, napkin, bottle, clipboard, apron, sink, glassStack, jacket, envelope, cash, moth } from './vig_town_props.js';
import { H, reel, S, xf, cam, MICRO, micro1, trm, coins, fullFrame, follow, show, npc, regularSlot, bbh } from './vig_town_kit.js';

const R0 = 'rohzel', DECK = 0.38, TOPC = 1.05;
const STAGE = { mark: [3.5, -3.0], spot: [3.5, -1.65], steps: [3.5, -2.2], stand: [3.5, -3.35], wing: [1.45, -3.9] };
// the stage coverage: low from the floor (the LED wall behind), the room over the hero's shoulder, the back of the room, the LED wall
const STAGE_LOW = (o) => shot(Object.assign({ on: H, rel: false, yaw: -10, w: 1.6, h: 0.6, lookH: 1.4, fov: 40 }, o));
const STAGE_OTS = (o) => cam([4.6, 2.5, -4.75], [2.9, 0.55, 0.6], 56, o);
const STAGE_SIDE = (o) => cam([5.6, 1.7, -2.15], [3.5, 1.3, -2.3], 44, o);
const ROOM_SE = (o) => cam([5.2, 2.2, 2.6], [3.3, 1.4, -3.0], 40, o);
const ROOM_BACK = (o) => cam([1.8, 2.6, 4.6], [3.5, 1.2, -3.2], 38, o);
const LED_WALL = (o) => cam([3.5, 1.75, -1.0], [3.5, 1.67, -4.85], 46, o);
const api = (ctx) => (ctx.world.terrain && ctx.world.terrain.api) || ctx.world.bar || null;
const led = (ctx) => ctx.world.terrain && ctx.world.terrain.led;
// the room keeps its programme: the LED wall, the energy and the theme come back at the end
function keepRoom(ctx) {
  const a = api(ctx); if (!a) return; let st = null; try { st = a.state(); } catch (e) { st = null; }
  ctx.own(() => { try { a.setLyrics(null); if (st) { a.setEnergy(st.energy); a.setTheme(st.theme); } } catch (e) { /* ignore */ } });
}
const ledText = (ctx, lines, o) => call(() => { try { const l = led(ctx); if (l) l.text(lines, Object.assign({ bg: ['#34166e', '#0f0826'], rays: ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0)'] }, o || {})); } catch (e) { /* ignore */ } });
const energy = (ctx, v) => call(() => { try { const a = api(ctx); if (a) a.setEnergy(v); } catch (e) { /* ignore */ } });
// the five judges' votes on the LED wall, lit one per beat: cyan for the hero, red for the opponent
function ledVotes(ctx, votes, n, names) {
  return call(() => { try { const l = led(ctx); if (!l) return; l.draw((g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2a1058'); gr.addColorStop(1, '#0d0722'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 ' + Math.round(h * 0.16) + 'px sans-serif'; g.fillStyle = '#2ee6ff'; g.fillText(names[0], w * 0.25, h * 0.18); g.fillStyle = '#ff4f6a'; g.fillText(names[1], w * 0.75, h * 0.18);
    for (let i = 0; i < 5; i++) { const v = votes[i], on = i < n, x = w * (0.14 + i * 0.18), y = h * 0.6, r = h * 0.15; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = !on ? '#2b2440' : v && v.forPlayer ? '#2ee6ff' : '#ff4f6a'; g.shadowColor = g.fillStyle; g.shadowBlur = on ? r : 0; g.fill(); g.shadowBlur = 0; if (on && v) { g.fillStyle = '#17102b'; g.font = '900 ' + Math.round(r) + 'px sans-serif'; g.fillText(v.forPlayer ? 'Y' : 'O', x, y + 1); } }
    g.fillStyle = 'rgba(15,8,35,.22)'; for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1); for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1, h);
  }); } catch (e) { /* ignore */ } });
}
const nameOf = (ctx) => String(ctx.name || 'You').toUpperCase().slice(0, 12);

// ======================================================================= THE STAGE: the walk up (INTRO, ends on the venue's first frame)
function stageIn(ctx, kind) {
  const f = ctx.form, R = reel(), cb = ref(), wb = ref(), first = f === 'first', nm = nameOf(ctx);
  if (MICRO(f)) { R.at(0, clip(H, 'v_micup', { eyes: false })).at(0.3, drum('K'), ctx.PAY).end(0.7); return { events: R.list(), letterbox: false, hide: false, max: 2 }; }
  keepRoom(ctx); R.at(0, fullFrame(ctx));
  let t = 0;
  if (kind === 'openmic') {
    // 1 Rohzel at the side of the stage with the sign up clipboard: "next up..." into the house mic
    R.at(0, place(R0, [2.2, -2.15], 120), clip(R0, 'v_hold', { y: 0.95, z: 0.3, look: 1 }), spawn(ctx, cb, () => clipboard(['Big Mo', 'Tess', 'DJ Pea', nm]), [2.2, 1, -2.15]), hold(ctx, cb, R0, { aim: 'face' }),
      place(H, STAGE.spot, 180), S('ms', -30, { w: 1.6, h: 1.5, lookH: 1.1, fov: 40, to: { w: 1.4 }, dur: 2 }, R0), ledText(ctx, [{ t: 'OPEN MIC', c: '#35f2e0' }, { t: 'NEXT: ' + nm, c: '#ffd8a0', k: 0.6 }]));
    R.at(0.2, say(R0, first ? 'Next up... a new name. ' + nm + '.' : 'Next up: ' + nm + '.', { dur: first ? 1.9 : 1.3 }));
    t = first ? 2.0 : 1.4;
  } else if (kind === 'showcase') {
    // 1 backstage by the curtain: the name in gold on the LED wall, Rohzel hands over a water bottle (two shot, over her shoulder)
    R.at(0, place(H, [3.35, -3.45], -110, { y: DECK }), place(R0, [2.7, -3.75], 70, { y: DECK }), clip(R0, 'v_offer', { to: 0.5 }), spawn(ctx, wb, bottle, [2.7, 1, -3.75]), hold(ctx, wb, R0, { hand: 'R', aim: 'up', back: -0.05 }),
      ledText(ctx, [{ t: nm, c: '#ffd35c', k: 1.1 }, { t: 'SHOWCASE', c: '#ffb070', k: 0.55 }], { rays: ['rgba(255,214,90,0.12)', 'rgba(255,255,255,0)'] }), cam([0.6, 2.6, -0.3], [3.0, 1.3, -3.6], 40, { to: { pos: [0.7, 2.5, -0.7] }, dur: 1.8 }));
    R.at(0.55, hold(ctx, wb, H, { aim: 'up', back: -0.05 }), clip(H, 'v_hold', { y: 0.95, z: 0.3, look: 0.2 }), clip(R0, 'v_nod', { n: 1 }), first ? say(R0, 'Big room tonight. Breathe.', { dur: 1.4 }) : null);
    t = first ? 1.9 : 1.2;
  } else {
    // 1 karaoke: the LED wall scrolls the lyrics, a regular whoops from a table
    R.at(0, place(H, STAGE.mark, 0, { y: DECK }), ledText(ctx, [{ t: 'B . t . K . t .', c: '#a6ff3d' }, { t: 'sing it back!', c: '#cfe8ff', k: 0.6 }], { bg: ['#1b0a46', '#0b0620'] }), ROOM_BACK({ to: { pos: [2.0, 2.5, 4.2] }, dur: 1.6 }));
    R.at(0.5, clip('regular1', 'cheer'), word('WOOO', [0.3, 0.55], { size: 3.6, color: '#a6ff3d', ms: 700 }), sfx('crowd_cheer', { quiet: true }));
    t = 1.1;
  }
  // 2 the steps: on the deck (a jump cut), the house stand is always too low; the hero pats it, raises their own mic. "Brought my own."
  if (kind !== 'karaoke') R.at(t, gone(ctx, cb), place(R0, [5.3, -1.8], -60), place(H, STAGE.mark, 0, { y: DECK }), STAGE_LOW(xf(260)), clip(H, 'v_pat', { y: 1.05, z: 0.2, x: 0.25, n: 2 }), look(H, [STAGE.stand[0], 1.0, STAGE.stand[1]]), sfx('step', { pitch: 0.9 }), drum('t', { vel: 0.4 }));
  else R.at(t, STAGE_LOW(xf(260)), clip(H, 'v_micup', { eyes: false }));
  if (kind === 'karaoke') R.at(t + 0.3, drum('t'), word('tap', [0.42, 0.42], { size: 3, color: '#fff6e8', ms: 360 })).at(t + 0.6, drum('t'), word('tap', [0.58, 0.38], { size: 3, color: '#fff6e8', ms: 360 }));
  else R.at(t + 0.75, look(H, null), clip(H, 'v_micup', { eyes: false, tremor: ctx.pre && ctx.pre.energy < 30 }), mood(H, 'neutral'), first ? word('own mic', [0.5, 0.3], { size: 2.8, color: '#ffd35c', ms: 700 }) : null);
  t += kind === 'karaoke' ? 0.9 : 1.35;
  // 3 the showcase: the downbeat and the pyro; the others: the room hushes, the lights come down to the stage
  if (kind === 'showcase') R.at(t, ROOM_SE(xf(200)), drum('B'), cue('flash', { color: '#ffd35c', ms: 200 }), cue('fx', { kind: 'sparks', at: [1.4, DECK + 0.1, -2.6], color: '#ffd35c', n: 60 }), cue('fx', { kind: 'sparks', at: [5.6, DECK + 0.1, -2.6], color: '#ffd35c', n: 60 }), cue('shake', { amp: 0.04, dur: 0.4 }), energy(ctx, 0.95), sfx('crowd_cheer'));
  else R.at(t, cue('cone', { id: 'key', at: [3.5, 3.2, -2.4], to: 'hero', color: '#ffe0f0', r: 0.75, v: 1, ms: 200 }), drum('K', { vel: 0.7 }), energy(ctx, 0.2));
  R.at(t + 0.35, ctx.PAY).end(t + 0.6);
  return { events: R.list(), holdSync: true };
}

// ======================================================================= THE STAGE: the bow after the set (back in the room: plays after the result card)
function stageOut(ctx) {
  const f = ctx.form, R = reel(), fx = (ctx.fx || []).find((x) => x.t === 'result') || {}, kind = fx.kind || (ctx.action && ctx.action.kind) || 'openmic', rk = (fx.res && fx.res.rank) || 'B', env = ref();
  const great = rk === 'S' || rk === 'A', flop = rk === 'D', cashN = Math.min(5, Math.max(1, Math.round(((fx.rw && fx.rw.cash) || 6) / 6)));
  if (MICRO(f)) { R.at(0, clip(H, 'v_bow', { hold: 0.3 })).at(0.4, drum(great ? 'K' : 't'), sfx(great ? 'crowd_cheer' : 'applause', { quiet: true }), ctx.PAY).end(1.0); return { events: R.list(), letterbox: false, hide: false, max: 2 }; }
  keepRoom(ctx); R.at(0, fullFrame(ctx), place(H, STAGE.mark, 0, { y: DECK }));
  let t = 0;
  if (flop) {
    // D: the room is busy with its drinks. One slow clap from the back: it is Rohzel. It is supportive
    R.at(0, STAGE_OTS({ to: { pos: [3.9, 2.0, -4.3] }, dur: 2.4 }), clip(H, 'idle'), mood(H, 'sad'), energy(ctx, 0.15), place(R0, [-0.4, 3.9], 160), clip(R0, 'v_clap', { slow: true }));
    [0, 1, 2].forEach((i) => R.at(0.5 + i * 0.9, drum('Pf', { vel: 0.5 }), word('clap', [0.3 + i * 0.12, 0.6], { size: 2.6, color: '#ffbe55', ms: 500 })));
    R.at(1.6, S('cu', 0, { h: 1.3, lookH: 1.25, fov: 34, w: 0.95 }), mood(H, 'neutral')).at(2.4, mood(H, 'happy'), clip(H, 'v_nod', { n: 1 }), ctx.PAY);
    R.end(f === 'short' ? 2.8 : 3.2);
    return { events: R.list(), holdSync: true };
  }
  // S / A: the crowd wave and the bow; B / C: the bow and applause. The tips come in as coins on the beat
  R.at(0, STAGE_LOW({ to: { w: 1.9 }, dur: 1.8 }), clip(H, 'v_bow', { deep: great, hold: 0.8 }), mood(H, 'happy'), sfx(great ? 'crowd_cheer' : 'applause'), energy(ctx, great ? 1 : 0.6));
  if (great) R.at(0.3, cue('fx', { kind: 'confetti', at: [3.5, 2.8, -2.4], n: 90 }), drum('B'));
  t = 1.4;
  if (f !== 'short') { R.at(t, ROOM_BACK(xf(260)), clip(H, great ? 'cheer' : 'wave')); t += 1.0; }
  coins(R, ctx, t - 0.6, cashN, 'hero:top');
  if (kind === 'showcase') {
    // the cash envelope, handed up to the stage with both hands (respect)
    R.at(t, place(R0, [3.5, -2.0], 180), clip(R0, 'v_present', { to: 0.5 }), spawn(ctx, env, envelope, [3.5, 1.0, -2.2]), hold(ctx, env, R0, { aim: 'up', back: -0.05 }), clip(H, 'v_bow', { hold: 0.5 }),
      STAGE_SIDE(xf(260)));
    R.at(t + 0.6, hold(ctx, env, H, { aim: 'up', back: -0.05 }), clip(H, 'v_hold', { y: 0.95, z: 0.3, look: 0.6 }), clip(R0, 'v_nod', { n: 1, deep: true }), drum('K'), withProp(env, (p) => p.userData.open(1)));
    t += 1.3;
  }
  R.at(t, ctx.PAY).end(t + 0.4);
  return { events: R.list(), holdSync: true };
}

// ======================================================================= BATTLES: the walk out (INTRO, ends in the arena) and the verdict back in the room
const OPP = 'opp';
const oppOf = (ctx) => { const a = ctx.action && ctx.action.args, o = (a && (a.opp || a.finalOpp)) || null; if (o) return o; const fx = (ctx.fx || []).find((x) => x.t === 'battleResult'); try { const C = bbh().Core; return (fx && C && C.OPPONENTS.find((x) => x.id === fx.opp)) || (C && C.OPPONENTS[0]) || null; } catch (e) { return null; } };
function walkout(ctx) {
  const f = ctx.form, R = reel(), o = oppOf(ctx) || { name: 'RIVAL', id: 'x' }, oname = String(o.name || 'RIVAL').toUpperCase(), rematch = !!(ctx.ch && ctx.ch.beat && ctx.ch.beat[o.id]), shaky = ctx.pre && ctx.pre.energy < 30;
  if (MICRO(f)) { R.at(0, clip(H, 'v_micup', { eyes: true, tremor: shaky })).at(0.4, drum('K'), ctx.PAY).end(0.8); return { events: R.list(), letterbox: false, hide: false, max: 2 }; }
  keepRoom(ctx); R.at(0, fullFrame(ctx), cue('spawn', { id: OPP, look: o.look || 'pigpen', at: [2.25, -3.55], face: 90, clip: 'idle' }), place(H, [4.75, -3.55], -90, { y: DECK }), place(OPP, [2.25, -3.55], 90, { y: DECK }), energy(ctx, 0.7));
  let t = 0;
  if (f !== 'short') {
    // 1 the opponent steps into the light (the taunt was said; now the stare). A rematch: a nod of respect instead
    R.at(0, S('ms', -25, { w: 1.5, h: 1.45, lookH: 1.15, fov: 40, to: { w: 1.25 }, dur: 1.6 }, OPP), cue('cone', { id: 'opp', at: [2.25, 3.2, -3.0], to: OPP, color: '#ff4f6a', r: 0.75, v: 1, ms: 250 }), mood(OPP, rematch ? 'happy' : 'angry'),
      clip(OPP, rematch ? 'v_nod' : 'battle', rematch ? { n: 1, deep: true } : { bpm: 100 }), drum('B', { vel: 0.8 }), stamp(oname + '|' + (o.tier ? 'TIER ' + o.tier : 'RIVAL'), 1200));
    t = 1.55;
  }
  // 2 CU the hero does not answer. A single breath. The mic comes up (a shaky hand when they are running on empty)
  R.at(t, stamp(''), S('cu', 18, Object.assign({ h: 1.35, lookH: 1.25, w: 0.95, fov: 34, to: { w: 0.85 }, dur: 1.2 }, f === 'short' ? {} : xf(240))), clip(H, 'v_micup', { eyes: true, tremor: shaky }), mood(H, rematch ? 'happy' : 'neutral'),
    cue('cone', { id: 'hero', at: [4.75, 3.2, -3.0], to: 'hero', color: '#2ee6ff', r: 0.75, v: 1, ms: 250 }), sfx('swoosh', { pitch: 0.35, quiet: true }));
  t += f === 'short' ? 0.7 : 1.25;
  // 3 whip to the LED wall: VS, both names, the judges are waiting
  R.at(t, LED_WALL({ cut: 'whip', ms: 240 }), ledText(ctx, [{ t: nameOf(ctx), c: '#2ee6ff', k: 0.8 }, { t: 'VS', c: '#ffd35c', k: 1.2 }, { t: oname, c: '#ff4f6a', k: 0.8 }], { bg: ['#2a0a3a', '#0b0620'] }), drum('K'), cue('shake', { amp: 0.035, dur: 0.3 }), energy(ctx, 1), sfx('crowd_cheer', { quiet: true }));
  R.at(t + 0.4, ctx.PAY).end(t + 0.7);
  return { events: R.list(), holdSync: true };
}
function verdict(ctx) {
  const f = ctx.form, R = reel(), bf = (ctx.fx || []).find((x) => x.t === 'battleResult') || {}, out = bf.out || { win: true, votes: [] }, o = oppOf(ctx) || { name: 'RIVAL', id: 'x' }, win = !!out.win;
  const votes = (out.votes && out.votes.length ? out.votes : [1, 1, 1, 0, 0].map((x) => ({ forPlayer: win ? !!x : !x }))).slice(0, 5), n4 = votes.filter((v) => v.forPlayer).length, sweep = n4 === 5, split = n4 === 3 || n4 === 2;
  const names = [nameOf(ctx), String(o.name || 'RIVAL').toUpperCase()];
  if (MICRO(f)) { R.at(0, clip(H, win ? 'cheer' : 'sad')).at(0.4, drum(win ? 'K' : 'Pf'), ctx.PAY).end(1.0); return { events: R.list(), letterbox: false, hide: false, max: 2 }; }
  keepRoom(ctx); R.at(0, fullFrame(ctx), place(H, [4.95, -3.0], -20, { y: DECK }), cue('spawn', { id: OPP, look: o.look || 'pigpen', at: [2.05, -3.0], face: 20, clip: 'idle' }), place(OPP, [2.05, -3.0], 20, { y: DECK }), energy(ctx, 0.3), ledVotes(ctx, votes, 0, names));
  // 1 the LED wall counts the five votes, one per beat (a kick for the hero, a snare for the opponent); a 3-2 split holds an extra beat before the last; a sweep lands at once
  R.at(0, cam([3.5, 1.85, 0.9], [3.5, 1.6, -4.6], 40, { to: { pos: [3.5, 1.8, 0.4] }, dur: 3.2 }));
  const step = BEAT, t0 = 0.5;
  if (sweep) R.at(t0, ledVotes(ctx, votes, 5, names), drum('K'), drum('B'), cue('flash', { color: '#2ee6ff', ms: 160 }));
  else votes.forEach((v, i) => R.at(t0 + i * step + (split && i === 4 ? step : 0), ledVotes(ctx, votes, i + 1, names), drum(v.forPlayer ? 'K' : 'Pf'), sfx(v.forPlayer ? 'hit_good' : 'miss', { quiet: true })));
  let t = t0 + (sweep ? 1.0 : 5 * step + (split ? step : 0) + 0.25);
  // 2 the result: a win lifts the room (a sweep rains confetti); a loss: one beat of sad, then the hand offered (Pig Pen walks off the first time)
  if (win) {
    R.at(t, S('fs', -12, Object.assign({ h: 1.0, lookH: 1.2, w: 2.0, fov: 40 }, xf(240))), clip(H, 'cheer'), mood(H, 'happy'), energy(ctx, 1), sfx('crowd_cheer'), say(OPP, o.defeat || 'Respect.', { dur: 1.3, name: String(o.name || 'RIVAL').toUpperCase(), color: '#ff4f6a' }), mood(OPP, 'sad'), clip(OPP, 'v_shrug'));
    if (sweep) R.at(t, cue('fx', { kind: 'confetti', at: [3.4, 2.9, -2.6], n: 110 }));
    R.at(t + 0.5, word(names[0] + '!', [0.5, 0.25], { size: 3.6, color: '#2ee6ff', ms: 700 })).at(t + 1.0, word(names[0] + '!', [0.4, 0.32], { size: 3.2, color: '#ffd35c', ms: 700 }));
    t += 1.6;
  } else {
    const pig = o.id === 'pigpen' && !(ctx.ch && ctx.ch.flags && ctx.ch.flags.pigShook);
    R.at(t, S('ms', -20, Object.assign({ h: 1.4, lookH: 1.1, w: 1.5, fov: 38 }, xf(240))), clip(H, 'sad'), mood(H, 'sad'), energy(ctx, 0.2));
    R.at(t + BEAT * 1.5, place(H, [4.1, -3.0], -90, { y: DECK }), place(OPP, [2.9, -3.0], 90, { y: DECK }), clip(H, 'v_offer', { to: 0.5 }), mood(H, 'neutral'), cam([3.5, 1.75, 0.2], [3.5, 1.3, -3.0], 40, xf(260)));
    if (pig) R.at(t + BEAT * 2.6, face(OPP, -120, 400), clip(OPP, 'v_no', { n: 2 }), mood(OPP, 'angry')).at(t + BEAT * 3.6, clip(H, 'v_shrug'));
    else R.at(t + BEAT * 2.6, clip(OPP, 'v_offer', { to: 0.5 }), mood(OPP, 'happy'), drum('t', { vel: 0.6 }), word('respect', [0.5, 0.3], { size: 3, color: '#ffd35c', ms: 700 }));
    t += BEAT * 4.2;
  }
  R.at(t, ctx.PAY).end(t + (f === 'short' ? 0.3 : 0.6));
  return { events: R.list(), holdSync: true };
}

// ======================================================================= THE JUICE BAR (every food: Rohzel serves at the counter)
const SEAT_C = [-3.4, -0.6], SEAT_Y = 0.68, COUNTER_X = -4.18, MACHINE = [-5.25, -2.2];
const OVER_COUNTER = (o) => S('mcu', -28, Object.assign({ w: 1.45, h: 1.6, lookH: 1.1, fov: 40 }, o), R0);   // over the hero's shoulder onto Rohzel
const BEHIND_BAR = (o) => cam([-5.6, 1.95, -1.25], [-3.45, 1.05, -0.6], 62, o);                              // the reverse, from the back bar onto the hero
const COUNTER_SIDE = (o) => cam([-1.35, 1.95, 1.75], [-4.0, 1.1, -1.2], 42, o);
function counterBase(ctx, R) { R.at(0, place(H, SEAT_C, -90, { y: 0 }), clip(H, 'sit', { seat: SEAT_Y, slump: 0.6 }), place(R0, [-4.95, -0.62], 90), clip(R0, 'v_polish')); }
// a drink slides down the counter top from the machine end and stops exactly at the hero (the stop is a kick)
function slideDown(ctx, R, t, r, make, z0, dur) {
  R.at(t, spawn(ctx, r, make, [COUNTER_X, TOPC, z0]), anim(ctx, (T) => { const o = r.obj; if (!o || r.follow && r.follow.on) return; const u = Math.min(1, T / (dur || 0.8)), e = 1 - Math.pow(1 - u, 3); o.position.set(COUNTER_X, TOPC, z0 + (SEAT_C[1] - z0) * e); o.rotation.y = u * 2; }), sfx('swoosh', { pitch: 0.5 }));
  R.at(t + (dur || 0.8), drum('K'), word('stop', [0.5, 0.56], { size: 2.6, color: '#9dff4a', ms: 400 }));
}
const DRINK = { smoothie: 1, tea: 1 };
function barEat(ctx, kind) {
  const f = ctx.form, R = reel(), it = ref(), ut = ref(), st = ref(), first = f === 'first', drink = !!DRINK[kind];
  if (MICRO(f)) {
    R.at(0, spawn(ctx, it, () => food(drink ? kind : kind === 'banana' ? 'banana' : kind === 'dates' ? 'dates' : 'spoon'), [SEAT_C[0], 1, SEAT_C[1]]), hold(ctx, it, H, { aim: 'up', back: drink ? -0.1 : -0.05 }));
    if (kind === 'banana') R.at(0, withProp(it, (p) => p.userData.peel(1)));
    R.at(0, clip(H, drink ? 'v_drink' : 'v_eat', drink ? { at: 0.3, gulp: 0.4 } : { bites: 1, every: 0.75, lead: 0.02 })).at(0.34, sfx(drink ? 'swoosh' : 'eat', { pitch: drink ? 0.6 : 1 }), drum('B'), ctx.PAY).end(0.85);
    return { events: R.list(), letterbox: false, hide: false, max: 2 };
  }
  R.at(0, fullFrame(ctx)); counterBase(ctx, R);
  let t = 0;
  const bowl = kind === 'oats' || kind === 'bowl', make = kind === 'smoothie' ? () => juice() : kind === 'tea' ? () => { const g = mug(); g.scale.setScalar(HAND); return g; } : kind === 'oats' ? bowlOats : kind === 'bowl' ? bowlBurrito : kind === 'dates' ? tub : () => food('banana');
  if (f !== 'short') {
    // 1 Rohzel at the machine (or the tea urn): the pour, the green fills the glass
    R.at(0, place(R0, [MACHINE[0] + 0.25, MACHINE[1]], -90), clip(R0, 'v_reach', { to: [0.0, 1.05, 0.45], hold: 0.5 }), cam([-5.0, 1.85, 0.9], [-5.15, 1.25, -2.2], 40, { to: { pos: [-5.0, 1.8, 0.4] }, dur: 1.8 }), sfx(drink ? 'whoosh' : 'click', { pitch: 0.5 }));
    if (kind === 'tea') R.at(0.2, spawn(ctx, st, () => steam(4), [MACHINE[0], 1.1, MACHINE[1]]), anim(ctx, (T) => st.obj && st.obj.userData.step(T)));
    if (first) R.at(0.4, say(R0, kind === 'smoothie' ? 'Kale, apple, ginger. Good for the kick drum.' : kind === 'tea' ? 'Ginger tea. For the throat.' : 'Eat. You sing better fed.', { dur: 1.7 }));
    t = first ? 2.2 : 1.1;
    // 2 the slide: it travels the counter and stops at the hero
    R.at(t, place(R0, [-4.95, -2.0], 90), clip(R0, 'v_slide', { y: TOPC, z: 0.6 }), COUNTER_SIDE(xf(220)));
    slideDown(ctx, R, t + 0.15, it, make, -2.0, 0.75);
    if (kind === 'tea') R.at(t + 0.9, put(ctx, st, [COUNTER_X, TOPC + 0.15, SEAT_C[1]]));
    t += 1.1;
  } else R.at(0, spawn(ctx, it, make, [COUNTER_X, TOPC, SEAT_C[1]]));
  // 3 the reverse from behind the bar: the hero eats or drinks; PAY on the bite or the gulp; Rohzel goes back to polishing
  R.at(t, BEHIND_BAR(f === 'short' ? {} : xf(240)), place(R0, [-4.95, -0.15], 90), clip(R0, 'v_polish'));
  if (drink) {
    R.at(t, hold(ctx, it, H, { aim: 'up', back: kind === 'tea' ? -0.08 : -0.12 }), clip(H, 'v_drink', { at: 0.4, gulp: kind === 'smoothie' ? 0.9 : 0.3, shudder: kind === 'smoothie', warm: kind === 'tea', sit: SEAT_Y }));
    R.at(t + 0.45, sfx('swoosh', { pitch: 0.5, quiet: true }), drum('B'), ctx.PAY).at(t + 1.1, withProp(it, (p) => p.userData.fill && p.userData.fill(0.3)));
    R.at(t + (kind === 'smoothie' ? 1.9 : 1.4), mood(H, 'happy'), drum(kind === 'smoothie' ? 'Pf' : 't'), word(kind === 'smoothie' ? 'Pf' : 'ahh', 'hero:mouth', { size: 3.6, color: '#9dff4a', ms: 600 }));
    t += kind === 'smoothie' ? 2.3 : 1.7;
  } else {
    const kd = bowl ? (kind === 'oats' ? 'spoon' : 'fork') : kind === 'dates' ? 'dates' : 'banana';
    if (bowl || kind === 'dates') R.at(t, spawn(ctx, ut, () => food(kd), [SEAT_C[0], 1, SEAT_C[1]]), hold(ctx, ut, H, { aim: 'up', back: -0.05 }));
    else R.at(t, hold(ctx, it, H, { aim: 'up', back: -0.05 }), withProp(it, (p) => p.userData.peel && p.userData.peel(1)));
    R.at(t, clip(H, 'v_eat', { bites: 2, every: 0.8, lead: 0.15, chew: 1, sit: SEAT_Y, from: bowl ? [0.2, TOPC - 0.02, 0.5] : undefined }));
    const b1 = t + 0.15 + 0.8 * 0.42;
    R.at(b1, drum('B'), sfx('eat'), ctx.PAY, withProp(bowl ? it : kind === 'dates' ? ut : it, (p) => { if (p.userData.fill) p.userData.fill(0.6); else if (p.userData.bite) p.userData.bite(0.4); }), word('B', 'hero:mouth', { size: 4.6, color: '#ffd35c', ms: 500 }));
    R.at(b1 + 0.8, drum('B'), sfx('eat', { pitch: 1.1 }), mood(H, 'happy'));
    t += 1.9;
  }
  R.end(t + 0.2);
  return { events: R.list() };
}

// ======================================================================= THE DISHES JOB (TRM 120 min): the sink is a drum kit
const SINK = [-4.5, TOPC - 0.04, 0.85], DISH_AT = [-5.05, 0.85];
const SINK_CU = (o) => cam([-1.7, 1.95, 1.6], [-4.85, 1.1, 0.85], 52, o);
const AISLE = (o) => cam([-2.4, 1.75, 1.9], [-5.0, 1.2, 0.5], 44, o);
function dishes(ctx) {
  const f = ctx.form, R = reel(), ap = ref(), sk = ref(), stk = ref(), money = ref(), first = f === 'first';
  if (MICRO(f)) { R.at(0, clip(H, 'v_scrub', { bpm: 110 })); [0, 1, 2].forEach((i) => R.at(0.15 + i * 0.27, drum(i === 2 ? 'K' : 't', { vel: 0.6 }))); R.at(0.7, ctx.PAY).end(1.0); return { events: R.list(), letterbox: false, hide: false, max: 2 }; }
  R.at(0, fullFrame(ctx), spawn(ctx, sk, sink, SINK, Math.PI / 2), anim(ctx, (T) => sk.obj && sk.obj.userData.drip(T)), place(R0, [-4.95, -0.7], 90), clip(R0, 'v_polish'));
  let t = 0;
  if (f !== 'short') {
    // A: the apron goes on behind the bar, sleeves up
    R.at(0, place(H, DISH_AT, 90), spawn(ctx, ap, apron, [DISH_AT[0], 0.8, DISH_AT[1]]), follow(ctx, ap, H, 'hips', [0, 0.05, 0.27]), clip(H, 'v_stretch', { dur: 0.9 }), AISLE({ to: { pos: [-2.7, 1.72, -2.1] }, dur: 1.2 }), sfx('swoosh', { pitch: 1.1, quiet: true }));
    trm(R, ctx, 0, -120, 120);
    R.at(0.6, drum('t'), word('tie', [0.4, 0.62], { size: 2.6, color: '#2a9d8f', ms: 400 }));
    t = 1.0;
  } else R.at(0, place(H, DISH_AT, 90), spawn(ctx, ap, apron, [DISH_AT[0], 0.8, DISH_AT[1]]), follow(ctx, ap, H, 'hips', [0, 0.05, 0.27]));
  // B: the glasses squeak clean on the beat, the tap drips on the off beat, the rack clicks: by now the sink is a drum kit and the hero is playing it
  R.at(t, place(H, DISH_AT, 90), clip(H, 'v_scrub', { y: TOPC - 0.04, bpm: 100 }), SINK_CU(f === 'short' ? {} : { cut: 'whip', ms: 240 }));
  trm(R, ctx, t, -60, 120);
  const pat = ['t', 't', 'K', 't', 'B', 't', 'K', 't'];
  pat.forEach((k, i) => R.at(t + 0.15 + i * 0.3, drum(k, { vel: 0.7 }), i % 2 ? null : call(() => ctx.note(84 + (i % 4), 0.12, { timbre: 'keys', vel: 0.15 }))));
  R.at(t + 0.3, word('squeak', [0.62, 0.5], { size: 2.6, color: '#7fd6ff', ms: 450 })).at(t + 1.0, word('drip', [0.36, 0.6], { size: 2.4, color: '#7fd6ff', ms: 450 }));
  t += f === 'short' ? 1.1 : 2.5;
  if (f !== 'short') {
    // C: a stack of glasses wobbles; the hero freezes; it settles. Rohzel does not look up
    R.at(t, spawn(ctx, stk, () => glassStack(5), [-4.25, TOPC, 1.4]), anim(ctx, (T) => { if (stk.obj) stk.obj.userData.wobble(Math.max(0, Math.sin(T * 14)) * Math.exp(-T * 1.8) * 3); }), clip(H, 'idle'), mood(H, 'shout'), drum('t', { vel: 0.3 }));
    R.at(t, cam([-2.9, 1.6, 2.1], [-4.25, 1.35, 1.4], 40, xf(160)));
    R.at(t + 1.1, mood(H, 'neutral'), S('ms', -40, { w: 1.4, h: 1.5, lookH: 1.1, fov: 40 }, R0), sfx('click', { pitch: 1.5, quiet: true }));
    t += 1.7;
  }
  // D: Rohzel counts $24 into the hero's hand, note by note, one per beat. PAY
  R.at(t, place(R0, [-5.05, 0.2], 0), clip(R0, 'v_offer', { to: 0.42 }), place(H, DISH_AT, 180), clip(H, 'v_offer', { to: 0.4 }), cam([-2.4, 1.75, 0.5], [-5.05, 1.2, 0.5], 44, xf(260)));
  trm(R, ctx, t, 0, 120);
  R.at(t, spawn(ctx, money, () => cash(1), [-5.05, 1, 0.6]), hold(ctx, money, H, { aim: 'up', back: -0.03 }));
  [1, 2, 3, 4].forEach((n, i) => R.at(t + 0.3 + i * BEAT * 0.5, sfx('coin', { pitch: 1 + i * 0.06 }), drum('t', { vel: 0.4, pulse: false }), word('$' + [6, 12, 18, 24][i], [0.5, 0.36 - i * 0.03], { size: 3.2, color: '#9dff4a', ms: 380 })));
  R.at(t + 0.3 + 3 * BEAT * 0.5, ctx.PAY, mood(H, 'happy'));
  if (first) R.at(t + 1.4, say(R0, 'You hummed the whole time. The sink sounded good.', { dur: 1.8 }));
  R.end(t + (first ? 3.2 : f === 'short' ? 1.4 : 1.8));
  return { events: R.list() };
}

// ======================================================================= MINGLE (tap a regular > CHAT): the outcome Core picked (fx mingle id)
// where the hero sits for each regular, and the coverage there
const SEATS = {
  regular0: { at: [-2.3, -4.42], face: 0, seat: 0.5, surf: null, two: (o) => cam([-2.75, 1.75, -0.2], [-2.75, 0.95, -4.42], 44, o) },
  regular1: { at: [-0.35, -1.15], face: -90, seat: 0.68, surf: [-1.15, 0.76, -1.22], two: (o) => cam([-1.15, 2.0, 3.9], [-1.15, 1.0, -1.2], 40, o) },
  regular2: { at: [-3.4, -1.5], face: -90, seat: 0.68, surf: [-4.18, TOPC, -1.95], two: (o) => cam([-1.1, 1.95, 1.9], [-3.4, 1.05, -1.95], 42, o) },
};
// singles from the room side (the open side of every seat): waist up, the table or the counter in the frame
for (const k in SEATS) { const P = SEATS[k]; P.hero = (o) => shot(Object.assign({ on: H, rel: false, yaw: -8, w: 1.7, h: 2.15, lookH: 0.9, fov: 40 }, o)); P.reg = (o) => shot(Object.assign({ on: k, rel: false, yaw: -24, w: 1.7, h: 2.15, lookH: 0.9, fov: 40 }, o)); }
function mingle(ctx, id) {
  const f = ctx.form, R = reel(), mf = (ctx.fx || []).find((x) => x.t === 'mingle') || {}, who = (ctx.action && ctx.action.who) || mf.who || 'luca', slot = regularSlot(ctx, who) || 'regular1', P = SEATS[slot] || SEATS.regular1, REG = slot;
  const first = f === 'first', aff = (ctx.pre && ctx.pre.affinity && ctx.pre.affinity[who]) || 0, gl = ref(), nk = ref(), jk = ref(), sp = ref();
  if (MICRO(f)) {
    const c = id === 'awkward' ? 'v_shrug' : id === 'liproll' ? 'v_liproll' : id === 'bars' ? 'beatbox' : id === 'napkin' ? 'v_nod' : 'v_drink';
    R.at(0, clip(H, c, c === 'v_drink' ? { at: 0.3, gulp: 0.4 } : c === 'v_liproll' ? { len: 0.6 } : { n: 2, bpm: 100 })).at(0.35, drum(id === 'awkward' ? 't' : 'B'), ctx.PAY).end(0.95);
    return { events: R.list(), letterbox: false, hide: false, max: 2 };
  }
  R.at(0, fullFrame(ctx));
  let t = 0;
  // the seat: FIRST walks in (an affinity 8+ regular saved it with a jacket); then the hero sits with them
  if (first || aff >= 8) {
    if (aff >= 8) R.at(0, spawn(ctx, jk, () => jacket('#7b4fe0'), [P.at[0], P.seat, P.at[1]], 0.4));
    R.at(0, place(H, [P.at[0] + 0.9, P.at[1] + 0.9], -135), P.two({}), mood(REG, 'happy'), look(REG, 'hero:head'));
    R.at(0.05, cue('walk', { who: H, to: [P.at[0] + 0.15, P.at[1] + 0.2], speed: 1.6 }));
    if (aff >= 8) R.at(0.75, clip(REG, 'sit', { seat: P.seat, bpm: 0, wave: true })).at(0.85, gone(ctx, jk), drum('t'), word('saved you a seat', [0.5, 0.3], { size: 2.6, color: '#ffd35c', ms: 900 }));
    t = 1.0;
  }
  R.at(t, place(H, P.at, P.face, { y: 0 }), clip(H, 'sit', { seat: P.seat, slump: 0.6 }), look(REG, 'hero:head'), P.two(t ? xf(260) : {}));
  t += 0.55;
  if (id === 'juice') {
    // "loves your last set and buys you a green juice": a hand up to Rohzel, the juice arrives (down the counter, or across the table), the hero drinks
    R.at(t, clip(REG, 'sit', { seat: P.seat, wave: true }), mood(REG, 'happy'), word('one more!', [0.5, 0.3], { size: 2.8, color: '#9dff4a', ms: 700 }));
    if (slot === 'regular2') { R.at(t + 0.3, place(R0, [-4.95, -0.4], 90), clip(R0, 'v_slide', { y: TOPC, z: 0.6 })); R.at(t + 0.4, spawn(ctx, gl, () => juice(), [COUNTER_X, TOPC, -0.4]), anim(ctx, (T) => { const o = gl.obj; if (!o || gl.follow && gl.follow.on) return; const u = Math.min(1, T / 0.7), e = 1 - Math.pow(1 - u, 3); o.position.set(COUNTER_X, TOPC, -0.4 + (P.at[1] + 0.4) * e); }), sfx('swoosh', { pitch: 0.5 })).at(t + 1.1, drum('K')); }
    else R.at(t + 0.4, spawn(ctx, gl, () => juice(), [P.at[0] + (slot === 'regular1' ? -0.6 : -0.45), P.surf ? P.surf[1] : 0.9, P.at[1] + (slot === 'regular0' ? 0.25 : -0.05)]), sfx('swoosh', { pitch: 0.6, quiet: true }), drum('t'));
    R.at(t + 1.2, hold(ctx, gl, H, { aim: 'up', back: -0.12 }), clip(H, 'v_drink', { at: 0.4, gulp: 0.8, sit: P.seat }), P.hero(xf(240)));
    R.at(t + 1.65, sfx('swoosh', { pitch: 0.5, quiet: true }), drum('B'), ctx.PAY).at(t + 2.3, withProp(gl, (p) => p.userData.fill(0.2)), mood(H, 'happy'), word('mmm', 'hero:mouth', { size: 3, color: '#9dff4a', ms: 500 }));
    t += 2.6;
  } else if (id === 'napkin') {
    // "shares a beat idea on a napkin": the napkin slides over; it only makes sense sideways
    const at = P.surf ? [P.surf[0] + (slot === 'regular1' ? 0.3 : 0), P.surf[1] + 0.005, P.surf[2] + (slot === 'regular2' ? 0.4 : 0)] : null;
    void at; R.at(t, spawn(ctx, nk, napkin, [P.at[0], 1, P.at[1]]), clip(REG, 'v_hold', { y: 1.0, z: 0.34, look: 0.3, sit: P.seat }), show(ctx, nk, REG, {}), P.reg(xf(220)));
    R.at(t + 0.3, drum('t'), word('?', [0.45, 0.3], { size: 4, color: '#c9c3dd', ms: 600 }));
    R.at(t + 0.9, anim(ctx, (T) => { if (nk.obj) nk.obj.userData.turn(Math.min(1, T / 0.35)); }), sfx('swoosh', { pitch: 1.4, quiet: true }));
    R.at(t + 1.3, drum('K'), word('!', [0.55, 0.28], { size: 5.4, color: '#ffd35c', ms: 700 }), ctx.PAY);
    R.at(t + 1.6, P.hero(xf(220)), clip(H, 'sit', { seat: P.seat, talk: true }), mood(H, 'happy'), mood(REG, 'happy'));
    t += 2.4;
  } else if (id === 'liproll') {
    // "teaches you a lip-roll trick": the regular rolls, the hero tries, a little spit, both laugh
    R.at(t, P.reg(xf(220)), clip(REG, 'v_liproll', { len: 1.0, sit: P.seat }), call(() => { for (let i = 0; i < 6; i++) setTimeout(() => ctx.note(40, 0.08, { timbre: 'bass', vel: 0.25 }), i * 140); }), word('brrrr', [0.5, 0.32], { size: 3.2, color: '#ff6ec7', ms: 900 }));
    R.at(t + 1.2, P.hero(xf(220)), clip(H, 'v_liproll', { len: 0.7, spit: true, sit: P.seat }), word('brr-', 'hero:mouth', { size: 3, color: '#ff6ec7', ms: 500 }));
    R.at(t + 1.9, cue('fx', { kind: 'sparks', at: 'hero:mouth', color: '#bfe8ff', n: 14 }), drum('Pf'), word('pfft', [0.6, 0.4], { size: 3, color: '#bfe8ff', ms: 500 }), ctx.PAY);
    R.at(t + 2.3, P.two(xf(260)), mood(H, 'happy'), mood(REG, 'happy'), clip(REG, 'sit', { seat: P.seat, talk: true }), clip(H, 'sit', { seat: P.seat, talk: true }), sfx('applause', { quiet: true }));
    t += 3.0;
  } else if (id === 'bars') {
    // "trade bars until the bar closes its tab": four beats each across the table; the next table turns around
    R.at(t, P.reg(xf(220)), cue('beat', { who: REG, pattern: 'B . t K . B t K', bpm: 104, step: 0.5, rings: true }), mood(REG, 'angry'));
    R.at(t + 1.2, P.hero(xf(160)), cue('beat', { who: H, pattern: 'B t K B . t K Pf', bpm: 104, step: 0.5, rings: true, words: first }), mood(H, 'angry'));
    const other = ['regular0', 'regular1', 'regular2'].find((s) => s !== slot && npc(ctx, s));
    if (other) R.at(t + 1.6, look(other, 'hero:head'), mood(other, 'happy'));
    R.at(t + 2.4, P.two(xf(260)), mood(H, 'happy'), mood(REG, 'happy'), clip(H, 'sit', { seat: P.seat, talk: true }), word('+5 FANS', [0.5, 0.28], { size: 3.2, color: '#2ee6ff', ms: 800 }), sfx('crowd_cheer', { quiet: true }), ctx.PAY);
    t += 3.0;
  } else {
    // "not in the mood. Awkward silence.": both look at their drinks; two beats of nothing; the jukebox changes track; the hero gets up
    const dk = P.surf ? [P.surf[0], P.surf[1], P.surf[2]] : [P.at[0] - 0.4, 0.4, P.at[1] + 0.6];
    R.at(t, look(REG, dk), look(H, dk), mood(REG, 'neutral'), mood(H, 'neutral'), cue('vignette', { v: 0.6, ms: 500 }), energy(ctx, 0.1));
    R.at(t + BEAT * 2.2, drum('t', { vel: 0.4 }), sfx('click', { pitch: 0.6 }), word('click', [0.7, 0.2], { size: 2.4, color: '#c9c3dd', ms: 500 }), cue('pulse', { v: 0.4 }));
    R.at(t + BEAT * 3, cue('vignette', { v: 0, ms: 400 }), look(H, null), place(H, [P.at[0] + 0.45, P.at[1] + 0.45], P.face + 180), clip(H, 'idle'), mood(H, 'sad'), P.hero(xf(240)), ctx.PAY);
    t += BEAT * 3 + 0.8;
  }
  R.end(t + 0.2);
  return { events: R.list(), cast: { [REG]: { rest: { clip: 'sit', opts: { seat: P.seat, bpm: 98, amp: 0.4, slump: 0.4 } } } } };
}

// ======================================================================= THE DATE (TRM 120 min): out the door side by side, the jukebox, the same pattern without agreeing on it
function date(ctx) {
  const f = ctx.form, R = reel(), who = (ctx.action && ctx.action.who) || 'luca', slot = regularSlot(ctx, who) || 'regular1', REG = slot, P = SEATS[slot] || SEATS.regular1;
  if (MICRO(f)) { R.at(0, clip(H, 'v_hug', { hold: 0.4 })).at(0.4, drum('B'), sfx('heart'), ctx.PAY).end(1.0); return { events: R.list(), letterbox: false, hide: false, max: 2 }; }
  R.at(0, fullFrame(ctx), place(H, [-0.9, 0.6], 180), place(REG, [-0.35, 0.6], 180, { y: 0 }), clip(REG, 'idle'), mood(REG, 'happy'), mood(H, 'happy'));
  // 1 the walk to the jukebox side by side, the gap between them closes
  R.at(0, cue('walk', { who: H, to: [-0.55, -3.0], speed: 1.25 }), cue('walk', { who: REG, to: [0.25, -3.0], speed: 1.2 }), cam([-0.2, 1.7, 3.6], [-0.2, 1.1, -1.2], 40, { to: { pos: [-0.2, 1.8, 2.6] }, dur: 2.2 }));
  trm(R, ctx, 0, -120, 120);
  let t = f === 'short' ? 0.8 : 1.6;
  // 2 at the jukebox: the record drops, a dance
  R.at(t, place(H, [-0.6, -3.2], 0), place(REG, [0.15, -3.2], 0, { y: 0 }), clip(H, 'dance', { bpm: 100 }), clip(REG, 'dance', { bpm: 100 }), cam([-0.2, 1.75, 0.6], [-0.2, 1.2, -3.4], 40, xf(300)), drum('B'), sfx('click', { pitch: 0.6 }));
  trm(R, ctx, t, -60, 120);
  t += f === 'short' ? 0.8 : 1.5;
  // 3 both beatbox the same pattern without having agreed on it; a laugh. PAY
  R.at(t, face(H, 90, 300), face(REG, -90, 300), cue('beat', { who: H, pattern: 'B t K t', bpm: 100, step: 0.5, rings: true }), cue('beat', { who: REG, pattern: 'B t K t', bpm: 100, step: 0.5, rings: true }), cam([-0.2, 1.9, 1.4], [-0.2, 1.15, -3.2], 40, xf(240)));
  trm(R, ctx, t, 0, 120);
  R.at(t + 1.3, clip(H, 'v_hug', { to: 0.36, hold: 0.8 }), clip(REG, 'v_hug', { to: 0.36, hold: 0.8 }), sfx('heart'), word('same', [0.5, 0.3], { size: 3.4, color: '#ff6ec7', ms: 800 }), ctx.PAY);
  R.end(t + 2.6);
  return { events: R.list(), cast: { [REG]: { rest: { clip: 'sit', opts: { seat: P.seat, bpm: 98, amp: 0.4, slump: 0.4 } } } } };
}

// ======================================================================= REFUSALS (MICRO)
function refuseCash(ctx) {
  const R = reel(), m = ref(), once = ctx.n === 0 || ctx.pick(3) === 0;
  R.at(0, clip(H, 'v_pockets'));
  if (once) R.at(0.95, spawn(ctx, m, moth, [0, 0, 0]), anim(ctx, (T) => { const o = m.obj, a = ctx.api && ctx.api.actor(H); if (!o || !a) return; const p = a.o.position; o.position.set(p.x + 0.25 + T * 0.3 + Math.sin(T * 9) * 0.05, 0.75 + T * 0.9, p.z + 0.25 + Math.cos(T * 7) * 0.06); o.userData.flap(T); }));
  R.at(0.6, word('...', 'hero:top', { size: 3, color: '#c9c3dd', ms: 500 })).at(0.85, ctx.PAY).end(1.2);
  return { events: R.list(), letterbox: false, hide: false, max: 2 };
}
const REFUSALS = {
  'p1.refuse.cash': refuseCash,
  'p1.refuse.tired': (ctx) => micro1(ctx, 'v_yawn', {}, [[0.55, drum('t', { vel: 0.4 }), word('yawn', 'hero:mouth', { size: 3, color: '#c9c3dd', ms: 500 })]], 1.2),
  'p1.refuse.date': (ctx) => micro1(ctx, 'v_shrug', {}, [[0.2, word('...', 'hero:top', { size: 3, color: '#c9c3dd', ms: 600 })]], 1.0),
};

const FOODS = ['banana', 'oats', 'dates', 'bowl', 'smoothie', 'tea'];
export const VIGNETTES = Object.assign({
  'p1.stage.in.openmic': (c) => stageIn(c, 'openmic'), 'p1.stage.in.showcase': (c) => stageIn(c, 'showcase'), 'p1.stage.in.karaoke': (c) => stageIn(c, 'karaoke'), 'p1.stage.out': stageOut,
  'p1.battle.walkout': walkout, 'p1.battle.verdict': verdict,
  'p1.job.dishes': dishes, 'p1.date': date,
  'p1.mingle.juice': (c) => mingle(c, 'juice'), 'p1.mingle.napkin': (c) => mingle(c, 'napkin'), 'p1.mingle.liproll': (c) => mingle(c, 'liproll'), 'p1.mingle.bars': (c) => mingle(c, 'bars'), 'p1.mingle.awkward': (c) => mingle(c, 'awkward'),
}, Object.fromEntries(FOODS.map((k) => ['p1.eat.' + k, (c) => barEat(c, k)])), REFUSALS);
export const WORLD = 'bar';
void glass; void TABLE; void stamp;
