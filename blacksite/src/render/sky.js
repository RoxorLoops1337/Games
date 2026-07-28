// Sky, sun, and the air in between.
//
// Three things come out of this file and they are all the same physics:
//
//   1. the sky dome you look at,
//   2. the image-based light that everything metal reflects,
//   3. the aerial perspective that tints everything more than ~20 m away.
//
// They are one model on purpose. The single loudest "this is a WebGL demo" tell
// is a sky that disagrees with its own lighting — a blue gradient overhead, a
// warm key light, and a grey fog colour that belongs to neither. Deriving all
// three from one scattering integral means the horizon haze is *the same colour*
// as the horizon sky, and the fog on a distant wall is the light that would
// actually have been scattered into that line of sight.
//
// The model is single-scattering Rayleigh + Mie with ozone absorption, marched
// through a spherical atmosphere (Nishita's integral with Bruneton's coefficients).
// Ozone is not a detail: it is the entire reason a low-sun sky goes deep teal
// overhead instead of muddy brown. Rayleigh alone, at 8° sun elevation, gives you
// a sepia photograph — the sun's light has already been stripped of blue on its
// way in, so there is no blue left to scatter down at you. The blue-green you
// actually see at dusk is light that took a *short* path down through the ozone
// layer after the long path in, and only the ozone term produces it.
//
// Everything expensive runs once, into a cubemap, and only re-runs when the sun
// moves. The per-frame cost is one cube fetch on the dome and a few ALU ops in
// every patched fragment shader.

import * as THREE from 'three';

// ── the atmosphere ───────────────────────────────────────────────────────────
// Earth-scale, in metres. The planet radius matters: it is what makes a ray
// toward the horizon travel ~40× further through the air than a ray toward the
// zenith, and that ratio is the horizon glow. A flat-earth "hemisphere dome"
// approximation gets the gradient shape wrong at exactly the elevations a
// first-person camera spends all its time looking at.
const R_GROUND = 6360000;
const R_TOP    = 6420000;
const H_RAY    = 8000;      // Rayleigh scale height
const H_MIE    = 1200;      // aerosols hug the ground, hence the low horizon haze
const OZ_MID   = 25000;     // ozone layer centre / half-width, as a tent function
const OZ_WID   = 15000;

// Scattering coefficients at 680/550/440 nm (Bruneton 2017), per metre. The
// ozone figures are scaled up ~40% over the reference profile: a real 300 DU
// column is a summer average, and pushing it deepens the teal at the zenith
// without touching the horizon, which is the exact axis the art direction wants.
const OZ_SCALE = 1.4;
const BETA_RAY = [5.802e-6, 13.558e-6, 33.100e-6];
const BETA_MIE = 3.996e-6;
const BETA_OZO = [0.650e-6 * OZ_SCALE, 1.881e-6 * OZ_SCALE, 0.085e-6 * OZ_SCALE];
const MIE_G    = 0.76;      // forward-scattering asymmetry — this is the aureole
// Mie extinction exceeds Mie scattering because aerosols absorb as well as
// redirect; 0.9 single-scatter albedo is the usual continental-haze figure.
const MIE_ALBEDO = 0.9;

// Single scattering alone leaves the anti-solar sky too dark and too green: the
// light that reaches it has bounced more than once and the second-order term is
// not small at these path lengths. Rather than a second integral, add the same
// accumulated scattering back isotropically — cheap, and it puts the blue back
// where the phase function refuses to.
const MS_BOOST = 0.6;

// Samples are placed at t = tMax·x³ rather than uniformly. A horizon ray crosses
// ~500 km of atmosphere but 80% of the density is in the first 15 km, so uniform
// stepping spends its whole budget in vacuum and comes back with a horizon that
// is far too bright — the single worst artefact this model can produce, because
// it lands exactly at eye level.
const STEP_POWER = 3.0;

// Radiance scale for the sun. Arbitrary units — the whole chain is relative, and
// this is the number that decides where the sky sits against a display white of
// 1.0. Chosen so the anti-solar horizon lands just under clipping and the
// aureole lands just over it.
const SUN_I = 14.0;
const SUN_ANG = 0.00465;    // solar angular radius, radians (0.266°)

// Extinction applied to the sky dome's own ground, per metre. See the uniform
// below for why it is not the same number as the level's fog density.
const GROUND_HAZE = 0.022;

// Highlight shoulder. See `shoulder()` below for why this is here at all.
const KNEE = 0.55;
const SHOULDER = 0.9;

// Art direction: a decommissioned missile site at dusk. Low enough that shadows
// rake across the pads, high enough that the sun is still a disc rather than a
// smear, and high enough that the shadow map's ortho box still contains a useful
// depth range. Azimuth is chosen so the `sunward` screenshot pose looks into it.
const DEFAULT_ELEV = 8.5 * Math.PI / 180;
const DEFAULT_AZIM = 0.75;
const DEFAULT_TURBIDITY = 2.0;   // dry desert air with dust in it, not city smog

// Per-tier cost. The cubemap is a one-off at boot, so the low tiers are about
// boot time and memory, not frame time.
const TIERS = [
  { cube: 96,  view: 12, sun: 4 },
  { cube: 160, view: 16, sun: 6 },
  { cube: 224, view: 22, sun: 7 },
  { cube: 256, view: 28, sun: 8 },
];

// ── GLSL ─────────────────────────────────────────────────────────────────────

// GLSL has no way to say "this came from JS", so the constants above are pasted
// in rather than uploaded as uniforms: they never change, and a compile-time
// constant lets the driver fold the whole density function.
const glf = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));
const glv = (a) => `vec3(${a.map(glf).join(', ')})`;

