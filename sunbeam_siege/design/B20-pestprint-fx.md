# B20: Pestprint, Icons, FX (API)
Files: src/gfx/pestprint.js, icons.js, fx.js (classic scripts, load in any order). Demo: demo/B20-demo.html.
Namespace: SB.gfx.pestprint, SB.gfx.icons, SB.gfx.fx. Logical pixel coordinates, nearest neighbor, no images.

## pestprint
- descriptor: {species, size:'S'|'M'|'L'|'B' (Small 1, Medium 2, Large 3, Boss 5), colors:[base,accent,accent2] or {base,accent,accent2}, accessory, ears:'floppy'|'pointy' (dogs), seed, boss, facing:'left'}
- species: mouse rat hamster squirrel dog crow raccoon fox snake spider flea goose vacuum mop spray cucumber bathtub carrier hose laserdot door hairdryer balloon
- aliases accepted: dog_small/medium/large/floppy/pointy, spray_bottle, vet_carrier, red_dot, hair_dryer, garden_hose, boss_rat_king, boss_hose, boss_vacuum (vacuum_mk9), boss_spray, boss_carrier, boss_reddot. A leading `pest_` is stripped. Unknown species falls back to mouse.
- accessories: none crown hat_top helmet bandana eyepatch scar bowtie party goggles monocle horns cape sunglasses
- make(desc) -> {frames:{idle0,idle1,attack,hurt,dead} (canvases), w,h, anchor{x,y,w,ex,ey}, bounds, capacity, flying}. Cached by descriptor.
- drawPest(ctx, desc, pose, x, y, scale, tick, opts) : x,y = feet (bottom center). pose = 'idle' (alternates idle0/idle1 every 30 ticks at 60Hz, per-sprite phase), 'attack', 'hurt', 'dead', 'death' (opts.t 0..1: white flash, then dead frame fading).
  opts: flash (true or color, use fx.isFlashing(id)), alpha, flip, phase, idleTicks, noBob, reduceMotion (no idle1, no float).
  Returns the drawn rect. Sprites face LEFT (toward cats). Flyers (crow, balloon, red dot) bob.
- pixels(desc, pose, max) -> [{x,y,color}] feet centered, for fx.deathBurst. flashFrame(desc,pose,color) -> white silhouette canvas. catalog lists demo ids.

## icons
- names, meta(name)->{kind:'buff'|'debuff'|'neutral', group, label}, groups('status'|'intent'|'keyword'|'currency'|'floor'|'stat'|'gem'|'clan'|'ui')
- draw(ctx,name,x,y,{scale=2,cb,frame,tint,alpha}) ; canvas(name,scale,opts) ; dataURL(...) ; svg(name,scale,opts) for DOM.
- 12x12 px (auto outline). opts.cb adds the colorblind corner badge (up triangle buff, down triangle debuff, square neutral). opts.frame outlines in A04 kind color (green, red, amber).
- Currency: fish warmth zoomies lives nip. Intents: attack multi_attack climb buff debuff summon scare defend sleep sunbeam unknown.
- Statuses (A04 ids): claws purr fluff rested hidden bristle cozy frenzy catnip crash rage wet scared dizzy hiss yarn marked shatter hairball. Floor: puddle clutter box heatlamp.
- Keywords: exhaust fleeting retain innate unplayable reborn pounce knock nap nine_lives witching. Also hp atk plus up_arrow down_arrow paw star crown skull, gem_common..gem_curse, clan_alley/hearth/moon/mischief.

## fx (default instance SB.gfx.fx; fx.create(opts) for isolated ones, opts {seed, reduceMotion, speed, shakeScale})
- loop: fx.update(dtMs) each frame (fixed 60Hz inside, honours speed). fx.draw(ctx) after sprites. Translate the scene and HUD by fx.shakeOffset().
- fx.hitStop(ms) / isHitStopped(); fx.flash(id,ms=66) / isFlashing(id); fx.shake(power,ms) or shakeEvent('hit'|'bigHit'|'catDies'|'sunbeamHit'|'bossSlam'|'knock').
- Numbers: fx.number(x,y,value,kind,{index,big}) kinds damage crit heal block shatter hairball warmth purr. Pixel font: drawText(ctx,str,x,y,{scale,color,align,outline}), textWidth. Max 24 live.
- Presets: hit(x,y,color) slash(x,y,{dir}) heal/purr/hearts(x,y) dust(x,y) sparkle(x,y,n) hairball(from,to,done) splat yarn(from,to,{loops}) yarnTrail(points) pawTrail(from,to) warmthGain(from,to,done) fishGain energy catnip(x,y,w,h) zoomies(w,h) vignette(color,ms) tint confetti(w) deathBurst(x,y,pixels,scale) ghost(x,y,drawFn) zzz(key,x,y)/zzzMove/zzzStop sunbeamMotes(on,x0,x1,y0) drawStars(ctx,stars,tick).
- Cards: cardCurve(S,E,kind) -> {ms,at(t)}; flyCard(el,S,E,kind,{base,done}) -> Promise (WAAPI); kinds draw unit spell discard created reward; shakeCard(el).
- Reduce motion: fx.setReduceMotion(bool|null). null follows html.reduce-motion or prefers-reduced-motion. Shake off, particles replaced by one static glyph, numbers in place 700ms, cards crossfade 120ms.
- Visual only: own RNG, never touches battle RNG. Pool 400 particles.

## Notes
- Unresolved: stars and house layers belong to the scene agent; Hidden (Box) cat opacity is a renderer choice.
