---
name: ludus3d-vfx-gamefeel
description: Ludus Maximus 3D only. Pooled combat VFX (sparks, dust, slashes, rings, shockwaves, beams, trails, status icons, damage numbers, sand decals, element ultimates) and game feel (trauma shake, hit-stop, slow-mo, FOV punch, flash, rumble) for js/fx.js and js/fightview.js, with tuned numbers and the arena.js event to FX/feel mapping. Reference code and lab live in ludus_maximus_3d/lab/.
---

# Ludus 3D VFX and game feel

Reference (tested, copy into `js/fx.js` / `js/feel.js`, keep the API): `ludus_maximus_3d/lab/ref/fx_ref.js`, `lab/ref/feel_ref.js`. Lab: `lab/fx_ref.html` (`?fx=hitCrit`, `?sheet=h1|h2|b1|s1|s2|u1|u2|u3|all`, `?t=0.3` freeze, `?post=1` shockwave distortion pass, `?shake=0.8`). Shot: `node tools/3d_shot.mjs "<url>" out.png --w 1400 --h 900 --secs 0.3`.
Research note: web search worked only for the trauma talk (Eiserloh GDC 2016: trauma 0..1, shake = trauma^2, Perlin noise, linear decay). The rest (Vlambeer "art of screenshake", Swink Game Feel, Juice it or lose it, instanced billboards) is from my own knowledge.

## Budget and architecture (measured)
- 8 draw calls for ALL fx: decal plane, particles normal-blend, debris InstancedMesh, rings+telegraph (GPU timed), particles additive, slash crescents (GPU timed), ribbons (trails/bolts/beams/pillars), glyph numbers. Limit was 12.
- Stress (every effect looping, ~1900 live particles, 33 ribbons, 40 emitters): update avg 1.3 ms CPU (swiftshader container), still 8 fx calls, 10.5k tris. Single crit: 0.75 ms.
- Pools: 2600 additive + 900 normal particles, 96 debris, 64 rings, 40 slashes, 36 ribbons, 480 glyphs. Pool full = drop silently. `fx.quality` (0.4..1) scales counts; set 0.5 on mobile.
- Frame order: `t = feel.update(realDt)`; `sim.step(t.dt)`; `fx.update(t.dt, camera)`; director places camera; `feel.apply(camera)`; render. Shake/flash/fov run on REAL dt so they live through hit-stop; fx runs on scaled dt so sparks freeze on the hit frame (that is the feel).
- Optional post (the single grade pass): `fx.getShockwaves(camera, vec4x4, aspect)` feeds `GRADE_FX_GLSL` (shockwave refraction, radial blur, chroma, flash). Shockwave distortion is a screen circle approximating a ground ellipse: keep strength low.

## fx API (positions: Vector3 or {x,y,z}; targets: Object3D, fn(out) or position)
`spark(pos,dir,n,color,{speed,cone,size,life})` `dust(pos,n,{size,up,dir,color,alpha})` `kickup(pos,dir,n)` `impactFlash(pos,color,size)` `slash(pos,dir,color,size,{tilt,arc,flip,dur})` (pos at chest height, dir = swing forward) `ring(pos,color,size,{dur})` `shockwave(pos,r,color,{dur,dust,distort})` `tele(pos,r,dur,color)->{cancel()}` `beam(a,b,color,{width,life,jag})` `zap(a,b,color)` (jagged bolt + branch + sparks) `chain(a,b,color)` `trail(target,color,{life,width})->{stop()}` `swordTrail(tip,base,color)` `projectile(target,color,{size})->{stop(hit)}` `shoot(from,to,color,{speed,arc,onHit})` `aura(target,color,dur,{kind:'buff|guard|rage|frenzy|rally'})->{stop()}` `heal(target,n)` `status(target,'stun|slow|bleed|blind|taunt|burn|root',dur)->{stop()}` `number(pos,text,kind,{scale,color})` kinds `dmg crit heal miss tech status thorn fire block` (text A-Z 0-9 + - ! . % x ? * : /) `debris(pos,n,{kind:'sand|stone|metal|fire'})` `groundDecal(pos,'scuff|skid|crater|scorch|crack|footprint|scratch',{size,angle,len})` `hit(pos,dir,{dmgFrac,crit,color})` (composite, see table) `ult.cast(el,pos)` `ult.impact(el,pos,r)` `ult.sustain(el,target,dur)->{stop()}` with el in `fire lightning earth wind holy` `later(sec,fn)` `reset()` `flushDecals()` `stats()` `decalTexture/decalCanvas` (blit into the sand material map if you prefer baked scuffs) `dispose()`.
`createFx(scene,{arenaRadius, groundY, sand, quality, decalSize:1024, seed})`. Decal canvas covers arenaRadius+2; upload is throttled to 10 Hz.