const ATMOSPHERE_GLSL = /* glsl */`
const float PI = 3.141592653589793;
const float R_GROUND = ${glf(R_GROUND)};
const float R_TOP    = ${glf(R_TOP)};
const float H_RAY    = ${glf(H_RAY)};
const float H_MIE    = ${glf(H_MIE)};
const vec3  BETA_RAY = ${glv(BETA_RAY)};
const vec3  BETA_OZO = ${glv(BETA_OZO)};
const float MIE_G    = ${glf(MIE_G)};

uniform float uTurbidity;
uniform float uSunI;

// Rayleigh, Mie and ozone densities at altitude h, normalised to sea level.
// Ozone is a tent rather than an exponential because it is a *layer*, not a
// well-mixed gas — it has almost no density at the altitudes a player stands at,
// which is why it colours the sky without fogging the level.
vec3 densities(float h) {
  return vec3(
    exp(-h / H_RAY),
    exp(-h / H_MIE),
    max(0.0, 1.0 - abs(h - ${glf(OZ_MID)}) / ${glf(OZ_WID)})
  );
}

vec3 betaMie() { return vec3(${glf(BETA_MIE)} * uTurbidity); }
// Extinction, not scattering: what the light loses, versus what we get to see.
vec3 betaMieExt() { return betaMie() / ${glf(MIE_ALBEDO)}; }

vec3 extinction(vec3 od) {
  return exp(-(BETA_RAY * od.x + betaMieExt() * od.y + BETA_OZO * od.z));
}

// Exit distance through a sphere centred on the origin, for a ray starting
// inside it. Always positive for the atmosphere shell.
float exitSphere(vec3 o, vec3 d, float r) {
  float b = dot(o, d);
  float c = dot(o, o) - r * r;
  float disc = b * b - c;
  if (disc < 0.0) return -1.0;
  return -b + sqrt(disc);
}

// Entry distance, or -1 when the ray misses or is heading away. Used to find
// where a downward ray strikes the planet.
float enterSphere(vec3 o, vec3 d, float r) {
  float b = dot(o, d);
  float c = dot(o, o) - r * r;
  float disc = b * b - c;
  if (disc < 0.0) return -1.0;
  float t = -b - sqrt(disc);
  return t > 0.0 ? t : -1.0;
}

float phaseRayleigh(float mu) { return 3.0 / (16.0 * PI) * (1.0 + mu * mu); }

// Henyey-Greenstein. At g = 0.76 this is ~30× isotropic within a few degrees of
// the sun and ~0.1× behind you — the bright aureole and the dark opposite
// horizon are the same function evaluated at two ends.
float phaseMie(float mu, float g) {
  float g2 = g * g;
  float denom = 1.0 + g2 - 2.0 * g * mu;
  return 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + mu * mu))
       / ((2.0 + g2) * max(denom, 1e-4) * sqrt(max(denom, 1e-4)));
}

// Optical depth from a point toward the sun, out to the top of the atmosphere.
// Cheap on purpose: this is the inner loop, and the transmittance it feeds is a
// smooth function that survives coarse sampling far better than the outer march.
vec3 sunOpticalDepth(vec3 p, vec3 sunDir, int steps) {
  float t = exitSphere(p, sunDir, R_TOP);
  if (t <= 0.0) return vec3(1e9);
  // A ray that clips the planet on its way to the sun is in shadow. Not a real
  // case above the horizon at +8°, but it keeps the twilight terminator sane if
  // the sun elevation is ever driven negative.
  if (enterSphere(p, sunDir, R_GROUND) > 0.0) return vec3(1e9);
  vec3 od = vec3(0.0);
  float inv = 1.0 / float(steps);
  for (int i = 0; i < 32; i++) {
    if (i >= steps) break;
    float x0 = float(i) * inv, x1 = float(i + 1) * inv;
    float t0 = t * x0 * x0 * x0, t1 = t * x1 * x1 * x1;
    vec3 s = p + sunDir * (0.5 * (t0 + t1));
    od += densities(length(s) - R_GROUND) * (t1 - t0);
  }
  return od;
}

// Single-scattered radiance along a view ray, plus the lit ground for rays that
// fall below the horizon. groundAlbedo is the desert floor; folding it into the
// same integral is what makes the ground haze and the sky haze agree at the
// horizon line instead of meeting at a visible seam.
vec3 atmosphere(vec3 ro, vec3 rd, vec3 sunDir, int steps, int sunSteps, vec3 groundAlbedo,
                float groundHaze, vec3 hazeAway, vec3 hazeSun) {
  float tTop = exitSphere(ro, rd, R_TOP);
  if (tTop <= 0.0) return vec3(0.0);
  float tGround = enterSphere(ro, rd, R_GROUND);
  bool hitGround = tGround > 0.0;
  float tMax = hitGround ? tGround : tTop;

  vec3 odView = vec3(0.0);
  vec3 sumR = vec3(0.0), sumM = vec3(0.0);
  float mu = dot(rd, sunDir);
  float inv = 1.0 / float(steps);

  for (int i = 0; i < 32; i++) {
    if (i >= steps) break;
    float x0 = float(i) * inv, x1 = float(i + 1) * inv;
    float t0 = tMax * x0 * x0 * x0, t1 = tMax * x1 * x1 * x1;
    vec3 p = ro + rd * (0.5 * (t0 + t1));
    vec3 d = densities(length(p) - R_GROUND) * (t1 - t0);
    odView += d;
    vec3 odSun = sunOpticalDepth(p, sunDir, sunSteps);
    // Transmittance from the sun to the sample and back out to the eye.
    vec3 att = extinction(odView + odSun);
    sumR += d.x * att;
    sumM += d.y * att;
  }

  vec3 bm = betaMie();
  vec3 col = uSunI * (BETA_RAY * phaseRayleigh(mu) * sumR + bm * phaseMie(mu, MIE_G) * sumM
    + ${glf(MS_BOOST)} * (BETA_RAY * sumR + bm * sumM) / (4.0 * PI));

  if (hitGround) {
    vec3 hit = ro + rd * tGround;
    vec3 n = normalize(hit);
    float ndl = max(dot(n, sunDir), 0.0);
    vec3 sunAtGround = extinction(sunOpticalDepth(hit, sunDir, sunSteps));
    // Lambert plus a crude sky term. The sky term matters more than it looks:
    // without it the far desert goes black in the sun's shadow direction and the
    // horizon develops a hard dark band.
    vec3 lit = groundAlbedo * (uSunI * ndl * sunAtGround / PI + vec3(0.006, 0.008, 0.012));

    // The scattering integral says the desert floor is unhazed, and for a steep
    // downward ray from an eye 2 m up it is right — that ground is a few metres
    // away. But the only part of it a player ever sees is the sliver just under
    // the horizon, which is tens of kilometres out. Left alone it meets the
    // hazed level floor as a hard brown stripe. So the near-surface haze the
    // level fog uses is applied here too, toward the same measured horizon
    // colours, and the seam closes.
    float haze = 1.0 - exp(-groundHaze * tGround);
    vec3 hazeCol = mix(hazeAway, hazeSun, pow(max(mu, 0.0), 2.5) * 0.85);
    lit = mix(lit, hazeCol, haze);

    col += lit * extinction(odView);
  }
  return col;
}
`;

