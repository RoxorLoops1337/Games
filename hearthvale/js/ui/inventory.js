// The inventory sheet: all 19 goods with capacity bars, sell prices and where each comes from.
import { icon } from '../icons.js';
import { S, esc, fmt, GOOD, GROUPS, GOODS, SELL, CATS } from './state.js';
import { register } from './frame.js';

register({
  id: 'inventory', modal: true, tall: true, title: 'Pantry', icon: 'crate', sub: () => `${icon('crate', 14)} ${S.you.cap} per good`,
  render(S0, p) {
    const you = S.you, hasMarket = S.snap.players.find((q) => q.id === S.myId).b.some((b) => b[1] === 'market' && b[4] >= 1);
    let h = `<div class="wallet2"><div class="wcard ${p.focus === 'coins' ? 'hl' : ''}"><span class="th sm" style="--b1:#fff0b0">${icon('coins', 34)}</span><div><b class="big2">${fmt(you.coins)}</b><div class="small">Coins</div></div></div><div class="wcard ${p.focus === 'scrolls' ? 'hl' : ''}"><span class="th sm" style="--b1:#e6f0ff">${icon('scrolls', 34)}</span><div><b class="big2">${fmt(you.res.scrolls || 0)}</b><div class="small">Scrolls</div></div></div></div>`;
    for (const [grp, label] of GROUPS) {
      const list = GOODS.filter((g) => GOOD[g].grp === grp && g !== 'scrolls'); if (!list.length) continue;
      h += `<div class="sec"><h4>${label}</h4><div class="goods">${list.map((g) => {
        const n = you.res[g] || 0, full = n >= you.cap, f = Math.min(1, n / you.cap);
        return `<div class="good ${n ? '' : 'zero'} ${full ? 'full' : ''} ${p.focus === g ? 'hl' : ''}"><span class="th sm" style="--b1:${GOOD[g].tint}">${icon(g, 34)}</span><div class="grow"><div class="row sp"><b>${GOOD[g].name}</b><b class="gn">${n}${full ? ' MAX' : ''}</b></div><div class="bar thin ${full ? 'p' : 'g'}"><i style="width:${Math.round(f * 25) * 4}%"></i></div><div class="small">${SELL[g]}${icon('coins', 12)} each - ${esc(GOOD[g].from)}</div></div></div>`;
      }).join('')}</div></div>`;
    }
    h += `<p class="small ctr">${hasMarket ? 'Sell extras at your Market.' : 'Build a Market (research Trade) to sell goods for coins.'} A Storehouse adds +50 storage.</p>`;
    return h;
  },
  bind(body, S0, p) { if (p.focus && !p._scrolled) { p._scrolled = true; const el = body.querySelector('.hl'); if (el) el.scrollIntoView({ block: 'center' }); } },
});
