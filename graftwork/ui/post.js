// WebGL2 post-processing layer (bloom, chromatic aberration, shockwaves, grade, vignette, grain). STUB: the post engineer replaces it.
// The 2D canvas stays the render target of every screen; the visible canvas becomes a GL canvas showing the processed result
// (pointer events keep hitting the 2D canvas). Gameplay code calls the API below and must be safe when it is a no-op.
export function installPost(app) {
  app.post = {
    on: false,
    setQuality() {}, setGrade() {}, setBloom() {}, shockwave() {}, aberration() {}, flash() {}, vignette() {},
    setMaskRects() {}, // logical-px rects [x,y,w,h] where warp and aberration are disabled (hand, top bar, tooltips)
    update() {}, render() {},
  };
}
