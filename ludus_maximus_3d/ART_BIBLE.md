# Ludus Maximus 3D: Art Bible and Engineering Contract

Goal: a near-AAA, browser-native 3D gladiator school manager with real-time 3D arena combat. Vanilla ES modules, three.js r170 vendored in ./vendor (importmap), NO build step, NO network at runtime, NO image/model files: everything is procedural geometry, canvas textures, GLSL and WebAudio synthesis. (No paid generation.)

## Look: "Golden Hour Rome, painterly and heroic"
- Palette: sun-baked sand #d9b27c, travertine #e8dcc0, terracotta #b5532f, Tyrian purple #5a1f5e, laurel green #5b7a3a, bronze #b8803a, polished gold #f2c14e, iron #5c6068, deep shadow blue #2a2540. Never pure black; shadows lean violet.
- Light: low warm sun (key, 1 shadow caster, 2048 desktop / 1024 mobile), cool sky hemisphere fill, warm bounce from sand, rim light on fighters. ACESFilmic tone mapping, exposure tuned on play frames.
- Post (max 2 extra passes): bloom on emissives only, then one custom grade pass = vignette + subtle grain + warm/cool split tone + very light chromatic aberration pulse on heavy hits.
- Proportions: heroic 7-head stylized, chunky armor, readable silhouette at phone size. Each of the 5 styles has a unique silhouette (see characters).
- Surfaces: shared material library with procedural canvas textures (stone blocks, sand, wood grain, cloth weave, leather, hammered metal). Vertex-color gradients fake AO. Edges: thin trim meshes instead of bevel cost.
- Detail rule: authored forms first, materials second, light third, FX last. Fog/bloom never substitute for geometry.

## Characters
Joint hierarchy of Object3D pivots (hips, spine, chest, neck, head, shoulderL/R, elbowL/R, wristL/R, hipL/R, kneeL/R, ankleL/R), limbs from tapered capsule/lathe geometry, procedural animation (idle, walk, run, attack variants per style, block, hurt, stun, knockdown, death, victory, taunt, cheer). Style gear:
- Murmillo: tall scutum shield, fish-crest bronze helm, short gladius, manica arm guard.
- Retiarius: no helm, galerus shoulder plate, trident + weighted net (net is a cloth-like mesh that can be thrown), light tunic.
- Thraex: griffin-crest helm with brim, small square shield, curved sica, greaves both legs.
- Hoplomachus: plumed helm, round shield, long spear, linen cuirass.
- Dimachaerus: two blades, bare-chested leather straps, bandana/open helm, wrist wraps.
Each gladiator customised from sim data: skin, hair, plume color, rarity-tinted metals on equipped items, stars/level shown as laurel pips.

## World
- Ludus (hub): walled training courtyard on a hillside above the city, orbit/pan/zoom camera (touch friendly), 4x4 building plots like the sim (LM.COLS=4, plots up to 16) rendered as real 3D buildings (kitchen, barracks, palaestra, forge, infirmary, scout tower, etc., see core/data.js D.BUILD), upgrade levels visibly change meshes, ambient life (walking fighters, torch flames, smoke, birds, banners), day/night + weather.
- Arena: elliptical colosseum bowl with tiers of instanced crowd (thousands of billboards/low-poly bodies with wave and cheer animation), arches, velarium shade cloth, banners, torches, sand floor with footprints, scuffs and (gore setting permitting) blood decal trail, gate portcullis intro, themed per league.
- Camera: cinematic director for fights (establishing flyover, tracking, ultimate close-ups with slow-mo, kill cam, victory orbit). Touch: tap ultimates, optional free orbit.

## Budgets
Desktop <=300 draw calls, <=750k tris. Mobile <=150 calls, <=300k tris, DPR cap 1.5, 1 shadow light 1024. Quality tiers auto-select (high/medium/low) with a runtime FPS governor.

## Modules (js/)
materials.js (material lib + procedural textures) · rig.js/gladiator.js (character factory + animation) · gear.js (weapons/armor meshes) · env_ludus.js (hub) · env_arena.js (arena + crowd) · fx.js (particles, slashes, decals, trails, camera shake) · post.js (composer, grade) · audio.js (WebAudio synth: music, crowd, sfx) · director.js (fight camera) · fightview.js (binds core/arena.js units to 3D actors) · ui/*.js (HTML overlay) · main.js.
Sim lives in core/ (forked from ../ludus_maximus, save key ludus_maximus_3d_v1). Do not break its determinism or the `npm run test:ludus3d` suite.

## Rules
No em dashes in any text. Never add counter mechanics beyond what core already has. Phone first: tap targets >= 44px, safe areas, text fits.