## feel API (`createFeel({overlay:true, fov, intensity, reducedMotion, onRumble})`)
`update(realDt)->{dt,scale}` `apply(camera)` `addTrauma(v)` `kick(dx,dy,dz,mag)` `hitStop(ms)` `slowmo(scale,holdS,inS,outS)` `fovPunch(deg)` `flash(r,g,b,a,decay)` `flashHex` `impact(cls,{dmgFrac,crit,mine,dir,color,big})` cls = `hit kill finalKill ult meteor aoe roar revive` `setUserScale(x)` (x2 speed button) `post` {flash,flashColor,chroma,radial,vignette,zoom} `state.timeScale` `reset()`.
Rules built in: hit-stop takes the MAX not the sum, caps 160 ms, and is cut to 40% when the last 0.6 s was >35% frozen (flurry stutter lock). Time scale during freeze is 0.02. Slow-mo: stronger request replaces weaker. `intensity` (settings slider) scales shake/flash/fov; `reducedMotion` = shake 0.25x, flash 0.3x, no fov punch, keeps hit-stop.

## Tuned numbers (all in `FEEL` / `NK` tables, change there)
| event | trauma | hit-stop ms | slow-mo (scale x real s) | fov punch | flash |
|---|---|---|---|---|---|
| hit dmg < 8% maxhp | 0 | 0 | | | |
| hit 8-18% | 0.16 | 30 | | | |
| hit > 18% | 0.30 | 55 | | 1.4 deg | |
| crit | 0.34 | 75 | | 2.2 | gold 0.12 |
| damage taken by player side | +0.10 | | | | |
| kill (not last) | 0.55 | 110 | 0.45 x 0.25 | 4 | white 0.30 |
| final kill (`end`) | 0.80 | 140 | 0.22 x 0.85 (+0.45 out) | 6 | white 0.40 + radial blur |
| ult cast | 0.30 | 45 | 0.35 x 0.35 | 5 | element color 0.28 |
| aoe big (r>=3.6) | 0.50 | 90 | | 1.4 | |
| meteor impact | 0.85 | 120 | 0.30 x 0.6 | 7 | orange 0.50 + chroma |
| roar | 0.20 | | | | |
Shake: amplitude = trauma^2, max 0.6 world units and 3 deg at trauma 1 (camera ~14 units away), noise 6-17 Hz, decay 1.15 trauma/s. Measured: trauma 1 peaks 0.21 units on x after settling, trauma 0.3 gives 0.025 (subtle, good). Kick the camera 0.06/0.14/0.2 along the hit direction for light/heavy/crit.
Particle counts per hit (scaled by quality): light 6 sparks + flash 0.7 + 2 dust; heavy 12 sparks + flash 1.1 + ring + 6 dust + 2 debris; crit 20 gold sparks + flash 1.7 + shockwave r1.8 + 8 dust + 3 debris + scuff decal. Numbers: em = 5% of screen half height, crit x1.75.

