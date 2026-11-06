// GLSL sources and per-act grades for ui/post.js. Pure data: no DOM, safe to import under node.
// All passes share one vertex shader. uv has its origin at the TOP-LEFT of the 2D canvas (the y flip happens here, so the
// source texture is uploaded unflipped and logical px map to uv by x/1280, y/720).
export const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main(){ uv = vec2(p.x * .5 + .5, .5 - p.y * .5); gl_Position = vec4(p, 0., 1.); }`;

const HEAD = '#version 300 es\nprecision highp float;\nin vec2 uv; out vec4 o;\n';

// Soft-knee threshold on 4 bilinear taps (box prefilter, kills fireflies), writes the half-res bloom base.
export const FS_THRESH = HEAD + `uniform sampler2D t; uniform vec2 px; uniform float thr, knee;
vec3 soft(vec3 c){ float l = max(c.r, max(c.g, c.b)); float q = clamp(l - thr + knee, 0., 2. * knee);
  q = q * q / (4. * knee + 1e-4); float w = max(q, l - thr) / max(1. - thr, 1e-3); return c * clamp(w, 0., 1.); } // ramps 0 at the threshold to full colour at white
void main(){
  vec3 c = soft(texture(t, uv + px * vec2(-1., -1.)).rgb) + soft(texture(t, uv + px * vec2(1., -1.)).rgb)
         + soft(texture(t, uv + px * vec2(-1., 1.)).rgb) + soft(texture(t, uv + px * vec2(1., 1.)).rgb);
  o = vec4(c * .25, 1.); }`;

// Dual filter downsample (Kawase / Marius Bjorge): centre x4 + 4 diagonal taps.
export const FS_DOWN = HEAD + `uniform sampler2D t; uniform vec2 px;
void main(){ vec3 c = texture(t, uv).rgb * 4.;
  c += texture(t, uv + px * vec2(-1., -1.)).rgb; c += texture(t, uv + px * vec2(1., -1.)).rgb;
  c += texture(t, uv + px * vec2(-1., 1.)).rgb;  c += texture(t, uv + px * vec2(1., 1.)).rgb;
  o = vec4(c * .125, 1.); }`;

// Tent upsample of the smaller level, added to the same-size downsample (`skip`); no blending, so no read-modify-write.
export const FS_UP = HEAD + `uniform sampler2D t, skip; uniform vec2 px;
void main(){
  vec3 c = texture(t, uv + px * vec2(-1., 0.)).rgb + texture(t, uv + px * vec2(1., 0.)).rgb
         + texture(t, uv + px * vec2(0., -1.)).rgb + texture(t, uv + px * vec2(0., 1.)).rgb;
  c += (texture(t, uv + px * vec2(-.5, -.5)).rgb + texture(t, uv + px * vec2(.5, -.5)).rgb
      + texture(t, uv + px * vec2(-.5, .5)).rgb + texture(t, uv + px * vec2(.5, .5)).rgb) * 2.;
  o = vec4(c * (1. / 12.) + texture(skip, uv).rgb, 1.); }`;

// Composite. swA[i] = (x, y, radius, amp) in uv / height units (amp 0 = slot free), swB[i].x = ring width.
// mask[i] = (x0, y0, x1, y1) in uv; inside (plus a 10 logical px feather) warp and aberration are zeroed and bloom is damped.
export const FS_COMP = HEAD + `uniform sampler2D t, bloom;
uniform float bloomK, caK, vig, grain, seed, flashA, gamma, sat;
uniform vec3 flashC, lift, gain; uniform vec2 res;
uniform vec4 swA[4]; uniform vec4 swB[4]; uniform vec4 mask[8]; uniform int nMask;
const float ASPECT = 1.7777778;
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float maskAt(vec2 u){ float m = 0.;
  for (int i = 0; i < 8; i++){ if (i >= nMask) break; vec4 r = mask[i];
    float dx = max(r.x - u.x, u.x - r.z) * 1280.; float dy = max(r.y - u.y, u.y - r.w) * 720.;
    m = max(m, 1. - clamp(max(dx, dy) / 10., 0., 1.)); }
  return m; }
void main(){
  float m = nMask > 0 ? maskAt(uv) : 0.; float live = 1. - m;
  vec2 d = vec2(0.);
  for (int i = 0; i < 4; i++){ if (swA[i].w <= 0.) continue;
    vec2 v = uv - swA[i].xy; v.x *= ASPECT; float r = length(v);
    float x = (r - swA[i].z) / swB[i].x; float f = exp(-x * x) * swA[i].w;
    d += (v / (r + 1e-4)) * f * vec2(1. / ASPECT, 1.); }
  vec2 u = uv - d * live;
  vec3 c;
  if (caK > 1e-6){ vec2 off = (u - .5) * caK * live;
    c = vec3(texture(t, u + off).r, texture(t, u).g, texture(t, u - off).b); }
  else c = texture(t, u).rgb;
  if (bloomK > 0.) c += texture(bloom, u).rgb * bloomK * 3. * (1. - .7 * m);
  c = c * gain + lift; c = pow(max(c, 0.), vec3(1. / gamma));
  float L = dot(c, vec3(.299, .587, .114)); c = mix(vec3(L), c, sat);
  // filmic shoulder: untouched below .92, rolls highlights (bloom sums) off towards 1
  vec3 hi = max(c - .92, 0.); c = min(c, vec3(.92)) + .08 * (1. - exp(-hi / .08));
  vec2 cd = uv - .5; float v = smoothstep(.95, .25, length(cd * vec2(ASPECT * .8, 1.)));
  c *= mix(1., v, vig);
  if (grain > 0.) c += (hash(uv * res + vec2(seed * 37., seed * 17.)) - .5) * grain;
  c = mix(c, flashC, flashA);
  o = vec4(c, 1.); }`;

// Grades: [liftR, liftG, liftB, gainR, gainG, gainB, gamma, saturation, vignette]. Subtle on purpose (ART_BIBLE: warm / teal / plum).
export const GRADES = {
  neutral: [0, 0, 0, 1, 1, 1, 1, 1, 0.34],
  ward:    [0.010, 0.004, 0.000, 1.035, 1.000, 0.945, 1.00, 1.04, 0.40],
  market:  [0.000, 0.006, 0.008, 0.955, 1.012, 1.030, 1.00, 1.00, 0.42],
  theatre: [0.010, 0.000, 0.012, 1.000, 0.950, 1.035, 0.98, 0.98, 0.46],
  boss:    [0.012, 0.000, 0.000, 1.050, 0.930, 0.920, 0.96, 1.06, 0.52],
  title:   [0.006, 0.003, 0.000, 1.030, 1.000, 0.960, 1.00, 1.02, 0.50],
};
