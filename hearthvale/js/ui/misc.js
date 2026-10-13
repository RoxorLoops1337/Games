// Chat, settings, daily gift calendar with the chest, the visitor card and the village profile.
import { Audio } from '../audio.js';
import { icon } from '../icons.js';
import { S, $, esc, fmt, store, cmd, coinFrom, have, goodName, GOOD, mmss, hms } from './state.js';
import { register } from './frame.js';
import { toast, snd, ui, haptic, confetti, sparkAt, flyTo, pulse, setReduced, reduced, wobble } from './fx.js';
import { DAILY_REWARDS, VISITOR_NAMES, ACHIEVEMENTS, FESTIVAL } from '../../shared/data.js';
import { startTour } from './tour.js';

// ---------- chat ----------
const QUICK = ['\u{1F44B} Hi!', '❤️', '\u{1F602}', '\u{1F389} Yay!', '\u{1F64F} Thanks!', '\u{1F33E} Nice farm!'];
let chatDraft = '';
const logHtml = () => { const log = S.snap.chat.slice(-30); return log.length ? log.map((c) => { const me = c.pid === S.myId; return `<div class="bub ${me ? 'me' : ''}"><b style="color:${c.color}">${esc(c.name)}</b><span>${esc(c.text)}</span></div>`; }).join('') : '<p class="small ctr">It is quiet... say something nice!</p>'; };
register({
  id: 'chat', modal: false, title: 'Chat', icon: 'chat', sub: () => 'Say hello to your neighbours',
  render() {
    return `<div class="chatlog" data-keep="log">${logHtml()}</div>
      <div class="quick">${QUICK.map((q) => `<button class="chipb" data-a="q" data-t="${esc(q)}" data-snd="tap2">${q}</button>`).join('')}</div>
      <div class="chatrow"><input id="chatIn" maxlength="120" placeholder="Say hello..." value="${esc(chatDraft)}" autocomplete="off"><button class="b b-green round" data-a="send" aria-label="Send" data-snd="confirm">${icon('tick', 22)}</button></div>`;
  },
  bind(body) {
    const inp = body.querySelector('#chatIn'), log = body.querySelector('.chatlog'); if (log) log.scrollTop = 1e6;
    inp.oninput = () => { chatDraft = inp.value; }; inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') body.querySelector('[data-a=send]').click(); };
  },
  act(a, el) {
    const inp = $('#chatIn');
    if (a === 'q') { cmd({ op: 'chat', text: el.dataset.t }); snd('giggle', { vol: 0.6 }); }
    else if (a === 'send' && inp && inp.value.trim()) { cmd({ op: 'chat', text: inp.value }); chatDraft = ''; inp.value = ''; snd('tap2'); }
  },
  keepFocus: true,
  live(body) { const l = body.querySelector('.chatlog'); if (!l) return; const h = logHtml(); if (l.dataset.lh !== h) { l.dataset.lh = h; l.innerHTML = h; l.scrollTop = 1e6; } },
});

