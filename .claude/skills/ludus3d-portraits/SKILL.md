---
name: ludus3d-portraits
description: Ludus Maximus 3D only. 3D gladiator portraits (js/portrait.js) for roster, profile, recruit and market screens: queued offscreen bust renders of the real createGladiator rig, caching, ctx.portrait wiring, framing options, lab and screenshot recipe.
---

# Gladiator portraits (js/portrait.js)

`createPortraitRenderer({tier, renderer?})` returns `portrait(glad,{w,h,pose,style})`, `portraitAsync`, `portraitSync` (cached copy or null), `dataURL`, `flush(n)`, `pending`, `stats`, `dispose`. The module also exports `portraitSync = () => null` for callers with no renderer (they keep `styleBadge`).

- Scene: own tiny scene, warm key (upper right front), cool rim (back left), hemisphere fill, canvas gradient backdrop in the art bible palette (shadow blue to Tyrian purple tinted by the style colour, gold glow behind the head, violet vignette). ACES tone mapping.
- Renderer: ONE shared offscreen WebGLRenderer (created lazily, `preserveDrawingBuffer`, low-power) copied to a 2D canvas with drawImage. Passing `renderer` instead renders into a MSAA render target of that renderer and reads pixels back; clear colour, target, tone mapping, autoClear, xr, shadow autoUpdate and info counters are restored (slightly flatter look, no tone-mapped contrast). The game uses the offscreen one.
- Queue: max ONE render per requestAnimationFrame, deduped by cache key, never inside the caller's frame. Each job builds a fresh rig (about 10 ms CPU, 20 to 40 ms on weak phones), poses it with 14 idle steps, renders, disposes it.
- Cache key: id, lvl, style, name, skin/hair/plume/tunic colours, face/beard/hair, gear signature (slot:id:rarity), w, h, pose, framing. Masters are LRU (64); every call hands out its OWN canvas copy (a canvas cannot sit in two DOM places). A not-yet-rendered canvas is blank and gets drawn when ready and fires a `portrait` event.
- Framing `style`: `bust` (default; arms relaxed with `setWeapon('unarmed')` so the shield and blade hang below the frame, otherwise they cover the face), `three` (to the belt, armed), `full`. `pose`: idle, guard (raised arms even in bust), victory, taunt, block.

## Game wiring
`Game.portraitEl(glad, size)` (js/game.js) exposed as `ctx.portrait(glad, size, opts)`: returns the round gold-framed `styleBadge` immediately and swaps in the render (128 px for sizes up to 64, else 192, CSS scaled, round) when ready. Screens already call `portrait(ctx,g,size)` from `screens/ui_common.js` / `armory_parts.js`, so no layout changes: it keeps the same box as the badge.

## Verify
Lab: `lab/portrait_lab.html?rar=3&frame=bust|three|full&pose=victory&shared=1&size=200` (sets `window.__portraitDone`). Roster: `node tools/ludus3d_shot.mjs "http://127.0.0.1:8211/ludus_maximus_3d/index.html?new=1&rich=1&tier=low&manual=1" out --w 390 --h 800 --at 0.5 --eval "<push glads with LM.makeGlad, await game.open('roster'), wait until game._portraits.pending is 0>"`.

## Pitfalls
- Software GL renders take 0.4 to 2 s each, so wait for `pending === 0` before screenshots.
- Weapon and shield in the hands hide the face in a bust: keep the unarmed pose for `bust`.
- Do not reuse a rig between jobs, gladiator.js bakes palette and gear at creation.

## Scars and wounds (wave 3)
The cache key includes `g.scars` and the wound part ids, so a new scar or bandage re-renders. Contact sheet recipe: `const P = (await import('/ludus_maximus_3d/js/portrait.js')).createPortraitRenderer({tier:'low'})`, then for each case `document.body.append(P.portrait(Object.assign({}, glad, {id: 100+i, style: 'retiarius', scars: ['lost_eye'], wounds: [{id:'head', part:'head', w:2, w0:2}]}), {w: 420, h: 480, style: 'bust'}))` and `P.flush(99)`; screenshot with `tools/ludus3d_shot.mjs`. Use a retiarius (no helmet) to see face marks.

FIGHTERS: the portrait cache key includes `JSON.stringify(g.look)`, so the Look sheet previews a draft look live (`ctx.portrait(Object.assign({}, g, {look: draft}), size)`) and old cached busts never show a stale tattoo or hair colour.