// The dome. Direction is reconstructed per-fragment from the interpolated
// object-space position, which is exact regardless of tessellation: the
// rasteriser hands us the actual 3D point the view ray passes through, so
// normalising it recovers the ray. Twelve triangles is enough.
const DOME_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const DOME_FRAG = /* glsl */`
precision highp float;
varying vec3 vDir;

uniform float uSunI;
uniform vec3  uSunDir;
uniform vec3  uSunTrans;    // transmittance from the eye to the solar disc
uniform float uExposure;
uniform float uSunAng;
uniform float uLimb;
uniform float uFrame;
uniform float uKnee;
uniform float uShoulder;
uniform float uDiscMax;
const float PI_F = 3.141592653589793;

// A dusk sky spans about 200:1 between the zenith and the sky a degree off the
// sun. Something has to compress that, and if nothing in the chain does, the
// whole aureole clips to flat white and the amber — the entire point of the art
// direction — is the first thing lost. So the dome carries its own shoulder, and
// update() switches it off the moment it sees the renderer's tone mapper turn
// on, so it never stacks with a real one.
//
// The compression is applied to the largest channel and the other two are scaled
// with it. Per-channel rolloff is what makes a blown sunset go white in the
// middle: red saturates first, then green, and the hue walks to the corner of
// the cube on its way up. Scaling by the max holds the hue and only the
// brightness is compressed.
vec3 shoulder(vec3 c) {
  float m = max(max(c.r, c.g), c.b);
  if (uShoulder <= 0.0 || m <= uKnee) return c;
  float o = m - uKnee;
  return c * ((uKnee + uShoulder * (o / (o + uShoulder))) / m);
}

#ifdef SKY_LUT
uniform samplerCube uSky;
#else
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunward;
#endif

// Ordered dither at roughly one 8-bit step. A sky is the one thing in a frame
// with no texture to hide banding behind, and a 0.4% gradient across 900 px of
// screen crosses a quantisation boundary every few pixels.
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec3 dir = normalize(vDir);

#ifdef SKY_LUT
  vec3 col = textureCube(uSky, dir).rgb;
#else
  // Degraded path: no render target, so the scattering integral never ran. Three
  // measured colours from the same model, interpolated. Wrong in the details,
  // right in the palette, and it keeps the screen from going black.
  float up = smoothstep(-0.02, 0.75, dir.y);
  // Squared, because the real gradient does almost all of its work in the first
  // 20° above the horizon and a linear ramp drags the warm band up into the
  // zenith where it has no business being.
  vec3 col = mix(uHorizon, uZenith, up * up);
  float toSun = max(dot(dir, uSunDir), 0.0);
  col = mix(col, uSunward, pow(toSun, 6.0) * (1.0 - up) * 0.9);
#endif

  col = shoulder(col * uExposure);

  // The solar disc is drawn analytically rather than baked into the cubemap: at
  // 0.53° across it is about six pixels, and a 256² cubemap face resolves 0.35°
  // per texel, so a baked sun would be a soft blob with no edge.
  //
  // Its radiance is the sun's irradiance divided by its solid angle, which puts
  // it four to five orders of magnitude above the sky an arc-minute away from
  // it. Nothing displays that, and nothing should try: it is added *after* the
  // sky's shoulder and given a much higher ceiling of its own, so the core
  // clips to white — which is what a photograph of the sun does — while the
  // aureole around it stays under 1.0 and keeps its amber.
  //
  // Limb darkening is wavelength-dependent: the rim reddens because you are
  // looking obliquely through more photosphere. At 0.27° it is worth well under
  // a pixel here, but it costs nothing and it is what makes the disc survive
  // being rendered at 4K.
  float ang = acos(clamp(dot(dir, uSunDir), -1.0, 1.0));
  float r = ang / uSunAng;
  if (r < 1.15) {
    float m = sqrt(max(0.0, 1.0 - min(r, 1.0) * min(r, 1.0)));
    vec3 limb = 1.0 - uLimb * (1.0 - pow(vec3(m), vec3(0.42, 0.50, 0.62)));
    float edge = 1.0 - smoothstep(0.88, 1.04, r);
    vec3 disc = (uSunI / (PI_F * uSunAng * uSunAng)) * limb * uSunTrans * uExposure;
    float dm = max(max(disc.r, disc.g), disc.b);
    col += disc * ((uDiscMax * dm / (dm + uDiscMax)) / max(dm, 1e-4)) * edge;
  }

  col += (hash12(gl_FragCoord.xy + uFrame) - 0.5) * (1.0 / 255.0);
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

// ── aerial perspective ───────────────────────────────────────────────────────
//
// Patched into every material that would otherwise have taken three.js's fog.
// Three differences from `FogExp2`, and all three are the reason it is worth the
// trouble: density falls off with altitude (so a rooftop is clear and a trench
// is thick), the colour varies with view direction (so looking into the sun is
// warm and looking away is cold), and the mix happens before tone mapping rather
// than after colour-space encoding, so the blend is linear-light and does not
// grey out the shadows it crosses.

const AP_PARS_VERT = /* glsl */`
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vApWorld;
  uniform mat4 apCamWorld;
