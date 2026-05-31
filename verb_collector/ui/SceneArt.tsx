import React from 'react';

/**
 * Tolkien-storybook scene artwork.
 *
 * All inline SVG. No external assets. The intent is Alan Lee watercolor over
 * John Howe ink-line: a forest tableau behind the hero figure, soft golden
 * light filtering through trunks, fog at the floor. This is presentation
 * only — see CombatScreen for the click/tap wiring.
 */

// --------------------------------------------------------------------------
// Background — distant forest, mist, golden light. Pure SVG so the layer
// scales and stays crisp on retina. Sits behind everything in the scene
// panel as a position:absolute layer.
// --------------------------------------------------------------------------
export function SceneBackdrop(): React.ReactElement {
  return (
    <svg
      className="scene-backdrop"
      viewBox="0 0 1000 360"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        {/* Sky — proper dusk: cool blue up top dropping into warm gold at horizon */}
        <linearGradient id="sky-wash" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"   stopColor="#5a6e85" />
          <stop offset="35%"  stopColor="#8e8b7a" />
          <stop offset="58%"  stopColor="#d6a868" />
          <stop offset="72%"  stopColor="#c9844a" />
          <stop offset="100%" stopColor="#5e3a22" />
        </linearGradient>
        {/* Setting-sun glow on the right */}
        <radialGradient id="sun-glow" cx="0.74" cy="0.55" r="0.4">
          <stop offset="0%"   stopColor="#ffe6a8" stopOpacity="0.95" />
          <stop offset="35%"  stopColor="#f4ba6c" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#f4ba6c" stopOpacity="0" />
        </radialGradient>
        {/* Soft cloud streaks across the sky */}
        <linearGradient id="cloud-wash" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"   stopColor="#e9d4a8" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#e9d4a8" stopOpacity="0" />
        </linearGradient>
        {/* Distance haze sitting in front of the far mountains */}
        <linearGradient id="haze" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"   stopColor="#dec79a" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#dec79a" stopOpacity="0" />
        </linearGradient>
        {/* Ground fog drifting along the meadow */}
        <linearGradient id="ground-fog" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"   stopColor="#dccaa0" stopOpacity="0" />
          <stop offset="55%"  stopColor="#dccaa0" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#a8966a" stopOpacity="0.65" />
        </linearGradient>
        {/* Foreground grass */}
        <linearGradient id="grass" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"   stopColor="#6c7a48" />
          <stop offset="60%"  stopColor="#4a5a32" />
          <stop offset="100%" stopColor="#2c3618" />
        </linearGradient>
        {/* Distant mountain — cool blue-grey */}
        <linearGradient id="far-mtn" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"   stopColor="#6e7d8a" />
          <stop offset="100%" stopColor="#445162" />
        </linearGradient>
        {/* Watercolor bleed */}
        <filter id="wet-edge" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
        {/* Paper grain on top */}
        <filter id="paper-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.95" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 0.14
                                  0 0 0 0 0.09
                                  0 0 0 0 0.05
                                  0 0 0 0.32 0" />
        </filter>
        {/* Pine-tree shape — used repeatedly */}
        <g id="pine">
          <path d="M0 0 L-5 -10 L-2 -10 L-7 -22 L-3 -22 L-9 -36 L0 -42 L9 -36 L3 -22 L7 -22 L2 -10 L5 -10 Z"
            fill="currentColor" />
        </g>
      </defs>

      {/* Sky base */}
      <rect x="0" y="0" width="1000" height="360" fill="url(#sky-wash)" />
      {/* Sun glow on the right */}
      <rect x="0" y="0" width="1000" height="360" fill="url(#sun-glow)" />

      {/* Cloud streaks (low opacity ellipses) */}
      <g fill="url(#cloud-wash)" opacity="0.85">
        <ellipse cx="220" cy="70" rx="180" ry="14" />
        <ellipse cx="640" cy="55" rx="220" ry="11" />
        <ellipse cx="430" cy="98" rx="150" ry="9" />
        <ellipse cx="820" cy="105" rx="120" ry="7" />
      </g>

      {/* Setting sun (visible disc behind everything) */}
      <circle cx="740" cy="190" r="36" fill="#ffe7a4" opacity="0.85" filter="url(#wet-edge)" />
      <circle cx="740" cy="190" r="22" fill="#fff2c8" opacity="0.9" />

      {/* Distant mountain ridge — cool blue */}
      <path
        d="M0 200 L60 180 L130 195 L210 160 L300 185 L370 168 L460 190 L540 175 L640 200 L740 178 L830 200 L920 185 L1000 195 L1000 360 L0 360 Z"
        fill="url(#far-mtn)"
        opacity="0.78"
        filter="url(#wet-edge)"
      />
      {/* Haze on top of far mountains */}
      <rect x="0" y="180" width="1000" height="80" fill="url(#haze)" />

      {/* Mid hills — moss green wash */}
      <path
        d="M0 240 Q150 215 280 235 T520 230 T780 240 T1000 232 L1000 360 L0 360 Z"
        fill="#5c6a4a"
        opacity="0.85"
        filter="url(#wet-edge)"
      />
      {/* Mid-distance pines on the ridge */}
      <g color="#2f3d22" opacity="0.85">
        {[50, 130, 220, 310, 420, 510, 600, 680, 790, 880, 960].map((x, i) => (
          <use key={i} href="#pine" x={x} y={232 + (i % 4) * 3} />
        ))}
      </g>

      {/* Near hills — deeper green */}
      <path
        d="M0 280 Q150 260 290 275 T560 275 T820 280 T1000 274 L1000 360 L0 360 Z"
        fill="#3f4a2a"
        opacity="0.95"
      />

      {/* Ground fog band */}
      <rect x="0" y="245" width="1000" height="90" fill="url(#ground-fog)" />

      {/* Foreground grass */}
      <path
        d="M0 320 Q200 305 380 315 T720 318 T1000 312 L1000 360 L0 360 Z"
        fill="url(#grass)"
      />
      {/* Grass tufts */}
      <g stroke="#2c3618" strokeWidth="1.2" strokeLinecap="round" opacity="0.7">
        {[40, 95, 170, 240, 320, 410, 480, 560, 640, 740, 820, 900, 970].map((x, i) => (
          <g key={i} transform={`translate(${x}, ${328 + (i % 3) * 4})`}>
            <path d="M0 0 L-2 -8" />
            <path d="M0 0 L0 -10" />
            <path d="M0 0 L3 -7" />
          </g>
        ))}
      </g>

      {/* Foreground tree on the left edge — frames the scene */}
      <g color="#1d1308" opacity="0.92">
        <path d="M-8 360 L-6 250 Q-4 220 -2 200 L4 198 Q8 220 10 250 L12 360 Z" fill="currentColor" />
        {/* foliage clusters */}
        <g filter="url(#wet-edge)">
          <ellipse cx="2"  cy="170" rx="56" ry="42" fill="#3a4a26" />
          <ellipse cx="-12" cy="220" rx="40" ry="32" fill="#2c3a1c" opacity="0.85" />
          <ellipse cx="20"  cy="195" rx="36" ry="28" fill="#4d5e2f" opacity="0.7" />
        </g>
      </g>

      {/* A few birds in the distance — small V-shapes */}
      <g stroke="#1a140a" strokeWidth="1.2" fill="none" opacity="0.6" strokeLinecap="round">
        <path d="M380 110 Q384 106 388 110 Q392 106 396 110" />
        <path d="M430 130 Q433 127 436 130 Q439 127 442 130" />
        <path d="M560 92  Q564 88  568 92  Q572 88  576 92" />
      </g>

      {/* Paper grain over everything */}
      <rect x="0" y="0" width="1000" height="360" filter="url(#paper-grain)" opacity="0.4" />
      {/* Vignette to ground the scene */}
      <radialGradient id="corner-dark" cx="0.5" cy="1" r="0.85">
        <stop offset="0%"   stopColor="#1a140a" stopOpacity="0" />
        <stop offset="100%" stopColor="#1a140a" stopOpacity="0.5" />
      </radialGradient>
      <rect x="0" y="0" width="1000" height="360" fill="url(#corner-dark)" />
    </svg>
  );
}

// --------------------------------------------------------------------------
// Hero — the cloaked traveller with quill and open book. Iconic line-drawn
// silhouette, watercolor wash for the cloak, gold leaf for the book edge.
// --------------------------------------------------------------------------
interface HeroProps {
  onClick?: () => void;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  block: number;
}

