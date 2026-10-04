// Clawspire 2.0 trailer: the WebGL2 "lens" (from tools/nrfh_trailer, extended:
// sharpen for the upscaled footage, a straight RGB split for glitch cuts, a
// colour tint, and the canvas may be smaller than the design space).
//
// The scene is painted with Canvas2D (crisp pixel art, fonts, particles); this
// module turns K sub-frame paints into one film frame:
//   accumulate (true motion blur) -> bright pass -> 5-level dual-filter bloom
//   pyramid -> final lens pass (zoom blur, chromatic split, shockwave
//   displacement, heat haze, glitch bands, god rays, grade, vignette, grain,
//   flash, letterbox).
// Every input is a plain number from the timeline, so a frame is a pure
// function of t: re-render after an edit and everything else reproduces.
'use strict';

const POST_DEFAULTS = () => ({
  exposure: 1.0,
  contrast: 1.06,
  saturation: 1.12,
  lift: [0.018, 0.0, 0.045],      // shadows lean violet (the arcade at dusk)
  gain: [1.03, 1.0, 1.0],
  tint: [1, 1, 1], tintA: 0,      // multiply toward a colour (section grades)
  sharpen: 0.35,                  // unsharp mask on the accumulated frame (footage is upscaled)
  rgb: 0,                         // straight horizontal R/B split in uv (glitch cuts)
  bloom: 0.6, bloomThr: 0.74, bloomKnee: 0.18,
  ca: 0.0006,                     // radial chromatic split (uv units at the corner); impacts only
  zoomBlur: 0, zbCenter: [0.5, 0.5],
  rays: 0, raysPos: [0.5, 0.3], raysDecay: 0.94,
  shocks: [],                     // [{x,y,r,w,a}] in uv, x aspect-corrected in shader
  heat: 0,
  glitch: 0,
  barrel: 0.0,
  vignette: 0.38,
  grain: 0.03,
  flash: [1, 1, 1, 0],
  letterbox: 0,                   // fraction of H covered top and bottom
  fade: 0,                        // 1 = black
});