// ---------- settings ----------
const VOL = [['master', 'Master', 'sound'], ['music', 'Music', 'sound'], ['sfx', 'Sound effects', 'sound'], ['ambience', 'Ambience', 'leaf']];
register({
  id: 'settings', modal: true, tall: true, title: 'Settings', icon: 'menu',
  render() {
    const q = S.view.quality, muted = Audio.isMuted(), solo = S.link.kind === 'solo';
    let h = `<div class="sec"><h4>${icon('sound', 22)} Sound</h4>${VOL.map(([ch, l]) => `<label class="slide"><span>${l}</span><input type="range" min="0" max="100" value="${Math.round((Audio.getVolume(ch) ?? 0.7) * 100)}" data-ch="${ch}" aria-label="${l}"></label>`).join('')}
      <div class="set"><span>${icon(muted ? 'mute' : 'sound', 22)} Mute everything</span><button class="sw ${muted ? 'on' : ''}" data-a="mute" aria-label="Mute" data-snd="toggle"></button></div></div>`;
    h += `<div class="sec"><h4>${icon('camera', 22)} Looks and feel</h4><div class="label2">Picture quality</div><div class="seg">${['auto', 'low', 'medium', 'high'].map((t) => `<button class="${q === t ? 'on' : ''}" data-a="quality" data-q="${t}" data-snd="tab">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div><p class="small">Auto adapts to your device (now: ${esc(S.view.tier)}).</p>
      <div class="set"><span>${icon('sparkle', 22)} Reduce motion</span><button class="sw ${reduced() ? 'on' : ''}" data-a="reduce" aria-label="Reduce motion" data-snd="toggle"></button></div>
      <div class="set"><span>${icon('bolt', 22)} Vibration</span><button class="sw ${S.haptics !== false ? 'on' : ''}" data-a="haptics" aria-label="Vibration" data-snd="toggle"></button></div></div>`;
    h += `<div class="sec"><h4>${icon('house', 22)} Village</h4><div class="grid2"><button class="b b-cream" data-a="rename">${icon('pencil', 22)} Rename village</button><button class="b b-cream" data-a="tour">${icon('hand', 22)} Replay the tour</button><button class="b b-cream" data-a="fs">${icon('expand', 22)} Fullscreen</button>${solo ? `<button class="b b-red" data-a="reset">${icon('trash', 22)} New solo game</button>` : `<button class="b b-blue" data-a="invite">${icon('link', 22)} Copy invite link</button>`}</div>
      <p class="small">${solo ? 'Solo mode: five friendly neighbour villages share your valley. Your game saves in this browser.' : 'Connected to a server. Your village is tied to this browser, so keep your link.'}</p></div>`;
    h += `<div class="sec"><h4>${icon('hand', 22)} Controls</h4><p class="small">Drag to pan, pinch or scroll to zoom, two fingers or right-drag to rotate. Tap trees, rocks and clay to send a villager. Tap buildings to use them. Keys: B build, H home, V valley, I villagers.</p></div>`;
    h += `<div class="sec ctr credits"><b>Hearthvale</b><p class="small">An original cozy co-op village builder. All art and sound are made from code. Thank you for playing!</p></div>`;
    return h;
  },
  bind(body) {
    for (const r of body.querySelectorAll('input[type=range]')) {
      const paint = () => r.style.setProperty('--p', r.value + '%'); paint();
      r.addEventListener('input', () => { paint(); Audio.setVolume(r.dataset.ch, r.value / 100); });
      r.addEventListener('change', () => { ui('tap2'); });
    }
  },
  act(a, el, S0, p, api) {
    if (a === 'mute') { Audio.toggleMute(); api.rerender(); }
    else if (a === 'quality') { S.view.setQuality(el.dataset.q); document.body.classList.toggle('lowfx', el.dataset.q === 'low'); api.rerender(); }
    else if (a === 'reduce') { setReduced(!reduced()); api.rerender(); }
    else if (a === 'haptics') { S.haptics = !(S.haptics !== false); store.set('haptics', S.haptics); if (S.haptics) haptic(30); api.rerender(); }
    else if (a === 'rename') S.api.ask({ title: 'Name your village', value: S.pub.name, max: 16 }).then((n) => { if (n) { cmd({ op: 'rename', name: n }); toast('Welcome to ' + n + '!', { icon: 'house', type: 'good' }); } });
    else if (a === 'tour') { api.close(); startTour(true); }
    else if (a === 'fs') { try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); } catch { /* ignore */ } }
    else if (a === 'reset') S.api.confirm({ title: 'Delete your solo game?', text: 'You will start over with a brand new village.', ok: 'Delete it', danger: true }).then((ok) => { if (ok) S.link.reset(); });
    else if (a === 'invite') { const u = location.origin + location.pathname + '?server=' + encodeURIComponent(S.link.url || '') + '&auto'; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast('Invite link copied!', { icon: 'link', type: 'good' }), () => S.api.ask({ title: 'Copy this link', value: u, max: 300, ok: 'Done' })); }
  },
});

// ---------- daily gift ----------
const dailyRewardHtml = (r) => Object.entries(r).filter(([k]) => k !== 'cosmetic').map(([k, n]) => `<span class="cc">${icon(k, 16)}${n}</span>`).join('') + (r.cosmetic ? `<span class="cc">${icon('crown', 16)}</span>` : '');
register({
  id: 'daily', modal: true, title: 'Daily gift', icon: 'chest', sub: (S0, p) => { const d = S.you.daily; return d.streak ? `${d.streak} day streak` : 'Come back every day'; },
  render(S0, p) {
    const d = S.you.daily, got = p.got; let h = '';
    const streak = got ? got.streak : d.streak, claimedUpTo = got ? got.streak : d.streak;
    h += `<div class="chestbox ${got ? 'open' : d.available ? 'ready' : ''}"><div class="rays"></div><div class="chest">${icon(got ? 'chestOpen' : 'chest', 110)}</div>${got ? `<div class="loot">${Object.entries(got.reward).filter(([k]) => k !== 'cosmetic').map(([k, n], i) => `<span class="lt" style="--d:${i * 0.12}s">${icon(k, 34)}<b>+${n}</b></span>`).join('')}${got.cosmetic ? `<span class="lt" style="--d:.5s">${icon('crown', 34)}<b>${esc(String(got.cosmetic).replace(/_/g, ' '))}</b></span>` : ''}</div>` : ''}</div>`;
    h += `<div class="cal">${DAILY_REWARDS.map((r, i) => { const st = i < claimedUpTo ? 'done' : (!got && d.available && i === d.nextDay - 1) ? 'today' : 'future'; return `<div class="day ${st} ${i === 6 ? 'big' : ''}"><small>Day ${i + 1}</small><div class="di">${st === 'done' ? icon('check', 24) : i === 6 ? icon('chest', 28) : icon('gift', 24)}</div><div class="dr">${dailyRewardHtml(r)}</div></div>`; }).join('')}</div>`;
    if (!d.clock) h += `<p class="small ctr">The daily gift is resting right now. Try again in a moment!</p>`;
    else if (got) h += `<button class="b b-green big w100" data-a="close" data-snd="confirm">${icon('tick', 24)} Yay, thanks!</button>`;
    else if (d.available) h += `<button class="b b-gold big w100 shine" data-a="claim" data-snd="none">${icon('chest', 28)} Open today's gift!</button>`;
    else h += `<div class="sec ctr"><b>Next gift in <span class="cdms" data-at="${Math.round((Date.now() + d.nextInMs) / 5000) * 5000}"></span></b><p class="small">Gifts come every 20 hours. Miss two days and the streak restarts.</p></div>`;
    return h;
  },
  act(a, el, S0, p, api) {
    if (a === 'close') api.close();
    else if (a === 'claim') {
      const rc = el.getBoundingClientRect(); const r = cmd({ op: 'daily' }); if (r.ok === false) return;
      p.got = { streak: r.streak, reward: r.reward || {}, cosmetic: r.cosmetic }; snd('daily'); haptic([12, 30, 12, 30, 24]); api.rerender();
      setTimeout(() => { const ch = document.querySelector('.chestbox .chest'); const rr = ch ? ch.getBoundingClientRect() : rc; const o = { x: rr.left + rr.width / 2, y: rr.top + rr.height / 2 }; confetti(o.x, o.y, 90, { cone: 3.2 });
        for (const [k, n] of Object.entries(p.got.reward)) { if (k === 'cosmetic') continue; flyTo(o, document.querySelector(k === 'coins' ? '#pCoins' : k === 'scrolls' ? '#pScrolls' : '#strip'), { icon: k, n: Math.min(6, 2 + Math.round(Math.log2(n + 1))), delay: 700 }); }
        const w = S.view.villages.get(S.myId); if (w) S.view.celebrate('daily', w.group.position.x, w.group.position.z); }, 120);
    }
  },
});