#endif
`;

// `mvPosition` is view space and already carries skinning, morphs and instancing,
// so pushing it back out through the camera's world matrix gets the true world
// position for every material variant without special-casing any of them.
const AP_VERT = /* glsl */`
#ifdef USE_FOG
  vFogDepth = -mvPosition.z;
  vApWorld = (apCamWorld * mvPosition).xyz;
#endif
`;

const AP_PARS_FRAG = /* glsl */`
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vApWorld;
  uniform vec3  apCamPos;
  uniform vec3  apSunDir;
  uniform vec3  apSunTint;
  uniform vec3  apZenith;
  uniform vec3  apHorizon;
  uniform vec3  apSunward;
  uniform float apDensity;
  uniform float apFalloff;
  uniform float apBase;
  uniform float apGlow;
  uniform float apMaxOpacity;

  float apPhase(float mu, float g) {
    float g2 = g * g;
    float d = 1.0 + g2 - 2.0 * g * mu;
    return (1.0 - g2) / (4.0 * 3.14159265 * max(d, 1e-4) * sqrt(max(d, 1e-4)));
  }
#endif
`;

const AP_FRAG = /* glsl */`
#ifdef USE_FOG
  {
    vec3 ray = vApWorld - apCamPos;
    float dist = length(ray);
    vec3 rd = ray / max(dist, 1e-4);

    // Closed-form integral of rho0 * exp(-k*y) along the segment. Doing it
    // analytically rather than as a raymarch costs two exp() and is exact, which
    // matters because any error here shows up as a moving seam when the camera
    // climbs stairs.
    float k = apFalloff;
    float y0 = max(apCamPos.y - apBase, -60.0);
    float dy = ray.y;
    float e0 = exp(-y0 * k);
    float od = (abs(dy) > 0.05)
      ? apDensity * dist * (e0 - exp(-(y0 + dy) * k)) / (dy * k)
      : apDensity * dist * e0;
    float f = (1.0 - exp(-max(od, 0.0))) * apMaxOpacity;

    // Inscattered colour, sampled from the same three sky measurements the
    // degraded dome uses, so haze on a distant wall matches the sky just above it.
    float mu = dot(rd, apSunDir);
    vec3 base = mix(apHorizon, apZenith, smoothstep(0.0, 0.55, rd.y));
    base = mix(base, apSunward, pow(max(mu, 0.0), 2.5) * 0.85);
    // The forward-scatter lobe on top is what sells "dusty air": a silhouette
    // between you and the sun should be swimming in glare, not merely tinted.
    // Scaled by f a second time on purpose — glare is light gathered along the
    // whole path, so it should arrive quadratically with depth, not sit on the
    // near edge of a doorway.
    vec3 inscat = base + apSunTint * (apPhase(mu, 0.70) * apGlow * f);

    gl_FragColor.rgb = mix(gl_FragColor.rgb, inscat, clamp(f, 0.0, 1.0));
  }