export function HeroFigure({ onClick, hp, maxHp, energy, maxEnergy, block }: HeroProps): React.ReactElement {
  const hpPct = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));
  return (
    <div
      className="scene-hero"
      onClick={onClick}
      title="add SELF to the sentence"
      role="button"
    >
      <svg viewBox="0 0 160 220" aria-label="hero" className="hero-svg">
        <defs>
          <linearGradient id="cloak-wash" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%"   stopColor="#4a3a2a" />
            <stop offset="55%"  stopColor="#2c2218" />
            <stop offset="100%" stopColor="#1a140a" />
          </linearGradient>
          <linearGradient id="cloak-side" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%"   stopColor="#5e4a30" stopOpacity="0.7" />
            <stop offset="60%"  stopColor="#2c2218" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="hero-glow" cx="0.5" cy="0.85" r="0.6">
            <stop offset="0%"   stopColor="#f4d28a" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#f4d28a" stopOpacity="0" />
          </radialGradient>
          <filter id="hero-bleed" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="0.7" />
          </filter>
        </defs>

        {/* glow at feet — campfire / scene light catching the cloak */}
        <ellipse cx="80" cy="200" rx="58" ry="14" fill="url(#hero-glow)" />

        {/* cloak silhouette — watercolor blob first */}
        <g filter="url(#hero-bleed)">
          <path
            d="M80 22
               C 66 22 55 30 52 45
               C 50 56 54 64 58 70
               C 50 78 38 92 32 112
               C 26 134 22 158 24 188
               C 26 200 28 208 32 212
               L 128 212
               C 132 208 134 200 136 188
               C 138 158 134 134 128 112
               C 122 92 110 78 102 70
               C 106 64 110 56 108 45
               C 105 30 94 22 80 22 Z"
            fill="url(#cloak-wash)"
          />
        </g>
        {/* warm rim light on left side of cloak */}
        <path
          d="M80 22 C 66 22 55 30 52 45 C 50 56 54 64 58 70 C 50 78 38 92 32 112 C 26 134 22 158 24 188 L 50 188 C 50 158 56 134 60 112 C 64 92 70 76 76 68 C 72 60 74 50 78 42 Z"
          fill="url(#cloak-side)"
        />

        {/* hood opening — face shadow */}
        <ellipse cx="80" cy="48" rx="13" ry="16" fill="#0d0a06" />
        {/* a faint hint of a face — just enough to read as someone */}
        <circle cx="76" cy="50" r="0.9" fill="#d9bf86" opacity="0.7" />
        <circle cx="84" cy="50" r="0.9" fill="#d9bf86" opacity="0.7" />

        {/* ink outline over the wash — Howe-style */}
        <path
          d="M80 22
             C 66 22 55 30 52 45
             C 50 56 54 64 58 70
             C 50 78 38 92 32 112
             C 26 134 22 158 24 188
             C 26 200 28 208 32 212
             L 128 212
             C 132 208 134 200 136 188
             C 138 158 134 134 128 112
             C 122 92 110 78 102 70
             C 106 64 110 56 108 45
             C 105 30 94 22 80 22 Z"
          fill="none"
          stroke="#0d0a06"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        {/* cloak fold creases */}
        <path d="M62 100 Q 60 140 56 200" stroke="#0d0a06" strokeWidth="1" fill="none" opacity="0.55" />
        <path d="M98 100 Q 100 140 104 200" stroke="#0d0a06" strokeWidth="1" fill="none" opacity="0.55" />
        <path d="M80 80 Q 78 130 80 200" stroke="#0d0a06" strokeWidth="0.8" fill="none" opacity="0.35" />

        {/* left arm — holding open book */}
        <g>
          {/* book — open vellum */}
          <path
            d="M30 130 Q34 122 44 122 L60 124 L60 148 L44 146 Q34 146 30 152 Z"
            fill="#e9d9b0"
            stroke="#0d0a06"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path
            d="M60 124 L60 148 L76 146 Q82 146 84 142 L84 122 Q82 124 76 124 Z"
            fill="#d6c294"
            stroke="#0d0a06"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          {/* gold page edge */}
          <line x1="60" y1="124" x2="60" y2="148" stroke="#b9893a" strokeWidth="0.8" />
          {/* tiny ink lines = text */}
          <line x1="36" y1="130" x2="56" y2="131" stroke="#3a2a18" strokeWidth="0.5" opacity="0.7" />
          <line x1="36" y1="134" x2="56" y2="135" stroke="#3a2a18" strokeWidth="0.5" opacity="0.7" />
          <line x1="36" y1="138" x2="54" y2="139" stroke="#3a2a18" strokeWidth="0.5" opacity="0.7" />
          <line x1="64" y1="129" x2="80" y2="130" stroke="#3a2a18" strokeWidth="0.5" opacity="0.7" />
          <line x1="64" y1="133" x2="82" y2="134" stroke="#3a2a18" strokeWidth="0.5" opacity="0.7" />
          <line x1="64" y1="137" x2="78" y2="138" stroke="#3a2a18" strokeWidth="0.5" opacity="0.7" />
        </g>

        {/* right arm — holding quill aloft */}
        <g>
          {/* hand emerging from cloak */}
          <path d="M118 110 Q124 100 126 90" stroke="#0d0a06" strokeWidth="1.4" fill="none" />
          {/* quill shaft */}
          <path d="M126 90 L142 30" stroke="#0d0a06" strokeWidth="1.4" />
          {/* feather */}
          <path
            d="M140 32
               C 138 28 138 22 140 18
               C 142 14 146 12 150 14
               C 154 16 156 22 154 28
               C 152 34 148 38 144 38
               Q 142 36 140 32 Z"
            fill="#e9d9b0"
            stroke="#0d0a06"
            strokeWidth="1"
          />
          {/* feather barbs */}
          <line x1="141" y1="20" x2="148" y2="24" stroke="#0d0a06" strokeWidth="0.5" opacity="0.6" />
          <line x1="140" y1="25" x2="148" y2="28" stroke="#0d0a06" strokeWidth="0.5" opacity="0.6" />
          <line x1="140" y1="30" x2="146" y2="33" stroke="#0d0a06" strokeWidth="0.5" opacity="0.6" />
          {/* drop of ink at nib */}
          <circle cx="126" cy="90" r="1.6" fill="#1a140a" />
        </g>

        {/* gold-leaf trim along the cloak hem */}
        <path
          d="M32 212 L 128 212"
          stroke="#b9893a" strokeWidth="1.4" strokeLinecap="round" fill="none"
        />
        <path
          d="M34 209 Q 36 207 38 209 T 42 209 T 46 209 T 50 209 T 54 209 T 58 209 T 62 209 T 66 209 T 70 209 T 74 209 T 78 209 T 82 209 T 86 209 T 90 209 T 94 209 T 98 209 T 102 209 T 106 209 T 110 209 T 114 209 T 118 209 T 122 209 T 126 209"
          stroke="#b9893a" strokeWidth="0.6" fill="none" opacity="0.7"
        />

        {/* boots peeking out under the cloak */}
        <g>
          {/* left boot */}
          <path d="M58 212 L58 220 Q58 224 64 224 L72 224 L72 218 L66 218 L66 212 Z"
            fill="#3a2a18" stroke="#0d0a06" strokeWidth="1" strokeLinejoin="round" />
          <path d="M58 217 L72 217" stroke="#b9893a" strokeWidth="0.5" opacity="0.7" />
          {/* right boot */}
          <path d="M88 212 L88 218 L94 218 L94 224 L102 224 Q108 224 108 220 L108 212 Z"
            fill="#3a2a18" stroke="#0d0a06" strokeWidth="1" strokeLinejoin="round" />
          <path d="M94 217 L108 217" stroke="#b9893a" strokeWidth="0.5" opacity="0.7" />
        </g>

        {/* belt with gold buckle around the waist */}
        <path d="M48 138 Q 80 144 112 138 L 112 144 Q 80 150 48 144 Z"
          fill="#3a2a18" stroke="#0d0a06" strokeWidth="0.8" />
        <rect x="76" y="139" width="8" height="8" fill="#b9893a" stroke="#0d0a06" strokeWidth="0.6" rx="1" />
        <line x1="80" y1="139" x2="80" y2="147" stroke="#0d0a06" strokeWidth="0.6" />

        {/* tiny gold clasp at neck */}
        <circle cx="80" cy="66" r="2.6" fill="#b9893a" stroke="#0d0a06" strokeWidth="0.6" />
        <circle cx="80" cy="66" r="1" fill="#5e4a30" />

        {/* hood inner shading — gives depth to the cowl */}
        <path d="M67 42 Q 67 56 80 62 Q 93 56 93 42"
          fill="none" stroke="#0d0a06" strokeWidth="0.7" opacity="0.6" />

        {/* highlight on left shoulder — catching the sun glow */}
        <path d="M52 72 Q 56 96 56 130"
          stroke="#d6a55a" strokeWidth="0.7" fill="none" opacity="0.4" />
      </svg>

      <div className="hero-stamps">
        <span className="hero-stamp hero-hp" title="health">
          <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
            <path d="M5.5 9.5 L1.5 5 Q0.5 3 2 1.8 Q3.6 0.7 5.5 3 Q7.4 0.7 9 1.8 Q10.5 3 9.5 5 Z"
              fill="currentColor" stroke="#0d0a06" strokeWidth="0.6" />
          </svg>
          {hp}/{maxHp}
        </span>
        <span className="hero-stamp hero-en" title="energy">
          <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
            <path d="M6 0 L1 6.5 L4.5 6.5 L3 11 L9 4 L5.5 4 Z" fill="currentColor" />
          </svg>
          {energy}/{maxEnergy}
        </span>
        {block > 0 && (
          <span className="hero-stamp hero-bk" title="block">
            <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
              <path d="M5.5 0.5 L10 2.5 L10 6 Q10 9 5.5 10.5 Q1 9 1 6 L1 2.5 Z"
                fill="currentColor" stroke="#0d0a06" strokeWidth="0.6" />
            </svg>
            {block}
          </span>
        )}
      </div>
      {/* tiny health bar arc beneath hero */}
      <div className="hero-hpbar" aria-hidden="true">
        <div className="hero-hpbar-fill" style={{ width: `${hpPct * 100}%` }} />
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Phase vignette — a small painted illustration sitting behind the drop cap
// of the run-sentence header. Picks an icon per phase: sword for combat,
// flame for fire, coin for shop, star for shrine, mirror for mirror, vine
// for the map between scenes.
// --------------------------------------------------------------------------
export type VignetteKind =
  | 'sword' | 'flame' | 'coin' | 'star' | 'mirror' | 'vine' | 'sunrise' | 'crow';

export function PhaseVignette({ kind, size = 100 }: { kind: VignetteKind; size?: number }): React.ReactElement {
  const glowId = `vg-glow-${kind}`;
  return (
    <svg className="phase-vignette" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient id={glowId} cx="0.5" cy="0.5" r="0.6">
          <stop offset="0%" stopColor="#f4d28a" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#f4d28a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="42" fill={`url(#${glowId})`} />
      {kind === 'sword' && (
        <g stroke="#1a140a" strokeWidth="1.6" fill="#7a1a1f" strokeLinejoin="round">
          <path d="M50 12 L54 60 L50 72 L46 60 Z" />
          <path d="M38 60 L62 60" strokeWidth="2.4" />
          <rect x="48" y="72" width="4" height="12" fill="#3a2a18" />
          <circle cx="50" cy="88" r="3" fill="#b9893a" />
        </g>
      )}
      {kind === 'flame' && (
        <g stroke="#3a1208" strokeWidth="1.4" strokeLinejoin="round">
          <path d="M50 16 Q42 30 38 46 Q34 64 50 84 Q66 64 62 46 Q58 30 50 16 Z" fill="#c64a18" />
          <path d="M50 30 Q44 44 44 56 Q46 70 50 78 Q54 70 56 56 Q56 44 50 30 Z" fill="#f0a040" />
          <path d="M50 46 Q47 56 48 66 Q50 72 50 72 Q52 66 50 56 Q49 50 50 46 Z" fill="#f4d28a" />
        </g>
      )}
      {kind === 'coin' && (
        <g stroke="#1a140a" strokeWidth="1.4">
          <circle cx="50" cy="50" r="26" fill="#c8932e" />
          <circle cx="50" cy="50" r="20" fill="none" stroke="#7a5a20" strokeWidth="1" />
          <path d="M44 40 L44 60 M50 36 L50 64 M56 40 L56 60" stroke="#7a5a20" strokeWidth="1.4" />
          <ellipse cx="44" cy="44" rx="4" ry="2" fill="#f4d28a" opacity="0.7" />
        </g>
      )}
      {kind === 'star' && (
        <g stroke="#1a140a" strokeWidth="1.2" strokeLinejoin="round">
          <path d="M50 14 L56 40 L82 44 L62 60 L70 86 L50 70 L30 86 L38 60 L18 44 L44 40 Z"
            fill="#d6a05a" />
          <circle cx="50" cy="50" r="6" fill="#f4d28a" />
        </g>
      )}
      {kind === 'mirror' && (
        <g stroke="#1a140a" strokeWidth="1.4">
          <ellipse cx="50" cy="48" rx="22" ry="30" fill="#6e7d8a" />
          <ellipse cx="44" cy="42" rx="8" ry="14" fill="#a8b8c4" opacity="0.6" />
          <path d="M28 78 Q40 80 50 78 Q60 80 72 78 L70 86 L30 86 Z" fill="#b9893a" />
        </g>
      )}
      {kind === 'vine' && (
        <g stroke="#2a3418" strokeWidth="1.6" fill="none">
          <path d="M20 84 Q30 70 28 56 Q26 42 40 36 Q54 32 56 22" />
          <path d="M40 36 Q48 38 50 46" />
          <ellipse cx="38" cy="32" rx="6" ry="3" fill="#4a5a32" transform="rotate(-30 38 32)" />
          <ellipse cx="32" cy="50" rx="6" ry="3" fill="#4a5a32" transform="rotate(40 32 50)" />
          <ellipse cx="50" cy="48" rx="6" ry="3" fill="#4a5a32" transform="rotate(-20 50 48)" />
          <ellipse cx="56" cy="20" rx="5" ry="2.5" fill="#4a5a32" transform="rotate(60 56 20)" />
        </g>
      )}
      {kind === 'sunrise' && (
        <g>
          <circle cx="50" cy="58" r="22" fill="#f4d28a" />
          <g stroke="#d6a05a" strokeWidth="2" strokeLinecap="round">
            <line x1="50" y1="20" x2="50" y2="30" />
            <line x1="24" y1="58" x2="34" y2="58" />
            <line x1="66" y1="58" x2="76" y2="58" />
            <line x1="30" y1="34" x2="38" y2="42" />
            <line x1="70" y1="34" x2="62" y2="42" />
          </g>
          <path d="M14 78 Q30 70 50 72 Q70 70 86 78 L86 92 L14 92 Z" fill="#3f4a32" stroke="#1a140a" strokeWidth="1" />
        </g>
      )}
      {kind === 'crow' && (
        <g stroke="#0d0a06" strokeWidth="1.2" fill="#1a140a">
          <path d="M30 50 Q44 36 60 40 Q72 44 76 56 Q72 60 60 56 Q48 56 30 50 Z" />
          <path d="M76 56 L86 48 L82 60 Z" />
          <circle cx="68" cy="50" r="1.4" fill="#f4d28a" />
          <path d="M40 60 Q42 80 38 90" stroke="#0d0a06" strokeWidth="0.8" fill="none" />
          <path d="M50 60 Q52 80 48 90" stroke="#0d0a06" strokeWidth="0.8" fill="none" />
        </g>
      )}
    </svg>
  );
}

// --------------------------------------------------------------------------
// Card glyphs — small ink-and-wash icons at the top corner of each card.
// One per verb id with a sensible default. Rendered at ~22px.
// --------------------------------------------------------------------------
export function CardGlyph({ word, size = 22 }: { word: string; size?: number }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="card-glyph">
      {glyphPath(word)}
    </svg>
  );
}

