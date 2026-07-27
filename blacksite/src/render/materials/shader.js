// Shader patches for MeshStandardMaterial: triplanar projection, a second
// close-range normal map, and macro-scale tile breakup.
//
// All three are done by string surgery on three's shader chunks inside
// `onBeforeCompile` rather than by writing a whole material from scratch,
// because everything else the standard material does — IBL, shadows, fog, the
// tone-mapped output the composite pass expects — is worth keeping. Every
// replacement is checked before it is applied and silently skipped if the chunk
// is not there, so a three version bump degrades to a plain textured material
// instead of a black screen.
//
// Why triplanar at all: the level is authored as boxes, and box UVs run 0..1
// per face regardless of how big the face is. With plain UV mapping a 40 m wall
// and a 1 m crate get the same number of texels, which reads as two different
// materials. Projecting from world space instead gives one texel density across
// the whole level for free, and it is also what makes the ground plane work at
// any size.

const VERT_DECL = `
varying vec3 bsWPos;
varying vec3 bsWNrm;
varying float bsDist;
`;

const VERT_BODY = `
bsWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
bsWNrm = normalize( mat3( modelMatrix ) * objectNormal );
bsDist = length( ( modelViewMatrix * vec4( transformed, 1.0 ) ).xyz );
#include <project_vertex>`;

const FRAG_DECL = `
varying vec3 bsWPos;
varying vec3 bsWNrm;
varying float bsDist;
uniform sampler2D bsDetailMap;
uniform vec4 bsDetail;      // x: tiles per base tile, y: strength, z: fade near, w: fade far
uniform vec3 bsMacro;       // x: scale divisor, y: strength, z: mean luminance of the albedo
uniform float bsScale;      // texture tiles per metre

// Occlusion, roughness and metalness come out of one texture, so it is sampled
// once in the roughness chunk and read again two chunks later. Declared at file
// scope rather than injected into main(): one less chunk that has to exist.
vec4 bsORM = vec4( 1.0 );

// Sharp blend weights. A soft blend (exponent 2-3) smears two projections
// across a third of every surface and reads as a smudge on anything with
// direction in it; 6 keeps the transition inside a few degrees of the corner.
vec3 bsBlend( vec3 n ) {
  vec3 b = pow( abs( n ), vec3( 6.0 ) );
  return b / max( b.x + b.y + b.z, 1e-5 );
}
vec4 bsTri( sampler2D t, vec3 p, vec3 n, float s ) {
  vec3 b = bsBlend( n );
  return texture2D( t, p.zy * s ) * b.x + texture2D( t, p.xz * s ) * b.y + texture2D( t, p.xy * s ) * b.z;
}
// Whiteout blend: perturbs the world normal by each projection and weights the
// results, rather than averaging three tangent-space vectors that do not share
// a tangent frame.
vec3 bsTriN( sampler2D t, vec3 p, vec3 n, float s, vec2 sc ) {
  vec3 b = bsBlend( n );
  vec3 nx = texture2D( t, p.zy * s ).xyz * 2.0 - 1.0;
  vec3 ny = texture2D( t, p.xz * s ).xyz * 2.0 - 1.0;
  vec3 nz = texture2D( t, p.xy * s ).xyz * 2.0 - 1.0;
  nx.xy *= sc; ny.xy *= sc; nz.xy *= sc;
  nx = vec3( nx.xy + n.zy, abs( nx.z ) * n.x );
  ny = vec3( ny.xy + n.xz, abs( ny.z ) * n.y );
  nz = vec3( nz.xy + n.xy, abs( nz.z ) * n.z );
  return normalize( nx.zyx * b.x + ny.xzy * b.y + nz.xyz * b.z );
}
// One tap on whichever plane dominates. The macro term is a very low frequency
// multiplier, so the stretch on a 45° face is invisible and two taps are not
// worth the bandwidth.
vec2 bsDomUV( vec3 p, vec3 n ) {
  vec3 a = abs( n );
  return ( a.x > a.y && a.x > a.z ) ? p.zy : ( a.y > a.z ? p.xz : p.xy );
}
float bsFade() {
  return bsDetail.y * ( 1.0 - smoothstep( bsDetail.z, bsDetail.w, bsDist ) );
}
`;

// Sampling the albedo again at a fraction of the frequency and using its own
// luminance as a multiplier: the cheapest known fix for tile repetition, and it
// costs one texture read. Centred on the map's mean so it darkens and lightens
// in equal measure instead of dimming the whole level.
const MACRO_TRI = `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = bsTri( map, bsWPos, bsWNrm, bsScale );
  float bsL = dot( texture2D( map, bsDomUV( bsWPos, bsWNrm ) * ( bsScale / bsMacro.x ) ).rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  sampledDiffuseColor.rgb *= 1.0 + ( bsL - bsMacro.z ) * bsMacro.y;
  diffuseColor *= sampledDiffuseColor;
#endif`;

