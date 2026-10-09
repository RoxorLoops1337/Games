// CINE SCREEN (owner CINE): the 2D layer of a cutscene, laid over the WebGL canvas. Letterbox, subtitles with speaker names and a typewriter, VHS stamps, chapter cards,
// the kinetic BEATBOX HEROES logo, onomatopoeia words, dips to a colour, a true crossfade (a snapshot of the last frame), focus pulls (CSS blur), a vignette, flash, flicker,
// and the skip controls (tap = next line, hold = skip, the SKIP button). One screen can outlive several cines (a film that crosses worlds keeps its bars and its dip up).
//   const scr = createScreen({ parent, box, canvas, reduce, low, onTap, onSkip })      box: an element whose rect the layer follows (#glwrap), canvas: the WebGL canvas (blur, flicker, snapshots)
//   scr.letterbox(v, ms)  v: bar height as a fraction of the box height, 'scope' = 2.39:1 on a landscape box (0.1 portrait), 0 = off
//   scr.sub({ name, text, color, kind }, { cps }) -> { done(), finish() }     scr.clearSub(ms)     kind 'narr' = narration (no name, centred, softer)
//   scr.stamp(text, ms)  VHS corner stamp (typed)      scr.title({ style:'chapter'|'card'|'logo', text, sub, ms }) -> handle { land(i), slam(), out(ms), letters }
//   scr.word(text, x, y, { color, size, ms })  kinetic word at box fractions      scr.dip(v, ms, color)      scr.xfade(ms) (snapshot of opts.canvas, then fade)
//   scr.blur(px, ms)   scr.vignette(v, ms)   scr.flash(color, ms)   scr.flicker(ms)   scr.skipUI(b)   scr.layout()   scr.covered() (dip fully up)   scr.dispose()
// Every call is safe after dispose (no-ops). Nothing here touches three.js: the cine (cine.js) drives it and the game glue (r3/cine.js) owns its lifetime.
const CSS = `
.cin{position:fixed;left:0;top:0;width:0;height:0;z-index:35;pointer-events:auto;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;--u:8px;font-family:'Fredoka','Trebuchet MS',system-ui,sans-serif;color:#fff6e8}
.cin *{box-sizing:border-box}
.cin-vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 75% 62% at 50% 48%,rgba(10,6,24,0) 55%,rgba(10,6,24,.78) 100%);opacity:0;transition:opacity .8s}
.cin-xf{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;opacity:0}
.cin-lb{position:absolute;left:0;right:0;height:0;background:#07040e;pointer-events:none;transition:height .9s cubic-bezier(.65,0,.35,1)}
.cin-lb.t{top:0}.cin-lb.b{bottom:0}
.cin-stamp{position:absolute;left:calc(var(--u)*2.4);top:calc(var(--u)*1.6);font:400 calc(var(--u)*1.9)/1 'Silkscreen','Press Start 2P',monospace;letter-spacing:.12em;color:#fff6e8;text-shadow:-1px 0 #ff3ea5,1px 0 #2ee6ff;opacity:0;transition:opacity .4s;pointer-events:none;white-space:pre}
.cin-stamp i{font-style:normal;color:#ff3ea5;animation:cinBlink 1s steps(2) infinite}
.cin-sub{position:absolute;left:6%;right:6%;bottom:calc(var(--u)*2.2);display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*.6);pointer-events:none;opacity:0;transition:opacity .25s}
.cin-who{font:700 calc(var(--u)*1.5)/1 'Silkscreen','Press Start 2P',monospace;letter-spacing:.2em;color:#ffd35c;text-transform:uppercase}
.cin-txt{font:500 calc(var(--u)*2.15)/1.32 'Fredoka','Trebuchet MS',sans-serif;text-align:center;text-shadow:0 2px 0 rgba(7,4,14,.9),0 0 14px rgba(7,4,14,.8);max-width:34em;min-height:2.64em}
.cin-sub.narr .cin-txt{font-weight:500;color:#e9ddff;letter-spacing:.01em}
.cin-txt b{font-weight:700;color:#ffd35c}
.cin-title{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:calc(var(--u)*1.2);pointer-events:none;text-align:center}
.cin-ch{display:flex;align-items:center;gap:calc(var(--u)*1.4);font:400 calc(var(--u)*1.7)/1 'Silkscreen',monospace;letter-spacing:.42em;color:#fff6e8;opacity:0;transition:opacity .7s,letter-spacing 2.6s cubic-bezier(.2,.7,.2,1)}
.cin-ch:before,.cin-ch:after{content:'';display:block;height:1px;width:0;background:#ffd35c;transition:width 1.4s cubic-bezier(.2,.7,.2,1)}
.cin-ch.on{opacity:1;letter-spacing:.62em}.cin-ch.on:before,.cin-ch.on:after{width:calc(var(--u)*5)}
.cin-chs{font:500 calc(var(--u)*2.6)/1.15 'Fredoka',sans-serif;color:#ffd35c;opacity:0;transform:translateY(calc(var(--u)*.8));transition:opacity .9s .25s,transform 1.4s .25s cubic-bezier(.2,.7,.2,1);max-width:90%}
.cin-chs.on{opacity:1;transform:none}
.cin-card{font:700 calc(var(--u)*4.4)/1.05 'Fredoka',sans-serif;letter-spacing:.04em;color:#fff6e8;text-shadow:-2px 0 #ff3ea5,2px 0 #2ee6ff,0 4px 0 rgba(7,4,14,.7);opacity:0;transform:scale(1.12);transition:opacity .5s,transform 1.6s cubic-bezier(.2,.7,.2,1);max-width:92%}
.cin-card.on{opacity:1;transform:none}
.cin-logo{display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*.2);font:700 calc(var(--u)*7.4)/.95 'Fredoka',sans-serif;letter-spacing:.02em}
.cin-logo .row{display:flex;gap:calc(var(--u)*.15)}
.cin-logo span{display:inline-block;color:#ffd35c;opacity:0;transform:translateY(calc(var(--u)*-6)) scale(2.4) rotate(-8deg);filter:blur(6px);text-shadow:-3px 0 #ff3ea5,3px 0 #2ee6ff,0 calc(var(--u)*.7) 0 #43296f,0 0 calc(var(--u)*3) rgba(255,62,165,.55)}
.cin-logo span.on{opacity:1;transform:none;filter:none;transition:transform .16s cubic-bezier(.3,1.6,.5,1),opacity .08s,filter .12s}
.cin-logo.slam{animation:cinSlam .5s cubic-bezier(.3,1.4,.5,1)}
.cin-logo .row.b span{color:#fff6e8}
.cin-tag{font:700 calc(var(--u)*1.45)/1.2 'Silkscreen',monospace;letter-spacing:.12em;color:#2ee6ff;opacity:0;white-space:nowrap;transition:opacity .8s,letter-spacing 2s cubic-bezier(.2,.7,.2,1)}
.cin-tag.on{opacity:1;letter-spacing:.24em}
.cin-words{position:absolute;inset:0;pointer-events:none}
.cin-word{position:absolute;transform:translate(-50%,-50%) scale(.4);font:700 calc(var(--u)*5)/1 'Fredoka',sans-serif;color:#fff6e8;text-shadow:-2px 0 #ff3ea5,2px 0 #2ee6ff,0 3px 0 rgba(7,4,14,.6);opacity:0;white-space:nowrap}
.cin-word.on{animation:cinWord var(--ms,900ms) cubic-bezier(.2,.8,.2,1) forwards}
.cin-dip{position:absolute;inset:0;background:#120d1f;opacity:0;pointer-events:auto}
.cin-flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none}
.cin-skip{position:absolute;right:calc(var(--u)*1.6);top:calc(var(--u)*1.4);z-index:3;padding:calc(var(--u)*.7) calc(var(--u)*1.4);border:1px solid rgba(255,246,232,.35);border-radius:99px;background:rgba(7,4,14,.55);color:#fff6e8;font:700 calc(var(--u)*1.3)/1 'Silkscreen',monospace;letter-spacing:.2em;opacity:0;transition:opacity .5s;cursor:pointer;pointer-events:none}
.cin-skip.on{opacity:.85;pointer-events:auto}
.cin-hold{position:absolute;right:calc(var(--u)*2);bottom:calc(var(--u)*2);width:calc(var(--u)*5);height:calc(var(--u)*5);opacity:0;transition:opacity .2s;pointer-events:none}
.cin-hold.on{opacity:1}
.cin-hold circle{fill:none;stroke-width:3}
.cin-holdt{position:absolute;right:calc(var(--u)*7.6);bottom:calc(var(--u)*3.6);font:700 calc(var(--u)*1.2)/1 'Silkscreen',monospace;letter-spacing:.2em;color:#fff6e8;opacity:0;transition:opacity .2s;pointer-events:none}
.cin-holdt.on{opacity:.8}
@keyframes cinBlink{0%{opacity:1}50%{opacity:0}}
@keyframes cinSlam{0%{transform:scale(1.18)}100%{transform:none}}
@keyframes cinWord{0%{opacity:0;transform:translate(-50%,-50%) scale(.4)}14%{opacity:1;transform:translate(-50%,-50%) scale(1.15)}30%{transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-62%) scale(1.05)}}
@media (prefers-reduced-motion: reduce){.cin-logo span{transform:none;filter:none}.cin-word.on{animation-duration:1ms}}
`;
let cssDone = false;
const mk = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; };