// ---------- visitor ----------
register({
  id: 'visitor', modal: false, title: 'A visitor!', icon: 'visitor', onOpen() { S.unseen.visitor = false; },
  render(S0, p, tab, api) {
    const v = S.you.visitor; if (!v) { setTimeout(() => api.close(), 400); return `<div class="sec ctr"><div class="bigic">${icon('visitor', 70)}</div><b>The visitor has gone on their way.</b><p class="small">Keep your charm high and another will come!</p></div>`; }
    const own = have(v.want), short = own < v.n, why = short ? 'Need ' + (v.n - own) + ' more ' + goodName(v.want).toLowerCase() : '';
    return `<div class="sec"><div class="row"><span class="th" style="--b1:#e1f7cf">${icon('visitor', 54)}</span><div class="grow"><div class="speech">Hello! I'm the ${esc(VISITOR_NAMES[v.who] || 'Traveller')}. Could you spare some ${esc(goodName(v.want).toLowerCase())}?</div></div></div>
      <div class="row sp" style="margin-top:10px"><div class="trade"><span class="cc ${short ? 'bad' : ''}">${icon(v.want, 34)}<b>${v.n}</b></span><span class="arrow">${icon('arrow', 22)}</span><span class="cc">${icon('coins', 34)}<b>${v.price}</b></span></div><div class="ctr"><b class="cdbig">${mmss(v.expiresIn)}</b><div class="small">before they leave</div></div></div>
      <p class="small">They pay 1.5x and might leave a tip!</p>
      <button class="b b-green big w100 ${why ? 'off' : 'shine'}" data-a="serve" data-why="${esc(why)}" data-snd="none">${icon('gift', 26)} Serve</button></div>`;
  },
  act(a, el, S0, p, api) {
    if (a !== 'serve') return; coinFrom(el); const r = cmd({ op: 'visitorServe' });
    if (r.ok !== false) { snd('cashRegister'); haptic([10, 30, 20]); const rc = el.getBoundingClientRect(); confetti(rc.left + rc.width / 2, rc.top, 36, { cone: 2.6 }); toast(r.tip ? `They loved it and tipped ${r.tip}!` : 'What a lovely visitor!', { icon: 'visitor', type: 'gold' }); api.close(); }
  },
});

