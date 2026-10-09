// Park3D TAPE: the VHS tape on the couch in the flat, the 3D half of WATCH A BEATBOX TAPE (the game half is beatbox_heroes/tape.js, BBH.Tape).
//   playTape(world, opts) -> Promise<{ tape, shown, ids, skipped } | null>     the one entry point (r3 game glue and, later, the cutscene engine call this)
//     world: the flat world (host world object). null or a world without a TV anchor -> the 2D experience (player.play(null, opts)).
//     opts: { facts, tape, player (default globalThis.BBH.Tape), speed, reduce, seat (default true: seat the hero on the couch when no spot cinematic did) }
//   The sequence: over-the-shoulder shot from the couch, a cassette slides into the deck (clunk), the TV goes blue > snow > PLAY with tracking lines, the camera pushes in until the screen
//   fills the width, then the overlay picture grows out of the screen rect (BBH.Tape: VHS video, kinetic fact cards, TV audio, SKIP / hold to skip), and at the end the tape rewinds, the
//   picture shrinks back into the TV and the camera pulls back to the couch before control returns. No new imports: THREE comes from world.ctx, so the module stays tiny in the core chunk.
//   Camera: the controls keep running; every frame (terrain.update is wrapped, it runs after controls.update) the camera is blended from the controls' pose to the tape rig by weight w.
const NOP = () => {};
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function playTape(world, opts) {
  opts = Object.assign({}, opts || {});
  const G = typeof globalThis !== 'undefined' ? globalThis : window, player = opts.player || (G.BBH && G.BBH.Tape);
  if (!player || typeof player.mount !== 'function') return Promise.resolve(null);
  const A = world && world.terrain && world.terrain.anchors, tvA = A && A.tv, THREE = world && world.ctx && world.ctx.THREE;
  if (!world || !world.scene || !world.camera || !tvA || !THREE) return player.play(null, opts);
  return run(world, opts, player, THREE, A, tvA).catch((e) => { console.error('[park3d tape]', e); return null; });
}

