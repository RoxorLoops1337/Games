---
name: ludus3d-ui-cinematics
description: Ludus Maximus 3D only. Roman-epic HTML/CSS/SVG UI kit (panels, buttons, bars, nameplates, ultimate cooldown rings, modals, VS splash, toasts, counters) and the pure-math fight camera director (shot list, API, framing guarantees). Use when building js/ui/*.js, css/ui.css or js/director.js in ludus_maximus_3d/.
---

# Ludus3D UI kit and fight cinematography

Proven references (copy, then split into the final modules): `ludus_maximus_3d/lab/ref/ui_ref.{css,js}`, `lab/ui_ref.html` (scenes `?scene=hud|kit|manage|vs|levelup`), `lab/ref/director_ref.js` + `director_ref.test.mjs` (run: `node --no-warnings ludus_maximus_3d/lab/ref/director_ref.test.mjs`). Screenshot: `node tools/3d_shot.mjs "<url>?scene=hud" out.png --w 390 --h 800` and `--w 1280 --h 720`. No em dashes in any copy.

## Design language
Marble, bronze, parchment, gold on Tyrian/night shadow. Never pure black. Engraved serif caps for titles (`'Trajan Pro','Cinzel','Cormorant Garamond','Palatino Linotype',Georgia,serif`), system sans for body and numbers (always `tabular-nums`). Ornament is CSS/SVG only: greek-key strip (inline SVG data URI repeated on `::before`), laurel SVG, 2px gold hairline rules, text-shadow engraving. Hades/Slay the Spire lesson: few big readable shapes, strong value contrast (light gold on dark bronze), one saturated accent per meaning, juice on state change only.

## Tokens (CSS vars on :root, prefix --lx-)
sand #d9b27c, travertine #e8dcc0, terracotta #b5532f, purple #5a1f5e, laurel #5b7a3a, bronze #b8803a, gold #f2c14e, iron #5c6068, night #2a2540, ink #1d1830. Status: hp #c2392f, foe #7a3fa8, stam #3f9a6a, xp #4a8fd0. Sizes: tap 44px min (ultimates 64px+), fs s/m/l 12/14/17 (13/15/19 at >=900px), gutter max(12px,3vw). Safe areas: `--lx-sat/sab/sal/sar` = env(safe-area-inset-*); every fixed/absolute HUD container pads with them. Put class `lx-root` on `<body>` (reduced-motion rule keys on it plus modal/toast/vs/levelup classes). Overlay parent of the canvas needs `viewport-fit=cover`.

## API (ES module, all return elements; `U = import './ui/kit.js'`)
- `h(tag, cls, kids)`, `icon(name,size)` (names: 9 ultimates by D.ULTS id: pulverize hookshot bladedance skewer tornado unbreakable bloodrage meteor duststorm; plus coin fame star heart sword shield ludus arena roster market scroll skull close gear check lock), `laurel()`.
- `panel({title,variant:'bronze|marble|parchment|dark',key,kids})` -> el with `.body`.
- `button({label,icon,variant:'gold|bronze|ghost|danger',onClick,disabled,block,sub})`, `iconButton(name,aria,fn)`. Press = translateY(3px) + inset shadow, vibrate 8ms.
- `bar({value,max,kind:'hp|foe|stam|xp',segments,label:'num'|text,height})` -> `.set(v,max)`. Damage ghost holds 380ms then drains; `lx-hit` shake. `statRow({name,value,max,bonus,kind})`.
- `stars(n,max)`, `rarityFrame(rarity,child,size)` rarity: common fine rare epic legendary (legendary has sheen).
- `nameplate({name,level,hp,maxHp,team:'ally|foe',rank})` -> `.hp.set()`, `.track(vec3,camera,w,h,lift)` (projects with `vec3.clone().project(camera)`, hides off-screen/behind, depth scale 0.7..1.1). Parent it in `.lx-plates` (absolute, inset 0, pointer-events none, overflow hidden). Call track every frame after camera update with head position + 0.4m.
- `cooldownRing({ult,color,size,hotkey,onCast})` -> `.set(fracRemaining, secs)`; 0 = ready (pulse, ping flash on becoming ready). Colors come from D.ULTS[id].c.
- `modal({title,body,actions})` -> `{close}`; bottom sheet under 700px, centered above; Esc, scrim tap, focus return. `toast(msg,{kind:'info|good|bad',ico,ms})` max 3 stacked.
- `countUp(el,to,{dur,fmt})`, `counter({ico,value,kind:'gold|fame'})` -> `.set(v)`, fixed 5ch width so layout never shifts.
- `tooltip(target,text,{title})` hover/focus on desktop, 380ms long-press on touch.
- `nav(items,onSelect,active)` bottom nav (5 items max, 52px tall, safe-area padded).
- Fight: `vsSplash({a,b,league})` Promise (2.2s), `banner(text,'info|crit|ult|kill',host,ms)` max 3 lines in `.lx-banners`, `levelUp({name,level})`.
- Reduced motion: JS checks `matchMedia`, CSS collapses animations to 0.01ms; countUp jumps to the value.

## Layout per viewport
Phone 390x800 portrait: top row = gold + fame chips left, settings icon right; combat banners under it; ultimates bottom-center in one row (3 max at 72px, 14px gap, above safe-area); nameplates 136px wide; sheets are bottom sheets, max 86dvh, inner scroll. Desktop 1280x720: same zones, ults 84px, nav centered with 110px items, dialogs centered max 560px, gallery grids use `repeat(auto-fit,minmax(min(100%,340px),1fr))`. Keep the centre 60% of the screen clear for the fight; HUD lives at the edges. Text must fit: `overflow-wrap:anywhere`, `min-width:0` in flex/grid children, ellipsis on names in plates, `clamp()` for splash titles.

## Fight cinematography (js/director.js = director_ref.js)
Research summary: Dark Souls lock-on keeps both parties framed with a pitch that never drops under the horizon; God of War stays close and low but never cuts; SF6 uses a fixed side-on frame with a short punch-in on supers and a slow orbit on the KO; Smash and Total War Arena zoom out to fit everyone. We combine: wide framing follow, snap hero shots with slow-mo, and a slow orbit on the kill.

Mapping: arena (x,y) meters -> world (x, up, z=y), radius 8.6. Create `new FightDirector({aspect, radius:8.6, gateAngle})`, call `setAspect()` on resize, `update(realDt, units)` each frame with `units=[{id,x,y,vx,vy,team,alive}]`, apply `pose.pos/look/fov` (fov is VERTICAL degrees) and multiply the sim dt by `pose.timeScale`. `pose.shake` (0..1 trauma, squared already) for camera shake; `kick(a)` adds trauma on heavy hits.
Shots (`setShot(name, params, blendSeconds)`):
1. `establishing` orbit flyover of the bowl rim, 4.5s, then auto `gate`. Params: dur, yaw0, speed.
2. `gate` dolly from the gate toward the fighters, 2.8s, then auto `follow`. Params: gateAngle, dur.
3. `follow` frame-all-fighters (the default fight shot). Side-on in landscape, aligned with the spread axis in portrait (spread runs up the screen), higher pitch and wider fov on tall phones.
4. `duel` over-the-shoulder; params {a,b,side:+-1}; use when 2 fighters remain or a 1v1 lock-on.
5. `cue('ultimate',{unit,target})` low-angle hero shot (pitch below 0), slow-mo 0.2x for 0.45s then ramp to 1, returns to the base shot. Caster must stay in frame.
6. `cue('kill',{victim,killer})` slow orbit around the last blow with 0.25x ramping to 1 over 2.8s; set `next:{name:'victory'}` via params to chain.
7. `victory` orbit around the winners, endless.
8. Player override: `freeOrbit(dYaw,dPitch,dZoomFrac)` on drag/pinch; auto-releases after `freeTimeout` (6s idle) or call `release()`.
Blending: each `setShot` snapshots the smoothed state and eases (smoothstep) into the new target over `blend` seconds. All motion goes through critically damped springs on yaw, pitch, center, distance, fov (distance expands fast, contracts slowly; yaw speed capped at 1.1 rad/s so side flips never whip).
Guarantees (tested, 270k checks): in follow/victory/duel/kill/ultimate every living fighter (feet and head, margin 0.8-0.9 of the frame) is inside the frustum for aspect 0.5..2 and 1v1..3v3 with moving units; the camera stays inside the bowl radius (pitch is raised instead of moving outside, except the gate tunnel and the ultimate hero shot); never below 0.55m; max step under 1.2m per frame.

## Pitfalls
- Hard safety is applied AFTER smoothing (d = max(smoothed, required)); never skip it or fast fighters leave the frame.
- Smooth the look-ahead velocity (the director does); raw velocity pops the camera when a fighter dashes.
- Do not clamp the camera by pulling it toward the center after framing, it breaks the guarantee; raise pitch instead.
- Slow-mo: scale sim, particles and audio by `timeScale`, but run UI tweens and the director on real time.
- Nameplates: update after the camera, in the same frame, or they swim. Hide for dead units.
- `backdrop-filter` is costly on phones: only on `.lx-dark` and keep it off during fights.
- Modals appended to body must sit outside the canvas stacking context; set `touch-action:none` on the canvas, `manipulation` on buttons.
- Do not rename localStorage keys; UI state must read from the sim, never duplicate rules.

## Round 2 (fight team): phone fight HUD, kill cam, outro
- Fight HUD classes (css/ui.css, prefix `.lx-fv`): `.lx-fv-top` (nowrap button row, 34 / 32 / 30 px buttons by width and height), `.lx-fv-extras`, `.lx-fv-hud`. Ult ring size: 84 desktop, 68 phones, 60 under 480 px tall, 54 under 420 px tall; landscape right-aligns the ult row.
- Nameplates: `FightView.placePlate` projects the head and slides the plate out of the measured rectangles (`measureHud`: top button row, Crowd's Favor box, each ult ring), clamps to the screen with a 112 px plate under 420 px wide, bottom anchored. Checked at 390x800, 360x640, 800x390 for 1v1, 2v2, 3v3.
- Kill cam: side-on to the killer to victim blow axis, picks the shoulder deeper in the bowl, orbit 0.5 rad total, points = victim, killer, a fall point sliding 0.6 to 2.1 m beyond the victim, flung limb points only after 0.5 s and only if within 5.5 m (a far head must not pull the shot wide). Slow-mo 0.25x until 0.7 s. Victory orbit is 0.1 rad/s eased in.
- Outro: `endFight` cues the kill shot with `next: victory` (no wall-clock timer), `showEnd` adds the big `.lx-fv-end` title (CSS delay 1.5 s, win gold / defeat grey and red), hides plates, ult bar and Crowd's Favor box; the result resolves after 5.4 s.

# Update: pause menu, replay bar, kill cam
- Pause button (top row) and P / Esc open `openPauseMenu` (U.modal): speed, gore, sound, reduced motion write the More prefs and re-apply via `screens/more.js applyPrefs`; Resume; Quit asks confirmation and forfeits (`F.done = true, winner 'B'`, counts as a defeat). Pausing freezes sim, animation, fx and suspends the AudioContext (`framePaused`).
- Replay bar (`.lx-fv-rbar`): play / pause, restart, scrubber (sim steps, `F.replay.total` is written in `endFight`), rates 0.25 / 0.5 / 1 / 2, camera presets (`CAMS`: auto, wide, side, low, top, orbit) on the director free orbit (`freeTimeout = 0`), drag on the canvas orbits. `seekTo(n)`: forward = silent fast-forward (sfx and crowd muted, fx quieted for events older than 45 steps, `gore.settle()`), backward = `restartReplay` from `R.snap` (promise kept) then forward. Deterministic: seeking to the end reproduces the first run's hp and winner.
- Director `kill` shot param `tight` frames the pair only (no fall point) so a 9:16 phone is not pulled back to 8 m.
