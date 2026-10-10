// Battle Call: front door. Home (enter a code), create an event, and join/log in to one.
import { esc, ic } from '../dom.js';
import { S, sessions, serverBase } from '../state.js';
import { ui, pill, wordmark, crown } from '../ui.js';

const brand = `<div class="brand">${wordmark(34)}</div>`;

export function homeView() {
  const sess = Object.entries(sessions()).sort((a, b) => (b[1].t || 0) - (a[1].t || 0)).slice(0, 4);
  return `<main class="front home">
    <div class="homehero" aria-hidden="true"></div>
    ${brand}
    <h1 class="hl">Feel it.<br>Predict it.<br><em>Call it.</em></h1>
    <p class="lead">Live beatbox battles. Real fans. Rank the Top 16, back your winners, and hold up your colour when it is time to vote.</p>
    <form class="card codebox" data-form="joinCode">
      <label for="code">Event code</label>
      <input id="code" name="code" class="code" maxlength="8" placeholder="A1B2C" autocapitalize="characters" autocomplete="off" autocorrect="off" spellcheck="false" inputmode="text">
      <button class="btn big" type="submit">Join a battle ${ic('right', 20)}</button>
      ${ui.err ? `<p class="err">${esc(ui.err)}</p>` : ''}
    </form>
    <a class="card link demo" href="#/e/DEMO">${ic('bolt', 22)}<div><b>Try the demo</b><small>A full battle night with 28 simulated fans. No server, no sign-up.</small></div>${ic('right', 18)}</a>
    ${sess.length ? `<section class="block"><h3>Your events</h3><div class="stack">${sess.map(([c, s]) => `<a class="card link" href="#/${s.ht ? 'h' : 'e'}/${c}">${ic(s.ht ? 'cog' : 'user', 20)}<div><b>${esc(s.ev || c)}</b><small>${s.ht ? 'Organiser' : esc(s.name || 'Watching')} · ${c}</small></div>${ic('right', 18)}</a>`).join('')}</div></section>` : ''}
    <a class="btn ghost wide" href="#/new">${crown('sm', false)} I am running a battle</a>
    <p class="muted center small foot">Server: ${esc(serverBase().replace(/^https?:\/\//, ''))} · <button class="linkbtn" data-a="serverEdit">change</button></p>
  </main>`;
}

export function createView() {
  return `<main class="front">
    <div class="glow g1"></div>
    <a class="back" href="#/">${ic('left', 18)} Back</a>
    ${brand}
    <h1>Run a battle</h1>
    <p class="lead">Make an event, share the code, and drive the whole thing from your phone. You can add the beatboxers after.</p>
    <form class="card form" data-form="create">
      <label>Event name<input name="name" maxlength="40" placeholder="Beatbox Battle Utrecht" autocomplete="off" value="${esc(ui.createName || '')}"></label>
      <label>First category <small class="muted">you can add more later: Solo Female, Crew, Tag Team...</small><input name="catName" maxlength="24" placeholder="Solo Mix" autocomplete="off" value="${esc(ui.createCat || '')}"></label>
      <label>How many go through to its bracket?</label>
      <div class="segs" role="radiogroup">${[2, 4, 8, 16, 32, 64].map((n) => `<button type="button" class="seg ${(ui.createSize || 16) === n ? 'on' : ''}" data-a="createSize" data-n="${n}">${n === 2 ? 'Final' : n}</button>`).join('')}</div>
      <label>Organiser password<input name="password" type="password" minlength="4" placeholder="Only you know this" autocomplete="new-password"></label>
      ${S.createKeyNeeded ? '<label>Organiser key<input name="key" placeholder="Needed on this server" autocomplete="off"></label>' : ''}
      <button class="btn big" type="submit" ${ui.busy ? 'disabled' : ''}>${ui.busy ? 'Creating...' : 'Create event'}</button>
      ${ui.err ? `<p class="err">${esc(ui.err)}</p>` : ''}
    </form>
  </main>`;
}

export function authView() {
  const ev = S.meta, join = ui.authMode === 'join';
  return `<main class="front auth">
    <div class="glow g1"></div><div class="glow g2"></div>
    <a class="back" href="#/">${ic('left', 18)} Home</a>
    ${brand}
    ${ev ? `<p class="eyebrow">You are joining</p><h1>${esc(ev.name)}</h1>` : '<h1>Joining...</h1>'}
    <div class="segs"><button class="seg ${join ? 'on' : ''}" data-a="authMode" data-m="join">New here</button><button class="seg ${join ? '' : 'on'}" data-a="authMode" data-m="login">I have an account</button></div>
    <form class="card form" data-form="auth" autocomplete="on">
      <label>Nickname<input name="name" maxlength="18" placeholder="${join ? 'What should we call you?' : 'Your nickname'}" autocomplete="username" autocapitalize="off" value="${esc(ui.nick || '')}"></label>
      <label>Password
        <span class="pw"><input name="password" type="${ui.showPw ? 'text' : 'password'}" minlength="4" placeholder="${join ? 'At least 4 characters' : 'Your password'}" autocomplete="${join ? 'new-password' : 'current-password'}"><button type="button" class="ib" data-a="togglePw" aria-label="Show password">${ic('info', 18)}</button></span></label>
      <button class="btn big" type="submit" ${ui.busy ? 'disabled' : ''}>${ui.busy ? 'One moment...' : join ? 'Join with ' + (ev ? ev.set.start.toLocaleString() : '1,000') + ' Loops' : 'Log in'}</button>
      ${ui.err ? `<p class="err">${esc(ui.err)}</p>` : ''}
      ${join ? '<p class="muted small center">No email needed. Remember your password: it is how you get back in if you close the page.</p>' : ''}
    </form>
    <button class="linkbtn center" data-a="watch">Just watching</button>
  </main>`;
}
