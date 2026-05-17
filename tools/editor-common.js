// Shared helpers for the Beatbox Story dev-tool editors.
// Loaded before each editor's own inline <script>, so these are
// available as plain globals (togglePane / copyOut are also invoked
// from inline onclick="" attributes, which require global functions).

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function frameRect() {
  return document.getElementById('frame').getBoundingClientRect();
}

function copyOut() {
  const out = document.getElementById('out');
  out.select();
  document.execCommand('copy');
  out.blur();
}

// Side-pane collapse: tap the floating gear button to toggle.
function togglePane() {
  const side = document.getElementById('side');
  const btn = document.getElementById('gearBtn');
  const collapsed = side.classList.toggle('collapsed');
  btn.textContent = collapsed ? '⚙' : '×';
}

// Side-pane starts collapsed on narrow viewports so the map is the
// first thing you see.
if (window.innerWidth <= 760) {
  document.getElementById('side').classList.add('collapsed');
}