async function run(world, opts, player, THREE, A, tv) {
  const cam = world.camera, scene = world.scene, terrain = world.terrain, controls = world.controls || {}, speed = () => opts.speed || player.speed || 1;
  const reduce = opts.reduce !== undefined ? !!opts.reduce : false;
  // ---------------------------------------------------------------- the hero on the couch (the spot cinematic usually did this already)
  const seat = A.couchSpot || { x: -4.4, z: -1.55, rot: Math.PI };
  if (opts.seat !== false && controls.inSpot !== 'couch' && controls.teleportTo) { try { controls.teleportTo(seat.x, seat.z, { face: seat.rot, free: true }); world.player.play('sit', { seat: seat.seatY || 0.46 }); } catch (e) { /* ignore */ } }
  const pp = new THREE.Vector3(seat.x, 0, seat.z);   // the seat, not the live position: the spot cinematic may still be sliding the hero onto the couch
  // ---------------------------------------------------------------- the TV picture (a canvas texture over the screen) and the cassette
  const tvV = player.video(256, 144, { osd: true, scan: true }), tex = new THREE.CanvasTexture(tvV.canvas); tex.colorSpace = THREE.SRGBColorSpace || tex.colorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  const facts = opts.facts && opts.facts.length ? opts.facts : null; if (facts) tvV.setEra(facts[0].era, facts[0].year); tvV.setMode('blue');
  const rig = new THREE.Group(); rig.name = 'tape_rig'; scene.add(rig);
  const scrM = new THREE.Mesh(new THREE.PlaneGeometry(tv.w, tv.h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
  scrM.position.set(tv.x, tv.y, tv.z + 0.006); scrM.renderOrder = 6; rig.add(scrM);
  const glow = new THREE.PointLight(0x6fa8ff, 0, 4.5, 2); glow.position.set(tv.x, tv.y, tv.z + 0.7); rig.add(glow);
  const cas = new THREE.Group(), shell = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.025, 0.105), new THREE.MeshLambertMaterial({ color: 0x1b1626 })), lab = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.07), new THREE.MeshBasicMaterial({ color: 0xffd23f, toneMapped: false }));
  lab.rotation.x = -Math.PI / 2; lab.position.y = 0.0131; cas.add(shell, lab); const deck = tv.deck || { x: tv.x, y: 0.24, z: tv.z + 0.16 }; cas.position.set(deck.x, deck.y + 0.05, deck.z + 0.42); cas.visible = false; rig.add(cas);
  // ---------------------------------------------------------------- the camera rig (blended over whatever the controls set this frame)
  const look = new THREE.Vector3(tv.x, tv.y - 0.03, tv.z);
  // over the right shoulder: behind and above the couch, the hero's head and shoulders low in frame, the TV wall ahead
  const K1 = { p: new THREE.Vector3(pp.x + 0.25, 1.78, pp.z + 1.75), l: new THREE.Vector3(tv.x - 0.35, 0.92, tv.z + 0.6), fov: 56 };
  const asp = Math.max(0.3, cam.aspect || 9 / 16), fovK2 = 30, dist = (tv.w / 1.12) / (2 * Math.tan(fovK2 * Math.PI / 360) * asp);
  const K2 = { p: new THREE.Vector3(tv.x, tv.y + 0.01, tv.z + Math.min(dist, Math.abs(pp.z - tv.z) - 0.15)), l: look.clone(), fov: fovK2 };
  const R = { p: K1.p.clone(), l: K1.l.clone(), fov: K1.fov, w: 0 }, base = { p: new THREE.Vector3(), q: new THREE.Quaternion(), fov: 40 }, tq = new THREE.Quaternion(), m4 = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0);
  let tvT = 0, live = true, last = performance.now() / 1000;
  const prevUpd = terrain.update;
  terrain.update = function (dt, t) {
    if (prevUpd) prevUpd.call(terrain, dt, t);
    if (!live) return;
    const n = performance.now() / 1000, rd = Math.min(0.1, n - last); last = n; tvT += rd * speed(); tvV.draw(tvT); tex.needsUpdate = true;
    if (R.w <= 0) return;
    base.p.copy(cam.position); base.q.copy(cam.quaternion); base.fov = cam.fov;
    m4.lookAt(R.p, R.l, up); tq.setFromRotationMatrix(m4);
    cam.position.lerpVectors(base.p, R.p, R.w); cam.quaternion.copy(base.q).slerp(tq, R.w); cam.fov = base.fov + (R.fov - base.fov) * R.w;
    if (cam.view && cam.view.enabled) { cam.view.offsetY *= 1 - R.w; cam.view.offsetX *= 1 - R.w; }
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  };
  const frames = () => new Promise((res) => { let n = 0; const f = () => (++n >= 2 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); setTimeout(res, 120); });
  const tween = (ms, f) => new Promise((res) => { const t0 = performance.now(), d = ms / speed(); const st = () => { const k = clamp((performance.now() - t0) / d, 0, 1); f(ease(k), k); if (k < 1) requestAnimationFrame(st); else res(); }; if (d <= 0) { f(1, 1); res(); } else st(); });
  // the push swings out to the right and up, so the hero's head leaves the frame on the left before the camera passes it; past that point the hero is hidden (he is behind the lens)
  const hero = world.player && world.player.object, arc = (k) => Math.sin(Math.PI * k);
  const lerpKey = (a, b, k) => { R.p.lerpVectors(a.p, b.p, k); R.p.x += 0.55 * arc(k); R.p.y += 0.2 * arc(k); R.l.lerpVectors(a.l, b.l, k); R.fov = a.fov + (b.fov - a.fov) * k; if (hero) hero.visible = (a === K2 ? 1 - k : k) < 0.78; };
  const rectOfTv = () => {
    const r = world.renderer && world.renderer.domElement ? world.renderer.domElement.getBoundingClientRect() : null; if (!r || r.width < 2) return null;
    const v = new THREE.Vector3(), pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => { v.set(tv.x + sx * tv.w / 2, tv.y + sy * tv.h / 2, tv.z).project(cam); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; });
    const x0 = Math.min(...pts.map((p) => p.x)), x1 = Math.max(...pts.map((p) => p.x)), y0 = Math.min(...pts.map((p) => p.y)), y1 = Math.max(...pts.map((p) => p.y));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  const spotsG = world.spots && world.spots.group, spotsVis = spotsG ? spotsG.visible : true; if (spotsG) spotsG.visible = false;   // no floating spot label in the shot
  const ctrl = player.mount(Object.assign({}, opts, { reduce: reduce || undefined }));
  const skipP = new Promise((res) => ctrl.onSkip(res)), pause = (ms) => Promise.race([new Promise((res) => setTimeout(res, ms / speed())), skipP]);
  let result = null;
  try {
    ctrl.el.style.background = 'transparent';
    // 1. over the shoulder (from wherever the spot camera is)
    await tween(reduce ? 300 : 1100, (k) => { R.w = k; lerpKey(K1, K1, 0); });
    // 2. the cassette slides into the deck, clunk, the TV wakes up
    scrM.material.opacity = 1; glow.intensity = 0.5; cas.visible = true; ctrl.audio.start();
    const c0 = cas.position.clone(), c1 = new THREE.Vector3(deck.x, deck.y + 0.01, deck.z - 0.02);
    await Promise.race([tween(reduce ? 200 : 700, (k) => { cas.position.lerpVectors(c0, c1, k); }), skipP]); cas.visible = false; ctrl.audio.clunk();
    tvV.setMode('snow'); glow.intensity = 0.9; await pause(320); tvV.setMode('play'); glow.color.setHex(0xff7ad0);
    // 3. push in until the screen fills the width
    if (!ctrl.skipped) await Promise.race([tween(reduce ? 400 : 2300, (k) => lerpKey(K1, K2, k)), skipP]);
    lerpKey(K1, K2, 1); await frames();
    // 4. the picture leaves the TV and fills the screen; the tape plays
    const r0 = rectOfTv(); await ctrl.enter(r0);
    result = await ctrl.run();
    // 5. back into the TV (it shows the rewind), pull back to the couch, hand the camera back
    tvV.setMode('blue'); await ctrl.exit(rectOfTv() || r0);
    await tween(reduce ? 400 : 1300, (k) => lerpKey(K2, K1, k)); glow.intensity = 0.4;
    await tween(reduce ? 300 : 800, (k) => { R.w = 1 - k; });
  } finally {
    live = false; R.w = 0; if (spotsG) spotsG.visible = spotsVis; if (hero) hero.visible = true; terrain.update = prevUpd || NOP; if (!prevUpd) delete terrain.update;
    try { ctrl.unmount(); } catch (e) { /* ignore */ }
    scene.remove(rig); rig.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); tex.dispose();
  }
  return result;
}
export default playTape;