function glyphPath(word: string): React.ReactElement {
  switch (word) {
    case 'HIT':
    case 'BREAK':
    case 'PUSH':
      // sword
      return (
        <g stroke="#1a140a" strokeWidth="1.2" strokeLinejoin="round" fill="#7a1a1f">
          <path d="M12 2 L13.5 14 L12 17 L10.5 14 Z" />
          <path d="M8 14 L16 14" strokeWidth="1.6" />
          <rect x="11" y="17" width="2" height="4" fill="#3a2a18" />
        </g>
      );
    case 'BURN':
      // flame
      return (
        <g stroke="#3a1208" strokeWidth="1" strokeLinejoin="round">
          <path d="M12 3 Q9 8 8 13 Q7 18 12 22 Q17 18 16 13 Q15 8 12 3 Z" fill="#c64a18" />
          <path d="M12 8 Q10 13 11 17 Q12 20 12 20 Q13 17 13 13 Q13 10 12 8 Z" fill="#f0a040" />
        </g>
      );
    case 'HEAL':
      // drop / leaf
      return (
        <g stroke="#1a140a" strokeWidth="1" strokeLinejoin="round">
          <path d="M12 3 Q7 11 7 15 Q7 20 12 21 Q17 20 17 15 Q17 11 12 3 Z" fill="#5d6f3e" />
          <path d="M10 12 Q9 15 10 18" stroke="#e9d9b0" strokeWidth="1" fill="none" opacity="0.7" />
        </g>
      );
    case 'FREEZE':
      // snowflake
      return (
        <g stroke="#3a4a5a" strokeWidth="1.4" strokeLinecap="round" fill="none">
          <line x1="12" y1="3" x2="12" y2="21" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="5.5" y1="5.5" x2="18.5" y2="18.5" />
          <line x1="5.5" y1="18.5" x2="18.5" y2="5.5" />
          <circle cx="12" cy="12" r="2" fill="#a8c4d8" />
        </g>
      );
    case 'BLOCK':
      // shield
      return (
        <g stroke="#1a140a" strokeWidth="1" strokeLinejoin="round">
          <path d="M12 3 L20 6 L20 13 Q20 19 12 22 Q4 19 4 13 L4 6 Z" fill="#6e7d8a" />
          <path d="M12 7 L12 18" stroke="#3a4a5a" strokeWidth="1" />
          <path d="M7 10 L17 10" stroke="#3a4a5a" strokeWidth="0.8" />
        </g>
      );
    case 'GRAB':
      // hand
      return (
        <g stroke="#1a140a" strokeWidth="1" fill="#d6a05a" strokeLinejoin="round">
          <path d="M8 12 L8 6 Q8 4 10 4 Q12 4 12 6 L12 11 L12 5 Q12 3 14 3 Q16 3 16 5 L16 12 Q18 13 18 17 Q18 21 13 21 Q8 21 6 18 L4 14 Q3 12 5 11 Q6 11 7 12 Z" />
        </g>
      );
    case 'WALK':
      // boot
      return (
        <g stroke="#1a140a" strokeWidth="1" fill="#3a2a18" strokeLinejoin="round">
          <path d="M8 3 L12 3 L12 14 L18 14 Q20 14 20 16 L20 19 Q20 21 18 21 L6 21 Q4 21 4 19 L4 14 Q4 12 6 12 L8 12 Z" />
        </g>
      );
    case 'LOOK':
      // eye
      return (
        <g stroke="#1a140a" strokeWidth="1.2" fill="none">
          <path d="M3 12 Q8 5 12 5 Q16 5 21 12 Q16 19 12 19 Q8 19 3 12 Z" fill="#e9d9b0" />
          <circle cx="12" cy="12" r="3.5" fill="#3a4a5a" />
          <circle cx="12" cy="12" r="1.4" fill="#0d0a06" />
        </g>
      );
    case 'MAKE':
      // star
      return (
        <g stroke="#1a140a" strokeWidth="1" strokeLinejoin="round" fill="#b9893a">
          <path d="M12 3 L14 9 L20 9 L15 13 L17 19 L12 16 L7 19 L9 13 L4 9 L10 9 Z" />
        </g>
      );
    case 'WAIT':
      // hourglass
      return (
        <g stroke="#1a140a" strokeWidth="1" strokeLinejoin="round">
          <path d="M6 3 L18 3 L18 6 Q18 9 14 12 Q18 15 18 18 L18 21 L6 21 L6 18 Q6 15 10 12 Q6 9 6 6 Z" fill="#e9d9b0" />
          <path d="M12 12 L12 18 L14 21 L10 21 Z" fill="#b9893a" />
        </g>
      );
    case 'THROW':
      // arc + stone
      return (
        <g stroke="#1a140a" strokeWidth="1.2" fill="none">
          <path d="M4 18 Q12 3 20 12" />
          <circle cx="4" cy="18" r="2.4" fill="#5e4a30" />
        </g>
      );
    default:
      // generic quill
      return (
        <g stroke="#1a140a" strokeWidth="1" fill="#e9d9b0">
          <path d="M4 20 L18 6 Q21 3 21 6 Q19 12 14 14 L8 18 Z" />
          <line x1="4" y1="20" x2="9" y2="15" strokeWidth="1.2" />
        </g>
      );
  }
}