export function createScreen(opts) {
  opts = opts || {};
  if (!cssDone && typeof document !== 'undefined') { cssDone = true; const st = document.createElement('style'); st.id = 'cin-css'; st.textContent = CSS; document.head.appendChild(st); }
  const parent = opts.parent || document.body, reduce = !!opts.reduce, low = !!opts.low, canvas = opts.canvas || null;
  const root = mk('div', 'cin', parent); root.setAttribute('data-cine', '1');
  // stacking, bottom to top: crossfade copy, vignette, words, the dip (a cover: cards, stamps and subtitles stay readable on it), letterbox, stamp, cards, subtitles, flash, skip controls
  const xf = mk('canvas', 'cin-xf', root), vig = mk('div', 'cin-vig', root), words = mk('div', 'cin-words', root), dipEl = mk('div', 'cin-dip', root);
  const lbT = mk('div', 'cin-lb t', root), lbB = mk('div', 'cin-lb b', root), stampEl = mk('div', 'cin-stamp', root), title = mk('div', 'cin-title', root);
  const sub = mk('div', 'cin-sub', root), who = mk('div', 'cin-who', sub), txt = mk('div', 'cin-txt', sub);
  const flashEl = mk('div', 'cin-flash', root);
  const skip = mk('button', 'cin-skip', root); skip.type = 'button'; skip.textContent = 'SKIP';
  const holdT = mk('div', 'cin-holdt', root); holdT.textContent = 'HOLD TO SKIP';
  const hold = mk('div', 'cin-hold', root); hold.innerHTML = '<svg viewBox="0 0 40 40" width="100%" height="100%"><circle cx="20" cy="20" r="16" stroke="rgba(255,246,232,.25)"/><circle class="p" cx="20" cy="20" r="16" stroke="#ffd35c" stroke-dasharray="100.5" stroke-dashoffset="100.5" transform="rotate(-90 20 20)"/></svg>';
  const ring = hold.querySelector('circle.p');
  const S = { dead: false, lb: 0, lbV: 0, box: { x: 0, y: 0, w: 360, h: 640 }, typer: null, subOn: false, dip: 0, holdT0: 0, holdRaf: 0, down: false, timers: [], blurPx: 0, title: null, stampT: null };
  const later = (fn, ms) => { const id = setTimeout(() => { S.timers = S.timers.filter((x) => x !== id); if (!S.dead) fn(); }, ms); S.timers.push(id); return id; };

  // ---------------------------------------------------------------- layout: follow the box (the 9:16 column on a phone, the whole window in wide mode)
  function layout() {
    if (S.dead) return; let r = null; try { r = opts.box && opts.box.getBoundingClientRect ? opts.box.getBoundingClientRect() : null; } catch (e) { r = null; }
    const b = r && r.width > 2 ? { x: r.left, y: r.top, w: r.width, h: r.height } : { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
    if (b.x === S.box.x && b.y === S.box.y && b.w === S.box.w && b.h === S.box.h && root.style.width) return;
    S.box = b; root.style.left = b.x + 'px'; root.style.top = b.y + 'px'; root.style.width = b.w + 'px'; root.style.height = b.h + 'px';
    root.style.setProperty('--u', Math.max(5, Math.min(b.h / (b.w > b.h ? 78 : 100), b.w / 52)).toFixed(2) + 'px');
    xf.width = Math.max(2, Math.round(b.w)); xf.height = Math.max(2, Math.round(b.h)); applyLb(true);
  }
  function lbPx(v) { const b = S.box; if (v === 'scope') return b.w > b.h ? Math.max(0, (b.h - b.w / 2.39) / 2) : b.h * 0.1; return Math.max(0, +v || 0) * b.h; }
  function applyLb(now) { const px = Math.round(lbPx(S.lbV)); if (now) { lbT.style.transition = lbB.style.transition = 'none'; } lbT.style.height = lbB.style.height = px + 'px'; if (now) { void lbT.offsetHeight; lbT.style.transition = lbB.style.transition = ''; } S.lb = px; sub.style.bottom = 'max(calc(var(--u) * 1.6), ' + Math.round(px * 0.5 - 24) + 'px)'; stampEl.style.top = Math.max(8, Math.round(px * 0.5 - 8)) + 'px'; }

  // ---------------------------------------------------------------- input: tap = next, hold = skip (and the SKIP button)
  const HOLD_MS = opts.holdMs || 750;
  function holdFrame() {
    if (!S.down || S.dead) return; const k = Math.min(1, (performance.now() - S.holdT0) / HOLD_MS); ring.setAttribute('stroke-dashoffset', String(100.5 * (1 - k)));
    if (k >= 1) { S.down = false; hold.classList.remove('on'); holdT.classList.remove('on'); fire('onSkip'); return; } S.holdRaf = requestAnimationFrame(holdFrame);
  }
  const fire = (k) => { try { if (typeof opts[k] === 'function') opts[k](); } catch (e) { console.error('[cine] ' + k, e); } };
  const onDown = (e) => { if (e.target === skip) return; e.preventDefault(); S.down = true; S.holdT0 = performance.now(); S.moved = false; later(() => { if (S.down) { hold.classList.add('on'); holdT.classList.add('on'); } }, 160); cancelAnimationFrame(S.holdRaf); S.holdRaf = requestAnimationFrame(holdFrame); };
  const onUp = (e) => { if (!S.down) return; const dt = performance.now() - S.holdT0; S.down = false; cancelAnimationFrame(S.holdRaf); hold.classList.remove('on'); holdT.classList.remove('on'); ring.setAttribute('stroke-dashoffset', '100.5'); if (dt < HOLD_MS && e && e.type !== 'pointercancel') fire('onTap'); };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); fire('onSkip'); } else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); fire('onTap'); } };
  root.addEventListener('pointerdown', onDown); root.addEventListener('pointerup', onUp); root.addEventListener('pointercancel', onUp); root.addEventListener('pointerleave', onUp);
  skip.addEventListener('click', (e) => { e.stopPropagation(); fire('onSkip'); }); skip.addEventListener('pointerdown', (e) => e.stopPropagation());
  window.addEventListener('keydown', onKey); window.addEventListener('resize', layout);
  layout();

  // ---------------------------------------------------------------- subtitles (typewriter)
  function typeInto(el, text, cps, onChar, onDone) {
    let n = 0, id = 0; const full = String(text || ''); el.textContent = '';
    const end = () => { if (onDone) { const f = onDone; onDone = null; f(); } };
    const h = { done: () => n >= full.length, finish() { if (n >= full.length) return; n = full.length; clearInterval(id); el.textContent = full; end(); } };
    if (reduce || !cps) { n = full.length; el.textContent = full; end(); return h; }
    id = setInterval(() => { if (S.dead) { clearInterval(id); return; } n = Math.min(full.length, n + 1); el.textContent = full.slice(0, n); if (onChar && n % 3 === 1 && full[n - 1] !== ' ') onChar(); if (n >= full.length) { clearInterval(id); end(); } }, 1000 / cps);
    S.timers.push(id); return h;
  }
  const api = {
    root, get box() { return S.box; }, get letterboxPx() { return S.lb; },
    layout,
    letterbox(v, ms) { if (S.dead) return; S.lbV = v; const t = ms === undefined ? 900 : ms; lbT.style.transitionDuration = lbB.style.transitionDuration = (reduce ? Math.min(t, 200) : t) + 'ms'; applyLb(t === 0); },
    sub(line, o) {
      if (S.dead) return { done: () => true, finish() {} }; o = o || {}; const narr = !line.name || line.kind === 'narr';
      sub.classList.toggle('narr', narr); who.textContent = narr ? '' : line.name; who.style.display = narr ? 'none' : ''; who.style.color = line.color || '#ffd35c';
      sub.style.opacity = '1'; S.subOn = true; if (S.typer) S.typer.finish();
      S.typer = typeInto(txt, line.text, o.cps === undefined ? 40 : o.cps, o.onChar); return S.typer;
    },
    clearSub(ms) { if (S.dead || !S.subOn) return; S.subOn = false; sub.style.transitionDuration = (ms === undefined ? 250 : ms) + 'ms'; sub.style.opacity = '0'; if (S.typer) S.typer.finish(); },
    stamp(text, ms) {
      if (S.dead) return; clearTimeout(S.stampT); if (!text) { stampEl.style.opacity = '0'; return; }
      stampEl.style.opacity = '1'; const parts = String(text).split('|');
      typeInto(stampEl, parts[0], reduce ? 0 : 22, null, () => { if (!parts[1]) return; const i = document.createElement('i'); i.textContent = parts[1]; stampEl.appendChild(document.createTextNode('  ')); stampEl.appendChild(i); });
      if (ms) S.stampT = later(() => { stampEl.style.opacity = '0'; }, ms);
    },
    // chapter card: tracking-out small caps between two growing gold lines, a big line under it. card: one big statement. logo: BEATBOX HEROES, one letter per land(i)
    title(o) {
      if (S.dead) return { land() {}, slam() {}, out() {}, letters: 0 }; o = o || {}; if (S.title) S.title.out(200); const box = mk('div', '', title); let letters = [], el = null;
      const h = { box, get letters() { return letters.length; },
        land(i) { const s = letters[i]; if (s && !s.classList.contains('on')) s.classList.add('on'); },
        slam() { letters.forEach((s) => s.classList.add('on')); if (el && !reduce) { el.classList.remove('slam'); void el.offsetWidth; el.classList.add('slam'); } const tg = box.querySelector('.cin-tag'); if (tg) later(() => tg.classList.add('on'), 250); },
        out(ms) { const t = ms === undefined ? 600 : ms; box.style.transition = 'opacity ' + t + 'ms'; box.style.opacity = '0'; later(() => box.remove(), t + 40); if (S.title === h) S.title = null; } };
      if (o.style === 'logo') {
        el = mk('div', 'cin-logo', box); String(o.text || 'BEATBOX HEROES').split(' ').forEach((wd, r) => { const row = mk('div', 'row' + (r ? ' b' : ''), el); for (const ch of wd) { const s = mk('span', '', row); s.textContent = ch; letters.push(s); } });
        if (o.sub) { const tg = mk('div', 'cin-tag', box); tg.textContent = o.sub; }
      } else if (o.style === 'card') {
        el = mk('div', 'cin-card', box); el.textContent = o.text || ''; requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
        if (o.sub) { const s2 = mk('div', 'cin-chs', box); s2.textContent = o.sub; requestAnimationFrame(() => requestAnimationFrame(() => s2.classList.add('on'))); }
      } else {
        el = mk('div', 'cin-ch', box); el.textContent = o.text || ''; requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
        if (o.sub) { const s2 = mk('div', 'cin-chs', box); s2.textContent = o.sub; requestAnimationFrame(() => requestAnimationFrame(() => s2.classList.add('on'))); }
      }
      S.title = h; if (o.ms) later(() => h.out(o.outMs), o.ms); return h;
    },
    word(text, x, y, o) {
      if (S.dead) return; o = o || {}; const w = mk('div', 'cin-word', words); w.textContent = text; w.style.left = (x * 100).toFixed(1) + '%'; w.style.top = (y * 100).toFixed(1) + '%';
      if (o.color) w.style.color = o.color; if (o.size) w.style.fontSize = 'calc(var(--u) * ' + o.size + ')'; if (o.rot) w.style.rotate = o.rot + 'deg';
      const ms = o.ms || 900; w.style.setProperty('--ms', ms + 'ms'); requestAnimationFrame(() => w.classList.add('on')); later(() => w.remove(), ms + 60);
    },
    dip(v, ms, color) { if (S.dead) return; S.dip = v; dipEl.style.transition = 'opacity ' + (ms || 0) + 'ms linear'; if (color) dipEl.style.background = color; dipEl.style.opacity = String(v); },
    covered() { if (S.dead) return false; return S.dip >= 1 && +getComputedStyle(dipEl).opacity >= 0.99; },
    // a true crossfade: copy the frame on screen NOW (call it right after a render, cine.js does it from the world's post hook), then fade the copy out over the new shot
    xfade(ms) {
      if (S.dead || !canvas) return false; try { const g = xf.getContext('2d'); g.clearRect(0, 0, xf.width, xf.height); g.drawImage(canvas, 0, 0, xf.width, xf.height); } catch (e) { return false; }
      xf.style.transition = 'none'; xf.style.opacity = '1'; void xf.offsetWidth; xf.style.transition = 'opacity ' + (ms || 600) + 'ms ease-in-out'; requestAnimationFrame(() => { if (!S.dead) xf.style.opacity = '0'; }); return true;
    },
    blur(px, ms) { if (S.dead || !canvas || low || reduce) return; S.blurPx = px; canvas.style.transition = 'filter ' + (ms || 400) + 'ms ease-in-out'; canvas.style.filter = px > 0.05 ? 'blur(' + px.toFixed(2) + 'px)' : ''; },
    vignette(v, ms) { if (S.dead) return; vig.style.transitionDuration = (ms === undefined ? 800 : ms) + 'ms'; vig.style.opacity = String(Math.max(0, Math.min(1, v))); },
    flash(color, ms) { if (S.dead || reduce) return; flashEl.style.transition = 'none'; flashEl.style.background = color || '#fff'; flashEl.style.opacity = '0.85'; void flashEl.offsetWidth; flashEl.style.transition = 'opacity ' + (ms || 300) + 'ms ease-out'; flashEl.style.opacity = '0'; },
    // a dying fluorescent tube: brightness pulses on the canvas
    flicker(ms) {
      if (S.dead || !canvas || reduce) return; const seq = [0.35, 1, 0.5, 1.1, 0.25, 1], step = Math.max(30, (ms || 500) / seq.length); canvas.style.transition = 'none';
      seq.forEach((b, i) => later(() => { canvas.style.filter = (S.blurPx > 0.05 ? 'blur(' + S.blurPx.toFixed(2) + 'px) ' : '') + (b === 1 ? '' : 'brightness(' + b + ')'); }, i * step));
    },
    skipUI(b) { if (!S.dead) skip.classList.toggle('on', !!b); },
    dispose() {
      if (S.dead) return; S.dead = true; S.timers.forEach((id) => { clearTimeout(id); clearInterval(id); }); cancelAnimationFrame(S.holdRaf);
      window.removeEventListener('keydown', onKey); window.removeEventListener('resize', layout);
      if (canvas) { canvas.style.filter = ''; canvas.style.transition = ''; } if (root.parentNode) root.parentNode.removeChild(root);
    },
    get dead() { return S.dead; },
  };
  return api;
}