## arena.js event -> FX / feel (build js/fightview.js on this; world pos = sim (x,y) -> (x, 0, y) * scale)
| event k | calls |
|---|---|
| `atk` | animation only; `fx.slash(chest(src), dirTo(dst), style color, 2.0..2.6)` at wind-up end, `fx.swordTrail(tip, hilt)` for the swing (stop after 0.2 s) |
| `hit` (not hz) | `fx.hit(chest(dst), dirSrcToDst, {dmgFrac: dmg/dst.maxhp, crit})`; `fx.number(dst, crit ? 'CRIT '+dmg : dmg, crit?'crit':e.tech?'tech':'dmg')`; `feel.impact('hit',{dmgFrac,crit,mine: dst.side==='A',dir})`; `save` -> extra number 'BLOCK'/save text `block` |
| `hit` with `hz` | `fx.number(dst, dmg+' FIRE','fire')`, `fx.spark(chest,up,10,'#ffb347')`, trauma 0.12 |
| `miss` | `fx.number(dst, inv?'IMMUNE':'DODGE','miss')`, `fx.kickup(feet(dst), dir, 4)` |
| `whiff` | `fx.slash` faint (alpha 0.5) only |
| `tech` | `fx.number(src, techName+'!','tech')`, `fx.ring(feet(src), '#f5ead2', 1.8)` |
| `dash` | `fx.kickup(feet(src), dir, 8)`, `fx.groundDecal(feet,'skid',{angle,len})`, `fx.trail(src, color)` for 0.4 s |
| `proj` | `fx.shoot(chest(src), chest(dst), c, {speed:22})`; `long` (skewer): far point along the line, speed 40, trail width 0.4 |
| `aoe` | `fx.shockwave(pos, r, c)`; `big`: also `fx.dust(pos,18)`, `fx.debris(pos,10)`, decal `crater`, `feel.impact('aoe',{big:true})`; small: `fx.ring(pos,c,r)` + `fx.dust(pos,8)` |
| `tele` | `h = fx.tele(pos, r, t, c)` (hazard: c orange); keep h to `cancel()` if fight ends |
| `zap` | `fx.zap(chest(src), chest(dst), '#a8d8ff')`, trauma 0.1 |
| `hook` | `fx.chain(chest(src), chest(dst), '#d9e4ee')`, `fx.hit(...)` light, `feel.impact('hit',{dmgFrac:0.1})` |
| `bleed` | `fx.number(dst,'-'+dmg,'thorn')` only when dmg>=3 (spam guard), `fire` -> kind `fire`; no particles per tick (status emitter does it) |
| `status` | stun/slow/bleed/blind/taunt/root -> `fx.status(dst,st,t)` (store handle by unit+st, stop on expiry/down); guard -> `fx.aura(dst,'#9a6ad8',t,{kind:'guard'})`; frenzy/rage -> aura kind rage; rally -> aura rally, teal; spin -> `fx.ult.sustain('wind',dst,3)`; air -> `fx.kickup` + small ring; also `fx.number(dst, LABEL,'status')` |
| `resist` | `fx.number(dst,'RESIST','status')` |
| `heal` | `fx.heal(dst, clamp(amt/maxhp*40,6,16))`, `fx.number(dst,'+'+amt,'heal')` |
| `thorn` | `fx.number(dst, dmg+' THORNS','thorn')`, light spark |
| `rune` | `fx.number(src, NAME,'status')`, `fx.ring(feet,gold,1.6)`; electro -> zap follows as its own event |
| `ult` | `fx.ult.cast(el,pos)`, `feel.impact('ult',{color})`; then impact by id below (same tick for instant ults, `later()` for meteor which already has `tele`) |
| `down` | `fx.hit` crit-class at chest, `fx.dust(feet,14)`, `fx.debris(feet,4)`, `fx.groundDecal(feet,'scuff')`, `fx.number(dst,'DOWN','miss')`; `feel.impact(lastEnemy ? 'finalKill':'kill')`; drop `fx.status` handles of that unit |
| `revive` | `fx.ult.impact('holy', pos, 2.4)`, `feel.impact('revive')`, `fx.number(dst,'REVIVE!','tech')` |
| `roar` | `feel.impact('roar')`; crowd (env_arena) does the wave, no particles on sand |
| `favorready` / `end` | UI banner; `end` also triggers `finalKill` feel if not already fired by the last `down` |
| `duo:*` ult | pincer -> wind impact at target + 2 slashes; wall -> holy sustain on both; storm -> lightning sustain on both |