// --------------------------------------------------------------------------
// Marginalia — vines, birds, flourishes for the page margins. Placed in App
// container; SVGs are absolute-positioned via CSS classes.
// --------------------------------------------------------------------------
export function MarginVine({ side = 'left' }: { side?: 'left' | 'right' } = {}): React.ReactElement {
  return (
    <svg
      className={`margin-vine margin-vine-${side}`}
      viewBox="0 0 60 600"
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <g stroke="#2a3418" strokeWidth="1.4" fill="none" opacity="0.55">
        <path d="M30 0 Q20 60 30 120 Q40 180 30 240 Q20 300 30 360 Q40 420 30 480 Q20 540 30 600" />
        <path d="M30 60 Q14 70 12 84" />
        <path d="M30 180 Q46 192 48 206" />
        <path d="M30 300 Q14 310 12 326" />
        <path d="M30 420 Q46 432 48 446" />
      </g>
      <g fill="#3f4a2a" opacity="0.55">
        <ellipse cx="12" cy="86" rx="8" ry="3.5" transform="rotate(-30 12 86)" />
        <ellipse cx="48" cy="208" rx="8" ry="3.5" transform="rotate(40 48 208)" />
        <ellipse cx="12" cy="328" rx="8" ry="3.5" transform="rotate(-30 12 328)" />
        <ellipse cx="48" cy="448" rx="8" ry="3.5" transform="rotate(40 48 448)" />
      </g>
      <g fill="#7a1a1f" opacity="0.5">
        <circle cx="30" cy="120" r="2.2" />
        <circle cx="30" cy="360" r="2.2" />
        <circle cx="30" cy="540" r="2.2" />
      </g>
    </svg>
  );
}

export function MarginBird({ side = 'tr' }: { side?: 'tr' | 'bl' } = {}): React.ReactElement {
  return (
    <svg className={`margin-bird margin-bird-${side}`} viewBox="0 0 80 80" aria-hidden="true">
      <g stroke="#1a140a" strokeWidth="1.2" fill="none" opacity="0.65">
        {/* branch */}
        <path d="M2 60 Q22 56 40 60 Q58 64 78 60" strokeWidth="1.4" />
        <path d="M20 60 Q16 50 12 46" />
        <path d="M52 60 Q56 52 62 46" />
        {/* leaves */}
        <ellipse cx="14" cy="46" rx="4" ry="2" fill="#3f4a2a" transform="rotate(-30 14 46)" />
        <ellipse cx="62" cy="46" rx="4" ry="2" fill="#3f4a2a" transform="rotate(30 62 46)" />
        {/* bird body */}
        <path d="M34 40 Q38 30 50 32 Q58 34 58 42 Q56 48 48 48 Q40 48 34 40 Z" fill="#1a140a" />
        <path d="M58 38 L66 36 L62 44 Z" fill="#1a140a" />
        <circle cx="54" cy="38" r="1" fill="#f4d28a" />
        {/* tail */}
        <path d="M34 42 L26 46 L34 46 Z" fill="#1a140a" />
      </g>
    </svg>
  );
}

export function MarginFlourish({ side }: { side: 'tl' | 'tr' | 'bl' | 'br' }): React.ReactElement {
  return (
    <svg className={`margin-flourish margin-flourish-${side}`} viewBox="0 0 80 80" aria-hidden="true">
      <g stroke="#4a3c25" strokeWidth="1.2" fill="none" opacity="0.55" strokeLinecap="round">
        <path d="M4 40 Q20 20 40 24 Q30 30 32 40 Q38 36 44 40" />
        <path d="M40 24 Q44 14 54 12" />
        <circle cx="40" cy="24" r="1.6" fill="#7a1a1f" />
        <path d="M52 12 Q60 8 70 12" />
      </g>
    </svg>
  );
}

// --------------------------------------------------------------------------
// Map scene previews — tiny inline watercolor tableaux for each scene kind
// on the map screen. Forest path for combat, coin pouch for shop, fire for
// campfire, etc.
// --------------------------------------------------------------------------
export function MapScenePreview({ kind }: { kind: string }): React.ReactElement {
  switch (kind) {
    case 'combat_normal':
    case 'combat_elite':
    case 'combat_boss':
      return (
        <svg viewBox="0 0 80 70" className="map-preview" aria-hidden="true">
          {/* sky */}
          <rect x="0" y="0" width="80" height="40" fill="#a89870" opacity="0.55" />
          {/* path */}
          <path d="M0 70 L30 38 L50 38 L80 70 Z" fill="#c7ad7c" />
          <path d="M0 70 L30 38 L50 38 L80 70 Z" fill="none" stroke="#4a3c25" strokeWidth="0.6" />
          {/* trees */}
          <path d="M14 50 L10 30 L18 30 Z" fill="#3f4a32" />
          <path d="M28 46 L24 22 L32 22 Z" fill="#2a341e" />
          <path d="M62 50 L58 28 L66 28 Z" fill="#3f4a32" />
          <path d="M50 46 L46 24 L54 24 Z" fill="#2a341e" />
          {/* tiny silhouette afar */}
          <path d="M40 38 L40 28 M38 32 L42 32" stroke="#1a140a" strokeWidth="1" />
        </svg>
      );
    case 'shop':
      return (
        <svg viewBox="0 0 80 70" className="map-preview" aria-hidden="true">
          <rect x="0" y="0" width="80" height="70" fill="#3d2a18" opacity="0.35" />
          {/* coin pouch */}
          <path d="M22 28 Q20 22 26 20 L54 20 Q60 22 58 28 L62 60 Q62 66 56 66 L24 66 Q18 66 18 60 Z"
            fill="#7a5a30" stroke="#1a140a" strokeWidth="1" strokeLinejoin="round" />
          {/* drawstring */}
          <path d="M22 22 Q40 16 58 22" stroke="#1a140a" strokeWidth="1" fill="none" />
          {/* coins */}
          <circle cx="34" cy="44" r="6" fill="#c8932e" stroke="#7a5a20" strokeWidth="0.6" />
          <circle cx="46" cy="48" r="6" fill="#c8932e" stroke="#7a5a20" strokeWidth="0.6" />
          <circle cx="40" cy="38" r="5" fill="#f4d28a" stroke="#7a5a20" strokeWidth="0.6" />
        </svg>
      );
    case 'fire':
      return (
        <svg viewBox="0 0 80 70" className="map-preview" aria-hidden="true">
          <rect x="0" y="0" width="80" height="70" fill="#1a140a" opacity="0.5" />
          <radialGradient id="fire-glow" cx="0.5" cy="0.6" r="0.5">
            <stop offset="0%" stopColor="#f4d28a" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#f4d28a" stopOpacity="0" />
          </radialGradient>
          <ellipse cx="40" cy="50" rx="34" ry="20" fill="url(#fire-glow)" />
          {/* logs */}
          <rect x="20" y="50" width="40" height="5" fill="#3a2a18" stroke="#1a140a" strokeWidth="0.6" rx="2" />
          <rect x="16" y="55" width="48" height="5" fill="#4a3a2a" stroke="#1a140a" strokeWidth="0.6" rx="2" />
          {/* flame */}
          <path d="M40 18 Q32 30 30 40 Q28 52 40 56 Q52 52 50 40 Q48 30 40 18 Z" fill="#c64a18" stroke="#3a1208" strokeWidth="0.6" />
          <path d="M40 26 Q36 36 36 44 Q38 52 40 54 Q42 52 44 44 Q44 36 40 26 Z" fill="#f0a040" />
        </svg>
      );
    case 'shrine':
      return (
        <svg viewBox="0 0 80 70" className="map-preview" aria-hidden="true">
          <rect x="0" y="0" width="80" height="70" fill="#3a4a5a" opacity="0.35" />
          {/* stone */}
          <path d="M30 60 L24 30 L36 14 L48 14 L56 30 L52 60 Z" fill="#8a8478" stroke="#1a140a" strokeWidth="1" strokeLinejoin="round" />
          {/* runes */}
          <path d="M36 28 L44 28 M40 26 L40 36 M38 38 L42 38" stroke="#3a2a18" strokeWidth="1" />
          {/* star */}
          <path d="M40 8 L42 13 L47 13 L43 16 L45 21 L40 18 L35 21 L37 16 L33 13 L38 13 Z" fill="#f4d28a" stroke="#1a140a" strokeWidth="0.6" />
        </svg>
      );
    case 'mirror':
      return (
        <svg viewBox="0 0 80 70" className="map-preview" aria-hidden="true">
          <rect x="0" y="0" width="80" height="70" fill="#3a4a5a" opacity="0.45" />
          <ellipse cx="40" cy="34" rx="22" ry="28" fill="#6e7d8a" stroke="#1a140a" strokeWidth="1" />
          <ellipse cx="32" cy="26" rx="8" ry="14" fill="#c8d4dc" opacity="0.55" />
          <path d="M16 60 Q40 64 64 60 L60 68 L20 68 Z" fill="#b9893a" stroke="#1a140a" strokeWidth="0.6" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 80 70" className="map-preview" aria-hidden="true">
          <rect x="0" y="0" width="80" height="70" fill="#c7ad7c" />
          <circle cx="40" cy="35" r="20" fill="#7a1a1f" opacity="0.6" />
        </svg>
      );
  }
}

