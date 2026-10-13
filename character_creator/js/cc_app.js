// Character Studio app: the preview, the panels, undo, saving, sharing and exporting.
(function () {
  'use strict';
  const CC = window.CC;
  const { clamp, TAU } = CC.u;
  const $ = (id) => document.getElementById(id);
  const KEY_CUR = 'cc_current_v1', KEY_SLOTS = 'cc_slots_v1', KEY_UI = 'cc_ui_v1';

  function el(tag, attrs, kids) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) { const v = attrs[k]; if (v === false || v === null || v === undefined) continue; if (k === 'text') e.textContent = v; else if (k === 'class') e.className = v; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v); }
    (kids || []).forEach((c) => { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  let toastT = 0;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200); }

  // ---------------------------------------------------------------- state
  const ui = Object.assign({ tab: 'hair', bg: 'stage', pose: 'idle', expr: 'auto', play: true, zoom: 1 }, CC.store.get(KEY_UI) || {});
  let cfg = null;
  const hist = [], fut = [];
  let lastKey = '', lastT = 0;
  const S = { flip: false, portrait: false, pan: [0, 0], partner: null, t: 0, tFrozen: 1, partnerPose: 'idle' };

  function loadStart() {
    const m = /[#&]c=([^&]+)/.exec(location.hash || '');
    const fromUrl = m ? CC.decode(m[1]) : null;
    return fromUrl || (CC.store.get(KEY_CUR) && CC.clean(CC.store.get(KEY_CUR))) || CC.clean(CC.DEFAULT);
  }
  cfg = loadStart();

  const refreshers = [];
  function refreshAll() { refreshers.forEach((f) => f()); $('undo').disabled = !hist.length; $('redo').disabled = !fut.length; }
  let saveT = 0, urlT = 0;
  function persist() {
    clearTimeout(saveT); saveT = setTimeout(() => CC.store.set(KEY_CUR, cfg), 250);
    clearTimeout(urlT); urlT = setTimeout(() => { try { const d = CC.encode(cfg); history.replaceState(null, '', location.pathname + location.search + (CC.diff(cfg) && Object.keys(CC.diff(cfg)).length ? '#c=' + d : '')); } catch (e) { /* a file:// page may refuse */ } }, 600);
  }
  // change one or more keys; coalesce a slider drag into one undo step
  function set(patch, o) {
    o = o || {};
    const next = CC.clean(Object.assign({}, cfg, patch));
    if (JSON.stringify(next) === JSON.stringify(cfg)) return;
    const k = Object.keys(patch).join(','), now = performance.now();
    if (!(k === lastKey && now - lastT < 700 && hist.length)) { hist.push(cfg); if (hist.length > 80) hist.shift(); }
    lastKey = k; lastT = now; fut.length = 0;
    changed(next, Object.keys(patch));
  }
  function changed(next, keys) { cfg = next; if ($('name').value !== cfg.name && document.activeElement !== $('name')) $('name').value = cfg.name; refreshAll(); queueThumbs(keys); persist(); }
  function undo() { if (!hist.length) return; fut.push(cfg); lastKey = ''; changed(hist.pop(), []); }
  function redo() { if (!fut.length) return; hist.push(cfg); lastKey = ''; changed(fut.pop(), []); }
  function replaceAll(c, note) { hist.push(cfg); fut.length = 0; lastKey = ''; changed(CC.clean(c), []); queueThumbs(null); if (note) toast(note); }

  // ---------------------------------------------------------------- thumbnails
  const KINDS = {
    head: { anchor: 'head', span: 150, dy: -2 }, headwide: { anchor: 'head', span: 205, dy: -14 }, face: { anchor: 'head', span: 104, dy: 3 },
    chest: { anchor: 'chest', span: 120, dy: 12 }, torso: { anchor: 'chest', span: 190, dy: 26 }, body: { anchor: 'chest', span: 370, dy: 62 },
    legs: { anchor: 'feet', span: 150, dy: -42, at: 0.6 }, feet: { anchor: 'feet', span: 84, dy: -10, at: 0.6 },
  };
  const thumbs = new Set();
  let queue = [], qOn = false;
  function drawThumb(t) {
    const cv = t.cv, g = cv.getContext('2d'), w = cv.width, h = cv.height;
    g.clearRect(0, 0, w, h);
    const c = t.key === '__preset' ? t.ov(t.id) : Object.assign({}, cfg, t.ov(t.id));
    CC.view(g, c, w, h, Object.assign({ pose: 'bust', t: 1 }, KINDS[t.kind]));
  }
  function queueThumbs(keys) {
    const list = [];
    thumbs.forEach((t) => { if (!t.cv.isConnected) { thumbs.delete(t); return; } if (keys && keys.length && keys.every((k) => k === t.key)) return; list.push(t); });
    queue = list;
    if (!qOn) { qOn = true; requestAnimationFrame(pump); }
  }
  function pump() {
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < 9) drawThumb(queue.shift());
    if (queue.length) requestAnimationFrame(pump); else qOn = false;
  }

  // ---------------------------------------------------------------- controls
  function colorBtn(color, label, cls) { return el('button', { type: 'button', class: cls || '', style: color ? 'background:' + color : false, title: label || color, 'aria-label': label || color, 'aria-pressed': 'false' }); }
  function swatches(key, palette, o) {
    o = o || {};
    const box = el('div', { class: 'sw', role: 'group', 'aria-label': o.label || key });
    const btns = [];
    if (o.auto) { const b = colorBtn(null, 'Automatic', 'auto'); b.onclick = () => set({ [key]: '' }); btns.push([b, '']); box.appendChild(b); }
    palette.forEach((p) => { const b = colorBtn(p, p); b.onclick = () => set({ [key]: p }); btns.push([b, p]); box.appendChild(b); });
    const inp = el('input', { type: 'color', 'aria-label': 'Custom colour' });
    inp.addEventListener('input', () => set({ [key]: inp.value }));
    box.appendChild(el('label', { class: 'custom', title: 'Pick any colour' }, ['+', inp]));
    refreshers.push(() => { const v = cfg[key]; btns.forEach(([b, p]) => b.setAttribute('aria-pressed', String(String(p).toLowerCase() === String(v).toLowerCase()))); if (v && /^#[0-9a-f]{6}$/i.test(v)) inp.value = v; });
    return box;
  }
  function slider(key, label, fmt) {
    const r = CC.RANGE[key], out = el('output', { for: 'cc_' + key }), inp = el('input', { type: 'range', id: 'cc_' + key, min: r[0], max: r[1], step: r[2], value: cfg[key] });
    inp.addEventListener('input', () => set({ [key]: parseFloat(inp.value) }));
    inp.addEventListener('dblclick', () => set({ [key]: r[3] }));
    refreshers.push(() => { if (document.activeElement !== inp) inp.value = cfg[key]; out.textContent = fmt ? fmt(cfg[key]) : (Math.abs(r[2]) >= 1 ? String(cfg[key]) : cfg[key].toFixed(2)); });
    return el('div', { class: 'row' }, [el('label', { for: 'cc_' + key, text: label, title: 'Double-click to reset' }), inp, out]);
  }
  function grid(key, o) {
    o = o || {};
    const box = el('div', { class: 'grid', role: 'group', 'aria-label': o.label || key }), cat = CC.catOf(key), btns = [];
    const ov = o.ov || ((id) => ({ [key]: id }));
    cat.forEach((opt) => {
      const b = el('button', { type: 'button', class: 'opt' + (o.text ? ' text' : ''), 'aria-pressed': 'false', title: opt.label });
      if (!o.text) { const cv = el('canvas', { width: 120, height: 112 }); b.appendChild(cv); thumbs.add({ cv, key, id: opt.id, kind: o.kind || 'head', ov }); }
      b.appendChild(el('span', { text: opt.label }));
      b.onclick = () => set(o.set ? o.set(opt.id) : { [key]: opt.id });
      btns.push([b, opt.id]); box.appendChild(b);
    });
    refreshers.push(() => btns.forEach(([b, id]) => b.setAttribute('aria-pressed', String(cfg[key] === id))));
    return box;
  }
  function chips(key, o) {
    o = o || {};
    const box = el('div', { class: 'chips', role: 'group', 'aria-label': o.label || key }), cat = CC.catOf(key).filter((x) => !o.only || o.only.indexOf(x.id) >= 0), btns = [];
    cat.forEach((opt) => { const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', text: opt.label }); b.onclick = () => set({ [key]: opt.id }); btns.push([b, opt.id]); box.appendChild(b); });
    refreshers.push(() => btns.forEach(([b, id]) => b.setAttribute('aria-pressed', String(cfg[key] === id))));
    return box;
  }
  function label(text) { return el('p', { class: 'note', text }); }
  function colorRow(key, palette, text, o) { return el('div', null, [el('p', { class: 'note', text }), swatches(key, palette, o)]); }
  function section(title, hint, kids, show) {
    const s = el('section', { class: 'sec' }, [el('h3', null, [title, hint ? el('small', { text: hint }) : null])].concat(kids));
    if (show) refreshers.push(() => s.classList.toggle('hide', !show(cfg)));
    return s;
  }

  // ---------------------------------------------------------------- the panels
  const CLOTH = CC.CLOTH;
  const TABS = [
    ['body', 'Body', () => [
      section('Skin tone', null, [swatches('skin', CC.SKIN, { label: 'Skin tone' })]),
      section('Head shape', null, [slider('headW', 'Head width'), slider('headH', 'Head height'), slider('chin', 'Chin')]),
      section('Ears', null, [grid('ear', { kind: 'face', label: 'Ears' }), slider('earSize', 'Ear size')]),
      section('Body', 'double-click a slider to reset', [slider('height', 'Height'), slider('build', 'Shoulders'), slider('torsoLen', 'Torso length'), slider('legLen', 'Leg length'), slider('legT', 'Leg width'), slider('armLen', 'Arm length')]),
    ]],
    ['hair', 'Hair', () => [
      section('Hairstyle', null, [grid('hair', { kind: 'headwide', ov: (id) => ({ hair: id, headwear: 'none' }), label: 'Hairstyle' })]),
      section('Hair colour', null, [swatches('hairColor', CC.HAIR, { label: 'Hair colour' })]),
      section('Colour effect', null, [chips('dye'), el('div', { style: 'height:8px' }), colorRow('hairColor2', CC.HAIR, 'Second colour')], null),
      section('Fringe line', 'plain cuts only', [chips('hairline')], (c) => ['bald', 'mohawk', 'curls', 'afro', 'crop', 'spiky', 'mullet', 'pixie', 'buzz'].indexOf(c.hair) < 0),
      section('Fullness', null, [slider('hairVol', 'Volume')], (c) => c.hair !== 'bald'),
      section('Hair tie', 'ponytails, buns, braids', [chips('hairAcc'), el('div', { style: 'height:8px' }), colorRow('hairAccC', CLOTH, 'Tie colour')], (c) => ['pony_high', 'pony_low', 'twin', 'buns', 'topknot', 'braids'].indexOf(c.hair) >= 0),
    ]],
    ['face', 'Face', () => [
      section('Eye shape', null, [grid('eyes', { kind: 'face', label: 'Eye shape' })]),
      section('Eye colour', null, [swatches('iris', CC.EYE, { label: 'Eye colour' })], (c) => c.eyes !== 'dot' && c.eyes !== 'happy'),
      section('Eye sparkle', null, [grid('sparkle', { kind: 'face', label: 'Eye sparkle' }), el('div', { style: 'height:8px' }), colorRow('sparkleC', CLOTH, 'Sparkle colour')], (c) => c.eyes !== 'dot' && c.eyes !== 'happy'),
      section('Eye fine-tuning', null, [slider('eyeSize', 'Size'), slider('eyeGap', 'Spacing'), slider('eyeY', 'Height'), slider('eyeTilt', 'Tilt'), slider('lashes', 'Lashes')]),
      section('Eyebrows', null, [grid('brow', { kind: 'face', label: 'Eyebrows' }), el('div', { style: 'height:8px' }), colorRow('browColor', CC.HAIR, 'Colour (automatic follows the hair)', { auto: true }), slider('browThick', 'Thickness'), slider('browY', 'Height'), slider('browTilt', 'Slant')], null),
    ]],
    ['details', 'Details', () => [
      section('Nose', null, [grid('nose', { kind: 'face', label: 'Nose' }), slider('noseY', 'Height')]),
      section('Mouth', 'the resting smile', [grid('mouth', { kind: 'face', label: 'Mouth' }), slider('mouthW', 'Width'), slider('mouthY', 'Height'), colorRow('lip', CC.LIP, 'Lip colour', { auto: true })]),
      section('Cheeks', null, [slider('blush', 'Blush'), colorRow('blushC', CC.BLUSH, 'Blush colour')]),
      section('Freckles', null, [chips('freckles')]),
      section('Face paint & marks', null, [grid('mark', { kind: 'face', label: 'Face paint' }), el('div', { style: 'height:8px' }), colorRow('markC', CLOTH, 'Paint colour')], null),
      section('Facial hair', null, [grid('facial', { kind: 'face', label: 'Facial hair' }), el('div', { style: 'height:8px' }), colorRow('facialC', CC.HAIR, 'Colour (automatic follows the hair)', { auto: true })]),
      section('Glasses', null, [grid('glasses', { kind: 'face', label: 'Glasses' }), el('div', { style: 'height:8px' }), colorRow('glC1', CLOTH, 'Frame colour'), colorRow('glC2', CLOTH, 'Lens colour')], null),
    ]],
    ['outfit', 'Outfit', () => [
      section('Outfit style', null, [grid('onepiece', { kind: 'body', label: 'Outfit style' })]),
      section('Animal', 'plush onesie', [grid('animal', { kind: 'headwide', ov: (id) => ({ animal: id, onepiece: 'onesie', headwear: 'hood' }), label: 'Animal' }), el('div', { style: 'height:8px' }), colorRow('opC1', CLOTH, 'Plush colour'), colorRow('opC2', CLOTH, 'Belly and trim colour'), label('The hood is under Extras, Headwear.')], (c) => c.onepiece === 'onesie'),
      section('One-piece colours', null, [colorRow('opC1', CLOTH, 'Main colour'), colorRow('opC2', CLOTH, 'Trim colour')], (c) => ['dress', 'sundress', 'jumpsuit', 'overalls'].indexOf(c.onepiece) >= 0),
      section('Top', null, [grid('top', { kind: 'torso', ov: (id) => ({ top: id, onepiece: 'none' }), label: 'Top' }), el('div', { style: 'height:8px' }), colorRow('topC1', CLOTH, 'Main colour'), colorRow('topC2', CLOTH, 'Second colour (trim, sleeves, print)')], (c) => c.onepiece === 'none'),
      section('Print', 'tops, dresses and dungarees', [chips('topPattern', { label: 'Print' })], (c) => c.onepiece !== 'onesie'),
      section('Sleeves', null, [chips('sleeve')], (c) => c.onepiece === 'none'),
      section('Bottoms', null, [grid('bottom', { kind: 'legs', ov: (id) => ({ bottom: id, onepiece: 'none' }), label: 'Bottoms' }), el('div', { style: 'height:8px' }), colorRow('botC1', CLOTH, 'Main colour'), colorRow('botC2', CLOTH, 'Second colour (trim, stripes)'), chips('botPattern', { only: ['none', 'vstripe', 'stripes', 'polka', 'checks', 'stars', 'hearts', 'sakura'], label: 'Print' })], (c) => c.onepiece === 'none'),
    ]],
    ['shoes', 'Shoes', () => [
      section('Shoes', null, [grid('shoe', { kind: 'feet', label: 'Shoes' }), el('div', { style: 'height:8px' }), colorRow('shoeC1', CLOTH, 'Main colour'), colorRow('shoeC2', CLOTH, 'Second colour (toe, sole, laces)')]),
      section('Socks', 'bare legs only: skirts, shorts, dresses', [chips('sock'), el('div', { style: 'height:8px' }), colorRow('sockC', CLOTH, 'Sock colour')]),
    ]],
    ['extras', 'Extras', () => [
      section('Headwear', null, [grid('headwear', { kind: 'headwide', label: 'Headwear' }), el('div', { style: 'height:8px' }), colorRow('hwC1', CLOTH, 'Main colour'), colorRow('hwC2', CLOTH, 'Second colour'), label('Animal hood uses the animal chosen under Outfit.')], null),
      section('Earrings', null, [grid('earring', { kind: 'face', label: 'Earrings' }), el('div', { style: 'height:8px' }), colorRow('earC', CC.METAL.concat(CLOTH.slice(0, 6)), 'Colour')]),
      section('Neck', null, [grid('neck', { kind: 'chest', label: 'Neckwear' }), el('div', { style: 'height:8px' }), colorRow('neckC', CLOTH, 'Colour')]),
      section('Wrists', null, [chips('wrist'), el('div', { style: 'height:8px' }), colorRow('wristC', CLOTH, 'Colour')]),
      section('Gloves', null, [chips('gloves'), el('div', { style: 'height:8px' }), colorRow('gloveC', CLOTH, 'Colour')]),
      section('Back', 'wings, cape, tails', [grid('back', { kind: 'body', label: 'Back item' }), el('div', { style: 'height:8px' }), colorRow('backC', CLOTH, 'Colour')]),
      section('In hand', null, [chips('mic'), el('div', { style: 'height:8px' }), colorRow('micC', CLOTH, 'Mic band colour'), slider('micLen', 'Mic length')]),
    ]],
    ['save', 'Save', () => saveTab()],
  ];

  function presetsSection() {
    const box = el('div', { class: 'grid', role: 'group', 'aria-label': 'Start from' });
    CC.PRESETS.forEach((p) => {
      const b = el('button', { type: 'button', class: 'opt', title: p.name });
      const cv = el('canvas', { width: 120, height: 112 }); b.appendChild(cv); b.appendChild(el('span', { text: p.name }));
      thumbs.add({ cv, key: '__preset', id: p.id, kind: 'body', ov: () => p.c, noRefresh: true });
      b.onclick = () => replaceAll(p.c, p.name + ' loaded');
      box.appendChild(b);
    });
    return box;
  }
  function slotsList() { return CC.store.get(KEY_SLOTS) || []; }
  function saveSlots(list) { return CC.store.set(KEY_SLOTS, list); }
  function renderSlots(host) {
    host.innerHTML = '';
    const list = slotsList();
    if (!list.length) { host.appendChild(el('p', { class: 'note', text: 'Nothing saved yet. Press "Save this character" to keep it in this browser.' })); return; }
    list.forEach((s, i) => {
      const card = el('div', { class: 'slot' }, [s.img ? el('img', { src: s.img, alt: s.name }) : el('canvas'), el('b', { text: s.name }),
        el('div', { class: 'acts' }, [
          el('button', { type: 'button', class: 'btn small green', text: 'Load', onclick: () => replaceAll(s.c, s.name + ' loaded') }),
          el('button', { type: 'button', class: 'btn small', text: S.partner && S.partner.id === 's' + s.id ? 'Partner on' : 'Duo', onclick: () => { setPartner(S.partner && S.partner.id === 's' + s.id ? null : { id: 's' + s.id, c: CC.clean(s.c) }); renderSlots(host); } }),
          el('button', { type: 'button', class: 'btn small ghost', text: 'Delete', onclick: () => { saveSlots(slotsList().filter((x) => x.id !== s.id)); renderSlots(host); } })])]);
      host.appendChild(card);
    });
  }
  function setPartner(p) { S.partner = p; toast(p ? 'Duo on. Mirrored partner added to the stage.' : 'Partner removed'); }

  function saveTab() {
    const slotsHost = el('div', { class: 'slots' });
    renderSlots(slotsHost);
    const linkBox = el('input', { type: 'text', readonly: true, 'aria-label': 'Share link', style: 'width:100%;background:var(--indigo);border:2px solid var(--violet);border-radius:12px;padding:8px 10px;color:var(--cream);font-size:12px' });
    linkBox.addEventListener('focus', () => linkBox.select());
    const scale = { v: 2 };
    const scaleChips = el('div', { class: 'chips' });
    [1, 2, 4].forEach((k) => { const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': String(k === 2), text: k + 'x' }); b.onclick = () => { scale.v = k; [...scaleChips.children].forEach((c) => c.setAttribute('aria-pressed', String(c === b))); }; scaleChips.appendChild(b); });
    const shadow = el('input', { type: 'checkbox', id: 'cc_shadow' });
    const fileIn = el('input', { type: 'file', accept: '.json,application/json', class: 'sr', 'aria-label': 'Open a character file' });
    fileIn.addEventListener('change', () => {
      const f = fileIn.files && fileIn.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { try { const o = JSON.parse(String(r.result)); replaceAll(o.character || o, 'Character opened'); } catch (e) { toast('That file is not a character'); } };
      r.readAsText(f); fileIn.value = '';
    });
    const pose = () => ui.pose, expr = () => (ui.expr === 'auto' ? undefined : ui.expr);
    const partnerChips = el('div', { class: 'chips' });
    const refreshPartner = () => { partnerChips.innerHTML = ''; [{ id: '', name: 'None' }].concat(CC.PRESETS.map((p) => ({ id: p.id, name: p.name, c: p.c }))).forEach((p) => { const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': String((S.partner ? S.partner.id : '') === p.id), text: p.name }); b.onclick = () => { setPartner(p.id ? { id: p.id, c: p.c } : null); refreshPartner(); }; partnerChips.appendChild(b); }); };
    refreshPartner();
    refreshers.push(() => { linkBox.value = location.href.split('#')[0] + '#c=' + CC.encode(cfg); });
    return [
      section('Start from', 'pick a look, then change anything', [presetsSection()]),
      section('Saved characters', 'kept in this browser', [el('div', { class: 'btnrow' }, [
        el('button', { type: 'button', class: 'btn green', text: 'Save this character', onclick: () => {
          const list = slotsList(); const id = Date.now();
          const img = CC.render.avatar(cfg, 160).toDataURL('image/png');
          list.unshift({ id, name: cfg.name, c: cfg, img }); if (list.length > 18) list.length = 18;
          if (!saveSlots(list)) { list.forEach((s) => { s.img = null; }); saveSlots(list); toast('Saved (no room for previews)'); } else toast('Saved ' + cfg.name);
          renderSlots(slotsHost);
        } }),
        el('button', { type: 'button', class: 'btn', text: 'Open file', onclick: () => fileIn.click() }), fileIn]), slotsHost]),
      section('Duo partner', 'shown mirrored next to you, like RoxorLoops & Jasmin', [partnerChips, label('Saved characters have a Duo button too.')]),
      section('Download', null, [
        label('Size'), scaleChips,
        el('div', { class: 'btnrow', style: 'margin-top:8px' }, [el('label', { style: 'display:flex;gap:6px;align-items:center;font-size:13px' }, [shadow, 'Keep the floor shadow'])]),
        el('div', { class: 'btnrow' }, [
          el('button', { type: 'button', class: 'btn pink', text: 'PNG, this pose', onclick: () => { CC.download(CC.render.sprite(cfg, { pose: pose(), expr: expr(), scale: scale.v, flip: S.flip, shadow: shadow.checked }), CC.slug(cfg.name) + '-' + pose() + '.png'); toast('PNG saved'); } }),
          el('button', { type: 'button', class: 'btn', text: 'All poses sheet', onclick: () => { CC.download(CC.render.sheet(cfg, { scale: Math.min(scale.v, 2), expr: expr(), shadow: shadow.checked }), CC.slug(cfg.name) + '-poses.png'); toast('Pose sheet saved'); } }),
          el('button', { type: 'button', class: 'btn', text: 'Round avatar', onclick: () => { CC.download(CC.render.avatar(cfg, 128 * scale.v * 2, { expr: expr() }), CC.slug(cfg.name) + '-avatar.png'); toast('Avatar saved'); } }),
          el('button', { type: 'button', class: 'btn', text: 'Poster', onclick: () => { CC.download(CC.render.poster(S.partner ? [cfg, S.partner.c] : [cfg], { bg: ui.bg === 'clear' ? 'stage' : ui.bg, poses: [pose(), S.partnerPose] }), CC.slug(cfg.name) + '-poster.png'); toast('Poster saved'); } })]),
      ]),
      section('Share & back up', null, [
        label('Anyone with this link opens the same character:'), linkBox,
        el('div', { class: 'btnrow', style: 'margin-top:8px' }, [
          el('button', { type: 'button', class: 'btn pink', text: 'Copy link', onclick: () => { linkBox.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* none */ } if (navigator.clipboard) navigator.clipboard.writeText(linkBox.value).then(() => toast('Link copied'), () => toast(ok ? 'Link copied' : 'Press Ctrl+C to copy')); else toast(ok ? 'Link copied' : 'Press Ctrl+C to copy'); } }),
          el('button', { type: 'button', class: 'btn', text: 'Save file (.json)', onclick: () => CC.downloadText(JSON.stringify({ app: 'character-studio', version: 1, character: cfg }, null, 1), CC.slug(cfg.name) + '.character.json') }),
          el('button', { type: 'button', class: 'btn ghost', text: 'Reset to default', onclick: () => replaceAll(CC.DEFAULT, 'Fresh start') })]),
      ]),
    ];
  }

  // ---------------------------------------------------------------- tabs
  function buildTabs() {
    const nav = $('tabs');
    TABS.forEach((t, i) => {
      const b = el('button', { type: 'button', class: 'tab', role: 'tab', id: 'tab_' + t[0], 'aria-selected': 'false', 'aria-controls': 'pane', text: t[1] });
      b.onclick = () => openTab(t[0]);
      b.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const j = (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length; openTab(TABS[j][0]); $('tab_' + TABS[j][0]).focus(); } });
      nav.appendChild(b);
    });
  }
  function openTab(id) {
    const t = TABS.find((x) => x[0] === id) || TABS[1];
    ui.tab = t[0]; CC.store.set(KEY_UI, ui);
    [...$('tabs').children].forEach((b) => b.setAttribute('aria-selected', String(b.id === 'tab_' + t[0])));
    const pane = $('pane');
    refreshers.length = 0; thumbs.clear(); pane.innerHTML = '';
    t[2]().forEach((s) => pane.appendChild(s));
    pane.scrollTop = 0;
    refreshAll(); queueThumbs(null);
  }

  // ---------------------------------------------------------------- belt (pose, mood, stage)
  function belt() {
    const mk = (host, cat, get, setf) => {
      const btns = [];
      cat.forEach((o) => { const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', text: o.label }); b.onclick = () => { setf(o.id); refreshBelt(); }; btns.push([b, o.id]); host.appendChild(b); });
      return () => btns.forEach(([b, id]) => b.setAttribute('aria-pressed', String(get() === id)));
    };
    const fs = [
      mk($('poses'), CC.CAT.pose, () => ui.pose, (v) => { ui.pose = v; S.t0 = performance.now(); }),
      mk($('exprs'), CC.CAT.expr, () => ui.expr, (v) => { ui.expr = v; }),
      mk($('bgs'), CC.BG, () => ui.bg, (v) => { ui.bg = v; }),
    ];
    function refreshBelt() { fs.forEach((f) => f()); CC.store.set(KEY_UI, ui); }
    refreshBelt();
  }

  // ---------------------------------------------------------------- the preview
  const cv = $('view'), g = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1, t0 = performance.now();
  function fit() {
    const r = cv.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(10, Math.round(r.width * d)), h = Math.max(10, Math.round(r.height * d));
    if (w !== cv.width || h !== cv.height) { cv.width = w; cv.height = h; }
    W = w; H = h; dpr = d;
  }
  function frame(now) {
    fit();
    const t = ui.play ? (now - t0) / 1000 : S.tFrozen;
    if (ui.play) S.tFrozen = t;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const duo = !!S.partner && !S.portrait, zoom = ui.zoom;
    const base = (H * 0.86) / 345, s = base * zoom * (duo ? 0.82 : 1);
    const cx = W / 2 + S.pan[0] * dpr, feet = H * 0.93 + S.pan[1] * dpr;
    CC.drawBg(g, W, H, ui.bg, t, H * 0.93, W / 2);
    try {
      const o = { pose: ui.pose, t, expr: ui.expr === 'auto' ? undefined : ui.expr, flip: S.flip };
      if (S.portrait) {
        CC.view(g, cfg, W, H, { pose: ui.pose, t, expr: ui.expr, anchor: 'head', span: 200 / zoom, dy: 6 - S.pan[1] / 3, dx: -S.pan[0] / 3, at: 0.5, flip: S.flip });
      } else if (duo) {
        const sep = Math.min(W * 0.2, 260 * s);
        CC.draw(g, S.partner.c, Object.assign({}, o, { x: cx + sep, y: feet, s, pose: S.partnerPose, flip: !S.flip, t: t + 0.6, expr: undefined }));
        CC.draw(g, cfg, Object.assign({}, o, { x: cx - sep, y: feet, s }));
      } else CC.draw(g, cfg, Object.assign({}, o, { x: cx, y: feet, s }));
    } catch (e) { /* CC.draw already logs */ }
    requestAnimationFrame(frame);
  }
  // drag to pan, wheel or pinch to zoom
  (function pointer() {
    const pts = new Map(); let pinch = 0;
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); cv.classList.add('drag'); pinch = 0; });
    cv.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const p = pts.get(e.pointerId), nx = e.clientX, ny = e.clientY;
      if (pts.size === 1) { S.pan[0] += nx - p[0]; S.pan[1] += ny - p[1]; }
      pts.set(e.pointerId, [nx, ny]);
      if (pts.size === 2) { const a = [...pts.values()], d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]); if (pinch) ui.zoom = clamp(ui.zoom * d / pinch, 0.4, 3); pinch = d; }
    });
    const up = (e) => { pts.delete(e.pointerId); if (!pts.size) cv.classList.remove('drag'); pinch = 0; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('dblclick', () => { S.pan = [0, 0]; ui.zoom = 1; });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); ui.zoom = clamp(ui.zoom * (e.deltaY < 0 ? 1.08 : 0.926), 0.4, 3); }, { passive: false });
  })();

  // ---------------------------------------------------------------- wiring
  function wire() {
    $('undo').onclick = undo; $('redo').onclick = redo;
    $('roll').onclick = () => {
      const r = CC.rng((Date.now() ^ (Math.random() * 1e9)) >>> 0), A = ['Loopy', 'Bouncy', 'Glitter', 'Mellow', 'Vocal', 'Fizzy', 'Sunny', 'Moody', 'Disco', 'Echo', 'Sparkly', 'Cosy'], B = ['Rox', 'Jas', 'Fox', 'Bean', 'Comet', 'Pip', 'Nova', 'Tofu', 'Mango', 'Miso', 'Poppy', 'Ziggy'];
      const c = CC.roll(r, cfg, 'all'); c.name = A[Math.floor(r() * A.length)] + ' ' + B[Math.floor(r() * B.length)];
      replaceAll(c, 'Surprise! Meet ' + c.name);
    };
    $('name').addEventListener('input', () => set({ name: $('name').value }));
    $('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('name').blur(); });
    const tog = (id, get, setf, onText, offText) => { const b = $(id); const f = () => { b.setAttribute('aria-pressed', String(get())); if (onText) b.textContent = get() ? onText : offText; }; b.onclick = () => { setf(!get()); f(); CC.store.set(KEY_UI, ui); }; f(); };
    tog('play', () => ui.play, (v) => { ui.play = v; if (v) t0 = performance.now() - S.tFrozen * 1000; }, 'Moving', 'Paused');
    tog('flip', () => S.flip, (v) => { S.flip = v; });
    tog('portrait', () => S.portrait, (v) => { S.portrait = v; });
    $('zoomIn').onclick = () => { ui.zoom = clamp(ui.zoom * 1.15, 0.4, 3); }; $('zoomOut').onclick = () => { ui.zoom = clamp(ui.zoom / 1.15, 0.4, 3); };
    window.addEventListener('keydown', (e) => {
      if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); }
    });
    window.addEventListener('hashchange', () => { const m = /[#&]c=([^&]+)/.exec(location.hash || ''), c = m && CC.decode(m[1]); if (c && JSON.stringify(c) !== JSON.stringify(cfg)) replaceAll(c); });
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches && !CC.store.get(KEY_UI)) ui.play = false;
  }

  buildTabs(); belt(); wire();
  $('name').value = cfg.name;
  openTab(ui.tab);
  requestAnimationFrame(frame);
  window.CC_APP = { get cfg() { return cfg; }, set, replaceAll, openTab, ui, S, toast };
})();