const MACRO_UV = `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  float bsL = dot( texture2D( map, vMapUv / bsMacro.x ).rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  sampledDiffuseColor.rgb *= 1.0 + ( bsL - bsMacro.z ) * bsMacro.y;
  diffuseColor *= sampledDiffuseColor;
#endif`;

const NORMAL_TRI = `
#ifdef USE_NORMALMAP_TANGENTSPACE
  vec3 bsWorldN = bsTriN( normalMap, bsWPos, normalize( bsWNrm ), bsScale, normalScale );
  float bsF = bsFade();
  if ( bsF > 0.001 ) {
    vec3 bsDetN = bsTriN( bsDetailMap, bsWPos, bsWorldN, bsScale * bsDetail.x, vec2( 1.0 ) );
    bsWorldN = normalize( mix( bsWorldN, bsDetN, bsF ) );
  }
  normal = normalize( ( viewMatrix * vec4( bsWorldN, 0.0 ) ).xyz );
#endif`;

const NORMAL_UV = `
#ifdef USE_NORMALMAP_TANGENTSPACE
  vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
  mapN.xy *= normalScale;
  float bsF = bsFade();
  if ( bsF > 0.001 ) {
    vec3 bsD = texture2D( bsDetailMap, vNormalMapUv * bsDetail.x ).xyz * 2.0 - 1.0;
    mapN = normalize( vec3( mapN.xy + bsD.xy * bsF, mapN.z ) );
  }
  normal = normalize( tbn * mapN );
#endif`;

const ROUGH_TRI = `
float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
  bsORM = bsTri( roughnessMap, bsWPos, bsWNrm, bsScale );
  roughnessFactor *= bsORM.g;
#endif`;

const METAL_TRI = `
float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
  metalnessFactor *= bsORM.b;
#endif`;

const AO_TRI = `
#ifdef USE_AOMAP
  float ambientOcclusion = ( bsORM.r - 1.0 ) * aoMapIntensity + 1.0;
  reflectedLight.indirectDiffuse *= ambientOcclusion;
  #if defined( USE_CLEARCOAT )
    clearcoatSpecularIndirect *= ambientOcclusion;
  #endif
  #if defined( USE_SHEEN )
    sheenSpecularIndirect *= ambientOcclusion;
  #endif
  #if defined( USE_ENVMAP ) && defined( STANDARD )
    float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
    reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
  #endif
#endif`;

// Uniform blocks are kept beside the material rather than on `userData`,
// because `Material.copy` deep-copies userData through JSON — and a JSON round
// trip of a uniform holding a DataTexture serialises the whole texture, once
// per clone. The level clones every material it uses.
const BLOCKS = new WeakMap();
export function surfaceUniforms(mat) { return BLOCKS.get(mat) || null; }

function sub(src, needle, replacement, log) {
  if (src.indexOf(needle) < 0) { log.missing.push(needle); return src; }
  log.applied++;
  return src.replace(needle, replacement);
}

// Installs the patch on a material. `opts.triplanar` picks world-space
// projection over the geometry's own UVs. Returns the uniform block so the
// caller can retune it later without recompiling.
export function installSurfaceShader(mat, opts = {}) {
  const u = {
    bsDetailMap: { value: opts.detailMap || null },
    bsDetail: { value: [opts.detailTiles || 8, opts.detailStrength || 0.7, opts.detailNear || 1.5, opts.detailFar || 9] },
    bsMacro: { value: [opts.macroScale || 7.3, opts.macroStrength || 0.35, opts.meanLum != null ? opts.meanLum : 0.35] },
    bsScale: { value: 1 / (opts.metres || 2) },
  };
  const tri = !!opts.triplanar;
  BLOCKS.set(mat, u);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    const log = { applied: 0, missing: [] };
    shader.vertexShader = VERT_DECL + shader.vertexShader;
    shader.vertexShader = sub(shader.vertexShader, '#include <project_vertex>', VERT_BODY, log);
    let f = FRAG_DECL + shader.fragmentShader;
    if (tri) {
      f = sub(f, '#include <map_fragment>', MACRO_TRI, log);
      f = sub(f, '#include <roughnessmap_fragment>', ROUGH_TRI, log);
      f = sub(f, '#include <metalnessmap_fragment>', METAL_TRI, log);
      f = sub(f, '#include <aomap_fragment>', AO_TRI, log);
      f = sub(f, '#include <normal_fragment_maps>', NORMAL_TRI, log);
    } else {
      f = sub(f, '#include <map_fragment>', MACRO_UV, log);
      f = sub(f, '#include <normal_fragment_maps>', NORMAL_UV, log);
    }
    shader.fragmentShader = f;
    if (log.missing.length) {
      // Never fatal: the material still renders, it just loses the trick.
      console.warn('[materials] shader chunk not found, feature skipped:', log.missing.join(', '));
    }
  };
  // Two materials with the same patch shape share one compiled program; without
  // this three would key only on the built-in defines and hand the second
  // material the first one's unpatched program.
  mat.customProgramCacheKey = () => (tri ? 'bs-tri' : 'bs-uv');
  return u;
}