Ult id -> element: pulverize earth (impact r=3.6), hookshot steel (`chain` + heavy hit), bladedance wind (`ult.impact('wind', landing, 2.4)` + 3 slashes), skewer projectile (steel/gold trail), tornado `ult.sustain('wind', src, 3)`, unbreakable holy (`aura guard` + `ult.impact('holy',pos,2)`), bloodrage `ult.sustain('fire', src, 6)` + aura rage, meteor fire (`tele` then `ult.impact('fire',pos,3.2)` + `feel.impact('meteor')`), duststorm wind (`ult.impact('wind', pos, 8)`; r=8 is huge, drop dust counts via `fx.quality`).
Colors: element hex in `fx.ult.colorOf(el)`; tint hits with the skill color `c` that arena.js already sends.

## Pitfalls (each one bit me)
- Camera-facing sprites near the floor produce hard horizontal clip lines against the sand. The particle vertex shader clamps `wp.y >= uFloor`; keep that.
- Additive glow on bright sand washes out to white and loses color. Use additive only for light (flash, sparks, embers, pillars). Icons (stun stars, chevrons, drips, `!`, plus) must be NORMAL blend with a dark outline baked in the atlas. Dust must be near-white cream with alpha 0.7+, not sand colored.
- Rings, slashes, ribbons use premultiplied blend (src ONE, dst ONE_MINUS_SRC_ALPHA, alpha*0.5) so they stay colored on bright ground.
- `new THREE.Vector4()` defaults w=1: a flash uniform built that way blacks out the whole screen. Initialize (0,0,0,0).
- Colors go through `THREE.Color` (sRGB to linear) and shaders end with tonemapping + colorspace chunks, otherwise fx are off-palette next to materials.
- Atlas cells need a 2% uv inset and no mipmaps, or neighbors bleed.
- Do not sum hit-stops; do not freeze on every light hit (felt as lag). Freeze only med+ hits; for rapid multi-hits prefer the target-only animation hold (4-6 frames on attacker and victim rigs) over global freeze.
- Number glyphs draw with `depthTest:false` at renderOrder 100 and constant screen size; cap simultaneous numbers by skipping `bleed` ticks under 3 dmg and merging same-frame AoE numbers per target.
- Decal canvas upload is the one spike (1024 canvas); it is throttled to 10 Hz. Cap decals to ~1 per hit event class crit/heavy/down; call `clearDecals()` between fights.
- Anchored emitters (status/aura/sustain) must be stopped when the unit dies, or they follow a corpse until `dur` ends.
- Keep shake off UI: apply to the 3D camera only; flash overlay sits above canvas but below HUD (z-index 50).
- Blood-free: bleed is small crimson drips (`status` option `{color}` to change), no splatter decals; scorch/scuff/crack only.

## Crisp hit pass (measured on screenshots)
- impactFlash is now: 0.07 s glow core (size*0.34), 0.05 s white disc, 0.11 s burst rays (size*0.45 to *1.05), thin ring; star4 only for size > 2.2 (ults). The old 3 big overlapping additive sprites (size*1.5..3.2) covered whole fighters.
- fx.hit scales by dmgFrac (f = dmgFrac/0.3): light 5 sparks + 1 debris, heavy 9..14 sparks + ring 1.4 + 3 debris, crit 16 gold + 5 white fast sparks + shockwave 1.9 (distort 0.35) + 5 debris + scuff decal.
- The big yellow stars on fighters were the STUN status icons (0.8 world units, orbit radius 0.5), not the flash. Now 0.38 / 0.42.