// --------------------------------------------------------------------------
// End-screen vignettes
// --------------------------------------------------------------------------
export function EndVignette({ won }: { won: boolean }): React.ReactElement {
  if (won) {
    return (
      <svg className="end-vignette end-vignette-win" viewBox="0 0 600 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="dawn" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#f0c080" />
            <stop offset="35%" stopColor="#d6a05a" />
            <stop offset="65%" stopColor="#a89870" />
            <stop offset="100%" stopColor="#3f4a32" />
          </linearGradient>
          <radialGradient id="sun" cx="0.5" cy="0.55" r="0.4">
            <stop offset="0%" stopColor="#fff2c4" />
            <stop offset="60%" stopColor="#f4d28a" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#f4d28a" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="600" height="240" fill="url(#dawn)" />
        <ellipse cx="300" cy="160" rx="220" ry="100" fill="url(#sun)" />
        <circle cx="300" cy="150" r="36" fill="#fff2c4" />
        {/* distant hills */}
        <path d="M0 180 Q120 150 240 165 T480 160 T600 168 L600 240 L0 240 Z" fill="#5c6a4a" opacity="0.7" />
        <path d="M0 200 Q140 180 260 195 T500 195 T600 198 L600 240 L0 240 Z" fill="#3f4a32" />
        {/* path forward */}
        <path d="M260 240 L290 200 L310 200 L340 240 Z" fill="#c7ad7c" stroke="#4a3c25" strokeWidth="1" opacity="0.85" />
        {/* trees */}
        <path d="M70 200 L60 150 L80 150 Z" fill="#2a341e" opacity="0.85" />
        <path d="M520 200 L510 150 L530 150 Z" fill="#2a341e" opacity="0.85" />
      </svg>
    );
  }
  return (
    <svg className="end-vignette end-vignette-loss" viewBox="0 0 600 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="dusk" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#3a4a5a" />
          <stop offset="50%" stopColor="#2a2218" />
          <stop offset="100%" stopColor="#0e0a06" />
        </linearGradient>
        <radialGradient id="fade-edges" cx="0.5" cy="0.5" r="0.7">
          <stop offset="50%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.85" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="600" height="240" fill="url(#dusk)" />
      {/* dead trees as silhouettes */}
      <g stroke="#1a140a" strokeWidth="1.6" fill="none" opacity="0.85">
        <path d="M120 240 L116 100 M116 130 L100 110 M116 150 L132 130 M116 170 L96 160" />
        <path d="M480 240 L484 110 M484 140 L498 120 M484 160 L468 144 M484 175 L500 165" />
        <path d="M300 240 L298 60 M298 90 L280 70 M298 110 L320 90 M298 130 L278 116 M298 150 L322 134" />
      </g>
      {/* a crow on a branch */}
      <g fill="#0a0604" opacity="0.85">
        <path d="M380 90 Q392 80 408 84 Q418 88 418 96 Q416 102 408 100 Q396 100 380 90 Z" />
        <path d="M418 92 L428 86 L424 100 Z" />
      </g>
      {/* dark corners */}
      <rect x="0" y="0" width="600" height="240" fill="url(#fade-edges)" />
    </svg>
  );
}

// --------------------------------------------------------------------------
// Title-screen banner — painted forest scene with a small cloaked figure
// walking toward a glowing horizon. Sits above the wordmark.
// --------------------------------------------------------------------------
export function TitleBanner(): React.ReactElement {
  return (
    <svg className="title-banner" viewBox="0 0 600 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="tb-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#5a6e85" />
          <stop offset="55%" stopColor="#cf9858" />
          <stop offset="100%" stopColor="#4a2818" />
        </linearGradient>
        <radialGradient id="tb-sun" cx="0.5" cy="0.62" r="0.32">
          <stop offset="0%" stopColor="#fff2c4" stopOpacity="0.95" />
          <stop offset="60%" stopColor="#f4d28a" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#f4d28a" stopOpacity="0" />
        </radialGradient>
        <filter id="tb-bleed" x="-5%" y="-5%" width="110%" height="110%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
        <filter id="tb-grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" /><feColorMatrix values="0 0 0 0 0.12  0 0 0 0 0.08  0 0 0 0 0.04  0 0 0 0.32 0" /></filter>
      </defs>
      <rect x="0" y="0" width="600" height="240" fill="url(#tb-sky)" />
      <rect x="0" y="0" width="600" height="240" fill="url(#tb-sun)" />
      <circle cx="300" cy="148" r="28" fill="#fff2c4" opacity="0.9" />
      <circle cx="300" cy="148" r="18" fill="#ffeac0" />

      {/* distant mountains */}
      <path d="M0 158 L70 138 L160 152 L240 130 L320 150 L400 132 L480 152 L560 138 L600 148 L600 240 L0 240 Z"
        fill="#5a6a7a" opacity="0.65" filter="url(#tb-bleed)" />
      {/* nearer hills */}
      <path d="M0 190 Q120 170 240 188 T440 188 T600 184 L600 240 L0 240 Z"
        fill="#3f4a32" opacity="0.85" />
      {/* tree silhouettes */}
      <g color="#1a2010" opacity="0.92">
        {[40, 105, 165, 220, 370, 432, 490, 555].map((x, i) => (
          <g key={i} transform={`translate(${x}, ${188 + (i % 3) * 2})`}>
            <path d="M0 0 L-5 -22 L-2 -22 L-6 -32 L0 -38 L6 -32 L2 -22 L5 -22 Z" fill="currentColor" />
          </g>
        ))}
      </g>
      {/* path */}
      <path d="M270 240 L292 200 L308 200 L330 240 Z" fill="#c7ad7c" opacity="0.85" />
      <path d="M278 232 L296 208 L304 208 L322 232" stroke="#7a5a30" strokeWidth="0.6" fill="none" opacity="0.55" />

      {/* small cloaked figure walking the path */}
      <g transform="translate(296, 198)" filter="url(#tb-bleed)">
        <path d="M0 0 C -3 0 -5 2 -5 5 L -5 10 C -5 14 -3 18 0 22 L 0 26 L 6 26 L 6 22 C 9 18 11 14 11 10 L 11 5 C 11 2 9 0 6 0 Z"
          fill="#1a140a" />
      </g>
      <g transform="translate(296, 198)">
        {/* ink outline */}
        <path d="M0 0 C -3 0 -5 2 -5 5 L -5 10 C -5 14 -3 18 0 22 L 0 26 L 6 26 L 6 22 C 9 18 11 14 11 10 L 11 5 C 11 2 9 0 6 0 Z"
          stroke="#0a0604" strokeWidth="0.4" fill="none" />
        {/* tiny gold clasp */}
        <circle cx="3" cy="6" r="0.8" fill="#b9893a" />
      </g>

      {/* a couple of distant birds */}
      <g stroke="#1a140a" strokeWidth="1" fill="none" opacity="0.6" strokeLinecap="round">
        <path d="M170 92 Q174 88 178 92 Q182 88 186 92" />
        <path d="M420 78 Q424 74 428 78 Q432 74 436 78" />
        <path d="M460 100 Q463 97 466 100 Q469 97 472 100" />
      </g>

      {/* paper grain + frame vignette */}
      <rect x="0" y="0" width="600" height="240" filter="url(#tb-grain)" opacity="0.4" />
      <radialGradient id="tb-vignette" cx="0.5" cy="0.5" r="0.85">
        <stop offset="55%" stopColor="#1a140a" stopOpacity="0" />
        <stop offset="100%" stopColor="#1a140a" stopOpacity="0.55" />
      </radialGradient>
      <rect x="0" y="0" width="600" height="240" fill="url(#tb-vignette)" />
    </svg>
  );
}