function makePost(canvas, W, H) {
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false, alpha: false });
  if (!gl) throw new Error('WebGL2 unavailable');
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('float FBO unavailable');
  gl.getExtension('OES_texture_float_linear');

  const VS = `#version 300 es
  in vec2 p; out vec2 uv;
  void main(){ uv = p*0.5+0.5; gl_Position = vec4(p,0.,1.); }`;

  function prog(fs) {
    const mk = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src);
      return s;
    };
    const pr = gl.createProgram();
    gl.attachShader(pr, mk(gl.VERTEX_SHADER, VS));
    gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, '#version 300 es\nprecision highp float;\n' + fs));
    gl.bindAttribLocation(pr, 0, 'p');
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    const U = {};
    const n = gl.getProgramParameter(pr, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(pr, i); U[a.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(pr, a.name); }
    return { pr, U };
  }

  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  function tex(w, h, float) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (float) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function fbo(w, h) {
    const t = tex(w, h, true);
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { t, f, w, h };
  }

  const sceneTex = tex(W, H, false);
  const raysF = fbo(W >> 2, H >> 2);
  const accum = fbo(W, H);
  const levels = [];
  { let w = W >> 1, h = H >> 1; for (let i = 0; i < 6; i++) { levels.push(fbo(w, h)); w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); } }

  const pCopy = prog(`in vec2 uv; out vec4 o; uniform sampler2D s; uniform float k;
    void main(){ o = vec4(texture(s, uv).rgb * k, 1.); }`);
  const pBright = prog(`in vec2 uv; out vec4 o; uniform sampler2D s; uniform vec2 px; uniform float thr, knee;
    void main(){
      vec3 c = texture(s, uv + px*vec2(-.5,-.5)).rgb + texture(s, uv + px*vec2(.5,-.5)).rgb
             + texture(s, uv + px*vec2(-.5,.5)).rgb + texture(s, uv + px*vec2(.5,.5)).rgb;
      c *= .25;
      float br = max(c.r, max(c.g, c.b));
      float soft = clamp(br - thr + knee, 0., 2.*knee);
      soft = soft*soft / (4.*knee + 1e-4);
      float w = max(soft, br - thr) / max(br, 1e-4);
      o = vec4(c * w, 1.);
    }`);
  // dual-filter (Kawase) down / up
  const pDown = prog(`in vec2 uv; out vec4 o; uniform sampler2D s; uniform vec2 px;
    void main(){
      vec3 c = texture(s, uv).rgb * 4.;
      c += texture(s, uv + px*vec2(-1.,-1.)).rgb; c += texture(s, uv + px*vec2(1.,-1.)).rgb;
      c += texture(s, uv + px*vec2(-1.,1.)).rgb;  c += texture(s, uv + px*vec2(1.,1.)).rgb;
      o = vec4(c / 8., 1.);
    }`);
  const pUp = prog(`in vec2 uv; out vec4 o; uniform sampler2D s; uniform vec2 px;
    void main(){
      vec3 c = vec3(0.);
      c += texture(s, uv + px*vec2(-2.,0.)).rgb; c += texture(s, uv + px*vec2(2.,0.)).rgb;
      c += texture(s, uv + px*vec2(0.,-2.)).rgb; c += texture(s, uv + px*vec2(0.,2.)).rgb;
      c += texture(s, uv + px*vec2(-1.,-1.)).rgb*2.; c += texture(s, uv + px*vec2(1.,-1.)).rgb*2.;
      c += texture(s, uv + px*vec2(-1.,1.)).rgb*2.;  c += texture(s, uv + px*vec2(1.,1.)).rgb*2.;
      o = vec4(c / 12., 1.);
    }`);
  const pRays = prog(`in vec2 uv; out vec4 o; uniform sampler2D s; uniform vec2 pos; uniform float decay;
    void main(){
      vec2 dir = (pos - uv) / 40.; vec2 q = uv; float w = 1.; vec3 acc = vec3(0.);
      for (int i = 0; i < 40; i++) { q += dir; acc += texture(s, q).rgb * w; w *= decay; }
      o = vec4(acc / 40., 1.);
    }`);
  const pFinal = prog(`in vec2 uv; out vec4 o;
    uniform sampler2D scene, bloomT, raysT;
    uniform vec2 res; uniform float time, seed;
    uniform float exposure, contrast, saturation, bloom, ca, zoomBlur, rays, heat, glitch, barrel, vignette, grain, letterbox, fade, sharpen, rgb, tintA;
    uniform vec3 tint;
    uniform vec2 zbCenter;
    uniform vec3 lift, gain; uniform vec4 flash;
    uniform vec4 shocks[4]; uniform float shockA[4];
    float hash(vec2 p){ p = fract(p*vec2(443.897, 441.423)); p += dot(p, p.yx+19.19); return fract((p.x+p.y)*p.x); }
    float hash1(float n){ return fract(sin(n*12.9898)*43758.5453); }
    float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
    vec3 shoulder(vec3 x){ float k = .78; return mix(x, k + (1.-k)*(1.-exp(-(x-k)/(1.-k))), step(k, x)); }
    void main(){
      float asp = res.x/res.y;
      vec2 st = uv;
      // lens barrel
      vec2 d0 = st - .5; st = .5 + d0 * (1. + barrel * dot(d0,d0));
      // glitch bands
      if (glitch > 0.) {
        float band = floor(st.y * 38.);
        float h = hash1(band + seed*7.13);
        if (h < glitch*.6) st.x += (hash1(band*3.1+seed) - .5) * glitch * .12;
      }
      // shockwaves: radial displacement rings
      for (int i = 0; i < 4; i++) {
        vec4 s = shocks[i]; float a = shockA[i];
        if (a <= 0.) continue;
        vec2 dv = st - s.xy; dv.x *= asp;
        float dist = length(dv);
        float x = (dist - s.z) / s.w;
        if (abs(x) < 1.) {
          float f = (1. - x*x) * x * a * (1. - smoothstep(.70, .78, st.y));
          vec2 dir = dv / max(dist, 1e-4); dir.x /= asp;
          st -= dir * f * s.w;
        }
      }
      // heat haze
      if (heat > 0.) {
        st += heat * .006 * vec2(noise(st*vec2(18.,11.) + vec2(0., time*3.1)) - .5, noise(st*vec2(9.,21.) - vec2(time*2.3, 0.)) - .5);
      }
      // zoom blur + chromatic split, fused
      vec2 c = zbCenter;
      float rr = length((st - .5) * vec2(asp, 1.)) / length(vec2(asp, 1.)*.5);
      float cak = ca * (.35 + rr*rr);
      int taps = zoomBlur > 0.001 ? 10 : 1;
      vec3 col = vec3(0.); float wsum = 0.;
      for (int i = 0; i < 10; i++) {
        if (i >= taps) break;
        float fi = (float(i) + hash(uv*res + float(i)*7.3) - .5) / 9.;
        float sc = 1. - zoomBlur * fi;
        float w = 1. - fi*.5;
        vec2 q = c + (st - c) * sc;
        vec2 dq = (q - .5);
        col.r += texture(scene, .5 + dq * (1. + cak)).r * w;
        col.g += texture(scene, q).g * w;
        col.b += texture(scene, .5 + dq * (1. - cak)).b * w;
        wsum += w;
      }
      col /= wsum;
      // unsharp mask (cheap 4-tap) and the straight RGB split
      if (sharpen > 0.) {
        vec2 px = 1. / res;
        vec3 nb = texture(scene, st + vec2(px.x, 0.)).rgb + texture(scene, st - vec2(px.x, 0.)).rgb
                + texture(scene, st + vec2(0., px.y)).rgb + texture(scene, st - vec2(0., px.y)).rgb;
        col += (col - nb * .25) * sharpen;
      }
      if (rgb != 0.) {
        col.r = mix(col.r, texture(scene, st + vec2(rgb, 0.)).r, .85);
        col.b = mix(col.b, texture(scene, st - vec2(rgb, 0.)).b, .85);
      }
      // bloom (+ chromatic halo on the bloom too)
      vec3 bl = texture(bloomT, st).rgb;
      col += bl * bloom;
      // god rays: march the bloom toward the light
      if (rays > 0.) col += texture(raysT, st).rgb * rays;
      col *= exposure;
      col = shoulder(col);
      // grade: lift / gain, contrast around mid-grey, saturation
      col = col * gain + lift * (1. - col);
      col = (col - .5) * contrast + .5;
      float l = dot(col, vec3(.2126, .7152, .0722));
      col = mix(vec3(l), col, saturation);
      col = mix(col, col * tint * 1.25, tintA);
      // vignette
      vec2 vv = (uv - .5) * vec2(asp/1.78, 1.);
      col *= 1. - vignette * smoothstep(.25, .95, dot(vv, vv) * 2.2);
      // flash
      col = mix(col, flash.rgb, clamp(flash.a, 0., 1.));
      // grain (luma-weighted, animated)
      float g = hash(uv * res + vec2(seed * 91.7, seed * 13.3)) - .5;
      col += g * grain * (1.1 - l*.6);
      // letterbox
      float lb = letterbox;
      if (uv.y < lb || uv.y > 1. - lb) col = vec3(0.);
      col = mix(col, vec3(0.), clamp(fade, 0., 1.));
      o = vec4(clamp(col, 0., 1.), 1.);
    }`);

  function use(p) { gl.useProgram(p.pr); return p.U; }
  function bind(unit, t) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); }
  function target(f) { gl.bindFramebuffer(gl.FRAMEBUFFER, f ? f.f : null); gl.viewport(0, 0, f ? f.w : W, f ? f.h : H); }
  function draw() { gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }

  let subCount = 0, subK = 1;
  return {
    gl,
    begin(K) {
      subK = K; subCount = 0;
      target(accum); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    },
    // add one Canvas2D paint as a 1/K slice of the shutter
    add(srcCanvas) {
      bind(0, sceneTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas);
      target(accum);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      const U = use(pCopy); gl.uniform1i(U.s, 0); gl.uniform1f(U.k, 1 / subK);
      draw();
      gl.disable(gl.BLEND);
      subCount++;
    },
    finish(P, t) {
      // bright pass
      target(levels[0]);
      let U = use(pBright); bind(0, accum.t);
      gl.uniform1i(U.s, 0); gl.uniform2f(U.px, 1 / W, 1 / H); gl.uniform1f(U.thr, P.bloomThr); gl.uniform1f(U.knee, P.bloomKnee);
      draw();
      // down
      for (let i = 1; i < levels.length; i++) {
        target(levels[i]); U = use(pDown); bind(0, levels[i - 1].t);
        gl.uniform1i(U.s, 0); gl.uniform2f(U.px, 1 / levels[i - 1].w, 1 / levels[i - 1].h); draw();
      }
      // up (additive into the bigger level)
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = levels.length - 1; i > 0; i--) {
        target(levels[i - 1]); U = use(pUp); bind(0, levels[i].t);
        gl.uniform1i(U.s, 0); gl.uniform2f(U.px, 1 / levels[i].w, 1 / levels[i].h); draw();
      }
      gl.disable(gl.BLEND);
      // god rays, marched at quarter res through the blurred bright pass
      if (P.rays > 0) {
        target(raysF); U = use(pRays); bind(0, levels[1].t);
        gl.uniform1i(U.s, 0); gl.uniform2f(U.pos, P.raysPos[0], 1 - P.raysPos[1]); gl.uniform1f(U.decay, P.raysDecay);
        draw();
      }
      // final lens
      target(null);
      U = use(pFinal);
      bind(0, accum.t); bind(1, levels[0].t); bind(2, raysF.t);
      gl.uniform1i(U.scene, 0); gl.uniform1i(U.bloomT, 1); gl.uniform1i(U.raysT, 2);
      gl.uniform2f(U.res, W, H); gl.uniform1f(U.time, t); gl.uniform1f(U.seed, Math.floor((P.seedT != null ? P.seedT : t) * 60) % 997);
      for (const k of ['exposure', 'contrast', 'saturation', 'bloom', 'ca', 'zoomBlur', 'rays', 'heat', 'glitch', 'barrel', 'vignette', 'grain', 'letterbox', 'fade', 'sharpen', 'rgb', 'tintA'])
        gl.uniform1f(U[k], P[k]);
      gl.uniform3fv(U.tint, P.tint);
      gl.uniform2f(U.zbCenter, P.zbCenter[0], 1 - P.zbCenter[1]);
      gl.uniform3fv(U.lift, P.lift); gl.uniform3fv(U.gain, P.gain);
      gl.uniform4fv(U.flash, P.flash);
      const sh = new Float32Array(16), sa = new Float32Array(4);
      (P.shocks || []).slice(0, 4).forEach((s, i) => { sh.set([s.x, 1 - s.y, s.r, s.w], i * 4); sa[i] = s.a; });
      gl.uniform4fv(U.shocks, sh); gl.uniform1fv(U.shockA, sa);
      draw();
    },
  };
}
