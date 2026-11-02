// Cell Serpent round 7: friendly empty states for the Skills and Pets lists (a filter that matches nothing).
const COPY = {
  pets: { Owned: ['🥚', 'No little friends yet', 'Tap the egg above and see who hatches.'], Ready: ['🌙', 'Nobody needs stars right now', 'Win stages to find more fragments.'], All: ['🐾', 'No pets here', 'Win stages to find eggs.'] },
  skills: { Owned: ['🎵', 'No skills yet', 'Win stages to find fragments.'], Ready: ['🌱', 'Nothing to level right now', 'Keep winning, fragments are on the way.'], All: ['🎶', 'No skills here', 'Win stages to find fragments.'] },
};
export function emptyCardHTML(kind, filter) {
  const c = (COPY[kind] && (COPY[kind][filter] || COPY[kind].All)) || ['🐾', 'Nothing here yet', ''];
  return `<span class="em-ic" aria-hidden="true">${c[0]}</span><b>${c[1]}</b><small>${c[2]}</small>`;
}
// returns the card; the button switches back to the full list
export function emptyCard(kind, filter, onAll) {
  const d = document.createElement('div'); d.className = 'emptycard'; d.innerHTML = emptyCardHTML(kind, filter);
  if (filter !== 'All' && onAll) { const b = document.createElement('button'); b.className = 'em-btn'; b.textContent = 'SHOW ALL'; b.onclick = onAll; d.appendChild(b); }
  return d;
}