#endif
`;

// ── CPU mirror of the same model ─────────────────────────────────────────────
//
// The sun colour, the fog palette and the average sky luminance all have to be
// readable from JavaScript — `lighting.js` needs a colour for the directional
// light before a single frame has rendered, and nothing can read back a float
// cubemap cheaply. So the integral exists twice. It is the same maths at coarser
// step counts, and keeping it here rather than doing a GPU readback is what lets
// the whole thing stay synchronous inside `createSky`.

function densitiesJS(h) {
  return [
    Math.exp(-h / H_RAY),
    Math.exp(-h / H_MIE),
    Math.max(0, 1 - Math.abs(h - OZ_MID) / OZ_WID),
  ];
}

function exitSphereJS(o, d, r) {
  const b = o[0] * d[0] + o[1] * d[1] + o[2] * d[2];
  const c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - r * r;
  const disc = b * b - c;
  return disc < 0 ? -1 : -b + Math.sqrt(disc);
}

function enterSphereJS(o, d, r) {
  const b = o[0] * d[0] + o[1] * d[1] + o[2] * d[2];
  const c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - r * r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : -1;
}

function extinctionJS(od, turbidity) {
  const bm = BETA_MIE * turbidity / MIE_ALBEDO;
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    out[c] = Math.exp(-(BETA_RAY[c] * od[0] + bm * od[1] + BETA_OZO[c] * od[2]));
  }
  return out;
}

// Same cubic sample placement as the shader; a JS horizon that disagreed with
// the GPU horizon would show up as a seam between the fog colour and the dome.
function sunODJS(p, sun, steps) {
  const t = exitSphereJS(p, sun, R_TOP);
  if (t <= 0 || enterSphereJS(p, sun, R_GROUND) > 0) return [1e9, 1e9, 1e9];
  const od = [0, 0, 0];
  for (let i = 0; i < steps; i++) {
    const t0 = t * Math.pow(i / steps, STEP_POWER);
    const t1 = t * Math.pow((i + 1) / steps, STEP_POWER);
    const s = (t0 + t1) * 0.5, dt = t1 - t0;
    const h = Math.hypot(p[0] + sun[0] * s, p[1] + sun[1] * s, p[2] + sun[2] * s) - R_GROUND;
    const d = densitiesJS(h);
    od[0] += d[0] * dt; od[1] += d[1] * dt; od[2] += d[2] * dt;
  }
  return od;
}

// Mirrors the dome's highlight shoulder so the fog palette lands on the same
// curve as the sky it has to blend into.
function shoulderJS(c) {
  const m = Math.max(c[0], c[1], c[2]);
  if (m <= KNEE) return c.slice();
  const o = m - KNEE;
  const k = (KNEE + SHOULDER * (o / (o + SHOULDER))) / m;
  return [c[0] * k, c[1] * k, c[2] * k];
}

// Transmittance from an observer at sea level toward `dir`. This is the sun's
// own colour when `dir` is the sun: at 8° elevation the beam has crossed six air
// masses and lost most of its blue, which is exactly why dusk key light is amber.
function transmittanceJS(dir, turbidity, steps = 12) {
  const p = [0, R_GROUND + 2, 0];
  return extinctionJS(sunODJS(p, dir, steps), turbidity);
}

function skyJS(dir, sun, turbidity, steps = 14, sunSteps = 5) {
  const ro = [0, R_GROUND + 2, 0];
  const tTop = exitSphereJS(ro, dir, R_TOP);
  if (tTop <= 0) return [0, 0, 0];
  const tG = enterSphereJS(ro, dir, R_GROUND);
  const tMax = tG > 0 ? tG : tTop;
  const odView = [0, 0, 0];
  const sumR = [0, 0, 0], sumM = [0, 0, 0];
  const mu = dir[0] * sun[0] + dir[1] * sun[1] + dir[2] * sun[2];
  const bm = BETA_MIE * turbidity;

  for (let i = 0; i < steps; i++) {
    const t0 = tMax * Math.pow(i / steps, STEP_POWER);
    const t1 = tMax * Math.pow((i + 1) / steps, STEP_POWER);
    const s = (t0 + t1) * 0.5, dt = t1 - t0;
    const p = [ro[0] + dir[0] * s, ro[1] + dir[1] * s, ro[2] + dir[2] * s];
    const d = densitiesJS(Math.hypot(p[0], p[1], p[2]) - R_GROUND);
    odView[0] += d[0] * dt; odView[1] += d[1] * dt; odView[2] += d[2] * dt;
    const odSun = sunODJS(p, sun, sunSteps);
    const att = extinctionJS(
      [odView[0] + odSun[0], odView[1] + odSun[1], odView[2] + odSun[2]], turbidity);
    for (let c = 0; c < 3; c++) { sumR[c] += d[0] * dt * att[c]; sumM[c] += d[1] * dt * att[c]; }
  }

  const pR = 3 / (16 * Math.PI) * (1 + mu * mu);
  const g2 = MIE_G * MIE_G;
  const den = 1 + g2 - 2 * MIE_G * mu;
  const pM = 3 / (8 * Math.PI) * ((1 - g2) * (1 + mu * mu))
           / ((2 + g2) * Math.max(den, 1e-4) * Math.sqrt(Math.max(den, 1e-4)));

  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    out[c] = SUN_I * (BETA_RAY[c] * pR * sumR[c] + bm * pM * sumM[c]
      + MS_BOOST * (BETA_RAY[c] * sumR[c] + bm * sumM[c]) / (4 * Math.PI));
  }
  return out;
}

// ── module ───────────────────────────────────────────────────────────────────

export function createSky(G, engine) {
  const scene = engine.scene;
  const renderer = engine.renderer;
  const tier = Object.assign({}, TIERS[G.settings.quality] || TIERS[2]);

  const state = {
    elev: DEFAULT_ELEV,
    azim: DEFAULT_AZIM,
    turbidity: DEFAULT_TURBIDITY,
    exposure: 1.0,
    dirty: true,
    lutOk: false,
  };

  const sunDir = new THREE.Vector3();
  const sunColor = new THREE.Color(1, 0.86, 0.68);
  const zenith = new THREE.Color();
  const horizon = new THREE.Color();
  const sunward = new THREE.Color();
  const sunTrans = new THREE.Vector3(1, 1, 1);

  // ── aerial-perspective uniforms, shared by every patched material ──────────
  // One object, referenced (not copied) into each shader's uniform map, so a
  // single write here updates the fog on all of them — and so `postfx.js` can
  // read the exact same values if it wants depth-based inscattering.
  const fogUniforms = {
    apCamWorld:   { value: new THREE.Matrix4() },
    apCamPos:     { value: new THREE.Vector3() },
    apSunDir:     { value: sunDir },
    apSunTint:    { value: new THREE.Color(1, 0.72, 0.42) },
    apZenith:     { value: zenith },
    apHorizon:    { value: horizon },
    apSunward:    { value: sunward },
    // ~45% haze at 80 m, which is the far side of the compound. Tuned against
    // the level, not against physics: the correct coefficient for real desert
    // air is invisible at these distances, and haze you cannot see is haze that
    // is not doing the depth cueing it is there for.
    apDensity:    { value: 0.0075 },
    apFalloff:    { value: 1 / 26 },   // haze halves every ~18 m of altitude
    apBase:       { value: 0.0 },
    apGlow:       { value: 0.8 },
    apMaxOpacity: { value: 0.985 },
  };

  // ── sky-dome + LUT materials ──────────────────────────────────────────────
  const domeUniforms = {
    uSunDir:   { value: sunDir },
    uSunTrans: { value: sunTrans },
    uExposure: { value: state.exposure },
    uSunAng:   { value: SUN_ANG },
    uLimb:     { value: 0.62 },
    uFrame:    { value: 0 },
    uKnee:     { value: KNEE },
    uShoulder: { value: SHOULDER },
    uDiscMax:  { value: 3.2 },
    uSunI:     { value: SUN_I },
    uSky:      { value: null },
    uZenith:   { value: zenith },
    uHorizon:  { value: horizon },
    uSunward:  { value: sunward },
  };

  const domeMat = new THREE.ShaderMaterial({
    uniforms: domeUniforms,
    vertexShader: DOME_VERT,
    fragmentShader: DOME_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false,
  });

  // A unit box, scaled out to 600 m — inside the camera's 900 m far plane, and
  // drawn *after* the opaque pass (renderOrder 1000, no depth write) so the
  // z-buffer rejects every fragment the level already covered. Sky is the most
  // expensive shader in the frame and the one it is easiest not to run.
  const dome = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), domeMat);
  dome.scale.setScalar(600);
  dome.frustumCulled = false;
  dome.renderOrder = 1000;
  scene.add(dome);

  // The cubemap is rendered from a separate one-mesh scene running the full
  // scattering integral. The dome then samples it. Splitting it this way is what
  // buys the crisp analytic sun: the expensive part is resolved once at cubemap
  // resolution, the part that needs pixel accuracy stays analytic.
  let cubeRT = null, cubeCam = null, lutScene = null, lutMat = null;
  let pmrem = null, envRT = null;

  function buildLUT() {
    const lutUniforms = {
      uSunDir:    { value: sunDir },
      uTurbidity: { value: state.turbidity },
      uSunI:      { value: SUN_I },
      uSteps:     { value: tier.view },
      uSunSteps:  { value: tier.sun },
      uGround:    { value: new THREE.Color(0.34, 0.28, 0.20) },
      // Thicker than the level's own haze on purpose. The dome's ground stands in
      // for desert that is tens of kilometres out, but the ray from a 2 m eye
      // reaches the sphere in a hundred metres, so the geometric distance badly
      // understates how much air is really in the way.
      uGroundHaze: { value: GROUND_HAZE },
      uHazeAway:  { value: new THREE.Color() },
      uHazeSun:   { value: new THREE.Color() },
    };
    lutMat = new THREE.ShaderMaterial({
      uniforms: lutUniforms,
      vertexShader: DOME_VERT,
      fragmentShader: `
        precision highp float;
        varying vec3 vDir;
        uniform vec3 uSunDir;
        uniform int uSteps;
        uniform int uSunSteps;
        uniform vec3 uGround;
        uniform float uGroundHaze;
        uniform vec3 uHazeAway;
        uniform vec3 uHazeSun;
        ${ATMOSPHERE_GLSL}
        void main() {
          vec3 dir = normalize(vDir);
          vec3 ro = vec3(0.0, R_GROUND + 2.0, 0.0);
          vec3 col = atmosphere(ro, dir, uSunDir, uSteps, uSunSteps, uGround,
                                uGroundHaze, uHazeAway, uHazeSun);
          gl_FragColor = vec4(max(col, 0.0), 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false,
    });

    lutScene = new THREE.Scene();
    const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), lutMat);
    box.frustumCulled = false;
    lutScene.add(box);

    // Half-float keeps the aureole's 60:1 range against the anti-solar horizon.
    // A byte target clips it flat, which is survivable — the sky still reads —
    // but the IBL loses most of its directionality, so try for float first.
    const type = engine.caps && engine.caps.float ? THREE.HalfFloatType : THREE.UnsignedByteType;
    cubeRT = new THREE.WebGLCubeRenderTarget(tier.cube, {
      type,
      format: THREE.RGBAFormat,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      colorSpace: THREE.LinearSRGBColorSpace,
    });
    cubeCam = new THREE.CubeCamera(0.1, 10, cubeRT);
  }

  function renderLUT() {
    const prevTarget = renderer.getRenderTarget();
    cubeCam.update(renderer, lutScene);
    renderer.setRenderTarget(prevTarget);
  }

  // A raw cubemap set as `scene.environment` gives every surface a mirror, so a
  // rough steel drum comes back reflecting a razor-sharp horizon — which is
  // precisely the look people call "plastic". PMREM's prefiltered mip chain is
  // what makes roughness mean something to a reflection, and it is the single
  // cheapest thing that stops metal reading as painted cardboard.
  function buildEnv() {
    if (!pmrem) {
      pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileCubemapShader();
    }
    const next = pmrem.fromCubemap(cubeRT.texture);
    if (envRT) envRT.dispose();
    envRT = next;
    scene.environment = envRT.texture;
    api.envMap = envRT.texture;
  }

  // Degraded environment: a 16×8 equirectangular strip evaluated on the CPU.
  // Deliberately tiny — at that resolution it is already an irradiance map, so
  // it behaves like a blurred probe without a prefilter pass to blur it.
  function buildFallbackEnv() {
    const w = 16, h = 8;
    const data = new Uint8Array(w * h * 4);
    const s = [sunDir.x, sunDir.y, sunDir.z];
    for (let y = 0; y < h; y++) {
      const theta = (y + 0.5) / h * Math.PI;
      for (let x = 0; x < w; x++) {
        const phi = (x + 0.5) / w * Math.PI * 2;
        const d = [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)];
        const c = skyJS(d, s, state.turbidity, 8, 3);
        const i = (y * w + x) * 4;
        for (let k = 0; k < 3; k++) {
          const v = Math.max(0, Math.min(1, c[k] * state.exposure));
          data[i + k] = Math.round(Math.pow(v, 1 / 2.2) * 255);
        }
        data[i + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    scene.environment = tex;
    api.envMap = tex;
  }

  // ── material patching ─────────────────────────────────────────────────────
  //
  // Patching `Material.prototype.onBeforeCompile` rather than walking the scene
  // graph is deliberate: `createSky` runs before `buildLevel`, before enemies,
  // before decals and before every material any other module creates later, and
  // a fog that only covers the meshes that happened to exist at boot is worse
  // than no fog at all. A material that defines its own `onBeforeCompile` shadows
  // the prototype and quietly keeps three.js's stock fog — which is why
  // `scene.fog` stays set below.
  function installFogPatch() {
    const Mat = THREE.Material;
    if (!Mat || !Mat.prototype || Mat.prototype.__bsAerial) return false;
    const prev = Mat.prototype.onBeforeCompile;
    Mat.prototype.onBeforeCompile = function (shader, rendererRef) {
      try {
        if (this.userData && this.userData.noAerial) return;
        patchAerial(shader);
      } catch (err) {
        // A fog patch is never worth a failed compile; three.js's own fog is
        // still in the shader if we bail before touching it.
        void err;
      }
      if (typeof prev === 'function') prev.call(this, shader, rendererRef);
    };
    Mat.prototype.__bsAerial = true;
    return true;
  }

  function patchAerial(shader) {
    const frag = shader.fragmentShader;
    if (frag.indexOf('#include <fog_pars_fragment>') < 0) return;
    // Fog belongs in linear light, before tone mapping. three.js puts its own
    // `fog_fragment` *after* the colour-space encode, which blends sRGB values
    // and visibly milks out anything dark the haze crosses.
    const anchor = frag.indexOf('#include <tonemapping_fragment>') >= 0
      ? '#include <tonemapping_fragment>'
      : frag.indexOf('#include <colorspace_fragment>') >= 0
        ? '#include <colorspace_fragment>' : null;
    if (!anchor) return;

    Object.assign(shader.uniforms, fogUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <fog_pars_vertex>', AP_PARS_VERT)
      .replace('#include <fog_vertex>', AP_VERT);
    shader.fragmentShader = frag
      .replace('#include <fog_pars_fragment>', AP_PARS_FRAG)
      .replace('#include <fog_fragment>', '')
      .replace(anchor, AP_FRAG + '\n' + anchor);
  }

  // ── sun-driven refresh ────────────────────────────────────────────────────

  function recomputeSun() {
    const ce = Math.cos(state.elev), se = Math.sin(state.elev);
    sunDir.set(-Math.sin(state.azim) * ce, se, -Math.cos(state.azim) * ce).normalize();

    const s = [sunDir.x, sunDir.y, sunDir.z];
    const t = transmittanceJS(s, state.turbidity, 16);
    sunTrans.set(t[0], t[1], t[2]);

    // The key light carries its intensity in the light, not in the colour, so
    // normalise to the brightest channel. Then pull 22% back toward white: the
    // physically exact ratio at 8° is close to (1, 0.55, 0.20), and a scene lit
    // by that alone reads as a sepia filter rather than as evening — eyes chase
    // white balance and a camera would have too.
    const m = Math.max(t[0], t[1], t[2], 1e-6);
    const k = 0.22;
    sunColor.setRGB(
      THREE.MathUtils.lerp(t[0] / m, 1, k),
      THREE.MathUtils.lerp(t[1] / m, 1, k),
      THREE.MathUtils.lerp(t[2] / m, 1, k),
    );

    // Three probes drive the fog palette and the degraded dome. Sampling the sky
    // itself rather than picking colours by hand is the whole reason the haze
    // and the horizon match.
    const horizDir = [sunDir.x, 0, sunDir.z];
    const hl = Math.hypot(horizDir[0], horizDir[2]) || 1;
    horizDir[0] /= hl; horizDir[2] /= hl;
    const up = skyJS([0, 1, 0], s, state.turbidity);
    // 4° above the horizon, not 0°: at exactly 0° the ray grazes the planet for
    // hundreds of kilometres and the integral is dominated by its own step size.
    const toward = skyJS(norm3([horizDir[0] * 0.9976, 0.0698, horizDir[2] * 0.9976]), s, state.turbidity);
    const away = skyJS(norm3([-horizDir[0] * 0.9976, 0.0698, -horizDir[2] * 0.9976]), s, state.turbidity);

    const e = state.exposure;
    const z = shoulderJS([up[0] * e, up[1] * e, up[2] * e]);
    const a = shoulderJS([away[0] * e, away[1] * e, away[2] * e]);
    const w = shoulderJS([toward[0] * e, toward[1] * e, toward[2] * e]);
    zenith.setRGB(z[0], z[1], z[2]);
    horizon.setRGB(a[0], a[1], a[2]);
    sunward.setRGB(w[0], w[1], w[2]);
    fogUniforms.apSunTint.value.setRGB(
      sunColor.r * 0.30 * e, sunColor.g * 0.30 * e, sunColor.b * 0.30 * e);

    // The cubemap is the source for the PMREM as well as for the dome, so it
    // stores raw radiance — the haze colours handed to it must be pre-shoulder
    // or the environment light picks up a display curve it should never see.
    if (lutMat) {
      lutMat.uniforms.uHazeAway.value.setRGB(away[0], away[1], away[2]);
      lutMat.uniforms.uHazeSun.value.setRGB(toward[0], toward[1], toward[2]);
    }

    // A crude hemispherical average, for anyone who needs an exposure target or
    // an ambient level without sampling the cubemap.
    let lum = 0;
    for (let i = 0; i < 8; i++) {
      const ang = i / 8 * Math.PI * 2;
      const d = norm3([Math.cos(ang) * 0.8, 0.6, Math.sin(ang) * 0.8]);
      const c = skyJS(d, s, state.turbidity, 8, 3);
      lum += 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    }
    api.skyLuminance = lum / 8 * e;
    api.turbidity = state.turbidity;

    // FogExp2 with the anti-solar horizon colour is the fallback for anything
    // the prototype patch could not reach. Density is matched to the analytic
    // fog at eye height so a stray unpatched material does not stand out.
    if (scene.fog) {
      scene.fog.color.copy(horizon);
      if (scene.fog.density !== undefined) scene.fog.density = fogUniforms.apDensity.value * 0.85;
    }
  }

  function refresh() {
    recomputeSun();
    if (state.lutOk) {
      try {
        lutMat.uniforms.uTurbidity.value = state.turbidity;
        renderLUT();
        buildEnv();
      } catch (err) {
        console.warn('[sky] cubemap refresh failed, dropping to gradient sky', err);
        state.lutOk = false;
        domeMat.defines = {};
        domeMat.needsUpdate = true;
        buildFallbackEnv();
      }
    }
    state.dirty = false;
  }

  // ── boot ──────────────────────────────────────────────────────────────────

  scene.background = null;
  scene.fog = new THREE.FogExp2(0x2b2a2c, 0.009);
  installFogPatch();

  try {
    buildLUT();
    state.lutOk = true;
    domeMat.defines = { SKY_LUT: '' };
    domeUniforms.uSky.value = cubeRT.texture;
    domeMat.needsUpdate = true;
  } catch (err) {
    console.warn('[sky] no cube render target, using gradient sky', err);
    state.lutOk = false;
  }

  const api = {
    sunDir,
    sunColor,
    envMap: null,
    fogUniforms,
    skyLuminance: 0,
    turbidity: state.turbidity,
    dome,

    setSunElevation(rad) {
      state.elev = THREE.MathUtils.clamp(rad, -0.2, Math.PI * 0.5 - 0.01);
      state.dirty = true;
    },
    setSunAzimuth(rad) { state.azim = rad; state.dirty = true; },
    setTurbidity(t) { state.turbidity = THREE.MathUtils.clamp(t, 1.2, 8); state.dirty = true; },
    setExposure(e) { state.exposure = e; domeUniforms.uExposure.value = e; state.dirty = true; },

    // For a composite pass that tone maps in its own shader rather than through
    // `renderer.toneMapping`, where the automatic check below cannot see it.
    setToneMapped(on) { domeUniforms.uShoulder.value = on ? 0 : SHOULDER; },

    // Step counts follow the quality tier live; the cubemap's resolution does
    // not, because reallocating a cube render target mid-session throws away the
    // PMREM chain and stalls the frame it happens on. It is picked at boot.
    setQuality(q) {
      const t = TIERS[q] || TIERS[2];
      if (t.view === tier.view) return;
      tier.view = t.view; tier.sun = t.sun;
      if (state.lutOk) {
        lutMat.uniforms.uSteps.value = tier.view;
        lutMat.uniforms.uSunSteps.value = tier.sun;
        state.dirty = true;
      }
    },

    update() {
      // The dome rides the camera so it never parallaxes; the sky is at infinity
      // and the one thing that gives that away instantly is a horizon that
      // shifts when you walk.
      dome.position.copy(engine.camera.position);
      fogUniforms.apCamPos.value.copy(engine.camera.position);
      fogUniforms.apCamWorld.value.copy(engine.camera.matrixWorld);
      domeUniforms.uFrame.value = (domeUniforms.uFrame.value + 1) % 64;
      // If the post chain has switched a real tone mapper on, stand down: two
      // shoulders in series is how a sky ends up looking like grey felt.
      domeUniforms.uShoulder.value = renderer.toneMapping === THREE.NoToneMapping ? SHOULDER : 0;
      // Regenerating the cubemap and its PMREM chain costs several milliseconds,
      // so it happens only when the sun has actually moved — never per frame.
      if (state.dirty) refresh();
    },

    dispose() {
      scene.remove(dome);
      domeMat.dispose();
      dome.geometry.dispose();
      if (cubeRT) cubeRT.dispose();
      if (envRT) envRT.dispose();
      if (pmrem) pmrem.dispose();
    },
  };

  refresh();
  if (!state.lutOk) buildFallbackEnv();

  return api;
}

function norm3(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
