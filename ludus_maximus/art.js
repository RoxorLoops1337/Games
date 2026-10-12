// Ludus Maximus: bold flat SVG art. Thick ink outlines, hard shapes, no gradients.
(function (G) {
  const D = G.LM_D;
  const A = {};
  const INK = '#14100f';
  const IRON = '#8f8a80';
  const sw = 'stroke="' + INK + '" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"';

  // ---------- UI icons (24x24) ----------
  const IC = {
    coin: '<circle cx="12" cy="12" r="9.5" fill="#f6b82d"/><circle cx="12" cy="12" r="5.5" fill="none" stroke="#a8761a" stroke-width="2"/>',
    fame: '<path d="M12 2.5l2.9 6.2 6.6.8-4.9 4.6 1.3 6.7L12 17.5 6.1 20.8l1.3-6.7L2.5 9.5l6.6-.8z" fill="#ffd34d"/>',
    week: '<rect x="3" y="5" width="18" height="16" rx="3" fill="#f5ead2"/><rect x="3" y="5" width="18" height="5" fill="#d2412b" stroke="none"/><path d="M8 3v4M16 3v4" fill="none"/><circle cx="12" cy="15.5" r="2.2" fill="#14100f"/>',
    swords: '<path d="M4 20l11-11M20 20L9 9M4 4l5 1 2 2-2 2-2-2zM20 4l-5 1-2 2 2 2 2-2z" fill="none"/>',
    cross: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="#2a9d6f"/>',
    bolt: '<path d="M13 2L4 14h6l-1 8 9-12h-6z" fill="#f6b82d"/>',
    heart: '<path d="M12 21C5 15 3 11 3 8a5 5 0 019-2.5A5 5 0 0121 8c0 3-2 7-9 13z" fill="#d2412b"/>',
    flame: '<path d="M12 2c1 4 6 6 6 12a6 6 0 01-12 0c0-3 2-4 3-6 1 2 2 2 2 1 0-3-1-5 1-7z" fill="#e8742a"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2" fill="#6b6b73"/><path d="M8 11V8a4 4 0 018 0v3" fill="none"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" fill="#f5ead2"/><circle cx="12" cy="12" r="3.2" fill="#14100f"/>',
    scroll: '<path d="M6 4h12a2 2 0 012 2v12a3 3 0 01-3 3H8a3 3 0 01-3-3V6a2 2 0 011-2z" fill="#f5ead2"/><path d="M9 9h7M9 13h7M9 17h4" fill="none"/>',
    home: '<path d="M3 11l9-8 9 8v10H3z" fill="#e9d3a3"/><path d="M10 21v-6h4v6" fill="#a8321f"/>',
    user: '<circle cx="12" cy="8" r="4.5" fill="#e8b583"/><path d="M4 21c0-5 4-7 8-7s8 2 8 7z" fill="#d2412b"/>',
    arena: '<path d="M3 20V10c0-4 4-6 9-6s9 2 9 6v10" fill="#e9d3a3"/><path d="M8 20v-5a4 4 0 018 0v5M3 11h18" fill="none"/>',
    bag: '<path d="M5 8h14l1 13H4z" fill="#8a5a2b"/><path d="M9 8V6a3 3 0 016 0v2" fill="none"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16" fill="none"/>',
    play: '<path d="M7 4l13 8-13 8z" fill="#f5ead2"/>',
    skip: '<path d="M5 4l10 8-10 8zM17 4v16" fill="#f5ead2"/>',
    hammer: '<path d="M14 4l6 6-3 3-6-6zM12 11L4 19l1 1 8-8" fill="#cfc4ad"/>',
    plus: '<path d="M12 5v14M5 12h14" fill="none"/>',
    check: '<path d="M4 12l5 5 11-11" fill="none"/>',
    close: '<path d="M5 5l14 14M19 5L5 19" fill="none"/>',
    up: '<path d="M12 19V6M6 11l6-6 6 6" fill="none"/>',
    down: '<path d="M12 5v13M6 13l6 6 6-6" fill="none"/>',
    moon: '<path d="M20 14a8 8 0 11-9-11 6 6 0 009 11z" fill="#f5ead2"/>',
    sound: '<path d="M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 010 6" fill="#f5ead2"/>',
    laurel: '<path d="M12 21C6 18 4 12 5 6c3 1 5 4 5 8M12 21c6-3 8-9 7-15-3 1-5 4-5 8" fill="#2a9d6f"/>',
  };
  A.icon = (name, size, extra) => `<svg class="ic" viewBox="0 0 24 24" width="${size || 20}" height="${size || 20}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" ${extra || ''}>${IC[name] || ''}</svg>`;

  const GLYPH = {
    murmillo: '<path d="M12 3L20 6V12C20 17 16 20 12 22C8 20 4 17 4 12V6Z"/>',
    retiarius: '<path d="M12 21V6M7 4V9C7 11 9 12 12 12C15 12 17 11 17 9V4M12 3V12"/>',
    thraex: '<path d="M5 20L10 15M10 15C15 14 19 9 19 4C14 5 9 9 10 15Z"/>',
    hoplomachus: '<path d="M5 20L16 9M16 9L14 4L20 6Z"/>',
    dimachaerus: '<path d="M5 19L17 7M19 19L7 7M15 5l4 0 0 4M5 5l4 0 0 4"/>',
  };
  A.styleIcon = (id, size) => {
    const S = D.STYLES[id]; size = size || 22;
    return `<span class="sbadge" style="background:${S.c};width:${size}px;height:${size}px" title="${S.n} (${S.role})"><svg viewBox="0 0 24 24" width="${size * 0.72}" height="${size * 0.72}" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">${GLYPH[id]}</svg></span>`;
  };

  // ---------- gladiators ----------
  const rc = (it) => (it ? D.RAR[it.rar].c : IRON);
  const limb = (d, skin, w) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w + 5}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${skin}" stroke-width="${w}" stroke-linecap="round"/>`;
  const STEEL = '#d7dde3';

  function weapon(style, g) {
    const wc = g.weapon ? D.RAR[g.weapon.rar].c : STEEL; const wood = '#8a5a2b';
    if (style === 'murmillo') return `<g class="gl-arm"><rect x="95" y="26" width="8" height="48" rx="2" fill="${wc}" ${sw}/><path d="M95 28 L99 14 L103 28Z" fill="${wc}" ${sw}/><rect x="90" y="70" width="18" height="6" rx="2" fill="#f6b82d" ${sw}/><rect x="96" y="76" width="6" height="12" rx="2" fill="${wood}" ${sw}/></g>`;
    if (style === 'thraex') return `<g class="gl-arm"><path d="M96 82 C124 64 122 28 98 14 C108 34 102 56 90 70Z" fill="${wc}" ${sw}/><rect x="88" y="74" width="16" height="6" rx="2" fill="#f6b82d" ${sw}/><rect x="93" y="80" width="6" height="12" rx="2" fill="${wood}" ${sw}/></g>`;
    if (style === 'hoplomachus') return `<g class="gl-arm"><rect x="97" y="12" width="5" height="124" rx="2" fill="${wood}" ${sw}/><path d="M99.5 -6 L108 16 L99.5 12 L91 16Z" fill="${wc}" ${sw}/></g>`;
    if (style === 'retiarius') return `<g class="gl-arm"><rect x="97" y="22" width="5" height="116" rx="2" fill="${wood}" ${sw}/><path d="M89 2 V20 H110 V2 M99.5 -2 V20" fill="none" ${sw}/><path d="M89 2l-3 -4M110 2l3 -4M99.5 -2l0 -5" fill="none" ${sw}/></g>`;
    return `<g class="gl-arm"><rect x="95" y="30" width="7" height="44" rx="2" fill="${wc}" ${sw}/><path d="M95 32 L98.5 18 L102 32Z" fill="${wc}" ${sw}/><rect x="90" y="70" width="17" height="6" rx="2" fill="#f6b82d" ${sw}/><rect x="95" y="76" width="6" height="10" rx="2" fill="${wood}" ${sw}/></g>`;
  }
  function offhand(style, g, tunic) {
    const sc = g.shield ? D.RAR[g.shield.rar].c : IRON;
    if (style === 'murmillo') return `<g class="gl-off"><rect x="6" y="54" width="36" height="66" rx="10" fill="${sc}" ${sw}/><rect x="12" y="60" width="24" height="54" rx="6" fill="${tunic}" ${sw}/><circle cx="24" cy="87" r="7" fill="#f6b82d" ${sw}/></g>`;
    if (style === 'thraex') return `<g class="gl-off"><rect x="12" y="68" width="30" height="32" rx="5" fill="${sc}" ${sw}/><path d="M12 84h30M27 68v32" fill="none" ${sw}/></g>`;
    if (style === 'hoplomachus') return `<g class="gl-off"><circle cx="26" cy="90" r="24" fill="${sc}" ${sw}/><circle cx="26" cy="90" r="13" fill="${tunic}" ${sw}/><circle cx="26" cy="90" r="4" fill="#f6b82d" ${sw}/></g>`;
    if (style === 'retiarius') return `<g class="gl-off"><circle cx="24" cy="100" r="21" fill="rgba(245,234,210,.25)" stroke="${INK}" stroke-width="3" stroke-dasharray="5 3"/><path d="M8 88l32 24M8 112l32-24M24 80v40M4 100h40" fill="none" stroke="${INK}" stroke-width="2"/></g>`;
    const wc = g.weapon ? D.RAR[g.weapon.rar].c : STEEL; // dimachaerus: second blade
    return `<g class="gl-off"><rect x="22" y="62" width="7" height="46" rx="2" fill="${wc}" transform="rotate(-18 26 90)" ${sw}/><rect x="14" y="94" width="16" height="6" rx="2" fill="#f6b82d" transform="rotate(-18 26 90)" ${sw}/></g>`;
  }
  function head(style, o) {
    const hc = o.gear.helm ? D.RAR[o.gear.helm.rar].c : IRON; const pl = o.plume; const hair = o.hair;
    const eyes = (y) => `<circle cx="54" cy="${y}" r="2.8" fill="${INK}"/><circle cx="68" cy="${y}" r="2.8" fill="${INK}"/>`;
    const brows = (y) => (o.mood === 'fight' ? `<path d="M49 ${y - 5}l9 3M73 ${y - 5}l-9 3" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>` : `<path d="M49 ${y - 5}l9 -1M73 ${y - 5}l-9 -1" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`);
    const mouth = o.mood === 'fight' ? `<path d="M55 49q6 -4 12 0" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>` : `<path d="M56 48q5 3 10 0" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`;
    const face = `<circle cx="61" cy="38" r="19" fill="${o.skin}" ${sw}/>`;
    if (style === 'murmillo') return `<path d="M58 22 Q62 -4 86 4 Q74 10 70 22Z" fill="${pl}" ${sw}/>` + face + mouth + `<path d="M41 36 Q41 14 61 14 Q81 14 81 36 L81 40 L41 40Z" fill="${hc}" ${sw}/><rect x="45" y="32" width="32" height="10" rx="3" fill="${INK}"/><path d="M52 37h6M64 37h6" stroke="#f5ead2" stroke-width="3" stroke-linecap="round"/>`;
    if (style === 'thraex') return `<path d="M50 20 Q56 -6 84 2 Q70 6 72 22Z" fill="${pl}" ${sw}/>` + face + eyes(40) + brows(40) + mouth + `<path d="M43 30 Q43 12 61 12 Q79 12 79 30Z" fill="${hc}" ${sw}/><ellipse cx="61" cy="30" rx="26" ry="5" fill="${hc}" ${sw}/><path d="M46 36 Q61 44 76 36 L76 41 Q61 48 46 41Z" fill="${hc}" ${sw}/>`;
    if (style === 'hoplomachus') return `<ellipse cx="62" cy="10" rx="10" ry="16" fill="${pl}" ${sw}/>` + face + eyes(38) + brows(38) + `<path d="M41 36 Q41 15 61 15 Q81 15 81 36 L76 36 L76 56 L69 56 L69 44 L53 44 L53 56 L46 56 L46 36Z" fill="${hc}" ${sw}/><rect x="56" y="30" width="10" height="20" rx="3" fill="${hc}" ${sw}/><path d="M50 36 L56 40M72 36 L66 40" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
    if (style === 'retiarius') return face + `<path d="M42 32 Q44 14 61 14 Q78 14 80 32 Q70 22 61 24 Q52 22 42 32Z" fill="${hair}" ${sw}/><path d="M42 31 Q61 23 80 31" fill="none" stroke="${pl}" stroke-width="6" stroke-linecap="round"/>` + eyes(39) + brows(39) + mouth;
    return face + `<path d="M42 33 Q42 14 61 14 Q80 14 80 33 Q70 24 61 26 Q52 24 42 33Z" fill="${hair}" ${sw}/><path d="M42 30 Q61 22 80 30 L82 38 Q61 28 40 38Z" fill="${o.tunic}" ${sw}/><path d="M78 30 l12 10 -2 -12" fill="${o.tunic}" ${sw}/>` + eyes(40) + brows(40) + mouth;
  }
  function bodyExtra(style, o) {
    const ac = o.gear.armor ? D.RAR[o.gear.armor.rar].c : IRON; const has = !!o.gear.armor;
    if (style === 'hoplomachus') return `<path d="M43 58 Q61 52 79 58 L81 94 L41 94Z" fill="${has ? ac : '#b8892a'}" ${sw}/><path d="M61 60V92M50 70h22M50 80h22" fill="none" stroke="${INK}" stroke-width="2.4"/>`;
    if (style === 'murmillo') return `<path d="M43 58 Q61 53 79 58 L80 70 Q61 76 42 70Z" fill="${has ? ac : '#b9b2a3'}" ${sw}/><path d="M50 62v10M61 61v12M72 62v10" stroke="${INK}" stroke-width="2.2"/>`;
    if (style === 'thraex') return `<path d="M44 58 L78 94 M78 58 L44 94" fill="none" stroke="${has ? ac : '#6b4a2b'}" stroke-width="7" stroke-linecap="round"/><path d="M44 58 L78 94 M78 58 L44 94" fill="none" stroke="${INK}" stroke-width="1.6" opacity=".5"/>`;
    if (style === 'retiarius') return `<path d="M40 56 Q62 44 84 54 L88 74 Q62 62 40 78Z" fill="${has ? ac : IRON}" ${sw}/><path d="M52 52 L50 70M64 50 L62 68" stroke="${INK}" stroke-width="2.2" fill="none"/>`;
    return `<path d="M44 60 L78 92 M78 60 L44 92" fill="none" stroke="${has ? ac : '#6b4a2b'}" stroke-width="6" stroke-linecap="round"/><circle cx="61" cy="76" r="5" fill="#f6b82d" ${sw}/>`;
  }
  // o: {style, skin, hair, plume, tunic, gear, mood: idle|fight, flip, size, cls}
  A.glad = (o) => {
    const style = o.style; const gear = o.gear || {}; const tunic = o.tunic || '#d2412b'; const skin = o.skin || '#e8b583';
    const oo = { skin, hair: o.hair || '#4a2c17', plume: o.plume || '#d2412b', tunic, gear, mood: o.mood || 'idle' };
    const gg = { weapon: gear.weapon, shield: gear.shield };
    const greave = (x) => (style === 'murmillo' || style === 'hoplomachus' ? `<rect x="${x}" y="138" width="13" height="16" rx="4" fill="${gear.armor ? D.RAR[gear.armor.rar].c : IRON}" ${sw}/>` : '');
    const size = o.size || 120; const h = Math.round(size * 1.42);
    const svg = `<svg class="gl ${o.cls || ''}" viewBox="-8 -12 136 182" width="${size}" height="${h}" style="${o.flip ? 'transform:scaleX(-1)' : ''}">
<ellipse cx="62" cy="161" rx="34" ry="6" fill="rgba(0,0,0,.32)"/>
<g class="gl-body">
<rect x="46" y="116" width="13" height="40" rx="5" fill="${skin}" ${sw}/><rect x="64" y="116" width="13" height="40" rx="5" fill="${skin}" ${sw}/>${greave(46)}${greave(64)}
<ellipse cx="52" cy="157" rx="11" ry="5" fill="#6b4a2b" ${sw}/><ellipse cx="71" cy="157" rx="11" ry="5" fill="#6b4a2b" ${sw}/>
<path d="M39 96 L84 96 L90 128 L33 128Z" fill="${tunic}" ${sw}/><path d="M50 100 L47 126M61 100V126M73 100L76 126" stroke="${INK}" stroke-width="2" opacity=".45"/>
<path d="M42 62 Q42 55 50 55 L72 55 Q80 55 80 62 L82 98 L40 98Z" fill="${skin}" ${sw}/>
${bodyExtra(style, oo)}
<rect x="38" y="92" width="46" height="9" rx="3" fill="#f6b82d" ${sw}/><rect x="55" y="93" width="12" height="7" rx="2" fill="${INK}"/>
${limb('M46 64 L32 94', skin, 11)}
${offhand(style, gg, tunic)}
${limb('M77 64 Q94 62 98 76', skin, 11)}
${weapon(style, gg)}
<circle cx="98" cy="77" r="6.5" fill="${skin}" ${sw}/>
${head(style, oo)}
</g></svg>`;
    return svg;
  };
  A.gladOf = (g, o) => {
    o = o || {};
    return A.glad(Object.assign({ style: g.style, skin: g.skin, hair: g.hair, plume: g.plume, gear: g.gear, tunic: o.tunic || g.color || '#d2412b' }, o));
  };

  // ---------- items ----------
  A.itemIcon = (slot, rar, size) => {
    const c = D.RAR[rar].c; size = size || 36;
    const P = {
      weapon: `<path d="M8 32L28 8l4 2-2 4L12 36z" fill="${c}"/><path d="M6 30l6 6M4 36l4-4" stroke="${INK}"/>`,
      shield: `<path d="M20 4l14 5v10c0 9-6 14-14 17C12 33 6 28 6 19V9z" fill="${c}"/><path d="M20 9v22M11 17h18" fill="none"/>`,
      armor: `<path d="M10 6l6 4h8l6-4 6 6-5 5v17H9V17l-5-5z" fill="${c}"/><path d="M16 10v24M24 10v24" fill="none"/>`,
      helm: `<path d="M6 24C6 12 12 6 20 6s14 6 14 18v6H6z" fill="${c}"/><path d="M10 24h20v6M20 6V2" fill="none"/>`,
      charm: `<circle cx="20" cy="24" r="10" fill="${c}"/><circle cx="20" cy="24" r="4" fill="${INK}"/><path d="M14 14C14 8 26 8 26 14" fill="none"/>`,
    };
    return `<svg class="ic" viewBox="0 0 40 40" width="${size}" height="${size}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">${P[slot]}</svg>`;
  };

  // ---------- buildings (100x80) ----------
  const W = '#e9d3a3', R = '#a8321f', ST = '#cfc4ad', WD = '#8a5a2b', GD = '#f6b82d', WT = '#4aa3f0', LF = '#2a9d6f';
  const B = {
    barracks: `<rect x="8" y="32" width="84" height="40" fill="${W}"/><path d="M3 34L50 8l47 26z" fill="${R}"/><rect x="16" y="42" width="12" height="12" fill="${INK}"/><rect x="72" y="42" width="12" height="12" fill="${INK}"/><path d="M42 72V54a8 8 0 0116 0v18z" fill="${WD}"/><circle cx="50" cy="26" r="4" fill="${GD}"/>`,
    palaestra: `<ellipse cx="50" cy="50" rx="43" ry="24" fill="#e6c27d"/><ellipse cx="50" cy="50" rx="30" ry="15" fill="none" stroke="${INK}" stroke-dasharray="4 4"/><rect x="47" y="24" width="6" height="34" fill="${WD}"/><rect x="38" y="30" width="24" height="6" rx="2" fill="${WD}"/><circle cx="50" cy="20" r="7" fill="#d9b46a"/><rect x="8" y="34" width="6" height="20" fill="${ST}"/><rect x="86" y="34" width="6" height="20" fill="${ST}"/>`,
    sparring: `<rect x="12" y="24" width="76" height="46" rx="4" fill="#d9b46a"/><rect x="12" y="24" width="76" height="46" rx="4" fill="none"/><path d="M12 36h76M12 48h76" stroke="${R}" stroke-width="3"/><rect x="8" y="18" width="7" height="30" fill="${WD}"/><rect x="85" y="18" width="7" height="30" fill="${WD}"/><rect x="8" y="46" width="7" height="30" fill="${WD}"/><rect x="85" y="46" width="7" height="30" fill="${WD}"/>`,
    kitchen: `<rect x="14" y="34" width="56" height="38" fill="${W}"/><path d="M8 36L42 12l34 24z" fill="#b8892a"/><rect x="58" y="10" width="10" height="20" fill="${ST}"/><circle cx="64" cy="6" r="4" fill="#fff" opacity=".7"/><path d="M30 72V52h16v20z" fill="${WD}"/><ellipse cx="82" cy="62" rx="12" ry="8" fill="#3d3b46"/><ellipse cx="82" cy="58" rx="10" ry="4" fill="#d9b46a"/><path d="M80 52c-4-6 2-8 4-4" fill="${LF}"/>`,
    bath: `<rect x="8" y="30" width="84" height="40" rx="4" fill="${ST}"/><rect x="14" y="38" width="72" height="26" rx="4" fill="${WT}"/><path d="M22 48q6-4 12 0t12 0 12 0 12 0M22 56q6-4 12 0t12 0 12 0" fill="none" stroke="#fff" stroke-width="2.4"/><rect x="8" y="14" width="8" height="20" fill="${W}"/><rect x="84" y="14" width="8" height="20" fill="${W}"/><path d="M40 24c-3-5 3-6 0-12M56 24c-3-5 3-6 0-12" fill="none" stroke="#fff" stroke-width="2.4" opacity=".8"/>`,
    infirmary: `<rect x="10" y="30" width="80" height="42" fill="#f5ead2"/><path d="M5 32L50 8l45 24z" fill="#1f8a78"/><path d="M44 38h12v8h8v10h-8v8H44v-8h-8V46h8z" fill="${LF}"/><rect x="16" y="50" width="12" height="22" fill="${WD}"/>`,
    forge: `<rect x="10" y="30" width="80" height="42" fill="#4a4650"/><path d="M6 32L50 12l44 20z" fill="#2c2a31"/><rect x="68" y="6" width="12" height="22" fill="#3d3b46"/><path d="M26 72V50a10 10 0 0120 0v22z" fill="#e8742a"/><path d="M30 72V56a6 6 0 0112 0v16z" fill="${GD}"/><path d="M58 62h24v6H58zM62 56h16v6H62z" fill="#8f8a80"/>`,
    scout: `<rect x="34" y="14" width="32" height="58" fill="${ST}"/><path d="M30 14h8v-6h8v6h8v-6h8v6h8l-2 6H32z" fill="${ST}"/><circle cx="50" cy="38" r="9" fill="#f5ead2"/><circle cx="50" cy="38" r="4" fill="${INK}"/><path d="M50 8V-4l16 6-16 6" fill="${R}"/><rect x="42" y="54" width="16" height="18" fill="${WD}"/>`,
    shrine: `<path d="M8 32L50 8l42 24z" fill="${W}"/><rect x="12" y="34" width="76" height="6" fill="${ST}"/><rect x="16" y="40" width="9" height="30" fill="${W}"/><rect x="36" y="40" width="9" height="30" fill="${W}"/><rect x="55" y="40" width="9" height="30" fill="${W}"/><rect x="75" y="40" width="9" height="30" fill="${W}"/><rect x="10" y="70" width="80" height="6" fill="${ST}"/><path d="M50 30c-5-6 0-10 0-16 6 6 5 11 0 16z" fill="#e8742a"/>`,
    market: `<rect x="12" y="38" width="76" height="34" fill="${WD}"/><path d="M6 40L14 14h72l8 26z" fill="${R}"/><path d="M26 14l-4 26M44 14l-2 26M62 14l2 26M80 14l4 26" stroke="#f5ead2" stroke-width="7"/><circle cx="28" cy="52" r="7" fill="#e0432b"/><circle cx="44" cy="54" r="7" fill="${GD}"/><circle cx="60" cy="52" r="7" fill="${LF}"/><rect x="70" y="48" width="14" height="14" fill="#c98a52"/>`,
    stands: `<path d="M4 70V40C4 24 24 14 50 14s46 10 46 26v30z" fill="${W}"/><path d="M14 70V44C14 34 30 26 50 26s36 8 36 18v26z" fill="#c98a52"/><path d="M26 70V48c0-8 11-14 24-14s24 6 24 14v22z" fill="${R}"/><path d="M50 34V70" stroke="${INK}"/><path d="M8 14V2l14 5-14 5" fill="${GD}"/><path d="M92 14V2L78 7l14 5" fill="${GD}"/>`,
    hall: `<rect x="14" y="62" width="72" height="12" fill="${ST}"/><rect x="26" y="50" width="48" height="12" fill="${W}"/><circle cx="50" cy="20" r="8" fill="${GD}"/><path d="M38 50V30c0-6 24-6 24 0v20z" fill="${GD}"/><path d="M30 50V36l8 4M70 50V36l-8 4" fill="${GD}"/><path d="M22 48c-8-6-8-16-4-22M78 48c8-6 8-16 4-22" fill="none" stroke="${LF}" stroke-width="5"/>`,
  };
  A.building = (id, size) => `<svg class="bld" viewBox="-2 -8 104 90" width="${size || 90}" height="${(size || 90) * 0.86}" stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${B[id] || ''}</svg>`;

  // ---------- arena backdrop ----------
  A.arenaBG = () => {
    let crowd = ''; const cols = ['#d2412b', '#f6b82d', '#2f78c4', '#2a9d6f', '#7b4fb8', '#f5ead2', '#e8742a'];
    let s = 7; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let row = 0; row < 5; row++) for (let i = 0; i < 22; i++) {
      const x = 8 + i * 18 + (row % 2) * 9 + r() * 4; const y = 40 + row * 17 + r() * 3;
      crowd += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(5 + r() * 1.5).toFixed(1)}" fill="${cols[Math.floor(r() * cols.length)]}"/><rect x="${(x - 5).toFixed(1)}" y="${(y + 4).toFixed(1)}" width="10" height="8" fill="${cols[Math.floor(r() * cols.length)]}"/>`;
    }
    return `<svg class="arena-bg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice"><rect width="400" height="300" fill="#3a1d14"/><circle cx="330" cy="26" r="20" fill="#f6b82d" stroke="#14100f" stroke-width="3"/><g stroke="#14100f" stroke-width="1.5" opacity=".95">${crowd}</g><rect y="130" width="400" height="14" fill="#a8321f" stroke="#14100f" stroke-width="3"/><path d="M0 130h400" stroke="#f6b82d" stroke-width="3"/><rect y="144" width="400" height="160" fill="#e6c27d"/><ellipse cx="200" cy="232" rx="190" ry="60" fill="#d9b46a" stroke="#14100f" stroke-width="3" stroke-dasharray="8 6"/></svg>`;
  };


  // ---------- ultimate icons ----------
  const UG = {
    pulverize: '<path d="M12 3l2 6 6-2-4 5 5 4-6 0-1 6-2-5-5 3 2-6-5-3 6-1z"/>',
    hookshot: '<path d="M12 3v10a4 4 0 11-4-4M12 3l-2 2M12 3l2 2"/>',
    bladedance: '<path d="M4 20L20 4M14 4h6v6M4 12l4 4M8 20l-4-4"/>',
    skewer: '<path d="M3 21L19 5M19 5l-1 6M19 5l-6 1"/>',
    tornado: '<path d="M5 6h14M7 10h10M9 14h6M11 18h2"/>',
    unbreakable: '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6zM9 12l2 2 4-4"/>',
    bloodrage: '<path d="M12 2c1 4 6 6 6 12a6 6 0 01-12 0c0-3 2-4 3-6 1 2 2 2 2 1 0-3-1-5 1-7z"/>',
    meteor: '<path d="M17 4a5 5 0 11-7 7zM3 21l8-8"/>',
    duststorm: '<path d="M7 17a4 4 0 010-8 5 5 0 019-1 4 4 0 01-1 9zM8 20h8"/>',
  };
  A.ultIcon = (id, size) => `<svg viewBox="0 0 24 24" width="${size || 30}" height="${size || 30}" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">${UG[id] || ''}</svg>`;

  // ---------- arena backdrop sized to the stage (top of the stage is the crowd, below is the sand) ----------
  const THEMES = [
    { wall: '#6b4a2b', trim: '#c98a52', sand: '#d8b574', ring: '#b08a4a', sky: '#2a1a12', crowd: ['#8a5a2b', '#c98a52', '#6b4a2b', '#d2412b', '#e6c27d', '#3f7fd6'], rows: 3, deco: 'fence' },
    { wall: '#a8321f', trim: '#f6b82d', sand: '#e6c27d', ring: '#b8893a', sky: '#3a1d14', crowd: ['#d2412b', '#f6b82d', '#2f78c4', '#2a9d6f', '#7b4fb8', '#f5ead2', '#e8742a'], rows: 4, deco: 'banners' },
    { wall: '#cfc4ad', trim: '#8f8670', sand: '#dcb872', ring: '#b8893a', sky: '#2c1c18', crowd: ['#d2412b', '#f6b82d', '#2f78c4', '#2a9d6f', '#7b4fb8', '#f5ead2', '#e8742a'], rows: 5, deco: 'arches' },
    { wall: '#6a3fa8', trim: '#f6b82d', sand: '#ecd397', ring: '#c8a24a', sky: '#1d1030', crowd: ['#f6b82d', '#f5ead2', '#7b4fb8', '#d2412b', '#ffd34d', '#2f78c4'], rows: 5, deco: 'gold' },
  ];
  A.arenaBG2 = (w, h, theme, season) => {
    const T = THEMES[Math.max(0, Math.min(3, theme || 0))]; const cols = T.crowd;
    let s = 11 + (theme || 0) * 7; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const wallY = h * 0.27; let crowd = '';
    for (let row = 0; row < T.rows; row++) { const y = wallY - 12 - row * (wallY / (T.rows + 1.2)); const n = Math.ceil(w / 17); for (let i = 0; i <= n; i++) { const x = i * 17 + (row % 2) * 8 + r() * 3; const c1 = cols[Math.floor(r() * cols.length)], c2 = cols[Math.floor(r() * cols.length)]; crowd += `<g class="cw" style="animation-delay:${(r() * 1.2).toFixed(2)}s"><rect x="${(x - 5).toFixed(1)}" y="${(y + 4).toFixed(1)}" width="10" height="9" fill="${c2}"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(5 + r()).toFixed(1)}" fill="${c1}"/></g>`; } }
    const cx = w / 2, cy = (h * 0.27 + h * 0.97) / 2, rx = w * 0.46, ry = (h * 0.97 - h * 0.27) * 0.46;
    let dots = ''; for (let i = 0; i < 90; i++) dots += `<circle cx="${(r() * w).toFixed(0)}" cy="${(wallY + 14 + r() * (h - wallY)).toFixed(0)}" r="${(1 + r() * 1.6).toFixed(1)}" fill="${T.ring}" opacity=".55"/>`;
    let deco = '';
    if (T.deco === 'fence') for (let x = 6; x < w; x += 26) deco += `<rect x="${x}" y="${wallY - 10}" width="6" height="26" fill="#3b2615" stroke="#14100f" stroke-width="2"/>`;
    if (T.deco === 'banners' || T.deco === 'gold') for (let x = 30; x < w; x += 74) deco += `<path d="M${x} ${wallY} h18 v26 l-9 -7 l-9 7z" fill="${(x / 74) % 2 < 1 ? '#f6b82d' : T.deco === 'gold' ? '#d2412b' : '#2f78c4'}" stroke="#14100f" stroke-width="2"/>`;
    if (T.deco === 'arches') for (let x = 8; x < w; x += 44) deco += `<path d="M${x} ${wallY + 16} v-10 a11 11 0 0 1 22 0 v10z" fill="#3a1d14" stroke="#14100f" stroke-width="2"/>`;
    if (T.deco === 'gold') for (const x of [w * 0.06, w * 0.94]) deco += `<rect x="${x - 3}" y="${wallY - 8}" width="6" height="24" fill="#8a5a2b" stroke="#14100f" stroke-width="2"/><path d="M${x} ${wallY - 8} c-7 -8 0 -12 0 -20 c7 8 7 14 0 20z" fill="#ffb347" stroke="#14100f" stroke-width="2"/>`;
    return `<svg class="arena-bg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${T.sky}"/><circle cx="${w * 0.86}" cy="${h * 0.06}" r="${w * 0.05}" fill="#f6b82d" stroke="#14100f" stroke-width="3"/><g stroke="#14100f" stroke-width="1.5">${crowd}</g><rect y="${wallY}" width="${w}" height="16" fill="${T.wall}" stroke="#14100f" stroke-width="3"/><path d="M0 ${wallY + 3}h${w}" stroke="${T.trim}" stroke-width="3"/>${T.deco === 'gold' ? `<path d="M0 ${wallY + 10}h${w}" stroke="${T.trim}" stroke-width="2"/>` : ''}${deco}<rect y="${wallY + 16}" width="${w}" height="${h - wallY}" fill="${T.sand}"/>${dots}<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${T.sand}" stroke="#14100f" stroke-width="3" stroke-dasharray="10 7"/><ellipse cx="${cx}" cy="${cy}" rx="${rx * 0.55}" ry="${ry * 0.55}" fill="none" stroke="${T.ring}" stroke-width="3" stroke-dasharray="4 8"/><ellipse cx="${cx}" cy="${cy}" rx="${rx * 0.12}" ry="${ry * 0.12}" fill="#c98a52" stroke="#14100f" stroke-width="2"/>${(() => { const sn = season == null ? -1 : season % 4; if (sn < 0) return ''; const col = ['#f4a6c0', '#ffd34d', '#d2692b', '#ffffff'][sn]; let d = ''; for (let k = 0; k < 26; k++) d += `<circle cx="${(r() * w).toFixed(0)}" cy="${(wallY + 6 + r() * (h - wallY - 6)).toFixed(0)}" r="${(1.2 + r() * 1.6).toFixed(1)}" fill="${col}" opacity="${sn === 1 ? 0.35 : 0.8}"/>`; if (sn === 1) d += `<rect width="${w}" height="${h}" fill="#ffb347" opacity=".08"/>`; if (sn === 3) d += `<rect width="${w}" height="${h}" fill="#bfe3ff" opacity=".07"/>`; return d; })()}</svg>`;
  };

  G.LM_ART = A;
  if (typeof module !== 'undefined') module.exports = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
