// Cell Serpent batch 14 (d): pet detail hero (big portrait, stars under it) and the next-star preview card,
// plus the sticky "level up all ready" bar for the Gear tab. Pure string builders, no sim changes.
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// big portrait with the star row hugging it, the name and the friend line next to nothing else (centred)
export function petHeroHTML({ iconHTML, label, sub, color, stars, max, owned }) {
  const st = Array.from({ length: max }, (_, n) => `<i class="star${n < stars ? ' on' : ''}">★</i>`).join('');
  return `<div class="pdhero${owned ? '' : ' unmet'}" style="--rc:${color}"><div class="pdic dsic">${iconHTML}</div>` +
    `<div class="pdnm"><b>${esc(label)}</b><span style="color:${color}">${sub}</span></div>` +
    `<div class="pdstars dsstars" role="img" aria-label="${stars} of ${max} stars">${st}</div></div>`;
}

// now -> next star card: what the pet gives today, what one more star adds, and how close the fragments are
export function nextStarHTML({ nowText, nextText, deltaText, owned, maxed, frag, need, star, max }) {
  if (maxed) return `<div class="pdnext full"><div class="pdnh"><b>ALL ${max} STARS</b><small>Fully loved</small></div><div class="pdnb"><span>Bonus</span><b>${nowText}</b></div></div>`;
  const pct = need ? Math.min(100, Math.round(frag / need * 100)) : 100, left = Math.max(0, need - frag);
  return `<div class="pdnext${frag >= need ? ' ready' : ''}"><div class="pdnh"><b>${owned ? 'NEXT STAR ' + (star + 1) : 'MEET THEM'}</b><small>${left ? left + ' fragments to go' : 'Ready now'}</small></div>` +
    `<div class="pdcmp"><div class="pdnow"><small>NOW</small><b>${owned ? nowText : 'none'}</b></div><i class="pdarr" aria-hidden="true">➜</i><div class="pdnx"><small>${owned ? star + 1 + ' STARS' : '1 STAR'}</small><b>${nextText}</b></div></div>` +
    (deltaText ? `<div class="pdgain">▲ ${deltaText}</div>` : '') +
    `<div class="pdbar" aria-hidden="true"><i style="width:${pct}%"></i></div></div>`;
}

// the sticky bar on the Gear tab: how many keepsakes can level and one big button
export function gearBarHTML(ready) {
  return `<span class="gbi" aria-hidden="true">▲</span><span class="gbt"><b>${ready} READY</b><small>to level up</small></span><button type="button" class="btn small gold gbgo">LEVEL UP ALL</button>`;
}