// --------------------------------------------------------------------------
// Fire scene — a small campfire with stacked logs, ember-glow, flames as
// layered watercolor shapes, smoke wisping up.
// --------------------------------------------------------------------------
export function FireBlaze(): React.ReactElement {
  return (
    <svg className="fire-blaze" viewBox="0 0 240 240" aria-hidden="true">
      <defs>
        <radialGradient id="fb-glow" cx="0.5" cy="0.55" r="0.5">
          <stop offset="0%"   stopColor="#ffe09a" stopOpacity="0.95" />
          <stop offset="45%"  stopColor="#f4a44a" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#f4a44a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="fb-outer" x1="0.5" x2="0.5" y1="1" y2="0">
          <stop offset="0%"   stopColor="#cc4a18" />
          <stop offset="60%"  stopColor="#e87b1a" />
          <stop offset="100%" stopColor="#f4d28a" />
        </linearGradient>
        <linearGradient id="fb-inner" x1="0.5" x2="0.5" y1="1" y2="0">
          <stop offset="0%"   stopColor="#f0a040" />
          <stop offset="60%"  stopColor="#fff2c4" />
          <stop offset="100%" stopColor="#ffffff" />
        </linearGradient>
        <filter id="fb-bleed"><feGaussianBlur stdDeviation="1.6" /></filter>
        <linearGradient id="fb-log" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#6a3a18" />
          <stop offset="100%" stopColor="#3a1d0a" />
        </linearGradient>
      </defs>
      {/* glow halo */}
      <circle cx="120" cy="155" r="110" fill="url(#fb-glow)" />
      {/* outer flame */}
      <path
        d="M120 50
           C 96 70 84 100 88 130
           C 90 150 102 168 102 184
           C 102 196 110 204 120 204
           C 130 204 138 196 138 184
           C 138 168 150 150 152 130
           C 156 100 144 70 120 50 Z"
        fill="url(#fb-outer)" filter="url(#fb-bleed)"
      />
      {/* inner flame */}
      <path
        d="M120 90
           C 108 102 102 122 106 140
           C 108 152 116 162 116 174
           C 116 184 122 188 120 188
           C 122 188 124 184 124 174
           C 124 162 132 152 134 140
           C 138 122 132 102 120 90 Z"
        fill="url(#fb-inner)" filter="url(#fb-bleed)" opacity="0.95"
      />
      {/* logs at the bottom */}
      <g>
        <ellipse cx="120" cy="200" rx="80" ry="14" fill="#2a160a" opacity="0.7" />
        <rect x="58" y="186" width="124" height="14" rx="6" fill="url(#fb-log)" stroke="#1a0a04" strokeWidth="1" />
        <rect x="70" y="172" width="100" height="14" rx="6" fill="url(#fb-log)" stroke="#1a0a04" strokeWidth="1" transform="rotate(-7 120 179)" />
        {/* log end grain */}
        <circle cx="58" cy="193" r="4" fill="#7a4220" stroke="#1a0a04" strokeWidth="0.6" />
        <circle cx="182" cy="193" r="4" fill="#7a4220" stroke="#1a0a04" strokeWidth="0.6" />
      </g>
      {/* sparks */}
      <g fill="#fff2c4" opacity="0.9">
        <circle cx="92" cy="84"  r="1.4" />
        <circle cx="146" cy="70" r="1.2" />
        <circle cx="80" cy="120" r="1" opacity="0.7" />
        <circle cx="160" cy="110" r="1.4" />
        <circle cx="138" cy="42" r="0.9" opacity="0.7" />
      </g>
      {/* smoke wisps */}
      <g stroke="#7a6a55" strokeWidth="1.2" fill="none" opacity="0.5" strokeLinecap="round">
        <path d="M118 50 Q 110 30 118 12 Q 126 -2 120 -20" />
        <path d="M128 56 Q 138 38 132 22" />
      </g>
    </svg>
  );
}

// --------------------------------------------------------------------------
// Mirror plate — an oval mirror in a carved oak frame, with a faint
// reflection visible in the glass.
// --------------------------------------------------------------------------
export function MirrorPlate(): React.ReactElement {
  return (
    <svg className="mirror-plate" viewBox="0 0 240 280" aria-hidden="true">
      <defs>
        <linearGradient id="mp-frame" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#6a4a26" />
          <stop offset="50%" stopColor="#3a2a14" />
          <stop offset="100%" stopColor="#5a3a1c" />
        </linearGradient>
        <radialGradient id="mp-glass" cx="0.45" cy="0.4" r="0.7">
          <stop offset="0%" stopColor="#dee8f0" stopOpacity="0.9" />
          <stop offset="45%" stopColor="#a8b5c4" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#3a4a5a" stopOpacity="0.9" />
        </radialGradient>
        <linearGradient id="mp-sheen" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.2" />
        </linearGradient>
        <filter id="mp-shadow"><feGaussianBlur stdDeviation="2" /></filter>
      </defs>

      {/* shadow under the mirror */}
      <ellipse cx="120" cy="260" rx="80" ry="8" fill="#1a140a" opacity="0.55" filter="url(#mp-shadow)" />

      {/* outer carved frame */}
      <ellipse cx="120" cy="130" rx="98" ry="124" fill="url(#mp-frame)" stroke="#0d0a06" strokeWidth="2" />
      {/* frame carving — vine and leaf motif */}
      <g stroke="#b9893a" strokeWidth="1.2" fill="none" opacity="0.85">
        <path d="M120 8 Q 100 28 90 50" />
        <path d="M120 8 Q 140 28 150 50" />
        <path d="M120 252 Q 100 232 90 210" />
        <path d="M120 252 Q 140 232 150 210" />
        <path d="M22 130 Q 36 110 50 100" />
        <path d="M218 130 Q 204 110 190 100" />
        <path d="M22 130 Q 36 150 50 160" />
        <path d="M218 130 Q 204 150 190 160" />
      </g>
      {/* gold corner accents at cardinal points */}
      <g fill="#b9893a" stroke="#0d0a06" strokeWidth="0.7">
        <circle cx="120" cy="8" r="4" />
        <circle cx="120" cy="252" r="4" />
        <circle cx="22" cy="130" r="4" />
        <circle cx="218" cy="130" r="4" />
      </g>

      {/* inner gold bezel */}
      <ellipse cx="120" cy="130" rx="80" ry="106" fill="none" stroke="#b9893a" strokeWidth="1.6" />

      {/* glass */}
      <ellipse cx="120" cy="130" rx="78" ry="104" fill="url(#mp-glass)" />
      {/* faint reflection — a tiny figure with a glow */}
      <g opacity="0.55">
        <ellipse cx="120" cy="200" rx="22" ry="3" fill="#1a140a" opacity="0.5" />
        <path d="M120 130 C 110 130 104 138 104 148 L 104 188 C 104 196 110 200 120 200 L 136 200 C 136 200 136 196 136 188 L 136 148 C 136 138 130 130 120 130 Z"
          fill="#3a2c1a" />
        <circle cx="120" cy="142" r="2.6" fill="#b9893a" />
      </g>
      {/* glass sheen overlay */}
      <ellipse cx="120" cy="130" rx="78" ry="104" fill="url(#mp-sheen)" opacity="0.5" />
      {/* a soft highlight crescent */}
      <path d="M68 80 Q 88 60 120 56" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.45" />
    </svg>
  );
}