// ---------- profile ----------
register({
  id: 'profile', modal: true, title: () => esc(S.pub.name), icon: 'house', sub: () => esc(S.pub.title || 'Village mayor'),
  render() {
    const y = S.you, st = y.stats || {}; const stat = (ic, v, l) => `<div class="stat">${icon(ic, 26)}<b>${fmt(v)}</b><small>${l}</small></div>`;
    return `<div class="sec ctr"><div class="bigav" style="background:${S.pub.color}">${icon('house', 54)}</div><b class="big2">Level ${y.level}</b><div class="small">${icon('heart', 13)} ${y.charm || 0} charm - +${Math.round((y.xpBonus || 0) * 100)}% XP</div></div>
      <div class="stats">${stat('hammer', st.buildings || 0, 'Buildings')}${stat('players', y.villagers.length, 'Villagers')}${stat('scrolls', st.orders || 0, 'Orders helped')}${stat('paw', st.animals || 0, 'Animals')}${stat('gift', st.gifted || 0, 'Gifts sent')}${stat('visitor', st.visitors || 0, 'Visitors')}</div>
      <div class="row"><button class="b b-gold grow" data-a="ach">${icon('trophy', 22)} Trophies</button><button class="b b-cream grow" data-a="set">${icon('menu', 22)} Settings</button></div>`;
  },
  act(a, el, S0, p, api) { if (a === 'ach') api.open('achievements', {}, el); else if (a === 'set') api.open('settings', {}, el); },
});