// --------------------------------------------------------------------------
// Merchant stall — a cloaked figure sitting beside a small lantern with a
// pouch of bottled words on a stone. Painted in dusk tones.
// --------------------------------------------------------------------------
export function MerchantStall(): React.ReactElement {
  return (
    <svg className="merchant-stall" viewBox="0 0 280 200" aria-hidden="true">
      <defs>
        <linearGradient id="ms-bg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#3a4254" />
          <stop offset="55%" stopColor="#a8754a" />
          <stop offset="100%" stopColor="#3a200e" />
        </linearGradient>
        <radialGradient id="ms-lantern" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%"  stopColor="#fff2c4" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#f4ba6c" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#f4ba6c" stopOpacity="0" />
        </radialGradient>
        <filter id="ms-bleed"><feGaussianBlur stdDeviation="1.2" /></filter>
        <linearGradient id="ms-cloak" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#4a2a18" />
          <stop offset="100%" stopColor="#1a0a04" />
        </linearGradient>
        <linearGradient id="ms-pouch" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#a8743a" />
          <stop offset="100%" stopColor="#5a3a18" />
        </linearGradient>
      </defs>

      {/* sky / dusk background */}
      <rect x="0" y="0" width="280" height="200" fill="url(#ms-bg)" />

      {/* lantern halo */}
      <ellipse cx="186" cy="106" rx="100" ry="80" fill="url(#ms-lantern)" />

      {/* ground */}
      <path d="M0 160 Q 140 152 280 158 L 280 200 L 0 200 Z" fill="#2a1810" opacity="0.85" />

      {/* distant trees behind */}
      <g color="#1a1208" opacity="0.7">
        {[10, 40, 70, 235, 260].map((x, i) => (
          <g key={i} transform={`translate(${x}, ${160 + (i % 2) * 2})`}>
            <path d="M0 0 L-5 -22 L-2 -22 L-6 -32 L0 -38 L6 -32 L2 -22 L5 -22 Z" fill="currentColor" />
          </g>
        ))}
      </g>

      {/* the merchant — cloaked figure on a stool */}
      <g filter="url(#ms-bleed)">
        {/* cloak body */}
        <path d="M70 100 C 60 100 54 110 56 122 C 56 134 60 144 62 152 L 102 152 C 104 144 108 134 108 122 C 110 110 104 100 94 100 Q 90 92 92 84 Q 88 78 82 78 Q 76 78 72 84 Q 74 92 70 100 Z"
          fill="url(#ms-cloak)" />
      </g>
      {/* hood opening — shadowed face */}
      <ellipse cx="82" cy="82" rx="7" ry="9" fill="#0a0604" />
      {/* faint hint of eyes */}
      <circle cx="79" cy="83" r="0.6" fill="#d9bf86" opacity="0.7" />
      <circle cx="85" cy="83" r="0.6" fill="#d9bf86" opacity="0.7" />
      {/* gold clasp */}
      <circle cx="82" cy="98" r="1.6" fill="#b9893a" stroke="#0d0a06" strokeWidth="0.5" />
      {/* cloak ink outline */}
      <path d="M70 100 C 60 100 54 110 56 122 C 56 134 60 144 62 152 L 102 152 C 104 144 108 134 108 122 C 110 110 104 100 94 100"
        stroke="#0d0a06" strokeWidth="1" fill="none" />
      {/* hood crease */}
      <path d="M72 86 Q 82 90 92 86" stroke="#0d0a06" strokeWidth="0.6" fill="none" opacity="0.6" />

      {/* stone the pouch sits on */}
      <path d="M140 144 Q 130 142 124 152 L 200 152 Q 198 142 190 142 Z"
        fill="#7a6a55" stroke="#1a140a" strokeWidth="1" />
      <path d="M126 150 L 198 150" stroke="#0d0a06" strokeWidth="0.6" opacity="0.4" />

      {/* pouch with bottles */}
      <g>
        <path d="M150 142 C 146 138 148 130 156 130 L 178 130 C 186 130 188 138 184 142 Z"
          fill="url(#ms-pouch)" stroke="#0d0a06" strokeWidth="1" />
        {/* drawstring */}
        <path d="M156 130 Q 158 124 162 124 Q 166 124 168 128" stroke="#1a0a04" strokeWidth="0.8" fill="none" />
        <path d="M172 128 Q 174 124 178 124 Q 182 124 178 132" stroke="#1a0a04" strokeWidth="0.8" fill="none" />
        {/* a couple of bottles peeking out */}
        <rect x="156" y="120" width="4" height="14" rx="1" fill="#a8b5c4" stroke="#0d0a06" strokeWidth="0.6" />
        <rect x="164" y="118" width="4" height="16" rx="1" fill="#7a3a20" stroke="#0d0a06" strokeWidth="0.6" />
        <rect x="172" y="122" width="4" height="12" rx="1" fill="#4a6a3a" stroke="#0d0a06" strokeWidth="0.6" />
        {/* cork tops */}
        <rect x="156" y="118" width="4" height="2" fill="#3a200e" />
        <rect x="164" y="116" width="4" height="2" fill="#3a200e" />
        <rect x="172" y="120" width="4" height="2" fill="#3a200e" />
      </g>

      {/* lantern on a post */}
      <g>
        {/* post */}
        <rect x="184" y="100" width="3" height="50" fill="#2a1810" />
        {/* arm */}
        <path d="M184 102 L 174 100" stroke="#2a1810" strokeWidth="2" />
        {/* lantern body */}
        <path d="M168 100 L 172 92 L 184 92 L 188 100 L 184 116 L 172 116 Z"
          fill="#3a2614" stroke="#0d0a06" strokeWidth="1" />
        {/* lantern glass */}
        <path d="M172 100 L 184 100 L 182 114 L 174 114 Z"
          fill="#fff2c4" opacity="0.85" />
        {/* flame inside */}
        <path d="M178 106 Q 176 110 178 113 Q 180 110 178 106 Z" fill="#f4a44a" />
        <path d="M178 108 Q 177 110 178 112 Q 179 110 178 108 Z" fill="#fff2c4" />
        {/* lantern top ring */}
        <circle cx="178" cy="90" r="2.5" fill="none" stroke="#1a140a" strokeWidth="1" />
      </g>

      {/* a couple of motes drifting from the lantern */}
      <g fill="#fff2c4" opacity="0.85">
        <circle cx="196" cy="74" r="1" />
        <circle cx="206" cy="56" r="0.8" opacity="0.6" />
        <circle cx="160" cy="64" r="1" opacity="0.5" />
      </g>
    </svg>
  );
}

// --------------------------------------------------------------------------
// Shrine stone — a moss-covered standing stone in a clearing, runes carved
// into its face, a small candle at its base, light dappling through trees.
// --------------------------------------------------------------------------
export function ShrineStone(): React.ReactElement {
  return (
    <svg className="shrine-stone" viewBox="0 0 240 240" aria-hidden="true">
      <defs>
        <linearGradient id="ss-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#6a7d8a" />
          <stop offset="55%" stopColor="#a89870" />
          <stop offset="100%" stopColor="#3f4a32" />
        </linearGradient>
        <radialGradient id="ss-light" cx="0.5" cy="0.32" r="0.45">
          <stop offset="0%" stopColor="#fff2c4" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#fff2c4" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ss-stone" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#a89884" />
          <stop offset="100%" stopColor="#4a4036" />
        </linearGradient>
        <linearGradient id="ss-moss" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#6a7a3a" />
          <stop offset="100%" stopColor="#3a4a1c" />
        </linearGradient>
        <filter id="ss-bleed"><feGaussianBlur stdDeviation="1.2" /></filter>
      </defs>

      {/* clearing background */}
      <rect x="0" y="0" width="240" height="240" fill="url(#ss-sky)" />
      <ellipse cx="120" cy="80" rx="120" ry="80" fill="url(#ss-light)" />

      {/* tree trunks framing the clearing */}
      <g stroke="#1a140a" strokeWidth="2.2" fill="none" opacity="0.85">
        <path d="M16 240 L 20 60 Q 22 40 18 28" />
        <path d="M224 240 L 220 56 Q 218 38 222 26" />
        <path d="M40 240 L 38 110" strokeWidth="1.4" opacity="0.6" />
        <path d="M200 240 L 202 105" strokeWidth="1.4" opacity="0.6" />
      </g>
      {/* foliage blobs */}
      <g filter="url(#ss-bleed)" opacity="0.85">
        <ellipse cx="18" cy="40" rx="38" ry="32" fill="#3a4a26" />
        <ellipse cx="222" cy="36" rx="40" ry="32" fill="#3a4a26" />
        <ellipse cx="40" cy="100" rx="22" ry="16" fill="#3a4a26" opacity="0.7" />
        <ellipse cx="200" cy="98" rx="24" ry="18" fill="#3a4a26" opacity="0.7" />
      </g>

      {/* ground */}
      <path d="M0 190 Q 120 178 240 190 L 240 240 L 0 240 Z" fill="#3a2c14" opacity="0.85" />
      {/* grass tufts */}
      <g stroke="#3a4a1c" strokeWidth="1.2" strokeLinecap="round" opacity="0.85">
        {[40, 70, 96, 156, 184, 210].map((x, i) => (
          <g key={i} transform={`translate(${x}, ${198 + (i % 3) * 2})`}>
            <path d="M0 0 L-2 -7" />
            <path d="M0 0 L0 -9" />
            <path d="M0 0 L2 -6" />
          </g>
        ))}
      </g>

      {/* shrine stone — tall, rough rectangle */}
      <g>
        <path d="M96 196
                 Q 96 88 102 70
                 Q 106 56 120 56
                 Q 134 56 138 70
                 Q 144 88 144 196 Z"
          fill="url(#ss-stone)" stroke="#1a140a" strokeWidth="1.5" />
        {/* crack lines */}
        <path d="M104 100 Q 106 130 102 170" stroke="#2a1810" strokeWidth="0.6" fill="none" opacity="0.55" />
        <path d="M138 130 Q 136 150 140 180" stroke="#2a1810" strokeWidth="0.6" fill="none" opacity="0.55" />
        {/* moss cap */}
        <path d="M96 78 Q 100 64 120 62 Q 140 64 144 78 Q 138 92 120 90 Q 102 92 96 78 Z"
          fill="url(#ss-moss)" stroke="#1a140a" strokeWidth="1" />
        <path d="M100 84 Q 110 78 120 80 Q 130 78 140 84" stroke="#2c3a1c" strokeWidth="0.6" fill="none" opacity="0.6" />
        {/* moss patches lower */}
        <path d="M100 196 Q 105 180 108 196 Z" fill="url(#ss-moss)" />
        <path d="M132 196 Q 138 178 142 196 Z" fill="url(#ss-moss)" />
        {/* carved runes — three symbols stacked */}
        <g stroke="#1a140a" strokeWidth="1.4" fill="none" strokeLinecap="round">
          {/* vertical with crossbar */}
          <path d="M114 108 L 114 124 M114 116 L 122 116" />
          {/* triangle */}
          <path d="M120 138 L 114 148 L 126 148 Z" />
          {/* spiral-ish wheel */}
          <circle cx="120" cy="166" r="6" />
          <path d="M120 160 L 120 172 M114 166 L 126 166" />
        </g>
      </g>

      {/* candle at the base */}
      <g>
        {/* candle stub */}
        <rect x="158" y="184" width="6" height="10" fill="#e9d4a8" stroke="#0d0a06" strokeWidth="0.7" />
        {/* wick */}
        <line x1="161" y1="184" x2="161" y2="180" stroke="#1a140a" strokeWidth="0.7" />
        {/* flame */}
        <path d="M161 180 Q 159 176 161 172 Q 163 176 161 180 Z" fill="#f4a44a" />
        <path d="M161 178 Q 160 176 161 174 Q 162 176 161 178 Z" fill="#fff2c4" />
        {/* wax pool */}
        <ellipse cx="161" cy="195" rx="6" ry="2" fill="#cfa66a" opacity="0.7" />
        {/* faint glow */}
        <circle cx="161" cy="180" r="14" fill="#fff2c4" opacity="0.18" />
      </g>

      {/* a few floating motes near the candle */}
      <g fill="#fff2c4" opacity="0.7">
        <circle cx="172" cy="170" r="0.8" />
        <circle cx="148" cy="166" r="0.7" opacity="0.6" />
        <circle cx="166" cy="156" r="0.7" />
      </g>
    </svg>
  );
}

// --------------------------------------------------------------------------
// Reward laurel — a watercolor laurel wreath with an open book + quill at
// center and a small ribbon at the bottom. Sits above the VICTORY heading.
// --------------------------------------------------------------------------
export function RewardLaurel(): React.ReactElement {
  return (
    <svg className="reward-laurel" viewBox="0 0 240 140" aria-hidden="true">
      <defs>
        <radialGradient id="rl-glow" cx="0.5" cy="0.5" r="0.55">
          <stop offset="0%"   stopColor="#fff2c4" stopOpacity="0.8" />
          <stop offset="60%"  stopColor="#f4d28a" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#f4d28a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="rl-leaf" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#6a8a3a" />
          <stop offset="100%" stopColor="#3a521c" />
        </linearGradient>
        <linearGradient id="rl-leaf2" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#7a9a4a" />
          <stop offset="100%" stopColor="#4a6a2c" />
        </linearGradient>
        <linearGradient id="rl-ribbon" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#a72131" />
          <stop offset="100%" stopColor="#581018" />
        </linearGradient>
        <filter id="rl-bleed"><feGaussianBlur stdDeviation="0.7" /></filter>
      </defs>

      {/* central glow */}
      <ellipse cx="120" cy="70" rx="68" ry="44" fill="url(#rl-glow)" />

      {/* left half of laurel wreath — leaves curling around */}
      <g filter="url(#rl-bleed)">
        {[
          { x: 56, y: 110, r: 30 },  { x: 44, y: 96, r: 20 },
          { x: 36, y: 80, r: 10 },   { x: 34, y: 64, r: 0 },
          { x: 38, y: 48, r: -10 },  { x: 48, y: 34, r: -22 },
          { x: 62, y: 24, r: -36 },  { x: 80, y: 18, r: -52 },
        ].map((p, i) => (
          <g key={`l${i}`} transform={`translate(${p.x}, ${p.y}) rotate(${p.r})`}>
            <path
              d="M0 0 C -3 -8 -3 -16 0 -22 C 3 -16 3 -8 0 0 Z"
              fill={i % 2 ? 'url(#rl-leaf2)' : 'url(#rl-leaf)'}
              stroke="#1a2010" strokeWidth="0.5"
            />
            <line x1="0" y1="-1" x2="0" y2="-20" stroke="#1a2010" strokeWidth="0.4" opacity="0.6" />
          </g>
        ))}
      </g>
      {/* right half of laurel wreath */}
      <g filter="url(#rl-bleed)">
        {[
          { x: 184, y: 110, r: -30 }, { x: 196, y: 96, r: -20 },
          { x: 204, y: 80, r: -10 },  { x: 206, y: 64, r: 0 },
          { x: 202, y: 48, r: 10 },   { x: 192, y: 34, r: 22 },
          { x: 178, y: 24, r: 36 },   { x: 160, y: 18, r: 52 },
        ].map((p, i) => (
          <g key={`r${i}`} transform={`translate(${p.x}, ${p.y}) rotate(${p.r})`}>
            <path
              d="M0 0 C -3 -8 -3 -16 0 -22 C 3 -16 3 -8 0 0 Z"
              fill={i % 2 ? 'url(#rl-leaf2)' : 'url(#rl-leaf)'}
              stroke="#1a2010" strokeWidth="0.5"
            />
            <line x1="0" y1="-1" x2="0" y2="-20" stroke="#1a2010" strokeWidth="0.4" opacity="0.6" />
          </g>
        ))}
      </g>

      {/* open book in the centre */}
      <g>
        <path
          d="M88 78 Q 92 70 102 70 L 120 72 L 120 100 L 102 98 Q 92 98 88 104 Z"
          fill="#e9d9b0" stroke="#0d0a06" strokeWidth="1" strokeLinejoin="round"
        />
        <path
          d="M120 72 L 120 100 L 138 98 Q 148 98 152 104 L 152 78 Q 148 70 138 70 Z"
          fill="#d6c294" stroke="#0d0a06" strokeWidth="1" strokeLinejoin="round"
        />
        {/* gold page edges */}
        <line x1="120" y1="72" x2="120" y2="100" stroke="#b9893a" strokeWidth="0.7" />
        {/* text lines */}
        <g stroke="#3a2a18" strokeWidth="0.4" opacity="0.7">
          <line x1="94" y1="78" x2="116" y2="79" />
          <line x1="94" y1="82" x2="116" y2="83" />
          <line x1="94" y1="86" x2="114" y2="87" />
          <line x1="94" y1="90" x2="112" y2="91" />
          <line x1="124" y1="77" x2="146" y2="78" />
          <line x1="124" y1="81" x2="148" y2="82" />
          <line x1="124" y1="85" x2="146" y2="86" />
          <line x1="124" y1="89" x2="144" y2="90" />
        </g>
      </g>

      {/* quill standing in an inkwell behind the book */}
      <g>
        {/* inkwell */}
        <ellipse cx="120" cy="106" rx="10" ry="3" fill="#1a140a" />
        <path d="M112 106 L 110 116 Q 110 122 120 122 Q 130 122 130 116 L 128 106 Z"
          fill="#3a2a18" stroke="#0d0a06" strokeWidth="0.8" />
        {/* quill shaft */}
        <path d="M120 100 L 152 36" stroke="#1a140a" strokeWidth="1.4" />
        {/* feather */}
        <path
          d="M148 38 C 144 32 144 22 148 16 C 152 10 158 8 162 14 C 166 22 162 32 156 38 Q 152 40 148 38 Z"
          fill="#e9d9b0" stroke="#0d0a06" strokeWidth="0.8"
        />
        {/* feather barbs */}
        <g stroke="#0d0a06" strokeWidth="0.4" opacity="0.6">
          <line x1="149" y1="22" x2="158" y2="24" />
          <line x1="149" y1="28" x2="158" y2="30" />
          <line x1="149" y1="34" x2="156" y2="36" />
        </g>
        {/* nib */}
        <circle cx="120" cy="100" r="1.4" fill="#0d0a06" />
      </g>

      {/* red ribbon below */}
      <g>
        <path d="M104 116 L 100 130 L 110 126 L 114 138 L 118 124 L 122 138 L 126 126 L 136 130 L 132 116 Z"
          fill="url(#rl-ribbon)" stroke="#1a0a08" strokeWidth="0.7" />
        {/* a tiny gold accent on the ribbon */}
        <circle cx="120" cy="124" r="2" fill="#b9893a" stroke="#0d0a06" strokeWidth="0.4" />
      </g>
    </svg>
  );
}
